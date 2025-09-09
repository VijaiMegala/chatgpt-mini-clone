import { NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { currentUser } from "@clerk/nextjs/server";
import connectDB from "@/lib/db/mongodb";
import { User, Conversation, Message } from "@/lib/db/models";
import { streamChatResponse, manageContextWindow } from "@/lib/ai/openai";
import { MemoryManager } from "@/lib/memory/mem0";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { conversationId, activePath } = await req.json();

    if (!conversationId) {
      return new Response("Conversation ID is required", { status: 400 });
    }

    await connectDB();

    // Get Clerk user data
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return new Response("User not found in Clerk", { status: 401 });
    }

    // Get or create user in MongoDB
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = new User({
        clerkId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress || "no-email@example.com",
        firstName: clerkUser.firstName || "User",
        lastName: clerkUser.lastName || "Name",
        imageUrl: clerkUser.imageUrl || "",
      });
      await user.save();
    }

    // Get conversation
    const conversation = await Conversation.findOne({ _id: conversationId, userId });
    if (!conversation) {
      return new Response("Conversation not found", { status: 404 });
    }

    // Get conversation history for context (use provided activePath or conversation's activePath)
    const pathToUse = activePath || conversation.activePath;
    
    console.log("Regenerate - pathToUse:", pathToUse);
    console.log("Regenerate - conversation.activePath:", conversation.activePath);
    
    // Get all messages for this conversation to ensure we have the full context
    let conversationMessages = await Message.find({
      conversationId: conversation._id.toString(),
      userId
    }).sort({ timestamp: 1 });
    
    // If we have an activePath, filter to only include those messages
    if (pathToUse && pathToUse.length > 0) {
      const activePathMessages = conversationMessages.filter(msg => 
        pathToUse.includes(msg._id.toString())
      );
      if (activePathMessages.length > 0) {
        conversationMessages = activePathMessages;
      }
    }

    console.log("Regenerate - found messages:", conversationMessages.length);
    console.log("Regenerate - message details:", conversationMessages.map(msg => ({
      id: msg._id,
      role: msg.role,
      branchIndex: msg.branchIndex,
      content: msg.content?.substring(0, 30)
    })));

    if (!conversationMessages || conversationMessages.length === 0) {
      console.log("Regenerate - No conversation messages found");
      return new Response("No conversation messages found", { status: 400 });
    }

    // Get the last user message
    const lastUserMessage = conversationMessages.filter(msg => msg.role === "user").pop();
    if (!lastUserMessage) {
      console.log("Regenerate - No user message found");
      return new Response("No user message found to regenerate from", { status: 400 });
    }
    
    console.log("Regenerate - lastUserMessage:", {
      id: lastUserMessage._id,
      role: lastUserMessage.role,
      branchIndex: lastUserMessage.branchIndex,
      content: lastUserMessage.content?.substring(0, 50)
    });

    // Convert to the format expected by the AI service
    const messages = conversationMessages
      .filter(msg => msg.content && msg.content.trim().length > 0) // Filter out empty messages
      .map(msg => {
        // Build content for multimodal support
        let content: any = msg.content.trim();
        
        // Add file content if files are attached
        if (msg.files && msg.files.length > 0) {
          const contentParts: any[] = [];
          
          // Add the text content first
          if (msg.content.trim()) {
            contentParts.push({
              type: 'text',
              text: msg.content.trim()
            });
          }
          
          // Add file content - handle images and files differently
          for (const file of msg.files) {
            if (file.type.startsWith('image/')) {
              // For images, add as image_url content for multimodal processing
              contentParts.push({
                type: 'image_url',
                image_url: {
                  url: file.url,
                  detail: 'high'
                }
              });
              
              // Also add OCR text if available as additional context
              if (file.analysis?.text && file.analysis.text.trim()) {
                contentParts.push({
                  type: 'text',
                  text: `[Image: ${file.name}]\nExtracted text from image:\n${file.analysis.text}`
                });
              }
            } else {
              // For non-image files, add as text content only
              const fileText = file.analysis?.extractedText || file.analysis?.text || file.analysis?.summary || '';
              if (fileText && fileText.trim().length > 0) {
                contentParts.push({
                  type: 'text',
                  text: `[File: ${file.name}]\n\n${fileText}`
                });
              } else {
                contentParts.push({
                  type: 'text',
                  text: `[File: ${file.name}]`
                });
              }
            }
          }
          
          // If we have multiple content parts, use array format
          if (contentParts.length > 1) {
            content = contentParts;
          } else if (contentParts.length === 1) {
            content = contentParts[0].text;
          }
        }
        
        return {
          role: msg.role as "user" | "assistant" | "system",
          content: content
        };
      });

    if (messages.length === 0) {
      return new Response("No valid messages found for regeneration", { status: 400 });
    }

    // Manage context window
    const managedMessages = manageContextWindow(messages);

    // Get memory context if available
    let memoryContext = "";
    try {
      const memoryManager = new MemoryManager(userId);
      const memories = await memoryManager.searchMemories(lastUserMessage.content, 3);
      memoryContext = memories.map(m => m.content).join("\n");
    } catch (memoryError) {
      console.warn("Memory retrieval failed:", memoryError);
    }

    // Create assistant message placeholder (don't save yet)
    const assistantMessage = new Message({
      userId,
      conversationId: conversation._id.toString(),
      role: "assistant",
      content: "Generating response...", // Temporary content to pass validation
      timestamp: new Date(),
      parentId: lastUserMessage._id.toString(),
      branchIndex: (lastUserMessage.branchIndex || 0) + 1,
      isActive: true,
    });
    
    // Validate the message before saving
    try {
      await assistantMessage.validate();
      await assistantMessage.save();
    } catch (validationError) {
      console.error("Message validation error:", validationError);
      return new Response("Failed to create assistant message", { status: 500 });
    }

    // Update conversation active path
    const basePath = activePath || conversation.activePath || [];
    const newActivePath = [...basePath, assistantMessage._id.toString()];
    conversation.activePath = newActivePath;
    await conversation.save();
    
    console.log("Regenerate - updated activePath:", newActivePath);

    // Create a readable stream for Server-Sent Events
    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          const initialData = {
            type: "metadata",
            conversationId: conversation._id.toString(),
            messageId: assistantMessage._id.toString(),
            userMessageId: lastUserMessage._id.toString(),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`));

          // Stream the AI response
          for await (const chunk of streamChatResponse(managedMessages, memoryContext)) {
            fullResponse += chunk;
            
            // Send each chunk as SSE
            const chunkData = {
              type: "chunk",
              content: chunk,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkData)}\n\n`));
          }

          // Update the assistant message with the full response
          assistantMessage.content = fullResponse;
          await assistantMessage.save();

          // Update conversation timestamp
          conversation.updatedAt = new Date();
          await conversation.save();

          // Store in memory if available
          try {
            const memoryManager = new MemoryManager(userId);
            await memoryManager.addMemory(fullResponse, {
              conversationId: conversation._id.toString(),
              messageId: assistantMessage._id.toString(),
              userMessage: lastUserMessage.content
            });
          } catch (memoryError) {
            console.warn("Memory storage failed:", memoryError);
          }

          // Send completion signal
          const completionData = {
            type: "done",
            fullResponse,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`));
          controller.close();

        } catch (error) {
          console.error("Streaming error:", error);
          
          // Send error as SSE
          const errorData = {
            type: "error",
            error: "Failed to generate response",
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Error in regenerate API:", error);
    
    return new Response("Internal server error", { status: 500 });
  }
}
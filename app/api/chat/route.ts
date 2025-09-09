import { NextRequest } from "next/server";
import { getAuth, currentUser } from "@clerk/nextjs/server";
import { streamChatResponse, manageContextWindow } from "@/lib/ai/openai";
import connectDB from "@/lib/db/mongodb";
import { Conversation, Message, User } from "@/lib/db/models";
import { MemoryManager } from "@/lib/memory/mem0";
import { Types } from "mongoose";

// Force dynamic rendering to avoid caching issues
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Use getAuth for Next.js 15 compatibility
    const { userId } = getAuth(req);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { message, conversationId, files } = await req.json();
   
    if (!message) {
      return new Response("Message is required", { status: 400 });
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
      // Create user record with Clerk data
      user = new User({
        clerkId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress || "no-email@example.com",
        firstName: clerkUser.firstName || "User",
        lastName: clerkUser.lastName || "Name",
        imageUrl: clerkUser.imageUrl || "",
      });
      await user.save();
    } else {
      // Update user data if it has changed
      const needsUpdate = 
        user.email !== (clerkUser.emailAddresses[0]?.emailAddress || "no-email@example.com") ||
        user.firstName !== (clerkUser.firstName || "User") ||
        user.lastName !== (clerkUser.lastName || "Name") ||
        user.imageUrl !== (clerkUser.imageUrl || "");

      if (needsUpdate) {
        user.email = clerkUser.emailAddresses[0]?.emailAddress || "no-email@example.com";
        user.firstName = clerkUser.firstName || "User";
        user.lastName = clerkUser.lastName || "Name";
        user.imageUrl = clerkUser.imageUrl || "";
        await user.save();
      }
    }

    // Get or create conversation
    let conversation;
    if (conversationId && Types.ObjectId.isValid(conversationId)) {
      conversation = await Conversation.findOne({ _id: conversationId, userId });
    }
    
    if (!conversation) {
      conversation = new Conversation({
        userId,
        title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
        activePath: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await conversation.save();
    }

    // Get the last message in the active path to determine parent and branch index
    let lastActiveMessage = null;
    if (conversation.activePath && conversation.activePath.length > 0) {
      lastActiveMessage = await Message.findOne({ 
        _id: conversation.activePath[conversation.activePath.length - 1],
        userId 
      });
    }

    // Create user message
    const userMessage = new Message({
      userId,
      conversationId: conversation._id.toString(),
      role: "user",
      content: message,
      timestamp: new Date(),
      parentId: lastActiveMessage?._id.toString(),
      branchIndex: lastActiveMessage ? lastActiveMessage.branchIndex + 1 : 0,
      isActive: true,
      files: (files || []).map((file: any) => ({
        ...file,
        uploadedAt: new Date()
      })),
    });
    await userMessage.save();

    // Update conversation active path
    if (!conversation.activePath) {
      conversation.activePath = [];
    }
    conversation.activePath.push(userMessage._id.toString());
    await conversation.save();

    // Get conversation history for context (only active path messages)
    let conversationMessages;
    if (conversation.activePath && conversation.activePath.length > 0) {
      conversationMessages = await Message.find({
        conversationId: conversation._id.toString(),
        _id: { $in: conversation.activePath }
      }).sort({ branchIndex: 1 });
    } else {
      // Fallback: get all messages for this conversation
      conversationMessages = await Message.find({
        conversationId: conversation._id.toString(),
        userId
      }).sort({ timestamp: 1 });
    }

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
      return new Response("No valid messages found for context", { status: 400 });
    }

    // Manage context window
    const managedMessages = manageContextWindow(messages);

    // Get memory context if available
    let memoryContext = "";
    try {
      const memoryManager = new MemoryManager(userId);
      const memories = await memoryManager.searchMemories(message, 3);
      memoryContext = memories.map(m => m.content).join("\n");
    } catch (memoryError) {
      console.warn("Memory retrieval failed:", memoryError);
    }

    // Create assistant message placeholder
    const assistantMessage = new Message({
      userId,
      conversationId: conversation._id.toString(),
      role: "assistant",
      content: "Generating response...", // Temporary content to pass validation
      timestamp: new Date(),
      parentId: userMessage._id.toString(),
      branchIndex: userMessage.branchIndex + 1,
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
    conversation.activePath.push(assistantMessage._id.toString());
    await conversation.save();

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
            userMessageId: userMessage._id.toString(),
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
              userMessage: message
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
    console.error("Error in chat API:", error);
    
    return new Response("Internal server error", { status: 500 });
  }
}
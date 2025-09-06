import { NextRequest, NextResponse } from "next/server";
import { getAuth, currentUser } from "@clerk/nextjs/server";
import { generateChatResponse, manageContextWindow } from "@/lib/ai/openrouter";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, conversationId, files } = await req.json();
   
    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Get Clerk user data
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json(
        { error: "User not found in Clerk" },
        { status: 401 }
      );
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
    } else {
      conversation = new Conversation({
        userId,
        title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
      });
      await conversation.save();
    }

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Save user message
    const userMessage = new Message({
      conversationId: conversation._id.toString(),
      userId,
      role: "user",
      content: message,
      files: files || [],
    });
    await userMessage.save();

    // Get conversation history for context
    const conversationMessages = await Message.find({
      conversationId: conversation._id.toString(),
    }).sort({ timestamp: 1 });

    // Get memory context
    const memoryManager = new MemoryManager(userId);
    const conversationHistory = conversationMessages.map(msg => msg.content);
    const memoryContext = await memoryManager.getContextForConversation(
      conversationHistory,
      conversation._id.toString()
    );

    // Prepare messages for AI with file content analysis
    const messages = conversationMessages.map(msg => {
      let content = msg.content;
      
      // Add file analysis to user messages
      if (msg.role === "user" && msg.files && msg.files.length > 0) {
        const fileAnalysis = msg.files.map((file: any) => {
          if (file.analysis?.summary) {
            return `[File: ${file.name}] ${file.analysis.summary}`;
          }
          return `[File: ${file.name}]`;
        }).join('\n');
        
        if (fileAnalysis) {
          content = `${content}\n\nAttached files:\n${fileAnalysis}`;
        }
      }
      
      return {
        role: msg.role as "user" | "assistant",
        content,
      };
    });

    // Add system prompt for better file handling
    const hasFiles = conversationMessages.some(msg => msg.role === "user" && msg.files && msg.files.length > 0);
    if (hasFiles) {
      messages.unshift({
        role: "system" as unknown as "user" | "assistant",
        content: "You are a helpful AI assistant that can analyze and respond to various types of files including images, documents, and text files. When users attach files, pay attention to the file analysis provided and respond appropriately to the content. For images, describe what you see and answer questions about the visual content. For documents, help extract and analyze the information. Always be helpful and detailed in your responses about file contents.",
      });
    }

    // Add memory context if available
    if (memoryContext) {
      messages.unshift({
        role: "system" as unknown as "user" | "assistant",
        content: `Previous context: ${memoryContext}`,
      });
    }

    // Manage context window
    const managedMessages = manageContextWindow(messages);

    // Generate AI response
    const response = await generateChatResponse(managedMessages);

    // Save assistant message
    const assistantMessage = new Message({
      conversationId: conversation._id.toString(),
      userId,
      role: "assistant",
      content: response,
    });
    await assistantMessage.save();

    // Store important information in memory
    try {
      await memoryManager.addMemory(
        `User asked: ${message}. Assistant responded: ${response}`,
        {
          conversationId: conversation._id.toString(),
          messageId: assistantMessage._id.toString(),
          timestamp: new Date().toISOString(),
        }
      );
    } catch (memoryError) {
      console.error("Error storing memory:", memoryError);
      // Don't fail the request if memory storage fails
    }

    // Update conversation timestamp
    await Conversation.findByIdAndUpdate(conversation._id, {
      updatedAt: new Date(),
    });

    return NextResponse.json({
      response,
      conversationId: conversation._id.toString(),
      messageId: assistantMessage._id.toString(),
      userMessageId: userMessage._id.toString(),
    });

  } catch (error) {
    console.error("Error in chat API:", error);
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

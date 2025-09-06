import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { currentUser } from "@clerk/nextjs/server";
import connectDB from "@/lib/db/mongodb";
import { User, Conversation, Message } from "@/lib/db/models";
import { generateChatResponse, manageContextWindow } from "@/lib/ai/openrouter";
import { MemoryManager } from "@/lib/memory/mem0";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId, conversationId, previousContext } = await req.json();

    if (!messageId || !conversationId) {
      return NextResponse.json(
        { error: "Message ID and conversation ID are required" },
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
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get the message to regenerate
    const messageToRegenerate = await Message.findOne({ _id: messageId, userId });
    if (!messageToRegenerate) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Get conversation history for context
    const conversationMessages = await Message.find({
      conversationId: conversation._id.toString(),
    }).sort({ timestamp: 1 });

    // Find the user message that this assistant message is responding to
    const messageIndex = conversationMessages.findIndex(msg => msg._id.toString() === messageId);
    if (messageIndex === -1) {
      return NextResponse.json(
        { error: "Message not found in conversation" },
        { status: 404 }
      );
    }

    const userMessage = conversationMessages[messageIndex - 1];
    if (!userMessage || userMessage.role !== "user") {
      return NextResponse.json(
        { error: "User message not found" },
        { status: 404 }
      );
    }

    // Use the latest user message content from database
    const latestUserMessage = userMessage.content;

    // Get memory context
    const memoryManager = new MemoryManager(userId);
    const conversationHistory = conversationMessages.map(msg => msg.content);
    const memoryContext = await memoryManager.getContextForConversation(
      conversationHistory,
      conversation._id.toString()
    );

    // Prepare messages for AI
    const messages = conversationMessages.map(msg => {
      let content = msg.content;
      
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

    // Create new version with previous context
    const newVersion = {
      content: response,
      timestamp: new Date(),
      isCurrent: true,
      isContextVersion: false,
      contextMessages: []
    };

    // Create previous context version
    const previousVersion = {
      content: "Previous context",
      timestamp: new Date(),
      isCurrent: false,
      isContextVersion: true,
      contextMessages: previousContext || []
    };

    // Update the message with new versions
    const updatedVersions = [
      newVersion,
      previousVersion,
      ...(messageToRegenerate.versions || []).map((v: any) => ({ ...v, isCurrent: false }))
    ];

    await Message.findByIdAndUpdate(messageId, {
      content: response,
      versions: updatedVersions,
      currentVersionIndex: 0,
      edited: true,
      timestamp: new Date()
    });

    // Store important information in memory
    try {
      await memoryManager.addMemory(
        `User asked: ${latestUserMessage}. Assistant responded: ${response}`,
        {
          conversationId: conversation._id.toString(),
          messageId: messageToRegenerate._id.toString(),
          timestamp: new Date().toISOString(),
        }
      );
    } catch (memoryError) {
      console.error("Error storing memory:", memoryError);
    }

    // Update conversation timestamp
    await Conversation.findByIdAndUpdate(conversation._id, {
      updatedAt: new Date(),
    });

    return NextResponse.json({
      response,
      conversationId: conversation._id.toString(),
      messageId: messageToRegenerate._id.toString(),
    });

  } catch (error) {
    console.error("Error in regenerate API:", error);
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import connectDB from "@/lib/db/mongodb";
import { Message } from "@/lib/db/models";
import { Types } from "mongoose";

// Force dynamic rendering to avoid caching issues
export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { id } = await params;
    const { content } = await req.json();

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid message ID format" },
        { status: 400 }
      );
    }

    const message = await Message.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId },
      { 
        content,
        edited: true,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        id: message._id,
        content: message.content,
        edited: message.edited,
        updatedAt: message.updatedAt
      }
    });

  } catch (error) {
    console.error("Error updating message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import connectDB from "@/lib/db/mongodb";
import { Conversation } from "@/lib/db/models";

// Force dynamic rendering to avoid caching issues
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select("_id title updatedAt createdAt");

    return NextResponse.json(conversations);

  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { title } = await req.json();

    const conversation = new Conversation({
      userId,
      title: title || "New Chat",
    });

    await conversation.save();

    return NextResponse.json(conversation);

  } catch (error) {
    console.error("Error creating conversation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

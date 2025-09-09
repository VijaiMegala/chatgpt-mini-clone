import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import connectDB from "@/lib/db/mongodb";
import { Conversation, Message } from "@/lib/db/models";

export const dynamic = 'force-dynamic';

// Get all available conversation paths (branches)
export async function GET(
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

    const conversation = await Conversation.findOne({
      _id: id,
      userId,
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get all messages for this conversation
    const allMessages = await Message.find({
      conversationId: id,
      userId,
    }).sort({ timestamp: 1 });

    // Build tree structure and find all possible paths
    const messageMap = new Map();
    allMessages.forEach(msg => {
      messageMap.set(msg._id.toString(), msg);
    });

    // Find all possible conversation paths
    const paths = [];
    
    console.log("All messages:", allMessages.map(msg => ({
      id: msg._id.toString(),
      role: msg.role,
      parentId: msg.parentId,
      branchIndex: msg.branchIndex,
      content: msg.content?.substring(0, 20)
    })));
    
    // Look for regeneration branches (multiple assistant messages responding to the same user message)
    const regenerationBranches = new Map();
    
    allMessages.forEach(msg => {
      if (msg.parentId && msg.role === 'assistant') {
        if (!regenerationBranches.has(msg.parentId)) {
          regenerationBranches.set(msg.parentId, []);
        }
        regenerationBranches.get(msg.parentId).push(msg);
      }
    });
    
    console.log("Regeneration branches found:", regenerationBranches.size);
    for (const [parentId, branchMessages] of regenerationBranches) {
      console.log(`Parent ${parentId} has ${branchMessages.length} assistant branches:`, 
        branchMessages.map((msg: any) => ({ id: msg._id.toString(), role: msg.role, branchIndex: msg.branchIndex })));
    }
    
    // If we have regeneration branches, create paths for each branch
    if (regenerationBranches.size > 0) {
      let pathIndex = 0;
      const seenPaths = new Set<string>();
      
      // For each regeneration branch point, create a path for each assistant response
      for (const [parentId, branchMessages] of regenerationBranches) {
        // Sort by branchIndex to ensure consistent ordering
        const sortedBranches = branchMessages.sort((a: any, b: any) => (a.branchIndex || 0) - (b.branchIndex || 0));
        
        // Get the user message that these assistant messages are responding to
        const userMessage = messageMap.get(parentId);
        if (!userMessage) continue;
        
        // Build the common history (all messages up to and including the user message)
        const commonHistory: string[] = [];
        const buildCommonHistory = (messageId: string) => {
          const message = messageMap.get(messageId);
          if (!message) return;
          
          if (message.parentId) {
            buildCommonHistory(message.parentId);
          }
          commonHistory.push(messageId);
        };
        buildCommonHistory(userMessage._id.toString());
        
        // Create a path for each branch (including common history)
        for (const branchMsg of sortedBranches) {
          // Build the full path: common history + this branch + subsequent messages
          const fullPath = [...commonHistory, branchMsg._id.toString()];
          
          // Add subsequent messages in this branch
          const buildSubsequent = (messageId: string) => {
            const message = messageMap.get(messageId);
            if (!message) return;
            
            const nextMessage = Array.from(messageMap.values()).find(msg => 
              msg.parentId === messageId && 
              msg.branchIndex === (message.branchIndex + 1) &&
              msg.isActive !== false
            );
            
            if (nextMessage) {
              fullPath.push(nextMessage._id.toString());
              buildSubsequent(nextMessage._id.toString());
            }
          };
          buildSubsequent(branchMsg._id.toString());
          
          // Create a unique identifier for this path to avoid duplicates
          const pathKey = fullPath.join(',');
          if (!seenPaths.has(pathKey)) {
            seenPaths.add(pathKey);
            paths.push({
              id: `path_${pathIndex}`,
              messages: fullPath,
              isActive: fullPath.every(msgId => conversation.activePath.includes(msgId))
            });
            pathIndex++;
          }
        }
      }
    }
    
    // If no branches found, create a single path from the first message
    if (paths.length === 0 && allMessages.length > 0) {
      const singlePath = buildPathFromBranch(allMessages[0], messageMap);
      if (singlePath.length > 0) {
        paths.push({
          id: 'path_0',
          messages: singlePath,
          isActive: singlePath.every(msgId => conversation.activePath.includes(msgId))
        });
      }
    }

    console.log("Path detection - found paths:", paths.length);
    console.log("Path detection - paths:", paths.map(p => ({
      id: p.id,
      messageCount: p.messages.length,
      isActive: p.isActive
    })));

    return NextResponse.json({
      conversationId: id,
      activePath: conversation.activePath,
      paths,
      totalPaths: paths.length
    });

  } catch (error) {
    console.error("Error fetching conversation paths:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Switch to a different conversation path
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { pathId, messageIds } = await req.json();

    console.log('POST /api/conversations/[id]/path - Request data:', { id, pathId, messageIds });

    if (!pathId && !messageIds) {
      console.log('POST /api/conversations/[id]/path - Missing pathId and messageIds');
      return NextResponse.json(
        { error: "Either pathId or messageIds is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const conversation = await Conversation.findOne({
      _id: id,
      userId,
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    let newActivePath: string[] = [];

    if (messageIds) {
      // Direct path provided
      newActivePath = messageIds;
    } else {
      // Find path by pathId
      const allMessages = await Message.find({
        conversationId: id,
        userId,
      }).sort({ timestamp: 1 });

      const messageMap = new Map();
      allMessages.forEach(msg => {
        messageMap.set(msg._id.toString(), msg);
      });

      const paths = [];

      // Look for regeneration branches (multiple assistant messages responding to the same user message)
      const regenerationBranches = new Map();

      allMessages.forEach(msg => {
        if (msg.parentId && msg.role === 'assistant') {
          if (!regenerationBranches.has(msg.parentId)) {
            regenerationBranches.set(msg.parentId, []);
          }
          regenerationBranches.get(msg.parentId).push(msg);
        }
      });

      console.log('POST /api/conversations/[id]/path - Found regeneration branches:', regenerationBranches.size);

      // If we have regeneration branches, create paths for each branch
      if (regenerationBranches.size > 0) {
        let pathIndex = 0;
        const seenPaths = new Set<string>();

        // For each regeneration branch point, create a path for each assistant response
        for (const [parentId, branchMessages] of regenerationBranches) {
          // Sort by branchIndex to ensure consistent ordering
          const sortedBranches = branchMessages.sort((a: any, b: any) => (a.branchIndex || 0) - (b.branchIndex || 0));
          
          // Get the user message that these assistant messages are responding to
          const userMessage = messageMap.get(parentId);
          if (!userMessage) continue;
          
          // Build the common history (all messages up to and including the user message)
          const commonHistory: string[] = [];
          const buildCommonHistory = (messageId: string) => {
            const message = messageMap.get(messageId);
            if (!message) return;
            
            if (message.parentId) {
              buildCommonHistory(message.parentId);
            }
            commonHistory.push(messageId);
          };
          buildCommonHistory(userMessage._id.toString());
          
          // Create a path for each branch (including common history)
          for (const branchMsg of sortedBranches) {
            // Build the full path: common history + this branch + subsequent messages
            const fullPath = [...commonHistory, branchMsg._id.toString()];
            
            // Add subsequent messages in this branch
            const buildSubsequent = (messageId: string) => {
              const message = messageMap.get(messageId);
              if (!message) return;
              
              const nextMessage = Array.from(messageMap.values()).find(msg => 
                msg.parentId === messageId && 
                msg.branchIndex === (message.branchIndex + 1) &&
                msg.isActive !== false
              );
              
              if (nextMessage) {
                fullPath.push(nextMessage._id.toString());
                buildSubsequent(nextMessage._id.toString());
              }
            };
            buildSubsequent(branchMsg._id.toString());
            
            // Create a unique identifier for this path to avoid duplicates
            const pathKey = fullPath.join(',');
            if (!seenPaths.has(pathKey)) {
              seenPaths.add(pathKey);
              paths.push({
                id: `path_${pathIndex}`,
                messages: fullPath,
                isActive: fullPath.every(msgId => conversation.activePath.includes(msgId))
              });
              pathIndex++;
            }
          }
        }
      }

      // If no branches found, create a single path from the first message
      if (paths.length === 0 && allMessages.length > 0) {
        const singlePath = buildPathFromBranch(allMessages[0], messageMap);
        if (singlePath.length > 0) {
          paths.push({
            id: 'path_0',
            messages: singlePath,
            isActive: singlePath.every(msgId => conversation.activePath.includes(msgId))
          });
        }
      }

      console.log('POST /api/conversations/[id]/path - Generated paths:', paths.length);

      const selectedPath = paths.find(p => p.id === pathId);
      if (!selectedPath) {
        console.log('POST /api/conversations/[id]/path - Path not found:', pathId, 'Available paths:', paths.map(p => p.id));
        return NextResponse.json(
          { error: "Path not found" },
          { status: 404 }
        );
      }
      newActivePath = selectedPath.messages;
      console.log('POST /api/conversations/[id]/path - Selected path messages:', newActivePath.length);
    }

    // Update conversation active path
    conversation.activePath = newActivePath;
    await conversation.save();

    // Update message active status
    await Message.updateMany(
      { conversationId: id, userId },
      { isActive: false }
    );

    if (newActivePath.length > 0) {
      await Message.updateMany(
        { 
          conversationId: id, 
          userId,
          _id: { $in: newActivePath }
        },
        { isActive: true }
      );
    }

    // Get the active messages for the new path
    const activeMessages = await Message.find({
      conversationId: id,
      userId,
      _id: { $in: newActivePath }
    }).sort({ branchIndex: 1 });

    return NextResponse.json({
      success: true,
      activePath: newActivePath,
      messages: activeMessages
    });

  } catch (error) {
    console.error("Error switching conversation path:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to build a conversation path from a branch message
function buildPathFromBranch(branchMsg: any, messageMap: Map<string, any>): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  
  // Find the user message that this assistant message is responding to
  const userMessage = messageMap.get(branchMsg.parentId);
  if (!userMessage) {
    // If no parent user message, just return the branch message
    return [branchMsg._id.toString()];
  }
  
  // Build the path backwards to include all messages up to and including the user message
  const buildBackwards = (messageId: string) => {
    if (visited.has(messageId)) return;
    visited.add(messageId);
    
    const message = messageMap.get(messageId);
    if (!message) return;
    
    // If this message has a parent, build backwards first
    if (message.parentId) {
      buildBackwards(message.parentId);
    }
    
    // Add this message to the path
    path.push(messageId);
  };
  
  // Build backwards from the user message to include the full conversation history
  buildBackwards(userMessage._id.toString());
  
  // Add the branch message itself (the regenerated assistant response)
  path.push(branchMsg._id.toString());
  
  // Then build forwards from the branch message (subsequent messages in this branch)
  const buildForwards = (messageId: string) => {
    if (visited.has(messageId)) return;
    visited.add(messageId);
    
    const message = messageMap.get(messageId);
    if (!message) return;
    
    // Find the next message in this specific branch
    const nextMessage = Array.from(messageMap.values()).find(msg => 
      msg.parentId === messageId && 
      msg.branchIndex === (message.branchIndex + 1) &&
      msg.isActive !== false // Only include active messages
    );
    
    if (nextMessage) {
      path.push(nextMessage._id.toString());
      buildForwards(nextMessage._id.toString());
    }
  };
  
  // Build forwards from the branch message
  buildForwards(branchMsg._id.toString());
  
  return path;
}

// Helper function to build a conversation path from a root message
function buildPathFromRoot(rootId: string, messageMap: Map<string, any>): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  
  function traverse(messageId: string) {
    if (visited.has(messageId)) return;
    visited.add(messageId);
    
    const message = messageMap.get(messageId);
    if (!message) return;
    
    path.push(messageId);
    
    // Find the next message in the conversation flow
    const nextMessage = Array.from(messageMap.values()).find(msg => 
      msg.parentId === messageId && 
      msg.branchIndex === (message.branchIndex + 1)
    );
    
    if (nextMessage) {
      traverse(nextMessage._id.toString());
    }
  }
  
  traverse(rootId);
  return path;
}

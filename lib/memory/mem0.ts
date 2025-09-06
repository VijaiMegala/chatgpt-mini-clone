import connectDB from "@/lib/db/mongodb";
import { Memory, IMemory } from "@/lib/db/models";

export interface MemoryEntry {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class MemoryManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async addMemory(content: string, metadata?: Record<string, any>): Promise<MemoryEntry> {
    try {
      await connectDB();
      
      const memory = new Memory({
        userId: this.userId,
        content,
        metadata,
        conversationId: metadata?.conversationId,
        messageId: metadata?.messageId,
      });
      
      const savedMemory = await memory.save();
      
      return {
        id: savedMemory._id.toString(),
        content: savedMemory.content,
        metadata: savedMemory.metadata,
        created_at: savedMemory.createdAt.toISOString(),
        updated_at: savedMemory.updatedAt.toISOString(),
      };
    } catch (error) {
      console.error("Error adding memory:", error);
      throw new Error("Failed to add memory");
    }
  }

  async searchMemories(query: string, limit: number = 5): Promise<MemoryEntry[]> {
    try {
      await connectDB();
      
      // Escape special regex characters in the query
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // MongoDB text search
      const memories = await Memory.find({
        userId: this.userId,
        $or: [
          { content: { $regex: escapedQuery, $options: 'i' } },
          { 'metadata.conversationId': { $regex: escapedQuery, $options: 'i' } }
        ]
      })
      .sort({ updatedAt: -1 })
      .limit(limit);
      
      return memories.map(memory => ({
        id: memory._id.toString(),
        content: memory.content,
        metadata: memory.metadata,
        created_at: memory.createdAt.toISOString(),
        updated_at: memory.updatedAt.toISOString(),
      }));
    } catch (error) {
      console.error("Error searching memories:", error);
      return [];
    }
  }

  async getMemories(limit: number = 20): Promise<MemoryEntry[]> {
    try {
      await connectDB();
      
      const memories = await Memory.find({ userId: this.userId })
        .sort({ updatedAt: -1 })
        .limit(limit);
      
      return memories.map(memory => ({
        id: memory._id.toString(),
        content: memory.content,
        metadata: memory.metadata,
        created_at: memory.createdAt.toISOString(),
        updated_at: memory.updatedAt.toISOString(),
      }));
    } catch (error) {
      console.error("Error getting memories:", error);
      return [];
    }
  }

  async updateMemory(memoryId: string, content: string, metadata?: Record<string, any>): Promise<MemoryEntry> {
    try {
      await connectDB();
      
      const memory = await Memory.findOneAndUpdate(
        { _id: memoryId, userId: this.userId },
        { 
          content, 
          metadata,
          conversationId: metadata?.conversationId,
          messageId: metadata?.messageId,
        },
        { new: true }
      );
      
      if (!memory) {
        throw new Error("Memory not found");
      }

      return {
        id: memory._id.toString(),
        content: memory.content,
        metadata: memory.metadata,
        created_at: memory.createdAt.toISOString(),
        updated_at: memory.updatedAt.toISOString(),
      };
    } catch (error) {
      console.error("Error updating memory:", error);
      throw new Error("Failed to update memory");
    }
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      await connectDB();
      
      const result = await Memory.findOneAndDelete({
        _id: memoryId,
        userId: this.userId
      });
      
      return !!result;
    } catch (error) {
      console.error("Error deleting memory:", error);
      return false;
    }
  }

  async getContextForConversation(conversationHistory: string[], conversationId?: string): Promise<string> {
    try {
      // Search for relevant memories based on conversation history
      const recentMessages = conversationHistory.slice(-3).join(" ");
      const relevantMemories = await this.searchMemories(recentMessages, 3);
      
      // Also get memories specific to this conversation if conversationId is provided
      let conversationMemories: MemoryEntry[] = [];
      if (conversationId) {
        await connectDB();
        const memories = await Memory.find({
          userId: this.userId,
          conversationId: conversationId
        })
        .sort({ updatedAt: -1 })
        .limit(2);
        
        conversationMemories = memories.map(memory => ({
          id: memory._id.toString(),
          content: memory.content,
          metadata: memory.metadata,
          created_at: memory.createdAt.toISOString(),
          updated_at: memory.updatedAt.toISOString(),
        }));
      }
      
      const allMemories = [...relevantMemories, ...conversationMemories];
      
      if (allMemories.length === 0) {
        return "";
      }

      // Remove duplicates and return unique memories
      const uniqueMemories = allMemories.filter((memory, index, self) => 
        index === self.findIndex(m => m.id === memory.id)
      );

      return uniqueMemories
        .map(memory => memory.content)
        .join("\n");
    } catch (error) {
      console.error("Error getting context:", error);
      return "";
    }
  }
}

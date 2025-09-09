// OpenAI AI service for ChatGPT Clone using Vercel AI SDK
import { openai } from "@ai-sdk/openai";
import { generateText, streamText, type CoreMessage } from "ai";
import OpenAI from "openai";

export interface MultimodalMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
      detail?: 'low' | 'high' | 'auto';
    };
  }>;
}

// Helper function to check if messages contain multimodal content
function hasMultimodalContent(messages: Array<MultimodalMessage>): boolean {
  return messages.some(msg => 
    Array.isArray(msg.content) && 
    msg.content.some(part => part.type === 'image_url')
  );
}

// Generate response using direct OpenAI API for multimodal content
async function generateMultimodalResponse(
  messages: Array<MultimodalMessage>,
  context?: string
): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Convert messages to OpenAI format
  const openaiMessages = messages.map(msg => ({
    role: msg.role as "user" | "assistant" | "system",
    content: typeof msg.content === 'string' ? msg.content : msg.content
  }));

  // Add context if provided
  if (context) {
    openaiMessages.unshift({
      role: "system",
      content: `Context: ${context}`
    });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: openaiMessages as any,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || "";
}

export async function generateChatResponse(
  messages: Array<MultimodalMessage>,
  context?: string
) {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Check if we have multimodal content
    if (hasMultimodalContent(messages)) {
      // Use direct OpenAI API for multimodal content
      return await generateMultimodalResponse(messages, context);
    }

    // Convert messages to the format expected by Vercel AI SDK for text-only content
    const formattedMessages = messages.map(msg => ({
      role: msg.role as "user" | "assistant" | "system",
      content: typeof msg.content === 'string' ? msg.content : 
        Array.isArray(msg.content) ? 
          msg.content.filter(part => part.type === 'text').map(part => part.text).join(' ') : 
          msg.content
    })) as CoreMessage[];

    // Add context if provided
    if (context) {
      formattedMessages.unshift({
        role: "system",
        content: `Context: ${context}`
      });
    }

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages: formattedMessages,
      temperature: 0.7,
    });

    return text;

  } catch (error) {
    console.error("OpenAI API error:", error);
    throw error;
  }
}

export async function* streamChatResponse(
  messages: Array<MultimodalMessage>,
  context?: string
) {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Check if we have multimodal content
    if (hasMultimodalContent(messages)) {
      // For multimodal content, generate response and yield it as chunks
      const response = await generateMultimodalResponse(messages, context);
      
      // Simulate streaming by yielding the response in chunks
      const chunkSize = 50;
      for (let i = 0; i < response.length; i += chunkSize) {
        yield response.slice(i, i + chunkSize);
      }
      return;
    }

    // Convert messages to the format expected by Vercel AI SDK for text-only content
    const formattedMessages = messages.map(msg => ({
      role: msg.role as "user" | "assistant" | "system",
      content: typeof msg.content === 'string' ? msg.content : 
        Array.isArray(msg.content) ? 
          msg.content.filter(part => part.type === 'text').map(part => part.text).join(' ') : 
          msg.content
    })) as CoreMessage[];

    // Add context if provided
    if (context) {
      formattedMessages.unshift({
        role: "system",
        content: `Context: ${context}`
      });
    }

    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages: formattedMessages,
      temperature: 0.7,
    });

    // Yield each chunk from the text stream
    for await (const chunk of result.textStream) {
      yield chunk;
    }

  } catch (error) {
    console.error("OpenAI streaming error:", error);
    throw error;
  }
}

// Context window management for OpenAI
export function manageContextWindow(
  messages: Array<MultimodalMessage>,
  maxTokens: number = 8000
): Array<MultimodalMessage> {
  // Simple token estimation (rough approximation: 1 token ≈ 4 characters)
  let totalTokens = 0;
  const managedMessages: MultimodalMessage[] = [];
  
  // Always keep system messages
  const systemMessages = messages.filter(msg => msg.role === "system");
  managedMessages.push(...systemMessages);
  totalTokens += systemMessages.reduce((sum, msg) => {
    if (Array.isArray(msg.content)) {
      return sum + msg.content.reduce((contentSum, content) => {
        if (content.type === 'text' && content.text) {
          return contentSum + Math.ceil(content.text.length / 4);
        }
        return contentSum + 100; // Estimate for images
      }, 0);
    } else {
      return sum + Math.ceil(msg.content.length / 4);
    }
  }, 0);
  
  // Process messages from newest to oldest, keeping within token limit
  const nonSystemMessages = messages.filter(msg => msg.role !== "system").reverse();
  
  for (const message of nonSystemMessages) {
    let messageTokens = 0;
    
    if (Array.isArray(message.content)) {
      messageTokens = message.content.reduce((sum, content) => {
        if (content.type === 'text' && content.text) {
          return sum + Math.ceil(content.text.length / 4);
        }
        return sum + 100; // Estimate for images
      }, 0);
    } else {
      messageTokens = Math.ceil(message.content.length / 4);
    }
    
    if (totalTokens + messageTokens > maxTokens) {
      break;
    }
    
    managedMessages.unshift(message); // Add to beginning to maintain chronological order
    totalTokens += messageTokens;
  }
  
  return managedMessages;
}

// Test function to verify OpenAI connection
export async function testOpenAIConnection(): Promise<{ success: boolean; model?: string; error?: string }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY not configured" };
    }

    const testMessages = [
      { role: "user" as const, content: "Hello, this is a test message. Please respond with 'Test successful'." }
    ];

    const response = await generateChatResponse(testMessages);
    
    if (response && response.length > 0) {
      return { success: true, model: "gpt-4o-mini" };
    } else {
      return { success: false, error: "Empty response received" };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
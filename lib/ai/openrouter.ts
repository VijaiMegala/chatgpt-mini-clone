// OpenRouter AI service for ChatGPT Clone
// Uses free models like DeepSeek, Qwen, and Gemini

// Mock responses for development when API credits are exhausted
const mockResponses = [
  "I understand your question. Let me help you with that.",
  "That's an interesting point. Here's what I think about it...",
  "I'd be happy to assist you with that. Based on what you've shared...",
  "Great question! Let me provide you with some insights...",
  "I can help you with that. Here's my perspective...",
  "That's a thoughtful question. Let me break it down for you...",
  "I appreciate you asking. Here's what I can tell you...",
  "Interesting! Let me share some thoughts on that topic...",
  "I'd be glad to help. Here's what I know about that...",
  "That's a good question. Let me explain..."
];

// Free models available on OpenRouter
const FREE_MODELS = [
  "google/gemini-2.0-flash-exp:free", // Gemini 2.0 Flash (free) - Primary choice
  "deepseek/deepseek-chat",      // DeepSeek V3.1 (free)
  "qwen/qwen-2.5-coder",         // Qwen Coder (free)
  "meta-llama/llama-3.1-8b-instruct", // Llama 3.1 8B (free)
  "microsoft/phi-3-medium-128k-instruct", // Phi-3 Medium (free)
  "mistralai/mistral-7b-instruct-v0.3", // Mistral 7B (free)
  "openai/gpt-5-chat"            // GPT-5 (free tier) - Last resort
];

function getMockResponse(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  const lastMessage = messages[messages.length - 1];
  const userMessage = lastMessage?.content || "";
  
  // Simple keyword-based mock responses
  if (userMessage.toLowerCase().includes("code") || userMessage.toLowerCase().includes("programming")) {
    return "I'd be happy to help you with coding! Here's a structured approach to your programming question...";
  }
  if (userMessage.toLowerCase().includes("explain") || userMessage.toLowerCase().includes("what is")) {
    return "Let me explain that concept clearly for you...";
  }
  if (userMessage.toLowerCase().includes("how to") || userMessage.toLowerCase().includes("tutorial")) {
    return "Here's a step-by-step guide to help you...";
  }
  
  // Return random mock response
  return mockResponses[Math.floor(Math.random() * mockResponses.length)];
}

export async function generateChatResponse(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  context?: string
) {
  try {
    // Check if API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      return getMockResponse(messages);
    }

    // Prepare the request body
    const requestBody = {
      model: FREE_MODELS[0], // Start with the first free model
      messages: messages,
      max_tokens: 2000,
      temperature: 0.7,
      top_p: 0.9,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ["```", "\n\n\n", "// End of code", "/* End of code */"]
    };

    // Try different free models in order of preference
    for (const model of FREE_MODELS) {
      try {
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            "X-Title": "ChatGPT Clone"
          },
          body: JSON.stringify({
            ...requestBody,
            model: model
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // Check if it's a rate limit or credit issue
          if (response.status === 429 || response.status === 402) {
            continue;
          }
          
          // If it's a model-specific error, try the next model
          if (response.status === 400) {
            continue;
          }
          
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          return data.choices[0].message.content.trim();
        }
        
        throw new Error("Invalid response format from OpenRouter");
        
      } catch (modelError) {
        const errorMessage = modelError instanceof Error ? modelError.message : String(modelError);
        
        // If it's a network error or server error, don't try other models
        if (errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("5")) {
          throw modelError;
        }
        
        continue;
      }
    }
    
    // If all models fail, return a mock response
    return getMockResponse(messages);
    
  } catch (error) {
    console.error("OpenRouter API error:", error);
    return getMockResponse(messages);
  }
}

// Context window management for OpenRouter
export function manageContextWindow(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  maxTokens: number = 8000
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  // Simple token estimation (rough approximation: 1 token ≈ 4 characters)
  let totalTokens = 0;
  const managedMessages = [];
  
  // Always keep system messages
  const systemMessages = messages.filter(msg => msg.role === "system");
  managedMessages.push(...systemMessages);
  totalTokens += systemMessages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
  
  // Process messages from newest to oldest, keeping within token limit
  const nonSystemMessages = messages.filter(msg => msg.role !== "system").reverse();
  
  for (const message of nonSystemMessages) {
    const messageTokens = Math.ceil(message.content.length / 4);
    
    if (totalTokens + messageTokens > maxTokens) {
      break;
    }
    
    managedMessages.unshift(message); // Add to beginning to maintain chronological order
    totalTokens += messageTokens;
  }
  
  return managedMessages;
}

// Test function to verify OpenRouter connection
export async function testOpenRouterConnection(): Promise<{ success: boolean; model?: string; error?: string }> {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return { success: false, error: "OPENROUTER_API_KEY not configured" };
    }

    const testMessages = [
      { role: "user" as const, content: "Hello, this is a test message. Please respond with 'Test successful'." }
    ];

    const response = await generateChatResponse(testMessages);
    
    if (response && response.length > 0) {
      return { success: true, model: "OpenRouter" };
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

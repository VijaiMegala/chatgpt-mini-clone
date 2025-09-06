"use client";

import { useState, useRef, useEffect } from "react";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Menu, Plus, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  edited?: boolean;
  files?: UploadedFile[];
  versions?: {
    content: string;
    timestamp: Date;
    isCurrent?: boolean;
    isContextVersion?: boolean;
    contextMessages?: {
      id: string;
      role: "user" | "assistant";
      content: string;
      timestamp: Date;
      files?: UploadedFile[];
    }[];
  }[];
  currentVersionIndex?: number;
}

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  cloudinaryUrl?: string;
  uploadcareId?: string;
  preview?: string;
  analysis?: {
    text?: string;
    extractedData?: any;
    summary?: string;
  };
  uploadedAt?: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: Date;
}

export default function Home() {
  const { isSignedIn, user, isLoaded } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const currentMessages = currentConversation?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch conversations from MongoDB
  const fetchConversations = async () => {
    if (!isSignedIn) return;
    
    setIsLoadingConversations(true);
    try {
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        // Transform the data to match our interface
        const transformedConversations = data.map((conv: any) => ({
          id: conv._id,
          title: conv.title,
          messages: [], // We'll load messages separately
          updatedAt: new Date(conv.updatedAt),
        }));
        setConversations(transformedConversations);
      } else {
        console.error('Failed to fetch conversations');
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Fetch messages for a specific conversation
  const fetchConversationMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        // Update the conversation with its messages
        setConversations(prev => 
          prev.map(conv => 
            conv.id === conversationId 
              ? { 
                  ...conv, 
                  messages: data.messages.map((msg: any) => ({
                    id: msg._id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: new Date(msg.timestamp),
                    edited: msg.edited || false,
                    files: msg.files || [],
                    versions: msg.versions || [],
                    currentVersionIndex: msg.currentVersionIndex || 0,
                  }))
                }
              : conv
          )
        );
      } else {
        console.error('Failed to fetch conversation messages');
      }
    } catch (error) {
      console.error('Error fetching conversation messages:', error);
    }
  };

  // Load conversations when user is authenticated
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchConversations();
    }
  }, [isLoaded, isSignedIn]);

  // Call useEffect at the top level - it will only run when currentMessages changes
  useEffect(() => {
    // Only scroll if user is authenticated and there are messages
    if (isLoaded && isSignedIn && currentMessages.length > 0) {
      scrollToBottom();
    }
  }, [currentMessages, isLoaded, isSignedIn]);

  // Show loading state while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show sign-in prompt if not authenticated
  if (!isSignedIn) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto px-4">
          <h1 className="text-3xl font-bold mb-4">Welcome to AI Chat Clone</h1>
          <p className="text-muted-foreground mb-8">
            Sign in to start chatting with AI and access your conversation history.
          </p>
          <SignInButton mode="modal">
            <Button size="lg" className="w-full">
              Sign In to Continue
            </Button>
          </SignInButton>
        </div>
      </div>
    );
  }

  const handleNewChat = () => {
    setCurrentConversationId(null);
    setSidebarOpen(false);
  };

  const handleSelectConversation = async (id: string) => {
    setCurrentConversationId(id);
    setSidebarOpen(false);
    
    // Load messages for this conversation if not already loaded
    const conversation = conversations.find(c => c.id === id);
    if (conversation && conversation.messages.length === 0) {
      await fetchConversationMessages(id);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setConversations(prev => prev.filter(conv => conv.id !== id));
        if (currentConversationId === id) {
          setCurrentConversationId(null);
        }
      } else {
        console.error('Failed to delete conversation');
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle }),
      });
      
      if (response.ok) {
        setConversations(prev => 
          prev.map(conv => 
            conv.id === id ? { ...conv, title: newTitle, updatedAt: new Date() } : conv
          )
        );
      } else {
        console.error('Failed to rename conversation');
      }
    } catch (error) {
      console.error('Error renaming conversation:', error);
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setIsStreaming(false);
  };

  const editMessage = async (messageId: string, newContent: string) => {
    
    // Update the message content locally first
    setConversations(prev => 
      prev.map(c => 
        c.id === currentConversationId
          ? {
              ...c,
              messages: c.messages.map(m => 
                m.id === messageId 
                  ? { ...m, content: newContent, edited: true }
                  : m
              ),
              updatedAt: new Date()
            }
          : c
      )
    );

    // Persist the change to the database
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newContent }),
      });

      if (!response.ok) {
        console.error('Failed to update message in database');
        // Optionally revert the local change if database update fails
      }
    } catch (error) {
      console.error('Error updating message in database:', error);
    }
  };

  const regenerateResponse = async (messageId: string) => {
    // Find the user message that this assistant message is responding to
    const messageIndex = currentMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const userMessage = currentMessages[messageIndex - 1];
    if (!userMessage || userMessage.role !== "user") return;

    // Store the complete context (all subsequent messages) before removing them
    const subsequentMessages = currentMessages.slice(messageIndex);
    
    // Create a special version that contains multiple messages
    const previousVersion = {
      content: "Previous context",
      timestamp: new Date(),
      isCurrent: false,
      isContextVersion: true,
      contextMessages: subsequentMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        files: msg.files || []
      }))
    };

    // Remove the assistant message and all subsequent messages to maintain context
    setConversations(prev => 
      prev.map(c => 
        c.id === currentConversationId
          ? {
              ...c,
              messages: c.messages.slice(0, messageIndex), // Keep only messages up to the user message
              updatedAt: new Date()
            }
          : c
      )
    );

    // Add typing indicator as a new version for the user message
    const typingVersion = {
      content: "",
      timestamp: new Date(),
      isCurrent: true
    };

    setConversations(prev => 
      prev.map(c => 
        c.id === currentConversationId
          ? {
              ...c,
              messages: c.messages.map(m => 
                m.id === userMessage.id 
                  ? { 
                      ...m, 
                      versions: [...(m.versions || [{ content: m.content, timestamp: m.timestamp, isCurrent: true }]), typingVersion],
                      currentVersionIndex: (m.versions?.length || 1),
                      content: m.content, // Keep original content
                      timestamp: new Date()
                    }
                  : m
              ),
              updatedAt: new Date()
            }
          : c
      )
    );

    // Regenerate response using the same logic as sendMessage
    setIsGenerating(true);
    setIsStreaming(true);

    // Create abort controller for stopping generation
    abortControllerRef.current = new AbortController();

    // Create a temporary loading message
    const loadingMessage: Message = {
      id: `loading_${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    // Add loading message first
    setConversations(prev => 
      prev.map(c => 
        c.id === currentConversationId
          ? { 
              ...c, 
              messages: [...c.messages, loadingMessage],
              updatedAt: new Date()
            }
          : c
      )
    );

    try {
      const response = await fetch("/api/chat/regenerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId: messageId,
          conversationId: currentConversationId,
          previousContext: previousVersion.contextMessages,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to regenerate response");
      }

      const responseData = await response.json();
      
      // Update the loading message with the actual response
      setConversations(prev => 
        prev.map(c => 
          c.id === currentConversationId
            ? { 
                ...c, 
                messages: c.messages.map(m => 
                  m.id === loadingMessage.id 
                    ? {
                        id: responseData.messageId || `msg_${Date.now()}`,
                        role: "assistant",
                        content: responseData.response,
                        timestamp: new Date(),
                        versions: [
                          { content: responseData.response, timestamp: new Date(), isCurrent: true },
                          previousVersion
                        ],
                        currentVersionIndex: 0
                      }
                    : m
                ),
                updatedAt: new Date()
              }
            : c
        )
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User stopped generation - remove loading message
        setConversations(prev => 
          prev.map(c => 
            c.id === currentConversationId
              ? { 
                  ...c, 
                  messages: c.messages.filter(m => m.id !== loadingMessage.id),
                  updatedAt: new Date()
                }
              : c
          )
        );
        return;
      }
      
      console.error("Error regenerating response:", error);
      
      // Update loading message with error content
      setConversations(prev => 
        prev.map(c => 
          c.id === currentConversationId
            ? { 
                ...c, 
                messages: c.messages.map(m => 
                  m.id === loadingMessage.id 
                    ? {
                        id: `error_${Date.now()}`,
                        role: "assistant",
                        content: "Sorry, I couldn't regenerate the response. Please try again.",
                        timestamp: new Date(),
                      }
                    : m
                ),
                updatedAt: new Date()
              }
            : c
        )
      );
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const switchToVersion = (messageId: string, versionIndex: number) => {
    setConversations(prev => 
      prev.map(c => 
        c.id === currentConversationId
          ? {
              ...c,
              messages: c.messages.map(m => 
                m.id === messageId 
                  ? { 
                      ...m, 
                      versions: m.versions?.map((v, i) => ({ ...v, isCurrent: i === versionIndex })) || [],
                      currentVersionIndex: versionIndex,
                      content: m.versions?.[versionIndex]?.content || m.content
                    }
                  : m
              ),
              updatedAt: new Date()
            }
          : c
      )
    );
  };

  const copyToClipboard = (content: string) => {
    // Copy functionality can be added here
  };

  const likeMessage = (messageId: string) => {
    // Like functionality can be added here
  };

  const dislikeMessage = (messageId: string) => {
    // Dislike functionality can be added here
  };

  const sendMessage = async (content: string, files?: UploadedFile[]) => {
    // Create new conversation if none exists
    let conversationId = currentConversationId;
    if (!conversationId) {
      // Create conversation in database first
      try {
        const response = await fetch('/api/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: content.slice(0, 50) + (content.length > 50 ? "..." : "")
          }),
        });

        if (response.ok) {
          const newConversationData = await response.json();
          const newConversation: Conversation = {
            id: newConversationData._id,
            title: newConversationData.title,
            messages: [],
            updatedAt: new Date(newConversationData.updatedAt),
          };
          
          setConversations(prev => [newConversation, ...prev]);
          conversationId = newConversation.id;
          setCurrentConversationId(conversationId);
        } else {
          console.error('Failed to create conversation in database');
          return;
        }
      } catch (error) {
        console.error('Error creating conversation:', error);
        return;
      }
    }

    // Create a temporary message ID for immediate UI update
    const tempMessageId = `temp_${Date.now()}`;
    const userMessage: Message = {
      id: tempMessageId,
      role: "user",
      content,
      timestamp: new Date(),
      files: files || [],
    };

    // Add user message immediately to show it in the chat
    setConversations(prev => 
      prev.map(c => 
        c.id === conversationId
          ? { 
              ...c, 
              messages: [...c.messages, userMessage],
              updatedAt: new Date()
            }
          : c
      )
    );

    // Add typing indicator message
    const typingMessage: Message = {
      id: `typing_${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setConversations(prev => 
      prev.map(c => 
        c.id === conversationId
          ? { 
              ...c, 
              messages: [...c.messages, typingMessage],
              updatedAt: new Date()
            }
          : c
      )
    );

    setIsGenerating(true);
    setIsStreaming(true);

    // Create abort controller for stopping generation
    abortControllerRef.current = new AbortController();

    try {
      // Call the actual AI API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          conversationId: conversationId,
          files: files || [],
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get AI response");
      }

      // Get the response data (now returns JSON with response, conversationId, messageId, userMessageId)
      const responseData = await response.json();
      
      // Update the user message with the real ID from database
      setConversations(prev => 
        prev.map(c => 
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map(m => 
                  m.id === tempMessageId 
                    ? { ...m, id: responseData.userMessageId }
                    : m
                ),
                updatedAt: new Date()
              }
            : c
        )
      );

      // Remove typing message and add real assistant message
      setConversations(prev => 
        prev.map(c => 
          c.id === conversationId
            ? { 
                ...c, 
                messages: c.messages.filter(m => m.id !== typingMessage.id).concat({
                  id: responseData.messageId || `msg_${Date.now() + 1}`,
                  role: "assistant",
                  content: responseData.response,
                  timestamp: new Date(),
                  versions: [{
                    content: responseData.response,
                    timestamp: new Date(),
                    isCurrent: true
                  }],
                  currentVersionIndex: 0
                }),
                updatedAt: new Date()
              }
            : c
        )
      );

      // Update current conversation ID if it changed
      if (responseData.conversationId && responseData.conversationId !== conversationId) {
        setCurrentConversationId(responseData.conversationId);
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User stopped generation - remove typing message and temporary user message
        setConversations(prev => 
          prev.map(c => 
            c.id === conversationId
              ? { 
                  ...c, 
                  messages: c.messages.filter(m => m.id !== typingMessage.id && m.id !== tempMessageId),
                  updatedAt: new Date()
                }
              : c
          )
        );
        return;
      }
      
      console.error("Error generating response:", error);
      
      // Remove typing message and add error message
      setConversations(prev => 
        prev.map(c => 
          c.id === conversationId
            ? { 
                ...c, 
                messages: c.messages.filter(m => m.id !== typingMessage.id).concat({
                  id: `msg_${Date.now() + 1}`,
                  role: "assistant",
                  content: `I apologize, but I'm having trouble connecting to the AI service right now. This might be due to API rate limits or service availability. Please try again in a moment, or contact support if the issue persists.`,
                  timestamp: new Date(),
                  versions: [{
                    content: `I apologize, but I'm having trouble connecting to the AI service right now. This might be due to API rate limits or service availability. Please try again in a moment, or contact support if the issue persists.`,
                    timestamp: new Date(),
                    isCurrent: true
                  }],
                  currentVersionIndex: 0
                }),
                updatedAt: new Date()
              }
            : c
        )
      );
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId || undefined}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          isLoading={isLoadingConversations}
        />
      </div>
      
      {/* Mobile Sidebar */}
      <div className="md:hidden">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId || undefined}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          isMobile={true}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          isLoading={isLoadingConversations}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col chatgpt-main">
        {/* Top Bar */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">

              <span className="font-semibold text-gray-800">ChatGPT</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Info className="h-4 w-4" />
              <span>Demo mode - Mock responses</span>
            </div>

            <UserButton 
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8"
                }
              }}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md mx-auto px-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-500" />
                <p className="text-gray-500">Loading conversations...</p>
              </div>
            </div>
          ) : currentMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md mx-auto px-4">
                <h2 className="chatgpt-welcome">How can I help, {user?.firstName || 'User'}?</h2>
                <p className="text-gray-500 mt-2">Start a new conversation or select one from the sidebar.</p>
              </div>
            </div>
          ) : (
            <div>
              {currentMessages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={isStreaming && message.role === "assistant" && message === currentMessages[currentMessages.length - 1] && (message.content === "" || message.id.startsWith('loading_'))}
                  onEdit={editMessage}
                  onRegenerate={regenerateResponse}
                  onSwitchVersion={switchToVersion}
                  onCopy={copyToClipboard}
                  onLike={likeMessage}
                  onDislike={dislikeMessage}
                  onRegenerateAfterEdit={async (messageId: string) => {
                    // Find the next assistant message to regenerate
                    const messageIndex = currentMessages.findIndex(m => m.id === messageId);
                    if (messageIndex !== -1) {
                      const nextAssistantIndex = messageIndex + 1;
                      if (nextAssistantIndex < currentMessages.length && currentMessages[nextAssistantIndex].role === 'assistant') {
                        await regenerateResponse(currentMessages[nextAssistantIndex].id);
                      }
                    }
                  }}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSendMessage={sendMessage}
          onStopGeneration={stopGeneration}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
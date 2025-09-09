"use client";

import { useState, useRef, useEffect } from "react";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Menu, Plus, Info, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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
  activePath?: string[];
  currentPage?: number;
  totalPages?: number;
}

export default function Home() {
  const { isSignedIn, user, isLoaded } = useUser();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [availablePaths, setAvailablePaths] = useState<any[]>([]);
  const [currentPathIndex, setCurrentPathIndex] = useState(0);
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
                  })),
                  activePath: data.activePath || [],
                  currentPage: 0,
                  totalPages: 1
                }
              : conv
          )
        );
        
        // Fetch available paths for pagination
        await fetchAvailablePaths(conversationId);
      } else {
        console.error('Failed to fetch conversation messages');
      }
    } catch (error) {
      console.error('Error fetching conversation messages:', error);
    }
  };

  // Fetch available conversation paths
  const fetchAvailablePaths = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/path`);
      if (response.ok) {
        const data = await response.json();
        console.log('fetchAvailablePaths: Received paths:', data.paths?.length || 0);
        console.log('fetchAvailablePaths: Path details:', data.paths?.map((p: any) => ({ id: p.id, isActive: p.isActive })));
        
        setAvailablePaths(data.paths || []);
        const activeIndex = data.paths?.findIndex((p: any) => p.isActive) ?? 0;
        console.log('fetchAvailablePaths: Setting currentPathIndex to:', activeIndex);
        setCurrentPathIndex(activeIndex);
      } else {
        console.error('Failed to fetch conversation paths');
      }
    } catch (error) {
      console.error('Error fetching conversation paths:', error);
    }
  };

  // Switch to a different conversation path
  const switchToPath = async (pathIndex: number) => {
    if (!currentConversationId || pathIndex === currentPathIndex) {
      console.log('switchToPath: No change needed', { currentConversationId, pathIndex, currentPathIndex });
      return;
    }

    if (pathIndex < 0 || pathIndex >= availablePaths.length) {
      console.log('switchToPath: Invalid path index', { 
        pathIndex, 
        availablePathsLength: availablePaths.length,
        availablePaths: availablePaths.map(p => p.id)
      });
      return;
    }

    if (!availablePaths[pathIndex]) {
      console.log('switchToPath: Path not found at index', { pathIndex, availablePaths });
      return;
    }

    console.log('switchToPath: Attempting to switch', { 
      conversationId: currentConversationId, 
      pathIndex, 
      pathId: availablePaths[pathIndex]?.id 
    });

    try {
      const response = await fetch(`/api/conversations/${currentConversationId}/path`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          pathId: availablePaths[pathIndex]?.id 
        }),
      });

      console.log('switchToPath: Response status', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('switchToPath: Success', data);
        
        // Update the conversation with the new active path messages
        setConversations(prev => 
          prev.map(conv => 
            conv.id === currentConversationId 
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
                  })),
                  activePath: data.activePath,
                  currentPage: pathIndex,
                  totalPages: availablePaths.length
                }
              : conv
          )
        );
        
        setCurrentPathIndex(pathIndex);
        
        // Debug: Log the updated messages
        console.log('switchToPath: Updated messages count:', data.messages.length);
        console.log('switchToPath: Updated currentPathIndex:', pathIndex);
      } else {
        const errorText = await response.text();
        console.error('Failed to switch conversation path:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error switching conversation path:', error);
    }
  };

  // Load conversations when user is authenticated
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchConversations();
    }
  }, [isLoaded, isSignedIn]);

  // Load messages for current conversation when it changes
  useEffect(() => {
    if (currentConversationId && isSignedIn) {
      fetchConversationMessages(currentConversationId);
    }
  }, [currentConversationId, isSignedIn]);

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
          <SignInButton>
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
    // Clear any current messages when starting a new chat
    setConversations(prev => 
      prev.map(conv => 
        conv.id === currentConversationId
          ? { ...conv, messages: [] }
          : conv
      )
    );
  };

  const handleSelectConversation = async (id: string) => {
    // Navigate to the conversation page for existing chats
    router.push(`/chat/${id}`);
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
    // Find the message to get its current files
    const currentMessage = currentMessages.find(m => m.id === messageId);
    const currentFiles = currentMessage?.files || [];
    
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
        body: JSON.stringify({ 
          content: newContent,
          files: currentFiles // Preserve existing files
        }),
      });

      if (!response.ok) {
        console.error('Failed to update message in database');
        // Optionally revert the local change if database update fails
      } else {
        // Update local state with the response data to ensure consistency
        const responseData = await response.json();
        if (responseData.success && responseData.message) {
          setConversations(prev => 
            prev.map(c => 
              c.id === currentConversationId
                ? {
                    ...c,
                    messages: c.messages.map(m => 
                      m.id === messageId 
                        ? { 
                            ...m, 
                            content: responseData.message.content,
                            files: responseData.message.files || m.files,
                            edited: responseData.message.edited,
                            updatedAt: new Date(responseData.message.updatedAt)
                          }
                        : m
                    ),
                    updatedAt: new Date()
                  }
                : c
            )
          );
        }
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

    // Update the conversation to remove the assistant message and subsequent messages from active path
    // Include the user message in the path (messageIndex - 1 is the user message)
    const newActivePath = currentConversation?.activePath?.slice(0, messageIndex) || [];
    
    // Ensure the user message is in the path
    if (userMessage.id && !newActivePath.includes(userMessage.id)) {
      newActivePath.push(userMessage.id);
    }
    
    console.log("Regenerate frontend - messageIndex:", messageIndex);
    console.log("Regenerate frontend - currentConversation.activePath:", currentConversation?.activePath);
    console.log("Regenerate frontend - newActivePath:", newActivePath);
    
    setConversations(prev => 
      prev.map(c => 
        c.id === currentConversationId
          ? {
              ...c,
              messages: c.messages.slice(0, messageIndex), // Keep only messages up to the user message
              activePath: newActivePath,
              updatedAt: new Date()
            }
          : c
      )
    );

    // Add streaming assistant message placeholder
    const streamingMessageId = `streaming_${Date.now()}`;
    const streamingMessage: Message = {
      id: streamingMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setConversations(prev => 
      prev.map(c => 
        c.id === currentConversationId
          ? { 
              ...c, 
              messages: [...c.messages, streamingMessage],
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
      const response = await fetch("/api/chat/regenerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: currentConversationId,
          activePath: newActivePath,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Regenerate error:", errorText);
        throw new Error(`Failed to regenerate response: ${errorText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let metadata: any = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'metadata') {
                  metadata = data;
                } else if (data.type === 'chunk') {
                  // Update the streaming message with new content
                  setConversations(prev => 
                    prev.map(c => 
                      c.id === currentConversationId
                        ? {
                            ...c,
                            messages: c.messages.map(m => 
                              m.id === streamingMessageId
                                ? { ...m, content: m.content + data.content }
                                : m
                            ),
                            updatedAt: new Date()
                          }
                        : c
                    )
                  );
                } else if (data.type === 'done') {
                  // Replace streaming message with final message
                  setConversations(prev => 
                    prev.map(c => 
                      c.id === currentConversationId
                        ? { 
                            ...c, 
                            messages: c.messages.map(m => 
                              m.id === streamingMessageId
                                ? {
                                    id: metadata?.messageId || `msg_${Date.now()}`,
                                    role: "assistant",
                                    content: data.fullResponse,
                                    timestamp: new Date(),
                                    versions: [{
                                      content: data.fullResponse,
                                      timestamp: new Date(),
                                      isCurrent: true
                                    }],
                                    currentVersionIndex: 0
                                  }
                                : m
                            ),
                            updatedAt: new Date()
                          }
                        : c
                    )
                  );
                } else if (data.type === 'error') {
                  throw new Error(data.error || 'Streaming error');
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError);
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User stopped generation - remove streaming message
        setConversations(prev => 
          prev.map(c => 
            c.id === currentConversationId
              ? { 
                  ...c, 
                  messages: c.messages.filter(m => m.id !== streamingMessageId),
                  updatedAt: new Date()
                }
              : c
          )
        );
        return;
      }
      
      console.error("Error regenerating response:", error);
      
      // Update streaming message with error content
      setConversations(prev => 
        prev.map(c => 
          c.id === currentConversationId
            ? { 
                ...c, 
                messages: c.messages.map(m => 
                  m.id === streamingMessageId 
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
      
      // Refresh available paths after regeneration
      if (currentConversationId) {
        await fetchAvailablePaths(currentConversationId);
      }
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
          // Don't navigate - stay on home page for new chats
          return;
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

    // Add streaming assistant message placeholder
    const streamingMessageId = `streaming_${Date.now()}`;
    const streamingMessage: Message = {
      id: streamingMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setConversations(prev => 
      prev.map(c => 
        c.id === conversationId
          ? { 
              ...c, 
              messages: [...c.messages, streamingMessage],
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
      // Call the streaming AI API
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
        throw new Error("Failed to get AI response");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let metadata: any = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'metadata') {
                  metadata = data;
                  // Update the user message with the real ID from database
                  setConversations(prev => 
                    prev.map(c => 
                      c.id === conversationId
                        ? {
                            ...c,
                            messages: c.messages.map(m => 
                              m.id === tempMessageId 
                                ? { ...m, id: data.userMessageId }
                                : m
                            ),
                            updatedAt: new Date()
                          }
                        : c
                    )
                  );
                } else if (data.type === 'chunk') {
                  // Update the streaming message with new content
                  setConversations(prev => 
                    prev.map(c => 
                      c.id === conversationId
                        ? {
                            ...c,
                            messages: c.messages.map(m => 
                              m.id === streamingMessageId
                                ? { ...m, content: m.content + data.content }
                                : m
                            ),
                            updatedAt: new Date()
                          }
                        : c
                    )
                  );
                } else if (data.type === 'done') {
                  // Replace streaming message with final message
                  setConversations(prev => 
                    prev.map(c => 
                      c.id === conversationId
                        ? { 
                            ...c, 
                            messages: c.messages.map(m => 
                              m.id === streamingMessageId
                                ? {
                                    id: metadata?.messageId || `msg_${Date.now()}`,
                                    role: "assistant",
                                    content: data.fullResponse,
                                    timestamp: new Date(),
                                    versions: [{
                                      content: data.fullResponse,
                                      timestamp: new Date(),
                                      isCurrent: true
                                    }],
                                    currentVersionIndex: 0
                                  }
                                : m
                            ),
                            updatedAt: new Date()
                          }
                        : c
                    )
                  );
                } else if (data.type === 'error') {
                  throw new Error(data.error || 'Streaming error');
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError);
              }
            }
          }
        }
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User stopped generation - remove streaming message and temporary user message
        setConversations(prev => 
          prev.map(c => 
            c.id === conversationId
              ? { 
                  ...c, 
                  messages: c.messages.filter(m => m.id !== streamingMessageId && m.id !== tempMessageId),
                  updatedAt: new Date()
                }
              : c
          )
        );
        return;
      }
      
      console.error("Error generating response:", error);
      
      // Remove streaming message and add error message
      setConversations(prev => 
        prev.map(c => 
          c.id === conversationId
            ? { 
                ...c, 
                messages: c.messages.map(m => 
                  m.id === streamingMessageId
                    ? {
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
      
      // Refresh available paths after sending message
      if (conversationId) {
        await fetchAvailablePaths(conversationId);
      }
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
              {currentMessages.map((message, index) => (
                <div key={message.id}>
                  <ChatMessage
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
                    // Pagination props for assistant messages - only show for regenerated messages
                    showPagination={message.role === "assistant" && availablePaths.length > 1 && (
                        index === currentMessages.length - 1 || 
                        !currentMessages.slice(index + 1).some(msg => msg.role === "assistant")
                      )}
                    currentPage={currentPathIndex + 1}
                    totalPages={availablePaths.length}
                    onPreviousPage={() => {
                      console.log('Pagination: Previous page', { currentPathIndex, totalPages: availablePaths.length });
                      if (currentPathIndex > 0) {
                        switchToPath(currentPathIndex - 1);
                      }
                    }}
                    onNextPage={() => {
                      console.log('Pagination: Next page', { currentPathIndex, totalPages: availablePaths.length });
                      if (currentPathIndex < availablePaths.length - 1) {
                        switchToPath(currentPathIndex + 1);
                      }
                    }}
                  />
                  
                </div>
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
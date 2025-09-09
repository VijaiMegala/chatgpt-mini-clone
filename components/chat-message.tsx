"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  Copy, 
  ThumbsUp, 
  ThumbsDown, 
  Edit3, 
  RotateCcw,
  Check,
  CheckCircle,
  File,
  FileText,
  Image,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
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

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: (messageId: string) => void;
  onSwitchVersion?: (messageId: string, versionIndex: number) => void;
  onCopy?: (content: string) => void;
  onLike?: (messageId: string) => void;
  onDislike?: (messageId: string) => void;
  onMessageUpdate?: (messageId: string, newContent: string) => void;
  onRegenerateAfterEdit?: (messageId: string) => void;
  // Pagination props
  showPagination?: boolean;
  currentPage?: number;
  totalPages?: number;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
}

export function ChatMessage({
  message,
  isStreaming = false,
  onEdit,
  onRegenerate,
  onSwitchVersion,
  onCopy,
  onLike,
  onDislike,
  onMessageUpdate,
  onRegenerateAfterEdit,
  showPagination = false,
  currentPage = 1,
  totalPages = 1,
  onPreviousPage,
  onNextPage,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onCopy?.(message.content);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleEditSave = async () => {
    if (editContent.trim() && editContent !== message.content) {
      
      // Call the parent's edit function (now async)
      await onEdit?.(message.id, editContent.trim());
      
      // Close the input box immediately after saving
      setIsEditing(false);
      
      // If this is a user message, trigger regeneration in the background
      if (message.role === 'user' && onRegenerateAfterEdit) {
        // Don't await this - let it run in the background
        onRegenerateAfterEdit(message.id);
      }
    } else {
      // Close the input box even if no changes were made
      setIsEditing(false);
    }
  };

  const handleEditCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const getFileIcon = (type: string, isWhite = false) => {
    const iconClass = isWhite ? "h-4 w-4 text-white" : "h-4 w-4";
    if (type.startsWith("image/")) {
      return <Image className={iconClass} />;
    } else if (type === "application/pdf") {
      return <FileText className={iconClass} />;
    } else {
      return <File className={iconClass} />;
    }
  };

  const getFileIconColor = (type: string) => {
    if (type.startsWith("image/")) {
      return "bg-blue-500";
    } else if (type === "application/pdf") {
      return "bg-red-500";
    } else if (type.includes("csv") || type.includes("spreadsheet")) {
      return "bg-green-500";
    } else if (type.includes("text/")) {
      return "bg-yellow-500";
    } else if (type.includes("json")) {
      return "bg-purple-500";
    } else {
      return "bg-gray-500";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDownload = async (file: UploadedFile) => {
    try {
      const response = await fetch(file.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file');
    }
  };

  const handlePreview = (file: UploadedFile) => {
    if (file.type.startsWith('image/')) {
      window.open(file.url, '_blank');
    } else {
      // For other file types, try to open in new tab
      window.open(file.url, '_blank');
    }
  };

  return (
    <div
      className={cn(
        "message-bubble message-enter group",
        isUser ? "message-user" : "message-assistant"
      )}
    >
      <div className={cn(
        "flex gap-4 max-w-[80%]",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        {/* Avatar */}
        <div className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            {isUser ? (
              <AvatarFallback className="bg-gray-200 text-gray-700">
                U
              </AvatarFallback>
            ) : (
              <AvatarFallback className="bg-green-500 text-white">
                <div className="w-6 h-6 bg-gradient-to-br from-green-400 to-blue-500 rounded-sm flex items-center justify-center">
                  <span className="text-white text-xs font-bold">C</span>
                </div>
              </AvatarFallback>
            )}
          </Avatar>
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full min-h-[100px] p-3 border border-border rounded-lg bg-background text-foreground resize-none"
                autoFocus
                placeholder="Edit your message... (Enter to save, Shift+Enter for new line)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleEditSave}>
                  Save (Enter)
                </Button>
                <Button size="sm" variant="outline" onClick={handleEditCancel}>
                  Cancel (Esc)
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn(
              "relative rounded-3xl px-4 py-1",
              isUser 
                ? "bg-gray-100 text-gray-900" 
                : "bg-white text-gray-900"
            )}>
              {/* File Attachments */}
              {message.files && Array.isArray(message.files) && message.files.length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-2">
                    {message.files.map((file) => (
                      <div
                        key={file.id}
                        className="relative rounded-lg border transition-colors max-w-[200px] overflow-hidden bg-gray-50 border-gray-200 hover:bg-gray-100"
                      >
                        {/* Image Preview for image files */}
                        {file.type.startsWith('image/') && (file.preview || file.cloudinaryUrl || file.url) ? (
                          <div className="relative">
                            <img
                              src={file.preview || file.cloudinaryUrl || file.url}
                              alt={file.name}
                              className="w-full h-32 object-cover"
                            />
                            {/* Overlay with action buttons */}
                            <div className="absolute top-2 right-2 flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePreview(file)}
                                className="w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors p-0"
                                title="Preview image"
                              >
                                <Eye className="h-3 w-3 text-white" />
                              </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownload(file)}
                                  className="w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors p-0"
                                  title="Download image"
                                >
                                  <Download className="h-3 w-3 text-white" />
                                </Button>
                            </div>
                          </div>
                        ) : (
                          /* Non-image file display */
                          <div className="p-2">
                            <div className="flex items-start gap-2">
                              {/* File Icon */}
                              <div className={cn("flex-shrink-0 w-6 h-6 rounded flex items-center justify-center", getFileIconColor(file.type))}>
                                {getFileIcon(file.type, true)}
                              </div>
                              
                              {/* File Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">
                                  {file.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePreview(file)}
                                  className="h-4 w-4 p-0 hover:bg-gray-200"
                                  title="Preview file"
                                >
                                  <Eye className="h-2 w-2" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownload(file)}
                                  className="h-4 w-4 p-0 hover:bg-gray-200"
                                  title="Download file"
                                >
                                  <Download className="h-2 w-2" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="message-content">
                {message.versions && message.versions[message.currentVersionIndex || 0]?.isContextVersion ? (
                  // Render context messages as individual conversation messages
                  <div className="space-y-6">
                    <div className="text-sm text-gray-500 mb-4 font-medium border-b border-gray-200 pb-2">
                      Previous context:
                    </div>
                    {message.versions[message.currentVersionIndex || 0].contextMessages?.map((contextMsg, index) => (
                      <div key={`${contextMsg.id}-${index}`} className="flex gap-3">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                            contextMsg.role === 'user' 
                              ? "bg-gray-100 text-gray-600" 
                              : "bg-green-100 text-green-600"
                          )}>
                            {contextMsg.role === 'user' ? 'U' : 'A'}
                          </div>
                        </div>
                        
                        {/* Message Content */}
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "relative rounded-3xl px-4 py-2 max-w-3xl",
                            contextMsg.role === 'user' 
                              ? "bg-gray-100 text-gray-900 ml-auto" 
                              : "bg-white text-gray-900 border border-gray-200"
                          )}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight]}
                              components={{
                                pre: ({ children, ...props }) => (
                                  <pre 
                                    className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-2 text-sm font-mono" 
                                    style={{ 
                                      backgroundColor: '#1f2937', 
                                      color: '#f9fafb',
                                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                                    }}
                                    {...props}
                                  >
                                    {children}
                                  </pre>
                                ),
                                code: ({ children, className, ...props }) => {
                                  const isInline = !className;
                                  return isInline ? (
                                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <code className={`${className} font-mono text-sm`} {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                ul: ({ children, ...props }) => (
                                  <ul className="list-disc list-inside my-2 space-y-1" {...props}>
                                    {children}
                                  </ul>
                                ),
                                li: ({ children, ...props }) => (
                                  <li className="text-gray-800" {...props}>
                                    {children}
                                  </li>
                                ),
                                p: ({ children, ...props }: any) => {
                                  const text = children?.toString() || '';
                                  if (text.toLowerCase().includes('the answer is') || text.toLowerCase().includes('answer:')) {
                                    return (
                                      <p className="text-gray-800 my-2 flex items-center gap-2" {...props}>
                                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                        {children}
                                      </p>
                                    );
                                  }
                                  return (
                                    <p className="text-gray-800 my-2" {...props}>
                                      {children}
                                    </p>
                                  );
                                },
                              }}
                            >
                              {contextMsg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Render normal message content
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      pre: ({ children, ...props }) => (
                        <pre 
                          className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-2 text-sm font-mono" 
                          style={{ 
                            backgroundColor: '#1f2937', 
                            color: '#f9fafb',
                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                          }}
                          {...props}
                        >
                          {children}
                        </pre>
                      ),
                      code: ({ children, className, ...props }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                            {children}
                          </code>
                        ) : (
                          <code className={`${className} font-mono text-sm`} {...props}>
                            {children}
                          </code>
                        );
                      },
                      ul: ({ children, ...props }) => (
                        <ul className="list-disc list-inside my-2 space-y-1" {...props}>
                          {children}
                        </ul>
                      ),
                      li: ({ children, ...props }) => (
                        <li className="text-gray-800" {...props}>
                          {children}
                        </li>
                      ),
                      // Special handling for final answer with checkmark
                      p: ({ children, ...props }: any) => {
                        const text = children?.toString() || '';
                        if (text.toLowerCase().includes('the answer is') || text.toLowerCase().includes('answer:')) {
                          return (
                            <p className="text-gray-800 my-2 flex items-center gap-2" {...props}>
                              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                              {children}
                            </p>
                          );
                        }
                        return (
                          <p className="text-gray-800 my-2" {...props}>
                            {children}
                          </p>
                        );
                      },
                      // Table components for proper rendering
                      table: ({ children, ...props }) => (
                        <div className="table-wrapper">
                          <table {...props}>
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children, ...props }) => (
                        <thead {...props}>
                          {children}
                        </thead>
                      ),
                      tbody: ({ children, ...props }) => (
                        <tbody {...props}>
                          {children}
                        </tbody>
                      ),
                      tr: ({ children, ...props }) => (
                        <tr {...props}>
                          {children}
                        </tr>
                      ),
                      th: ({ children, ...props }) => (
                        <th {...props}>
                          {children}
                        </th>
                      ),
                      td: ({ children, ...props }) => (
                        <td {...props}>
                          {children}
                        </td>
                      ),
                      caption: ({ children, ...props }) => (
                        <caption {...props}>
                          {children}
                        </caption>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
                {isStreaming && (
                  <div className="inline-flex items-center ml-2">
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-gray-400 rounded-full typing-dot"></div>
                      <div className="w-1 h-1 bg-gray-400 rounded-full typing-dot"></div>
                      <div className="w-1 h-1 bg-gray-400 rounded-full typing-dot"></div>
                    </div>
                  </div>
                )}
              </div>

              

              {/* Action Buttons */}
              {!isEditing && (
                <div className="flex items-center gap-1 mt-3 opacity-100 transition-opacity">
                  {/* Version Pagination - Only for assistant messages with multiple versions */}
                  {isAssistant && message.versions && message.versions.length > 1 && (
                    <div className="flex items-center justify-center gap-2 rounded-lg">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSwitchVersion?.(message.id, Math.max(0, (message.currentVersionIndex || 0) - 1))}
                        disabled={!message.currentVersionIndex || message.currentVersionIndex <= 0}
                        className="h-6 w-6 p-0 hover:bg-gray-200"
                        title="Previous version"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <span className="text-xs text-gray-600 font-medium">
                        {message.currentVersionIndex !== undefined ? message.currentVersionIndex + 1 : 1} / {message.versions.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSwitchVersion?.(message.id, Math.min(message.versions!.length - 1, (message.currentVersionIndex || 0) + 1))}
                        disabled={message.currentVersionIndex === undefined || message.currentVersionIndex >= message.versions.length - 1}
                        className="h-6 w-6 p-0 hover:bg-gray-200"
                        title="Next version"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {/* Edit button - Only for user messages */}
                  {isUser && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="h-8 w-8 p-0 hover:bg-gray-100"
                      title="Edit message"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {/* Pagination controls - Only for assistant messages with multiple paths */}
                  {isAssistant && showPagination && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onPreviousPage}
                        disabled={currentPage <= 1}
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        title="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-gray-600 min-w-[40px] text-center">
                        {currentPage}/{totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onNextPage}
                        disabled={currentPage >= totalPages}
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        title="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  
                  {/* Copy button - For all messages */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-8 w-8 p-0 hover:bg-gray-100"
                    title="Copy"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  
                  {/* Like/Dislike buttons - Only for assistant messages */}
                  {isAssistant && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onLike?.(message.id)}
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        title="Like"
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDislike?.(message.id)}
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        title="Dislike"
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  
                  {/* Regenerate button - Only for assistant messages */}
                  {isAssistant && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onRegenerate?.(message.id);
                      }}
                      className="h-8 w-8 p-0 hover:bg-gray-100"
                      title="Regenerate response"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

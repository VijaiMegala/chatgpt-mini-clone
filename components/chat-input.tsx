"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Send, 
  Paperclip, 
  Mic, 
  Square,
  Loader2,
  Plus,
  BookOpen,
  Image,
  Lightbulb,
  Telescope,
  MoreHorizontal,
  ChevronRight,
  FileText,
  File,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  cloudinaryUrl?: string;
  uploadcareId?: string;
  preview?: string;
  isUploading?: boolean;
  analysis?: {
    text?: string;
    extractedData?: any;
    summary?: string;
  };
}

const MAX_FILES = 5; // Maximum number of files allowed

interface ChatInputProps {
  onSendMessage: (message: string, files?: UploadedFile[]) => void;
  onStopGeneration?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSendMessage,
  onStopGeneration,
  isGenerating = false,
  disabled = false,
  placeholder = "Message ChatGPT...",
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !isGenerating) {
      onSendMessage(message.trim(), uploadedFiles);
      setMessage("");
      setUploadedFiles([]);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Create a temporary file object with uploading state
    const tempFileId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create preview URL for images
    let previewUrl = '';
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
    }
    
    const tempFile: UploadedFile = {
      id: tempFileId,
      name: file.name,
      type: file.type,
      size: file.size,
      url: '',
      preview: previewUrl,
      isUploading: true,
    };

    // Add the temporary file to show loading state
    setUploadedFiles(prev => {
      const newFiles = [...prev, tempFile];
      return newFiles;
    });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed with response:', errorText);
        throw new Error('Upload failed');
      }

      const result = await response.json();
      
      if (result.success) {
        const uploadedFile: UploadedFile = {
          id: result.file.id,
          name: result.file.name,
          type: result.file.type,
          size: result.file.size,
          url: result.file.url,
          cloudinaryUrl: result.file.cloudinaryUrl,
          uploadcareId: result.file.uploadcareId,
          // Use Cloudinary URL for images after upload, or server preview, or fallback to blob URL
          preview: result.file.cloudinaryUrl || result.file.preview || (tempFile.type.startsWith('image/') ? tempFile.preview : undefined),
          isUploading: false,
          analysis: result.file.analysis || result.analysis, // Include analysis data from file or root
        };
        
        // Replace the temporary file with the actual uploaded file
        setUploadedFiles(prev => {
          const updatedFiles = prev.map(f => {
            if (f.id === tempFileId) {
              // Clean up the old blob URL if we're replacing it with a Cloudinary URL
              if (f.preview && f.preview.startsWith('blob:') && uploadedFile.preview && !uploadedFile.preview.startsWith('blob:')) {
                URL.revokeObjectURL(f.preview);
              }
              return uploadedFile;
            }
            return f;
          });
          return updatedFiles;
        });
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('File upload error:', error);
      // Remove the temporary file on error
      setUploadedFiles(prev => prev.filter(f => f.id !== tempFileId));
      alert('Failed to upload file. Please try again.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    
    if (files) {
      // Check if adding these files would exceed the limit
      if (uploadedFiles.length + files.length > MAX_FILES) {
        alert(`You can only upload up to ${MAX_FILES} files. You currently have ${uploadedFiles.length} files.`);
        e.target.value = '';
        return;
      }

      Array.from(files).forEach((file) => {
        
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert("File size must be less than 10MB");
          return;
        }

        // Validate file type
        const allowedTypes = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/svg",
          "text/plain",
          "application/pdf",
          "text/markdown",
          "application/json",
          "text/csv",
        ];

        if (!allowedTypes.includes(file.type)) {
          alert("File type not supported");
          return;
        }

        handleFileUpload(file);
      });
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
  };

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles(prev => {
      const fileToRemove = prev.find(file => file.id === fileId);
      // Clean up blob URL if it exists
      if (fileToRemove?.preview && fileToRemove.preview.startsWith('blob:')) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter(file => file.id !== fileId);
    });
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) {
      return <Image className="h-4 w-4 text-white" />;
    } else if (type === "application/pdf") {
      return <FileText className="h-4 w-4 text-white" />;
    } else if (type.includes("csv") || type.includes("spreadsheet")) {
      return <FileText className="h-4 w-4 text-white" />;
    } else {
      return <File className="h-4 w-4 text-white" />;
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

  const getFileTypeLabel = (type: string) => {
    if (type.startsWith("image/")) {
      return "Image";
    } else if (type === "application/pdf") {
      return "PDF";
    } else if (type.includes("csv") || type.includes("spreadsheet")) {
      return "Spreadsheet";
    } else if (type.includes("text/")) {
      return "Text";
    } else if (type.includes("json")) {
      return "JSON";
    } else {
      return "File";
    }
  };

  const handlePlusClick = () => {
    setShowPlusMenu(!showPlusMenu);
  };

  const handleMenuOptionClick = (option: string) => {
    setShowPlusMenu(false);
    switch (option) {
      case 'photos':
        if (uploadedFiles.length >= MAX_FILES) {
          alert(`You can only upload up to ${MAX_FILES} files. Please remove some files first.`);
          return;
        }
        fileInputRef.current?.click();
        break;
      case 'study':
        // Add study mode functionality
        break;
      case 'image':
        // Add image generation functionality
        break;
      case 'think':
        // Add thinking mode functionality
        break;
      case 'research':
        // Add research mode functionality
        break;
      case 'more':
        // Add more options functionality
        break;
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (plusButtonRef.current && !plusButtonRef.current.contains(event.target as Node)) {
        setShowPlusMenu(false);
      }
    };

    if (showPlusMenu) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showPlusMenu]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStopGeneration = () => {
    onStopGeneration?.();
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // Maximum height in pixels
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  useEffect(() => {
    if (showPlusMenu) {
      // Plus menu is rendering
    }
  }, [showPlusMenu]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      uploadedFiles.forEach(file => {
        if (file.preview && file.preview.startsWith('blob:')) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, []); // Only run on unmount

  return (
    <div className="input-area relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.csv"
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
      />
      
      <div className="input-container relative">
        {/* Debug indicator */}        
        <form onSubmit={handleSubmit} className="input-wrapper">
          <div className="relative flex-1">
            <div className="flex items-center px-4 py-1 border border-gray-300 rounded-3xl bg-white shadow-sm flex-col">
              <div className="flex w-full">
                {/* Uploaded Files Display - Inline in input container */}
                    {uploadedFiles.length > 0 && (
                    <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">
                            {uploadedFiles.length}/{MAX_FILES} files attached
                        </span>
                        {uploadedFiles.length >= MAX_FILES && (
                            <span className="text-xs text-orange-500">
                            File limit reached
                            </span>
                        )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                        {uploadedFiles.map((file) => (
                        <div
                            key={file.id}
                            className={cn(
                                "relative rounded-lg border transition-colors max-w-[200px] overflow-hidden",
                                file.isUploading 
                                    ? "bg-blue-50 border-blue-200 animate-pulse" 
                                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                            )}
                        >
                            {/* Image Preview for image files */}
                            {file.type.startsWith('image/') && file.preview ? (
                                <div className="relative">
                                    <img
                                        src={file.preview}
                                        alt={file.name}
                                        className="w-full h-32 object-cover"
                                    />
                                    {/* Overlay with edit and remove buttons */}
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        <button
                                            className="w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
                                            disabled={disabled || file.isUploading}
                                            title="Edit image"
                                        >
                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleRemoveFile(file.id)}
                                            className="w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
                                            disabled={disabled || file.isUploading}
                                            title="Remove image"
                                        >
                                            <X className="h-3 w-3 text-white" />
                                        </button>
                                    </div>
                                    {/* Loading overlay for uploading images */}
                                    {file.isUploading && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <Loader2 className="h-6 w-6 text-white animate-spin" />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Non-image file display */
                                <div className="p-2">
                                    <div className="flex items-start gap-2">
                                        {/* File Icon */}
                                        <div className={cn(
                                            "flex-shrink-0 w-6 h-6 rounded flex items-center justify-center",
                                            file.isUploading 
                                                ? "bg-blue-500" 
                                                : getFileIconColor(file.type)
                                        )}>
                                            {file.isUploading ? (
                                                <Loader2 className="h-3 w-3 text-white animate-spin" />
                                            ) : (
                                                getFileIcon(file.type)
                                            )}
                                        </div>
                                        
                                        {/* File Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-900 truncate">
                                            {file.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                            {file.isUploading ? "Uploading..." : getFileTypeLabel(file.type)}
                                            </p>
                                        </div>
                                        
                                        {/* Remove Button - only show if not uploading */}
                                        {!file.isUploading && (
                                            <button
                                                onClick={() => handleRemoveFile(file.id)}
                                                className="flex-shrink-0 w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors"
                                                disabled={disabled}
                                                title="Remove file"
                                            >
                                                <X className="h-2 w-2 text-gray-600" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        ))}
                        </div>
                    </div>
                    )}
              </div>
              {/* Left side - Plus icon */}
              <div className="flex items-center w-full">

                <div className="flex-shrink-0 mr-3 relative">
                    <button
                    ref={plusButtonRef}
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePlusClick();
                    }}
                    className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    disabled={disabled}
                    >
                    <Plus className="h-5 w-5 text-gray-400" />
                    </button>
                    
                    {/* Plus Menu - positioned relative to plus button */}
                    {showPlusMenu && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 py-2 min-w-[200px] z-[9999]">
                        {/* Arrow pointing down to plus button */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-gray-200 -mt-px"></div>
                        <button
                        onClick={() => handleMenuOptionClick('photos')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                        disabled={uploadedFiles.length >= MAX_FILES}
                        >
                        <Paperclip className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-800">Add photos & files</span>
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button
                        onClick={() => handleMenuOptionClick('study')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                        >
                        <BookOpen className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-800">Study and learn</span>
                        </button>
                        <button
                        onClick={() => handleMenuOptionClick('image')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                        >
                        <Image className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-800">Create image</span>
                        </button>
                        <button
                        onClick={() => handleMenuOptionClick('think')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                        >
                        <Lightbulb className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-800">Think longer</span>
                        </button>
                        <button
                        onClick={() => handleMenuOptionClick('research')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                        >
                        <Telescope className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-800">Deep research</span>
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button
                        onClick={() => handleMenuOptionClick('more')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                        >
                        <MoreHorizontal className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-800">More</span>
                        <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
                        </button>
                    </div>
                    )}
                </div>
                
                {/* Center - Text input */}
                <div className="flex-1 min-w-0">
                    <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything"
                    disabled={disabled}
                    className={cn(
                        "w-full min-h-[24px] max-h-[200px] resize-none border-none outline-none",
                        "bg-transparent text-gray-800 placeholder:text-gray-400",
                        "text-base leading-6"
                    )}
                    rows={1}
                    />
                </div>
                
                {/* Right side - Action Buttons */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    {!isGenerating && (
                    <>
                        <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-gray-700"
                        disabled={disabled}
                        onClick={() => setIsRecording(!isRecording)}
                        >
                        <Mic className={cn(
                            "h-4 w-4",
                            isRecording && "text-red-500"
                        )} />
                        </Button>
                    </>
                    )}

                    {isGenerating ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 stop-button"
                        onClick={handleStopGeneration}
                        title="Stop generating"
                    >
                        <Square className="h-4 w-4" />
                    </Button>
                    ) : (
                    <Button
                        type="submit"
                        size="icon"
                        className="h-8 w-8 bg-gray-800 hover:bg-gray-900 text-white disabled:bg-gray-300 disabled:cursor-not-allowed send-button"
                        disabled={!message.trim() || disabled}
                        title="Send message"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                    )}
                </div>
              </div>
            </div>
          </div>
        </form>

        

        {/* Footer Text */}
        <div className="text-center text-xs text-gray-500 mt-2">
          ChatGPT can make mistakes. Consider checking important information.
        </div>
      </div>
    </div>
  );
}

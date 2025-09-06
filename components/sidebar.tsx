"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Plus, 
  MessageSquare, 
  Settings, 
  LogOut, 
  Menu,
  X,
  Edit3,
  Trash2,
  Search,
  BookOpen,
  Play,
  Grid3X3,
  Folder,
  ChevronDown,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  updatedAt: Date;
}

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  isMobile?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  isLoading?: boolean;
}

export function Sidebar({
  conversations,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  isMobile = false,
  isOpen = false,
  onToggle,
  isLoading = false,
}: SidebarProps) {
  const { user } = useUser();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleEditStart = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleEditSave = () => {
    if (editingId && editTitle.trim()) {
      onRenameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const sidebarClasses = cn(
    "sidebar chatgpt-sidebar flex flex-col h-full",
    isMobile && "sidebar-mobile",
    isMobile && !isOpen && "closed"
  );

  return (
    <>
      {isMobile && (
        <div
          className={cn(
            "fixed inset-0 bg-black/50 z-40 transition-opacity",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onToggle}
        />
      )}
      
      <div className={sidebarClasses}>
        {/* Top Navigation */}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-4">
            <span className="font-semibold text-gray-800">ChatGPT</span>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </div>
          
          {/* Navigation Items */}
          <div className="space-y-1">
            <Button
              onClick={onNewChat}
              className="w-full justify-start gap-3 h-10 text-gray-700 hover:bg-gray-200"
              variant="ghost"
            >
              <Plus className="h-4 w-4" />
              New chat
            </Button>
            
            <Button
              className="w-full justify-start gap-3 h-10 text-gray-700 hover:bg-gray-200"
              variant="ghost"
            >
              <Search className="h-4 w-4" />
              Search chats
            </Button>
            
            <Button
              className="w-full justify-start gap-3 h-10 text-gray-700 hover:bg-gray-200"
              variant="ghost"
            >
              <BookOpen className="h-4 w-4" />
              Library
            </Button>
            
            <Button
              className="w-full justify-start gap-3 h-10 text-gray-700 hover:bg-gray-200"
              variant="ghost"
            >
              <Play className="h-4 w-4" />
              Sora
            </Button>
            
           
          </div>
        </div>

        {/* Chats Section */}
        <div className="flex-1 overflow-y-auto px-3">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Chats</h3>
          </div>
          
          <div className="space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                  <span className="text-sm">Loading conversations...</span>
                </div>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex items-center justify-center p-4">
                <div className="text-center text-gray-500">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                  <p className="text-xs text-gray-400">Start a new chat to begin</p>
                </div>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                    currentConversationId === conversation.id
                      ? "bg-gray-200"
                      : "hover:bg-gray-100"
                  )}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  
                  {editingId === conversation.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={handleEditSave}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditSave();
                        if (e.key === "Escape") handleEditCancel();
                      }}
                      className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-800 truncate">
                      {conversation.title}
                    </span>
                  )}

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditStart(conversation);
                      }}
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-500 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conversation.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* User Profile */}
        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.imageUrl} alt={user?.fullName || "User"} />
              <AvatarFallback className="bg-gray-300 text-gray-700">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-gray-800">
                {user?.fullName || "User"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                Free
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-3 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700"
            >
              Upgrade
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

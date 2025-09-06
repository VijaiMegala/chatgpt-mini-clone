import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversation extends Document {
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage extends Document {
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  edited?: boolean;
  parentMessageId?: string;
  metadata?: Record<string, any>;
  files?: Array<{
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
    uploadedAt: Date;
  }>;
  versions?: Array<{
    content: string;
    timestamp: Date;
    isCurrent?: boolean;
    isContextVersion?: boolean;
    contextMessages?: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      timestamp: Date;
      files?: Array<{
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
        uploadedAt: Date;
      }>;
    }>;
  }>;
  currentVersionIndex?: number;
}

export interface IMemory extends Document {
  userId: string;
  content: string;
  metadata?: Record<string, any>;
  conversationId?: string;
  messageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  clerkId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  imageUrl: { type: String, required: true },
}, {
  timestamps: true,
});

const MessageSchema = new Schema<IMessage>({
  conversationId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  edited: { type: Boolean, default: false },
  parentMessageId: { type: String },
  metadata: { type: Schema.Types.Mixed, default: {} },
  files: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    cloudinaryUrl: { type: String },
    uploadcareId: { type: String },
    preview: { type: String },
    analysis: {
      text: { type: String },
      extractedData: { type: Schema.Types.Mixed },
      summary: { type: String },
    },
    uploadedAt: { type: Date, default: Date.now },
  }],
  versions: [{
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isCurrent: { type: Boolean, default: false },
    isContextVersion: { type: Boolean, default: false },
    contextMessages: [{
      id: { type: String, required: true },
      role: { type: String, enum: ["user", "assistant"], required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, required: true },
      files: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, required: true },
        size: { type: Number, required: true },
        url: { type: String, required: true },
        cloudinaryUrl: { type: String },
        uploadcareId: { type: String },
        preview: { type: String },
        analysis: {
          text: { type: String },
          extractedData: { type: Schema.Types.Mixed },
          summary: { type: String },
        },
        uploadedAt: { type: Date, default: Date.now },
      }],
    }],
  }],
  currentVersionIndex: { type: Number, default: 0 },
}, {
  timestamps: true,
});

const ConversationSchema = new Schema<IConversation>({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
}, {
  timestamps: true,
});

const MemorySchema = new Schema<IMemory>({
  userId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  conversationId: { type: String, index: true },
  messageId: { type: String, index: true },
}, {
  timestamps: true,
});

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>("Conversation", ConversationSchema);
export const Message = mongoose.models.Message || mongoose.model<IMessage>("Message", MessageSchema);
export const Memory = mongoose.models.Memory || mongoose.model<IMemory>("Memory", MemorySchema);

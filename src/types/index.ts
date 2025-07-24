// Type definitions for IP Chat application

// User type
export interface User {
  id: string;
  name: string;
  ip: string;
  lastSeen: string; // ISO date string
}

// Message type
export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: string; // ISO date string
  read: boolean;
}

// File transfer status
export enum TransferStatus {
  Pending = "Pending",
  InProgress = "InProgress",
  Completed = "Completed",
  Rejected = "Rejected",
  Cancelled = "Cancelled",
  Failed = "Failed"
}

// File transfer type
export interface FileTransfer {
  id: string;
  senderId: string;
  recipientId: string;
  senderIp?: string;
  recipientIp?: string;
  fileName: string;
  fileSize: number;
  sourcePath?: string;
  destinationPath?: string;
  status: TransferStatus;
  bytesTransferred: number;
  timestamp: string; // ISO date string
  error?: string;
}

// Conversation item type - can be either a message or file transfer
export interface ConversationItem {
  id: string;
  type: 'message' | 'file';
  senderId: string;
  recipientId: string;
  timestamp: string;
  read?: boolean;
  // Message-specific fields
  content?: string;
  // File transfer-specific fields
  fileName?: string;
  fileSize?: number;
  status?: TransferStatus;
  bytesTransferred?: number;
  error?: string;
}

// Conversation type (for UI)
export interface Conversation {
  peer: User;
  items: ConversationItem[]; // Changed from messages to items
  unreadCount: number;
  lastItem?: ConversationItem; // Changed from lastMessage to lastItem
}

// App settings
export interface AppSettings {
  username: string;
  darkMode: boolean;
  notifications: boolean;
  downloadPath: string;
  autoAcceptFiles: boolean;
  maxFileSize: number; // in bytes
}

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
  fileName: string;
  fileSize: number;
  sourcePath?: string;
  destinationPath?: string;
  status: TransferStatus;
  bytesTransferred: number;
  timestamp: string; // ISO date string
  error?: string;
}

// Conversation type (for UI)
export interface Conversation {
  peer: User;
  messages: Message[];
  unreadCount: number;
  lastMessage?: Message;
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

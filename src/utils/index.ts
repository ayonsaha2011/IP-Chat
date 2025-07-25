import { format, formatDistanceToNow } from 'date-fns';
import { filesize } from 'filesize';
import { TransferStatus, Message, User, Conversation, ConversationItem, FileTransfer } from '../types';

/**
 * Formats a date as a string
 * @param date Date to format
 * @param formatStr Format string
 * @returns Formatted date string
 */
export function formatDate(date: string | Date, formatStr: string = 'PPp'): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error, 'Date:', date);
    return 'Invalid Date';
  }
}

/**
 * Formats a date as a relative time string
 * @param date Date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Unknown';
    }
    
    return formatDistanceToNow(dateObj, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting relative time:', error, 'Date:', date);
    return 'Unknown';
  }
}

/**
 * Formats a file size in bytes to a human-readable string
 * @param bytes File size in bytes
 * @returns Human-readable file size string
 */
export function formatFileSize(bytes: number): string {
  return filesize(bytes, { base: 2, standard: 'jedec' }) as string;
}

/**
 * Calculates the progress percentage of a file transfer
 * @param bytesTransferred Bytes transferred
 * @param totalBytes Total bytes
 * @returns Progress percentage (0-100)
 */
export function calculateProgress(bytesTransferred: number, totalBytes: number): number {
  if (totalBytes === 0) return 0;
  const progress = (bytesTransferred / totalBytes) * 100;
  return Math.min(Math.round(progress * 10) / 10, 100); // Round to 1 decimal place, max 100%
}

/**
 * Gets the status color for a transfer status
 * @param status Transfer status
 * @returns Color string
 */
export function getStatusColor(status: TransferStatus): string {
  switch (status) {
    case TransferStatus.Pending:
      return 'blue';
    case TransferStatus.InProgress:
      return 'orange';
    case TransferStatus.Completed:
      return 'green';
    case TransferStatus.Rejected:
    case TransferStatus.Cancelled:
      return 'gray';
    case TransferStatus.Failed:
      return 'red';
    default:
      return 'gray';
  }
}

/**
 * Gets the status text for a transfer status
 * @param status Transfer status
 * @returns Status text
 */
export function getStatusText(status: TransferStatus): string {
  switch (status) {
    case TransferStatus.Pending:
      return 'Pending';
    case TransferStatus.InProgress:
      return 'In Progress';
    case TransferStatus.Completed:
      return 'Completed';
    case TransferStatus.Rejected:
      return 'Rejected';
    case TransferStatus.Cancelled:
      return 'Cancelled';
    case TransferStatus.Failed:
      return 'Failed';
    default:
      return 'Unknown';
  }
}

/**
 * Converts a message to a conversation item
 */
function messageToConversationItem(message: Message): ConversationItem {
  return {
    id: message.id,
    type: 'message',
    senderId: message.senderId,
    recipientId: message.recipientId,
    timestamp: message.timestamp,
    read: message.read,
    content: message.content,
  };
}

/**
 * Converts a file transfer to a conversation item
 */
function fileTransferToConversationItem(transfer: FileTransfer): ConversationItem {
  return {
    id: transfer.id,
    type: 'file',
    senderId: transfer.senderId,
    recipientId: transfer.recipientId,
    timestamp: transfer.timestamp,
    read: transfer.status === TransferStatus.Completed, // Files are considered "read" when completed
    fileName: transfer.fileName,
    fileSize: transfer.fileSize,
    status: transfer.status,
    bytesTransferred: transfer.bytesTransferred,
    error: transfer.error,
  };
}

/**
 * Groups messages and file transfers by peer to create conversations
 * @param messages List of messages
 * @param fileTransfers List of file transfers (optional)
 * @param peers List of peers
 * @param localUserId Local user ID
 * @returns List of conversations
 */
export function createConversations(
  messages: Message[],
  fileTransfers: FileTransfer[] = [],
  peers: User[],
  localUserId: string
): Conversation[] {
  // Create a map of peer IDs to peers
  const peerMap = new Map<string, User>();
  peers.forEach(peer => peerMap.set(peer.id, peer));

  // Group items by peer ID
  const conversationMap = new Map<string, Conversation>();

  // Convert messages to conversation items
  const messageItems = messages.map(messageToConversationItem);
  
  // Convert file transfers to conversation items
  const fileItems = fileTransfers.map(fileTransferToConversationItem);
  
  // Combine all items
  const allItems = [...messageItems, ...fileItems];

  allItems.forEach((item) => {
    // Determine the peer ID (the other party in the conversation)
    const peerId = item.senderId === localUserId ? item.recipientId : item.senderId;
    
    // Get or create the conversation
    if (!conversationMap.has(peerId)) {
      const peer = peerMap.get(peerId);
      if (!peer) {
        // Create a placeholder peer for conversations with unknown peers
        const placeholderPeer: User = {
          id: peerId,
          name: `Unknown User (${peerId.substring(0, 8)})`,
          ip: 'Unknown',
          lastSeen: new Date().toISOString()
        };
        
        conversationMap.set(peerId, {
          peer: placeholderPeer,
          items: [],
          unreadCount: 0,
        });
      } else {
        conversationMap.set(peerId, {
          peer,
          items: [],
          unreadCount: 0,
        });
      }
    }
    
    const conversation = conversationMap.get(peerId)!;
    
    // Add item to conversation
    conversation.items.push(item);
    
    // Update unread count
    if (item.senderId !== localUserId && !item.read) {
      conversation.unreadCount++;
    }
    
    // Update last item
    if (!conversation.lastItem || new Date(item.timestamp) > new Date(conversation.lastItem.timestamp)) {
      conversation.lastItem = item;
    }
  });

  // Sort items within conversations by timestamp
  conversationMap.forEach(conversation => {
    conversation.items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  });

  const conversations = Array.from(conversationMap.values())
    .sort((a, b) => {
      if (!a.lastItem) return 1;
      if (!b.lastItem) return -1;
      return new Date(b.lastItem.timestamp).getTime() - new Date(a.lastItem.timestamp).getTime();
    });

  return conversations;
}

/**
 * Generates a random color based on a string
 * @param str String to generate color from
 * @returns Hex color string
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 40%)`;
}

/**
 * Gets the initials from a name
 * @param name Name to get initials from
 * @returns Initials (up to 2 characters)
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

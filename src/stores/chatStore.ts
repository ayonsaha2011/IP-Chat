import { createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { Message, Conversation, FileTransfer } from '../types';
import { createConversations } from '../utils';
import toast from 'solid-toast';

// Create signals for chat state
const [messages, setMessages] = createSignal<Message[]>([]);
const [fileTransfers, setFileTransfers] = createSignal<FileTransfer[]>([]);
const [conversations, setConversations] = createSignal<Conversation[]>([]);
const [activeConversationId, setActiveConversationId] = createSignal<string | null>(null);
const [isLoading, setIsLoading] = createSignal(true);
const [error, setError] = createSignal<string | null>(null);

// Track initialization state
let isInitialized = false;

// Notification helper functions
async function showNotification(title: string, body: string) {
  try {
    let permissionGranted = await isPermissionGranted();
    
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    
    if (permissionGranted) {
      await sendNotification({
        title,
        body,
        icon: 'icons/32x32.png'
      });
    }
  } catch (error) {
    console.warn('Failed to show notification:', error);
  }
}

function getPeerName(peerId: string): string {
  const globalUserStore = (window as any).__userStore;
  if (globalUserStore) {
    const peer = globalUserStore.getPeerById(peerId);
    return peer?.name || `User ${peerId.substring(0, 8)}`;
  }
  return `User ${peerId.substring(0, 8)}`;
}

// Initialize the chat store
async function initChatStore() {
  // Prevent multiple initialization
  if (isInitialized) {
    return;
  }
  
  try {
    setIsLoading(true);
    setError(null);
    isInitialized = true;
    
    
    // Load messages (with timeout to prevent hanging)
    try {
      await Promise.race([
        refreshMessages(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout loading messages')), 5000)
        )
      ]);
    } catch (err) {
      // Failed to load initial messages, continuing anyway
      // Don't fail initialization if messages can't be loaded
    }
    
    // Set up event listeners for real-time updates
    const setupEventListeners = async () => {
      // Listen for message sent events
      const unlistenMessageSent = await listen<Message>('message_sent', (event) => {
        const message = event.payload;
        setMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.some(m => m.id === message.id);
          if (!exists) {
            return [...prev, message];
          }
          return prev;
        });
        
        // Update conversations
        const globalUserStore = (window as any).__userStore;
        if (globalUserStore) {
          const localUserId = globalUserStore.localUser()?.id;
          const peers = globalUserStore.peers();
          if (localUserId) {
            updateConversations(messages(), fileTransfers(), { localUserId, peers });
          }
        }
      });
      
      // Listen for message received events
      const unlistenMessageReceived = await listen<Message>('message_received', (event) => {
        const message = event.payload;
        setMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.some(m => m.id === message.id);
          if (!exists) {
            return [...prev, message];
          }
          return prev;
        });
        
        // Update conversations
        const globalUserStore = (window as any).__userStore;
        if (globalUserStore) {
          const localUserId = globalUserStore.localUser()?.id;
          const peers = globalUserStore.peers();
          if (localUserId) {
            updateConversations(messages(), fileTransfers(), { localUserId, peers });
          }
        }
        
        // Show notifications for new messages
        const peerName = getPeerName(message.senderId);
        toast.success(`New message from ${peerName}`);
        showNotification(`New message from ${peerName}`, message.content);
      });
      
      // Listen for messages read events
      const unlistenMessagesRead = await listen<string>('messages_read', (event) => {
        const peerId = event.payload;
        // Update messages read status
        setMessages(prev => 
          prev.map(msg => 
            msg.senderId === peerId && !msg.read
              ? { ...msg, read: true }
              : msg
          )
        );
        
        // Update conversations
        const globalUserStore = (window as any).__userStore;
        if (globalUserStore) {
          const localUserId = globalUserStore.localUser()?.id;
          const peers = globalUserStore.peers();
          if (localUserId) {
            updateConversations(messages(), fileTransfers(), { localUserId, peers });
          }
        }
      });
      
      // Listen for file transfer update events
      const unlistenFileTransferUpdate = await listen<FileTransfer>('file_transfer_update', (event) => {
        const transfer = event.payload;
        setFileTransfers(prev => {
          // Check if transfer already exists to prevent duplicates
          const exists = prev.some(t => t.id === transfer.id);
          if (!exists) {
            return [...prev, transfer];
          } else {
            // Update existing transfer
            return prev.map(t => t.id === transfer.id ? transfer : t);
          }
        });
        
        // Update conversations
        const globalUserStore = (window as any).__userStore;
        if (globalUserStore) {
          const localUserId = globalUserStore.localUser()?.id;
          const peers = globalUserStore.peers();
          if (localUserId) {
            updateConversations(messages(), fileTransfers(), { localUserId, peers });
          }
        }
        
        // Show notifications for file transfers
        const peerName = getPeerName(transfer.senderId);
        if (transfer.senderId !== globalUserStore.localUser()?.id) {
          if (transfer.status === 'Pending') {
            showNotification(`New file from ${peerName}`, `${transfer.fileName} (${(transfer.fileSize / 1024 / 1024).toFixed(1)} MB)`);
            toast.success(`File received from ${peerName}: ${transfer.fileName}`);
          } else if (transfer.status === 'Completed') {
            showNotification('File transfer completed', `${transfer.fileName} from ${peerName}`);
            toast.success(`File transfer completed: ${transfer.fileName}`);
          } else if (transfer.status === 'Failed') {
            showNotification('File transfer failed', `${transfer.fileName} from ${peerName}`);
            toast.error(`File transfer failed: ${transfer.fileName}`);
          }
        }
      });
      
      // Store cleanup functions
      (window as any).__chatStoreCleanup = () => {
        unlistenMessageSent();
        unlistenMessageReceived();
        unlistenMessagesRead();
        unlistenFileTransferUpdate();
      };
    };
    
    // Setup event listeners
    setupEventListeners().catch(err => {
      console.error('Failed to setup chat event listeners:', err);
    });
    
    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
      if ((window as any).__chatStoreCleanup) {
        (window as any).__chatStoreCleanup();
      }
    });
    
    
  } catch (err) {
    console.error('Failed to initialize chat store:', err);
    setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to initialize chat: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setIsLoading(false);
  }
}

// Refresh messages and file transfers
async function refreshMessages() {
  try {
    const allMessages = await invoke<Message[]>('get_messages');
    const allFileTransfers = await invoke<FileTransfer[]>('get_file_transfers');
    
    setMessages(allMessages);
    setFileTransfers(allFileTransfers);
    
    // Get user data for conversation update
    const globalUserStore = (window as any).__userStore;
    if (globalUserStore) {
      const localUserId = globalUserStore.localUser()?.id;
      const peers = globalUserStore.peers();
      if (localUserId) {
        updateConversations(allMessages, allFileTransfers, { localUserId, peers });
      }
    }
    
    // Mark messages as read if there's an active conversation
    const activeId = activeConversationId();
    if (activeId) {
      markMessagesAsRead(activeId);
    }
  } catch (err) {
    console.error('Chat store: Failed to refresh messages:', err instanceof Error ? err.message : String(err));
    setError(`Failed to refresh messages: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Update conversations based on messages, file transfers and peers
function updateConversations(allMessages: Message[], allFileTransfers: FileTransfer[], peersData?: { localUserId: string, peers: any[] }) {
  let localId: string | undefined;
  let currentPeers: any[] = [];
  
  if (peersData) {
    localId = peersData.localUserId;
    currentPeers = peersData.peers;
  } else {
    // Try to get the data from window context if available
    const globalUserStore = (window as any).__userStore;
    if (globalUserStore) {
      localId = globalUserStore.localUser()?.id;
      currentPeers = globalUserStore.peers();
    }
  }
  
  if (!localId) {
    return;
  }
  
  const newConversations = createConversations(
    allMessages,
    allFileTransfers,
    currentPeers,
    localId
  );
  
  setConversations(newConversations);
}

// Create or get a conversation for a peer (used when starting a new chat)
function ensureConversationForPeer(peerId: string, peerData?: any): Conversation | undefined {
  // Check if conversation already exists
  let conversation = getConversationByPeerId(peerId);
  if (conversation) {
    return conversation;
  }
  
  // Try to get peer data from passed parameter or global context
  let peer = peerData;
  if (!peer) {
    const globalUserStore = (window as any).__userStore;
    if (globalUserStore) {
      peer = globalUserStore.getPeerById(peerId);
    }
  }
  
  if (peer) {
    conversation = {
      peer,
      items: [],
      unreadCount: 0,
    };
    
    // Add the new conversation to our list
    setConversations(prev => [...prev, conversation!]);
    return conversation;
  }
  
  return undefined;
}

// Send a message to a peer
async function sendMessage(peerId: string, content: string) {
  try {
    const message = await invoke<Message>('send_message', { peerId, content });
    
    // Don't add message here - the backend will emit message_sent event
    // which will add it to the UI automatically to prevent duplicates
    
    return message;
  } catch (err) {
    console.error('Failed to send message:', err instanceof Error ? err.message : String(err));
    const errorMessage = err instanceof Error ? err.message : String(err);
    setError(`Failed to send message: ${errorMessage}`);
    toast.error(`Failed to send message: ${errorMessage}`);
    throw err;
  }
}

// Mark messages from a peer as read
async function markMessagesAsRead(peerId: string) {
  try {
    await invoke('mark_messages_as_read', { peerId });
    
    // Update messages
    setMessages(prev => 
      prev.map(msg => 
        msg.senderId === peerId && !msg.read
          ? { ...msg, read: true }
          : msg
      )
    );
    
    // Update conversations
    const globalUserStore = (window as any).__userStore;
    if (globalUserStore) {
      const localUserId = globalUserStore.localUser()?.id;
      const peers = globalUserStore.peers();
      if (localUserId) {
        updateConversations(messages(), fileTransfers(), { localUserId, peers });
      }
    }
  } catch (err) {
    console.error('Failed to mark messages as read:', err);
    setError(`Failed to mark messages as read: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Get a conversation by peer ID
function getConversationByPeerId(peerId: string): Conversation | undefined {
  return conversations().find(conv => conv.peer.id === peerId);
}

// Get the active conversation
function getActiveConversation(): Conversation | undefined {
  const activeId = activeConversationId();
  if (!activeId) return undefined;
  
  // Ensure conversation exists for this peer (create if needed)
  return ensureConversationForPeer(activeId);
}

// Export the chat store
export const chatStore = {
  messages,
  fileTransfers,
  conversations,
  activeConversationId,
  setActiveConversationId,
  isLoading,
  error,
  initChatStore,
  refreshMessages,
  sendMessage,
  markMessagesAsRead,
  getConversationByPeerId,
  getActiveConversation,
  ensureConversationForPeer,
};

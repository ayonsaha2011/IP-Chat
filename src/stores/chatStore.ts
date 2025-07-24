import { createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Message, Conversation } from '../types';
import { createConversations } from '../utils';
import toast from 'solid-toast';

// Create signals for chat state
const [messages, setMessages] = createSignal<Message[]>([]);
const [conversations, setConversations] = createSignal<Conversation[]>([]);
const [activeConversationId, setActiveConversationId] = createSignal<string | null>(null);
const [isLoading, setIsLoading] = createSignal(true);
const [error, setError] = createSignal<string | null>(null);

// Initialize the chat store
async function initChatStore() {
  try {
    setIsLoading(true);
    setError(null);
    
    console.log('Chat store: Starting initialization...');
    
    // Load messages (with timeout to prevent hanging)
    try {
      await Promise.race([
        refreshMessages(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout loading messages')), 5000)
        )
      ]);
    } catch (err) {
      console.warn('Chat store: Failed to load initial messages, continuing anyway:', err);
      // Don't fail initialization if messages can't be loaded
    }
    
    // Set up periodic message refresh
    const intervalId = setInterval(() => {
      refreshMessages().catch(err => {
        console.warn('Chat store: Failed to refresh messages:', err);
      });
    }, 5000); // Refresh every 5 seconds
    
    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
      clearInterval(intervalId);
    });
    
    console.log('Chat store: Initialization completed');
    
  } catch (err) {
    console.error('Failed to initialize chat store:', err);
    setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to initialize chat: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setIsLoading(false);
  }
}

// Refresh messages
async function refreshMessages() {
  try {
    const allMessages = await invoke<Message[]>('get_messages');
    
    if (messages().length !== allMessages.length) {
      console.log(`Chat store: Retrieved ${allMessages.length} messages (was ${messages().length})`);
    }
    
    setMessages(allMessages);
    
    // Get user data for conversation update
    const globalUserStore = (window as any).__userStore;
    if (globalUserStore) {
      const localUserId = globalUserStore.localUser()?.id;
      const peers = globalUserStore.peers();
      if (localUserId) {
        updateConversations(allMessages, { localUserId, peers });
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

// Update conversations based on messages and peers
function updateConversations(allMessages: Message[], peersData?: { localUserId: string, peers: any[] }) {
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
    console.warn('Chat store: No local user ID available for conversation update');
    return;
  }
  
  const newConversations = createConversations(
    allMessages,
    currentPeers,
    localId
  );
  
  if (conversations().length !== newConversations.length) {
    console.log(`Chat store: Updated conversations: ${newConversations.length} (${currentPeers.length} peers available)`);
  }
  
  setConversations(newConversations);
}

// Create or get a conversation for a peer (used when starting a new chat)
function ensureConversationForPeer(peerId: string, peerData?: any): Conversation | undefined {
  console.log('Chat store: ensureConversationForPeer called with:', peerId);
  
  // Check if conversation already exists
  let conversation = getConversationByPeerId(peerId);
  if (conversation) {
    console.log('Chat store: Found existing conversation for:', conversation.peer.name);
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
  
  console.log('Chat store: Found peer data:', peer ? `${peer.name} (${peer.id})` : 'none');
  
  if (peer) {
    console.log('Chat store: Creating new conversation for peer:', peer.name);
    conversation = {
      peer,
      messages: [],
      unreadCount: 0,
    };
    
    // Add the new conversation to our list
    setConversations(prev => {
      const updated = [...prev, conversation!];
      console.log('Chat store: Added new conversation, total conversations:', updated.length);
      return updated;
    });
    
    return conversation;
  }
  
  console.warn('Chat store: Could not find peer with ID:', peerId);
  return undefined;
}

// Send a message to a peer
async function sendMessage(peerId: string, content: string) {
  try {
    console.log(`Chat store: Sending message to ${peerId}`);
    
    const message = await invoke<Message>('send_message', { peerId, content });
    
    console.log(`Chat store: Message sent successfully (ID: ${message.id})`);
    
    // Update messages
    setMessages(prev => [...prev, message]);
    
    // Update conversations
    const globalUserStore = (window as any).__userStore;
    if (globalUserStore) {
      const localUserId = globalUserStore.localUser()?.id;
      const peers = globalUserStore.peers();
      if (localUserId) {
        updateConversations([...messages(), message], { localUserId, peers });
      }
    }
    
    return message;
  } catch (err) {
    console.error('Chat store: Failed to send message:', err instanceof Error ? err.message : String(err));
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
        updateConversations(messages(), { localUserId, peers });
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
  console.log('Chat store: getActiveConversation - activeId:', activeId);
  
  if (!activeId) {
    console.log('Chat store: No active conversation ID');
    return undefined;
  }
  
  // Ensure conversation exists for this peer (create if needed)
  const conversation = ensureConversationForPeer(activeId);
  console.log('Chat store: Final conversation result:', conversation ? `${conversation.peer.name}` : 'none');
  
  return conversation;
}

// Export the chat store
export const chatStore = {
  messages,
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

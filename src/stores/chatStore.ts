import { createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Message, Conversation } from '../types';
import { userStore } from './userStore';
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
    setMessages(allMessages);
    
    // Update conversations
    updateConversations(allMessages);
    
    // Mark messages as read if there's an active conversation
    const activeId = activeConversationId();
    if (activeId) {
      markMessagesAsRead(activeId);
    }
  } catch (err) {
    console.error('Failed to refresh messages:', err);
    setError(`Failed to refresh messages: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Update conversations based on messages and peers
function updateConversations(allMessages: Message[]) {
  const localId = userStore.localUser()?.id;
  if (!localId) return;
  
  const newConversations = createConversations(
    allMessages,
    userStore.peers(),
    localId
  );
  
  setConversations(newConversations);
}

// Send a message to a peer
async function sendMessage(peerId: string, content: string) {
  try {
    const message = await invoke<Message>('send_message', { peerId, content });
    
    // Update messages
    setMessages(prev => [...prev, message]);
    
    // Update conversations
    updateConversations([...messages(), message]);
    
    return message;
  } catch (err) {
    console.error('Failed to send message:', err);
    setError(`Failed to send message: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to send message: ${err instanceof Error ? err.message : String(err)}`);
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
    updateConversations(messages());
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
  return getConversationByPeerId(activeId);
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
};

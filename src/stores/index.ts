// Export all stores from a single location
import { userStore } from './userStore';
import { chatStore } from './chatStore';
import { fileTransferStore } from './fileTransferStore';
import { settingsStore } from './settingsStore';

// Re-export the stores
export { userStore, chatStore, fileTransferStore, settingsStore };

// Initialize all stores
export async function initializeStores() {
  try {
    
    // Clean up any existing services first (only if they were previously initialized)
    try {
      // Only cleanup if discovery is actually running
      if (userStore.isDiscoveryRunning()) {
        await userStore.cleanup();
      } else {
      }
    } catch (err) {
    }
    
    // Initialize settings first
    await settingsStore.initSettingsStore();
    
    // Initialize user store
    await userStore.initUserStore();
    
    // Initialize chat store
    await chatStore.initChatStore();
    
    // Initialize file transfer store
    await fileTransferStore.initFileTransferStore();
    
  } catch (error) {
    console.error('Failed to initialize stores:', error);
    throw error;
  }
}

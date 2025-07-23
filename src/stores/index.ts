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
    console.log('Starting store initialization...');
    
    // Clean up any existing services first (only if they were previously initialized)
    try {
      // Only cleanup if discovery is actually running
      if (userStore.isDiscoveryRunning()) {
        await userStore.cleanup();
      } else {
        console.log('No running services to clean up');
      }
    } catch (err) {
      console.log('Non-critical error during cleanup:', err);
    }
    
    // Initialize settings first
    console.log('Initializing settings store...');
    await settingsStore.initSettingsStore();
    console.log('Settings store initialized successfully');
    
    // Initialize user store
    console.log('Initializing user store...');
    await userStore.initUserStore();
    console.log('User store initialized successfully');
    
    // Initialize chat store
    console.log('Initializing chat store...');
    await chatStore.initChatStore();
    console.log('Chat store initialized successfully');
    
    // Initialize file transfer store
    console.log('Initializing file transfer store...');
    await fileTransferStore.initFileTransferStore();
    console.log('File transfer store initialized successfully');
    
    console.log('All stores initialized successfully');
  } catch (error) {
    console.error('Failed to initialize stores:', error);
    throw error;
  }
}

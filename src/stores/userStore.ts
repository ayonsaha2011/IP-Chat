import { createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { User } from '../types';
import toast from 'solid-toast';

// Create signals for user state
const [localUser, setLocalUser] = createSignal<User | null>(null);
const [peers, setPeers] = createSignal<User[]>([]);
const [isDiscoveryRunning, setIsDiscoveryRunning] = createSignal(false);
const [isLoading, setIsLoading] = createSignal(true);
const [error, setError] = createSignal<string | null>(null);

// Initialize the user store
async function initUserStore() {
  try {
    setIsLoading(true);
    setError(null);
    
    
    // Clean up any existing discovery first
    try {
      await invoke('stop_discovery');
    } catch (err) {
      // Ignore errors if discovery wasn't running
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('Discovery not running') || errorMessage.includes('not running')) {
      } else {
      }
    }
    
    // Get local user info with timeout
    const user = await Promise.race([
      invoke<User>('get_local_user'),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout getting local user info')), 10000)
      )
    ]);
    setLocalUser(user);
    
    // Start network discovery (with fallback)
    try {
      await startDiscovery();
    } catch (err) {
      // Don't throw here, just log the warning and continue
    }
    
    // Set up periodic peer refresh after a delay
    setTimeout(() => {
      const intervalId = setInterval(() => {
        refreshPeers().catch(() => {});
      }, 10000); // Refresh every 10 seconds
      
      // Clean up on window unload
      window.addEventListener('beforeunload', () => {
        clearInterval(intervalId);
        stopDiscovery().catch(() => {});
      });
    }, 2000); // Start periodic refresh after 2 seconds
    
    
  } catch (err) {
    console.error('Failed to initialize user store:', err);
    setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setIsLoading(false);
  }
}

// Start network discovery
async function startDiscovery() {
  try {
    // First, try to stop any existing discovery to ensure clean state
    try {
      await invoke('stop_discovery');
    } catch (err) {
      // Ignore errors if discovery wasn't running
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('Discovery not running') || errorMessage.includes('not running')) {
      } else {
      }
    }
    
    // Wait a bit before starting new discovery
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await Promise.race([
      invoke('start_discovery'),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout starting discovery')), 5000)
      )
    ]);
    setIsDiscoveryRunning(true);
    
    await Promise.race([
      refreshPeers(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout refreshing peers')), 3000)
      )
    ]);
  } catch (err) {
    console.error('Failed to start discovery:', err);
    setError(`Failed to start discovery: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to start discovery: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Stop network discovery
async function stopDiscovery() {
  try {
    await invoke('stop_discovery');
    setIsDiscoveryRunning(false);
  } catch (err) {
    // Check if the error is because discovery wasn't running
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('Discovery not running') || errorMessage.includes('not running')) {
      setIsDiscoveryRunning(false);
    } else {
      console.error('Failed to stop discovery:', err);
      setError(`Failed to stop discovery: ${errorMessage}`);
      // Don't show toast for this error as it's not critical
    }
  }
}

// Refresh the list of peers
async function refreshPeers() {
  try {
    const discoveredPeers = await Promise.race([
      invoke<User[]>('get_discovered_peers'),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout getting discovered peers')), 3000)
      )
    ]);
    
    setPeers(discoveredPeers);
  } catch (err) {
    console.error('Failed to refresh peers:', err instanceof Error ? err.message : String(err));
    setError(`Failed to refresh peers: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Update the local user's username
async function updateUsername(username: string) {
  try {
    const updatedUser = await invoke<User>('update_username', { username });
    setLocalUser(updatedUser);
    toast.success('Username updated successfully');
    return true;
  } catch (err) {
    console.error('Failed to update username:', err);
    setError(`Failed to update username: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to update username: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// Get a peer by ID
function getPeerById(id: string): User | undefined {
  return peers().find(peer => peer.id === id);
}

// Cleanup function
async function cleanup() {
  try {
    await stopDiscovery();
  } catch (err) {
    // Log the error but don't treat it as critical
  }
}

// Export the user store
export const userStore = {
  localUser,
  peers,
  isDiscoveryRunning,
  isLoading,
  error,
  initUserStore,
  startDiscovery,
  stopDiscovery,
  refreshPeers,
  updateUsername,
  getPeerById,
  cleanup,
};

// Make userStore available globally to avoid circular dependencies
(window as any).__userStore = userStore;

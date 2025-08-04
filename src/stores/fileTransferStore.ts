import { createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { FileTransfer, TransferStatus } from '../types';
import { userStore } from './userStore';
import toast from 'solid-toast';

// Create signals for file transfer state
const [transfers, setTransfers] = createSignal<FileTransfer[]>([]);
const [activeTransferId, setActiveTransferId] = createSignal<string | null>(null);
const [isLoading, setIsLoading] = createSignal(true);
const [error, setError] = createSignal<string | null>(null);

// Track initialization state
let isInitialized = false;

// Initialize the file transfer store
async function initFileTransferStore() {
  // Prevent multiple initialization
  if (isInitialized) {
    return;
  }

  try {
    setIsLoading(true);
    setError(null);
    isInitialized = true;


    // Load transfers (with timeout to prevent hanging)
    try {
      await Promise.race([
        refreshTransfers(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout loading transfers')), 5000)
        )
      ]);
    } catch (err) {
      // Failed to load initial transfers, continuing anyway
      // Don't fail initialization if transfers can't be loaded
    }

    // Set up event listeners for real-time file transfer updates
    const setupEventListeners = async () => {
      // Listen for file transfer update events
      const unlistenFileTransferUpdate = await listen<FileTransfer>('file_transfer_update', (event) => {
        const transfer = event.payload;
        setTransfers(prev => {
          // Check if transfer already exists to prevent duplicates
          const exists = prev.some(t => t.id === transfer.id);
          if (!exists) {
            return [...prev, transfer];
          } else {
            // Update existing transfer
            return prev.map(t => t.id === transfer.id ? transfer : t);
          }
        });
      });

      // Listen for file transfers updated events
      const unlistenFileTransfersUpdate = await listen<FileTransfer[]>('file_transfers_update', (event) => {
        const transfersList = event.payload;
        setTransfers(transfersList);
      });

      // Store cleanup functions
      (window as any).__fileTransferStoreCleanup = () => {
        unlistenFileTransferUpdate();
        unlistenFileTransfersUpdate();
      };
    };

    // Setup event listeners
    setupEventListeners().catch(err => {
      console.error('Failed to setup file transfer event listeners:', err);
    });

    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
      if ((window as any).__fileTransferStoreCleanup) {
        (window as any).__fileTransferStoreCleanup();
      }
    });


  } catch (err) {
    console.error('Failed to initialize file transfer store:', err);
    setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to initialize file transfers: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setIsLoading(false);
  }
}

// Refresh transfers
async function refreshTransfers() {
  try {
    const allTransfers = await invoke<FileTransfer[]>('get_file_transfers');
    setTransfers(allTransfers);
  } catch (err) {
    console.error('Failed to refresh transfers:', err);
    setError(`Failed to refresh transfers: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Send a file to a peer
async function sendFile(peerId: string) {
  try {
    // Open file dialog
    const selected = await open({
      multiple: false, // set true if you want multiple file selection
      directory: false, // must be false to select files
      defaultPath: '',
      title: 'Select File to Send'
    });

    if (!selected) return null; // User cancelled

    const filePath = Array.isArray(selected) ? selected[0] : selected;

    // Send the file
    const transfer = await invoke<FileTransfer>('send_file', { peerId, filePath });

    // Update transfers
    setTransfers(prev => [...prev, transfer]);

    toast.success(`File transfer initiated: ${transfer.fileName}`);

    return transfer;
  } catch (err) {
    console.error('Failed to send file:', err);
    setError(`Failed to send file: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to send file: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// Accept a file transfer
async function acceptFileTransfer(transferId: string) {
  try {
    // Get the transfer
    const transfer = getTransferById(transferId);
    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    // Open save dialog
    const savePath = await save({
      defaultPath: transfer.fileName,
      filters: [{
        name: 'All Files',
        extensions: ['*']
      }]
    });

    if (!savePath) return false; // User cancelled

    // Accept the transfer
    await invoke('accept_file_transfer', { transferId, savePath });

    // Update transfers
    await refreshTransfers();

    toast.success(`Accepted file transfer: ${transfer.fileName}`);

    return true;
  } catch (err) {
    console.error('Failed to accept file transfer:', err);
    setError(`Failed to accept file transfer: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to accept file transfer: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// Reject a file transfer
async function rejectFileTransfer(transferId: string) {
  try {
    // Get the transfer
    const transfer = getTransferById(transferId);
    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    // Reject the transfer
    await invoke('reject_file_transfer', { transferId });

    // Update transfers
    await refreshTransfers();

    toast.success(`Rejected file transfer: ${transfer.fileName}`);

    return true;
  } catch (err) {
    console.error('Failed to reject file transfer:', err);
    setError(`Failed to reject file transfer: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to reject file transfer: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// Cancel a file transfer
async function cancelFileTransfer(transferId: string) {
  try {
    // Get the transfer
    const transfer = getTransferById(transferId);
    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    // Cancel the transfer
    await invoke('cancel_file_transfer', { transferId });

    // Update transfers
    await refreshTransfers();

    toast.success(`Cancelled file transfer: ${transfer.fileName}`);

    return true;
  } catch (err) {
    console.error('Failed to cancel file transfer:', err);
    setError(`Failed to cancel file transfer: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to cancel file transfer: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// Get a transfer by ID
function getTransferById(id: string): FileTransfer | undefined {
  return transfers().find(transfer => transfer.id === id);
}

// Get transfers for a peer
function getTransfersForPeer(peerId: string): FileTransfer[] {
  return transfers().filter(
    transfer => transfer.senderId === peerId || transfer.recipientId === peerId
  );
}

// Get pending transfers (transfers that need user action)
function getPendingTransfers(): FileTransfer[] {
  const localId = userStore.localUser()?.id;
  if (!localId) return [];

  return transfers().filter(
    transfer =>
      transfer.status === TransferStatus.Pending &&
      transfer.recipientId === localId
  );
}

// Get active transfers (transfers in progress)
function getActiveTransfers(): FileTransfer[] {
  return transfers().filter(
    transfer => transfer.status === TransferStatus.InProgress
  );
}

// Export the file transfer store
export const fileTransferStore = {
  transfers,
  activeTransferId,
  setActiveTransferId,
  isLoading,
  error,
  initFileTransferStore,
  refreshTransfers,
  sendFile,
  acceptFileTransfer,
  rejectFileTransfer,
  cancelFileTransfer,
  getTransferById,
  getTransfersForPeer,
  getPendingTransfers,
  getActiveTransfers,
};

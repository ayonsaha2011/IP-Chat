use log::{debug, error, info};
use std::collections::HashMap;
use std::fs::{metadata, File};
use std::io::{Read, Write};
use std::net::SocketAddr;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener as AsyncTcpListener, TcpStream as AsyncTcpStream};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{FileTransfer, TransferStatus, User};

const FILE_TRANSFER_PORT: u16 = 8766;
const CHUNK_SIZE: usize = 1024 * 64; // 64KB chunks

/// Manages file transfers
pub struct FileTransferManager {
    /// The local user
    local_user: User,
    /// Map of file transfers by ID
    transfers: Arc<Mutex<HashMap<String, FileTransfer>>>,
    /// Map of connections by peer ID
    #[allow(dead_code)]
    connections: Arc<Mutex<HashMap<String, AsyncTcpStream>>>,
    /// Listener for incoming connections
    #[allow(dead_code)]
    listener: Option<AsyncTcpListener>,
    /// Channel for stopping the file transfer service
    #[allow(dead_code)]
    stop_tx: Option<mpsc::Sender<()>>,
}

impl FileTransferManager {
    /// Creates a new FileTransferManager instance
    pub fn new(local_user: User) -> Self {
        FileTransferManager {
            local_user,
            transfers: Arc::new(Mutex::new(HashMap::new())),
            connections: Arc::new(Mutex::new(HashMap::new())),
            listener: None,
            stop_tx: None,
        }
    }

    /// Starts the file transfer service
    #[allow(dead_code)]
    pub async fn start_file_transfer_service(&mut self) -> AppResult<()> {
        // Bind to the file transfer port using async listener
        let listener = AsyncTcpListener::bind(format!("0.0.0.0:{FILE_TRANSFER_PORT}"))
            .await
            .map_err(|e| {
                AppError::NetworkError(format!("Failed to bind to port {FILE_TRANSFER_PORT}: {e}"))
            })?;

        // Set up channel for stopping the service
        let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);

        // Store listener and stop channel
        self.listener = Some(listener);
        self.stop_tx = Some(stop_tx);

        // Clone necessary values for the task
        let listener = self.listener.take().unwrap();
        let transfers = Arc::clone(&self.transfers);
        let connections = Arc::clone(&self.connections);
        let local_user = self.local_user.clone();

        // Spawn task to handle incoming connections
        tokio::spawn(async move {
            loop {
                // Check for stop signal
                if stop_rx.try_recv().is_ok() {
                    debug!("Stopping file transfer service");
                    break;
                }

                // Accept incoming connections
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        debug!("New file transfer connection from: {addr}");

                        // Clone necessary values for the connection handler
                        let transfers_clone = Arc::clone(&transfers);
                        let connections_clone = Arc::clone(&connections);
                        let local_user_clone = local_user.clone();

                        // Spawn task to handle the connection
                        tokio::spawn(async move {
                            if let Err(e) = handle_file_connection(
                                stream,
                                addr,
                                transfers_clone,
                                connections_clone,
                                local_user_clone,
                            )
                            .await
                            {
                                error!("Error handling file transfer connection: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        error!("Error accepting file transfer connection: {e}");
                        break;
                    }
                }
            }

            // Close all connections
            let mut connections = connections.lock().unwrap();
            connections.clear();
        });

        info!("File transfer service started");
        Ok(())
    }

    /// Stops the file transfer service
    #[allow(dead_code)]
    pub fn stop_file_transfer_service(&mut self) -> AppResult<()> {
        // Send stop signal
        if let Some(tx) = &self.stop_tx {
            if let Err(e) = tx.blocking_send(()) {
                error!("Failed to send stop signal: {e}");
            }
        }

        // Clear state
        self.listener = None;
        self.stop_tx = None;

        // Clear connections
        {
            let mut connections = self.connections.lock().unwrap();
            connections.clear();
        }

        info!("File transfer service stopped");
        Ok(())
    }

    /// Sends a file to a peer
    #[allow(dead_code)]
    pub async fn send_file(&mut self, _peer_id: &str, _file_path: &str) -> AppResult<FileTransfer> {
        // This method is kept for backward compatibility
        // Use send_file_with_peer instead
        Err(AppError::FileTransferError(
            "Use send_file_with_peer method instead".to_string(),
        ))
    }

    pub async fn send_file_with_peer(
        &mut self,
        peer_id: &str,
        file_path: &str,
        peer_ip: &str,
    ) -> AppResult<FileTransfer> {
        // Check if file exists
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(AppError::FileNotFound(file_path.to_string()));
        }

        // Get file metadata
        let meta = metadata(path).map_err(AppError::IoError)?;

        // Create file transfer
        let transfer = FileTransfer {
            id: Uuid::new_v4().to_string(),
            sender_id: self.local_user.id.clone(),
            recipient_id: peer_id.to_string(),
            sender_ip: Some(self.local_user.ip.clone()),
            recipient_ip: Some(peer_ip.to_string()),
            file_name: path.file_name().unwrap().to_string_lossy().to_string(),
            file_size: meta.len(),
            source_path: Some(file_path.to_string()),
            destination_path: None,
            status: TransferStatus::Pending,
            bytes_transferred: 0,
            timestamp: chrono::Utc::now(),
            error: None,
        };

        // Store transfer
        {
            let mut transfers = self.transfers.lock().unwrap();
            transfers.insert(transfer.id.clone(), transfer.clone());
        }

        // Send transfer request to peer
        self.send_transfer_request(peer_id, &transfer).await?;

        Ok(transfer)
    }

    /// Sends a file transfer request to a peer
    async fn send_transfer_request(
        &self,
        _peer_id: &str,
        transfer: &FileTransfer,
    ) -> AppResult<()> {
        // Get recipient IP address from transfer
        let recipient_ip = transfer.recipient_ip.as_ref().ok_or_else(|| {
            AppError::FileTransferError("Recipient IP address not available".to_string())
        })?;

        // Connect to the peer using their IP address
        let addr = format!("{recipient_ip}:{FILE_TRANSFER_PORT}");
        let mut stream = AsyncTcpStream::connect(addr)
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to connect to peer: {e}")))?;

        // Send the transfer request as JSON
        let transfer_json =
            serde_json::to_string(transfer).map_err(AppError::SerializationError)?;

        stream
            .write_all(transfer_json.as_bytes())
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to send transfer request: {e}")))?;

        stream.flush().await.map_err(|e| {
            AppError::NetworkError(format!("Failed to flush transfer request: {e}"))
        })?;

        Ok(())
    }

    /// Accepts a file transfer
    pub async fn accept_transfer(&mut self, transfer_id: &str, save_path: &str) -> AppResult<()> {
        // Get the transfer
        let transfer = {
            let mut transfers = self.transfers.lock().unwrap();
            let transfer = transfers
                .get_mut(transfer_id)
                .ok_or_else(|| AppError::TransferNotFound(transfer_id.to_string()))?;

            // Update transfer status
            transfer.status = TransferStatus::InProgress;
            transfer.destination_path = Some(save_path.to_string());

            transfer.clone()
        };

        // Start the file transfer
        self.start_file_transfer(&transfer).await?;

        Ok(())
    }

    /// Rejects a file transfer
    pub async fn reject_transfer(&mut self, transfer_id: &str) -> AppResult<()> {
        // Get the transfer
        let transfer = {
            let mut transfers = self.transfers.lock().unwrap();
            let transfer = transfers
                .get_mut(transfer_id)
                .ok_or_else(|| AppError::TransferNotFound(transfer_id.to_string()))?;

            // Update transfer status
            transfer.status = TransferStatus::Rejected;

            transfer.clone()
        };

        // Notify the sender
        self.notify_transfer_status(&transfer).await?;

        Ok(())
    }

    /// Cancels a file transfer
    pub async fn cancel_transfer(&mut self, transfer_id: &str) -> AppResult<()> {
        // Get the transfer
        let transfer = {
            let mut transfers = self.transfers.lock().unwrap();
            let transfer = transfers
                .get_mut(transfer_id)
                .ok_or_else(|| AppError::TransferNotFound(transfer_id.to_string()))?;

            // Update transfer status
            transfer.status = TransferStatus::Cancelled;

            transfer.clone()
        };

        // Notify the other party
        self.notify_transfer_status(&transfer).await?;

        Ok(())
    }

    /// Notifies the other party about a transfer status change
    async fn notify_transfer_status(&self, transfer: &FileTransfer) -> AppResult<()> {
        // Determine the recipient ID and IP (the other party)
        let (_recipient_id, recipient_ip) = if transfer.sender_id == self.local_user.id {
            (&transfer.recipient_id, transfer.recipient_ip.as_ref())
        } else {
            (&transfer.sender_id, transfer.sender_ip.as_ref())
        };

        // Get recipient IP address
        let recipient_ip = recipient_ip.ok_or_else(|| {
            AppError::FileTransferError("Recipient IP address not available".to_string())
        })?;

        // Connect to the recipient using their IP address
        let addr = format!("{recipient_ip}:{FILE_TRANSFER_PORT}");
        let mut stream = AsyncTcpStream::connect(addr)
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to connect to peer: {e}")))?;

        // Send the status update
        let transfer_json =
            serde_json::to_string(transfer).map_err(AppError::SerializationError)?;

        stream
            .write_all(transfer_json.as_bytes())
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to send status update: {e}")))?;

        Ok(())
    }

    /// Starts a file transfer
    async fn start_file_transfer(&self, transfer: &FileTransfer) -> AppResult<()> {
        // Clone necessary values for the task
        let transfer_clone = transfer.clone();
        let transfers = Arc::clone(&self.transfers);
        let local_user = self.local_user.clone();

        // Spawn task to handle the transfer
        tokio::spawn(async move {
            let result = if transfer_clone.sender_id == local_user.id {
                // We are the sender
                send_file_data(&transfer_clone, transfers.clone()).await
            } else {
                // We are the recipient
                receive_file_data(&transfer_clone, transfers.clone()).await
            };

            if let Err(e) = result {
                error!("Error during file transfer: {e}");

                // Update transfer status
                let mut transfers = transfers.lock().unwrap();
                if let Some(transfer) = transfers.get_mut(&transfer_clone.id) {
                    transfer.status = TransferStatus::Failed;
                    transfer.error = Some(e.to_string());
                }
            }
        });

        Ok(())
    }

    /// Gets transfers for a specific peer
    pub fn get_transfers_for_peer(&self, peer_id: &str) -> Vec<FileTransfer> {
        let transfers = self.transfers.lock().unwrap();
        transfers
            .values()
            .filter(|t| t.sender_id == peer_id || t.recipient_id == peer_id)
            .cloned()
            .collect()
    }

    /// Gets all transfers
    pub fn get_all_transfers(&self) -> Vec<FileTransfer> {
        let transfers = self.transfers.lock().unwrap();
        transfers.values().cloned().collect()
    }
}

/// Sends file data for a transfer
async fn send_file_data(
    transfer: &FileTransfer,
    transfers: Arc<Mutex<HashMap<String, FileTransfer>>>,
) -> AppResult<()> {
    // Get the source path
    let source_path = transfer
        .source_path
        .as_ref()
        .ok_or_else(|| AppError::FileTransferError("Source path not specified".to_string()))?;

    // Open the file
    let mut file = File::open(source_path).map_err(AppError::IoError)?;

    // Get recipient IP address
    let recipient_ip = transfer.recipient_ip.as_ref().ok_or_else(|| {
        AppError::FileTransferError("Recipient IP address not available".to_string())
    })?;

    // Connect to the recipient
    let addr = format!("{recipient_ip}:{FILE_TRANSFER_PORT}");
    let mut stream = AsyncTcpStream::connect(addr)
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to connect to recipient: {e}")))?;

    // Send a special header to indicate this is a file data transfer
    let header = format!("FILE_DATA:{}", transfer.id);
    stream
        .write_all(header.as_bytes())
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to send file data header: {e}")))?;

    // Send a newline to separate header from data
    stream
        .write_all(b"\n")
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to send header separator: {e}")))?;

    // Read and send file data in chunks
    let mut buffer = vec![0; CHUNK_SIZE];
    let mut bytes_sent = 0;

    loop {
        // Read a chunk from the file
        let bytes_read = file.read(&mut buffer).map_err(AppError::IoError)?;

        if bytes_read == 0 {
            // End of file
            break;
        }

        // Send the chunk
        stream
            .write_all(&buffer[..bytes_read])
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to send file chunk: {e}")))?;

        // Update progress
        bytes_sent += bytes_read as u64;

        // Update transfer status
        {
            let mut transfers = transfers.lock().unwrap();
            if let Some(transfer) = transfers.get_mut(&transfer.id) {
                transfer.bytes_transferred = bytes_sent;

                if bytes_sent >= transfer.file_size {
                    transfer.status = TransferStatus::Completed;
                }
            }
        }
    }

    info!("File transfer completed: {}", transfer.id);
    Ok(())
}

/// Receives file data for a transfer
async fn receive_file_data(
    transfer: &FileTransfer,
    transfers: Arc<Mutex<HashMap<String, FileTransfer>>>,
) -> AppResult<()> {
    // Get the destination path
    let dest_path = transfer
        .destination_path
        .as_ref()
        .ok_or_else(|| AppError::FileTransferError("Destination path not specified".to_string()))?;

    // Create the destination file
    let mut file = File::create(dest_path).map_err(AppError::IoError)?;

    // Get sender IP address
    let sender_ip = transfer.sender_ip.as_ref().ok_or_else(|| {
        AppError::FileTransferError("Sender IP address not available".to_string())
    })?;

    // Connect to the sender
    let addr = format!("{sender_ip}:{FILE_TRANSFER_PORT}");
    let mut stream = AsyncTcpStream::connect(addr)
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to connect to sender: {e}")))?;

    // Send a request for file data
    let request = format!("REQUEST_FILE:{}", transfer.id);
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to send file request: {e}")))?;

    // Send a newline to separate request from data
    stream
        .write_all(b"\n")
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to send request separator: {e}")))?;

    // Receive and write file data in chunks
    let mut buffer = vec![0; CHUNK_SIZE];
    let mut bytes_received = 0;

    loop {
        // Receive a chunk
        let bytes_read = stream
            .read(&mut buffer)
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to receive file chunk: {e}")))?;

        if bytes_read == 0 {
            // End of file
            break;
        }

        // Write the chunk to the file
        file.write_all(&buffer[..bytes_read])
            .map_err(AppError::IoError)?;

        // Update progress
        bytes_received += bytes_read as u64;

        // Update transfer status
        {
            let mut transfers = transfers.lock().unwrap();
            if let Some(transfer) = transfers.get_mut(&transfer.id) {
                transfer.bytes_transferred = bytes_received;

                if bytes_received >= transfer.file_size {
                    transfer.status = TransferStatus::Completed;
                }
            }
        }
    }

    info!("File transfer completed: {}", transfer.id);
    Ok(())
}

/// Handles an incoming file transfer connection
#[allow(dead_code)]
async fn handle_file_connection(
    stream: AsyncTcpStream,
    _addr: SocketAddr,
    transfers: Arc<Mutex<HashMap<String, FileTransfer>>>,
    _connections: Arc<Mutex<HashMap<String, AsyncTcpStream>>>,
    local_user: User,
) -> AppResult<()> {
    // Read the first line to determine the type of request
    let mut line = String::new();
    let mut reader = tokio::io::BufReader::new(stream);
    reader
        .read_line(&mut line)
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to read request line: {e}")))?;

    let line = line.trim();

    if line.starts_with("FILE_DATA:") {
        // This is a file data transfer
        let transfer_id = line.strip_prefix("FILE_DATA:").unwrap();

        // Get the transfer
        let transfer = {
            let transfers = transfers.lock().unwrap();
            transfers
                .get(transfer_id)
                .cloned()
                .ok_or_else(|| AppError::TransferNotFound(transfer_id.to_string()))?
        };

        // We are the recipient, receive the file data
        if transfer.recipient_id == local_user.id {
            // Read the rest of the data and write to file
            let dest_path = transfer.destination_path.as_ref().ok_or_else(|| {
                AppError::FileTransferError("Destination path not specified".to_string())
            })?;

            let mut file = File::create(dest_path).map_err(AppError::IoError)?;
            let mut buffer = vec![0; CHUNK_SIZE];
            let mut bytes_received = 0;

            loop {
                let bytes_read = reader.read(&mut buffer).await.map_err(|e| {
                    AppError::NetworkError(format!("Failed to receive file chunk: {e}"))
                })?;

                if bytes_read == 0 {
                    break;
                }

                file.write_all(&buffer[..bytes_read])
                    .map_err(AppError::IoError)?;

                bytes_received += bytes_read as u64;

                // Update transfer status
                {
                    let mut transfers = transfers.lock().unwrap();
                    if let Some(transfer) = transfers.get_mut(transfer_id) {
                        transfer.bytes_transferred = bytes_received;
                        if bytes_received >= transfer.file_size {
                            transfer.status = TransferStatus::Completed;
                        }
                    }
                }
            }

            info!("File transfer completed: {}", transfer_id);
        }
    } else if line.starts_with("REQUEST_FILE:") {
        // This is a request for file data
        let transfer_id = line.strip_prefix("REQUEST_FILE:").unwrap();

        // Get the transfer
        let transfer = {
            let transfers = transfers.lock().unwrap();
            transfers
                .get(transfer_id)
                .cloned()
                .ok_or_else(|| AppError::TransferNotFound(transfer_id.to_string()))?
        };

        // We are the sender, send the file data
        if transfer.sender_id == local_user.id {
            let source_path = transfer.source_path.as_ref().ok_or_else(|| {
                AppError::FileTransferError("Source path not specified".to_string())
            })?;

            let mut file = File::open(source_path).map_err(AppError::IoError)?;
            let mut buffer = vec![0; CHUNK_SIZE];
            let mut bytes_sent = 0;

            // Get the underlying stream for writing
            let mut stream = reader.into_inner();

            loop {
                let bytes_read = file.read(&mut buffer).map_err(AppError::IoError)?;

                if bytes_read == 0 {
                    break;
                }

                stream.write_all(&buffer[..bytes_read]).await.map_err(|e| {
                    AppError::NetworkError(format!("Failed to send file chunk: {e}"))
                })?;

                bytes_sent += bytes_read as u64;

                // Update transfer status
                {
                    let mut transfers = transfers.lock().unwrap();
                    if let Some(transfer) = transfers.get_mut(transfer_id) {
                        transfer.bytes_transferred = bytes_sent;
                        if bytes_sent >= transfer.file_size {
                            transfer.status = TransferStatus::Completed;
                        }
                    }
                }
            }

            info!("File transfer completed: {}", transfer_id);
        }
    } else {
        // Try to parse as JSON transfer request
        let mut buffer = Vec::new();
        reader
            .read_to_end(&mut buffer)
            .await
            .map_err(|e| AppError::NetworkError(format!("Failed to read transfer request: {e}")))?;

        // Prepend the line we already read
        let mut full_buffer = line.as_bytes().to_vec();
        full_buffer.extend(buffer);

        // Parse the transfer request
        let transfer: FileTransfer =
            serde_json::from_slice(&full_buffer).map_err(AppError::SerializationError)?;

        info!(
            "Received file transfer request: {} from {}",
            transfer.file_name, transfer.sender_id
        );

        // Store the transfer if we are the recipient
        if transfer.recipient_id == local_user.id {
            let mut transfers = transfers.lock().unwrap();
            transfers.insert(transfer.id.clone(), transfer.clone());
        }
    }

    Ok(())
}

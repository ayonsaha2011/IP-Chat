use log::{debug, error, info};
use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream as AsyncTcpStream;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::emit_event;
use crate::error::{AppError, AppResult};
use crate::models::{Message, User};

#[allow(dead_code)]
const CHAT_PORT: u16 = 8765;

/// Manages chat functionality
pub struct ChatManager {
    /// The local user
    local_user: User,
    /// Map of messages by conversation ID (peer ID)
    messages: Arc<Mutex<HashMap<String, Vec<Message>>>>,
    /// Map of connections by peer ID
    connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    /// Listener for incoming connections
    #[allow(dead_code)]
    listener: Option<TcpListener>,
    /// Channel for stopping the chat service
    #[allow(dead_code)]
    stop_tx: Option<mpsc::Sender<()>>,
}

impl ChatManager {
    /// Creates a new ChatManager instance
    pub fn new(local_user: User) -> Self {
        ChatManager {
            local_user,
            messages: Arc::new(Mutex::new(HashMap::new())),
            connections: Arc::new(Mutex::new(HashMap::new())),
            listener: None,
            stop_tx: None,
        }
    }

    /// Starts the chat service
    pub fn start_chat_service(&mut self) -> AppResult<()> {
        use tokio::net::TcpListener as AsyncTcpListener;

        let _messages = Arc::clone(&self.messages);
        let local_user = self.local_user.clone();

        // Spawn async task to handle incoming connections
        tokio::spawn(async move {
            // Bind to the chat port
            let listener = match AsyncTcpListener::bind(format!("0.0.0.0:{CHAT_PORT}")).await {
                Ok(listener) => {
                    info!("Chat service listening on port {CHAT_PORT}");
                    listener
                }
                Err(e) => {
                    error!("Failed to bind to port {CHAT_PORT}: {e}");
                    return;
                }
            };

            loop {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        debug!("New chat connection from: {addr}");

                        // Clone necessary values for the connection handler
                        let local_user_clone = local_user.clone();

                        // Spawn task to handle the connection using connection manager
                        tokio::spawn(async move {
                            // Create a temporary connection manager for handling this connection
                            let temp_conn_manager = crate::connection_manager::ConnectionManager::new(local_user_clone);
                            if let Err(e) = temp_conn_manager.handle_incoming_connection(stream, addr).await {
                                error!("Error handling incoming connection: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        error!("Error accepting connection: {e}");
                        break;
                    }
                }
            }
        });

        info!("Chat service started");
        Ok(())
    }

    /// Stops the chat service
    pub fn stop_chat_service(&mut self) -> AppResult<()> {
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

        info!("Chat service stopped");
        Ok(())
    }

    /// Sends a message to a peer
    pub async fn send_message(&mut self, _peer_id: &str, _content: &str) -> AppResult<Message> {
        // This method is kept for backward compatibility
        // Use send_message_with_peer_ip instead
        Err(AppError::NetworkError(
            "Use send_message_with_peer_ip method instead".to_string(),
        ))
    }

    /// Sends a message to a peer with a specific IP
    pub async fn send_message_with_peer_ip(
        &mut self,
        peer_id: &str,
        content: &str,
        peer_ip: &str,
    ) -> AppResult<Message> {
        info!(
            "ChatManager: Creating message from {} to {} with IP {}",
            self.local_user.id, peer_id, peer_ip
        );

        // Create message
        let message = Message {
            id: Uuid::new_v4().to_string(),
            sender_id: self.local_user.id.clone(),
            recipient_id: peer_id.to_string(),
            content: content.to_string(),
            timestamp: chrono::Utc::now(),
            read: false,
        };

        info!("ChatManager: Created message with ID: {}", message.id);

        // Store message in our sent messages
        {
            let mut messages = self.messages.lock().unwrap();
            let sent_messages = messages.entry(self.local_user.id.clone()).or_default();
            sent_messages.push(message.clone());
            info!(
                "ChatManager: Stored message locally, total sent messages: {}",
                sent_messages.len()
            );
        }

        // Send message to peer
        info!("ChatManager: Attempting to send message to peer over network");
        self.send_message_to_peer(peer_id, &message, Some(peer_ip))
            .await?;
        info!("ChatManager: Message sent successfully over network");

        Ok(message)
    }

    /// Sends a message to a peer over the network
    async fn send_message_to_peer(
        &self,
        peer_id: &str,
        message: &Message,
        peer_ip: Option<&str>,
    ) -> AppResult<()> {
        let target_addr = if let Some(ip) = peer_ip {
            // Use the provided IP address to establish a new connection
            format!("{}:{}", ip, CHAT_PORT)
        } else {
            // No IP provided
            error!("ChatManager: No IP address provided for peer {}", peer_id);
            return Err(AppError::NetworkError(
                "No IP address provided for peer".to_string(),
            ));
        };

        info!(
            "ChatManager: Connecting to {} to send message: {}",
            target_addr, message.content
        );
        info!(
            "ChatManager: Message details - ID: {}, From: {} To: {}",
            message.id, message.sender_id, message.recipient_id
        );

        // Send the message
        let message_json = serde_json::to_string(message).map_err(|e| {
            error!("ChatManager: Failed to serialize message: {}", e);
            AppError::SerializationError(e)
        })?;

        info!(
            "ChatManager: Serialized message JSON (length: {})",
            message_json.len()
        );

        let mut stream = AsyncTcpStream::connect(&target_addr).await.map_err(|e| {
            error!("ChatManager: Failed to connect to {}: {}", target_addr, e);
            AppError::NetworkError(format!("Failed to connect to {}: {e}", target_addr))
        })?;

        info!("ChatManager: Successfully connected to {}", target_addr);

        stream
            .write_all(message_json.as_bytes())
            .await
            .map_err(|e| {
                error!(
                    "ChatManager: Failed to write message to {}: {}",
                    target_addr, e
                );
                AppError::NetworkError(format!("Failed to send message: {e}"))
            })?;

        info!("ChatManager: Message data written to stream");

        stream.flush().await.map_err(|e| {
            error!(
                "ChatManager: Failed to flush message to {}: {}",
                target_addr, e
            );
            AppError::NetworkError(format!("Failed to flush message: {e}"))
        })?;

        info!("ChatManager: Message sent successfully to {}", target_addr);
        Ok(())
    }

    /// Gets messages for a specific peer
    pub fn get_messages_for_peer(&self, peer_id: &str) -> Vec<Message> {
        let messages = self.messages.lock().unwrap();
        let mut peer_messages = Vec::new();

        // Get messages where we are the sender and peer is recipient
        if let Some(sent_messages) = messages.get(&self.local_user.id) {
            peer_messages.extend(
                sent_messages
                    .iter()
                    .filter(|msg| msg.recipient_id == peer_id)
                    .cloned(),
            );
        }

        // Get messages where peer is the sender and we are recipient
        if let Some(received_messages) = messages.get(peer_id) {
            peer_messages.extend(
                received_messages
                    .iter()
                    .filter(|msg| msg.recipient_id == self.local_user.id)
                    .cloned(),
            );
        }

        // Sort by timestamp
        peer_messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        peer_messages
    }

    /// Gets all messages
    pub fn get_all_messages(&self) -> Vec<Message> {
        let messages = self.messages.lock().unwrap();
        let mut all_messages = Vec::new();

        for peer_messages in messages.values() {
            all_messages.extend(peer_messages.clone());
        }

        // Sort by timestamp
        all_messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        all_messages
    }

    /// Stores a sent message locally
    pub fn store_sent_message(&self, message: &Message) -> AppResult<()> {
        let mut messages = self.messages.lock().unwrap();
        let sent_messages = messages.entry(self.local_user.id.clone()).or_default();
        sent_messages.push(message.clone());
        info!("Stored sent message locally, total sent messages: {}", sent_messages.len());
        Ok(())
    }

    /// Marks messages from a peer as read
    pub fn mark_messages_as_read(&mut self, peer_id: &str) -> AppResult<()> {
        let mut messages = self.messages.lock().unwrap();

        // Mark messages in the peer's conversation (received messages)
        if let Some(peer_messages) = messages.get_mut(peer_id) {
            for message in peer_messages.iter_mut() {
                if message.recipient_id == self.local_user.id {
                    message.read = true;
                }
            }
        }

        // Always return Ok - it's valid to have no messages for a peer
        Ok(())
    }
}

/// Handles an incoming message
async fn handle_incoming_message(
    mut stream: AsyncTcpStream,
    messages: Arc<Mutex<HashMap<String, Vec<Message>>>>,
    local_user: User,
) -> AppResult<()> {
    info!("ChatManager: Handling incoming connection from peer");

    // Read message
    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await.map_err(|e| {
        error!("ChatManager: Failed to read incoming message: {}", e);
        AppError::NetworkError(format!("Failed to read message: {e}"))
    })?;

    info!(
        "ChatManager: Read {} bytes from incoming connection",
        buffer.len()
    );

    // Parse message
    let message: Message = serde_json::from_slice(&buffer).map_err(|e| {
        error!("ChatManager: Failed to parse incoming message: {}", e);
        error!(
            "ChatManager: Raw message data: {:?}",
            String::from_utf8_lossy(&buffer)
        );
        AppError::SerializationError(e)
    })?;

    info!(
        "ChatManager: Received message from {}: {}",
        message.sender_id, message.content
    );
    info!(
        "ChatManager: Message details - ID: {}, To: {}, Timestamp: {}",
        message.id, message.recipient_id, message.timestamp
    );

    // Verify the message is intended for us
    if message.recipient_id != local_user.id {
        error!(
            "ChatManager: Received message not intended for us (recipient: {}, our ID: {})",
            message.recipient_id, local_user.id
        );
        return Ok(()); // Don't error, just ignore
    }

    // Store message in the sender's conversation (for received messages)
    {
        let mut messages = messages.lock().unwrap();
        let peer_messages = messages.entry(message.sender_id.clone()).or_default();
        peer_messages.push(message.clone());
        info!(
            "ChatManager: Stored incoming message, total messages from {}: {}",
            message.sender_id,
            peer_messages.len()
        );
    }

    // Emit message received event
    emit_event("message_received", message);

    info!("ChatManager: Successfully processed incoming message");
    Ok(())
}

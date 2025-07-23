use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::net::{TcpListener, TcpStream, SocketAddr};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream as AsyncTcpStream;
use tokio::sync::mpsc;
use log::{info, error, debug};
use serde_json;
use uuid::Uuid;

use crate::models::{User, Message};
use crate::error::{AppError, AppResult};

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
    #[allow(dead_code)]
    pub fn start_chat_service(&mut self) -> AppResult<()> {
        // Bind to the chat port
        let listener = TcpListener::bind(format!("0.0.0.0:{}", CHAT_PORT))
            .map_err(|e| AppError::NetworkError(format!("Failed to bind to port {}: {}", CHAT_PORT, e)))?;
        
        listener.set_nonblocking(true)
            .map_err(|e| AppError::NetworkError(format!("Failed to set non-blocking mode: {}", e)))?;
        
        // Set up channel for stopping the service
        let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);
        
        // Store listener and stop channel
        self.listener = Some(listener);
        self.stop_tx = Some(stop_tx);
        
        // Clone necessary values for the task
        let listener = self.listener.as_ref().unwrap().try_clone()
            .map_err(|e| AppError::NetworkError(format!("Failed to clone listener: {}", e)))?;
        let messages = Arc::clone(&self.messages);
        let connections = Arc::clone(&self.connections);
        let local_user = self.local_user.clone();
        
        // Spawn task to handle incoming connections
        tokio::spawn(async move {
            let listener = listener;
            
            loop {
                // Check for stop signal
                if stop_rx.try_recv().is_ok() {
                    debug!("Stopping chat service");
                    break;
                }
                
                // Accept incoming connections
                match listener.accept() {
                    Ok((stream, addr)) => {
                        debug!("New connection from: {}", addr);
                        
                        // Clone necessary values for the connection handler
                        let messages_clone = Arc::clone(&messages);
                        let connections_clone = Arc::clone(&connections);
                        let local_user_clone = local_user.clone();
                        
                        // Spawn task to handle the connection
                        tokio::spawn(async move {
                            if let Err(e) = handle_connection(stream, addr, messages_clone, connections_clone, local_user_clone).await {
                                error!("Error handling connection: {}", e);
                            }
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // No incoming connections, sleep a bit
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                    Err(e) => {
                        error!("Error accepting connection: {}", e);
                        break;
                    }
                }
            }
            
            // Close all connections
            let mut connections = connections.lock().unwrap();
            connections.clear();
        });
        
        info!("Chat service started");
        Ok(())
    }
    
    /// Stops the chat service
    #[allow(dead_code)]
    pub fn stop_chat_service(&mut self) -> AppResult<()> {
        // Send stop signal
        if let Some(tx) = &self.stop_tx {
            if let Err(e) = tx.blocking_send(()) {
                error!("Failed to send stop signal: {}", e);
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
    pub async fn send_message(&mut self, peer_id: &str, content: &str) -> AppResult<Message> {
        // Create message
        let message = Message {
            id: Uuid::new_v4().to_string(),
            sender_id: self.local_user.id.clone(),
            recipient_id: peer_id.to_string(),
            content: content.to_string(),
            timestamp: chrono::Utc::now(),
            read: false,
        };
        
        // Store message
        {
            let mut messages = self.messages.lock().unwrap();
            let peer_messages = messages.entry(peer_id.to_string()).or_insert_with(Vec::new);
            peer_messages.push(message.clone());
        }
        
        // Send message to peer
        self.send_message_to_peer(peer_id, &message).await?;
        
        Ok(message)
    }
    
    /// Sends a message to a peer over the network
    async fn send_message_to_peer(&self, peer_id: &str, message: &Message) -> AppResult<()> {
        // Check if we have a connection to the peer
        let peer_addr = {
            let connections = self.connections.lock().unwrap();
            connections.get(peer_id).map(|stream| stream.peer_addr().ok())
        };
        
        if let Some(Some(addr)) = peer_addr {
            // We have a connection, send the message
            let message_json = serde_json::to_string(message)
                .map_err(|e| AppError::SerializationError(e))?;
            
            let mut stream = AsyncTcpStream::connect(addr).await
                .map_err(|e| AppError::NetworkError(format!("Failed to connect to peer: {}", e)))?;
            
            stream.write_all(message_json.as_bytes()).await
                .map_err(|e| AppError::NetworkError(format!("Failed to send message: {}", e)))?;
            
            Ok(())
        } else {
            // No connection to the peer, try to establish one
            Err(AppError::NetworkError("No connection to peer".to_string()))
        }
    }
    
    /// Gets messages for a specific peer
    pub fn get_messages_for_peer(&self, peer_id: &str) -> Vec<Message> {
        let messages = self.messages.lock().unwrap();
        messages.get(peer_id).cloned().unwrap_or_default()
    }
    
    /// Gets all messages
    pub fn get_all_messages(&self) -> Vec<Message> {
        let messages = self.messages.lock().unwrap();
        messages.values().flatten().cloned().collect()
    }
    
    /// Marks messages from a peer as read
    pub fn mark_messages_as_read(&mut self, peer_id: &str) -> AppResult<()> {
        let mut messages = self.messages.lock().unwrap();
        if let Some(peer_messages) = messages.get_mut(peer_id) {
            for message in peer_messages.iter_mut() {
                if message.recipient_id == self.local_user.id {
                    message.read = true;
                }
            }
            Ok(())
        } else {
            Err(AppError::ChatError(format!("No messages found for peer {}", peer_id)))
        }
    }
}

/// Handles an incoming connection
#[allow(dead_code)]
async fn handle_connection(
    stream: TcpStream,
    _addr: SocketAddr,
    messages: Arc<Mutex<HashMap<String, Vec<Message>>>>,
    connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    _local_user: User,
) -> AppResult<()> {
    // Convert to async stream
    let mut stream = AsyncTcpStream::from_std(stream)
        .map_err(|e| AppError::NetworkError(format!("Failed to convert stream: {}", e)))?;
    
    // Read message
    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await
        .map_err(|e| AppError::NetworkError(format!("Failed to read message: {}", e)))?;
    
    // Parse message
    let message: Message = serde_json::from_slice(&buffer)
        .map_err(|e| AppError::SerializationError(e))?;
    
    debug!("Received message: {:?}", message);
    
    // Store message
    {
        let mut messages = messages.lock().unwrap();
        let peer_messages = messages.entry(message.sender_id.clone()).or_insert_with(Vec::new);
        peer_messages.push(message.clone());
    }
    
    // Store connection
    {
        let mut connections = connections.lock().unwrap();
        connections.insert(message.sender_id.clone(), stream.into_std().unwrap());
    }
    
    Ok(())
}

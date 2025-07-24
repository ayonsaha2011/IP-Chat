use log::{debug, error, info, warn};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::{interval, timeout};

use crate::error::{AppError, AppResult};
use crate::models::{Message, User};

const CONNECTION_TIMEOUT: Duration = Duration::from_secs(10);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const CONNECTION_IDLE_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes

#[derive(Debug, Clone)]
pub struct PeerConnection {
    pub stream: Arc<Mutex<TcpStream>>,
    pub peer_id: String,
    pub peer_addr: SocketAddr,
    pub last_activity: Arc<Mutex<Instant>>,
    pub is_active: Arc<Mutex<bool>>,
}

impl PeerConnection {
    pub fn new(stream: TcpStream, peer_id: String, peer_addr: SocketAddr) -> Self {
        Self {
            stream: Arc::new(Mutex::new(stream)),
            peer_id,
            peer_addr,
            last_activity: Arc::new(Mutex::new(Instant::now())),
            is_active: Arc::new(Mutex::new(true)),
        }
    }

    pub async fn update_activity(&self) {
        let mut last_activity = self.last_activity.lock().await;
        *last_activity = Instant::now();
    }

    pub async fn is_idle(&self) -> bool {
        let last_activity = self.last_activity.lock().await;
        last_activity.elapsed() > CONNECTION_IDLE_TIMEOUT
    }

    pub async fn set_inactive(&self) {
        let mut is_active = self.is_active.lock().await;
        *is_active = false;
    }

    pub async fn is_active(&self) -> bool {
        let is_active = self.is_active.lock().await;
        *is_active
    }
}

pub struct ConnectionManager {
    connections: Arc<Mutex<HashMap<String, PeerConnection>>>,
    local_user: User,
    heartbeat_tx: Option<mpsc::Sender<()>>,
}

impl ConnectionManager {
    pub fn new(local_user: User) -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            local_user,
            heartbeat_tx: None,
        }
    }

    pub fn start_heartbeat_service(&mut self) {
        let connections = Arc::clone(&self.connections);
        let (tx, mut rx) = mpsc::channel::<()>(1);
        self.heartbeat_tx = Some(tx);

        tokio::spawn(async move {
            let mut heartbeat_interval = interval(HEARTBEAT_INTERVAL);
            
            loop {
                tokio::select! {
                    _ = heartbeat_interval.tick() => {
                        Self::perform_heartbeat_check(&connections).await;
                    }
                    _ = rx.recv() => {
                        debug!("Heartbeat service stopping");
                        break;
                    }
                }
            }
        });

        info!("Connection heartbeat service started");
    }

    async fn perform_heartbeat_check(connections: &Arc<Mutex<HashMap<String, PeerConnection>>>) {
        let mut connections_to_remove = Vec::new();
        
        // Check all connections
        {
            let connections_guard = connections.lock().await;
            for (peer_id, connection) in connections_guard.iter() {
                if !connection.is_active().await || connection.is_idle().await {
                    debug!("Connection to {} is inactive or idle, marking for removal", peer_id);
                    connections_to_remove.push(peer_id.clone());
                    continue;
                }

                // Send heartbeat
                if let Err(e) = Self::send_heartbeat(connection).await {
                    warn!("Heartbeat failed for peer {}: {}", peer_id, e);
                    connections_to_remove.push(peer_id.clone());
                }
            }
        }

        // Remove inactive connections
        if !connections_to_remove.is_empty() {
            let mut connections_guard = connections.lock().await;
            for peer_id in connections_to_remove {
                info!("Removing inactive connection to peer: {}", peer_id);
                connections_guard.remove(&peer_id);
            }
        }
    }

    async fn send_heartbeat(connection: &PeerConnection) -> AppResult<()> {
        let heartbeat_msg = serde_json::json!({
            "type": "heartbeat",
            "timestamp": chrono::Utc::now().timestamp()
        });

        let heartbeat_data = heartbeat_msg.to_string();
        
        {
            let mut stream = connection.stream.lock().await;
            match timeout(Duration::from_secs(5), stream.write_all(heartbeat_data.as_bytes())).await {
                Ok(Ok(_)) => {
                    connection.update_activity().await;
                    Ok(())
                }
                Ok(Err(e)) => {
                    connection.set_inactive().await;
                    Err(AppError::NetworkError(format!("Heartbeat write failed: {}", e)))
                }
                Err(_) => {
                    connection.set_inactive().await;
                    Err(AppError::NetworkError("Heartbeat timeout".to_string()))
                }
            }
        }
    }

    pub async fn get_or_create_connection(&self, peer_id: &str, peer_ip: &str, port: u16) -> AppResult<PeerConnection> {
        // Check if we already have an active connection
        {
            let connections = self.connections.lock().await;
            if let Some(connection) = connections.get(peer_id) {
                if connection.is_active().await && !connection.is_idle().await {
                    debug!("Reusing existing connection to peer: {}", peer_id);
                    return Ok(connection.clone());
                } else {
                    debug!("Existing connection to {} is inactive or idle", peer_id);
                }
            }
        }

        // Create new connection
        info!("Creating new connection to peer {} at {}:{}", peer_id, peer_ip, port);
        let addr: SocketAddr = format!("{}:{}", peer_ip, port).parse()
            .map_err(|e| AppError::NetworkError(format!("Invalid address: {}", e)))?;

        let stream = match timeout(CONNECTION_TIMEOUT, TcpStream::connect(&addr)).await {
            Ok(Ok(stream)) => stream,
            Ok(Err(e)) => {
                error!("Failed to connect to {}:{}: {}", peer_ip, port, e);
                return Err(AppError::NetworkError(format!("Connection failed: {}", e)));
            }
            Err(_) => {
                error!("Connection timeout to {}:{}", peer_ip, port);
                return Err(AppError::NetworkError("Connection timeout".to_string()));
            }
        };

        let connection = PeerConnection::new(stream, peer_id.to_string(), addr);
        
        // Store the connection
        {
            let mut connections = self.connections.lock().await;
            connections.insert(peer_id.to_string(), connection.clone());
        }

        info!("Successfully created connection to peer: {}", peer_id);
        Ok(connection)
    }

    pub async fn send_message(&self, peer_id: &str, message: &Message, peer_ip: &str, port: u16) -> AppResult<()> {
        let connection = self.get_or_create_connection(peer_id, peer_ip, port).await?;
        
        let message_json = serde_json::to_string(message)
            .map_err(AppError::SerializationError)?;

        // Add message type and length prefix for better parsing
        let full_message = serde_json::json!({
            "type": "message",
            "data": message,
            "length": message_json.len()
        });

        let full_message_str = full_message.to_string();
        
        {
            let mut stream = connection.stream.lock().await;
            match timeout(Duration::from_secs(10), async {
                stream.write_all(full_message_str.as_bytes()).await?;
                stream.flush().await?;
                Ok::<(), std::io::Error>(())
            }).await {
                Ok(Ok(_)) => {
                    connection.update_activity().await;
                    info!("Message sent successfully to peer: {}", peer_id);
                    Ok(())
                }
                Ok(Err(e)) => {
                    error!("Failed to send message to {}: {}", peer_id, e);
                    connection.set_inactive().await;
                    self.remove_connection(peer_id).await;
                    Err(AppError::NetworkError(format!("Message send failed: {}", e)))
                }
                Err(_) => {
                    error!("Message send timeout to peer: {}", peer_id);
                    connection.set_inactive().await;
                    self.remove_connection(peer_id).await;
                    Err(AppError::NetworkError("Message send timeout".to_string()))
                }
            }
        }
    }

    pub async fn remove_connection(&self, peer_id: &str) {
        let mut connections = self.connections.lock().await;
        if connections.remove(peer_id).is_some() {
            info!("Removed connection to peer: {}", peer_id);
        }
    }

    pub async fn get_active_connections(&self) -> Vec<String> {
        let connections = self.connections.lock().await;
        let mut active_connections = Vec::new();
        for (peer_id, conn) in connections.iter() {
            if conn.is_active().await {
                active_connections.push(peer_id.clone());
            }
        }
        active_connections
    }

    pub async fn close_all_connections(&self) {
        let mut connections = self.connections.lock().await;
        let peer_count = connections.len();
        connections.clear();
        
        if peer_count > 0 {
            info!("Closed {} peer connections", peer_count);
        }

        // Stop heartbeat service
        if let Some(tx) = &self.heartbeat_tx {
            let _ = tx.send(()).await;
        }
    }

    pub async fn handle_incoming_connection(&self, mut stream: TcpStream, peer_addr: SocketAddr) -> AppResult<()> {
        info!("Handling incoming connection from: {}", peer_addr);
        
        loop {
            let mut buffer = vec![0; 4096];
            
            match timeout(Duration::from_secs(30), stream.read(&mut buffer)).await {
                Ok(Ok(0)) => {
                    debug!("Connection closed by peer: {}", peer_addr);
                    break;
                }
                Ok(Ok(n)) => {
                    buffer.truncate(n);
                    
                    // Try to parse the message
                    match serde_json::from_slice::<serde_json::Value>(&buffer) {
                        Ok(json_value) => {
                            if let Some(msg_type) = json_value.get("type").and_then(|v| v.as_str()) {
                                match msg_type {
                                    "heartbeat" => {
                                        debug!("Received heartbeat from: {}", peer_addr);
                                        // Send heartbeat response
                                        let response = serde_json::json!({
                                            "type": "heartbeat_response",
                                            "timestamp": chrono::Utc::now().timestamp()
                                        });
                                        let response_str = response.to_string();
                                        if let Err(e) = stream.write_all(response_str.as_bytes()).await {
                                            warn!("Failed to send heartbeat response: {}", e);
                                            break;
                                        }
                                    }
                                    "message" => {
                                        if let Some(message_data) = json_value.get("data") {
                                            match serde_json::from_value::<Message>(message_data.clone()) {
                                                Ok(message) => {
                                                    info!("Received message from {}: {}", message.sender_id, message.content);
                                                    self.handle_received_message(message).await?;
                                                }
                                                Err(e) => {
                                                    warn!("Failed to parse message data: {}", e);
                                                }
                                            }
                                        }
                                    }
                                    "heartbeat_response" => {
                                        debug!("Received heartbeat response from: {}", peer_addr);
                                    }
                                    _ => {
                                        debug!("Unknown message type: {}", msg_type);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Failed to parse JSON from {}: {}", peer_addr, e);
                        }
                    }
                }
                Ok(Err(e)) => {
                    error!("Read error from {}: {}", peer_addr, e);
                    break;
                }
                Err(_) => {
                    debug!("Read timeout from: {}", peer_addr);
                    break;
                }
            }
        }

        info!("Connection handler finished for: {}", peer_addr);
        Ok(())
    }

    async fn handle_received_message(&self, message: Message) -> AppResult<()> {
        // Verify the message is intended for us
        if message.recipient_id != self.local_user.id {
            warn!("Received message not intended for us (recipient: {}, our ID: {})", 
                  message.recipient_id, self.local_user.id);
            return Ok(());
        }

        // Emit the message received event
        crate::emit_event("message_received", message);
        Ok(())
    }
}
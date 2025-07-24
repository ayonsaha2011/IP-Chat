mod chat;
mod discovery;
mod error;
mod file_transfer;
mod models;

use local_ip_address::local_ip;
use log::{error, info};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::chat::ChatManager;
use crate::discovery::NetworkDiscovery;
use crate::file_transfer::FileTransferManager;
use crate::models::{AppState, FileTransfer, Message, User};

// Helper function to ensure services are initialized
async fn ensure_services_initialized(state: &mut AppState) {
    if !state.services_initialized {
        info!("Starting service initialization...");

        // Start network services
        info!("Starting network discovery service...");
        if let Err(e) = state.discovery.start_discovery().await {
            error!("Failed to start discovery service: {e}");
        } else {
            info!("Discovery service started successfully");
        }

        // Start chat service
        info!("Starting chat service...");
        if let Err(e) = state.chat_manager.start_chat_service() {
            error!("Failed to start chat service: {e}");
        } else {
            info!("Chat service started successfully");
        }

        // Start file transfer service
        info!("Starting file transfer service...");
        if let Err(e) = state.file_manager.start_file_transfer_service() {
            error!("Failed to start file transfer service: {e}");
        } else {
            info!("File transfer service started successfully");
        }

        state.services_initialized = true;
        info!("Services initialization completed");
    } else {
        info!("Services already initialized");
    }
}

// Commands for network discovery
#[tauri::command]
async fn start_discovery(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let mut state = state.lock().await;
    match state.discovery.start_discovery().await {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn stop_discovery(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let mut state = state.lock().await;
    match state.discovery.stop_discovery().await {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_discovered_peers(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<User>, String> {
    let state = state.lock().await;
    Ok(state.discovery.get_discovered_peers())
}

#[tauri::command]
async fn refresh_discovery(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<User>, String> {
    let mut state = state.lock().await;
    // Restart discovery to refresh peer list
    if let Err(e) = state.discovery.stop_discovery().await {
        error!("Failed to stop discovery during refresh: {e}");
    }

    // Small delay to ensure clean shutdown
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    if let Err(e) = state.discovery.start_discovery().await {
        error!("Failed to restart discovery: {e}");
        return Err(e.to_string());
    }

    info!("Discovery refreshed successfully");
    Ok(state.discovery.get_discovered_peers())
}

#[tauri::command]
async fn get_local_user(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<User, String> {
    let state = state.lock().await;
    Ok(state.local_user.clone())
}

// Commands for chat
#[tauri::command]
async fn send_message(
    peer_id: String,
    content: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Message, String> {
    let mut state = state.lock().await;
    
    info!("Attempting to send message to peer: {}", peer_id);
    info!("Message content: {}", content);
    
    // Get peer information from discovery service
    let peers = state.discovery.get_discovered_peers();
    info!("Found {} discovered peers", peers.len());
    
    // Log all discovered peers for debugging
    for (i, p) in peers.iter().enumerate() {
        info!("Peer {}: ID={}, Name={}, IP={}", i + 1, p.id, p.name, p.ip);
    }
    
    let peer = peers.iter().find(|p| p.id == peer_id);
    
    match peer {
        Some(peer) => {
            info!("Found peer {} at IP: {}", peer_id, peer.ip);
            info!("Sending message with peer IP: {}", peer.ip);
            
            // Send message with peer IP
            match state.chat_manager.send_message_with_peer_ip(&peer_id, &content, &peer.ip).await {
                Ok(message) => {
                    info!("Message sent successfully - ID: {}, Sender: {}, Recipient: {}", 
                          message.id, message.sender_id, message.recipient_id);
                    info!("Message timestamp: {}, Content length: {}", 
                          message.timestamp, message.content.len());
                    Ok(message)
                },
                Err(e) => {
                    error!("Failed to send message to peer {}: {}", peer_id, e);
                    error!("Error details: peer_ip={}, content_len={}", peer.ip, content.len());
                    Err(e.to_string())
                },
            }
        }
        None => {
            error!("Peer {} not found in discovered peers", peer_id);
            error!("Available peer IDs: {:?}", peers.iter().map(|p| &p.id).collect::<Vec<_>>());
            Err(format!("Peer {} not found. Make sure the peer is online and discoverable.", peer_id))
        }
    }
}

#[tauri::command]
async fn get_messages(
    peer_id: Option<String>,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<Message>, String> {
    let mut state = state.lock().await;
    
    // Ensure services are initialized
    ensure_services_initialized(&mut state).await;
    
    info!("Getting messages for peer_id: {:?}", peer_id);
    
    let messages = match peer_id {
        Some(id) => {
            let msgs = state.chat_manager.get_messages_for_peer(&id);
            info!("Retrieved {} messages for peer {}", msgs.len(), id);
            msgs
        },
        None => {
            let msgs = state.chat_manager.get_all_messages();
            info!("Retrieved {} total messages", msgs.len());
            msgs
        }
    };
    
    Ok(messages)
}

#[tauri::command]
async fn mark_messages_as_read(
    peer_id: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let mut state = state.lock().await;
    
    // Ensure services are initialized
    ensure_services_initialized(&mut state).await;
    
    info!("Marking messages as read for peer: {}", peer_id);
    match state.chat_manager.mark_messages_as_read(&peer_id) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// Commands for file transfer
#[tauri::command]
async fn send_file(
    peer_id: String,
    file_path: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<FileTransfer, String> {
    let mut state = state.lock().await;

    // Get peer information from discovery service
    let peers = state.discovery.get_discovered_peers();
    let peer = peers.iter().find(|p| p.id == peer_id);

    match peer {
        Some(peer) => {
            // Create a modified send_file method that takes peer IP
            match state
                .file_manager
                .send_file_with_peer(&peer_id, &file_path, &peer.ip)
                .await
            {
                Ok(transfer) => Ok(transfer),
                Err(e) => Err(e.to_string()),
            }
        }
        None => Err("Peer not found in discovered peers".to_string()),
    }
}

#[tauri::command]
async fn accept_file_transfer(
    transfer_id: String,
    save_path: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let mut state = state.lock().await;
    match state
        .file_manager
        .accept_transfer(&transfer_id, &save_path)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn reject_file_transfer(
    transfer_id: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let mut state = state.lock().await;
    match state.file_manager.reject_transfer(&transfer_id).await {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_file_transfers(
    peer_id: Option<String>,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<FileTransfer>, String> {
    let state = state.lock().await;
    match peer_id {
        Some(id) => Ok(state.file_manager.get_transfers_for_peer(&id)),
        None => Ok(state.file_manager.get_all_transfers()),
    }
}

#[tauri::command]
async fn cancel_file_transfer(
    transfer_id: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let mut state = state.lock().await;
    match state.file_manager.cancel_transfer(&transfer_id).await {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn update_username(
    username: String,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<User, String> {
    let mut state = state.lock().await;
    state.local_user.name = username;
    // Broadcast the updated user info
    if let Err(e) = state.discovery.broadcast_user_update().await {
        error!("Failed to broadcast user update: {e}");
    }
    Ok(state.local_user.clone())
}


/// Generate a unique user ID using hostname to distinguish between devices
fn generate_user_id() -> String {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let mut hasher = DefaultHasher::new();
    hostname.hash(&mut hasher);
    let hash = hasher.finish();
    format!("user-{:x}", hash & 0xFFFFFFFF)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Get local IP address
    let local_ip = match local_ip() {
        Ok(ip) => ip,
        Err(e) => {
            error!("Failed to get local IP address: {e}");
            std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1))
        }
    };

    info!("Local IP address: {local_ip}");

    // Create local user
    let local_user = User {
        id: generate_user_id(),
        name: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "Unknown User".to_string()),
        ip: local_ip.to_string(),
        last_seen: chrono::Utc::now(),
    };

    info!("Local user: {local_user:?}");

    // Initialize app state
    let network_discovery = NetworkDiscovery::new(local_user.clone());
    let chat_manager = ChatManager::new(local_user.clone());
    let file_manager = FileTransferManager::new(local_user.clone());

    let app_state = Arc::new(Mutex::new(AppState {
        local_user,
        discovery: network_discovery,
        chat_manager,
        file_manager,
        services_initialized: false,
    }));

    // Build and run the application
    let app_state_clone = Arc::clone(&app_state);

    tauri::Builder::default()
        .setup(move |_app| {
            // Start services automatically on app startup
            tauri::async_runtime::spawn(async move {
                let mut state = app_state_clone.lock().await;
                ensure_services_initialized(&mut state).await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_discovery,
            stop_discovery,
            get_discovered_peers,
            refresh_discovery,
            get_local_user,
            send_message,
            get_messages,
            mark_messages_as_read,
            send_file,
            accept_file_transfer,
            reject_file_transfer,
            get_file_transfers,
            cancel_file_transfer,
            update_username,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

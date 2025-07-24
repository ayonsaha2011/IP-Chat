use log::{debug, error, info, warn};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::emit_event;

const SERVICE_TYPE: &str = "_ip-chat._tcp.local.";
const SERVICE_PORT: u16 = 8765;
const DISCOVERY_INTERVAL: u64 = 30; // seconds

/// Handles network discovery using mDNS
pub struct NetworkDiscovery {
    /// The local user
    local_user: User,
    /// Map of discovered peers by ID
    peers: Arc<Mutex<HashMap<String, User>>>,
    /// mDNS service daemon
    daemon: Option<ServiceDaemon>,
    /// Service instance name
    service_name: String,
    /// Flag indicating if discovery is running
    is_running: Arc<Mutex<bool>>,
    /// Channel for stopping discovery
    stop_tx: Option<mpsc::Sender<()>>,
    /// Flag indicating if service is registered
    service_registered: Arc<Mutex<bool>>,
}

impl Drop for NetworkDiscovery {
    fn drop(&mut self) {
        debug!("NetworkDiscovery::drop called for service: {}", self.service_name);
        
        // Set running flag to false to stop background threads
        if let Ok(mut is_running) = self.is_running.lock() {
            *is_running = false;
            debug!("Set running flag to false in drop");
        }

        // Only try to unregister if service was actually registered
        if let Ok(service_registered) = self.service_registered.lock() {
            if *service_registered {
                if let Some(daemon) = &self.daemon {
                    debug!("Attempting to unregister service in drop: {}", self.service_name);
                    // Ignore errors during drop - best effort cleanup
                    match daemon.unregister(&self.service_name) {
                        Ok(_) => debug!("Successfully unregistered service in drop: {}", self.service_name),
                        Err(e) => debug!("Could not unregister service in drop (this is normal): {}", e),
                    }
                }
            } else {
                debug!("Service was not registered, skipping unregistration in drop");
            }
        }
        
        debug!("NetworkDiscovery::drop completed for service: {}", self.service_name);
    }
}

impl NetworkDiscovery {
    /// Creates a new NetworkDiscovery instance
    pub fn new(local_user: User) -> Self {
        // Each device needs a unique service name to avoid registration conflicts
        // We use the user ID (which is hostname-based) to make it unique per device
        let service_name = format!("ip-chat-{}", local_user.id);

        NetworkDiscovery {
            local_user,
            peers: Arc::new(Mutex::new(HashMap::new())),
            daemon: None,
            service_name,
            is_running: Arc::new(Mutex::new(false)),
            stop_tx: None,
            service_registered: Arc::new(Mutex::new(false)),
        }
    }

    /// Starts the network discovery service
    pub async fn start_discovery(&mut self) -> AppResult<()> {
        // Check if discovery is already running
        {
            let is_running = self.is_running.lock().unwrap();
            if *is_running {
                return Err(AppError::DiscoveryError(
                    "Discovery already running".to_string(),
                ));
            }
        }

        // Create mDNS daemon
        let daemon = ServiceDaemon::new()
            .map_err(|e| AppError::MdnsError(format!("Failed to create mDNS daemon: {e}")))?;

        // Register our service
        let user_json =
            serde_json::to_string(&self.local_user).map_err(AppError::SerializationError)?;

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &self.service_name,
            &self.local_user.name,
            &self.local_user.ip,
            SERVICE_PORT,
            Some({
                let mut txt_records = HashMap::new();
                txt_records.insert("user".to_string(), user_json);
                txt_records
            }),
        )
        .map_err(|e| AppError::MdnsError(format!("Failed to create service info: {e}")))?;

        match daemon.register(service_info) {
            Ok(_) => {
                info!("Successfully registered mDNS service: {}", self.service_name);
                // Mark service as registered
                let mut service_registered = self.service_registered.lock().unwrap();
                *service_registered = true;
            }
            Err(e) => {
                error!("Failed to register mDNS service {}: {}", self.service_name, e);
                return Err(AppError::MdnsError(format!("Failed to register service: {e}")));
            }
        }

        // Browse for other services
        let browse_handle = daemon
            .browse(SERVICE_TYPE)
            .map_err(|e| AppError::MdnsError(format!("Failed to browse for services: {e}")))?;

        // Set up channel for service events
        let (event_tx, mut event_rx) = mpsc::channel::<ServiceEvent>(32);

        // Set up channel for stopping discovery
        let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);

        // Create a thread to handle the receiver
        let browse_handle_clone = browse_handle.clone();
        let is_running_clone = Arc::clone(&self.is_running);
        let service_name_clone = self.service_name.clone();
        std::thread::spawn(move || {
            debug!("Starting mDNS receiver thread for service: {}", service_name_clone);
            
            loop {
                // Check if we should stop
                {
                    let is_running = is_running_clone.lock().unwrap();
                    if !*is_running {
                        debug!("Stopping mDNS receiver thread (running flag is false)");
                        break;
                    }
                }

                // Get a new receiver for each iteration with shorter timeout
                let receiver = browse_handle_clone.recv_timeout(Duration::from_millis(200));

                // Process the event
                match receiver {
                    Ok(event) => {
                        // Try to send the event to the channel
                        if let Err(_) = event_tx.blocking_send(event) {
                            debug!("Event channel closed, stopping receiver thread");
                            break;
                        }
                    }
                    Err(_) => {
                        // Timeout or error, continue loop to check is_running
                        continue;
                    }
                }
            }
            debug!("mDNS receiver thread exiting for service: {}", service_name_clone);
        });

        // Set running flag
        {
            let mut is_running = self.is_running.lock().unwrap();
            *is_running = true;
        }

        // Store daemon and stop channel
        self.daemon = Some(daemon);
        self.stop_tx = Some(stop_tx);

        // Clone necessary values for the task
        let peers = Arc::clone(&self.peers);
        let local_id = self.local_user.id.clone();
        let is_running = Arc::clone(&self.is_running);

        // Spawn task to handle service events
        tokio::spawn(async move {
            let mut cleanup_interval = interval(Duration::from_secs(DISCOVERY_INTERVAL));

            loop {
                tokio::select! {
                    // Check for stop signal
                    _ = stop_rx.recv() => {
                        debug!("Stopping discovery");
                        break;
                    }

                    // Process service events
                    Some(event) = event_rx.recv() => {
                        match event {
                            ServiceEvent::ServiceResolved(info) => {
                                debug!("Service resolved: {}", info.get_fullname());
                                // Extract user info from TXT records
                                let txt_properties = info.get_properties();
                                for record in txt_properties.iter() {
                                    if record.key() == "user" {
                                        let value = record.val_str();
                                        match serde_json::from_str::<User>(value) {
                                            Ok(mut user) => {
                                                // Don't add ourselves to the peer list
                                                if user.id != local_id {
                                                    // Update user IP from service info
                                                    user.ip = info.get_addresses().iter().next().map(|addr| addr.to_string()).unwrap_or(user.ip);
                                                    user.last_seen = chrono::Utc::now();
                                                    info!("Discovered peer: {} at {}", user.name, user.ip);
                                                    let mut peers_map = peers.lock().unwrap();
                                                    peers_map.insert(user.id.clone(), user.clone());
                                                    
                                                    // Emit peer discovered event
                                                    emit_event("peer_discovered", user);
                                                }
                                            }
                                            Err(e) => {
                                                warn!("Failed to parse user data from TXT record: {e}");
                                            }
                                        }
                                        break; // Found the user record
                                    }
                                }
                            }
                            ServiceEvent::ServiceRemoved(service_type, name) => {
                                info!("Service removed: {service_type} {name}");
                                // Remove peer if it exists
                                let mut peers_map = peers.lock().unwrap();
                                let before_count = peers_map.len();
                                peers_map.retain(|_, user| {
                                    !name.contains(&user.id)
                                });
                                let after_count = peers_map.len();
                                if before_count != after_count {
                                    info!("Removed {} peer(s) from discovery", before_count - after_count);
                                    // Emit peers updated event
                                    let peers_list: Vec<User> = peers_map.values().cloned().collect();
                                    emit_event("peers_updated", peers_list);
                                }
                            }
                            ServiceEvent::SearchStarted(service_type) => {
                                debug!("Search started for: {service_type}");
                            }
                            ServiceEvent::SearchStopped(service_type) => {
                                debug!("Search stopped for: {service_type}");
                            }
                            _ => {
                                debug!("Other mDNS event: {event:?}");
                            }
                        }
                    }

                    // Periodic cleanup of stale peers and re-discovery
                    _ = cleanup_interval.tick() => {
                        let now = chrono::Utc::now();
                        let mut peers_map = peers.lock().unwrap();
                        let before_count = peers_map.len();
                        peers_map.retain(|_, user| {
                            // Remove peers that haven't been seen in 2 minutes
                            now.signed_duration_since(user.last_seen).num_seconds() < 120
                        });
                        let after_count = peers_map.len();
                        if before_count != after_count {
                            info!("Cleaned up {} stale peer(s)", before_count - after_count);
                            // Emit peers updated event
                            let peers_list: Vec<User> = peers_map.values().cloned().collect();
                            emit_event("peers_updated", peers_list);
                        }
                        info!("Current peer count: {after_count}");
                    }
                }
            }

            // Set running flag to false when exiting
            debug!("Discovery event handler task exiting");
            let mut is_running_guard = is_running.lock().unwrap();
            *is_running_guard = false;
            debug!("Set running flag to false in event handler task");
        });

        info!("Network discovery started");
        Ok(())
    }

    /// Stops the network discovery service
    pub async fn stop_discovery(&mut self) -> AppResult<()> {
        info!("Attempting to stop network discovery...");
        
        // Check if discovery is running
        let was_running = {
            let is_running = self.is_running.lock().unwrap();
            *is_running
        };
        
        if !was_running {
            info!("Discovery was not running, nothing to stop");
            return Ok(()); // Already stopped, no error
        }

        // Set running flag to false first to stop all background tasks
        {
            let mut is_running = self.is_running.lock().unwrap();
            *is_running = false;
        }
        info!("Set running flag to false");

        // Send stop signal
        if let Some(tx) = self.stop_tx.take() {
            match tx.send(()).await {
                Ok(_) => debug!("Stop signal sent successfully"),
                Err(_) => debug!("Stop signal channel already closed"),
            }
        }

        // Give background tasks time to stop
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Unregister service and shutdown daemon
        if let Some(daemon) = self.daemon.take() {
            // Only unregister if the service was actually registered
            let should_unregister = {
                let service_registered = self.service_registered.lock().unwrap();
                *service_registered
            };
            
            if should_unregister {
                info!("Unregistering mDNS service: {}", self.service_name);
                match daemon.unregister(&self.service_name) {
                    Ok(_) => {
                        info!("Successfully unregistered service: {}", self.service_name);
                        // Mark service as no longer registered
                        let mut service_registered = self.service_registered.lock().unwrap();
                        *service_registered = false;
                    }
                    Err(e) => {
                        // Log as warning instead of error - this is common during shutdown
                        warn!("Could not unregister service {} (this is normal during shutdown): {}", self.service_name, e);
                        // Still mark as unregistered to avoid double unregistration
                        let mut service_registered = self.service_registered.lock().unwrap();
                        *service_registered = false;
                    }
                }
            } else {
                debug!("Service was not registered, skipping unregistration");
            }
            
            // Give the daemon time to clean up
            tokio::time::sleep(Duration::from_millis(150)).await;
        }

        // Clear peers
        {
            let mut peers = self.peers.lock().unwrap();
            let peer_count = peers.len();
            peers.clear();
            if peer_count > 0 {
                info!("Cleared {} discovered peers", peer_count);
            }
        }

        info!("Network discovery stopped successfully");
        Ok(())
    }

    /// Gets the list of discovered peers
    pub fn get_discovered_peers(&self) -> Vec<User> {
        let peers = self.peers.lock().unwrap();
        peers.values().cloned().collect()
    }

    /// Broadcasts an update to the local user info
    pub async fn broadcast_user_update(&self) -> AppResult<()> {
        // Check if discovery is running
        {
            let is_running = self.is_running.lock().unwrap();
            if !*is_running {
                return Err(AppError::DiscoveryError(
                    "Discovery not running".to_string(),
                ));
            }
        }

        // Update service TXT record with new user info
        if let Some(daemon) = &self.daemon {
            let user_json =
                serde_json::to_string(&self.local_user).map_err(AppError::SerializationError)?;

            // First unregister the old service if it was registered
            let should_unregister = {
                let service_registered = self.service_registered.lock().unwrap();
                *service_registered
            };
            
            if should_unregister {
                let _ = daemon.unregister(&self.service_name);
            }

            // Give some time for unregistration
            tokio::time::sleep(Duration::from_millis(100)).await;

            let service_info = ServiceInfo::new(
                SERVICE_TYPE,
                &self.service_name,
                &self.local_user.name,
                &self.local_user.ip,
                SERVICE_PORT,
                Some({
                    let mut txt_records = HashMap::new();
                    txt_records.insert("user".to_string(), user_json);
                    txt_records
                }),
            )
            .map_err(|e| AppError::MdnsError(format!("Failed to create service info: {e}")))?;

            daemon
                .register(service_info)
                .map_err(|e| AppError::MdnsError(format!("Failed to update service: {e}")))?;

            // Mark service as registered again
            {
                let mut service_registered = self.service_registered.lock().unwrap();
                *service_registered = true;
            }

            info!("Broadcast user update");
            Ok(())
        } else {
            Err(AppError::DiscoveryError(
                "Daemon not initialized".to_string(),
            ))
        }
    }
}

use log::{debug, info, warn};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;

use crate::error::{AppError, AppResult};
use crate::models::User;

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
}

impl Drop for NetworkDiscovery {
    fn drop(&mut self) {
        // Set running flag to false to stop background threads
        if let Ok(mut is_running) = self.is_running.lock() {
            *is_running = false;
        }

        // Unregister service if daemon exists
        if let Some(daemon) = &self.daemon {
            let _ = daemon.unregister(&self.service_name);
        }
    }
}

impl NetworkDiscovery {
    /// Creates a new NetworkDiscovery instance
    pub fn new(local_user: User) -> Self {
        let service_name = format!("ip-chat-{}", local_user.id);

        NetworkDiscovery {
            local_user,
            peers: Arc::new(Mutex::new(HashMap::new())),
            daemon: None,
            service_name,
            is_running: Arc::new(Mutex::new(false)),
            stop_tx: None,
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

        daemon
            .register(service_info)
            .map_err(|e| AppError::MdnsError(format!("Failed to register service: {e}")))?;

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
        std::thread::spawn(move || {
            loop {
                // Check if we should stop
                {
                    let is_running = is_running_clone.lock().unwrap();
                    if !*is_running {
                        break;
                    }
                }

                // Get a new receiver for each iteration
                let receiver = browse_handle_clone.recv_timeout(Duration::from_millis(500));

                // Process the event
                match receiver {
                    Ok(event) => {
                        // Try to send the event to the channel
                        if event_tx.blocking_send(event).is_err() {
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
            debug!("mDNS receiver thread exiting");
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
                                                    peers_map.insert(user.id.clone(), user);
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
                        }
                        info!("Current peer count: {after_count}");
                    }
                }
            }

            // Set running flag to false when exiting
            let mut is_running_guard = is_running.lock().unwrap();
            *is_running_guard = false;
        });

        info!("Network discovery started");
        Ok(())
    }

    /// Stops the network discovery service
    pub async fn stop_discovery(&mut self) -> AppResult<()> {
        // Check if discovery is running
        {
            let is_running = self.is_running.lock().unwrap();
            if !*is_running {
                return Ok(()); // Already stopped, no error
            }
        }

        // Send stop signal
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(()).await; // Ignore send errors
        }

        // Set running flag to false first
        {
            let mut is_running = self.is_running.lock().unwrap();
            *is_running = false;
        }

        // Unregister service and shutdown daemon
        if let Some(daemon) = self.daemon.take() {
            // Only unregister if the service was actually registered
            let _ = daemon.unregister(&self.service_name); // Ignore unregister errors
                                                           // Give the daemon time to clean up
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        // Clear peers
        {
            let mut peers = self.peers.lock().unwrap();
            peers.clear();
        }

        info!("Network discovery stopped");
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

            // First unregister the old service
            let _ = daemon.unregister(&self.service_name);

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

            info!("Broadcast user update");
            Ok(())
        } else {
            Err(AppError::DiscoveryError(
                "Daemon not initialized".to_string(),
            ))
        }
    }
}

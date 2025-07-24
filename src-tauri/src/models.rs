use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::chat::ChatManager;
use crate::connection_manager::ConnectionManager;
use crate::discovery::NetworkDiscovery;
use crate::file_transfer::FileTransferManager;

/// Represents a user in the network
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    /// Unique identifier for the user
    pub id: String,
    /// Display name of the user
    pub name: String,
    /// IP address of the user
    pub ip: String,
    /// Last time the user was seen on the network
    pub last_seen: DateTime<Utc>,
}

/// Represents a chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    /// Unique identifier for the message
    pub id: String,
    /// ID of the sender
    pub sender_id: String,
    /// ID of the recipient
    pub recipient_id: String,
    /// Content of the message
    pub content: String,
    /// Timestamp when the message was sent
    pub timestamp: DateTime<Utc>,
    /// Whether the message has been read
    pub read: bool,
}

/// Represents the status of a file transfer
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransferStatus {
    /// Transfer is pending acceptance
    Pending,
    /// Transfer is in progress
    InProgress,
    /// Transfer has been completed
    Completed,
    /// Transfer has been rejected
    Rejected,
    /// Transfer has been cancelled
    Cancelled,
    /// Transfer has failed
    Failed,
}

/// Represents a file transfer
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTransfer {
    /// Unique identifier for the transfer
    pub id: String,
    /// ID of the sender
    pub sender_id: String,
    /// ID of the recipient
    pub recipient_id: String,
    /// IP address of the sender
    pub sender_ip: Option<String>,
    /// IP address of the recipient
    pub recipient_ip: Option<String>,
    /// Name of the file
    pub file_name: String,
    /// Size of the file in bytes
    pub file_size: u64,
    /// Path to the file on the sender's machine
    pub source_path: Option<String>,
    /// Path where the file will be saved on the recipient's machine
    pub destination_path: Option<String>,
    /// Current status of the transfer
    pub status: TransferStatus,
    /// Number of bytes transferred so far
    pub bytes_transferred: u64,
    /// Timestamp when the transfer was initiated
    pub timestamp: DateTime<Utc>,
    /// Error message if the transfer failed
    pub error: Option<String>,
}

/// Represents the application state
pub struct AppState {
    /// The local user
    pub local_user: User,
    /// Network discovery service
    pub discovery: NetworkDiscovery,
    /// Chat manager
    pub chat_manager: ChatManager,
    /// Connection manager for peer connections
    pub connection_manager: ConnectionManager,
    /// File transfer manager
    pub file_manager: FileTransferManager,
    /// Whether services have been initialized
    pub services_initialized: bool,
}

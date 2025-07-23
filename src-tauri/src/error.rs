use thiserror::Error;
use std::io;

/// Custom error types for the application
#[derive(Error, Debug)]
pub enum AppError {
    /// Error during network discovery
    #[error("Network discovery error: {0}")]
    DiscoveryError(String),
    
    /// Error during chat operations
    #[error("Chat error: {0}")]
    #[allow(dead_code)]
    ChatError(String),
    
    /// Error during file transfer
    #[error("File transfer error: {0}")]
    FileTransferError(String),
    
    /// Error with network operations
    #[error("Network error: {0}")]
    NetworkError(String),
    
    /// Error with I/O operations
    #[error("I/O error: {0}")]
    IoError(#[from] io::Error),
    
    /// Error with serialization/deserialization
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    
    /// Error with mDNS operations
    #[error("mDNS error: {0}")]
    MdnsError(String),
    
    /// User not found
    #[error("User not found: {0}")]
    #[allow(dead_code)]
    UserNotFound(String),
    
    /// File not found
    #[error("File not found: {0}")]
    FileNotFound(String),
    
    /// Transfer not found
    #[error("Transfer not found: {0}")]
    TransferNotFound(String),
    
    /// Invalid operation
    #[error("Invalid operation: {0}")]
    #[allow(dead_code)]
    InvalidOperation(String),
    
    /// Other errors
    #[error("Other error: {0}")]
    #[allow(dead_code)]
    Other(String),
}

/// Result type for the application
pub type AppResult<T> = Result<T, AppError>;

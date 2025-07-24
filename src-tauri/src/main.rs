// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Initialize logger with appropriate level
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info) // Show info, warn, and error messages
        .init();

    println!("Starting IP Chat application...");

    // Run the application
    ip_chat_lib::run()
}

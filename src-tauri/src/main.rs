// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Initialize logger for debugging
    env_logger::init();

    // Run the application
    ip_chat_lib::run()
}

#!/bin/bash

# Clear snap-related environment variables that conflict with glibc
unset XDG_CONFIG_DIRS_VSCODE_SNAP_ORIG
unset GDK_BACKEND_VSCODE_SNAP_ORIG
unset GIO_MODULE_DIR_VSCODE_SNAP_ORIG
unset GSETTINGS_SCHEMA_DIR
unset GTK_EXE_PREFIX
unset GTK_PATH
unset LOCPATH
unset XDG_DATA_HOME_VSCODE_SNAP_ORIG
unset GTK_EXE_PREFIX_VSCODE_SNAP_ORIG
unset XDG_DATA_DIRS_VSCODE_SNAP_ORIG
unset GTK_IM_MODULE_FILE
unset LOCPATH_VSCODE_SNAP_ORIG
unset GIO_MODULE_DIR

# Set clean environment for GTK
export XDG_DATA_DIRS="/usr/local/share:/usr/share"
export XDG_CONFIG_DIRS="/etc/xdg"

# Run the binary
exec "$(dirname "$0")/src-tauri/target/release/ip-chat" "$@"
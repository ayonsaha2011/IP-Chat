# Copilot Instructions for ip-chat

## Project Overview
- **ip-chat** is a cross-platform desktop chat app built with Tauri (Rust backend) and SolidJS (TypeScript frontend), using Vite for development/build.
- The frontend lives in `src/` and uses SolidJS components, Hope UI, and Kobalte for UI, with state managed in `src/stores/`.
- The backend (Rust) is in `src-tauri/src/`, handling networking, file transfer, and system integration.

## Key Architecture & Patterns
- **Frontend**: Entry point is `src/index.tsx`. Main UI logic is in `src/components/` (e.g., `ChatPanel.tsx`, `PeerList.tsx`). State is managed via Solid stores in `src/stores/`.
- **Backend**: Rust modules in `src-tauri/src/` (e.g., `chat.rs`, `file_transfer.rs`). Communication with frontend via Tauri commands/plugins.
- **Cross-communication**: Use Tauri's JS API (`@tauri-apps/api`) and plugins for dialog, file system, shell, notification, etc.
- **Types**: Shared types are in `src/types/` (TS) and Rust models in `src-tauri/src/models.rs`.

## Developer Workflows
- **Start dev server (frontend only):** `npm run dev`
- **Start full Tauri app (frontend + backend):** `npm run tauri dev` (or `npx tauri dev`)
- **Build for production:** `npm run build` (frontend), `npm run tauri build` (full app)
- **Rust backend only:** Use `cargo` in `src-tauri/` (e.g., `cargo run`)
- **Dependencies:** JS deps in `package.json`, Rust deps in `src-tauri/Cargo.toml`

## Project-Specific Conventions
- **Component structure:** Each UI feature is a Solid component in `src/components/`.
- **State:** Use Solid stores (`src/stores/`) for app-wide state (chat, file transfer, settings, user).
- **Styling:** Global styles in `src/styles/global.css`, component styles in `App.css`.
- **File transfer:** Handled via Rust backend (`file_transfer.rs`) and exposed to frontend via Tauri.
- **Icons/assets:** In `public/` and `src/assets/`.

## Integration Points
- **Tauri plugins:** Used for system dialogs, file system, shell, notifications. See `@tauri-apps/plugin-*` in `package.json`.
- **Rust <-> JS:** Use Tauri's command system for invoking backend logic from frontend.
- **Testing:** No explicit test setup found; follow Rust and JS best practices if adding tests.

## Examples
- To add a new chat feature: create a Solid component in `src/components/`, add state to `src/stores/chatStore.ts`, and backend logic in `src-tauri/src/chat.rs` if needed.
- To add a new system integration: add a Tauri plugin (JS and Rust), update `vite.config.ts` and `src-tauri/Cargo.toml` as needed.

## References
- Main entry: `src/index.tsx`, `src-tauri/src/main.rs`
- UI: `src/components/`, `src/App.tsx`
- Backend: `src-tauri/src/`
- State: `src/stores/`
- Types: `src/types/`, `src-tauri/src/models.rs`

---
If any conventions or workflows are unclear, ask for clarification or check the README and code structure for guidance.

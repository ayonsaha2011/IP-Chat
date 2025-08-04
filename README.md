# IP Chat

[![CI](https://github.com/ayonsaha2011/ip-chat/workflows/CI/badge.svg)](https://github.com/ayonsaha2011/ip-chat/actions/workflows/ci.yml)
[![Release](https://github.com/ayonsaha2011/ip-chat/workflows/Release/badge.svg)](https://github.com/ayonsaha2011/ip-chat/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/release/ayonsaha2011/ip-chat.svg)](https://github.com/ayonsaha2011/ip-chat/releases)

A cross-platform desktop application for local network communication and file sharing. Built with Tauri, Rust, and SolidJS.

![IP Chat Screenshot](https://via.placeholder.com/800x500/0080e6/ffffff?text=IP+Chat+Screenshot)

## ✨ Features

- 🔍 **Network Discovery**: Automatic peer discovery using mDNS/Bonjour
- 💬 **Real-time Chat**: Instant messaging with read receipts and message history
- 📁 **File Sharing**: Drag-and-drop file transfer with progress tracking
- ⚙️ **Settings**: Customizable themes, user profiles, and preferences
- 🖥️ **Cross-Platform**: Native desktop app for Windows, macOS, and Linux
- 🌙 **Dark Mode**: System-aware theme switching
- 🔒 **Local Network Only**: No internet required, all communication stays on your local network

## 📥 Installation

### Download Pre-built Binaries

Go to the [Releases](https://github.com/ayonsaha2011/ip-chat/releases) page and download the appropriate file for your operating system:

#### Windows
- **Installer**: `ip-chat_vX.X.X_windows_x64.msi`
- **Portable**: `ip-chat_vX.X.X_windows_x64_portable.exe`

#### macOS
- **Intel**: `ip-chat_vX.X.X_macos_x64.dmg`
- **Apple Silicon**: `ip-chat_vX.X.X_macos_aarch64.dmg`

#### Linux
- **Universal (AppImage)**: `ip-chat_vX.X.X_linux_x86_64.AppImage` - Works on all distributions
- **Ubuntu 20.04/Debian**: `ip-chat_vX.X.X_ubuntu20.04_amd64.deb`
- **Ubuntu 22.04+**: `ip-chat_vX.X.X_ubuntu22.04_amd64.deb`  
- **CentOS/RHEL/Fedora**: `ip-chat_vX.X.X_linux_x86_64.rpm`
- **Arch Linux**: `ip-chat_vX.X.X_arch_x86_64.tar.xz`

### Installation Instructions

#### Windows
**Installer (Recommended)**:
1. Download the `.msi` file
2. Run the installer and follow the setup wizard
3. Launch IP Chat from the Start Menu

**Portable**:
1. Download the `_portable.exe` file
2. Run directly - no installation required

#### macOS
1. Download the appropriate `.dmg` file for your Mac (Intel or Apple Silicon)
2. Open the DMG and drag IP Chat to Applications
3. Launch IP Chat from Launchpad or Applications folder
4. If you get a security warning, go to System Preferences > Security & Privacy to allow the app

#### Linux

**Universal (AppImage) - Recommended**:
1. Download the `.AppImage` file
2. Make it executable: `chmod +x ip-chat_*.AppImage`
3. Run the AppImage: `./ip-chat_*.AppImage`

**Ubuntu 20.04/Debian**:
1. Download the `ubuntu20.04_amd64.deb` file
2. Install: `sudo dpkg -i ip-chat_*.deb`
3. If missing dependencies: `sudo apt-get install -f`

**Ubuntu 22.04+**:
1. Download the `ubuntu22.04_amd64.deb` file
2. Install: `sudo dpkg -i ip-chat_*.deb`
3. Launch from applications menu or run `ip-chat`

**CentOS/RHEL/Fedora**:
1. Download the `.rpm` file
2. Install: `sudo rpm -i ip-chat_*.rpm` or `sudo dnf install ip-chat_*.rpm`
3. Launch from applications menu or run `ip-chat`

**Arch Linux**:
1. Download the `.tar.xz` file
2. Extract: `tar -xf ip-chat_*.tar.xz`
3. Install: `sudo cp -r usr/* /usr/`
4. Launch from applications menu or run `ip-chat`

## 🚀 Usage

1. **Launch the Application**: Start IP Chat on your device
2. **Automatic Discovery**: The app will automatically discover other IP Chat users on your local network
3. **Start Chatting**: Go to the "Peers" tab to see discovered users, then click to start a conversation
4. **Share Files**: Drag and drop files in the chat or use the "Files" tab for dedicated file transfer
5. **Customize**: Use the "Settings" tab to customize your profile and preferences

## 🛠️ Development

### Prerequisites

- **Node.js** (v18 or later)
- **Rust** (latest stable)
- **System Dependencies**:
  - **Linux**: `libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf libavahi-client-dev`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ayonsaha2011/ip-chat.git
   cd ip-chat
   ```

2. **Install frontend dependencies**:
   ```bash
   npm install
   ```

3. **Install Rust dependencies** (automatically handled by Tauri):
   ```bash
   cd src-tauri
   cargo build
   ```

### Development Commands

- **Start development server**:
  ```bash
  npm run tauri dev
  ```

- **Build the application**:
  ```bash
  npm run tauri build
  ```

- **Run frontend only**:
  ```bash
  npm run dev
  ```

- **Type checking**:
  ```bash
  npx tsc --noEmit
  ```

- **Test Rust backend**:
  ```bash
  cd src-tauri
  cargo test
  ```

### Project Structure

```
ip-chat/
├── src/                    # Frontend source (SolidJS)
│   ├── components/         # UI components
│   ├── stores/            # State management
│   ├── types/             # TypeScript definitions
│   └── utils/             # Utility functions
├── src-tauri/             # Backend source (Rust)
│   ├── src/
│   │   ├── discovery.rs   # Network discovery
│   │   ├── chat.rs        # Chat functionality
│   │   ├── file_transfer.rs # File sharing
│   │   └── lib.rs         # Tauri commands
│   └── Cargo.toml         # Rust dependencies
├── .github/workflows/     # CI/CD workflows
└── package.json           # Frontend dependencies
```

## 🔧 Technical Details

### Network Discovery

IP Chat uses mDNS (Multicast DNS) for automatic peer discovery on the local network. Each instance broadcasts its presence and listens for other instances using the service type `_ip-chat._tcp.local`.

### Communication Protocol

- **Discovery**: mDNS service broadcasting and browsing
- **Chat**: Direct TCP connections between peers
- **File Transfer**: HTTP-like protocol over TCP with progress tracking

### Security

- All communication happens over the local network only
- No data is sent to external servers
- File transfers use direct peer-to-peer connections
- No user data is stored permanently (messages are session-only)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/ayonsaha2011/ip-chat/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ayonsaha2011/ip-chat/discussions)
- **Security**: For security concerns, please email security@yourproject.com

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/) for the desktop application framework
- Frontend powered by [SolidJS](https://solidjs.com/) and [Hope UI](https://hope-ui.com/)
- Network discovery using [mdns-sd](https://crates.io/crates/mdns-sd)
- Icons from [Solid Icons](https://github.com/x64Bits/solid-icons)

## 📈 Roadmap

- [ ] Message encryption for enhanced security
- [ ] Group chat support
- [ ] File transfer resume capability
- [ ] Custom emoji and reactions
- [ ] Voice messages
- [ ] Screen sharing
- [ ] Mobile companion app

---

Made with ❤️ for local network communication
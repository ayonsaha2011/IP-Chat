# Release Guide

This document explains how to create a new release of IP Chat.

## Quick Release

To create a new release, use the release script:

```bash
./scripts/release.sh 1.0.0
```

## Manual Release Process

If you need to create a release manually:

### 1. Prerequisites

- Ensure you're on the `main` branch
- Ensure working directory is clean (`git status`)
- All tests should pass
- All dependencies should be up to date

### 2. Version Update

Update version numbers in:
- `package.json`
- `src-tauri/Cargo.toml`
- Update `src-tauri/Cargo.lock` by running `cargo build` in the `src-tauri` directory

### 3. Commit and Tag

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to X.Y.Z"
git tag -a "vX.Y.Z" -m "Release vX.Y.Z"
```

### 4. Push Changes

```bash
git push origin main
git push origin vX.Y.Z
```

### 5. GitHub Actions

The release will be automatically built by GitHub Actions and create:

#### Windows
- `ip-chat_vX.Y.Z_windows_x64.msi` (installer)
- `ip-chat_vX.Y.Z_windows_x64_portable.exe` (portable)

#### macOS
- `ip-chat_vX.Y.Z_macos_x64.dmg` (Intel Macs)
- `ip-chat_vX.Y.Z_macos_aarch64.dmg` (Apple Silicon Macs)

#### Linux
- `ip-chat_vX.Y.Z_linux_x86_64.AppImage` (universal)
- `ip-chat_vX.Y.Z_ubuntu22.04_amd64.deb`
- `ip-chat_vX.Y.Z_linux_x86_64.rpm` (CentOS/RHEL/Fedora)

## Troubleshooting

### Release Script Issues

If the release script fails:

1. **Git not clean**: Commit or stash changes first
2. **Package manager issues**: Ensure pnpm is installed and working
3. **Version conflicts**: Ensure the new version is different from current

### GitHub Actions Failures

If the main release workflow fails:

1. Check the Actions tab for error details
2. Use the fallback release workflow:
   - Go to Actions → Release Fallback → Run workflow
   - Enter the version number (e.g., `1.0.0`)

### Common Issues

- **Missing dependencies**: Install system dependencies for your platform
- **Build failures**: Check that the app builds locally first
- **Permission errors**: Ensure proper GitHub permissions for releases

## Release Checklist

Before creating a release:

- [ ] All tests pass locally
- [ ] App builds successfully on your platform
- [ ] File transfer functionality works
- [ ] Chat functionality works
- [ ] Network discovery works
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated (if exists)
- [ ] Version numbers are consistent

## Post-Release

After a successful release:

1. Verify all platform builds completed successfully
2. Test download and installation on different platforms
3. Update any documentation that references version numbers
4. Announce the release (if applicable)

## Version Numbering

IP Chat follows [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., 1.2.3)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Examples

- `1.0.0` - Initial stable release
- `1.1.0` - New features added
- `1.1.1` - Bug fixes
- `2.0.0` - Breaking changes
#!/bin/bash

# IP Chat Release Script
# This script helps create new releases by updating version numbers and creating git tags

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "src-tauri/Cargo.toml" ]; then
    print_error "This script must be run from the project root directory"
    exit 1
fi

# Check if git is clean
if [ -n "$(git status --porcelain)" ]; then
    print_error "Git working directory is not clean. Please commit or stash changes first."
    exit 1
fi

# Get current versions
CURRENT_NPM_VERSION=$(node -p "require('./package.json').version")
CURRENT_CARGO_VERSION=$(grep '^version = ' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')

print_status "Current versions:"
echo "  NPM: $CURRENT_NPM_VERSION"
echo "  Cargo: $CURRENT_CARGO_VERSION"

# Check if versions match
if [ "$CURRENT_NPM_VERSION" != "$CURRENT_CARGO_VERSION" ]; then
    print_warning "Version mismatch between package.json and Cargo.toml"
    print_status "Using NPM version: $CURRENT_NPM_VERSION"
fi

# Get new version from argument or prompt
if [ -n "$1" ]; then
    NEW_VERSION="$1"
else
    echo
    print_status "Enter new version (current: $CURRENT_NPM_VERSION):"
    read -r NEW_VERSION
fi

# Validate version format (basic semver check)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    print_error "Invalid version format. Please use semantic versioning (e.g., 1.0.0)"
    exit 1
fi

# Check if this is a version bump
if [ "$NEW_VERSION" = "$CURRENT_NPM_VERSION" ]; then
    print_error "New version must be different from current version"
    exit 1
fi

print_status "Updating version to: $NEW_VERSION"

# Update package.json
print_status "Updating package.json..."
npm version "$NEW_VERSION" --no-git-tag-version

# Update Cargo.toml
print_status "Updating Cargo.toml..."
sed -i.bak "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
rm src-tauri/Cargo.toml.bak

# Update Cargo.lock
print_status "Updating Cargo.lock..."
cd src-tauri
cargo build --quiet
cd ..

# Commit changes
print_status "Committing version changes..."
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to $NEW_VERSION"

# Create git tag
TAG_NAME="v$NEW_VERSION"
print_status "Creating git tag: $TAG_NAME"
git tag -a "$TAG_NAME" -m "Release $TAG_NAME"

# Show what we did
print_status "Release preparation complete!"
echo
echo "Summary:"
echo "  - Updated version to $NEW_VERSION"
echo "  - Created commit with version changes"
echo "  - Created git tag: $TAG_NAME"
echo
print_status "Next steps:"
echo "  1. Review the changes: git log --oneline -2"
echo "  2. Push to remote: git push origin main --tags"
echo "  3. GitHub Actions will automatically create the release"
echo
print_warning "Note: Make sure to push both the commit AND the tag!"
print_status "Run: git push origin main && git push origin $TAG_NAME"
echo
print_status "Expected release assets:"
echo "  Windows:"
echo "    - ip-chat_${TAG_NAME}_windows_x64.msi (installer)"
echo "    - ip-chat_${TAG_NAME}_windows_x64_portable.exe (portable)"
echo "  macOS:"
echo "    - ip-chat_${TAG_NAME}_macos_x64.dmg (Intel)"
echo "    - ip-chat_${TAG_NAME}_macos_aarch64.dmg (Apple Silicon)"
echo "  Linux:"
echo "    - ip-chat_${TAG_NAME}_linux_x86_64.AppImage (universal)"
echo "    - ip-chat_${TAG_NAME}_ubuntu20.04_amd64.deb"
echo "    - ip-chat_${TAG_NAME}_ubuntu22.04_amd64.deb"
echo "    - ip-chat_${TAG_NAME}_linux_x86_64.rpm (CentOS/RHEL/Fedora)"
echo "    - ip-chat_${TAG_NAME}_arch_x86_64.tar.xz (Arch Linux)"
echo
print_status "If any platform fails to build, the release will continue with available packages."
print_warning "If the main release workflow fails completely, use the fallback workflow:"
echo "  Go to Actions → Release Fallback → Run workflow → Enter version: $NEW_VERSION"
#!/bin/bash

# IP Chat Setup Checker
# This script verifies that the development environment is properly configured

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if we're in the right directory
print_header "Directory Structure Check"
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Are you in the project root?"
    exit 1
fi
print_success "Found package.json"

if [ ! -f "src-tauri/Cargo.toml" ]; then
    print_error "src-tauri/Cargo.toml not found"
    exit 1
fi
print_success "Found src-tauri/Cargo.toml"

if [ ! -d ".github/workflows" ]; then
    print_error ".github/workflows directory not found"
    exit 1
fi
print_success "Found .github/workflows directory"

# Check required files
REQUIRED_FILES=(
    "README.md"
    "LICENSE"
    "CONTRIBUTING.md"
    ".github/workflows/ci.yml"
    ".github/workflows/release.yml"
    "src/App.tsx"
    "src-tauri/src/lib.rs"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "Found $file"
    else
        print_error "Missing $file"
    fi
done

# Check Node.js
print_header "Node.js Environment"
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installed: $NODE_VERSION"
    
    # Check if version is 18 or higher
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_success "Node.js version is compatible (≥18)"
    else
        print_warning "Node.js version should be 18 or higher"
    fi
else
    print_error "Node.js is not installed"
fi

if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm --version)
    print_success "npm installed: $NPM_VERSION"
else
    print_error "npm is not installed"
fi

# Check Rust
print_header "Rust Environment"
if command -v rustc >/dev/null 2>&1; then
    RUST_VERSION=$(rustc --version)
    print_success "Rust installed: $RUST_VERSION"
else
    print_error "Rust is not installed"
fi

if command -v cargo >/dev/null 2>&1; then
    CARGO_VERSION=$(cargo --version)
    print_success "Cargo installed: $CARGO_VERSION"
else
    print_error "Cargo is not installed"
fi

# Check system dependencies (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    print_header "System Dependencies (Linux)"
    
    DEPS=(
        "pkg-config"
        "libgtk-3-dev"
        "libwebkit2gtk-4.0-dev"
        "libappindicator3-dev"
        "librsvg2-dev"
        "patchelf"
        "libavahi-client-dev"
    )
    
    for dep in "${DEPS[@]}"; do
        if dpkg -l "$dep" >/dev/null 2>&1; then
            print_success "$dep is installed"
        else
            print_warning "$dep is not installed"
        fi
    done
fi

# Check project dependencies
print_header "Project Dependencies"
if [ -f "node_modules/.package-lock.json" ] || [ -d "node_modules" ]; then
    print_success "Frontend dependencies installed"
else
    print_warning "Frontend dependencies not installed (run: npm install)"
fi

if [ -f "src-tauri/Cargo.lock" ]; then
    print_success "Rust dependencies resolved"
else
    print_info "Rust dependencies will be resolved on first build"
fi

# Check version consistency
print_header "Version Consistency"
if command -v node >/dev/null 2>&1; then
    NPM_VERSION_VALUE=$(node -p "require('./package.json').version")
    CARGO_VERSION_VALUE=$(grep '^version = ' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
    
    print_info "NPM version: $NPM_VERSION_VALUE"
    print_info "Cargo version: $CARGO_VERSION_VALUE"
    
    if [ "$NPM_VERSION_VALUE" = "$CARGO_VERSION_VALUE" ]; then
        print_success "Versions are consistent"
    else
        print_warning "Version mismatch between package.json and Cargo.toml"
    fi
fi

# Check Git
print_header "Git Configuration"
if command -v git >/dev/null 2>&1; then
    print_success "Git is installed"
    
    if git rev-parse --git-dir >/dev/null 2>&1; then
        print_success "Project is a Git repository"
        
        # Check if there are uncommitted changes
        if [ -n "$(git status --porcelain)" ]; then
            print_warning "There are uncommitted changes"
        else
            print_success "Working directory is clean"
        fi
        
        # Check if remote is configured
        if git remote get-url origin >/dev/null 2>&1; then
            REMOTE_URL=$(git remote get-url origin)
            print_success "Remote origin configured: $REMOTE_URL"
        else
            print_warning "No remote origin configured"
        fi
    else
        print_warning "Not in a Git repository"
    fi
else
    print_error "Git is not installed"
fi

# Summary
print_header "Setup Summary"
print_info "Development environment check complete!"
print_info ""
print_info "Next steps:"
print_info "1. Install missing dependencies if any"
print_info "2. Run 'npm install' if frontend deps are missing"
print_info "3. Run 'npm run tauri dev' to start development"
print_info "4. Configure Git remote if needed"
print_info ""
print_info "For releases:"
print_info "- Use './scripts/release.sh <version>' to create releases"
print_info "- Push tags to trigger GitHub Actions workflows"
# Contributing to IP Chat

Thank you for your interest in contributing to IP Chat! We welcome contributions from everyone.

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, please include:

- A clear and descriptive title
- Steps to reproduce the behavior
- Expected behavior vs actual behavior
- Screenshots if applicable
- Your operating system and version
- Application version

### Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:

- A clear and descriptive title
- A detailed description of the proposed feature
- Use cases and examples
- Any relevant mockups or designs

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the development setup** in the README
3. **Make your changes** with clear, focused commits
4. **Add tests** if applicable
5. **Update documentation** if needed
6. **Ensure CI passes** before submitting
7. **Create a pull request** with a clear description

### Development Process

#### Setting up the Development Environment

1. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ip-chat.git
   cd ip-chat
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run tauri dev
   ```

#### Code Style

- **Frontend (TypeScript/SolidJS)**:
  - Use TypeScript strict mode
  - Follow the existing code style
  - Use meaningful variable and function names
  - Add JSDoc comments for complex functions

- **Backend (Rust)**:
  - Follow Rust conventions (`cargo fmt`)
  - Use `cargo clippy` to catch common issues
  - Add documentation comments for public APIs
  - Write tests for new functionality

#### Testing

- **Frontend**: No specific testing framework currently, but manual testing is required
- **Backend**: Use `cargo test` to run Rust tests
- **Integration**: Test the full application on different platforms when possible

#### Commit Messages

Use clear, descriptive commit messages:

```
feat: add dark mode toggle to settings panel
fix: resolve peer discovery timeout issues
docs: update installation instructions for Linux
chore: update dependencies to latest versions
```

### Development Guidelines

#### Adding New Features

1. **Discuss first**: For major features, open an issue to discuss the approach
2. **Keep it simple**: Follow the KISS principle
3. **Consider all platforms**: Ensure features work on Windows, macOS, and Linux
4. **Test thoroughly**: Verify functionality across different network configurations

#### Code Organization

- **Frontend components**: Place in `src/components/`
- **State management**: Use the existing stores in `src/stores/`
- **Rust modules**: Organize by functionality in `src-tauri/src/`
- **Types**: Keep TypeScript types in `src/types/`

#### Performance Considerations

- **Network efficiency**: Minimize network traffic and bandwidth usage
- **Memory usage**: Be mindful of memory consumption, especially for file transfers
- **UI responsiveness**: Keep the UI responsive during long operations
- **Battery life**: Consider power consumption on laptops

### Areas for Contribution

We especially welcome contributions in these areas:

#### High Priority
- [ ] Message encryption implementation
- [ ] File transfer resume capability
- [ ] Network error recovery improvements
- [ ] Cross-platform UI consistency fixes

#### Medium Priority
- [ ] Group chat functionality
- [ ] Custom emoji support
- [ ] Voice message recording
- [ ] Better file preview support

#### Low Priority
- [ ] Theme customization
- [ ] Notification improvements
- [ ] Accessibility enhancements
- [ ] Performance optimizations

### Release Process

Releases follow semantic versioning:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes, backward compatible

### Getting Help

- **Discussions**: Use [GitHub Discussions](https://github.com/YOUR_USERNAME/ip-chat/discussions) for questions
- **Issues**: Check existing [issues](https://github.com/YOUR_USERNAME/ip-chat/issues) or create new ones
- **Documentation**: Refer to the README and inline code documentation

### Recognition

Contributors will be recognized in:
- The project README
- Release notes for significant contributions
- The application's about section

Thank you for helping make IP Chat better! 🎉
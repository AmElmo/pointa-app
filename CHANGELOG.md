# Changelog

All notable changes to the Pointa extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Update notification system for extension updates
- Version compatibility checking between extension and server
- Server update check with GitHub API integration
- Update banner UI in extension popup

### Fixed
- CORS configuration now accepts any localhost port (server v0.1.9+)
- API status now correctly detected across all localhost development servers
- Resolved issue where API appeared offline on certain ports despite server running
- **Critical: Fixed annotations disappearing after creation** - Smart sync now properly handles bidirectional merging
- Annotations now persist correctly even when API save fails temporarily
- Sync logic now pushes local-only annotations to server instead of discarding them
- **Extension badge now updates correctly** - Badge displays annotation count immediately on page load
- Badge updates are now faster and more reliable (no longer waits for API call)
- Badge count updates immediately when annotations are added, edited, or deleted

## [1.0.0] - 2025-08-04

### Added
- Initial release of Pointa Chrome extension
- Visual annotation system for localhost development
- MCP integration for AI coding agents
- Light/dark theme support with system preference detection
- Persistent inspection mode for multiple annotations
- Pin-based annotation system with numbered badges
- Route-scoped annotation management
- Chrome Storage API integration
- Real-time synchronization with external server
- File protocol support for local HTML files
- Iconify integration with 200k+ icons
- Zero layout shift editing experience

### Fixed
- Server race conditions causing ENOENT errors
- Badge numbering inconsistencies
- Variable scope issues in error handling
- Redundant sync operations

### Security
- Localhost-only operation for development focus
- Minimal permissions model
- No external network requests from extension
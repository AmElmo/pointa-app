# Changelog - Pointa Server

All notable changes to the Pointa annotation server package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automatic update check against GitHub releases
- Version information in health endpoint
- Dynamic version reading from package.json in CLI

### Improved
- Smart URL filtering: `read_annotations` now intelligently matches URLs
  - Base URL pattern: `http://localhost:3456` now automatically matches all annotations from that project (e.g., `http://localhost:3456/`, `http://localhost:3456/dashboard`, etc.)
  - Exact match fallback: If exact URL matches exist (e.g., `http://localhost:3456` annotation), returns only those
  - Explicit wildcard: `http://localhost:3456/*` continues to work as before
  - No longer requires trailing slash or wildcard for project-wide filtering
- Both MCP tool and REST API endpoints now use the smart URL filtering logic

## [0.2.1] - 2025-12-01

### Fixed
- Bug report URL filtering now uses `.startsWith()` instead of exact match
- MCP tool `read_bug_reports` now correctly returns bugs when filtering by base URL (e.g., `http://localhost:3456` now matches `http://localhost:3456/any/path`)

## [0.1.9] - 2025-11-12

### Fixed
- CORS configuration now accepts any localhost port (previously limited to specific ports)
- Extension now properly detects API status across all localhost development servers
- Resolved issue where API appeared offline on certain localhost ports despite server running
- Data directory is correctly configured to use `~/.pointa/`

### Changed
- CORS policy upgraded from whitelist to dynamic origin validation
- Now supports all localhost ports (`:3000`, `:8000`, `:5173`, etc.)
- Added support for `.local`, `.test`, and `.localhost` development domains

## [0.1.3] - 2025-08-05

### Added
- File locking mechanism to prevent save race conditions
- Data comparison in sync endpoint to skip redundant saves
- Enhanced logging for file operations

### Fixed
- ENOENT errors during concurrent annotation saves
- Variable scope bug in fallback write mechanism
- CLI version now reads from package.json instead of hardcoded value

### Changed
- Improved error handling with proper fallback mechanisms
- Better concurrent operation handling

## [0.1.2] - 2025-08-04

### Added
- SSE transport implementation for Claude Code integration
- Bidirectional synchronization with smart conflict resolution
- Session management for transport connections
- Enhanced startup logging with annotation counts

### Fixed
- SSE transport timeout issues with Claude Code
- Annotation persistence across server restarts

## [0.1.0] - 2025-08-03

### Added
- Initial release of Pointa annotation server
- HTTP API for Chrome extension communication
- MCP tool implementations (read_annotations, delete_annotation, get_project_context)
- SSE endpoint for AI coding agent integration
- CLI with start/stop/restart/status commands
- Atomic file operations for data persistence
- Multi-project detection and warnings
- Graceful shutdown handling

### Security
- Local-only operation (127.0.0.1)
- No external dependencies for core functionality
# Changelog - Pointa Server

All notable changes to the Pointa annotation server package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2025-12-03

### BREAKING CHANGES
- **Renamed `bug_reports.json` to `issue_reports.json`**
  - Unified terminology: "issues" encompasses both bugs and performance problems
  - All storage now uses `issue_reports.json` in `~/.pointa/`
  - Better reflects that file contains multiple issue types

### Changed
- **MCP Tools renamed from "bug" to "issue"**:
  - `read_bug_reports` → `read_issue_reports`
  - `mark_bug_needs_rerun` → `mark_issue_needs_rerun`
  - `mark_bug_for_review` → `mark_issue_for_review`
  - `mark_bug_resolved` → `mark_issue_resolved`
- **Updated descriptions**: All tools now mention "bugs and performance investigations"
- **Unified issue handling**: Same MCP tools work for both bug reports and performance investigations
- Both issue types follow same lifecycle: active → debugging → in-review → resolved (archived)

### Architecture
- `issue_reports.json` stores both bug reports (type: 'bug') and performance investigations (type: 'performance-investigation')
- Resolved issues (both types) automatically archived to `archive.json` with `archived_type='issue_report'`
- Cleaner terminology throughout codebase

## [0.2.5] - 2025-12-03

### Changed
- **BREAKING**: Unified archive system for all completed items
  - Renamed archive file from `annotations_archive.json` to `archive.json`
  - Single archive now stores both completed annotations and resolved bug reports
  - Archive items include `archived_type` field ('annotation' or 'bug_report') and `archived_at` timestamp
  - Keeps main data files clean with only active/actionable items

### Bug Reports
- **MCP `read_bug_reports` tool**: Removed `resolved` and `all` status options
  - Now only supports `active` (default), `debugging`, and `in-review` status
  - Resolved bug reports automatically archived - not exposed to AI
- **MCP `mark_bug_resolved` tool**: Now automatically archives bug to `archive.json`
  - Resolved bugs removed from `bug_reports.json`
  - Archive is write-only from AI perspective

### Architecture
- Archive is now a unified storage for all completed work (annotations + bugs)
- MCP tools focus AI on actionable items only
- HTTP API still supports archive access for UI needs

## [0.2.4] - 2025-12-03

### Added
- Automatic archiving of completed annotations to separate file
  - Annotations marked as "done" are now automatically moved to `annotations_archive.json`
  - Keeps main `annotations.json` file clean and only contains active work (pending/in-review)
  - Archive is for storage only - not exposed to MCP tools

### Changed
- **MCP `read_annotations` tool**: Removed `done` and `all` status options
  - Now only supports `pending` (default) and `in-review` status
  - Archive is write-only from AI perspective - focuses AI on active work only
- **HTTP API**: Still supports archive access via `status=done` or `status=all` for potential UI needs
- Archive file renamed from `archive.json` to `annotations_archive.json` for clarity

### Technical
- PUT `/api/annotations/:id` now automatically archives when status changes to 'done'
- GET `/api/annotations` can optionally include archived annotations for UI purposes
- Simplified MCP tool filtering to only show actionable annotations

## [0.2.3] - 2025-12-02

### Changed
- **BREAKING**: Simplified status filtering to match actual JSON values
  - **Annotations**: Removed abstract `active` status. Use actual values: `pending` (new default), `in-review`, `done`, or `all`
  - **Bug Reports**: Added `debugging` and `in-review` to status enum. Use actual values: `active` (default), `debugging`, `in-review`, `resolved`, or `all`
  - Both systems now use exact status matching - no more grouping or special logic
  - More intuitive: filter values match stored values exactly

## [0.2.2] - 2025-12-02

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
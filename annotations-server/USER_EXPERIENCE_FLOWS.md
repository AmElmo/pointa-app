# Pointa Server - User Experience Flows

This document covers all user experience flows and edge cases for the Pointa MCP server.

## Setup Flows

### Flow 1: Fresh User - Cursor Auto-Start (Recommended)

**Steps:**
1. User installs Pointa Chrome extension
2. User adds config to Cursor's mcp.json:
   ```json
   {
     "pointa": {
       "command": "npx",
       "args": ["-y", "pointa-server"]
     }
   }
   ```
3. User restarts Cursor

**What happens:**
- Cursor spawns: `npx -y pointa-server` (downloads package first time, ~5-10 seconds)
- CLI detects no arguments → runs stdio bridge mode
- Bridge checks port 4242 → not found
- Bridge starts daemon in background on port 4242
- Bridge forwards stdio ↔ HTTP to daemon
- Cursor connects successfully ✅
- Chrome extension connects to daemon on port 4242 ✅

**User sees:**
- Cursor: MCP tools available (read_annotations, etc.)
- Chrome extension: "Server online" indicator
- Everything just works!

---

### Flow 2: Fresh User - Manual Start

**Steps:**
1. User installs Pointa Chrome extension
2. User runs: `npx pointa-server start`
3. User adds URL config to Cursor

**What happens:**
- Command downloads pointa-server (first time)
- Daemon starts on port 4242
- Chrome extension connects ✅
- User manually adds Cursor config
- Cursor connects via HTTP ✅

---

## Daily Usage Flows

### Flow 3: Normal Day - Auto-Start Already Configured

**Morning:**
- User opens Cursor
- Cursor spawns CLI → spawns stdio process
- CLI checks port 4242 → daemon already running from yesterday
- Stdio process starts (reads/writes same files as daemon) ✅
- No duplicate HTTP server, shared data ✅

**During work:**
- User uses Cursor → Stdio MCP works ✅
- User browses web → Chrome extension (HTTP) works ✅
- Both share same data files (annotations.json)

**Evening:**
- User closes Cursor
- Stdio process dies (attached to Cursor)
- HTTP daemon keeps running (for Chrome extension) ✅

---

### Flow 4: Multiple Cursor Windows

**User opens 2+ Cursor windows:**

**Window 1:**
- CLI spawns
- Checks port 4242 → not running
- Starts HTTP daemon on port 4242 ✅
- Spawns stdio process for window 1

**Window 2 (opened after):**
- CLI spawns again
- Checks port 4242 → already running ✅
- Skips daemon start
- Spawns stdio process for window 2
- Both stdio processes read/write same files ✅

**No port conflicts!** Only one HTTP daemon, multiple stdio processes.

---

## Edge Case Flows

### Edge Case 1: Daemon Crashes While Cursor is Open

**Scenario:**
- HTTP daemon crashes (OOM, bug, etc.)
- Stdio process is still running (for MCP)
- Chrome extension can't connect

**What happens:**
- **Cursor MCP still works!** ✅ (stdio process independent)
- Chrome extension shows "offline" ❌

**Recovery for Chrome extension:**
- User runs: `npx pointa-server start`
- Or closes/reopens Cursor (auto-restarts daemon)
- Everything works again

**Important:** Daemon crash doesn't affect Cursor MCP!

**Alternative manual recovery:**
```bash
npx pointa-server restart
```

---

### Edge Case 2: User Manually Starts Daemon, Then Opens Cursor

**Steps:**
1. User runs: `npx pointa-server start`
2. HTTP daemon starts on port 4242
3. User opens Cursor
4. Cursor spawns CLI → spawns stdio process

**What happens:**
- CLI checks port 4242 → found! ✅
- CLI skips daemon start
- CLI spawns stdio process
- Both HTTP and stdio work together ✅
- No duplicate HTTP server

---

### Edge Case 3: Daemon Running, User Runs Manual Start Again

**Steps:**
1. Daemon running on port 4242
2. User runs: `npx pointa-server start`

**What happens:**
```
✓ Server is already running
  Port: 4242
  PID: 12345
```

No-op, helpful message ✅

---

### Edge Case 4: Port 4242 Taken by Another Process

**Scenario:**
- Another app is using port 4242
- User opens Cursor
- CLI tries to start daemon

**What happens:**
- HTTP daemon fails to bind port 4242
- Error logged to ~/.pointa/server.log
- CLI times out waiting for daemon
- **Cursor shows MCP connection failed** ✅

**BUT:** If you only use Cursor MCP (not Chrome extension), you could skip HTTP entirely in the future.

**User action:**
1. Check what's using port: `lsof -i :4242`
2. Change the port (future enhancement) or stop conflicting app
3. Restart Cursor

---

### Edge Case 5: Chrome Extension Can't Connect

**Scenario:**
- Chrome extension shows "Server offline"
- But user has Cursor open with auto-start

**Diagnosis:**
```bash
npx pointa-server status
```

**If daemon running:**
```
✅ Server is running
   PID: 12345
   Port: 4242
   URL: http://127.0.0.1:4242/sse
```
→ Extension bug or network issue

**If daemon not running:**
```
○ Server is not running
```
→ Bridge failed to start daemon

**Fix:**
```bash
npx pointa-server start
```

---

### Edge Case 6: NPX Download Fails (No Internet)

**Scenario:**
- User has no internet
- First time setup
- Cursor tries to run: `npx -y pointa-server`

**What happens:**
- NPX fails to download package
- Cursor shows error: "Failed to start MCP server"
- Clear error message ✅

**Fix:**
- Connect to internet
- Restart Cursor
- NPX downloads successfully

---

### Edge Case 7: Stale PID File

**Scenario:**
- Daemon was killed forcefully (kill -9)
- PID file exists but process is dead
- User tries to check status

**What happens:**
```bash
npx pointa-server status
```

**Output:**
```
○ Server is not running
```

**Why it works:**
- `isServerRunning()` checks if PID exists
- If process is dead, cleans up stale PID file ✅
- No false positives

---

### Edge Case 8: Concurrent Writes to annotations.json

**Scenario:**
- Chrome extension writes annotation
- MCP reads annotations at same moment
- Potential race condition

**Current behavior:**
- Both read/write to same file
- File system provides atomic writes
- Last write wins

**No corruption** due to:
- JSON is written atomically (writeFile)
- Reads get consistent snapshot
- No partial writes

**Future enhancement:** File locking if issues arise

---

### Edge Case 9: User Deletes ~/.pointa Directory

**Scenario:**
- User deletes ~/.pointa while server running
- Daemon tries to write annotations

**What happens:**
- Write fails
- Server creates ~/.pointa directory automatically ✅
- Writes succeed
- Data lost (expected behavior)

---

### Edge Case 10: Stdio Process Killed

**Scenario:**
- Stdio process is killed (not HTTP daemon)
- Cursor still open

**What happens:**
- Cursor detects MCP connection lost
- Shows "MCP server disconnected"
- HTTP daemon keeps running (for Chrome extension) ✅

**Recovery:**
- Cursor restarts MCP connection
- Spawns new stdio process
- Both read/write same files ✅

---

## Comparison: Old vs New Setup

### Old Setup (HTTP URL only)

**Setup:**
```bash
npm install -g pointa-server
pointa-server start
```

Then add URL to mcp.json

**Issues:**
- Manual installation required
- Manual start required
- If daemon crashes: silent failure in Cursor ❌
- No automatic recovery
- User must check "is server running?" manually

**Pros:**
- Simple architecture
- One process

---

### New Setup (Auto-Start with Stdio)

**Setup:**
```json
{
  "command": "npx",
  "args": ["-y", "pointa-server"]
}
```

**Benefits:**
- ✅ No installation (npx handles it)
- ✅ Auto-starts daemon
- ✅ Errors visible in Cursor
- ✅ Auto-recovery (reopen Cursor)
- ✅ Works with Chrome extension
- ✅ Multiple Cursor windows supported
- ✅ Uses official MCP SDK (StdioServerTransport)
- ✅ Standard, well-supported approach

**Tradeoffs:**
- Two processes (stdio + HTTP daemon)
- Slightly more complex architecture
- Both processes access same files (needs file system atomicity)

---

## Process Architecture

```
┌─────────────────────────────────────────┐
│  Cursor Window                          │
│                                         │
│  Spawns: npx pointa-server              │
└────────┬────────────────────────────────┘
         │
         │ 1. Checks if HTTP daemon running
         │ 2. Starts daemon if needed
         │ 3. Spawns stdio process
         │
    ┌────▼────────────────────────────────┐
    │  Stdio Process (MCP for Cursor)     │
    │  node server.js (STDIO mode)        │
    │                                     │
    │  • StdioServerTransport             │
    │  • Reads from stdin                 │
    │  • Writes to stdout                 │
    │  • Official MCP SDK ✅              │
    └─────────────────────────────────────┘
             │
             │ Both read/write same files
             │
    ┌────────▼────────────────────────────┐
    │  HTTP Daemon Process (background)   │
    │  node server.js (HTTP mode)         │
    │                                     │
    │  • HTTP server on :4242             │
    │  • /api/annotations endpoint        │
    │  • Serves Chrome extension          │
    │  • Persistent, stays running        │
    └────────┬────────────────────────────┘
             │
             │ Both share data
             ▼
    ┌─────────────────────────────────────┐
    │  ~/.pointa/                         │
    │                                     │
    │  • annotations.json                 │
    │  • bug_reports.json                 │
    │  • inspirations.json                │
    │  • images/                          │
    │  • server.log                       │
    └─────────────────────────────────────┘
             ▲
             │ HTTP :4242/api
    ┌────────┴────────────────────────────┐
    │  Chrome Extension                   │
    └─────────────────────────────────────┘
```

**Key points:**
- **Two separate processes:** Stdio (for Cursor MCP) + HTTP Daemon (for Chrome extension)
- **Both use official MCP SDK:** No custom protocol hacks ✅
- **Shared data files:** Both read/write same JSON files
- **Clean separation:** Stdio dies with Cursor, daemon persists

---

## Log Files

**Location:** `~/.pointa/server.log`

**What's logged:**
- Daemon startup/shutdown
- API requests (Chrome extension)
- MCP tool calls
- Errors and warnings

**View logs:**
```bash
npx pointa-server logs

# Follow in real-time
npx pointa-server logs -f
```

---

## Troubleshooting Guide

### "MCP server failed to start"

**Check:**
1. `npx pointa-server status` - is daemon running?
2. `npx pointa-server logs` - any errors?
3. `lsof -i :4242` - port conflict?

**Fix:**
```bash
npx pointa-server restart
```

---

### Chrome Extension Shows "Offline"

**Check:**
```bash
npx pointa-server status
```

**If not running:**
```bash
npx pointa-server start
```

**If running but still offline:**
- Check browser console for errors
- Try: `curl http://127.0.0.1:4242/health`
- Restart daemon: `npx pointa-server restart`

---

### Multiple Cursor Windows Not Sharing Data

**This should never happen!** All windows connect to same daemon.

**If it does:**
1. Close all Cursor windows
2. `npx pointa-server restart`
3. Reopen Cursor

---

## Summary

**The new auto-start approach provides:**

✅ **Zero-friction setup** - No installation, just add config
✅ **Visible errors** - Cursor shows if MCP fails
✅ **Auto-recovery** - Reopen Cursor to fix issues
✅ **Persistent daemon** - Chrome extension works independently
✅ **Shared state** - All clients see same data
✅ **No port conflicts** - Multiple Cursor windows work
✅ **Better UX** - "Set and forget" experience

**While maintaining:**
- Manual control option (start/stop/restart commands)
- Simple architecture (just adds lightweight bridge)
- Backward compatibility (URL config still works)


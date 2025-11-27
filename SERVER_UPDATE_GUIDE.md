# 🔄 How to Update & Restart Pointa Annotation Server

## Current Setup
- **Server Location:** `/annotations-server/` (local monorepo folder)
- **Server Package:** `pointa-server` v0.1.9
- **Server Port:** `http://127.0.0.1:4242`
- **Changes Made:** None to server code (all changes in extension)

## Quick Update Guide

### Step 1: Check if Server is Running
```bash
# Check for running server process
lsof -i :4242
# OR
ps aux | grep "pointa-server\|node.*server.js" | grep -v grep
```

### Step 2: Stop Running Server
```bash
# If server is running, stop it:
pkill -f pointa-server
# OR manually stop it in the terminal where it's running (Ctrl+C)
```

### Step 3: Choose Your Update Method

#### Method A: Running from Local Monorepo (Recommended for Development)
```bash
cd /Users/julienberthomier/Code/amelmo/pointa/pointa-app/annotations-server

# Install dependencies (if not already installed)
npm install

# Start server
npm start

# OR use dev mode with auto-restart on file changes
npm run dev
```

#### Method B: Install/Update Globally
```bash
cd /Users/julienberthomier/Code/amelmo/pointa/pointa-app/annotations-server

# Link local version globally
npm link

# Now you can run from anywhere:
pointa-server start
```

#### Method C: Use npx (Always Latest from npm)
```bash
# This downloads and runs the latest published version
npx pointa-server start
```

## Verify Server is Running

### 1. Check Process
```bash
lsof -i :4242
# Should show node process listening on port 4242
```

### 2. Check in Browser
Open: http://127.0.0.1:4242/health

Should return:
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

### 3. Check Extension Connection
1. Open DevTools (F12) on any localhost page
2. Look for:
```
[BG_MONITOR_START] Starting API connection monitoring
[BG_MONITOR_STARTUP] Initial connection check complete
```

## What Changed & What Needs Updating

### ✅ Extension Changes (Requires Reload)
- **Background Script:** Option D + race condition protection
- **Content Script:** Enhanced logging + draft handling
- **Action Required:** Reload extension at `chrome://extensions/`

### ⏭️ Server Changes (None - No Update Needed)
- No changes to `annotations-server/lib/server.js`
- Current running server is fine
- **Action Required:** None (unless server isn't running)

## Troubleshooting

### Server Won't Start - Port in Use
```bash
# Find what's using port 4242
lsof -i :4242

# Kill the process (replace PID with actual process ID)
kill -9 <PID>

# Or kill all node processes (⚠️ use with caution)
pkill -9 node
```

### Extension Can't Connect to Server
1. Check server is running: `lsof -i :4242`
2. Check server health: `curl http://127.0.0.1:4242/health`
3. Check extension logs for `[BG_MONITOR_CONNECTION_CHANGE]`
4. Reload extension at `chrome://extensions/`

### Server Running but Extension Shows Offline
1. Open extension popup
2. Check connection status indicator
3. Open DevTools console and look for:
```
[BG_MONITOR_CONNECTION_CHANGE] Connection status changed: offline → online
```

## Recommended Workflow for Active Development

### Terminal 1: Run Server in Dev Mode
```bash
cd /Users/julienberthomier/Code/amelmo/pointa/pointa-app/annotations-server
npm run dev  # Auto-restarts on file changes
```

### Terminal 2: Your Development Work
```bash
cd /Users/julienberthomier/Code/amelmo/pointa/pointa-app
# Work on extension code, etc.
```

### When to Reload What

| You Changed... | Reload Extension | Restart Server |
|----------------|------------------|----------------|
| Extension files (`extension/`) | ✅ Yes | ❌ No |
| Server files (`annotations-server/lib/`) | ❌ No | ✅ Yes |
| Content script CSS | ✅ Yes + refresh page | ❌ No |
| JSON data files (`~/.pointa/`) | ❌ No | ❌ No |

## Current Status Check

Run these commands to check your current setup:

```bash
# 1. Check server process
lsof -i :4242

# 2. Check server version (if globally installed)
pointa-server --version

# 3. Check local package version
cd /Users/julienberthomier/Code/amelmo/pointa/pointa-app/annotations-server
node -p "require('./package.json').version"

# 4. Test server health
curl http://127.0.0.1:4242/health

# 5. Check annotation data
ls -la ~/.pointa/
```

## Summary for Your Current Situation

**Good News:** The annotation server code hasn't changed! All the fixes were in the extension's background and content scripts.

**What You Need to Do:**
1. ✅ **Reload extension** at `chrome://extensions/` (CRITICAL)
2. ⚠️ **Check server is running** with `lsof -i :4242`
3. ❌ **Don't need to update server code** (no changes)

**If server isn't running:**
```bash
cd /Users/julienberthomier/Code/amelmo/pointa/pointa-app/annotations-server
npm start
```

That's it! The race condition fix is entirely in the extension's background script.




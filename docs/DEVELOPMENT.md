# Development Guide

## Extension Development

### Initial Setup

1. **Load the Extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **"Load unpacked"**
   - Select the `/extension` directory from this repository
   - The extension should now appear in your extensions list

2. **Verify Installation:**
   - You should see "Pointa" in your extensions list
   - Click the extension icon in the Chrome toolbar to open the popup
   - The extension should work on localhost URLs (e.g., `http://localhost:3000`)

### Real-Time Testing Workflow

Chrome automatically reloads certain extension files when you make changes, but here's how to test different parts:

#### **Popup Changes** (popup.html, popup.js, popup.css)
- Make your changes to the files
- **Reload the extension:**
  - Go to `chrome://extensions/`
  - Find "Pointa" and click the **refresh/reload icon** 🔄
- **Reopen the popup** to see your changes

#### **Content Script Changes** (content.js, content.css)
- Make your changes to the files
- **Reload the extension:**
  - Go to `chrome://extensions/`
  - Find "Pointa" and click the **refresh/reload icon** 🔄
- **Refresh the page** where the extension is active (e.g., `http://localhost:3000`)
- The new content scripts will load automatically

#### **Background Script Changes** (background.js)
- Make your changes to the file
- **Reload the extension:**
  - Go to `chrome://extensions/`
  - Find "Pointa" and click the **refresh/reload icon** 🔄
- The background service worker will restart automatically

#### **Manifest Changes** (manifest.json)
- Make your changes to the file
- **Reload the extension:**
  - Go to `chrome://extensions/`
  - Find "Pointa" and click the **refresh/reload icon** 🔄
- You may need to refresh any pages where the extension is active

### Quick Reload Shortcut

For faster iteration, you can:
1. Keep `chrome://extensions/` open in a separate tab
2. Use the refresh button on the extension card after each change
3. Keep your test page open and refresh it when testing content scripts

### Debugging

#### **View Console Logs:**
- **Popup:** Right-click the extension icon → "Inspect popup" (or click the "service worker" link for background)
- **Content Script:** Open DevTools on your test page (F12) → Console tab
- **Background Script:** Go to `chrome://extensions/` → Find "Pointa" → Click "service worker" link

#### **Check Extension Errors:**
- Go to `chrome://extensions/`
- Look for any error messages in red on the extension card

### Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup opens and displays correctly
- [ ] Content scripts work on localhost pages
- [ ] Background script functions properly
- [ ] No console errors in DevTools

## Local Server Development  

```bash
cd annotations-server
npm install
npm run dev  # Runs with auto-restart on file changes
```

The server will run on `http://127.0.0.1:4242` by default.

## Testing

Test on common localhost setups:
- React: localhost:3000
- Vite: localhost:5173  
- Next.js: localhost:3000
- Vue: localhost:8080

### Full Testing Setup

1. **Start the server:**
   ```bash
   cd annotations-server
   npm run dev
   ```

2. **Load the extension** (see Extension Development section above)

3. **Open a test page** (e.g., `http://localhost:3000`)

4. **Test the extension:**
   - Click the extension icon to open popup
   - Click elements on the page to create annotations
   - Verify annotations are saved and displayed
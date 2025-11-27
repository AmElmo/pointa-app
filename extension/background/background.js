// Pointa Background Service Worker

// Note: FileStorageManager is NOT imported here because:
// - File System Access API is only available in window contexts (not service workers)
// - Background service worker only communicates with API server
// - All file operations are handled by the API server, not directly in the service worker
// importScripts('file-storage.js');

class PointaBackground {
  constructor() {
    this.apiServerUrl = 'http://127.0.0.1:4242'; // Port 4242 - the answer to life, the universe, and everything
    this.apiConnected = false;
    // Note: FileStorageManager is NOT used in service worker context
    // File System Access API is only available in window contexts
    // All file operations go through the API server instead
    // this.fileStorage = new FileStorageManager();
    this.viewportOverrides = new Map(); // Track viewport overrides for responsive capture

    // 🎯 NO LOCAL STORAGE: Extension uses API server as single source of truth
    // This eliminates all race conditions and data loss issues from sync operations

    this.init();
  }

  init() {

    // Set up event listeners
    this.setupInstallListener();
    this.setupMessageListener();
    this.setupTabListener();
    this.setupStorageListener();
    this.setupActionClickListener();

    // Sync bug reports from API server on startup
    this.syncBugReportsFromAPI().catch((err) => {

    });

    // Update all badges immediately on startup by fetching from API
    this.updateAllBadges().catch((err) => {
      console.error('Error updating badges on startup:', err);
    });

    // Check API connection status periodically (health check only)
    this.startAPIHealthCheck();
  }

  setupInstallListener() {
    chrome.runtime.onInstalled.addListener((details) => {

      if (details.reason === 'install') {
        this.handleFirstInstall();
      } else if (details.reason === 'update') {
        this.handleUpdate(details.previousVersion);
      }
    });
  }

  async handleFirstInstall() {

    // Initialize settings (no local annotations - API is single source of truth)
    try {
      await chrome.storage.local.set({
        onboardingCompleted: false, // Ensure onboarding shows on first install
        settings: {
          version: '0.1.0',
          firstInstall: Date.now(),
          apiEnabled: false
        }
      });



    } catch (error) {
      console.error('Error setting up initial storage:', error);
    }
  }

  async handleUpdate(previousVersion) {

    // Handle any migration logic here
    try {
      const currentVersion = chrome.runtime.getManifest().version;

      // Store update info for popup to display
      await chrome.storage.local.set({
        updateInfo: {
          hasUpdate: true,
          previousVersion,
          currentVersion,
          timestamp: Date.now(),
          changelog: this.getChangelogForVersion(currentVersion)
        }
      });

      // Set badge to notify user
      chrome.action.setBadgeText({ text: 'NEW' });
      chrome.action.setBadgeBackgroundColor({ color: '#0c8ce9' }); // Theme blue

      // Also update settings
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};

      settings.lastUpdate = Date.now();
      settings.previousVersion = previousVersion;

      await chrome.storage.local.set({ settings });

    } catch (error) {
      console.error('Error during update migration:', error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

      switch (request.action) {
        case 'getAnnotations':
          this.getAnnotations(request.url, request.limit).
          then((annotations) => sendResponse({ success: true, annotations })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'saveAnnotation':
          this.saveAnnotation(request.annotation).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'deleteAnnotation':
          this.deleteAnnotation(request.id).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'updateAnnotation':
          this.updateAnnotation(request.id, request.updates).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'exportAnnotations':
          this.exportAnnotations(request.format).
          then((data) => sendResponse({ success: true, data })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'checkMCPStatus':
          this.checkAPIConnectionStatus().
          then((status) => sendResponse({ success: true, status })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'openPopupWithFocus':
          this.openPopupWithFocus(request.annotationId).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'forceMCPSync':
          this.forceAPISync().
          then((result) => sendResponse({ success: true, ...result })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'checkOnboardingServerHealth':
          // Special case for onboarding: allows health check from any page
          // Background scripts have permission to access local network regardless of page context
          this.checkOnboardingServerHealth().
          then((result) => sendResponse({ success: true, ...result })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'captureScreenshot':
          this.captureScreenshot(sender.tab.id).
          then((dataUrl) => sendResponse({ success: true, dataUrl })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'getBugReports':
          this.getBugReports(request.status, request.url).
          then((bugReports) => sendResponse({ success: true, bugReports })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'getScreenshot':
          this.getScreenshot(request.screenshotId).
          then((dataUrl) => sendResponse({ success: true, dataUrl })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'saveBugReport':
          this.saveBugReport(request.bugReport, request.screenshotDataUrl).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'updateBugReport':
          this.updateBugReport(request.bugReport, request.screenshotDataUrl).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'deleteBugReport':
          this.deleteBugReport(request.id).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'savePerformanceReport':
          this.savePerformanceReport(request.perfReport, request.screenshotDataUrl).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'getInspirations':
          this.getInspirations(request.domain).
          then((inspirations) => sendResponse({ success: true, inspirations })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'saveInspiration':
          this.saveInspiration(request.inspiration, request.screenshotDataUrl, request.hoverScreenshotDataUrl, request.responsiveScreenshots).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'deleteInspiration':
          this.deleteInspiration(request.id).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'getInspirationScreenshot':
          this.getInspirationScreenshot(request.filename).
          then((dataUrl) => sendResponse({ success: true, dataUrl })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        // Feature 5: Viewport control for responsive capture
        case 'setViewport':
          this.setViewport(sender.tab.id, request.width, request.height).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'resetViewport':
          this.resetViewport(sender.tab.id).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        case 'syncAnnotationsOnDemand':
          // On-demand sync triggered by page navigation (Option D)
          // No longer needed - API is single source of truth, annotations are fetched directly
          // Keeping for backward compatibility but just return success
          sendResponse({ success: true, annotationsChanged: false });
          break;

        case 'ensureContentScriptsInjected':
          this.ensureContentScriptsInjected(request.tabId).
          then(() => sendResponse({ success: true })).
          catch((error) => sendResponse({ success: false, error: error.message }));
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }

      return true; // Keep the message channel open for async response
    });
  }

  setupTabListener() {
    // Update badge when switching tabs
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (this.isLocalhostUrl(tab.url)) {
          await this.updateBadge(tab.id, tab.url);
        } else {
          await this.clearBadge(tab.id);
        }
      } catch (error) {
        console.error('Error updating badge on tab activation:', error);
      }
    });

    // Update badge AND re-inject content scripts when URL changes
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        if (this.isLocalhostUrl(tab.url)) {
          // Re-inject content scripts when navigating to a localhost page
          // This ensures the extension works after full page reloads (e.g., from dropdown navigation)
          try {
            await this.ensureContentScriptsInjected(tabId);
          } catch (error) {
            console.error('Error re-injecting content scripts on navigation:', error);
          }
          
          await this.updateBadge(tabId, tab.url);
        } else {
          await this.clearBadge(tabId);
        }
      }
    });
  }

  setupStorageListener() {


    // No longer needed - we don't use local storage for annotations
    // Keeping method for potential future use with other settings
  }setupActionClickListener() {
    // Handle extension icon click to toggle sidebar or show onboarding
    chrome.action.onClicked.addListener(async (tab) => {
      try {
        // Skip chrome:// and chrome-extension:// pages
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          return;
        }

        // Inject content scripts if not already injected
        await this.ensureContentScriptsInjected(tab.id);

        // Small delay to ensure scripts are loaded
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Check if we should show onboarding (first time use)
        const result = await chrome.storage.local.get(['onboardingCompleted']);

        // Check if on localhost/local development URL
        const isLocalhost = this.isLocalhostUrl(tab.url);

        if (!result.onboardingCompleted && isLocalhost) {
          // First time on localhost - show onboarding
          await chrome.tabs.sendMessage(tab.id, { action: 'showOnboarding' });
        } else {
          // Normal use - toggle sidebar
          await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
        }
      } catch (error) {
        console.error('Error handling extension click:', error);
        // If content script not loaded, try to inject it
        try {
          await this.ensureContentScriptsInjected(tab.id);
          await new Promise((resolve) => setTimeout(resolve, 200));
          await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
        } catch (injectError) {
          console.error('Error injecting content scripts:', injectError);
        }
      }
    });
  }

  /**
   * Ensure content scripts are injected into the tab
   * Only injects if not already present (checks for window.pointa)
   */
  async ensureContentScriptsInjected(tabId) {
    try {
      // Check if scripts are already injected by checking for window.pointa
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => typeof window.pointa !== 'undefined'
      });

      // If already injected, return early
      if (results && results[0] && results[0].result === true) {
        return;
      }

      // Inject CSS first
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content/content.css']
      });

      // Inject all JavaScript modules in order
      const scriptFiles = [
      'content/modules/utils.js',
      'content/modules/theme-manager.js',
      'content/modules/selector-generator.js',
      'content/modules/element-finder.js',
      'content/modules/context-analyzer.js',
      'content/modules/badge-manager.js',
      'content/modules/image-uploader.js',
      'content/modules/annotation-mode.js',
      'content/modules/inspiration-mode.js',
      'content/modules/annotation-factory.js',
      'content/modules/design-mode.js',
      'content/modules/design-editor-ui.js',
      'content/modules/onboarding-overlay.js',
      'content/modules/bug-recorder.js',
      'content/modules/bug-report-ui.js',
      'content/modules/bug-replay-engine.js',
      'content/modules/performance-recorder.js',
      'content/modules/performance-report-ui.js',
      'content/modules/sidebar-ui.js',
      'content/content.js'];


      // Inject scripts sequentially to maintain order
      for (const file of scriptFiles) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [file]
          });
        } catch (scriptError) {
          // Some pages (like chrome://) may block injection - that's okay
          console.warn(`Could not inject ${file}:`, scriptError.message);
        }
      }
    } catch (error) {
      // Some pages (like chrome://, chrome-extension://) cannot have scripts injected
      // This is expected and not an error
      if (!error.message.includes('Cannot access') && !error.message.includes('chrome://')) {
        console.error('Error injecting content scripts:', error);
      }
      throw error;
    }
  }

  // 🗑️ REMOVED: onAnnotationsChanged() - No longer needed without local storage sync
  // 🗑️ REMOVED: syncAnnotationsToAPI() - No longer needed without local storage sync

  // Helper to get URL without hash
  getUrlWithoutHash(url) {
    try {
      const urlObj = new URL(url);
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return url.split('#')[0];
    }
  }

  // 🗑️ REMOVED: Old getAnnotations() with local storage fallback - see new API-only version below
  // 🗑️ REMOVED: queueStorageOperation() - No longer needed without local storage

  async saveAnnotation(annotation) {
    const saveStartTime = Date.now();






    try {
      // Save directly to API server (single source of truth)
      await this.saveAnnotationToAPI(annotation);

      // Update badge for this URL
      await this.updateBadgeForUrl(annotation.url);

      const saveEndTime = Date.now();





    } catch (error) {
      console.error(`[BG_SAVE_ERROR] Save failed:`, {
        annotationId: annotation.id,
        duration: `${Date.now() - saveStartTime}ms`,
        error: error.message
      });
      throw error;
    }
  }

  async saveAnnotationToAPI(annotation) {
    const apiStartTime = Date.now();




    const response = await fetch(`${this.apiServerUrl}/api/annotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(annotation)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'API save failed');
    }


  }

  async deleteAnnotation(id) {
    const deleteStartTime = Date.now();


    try {
      // Delete directly from API (single source of truth)
      await this.deleteAnnotationFromAPI(id);

      // Update all badges
      await this.updateAllBadges();



    } catch (error) {
      console.error(`[BG_DELETE_ERROR] Delete failed:`, {
        annotationId: id,
        duration: `${Date.now() - deleteStartTime}ms`,
        error: error.message
      });
      throw error;
    }
  }

  async deleteAnnotationFromAPI(id) {
    const response = await fetch(`${this.apiServerUrl}/api/annotations/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API delete error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Delete failed');
    }
  }

  async updateAnnotation(id, updates) {
    const updateStartTime = Date.now();





    try {
      // Update in API (single source of truth)
      // The API will handle fetching, merging, and saving
      await this.updateAnnotationInAPI(id, updates);

      // Update all badges to reflect the change
      await this.updateAllBadges();



    } catch (error) {
      console.error(`[BG_UPDATE_ERROR] Update failed:`, {
        annotationId: id,
        duration: `${Date.now() - updateStartTime}ms`,
        error: error.message
      });
      throw error;
    }
  }

  async updateAnnotationInAPI(id, annotation) {
    const response = await fetch(`${this.apiServerUrl}/api/annotations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(annotation)
    });

    if (!response.ok) {
      throw new Error(`API update error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Update failed');
    }
  }

  async getAnnotations(url = null, limit = 50) {
    // Fetch annotations directly from API (single source of truth)
    try {
      // OPTIMIZATION: Pass URL and limit to API to filter server-side
      let apiUrl = `${this.apiServerUrl}/api/annotations`;
      const params = new URLSearchParams();

      if (url) {
        params.append('url', url);
      }
      if (limit) {
        params.append('limit', limit.toString());
      }

      if (params.toString()) {
        apiUrl += `?${params.toString()}`;
      }

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      const annotations = result.annotations || [];

      // Get unique URLs in response for debugging
      const uniqueUrls = [...new Set(annotations.map((a) => a.url))];










      // API already filters by URL, but double-check for safety
      if (url && annotations.length > 0) {
        const urlWithoutHash = this.getUrlWithoutHash(url);
        const filtered = annotations.filter((annotation) => {
          const annotationUrlWithoutHash = this.getUrlWithoutHash(annotation.url);
          const matches = annotationUrlWithoutHash === urlWithoutHash;

          if (!matches) {
            console.warn('[BG_GET_ANNOTATIONS] URL mismatch:', {
              requested: urlWithoutHash,
              annotation: annotationUrlWithoutHash,
              annotationId: annotation.id
            });
          }

          return matches;
        });

        if (filtered.length !== annotations.length) {
          console.warn('[BG_GET_ANNOTATIONS] Filter removed annotations:', {
            before: annotations.length,
            after: filtered.length
          });
        }

        return filtered;
      }

      return annotations;
    } catch (error) {
      console.error('[BG_GET_ANNOTATIONS_ERROR] Failed to fetch annotations:', error);
      return []; // Return empty array on error (graceful degradation)
    }
  }

  async exportAnnotations(format = 'json') {
    try {
      const annotations = await this.getAnnotations();

      switch (format) {
        case 'json':
          return JSON.stringify(annotations, null, 2);

        case 'csv':
          return this.annotationsToCSV(annotations);

        case 'mcp':
          return this.annotationsToMCP(annotations);

        default:
          throw new Error('Unsupported export format');
      }
    } catch (error) {
      console.error('Error exporting annotations:', error);
      throw error;
    }
  }

  annotationsToCSV(annotations) {
    const headers = ['ID', 'URL', 'Comment', 'Status', 'Element', 'Created', 'Updated'];
    const rows = annotations.map((annotation) => [
    annotation.id,
    annotation.url,
    `"${(annotation.comment || annotation.changes_summary || '').replace(/"/g, '""')}"`,
    annotation.status,
    annotation.selector,
    annotation.created_at,
    annotation.updated_at]
    );

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  annotationsToMCP(annotations) {
    // Format for MCP server consumption
    return {
      version: '1.0',
      exported_at: new Date().toISOString(),
      total_annotations: annotations.length,
      annotations: annotations.map((annotation) => ({
        ...annotation,
        // Add any MCP-specific formatting here
        mcp_ready: true
      }))
    };
  }

  async updateBadge(tabId, url) {
    // Delegate to API-based badge update
    return this.updateBadgeFromAPI(tabId, url);
  }

  async updateBadgeFromAPI(tabId, url) {
    try {
      // Fetch annotations from API (single source of truth)
      const annotations = await this.getAnnotations(url);

      const activeCount = annotations.filter((a) =>
      a.status === 'pending' || a.status === 'in-review' || !a.status
      ).length;

      if (activeCount > 0) {
        await chrome.action.setBadgeText({
          tabId: tabId,
          text: activeCount.toString()
        });

        // Set badge color based on server status
        const badgeColor = this.apiConnected ? '#10b981' : '#FF7A00';
        await chrome.action.setBadgeBackgroundColor({
          tabId: tabId,
          color: badgeColor
        });

        await chrome.action.setTitle({
          tabId: tabId,
          title: `Pointa - ${activeCount} active annotation${activeCount === 1 ? '' : 's'}`
        });
      } else {
        await this.clearBadge(tabId);
      }
    } catch (error) {
      console.error('Error updating badge from API:', error);
    }
  }

  async clearBadge(tabId) {
    try {
      await chrome.action.setBadgeText({ tabId: tabId, text: '' });
      await chrome.action.setTitle({
        tabId: tabId,
        title: 'Pointa'
      });
    } catch (error) {
      console.error('Error clearing badge:', error);
    }
  }

  async updateBadgeForUrl(url) {
    try {
      const tabs = await chrome.tabs.query({ url: url });
      for (const tab of tabs) {
        await this.updateBadgeFromAPI(tab.id, url);
      }
    } catch (error) {
      console.error('Error updating badge for URL:', url, error);
    }
  }

  async updateAllBadges() {
    try {
      const tabs = await chrome.tabs.query({});
      const localhostTabs = tabs.filter((tab) => this.isLocalhostUrl(tab.url));

      for (const tab of localhostTabs) {
        await this.updateBadge(tab.id, tab.url);
      }
    } catch (error) {
      console.error('Error updating all badges:', error);
    }
  }

  async checkAPIConnectionStatus() {
    try {
      const response = await fetch(`${this.apiServerUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        this.apiConnected = true;

        // Check version compatibility
        const extensionVersion = chrome.runtime.getManifest().version;
        let versionCompatible = true;
        let compatibilityMessage = null;

        if (data.minExtensionVersion) {
          const extensionParts = extensionVersion.split('.').map(Number);
          const minParts = data.minExtensionVersion.split('.').map(Number);

          for (let i = 0; i < 3; i++) {
            if ((extensionParts[i] || 0) < (minParts[i] || 0)) {
              versionCompatible = false;
              compatibilityMessage = `Extension update required. Minimum version: ${data.minExtensionVersion}`;
              break;
            }
            if ((extensionParts[i] || 0) > (minParts[i] || 0)) {
              break;
            }
          }
        }

        return {
          connected: true,
          server_url: this.apiServerUrl,
          server_version: data.version,
          server_status: data.status,
          version_compatible: versionCompatible,
          compatibility_message: compatibilityMessage,
          last_check: new Date().toISOString()
        };
      } else {
        this.apiConnected = false;
        return {
          connected: false,
          server_url: this.apiServerUrl,
          error: `Server returned ${response.status}`,
          last_check: new Date().toISOString()
        };
      }
    } catch (error) {
      this.apiConnected = false;
      return {
        connected: false,
        server_url: this.apiServerUrl,
        error: error.message,
        last_check: new Date().toISOString()
      };
    }
  }

  startAPIHealthCheck() {
    // Simplified health check - no sync operations


    // Check connection immediately on startup
    this.checkAPIConnectionStatus().then(async () => {

      await this.updateAllBadges();
    });

    // Check connection every 30 seconds (health check only - no sync)
    setInterval(async () => {
      const wasConnected = this.apiConnected;
      await this.checkAPIConnectionStatus();

      // Update badge colors when connection status changes
      if (wasConnected !== this.apiConnected) {

        await this.updateAllBadges();
      }
    }, 30000); // Check every 30 seconds
  }

  // 🗑️ REMOVED: smartSyncAnnotations() - No longer needed, API is single source of truth


  isLocalhostUrl(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);

      // Check localhost URLs
      if (urlObj.hostname === 'localhost' ||
      urlObj.hostname === '127.0.0.1' ||
      urlObj.hostname === '0.0.0.0') {
        return true;
      }

      // Check .local, .test, .localhost development domains
      if (urlObj.hostname.endsWith('.local') ||
      urlObj.hostname.endsWith('.test') ||
      urlObj.hostname.endsWith('.localhost')) {
        return true;
      }

      // Check file URLs - only allow HTML files
      if (urlObj.protocol === 'file:') {
        const path = urlObj.pathname.toLowerCase();
        const htmlExtensions = ['.html', '.htm'];

        // Allow .html/.htm files or files with no extension
        return htmlExtensions.some((ext) => path.endsWith(ext)) ||
        !path.includes('.') || path.endsWith('/');
      }

      return false;
    } catch {
      return false;
    }
  }

  async openPopupWithFocus(annotationId) {
    try {
      // Since we can't programmatically open the popup in MV3,
      // we'll just store the focused annotation ID for when the popup is opened

      // The focusedAnnotationId is already stored by the content script
      // This method exists mainly for completeness and potential future use
      return true;
    } catch (error) {
      console.error('Error handling popup focus request:', error);
      throw error;
    }
  }

  async forceAPISync() {
    try {
      // No sync needed - API is single source of truth
      // Just refresh badges from API
      await this.updateAllBadges();

      const annotations = await this.getAnnotations();
      return {
        count: annotations.length,
        message: `Refreshed badges - ${annotations.length} annotations in API`
      };

    } catch (error) {
      console.error('Error in forced sync:', error);
      throw error;
    }
  }

  async checkOnboardingServerHealth() {
    /**
     * Special health check for onboarding flow
     * 
     * DESIGN DECISION: This bypasses the localhost-only restriction
     * 
     * WHY: During onboarding, users need to verify their local server is running
     * regardless of which page they're viewing. Background scripts have elevated
     * permissions and can access local network (127.0.0.1) from any page context.
     * 
     * SECURITY: This is safe because:
     * 1. Only checks server health (read-only, no data sent)
     * 2. Only connects to 127.0.0.1:4242 (local loopback, not accessible externally)
     * 3. Only used during onboarding setup flow
     * 4. Background scripts have proper permissions for local network access
     * 
     * Without this, onboarding would fail on non-localhost pages, forcing users
     * to navigate to localhost just to complete setup, which is poor UX.
     */
    try {
      const response = await fetch(`${this.apiServerUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        return {
          serverOnline: true,
          serverVersion: data.version,
          serverStatus: data.status
        };
      } else {
        return {
          serverOnline: false,
          error: `Server returned status ${response.status}`
        };
      }
    } catch (error) {
      return {
        serverOnline: false,
        error: error.message || 'Failed to connect to server'
      };
    }
  }

  async captureScreenshot(tabId) {
    try {
      // Check if this tab has viewport override active (Feature 5: Responsive Capture)
      if (this.viewportOverrides.has(tabId)) {


        // Capture full viewport - content script handles element cropping
        const captureParams = {
          format: 'png',
          captureBeyondViewport: false,
          fromSurface: true
        };

        // Use Chrome DevTools Protocol to capture screenshot
        const result = await chrome.debugger.sendCommand(
          { tabId },
          'Page.captureScreenshot',
          captureParams
        );

        // CDP returns base64 data, convert to data URL
        return 'data:image/png;base64,' + result.data;
      }

      // Normal capture for non-overridden viewports
      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png',
        quality: 90
      });
      return dataUrl;
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      throw error;
    }
  }

  async getBugReports(status = 'active', url = null) {
    try {
      let apiUrl = `${this.apiServerUrl}/api/bug-reports?status=${status}`;
      if (url) {
        apiUrl += `&url=${encodeURIComponent(url)}`;
      }

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`API server error: ${response.status}`);
      }

      const result = await response.json();
      return result.bug_reports || [];
    } catch (error) {
      console.error('[Background] Error getting bug reports from API:', error);
      // Service worker cannot directly access file storage - return empty array
      // File storage is only available through the API server
      return [];
    }
  }

  async syncBugReportsFromAPI() {
    try {

      const response = await fetch(`${this.apiServerUrl}/api/bug-reports?status=all`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {

        return;
      }

      const result = await response.json();
      const apiBugReports = result.bug_reports || [];

      // Note: In service worker context, we don't directly write to file storage
      // The API server handles all file operations
      // Background service worker just caches data in chrome.storage for performance


    } catch (error) {


    }
  }

  async saveBugReport(bugReport, screenshotDataUrl = null) {
    try {
      // Save screenshot to API server if provided
      if (screenshotDataUrl && bugReport.visual?.screenshot?.id) {

        const screenshotResult = await this.saveScreenshotToAPI(bugReport.visual.screenshot.id, screenshotDataUrl);

        // Update bug report with screenshot filename and absolute path
        if (screenshotResult.success) {

          bugReport.visual.screenshot = {
            id: screenshotResult.screenshotId,
            filename: screenshotResult.filename,
            path: screenshotResult.path,
            absolutePath: screenshotResult.absolutePath, // Add absolute path for AI agent
            captured: true,
            timestamp: bugReport.visual.screenshot.timestamp
          };
        } else {
          console.error('[Background] Screenshot save failed:', screenshotResult.error);
          bugReport.visual.screenshot.captured = false;
          bugReport.visual.screenshot.error = screenshotResult.error;
        }
      } else {

      }

      // Also save to API server first
      await this.saveBugReportToAPI(bugReport);

      // Then sync from API to ensure Chrome storage is up to date
      await this.syncBugReportsFromAPI();


    } catch (error) {
      console.error('Error saving bug report:', error);
      throw error;
    }
  }

  async saveScreenshotToAPI(screenshotId, dataUrl) {
    try {
      const response = await fetch(`${this.apiServerUrl}/api/bug-screenshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          screenshotId: screenshotId,
          dataUrl: dataUrl
        })
      });

      if (!response.ok) {
        throw new Error(`API server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save screenshot to API');
      }


      return result;

    } catch (error) {
      console.error('Failed to save screenshot to API server:', error.message);
      // Don't throw - bug report can still be saved without screenshot
      return { success: false, error: error.message };
    }
  }

  async getScreenshot(screenshotId) {
    // Screenshots are now stored on disk, not in browser storage
    // Return the path for the MCP server to access
    return {
      screenshotId: screenshotId,
      path: `~/.pointa/bug_screenshots/${screenshotId}.png`,
      message: 'Screenshot stored on disk in ~/.pointa/bug_screenshots/'
    };
  }

  async saveBugReportToAPI(bugReport) {
    try {
      const response = await fetch(`${this.apiServerUrl}/api/bug-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bugReport)
      });

      if (!response.ok) {
        throw new Error(`API server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save bug report to API');
      }


    } catch (error) {
      console.warn('Failed to save to API server, bug report saved locally:', error.message);
      // Don't throw - local storage save succeeded
    }
  }

  async updateBugReport(bugReport, screenshotDataUrl = null) {
    try {
      // Save screenshot to API server if provided (for new recordings)
      if (screenshotDataUrl && bugReport.recordings) {
        const latestRecording = bugReport.recordings[bugReport.recordings.length - 1];
        if (latestRecording?.screenshot?.id) {

          const screenshotResult = await this.saveScreenshotToAPI(latestRecording.screenshot.id, screenshotDataUrl);

          if (screenshotResult.success) {
            latestRecording.screenshot = {
              ...latestRecording.screenshot,
              captured: true,
              filename: screenshotResult.filename,
              path: screenshotResult.path
            };
          } else {
            console.error('[Background] Screenshot save failed:', screenshotResult.error);
            latestRecording.screenshot.captured = false;
            latestRecording.screenshot.error = screenshotResult.error;
          }
        }
      }

      // Update timestamp
      bugReport.updated = new Date().toISOString();

      // Save to API server first
      await this.updateBugReportInAPI(bugReport.id, bugReport);

      // Then sync from API to ensure Chrome storage is up to date
      await this.syncBugReportsFromAPI();


    } catch (error) {
      console.error('Error updating bug report:', error);
      throw error;
    }
  }

  async updateBugReportInAPI(id, bugReport) {
    try {
      const response = await fetch(`${this.apiServerUrl}/api/bug-reports/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bugReport)
      });

      if (!response.ok) {
        throw new Error(`API update error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update bug report in API');
      }


    } catch (error) {
      console.error('[Background] Error updating bug report in API:', error);
      throw error;
    }
  }

  async deleteBugReport(id) {
    try {
      // Delete from API server first
      try {
        await this.deleteBugReportFromAPI(id);
      } catch (apiError) {
        console.warn('Failed to delete from API server:', apiError.message);
      }

      // Then sync from API to ensure Chrome storage is up to date
      await this.syncBugReportsFromAPI();


    } catch (error) {
      console.error('Error deleting bug report:', error);
      throw error;
    }
  }

  async deleteBugReportFromAPI(id) {
    try {
      const response = await fetch(`${this.apiServerUrl}/api/bug-reports/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API delete error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete bug report from API');
      }


    } catch (error) {
      console.error('[Background] Error deleting bug report from API:', error);
      throw error;
    }
  }

  /**
   * Save performance report (same structure as bug report)
   */
  async savePerformanceReport(perfReport, screenshotDataUrl = null) {
    try {
      // Save screenshot to API server if provided
      if (screenshotDataUrl && perfReport.screenshot?.id) {

        const screenshotResult = await this.saveScreenshotToAPI(perfReport.screenshot.id, screenshotDataUrl);

        // Update performance report with screenshot filename and absolute path
        if (screenshotResult.success) {

          perfReport.screenshot = {
            id: screenshotResult.screenshotId,
            filename: screenshotResult.filename,
            path: screenshotResult.path,
            absolutePath: screenshotResult.absolutePath,
            captured: true,
            timestamp: perfReport.screenshot.timestamp
          };
        } else {
          console.error('[Background] Screenshot save failed:', screenshotResult.error);
          perfReport.screenshot.captured = false;
          perfReport.screenshot.error = screenshotResult.error;
        }
      } else {

      }

      // Save to API server (same endpoint as bug reports since they share storage)
      await this.saveBugReportToAPI(perfReport);

      // Then sync from API to ensure Chrome storage is up to date
      await this.syncBugReportsFromAPI();


    } catch (error) {
      console.error('Error saving performance report:', error);
      throw error;
    }
  }

  /**
   * Get inspirations from API server
   */
  async getInspirations(domain = null) {
    try {
      let apiUrl = `${this.apiServerUrl}/api/inspirations`;
      if (domain) {
        apiUrl += `?domain=${encodeURIComponent(domain)}`;
      }

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`API server error: ${response.status}`);
      }

      const result = await response.json();
      return result.inspirations || [];
    } catch (error) {
      console.error('[Background] Error getting inspirations from API:', error);
      return [];
    }
  }

  /**
   * Save inspiration with screenshot
   */
  async saveInspiration(inspiration, screenshotDataUrl = null, hoverScreenshotDataUrl = null, responsiveScreenshots = null) {
    try {
      // Save base screenshot to API server if provided
      if (screenshotDataUrl && inspiration.screenshot?.id) {

        const screenshotResult = await this.saveInspirationScreenshotToAPI(inspiration.screenshot.id, screenshotDataUrl);

        // Update inspiration with screenshot info
        if (screenshotResult.success) {

          inspiration.screenshot = {
            id: screenshotResult.screenshotId,
            filename: screenshotResult.filename,
            path: screenshotResult.path,
            absolutePath: screenshotResult.absolutePath,
            captured: true,
            hover: inspiration.screenshot.hover, // Preserve hover screenshot ID
            responsive: inspiration.screenshot.responsive // Preserve responsive flag
          };
        } else {
          console.error('[Background] Inspiration screenshot save failed:', screenshotResult.error);
          inspiration.screenshot.captured = false;
          inspiration.screenshot.error = screenshotResult.error;
        }
      }

      // Save hover screenshot to API server if provided
      if (hoverScreenshotDataUrl && inspiration.screenshot?.hover) {

        const hoverResult = await this.saveInspirationScreenshotToAPI(inspiration.screenshot.hover, hoverScreenshotDataUrl);

        // Update inspiration with hover screenshot info
        if (hoverResult.success) {

          inspiration.screenshot.hoverFilename = hoverResult.filename;
          inspiration.screenshot.hoverPath = hoverResult.path;
          inspiration.screenshot.hoverAbsolutePath = hoverResult.absolutePath;
        } else {
          console.error('[Background] Hover screenshot save failed:', hoverResult.error);
        }
      }

      // Save responsive screenshots if provided (Feature 5)
      if (responsiveScreenshots && Object.keys(responsiveScreenshots).length > 0) {
        const breakpointsList = Object.keys(responsiveScreenshots);


        inspiration.screenshot.states = {};

        // Process in consistent order to ensure all are saved
        const processingOrder = ['mobile', 'tablet', 'desktop'];
        const orderedBreakpoints = processingOrder.filter((bp) => responsiveScreenshots.hasOwnProperty(bp));

        for (const breakpoint of orderedBreakpoints) {
          const dataUrl = responsiveScreenshots[breakpoint];


          if (!dataUrl || dataUrl.length < 100) {
            console.error(`[Background] ✗ ${breakpoint} screenshot is invalid (${dataUrl ? dataUrl.length : 0} bytes), skipping...`);
            continue;
          }

          // Put breakpoint at the END for better readability: screenshot_{timestamp}_{random}_{breakpoint}.png
          const screenshotId = `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${breakpoint}`;


          const responsiveResult = await this.saveInspirationScreenshotToAPI(screenshotId, dataUrl);

          if (responsiveResult.success) {

            inspiration.screenshot.states[breakpoint] = {
              id: responsiveResult.screenshotId,
              filename: responsiveResult.filename,
              path: responsiveResult.path,
              absolutePath: responsiveResult.absolutePath,
              viewport: { width: breakpoint === 'mobile' ? 375 : breakpoint === 'tablet' ? 768 : 1440, height: 'auto' }
            };
          } else {
            console.error(`[Background] ✗ Responsive screenshot (${breakpoint}) save failed:`, responsiveResult.error);
          }
        }

        const savedBreakpoints = Object.keys(inspiration.screenshot.states);


        if (savedBreakpoints.length < breakpointsList.length) {
          const missing = breakpointsList.filter((bp) => !savedBreakpoints.includes(bp));
          console.warn(`[Background] ⚠️ Missing saved breakpoints: ${missing.join(', ')}`);
        }
      }

      // Save inspiration to API server
      await this.saveInspirationToAPI(inspiration);


    } catch (error) {
      console.error('Error saving inspiration:', error);
      throw error;
    }
  }

  async saveInspirationScreenshotToAPI(screenshotId, dataUrl) {
    try {
      const response = await fetch(`${this.apiServerUrl}/api/inspiration-screenshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          screenshotId: screenshotId,
          dataUrl: dataUrl
        })
      });

      if (!response.ok) {
        throw new Error(`API server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save inspiration screenshot to API');
      }


      return result;

    } catch (error) {
      console.error('Failed to save inspiration screenshot to API server:', error.message);
      return { success: false, error: error.message };
    }
  }

  async saveInspirationToAPI(inspiration) {
    try {
      const response = await fetch(`${this.apiServerUrl}/api/inspirations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inspiration)
      });

      if (!response.ok) {
        throw new Error(`API server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save inspiration to API');
      }


    } catch (error) {
      console.warn('Failed to save inspiration to API server:', error.message);
      throw error;
    }
  }

  /**
   * Delete inspiration
   */
  async deleteInspiration(id) {
    try {
      const response = await fetch(`${this.apiServerUrl}/api/inspirations/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API delete error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete inspiration from API');
      }


    } catch (error) {
      console.error('[Background] Error deleting inspiration from API:', error);
      throw error;
    }
  }

  async getInspirationScreenshot(filename) {
    try {
      // Fetch screenshot from API server (background script can access localhost)
      const response = await fetch(`${this.apiServerUrl}/api/inspiration-screenshots/${filename}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch screenshot: ${response.status}`);
      }

      // Convert to blob then to data URL
      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('[Background] Error fetching inspiration screenshot:', error);
      throw error;
    }
  }

  /**
   * Set viewport size for responsive capture (Feature 5)
   */
  async setViewport(tabId, width, height) {
    try {
      // Only attach debugger if not already attached
      const isAttached = this.viewportOverrides.has(tabId);

      if (!isAttached) {

        await chrome.debugger.attach({ tabId }, '1.3');
      } else {

      }

      // Set device metrics override
      await chrome.debugger.sendCommand(
        { tabId },
        'Emulation.setDeviceMetricsOverride',
        {
          width: width,
          height: height,
          deviceScaleFactor: 1,
          mobile: width < 768,
          screenWidth: width,
          screenHeight: height
        }
      );

      // Mark this tab as having viewport override
      this.viewportOverrides.set(tabId, { width, height });


    } catch (error) {
      console.error('[Background] Error setting viewport:', error);
      throw error;
    }
  }

  /**
   * Reset viewport to normal (Feature 5)
   */
  async resetViewport(tabId) {
    try {
      // Clear device metrics override
      await chrome.debugger.sendCommand(
        { tabId },
        'Emulation.clearDeviceMetricsOverride',
        {}
      );

      // Detach debugger
      await chrome.debugger.detach({ tabId });

      // Remove viewport override marker
      this.viewportOverrides.delete(tabId);


    } catch (error) {
      console.error('[Background] Error resetting viewport:', error);
      // Don't throw error on detach failure - tab might be closed
    }
  }

  // Utility function for generating IDs
  generateId() {
    return 'pointa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getChangelogForVersion(version) {
    // Real changelog mapping for actual versions
    const changelogs = {
      '1.0.0': [
      'Initial release of Pointa',
      'Visual annotation system for localhost development',
      'MCP integration for AI coding agents',
      'Light/dark theme support with system preference detection'],

      '1.0.1': [
      'Added Chrome Web Store download link',
      'Enhanced documentation for local file support (file:// URLs)',
      'Added step-by-step instructions for enabling local file access',
      'Improved error messages for file access permissions',
      'Backwards compatible with current server version'],

      '1.0.2': [
      'Added support for .local, .test, and .localhost development domains',
      'WordPress development compatibility (*.local domains)',
      'Laravel Valet compatibility (*.test domains)',
      'Custom localhost setups (*.localhost domains)',
      'Expanded local development environment support'],

      '1.0.3': [
      'Added HTTPS support for localhost development servers',
      'Support for https://localhost (Vite, Next.js, CRA with SSL)',
      'Support for https://127.0.0.1 and https://0.0.0.0',
      'HTTP transport now recommended over SSE for better stability',
      'Updated all setup instructions to promote HTTP transport first',
      'Compatible with mkcert and other local SSL setups']

    };

    return changelogs[version] || ['Various improvements and bug fixes'];
  }
}

// Initialize the background service worker
new PointaBackground();
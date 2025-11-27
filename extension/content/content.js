// Pointa Content Script

class Pointa {
  constructor() {
    this.isAnnotationMode = false;
    this.isDesignMode = false;
    this.annotations = [];
    this.currentTooltip = null;
    this.hoveredElement = null;
    this.currentUrl = window.location.href; // Track current URL for navigation detection
    this.currentDesignEditor = null; // Track currently open design editor
    this.originalStyles = new Map(); // Track original styles for revert
    this.pendingCSSChanges = {}; // Track pending CSS changes before submission
    this.currentEditingAnnotationId = null; // Track if we're editing an existing annotation

    // Design mode scope settings
    this.designEditScope = 'instance'; // 'instance' or 'app'
    this.affectedElements = []; // Elements affected by current scope
    this.componentInfo = null; // Component file info if available

    // Initialize badge manager
    this.badgeManager = new VibeBadgeManager(this);
    // Provide backward compatibility for code that references this.badgePositions
    this.badgePositions = this.badgeManager.badgePositions;

    this.init();
  }

  async init() {
    const isLocalhost = PointaUtils.isLocalhostUrl(window.location.href);

    // Set up theme (needed for all pages)
    await PointaThemeManager.init();

    // Inject font face with correct extension URL (needed for all pages)
    PointaThemeManager.injectFont();

    // Set up message listener (needed for sidebar to work on all pages)
    this.setupMessageListener();

    // Check if sidebar should reopen after navigation (from dropdown navigation)
    // This must happen early for both localhost and non-localhost pages
    // Wait a bit to ensure the page is ready
    setTimeout(() => {
      this.checkAndReopenSidebar();
    }, 100);

    if (!isLocalhost) {

      // Don't initialize annotation features, but sidebar can still open
      return;
    }

    // For localhost pages, initialize full annotation features


    // Link selector generator to this instance for access to pendingCSSChanges and originalStyles
    VibeSelectorGenerator.pendingCSSChanges = this.pendingCSSChanges;
    VibeSelectorGenerator.originalStyles = this.originalStyles;

    // Load existing annotations
    await this.loadAnnotations();

    // Set up global event listeners
    this.setupGlobalListeners();

    // Set up dropdown listeners
    this.setupGlobalDropdownListeners();

    // Set up navigation listener for SPAs
    this.setupNavigationListener();

    // Wait for React hydration to complete before showing annotations
    this.waitForHydrationAndShowAnnotations();

    // Set up DOM observer for dynamic content
    this.setupDOMObserver();

  }

  async loadAnnotations() {
    const loadStartTime = Date.now();


    try {
      let filteredAnnotations = [];

      try {
        // Fetch annotations from API via background script
        const response = await chrome.runtime.sendMessage({
          action: 'getAnnotations',
          url: window.location.href
        });

        if (!response.success) {
          console.error(`[LOAD_ANNOTATIONS_ERROR] Failed to fetch annotations:`, response.error);
          return [];
        }

        filteredAnnotations = response.annotations || [];
      } catch (error) {
        // Fallback: Call API directly if background script is unavailable
        if (error.message && error.message.includes('Extension context invalidated')) {

          filteredAnnotations = await this.getAnnotationsDirectly(window.location.href);
        } else {
          throw error;
        }
      }






      // Get current URL without hash for comparison (background script already filters, but keeping for reference)
      const currentUrlWithoutHash = PointaUtils.getUrlWithoutHash(window.location.href);



      // Annotations already filtered by background script, but double-check
      const finalAnnotations = filteredAnnotations.filter((annotation) => {
        const annotationUrlWithoutHash = PointaUtils.getUrlWithoutHash(annotation.url);
        return annotationUrlWithoutHash === currentUrlWithoutHash;
      });






      // Deduplicate by ID to prevent duplicate annotations from race conditions
      const annotationsMap = new Map();
      finalAnnotations.forEach((annotation) => {
        if (!annotationsMap.has(annotation.id)) {
          annotationsMap.set(annotation.id, annotation);
        } else {
          console.warn(`[LOAD_ANNOTATIONS_DUPLICATE] ${Date.now()} - Found duplicate annotation ID:`, annotation.id);
        }
      });
      this.annotations = Array.from(annotationsMap.values());

      const loadEndTime = Date.now();
      const loadDuration = loadEndTime - loadStartTime;







    } catch (error) {
      console.error(`[LOAD_ANNOTATIONS_ERROR] ${Date.now()} - Error loading annotations:`, error);
      this.annotations = [];
    }
  }

  setupMessageListener() {

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

      switch (request.action) {
        case 'startAnnotationMode':
          this.startAnnotationMode().then(() => {
            sendResponse({ success: true, message: 'Annotation mode started' });
          });
          break;

        case 'stopAnnotationMode':
          this.stopAnnotationMode();
          sendResponse({ success: true, message: 'Annotation mode stopped' });
          break;

        case 'startDesignMode':
          this.startDesignMode();
          sendResponse({ success: true, message: 'Design mode started' });
          break;

        case 'stopDesignMode':
          this.stopDesignMode();
          sendResponse({ success: true, message: 'Design mode stopped' });
          break;

        case 'getAnnotationModeStatus':
          sendResponse({ success: true, isAnnotationMode: this.isAnnotationMode || this.isDesignMode });
          break;

        case 'highlightAnnotation':
          this.highlightAnnotation(request.annotation);
          sendResponse({ success: true, message: 'Annotation highlighted' });
          break;

        case 'targetAnnotationElement':
          this.targetAnnotationElement(request.annotation);
          sendResponse({ success: true, message: 'Element targeted' });
          break;

        case 'toggleSidebar':
          PointaSidebar.toggle(this);
          sendResponse({ success: true, message: 'Sidebar toggled' });
          break;

        case 'showOnboarding':
          if (window.VibeOnboarding) {
            window.VibeOnboarding.show();
            sendResponse({ success: true, message: 'Onboarding shown' });
          } else {
            sendResponse({ success: false, error: 'Onboarding module not loaded' });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }

      return true; // Keep the message channel open for async response
    });
  }

  setupGlobalListeners() {
    // NOTE: No longer listen for storage changes - we don't use chrome.storage.local for annotations
    // Annotations are now fetched directly from API via background script
    // UI updates happen after save/update/delete operations

    // ESC key to exit annotation mode or design mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isAnnotationMode) {
          this.stopAnnotationMode();
        } else if (this.isDesignMode) {
          this.stopDesignMode();
        }
      }
    });
  }

  setupNavigationListener() {
    // Handle URL changes in Single Page Applications (SPAs)
    // This ensures annotations are reloaded when navigating without a full page reload

    // Track URL changes (excluding hash-only changes)
    const checkUrlChange = () => {
      const newUrl = window.location.href;
      const currentUrlWithoutHash = PointaUtils.getUrlWithoutHash(this.currentUrl);
      const newUrlWithoutHash = PointaUtils.getUrlWithoutHash(newUrl);

      // Only trigger handleUrlChange if the URL changed WITHOUT considering hash
      // This keeps annotations visible when clicking anchors (#section)
      if (newUrlWithoutHash !== currentUrlWithoutHash) {
        this.currentUrl = newUrl;
        // URL changed - reload annotations for the new page
        this.handleUrlChange();
      } else if (newUrl !== this.currentUrl) {
        // Hash-only change - just update the stored URL but don't reload annotations
        this.currentUrl = newUrl;
      }
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', checkUrlChange);

    // Listen for hash changes
    window.addEventListener('hashchange', checkUrlChange);

    // Override pushState and replaceState to detect programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      // Use setTimeout to allow navigation to complete
      setTimeout(checkUrlChange, 0);
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      setTimeout(checkUrlChange, 0);
    };

    // Periodic check as fallback (in case frameworks use other methods)
    // Check every 500ms if URL has changed
    setInterval(checkUrlChange, 500);
  }

  /**
   * Check if sidebar should reopen after navigation from dropdown
   */
  async checkAndReopenSidebar() {
    try {
      const result = await chrome.storage.local.get([
        'reopenSidebarAfterNavigation', 
        'reopenSidebarTimestamp', 
        'scrollToAnnotationId',
        'reopenInNotificationCenter'
      ]);
      
      if (result.reopenSidebarAfterNavigation) {
        // Check timestamp - only reopen if flag was set within last 10 seconds
        const timestamp = result.reopenSidebarTimestamp || 0;
        const age = Date.now() - timestamp;
        
        if (age < 10000) {
          const scrollToAnnotationId = result.scrollToAnnotationId;
          const reopenInNotificationCenter = result.reopenInNotificationCenter || false;
          
          // Clear the flags immediately
          await chrome.storage.local.remove([
            'reopenSidebarAfterNavigation', 
            'reopenSidebarTimestamp', 
            'scrollToAnnotationId',
            'reopenInNotificationCenter'
          ]);
          
          // Wait a bit for page to fully initialize, then open sidebar
          setTimeout(async () => {
            // Restore notification center state BEFORE opening sidebar
            if (reopenInNotificationCenter) {
              PointaSidebar.notificationCenterOpen = true;
            }
            
            if (!PointaSidebar.isOpen) {
              await PointaSidebar.open(this);
            }
            
            // If we have an annotation ID to scroll to, scroll the sidebar to show it
            if (scrollToAnnotationId) {
              setTimeout(() => {
                if (PointaSidebar.scrollToAnnotationInSidebar) {
                  PointaSidebar.scrollToAnnotationInSidebar(scrollToAnnotationId);
                }
              }, 600); // Wait for sidebar to fully render and content to load
            }
          }, 300);
        } else {
          // Flag is too old, clear it
          await chrome.storage.local.remove([
            'reopenSidebarAfterNavigation', 
            'reopenSidebarTimestamp', 
            'scrollToAnnotationId',
            'reopenInNotificationCenter'
          ]);
        }
      }
    } catch (error) {
      console.error('[Pointa] Failed to check sidebar reopen flag:', error);
    }
  }

  async handleUrlChange() {

    // Check if sidebar should reopen (for SPA navigation)
    await this.checkAndReopenSidebar();

    // Clear existing badges from previous page
    this.clearAllBadges();

    // Close any open widgets/modals
    this.closeInlineCommentWidget();
    if (this.currentTooltip) {
      this.currentTooltip = null;
    }

    // Optional: Sync from API on page navigation to catch MCP/AI edits
    // This makes MCP edits visible immediately when navigating between pages
    const syncOnNavigation = true; // Set to false to disable sync on page navigation
    if (syncOnNavigation) {

      try {
        await chrome.runtime.sendMessage({
          action: 'syncAnnotationsOnDemand'
        });

      } catch (error) {
        console.warn('[URL_CHANGE_SYNC] Background sync failed:', error.message);
        // Continue anyway - we'll load from local storage
      }
    }

    // Reload annotations for the new URL (from local storage cache)
    await this.loadAnnotations();

    // Refresh sidebar to show annotations for the new page
    if (PointaSidebar.isOpen) {
      const serverOnline = await this.checkAPIStatus();
      await PointaSidebar.updateContent(this, serverOnline.connected);
    }

    // Wait a bit for the page to render, then show annotations
    setTimeout(() => {
      this.waitForHydrationAndShowAnnotations();
    }, 100);
  }

  async startAnnotationMode() {
    await PointaAnnotationMode.startAnnotationMode(this);
  }

  stopAnnotationMode() {
    PointaAnnotationMode.stopAnnotationMode(this);
  }

  startDesignMode() {
    PointaDesignMode.startDesignMode(this);
  }

  stopDesignMode() {
    PointaDesignMode.stopDesignMode(this);
  }

  closeDesignEditor() {
    PointaDesignMode.closeDesignEditor(this);
  }

  toggleMoveMode(element, moveBtn) {
    PointaDesignMode.toggleMoveMode(element, moveBtn, this);
  }

  enableElementDrag(element) {
    PointaDesignMode.enableElementDrag(element, this);
  }

  disableElementDrag(element) {
    PointaDesignMode.disableElementDrag(element);
  }

  findElementByPath(path) {
    return VibeElementFinder.findElementByPath(path);
  }

  revertDOMPositionChange(element, domPositionData) {
    PointaDesignMode.revertDOMPositionChange(element, domPositionData, this);
  }

  applyDOMPositionChange(element, domPositionData) {
    PointaDesignMode.applyDOMPositionChange(element, domPositionData, this);
  }

  trackDOMPositionChange(element, originalStylesObj) {
    PointaDesignMode.trackDOMPositionChange(element, originalStylesObj, this);
  }

  tempDisableAnnotationMode() {
    PointaAnnotationMode.tempDisableAnnotationMode(this);
  }

  reEnableAnnotationMode() {
    PointaAnnotationMode.reEnableAnnotationMode(this);
  }

  showModeIndicator() {
    PointaAnnotationMode.showModeIndicator();
  }

  removeModeIndicator() {
    PointaAnnotationMode.removeModeIndicator();
  }

  async createAnnotation(element) {
    return PointaAnnotationMode.createAnnotation(this, element);
  }

  // Keep generateElementContext in content.js as it's shared by both annotation mode and design mode
  async generateElementContext(element) {
    // Generate CSS selector
    const selector = VibeSelectorGenerator.generate(element);

    // Get element styles
    const computedStyle = window.getComputedStyle(element);
    const relevantStyles = {
      display: computedStyle.display,
      position: computedStyle.position,
      fontSize: computedStyle.fontSize,
      color: computedStyle.color,
      backgroundColor: computedStyle.backgroundColor,
      margin: computedStyle.margin,
      padding: computedStyle.padding
    };

    // Get element position
    const rect = element.getBoundingClientRect();
    const position = {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height
    };

    // Get viewport dimensions
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    // Get source mapping information
    const sourceMapping = VibeContextAnalyzer.generateSourceMapping(element);

    // Get parent chain context for better element disambiguation
    const parentChain = VibeContextAnalyzer.getParentChainContext(element);

    return {
      selector,
      tag: element.tagName.toLowerCase(),
      // CRITICAL: Filter out temporary pointa- classes to ensure clean selectors
      classes: Array.from(element.classList).filter((cls) => !cls.startsWith('pointa-')),
      text: element.textContent.substring(0, 100).trim(),
      styles: relevantStyles,
      position,
      viewport,
      source_mapping: sourceMapping,
      parent_chain: parentChain
    };
  }


  async showEditModal(element, context, annotation) {
    // Check API status first
    const apiStatus = await this.checkAPIStatus();

    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('annotation-edit');
    }

    // Create modal for editing
    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal';
    modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
    modal.innerHTML = `
      <div class="pointa-comment-modal-content">
        <div class="pointa-comment-modal-header">
          <h3 class="pointa-comment-modal-title">Edit Annotation</h3>
          <button class="pointa-comment-modal-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        ${PointaUtils.isFileProtocol() ? `
          <div class="pointa-api-status-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Local file mode - API server access via extension background</span>
          </div>
        ` : !apiStatus.connected ? `
          <div class="pointa-api-status-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>MCP server is offline - annotation cannot be edited or deleted</span>
          </div>
        ` : ''}
        
        <div class="pointa-element-details">
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--code-bracket-square"></span>
            <span class="pointa-detail-value">${context.selector}</span>
          </div>
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--computer-desktop"></span>
            <span class="pointa-detail-value">${context.viewport.width}w</span>
          </div>
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--map-pin"></span>
            <span class="pointa-detail-value">${Math.round(context.position.x)}, ${Math.round(context.position.y)}</span>
          </div>
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--arrows-pointing-out"></span>
            <span class="pointa-detail-value">${Math.round(context.position.width)}×${Math.round(context.position.height)}</span>
          </div>
        </div>
        
        <div class="pointa-comment-input-wrapper">
          <textarea 
            id="pointa-comment-textarea"
            class="pointa-comment-textarea" 
            placeholder="Describe what needs to be changed or improved..."
            maxlength="1000"
          >${annotation.comment || ''}</textarea>
          <div class="pointa-comment-helper">${PointaUtils.isMac() ? '⌘↩' : 'Ctrl+Enter'} to save</div>
        </div>
        
        <div class="pointa-comment-actions">
          <button class="pointa-btn pointa-btn-icon" id="delete-comment" title="Delete annotation">
            <span class="pointa-icon pointa-icon--trash"></span>
          </button>
          <div class="pointa-btn-group">
            <button class="pointa-btn pointa-btn-secondary" id="cancel-comment">Cancel</button>
            <button class="pointa-btn pointa-btn-primary" id="save-comment" disabled>Save Changes</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Set up modal event listeners for edit mode
    this.setupEditModalListeners(modal, element, context, annotation);

    // Focus textarea and select all text
    const textarea = modal.querySelector('.pointa-comment-textarea');
    textarea.focus();
    textarea.select();
  }

  async showCommentModal(element, context) {
    // Clear draft if switching to a different element
    if (this.lastCommentElement && this.lastCommentElement !== element) {
      this.commentDraft = null;

    }
    // Store current element for next time
    this.lastCommentElement = element;

    // Check API status first
    const apiStatus = await this.checkAPIStatus();

    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('annotation-create');
    }

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal';
    modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
    modal.innerHTML = `
      <div class="pointa-comment-modal-content">
        <div class="pointa-comment-modal-header">
          <h3 class="pointa-comment-modal-title">Add Annotation</h3>
          <button class="pointa-comment-modal-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        ${PointaUtils.isFileProtocol() ? `
          <div class="pointa-api-status-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Local file mode - API server access via extension background</span>
          </div>
        ` : !apiStatus.connected ? `
          <div class="pointa-api-status-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>MCP server is offline - annotation cannot be edited or deleted</span>
          </div>
        ` : ''}
        
        <div class="pointa-element-details">
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--code-bracket-square"></span>
            <span class="pointa-detail-value">${context.selector}</span>
          </div>
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--computer-desktop"></span>
            <span class="pointa-detail-value">${context.viewport.width}w</span>
          </div>
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--map-pin"></span>
            <span class="pointa-detail-value">${Math.round(context.position.x)}, ${Math.round(context.position.y)}</span>
          </div>
          <div class="pointa-detail-item">
            <span class="pointa-icon pointa-icon--arrows-pointing-out"></span>
            <span class="pointa-detail-value">${Math.round(context.position.width)}×${Math.round(context.position.height)}</span>
          </div>
        </div>
        
        <div class="pointa-comment-input-wrapper">
          <textarea 
            id="pointa-comment-textarea"
            class="pointa-comment-textarea" 
            placeholder="Describe what needs to be changed or improved..."
            maxlength="5000"
          ></textarea>
          <div class="pointa-comment-char-limit">0 / 5000</div>
          <div class="pointa-comment-helper">${PointaUtils.isMac() ? '⌘↩' : 'Ctrl+Enter'} to save</div>
        </div>
        
        <div class="pointa-comment-actions">
          <div class="pointa-btn-group">
            <button class="pointa-btn pointa-btn-secondary" id="cancel-comment">Cancel</button>
            <button class="pointa-btn pointa-btn-primary" id="save-comment" disabled>Save Annotation</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Set up modal event listeners
    this.setupModalListeners(modal, element, context);

    // Focus textarea and restore draft if available - EXACT element match
    const textarea = modal.querySelector('.pointa-comment-textarea');
    if (this.commentDraft && this.commentDraft.element === element) {
      textarea.value = this.commentDraft.text;

    }
    textarea.focus();
  }

  // Helper method to detect if we're on a file:// URL

  // Cache API status to prevent repeated calls
  apiStatusCache = null;
  apiStatusCacheTime = 0;
  apiStatusCacheDuration = 2000; // Cache for 2 seconds

  // Clear API status cache
  clearAPIStatusCache() {
    this.apiStatusCache = null;
    this.apiStatusCacheTime = 0;
  }

  async checkAPIStatus() {
    // Check cache first
    const now = Date.now();
    if (this.apiStatusCache && now - this.apiStatusCacheTime < this.apiStatusCacheDuration) {
      return this.apiStatusCache;
    }

    let status;
    const isLocalhost = PointaUtils.isLocalhostUrl(window.location.href);

    // For non-localhost pages OR file:// protocol, use background script to avoid browser permission dialogs
    // Background script can make localhost requests without triggering permission prompts
    if (!isLocalhost || PointaUtils.isFileProtocol()) {
      try {
        const bgResponse = await chrome.runtime.sendMessage({
          action: 'checkMCPStatus'
        });

        if (bgResponse && bgResponse.success && bgResponse.status) {
          status = { connected: bgResponse.status.connected };
        } else {
          status = { connected: false, error: 'Background check failed' };
        }
      } catch (bgError) {
        console.error('[Pointa] Background API check failed:', bgError);
        status = { connected: false, error: 'Cannot connect to API server' };
      }
    } else {
      // For localhost URLs, try direct fetch first
      try {
        const response = await fetch('http://127.0.0.1:4242/health', {
          method: 'GET',
          signal: AbortSignal.timeout(2000), // 2 second timeout
          mode: 'cors', // Explicitly set CORS mode
          credentials: 'omit' // Don't send credentials for localhost
        });

        if (response.ok) {
          status = { connected: true };
        } else {
          status = { connected: false, error: `Server returned ${response.status}` };
        }
      } catch (error) {
        // If direct fetch fails, try via background script as fallback
        console.warn('Direct API check failed, trying via background script:', error);

        try {
          const bgResponse = await chrome.runtime.sendMessage({
            action: 'checkMCPStatus'
          });

          if (bgResponse && bgResponse.success && bgResponse.status) {
            status = { connected: bgResponse.status.connected };
          } else {
            status = { connected: false, error: 'Background check failed' };
          }
        } catch (bgError) {
          console.error('Background API check also failed:', bgError);
          status = { connected: false, error: error.message };
        }
      }
    }

    // Cache the result
    this.apiStatusCache = status;
    this.apiStatusCacheTime = now;

    return status;
  }

  setupEditModalListeners(modal, element, context, annotation) {
    const textarea = modal.querySelector('.pointa-comment-textarea');
    const cancelBtn = modal.querySelector('#cancel-comment');
    const saveBtn = modal.querySelector('#save-comment');
    const deleteBtn = modal.querySelector('#delete-comment');
    const closeBtn = modal.querySelector('.pointa-comment-modal-close');

    // Enable/disable save button based on textarea content and API status
    const updateSaveButton = async () => {
      const hasText = textarea.value.trim().length > 0;
      const hasChanges = textarea.value.trim() !== (annotation.comment || '');
      const apiStatus = await this.checkAPIStatus();

      // Disable if no text, no changes, or server offline
      saveBtn.disabled = !hasText || !hasChanges || !apiStatus.connected;

      // Update button text based on server status
      if (!apiStatus.connected) {
        saveBtn.textContent = 'Server Offline';
      } else {
        saveBtn.textContent = 'Save Changes';
      }
    };

    textarea.addEventListener('input', updateSaveButton);

    // Initial update
    updateSaveButton();

    // Cancel/close handlers
    const closeModal = () => {
      // Unregister modal with central manager
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('annotation-edit');
      }

      if (modal.parentNode) {
        modal.remove();
        // Re-enable annotation mode when modal closes
        this.reEnableAnnotationMode();
      }
    };

    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);

    // Delete button handler
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this annotation?')) {
          try {
            // If this is a design-edit annotation, revert the CSS changes first
            if (annotation.type === 'design-edit' && annotation.css_changes) {
              this.revertDesignChanges(element, annotation);
            }

            try {
              await chrome.runtime.sendMessage({
                action: 'deleteAnnotation',
                id: annotation.id
              });
            } catch (error) {
              // Fallback: Call API directly if background script is unavailable
              if (error.message && error.message.includes('Extension context invalidated')) {

                await this.deleteAnnotationDirectly(annotation.id);
              } else {
                throw error;
              }
            }

            // Remove the badge
            const badge = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
            if (badge) {
              // Use cleanup function to properly remove badge and tracking
              if (badge.cleanup) {
                badge.cleanup();
              } else {
                badge.remove();
              }
            }

            // Remove from local array
            const localIndex = this.annotations.findIndex((a) => a.id === annotation.id);
            if (localIndex !== -1) {
              this.annotations.splice(localIndex, 1);
            }

            // Refresh sidebar to show annotation removed
            if (PointaSidebar && PointaSidebar.isOpen) {

              const serverOnline = await PointaSidebar.checkServerStatus();
              await PointaSidebar.updateContent(this, serverOnline);
            }

            closeModal();
          } catch (error) {
            console.error('Error deleting annotation:', error);
            alert('Failed to delete annotation. Please try again.');
          }
        }
      });
    }

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // ESC to close and Cmd+Enter to save
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        // Check if we're focused on the textarea and save button is enabled
        if (document.activeElement === textarea && !saveBtn.disabled) {
          e.preventDefault();
          saveBtn.click();
        }
      }
    });

    // Save handler for edit mode
    saveBtn.addEventListener('click', async () => {
      const newComment = textarea.value.trim();
      if (newComment && newComment !== (annotation.comment || '')) {
        // Check API status before saving
        const apiStatus = await this.checkAPIStatus();

        if (!apiStatus.connected) {


          // Server is offline, still save but show warning
        }await this.updateAnnotation(annotation, newComment);
        closeModal();

        // Re-enable annotation mode for continuous inspection
      }
    });
  }

  setupModalListeners(modal, element, context) {
    const textarea = modal.querySelector('.pointa-comment-textarea');
    const cancelBtn = modal.querySelector('#cancel-comment');
    const saveBtn = modal.querySelector('#save-comment');
    const closeBtn = modal.querySelector('.pointa-comment-modal-close');
    const charCounter = modal.querySelector('.pointa-comment-char-limit');

    // Enable/disable save button based on textarea content and API status
    const updateSaveButton = async () => {
      const hasText = textarea.value.trim().length > 0;
      const apiStatus = await this.checkAPIStatus();

      // Update character counter
      const currentLength = textarea.value.length;
      const maxLength = textarea.maxLength;
      if (charCounter) {
        charCounter.textContent = `${currentLength} / ${maxLength}`;

        // Show counter when approaching limit (>4500 chars) or at limit
        if (currentLength > 4500) {
          charCounter.classList.add('visible');
          if (currentLength >= maxLength) {
            charCounter.classList.add('at-limit');
          } else {
            charCounter.classList.remove('at-limit');
          }
        } else {
          charCounter.classList.remove('visible', 'at-limit');
        }
      }

      // Disable if no text or server offline
      saveBtn.disabled = !hasText || !apiStatus.connected;

      // Update button text based on server status
      if (!apiStatus.connected) {
        saveBtn.textContent = 'Server Offline';
      } else {
        saveBtn.textContent = 'Save Annotation';
      }
    };

    textarea.addEventListener('input', updateSaveButton);

    // Initial update
    updateSaveButton();

    // Cancel/close handlers
    const closeModal = () => {
      // Save draft in-memory if there's text in the textarea
      if (textarea && element && textarea.value.trim()) {
        this.commentDraft = {
          text: textarea.value,
          selector: context.selector,
          element: element, // Store element reference for exact matching
          timestamp: Date.now()
        };

      }

      // Unregister modal with central manager
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('annotation-create');
      }

      if (modal.parentNode) {
        modal.remove();
        // Re-enable annotation mode when modal closes
        this.reEnableAnnotationMode();
      }
    };

    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // ESC to close and Cmd+Enter to save
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        // Check if we're focused on the textarea and save button is enabled
        if (document.activeElement === textarea && !saveBtn.disabled) {
          e.preventDefault();
          saveBtn.click();
        }
      }
    });

    // Save handler
    saveBtn.addEventListener('click', async () => {
      const comment = textarea.value.trim();
      if (comment) {
        // Check API status before saving
        const apiStatus = await this.checkAPIStatus();

        if (!apiStatus.connected) {


          // Server is offline, still save but show warning
        }await this.saveAnnotation(element, context, comment);

        // Clear draft after successful save
        this.commentDraft = null;


        closeModal();

        // Re-enable annotation mode for continuous inspection
        // User stays in inspection mode until ESC or extension button
      }
    });
  }

  async updateAnnotation(annotation, newComment, referenceImages = []) {
    try {
      // Convert to messages format and update the latest message
      const messages = annotation.messages || (annotation.comment ? [{
        role: 'user',
        text: annotation.comment,
        timestamp: annotation.created_at,
        iteration: 1
      }] : []);

      // Update the latest message or create new one (editing, not adding iteration)
      if (messages.length > 0) {
        const currentIteration = messages[messages.length - 1].iteration || messages.length;
        messages[messages.length - 1] = {
          role: 'user',
          text: newComment,
          timestamp: new Date().toISOString(),
          iteration: currentIteration // Keep same iteration number when editing
        };
      } else {
        messages.push({
          role: 'user',
          text: newComment,
          timestamp: new Date().toISOString(),
          iteration: 1
        });
      }

      // Update annotation through background script
      const updates = {
        messages: messages,
        comment: newComment, // Keep for backward compatibility
        updated_at: new Date().toISOString()
      };

      // Add reference_images if provided
      if (referenceImages && referenceImages.length > 0) {
        updates.reference_images = referenceImages;
      }

      try {
        const bgResponse = await chrome.runtime.sendMessage({
          action: 'updateAnnotation',
          id: annotation.id,
          updates: updates
        });

        if (!bgResponse || !bgResponse.success) {
          throw new Error(bgResponse?.error || 'Failed to update annotation');
        }

        // Update local array
        const localIndex = this.annotations.findIndex((a) => a.id === annotation.id);
        if (localIndex !== -1) {
          this.annotations[localIndex] = { ...this.annotations[localIndex], ...updates };
        }
      } catch (error) {
        console.error('Error updating annotation via background script:', error);

        // Fallback: Call API directly if background script is unavailable
        if (error.message && error.message.includes('Extension context invalidated')) {

          await this.updateAnnotationDirectly(annotation.id, updates);

          // Update local array
          const localIndex = this.annotations.findIndex((a) => a.id === annotation.id);
          if (localIndex !== -1) {
            this.annotations[localIndex] = { ...this.annotations[localIndex], ...updates };
          }
        } else {
          throw error;
        }
      }

      // Update the tooltip content and local annotation data
      // Find badge by data-annotation-id since badges are on body, not element
      const badge = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
      if (badge) {
        const tooltip = badge.querySelector('.pointa-pin-tooltip');
        if (tooltip) {
          tooltip.textContent = newComment;
        }
      }

      // Refresh sidebar to show updated annotation
      if (PointaSidebar && PointaSidebar.isOpen) {

        const serverOnline = await PointaSidebar.checkServerStatus();
        await PointaSidebar.updateContent(this, serverOnline);

        // Scroll to and highlight the updated annotation
        setTimeout(() => {
          const annotationItem = PointaSidebar.sidebar?.querySelector(`[data-annotation-id="${annotation.id}"]`);
          if (annotationItem) {
            annotationItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            // Add a brief highlight effect
            annotationItem.style.backgroundColor = 'rgba(12, 140, 233, 0.15)';
            annotationItem.style.transition = 'background-color 0.3s ease';
            setTimeout(() => {
              annotationItem.style.backgroundColor = '';
            }, 1500);


          }
        }, 150);
      }

      // Also update the annotation object reference if it's stored somewhere
      // This ensures the widget shows updated text when reopened
      if (this.currentCommentAnnotation && this.currentCommentAnnotation.id === annotation.id) {
        this.currentCommentAnnotation.comment = newComment;
        this.currentCommentAnnotation.messages = messages;
      }
    } catch (error) {
      console.error('Error updating annotation:', error);
      alert('Error updating annotation. Please try again.');
    }
  }

  async addAnnotationMessage(annotation, newComment, referenceImages = []) {
    try {
      // Convert to messages format if needed
      const messages = annotation.messages || (annotation.comment ? [{
        role: 'user',
        text: annotation.comment,
        timestamp: annotation.created_at,
        iteration: 1
      }] : []);

      // Add new message to the conversation with explicit metadata
      messages.push({
        role: 'user',
        text: newComment,
        timestamp: new Date().toISOString(),
        iteration: messages.length + 1 // Explicit iteration counter for AI clarity
      });

      // Update annotation through background script - move back to pending status
      const updates = {
        messages: messages,
        comment: newComment, // Update main comment to latest for backward compatibility
        status: 'pending', // Move back to pending when user adds more feedback
        updated_at: new Date().toISOString()
      };

      // Add reference_images if provided
      if (referenceImages && referenceImages.length > 0) {
        // Merge with existing reference images
        const existingImages = annotation.reference_images || [];
        updates.reference_images = [...existingImages, ...referenceImages];
      }

      try {
        const bgResponse = await chrome.runtime.sendMessage({
          action: 'updateAnnotation',
          id: annotation.id,
          updates: updates
        });

        if (!bgResponse || !bgResponse.success) {
          throw new Error(bgResponse?.error || 'Failed to add message to annotation');
        }

        // Update local array
        const localIndex = this.annotations.findIndex((a) => a.id === annotation.id);
        if (localIndex !== -1) {
          this.annotations[localIndex] = { ...this.annotations[localIndex], ...updates };
        }
      } catch (error) {
        console.error('Error adding message via background script:', error);

        // Fallback: Call API directly if background script is unavailable
        if (error.message && error.message.includes('Extension context invalidated')) {

          await this.updateAnnotationDirectly(annotation.id, updates);

          // Update local array
          const localIndex = this.annotations.findIndex((a) => a.id === annotation.id);
          if (localIndex !== -1) {
            this.annotations[localIndex] = { ...this.annotations[localIndex], ...updates };
          }
        } else {
          throw error;
        }
      }

      // Update the badge status
      const badge = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
      if (badge) {
        // Update tooltip
        const tooltip = badge.querySelector('.pointa-pin-tooltip');
        if (tooltip) {
          tooltip.textContent = newComment;
        }

        // Update badge status indicator if present
        const statusIndicator = badge.querySelector('.pointa-pin-status');
        if (statusIndicator) {
          statusIndicator.className = 'pointa-pin-status pending';
          statusIndicator.textContent = 'pending';
        }
      }

      // Refresh sidebar to show updated annotation
      if (PointaSidebar && PointaSidebar.isOpen) {

        const serverOnline = await PointaSidebar.checkServerStatus();
        await PointaSidebar.updateContent(this, serverOnline);

        // Scroll to and highlight the updated annotation
        setTimeout(() => {
          const annotationItem = PointaSidebar.sidebar?.querySelector(`[data-annotation-id="${annotation.id}"]`);
          if (annotationItem) {
            annotationItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            // Add a brief highlight effect
            annotationItem.style.backgroundColor = 'rgba(12, 140, 233, 0.15)';
            annotationItem.style.transition = 'background-color 0.3s ease';
            setTimeout(() => {
              annotationItem.style.backgroundColor = '';
            }, 1500);


          }
        }, 150);
      }

      // Also update the annotation object reference if it's stored somewhere
      if (this.currentCommentAnnotation && this.currentCommentAnnotation.id === annotation.id) {
        this.currentCommentAnnotation.comment = newComment;
        this.currentCommentAnnotation.messages = messages;
        this.currentCommentAnnotation.status = 'pending';
      }
    } catch (error) {
      console.error('Error adding message to annotation:', error);
      alert('Error adding message. Please try again.');
    }
  }

  /**
   * Update annotation directly via API when background script is unavailable.
   * This is a fallback for when the extension context is invalidated.
   * 
   * @param {string} id - Annotation ID
   * @param {Object} updates - Updates to apply to the annotation
   */
  async updateAnnotationDirectly(id, updates) {
    const apiServerUrl = 'http://127.0.0.1:4242';

    try {


      const response = await fetch(`${apiServerUrl}/api/annotations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Update failed');
      }



    } catch (error) {
      console.error('[API_DIRECT] Error updating annotation directly:', error);
      throw new Error(`Failed to update annotation: ${error.message}`);
    }
  }

  /**
   * Save annotation directly via API when background script is unavailable.
   * This is a fallback for when the extension context is invalidated.
   * 
   * @param {Object} annotation - Annotation object to save
   */
  async saveAnnotationDirectly(annotation) {
    const apiServerUrl = 'http://127.0.0.1:4242';

    try {


      const response = await fetch(`${apiServerUrl}/api/annotations`, {
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
        throw new Error(result.error || 'Save failed');
      }



    } catch (error) {
      console.error('[API_DIRECT] Error saving annotation directly:', error);
      throw new Error(`Failed to save annotation: ${error.message}`);
    }
  }

  /**
   * Delete annotation directly via API when background script is unavailable.
   * This is a fallback for when the extension context is invalidated.
   * 
   * @param {string} id - Annotation ID to delete
   */
  async deleteAnnotationDirectly(id) {
    const apiServerUrl = 'http://127.0.0.1:4242';

    try {


      const response = await fetch(`${apiServerUrl}/api/annotations/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Delete failed');
      }



    } catch (error) {
      console.error('[API_DIRECT] Error deleting annotation directly:', error);
      throw new Error(`Failed to delete annotation: ${error.message}`);
    }
  }

  /**
   * Get annotations directly via API when background script is unavailable.
   * This is a fallback for when the extension context is invalidated.
   * 
   * @param {string} url - URL to filter annotations by
   * @returns {Array} Array of annotations
   */
  async getAnnotationsDirectly(url) {
    const apiServerUrl = 'http://127.0.0.1:4242';

    try {


      const params = new URLSearchParams();
      if (url) {
        params.append('url', url);
      }

      const apiUrl = `${apiServerUrl}/api/annotations?${params.toString()}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      const annotations = result.annotations || [];



      return annotations;

    } catch (error) {
      console.error('[API_DIRECT] Error getting annotations directly:', error);
      // Return empty array on error to gracefully degrade
      return [];
    }
  }

  /**
   * Creates a lean version of annotation data optimized for LLM token efficiency.
   * Strips verbose data while keeping essential information for code editing.
   * 
   * @param {Object} context - Full element context
   * @param {string} comment - User's annotation comment
   * @returns {Object} Lean annotation object
   */
  createLeanAnnotation(context, comment) {
    return VibeAnnotationFactory.createLeanAnnotation(context, comment);
  }

  /**
   * Creates a verbose/full version of annotation data (original format).
   * Kept for backwards compatibility and optional use.
   * 
   * @param {Object} context - Full element context
   * @param {string} comment - User's annotation comment
   * @returns {Object} Verbose annotation object
   */
  createVerboseAnnotation(context, comment) {
    return VibeAnnotationFactory.createVerboseAnnotation(context, comment);
  }

  /**
   * Creates a design-edit annotation with CSS changes structure.
   * Used by Design Mode to track visual style changes.
   * Design annotations keep MORE context than regular annotations since the changes are the message.
   * 
   * @param {HTMLElement} element - The element being edited
   * @param {Object} context - Full element context
   * @param {Object} cssChanges - Object with CSS property changes { property: {old: value, new: value} }
   * @returns {Object} Design annotation object
   */
  createDesignAnnotation(element, context, cssChanges) {
    // Pass design mode state to factory
    const designState = {
      componentInfo: this.componentInfo,
      designEditScope: this.designEditScope,
      affectedElements: this.affectedElements
    };
    return VibeAnnotationFactory.createDesignAnnotation(element, context, cssChanges, designState);
  }


  generateScopeInstruction() {
    const designState = {
      componentInfo: this.componentInfo,
      designEditScope: this.designEditScope,
      affectedElements: this.affectedElements
    };
    return VibeAnnotationFactory.generateScopeInstruction(designState);
  }


  async saveAnnotation(element, context, comment, referenceImages = []) {
    const saveStartTime = Date.now();
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;






    try {
      // Validate selector works correctly
      const testElement = document.querySelector(context.selector);
      if (testElement !== element) {
        console.warn(`[SAVE_ANNOTATION_SELECTOR_MISMATCH] ${tempId} - Generated selector does not match original element:`, context.selector);
        console.warn(`[SAVE_ANNOTATION_SELECTOR_MISMATCH] Original element:`, element);
        console.warn(`[SAVE_ANNOTATION_SELECTOR_MISMATCH] Found element:`, testElement);

        // Regenerate selector and update context
        const newSelector = VibeSelectorGenerator.generate(element);
        context.selector = newSelector;


        // Test again
        const newTestElement = document.querySelector(newSelector);
        if (newTestElement !== element) {
          console.error(`[SAVE_ANNOTATION_SELECTOR_FAILED] ${tempId} - Even regenerated selector fails. Using fallback approach.`);
          // Add data attribute as fallback
          const dataId = `pointa-${Date.now()}`;
          element.setAttribute('data-pointa-id', dataId);
          context.selector = `[data-pointa-id="${dataId}"]`;

        }
      }

      // ============================================================
      // DATA FORMAT CONFIGURATION
      // ============================================================
      // LEAN FORMAT (Current): ~1KB, optimized for LLM tokens (~96% smaller)
      //   - Keeps: selector, source file, line range, hints, position, text
      //   - Strips: verbose styles, deep parent chains, viewport
      //   - Best for: Normal usage, token efficiency, MCP integration
      //
      // VERBOSE FORMAT: ~25KB+, complete detailed data  
      //   - Keeps everything: all classes, styles, positions
      //   - Best for: Debugging, when source mapping unavailable
      //
      // To switch: Set useLeanFormat = false (see docs/ANNOTATION_DATA_FORMATS.md)
      // ============================================================
      const useLeanFormat = true;

      const annotation = useLeanFormat ?
      this.createLeanAnnotation(context, comment) :
      this.createVerboseAnnotation(context, comment);

      // Add messages format for conversation support with explicit metadata
      annotation.messages = [{
        role: 'user',
        text: comment,
        timestamp: annotation.created_at || new Date().toISOString(),
        iteration: 1 // First message is iteration 1
      }];

      // Add reference_images if provided
      if (referenceImages && referenceImages.length > 0) {
        annotation.reference_images = referenceImages;
      }










      // Save annotation through background script
      try {


        const bgResponse = await chrome.runtime.sendMessage({
          action: 'saveAnnotation',
          annotation: annotation
        });







        if (!bgResponse || !bgResponse.success) {
          throw new Error(bgResponse?.error || 'Failed to save annotation');
        }

        // Add to local array
        this.annotations.push(annotation);





      } catch (error) {
        console.error(`[SAVE_ANNOTATION_BG_ERROR] ${Date.now()} - Error saving annotation via background script:`, {
          annotationId: annotation.id,
          error: error.message,
          tempId: tempId
        });

        // Fallback: Call API directly if background script is unavailable
        if (error.message && error.message.includes('Extension context invalidated')) {

          await this.saveAnnotationDirectly(annotation);

          // Add to local array
          this.annotations.push(annotation);





        } else {
          console.error(`[SAVE_ANNOTATION_FAILED] ${Date.now()} - Save failed`);
          throw error;
        }
      }

      // IMPORTANT: Mark element with persistent annotation ID for reliable future lookups
      // This ensures clicking the annotation in the sidebar always returns to the exact same element
      // Also update the selector if it was using a temporary data-pointa-id
      element.setAttribute('data-pointa-id', annotation.id);

      // If selector was using a temporary data-pointa-id, update it to use the permanent one
      if (annotation.selector.includes('data-pointa-id') && !annotation.selector.includes(annotation.id)) {
        const oldSelector = annotation.selector;
        annotation.selector = `[data-pointa-id="${annotation.id}"]`;




        // Update in storage
        this.updateAnnotationInStorage(annotation).catch((err) => {
          console.warn('[SAVE_ANNOTATION_SELECTOR_UPDATE] Failed to update selector:', err);
        });
      }


      // Show visual indicator on element with correct index
      const sortedAnnotations = [...this.annotations].sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
      );
      const index = sortedAnnotations.findIndex((a) => a.id === annotation.id) + 1;







      this.addAnnotationBadge(element, annotation, index);

      // Refresh sidebar to show new annotation







      if (PointaSidebar && PointaSidebar.isOpen) {

        const serverOnline = await PointaSidebar.checkServerStatus();
        await PointaSidebar.updateContent(this, serverOnline);

        // Scroll to the newly created annotation in the sidebar and highlight it
        setTimeout(() => {
          const newAnnotationItem = PointaSidebar.sidebar?.querySelector(`[data-annotation-id="${annotation.id}"]`);
          if (newAnnotationItem) {
            // Scroll into view smoothly
            newAnnotationItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            // Add a brief highlight effect to draw attention to the new annotation
            newAnnotationItem.style.backgroundColor = 'rgba(12, 140, 233, 0.15)';
            newAnnotationItem.style.transition = 'background-color 0.3s ease';
            setTimeout(() => {
              newAnnotationItem.style.backgroundColor = '';
            }, 1500);


          } else {
            console.warn(`[SAVE_ANNOTATION_SCROLL] Could not find annotation item with id ${annotation.id} in sidebar`);
          }
        }, 150); // Slight delay to ensure DOM is updated
      } else {

      }

      const saveEndTime = Date.now();
      const saveDuration = saveEndTime - saveStartTime;










    } catch (error) {
      const saveEndTime = Date.now();
      const saveDuration = saveEndTime - saveStartTime;

      console.error(`[SAVE_ANNOTATION_ERROR] ${saveEndTime} - Save failed:`, {
        tempId: tempId,
        duration: `${saveDuration}ms`,
        error: error.message,
        stack: error.stack
      });

      alert('Error saving annotation. Please try again.');
    }
  }

  async updateAnnotationInStorage(annotation) {
    try {
      // Prepare updates object with all changed fields
      const updates = {
        selector: annotation.selector,
        updated_at: new Date().toISOString()
      };

      // Include scope updates if present (for design-edit annotations)
      if (annotation.scope) {
        updates.scope = annotation.scope;
      }

      try {
        const bgResponse = await chrome.runtime.sendMessage({
          action: 'updateAnnotation',
          id: annotation.id,
          updates: updates
        });

        if (!bgResponse || !bgResponse.success) {
          throw new Error(bgResponse?.error || 'Failed to update annotation');
        }

        // Update local array
        const localIndex = this.annotations.findIndex((a) => a.id === annotation.id);
        if (localIndex !== -1) {
          this.annotations[localIndex] = annotation;
        }
      } catch (error) {
        console.error('Error updating annotation via background script:', error);

        // Fallback: Call API directly if background script is unavailable
        if (error.message && error.message.includes('Extension context invalidated')) {

          await this.updateAnnotationDirectly(annotation.id, updates);

          // Update local array
          const localIndex = this.annotations.findIndex((a) => a.id === annotation.id);
          if (localIndex !== -1) {
            this.annotations[localIndex] = annotation;
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error updating annotation in storage:', error);
      throw error;
    }
  }

  showExistingAnnotations() {
    return this.badgeManager.showExistingAnnotations();
  }

  clearAllBadges() {
    return this.badgeManager.clearAllBadges();
  }

  findElementBySelector(annotation) {
    return VibeElementFinder.findElementBySelector(annotation);
  }

  findByParentChainAndContext(annotation) {
    return VibeElementFinder.findByParentChainAndContext(annotation);
  }

  findByTextContent(context) {
    return VibeElementFinder.findByTextContent(context);
  }

  findByTagClassesAndPosition(context) {
    return VibeElementFinder.findByTagClassesAndPosition(context);
  }

  findByPosition(context) {
    return VibeElementFinder.findByPosition(context);
  }

  findClosestByPosition(elements, expectedPosition) {
    return VibeElementFinder.findClosestByPosition(elements, expectedPosition);
  }

  waitForHydrationAndShowAnnotations() {
    // Wait for framework hydration/initialization to complete
    // This prevents hydration mismatch errors in SSR frameworks (React, Vue, Svelte, etc.)

    const checkForStability = () => {
      // Strategy: Wait for DOM stability rather than framework-specific signals

      // 1. Check if document is fully loaded
      if (document.readyState === 'complete') {
        this.waitForDOMStability();
        return;
      }

      // 2. Wait for load event if not complete
      window.addEventListener('load', () => {
        this.waitForDOMStability();
      }, { once: true });
    };

    checkForStability();

    // Fallback timeout for edge cases
    setTimeout(() => {
      this.showExistingAnnotationsWithRetry();
    }, 8000);
  }

  waitForDOMStability() {
    // Wait for DOM to stabilize after framework hydration/initialization
    let stabilityTimer;
    let mutationCount = 0;
    const maxMutations = 10;
    const stabilityDelay = 300; // Wait for 300ms of stability (reduced from 1500ms)

    // OPTIMIZATION: Try showing annotations immediately first
    // This makes static pages or fast-loading SPAs instant
    setTimeout(() => {
      const foundCount = this.showExistingAnnotations();
      if (foundCount === this.annotations.length) {
        // All annotations found on first try - no need to wait further
        return;
      }
      // Otherwise, continue with stability observer for dynamic pages
    }, 100);

    const observer = new MutationObserver(() => {
      mutationCount++;

      // Reset stability timer on each mutation
      clearTimeout(stabilityTimer);

      // If too many mutations, just proceed (heavily dynamic page)
      if (mutationCount > maxMutations) {
        observer.disconnect();
        setTimeout(() => this.showExistingAnnotationsWithRetry(), 200);
        return;
      }

      // Set new stability timer
      stabilityTimer = setTimeout(() => {
        observer.disconnect();
        this.showExistingAnnotationsWithRetry();
      }, stabilityDelay);
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false // Don't care about attribute changes
    });

    // Trigger initial timer
    stabilityTimer = setTimeout(() => {
      observer.disconnect();
      this.showExistingAnnotationsWithRetry();
    }, stabilityDelay);
  }

  showExistingAnnotationsWithRetry(maxAttempts = 5, delay = 300) {
    let attempts = 0;

    const tryShowAnnotations = () => {
      attempts++;

      const foundElements = this.showExistingAnnotations();
      const expectedCount = this.annotations.length;
      const foundCount = foundElements;


      // If we found all elements or reached max attempts, stop
      if (foundCount === expectedCount || attempts >= maxAttempts) {
        return;
      }

      // Retry after delay (reduced from 500ms to 300ms for faster retries)
      setTimeout(tryShowAnnotations, delay);
    };

    tryShowAnnotations();
  }

  setupDOMObserver() {
    // DISABLED - causing infinite loops with dynamic content
    // If re-enabled, consider using IntersectionObserver or more targeted MutationObserver
    return;
  }

  addAnnotationBadge(element, annotation, index) {
    return this.badgeManager.addAnnotationBadge(element, annotation, index);
  }

  async markAnnotationAsDone(annotationId, badge) {
    return this.badgeManager.markAnnotationAsDone(annotationId, badge);
  }

  async deleteAnnotation(annotationId, badge) {
    return this.badgeManager.deleteAnnotation(annotationId, badge);
  }

  positionBadgeOnBody(element, badge) {
    return this.badgeManager.positionBadgeOnBody(element, badge);
  }

  positionBadgeNextToElement(elementRect, badge) {
    return this.badgeManager.positionBadgeNextToElement(elementRect, badge);
  }

  findNonOverlappingPosition(left, top, badgeSize, currentBadgeId, verticalSpacing) {
    return this.badgeManager.findNonOverlappingPosition(left, top, badgeSize, currentBadgeId, verticalSpacing);
  }

  generateElementId(element) {
    return this.badgeManager.generateElementId(element);
  }

  async showInlineCommentWidget(element, context, annotation = null, badge = null) {
    return PointaAnnotationMode.showInlineCommentWidget(this, element, context, annotation, badge);
  }

  closeInlineCommentWidget(skipReEnable = false) {
    PointaAnnotationMode.closeInlineCommentWidget(this, skipReEnable);
  }

  highlightAnnotation(annotation) {
    try {
      const element = document.querySelector(annotation.selector);
      if (element) {
        // Scroll to element
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight temporarily
        element.style.outline = '3px solid var(--theme-accent)';
        element.style.outlineOffset = '2px';

        setTimeout(() => {
          element.style.outline = '';
          element.style.outlineOffset = '';
        }, 3000);
      }
    } catch (error) {
      console.error('Error highlighting annotation:', error);
    }
  }

  targetAnnotationElement(annotation) {
    try {
      // First, find the original element to scroll to its area
      const element = this.findElementBySelector(annotation);
      if (!element) {
        console.warn('Element not found for annotation:', annotation.selector);
        return;
      }

      // Scroll to the element area first
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Now find the corresponding pin/badge to apply focus state
      const allBadges = document.querySelectorAll('.pointa-badge');
      let targetBadge = null;

      // Find the badge that corresponds to this annotation
      for (const badge of allBadges) {
        const elementId = badge.dataset.originalElementId;
        if (elementId) {
          const originalElement = document.querySelector(`[data-pointa-id="${elementId}"]`);
          if (originalElement === element) {
            targetBadge = badge;
            break;
          }
        }
      }

      if (targetBadge) {
        // Add blue focus state to the pin
        targetBadge.classList.add('pointa-targeted-element');

        // Remove focus state after 3 seconds
        setTimeout(() => {
          targetBadge.classList.remove('pointa-targeted-element');
        }, 3000);
      } else {
        // Fallback: apply focus to the original element if pin not found
        element.classList.add('pointa-targeted-element');
        setTimeout(() => {
          element.classList.remove('pointa-targeted-element');
        }, 3000);
      }
    } catch (error) {
      console.error('Error targeting annotation element:', error);
    }
  }

  showDesignEditor(element, restoreScope = null) {
    VibeDesignEditorUI.showDesignEditor(this, element, restoreScope);
  }

  showDesignEditorForEdit(element, annotation) {
    VibeDesignEditorUI.showDesignEditorForEdit(this, element, annotation);
  }

  calculateScopeOptions(element) {
    return VibeDesignEditorUI.calculateScopeOptions(this, element);
  }

  changeScopeSelection(newScope, editor) {
    VibeDesignEditorUI.changeScopeSelection(this, newScope, editor);
  }

  highlightAffectedElements() {
    VibeDesignEditorUI.highlightAffectedElements(this);
  }

  applyPendingChangesToAllElements() {
    VibeDesignEditorUI.applyPendingChangesToAllElements(this);
  }

  setupDesignEditorListeners(editor, element) {
    VibeDesignEditorUI.setupDesignEditorListeners(this, editor, element);
  }

  showNumberDropdown(input, element) {
    VibeDesignEditorUI.showNumberDropdown(this, input, element);
  }

  showSpacingDropdown(input, element) {
    VibeDesignEditorUI.showSpacingDropdown(this, input, element);
  }

  hideSpacingDropdown() {
    VibeDesignEditorUI.hideSpacingDropdown(this);
  }

  toggleCustomSelect(wrapper, element) {
    VibeDesignEditorUI.toggleCustomSelect(this, wrapper, element);
  }

  showCustomSelectDropdown(wrapper, element) {
    VibeDesignEditorUI.showCustomSelectDropdown(this, wrapper, element);
  }

  applyCustomSelectChange(property, value, element) {
    VibeDesignEditorUI.applyCustomSelectChange(this, property, value, element);
  }

  handleNumericInputArrowKey(input, key, element) {
    VibeDesignEditorUI.handleNumericInputArrowKey(this, input, key, element);
  }

  setupGlobalDropdownListeners() {
    VibeDesignEditorUI.setupGlobalDropdownListeners(this);
  }

  handleToggleButtonClick(button, element, editor) {
    VibeDesignEditorUI.handleToggleButtonClick(this, button, element, editor);
  }

  handlePropertyChange(input, element) {
    VibeDesignEditorUI.handlePropertyChange(this, input, element);
  }

  revertChanges(element) {
    VibeDesignEditorUI.revertChanges(this, element);
  }

  makeEditorDraggable(editor) {
    VibeDesignEditorUI.makeEditorDraggable(editor);
  }

  async submitDesignChanges(element) {
    return await VibeDesignEditorUI.submitDesignChanges(this, element);
  }

  revertDesignChanges(element, annotation) {
    PointaDesignMode.revertDesignChanges(element, annotation, this);
  }

  applyDesignChanges(element, annotation) {
    PointaDesignMode.applyDesignChanges(element, annotation, this);
  }

  showSuccessMessage(message) {
    PointaDesignMode.showSuccessMessage(message);
  }

  // Bug Reporting methods
  async startBugReporting() {
    try {
      // Show recording indicator
      BugReportUI.showRecordingIndicator();

      // Start recording
      await BugRecorder.startRecording();


    } catch (error) {
      console.error('[Pointa] Error starting bug reporting:', error);
      BugReportUI.hideRecordingIndicator();
      alert('Failed to start bug recording. Please try again.');
    }
  }

  async stopBugReporting() {
    try {
      // Stop recording and get data
      const recordingData = await BugRecorder.stopRecording();

      // Hide recording indicator
      BugReportUI.hideRecordingIndicator();

      if (!recordingData) {
        console.warn('[Pointa] No recording data');
        return;
      }

      // Show timeline review
      BugReportUI.showTimelineReview(recordingData);


    } catch (error) {
      console.error('[Pointa] Error stopping bug reporting:', error);
      BugReportUI.hideRecordingIndicator();
      alert('Failed to stop bug recording. Please try again.');
    }
  }

  async saveBugReport(reportData) {
    try {
      const { whatHappened, expectedBehavior, recordingData } = reportData;

      // Generate bug report ID (timestamp-based for uniqueness and readability)
      const bugReportId = `BUG-${Date.now()}`;

      // Extract screenshot data if present (temporary _dataUrl will be saved separately)
      const screenshotDataUrl = recordingData.screenshot?._dataUrl;
      const screenshotMetadata = recordingData.screenshot ? {
        id: recordingData.screenshot.id,
        captured: recordingData.screenshot.captured,
        timestamp: recordingData.screenshot.timestamp
      } : { captured: false };

      // Create bug report structure with recordings array (WITHOUT embedded screenshot)
      const bugReport = {
        id: bugReportId,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        status: 'active',
        report: {
          userDescription: whatHappened,
          expectedBehavior: expectedBehavior
        },
        recordings: [
        {
          iteration: 1,
          timestamp: new Date().toISOString(),
          timeline: recordingData.timeline,
          screenshot: screenshotMetadata,
          replayed: false,
          metadata: {
            startTime: recordingData.metadata.startTime,
            endTime: recordingData.endTime,
            duration: recordingData.duration
          }
        }],

        ai_actions: [],
        context: {
          page: {
            url: window.location.href,
            title: document.title,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            }
          },
          browser: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language
          }
        },
        keyIssues: recordingData.keyIssues
      };

      // Save through background script (with screenshot data separate)
      const response = await chrome.runtime.sendMessage({
        action: 'saveBugReport',
        bugReport: bugReport,
        screenshotDataUrl: screenshotDataUrl // Send screenshot separately for file storage
      });

      if (response && response.success) {


        // CRITICAL: Refresh sidebar immediately to show updated bug report count
        // This ensures the dropdown badge updates without requiring the user to close the confirmation modal
        if (window.PointaSidebar && window.PointaSidebar.isOpen) {

          window.PointaSidebar.isRecordingBug = false;
          window.PointaSidebar.currentView = null;
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(this, serverOnline);

        } else {

        }

        // Show confirmation modal (will also refresh sidebar when closed for extra safety)
        BugReportUI.showConfirmation(bugReportId);
      } else {
        throw new Error(response?.error || 'Failed to save bug report');
      }
    } catch (error) {
      console.error('[Pointa] Error saving bug report:', error);
      alert('Failed to save bug report. Please try again.');
    }
  }

  /**
   * Start performance investigation recording
   */
  async startPerformanceInvestigation() {
    try {
      // Show recording indicator
      PerformanceReportUI.showRecordingIndicator();

      // Start recording
      await PerformanceRecorder.startRecording();


    } catch (error) {
      console.error('[Pointa] Error starting performance investigation:', error);
      PerformanceReportUI.hideRecordingIndicator();
      alert('Failed to start performance recording. Please try again.');
    }
  }

  /**
   * Stop performance investigation recording
   */
  async stopPerformanceInvestigation() {
    try {
      // Stop recording and get data
      const recordingData = await PerformanceRecorder.stopRecording();

      // Hide recording indicator
      PerformanceReportUI.hideRecordingIndicator();

      if (!recordingData) {
        console.warn('[Pointa] No recording data');
        return;
      }

      // Show performance dashboard
      PerformanceReportUI.showPerformanceDashboard(recordingData);


    } catch (error) {
      console.error('[Pointa] Error stopping performance investigation:', error);
      PerformanceReportUI.hideRecordingIndicator();
      alert('Failed to stop performance recording. Please try again.');
    }
  }

  /**
   * Save performance investigation report
   */
  async savePerformanceReport(reportData) {
    try {
      const { description, whenHappens, recordingData } = reportData;

      // Generate performance report ID (timestamp-based, using PERF- prefix)
      const perfReportId = `PERF-${Date.now()}`;

      // Extract screenshot data if present
      const screenshotDataUrl = recordingData.screenshot?._dataUrl;
      const screenshotMetadata = recordingData.screenshot ? {
        id: recordingData.screenshot.id,
        captured: recordingData.screenshot.captured,
        timestamp: recordingData.screenshot.timestamp
      } : { captured: false };

      // Create performance report structure
      const perfReport = {
        id: perfReportId,
        type: 'performance-investigation',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        status: 'active',
        report: {
          userDescription: description,
          whenHappens: whenHappens || null
        },
        performance: {
          resources: recordingData.resources,
          deviceInfo: recordingData.deviceInfo,
          interactions: recordingData.interactions
        },
        insights: recordingData.insights,
        screenshot: screenshotMetadata,
        metadata: recordingData.metadata,
        duration: recordingData.duration
      };

      // Save to background script (which has file system access)
      const response = await chrome.runtime.sendMessage({
        action: 'savePerformanceReport',
        perfReport: perfReport,
        screenshotDataUrl: screenshotDataUrl
      });

      if (response && response.success) {


        // CRITICAL: Refresh sidebar immediately to show updated performance report count
        // This ensures the dropdown badge updates without requiring the user to close the confirmation modal
        if (window.PointaSidebar && window.PointaSidebar.isOpen) {

          window.PointaSidebar.isRecordingBug = false;
          window.PointaSidebar.currentView = null;
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(this, serverOnline);

        } else {

        }

        // Show confirmation modal (will also refresh sidebar when closed for extra safety)
        PerformanceReportUI.showConfirmation(perfReportId);
      } else {
        throw new Error(response?.error || 'Failed to save performance report');
      }
    } catch (error) {
      console.error('[Pointa] Error saving performance report:', error);
      alert('Failed to save performance report. Please try again.');
    }
  }

}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.pointa = new Pointa();
  });
} else {
  window.pointa = new Pointa();
}
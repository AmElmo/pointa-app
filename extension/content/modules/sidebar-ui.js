/**
 * sidebar-ui.js
 * 
 * Manages the Pointa sidebar that replaces the popup UI.
 * The sidebar resizes page content and provides persistent access to annotations.
 */

const PointaSidebar = {
  sidebar: null,
  sidebarWidth: 380,
  isOpen: false,
  isAnimating: false, // Guard flag to prevent overlapping open/close operations
  statusPollInterval: null, // For automatic status updates
  notificationCenterOpen: false, // Track if notification center view is active
  isResizing: false,
  storageListener: null, // Keep reference to storage listener for cleanup
  isRecordingBug: false, // Track if bug recording is active
  sidebarTimerInterval: null, // Timer for bug recording in sidebar
  currentView: null, // Track current view: null, 'bug-report', etc.
  inspirationSavedListener: null, // Keep reference to inspiration saved listener for cleanup
  sidebarWasOpenBeforeInspiration: false, // Track if sidebar was open before entering inspiration mode

  /**
   * Toggle sidebar open/closed
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async toggle(pointa) {
    // Prevent rapid clicking - ignore if animation is in progress
    if (this.isAnimating) {

      return;
    }

    if (this.isOpen) {
      this.close(pointa);
    } else {
      await this.open(pointa);
    }
  },

  /**
   * Open the sidebar
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async open(pointa) {
    // Prevent opening if already open or animating
    if (this.isOpen || this.isAnimating) {

      return;
    }

    // Set animation flag
    this.isAnimating = true;

    // Reset notification center view when opening sidebar
    // (unless already set to true by navigation restore before calling open())
    // This preserves the notification center state when navigating between pages
    if (this.notificationCenterOpen !== true) {
      this.notificationCenterOpen = false;
    }

    // Clean up any residual body styles from previous sidebar sessions
    // Force reset to ensure no white space remains
    document.body.style.removeProperty('margin-right');
    document.body.style.removeProperty('transition');

    // Force to empty string as fallback
    document.body.style.marginRight = '';
    document.body.style.transition = '';

    // Check server status (only makes a request when user opens sidebar)
    // For localhost pages: check via direct health endpoint
    // For non-localhost pages: check via API through background script
    const isLocalhost = PointaUtils.isLocalhostUrl();
    const serverOnline = isLocalhost ?
    await this.checkServerStatus() :
    (await pointa.checkAPIStatus()).connected;

    // Load saved width
    const result = await chrome.storage.local.get(['sidebarWidth']);
    if (result.sidebarWidth) {
      this.sidebarWidth = result.sidebarWidth;
    }

    // Create sidebar container
    this.sidebar = document.createElement('div');
    this.sidebar.id = 'pointa-sidebar';
    this.sidebar.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
    this.sidebar.style.width = `${this.sidebarWidth}px`;

    // Start off-screen for slide-in animation
    this.sidebar.style.transform = 'translateX(100%)';
    // Smooth, slower animation: 0.8s with very smooth ease-out timing
    this.sidebar.style.transition = 'transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    // Build sidebar content
    this.sidebar.innerHTML = this.buildSidebarHTML(pointa, serverOnline);

    // Inject sidebar into page
    document.body.appendChild(this.sidebar);

    // Temporarily set body background to match sidebar theme during animation
    const theme = PointaThemeManager.getEffective();
    const bgColor = theme === 'dark' ? '#0C0E12' : '#f8f9fc';
    document.body.style.backgroundColor = bgColor;

    // Animate body margin and sidebar together with same timing
    document.body.style.transition = 'margin-right 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    document.body.style.marginRight = `${this.sidebarWidth}px`;

    // Trigger slide-in animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.sidebar) {
          this.sidebar.style.transform = 'translateX(0)';
        }
      });
    });

    // Reposition badges during transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pointa.badgeManager) {
          pointa.badgeManager.refreshAllBadgePositions();
        }
      });
    });

    // Mark as open after animation completes (800ms + small buffer)
    setTimeout(() => {
      this.isOpen = true;
      this.isAnimating = false;

      // Restore body background
      document.body.style.backgroundColor = '';

      // Final badge position update
      if (pointa.badgeManager) {
        pointa.badgeManager.refreshAllBadgePositions();
      }
    }, 850);

    // Disable capture mode in inspiration mode when sidebar opens
    if (window.InspirationMode && window.InspirationMode.isActive) {
      window.InspirationMode.disableCaptureMode();
    }

    // Set up event listeners
    this.setupEventListeners(pointa, serverOnline);

    // Set up resize handle
    this.setupResizeHandle(pointa);

    // Set up auto-refresh on annotation changes
    this.setupStorageListener(pointa);

    // Update content based on state
    await this.updateContent(pointa, serverOnline);

    // Start automatic status polling (every 3 seconds)
    // Only starts when user actively opens sidebar
    this.startStatusPolling(pointa);
  },

  /**
   * Close the sidebar
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  close(pointa) {
    // Prevent closing if not open or if animating
    if (!this.isOpen || this.isAnimating || !this.sidebar) {

      return;
    }

    // Set animation flag immediately to prevent rapid clicking
    this.isAnimating = true;

    // Stop status polling
    this.stopStatusPolling();

    // Remove storage listener
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = null;
    }

    // Remove inspiration saved listener
    if (this.inspirationSavedListener) {
      window.removeEventListener('message', this.inspirationSavedListener);
      this.inspirationSavedListener = null;
    }

    // Temporarily set body background to match sidebar theme during animation
    const theme = PointaThemeManager.getEffective();
    const bgColor = theme === 'dark' ? '#0C0E12' : '#f8f9fc';
    document.body.style.backgroundColor = bgColor;

    // Slide out animation with smooth, slower transition
    // Use same timing as open: 0.8s with very smooth ease-out timing
    this.sidebar.style.transition = 'transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    this.sidebar.style.transform = 'translateX(100%)';

    // Reset page margin with same transition timing
    document.body.style.transition = 'margin-right 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    document.body.style.marginRight = '0';

    // Reposition badges during transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pointa.badgeManager) {
          pointa.badgeManager.refreshAllBadgePositions();
        }
      });
    });

    // Remove sidebar and clean up after transition completes (800ms + small buffer)
    setTimeout(() => {
      // Remove the sidebar element
      if (this.sidebar) {
        this.sidebar.remove();
        this.sidebar = null;
      }

      // Clean up body styles
      document.body.style.removeProperty('margin-right');
      document.body.style.removeProperty('transition');
      document.body.style.backgroundColor = '';

      // Final badge position update
      if (pointa.badgeManager) {
        pointa.badgeManager.refreshAllBadgePositions();
      }

      // Mark as closed
      this.isOpen = false;
      this.isAnimating = false;


    }, 850);
  },

  /**
   * Build the sidebar HTML structure
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {boolean} serverOnline - Server connection status
   * @returns {string} HTML string
   */
  buildSidebarHTML(pointa, serverOnline) {
    return `
      <!-- Resize handle -->
      <div class="sidebar-resize-handle" title="Drag to resize"></div>
      
      <div class="sidebar-container">
        <!-- Header -->
        <div class="sidebar-header">
          <div class="sidebar-header-content">
            <div class="sidebar-logo-title">
              <img src="${chrome.runtime.getURL('assets/icons/pointa-icon128.png')}" alt="Pointa" class="sidebar-logo" />
              <div class="sidebar-title-section">
                <h1 class="sidebar-title">Pointa</h1>
                <p class="sidebar-subtitle" id="sidebar-current-route">Loading...</p>
              </div>
            </div>
            <div class="sidebar-header-actions">
              <button id="sidebar-settings-btn" class="sidebar-icon-btn" title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button id="sidebar-close-btn" class="sidebar-icon-btn" title="Close sidebar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Main Content -->
        <div class="sidebar-main" id="sidebar-main">
          <!-- Content will be dynamically updated -->
          <div class="sidebar-loading">Loading...</div>
        </div>
        
        <!-- Footer -->
        <div class="sidebar-footer">
          <div class="sidebar-footer-content">
            <div class="sidebar-status">
              <div id="sidebar-server-status" class="sidebar-server-status" title="Server Status">
                <div class="sidebar-status-indicator ${serverOnline ? 'online' : 'offline'}"></div>
                <span class="sidebar-status-text">${serverOnline ? 'Server online' : 'Server offline'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Set up event listeners for sidebar elements
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {boolean} serverOnline - Server connection status
   */
  setupEventListeners(pointa, serverOnline) {
    // Close button
    const closeBtn = this.sidebar.querySelector('#sidebar-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close(pointa));
    }

    // Settings button
    const settingsBtn = this.sidebar.querySelector('#sidebar-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.showSettings(pointa));
    }
  },

  /**
   * Update sidebar content based on current state
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {boolean} serverOnline - Server connection status
   */
  async updateContent(pointa, serverOnline) {
    const mainContent = this.sidebar.querySelector('#sidebar-main');
    if (!mainContent) return;

    // Update route/subtitle
    this.updateRoute(pointa);

    // CRITICAL: Don't update if we're currently recording a bug
    // This prevents accidental overwrites of the recording UI
    if (this.isRecordingBug) {

      return;
    }

    // Check if we're in bug report mode (not actively recording, just on the intro screen)
    if (this.currentView === 'bug-report') {
      mainContent.innerHTML = this.buildBugReportScreen(false);
      this.setupBugReportListeners(pointa);
      this.updateScrollIndicator();
      return;
    }

    // Check if we're on a localhost/local development URL
    const isLocalhost = PointaUtils.isLocalhostUrl();

    if (!isLocalhost) {
      // Show inspirations view for non-localhost pages
      // Respect serverOnline status (same pattern as localhost)
      if (!serverOnline) {
        // Server offline - show setup/offline state
        mainContent.innerHTML = this.buildInspirationsOfflineView();
        this.setupInspirationsOfflineListeners(pointa);
      } else {
        // Server online - show inspirations list
        mainContent.innerHTML = await this.buildInspirationsView(pointa);
        this.setupInspirationsListeners(pointa);
      }
      // Disable annotation controls (not available for non-localhost)
      this.disableAnnotationControls();
      this.updateScrollIndicator();
      return;
    }

    // Enable annotation controls for localhost pages
    this.enableAnnotationControls();

    // For localhost pages, show normal content based on state
    if (!serverOnline) {
      // Show welcome/setup screen
      mainContent.innerHTML = this.buildWelcomeScreen();
      this.setupWelcomeListeners();
      this.updateScrollIndicator();
    } else {
      // Always show annotations list when server is online
      // This ensures the page navigation dropdown is always visible,
      // even on pages with 0 annotations
      mainContent.innerHTML = await this.buildAnnotationsList(pointa);
      this.setupAnnotationsListeners(pointa);

      // Re-enable and show annotation badges when returning to annotations view
      // BUT only if there's no bug report modal currently open
      if (pointa.badgeManager) {
        const bugModalOpen = window.BugReportUI && window.BugReportUI.currentModal;
        if (!bugModalOpen) {
          pointa.badgeManager.hideBadges = false;
          pointa.badgeManager.showExistingAnnotations();
        }
      }

      this.updateScrollIndicator();
    }
  },

  /**
   * Build inspirations view HTML
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @returns {Promise<string>} HTML string
   */
  async buildInspirationsView(pointa) {
    // Get inspirations from API
    const response = await chrome.runtime.sendMessage({ action: 'getInspirations' });
    const inspirations = response.success ? response.inspirations : [];

    if (inspirations.length === 0) {
      return `
        <div class="sidebar-inspirations-view">
          <div class="sidebar-inspirations-header">
            <button id="start-inspiration-mode-btn" class="sidebar-btn sidebar-btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Capture Element
            </button>
            <h2 class="sidebar-section-title">Inspirations</h2>
          </div>
          
          <div class="sidebar-empty-state">
            <div class="sidebar-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <h3 class="sidebar-empty-title">No inspirations yet</h3>
            <p class="sidebar-empty-text">
              Click "Capture Element" to start saving UI elements from any website for inspiration.
            </p>
          </div>
        </div>
      `;
    }

    // Sort by most recent first
    inspirations.sort((a, b) => new Date(b.created) - new Date(a.created));

    // Store all inspirations for lazy loading
    this.allInspirations = inspirations;
    this.loadedScreenshotIndices = new Set();

    // Initial batch size for lazy loading
    const INITIAL_BATCH_SIZE = 20;
    const initialBatch = inspirations.slice(0, INITIAL_BATCH_SIZE);

    // Fetch screenshot data URLs via background script to avoid browser permission dialogs
    // Only load the first batch initially for performance
    const screenshotDataUrls = {};
    const hoverScreenshotDataUrls = {};
    await Promise.all(initialBatch.map(async (insp, index) => {
      this.loadedScreenshotIndices.add(index);
      // Determine which screenshot to use for thumbnail
      // Priority: base screenshot > desktop > tablet > mobile
      // Must be resilient - check all available states regardless of which ones exist
      let thumbnailFilename = null;

      // First check for base screenshot (works for both responsive and non-responsive)
      if (insp.screenshot?.filename) {
        thumbnailFilename = insp.screenshot.filename;
      }
      // If no base, try responsive states (for new captures that skip base)
      // Check all available states - be resilient to any combination
      else if (insp.screenshot?.states) {
        const states = insp.screenshot.states;
        // Try in priority order: desktop > tablet > mobile
        // But check each one individually to handle cases where only one exists
        if (states.desktop?.filename) {
          thumbnailFilename = states.desktop.filename;
        } else if (states.tablet?.filename) {
          thumbnailFilename = states.tablet.filename;
        } else if (states.mobile?.filename) {
          thumbnailFilename = states.mobile.filename;
        }
      }

      // Fetch thumbnail screenshot
      if (thumbnailFilename) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: thumbnailFilename
          });
          if (response.success && response.dataUrl) {
            screenshotDataUrls[insp.id] = response.dataUrl;
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching screenshot:', error);
        }
      }

      // Fetch hover screenshot if it exists
      if (insp.screenshot?.hoverFilename) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: insp.screenshot.hoverFilename
          });
          if (response.success && response.dataUrl) {
            hoverScreenshotDataUrls[insp.id] = response.dataUrl;
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching hover screenshot:', error);
        }
      }
    }));

    // Store screenshot URLs for lazy loading
    this.screenshotDataUrls = screenshotDataUrls;
    this.hoverScreenshotDataUrls = hoverScreenshotDataUrls;

    // Build inspirations list HTML - render ALL inspirations, even if screenshots aren't loaded yet
    const inspirationsHTML = inspirations.map((insp, index) => {
      const domain = insp.domain || 'unknown';
      const elementType = insp.element?.tagName || 'element';
      const category = insp.element?.category || 'other';
      const screenshotDataUrl = screenshotDataUrls[insp.id] || '';
      const hoverScreenshotDataUrl = hoverScreenshotDataUrls[insp.id] || '';

      // In thumbnail view, ALWAYS show only base state
      let screenshotHTML = '';
      if (screenshotDataUrl) {
        screenshotHTML = `<img src="${screenshotDataUrl}" alt="${elementType}" />`;
      } else if (index < INITIAL_BATCH_SIZE) {
        // If it's in the initial batch and still no screenshot, show "No preview"
        screenshotHTML = '<div class="sidebar-inspiration-thumbnail-placeholder">No preview</div>';
      } else {
        // For items beyond initial batch, show loading placeholder
        screenshotHTML = '<div class="sidebar-inspiration-thumbnail-placeholder sidebar-inspiration-loading" data-inspiration-index="' + index + '">Loading...</div>';
      }

      // Store hover screenshot availability as data attribute for modal/detail view
      const hasHover = hoverScreenshotDataUrl ? 'true' : 'false';

      return `
        <div class="sidebar-inspiration-item" data-inspiration-id="${insp.id}" data-inspiration-index="${index}" data-has-hover="${hasHover}">
          <div class="sidebar-inspiration-thumbnail">
            ${screenshotHTML}
          </div>
          <div class="sidebar-inspiration-details">
            <div class="sidebar-inspiration-header-row">
              <span class="sidebar-inspiration-tag">${elementType}</span>
              <span class="sidebar-inspiration-category">${category}</span>
              ${hoverScreenshotDataUrl ? '<span class="sidebar-inspiration-hover-badge">:hover</span>' : ''}
            </div>
            <div class="sidebar-inspiration-domain">${domain}</div>
            <div class="sidebar-inspiration-actions">
              <button class="sidebar-inspiration-action-btn copy-inspiration-btn" data-inspiration-id="${insp.id}" title="Copy reference">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
          <button class="sidebar-annotation-delete" data-inspiration-id="${insp.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // Get unique domains for filter (Feature 9)
    const uniqueDomains = [...new Set(inspirations.map((insp) => insp.domain))].sort();

    // Get unique categories dynamically from saved inspirations
    const uniqueCategories = [...new Set(inspirations.map((insp) => insp.element?.category).filter(Boolean))].sort();

    return `
      <div class="sidebar-inspirations-view">
        <div class="sidebar-inspirations-header">
          <button id="start-inspiration-mode-btn" class="sidebar-btn sidebar-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Capture Element
          </button>
          <h2 class="sidebar-section-title">Inspirations</h2>
        </div>
        
        <div class="pointa-sidebar-filters">
          <div class="pointa-filter-row">
            ${this.createCustomDropdown('pointa-filter-category', [
    { value: 'all', label: 'All Categories' },
    ...uniqueCategories.map((cat) => ({
      value: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1)
    }))],
    'all', 'pointa-filter-select-wrapper')}
            
            ${this.createCustomDropdown('pointa-filter-domain', [
    { value: 'all', label: 'All Websites' },
    ...uniqueDomains.map((domain) => ({ value: domain, label: domain }))],
    'all', 'pointa-filter-select-wrapper')}
            
            ${this.createCustomDropdown('pointa-filter-states', [
    { value: 'all', label: 'All States' },
    { value: 'hover', label: 'Has Hover' },
    { value: 'focus', label: 'Has Focus' },
    { value: 'static', label: 'Static Only' }],
    'all', 'pointa-filter-select-wrapper')}
          </div>
          
          <div class="pointa-filter-info">
            <span id="pointa-filter-count">Showing ${inspirations.length} inspirations</span>
            <a href="#" id="pointa-clear-filters" class="pointa-filter-clear">Clear filters</a>
          </div>
        </div>
        
        <div class="sidebar-inspirations-list">
          ${inspirationsHTML}
        </div>
      </div>
    `;
  },

  /**
   * Load screenshots for a batch of inspirations (lazy loading)
   * @param {number} startIndex - Starting index
   * @param {number} batchSize - Number of items to load
   */
  async loadInspirationScreenshots(startIndex, batchSize) {
    if (!this.allInspirations) return;

    const endIndex = Math.min(startIndex + batchSize, this.allInspirations.length);
    const batch = this.allInspirations.slice(startIndex, endIndex);

    // Load screenshots for this batch
    await Promise.all(batch.map(async (insp, i) => {
      const index = startIndex + i;

      // Skip if already loaded
      if (this.loadedScreenshotIndices.has(index)) return;

      // Determine which screenshot to use for thumbnail
      let thumbnailFilename = null;

      if (insp.screenshot?.filename) {
        thumbnailFilename = insp.screenshot.filename;
      } else if (insp.screenshot?.states) {
        const states = insp.screenshot.states;
        if (states.desktop?.filename) {
          thumbnailFilename = states.desktop.filename;
        } else if (states.tablet?.filename) {
          thumbnailFilename = states.tablet.filename;
        } else if (states.mobile?.filename) {
          thumbnailFilename = states.mobile.filename;
        }
      }

      // Fetch thumbnail screenshot
      if (thumbnailFilename) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: thumbnailFilename
          });
          if (response.success && response.dataUrl) {
            this.screenshotDataUrls[insp.id] = response.dataUrl;

            // Update the DOM with the loaded screenshot
            const item = this.sidebar.querySelector(`[data-inspiration-index="${index}"]`);
            if (item) {
              const thumbnail = item.querySelector('.sidebar-inspiration-thumbnail');
              if (thumbnail) {
                const img = document.createElement('img');
                img.src = response.dataUrl;
                img.alt = insp.element?.tagName || 'element';
                thumbnail.innerHTML = '';
                thumbnail.appendChild(img);
              }
            }
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching screenshot:', error);
        }
      }

      // Fetch hover screenshot if it exists
      if (insp.screenshot?.hoverFilename) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: insp.screenshot.hoverFilename
          });
          if (response.success && response.dataUrl) {
            this.hoverScreenshotDataUrls[insp.id] = response.dataUrl;

            // Update has-hover attribute
            const item = this.sidebar.querySelector(`[data-inspiration-index="${index}"]`);
            if (item) {
              item.setAttribute('data-has-hover', 'true');

              // Add hover badge if not already present
              const headerRow = item.querySelector('.sidebar-inspiration-header-row');
              if (headerRow && !headerRow.querySelector('.sidebar-inspiration-hover-badge')) {
                const badge = document.createElement('span');
                badge.className = 'sidebar-inspiration-hover-badge';
                badge.textContent = ':hover';
                headerRow.appendChild(badge);
              }
            }
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching hover screenshot:', error);
        }
      }

      this.loadedScreenshotIndices.add(index);
    }));
  },

  /**
   * Setup event listeners for inspirations view
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupInspirationsListeners(pointa) {
    // Start inspiration mode button
    const startBtn = this.sidebar.querySelector('#start-inspiration-mode-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.startInspirationMode(pointa);
      });
    }

    // Click on inspiration item to view details
    const items = this.sidebar.querySelectorAll('.sidebar-inspiration-item');
    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking action buttons
        if (e.target.closest('.sidebar-inspiration-action-btn')) {
          return;
        }

        const inspirationId = item.dataset.inspirationId;
        this.showInspirationModal(inspirationId);
      });
    });

    // Copy inspiration reference buttons
    const copyBtns = this.sidebar.querySelectorAll('.copy-inspiration-btn');
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const inspirationId = btn.dataset.inspirationId;
        await this.copyInspirationReference(inspirationId);
      });
    });

    // Delete inspiration buttons (use same class as annotations)
    const deleteBtns = this.sidebar.querySelectorAll('.sidebar-annotation-delete[data-inspiration-id]');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const inspirationId = btn.dataset.inspirationId;
        this.showInspirationDeleteConfirmation(btn, pointa, inspirationId);
      });
    });

    // Setup lazy loading scroll listener
    const inspirationsList = this.sidebar.querySelector('.sidebar-inspirations-list');
    if (inspirationsList && this.allInspirations && this.allInspirations.length > 20) {
      let isLoading = false;
      const LOAD_BATCH_SIZE = 10;
      const SCROLL_THRESHOLD = 500; // pixels from bottom

      const handleScroll = async () => {
        if (isLoading) return;

        const scrollTop = inspirationsList.scrollTop;
        const scrollHeight = inspirationsList.scrollHeight;
        const clientHeight = inspirationsList.clientHeight;

        // Check if we're near the bottom
        if (scrollHeight - (scrollTop + clientHeight) < SCROLL_THRESHOLD) {
          // Find the next unloaded batch
          const nextUnloadedIndex = this.allInspirations.findIndex((_, i) => !this.loadedScreenshotIndices.has(i));

          if (nextUnloadedIndex !== -1) {
            isLoading = true;


            try {
              await this.loadInspirationScreenshots(nextUnloadedIndex, LOAD_BATCH_SIZE);
            } catch (error) {
              console.error('[Sidebar] Error loading screenshots:', error);
            } finally {
              isLoading = false;
            }
          }
        }
      };

      inspirationsList.addEventListener('scroll', handleScroll);

      // Store the handler so we can remove it later if needed
      this._inspirationsScrollHandler = handleScroll;
    }

    // Filter listeners (Feature 9)
    this.setupFilterListeners(pointa);
  },

  /**
   * Create a custom dropdown to replace native select
   * @param {string} id - Unique ID for the dropdown
   * @param {Array} options - Array of {value, label} objects
   * @param {string} currentValue - Currently selected value
   * @param {string} className - Additional CSS class name
   * @returns {string} HTML string for the custom dropdown
   */
  createCustomDropdown(id, options, currentValue, className = '') {
    const currentOption = options.find((opt) => opt.value === currentValue) || options[0];
    const wrapperClass = `pointa-custom-select-wrapper ${className}`.trim();

    return `
      <div class="${wrapperClass}" data-select-id="${id}">
        <div class="pointa-custom-select-trigger" data-select-id="${id}">
          <span class="pointa-custom-select-value">${PointaUtils.escapeHtml(currentOption.label)}</span>
          <svg class="pointa-custom-select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 4.5 6 7.5 9 4.5"></polyline>
          </svg>
        </div>
        <input type="hidden" id="${id}" value="${currentOption.value}">
      </div>
    `;
  },

  /**
   * Setup custom dropdown event listeners
   * @param {HTMLElement} wrapper - The custom dropdown wrapper element
   * @param {Array} options - Array of {value, label} objects
   * @param {Function} onChange - Callback function when value changes
   */
  setupCustomDropdown(wrapper, options, onChange) {
    const trigger = wrapper.querySelector('.pointa-custom-select-trigger');
    const hiddenInput = wrapper.querySelector('input[type="hidden"]');
    const valueSpan = wrapper.querySelector('.pointa-custom-select-value');

    if (!trigger || !hiddenInput || !valueSpan) return;

    // Store reference to current dropdown and close handler to prevent duplicates
    let currentDropdown = null;
    let closeHandler = null;

    const cleanup = () => {
      if (currentDropdown) {
        currentDropdown.remove();
        currentDropdown = null;
      }
      if (closeHandler) {
        document.removeEventListener('mousedown', closeHandler);
        closeHandler = null;
      }
      trigger.classList.remove('active');
    };

    const toggleDropdown = () => {
      const isActive = trigger.classList.contains('active');

      if (isActive) {
        // Close this dropdown
        cleanup();
        return;
      }

      // Close any other open dropdowns first
      document.querySelectorAll('.pointa-custom-select-trigger.active').forEach((t) => {
        if (t !== trigger) {
          t.classList.remove('active');
        }
      });

      // Remove any existing dropdowns from other selects
      const existingDropdowns = document.querySelectorAll('.pointa-spacing-dropdown');
      existingDropdowns.forEach((d) => d.remove());

      // Clean up any stale handlers
      cleanup();

      // Open this dropdown
      trigger.classList.add('active');

      // Create dropdown
      const dropdown = document.createElement('div');
      dropdown.className = 'pointa-spacing-dropdown';
      dropdown.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
      currentDropdown = dropdown;

      options.forEach((option) => {
        const item = document.createElement('div');
        item.className = 'pointa-spacing-dropdown-item';
        if (option.value === hiddenInput.value) {
          item.classList.add('selected');
        }
        item.textContent = option.label;
        item.setAttribute('data-value', option.value);

        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Update value
          hiddenInput.value = option.value;
          valueSpan.textContent = option.label;

          // Update selected state
          dropdown.querySelectorAll('.pointa-spacing-dropdown-item').forEach((i) => i.classList.remove('selected'));
          item.classList.add('selected');

          // Call onChange callback
          if (onChange) {
            onChange(option.value);
          }

          // Close dropdown
          cleanup();
        });

        dropdown.appendChild(item);
      });

      // Position dropdown below the trigger (using fixed positioning)
      const triggerRect = trigger.getBoundingClientRect();
      dropdown.style.top = `${triggerRect.bottom}px`;
      dropdown.style.left = `${triggerRect.left}px`;
      dropdown.style.width = `${triggerRect.width}px`;

      document.body.appendChild(dropdown);

      // Close dropdown when clicking outside
      closeHandler = (e) => {
        if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
          cleanup();
        }
      };

      // Use requestAnimationFrame to ensure dropdown is rendered before adding listener
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (currentDropdown === dropdown) {
            document.addEventListener('mousedown', closeHandler);
          }
        });
      });
    };

    // Use a flag to prevent duplicate listeners
    if (trigger.dataset.dropdownSetup === 'true') {
      return; // Already set up
    }
    trigger.dataset.dropdownSetup = 'true';

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown();
    });
  },

  /**
   * Setup filter event listeners (Feature 9)
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupFilterListeners(pointa) {
    const categoryWrapper = this.sidebar.querySelector('[data-select-id="pointa-filter-category"]');
    const domainWrapper = this.sidebar.querySelector('[data-select-id="pointa-filter-domain"]');
    const statesWrapper = this.sidebar.querySelector('[data-select-id="pointa-filter-states"]');
    const clearBtn = this.sidebar.querySelector('#pointa-clear-filters');

    if (!categoryWrapper || !domainWrapper || !statesWrapper) return;

    const statesOptions = [
    { value: 'all', label: 'All States' },
    { value: 'hover', label: 'Has Hover' },
    { value: 'focus', label: 'Has Focus' },
    { value: 'static', label: 'Static Only' }];


    // Get all options dynamically from inspirations
    const getFilterOptions = async () => {
      const response = await chrome.runtime.sendMessage({ action: 'getInspirations' });
      const allInspirations = response.success ? response.inspirations : [];

      // Get unique categories dynamically
      const uniqueCategories = [...new Set(allInspirations.map((insp) => insp.element?.category).filter(Boolean))].sort();
      const categoryOptions = [
      { value: 'all', label: 'All Categories' },
      ...uniqueCategories.map((cat) => ({
        value: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1)
      }))];


      // Get unique domains dynamically
      const uniqueDomains = [...new Set(allInspirations.map((insp) => insp.domain).filter(Boolean))].sort();
      const domainOptions = [
      { value: 'all', label: 'All Websites' },
      ...uniqueDomains.map((domain) => ({ value: domain, label: domain }))];


      return { categoryOptions, domainOptions };
    };

    const applyFilters = async () => {
      const categoryInput = categoryWrapper.querySelector('input[type="hidden"]');
      const domainInput = domainWrapper.querySelector('input[type="hidden"]');
      const statesInput = statesWrapper.querySelector('input[type="hidden"]');

      const category = categoryInput ? categoryInput.value : 'all';
      const domain = domainInput ? domainInput.value : 'all';
      const states = statesInput ? statesInput.value : 'all';

      // Get all inspirations
      const response = await chrome.runtime.sendMessage({ action: 'getInspirations' });
      const allInspirations = response.success ? response.inspirations : [];

      // Apply filters
      const filtered = allInspirations.filter((insp) => {
        // Category filter
        if (category !== 'all' && insp.element?.category !== category) {
          return false;
        }

        // Domain filter
        if (domain !== 'all' && insp.domain !== domain) {
          return false;
        }

        // States filter
        if (states === 'hover' && !insp.screenshot?.hover) {
          return false;
        }
        if (states === 'focus' && !insp.metadata?.pseudoStates?.focus) {
          return false;
        }
        if (states === 'static' && (insp.screenshot?.hover || insp.metadata?.pseudoStates)) {
          return false;
        }

        return true;
      });

      // Update count
      const countEl = this.sidebar.querySelector('#pointa-filter-count');
      if (countEl) {
        const showing = filtered.length;
        const total = allInspirations.length;
        countEl.textContent = showing === total ?
        `Showing ${total} inspirations` :
        `Showing ${showing} of ${total} inspirations`;
      }

      // Re-render the list with filtered inspirations
      await this.refreshInspirationsList(pointa, filtered);
    };

    // Setup custom dropdowns with dynamic options
    getFilterOptions().then(({ categoryOptions, domainOptions }) => {
      // Setup category dropdown with dynamic options
      this.setupCustomDropdown(categoryWrapper, categoryOptions, () => {
        applyFilters();
      });

      // Setup domain dropdown with dynamic options
      this.setupCustomDropdown(domainWrapper, domainOptions, () => {
        applyFilters();
      });
    });

    // Setup states dropdown (static options)
    this.setupCustomDropdown(statesWrapper, statesOptions, () => {
      applyFilters();
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // Reset values
        const categoryInput = categoryWrapper.querySelector('input[type="hidden"]');
        const domainInput = domainWrapper.querySelector('input[type="hidden"]');
        const statesInput = statesWrapper.querySelector('input[type="hidden"]');

        if (categoryInput) categoryInput.value = 'all';
        if (domainInput) domainInput.value = 'all';
        if (statesInput) statesInput.value = 'all';

        // Update displayed values
        const categoryValue = categoryWrapper.querySelector('.pointa-custom-select-value');
        const domainValue = domainWrapper.querySelector('.pointa-custom-select-value');
        const statesValue = statesWrapper.querySelector('.pointa-custom-select-value');

        if (categoryValue) categoryValue.textContent = 'All Categories';
        if (domainValue) domainValue.textContent = 'All Websites';
        if (statesValue) statesValue.textContent = 'All States';

        await applyFilters();
      });
    }
  },

  /**
   * Highlight a specific inspiration item in the sidebar
   * @param {string} inspirationId - The ID of the inspiration to highlight
   */
  highlightInspirationItem(inspirationId) {
    if (!this.sidebar || !inspirationId) return;

    // Remove any existing highlights
    const existingHighlights = this.sidebar.querySelectorAll('.sidebar-inspiration-item.highlighted');
    existingHighlights.forEach((item) => {
      item.classList.remove('highlighted');
    });

    // Find the inspiration item
    const inspirationItem = this.sidebar.querySelector(`[data-inspiration-id="${inspirationId}"]`);

    if (inspirationItem) {
      // Add highlighted class
      inspirationItem.classList.add('highlighted');

      // Scroll into view smoothly
      inspirationItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });



      // Remove highlight after 5 seconds
      setTimeout(() => {
        inspirationItem.classList.remove('highlighted');
      }, 5000);
    } else {
      console.warn('[Sidebar] Could not find inspiration item with ID:', inspirationId);
    }
  },

  /**
   * Refresh inspirations list with filtered data (Feature 9)
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {Array} filteredInspirations - Filtered inspirations to display
   */
  async refreshInspirationsList(pointa, filteredInspirations) {
    // Sort by most recent first
    filteredInspirations.sort((a, b) => new Date(b.created) - new Date(a.created));

    // Fetch screenshot data URLs
    const screenshotDataUrls = {};
    const hoverScreenshotDataUrls = {};
    await Promise.all(filteredInspirations.map(async (insp) => {
      // Determine which screenshot to use for thumbnail
      // Priority: base screenshot > desktop > tablet > mobile
      // Must be resilient - check all available states regardless of which ones exist
      let thumbnailFilename = null;

      // First check for base screenshot (works for both responsive and non-responsive)
      if (insp.screenshot?.filename) {
        thumbnailFilename = insp.screenshot.filename;
      }
      // If no base, try responsive states (for new captures that skip base)
      // Check all available states - be resilient to any combination
      else if (insp.screenshot?.states) {
        const states = insp.screenshot.states;
        // Try in priority order: desktop > tablet > mobile
        // But check each one individually to handle cases where only one exists
        if (states.desktop?.filename) {
          thumbnailFilename = states.desktop.filename;
        } else if (states.tablet?.filename) {
          thumbnailFilename = states.tablet.filename;
        } else if (states.mobile?.filename) {
          thumbnailFilename = states.mobile.filename;
        }
      }

      if (thumbnailFilename) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: thumbnailFilename
          });
          if (response.success && response.dataUrl) {
            screenshotDataUrls[insp.id] = response.dataUrl;
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching screenshot:', error);
        }
      }

      if (insp.screenshot?.hoverFilename) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: insp.screenshot.hoverFilename
          });
          if (response.success && response.dataUrl) {
            hoverScreenshotDataUrls[insp.id] = response.dataUrl;
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching hover screenshot:', error);
        }
      }
    }));

    // Build inspirations list HTML
    const inspirationsHTML = filteredInspirations.map((insp) => {
      const domain = insp.domain || 'unknown';
      const elementType = insp.element?.tagName || 'element';
      const category = insp.element?.category || 'other';
      const screenshotDataUrl = screenshotDataUrls[insp.id] || '';
      const hoverScreenshotDataUrl = hoverScreenshotDataUrls[insp.id] || '';

      let screenshotHTML = '';
      if (screenshotDataUrl) {
        screenshotHTML = `<img src="${screenshotDataUrl}" alt="${elementType}" />`;
      } else {
        screenshotHTML = '<div class="sidebar-inspiration-thumbnail-placeholder">No preview</div>';
      }

      const hasHover = hoverScreenshotDataUrl ? 'true' : 'false';

      return `
        <div class="sidebar-inspiration-item" data-inspiration-id="${insp.id}" data-has-hover="${hasHover}">
          <div class="sidebar-inspiration-thumbnail">
            ${screenshotHTML}
          </div>
          <div class="sidebar-inspiration-details">
            <div class="sidebar-inspiration-header-row">
              <span class="sidebar-inspiration-tag">${elementType}</span>
              <span class="sidebar-inspiration-category">${category}</span>
              ${hoverScreenshotDataUrl ? '<span class="sidebar-inspiration-hover-badge">:hover</span>' : ''}
            </div>
            <div class="sidebar-inspiration-domain">${domain}</div>
            <div class="sidebar-inspiration-actions">
              <button class="sidebar-inspiration-action-btn copy-inspiration-btn" data-inspiration-id="${insp.id}" title="Copy reference">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
          <button class="sidebar-annotation-delete" data-inspiration-id="${insp.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // Update the list
    const listEl = this.sidebar.querySelector('.sidebar-inspirations-list');
    if (listEl) {
      listEl.innerHTML = inspirationsHTML || '<div class="sidebar-empty-state"><p>No inspirations match your filters.</p></div>';

      // Re-attach event listeners for the new items
      this.setupInspirationsListeners(pointa);
    }
  },

  /**
   * Build inspirations offline view HTML
   * @returns {string} HTML string
   */
  buildInspirationsOfflineView() {
    return `
      <div class="sidebar-inspirations-view">
        <div class="sidebar-inspirations-header">
          <h2 class="sidebar-section-title">Inspirations</h2>
        </div>
        
        <div class="sidebar-empty-state">
          <div class="sidebar-empty-icon" style="color: #f59e0b;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 class="sidebar-empty-title">Server Offline</h3>
          <p class="sidebar-empty-text">
            Start the server to save and view inspirations. Inspirations are saved locally on your machine.
          </p>
          <button id="setup-server-btn" class="sidebar-btn sidebar-btn-primary" style="margin-top: 16px;">
            Setup Server
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Setup event listeners for inspirations offline view
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupInspirationsOfflineListeners(pointa) {
    const setupBtn = this.sidebar.querySelector('#setup-server-btn');
    if (setupBtn) {
      setupBtn.addEventListener('click', () => {
        // Show the full API offline overlay with instructions
        PointaAnnotationMode.showAPIOfflineOverlay(pointa);
      });
    }
  },

  /**
   * Start inspiration mode
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async startInspirationMode(pointa) {


    // Clear cache and check API status - show overlay if offline
    pointa.clearAPIStatusCache();
    const apiStatus = await pointa.checkAPIStatus();

    if (!apiStatus.connected) {
      // Show offline overlay with instructions to start the server
      PointaAnnotationMode.showAPIOfflineOverlay(pointa);
      return;
    }

    if (window.InspirationMode) {
      // Track if sidebar was open before closing it for inspiration mode
      this.sidebarWasOpenBeforeInspiration = this.isOpen;

      // Close sidebar for full view when capturing element
      if (this.isOpen) {
        this.close(pointa);
      }

      window.InspirationMode.start();

      // Listen for inspiration saved event and cancellation event
      // Remove old listener if it exists
      if (this.inspirationSavedListener) {
        window.removeEventListener('message', this.inspirationSavedListener);
      }

      // Create and store new listener
      this.inspirationSavedListener = async (event) => {
        if (event.data.type === 'INSPIRATION_SAVED') {
          const inspirationId = event.data.inspirationId;


          // Open sidebar if it's closed (so user can see the saved element)
          if (!this.isOpen) {
            await this.open(pointa);
          }

          // Refresh sidebar content immediately
          setTimeout(async () => {
            const isLocalhost = PointaUtils.isLocalhostUrl();
            const serverOnline = isLocalhost ?
            await this.checkServerStatus() :
            (await pointa.checkAPIStatus()).connected;
            await this.updateContent(pointa, serverOnline);

            // Highlight the saved inspiration item in the sidebar
            if (inspirationId) {
              this.highlightInspirationItem(inspirationId);
            }
          }, 600); // Wait for sidebar animation and content refresh
        } else if (event.data.type === 'INSPIRATION_MODE_CANCELLED') {
          // Reopen sidebar if it was open before entering inspiration mode
          if (this.sidebarWasOpenBeforeInspiration && !this.isOpen) {
            await this.open(pointa);
          }
          // Reset the flag
          this.sidebarWasOpenBeforeInspiration = false;
        }
      };

      // Add listener (not "once" - should work for multiple saves)
      window.addEventListener('message', this.inspirationSavedListener);
    } else {
      console.error('[Sidebar] InspirationMode not loaded');
    }
  },

  /**
   * Copy inspiration reference to clipboard
   * @param {string} inspirationId - Inspiration ID
   */
  async copyInspirationReference(inspirationId) {
    try {
      // Get inspiration data
      const response = await chrome.runtime.sendMessage({ action: 'getInspirations' });
      if (!response.success) {
        throw new Error('Failed to get inspirations');
      }

      const inspiration = response.inspirations.find((i) => i.id === inspirationId);
      if (!inspiration) {
        throw new Error('Inspiration not found');
      }

      // Build reference text
      const metadataStr = JSON.stringify(inspiration.metadata, null, 2);

      // Build screenshot section - handle all cases:
      // 1. Base screenshot only
      // 2. Responsive screenshots only (mobile, tablet, desktop)
      // 3. Base + responsive screenshots
      // 4. Base + hover screenshot
      // 5. Responsive + hover screenshot
      // 6. Base + responsive + hover screenshot
      // 7. No screenshots at all

      const baseScreenshotPath = inspiration.screenshot?.absolutePath;
      const hoverScreenshotPath = inspiration.screenshot?.hoverAbsolutePath;
      const responsiveStates = inspiration.screenshot?.states;

      // Check if we have responsive screenshots
      const hasResponsiveScreenshots = responsiveStates && Object.keys(responsiveStates).length > 0;

      // Build screenshot sections
      const screenshotSections = [];

      // Base screenshot (if exists)
      if (baseScreenshotPath) {
        screenshotSections.push(`## Screenshot\nFile: ${baseScreenshotPath}`);
      }

      // Responsive screenshots (if exist)
      if (hasResponsiveScreenshots) {
        const responsiveSections = [];
        const viewportOrder = ['desktop', 'tablet', 'mobile'];

        // Process known viewports in order
        for (const viewport of viewportOrder) {
          if (responsiveStates[viewport]?.absolutePath) {
            const viewportLabel = viewport.charAt(0).toUpperCase() + viewport.slice(1);
            responsiveSections.push(`## ${viewportLabel} Screenshot\nFile: ${responsiveStates[viewport].absolutePath}`);
          }
        }

        // Handle any unexpected viewport names (fallback)
        for (const viewport of Object.keys(responsiveStates)) {
          if (!viewportOrder.includes(viewport) && responsiveStates[viewport]?.absolutePath) {
            const viewportLabel = viewport.charAt(0).toUpperCase() + viewport.slice(1);
            responsiveSections.push(`## ${viewportLabel} Screenshot\nFile: ${responsiveStates[viewport].absolutePath}`);
          }
        }

        if (responsiveSections.length > 0) {
          screenshotSections.push(...responsiveSections);
        }
      }

      // Hover screenshot (if exists)
      if (hoverScreenshotPath) {
        screenshotSections.push(`## Hover State Screenshot\nFile: ${hoverScreenshotPath}`);
      }

      // If no screenshots at all, show a message
      let screenshotSection = '';
      if (screenshotSections.length === 0) {
        screenshotSection = '## Screenshot\nFile: N/A (No screenshot available)';
      } else {
        screenshotSection = screenshotSections.join('\n\n');
      }

      // Count total screenshots for task description
      const totalScreenshots = screenshotSections.length;
      const hasMultipleScreenshots = totalScreenshots > 1;
      const hasHoverScreenshot = !!hoverScreenshotPath;
      const hasResponsiveOnly = hasResponsiveScreenshots && !baseScreenshotPath;

      // Build task description based on available screenshots
      let taskDescription = 'Please reproduce this UI element';

      // Determine screenshot context
      const screenshotContext = [];
      if (hasMultipleScreenshots) {
        screenshotContext.push(`${totalScreenshots} screenshot${totalScreenshots > 1 ? 's' : ''}`);
      } else if (baseScreenshotPath || hasResponsiveScreenshots) {
        screenshotContext.push('screenshot');
      }

      if (screenshotContext.length > 0) {
        taskDescription += ` based on the ${screenshotContext[0]}`;
      }

      // Add context about what types of screenshots are included
      const contextDetails = [];
      if (hasHoverScreenshot) {
        contextDetails.push('hover state');
      }
      if (hasResponsiveOnly) {
        contextDetails.push('different responsive breakpoints');
      }

      if (contextDetails.length > 0) {
        taskDescription += ` (${contextDetails.join(', ')})`;
      }

      taskDescription += ' and styling metadata provided above. Pay attention to the visual design in the screenshot';
      if (hasMultipleScreenshots) {
        taskDescription += 's';
      }
      if (contextDetails.length > 0) {
        taskDescription += ` (${contextDetails.join(', ')})`;
      }
      taskDescription += ' and use the metadata as complementary information for accurate implementation.';

      const referenceText = `# UI Element Inspiration

${screenshotSection}

## Styling Metadata
${metadataStr}

## Task
${taskDescription}`;

      // Copy to clipboard
      await navigator.clipboard.writeText(referenceText);

      // Show success message
      this.showToast('Reference copied to clipboard!', 'success');

    } catch (error) {
      console.error('[Sidebar] Error copying inspiration reference:', error);
      this.showToast('Failed to copy reference', 'error');
    }
  },

  /**
   * Show inline delete confirmation for inspirations (same UI as annotations)
   * @param {HTMLElement} deleteBtn - The delete button that was clicked
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} inspirationId - ID of inspiration to delete
   */
  showInspirationDeleteConfirmation(deleteBtn, pointa, inspirationId) {
    // Remove any existing confirmation
    const existingConfirm = this.sidebar.querySelector('.sidebar-delete-confirm');
    if (existingConfirm) {
      existingConfirm.remove();
    }

    // Create confirmation UI
    const confirm = document.createElement('div');
    confirm.className = 'sidebar-delete-confirm';
    confirm.innerHTML = `
      <span class="sidebar-delete-confirm-text">Delete?</span>
      <button class="sidebar-delete-confirm-yes" data-inspiration-id="${inspirationId}">Yes</button>
      <button class="sidebar-delete-confirm-no">No</button>
    `;

    // Insert after the delete button
    const inspirationItem = deleteBtn.closest('.sidebar-inspiration-item');
    if (inspirationItem) {
      inspirationItem.appendChild(confirm);

      // Position it near the delete button
      const btnRect = deleteBtn.getBoundingClientRect();
      const itemRect = inspirationItem.getBoundingClientRect();
      confirm.style.top = `${btnRect.top - itemRect.top}px`;
      confirm.style.right = '48px'; // Just to the left of delete button
    }

    // Yes button
    const yesBtn = confirm.querySelector('.sidebar-delete-confirm-yes');
    yesBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirm.remove();
      await this.deleteInspiration(pointa, inspirationId);
    });

    // No button
    const noBtn = confirm.querySelector('.sidebar-delete-confirm-no');
    noBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirm.remove();
    });

    // Click outside to cancel
    setTimeout(() => {
      const clickOutside = (e) => {
        if (!confirm.contains(e.target)) {
          confirm.remove();
          document.removeEventListener('click', clickOutside);
        }
      };
      document.addEventListener('click', clickOutside);
    }, 100);
  },

  /**
   * Delete inspiration
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} inspirationId - ID of inspiration to delete
   */
  async deleteInspiration(pointa, inspirationId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'deleteInspiration',
        id: inspirationId
      });

      if (response.success) {
        this.showToast('Inspiration deleted', 'success');

        // Refresh view - check status first
        const isLocalhost = PointaUtils.isLocalhostUrl();
        const serverOnline = isLocalhost ?
        await this.checkServerStatus() :
        (await pointa.checkAPIStatus()).connected;
        await this.updateContent(pointa, serverOnline);
      } else {
        throw new Error(response.error || 'Failed to delete inspiration');
      }
    } catch (error) {
      console.error('[Sidebar] Error deleting inspiration:', error);
      this.showToast('Failed to delete inspiration', 'error');
    }
  },

  /**
   * Show toast notification
   * @param {string} message - Toast message
   * @param {string} type - Toast type (success, error, info)
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `pointa-toast pointa-toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Show toast
    setTimeout(() => {
      toast.classList.add('pointa-toast-show');
    }, 10);

    // Hide and remove toast
    setTimeout(() => {
      toast.classList.remove('pointa-toast-show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  },

  /**
   * Show inspiration modal with full details
   * @param {string} inspirationId - Inspiration ID
   */
  async showInspirationModal(inspirationId) {
    try {
      // Get inspiration data
      const response = await chrome.runtime.sendMessage({ action: 'getInspirations' });
      if (!response.success) {
        throw new Error('Failed to get inspirations');
      }

      const inspiration = response.inspirations.find((i) => i.id === inspirationId);
      if (!inspiration) {
        throw new Error('Inspiration not found');
      }

      // Fetch all available screenshots
      let baseScreenshotDataUrl = '';
      let hoverScreenshotDataUrl = '';
      const responsiveScreenshots = {};

      // Fetch base screenshot if it exists
      if (inspiration.screenshot?.filename) {
        try {
          const screenshotResponse = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: inspiration.screenshot.filename
          });
          if (screenshotResponse.success && screenshotResponse.dataUrl) {
            baseScreenshotDataUrl = screenshotResponse.dataUrl;
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching base screenshot:', error);
        }
      }

      // Fetch hover screenshot if it exists
      if (inspiration.screenshot?.hoverFilename) {
        try {
          const hoverResponse = await chrome.runtime.sendMessage({
            action: 'getInspirationScreenshot',
            filename: inspiration.screenshot.hoverFilename
          });
          if (hoverResponse.success && hoverResponse.dataUrl) {
            hoverScreenshotDataUrl = hoverResponse.dataUrl;
          }
        } catch (error) {
          console.error('[Sidebar] Error fetching hover screenshot:', error);
        }
      }

      // Fetch responsive screenshots if they exist
      if (inspiration.screenshot?.states) {
        const states = inspiration.screenshot.states;
        const viewportOrder = ['desktop', 'tablet', 'mobile'];

        for (const viewport of viewportOrder) {
          if (states[viewport]?.filename) {
            try {
              const response = await chrome.runtime.sendMessage({
                action: 'getInspirationScreenshot',
                filename: states[viewport].filename
              });
              if (response.success && response.dataUrl) {
                responsiveScreenshots[viewport] = response.dataUrl;
              }
            } catch (error) {
              console.error(`[Sidebar] Error fetching ${viewport} screenshot:`, error);
            }
          }
        }
      }

      // Build unified tab system
      // Collect all available tabs: base (always first), hover (if exists), responsive viewports (if exist)
      const tabs = [];
      const screenshots = {};

      // Base tab (always first, default)
      if (baseScreenshotDataUrl) {
        tabs.push({ id: 'base', label: 'Base' });
        screenshots['base'] = baseScreenshotDataUrl;
      }

      // Hover tab (if exists)
      if (hoverScreenshotDataUrl) {
        tabs.push({ id: 'hover', label: 'Hover' });
        screenshots['hover'] = hoverScreenshotDataUrl;
      }

      // Responsive viewport tabs (if exist)
      const viewportOrder = ['desktop', 'tablet', 'mobile'];
      for (const viewport of viewportOrder) {
        if (responsiveScreenshots[viewport]) {
          const viewportLabel = viewport.charAt(0).toUpperCase() + viewport.slice(1);
          tabs.push({ id: viewport, label: viewportLabel });
          screenshots[viewport] = responsiveScreenshots[viewport];
        }
      }

      // Build screenshot section HTML
      let screenshotHTML = '';
      if (tabs.length > 0) {
        // Use tabs if we have any screenshots
        const defaultTab = tabs[0].id; // Base is always first

        // Build tabs
        const tabsHTML = tabs.map((tab) => {
          const isActive = tab.id === defaultTab ? 'active' : '';
          return `
            <button class="pointa-inspiration-modal-viewport-tab ${isActive}" data-tab="${tab.id}">
              ${tab.label}
            </button>
          `;
        }).join('');

        // Build screenshot images (hidden by default, shown via tab click)
        const screenshotsHTML = tabs.map((tab) => {
          const isActive = tab.id === defaultTab ? 'active' : '';
          return `
            <div class="pointa-inspiration-modal-viewport-screenshot ${isActive}" data-tab="${tab.id}">
              <img src="${screenshots[tab.id]}" alt="Element ${tab.label.toLowerCase()} state" />
            </div>
          `;
        }).join('');

        screenshotHTML = `
          <div class="pointa-inspiration-modal-responsive-container">
            <div class="pointa-inspiration-modal-viewport-tabs">
              ${tabsHTML}
            </div>
            <div class="pointa-inspiration-modal-viewport-screenshots">
              ${screenshotsHTML}
            </div>
          </div>
        `;
      } else {
        // No screenshot available
        screenshotHTML = '<div class="pointa-inspiration-modal-no-screenshot">No screenshot available</div>';
      }

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'pointa-inspiration-modal';
      modal.innerHTML = `
        <div class="pointa-inspiration-modal-backdrop"></div>
        <div class="pointa-inspiration-modal-content">
          <div class="pointa-inspiration-modal-header">
            <h2>Inspiration Details</h2>
            <button class="pointa-inspiration-modal-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="pointa-inspiration-modal-body">
            <div class="pointa-inspiration-modal-screenshot">
              ${screenshotHTML}
            </div>
            
            <div class="pointa-inspiration-modal-info">
              <div class="pointa-inspiration-modal-section">
                <h3>Element Info</h3>
                <div class="pointa-inspiration-modal-row">
                  <span class="pointa-inspiration-modal-label">Tag:</span>
                  <span class="pointa-inspiration-modal-value">${inspiration.element?.tagName || 'unknown'}</span>
                </div>
                <div class="pointa-inspiration-modal-row">
                  <span class="pointa-inspiration-modal-label">Category:</span>
                  <span class="pointa-inspiration-modal-value">${inspiration.element?.category || 'other'}</span>
                </div>
                <div class="pointa-inspiration-modal-row">
                  <span class="pointa-inspiration-modal-label">Source:</span>
                  <span class="pointa-inspiration-modal-value pointa-inspiration-modal-value-link">
                    <a href="${inspiration.url}" target="_blank">${inspiration.domain}</a>
                  </span>
                </div>
              </div>
              
              <div class="pointa-inspiration-modal-section">
                <h3>Metadata</h3>
                <div class="pointa-inspiration-modal-metadata-preview">
                  <pre>${JSON.stringify(inspiration.metadata, null, 2)}</pre>
                </div>
              </div>
            </div>
          </div>
          
          <div class="pointa-inspiration-modal-footer">
            <button class="sidebar-btn sidebar-btn-secondary pointa-inspiration-modal-delete" data-inspiration-id="${inspiration.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </button>
            <button class="sidebar-btn sidebar-btn-primary pointa-inspiration-modal-copy" data-inspiration-id="${inspiration.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy Reference
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Show modal with animation
      setTimeout(() => {
        modal.classList.add('pointa-inspiration-modal-show');
      }, 10);

      // Setup modal event listeners
      const closeBtn = modal.querySelector('.pointa-inspiration-modal-close');
      const backdrop = modal.querySelector('.pointa-inspiration-modal-backdrop');
      const deleteBtn = modal.querySelector('.pointa-inspiration-modal-delete');
      const copyBtn = modal.querySelector('.pointa-inspiration-modal-copy');

      // Handle delete with inline confirmation
      let deleteConfirmation = null;
      let clickOutsideHandler = null;

      const cleanupConfirmation = () => {
        if (deleteConfirmation) {
          deleteConfirmation.remove();
          deleteConfirmation = null;
        }
        if (clickOutsideHandler) {
          document.removeEventListener('click', clickOutsideHandler);
          clickOutsideHandler = null;
        }
      };

      const closeModal = () => {
        cleanupConfirmation();
        modal.classList.remove('pointa-inspiration-modal-show');
        setTimeout(() => {
          modal.remove();
        }, 300);
      };

      closeBtn.addEventListener('click', closeModal);
      backdrop.addEventListener('click', closeModal);

      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        // If confirmation already exists, remove it
        if (deleteConfirmation) {
          cleanupConfirmation();
          return;
        }

        // Create confirmation UI
        deleteConfirmation = document.createElement('div');
        deleteConfirmation.className = 'pointa-inspiration-modal-delete-confirm';
        deleteConfirmation.innerHTML = `
          <span class="pointa-inspiration-modal-delete-confirm-text">Delete?</span>
          <button class="pointa-inspiration-modal-delete-confirm-yes">Yes</button>
          <button class="pointa-inspiration-modal-delete-confirm-no">No</button>
        `;

        // Insert right before the delete button (to the left) so delete button doesn't move
        deleteBtn.insertAdjacentElement('beforebegin', deleteConfirmation);

        // Yes button - delete the inspiration
        const yesBtn = deleteConfirmation.querySelector('.pointa-inspiration-modal-delete-confirm-yes');
        yesBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          cleanupConfirmation();
          closeModal();
          await this.deleteInspiration(window.pointa, inspiration.id);
        });

        // No button - cancel
        const noBtn = deleteConfirmation.querySelector('.pointa-inspiration-modal-delete-confirm-no');
        noBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          cleanupConfirmation();
        });

        // Click outside to cancel (but not on backdrop which closes modal)
        setTimeout(() => {
          clickOutsideHandler = (e) => {
            if (deleteConfirmation && !deleteConfirmation.contains(e.target) && e.target !== deleteBtn && !deleteBtn.contains(e.target)) {
              cleanupConfirmation();
            }
          };
          document.addEventListener('click', clickOutsideHandler);
        }, 100);
      });

      copyBtn.addEventListener('click', async () => {
        await this.copyInspirationReference(inspiration.id);
        closeModal();
      });

      // Setup tab switching (if tabs exist)
      const tabButtons = modal.querySelectorAll('.pointa-inspiration-modal-viewport-tab');
      const screenshotContainers = modal.querySelectorAll('.pointa-inspiration-modal-viewport-screenshot');

      if (tabButtons.length > 0) {
        tabButtons.forEach((tab) => {
          tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;

            // Update active tab
            tabButtons.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');

            // Update visible screenshot
            screenshotContainers.forEach((container) => {
              if (container.dataset.tab === tabId) {
                container.classList.add('active');
              } else {
                container.classList.remove('active');
              }
            });
          });
        });
      }

      // ESC to close
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);

    } catch (error) {
      console.error('[Sidebar] Error showing inspiration modal:', error);
      this.showToast('Failed to load inspiration details', 'error');
    }
  },

  /**
   * Build welcome/setup screen HTML
   * @returns {string} HTML string
   */
  buildWelcomeScreen() {
    return `
      <div class="sidebar-welcome">
        <div class="sidebar-welcome-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
          </svg>
        </div>
        <h2 class="sidebar-welcome-title">Welcome to Pointa!</h2>
        <p class="sidebar-welcome-text">
          Pointa gives your AI coding agent superpowers, allowing it to bulk-treat all your visual annotations across different pages, while minding responsiveness.
        </p>
        <button id="sidebar-get-started-btn" class="sidebar-primary-btn">
          Get started (1min)
        </button>
        <div class="sidebar-welcome-note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>Server connection required</span>
        </div>
      </div>
    `;
  },

  /**
   * Build bug report screen HTML
   * @param {boolean} isRecording - Whether recording is currently active
   * @returns {string} HTML string
   */
  buildBugReportScreen(isRecording = false) {
    if (isRecording) {
      return `
        <div class="sidebar-bug-report-container sidebar-bug-recording">
          <!-- Back button disabled during recording -->
          <button id="sidebar-bug-back-btn" class="sidebar-back-btn" disabled style="opacity: 0.5; cursor: not-allowed;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </button>

          <div class="sidebar-bug-report-intro" style="padding: 20px 24px;">
            <div class="sidebar-bug-recording-indicator" style="margin-bottom: 12px;">
              <div class="sidebar-bug-recording-pulse"></div>
              <div class="sidebar-bug-icon">🎬</div>
            </div>
            <h2 class="sidebar-section-title" style="margin-bottom: 8px;">Recording...</h2>
            <p class="sidebar-bug-description" style="margin-bottom: 16px; font-size: 14px;">
              <strong>Reproduce the bug now!</strong>
            </p>
            
            <div class="sidebar-bug-recording-status" style="padding: 16px; margin: 16px 0;">
              <div class="sidebar-bug-recording-timer" id="sidebar-bug-timer" style="font-size: 36px; margin-bottom: 4px;">00:00</div>
              <p class="sidebar-bug-recording-hint" style="font-size: 12px;">Max 30 seconds</p>
            </div>

            <div class="sidebar-bug-capturing" style="margin-bottom: 16px;">
              <h3 style="font-size: 13px; margin-bottom: 8px;">Capturing:</h3>
              <ul class="sidebar-bug-capture-list" style="font-size: 12px;">
                <li style="margin-bottom: 4px;">✓ Console & errors</li>
                <li style="margin-bottom: 4px;">✓ Network activity</li>
                <li style="margin-bottom: 4px;">✓ Interactions</li>
              </ul>
            </div>

            <button id="sidebar-stop-recording-btn" class="sidebar-danger-btn sidebar-bug-record-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
              Stop Recording
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="sidebar-bug-report-container">
        <!-- Back button -->
        <button id="sidebar-bug-back-btn" class="sidebar-back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back
        </button>

        <div class="sidebar-bug-report-intro">
          <div class="sidebar-bug-icon">🐛</div>
          <h2 class="sidebar-section-title">Report a Bug</h2>
          <p class="sidebar-bug-description">
            Record your bug in action! We'll capture:
          </p>
          
          <ul class="sidebar-bug-features-compact">
            <li>🎬 Console errors & warnings</li>
            <li>🌐 Network requests & failures</li>
            <li>🖱️ Your clicks & interactions</li>
            <li>📸 Screenshot of the page</li>
          </ul>
          
          <div class="sidebar-bug-instructions-compact">
            <h3>Quick Start:</h3>
            <ol>
              <li>Click "Start Recording"</li>
              <li>Reproduce the bug (30 sec max)</li>
              <li>Click "Stop" & describe what happened</li>
            </ol>
          </div>

          <button id="sidebar-start-recording-btn" class="sidebar-primary-btn sidebar-bug-record-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
            Start Recording
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Build issue type selector screen HTML
   * @returns {string} HTML string
   */
  buildIssueTypeScreen() {
    return `
      <div class="sidebar-issue-type-container">
        <!-- Back button -->
        <button id="sidebar-issue-type-back-btn" class="sidebar-back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back
        </button>

        <div class="sidebar-issue-type-intro">
          <h2 class="sidebar-section-title">What would you like to report?</h2>
          <p class="sidebar-issue-type-description">
            Choose the type of issue you're experiencing
          </p>
          
          <div class="sidebar-issue-type-options">
            <button id="sidebar-issue-type-bug" class="sidebar-issue-type-option">
              <div class="sidebar-issue-type-icon">🐛</div>
              <div class="sidebar-issue-type-content">
                <h3>Bug Report</h3>
                <p>Report an error or broken feature</p>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
            
            <button id="sidebar-issue-type-performance" class="sidebar-issue-type-option">
              <div class="sidebar-issue-type-icon">⚡</div>
              <div class="sidebar-issue-type-content">
                <h3>Performance Investigation</h3>
                <p>Report slowness or performance issues</p>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Build ready screen HTML
   * @returns {string} HTML string
   */
  buildReadyScreen() {
    return `
      <!-- Quick Action Buttons -->
      <div class="sidebar-quick-actions">
        <button id="sidebar-quick-annotate-btn" class="sidebar-quick-action-btn" data-tooltip="Annotate">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <line x1="9" y1="10" x2="15" y2="10"></line>
            <line x1="12" y1="7" x2="12" y2="13"></line>
          </svg>
          <span>Annotate</span>
          <span class="sidebar-tooltip">Annotate</span>
        </button>
        <button id="sidebar-quick-bug-btn" class="sidebar-quick-action-btn" data-tooltip="Report Issue">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 2v4M16 2v4M9 9h6M9 13h6M9 17h6M3 9l1.5-1.5M3 21l1.5-1.5M21 9l-1.5-1.5M21 21l-1.5-1.5M6 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
          </svg>
          <span>Report Issue</span>
          <span class="sidebar-tooltip">Report Issue</span>
        </button>
      </div>
      
      <div class="sidebar-ready">
        <div class="sidebar-ready-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="16 12 12 8 8 12"></polyline>
            <line x1="12" y1="16" x2="12" y2="8"></line>
          </svg>
        </div>
        <h2 class="sidebar-ready-title">Ready for annotations</h2>
        <p class="sidebar-ready-text">
          Click one of the buttons above to start annotating or designing.
        </p>
      </div>
    `;
  },

  /**
   * Build a single annotation item HTML
   * @param {Object} annotation - Annotation object
   * @param {number} index - Index in the list
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {boolean} isInReviewList - Whether this is in the notification center (to-review list)
   * @returns {string} HTML string for annotation item
   */
  buildAnnotationItemHTML(annotation, index, pointa, isInReviewList) {
    const isDesign = annotation.type === 'design' || annotation.type === 'design-edit';
    const hasImages = annotation.reference_images && annotation.reference_images.length > 0;
    const isInReview = annotation.status === 'in-review';
    const hasPositionChange = isDesign && annotation.css_changes?.dom_position;

    // Check if element exists on the page (only for current page annotations)
    const element = pointa.findElementBySelector(annotation);
    const elementMissing = !element && !isInReviewList;

    // Get preview text - for hybrid annotations, show both comment and design
    let preview;
    const hasComment = annotation.comment || annotation.messages && annotation.messages.length > 0;
    const hasDesignChanges = annotation.css_changes && Object.keys(annotation.css_changes).length > 0;

    if (hasComment && hasDesignChanges) {
      // Hybrid annotation - show both comment and design preview
      const messages = annotation.messages || (annotation.comment ? [{ text: annotation.comment }] : []);
      const latestMessage = messages.length > 0 ? messages[messages.length - 1].text : '';
      const commentPreview = PointaUtils.escapeHtml(latestMessage.substring(0, 60));
      const designPreview = this.getDesignPreview(annotation);

      preview = `
        <div class="sidebar-hybrid-preview">
          <div class="sidebar-hybrid-comment">${commentPreview}${latestMessage.length > 60 ? '...' : ''}</div>
          <div class="sidebar-hybrid-design">${designPreview}</div>
        </div>
      `;
    } else if (isDesign) {
      // Design-only annotation
      preview = this.getDesignPreview(annotation);
    } else {
      // Text-only annotation
      const messages = annotation.messages || (annotation.comment ? [{ text: annotation.comment }] : []);
      const latestMessage = messages.length > 0 ? messages[messages.length - 1].text : 'No text';
      preview = PointaUtils.escapeHtml(latestMessage);
    }

    // Choose action button based on status
    const actionButton = isInReview ?
    `<button class="sidebar-annotation-done" data-annotation-id="${annotation.id}" title="Mark as done">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <polyline points="20 6 9 17 4 12"></polyline>
           </svg>
         </button>` :
    `<button class="sidebar-annotation-delete" data-annotation-id="${annotation.id}" title="Delete">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <polyline points="3 6 5 6 21 6"></polyline>
             <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
           </svg>
         </button>`;

    // Copy button - always shown
    const copyButton = `<button class="sidebar-annotation-copy" data-annotation-id="${annotation.id}" title="Copy reference to clipboard">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
             <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
           </svg>
         </button>`;

    return `
      <div class="sidebar-annotation-item ${isInReviewList ? 'sidebar-annotation-item-cross-page' : ''}" data-annotation-id="${annotation.id}" data-annotation-url="${annotation.url || ''}">
        <div class="sidebar-annotation-number">${index + 1}</div>
        <div class="sidebar-annotation-content">
          <div class="sidebar-annotation-preview">${preview}</div>
          <div class="sidebar-annotation-meta">
            ${isDesign ? '<span class="sidebar-annotation-tag">Design</span>' : ''}
            ${hasPositionChange ? '<span class="sidebar-annotation-tag sidebar-annotation-tag-position" title="Element position was changed">📍 Position</span>' : ''}
            ${hasImages ? `<span class="sidebar-annotation-tag sidebar-annotation-tag-image" title="${annotation.reference_images.length} reference image${annotation.reference_images.length > 1 ? 's' : ''}">📷 ${annotation.reference_images.length}</span>` : ''}
            ${elementMissing ? '<span class="sidebar-annotation-warning" title="Element no longer exists on the page">⚠️ Element was removed</span>' : ''}
            <span class="sidebar-annotation-status ${annotation.status || 'pending'}">${annotation.status || 'pending'}</span>
          </div>
        </div>
        <div class="sidebar-annotation-actions">
          ${copyButton}
          ${actionButton}
        </div>
      </div>
    `;
  },

  /**
   * Build annotations list HTML
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @returns {string} HTML string
   */
  async buildAnnotationsList(pointa) {
    // CRITICAL: Do NOT modify pointa.annotations! Just read from it.
    // The main content script is responsible for loading and managing annotations.
    // The sidebar should only display what's already loaded.

    // Use annotations already loaded in pointa (these are filtered by URL in content.js)
    const annotations = pointa.annotations || [];

    // Load bug reports
    const bugReports = await this.loadBugReports();
    // Include active, debugging, and in-review statuses
    const activeBugReports = bugReports.filter((r) =>
      r.status === 'active' || r.status === 'debugging' || r.status === 'in-review'
    );

    // Get all annotations for page navigation (from API)
    // Request a high limit to ensure we get ALL annotations (default is 50)
    const response = await chrome.runtime.sendMessage({
      action: 'getAnnotations',
      limit: 1000 // High limit to get all annotations
    });
    const allAnnotations = response.success ? response.annotations || [] : [];

    const currentUrl = window.location.href;
    const currentUrlWithoutHash = PointaUtils.getUrlWithoutHash(currentUrl);

    // Debug: Show all unique URLs in the API response
    const uniqueUrls = [...new Set(allAnnotations.map((a) => a.url))];

    // Debug: Show current page annotations from API vs from pointa
    const currentPageAnnotationsFromAPI = allAnnotations.filter((a) =>
    PointaUtils.getUrlWithoutHash(a.url) === currentUrlWithoutHash
    );




















    // DO NOT MODIFY pointa.annotations here! It's already filtered and loaded.

    // Filter annotations by status
    const activeAnnotations = annotations.filter((a) => a.status === 'pending' || !a.status);
    const allToReviewAnnotations = allAnnotations.filter((a) => a.status === 'in-review');

    // Determine which annotations to display based on view mode
    let displayAnnotations;
    let annotationsGroupedByPage = [];

    if (this.notificationCenterOpen) {
      // Notification center mode: show all to-review annotations grouped by page
      const pageGroups = new Map();
      allToReviewAnnotations.forEach((annotation) => {
        const url = annotation.url || currentUrl;
        if (!pageGroups.has(url)) {
          pageGroups.set(url, []);
        }
        pageGroups.get(url).push(annotation);
      });

      // Convert to array for rendering
      annotationsGroupedByPage = Array.from(pageGroups.entries()).map(([url, annotations]) => ({
        url,
        annotations,
        isCurrentPage: url === currentUrl
      }));

      displayAnnotations = allToReviewAnnotations;
    } else {
      // Normal mode: show active annotations for current page only
      displayAnnotations = activeAnnotations;
    }

    // Group ALL annotations by page URL for navigation (show all pages with any active OR to-review)
    const pageGroups = new Map();
    // currentUrl already declared above when filtering annotations

    // Match the filter used in showAskAIModal - only 'pending' or no status annotations
    // This determines if the Ask AI button should be shown
    const allDisplayedAnnotations = allAnnotations.filter((a) => {
      return a.status === 'pending' || !a.status;
    });

    // For page navigation, only include active annotations (not in-review)
    const allNavigationAnnotations = allAnnotations.filter((a) => {
      return a.status === 'pending' || !a.status;
    });

    // Button should show when there are active annotations (for Ask AI button)
    const hasActiveAnnotations = activeAnnotations.length > 0;

    // Debug log to help identify the issue










    allNavigationAnnotations.forEach((annotation) => {
      const url = annotation.url || currentUrl;
      if (!pageGroups.has(url)) {
        pageGroups.set(url, []);
      }
      pageGroups.get(url).push(annotation);
    });

    // Build page navigation dropdown

    const pageNavHTML = this.buildPageNavigation(pageGroups, currentUrl, activeBugReports.length);

    // Build annotation items based on view mode
    let annotationItemsHTML = '';

    if (this.notificationCenterOpen) {
      // Notification center mode: render annotations grouped by page
      if (annotationsGroupedByPage.length === 0) {
        annotationItemsHTML = ''; // Empty state will be handled below
      } else {
        annotationItemsHTML = annotationsGroupedByPage.map((group) => {
          // Parse URL to extract base and path
          const urlObj = new URL(group.url);
          const baseUrl = urlObj.origin; // e.g., "http://localhost:3000"
          const pathname = urlObj.pathname || '/'; // e.g., "/dashboard"

          // Add "Current Page" indicator if applicable
          const pageLabel = group.isCurrentPage ? `${baseUrl} (Current Page)` : baseUrl;

          const groupHTML = group.annotations.map((annotation, index) => {
            return this.buildAnnotationItemHTML(annotation, index, pointa, true);
          }).join('');

          return `
            <div class="sidebar-page-group">
              <div class="sidebar-page-group-header">${PointaUtils.escapeHtml(pageLabel)}</div>
              <div class="sidebar-page-group-url">${PointaUtils.escapeHtml(pathname)}</div>
              ${groupHTML}
            </div>
          `;
        }).join('');
      }
    } else {
      // Normal mode: render active annotations for current page
      annotationItemsHTML = displayAnnotations.map((annotation, index) => {
        return this.buildAnnotationItemHTML(annotation, index, pointa, false);
      }).join('');
    }

    // Legacy code preserved for reference (to be removed after refactor)
    const _legacyAnnotationItems = displayAnnotations.map((annotation, index) => {
      const isDesign = annotation.type === 'design' || annotation.type === 'design-edit';
      const hasImages = annotation.reference_images && annotation.reference_images.length > 0;
      const isInReview = annotation.status === 'in-review';
      const hasPositionChange = isDesign && annotation.css_changes?.dom_position;

      // Check if element exists on the page
      const element = pointa.findElementBySelector(annotation);
      const elementMissing = !element;

      // Get preview text - for hybrid annotations, show both comment and design
      let preview;
      const hasComment = annotation.comment || annotation.messages && annotation.messages.length > 0;
      const hasDesignChanges = annotation.css_changes && Object.keys(annotation.css_changes).length > 0;

      if (hasComment && hasDesignChanges) {
        // Hybrid annotation - show both comment and design preview
        const messages = annotation.messages || (annotation.comment ? [{ text: annotation.comment }] : []);
        const latestMessage = messages.length > 0 ? messages[messages.length - 1].text : '';
        const commentPreview = PointaUtils.escapeHtml(latestMessage.substring(0, 60));
        const designPreview = this.getDesignPreview(annotation);

        preview = `
          <div class="sidebar-hybrid-preview">
            <div class="sidebar-hybrid-comment">${commentPreview}${latestMessage.length > 60 ? '...' : ''}</div>
            <div class="sidebar-hybrid-design">${designPreview}</div>
          </div>
        `;
      } else if (isDesign) {
        // Design-only annotation
        preview = this.getDesignPreview(annotation);
      } else {
        // Text-only annotation
        const messages = annotation.messages || (annotation.comment ? [{ text: annotation.comment }] : []);
        const latestMessage = messages.length > 0 ? messages[messages.length - 1].text : 'No text';
        preview = PointaUtils.escapeHtml(latestMessage);
      }

      // Choose action button based on status
      const actionButton = isInReview ?
      `<button class="sidebar-annotation-done" data-annotation-id="${annotation.id}" title="Mark as done">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polyline points="20 6 9 17 4 12"></polyline>
             </svg>
           </button>` :
      `<button class="sidebar-annotation-delete" data-annotation-id="${annotation.id}" title="Delete">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polyline points="3 6 5 6 21 6"></polyline>
               <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
             </svg>
           </button>`;

      // Copy button - always shown
      const copyButton = `<button class="sidebar-annotation-copy" data-annotation-id="${annotation.id}" title="Copy reference to clipboard">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
               <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
             </svg>
           </button>`;

      return `
        <div class="sidebar-annotation-item" data-annotation-id="${annotation.id}">
          <div class="sidebar-annotation-number">${index + 1}</div>
          <div class="sidebar-annotation-content">
            <div class="sidebar-annotation-preview">${preview}</div>
            <div class="sidebar-annotation-meta">
              ${isDesign ? '<span class="sidebar-annotation-tag">Design</span>' : ''}
              ${hasPositionChange ? '<span class="sidebar-annotation-tag sidebar-annotation-tag-position" title="Element position was changed">📍 Position</span>' : ''}
              ${hasImages ? `<span class="sidebar-annotation-tag sidebar-annotation-tag-image" title="${annotation.reference_images.length} reference image${annotation.reference_images.length > 1 ? 's' : ''}">📷 ${annotation.reference_images.length}</span>` : ''}
              ${elementMissing ? '<span class="sidebar-annotation-warning" title="Element no longer exists on the page">⚠️ Element was removed</span>' : ''}
              <span class="sidebar-annotation-status ${annotation.status || 'pending'}">${annotation.status || 'pending'}</span>
            </div>
          </div>
          <div class="sidebar-annotation-actions">
            ${copyButton}
            ${actionButton}
          </div>
        </div>
      `;
    }).join('');
    // End legacy code

    // Build empty state based on view mode
    let emptyState = '';
    if (this.notificationCenterOpen) {
      if (allToReviewAnnotations.length === 0) {
        emptyState = `<div class="sidebar-empty-state sidebar-empty-state-center">
          <div class="sidebar-empty-state-icon">🔔</div>
          <div class="sidebar-empty-state-title">No annotations to review</div>
          <div class="sidebar-empty-state-text">Let your AI work on annotations, and then they will be changed to "in review" quickly.</div>
        </div>`;
      }
    } else {
      if (displayAnnotations.length === 0) {
        emptyState = `<div class="sidebar-empty-state">No annotations on this page</div>`;
      }
    }

    return `
      <div class="sidebar-annotations-container">
        <!-- Sticky Header Wrapper -->
        <div class="sidebar-sticky-header">
          <!-- Page Navigation -->
          ${pageNavHTML}
          
          <!-- Quick Action Buttons -->
          <div class="sidebar-quick-actions">
            <button id="sidebar-quick-annotate-btn" class="sidebar-quick-action-btn" data-tooltip="Annotate">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M28 16c0 6.627-5.373 12-12 12-1.94 0-3.771-.461-5.393-1.28L4 28l1.28-6.607C4.461 19.771 4 17.94 4 16 4 9.373 9.373 4 16 4s12 5.373 12 12z" fill="currentColor"/>
              </svg>
              <span class="sidebar-tooltip">Annotate</span>
            </button>
            <button id="sidebar-quick-bug-btn" class="sidebar-quick-action-btn" data-tooltip="Report Issue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 2v4M16 2v4M9 9h6M9 13h6M9 17h6M3 9l1.5-1.5M3 21l1.5-1.5M21 9l-1.5-1.5M21 21l-1.5-1.5M6 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
              </svg>
              <span class="sidebar-tooltip">Report Issue</span>
            </button>
            <button id="sidebar-ask-ai-btn" class="sidebar-quick-action-btn sidebar-ask-ai-btn" data-tooltip="Ask AI">
              <img src="${chrome.runtime.getURL('assets/icons/stars.png')}" width="20" height="20" alt="Ask AI" class="sidebar-icon" />
              <span class="sidebar-tooltip">Ask AI</span>
            </button>
            <button id="sidebar-notification-center-btn" class="sidebar-quick-action-btn ${this.notificationCenterOpen ? 'active' : ''}" data-tooltip="To Review">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              ${allToReviewAnnotations.length > 0 ? `<span class="sidebar-notification-badge">${allToReviewAnnotations.length}</span>` : ''}
              <span class="sidebar-tooltip">To Review</span>
            </button>
          </div>
          
          ${this.notificationCenterOpen ? `
          <div class="sidebar-notification-center-header">
            <button id="sidebar-back-btn" class="sidebar-back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"></path>
              </svg>
              Back
            </button>
            <h3 class="sidebar-section-title">To Review (${allToReviewAnnotations.length})</h3>
          </div>
          ` : ''}
        </div>
        
        ${emptyState}
        <div class="sidebar-annotations-list">
          ${annotationItemsHTML}
        </div>
      </div>
    `;
  },

  /**
   * Load bug reports from file storage via background script
   * @returns {Promise<Array>} Array of bug reports
   */
  async loadBugReports() {
    try {

      // Request bug reports from background script (which uses file storage)
      const response = await chrome.runtime.sendMessage({
        action: 'getBugReports',
        status: 'all' // Get all bug reports
      });

      if (!response.success) {
        console.error('[Sidebar] Error loading bug reports:', response.error);
        return [];
      }

      const bugReports = response.bugReports || [];








      return bugReports;
    } catch (error) {
      console.error('[Sidebar] Error loading bug reports:', error);
      return [];
    }
  },

  /**
   * Build bug reports list HTML
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @returns {Promise<string>} HTML string
   */
  async buildBugReportsList(pointa) {
    const bugReports = await this.loadBugReports();
    // Include active, debugging, and in-review statuses
    const activeBugReports = bugReports.filter((r) =>
    r.status === 'active' || r.status === 'debugging' || r.status === 'in-review'
    );

    if (activeBugReports.length === 0) {
      return `
        <div class="sidebar-annotations-container">
          <div class="sidebar-sticky-header">
            <button id="sidebar-back-to-annotations" class="sidebar-back-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              Back
            </button>
            
            <h2 class="sidebar-section-title">Issue Reports</h2>
          </div>
          <div class="sidebar-empty-state">No bug reports yet</div>
        </div>
      `;
    }

    const bugReportItems = activeBugReports.map((report, index) => {
      const created = new Date(report.created);
      const timeAgo = this.formatTimeAgo(created);
      const description = report.report?.userDescription || report.report?.description || 'No description';
      const isPerformance = report.type === 'performance-investigation';
      const errorCount = isPerformance ? report.insights?.issues?.length || 0 : report.keyIssues?.length || 0;
      const statusBadge = this.getBugStatusBadge(report.status, report.needs_more_logging);
      const iterationCount = report.recordings?.length || 1;

      // Match annotation item structure exactly
      return `
        <div class="sidebar-annotation-item" data-bug-id="${report.id}" data-report-type="${report.type || 'bug-report'}">
          <div class="sidebar-annotation-number">${index + 1}</div>
          <div class="sidebar-annotation-content">
            <div class="sidebar-annotation-preview">${PointaUtils.escapeHtml(description.substring(0, 100))}${description.length > 100 ? '...' : ''}</div>
            <div class="sidebar-annotation-meta">
              ${isPerformance ?
      `<span class="sidebar-annotation-tag sidebar-perf-tag">⚡ Performance</span>` :
      `<span class="sidebar-annotation-tag sidebar-bug-tag">${statusBadge}</span>`}
              ${
      iterationCount > 1 ? `<span class="sidebar-annotation-tag">📹 ${iterationCount} recordings</span>` : ''}
              ${errorCount > 0 ? `<span class="sidebar-annotation-tag">⚠️ ${errorCount} issue${errorCount > 1 ? 's' : ''}</span>` : ''}
              ${isPerformance && report.performance?.score ? `<span class="sidebar-annotation-tag">📊 Score: ${report.performance.score}</span>` : ''}
              ${report.visual?.screenshot?.captured || report.screenshot?.captured || report.recordings && report.recordings[0]?.screenshot?.captured ? '<span class="sidebar-annotation-tag">📷 Screenshot</span>' : ''}
              <span class="sidebar-annotation-status">${timeAgo}</span>
            </div>
          </div>
          <button class="sidebar-annotation-delete" data-bug-id="${report.id}" title="Delete bug report">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    return `
      <div class="sidebar-annotations-container">
        <div class="sidebar-sticky-header">
          <button id="sidebar-back-to-annotations" class="sidebar-back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </button>
          
          <h2 class="sidebar-section-title">Issue Reports (${activeBugReports.length})</h2>
        </div>
        <div class="sidebar-annotations-list">
          ${bugReportItems}
        </div>
      </div>
    `;
  },

  /**
   * Format time ago (e.g., "2 hours ago")
   * @param {Date} date - The date to format
   * @returns {string} Formatted time string
   */
  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;

    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  },

  /**
   * Get bug status badge text
   * @param {string} status - Bug status
   * @param {boolean} needsMoreLogging - Whether bug needs more logging
   * @returns {string} Badge text
   */
  getBugStatusBadge(status, needsMoreLogging = false) {
    if (needsMoreLogging && status === 'active') {
      return '🔍 Needs More Logging';
    }

    switch (status) {
      case 'active':
        return '🐛 Active';
      case 'debugging':
        return '🔄 Ready to Re-Run';
      case 'in-review':
        return '🔧 Fix Ready';
      case 'resolved':
        return '✅ Resolved';
      default:
        return '🐛 Bug Report';
    }
  },

  /**
   * Show bug reports list
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async showBugReportsList(pointa) {
    const mainContent = this.sidebar.querySelector('#sidebar-main');
    if (!mainContent) return;

    // Hide annotation badges when viewing bug reports and prevent them from showing
    if (pointa.badgeManager) {
      pointa.badgeManager.hideBadges = true;
      pointa.badgeManager.clearAllBadges();
    }

    mainContent.innerHTML = await this.buildBugReportsList(pointa);
    this.setupBugReportsListeners(pointa);
  },

  /**
   * Set up listeners for bug reports list
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupBugReportsListeners(pointa) {
    // Back button
    const backBtn = this.sidebar.querySelector('#sidebar-back-to-annotations');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        const serverOnline = await this.checkServerStatus();
        await this.updateContent(pointa, serverOnline);
      });
    }

    // Click on bug report items to view details
    const bugReportItems = this.sidebar.querySelectorAll('.sidebar-annotation-item[data-bug-id]');
    bugReportItems.forEach((item) => {
      item.addEventListener('click', async (e) => {
        // Don't trigger if clicking delete button or its children
        if (e.target.closest('.sidebar-annotation-delete')) {
          return;
        }

        const bugId = item.dataset.bugId;
        const reportType = item.dataset.reportType;

        // Show appropriate modal based on report type
        if (reportType === 'performance-investigation') {
          await this.showPerformanceReportDetails(bugId);
        } else {
          await this.showBugReportDetails(bugId);
        }
      });
    });

    // Delete buttons (use the same class as annotations)
    const deleteButtons = this.sidebar.querySelectorAll('.sidebar-annotation-delete[data-bug-id]');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const bugId = btn.dataset.bugId;

        // Show inline confirmation (same UI as annotations)
        this.showBugReportDeleteConfirmation(btn, pointa, bugId);
      });
    });
  },

  /**
   * Delete a bug report
   * @param {string} bugId - ID of bug report to delete
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async deleteBugReport(bugId, pointa) {
    try {
      // Delete through background script (which also syncs from API)
      const response = await chrome.runtime.sendMessage({
        action: 'deleteBugReport',
        id: bugId
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to delete bug report');
      }



      // Refresh the bug reports list
      await this.showBugReportsList(pointa);
    } catch (error) {
      console.error('[Sidebar] Error deleting bug report:', error);
      alert('Failed to delete bug report. Please try again.');
    }
  },

  /**
   * Show bug report details in modal
   * @param {string} bugId - ID of bug report to display
   */
  async showBugReportDetails(bugId) {
    try {
      // Load bug reports from storage
      const bugReports = await this.loadBugReports();
      const bugReport = bugReports.find((r) => r.id === bugId);

      if (!bugReport) {
        console.error('[Sidebar] Bug report not found:', bugId);
        return;
      }

      // Register modal with central manager
      if (window.PointaModalManager) {
        window.PointaModalManager.registerModal('bug-details');
      }

      const modal = document.createElement('div');
      modal.className = 'pointa-comment-modal bug-report-modal';
      modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

      // Format date
      const created = new Date(bugReport.created);
      const dateStr = created.toLocaleString();

      // Get key data
      const description = bugReport.report?.userDescription || 'No description';
      const expectedBehavior = bugReport.report?.expectedBehavior || 'Not specified';
      // Get timeline from first recording (or legacy timeline)
      const timeline = bugReport.recordings?.[0]?.timeline || bugReport.timeline;
      const keyIssues = bugReport.keyIssues || [];

      // Generate timeline HTML
      const timelineHTML = timeline?.events ? this.generateBugTimelineHTML(timeline) : '<p class="bug-no-timeline">No timeline data available.</p>';

      modal.innerHTML = `
        <div class="pointa-comment-modal-content bug-report-modal-content">
          <div class="pointa-comment-modal-header">
            <h3 class="pointa-comment-modal-title">🐛 Bug Report Details</h3>
            <button class="pointa-comment-modal-close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="bug-details-container">
            ${bugReport.needs_more_logging ? `
              <div class="bug-action-section" style="border-color: #f59e0b; background: rgba(245, 158, 11, 0.1);">
                <h4>🔍 Needs More Logging</h4>
                <p class="bug-action-notes">Previous fix attempt failed. AI should add console.log statements and debugging output before attempting another fix.</p>
                <p class="bug-action-hint"><strong>Failed attempts:</strong> ${bugReport.failed_fix_attempts || 1}</p>
              </div>
            ` : ''}
            ${this.renderBugStatusActions(bugReport)}
            
            <div class="bug-detail-section">
              <h4 class="bug-detail-label">Bug ID</h4>
              <p class="bug-confirmation-id">${bugReport.id}</p>
              <p class="bug-detail-meta">${dateStr}</p>
            </div>
            
            ${bugReport.visual?.screenshot?.captured ? `
              <div class="bug-detail-section">
                <h4 class="bug-detail-label">Screenshot</h4>
                <div class="bug-screenshot-info">
                  <p>📷 Screenshot captured and saved to disk</p>
                  <p class="bug-screenshot-path">Location: ~/.pointa/bug_screenshots/${bugReport.visual.screenshot.id}.png</p>
                </div>
              </div>
            ` : ''}
            
            <div class="bug-detail-section">
              <h4 class="bug-detail-label">What Happened</h4>
              <p class="bug-detail-text">${PointaUtils.escapeHtml(description)}</p>
            </div>
            
            <div class="bug-detail-section">
              <h4 class="bug-detail-label">Expected Behavior</h4>
              <p class="bug-detail-text">${PointaUtils.escapeHtml(expectedBehavior)}</p>
            </div>
            
            ${timeline ? `
              <div class="bug-detail-section">
                <h4 class="bug-detail-label">Timeline Summary</h4>
                <div class="bug-timeline-summary">
                  <div class="bug-summary-stat">
                    <span class="bug-summary-icon">🖱️</span>
                    <span class="bug-summary-value">${timeline.summary?.userInteractions || 0}</span>
                    <span class="bug-summary-label">interactions</span>
                  </div>
                  <div class="bug-summary-stat">
                    <span class="bug-summary-icon">🌐</span>
                    <span class="bug-summary-value">${timeline.summary?.networkRequests || 0}</span>
                    <span class="bug-summary-label">requests</span>
                  </div>
                  <div class="bug-summary-stat ${(timeline.summary?.networkFailures || 0) > 0 ? 'bug-summary-error' : ''}">
                    <span class="bug-summary-icon">⚠️</span>
                    <span class="bug-summary-value">${timeline.summary?.networkFailures || 0}</span>
                    <span class="bug-summary-label">failures</span>
                  </div>
                  <div class="bug-summary-stat ${(timeline.summary?.consoleErrors || 0) > 0 ? 'bug-summary-error' : ''}">
                    <span class="bug-summary-icon">🔴</span>
                    <span class="bug-summary-value">${timeline.summary?.consoleErrors || 0}</span>
                    <span class="bug-summary-label">errors</span>
                  </div>
                  <div class="bug-summary-stat ${(timeline.summary?.consoleWarnings || 0) > 0 ? 'bug-summary-warning' : ''}">
                    <span class="bug-summary-icon">⚠️</span>
                    <span class="bug-summary-value">${timeline.summary?.consoleWarnings || 0}</span>
                    <span class="bug-summary-label">warnings</span>
                  </div>
                  <div class="bug-summary-stat">
                    <span class="bug-summary-icon">💬</span>
                    <span class="bug-summary-value">${timeline.summary?.consoleLogs || 0}</span>
                    <span class="bug-summary-label">logs</span>
                  </div>
                </div>
              </div>
            ` : ''}
            
            ${keyIssues.length > 0 ? `
              <div class="bug-detail-section">
                <h4 class="bug-detail-label">🎯 Key Issues Detected</h4>
                <ul class="bug-issues-list">
                  ${keyIssues.map((issue) => `
                    <li class="bug-issue-item ${issue.severity}">
                      <span class="bug-issue-type">${this.getBugIssueIcon(issue.type)}</span>
                      <span class="bug-issue-desc">${PointaUtils.escapeHtml(issue.description)}</span>
                      ${issue.isRootCause ? '<span class="bug-root-cause-badge">Root Cause</span>' : ''}
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${timeline?.events ? `
              <div class="bug-detail-section">
                <h4 class="bug-detail-label">Event Timeline</h4>
                <div class="bug-timeline-events">
                  ${timelineHTML}
                </div>
              </div>
            ` : ''}
          </div>
          
          <div class="pointa-comment-actions">
            <button class="pointa-btn pointa-btn-primary" id="bug-details-close">Close</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Set up event listeners
      const closeBtn = modal.querySelector('.pointa-comment-modal-close');
      const doneBtn = modal.querySelector('#bug-details-close');

      const closeModal = () => {
        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('bug-details');
        }
        modal.remove();
      };

      closeBtn.addEventListener('click', closeModal);
      doneBtn.addEventListener('click', closeModal);

      // Auto-replay button
      const autoReplayBtn = modal.querySelector('#auto-replay-btn');
      if (autoReplayBtn) {
        autoReplayBtn.addEventListener('click', async () => {
          closeModal();
          await BugReplayEngine.autoReplay(bugReport);
        });
      }

      // Mark fixed button
      const markFixedBtn = modal.querySelector('#mark-fixed-btn');
      if (markFixedBtn) {
        markFixedBtn.addEventListener('click', async () => {
          await this.markBugResolved(bugReport.id);
          closeModal();
        });
      }

      // Reopen button
      const reopenBtn = modal.querySelector('#reopen-bug-btn');
      if (reopenBtn) {
        reopenBtn.addEventListener('click', async () => {
          await this.reopenBug(bugReport.id);
          closeModal();
        });
      }

      // Close on escape key
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);

      // Close on backdrop click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal();
          document.removeEventListener('keydown', escHandler);
        }
      });

    } catch (error) {
      console.error('[Sidebar] Error showing bug report details:', error);
      alert('Failed to load bug report details. Please try again.');
    }
  },

  /**
   * Render bug status action buttons based on status
   * @param {Object} bugReport - Bug report object
   * @returns {string} HTML string
   */
  renderBugStatusActions(bugReport) {
    if (bugReport.status === 'debugging') {
      const lastAction = bugReport.ai_actions?.[bugReport.ai_actions.length - 1];
      return `
        <div class="bug-action-section bug-debugging-section">
          <h4>🔄 AI Added Debugging</h4>
          <p class="bug-action-notes">${PointaUtils.escapeHtml(lastAction?.notes || 'Debugging code added')}</p>
          <p class="bug-action-hint"><strong>What to look for:</strong> ${PointaUtils.escapeHtml(lastAction?.what_to_look_for || 'Check new console logs')}</p>
          <button class="pointa-btn pointa-btn-primary" id="auto-replay-btn">
            ▶️ Auto-Replay & Capture (Iteration ${(bugReport.recordings?.length || 0) + 1})
          </button>
        </div>
      `;
    }

    if (bugReport.status === 'in-review') {
      const lastAction = bugReport.ai_actions?.[bugReport.ai_actions.length - 1];
      return `
        <div class="bug-action-section bug-review-section">
          <h4>🔧 AI Resolution</h4>
          <p class="bug-action-notes">${PointaUtils.escapeHtml(lastAction?.notes || 'Fix ready for testing')}</p>
          ${lastAction?.changes_made && lastAction.changes_made.length > 0 ? `
            <ul class="bug-changes-list">
              ${lastAction.changes_made.map((change) => `<li>${PointaUtils.escapeHtml(change)}</li>`).join('')}
            </ul>
          ` : ''}
          <div class="bug-review-actions">
            <button class="pointa-btn pointa-btn-success" id="mark-fixed-btn">✅ Works!</button>
            <button class="pointa-btn pointa-btn-secondary" id="reopen-bug-btn">❌ Not working, need more logging</button>
          </div>
        </div>
      `;
    }

    return '';
  },

  /**
   * Mark bug as resolved
   * @param {string} bugId - Bug ID
   */
  async markBugResolved(bugId) {
    try {
      const bugReports = await this.loadBugReports();
      const bug = bugReports.find((r) => r.id === bugId);
      if (!bug) {
        console.error('[Sidebar] Bug not found:', bugId);
        return;
      }

      bug.status = 'resolved';
      bug.updated = new Date().toISOString();
      bug.resolved_at = new Date().toISOString();

      // Update via background script
      const response = await chrome.runtime.sendMessage({
        action: 'updateBugReport',
        bugReport: bug
      });

      if (response && response.success) {

        // Stay on bug reports view after marking as resolved
        await this.showBugReportsList(window.pointa);
      } else {
        throw new Error(response?.error || 'Failed to update bug report');
      }
    } catch (error) {
      console.error('[Sidebar] Error marking bug as resolved:', error);
      alert('Failed to update bug report. Please try again.');
    }
  },

  /**
   * Reopen bug (set back to active)
   * @param {string} bugId - Bug ID
   */
  async reopenBug(bugId) {
    try {
      const bugReports = await this.loadBugReports();
      const bug = bugReports.find((r) => r.id === bugId);
      if (!bug) {
        console.error('[Sidebar] Bug not found:', bugId);
        return;
      }

      // Track the failed fix attempt
      const lastAction = bug.ai_actions?.[bug.ai_actions.length - 1];
      if (!bug.ai_actions) {
        bug.ai_actions = [];
      }

      bug.ai_actions.push({
        timestamp: new Date().toISOString(),
        type: 'fix_failed',
        notes: 'User tested fix but issue persists. Need to add more logging to understand the problem.',
        previous_attempt: lastAction ? {
          type: lastAction.type,
          notes: lastAction.notes
        } : null
      });

      // Set status and flags
      bug.status = 'active';
      bug.needs_more_logging = true;
      bug.failed_fix_attempts = (bug.failed_fix_attempts || 0) + 1;
      bug.updated = new Date().toISOString();

      // Update via background script
      const response = await chrome.runtime.sendMessage({
        action: 'updateBugReport',
        bugReport: bug
      });

      if (response && response.success) {

        // Stay on bug reports view after reopening bug
        await this.showBugReportsList(window.pointa);
      } else {
        throw new Error(response?.error || 'Failed to update bug report');
      }
    } catch (error) {
      console.error('[Sidebar] Error reopening bug:', error);
      alert('Failed to update bug report. Please try again.');
    }
  },

  /**
   * Generate timeline HTML for bug report modal
   * @param {Object} timeline - Timeline data
   * @returns {string} HTML string
   */
  generateBugTimelineHTML(timeline) {
    if (!timeline.events || timeline.events.length === 0) {
      return '<p class="bug-no-timeline">No timeline events recorded.</p>';
    }

    return timeline.events.map((event) => {
      const timeStr = BugRecorder.formatRelativeTime(event.relativeTime);
      const icon = this.getBugEventIcon(event);
      const description = this.getBugEventDescription(event);
      const cssClass = `bug-timeline-event ${event.severity}`;

      return `
        <div class="${cssClass}">
          <span class="bug-event-time">${timeStr}</span>
          <span class="bug-event-icon">${icon}</span>
          <span class="bug-event-desc">${description}</span>
        </div>
      `;
    }).join('');
  },

  /**
   * Get icon for bug event type
   * @param {Object} event - Event object
   * @returns {string} Icon emoji
   */
  getBugEventIcon(event) {
    switch (event.type) {
      case 'recording-start':return '🎬';
      case 'recording-end':return '⏹️';
      case 'user-interaction':
        if (event.subtype === 'click') return '🖱️';
        if (event.subtype === 'input') return '⌨️';
        if (event.subtype === 'keypress') return '🔤';
        return '👆';
      case 'network':
        if (event.subtype === 'failed') return '❌';
        return '✓';
      case 'console-error':return '🔴';
      case 'console-warning':return '⚠️';
      case 'console-log':return '💬';
      default:return '•';
    }
  },

  /**
   * Get description for bug event
   * @param {Object} event - Event object
   * @returns {string} Description text
   */
  getBugEventDescription(event) {
    switch (event.type) {
      case 'recording-start':
        return 'Recording started';
      case 'recording-end':
        return 'Recording stopped';
      case 'user-interaction':
        if (event.subtype === 'click') {
          const elem = event.data.element;
          const desc = elem.textContent || elem.id || elem.tagName;
          return `Clicked "${PointaUtils.escapeHtml(desc.substring(0, 50))}"`;
        }
        if (event.subtype === 'input') {
          return `Input to ${event.data.element.tagName}`;
        }
        if (event.subtype === 'keypress') {
          return `Pressed ${event.data.key}`;
        }
        return 'User interaction';
      case 'network':
        const statusOrError = event.data.status || event.data.error || 'Network Error';
        const truncUrl = this.truncateUrl(event.data.url);
        if (event.subtype === 'failed') {
          return `${event.data.method} ${truncUrl} - Failed (${statusOrError})`;
        }
        return `${event.data.method} ${truncUrl} - ${event.data.status}`;
      case 'console-error':
        return PointaUtils.escapeHtml(this.truncateText(event.data.message, 100));
      case 'console-warning':
        return PointaUtils.escapeHtml(this.truncateText(event.data.message, 100));
      case 'console-log':
        return PointaUtils.escapeHtml(this.truncateText(event.data.message, 100));
      default:
        return 'Event';
    }
  },

  /**
   * Get icon for bug issue type
   * @param {string} type - Issue type
   * @returns {string} Icon emoji
   */
  getBugIssueIcon(type) {
    switch (type) {
      case 'console-error':return '🔴';
      case 'network-failure':return '🌐';
      default:return '⚠️';
    }
  },

  /**
   * Truncate URL for display
   * @param {string} url - URL to truncate
   * @returns {string} Truncated URL
   */
  truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      if (path.length > 40) {
        return path.substring(0, 37) + '...';
      }
      return path || '/';
    } catch {
      // If URL parsing fails, just truncate the string
      if (url.length > 40) {
        return url.substring(0, 37) + '...';
      }
      return url;
    }
  },

  /**
   * Truncate text for display
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }
    return text;
  },

  /**
   * Build page navigation dropdown
   * @param {Map} pageGroups - Map of URL to annotations array
   * @param {string} currentUrl - Current page URL
   * @param {number} bugReportsCount - Number of bug reports
   * @returns {string} HTML string
   */
  buildPageNavigation(pageGroups, currentUrl, bugReportsCount = 0) {
    // Always show the navigation if there are annotations OR bug reports anywhere
    if (pageGroups.size === 0 && bugReportsCount === 0) {
      // No annotations OR bug reports at all
      return '';
    }

    const urlObj = new URL(currentUrl);
    const currentPath = urlObj.pathname + (urlObj.hash || '');
    const currentHost = urlObj.host;
    const currentPageCount = pageGroups.get(currentUrl)?.length || 0;

    // Check if current page is in the groups - if not, we need to add it to dropdown
    const currentPageInGroups = pageGroups.has(currentUrl);

    // Build dropdown items for ALL pages
    let dropdownItems = '';

    // Add bug reports item at the top if there are any bug reports
    if (bugReportsCount > 0) {
      dropdownItems += `
        <div class="sidebar-page-nav-item sidebar-bug-reports-item" data-action="show-bug-reports">
          <div class="sidebar-page-nav-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 2v4M16 2v4M9 9h6M9 13h6M9 17h6M3 9l1.5-1.5M3 21l1.5-1.5M21 9l-1.5-1.5M21 21l-1.5-1.5M6 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
            </svg>
          </div>
          <div class="sidebar-page-nav-info">
            <div class="sidebar-page-nav-path">Issue Reports</div>
            <div class="sidebar-page-nav-host">All bug reports</div>
          </div>
          <div class="sidebar-page-nav-badge">${bugReportsCount}</div>
        </div>
      `;
    }

    // If current page has no annotations, show it first in the dropdown as "current page"
    if (!currentPageInGroups) {
      dropdownItems += `
        <div class="sidebar-page-nav-item current" data-page-url="${PointaUtils.escapeHtml(currentUrl)}">
          <div class="sidebar-page-nav-info">
            <div class="sidebar-page-nav-path">${PointaUtils.escapeHtml(currentPath || '/')} (current)</div>
            <div class="sidebar-page-nav-host">${PointaUtils.escapeHtml(currentHost)}</div>
          </div>
          <div class="sidebar-page-nav-badge">0</div>
        </div>
      `;
    }

    // Add all other pages with annotations
    pageGroups.forEach((annotations, url) => {
      const urlObj = new URL(url);
      const displayPath = urlObj.pathname + (urlObj.hash || '');
      const displayHost = urlObj.host;
      const count = annotations.length;
      const isCurrent = url === currentUrl;

      // Copy button - only show if there are annotations (count > 0)
      // Shown always for current page, on hover for others
      const copyButton = count > 0 ? `
        <button class="sidebar-page-nav-copy ${isCurrent ? 'always-visible' : ''}" 
                data-page-url="${PointaUtils.escapeHtml(url)}" 
                data-annotation-count="${count}"
                title="Copy all ${count} annotation${count > 1 ? 's' : ''} on this page">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      ` : '';

      dropdownItems += `
        <div class="sidebar-page-nav-item ${isCurrent ? 'current' : ''}" data-page-url="${PointaUtils.escapeHtml(url)}">
          <div class="sidebar-page-nav-info">
            <div class="sidebar-page-nav-path">${PointaUtils.escapeHtml(displayPath || '/')}${isCurrent ? ' (current)' : ''}</div>
            <div class="sidebar-page-nav-host">${PointaUtils.escapeHtml(displayHost)}</div>
          </div>
          ${copyButton}
          <div class="sidebar-page-nav-badge">${count}</div>
        </div>
      `;
    });

    return `
      <div class="sidebar-page-navigation">
        <div class="sidebar-page-nav-current" id="sidebar-page-nav-toggle">
          <div class="sidebar-page-nav-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            </svg>
          </div>
          <div class="sidebar-page-nav-info">
            <div class="sidebar-page-nav-path">${PointaUtils.escapeHtml(currentPath || '/')}</div>
            <div class="sidebar-page-nav-host">${PointaUtils.escapeHtml(currentHost)}</div>
          </div>
          <div class="sidebar-page-nav-badge">${currentPageCount}</div>
          <svg class="sidebar-page-nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="sidebar-page-nav-dropdown" id="sidebar-page-nav-dropdown">
          ${dropdownItems}
        </div>
      </div>
    `;
  },

  /**
   * Generate a human-readable preview for design mode annotations
   * @param {Object} annotation - The annotation object
   * @returns {string} HTML preview with visual indicators
   */
  getDesignPreview(annotation) {
    const changes = annotation.css_changes || {};
    const changeCount = Object.keys(changes).length;

    if (changeCount === 0) {
      return '<span class="design-preview-empty">No changes</span>';
    }

    // Get property category icons and formatting
    const getPropertyInfo = (property) => {
      // Color-related properties
      if (['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'].includes(property)) {
        return { category: 'color', icon: '🎨' };
      }
      // Spacing properties
      if (['padding', 'margin', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
      'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'gap'].includes(property)) {
        return { category: 'spacing', icon: '📏' };
      }
      // Typography properties
      if (['fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textTransform'].includes(property)) {
        return { category: 'typography', icon: '📝' };
      }
      // Layout properties
      if (['display', 'flexDirection', 'justifyContent', 'alignItems', 'position', 'width', 'height'].includes(property)) {
        return { category: 'layout', icon: '📐' };
      }
      // Border properties
      if (['borderRadius', 'borderWidth', 'border', 'borderStyle'].includes(property)) {
        return { category: 'border', icon: '⬜' };
      }
      // Position properties
      if (property === 'dom_position') {
        return { category: 'position', icon: '📍' };
      }
      // Text content
      if (property === 'textContent') {
        return { category: 'text', icon: '✏️' };
      }
      // Default
      return { category: 'other', icon: '✨' };
    };

    // Format property name to readable
    const formatPropertyName = (property) => {
      if (property === 'dom_position') return 'Position';
      if (property === 'textContent') return 'Text';
      return property.replace(/([A-Z])/g, ' $1').toLowerCase();
    };

    // Extract and format value
    const formatValue = (value) => {
      if (typeof value === 'object' && value !== null) {
        if (value.new !== undefined) {
          return value.new;
        }
        if (value.value !== undefined) {
          return value.value;
        }
        return JSON.stringify(value).substring(0, 20);
      }
      return String(value);
    };

    // Check if it's a color value
    const isColorValue = (value) => {
      const str = String(value);
      return str.startsWith('#') || str.startsWith('rgb') || str.startsWith('hsl') ||
      ['red', 'blue', 'green', 'white', 'black', 'yellow', 'purple', 'orange'].includes(str.toLowerCase());
    };

    // Build preview items (max 3 visible)
    const previewItems = [];
    const entries = Object.entries(changes);
    const maxVisible = 3;

    for (let i = 0; i < Math.min(maxVisible, entries.length); i++) {
      const [property, value] = entries[i];
      const info = getPropertyInfo(property);
      const propName = formatPropertyName(property);
      const displayValue = formatValue(value);

      let itemHTML = '';

      // Special handling for colors - show color swatch
      if (info.category === 'color' && isColorValue(displayValue)) {
        itemHTML = `
          <div class="design-preview-item design-preview-color">
            <span class="design-preview-icon">${info.icon}</span>
            <span class="design-preview-label">${propName}</span>
            <span class="design-preview-swatch" style="background-color: ${displayValue};" title="${displayValue}"></span>
          </div>
        `;
      }
      // Special handling for position changes
      else if (property === 'dom_position') {
        itemHTML = `
          <div class="design-preview-item design-preview-position">
            <span class="design-preview-icon">${info.icon}</span>
            <span class="design-preview-label">Moved element</span>
          </div>
        `;
      }
      // Special handling for text content
      else if (property === 'textContent') {
        const truncated = displayValue.length > 30 ? displayValue.substring(0, 27) + '...' : displayValue;
        itemHTML = `
          <div class="design-preview-item design-preview-text">
            <span class="design-preview-icon">${info.icon}</span>
            <span class="design-preview-label">Text</span>
            <span class="design-preview-value">"${PointaUtils.escapeHtml(truncated)}"</span>
          </div>
        `;
      }
      // Default formatting for other properties
      else {
        const truncated = displayValue.length > 20 ? displayValue.substring(0, 17) + '...' : displayValue;
        itemHTML = `
          <div class="design-preview-item">
            <span class="design-preview-icon">${info.icon}</span>
            <span class="design-preview-label">${propName}</span>
            <span class="design-preview-value">${PointaUtils.escapeHtml(truncated)}</span>
          </div>
        `;
      }

      previewItems.push(itemHTML);
    }

    // Add "X more" indicator if there are more changes
    const remainingCount = changeCount - maxVisible;
    if (remainingCount > 0) {
      previewItems.push(`
        <div class="design-preview-item design-preview-more">
          <span class="design-preview-more-count">+${remainingCount} more</span>
        </div>
      `);
    }

    return `<div class="design-preview-container">${previewItems.join('')}</div>`;
  },

  /**
   * Set up listeners for welcome screen
   */
  setupWelcomeListeners() {
    const getStartedBtn = this.sidebar.querySelector('#sidebar-get-started-btn');
    if (getStartedBtn) {
      getStartedBtn.addEventListener('click', async () => {
        // Show setup instructions overlay
        await this.showSetupInstructionsOverlay();
      });
    }
  },

  /**
   * Show setup instructions overlay
   */
  async showSetupInstructionsOverlay() {
    // Check if the server has ever been online before
    const result = await chrome.storage.local.get(['serverWasOnline']);
    const isFirstTime = !result.serverWasOnline;

    // Close any existing overlay
    const existingOverlay = document.querySelector('.pointa-setup-instructions-overlay');
    if (existingOverlay) {
      // Unregister existing modal
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('setup-instructions');
      }
      existingOverlay.remove();
    }

    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('setup-instructions');
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'pointa-setup-instructions-overlay';
    overlay.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    // Track server online state
    let serverWentOnline = false;

    // Build install command HTML (only for first-time users)
    const installCommandHTML = isFirstTime ? `
      <div class="pointa-setup-step">
        <h3>1. Install Pointa Server</h3>
        <p>Download and install the npm server globally:</p>
        <div class="pointa-command-code">
          <code>npm install -g pointa-server</code>
          <button class="pointa-copy-btn" data-command="npm install -g pointa-server" title="Copy command">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>
    ` : '';

    // Determine step numbers based on whether install command is shown
    const startStepNum = isFirstTime ? 2 : 1;

    overlay.innerHTML = `
      <div class="pointa-setup-instructions-content">
        <div class="pointa-setup-instructions-header">
          <h2>${isFirstTime ? 'Get Started (1 min)' : 'Start the Server'}</h2>
          <button class="pointa-setup-instructions-close" data-close-overlay>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div class="pointa-setup-instructions-body">
          ${installCommandHTML}
          
          <div class="pointa-setup-step">
            <h3>${startStepNum}. Start the server</h3>
            <p>Run this command in your terminal:</p>
            <div class="pointa-command-code">
              <code>pointa-server start</code>
              <button class="pointa-copy-btn" data-command="pointa-server start" title="Copy command">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <p class="pointa-setup-note">This will keep the server running in the background</p>
          </div>
          
          ${isFirstTime ? `
            <div class="pointa-setup-step">
              <h3>3. Connect your AI coding agent</h3>
              
              <!-- Agent Tabs -->
              <div class="pointa-agent-tabs">
                <div class="pointa-tab-buttons">
                  <button class="pointa-tab-btn active" data-agent="claude">Claude Code</button>
                  <button class="pointa-tab-btn" data-agent="cursor">Cursor</button>
                </div>
                
                <!-- Claude Code Tab -->
                <div class="pointa-tab-content active" data-agent="claude">
                  <p>Add to your Claude configuration file:</p>
              <div class="pointa-command-code">
                <code>{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}</code>
                <button class="pointa-copy-btn" data-command='{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}' title="Copy command">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <p style="margin-top: 10px; font-size: 0.9em; opacity: 0.8;">Or use CLI: <code>claude mcp add pointa npx -- -y pointa-server</code></p>
                </div>
                
                <!-- Cursor Tab -->
                <div class="pointa-tab-content" data-agent="cursor">
                  <p>Open Cursor → Settings → Cursor Settings → Tools & Integrations</p>
                  <p>Click + Add new global MCP server and enter:</p>
                  <div class="pointa-command-code">
                    <code>{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}</code>
                    <button class="pointa-copy-btn" data-command='{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}' title="Copy command">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
          
          <div class="pointa-setup-status">
            <div class="pointa-setup-status-indicator">
              <div class="pointa-status-dot offline"></div>
              <span class="pointa-status-text">Waiting for server...</span>
            </div>
          </div>
        </div>
        
        <div class="pointa-setup-instructions-footer">
          <button class="pointa-setup-close-btn" data-close-overlay>Got it</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Set up tab switching for agent tabs (if first time)
    if (isFirstTime) {
      const tabButtons = overlay.querySelectorAll('.pointa-tab-btn');
      const tabContents = overlay.querySelectorAll('.pointa-tab-content');

      tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetAgent = btn.getAttribute('data-agent');

          // Remove active class from all
          tabButtons.forEach((b) => b.classList.remove('active'));
          tabContents.forEach((c) => c.classList.remove('active'));

          // Add active to clicked tab
          btn.classList.add('active');
          const targetContent = overlay.querySelector(`.pointa-tab-content[data-agent="${targetAgent}"]`);
          if (targetContent) {
            targetContent.classList.add('active');
          }
        });
      });
    }

    // Set up copy buttons
    const copyButtons = overlay.querySelectorAll('.pointa-copy-btn[data-command]');
    copyButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const command = btn.getAttribute('data-command');
        try {
          await navigator.clipboard.writeText(command);

          // Show feedback
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
          btn.style.color = '#10b981';

          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = '';
          }, 1500);
        } catch (error) {
          console.error('Failed to copy command:', error);
        }
      });
    });

    // Set up close button
    const closeButtons = overlay.querySelectorAll('[data-close-overlay]');
    closeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('setup-instructions');
        }

        if (overlay._statusCheckInterval) {
          clearInterval(overlay._statusCheckInterval);
        }
        overlay.remove();
        // Remove ESC key listener
        if (overlay._escHandler) {
          document.removeEventListener('keydown', overlay._escHandler);
        }
      });
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('setup-instructions');
        }

        if (overlay._statusCheckInterval) {
          clearInterval(overlay._statusCheckInterval);
        }
        overlay.remove();
        // Remove ESC key listener
        document.removeEventListener('keydown', escHandler);
      }
    });

    // Close on ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('setup-instructions');
        }

        if (overlay._statusCheckInterval) {
          clearInterval(overlay._statusCheckInterval);
        }
        overlay.remove();
        // Remove this listener
        document.removeEventListener('keydown', escHandler);
      }
    };
    overlay._escHandler = escHandler; // Store reference for cleanup
    document.addEventListener('keydown', escHandler);

    // Start polling for server status
    overlay._statusCheckInterval = setInterval(async () => {
      const serverOnline = await this.checkServerStatus();

      const statusDot = overlay.querySelector('.pointa-status-dot');
      const statusText = overlay.querySelector('.pointa-status-text');

      if (statusDot && statusText) {
        if (serverOnline) {
          if (!serverWentOnline) {
            // First time server comes online
            serverWentOnline = true;
            statusDot.className = 'pointa-status-dot online';
            statusText.textContent = "You're ready to go! Start annotating now.";

            // Hide instructions and show large success message
            const instructionsContent = overlay.querySelector('.pointa-setup-instructions-content');
            if (instructionsContent) {
              instructionsContent.innerHTML = `
                <div class="pointa-setup-success">
                  <div class="pointa-success-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="8 12 11 15 16 9"></polyline>
                    </svg>
                  </div>
                  <h2>You're ready to go!</h2>
                  <p>Start annotating now.</p>
                </div>
              `;
            }

            // Hide the status section since it's no longer needed
            const statusSection = overlay.querySelector('.pointa-setup-status');
            if (statusSection) {
              statusSection.style.display = 'none';
            }

            // Mark that server has been online at least once
            await chrome.storage.local.set({ serverWasOnline: true });

            // Refresh sidebar to show updated status
            const pointa = window.pointa || {};
            if (pointa.refresh) {
              this.refresh(pointa);
            }
          }
        } else {
          statusDot.className = 'pointa-status-dot offline';
          statusText.textContent = 'Waiting for server...';
        }
      }
    }, 1000); // Check every second
  },

  /**
   * Estimate tokens from JSON data
   * Uses a simple approximation calibrated against OpenAI's tokenizer
   * @param {Object|Array} data - The data to estimate tokens for
   * @returns {number} - Estimated token count
   */
  estimateTokens(data) {
    try {
      const jsonString = JSON.stringify(data);
      // Approximation calibrated for JSON: 1 token ≈ 1.4 characters
      // JSON is very token-dense due to structural characters (brackets, quotes, commas)
      return Math.ceil(jsonString.length / 1.4);
    } catch (e) {
      return 0;
    }
  },

  /**
   * Format token count with appropriate unit (tokens/K tokens)
   * @param {number} tokens - Token count
   * @returns {string} - Formatted string
   */
  formatTokenCount(tokens) {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  },

  /**
   * Show Ask AI modal with annotation summary and prompt
   */
  async showAskAIModal() {


    // Check server status first
    const serverOnline = await this.checkServerStatus();


    if (!serverOnline) {
      // Redirect to setup instructions if server is offline
      await this.showSetupInstructionsOverlay();
      return;
    }

    // Get all annotations and bug reports from API
    // Request a high limit to ensure we get ALL annotations (default is 50)
    const response = await chrome.runtime.sendMessage({
      action: 'getAnnotations',
      limit: 1000 // High limit to get all annotations
    });
    const allAnnotations = response.success ? response.annotations || [] : [];

    // Debug: Check what URLs are in the API response
    const uniqueUrlsInModal = [...new Set(allAnnotations.map((a) => a.url))];









    const allBugReports = await this.loadBugReports(); // Use loadBugReports which now uses file storage

    // Only include active (pending) annotations - in-review items should be in "To Review"
    const activeAnnotations = allAnnotations.filter((a) => a.status === 'pending' || !a.status);
    const allWorkableAnnotations = activeAnnotations;
    // Include active, debugging, and in-review statuses
    const activeBugReports = allBugReports.filter((r) =>
      r.status === 'active' || r.status === 'debugging' || r.status === 'in-review'
    );

    // Debug: Show status breakdown of all annotations
    const statusCounts = {};
    allAnnotations.forEach((a) => {
      const status = a.status || 'no-status';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Debug: Show annotations for current page specifically
    const currentPageUrlWithoutHash = PointaUtils.getUrlWithoutHash(window.location.href);
    const currentPageAnnotationsFromAPI = allAnnotations.filter((a) =>
    PointaUtils.getUrlWithoutHash(a.url) === currentPageUrlWithoutHash
    );
























    // Check if there are any annotations or bug reports
    const hasContent = allWorkableAnnotations.length > 0 || activeBugReports.length > 0;

    // Group annotations by page (include both active and in-review)
    const pageGroups = new Map();
    if (hasContent) {
      allWorkableAnnotations.forEach((annotation) => {
        const url = annotation.url;
        if (!pageGroups.has(url)) {
          pageGroups.set(url, []);
        }
        pageGroups.get(url).push(annotation);
      });
    }

    // Debug: Show page grouping results









    // Always pre-select all annotation pages by default
    const shouldPreSelectAllAnnotations = true;

    // Only pre-select bug reports if there are NO annotations at all
    const shouldPreSelectBugReports = allWorkableAnnotations.length === 0 && activeBugReports.length > 0;

    // Build page checkboxes for annotations
    let pageCheckboxes = '';
    if (hasContent) {
      pageCheckboxes = Array.from(pageGroups.entries()).map(([url, annotations]) => {
        const urlObj = new URL(url);
        const displayPath = urlObj.pathname + (urlObj.hash || '');
        const displayHost = urlObj.host;
        const count = annotations.length;

        return `
          <div class="pointa-ask-ai-page-item">
            <label class="pointa-ask-ai-checkbox">
              <input type="checkbox" ${shouldPreSelectAllAnnotations ? 'checked' : ''} class="pointa-page-checkbox" data-page-url="${PointaUtils.escapeHtml(url)}" data-type="annotation" />
              <span class="pointa-page-path">${PointaUtils.escapeHtml(displayPath || '/')}</span>
              <span class="pointa-page-host">${PointaUtils.escapeHtml(displayHost)}</span>
              <span class="pointa-page-count">${count} annotation${count > 1 ? 's' : ''}</span>
            </label>
          </div>
        `;
      }).join('');
    }








    // Build bug reports checkbox
    let bugReportsCheckbox = '';
    if (hasContent && activeBugReports.length > 0) {
      bugReportsCheckbox = `
        <div class="pointa-ask-ai-page-item">
          <label class="pointa-ask-ai-checkbox">
            <input type="checkbox" ${shouldPreSelectBugReports ? 'checked' : ''} class="pointa-bug-reports-checkbox" data-type="bug-report" />
            <span class="pointa-page-path">🐛 Issue Reports</span>
            <span class="pointa-page-host">All bug reports</span>
            <span class="pointa-page-count">${activeBugReports.length} report${activeBugReports.length > 1 ? 's' : ''}</span>
          </label>
        </div>
      `;
    }

    // Close any existing overlay
    const existingOverlay = document.querySelector('.pointa-ask-ai-overlay');
    if (existingOverlay) {
      // Unregister existing modal
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('ask-ai');
      }
      existingOverlay.remove();
    }

    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('ask-ai');
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'pointa-ask-ai-overlay';
    overlay.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    overlay.innerHTML = `
      <div class="pointa-ask-ai-modal">
        <div class="pointa-ask-ai-header">
          <h2>Ask Your AI Coding Agent</h2>
          <button class="pointa-ask-ai-close" data-close-modal>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div class="pointa-ask-ai-body">
          ${hasContent ? `
          <div class="pointa-ask-ai-columns">
            <!-- Left Column: Selection -->
            <div class="pointa-ask-ai-column pointa-ask-ai-column-left">
              <div class="pointa-ask-ai-section">
                <h3>Select items to work on:</h3>
                <div class="pointa-ask-ai-pages">
                  ${bugReportsCheckbox}
                  ${pageCheckboxes}
                </div>
              </div>` : `
          <!-- Empty State -->
          <div class="pointa-ask-ai-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.4; margin-bottom: 16px;">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
            <h3 style="margin-bottom: 8px;">No annotations yet</h3>
            <p style="opacity: 0.7; text-align: center; max-width: 400px; line-height: 1.5;">
              Create annotations on your pages to get AI help with implementation. Your AI agent will read them and make the changes automatically.
            </p>
          </div>
          `}
          ${hasContent ? `
              
              <div class="pointa-ask-ai-section pointa-token-section">
                <div class="pointa-token-usage-header">
                  <span class="pointa-token-usage-label">Context size</span>
                  <span class="pointa-token-usage-count">~<span id="pointa-token-count">0</span> / 25K tokens</span>
                </div>
                <div class="pointa-token-progress-bar">
                  <div class="pointa-token-progress-fill" id="pointa-token-progress"></div>
                </div>
                <p class="pointa-token-usage-hint" id="pointa-token-hint">Keep it under 15K tokens to leave room for code analysis</p>
              </div>
              
              <div class="pointa-ask-ai-section pointa-git-section">
                <h3>Git Workflow (Optional)</h3>
                <div class="pointa-git-options">
                  <label class="pointa-git-option">
                    <input type="radio" name="git-workflow" value="none" checked>
                    <div class="pointa-git-option-content">
                      <span class="pointa-git-option-title">No Git setup</span>
                      <span class="pointa-git-option-desc">AI works in current branch</span>
                    </div>
                  </label>
                  
                  <label class="pointa-git-option">
                    <input type="radio" name="git-workflow" value="single-branch">
                    <div class="pointa-git-option-content">
                      <span class="pointa-git-option-title">Single branch, one commit</span>
                      <span class="pointa-git-option-desc">Best for related changes</span>
                    </div>
                  </label>
                  
                  <label class="pointa-git-option">
                    <input type="radio" name="git-workflow" value="feature-branch">
                    <div class="pointa-git-option-content">
                      <span class="pointa-git-option-title">Feature branch, commits per fix</span>
                      <span class="pointa-git-option-desc">Best for granular history</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            
            <!-- Right Column: Prompt & Instructions -->
            <div class="pointa-ask-ai-column pointa-ask-ai-column-right">
              <div class="pointa-ask-ai-section">
                <h3>Copy this prompt:</h3>
                <div class="pointa-ask-ai-prompt-container">
                  <div class="pointa-ask-ai-prompt" id="pointa-ai-prompt">
                    <!-- Prompt will be generated dynamically -->
                  </div>
                  <button class="pointa-copy-prompt-btn" id="pointa-copy-prompt">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy to Clipboard
                  </button>
                </div>
              </div>
              
              <div class="pointa-ask-ai-section">
                <h3>Next steps:</h3>
                <div class="pointa-ask-ai-instructions">
                  <ol>
                    <li>Copy the prompt above</li>
                    <li>Open your AI coding tool (Claude Code, Cursor, etc.)</li>
                    <li>Paste the prompt and let the AI implement your annotations</li>
                  </ol>
                  <p class="pointa-ask-ai-note">
                    💡 Your AI agent will read the annotations via MCP and implement the changes automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
          ` : ''}
        </div>
        
        <div class="pointa-ask-ai-footer">
          <button class="pointa-secondary-btn" data-close-modal>Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Only setup interactive elements if there's content
    if (!hasContent) {
      // Just setup close button handlers for empty state
      const closeButtons = overlay.querySelectorAll('[data-close-modal]');
      closeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          if (window.PointaModalManager) {
            window.PointaModalManager.unregisterModal('ask-ai');
          }
          overlay.remove();
        });
      });
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          if (window.PointaModalManager) {
            window.PointaModalManager.unregisterModal('ask-ai');
          }
          overlay.remove();
        }
      });
      
      return;
    }

    // Debug: Check what checkboxes are actually in the DOM
    const annotationCheckboxesInDOM = overlay.querySelectorAll('.pointa-page-checkbox');
    const bugReportsCheckboxInDOM = overlay.querySelector('.pointa-bug-reports-checkbox');






    // Function to generate prompt based on selected pages and bug reports
    const updatePrompt = () => {
      const annotationCheckboxes = overlay.querySelectorAll('.pointa-page-checkbox');
      const bugReportsCheckbox = overlay.querySelector('.pointa-bug-reports-checkbox');

      const selectedUrls = Array.from(annotationCheckboxes).
      filter((cb) => cb.checked).
      map((cb) => cb.dataset.pageUrl);

      const bugReportsSelected = bugReportsCheckbox && bugReportsCheckbox.checked;

      let prompt;
      let totalAnnotations = selectedUrls.reduce((sum, url) => {
        return sum + pageGroups.get(url).length;
      }, 0);

      // Calculate token count for selected items
      let totalTokens = 0;

      // Add tokens for selected annotations
      const selectedAnnotations = [];
      selectedUrls.forEach((url) => {
        const annotations = pageGroups.get(url) || [];
        selectedAnnotations.push(...annotations);
      });
      totalTokens += this.estimateTokens(selectedAnnotations);

      // Add tokens for bug reports if selected
      if (bugReportsSelected) {
        totalTokens += this.estimateTokens(activeBugReports);
      }

      // Update token counter display
      const tokenCountElement = overlay.querySelector('#pointa-token-count');
      if (tokenCountElement) {
        tokenCountElement.textContent = this.formatTokenCount(totalTokens);
      }

      // Update progress bar
      const maxTokens = 25000; // 25K tokens max recommended
      const progressBar = overlay.querySelector('#pointa-token-progress');
      const hintElement = overlay.querySelector('#pointa-token-hint');

      if (progressBar) {
        const percentage = Math.min(totalTokens / maxTokens * 100, 100);
        progressBar.style.width = `${percentage}%`;

        // Color coding based on token usage
        // Green: 0-15K (safe zone)
        // Orange: 15K-25K (getting large)
        // Red: 25K+ (too much)
        if (totalTokens < 15000) {
          progressBar.className = 'pointa-token-progress-fill pointa-token-safe';
          if (hintElement) {
            hintElement.textContent = 'Good range - plenty of room for code analysis';
          }
        } else if (totalTokens < 25000) {
          progressBar.className = 'pointa-token-progress-fill pointa-token-warning';
          if (hintElement) {
            hintElement.textContent = 'Getting large - consider selecting fewer items';
          }
        } else {
          progressBar.className = 'pointa-token-progress-fill pointa-token-danger';
          if (hintElement) {
            hintElement.textContent = 'Too large - trim down to leave room for code work';
          }
        }
      }

      // Get unique localhost addresses from selected URLs
      const selectedLocalhosts = new Set();
      selectedUrls.forEach((url) => {
        try {
          const urlObj = new URL(url);
          selectedLocalhosts.add(`${urlObj.protocol}//${urlObj.host}`);
        } catch (e) {



          // Skip invalid URLs
        }});const localhostList = Array.from(selectedLocalhosts).join(', ');

      if (selectedUrls.length === 0 && !bugReportsSelected) {
        prompt = 'Please select at least one item to generate a prompt.';
      } else if (bugReportsSelected && selectedUrls.length === 0) {
        // Only bug reports selected
        prompt = `I have ${activeBugReports.length} bug report${activeBugReports.length > 1 ? 's' : ''} to analyze. Please read all my bug reports using the read_bug_reports tool and help me understand and fix the issues.`;
      } else if (bugReportsSelected && selectedUrls.length > 0) {
        // Both annotations and bug reports selected
        if (selectedUrls.length === pageGroups.size) {
          // All pages selected
          prompt = `I have ${totalAnnotations} Pointa annotation${totalAnnotations > 1 ? 's' : ''} and ${activeBugReports.length} bug report${activeBugReports.length > 1 ? 's' : ''} for ${localhostList}. Please read all my annotations and bug reports using the read_annotations and read_bug_reports tools, then implement the requested changes. Start with the most critical issues first.`;
        } else {
          // Specific pages selected
          const urlList = selectedUrls.map((url) => {
            const urlObj = new URL(url);
            return urlObj.pathname || '/';
          }).join(', ');

          prompt = `I have ${totalAnnotations} Pointa annotation${totalAnnotations > 1 ? 's' : ''} and ${activeBugReports.length} bug report${activeBugReports.length > 1 ? 's' : ''} for ${localhostList}. Please read my annotations for pages: ${urlList} using the read_annotations tool with the url parameter, and read all bug reports using read_bug_reports tool, then implement the requested changes.`;
        }
      } else {
        // Only annotations selected
        if (selectedUrls.length === pageGroups.size) {
          // All pages selected
          prompt = `I have ${totalAnnotations} Pointa annotation${totalAnnotations > 1 ? 's' : ''} for ${localhostList}. Please read all my annotations using the read_annotations tool and implement the requested changes. Start with the most critical issues first.`;
        } else {
          // Specific pages selected
          const urlList = selectedUrls.map((url) => {
            const urlObj = new URL(url);
            return urlObj.pathname || '/';
          }).join(', ');

          prompt = `I have ${totalAnnotations} Pointa annotation${totalAnnotations > 1 ? 's' : ''} for ${localhostList} on these pages: ${urlList}. Please read my annotations for these specific pages using the read_annotations tool with the url parameter, and implement the requested changes.`;
        }
      }

      // Add Git workflow instructions if selected
      const gitWorkflow = overlay.querySelector('input[name="git-workflow"]:checked')?.value || 'none';

      if (gitWorkflow === 'single-branch' && totalAnnotations > 0) {
        const gitInstructions = `

IMPORTANT - Git Workflow:
1. First, create a new branch with a relevant name for this work

2. Implement all ${totalAnnotations} annotation${totalAnnotations > 1 ? 's' : ''}

3. After implementing everything, create ONE commit with a descriptive message

4. Mark annotations as in-review using mark_annotations_for_review (batch all annotation IDs together in one call)

5. When done, show me:
   - The branch name you created
   - A summary of all changes
   - Instructions for how to review and merge`;
        prompt = prompt + gitInstructions;
      } else if (gitWorkflow === 'feature-branch' && totalAnnotations > 0) {
        const gitInstructions = `

IMPORTANT - Git Workflow:
1. First, create a new branch with a relevant name for this work

2. For EACH annotation:
   a) Implement the fix
   b) Create a commit with a descriptive message
   c) After all commits, call mark_annotations_for_review with all annotation IDs in one batch

3. When all annotations are done, show me:
   - The branch name you created
   - List of all commits (git log --oneline)
   - Instructions for how to review and merge`;
        prompt = prompt + gitInstructions;
      }

      const promptElement = overlay.querySelector('#pointa-ai-prompt');
      if (promptElement) {
        promptElement.textContent = prompt;
      }
    };

    // Initial prompt generation
    updatePrompt();

    // Update prompt when checkboxes change
    const allCheckboxes = overlay.querySelectorAll('.pointa-page-checkbox, .pointa-bug-reports-checkbox');
    allCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', updatePrompt);
    });

    // Git workflow radio buttons - update prompt when selection changes
    const gitRadios = overlay.querySelectorAll('input[name="git-workflow"]');

    gitRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        updatePrompt(); // Regenerate prompt with new Git workflow
      });
    });

    // Copy button
    const copyBtn = overlay.querySelector('#pointa-copy-prompt');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const promptElement = overlay.querySelector('#pointa-ai-prompt');
        const prompt = promptElement.textContent;

        try {
          await navigator.clipboard.writeText(prompt);

          // Show feedback
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          `;
          copyBtn.classList.add('copied');

          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (error) {
          console.error('Failed to copy prompt:', error);
        }
      });
    }

    // Close buttons
    const closeButtons = overlay.querySelectorAll('[data-close-modal]');
    closeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('ask-ai');
        }
        overlay.remove();
        // Remove ESC key listener
        if (overlay._escHandler) {
          document.removeEventListener('keydown', overlay._escHandler);
        }
      });
    });

    // Close on overlay click (but not modal content)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('ask-ai');
        }
        overlay.remove();
        // Remove ESC key listener
        document.removeEventListener('keydown', escHandler);
      }
    });

    // Close on ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('ask-ai');
        }
        overlay.remove();
        // Remove this listener
        document.removeEventListener('keydown', escHandler);
      }
    };
    overlay._escHandler = escHandler; // Store reference for cleanup
    document.addEventListener('keydown', escHandler);
  },

  /**
   * Show issue type selector screen in sidebar
   */
  showIssueTypeScreen() {
    this.currentView = 'issue-type-selector';

    // Hide annotation badges
    if (window.pointa && window.pointa.badgeManager) {
      window.pointa.badgeManager.hideBadges = true;
      window.pointa.badgeManager.clearAllBadges();
    }

    const content = this.sidebar.querySelector('#sidebar-main');
    if (content) {
      content.innerHTML = this.buildIssueTypeScreen();
      this.setupIssueTypeListeners();
    } else {
      console.error('[Sidebar] Could not find #sidebar-main element');
    }
  },

  /**
   * Show bug report screen in sidebar
   */
  showBugReportScreen() {

    this.currentView = 'bug-report';
    this.isRecordingBug = false; // Ensure recording flag is cleared

    // Hide annotation badges and prevent them from showing during bug report
    if (window.pointa && window.pointa.badgeManager) {
      window.pointa.badgeManager.hideBadges = true;
      window.pointa.badgeManager.clearAllBadges();
    }

    const content = this.sidebar.querySelector('#sidebar-main');
    if (content) {
      content.innerHTML = this.buildBugReportScreen(false);
      this.setupBugReportListeners(window.pointa);
    } else {
      console.error('[Sidebar] Could not find #sidebar-main element');
    }
  },

  /**
   * Show performance report screen in sidebar
   */
  showPerformanceReportScreen() {

    this.currentView = 'performance-investigation';
    this.isRecordingBug = false; // Use same flag for recording state

    // Hide annotation badges
    if (window.pointa && window.pointa.badgeManager) {
      window.pointa.badgeManager.hideBadges = true;
      window.pointa.badgeManager.clearAllBadges();
    }

    const content = this.sidebar.querySelector('#sidebar-main');
    if (content) {
      content.innerHTML = this.buildPerformanceReportScreen(false);
      this.setupPerformanceReportListeners(window.pointa);
    } else {
      console.error('[Sidebar] Could not find #sidebar-main element');
    }
  },

  /**
   * Build performance report screen HTML
   */
  buildPerformanceReportScreen(isRecording) {
    if (isRecording) {
      return `
        <div class="sidebar-bug-report-container sidebar-bug-recording">
          <!-- Back button disabled during recording -->
          <button id="sidebar-bug-back-btn" class="sidebar-back-btn" disabled style="opacity: 0.5; cursor: not-allowed;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </button>

          <div class="sidebar-bug-report-intro" style="padding: 20px 24px;">
            <div class="sidebar-bug-recording-indicator" style="margin-bottom: 12px;">
              <div class="sidebar-bug-recording-pulse"></div>
              <div class="sidebar-bug-icon">⚡</div>
            </div>
            <h2 class="sidebar-section-title" style="margin-bottom: 8px;">Recording Performance...</h2>
            <p class="sidebar-bug-description" style="margin-bottom: 16px; font-size: 14px;">
              <strong>Perform the actions that are slow or cause performance issues.</strong>
            </p>
            
            <div class="sidebar-bug-recording-status" style="padding: 16px; margin: 16px 0;">
              <div class="sidebar-bug-recording-timer" id="sidebar-bug-timer" style="font-size: 36px; margin-bottom: 4px;">00:00</div>
            </div>

            <div class="sidebar-bug-capturing" style="margin-bottom: 16px;">
              <h3 style="font-size: 13px; margin-bottom: 8px;">Capturing:</h3>
              <ul class="sidebar-bug-capture-list" style="font-size: 12px;">
                <li style="margin-bottom: 4px;">✓ Tracking page metrics</li>
                <li style="margin-bottom: 4px;">✓ Monitoring interactions</li>
                <li style="margin-bottom: 4px;">✓ Capturing performance data</li>
                <li style="margin-bottom: 4px;">✓ Detecting long tasks</li>
              </ul>
            </div>

            <button id="sidebar-stop-recording-btn" class="sidebar-danger-btn sidebar-bug-record-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
              Stop Recording
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="sidebar-bug-report-container">
        <!-- Back button -->
        <button id="sidebar-bug-back-btn" class="sidebar-back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back
        </button>

        <div class="sidebar-bug-report-intro" style="padding: 16px 20px;">
          <div class="sidebar-bug-icon" style="font-size: 40px; margin-bottom: 8px;">⚡</div>
          <h2 class="sidebar-section-title" style="margin-bottom: 6px; font-size: 18px;">Performance Investigation</h2>
          <p class="sidebar-bug-description" style="margin-bottom: 10px; font-size: 13px;">
            Record a session to investigate slow resource loading. We'll capture:
          </p>
          
          <ul class="sidebar-bug-features-compact" style="margin-bottom: 10px;">
            <li style="padding: 4px 0;">📦 Slow resources (>1s or >100KB)</li>
            <li style="padding: 4px 0;">📱 Device & network context</li>
            <li style="padding: 4px 0;">🖱️ Your interactions</li>
          </ul>
          
          <div class="sidebar-bug-instructions-compact" style="padding: 10px 12px; margin-bottom: 12px;">
            <h3 style="font-size: 12px; margin-bottom: 6px;">Quick Start:</h3>
            <ol style="padding-left: 16px;">
              <li style="font-size: 11px; margin-bottom: 2px;">Click "Start Recording"</li>
              <li style="font-size: 11px; margin-bottom: 2px;">Perform slow actions or interactions</li>
              <li style="font-size: 11px; margin-bottom: 0;">Click "Stop" & review performance data</li>
            </ol>
          </div>

          <button id="sidebar-start-recording-btn" class="sidebar-primary-btn sidebar-bug-record-btn" style="padding: 10px 20px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
            Start Recording
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Set up listeners for performance report screen
   */
  setupPerformanceReportListeners(pointa) {
    const startRecordingBtn = this.sidebar.querySelector('#sidebar-start-recording-btn');
    const stopRecordingBtn = this.sidebar.querySelector('#sidebar-stop-recording-btn');
    const backBtn = this.sidebar.querySelector('#sidebar-bug-back-btn');

    if (startRecordingBtn) {
      startRecordingBtn.addEventListener('click', async () => {


        try {
          // Update UI to recording state FIRST
          this.isRecordingBug = true; // Use same flag
          const content = this.sidebar.querySelector('#sidebar-main');
          if (content) {
            content.innerHTML = this.buildPerformanceReportScreen(true);
            this.setupPerformanceReportListeners(pointa);

            // Start timer in sidebar
            this.startSidebarTimer();
          }

          // Start the actual recording
          await pointa.startPerformanceInvestigation();


        } catch (error) {
          console.error('[Sidebar] Error starting performance recording:', error);
          this.isRecordingBug = false;
          this.currentView = null;
          alert('Failed to start recording. Please try again.');

          const serverOnline = await this.checkServerStatus();
          await this.updateContent(pointa, serverOnline);
        }
      });
    }

    if (stopRecordingBtn) {
      stopRecordingBtn.addEventListener('click', async () => {


        // Prevent double-clicking
        if (!this.isRecordingBug) {

          return;
        }

        // Disable button immediately
        stopRecordingBtn.disabled = true;
        stopRecordingBtn.style.opacity = '0.5';
        stopRecordingBtn.style.cursor = 'not-allowed';

        // Clear the sidebar timer
        if (this.sidebarTimerInterval) {
          clearInterval(this.sidebarTimerInterval);
          this.sidebarTimerInterval = null;
        }

        // Clear recording flag FIRST to allow sidebar updates
        this.isRecordingBug = false;
        this.currentView = null;

        try {
          // Stop the recording (this will show the dashboard modal)
          await pointa.stopPerformanceInvestigation();
        } catch (error) {
          console.error('[Sidebar] Error stopping performance recording:', error);
          alert('Error stopping recording. Your data may have been lost.');
        }

        // Return sidebar to normal state
        const serverOnline = await this.checkServerStatus();
        await this.updateContent(pointa, serverOnline);
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', async () => {


        // Reset state
        this.isRecordingBug = false;
        this.currentView = null;

        // Show badges again
        if (window.pointa && window.pointa.badgeManager) {
          window.pointa.badgeManager.hideBadges = false;
          window.pointa.badgeManager.showExistingAnnotations();
        }

        const serverOnline = await this.checkServerStatus();
        await this.updateContent(pointa, serverOnline);
      });
    }
  },

  /**
   * Set up listeners for bug report screen
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  /**
   * Set up listeners for issue type selector
   */
  setupIssueTypeListeners() {
    const backBtn = this.sidebar.querySelector('#sidebar-issue-type-back-btn');
    const bugOption = this.sidebar.querySelector('#sidebar-issue-type-bug');
    const performanceOption = this.sidebar.querySelector('#sidebar-issue-type-performance');

    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        this.currentView = null;
        const serverOnline = await this.checkServerStatus();
        await this.updateContent(window.pointa, serverOnline);
      });
    }

    if (bugOption) {
      bugOption.addEventListener('click', () => {
        this.showBugReportScreen();
      });
    }

    if (performanceOption) {
      performanceOption.addEventListener('click', () => {
        this.showPerformanceReportScreen();
      });
    }
  },

  setupBugReportListeners(pointa) {
    const startRecordingBtn = this.sidebar.querySelector('#sidebar-start-recording-btn');
    const stopRecordingBtn = this.sidebar.querySelector('#sidebar-stop-recording-btn');
    const backBtn = this.sidebar.querySelector('#sidebar-bug-back-btn');

    if (startRecordingBtn) {
      startRecordingBtn.addEventListener('click', async () => {
        // Prevent double-clicking
        if (this.isRecordingBug) {

          return;
        }

        // Disable button immediately to prevent double clicks
        startRecordingBtn.disabled = true;
        startRecordingBtn.style.opacity = '0.5';
        startRecordingBtn.style.cursor = 'not-allowed';

        await this.startBugRecording(pointa);
      });
    }

    if (stopRecordingBtn) {
      stopRecordingBtn.addEventListener('click', async () => {


        // Prevent double-clicking
        if (!this.isRecordingBug) {

          return;
        }

        // Disable button immediately
        stopRecordingBtn.disabled = true;
        stopRecordingBtn.style.opacity = '0.5';
        stopRecordingBtn.style.cursor = 'not-allowed';

        // Clear the sidebar timer
        if (this.sidebarTimerInterval) {
          clearInterval(this.sidebarTimerInterval);
          this.sidebarTimerInterval = null;
        }

        // Clear recording flag FIRST to allow sidebar updates
        this.isRecordingBug = false;
        this.currentView = null;

        try {
          // Stop the recording (this will show the timeline modal)
          await pointa.stopBugReporting();
        } catch (error) {
          console.error('[Sidebar] Error stopping recording:', error);
          alert('Error stopping recording. Your data may have been lost.');
        }

        // Return sidebar to normal state
        const serverOnline = await this.checkServerStatus();
        await this.updateContent(pointa, serverOnline);
      });
    }

    if (backBtn && !backBtn.disabled) {
      backBtn.addEventListener('click', async () => {
        this.currentView = null;
        const serverOnline = await this.checkServerStatus();
        await this.updateContent(pointa, serverOnline);
      });
    }
  },

  /**
   * Start bug recording and update sidebar UI
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async startBugRecording(pointa) {
    try {
      // Hide annotation badges during bug recording and prevent them from showing
      if (pointa.badgeManager) {
        pointa.badgeManager.hideBadges = true;
        pointa.badgeManager.clearAllBadges();
      }

      // FIRST: Update sidebar to show recording state BEFORE starting recording
      // This prevents race conditions where the sidebar gets re-rendered
      this.isRecordingBug = true;
      const content = this.sidebar.querySelector('#sidebar-main');
      if (content) {
        content.innerHTML = this.buildBugReportScreen(true);
        this.setupBugReportListeners(pointa);

        // Start timer in sidebar
        this.startSidebarTimer();
      }

      // THEN: Start the actual recording
      await pointa.startBugReporting();


    } catch (error) {
      console.error('[Sidebar] Error starting bug recording:', error);
      // Reset state on error
      this.isRecordingBug = false;
      this.currentView = null;
      alert('Failed to start recording. Please try again.');

      // Return to normal view
      const serverOnline = await this.checkServerStatus();
      await this.updateContent(pointa, serverOnline);
    }
  },

  /**
   * Start and update the timer in the sidebar
   */
  startSidebarTimer() {
    const timerEl = this.sidebar.querySelector('#sidebar-bug-timer');
    if (!timerEl) return;

    const startTime = Date.now();

    this.sidebarTimerInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;

      // Auto-stop at 30 seconds
      if (seconds >= 30) {
        clearInterval(this.sidebarTimerInterval);
        this.sidebarTimerInterval = null;

        // Trigger the stop button click to properly stop recording
        const stopBtn = this.sidebar.querySelector('#sidebar-stop-recording-btn');
        if (stopBtn && !stopBtn.disabled) {

          stopBtn.click();
        }
      }
    }, 1000);
  },

  /**
   * Set up listeners for ready screen
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupReadyListeners(pointa) {
    // Quick action buttons - directly start annotation mode
    const quickAnnotateBtn = this.sidebar.querySelector('#sidebar-quick-annotate-btn');
    const quickBugBtn = this.sidebar.querySelector('#sidebar-quick-bug-btn');

    if (quickAnnotateBtn) {
      quickAnnotateBtn.addEventListener('click', () => {
        pointa.startAnnotationMode();
      });
    }

    if (quickBugBtn) {
      quickBugBtn.addEventListener('click', () => {
        this.showIssueTypeScreen();
      });
    }
  },

  /**
   * Set up listeners for annotations list
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupAnnotationsListeners(pointa) {
    // Quick action buttons - directly start annotation mode
    const quickAnnotateBtn = this.sidebar.querySelector('#sidebar-quick-annotate-btn');
    const quickBugBtn = this.sidebar.querySelector('#sidebar-quick-bug-btn');
    const askAiBtn = this.sidebar.querySelector('#sidebar-ask-ai-btn');

    if (quickAnnotateBtn) {
      quickAnnotateBtn.addEventListener('click', () => {
        pointa.startAnnotationMode();
      });
    }

    if (quickBugBtn) {
      quickBugBtn.addEventListener('click', () => {
        this.showIssueTypeScreen();
      });
    }

    if (askAiBtn) {

      askAiBtn.addEventListener('click', async () => {

        await this.showAskAIModal();
      });
    } else {

    }

    // Page navigation copy buttons
    const pageNavCopyButtons = this.sidebar.querySelectorAll('.sidebar-page-nav-copy');

    pageNavCopyButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const pageUrl = btn.dataset.pageUrl;

        // Reload annotations from API to ensure we have the latest data
        const response = await chrome.runtime.sendMessage({
          action: 'getAnnotations',
          url: pageUrl
        });
        const pageAnnotations = response.success ?
        (response.annotations || []).filter((a) => a.status === 'pending' || a.status === 'in-review') :
        [];

        if (pageAnnotations.length > 0) {
          const text = PointaUtils.formatAnnotationsForClipboard(pageAnnotations, pageUrl);
          await PointaUtils.copyToClipboard(
            text,
            `Copied ${pageAnnotations.length} annotation${pageAnnotations.length > 1 ? 's' : ''}! Paste into your AI coding tool.`
          );

          // Close dropdown after copy
          const pageNavDropdown = this.sidebar.querySelector('#sidebar-page-nav-dropdown');
          if (pageNavDropdown) {
            pageNavDropdown.classList.remove('open');
          }
        }
      });
    });

    // Page navigation toggle
    const pageNavToggle = this.sidebar.querySelector('#sidebar-page-nav-toggle');
    const pageNavDropdown = this.sidebar.querySelector('#sidebar-page-nav-dropdown');

    if (pageNavToggle && pageNavDropdown) {
      pageNavToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = pageNavDropdown.classList.contains('open');

        if (isOpen) {
          pageNavDropdown.classList.remove('open');
        } else {
          pageNavDropdown.classList.add('open');
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar-page-navigation')) {
          pageNavDropdown.classList.remove('open');
        }
      });

      // Page navigation items - navigate to page OR show bug reports
      // Use event delegation on the dropdown container for better reliability with dynamic content
      const pageNavDropdownContainer = this.sidebar.querySelector('#sidebar-page-nav-dropdown');

      if (pageNavDropdownContainer) {
        pageNavDropdownContainer.addEventListener('click', async (e) => {
          // Find the clicked nav item (might be the item itself or a child)
          const navItem = e.target.closest('.sidebar-page-nav-item');

          if (!navItem) {
            return;
          }

          // Don't navigate if clicking the copy button
          if (e.target.closest('.sidebar-page-nav-copy')) {
            return;
          }

          const action = navItem.dataset.action;
          const pageUrl = navItem.dataset.pageUrl;

          if (action === 'show-bug-reports') {
            // Show bug reports list
            await this.showBugReportsList(pointa);
          } else if (pageUrl) {
            // Set flag to reopen sidebar after navigation
            // This ensures the sidebar reopens when navigating to a different page via the dropdown
            try {
              await chrome.storage.local.set({
                reopenSidebarAfterNavigation: true,
                reopenSidebarTimestamp: Date.now(),
                reopenInNotificationCenter: this.notificationCenterOpen // Preserve notification center state
              });
            } catch (error) {
              console.error('[Sidebar] Failed to set reopen flag:', error);
            }

            // Small delay to ensure storage is written before navigation
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Navigate to page
            window.location.href = pageUrl;
          }
        });
      }
    }

    // Notification center button
    const notificationCenterBtn = this.sidebar.querySelector('#sidebar-notification-center-btn');
    if (notificationCenterBtn) {
      notificationCenterBtn.addEventListener('click', async () => {
        // Toggle notification center view
        this.notificationCenterOpen = !this.notificationCenterOpen;

        // Re-render sidebar content
        const serverOnline = await this.checkServerStatus();
        await this.updateContent(pointa, serverOnline);
      });
    }

    // Back button (in notification center view)
    const backBtn = this.sidebar.querySelector('#sidebar-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        // Close notification center view
        this.notificationCenterOpen = false;

        // Re-render sidebar content
        const serverOnline = await this.checkServerStatus();
        await this.updateContent(pointa, serverOnline);
      });
    }

    // Click on annotation item to navigate to it
    const annotationItems = this.sidebar.querySelectorAll('.sidebar-annotation-item');
    annotationItems.forEach((item) => {
      item.addEventListener('click', async (e) => {
        // Don't trigger if clicking action buttons
        if (e.target.closest('.sidebar-annotation-delete')) return;
        if (e.target.closest('.sidebar-annotation-done')) return;
        if (e.target.closest('.sidebar-annotation-copy')) return;

        const annotationId = item.dataset.annotationId;
        const annotationUrl = item.dataset.annotationUrl;

        // Check if annotation is on a different page (in notification center mode)
        if (this.notificationCenterOpen && annotationUrl) {
          const currentUrl = window.location.href;
          const currentUrlWithoutHash = PointaUtils.getUrlWithoutHash(currentUrl);
          const annotationUrlWithoutHash = PointaUtils.getUrlWithoutHash(annotationUrl);

          if (currentUrlWithoutHash !== annotationUrlWithoutHash) {
            // Annotation is on a different page - navigate to it
            // Set flag to reopen sidebar after navigation
            try {
              await chrome.storage.local.set({
                reopenSidebarAfterNavigation: true,
                reopenSidebarTimestamp: Date.now(),
                scrollToAnnotationId: annotationId, // Also store which annotation to scroll to
                reopenInNotificationCenter: this.notificationCenterOpen // Preserve notification center state
              });
            } catch (error) {
              console.error('[Sidebar] Failed to set reopen flag:', error);
            }

            // Small delay to ensure storage is written before navigation
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Navigate to page
            window.location.href = annotationUrl;
            return;
          }
        }

        // Annotation is on current page or in normal mode
        const annotation = pointa.annotations.find((a) => a.id === annotationId);
        if (annotation) {
          this.navigateToAnnotation(pointa, annotation);
        }
      });

      // Hover effect: highlight corresponding badge on page
      item.addEventListener('mouseenter', (e) => {
        const annotationId = item.dataset.annotationId;
        if (annotationId) {
          const badge = document.querySelector(`.pointa-badge[data-annotation-id="${annotationId}"]`);
          if (badge) {
            badge.classList.add('sidebar-hover-highlight');
          }
        }
      });

      item.addEventListener('mouseleave', (e) => {
        const annotationId = item.dataset.annotationId;
        if (annotationId) {
          const badge = document.querySelector(`.pointa-badge[data-annotation-id="${annotationId}"]`);
          if (badge) {
            badge.classList.remove('sidebar-hover-highlight');
          }
        }
      });
    });

    // Delete buttons
    const deleteButtons = this.sidebar.querySelectorAll('.sidebar-annotation-delete');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const annotationId = btn.dataset.annotationId;

        // Show inline confirmation
        this.showDeleteConfirmation(btn, pointa, annotationId);
      });
    });

    // Done buttons (for in-review annotations)
    const doneButtons = this.sidebar.querySelectorAll('.sidebar-annotation-done');
    doneButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const annotationId = btn.dataset.annotationId;

        // Mark annotation as done (archive it)
        await this.markAnnotationDone(pointa, annotationId);
      });
    });

    // Copy buttons - copy annotation reference to clipboard
    const copyButtons = this.sidebar.querySelectorAll('.sidebar-annotation-copy');
    copyButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const annotationId = btn.dataset.annotationId;
        const annotation = pointa.annotations.find((a) => a.id === annotationId);

        if (annotation) {
          const text = PointaUtils.formatAnnotationForClipboard(annotation);
          await PointaUtils.copyToClipboard(text, 'Annotation reference copied! Paste into your AI coding tool.');
        }
      });
    });
  },

  /**
   * Scroll sidebar to show a specific annotation item
   * @param {string} annotationId - ID of annotation to scroll to
   */
  scrollToAnnotationInSidebar(annotationId) {
    if (!this.sidebar) return;

    // Find the annotation item in the sidebar
    const annotationItem = this.sidebar.querySelector(`.sidebar-annotation-item[data-annotation-id="${annotationId}"]`);
    if (!annotationItem) {

      return;
    }

    // Scroll the annotation item into view within the sidebar
    annotationItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Add a highlight effect
    annotationItem.classList.add('sidebar-annotation-highlight');
    setTimeout(() => {
      annotationItem.classList.remove('sidebar-annotation-highlight');
    }, 2000);
  },

  /**
   * Navigate to annotation on page and open in edit mode
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {Object} annotation - Annotation to navigate to
   */
  async navigateToAnnotation(pointa, annotation) {
    // CRITICAL: Close any existing editors/widgets first to prevent UI conflicts
    if (pointa.currentDesignEditor) {
      pointa.closeDesignEditor();
    }

    // Close any open inline comment widgets
    const existingWidget = document.querySelector('.pointa-inline-widget');
    if (existingWidget) {
      pointa.closeInlineCommentWidget();
    }

    // Find the element using the annotation selector
    const element = pointa.findElementBySelector(annotation);

    if (!element) {
      console.error('Element not found for annotation:', annotation);
      return;
    }

    // Scroll to element
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Get the latest annotation data
    const latestAnnotation = pointa.annotations.find((a) => a.id === annotation.id) || annotation;

    // Wait for scroll to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Open in edit mode based on annotation type
    if (latestAnnotation.type === 'design-edit' || latestAnnotation.type === 'design') {
      // If it has comment text (hybrid annotation), default to comment widget
      // User can switch to Design tab from there
      if (latestAnnotation.comment || latestAnnotation.messages) {
        // Hybrid annotation - show comment widget
        pointa.tempDisableAnnotationMode();
        const context = await pointa.generateElementContext(element);
        pointa.showInlineCommentWidget(element, context, latestAnnotation);
      } else {
        // Pure design annotation - open design editor
        pointa.showDesignEditorForEdit(element, latestAnnotation);
      }
    } else {
      // Regular text annotation - show comment widget in edit mode
      pointa.tempDisableAnnotationMode();

      // Generate fresh element context
      const context = await pointa.generateElementContext(element);

      // Show inline widget in edit mode
      pointa.showInlineCommentWidget(element, context, latestAnnotation);
    }
  },

  /**
   * Show inline delete confirmation next to delete button
   * @param {HTMLElement} deleteBtn - The delete button that was clicked
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} annotationId - ID of annotation to delete
   */
  showDeleteConfirmation(deleteBtn, pointa, annotationId) {
    // Remove any existing confirmation
    const existingConfirm = this.sidebar.querySelector('.sidebar-delete-confirm');
    if (existingConfirm) {
      existingConfirm.remove();
    }

    // Create confirmation UI
    const confirm = document.createElement('div');
    confirm.className = 'sidebar-delete-confirm';
    confirm.innerHTML = `
      <span class="sidebar-delete-confirm-text">Delete?</span>
      <button class="sidebar-delete-confirm-yes" data-annotation-id="${annotationId}">Yes</button>
      <button class="sidebar-delete-confirm-no">No</button>
    `;

    // Insert after the delete button
    const annotationItem = deleteBtn.closest('.sidebar-annotation-item');
    if (annotationItem) {
      annotationItem.appendChild(confirm);

      // Position it near the delete button
      const btnRect = deleteBtn.getBoundingClientRect();
      const itemRect = annotationItem.getBoundingClientRect();
      confirm.style.top = `${btnRect.top - itemRect.top}px`;
      confirm.style.right = '48px'; // Just to the left of delete button
    }

    // Yes button
    const yesBtn = confirm.querySelector('.sidebar-delete-confirm-yes');
    yesBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirm.remove();
      await this.deleteAnnotation(pointa, annotationId);
    });

    // No button
    const noBtn = confirm.querySelector('.sidebar-delete-confirm-no');
    noBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirm.remove();
    });

    // Click outside to cancel
    setTimeout(() => {
      const clickOutside = (e) => {
        if (!confirm.contains(e.target)) {
          confirm.remove();
          document.removeEventListener('click', clickOutside);
        }
      };
      document.addEventListener('click', clickOutside);
    }, 100);
  },

  /**
   * Show performance investigation details modal
   * @param {string} perfId - ID of performance investigation to show
   */
  async showPerformanceReportDetails(perfId) {
    try {
      // Load bug reports from storage (includes performance investigations)
      const reports = await this.loadBugReports();
      const perfReport = reports.find((r) => r.id === perfId);

      if (!perfReport) {
        console.error('[Sidebar] Performance report not found:', perfId);
        return;
      }

      // Restructure saved data to match what the UI expects
      // The saved structure has data under 'performance' object,
      // but the UI expects it at the top level
      const recordingData = {
        pageLoad: perfReport.performance?.pageLoad || perfReport.pageLoad || {},
        timeline: perfReport.performance?.timeline || perfReport.timeline || [],
        insights: perfReport.performance?.insights || perfReport.insights || { issues: [], recommendations: [], score: 0 },
        memory: perfReport.performance?.memory || perfReport.memory || {},
        screenshot: perfReport.screenshot || {},
        startTime: perfReport.performance?.startTime || perfReport.startTime,
        endTime: perfReport.performance?.endTime || perfReport.endTime,
        duration: perfReport.performance?.duration || perfReport.duration
      };

      // Show the performance dashboard modal with the restructured data
      // Pass isViewMode = true since we're viewing an existing report
      if (window.PerformanceReportUI) {
        window.PerformanceReportUI.showPerformanceDashboard(recordingData, true);
      } else {
        console.error('[Sidebar] PerformanceReportUI not available');
      }
    } catch (error) {
      console.error('[Sidebar] Error showing performance report details:', error);
    }
  },

  /**
   * Show inline delete confirmation for bug reports (same UI as annotations)
   * @param {HTMLElement} deleteBtn - The delete button that was clicked
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} bugId - ID of bug report to delete
   */
  showBugReportDeleteConfirmation(deleteBtn, pointa, bugId) {
    // Remove any existing confirmation
    const existingConfirm = this.sidebar.querySelector('.sidebar-delete-confirm');
    if (existingConfirm) {
      existingConfirm.remove();
    }

    // Create confirmation UI (identical to annotations)
    const confirm = document.createElement('div');
    confirm.className = 'sidebar-delete-confirm';
    confirm.innerHTML = `
      <span class="sidebar-delete-confirm-text">Delete?</span>
      <button class="sidebar-delete-confirm-yes" data-bug-id="${bugId}">Yes</button>
      <button class="sidebar-delete-confirm-no">No</button>
    `;

    // Insert after the delete button
    const bugReportItem = deleteBtn.closest('.sidebar-annotation-item');
    if (bugReportItem) {
      bugReportItem.appendChild(confirm);

      // Position it near the delete button
      const btnRect = deleteBtn.getBoundingClientRect();
      const itemRect = bugReportItem.getBoundingClientRect();
      confirm.style.top = `${btnRect.top - itemRect.top}px`;
      confirm.style.right = '48px'; // Just to the left of delete button
    }

    // Yes button
    const yesBtn = confirm.querySelector('.sidebar-delete-confirm-yes');
    yesBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirm.remove();
      await this.deleteBugReport(bugId, pointa);
    });

    // No button
    const noBtn = confirm.querySelector('.sidebar-delete-confirm-no');
    noBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirm.remove();
    });

    // Click outside to cancel
    setTimeout(() => {
      const clickOutside = (e) => {
        if (!confirm.contains(e.target)) {
          confirm.remove();
          document.removeEventListener('click', clickOutside);
        }
      };
      document.addEventListener('click', clickOutside);
    }, 100);
  },

  /**
   * Delete annotation
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} annotationId - ID of annotation to delete
   */
  async deleteAnnotation(pointa, annotationId) {
    try {
      // Delete via background script (which calls API)
      const response = await chrome.runtime.sendMessage({
        action: 'deleteAnnotation',
        id: annotationId
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to delete annotation');
      }

      // Reload annotations from API to get fresh data
      const getResponse = await chrome.runtime.sendMessage({
        action: 'getAnnotations',
        url: window.location.href
      });
      pointa.annotations = getResponse.success ? getResponse.annotations || [] : [];

      // Refresh sidebar content
      const serverOnline = await this.checkServerStatus();
      await this.updateContent(pointa, serverOnline);

      // Remove badge from page
      pointa.badgeManager.removeBadge(annotationId);

    } catch (error) {
      console.error('Error deleting annotation:', error);
    }
  },

  /**
   * Mark annotation as done (changes status to 'done')
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} annotationId - ID of annotation to mark as done
   */
  async markAnnotationDone(pointa, annotationId) {
    try {
      // Update via background script (which calls API)
      const response = await chrome.runtime.sendMessage({
        action: 'updateAnnotation',
        id: annotationId,
        updates: {
          status: 'done',
          updated_at: new Date().toISOString()
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update annotation');
      }

      // Reload annotations from API to get fresh data
      const getResponse = await chrome.runtime.sendMessage({
        action: 'getAnnotations',
        url: window.location.href
      });
      pointa.annotations = getResponse.success ? getResponse.annotations || [] : [];

      // Refresh sidebar content
      const serverOnline = await this.checkServerStatus();
      await this.updateContent(pointa, serverOnline);

      // Remove badge from page since it's now done
      pointa.badgeManager.removeBadge(annotationId);

    } catch (error) {
      console.error('Error marking annotation as done:', error);
    }
  },

  /**
   * Update route/subtitle display
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  updateRoute(pointa) {
    const routeElement = this.sidebar.querySelector('#sidebar-current-route');
    if (!routeElement) return;

    // Only count annotations that are not 'done' (same filter as badge manager and sidebar display)
    // This matches the logic in buildAnnotationsList which only shows 'pending' and 'in-review'
    const activeAnnotations = pointa.annotations.filter((a) => a.status !== 'done');
    const count = activeAnnotations.length;
    if (count > 0) {
      routeElement.textContent = `${count} annotation${count === 1 ? '' : 's'}`;
    } else {
      const url = new URL(window.location.href);
      routeElement.textContent = `${url.hostname}:${url.port}${url.pathname}`;
    }
  },

  /**
   * Update scroll indicator visibility based on scrollable content
   * Shows a gradient at the bottom when there's more content to scroll
   */
  updateScrollIndicator() {
    if (!this.sidebar) return;

    const mainContent = this.sidebar.querySelector('#sidebar-main');
    if (!mainContent) return;

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      const hasScroll = mainContent.scrollHeight > mainContent.clientHeight;

      if (hasScroll) {
        mainContent.classList.add('has-scroll');
      } else {
        mainContent.classList.remove('has-scroll');
      }

      // Also update indicator when scrolling
      const onScroll = () => {
        const isAtBottom = Math.abs(
          mainContent.scrollHeight - mainContent.clientHeight - mainContent.scrollTop
        ) < 5;

        if (isAtBottom) {
          mainContent.classList.remove('has-scroll');
        } else if (mainContent.scrollHeight > mainContent.clientHeight) {
          mainContent.classList.add('has-scroll');
        }
      };

      // Remove old listener if exists
      if (mainContent._scrollListener) {
        mainContent.removeEventListener('scroll', mainContent._scrollListener);
      }

      // Add new scroll listener
      mainContent._scrollListener = onScroll;
      mainContent.addEventListener('scroll', onScroll);
    });
  },

  /**
   * Update mode switcher UI
   * @param {string} mode - Current mode ('annotation' or 'design')
   */
  updateModeSwitcher(mode) {
    const annotationBtn = this.sidebar.querySelector('#sidebar-annotation-mode-btn');
    const designBtn = this.sidebar.querySelector('#sidebar-design-mode-btn');

    if (annotationBtn && designBtn) {
      if (mode === 'annotation') {
        annotationBtn.classList.add('active');
        designBtn.classList.remove('active');
      } else {
        annotationBtn.classList.remove('active');
        designBtn.classList.add('active');
      }
    }
  },

  /**
   * Update start button text and state
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  updateStartButton(pointa) {
    const startBtn = this.sidebar.querySelector('#sidebar-start-btn');
    if (!startBtn) return;

    if (pointa.isAnnotationMode) {
      startBtn.textContent = 'Stop Annotating';
      startBtn.classList.add('active');
    } else if (pointa.isDesignMode) {
      startBtn.textContent = 'Stop Design Mode';
      startBtn.classList.add('active');
    } else {
      this.getCurrentMode().then((mode) => {
        if (mode === 'design') {
          startBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Start Design Mode
          `;
        } else {
          startBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Start Annotating
          `;
        }
        startBtn.classList.remove('active');
      });
    }
  },

  /**
   * Set current mode
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} mode - Mode to set ('annotation' or 'design')
   */
  async setMode(pointa, mode) {
    await chrome.storage.local.set({ currentMode: mode });
    this.updateModeSwitcher(mode);
    this.updateStartButton(pointa);
  },

  /**
   * Get current mode from storage
   * @returns {Promise<string>} Current mode
   */
  async getCurrentMode() {
    try {
      const result = await chrome.storage.local.get(['currentMode']);
      return result.currentMode || 'annotation';
    } catch (error) {
      return 'annotation';
    }
  },

  /**
   * Show settings panel
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  showSettings(pointa) {
    const mainContent = this.sidebar.querySelector('#sidebar-main');
    if (!mainContent) return;

    mainContent.innerHTML = `
      <div class="sidebar-settings">
        <div class="sidebar-settings-header">
          <button id="sidebar-back-btn" class="sidebar-icon-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h2 class="sidebar-settings-title">Settings</h2>
        </div>
        
        <div class="sidebar-settings-body">
          <div class="sidebar-setting-group">
            <label>Theme</label>
            ${this.createCustomDropdown('sidebar-theme-select', [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }],
    'system', 'sidebar-select-wrapper')}
          </div>
          
          <div class="sidebar-setting-group">
            <label>Feedback & Support</label>
            <button id="sidebar-feedback-btn" class="sidebar-secondary-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Send Feedback
            </button>
            <button id="sidebar-bug-report-btn" class="sidebar-secondary-btn" style="margin-top: 8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="8" y="6" width="8" height="12" rx="2"/>
                <path d="M4 10h4M16 10h4M4 14h4M16 14h4"/>
                <path d="M12 6V2M8 2h8"/>
              </svg>
              Report a Bug
            </button>
            <p class="sidebar-setting-note">
              Help us improve Pointa by sharing feedback or reporting issues
            </p>
          </div>
          
          <div class="sidebar-setting-group">
            <label>Help & Setup</label>
            <button id="sidebar-setup-guide-btn" class="sidebar-secondary-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              Setup Guide
            </button>
            <p class="sidebar-setting-note">
              Review the setup instructions and learn how to use Pointa
            </p>
          </div>
        </div>
      </div>
    `;

    // Set up settings listeners
    const backBtn = this.sidebar.querySelector('#sidebar-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        // Check server status based on page type (same logic as initial sidebar open)
        // For localhost: check via direct health endpoint
        // For non-localhost: check via API through background script
        const isLocalhost = PointaUtils.isLocalhostUrl();
        const serverOnline = isLocalhost ?
        await this.checkServerStatus() :
        (await pointa.checkAPIStatus()).connected;
        await this.updateContent(pointa, serverOnline);
      });
    }

    // Theme select
    const themeWrapper = this.sidebar.querySelector('[data-select-id="sidebar-theme-select"]');
    if (themeWrapper) {
      const themeOptions = [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' }];


      chrome.storage.local.get(['themePreference'], (result) => {
        const currentTheme = result.themePreference || 'system';
        const hiddenInput = themeWrapper.querySelector('input[type="hidden"]');
        const valueSpan = themeWrapper.querySelector('.pointa-custom-select-value');

        if (hiddenInput) {
          hiddenInput.value = currentTheme;
        }
        if (valueSpan) {
          const currentOption = themeOptions.find((opt) => opt.value === currentTheme);
          if (currentOption) {
            valueSpan.textContent = currentOption.label;
          }
        }
      });

      this.setupCustomDropdown(themeWrapper, themeOptions, async (newTheme) => {
        await chrome.storage.local.set({ themePreference: newTheme });
        PointaThemeManager.apply(newTheme);
        this.sidebar.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
      });
    }

    // Feedback button
    const feedbackBtn = this.sidebar.querySelector('#sidebar-feedback-btn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
        this.showFeedbackModal();
      });
    }

    // Bug report button
    const bugReportBtn = this.sidebar.querySelector('#sidebar-bug-report-btn');
    if (bugReportBtn) {
      bugReportBtn.addEventListener('click', () => {
        this.showBugReportModal(pointa);
      });
    }

    // Setup guide button
    const setupGuideBtn = this.sidebar.querySelector('#sidebar-setup-guide-btn');
    if (setupGuideBtn) {
      setupGuideBtn.addEventListener('click', () => {
        // Close sidebar
        this.close(pointa);
        // Show onboarding
        if (window.VibeOnboarding) {
          window.VibeOnboarding.show();
        }
      });
    }
  },

  /**
   * Show feedback modal overlay
   */
  showFeedbackModal() {
    const modal = document.createElement('div');
    modal.id = 'pointa-feedback-modal';
    modal.innerHTML = `
      <div class="pointa-modal-overlay">
        <div class="pointa-modal-content pointa-feedback-modal">
          <div class="pointa-modal-header">
            <h2>Send Feedback</h2>
            <button id="close-feedback-modal" class="sidebar-icon-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="pointa-modal-body">
            <iframe 
              src="https://tally.so/r/5BBVMQ?transparentBackground=1" 
              width="100%" 
              height="100%" 
              frameborder="0" 
              marginheight="0" 
              marginwidth="0" 
              title="Feedback Form"
            ></iframe>
          </div>
        </div>
      </div>
    `;

    this.sidebar.appendChild(modal);

    // Track feedback opens
    chrome.storage.local.get(['feedbackOpened'], (result) => {
      const count = (result.feedbackOpened || 0) + 1;
      chrome.storage.local.set({ feedbackOpened: count });
    });

    // Close button
    const closeBtn = modal.querySelector('#close-feedback-modal');
    closeBtn.addEventListener('click', () => modal.remove());

    // Click outside to close
    const overlay = modal.querySelector('.pointa-modal-overlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        modal.remove();
      }
    });

    // ESC key to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  /**
   * Show bug report modal with context
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async showBugReportModal(pointa) {
    // Gather context information
    const context = await this.gatherBugReportContext(pointa);

    // Build URL with parameters (only essential debugging info)
    const params = new URLSearchParams({
      transparentBackground: '1',
      extension_version: context.extensionVersion,
      browser: context.browser,
      os: context.os,
      page_type: context.pageType
    });

    const modal = document.createElement('div');
    modal.id = 'pointa-bug-report-modal';
    modal.innerHTML = `
      <div class="pointa-modal-overlay">
        <div class="pointa-modal-content pointa-bug-modal">
          <div class="pointa-modal-header">
            <h2>Report a Bug</h2>
            <button id="close-bug-modal" class="sidebar-icon-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="pointa-modal-body">
            <iframe 
              src="https://tally.so/r/MeeVVl?${params.toString()}" 
              width="100%" 
              height="100%" 
              frameborder="0" 
              marginheight="0" 
              marginwidth="0" 
              title="Bug Report Form"
            ></iframe>
          </div>
        </div>
      </div>
    `;

    this.sidebar.appendChild(modal);

    // Track bug report opens
    chrome.storage.local.get(['bugReportOpened'], (result) => {
      const count = (result.bugReportOpened || 0) + 1;
      chrome.storage.local.set({ bugReportOpened: count });
    });

    // Close button
    const closeBtn = modal.querySelector('#close-bug-modal');
    closeBtn.addEventListener('click', () => modal.remove());

    // Click outside to close
    const overlay = modal.querySelector('.pointa-modal-overlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        modal.remove();
      }
    });

    // ESC key to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  /**
   * Gather context information for bug reports
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @returns {Promise<Object>} Context data
   */
  async gatherBugReportContext(pointa) {
    // Extension version
    const extensionVersion = chrome.runtime.getManifest().version;

    // Browser info (parse user agent)
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    if (ua.includes('Edg/')) {
      browser = 'Edge ' + ua.match(/Edg\/(\d+)/)?.[1];
    } else if (ua.includes('Chrome/')) {
      browser = 'Chrome ' + ua.match(/Chrome\/(\d+)/)?.[1];
    } else if (ua.includes('Firefox/')) {
      browser = 'Firefox ' + ua.match(/Firefox\/(\d+)/)?.[1];
    }

    // OS
    let os = 'Unknown';
    if (ua.includes('Windows')) os = 'Windows';else
    if (ua.includes('Mac OS')) os = 'macOS';else
    if (ua.includes('Linux')) os = 'Linux';else
    if (ua.includes('Android')) os = 'Android';else
    if (ua.includes('iOS')) os = 'iOS';

    // Page type
    const url = window.location.href;
    let pageType = 'web';
    if (url.startsWith('file://')) pageType = 'file';else
    if (PointaUtils.isLocalhostUrl()) pageType = 'localhost';

    return {
      extensionVersion,
      browser,
      os,
      pageType
    };
  },

  /**
   * Refresh sidebar content
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  async refresh(pointa) {
    // Reload annotations
    await pointa.loadAnnotations();

    // Check server status
    const serverOnline = await this.checkServerStatus();

    // Update content
    await this.updateContent(pointa, serverOnline);

    // Update server status indicator
    const statusIndicator = this.sidebar.querySelector('.sidebar-status-indicator');
    const statusText = this.sidebar.querySelector('.sidebar-status-text');

    if (statusIndicator && statusText) {
      statusIndicator.className = `sidebar-status-indicator ${serverOnline ? 'online' : 'offline'}`;
      statusText.textContent = serverOnline ? 'Server online' : 'Server offline';
    }
  },

  /**
   * Set up storage listener for auto-refresh on annotation changes
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupStorageListener(pointa) {
    // Remove existing listener if any
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
    }

    // Create new listener
    this.storageListener = async (changes, namespace) => {
      if (namespace === 'local' && changes.annotations) {
        // Skip rebuild if we just saved locally (prevents duplicate annotations)
        if (pointa.isLocalSave) {
          // Don't reset the flag here - let the global listener handle it
          // But we should still update the sidebar to show the new annotation
          // The annotation was already added to pointa.annotations in saveAnnotation()
          // So we just need to refresh the sidebar UI without reloading from storage
          const serverOnline = await this.checkServerStatus();
          await this.updateContent(pointa, serverOnline);
          return;
        }

        // Reload annotations in Pointa
        await pointa.loadAnnotations();

        // Check server status
        const serverOnline = await this.checkServerStatus();

        // Update sidebar content
        await this.updateContent(pointa, serverOnline);
      }
    };

    // Add listener
    chrome.storage.onChanged.addListener(this.storageListener);
  },

  /**
   * Set up resize handle for sidebar
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupResizeHandle(pointa) {
    const resizeHandle = this.sidebar.querySelector('.sidebar-resize-handle');
    if (!resizeHandle) return;

    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      this.isResizing = true;
      startX = e.clientX;
      startWidth = this.sidebarWidth;

      // Add resizing class for visual feedback
      this.sidebar.classList.add('resizing');
      document.body.classList.add('sidebar-resizing');

      // Disable transitions during resize
      document.body.style.transition = 'none';
      this.sidebar.style.transition = 'none';

      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.isResizing) return;

      const deltaX = startX - e.clientX;
      const newWidth = Math.max(280, Math.min(800, startWidth + deltaX));

      this.sidebarWidth = newWidth;
      this.sidebar.style.width = `${newWidth}px`;
      document.body.style.marginRight = `${newWidth}px`;
    };

    const onMouseUp = () => {
      if (!this.isResizing) return;

      this.isResizing = false;

      // Remove resizing class
      this.sidebar.classList.remove('resizing');
      document.body.classList.remove('sidebar-resizing');

      // Re-enable transitions
      document.body.style.transition = 'margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.sidebar.style.transition = 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

      // Save the new width
      chrome.storage.local.set({ sidebarWidth: this.sidebarWidth });
    };

    resizeHandle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  },

  /**
   * Start automatic status polling
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  startStatusPolling(pointa) {
    // Clear any existing interval
    this.stopStatusPolling();

    // Poll every 3 seconds
    this.statusPollInterval = setInterval(async () => {
      if (!this.isOpen || !this.sidebar) {
        this.stopStatusPolling();
        return;
      }

      // Check server status based on page type
      // For localhost: check via direct health endpoint
      // For non-localhost: check via API through background script
      const isLocalhost = PointaUtils.isLocalhostUrl();
      const serverOnline = isLocalhost ?
      await this.checkServerStatus() :
      (await pointa.checkAPIStatus()).connected;

      // Update status indicator
      const statusIndicator = this.sidebar.querySelector('.sidebar-status-indicator');
      const statusText = this.sidebar.querySelector('.sidebar-status-text');

      if (statusIndicator && statusText) {
        const wasOnline = statusIndicator.classList.contains('online');

        // Update UI
        statusIndicator.className = `sidebar-status-indicator ${serverOnline ? 'online' : 'offline'}`;
        statusText.textContent = serverOnline ? 'Server online' : 'Server offline';

        // Track if server comes online (for first-time detection)
        if (serverOnline && !wasOnline) {
          await chrome.storage.local.set({ serverWasOnline: true });
        }

        // If status changed, refresh content
        if (wasOnline !== serverOnline) {
          await this.updateContent(pointa, serverOnline);
        }
      }
    }, 3000);
  },

  /**
   * Stop automatic status polling
   */
  stopStatusPolling() {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = null;
    }
  },

  /**
   * Check server connection status
   * @returns {Promise<boolean>} Server online status
   */
  async checkServerStatus() {
    // CRITICAL: Never make localhost requests on external websites
    // This prevents browser local network permission dialogs on non-localhost pages
    const isLocalhost = PointaUtils.isLocalhostUrl(window.location.href);
    if (!isLocalhost) {
      // Return false immediately without making any network requests
      return false;
    }

    try {
      const response = await fetch('http://127.0.0.1:4242/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  /**
   * Disable annotation controls on non-localhost pages
   */
  disableAnnotationControls() {
    if (!this.sidebar) return;

    const modeSwitcher = this.sidebar.querySelector('.sidebar-mode-switcher');
    const startBtn = this.sidebar.querySelector('#sidebar-start-btn');
    const annotationModeBtn = this.sidebar.querySelector('#sidebar-annotation-mode-btn');
    const designModeBtn = this.sidebar.querySelector('#sidebar-design-mode-btn');

    // Disable and style buttons
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.style.opacity = '0.5';
      startBtn.style.cursor = 'not-allowed';
      startBtn.title = 'Only available on localhost pages';
    }

    if (annotationModeBtn) {
      annotationModeBtn.disabled = true;
      annotationModeBtn.style.opacity = '0.5';
      annotationModeBtn.style.cursor = 'not-allowed';
    }

    if (designModeBtn) {
      designModeBtn.disabled = true;
      designModeBtn.style.opacity = '0.5';
      designModeBtn.style.cursor = 'not-allowed';
    }
  },

  /**
   * Enable annotation controls on localhost pages
   */
  enableAnnotationControls() {
    if (!this.sidebar) return;

    const startBtn = this.sidebar.querySelector('#sidebar-start-btn');
    const annotationModeBtn = this.sidebar.querySelector('#sidebar-annotation-mode-btn');
    const designModeBtn = this.sidebar.querySelector('#sidebar-design-mode-btn');

    // Enable and reset style for buttons
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.style.opacity = '';
      startBtn.style.cursor = '';
      startBtn.title = '';
    }

    if (annotationModeBtn) {
      annotationModeBtn.disabled = false;
      annotationModeBtn.style.opacity = '';
      annotationModeBtn.style.cursor = '';
    }

    if (designModeBtn) {
      designModeBtn.disabled = false;
      designModeBtn.style.opacity = '';
      designModeBtn.style.cursor = '';
    }
  }
};

// Make PointaSidebar globally available
window.PointaSidebar = PointaSidebar;
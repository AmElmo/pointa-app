/**
 * inspiration-mode.js
 * 
 * Handles inspiration mode for capturing UI elements from external websites
 * Features: CSS Scan-style hover UI, element selection, metadata extraction, screenshot capture
 */

const InspirationMode = {
  isActive: false,
  hoveredElement: null,
  selectedElement: null,
  captureModeEnabled: true, // Control whether hover capture is active
  metadataPanel: null,
  highlightBox: null,
  elementBorder: null,
  overlay: null,
  overlayDimmer: null,
  overlayHighlight: null,
  overlayActionPanel: null,
  scrollUpdateTimeout: null,

  /**
   * Start inspiration mode
   */
  start() {
    const wasAlreadyActive = this.isActive;

    if (!wasAlreadyActive) {

      this.isActive = true;

      // Add body class for cursor styling
      document.body.classList.add('pointa-inspiration-mode-active');

      // Create highlight box
      this.createHighlightBox();

      // Create metadata panel
      this.createMetadataPanel();

      // Set up event listeners
      this.setupEventListeners();

      // Show instruction overlay
      this.showInstructionOverlay();
    } else {

    }

    // Always enable capture mode when starting (or restarting)
    this.captureModeEnabled = true;

    // Reset selected element state if needed
    if (this.selectedElement) {
      this.deselectElement();
    }

    // Ensure highlight box is ready (it might have been hidden)
    if (this.highlightBox) {
      // Don't force display here - let it show naturally on hover
      // But make sure elementBorder is also ready
      if (this.elementBorder) {
        this.elementBorder.style.display = '';
      }
    }
  },

  /**
   * Stop inspiration mode
   */
  stop() {
    if (!this.isActive) return;


    this.isActive = false;

    // Remove body class for cursor styling
    document.body.classList.remove('pointa-inspiration-mode-active');

    // Remove event listeners
    this.removeEventListeners();

    // Clean up UI elements
    this.cleanupUI();
  },

  /**
   * Create highlight box for element selection (CSS Scan style with dotted lines)
   */
  createHighlightBox() {
    // Create container for all guide lines
    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'pointa-inspiration-highlight-box';
    this.highlightBox.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483645;
      display: none;
    `;

    // Create four guide lines (top, right, bottom, left)
    this.highlightTop = document.createElement('div');
    this.highlightTop.className = 'pointa-inspiration-guide-line pointa-inspiration-guide-top';

    this.highlightRight = document.createElement('div');
    this.highlightRight.className = 'pointa-inspiration-guide-line pointa-inspiration-guide-right';

    this.highlightBottom = document.createElement('div');
    this.highlightBottom.className = 'pointa-inspiration-guide-line pointa-inspiration-guide-bottom';

    this.highlightLeft = document.createElement('div');
    this.highlightLeft.className = 'pointa-inspiration-guide-line pointa-inspiration-guide-left';

    // Create prominent border overlay for the element itself
    this.elementBorder = document.createElement('div');
    this.elementBorder.className = 'pointa-inspiration-element-border';

    this.highlightBox.appendChild(this.highlightTop);
    this.highlightBox.appendChild(this.highlightRight);
    this.highlightBox.appendChild(this.highlightBottom);
    this.highlightBox.appendChild(this.highlightLeft);
    this.highlightBox.appendChild(this.elementBorder);

    document.body.appendChild(this.highlightBox);
  },

  /**
   * Check if sidebar is open
   */
  isSidebarOpen() {
    return document.getElementById('pointa-sidebar') !== null;
  },

  /**
   * Disable capture mode (stop hover highlighting)
   */
  disableCaptureMode() {
    this.captureModeEnabled = false;
    this.hideHighlight();
    this.hideMetadataPanel();
    this.hoveredElement = null;
  },

  /**
   * Enable capture mode (allow hover highlighting)
   */
  enableCaptureMode() {
    // Only enable if sidebar is closed
    if (!this.isSidebarOpen()) {
      this.captureModeEnabled = true;
    }
  },

  /**
   * Create metadata panel
   */
  createMetadataPanel() {
    this.metadataPanel = document.createElement('div');
    this.metadataPanel.className = 'pointa-inspiration-metadata-panel';
    this.metadataPanel.style.display = 'none';
    document.body.appendChild(this.metadataPanel);
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);

    document.addEventListener('mouseover', this.handleMouseOver, true);
    document.addEventListener('mouseout', this.handleMouseOut, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('scroll', this.handleScroll, true);
    document.addEventListener('scroll', this.handleScroll, true);
    window.addEventListener('resize', this.handleResize);
  },

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('scroll', this.handleScroll, true);
    document.removeEventListener('scroll', this.handleScroll, true);
    window.removeEventListener('resize', this.handleResize);
  },

  /**
   * Handle mouse over - highlight element and show metadata
   */
  handleMouseOver(e) {
    if (!this.isActive || this.selectedElement) return;

    // Don't highlight if capture mode is disabled or sidebar is open
    if (!this.captureModeEnabled || this.isSidebarOpen()) {
      this.hideHighlight();
      this.hideMetadataPanel();
      this.hoveredElement = null;
      return;
    }

    const element = e.target;

    // Ignore our own UI elements (including sidebar)
    if (this.isInspirationUIElement(element)) {
      // Hide highlight and metadata when hovering over UI elements
      this.hideHighlight();
      this.hideMetadataPanel();
      this.hoveredElement = null;
      return;
    }

    // Only update if different element
    if (this.hoveredElement !== element) {
      this.hoveredElement = element;
      this.highlightElement(element);
      this.updateMetadataPanel(element);
    }
  },

  /**
   * Handle mouse out - clear highlights
   */
  handleMouseOut(e) {
    if (!this.isActive || this.selectedElement) return;

    // Don't process if capture mode is disabled
    if (!this.captureModeEnabled || this.isSidebarOpen()) {
      return;
    }

    const element = e.target;

    // Ignore our own UI elements
    if (this.isInspirationUIElement(element)) {
      return;
    }

    this.hoveredElement = null;
    this.hideHighlight();
    this.hideMetadataPanel();
  },

  /**
   * Handle click - select element
   */
  handleClick(e) {
    if (!this.isActive) return;

    const element = e.target;

    // Ignore our own UI elements (don't preventDefault for buttons!)
    if (this.isInspirationUIElement(element)) {
      return;
    }

    // If element is already selected, don't handle
    if (this.selectedElement) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Select this element
    this.selectElement(element);
  },

  /**
   * Handle keyboard events
   */
  handleKeyDown(e) {
    if (!this.isActive) return;

    // ESC to cancel - always exit inspiration mode (matching annotation/design mode behavior)
    if (e.key === 'Escape') {
      e.preventDefault();
      this.stop();
      // Notify content script to close sidebar or reset state
      window.postMessage({ type: 'INSPIRATION_MODE_CANCELLED' }, '*');
    }
  },

  /**
   * Handle scroll events - update overlay positions when element is selected
   */
  handleScroll(e) {
    if (!this.isActive) return;

    // Throttle scroll updates for performance
    if (this.scrollUpdateTimeout) {
      clearTimeout(this.scrollUpdateTimeout);
    }

    this.scrollUpdateTimeout = setTimeout(() => {
      if (this.selectedElement) {
        this.updateOverlayPositions();
      }
    }, 16); // ~60fps
  },

  /**
   * Handle resize events - update overlay positions when element is selected
   */
  handleResize(e) {
    if (!this.isActive) return;

    // Throttle resize updates for performance
    if (this.scrollUpdateTimeout) {
      clearTimeout(this.scrollUpdateTimeout);
    }

    this.scrollUpdateTimeout = setTimeout(() => {
      if (this.selectedElement) {
        this.updateOverlayPositions();
      }
    }, 16); // ~60fps
  },

  /**
   * Update overlay positions based on current element position
   */
  updateOverlayPositions() {
    if (!this.selectedElement || !this.overlay) return;

    const rect = this.selectedElement.getBoundingClientRect();

    // Update dimmer clip-path
    if (this.overlayDimmer) {
      this.overlayDimmer.style.clipPath = `polygon(
        0% 0%, 
        0% 100%, 
        ${rect.left}px 100%, 
        ${rect.left}px ${rect.top}px, 
        ${rect.right}px ${rect.top}px, 
        ${rect.right}px ${rect.bottom}px, 
        ${rect.left}px ${rect.bottom}px, 
        ${rect.left}px 100%, 
        100% 100%, 
        100% 0%
      )`;
    }

    // Update highlight box position
    if (this.overlayHighlight) {
      this.overlayHighlight.style.left = `${rect.left}px`;
      this.overlayHighlight.style.top = `${rect.top}px`;
      this.overlayHighlight.style.width = `${rect.width}px`;
      this.overlayHighlight.style.height = `${rect.height}px`;
    }

    // Update action panel position (keep it relative to element)
    if (this.overlayActionPanel) {
      let panelLeft = rect.right + 20;
      let panelTop = rect.top;

      // Adjust if off-screen
      if (panelLeft + 300 > window.innerWidth) {
        panelLeft = rect.left - 320;
      }
      if (panelLeft < 20) {
        panelLeft = 20;
      }
      if (panelTop + 200 > window.innerHeight) {
        panelTop = window.innerHeight - 220;
      }
      if (panelTop < 20) {
        panelTop = 20;
      }

      this.overlayActionPanel.style.left = `${panelLeft}px`;
      this.overlayActionPanel.style.top = `${panelTop}px`;
    }
  },

  /**
   * Check if element is part of inspiration UI
   */
  isInspirationUIElement(element) {
    if (!element) return false;

    // Check if element is within sidebar
    if (element.closest('#pointa-sidebar')) {
      return true;
    }

    // Check if element is within sidebar dropdowns (which are appended to body)
    if (element.closest('.pointa-spacing-dropdown')) {
      return true;
    }

    // Check if element is within sidebar page navigation dropdown
    if (element.closest('.sidebar-page-nav-dropdown')) {
      return true;
    }

    // Check if element is within inspiration modal
    if (element.closest('.pointa-inspiration-modal')) {
      return true;
    }

    const className = element.className;
    if (typeof className === 'string') {
      return className.includes('pointa-inspiration-') ||
      className.includes('pointa-') ||
      element.closest('.pointa-inspiration-overlay') ||
      element.closest('.pointa-inspiration-action-panel') ||
      element.closest('.pointa-inspiration-metadata-panel');
    }

    return false;
  },

  /**
   * Highlight element with CSS Scan-style dotted guide lines
   */
  highlightElement(element) {
    if (!this.highlightBox) return;

    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Show the container
    this.highlightBox.style.display = 'block';

    // Top horizontal line: extends from left edge to right edge at the top of the element
    this.highlightTop.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: 0;
      width: ${viewportWidth}px;
      height: 1px;
      border-top: 1px dotted #ff4444;
      box-sizing: border-box;
      pointer-events: none;
    `;

    // Right vertical line: extends from top edge to bottom edge at the right of the element
    this.highlightRight.style.cssText = `
      position: fixed;
      top: 0;
      left: ${rect.right}px;
      width: 1px;
      height: ${viewportHeight}px;
      border-right: 1px dotted #ff4444;
      box-sizing: border-box;
      pointer-events: none;
    `;

    // Bottom horizontal line: extends from left edge to right edge at the bottom of the element
    this.highlightBottom.style.cssText = `
      position: fixed;
      top: ${rect.bottom - 1}px;
      left: 0;
      width: ${viewportWidth}px;
      height: 1px;
      border-bottom: 1px dotted #ff4444;
      box-sizing: border-box;
      pointer-events: none;
    `;

    // Left vertical line: extends from top edge to bottom edge at the left of the element
    this.highlightLeft.style.cssText = `
      position: fixed;
      top: 0;
      left: ${rect.left}px;
      width: 1px;
      height: ${viewportHeight}px;
      border-left: 1px dotted #ff4444;
      box-sizing: border-box;
      pointer-events: none;
    `;

    // Prominent border overlay directly on the element
    if (this.elementBorder) {
      this.elementBorder.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 3px solid #ff4444;
        box-sizing: border-box;
        pointer-events: none;
        box-shadow: 0 0 0 1px rgba(255, 68, 68, 0.5), 0 0 8px rgba(255, 68, 68, 0.4);
        display: block;
      `;
    }
  },

  /**
   * Hide highlight box
   */
  hideHighlight() {
    if (this.highlightBox) {
      this.highlightBox.style.display = 'none';
    }
    if (this.elementBorder) {
      this.elementBorder.style.display = 'none';
    }
  },

  /**
   * Update metadata panel content and position (CSS Scan style)
   */
  updateMetadataPanel(element) {
    if (!this.metadataPanel) return;

    const metadata = this.extractBasicMetadata(element);

    // Build CSS properties array
    const cssProperties = [];

    // Dimensions (always show)
    cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-icon">📐</span> <span class="pointa-css-dim">${metadata.dimensions}</span></div>`);

    // Font Family
    if (metadata.fontFamily) {
      const fontShort = this.shortenFontFamily(metadata.fontFamily);
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">font-family:</span> <span class="pointa-css-val">${fontShort}</span></div>`);
    }

    // Font Size
    if (metadata.fontSize) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">font-size:</span> <span class="pointa-css-val">${metadata.fontSize}</span></div>`);
    }

    // Font Weight
    if (metadata.fontWeight) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">font-weight:</span> <span class="pointa-css-val">${metadata.fontWeight}</span></div>`);
    }

    // Line Height
    if (metadata.lineHeight) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">line-height:</span> <span class="pointa-css-val">${metadata.lineHeight}</span></div>`);
    }

    // Text Align
    if (metadata.textAlign) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">text-align:</span> <span class="pointa-css-val">${metadata.textAlign}</span></div>`);
    }

    // Color
    if (metadata.color) {
      const colorBox = `<span class="pointa-css-color-box" style="background: ${metadata.color}"></span>`;
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">color:</span> ${colorBox} <span class="pointa-css-val">${metadata.color}</span></div>`);
    }

    // Background Color
    if (metadata.backgroundColor) {
      const colorBox = `<span class="pointa-css-color-box" style="background: ${metadata.backgroundColor}"></span>`;
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">background:</span> ${colorBox} <span class="pointa-css-val">${metadata.backgroundColor}</span></div>`);
    }

    // Display
    if (metadata.display) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">display:</span> <span class="pointa-css-val">${metadata.display}</span></div>`);
    }

    // Position
    if (metadata.position) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">position:</span> <span class="pointa-css-val">${metadata.position}</span></div>`);
    }

    // Flexbox properties
    if (metadata.flexDirection) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">flex-direction:</span> <span class="pointa-css-val">${metadata.flexDirection}</span></div>`);
    }
    if (metadata.justifyContent) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">justify-content:</span> <span class="pointa-css-val">${metadata.justifyContent}</span></div>`);
    }
    if (metadata.alignItems) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">align-items:</span> <span class="pointa-css-val">${metadata.alignItems}</span></div>`);
    }
    if (metadata.gap) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">gap:</span> <span class="pointa-css-val">${metadata.gap}</span></div>`);
    }

    // Grid properties
    if (metadata.gridTemplateColumns) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">grid-template-columns:</span> <span class="pointa-css-val">${this.truncateValue(metadata.gridTemplateColumns, 30)}</span></div>`);
    }
    if (metadata.gridTemplateRows) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">grid-template-rows:</span> <span class="pointa-css-val">${this.truncateValue(metadata.gridTemplateRows, 30)}</span></div>`);
    }

    // Spacing
    if (metadata.margin) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">margin:</span> <span class="pointa-css-val">${metadata.margin}</span></div>`);
    }
    if (metadata.padding) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">padding:</span> <span class="pointa-css-val">${metadata.padding}</span></div>`);
    }

    // Border
    if (metadata.borderRadius) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">border-radius:</span> <span class="pointa-css-val">${metadata.borderRadius}</span></div>`);
    }
    if (metadata.borderWidth) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">border-width:</span> <span class="pointa-css-val">${metadata.borderWidth}</span></div>`);
    }
    if (metadata.borderStyle) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">border-style:</span> <span class="pointa-css-val">${metadata.borderStyle}</span></div>`);
    }
    if (metadata.borderColor) {
      const colorBox = `<span class="pointa-css-color-box" style="background: ${metadata.borderColor}"></span>`;
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">border-color:</span> ${colorBox} <span class="pointa-css-val">${metadata.borderColor}</span></div>`);
    }

    // Width/Height (if set)
    if (metadata.width) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">width:</span> <span class="pointa-css-val">${metadata.width}</span></div>`);
    }
    if (metadata.height) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">height:</span> <span class="pointa-css-val">${metadata.height}</span></div>`);
    }

    // Effects
    if (metadata.boxShadow) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">box-shadow:</span> <span class="pointa-css-val">${this.truncateValue(metadata.boxShadow, 40)}</span></div>`);
    }
    if (metadata.opacity) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">opacity:</span> <span class="pointa-css-val">${metadata.opacity}</span></div>`);
    }
    if (metadata.transform) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">transform:</span> <span class="pointa-css-val">${this.truncateValue(metadata.transform, 40)}</span></div>`);
    }
    if (metadata.filter) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">filter:</span> <span class="pointa-css-val">${this.truncateValue(metadata.filter, 40)}</span></div>`);
    }

    // Transition
    if (metadata.transition) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">transition:</span> <span class="pointa-css-val">${this.truncateValue(metadata.transition, 40)}</span></div>`);
    }

    // Overflow
    if (metadata.overflow) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">overflow:</span> <span class="pointa-css-val">${metadata.overflow}</span></div>`);
    }

    // Z-index
    if (metadata.zIndex) {
      cssProperties.push(`<div class="pointa-css-prop"><span class="pointa-css-key">z-index:</span> <span class="pointa-css-val">${metadata.zIndex}</span></div>`);
    }

    // Build pseudo-states sections
    let pseudoStatesHTML = '';
    if (metadata.pseudoStates) {
      const states = metadata.pseudoStates;

      // Hover state
      if (states.hover) {
        const hoverProps = Object.entries(states.hover).map(([key, value]) => {
          const cssProp = this.camelCaseToDash(key);
          let displayValue = value;

          // Add color box for color properties
          if (cssProp.includes('color') || cssProp.includes('background')) {
            displayValue = `<span class="pointa-css-color-box" style="background: ${value}"></span> ${value}`;
          }

          return `<div class="pointa-css-prop"><span class="pointa-css-key">${cssProp}:</span> <span class="pointa-css-val">${displayValue}</span></div>`;
        }).join('');

        pseudoStatesHTML += `
          <div class="pointa-css-state-section">
            <div class="pointa-css-state-header">:hover</div>
            ${hoverProps}
          </div>
        `;
      }

      // Focus state
      if (states.focus) {
        const focusProps = Object.entries(states.focus).map(([key, value]) => {
          const cssProp = this.camelCaseToDash(key);
          let displayValue = value;

          if (cssProp.includes('color') || cssProp.includes('background')) {
            displayValue = `<span class="pointa-css-color-box" style="background: ${value}"></span> ${value}`;
          }

          return `<div class="pointa-css-prop"><span class="pointa-css-key">${cssProp}:</span> <span class="pointa-css-val">${displayValue}</span></div>`;
        }).join('');

        pseudoStatesHTML += `
          <div class="pointa-css-state-section">
            <div class="pointa-css-state-header">:focus</div>
            ${focusProps}
          </div>
        `;
      }

      // Active state
      if (states.active) {
        const activeProps = Object.entries(states.active).map(([key, value]) => {
          const cssProp = this.camelCaseToDash(key);
          let displayValue = value;

          if (cssProp.includes('color') || cssProp.includes('background')) {
            displayValue = `<span class="pointa-css-color-box" style="background: ${value}"></span> ${value}`;
          }

          return `<div class="pointa-css-prop"><span class="pointa-css-key">${cssProp}:</span> <span class="pointa-css-val">${displayValue}</span></div>`;
        }).join('');

        pseudoStatesHTML += `
          <div class="pointa-css-state-section">
            <div class="pointa-css-state-header">:active</div>
            ${activeProps}
          </div>
        `;
      }
    }

    // Build panel HTML
    this.metadataPanel.innerHTML = `
      <div class="pointa-inspiration-metadata-header">
        <span class="pointa-inspiration-metadata-tag">${metadata.tagName}</span>
        ${metadata.className ? `<span class="pointa-inspiration-metadata-class">.${metadata.className.split(' ')[0]}</span>` : ''}
      </div>
      <div class="pointa-inspiration-metadata-content">
        ${cssProperties.join('')}
      </div>
      ${pseudoStatesHTML}
      ${metadata.hasMediaQueries ? '<div class="pointa-css-media-hint">📱 Responsive styles detected</div>' : ''}
    `;

    // Position panel with smart positioning
    this.positionMetadataPanel(element);

    this.metadataPanel.style.display = 'block';
  },

  /**
   * Convert camelCase to dash-case
   */
  camelCaseToDash(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  },

  /**
   * Shorten font family for display
   */
  shortenFontFamily(fontFamily) {
    // Take only the first font name
    const fonts = fontFamily.split(',');
    let firstFont = fonts[0].trim().replace(/['"]/g, '');

    // If it's a long system font stack, show first + count
    if (fonts.length > 3) {
      return `${firstFont}, ...`;
    }

    return fonts.slice(0, 2).map((f) => f.trim().replace(/['"]/g, '')).join(', ');
  },

  /**
   * Truncate long values
   */
  truncateValue(value, maxLength) {
    if (value.length > maxLength) {
      return value.substring(0, maxLength) + '...';
    }
    return value;
  },

  /**
   * Position metadata panel with smart logic
   */
  positionMetadataPanel(element) {
    const rect = element.getBoundingClientRect();
    const panelRect = this.metadataPanel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right + 10; // Default: right side
    let top = rect.top;

    // If too close to right edge, position on left
    if (left + panelRect.width > viewportWidth - 10) {
      left = rect.left - panelRect.width - 10;
    }

    // If still off-screen, center horizontally
    if (left < 10) {
      left = (viewportWidth - panelRect.width) / 2;
    }

    // If too close to bottom, adjust up
    if (top + panelRect.height > viewportHeight - 10) {
      top = viewportHeight - panelRect.height - 10;
    }

    // If too close to top
    if (top < 10) {
      top = 10;
    }

    this.metadataPanel.style.left = `${left}px`;
    this.metadataPanel.style.top = `${top}px`;
  },

  /**
   * Hide metadata panel
   */
  hideMetadataPanel() {
    if (this.metadataPanel) {
      this.metadataPanel.style.display = 'none';
    }
  },

  /**
   * Extract basic metadata for hover display (CSS Scan style)
   */
  extractBasicMetadata(element) {
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    // Get precise dimensions
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Extract relevant CSS properties
    const metadata = {
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      dimensions: `${width}×${height}`,

      // Layout
      display: computed.display,
      position: computed.position !== 'static' ? computed.position : null,

      // Typography
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight !== '400' ? computed.fontWeight : null,
      lineHeight: computed.lineHeight !== 'normal' ? computed.lineHeight : null,
      textAlign: computed.textAlign !== 'start' ? computed.textAlign : null,

      // Colors
      color: computed.color,
      backgroundColor: computed.backgroundColor !== 'rgba(0, 0, 0, 0)' ? computed.backgroundColor : null,

      // Spacing
      margin: this.formatSpacing(computed.margin),
      padding: this.formatSpacing(computed.padding),

      // Border
      borderRadius: computed.borderRadius !== '0px' ? computed.borderRadius : null,
      borderWidth: computed.borderWidth !== '0px' ? computed.borderWidth : null,
      borderStyle: computed.borderStyle !== 'none' ? computed.borderStyle : null,
      borderColor: computed.borderWidth !== '0px' ? computed.borderColor : null,

      // Effects
      boxShadow: computed.boxShadow !== 'none' ? computed.boxShadow : null,
      opacity: computed.opacity !== '1' ? computed.opacity : null,
      transform: computed.transform !== 'none' ? computed.transform : null,
      filter: computed.filter !== 'none' ? computed.filter : null,

      // Transitions
      transition: computed.transition !== 'all 0s ease 0s' ? computed.transition : null,

      // Flexbox (if parent or self is flex)
      flexDirection: computed.display === 'flex' ? computed.flexDirection : null,
      justifyContent: computed.display === 'flex' && computed.justifyContent !== 'normal' ? computed.justifyContent : null,
      alignItems: computed.display === 'flex' && computed.alignItems !== 'normal' ? computed.alignItems : null,
      gap: computed.gap !== 'normal' ? computed.gap : null,

      // Grid (if display is grid)
      gridTemplateColumns: computed.display === 'grid' ? computed.gridTemplateColumns : null,
      gridTemplateRows: computed.display === 'grid' ? computed.gridTemplateRows : null,

      // Overflow
      overflow: computed.overflow !== 'visible' ? computed.overflow : null,

      // Z-index
      zIndex: computed.zIndex !== 'auto' && computed.position !== 'static' ? computed.zIndex : null,

      // Width/Height (if explicitly set)
      width: computed.width !== 'auto' && !computed.width.includes('px') ? computed.width : null,
      height: computed.height !== 'auto' && !computed.height.includes('px') ? computed.height : null
    };

    // Detect media queries by checking multiple viewport sizes
    metadata.hasMediaQueries = this.detectMediaQueries(element);

    // Extract pseudo-class states (hover, focus, active)
    metadata.pseudoStates = this.extractPseudoStates(element);

    return metadata;
  },

  /**
   * Format spacing values (collapse if uniform)
   */
  formatSpacing(value) {
    if (!value || value === '0px') return null;

    // If it's a shorthand with same values, simplify
    const parts = value.split(' ');
    if (parts.length === 4 && parts.every((p) => p === parts[0])) {
      return parts[0];
    }

    return value;
  },

  /**
   * Detect if element has media queries applied
   */
  detectMediaQueries(element) {
    // Check if there are any stylesheets with media queries
    try {
      for (const sheet of document.styleSheets) {
        try {
          if (sheet.cssRules) {
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSMediaRule) {
                return true;
              }
            }
          }
        } catch (e) {

          // CORS error, skip
        }}
    } catch (e) {

      // Access error, skip
    }return false;
  },

  /**
   * Detect responsive styles for element (Feature 5: Responsive Capture)
   * Returns detailed info about media queries affecting this element
   */
  detectResponsiveStyles(element) {
    const affectedProperties = new Set();
    const breakpoints = new Set();

    try {
      for (const sheet of document.styleSheets) {
        try {
          if (sheet.cssRules) {
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSMediaRule) {
                // Check if this media rule affects our element
                for (const innerRule of rule.cssRules) {
                  if (innerRule instanceof CSSStyleRule && innerRule.selectorText) {
                    try {
                      if (element.matches(innerRule.selectorText)) {
                        // Extract breakpoint value from media query
                        const mediaText = rule.conditionText || rule.media.mediaText;
                        const bpMatch = mediaText.match(/(\d+)px/g);
                        if (bpMatch) {
                          bpMatch.forEach((bp) => breakpoints.add(bp));
                        }

                        // Track what properties change
                        for (let i = 0; i < innerRule.style.length; i++) {
                          affectedProperties.add(innerRule.style[i]);
                        }
                      }
                    } catch (matchError) {

                      // Selector matching failed, skip
                    }}
                }
              }
            }
          }
        } catch (e) {

          // CORS error, skip
        }}
    } catch (e) {
      console.error('[Inspiration Mode] Error detecting responsive styles:', e);
    }

    return {
      hasMediaQueries: breakpoints.size > 0,
      breakpoints: Array.from(breakpoints).sort((a, b) => parseInt(a) - parseInt(b)),
      affectedProperties: Array.from(affectedProperties)
    };
  },

  /**
   * Extract pseudo-class states (hover, focus, active, etc.)
   */
  extractPseudoStates(element) {
    const states = {};

    try {
      // Hover state - check all elements
      const hoverStyles = this.captureStateStylesRobust(element, ':hover');
      if (hoverStyles && Object.keys(hoverStyles).length > 0) {
        states.hover = hoverStyles;

      }

      // Focus state (only for interactive elements)
      if (this.isFocusable(element)) {
        const focusStyles = this.captureStateStylesRobust(element, ':focus');
        if (focusStyles && Object.keys(focusStyles).length > 0) {
          states.focus = focusStyles;

        }
      }

      // Active state
      const activeStyles = this.captureStateStylesRobust(element, ':active');
      if (activeStyles && Object.keys(activeStyles).length > 0) {
        states.active = activeStyles;

      }

    } catch (e) {
      console.error('[Inspiration Mode] Error capturing pseudo-states:', e);
    }

    return Object.keys(states).length > 0 ? states : null;
  },

  /**
   * Robust pseudo-state detection by parsing and matching CSS rules
   */
  captureStateStylesRobust(element, pseudoClass) {
    const baseComputedStyle = window.getComputedStyle(element);
    const changedProperties = {};
    let totalRulesFound = 0;
    let rulesMatched = 0;



    try {
      // Iterate through all stylesheets
      for (const stylesheet of document.styleSheets) {
        try {
          const rules = stylesheet.cssRules || stylesheet.rules;
          if (!rules) continue;

          for (const rule of rules) {
            // Only process style rules
            if (!(rule instanceof CSSStyleRule)) continue;
            if (!rule.selectorText) continue;

            // Check if this rule contains the pseudo-class we're looking for
            if (!rule.selectorText.includes(pseudoClass)) continue;

            totalRulesFound++;

            // Split by comma to handle multiple selectors in one rule
            const selectorList = rule.selectorText.split(',').map((s) => s.trim());

            for (const fullSelector of selectorList) {
              // Skip if this specific selector doesn't have the pseudo-class
              if (!fullSelector.includes(pseudoClass)) continue;

              // Extract base selector by removing the pseudo-class
              // Handle cases like: "button:hover", ".btn:hover:focus", "a:hover::before"
              const baseSelectorMatch = this.extractBaseSelector(fullSelector, pseudoClass);

              if (!baseSelectorMatch) {

                continue;
              }

              // Try to match the element with the base selector
              try {
                if (!element.matches(baseSelectorMatch)) continue;

                rulesMatched++;


                // Extract all CSS properties from this rule
                const style = rule.style;
                for (let i = 0; i < style.length; i++) {
                  const property = style[i];
                  const pseudoValue = style.getPropertyValue(property);
                  const baseValue = baseComputedStyle.getPropertyValue(property);

                  // Log if we encounter CSS variables (these might need special handling)
                  if (pseudoValue.includes('var(')) {

                  }

                  // Compare values - normalize for comparison
                  if (this.cssValuesAreDifferent(pseudoValue, baseValue)) {
                    const camelCaseProp = this.camelCase(property);
                    changedProperties[camelCaseProp] = pseudoValue;

                  }
                }
              } catch (matchError) {


              }
            }
          }
        } catch (sheetError) {
          // CORS or other stylesheet access error
          if (sheetError.name === 'SecurityError') {

          }
        }
      }
    } catch (error) {
      console.error('[Inspiration Mode] Error scanning stylesheets:', error);
    }

    const changeCount = Object.keys(changedProperties).length;


    return changedProperties;
  },

  /**
   * Extract base selector by removing pseudo-class
   * E.g., "button:hover" → "button", ".btn:hover:focus" → ".btn:focus"
   */
  extractBaseSelector(fullSelector, pseudoClassToRemove) {
    // Handle pseudo-elements after pseudo-classes (e.g., "a:hover::before")
    // We can't easily test pseudo-elements, so skip those
    if (fullSelector.includes('::')) {
      return null;
    }

    // Simple approach: replace the first occurrence of the pseudo-class
    // This handles most cases correctly
    const escapedPseudo = pseudoClassToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPseudo + '(?![-\\w])');
    const baseSelector = fullSelector.replace(regex, '').trim();

    // Validate the result
    if (!baseSelector || baseSelector.length === 0) {
      return null;
    }

    // Clean up any resulting issues (double colons, trailing colons, etc.)
    return baseSelector.replace(/::+/g, ':').replace(/:$/g, '').trim();
  },

  /**
   * Compare two CSS values to see if they're different
   * Handles various formats (rgb vs rgba, 0 vs 0px, etc.)
   */
  cssValuesAreDifferent(value1, value2) {
    if (value1 === value2) return false;
    if (!value1 || !value2) return true;

    // Normalize values for comparison
    const norm1 = this.normalizeCSSValue(value1);
    const norm2 = this.normalizeCSSValue(value2);

    return norm1 !== norm2;
  },

  /**
   * Normalize CSS value for comparison
   */
  normalizeCSSValue(value) {
    if (!value) return '';

    // Convert to lowercase
    let normalized = value.toLowerCase().trim();

    // Remove spaces around commas (for rgb, etc.)
    normalized = normalized.replace(/\s*,\s*/g, ',');

    // Remove unnecessary spaces
    normalized = normalized.replace(/\s+/g, ' ');

    return normalized;
  },

  /**
   * Old method - kept for backward compatibility but not used
   */
  captureStateStyles(element, pseudoClass) {
    return this.captureStateStylesRobust(element, pseudoClass);
  },

  /**
   * Check if element matches selector with pseudo-class
   */
  elementMatchesSelector(element, baseSelector, pseudoClass) {
    // Try various selector combinations
    const tagName = element.tagName.toLowerCase();
    const className = element.className ? `.${element.className.split(' ')[0]}` : '';
    const id = element.id ? `#${element.id}` : '';

    const possibleSelectors = [
    tagName + pseudoClass,
    tagName + className + pseudoClass,
    tagName + id + pseudoClass,
    className + pseudoClass,
    id + pseudoClass];


    return possibleSelectors.some((sel) => baseSelector.includes(sel.replace(pseudoClass, '')));
  },

  /**
   * Check if element is focusable
   */
  isFocusable(element) {
    const tag = element.tagName.toLowerCase();
    return ['input', 'textarea', 'select', 'button', 'a'].includes(tag) ||
    element.hasAttribute('tabindex') ||
    element.getAttribute('contenteditable') === 'true';
  },

  /**
   * Convert CSS property to camelCase
   */
  camelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  },

  /**
   * Select element and show save overlay
   */
  selectElement(element) {


    this.selectedElement = element;

    // Hide both highlight box and metadata panel
    this.hideHighlight();
    this.hideMetadataPanel();

    // Show save overlay
    this.showSaveOverlay(element);
  },

  /**
   * Deselect element
   */
  deselectElement() {


    this.selectedElement = null;

    // Clear scroll update timeout
    if (this.scrollUpdateTimeout) {
      clearTimeout(this.scrollUpdateTimeout);
      this.scrollUpdateTimeout = null;
    }

    // Remove overlay
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    // Clear overlay element references
    this.overlayDimmer = null;
    this.overlayHighlight = null;
    this.overlayActionPanel = null;

    // Re-show highlight box for hover mode
    if (this.highlightBox) {
      this.highlightBox.style.display = 'none';
    }
  },

  /**
   * Show save overlay
   */
  showSaveOverlay(element) {
    const rect = element.getBoundingClientRect();

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'pointa-inspiration-overlay';

    // Create dimmed background with cutout for element
    const dimmer = document.createElement('div');
    dimmer.className = 'pointa-inspiration-overlay-dimmer';
    // Use clip-path to create a cutout around the element
    dimmer.style.clipPath = `polygon(
      0% 0%, 
      0% 100%, 
      ${rect.left}px 100%, 
      ${rect.left}px ${rect.top}px, 
      ${rect.right}px ${rect.top}px, 
      ${rect.right}px ${rect.bottom}px, 
      ${rect.left}px ${rect.bottom}px, 
      ${rect.left}px 100%, 
      100% 100%, 
      100% 0%
    )`;
    this.overlay.appendChild(dimmer);
    this.overlayDimmer = dimmer; // Store reference for scroll updates

    // Create highlight for selected element
    const highlight = document.createElement('div');
    highlight.className = 'pointa-inspiration-overlay-highlight';
    highlight.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #ff4444;
      z-index: 2147483647;
      pointer-events: none;
    `;
    this.overlay.appendChild(highlight);
    this.overlayHighlight = highlight; // Store reference for scroll updates

    // Create action panel
    const actionPanel = document.createElement('div');
    actionPanel.className = 'pointa-inspiration-action-panel';

    // Detect available states
    const metadata = this.extractBasicMetadata(element);
    const hasHover = metadata.pseudoStates?.hover;
    const hasFocus = metadata.pseudoStates?.focus;
    const hasActive = metadata.pseudoStates?.active;

    // Build state checkboxes HTML
    let stateCheckboxesHTML = '';
    if (hasHover || hasFocus || hasActive) {
      stateCheckboxesHTML = `
        <div class="pointa-inspiration-state-selection">
          <div class="pointa-inspiration-state-title">Capture States:</div>
          ${hasHover ? `
            <label class="pointa-inspiration-state-checkbox">
              <input type="checkbox" id="pointa-state-hover" checked>
              <span>:hover <span class="pointa-state-badge">+ screenshot</span></span>
            </label>
          ` : ''}
          ${hasFocus ? `
            <label class="pointa-inspiration-state-checkbox">
              <input type="checkbox" id="pointa-state-focus" checked>
              <span>:focus</span>
            </label>
          ` : ''}
          ${hasActive ? `
            <label class="pointa-inspiration-state-checkbox">
              <input type="checkbox" id="pointa-state-active" checked>
              <span>:active</span>
            </label>
          ` : ''}
        </div>
      `;
    }

    // Detect responsive styles (Feature 5: Responsive Capture)
    // Only show responsive options for larger container elements
    // Show options if element qualifies, regardless of media query detection
    // (media query detection can fail due to CORS, but element might still be responsive)
    const responsiveInfo = this.detectResponsiveStyles(element);
    let responsiveCheckboxesHTML = '';
    if (this.shouldShowResponsiveCapture(element)) {
      responsiveCheckboxesHTML = `
        <div class="pointa-inspiration-responsive-section">
          <div class="pointa-inspiration-responsive-title">
            📱 Capture responsive states
            ${responsiveInfo.hasMediaQueries && responsiveInfo.breakpoints.length > 0 ? `<small>(${responsiveInfo.breakpoints.join(', ')})</small>` : ''}
          </div>
          <label class="pointa-inspiration-responsive-checkbox">
            <input type="checkbox" id="pointa-responsive-desktop" checked>
            <span>Desktop (1440px)</span>
          </label>
          <label class="pointa-inspiration-responsive-checkbox">
            <input type="checkbox" id="pointa-responsive-tablet">
            <span>Tablet (768px)</span>
          </label>
          <label class="pointa-inspiration-responsive-checkbox">
            <input type="checkbox" id="pointa-responsive-mobile">
            <span>Mobile (375px)</span>
          </label>
          <small class="pointa-responsive-hint">Will be captured automatically</small>
        </div>
      `;
    }

    actionPanel.innerHTML = `
      ${stateCheckboxesHTML}
      ${responsiveCheckboxesHTML}
      <div class="pointa-inspiration-action-buttons">
        <button class="pointa-inspiration-btn pointa-inspiration-btn-cancel">Cancel</button>
        <button class="pointa-inspiration-btn pointa-inspiration-btn-save">Save Inspiration</button>
      </div>
    `;

    // Position action panel
    let panelLeft = rect.right + 20;
    let panelTop = rect.top;

    // Adjust if off-screen
    if (panelLeft + 300 > window.innerWidth) {
      panelLeft = rect.left - 320;
    }
    if (panelLeft < 20) {
      panelLeft = 20;
    }
    if (panelTop + 200 > window.innerHeight) {
      panelTop = window.innerHeight - 220;
    }
    if (panelTop < 20) {
      panelTop = 20;
    }

    actionPanel.style.left = `${panelLeft}px`;
    actionPanel.style.top = `${panelTop}px`;

    this.overlay.appendChild(actionPanel);
    this.overlayActionPanel = actionPanel; // Store reference for scroll updates

    // Add event listeners (use normal phase, not capture)
    const cancelBtn = actionPanel.querySelector('.pointa-inspiration-btn-cancel');
    const saveBtn = actionPanel.querySelector('.pointa-inspiration-btn-save');

    const handleCancel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.deselectElement();
    };

    const handleSave = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      await this.saveInspiration(element);
    };

    cancelBtn.addEventListener('click', handleCancel, false);
    saveBtn.addEventListener('click', handleSave, false);

    // Click dimmer to cancel
    dimmer.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.deselectElement();
    }, false);

    document.body.appendChild(this.overlay);


  },

  /**
   * Save inspiration
   */
  async saveInspiration(element) {


    try {
      // Get selected states from checkboxes
      const hoverCheckbox = document.getElementById('pointa-state-hover');
      const focusCheckbox = document.getElementById('pointa-state-focus');
      const activeCheckbox = document.getElementById('pointa-state-active');

      const captureHover = hoverCheckbox?.checked || false;
      const captureFocus = focusCheckbox?.checked || false;
      const captureActive = activeCheckbox?.checked || false;

      // Extract full metadata
      const metadata = this.extractFullMetadata(element);

      // Filter pseudoStates based on user selection
      if (metadata.pseudoStates) {
        const filteredStates = {};
        if (captureHover && metadata.pseudoStates.hover) {
          filteredStates.hover = metadata.pseudoStates.hover;
        }
        if (captureFocus && metadata.pseudoStates.focus) {
          filteredStates.focus = metadata.pseudoStates.focus;
        }
        if (captureActive && metadata.pseudoStates.active) {
          filteredStates.active = metadata.pseudoStates.active;
        }

        // Update metadata with filtered states (or remove if none selected)
        metadata.pseudoStates = Object.keys(filteredStates).length > 0 ? filteredStates : null;
      }

      // Hide the overlay temporarily to get a clear screenshot
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }

      // Small delay to ensure overlay is hidden before screenshot
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check if responsive capture is selected (Feature 5)
      const mobileCheckbox = document.getElementById('pointa-responsive-mobile');
      const tabletCheckbox = document.getElementById('pointa-responsive-tablet');
      const desktopCheckbox = document.getElementById('pointa-responsive-desktop');







      const selectedBreakpoints = {};
      if (mobileCheckbox?.checked) selectedBreakpoints.mobile = 375;
      if (tabletCheckbox?.checked) selectedBreakpoints.tablet = 768;
      if (desktopCheckbox?.checked) selectedBreakpoints.desktop = 1440;



      const isResponsiveCapture = Object.keys(selectedBreakpoints).length > 0;


      // Capture base screenshot only if NOT doing responsive capture
      let screenshotDataUrl = null;
      if (!isResponsiveCapture) {

        screenshotDataUrl = await this.captureElementScreenshot(element);
      }

      // Capture hover screenshot if selected
      let hoverScreenshotDataUrl = null;
      if (captureHover && metadata.pseudoStates?.hover) {

        hoverScreenshotDataUrl = await this.captureHoverScreenshot(element);
      }

      // Capture responsive screenshots if selected
      let responsiveScreenshots = null;
      if (isResponsiveCapture) {
        // Update button to show progress
        const saveBtn = document.querySelector('.pointa-inspiration-btn-save');
        if (saveBtn) {
          saveBtn.textContent = 'Capturing responsive states...';
          saveBtn.disabled = true;
        }

        responsiveScreenshots = await this.captureResponsiveStates(element, selectedBreakpoints);

        if (saveBtn) {
          saveBtn.textContent = 'Saving...';
        }
      }

      // Show overlay again
      if (this.overlay) {
        this.overlay.style.display = 'block';
      }

      // Get domain and URL info
      const url = window.location.href;
      const domain = window.location.hostname;
      const title = document.title;

      // Detect element category
      const category = this.categorizeElement(element);

      // Generate IDs
      const inspirationId = 'insp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const screenshotId = screenshotDataUrl ? 'screenshot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) : null;
      const hoverScreenshotId = hoverScreenshotDataUrl ? 'screenshot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_hover' : null;

      // Build inspiration object
      const inspiration = {
        id: inspirationId,
        domain: domain,
        url: url,
        title: title,
        element: {
          tagName: element.tagName.toLowerCase(),
          selector: this.generateSelector(element),
          category: category
        },
        screenshot: {
          id: screenshotId,
          hover: hoverScreenshotId,
          responsive: responsiveScreenshots ? true : false
        },
        metadata: metadata,
        created: new Date().toISOString()
      };

      // Send to background script
      const response = await chrome.runtime.sendMessage({
        action: 'saveInspiration',
        inspiration: inspiration,
        screenshotDataUrl: screenshotDataUrl,
        hoverScreenshotDataUrl: hoverScreenshotDataUrl,
        responsiveScreenshots: responsiveScreenshots
      });

      if (response.success) {

        this.showSuccessMessage();

        // Exit inspiration mode completely (removes cursor and all UI)
        this.stop();

        // Notify to refresh sidebar with inspiration ID (this will trigger sidebar opening)
        window.postMessage({
          type: 'INSPIRATION_SAVED',
          inspirationId: inspirationId
        }, '*');
      } else {
        throw new Error(response.error || 'Failed to save inspiration');
      }

    } catch (error) {
      console.error('[Inspiration Mode] Error saving inspiration:', error);
      this.showErrorMessage(error.message);
    }
  },

  /**
   * Extract full metadata for saving (comprehensive CSS capture)
   */
  extractFullMetadata(element) {
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    // Layout & Box Model
    const layout = {
      display: computed.display,
      position: computed.position,
      boxSizing: computed.boxSizing,
      float: computed.float,
      clear: computed.clear,
      overflow: computed.overflow,
      overflowX: computed.overflowX,
      overflowY: computed.overflowY,
      visibility: computed.visibility,
      zIndex: computed.zIndex
    };

    // Flexbox
    const flexbox = {
      flexDirection: computed.flexDirection,
      flexWrap: computed.flexWrap,
      justifyContent: computed.justifyContent,
      alignItems: computed.alignItems,
      alignContent: computed.alignContent,
      flex: computed.flex,
      flexGrow: computed.flexGrow,
      flexShrink: computed.flexShrink,
      flexBasis: computed.flexBasis,
      gap: computed.gap,
      rowGap: computed.rowGap,
      columnGap: computed.columnGap
    };

    // Grid
    const grid = {
      gridTemplateColumns: computed.gridTemplateColumns,
      gridTemplateRows: computed.gridTemplateRows,
      gridTemplateAreas: computed.gridTemplateAreas,
      gridAutoColumns: computed.gridAutoColumns,
      gridAutoRows: computed.gridAutoRows,
      gridAutoFlow: computed.gridAutoFlow,
      gridColumn: computed.gridColumn,
      gridRow: computed.gridRow,
      gap: computed.gap
    };

    // Dimensions
    const dimensions = {
      width: computed.width,
      height: computed.height,
      minWidth: computed.minWidth,
      minHeight: computed.minHeight,
      maxWidth: computed.maxWidth,
      maxHeight: computed.maxHeight,
      computedWidth: rect.width,
      computedHeight: rect.height,
      aspectRatio: computed.aspectRatio
    };

    // Position values
    const positionValues = {
      top: computed.top,
      right: computed.right,
      bottom: computed.bottom,
      left: computed.left
    };

    // Typography
    const typography = {
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      fontVariant: computed.fontVariant,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing,
      wordSpacing: computed.wordSpacing,
      textAlign: computed.textAlign,
      textTransform: computed.textTransform,
      textDecoration: computed.textDecoration,
      textIndent: computed.textIndent,
      textOverflow: computed.textOverflow,
      whiteSpace: computed.whiteSpace,
      wordBreak: computed.wordBreak,
      wordWrap: computed.wordWrap,
      verticalAlign: computed.verticalAlign
    };

    // Spacing
    const spacing = {
      margin: computed.margin,
      marginTop: computed.marginTop,
      marginRight: computed.marginRight,
      marginBottom: computed.marginBottom,
      marginLeft: computed.marginLeft,
      padding: computed.padding,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft
    };

    // Colors & Backgrounds
    const colors = {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      backgroundSize: computed.backgroundSize,
      backgroundPosition: computed.backgroundPosition,
      backgroundRepeat: computed.backgroundRepeat,
      backgroundAttachment: computed.backgroundAttachment,
      backgroundClip: computed.backgroundClip,
      backgroundOrigin: computed.backgroundOrigin
    };

    // Borders
    const borders = {
      border: computed.border,
      borderWidth: computed.borderWidth,
      borderStyle: computed.borderStyle,
      borderColor: computed.borderColor,
      borderTop: computed.borderTop,
      borderRight: computed.borderRight,
      borderBottom: computed.borderBottom,
      borderLeft: computed.borderLeft,
      borderTopColor: computed.borderTopColor,
      borderRightColor: computed.borderRightColor,
      borderBottomColor: computed.borderBottomColor,
      borderLeftColor: computed.borderLeftColor,
      borderRadius: computed.borderRadius,
      borderTopLeftRadius: computed.borderTopLeftRadius,
      borderTopRightRadius: computed.borderTopRightRadius,
      borderBottomLeftRadius: computed.borderBottomLeftRadius,
      borderBottomRightRadius: computed.borderBottomRightRadius
    };

    // Effects & Transformations
    const effects = {
      boxShadow: computed.boxShadow,
      textShadow: computed.textShadow,
      opacity: computed.opacity,
      transform: computed.transform,
      transformOrigin: computed.transformOrigin,
      filter: computed.filter,
      backdropFilter: computed.backdropFilter,
      mixBlendMode: computed.mixBlendMode,
      isolation: computed.isolation
    };

    // Transitions & Animations
    const animations = {
      transition: computed.transition,
      transitionProperty: computed.transitionProperty,
      transitionDuration: computed.transitionDuration,
      transitionTimingFunction: computed.transitionTimingFunction,
      transitionDelay: computed.transitionDelay,
      animation: computed.animation,
      animationName: computed.animationName,
      animationDuration: computed.animationDuration,
      animationTimingFunction: computed.animationTimingFunction,
      animationDelay: computed.animationDelay,
      animationIterationCount: computed.animationIterationCount,
      animationDirection: computed.animationDirection,
      animationFillMode: computed.animationFillMode,
      animationPlayState: computed.animationPlayState
    };

    // Pseudo-elements
    const pseudoElements = {};
    try {
      const beforeStyles = window.getComputedStyle(element, '::before');
      const afterStyles = window.getComputedStyle(element, '::after');

      if (beforeStyles.content && beforeStyles.content !== 'none') {
        pseudoElements.before = {
          content: beforeStyles.content,
          display: beforeStyles.display,
          width: beforeStyles.width,
          height: beforeStyles.height,
          color: beforeStyles.color,
          backgroundColor: beforeStyles.backgroundColor,
          position: beforeStyles.position,
          transform: beforeStyles.transform
        };
      }

      if (afterStyles.content && afterStyles.content !== 'none') {
        pseudoElements.after = {
          content: afterStyles.content,
          display: afterStyles.display,
          width: afterStyles.width,
          height: afterStyles.height,
          color: afterStyles.color,
          backgroundColor: afterStyles.backgroundColor,
          position: afterStyles.position,
          transform: afterStyles.transform
        };
      }
    } catch (e) {

      // Pseudo-element access failed, skip
    }
    // Parent context
    const parent = element.parentElement;
    const parentContext = parent ? {
      tagName: parent.tagName.toLowerCase(),
      display: window.getComputedStyle(parent).display,
      flexDirection: window.getComputedStyle(parent).flexDirection,
      gridTemplateColumns: window.getComputedStyle(parent).gridTemplateColumns,
      position: window.getComputedStyle(parent).position
    } : null;

    // Pseudo-class states (hover, focus, active)
    const pseudoStates = this.extractPseudoStates(element);

    // Component context (Feature 4: Component Composition)
    const componentContext = this.extractComponentContext(element);

    return {
      // Core CSS groups
      layout,
      flexbox,
      grid,
      dimensions,
      position: positionValues,
      typography,
      spacing,
      colors,
      borders,
      effects,
      animations,

      // Additional context
      pseudoElements: Object.keys(pseudoElements).length > 0 ? pseudoElements : null,
      pseudoStates: pseudoStates,
      parent: parentContext,
      component: componentContext
    };
  },

  /**
   * Extract component context (parent layout info only)
   * Feature 4: Component Composition
   */
  extractComponentContext(element) {
    const parent = element.parentElement;

    // Skip if parent is body/html (not meaningful)
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') {
      return null;
    }

    const parentComputed = window.getComputedStyle(parent);

    return {
      parent: {
        tagName: parent.tagName.toLowerCase(),
        selector: this.generateSelector(parent),
        display: parentComputed.display,
        flexDirection: parentComputed.flexDirection !== 'row' ? parentComputed.flexDirection : null,
        justifyContent: parentComputed.justifyContent !== 'normal' ? parentComputed.justifyContent : null,
        alignItems: parentComputed.alignItems !== 'normal' ? parentComputed.alignItems : null,
        gap: parentComputed.gap !== 'normal' ? parentComputed.gap : null,
        gridTemplateColumns: parentComputed.display === 'grid' ? parentComputed.gridTemplateColumns : null
      }
    };
  },

  /**
   * Calculate expansion needed for box-shadow effects
   */
  calculateShadowExpansion(boxShadow) {
    // Parse box-shadow: offset-x offset-y blur spread color
    // Example: "0px 0px 20px 5px rgba(0,0,0,0.5)"
    const shadows = boxShadow.split(',').map((s) => s.trim());
    let maxTop = 0,maxRight = 0,maxBottom = 0,maxLeft = 0;

    shadows.forEach((shadow) => {
      // Match: offsetX offsetY blur spread
      const match = shadow.match(/([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px(?:\s+([-\d.]+)px)?/);
      if (match) {
        const offsetX = parseFloat(match[1]) || 0;
        const offsetY = parseFloat(match[2]) || 0;
        const blur = parseFloat(match[3]) || 0;
        const spread = parseFloat(match[4]) || 0;

        // Shadow extends by blur + spread in all directions, plus offset
        const expansion = blur + spread;
        maxTop = Math.max(maxTop, expansion - offsetY);
        maxBottom = Math.max(maxBottom, expansion + offsetY);
        maxLeft = Math.max(maxLeft, expansion - offsetX);
        maxRight = Math.max(maxRight, expansion + offsetX);
      }
    });

    return { top: maxTop, right: maxRight, bottom: maxBottom, left: maxLeft };
  },

  /**
   * Calculate expansion needed for filter effects
   */
  calculateFilterExpansion(filter) {
    // Parse filters like blur(), drop-shadow() that extend beyond bounds
    let maxExpansion = 0;

    // Check for blur - expands in all directions
    const blurMatch = filter.match(/blur\(([\d.]+)px\)/);
    if (blurMatch) {
      maxExpansion = Math.max(maxExpansion, parseFloat(blurMatch[1]) * 2);
    }

    // Check for drop-shadow - expands based on blur and offset
    const shadowMatch = filter.match(/drop-shadow\(([-\d.]+)px\s+([-\d.]+)px\s+([\d.]+)px/);
    if (shadowMatch) {
      const offsetX = Math.abs(parseFloat(shadowMatch[1]) || 0);
      const offsetY = Math.abs(parseFloat(shadowMatch[2]) || 0);
      const blur = parseFloat(shadowMatch[3]) || 0;
      maxExpansion = Math.max(maxExpansion, Math.max(offsetX, offsetY) + blur);
    }

    return { top: maxExpansion, right: maxExpansion, bottom: maxExpansion, left: maxExpansion };
  },

  /**
   * Expand a rectangle by padding on all sides
   */
  expandRectForEffects(rect, padding) {
    return {
      left: rect.left - padding.left,
      top: rect.top - padding.top,
      right: rect.right + padding.right,
      bottom: rect.bottom + padding.bottom,
      width: rect.width + padding.left + padding.right,
      height: rect.height + padding.top + padding.bottom,
      x: rect.x - padding.left,
      y: rect.y - padding.top
    };
  },

  /**
   * Calculate visual bounds including CSS transforms
   */
  calculateTransformedBounds(element, originalRect, transformString) {
    // Parse transform matrix to calculate actual visual bounds
    // For scale transforms, expand the bounding box

    // Try to extract scale from transform matrix
    const scaleMatch = transformString.match(/scale\(([\d.]+)(?:,\s*([\d.]+))?\)/);
    const matrixMatch = transformString.match(/matrix\(([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\)/);

    let scaleX = 1,scaleY = 1;

    if (scaleMatch) {
      scaleX = parseFloat(scaleMatch[1]);
      scaleY = scaleMatch[2] ? parseFloat(scaleMatch[2]) : scaleX;
    } else if (matrixMatch) {
      // Extract scale from matrix(a, b, c, d, tx, ty)
      // scaleX = sqrt(a^2 + b^2), scaleY = sqrt(c^2 + d^2)
      const a = parseFloat(matrixMatch[1]);
      const b = parseFloat(matrixMatch[2]);
      const c = parseFloat(matrixMatch[3]);
      const d = parseFloat(matrixMatch[4]);
      scaleX = Math.sqrt(a * a + b * b);
      scaleY = Math.sqrt(c * c + d * d);
    }



    if (scaleX === 1 && scaleY === 1) {
      return originalRect; // No scaling
    }

    // Calculate expanded bounds
    const centerX = originalRect.left + originalRect.width / 2;
    const centerY = originalRect.top + originalRect.height / 2;
    const newWidth = originalRect.width * scaleX;
    const newHeight = originalRect.height * scaleY;

    return {
      left: centerX - newWidth / 2,
      top: centerY - newHeight / 2,
      right: centerX + newWidth / 2,
      bottom: centerY + newHeight / 2,
      width: newWidth,
      height: newHeight,
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2
    };
  },

  /**
   * Capture screenshot with custom bounds (for transformed elements)
   */
  async captureElementScreenshotWithBounds(element, customRect) {
    const dpr = window.devicePixelRatio || 1;
    // Use 2x scale factor for higher quality screenshots
    // This ensures crisp images even when zoomed or viewed on high-DPI displays
    // For standard displays (DPR=1), we get 2x resolution. For Retina (DPR=2), we get 4x resolution.
    const scaleFactor = Math.max(2, dpr * 2);

    // Request full page screenshot from background
    const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });

    if (!response.success) {
      throw new Error('Failed to capture screenshot');
    }

    // Create canvas to crop element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {
      willReadFrequently: false,
      desynchronized: false
    });

    // Set canvas size to custom bounds size with higher scale factor for better quality
    canvas.width = customRect.width * scaleFactor;
    canvas.height = customRect.height * scaleFactor;

    // Scale the canvas context to match device pixel ratio
    canvas.style.width = customRect.width + 'px';
    canvas.style.height = customRect.height + 'px';

    // Enable high-quality image smoothing for better rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Load full screenshot
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = response.dataUrl;
    });

    // Draw cropped portion with high DPI scaling using custom bounds
    // Scale source coordinates by DPR (screenshot resolution) and destination by scaleFactor
    ctx.drawImage(
      img,
      customRect.left * dpr, customRect.top * dpr, customRect.width * dpr, customRect.height * dpr,
      0, 0, customRect.width * scaleFactor, customRect.height * scaleFactor
    );

    // Return as data URL with 100% quality
    return canvas.toDataURL('image/png', 1.0);
  },

  /**
   * Capture screenshot of element only
   */
  async captureElementScreenshot(element) {
    const rect = element.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Use 2x scale factor for higher quality screenshots
    // This ensures crisp images even when zoomed or viewed on high-DPI displays
    // For standard displays (DPR=1), we get 2x resolution. For Retina (DPR=2), we get 4x resolution.
    const scaleFactor = Math.max(2, dpr * 2);











    // Validate element is visible
    if (rect.width === 0 || rect.height === 0) {
      throw new Error('Element has zero dimensions');
    }

    if (rect.top > window.innerHeight || rect.left > window.innerWidth) {
      console.warn('[Inspiration Mode] Element may be outside viewport');
    }

    // Request screenshot from background (always full viewport)
    const response = await chrome.runtime.sendMessage({
      action: 'captureScreenshot'
    });

    if (!response.success) {
      throw new Error('Failed to capture screenshot');
    }

    // Load the screenshot
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = response.dataUrl;
    });








    // Crop the element from the full screenshot
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {
      willReadFrequently: false,
      desynchronized: false
    });

    // Set canvas size to element size with higher scale factor for better quality
    canvas.width = rect.width * scaleFactor;
    canvas.height = rect.height * scaleFactor;

    // Scale canvas for high DPI
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    // Enable high-quality image smoothing for better rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Calculate source coordinates in the screenshot (use DPR for source)
    const srcX = rect.left * dpr;
    const srcY = rect.top * dpr;
    const srcWidth = rect.width * dpr;
    const srcHeight = rect.height * dpr;

    // Draw cropped portion - scale up destination to scaleFactor for higher quality
    ctx.drawImage(
      img,
      srcX, srcY, srcWidth, srcHeight,
      0, 0, canvas.width, canvas.height
    );






    return canvas.toDataURL('image/png', 1.0);
  },

  /**
   * Show responsive capture progress modal
   */
  showResponsiveCaptureModal(currentStep = '', totalSteps = 0, currentIndex = 0) {
    // Remove existing modal if any
    this.hideResponsiveCaptureModal();

    const modal = document.createElement('div');
    modal.id = 'pointa-responsive-capture-modal';
    modal.className = 'pointa-responsive-capture-modal';

    const progress = totalSteps > 0 ? `${currentIndex}/${totalSteps}` : '';

    modal.innerHTML = `
      <div class="pointa-responsive-modal-content">
        <div class="pointa-responsive-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </div>
        <h3 class="pointa-responsive-modal-title">Capturing Responsive Screenshots</h3>
        <p class="pointa-responsive-modal-description">
          Please don't close this tab. We're resizing your browser window to capture screenshots at different screen sizes.
        </p>
        ${currentStep ? `
          <div class="pointa-responsive-modal-status">
            <div class="pointa-responsive-modal-progress">${progress}</div>
            <div class="pointa-responsive-modal-current">Capturing: <strong>${currentStep}</strong></div>
          </div>
        ` : ''}
        <div class="pointa-responsive-modal-loader">
          <div class="pointa-responsive-loader-bar"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  /**
   * Update responsive capture modal with current progress
   */
  updateResponsiveCaptureModal(currentStep, totalSteps, currentIndex) {
    const modal = document.getElementById('pointa-responsive-capture-modal');
    if (!modal) return;

    const statusDiv = modal.querySelector('.pointa-responsive-modal-status');
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="pointa-responsive-modal-progress">${currentIndex}/${totalSteps}</div>
        <div class="pointa-responsive-modal-current">Capturing: <strong>${currentStep}</strong></div>
      `;
    }
  },

  /**
   * Hide responsive capture progress modal
   */
  hideResponsiveCaptureModal() {
    const modal = document.getElementById('pointa-responsive-capture-modal');
    if (modal) {
      modal.remove();
    }
  },

  /**
   * Capture responsive state screenshots at multiple breakpoints (Feature 5)
   * Auto-captures element at different viewport widths
   */
  async captureResponsiveStates(element, selectedBreakpoints) {
    const screenshots = {};

    // Show progress modal
    this.showResponsiveCaptureModal();

    // Generate CSS selector FIRST (before viewport changes) - this is the exact reference
    // This is the same approach as manually clicking in DevTools - we use the exact selector
    const elementSelector = this.generateSelector(element);


    // Also create signature as fallback
    const elementSignature = this.createElementSignature(element);


    // Hide sidebar during capture to avoid it appearing in screenshots
    const sidebar = document.getElementById('pointa-sidebar');
    const sidebarWasVisible = sidebar && sidebar.style.display !== 'none';
    let originalMarginRight = '';
    if (sidebar) {
      sidebar.style.display = 'none';
      // Also remove body margin that sidebar adds
      originalMarginRight = document.body.style.marginRight || '';
      document.body.style.marginRight = '0';

    }



    // Process breakpoints in a consistent order to ensure all are captured
    // Use a defined order: desktop, tablet, mobile (largest to smallest, matching UI order)
    const breakpointOrder = ['desktop', 'tablet', 'mobile'];
    const orderedBreakpoints = breakpointOrder.filter((name) => selectedBreakpoints.hasOwnProperty(name));



    for (let i = 0; i < orderedBreakpoints.length; i++) {
      const name = orderedBreakpoints[i];
      const width = selectedBreakpoints[name];


      // Update modal with current progress
      const displayName = name.charAt(0).toUpperCase() + name.slice(1) + ` (${width}px)`;
      this.updateResponsiveCaptureModal(displayName, orderedBreakpoints.length, i + 1);

      try {
        // Request viewport change via background script

        const resizeResponse = await chrome.runtime.sendMessage({
          action: 'setViewport',
          width: width,
          height: 1080
        });

        if (!resizeResponse || !resizeResponse.success) {
          console.error(`[Inspiration Mode] Failed to set viewport for ${name}:`, resizeResponse);
          // Don't continue - log error but try to capture anyway
          console.warn(`[Inspiration Mode] Continuing with ${name} capture despite viewport warning...`);
        } else {

        }

        // Wait for layout to settle after viewport change
        // Give mobile a bit more time as it might need more layout recalculation
        const waitTime = name === 'mobile' ? 1500 : 1000;

        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Verify viewport actually changed
        const actualWidth = window.innerWidth;

        if (Math.abs(actualWidth - width) > 50) {
          console.warn(`[Inspiration Mode] ⚠️ Viewport width mismatch! Expected ${width}px but got ${actualWidth}px`);
          // Try waiting a bit more
          await new Promise((resolve) => setTimeout(resolve, 500));
          const retryWidth = window.innerWidth;

        }

        // Force reflow to ensure DOM is updated
        document.body.offsetHeight;

        // Re-find the element using the EXACT CSS selector (same as DevTools)
        // This is the primary method - we use the exact selector reference, just like clicking in DevTools
        let targetElement = null;

        if (elementSelector) {
          try {
            const foundElements = document.querySelectorAll(elementSelector);
            if (foundElements.length === 1) {
              targetElement = foundElements[0];

            } else if (foundElements.length > 1) {
              // Multiple matches - try to find the one that matches our signature
              console.warn(`[Inspiration Mode] Selector matched ${foundElements.length} elements for ${name}, using signature to disambiguate`);
              for (const el of foundElements) {
                // Check if this element matches our signature
                if (this.elementMatchesSignature(el, elementSignature)) {
                  targetElement = el;

                  break;
                }
              }
              // If no match, use first one
              if (!targetElement) {
                targetElement = foundElements[0];
                console.warn(`[Inspiration Mode] Using first match for ${name} (${foundElements.length} total)`);
              }
            } else {
              console.warn(`[Inspiration Mode] Selector found 0 elements for ${name}, trying signature fallback`);
            }
          } catch (selectorError) {
            console.error(`[Inspiration Mode] Selector query failed for ${name}:`, selectorError);
          }
        }

        // Fallback to signature if selector didn't work
        if (!targetElement) {

          targetElement = this.findElementBySignature(elementSignature);
          if (targetElement) {

          }
        }

        if (!targetElement) {
          console.error(`[Inspiration Mode] ✗ Could not find element for ${name} using selector or signature`);
          console.error(`[Inspiration Mode] Selector was:`, elementSelector);
          console.error(`[Inspiration Mode] Current viewport: ${window.innerWidth}x${window.innerHeight}`);
          console.error(`[Inspiration Mode] Document body dimensions:`, {
            width: document.body.offsetWidth,
            height: document.body.offsetHeight,
            scrollWidth: document.body.scrollWidth,
            scrollHeight: document.body.scrollHeight
          });
          // Don't skip - try to continue with original element reference as fallback
          console.warn(`[Inspiration Mode] Attempting to use original element reference as last resort...`);
          targetElement = element; // Use original element as absolute last resort
          if (!targetElement) {
            console.error(`[Inspiration Mode] ✗ Original element also unavailable, skipping ${name}`);
            continue;
          }
          console.warn(`[Inspiration Mode] ⚠️ Using original element reference for ${name} (may not be accurate after viewport change)`);
        }

        const elementRect = targetElement.getBoundingClientRect();


        // Check element visibility using computed styles BEFORE scrolling
        const computedStyle = window.getComputedStyle(targetElement);
        const isDisplayNone = computedStyle.display === 'none';
        const isVisibilityHidden = computedStyle.visibility === 'hidden';
        const isOpacityZero = parseFloat(computedStyle.opacity) === 0;

        // If element is display:none, skip it (truly hidden)
        if (isDisplayNone) {
          console.error(`[Inspiration Mode] ✗ Element has display:none for ${name}, skipping...`);
          continue;
        }

        // Scroll element into view FIRST - it might be off-screen or collapsed
        // This is important because elements might have zero dimensions if they're not in viewport

        targetElement.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });

        // Wait for scroll and any layout recalculations
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Force reflow after scroll
        document.body.offsetHeight;

        // Re-check dimensions AFTER scrolling - element might now be visible
        const rectAfterScroll = targetElement.getBoundingClientRect();


        // Use rect after scroll (which we already got above)
        let captureRect = rectAfterScroll;
        let useCustomBounds = false;

        // Check if element still has zero dimensions after scrolling
        if (rectAfterScroll.width === 0 && rectAfterScroll.height === 0) {
          // Element might be truly hidden or collapsed - check computed styles more carefully
          const styleAfterScroll = window.getComputedStyle(targetElement);
          const isStillDisplayNone = styleAfterScroll.display === 'none';

          if (isStillDisplayNone) {
            console.error(`[Inspiration Mode] ✗ Element still has display:none after scroll for ${name}, skipping...`);
            continue;
          }

          // Element exists but has zero dimensions - might be collapsed or positioned off-screen
          // Try to use parent container dimensions as fallback
          console.warn(`[Inspiration Mode] ⚠️ Element has zero dimensions for ${name} after scroll - attempting to use parent container...`);

          const parent = targetElement.parentElement;
          if (parent) {
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.width > 0 || parentRect.height > 0) {

              // Use parent dimensions - create fallback rect
              captureRect = {
                left: parentRect.left,
                top: parentRect.top,
                right: parentRect.right,
                bottom: parentRect.bottom,
                width: parentRect.width || window.innerWidth,
                height: parentRect.height || 200,
                x: parentRect.x,
                y: parentRect.y
              };

              // Mark that we're using custom bounds
              useCustomBounds = true;
            } else {
              console.error(`[Inspiration Mode] ✗ Element and parent both have zero dimensions for ${name}, skipping...`);
              continue;
            }
          } else {
            console.error(`[Inspiration Mode] ✗ Element has zero dimensions and no parent for ${name}, skipping...`);
            continue;
          }
        }

        // If width is 0 but height > 0, try to capture anyway (might be a collapsed flex/grid item)
        if (rectAfterScroll.width === 0 && rectAfterScroll.height > 0) {
          console.warn(`[Inspiration Mode] ⚠️ Element has zero width but height ${rectAfterScroll.height}px for ${name} - attempting capture anyway`);
          // Try to find parent container that might have width
          const parent = targetElement.parentElement;
          let foundWidth = 0;

          if (parent) {
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.width > 0) {
              foundWidth = parentRect.width;

            }
          }

          // If parent didn't have width, use viewport width as fallback (common for mobile layouts)
          if (foundWidth === 0) {
            foundWidth = window.innerWidth;

          }

          // Create a modified rect using found width but element's position/height
          captureRect = {
            left: rectAfterScroll.left,
            top: rectAfterScroll.top,
            right: rectAfterScroll.left + foundWidth,
            bottom: rectAfterScroll.bottom,
            width: foundWidth,
            height: rectAfterScroll.height,
            x: rectAfterScroll.x,
            y: rectAfterScroll.y
          };
          useCustomBounds = true;

        }

        if (isVisibilityHidden || isOpacityZero) {
          console.warn(`[Inspiration Mode] ⚠️ Element visibility issues for ${name} (visibility: ${computedStyle.visibility}, opacity: ${computedStyle.opacity}) - attempting capture anyway`);
        }

        // Check if element is within viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        if (captureRect.right < 0 || captureRect.left > viewportWidth ||
        captureRect.bottom < 0 || captureRect.top > viewportHeight) {
          console.warn(`[Inspiration Mode] Element may be outside viewport for ${name} after scroll`);
        }

        // Get final rect - use captureRect if we're using custom bounds, otherwise get fresh rect
        let finalRect;
        if (useCustomBounds) {
          // Use the captureRect we already calculated (which might be parent container)
          finalRect = captureRect;

        } else {
          // Get fresh rect after scroll
          finalRect = targetElement.getBoundingClientRect();
        }

        // Only skip if both width AND height are zero
        if (finalRect.width === 0 && finalRect.height === 0) {
          console.error(`[Inspiration Mode] ✗ Element still has zero dimensions after scroll for ${name}`);
          continue;
        }






        // Hide the progress modal before taking screenshot
        this.hideResponsiveCaptureModal();

        // Small delay to ensure modal is hidden
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Capture screenshot - use custom bounds if element had zero width
        let screenshotDataUrl;
        try {
          if (useCustomBounds && finalRect.width > 0) {
            // Use custom bounds capture (for zero-width elements)

            screenshotDataUrl = await this.captureElementScreenshotWithBounds(targetElement, finalRect);
          } else {
            // Normal capture
            screenshotDataUrl = await this.captureElementScreenshot(targetElement);
          }
        } catch (captureError) {
          console.error(`[Inspiration Mode] ✗ Screenshot capture failed for ${name}:`, captureError);
          console.error(`[Inspiration Mode] Error details:`, {
            useCustomBounds,
            finalRect,
            elementRect: targetElement.getBoundingClientRect()
          });
          // Show modal again before continuing
          this.showResponsiveCaptureModal(displayName, orderedBreakpoints.length, i + 1);
          continue;
        }

        // Show the modal again after screenshot is captured
        this.showResponsiveCaptureModal(displayName, orderedBreakpoints.length, i + 1);

        if (screenshotDataUrl && screenshotDataUrl.length > 100) {
          screenshots[name] = screenshotDataUrl;

        } else {
          console.error(`[Inspiration Mode] ✗ ${name} screenshot was empty or too small (${screenshotDataUrl ? screenshotDataUrl.length : 0} bytes)`);
          console.error(`[Inspiration Mode] Screenshot data:`, screenshotDataUrl ? screenshotDataUrl.substring(0, 50) + '...' : 'null');
          // Don't add to screenshots object if it's invalid
        }

      } catch (error) {
        console.error(`[Inspiration Mode] Error capturing ${name} state:`, error);
        console.error(`[Inspiration Mode] Error stack:`, error.stack);
        // Continue to next breakpoint instead of stopping
      }
    }

    // Log summary of what was captured
    const capturedBreakpoints = Object.keys(screenshots);
    const expectedBreakpoints = Object.keys(selectedBreakpoints);






    // Log details about each captured screenshot
    for (const [name, dataUrl] of Object.entries(screenshots)) {

    }

    if (capturedBreakpoints.length < expectedBreakpoints.length) {
      const missing = expectedBreakpoints.filter((bp) => !capturedBreakpoints.includes(bp));
      console.error(`[Inspiration Mode] ✗ MISSING BREAKPOINTS: ${missing.join(', ')}`);
      console.error(`[Inspiration Mode] This may indicate viewport changes failed or elements couldn't be found`);
      console.error(`[Inspiration Mode] Check console logs above for details on why each breakpoint failed`);
    } else {

    }


    // Restore original viewport
    try {

      await chrome.runtime.sendMessage({ action: 'resetViewport' });
      await new Promise((resolve) => setTimeout(resolve, 300));

    } catch (error) {
      console.error('[Inspiration Mode] Error restoring viewport:', error);
    }

    // Restore sidebar visibility
    if (sidebar && sidebarWasVisible) {
      sidebar.style.display = '';
      // Restore body margin to original value
      document.body.style.marginRight = originalMarginRight;

    }

    // Hide progress modal
    this.hideResponsiveCaptureModal();


    return screenshots;
  },

  /**
   * Capture hover state screenshot by forcing hover styles using temporary CSS
   */
  async captureHoverScreenshot(element) {


    // Get hover styles from detected metadata
    const metadata = this.extractBasicMetadata(element);
    const hoverStyles = metadata.pseudoStates?.hover;

    if (!hoverStyles || Object.keys(hoverStyles).length === 0) {

      return null;
    }



    // Create a unique class name
    const tempClassName = 'pointa-force-hover-' + Date.now();

    // Build CSS rule from hover styles
    const cssProperties = Object.entries(hoverStyles).map(([key, value]) => {
      const prop = this.camelCaseToDash(key);
      return `${prop}: ${value} !important`;
    }).join('; ');

    // Create temporary style element
    const styleEl = document.createElement('style');
    styleEl.textContent = `.${tempClassName} { ${cssProperties}; }`;
    document.head.appendChild(styleEl);

    try {
      // Add temporary class to element
      const originalClasses = element.className;
      element.classList.add(tempClassName);

      // Force browser reflow
      void element.offsetHeight;

      // Log what we're applying




      // Force browser reflow and wait for transitions/animations
      void element.offsetHeight;

      // Check if there's a transition - if so, wait longer
      const computedBefore = window.getComputedStyle(element);
      const transitionDuration = computedBefore.transitionDuration;
      let waitTime = 500;

      if (transitionDuration && transitionDuration !== '0s') {
        // Parse transition duration (could be "0.3s" or "300ms")
        const match = transitionDuration.match(/([\d.]+)(m?s)/);
        if (match) {
          const value = parseFloat(match[1]);
          const unit = match[2];
          const durationMs = unit === 's' ? value * 1000 : value;
          waitTime = Math.max(500, durationMs + 200); // Add 200ms buffer

        }
      }

      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Get computed styles and bounds AFTER hover is fully applied
      const computedAfter = window.getComputedStyle(element);
      const hoverRect = element.getBoundingClientRect();




      // Compare what we wanted vs what we got
      Object.entries(hoverStyles).forEach(([key, expectedValue]) => {
        const prop = this.camelCaseToDash(key);
        const actualValue = computedAfter.getPropertyValue(prop);
        const match = this.cssValuesAreDifferent(expectedValue, actualValue) ? '❌ MISMATCH' : '✓';

      });

      // Determine if we need to expand bounds for effects that extend beyond element
      let expandedRect = { ...hoverRect };
      let needsExpansion = false;

      // Check for transforms (scale, etc.) - these make element visually larger
      const transform = computedAfter.transform;
      if (transform && transform !== 'none' && transform.includes('scale')) {

        expandedRect = this.calculateTransformedBounds(element, hoverRect, transform);
        needsExpansion = true;
      }

      // Check for box-shadow - these extend beyond element bounds
      const boxShadow = computedAfter.boxShadow;
      if (boxShadow && boxShadow !== 'none') {

        const shadowExpansion = this.calculateShadowExpansion(boxShadow);
        // Only expand if shadow is significant (> 5px)
        if (shadowExpansion.top > 5 || shadowExpansion.right > 5 || shadowExpansion.bottom > 5 || shadowExpansion.left > 5) {
          expandedRect = this.expandRectForEffects(expandedRect, shadowExpansion);
          needsExpansion = true;

        }
      }

      // Check for filter effects (blur, drop-shadow) - these extend beyond bounds
      const filter = computedAfter.filter;
      if (filter && filter !== 'none' && (filter.includes('blur') || filter.includes('drop-shadow'))) {

        const filterExpansion = this.calculateFilterExpansion(filter);
        expandedRect = this.expandRectForEffects(expandedRect, filterExpansion);
        needsExpansion = true;
      }

      // Capture screenshot - use expanded bounds if needed, otherwise use normal element bounds
      let screenshotDataUrl;
      if (needsExpansion) {

        screenshotDataUrl = await this.captureElementScreenshotWithBounds(element, expandedRect);
      } else {

        screenshotDataUrl = await this.captureElementScreenshot(element);
      }



      return screenshotDataUrl;

    } finally {
      // Remove temporary class and style
      element.classList.remove(tempClassName);
      styleEl.remove();



      // Small delay to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  },

  /**
   * Escape CSS special characters in class names or IDs
   */
  escapeCSSIdentifier(str) {
    // CSS.escape is the standard way, but fallback for older browsers
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(str);
    }

    // Manual escape for special characters
    // Escape: !"#$%&'()*+,./:;<=>?@[\]^`{|}~
    return str.replace(/([!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~])/g, '\\$1');
  },

  /**
   * Create a signature to reliably identify an element across viewport changes
   * Uses multiple strategies: ID, text content, attributes, HTML structure
   */
  createElementSignature(element) {
    const signature = {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      // Text content (trimmed, first 200 chars)
      textContent: element.textContent?.trim().substring(0, 200) || null,
      // HTML structure snapshot (first 300 chars, likely unique)
      htmlSignature: element.outerHTML.substring(0, 300),
      // Key attributes that are stable across viewports
      attributes: {},
      // Class list (full, not just first)
      classes: element.className ? Array.from(element.classList) : []
    };

    // Capture stable attributes (data-*, aria-*, role, href, src, alt, title, name)
    const stableAttrs = ['data-', 'aria-', 'role', 'href', 'src', 'alt', 'title', 'name', 'type', 'value'];
    for (const attr of element.attributes) {
      if (stableAttrs.some((prefix) => attr.name.startsWith(prefix)) || stableAttrs.includes(attr.name)) {
        signature.attributes[attr.name] = attr.value;
      }
    }

    return signature;
  },

  /**
   * Check if an element matches a signature
   */
  elementMatchesSignature(element, signature) {
    // Check tag name
    if (element.tagName.toLowerCase() !== signature.tagName) {
      return false;
    }

    // Check ID
    if (signature.id && element.id !== signature.id) {
      return false;
    }

    // Check text content (fuzzy match - first 100 chars)
    if (signature.textContent && signature.textContent.length > 10) {
      const elementText = element.textContent?.trim().substring(0, 100);
      const signatureText = signature.textContent.substring(0, 100);
      if (elementText !== signatureText) {
        return false;
      }
    }

    // Check key attributes
    for (const [attr, value] of Object.entries(signature.attributes)) {
      if (element.getAttribute(attr) !== value) {
        return false;
      }
    }

    return true;
  },

  /**
   * Find element by signature (robust across viewport changes)
   * Uses multiple fallback strategies
   */
  findElementBySignature(signature) {
    // Strategy 1: ID (most reliable if present)
    if (signature.id) {
      const byId = document.getElementById(signature.id);
      if (byId) {

        return byId;
      }
    }

    // Strategy 2: Unique data attributes
    if (Object.keys(signature.attributes).length > 0) {
      for (const [attr, value] of Object.entries(signature.attributes)) {
        if (attr.startsWith('data-') || attr.startsWith('aria-')) {
          const selector = `${signature.tagName}[${attr}="${value}"]`;
          const elements = document.querySelectorAll(selector);
          if (elements.length === 1) {

            return elements[0];
          }
        }
      }
    }

    // Strategy 3: HTML signature match (robust for unique elements)
    if (signature.htmlSignature) {
      const allElements = document.querySelectorAll(signature.tagName);
      for (const el of allElements) {
        const elHtml = el.outerHTML.substring(0, 300);
        // Fuzzy match: check if significant portion matches
        if (this.calculateSimilarity(elHtml, signature.htmlSignature) > 0.8) {

          return el;
        }
      }
    }

    // Strategy 4: Text content + tag name (for elements with unique text)
    if (signature.textContent && signature.textContent.length > 10) {
      const allElements = document.querySelectorAll(signature.tagName);
      for (const el of allElements) {
        const elText = el.textContent?.trim().substring(0, 200);
        if (elText === signature.textContent) {

          return el;
        }
      }
    }

    // Strategy 5: Class combination (less reliable but worth trying)
    if (signature.classes.length > 0) {
      const classSelector = signature.classes.map((c) => `.${this.escapeCSSIdentifier(c)}`).join('');
      const selector = `${signature.tagName}${classSelector}`;
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 1) {

          return elements[0];
        }
      } catch (e) {

        // Invalid selector, skip
      }}

    console.error('[Inspiration Mode] Could not find element with any strategy');
    return null;
  },

  /**
   * Calculate similarity between two strings (0-1)
   */
  calculateSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return 1.0;

    // Simple character-by-character comparison
    let matches = 0;
    const minLen = Math.min(len1, len2);
    for (let i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) matches++;
    }

    return matches / maxLen;
  },

  /**
   * Generate unique selector for element
   */
  generateSelector(element) {
    // Try ID first (escape it)
    if (element.id) {
      return `#${this.escapeCSSIdentifier(element.id)}`;
    }

    // Try unique class combination (with escaped class names)
    if (element.className) {
      const classes = Array.from(element.classList).
      map((cls) => this.escapeCSSIdentifier(cls)).
      join('.');

      if (classes) {
        const selector = `${element.tagName.toLowerCase()}.${classes}`;
        try {
          // Test if selector is valid and unique
          if (document.querySelectorAll(selector).length === 1) {
            return selector;
          }
        } catch (e) {


        }
      }
    }

    // Build path-based selector with escaped identifiers
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${this.escapeCSSIdentifier(current.id)}`;
        path.unshift(selector);
        break;
      }

      if (current.className) {
        const firstClass = Array.from(current.classList)[0];
        if (firstClass) {
          selector += `.${this.escapeCSSIdentifier(firstClass)}`;
        }
      }

      // Add nth-of-type if needed for disambiguation
      const siblings = Array.from(current.parentElement?.children || []);
      const sameTagSiblings = siblings.filter((s) => s.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  },

  /**
   * Categorize element type
   */
  categorizeElement(element) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const type = element.getAttribute('type');
    const computed = window.getComputedStyle(element);

    // Button
    if (tag === 'button' || role === 'button' || type === 'button' || type === 'submit') {
      return 'button';
    }

    // Form elements
    if (['input', 'textarea', 'select', 'form'].includes(tag)) {
      return 'form';
    }

    // Navigation
    if (tag === 'nav' || role === 'navigation') {
      return 'nav';
    }

    // Image
    if (tag === 'img' || tag === 'picture' || tag === 'svg') {
      return 'image';
    }

    // Text elements
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a'].includes(tag)) {
      return 'text';
    }

    // Card-like elements (containers with border/shadow)
    const hasBoxShadow = computed.boxShadow !== 'none';
    const hasBorder = computed.borderWidth !== '0px';
    const isContainer = ['div', 'article', 'section'].includes(tag);

    if (isContainer && (hasBoxShadow || hasBorder)) {
      return 'card';
    }

    // Hero sections (large prominent elements)
    const rect = element.getBoundingClientRect();
    if (rect.height > 300 && rect.width > window.innerWidth * 0.5) {
      return 'hero';
    }

    return 'other';
  },

  /**
   * Check if element should show responsive capture options
   * Only larger container elements need responsive capture
   */
  shouldShowResponsiveCapture(element) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const rect = element.getBoundingClientRect();

    // Container tags that typically have responsive behavior
    const containerTags = ['div', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav'];
    const containerRoles = ['region', 'article', 'complementary', 'navigation'];

    // Get element category
    const category = this.categorizeElement(element);

    // Never show for small elements (buttons, forms, images, text)
    if (['button', 'form', 'image', 'text'].includes(category)) {
      return false;
    }

    // Always show for these categories (they're component-sized or larger)
    if (['card', 'hero', 'nav'].includes(category)) {
      return true;
    }

    // For container elements (div, section, etc.), show if they have meaningful size
    const isContainer = containerTags.includes(tag) || containerRoles.includes(role);
    if (isContainer) {
      // Show for containers that are reasonably large (width > 300px OR height > 200px)
      // This covers most layout sections, even if they don't have borders/shadows
      const hasMeaningfulSize = rect.width > 300 || rect.height > 200;
      return hasMeaningfulSize;
    }

    return false;
  },

  /**
   * Show success message
   */
  showSuccessMessage() {
    const message = document.createElement('div');
    message.className = 'pointa-inspiration-success-message';
    message.textContent = '✓ Inspiration saved!';
    document.body.appendChild(message);

    setTimeout(() => {
      message.classList.add('pointa-inspiration-success-message-fade');
      setTimeout(() => message.remove(), 300);
    }, 2000);
  },

  /**
   * Show error message
   */
  showErrorMessage(error) {
    const message = document.createElement('div');
    message.className = 'pointa-inspiration-error-message';
    message.textContent = `✗ Error: ${error}`;
    document.body.appendChild(message);

    setTimeout(() => {
      message.classList.add('pointa-inspiration-error-message-fade');
      setTimeout(() => message.remove(), 300);
    }, 3000);
  },

  /**
   * Show instruction overlay
   */
  showInstructionOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'pointa-inspiration-instruction-overlay';
    overlay.innerHTML = `
      <div class="pointa-inspiration-instruction-content">
        <p>Hover over any element to inspect it. Click to save as inspiration.</p>
        <p class="pointa-inspiration-instruction-hint">Press ESC to exit</p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      overlay.classList.add('pointa-inspiration-instruction-overlay-fade');
      setTimeout(() => overlay.remove(), 300);
    }, 3000);
  },

  /**
   * Clean up all UI elements
   */
  cleanupUI() {
    if (this.highlightBox) {
      this.highlightBox.remove();
      this.highlightBox = null;
    }

    if (this.metadataPanel) {
      this.metadataPanel.remove();
      this.metadataPanel = null;
    }

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    this.hoveredElement = null;
    this.selectedElement = null;
    this.captureModeEnabled = true;
  }
};

// Export for use in content script
window.InspirationMode = InspirationMode;
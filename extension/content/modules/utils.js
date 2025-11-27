// Pointa Utility Functions
// Shared utility functions used across the extension

const PointaUtils = {
  /**
   * Convert RGB/RGBA color to hex format
   * @param {string} rgb - RGB/RGBA color string
   * @returns {string} Hex color
   */
  rgbToHex(rgb) {
    // Handle already hex values
    if (rgb.startsWith('#')) {
      return rgb;
    }

    // Handle transparent or empty
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') {
      return '#ffffff'; // Default to white for transparent
    }

    // Handle rgba/rgb strings
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return '#' + [r, g, b].map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }

    console.warn(`[Design Mode] Could not convert color to hex: ${rgb}`);
    return '#000000';
  },

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Convert camelCase to kebab-case
   * @param {string} str - CamelCase string
   * @returns {string} kebab-case string
   */
  camelToKebab(str) {
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  },

  /**
   * Capitalize first letter of string
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /**
   * Generate unique ID for elements/annotations
   * @returns {string} Unique ID
   */
  generateId() {
    return 'pointa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Check if running on Mac OS
   * @returns {boolean} True if Mac
   */
  isMac() {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  },

  /**
   * Get URL without hash fragment
   * @param {string} url - URL to strip hash from
   * @returns {string} URL without hash
   */
  getUrlWithoutHash(url) {
    try {
      const urlObj = new URL(url);
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return url.split('#')[0];
    }
  },

  /**
   * Check if current page is a local file
   * @returns {boolean} True if file:// protocol
   */
  isLocalFile() {
    return window.location.protocol === 'file:';
  },

  /**
   * Check if current page protocol is file://
   * @returns {boolean} True if file:// protocol
   */
  isFileProtocol() {
    return window.location.protocol === 'file:';
  },

  /**
   * Check if current file type is valid for annotations (HTML files)
   * @returns {boolean} True if valid file type
   */
  isValidFileType() {
    if (!this.isLocalFile()) return true; // Non-file URLs are always valid

    const path = window.location.pathname.toLowerCase();
    const htmlExtensions = ['.html', '.htm'];

    // Check if it ends with .html or .htm, or has no extension (could be index.html)
    if (htmlExtensions.some((ext) => path.endsWith(ext))) {
      return true;
    }

    // Allow files with no extension if they're likely HTML
    const hasNoExtension = !path.includes('.') || path.endsWith('/');
    return hasNoExtension;
  },

  /**
   * Check if a URL is a localhost or local development URL
   * @param {string} url - URL to check (optional, defaults to current URL)
   * @returns {boolean} True if localhost URL
   */
  isLocalhostUrl(url = window.location.href) {
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
  },

  /**
   * Format annotation for clipboard - single annotation
   * @param {Object} annotation - Annotation object
   * @returns {string} Formatted text for clipboard
   */
  formatAnnotationForClipboard(annotation) {
    const messages = annotation.messages || (annotation.comment ? [{ text: annotation.comment }] : []);

    let text = `Please address this annotation:\n\n`;
    text += `Annotation ID: ${annotation.id}\n`;

    if (messages.length === 1) {
      // Single message
      text += `Comment: ${messages[0].text}\n`;
    } else if (messages.length > 1) {
      // Multiple iterations - show conversation
      text += `\nConversation history:\n`;
      messages.forEach((msg, idx) => {
        text += `${idx + 1}. ${msg.text}\n`;
      });
    }

    text += `\nYou can use the Pointa MCP tool to get the full context:\n`;
    text += `read_annotation_by_id(id: "${annotation.id}")\n`;

    return text;
  },

  /**
   * Format multiple annotations for clipboard - bulk copy
   * @param {Array} annotations - Array of annotation objects
   * @param {string} pageUrl - Current page URL
   * @returns {string} Formatted text for clipboard
   */
  formatAnnotationsForClipboard(annotations, pageUrl) {
    const urlObj = new URL(pageUrl);
    const pagePath = urlObj.pathname;

    let text = `Please address these ${annotations.length} annotation${annotations.length > 1 ? 's' : ''} on ${pagePath}:\n\n`;

    annotations.forEach((annotation, index) => {
      const messages = annotation.messages || (annotation.comment ? [{ text: annotation.comment }] : []);
      const latestMessage = messages.length > 0 ? messages[messages.length - 1].text : 'No comment';

      text += `---\n`;
      text += `Annotation #${index + 1} (ID: ${annotation.id})\n`;
      text += `${latestMessage}\n`;
      if (messages.length > 1) {
        text += `(${messages.length} iterations)\n`;
      }
      text += `\n`;
    });

    text += `---\n\n`;
    text += `Use the Pointa MCP tools to get full context:\n`;
    text += `- read_annotations(url: "${pageUrl}")\n`;
    text += `- Or individually: read_annotation_by_id(id: "...")\n`;

    return text;
  },

  /**
   * Copy text to clipboard and show toast notification
   * @param {string} text - Text to copy
   * @param {string} message - Toast message to show
   * @returns {Promise<boolean>} True if successful
   */
  async copyToClipboard(text, message = 'Copied to clipboard!') {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(message, 'success');
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.showToast('Failed to copy to clipboard', 'error');
      return false;
    }
  },

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {string} type - Toast type: 'success', 'error', 'info'
   */
  showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.pointa-toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `pointa-toast pointa-toast-${type}`;
    toast.textContent = message;

    // Apply theme
    const theme = PointaThemeManager?.getEffective() || 'light';
    toast.setAttribute('data-pointa-theme', theme);

    // Add to page
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('pointa-toast-show');
    });

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('pointa-toast-show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }, 3000);
  }
};

// Make PointaUtils available globally
window.PointaUtils = PointaUtils;

/**
 * Modal State Manager
 * Centralized tracking of all modals to coordinate badge visibility
 */
const PointaModalManager = {
  openModals: new Set(),

  /**
   * Register a modal as open
   * @param {string} modalId - Unique identifier for the modal
   */
  registerModal(modalId) {
    const wasEmpty = this.openModals.size === 0;
    this.openModals.add(modalId);

    // If this is the first modal, hide badges
    if (wasEmpty && window.pointa && window.pointa.badgeManager) {

      window.pointa.badgeManager.hideBadges = true;
      window.pointa.badgeManager.clearAllBadges();
    }
  },

  /**
   * Unregister a modal as closed
   * @param {string} modalId - Unique identifier for the modal
   */
  unregisterModal(modalId) {
    this.openModals.delete(modalId);

    // If no more modals are open, show badges
    if (this.openModals.size === 0 && window.pointa && window.pointa.badgeManager) {

      window.pointa.badgeManager.hideBadges = false;
      window.pointa.badgeManager.showExistingAnnotations();
    }
  },

  /**
   * Check if any modal is currently open
   * @returns {boolean} True if any modal is open
   */
  hasOpenModals() {
    return this.openModals.size > 0;
  },

  /**
   * Get count of open modals
   * @returns {number} Number of open modals
   */
  getOpenModalCount() {
    return this.openModals.size;
  }
};

// Make PointaModalManager available globally
window.PointaModalManager = PointaModalManager;
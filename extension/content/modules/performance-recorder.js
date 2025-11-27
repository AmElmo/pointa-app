/**
 * performance-recorder.js
 * 
 * Lightweight performance recorder focused on resource timing and user context.
 * Captures: slow resources, device/connection info, and user interactions.
 * Filters out extension-related data for clean, actionable insights.
 */

const PerformanceRecorder = {
  isRecording: false,
  recordingData: null,
  startTime: null,
  interactionHandlers: new Map(),
  maxRecordingDuration: 30000, // 30 seconds
  recordingTimeout: null,

  /**
   * Start recording a performance investigation session
   */
  async startRecording() {
    if (this.isRecording) {
      console.warn('[PerformanceRecorder] Already recording');
      return;
    }

    this.isRecording = true;
    this.startTime = Date.now();

    // Initialize simplified recording data structure
    this.recordingData = {
      interactions: [],
      metadata: {
        startTime: new Date(this.startTime).toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    };

    // Capture slow resources (with filtering)
    this.recordingData.resources = this.captureResourceTiming();

    // Capture device and connection info
    this.recordingData.deviceInfo = this.captureDeviceInfo();

    // Start capturing user interactions (with filtering)
    this.captureInteractions();

    // Add recording start event
    this.addTimelineEvent({
      type: 'recording-start',
      severity: 'info',
      data: {
        url: window.location.href,
        pageState: 'loaded'
      }
    });

    // Auto-stop after max duration
    this.recordingTimeout = setTimeout(() => {

      this.stopRecording();
    }, this.maxRecordingDuration);


  },

  /**
   * Stop recording and generate performance report
   */
  async stopRecording() {
    if (!this.isRecording) {
      console.warn('[PerformanceRecorder] Not currently recording');
      return null;
    }

    clearTimeout(this.recordingTimeout);

    // Add recording end event
    this.addTimelineEvent({
      type: 'recording-end',
      severity: 'info',
      data: {
        method: 'user-stopped',
        totalInteractions: this.recordingData.interactions.length
      }
    });

    this.isRecording = false;

    // Remove interaction handlers
    this.removeInteractionHandlers();

    // Capture screenshot NOW - shows current state
    await this.captureScreenshot();

    // Generate insights based on resource data
    const insights = this.analyzeResources();

    const result = {
      ...this.recordingData,
      insights,
      endTime: new Date().toISOString(),
      duration: Date.now() - this.startTime
    };



    return result;
  },

  /**
   * Capture slow resource timing with filtering
   * Only captures resources from user's app (excludes extension resources)
   */
  captureResourceTiming() {
    const resources = [];
    const resourceEntries = performance.getEntriesByType('resource');

    resourceEntries.forEach((entry) => {
      const duration = entry.duration;
      const size = entry.transferSize || entry.encodedBodySize;

      // Filter out our extension resources
      const isOurExtension = entry.name.includes('chrome-extension://');
      if (isOurExtension) {
        return; // Skip extension resources
      }

      // Only capture slow resources (>1s) or large resources (>100KB)
      if (duration > 1000 || size > 100000) {
        resources.push({
          name: entry.name,
          type: entry.initiatorType,
          duration: Math.round(duration),
          size: size,
          startTime: Math.round(entry.startTime),
          dns: Math.round(entry.domainLookupEnd - entry.domainLookupStart),
          tcp: Math.round(entry.connectEnd - entry.connectStart),
          request: Math.round(entry.responseStart - entry.requestStart),
          response: Math.round(entry.responseEnd - entry.responseStart),
          cached: entry.transferSize === 0 && entry.encodedBodySize > 0
        });
      }
    });

    // Sort resources by duration (slowest first)
    resources.sort((a, b) => b.duration - a.duration);

    return resources;
  },

  /**
   * Capture device and connection information
   */
  captureDeviceInfo() {
    const info = {
      cpuCores: navigator.hardwareConcurrency || 'unknown',
      deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'unknown',
      platform: navigator.platform,
      connection: null
    };

    // Network Information API
    if (navigator.connection) {
      info.connection = {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink ? `${navigator.connection.downlink} Mbps` : 'unknown',
        rtt: navigator.connection.rtt ? `${navigator.connection.rtt} ms` : 'unknown',
        saveData: navigator.connection.saveData || false
      };
    }

    return info;
  },


  /**
   * Capture user interactions (filtered to exclude our extension UI)
   */
  captureInteractions() {
    const isOurExtensionElement = (element) => {
      // Check if element is part of our extension
      if (!element) return false;

      // Check element itself
      if (element.id === 'pointa-sidebar') return true;
      if (element.classList && (
      element.classList.contains('pointa-badge') ||
      element.classList.contains('pointa-badge-overlay') ||
      element.classList.contains('perf-recording-indicator') ||
      element.classList.contains('bug-recording-indicator')))
      return true;

      // Check if element is inside our sidebar or badge
      const closestSidebar = element.closest('#pointa-sidebar');
      const closestBadge = element.closest('.pointa-badge, .pointa-badge-overlay');

      return !!(closestSidebar || closestBadge);
    };

    const clickHandler = (event) => {
      if (!this.isRecording) return;

      const target = event.target;

      // Filter out clicks on our extension UI
      if (isOurExtensionElement(target)) {
        return;
      }

      const tagName = target.tagName.toLowerCase();
      const id = target.id;
      const className = target.className;
      const textContent = target.textContent?.substring(0, 20);

      this.addTimelineEvent({
        type: 'user-interaction',
        subtype: 'click',
        severity: 'info',
        data: {
          element: {
            tagName: tagName,
            id: id,
            className: className,
            textContent: textContent
          }
        }
      });
    };

    const inputHandler = (event) => {
      if (!this.isRecording) return;

      const target = event.target;

      // Filter out inputs on our extension UI
      if (isOurExtensionElement(target)) {
        return;
      }

      const tagName = target.tagName.toLowerCase();
      const type = target.type;
      const id = target.id;

      this.addTimelineEvent({
        type: 'user-interaction',
        subtype: 'input',
        severity: 'info',
        data: {
          element: {
            tagName: tagName,
            type: type,
            id: id
          }
        }
      });
    };

    const scrollHandler = (event) => {
      if (!this.isRecording) return;

      // Throttle scroll events
      if (!this._lastScrollTime || Date.now() - this._lastScrollTime > 500) {
        this._lastScrollTime = Date.now();

        this.addTimelineEvent({
          type: 'user-interaction',
          subtype: 'scroll',
          severity: 'info',
          data: {
            scrollY: window.scrollY,
            scrollX: window.scrollX
          }
        });
      }
    };

    // Add handlers
    document.addEventListener('click', clickHandler, true);
    document.addEventListener('input', inputHandler, true);
    document.addEventListener('scroll', scrollHandler, true);

    // Store handlers for cleanup
    this.interactionHandlers.set('click', clickHandler);
    this.interactionHandlers.set('input', inputHandler);
    this.interactionHandlers.set('scroll', scrollHandler);
  },

  /**
   * Remove interaction handlers
   */
  removeInteractionHandlers() {
    this.interactionHandlers.forEach((handler, eventType) => {
      document.removeEventListener(eventType, handler, true);
    });
    this.interactionHandlers.clear();
  },

  /**
   * Capture screenshot using Chrome API
   */
  async captureScreenshot() {
    // Hide all Pointa UI elements before screenshot
    const elementsToHide = [];

    try {
      // Find and hide sidebar
      const sidebar = document.querySelector('#pointa-sidebar');
      if (sidebar && sidebar.style.display !== 'none') {
        elementsToHide.push({ element: sidebar, originalDisplay: sidebar.style.display });
        sidebar.style.display = 'none';
      }

      // Find and hide recording indicator
      const recordingIndicator = document.querySelector('.bug-recording-indicator, .perf-recording-indicator');
      if (recordingIndicator && recordingIndicator.style.display !== 'none') {
        elementsToHide.push({ element: recordingIndicator, originalDisplay: recordingIndicator.style.display });
        recordingIndicator.style.display = 'none';
      }

      // Find and hide all annotation badges
      const badges = document.querySelectorAll('.pointa-badge-overlay, .pointa-badge');
      badges.forEach((badge) => {
        if (badge.style.display !== 'none') {
          elementsToHide.push({ element: badge, originalDisplay: badge.style.display });
          badge.style.display = 'none';
        }
      });

      // Small delay to ensure DOM updates are rendered
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Request screenshot from background script
      const response = await chrome.runtime.sendMessage({
        action: 'captureScreenshot'
      });

      if (response && response.success) {
        // Generate unique screenshot ID
        const screenshotId = `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.recordingData.screenshot = {
          id: screenshotId,
          captured: true,
          timestamp: new Date().toISOString(),
          _dataUrl: response.dataUrl
        };
      } else {
        this.recordingData.screenshot = {
          captured: false,
          error: response?.error
        };
        console.warn('[PerformanceRecorder] Failed to capture screenshot:', response?.error);
      }
    } catch (error) {
      this.recordingData.screenshot = {
        captured: false,
        error: error.message
      };
      console.error('[PerformanceRecorder] Error capturing screenshot:', error);
    } finally {
      // Restore all hidden elements
      elementsToHide.forEach(({ element, originalDisplay }) => {
        element.style.display = originalDisplay;
      });
    }
  },

  /**
   * Add an event to the timeline
   */
  addTimelineEvent(event) {
    const timestamp = new Date().toISOString();
    const relativeTime = Date.now() - this.startTime;

    const timelineEvent = {
      timestamp,
      relativeTime,
      ...event
    };

    // Only capture user interactions now
    if (event.type.startsWith('user-interaction') || event.type === 'recording-start' || event.type === 'recording-end') {
      this.recordingData.interactions.push(timelineEvent);
    }
  },

  /**
   * Analyze resources and generate insights
   * Focused on actionable resource optimization recommendations
   */
  analyzeResources() {
    const insights = {
      issues: [],
      recommendations: [],
      summary: {
        totalSlowResources: this.recordingData.resources.length,
        slowestDuration: this.recordingData.resources.length > 0 ? this.recordingData.resources[0].duration : 0,
        totalSize: this.recordingData.resources.reduce((sum, r) => sum + r.size, 0)
      }
    };

    const resources = this.recordingData.resources;
    const deviceInfo = this.recordingData.deviceInfo;

    // Analyze slow resources
    if (resources.length > 0) {
      const slowestResource = resources[0];

      // Very slow resource (>3s)
      if (slowestResource.duration > 3000) {
        insights.issues.push({
          type: 'very-slow-resource',
          severity: 'error',
          message: `Slowest resource "${this.getShortName(slowestResource.name)}" took ${slowestResource.duration}ms to load`,
          resource: slowestResource.name
        });

        if (slowestResource.type === 'script' || slowestResource.type === 'link') {
          insights.recommendations.push('Consider code-splitting, lazy loading, or async loading for JavaScript bundles');
        }
        if (slowestResource.type === 'img') {
          insights.recommendations.push('Optimize images: compress, use WebP format, implement responsive images');
        }
      }

      // Analyze large resources
      resources.forEach((resource) => {
        if (resource.size > 1000000) {// >1MB
          insights.issues.push({
            type: 'large-resource',
            severity: 'warning',
            message: `Large resource "${this.getShortName(resource.name)}" is ${Math.round(resource.size / 1000)}KB`,
            resource: resource.name
          });
        }
      });

      // Network-specific recommendations
      if (deviceInfo.connection) {
        const connectionType = deviceInfo.connection.effectiveType;
        if (connectionType === '3g' || connectionType === '2g' || connectionType === 'slow-2g') {
          insights.recommendations.push(`User on ${connectionType} connection - prioritize critical resources, defer non-essential assets`);
        }
      }

      // Large bundles
      const scripts = resources.filter((r) => r.type === 'script');
      if (scripts.length > 3) {
        insights.recommendations.push(`${scripts.length} JavaScript files detected - consider bundling or code-splitting to reduce requests`);
      }

      // Uncached resources
      const uncached = resources.filter((r) => !r.cached);
      if (uncached.length > 5) {
        insights.recommendations.push(`${uncached.length} resources not cached - implement proper cache headers`);
      }
    } else {
      // No slow resources detected
      insights.summary.message = 'No significant resource performance issues detected. All resources load reasonably fast.';
    }

    return insights;
  },

  /**
   * Get shortened resource name for display
   */
  getShortName(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      return pathParts[pathParts.length - 1] || url;
    } catch {
      return url.substring(0, 50);
    }
  }

};


// Make available globally
window.PerformanceRecorder = PerformanceRecorder;
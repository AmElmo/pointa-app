/**
 * bug-recorder.js
 * 
 * Handles recording bug sessions including console logs, network requests,
 * user interactions, and generates comprehensive timeline data for debugging.
 */

const BugRecorder = {
  isRecording: false,
  recordingData: null,
  startTime: null,
  consoleBackup: {},
  originalFetch: null,
  originalXHROpen: null,
  originalXHRSend: null,
  performanceObserver: null,
  interactionHandlers: new Map(),
  maxRecordingDuration: 30000, // 30 seconds (handled by sidebar UI)

  /**
   * Start recording a bug session
   */
  async startRecording() {
    if (this.isRecording) {
      console.warn('[BugRecorder] Already recording');
      return;
    }

    this.isRecording = true;
    this.startTime = Date.now();

    // Initialize recording data structure
    this.recordingData = {
      console: [],
      network: [],
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

    // Screenshot will be captured at the END of recording to show the bug state

    // Start capturing console
    this.captureConsole();

    // Start capturing network
    this.captureNetwork();

    // Start capturing interactions
    this.captureInteractions();

    // Add recording start event to timeline
    this.addTimelineEvent({
      type: 'recording-start',
      severity: 'info',
      data: {
        url: window.location.href,
        pageState: 'loaded'
      }
    });

    // Note: Auto-stop is handled by the sidebar UI timer
    // which will trigger the full stopBugReporting() flow including UI updates


  },

  /**
   * Stop recording and generate timeline
   */
  async stopRecording() {
    if (!this.isRecording) {
      console.warn('[BugRecorder] Not currently recording');
      return null;
    }

    // Add recording end event
    this.addTimelineEvent({
      type: 'recording-end',
      severity: 'info',
      data: {
        method: 'user-stopped',
        totalEvents: this.recordingData.console.length + this.recordingData.network.length + this.recordingData.interactions.length
      }
    });

    this.isRecording = false;

    // Restore console
    this.restoreConsole();

    // Stop network monitoring
    this.stopNetworkMonitoring();

    // Remove interaction handlers
    this.removeInteractionHandlers();

    // Capture screenshot NOW - shows the bug state with errors visible
    await this.captureScreenshot();

    // Generate timeline
    const timeline = this.generateTimeline();

    // Analyze key issues
    const keyIssues = this.analyzeKeyIssues(timeline);

    const result = {
      ...this.recordingData,
      timeline,
      keyIssues,
      endTime: new Date().toISOString(),
      duration: Date.now() - this.startTime
    };



    return result;
  },

  /**
   * Capture screenshot using Chrome API
   * Called at END of recording to capture the bug state (with errors visible)
   * Returns screenshot ID for separate storage, not embedded in JSON
   */
  async captureScreenshot() {
    // Hide all Pointa UI elements before screenshot (we want clean page capture)
    const elementsToHide = [];

    try {
      // Find and hide sidebar
      const sidebar = document.querySelector('#pointa-sidebar');
      if (sidebar && sidebar.style.display !== 'none') {
        elementsToHide.push({ element: sidebar, originalDisplay: sidebar.style.display });
        sidebar.style.display = 'none';
      }

      // Find and hide recording indicator
      const recordingIndicator = document.querySelector('.bug-recording-indicator');
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

      // Request screenshot from background script (it has the right permissions)
      const response = await chrome.runtime.sendMessage({
        action: 'captureScreenshot'
      });

      if (response && response.success) {
        // Generate unique screenshot ID
        const screenshotId = `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Store screenshot metadata only (not the full base64)
        this.recordingData.screenshot = {
          id: screenshotId,
          captured: true,
          timestamp: new Date().toISOString(),
          // Store the dataUrl temporarily for the background script to save
          _dataUrl: response.dataUrl
        };
      } else {
        this.recordingData.screenshot = {
          captured: false,
          error: response?.error
        };
        console.warn('[BugRecorder] Failed to capture screenshot:', response?.error);
      }
    } catch (error) {
      this.recordingData.screenshot = {
        captured: false,
        error: error.message
      };
      console.error('[BugRecorder] Error capturing screenshot:', error);
    } finally {
      // Restore all hidden elements
      elementsToHide.forEach(({ element, originalDisplay }) => {
        element.style.display = originalDisplay;
      });
    }
  },

  /**
   * Override console methods to capture logs
   * Filters out development logs (lines starting with [ModuleName])
   */
  captureConsole() {
    const consoleMethods = ['log', 'warn', 'error', 'info', 'debug'];

    consoleMethods.forEach((method) => {
      this.consoleBackup[method] = console[method];

      console[method] = (...args) => {
        // Call original
        this.consoleBackup[method](...args);

        // Record if we're capturing
        if (this.isRecording) {
          // Check if this log originated from our extension code
          const stack = new Error().stack;
          const isFromOurExtension = stack && (
          stack.includes('chrome-extension://') ||
          stack.includes('/extension/content/') ||
          stack.includes('bug-recorder.js') ||
          stack.includes('sidebar-ui.js') ||
          stack.includes('badge-manager.js'));


          // Only capture logs from the user's application, not our extension
          if (!isFromOurExtension) {
            // Convert args to message string
            const message = args.map((arg) => {
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg, null, 2);
                } catch {
                  return String(arg);
                }
              }
              return String(arg);
            }).join(' ');

            this.addTimelineEvent({
              type: method === 'error' ? 'console-error' : method === 'warn' ? 'console-warning' : 'console-log',
              severity: method === 'error' ? 'error' : method === 'warn' ? 'warning' : 'info',
              data: {
                message: message,
                level: method
              }
            });
          }
        }
      };
    });

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      if (this.isRecording) {
        this.addTimelineEvent({
          type: 'console-error',
          severity: 'error',
          data: {
            message: event.message,
            source: event.filename,
            lineNumber: event.lineno,
            columnNumber: event.colno,
            stack: event.error?.stack,
            level: 'error'
          }
        });
      }
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      if (this.isRecording) {
        this.addTimelineEvent({
          type: 'console-error',
          severity: 'error',
          data: {
            message: `Unhandled Promise Rejection: ${event.reason}`,
            level: 'error',
            reason: String(event.reason)
          }
        });
      }
    });
  },

  /**
   * Restore original console methods
   */
  restoreConsole() {
    Object.keys(this.consoleBackup).forEach((method) => {
      console[method] = this.consoleBackup[method];
    });
    this.consoleBackup = {};
  },

  /**
   * Capture network requests using fetch and XHR interception
   */
  captureNetwork() {
    // Intercept fetch
    this.originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      const options = args[1] || {};

      try {
        const startTime = Date.now();
        const response = await this.originalFetch(...args);
        const duration = Date.now() - startTime;

        if (this.isRecording) {
          // Only capture response body for failed requests
          let responseBody = null;
          if (!response.ok) {
            try {
              const clonedResponse = response.clone();
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                responseBody = await clonedResponse.json();
              } else {
                const text = await clonedResponse.text();
                // Limit size
                responseBody = text.length > 500 ? text.substring(0, 500) + '... (truncated)' : text;
              }
            } catch {
              responseBody = '[Unable to parse response body]';
            }
          }

          this.addTimelineEvent({
            type: 'network',
            subtype: response.ok ? 'success' : 'failed',
            severity: response.ok ? 'info' : 'error',
            data: {
              url: url,
              method: options.method || 'GET',
              status: response.status,
              statusText: response.statusText,
              duration: duration,
              ...(responseBody && { responseBody }), // Only include if not null
              type: 'fetch'
            }
          });
        }

        return response;
      } catch (error) {
        if (this.isRecording) {
          this.addTimelineEvent({
            type: 'network',
            subtype: 'failed',
            severity: 'error',
            data: {
              url: url,
              method: options.method || 'GET',
              error: error.message,
              type: 'fetch'
            }
          });
        }
        throw error;
      }
    };

    // Intercept XHR
    const self = this;
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      this._bugRecorderData = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method: method,
        url: url,
        startTime: Date.now()
      };

      return self.originalXHROpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const xhr = this;

      // Add load handler
      xhr.addEventListener('load', function () {
        if (self.isRecording && xhr._bugRecorderData) {
          const duration = Date.now() - xhr._bugRecorderData.startTime;
          const isSuccess = xhr.status >= 200 && xhr.status < 300;

          // Only capture response body for failed requests
          let responseBody = null;
          if (!isSuccess) {
            try {
              const contentType = xhr.getResponseHeader('content-type');
              if (contentType && contentType.includes('application/json')) {
                responseBody = JSON.parse(xhr.responseText);
              } else {
                const text = xhr.responseText || '';
                responseBody = text.length > 500 ? text.substring(0, 500) + '... (truncated)' : text;
              }
            } catch {
              responseBody = xhr.responseText ? xhr.responseText.substring(0, 500) + '... (truncated)' : '[No response]';
            }
          }

          self.addTimelineEvent({
            type: 'network',
            subtype: isSuccess ? 'success' : 'failed',
            severity: isSuccess ? 'info' : 'error',
            data: {
              url: xhr._bugRecorderData.url,
              method: xhr._bugRecorderData.method,
              status: xhr.status,
              statusText: xhr.statusText,
              duration: duration,
              ...(responseBody && { responseBody }), // Only include if not null
              type: 'xhr'
            }
          });
        }
      });

      // Add error handler
      xhr.addEventListener('error', function () {
        if (self.isRecording && xhr._bugRecorderData) {
          self.addTimelineEvent({
            type: 'network',
            subtype: 'failed',
            severity: 'error',
            data: {
              url: xhr._bugRecorderData.url,
              method: xhr._bugRecorderData.method,
              error: 'Network error',
              type: 'xhr'
            }
          });
        }
      });

      return self.originalXHRSend.call(this, body);
    };
  },

  /**
   * Stop network monitoring
   */
  stopNetworkMonitoring() {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      this.originalXHROpen = null;
    }

    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
      this.originalXHRSend = null;
    }
  },

  /**
   * Capture user interactions
   */
  captureInteractions() {
    const clickHandler = (event) => {
      if (!this.isRecording) return;

      const target = event.target;
      const tagName = target.tagName.toLowerCase();
      const id = target.id;
      const className = target.className;
      const textContent = target.textContent?.substring(0, 50);

      // Generate selectors for replay
      const selector = this.generateSelector(target);
      const xpath = this.getXPath(target);

      this.addTimelineEvent({
        type: 'user-interaction',
        subtype: 'click',
        severity: 'info',
        data: {
          element: {
            tagName: tagName,
            id: id,
            className: className,
            textContent: textContent,
            selector: selector,
            xpath: xpath
          },
          coordinates: {
            x: event.clientX,
            y: event.clientY
          }
        }
      });
    };

    const inputHandler = (event) => {
      if (!this.isRecording) return;

      const target = event.target;
      const tagName = target.tagName.toLowerCase();
      const type = target.type;
      const id = target.id;
      const className = target.className;

      // Don't capture password values
      let value = '[REDACTED]';
      if (type !== 'password' && type !== 'email') {
        value = target.value?.substring(0, 20) || '';
      }

      // Generate selectors for replay
      const selector = this.generateSelector(target);
      const xpath = this.getXPath(target);

      this.addTimelineEvent({
        type: 'user-interaction',
        subtype: 'input',
        severity: 'info',
        data: {
          element: {
            tagName: tagName,
            type: type,
            id: id,
            className: className,
            selector: selector,
            xpath: xpath
          },
          value: value
        }
      });
    };

    const keypressHandler = (event) => {
      if (!this.isRecording) return;

      // Only capture special keys (Enter, Escape, etc.)
      if (['Enter', 'Escape', 'Tab'].includes(event.key)) {
        this.addTimelineEvent({
          type: 'user-interaction',
          subtype: 'keypress',
          severity: 'info',
          data: {
            key: event.key
          }
        });
      }
    };

    // Add handlers
    document.addEventListener('click', clickHandler, true);
    document.addEventListener('input', inputHandler, true);
    document.addEventListener('keydown', keypressHandler, true);

    // Store handlers for cleanup
    this.interactionHandlers.set('click', clickHandler);
    this.interactionHandlers.set('input', inputHandler);
    this.interactionHandlers.set('keydown', keypressHandler);
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
   * Generate CSS selector for element replay
   */
  generateSelector(element) {
    // Try ID first
    if (element.id) return `#${element.id}`;

    // Try unique class combo
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter((c) => c);
      if (classes.length > 0) {
        const selector = `${element.tagName.toLowerCase()}.${classes.join('.')}`;
        try {
          if (document.querySelectorAll(selector).length === 1) return selector;
        } catch (e) {

          // Invalid selector, continue
        }}
    }

    // Fallback to nth-child path
    let path = [];
    let current = element;
    while (current && current.parentElement) {
      const index = Array.from(current.parentElement.children).indexOf(current) + 1;
      path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
      current = current.parentElement;
      if (current && current.id) {
        path.unshift(`#${current.id}`);
        break;
      }
      // Stop at body
      if (current && current.tagName.toLowerCase() === 'body') break;
    }
    return path.join(' > ');
  },

  /**
   * Generate XPath for element
   */
  getXPath(element) {
    if (element.id) return `//*[@id="${element.id}"]`;

    let path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      path.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      current = current.parentElement;
      // Stop at body
      if (current && current.tagName.toLowerCase() === 'body') break;
    }
    return '/' + path.join('/');
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

    // Add to appropriate array
    if (event.type.startsWith('console')) {
      this.recordingData.console.push(timelineEvent);
    } else if (event.type === 'network') {
      this.recordingData.network.push(timelineEvent);
    } else if (event.type.startsWith('user-interaction')) {
      this.recordingData.interactions.push(timelineEvent);
    }
  },

  /**
   * Generate unified timeline from all events
   */
  generateTimeline() {
    const allEvents = [
    ...this.recordingData.console,
    ...this.recordingData.network,
    ...this.recordingData.interactions];


    // Sort by timestamp
    allEvents.sort((a, b) => a.relativeTime - b.relativeTime);

    // Generate summary
    const summary = {
      totalEvents: allEvents.length,
      userInteractions: this.recordingData.interactions.length,
      networkRequests: this.recordingData.network.length,
      networkFailures: this.recordingData.network.filter((e) => e.subtype === 'failed').length,
      consoleErrors: this.recordingData.console.filter((e) => e.type === 'console-error').length,
      consoleWarnings: this.recordingData.console.filter((e) => e.type === 'console-warning').length,
      consoleLogs: this.recordingData.console.filter((e) => e.type === 'console-log').length
    };

    return {
      events: allEvents,
      summary
    };
  },

  /**
   * Analyze timeline to identify key issues and root causes
   */
  analyzeKeyIssues(timeline) {
    const keyIssues = [];
    const events = timeline.events;

    // Find console errors
    const consoleErrors = events.filter((e) => e.type === 'console-error');
    consoleErrors.forEach((error) => {
      keyIssues.push({
        type: 'console-error',
        description: error.data.message,
        timestamp: error.timestamp,
        relativeTime: error.relativeTime,
        severity: 'error',
        source: error.data.source,
        lineNumber: error.data.lineNumber
      });
    });

    // Find network failures
    const networkFailures = events.filter((e) => e.type === 'network' && e.subtype === 'failed');
    networkFailures.forEach((failure) => {
      keyIssues.push({
        type: 'network-failure',
        description: `${failure.data.method} ${failure.data.url} failed with status ${failure.data.status || 'unknown'}`,
        timestamp: failure.timestamp,
        relativeTime: failure.relativeTime,
        severity: 'error',
        url: failure.data.url,
        status: failure.data.status,
        responseBody: failure.data.responseBody
      });
    });

    // Try to detect root cause (simplified heuristic)
    if (keyIssues.length > 0) {
      // Sort by time
      keyIssues.sort((a, b) => a.relativeTime - b.relativeTime);

      // First error is likely the root cause
      const rootCause = keyIssues[0];
      rootCause.isRootCause = true;
    }

    return keyIssues;
  },

  /**
   * Format relative time for display (e.g., "00:02" for 2 seconds)
   */
  formatRelativeTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
};

// Make available globally
window.BugRecorder = BugRecorder;
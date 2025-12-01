/**
 * bug-report-ui.js
 * 
 * Handles UI for bug reporting including recording indicator, timeline visualization,
 * and bug report form.
 */

const BugReportUI = {
  recordingIndicator: null,
  currentModal: null,

  /**
   * Format bug ID in human-friendly way
   * BUG-1763347240602 -> "BUG-1763347240602 (Nov 17, 2025 2:40 AM)"
   */
  formatBugId(bugId) {
    // Extract timestamp from bug ID (e.g., "BUG-1763347240602" -> 1763347240602)
    const match = bugId.match(/BUG-(\d+)/);
    if (!match) return bugId;

    const timestamp = parseInt(match[1], 10);
    const date = new Date(timestamp);

    // Format: "Month Day, Year HH:MM AM/PM"
    const options = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    const friendlyDate = date.toLocaleString('en-US', options);

    return `${bugId} <span class="bug-id-date">(${friendlyDate})</span>`;
  },

  /**
   * Show recording indicator (red border + cursor dot)
   */
  showRecordingIndicator() {
    // Create recording indicator overlay
    this.recordingIndicator = document.createElement('div');
    this.recordingIndicator.className = 'bug-recording-indicator';
    this.recordingIndicator.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
    this.recordingIndicator.innerHTML = `
      <div class="bug-recording-pulse"></div>
      <div class="bug-recording-timer">00:00</div>
      <button class="bug-recording-stop-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
        Stop Recording
      </button>
    `;

    document.body.appendChild(this.recordingIndicator);

    // Update timer
    const startTime = Date.now();
    const timerEl = this.recordingIndicator.querySelector('.bug-recording-timer');

    const timerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }, 1000);

    // Store interval for cleanup
    this.recordingIndicator._timerInterval = timerInterval;

    // Add cursor dot
    document.body.style.cursor = 'crosshair';

    // Add stop button handler
    const stopBtn = this.recordingIndicator.querySelector('.bug-recording-stop-btn');
    stopBtn.addEventListener('click', async () => {
      await window.pointa.stopBugReporting();
    });
  },

  /**
   * Hide recording indicator
   */
  hideRecordingIndicator() {
    if (this.recordingIndicator) {
      // Clear timer interval
      if (this.recordingIndicator._timerInterval) {
        clearInterval(this.recordingIndicator._timerInterval);
      }

      this.recordingIndicator.remove();
      this.recordingIndicator = null;
    }

    // Restore cursor
    document.body.style.cursor = '';
  },

  /**
   * Show timeline review modal
   */
  showTimelineReview(recordingData) {
    const timeline = recordingData.timeline;

    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('bug-timeline');
    }

    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal bug-report-modal';
    modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    // Generate timeline HTML
    const timelineHTML = this.generateTimelineHTML(timeline);

    modal.innerHTML = `
      <div class="pointa-comment-modal-content bug-report-modal-content">
        <div class="pointa-comment-modal-header">
          <h3 class="pointa-comment-modal-title">🐛 Bug Timeline</h3>
          <button class="pointa-comment-modal-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div class="bug-timeline-container">
          <div class="bug-timeline-summary">
            <div class="bug-summary-stat">
              <span class="bug-summary-icon">🖱️</span>
              <span class="bug-summary-value">${timeline.summary.userInteractions}</span>
              <span class="bug-summary-label">interactions</span>
            </div>
            <div class="bug-summary-stat">
              <span class="bug-summary-icon">🌐</span>
              <span class="bug-summary-value">${timeline.summary.networkRequests}</span>
              <span class="bug-summary-label">requests</span>
            </div>
            <div class="bug-summary-stat ${timeline.summary.networkFailures > 0 ? 'bug-summary-error' : ''}">
              <span class="bug-summary-icon">⚠️</span>
              <span class="bug-summary-value">${timeline.summary.networkFailures}</span>
              <span class="bug-summary-label">failures</span>
            </div>
            <div class="bug-summary-stat ${timeline.summary.consoleErrors > 0 ? 'bug-summary-error' : ''}">
              <span class="bug-summary-icon">🔴</span>
              <span class="bug-summary-value">${timeline.summary.consoleErrors}</span>
              <span class="bug-summary-label">errors</span>
            </div>
            <div class="bug-summary-stat ${timeline.summary.consoleWarnings > 0 ? 'bug-summary-warning' : ''}">
              <span class="bug-summary-icon">⚠️</span>
              <span class="bug-summary-value">${timeline.summary.consoleWarnings}</span>
              <span class="bug-summary-label">warnings</span>
            </div>
            <div class="bug-summary-stat">
              <span class="bug-summary-icon">💬</span>
              <span class="bug-summary-value">${timeline.summary.consoleLogs}</span>
              <span class="bug-summary-label">logs</span>
            </div>
          </div>
          
          <div class="bug-timeline-tabs">
            <button class="bug-timeline-tab active" data-tab="timeline">
              <span class="bug-tab-icon">📋</span>
              <span class="bug-tab-label">Timeline</span>
            </button>
            <button class="bug-timeline-tab" data-tab="issues">
              <span class="bug-tab-icon">🎯</span>
              <span class="bug-tab-label">Key Issues Detected</span>
              ${recordingData.keyIssues.length > 0 ? `<span class="bug-tab-badge">${recordingData.keyIssues.length}</span>` : ''}
            </button>
          </div>
          
          <div class="bug-timeline-tab-content active" data-tab-content="timeline">
            <div class="bug-timeline-events">
              ${timelineHTML}
            </div>
          </div>
          
          <div class="bug-timeline-tab-content" data-tab-content="issues">
            <div class="bug-report-key-issues">
              ${recordingData.keyIssues.length > 0 ? `
                <ul class="bug-issues-list">
                  ${recordingData.keyIssues.map((issue) => `
                    <li class="bug-issue-item ${issue.severity}">
                      <span class="bug-issue-type">${this.getIssueIcon(issue.type)}</span>
                      <span class="bug-issue-desc">${this.escapeHtml(issue.description)}</span>
                      ${issue.isRootCause ? '<span class="bug-root-cause-badge">Root Cause</span>' : ''}
                    </li>
                  `).join('')}
                </ul>
              ` : '<p class="bug-no-issues">No critical issues detected in timeline.</p>'}
            </div>
          </div>
        </div>
        
        <div class="pointa-comment-actions">
          <button class="pointa-btn pointa-btn-secondary" id="cancel-bug-report">Cancel</button>
          <button class="pointa-btn pointa-btn-primary" id="continue-bug-report">Continue to Report</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.currentModal = modal;

    // Set up event listeners
    this.setupTimelineModalListeners(modal, recordingData);
  },

  /**
   * Generate timeline HTML
   */
  generateTimelineHTML(timeline) {
    return timeline.events.map((event) => {
      const timeStr = BugRecorder.formatRelativeTime(event.relativeTime);
      const icon = this.getEventIcon(event);
      const description = this.getEventDescription(event);
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
   * Get icon for event type
   */
  getEventIcon(event) {
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
   * Get description for event
   */
  getEventDescription(event) {
    switch (event.type) {
      case 'recording-start':
        return 'Recording started';
      case 'recording-end':
        return 'Recording stopped';
      case 'user-interaction':
        if (event.subtype === 'click') {
          const elem = event.data.element;
          const desc = elem.textContent || elem.id || elem.tagName;
          return `Clicked "${this.escapeHtml(desc)}"`;
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
        if (event.subtype === 'failed') {
          return `${event.data.method} ${this.truncateUrl(event.data.url)} - Failed (${statusOrError})`;
        }
        return `${event.data.method} ${this.truncateUrl(event.data.url)} - ${event.data.status}`;
      case 'console-error':
        return this.escapeHtml(this.truncateText(event.data.message, 100));
      case 'console-warning':
        return this.escapeHtml(this.truncateText(event.data.message, 100));
      case 'console-log':
        return this.escapeHtml(this.truncateText(event.data.message, 100));
      default:
        return 'Event';
    }
  },

  /**
   * Get icon for issue type
   */
  getIssueIcon(type) {
    switch (type) {
      case 'console-error':return '🔴';
      case 'network-failure':return '🌐';
      default:return '⚠️';
    }
  },

  /**
   * Show bug report form
   */
  showReportForm(recordingData) {
    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('bug-report-form');
    }

    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal bug-report-modal';
    modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    modal.innerHTML = `
      <div class="pointa-comment-modal-content">
        <div class="pointa-comment-modal-header">
          <h3 class="pointa-comment-modal-title">🐛 Describe the Bug</h3>
          <button class="pointa-comment-modal-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div class="bug-report-form-container">
          <div class="bug-form-field">
            <label for="bug-what-happened">What happened? *</label>
            <textarea 
              id="bug-what-happened"
              class="pointa-comment-textarea bug-form-textarea" 
              placeholder="Describe what went wrong in one sentence..."
              maxlength="500"
              rows="3"
            ></textarea>
            <div class="bug-form-helper">Keep it short - we captured the technical details</div>
          </div>
          
          <div class="bug-form-field">
            <label for="bug-expected">What did you expect? *</label>
            <textarea 
              id="bug-expected"
              class="pointa-comment-textarea bug-form-textarea" 
              placeholder="Describe what should have happened..."
              maxlength="500"
              rows="3"
            ></textarea>
          </div>
          
          <div class="bug-captured-data-summary">
            <h4>📊 Captured Data</h4>
            <div class="bug-data-chips">
              ${recordingData.screenshot?.captured ? '<span class="bug-data-chip">✓ Screenshot (saved to disk)</span>' : '<span class="bug-data-chip">⚠ Screenshot (not captured)</span>'}
              <span class="bug-data-chip">✓ ${recordingData.timeline.summary.consoleErrors} Errors</span>
              <span class="bug-data-chip">✓ ${recordingData.timeline.summary.consoleWarnings} Warnings</span>
              <span class="bug-data-chip">✓ ${recordingData.timeline.summary.consoleLogs} Logs</span>
              <span class="bug-data-chip">✓ ${recordingData.timeline.summary.networkFailures} Failed Requests</span>
              <span class="bug-data-chip">✓ ${recordingData.timeline.summary.userInteractions} Interactions</span>
            </div>
          </div>
        </div>
        
        <div class="pointa-comment-actions">
          <button class="pointa-btn pointa-btn-secondary" id="cancel-bug-report">Cancel</button>
          <button class="pointa-btn pointa-btn-primary" id="submit-bug-report" disabled>Create Bug Report</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.currentModal = modal;

    // Set up form event listeners
    this.setupFormModalListeners(modal, recordingData);
  },

  /**
   * Show confirmation modal
   */
  showConfirmation(bugReportId) {
    // Close any existing modal first
    this.closeModal();

    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('bug-confirmation');
    }

    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal bug-report-modal';
    modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    modal.innerHTML = `
      <div class="pointa-comment-modal-content bug-confirmation-content">
        <div class="bug-confirmation-icon">✓</div>
        <h3 class="bug-confirmation-title">Bug Report Created</h3>
        <p class="bug-confirmation-id">${this.formatBugId(bugReportId)}</p>
        
        <div class="bug-confirmation-next">
          <h4>What's next?</h4>
          <ul>
            <li>Saved to local database</li>
            <li>Ready for AI analysis</li>
            <li>View in sidebar → Bug Reports tab</li>
          </ul>
        </div>
        
        <div class="bug-ai-prompt">
          <p>Tell your AI:</p>
          <div class="bug-ai-prompt-container">
            <code id="bug-ai-prompt-text">"Analyze bug report ${bugReportId}"</code>
            <button class="bug-ai-copy-btn" id="bug-ai-copy-btn" title="Copy to clipboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <button class="pointa-btn pointa-btn-primary bug-confirmation-done-btn" id="bug-confirmation-done">Done</button>
      </div>
    `;

    document.body.appendChild(modal);
    this.currentModal = modal;

    // Set up done button handler and copy button (use setTimeout to ensure DOM is ready)
    setTimeout(() => {
      const doneBtn = document.getElementById('bug-confirmation-done');
      const copyBtn = document.getElementById('bug-ai-copy-btn');
      const promptText = document.getElementById('bug-ai-prompt-text');



      // Set up copy button
      if (copyBtn && promptText) {
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();

          // Remove surrounding quotes from the text
          const textToCopy = promptText.textContent.replace(/^["']|["']$/g, '');

          try {
            await navigator.clipboard.writeText(textToCopy);

            // Visual feedback - change icon to checkmark
            copyBtn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            `;
            copyBtn.style.color = '#10b981';

            // Reset after 2 seconds
            setTimeout(() => {
              copyBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              `;
              copyBtn.style.color = '';
            }, 2000);
          } catch (err) {
            console.error('[BugReportUI] Failed to copy text:', err);
          }
        });
      }

      if (doneBtn) {
        // Store modal reference in closure to ensure we can close it
        const modalToClose = modal;

        doneBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();


          // Unregister modal with central manager
          if (window.PointaModalManager) {
            window.PointaModalManager.unregisterModal('bug-confirmation');
          }

          // Close the modal directly using the stored reference
          if (modalToClose && modalToClose.parentNode) {
            // Clean up escape handler if it exists
            if (modalToClose._escHandler) {
              document.removeEventListener('keydown', modalToClose._escHandler);
            }

            modalToClose.remove();
            this.currentModal = null;

          } else {
            // Fallback to closeModal method
            this.closeModal();
          }

          // CRITICAL: Always refresh sidebar to show updated bug report count
          // This ensures the dropdown badge and bug reports list are updated immediately
          if (window.PointaSidebar && window.PointaSidebar.isOpen) {

            window.PointaSidebar.isRecordingBug = false;
            window.PointaSidebar.currentView = null;
            const serverOnline = await window.PointaSidebar.checkServerStatus();
            await window.PointaSidebar.updateContent(window.pointa, serverOnline);

          } else if (window.PointaSidebar && !window.PointaSidebar.isOpen) {
            // If sidebar is closed, open it to show the new bug report

            await window.PointaSidebar.open(window.pointa);
          }
        });


      } else {
        console.error('[BugReportUI] Done button not found!');
      }
    }, 100);

    // Close on backdrop click (clicking outside the content area)
    modal.addEventListener('click', async (e) => {
      // Only close if clicking directly on the modal backdrop (not its children)
      // Check that the target is exactly the modal element, not a child
      if (e.target === modal) {


        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('bug-confirmation');
        }

        this.closeModal();

        // CRITICAL: Refresh sidebar when closing via backdrop
        if (window.PointaSidebar && window.PointaSidebar.isOpen) {

          window.PointaSidebar.isRecordingBug = false;
          window.PointaSidebar.currentView = null;
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(window.pointa, serverOnline);
        } else if (window.PointaSidebar && !window.PointaSidebar.isOpen) {
          // If sidebar is closed, open it to show the new bug report
          await window.PointaSidebar.open(window.pointa);
        }
      }
    });

    // ESC to close
    const escHandler = async (e) => {
      if (e.key === 'Escape') {


        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('bug-confirmation');
        }

        this.closeModal();
        document.removeEventListener('keydown', escHandler);

        // CRITICAL: Refresh sidebar when closing via ESC
        if (window.PointaSidebar && window.PointaSidebar.isOpen) {

          window.PointaSidebar.isRecordingBug = false;
          window.PointaSidebar.currentView = null;
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(window.pointa, serverOnline);
        } else if (window.PointaSidebar && !window.PointaSidebar.isOpen) {
          // If sidebar is closed, open it to show the new bug report
          await window.PointaSidebar.open(window.pointa);
        }
      }
    };
    document.addEventListener('keydown', escHandler);

    // Store handler reference for cleanup
    modal._escHandler = escHandler;

    // Auto-close after 8 seconds
    setTimeout(async () => {
      if (this.currentModal === modal) {


        // Unregister modal with central manager
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('bug-confirmation');
        }

        this.closeModal();

        // CRITICAL: Refresh sidebar when auto-closing
        if (window.PointaSidebar && window.PointaSidebar.isOpen) {

          window.PointaSidebar.isRecordingBug = false;
          window.PointaSidebar.currentView = null;
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(window.pointa, serverOnline);
        } else if (window.PointaSidebar && !window.PointaSidebar.isOpen) {
          // If sidebar is closed, open it to show the new bug report
          await window.PointaSidebar.open(window.pointa);
        }
      }
    }, 8000);
  },

  /**
   * Set up timeline modal listeners
   */
  setupTimelineModalListeners(modal, recordingData) {
    const closeBtn = modal.querySelector('.pointa-comment-modal-close');
    const cancelBtn = modal.querySelector('#cancel-bug-report');
    const continueBtn = modal.querySelector('#continue-bug-report');
    const tabButtons = modal.querySelectorAll('.bug-timeline-tab');
    const tabContents = modal.querySelectorAll('.bug-timeline-tab-content');

    // Tab switching logic
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Remove active class from all tabs and contents
        tabButtons.forEach((btn) => btn.classList.remove('active'));
        tabContents.forEach((content) => content.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        button.classList.add('active');
        const targetContent = modal.querySelector(`[data-tab-content="${targetTab}"]`);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });

    const closeModal = async () => {
      // Unregister this modal
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('bug-timeline');
      }
      modal.remove();
      this.currentModal = null;

      // Reset sidebar state
      if (window.PointaSidebar && window.PointaSidebar.isOpen) {
        window.PointaSidebar.isRecordingBug = false;
        window.PointaSidebar.currentView = null;
        const serverOnline = await window.PointaSidebar.checkServerStatus();
        await window.PointaSidebar.updateContent(window.pointa, serverOnline);
      }
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    continueBtn.addEventListener('click', () => {
      // Unregister timeline modal, showReportForm will register the form modal
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('bug-timeline');
      }
      modal.remove();
      this.currentModal = null;
      this.showReportForm(recordingData);
    });

    // ESC to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  /**
   * Set up form modal listeners
   */
  setupFormModalListeners(modal, recordingData) {
    const closeBtn = modal.querySelector('.pointa-comment-modal-close');
    const cancelBtn = modal.querySelector('#cancel-bug-report');
    const submitBtn = modal.querySelector('#submit-bug-report');
    const whatHappenedInput = modal.querySelector('#bug-what-happened');
    const expectedInput = modal.querySelector('#bug-expected');

    const closeModal = async () => {
      // Unregister this modal
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('bug-report-form');
      }
      modal.remove();
      this.currentModal = null;

      // Reset sidebar state
      if (window.PointaSidebar && window.PointaSidebar.isOpen) {
        window.PointaSidebar.isRecordingBug = false;
        window.PointaSidebar.currentView = null;
        const serverOnline = await window.PointaSidebar.checkServerStatus();
        await window.PointaSidebar.updateContent(window.pointa, serverOnline);
      }
    };

    // Enable/disable submit button
    const updateSubmitButton = () => {
      const whatHappened = whatHappenedInput.value.trim();
      const expected = expectedInput.value.trim();
      submitBtn.disabled = !whatHappened || !expected;
    };

    whatHappenedInput.addEventListener('input', updateSubmitButton);
    expectedInput.addEventListener('input', updateSubmitButton);

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    submitBtn.addEventListener('click', async () => {
      const whatHappened = whatHappenedInput.value.trim();
      const expected = expectedInput.value.trim();

      // Unregister form modal before showing confirmation
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('bug-report-form');
      }

      // Create bug report
      await window.pointa.saveBugReport({
        whatHappened,
        expectedBehavior: expected,
        recordingData
      });

      modal.remove();
      this.currentModal = null;
    });

    // ESC to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  /**
   * Close current modal
   */
  closeModal() {


    if (this.currentModal) {


      // Store reference to modal being closed
      const modalToClose = this.currentModal;

      // Clear current modal reference immediately
      this.currentModal = null;

      // Unregister modal with central manager (check all possible bug report modal IDs)
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('bug-timeline');
        window.PointaModalManager.unregisterModal('bug-report-form');
        window.PointaModalManager.unregisterModal('bug-confirmation');
      }

      // Clean up escape handler if it exists
      if (modalToClose._escHandler) {
        document.removeEventListener('keydown', modalToClose._escHandler);
      }

      // Remove from DOM immediately
      modalToClose.remove();

    } else {

    }
  },

  /**
   * Utility: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Utility: Truncate text
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  /**
   * Utility: Truncate URL
   */
  truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname;
      if (path.length > 40) {
        path = '...' + path.substring(path.length - 37);
      }
      return path + (urlObj.search ? '?' : '');
    } catch {
      return url.substring(0, 40) + (url.length > 40 ? '...' : '');
    }
  }
};

// Make available globally
window.BugReportUI = BugReportUI;
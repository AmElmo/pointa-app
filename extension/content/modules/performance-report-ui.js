/**
 * performance-report-ui.js
 * 
 * Handles UI for performance investigation including recording indicator 
 * and performance dashboard visualization.
 */

const PerformanceReportUI = {
  recordingIndicator: null,
  currentModal: null,

  /**
   * Format performance report ID in human-friendly way
   */
  formatPerfId(perfId) {
    const match = perfId.match(/PERF-(\d+)/);
    if (!match) return perfId;

    const timestamp = parseInt(match[1], 10);
    const date = new Date(timestamp);

    const options = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    const friendlyDate = date.toLocaleString('en-US', options);

    return `${perfId} <span class="bug-id-date">(${friendlyDate})</span>`;
  },

  /**
   * Show recording indicator
   */
  showRecordingIndicator() {
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

    this.recordingIndicator._timerInterval = timerInterval;

    // Add cursor indicator
    document.body.style.cursor = 'crosshair';

    // Add stop button handler
    const stopBtn = this.recordingIndicator.querySelector('.bug-recording-stop-btn');
    stopBtn.addEventListener('click', async () => {
      // If sidebar is open, handle state there (like bug reporting does)
      if (window.PointaSidebar && window.PointaSidebar.isOpen && window.PointaSidebar.isRecordingBug) {
        // Clear the sidebar timer
        if (window.PointaSidebar.sidebarTimerInterval) {
          clearInterval(window.PointaSidebar.sidebarTimerInterval);
          window.PointaSidebar.sidebarTimerInterval = null;
        }

        // Clear recording flag FIRST
        window.PointaSidebar.isRecordingBug = false;
        window.PointaSidebar.currentView = null;

        // Stop recording (shows modal)
        await window.pointa.stopPerformanceInvestigation();

        // Update sidebar to normal state
        const serverOnline = await window.PointaSidebar.checkServerStatus();
        await window.PointaSidebar.updateContent(window.pointa, serverOnline);
      } else {
        // No sidebar or sidebar not in recording mode, just stop
        await window.pointa.stopPerformanceInvestigation();
      }
    });
  },

  /**
   * Hide recording indicator
   */
  hideRecordingIndicator() {
    if (this.recordingIndicator) {
      if (this.recordingIndicator._timerInterval) {
        clearInterval(this.recordingIndicator._timerInterval);
      }

      this.recordingIndicator.remove();
      this.recordingIndicator = null;
    }

    document.body.style.cursor = '';
  },

  /**
   * Show performance dashboard modal
   * @param {Object} recordingData - Performance recording data
   * @param {boolean} isViewMode - If true, only show close button (viewing existing report)
   */
  showPerformanceDashboard(recordingData, isViewMode = false) {
    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('performance-dashboard');
    }

    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal bug-report-modal perf-dashboard-modal';
    modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    const insights = recordingData.insights;
    const resources = recordingData.resources;
    const deviceInfo = recordingData.deviceInfo;
    const interactions = recordingData.interactions;

    // Generate dashboard HTML
    const deviceHTML = this.generateDeviceHTML(deviceInfo);
    const resourcesHTML = this.generateResourcesHTML(resources);
    const insightsHTML = this.generateInsightsHTML(insights);
    const interactionsHTML = this.generateInteractionsHTML(interactions);

    modal.innerHTML = `
      <div class="pointa-comment-modal-content perf-dashboard-content">
        <div class="pointa-comment-modal-header">
          <h3 class="pointa-comment-modal-title">⚡ Resource Performance Report</h3>
          <button class="pointa-comment-modal-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div class="perf-dashboard-scroll">
          <!-- Device & Connection Context -->
          ${deviceHTML}
          
          <!-- Resources -->
          ${resourcesHTML}
          
          <!-- Insights & Recommendations -->
          ${insightsHTML}
          
          <!-- User Interactions Context -->
          ${interactionsHTML}
        </div>
        
        <div class="pointa-comment-actions">
          ${isViewMode ?
    `<button class="pointa-btn pointa-btn-secondary" id="close-perf-report">Close</button>` :
    `
              <button class="pointa-btn pointa-btn-secondary" id="cancel-perf-report">Cancel</button>
              <button class="pointa-btn pointa-btn-primary" id="save-perf-report">Save Report</button>
            `}
        </div>
      </div>
    `;


    document.body.appendChild(modal);
    this.currentModal = modal;

    // Set up event listeners
    this.setupDashboardModalListeners(modal, recordingData, isViewMode);

    // Add backdrop click handler
    modal.addEventListener('click', async (e) => {
      if (e.target === modal) {
        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('performance-dashboard');
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
      }
    });
  },

  /**
   * Generate device and connection context HTML
   */
  generateDeviceHTML(deviceInfo) {
    if (!deviceInfo) return '';

    const connection = deviceInfo.connection;
    const connectionClass = connection && (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g' || connection.effectiveType === '3g') ?
    'perf-poor' :
    connection && connection.effectiveType === '4g' ?
    'perf-good' :
    '';

    return `
      <div class="perf-device-section">
        <h4 style="margin-bottom: 16px;">📱 Device & Network Context</h4>
        <div class="perf-metrics-grid">
          <div class="perf-metric-card">
            <div class="perf-metric-label">CPU Cores</div>
            <div class="perf-metric-value">${deviceInfo.cpuCores}</div>
          </div>
          
          <div class="perf-metric-card">
            <div class="perf-metric-label">Device Memory</div>
            <div class="perf-metric-value">${deviceInfo.deviceMemory}</div>
          </div>
          
          ${connection ? `
            <div class="perf-metric-card ${connectionClass}">
              <div class="perf-metric-label">Connection Type</div>
              <div class="perf-metric-value">${connection.effectiveType || 'unknown'}</div>
              <div class="perf-metric-rating">${connection.downlink || 'N/A'}</div>
            </div>
            
            <div class="perf-metric-card">
              <div class="perf-metric-label">Network RTT</div>
              <div class="perf-metric-value">${connection.rtt || 'N/A'}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  /**
   * Generate user interactions context HTML
   */
  generateInteractionsHTML(interactions) {
    if (!interactions || interactions.length === 0) return '';

    // Filter out recording-start and recording-end events
    const userInteractions = interactions.filter((i) =>
    i.type === 'user-interaction'
    );

    if (userInteractions.length === 0) return '';

    const maxToShow = 15;
    const hasMore = userInteractions.length > maxToShow;

    const interactionsHTML = userInteractions.slice(0, maxToShow).map((interaction) => {
      const icon = this.getEventIcon(interaction);
      const description = this.getEventDescription(interaction);
      const time = this.formatRelativeTime(interaction.relativeTime);

      // Get additional details based on interaction type
      let detailsHTML = '';
      if (interaction.subtype === 'click') {
        const elem = interaction.data.element;
        const details = [];
        if (elem.id) details.push(`#${elem.id}`);
        if (elem.className && typeof elem.className === 'string') {
          const classes = elem.className.split(' ').filter((c) => c).slice(0, 2);
          if (classes.length > 0) details.push(`.${classes.join('.')}`);
        }
        if (details.length > 0) {
          detailsHTML = `<span class="perf-interaction-detail">${this.escapeHtml(details.join(' '))}</span>`;
        }
      } else if (interaction.subtype === 'input') {
        const elem = interaction.data.element;
        if (elem.id) {
          detailsHTML = `<span class="perf-interaction-detail">#${this.escapeHtml(elem.id)}</span>`;
        }
      }

      return `
        <div class="perf-interaction-item">
          <div class="perf-interaction-icon-wrapper">
            <span class="perf-interaction-icon">${icon}</span>
          </div>
          <div class="perf-interaction-content">
            <div class="perf-interaction-main">
              <span class="perf-interaction-desc">${description}</span>
              ${detailsHTML}
            </div>
            <span class="perf-interaction-time">${time}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="perf-interactions-section">
        <div class="perf-section-header">
          <h4 style="margin-bottom: 16px;">👆 User Context</h4>
          <span class="perf-interaction-count">${userInteractions.length} interaction${userInteractions.length === 1 ? '' : 's'}</span>
        </div>
        <div class="perf-interactions-list">
          ${interactionsHTML}
          ${hasMore ? `<div class="perf-interactions-more">+ ${userInteractions.length - maxToShow} more interaction${userInteractions.length - maxToShow === 1 ? '' : 's'}</div>` : ''}
        </div>
      </div>
    `;
  },

  /**
   * Format relative time from milliseconds
   */
  formatRelativeTime(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms % 60000 / 1000);
    return `${minutes}m ${seconds}s`;
  },

  /**
   * Generate insights and recommendations HTML
   */
  generateInsightsHTML(insights) {
    if (!insights) return '';

    if (insights.summary && insights.summary.message) {
      return `
        <div class="perf-insights-section">
          <h4>✅ No Issues Detected</h4>
          <p class="perf-all-good">${this.escapeHtml(insights.summary.message)}</p>
        </div>
      `;
    }

    if (insights.issues.length === 0 && insights.recommendations.length === 0) {
      return `
        <div class="perf-insights-section">
          <h4>✅ No Issues Detected</h4>
          <p class="perf-all-good">Performance looks good! No critical issues found.</p>
        </div>
      `;
    }

    const issuesHTML = insights.issues.map((issue) => `
      <li class="perf-issue-item ${issue.severity}">
        <span class="perf-issue-icon">${issue.severity === 'error' ? '🔴' : '⚠️'}</span>
        <span class="perf-issue-message">${this.escapeHtml(issue.message)}</span>
      </li>
    `).join('');

    const recommendationsHTML = insights.recommendations.map((rec) => `
      <li class="perf-recommendation-item">
        <span class="perf-rec-icon">💡</span>
        <span class="perf-rec-text">${this.escapeHtml(rec)}</span>
      </li>
    `).join('');

    return `
      <div class="perf-insights-section">
        ${insights.issues.length > 0 ? `
          <h4 style="margin-bottom: 16px;">🎯 Issues Detected</h4>
          <ul class="perf-issues-list">
            ${issuesHTML}
          </ul>
        ` : ''}
        
        ${insights.recommendations.length > 0 ? `
          <h4 style="margin-bottom: 16px;">💡 Recommendations</h4>
          <ul class="perf-recommendations-list">
            ${recommendationsHTML}
          </ul>
        ` : ''}
      </div>
    `;
  },


  /**
   * Generate resources HTML
   */
  generateResourcesHTML(resources) {
    if (!resources || resources.length === 0) {
      return `
        <div class="perf-resources-section">
          <h4 style="margin-bottom: 16px;">📦 Resources</h4>
          <p class="perf-all-good">✅ No slow resources detected! All resources loaded quickly.</p>
        </div>
      `;
    }

    const resourcesHTML = resources.slice(0, 10).map((resource) => {
      const durationClass = resource.duration > 3000 ? 'perf-slow' : resource.duration > 2000 ? 'perf-warning' : '';

      return `
        <div class="perf-resource-item">
          <div class="perf-resource-header">
            <span class="perf-resource-type">${resource.type}</span>
            <span class="perf-resource-duration ${durationClass}">${resource.duration}ms</span>
          </div>
          <div class="perf-resource-name">${this.truncateUrl(resource.name)}</div>
          <div class="perf-resource-details">
            ${resource.size ? `<span>${this.formatBytes(resource.size)}</span>` : ''}
            ${resource.cached ? '<span class="perf-cached">✓ cached</span>' : '<span class="perf-not-cached">not cached</span>'}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="perf-resources-section">
        <h4 style="margin-bottom: 16px;">📦 Slow Resources (${resources.length} detected)</h4>
        <p class="perf-section-description">Resources taking >1s to load or >100KB in size</p>
        <div class="perf-resources-list">
          ${resourcesHTML}
        </div>
      </div>
    `;
  },

  /**
   * Get event icon
   */
  getEventIcon(event) {
    switch (event.type) {
      case 'user-interaction':
        if (event.subtype === 'click') return '🖱️';
        if (event.subtype === 'input') return '⌨️';
        if (event.subtype === 'scroll') return '📜';
        return '👆';
      default:return '•';
    }
  },

  /**
   * Get event description
   */
  getEventDescription(event) {
    switch (event.type) {
      case 'user-interaction':
        if (event.subtype === 'click') {
          const elem = event.data.element;
          const desc = elem.textContent || elem.id || elem.tagName;
          return `Clicked "${this.escapeHtml(desc)}"`;
        }
        if (event.subtype === 'input') {
          return `Input to ${event.data.element.tagName}`;
        }
        if (event.subtype === 'scroll') {
          return `Scrolled to ${event.data.scrollY}px`;
        }
        return 'User interaction';
      default:
        return 'Event';
    }
  },

  /**
   * Show confirmation modal
   */
  showConfirmation(perfReportId) {
    this.closeModal();

    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('perf-confirmation');
    }

    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal bug-report-modal';
    modal.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    modal.innerHTML = `
      <div class="pointa-comment-modal-content bug-confirmation-content">
        <div class="bug-confirmation-icon">✓</div>
        <h3 class="bug-confirmation-title">Performance Report Created</h3>
        <p class="bug-confirmation-id">${this.formatPerfId(perfReportId)}</p>
        
        <div class="bug-confirmation-next">
          <h4>What's next?</h4>
          <ul>
            <li>Saved to local database</li>
            <li>Ready for AI analysis</li>
            <li>View in sidebar → Issue Reports tab</li>
          </ul>
        </div>
        
        <div class="bug-ai-prompt">
          <p>Tell your AI:</p>
          <div class="bug-ai-prompt-container">
            <code id="perf-ai-prompt-text">"Analyze performance report ${perfReportId}"</code>
            <button class="bug-ai-copy-btn" id="perf-ai-copy-btn" title="Copy to clipboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <button class="pointa-btn pointa-btn-primary bug-confirmation-done-btn" id="perf-confirmation-done">Done</button>
      </div>
    `;

    document.body.appendChild(modal);
    this.currentModal = modal;

    setTimeout(() => {
      const doneBtn = document.getElementById('perf-confirmation-done');
      const copyBtn = document.getElementById('perf-ai-copy-btn');
      const promptText = document.getElementById('perf-ai-prompt-text');

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
            console.error('[PerformanceReportUI] Failed to copy text:', err);
          }
        });
      }

      if (doneBtn) {
        const modalToClose = modal;

        doneBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();


          if (window.PointaModalManager) {
            window.PointaModalManager.unregisterModal('perf-confirmation');
          }

          if (modalToClose && modalToClose.parentNode) {
            if (modalToClose._escHandler) {
              document.removeEventListener('keydown', modalToClose._escHandler);
            }
            modalToClose.remove();
            this.currentModal = null;

          } else {
            this.closeModal();
          }

          // CRITICAL: Always refresh sidebar to show updated performance report count
          if (window.PointaSidebar && window.PointaSidebar.isOpen) {

            window.PointaSidebar.isRecordingBug = false;
            window.PointaSidebar.currentView = null;
            const serverOnline = await window.PointaSidebar.checkServerStatus();
            await window.PointaSidebar.updateContent(window.pointa, serverOnline);

          } else if (window.PointaSidebar && !window.PointaSidebar.isOpen) {
            // If sidebar is closed, open it to show the new performance report

            await window.PointaSidebar.open(window.pointa);
          }
        });
      }
    }, 100);

    modal.addEventListener('click', async (e) => {
      if (e.target === modal) {


        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('perf-confirmation');
        }
        this.closeModal();

        // CRITICAL: Refresh sidebar when closing via backdrop
        if (window.PointaSidebar && window.PointaSidebar.isOpen) {

          window.PointaSidebar.isRecordingBug = false;
          window.PointaSidebar.currentView = null;
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(window.pointa, serverOnline);
        } else if (window.PointaSidebar && !window.PointaSidebar.isOpen) {
          // If sidebar is closed, open it to show the new performance report
          await window.PointaSidebar.open(window.pointa);
        }
      }
    });

    const escHandler = async (e) => {
      if (e.key === 'Escape') {


        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('perf-confirmation');
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
          // If sidebar is closed, open it to show the new performance report
          await window.PointaSidebar.open(window.pointa);
        }
      }
    };
    document.addEventListener('keydown', escHandler);
    modal._escHandler = escHandler;

    setTimeout(async () => {
      if (this.currentModal === modal) {


        if (window.PointaModalManager) {
          window.PointaModalManager.unregisterModal('perf-confirmation');
        }
        this.closeModal();

        // CRITICAL: Refresh sidebar when auto-closing
        if (window.PointaSidebar && window.PointaSidebar.isOpen) {

          window.PointaSidebar.isRecordingBug = false;
          window.PointaSidebar.currentView = null;
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(window.pointa, serverOnline);
        } else if (window.PointaSidebar && !window.PointaSidebar.isOpen) {
          // If sidebar is closed, open it to show the new performance report
          await window.PointaSidebar.open(window.pointa);
        }
      }
    }, 8000);
  },

  /**
   * Setup dashboard modal listeners
   */
  setupDashboardModalListeners(modal, recordingData, isViewMode = false) {
    const closeBtn = modal.querySelector('.pointa-comment-modal-close');
    const cancelBtn = modal.querySelector('#cancel-perf-report');
    const saveBtn = modal.querySelector('#save-perf-report');
    const viewCloseBtn = modal.querySelector('#close-perf-report');

    const closeModal = async () => {
      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('performance-dashboard');
      }
      modal.remove();
      this.currentModal = null;

      // Reset sidebar state when user cancels/closes
      if (window.PointaSidebar && window.PointaSidebar.isOpen) {
        window.PointaSidebar.isRecordingBug = false;
        window.PointaSidebar.currentView = null;
        const serverOnline = await window.PointaSidebar.checkServerStatus();
        await window.PointaSidebar.updateContent(window.pointa, serverOnline);
      }
    };

    // Top-right close button always works
    closeBtn.addEventListener('click', closeModal);

    // In view mode, just show close button
    if (isViewMode) {
      if (viewCloseBtn) {
        viewCloseBtn.addEventListener('click', closeModal);
      }
    } else {
      // In create mode, show cancel and save buttons
      if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          if (window.PointaModalManager) {
            window.PointaModalManager.unregisterModal('performance-dashboard');
          }
          modal.remove();
          this.currentModal = null;

          // Save directly without the form
          await window.pointa.savePerformanceReport({
            description: '',
            whenHappens: '',
            recordingData
          });
        });
      }
    }

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
      const modalToClose = this.currentModal;
      this.currentModal = null;

      if (window.PointaModalManager) {
        window.PointaModalManager.unregisterModal('performance-dashboard');
        window.PointaModalManager.unregisterModal('perf-confirmation');
      }

      if (modalToClose._escHandler) {
        document.removeEventListener('keydown', modalToClose._escHandler);
      }

      modalToClose.remove();
    }
  },

  // Utility methods for formatting

  formatMs(ms) {
    if (!ms && ms !== 0) return 'N/A';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  },

  formatBytes(bytes) {
    if (!bytes && bytes !== 0) return 'N/A';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

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
window.PerformanceReportUI = PerformanceReportUI;
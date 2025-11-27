/**
 * Bug Replay Engine
 * Automatically replays user interactions from bug reports
 */

const BugReplayEngine = {
  isReplaying: false,
  currentBugId: null,
  replayOverlay: null,
  
  /**
   * Auto-replay a bug report's original recording
   */
  async autoReplay(bugReport) {
    if (this.isReplaying) {
      console.warn('[BugReplay] Already replaying');
      return;
    }
    
    const originalRecording = bugReport.recordings[0];
    if (!originalRecording) {
      console.error('[BugReplay] No recording found');
      return;
    }
    
    // Extract user interactions from timeline
    const interactions = originalRecording.timeline.events.filter(
      e => e.type === 'user-interaction' && (e.subtype === 'click' || e.subtype === 'input')
    );
    
    if (interactions.length === 0) {
      console.warn('[BugReplay] No interactions to replay');
      return;
    }
    
    this.isReplaying = true;
    this.currentBugId = bugReport.id;
    this.showReplayOverlay(interactions.length);
    
    try {
      // Start new recording
      await BugRecorder.startRecording();
      
      // Replay each interaction
      let completedCount = 0;
      for (const interaction of interactions) {
        await this.waitForTiming(interaction.relativeTime);
        
        const element = await this.findElement(interaction.data.element);
        if (!element) {
          throw new Error(`Element not found: ${interaction.data.element.selector || interaction.data.element.tagName}`);
        }
        
        await this.replayAction(interaction, element);
        completedCount++;
        this.updateProgress(completedCount, interactions.length);
      }
      
      // Wait a bit for final state
      await new Promise(r => setTimeout(r, 1000));
      
      // Stop and get new recording
      const newRecording = await BugRecorder.stopRecording();
      await this.appendRecording(bugReport, newRecording);
      
      this.showSuccess(bugReport.id);
      
    } catch (error) {
      console.error('[BugReplay] Failed:', error);
      await BugRecorder.stopRecording();
      this.showFallbackToManual(bugReport, error);
      
    } finally {
      this.hideReplayOverlay();
      this.isReplaying = false;
      this.currentBugId = null;
    }
  },
  
  /**
   * Find element using multiple strategies
   */
  async findElement(elementData, retries = 3) {
    const strategies = [
      // Strategy 1: ID
      () => elementData.id ? document.getElementById(elementData.id) : null,
      
      // Strategy 2: CSS Selector
      () => elementData.selector ? document.querySelector(elementData.selector) : null,
      
      // Strategy 3: Text content
      () => this.findByTextContent(elementData.textContent, elementData.tagName),
      
      // Strategy 4: XPath
      () => elementData.xpath ? this.getElementByXPath(elementData.xpath) : null
    ];
    
    for (let attempt = 0; attempt < retries; attempt++) {
      for (const strategy of strategies) {
        try {
          const element = strategy();
          if (element && element.isConnected) {
            return element;
          }
        } catch (e) {
          // Try next strategy
          continue;
        }
      }
      // Wait and retry
      await new Promise(r => setTimeout(r, 500));
    }
    
    return null;
  },
  
  /**
   * Replay a single action
   */
  async replayAction(interaction, element) {
    // Scroll element into view
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 200));
    
    // Highlight element
    this.highlightElement(element);
    
    switch (interaction.subtype) {
      case 'click':
        element.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        element.click(); // Fallback for some elements
        break;
        
      case 'input':
        element.focus();
        element.value = interaction.data.value || '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        break;
    }
    
    await new Promise(r => setTimeout(r, 300));
  },
  
  /**
   * Append new recording to bug report
   */
  async appendRecording(bugReport, newRecording) {
    const iteration = bugReport.recordings.length + 1;
    
    // Take screenshot
    const screenshotDataUrl = await this.captureScreenshot();
    const screenshotMetadata = screenshotDataUrl ? {
      id: `bug-replay-${bugReport.id}-${iteration}`,
      captured: true,
      timestamp: new Date().toISOString()
    } : { captured: false };
    
    bugReport.recordings.push({
      iteration,
      timestamp: new Date().toISOString(),
      timeline: newRecording.timeline,
      screenshot: screenshotMetadata,
      replayed: true,
      metadata: {
        startTime: newRecording.metadata.startTime,
        endTime: newRecording.endTime,
        duration: newRecording.duration
      }
    });
    
    bugReport.updated = new Date().toISOString();
    bugReport.status = 'active'; // Back to active for AI to review
    
    // Save via background
    await chrome.runtime.sendMessage({
      action: 'updateBugReport',
      bugReport: bugReport,
      screenshotDataUrl: screenshotDataUrl
    });
  },
  
  /**
   * Capture screenshot
   */
  async captureScreenshot() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext('2d');
      
      // This is a simplified version - in practice you'd use chrome.tabs.captureVisibleTab
      // For now, return null and let it be handled
      return null;
    } catch (error) {
      console.error('[BugReplay] Screenshot failed:', error);
      return null;
    }
  },
  
  /**
   * Show replay overlay
   */
  showReplayOverlay(totalSteps) {
    this.replayOverlay = document.createElement('div');
    this.replayOverlay.className = 'bug-replay-overlay';
    this.replayOverlay.innerHTML = `
      <div class="bug-replay-content">
        <h2>🎬 Auto-Replaying Bug</h2>
        <p>Automatically reproducing your original actions...</p>
        <div class="bug-replay-progress-bar">
          <div class="bug-replay-progress-fill" style="width: 0%"></div>
        </div>
        <p class="bug-replay-status">Step <span id="current-step">0</span> of <span id="total-steps">${totalSteps}</span></p>
      </div>
    `;
    document.body.appendChild(this.replayOverlay);
  },
  
  /**
   * Update progress
   */
  updateProgress(current, total) {
    if (!this.replayOverlay) return;
    
    const percentage = (current / total) * 100;
    const fillEl = this.replayOverlay.querySelector('.bug-replay-progress-fill');
    const currentEl = this.replayOverlay.querySelector('#current-step');
    
    if (fillEl) fillEl.style.width = `${percentage}%`;
    if (currentEl) currentEl.textContent = current;
  },
  
  /**
   * Hide replay overlay
   */
  hideReplayOverlay() {
    if (this.replayOverlay) {
      this.replayOverlay.remove();
      this.replayOverlay = null;
    }
  },
  
  /**
   * Show success message
   */
  showSuccess(bugId) {
    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal bug-replay-success-modal';
    const promptText = `Check new bug report with console logs for ${bugId}`;
    modal.innerHTML = `
      <div class="pointa-comment-modal-content">
        <h3>✅ Auto-Replay Complete!</h3>
        <p>New recording captured with updated logs.</p>
        <p><strong>Next step:</strong> Copy prompt and paste into your AI coding tool.</p>
        <div class="bug-id-copy-container">
          <input type="text" readonly value="${promptText}" id="bug-id-copy-input" />
          <button class="pointa-btn pointa-btn-primary" id="copy-bug-id-btn">📋 Copy Prompt</button>
        </div>
        <button class="pointa-btn pointa-btn-secondary" id="close-success-btn">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#copy-bug-id-btn').addEventListener('click', () => {
      const input = modal.querySelector('#bug-id-copy-input');
      input.select();
      document.execCommand('copy');
      modal.querySelector('#copy-bug-id-btn').textContent = '✅ Copied!';
    });
    
    modal.querySelector('#close-success-btn').addEventListener('click', () => {
      modal.remove();
      // Refresh sidebar
      if (window.PointaSidebar && window.PointaSidebar.isOpen) {
        window.PointaSidebar.checkServerStatus().then(serverOnline => {
          window.PointaSidebar.updateContent(window.pointa, serverOnline);
        });
      }
    });
  },
  
  /**
   * Show fallback to manual recording
   */
  showFallbackToManual(bugReport, error) {
    const modal = document.createElement('div');
    modal.className = 'pointa-comment-modal bug-replay-failed-modal';
    
    const originalSteps = this.extractSteps(bugReport.recordings[0]);
    
    modal.innerHTML = `
      <div class="pointa-comment-modal-content">
        <h3>⚠️ Auto-Replay Failed</h3>
        <p>${error.message}</p>
        <p>Some elements may have changed. Please record manually following these steps:</p>
        
        <div class="manual-recording-guide">
          <h4>Original Steps:</h4>
          <ol>
            ${originalSteps.map(step => `<li>${step}</li>`).join('')}
          </ol>
        </div>
        
        <button class="pointa-btn pointa-btn-primary" id="manual-record-btn">
          📹 Record Manually (Iteration ${bugReport.recordings.length + 1})
        </button>
        <button class="pointa-btn pointa-btn-secondary" id="cancel-replay-btn">Cancel</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#manual-record-btn').addEventListener('click', () => {
      modal.remove();
      this.startManualRecording(bugReport);
    });
    
    modal.querySelector('#cancel-replay-btn').addEventListener('click', () => {
      modal.remove();
    });
  },
  
  /**
   * Extract steps from recording for display
   */
  extractSteps(recording) {
    return recording.timeline.events
      .filter(e => e.type === 'user-interaction')
      .map((e, i) => {
        const elem = e.data.element;
        const action = e.subtype === 'click' ? 'Click' : e.subtype === 'input' ? 'Type in' : e.subtype;
        const target = elem.textContent || elem.id || `${elem.tagName}${elem.className ? '.' + elem.className : ''}`;
        return `${action} "${target}"`;
      });
  },
  
  /**
   * Start manual recording for bug
   */
  async startManualRecording(bugReport) {
    // TODO: Implement manual re-recording with context
    alert('Manual re-recording: Start recording, perform actions, then stop recording.');
    await BugRecorder.startRecording();
  },
  
  /**
   * Highlight element during replay
   */
  highlightElement(element) {
    const originalOutline = element.style.outline;
    const originalBoxShadow = element.style.boxShadow;
    
    element.style.outline = '3px solid #4CAF50';
    element.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.boxShadow = originalBoxShadow;
    }, 500);
  },
  
  /**
   * Find element by text content
   */
  findByTextContent(text, tagName) {
    if (!text) return null;
    
    const elements = tagName ? 
      document.getElementsByTagName(tagName) : 
      document.querySelectorAll('*');
    
    for (const el of elements) {
      if (el.textContent && el.textContent.includes(text)) {
        return el;
      }
    }
    return null;
  },
  
  /**
   * Get element by XPath
   */
  getElementByXPath(xpath) {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  },
  
  /**
   * Wait for timing to match original recording
   */
  async waitForTiming(relativeTime) {
    // Simple implementation - could be smarter
    await new Promise(r => setTimeout(r, 500));
  }
};

// Export for use in other modules
window.BugReplayEngine = BugReplayEngine;


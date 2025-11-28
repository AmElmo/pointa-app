/**
 * onboarding-overlay.js
 * 
 * Manages the first-time onboarding experience for Pointa.
 * Shows a full-screen overlay with multi-step wizard for setup.
 */

const VibeOnboarding = {
  overlay: null,
  currentStep: 0,
  serverDetected: false,
  selectedAgent: null, // 'cursor', 'claude', 'windsurf', 'vscode', or 'other'
  escHandler: null, // Escape key handler
  
  /**
   * Show the onboarding overlay
   */
  async show() {
    if (this.overlay) return; // Already showing
    
    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('onboarding');
    }
    
    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.id = 'pointa-onboarding-overlay';
    this.overlay.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
    
    // Build initial content (step 0: welcome)
    this.overlay.innerHTML = this.buildStepHTML(0);
    
    // Inject into page
    document.body.appendChild(this.overlay);
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Fade in
    requestAnimationFrame(() => {
      this.overlay.classList.add('visible');
    });
  },
  
  /**
   * Hide and remove the onboarding overlay
   */
  hide() {
    if (!this.overlay) return;
    
    // Unregister modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.unregisterModal('onboarding');
    }
    
    // Remove escape key handler
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    
    // Fade out
    this.overlay.classList.remove('visible');
    
    // Remove after animation
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.overlay = null;
      this.currentStep = 0;
      this.selectedAgent = null;
    }, 300);
  },
  
  /**
   * Go to specific step
   */
  goToStep(step) {
    this.currentStep = step;
    const content = this.overlay.querySelector('.onboarding-content');
    if (content) {
      // Fade out
      content.style.opacity = '0';
      
      // Change content and fade in
      setTimeout(() => {
        this.overlay.innerHTML = this.buildStepHTML(step);
        this.setupEventListeners();
        
        const newContent = this.overlay.querySelector('.onboarding-content');
        if (newContent) {
          requestAnimationFrame(() => {
            newContent.style.opacity = '1';
          });
        }
        
        // If on step 1, check server status
        if (step === 1) {
          this.checkServerStatus();
        }
      }, 200);
    }
  },
  
  /**
   * Check if server is running
   * Uses background script to bypass Private Network Access restrictions
   */
  async checkServerStatus() {
    const statusEl = this.overlay.querySelector('#server-status');
    const testButton = this.overlay.querySelector('#test-connection-btn');
    const nextButton = this.overlay.querySelector('.next-btn');
    
    if (!statusEl) return;
    
    // Show loading state
    statusEl.innerHTML = `
      <div class="status-checking">
        <div class="spinner"></div>
        <span>Checking connection...</span>
      </div>
    `;
    
    if (testButton) testButton.disabled = true;
    if (nextButton) nextButton.disabled = true;
    
    try {
      // Use background script for health check to bypass Private Network Access restrictions
      // This allows the check to work on any page, not just localhost
      const response = await chrome.runtime.sendMessage({
        action: 'checkOnboardingServerHealth'
      });
      
      if (response && response.success && response.serverOnline) {
        this.serverDetected = true;
        statusEl.innerHTML = `
          <div class="status-success">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/>
              <path d="M6 10l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Server is running! ✓</span>
          </div>
        `;
        if (nextButton) {
          nextButton.disabled = false;
          nextButton.textContent = 'Continue to MCP Setup';
        }
      } else {
        throw new Error('Server not responding');
      }
    } catch (error) {
      this.serverDetected = false;
      statusEl.innerHTML = `
        <div class="status-error">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/>
            <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span>Server not detected. Please follow the installation steps above.</span>
        </div>
      `;
      if (nextButton) {
        nextButton.disabled = false;
        nextButton.textContent = 'Continue Anyway';
      }
    }
    
    if (testButton) testButton.disabled = false;
  },
  
  /**
   * Select AI agent
   */
  selectAgent(agent) {
    this.selectedAgent = agent;
    
    // Update UI - remove active from all tabs
    const agentTabs = this.overlay.querySelectorAll('.agent-tab');
    agentTabs.forEach(tab => tab.classList.remove('active'));
    
    // Add active to selected tab
    const selectedTab = this.overlay.querySelector(`.agent-tab[data-agent="${agent}"]`);
    if (selectedTab) {
      selectedTab.classList.add('active');
    }
    
    // Show instructions for selected agent
    const instructionsContainer = this.overlay.querySelector('#agent-instructions');
    if (instructionsContainer) {
      instructionsContainer.innerHTML = this.getAgentInstructions(agent);
    }
    
    // Enable next button
    const nextButton = this.overlay.querySelector('.next-btn');
    if (nextButton) {
      nextButton.disabled = false;
    }
  },
  
  /**
   * Get instructions for specific AI agent
   */
  getAgentInstructions(agent) {
    const instructions = {
      cursor: `
        <div class="agent-instructions">
          <ol>
            <li><strong>Cursor → Settings → Tools & Integrations</strong></li>
            <li>Click <strong>+ Add new global MCP server</strong></li>
            <li>Paste this configuration:</li>
          </ol>
          <div class="code-block">
            <button class="copy-btn" data-copy='{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}'>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3 11V3c0-.6.4-1 1-1h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Copy
            </button>
            <pre>{
  "mcpServers": {
    "pointa": {
      "command": "npx",
      "args": ["-y", "pointa-server"]
    }
  }
}</pre>
          </div>
          <ol start="4">
            <li>Save and restart Cursor</li>
          </ol>
          <p class="note"><strong>✨ No manual server start needed!</strong> npx automatically handles installation and startup.</p>
        </div>
      `,
      claude: `
        <div class="agent-instructions">
          <p>Add to your Claude configuration file:</p>
          <div class="code-block">
            <button class="copy-btn" data-copy='{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}'>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3 11V3c0-.6.4-1 1-1h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Copy
            </button>
            <pre>{
  "mcpServers": {
    "pointa": {
      "command": "npx",
      "args": ["-y", "pointa-server"]
    }
  }
}</pre>
          </div>
          <p class="note">Or use CLI: <code>claude mcp add pointa npx -- -y pointa-server</code></p>
          <p class="note"><strong>✨ No manual server start needed!</strong> npx automatically handles installation and startup.</p>
        </div>
      `,
      windsurf: `
        <div class="agent-instructions">
          <ol>
            <li><strong>Windsurf → Settings → Advanced Settings → Cascade</strong></li>
            <li>Add this configuration:</li>
          </ol>
          <div class="code-block">
            <button class="copy-btn" data-copy='{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}'>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3 11V3c0-.6.4-1 1-1h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Copy
            </button>
            <pre>{
  "mcpServers": {
    "pointa": {
      "command": "npx",
      "args": ["-y", "pointa-server"]
    }
  }
}</pre>
          </div>
          <ol start="3">
            <li>Save and restart Windsurf</li>
          </ol>
          <p class="note"><strong>✨ No manual server start needed!</strong> npx automatically handles installation and startup.</p>
        </div>
      `,
      vscode: `
        <div class="agent-instructions">
          <ol>
            <li>Install an MCP-compatible AI extension (Copilot, Continue, etc.)</li>
            <li>Go to extension settings, search for "MCP"</li>
            <li>Add this configuration:</li>
          </ol>
          <div class="code-block">
            <button class="copy-btn" data-copy='{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}'>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3 11V3c0-.6.4-1 1-1h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Copy
            </button>
            <pre>{
  "mcpServers": {
    "pointa": {
      "command": "npx",
      "args": ["-y", "pointa-server"]
    }
  }
}</pre>
          </div>
          <p class="note"><strong>✨ No manual server start needed!</strong> npx automatically handles installation and startup.</p>
        </div>
      `,
      other: `
        <div class="agent-instructions">
          <p>If your AI tool supports MCP with command execution (recommended):</p>
          <div class="code-block">
            <button class="copy-btn" data-copy='{"mcpServers":{"pointa":{"command":"npx","args":["-y","pointa-server"]}}}'>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3 11V3c0-.6.4-1 1-1h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Copy
            </button>
            <pre>{
  "mcpServers": {
    "pointa": {
      "command": "npx",
      "args": ["-y", "pointa-server"]
    }
  }
}</pre>
          </div>
          <p class="note"><strong>✨ Automatic installation & startup!</strong></p>
          
          <p style="margin-top: 20px;">If your tool only supports HTTP endpoints, first run <code>pointa-server start</code>, then use:</p>
          <div class="code-block">
            <button class="copy-btn" data-copy="http://127.0.0.1:4242/mcp">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3 11V3c0-.6.4-1 1-1h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Copy
            </button>
            <pre>http://127.0.0.1:4242/mcp</pre>
          </div>
          <p class="note">HTTP endpoint (requires manual server start)</p>
        </div>
      `
    };
    
    return instructions[agent] || '';
  },
  
  /**
   * Complete onboarding
   */
  async complete() {
    // Mark as completed in storage
    await chrome.storage.local.set({ onboardingCompleted: true });
    
    // Hide overlay
    this.hide();
    
    // Open sidebar to start using
    // Wait for overlay to fade out, then open sidebar
    setTimeout(() => {
      if (window.pointa && typeof PointaSidebar !== 'undefined') {
        PointaSidebar.open(window.pointa);
      } else {
        console.error('[Onboarding] Failed to open sidebar - Pointa or PointaSidebar not found', {
          pointa: !!window.pointa,
          sidebar: typeof PointaSidebar !== 'undefined'
        });
      }
    }, 400);
  },
  
  /**
   * Build HTML for specific step
   */
  buildStepHTML(step) {
    const steps = [
      this.buildWelcomeStep(),
      this.buildServerStep(),
      this.buildMCPStep(),
      this.buildFeaturesStep(),
      this.buildCompleteStep()
    ];
    
    return steps[step] || steps[0];
  },
  
  /**
   * Step 0: Welcome
   */
  buildWelcomeStep() {
    return `
      <div class="onboarding-content">
        <div class="onboarding-card">
          <div class="onboarding-header">
            <div class="logo">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="20" fill="currentColor" opacity="0.1"/>
                <path d="M24 12v24M12 24h24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </div>
            <h1>Welcome to Pointa</h1>
            <p class="subtitle">AI-powered annotations for faster development</p>
          </div>
          
          <div class="onboarding-body">
            <div class="feature-grid">
              <div class="feature-item">
                <div class="feature-icon">📝</div>
                <h3>Annotate</h3>
                <p>Leave visual feedback on elements</p>
              </div>
              <div class="feature-item">
                <div class="feature-icon">🎨</div>
                <h3>Design</h3>
                <p>Make real-time design changes</p>
              </div>
              <div class="feature-item">
                <div class="feature-icon">🤖</div>
                <h3>AI Fixes</h3>
                <p>AI implements changes automatically</p>
              </div>
              <div class="feature-item">
                <div class="feature-icon">✨</div>
                <h3>Inspiration</h3>
                <p>Save design elements as references</p>
              </div>
            </div>
            
            <div class="setup-info">
              <p>Quick setup requires:</p>
              <ul>
                <li><strong>Local Server</strong> - Annotation storage & AI communication</li>
                <li><strong>MCP Integration</strong> - Connects to your AI coding tool</li>
              </ul>
            </div>
          </div>
          
          <div class="onboarding-footer">
            <button class="btn-text skip-btn">Skip Setup</button>
            <button class="btn-primary next-btn">Get Started</button>
          </div>
          
          <div class="step-indicator">
            <div class="step active"></div>
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
          </div>
        </div>
      </div>
    `;
  },
  
  /**
   * Step 1: Server Installation
   */
  buildServerStep() {
    return `
      <div class="onboarding-content">
        <div class="onboarding-card">
          <div class="onboarding-header">
            <h2>Server Setup (Optional)</h2>
            <p class="subtitle">The server will auto-install via npx when you configure your AI tool</p>
          </div>
          
          <div class="onboarding-body compact">
            <div class="privacy-badge">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L3 5v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V5l-7-3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
                <path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span><strong>100% local.</strong> All data stays on your machine. No telemetry, no cloud, no third parties.</span>
            </div>
            
            <div class="installation-steps">
              <div class="install-step">
                <div class="step-number">✨</div>
                <div class="step-content">
                  <h4>Recommended: Use npx (automatic)</h4>
                  <p>When you configure your AI tool in the next step, the npx command automatically handles installation and startup. <strong>Skip manual installation!</strong></p>
                </div>
              </div>
              
              <div class="install-step">
                <div class="step-number">⚙️</div>
                <div class="step-content">
                  <h4>Optional: Manual installation (advanced)</h4>
                  <p>Only needed if you want to manage the server yourself or your AI tool doesn't support npx.</p>
                  <div class="code-block">
                    <button class="copy-btn" data-copy="npm install -g pointa-server && pointa-server start">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M3 11V3c0-.6.4-1 1-1h8" stroke="currentColor" stroke-width="1.5"/>
                      </svg>
                      Copy
                    </button>
                    <pre>npm install -g pointa-server
pointa-server start</pre>
                  </div>
                </div>
              </div>
              
              <div class="install-step">
                <div class="step-number">✓</div>
                <div class="step-content">
                  <h4>Test connection (optional)</h4>
                  <div id="server-status" class="server-status">
                    <div class="status-idle">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/>
                        <path d="M10 6v4l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      <span>Ready to test connection</span>
                    </div>
                  </div>
                  <button id="test-connection-btn" class="btn-secondary">Test Connection</button>
                </div>
              </div>
            </div>
          </div>
          
          <div class="onboarding-footer">
            <button class="btn-text back-btn">Back</button>
            <button class="btn-primary next-btn">Continue to MCP Setup</button>
          </div>
          
          <div class="step-indicator">
            <div class="step completed"></div>
            <div class="step active"></div>
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
          </div>
        </div>
      </div>
    `;
  },
  
  /**
   * Step 2: MCP Setup
   */
  buildMCPStep() {
    return `
      <div class="onboarding-content">
        <div class="onboarding-card large">
          <div class="onboarding-header">
            <h2>Connect Your AI Coding Tool</h2>
            <p class="subtitle">Select your tool to see setup instructions</p>
          </div>
          
          <div class="onboarding-body compact">
            <div class="agent-tabs">
              <button class="agent-tab" data-agent="cursor">Cursor</button>
              <button class="agent-tab" data-agent="claude">Claude Code</button>
              <button class="agent-tab" data-agent="windsurf">Windsurf</button>
              <button class="agent-tab" data-agent="vscode">VS Code</button>
              <button class="agent-tab" data-agent="other">Other</button>
            </div>
            
            <div id="agent-instructions" class="agent-instructions-container">
              <p class="placeholder">Select your AI coding tool above</p>
            </div>
          </div>
          
          <div class="onboarding-footer">
            <button class="btn-text back-btn">Back</button>
            <button class="btn-primary next-btn" disabled>Continue</button>
          </div>
          
          <div class="step-indicator">
            <div class="step completed"></div>
            <div class="step completed"></div>
            <div class="step active"></div>
            <div class="step"></div>
            <div class="step"></div>
          </div>
        </div>
      </div>
    `;
  },
  
  /**
   * Step 3: Features Overview
   */
  buildFeaturesStep() {
    return `
      <div class="onboarding-content">
        <div class="onboarding-card">
          <div class="onboarding-header">
            <h2>Key Features</h2>
            <p class="subtitle">Powerful modes for your development workflow</p>
          </div>
          
          <div class="onboarding-body compact">
            <div class="features-list-compact">
              <div class="feature-detail-compact">
                <div class="feature-icon-large">📝</div>
                <div class="feature-content">
                  <h3>Annotate</h3>
                  <p>Click elements to add feedback, bugs, or requests. AI processes them in bulk.</p>
                </div>
              </div>
              
              <div class="feature-detail-compact">
                <div class="feature-icon-large">🎨</div>
                <div class="feature-content">
                  <h3>Design Mode</h3>
                  <p>Make real-time visual changes, AI translates them to code.</p>
                </div>
              </div>
              
              <div class="feature-detail-compact">
                <div class="feature-icon-large">🤖</div>
                <div class="feature-content">
                  <h3>Ask AI</h3>
                  <p>Say "Implement my Pointa annotations" and AI does the work.</p>
                </div>
              </div>
              
              <div class="feature-detail-compact">
                <div class="feature-icon-large">✨</div>
                <div class="feature-content">
                  <h3>Inspiration</h3>
                  <p>Capture design elements from any site as references.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="onboarding-footer">
            <button class="btn-text back-btn">Back</button>
            <button class="btn-primary next-btn">Almost Done!</button>
          </div>
          
          <div class="step-indicator">
            <div class="step completed"></div>
            <div class="step completed"></div>
            <div class="step completed"></div>
            <div class="step active"></div>
            <div class="step"></div>
          </div>
        </div>
      </div>
    `;
  },
  
  /**
   * Step 4: Complete
   */
  buildCompleteStep() {
    return `
      <div class="onboarding-content">
        <div class="onboarding-card">
          <div class="onboarding-header">
            <div class="success-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3" opacity="0.1"/>
                <path d="M14 24l8 8 12-14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h1>You're All Set!</h1>
            <p class="subtitle">Here's your workflow</p>
          </div>
          
          <div class="onboarding-body compact">
            <div class="workflow-steps">
              <div class="workflow-step">
                <div class="workflow-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M20 12c0 4.418-3.582 8-8 8-1.293 0-2.514-.278-3.595-.773L4 20l.773-4.405A7.959 7.959 0 014 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="workflow-content">
                  <h4>1. Annotate</h4>
                  <p>Leave feedback on localhost elements</p>
                </div>
              </div>
              
              <div class="workflow-arrow">→</div>
              
              <div class="workflow-step">
                <div class="workflow-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 11l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </div>
                <div class="workflow-content">
                  <h4>2. Select</h4>
                  <p>Choose what annotations to address</p>
                </div>
              </div>
              
              <div class="workflow-arrow">→</div>
              
              <div class="workflow-step">
                <div class="workflow-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
                    <path d="M12 8v4l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="workflow-content">
                  <h4>3. Ask AI</h4>
                  <p>Say "fix my Pointa annotations"</p>
                </div>
              </div>
              
              <div class="workflow-arrow">→</div>
              
              <div class="workflow-step">
                <div class="workflow-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2l3 7h7l-6 5 2 7-6-4-6 4 2-7-6-5h7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="workflow-content">
                  <h4>4. AI Works</h4>
                  <p>Implements changes automatically</p>
                </div>
              </div>
              
              <div class="workflow-arrow">→</div>
              
              <div class="workflow-step">
                <div class="workflow-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 11l3 3 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="workflow-content">
                  <h4>5. Review</h4>
                  <p>Check work in review panel</p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="onboarding-footer">
            <button class="btn-primary finish-btn">Start Using Pointa</button>
          </div>
          
          <div class="step-indicator">
            <div class="step completed"></div>
            <div class="step completed"></div>
            <div class="step completed"></div>
            <div class="step completed"></div>
            <div class="step completed"></div>
          </div>
        </div>
      </div>
    `;
  },
  
  /**
   * Set up event listeners for current step
   */
  setupEventListeners() {
    if (!this.overlay) return;
    
    // Escape key handler
    if (!this.escHandler) {
      this.escHandler = (e) => {
        if (e.key === 'Escape') {
          this.complete();
        }
      };
      document.addEventListener('keydown', this.escHandler);
    }
    
    // Next button
    const nextBtn = this.overlay.querySelector('.next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.goToStep(this.currentStep + 1);
      });
    }
    
    // Back button
    const backBtn = this.overlay.querySelector('.back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.goToStep(this.currentStep - 1);
      });
    }
    
    // Skip button
    const skipBtn = this.overlay.querySelector('.skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({ onboardingCompleted: true });
        this.hide();
      });
    }
    
    // Finish button
    const finishBtn = this.overlay.querySelector('.finish-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', () => {
        this.complete();
      });
    }
    
    // Test connection button
    const testBtn = this.overlay.querySelector('#test-connection-btn');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        this.checkServerStatus();
      });
    }
    
    // Agent selection tabs
    const agentTabs = this.overlay.querySelectorAll('.agent-tab');
    agentTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const agent = tab.getAttribute('data-agent');
        this.selectAgent(agent);
      });
    });
    
    // Copy buttons
    const copyBtns = this.overlay.querySelectorAll('.copy-btn');
    copyBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const textToCopy = btn.getAttribute('data-copy');
        if (textToCopy) {
          try {
            await navigator.clipboard.writeText(textToCopy);
            const originalText = btn.innerHTML;
            btn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Copied!
            `;
            setTimeout(() => {
              btn.innerHTML = originalText;
            }, 2000);
          } catch (error) {
            console.error('Failed to copy:', error);
          }
        }
      });
    });
  }
};

// Expose globally for access from other modules
window.VibeOnboarding = VibeOnboarding;


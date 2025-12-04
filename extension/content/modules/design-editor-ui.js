/**
 * design-editor-ui.js
 * 
 * Handles the design editor panel UI, input controls, and real-time style preview.
 * Includes scope selection, property editors, dropdown controls, and submission logic.
 * 
 * Extracted from content.js as part of Step 10 (final refactoring step).
 */

const VibeDesignEditorUI = {
  /**
   * Show the design editor panel for an element
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} element - Element to edit
   * @param {string|null} restoreScope - Optional scope to restore (when editing existing annotation)
   */
  showDesignEditor(pointa, element, restoreScope = null) {
    // Close existing editor if any
    pointa.closeDesignEditor();

    // Register modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.registerModal('design-editor');
    }

    // Clear annotation marker so the element can be edited again
    element.removeAttribute('data-annotation-applied');

    // Store the element we're editing
    pointa.currentEditingElement = element;

    // Calculate scope options (similar elements, component info)
    const scopeInfo = this.calculateScopeOptions(pointa, element);
    pointa.componentInfo = scopeInfo;

    // Set scope: restore from annotation if editing, otherwise default to 'instance'
    pointa.designEditScope = restoreScope || 'instance';

    // Store affected elements based on initial scope
    if (pointa.designEditScope === 'instance') {
      pointa.affectedElements = [element];
    } else if (pointa.designEditScope === 'page' && scopeInfo.siblingInfo) {
      pointa.affectedElements = scopeInfo.siblingInfo.elements;
    } else if (pointa.designEditScope === 'app') {
      pointa.affectedElements = scopeInfo.similarElements;
    } else {
      // Fallback if scope doesn't match available options
      pointa.affectedElements = [element];
    }

    // Highlight all affected elements
    this.highlightAffectedElements(pointa);

    // Get computed styles
    const computedStyles = window.getComputedStyle(element);

    // Store original styles for reverting (for all affected elements)
    pointa.affectedElements.forEach((el) => {
      const elStyles = window.getComputedStyle(el);
      if (!pointa.originalStyles.has(el)) {
        pointa.originalStyles.set(el, {
          fontSize: elStyles.fontSize,
          fontFamily: elStyles.fontFamily,
          fontWeight: elStyles.fontWeight,
          fontStyle: elStyles.fontStyle,
          lineHeight: elStyles.lineHeight,
          letterSpacing: elStyles.letterSpacing,
          textDecoration: elStyles.textDecoration,
          color: elStyles.color,
          textAlign: elStyles.textAlign,
          paddingTop: elStyles.paddingTop,
          paddingRight: elStyles.paddingRight,
          paddingBottom: elStyles.paddingBottom,
          paddingLeft: elStyles.paddingLeft,
          marginTop: elStyles.marginTop,
          marginRight: elStyles.marginRight,
          marginBottom: elStyles.marginBottom,
          marginLeft: elStyles.marginLeft,
          gap: elStyles.gap,
          backgroundColor: elStyles.backgroundColor,
          backgroundImage: elStyles.backgroundImage,
          opacity: elStyles.opacity,
          borderRadius: elStyles.borderRadius,
          borderStyle: elStyles.borderStyle,
          borderWidth: elStyles.borderWidth,
          borderColor: elStyles.borderColor,
          boxShadow: elStyles.boxShadow,
          textContent: el.textContent
        });
      }
    });

    // Initialize pending changes
    pointa.pendingCSSChanges = {};

    // Create editor panel
    const editor = document.createElement('div');
    editor.className = 'pointa-design-editor';
    editor.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    // Initial positioning (will be adjusted after appending to DOM)
    const rect = element.getBoundingClientRect();
    const editorWidth = 320;
    const gap = 16;

    let left = rect.right + gap;
    if (left + editorWidth > window.innerWidth - gap) {
      left = rect.left - editorWidth - gap;
    }
    if (left < gap) {
      left = gap;
    }

    // Start at element's top, will adjust after measuring actual height
    let top = rect.top;

    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;

    // Build scope selector options - show if component or siblings detected
    let scopeSelectorHTML = '';

    if (scopeInfo.hasComponentFile || scopeInfo.siblingInfo) {
      const scopeOptions = [
      {
        value: 'instance',
        label: 'This instance only',
        active: pointa.designEditScope === 'instance'
      }];


      // Add "page" scope if siblings detected
      if (scopeInfo.siblingInfo) {
        const containerLabel = scopeInfo.siblingInfo.containerName || scopeInfo.siblingInfo.parentTag;
        const label = scopeInfo.siblingInfo.isAllOnPage ?
        `All ${scopeInfo.siblingInfo.count} in ${containerLabel}` :
        `${scopeInfo.siblingInfo.count} in this ${containerLabel}`;

        scopeOptions.push({
          value: 'page',
          label: label,
          active: pointa.designEditScope === 'page'
        });
      }

      // Add "app" scope if component file detected (only if different from page scope)
      if (scopeInfo.hasComponentFile) {
        // Only show app scope if it's different from page scope
        const showAppScope = !scopeInfo.siblingInfo?.isAllOnPage || scopeInfo.hasComponentFile;

        if (showAppScope) {
          scopeOptions.push({
            value: 'app',
            label: `Component (${scopeInfo.componentName}) - ${scopeInfo.similarCount} total`,
            active: pointa.designEditScope === 'app'
          });
        }
      }

      const scopeOptionsHTML = scopeOptions.map((opt) => `
        <button class="pointa-scope-option ${opt.active ? 'active' : ''}" data-scope="${opt.value}">
          <span class="pointa-scope-radio">${opt.active ? '●' : '○'}</span>
          <span class="pointa-scope-label">${opt.label}</span>
        </button>
      `).join('');

      scopeSelectorHTML = `
        <div class="pointa-design-scope-section">
          <label class="pointa-design-scope-label">Apply changes to:</label>
          <div class="pointa-scope-options">
            ${scopeOptionsHTML}
          </div>
        </div>
      `;
    }

    // Build the UI
    editor.innerHTML = `
      <div class="pointa-design-editor-header">
        <h3 class="pointa-design-editor-title">Annotation</h3>
        <button class="pointa-design-editor-close" aria-label="Close">✕</button>
      </div>
      
      <!-- TOP-LEVEL TAB BAR: Comment/Design switching -->
      <div class="pointa-widget-tab-bar">
        <button class="pointa-widget-tab" data-mode-tab="comment">💬 Comment</button>
        <button class="pointa-widget-tab active" data-mode-tab="design">🎨 Design</button>
      </div>
      
      <!-- SCOPE SELECTOR (only shown if component detected) -->
      ${scopeSelectorHTML}
      
      <!-- TAB NAVIGATION -->
      <div class="pointa-design-tabs">
        <button class="pointa-design-tab active" data-tab="text">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7h16M10 3v18M14 3v18"/>
          </svg>
          Text
        </button>
        <button class="pointa-design-tab" data-tab="style">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
          </svg>
          Style
        </button>
        <button class="pointa-design-tab" data-tab="border">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
          Border
        </button>
        <button class="pointa-design-tab" data-tab="layout">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          Layout
        </button>
      </div>
      
      <div class="pointa-design-editor-body">
        <!-- TEXT TAB -->
        <div class="pointa-design-tab-panel active" data-tab-panel="text">
          <!-- TYPOGRAPHY -->
          <div class="pointa-design-section">
            <h4 class="pointa-design-section-title">Typography</h4>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Text Content</label>
            <textarea class="pointa-design-textarea" data-property="textContent">${PointaUtils.escapeHtml(element.textContent)}</textarea>
          </div>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Font Family</label>
            <div class="pointa-custom-select-wrapper" data-property="fontFamily" data-options='[
              {"value":"inherit","label":"Default"},
              {"value":"-apple-system, BlinkMacSystemFont, &apos;Segoe UI&apos;, Roboto, sans-serif","label":"System"},
              {"value":"&apos;Inter&apos;, sans-serif","label":"Inter"},
              {"value":"&apos;Helvetica Neue&apos;, Helvetica, Arial, sans-serif","label":"Helvetica"},
              {"value":"Georgia, serif","label":"Georgia"},
              {"value":"&apos;Courier New&apos;, monospace","label":"Courier"},
              {"value":"&apos;SF Mono&apos;, Monaco, monospace","label":"Monospace"}
            ]'>
              <div class="pointa-custom-select-trigger">
                <span class="pointa-custom-select-value">Default</span>
                <svg class="pointa-custom-select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>
          </div>
          
          <div class="pointa-design-row">
            <div class="pointa-design-control">
              <label class="pointa-design-control-label">Weight</label>
              <div class="pointa-custom-select-wrapper" data-property="fontWeight" data-options='[
                {"value":"300","label":"Light"},
                {"value":"400","label":"Regular"},
                {"value":"500","label":"Medium"},
                {"value":"600","label":"Semibold"},
                {"value":"700","label":"Bold"},
                {"value":"800","label":"Extra Bold"}
              ]'>
                <div class="pointa-custom-select-trigger">
                  <span class="pointa-custom-select-value">${computedStyles.fontWeight === '300' ? 'Light' : computedStyles.fontWeight === '400' ? 'Regular' : computedStyles.fontWeight === '500' ? 'Medium' : computedStyles.fontWeight === '600' ? 'Semibold' : computedStyles.fontWeight === '700' ? 'Bold' : computedStyles.fontWeight === '800' ? 'Extra Bold' : 'Regular'}</span>
                  <svg class="pointa-custom-select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
            
            <div class="pointa-design-control">
              <label class="pointa-design-control-label">Size</label>
              <div class="pointa-spacing-input-wrapper">
                <span class="pointa-spacing-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <text x="2" y="12" font-size="10" font-weight="600" fill="currentColor">Aa</text>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input pointa-number-input" data-property="fontSize" data-dropdown-type="fontSize" value="${computedStyles.fontSize}" placeholder="16px">
              </div>
            </div>
          </div>
          
          <div class="pointa-design-row">
            <div class="pointa-design-control">
              <label class="pointa-design-control-label">Line Height</label>
              <div class="pointa-spacing-input-wrapper">
                <span class="pointa-spacing-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="3" y1="3" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/>
                    <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5"/>
                    <line x1="3" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input pointa-number-input" data-property="lineHeight" data-dropdown-type="lineHeight" value="${computedStyles.lineHeight}" placeholder="1.5">
              </div>
            </div>
            
            <div class="pointa-design-control">
              <label class="pointa-design-control-label">Letter Spacing</label>
              <div class="pointa-spacing-input-wrapper">
                <span class="pointa-spacing-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <text x="1" y="12" font-size="8" font-weight="600" fill="currentColor">A</text>
                    <text x="8" y="12" font-size="8" font-weight="600" fill="currentColor">A</text>
                    <line x1="5.5" y1="8" x2="7.5" y2="8" stroke="currentColor" stroke-width="1.5"/>
                    <polyline points="5,7 5.5,8 5,9" stroke="currentColor" stroke-width="1" fill="none"/>
                    <polyline points="8,7 7.5,8 8,9" stroke="currentColor" stroke-width="1" fill="none"/>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input pointa-number-input" data-property="letterSpacing" data-dropdown-type="letterSpacing" value="${computedStyles.letterSpacing}" placeholder="0em">
              </div>
            </div>
          </div>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Alignment</label>
            <div class="pointa-button-group">
              <button class="pointa-toggle-btn ${computedStyles.textAlign === 'left' || computedStyles.textAlign === 'start' ? 'active' : ''}" data-property="textAlign" data-value="left" title="Left">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
              </button>
              <button class="pointa-toggle-btn ${computedStyles.textAlign === 'center' ? 'active' : ''}" data-property="textAlign" data-value="center" title="Center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>
              </button>
              <button class="pointa-toggle-btn ${computedStyles.textAlign === 'right' || computedStyles.textAlign === 'end' ? 'active' : ''}" data-property="textAlign" data-value="right" title="Right">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
              </button>
              <button class="pointa-toggle-btn ${computedStyles.textAlign === 'justify' ? 'active' : ''}" data-property="textAlign" data-value="justify" title="Justify">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
              </button>
            </div>
          </div>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Decoration</label>
            <div class="pointa-button-group">
              <button class="pointa-toggle-btn ${computedStyles.fontStyle === 'italic' ? 'active' : ''}" data-property="fontStyle" data-value="italic" data-toggle="true" title="Italic">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
              </button>
              <button class="pointa-toggle-btn ${computedStyles.textDecoration.includes('underline') ? 'active' : ''}" data-property="textDecoration" data-value="underline" data-toggle="true" title="Underline">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
              </button>
              <button class="pointa-toggle-btn ${computedStyles.textDecoration.includes('line-through') ? 'active' : ''}" data-property="textDecoration" data-value="line-through" data-toggle="true" title="Strikethrough">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17.5" y1="4" x2="8.5" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
              </button>
            </div>
          </div>
        </div>
        </div>
        
        <!-- STYLE TAB -->
        <div class="pointa-design-tab-panel" data-tab-panel="style">
          <!-- APPEARANCE -->
          <div class="pointa-design-section">
            <h4 class="pointa-design-section-title">Appearance</h4>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Opacity</label>
            <div class="pointa-design-control-with-value">
              <input type="range" class="pointa-design-input" data-property="opacity" value="${parseFloat(computedStyles.opacity) * 100}" min="0" max="100" step="5">
              <span class="pointa-design-value-display">${Math.round(parseFloat(computedStyles.opacity) * 100)}%</span>
            </div>
          </div>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Border Radius</label>
            <div class="pointa-custom-select-wrapper" data-property="borderRadius" data-options='[
              {"value":"0px","label":"None (0px)"},
              {"value":"4px","label":"Small (4px)"},
              {"value":"8px","label":"Medium (8px)"},
              {"value":"12px","label":"Large (12px)"},
              {"value":"16px","label":"XL (16px)"},
              {"value":"24px","label":"2XL (24px)"},
              {"value":"9999px","label":"Full (9999px)"},
              {"value":"custom","label":"Custom..."}
            ]'>
              <div class="pointa-custom-select-trigger">
                <span class="pointa-custom-select-value">None (0px)</span>
                <svg class="pointa-custom-select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        <!-- SHADOW -->
        <div class="pointa-design-section">
          <h4 class="pointa-design-section-title">Shadow</h4>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Box Shadow</label>
            <div class="pointa-custom-select-wrapper" data-property="boxShadow" data-options='[
              {"value":"none","label":"None"},
              {"value":"0 1px 2px 0 rgba(0, 0, 0, 0.05)","label":"Small"},
              {"value":"0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)","label":"Default"},
              {"value":"0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)","label":"Medium"},
              {"value":"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)","label":"Large"},
              {"value":"0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)","label":"XL"},
              {"value":"0 25px 50px -12px rgba(0, 0, 0, 0.25)","label":"2XL"},
              {"value":"custom","label":"Custom..."}
            ]'>
              <div class="pointa-custom-select-trigger">
                <span class="pointa-custom-select-value">None</span>
                <svg class="pointa-custom-select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        <!-- COLOR -->
        <div class="pointa-design-section">
          <h4 class="pointa-design-section-title">Color</h4>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Text Color</label>
            <input type="color" class="pointa-design-input" data-property="color" value="${PointaUtils.rgbToHex(computedStyles.color)}">
          </div>
        </div>
        
        <!-- BACKGROUND -->
        <div class="pointa-design-section">
          <h4 class="pointa-design-section-title">Background</h4>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Background Color</label>
            <input type="color" class="pointa-design-input" data-property="backgroundColor" value="${PointaUtils.rgbToHex(computedStyles.backgroundColor)}">
          </div>
        </div>
        </div>
        
        <!-- BORDER TAB -->
        <div class="pointa-design-tab-panel" data-tab-panel="border">
          <!-- BORDER -->
          <div class="pointa-design-section">
            <h4 class="pointa-design-section-title">Border</h4>
          
          <div class="pointa-design-row">
            <div class="pointa-design-control">
              <label class="pointa-design-control-label">Style</label>
              <div class="pointa-custom-select-wrapper" data-property="borderStyle" data-options='[
                {"value":"none","label":"None"},
                {"value":"solid","label":"Solid"},
                {"value":"dashed","label":"Dashed"},
                {"value":"dotted","label":"Dotted"}
              ]'>
                <div class="pointa-custom-select-trigger">
                  <span class="pointa-custom-select-value">${computedStyles.borderStyle === 'none' ? 'None' : computedStyles.borderStyle === 'solid' ? 'Solid' : computedStyles.borderStyle === 'dashed' ? 'Dashed' : computedStyles.borderStyle === 'dotted' ? 'Dotted' : 'None'}</span>
                  <svg class="pointa-custom-select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
            
            <div class="pointa-design-control">
              <label class="pointa-design-control-label">Width</label>
              <div class="pointa-spacing-input-wrapper">
                <span class="pointa-spacing-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="2" fill="none"/>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input pointa-number-input" data-property="borderWidth" data-dropdown-type="borderWidth" value="${computedStyles.borderWidth}" placeholder="0px">
              </div>
            </div>
          </div>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Border Color</label>
            <input type="color" class="pointa-design-input" data-property="borderColor" value="${PointaUtils.rgbToHex(computedStyles.borderColor)}">
          </div>
        </div>
        </div>
        
        <!-- LAYOUT TAB -->
        <div class="pointa-design-tab-panel" data-tab-panel="layout">
          <!-- LAYOUT -->
          <div class="pointa-design-section">
            <h4 class="pointa-design-section-title">Layout</h4>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Margin</label>
            <div class="pointa-spacing-box">
              <div class="pointa-spacing-input-wrapper" data-position="top">
                <span class="pointa-spacing-icon" data-icon="top">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                    <line x1="3" y1="3" x2="13" y2="3" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input" data-property="marginTop" value="${computedStyles.marginTop}" placeholder="0px">
              </div>
              <div class="pointa-spacing-row">
                <div class="pointa-spacing-input-wrapper" data-position="left">
                  <span class="pointa-spacing-icon" data-icon="left">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                      <line x1="3" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2"/>
                    </svg>
                  </span>
                  <input type="text" class="pointa-spacing-input" data-property="marginLeft" value="${computedStyles.marginLeft}" placeholder="0px">
                </div>
                <div class="pointa-spacing-input-wrapper" data-position="right">
                  <span class="pointa-spacing-icon" data-icon="right">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                      <line x1="13" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2"/>
                    </svg>
                  </span>
                  <input type="text" class="pointa-spacing-input" data-property="marginRight" value="${computedStyles.marginRight}" placeholder="0px">
                </div>
              </div>
              <div class="pointa-spacing-input-wrapper" data-position="bottom">
                <span class="pointa-spacing-icon" data-icon="bottom">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                    <line x1="3" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input" data-property="marginBottom" value="${computedStyles.marginBottom}" placeholder="0px">
              </div>
            </div>
          </div>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Padding</label>
            <div class="pointa-spacing-box">
              <div class="pointa-spacing-input-wrapper" data-position="top">
                <span class="pointa-spacing-icon" data-icon="top">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                    <line x1="3" y1="3" x2="13" y2="3" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input" data-property="paddingTop" value="${computedStyles.paddingTop}" placeholder="0px">
              </div>
              <div class="pointa-spacing-row">
                <div class="pointa-spacing-input-wrapper" data-position="left">
                  <span class="pointa-spacing-icon" data-icon="left">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                      <line x1="3" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2"/>
                    </svg>
                  </span>
                  <input type="text" class="pointa-spacing-input" data-property="paddingLeft" value="${computedStyles.paddingLeft}" placeholder="0px">
                </div>
                <div class="pointa-spacing-input-wrapper" data-position="right">
                  <span class="pointa-spacing-icon" data-icon="right">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                      <line x1="13" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2"/>
                    </svg>
                  </span>
                  <input type="text" class="pointa-spacing-input" data-property="paddingRight" value="${computedStyles.paddingRight}" placeholder="0px">
                </div>
              </div>
              <div class="pointa-spacing-input-wrapper" data-position="bottom">
                <span class="pointa-spacing-icon" data-icon="bottom">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="10" height="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                    <line x1="3" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </span>
                <input type="text" class="pointa-spacing-input" data-property="paddingBottom" value="${computedStyles.paddingBottom}" placeholder="0px">
              </div>
            </div>
          </div>
          
          <div class="pointa-design-control">
            <label class="pointa-design-control-label">Gap (Flexbox/Grid)</label>
            <div class="pointa-spacing-input-wrapper">
              <span class="pointa-spacing-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="2" width="5" height="5" fill="currentColor" opacity="0.3"/>
                  <rect x="9" y="2" width="5" height="5" fill="currentColor" opacity="0.3"/>
                  <rect x="2" y="9" width="5" height="5" fill="currentColor" opacity="0.3"/>
                  <rect x="9" y="9" width="5" height="5" fill="currentColor" opacity="0.3"/>
                  <line x1="7.5" y1="2" x2="7.5" y2="14" stroke="currentColor" stroke-width="1" stroke-dasharray="1,1"/>
                  <line x1="2" y1="7.5" x2="14" y2="7.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1,1"/>
                </svg>
              </span>
              <input type="text" class="pointa-spacing-input pointa-number-input" data-property="gap" data-dropdown-type="gap" value="${computedStyles.gap}" placeholder="8px">
            </div>
          </div>
        </div>
        </div>
      </div>
      
      <div class="pointa-design-editor-footer">
        <button class="pointa-design-btn pointa-design-btn-move" data-action="toggle-move" title="Enable drag to reposition element">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
          </svg>
          Move
        </button>
        <div style="flex: 1"></div>
        <button class="pointa-design-btn pointa-design-btn-secondary" data-action="cancel">Cancel</button>
        <button class="pointa-design-btn pointa-design-btn-primary" data-action="submit">Submit Changes</button>
      </div>
    `;

    // Append to body
    document.body.appendChild(editor);
    pointa.currentDesignEditor = editor;

    // Adjust position based on actual height to ensure it fits on screen
    const editorHeight = editor.offsetHeight;
    const actualEditorWidth = editor.offsetWidth || editorWidth;
    const maxAllowedHeight = window.innerHeight - 32; // 16px margin top and bottom

    // If editor is too tall or would overflow viewport, adjust top position
    if (editorHeight > maxAllowedHeight || top + editorHeight > window.innerHeight - gap) {
      // Position so the bottom of the editor is 16px from bottom of viewport
      top = Math.max(gap, window.innerHeight - editorHeight - gap);
      editor.style.top = `${top}px`;
    }

    // KEEP OUT ZONE: Verify editor doesn't overlap with the element being edited
    // Get current position from style
    const currentLeft = parseFloat(editor.style.left);
    const currentTop = parseFloat(editor.style.top);
    
    // Calculate editor bounding box
    const editorBox = {
      left: currentLeft,
      top: currentTop,
      right: currentLeft + actualEditorWidth,
      bottom: currentTop + editorHeight
    };
    
    // Check for overlap with element
    const horizontalOverlap = !(editorBox.left >= rect.right || editorBox.right <= rect.left);
    const verticalOverlap = !(editorBox.top >= rect.bottom || editorBox.bottom <= rect.top);
    
    // If editor overlaps with element, reposition it
    if (horizontalOverlap && verticalOverlap) {
      // Try positioning below the element
      top = rect.bottom + gap;
      
      // If below goes off viewport, try above
      if (top + editorHeight > window.innerHeight - gap) {
        top = rect.top - editorHeight - gap;
        
        // If above also doesn't work, position to the side and adjust vertically
        if (top < gap) {
          // Try to position to the right side without overlapping
          if (rect.right + actualEditorWidth + gap < window.innerWidth - gap) {
            left = rect.right + gap;
          } else if (rect.left - actualEditorWidth - gap > gap) {
            left = rect.left - actualEditorWidth - gap;
          } else {
            // No horizontal space, use below and clamp
            left = Math.max(gap, Math.min(rect.left, window.innerWidth - actualEditorWidth - gap));
          }
          top = Math.max(gap, window.innerHeight - editorHeight - gap);
        }
      }
      
      // Apply adjusted position
      editor.style.left = `${left}px`;
      editor.style.top = `${top}px`;
    }

    // Set up event listeners for real-time preview
    this.setupDesignEditorListeners(pointa, editor, element);
  },

  /**
   * Show design editor for editing an existing design annotation
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} element - Element to edit
   * @param {Object} annotation - Existing annotation to edit
   */
  showDesignEditorForEdit(pointa, element, annotation) {
    // Similar to showDesignEditor but for editing an existing design annotation

    // DON'T clear data-annotation-applied yet - only clear when Move button is clicked
    // (This is handled in toggleMoveMode now)

    // Store the original position data for later use (if user clicks Move)
    // but DON'T revert the position immediately - only revert when Move button is clicked
    if (annotation.css_changes.dom_position) {
      // Store this for later use in toggleMoveMode
      if (!pointa.originalStyles.has(element)) {
        pointa.originalStyles.set(element, {});
      }
      pointa.originalStyles.get(element).savedDomPosition = annotation.css_changes.dom_position;
    }

    // Extract the saved scope from the annotation
    const savedScope = annotation.scope?.edit_scope || 'instance';

    // Get computed styles (current state after changes)
    const computedStyles = window.getComputedStyle(element);

    // Store original styles from the annotation's css_changes
    const originalStylesFromAnnotation = {};
    Object.entries(annotation.css_changes).forEach(([property, change]) => {
      originalStylesFromAnnotation[property] = change.old;
    });

    // Also get current computed styles for properties that might not have been changed
    pointa.originalStyles.set(element, {
      fontSize: originalStylesFromAnnotation.fontSize || computedStyles.fontSize,
      fontFamily: originalStylesFromAnnotation.fontFamily || computedStyles.fontFamily,
      fontWeight: originalStylesFromAnnotation.fontWeight || computedStyles.fontWeight,
      fontStyle: originalStylesFromAnnotation.fontStyle || computedStyles.fontStyle,
      lineHeight: originalStylesFromAnnotation.lineHeight || computedStyles.lineHeight,
      letterSpacing: originalStylesFromAnnotation.letterSpacing || computedStyles.letterSpacing,
      textDecoration: originalStylesFromAnnotation.textDecoration || computedStyles.textDecoration,
      color: originalStylesFromAnnotation.color || computedStyles.color,
      textAlign: originalStylesFromAnnotation.textAlign || computedStyles.textAlign,
      paddingTop: originalStylesFromAnnotation.paddingTop || computedStyles.paddingTop,
      paddingRight: originalStylesFromAnnotation.paddingRight || computedStyles.paddingRight,
      paddingBottom: originalStylesFromAnnotation.paddingBottom || computedStyles.paddingBottom,
      paddingLeft: originalStylesFromAnnotation.paddingLeft || computedStyles.paddingLeft,
      marginTop: originalStylesFromAnnotation.marginTop || computedStyles.marginTop,
      marginRight: originalStylesFromAnnotation.marginRight || computedStyles.marginRight,
      marginBottom: originalStylesFromAnnotation.marginBottom || computedStyles.marginBottom,
      marginLeft: originalStylesFromAnnotation.marginLeft || computedStyles.marginLeft,
      gap: originalStylesFromAnnotation.gap || computedStyles.gap,
      backgroundColor: originalStylesFromAnnotation.backgroundColor || computedStyles.backgroundColor,
      backgroundImage: originalStylesFromAnnotation.backgroundImage || computedStyles.backgroundImage,
      opacity: originalStylesFromAnnotation.opacity || computedStyles.opacity,
      borderRadius: originalStylesFromAnnotation.borderRadius || computedStyles.borderRadius,
      borderStyle: originalStylesFromAnnotation.borderStyle || computedStyles.borderStyle,
      borderWidth: originalStylesFromAnnotation.borderWidth || computedStyles.borderWidth,
      borderColor: originalStylesFromAnnotation.borderColor || computedStyles.borderColor,
      boxShadow: originalStylesFromAnnotation.boxShadow || computedStyles.boxShadow,
      textContent: originalStylesFromAnnotation.textContent || element.textContent
    });

    // Initialize pending changes with the existing changes
    pointa.pendingCSSChanges = JSON.parse(JSON.stringify(annotation.css_changes));

    // Call showDesignEditor with the saved scope to restore the original selection
    this.showDesignEditor(pointa, element, savedScope);

    // IMPORTANT: Set the editing ID AFTER showDesignEditor to prevent it from being cleared
    pointa.currentEditingAnnotationId = annotation.id;
  },

  /**
   * Calculate scope options for the element
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} element - Element to analyze
   * @returns {Object} Scope options info
   */
  calculateScopeOptions(pointa, element) {
    // Get source mapping info to check for component file
    const sourceMapping = VibeContextAnalyzer.generateSourceMapping(element);
    const sourceFile = sourceMapping?.source_file_path;
    const componentName = sourceFile ? sourceFile.split('/').pop().split('.')[0] : null;

    // Find similar elements on the page
    let similarElements = [element];
    let similarElementSelector = null;

    // If element has a component file (data-insp-path), find ALL elements from same component
    const inspPath = element.getAttribute('data-insp-path');
    if (inspPath && sourceFile) {
      // Extract the component file path (before the line:col:tag)
      // e.g., "components/breadcrumb.tsx:111:19:span" -> "components/breadcrumb.tsx"
      const componentPath = inspPath.split(':')[0];

      // Find all elements that have data-insp-path starting with this component path
      similarElementSelector = `[data-insp-path^="${componentPath}:"]`;
      try {
        similarElements = Array.from(document.querySelectorAll(similarElementSelector));

      } catch (e) {
        console.warn('Failed to query similar elements by component path:', e);
        similarElements = [element];
        similarElementSelector = null;
      }
    }

    // Fallback: if no component path, try matching by tag + primary class (old behavior)
    if (!similarElementSelector) {
      const tag = element.tagName.toLowerCase();
      const classes = Array.from(element.classList).filter((cls) =>
      !cls.startsWith('pointa-') && !cls.startsWith('data-')
      );

      similarElementSelector = tag; // Default to just the tag

      if (classes.length > 0) {
        const primaryClass = classes[0];
        similarElementSelector = `${tag}.${CSS.escape(primaryClass)}`;
        try {
          similarElements = Array.from(document.querySelectorAll(similarElementSelector));
        } catch (e) {
          console.warn('Failed to query similar elements:', e);
          similarElements = [element];
        }
      }
    }

    // NEW: Detect if element has siblings in a common parent (page-level scope)
    let siblingInfo = null;
    const parent = element.parentElement;

    if (similarElements.length > 1 && parent) {
      // Check if multiple similar elements share the same immediate parent
      const siblingsInParent = similarElements.filter((el) => el.parentElement === parent);

      // Only create siblingInfo if we have a meaningful subset
      // (more than 1 sibling, but fewer than all similar elements on page)
      if (siblingsInParent.length > 1 && siblingsInParent.length < similarElements.length) {
        const parentClasses = Array.from(parent.classList).filter((c) => !c.startsWith('pointa-'));
        const parentTag = parent.tagName.toLowerCase();

        // Try to find a descriptive name for the container
        let containerName = parentTag;
        if (parentClasses.length > 0) {
          // Check if parent has grid/flex classes for better labeling
          const layoutClasses = parentClasses.filter((c) =>
          c.includes('grid') || c.includes('flex') || c.includes('container')
          );
          if (layoutClasses.length > 0) {
            containerName = layoutClasses[0];
          }
        }

        siblingInfo = {
          count: siblingsInParent.length,
          elements: siblingsInParent,
          parentTag: parentTag,
          parentClasses: parentClasses,
          containerName: containerName
        };


      } else if (siblingsInParent.length === similarElements.length && siblingsInParent.length > 1) {
        // All similar elements are siblings - page scope is same as container scope
        // Still useful to show as it makes the hierarchy clearer
        const parentClasses = Array.from(parent.classList).filter((c) => !c.startsWith('pointa-'));
        const parentTag = parent.tagName.toLowerCase();
        let containerName = parentTag;
        if (parentClasses.length > 0) {
          const layoutClasses = parentClasses.filter((c) =>
          c.includes('grid') || c.includes('flex') || c.includes('container')
          );
          if (layoutClasses.length > 0) {
            containerName = layoutClasses[0];
          }
        }

        siblingInfo = {
          count: siblingsInParent.length,
          elements: siblingsInParent,
          parentTag: parentTag,
          parentClasses: parentClasses,
          containerName: containerName,
          isAllOnPage: true // Flag to indicate this is all instances on page
        };


      }
    }

    return {
      similarCount: similarElements.length,
      similarElements: similarElements,
      similarElementSelector: similarElementSelector, // Store the selector
      hasComponentFile: !!sourceFile,
      componentFile: sourceFile,
      componentName: componentName,
      siblingInfo: siblingInfo
    };
  },

  /**
   * Change scope selection for affected elements
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} newScope - New scope value ('instance', 'page', or 'app')
   * @param {HTMLElement} editor - Editor panel element
   */
  changeScopeSelection(pointa, newScope, editor) {
    // Update scope
    pointa.designEditScope = newScope;

    // Update affected elements based on new scope
    if (newScope === 'instance') {
      pointa.affectedElements = [pointa.currentEditingElement];
    } else if (newScope === 'page') {
      // NEW: For 'page' scope, affect only siblings in the same container
      pointa.affectedElements = pointa.componentInfo.siblingInfo.elements;
    } else if (newScope === 'app') {
      // For 'app' scope, we just mark it - AI will edit the component file
      // But we still highlight similar elements on current page
      pointa.affectedElements = pointa.componentInfo.similarElements;
    }

    // Update UI buttons
    const scopeButtons = editor.querySelectorAll('.pointa-scope-option');
    scopeButtons.forEach((btn) => {
      const isActive = btn.dataset.scope === newScope;
      if (isActive) {
        btn.classList.add('active');
        btn.querySelector('.pointa-scope-radio').textContent = '●';
      } else {
        btn.classList.remove('active');
        btn.querySelector('.pointa-scope-radio').textContent = '○';
      }
    });

    // Re-apply any pending changes to all affected elements
    this.applyPendingChangesToAllElements(pointa);

    // Update highlighting
    this.highlightAffectedElements(pointa);
  },

  /**
   * Highlight all affected elements
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  highlightAffectedElements(pointa) {
    // Remove existing highlights
    document.querySelectorAll('.pointa-design-editing').forEach((el) => {
      el.classList.remove('pointa-design-editing');
    });

    // Add highlight to all affected elements
    pointa.affectedElements.forEach((el) => {
      el.classList.add('pointa-design-editing');
    });
  },

  /**
   * Apply pending CSS changes to all affected elements
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  applyPendingChangesToAllElements(pointa) {
    // Apply all pending CSS changes to all affected elements
    if (Object.keys(pointa.pendingCSSChanges).length === 0) return;

    pointa.affectedElements.forEach((el) => {
      Object.entries(pointa.pendingCSSChanges).forEach(([property, change]) => {
        const newValue = change.new;

        if (property === 'textContent') {
          el.textContent = newValue;
        } else if (property === 'opacity') {
          const cssProperty = PointaUtils.camelToKebab(property);
          const cssValue = (parseFloat(newValue) / 100).toString();
          el.style.setProperty(cssProperty, cssValue, 'important');
        } else {
          const cssProperty = PointaUtils.camelToKebab(property);
          el.style.setProperty(cssProperty, newValue, 'important');
        }
      });
    });
  },

  /**
   * Set up all event listeners for the design editor
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} editor - Editor panel element
   * @param {HTMLElement} element - Element being edited
   */
  setupDesignEditorListeners(pointa, editor, element) {
    // Tab switching
    const tabs = editor.querySelectorAll('.pointa-design-tab');
    const tabPanels = editor.querySelectorAll('.pointa-design-tab-panel');

    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = tab.dataset.tab;

        // Update active tab
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        // Update visible panel
        tabPanels.forEach((panel) => {
          if (panel.dataset.tabPanel === targetTab) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });

    // Scope selector buttons
    const scopeButtons = editor.querySelectorAll('.pointa-scope-option');
    scopeButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const newScope = btn.dataset.scope;
        this.changeScopeSelection(pointa, newScope, editor);
      });
    });

    // Close button
    const closeBtn = editor.querySelector('.pointa-design-editor-close');
    closeBtn.addEventListener('click', () => {
      pointa.closeDesignEditor();
    });

    // Comment tab button - switch back to comment widget
    const commentTabBtn = editor.querySelector('[data-mode-tab="comment"]');
    if (commentTabBtn) {
      commentTabBtn.addEventListener('click', () => {
        // Close design editor
        pointa.closeDesignEditor();

        // Reopen comment widget with pending state
        if (pointa.pendingAnnotation) {
          const { annotation, element, context } = pointa.pendingAnnotation;

          // Restore annotation mode temporarily
          pointa.tempDisableAnnotationMode();

          // Generate fresh context
          pointa.generateElementContext(element).then((freshContext) => {
            PointaAnnotationMode.showInlineCommentWidget(
              pointa,
              element,
              freshContext,
              annotation
            );

            // Restore any comment text that was typed
            setTimeout(() => {
              const textarea = document.querySelector('.pointa-inline-comment-textarea');
              if (textarea && pointa.pendingAnnotation.commentText) {
                textarea.value = pointa.pendingAnnotation.commentText;
              }
            }, 0);
          });
        }
      });
    }

    // Make header draggable
    this.makeEditorDraggable(editor);

    // Cancel button
    const cancelBtn = editor.querySelector('[data-action="cancel"]');
    cancelBtn.addEventListener('click', () => {
      this.revertChanges(pointa, element);
      pointa.closeDesignEditor();
    });

    // Submit button
    const submitBtn = editor.querySelector('[data-action="submit"]');
    submitBtn.addEventListener('click', () => {
      this.submitDesignChanges(pointa, element);
    });

    // ESC key handler - close editor and exit annotation mode if active
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        // Revert changes and close editor
        this.revertChanges(pointa, element);
        pointa.closeDesignEditor();

        // If annotation mode is active, exit it
        if (pointa.isAnnotationMode) {
          pointa.stopAnnotationMode();
        }
      }
    };
    document.addEventListener('keydown', escHandler);

    // Store handler on editor for cleanup
    editor._escHandler = escHandler;

    // Move button - toggle drag-to-reposition mode
    const moveBtn = editor.querySelector('[data-action="toggle-move"]');
    moveBtn.addEventListener('click', () => {
      pointa.toggleMoveMode(element, moveBtn);
    });

    // All property inputs - real-time preview (text inputs, selects, textareas)
    const inputs = editor.querySelectorAll('input[data-property], textarea[data-property]');
    inputs.forEach((input) => {
      // Skip button elements (they're handled separately)
      if (input.tagName === 'BUTTON') return;

      // Special handling for color inputs - they need explicit change listener
      if (input.type === 'color') {
        // Color inputs need both input and change events
        input.addEventListener('input', (e) => {
          this.handlePropertyChange(pointa, e.target, element);
        });
        input.addEventListener('change', (e) => {
          this.handlePropertyChange(pointa, e.target, element);
        });
      } else {
        // Listen to both 'input' (for real-time as they type) and 'change' (for final values)
        input.addEventListener('input', (e) => {
          this.handlePropertyChange(pointa, e.target, element);
        });
        input.addEventListener('change', (e) => {
          this.handlePropertyChange(pointa, e.target, element);
        });
      }
    });

    // Custom select dropdowns
    const customSelects = editor.querySelectorAll('.pointa-custom-select-wrapper');
    customSelects.forEach((wrapper) => {
      const trigger = wrapper.querySelector('.pointa-custom-select-trigger');
      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleCustomSelect(pointa, wrapper, element);
        });
      }
    });

    // Toggle buttons (for alignment, decoration, etc.)
    const toggleButtons = editor.querySelectorAll('.pointa-toggle-btn');
    toggleButtons.forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleToggleButtonClick(pointa, button, element, editor);
      });
    });

    // Special handling for opacity slider to update display
    const opacitySlider = editor.querySelector('[data-property="opacity"]');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const valueDisplay = e.target.parentElement.querySelector('.pointa-design-value-display');
        if (valueDisplay) {
          valueDisplay.textContent = `${Math.round(e.target.value)}%`;
        }
      });
    }

    // Special handling for all number inputs with dropdown suggestions
    const numberInputs = editor.querySelectorAll('.pointa-spacing-input, .pointa-number-input');
    numberInputs.forEach((input) => {
      input.addEventListener('focus', (e) => {
        // Clear any pending hide timeout
        if (pointa.spacingDropdownTimeout) {
          clearTimeout(pointa.spacingDropdownTimeout);
          pointa.spacingDropdownTimeout = null;
        }
        this.showNumberDropdown(pointa, e.target, element);
      });

      input.addEventListener('blur', (e) => {
        // Delay closing to allow clicking on dropdown items
        pointa.spacingDropdownTimeout = setTimeout(() => {
          this.hideSpacingDropdown(pointa);
          pointa.spacingDropdownTimeout = null;
        }, 200);
      });
    });

    // Arrow key handling for numeric inputs (increment/decrement values)
    const numericInputs = editor.querySelectorAll('input[type="text"][data-property]');
    numericInputs.forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault(); // Prevent default cursor movement
          this.handleNumericInputArrowKey(pointa, e.target, e.key, element);
        }
      });
    });
  },

  /**
   * Show number dropdown for input field
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLInputElement} input - Input element
   * @param {HTMLElement} element - Element being edited
   */
  showNumberDropdown(pointa, input, element) {
    // Remove any existing dropdown
    this.hideSpacingDropdown(pointa);

    // Determine which value set to use based on input type
    const dropdownType = input.getAttribute('data-dropdown-type') || input.getAttribute('data-property');
    let values = [];

    switch (dropdownType) {
      case 'marginTop':
      case 'marginRight':
      case 'marginBottom':
      case 'marginLeft':
      case 'paddingTop':
      case 'paddingRight':
      case 'paddingBottom':
      case 'paddingLeft':
        // Spacing values (margins/paddings)
        values = [
        '0px', '1px', '2px', '4px', '6px', '8px',
        '10px', '12px', '14px', '16px', '20px', '24px',
        '32px', '40px', '48px', '64px'];

        break;

      case 'fontSize':
        // Font size values
        values = [
        '10px', '11px', '12px', '13px', '14px', '15px', '16px',
        '18px', '20px', '22px', '24px', '28px', '32px', '36px',
        '40px', '48px', '56px', '64px', '72px'];

        break;

      case 'lineHeight':
        // Line height values (unitless and px)
        values = [
        '1', '1.15', '1.25', '1.3', '1.4', '1.5', '1.6', '1.75', '2', '2.5',
        '16px', '20px', '24px', '28px', '32px', '40px'];

        break;

      case 'letterSpacing':
        // Letter spacing values
        values = [
        '0px', '0.01em', '0.025em', '0.05em', '0.1em', '0.15em', '0.2em',
        '-0.01em', '-0.025em', '-0.05em'];

        break;

      case 'borderWidth':
        // Border width values
        values = [
        '0px', '1px', '2px', '3px', '4px', '5px', '6px', '8px', '10px'];

        break;

      case 'gap':
        // Gap values for flexbox/grid
        values = [
        '0px', '2px', '4px', '6px', '8px', '10px', '12px',
        '16px', '20px', '24px', '32px', '40px', '48px', '64px'];

        break;

      default:
        // Default to spacing values
        values = [
        '0px', '1px', '2px', '4px', '6px', '8px',
        '10px', '12px', '14px', '16px', '20px', '24px',
        '32px', '40px', '48px', '64px'];

    }

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'pointa-spacing-dropdown';
    dropdown.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    values.forEach((value) => {
      const item = document.createElement('div');
      item.className = 'pointa-spacing-dropdown-item';
      item.textContent = value;

      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent input blur

        // Clear any pending timeout
        if (pointa.spacingDropdownTimeout) {
          clearTimeout(pointa.spacingDropdownTimeout);
          pointa.spacingDropdownTimeout = null;
        }

        input.value = value;
        // Trigger change event
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        this.hideSpacingDropdown(pointa);
        input.focus();
      });

      dropdown.appendChild(item);
    });

    // Position dropdown below the input
    const inputRect = input.getBoundingClientRect();
    dropdown.style.top = `${inputRect.bottom + window.scrollY}px`;
    dropdown.style.left = `${inputRect.left + window.scrollX}px`;
    dropdown.style.width = `${inputRect.width}px`;

    document.body.appendChild(dropdown);
    pointa.currentSpacingDropdown = dropdown;
  },

  /**
   * Legacy alias for showNumberDropdown
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLInputElement} input - Input element
   * @param {HTMLElement} element - Element being edited
   */
  showSpacingDropdown(pointa, input, element) {
    this.showNumberDropdown(pointa, input, element);
  },

  /**
   * Hide spacing/number dropdown
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  hideSpacingDropdown(pointa) {
    // Clear any pending timeout
    if (pointa.spacingDropdownTimeout) {
      clearTimeout(pointa.spacingDropdownTimeout);
      pointa.spacingDropdownTimeout = null;
    }

    if (pointa.currentSpacingDropdown) {
      pointa.currentSpacingDropdown.remove();
      pointa.currentSpacingDropdown = null;
    }

    // Also remove active state from custom select triggers
    const activeTriggers = document.querySelectorAll('.pointa-custom-select-trigger.active');
    activeTriggers.forEach((trigger) => trigger.classList.remove('active'));
  },

  /**
   * Toggle custom select dropdown
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} wrapper - Select wrapper element
   * @param {HTMLElement} element - Element being edited
   */
  toggleCustomSelect(pointa, wrapper, element) {
    const trigger = wrapper.querySelector('.pointa-custom-select-trigger');
    const isActive = trigger.classList.contains('active');

    // Close any open dropdowns
    this.hideSpacingDropdown(pointa);

    if (isActive) {
      // Just closed it
      return;
    }

    // Open this dropdown
    trigger.classList.add('active');
    this.showCustomSelectDropdown(pointa, wrapper, element);
  },

  /**
   * Show custom select dropdown
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} wrapper - Select wrapper element
   * @param {HTMLElement} element - Element being edited
   */
  showCustomSelectDropdown(pointa, wrapper, element) {
    const trigger = wrapper.querySelector('.pointa-custom-select-trigger');
    const property = wrapper.getAttribute('data-property');
    const optionsData = wrapper.getAttribute('data-options');

    let options = [];
    try {
      options = JSON.parse(optionsData);
    } catch (e) {
      console.error('Failed to parse options:', e);
      return;
    }

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'pointa-spacing-dropdown';
    dropdown.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    options.forEach((option) => {
      const item = document.createElement('div');
      item.className = 'pointa-spacing-dropdown-item';
      item.textContent = option.label;

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Update the displayed value
        const valueSpan = wrapper.querySelector('.pointa-custom-select-value');
        if (valueSpan) {
          valueSpan.textContent = option.label;
        }

        // Apply the change to the element
        this.applyCustomSelectChange(pointa, property, option.value, element);

        // Close dropdown
        this.hideSpacingDropdown(pointa);
      });

      dropdown.appendChild(item);
    });

    // Position dropdown below the trigger
    const triggerRect = trigger.getBoundingClientRect();
    dropdown.style.top = `${triggerRect.bottom + window.scrollY}px`;
    dropdown.style.left = `${triggerRect.left + window.scrollX}px`;
    dropdown.style.width = `${triggerRect.width}px`;

    document.body.appendChild(dropdown);
    pointa.currentSpacingDropdown = dropdown;

    // Close dropdown when clicking outside
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
        this.hideSpacingDropdown(pointa);
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', closeHandler);
    }, 0);
  },

  /**
   * Apply custom select change to element
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {string} property - CSS property name
   * @param {string} value - New value
   * @param {HTMLElement} element - Element being edited
   */
  applyCustomSelectChange(pointa, property, value, element) {
    // Track the change
    if (!pointa.pendingCSSChanges) {
      pointa.pendingCSSChanges = {};
    }
    pointa.pendingCSSChanges[property] = value;

    // Apply the style immediately for preview
    element.style[property] = value;
  },

  /**
   * Handle arrow key input for numeric inputs (increment/decrement)
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLInputElement} input - Input element
   * @param {string} key - Key pressed ('ArrowUp' or 'ArrowDown')
   * @param {HTMLElement} element - Element being edited
   */
  handleNumericInputArrowKey(pointa, input, key, element) {
    // Handle arrow up/down on numeric inputs to increment/decrement values
    const currentValue = input.value.trim();

    // Parse the numeric value and unit from the current value
    const match = currentValue.match(/^(-?[\d.]+)(.*)$/);

    if (!match) {
      // If no match, try to initialize with a default value based on property
      const property = input.dataset.property;
      let defaultValue = '0px';

      if (property === 'lineHeight') {
        defaultValue = '1.5';
      } else if (property === 'letterSpacing') {
        defaultValue = '0em';
      } else if (property === 'fontSize') {
        defaultValue = '16px';
      }

      input.value = defaultValue;
      // Trigger change event
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    let numericValue = parseFloat(match[1]);
    const unit = match[2] || '';

    // Determine increment amount based on unit and property
    let increment = 1;

    if (unit === 'px') {
      increment = 1;
    } else if (unit === 'em' || unit === 'rem') {
      increment = 0.1;
    } else if (unit === '%') {
      increment = 5;
    } else if (unit === '') {
      // No unit (like line-height or font-weight)
      const property = input.dataset.property;
      if (property === 'lineHeight') {
        increment = 0.1;
      } else if (property === 'fontWeight') {
        increment = 100;
      } else {
        increment = 1;
      }
    }

    // Apply increment or decrement
    if (key === 'ArrowUp') {
      numericValue += increment;
    } else if (key === 'ArrowDown') {
      numericValue -= increment;
    }

    // Round to appropriate decimal places based on increment
    if (increment < 1) {
      numericValue = Math.round(numericValue * 10) / 10; // 1 decimal place
    } else {
      numericValue = Math.round(numericValue);
    }

    // Don't allow negative values for most properties (except margins)
    const property = input.dataset.property;
    const allowNegative = property && (
    property.includes('margin') ||
    property === 'letterSpacing');


    if (!allowNegative && numericValue < 0) {
      numericValue = 0;
    }

    // Update the input value
    input.value = `${numericValue}${unit}`;

    // Trigger change event to apply the change
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * Set up global dropdown listeners (called once during initialization)
   * @param {Pointa} pointa - Reference to main Pointa instance
   */
  setupGlobalDropdownListeners(pointa) {
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (pointa.currentSpacingDropdown) {
        const isInsideDropdown = e.target.closest('.pointa-spacing-dropdown');
        const isInsideInput = e.target.closest('.pointa-spacing-input');

        if (!isInsideDropdown && !isInsideInput) {
          this.hideSpacingDropdown(pointa);
        }
      }
    }, true);
  },

  /**
   * Handle toggle button clicks (alignment, decoration, etc.)
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLButtonElement} button - Button element
   * @param {HTMLElement} element - Element being edited
   * @param {HTMLElement} editor - Editor panel element
   */
  handleToggleButtonClick(pointa, button, element, editor) {
    const property = button.dataset.property;
    const value = button.dataset.value;
    const isToggle = button.dataset.toggle === 'true';

    if (isToggle) {
      // Toggle behavior (like italic, underline) - can be turned on/off
      const isActive = button.classList.contains('active');

      if (property === 'fontStyle') {
        // Toggle italic
        const newValue = isActive ? 'normal' : 'italic';
        this.handlePropertyChange(pointa, { dataset: { property }, value: newValue }, element);

        // Update button state
        button.classList.toggle('active');
      } else if (property === 'textDecoration') {
        // Toggle text decoration (underline, line-through)
        const computedStyles = window.getComputedStyle(element);
        const currentDecoration = computedStyles.textDecoration;

        let newValue;
        if (isActive) {
          // Remove this decoration
          newValue = currentDecoration.replace(value, '').trim() || 'none';
        } else {
          // Add this decoration
          if (currentDecoration === 'none' || !currentDecoration) {
            newValue = value;
          } else {
            newValue = `${currentDecoration} ${value}`;
          }
        }

        this.handlePropertyChange(pointa, { dataset: { property }, value: newValue }, element);

        // Update button state
        button.classList.toggle('active');
      }
    } else {
      // Single-choice behavior (like text align) - only one can be active
      // Remove active class from all buttons in this group
      const buttonGroup = button.parentElement;
      buttonGroup.querySelectorAll('.pointa-toggle-btn').forEach((btn) => {
        btn.classList.remove('active');
      });

      // Add active class to clicked button
      button.classList.add('active');

      // Apply the change
      this.handlePropertyChange(pointa, { dataset: { property }, value }, element);
    }
  },

  /**
   * Handle property change (real-time preview)
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {Object} input - Input object with dataset and value
   * @param {HTMLElement} element - Element being edited
   */
  handlePropertyChange(pointa, input, element) {
    const property = input.dataset.property;
    let value = input.value;

    // Track changes (use the original editing element as reference)
    const originalValue = pointa.originalStyles.get(pointa.currentEditingElement)?.[property];

    if (value !== originalValue) {
      pointa.pendingCSSChanges[property] = {
        old: originalValue,
        new: value
      };
    } else {
      // If reverted to original, remove from pending changes
      delete pointa.pendingCSSChanges[property];
    }

    // Apply changes in real-time to ALL affected elements
    pointa.affectedElements.forEach((el) => {
      if (property === 'textContent') {
        // Text content - update the element's text directly
        el.textContent = value;
      } else if (property === 'opacity') {
        // Opacity is 0-100 from slider, convert to 0-1
        const cssProperty = PointaUtils.camelToKebab(property);
        const cssValue = (parseFloat(value) / 100).toString();
        el.style.setProperty(cssProperty, cssValue, 'important');
      } else {
        // All other CSS properties - convert camelCase to kebab-case
        const cssProperty = PointaUtils.camelToKebab(property);

        // For color properties, ensure we're using a valid CSS color value
        if (property === 'color' || property === 'backgroundColor' || property === 'borderColor') {
          // Color inputs always return hex values, which are valid CSS
          // Super aggressive: clear ALL background/color related properties first

          // Try multiple ways to remove the property
          el.style.removeProperty(cssProperty);
          el.style[property] = ''; // Also try direct property access

          // Force set with !important multiple ways
          el.style.setProperty(cssProperty, value, 'important');
          el.style[property] = value; // Backup method

          // Check for common issues that prevent background-color from showing
          if (property === 'backgroundColor') {
            const styles = window.getComputedStyle(el);

            // CRITICAL FIX: If there's a background-image, it covers the background-color
            // We need to remove it so the color can show through
            if (styles.backgroundImage !== 'none') {
              // Track this change in pending changes (only for main element)
              if (el === pointa.currentEditingElement) {
                const originalBgImage = pointa.originalStyles.get(el)?.backgroundImage || styles.backgroundImage;
                pointa.pendingCSSChanges['backgroundImage'] = {
                  old: originalBgImage,
                  new: 'none'
                };
              }

              el.style.removeProperty('background-image');
              el.style.setProperty('background-image', 'none', 'important');
            }
          }

          // Force browser repaint/reflow to ensure visual update
          void el.offsetHeight;
        } else {
          el.style.setProperty(cssProperty, value, 'important');
        }
      }
    });
  },

  /**
   * Revert all changes back to original styles
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} element - Element to revert
   */
  revertChanges(pointa, element) {
    // Revert all inline styles back to original
    const original = pointa.originalStyles.get(element);
    if (!original) return;

    // First, revert DOM position if it was changed
    if (original.originalParent && original.originalNextSibling !== undefined) {
      const currentParent = element.parentElement;
      const currentIndex = Array.from(currentParent.children).indexOf(element);

      // Check if position was actually changed
      if (original.originalParent !== currentParent || original.originalIndex !== currentIndex) {
        // Restore original DOM position
        if (original.originalNextSibling) {
          original.originalParent.insertBefore(element, original.originalNextSibling);
        } else {
          original.originalParent.appendChild(element);
        }
      }
    }

    // Then revert style properties
    for (const [property, value] of Object.entries(original)) {
      if (property === 'textContent') continue; // Don't revert text content
      if (property === 'originalParent' || property === 'originalNextSibling' || property === 'originalIndex') continue; // Skip DOM position tracking

      // Remove inline style
      element.style.removeProperty(property);
    }

    pointa.pendingCSSChanges = {};
  },

  /**
   * Make the design editor draggable by its header
   * @param {HTMLElement} editor - Editor panel element
   */
  makeEditorDraggable(editor) {
    const header = editor.querySelector('.pointa-design-editor-header');
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e) => {
      // Don't drag if clicking on close button
      if (e.target.closest('.pointa-design-editor-close')) {
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // Get current position
      const rect = editor.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Add dragging class for cursor style
      header.style.cursor = 'grabbing';

      // Prevent text selection while dragging
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      // Calculate new position
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // Keep within viewport bounds
      const editorWidth = editor.offsetWidth;
      const editorHeight = editor.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - editorWidth));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - editorHeight));

      // Apply new position
      editor.style.left = `${newLeft}px`;
      editor.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
      }
    };

    // Set initial cursor style
    header.style.cursor = 'grab';

    // Add event listeners
    header.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Clean up listeners when editor is closed
    // Store cleanup function for later
    editor._dragCleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  },

  /**
   * Submit design changes and save annotation
   * @param {Pointa} pointa - Reference to main Pointa instance
   * @param {HTMLElement} element - Element being edited
   */
  async submitDesignChanges(pointa, element) {
    if (Object.keys(pointa.pendingCSSChanges).length === 0) {
      alert('No changes detected');
      return;
    }

    // Check if we're editing an existing annotation
    const isEditing = !!pointa.currentEditingAnnotationId;

    // Capture element context (similar to annotation)
    const context = await pointa.generateElementContext(element);

    // Save annotation via API
    try {
      if (isEditing) {
        // Prepare updates for existing annotation
        const updates = {
          css_changes: pointa.pendingCSSChanges,
          updated_at: new Date().toISOString(),
          type: 'design-edit'
        };

        // If there's pending comment text (user switched to design and back), include it
        if (pointa.pendingAnnotation && pointa.pendingAnnotation.commentText) {
          const commentText = pointa.pendingAnnotation.commentText;
          updates.comment = commentText;
          updates.messages = [{
            role: 'user',
            text: commentText,
            timestamp: new Date().toISOString(),
            iteration: 1
          }];
          updates.data_format = 'hybrid';
        }

        // Update via API
        const response = await chrome.runtime.sendMessage({
          action: 'updateAnnotation',
          id: pointa.currentEditingAnnotationId,
          updates: updates
        });

        if (!response.success) {
          throw new Error(response.error || 'Failed to update annotation');
        }

        // Reload annotations from API to get fresh data
        const getResponse = await chrome.runtime.sendMessage({ 
          action: 'getAnnotations',
          url: window.location.href 
        });
        pointa.annotations = getResponse.success ? (getResponse.annotations || []) : [];

        // Get the updated annotation
        const updatedAnnotation = pointa.annotations.find(a => a.id === pointa.currentEditingAnnotationId);
        if (updatedAnnotation) {
          // Re-apply the updated design changes
          pointa.applyDesignChanges(element, updatedAnnotation);

          // Mark element
          element.setAttribute('data-annotation-applied', pointa.currentEditingAnnotationId);
          element.setAttribute('data-pointa-id', pointa.currentEditingAnnotationId);
        }

        // Clear pending annotation
        pointa.pendingAnnotation = null;

        // Refresh sidebar to show updated design annotation (same as regular annotations)
        if (PointaSidebar && PointaSidebar.isOpen) {
          const serverOnline = await PointaSidebar.checkServerStatus();
          await PointaSidebar.updateContent(pointa, serverOnline);
        }

        PointaDesignMode.showSuccessMessage('Design changes updated!');
      } else {
        // Check if there's a pending annotation from comment widget (unified flow)
        const hasPendingComment = pointa.pendingAnnotation && pointa.pendingAnnotation.commentText;

        // Create new design annotation
        const designAnnotation = VibeAnnotationFactory.createDesignAnnotation(element, context, pointa.pendingCSSChanges, {
          designEditScope: pointa.designEditScope,
          componentInfo: pointa.componentInfo,
          affectedElements: pointa.affectedElements
        });

        // If user added comment text before switching to design, merge it
        if (hasPendingComment) {
          const commentText = pointa.pendingAnnotation.commentText;
          designAnnotation.comment = commentText;
          designAnnotation.messages = [{
            role: 'user',
            text: commentText,
            timestamp: designAnnotation.created_at,
            iteration: 1
          }];
          designAnnotation.data_format = 'hybrid';

          // Also include reference images if any
          if (pointa.pendingAnnotation.referenceImages && pointa.pendingAnnotation.referenceImages.length > 0) {
            designAnnotation.reference_images = pointa.pendingAnnotation.referenceImages;
          }
        }

        // Save new annotation via API
        const response = await chrome.runtime.sendMessage({
          action: 'saveAnnotation',
          annotation: designAnnotation
        });

        if (!response.success) {
          throw new Error(response.error || 'Failed to save annotation');
        }

        // Reload annotations from API to get fresh data
        const getResponse = await chrome.runtime.sendMessage({ 
          action: 'getAnnotations',
          url: window.location.href 
        });
        pointa.annotations = getResponse.success ? (getResponse.annotations || []) : [];

        // Clear pending annotation
        pointa.pendingAnnotation = null;

        // Apply the design changes
        pointa.applyDesignChanges(element, designAnnotation);

        // Mark element
        element.setAttribute('data-annotation-applied', designAnnotation.id);
        element.setAttribute('data-pointa-id', designAnnotation.id);

        // Create badge for this design annotation
        pointa.addAnnotationBadge(element, designAnnotation, pointa.annotations.length);

        // Refresh sidebar to show new design annotation (same as regular annotations)
        if (PointaSidebar && PointaSidebar.isOpen) {
          const serverOnline = await PointaSidebar.checkServerStatus();
          await PointaSidebar.updateContent(pointa, serverOnline);
        }

        PointaDesignMode.showSuccessMessage('Design changes saved!');
      }

      // Close editor
      pointa.closeDesignEditor();

    } catch (error) {
      console.error('Error saving design annotation:', error);
      alert('Error saving design changes. Please try again.');
    }
  }
};
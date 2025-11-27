/**
 * annotation-factory.js
 * 
 * Handles creation of different annotation data structures:
 * - Lean annotations: Optimized for LLM tokens (~1KB, 96% smaller)
 * - Verbose annotations: Full detailed data (~25KB+) 
 * - Design annotations: Rich design edit context with CSS changes
 * 
 * Extracted from content.js as part of Step 8 refactoring.
 */

const VibeAnnotationFactory = {
  /**
   * Creates a lean version of annotation data (optimized for LLM tokens).
   * Strips verbose data while keeping essential context for element finding and code location.
   * 
   * @param {Object} context - Full element context
   * @param {string} comment - User's annotation comment
   * @returns {Object} Lean annotation object (~1KB)
   */
  createLeanAnnotation(context, comment) {
    // Keep only essential classes (first 3, or semantic ones)
    const essentialClasses = context.classes
      .filter(cls => {
        // Prioritize semantic/meaningful classes
        const semanticKeywords = ['nav', 'header', 'footer', 'main', 'content', 'card', 'button', 'form', 'modal', 'menu'];
        return semanticKeywords.some(keyword => cls.toLowerCase().includes(keyword));
      })
      .slice(0, 3);
    
    // If no semantic classes, just take first 3
    const classes = essentialClasses.length > 0 
      ? essentialClasses 
      : context.classes.slice(0, 3);
    
    // Minimal styles - only positioning info
    const minimalStyles = {
      display: context.styles?.display,
      position: context.styles?.position
    };
    
    // Simplified parent chain - only 1 level, minimal info
    const minimalParentChain = context.parent_chain 
      ? [context.parent_chain[0]].map(parent => ({
          tag: parent.tag,
          classes: parent.classes.slice(0, 2), // Just first 2 classes
          id: parent.id
        }))
      : null;
    
    return {
      id: PointaUtils.generateId(),
      url: PointaUtils.getUrlWithoutHash(window.location.href), // Strip hash to tie annotation to page, not section
      selector: context.selector,
      comment: comment,
      
      // Essential context - stripped down
      element_context: {
        tag: context.tag,
        classes: classes,
        text: context.text, // Keep full text (100 chars) for fallback matching
        styles: minimalStyles,
        position: context.position // Keep position for fallback element finding
      },
      
      // Critical for finding the right code
      source_file_path: context.source_mapping?.source_file_path || null,
      source_line_range: context.source_mapping?.source_line_range || null,
      project_area: context.source_mapping?.project_area || 'unknown',
      url_path: context.source_mapping?.url_path || window.location.pathname,
      context_hints: context.source_mapping?.context_hints || null,
      
      // Simplified supplementary data
      parent_chain: minimalParentChain,
      
      // Metadata
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      
      // Flag to indicate this is lean version
      data_format: 'lean'
    };
  },

  /**
   * Creates a verbose/full version of annotation data (original format).
   * Kept for backwards compatibility and optional use.
   * 
   * @param {Object} context - Full element context
   * @param {string} comment - User's annotation comment
   * @returns {Object} Verbose annotation object (~25KB+)
   */
  createVerboseAnnotation(context, comment) {
    return {
      id: PointaUtils.generateId(),
      url: PointaUtils.getUrlWithoutHash(window.location.href), // Strip hash to tie annotation to page, not section
      selector: context.selector,
      comment: comment,
      viewport: context.viewport,
      element_context: {
        tag: context.tag,
        classes: context.classes,
        text: context.text,
        styles: context.styles,
        position: context.position
      },
      source_file_path: context.source_mapping?.source_file_path || null,
      source_line_range: context.source_mapping?.source_line_range || null,
      project_area: context.source_mapping?.project_area || 'unknown',
      url_path: context.source_mapping?.url_path || window.location.pathname,
      source_map_available: context.source_mapping?.source_map_available || false,
      context_hints: context.source_mapping?.context_hints || null,
      parent_chain: context.parent_chain || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data_format: 'verbose'
    };
  },

  /**
   * Creates a design-edit annotation with CSS changes structure.
   * Used by Design Mode to track visual style changes.
   * Design annotations keep MORE context than regular annotations since the changes are the message.
   * 
   * @param {HTMLElement} element - The element being edited
   * @param {Object} context - Full element context
   * @param {Object} cssChanges - Object with CSS property changes { property: {old: value, new: value} }
   * @param {Object} designState - Design mode state (componentInfo, designEditScope, affectedElements)
   * @returns {Object} Design annotation object
   */
  createDesignAnnotation(element, context, cssChanges, designState = {}) {
    // Get full computed styles for comprehensive context
    const computedStyle = window.getComputedStyle(element);
    
    // Capture complete style state BEFORE changes (critical for AI understanding)
    const fullComputedStyles = {
      // Typography
      fontFamily: computedStyle.fontFamily,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      fontStyle: computedStyle.fontStyle,
      lineHeight: computedStyle.lineHeight,
      letterSpacing: computedStyle.letterSpacing,
      textAlign: computedStyle.textAlign,
      textDecoration: computedStyle.textDecoration,
      textTransform: computedStyle.textTransform,
      
      // Colors
      color: computedStyle.color,
      backgroundColor: computedStyle.backgroundColor,
      
      // Layout & Spacing
      display: computedStyle.display,
      position: computedStyle.position,
      width: computedStyle.width,
      height: computedStyle.height,
      paddingTop: computedStyle.paddingTop,
      paddingRight: computedStyle.paddingRight,
      paddingBottom: computedStyle.paddingBottom,
      paddingLeft: computedStyle.paddingLeft,
      marginTop: computedStyle.marginTop,
      marginRight: computedStyle.marginRight,
      marginBottom: computedStyle.marginBottom,
      marginLeft: computedStyle.marginLeft,
      gap: computedStyle.gap,
      
      // Border & Visual
      borderRadius: computedStyle.borderRadius,
      borderWidth: computedStyle.borderWidth,
      borderStyle: computedStyle.borderStyle,
      borderColor: computedStyle.borderColor,
      boxShadow: computedStyle.boxShadow,
      opacity: computedStyle.opacity,
      
      // Flexbox/Grid (if applicable)
      flexDirection: computedStyle.flexDirection,
      justifyContent: computedStyle.justifyContent,
      alignItems: computedStyle.alignItems,
      gridTemplateColumns: computedStyle.gridTemplateColumns
    };
    
    // Auto-detect context (zero user friction)
    const autoDetectedContext = {
      // CSS Framework Detection (Tailwind, Bootstrap, etc.)
      css_framework: VibeContextAnalyzer.detectCSSFramework(context.classes, computedStyle),
      
      // Element Reusability Analysis (is this a component instance?)
      reusability: VibeContextAnalyzer.analyzeElementReusability(element, context),
      
      // Styling Approach (utility classes, CSS-in-JS, inline, etc.)
      styling_approach: VibeContextAnalyzer.detectStylingApproach(element, context.classes),
      
      // Change Pattern Analysis (what kind of change is this?)
      change_pattern: VibeContextAnalyzer.analyzeChangePattern(cssChanges, fullComputedStyles),
      
      // Component Architecture Hints (React component? Vue? Plain HTML?)
      component_context: VibeContextAnalyzer.analyzeComponentContext(element, context)
    };
    
    // Generate human-readable summary of changes
    const changesSummary = VibeContextAnalyzer.generateChangesSummary(cssChanges);
    
    // Keep more detailed parent chain for design mode (2 levels)
    const detailedParentChain = context.parent_chain 
      ? context.parent_chain.slice(0, 2).map(parent => ({
          tag: parent.tag,
          classes: parent.classes || [],
          id: parent.id || null,
          role: parent.role || null
        }))
      : [];
    
    // Add scope information for AI and for reloading
    // Use persistent selector for finding similar elements (not data-pointa-id)
    const persistentSelector = designState.componentInfo?.similarElementSelector || context.selector;
    const scopeInfo = {
      edit_scope: designState.designEditScope || 'instance',  // 'instance' or 'app'
      affected_elements_count: designState.affectedElements?.length || 1,
      similar_element_selector: persistentSelector,  // Persistent selector to find all similar elements
      scope_instruction: this.generateScopeInstruction(designState)
    };
    
    // Generate a clean selector without temporary attributes
    const cleanSelector = VibeSelectorGenerator.generateClean(element);
    
    return {
      id: PointaUtils.generateId(),
      type: 'design-edit',
      url: PointaUtils.getUrlWithoutHash(window.location.href), // Strip hash to tie annotation to page, not section
      selector: cleanSelector,  // Use clean selector without data-pointa-id
      
      // SCOPE INFORMATION - tells AI and system what to edit
      scope: scopeInfo,
      
      // CSS changes with before/after values (THE MAIN MESSAGE)
      css_changes: cssChanges,
      
      // Human-readable summary of what changed
      changes_summary: changesSummary,
      
      // ENHANCED: Full element context for design mode
      element_context: {
        tag: context.tag,
        classes: context.classes,  // Keep ALL classes (important for framework detection)
        text: context.text,
        position: context.position,
        
        // Full computed styles BEFORE changes (critical for AI)
        computed_styles: fullComputedStyles
      },
      
      // Auto-detected context (no user input needed!)
      design_context: autoDetectedContext,
      
      // Source mapping (if available)
      source_file_path: context.source_mapping?.source_file_path || null,
      source_line_range: context.source_mapping?.source_line_range || null,
      project_area: context.source_mapping?.project_area || 'unknown',
      url_path: context.source_mapping?.url_path || window.location.pathname,
      context_hints: context.source_mapping?.context_hints || null,
      
      // Enhanced parent chain (2 levels for better context)
      parent_chain: detailedParentChain,
      
      // Viewport for responsiveness context
      viewport: context.viewport,
      
      // Metadata
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data_format: 'design-rich'  // New format identifier
    };
  },

  /**
   * Generate clear instruction for AI based on scope.
   * Provides context-aware guidance for how changes should be applied.
   * 
   * @param {Object} designState - Design mode state (componentInfo, designEditScope, affectedElements)
   * @returns {string} Human-readable scope instruction
   */
  generateScopeInstruction(designState = {}) {
    const { designEditScope, componentInfo } = designState;
    
    // Generate clear instruction for AI based on scope
    switch (designEditScope) {
      case 'instance':
        return 'Apply changes to THIS SPECIFIC ELEMENT ONLY using inline styles or a unique class.';
      
      case 'page':
        const containerInfo = componentInfo?.siblingInfo;
        const count = containerInfo?.count || 'multiple';
        const containerName = containerInfo?.containerName || 'container';
        return `Apply changes to ${count} similar elements in the same ${containerName} on this page. Use a selector that targets these specific siblings.`;
      
      case 'app':
        const componentFile = componentInfo?.componentFile || 'component file';
        return `Apply changes to the ENTIRE APPLICATION by editing the component source file: ${componentFile}. This will affect all instances across all pages.`;
      
      default:
        return 'Apply changes as appropriate based on context.';
    }
  }
};


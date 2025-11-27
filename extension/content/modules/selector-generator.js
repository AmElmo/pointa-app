// Pointa Selector Generator
// Generates robust CSS selectors for element identification

class SelectorGenerator {
  constructor() {
    // For generateCleanSelector method - will be set by main class
    this.pendingCSSChanges = null;
    this.originalStyles = null;
  }

  /**
   * Main selector generation method - tries multiple strategies
   * @param {HTMLElement} element - Element to generate selector for
   * @returns {string} CSS selector
   */
  generate(element) {
    // Start with the most specific selectors and work up
    
    // 1. Try ID first (most specific)
    if (element.id) {
      const escapedId = CSS.escape(element.id);
      const idSelector = `#${escapedId}`;
      // Verify it's unique and matches the correct element
      if (this.isUnique(idSelector, element)) {
        return idSelector;
      }
    }
    
    // 2. Try to find unique attribute combinations
    const uniqueSelector = this.findUniqueAttribute(element);
    if (uniqueSelector && this.isUnique(uniqueSelector, element)) {
      return uniqueSelector;
    }
    
    // 3. Try text content for buttons and links (more stable)
    const textSelector = this.generateTextBased(element);
    if (textSelector && this.isUnique(textSelector, element)) {
      return textSelector;
    }
    
    // 4. Try class-based selector with uniqueness checking
    const classSelector = this.generateClass(element);
    if (classSelector && this.isUnique(classSelector, element)) {
      return classSelector;
    }
    
    // 5. Try with limited parent context (avoid too deep nesting)
    const contextSelector = this.generateLimitedContext(element);
    if (contextSelector && this.isUnique(contextSelector, element)) {
      return contextSelector;
    }
    
    // 6. Try multiple fallback strategies
    const fallbackSelector = this.generateFallback(element);
    if (fallbackSelector && this.isUnique(fallbackSelector, element)) {
      return fallbackSelector;
    }
    
    // 7. Try robust path-based selector for deeply nested elements
    const pathSelector = this.generateRobustPath(element);
    if (pathSelector && this.isUnique(pathSelector, element)) {
      return pathSelector;
    }
    
    // 8. Last resort: use data attribute
    return this.generateDataAttribute(element);
  }
  
  /**
   * Find unique selector based on semantic attributes
   * @param {HTMLElement} element
   * @returns {string|null} Selector or null
   */
  findUniqueAttribute(element) {
    // Check for unique attributes like aria-label, title, data-*, etc.
    const uniqueAttributes = ['aria-label', 'title', 'data-testid', 'data-test', 'role'];
    
    for (const attr of uniqueAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        const selector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
        if (this.isUnique(selector, element)) {
          return selector;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Generate class-based selector
   * @param {HTMLElement} element
   * @returns {string|null} Selector or null
   */
  generateClass(element) {
    if (!element.className) return null;
    
    const classes = Array.from(element.classList)
      .filter(cls => !cls.startsWith('pointa-'))
      .filter(cls => this.isStableClass(cls))
      .slice(0, 4); // Use more classes for better specificity
    
    if (classes.length === 0) return null;
    
    const escapedClasses = classes.map(cls => CSS.escape(cls)).join('.');
    return `${element.tagName.toLowerCase()}.${escapedClasses}`;
  }
  
  /**
   * Generate selector with limited parent context
   * @param {HTMLElement} element
   * @returns {string|null} Selector or null
   */
  generateLimitedContext(element) {
    const classSelector = this.generateClass(element);
    if (!classSelector) return null;
    
    // Add parent context for more specificity, but limit depth
    const parent = element.parentElement;
    if (parent && parent.tagName !== 'BODY') {
      const parentClasses = Array.from(parent.classList)
        .filter(cls => !cls.startsWith('pointa-'))
        .filter(cls => this.isStableClass(cls))
        .slice(0, 2);
      
      if (parentClasses.length > 0) {
        const parentSelector = parentClasses.map(cls => CSS.escape(cls)).join('.');
        return `${parent.tagName.toLowerCase()}.${parentSelector} > ${classSelector}`;
      }
    }
    
    return null;
  }

  /**
   * Generate robust path-based selector for deeply nested elements
   * @param {HTMLElement} element
   * @returns {string|null} Selector or null
   */
  generateRobustPath(element) {
    // Generate a path-based selector that's more robust for deeply nested elements
    const path = [];
    let current = element;
    let depth = 0;
    const maxDepth = 5; // Increased to handle deeper nesting
    
    while (current && current.tagName !== 'BODY' && depth < maxDepth) {
      const tag = current.tagName.toLowerCase();
      
      // Try to find a meaningful identifier for this level
      let identifier = tag;
      
      // 1. Check for stable classes
      const stableClasses = Array.from(current.classList)
        .filter(cls => !cls.startsWith('pointa-'))
        .filter(cls => this.isStableClass(cls))
        .slice(0, 2);
      
      if (stableClasses.length > 0) {
        identifier = `${tag}.${stableClasses.map(cls => CSS.escape(cls)).join('.')}`;
      }
      // 2. Check for unique attributes
      else if (current.id) {
        identifier = `${tag}#${CSS.escape(current.id)}`;
      }
      else if (current.getAttribute('role')) {
        identifier = `${tag}[role="${current.getAttribute('role')}"]`;
      }
      // 3. For elements with distinctive inline styles, use style attributes
      else if (current.hasAttribute('style')) {
        const style = current.getAttribute('style');
        // Look for distinctive style patterns
        if (style.includes('linear-gradient')) {
          // Extract gradient colors for uniqueness
          const gradientMatch = style.match(/linear-gradient\([^)]+\)/);
          if (gradientMatch) {
            const gradientValue = gradientMatch[0];
            // Use a simplified gradient signature
            const colorMatch = gradientValue.match(/#[0-9a-f]{6}/gi) || 
                              gradientMatch[0].match(/rgb[a]?\([^)]+\)/gi);
            if (colorMatch && colorMatch.length >= 2) {
              // Use first and last color as identifier
              const firstColor = colorMatch[0].replace(/[^a-z0-9]/gi, '');
              const lastColor = colorMatch[colorMatch.length - 1].replace(/[^a-z0-9]/gi, '');
              identifier = `${tag}[style*="linear-gradient"][style*="${firstColor}"][style*="${lastColor}"]`;
            }
          }
        }
        // If no gradient, still use nth-of-type for position
        if (identifier === tag) {
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children || []);
            const sameTagSiblings = siblings.filter(sibling => 
              sibling.tagName.toLowerCase() === tag
            );
            
            if (sameTagSiblings.length > 1) {
              const index = sameTagSiblings.indexOf(current) + 1;
              identifier = `${tag}:nth-of-type(${index})`;
            }
          }
        }
      }
      // 4. Use nth-of-type for position if no classes/attributes/styles
      else {
        const siblings = Array.from(current.parentElement?.children || []);
        const sameTagSiblings = siblings.filter(sibling => 
          sibling.tagName.toLowerCase() === tag
        );
        
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          identifier = `${tag}:nth-of-type(${index})`;
        }
      }
      
      path.unshift(identifier);
      current = current.parentElement;
      depth++;
    }
    
    // Build selector with limited depth
    if (path.length > 0) {
      return path.join(' > ');
    }
    
    return null;
  }
  
  /**
   * Generate text-based selector for elements with stable text
   * @param {HTMLElement} element
   * @returns {string|null} Selector or null
   */
  generateTextBased(element) {
    const text = element.textContent?.trim();
    if (!text || text.length > 100) return null;
    
    // For buttons and links, text content is often stable
    const tag = element.tagName.toLowerCase();
    if (['button', 'a', 'span', 'div'].includes(tag)) {
      // Try to find by text content combined with tag
      const textSanitized = text.replace(/[^\w\s]/g, '').trim();
      if (textSanitized.length > 0 && textSanitized.length < 50) {
        // Use a more robust approach - find by text content
        const candidates = Array.from(document.querySelectorAll(tag));
        const matches = candidates.filter(el => 
          el.textContent?.trim().replace(/[^\w\s]/g, '').trim() === textSanitized
        );
        
        if (matches.length === 1) {
          // Create a selector that finds elements by text content
          return `${tag}[data-text-content="${CSS.escape(textSanitized)}"]`;
        }
      }
    }
    
    return null;
  }

  /**
   * Generate fallback selector with parent context and position
   * @param {HTMLElement} element
   * @returns {string|null} Selector or null
   */
  generateFallback(element) {
    // Try combining tag + attributes + position with parent context
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    
    if (!parent) return null;
    
    // Get parent identifier
    let parentIdentifier = parent.tagName.toLowerCase();
    
    // Try to get parent classes for more specificity
    const parentClasses = Array.from(parent.classList)
      .filter(cls => !cls.startsWith('pointa-'))
      .filter(cls => this.isStableClass(cls))
      .slice(0, 2);
    
    if (parentClasses.length > 0) {
      parentIdentifier += '.' + parentClasses.map(cls => CSS.escape(cls)).join('.');
    } else if (parent.id) {
      parentIdentifier += '#' + CSS.escape(parent.id);
    }
    
    // Get element position among same-type siblings
    const siblings = Array.from(parent.children);
    const sameTagSiblings = siblings.filter(el => el.tagName.toLowerCase() === tag);
    const index = sameTagSiblings.indexOf(element) + 1;
    
    // Try to get identifying attributes from element
    const attributes = [];
    if (element.type) attributes.push(`[type="${element.type}"]`);
    if (element.role) attributes.push(`[role="${element.role}"]`);
    
    const attrString = attributes.join('');
    
    // Build selector with parent context and nth-of-type
    return `${parentIdentifier} > ${tag}${attrString}:nth-of-type(${index})`;
  }

  /**
   * Generate data attribute selector (last resort)
   * @param {HTMLElement} element
   * @returns {string} Selector
   */
  generateDataAttribute(element) {
    // Last resort: add a data attribute to the element
    const dataId = `pointa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    element.setAttribute('data-pointa-id', dataId);
    return `[data-pointa-id="${dataId}"]`;
  }

  /**
   * Generate position-based selector
   * @param {HTMLElement} element
   * @returns {string} Selector
   */
  generatePosition(element) {
    // Fall back to nth-child with parent context
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      
      // Add parent context for better stability
      const parentClasses = Array.from(parent.classList)
        .filter(cls => !cls.startsWith('pointa-'))
        .filter(cls => this.isStableClass(cls))
        .slice(0, 2);
      
      if (parentClasses.length > 0) {
        const parentSelector = parentClasses.map(cls => CSS.escape(cls)).join('.');
        return `${parent.tagName.toLowerCase()}.${parentSelector} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
      }
      
      return `${element.tagName.toLowerCase()}:nth-child(${index})`;
    }
    
    return element.tagName.toLowerCase();
  }
  
  /**
   * Generate clean selector without pointa- attributes
   * Used for design mode annotations
   * @param {HTMLElement} element
   * @returns {string} Selector
   */
  generateClean(element) {
    // Generate a selector without temporary pointa- classes or data-pointa-id attributes
    const tag = element.tagName.toLowerCase();
    
    // Check for permanent ID (not pointa-generated)
    if (element.id && !element.id.startsWith('pointa-')) {
      return `#${element.id}`;
    }
    
    // Get parent for context-based selectors
    const parent = element.parentElement;
    
    // Prefer class-based selectors
    const cleanClasses = Array.from(element.classList)
      .filter(cls => !cls.startsWith('pointa-'))
      .filter(cls => cls.trim() !== '');
    
    if (cleanClasses.length > 0) {
      // Use classes as selector - but check if it's unique!
      const classSelector = `${tag}.${cleanClasses.join('.')}`;
      if (this.isUnique(classSelector)) {
        return classSelector;
      }
      
      // If not unique, add parent context for specificity
      if (parent && parent.tagName !== 'BODY') {
        const parentClasses = Array.from(parent.classList)
          .filter(cls => !cls.startsWith('pointa-'))
          .slice(0, 2);
        
        if (parentClasses.length > 0) {
          const parentSelector = `${parent.tagName.toLowerCase()}.${parentClasses.join('.')}`;
          const contextSelector = `${parentSelector} > ${classSelector}`;
          if (this.isUnique(contextSelector)) {
            return contextSelector;
          }
        }
      }
      // If still not unique, fall through to nth-child logic below
    }
    
    // Fall back to nth-child selector with parent context
    if (parent) {
      const allSiblings = Array.from(parent.children);
      const targetIndex = allSiblings.indexOf(element) + 1;
      
      const parentSelector = parent.tagName.toLowerCase();
      const parentClasses = Array.from(parent.classList)
        .filter(cls => !cls.startsWith('pointa-'))
        .slice(0, 2);
      const parentPart = parentClasses.length > 0 
        ? `${parentSelector}.${parentClasses.join('.')}` 
        : parentSelector;
      
      // Try with parent context + nth-child
      const nthSelector = `${parentPart} > ${tag}:nth-child(${targetIndex})`;
      if (this.isUnique(nthSelector)) {
        return nthSelector;
      }
      
      // Try with more parent context (grandparent)
      const grandparent = parent.parentElement;
      if (grandparent && grandparent.tagName !== 'BODY') {
        const grandparentTag = grandparent.tagName.toLowerCase();
        const grandparentClasses = Array.from(grandparent.classList)
          .filter(cls => !cls.startsWith('pointa-'))
          .slice(0, 1);
        const grandparentPart = grandparentClasses.length > 0 
          ? `${grandparentTag}.${grandparentClasses.join('.')}` 
          : grandparentTag;
        
        const deepSelector = `${grandparentPart} > ${parentPart} > ${tag}:nth-child(${targetIndex})`;
        if (this.isUnique(deepSelector)) {
          return deepSelector;
        }
      }
    }
    
    // Last resort: use a robust fallback WITHOUT adding temporary attributes
    // CRITICAL: Do NOT call generate() here as it may add data-pointa-id
    console.warn('[generateClean] Could not generate unique clean selector, using robust fallback');
    
    // Try with text content + position for better stability
    if (parent) {
      const allSiblings = Array.from(parent.children);
      const sameTagSiblings = allSiblings.filter(s => s.tagName === element.tagName);
      const indexOfType = sameTagSiblings.indexOf(element) + 1;
      
      // Use nth-of-type which is more stable than nth-child
      const nthTypeSelector = `${tag}:nth-of-type(${indexOfType})`;
      
      // Add parent tag for some context
      const parentTag = parent.tagName.toLowerCase();
      const contextSelector = `${parentTag} > ${nthTypeSelector}`;
      
      // Even if not unique, this is better than data-pointa-id
      // The element finder has fallback logic to handle non-unique selectors
      return contextSelector;
    }
    
    // Absolute last resort: just use tag with nth-of-type(1)
    // This is not unique but at least it's not temporary
    return `${tag}:nth-of-type(1)`;
  }

  /**
   * Check if class name is stable (not generated/temporary)
   * @param {string} className
   * @returns {boolean} True if stable
   */
  isStableClass(className) {
    // Filter out utility classes that might change and framework-specific classes
    const unstablePatterns = [
      /^hover:/, /^focus:/, /^active:/, /^disabled:/, // Tailwind state classes
      /^transition/, /^duration/, /^ease/, // Animation classes
      /^[a-z0-9]{8,}$/, // Hash-like classes (CSS modules, etc.)
      /--/, // CSS custom properties in class names
      /\[.*\]/, // Tailwind arbitrary values
    ];
    
    return !unstablePatterns.some(pattern => pattern.test(className));
  }
  
  /**
   * Check if selector is unique in document
   * @param {string} selector
   * @param {HTMLElement} [targetElement] - Optional element to verify the selector matches
   * @returns {boolean} True if unique
   */
  isUnique(selector, targetElement = null) {
    try {
      const matches = document.querySelectorAll(selector);
      
      // Must have exactly one match
      if (matches.length !== 1) {
        return false;
      }
      
      // If target element provided, verify the selector matches it
      if (targetElement && matches[0] !== targetElement) {
        console.warn('[SelectorGenerator] Selector matches wrong element:', selector);
        return false;
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if class name is valid CSS
   * @param {string} className
   * @returns {boolean} True if valid
   */
  isValidCSSClass(className) {
    // Filter out classes with brackets, parentheses, or other problematic characters
    // Keep only alphanumeric, hyphens, underscores, and basic characters
    return /^[a-zA-Z0-9_-]+$/.test(className);
  }
}

// Create and export singleton instance
window.VibeSelectorGenerator = new SelectorGenerator();


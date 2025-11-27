// Element Finding and Searching Module
// Handles all element location, retrieval, and searching strategies

const VibeElementFinder = {

  /**
   * Find an element by its path descriptor (e.g., "div.container#main")
   * This matches the format created by getElementPath in trackDOMPositionChange
   * ROBUSTNESS FIX: Enhanced to handle ambiguous paths better
   */
  findElementByPath(path) {
    if (!path || path === 'body') {
      return document.body;
    }

    if (path === 'unknown') {
      return null;
    }

    // Try as direct selector first
    try {
      const element = document.querySelector(path);
      if (element) {
        // If unique match, return it
        const allMatches = document.querySelectorAll(path);
        if (allMatches.length === 1) {
          return element;
        }
        // Multiple matches - log warning but continue with more specific search
        console.warn('[findElementByPath] Multiple matches for path:', path, '- attempting more specific search');
      }
    } catch (e) {

      // Invalid selector, continue with manual search
    }
    // Parse the path manually (tag, id, classes)
    const idMatch = path.match(/#([^.]+)/);
    const tagMatch = path.match(/^([a-z0-9-]+)/i);
    const classesMatch = path.match(/\.([^#]+)$/);

    const id = idMatch ? idMatch[1] : null;
    const tag = tagMatch ? tagMatch[1].toLowerCase() : null;
    const classes = classesMatch ? classesMatch[1].split('.').filter((c) => c) : [];

    // Try by ID first (most specific)
    if (id) {
      const byId = document.getElementById(id);
      if (byId) {

        return byId;
      }
    }

    // Try by tag and classes
    if (tag) {
      const selector = classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 1) {
          return elements[0];
        }
        if (elements.length > 1) {
          // Multiple matches - try to narrow down by checking if they match the full path
          console.warn('[findElementByPath] Multiple matches for', selector, `(${elements.length} found) - using first match`);
          // Return first match as best effort, but log for debugging
          return elements[0];
        }
      } catch (e) {
        console.warn('[findElementByPath] Invalid selector:', selector, e);
      }
    }

    return null;
  },

  /**
   * Find an element by annotation selector with multiple fallback strategies
   * IMPORTANT: For position-change annotations, check if element is already marked
   * This prevents re-finding and re-applying position changes on retries
   */
  findElementBySelector(annotation) {
    // PRIORITY 1: Check for persistent annotation ID marker (most reliable)
    if (annotation.id) {
      const markedElement = document.querySelector(`[data-pointa-id="${annotation.id}"]`);
      if (markedElement) {

        return markedElement;
      }
    }

    // PRIORITY 2: Check if this is a design-edit annotation with DOM position changes already applied
    if (annotation.type === 'design-edit' && annotation.css_changes?.dom_position) {
      const alreadyApplied = document.querySelector(`[data-annotation-applied="${annotation.id}"]`);
      if (alreadyApplied) {

        return alreadyApplied;
      }
    }

    // Check if this is a data-pointa-id selector (non-persistent, needs reconstruction)
    const isDataVibeSelectorUsed = annotation.selector && annotation.selector.includes('data-pointa-id');

    // PRIORITY 3: Try the original selector (only if it's not a data-pointa-id)
    if (!isDataVibeSelectorUsed) {
      try {
        const candidates = document.querySelectorAll(annotation.selector);

        // If exactly one match, use it
        if (candidates.length === 1) {
          const element = candidates[0];

          // Mark it for future fast lookup
          element.setAttribute('data-pointa-id', annotation.id);
          return element;
        }

        // If multiple matches, use context to disambiguate
        if (candidates.length > 1 && annotation.element_context) {
          console.warn(`[findElementBySelector] Multiple matches for selector, using context to disambiguate`);
          const element = this.disambiguateMultipleMatches(candidates, annotation.element_context);
          if (element) {
            element.setAttribute('data-pointa-id', annotation.id);
            return element;
          }
        }
      } catch (error) {

        // Selector might be invalid, continue with fallbacks
      }}

    // PRIORITY 4: For data-pointa-id selectors or failed selectors, try to reconstruct using element_context
    if (annotation.element_context) {
      const context = annotation.element_context;

      // Strategy 1: Use parent chain + position to find element
      if (annotation.parent_chain && annotation.parent_chain.length > 0) {
        const element = this.findByParentChainAndContext(annotation);
        if (element) {
          // Mark it for future fast lookup
          element.setAttribute('data-pointa-id', annotation.id);
          return element;
        }
      }

      // Strategy 2: Find by text content (most reliable for text elements)
      if (context.text && context.text.trim().length > 0) {
        const element = this.findByTextContent(context);
        if (element) {
          // Mark it for future fast lookup
          element.setAttribute('data-pointa-id', annotation.id);
          return element;
        }
      }

      // Strategy 3: Find by tag + classes + position
      if (context.tag) {
        const element = this.findByTagClassesAndPosition(context);
        if (element) {
          // Mark it for future fast lookup
          element.setAttribute('data-pointa-id', annotation.id);
          return element;
        }
      }

      // Strategy 4: Find by position as last resort
      if (context.position) {
        const element = this.findByPosition(context);
        if (element) {
          // Mark it for future fast lookup
          element.setAttribute('data-pointa-id', annotation.id);
          return element;
        }
      }
    }

    // Last resort: try the data-pointa-id if nothing else worked
    if (isDataVibeSelectorUsed) {
      const dataIdMatch = annotation.selector.match(/data-pointa-id="([^"]+)"/);
      if (dataIdMatch) {
        const element = document.querySelector(`[data-pointa-id="${dataIdMatch[1]}"]`);
        if (element) {
          // Mark it for future fast lookup
          element.setAttribute('data-pointa-id', annotation.id);
          return element;
        }
      }
    }

    return null;
  },

  /**
   * Disambiguate between multiple elements that match the selector
   * Uses element context to find the most accurate match
   * @param {NodeList|Array} candidates - Array of candidate elements
   * @param {Object} context - Element context from annotation
   * @returns {HTMLElement|null} Best matching element or null
   */
  disambiguateMultipleMatches(candidates, context) {
    const candidateArray = Array.from(candidates);

    // Filter by text content if available (very specific)
    if (context.text && context.text.trim().length > 0) {
      const textMatches = candidateArray.filter((el) => {
        const elText = el.textContent?.trim();
        return elText === context.text;
      });

      if (textMatches.length === 1) return textMatches[0];
      if (textMatches.length > 1) {
        // Use position to narrow down further
        return this.findClosestByPosition(textMatches, context.position);
      }
    }

    // Filter by position if available (stricter tolerance)
    if (context.position) {
      return this.findClosestByPosition(candidateArray, context.position);
    }

    // If no context to disambiguate, return null (don't guess)
    console.warn('[disambiguateMultipleMatches] Cannot disambiguate between matches, returning null');
    return null;
  },

  /**
   * Validate that an element matches the expected signature
   * Used to ensure we found the correct element when using selectors
   * @param {HTMLElement} element - Element to validate
   * @param {Object} signature - Expected element signature {tag, text, classes, id}
   * @returns {boolean} True if element matches signature
   */
  validateElementSignature(element, signature) {
    if (!element || !signature) return false;

    // Check tag name (required)
    if (element.tagName.toLowerCase() !== signature.tag) {
      return false;
    }

    // Check ID if signature has one
    if (signature.id && element.id !== signature.id) {
      return false;
    }

    // Check text content if signature has it (fuzzy match - first 50 chars)
    if (signature.text && signature.text.length > 10) {
      const elementText = element.textContent?.substring(0, 100) || '';
      const signatureText = signature.text.substring(0, 100);
      // Use includes for fuzzy matching (text might have changed slightly)
      if (!elementText.includes(signatureText.substring(0, 50)) &&
      !signatureText.includes(elementText.substring(0, 50))) {
        return false;
      }
    }

    // Check classes - at least 2 classes should match if signature has classes
    if (signature.classes && signature.classes.length > 0) {
      const elementClasses = Array.from(element.classList).filter((c) => !c.startsWith('pointa-'));
      const matchingClasses = signature.classes.filter((cls) => elementClasses.includes(cls));

      // If signature has classes, at least 50% should match (or at least 2 classes)
      const requiredMatches = Math.min(Math.ceil(signature.classes.length / 2), 2);
      if (matchingClasses.length < requiredMatches && signature.classes.length > 1) {
        return false;
      }
    }

    return true;
  },

  /**
   * Find element by walking up the parent chain and matching context
   * Uses parent chain to narrow down search space
   */
  findByParentChainAndContext(annotation) {
    const parentChain = annotation.parent_chain;
    const context = annotation.element_context;

    // Find parent elements that match the parent chain
    let candidateParents = [document.body];

    // Walk up the parent chain from the end (closest to body)
    for (let i = parentChain.length - 1; i >= 0; i--) {
      const parentInfo = parentChain[i];
      const newCandidates = [];

      for (const parent of candidateParents) {
        // Build selector for this parent level
        let parentSelector = parentInfo.tag;
        if (parentInfo.id) {
          parentSelector = `${parentInfo.tag}#${CSS.escape(parentInfo.id)}`;
        } else if (parentInfo.classes && parentInfo.classes.length > 0) {
          const stableClasses = parentInfo.classes.filter((cls) => VibeSelectorGenerator.isStableClass(cls));
          if (stableClasses.length > 0) {
            parentSelector = `${parentInfo.tag}.${stableClasses.map((cls) => CSS.escape(cls)).join('.')}`;
          }
        }

        // Find matching children
        const matches = Array.from(parent.querySelectorAll(parentSelector));
        newCandidates.push(...matches);
      }

      if (newCandidates.length === 0) return null;
      candidateParents = newCandidates;
    }

    // Now search for the target element within these candidate parents
    for (const parent of candidateParents) {
      const children = Array.from(parent.children);
      const candidates = children.filter((el) => {
        // Match tag
        if (el.tagName.toLowerCase() !== context.tag) return false;

        // Match classes if available
        if (context.classes && context.classes.length > 0) {
          const elClasses = Array.from(el.classList);
          const hasMatchingClass = context.classes.some((cls) => elClasses.includes(cls));
          if (!hasMatchingClass) {
            // If element should have classes but doesn't match any, skip it
            return false;
          }
        }

        // Match text if available
        if (context.text && context.text.trim().length > 0) {
          const elText = el.textContent?.trim();
          if (elText !== context.text) return false;
        }

        return true;
      });

      if (candidates.length === 1) {
        return candidates[0];
      }

      // If multiple candidates, use position to disambiguate
      if (candidates.length > 1 && context.position) {
        const bestMatch = this.findClosestByPosition(candidates, context.position);
        if (bestMatch) return bestMatch;
      }
    }

    return null;
  },

  /**
   * Find element by text content (most reliable for text elements)
   */
  findByTextContent(context) {
    if (!context.text || !context.tag) return null;

    const textSanitized = context.text.replace(/[^\w\s]/g, '').trim();
    if (!textSanitized) return null;

    const candidates = Array.from(document.querySelectorAll(context.tag));
    const matches = candidates.filter((el) => {
      const elText = el.textContent?.trim().replace(/[^\w\s]/g, '').trim();
      return elText === textSanitized;
    });

    if (matches.length === 1) return matches[0];

    if (matches.length > 1) {
      // Use classes to narrow down
      if (context.classes && context.classes.length > 0) {
        const bestMatch = matches.find((el) => {
          const elClasses = Array.from(el.classList);
          return context.classes.some((cls) => elClasses.includes(cls));
        });
        if (bestMatch) return bestMatch;
      }

      // Use position to narrow down
      if (context.position) {
        return this.findClosestByPosition(matches, context.position);
      }
    }

    return null;
  },

  /**
   * Find element by tag, classes, and position
   */
  findByTagClassesAndPosition(context) {
    // Try to find by tag and classes
    let selector = context.tag;

    if (context.classes && context.classes.length > 0) {
      const stableClasses = context.classes.filter((cls) => VibeSelectorGenerator.isStableClass(cls));
      if (stableClasses.length > 0) {
        selector = `${context.tag}.${stableClasses.map((cls) => CSS.escape(cls)).join('.')}`;
      }
    }

    try {
      const candidates = Array.from(document.querySelectorAll(selector));

      if (candidates.length === 1) return candidates[0];

      if (candidates.length > 1 && context.position) {
        return this.findClosestByPosition(candidates, context.position);
      }
    } catch (error) {

      // Invalid selector
    }
    return null;
  },

  /**
   * Find element by position as last resort
   */
  findByPosition(context) {
    if (!context.tag || !context.position) return null;

    const candidates = Array.from(document.querySelectorAll(context.tag));
    return this.findClosestByPosition(candidates, context.position);
  },

  /**
   * Find the element closest to the expected position
   * Uses strict tolerance to avoid false matches (30px for exact matches)
   */
  findClosestByPosition(elements, expectedPosition) {
    if (!elements || elements.length === 0) return null;
    if (!expectedPosition) return null;

    let bestMatch = null;
    let bestDistance = Infinity;

    // Strict tolerance - only 30px (previous 100px was too lenient)
    const STRICT_TOLERANCE = 30;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const position = {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY
      };

      // Calculate distance
      const distance = Math.sqrt(
        Math.pow(position.x - expectedPosition.x, 2) +
        Math.pow(position.y - expectedPosition.y, 2)
      );

      // Only consider matches within strict tolerance
      if (distance < STRICT_TOLERANCE && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = el;
      }
    }

    // If no match within strict tolerance, log warning
    if (!bestMatch) {
      console.warn(`[findClosestByPosition] No element found within ${STRICT_TOLERANCE}px of expected position:`, expectedPosition);
    }

    return bestMatch;
  }

};
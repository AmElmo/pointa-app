/**
 * design-mode.js
 * 
 * Handles design mode state, event listeners, and DOM position tracking.
 * Design mode allows users to click elements to edit their styles visually.
 * Includes element dragging/repositioning functionality.
 * 
 * Extracted from content.js as part of Step 9 refactoring.
 */

const PointaDesignMode = {
  /**
   * Start design mode - allows clicking elements to edit styles
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  startDesignMode(pointa) {
    pointa.isDesignMode = true;

    // Add visual indicator for design mode
    document.body.classList.add('pointa-design-mode-active');

    // Set up event listeners for design mode
    this.setupDesignListeners(pointa);

    // Show instruction overlay for design mode
    this.showDesignModeOverlay();
  },

  /**
   * Show instruction overlay for design mode
   */
  showDesignModeOverlay() {
    // Create overlay with instructions for design mode
    const overlay = document.createElement('div');
    overlay.className = 'pointa-inspection-overlay pointa-design-overlay';
    overlay.innerHTML = `
      <div class="pointa-inspection-content">
        <p>🎨 Design Mode: Click any element to edit its styles</p>
        <p>Use the Move button to drag elements to new positions</p>
        <p>Press ESC or click the extension to exit</p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Auto-hide after 4 seconds (increased for extra line)
    setTimeout(() => {
      overlay.classList.add('pointa-inspection-overlay-fade');
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove();
        }
      }, 300);
    }, 4000);
  },

  /**
   * Stop design mode and clean up
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  stopDesignMode(pointa) {
    pointa.isDesignMode = false;

    // Close any open design editor
    this.closeDesignEditor(pointa);

    // Remove visual indicators
    document.body.classList.remove('pointa-design-mode-active');

    // Remove design mode overlay if still present
    const overlay = document.querySelector('.pointa-design-overlay');
    if (overlay) {
      overlay.remove();
    }

    // Remove event listeners
    this.removeDesignListeners(pointa);

    // Clear highlights
    PointaAnnotationMode.clearHighlights();
  },

  /**
   * Set up event listeners for design mode
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  setupDesignListeners(pointa) {
    // Store bound functions for proper removal
    pointa.boundDesignMouseOver = this.handleDesignMouseOver.bind(this, pointa);
    pointa.boundDesignMouseOut = this.handleDesignMouseOut.bind(this, pointa);
    pointa.boundDesignClick = this.handleDesignClick.bind(this, pointa);
    pointa.boundDesignEscape = this.handleDesignEscape.bind(this, pointa);

    // Mouse events for element selection in design mode
    document.addEventListener('mouseover', pointa.boundDesignMouseOver, true);
    document.addEventListener('mouseout', pointa.boundDesignMouseOut, true);
    document.addEventListener('click', pointa.boundDesignClick, true);
    document.addEventListener('keydown', pointa.boundDesignEscape, true);
  },

  /**
   * Remove event listeners for design mode
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  removeDesignListeners(pointa) {
    if (pointa.boundDesignMouseOver) {
      document.removeEventListener('mouseover', pointa.boundDesignMouseOver, true);
    }
    if (pointa.boundDesignMouseOut) {
      document.removeEventListener('mouseout', pointa.boundDesignMouseOut, true);
    }
    if (pointa.boundDesignClick) {
      document.removeEventListener('click', pointa.boundDesignClick, true);
    }
    if (pointa.boundDesignEscape) {
      document.removeEventListener('keydown', pointa.boundDesignEscape, true);
    }
  },

  /**
   * Handle mouse over event in design mode
   * @param {Object} pointa - Reference to the main Pointa instance
   * @param {MouseEvent} e - Mouse event
   */
  handleDesignMouseOver(pointa, e) {
    if (!pointa.isDesignMode) return;

    // Skip our own UI elements (design editor, badges, overlays, etc.)
    if (e.target.closest('.pointa-design-editor') ||
    e.target.closest('.pointa-inspection-overlay') ||
    e.target.classList.contains('pointa-highlight') ||
    e.target.classList.contains('pointa-badge') ||
    e.target.classList.contains('pointa-design-highlight') ||
    e.target.closest('.pointa-badge')) {
      return;
    }

    e.stopPropagation();

    // Store hovered element
    pointa.hoveredElement = e.target;

    // Add highlight class (different color for design mode)
    e.target.classList.add('pointa-design-highlight');
  },

  /**
   * Handle mouse out event in design mode
   * @param {Object} pointa - Reference to the main Pointa instance
   * @param {MouseEvent} e - Mouse event
   */
  handleDesignMouseOut(pointa, e) {
    if (!pointa.isDesignMode) return;

    // Skip our own UI elements
    if (e.target.closest('.pointa-design-editor') ||
    e.target.closest('.pointa-inspection-overlay') ||
    e.target.classList.contains('pointa-badge') ||
    e.target.closest('.pointa-badge')) {
      return;
    }

    e.stopPropagation();

    // Remove highlight
    e.target.classList.remove('pointa-design-highlight');
  },

  /**
   * Handle click event in design mode
   * @param {Object} pointa - Reference to the main Pointa instance
   * @param {MouseEvent} e - Mouse event
   */
  handleDesignClick(pointa, e) {
    if (!pointa.isDesignMode) return;

    // Check if click is on extension UI elements (sidebar, modals, overlays, etc.)
    // If so, exit design mode and allow normal click behavior
    if (e.target.closest('#pointa-sidebar') ||
    e.target.closest('.pointa-inspection-overlay') ||
    e.target.closest('.pointa-comment-modal')) {
      // Exit design mode when clicking extension UI
      this.stopDesignMode(pointa);
      // Don't prevent default - allow the normal click to proceed
      return;
    }

    // Ignore our own UI elements (but keep design mode active)
    if (e.target.closest('.pointa-design-editor') ||
    e.target.classList.contains('pointa-badge') ||
    e.target.closest('.pointa-badge')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;

    // Remove highlight
    element.classList.remove('pointa-design-highlight');

    // Show design editor for this element (delegates to main instance)
    pointa.showDesignEditor(element);
  },

  /**
   * Handle escape key in design mode
   * @param {Object} pointa - Reference to the main Pointa instance
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleDesignEscape(pointa, e) {
    if (e.key === 'Escape') {
      // Always exit design mode when ESC is pressed (matching annotation mode behavior)
      // This will also close any open design editor
      this.stopDesignMode(pointa);
    }
  },

  /**
   * Close the design editor
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  closeDesignEditor(pointa) {
    // Unregister modal with central manager
    if (window.PointaModalManager) {
      window.PointaModalManager.unregisterModal('design-editor');
    }

    if (pointa.currentDesignEditor) {
      // Clean up drag listeners if they exist
      if (pointa.currentDesignEditor._dragCleanup) {
        pointa.currentDesignEditor._dragCleanup();
      }
      // Clean up ESC key handler if it exists
      if (pointa.currentDesignEditor._escHandler) {
        document.removeEventListener('keydown', pointa.currentDesignEditor._escHandler);
      }
      pointa.currentDesignEditor.remove();
      pointa.currentDesignEditor = null;
    }

    // Clean up element move mode if active
    if (pointa.currentEditingElement && pointa.currentEditingElement._moveCleanup) {
      this.disableElementDrag(pointa.currentEditingElement);
    }

    // Remove highlights from all affected elements
    document.querySelectorAll('.pointa-design-editing').forEach((el) => {
      el.classList.remove('pointa-design-editing');
    });

    pointa.currentEditingElement = null;
    pointa.pendingCSSChanges = {};
    pointa.componentInfo = null;
    pointa.designEditScope = 'instance';
    pointa.affectedElements = [];

    // Clear original styles
    pointa.originalStyles.clear();
  },

  /**
   * Enable element dragging for DOM repositioning
   * @param {HTMLElement} element - Element to make draggable
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  enableElementDrag(element, pointa) {
    // Store original DOM position for reverting
    if (!pointa.originalStyles.has(element)) {
      pointa.originalStyles.set(element, {});
    }

    const originalStylesObj = pointa.originalStyles.get(element);
    originalStylesObj.originalParent = element.parentElement;

    // IMPORTANT: Skip badges when saving nextSibling
    let nextSib = element.nextElementSibling;
    while (nextSib && nextSib.classList.contains('pointa-badge')) {
      nextSib = nextSib.nextElementSibling;
    }
    originalStylesObj.originalNextSibling = nextSib;

    // IMPORTANT: Calculate index excluding annotation badges to match apply/revert logic
    const childrenWithoutBadges = Array.from(element.parentElement.children).filter((child) =>
    !child.classList.contains('pointa-badge')
    );
    originalStylesObj.originalIndex = childrenWithoutBadges.indexOf(element);

    // Add visual indicator
    element.classList.add('pointa-element-moveable');

    let isDragging = false;
    let lastDropTarget = null;

    const findDropTarget = (x, y) => {
      // Get element under cursor
      const elementUnder = document.elementFromPoint(x, y);

      if (!elementUnder) return null;

      // Don't drop into our own UI elements
      if (elementUnder.closest('.pointa-design-editor') ||
      elementUnder.closest('.pointa-badge')) {
        return null;
      }

      // Skip if hovering over the dragged element itself
      if (elementUnder === element || element.contains(elementUnder)) {
        return null;
      }

      // Find the closest valid drop target (any element on the page)
      let target = elementUnder;

      // Walk up to find a suitable container or sibling
      while (target && target !== document.body) {
        // Check if this element can accept children (is a container)
        const computedStyle = window.getComputedStyle(target);
        const isContainer = computedStyle.display === 'flex' ||
        computedStyle.display === 'grid' ||
        computedStyle.display === 'block' ||
        target.tagName === 'DIV' ||
        target.tagName === 'SECTION' ||
        target.tagName === 'MAIN' ||
        target.tagName === 'ARTICLE';

        if (isContainer && target !== element) {
          // Determine if we should insert before/after this element or inside it
          const rect = target.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          if (target.children.length > 0 && target !== document.body) {
            // Container has children - try to insert between them
            const children = Array.from(target.children).filter((child) =>
            child !== element &&
            !child.classList.contains('pointa-badge')
            );

            for (let i = 0; i < children.length; i++) {
              const childRect = children[i].getBoundingClientRect();
              if (y < childRect.top + childRect.height / 2) {
                // Insert before this child
                return {
                  parent: target,
                  beforeElement: children[i],
                  description: `Insert into ${target.tagName.toLowerCase()} before child ${i}`
                };
              }
            }

            // Insert as last child
            return {
              parent: target,
              beforeElement: null,
              description: `Insert as last child of ${target.tagName.toLowerCase()}`
            };
          } else if (target.parentElement) {
            // Empty container or leaf element - insert before/after it
            if (y < midY) {
              return {
                parent: target.parentElement,
                beforeElement: target,
                description: `Insert before ${target.tagName.toLowerCase()}`
              };
            } else {
              return {
                parent: target.parentElement,
                beforeElement: target.nextElementSibling,
                description: `Insert after ${target.tagName.toLowerCase()}`
              };
            }
          }
        }

        target = target.parentElement;
      }

      return null;
    };

    const applyDropPosition = (dropTarget) => {
      if (!dropTarget) return;

      const { parent, beforeElement } = dropTarget;

      // Actually move the element in the DOM for real-time preview
      if (beforeElement) {
        parent.insertBefore(element, beforeElement);
      } else {
        parent.appendChild(element);
      }
    };

    const onMouseDown = (e) => {
      // Only start drag if clicking directly on the element
      if (e.target !== element && !e.shiftKey) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      isDragging = true;

      // Add visual indicator that we're dragging
      element.classList.add('pointa-element-dragging');
      element.style.transition = 'opacity 0.1s ease';

      // Store the current position for tracking changes
      lastDropTarget = {
        parent: element.parentElement,
        beforeElement: element.nextElementSibling,
        description: 'Original position'
      };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();
      e.stopPropagation();

      // Find where we would drop based on cursor position
      const dropTarget = findDropTarget(e.clientX, e.clientY);

      // Only move if we found a valid target and it's different from current position
      if (dropTarget && (
      dropTarget.parent !== element.parentElement ||
      dropTarget.beforeElement !== element.nextElementSibling)) {

        // Apply the position change immediately for real-time feedback
        applyDropPosition(dropTarget);
        lastDropTarget = dropTarget;
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;

        // Element is already in its final position from real-time dragging
        // Just track the position change for saving
        this.trackDOMPositionChange(element, originalStylesObj, pointa);

        // Restore element appearance
        element.style.transition = '';
        element.classList.remove('pointa-element-dragging');
      }
    };

    // Set cursor style
    element.style.cursor = 'grab';

    // Add event listeners
    element.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Store cleanup function
    element._moveCleanup = () => {
      element.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  },

  /**
   * Disable element dragging
   * @param {HTMLElement} element - Element to stop being draggable
   */
  disableElementDrag(element) {
    // Clean up event listeners
    if (element._moveCleanup) {
      element._moveCleanup();
      delete element._moveCleanup;
    }

    // Remove visual indicators
    element.classList.remove('pointa-element-moveable');
    element.classList.remove('pointa-element-dragging');
    element.style.cursor = '';
  },

  /**
   * Revert a DOM position change
   * @param {HTMLElement} element - Element to revert
   * @param {Object} domPositionData - Position data with old/new positions
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  revertDOMPositionChange(element, domPositionData, pointa) {
    // Revert a DOM position change by moving element back to its original position
    const { old: oldPosition } = domPositionData;

    if (!oldPosition) {
      console.warn('[Revert DOM Position] No old position data to revert to');
      return;
    }

    // Get current state for comparison
    const currentParent = element.parentElement;
    const currentChildren = Array.from(currentParent.children).filter((c) => !c.classList.contains('pointa-badge'));
    const currentIndex = currentChildren.indexOf(element);

    // STEP 1: Find the original parent (or use current if same)
    let originalParent = currentParent;

    if (oldPosition.parent && oldPosition.parent !== 'body') {
      const foundParent = VibeElementFinder.findElementByPath(oldPosition.parent);
      if (foundParent) {
        originalParent = foundParent;
      } else {
        console.warn('[Revert DOM Position] Could not find parent, using current:', oldPosition.parent);
      }
    }

    // STEP 2: Try sibling-based positioning first (most reliable)
    if (oldPosition.nextSibling && oldPosition.nextSibling.selector) {
      const originalNextSib = VibeElementFinder.findElementByPath(oldPosition.nextSibling.selector);

      if (originalNextSib && originalNextSib.parentElement === originalParent) {
        originalParent.insertBefore(element, originalNextSib);
        return;
      }
    }

    // STEP 3: Fall back to index-based positioning
    const originalIndex = oldPosition.index;

    // Get all children excluding badges
    const siblings = Array.from(originalParent.children).filter((child) =>
    !child.classList.contains('pointa-badge')
    );

    // Check if we're already at the target position
    if (originalParent === currentParent && currentIndex === originalIndex) {
      return;
    }

    // CRITICAL: When moving within same parent, account for element removal during insertBefore
    const movingWithinSameParent = originalParent === currentParent;

    // Insert at original index
    if (originalIndex >= 0 && originalIndex < siblings.length) {
      let targetSibling = siblings[originalIndex];

      if (targetSibling === element) {
        return;
      }

      // FIX: When moving forward in same parent, we need the NEXT sibling
      // Because insertBefore removes the element first, shifting indices
      if (movingWithinSameParent && currentIndex < originalIndex) {
        // Use the element AFTER our target position
        const adjustedIndex = originalIndex + 1;
        if (adjustedIndex < siblings.length) {
          targetSibling = siblings[adjustedIndex];
        } else {
          // Target is last position, append to end
          originalParent.appendChild(element);
          return;
        }
      }

      originalParent.insertBefore(element, targetSibling);
    } else if (originalIndex === -1 || originalIndex >= siblings.length) {
      // Append to end
      originalParent.appendChild(element);
    } else {
      console.error('[Revert DOM Position] ❌ Invalid original index:', originalIndex);
    }
  },

  /**
   * Apply a DOM position change
   * @param {HTMLElement} element - Element to move
   * @param {Object} domPositionData - Position data with old/new positions
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  applyDOMPositionChange(element, domPositionData, pointa) {
    // SIMPLIFIED: Just move the element like we do during dragging
    const { new: newPosition } = domPositionData;




    if (!newPosition) {
      console.warn('[Apply DOM Position] No new position data');
      return;
    }

    // Step 1: Find target parent
    let targetParent = element.parentElement; // Default to current
    if (newPosition.parent) {
      const found = VibeElementFinder.findElementByPath(newPosition.parent);
      if (found) {
        targetParent = found;
      } else {
        console.warn('[Apply DOM Position] Could not find target parent, using current');
      }
    }

    // Step 2: Find target sibling (if we have one) or use index
    let targetSibling = null;

    // Try sibling-based first (most reliable)
    if (newPosition.nextSibling && newPosition.nextSibling.selector) {
      targetSibling = VibeElementFinder.findElementByPath(newPosition.nextSibling.selector);

      // Fallback: try by ID
      if (!targetSibling && newPosition.nextSibling.id) {
        targetSibling = document.getElementById(newPosition.nextSibling.id);
      }

      // Validate sibling is in target parent
      if (targetSibling && targetSibling.parentElement !== targetParent) {
        console.warn('[Apply DOM Position] Sibling found but wrong parent, ignoring');
        targetSibling = null;
      }
    }

    // Step 3: Move the element (same logic as real-time dragging)
    if (targetSibling) {
      // Insert before sibling

      targetParent.insertBefore(element, targetSibling);
    } else if (newPosition.index !== undefined && newPosition.index >= 0) {
      // Use index - get children excluding badges
      const siblings = Array.from(targetParent.children).filter((c) =>
      !c.classList.contains('pointa-badge') && c !== element
      );

      if (newPosition.index < siblings.length) {
        // Insert before the sibling at target index

        targetParent.insertBefore(element, siblings[newPosition.index]);
      } else {
        // Append to end

        targetParent.appendChild(element);
      }
    } else {
      // No sibling, no index - append to end

      targetParent.appendChild(element);
    }


  },

  /**
   * Track DOM position changes for annotation
   * @param {HTMLElement} element - Element that was moved
   * @param {Object} originalStylesObj - Original position data
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  trackDOMPositionChange(element, originalStylesObj, pointa) {
    // Track the DOM structure change for the annotation
    const currentParent = element.parentElement;

    // IMPORTANT: Calculate index excluding annotation badges to match apply/revert logic
    const childrenWithoutBadges = Array.from(currentParent.children).filter((child) =>
    !child.classList.contains('pointa-badge')
    );
    const currentIndex = childrenWithoutBadges.indexOf(element);

    // IMPORTANT: Skip badges when saving nextSibling
    let currentNextSibling = element.nextElementSibling;
    while (currentNextSibling && currentNextSibling.classList.contains('pointa-badge')) {
      currentNextSibling = currentNextSibling.nextElementSibling;
    }

    // Get selector paths for original and new positions
    const getElementPath = (el) => {
      // Handle null, undefined, body, or non-element nodes (like text nodes)
      if (!el || el === document.body || !el.tagName) {
        return el === document.body ? 'body' : 'unknown';
      }

      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';

      // Handle className safely (can be string, SVGAnimatedString, or undefined)
      let classes = '';
      if (el.className) {
        const classString = typeof el.className === 'string' ?
        el.className :
        el.className.baseVal || ''; // For SVG elements

        if (classString) {
          const filteredClasses = classString.split(' ').
          filter((c) => c && !c.startsWith('pointa-')).
          join('.');
          classes = filteredClasses ? `.${filteredClasses}` : '';
        }
      }

      return `${tag}${id}${classes}`;
    };

    // Enhanced sibling info with more identifying data for robustness
    const getSiblingInfo = (el) => {
      if (!el || !el.tagName) return null; // Handle text nodes or non-element nodes

      // Get stable identifiers if available
      const siblingId = el.id || null;
      const siblingClasses = el.className ?
      (typeof el.className === 'string' ? el.className : el.className.baseVal || '').
      split(' ').
      filter((c) => c && !c.startsWith('pointa-')).
      slice(0, 3) // Top 3 classes for specificity
      : [];

      return {
        selector: getElementPath(el),
        tagName: el.tagName.toLowerCase(),
        text: el.textContent?.substring(0, 50) || '',
        id: siblingId,
        classes: siblingClasses
      };
    };

    // Check if position actually changed
    const positionChanged =
    originalStylesObj.originalParent !== currentParent ||
    originalStylesObj.originalIndex !== currentIndex;

    if (positionChanged) {
      // Store in pending changes with a special "dom_position" key
      pointa.pendingCSSChanges.dom_position = {
        old: {
          parent: getElementPath(originalStylesObj.originalParent),
          index: originalStylesObj.originalIndex,
          nextSibling: getSiblingInfo(originalStylesObj.originalNextSibling)
        },
        new: {
          parent: getElementPath(currentParent),
          index: currentIndex,
          nextSibling: getSiblingInfo(currentNextSibling)
        },
        description: `Move from index ${originalStylesObj.originalIndex} to ${currentIndex}`
      };
    } else {
      // Position reverted to original, remove from pending changes
      delete pointa.pendingCSSChanges.dom_position;
    }
  },

  /**
   * Toggle move mode on/off for element drag-to-reposition
   * @param {HTMLElement} element - Element to toggle move mode for
   * @param {HTMLElement} moveBtn - Move button element
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  toggleMoveMode(element, moveBtn, pointa) {
    // Toggle move mode on/off
    const isActive = moveBtn.classList.contains('active');

    if (isActive) {
      // Disable move mode
      moveBtn.classList.remove('active');
      this.disableElementDrag(element);
    } else {
      // Enable move mode
      moveBtn.classList.add('active');

      // CRITICAL: If editing an existing annotation with position change,
      // revert to original position BEFORE enabling drag (so user can re-drag from original)
      const originalStylesObj = pointa.originalStyles.get(element);
      if (originalStylesObj?.savedDomPosition) {
        this.revertDOMPositionChange(element, originalStylesObj.savedDomPosition, pointa);
        // Clear the saved position data so we don't revert again
        delete originalStylesObj.savedDomPosition;
      }

      this.enableElementDrag(element, pointa);
    }
  },

  /**
   * Revert CSS changes from a design-edit annotation
   * Respects the scope: instance, page, or app
   * @param {HTMLElement} element - Element to revert changes on
   * @param {Object} annotation - Annotation with css_changes to revert
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  revertDesignChanges(element, annotation, pointa) {
    const cssChanges = annotation.css_changes || annotation; // Support both annotation object and direct cssChanges
    if (!cssChanges) return;

    // If annotation is passed with scope info, respect it
    const scope = annotation.scope?.edit_scope || 'instance';

    // Determine which elements to revert changes from
    let elementsToRevert = [element];

    if (scope === 'app' || scope === 'page') {
      // For app/page scope, find all similar elements using the saved selector
      const similarSelector = annotation.scope?.similar_element_selector;
      if (similarSelector) {
        try {
          elementsToRevert = Array.from(document.querySelectorAll(similarSelector));
        } catch (e) {
          console.warn('Failed to query similar elements for revert:', e);
          elementsToRevert = [element];
        }
      }
    }

    // Revert CSS changes for each element
    elementsToRevert.forEach((el) => {
      Object.entries(cssChanges).forEach(([property, change]) => {
        if (property === 'dom_position') {
          // Revert DOM position changes
          this.revertDOMPositionChange(el, change, pointa);
        } else if (property === 'textContent') {
          // Revert text content
          if (change.old !== undefined) {
            el.textContent = change.old;
          }
        } else {
          // Revert CSS property
          if (change.old !== undefined) {
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
            el.style.setProperty(cssProperty, change.old, 'important');
          }
        }
      });

      // Clear the annotation marker
      el.removeAttribute('data-annotation-applied');
    });
  },

  /**
   * Apply CSS changes from a design-edit annotation
   * Respects the scope: instance, page, or app
   * @param {HTMLElement} element - Element to apply changes to
   * @param {Object} annotation - Annotation with css_changes to apply
   * @param {Object} pointa - Reference to the main Pointa instance
   */
  applyDesignChanges(element, annotation, pointa) {
    const cssChanges = annotation.css_changes;
    if (!cssChanges) {
      console.warn('[DesignMode] No CSS changes to apply for annotation:', annotation.id);
      return;
    }

    // If annotation is passed with scope info, respect it
    const scope = annotation.scope?.edit_scope || 'instance';








    // Determine which elements to apply changes to
    let elementsToApply = [element];

    if (scope === 'app' || scope === 'page') {
      // For app/page scope, find all similar elements using the saved selector
      const similarSelector = annotation.scope?.similar_element_selector;
      if (similarSelector) {
        try {
          elementsToApply = Array.from(document.querySelectorAll(similarSelector));

        } catch (e) {
          console.warn('[DesignMode] Failed to query similar elements:', e);
          elementsToApply = [element];
        }
      }
    }

    // Check if already applied - but only if ALL elements have the marker
    const alreadyApplied = elementsToApply.every((el) =>
    el.getAttribute('data-annotation-applied') === annotation.id
    );

    if (alreadyApplied) {

      return;
    }

    // Apply CSS changes to each element
    let appliedCount = 0;
    elementsToApply.forEach((el, index) => {
      // Skip if this specific element already has the annotation applied
      const alreadyApplied = el.getAttribute('data-annotation-applied');
      if (alreadyApplied === annotation.id) {

        return;
      }



      Object.entries(cssChanges).forEach(([property, change]) => {


        if (property === 'dom_position') {
          // Apply DOM position changes

          this.applyDOMPositionChange(el, change, pointa);
        } else if (property === 'textContent') {
          // Apply text content change
          if (change.new !== undefined) {


            el.textContent = change.new;

          } else {
            console.warn(`[DesignMode] - textContent change.new is undefined!`);
          }
        } else if (property === 'opacity') {
          // Special handling for opacity (stored as 0-100 from slider, needs to be 0-1 for CSS)
          if (change.new !== undefined) {
            const cssProperty = 'opacity';
            const opacityValue = (parseFloat(change.new) / 100).toString();

            el.style.setProperty(cssProperty, opacityValue, 'important');
          }
        } else {
          // Apply CSS property
          if (change.new !== undefined) {
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();

            el.style.setProperty(cssProperty, change.new, 'important');
          }
        }
      });

      // Mark element as having this annotation applied
      el.setAttribute('data-annotation-applied', annotation.id);

      appliedCount++;
    });



  },

  /**
   * Show success message overlay
   * @param {string} message - Message to display
   */
  showSuccessMessage(message) {
    const overlay = document.createElement('div');
    overlay.className = 'pointa-inspection-overlay';
    overlay.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());
    overlay.innerHTML = `
      <div class="pointa-inspection-content">
        <p>✅ ${message}</p>
      </div>
    `;

    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('pointa-inspection-overlay-fade');
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove();
        }
      }, 300);
    }, 2000);
  }
};
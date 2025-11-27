// Badge Manager Module
// Handles annotation badge display, positioning, and collision detection

class VibeBadgeManager {
  constructor(pointa) {
    this.pointa = pointa;
    this.badgePositions = new Map(); // Track badge positions for collision detection
    this.showAnnotationsCallCount = 0; // Track calls to detect infinite loops
    this.hideBadges = false; // Flag to prevent badges from showing during bug report mode
  }

  /**
   * Display all existing annotations as badges on the page
   * @returns {number} Count of annotations found and displayed
   */
  showExistingAnnotations() {
    // Don't show badges if we're in bug report mode
    if (this.hideBadges) {

      return 0;
    }

    // Add a counter to detect infinite loops
    this.showAnnotationsCallCount++;

    if (this.showAnnotationsCallCount > 10) {
      console.error('INFINITE LOOP DETECTED - showExistingAnnotations called', this.showAnnotationsCallCount, 'times. Aborting.');
      return 0;
    }

    // Clear existing badges and their cleanup functions
    this.clearAllBadges();

    let foundCount = 0;
    let notFoundCount = 0;
    const notFoundAnnotations = [];

    // Sort annotations by creation date and filter out done annotations
    const sortedAnnotations = [...this.pointa.annotations].
    filter((a) => a.status !== 'done') // Only show pending and in-review annotations
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Add badges for existing annotations with index numbers
    sortedAnnotations.forEach((annotation, index) => {
      try {






        let element = this.pointa.findElementBySelector(annotation);


        if (element) {

          // If the annotation was using a data-pointa-id selector (non-persistent),
          // regenerate a better selector and update the annotation
          if (annotation.selector && annotation.selector.includes('data-pointa-id')) {

            const newSelector = VibeSelectorGenerator.generate(element);
            if (newSelector && !newSelector.includes('data-pointa-id')) {
              // Update the annotation with the new selector
              annotation.selector = newSelector;
              // Save the updated annotation asynchronously
              this.pointa.updateAnnotationInStorage(annotation).catch((err) => {
                console.warn('Failed to update annotation selector:', err);
              });
            }
          }

          // Apply CSS changes if this is a design-edit annotation
          if (annotation.type === 'design-edit' && annotation.css_changes) {

            // For app/page scope, if the similar_element_selector has data-pointa-id, regenerate it
            const scope = annotation.scope?.edit_scope;
            if ((scope === 'app' || scope === 'page') &&
            annotation.scope?.similar_element_selector?.includes('data-pointa-id')) {


              // Recalculate scope to get a proper persistent selector
              const scopeInfo = this.pointa.calculateScopeOptions(element);
              annotation.scope.similar_element_selector = scopeInfo.similarElementSelector;

              if (scope === 'page') {
                annotation.scope.affected_elements_count = scopeInfo.siblingInfo?.count || scopeInfo.similarCount;
              } else {
                annotation.scope.affected_elements_count = scopeInfo.similarCount;
              }

              // Save the updated annotation
              this.pointa.updateAnnotationInStorage(annotation).catch((err) => {
                console.warn('Failed to update annotation similar_element_selector:', err);
              });
            }

            // CRITICAL FIX: For position changes, ALWAYS attempt to apply
            // The idempotency check inside applyDOMPositionChange will handle duplicates
            const hasPositionChange = annotation.css_changes.dom_position !== undefined;
            const alreadyApplied = element.getAttribute('data-annotation-applied');

            if (hasPositionChange) {
              // For position changes, always apply (even if marker exists)
              // This ensures position is applied on reload

              this.pointa.applyDesignChanges(element, annotation);
            } else if (alreadyApplied === annotation.id) {


            } else {
              // Apply changes (applyDesignChanges will mark the element at the end)
              this.pointa.applyDesignChanges(element, annotation);
            }
          }

          this.addAnnotationBadge(element, annotation, index + 1);
          foundCount++;
        } else {
          // BUGFIX: Track annotations that can't be found on the page
          notFoundCount++;
          notFoundAnnotations.push({
            id: annotation.id,
            selector: annotation.selector,
            comment: (annotation.comment || annotation.changes_summary || '').substring(0, 50)
          });
        }
      } catch (error) {
        console.warn(`Error with annotation ${annotation.id}:`, error);
        notFoundCount++;
      }
    });

    // Log information about missing annotations
    if (notFoundCount > 0) {
      console.warn(`${notFoundCount} annotation(s) exist in storage but cannot be found on the page.`);
      console.warn('This usually happens when the page structure has changed.');
      console.warn('Missing annotations:', notFoundAnnotations);
    }

    // CRITICAL: Log the final count so we can debug display issues







    // Reset counter after successful completion
    setTimeout(() => {
      this.showAnnotationsCallCount = 0;
    }, 1000);

    return foundCount;
  }

  /**
   * Remove all annotation badges from the page
   */
  clearAllBadges() {
    const existingBadges = document.querySelectorAll('.pointa-badge');

    // Clear badges from both elements and body
    existingBadges.forEach((badge) => {
      // Skip badges that are currently animating
      if (badge.dataset.animating === 'true') {
        return; // Keep this badge, it's animating
      }

      // Call cleanup function if it exists (for badges positioned in body)
      if (badge.cleanup) {
        badge.cleanup();
      } else {
        badge.remove();
      }
    });

    // Clear position tracking map as safety measure
    this.badgePositions.clear();
  }

  /**
   * Add an annotation badge to an element
   * @param {HTMLElement} element - The target element
   * @param {Object} annotation - The annotation data
   * @param {number} index - The display index (1-based)
   */
  addAnnotationBadge(element, annotation, index) {
    // Remove existing badge if any
    const existingBadge = element.querySelector('.pointa-badge');
    if (existingBadge) {
      // Use cleanup function to properly remove badge and tracking
      if (existingBadge.cleanup) {
        existingBadge.cleanup();
      } else {
        existingBadge.remove();
      }
    }

    // Create badge - Figma-style icon (no text content, icon comes from CSS ::before)
    const badge = document.createElement('div');
    badge.className = 'pointa-badge';
    badge.setAttribute('data-annotation-id', annotation.id);
    // Add type attribute for design-edit badges (different styling)
    if (annotation.type === 'design-edit') {
      badge.setAttribute('data-type', 'design-edit');
    }
    // No title to avoid default browser tooltip interfering

    // Add hover handlers to highlight element (Figma-style)
    let hoverHighlightActive = false;

    badge.addEventListener('mouseenter', () => {
      // Only add hover highlight if widget is not open for this element
      if (!this.pointa.currentCommentWidget || this.pointa.currentCommentElement !== element) {
        element.classList.add('pointa-highlight');
        hoverHighlightActive = true;
      }
    });

    badge.addEventListener('mouseleave', () => {
      // Only remove highlight if it was added by hover (not by click/edit mode)
      if (hoverHighlightActive && (!this.pointa.currentCommentWidget || this.pointa.currentCommentElement !== element)) {
        element.classList.remove('pointa-highlight');
        hoverHighlightActive = false;
      }
    });

    // Add click handler to open inline widget with existing annotation
    badge.addEventListener('click', async (e) => {
      e.stopPropagation();

      // BULLETPROOF HOVER STATE CLEARING:
      // Step 1: Clear element highlight immediately
      if (hoverHighlightActive) {
        element.classList.remove('pointa-highlight');
        hoverHighlightActive = false;
      }

      // Step 2: Aggressively disable hover effects on badge
      // This class sets pointer-events: none which kills the :hover pseudo-class
      badge.classList.add('widget-active');

      // Step 3: Force immediate style recalculation to apply the class
      // This makes the browser immediately recognize the new styles
      window.getComputedStyle(badge).transform;

      // Step 4: Force a reflow to ensure hover state is cleared
      badge.offsetHeight;

      // Get the latest annotation from the array to ensure we have the updated data
      const annotationId = annotation.id;
      const latestAnnotation = this.pointa.annotations.find((a) => a.id === annotationId) || annotation;

      // Check if this is a design-edit annotation
      if (latestAnnotation.type === 'design-edit') {
        // If it has comment text (hybrid annotation), default to comment widget
        // User can switch to Design tab from there
        if (latestAnnotation.comment || latestAnnotation.messages) {
          // Hybrid annotation - show comment widget (has Design tab for switching)
          this.pointa.tempDisableAnnotationMode();
          const context = await this.pointa.generateElementContext(element);
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.pointa.showInlineCommentWidget(element, context, latestAnnotation, badge);
            });
          });
        } else {
          // Pure design annotation (no text) - open design editor directly
          this.pointa.showDesignEditorForEdit(element, latestAnnotation);
        }
      } else {
        // Regular text annotation - show comment widget
        // Temporarily disable annotation mode while widget is open
        this.pointa.tempDisableAnnotationMode();

        // Generate fresh element context
        const context = await this.pointa.generateElementContext(element);

        // Scroll element into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Use requestAnimationFrame to ensure next frame for stable positioning
        // This waits for the browser to finish any pending style/layout updates
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Double RAF ensures we're past any transition frames
            // Get final badge position after all styles have settled
            const finalBadgeRect = badge.getBoundingClientRect();

            // Show inline widget in edit mode with latest annotation data
            // Widget will be positioned relative to badge (not element)
            this.pointa.showInlineCommentWidget(element, context, latestAnnotation, badge);
          });
        });
      }
    });

    // Create tooltip container with text and action buttons
    const tooltip = document.createElement('span');
    tooltip.className = 'pointa-pin-tooltip';

    const tooltipText = document.createElement('span');
    tooltipText.className = 'pointa-tooltip-text';
    tooltipText.textContent = annotation.comment || annotation.changes_summary || 'Design changes';

    // Copy button - always shown
    const copyBtn = document.createElement('button');
    copyBtn.className = 'pointa-tooltip-copy';
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
    copyBtn.title = 'Copy reference to clipboard';
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = PointaUtils.formatAnnotationForClipboard(annotation);
      await PointaUtils.copyToClipboard(text, 'Annotation reference copied! Paste into your AI coding tool.');
    });

    // Show different action button based on status
    const actionBtn = document.createElement('button');
    if (annotation.status === 'in-review') {
      // AI has worked on it - show checkmark to mark as done
      actionBtn.className = 'pointa-tooltip-checkmark';
      actionBtn.innerHTML = '✓';
      actionBtn.title = 'Mark as done';
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.markAnnotationAsDone(annotation.id, badge);
      });
    } else {
      // Pending annotation - show delete button
      actionBtn.className = 'pointa-tooltip-delete';
      actionBtn.innerHTML = '×';
      actionBtn.title = 'Delete annotation';
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.deleteAnnotation(annotation.id, badge);
      });
    }

    tooltip.appendChild(tooltipText);
    tooltip.appendChild(copyBtn);
    tooltip.appendChild(actionBtn);
    badge.appendChild(tooltip);

    // Simple positioning - always position relative to body to avoid clipping issues
    this.positionBadgeOnBody(element, badge);
  }

  /**
   * Mark an annotation as done (completed by AI)
   * @param {string} annotationId - The annotation ID
   * @param {HTMLElement} badge - The badge element
   */
  async markAnnotationAsDone(annotationId, badge) {
    try {
      // Find the annotation
      const annotationIndex = this.pointa.annotations.findIndex((a) => a.id === annotationId);
      if (annotationIndex === -1) {
        console.error('Annotation not found:', annotationId);
        return;
      }

      // Update status in local array (don't save yet, wait for animation)
      this.pointa.annotations[annotationIndex].status = 'done';
      this.pointa.annotations[annotationIndex].updated_at = new Date().toISOString();

      // Mark badge as animating to prevent it from being cleared during animation
      badge.dataset.animating = 'true';

      // Update via API
      try {
        await chrome.runtime.sendMessage({
          action: 'updateAnnotation',
          id: annotationId,
          updates: {
            status: 'done',
            updated_at: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Failed to mark annotation as done:', error);
        return; // Don't proceed with animation if update failed
      }

      // Simple 2-second fade out
      badge.classList.add('pointa-badge-fade-out-slow');

      // Remove badge after fade completes
      setTimeout(() => {
        delete badge.dataset.animating;
        if (badge.cleanup) {
          badge.cleanup();
        } else {
          badge.remove();
        }
      }, 2000);

    } catch (error) {
      console.error('Error marking annotation as done:', error);
    }
  }

  /**
   * Delete an annotation
   * @param {string} annotationId - The annotation ID
   * @param {HTMLElement} badge - The badge element
   */
  async deleteAnnotation(annotationId, badge) {
    try {
      // Find and remove annotation
      const annotationIndex = this.pointa.annotations.findIndex((a) => a.id === annotationId);
      if (annotationIndex === -1) {
        console.error('Annotation not found:', annotationId);
        return;
      }

      const annotation = this.pointa.annotations[annotationIndex];

      // If this is a design-edit annotation, revert the CSS changes
      if (annotation.type === 'design-edit' && annotation.css_changes) {
        const element = this.pointa.findElementBySelector(annotation);
        if (element) {
          this.pointa.revertDesignChanges(element, annotation);
        }
      }

      this.pointa.annotations.splice(annotationIndex, 1);

      // Delete via API
      try {
        await chrome.runtime.sendMessage({
          action: 'deleteAnnotation',
          id: annotationId
        });
      } catch (error) {
        console.error('Failed to delete annotation:', error);
        return; // Don't proceed with animation if delete failed
      }

      // Simple fade out for deletion
      badge.classList.add('pointa-badge-fade-out');
      setTimeout(() => {
        if (badge.cleanup) {
          badge.cleanup();
        } else {
          badge.remove();
        }
      }, 300);

      // Reload annotations from API to get fresh data
      try {
        const getResponse = await chrome.runtime.sendMessage({
          action: 'getAnnotations',
          url: window.location.href
        });
        if (getResponse.success) {
          this.pointa.annotations = getResponse.annotations || [];
        }
      } catch (error) {
        console.error('Failed to reload annotations:', error);
      }

      // Refresh sidebar UI if it's open
      if (window.PointaSidebar) {
        try {
          const serverOnline = await window.PointaSidebar.checkServerStatus();
          await window.PointaSidebar.updateContent(this.pointa, serverOnline);
        } catch (error) {
          console.error('Failed to refresh sidebar:', error);
        }
      }

    } catch (error) {
      console.error('Error deleting annotation:', error);
    }
  }

  /**
   * Position badge relative to body with scroll/resize tracking
   * @param {HTMLElement} element - The annotated element
   * @param {HTMLElement} badge - The badge element
   */
  positionBadgeOnBody(element, badge) {
    // Get element's position relative to viewport
    const elementRect = element.getBoundingClientRect();

    // BUGFIX: Validate element rect before positioning
    // If element is hidden or has invalid dimensions, hide the badge
    if (elementRect.width === 0 || elementRect.height === 0) {
      console.warn('Element has invalid dimensions, hiding badge');
      badge.style.setProperty('display', 'none', 'important');
      document.body.appendChild(badge);

      // Set up a check to show badge when element becomes valid and visible
      const checkVisibility = () => {
        const newRect = element.getBoundingClientRect();
        // Check both dimensions and viewport visibility
        const hasValidDimensions = newRect.width > 0 && newRect.height > 0;
        const isVisible = newRect.bottom > 0 && newRect.top < window.innerHeight;
        if (hasValidDimensions && isVisible) {
          badge.style.setProperty('display', 'flex', 'important');
          this.positionBadgeNextToElement(newRect, badge);
        }
      };

      // Check periodically for element to become visible
      const visibilityInterval = setInterval(checkVisibility, 1000);
      setTimeout(() => clearInterval(visibilityInterval), 10000); // Give up after 10 seconds

      return;
    }

    // Add to body to avoid any parent clipping issues
    document.body.appendChild(badge);

    // Position badge next to element (Figma-style - not on top)
    badge.style.position = 'fixed';
    badge.style.zIndex = '999999';

    // Store reference to original element
    const elementId = this.generateElementId(element);
    badge.dataset.originalElementId = elementId;

    // Unified scroll/resize listener for proper positioning
    const updatePosition = () => {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Simple check: element is visible if it intersects the viewport
      const isVisible = rect.bottom > 0 && rect.top < viewportHeight && rect.width > 0 && rect.height > 0;

      if (!isVisible) {
        badge.style.setProperty('display', 'none', 'important');
        return;
      }

      // Element is visible - show badge and position it
      badge.style.setProperty('display', 'flex', 'important');
      this.positionBadgeNextToElement(rect, badge);
    };

    // Initial positioning
    updatePosition();

    // Set up scroll/resize listeners
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    // Store updatePosition function for manual triggering (e.g., when sidebar opens/closes)
    badge.updatePosition = updatePosition;

    // Store cleanup function
    badge.cleanup = () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
      // Remove from position tracking
      const badgeId = badge.getAttribute('data-annotation-id');
      if (badgeId) {
        this.badgePositions.delete(badgeId);
      }
      badge.remove();
    };
  }

  /**
   * Position badge next to element with collision detection
   * @param {DOMRect} elementRect - The element's bounding rectangle
   * @param {HTMLElement} badge - The badge element
   */
  positionBadgeNextToElement(elementRect, badge) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const badgeSize = 32;
    const gap = 8;
    const rightEdgeMargin = 16; // Minimum distance from right edge
    const verticalSpacing = 4; // Minimum vertical spacing between badges

    // Simple check: element is visible ONLY if it intersects the viewport
    // Element is visible if: bottom > 0 AND top < viewportHeight
    // This means at least part of the element is visible
    const isVisible = elementRect.bottom > 0 &&
    elementRect.top < viewportHeight &&
    elementRect.width > 0 &&
    elementRect.height > 0;

    if (!isVisible) {
      badge.style.setProperty('display', 'none', 'important');
      // Remove from position tracking if hidden
      const badgeId = badge.getAttribute('data-annotation-id');
      if (badgeId) {
        this.badgePositions.delete(badgeId);
      }
      return;
    }

    // SMART POSITIONING: Always prefer right side of element
    // Calculate initial position to the right of element
    let left = elementRect.right + gap;
    let top = elementRect.top;

    // If badge would overflow viewport right edge, use fixed right edge position
    if (left + badgeSize > viewportWidth - rightEdgeMargin) {
      // Position badge at fixed distance from right edge of viewport
      left = viewportWidth - badgeSize - rightEdgeMargin;
    }

    // Ensure badge doesn't overflow left edge (for very narrow viewports)
    // In this case, place it as far right as possible
    if (left < 16) {
      left = Math.max(16, viewportWidth - badgeSize - rightEdgeMargin);
    }

    // KEEP OUT ZONE: Check if badge would overlap with element's bounding box
    // If so, reposition it to avoid overlapping with the annotated element
    const badgeRect = {
      left: left,
      top: top,
      right: left + badgeSize,
      bottom: top + badgeSize
    };

    // Check if badge overlaps with element horizontally
    const horizontalOverlap = !(badgeRect.left >= elementRect.right || badgeRect.right <= elementRect.left);

    // Check if badge overlaps with element vertically
    const verticalOverlap = !(badgeRect.top >= elementRect.bottom || badgeRect.bottom <= elementRect.top);

    // If badge overlaps with element in both dimensions, reposition it
    if (horizontalOverlap && verticalOverlap) {
      // Try positioning below the element first
      top = elementRect.bottom + gap;

      // If that goes off bottom of viewport, try above the element
      if (top + badgeSize > viewportHeight - 16) {
        top = elementRect.top - badgeSize - gap;

        // If above also doesn't work, keep below but clamp to viewport
        if (top < 16) {
          top = Math.max(16, viewportHeight - badgeSize - 16);
        }
      }
    }

    // COLLISION DETECTION: Check if this position overlaps with existing badges
    // and adjust vertically if needed
    const badgeId = badge.getAttribute('data-annotation-id');
    top = this.findNonOverlappingPosition(left, top, badgeSize, badgeId, verticalSpacing);

    // Clamp vertical position to viewport bounds
    const maxTop = viewportHeight - badgeSize - 16;
    if (top > maxTop) top = maxTop;
    if (top < 16) top = 16;

    // Store badge position for collision detection
    if (badgeId) {
      this.badgePositions.set(badgeId, { left, top, size: badgeSize });
    }

    // Apply position - only if element is visible
    badge.style.setProperty('display', 'flex', 'important');
    badge.style.position = 'fixed';
    badge.style.zIndex = '2147483646'; // Below design editor modal (2147483647)
    badge.style.left = `${left}px`;
    badge.style.top = `${top}px`;
    badge.style.transform = 'none';
  }

  /**
   * Find a non-overlapping vertical position for badge
   * @param {number} left - Initial left position
   * @param {number} top - Initial top position
   * @param {number} badgeSize - Badge size in pixels
   * @param {string} currentBadgeId - ID of current badge (to skip self-check)
   * @param {number} verticalSpacing - Minimum vertical spacing between badges
   * @returns {number} Adjusted top position
   */
  findNonOverlappingPosition(left, top, badgeSize, currentBadgeId, verticalSpacing) {
    // Check all existing badge positions for overlaps
    let adjustedTop = top;
    let hasOverlap = true;
    let iterations = 0;
    const maxIterations = 50; // Prevent infinite loops

    while (hasOverlap && iterations < maxIterations) {
      hasOverlap = false;

      for (const [badgeId, pos] of this.badgePositions) {
        // Skip checking against itself
        if (badgeId === currentBadgeId) continue;

        // Check for horizontal overlap (badges in similar horizontal zone)
        const horizontalOverlap = Math.abs(left - pos.left) < badgeSize + 10;

        if (horizontalOverlap) {
          // Check for vertical overlap
          const verticalOverlap = Math.abs(adjustedTop - pos.top) < badgeSize + verticalSpacing;

          if (verticalOverlap) {
            // Move badge below the overlapping badge
            adjustedTop = pos.top + pos.size + verticalSpacing;
            hasOverlap = true;
            break; // Restart the check with new position
          }
        }
      }

      iterations++;
    }

    return adjustedTop;
  }

  /**
   * Generate unique ID for element
   * @param {HTMLElement} element - The element
   * @returns {string} Unique element ID
   */
  generateElementId(element) {
    // Generate unique ID for element if it doesn't have one
    if (!element.dataset.vibeAnnotationId) {
      element.dataset.vibeAnnotationId = 'pointa-element-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    return element.dataset.vibeAnnotationId;
  }

  /**
   * Manually refresh all badge positions
   * Useful when viewport changes without triggering resize event (e.g., sidebar open/close)
   */
  refreshAllBadgePositions() {
    const badges = document.querySelectorAll('.pointa-badge');
    badges.forEach((badge) => {
      if (badge.updatePosition && typeof badge.updatePosition === 'function') {
        badge.updatePosition();
      }
    });
  }
}

// Make available globally
window.VibeBadgeManager = VibeBadgeManager;
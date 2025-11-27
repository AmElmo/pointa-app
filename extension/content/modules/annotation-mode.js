/**
 * PointaAnnotationMode
 * Manages annotation mode state, UI, event handlers, and inline comment widget
 */

class PointaAnnotationMode {
  /**
   * Start annotation mode
   * @param {object} pointa - Reference to Pointa instance
   */
  static async startAnnotationMode(pointa) {
    // Check API status first - show overlay immediately if offline
    const apiStatus = await pointa.checkAPIStatus();

    if (!apiStatus.connected && !PointaUtils.isFileProtocol()) {
      // Show offline overlay immediately instead of starting annotation mode
      this.showAPIOfflineOverlay(pointa);
      return;
    }

    pointa.isAnnotationMode = true;

    // Add visual indicator
    document.body.classList.add('pointa-mode-active');

    // Set up event listeners
    this.setupAnnotationListeners(pointa);

    // Show instruction overlay
    this.showInspectionModeOverlay();
  }

  /**
   * Stop annotation mode
   * @param {object} pointa - Reference to Pointa instance
   */
  static stopAnnotationMode(pointa) {
    pointa.isAnnotationMode = false;

    // Close any open inline widget
    this.closeInlineCommentWidget(pointa);

    // Remove visual indicators
    document.body.classList.remove('pointa-mode-active');
    this.removeInspectionModeOverlay();

    // Remove event listeners
    this.removeAnnotationListeners(pointa);

    // Clear highlights
    this.clearHighlights();

    // Note: No need to rebuild all badges here since they persist after annotation mode
    // Badges are created immediately when annotations are saved in saveAnnotation()
  }

  /**
   * Show inspection mode overlay with instructions
   */
  static showInspectionModeOverlay() {
    // Create overlay with instructions
    const overlay = document.createElement('div');
    overlay.className = 'pointa-inspection-overlay';
    overlay.innerHTML = `
      <div class="pointa-inspection-content">
        <p>Press ESC or click the extension to exit inspection.</p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      overlay.classList.add('pointa-inspection-overlay-fade');
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove();
        }
      }, 300);
    }, 3000);
  }

  /**
   * Remove inspection mode overlay
   */
  static removeInspectionModeOverlay() {
    const overlay = document.querySelector('.pointa-inspection-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Show mode indicator (floating notification)
   */
  static showModeIndicator() {
    // Create a floating indicator
    const indicator = document.createElement('div');
    indicator.id = 'pointa-mode-indicator';
    indicator.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2563eb;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483646;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: pointa-fade-in 0.2s ease;
      ">
        Click on any element to add a comment
        <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">
          Press ESC to exit
        </div>
      </div>
    `;
    document.body.appendChild(indicator);
  }

  /**
   * Remove mode indicator
   */
  static removeModeIndicator() {
    const indicator = document.getElementById('pointa-mode-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  /**
   * Temporarily disable annotation mode (keep state but remove UI)
   * @param {object} pointa - Reference to Pointa instance
   */
  static tempDisableAnnotationMode(pointa) {
    // Remove visual indicators but keep isAnnotationMode true
    document.body.classList.remove('pointa-mode-active');

    // Remove event listeners temporarily - this is crucial for modal interactions
    this.removeAnnotationListeners(pointa);

    // Clear highlights
    this.clearHighlights();
  }

  /**
   * Re-enable annotation mode after temporary disable
   * @param {object} pointa - Reference to Pointa instance
   */
  static reEnableAnnotationMode(pointa) {
    if (pointa.isAnnotationMode) {
      // Re-add visual indicators
      document.body.classList.add('pointa-mode-active');

      // Re-setup event listeners
      this.setupAnnotationListeners(pointa);
    }
  }

  /**
   * Setup event listeners for annotation mode
   * @param {object} pointa - Reference to Pointa instance
   */
  static setupAnnotationListeners(pointa) {
    // Store bound functions for proper removal
    pointa.boundMouseOver = this.handleMouseOver.bind(this, pointa);
    pointa.boundMouseOut = this.handleMouseOut.bind(this, pointa);
    pointa.boundClick = this.handleClick.bind(this, pointa);

    // Mouse events for element selection
    document.addEventListener('mouseover', pointa.boundMouseOver, true);
    document.addEventListener('mouseout', pointa.boundMouseOut, true);
    document.addEventListener('click', pointa.boundClick, true);
  }

  /**
   * Remove annotation event listeners
   * @param {object} pointa - Reference to Pointa instance
   */
  static removeAnnotationListeners(pointa) {
    if (pointa.boundMouseOver) {
      document.removeEventListener('mouseover', pointa.boundMouseOver, true);
    }
    if (pointa.boundMouseOut) {
      document.removeEventListener('mouseout', pointa.boundMouseOut, true);
    }
    if (pointa.boundClick) {
      document.removeEventListener('click', pointa.boundClick, true);
    }
  }

  /**
   * Handle mouseover event in annotation mode
   * @param {object} pointa - Reference to Pointa instance
   * @param {Event} e - Mouse event
   */
  static handleMouseOver(pointa, e) {
    if (!pointa.isAnnotationMode) return;

    // Don't prevent default or stop propagation - allow normal hover effects to work
    // Skip all extension UI elements
    if (e.target.closest('#pointa-sidebar') ||
    e.target.closest('.pointa-inline-comment-widget') ||
    e.target.closest('.pointa-design-editor') ||
    e.target.closest('.pointa-comment-modal') ||
    e.target.closest('.pointa-inspection-overlay') ||
    e.target.classList.contains('pointa-highlight') ||
    e.target.classList.contains('pointa-badge') ||
    e.target.closest('.pointa-badge') ||
    e.target.closest('.sidebar-page-nav-dropdown')) {
      return;
    }

    // Find the element to highlight - use the element that would be annotated if clicked
    // This allows hover effects on child elements to work while still highlighting the parent
    const targetElement = e.target;

    // Only highlight if we're not already highlighting this element
    // This prevents flickering and allows hover effects to work
    if (pointa.hoveredElement !== targetElement) {
      pointa.hoveredElement = targetElement;
      this.highlightElement(targetElement);
    }
  }

  /**
   * Handle mouseout event in annotation mode
   * @param {object} pointa - Reference to Pointa instance
   * @param {Event} e - Mouse event
   */
  static handleMouseOut(pointa, e) {
    if (!pointa.isAnnotationMode) return;

    // Don't prevent default or stop propagation - allow normal hover effects to work
    // Skip all extension UI elements
    if (e.target.closest('#pointa-sidebar') ||
    e.target.closest('.pointa-inline-comment-widget') ||
    e.target.closest('.pointa-design-editor') ||
    e.target.closest('.pointa-comment-modal') ||
    e.target.closest('.pointa-inspection-overlay') ||
    e.target.classList.contains('pointa-badge') ||
    e.target.closest('.pointa-badge') ||
    e.target.closest('.sidebar-page-nav-dropdown')) {
      return;
    }

    pointa.hoveredElement = null;
    this.clearHighlights();
  }

  /**
   * Handle click event in annotation mode
   * @param {object} pointa - Reference to Pointa instance
   * @param {Event} e - Click event
   */
  static handleClick(pointa, e) {
    if (!pointa.isAnnotationMode) return;

    // Check if click is on extension UI elements - allow normal interaction
    // Don't prevent default or stop propagation for these elements
    if (e.target.closest('#pointa-sidebar') ||
    e.target.closest('.pointa-inline-comment-widget') ||
    e.target.closest('.pointa-design-editor') ||
    e.target.closest('.pointa-comment-modal') ||
    e.target.closest('.pointa-inspection-overlay') ||
    e.target.closest('.pointa-badge') ||
    e.target.closest('.pointa-btn') ||
    e.target.closest('.sidebar-page-nav-dropdown')) {
      // Don't annotate extension UI - allow normal click behavior
      return;
    }

    // For page elements, prevent default and create annotation
    e.preventDefault();
    e.stopPropagation();

    this.createAnnotation(pointa, e.target);
  }

  /**
   * Highlight an element
   * @param {HTMLElement} element - Element to highlight
   */
  static highlightElement(element) {
    this.clearHighlights();
    element.classList.add('pointa-highlight');
  }

  /**
   * Clear all highlights
   */
  static clearHighlights() {
    document.querySelectorAll('.pointa-highlight').forEach((el) => {
      el.classList.remove('pointa-highlight');
    });
  }

  /**
   * Create a new annotation for the clicked element
   * @param {object} pointa - Reference to Pointa instance
   * @param {HTMLElement} element - Element to annotate
   */
  static async createAnnotation(pointa, element) {
    // Temporarily disable annotation mode while widget is open
    this.tempDisableAnnotationMode(pointa);

    // Generate element context
    const context = await this.generateElementContext(pointa, element);

    // Show simplified inline comment widget (no modal)
    this.showInlineCommentWidget(pointa, element, context);
  }

  /**
   * Generate element context data (delegates to Pointa)
   * @param {object} pointa - Reference to Pointa instance
   * @param {HTMLElement} element - Element to analyze
   * @returns {object} Context data
   */
  static async generateElementContext(pointa, element) {
    // Delegate to Pointa's generateElementContext since it's shared by design mode
    return await pointa.generateElementContext(element);
  }

  /**
   * Show inline comment widget for annotation
   * @param {object} pointa - Reference to Pointa instance
   * @param {HTMLElement} element - Element being annotated
   * @param {object} context - Element context data
   * @param {object} annotation - Existing annotation (for editing)
   */
  static async showInlineCommentWidget(pointa, element, context, annotation = null, badge = null) {
    // Store previous element before closing
    const previousElement = pointa.currentCommentElement;

    // Close any existing widget
    this.closeInlineCommentWidget(pointa);

    // Clear draft if switching to a different element
    if (previousElement && previousElement !== element) {
      pointa.commentDraft = null;

    }

    // Highlight the element if this is an existing annotation
    if (annotation) {
      element.classList.add('pointa-highlight');
      // Store reference to clear highlight later
      pointa.currentHighlightedElement = element;
    }

    // Determine conversation state
    const messages = annotation ? annotation.messages || (annotation.comment ? [{ text: annotation.comment, timestamp: annotation.created_at }] : []) : [];
    const hasConversation = messages.length > 1;
    const isInReview = annotation && annotation.status === 'in-review';

    // Create widget container - Figma-style
    const widget = document.createElement('div');
    widget.className = 'pointa-inline-comment-widget';
    if (hasConversation || isInReview) {
      widget.classList.add('pointa-inline-comment-widget-conversation');
    }
    widget.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    // Add tab bar for Comment/Design switching
    const tabBar = document.createElement('div');
    tabBar.className = 'pointa-widget-tab-bar';

    const commentTab = document.createElement('button');
    commentTab.className = 'pointa-widget-tab active';
    commentTab.textContent = '💬 Comment';
    commentTab.type = 'button';

    const designTab = document.createElement('button');
    designTab.className = 'pointa-widget-tab';
    designTab.textContent = '🎨 Design';
    designTab.type = 'button';

    // Design tab click handler - switch to design editor
    designTab.addEventListener('click', () => {
      // Store current comment text before switching
      const currentText = textarea?.value || '';

      // Store shared state for design editor
      pointa.pendingAnnotation = {
        annotation: annotation,
        element: element,
        context: context,
        commentText: currentText,
        referenceImages: widget.referenceImages || []
      };

      // Close widget
      this.closeInlineCommentWidget(pointa);

      // Open design editor with annotation scope if editing
      const restoreScope = annotation?.scope?.edit_scope || null;
      pointa.showDesignEditor(element, restoreScope);
    });

    tabBar.appendChild(commentTab);
    tabBar.appendChild(designTab);
    widget.appendChild(tabBar);

    // Show conversation history if there are multiple messages OR if in-review (show original message)
    if (hasConversation || isInReview) {
      // Create conversation container - show all messages except the last one
      const conversationContainer = document.createElement('div');
      conversationContainer.className = 'pointa-inline-conversation';

      // Add header
      const header = document.createElement('div');
      header.className = 'pointa-inline-conversation-header';
      header.innerHTML = '<strong>Conversation</strong>';
      conversationContainer.appendChild(header);

      // Add messages (all except the last one if not in-review, or all if in-review)
      const messagesToShow = isInReview ? messages : messages.slice(0, -1);
      messagesToShow.forEach((message, index) => {
        const messageEl = document.createElement('div');
        messageEl.className = 'pointa-inline-message';

        const messageText = document.createElement('div');
        messageText.className = 'pointa-inline-message-text';
        messageText.textContent = message.text;

        const messageTime = document.createElement('div');
        messageTime.className = 'pointa-inline-message-time';
        if (message.timestamp) {
          const date = new Date(message.timestamp);
          messageTime.textContent = date.toLocaleString();
        } else {
          messageTime.textContent = index === 0 ? 'Original' : 'Follow-up';
        }

        messageEl.appendChild(messageText);
        messageEl.appendChild(messageTime);
        conversationContainer.appendChild(messageEl);
      });

      widget.appendChild(conversationContainer);
    }

    // Create textarea - Figma-style placeholder
    const textarea = document.createElement('textarea');
    textarea.className = 'pointa-inline-comment-textarea';
    if (isInReview) {
      // In-review: Add a NEW message (iteration/follow-up)
      textarea.placeholder = 'Add a follow-up comment...';
      textarea.maxLength = 5000;
      // Don't pre-fill - it's a new message
    } else if (hasConversation) {
      // Active with conversation: Edit the LATEST message
      textarea.placeholder = 'Edit your comment...';
      textarea.maxLength = 5000;
      textarea.value = messages[messages.length - 1].text;
    } else {
      // Single message or new annotation: Edit/create
      textarea.placeholder = 'Add a comment';
      textarea.maxLength = 5000;
      if (annotation) {
        // For single-message annotations, show existing comment for editing
        if (messages.length > 0) {
          textarea.value = messages[messages.length - 1].text;
        }
      } else {
        // Try to restore draft for NEW annotations only - EXACT element match
        if (pointa.commentDraft && pointa.commentDraft.element === element) {
          textarea.value = pointa.commentDraft.text;

        }
      }
    }

    // Create actions container
    const actions = document.createElement('div');
    actions.className = 'pointa-inline-comment-actions';

    // Create left actions container
    const actionsLeft = document.createElement('div');
    actionsLeft.className = 'pointa-inline-comment-actions-left';

    // Create image upload button (no functionality yet)
    const imageBtn = document.createElement('button');
    imageBtn.className = 'pointa-inline-comment-image-btn';
    imageBtn.type = 'button';
    imageBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    `;
    imageBtn.title = 'Add reference image';

    // Create hidden file input for image upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = false; // Will handle multiple uploads via button clicks
    fileInput.style.display = 'none';

    // Create character counter
    const charCounter = document.createElement('span');
    charCounter.className = 'pointa-inline-comment-char-limit';
    charCounter.textContent = '0 / 5000';

    // Create Enter/Submit button (upload arrow icon)
    const enterBtn = document.createElement('button');
    enterBtn.className = 'pointa-inline-comment-enter';
    enterBtn.type = 'button';
    enterBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    `;
    enterBtn.title = 'Save (Enter)';

    // Create thumbnail container (below textarea)
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'pointa-inline-thumbnails';

    // Initialize reference images array
    const referenceImages = [];

    // Load existing images if editing annotation
    if (annotation && annotation.reference_images && annotation.reference_images.length > 0) {
      annotation.reference_images.forEach((img) => {
        referenceImages.push(img);
        this.addThumbnailToContainer(thumbnailContainer, img, referenceImages, widget, element);
      });
    }

    // Assemble widget - Figma-style with image button on left, submit on right
    actionsLeft.appendChild(imageBtn);
    actionsLeft.appendChild(fileInput);
    actionsLeft.appendChild(charCounter);
    actions.appendChild(actionsLeft);
    actions.appendChild(enterBtn);
    widget.appendChild(textarea);
    widget.appendChild(thumbnailContainer);
    widget.appendChild(actions);

    // Store reference images array on widget for later access
    widget.referenceImages = referenceImages;

    // Hide actions initially if this is a new annotation (no existing text)
    if (!annotation || !annotation.comment) {
      actions.classList.add('hidden');
    }

    // Add to body (not sidebar!)
    const pageBody = window.document.body;
    if (!pageBody) {
      console.error('[Pointa] Cannot find document.body to append widget');
      return;
    }

    pageBody.appendChild(widget);

    // Store reference for cleanup
    pointa.currentCommentWidget = widget;
    pointa.currentCommentElement = element;
    pointa.currentCommentContext = context;
    pointa.currentCommentAnnotation = annotation;

    // Store annotation ID on widget for badge positioning
    if (annotation && annotation.id) {
      widget.setAttribute('data-annotation-id', annotation.id);
    }

    // Store badge reference for positioning
    if (badge) {
      widget.badgeElement = badge;
    }

    // Position widget initially (will be refined after render)
    // If badge exists, position relative to badge; otherwise relative to element
    this.positionCommentWidget(element, widget, badge);

    // Setup auto-resize for textarea and show/hide actions
    const autoResize = () => {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200); // Max 200px height
      textarea.style.height = `${newHeight}px`;

      // Update character counter
      const currentLength = textarea.value.length;
      const maxLength = textarea.maxLength;
      charCounter.textContent = `${currentLength} / ${maxLength}`;

      // Show counter when approaching limit (>4500 chars) or at limit
      if (currentLength > 4500) {
        charCounter.classList.add('visible');
        if (currentLength >= maxLength) {
          charCounter.classList.add('at-limit');
        } else {
          charCounter.classList.remove('at-limit');
        }
      } else {
        charCounter.classList.remove('visible', 'at-limit');
      }

      // Show actions when user starts typing, hide when empty
      if (textarea.value.trim().length > 0) {
        actions.classList.remove('hidden');
      } else {
        actions.classList.add('hidden');
      }

      // Reposition after resize to account for new height
      this.positionCommentWidget(element, widget, badge);
    };
    textarea.addEventListener('input', autoResize);

    // Initial resize and positioning - use double RAF to ensure DOM is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        autoResize();
        // Reposition after initial render with accurate dimensions
        this.positionCommentWidget(element, widget, badge);
      });
    });

    // Focus textarea
    setTimeout(() => {
      textarea.focus();
      if (annotation) {
        // Position cursor at the end of the text, don't select all
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      }
    }, 0);

    // Setup event handlers
    this.setupInlineWidgetListeners(pointa, widget, textarea, enterBtn, imageBtn, fileInput, thumbnailContainer, element, context, annotation);

    // Setup position update on scroll/resize
    const updatePosition = () => {
      // Use stored badge reference from widget
      this.positionCommentWidget(element, widget, widget.badgeElement);
    };
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    // Store cleanup function
    widget.updatePosition = updatePosition;
  }

  /**
   * Position the comment widget next to the element or badge
   * @param {HTMLElement} element - Target element
   * @param {HTMLElement} widget - Widget to position
   * @param {HTMLElement} badge - Optional badge element (position relative to badge if provided)
   */
  static positionCommentWidget(element, widget, badge = null) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 12; // Gap between badge/element and widget
    const padding = 16; // Padding from viewport edges

    // Get widget dimensions
    const widgetRect = widget.getBoundingClientRect();
    const widgetWidth = widgetRect.width || 320;
    const widgetHeight = widgetRect.height || 100;

    // Account for sidebar on the right
    const sidebar = document.querySelector('#pointa-sidebar');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;
    const availableWidth = viewportWidth - sidebarWidth;

    // FIGMA-STYLE: If badge exists, position relative to badge; otherwise relative to element
    const referenceRect = badge ? badge.getBoundingClientRect() : element.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect(); // Keep element rect for overlap detection

    let left, top;
    let positioning = 'right'; // Track which positioning strategy we're using

    // Try to position to the right of the badge/element
    left = referenceRect.right + gap;
    top = referenceRect.top;

    // BADGE-AWARE POSITIONING: Different strategy for badge vs element
    if (badge) {
      // When badge exists: ALWAYS stay to the right or left of badge (never below/above)
      // This ensures badge and widget stay next to each other
      if (left + widgetWidth > availableWidth - padding) {
        // Position to left of badge instead
        left = referenceRect.left - widgetWidth - gap;
        positioning = 'left';

        // If still doesn't fit, clamp to viewport but stay horizontal with badge
        if (left < padding) {
          left = padding; // Clamp to left edge
        }
      }
    } else {
      // For new annotations (no badge): Try all positioning options
      if (left + widgetWidth > availableWidth - padding) {
        left = referenceRect.left - widgetWidth - gap;
        positioning = 'left';

        // If left side also overflows, try below the element
        if (left < padding) {
          left = Math.max(padding, referenceRect.left);
          top = referenceRect.bottom + gap;
          positioning = 'below';

          // If below goes off viewport, try above
          if (top + widgetHeight > viewportHeight - padding) {
            top = referenceRect.top - widgetHeight - gap;
            positioning = 'above';

            // If above also doesn't fit, keep below but clamp
            if (top < padding) {
              top = referenceRect.bottom + gap;
              positioning = 'below';
            }
          }
        }
      }
    }

    // KEEP OUT ZONE: Only apply for new annotations (no badge)
    // When badge exists, widget stays with badge even if it means some overlap with element
    if (!badge) {
      // For new annotations, verify widget doesn't overlap with element
      const widgetBox = {
        left: left,
        top: top,
        right: left + widgetWidth,
        bottom: top + widgetHeight
      };

      // Check for overlap with element
      const horizontalOverlap = !(widgetBox.left >= elementRect.right || widgetBox.right <= elementRect.left);
      const verticalOverlap = !(widgetBox.top >= elementRect.bottom || widgetBox.bottom <= elementRect.top);

      // If widget overlaps with element, reposition it
      if (horizontalOverlap && verticalOverlap) {
        // Try below first
        left = Math.max(padding, Math.min(elementRect.left, availableWidth - widgetWidth - padding));
        top = elementRect.bottom + gap;

        // If below goes off viewport or still overlaps, try above
        if (top + widgetHeight > viewportHeight - padding) {
          top = elementRect.top - widgetHeight - gap;

          // If above also doesn't work, use below but clamp to viewport
          if (top < padding) {
            top = Math.max(padding, viewportHeight - widgetHeight - padding);
            // Position horizontally to avoid element if possible
            if (elementRect.left > widgetWidth + gap + padding) {
              left = elementRect.left - widgetWidth - gap;
            } else if (elementRect.right + widgetWidth + gap < availableWidth - padding) {
              left = elementRect.right + gap;
            }
          }
        }
      }
    }

    // Final clamp to viewport bounds
    // IMPORTANT: When badge exists, preserve horizontal alignment with badge
    if (badge) {
      // For badge-based positioning, only adjust vertically if needed
      // Keep horizontal alignment with badge (left side aligned)
      if (top + widgetHeight > viewportHeight - padding) {
        // Widget would go below viewport - try positioning above badge instead
        top = Math.max(padding, referenceRect.top - widgetHeight - gap);

        // If still doesn't fit, clamp but stay next to badge
        if (top < padding) {
          top = padding;
        }
      }

      // Only adjust horizontal if absolutely necessary (entire widget off-screen)
      if (left + widgetWidth > availableWidth - padding) {
        // Widget goes off right edge - position to left of badge instead
        left = referenceRect.left - widgetWidth - gap;

        // If still doesn't fit, clamp but try to stay visible
        if (left < padding) {
          left = padding;
        }
      }
    } else {
      // For element-based positioning (new annotations), normal clamping
      if (top + widgetHeight > viewportHeight - padding) {
        top = Math.max(padding, viewportHeight - widgetHeight - padding);
      }
      if (top < padding) {
        top = padding;
      }
      if (left < padding) {
        left = padding;
      }
      if (left + widgetWidth > availableWidth - padding) {
        left = Math.max(padding, availableWidth - widgetWidth - padding);
      }
    }

    // Apply position
    widget.style.position = 'fixed';
    widget.style.left = `${left}px`;
    widget.style.top = `${top}px`;
    widget.style.zIndex = '2147483647';
  }

  /**
   * Setup event listeners for inline widget
   * @param {object} pointa - Reference to Pointa instance
   * @param {HTMLElement} widget - Widget element
   * @param {HTMLElement} textarea - Textarea element
   * @param {HTMLElement} enterBtn - Enter button
   * @param {HTMLElement} imageBtn - Image upload button
   * @param {HTMLElement} fileInput - File input element
   * @param {HTMLElement} thumbnailContainer - Thumbnail container element
   * @param {HTMLElement} element - Target element
   * @param {object} context - Element context
   * @param {object} annotation - Existing annotation
   */
  static setupInlineWidgetListeners(pointa, widget, textarea, enterBtn, imageBtn, fileInput, thumbnailContainer, element, context, annotation) {
    // Enter button handler
    enterBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.handleInlineWidgetSubmit(pointa, widget, textarea, element, context, annotation);
    });

    // Image button handler - trigger file picker
    if (imageBtn && fileInput) {
      imageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Check limit (3 images max)
        if (widget.referenceImages.length >= 3) {
          // Show brief warning
          imageBtn.title = 'Maximum 3 images';
          setTimeout(() => {
            imageBtn.title = 'Add reference image';
          }, 2000);
          return;
        }

        fileInput.click();
      });

      // File input change handler - upload image
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check limit
        if (widget.referenceImages.length >= 3) {
          return;
        }

        try {
          // Show loading state
          imageBtn.disabled = true;
          imageBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pointa-spinner">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/>
            </svg>
          `;

          // Get or generate annotation ID
          const annotationId = annotation ? annotation.id : PointaUtils.generateId();

          // Upload image
          const imageData = await VibeImageUploader.uploadImage(file, annotationId);

          // Add to reference images array
          widget.referenceImages.push(imageData);

          // Add thumbnail to UI
          this.addThumbnailToContainer(thumbnailContainer, imageData, widget.referenceImages, widget, element);

          // Reposition widget after adding thumbnail
          this.positionCommentWidget(element, widget, widget.badgeElement);

        } catch (error) {
          console.error('Failed to upload image:', error);
          alert('Failed to upload image. Please try again.');
        } finally {
          // Restore button state
          imageBtn.disabled = false;
          imageBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          `;
          // Reset file input so same file can be selected again
          fileInput.value = '';
        }
      });
    }

    // ESC key handler - Figma-style
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeInlineCommentWidget(pointa);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    widget.escHandler = escHandler;

    // Click outside handler - simplified
    const clickOutsideHandler = (e) => {
      if (!widget.contains(e.target) &&
      !e.target.closest('.pointa-badge') &&
      !e.target.closest('.pointa-highlight')) {
        this.closeInlineCommentWidget(pointa);
        document.removeEventListener('click', clickOutsideHandler);
      }
    };
    // Small delay to prevent immediate closing when opening widget
    setTimeout(() => {
      document.addEventListener('click', clickOutsideHandler);
    }, 100);
    widget.clickOutsideHandler = clickOutsideHandler;

    // Enter key handler (Enter alone submits - Figma-style)
    const enterKeyHandler = async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await this.handleInlineWidgetSubmit(pointa, widget, textarea, element, context, annotation);
      }
    };
    textarea.addEventListener('keydown', enterKeyHandler);
    widget.enterKeyHandler = enterKeyHandler;
  }

  /**
   * Add thumbnail to container
   * @param {HTMLElement} container - Thumbnail container
   * @param {Object} imageData - Image data object
   * @param {Array} referenceImages - Reference images array
   * @param {HTMLElement} widget - Widget element (for repositioning)
   * @param {HTMLElement} element - Target element (for repositioning)
   */
  static addThumbnailToContainer(container, imageData, referenceImages, widget, element) {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'pointa-inline-thumbnail';
    thumbnail.dataset.imageId = imageData.id;

    // Create image element
    const img = document.createElement('img');
    img.src = imageData.thumbnail;
    img.alt = imageData.original_name;

    // Create remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'pointa-inline-thumbnail-remove';
    removeBtn.type = 'button';
    removeBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    removeBtn.title = 'Remove image';

    // Remove button handler
    removeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // Delete image from server
        await VibeImageUploader.deleteImage(imageData.file_path);

        // Remove from array
        const index = referenceImages.findIndex((img) => img.id === imageData.id);
        if (index !== -1) {
          referenceImages.splice(index, 1);
        }

        // Remove thumbnail from UI
        thumbnail.remove();

        // Reposition widget after removing thumbnail
        this.positionCommentWidget(element, widget, widget.badgeElement);

      } catch (error) {
        console.error('Failed to delete image:', error);
        // Still remove from UI even if server delete fails
        const index = referenceImages.findIndex((img) => img.id === imageData.id);
        if (index !== -1) {
          referenceImages.splice(index, 1);
        }
        thumbnail.remove();
        this.positionCommentWidget(element, widget, widget.badgeElement);
      }
    });

    thumbnail.appendChild(img);
    thumbnail.appendChild(removeBtn);
    container.appendChild(thumbnail);
  }

  /**
   * Handle inline widget submit
   * @param {object} pointa - Reference to Pointa instance
   * @param {HTMLElement} widget - Widget element
   * @param {HTMLElement} textarea - Textarea element
   * @param {HTMLElement} element - Target element
   * @param {object} context - Element context
   * @param {object} annotation - Existing annotation
   */
  static async handleInlineWidgetSubmit(pointa, widget, textarea, element, context, annotation) {
    const submitStartTime = Date.now();
    const submitId = `submit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const comment = textarea.value.trim();










    if (!comment) {

      return; // Don't save empty comments
    }

    try {
      // Check API status

      const apiStatus = await pointa.checkAPIStatus();






      if (!apiStatus.connected && !PointaUtils.isFileProtocol()) {

        // Close the widget first (will re-enable annotation mode automatically)
        this.closeInlineCommentWidget(pointa);
        // Show offline overlay with instructions
        this.showAPIOfflineOverlay(pointa);
        return;
      }

      // Get reference images from widget
      const referenceImages = widget.referenceImages || [];





      if (annotation) {
        // Check if this is in-review (add new message as iteration)
        const messages = annotation.messages || (annotation.comment ? [{ text: annotation.comment }] : []);
        const hasConversation = messages.length > 1;
        const isInReview = annotation.status === 'in-review';








        if (isInReview) {
          // In-review: Add NEW message and move back to pending for another iteration

          await pointa.addAnnotationMessage(annotation, comment, referenceImages);
        } else {
          // All other cases: Update the existing annotation (edits latest message)

          await pointa.updateAnnotation(annotation, comment, referenceImages);
        }
      } else {
        // Create new annotation

        await pointa.saveAnnotation(element, context, comment, referenceImages);
      }

      // Clear draft after successful save

      pointa.commentDraft = null;

      const submitEndTime = Date.now();
      const submitDuration = submitEndTime - submitStartTime;







    } catch (error) {
      const submitEndTime = Date.now();
      const submitDuration = submitEndTime - submitStartTime;

      console.error(`[WIDGET_SUBMIT_ERROR] ${submitEndTime} - Widget submit failed:`, {
        submitId: submitId,
        annotationId: annotation?.id || 'NEW',
        duration: `${submitDuration}ms`,
        error: error.message,
        stack: error.stack
      });
    } finally {


      // ALWAYS close widget and re-enable annotation mode, even if save fails
      // Pass skipReEnable=true to avoid double re-enabling since we handle it explicitly below
      this.closeInlineCommentWidget(pointa, true);

      // Re-enable annotation mode for continuous inspection
      this.reEnableAnnotationMode(pointa);
    }
  }

  /**
   * Show API offline overlay with instructions to start the server
   * @param {object} pointa - Reference to Pointa instance
   */
  static showAPIOfflineOverlay(pointa) {
    // Temporarily disable annotation mode to allow overlay interactions
    this.tempDisableAnnotationMode(pointa);

    // Close any existing overlay
    const existingOverlay = document.querySelector('.pointa-api-offline-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
      // Clear any existing polling interval
      if (existingOverlay._statusCheckInterval) {
        clearInterval(existingOverlay._statusCheckInterval);
      }
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'pointa-api-offline-overlay';
    overlay.setAttribute('data-pointa-theme', PointaThemeManager.getEffective());

    overlay.innerHTML = `
      <div class="pointa-api-offline-content">
        <div class="pointa-api-offline-header">
          <div class="pointa-api-offline-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div>
            <h3 class="pointa-api-offline-title">Server Not Running</h3>
            <p class="pointa-api-offline-description">To save annotations, you need to start the Pointa server. This allows your AI coding assistant to access and process your feedback.</p>
          </div>
        </div>
        
        <div class="pointa-api-offline-code-block">
          <code class="pointa-api-offline-code">pointa-server start</code>
          <button class="pointa-api-offline-copy-btn" data-copy-command>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
        
        <p class="pointa-api-offline-note">
          <strong>What does this do?</strong><br>
          The server writes your annotations to <code>~/.pointa/annotations.json</code>, making them accessible to AI coding tools like Cursor, Claude, and others through the Model Context Protocol (MCP).
        </p>
        
        <div class="pointa-api-offline-actions">
          <button class="pointa-api-offline-close-btn" data-close-overlay>Got it</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Set up event listeners
    const copyBtn = overlay.querySelector('[data-copy-command]');
    const closeBtn = overlay.querySelector('[data-close-overlay]');

    // Copy button handler
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('pointa-server start');

        // Update button to show success
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Copied!
        `;

        // Reset after 2 seconds
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          `;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy command:', err);
      }
    });

    // Close button handler
    const closeOverlay = () => {
      // Clear polling interval when closing
      if (overlay._statusCheckInterval) {
        clearInterval(overlay._statusCheckInterval);
      }
      overlay.remove();
      // Re-enable annotation mode
      this.reEnableAnnotationMode(pointa);
    };

    closeBtn.addEventListener('click', closeOverlay);

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeOverlay();
      }
    });

    // ESC to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeOverlay();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Start aggressive polling while overlay is open (every 1 second)
    // When server comes online, automatically close overlay and start annotation mode
    overlay._statusCheckInterval = setInterval(async () => {
      // Clear cache to force fresh check
      pointa.clearAPIStatusCache();

      const apiStatus = await pointa.checkAPIStatus();

      if (apiStatus.connected) {
        // Server is online! Clean up and start annotation mode
        clearInterval(overlay._statusCheckInterval);
        overlay.remove();
        document.removeEventListener('keydown', escHandler);

        // Start annotation mode automatically
        await this.startAnnotationMode(pointa);
      }
    }, 1000); // Check every 1 second while overlay is visible
  }

  /**
   * Close the inline comment widget
   * @param {object} pointa - Reference to Pointa instance
   * @param {boolean} skipReEnable - If true, don't re-enable annotation mode (caller will handle it)
   */
  static closeInlineCommentWidget(pointa, skipReEnable = false) {
    if (pointa.currentCommentWidget) {
      // Store element reference before clearing
      const elementToCleanup = pointa.currentHighlightedElement;
      // Store widget reference before clearing
      const widgetToRemove = pointa.currentCommentWidget;

      // Save draft in-memory if there's text in the textarea (but not if editing existing annotation)
      const textarea = widgetToRemove.querySelector('.pointa-inline-comment-textarea');
      const context = pointa.currentCommentContext;
      const element = pointa.currentCommentElement;
      const annotation = pointa.currentCommentAnnotation;
      if (textarea && context && element && textarea.value.trim() && !annotation) {
        // Only save drafts for NEW annotations, not edits
        // Store in-memory with element reference to ensure exact match
        pointa.commentDraft = {
          text: textarea.value,
          selector: context.selector,
          element: element, // Store element reference for exact matching
          timestamp: Date.now()
        };

      }

      // Remove event listeners
      if (widgetToRemove.escHandler) {
        document.removeEventListener('keydown', widgetToRemove.escHandler);
      }
      if (widgetToRemove.clickOutsideHandler) {
        document.removeEventListener('click', widgetToRemove.clickOutsideHandler);
      }
      if (widgetToRemove.enterKeyHandler) {
        const textarea = widgetToRemove.querySelector('.pointa-inline-comment-textarea');
        if (textarea) {
          textarea.removeEventListener('keydown', widgetToRemove.enterKeyHandler);
        }
      }
      if (widgetToRemove.updatePosition) {
        window.removeEventListener('scroll', widgetToRemove.updatePosition);
        window.removeEventListener('resize', widgetToRemove.updatePosition);
      }

      // Remove widget-active class from all badges to re-enable hover transforms and pointer events
      const allBadges = document.querySelectorAll('.pointa-badge.widget-active');
      allBadges.forEach((badge) => {
        badge.classList.remove('widget-active');
        // Force style recalculation to ensure pointer events are restored immediately
        badge.offsetHeight;
      });

      // Clear references IMMEDIATELY to prevent any re-use
      pointa.currentCommentWidget = null;
      pointa.currentCommentElement = null;
      pointa.currentCommentContext = null;
      pointa.currentCommentAnnotation = null;
      pointa.currentHighlightedElement = null;

      // Fade out and remove widget from DOM - Figma-style
      if (widgetToRemove && widgetToRemove.parentNode) {
        widgetToRemove.style.opacity = '0';
        widgetToRemove.style.transform = 'translateX(-8px) scale(0.95)';
        setTimeout(() => {
          if (widgetToRemove && widgetToRemove.parentNode) {
            widgetToRemove.remove();
          }
          // Clear highlight after widget is removed to avoid flicker
          if (elementToCleanup) {
            elementToCleanup.classList.remove('pointa-highlight');
          }
        }, 150);
      } else {
        // If no widget found, clear highlight immediately
        if (elementToCleanup) {
          elementToCleanup.classList.remove('pointa-highlight');
        }
      }

      // Re-enable annotation mode if it was active and caller didn't request to skip
      // (This allows caller to control re-enabling to avoid double calls)
      if (!skipReEnable && pointa.isAnnotationMode) {
        this.reEnableAnnotationMode(pointa);
      }
    }
  }
}

// Make class available globally
window.PointaAnnotationMode = PointaAnnotationMode;
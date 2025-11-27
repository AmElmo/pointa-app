// Context Analyzer & Source Mapping Module
// Handles framework detection, source code mapping, and element context analysis

const VibeContextAnalyzer = {
  
  /**
   * Get parent chain context for element (up to maxDepth levels)
   */
  getParentChainContext(element, maxDepth = 3) {
    const parentChain = [];
    let current = element.parentElement;
    let depth = 0;
    
    while (current && depth < maxDepth && current.tagName !== 'BODY') {
      const parentInfo = {
        tag: current.tagName.toLowerCase(),
        classes: Array.from(current.classList),
        id: current.id || null,
        role: current.getAttribute('role') || null,
        text_sample: current.textContent.substring(0, 50).trim()
      };
      
      // Only include meaningful parents (not just divs without context)
      if (parentInfo.classes.length > 0 || parentInfo.id || parentInfo.role || 
          ['nav', 'header', 'footer', 'main', 'section', 'article', 'aside'].includes(parentInfo.tag)) {
        parentChain.push(parentInfo);
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return parentChain.length > 0 ? parentChain : null;
  },

  /**
   * Generate source mapping information for element
   */
  generateSourceMapping(element) {
    try {
      // Get source mapping information
      const sourceInfo = this.extractSourceInfo(element);
      
      // Get route-based project area
      const projectArea = this.getProjectAreaFromURL();
      const urlPath = new URL(window.location.href).pathname;
      
      // Always generate context hints for semantic understanding
      const contextHints = this.generateContextHints(element);
      
      return {
        source_file_path: sourceInfo.filePath || null,
        source_line_range: sourceInfo.lineRange || null,
        project_area: projectArea,
        url_path: urlPath,
        source_map_available: sourceInfo.hasSourceMap || false,
        context_hints: contextHints
      };
      
    } catch (error) {
      return {
        source_file_path: null,
        source_line_range: null,
        project_area: 'unknown',
        url_path: window.location.pathname || '/',
        source_map_available: false,
        context_hints: this.generateContextHints(element)
      };
    }
  },

  /**
   * Generate semantic context hints for element
   */
  generateContextHints(element) {
    const hints = [];
    
    // 1. Semantic hierarchy - what type of UI section is this?
    const semanticRole = this.inferSemanticRole(element);
    if (semanticRole) {
      hints.push(`UI section: ${semanticRole}`);
    }
    
    // 2. Component depth and nesting level
    const componentDepth = this.getComponentDepth(element);
    if (componentDepth > 1) {
      hints.push(`Nested ${componentDepth} levels deep in component hierarchy`);
    }
    
    // 3. Framework-specific patterns (React/Next.js bonus detection)
    const frameworkHints = this.detectFrameworkPatterns(element);
    if (frameworkHints.length > 0) {
      hints.push(...frameworkHints);
    }
    
    // 4. Likely file location based on semantic role and URL
    const fileLocationHint = this.inferFileLocation(element, semanticRole);
    if (fileLocationHint) {
      hints.push(`Likely file: ${fileLocationHint}`);
    }
    
    return hints.length > 0 ? hints : null;
  },

  /**
   * Infer semantic role of element (navigation, header, footer, etc.)
   */
  inferSemanticRole(element) {
    // Determine what type of UI section this element represents
    
    // Check element itself first
    if (element.closest('nav, [role="navigation"]')) return 'navigation';
    if (element.closest('header, [role="banner"]')) return 'header';
    if (element.closest('footer, [role="contentinfo"]')) return 'footer';
    if (element.closest('aside, [role="complementary"]')) return 'sidebar';
    if (element.closest('main, [role="main"]')) return 'main-content';
    if (element.closest('form, [role="form"]')) return 'form';
    
    // Check for modal/dialog patterns
    if (element.closest('[role="dialog"], .modal, .popup, .overlay')) return 'modal';
    
    // Check for card/item patterns
    if (element.closest('.card, .item, .post, .article, [role="article"]')) return 'content-card';
    
    // Check for list item patterns
    if (element.closest('li, [role="listitem"], .list-item')) return 'list-item';
    
    // Check for button/interactive patterns
    if (element.matches('button, [role="button"], .btn, .button')) return 'button';
    if (element.matches('input, select, textarea, [role="textbox"]')) return 'form-input';
    
    // Check for table patterns
    if (element.closest('table, [role="table"], [role="grid"]')) return 'table';
    
    return null;
  },
  
  /**
   * Get component nesting depth
   */
  getComponentDepth(element) {
    // Count how many component-like containers this element is nested within
    let depth = 0;
    let current = element.parentElement;
    const maxDepth = 10;
    
    while (current && depth < maxDepth && current.tagName !== 'BODY') {
      // Look for component-like patterns
      const classes = Array.from(current.classList);
      const hasComponentPattern = classes.some(cls => 
        /^[A-Z][a-zA-Z0-9]*/.test(cls) || // PascalCase
        cls.includes('component') ||
        cls.includes('container') ||
        cls.includes('wrapper')
      );
      
      if (hasComponentPattern) {
        depth++;
      }
      
      current = current.parentElement;
    }
    
    return depth;
  },
  
  /**
   * Detect framework-specific patterns
   */
  detectFrameworkPatterns(element) {
    const patterns = [];
    
    // Look for React-specific patterns
    if (element.hasAttribute('data-testid')) {
      patterns.push(`React test ID: ${element.getAttribute('data-testid')}`);
    }
    
    // Look for Next.js specific patterns
    if (element.closest('[data-nextjs-scroll-focus-boundary]') ||
        document.querySelector('script[src*="_next"]')) {
      patterns.push('Next.js app detected');
    }
    
    // Look for CSS-in-JS patterns (styled-components, emotion, etc.)
    const classes = Array.from(element.classList);
    const hasCSSInJS = classes.some(cls => 
      /^[a-z0-9]{6,}$/.test(cls) || // Hash-like classes
      cls.startsWith('css-') ||
      cls.startsWith('emotion-')
    );
    if (hasCSSInJS) {
      patterns.push('CSS-in-JS styling detected');
    }
    
    return patterns;
  },
  
  /**
   * Infer likely file location based on semantic role and URL
   */
  inferFileLocation(element, semanticRole) {
    const pathname = window.location.pathname;
    const segments = pathname.split('/').filter(s => s);
    
    // For Next.js App Router patterns
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      
      // Common Next.js file patterns
      if (semanticRole === 'header') return `components/Header.tsx or app/layout.tsx`;
      if (semanticRole === 'footer') return `components/Footer.tsx or app/layout.tsx`;
      if (semanticRole === 'navigation') return `components/Navigation.tsx`;
      if (semanticRole === 'main-content') return `app/${segments.join('/')}/page.tsx`;
      if (semanticRole === 'modal') return `components/Modal.tsx or components/dialogs/`;
      
      // Page-specific components
      if (lastSegment) {
        return `app/${segments.join('/')}/page.tsx or components/${PointaUtils.capitalize(lastSegment)}Page.tsx`;
      }
    }
    
    // Fallback for root pages
    if (semanticRole === 'main-content') return 'app/page.tsx or pages/index.tsx';
    
    return null;
  },
  
  /**
   * Get project area from URL path
   */
  getProjectAreaFromURL() {
    const url = new URL(window.location.href);
    const pathname = url.pathname;
    
    // Remove leading slash and split path segments
    const segments = pathname.substring(1).split('/').filter(seg => seg.length > 0);
    
    // If no segments, it's the home/root area
    if (segments.length === 0) {
      return 'home';
    }
    
    // Use the first segment as the primary project area
    const primaryArea = segments[0].toLowerCase();
    
    // Map common patterns to normalized areas
    const areaMap = {
      // Admin/Dashboard areas
      'admin': 'admin',
      'dashboard': 'dashboard',
      'control-panel': 'admin',
      'cp': 'admin',
      
      // User areas
      'users': 'users',
      'user': 'users',
      'profile': 'users',
      'profiles': 'users',
      'account': 'users',
      'accounts': 'users',
      
      // Product areas
      'products': 'products',
      'product': 'products',
      'items': 'products',
      'item': 'products',
      'catalog': 'products',
      
      // Order/Commerce areas
      'orders': 'orders',
      'order': 'orders',
      'checkout': 'orders',
      'cart': 'orders',
      'shopping': 'orders',
      
      // Content areas
      'posts': 'content',
      'post': 'content',
      'articles': 'content',
      'article': 'content',
      'blog': 'content',
      'news': 'content',
      
      // Settings areas
      'settings': 'settings',
      'config': 'settings',
      'configuration': 'settings',
      'preferences': 'settings',
      
      // Auth areas
      'login': 'auth',
      'signin': 'auth',
      'signup': 'auth',
      'register': 'auth',
      'auth': 'auth',
      'authentication': 'auth'
    };
    
    // Return mapped area or use the primary segment as-is
    return areaMap[primaryArea] || primaryArea;
  },

  /**
   * Validate if file path is a component file
   */
  isValidComponentFile(filePath) {
    if (!filePath) return false;
    
    // Check if it's in a component directory
    const isInComponentDir = filePath.includes('component') || filePath.includes('/ui/');
    
    // Check if it's NOT a page/layout/route file (Next.js, Remix, etc.)
    const isPageFile = /\/(page|layout|route|error|loading|not-found|template|_app|_document)\./.test(filePath);
    
    // Must be in component directory and not a page file
    // (Naming convention doesn't matter - both PascalCase and kebab-case are valid)
    return isInComponentDir && !isPageFile;
  },

  /**
   * Extract source information from element
   * Tries multiple framework-specific detection strategies
   */
  extractSourceInfo(element) {
    let sourceInfo = {
      filePath: null,
      lineRange: null,
      hasSourceMap: false
    };

    // Try React fiber detection first (most reliable for React/Next.js)
    try {
      const reactInfo = this.getReactFiberInfo(element);
      if (reactInfo && this.isValidComponentFile(reactInfo.filePath)) {
        sourceInfo = { ...sourceInfo, ...reactInfo };
      }
    } catch (error) {
      // Continue with fallback methods
    }

    // Try Vue detection
    if (!sourceInfo.filePath) {
      try {
        const vueInfo = this.getVueComponentInfo(element);
        if (vueInfo && this.isValidComponentFile(vueInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...vueInfo };
        }
      } catch (error) {
        // Continue with fallback methods
      }
    }

    // Try Svelte detection
    if (!sourceInfo.filePath) {
      try {
        const svelteInfo = this.getSvelteComponentInfo(element);
        if (svelteInfo && this.isValidComponentFile(svelteInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...svelteInfo };
        }
      } catch (error) {
        // Continue with fallback methods
      }
    }

    // Try Angular detection
    if (!sourceInfo.filePath) {
      try {
        const angularInfo = this.getAngularComponentInfo(element);
        if (angularInfo && this.isValidComponentFile(angularInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...angularInfo };
        }
      } catch (error) {
        // Continue with fallback methods
      }
    }

    // Try data attribute detection (generic fallback)
    if (!sourceInfo.filePath) {
      try {
        const dataInfo = this.getDataAttributeInfo(element);
        if (dataInfo && this.isValidComponentFile(dataInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...dataInfo };
        }
      } catch (error) {
        // Continue with empty source info
      }
    }

    return sourceInfo;
  },

  /**
   * Get React Fiber source info (works in development mode)
   */
  getReactFiberInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for React fiber keys
      const allKeys = Object.keys(current);
      const fiberKey = allKeys.find(key => 
        key.startsWith('__reactFiber') || 
        key.startsWith('__reactInternalInstance') ||
        key.startsWith('_reactInternalFiber')
      );
      
      if (fiberKey) {
        const fiber = current[fiberKey];
        
        if (fiber) {
          // Walk up the fiber tree to find source info
          let fiberNode = fiber;
          let fiberDepth = 0;
          const maxFiberDepth = 20;
          
          while (fiberNode && fiberDepth < maxFiberDepth) {
            // Check for source information in various locations
            const source = fiberNode._debugSource || 
                          fiberNode._source ||
                          fiberNode.elementType?._source ||
                          fiberNode.type?._source;
            
            if (source && source.fileName) {
              return {
                filePath: this.normalizeSourcePath(source.fileName),
                lineRange: source.lineNumber ? `${source.lineNumber}-${source.lineNumber + 10}` : null,
                hasSourceMap: true
              };
            }

            // Try alternate location for Next.js
            if (fiberNode._debugOwner) {
              const ownerSource = fiberNode._debugOwner._debugSource || 
                                 fiberNode._debugOwner._source;
              if (ownerSource && ownerSource.fileName) {
                return {
                  filePath: this.normalizeSourcePath(ownerSource.fileName),
                  lineRange: ownerSource.lineNumber ? `${ownerSource.lineNumber}-${ownerSource.lineNumber + 10}` : null,
                  hasSourceMap: true
                };
              }
            }

            // Move up the fiber tree
            fiberNode = fiberNode.return || fiberNode._debugOwner;
            fiberDepth++;
          }
        }
      }

      // Move up the DOM tree
      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get Vue component info (works in development mode)
   */
  getVueComponentInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for Vue 3 instance
      const allKeys = Object.keys(current);
      const vueKey = allKeys.find(key => 
        key.startsWith('__vueParentComponent') || 
        key.startsWith('__vnode') ||
        key.startsWith('__vue_app__')
      );
      
      if (vueKey) {
        const vueInstance = current[vueKey];
        
        if (vueInstance) {
          // Try to get component info from various Vue 3 internals
          let componentInfo = vueInstance.type || vueInstance.component || vueInstance;
          
          // Check for __file property (added by Vue compiler in dev mode)
          if (componentInfo && componentInfo.__file) {
            return {
              filePath: this.normalizeSourcePath(componentInfo.__file),
              lineRange: null,
              hasSourceMap: true
            };
          }
          
          // Check parent component chain
          let parent = vueInstance.parent;
          let parentDepth = 0;
          while (parent && parentDepth < 10) {
            if (parent.type && parent.type.__file) {
              return {
                filePath: this.normalizeSourcePath(parent.type.__file),
                lineRange: null,
                hasSourceMap: true
              };
            }
            parent = parent.parent;
            parentDepth++;
          }
        }
      }
      
      // Check for Vue 2 instance
      if (current.__vue__) {
        const vue2Instance = current.__vue__;
        if (vue2Instance.$options && vue2Instance.$options.__file) {
          return {
            filePath: this.normalizeSourcePath(vue2Instance.$options.__file),
            lineRange: null,
            hasSourceMap: true
          };
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get Svelte component info (works in development mode)
   */
  getSvelteComponentInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for Svelte component metadata
      const allKeys = Object.keys(current);
      const svelteKey = allKeys.find(key => 
        key.startsWith('__svelte_meta') || 
        key.startsWith('__svelte')
      );
      
      if (svelteKey) {
        const svelteData = current[svelteKey];
        
        // Svelte dev mode can expose component file info
        if (svelteData && svelteData.loc) {
          return {
            filePath: this.normalizeSourcePath(svelteData.loc.file || svelteData.loc.source),
            lineRange: svelteData.loc.line ? `${svelteData.loc.line}-${svelteData.loc.line + 10}` : null,
            hasSourceMap: true
          };
        }
        
        if (svelteData && svelteData.file) {
          return {
            filePath: this.normalizeSourcePath(svelteData.file),
            lineRange: null,
            hasSourceMap: true
          };
        }
      }
      
      // Check for Svelte scoped attribute which might contain component info
      const dataAttr = current.getAttribute('data-svelte-h') || current.getAttribute('data-s-');
      if (dataAttr) {
        // Try to find component info from class names (Svelte uses scoped CSS)
        const classes = Array.from(current.classList);
        const svelteClass = classes.find(cls => cls.startsWith('svelte-'));
        
        // Check if there's a global Svelte registry with component info
        if (window.__SVELTE_DEVTOOLS_GLOBAL_HOOK__) {
          try {
            const hook = window.__SVELTE_DEVTOOLS_GLOBAL_HOOK__;
            if (hook.components) {
              // Try to find component that matches this element
              for (const [id, component] of hook.components.entries()) {
                if (component && component.detail && component.detail.$$) {
                  const svelteInternal = component.detail.$$;
                  if (svelteInternal.file) {
                    return {
                      filePath: this.normalizeSourcePath(svelteInternal.file),
                      lineRange: null,
                      hasSourceMap: true
                    };
                  }
                }
              }
            }
          } catch (error) {
            // Continue if devtools hook fails
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get Angular component info (works in development mode)
   */
  getAngularComponentInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for Angular context (Ivy renderer)
      const allKeys = Object.keys(current);
      const ngKey = allKeys.find(key => 
        key.startsWith('__ngContext__') || 
        key.startsWith('__ng_debug__')
      );
      
      if (ngKey) {
        const ngContext = current[ngKey];
        
        if (ngContext) {
          // Try to extract component info from Angular's debug context
          let componentDef = null;
          
          // Angular Ivy stores component metadata
          if (Array.isArray(ngContext)) {
            // Context is an array, look for component definition
            for (const item of ngContext) {
              if (item && typeof item === 'object') {
                if (item.type && item.type.ɵcmp) {
                  componentDef = item.type.ɵcmp;
                  break;
                }
                if (item.component) {
                  componentDef = item.component;
                  break;
                }
              }
            }
          } else if (ngContext.component) {
            componentDef = ngContext.component;
          }
          
          // Check if component definition has file info
          if (componentDef) {
            // Angular dev mode sometimes exposes __NG_ELEMENT_ID__ or source info
            if (componentDef.__file) {
              return {
                filePath: this.normalizeSourcePath(componentDef.__file),
                lineRange: null,
                hasSourceMap: true
              };
            }
            
            // Try to get info from constructor name and project structure
            if (componentDef.constructor && componentDef.constructor.name) {
              const componentName = componentDef.constructor.name;
              // Angular convention: ButtonComponent -> button.component.ts
              if (componentName.endsWith('Component')) {
                const fileName = componentName
                  .replace(/Component$/, '')
                  .replace(/([A-Z])/g, (match, p1, offset) => offset > 0 ? '-' + p1.toLowerCase() : p1.toLowerCase());
                return {
                  filePath: `components/${fileName}.component.ts`,
                  lineRange: null,
                  hasSourceMap: false // This is inferred, not from source maps
                };
              }
            }
          }
        }
      }
      
      // Check for Angular attribute directives
      const ngComponent = current.getAttribute('ng-version');
      if (ngComponent && window.ng && window.ng.probe) {
        try {
          const debugElement = window.ng.probe(current);
          if (debugElement && debugElement.componentInstance) {
            const instance = debugElement.componentInstance;
            const constructor = instance.constructor;
            if (constructor && constructor.name && constructor.name.endsWith('Component')) {
              const componentName = constructor.name;
              const fileName = componentName
                .replace(/Component$/, '')
                .replace(/([A-Z])/g, (match, p1, offset) => offset > 0 ? '-' + p1.toLowerCase() : p1.toLowerCase());
              return {
                filePath: `components/${fileName}.component.ts`,
                lineRange: null,
                hasSourceMap: false // This is inferred
              };
            }
          }
        } catch (error) {
          // ng.probe might not be available
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get data attribute source info (generic fallback)
   */
  getDataAttributeInfo(element) {
    let current = element;
    const maxDepth = 5;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check ALL data attributes for file path patterns
      const allAttributes = current.attributes;
      for (let i = 0; i < allAttributes.length; i++) {
        const attr = allAttributes[i];
        
        // Look for any data-* attribute that contains a file path pattern
        if (attr.name.startsWith('data-') && attr.value) {
          // Check if value looks like a file path with component indicators
          // Patterns: "path/to/file.tsx:15:5:span" or "components/Button.jsx" etc.
          const filePathPattern = /([a-zA-Z0-9_\-\/\.]+\.(tsx?|jsx?|vue|svelte))(?::(\d+))?/;
          const match = attr.value.match(filePathPattern);
          
          if (match) {
            const filePath = match[1];
            const lineNumber = match[3];
            
            return {
              filePath: this.normalizeSourcePath(filePath),
              lineRange: lineNumber ? `${lineNumber}-${parseInt(lineNumber) + 10}` : null,
              hasSourceMap: true
            };
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Normalize source file path
   */
  normalizeSourcePath(filePath) {
    // Remove common prefixes and normalize path
    let normalized = filePath
      // Remove build tool prefixes
      .replace(/^\[project\]\//, '')
      .replace(/^\[turbopack\]\//, '')
      .replace(/^\[next\]\//, '')
      .replace(/^webpack:\/\/\//, '')
      .replace(/^vite:\/\/\//, '')
      // Next.js App Router patterns (preserve full path for clarity)
      .replace(/^.*\/(app\/.*?)$/, '$1')
      // React/SPA patterns
      .replace(/^.*\/src\//, 'src/')
      .replace(/^.*\/components\//, 'components/')
      .replace(/^.*\/pages\//, 'pages/')
      // Vue patterns
      .replace(/^.*\/views\//, 'views/')
      // Angular patterns  
      .replace(/^.*\/app\//, 'app/')
      // Svelte patterns
      .replace(/^.*\/routes\//, 'routes/')
      .replace(/^.*\/lib\//, 'lib/')
      // Rails patterns
      .replace(/^.*\/app\/views\//, 'app/views/')
      .replace(/^.*\/app\/assets\//, 'app/assets/')
      .replace(/^.*\/app\/controllers\//, 'app/controllers/')
      .replace(/^.*\/app\/models\//, 'app/models/')
      .replace(/^.*\/app\/helpers\//, 'app/helpers/')
      // Django patterns
      .replace(/^.*\/templates\//, 'templates/')
      .replace(/^.*\/static\//, 'static/')
      // General web patterns
      .replace(/^.*\/public\//, 'public/')
      .replace(/^.*\/assets\//, 'assets/')
      .replace(/^.*\/js\//, 'js/')
      .replace(/^.*\/css\//, 'css/')
      .replace(/^.*\/scss\//, 'scss/')
      .replace(/^.*\/styles\//, 'styles/')
      // Remove query parameters and hash
      .replace(/\?.*$/, '')
      .replace(/#.*$/, '');
    
    // For Next.js app directory, ensure we preserve the app/ prefix
    if (!normalized.startsWith('app/') && normalized.includes('/app/')) {
      normalized = 'app/' + normalized.split('/app/')[1];
    }
    
    return normalized;
  },

  /**
   * Detect CSS framework from class patterns
   */
  detectCSSFramework(classes, computedStyle) {
    const classString = classes.join(' ');
    
    // Tailwind detection (utility classes like text-lg, p-4, flex, etc.)
    const tailwindPatterns = [
      /^(text|bg|border|rounded|shadow|p|m|px|py|mx|my|mt|mb|ml|mr|pt|pb|pl|pr)-/,
      /^(flex|grid|block|inline|hidden)/,
      /^(w|h|min-w|max-w|min-h|max-h)-/,
      /^(gap|space-x|space-y)-/,
      /^(font|leading|tracking)-/,
      /^(text-center|text-left|text-right)/
    ];
    const hasTailwind = tailwindPatterns.some(pattern => 
      classes.some(cls => pattern.test(cls))
    );
    
    // Bootstrap detection (btn, btn-primary, col-md-6, etc.)
    const bootstrapPatterns = [
      /^(btn|col|row|container|nav|navbar|card|modal|alert|badge)-/,
      /^(d-flex|d-grid|d-none|d-block)/,
      /^(m-|p-|mt-|mb-|ml-|mr-|pt-|pb-|pl-|pr-)\d/,
      /^(text-center|text-left|text-right|text-muted)/
    ];
    const hasBootstrap = bootstrapPatterns.some(pattern =>
      classes.some(cls => pattern.test(cls))
    );
    
    // CSS-in-JS detection (emotion, styled-components - hash-like classes)
    const hasCSSInJS = classes.some(cls => 
      /^[a-z0-9]{6,}$/.test(cls) || cls.startsWith('css-') || cls.startsWith('emotion-')
    );
    
    // CSS Modules detection (ComponentName_className_hash)
    const hasCSSModules = classes.some(cls => /_[a-zA-Z0-9]{5,}$/.test(cls));
    
    if (hasTailwind) return { framework: 'tailwind', confidence: 'high' };
    if (hasBootstrap) return { framework: 'bootstrap', confidence: 'high' };
    if (hasCSSInJS) return { framework: 'css-in-js', confidence: 'medium' };
    if (hasCSSModules) return { framework: 'css-modules', confidence: 'medium' };
    
    return { framework: 'custom', confidence: 'low' };
  },
  
  /**
   * Analyze element reusability (component instance vs one-off)
   */
  analyzeElementReusability(element, context) {
    const tag = context.tag;
    const classes = context.classes;
    
    // Find similar elements (same tag + overlapping classes)
    let similarElements = [];
    if (classes.length > 0) {
      // Use the most specific class for matching
      const specificClass = classes[0];
      similarElements = Array.from(document.querySelectorAll(`${tag}.${CSS.escape(specificClass)}`));
    } else {
      similarElements = Array.from(document.querySelectorAll(tag));
    }
    
    const instanceCount = similarElements.length;
    const isUnique = instanceCount === 1;
    const likelyComponent = instanceCount > 2;
    
    // Check if element has unique identifier
    const hasUniqueId = !!element.id;
    const hasUniqueClass = classes.some(cls => 
      document.querySelectorAll(`.${CSS.escape(cls)}`).length === 1
    );
    
    return {
      instances_on_page: instanceCount,
      is_unique: isUnique,
      likely_component: likelyComponent,
      has_unique_id: hasUniqueId,
      has_unique_class: hasUniqueClass,
      primary_class: classes[0] || null,
      recommendation: likelyComponent 
        ? 'Consider applying to component definition, not just this instance' 
        : 'Single instance - safe to apply inline or to specific element'
    };
  },
  
  /**
   * Detect styling approach (utility classes, inline, scoped, etc.)
   */
  detectStylingApproach(element, classes) {
    const hasInlineStyles = element.hasAttribute('style');
    const inlineStylesCount = hasInlineStyles 
      ? element.getAttribute('style').split(';').filter(s => s.trim()).length 
      : 0;
    
    // Check if using utility classes (many small classes)
    const utilityClassPattern = classes.length > 5 && classes.every(cls => cls.length < 20);
    
    // Check for scoped attribute (Vue, Svelte)
    const hasScoped = element.hasAttribute('data-v-') || element.hasAttribute('data-s-');
    
    // Check for CSS Modules pattern
    const hasCSSModules = classes.some(cls => /_[a-zA-Z0-9]{5,}$/.test(cls));
    
    return {
      uses_inline_styles: hasInlineStyles,
      inline_styles_count: inlineStylesCount,
      uses_utility_classes: utilityClassPattern,
      uses_scoped_styles: hasScoped,
      uses_css_modules: hasCSSModules,
      class_count: classes.length,
      recommended_approach: hasInlineStyles 
        ? 'inline-style-override' 
        : utilityClassPattern 
        ? 'utility-class-change' 
        : 'component-class-modification'
    };
  },
  
  /**
   * Analyze the pattern of CSS changes
   */
  analyzeChangePattern(cssChanges, fullComputedStyles) {
    const changedProperties = Object.keys(cssChanges);
    const changeCount = changedProperties.length;
    
    // Categorize changes
    const typographyProps = ['fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign', 'textDecoration', 'fontStyle'];
    const spacingProps = ['padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap'];
    const colorProps = ['color', 'backgroundColor', 'borderColor'];
    const visualProps = ['borderRadius', 'boxShadow', 'opacity', 'borderWidth', 'borderStyle'];
    
    const categories = {
      typography: changedProperties.filter(p => typographyProps.includes(p)),
      spacing: changedProperties.filter(p => spacingProps.includes(p)),
      colors: changedProperties.filter(p => colorProps.includes(p)),
      visual: changedProperties.filter(p => visualProps.includes(p)),
      other: changedProperties.filter(p => 
        !typographyProps.includes(p) && 
        !spacingProps.includes(p) && 
        !colorProps.includes(p) && 
        !visualProps.includes(p)
      )
    };
    
    // Detect if spacing changes follow a grid system (8px, 16px, 24px, etc.)
    const spacingValues = changedProperties
      .filter(p => spacingProps.includes(p))
      .map(p => cssChanges[p].new)
      .filter(v => v && v.endsWith('px'))
      .map(v => parseInt(v));
    
    const follows8pxGrid = spacingValues.every(v => v % 8 === 0);
    const follows4pxGrid = spacingValues.every(v => v % 4 === 0);
    
    // Detect symmetric changes (e.g., paddingTop and paddingBottom changed equally)
    const hasSymmetricPadding = 
      cssChanges.paddingTop && cssChanges.paddingBottom &&
      cssChanges.paddingTop.new === cssChanges.paddingBottom.new;
    const hasSymmetricMargin = 
      cssChanges.marginTop && cssChanges.marginBottom &&
      cssChanges.marginTop.new === cssChanges.marginBottom.new;
    
    // Determine change type
    let changeType = 'mixed';
    if (categories.typography.length > 0 && categories.spacing.length === 0) changeType = 'typography-only';
    else if (categories.spacing.length > 0 && categories.typography.length === 0) changeType = 'spacing-only';
    else if (categories.colors.length > 0 && changeCount === categories.colors.length) changeType = 'color-only';
    else if (categories.visual.length > 0 && changeCount === categories.visual.length) changeType = 'visual-only';
    
    return {
      change_count: changeCount,
      change_type: changeType,
      categories: categories,
      follows_design_system: follows8pxGrid || follows4pxGrid,
      grid_system: follows8pxGrid ? '8px' : follows4pxGrid ? '4px' : 'none',
      is_symmetric: hasSymmetricPadding || hasSymmetricMargin,
      is_systematic: (follows8pxGrid || follows4pxGrid) && (hasSymmetricPadding || hasSymmetricMargin)
    };
  },
  
  /**
   * Analyze component architecture context
   */
  analyzeComponentContext(element, context) {
    const sourceFile = context.source_mapping?.source_file_path || '';
    const contextHints = context.source_mapping?.context_hints || [];
    
    // Detect if this is a component file based on path patterns
    const isComponentFile = 
      sourceFile.includes('/components/') || 
      sourceFile.includes('/widgets/') ||
      sourceFile.includes('/views/') ||  // Vue
      sourceFile.includes('/routes/') ||  // Svelte
      sourceFile.includes('/lib/') ||     // Svelte
      /[A-Z][a-zA-Z0-9]*\.(tsx|jsx|vue|svelte)$/.test(sourceFile) ||  // React, Vue, Svelte
      /[a-z-]+\.component\.(ts|html|scss)$/.test(sourceFile);  // Angular
    
    // Extract component name from file path
    let componentName = null;
    if (isComponentFile) {
      // React/Vue/Svelte: Button.tsx, Button.vue, Button.svelte
      let match = sourceFile.match(/\/([A-Z][a-zA-Z0-9]*)\.(tsx|jsx|vue|svelte)$/);
      if (match) {
        componentName = match[1];
      } else {
        // Angular: button.component.ts -> ButtonComponent
        match = sourceFile.match(/\/([a-z-]+)\.component\.(ts|html|scss)$/);
        if (match) {
          componentName = match[1]
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('') + 'Component';
        }
      }
    }
    
    // Detect framework from multiple sources (more reliable)
    let detectedFramework = 'unknown';
    
    // Check file extension first
    if (sourceFile.endsWith('.vue')) {
      detectedFramework = 'Vue';
    } else if (sourceFile.endsWith('.svelte')) {
      detectedFramework = 'Svelte';
    } else if (sourceFile.includes('.component.')) {
      detectedFramework = 'Angular';
    } else if (contextHints.some(h => h.includes('Next.js'))) {
      detectedFramework = 'Next.js';
    } else if (contextHints.some(h => h.includes('React'))) {
      detectedFramework = 'React';
    } else {
      // Check DOM for framework indicators
      if (document.querySelector('[data-v-]') || document.getElementById('app')?.__vue__) {
        detectedFramework = 'Vue';
      } else if (document.querySelector('[data-s-]') || document.querySelector('.svelte-')) {
        detectedFramework = 'Svelte';
      } else if (document.querySelector('[ng-version]')) {
        detectedFramework = 'Angular';
      } else if (document.getElementById('__next')) {
        detectedFramework = 'Next.js';
      } else if (document.querySelector('[data-reactroot]') || document.querySelector('[data-reactid]')) {
        detectedFramework = 'React';
      }
    }
    
    // Check if element is likely the root of a component
    const isLikelyComponentRoot = 
      isComponentFile && 
      (context.classes.some(cls => /^[A-Z]/.test(cls)) ||  // PascalCase class suggests component
       context.classes.some(cls => cls.includes('component')));  // Explicit component class
    
    return {
      is_component_file: isComponentFile,
      component_name: componentName,
      framework: detectedFramework,
      is_likely_root_element: isLikelyComponentRoot,
      file_type: sourceFile.split('.').pop() || 'unknown',
      recommendation: isComponentFile 
        ? `Edit component file: ${sourceFile}` 
        : 'Element not in a component file - safe to apply directly'
    };
  },
  
  /**
   * Generate human-readable summary of CSS changes
   */
  generateChangesSummary(cssChanges) {
    const formatPropertyName = (prop) => {
      // Convert camelCase to readable format
      return prop.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    };
    
    const changes = Object.entries(cssChanges).map(([property, change]) => {
      const propName = formatPropertyName(property);
      return `${propName}: ${change.old} → ${change.new}`;
    });
    
    if (changes.length === 0) return 'No changes';
    if (changes.length === 1) return changes[0];
    if (changes.length === 2) return changes.join(', ');
    
    // For 3+ changes, show first 2 and count
    return `${changes[0]}, ${changes[1]}, +${changes.length - 2} more`;
  }
  
};







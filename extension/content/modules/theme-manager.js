// Pointa Theme Manager
// Handles theme initialization, switching, and application

class ThemeManager {
  constructor() {
    this.currentTheme = null;
  }

  /**
   * Initialize theme system - load preference and set up listeners
   */
  async init() {
    try {
      // Load theme preference from extension storage
      const result = await chrome.storage.local.get(['themePreference']);
      const themePreference = result.themePreference || 'system';
      this.apply(themePreference);
      
      // Listen for theme changes
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.themePreference) {
          this.apply(changes.themePreference.newValue);
        }
      });
    } catch (error) {
      console.error('Error initializing theme:', error);
    }
  }

  /**
   * Apply theme to document
   * @param {string} themePreference - 'light', 'dark', or 'system'
   */
  apply(themePreference) {
    // Store current theme for modal creation
    this.currentTheme = themePreference;
    
    // Apply theme variables to document root via <style> tag
    // This prevents React hydration warnings on Next.js apps
    const effectiveTheme = this.getEffective();
    const themes = {
      light: {
        surface: '#f8f9fc',
        'surface-1': '#fcfcfd',
        'text-primary': '#0c111b',
        'text-secondary': '#697586',
        outline: '#00000014',
        'outline-highlight': '#00000028',
        accent: '#0c8ce9',
        'on-accent': '#ffffff',
        'surface-hover': '#0d0f1c14',
        warning: '#f79009',
        'on-warning': '#ffffff',
        'warning-container': '#f7900919',
        'on-warning-container': '#93370c'
      },
      dark: {
        surface: '#0d0f1c',
        'surface-1': '#13162a',
        'text-primary': '#fcfcfd',
        'text-secondary': '#697586',
        outline: '#ffffff19',
        'outline-highlight': '#ffffff32',
        accent: '#0c8ce9',
        'on-accent': '#ffffff',
        'surface-hover': '#fcfcfd14',
        warning: '#f79009',
        'on-warning': '#ffffff',
        'warning-container': '#f7900914',
        'on-warning-container': '#f79009'
      }
    };
    
    const tokens = themes[effectiveTheme];
    
    // Remove existing theme style if present
    const existingStyle = document.head.querySelector('style[data-pointa-theme]');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Create CSS custom properties as a style sheet
    const cssVars = Object.entries(tokens)
      .map(([key, value]) => `--theme-${key}: ${value};`)
      .join('\n    ');
    
    // Inject theme variables via <style> tag instead of inline styles
    // This prevents React hydration warnings in Next.js apps
    // Scope to [data-pointa-theme] elements only to avoid affecting host page
    const themeStyle = document.createElement('style');
    themeStyle.setAttribute('data-pointa-theme', 'true');
    themeStyle.textContent = `[data-pointa-theme] { ${cssVars} }`;
    document.head.appendChild(themeStyle);
  }

  /**
   * Get the effective theme (resolves 'system' to 'light' or 'dark')
   * @returns {string} 'light' or 'dark'
   */
  getEffective() {
    if (this.currentTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return this.currentTheme || 'light';
  }

  /**
   * Get current theme preference
   * @returns {string} Current theme ('light', 'dark', or 'system')
   */
  getCurrent() {
    return this.currentTheme;
  }

  /**
   * Inject Inter font face into document
   */
  injectFont() {
    // Create a style element for the font face
    const fontStyle = document.createElement('style');
    fontStyle.setAttribute('data-pointa-font', 'true');
    
    // Get the extension URL for the font file
    const fontUrl = chrome.runtime.getURL('assets/fonts/InterVariable.woff2');
    
    // Create the font face CSS
    fontStyle.textContent = `
      @font-face {
        font-family: 'Inter';
        src: url('${fontUrl}') format('woff2-variations');
        font-weight: 100 900;
        font-display: swap;
      }
    `;
    
    // Inject into document head
    document.head.appendChild(fontStyle);
  }
}

// Create and export singleton instance
window.PointaThemeManager = new ThemeManager();


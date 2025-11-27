// Pointa Popup - Minimal passthrough to sidebar
// This popup exists only to handle the extension icon click
// and immediately opens the sidebar in the active tab

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      console.error('No active tab found');
      window.close();
      return;
    }

    // Skip chrome:// and chrome-extension:// pages
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      window.close();
      return;
    }

    // Inject content scripts if not already injected (via background script)
    // This ensures scripts are loaded before we try to send messages
    try {
      const injectResponse = await chrome.runtime.sendMessage({
        action: 'ensureContentScriptsInjected',
        tabId: tab.id
      });
      if (!injectResponse || !injectResponse.success) {
        console.error('Failed to inject content scripts');
      }
      // Small delay to ensure scripts are loaded
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (error) {
      console.error('Error ensuring content scripts:', error);
      // Continue anyway - might work if scripts are already injected
    }

    // Check if tab is a supported URL (localhost, local dev domains, or local files)
    const url = tab.url || '';
    const isSupportedUrl =
    url.startsWith('http://localhost') ||
    url.startsWith('https://localhost') ||
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('https://127.0.0.1') ||
    url.startsWith('http://0.0.0.0') ||
    url.startsWith('https://0.0.0.0') ||
    url.match(/^https?:\/\/[^\/]+\.(local|test|localhost)(\/|$)/) ||
    url.startsWith('file:///');

    // For external sites, we still want to allow inspiration mode
    // So we'll inject and show sidebar, but sidebar will handle the context

    // Check if this is the first time using the extension
    const result = await chrome.storage.local.get(['onboardingCompleted']);

    if (!result.onboardingCompleted && isSupportedUrl) {
      // First time on localhost - show onboarding
      chrome.tabs.sendMessage(tab.id, { action: 'showOnboarding' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error showing onboarding:', chrome.runtime.lastError);
        }
        // Close popup immediately after sending message
        window.close();
      });
    } else {
      // Not first time - toggle sidebar as usual (works for both localhost and external sites)
      chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error toggling sidebar:', chrome.runtime.lastError);
        }
        // Close popup immediately after sending message
        window.close();
      });
    }

  } catch (error) {
    console.error('Error in popup:', error);
    window.close();
  }
});
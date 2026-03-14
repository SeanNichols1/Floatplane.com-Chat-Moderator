// Background service worker: tracks the active Floatplane tab and notifies content scripts to pause/resume filtering.

let activeFloatplaneTabId = null;

chrome.tabs.onActivated.addListener(({ tabId }) => {
  // Get the activated tab to check if it's a Floatplane tab
  chrome.tabs.get(tabId, (tab) => {
    const isFloatplaneTab = tab.url && tab.url.includes('floatplane.com');
    
    if (isFloatplaneTab) {
      // Tell the previously active Floatplane tab to deactivate filtering
      if (activeFloatplaneTabId !== null && activeFloatplaneTabId !== tabId) {
        chrome.tabs.sendMessage(activeFloatplaneTabId, { type: "tabDeactivated" }, () => {
          // Suppress "no receiving end" errors for tabs that don't have the content script
          void chrome.runtime.lastError;
        });
      }
      
      activeFloatplaneTabId = tabId;
      
      // Tell the newly active Floatplane tab to activate filtering
      chrome.tabs.sendMessage(tabId, { type: "tabActivated" }, () => {
        void chrome.runtime.lastError;
      });
    } else {
      // Non-Floatplane tab activated - deactivate filtering on the previously active Floatplane tab
      if (activeFloatplaneTabId !== null) {
        chrome.tabs.sendMessage(activeFloatplaneTabId, { type: "tabDeactivated" }, () => {
          void chrome.runtime.lastError;
        });
        activeFloatplaneTabId = null;
      }
    }
  });
});
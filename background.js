// Background service worker: tracks the active tab and notifies content scripts to pause/resume filtering.

let activeTabId = null;

chrome.tabs.onActivated.addListener(({ tabId }) => {
  // Tell the previously active tab to deactivate filtering
  if (activeTabId !== null && activeTabId !== tabId) {
    chrome.tabs.sendMessage(activeTabId, { type: "tabDeactivated" }, () => {
      // Suppress "no receiving end" errors for tabs that don't have the content script
      void chrome.runtime.lastError;
    });
  }

  activeTabId = tabId;

  // Tell the newly active tab to activate filtering
  chrome.tabs.sendMessage(tabId, { type: "tabActivated" }, () => {
    void chrome.runtime.lastError;
  });
});

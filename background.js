// Background service worker: tracks the active Floatplane tab and notifies content scripts to pause/resume filtering.

let activeFloatplaneTabId = null;

function isFloatplaneUrl(url) {
  return url && url.includes('floatplane.com');
}

function sendMsg(tabId, type) {
  chrome.tabs.sendMessage(tabId, { type }, () => {
    // Suppress "no receiving end" errors for tabs that don't have the content script
    void chrome.runtime.lastError;
  });
}

function activateTab(tabId) {
  if (activeFloatplaneTabId !== null && activeFloatplaneTabId !== tabId) {
    sendMsg(activeFloatplaneTabId, "tabDeactivated");
  }
  activeFloatplaneTabId = tabId;
  sendMsg(tabId, "tabActivated");
}

function deactivateCurrentTab() {
  if (activeFloatplaneTabId !== null) {
    sendMsg(activeFloatplaneTabId, "tabDeactivated");
    activeFloatplaneTabId = null;
  }
}

// On startup: find the currently focused Floatplane tab (if any) and activate it.
// This ensures that whichever tab is already open gets the tabActivated signal on extension load/reload.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs.length && isFloatplaneUrl(tabs[0].url)) {
    activateTab(tabs[0].id);
  }
});

// When the user switches tabs
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (isFloatplaneUrl(tab.url)) {
      activateTab(tabId);
    } else {
      deactivateCurrentTab();
    }
  });
});

// When a tab finishes loading (covers page reloads and navigation within the tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!isFloatplaneUrl(tab.url)) return;
  // Only re-activate if this tab is the currently focused one
  chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
    if (chrome.runtime.lastError) return;
    if (activeTabs.length && activeTabs[0].id === tabId) {
      activateTab(tabId);
    }
  });
});
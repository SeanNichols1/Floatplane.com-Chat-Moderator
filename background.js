// Background service worker: tracks the active Floatplane tab and notifies content scripts to pause/resume filtering.

let activeFloatplaneTabId = null;

function isFloatplaneUrl(url) {
  return url && url.includes('floatplane.com');
}

/**
 * Send a message to a tab, retrying up to maxRetries times with retryDelayMs between
 * attempts if the content script isn't ready yet (i.e. "Could not establish connection"
 * / "Receiving end does not exist" errors). This handles the race where onActivated fires
 * before the content script has registered its chrome.runtime.onMessage listener.
 */
function sendMsgWithRetry(tabId, type, maxRetries = 5, retryDelayMs = 300) {
  let attempts = 0;
  function attempt() {
    attempts++;
    chrome.tabs.sendMessage(tabId, { type }, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "";
        // Only retry on "no receiving end" errors (content script not ready yet)
        const isNotReady =
          msg.includes("Could not establish connection") ||
          msg.includes("Receiving end does not exist");
        if (isNotReady && attempts < maxRetries) {
          setTimeout(attempt, retryDelayMs);
        }
        // Any other error (e.g. tab closed) – silently ignore
      }
    });
  }
  attempt();
}

function sendMsg(tabId, type) {
  // For deactivation messages we don't need retries – if the tab isn't listening it doesn't matter.
  chrome.tabs.sendMessage(tabId, { type }, () => { void chrome.runtime.lastError; });
}

function activateTab(tabId) {
  if (activeFloatplaneTabId !== null && activeFloatplaneTabId !== tabId) {
    sendMsg(activeFloatplaneTabId, "tabDeactivated");
  }
  activeFloatplaneTabId = tabId;
  // Use retry logic so the message lands even if the content script is still initialising.
  sendMsgWithRetry(tabId, "tabActivated");
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

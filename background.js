// Only send tab activation messages to Floatplane.com tabs.

const sendTabActivationMessage = (tab) => {
    if (tab.url.includes('floatplane.com')) {
        // Logic to send activation message
        console.log('Sending activation message for Floatplane.com tab:', tab);
    }
};

// Example: Listen for tab updates
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, sendTabActivationMessage);
});
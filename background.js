// Only send tab activation messages to Floatplane.com tabs
chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (tab.url && tab.url.includes('floatplane.com')) {
            // Logic to send tab activation message
            console.log('Tab activated:', tab.url);
        }
    });
});
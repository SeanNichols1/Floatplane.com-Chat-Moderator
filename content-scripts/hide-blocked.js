// Scripts to hide messaged from users. 

(async function () {
  // Helper to fetch block list from extension storage
  async function getBlockList() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get(["block_list"], (res) => {
          resolve(res.block_list || []);
        });
      });
    }
    return [];
  }

  // Helper to fetch staff filter flag from extension storage (boolean)
  async function getStaffFilter() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get(["staff_filter_on"], (res) => {
          // If key missing, default to false
          resolve(Boolean(res.staff_filter_on));
        });
      });
    }
    return false;
  }

  // Normalize for comparisons
  function normalizeName(name) {
    return (name || "").trim().toLowerCase();
  }

  // Find username element inside a chat message node. Use flexible selector:
  // look for descendant elements whose class contains "chatUsername" (as observed on Floatplane)
  function findUsernameElement(messageNode) {
    return messageNode.querySelector('[class*="chatUsername"]') || null;
  }

  // Determine whether a message node is from staff/moderator
  function isStaffMessage(messageNode) {
    if (!messageNode) return false;
    // observed markup uses a badge element with title="Channel Moderator"
    if (messageNode.querySelector('[title="Channel Moderator"]')) return true;
    // or classes like "userBadge" or "badge-moderator"
    if (messageNode.querySelector('[class*="userBadge"], [class*="badge-moderator"], [class*="_userBadge"]')) return true;
    return false;
  }

  // Hide a message element
  function hideMessage(messageNode) {
    if (!messageNode) return;
    messageNode.style.display = "none";
    messageNode.setAttribute("data-blocked-by-extension", "1");
  }

  // Unhide (if previously hidden by extension)
  function unhideMessage(messageNode) {
    if (!messageNode) return;
    if (messageNode.getAttribute("data-blocked-by-extension") === "1") {
      messageNode.style.display = "";
      messageNode.removeAttribute("data-blocked-by-extension");
    }
  }

  // Check a single message node and hide/show depending on blockListSet and staffFilter flag
  function checkAndApplyToMessage(messageNode, blockListSet, staffFilterOn) {
    const userEl = findUsernameElement(messageNode);
    if (!userEl) return;
    const username = normalizeName(userEl.textContent || userEl.innerText || "");
    if (!username) return;

    const staff = isStaffMessage(messageNode);

    if (staffFilterOn) {
      // When staff-only mode is on: show only staff messages
      if (staff) {
        unhideMessage(messageNode);
      } else {
        hideMessage(messageNode);
      }
      return;
    }

    // Normal mode: hide messages whose username is in block list
    if (blockListSet.has(username)) hideMessage(messageNode);
    else unhideMessage(messageNode);
  }

  // Scan existing messages under the live-chat-wrapper and apply blocking/staff-filtering
  function scanExistingMessages(blockListSet, staffFilterOn) {
    const liveWrapper = document.querySelector(".live-chat-wrapper");
    if (!liveWrapper) return;
    // message container nodes observed on the page have a class containing "chatMessage" (observed markup).
    const messageNodes = liveWrapper.querySelectorAll('[class*="chatMessage"], [class*="_chatMessage"]');
    messageNodes.forEach((msg) => checkAndApplyToMessage(msg, blockListSet, staffFilterOn));
  }

  // Count whether any staff messages currently exist (used to decide whether to revert staff filter)
  function hasStaffMessages() {
    const liveWrapper = document.querySelector(".live-chat-wrapper");
    if (!liveWrapper) return false;
    const messageNodes = liveWrapper.querySelectorAll('[class*="chatMessage"], [class*="_chatMessage"]');
    for (const msg of messageNodes) {
      if (isStaffMessage(msg)) return true;
    }
    return false;
  }

  // Helper: detect visibility of an element
  function isVisible(el) {
    if (!el) return false;
    // offsetParent is null if display:none or not in render tree
    if (el.offsetParent === null) return false;
    const rects = el.getClientRects();
    return rects && rects.length > 0;
  }

  // Attempt to click the "Scroll to bottom" control if visible, otherwise scroll the wrapper to bottom.
  // The site uses an obfuscated class name like "_scrollButton_daabh_17". Use a substring selector.
  function clickScrollButtonIfVisible() {
    try {
      const scrollBtn = document.querySelector('[class*="_scrollButton"]') || document.querySelector('[class*="scrollButton"]') || null;
      const liveWrapper = document.querySelector(".live-chat-wrapper");
      if (scrollBtn && isVisible(scrollBtn)) {
        // prefer dispatching a user-like event
        scrollBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      }
      // fallback: scroll the live wrapper to bottom
      if (liveWrapper) {
        // prefer smooth scroll when supported
        try {
          liveWrapper.scrollTo({ top: liveWrapper.scrollHeight, behavior: 'smooth' });
        } catch (e) {
          liveWrapper.scrollTop = liveWrapper.scrollHeight;
        }
        return true;
      }
    } catch (e) {
      // ignore errors - best-effort only
    }
    return false;
  }

  // Setup mutation observer to catch newly added messages
  function observeNewMessages(blockListSet, staffFilterOn) {
    const liveWrapper = document.querySelector(".live-chat-wrapper");
    if (!liveWrapper) return null;
    let staffExistenceTimer = null;

    const scheduleStaffExistenceCheck = async () => {
      if (staffExistenceTimer) clearTimeout(staffExistenceTimer);
      staffExistenceTimer = setTimeout(async () => {
        staffExistenceTimer = null;
        // if staff-only mode is on but no staff messages exist, turn it off and write a message
        if (lastStaffFilter) {
          const exists = hasStaffMessages();
          if (!exists && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            try {
              const reason = "No staff messages present; staff filter reverted to Off.";
              // write both flag and human-readable reason so the popup can show it
              chrome.storage.local.set({ staff_filter_on: false, staff_filter_message: reason });
            } catch (e) {
              // ignore
            }
          }
        }
      }, 200);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // handle added nodes
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            // If a message node itself is added
            if (node.matches && node.matches('[class*="chatMessage"], [class*="_chatMessage"]')) {
              checkAndApplyToMessage(node, blockListSet, staffFilterOn);
            }
            // Or if a subtree includes message nodes
            const nested = node.querySelectorAll ? node.querySelectorAll('[class*="chatMessage"], [class*="_chatMessage"]') : [];
            nested.forEach(n => checkAndApplyToMessage(n, blockListSet, staffFilterOn));
          });
        }
        // handle removed nodes -> schedule a staff existence check because staff messages might have been removed
        if (m.removedNodes && m.removedNodes.length) {
          scheduleStaffExistenceCheck();
        }
      }
      // also schedule a check after processing additions
      scheduleStaffExistenceCheck();
    });
    observer.observe(liveWrapper, { childList: true, subtree: true });
    return observer;
  }

  // Main orchestration: load list, build a Set (lowercased), scan, observe, and watch storage changes
  let currentObserver = null;
  let lastBlockSet = new Set();
  let lastStaffFilter = false;

  async function applyBlockListAndFilter() {
    const [list, staffFlag] = await Promise.all([getBlockList(), getStaffFilter()]);
    const normalizedSet = new Set((list || []).map(normalizeName));
    const newStaffFilter = Boolean(staffFlag);
    lastBlockSet = normalizedSet;
    // If staff filter changed from previous value, try to click/scroll to bottom so the user sees the staff-only view.
    const staffToggled = newStaffFilter !== lastStaffFilter;
    lastStaffFilter = newStaffFilter;

    // initial scan
    scanExistingMessages(normalizedSet, lastStaffFilter);

    // If staff-only is on but no staff messages exist, switch it off so the popup button reverts to off
    if (lastStaffFilter && !hasStaffMessages()) {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          const reason = "No staff messages present; staff filter reverted to Off.";
          chrome.storage.local.set({ staff_filter_on: false, staff_filter_message: reason });
          // we'll return early; storage.onChanged listener will call applyBlockListAndFilter again
          return;
        } catch (e) {
          // ignore and continue
        }
      }
    }

    // If the staff filter was toggled by the user (on or off), ensure the chat is scrolled to bottom or click the scroll button if visible.
    if (staffToggled) {
      // best-effort; clicking the scroll control should be harmless if not present
      clickScrollButtonIfVisible();
    }

    // reset observer
    if (currentObserver) {
      currentObserver.disconnect();
      currentObserver = null;
    }
    currentObserver = observeNewMessages(normalizedSet, lastStaffFilter);
  }

  // Listen for storage changes to update quickly when popup modifies block_list or staff_filter_on
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && (changes.block_list || changes.staff_filter_on)) {
        applyBlockListAndFilter();
      }
    });
  }

  // Try repeatedly until .live-chat-wrapper is present (page might load asynchronously)
  const maxAttempts = 40;
  let attempt = 0;
  const trySetup = async () => {
    attempt++;
    const wrapper = document.querySelector(".live-chat-wrapper");
    if (wrapper) {
      await applyBlockListAndFilter();
    } else if (attempt < maxAttempts) {
      setTimeout(trySetup, 500);
    }
  };
  trySetup();
})();
// Scripts for hello.html

// Cookie helpers - small, robust helpers using encodeURIComponent
function setCookie(name, value, days) {
  const expires = days ? "; expires=" + new Date(Date.now() + days * 864e5).toUTCString() : "";
  document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function getCookie(name) {
  const match = document.cookie.split("; ").find(row => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

// Block list stored as JSON array (primary) in chrome.storage.local key "block_list"
// fallback: cookie "block_list"
const BLOCK_COOKIE = "block_list";
const FILTER_COOKIE = "staff_filter_on";

async function loadBlockList() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["block_list"], (res) => {
        try {
          resolve(res.block_list || []);
        } catch {
          resolve([]);
        }
      });
    });
  }
  // fallback to cookie
  const raw = getCookie(BLOCK_COOKIE);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveBlockList(list) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ block_list: list }, () => resolve());
    });
  }
  // fallback to cookie
  try {
    setCookie(BLOCK_COOKIE, JSON.stringify(list), 365);
  } catch (e) {
    console.error("Failed to save block list cookie", e);
  }
}

async function renderBlockList() {
  const ul = document.getElementById("blockList");
  ul.textContent = "";
  const list = await loadBlockList();
  if (!list || list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "(empty)";
    li.style.fontStyle = "italic";
    ul.appendChild(li);
    return;
  }
  list.forEach((item, idx) => {
    const li = document.createElement("li");
    li.textContent = item;
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.style.marginLeft = "8px";
    remove.onclick = async () => {
      const current = await loadBlockList();
      current.splice(idx, 1);
      await saveBlockList(current);
      await renderBlockList();
    };
    li.appendChild(remove);
    ul.appendChild(li);
  });
}

// Add new item from input (block list)
async function addBlockItem() {
  const input = document.getElementById("blockInput");
  const value = (input.value || "").trim();
  if (!value) return;
  const list = await loadBlockList();
  list.push(value);
  await saveBlockList(list);
  input.value = "";
  await renderBlockList();
}

// Clear entire block list
async function clearBlockList() {
  await saveBlockList([]);
  await renderBlockList();
}

// Staff filter toggle (persists in cookie) - independent of block list
// Now also mirrors the flag into chrome.storage.local as "staff_filter_on" (boolean)
// so content scripts can read it.
function isFilterOn() {
  return getCookie(FILTER_COOKIE) === "1";
}

function setFilterOn(on) {
  // keep cookie for UI/persistence in popup page
  setCookie(FILTER_COOKIE, on ? "1" : "0", 365);

  // mirror into extension storage so content scripts can read it
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    try {
      // clear any previous reason message when user manually changes the setting
      chrome.storage.local.set({ staff_filter_on: !!on, staff_filter_message: "" }, () => {
        // update UI after storage saved
        updateFilterButtonUI();
        showStatusMessage(""); // clear status in popup immediately
      });
      return;
    } catch (e) {
      // fall back to cookie-only if storage not available
      console.warn("chrome.storage not available to persist staff_filter_on", e);
    }
  }

  updateFilterButtonUI();
  showStatusMessage("");
}

// Read stored staff filter (prefers chrome.storage.local, falls back to cookie)
async function getStoredStaffFilter() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["staff_filter_on"], (res) => {
        if (typeof res.staff_filter_on !== "undefined") {
          resolve(Boolean(res.staff_filter_on));
        } else {
          resolve(getCookie(FILTER_COOKIE) === "1");
        }
      });
    });
  }
  return getCookie(FILTER_COOKIE) === "1";
}

function updateFilterButtonUI() {
  const btn = document.getElementById("btnStaffToggle");
  const on = isFilterOn();
  btn.textContent = "Staff Messages Only: " + (on ? "On" : "Off");
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  if (on) btn.classList.add("toggle-active"); else btn.classList.remove("toggle-active");
}

function toggleStaffFilter() {
  setFilterOn(!isFilterOn());
}

// Show a short status message in the popup (clears after a timeout).
let statusTimer = null;
function showStatusMessage(msg, ttl = 5000) {
  const el = document.getElementById("statusNote");
  if (!el) return;
  if (!msg) {
    el.textContent = "";
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    return;
  }
  el.textContent = msg;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.textContent = "";
    statusTimer = null;
  }, ttl);
}

// Reload the first matching floatplane.com tab (not the popup).
function reloadFloatplaneTab() {
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
    showStatusMessage('Tabs API unavailable — grant "tabs" permission and reload the extension.');
    return;
  }

  // query for any tab that matches floatplane domain
  chrome.tabs.query({ url: '*://*.floatplane.com/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      showStatusMessage('No floatplane tab found');
      return;
    }
    // reload the first found tab (you can change to reload all if desired)
    const tab = tabs[0];
    chrome.tabs.reload(tab.id, {}, () => {
      if (chrome.runtime.lastError) {
        showStatusMessage('Failed to reload tab: ' + chrome.runtime.lastError.message);
      } else {
        showStatusMessage('Reloaded floatplane tab');
      }
    });
  });
}

// React to storage changes so the popup button reflects changes made by the content script
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.staff_filter_on) {
        const newVal = Boolean(changes.staff_filter_on.newValue);
        // ensure cookie matches storage and update UI
        setCookie(FILTER_COOKIE, newVal ? "1" : "0", 365);
        updateFilterButtonUI();
      }
      if (changes.staff_filter_message) {
        const message = changes.staff_filter_message.newValue || "";
        if (message) {
          showStatusMessage(message);
        } else {
          showStatusMessage("");
        }
      }
    }
  });
}

// Wire up events
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btnStaffToggle").addEventListener("click", toggleStaffFilter);
  document.getElementById("btnReload").addEventListener("click", reloadFloatplaneTab);

  document.getElementById("btnAddBlock").addEventListener("click", addBlockItem);
  document.getElementById("blockInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBlockItem();
  });
  document.getElementById("btnClearBlock").addEventListener("click", () => {
    if (confirm("Clear the block list?")) clearBlockList();
  });

  // initial render of block list
  await renderBlockList();

  // initialize staff UI from storage if present (storage preferred)
  try {
    const stored = await getStoredStaffFilter();
    // ensure cookie reflects stored value too
    setCookie(FILTER_COOKIE, stored ? "1" : "0", 365);
  } catch (e) {
    console.warn("Failed to read stored staff filter:", e);
  }

  updateFilterButtonUI();
});
// Popup script — communicates with the content script

const toggle = document.getElementById("enableToggle");
const countEl = document.getElementById("adCount");
const rescanBtn = document.getElementById("rescanBtn");

// Get current state from the active tab
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadState() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    chrome.tabs.sendMessage(tab.id, { type: "getStats" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded (e.g., chrome:// pages)
        countEl.textContent = "—";
        toggle.checked = true;
        return;
      }
      if (response) {
        countEl.textContent = response.count;
        toggle.checked = response.enabled;
      }
    });
  } catch (e) {
    countEl.textContent = "—";
  }
}

// Toggle on/off
toggle.addEventListener("change", async () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled });

  const tab = await getActiveTab();
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "toggle", enabled }, (response) => {
    if (!chrome.runtime.lastError) {
      setTimeout(loadState, 300);
    }
  });
});

// Rescan button
rescanBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  rescanBtn.textContent = "Scanning…";
  chrome.tabs.sendMessage(tab.id, { type: "rescan" }, (response) => {
    if (!chrome.runtime.lastError) {
      setTimeout(() => {
        loadState();
        rescanBtn.textContent = "↻ Rescan Page";
      }, 500);
    }
  });
});

// Load on open
loadState();

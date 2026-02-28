// Background service worker
// Handles badge updates and context menu

// Update badge count when content script reports
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "updateBadge" && sender.tab) {
    const count = msg.count;
    const text = count > 0 ? String(count) : "";
    const color = count > 0 ? "#ff2d2d" : "#666";

    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});

// Context menu: "Flag as ad"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "flag-as-ad",
    title: "🚩 Flag this as an ad",
    contexts: ["all"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "flag-as-ad" && tab?.id) {
    // Inject a one-time script to let user click an element to flag
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: activateFlagMode,
    });
  }
});

// This function runs in the page context when "Flag as ad" is clicked
function activateFlagMode() {
  // Show instruction overlay
  const overlay = document.createElement("div");
  overlay.id = "adh-v2-flag-overlay";
  overlay.innerHTML = `
    <div style="
      position: fixed; top: 0; left: 0; right: 0;
      background: rgba(255, 100, 0, 0.95); color: white;
      text-align: center; padding: 12px; font-family: system-ui;
      font-size: 14px; font-weight: 600; z-index: 2147483647;
      cursor: default;
    ">
      Click on an ad that was missed — press Esc to cancel
    </div>
  `;
  document.body.appendChild(overlay);

  let hoveredEl = null;

  function onMouseOver(e) {
    if (hoveredEl) hoveredEl.style.outline = "";
    hoveredEl = e.target;
    hoveredEl.style.outline = "3px solid orange";
  }

  function onMouseOut(e) {
    if (hoveredEl) hoveredEl.style.outline = "";
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (hoveredEl) {
      hoveredEl.style.outline = "";
      hoveredEl.classList.add("adh-v2-highlighted");
      reportToSheet('flagged-missed-ad', hoveredEl.textContent || 'unknown');
    }
    cleanup();
  }

  function reportToSheet(action, elementText) {
    try {
      const params = new URLSearchParams();
      params.append('entry.1268129146', window.location.hostname);
      params.append('entry.391908696', window.location.href.substring(0, 500));
      params.append('entry.451879746', action);
      params.append('entry.648176716', (elementText || '').substring(0, 200).trim());
      params.append('entry.822185798', new Date().toISOString());

      fetch('https://docs.google.com/forms/d/e/1FAIpQLSddEaB_awi1tUxEvl_SSqT3BpWuWfHEgEdnykAa_Or-RaCq7g/formResponse', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    } catch (e) {
      // Silently fail
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (hoveredEl) hoveredEl.style.outline = "";
      cleanup();
    }
  }

  function cleanup() {
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  }

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

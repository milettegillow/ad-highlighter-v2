// ============================================================
// Ad Highlighter v2 — Content Script
// Injected into every page to detect and highlight ads
// ============================================================

(function () {
  "use strict";

  // Don't run in iframes that are already flagged, or on extension pages
  if (window.__adHighlighterV2Loaded) return;
  window.__adHighlighterV2Loaded = true;

  // ----------------------------------------------------------
  // 1. CONFIGURATION
  // ----------------------------------------------------------

  // Keywords that strongly suggest ad content when found in text.
  // These are checked as whole words (word-boundary regex).
  const AD_KEYWORDS = [
    "sponsored",
    "promoted",
    "advertisement",
    "paid partnership",
    "paid promotion",
    "affiliate link",
    "affiliate",
    "advertorial",
    "#ad",
    "ad disclosure",
    "contains paid",
    "paid collaboration",
    "in partnership with",
    "presented by",
    "brought to you by",
    "powered by our sponsors",
    "powered by",
  ];

  // Shorter/ambiguous keywords that need extra context to avoid
  // false positives (like your dictionary screenshot!)
  const CONTEXTUAL_KEYWORDS = [
    "ad", // only if parent looks like a label/badge
    "ads",
  ];

  // CSS class/id substrings that commonly indicate ad containers
  const AD_CLASS_PATTERNS = [
    "ad-container",
    "ad-wrapper",
    "ad-slot",
    "ad-unit",
    "ad-banner",
    "ad-block",
    "ad-placement",
    "ad-holder",
    "adsbygoogle",
    "sponsored-post",
    "sponsored-content",
    "sponsored-card",
    "promoted-post",
    "promoted-content",
    "promoted-card",
    "advertisement",
    "dfp-ad",
    "gpt-ad",
    "native-ad",
    "in-feed-ad",
    "outbrain",
    "taboola",
    "revcontent",
    "mgid",
  ];

  // Known ad-serving iframe domains
  const AD_IFRAME_DOMAINS = [
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "amazon-adsystem.com",
    "facebook.com/plugins",
    "adnxs.com",
    "criteo.com",
    "outbrain.com",
    "taboola.com",
    "revcontent.com",
    "mgid.com",
    "adsrvr.org",
    "rubiconproject.com",
    "pubmatic.com",
    "openx.net",
    "casalemedia.com",
    "media.net",
  ];

  // aria-label values that indicate ads
  const AD_ARIA_PATTERNS = ["advertisement", "sponsored", "promoted", "ad"];

  // Tags we should never highlight as ad containers (too structural)
  const EXCLUDED_TAGS = new Set([
    "HTML",
    "BODY",
    "HEAD",
    "MAIN",
    "NAV",
    "HEADER",
    "FOOTER",
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "META",
    "LINK",
    "TITLE",
  ]);

  // Tags that are natural "container" boundaries when walking up the DOM
  const CONTAINER_TAGS = new Set([
    "ARTICLE",
    "SECTION",
    "LI",
    "DIV",
    "ASIDE",
    "FIGURE",
    "BLOCKQUOTE",
    "TD",
    "TR",
  ]);

  // ----------------------------------------------------------
  // 2. STATE
  // ----------------------------------------------------------

  let enabled = true;
  let highlightedElements = new Map(); // element -> { reason, overlay }
  let dismissedSelectors = new Set(); // per-domain dismissed items
  const domain = window.location.hostname;

  // Load state from storage
  chrome.storage.local.get(["enabled", `dismissed_${domain}`], (result) => {
    if (result.enabled === false) {
      enabled = false;
    } else {
      // Default to enabled
      enabled = true;
      scanPage();
    }
    if (result[`dismissed_${domain}`]) {
      dismissedSelectors = new Set(result[`dismissed_${domain}`]);
    }
  });

  // Listen for toggle messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "toggle") {
      enabled = msg.enabled;
      if (enabled) {
        scanPage();
      } else {
        clearAllHighlights();
      }
      sendResponse({ ok: true });
    }
    if (msg.type === "getStats") {
      sendResponse({ count: highlightedElements.size, enabled });
    }
    if (msg.type === "rescan") {
      clearAllHighlights();
      if (enabled) scanPage();
      sendResponse({ ok: true });
    }
  });

  // ----------------------------------------------------------
  // 3. DETECTION ENGINE
  // ----------------------------------------------------------

  function scanPage() {
    if (!enabled) return;

    const found = new Set();

    // Strategy A: Keyword scanning in text nodes
    detectByKeywords(found);

    // Strategy B: CSS class/id pattern matching
    detectByClassPatterns(found);

    // Strategy C: Ad-serving iframes
    detectByIframes(found);

    // Strategy D: ARIA labels
    detectByAriaLabels(found);

    // Strategy E: Common ad element structures
    detectByStructure(found);

    // Highlight everything we found
    found.forEach((el) => {
      if (!highlightedElements.has(el) && !isDismissed(el)) {
        highlightElement(el);
      }
    });

    updateBadge();
  }

  // --- Strategy A: Keywords in visible text ---
  function detectByKeywords(found) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim().toLowerCase();
      if (!text) continue;

      // Check strong keywords (whole word match)
      for (const kw of AD_KEYWORDS) {
        const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
        if (regex.test(text)) {
          const container = findAdContainer(node.parentElement);
          console.log("[AdHighlighter] Keyword match:", {
            keyword: kw,
            text: text.slice(0, 120),
            parentTag: node.parentElement?.tagName,
            parentClass: node.parentElement?.className,
            container: container
              ? { tag: container.tagName, class: container.className, id: container.id }
              : null,
          });
          if (container) {
            found.add(container);
          }
          break;
        }
      }

      // Check contextual keywords (need extra validation)
      for (const kw of CONTEXTUAL_KEYWORDS) {
        const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
        if (regex.test(text)) {
          const parent = node.parentElement;
          if (parent && looksLikeAdLabel(parent)) {
            const container = findAdContainer(parent);
            if (container) {
              found.add(container);
            }
          }
          break;
        }
      }
    }
  }

  // Check if a short keyword like "ad" is being used as a label/badge
  // rather than in normal prose (avoids the dictionary problem)
  function looksLikeAdLabel(element) {
    // Only flag "ad"/"ads" if the element's entire visible text is exactly that
    // (i.e., it's a standalone label/badge, not a dictionary definition or prose)
    const fullText = element.textContent.trim().toLowerCase();
    if (fullText === "ad" || fullText === "ads") return true;

    // Or if the element (or its parent) has an ad-related class/ID
    if (elementMatchesAnyAdPattern(element)) return true;
    if (
      element.parentElement &&
      elementMatchesAnyAdPattern(element.parentElement)
    )
      return true;

    // Or if the element has an ad-related aria attribute
    const ariaLabel = (element.getAttribute("aria-label") || "")
      .toLowerCase()
      .trim();
    if (AD_ARIA_PATTERNS.some((p) => ariaLabel === p)) return true;

    return false;
  }

  // --- Strategy B: Class/ID pattern matching ---
  function detectByClassPatterns(found) {
    for (const pattern of AD_CLASS_PATTERNS) {
      // Use CSS selector as a fast pre-filter, then verify with
      // segment-bounded matching to avoid substring false positives
      // (e.g. "broad-container" should NOT match pattern "ad-container")
      const byClass = document.querySelectorAll(`[class*="${pattern}"]`);
      byClass.forEach((el) => {
        if (!EXCLUDED_TAGS.has(el.tagName)) {
          const classes = (
            typeof el.className === "string" ? el.className : ""
          ).toLowerCase();
          if (containsAdSegment(classes, pattern)) {
            found.add(el);
          }
        }
      });

      // Search by ID
      const byId = document.querySelectorAll(`[id*="${pattern}"]`);
      byId.forEach((el) => {
        if (!EXCLUDED_TAGS.has(el.tagName)) {
          const id = (el.id || "").toLowerCase();
          if (containsAdSegment(id, pattern)) {
            found.add(el);
          }
        }
      });
    }
  }

  // --- Strategy C: Ad-serving iframes ---
  function detectByIframes(found) {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        const src = (iframe.src || iframe.dataset.src || "").toLowerCase();
        if (AD_IFRAME_DOMAINS.some((domain) => src.includes(domain))) {
          // Highlight the iframe's parent container, not just the iframe
          const container = findAdContainer(iframe);
          found.add(container || iframe);
        }
      } catch (e) {
        // Cross-origin iframes may throw
      }
    });
  }

  // --- Strategy D: ARIA labels ---
  function detectByAriaLabels(found) {
    const withAria = document.querySelectorAll("[aria-label]");
    withAria.forEach((el) => {
      const label = el.getAttribute("aria-label").toLowerCase().trim();
      if (
        AD_ARIA_PATTERNS.some((p) => label === p || label.startsWith(p + " "))
      ) {
        const container = findAdContainer(el);
        found.add(container || el);
      }
    });

    // Also check role="complementary" with ad-like content
    const withRole = document.querySelectorAll(
      '[role="complementary"], [role="banner"]',
    );
    withRole.forEach((el) => {
      const text = el.textContent.toLowerCase();
      if (AD_KEYWORDS.some((kw) => text.includes(kw))) {
        found.add(el);
      }
    });
  }

  // --- Strategy E: Structural patterns ---
  function detectByStructure(found) {
    // Google Search ads have specific structure
    if (domain.includes("google.")) {
      // Google search ads are marked with "Sponsored" text in specific spans
      document.querySelectorAll("span").forEach((span) => {
        const spanText = span.textContent.trim().toLowerCase();
        if (spanText.includes("sponsored")) {
          console.log("[AdHighlighter] Google span with 'sponsored':", {
            fullText: spanText.slice(0, 120),
            exactMatch: spanText === "sponsored",
            tag: span.tagName,
            class: span.className,
            parentTag: span.parentElement?.tagName,
            parentClass: span.parentElement?.className,
          });
        }
        if (spanText === "sponsored") {
          // Walk up to the containing search result
          let el = span;
          for (let i = 0; i < 10; i++) {
            if (
              !el.parentElement ||
              EXCLUDED_TAGS.has(el.parentElement.tagName)
            )
              break;
            el = el.parentElement;
            // Google wraps each ad result in a div with data attributes
            if (
              el.getAttribute("data-text-ad") !== null ||
              el.getAttribute("data-hveid") !== null
            ) {
              found.add(el);
              break;
            }
          }
          // If we didn't find a specific marker, use the general container finder
          if (!found.has(el)) {
            const container = findAdContainer(span);
            if (container) found.add(container);
          }
        }
      });
    }

    // Facebook/Instagram sponsored posts
    if (domain.includes("facebook.com") || domain.includes("instagram.com")) {
      document
        .querySelectorAll('a[href*="about/ads"], a[href*="/ads/about"]')
        .forEach((link) => {
          const container = findAdContainer(link);
          if (container) found.add(container);
        });
    }

    // Generic: elements that look like ad placeholders (fixed common sizes)
    const commonAdSizes = [
      [728, 90], // Leaderboard
      [300, 250], // Medium Rectangle
      [160, 600], // Wide Skyscraper
      [320, 50], // Mobile Banner
      [970, 250], // Billboard
    ];

    document.querySelectorAll("ins, div, aside").forEach((el) => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      for (const [aw, ah] of commonAdSizes) {
        if (Math.abs(w - aw) < 5 && Math.abs(h - ah) < 5) {
          // Check if it also has ad-like signals (don't flag random divs)
          const classes = (el.className || "").toLowerCase();
          const id = (el.id || "").toLowerCase();
          if (
            containsAdSegment(classes, "ad") ||
            containsAdSegment(id, "ad") ||
            el.tagName === "INS"
          ) {
            found.add(el);
          }
          break;
        }
      }
    });
  }

  // ----------------------------------------------------------
  // 4. CONTAINER FINDING
  // ----------------------------------------------------------

  // Walk up the DOM from a detected element to find the best
  // "ad container" — the visual box the ad lives in.
  function findAdContainer(startElement) {
    if (!startElement) return null;

    let el = startElement;
    let best = startElement;
    const startRect = startElement.getBoundingClientRect();
    const viewportArea = window.innerWidth * window.innerHeight;

    console.log("[AdHighlighter] findAdContainer start:", {
      tag: startElement.tagName,
      class: startElement.className,
      text: startElement.textContent?.slice(0, 80),
    });

    for (let i = 0; i < 15; i++) {
      const parent = el.parentElement;
      if (!parent || EXCLUDED_TAGS.has(parent.tagName)) {
        console.log(`[AdHighlighter]   step ${i}: STOP — ${!parent ? "no parent" : "excluded tag " + parent.tagName}`);
        break;
      }

      const parentRect = parent.getBoundingClientRect();
      const parentArea = parentRect.width * parentRect.height;

      // Stop if the parent is too large (>40% of viewport)
      if (parentArea > viewportArea * 0.4) {
        console.log(`[AdHighlighter]   step ${i}: STOP — parent too large (${Math.round(parentArea / viewportArea * 100)}% of viewport)`, {
          tag: parent.tagName, class: parent.className,
        });
        break;
      }

      // Stop if parent is a major layout container with many children
      if (parent.children.length > 20) {
        console.log(`[AdHighlighter]   step ${i}: STOP — too many children (${parent.children.length})`, {
          tag: parent.tagName, class: parent.className,
        });
        break;
      }

      // Prefer to stop at natural container boundaries
      if (CONTAINER_TAGS.has(parent.tagName)) {
        console.log(`[AdHighlighter]   step ${i}: container boundary, updating best`, {
          tag: parent.tagName, class: parent.className,
        });
        best = parent;
        // Keep going one more level to check if there's a tighter wrapper
        el = parent;
        continue;
      }

      // If parent has ad-related class, that's our container
      if (elementMatchesAnyAdPattern(parent)) {
        console.log(`[AdHighlighter]   step ${i}: MATCH — ad-related class/id`, {
          tag: parent.tagName, class: parent.className, id: parent.id,
        });
        return parent;
      }

      console.log(`[AdHighlighter]   step ${i}: walking up`, {
        tag: parent.tagName, class: parent.className,
      });
      best = parent;
      el = parent;
    }

    console.log("[AdHighlighter]   => returning best:", {
      tag: best.tagName, class: best.className, id: best.id,
    });
    return best;
  }

  // ----------------------------------------------------------
  // 5. HIGHLIGHTING & UI
  // ----------------------------------------------------------

  function highlightElement(el) {
    el.classList.add("adh-v2-highlighted");

    // Create dismiss button
    const btn = document.createElement("button");
    btn.className = "adh-v2-dismiss-btn";
    btn.textContent = "✕ Not an ad";
    btn.title = "Dismiss — this is not an ad";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      dismissElement(el);
    });

    // Ensure the element is positioned for the button
    const position = window.getComputedStyle(el).position;
    if (position === "static") {
      el.style.position = "relative";
    }

    el.appendChild(btn);
    highlightedElements.set(el, { btn });
  }

  function dismissElement(el) {
    el.classList.remove("adh-v2-highlighted");
    const data = highlightedElements.get(el);
    if (data && data.btn && data.btn.parentElement) {
      data.btn.remove();
    }
    highlightedElements.delete(el);

    // Save dismissal for this domain
    const selector = generateSelector(el);
    if (selector) {
      dismissedSelectors.add(selector);
      chrome.storage.local.set({
        [`dismissed_${domain}`]: Array.from(dismissedSelectors),
      });
    }

    updateBadge();
  }

  function isDismissed(el) {
    const selector = generateSelector(el);
    return selector && dismissedSelectors.has(selector);
  }

  function generateSelector(el) {
    // Generate a reasonably stable CSS selector for an element
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let current = el;
    for (let i = 0; i < 3; i++) {
      if (!current || current === document.body) break;
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part = `#${CSS.escape(current.id)}`;
        parts.unshift(part);
        break;
      }
      if (current.className && typeof current.className === "string") {
        const cls = current.className
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((c) => `.${CSS.escape(c)}`)
          .join("");
        part += cls;
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ") || null;
  }

  function clearAllHighlights() {
    highlightedElements.forEach((data, el) => {
      el.classList.remove("adh-v2-highlighted");
      if (data.btn && data.btn.parentElement) {
        data.btn.remove();
      }
    });
    highlightedElements.clear();
    updateBadge();
  }

  function updateBadge() {
    try {
      chrome.runtime.sendMessage({
        type: "updateBadge",
        count: highlightedElements.size,
      });
    } catch (e) {
      // Extension context may be invalidated
    }
  }

  // ----------------------------------------------------------
  // 6. MUTATION OBSERVER (catch dynamically loaded ads)
  // ----------------------------------------------------------

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;

    let shouldRescan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldRescan = true;
        break;
      }
    }

    if (shouldRescan) {
      // Debounce rescans
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(() => scanPage(), 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // ----------------------------------------------------------
  // UTILITY
  // ----------------------------------------------------------

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Check if we're on a Google search results page
  function isGoogleSearchPage() {
    return (
      domain.includes("google.") &&
      window.location.pathname.startsWith("/search")
    );
  }

  // Check if `pattern` appears in `str` as a distinct segment, bounded by
  // start/end of string, whitespace, hyphens, or underscores.
  // e.g. "ad-container" matches in "xyz-ad-container" but not "broad-container"
  function containsAdSegment(str, pattern) {
    const regex = new RegExp(
      `(^|[\\s\\-_])${escapeRegex(pattern)}([\\s\\-_]|$)`,
      "i",
    );
    return regex.test(str);
  }

  // Check if an element's classes or ID match any AD_CLASS_PATTERN
  function elementMatchesAnyAdPattern(el) {
    const classes = (
      typeof el.className === "string" ? el.className : ""
    ).toLowerCase();
    const id = (el.id || "").toLowerCase();
    return AD_CLASS_PATTERNS.some(
      (p) => containsAdSegment(classes, p) || (id && containsAdSegment(id, p)),
    );
  }
})();

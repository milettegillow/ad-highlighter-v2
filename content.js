// ============================================================
// Ad Highlighter v2 — Content Script
// Two-layer detection: site-specific rules + generic island analysis
// ============================================================

(function () {
  "use strict";

  if (window.__adHighlighterV2Loaded) return;
  window.__adHighlighterV2Loaded = true;

  // ----------------------------------------------------------
  // 1. CONFIGURATION
  // ----------------------------------------------------------

  // CSS class/id patterns for ad containers (used by findAdContainer & island scoring)
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

  // Soft-signal keywords (only for scoring in fallback, never standalone detection)
  const SOFT_KEYWORDS = [
    "sponsored",
    "promoted",
    "advertisement",
    "advertorial",
    "ad disclosure",
    "paid partnership",
  ];

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
  let highlightedElements = new Map();
  let dismissedSelectors = new Set();
  const domain = window.location.hostname;

  chrome.storage.local.get(["enabled", `dismissed_${domain}`], (result) => {
    if (result.enabled === false) {
      enabled = false;
    } else {
      enabled = true;
      scanPage();
    }
    if (result[`dismissed_${domain}`]) {
      dismissedSelectors = new Set(result[`dismissed_${domain}`]);
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

    // Layer 1: Site-specific detection for known sites
    const siteDetector = getSiteDetector();
    if (siteDetector) {
      console.log("[AdHighlighter] Using site-specific detector for:", domain);
      siteDetector(found);
    } else {
      // Layer 2: Generic fallback for unknown sites only
      console.log(
        "[AdHighlighter] No site rules, using generic detection for:",
        domain,
      );
      detectAdIframes(found);
      detectByIslandAnalysis(found);
    }

    // Deduplicate: if element A contains element B, keep only the outermost A
    const unique = [...found].filter((el) => {
      return ![...found].some((other) => other !== el && other.contains(el));
    });

    console.log("[AdHighlighter] Scan complete. Elements found:", found.size, "unique:", unique.length);

    unique.forEach((el) => {
      if (!highlightedElements.has(el) && !isDismissed(el)) {
        highlightElement(el);
      }
    });

    updateBadge();
  }

  function getSiteDetector() {
    if (/(?:^|\.)google\.\w+(\.\w+)?$/.test(domain)) return detectGoogleAds;
    if (/(?:^|\.)youtube\.com$/.test(domain)) return detectYouTubeAds;
    if (/(?:^|\.)facebook\.com$/.test(domain)) return detectFacebookAds;
    if (/(?:^|\.)instagram\.com$/.test(domain)) return detectInstagramAds;
    if (/(?:^|\.)amazon\.\w+(\.\w+)?$/.test(domain)) return detectAmazonAds;
    if (/(?:^|\.)linkedin\.com$/.test(domain)) return detectLinkedInAds;
    if (
      /(?:^|\.)twitter\.com$/.test(domain) ||
      /(?:^|\.)x\.com$/.test(domain)
    )
      return detectTwitterAds;
    if (/(?:^|\.)reddit\.com$/.test(domain)) return detectRedditAds;
    if (/(?:^|\.)booking\.com$/.test(domain)) return detectBookingAds;
    return null;
  }

  // ---- Site-specific detectors ----

  function detectGoogleAds(found) {
    // Skip empty ad placeholders: must be tall enough and have text content
    function isRealAdBlock(el) {
      if (el.getBoundingClientRect().height < 100) return false;
      if (el.textContent.trim().length < 20) return false;
      return true;
    }

    // 1. Traditional wrapper IDs — highlight directly (these contain ad blocks)
    for (const id of ["tads", "bottomads"]) {
      const container = document.getElementById(id);
      if (container && isRealAdBlock(container)) {
        console.log("[AdHighlighter] Google: found #" + id, {
          childCount: container.children.length,
        });
        found.add(container);
      }
    }

    // 2. Elements with data-text-ad attribute — highlight the element DIRECTLY
    //    (do NOT use findAdContainer which walks to wrong parent)
    document.querySelectorAll("[data-text-ad]").forEach((el) => {
      if (!found.has(el) && isRealAdBlock(el)) {
        console.log("[AdHighlighter] Google: found [data-text-ad]", {
          tag: el.tagName,
          class: el.className,
          id: el.id,
        });
        found.add(el);
      }
    });

    // 3. "Sponsored" / "Sponsored result(s)" heading text
    //    Walk up to find the parent section that contains the heading AND the
    //    ad listings below it. Do NOT use findAdContainer.
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim().toLowerCase();
      if (
        text === "sponsored" ||
        text === "sponsored result" ||
        text === "sponsored results"
      ) {
        const parentEl = node.parentElement;
        if (!parentEl) continue;

        console.log(
          "[AdHighlighter] Google: found '" + text + "' text node in <" + parentEl.tagName.toLowerCase() + ">",
          {
            class: parentEl.className,
            parentTag: parentEl.parentElement?.tagName,
            parentClass: parentEl.parentElement?.className,
          },
        );

        // First check if already inside a data-text-ad or #tads/#bottomads
        const existingAd = walkUpTo(parentEl, (ancestor) => {
          if (ancestor.getAttribute("data-text-ad") !== null) return true;
          if (ancestor.id === "tads" || ancestor.id === "bottomads") return true;
          return false;
        });
        if (existingAd) {
          console.log("[AdHighlighter] Google: Sponsored text already inside known ad container, skipping");
          continue;
        }

        // Walk up to find a section that contains both the heading and
        // ad result listings (multiple child divs with links)
        const section = walkUpTo(
          parentEl,
          (ancestor) => {
            // Look for a container with the heading + multiple ad-like children
            if (ancestor.children.length < 2) return false;
            // Check if it has data-text-ad descendants (the actual ads)
            const adDescendants = ancestor.querySelectorAll("[data-text-ad]");
            if (adDescendants.length > 0) return true;
            // Or check if it has multiple child divs with links (ad cards)
            let childrenWithLinks = 0;
            for (const child of ancestor.children) {
              if (child.querySelector("a[href]")) childrenWithLinks++;
            }
            return childrenWithLinks >= 2;
          },
          10,
        );

        if (section && isRealAdBlock(section)) {
          console.log("[AdHighlighter] Google: flagging Sponsored section", {
            tag: section.tagName,
            class: section.className,
            id: section.id,
            childCount: section.children.length,
          });
          found.add(section);
        } else {
          console.log(
            "[AdHighlighter] Google: Sponsored text found but no suitable section, skipping",
          );
        }
      }
    }
  }

  function detectYouTubeAds(found) {
    // Ad slot renderers in feed/sidebar
    const adSelectors = [
      "ytd-ad-slot-renderer",
      "ytd-promoted-sparkles-web-renderer",
      "ytd-display-ad-renderer",
      "ytd-promoted-video-renderer",
    ];
    for (const sel of adSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        console.log("[AdHighlighter] YouTube: found " + sel);
        found.add(el);
      });
    }

    // "Sponsored" badges in feed
    document.querySelectorAll("span").forEach((span) => {
      if (span.textContent.trim().toLowerCase() === "sponsored") {
        const container = findAdContainer(span);
        if (container) {
          console.log("[AdHighlighter] YouTube: 'Sponsored' badge", {
            containerTag: container.tagName,
            containerClass: container.className,
          });
          found.add(container);
        }
      }
    });

    // Video player ads
    const adModule = document.querySelector(".ytp-ad-module");
    if (adModule && adModule.children.length > 0) {
      console.log("[AdHighlighter] YouTube: video ad module active");
      found.add(adModule);
    }
    const adShowing = document.querySelector(".ad-showing");
    if (adShowing) {
      console.log("[AdHighlighter] YouTube: player in ad-showing state");
      found.add(adShowing);
    }
  }

  // ---- Facebook: inline badge approach ----
  // Self-contained — does not touch the `found` set or shared state.
  // Uses its own WeakSet to track badged elements across rescans.
  const fbBadged = new WeakSet();

  function detectFacebookAds(_found) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text !== "Sponsored" && text !== "Ad") continue;

      const parent = node.parentElement;
      if (!parent || fbBadged.has(parent)) continue;

      // Skip hidden elements (rect at 0,0 with no height)
      const rect = parent.getBoundingClientRect();
      if (rect.height === 0 && rect.top === 0) continue;
      if (rect.height === 0 || rect.top <= 0) continue;

      // Make the label bright red
      parent.style.cssText += "color: #ff2d2d !important; font-weight: 700 !important;";

      // Add badge
      const badge = document.createElement("span");
      badge.textContent = " \u26A0 AD";
      badge.style.cssText = "background:#ff2d2d;color:white;font-size:11px;font-weight:700;padding:2px 6px;border-radius:3px;margin-left:6px;z-index:9999;";
      parent.insertAdjacentElement("afterend", badge);

      fbBadged.add(parent);
      console.log("[AdHighlighter] Facebook: badged", text, "at", rect.top);
    }
  }

  function detectInstagramAds(found) {
    // "Sponsored" label under username
    document.querySelectorAll("span").forEach((span) => {
      if (span.textContent.trim().toLowerCase() === "sponsored") {
        const article = walkUpTo(span, (el) => el.tagName === "ARTICLE");
        if (article) {
          console.log("[AdHighlighter] Instagram: sponsored post found");
          found.add(article);
        }
      }
    });

    // Links to ads about page
    document
      .querySelectorAll('a[href*="about/ads"], a[href*="/ads/about"]')
      .forEach((link) => {
        const article = walkUpTo(link, (el) => el.tagName === "ARTICLE");
        if (article) {
          console.log(
            "[AdHighlighter] Instagram: ad post via ads-about link",
          );
          found.add(article);
        }
      });
  }

  function detectAmazonAds(found) {
    // Sponsored result containers (data attribute)
    document
      .querySelectorAll('[data-component-type="sp-sponsored-result"]')
      .forEach((el) => {
        console.log("[AdHighlighter] Amazon: found sp-sponsored-result", {
          class: el.className,
        });
        found.add(el);
      });

    // Sponsored labels with Amazon-specific classes
    for (const sel of [
      "span.puis-label-popover-default",
      "span.s-label-popover-default",
    ]) {
      document.querySelectorAll(sel).forEach((span) => {
        if (span.textContent.trim().toLowerCase() === "sponsored") {
          const container = findAdContainer(span);
          if (container) {
            console.log("[AdHighlighter] Amazon: 'Sponsored' label (" + sel + ")", {
              containerTag: container.tagName,
            });
            found.add(container);
          }
        }
      });
    }

    // Fallback: search result items containing a "Sponsored" span
    document.querySelectorAll(".s-result-item").forEach((item) => {
      for (const span of item.querySelectorAll("span")) {
        if (span.textContent.trim().toLowerCase() === "sponsored") {
          console.log("[AdHighlighter] Amazon: sponsored result item", {
            asin: item.getAttribute("data-asin"),
          });
          found.add(item);
          break;
        }
      }
    });
  }

  function detectLinkedInAds(found) {
    // Use TreeWalker to scan ALL text nodes for "Promoted" label.
    // LinkedIn nests the label deeply in spans that querySelectorAll may miss.
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let textNode;
    while ((textNode = walker.nextNode())) {
      const trimmedText = textNode.textContent.trim();
      if (!trimmedText.toLowerCase().startsWith("promoted") || trimmedText.length >= 60) continue;

      const parentEl = textNode.parentElement;
      if (!parentEl) continue;

      console.log("[AdHighlighter] LinkedIn: found 'Promoted' text node in <" + parentEl.tagName.toLowerCase() + ">", {
        class: parentEl.className,
        parentTag: parentEl.parentElement?.tagName,
        parentClass: parentEl.parentElement?.className,
      });

      // Walk up to feed post container. LinkedIn uses several patterns:
      //   - div[data-urn] (post URN identifier)
      //   - div[data-id] (alternative post identifier)
      //   - div with class containing "feed-shared-update"
      //   - div with class containing "occludable-update"
      const post = walkUpTo(parentEl, (el) => {
        if (el.getAttribute("data-urn") !== null) return true;
        if (el.getAttribute("data-id") !== null && el.tagName === "DIV")
          return true;
        const cls = (
          typeof el.className === "string" ? el.className : ""
        ).toLowerCase();
        if (cls.includes("feed-shared-update")) return true;
        if (cls.includes("occludable-update")) return true;
        return false;
      }, 20);

      if (post) {
        console.log("[AdHighlighter] LinkedIn: promoted post container", {
          tag: post.tagName,
          class: post.className,
          dataUrn: post.getAttribute("data-urn"),
          dataId: post.getAttribute("data-id"),
        });
        found.add(post);
      } else {
        // Fallback: try to find a reasonable ancestor that looks like a card
        // but NOT a UI element (composer, nav, etc.)
        const card = walkUpTo(parentEl, (el) => {
          // Skip if it has input elements (composer UI)
          if (el.querySelector('input, textarea, [contenteditable="true"]'))
            return false;
          // Look for a substantial div with limited children
          if (el.tagName !== "DIV" && el.tagName !== "SECTION") return false;
          const rect = el.getBoundingClientRect();
          return rect.height > 100 && el.children.length >= 2 && el.children.length <= 30;
        }, 15);

        if (card) {
          console.log("[AdHighlighter] LinkedIn: promoted card (fallback)", {
            tag: card.tagName,
            class: card.className,
          });
          found.add(card);
        } else {
          console.log("[AdHighlighter] LinkedIn: 'Promoted' found but no suitable container");
        }
      }
    }

    // Also check for sidebar ad units with explicit ad markers
    document
      .querySelectorAll('[data-ad-banner], [data-test-id*="ad"], .ad-banner-container')
      .forEach((el) => {
        console.log("[AdHighlighter] LinkedIn: sidebar ad banner", {
          tag: el.tagName,
          class: el.className,
        });
        found.add(el);
      });
  }

  function detectTwitterAds(found) {
    // "Ad" label in tweet metadata (near the timestamp/username)
    document.querySelectorAll("span").forEach((span) => {
      if (span.textContent.trim().toLowerCase() === "ad") {
        console.log("[AdHighlighter] Twitter: found 'Ad' span", {
          class: span.className,
          parentTag: span.parentElement?.tagName,
          parentClass: span.parentElement?.className,
        });
        const article = walkUpTo(span, (el) => el.tagName === "ARTICLE");
        if (article) {
          console.log("[AdHighlighter] Twitter: flagging ad tweet");
          found.add(article);
        } else {
          console.log(
            "[AdHighlighter] Twitter: 'Ad' span found but no article ancestor, skipping",
          );
        }
      }
    });
  }

  function detectRedditAds(found) {
    // shreddit-ad-post custom elements
    document.querySelectorAll("shreddit-ad-post").forEach((el) => {
      console.log("[AdHighlighter] Reddit: found shreddit-ad-post");
      found.add(el);
    });

    // Posts with "promoted" flair
    document.querySelectorAll("span").forEach((span) => {
      if (span.textContent.trim().toLowerCase() === "promoted") {
        const container = findAdContainer(span);
        if (container) {
          console.log("[AdHighlighter] Reddit: promoted post", {
            containerTag: container.tagName,
            containerClass: container.className,
          });
          found.add(container);
        }
      }
    });
  }

  // Booking.com: no third-party ads — all content is first-party.
  // This detector exists solely to claim the domain so the generic fallback is skipped.
  function detectBookingAds(_found) {
    console.log("[AdHighlighter] Booking.com: skipping — no third-party ads");
  }

  // ---- Always-on: ad-serving iframes ----

  function detectAdIframes(found) {
    document.querySelectorAll("iframe").forEach((iframe) => {
      try {
        const src = (iframe.src || iframe.dataset?.src || "").toLowerCase();
        if (AD_IFRAME_DOMAINS.some((d) => src.includes(d))) {
          const container = findAdContainer(iframe);
          console.log("[AdHighlighter] Ad iframe detected:", {
            src: src.slice(0, 100),
            container: container
              ? { tag: container.tagName, class: container.className }
              : null,
          });
          found.add(container || iframe);
        }
      } catch (e) {
        // Cross-origin iframes may throw
      }
    });
  }

  // ---- Generic fallback: Island analysis ----

  function detectByIslandAnalysis(found) {
    const viewportArea = window.innerWidth * window.innerHeight;
    if (viewportArea === 0) return;

    const candidates = document.querySelectorAll(
      "div, article, section, aside, ins",
    );
    let checked = 0;

    for (const el of candidates) {
      if (EXCLUDED_TAGS.has(el.tagName)) continue;

      // Skip footer elements and anything nested inside a <footer>
      if (el.tagName === "FOOTER" || el.closest("footer")) continue;

      // Quick size filter: between 5% and 35% of viewport
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area < viewportArea * 0.05 || area > viewportArea * 0.35) continue;
      if (rect.width < 100 || rect.height < 50) continue;

      checked++;
      if (checked > 200) break; // Safety limit

      let score = 0;
      const reasons = [];

      // (1) External links — 3 points if >70% go to a different domain
      const links = el.querySelectorAll("a[href]");
      if (links.length > 0) {
        let externalCount = 0;
        for (const a of links) {
          try {
            const url = new URL(a.href);
            if (url.hostname !== domain) externalCount++;
          } catch {}
        }
        if (externalCount / links.length > 0.7) {
          score += 3;
          reasons.push(`external links ${externalCount}/${links.length}`);
        }
      }

      // (2) Visual distinction — 2 points if different bg, border, or shadow
      const style = window.getComputedStyle(el);
      const parentEl = el.parentElement;
      if (parentEl) {
        const parentStyle = window.getComputedStyle(parentEl);
        const hasBorder =
          style.borderStyle !== "none" && parseFloat(style.borderWidth) > 0;
        const hasShadow = style.boxShadow !== "none";
        const differentBg =
          style.backgroundColor !== parentStyle.backgroundColor &&
          style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          style.backgroundColor !== "transparent";
        if (hasBorder || hasShadow || differentBg) {
          score += 2;
          reasons.push("visually distinct");
        }
      }

      // (3) Soft keyword — 1 point
      const textContent = el.textContent.toLowerCase();
      if (SOFT_KEYWORDS.some((kw) => textContent.includes(kw))) {
        score += 1;
        reasons.push("soft keyword");
      }

      // Skip elements containing security/safety messaging (not ads)
      if (
        textContent.includes("stay safe") ||
        textContent.includes("protect your security") ||
        textContent.includes("privacy notice")
      ) {
        continue;
      }

      // (4) Iframe present — 2 points
      if (el.querySelector("iframe")) {
        score += 2;
        reasons.push("has iframe");
      }

      // (5) Tracking params in image URLs — 1 point
      const trackingParams = [
        "utm_",
        "click_id",
        "tracking",
        "impression",
        "ad_id",
        "campaign_id",
      ];
      const hasTracking = [...el.querySelectorAll("img")].some((img) =>
        trackingParams.some((p) => (img.src || "").includes(p)),
      );
      if (hasTracking) {
        score += 1;
        reasons.push("tracking params");
      }

      // (6) Ad-related class/ID pattern — 3 points
      if (elementMatchesAnyAdPattern(el)) {
        score += 3;
        reasons.push("ad class/id pattern");
      }

      if (score >= 6) {
        console.log(`[AdHighlighter] Island detected (score ${score}):`, {
          tag: el.tagName,
          class: el.className,
          id: el.id,
          size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          reasons,
        });
        found.add(el);
      }
    }

    console.log(
      "[AdHighlighter] Island analysis: checked",
      checked,
      "candidates",
    );
  }

  // ----------------------------------------------------------
  // 4. CONTAINER FINDING
  // ----------------------------------------------------------

  function findAdContainer(startElement) {
    if (!startElement) return null;

    let el = startElement;
    let best = startElement;
    const viewportArea = window.innerWidth * window.innerHeight;

    console.log("[AdHighlighter] findAdContainer start:", {
      tag: startElement.tagName,
      class: startElement.className,
      text: startElement.textContent?.slice(0, 80),
    });

    for (let i = 0; i < 15; i++) {
      const parent = el.parentElement;
      if (!parent || EXCLUDED_TAGS.has(parent.tagName)) {
        console.log(
          `[AdHighlighter]   step ${i}: STOP — ${!parent ? "no parent" : "excluded tag " + parent.tagName}`,
        );
        break;
      }

      const parentRect = parent.getBoundingClientRect();
      const parentArea = parentRect.width * parentRect.height;

      if (parentArea > viewportArea * 0.4) {
        console.log(
          `[AdHighlighter]   step ${i}: STOP — parent too large (${Math.round((parentArea / viewportArea) * 100)}% of viewport)`,
          { tag: parent.tagName, class: parent.className },
        );
        break;
      }

      if (parent.children.length > 20) {
        console.log(
          `[AdHighlighter]   step ${i}: STOP — too many children (${parent.children.length})`,
          { tag: parent.tagName, class: parent.className },
        );
        break;
      }

      if (CONTAINER_TAGS.has(parent.tagName)) {
        console.log(
          `[AdHighlighter]   step ${i}: container boundary, updating best`,
          { tag: parent.tagName, class: parent.className },
        );
        best = parent;
        el = parent;
        continue;
      }

      if (elementMatchesAnyAdPattern(parent)) {
        console.log(
          `[AdHighlighter]   step ${i}: MATCH — ad-related class/id`,
          { tag: parent.tagName, class: parent.className, id: parent.id },
        );
        return parent;
      }

      console.log(`[AdHighlighter]   step ${i}: walking up`, {
        tag: parent.tagName,
        class: parent.className,
      });
      best = parent;
      el = parent;
    }

    console.log("[AdHighlighter]   => returning best:", {
      tag: best.tagName,
      class: best.className,
      id: best.id,
    });
    return best;
  }

  // Walk up the DOM from startEl until predicate(el) returns true
  function walkUpTo(startEl, predicate, maxSteps = 15) {
    let el = startEl;
    for (let i = 0; i < maxSteps; i++) {
      el = el.parentElement;
      if (!el || EXCLUDED_TAGS.has(el.tagName)) return null;
      if (predicate(el)) return el;
    }
    return null;
  }

  // ----------------------------------------------------------
  // 5. HIGHLIGHTING & UI
  // ----------------------------------------------------------

  function highlightElement(el) {
    el.classList.add("adh-v2-highlighted");

    const btn = document.createElement("button");
    btn.className = "adh-v2-dismiss-btn";
    btn.textContent = "\u2715 Not an ad";
    btn.title = "Dismiss \u2014 this is not an ad";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      dismissElement(el);
    });

    const position = window.getComputedStyle(el).position;
    if (position === "static") {
      el.style.position = "relative";
    }

    el.appendChild(btn);
    highlightedElements.set(el, { btn });
  }

  function dismissElement(el) {
    const data = highlightedElements.get(el);
    el.classList.remove("adh-v2-highlighted");
    if (data && data.btn && data.btn.parentElement) {
      data.btn.remove();
    }
    highlightedElements.delete(el);

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
      clearTimeout(observer._timeout);
      const isFacebook = /(?:^|\.)facebook\.com$/.test(domain);
      observer._timeout = setTimeout(() => scanPage(), isFacebook ? 3000 : 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // LinkedIn: rescan on scroll to catch lazy-loaded feed posts
  if (/(?:^|\.)linkedin\.com$/.test(domain)) {
    let lastScrollScan = 0;
    window.addEventListener("scroll", () => {
      if (Date.now() - lastScrollScan > 2000) {
        lastScrollScan = Date.now();
        scanPage();
      }
    });
  }

  // ----------------------------------------------------------
  // UTILITY
  // ----------------------------------------------------------

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function containsAdSegment(str, pattern) {
    const regex = new RegExp(
      `(^|[\\s\\-_])${escapeRegex(pattern)}([\\s\\-_]|$)`,
      "i",
    );
    return regex.test(str);
  }

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

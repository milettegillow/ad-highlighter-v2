# Chrome Web Store Listing

## Short description

> Instantly highlights ads on Google, YouTube, Facebook, LinkedIn, Instagram, Amazon, Reddit, Twitter & more.

*(126 characters)*

## Full description

Ad Highlighter v2 makes every ad on the web visible at a glance. It wraps sponsored content in a bright red outline and adds an "AD DETECTED" label so you never have to wonder what's organic and what's paid.

**Supported sites:**

- Google — highlights sponsored search results and ad sections
- YouTube — detects promoted videos, ad slots, and video player ads
- Facebook — finds ad disclosure links and sponsored post markers
- Instagram — spots the "Ad" label on sponsored posts
- LinkedIn — detects "Promoted" feed posts and sidebar ad cards
- Twitter/X — identifies promoted tweets via ad indicators
- Amazon — highlights sponsored product listings
- Reddit — flags promoted posts

On sites not listed above, the extension uses smart heuristic analysis to detect common ad patterns like ad-serving iframes, tracking pixels, and ad-related CSS classes.

**How it works:**

The extension runs a content script that inspects the page's DOM for known ad patterns. It uses site-specific detection rules for major platforms and a scoring-based fallback for other sites. A MutationObserver watches for new content (infinite scroll, dynamic loading) and rescans automatically. Everything runs locally — no servers, no APIs, no external requests.

**You're in control:**

- Toggle the extension on or off from the popup
- Dismiss any false positive with a single click ("Not an ad" button)
- No configuration needed — it works out of the box

**Privacy first:**

Ad Highlighter v2 collects zero data. It makes no network requests. All ad detection happens entirely in your browser. No analytics, no tracking, no cookies. The extension is fully open source — inspect every line of code on GitHub.

https://github.com/nickmilette/ad-highlighter-v2

## Category

Productivity

## Permission justifications

| Permission | Justification |
|------------|---------------|
| `activeTab` | Required to inject the content script into the currently active tab so the extension can scan the page for ads. |
| `storage` | Used to persist user preferences (extension on/off state) and dismissed ad selectors across browser sessions. |
| `contextMenus` | Enables a right-click context menu option for quick access to extension actions like toggling ad highlighting. |
| `scripting` | Allows the extension to programmatically inject scripts when the user activates the extension on a page, as required by Manifest V3. |
| `<all_urls>` (host permission via content_scripts) | The content script needs to run on all URLs because ads appear on any website, and the extension includes a generic fallback detector for sites without specific detection rules. |

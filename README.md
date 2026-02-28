# Ad Highlighter v2

**See every ad on the web, instantly.**

A Chrome extension that detects and highlights ads across major websites with a red border and "AD DETECTED" label — so you always know what's sponsored and what's not.

## Screenshots

| LinkedIn | Facebook | YouTube |
|----------|----------|---------|
| ![LinkedIn](docs/screenshots/linkedin.png) | ![Facebook](docs/screenshots/facebook.png) | ![YouTube](docs/screenshots/youtube.png) |

| Google | Twitter/X | Instagram |
|--------|-----------|-----------|
| ![Google](docs/screenshots/google.png) | ![Twitter](docs/screenshots/twitter.png) | ![Instagram](docs/screenshots/instagram.png) |

## What it does

Ad Highlighter v2 scans webpages in real-time and wraps every ad it finds in a bright red outline with an "AD DETECTED" label. No guessing, no squinting at tiny "Sponsored" text — ads light up the moment they appear. It works across nine major websites and falls back to smart heuristic detection on everything else. You can dismiss false positives with a single click.

## Supported sites

| Site | Detection method | Status |
|------|-----------------|--------|
| Google | Finds `#tads` / `#bottomads` containers, `[data-text-ad]` elements, and "Sponsored" heading text | Working |
| YouTube | Detects `ytd-ad-slot-renderer` and related custom elements, "Sponsored" badges, and video player ad overlays (`.ytp-ad-module`, `.ad-showing`) | Working |
| Facebook | Finds `/ads/about` disclosure links, `aria-label="Sponsored"` links, and `[data-ad-comet-preview]` elements with CTA validation | Working |
| Instagram | Matches `<span>` elements with exact text "Ad" and walks up to the parent `<article>` | Working |
| LinkedIn | TreeWalker scans for "Promoted" text nodes, walks up to `[data-urn]` post containers; sidebar detection via `[data-testid="promoted-badge"]` | Working |
| Twitter/X | Finds `<span>` elements with exact text "Ad", `a[href*="/i/ads"]` links, and `[data-testid="promotedIndicator"]` elements | Working |
| Amazon | Detects `[data-component-type="sp-sponsored-result"]`, sponsored label spans, and `.s-result-item` containers with "Sponsored" text | Working |
| Reddit | Finds `<shreddit-ad-post>` custom elements and `<span>` elements containing "promoted" text | Working |
| All other sites | Heuristic island analysis: scores elements based on external link density, visual distinction, ad keywords, tracking pixels, and ad-related CSS patterns | Working |

## Install

### Chrome Web Store

[Coming soon]

### From source

1. Clone this repo:
   ```
   git clone https://github.com/nickmilette/ad-highlighter-v2.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `ad-highlighter-v2` folder

The extension icon will appear in your toolbar. Navigate to any supported site and ads will be highlighted automatically.

## How it works

- **Manifest V3** Chrome extension with a single content script injected on all pages
- **Site-specific detectors** for each major platform, tailored to that site's DOM structure and ad disclosure patterns
- **MutationObserver** watches for DOM changes and rescans automatically — catches ads loaded via infinite scroll, AJAX navigation, and lazy rendering
- **Scroll listeners** with per-site throttling ensure ads in dynamically loaded feeds are detected as you browse
- **Overlay-based highlighting** for sites with aggressive stacking contexts (YouTube, Twitter/X, LinkedIn) that would hide CSS-based borders
- **Generic fallback** for unknown sites uses island analysis — a scoring system that evaluates external link density, visual distinction, ad keywords, iframe presence, and tracking parameters
- **Dismiss with one click** — not an ad? Hit the "Not an ad" button and it's gone

## Privacy

- **No data collected.** Zero. None.
- **No network requests.** The extension never phones home, never hits an API, never loads remote resources.
- **All detection happens locally** in your browser using DOM inspection only.
- **Fully open source.** Every line of code is inspectable in this repository.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Built with

- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks, no dependencies)
- CSS

## Weekly project note

Built as part of a weekly shipping challenge — one project, start to finish, every week.

## License

MIT

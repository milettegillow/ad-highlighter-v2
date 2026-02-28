# Ad Highlighter v2 — Privacy Policy

**Effective date:** February 28, 2026

## Overview

Ad Highlighter v2 is a Chrome browser extension that visually highlights advertisements on web pages. This privacy policy explains how the extension handles user data.

## Data collection

This extension **collects no personal data**. It does not collect browsing history, search queries, form inputs, credentials, or any other user information.

## Network requests

This extension **makes no network requests**. It does not communicate with any external servers, APIs, analytics services, or third-party endpoints. All ad detection logic runs entirely within your browser.

## Data storage

This extension **does not store user data** in any external database, cookie, or cloud service. The only local storage used is Chrome's built-in `storage` API, which saves:

- Whether the extension is enabled or disabled (a single boolean)
- A list of dismissed ad selectors (so false positives you've dismissed stay dismissed)

This data remains on your device and is never transmitted anywhere.

## Third-party sharing

This extension **does not share any information with third parties**. There are no analytics, no advertising SDKs, no telemetry, and no data brokers involved.

## How it works

The extension injects a content script into web pages that inspects the page's DOM (Document Object Model) for known ad patterns — specific HTML elements, CSS classes, text labels, and data attributes that indicate sponsored content. When an ad is detected, it is highlighted visually with a red outline. This process happens entirely locally in your browser.

## Open source

This extension is fully open source. The complete source code is available for inspection at:

https://github.com/nickmilette/ad-highlighter-v2

## Contact

For questions about this privacy policy or the extension, please open an issue on GitHub:

https://github.com/nickmilette/ad-highlighter-v2/issues

## Changes to this policy

Any changes to this privacy policy will be reflected in the GitHub repository and the effective date above will be updated accordingly.

# Football Spoiler Blocker

A Chrome extension that blocks football match spoilers so you can watch replays without knowing the result first. It automatically hides scores, match thumbnails, and result text on any website you choose.

## Use Case

You saved a Champions League match to watch tonight, but you need to check the news or browse YouTube first. Without this extension, scores and result thumbnails are impossible to avoid. Football Spoiler Blocker lets you browse freely — scores are masked, thumbnails are replaced with a neutral placeholder, and spoiler keywords are hidden until you're ready to watch.

## Features

- **Score masking** — Detects and hides scores in all formats: `2-1`, `Arsenal 2 - 1 Chelsea`, `FT: 2-1`, `(4-3 pens)`, goal scorers with minutes, and more
- **Thumbnail blocking** — Replaces match preview images with a spoiler-safe placeholder that shows team names (without the score)
- **Keyword filtering** — Hides result language like "late winner", "hat-trick", "comeback", "demolished", etc.
- **Per-site control** — Enable only on the sites you need; everything else is untouched
- **Dynamic content** — Catches lazy-loaded images and JavaScript-rendered content via MutationObserver
- **Syncs across devices** — Your site list syncs via Chrome account

## Installation

This extension is not on the Chrome Web Store. Load it manually as an unpacked extension:

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `football-spoiler-blocker` folder
6. The extension icon appears in your toolbar

Works on any Chromium-based browser: Chrome, Edge, Brave, Vivaldi, etc. (requires Chrome 88+ for Manifest V3 support).

## How to Use

### Enable protection on a site

1. Navigate to the site you want to protect (e.g. `youtube.com`, `uefa.tv`)
2. Click the extension icon in the toolbar
3. Toggle **"Enable on this site"** to ON
4. The badge on the icon turns green with **"ON"**
5. Refresh the page — spoilers are now blocked

### Manage your sites

Open the popup to see all your managed sites. You can:

- **Add a site** — Type a domain (e.g. `bbc.co.uk`) in the input field and press Enter or click **+**
- **Remove a site** — Click the **×** button next to any site in the list
- **Disable temporarily** — Toggle a site off without removing it from the list

### If a spoiler still slips through

Click **Refresh Page** in the popup. The content script runs at page load, so a refresh re-applies all blocking with the latest settings.

### Unblock a site to watch

1. Click the extension icon
2. Toggle **"Enable on this site"** to OFF
3. Click **Refresh Page**
4. Full original content is restored

## What Gets Blocked

| Content Type | Example | Blocked As |
|---|---|---|
| Simple scores | `2-1`, `2:1` | `[SCORE HIDDEN]` |
| Scores with teams | `Arsenal 2-1 Chelsea` | `Arsenal [SCORE HIDDEN] Chelsea` |
| Full-time scores | `FT: 2-1`, `Full-Time: 2-1` | `[SCORE HIDDEN]` |
| Penalty scores | `(4-3 pens)` | `[SCORE HIDDEN]` |
| Aggregate scores | `(3-2 agg)` | `[SCORE HIDDEN]` |
| Goal scorers | `Smith 45', Jones 67'` | hidden |
| Result keywords | "late winner", "hat-trick", "clean sheet" | hidden |
| Match thumbnails | Preview image with score overlay | Green placeholder |

Navigation elements, logos, and page headers are never blocked.

## Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the current tab's URL to identify the site |
| `storage` | Save and sync your site list across devices |
| `scripting` | Inject the content script into pages |
| `host_permissions` (all URLs) | Allow the content script to run on any site you add |

The extension only actively blocks content on sites you have explicitly enabled. All other sites are unaffected.

## Browser Support

- Chrome 88+
- Microsoft Edge 88+
- Brave, Vivaldi, and other Chromium-based browsers with Manifest V3 support

Firefox is not supported (uses a different extension API).

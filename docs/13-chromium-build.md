# NODE Browser: Chromium Build

Last updated: 2026-11-05. Status: step N01 written and checked without a Mac, with the NODE UI kit in the panel; first Mac build to run. The trail canvas (B112 part 1) is in the built-in extension. The code is on `main` since 2026-11-05 (before that, on the `chromium-build` branch). Code in `browser/` (see `browser/README.md`).

## Decision (2026-10-18)

Sven: build NODE on Chromium itself (option B in `08-engine-decision.md`), so Google sign-in works inside NODE. The Electron app stays the daily and release build until the Chromium build reaches parity; both share `core/`.

## Base

| Option | License | Fit | Verdict |
| --- | --- | --- | --- |
| ungoogled-chromium (macOS scripts) | BSD-3-Clause | Patch set and build scripts over stock Chromium; follows stable releases about every 4 weeks; no Google services to remove ourselves | **Chosen** |
| BrowserOS | AGPL-3.0 | Agent features similar to NODE's | Not used: AGPL would cover NODE's own code, which is MIT |
| Own Chromium fork from scratch | BSD-3-Clause | Full control | Not workable for one person |

Pinned to ungoogled-chromium-macos `152.0.7977.64-1.1` (`browser/base.env`): Chromium 152, the same as Electron 44, so pages behave the same in both builds.

## How NODE's features carry over

| Feature | In the Chromium build | Step |
| --- | --- | --- |
| Keywords, suggestions, search sources, Talk | Built-in extension side panel, same `core/` code | N01 (done in code), N02 for pins, hides, AI ideas |
| Interface (NODE UI kit: icon buttons, panel tabs, menu) | Side panel with the kit's tabs; menu as a NODE page in a tab (`menu.html`); toolbar button with the kit's `suggest` icon. Spec: `browser/extension/UI-SPEC.md` | N01 (done in code 2026-10-20); Mosaic, Sound and Capture buttons come with N02 and N05 |
| Autoplay with sound, 4-tab limit, center on click | Built-in extension content script and service worker; autoplay default patch | N01 |
| Google sign-in | Works: it is a real Chromium browser, not an embedded framework | N01 (to confirm on the Mac) |
| Bookmarks, history, find, zoom, PiP, downloads, print, passwords, extensions | Chromium's own | N01 |
| Trail canvas, timeline, Replay, trail files (B100-B110) | The canvas page (`canvas.html`, every new tab) with the Electron build's `renderer/canvas.js`; the trail store (`core/trail.js` and friends) in the service worker over `chrome.storage` | B112 part 1 (done in code 2026-11-05) |
| Research sessions, Library, Ask AI, site rules, Settings | Extension side panel with `chrome.storage` | N02 |
| Only the active tab audible, Sound: all | Extension with `tabs.update({ muted })` | N02 |
| NODE start page, Brave as default search, icon, "Chromium" wording in menus | Extension new tab page, initial preferences, branding resources | N03 |
| MCP server, logged-out agent reader, research agent | Native helper inside the app bundle, talking to the extension over native messaging; reader in its own profile | N04 |
| Mosaic (4 live tiles) | C++ patch: Chromium's split view shows 2; extend it to a grid | N05 |
| Address-bar suggestions from NODE (bookmarks first, history, Wikipedia) | C++ patch: an address-bar provider fed by the extension | N06 |
| Ad and tracker blocking | uBlock Origin Lite preinstalled, or the extension's own rules | N03 |
| Automatic updates, signing, Windows | Sparkle or own updater; Developer ID; Windows build from ungoogled-chromium-windows | N07 |

The Google window (B52) is not needed in the Chromium build.

## Steps

| ID | Step | Effort | Status |
| --- | --- | --- | --- |
| N01 | Base and first patches: ungoogled-chromium 152, branding (NODE Chromium, own bundle ID and profile folder), NODE panel as a built-in component extension with a fixed ID, autoplay with sound by default; macOS build and signing scripts; patch check and extension test in CI | M | Code done 2026-10-18. Patches apply to Chromium 152 (`check_patches.py`); the extension passes 29 checks in ungoogled-chromium 152 for Linux (7 for features, 22 for the UI kit). **To do on the Mac:** first full build, then the checks below |
| N02 | Panel parity with the Electron sidebar: pins and hides, Trail and sessions, Library, Ask AI, AI query ideas, site rules, Settings, sound per tab and Sound: all | L | Not started |
| N03 | Look and defaults: app icon, NODE wording instead of Chromium in menus and dialogs, NODE start page, Brave Search default, ad blocking | M | Not started |
| N04 | Agents: MCP server, logged-out reader and research agent through a native helper | L | Not started |
| N05 | Mosaic: C++ patch for a 4-tile grid of live tabs | L | Not started; measure the patch size first |
| N06 | Address-bar suggestions from NODE: C++ patch | L | Not started |
| N07 | Updates, Developer ID signing and notarization, Windows build | M | Not started |

Switch gate: N01-N06 done, Google sign-in works, and the Chromium build is Sven's daily research browser for a week with no blocking bugs (the same bar as Phase 4). Then the Electron build stops getting new features.

## First Mac build (N01 checks)

Build with `browser/build.sh` (see `browser/README.md`; about 150 GB free and several hours the first time). Then open the .dmg and check:

1. The app is named NODE Chromium and opens with Open Anyway.
2. Its profile is in `~/Library/Application Support/NODE Chromium`, and the Electron NODE still opens with its own data.
3. The NODE panel opens from the side panel menu or Alt+Shift+N, and `chrome://extensions` does not list it.
4. A Wikipedia article gives keywords and results (add a Brave key in the panel's Settings).
5. YouTube starts playing with sound; five video tabs: four play, the oldest pauses and resumes when opened.
6. Google sign-in works in a normal tab (accounts.google.com, then Gmail).
7. Whether the NODE toolbar button is shown (Chromium may hide toolbar buttons of component extensions; if so, N03 adds one). It should show the suggestions-panel outline, black in light mode and white in dark mode, with the tooltip "Suggestions panel".
8. The panel looks like the kit (`browser/extension/UI-SPEC.md`, section 5): Suggest and Talk tabs at the top, menu button on the right. The menu button opens the NODE menu in a tab; Esc closes it. A Brave key saved under Menu → Settings gives Brave results in the panel.

## Interface (NODE UI kit, 2026-10-20)

The kit from PR #1 (Electron) is in `browser/extension/src/ui/` (`node-ui.css`, `node-ui.js`, icons, fonts) and its spec in `browser/extension/UI-SPEC.md`. How it maps onto Chromium:

| Kit part | In the Chromium build |
| --- | --- |
| Suggestions panel with tabs | The side panel (`sidepanel.html`), `.panel.fill` because Chromium draws the frame and close button. Tabs: Suggest and Talk. Ask and Agent are added when their panes exist (N02, N04). |
| Menu (Library, Bookmarks, History, Downloads, Trail, Settings, Help) | `menu.html` in a tab, opened from the panel's menu button (the open menu tab is reused). `#section` opens a section; Esc or × closes the tab. Bookmarks, History and Downloads open Chromium's own pages; Settings has the Brave key, the playback line and a link to the browser's settings; Library, Trail and Help are placeholders until N02 and N07. |
| Shortcuts in the menu (⌘, ⌘Y ⌘⇧B) | Not shown: in this build those keys open Chromium's own settings, history and bookmarks bar. |
| Toolbar | Chromium's own buttons stay. NODE has one extension button (opens the panel) with the kit's `suggest` icon (PNG, made by `browser/extension/make-toolbar-icons.js`). Mosaic, Sound and Capture buttons are added when those features exist here (N02, N05). |
| Full screen | Chromium's own; no work needed on the Mac. |

The Chromium test is `test/e2e/46-chromium-build.js` (22 was taken by `22-ui-refresh`).

Record results in this doc and in `05-changelog.md`.

## Trail canvas (B112, 2026-11-05)

The trail canvas from the Electron build (B100-B110) runs in the built-in extension. The logic is shared: `core/trail.js`, `core/placement.js`, `core/trail-file.js` and `core/replay.js` are bundled into the service worker unchanged, and the canvas page loads `renderer/canvas.js` unchanged. Only the wiring is new.

| Part | In the Chromium build |
| --- | --- |
| Storage | `extension/src/trail-service.js`: the trail store's files are keys in `chrome.storage.local` (prefix `trails/`), read into memory when the service worker starts and written back 300 ms after a change. `unlimitedStorage` permission |
| Canvas | `canvas.html` replaces the new tab page: the canvas, Replay and Share at the top right, and a sidebar with the trail switcher (a menu), New trail, Open trail file…, the opened-file block, the timeline (Put on canvas with + or by dragging a row) and the Replay list. Messages `{ type: "trail", op, args }` to the service worker, as the Electron build's `trail:*` channels |
| Pages read | The service worker records each page that finishes loading in a normal tab (`tabs.onUpdated`), with the page it came from (the page before it in the tab, or the tab that opened it). Incognito tabs are never recorded |
| Pages becoming cards | The content script counts time on screen (the tab shown and its window in front); at 20 s, or after scrolling by hand by more than half a screen, the page becomes a card next to the page it came from. A page left earlier stays in the timeline with its time on page. Sign-in and payment pages never become cards |
| Share | The share sheet (note, Start here, timeline, preview) saves `<name>.trail.md` as a download |
| Open a file | Open trail file… or dropping a file on the canvas page: read only, on Replay step 1, with the note and Start here; Save as new trail |
| Search | The canvas search bar: a search card and the results in a new tab. Private search opens an incognito window when NODE is allowed there |
| Not yet | Mosaic and the Gallery (C++ patch, N05): the Mosaic button opens a group's pages as tabs for now. Ask about this trail (N02). Screenshots and voice notes. Trails keeping their own tabs (B80). Tabs still open when you switch trails are not made cards. Page pictures on cards |

Checked in ungoogled-chromium 152 for Linux by `test/e2e/47-chromium-canvas.js` (in the `chromium-build` CI job). On the Mac it comes with the first full build (N01 checks, then open a new tab).

## Costs to keep in mind

- Each Chromium update (about every 4 weeks): move `base.env` to the new ungoogled tag, run the patch check, rebuild (2-4 hours on an Apple-chip Mac).
- A 150 GB working folder on the build Mac. GitHub's free runners cannot build Chromium; releases are built on the Mac until a larger runner is worth paying for.
- Without an Apple Developer ID, testers open the app with Open Anyway and update by hand, as with the Electron build.

## Sources

- [ungoogled-chromium-macos](https://github.com/ungoogled-software/ungoogled-chromium-macos): build steps, BSD-3-Clause
- [ungoogled-chromium-macos 152.0.7977.64-1.1](https://newreleases.io/project/github/ungoogled-software/ungoogled-chromium-macos/release/152.0.7977.64-1.1)
- [BrowserOS](https://github.com/browseros-ai/BrowserOS): AGPL-3.0, Chromium patches plus build CLI
- Chromium 152.0.7977.64 source: `chrome/browser/extensions/component_loader.cc`, `chrome/common/chrome_paths_mac.mm`, `media/base/media_switches.cc`

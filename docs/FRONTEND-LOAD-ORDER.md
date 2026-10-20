# Frontend script load order (Phase 7)

The app is built from **classic `<script>`s that share one global scope**. There are no ES modules and no bundler.
Every function, `const` and `let` at the top level of a script is a page-wide global. Other scripts use these
globals, and so do the inline `onclick="…"` handlers in the HTML. Because of that, **the order of the scripts is
part of how the app works.**

Phase 7 moved the first part of the big inline app script of `index.html` into `js/core/*` and `js/utils/*`.
The code was moved **verbatim**: nothing was renamed, reordered or rewritten. Each file is loaded at the exact place
in `index.html` where its code used to be, so everything still runs in the same order and at the same moment of
page parsing.

## Order in `index.html`

| # | Script | What it holds | Top-level globals it defines |
|---|---|---|---|
| — | inline (head) | iOS zoom fix, splash, early theme | — |
| — | `vendor/chart.umd.js`, `vendor/modern-screenshot.js` | libraries | `Chart`, `modernScreenshot` |
| 1 | `js/core/api.js` | storage keys, API base | `STORAGE_KEY` `SESSION_KEY` `BACKUP_KEY_PREFIX` `MAX_BACKUPS` `detectApiBase` `API_BASE` |
| 2 | `js/core/auth.js` | server login, device token, branch header + `fetch` wrapper, offline password check | `sha256hex` `DeviceToken` `Branch` (+`window.Branch`) `OfflineAuth` `Auth` |
| 3 | `js/core/store.js` | the in-memory data store | `DB` |
| 4 | `js/core/offline.js` | per-tab client id, IndexedDB offline copy and send queue (Phase 3) | `_CLIENT_ID` `OfflineManager` |
| 5 | `js/core/sync.js` | live updates (SSE), pull with retry and backoff, the Phase 4 race guard | `SyncEngine` |
| 6 | `js/core/app.js` | topbar refresh, home button, login password eye, first load from the server, `seedData` | `updateHomeFab` `lgxTogglePass` `topbarRefresh` `bootstrapFromServer` `seedData` |
| 7 | `js/utils/format.js` | pure helpers | `dateStr` `daysAgo` `uid` `fmt` `fmtCurrency` `todayStr` `escapeHtml` `normalizeArabic` |
| 8 | `js/core/session.js` | current user, roles and page permissions, user menu, logout | `currentUser` `ROLE_LABELS` `PERMISSIONS` `ADMIN_ONLY_PAGES` `userPages` `can` `login` `openUserMenu` `logout` `restoreSession` |
| 9 | `js/core/ui.js` | theme, toggles, sounds, count-up, Ctrl+K, shortcuts, toast, modal, confirm | `toggleTheme` `loadTheme` `toast` `notify` `openModal` `closeModal` `confirmDialog` `celebrate` … |
| 10 | `js/core/navigation.js` | menu items, sidebar, `navigate()`, back history, scroll memory, route progress bar | `currentPage` `NAV_ITEMS` `SECTIONS` `renderSidebar` `navigate` `goBack` `toggleSidebar` … |
| 11 | `js/core/startup.js` | brand, `startApp` (checks after login), auto-save timers | `applyBrand` `branchPrintLine` `startApp` `startAutoSave` `showAutoSaveIndicator` … |
| 12 | `js/core/badges.js` | Quran reciter button and the top-bar badges | `playReciter` `toggleReciter` `updateNotifBadge` `updateWalletBadge` `getOverdueIssuances` … |
| 13 | `js/core/boot.js` | **the app's main start**: the `DOMContentLoaded` handler (who is signed in, offline copy, live sync, first page) | — (a listener only) |
| 14 | `js/core/search.js` | global search and voice search | `runGlobalSearch` `toggleVoiceSearch` `voiceRecognition` |
| 15 | `js/core/notifications.js` | the old `openNotifications()` modal | `openNotifications` (replaced later by `js/notify.js`) |
| 16 | inline (rest of the old app script) | dashboard and every page renderer, from «DASHBOARD» to the end. **Phase 8** | `renderDashboard` … `renderSuppliers`, … |
| 17+ | `js/glowchart.js` … `js/pushx.js` | the feature modules, unchanged | `AX*`, wrappers |

### Rules that keep this working

1. **Keep the order.** A file may only use, *while it loads*, names from files above it. Code inside functions,
   handlers and callbacks runs later and may use anything. This is exactly how the single inline script behaved,
   because its function declarations were hoisted. `npm run lint` now runs `lint/check-load-order.mjs`, which
   parses every app script in page order. It fails if code that runs at load time uses a top-level name declared
   in a later script, and it follows called functions transitively.
2. **`DOMContentLoaded` listeners run in registration order.** `startup.js` registers one (applying the brand),
   then `boot.js` registers the main start, then the feature modules register theirs. The inline remainder has none.
   Do not move these files past each other.
3. **Wrapper chains are untouched.** Feature modules loaded after the app script wrap page functions:
   - `renderSettings`: `adsadmin.js` → `settingsx.js`
   - `renderDashboard` and `renderSidebar`
   - `openNotifications`: replaced by `notify.js`

   They still load after every function they wrap.
4. **Globals are not wrapped in `window.*` assignments.** They are global because they are top-level declarations
   in a classic script, which is how they were before. `window.Branch = Branch` was already in the code and stays.
5. **Service worker:**
   - Every new file is in `sw.js` `APP_SHELL`, and `lint/check-syntax.mjs` enforces this.
   - The cache name was bumped (`erp-v3.6`), so an old cache can never serve an old copy of a moved file next to
     the new `index.html`.
   - The old `index.html` keeps its inline code, so an old cached page is complete on its own.

## Moving more code (Phase 8)

Use the same method:

- Cut one whole banner section, put it in a file loaded at that exact spot, and leave the code unchanged.
- Then:
  - run `lint/check-load-order.mjs`,
  - add the file to `APP_SHELL`,
  - run the targeted tests for that area.

Moving a section to a different place in the order is a separate, riskier change. Make it only after the load-order
check passes and the area's tests pass.

# Phase 0 — safety net (tests only)

Everything here is **test tooling**. It lives in `tests/` with its own `package.json`
and `package-lock.json`, so the app itself still has **zero dependencies** and the
deployed runtime (Railway / START.bat) is unchanged. No file outside `tests/` was edited.

## Run

```bash
cd tests
npm ci                                  # once: Playwright 1.56 + ESLint 10 (test-only)
npx playwright install chromium         # once per machine (skip if Chromium 1194 is already installed)

npm test                                # everything: lint → API → browser, with one summary
npm run lint                            # syntax of every JS file + inline scripts, JSON, ESLint ratchet
npm run test:api                        # API + sync tests (node:test, no browser) ~12 s
npm run test:browser                    # 25 pages × desktop/iPhone, navigation, live sync, offline ~6 min
npx playwright test --project=desktop   # one screen size only
npx playwright test --project=large-dataset   # the large-dataset load baseline only
node --test api/records.test.mjs        # one API file
npm run fixture                         # regenerate fixtures/large-dataset.json.gz (same seed → same data)
```

Windows: the same commands work in PowerShell / cmd (Node 22+).

Each test file starts the **real server** (`backend/server.js`) on a free port with a
throw-away `DATA_DIR`, so tests never touch your real data and can run in parallel.

## What is covered

| File | What it checks |
|---|---|
| `api/auth.test.mjs` | login, wrong password, throttling (429), sessions (survive restart, logout, revoke), weak-password lock, password change, disabled users, admin-only endpoints, no password hashes in responses |
| `api/permissions.test.mjs` | approval levels (sensitive / edits / none), what needs approval (delete, money edits, balance, stock), all-or-nothing refusals, closed period, admin settings, bad ids, `__proto__` |
| `api/approvals.test.mjs` | «طلبات الموافقة» + «الطلبات والمقترحات»: add own / not someone else's / no self-approval / withdraw / admin decides |
| `api/records.test.mjs` | save / edit / delete persisted after a restart, extra fields, invoice items, settings lists, malformed + oversized bodies, duplicate ids, required fields, numbering, audit log |
| `api/backup.test.mjs` | manual + daily backup files, download (and path safety), restore, internal snapshot, reset, large fixture restore + restart |
| `api/sync.test.mjs` | versions, opId idempotency (also after restart), concurrent balance/quantity deltas, last-write-wins, deleted-meanwhile, live stream (auth, events, refused changes silent, 6-per-user cap), polling fallback |
| `api/http.test.mjs` | security headers, every page asset exists, service worker headers, SPA fallback, path traversal, brand endpoint, customer portal |
| `api/access.test.mjs` | Phase 2 · C1: the permission matrix (kept equal to the browser's), what each kind of user receives, what each may change, API-bypass attempts |
| `api/audit.test.mjs` | Phase 2 · C3: server-written, append-only audit log; device entries ignored (reason kept); refused changes leave no entry; restore/reset keep history |
| `api/session.test.mjs` | Phase 2 · I11: 30-day idle / 90-day maximum sessions, one-time live-stream tickets, old `?t=` clients still served |
| `api/integrity.test.mjs` | Phase 1: required fields + DB-refusal rollback (C2), id collisions (I10), unique document numbers (C5), restore safety (I14) |
| `browser/pages.spec.mjs` | each of the 25 pages: correct title, content rendered, **no JS errors**, injection probes never run |
| `browser/layout.spec.mjs` | each page: **no horizontal overflow**, no `NaN` / `undefined` printed |
| `browser/navigation.spec.mjs` | login form, every sidebar item by click, back button, mobile menu, iPhone bottom bar, add-customer form → server, logout |
| `browser/sync.spec.mjs` | live update from another device, two browsers, offline queue → flush, refused change rolled back, offline reopen |
| `browser/large.spec.mjs` | large dataset: pages open without errors + timings recorded (baseline); C4: >5 MB offline copy saved in IndexedDB, offline reopen with queued changes, reconnect; Phase 4: edits during 3-second pulls of the large dataset (8 rounds) |
| `browser/phase2.spec.mjs` | Phase 2 from real browsers: 4 kinds of users open all their pages cleanly, hidden data never reaches the device, forbidden change rolled back, stream ticket, logout wipes the device, offline needs the password, one user can't open another's copy, unsent changes at logout |
| `browser/phase3.spec.mjs` | Phase 3 · C4: old localStorage copy migrated (verified, then removed), stale copy only removed, failed migration keeps the old copy (opens offline, reported, retried), queued changes survive an offline reopen and are sent once, failed save reported |
| `browser/phase4.spec.mjs` | Phase 4 · sync race: the pull's answer is held inside the page (`installGate`) while the device edits — saved / save-waiting / not-saved edits, several edits, another device during a save, several refresh notices, balance delta applied once, renumbered invoice, offline queue + live refresh (records never vanish). Stress: `npx playwright test browser/phase4.spec.mjs --repeat-each=25` |
| `browser/phase5.spec.mjs` | Phase 5: long lists in steps (every row arrives in order while scrolling, none missing/twice; refresh keeps the place; filters restart; short lists whole); the incremental highlighter leaves exactly what a full pass would, on all 25 pages |
| `browser/phase6.spec.mjs` | Phase 6: 1920 / 1600 / 1440 / 1366 / 1280 px — all 25 pages fit (no sideways page scroll), top-bar icons on screen, title not cut, sidebar full + collapsed + menu button, wide tables scroll inside their own box; light theme |
| `browser/phase1.spec.mjs` | Phase 1 from a real browser: UUID ids, backup date, renumbered invoice reaches the device, refused record removed, offline queue not blocked |

Fixed in Phase 1 (markers removed, tests now guard the fix): C2, C5, I10, I14, the «NaN/10/6» backup date.
Fixed in Phase 2: C1, C3, I11.
Fixed in Phase 3: C4 (offline copy in IndexedDB — see `docs/OFFLINE-STORAGE.md`).
Fixed in Phase 6: the desktop top bar (10 pages scrolled sideways at 1366 px; more at 1440 / 1280).
Phase 5: Issuances / Invoices / Customers open with 150 rows and load more while scrolling; the highlighter only looks at what changed.
Fixed in Phase 4: the sync race (an edit made while a pull was downloading could be overwritten and never sent).

## Known bugs (expected to fail today)

They are written as the **correct** behavior and marked so the suite stays green:
API tests use `{ todo }`, browser tests use `test.fail()`. When a later phase fixes one,
the runner prints "fixed? … remove the todo" (API) or Playwright reports
"expected to fail but passed" — then remove the marker so it guards the fix.

| ID | Test |
|---|---|
| — | none left (C4 fixed in Phase 3, the desktop top bar in Phase 6) |

## Layout probe (Phase 6)

`node bench/layout-probe.mjs [--widths=1366x768,1280x720] [--pages=users,audit] [--large]` — for each page that is
wider than the screen: the outermost elements sticking out, with the CSS that explains why.

## Page benchmark (Phase 5)

`node bench/page-profile.mjs issuances` — opens a page with the large dataset and prints: time until the page
is usable (main thread calm for 500 ms), render time, DOM elements, long tasks, heap, and a CPU profile.
Options: `--small` (normal data), `--no-profile`, `--window=25000` (profile a fixed time), `--scroll --steps=14`
(scroll through a stepped list), `--app=/other/checkout` (measure another version: before/after).

## Server benchmark

`node bench/ops-bench.mjs` — restore / restart / GET /api/data / 200 single saves on the large fixture.
`node bench/ops-bench.mjs /path/to/other/checkout` runs the same against another version (before/after).

## Lint ratchet

`lint/run-eslint.mjs` fails on any ESLint **error**, and on **more warnings than**
`lint/eslint-baseline.json`. After a cleanup lowers a count, lock it in with
`node lint/run-eslint.mjs --update-baseline`.

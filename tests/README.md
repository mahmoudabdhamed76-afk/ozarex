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
| `browser/pages.spec.mjs` | each of the 25 pages: correct title, content rendered, **no JS errors**, injection probes never run |
| `browser/layout.spec.mjs` | each page: **no horizontal overflow**, no `NaN` / `undefined` printed |
| `browser/navigation.spec.mjs` | login form, every sidebar item by click, back button, mobile menu, iPhone bottom bar, add-customer form → server, logout |
| `browser/sync.spec.mjs` | live update from another device, two browsers, offline queue → flush, refused change rolled back, offline reopen |
| `browser/large.spec.mjs` | large dataset: pages open without errors + timings recorded (baseline) |

## Known bugs (expected to fail today)

They are written as the **correct** behavior and marked so the suite stays green:
API tests use `{ todo }`, browser tests use `test.fail()`. When a later phase fixes one,
the runner prints "fixed? … remove the todo" (API) or Playwright reports
"expected to fail but passed" — then remove the marker so it guards the fix.

| ID | Test |
|---|---|
| C1 | restricted user downloads costs/users/portal tokens/lock hash; writes expenses & suppliers |
| C2 | customer/product without name, payment without date → 200 but lost after restart |
| C3 | no server audit entry; admin can delete audit entries |
| C4 | large dataset → offline copy not saved |
| C5 | two invoices with the same number accepted |
| I10 | re-sent existing id overwrites the record |
| I11 | logout leaves company data in localStorage |
| I14 | restore without users locks admin out; backups lose passwords on a new server |
| new | desktop 1366 px: 10 pages scroll sideways (top bar too wide) |
| new | security page shows «NaN/10/6» in the backup list (`js/security.js:123`, caused by the `erp-` file-name rename) |

## Lint ratchet

`lint/run-eslint.mjs` fails on any ESLint **error**, and on **more warnings than**
`lint/eslint-baseline.json`. After a cleanup lowers a count, lock it in with
`node lint/run-eslint.mjs --update-baseline`.

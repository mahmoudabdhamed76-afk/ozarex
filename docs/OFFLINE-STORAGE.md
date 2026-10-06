# Offline storage on the device (Phase 3 · C4)

## Where things live

| What | Where | Why |
|---|---|---|
| Offline copy of the company data (cache, **not** the source of truth) | IndexedDB `erp-offline` → store `data_snapshot`, one record `key: 'snapshot'` | can be tens of MB; localStorage stops at ~5 MB |
| Unsent changes (record-level ops) | IndexedDB `erp-offline` → store `sync_queue` (unchanged) | survive tab close; sent in order; the service worker sends them too |
| Preferences, sign-in data, small caches | localStorage (unchanged) | small, read synchronously at start |

The two IndexedDB stores are separate and never written by the same code path: the copy is written only by
`saveSnap()` and the queue only by `enqueue()` / `removeItem()` / `clearQueue()`. Database version stays **1**
(both stores already existed), so the service worker and older tabs open the same database without an upgrade.

### The snapshot record

```js
{ key: 'snapshot', v: 1, json: '<JSON text of DB.data>', ts: 1759700000000, owner: '<user id>', bytes: 10291015, from?: 'localStorage' }
```

* `json` is the same JSON text the old localStorage copy held (same content rules as before — e.g. `undefined`
  fields dropped; no structured-clone surprises).
* `owner` keeps the Phase 2 rule: offline, only that user's password opens it.
* Writes run one after another on a single chain. While one is being written, only the newest waiting copy is
  kept — an older copy is never written after a newer one.
* A failed write is reported: `console.error('[Offline] offline copy NOT saved…')`, `OfflineManager.snapshotStatus`
  (`{ ok:false, error }`), and one warning toast (at most every 10 minutes). The server save is not affected.

## Migration from the old localStorage copy (`em_offline_snap`)

Runs at start (`OfflineManager.init()`) and before the copy is read offline (`getCachedData()`):

1. no old copy → nothing to do.
2. old copy unreadable → logged, **left in place**.
3. IndexedDB already has a copy at least as new → the old copy is stale; it is removed.
4. otherwise → written to IndexedDB, **read back and compared** (text and owner), and only then removed.
5. any failure → logged, the old copy stays exactly as it was; offline start still opens it from localStorage;
   migration runs again on the next start.

Every successful new save also removes a leftover old copy (the new one is newer). The queue is never touched.

## Logout

`OfflineManager.wipe()` first stops new copies (a save still waiting is dropped), waits for a write already
running, then removes the old localStorage copy, empties the queue and the `data_snapshot` store.
Signing in again (`init()`) allows saving again. Phase 2 rules are unchanged: no automatic offline entry, the
password is always asked, one user can't open another user's copy.

## localStorage keys (review)

| Class | Keys | Phase 3 |
|---|---|---|
| Safe small preferences | `theme`, `ax_rail`, `ax_cf_mode`, `ax_set_tab`, `ax_pur_range`, `ax_mine_<user>`, `ax_apr_seen_<user>`, `ax_apr_evt_<user>`, `ax_rq_seen_<user>`, `erp_backup_snooze`, `erp_audit_seen_ts`, notification sound key, `erp_brand` (name + logo — small, but a big logo image could grow it) | unchanged |
| Authentication / security | `emx_tok` (device token), `emx_offline_auth` (PBKDF2 password check), `emx_last_user`, sessionStorage `emx_weak` | unchanged (removed at logout, Phase 2) |
| Large business data | `em_offline_snap` | **moved to IndexedDB** (only read now, to migrate) |
| Temporary / small caches | `erp_currency_rates`, `ax_market`, `erp_client_ip`, `ax_tk_inv`, `erp_last_backup`, sessionStorage `_erp_cid` | unchanged |
| Legacy, no longer written | `erp_session` (`SESSION_KEY`, only removed) | unchanged — cleanup left for later |

## Offline encryption — proposal for a later phase (not done now)

Encrypting the copy safely needs a key that is not stored next to it. The clean way is to derive it from the
password at sign-in (PBKDF2 → AES-GCM via WebCrypto) and keep it only in memory. But today a returning device
opens **without** typing the password while online, so there is no password to derive the key from on that
path — it would need either a new "unlock" step (new UI) or a key wrapped by the server per session (new
endpoint). Both are design changes, so encryption is left for a later phase. WebCrypto is also missing on plain
`http://` LAN addresses (non-secure context), which would need a fallback decision.

/* js/core/offline.js — per-tab client id + OfflineManager: IndexedDB offline copy (Phase 3), send queue, offline password, storage errors
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* ═══════════════════════════════════════════════════════
   CLIENT ID — unique per tab
═══════════════════════════════════════════════════════ */
const _CLIENT_ID = (() => {
  let id = sessionStorage.getItem('_erp_cid');
  if (!id) { id = Math.random().toString(36).slice(2,10) + Date.now().toString(36); sessionStorage.setItem('_erp_cid', id); }
  return id;
})();

/* ═══════════════════════════════════════════════════════
   OFFLINE MANAGER
   - IndexedDB snapshot (Phase 3 · C4 — was localStorage, capped at ~5 MB)
   - IndexedDB queue (survives tab close)
   - Service Worker BackgroundSync
   - flushQueue on reconnect
═══════════════════════════════════════════════════════ */
const OfflineManager = (() => {
  const IDB_NAME = 'erp-offline';
  const QUEUE_STORE = 'sync_queue';
  const SNAP_STORE = 'data_snapshot';      // same database, its own store — never mixed with the queue
  const SNAP_MAIN = 'snapshot';             // the main branch keeps the key it always had
  const snapKey = () => (Branch.get() === 'main' ? SNAP_MAIN : 'snapshot@' + Branch.get());   // 4.32 · one copy per branch
  const LS_SNAP = 'em_offline_snap';       // before Phase 3 the copy lived here — read only to migrate it

  let _db = null, _sw = null;
  let _online = navigator.onLine;
  let _pending = 0, _flushing = false;
  let _lastSaveAt = 0;

  async function openDB() {
    if (_db) return _db;
    return new Promise((res, rej) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE))
          db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('data_snapshot'))
          db.createObjectStore('data_snapshot', { keyPath: 'key' });
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror = () => rej(req.error);
    });
  }

  /* ── 4.7 · record-level sync ──────────────────────────────────────
     _base = what the server has, as far as this device knows. Every save
     sends only the difference (AXCore.wire): new records, removed ids,
     edited fields. Offline, each difference is queued in order and sent
     when the connection is back (the server skips one it already has). */
  let _base = null;
  let _changeSeq = 0;
  /* Phase 4: is there anything in DB.data this device has not turned into an operation yet? */
  function hasUnsent() { try { return !!(_base && AXCore.diff(_base, DB.data, {}).df.n); } catch (_) { return false; } }
  function setBase(d) { try { _base = AXCore.snapshot(d || DB.data, {}); } catch (_) { _base = null; } }
  function opId() { return Date.now().toString(36) + '-' + uid(); }   // unique per change (the server skips an opId it already applied)

  async function enqueue(item) {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).add(Object.assign({ ts: Date.now() }, item));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    _pending = (await dequeue()).length; updateUI();
  }

  async function dequeue() {
    const db = await openDB();
    return new Promise((res, rej) => {
      const req = db.transaction(QUEUE_STORE).objectStore(QUEUE_STORE).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }
  async function removeItem(key) {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).delete(key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }

  async function clearQueue() {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).clear();
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    _pending = 0; updateUI();
  }

  /* ── Phase 3 · C4 · the offline copy lives in IndexedDB ───────────────
     One record { key:'snapshot', v:1, json, ts, owner, bytes } in the `data_snapshot` store.
     The copy is kept as the same JSON text as before (identical content, any size the browser allows).
     It is only a cache: online, the server is always loaded instead.
     Every snapshot operation runs on one chain, in order; while a write is running only the newest
     waiting copy is kept (older ones are skipped, never written after a newer one).
     A failed save is never silent: console.error + one warning toast + OfflineManager.snapshotStatus. */
  let _snapChain = Promise.resolve();
  let _snapNext = null, _snapQueued = false;
  let _snapBlocked = false;                 // after logout nothing is written until someone signs in again
  let _snapStatus = { ok: null, ts: 0, bytes: 0, error: null };
  let _snapWarnedAt = 0;
  function snapOp(fn) { const p = _snapChain.then(fn, fn); _snapChain = p.catch(() => {}); return p; }
  function idbReq(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function snapGet() {
    const db = await openDB();
    return idbReq(db.transaction(SNAP_STORE).objectStore(SNAP_STORE).get(snapKey()));
  }
  async function snapPut(rec) {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(SNAP_STORE, 'readwrite');
      tx.objectStore(SNAP_STORE).put(rec);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => rej(tx.error || new Error('IndexedDB write aborted'));
    });
  }
  function snapFailed(what, e) {
    const msg = (e && (e.name ? e.name + ': ' : '') + (e.message || e)) || 'unknown';
    _snapStatus = { ok: false, ts: Date.now(), bytes: _snapStatus.bytes, error: what + ' — ' + msg };
    console.error('[Offline] ' + what + ':', e);
    if (Date.now() - _snapWarnedAt > 10 * 60 * 1000 && typeof toast === 'function') {
      _snapWarnedAt = Date.now();
      toast('تنبيه: النسخة الأوف لاين متحفظتش على الجهاز ده (' + ((e && e.name) || 'خطأ تخزين') + ') — شغلك متسجل على السيرفر عادي، بس لو النت فصل مش هتقدر تفتح البيانات من الجهاز', 'warning', 9000);
    }
  }

  /* old localStorage copy → IndexedDB. Idempotent: written, read back and compared, and only then is the
     old copy removed. Any failure leaves the old copy exactly where it was (tried again next start). */
  let _migrated = false;
  function migrateLegacy() {
    if (_migrated) return Promise.resolve(true);
    return snapOp(async () => {
      if (_migrated) return true;
      let raw = null;
      try { raw = localStorage.getItem(LS_SNAP); } catch (_) { return false; }
      if (!raw) { _migrated = true; return true; }
      let old;
      try { old = JSON.parse(raw); } catch (e) { console.error('[Offline] old offline copy is unreadable — left in place:', e); return false; }
      if (!old || typeof old !== 'object' || !old.data) { console.error('[Offline] old offline copy has no data — left in place'); return false; }
      try {
        const db0 = await openDB(), getMain = () => idbReq(db0.transaction(SNAP_STORE).objectStore(SNAP_STORE).get(SNAP_MAIN));   // the old copy was the main branch's
        const cur = await getMain();
        if (!(cur && cur.json && (cur.ts || 0) >= (old.ts || 0))) {      // IndexedDB already holds a newer copy → keep that one
          const json = JSON.stringify(old.data);
          await snapPut({ key: SNAP_MAIN, v: 1, json, ts: old.ts || Date.now(), owner: old.owner || null, bytes: json.length, from: 'localStorage' });
          const back = await getMain();
          if (!back || back.json !== json || (back.owner || null) !== (old.owner || null)) throw new Error('read-back check failed');
        }
        localStorage.removeItem(LS_SNAP);
        _migrated = true;
        console.info('[Offline] offline copy moved from localStorage to IndexedDB (' + raw.length + ' chars)');
        return true;
      } catch (e) {
        console.error('[Offline] moving the offline copy to IndexedDB failed — the old copy is kept:', e);
        return false;
      }
    });
  }

  function saveSnap(data) {
    if (_snapBlocked) return Promise.resolve(false);
    /* Phase 2 · I11: the copy remembers whose it is — another user can never open it offline */
    let rec;
    try {
      const json = JSON.stringify(data);
      rec = { key: snapKey(), v: 1, json, ts: Date.now(), owner: (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null, bytes: json.length, branch: Branch.get() };
    } catch (e) { snapFailed('offline copy could not be prepared', e); return Promise.resolve(false); }
    _snapNext = rec;
    if (_snapQueued) return _snapChain.then(() => _snapStatus.ok === true);
    _snapQueued = true;
    return snapOp(async () => {
      _snapQueued = false;
      const r = _snapNext; _snapNext = null;
      if (!r || _snapBlocked) return false;
      try {
        await snapPut(r);
        _snapStatus = { ok: true, ts: r.ts, bytes: r.bytes, error: null };
        /* this copy is newer than anything left in localStorage */
        try { if (localStorage.getItem(LS_SNAP) !== null) { localStorage.removeItem(LS_SNAP); _migrated = true; } } catch (_) {}
        return true;
      } catch (e) { snapFailed('offline copy NOT saved', e); return false; }
    });
  }
  async function loadSnap() {
    await migrateLegacy();
    await _snapChain;                          // a save still being written is the newest copy
    try {
      const rec = await snapGet();
      if (rec && rec.json && (rec.branch || 'main') === Branch.get()) return { data: JSON.parse(rec.json), ts: rec.ts, owner: rec.owner || null };
    } catch (e) { console.error('[Offline] reading the offline copy from IndexedDB failed:', e); }
    /* migration not possible on this device (IndexedDB refused) → the old copy is still usable as it is (it is the main branch's) */
    if (Branch.get() === 'main') { try { const raw = localStorage.getItem(LS_SNAP); if (raw) return JSON.parse(raw); } catch (e) { console.error('[Offline] old offline copy unreadable:', e); } }
    return null;
  }

  /* → 'ok' | 'refused' | 'login' (throws on network errors) */
  async function postOps(item) {
    _lastSaveAt = Date.now();
    const res = await fetch(API_BASE + '/api/ops', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': _CLIENT_ID, 'X-Branch': item.branch || 'main' },   // older queued items were the main branch's
      body: JSON.stringify({ ops: item.ops, opId: item.opId, cid: _CLIENT_ID }),
      signal: AbortSignal.timeout(15000)
    });
    if (res.status === 401) return 'login';
    if (res.status === 403) {
      const j = await res.json().catch(() => ({}));
      console.warn('[Sync] refused by server:', j);
      if (typeof toast === 'function') toast((j.message || 'السيرفر رفض التعديل') + ' — رجعت البيانات زي ما هي على السيرفر', 'warning', 6000);
      return 'refused';
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json().catch(() => ({}));
    // another device changed something since our last pull → fetch it (our own change is already in)
    /* the server gave a different document number (Phase 1 · C5) → take its copy right away */
    const missed = (json.prev && DB._serverVersion && json.prev !== DB._serverVersion) || (Array.isArray(json.renumbered) && json.renumbered.length > 0);
    if (json.version) DB._serverVersion = json.version;
    SyncEngine.onSelfSaved(json.version);
    if (missed) setTimeout(() => SyncEngine.pullLatest('missed', true), 250);
    return 'ok';
  }

  async function trySave(data) {
    saveSnap(data); // always snapshot first (written in the background, in order — see saveSnap)
    if (!_base || typeof AXCore === 'undefined') { setBase(data); return; }
    const r = AXCore.diff(_base, data, {});
    if (!r.df.n) return;
    const item = { ops: AXCore.wire(r.df), opId: opId(), branch: Branch.get() };   // 4.32 · sent to this branch even if the device switches later
    _base = r.cur;
    _changeSeq++;                              // Phase 4: a pull that started before this change must not overwrite it
    /* plain passwords never stay on this device (the server keeps a hash) */
    if (r.df.cols.users && Array.isArray(data.users) && data.users.some(u => u && u.password)) {
      data.users.forEach(u => { if (u) delete u.password; });
      setBase(data); saveSnap(data);
    }
    if (_online && !_pending) {
      try {
        const st = await postOps(item);
        if (st === 'ok') return;
        if (st === 'refused') { SyncEngine.pullLatest('refused', true); return; }
        if (st === 'login') { await enqueue(item); Auth.expired(); return; }
      } catch (e) {
        console.warn('[Offline] live POST failed, queuing:', e.message);
      }
    }
    await enqueue(item);
    if (_sw && 'sync' in _sw) { try { await _sw.sync.register('erp-sync'); } catch(_) {} }
    if (_online) setTimeout(flushQueue, 3000);
  }

  async function flushQueue() {
    if (_flushing || !_online) return;
    const items = await dequeue();
    if (!items.length) { _pending = 0; updateUI(); return; }
    _flushing = true;
    SyncEngine.setStatus('syncing');
    let sent = 0, refused = 0;
    try {
      for (const it of items) {
        if (!it.ops) { await removeItem(it.id); continue; }       // a full copy from before 4.7 — replaced by record-level sync
        const st = await postOps(it);
        if (st === 'login') { Auth.expired(); break; }
        await removeItem(it.id);
        if (st === 'refused') refused++; else sent++;
      }
      _pending = (await dequeue()).length; updateUI();
      if (sent && typeof toast === 'function') toast('✓ اترفع ' + sent + ' تعديل اتعمل أوف لاين');
      SyncEngine.setStatus('connected');
      setTimeout(() => SyncEngine.pullLatest('back-online', true), 400);
    } catch (e) {
      console.error('[Offline] flush failed:', e);
      SyncEngine.setStatus('error');
    } finally { _flushing = false; }
  }

  function updateUI() {
    const banner = document.getElementById('offline-banner');
    if (banner) {
      banner.classList.toggle('show', !_online);
      const m = banner.querySelector('.ob-msg');
      if (m) m.textContent = _pending > 0
        ? 'أوف لاين — ' + _pending + ' تغيير في الانتظار'
        : 'أوف لاين — ستتم المزامنة عند عودة الاتصال';
    }
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register(API_BASE + '/sw.js', { scope: API_BASE + '/' });
      _sw = reg;
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SYNC_COMPLETE') {
          console.info('[SW] background sync', e.data.sent, e.data.codes);
          dequeue().then(q => { _pending = q.length; updateUI(); });
          if (typeof toast === 'function') toast('✓ تمت المزامنة في الخلفية');
          SyncEngine.pullLatest('sw-sync');
        }
      });
      console.log('[SW] registered');
    } catch (e) { console.warn('[SW] registration failed:', e.message); }
  }

  async function init() {
    _snapBlocked = false;                      // signed in again
    migrateLegacy();
    await registerSW();
    window.addEventListener('online', () => {
      _online = true; updateUI();
      SyncEngine.setStatus('connecting');
      flushQueue();
    });
    window.addEventListener('offline', () => {
      _online = false; updateUI();
      SyncEngine.setStatus('offline');
    });
    try {
      const items = await dequeue();
      if (items.length > 0) { _pending = items.length; updateUI(); if (_online) flushQueue(); }
    } catch(_) {}
    updateUI();
  }

  /* Phase 3: async — the copy is read from IndexedDB */
  async function getCachedData(owner) { const s = await loadSnap(); return s && s.data && (!owner || !s.owner || s.owner === owner) ? s.data : null; }
  /* Phase 2 · I11: before signing out — wait for a send already running, try once more, then count what is really left */
  async function settle() {
    for (let i = 0; i < 50 && _flushing; i++) await new Promise(r => setTimeout(r, 200));
    try { if (_online && navigator.onLine && (await dequeue()).length) await flushQueue(); } catch (_) {}
    for (let i = 0; i < 50 && _flushing; i++) await new Promise(r => setTimeout(r, 200));
    try { _pending = (await dequeue()).length; updateUI(); } catch (_) {}
    return _pending;
  }
  async function wipe() {
    _snapBlocked = true; _snapNext = null;     // a save still waiting can't bring the copy back after this
    try { await _snapChain; } catch (_) {}
    try { localStorage.removeItem(LS_SNAP); } catch (_) {}
    await clearQueue();
    try {
      const db = await openDB();
      await new Promise((res, rej) => { const tx = db.transaction(SNAP_STORE, 'readwrite'); tx.objectStore(SNAP_STORE).clear(); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) { console.error('[Offline] could not clear the offline copy at logout:', e); }
    _snapStatus = { ok: null, ts: 0, bytes: 0, error: null };
  }
  function getLastSaveAt() { return _lastSaveAt; }

  return { init, trySave, flushQueue, getCachedData, getLastSaveAt, setBase, wipe, settle, get pending(){ return _pending; }, get isOnline(){ return _online; },
    get snapshotStatus(){ return Object.assign({}, _snapStatus); },
    get changeSeq(){ return _changeSeq; }, hasUnsent, get busy(){ return _flushing || _pending > 0; },   /* unsent offline changes still in the queue */
    snapshotSettled(){ return _snapChain.then(() => Object.assign({}, _snapStatus)); },
    _debug() { try { return { base: !!_base, diff: _base ? AXCore.diff(_base, DB.data, {}).df.n : null, pending: _pending, online: _online }; } catch (e) { return { err: e.message }; } } };
})();

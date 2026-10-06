'use strict';

const CACHE      = 'erp-v1.4';   // bump on every release that changes a cached file (Phase 4: index.html)
// relative to the SW scope, so it also works when the app lives under APP_PATH
const APP_SHELL  = ['./', './index.html', './manifest.json', './css/aurum.css', './js/aurum.js', './js/glowchart.js', './js/stockhub.js', './js/stockcount.js', './js/debts.js', './js/business.js', './js/custody.js', './js/axcore.js', './js/rules.js', './js/forecast.js', './js/purchases.js', './js/xlsx.js', './js/credit.js', './js/monthly.js', './js/notify.js', './js/approvals.js', './js/security.js', './js/aging.js', './js/cheques.js', './js/profit.js', './js/purchase.js', './js/requests.js', './js/isscards.js', './js/users.js', './js/assistant.js', './js/papermeter.js', './js/ticker.js', './js/pulsescene.js', './js/mhome.js', './js/marker.js', './js/picker.js', './js/auditx.js', './js/fxtape.js', './js/forcepw.js', './js/settingsx.js', './vendor/gsap.min.js',
                    './fonts/fonts.css', './vendor/chart.umd.js', './vendor/modern-screenshot.js',
                    './icons/logo-square.png'];
const DB_NAME    = 'erp-offline';
const QUEUE_STORE = 'sync_queue';
const SNAP_STORE  = 'data_snapshot';

/* ── Install: cache app shell ── */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL).catch(() => {}))
  );
});

/* ── Activate: drop caches from older versions, then claim clients ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('erp-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: serve from cache when offline ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only intercept same-origin GET requests for app shell
  if (e.request.method !== 'GET') return;
  if (url.pathname.includes('/api/')) return; // never cache API
  if (/\/p\/[A-Za-z0-9]+\/?$/.test(url.pathname)) return; // a center's live link — always fresh
  if (url.origin !== self.location.origin) return;

  // Pages: network-first so a new release shows immediately; cache only when offline
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    /* 4.13 · a weak signal must not leave a blank screen: after 4 s the saved copy opens,
       and the fresh one is still saved for next time */
    const fromCache = () => caches.match(e.request).then(r => r || caches.match('./index.html'));
    const net = fetch(e.request).then(res => {
      if (res && res.status === 200) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
      return res;
    });
    e.respondWith(new Promise(resolve => {
      let done = false;
      const t = setTimeout(() => { fromCache().then(r => { if (!done && r) { done = true; resolve(r); } }); }, 4000);
      net.then(res => {
        if (done) return;
        if (res && res.status >= 500) return fromCache().then(r => { done = true; clearTimeout(t); resolve(r || res); });
        done = true; clearTimeout(t); resolve(res);
      }).catch(() => fromCache().then(r => { if (!done) { done = true; clearTimeout(t); resolve(r || Response.error()); } }));
    }));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request)
        .then(res => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached); // offline fallback
      return cached || networkFetch;
    })
  );
});

/* ── Background Sync: flush queue when online ── */
self.addEventListener('sync', e => {
  if (e.tag === 'erp-sync') {
    e.waitUntil(flushQueue());
  }
});

/* ── Message from page: queue an API call ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'QUEUE_SAVE') {
    queueSave(e.data.payload).then(() => {
      e.ports[0]?.postMessage({ ok: true });
      // Try immediate flush
      flushQueue();
    });
  }
  if (e.data?.type === 'FLUSH_NOW') {
    flushQueue().then(result => {
      e.ports[0]?.postMessage(result);
    });
  }
});

/* ── IndexedDB helpers ── */
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE))
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains(SNAP_STORE))
        db.createObjectStore(SNAP_STORE, { keyPath: 'key' });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror  = () => rej(req.error);
  });
}

async function queueSave(payload) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add({ payload, ts: Date.now() });
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

async function getQueue() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(QUEUE_STORE).objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
}

async function clearQueue() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).clear();
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

/* 4.7 · each queued item is ONE change (record-level), sent in order to
   /api/ops with the session cookie. The server skips an item it already has
   (opId), so the page and this worker can't apply the same change twice. */
async function removeItem(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
let _flushing = false;
async function flushQueue() {
  if (_flushing) return { flushed: 0, busy: true };
  _flushing = true;
  let sent = 0; const codes = [];
  try {
    const items = await getQueue();
    for (const it of items) {
      if (!it.ops) { await removeItem(it.id); continue; }       // old full-copy item (before 4.7)
      const res = await fetch(new URL('./api/ops', self.registration.scope).href, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Offline-Sync': '1' },
        body: JSON.stringify({ ops: it.ops, opId: it.opId })
      });
      codes.push(res.status);
      if (res.status === 401) break;                             // needs login — the page will retry
      if (!res.ok && res.status !== 403) break;                  // server problem — try later
      await removeItem(it.id);                                   // done (or refused by the rules)
      sent++;
    }
    if (sent) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE', ts: Date.now(), sent, codes }));
    }
    return { flushed: sent, ok: true };
  } catch (e) {
    return { flushed: sent, error: e.message };
  } finally { _flushing = false; }
}

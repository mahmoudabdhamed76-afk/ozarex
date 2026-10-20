/* js/core/sync.js — SyncEngine: live updates (SSE), pulls with retry/backoff, the Phase 4 change-sequence guard, self-save handling
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* ═══════════════════════════════════════════════════════
   REAL-TIME SYNC ENGINE (SSE + zero-flicker)
═══════════════════════════════════════════════════════ */
const SyncEngine = (() => {
  let _es = null, _reconnectTimer = null, _reconnectDelay = 1000;
  let _online = navigator.onLine, _connected = false;
  let _isSyncing = false, _syncThrottle = null, _pollTimer = null;
  let _lastMsgAt = 0;
  let _again = null;
  /* Phase 4: a pull that has to wait for this device's own changes — one timer, requests merged, none dropped */
  let _waitTimer = null, _waiting = null, _queueWaits = 0, _localWaits = 0;
  function pullAfter(ms, reason, force) {
    _waiting = { reason: (_waiting && _waiting.reason) || reason, force: !!(force || (_waiting && _waiting.force)) };
    if (_waitTimer) return;
    _waitTimer = setTimeout(() => { _waitTimer = null; const w = _waiting; _waiting = null; pullLatest(w.reason, w.force); }, ms);
  }
  const savePending = () => !!(DB._saveTimer || DB._saveInflight);

  function setStatus(state) {
    const el = document.getElementById('sync-status-dot');
    if (!el) return;
    const colors = { connected:'#10b981', connecting:'#f59e0b', offline:'#6b7280', syncing:'#3b82f6', error:'#ef4444' };
    const labels = { connected:'متزامن ✓', connecting:'جاري الاتصال...', offline:'غير متصل', syncing:'يتزامن...', error:'خطأ بالمزامنة' };
    el.style.background = colors[state] || colors.offline;
    el.title = labels[state] || state;
    el.className = 'sync-dot sync-dot-' + state;
  }

  /* merge fresh data into DB.data WITHOUT touching DOM */
  function silentMerge(fresh) {
    const skip = new Set(['__version']);
    for (const key of Object.keys(fresh)) {
      if (skip.has(key)) continue;
      if (Array.isArray(fresh[key])) DB.data[key] = fresh[key];
      // the server is the source of truth (every local change was already sent as its own record)
      else if (fresh[key] && typeof fresh[key] === 'object') DB.data[key] = Object.assign({}, fresh[key]);
      else if (fresh[key] !== undefined) DB.data[key] = fresh[key];
    }
    const arrays = ['users','customers','products','invoices','payments','expenses','stockMoves','issuances','bankTransfers','suppliers','supplierPayments','notes','auditLog','employees','salaryRuns'];
    for (const k of arrays) if (!Array.isArray(DB.data[k])) DB.data[k] = [];
    if (!DB.data.settings) DB.data.settings = {};
    if (!DB.data.counters) DB.data.counters = { invoice:1000, issuance:1000, purchase:1000 };
    DB.data.customers.forEach(cu => { if (!cu.customPrices) cu.customPrices = {}; });
  }

  /* update only what's visible — never full re-render */
  function smartPageUpdate(reason) {
    const page = typeof currentPage !== 'undefined' ? currentPage : '';
    if (!page) return;
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
    if (typeof updatePaperCounter === 'function') updatePaperCounter();
    
    const hasModal = !!document.querySelector('.modal-overlay.show, .modal.show');
    const tag = document.activeElement ? document.activeElement.tagName : '';
    const hasInput = ['INPUT','TEXTAREA','SELECT'].includes(tag);
    if (hasModal || hasInput) {
      clearTimeout(window._deferSync);
      window._deferSync = setTimeout(() => smartPageUpdate('deferred'), 4000);
      return;
    }

    const pc = document.getElementById('page-content');
    if (!pc) return;

    // dashboard or any page: silent re-render with scroll preserved
    const scrollY = pc.scrollTop;
    const R = {
      dashboard: typeof renderDashboard === 'function' ? renderDashboard : null,
      customers: typeof renderCustomers === 'function' ? renderCustomers : null,
      invoices:  typeof renderInvoices  === 'function' ? renderInvoices  : null,
      payments:  typeof renderPayments  === 'function' ? renderPayments  : null,
      inventory: typeof renderInventory === 'function' ? renderInventory : null,
      stock:     typeof renderStockHub  === 'function' ? renderStockHub  : null,
      debts:     typeof renderDebts     === 'function' ? renderDebts     : null,
      approvals: typeof renderApprovals === 'function' ? renderApprovals : null,
      requests:  typeof renderRequests  === 'function' ? renderRequests  : null,
      forecast:  typeof renderForecast  === 'function' ? renderForecast  : null,
      monthly:   typeof renderMonthly   === 'function' ? renderMonthly   : null,
      purchases: typeof renderPurchaseInvoices === 'function' ? renderPurchaseInvoices : null,
      security:  typeof renderSecurity  === 'function' ? renderSecurity  : null,
      aging:     typeof renderAging     === 'function' ? renderAging     : null,
      cheques:   typeof renderCheques   === 'function' ? renderCheques   : null,
      profit:    typeof renderProfit    === 'function' ? renderProfit    : null,
      suppliers: typeof renderSuppliers === 'function' ? renderSuppliers : null,
      issuances: typeof renderIssuances === 'function' ? renderIssuances : null,
      sales:     typeof renderSales     === 'function' ? renderSales     : null,
      expenses:  typeof renderExpenses  === 'function' ? renderExpenses  : null,
    };
    const fn = R[page];
    if (!fn) return;
    fn();
    requestAnimationFrame(() => { pc.scrollTop = scrollY; });
    console.log('[Sync] page updated:', page, '(' + reason + ')');
  }

  async function pullLatest(reason = '', force) {
    // A local save is still queued / in flight: merging now would overwrite
    // what the user just did before it reaches the server. Try again after it.
    if (savePending()) { pullAfter(400, reason, force); return; }
    /* Phase 4: unsent offline changes are being sent — take the server's copy after them (bounded: ~16 s) */
    if (OfflineManager.busy && _queueWaits < 40) { _queueWaits++; pullAfter(400, reason, force); return; }
    /* a pull asked for while another is running is not dropped: it runs right after (that one may hold older data) */
    if (_isSyncing) { _again = { reason, force: force || (_again && _again.force) }; return; }
    _isSyncing = true; setStatus('syncing');
    const seq0 = OfflineManager.changeSeq;
    try {
      const res = await fetch(API_BASE + '/api/data', {
        headers: { 'Accept': 'application/json', 'X-Client-Id': _CLIENT_ID },
        cache: 'no-store', credentials: 'same-origin'
      });
      if (res.status === 401) { setStatus('error'); Auth.expired(); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const fresh = await res.json();
      /* Phase 4 · the race: this copy was requested BEFORE anything this device changed while it downloaded.
         Merging it would overwrite those edits and setBase() would then treat them as already on the server,
         so they would never be sent. Instead: send them first (normal save), then pull again. */
      /* …and the same for changes still waiting in the offline queue (the pull may have started a moment
         before the device noticed it was back online) — bounded like above */
      if (OfflineManager.busy && _queueWaits < 40) { _queueWaits++; pullAfter(400, reason, true); setStatus('connected'); return; }
      const unsent = !savePending() && OfflineManager.hasUnsent();
      if (unsent || savePending() || OfflineManager.changeSeq !== seq0) {
        if (unsent) DB.save();                 // edits not saved yet (autosave would catch them within 5 s) → now
        _localWaits++;
        pullAfter(_localWaits > 10 ? 3000 : 50, reason, true);   // forced: our own save moves the version on
        setStatus('connected');
        return;
      }
      _queueWaits = 0; _localWaits = 0;
      const newVer = fresh.__version || 0;
      if (!force && newVer && newVer <= DB._serverVersion) { setStatus('connected'); return; }
      DB._bootstrapData = fresh;
      DB._serverVersion = newVer;
      silentMerge(fresh);
      OfflineManager.setBase(DB.data);
      smartPageUpdate(reason);
      setStatus('connected');
    } catch (e) {
      if (window.__axLeaving) return;            // 4.32 · the page is reopening (branch switch / reload): a cut-off pull is expected
      console.error('[Sync] pull failed:', e);
      setStatus(_online ? 'error' : 'offline');
    } finally {
      _isSyncing = false;
      if (_again) { const a = _again; _again = null; setTimeout(() => pullLatest(a.reason, a.force), 30); }
    }
  }

  function throttledPull(reason) {
    if (_syncThrottle) return;
    _syncThrottle = setTimeout(() => { _syncThrottle = null; pullLatest(reason); }, 80);
  }

  function connect() {
    if (_es) { try { _es.close(); } catch(_) {} _es = null; }
    if (!_online) { setStatus('offline'); return; }
    setStatus('connecting');
    const myTry = ++_connectSeq;
    streamUrl().then(u => { if (myTry === _connectSeq && _online) open(u); });
  }
  /* Phase 2 · I11: a one-time ticket (60 s) from /api/me — the reusable session token never goes in a URL */
  let _connectSeq = 0;
  async function streamUrl() {
    try {
      const r = await fetch(API_BASE + '/api/me', { cache: 'no-store', credentials: 'same-origin' });
      if (r.ok) { const j = await r.json(); if (j && j.streamTicket) return API_BASE + '/api/events?st=' + encodeURIComponent(j.streamTicket) + '&branch=' + encodeURIComponent(Branch.get()); }
    } catch (_) {}
    return API_BASE + '/api/events?branch=' + encodeURIComponent(Branch.get());            // the session cookie alone
  }
  function open(url) {
    if (_es) { try { _es.close(); } catch(_) {} _es = null; }
    _es = new EventSource(url);
    _es.onopen = () => {
      _connected = true; _reconnectDelay = 1000; _lastMsgAt = Date.now();
      setStatus('connected');
      pullLatest('reconnect');
    };
    _es.onmessage = (e) => {
      _lastMsgAt = Date.now();
      if (!e.data || e.data.startsWith(':')) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === 'connected') { DB._serverVersion = msg.version || 0; return; }
        if (msg.event === 'ads_changed') { try { window.dispatchEvent(new CustomEvent('ax:ads-changed')); } catch (_) {} return; }   // 4.41
        if (msg.event !== 'data_changed') { try { document.dispatchEvent(new CustomEvent('ax:sse', { detail: msg })); } catch (_) {} return; }   // 4.34 · e.g. «transfers»
        if (msg.event === 'data_changed') {
          const isSelf = msg.source === _CLIENT_ID;
          if (isSelf) return;   // our own save — its HTTP reply already updated the version
          throttledPull('data_changed');
        }
      } catch(_) {}
    };
    _es.onerror = () => {
      _connected = false;
      try { _es.close(); } catch(_) {}
      _es = null;
      setStatus(_online ? 'connecting' : 'offline');
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (_reconnectTimer) return;
    _reconnectTimer = setTimeout(() => { _reconnectTimer = null; connect(); }, _reconnectDelay);
    _reconnectDelay = Math.min(_reconnectDelay * 2, 30000);
  }

  function onSelfSaved(v) { if (v) DB._serverVersion = v; setStatus('connected'); }
  function onSaveError(e) { setStatus('error'); if (typeof toast === 'function') toast('فشل حفظ البيانات: ' + e.message, 'error'); }

  /* polling fallback + SSE watchdog (mobile: SSE dies silently when app backgrounds) */
  function startPollingFallback() {
    if (_pollTimer) return;
    _pollTimer = setInterval(async () => {
      if (!_online) return;
      // watchdog: no message (incl. heartbeats) for 45s → connection is dead
      if (_connected && (Date.now() - _lastMsgAt) > 45000) {
        console.warn('[Sync] SSE stale, reconnecting');
        _connected = false;
        connect();
        return;
      }
      // fallback poll when disconnected
      if (!_connected) {
        try {
          const r = await fetch(API_BASE + '/api/version?branch=' + encodeURIComponent(Branch.get()), { cache: 'no-store' });
          if (!r.ok) return;
          const { version } = await r.json();
          if (version && version > DB._serverVersion) throttledPull('polling');
        } catch(_) {}
      }
    }, 10000);
  }

  function init() {
    window.addEventListener('online',  () => { _online = true;  setStatus('connecting'); connect(); });
    window.addEventListener('offline', () => { _online = false; setStatus('offline'); });
    // mobile: when app returns to foreground, SSE is usually dead — verify & reconnect
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && _online) {
        connect();
        pullLatest('visibility');
      }
    });
    window.addEventListener('focus', () => { if (_online) pullLatest('focus'); });
    connect();
    startPollingFallback();
  }

  return { init, pullLatest, onSelfSaved, onSaveError, setStatus };
})();

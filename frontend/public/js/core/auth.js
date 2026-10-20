/* js/core/auth.js — server login: device token, branch header + fetch wrapper, offline password check, Auth
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* ═══════════════════════════════════════════════════════
   4.7 · LOGIN ON THE SERVER
   The server checks the password (scrypt hash) and gives this browser
   an HttpOnly session cookie; every /api call needs it. For working
   offline, a salted SHA-256 verifier of the last successful login is
   kept on this device (never the password itself).
═══════════════════════════════════════════════════════ */
function sha256hex(str) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
    0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
    0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
    0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = new TextEncoder().encode(String(str)), l = bytes.length;
  const buf = new Uint8Array(((l + 9 + 63) >> 6) << 6); buf.set(bytes); buf[l] = 0x80;
  const dv = new DataView(buf.buffer); const bits = l * 8;
  dv.setUint32(buf.length - 4, bits >>> 0); dv.setUint32(buf.length - 8, Math.floor(bits / 4294967296));
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], W = new Int32Array(64);
  for (let i = 0; i < buf.length; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getInt32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = W[t - 15], y = W[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
/* 4.13 · stay signed in like the employees app: the device keeps its own session token and
   sends it with every API call, so losing the cookie (iPhone home-screen app, Safari clearing
   cookies, a new deploy) never signs the user out. */
const DeviceToken = {
  KEY: 'emx_tok',
  get() { try { return localStorage.getItem(this.KEY) || ''; } catch (_) { return ''; } },
  set(t) { try { if (t) localStorage.setItem(this.KEY, t); else localStorage.removeItem(this.KEY); } catch (_) {} }
};
/* 4.32 · the branch open on this device. Every API call names it (X-Branch) — the server only ever
   answers with that branch's records. Switching branch reloads the app (nothing of the old branch stays
   in memory). The choice is remembered per user on this device. */
const Branch = {
  _cur: 'main', _list: [], _allowed: ['main'], _uid: '',
  get() { return this._cur || 'main'; },
  list() { return this._list.slice(); },
  allowed() { return this._allowed.slice(); },
  info(id) { id = id || this.get(); return this._list.find(b => b.id === id) || { id, name: id === 'main' ? 'الفرع الأساسي' : 'فرع', code: '', main: id === 'main', active: true }; },
  _k(uid, x) { return 'ax_branch' + (x || '') + '_' + (uid || 'x'); },
  set(got) {
    this._list = (got && Array.isArray(got.branches) && got.branches.length) ? got.branches : [{ id: 'main', name: 'الفرع الأساسي', code: 'A', active: true, main: true }];
    this._allowed = (got && Array.isArray(got.allowed) && got.allowed.length) ? got.allowed : ['main'];
  },
  async init(uid, offline) {
    this._uid = uid || '';
    let stored = '', got = null;
    try { stored = localStorage.getItem(this._k(uid)) || ''; } catch (_) {}
    if (!offline) {
      try {
        const r = await fetch(API_BASE + '/api/branches', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(6000), headers: { 'X-Branch': 'main' } });
        if (r.ok) got = await r.json();
      } catch (_) {}
    }
    if (got && Array.isArray(got.branches)) { try { localStorage.setItem(this._k(uid, 's'), JSON.stringify(got)); } catch (_) {} }
    else { try { got = JSON.parse(localStorage.getItem(this._k(uid, 's')) || 'null'); } catch (_) { got = null; } }
    this.set(got);
    this._cur = this._allowed.includes(stored) ? stored : (this._allowed.includes('main') ? 'main' : this._allowed[0]);
    document.documentElement.setAttribute('data-branch', this._cur);
    try { document.dispatchEvent(new CustomEvent('ax:branch', { detail: { id: this._cur } })); } catch (_) {}
    return this._cur;
  },
  remember(id) { try { localStorage.setItem(this._k(this._uid), id); } catch (_) {} }
};
window.Branch = Branch;
(function () {
  const _f = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const same = !/^https?:/i.test(url) || url.indexOf(location.origin) === 0;
      if (same && url.indexOf('/api/') >= 0) {
        const t = DeviceToken.get();
        init = Object.assign({}, init || {});
        const h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || undefined);
        if (t && !h.has('Authorization')) h.set('Authorization', 'Bearer ' + t);
        if (!h.has('X-Branch')) h.set('X-Branch', Branch.get());       // 4.32 · a queued change keeps its own branch
        init.headers = h;
      }
    } catch (_) {}
    return _f(input, init);
  };
})();
const OfflineAuth = {
  KEY: 'emx_offline_auth', LAST: 'emx_last_user',
  _all() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch (_) { return {}; } },
  _hash(salt, u, p) { let h = sha256hex(salt + ':' + String(u).toLowerCase() + ':' + p); for (let i = 0; i < 2000; i++) h = sha256hex(h + salt); return h; },
  /* Phase 2 · I11: PBKDF2 (210,000 rounds) when the browser has WebCrypto (https); the old SHA loop otherwise */
  async _kdf(salt, u, p) {
    try {
      if (window.crypto && crypto.subtle && window.isSecureContext) {
        const enc = new TextEncoder(), key = await crypto.subtle.importKey('raw', enc.encode(String(p)), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt + ':' + String(u).toLowerCase()), iterations: 210000 }, key, 256);
        return 'p2$' + Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) {}
    return this._hash(salt, u, p);
  },
  async save(username, password, user) {
    try {
      const all = this._all(), salt = uid();
      all[String(username).toLowerCase()] = { salt, h: await this._kdf(salt, username, password), user, at: Date.now() };
      localStorage.setItem(this.KEY, JSON.stringify(all));
      localStorage.setItem(this.LAST, user.id);
    } catch (_) {}
  },
  async check(username, password) {
    const r = this._all()[String(username).toLowerCase()];
    if (!r) return null;
    const h = String(r.h).startsWith('p2$') ? await this._kdf(r.salt, username, password) : this._hash(r.salt, username, password);
    if (h !== r.h) return null;
    try { localStorage.setItem(this.LAST, r.user.id); } catch (_) {}
    return r.user;
  },
  lastUser() { try { return localStorage.getItem(this.LAST); } catch (_) { return null; } },
  forgetLast() { try { localStorage.removeItem(this.LAST); } catch (_) {} }
};
const Auth = {
  /* → user | null (not logged in) | 'offline' (server unreachable) */
  async me() {
    let r;
    try { r = await fetch(API_BASE + '/api/me', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(6000) }); }
    catch (_) { return 'offline'; }
    if (r.status === 401) return null;
    if (!r.ok) return 'offline';
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return 'offline';
    const j = await r.json();
    if (j && j.token) DeviceToken.set(j.token);   // devices signed in before 4.13 get their token here
    if (j && j.mustChange) { window.__mustChange = true; if (window.AXForcePw) AXForcePw.check(j); }   // 4.20 · weak password → change it first
    return j.user || null;
  },
  async login(username, password) {
    const r = await fetch(API_BASE + '/api/login', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(10000)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return j;
  },
  async logout() {
    try { await fetch(API_BASE + '/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
    OfflineAuth.forgetLast();
    DeviceToken.set('');
    /* Phase 2 · I11: nothing of the company stays on this device after signing out —
       the offline copy, the offline password check, the queue (already sent or knowingly dropped) */
    ['em_offline_snap', 'emx_offline_auth', 'emx_last_user', 'emx_tok', 'erp_client_ip', 'ax_tk_inv'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    try { Object.keys(localStorage).filter(k => k.indexOf('ax_branchs_') === 0).forEach(k => localStorage.removeItem(k)); } catch (_) {}   // 4.32 · the cached branch list
    try { sessionStorage.removeItem('emx_weak'); } catch (_) {}
    try { await OfflineManager.wipe(); } catch (_) {}
  },
  /* before signing out: send what is still waiting; if it can't be sent, ask (never drop it silently) */
  async settleBeforeLogout() {
    try { if (DB._saveTimer || DB._saveInflight) { clearTimeout(DB._saveTimer); await DB._flush(); } } catch (_) {}
    let n = 0;
    try { n = await OfflineManager.settle(); } catch (_) { n = OfflineManager.pending; }
    if (!n) return true;
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (done) return; done = true; window.__logoutAnswer = null; closeModal(); resolve(v); };
      window.__logoutAnswer = finish;
      openModal('⚠️ فيه تعديلات لسه مترفعتش',
        '<p class="ax-modal-lead">فيه ' + n + ' تعديل اتعمل على الجهاز ده ولسه موصلش للسيرفر (مفيش نت). لو خرجت دلوقتي هيتمسحوا من الجهاز. الأفضل تستنى لما النت يرجع.</p>',
        '<button class="btn btn-primary" id="logout-wait" onclick="window.__logoutAnswer && window.__logoutAnswer(false)">استنى — متخرجش</button>' +
        '<button class="btn btn-danger" id="logout-drop" onclick="window.__logoutAnswer && window.__logoutAnswer(true)">اخرج وامسحهم</button>');
      const ov = document.getElementById('modal-overlay');
      const watch = setInterval(() => { if (done) return clearInterval(watch); if (!ov.classList.contains('show')) { clearInterval(watch); finish(false); } }, 300);
    });
  },
  _expired: false,
  async expired() {
    if (this._expired || !currentUser) return;
    this._expired = true;
    /* a 401 can be a one-off (a deploy restarting, a lost cookie) — ask again before signing anyone out */
    try { const u = await this.me(); if (u && u !== 'offline') { this._expired = false; return; } if (u === 'offline') { this._expired = false; return; } } catch (_) { this._expired = false; return; }
    try {
      openModal('🔐 الجلسة انتهت', '<p class="ax-modal-lead">لازم تسجّل دخول تاني. أي تعديل عملته متحفظ على الجهاز وهيترفع أول ما تدخل.</p>',
        '<button class="btn btn-primary" onclick="location.reload()">تسجيل الدخول</button>');
    } catch (_) { location.reload(); }
  }
};

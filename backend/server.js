'use strict';

process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(w);
});

/* 4.20 · one bad request must never take the whole app down */
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && e.stack || e));
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e && e.stack || e); setTimeout(() => process.exit(1), 200); });   // Railway restarts it clean

const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const url  = require('node:url');
const zlib = require('node:zlib');

const { db, DB_FILE } = require('./db');
const adsMod = require('./src/ads');
const { defaultBlob } = require('./src/bridge');
const auth  = require('./src/auth');
const store = require('./src/store');
const branches = require('./src/branches');
const transfers = require('./src/transfers');
try { transfers.recover(); } catch (e) { console.error('[transfers] recover:', e.message); }
const portal = require('./src/portal');
const webpush = require('./src/webpush');
const staff = require('./src/staff');
/* 4.61 · the employees pick the center they're working at from the ERP's own customers (every branch) */
staff.setSource({
  centers: () => {
    const out = [];
    for (const st of branches.allStores()) {
      const d = st.data() || {};
      for (const c of (d.customers || [])) { if (!c || !c.id || !c.name || c.archived || c.disabled) continue; out.push({ key: st.id + ':' + c.id, id: c.id, branch: st.id, name: String(c.name).slice(0, 120), address: String(c.address || '').slice(0, 160) }); }
    }
    return out;
  },
  branches: () => branches.list().filter(b => b.active || b.main).map(b => ({ id: b.id, name: b.name }))
});
/* 4.63 · who hears about a punch (the admins) + the live event the open screens turn into a toast */
staff.setNotify({
  admins: () => ((store.data() || {}).users || []).filter(u => u && u.role === 'admin' && !u.disabled).map(u => u.id),
  event: (name, payload) => { try { broadcast(name, payload); } catch (e) {} }
});
const digest = require('./src/digest');
/* 4.39 · the daily summary + instant alerts read every active branch */
const digestCtx = () => ({
  branches: branches.list().filter(b => b.active || b.main).map(b => { const bs = branches.storeOf(b.id); return { id: b.id, name: b.name, data: bs ? bs.data() : {} }; }),
  mainData: store.data()
});
digest.start(digestCtx);
const market = require('./src/market');
try { market.init(require('./db').DATA_DIR); } catch (e) { console.warn('[market] init', e.message); }

const PORT     = Number(process.env.PORT) || 8787;
const HOST     = process.env.HOST || '0.0.0.0';
const APP_PATH = process.env.APP_PATH !== undefined ? process.env.APP_PATH : '';
const PUBLIC   = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'frontend', 'public');
const MAX_BACKUPS = 20;

/* ═══ start-up: hash old passwords, load sessions + data ═══ */
auth.migratePasswords();
auth.loadSessions();
/* 4.20 · anyone still on an easy password (from before this version) gets the change screen too */
setTimeout(async () => {          // in the background, so a big users list never slows the start
  try {
    for (const u of db.prepare('SELECT id, username, password FROM users').all()) {
      const tries = ['admin', '123456', '12345', '1234', '0000', '000000', '111111', 'password', '12345678', 'qwerty', String(u.username || '')].filter(Boolean);
      for (const p of tries) {
        if (await auth.verifyPasswordAsync(p, u.password)) { db.prepare('INSERT INTO user_flags (user_id, must_change) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET must_change = 1').run(u.id); break; }
      }
    }
  } catch (e) { console.error('[weak-check]', e.message); }
}, 3000);
store.load();

/* ═══════════════════════════════════════════════════════
   REAL-TIME SYNC — SSE broadcast hub
   push a version token to every logged-in device; each device
   then pulls the fresh data itself.
═══════════════════════════════════════════════════════ */
/* 4.32 · one version per branch; a device only hears about the branch it has open */
const _versions  = new Map([['main', Date.now()]]);
function verOf(b) { b = b || 'main'; if (!_versions.has(b)) _versions.set(b, Date.now()); return _versions.get(b); }
const _clients   = new Map();           // clientId → { res, userId, branch }
let   _clientSeq = 0;

function broadcast(eventName, payload, branch) {
  const dead = [];
  for (const [id, client] of _clients) {
    if (branch && client.branch !== branch) continue;
    const data = JSON.stringify({ event: eventName, version: verOf(client.branch), branch: client.branch, ...payload });
    try { client.res.write(`data: ${data}\n\n`); } catch (_) { dead.push(id); }
  }
  dead.forEach(id => _clients.delete(id));
}
function notifyDataChanged(meta = {}, branch = 'main') {
  _versions.set(branch, Math.max(Date.now(), verOf(branch) + 1));
  const st = branches.storeOf(branch); if (st) st.markDirty();
  broadcast('data_changed', { changedAt: new Date().toISOString(), ...meta }, branch);
}
/* users / company settings changed (they live in main and every branch shows them) → every branch is told */
function notifyAllBranches(meta = {}) {
  branches.refreshOverlays();
  const now = Date.now();
  new Set(['main', ...[..._clients.values()].map(c => c.branch)]).forEach(b => { _versions.set(b, Math.max(now, verOf(b) + 1)); });
  store.markDirty();
  broadcast('data_changed', { changedAt: new Date().toISOString(), ...meta });
}
/* 4.41 · Smart Ads Manager (its own tables in the main database + /api/ads routes; every branch sees the same ads) */
const ads = adsMod.create({ db, readBody: (...a) => readBody(...a), sendJSON: (...a) => sendJSON(...a), broadcast });
setInterval(() => {
  const now = Date.now(), dead = [];
  for (const [id, client] of _clients) { try { client.res.write(`: ping ${now}\n\n`); } catch (_) { dead.push(id); } }
  dead.forEach(id => _clients.delete(id));
}, 20000);

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
/* 4.20 · security headers on every response: no framing (click-jacking), no MIME sniffing,
   HTTPS-only once the app has been opened over HTTPS, no plugins / foreign <base> */
function secHeaders(req) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), payment=()'
  };
  if (req && auth.isHttps && auth.isHttps(req)) h['Strict-Transport-Security'] = 'max-age=31536000';
  return h;
}
function sendJSON(res, status, obj, extraHeaders) {
  if (res.headersSent || res.writableEnded) return;
  const body = JSON.stringify(obj);
  const headers = Object.assign(secHeaders(res.req), {
    'Content-Type':   'application/json; charset=utf-8',
    'Cache-Control':  'no-store'
  }, extraHeaders || {});
  endBody(res.req, res, status, body, headers, true);
}
/* gzip only when the client asked for it and the payload is worth it.
   Clients that don't send Accept-Encoding (and the tests' raw http.get) get the same bytes as before. */
function endBody(req, res, status, body, headers, compressible) {
  if (res.headersSent || res.writableEnded) return;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const h = Object.assign({}, headers);
  const gzipOk = status === 200 && compressible && buf.length >= 1024
    && /\bgzip\b/i.test(String((req && req.headers && req.headers['accept-encoding']) || ''))
    && !h['Content-Encoding'];
  if (!gzipOk) {
    h['Content-Length'] = buf.length;
    res.writeHead(status, h);
    res.end(buf);
    return;
  }
  zlib.gzip(buf, { level: 6 }, (err, gz) => {
    if (res.headersSent || res.writableEnded || res.destroyed) return;
    if (err || !gz || gz.length >= buf.length) {
      h['Content-Length'] = buf.length;
      res.writeHead(status, h);
      res.end(buf);
      return;
    }
    res.writeHead(status, Object.assign({}, h, {
      'Content-Encoding': 'gzip',
      'Content-Length': gz.length,
      'Vary': h.Vary ? h.Vary + ', Accept-Encoding' : 'Accept-Encoding'
    }));
    res.end(gz);
  });
}
function readBody(req, limitMb) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const LIMIT = (limitMb || 1) * 1024 * 1024;
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMIT) { const err = new Error('too_large'); err.status = 413; reject(err); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { const raw = Buffer.concat(chunks).toString('utf8'); resolve(raw ? JSON.parse(raw) : null); }
      catch (e) { const err = new Error('bad_json'); err.status = 400; reject(err); }
    });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp',
  '.map': 'application/json; charset=utf-8'
};
function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { if (!res.headersSent) { res.writeHead(404); res.end('Not found'); } return; }
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === '.html';
    const longCache = ext === '.woff2' || ext === '.woff';
    const headers = Object.assign(secHeaders(req), {
      'Content-Type':   MIME[ext] || 'application/octet-stream',
      'Cache-Control':  isHtml ? 'no-cache, no-store, must-revalidate'
                      : longCache ? 'public, max-age=31536000, immutable'
                      : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    /* long-lived fonts must not also say Expires: 0 — that header cancels the year-long cache */
    if (!longCache) { headers.Pragma = 'no-cache'; headers.Expires = '0'; }
    const alreadyPacked = longCache || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif' || ext === '.ico' || ext === '.gz';
    endBody(req, res, 200, data, headers, !alreadyPacked);
  });
}
/* an internal snapshot in the database (kept 20) — taken at most every 10 minutes */
const _lastDbBackup = new Map();         // 4.32 · per branch: { at, ver }
function takeBackup(force, st) {
  st = st || store;
  const last = _lastDbBackup.get(st.id) || { at: 0, ver: 0 };
  if (!force && (Date.now() - last.at < 600e3 || last.ver === verOf(st.id))) return null;
  const sdb = st.db, json = JSON.stringify(st.bridge.exportBlob());
  const now  = new Date().toISOString();
  sdb.exec('BEGIN');
  try {
    sdb.prepare('INSERT INTO backups (created_at, payload) VALUES (?, ?)').run(now, json);
    const ids = sdb.prepare('SELECT id FROM backups ORDER BY id DESC').all().map(r => r.id);
    if (ids.length > MAX_BACKUPS) { const del = sdb.prepare('DELETE FROM backups WHERE id = ?'); for (const id of ids.slice(MAX_BACKUPS)) del.run(id); }
    sdb.exec('COMMIT');
  } catch (e) { sdb.exec('ROLLBACK'); throw e; }
  _lastDbBackup.set(st.id, { at: Date.now(), ver: verOf(st.id) });
  return now;
}
setInterval(() => { for (const st of branches.allStores()) { try { takeBackup(false, st); } catch (e) { console.error('[db-backup ' + st.id + ']', e.message); } } }, 600e3);
/* daily file backup (+ Telegram when configured): on start and every hour — every branch */
async function dailyAll() { for (const st of branches.allStores()) { try { await st.daily(); } catch (e) { console.error('[backup ' + st.id + ']', e.message); } } }
setTimeout(dailyAll, 5000);
setInterval(dailyAll, 3600e3);

/* changes already applied — a retry (lost response, offline queue, the
   service worker) must never apply the same difference twice */
const _seenOps = new Set();
let _opDoneStmt;
try {
  db.prepare('DELETE FROM applied_ops WHERE at < ?').run(Date.now() - 30 * 864e5);
  for (const r of db.prepare('SELECT id FROM applied_ops').all()) _seenOps.add(r.id);
} catch (_) {}
function opSeen(id) { return !!id && _seenOps.has(String(id)); }
function opDone(id) {
  if (!id) return;
  _seenOps.add(String(id));
  try {
    if (!_opDoneStmt) _opDoneStmt = db.prepare('INSERT OR IGNORE INTO applied_ops (id, at) VALUES (?, ?)');
    _opDoneStmt.run(String(id), Date.now());
  } catch (_) {}
}

/* who is calling */
function currentUser(req) {
  let id = auth.sessionUserId(req);
  /* Phase 2 · the live stream may carry a one-time ticket instead of the session token (no reusable token in URLs) */
  if (!id && /^\/(?:[^?]*\/)?api\/events(?:\?|$)/.test(String(req.url || ''))) { const m = String(req.url).match(/[?&]st=([A-Za-z0-9_-]{20,80})/); if (m) id = auth.redeemTicket(m[1]); }
  if (!id) return null;
  const u = store.user(id);
  return u && u.disabled !== true ? u : null;
}
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role });
/* weak password → must change it first */
let _mustChangeStmt, _setMustChangeStmt;
function mustChange(id) {
  if (process.env.EMX_DEV_WEAK_OK === '1') return false;
  try {
    if (!_mustChangeStmt) _mustChangeStmt = db.prepare('SELECT must_change FROM user_flags WHERE user_id = ?');
    const r = _mustChangeStmt.get(id);
    return !!(r && r.must_change);
  } catch (e) { return false; }
}
function setMustChange(id, on) {
  try {
    if (!_setMustChangeStmt) _setMustChangeStmt = db.prepare('INSERT INTO user_flags (user_id, must_change) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET must_change = excluded.must_change');
    _setMustChangeStmt.run(id, on ? 1 : 0);
  } catch (e) { console.error('[user_flags]', e.message); }
}
function weakPw(pw, username) { pw = String(pw || ''); return pw.length < 6 || pw.toLowerCase() === String(username || '').toLowerCase() || /^(admin|123456?|1234|0000|000000|111111|password|12345678|qwerty)$/i.test(pw); }

/* ═══════════════════════════════════════════════════════
   REQUEST ROUTER
═══════════════════════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = parsed.pathname || '/';

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // Strip APP_PATH prefix
  if (APP_PATH) {
    if (pathname === '/' || pathname === APP_PATH) { res.writeHead(302, { Location: APP_PATH + '/' }); return res.end(); }
    if (pathname.startsWith(APP_PATH + '/')) pathname = pathname.slice(APP_PATH.length);
  }

  try {
    /* ── public ── */
    if (pathname === '/api/health') {
      return sendJSON(res, 200, { ok: true, time: new Date().toISOString() });
    }
    if (pathname === '/sw.js') {
      const swPath = path.join(PUBLIC, 'sw.js');
      try {
        const data = await fs.promises.readFile(swPath);
        const headers = { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Service-Worker-Allowed': '/' };
        return endBody(req, res, 200, data, headers, true);
      } catch (_) { /* missing worker falls through, same as before */ }
    }
    /* the company name + logo for the login screen (what the buyer set in الإعدادات → الشركة) */
    if (pathname === '/api/brand' && req.method === 'GET') {
      const st = (store.data() || {}).settings || {};
      const logo = typeof st.companyLogo === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(st.companyLogo) ? st.companyLogo : '';
      return sendJSON(res, 200, { name: String(st.companyName || '').slice(0, 120), logo });
    }
    if (pathname === '/api/version' && req.method === 'GET') { const vb = String(parsed.query.branch || 'main'); return sendJSON(res, 200, { version: branches.get(vb) ? verOf(vb) : verOf('main') }); }
    /* a center's own read-only page (token link) */
    if ((pathname.startsWith('/p/') || pathname.startsWith('/c/')) && portal.handle(req, res, pathname, () => branches.allStores().map(st => st.data()))) return;   // 4.32 · a center's link works in any branch

    /* 4.60 · الموظفين: the employee's own page (/staff) and its API — his own login, never the ERP's */
    if (pathname === '/staff/') { res.writeHead(302, { Location: APP_PATH + '/staff' }); return res.end(); }
    if (pathname === '/staff') return serveStatic(req, res, path.join(PUBLIC, 'staff.html'));
    if (pathname === '/staff-sw.js') {
      try { const data = await fs.promises.readFile(path.join(PUBLIC, 'staff-sw.js')); return endBody(req, res, 200, data, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Service-Worker-Allowed': '/staff' }, true); } catch (_) {}
    }
    if (pathname === '/staff/manifest.json') return sendJSON(res, 200, { name: 'حضور وانصراف', short_name: 'حضوري', start_url: '../staff', scope: '../', display: 'standalone', background_color: '#0c0809', theme_color: '#0c0809', lang: 'ar', dir: 'rtl', icons: [{ src: '../icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '../icons/icon-512.png', sizes: '512x512', type: 'image/png' }] }, { 'Cache-Control': 'public, max-age=3600' });
    if (pathname.startsWith('/staff/api/')) return await staff.handlePublic(req, res, pathname, { sendJSON, readBody, settings: () => (store.data() || {}).settings || {} });

    /* ── login / logout / who am I ── */
    if (pathname === '/api/login' && req.method === 'POST') {
      const b = (await readBody(req, 0.02)) || {};
      const name = String(b.username || '').slice(0, 64), pw = String(b.password || '').slice(0, 256);
      const wait = auth.throttled(req, name);
      if (wait) return sendJSON(res, 429, { error: 'too_many', message: 'محاولات كتير غلط — استنى ' + wait + ' دقيقة وجرّب تاني' });
      const u = store.userByName(name);
      let ok = false;
      try { ok = !!u && u.disabled !== true && await auth.verifyPasswordAsync(pw, auth.storedHash(u.id)); }
      catch (e) { return sendJSON(res, 503, { error: 'busy', message: 'السيرفر مشغول — جرّب كمان ثانية' }); }
      if (!ok) { auth.failed(req, name); return sendJSON(res, 401, { error: 'bad_login', message: 'اسم المستخدم أو كلمة السر غلط' }); }
      auth.succeeded(req, name);
      if (!auth.isHash(auth.storedHash(u.id))) auth.migratePasswords();
      const token = auth.createSession(u.id, req);
      const weak = weakPw(pw, u.username);
      setMustChange(u.id, weak);
      return sendJSON(res, 200, { ok: true, user: publicUser(u), weak, mustChange: mustChange(u.id), token }, { 'Set-Cookie': auth.cookieHeader(req, token) });
    }
    if (pathname === '/api/logout' && req.method === 'POST') {
      const t = auth.tokenOf(req); if (t) auth.dropSession(t);
      return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(req, null) });
    }
    if (pathname === '/api/me' && req.method === 'GET') {
      const u = currentUser(req);
      /* 4.13 · renew the cookie on every visit, so an active device never gets signed out */
      /* streamTicket: one-time, 60 s — the live stream uses it instead of putting the session token in its URL */
      return u ? sendJSON(res, 200, { user: publicUser(u), token: auth.tokenOf(req), mustChange: mustChange(u.id), streamTicket: auth.issueTicket(u.id) }, { 'Set-Cookie': auth.cookieHeader(req, auth.tokenOf(req)) }) : sendJSON(res, 401, { error: 'login' });
    }

    /* ── everything below needs a logged-in user ── */
    if (pathname.startsWith('/api/')) {
      const me = currentUser(req);
      if (!me) return sendJSON(res, 401, { error: 'login', message: 'سجّل دخول الأول' });
      const admin = me.role === 'admin';
      const adminOnly = () => sendJSON(res, 403, { error: 'forbidden', message: 'للمدير بس' });
      /* a weak password (e.g. the first admin/admin): reading is fine, nothing gets written until it's changed */
      if (req.method !== 'GET' && pathname !== '/api/password' && mustChange(me.id))
        return sendJSON(res, 403, { error: 'must_change', message: 'غيّر كلمة السر الأول — دي سهلة التخمين' });

      /* 4.32 · which branch this request is about (header X-Branch, or ?branch= for the live stream);
         nothing given = the main branch, so every older device keeps working exactly as before */
      const bid = String(req.headers['x-branch'] || parsed.query.branch || 'main').slice(0, 40);
      const st = branches.storeOf(bid);
      if (/^\/api\/(data|ops|events|backups|backup\/|reset)/.test(pathname)) {
        if (!st || !branches.get(bid)) return sendJSON(res, 404, { error: 'branch_not_found', message: 'الفرع ده مش موجود' });
        if (!branches.canUse(me, bid)) return sendJSON(res, 403, { error: 'branch_forbidden', message: 'مالكش صلاحية على الفرع ده' });
      }

      /* 4.60 · الموظفين: the manager's side (admin only) */
      if (pathname === '/api/staff' || pathname.startsWith('/api/staff/')) { if (!admin) return adminOnly(); return await staff.handleAdmin(req, res, pathname, me, { sendJSON, readBody }); }

      /* 4.41 · ads: everyone reads their feed + records views/clicks; only admins manage */
      if (pathname === '/api/ads' || pathname.startsWith('/api/ads/')) return await ads.handle(req, res, pathname, me);

      /* 4.39 · push notifications on this device (any signed-in user) */
      if (pathname === '/api/push/key' && req.method === 'GET') return sendJSON(res, 200, { key: webpush.publicKey(), devices: webpush.countFor(me.id) });
      if (pathname === '/api/push/subscribe' && req.method === 'POST') {
        const b = (await readBody(req, 0.02)) || {};
        try { webpush.subscribe(me, b.subscription, req.headers['user-agent']); } catch (e) { return sendJSON(res, 400, { error: 'bad_request', message: 'الاشتراك ده مش صالح' }); }
        return sendJSON(res, 200, { ok: true, devices: webpush.countFor(me.id) });
      }
      if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
        const b = (await readBody(req, 0.02)) || {};
        webpush.unsubscribe(b.endpoint);
        return sendJSON(res, 200, { ok: true, devices: webpush.countFor(me.id) });
      }
      if (pathname === '/api/push/test' && req.method === 'POST') {
        const r = await webpush.send([me.id], { title: '🔔 الإشعارات شغّالة', body: 'هيوصلك هنا الملخص اليومي وأي عجز أو مصروف مستني موافقتك', url: './?go=fulus', tag: 'test' });
        return sendJSON(res, 200, { ok: r.ok > 0, devices: r.devices, sent: r.ok });
      }
      /* 4.39 · الملخص اليومي (admin) */
      if (pathname === '/api/digest' && req.method === 'GET') {
        if (!admin) return adminOnly();
        return sendJSON(res, 200, { config: digest.publicConfig(), devices: webpush.countFor(me.id), now: digest.local(), history: digest.history(40) });
      }
      if (pathname === '/api/digest' && req.method === 'PUT') {
        if (!admin) return adminOnly();
        const b = (await readBody(req, 0.02)) || {};
        const c = digest.setConfig(b);
        store.logEvent(me, { operation: 'edit', table: 'settings', recordId: 'digest', recordLabel: 'الملخص اليومي', after: Object.assign({}, c, { apikey: c.hasKey ? '•••' : '' }) });
        return sendJSON(res, 200, { ok: true, config: c });
      }
      if (pathname === '/api/digest/send' && req.method === 'POST') {
        if (!admin) return adminOnly();
        const b = (await readBody(req, 0.02)) || {};
        const r = await digest.run(digestCtx(), { test: b.test !== false, to: [me.id] });
        return sendJSON(res, 200, { ok: true, text: r.text, sent: r.sent, day: r.day });
      }
      if (pathname === '/api/digest/telegram' && req.method === 'POST') {
        if (!admin) return adminOnly();
        const b = (await readBody(req, 0.02)) || {};
        try {
          const r = await digest.linkTelegram(b.token);
          store.logEvent(me, { operation: 'edit', table: 'settings', recordId: 'digest', recordLabel: 'ربط تليجرام', after: { bot: r.bot, linked: r.linked } });
          return sendJSON(res, 200, Object.assign({ ok: true, config: digest.publicConfig() }, r));
        } catch (e) { return sendJSON(res, 400, { error: e.code || 'telegram', message: e.message }); }
      }
      if (pathname === '/api/digest/history' && req.method === 'GET') {
        if (!admin) return adminOnly();
        return sendJSON(res, 200, { history: digest.history(parsed.query.limit) });
      }

      /* 4.32 · the branches */
      if (pathname === '/api/branches' && req.method === 'GET') {
        return sendJSON(res, 200, { branches: branches.visible(me), allowed: branches.idsFor(me) });
      }
      if (pathname === '/api/branches' && req.method === 'POST') {
        if (!admin) return adminOnly();
        const b = (await readBody(req, 0.05)) || {};
        try { const br = branches.create(b); store.logEvent(me, { operation: 'add', table: 'branches', recordId: br.id, recordLabel: br.name, after: br }); notifyAllBranches({ type: 'branches' }); return sendJSON(res, 200, { ok: true, branch: br }); }
        catch (e) { if (e instanceof branches.BranchError) return sendJSON(res, e.status, { error: e.code, message: e.message }); throw e; }
      }
      /* 4.34 · التحويلات بين الفروع (بضاعة / فلوس) — every step checked and applied here, never twice */
      if (pathname === '/api/transfers' && req.method === 'GET') return sendJSON(res, 200, { transfers: transfers.list(me) });
      { const tm = /^\/api\/transfers(?:\/([A-Za-z0-9_]{4,40})\/(receive|cancel))?$/.exec(pathname);
        if (tm && req.method === 'POST') {
          try {
            let out;
            if (!tm[1]) out = transfers.create(me, (await readBody(req, 0.5)) || {});
            else out = tm[2] === 'receive' ? transfers.receive(me, tm[1]) : transfers.cancel(me, tm[1]);
            const t = out.transfer;
            if (!out.dup) {
              const meta = { source: req.headers['x-client-id'] || 'unknown', by: me.id, type: 'transfer' };
              if (!tm[1]) digest.alert(digestCtx(), 'transfer', '🚚 تحويل ' + (t.kind === 'cash' ? 'فلوس ' + Number(t.amount || 0).toLocaleString('en-US') : 'بضاعة (' + (t.items || []).length + ' صنف)') + ' لـ ' + (t.toName || ''), 'من ' + (t.fromName || '') + ' — بعته ' + (me.name || me.username) + (t.status === 'received' ? ' ودخل الفرع' : ' ومستني تأكيد الاستلام')).catch(() => {});
              if (tm[2] === 'receive') notifyDataChanged(meta, t.to); else notifyDataChanged(meta, t.from);
              if (!tm[1] && t.status === 'received') notifyDataChanged(meta, t.to);      // 4.50 · it arrived in the same step: the receiving branch's devices refresh too
              broadcast('transfers', { id: t.id, status: t.status, from: t.from, to: t.to });
            }
            return sendJSON(res, 200, { ok: true, transfer: t, dup: !!out.dup });
          } catch (e) {
            if (e instanceof transfers.TransferError) return sendJSON(res, e.status, { error: e.code, message: e.message });
            if (e instanceof store.Refused) return sendJSON(res, e.status || 403, Object.assign({ error: e.code, message: e.message }, e.extra));
            throw e;
          }
        } }

      /* 4.33 · «جميع الفروع»: every branch's numbers + the total (admin) — the same rules as the screens (js/branchstats.js) */
      if (pathname === '/api/branches/summary' && req.method === 'GET') {
        if (!admin) return adminOnly();
        const BS = require(path.join(PUBLIC, 'js', 'branchstats.js'));
        const tz = process.env.TZ || 'Africa/Cairo';
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const okDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
        const p = ['today', 'month', 'last', 'year', 'all', 'custom'].includes(parsed.query.p) ? parsed.query.p : 'month';
        let r = BS.range(p === 'custom' ? 'month' : p, today);
        if (p === 'custom' && okDay(parsed.query.from) && okDay(parsed.query.to)) r = [String(parsed.query.from), String(parsed.query.to)].sort();
        const rows = branches.list().filter(b => b.active || b.main).map(b => {
          const bs = branches.storeOf(b.id);
          return Object.assign({ id: b.id, name: b.name, code: b.code, main: b.main }, BS.summary(bs ? bs.data() : {}, r));
        });
        return sendJSON(res, 200, { period: p, from: r[0], to: r[1], today, branches: rows, total: BS.total(rows) });
      }
      { const m = /^\/api\/branches\/([A-Za-z0-9_]{1,40})$/.exec(pathname);
        if (m && req.method === 'PUT') {
          if (!admin) return adminOnly();
          const b = (await readBody(req, 0.05)) || {};
          try { const before = branches.get(m[1]); const br = branches.update(m[1], b); store.logEvent(me, { operation: 'edit', table: 'branches', recordId: br.id, recordLabel: br.name, before, after: br }); notifyAllBranches({ type: 'branches' }); return sendJSON(res, 200, { ok: true, branch: br }); }
          catch (e) { if (e instanceof branches.BranchError) return sendJSON(res, e.status, { error: e.code, message: e.message }); throw e; }
        } }

      /* live dollar / gold prices for the header tape */
      if (pathname === '/api/market' && req.method === 'GET') {
        try { return sendJSON(res, 200, await market.get()); }
        catch (e) { return sendJSON(res, 503, { error: 'market', message: 'أسعار السوق مش متاحة دلوقتي' }); }
      }

      /* data */
      if (pathname === '/api/data' && req.method === 'GET') {
        const blob = st.dataFor(me);               // Phase 2 · C1 — only what this user's pages need · 4.32: of this branch
        return sendJSON(res, 200, Object.assign({}, blob, { __version: verOf(bid), __branch: bid }));
      }
      if (pathname === '/api/ops' && req.method === 'POST') {
        const b = await readBody(req, 15);
        if (!b || typeof b !== 'object' || !b.ops || typeof b.ops !== 'object') return sendJSON(res, 400, { error: 'bad_request' });
        if (opSeen(b.opId)) return sendJSON(res, 200, { ok: true, dup: true, version: verOf(bid) });
        const prev = verOf(bid);
        /* 4.39 · the approvals waiting before this change (an expense that starts waiting now → alert) */
        const apBefore = b.ops.sets && b.ops.sets._approvals ? { settings: { _approvals: (((st.data() || {}).settings || {})._approvals || []).map(r => ({ id: r && r.id, status: r && r.status })) } } : null;
        let out, sharedTouched = false;
        try {
          if (bid === 'main') { out = store.apply(me, b.ops); sharedTouched = !(out && out.noop) && branches.touchesShared(b.ops); }
          else {
            /* 4.32 · a branch: its own records go to its file; users / company settings go to main */
            const sp = branches.split(b.ops);
            if (sp.local) out = st.apply(me, sp.local);
            if (sp.shared) { const o2 = store.apply(me, sp.shared); if (!(o2 && o2.noop)) sharedTouched = true; if (!out || out.noop) out = o2; }
            if (!out) out = { noop: true };
          }
          opDone(b.opId);
        } catch (e) {
          if (e instanceof store.Refused) return sendJSON(res, e.status || 403, Object.assign({ error: e.code, message: e.message }, e.extra));
          throw e;
        }
        if (sharedTouched) notifyAllBranches({ source: req.headers['x-client-id'] || b.cid || 'unknown', by: me.id });
        if (out && out.noop && !sharedTouched) return sendJSON(res, 200, { ok: true, version: verOf(bid), prev, noop: true });   // e.g. only audit entries from an old client
        notifyDataChanged({ source: req.headers['x-client-id'] || b.cid || 'unknown', by: me.id }, bid);
        if (b.ops.sets && (b.ops.sets._cashCounts || b.ops.sets._approvals)) { const br = branches.get(bid) || {}; digest.onOps(digestCtx(), { id: bid, name: br.name || '', data: st.data() }, apBefore, b.ops, me); }
        /* «renumbered»: numbers the server changed to keep them unique (extra field — old clients ignore it
           and still get the new number, because the version jump makes them pull the latest data) */
        return sendJSON(res, 200, Object.assign({ ok: true, version: verOf(bid), prev }, out && out.renumbered && out.renumbered.length ? { renumbered: out.renumbered } : {}));
      }
      /* full replace — restore / import (admin only) */
      if (pathname === '/api/data' && req.method === 'POST') {
        if (!admin) return adminOnly();
        const body = await readBody(req, 60);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJSON(res, 400, { error: 'Invalid body' });
        /* I14 · checked first; nothing is replaced when the file has broken records */
        takeBackup(true, st);
        const r = st.restore(body, me);            // 4.32 · restores THIS branch only
        if (r.problems.length) return sendJSON(res, 400, { error: 'invalid_backup', message: 'الملف فيه سجلات ناقصة — مترجعش حاجة', count: r.problems.length, problems: r.problems.slice(0, 20) });
        if (bid === 'main') notifyAllBranches({ source: req.headers['x-client-id'] || 'unknown', type: 'replace' });
        notifyDataChanged({ source: req.headers['x-client-id'] || 'unknown', type: 'replace' }, bid);
        return sendJSON(res, 200, { ok: true, version: verOf(bid), adminKept: r.adminKept, usersWithoutPassword: r.usersWithoutPassword });
      }

      /* live updates */
      if (pathname === '/api/events' && req.method === 'GET') {
        const clientId = (++_clientSeq).toString();
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`data: ${JSON.stringify({ event: 'connected', clientId, version: verOf(bid), branch: bid })}\n\n`);
        /* at most 6 live streams per user — the oldest one is closed */
        const mine = [..._clients].filter(([, c]) => c.userId === me.id);
        if (mine.length >= 6) mine.slice(0, mine.length - 5).forEach(([id, c]) => { _clients.delete(id); try { c.res.end(); } catch (_) {} });
        _clients.set(clientId, { res, userId: me.id, branch: bid });
        const keepalive = setInterval(() => { if (res.writableEnded || res.destroyed) return done(); try { res.write(`: heartbeat\n\n`); } catch { done(); } }, 15000);
        function done() { clearInterval(keepalive); _clients.delete(clientId); }
        req.on('close', done); req.on('error', done); res.on('close', done);
        return;
      }

      /* backups (admin) */
      if (pathname === '/api/backups' && req.method === 'GET') {
        if (!admin) return adminOnly();
        return sendJSON(res, 200, { branch: bid, files: st.listBackups(), telegram: st.telegramStatus(), db: st.db.prepare('SELECT id, created_at FROM backups ORDER BY id DESC').all() });
      }
      if (pathname === '/api/backup/download' && req.method === 'GET') {
        if (!admin) return adminOnly();
        let buf, name;
        if (parsed.query.file) {
          const p = st.backupPath(parsed.query.file);
          if (!p) return sendJSON(res, 404, { error: 'not_found' });
          buf = await fs.promises.readFile(p); name = parsed.query.file;
        } else { buf = await st.gzBlob(); name = 'erp-' + (bid === 'main' ? '' : bid + '-') + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json.gz'; }
        res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': buf.length, 'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'no-store' });
        return res.end(buf);
      }
      if (pathname === '/api/backup/now' && req.method === 'POST') {
        if (!admin) return adminOnly();
        const r = await st.writeDaily(true);
        return sendJSON(res, 200, { ok: true, file: r.file, files: st.listBackups() });
      }
      if (pathname === '/api/backup/telegram' && req.method === 'POST') {
        if (!admin) return adminOnly();
        const r = await st.sendTelegram('(إرسال يدوي)');
        return sendJSON(res, r.ok ? 200 : 400, r);
      }

      /* devices that are logged in (admin) */
      if (pathname === '/api/sessions' && req.method === 'GET') {
        if (!admin) return adminOnly();
        const mine = auth.sha(auth.tokenOf(req) || '');
        const rows = auth.listSessions().map(s => {
          const u = store.user(s.user_id) || {};
          return { id: s.id.slice(0, 16), user: u.name || '—', role: u.role || '', created: s.created_at, lastSeen: s.last_seen, ua: s.ua, ip: s.ip, me: s.id === mine };
        });
        return sendJSON(res, 200, { sessions: rows });
      }
      if (pathname === '/api/sessions/revoke' && req.method === 'POST') {
        if (!admin) return adminOnly();
        const b = (await readBody(req, 1)) || {};
        const full = auth.listSessions().find(s => s.id.slice(0, 16) === String(b.id || ''));
        if (full) auth.dropSessionById(full.id);
        return sendJSON(res, 200, { ok: !!full });
      }
      /* change my own password */
      if (pathname === '/api/password' && req.method === 'POST') {
        const b = (await readBody(req, 0.02)) || {};
        const wait = auth.throttled(req, 'pw:' + me.id);
        if (wait) return sendJSON(res, 429, { error: 'too_many', message: 'محاولات كتير غلط — استنى ' + wait + ' دقيقة' });
        let okCur = false;
        try { okCur = await auth.verifyPasswordAsync(String(b.current || '').slice(0, 256), auth.storedHash(me.id)); }
        catch (e) { return sendJSON(res, 503, { error: 'busy', message: 'السيرفر مشغول — جرّب كمان ثانية' }); }
        if (!okCur) { auth.failed(req, 'pw:' + me.id); return sendJSON(res, 400, { error: 'bad_current', message: 'كلمة السر الحالية غلط' }); }
        const next = String(b.next || '');
        if (next.length < 6 || next.length > 128) return sendJSON(res, 400, { error: 'weak', message: 'كلمة السر الجديدة من 6 حروف لـ 128' });
        if (weakPw(next, me.username)) return sendJSON(res, 400, { error: 'weak', message: 'كلمة السر دي سهلة التخمين — اختار حاجة أصعب' });
        let hash;
        try { hash = await auth.hashPasswordAsync(next); }
        catch (e) { return sendJSON(res, 503, { error: 'busy', message: 'السيرفر مشغول — جرّب كمان ثانية' }); }
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, me.id);
        setMustChange(me.id, false);
        store.logEvent(me, { operation: 'edit', table: 'users', recordId: me.id, recordLabel: me.name || me.username, before: { password: '•••' }, after: { password: '(اتغيّرت — بنفسه)' } });
        auth.dropUserSessions(me.id, auth.tokenOf(req));
        return sendJSON(res, 200, { ok: true });
      }

      /* reset (admin) */
      if (pathname === '/api/reset' && req.method === 'POST') {
        if (!admin) return adminOnly();
        takeBackup(true, st);
        const keepUsers = store.data().users;
        const blob = defaultBlob(); blob.users = keepUsers;     // never lock everyone out
        if (bid !== 'main') { blob.users = []; blob.settings = {}; }   // 4.32 · a branch: only its own records go; users and company settings stay
        st.full(blob);
        st.logEvent(me, { operation: 'reset', table: 'system', recordLabel: 'مسح كل البيانات (Reset)' + (bid === 'main' ? '' : ' — ' + ((branches.get(bid) || {}).name || bid)) });
        if (bid === 'main') notifyAllBranches({ type: 'reset' });
        notifyDataChanged({ type: 'reset' }, bid);
        return sendJSON(res, 200, { ok: true });
      }

      return sendJSON(res, 404, { error: 'not_found' });
    }

    /* ── static files ── */
    let rel = pathname === '/' ? '/index.html' : pathname;
    rel = rel.replace(/\.\./g, '');
    const filePath = path.join(PUBLIC, rel);
    try {
      const st = await fs.promises.stat(filePath);
      if (st.isFile()) return serveStatic(req, res, filePath);
    } catch (_) { /* missing file → the app page */ }
    return serveStatic(req, res, path.join(PUBLIC, 'index.html'));

  } catch (e) {
    if (e && e.status) { if (!res.headersSent) sendJSON(res, e.status, { error: e.message }); else res.destroy(); return; }
    console.error(`[${req.method} ${pathname}]`, e);
    if (!res.headersSent) sendJSON(res, 500, { error: 'server', message: 'حصلت مشكلة في السيرفر' }); else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log('====================================');
  console.log('  ERP — secure real-time sync');
  console.log('====================================');
  console.log('  Listening : ' + HOST + ':' + PORT);
  console.log('  Database  : ' + DB_FILE);
  console.log('  App path  : ' + (APP_PATH || '(root)'));
  console.log('  Telegram  : ' + (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? 'on' : 'off'));
  console.log('====================================');
});
server.on('error', (e) => { console.error('Server error:', e); process.exit(1); });
server.maxConnections = 3000;
/* 4.20 · slow / half-open requests get dropped instead of piling up */
server.headersTimeout = 15000;      // the request line + headers must arrive within 15 s
server.requestTimeout = 120000;     // a whole request (even a big restore upload) within 2 min
server.keepAliveTimeout = 10000;
server.timeout = 0;                 // live streams (SSE) stay open; they have their own heartbeat

'use strict';
/* ════════════════════════════════════════════════════════════════════
   4.90 · حالات المرضى — لينك منفصل لكل مركز بباسوورد: /k/<code>
   المركز يفتحه من الكمبيوتر بتاعه، يرفع PDF الحالة، ويطلعله باركود.
   المريض يمسح الباركود ← /v/<token>#<key> ويشوف الحالة على موبايله.

   · الملف بيتشفّر في متصفح المركز (AES-GCM) قبل ما يطلع من الجهاز،
     والمفتاح جوّه الباركود بس (بعد #) — السيرفر عمره ما بيشوف المفتاح.
   · الأصل محفوظ على جهاز المركز (IndexedDB). السيرفر بيحتفظ بنسخة
     مشفّرة مؤقتة 7 أيام بس؛ بعدها لو المريض فتح، السيرفر بيطلب الملف
     من جهاز المركز لايف (لو الصفحة مفتوحة) ويوصّله للمريض.
════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, DATA_DIR } = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS case_site (
  customer_id TEXT PRIMARY KEY, center_name TEXT, code TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT, created_by TEXT, last_seen TEXT
);
CREATE TABLE IF NOT EXISTS case_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id TEXT NOT NULL, token TEXT UNIQUE NOT NULL, patient TEXT, phone TEXT, exam TEXT,
  file_name TEXT, size INTEGER, pages INTEGER, created_at TEXT, views INTEGER NOT NULL DEFAULT 0, last_view TEXT,
  active INTEGER NOT NULL DEFAULT 1, cache_until INTEGER, cached INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_case_item ON case_item (customer_id, id);
CREATE TABLE IF NOT EXISTS case_kv (k TEXT PRIMARY KEY, v TEXT)`);
/* 4.91 · الباركود الثابت للورق: كود عام للمركز (/h/<pub>) + مفتاح كل حالة متغلّف بموبايل المريض وأول اسمه */
try {
  const sc = db.prepare('PRAGMA table_info(case_site)').all().map(c => c.name);
  if (!sc.includes('pub')) db.exec('ALTER TABLE case_site ADD COLUMN pub TEXT');
  if (!sc.includes('fixed_on')) db.exec('ALTER TABLE case_site ADD COLUMN fixed_on INTEGER NOT NULL DEFAULT 1');
  const ic = db.prepare('PRAGMA table_info(case_item)').all().map(c => c.name);
  if (!ic.includes('phash')) db.exec('ALTER TABLE case_item ADD COLUMN phash TEXT');
  if (!ic.includes('wrap')) db.exec('ALTER TABLE case_item ADD COLUMN wrap TEXT');
  if (!sc.includes('wa')) db.exec('ALTER TABLE case_site ADD COLUMN wa TEXT');
  db.exec('CREATE TABLE IF NOT EXISTS case_ask (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id TEXT NOT NULL, name TEXT, phone TEXT, phash TEXT, note TEXT, at TEXT, done INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS ix_case_ask ON case_ask (customer_id, done, id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_case_pub ON case_site (pub); CREATE INDEX IF NOT EXISTS ix_case_phash ON case_item (customer_id, phash)');
} catch (e) { console.error('[cases] migrate', e.message); }

const DIR = path.join(DATA_DIR, 'cases');
try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}
const CACHE_DAYS = 7, MAX_MB = 80, CACHE_CAP = Number(process.env.CASES_CACHE_GB || 4) * 1024 * 1024 * 1024;
const SECRET = (() => {
  let r = db.prepare("SELECT v FROM case_kv WHERE k = 'secret'").get();
  if (!r) { const v = crypto.randomBytes(32).toString('hex'); db.prepare("INSERT INTO case_kv (k, v) VALUES ('secret', ?)").run(v); r = { v }; }
  return r.v;
})();
const TZ = process.env.TZ_APP || 'Africa/Cairo';
function nowTs() { try { return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()).replace('T', ' '); } catch (e) { return new Date().toISOString().slice(0, 19).replace('T', ' '); } }
const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function rnd(n, digit) { let t; do { const b = crypto.randomBytes(n); t = Array.from(b, x => AB[x % AB.length]).join(''); } while (digit && !/\d/.test(t)); return t; }
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
function hashPass(p) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(String(p), salt, 32).toString('hex'); }
function passOk(p, h) { try { const [s, k] = String(h).split(':'); const a = crypto.scryptSync(String(p), Buffer.from(s, 'hex'), 32), b = Buffer.from(k, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch (e) { return false; } }
const isHttps = req => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || !!(req.socket && req.socket.encrypted);
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const fileOf = tok => path.join(DIR, tok + '.bin');
/* the patient's mobile → its last 10 digits (01xxxxxxxxx / +201xxxxxxxxx / 1xxxxxxxxx all match) → keyed hash */
function last10(p) { const d = String(p || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/\D/g, ''); return d.length >= 8 ? d.slice(-10) : ''; }
function phashOf(p) { const d = last10(p); return d ? crypto.createHmac('sha256', SECRET).update('ph:' + d).digest('base64url').slice(0, 32) : null; }
function pubOf(site) { if (site.pub) return site.pub; let p; do { p = rnd(8, true); } while (db.prepare('SELECT 1 FROM case_site WHERE pub = ?').get(p)); db.prepare('UPDATE case_site SET pub = ? WHERE customer_id = ?').run(p, site.customer_id); site.pub = p; return p; }
/* 4.92 · the center's WhatsApp for patients who didn't find their result → wa.me format (Egypt: 01x… → 201x…) */
function waOf(p) { let d = String(p || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '2' + d; else if (d.length === 10 && d[0] === '1') d = '20' + d; return d.length >= 10 && d.length <= 15 ? d : ''; }
let LOOKUP = null;   /* server.js: customer id → the center's phone in the ERP (fallback when the center didn't set a WhatsApp number) */
function setLookup(f) { LOOKUP = typeof f === 'function' ? f : null; }
function waFor(cid, wa) { const w = waOf(wa); if (w) return w; try { return LOOKUP ? waOf(LOOKUP(cid)) : ''; } catch (e) { return ''; } }
function asksOf(cid) { return db.prepare('SELECT id, name, phone, note, at FROM case_ask WHERE customer_id = ? AND done = 0 ORDER BY id DESC LIMIT 60').all(cid); }
function maskName(n) { return String(n || '').trim().split(/\s+/).slice(0, 3).map(w => w.charAt(0) + '•••').join(' '); }

/* ── center session cookie: code.exp.ver.sig (logs out everywhere when the password changes) ── */
const SESSION_DAYS = 30;
function sign(s) { return crypto.createHmac('sha256', SECRET).update(s).digest('base64url'); }
function cookieOf(req) { const m = /(?:^|;\s*)ozk=([^;]+)/.exec(req.headers.cookie || ''); return m ? decodeURIComponent(m[1]) : ''; }
function authed(req, site) {
  const p = cookieOf(req).split('.'); if (p.length !== 4) return false;
  if (p[0] !== site.code || Number(p[2]) !== site.ver || Number(p[1]) < Date.now()) return false;
  const want = sign(p.slice(0, 3).join('.')); return want.length === p[3].length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(p[3]));
}
function setCookie(req, site, on) {
  const exp = Date.now() + SESSION_DAYS * 864e5, v = site.code + '.' + exp + '.' + site.ver, val = v + '.' + sign(v);
  return 'ozk=' + (on ? encodeURIComponent(val) : '') + '; Path=/k/' + site.code + '; HttpOnly; SameSite=Lax' + (isHttps(req) ? '; Secure' : '') + '; Max-Age=' + (on ? SESSION_DAYS * 86400 : 0);
}

/* ── who is online: the center's open pages (SSE) ── */
const LIVE = new Map();      // customer_id → Set<res>
const TICKETS = new Map();   // ticket → { res, cid, token, left, timer }
function online(cid) { const s = LIVE.get(cid); return !!(s && s.size); }
function tell(cid, ev, o) { const s = LIVE.get(cid); if (!s) return 0; let n = 0; for (const r of s) { try { r.write('event: ' + ev + '\ndata: ' + JSON.stringify(o) + '\n\n'); n++; } catch (e) {} } return n; }
setInterval(() => { for (const [, s] of LIVE) for (const r of s) { try { r.write(': ping\n\n'); } catch (e) {} } }, 25000).unref();

/* ── temporary copies: cleanup + cap ── */
function cacheBytes() { try { return db.prepare('SELECT COALESCE(SUM(size),0) AS n FROM case_item WHERE cached = 1').get().n; } catch (e) { return 0; } }
function sweep() {
  const now = Date.now();
  for (const r of db.prepare('SELECT id, token FROM case_item WHERE cached = 1 AND cache_until < ?').all(now)) { try { fs.unlinkSync(fileOf(r.token)); } catch (e) {} db.prepare('UPDATE case_item SET cached = 0 WHERE id = ?').run(r.id); }
}
setInterval(sweep, 3600e3).unref(); setTimeout(sweep, 20e3).unref();

const MISS = new Map();
function limited(key, max, ms) { const now = Date.now(), x = MISS.get(key); if (x && now - x.t < ms) { x.n++; return x.n > max; } MISS.set(key, { n: 1, t: now }); return false; }
setInterval(() => { const now = Date.now(); for (const [k, x] of MISS) if (now - x.t > 3600e3) MISS.delete(k); }, 600e3).unref();

function send(res, code, o, h) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, h || {})); res.end(JSON.stringify(o)); }
function readJson(req, max) {
  return new Promise((ok, no) => { const ch = []; let n = 0; req.on('data', c => { n += c.length; if (n > max) { no(Object.assign(new Error('كبير'), { status: 413 })); req.destroy(); } else ch.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}')); } catch (e) { no(Object.assign(new Error('bad'), { status: 400 })); } }); req.on('error', no); });
}
function itemOut(r) { return { id: r.id, token: r.token, patient: r.patient, phone: r.phone, exam: r.exam, name: r.file_name, size: r.size, pages: r.pages, at: r.created_at, views: r.views, last_view: r.last_view, active: !!r.active, cached: !!r.cached && r.cache_until > Date.now(), cache_until: r.cache_until, wrapped: !!r.wrap }; }

function page(title, body, css, js) {
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#0E9F9A">' +
    '<title>' + esc(title) + '</title><link rel="icon" href="/icons/favicon-32.png"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/cases.css?v=494"></head><body class="' + css + '">' + body + js + '</body></html>';
}
function html(res, code, s) { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }); res.end(s); }

/* ════════ public routes ════════ */
async function handle(req, res, pathname) {
  let m = /^\/k\/([A-Za-z0-9]{8})(\/(login|logout|list|live|case|relay|item|fixed|wa|ask)(\/[A-Za-z0-9]{1,20})?(\/(stop|start|delete|wrap|done))?)?\/?$/.exec(pathname);
  if (m) return centerRoute(req, res, m);
  m = /^\/h\/([A-Za-z0-9]{8})(\/(find|ask))?\/?$/.exec(pathname);
  if (m) return findRoute(req, res, m[1], m[3] || '');
  m = /^\/v\/([A-Za-z0-9]{12})(\/file)?\/?$/.exec(pathname);
  if (m) return viewRoute(req, res, m[1], !!m[2]);
  return false;
}

async function centerRoute(req, res, m) {
  const code = m[1], sub = m[3] || '', arg = m[4] ? m[4].slice(1) : '', act = m[6] || '', ip = ipOf(req);
  if (limited('k:' + ip, 400, 60e3)) { send(res, 429, { message: 'طلبات كتير — استنى دقيقة' }); return true; }
  const site = db.prepare('SELECT * FROM case_site WHERE code = ? AND active = 1').get(code);
  if (!site) { if (limited('kx:' + ip, 30, 600e3)) { send(res, 429, { message: 'حاولت كتير' }); return true; } html(res, 404, page('اللينك مش شغال', '<div class="gate"><div class="box"><i>🔒</i><h1>اللينك ده مش شغال</h1><p>اتأكدوا من اللينك أو كلموا الشركة.</p></div></div>', 'k', '')); return true; }
  const me = authed(req, site);
  if (!sub) {
    if (req.method !== 'GET') return false;
    const CD = { code, center: site.center_name || '', auth: me, cacheDays: CACHE_DAYS, maxMb: MAX_MB, pub: me ? pubOf(site) : '', fixedOn: !!site.fixed_on, wa: me ? (site.wa || '') : '', waDefault: me && !site.wa ? waFor(cid0(site), '') : '' };
    if (me) db.prepare('UPDATE case_site SET last_seen = ? WHERE customer_id = ?').run(nowTs(), site.customer_id);
    html(res, 200, page('حالات المرضى — ' + (site.center_name || ''), '<div id="app"></div>', 'k', '<script>window.CD=' + json(CD) + '</script><script src="/vendor/qrcode.js"></script><script src="/cases-kit.js?v=494"></script><script src="/cases-dicom.js?v=494"></script><script src="/cases-center.js?v=494"></script>'));
    return true;
  }
  if (sub === 'login' && req.method === 'POST') {
    if (limited('kl:' + code + ':' + ip, 10, 900e3)) { send(res, 429, { message: 'حاولت كتير — جرّب بعد ربع ساعة' }); return true; }
    let b = {}; try { b = await readJson(req, 2000); } catch (e) { send(res, 400, { message: 'محصلش' }); return true; }
    if (!passOk(String(b.pass || ''), site.pass)) { send(res, 401, { message: 'الباسوورد غلط' }); return true; }
    send(res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, site, true) }); return true;
  }
  if (sub === 'logout' && req.method === 'POST') { send(res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, site, false) }); return true; }
  if (!me) { send(res, 401, { message: 'سجّل دخول الأول', login: true }); return true; }
  const cid = site.customer_id;

  if (sub === 'list' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM case_item WHERE customer_id = ? ORDER BY id DESC LIMIT 500').all(cid).map(itemOut);
    send(res, 200, { list: rows, online: (LIVE.get(cid) || new Set()).size, asks: asksOf(cid) }); return true;
  }
  if (sub === 'live' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 4000\nevent: hello\ndata: {}\n\n');
    if (!LIVE.has(cid)) LIVE.set(cid, new Set()); LIVE.get(cid).add(res);
    db.prepare('UPDATE case_site SET last_seen = ? WHERE customer_id = ?').run(nowTs(), cid);
    req.on('close', () => { const s = LIVE.get(cid); if (s) { s.delete(res); if (!s.size) LIVE.delete(cid); } });
    return true;
  }
  if (sub === 'case' && req.method === 'POST' && !arg) {      /* upload: body = the encrypted file; meta in X-Meta (base64url JSON) */
    let meta = {}; try { meta = JSON.parse(Buffer.from(String(req.headers['x-meta'] || ''), 'base64url').toString('utf8')) || {}; } catch (e) {}
    const patient = clean(meta.patient, 80); if (!patient) { req.resume(); send(res, 400, { message: 'اكتب اسم المريض' }); return true; }
    const len = Number(req.headers['content-length'] || 0); if (!(len > 28) || len > MAX_MB * 1048576) { req.resume(); send(res, 413, { message: 'الملف لازم يكون أقل من ' + MAX_MB + ' ميجا' }); return true; }
    let token; do { token = rnd(12); } while (db.prepare('SELECT 1 FROM case_item WHERE token = ?').get(token));
    const keep = cacheBytes() + len < CACHE_CAP, tmp = fileOf(token) + '.part';
    const done = n => {
      const wrap = meta.wrap && typeof meta.wrap === 'object' ? JSON.stringify({ s: clean(meta.wrap.s, 40), i: clean(meta.wrap.i, 40), k: clean(meta.wrap.k, 120) }) : null;
      const r = db.prepare('INSERT INTO case_item (customer_id, token, patient, phone, exam, file_name, size, pages, created_at, cache_until, cached, phash, wrap) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(cid, token, patient, clean(meta.phone, 20), clean(meta.exam, 80), clean(meta.name, 120), n, Math.max(0, Math.min(5000, Number(meta.pages) || 0)) || null, nowTs(), Date.now() + CACHE_DAYS * 864e5, keep ? 1 : 0, phashOf(meta.phone), wrap);
      send(res, 200, { ok: true, item: itemOut(db.prepare('SELECT * FROM case_item WHERE id = ?').get(Number(r.lastInsertRowid))) });
    };
    if (!keep) { let n = 0; req.on('data', c => { n += c.length; }); req.on('end', () => done(n)); return true; }
    const out = fs.createWriteStream(tmp); let n = 0, bad = false;
    req.on('data', c => { n += c.length; if (n > MAX_MB * 1048576) { bad = true; req.destroy(); } });
    req.pipe(out);
    out.on('finish', () => { if (bad) { try { fs.unlinkSync(tmp); } catch (e) {} return send(res, 413, { message: 'الملف كبير' }); } fs.rename(tmp, fileOf(token), er => { if (er) return send(res, 500, { message: 'محصلش' }); done(n); }); });
    req.on('error', () => { try { fs.unlinkSync(tmp); } catch (e) {} });
    return true;
  }
  if (sub === 'item' && arg && act && req.method === 'POST') {
    const it = db.prepare('SELECT * FROM case_item WHERE token = ? AND customer_id = ?').get(arg, cid); if (!it) { send(res, 404, { message: 'مش موجودة' }); return true; }
    if (act === 'wrap') {   /* a case saved before 4.91 gets its wrapped key later, from the computer that holds it */
      let b = {}; try { b = await readJson(req, 2000); } catch (e) { send(res, 400, { message: 'محصلش' }); return true; }
      if (!b.s || !b.i || !b.k) { send(res, 400, { message: 'ناقص' }); return true; }
      db.prepare('UPDATE case_item SET wrap = ?, phash = COALESCE(phash, ?) WHERE id = ?').run(JSON.stringify({ s: clean(b.s, 40), i: clean(b.i, 40), k: clean(b.k, 120) }), phashOf(it.phone), it.id);
      send(res, 200, { ok: true }); return true;
    }
    if (act === 'delete') { try { fs.unlinkSync(fileOf(it.token)); } catch (e) {} db.prepare('DELETE FROM case_item WHERE id = ?').run(it.id); }
    else db.prepare('UPDATE case_item SET active = ? WHERE id = ?').run(act === 'start' ? 1 : 0, it.id);
    send(res, 200, { ok: true }); return true;
  }
  if (sub === 'wa' && req.method === 'POST') {
    let b = {}; try { b = await readJson(req, 500); } catch (e) {}
    const w = waOf(b.wa); if (b.wa && !w) { send(res, 400, { message: 'رقم الواتساب مش مظبوط' }); return true; }
    db.prepare('UPDATE case_site SET wa = ? WHERE customer_id = ?').run(w ? clean(b.wa, 20) : null, cid);
    send(res, 200, { ok: true, wa: w ? clean(b.wa, 20) : '' }); return true;
  }
  if (sub === 'ask' && req.method === 'POST') {    /* ask/<id>/done, or ask with {phone} → close every open ask of that mobile (a case was just saved for it) */
    if (arg && act === 'done') db.prepare('UPDATE case_ask SET done = 1 WHERE id = ? AND customer_id = ?').run(Number(arg), cid);
    else { let b = {}; try { b = await readJson(req, 500); } catch (e) {} const ph = phashOf(b.phone); if (ph) db.prepare('UPDATE case_ask SET done = 1 WHERE customer_id = ? AND phash = ? AND done = 0').run(cid, ph); }
    send(res, 200, { ok: true, asks: asksOf(cid) }); return true;
  }
  if (sub === 'fixed' && req.method === 'POST') {
    let b = {}; try { b = await readJson(req, 500); } catch (e) {}
    db.prepare('UPDATE case_site SET fixed_on = ? WHERE customer_id = ?').run(b.on ? 1 : 0, cid);
    send(res, 200, { ok: true, on: !!b.on }); return true;
  }
  if (sub === 'relay' && arg && req.method === 'POST') {     /* the center's page answering a patient who is waiting right now */
    const t = TICKETS.get(arg);
    if (!t || t.cid !== cid) { req.resume(); send(res, 410, { message: 'خلاص' }); return true; }
    if (new URL(req.url, 'http://x').searchParams.get('miss')) {
      req.resume(); t.left--; if (t.left <= 0) { TICKETS.delete(arg); clearTimeout(t.timer); send(t.res, 404, { missing: true, message: 'الملف مش موجود على جهاز المركز' }); }
      send(res, 200, { ok: true }); return true;
    }
    TICKETS.delete(arg); clearTimeout(t.timer);
    const len = Number(req.headers['content-length'] || 0);
    t.res.writeHead(200, Object.assign({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Source': 'center' }, len ? { 'Content-Length': String(len) } : {}));
    req.pipe(t.res);
    req.on('end', () => { countView(t.token, cid); send(res, 200, { ok: true }); });
    req.on('error', () => { try { t.res.destroy(); } catch (e) {} });
    t.res.on('close', () => { if (!req.complete) { try { req.destroy(); } catch (e) {} } });
    return true;
  }
  return false;
}

function countView(token, cid) {
  try {
    db.prepare('UPDATE case_item SET views = views + 1, last_view = ? WHERE token = ?').run(nowTs(), token);
    const r = db.prepare('SELECT views, last_view FROM case_item WHERE token = ?').get(token);
    if (r) tell(cid, 'view', { token, views: r.views, last_view: r.last_view });
  } catch (e) {}
}

async function viewRoute(req, res, token, file) {
  if (req.method !== 'GET') return false;
  const ip = ipOf(req);
  if (limited('v:' + ip, 60, 60e3)) { send(res, 429, { message: 'استنى دقيقة وجرّب تاني' }); return true; }
  const it = db.prepare('SELECT i.*, s.center_name, s.active AS site_on, s.wa AS site_wa, s.pub AS site_pub FROM case_item i LEFT JOIN case_site s ON s.customer_id = i.customer_id WHERE i.token = ?').get(token);
  if (!file) {
    if (!it) { if (limited('vx:' + ip, 40, 600e3)) { send(res, 429, { message: 'حاولت كتير' }); return true; } }
    const CD = it ? { token, center: it.center_name || '', patient: it.patient, exam: it.exam || '', at: it.created_at, pages: it.pages || 0, size: it.size, name: it.file_name || '', active: !!(it.active && it.site_on), ready: !!(it.cached && it.cache_until > Date.now()) || online(it.customer_id), wa: waFor(it.customer_id, it.site_wa), pub: it.site_pub || '' } : { missing: true };
    html(res, it ? 200 : 404, page(it ? 'نتيجة الفحص — ' + (it.center_name || '') : 'الحالة مش موجودة', '<div id="app"></div>', 'v', '<script>window.CD=' + json(CD) + '</script><script src="/vendor/pdfjs/pdf.min.js"></script><script src="/cases-view.js?v=494"></script>'));
    return true;
  }
  if (!it) { send(res, 404, { message: 'الحالة مش موجودة' }); return true; }
  if (!it.active || !it.site_on) { send(res, 410, { stopped: true, message: 'الحالة دي اتوقفت من المركز' }); return true; }
  /* 1) the temporary copy on the server (first 7 days) */
  if (it.cached && it.cache_until > Date.now()) {
    const f = fileOf(it.token);
    try {
      const st = fs.statSync(f);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(st.size), 'Cache-Control': 'no-store', 'X-Source': 'cache' });
      const rs = fs.createReadStream(f); rs.pipe(res); rs.on('end', () => countView(it.token, it.customer_id)); rs.on('error', () => { try { res.destroy(); } catch (e) {} });
      return true;
    } catch (e) { db.prepare('UPDATE case_item SET cached = 0 WHERE id = ?').run(it.id); }
  }
  /* 2) live from the center's own computer */
  const n = (LIVE.get(it.customer_id) || new Set()).size;
  if (!n) { send(res, 503, { offline: true, message: 'جهاز المركز مقفول دلوقتي — جرّب تاني بعد شوية' }); return true; }
  const ticket = rnd(16);
  const t = { res, cid: it.customer_id, token: it.token, left: n, timer: setTimeout(() => { if (TICKETS.delete(ticket)) send(res, 504, { offline: true, message: 'جهاز المركز مردّش — جرّب تاني' }); }, 30000) };
  TICKETS.set(ticket, t);
  res.on('close', () => { if (TICKETS.get(ticket) === t) { TICKETS.delete(ticket); clearTimeout(t.timer); } });
  tell(it.customer_id, 'need', { token: it.token, ticket });
  return true;
}

/* ════════ 4.91 · the fixed barcode printed on every report: /h/<pub> → the patient types his mobile + first name ════════ */
async function findRoute(req, res, pub, sub) {
  const find = sub === 'find';
  const ip = ipOf(req);
  const site = db.prepare('SELECT * FROM case_site WHERE pub = ? AND active = 1').get(pub);
  if (sub === 'ask') {   /* 4.92 · «ملقتش نتيجتي» → the center sees it live in its cases page (and the patient's WhatsApp opens) */
    if (req.method !== 'POST') return false;
    if (!site) { send(res, 404, { message: 'مش موجود' }); return true; }
    if (limited('ha:' + ip, 6, 3600e3)) { send(res, 429, { message: 'طلبك وصل — المركز هيرد عليك' }); return true; }
    let b = {}; try { b = await readJson(req, 1500); } catch (e) { send(res, 400, { message: 'محصلش' }); return true; }
    const name = clean(b.name, 60), phone = clean(b.phone, 20), ph = phashOf(phone); if (!name || !ph) { send(res, 400, { message: 'اكتب اسمك وموبايلك' }); return true; }
    const dup = db.prepare('SELECT id FROM case_ask WHERE customer_id = ? AND phash = ? AND done = 0').get(site.customer_id, ph);
    if (dup) db.prepare('UPDATE case_ask SET name = ?, note = ?, at = ? WHERE id = ?').run(name, clean(b.note, 120), nowTs(), dup.id);
    else db.prepare('INSERT INTO case_ask (customer_id, name, phone, phash, note, at) VALUES (?,?,?,?,?,?)').run(site.customer_id, name, phone, ph, clean(b.note, 120), nowTs());
    tell(site.customer_id, 'ask', { asks: asksOf(site.customer_id), name, phone });
    send(res, 200, { ok: true }); return true;
  }
  if (!find) {
    if (req.method !== 'GET') return false;
    if (!site) { if (limited('hx:' + ip, 30, 600e3)) { send(res, 429, { message: 'حاولت كتير' }); return true; } }
    const CD = site ? { pub, center: site.center_name || '', on: !!site.fixed_on, wa: waFor(site.customer_id, site.wa) } : { missing: true };
    html(res, site ? 200 : 404, page(site ? 'نتيجتك — ' + (site.center_name || '') : 'اللينك مش شغال', '<div id="app"></div>', 'v', '<script>window.CD=' + json(CD) + '</script><script src="/cases-kit.js?v=494"></script><script src="/cases-find.js?v=494"></script>'));
    return true;
  }
  if (req.method !== 'POST') return false;
  if (!site || !site.fixed_on) { send(res, 404, { message: 'البحث مقفول في المركز ده' }); return true; }
  if (limited('hf:' + ip, 12, 600e3)) { send(res, 429, { message: 'حاولت كتير — جرّب بعد 10 دقايق' }); return true; }
  let b = {}; try { b = await readJson(req, 1000); } catch (e) { send(res, 400, { message: 'محصلش' }); return true; }
  const ph = phashOf(b.phone); if (!ph) { send(res, 400, { message: 'اكتب رقم الموبايل صح' }); return true; }
  if (limited('hp:' + pub + ':' + ph, 25, 864e5)) { send(res, 429, { message: 'الرقم ده اتدوّر عليه كتير النهارده — كلّم المركز' }); return true; }
  const rows = db.prepare('SELECT token, patient, exam, created_at, pages, wrap FROM case_item WHERE customer_id = ? AND phash = ? AND active = 1 AND wrap IS NOT NULL ORDER BY id DESC LIMIT 30').all(site.customer_id, ph);
  send(res, 200, { list: rows.map(r => { let w = null; try { w = JSON.parse(r.wrap); } catch (e) {} return { token: r.token, hint: maskName(r.patient), exam: r.exam || '', at: r.created_at, pages: r.pages || 0, w }; }).filter(x => x.w) });
  return true;
}

/* ════════ the admin side: /api/portal/cases* (server.js checks admin) ════════ */
async function adminApi(req, res, pathname, me) {
  const q = new URL(req.url, 'http://x').searchParams;
  const siteOut = s => s ? { code: s.code, pub: pubOf(s), fixed: !!s.fixed_on, wa: s.wa || '', asks: db.prepare('SELECT COUNT(*) AS n FROM case_ask WHERE customer_id = ? AND done = 0').get(s.customer_id).n, active: !!s.active, created_at: s.created_at, last_seen: s.last_seen, online: online(s.customer_id), cases: db.prepare('SELECT COUNT(*) AS n FROM case_item WHERE customer_id = ?').get(s.customer_id).n, views: db.prepare('SELECT COALESCE(SUM(views),0) AS n FROM case_item WHERE customer_id = ?').get(s.customer_id).n } : null;
  if (req.method === 'GET' && pathname === '/api/portal/cases') {
    const cid = String(q.get('cid') || '');
    if (cid) return send(res, 200, { site: siteOut(db.prepare('SELECT * FROM case_site WHERE customer_id = ?').get(cid)) });
    const all = {}; db.prepare('SELECT * FROM case_site').all().forEach(s => { all[s.customer_id] = { code: s.code, active: !!s.active, online: online(s.customer_id) }; });
    return send(res, 200, { sites: all });
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'not_found' });
  let b = {}; try { b = await readJson(req, 4000); } catch (e) { return send(res, 400, { message: 'محصلش' }); }
  const cid = String(b.cid || '').slice(0, 80); if (!cid) return send(res, 400, { message: 'المركز مش محدد' });
  const who = (me && (me.name || me.username)) || 'admin', cur = db.prepare('SELECT * FROM case_site WHERE customer_id = ?').get(cid);
  const newPass = () => { const p = String(b.pass || '').trim(); if (p && p.length < 4) throw Object.assign(new Error('الباسوورد لازم 4 حروف/أرقام على الأقل'), { status: 400 }); return p || String(crypto.randomInt(100000, 1000000)); };
  try {
    if (pathname === '/api/portal/cases/make') {
      const pass = newPass();
      if (cur) db.prepare('UPDATE case_site SET pass = ?, ver = ver + 1, active = 1, center_name = ? WHERE customer_id = ?').run(hashPass(pass), clean(b.name, 120) || cur.center_name, cid);
      else { let code; do { code = rnd(8, true); } while (db.prepare('SELECT 1 FROM case_site WHERE code = ?').get(code)); db.prepare('INSERT INTO case_site (customer_id, center_name, code, pass, created_at, created_by, wa) VALUES (?,?,?,?,?,?,?)').run(cid, clean(b.name, 120), code, hashPass(pass), nowTs(), who, waOf(b.wa) ? clean(b.wa, 20) : null); }
      return send(res, 200, { ok: true, pass, site: siteOut(db.prepare('SELECT * FROM case_site WHERE customer_id = ?').get(cid)) });
    }
    if (!cur) return send(res, 404, { message: 'مفيش لينك حالات للمركز ده' });
    if (pathname === '/api/portal/cases/wa') { const w = waOf(b.wa); if (b.wa && !w) return send(res, 400, { message: 'رقم الواتساب مش مظبوط' }); if (!b.ifEmpty || !cur.wa) db.prepare('UPDATE case_site SET wa = ? WHERE customer_id = ?').run(w ? clean(b.wa, 20) : null, cid); return send(res, 200, { ok: true, site: siteOut(db.prepare('SELECT * FROM case_site WHERE customer_id = ?').get(cid)) }); }
    if (pathname === '/api/portal/cases/pass') { const pass = newPass(); db.prepare('UPDATE case_site SET pass = ?, ver = ver + 1 WHERE customer_id = ?').run(hashPass(pass), cid); for (const r of (LIVE.get(cid) || [])) { try { r.end(); } catch (e) {} } return send(res, 200, { ok: true, pass }); }
    if (pathname === '/api/portal/cases/stop') { db.prepare('UPDATE case_site SET active = ? WHERE customer_id = ?').run(b.on ? 1 : 0, cid); if (!b.on) for (const r of (LIVE.get(cid) || [])) { try { r.end(); } catch (e) {} } return send(res, 200, { ok: true, site: siteOut(db.prepare('SELECT * FROM case_site WHERE customer_id = ?').get(cid)) }); }
    if (pathname === '/api/portal/cases/rotate') { let code; do { code = rnd(8, true); } while (db.prepare('SELECT 1 FROM case_site WHERE code = ?').get(code)); db.prepare('UPDATE case_site SET code = ?, ver = ver + 1 WHERE customer_id = ?').run(code, cid); for (const r of (LIVE.get(cid) || [])) { try { r.end(); } catch (e) {} } return send(res, 200, { ok: true, site: siteOut(db.prepare('SELECT * FROM case_site WHERE customer_id = ?').get(cid)) }); }
  } catch (er) { return send(res, er.status || 400, { message: er.message || 'محصلش' }); }
  return send(res, 404, { error: 'not_found' });
}

function cid0(site) { return site.customer_id; }
module.exports = { handle, adminApi, setLookup };

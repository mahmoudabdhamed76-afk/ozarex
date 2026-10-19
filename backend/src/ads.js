'use strict';
/* ════════════════════════════════════════════════════════════════════
   Smart Ads Manager — server module (OzareX 4.41)
   ------------------------------------------------------------------
   Independent of the app's data model: its own two tables, its own
   routes under /api/ads, and no knowledge of the app's look. Any app on
   the same stack can mount it with:

     const ads = require('./src/ads').create({ db, readBody, sendJSON, broadcast });
     if (pathname.startsWith('/api/ads')) return ads.handle(req, res, pathname, me);

   · admins: create / edit / duplicate / archive / delete / stats
   · everyone signed in: the ads meant for them now + record view/click/close
   · every field is validated and stored as plain data (never HTML);
     the browser renders it with textContent, so no XSS through an ad.
════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');

const FORMATS = ['popup', 'banner', 'card'];
const STATUSES = ['draft', 'active', 'paused', 'archived'];
const FREQ = ['once', 'every', 'daily', 'days'];
const POSITIONS = ['top', 'bottom', 'center', 'bottom-start', 'bottom-end'];
const EVENTS = ['view', 'click', 'cta2', 'close'];
const KINDS = ['promo', 'guide'];
const ANIMS = ['bounce', 'zoom', 'slide', 'flip', 'drop', 'fade'];
function hhmm(v) { v = String(v || '').trim(); return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ''; }
/* the day in Cairo (DST aware), for start / end dates */
function cairoDay(ms) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms || Date.now())); } catch (e) { return new Date((ms || Date.now()) + 3 * 3600e3).toISOString().slice(0, 10); } }

// eslint-disable-next-line no-control-regex -- strips control characters on purpose
function str(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max); }
function int(v, lo, hi, def) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }
function color(v, def) { v = String(v || '').trim(); return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : def; }
function day(v) { v = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')) ? v : ''; }
function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
/* WhatsApp: digits only; Egyptian local 01xxxxxxxxx → 201xxxxxxxxx; 8–15 digits or empty */
function waNumber(v) {
  let d = String(v || '').replace(/[^\d]/g, '');
  if (/^0\d{10}$/.test(d)) d = '2' + d;               // 01012345678 → 201012345678
  if (d.startsWith('00')) d = d.slice(2);
  return d.length >= 8 && d.length <= 15 ? d : '';
}
/* links: only http(s), no credentials; anything else is dropped */
function link(v) {
  v = String(v || '').trim(); if (!v) return '';
  try { const u = new URL(v); if ((u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password) return u.href.slice(0, 500); } catch (e) {}
  return '';
}
function icon(v) { v = str(v, 16); return Array.from(v).slice(0, 4).join(''); }   // an emoji or two
function ids(list, max) { return (Array.isArray(list) ? list : []).map(x => str(x, 80)).filter(x => x && /^[\w.@:-]+$/.test(x)).slice(0, max); }

/* the one place an ad's shape is defined */
function clean(b, prev) {
  b = b && typeof b === 'object' ? b : {};
  prev = prev || {};
  const g = (k, d) => (b[k] !== undefined ? b[k] : (prev[k] !== undefined ? prev[k] : d));
  const theme = Object.assign({}, prev.theme || {}, b.theme && typeof b.theme === 'object' ? b.theme : {});
  const cta = Object.assign({}, prev.cta || {}, b.cta && typeof b.cta === 'object' ? b.cta : {});
  const cta2 = Object.assign({}, prev.cta2 || {}, b.cta2 && typeof b.cta2 === 'object' ? b.cta2 : {});
  const aud = Object.assign({}, prev.audience || {}, b.audience && typeof b.audience === 'object' ? b.audience : {});
  const ad = {
    name: str(g('name', ''), 80),
    title: str(g('title', ''), 140),
    text: str(g('text', ''), 400),
    desc: str(g('desc', ''), 1200),
    icon: icon(g('icon', '📢')),
    format: pick(g('format', 'popup'), FORMATS, 'popup'),
    position: pick(g('position', 'center'), POSITIONS, 'center'),
    pages: (function () { const p = g('pages', 'all'); if (p === 'all' || p === 'login') return p; return ids(p, 30).length ? ids(p, 30) : 'all'; })(),
    theme: { bg: color(theme.bg, '#16090C'), accent: color(theme.accent, '#25D366'), text: color(theme.text, '#FFFFFF'), glass: theme.glass === false ? false : true },
    startAt: day(g('startAt', '')), endAt: day(g('endAt', '')),
    frequency: pick(g('frequency', 'once'), FREQ, 'once'),
    everyDays: int(g('everyDays', 3), 1, 365, 3),
    maxShows: int(g('maxShows', 0), 0, 1000, 0),
    delaySec: int(g('delaySec', 2), 0, 120, 2),
    priority: int(g('priority', 5), 1, 99, 5),
    audience: { mode: pick(aud.mode, ['all', 'users', 'roles'], 'all'), users: ids(aud.users, 500), roles: ids(aud.roles, 10) },
    cta: { label: str(cta.label, 40), wa: waNumber(cta.wa), msg: str(cta.msg, 500) },
    cta2: { label: str(cta2.label, 40), url: link(cta2.url) },
    /* 4.30 */
    kind: pick(g('kind', 'promo'), KINDS, 'promo'),
    anim: pick(g('anim', 'bounce'), ANIMS, 'bounce'),
    durationSec: int(g('durationSec', 0), 0, 600, 0),
    timeFrom: hhmm(g('timeFrom', '')), timeTo: hhmm(g('timeTo', '')),
    weekdays: (Array.isArray(g('weekdays', [])) ? g('weekdays', []) : []).map(Number).filter((d, i, a) => d >= 0 && d <= 6 && Number.isInteger(d) && a.indexOf(d) === i).slice(0, 7),
    perDay: int(g('perDay', 1), 1, 24, 1),
    gapMin: int(g('gapMin', 60), 0, 1440, 60),
    badge: (function () { const b0 = Object.assign({}, prev.badge || {}, b.badge && typeof b.badge === 'object' ? b.badge : {}); return { value: str(b0.value, 6), label: str(b0.label, 24) }; })(),
    guide: (function () { const g0 = Object.assign({}, prev.guide || {}, b.guide && typeof b.guide === 'object' ? b.guide : {});
      return { version: str(g0.version, 20), items: (Array.isArray(g0.items) ? g0.items : String(g0.items || '').split('\n')).map(x => str(x, 140)).filter(Boolean).slice(0, 8),
        okLabel: str(g0.okLabel, 30), actionLabel: str(g0.actionLabel, 30), actionPage: /^[\w-]{1,40}$/.test(String(g0.actionPage || '')) ? String(g0.actionPage) : '' }; })()
  };
  if (ad.endAt && ad.startAt && ad.endAt < ad.startAt) ad.endAt = ad.startAt;
  return ad;
}

function create(opts) {
  const { db, readBody, sendJSON } = opts;
  const broadcast = opts.broadcast || function () {};
  db.exec(`CREATE TABLE IF NOT EXISTS ads (
    id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'draft', priority INTEGER NOT NULL DEFAULT 5,
    data TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS ad_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, at INTEGER NOT NULL)`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ad_events_ad ON ad_events(ad_id, type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ad_events_user ON ad_events(user_id, ad_id, type, at)');
  db.exec('CREATE TABLE IF NOT EXISTS ads_meta (key TEXT PRIMARY KEY, value TEXT)');
  /* 4.42 · one row per showing: the page gives every showing its own id (imp) and the database refuses a
     second view / click / close for the same showing, so a double tap, a retry or a replay never counts twice */
  try { db.exec('ALTER TABLE ad_events ADD COLUMN imp TEXT'); } catch (e) { /* already there */ }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_ad_events_imp ON ad_events(ad_id, user_id, type, imp) WHERE imp IS NOT NULL');
  const VIEW_GAP = Math.max(0, Number(opts.viewGapMs != null ? opts.viewGapMs : (process.env.ADS_VIEW_GAP_MS || 30000)));   // two views of one ad by one person this close = one view
  const ACT_WINDOW = 24 * 3600e3;                                                                // a click / close needs a real view before it
  /* names for the report: the app's own users table when it has one */
  const hasUsers = (() => { try { db.prepare('SELECT id, username, name, role FROM users LIMIT 1').all(); return true; } catch (e) { return false; } })();
  const userMap = () => { const m = {}; if (hasUsers) for (const u of db.prepare('SELECT id, username, name, role FROM users').all()) m[u.id] = u; return m; };

  const now = () => new Date().toISOString();
  const row2ad = (r) => { let d = {}; try { d = JSON.parse(r.data); } catch (e) {} return Object.assign(clean(d), { id: r.id, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at }); };
  const getRow = (id) => db.prepare('SELECT * FROM ads WHERE id = ?').get(String(id));
  const meta = (k, v) => { if (v === undefined) { const r = db.prepare('SELECT value FROM ads_meta WHERE key = ?').get(k); return r ? r.value : null; } db.prepare('INSERT INTO ads_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v)); };
  function insert(ad, status, by) {
    const id = 'ad_' + crypto.randomBytes(6).toString('hex'), t = now();
    db.prepare('INSERT INTO ads (id, status, priority, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, pick(status, STATUSES, 'draft'), ad.priority, JSON.stringify(ad), by || null, t, t);
    return id;
  }

  /* the sample ad — added once, as a draft only the admin sees in preview */
  if (!meta('seeded')) {
    insert(clean({
      name: 'إعلان تجريبي — خدماتنا',
      title: 'اكتشف خدمات OZAREX 🚀',
      text: 'حلول متكاملة للتوريدات، وخدمة متميزة للمراكز والمستشفيات والشركات.',
      desc: '',
      icon: '🚀', format: 'popup', position: 'center', frequency: 'daily', priority: 5,
      theme: { bg: '#16090C', accent: '#25D366', text: '#FFFFFF', glass: true },
      cta: { label: 'تواصل معنا عبر واتساب', wa: '', msg: 'السلام عليكم، عايز أعرف أكتر عن خدماتكم' },
      cta2: { label: 'تعرف على خدماتنا', url: '' }
    }), 'draft', 'system');
    meta('seeded', '1');
  }
  if (!meta('seeded_guide')) {
    insert(clean({
      name: 'إعلان إرشادي — تحديث جديد', kind: 'guide', anim: 'drop',
      title: 'تحديث جديد في OZAREX 🎉', text: 'ضفنا *مميزات جديدة* تسهّل شغلك — دي أهمها:', icon: '🆕',
      format: 'popup', position: 'center', frequency: 'once', priority: 2,
      theme: { bg: '#16090C', accent: '#F43F5E', text: '#FFFFFF', glass: true },
      guide: { version: '4.41', items: ['«أرباحي» في الشريط تحت: ربحك الحقيقي شهر بشهر بالرسم ونصايح', '«الفلوس» جوه أرباحي: كل جنيه دخل راح فين، وتسحب لنفسك كام', 'الملخص اليومي يوصلك على *تليجرام* والإشعارات', 'مرتجع مبيعات ومشتريات بزرار من الفاتورة'], okLabel: 'تمام، فهمت', actionLabel: 'افتح أرباحي', actionPage: 'profit' },
      cta: { label: '', wa: '', msg: '' }, cta2: { label: '', url: '' }
    }), 'draft', 'system');
    meta('seeded_guide', '1');
  }

  function statsAll() {
    const out = {};
    for (const r of db.prepare('SELECT ad_id, type, COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM ad_events GROUP BY ad_id, type').all()) {
      const s = out[r.ad_id] || (out[r.ad_id] = { view: 0, click: 0, cta2: 0, close: 0, reach: 0 });
      s[r.type] = r.n; if (r.type === 'view') s.reach = r.u;
    }
    for (const k in out) { const s = out[k]; s.ctr = s.view ? Math.round(s.click / s.view * 1000) / 10 : 0; }
    return out;
  }
  const blank = { view: 0, click: 0, cta2: 0, close: 0, reach: 0, ctr: 0 };

  function eligible(ad, me, today) {
    if (ad.startAt && today < ad.startAt) return false;
    if (ad.endAt && today > ad.endAt) return false;
    const a = ad.audience || {};
    if (a.mode === 'users' && a.users.indexOf(me.id) < 0) return false;
    if (a.mode === 'roles' && a.roles.indexOf(me.role) < 0) return false;
    return true;
  }
  function changed(id) { try { broadcast('ads_changed', { id: id || null }); } catch (e) {} }

  /* small per-user flood guard on events */
  const recent = new Map();
  function flood(key) {
    const t = Date.now(), last = recent.get(key) || 0;
    if (t - last < 1500) return true;
    recent.set(key, t);
    if (recent.size > 20000) { for (const [k, v] of recent) if (t - v > 60000) recent.delete(k); }
    return false;
  }

  /* 4.42 · the only way an event is written. Returns true, or why it was not counted:
     · the ad must be live and meant for this person right now (not a draft / paused / expired / someone else's)
     · a view: not again within VIEW_GAP of the last one (two tabs, a page re-draw, a refresh) and never past «max shows»
     · a click / close: only after a real view of that ad by the same person in the last 24 h
     · the same showing (imp) is counted once per type — the database's unique index enforces it */
  function countEvent(row, me, type, imp, today) {
    const ad = row2ad(row);
    if (row.status !== 'active') return 'not_active';
    if (!eligible(ad, me, today)) return 'not_for_you';
    const t = Date.now();
    const lastView = db.prepare("SELECT MAX(at) AS m, COUNT(*) AS n FROM ad_events WHERE ad_id = ? AND user_id = ? AND type = 'view'").get(row.id, me.id);
    if (type === 'view') {
      if (lastView.m && t - lastView.m < VIEW_GAP) return 'duplicate';
      if (ad.maxShows && lastView.n >= ad.maxShows) return 'max_shows';
    } else {
      if (!lastView.m || t - lastView.m > ACT_WINDOW) return 'no_view';
      if (imp && !db.prepare("SELECT 1 FROM ad_events WHERE ad_id = ? AND user_id = ? AND type = 'view' AND imp = ?").get(row.id, me.id, imp)) return 'no_view';
    }
    if (flood(me.id + '|' + row.id + '|' + type)) return 'duplicate';
    const r = db.prepare('INSERT OR IGNORE INTO ad_events (ad_id, user_id, type, at, imp) VALUES (?, ?, ?, ?, ?)').run(row.id, me.id, type, t, imp);
    return r.changes ? true : 'duplicate';
  }

  /* 4.42 · who saw an ad: one line per person + totals + the people it is meant for who have not seen it yet */
  function viewers(row) {
    const ad = row2ad(row), users = userMap();
    const people = db.prepare(`SELECT user_id,
        SUM(type = 'view') AS views, SUM(type = 'click') AS clicks, SUM(type = 'cta2') AS cta2, SUM(type = 'close') AS closes,
        MIN(CASE WHEN type = 'view' THEN at END) AS first, MAX(CASE WHEN type = 'view' THEN at END) AS last
      FROM ad_events WHERE ad_id = ? GROUP BY user_id`).all(row.id)
      .filter(r => r.views > 0)
      .map(r => { const u = users[r.user_id]; return { userId: r.user_id, name: u ? u.name : '', username: u ? u.username : '', role: u ? u.role : '', gone: hasUsers && !u,
        views: r.views, clicks: r.clicks, cta2: r.cta2, closes: r.closes, first: r.first, last: r.last }; })
      .sort((a, b) => b.views - a.views || b.last - a.last);
    const totals = { views: 0, unique: people.length, clicks: 0, cta2: 0, closes: 0, last: 0, first: 0 };
    people.forEach(p => { totals.views += p.views; totals.clicks += p.clicks; totals.cta2 += p.cta2; totals.closes += p.closes; totals.last = Math.max(totals.last, p.last || 0); totals.first = totals.first ? Math.min(totals.first, p.first) : p.first; });
    totals.avg = totals.unique ? Math.round(totals.views / totals.unique * 10) / 10 : 0;
    totals.ctr = totals.views ? Math.round(totals.clicks / totals.views * 1000) / 10 : 0;
    const seen = new Set(people.map(p => p.userId)), a = ad.audience || {};
    const notSeen = Object.values(users).filter(u => !seen.has(u.id) && (a.mode === 'users' ? a.users.indexOf(u.id) >= 0 : a.mode === 'roles' ? a.roles.indexOf(u.role) >= 0 : true))
      .map(u => ({ userId: u.id, name: u.name, username: u.username, role: u.role }));
    const recent = db.prepare('SELECT user_id, type, at FROM ad_events WHERE ad_id = ? ORDER BY at DESC, id DESC LIMIT 40').all(row.id)
      .map(r => { const u = users[r.user_id]; return { userId: r.user_id, name: u ? u.name : '', username: u ? u.username : '', type: r.type, at: r.at }; });
    return { ad: { id: row.id, name: ad.name, title: ad.title, icon: ad.icon, status: row.status, audience: a, accent: ad.theme.accent }, totals, people, notSeen, recent, now: Date.now() };
  }

  async function handle(req, res, pathname, me) {
    const admin = me && me.role === 'admin';
    const deny = () => sendJSON(res, 403, { error: 'forbidden', message: 'إدارة الإعلانات للمدير بس' });
    const parts = pathname.replace(/\/+$/, '').split('/');          // ['', 'api', 'ads', id?, action?]
    const id = parts[3] || '', action = parts[4] || '';
    const today = cairoDay();

    /* what this user should see now (+ their own history so the page can apply «once / daily / every N days») */
    if (id === 'feed' && req.method === 'GET') {
      const rows = db.prepare("SELECT * FROM ads WHERE status = 'active' ORDER BY priority ASC, updated_at DESC").all();
      const hist = {};
      for (const r of db.prepare("SELECT ad_id, COUNT(*) AS n, MAX(at) AS last FROM ad_events WHERE user_id = ? AND type = 'view' GROUP BY ad_id").all(me.id)) hist[r.ad_id] = { views: r.n, last: r.last, recent: [] };
      /* the last 48 h of views, so the page can count «today» in the viewer's own day */
      for (const r of db.prepare("SELECT ad_id, at FROM ad_events WHERE user_id = ? AND type = 'view' AND at > ? ORDER BY at DESC LIMIT 400").all(me.id, Date.now() - 48 * 3600e3)) if (hist[r.ad_id] && hist[r.ad_id].recent.length < 30) hist[r.ad_id].recent.push(r.at);
      const ads = rows.map(row2ad).filter(a => eligible(a, me, today)).filter(a => !(a.maxShows && hist[a.id] && hist[a.id].views >= a.maxShows))
        .map(a => { const h = hist[a.id] || { views: 0, last: 0, recent: [] }; const o = Object.assign({}, a); delete o.audience; delete o.name; o.seen = h; return o; });
      return sendJSON(res, 200, { ads, defaultWa: meta('defaultWa') || '', serverDay: today });
    }
    if (id === 'event' && req.method === 'POST') {
      const b = (await readBody(req, 0.01)) || {};
      const type = pick(b.type, EVENTS, ''), adId = str(b.id, 40);
      const row = adId ? getRow(adId) : null;
      if (!type || !row) return sendJSON(res, 400, { error: 'bad_request' });
      const imp = /^[\w-]{8,40}$/.test(String(b.imp || '')) ? String(b.imp) : null;
      const r = countEvent(row, me, type, imp, today);
      return sendJSON(res, 200, { ok: true, counted: r === true, why: r === true ? undefined : r });
    }

    /* ── admin only below ── */
    if (!admin) return deny();

    if (!id && req.method === 'GET') {
      const st = statsAll();
      const ads = db.prepare('SELECT * FROM ads ORDER BY (status = \'archived\') ASC, priority ASC, updated_at DESC').all().map(r => Object.assign(row2ad(r), { stats: st[r.id] || blank }));
      return sendJSON(res, 200, { ads, defaultWa: meta('defaultWa') || '' });
    }
    if (id === 'settings' && req.method === 'POST') {
      const b = (await readBody(req, 0.01)) || {};
      meta('defaultWa', waNumber(b.defaultWa));
      changed();
      return sendJSON(res, 200, { ok: true, defaultWa: meta('defaultWa') || '' });
    }
    if (!id && req.method === 'POST') {
      const b = (await readBody(req, 0.1)) || {};
      const ad = clean(b);
      if (!ad.title) return sendJSON(res, 400, { error: 'title', message: 'اكتب عنوان الإعلان' });
      const nid = insert(ad, pick(b.status, ['draft', 'active', 'paused'], 'draft'), me.id);
      changed(nid);
      return sendJSON(res, 200, { ok: true, ad: row2ad(getRow(nid)) });
    }
    const row = id ? getRow(id) : null;
    if (!row) return sendJSON(res, 404, { error: 'not_found', message: 'الإعلان مش موجود' });

    if (!action && req.method === 'PUT') {
      const b = (await readBody(req, 0.1)) || {};
      const ad = clean(b, row2ad(row));
      if (!ad.title) return sendJSON(res, 400, { error: 'title', message: 'اكتب عنوان الإعلان' });
      const status = b.status !== undefined ? pick(b.status, STATUSES, row.status) : row.status;
      db.prepare('UPDATE ads SET status = ?, priority = ?, data = ?, updated_at = ? WHERE id = ?').run(status, ad.priority, JSON.stringify(ad), now(), row.id);
      changed(row.id);
      return sendJSON(res, 200, { ok: true, ad: row2ad(getRow(row.id)) });
    }
    if (action === 'status' && req.method === 'POST') {
      const b = (await readBody(req, 0.01)) || {};
      const status = pick(b.status, STATUSES, '');
      if (!status) return sendJSON(res, 400, { error: 'bad_status' });
      db.prepare('UPDATE ads SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), row.id);
      changed(row.id);
      return sendJSON(res, 200, { ok: true, ad: row2ad(getRow(row.id)) });
    }
    if (action === 'duplicate' && req.method === 'POST') {
      const a = row2ad(row); const copy = clean(Object.assign({}, a, { name: (a.name || a.title) + ' (نسخة)' }));
      const nid = insert(copy, 'draft', me.id);
      return sendJSON(res, 200, { ok: true, ad: row2ad(getRow(nid)) });
    }
    if (action === 'viewers' && req.method === 'GET') return sendJSON(res, 200, viewers(row));
    if (action === 'reset-stats' && req.method === 'POST') {
      db.prepare('DELETE FROM ad_events WHERE ad_id = ?').run(row.id);
      return sendJSON(res, 200, { ok: true });
    }
    if (!action && req.method === 'DELETE') {
      db.prepare('DELETE FROM ad_events WHERE ad_id = ?').run(row.id);
      db.prepare('DELETE FROM ads WHERE id = ?').run(row.id);
      changed(row.id);
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 404, { error: 'not_found' });
  }

  return { handle, clean, waNumber, link, countEvent, viewers };
}

module.exports = { create, clean, waNumber, link, cairoDay };

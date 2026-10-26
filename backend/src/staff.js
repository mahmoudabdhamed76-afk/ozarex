'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · الموظفين (4.60) — حضور وانصراف بالموقع من لينك خاص بالموظف
   · The manager makes an employee in «الموظفين» → a username + password +
     a link (/staff). The employee signs in there (never into the ERP),
     taps «سجّل حضور» / «سجّل انصراف», and while he is checked in his phone
     sends its location every N minutes. At check-out the sending stops.
   · Everything is decided on the SERVER: who is who (own session, own
     cookie), the clock (Cairo time, never the phone's), the distance from
     the workplace, who may punch twice. A staff session can reach nothing
     under /api/ — only /staff/api/*.
   · Tables live in the main erp.db; passwords are scrypt hashes (same code
     as the ERP's own users) and are shown once, when they are made.
════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const auth = require('./auth');
const { db } = require('../db');

db.exec(`
CREATE TABLE IF NOT EXISTS staff_emp (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, job TEXT, phone TEXT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, track INTEGER NOT NULL DEFAULT 1,
  shift_start TEXT, shift_end TEXT, rest_days TEXT, site_id TEXT, note TEXT,
  created_at TEXT, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS staff_site (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL, lng REAL, radius INTEGER NOT NULL DEFAULT 250);
CREATE TABLE IF NOT EXISTS staff_sess (id TEXT PRIMARY KEY, emp_id TEXT NOT NULL, created TEXT, last_seen INTEGER, ua TEXT);
CREATE TABLE IF NOT EXISTS staff_att (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, date TEXT NOT NULL,
  in_at TEXT NOT NULL, in_lat REAL, in_lng REAL, in_acc REAL, in_dist INTEGER, in_site TEXT,
  out_at TEXT, out_lat REAL, out_lng REAL, out_acc REAL, out_dist INTEGER,
  source TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS ix_staff_att ON staff_att (emp_id, date);
CREATE TABLE IF NOT EXISTS staff_loc (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, att_id INTEGER, at TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, acc REAL, battery INTEGER, kind TEXT
);
CREATE INDEX IF NOT EXISTS ix_staff_loc ON staff_loc (emp_id, at);
CREATE TABLE IF NOT EXISTS staff_cfg (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS staff_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, who TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS staff_visit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, att_id INTEGER, date TEXT NOT NULL,
  center_key TEXT NOT NULL, center_name TEXT, branch_id TEXT,
  start_at TEXT NOT NULL, end_at TEXT, lat REAL, lng REAL, acc REAL, dist INTEGER,
  end_lat REAL, end_lng REAL, purpose TEXT, note TEXT, ended_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_staff_visit ON staff_visit (emp_id, date);
CREATE INDEX IF NOT EXISTS ix_staff_visit_c ON staff_visit (center_key, date);
CREATE TABLE IF NOT EXISTS staff_center (key TEXT PRIMARY KEY, name TEXT, lat REAL, lng REAL, n INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
`);
/* 4.61 · an employee may belong to one branch (he then sees that branch's centers only) */
try { if (!db.prepare('PRAGMA table_info(staff_emp)').all().some(c => c.name === 'branch_id')) db.exec('ALTER TABLE staff_emp ADD COLUMN branch_id TEXT'); } catch (e) { console.error('[staff] branch_id', e.message); }

/* ── the ERP's own data, handed in by server.js: the centers (customers of every branch) + the branches ── */
let SRC = { centers: () => [], branches: () => [] };
let _cc = null, _ccAt = 0;
function setSource(s) { SRC = Object.assign(SRC, s || {}); _cc = null; }
function centersAll() {
  if (_cc && Date.now() - _ccAt < 20000) return _cc;
  let list = [];
  try { list = SRC.centers() || []; } catch (e) { list = []; }
  const learned = new Map(db.prepare('SELECT * FROM staff_center').all().map(r => [r.key, r]));
  _cc = list.map(c => { const l = learned.get(c.key); return Object.assign({}, c, l && l.lat != null ? { lat: l.lat, lng: l.lng, pinned: !!l.pinned, samples: l.n } : { lat: null, lng: null }); });
  _ccAt = Date.now();
  return _cc;
}
let X = null;
const centerByKey = k => centersAll().find(c => c.key === k) || null;
function centersFor(e) { const all = centersAll(); return e && e.branch_id ? all.filter(c => c.branch === e.branch_id) : all; }
const PURPOSES = ['توصيل ورق', 'تحصيل', 'متابعة / زيارة', 'صيانة / تجربة', 'استلام مرتجع', 'تاني'];

/* ── settings ── */
const DEFAULTS = {
  tz: 'Africa/Cairo', require_location: '1', geofence: 'warn', ping_min: '15', grace_min: '10',
  shift_start: '09:00', shift_end: '17:00', rest_days: '5', track: '1', open_hours: '16', center_radius: '300',
  notify_in: '1', notify_out: '1', notify_arrive: '1', notify_visit: '0'
};
function cfgAll() {
  const out = Object.assign({}, DEFAULTS);
  for (const r of db.prepare('SELECT key, value FROM staff_cfg').all()) out[r.key] = r.value;
  return out;
}
const cfg = k => { const r = db.prepare('SELECT value FROM staff_cfg WHERE key = ?').get(k); return r ? r.value : DEFAULTS[k]; };
function cfgSet(k, v) { db.prepare('INSERT INTO staff_cfg (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v)); }

/* ── time: always the company's clock (Cairo), never the phone's ── */
let _fmt = null, _fmtTz = '';
function nowLocal() {
  const tz = cfg('tz') || 'Africa/Cairo';
  if (!_fmt || _fmtTz !== tz) {
    try { _fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); _fmtTz = tz; }
    catch (e) { _fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); _fmtTz = tz; }
  }
  const p = {}; for (const x of _fmt.formatToParts(new Date())) p[x.type] = x.value;
  const date = p.year + '-' + p.month + '-' + p.day, time = p.hour + ':' + p.minute + ':' + p.second;
  return { date, time, ts: date + ' ' + time };
}
function tsMin(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(ts || ''));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 60000;
}
function minToTs(mm) { const d = new Date(Math.round(mm * 60000)); return d.toISOString().slice(0, 10) + ' ' + d.toISOString().slice(11, 19); }
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const isHM = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();
const hmMin = s => { const [h, m] = String(s).split(':'); return (+h) * 60 + (+m); };
function haversine(a, b, c, d) {
  const R = 6371000, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const num = v => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rid = () => crypto.randomBytes(5).toString('hex');
function fail(status, message) { const e = new Error(message); e.status = status; e.staffMsg = message; throw e; }
function log(who, action, detail) { try { db.prepare('INSERT INTO staff_log (at, who, action, detail) VALUES (?, ?, ?, ?)').run(nowLocal().ts, who, action, detail ? JSON.stringify(detail).slice(0, 400) : null); } catch (e) {} }

/* ── an employee's working rules (his own, else the company's) ── */
function rulesOf(e) {
  const c = cfgAll();
  const s = isHM(e.shift_start) ? e.shift_start : c.shift_start, f = isHM(e.shift_end) ? e.shift_end : c.shift_end;
  const rest = String(e.rest_days == null || e.rest_days === '' ? c.rest_days : e.rest_days).split(',').map(x => x.trim()).filter(x => /^[0-6]$/.test(x));
  let len = (hmMin(f) - hmMin(s) + 1440) % 1440; if (!len) len = 1440;
  return { start: s, end: f, rest, len, grace: Math.max(0, Number(c.grace_min) || 0) };
}
/* one attendance row → the numbers the screens show */
function calc(r, e, nowTs) {
  const R = rulesOf(e || {});
  const inM = tsMin(r.in_at);
  const startM = tsMin(r.date + ' ' + R.start + ':00');
  const late = Math.max(0, Math.round(inM - startM) - R.grace);
  const outM = r.out_at ? tsMin(r.out_at) : null;
  const endM = startM + R.len;
  const worked = outM !== null ? Math.max(0, Math.round(outM - inM)) : (nowTs ? Math.max(0, Math.round(tsMin(nowTs) - inM)) : 0);
  return {
    late: late > 0 && inM > startM ? late : 0,
    worked, open: outM === null,
    over: outM !== null ? Math.max(0, worked - R.len) : 0,
    early: outM !== null ? Math.max(0, Math.round(endM - outM)) : 0
  };
}
const sitesAll = () => db.prepare('SELECT * FROM staff_site ORDER BY name').all();
function nearest(e, lat, lng) {
  let list = sitesAll().filter(s => s.lat !== null && s.lng !== null);
  if (e && e.site_id) { const own = list.filter(s => s.id === e.site_id); if (own.length) list = own; }
  let best = null;
  for (const s of list) { const d = Math.round(haversine(lat, lng, s.lat, s.lng)); if (!best || d < best.dist) best = { id: s.id, name: s.name, dist: d, radius: s.radius || 250 }; }
  return best;
}
function openRecord(empId, now) {
  const lim = minToTs(tsMin(now.ts) - (Number(cfg('open_hours')) || 16) * 60);
  return db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND out_at IS NULL AND in_at >= ? ORDER BY id DESC LIMIT 1').get(empId, lim) || null;
}

/* ── passwords ── */
const PW_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
function newPassword() { let s = ''; const b = crypto.randomBytes(8); for (let i = 0; i < 8; i++) s += PW_CHARS[b[i] % PW_CHARS.length]; return s; }
const okUser = u => /^[a-zA-Z0-9._-]{3,30}$/.test(u);
let _dummy = null;

/* ── employee sessions: their own table + cookie, nothing to do with the ERP's ── */
const COOKIE = 'ozs_sid', IDLE_MS = 30 * 864e5;
const seen = new Map();
function tokenOf(req) {
  const h = String(req.headers['x-staff-token'] || '');
  if (/^[A-Za-z0-9_-]{30,80}$/.test(h)) return h;
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)').exec(String(req.headers.cookie || ''));
  return m && /^[A-Za-z0-9_-]{30,80}$/.test(m[1]) ? m[1] : null;
}
function cookie(req, token) {
  const secure = auth.isHttps && auth.isHttps(req) ? '; Secure' : '';
  return COOKIE + '=' + (token || '') + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (token ? Math.floor(IDLE_MS / 1000) : 0) + secure;
}
function empOf(req) {
  const t = tokenOf(req); if (!t) return null;
  const id = auth.sha(t), s = db.prepare('SELECT * FROM staff_sess WHERE id = ?').get(id);
  if (!s) return null;
  const now = Date.now();
  if (now - (s.last_seen || 0) > IDLE_MS) { db.prepare('DELETE FROM staff_sess WHERE id = ?').run(id); return null; }
  const e = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(s.emp_id);
  if (!e || !e.active) { db.prepare('DELETE FROM staff_sess WHERE id = ?').run(id); return null; }
  if (now - (seen.get(id) || 0) > 600e3) { seen.set(id, now); db.prepare('UPDATE staff_sess SET last_seen = ? WHERE id = ?').run(now, id); }
  return { emp: e, token: t };
}
const publicEmp = e => ({ id: e.id, name: e.name, job: e.job || '', username: e.username });

/* ── what the employee sees on his home screen ── */
function monthRange(m) { const a = m + '-01', y = +m.slice(0, 4), mo = +m.slice(5, 7); const b = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); return [a, b]; }
function monthSummary(e, month, now) {
  const [a, b] = monthRange(month);
  const rows = db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date, id').all(e.id, a, b);
  let mins = 0, late = 0, lateMin = 0, over = 0; const days = new Set();
  const list = rows.map(r => { const c = calc(r, e, now.ts); mins += c.worked; over += c.over; if (c.late) { late++; lateMin += c.late; } days.add(r.date); return { id: r.id, date: r.date, in_at: r.in_at, out_at: r.out_at, worked: c.worked, late: c.late, early: c.early, over: c.over, open: c.open, out_of_range: r.in_dist !== null && r.in_site && r.in_dist > ((db.prepare('SELECT radius FROM staff_site WHERE id = ?').get(r.in_site) || {}).radius || 250) }; });
  return { month, days: days.size, mins, late, lateMin, over, list };
}
function home(e) {
  const now = nowLocal(), c = cfgAll(), R = rulesOf(e);
  const open = openRecord(e.id, now);
  const today = db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(e.id, now.date) || null;
  const rec = open || today;
  const sites = sitesAll().filter(s => s.lat !== null).filter(s => !e.site_id || s.id === e.site_id);
  const todayC = rec ? calc(rec, e, now.ts) : null;
  return {
    now, emp: publicEmp(e),
    state: open ? 'in' : (today ? 'done' : 'out'),
    rec: rec ? { id: rec.id, date: rec.date, in_at: rec.in_at, out_at: rec.out_at, in_dist: rec.in_dist, ...todayC } : null,
    rules: { start: R.start, end: R.end, rest: R.rest, grace: R.grace, restToday: R.rest.includes(String(dow(now.date))) },
    track: c.track === '1' && e.track === 1, ping_min: Math.max(1, Number(c.ping_min) || 15),
    need_location: c.require_location === '1', geofence: c.geofence,
    sites: sites.map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, radius: s.radius })),
    month: monthSummary(e, now.date.slice(0, 7), now),
    visit: openVisit(e.id, now) ? visitOut(openVisit(e.id, now), now) : null,
    visits: db.prepare('SELECT * FROM staff_visit WHERE emp_id = ? AND date = ? ORDER BY id').all(e.id, now.date).map(v => visitOut(v, now)),
    purposes: PURPOSES, has_centers: centersFor(e).length > 0,
    tasks: X ? X.tasksOf(e.id) : [], faults: db.prepare('SELECT COUNT(*) AS n FROM staff_fault').get().n
  };
}

/* ── 4.61 · «أنا شغّال في مركز…» — a visit to one of the ERP's centers ── */
function openVisit(empId, now) {
  const v = db.prepare('SELECT * FROM staff_visit WHERE emp_id = ? AND end_at IS NULL ORDER BY id DESC LIMIT 1').get(empId);
  if (!v) return null;
  if (!openRecord(empId, now)) { closeVisit(v, now, null, null, 'auto'); return null; }        // the day ended without closing it
  return v;
}
function closeVisit(v, now, lat, lng, by) {
  db.prepare('UPDATE staff_visit SET end_at = ?, end_lat = ?, end_lng = ?, ended_by = ? WHERE id = ? AND end_at IS NULL').run(now.ts, lat, lng, by || 'emp', v.id);
  if (X) X.visitEnded(null, v);
}
const centerRadius = () => Math.max(80, Number(cfg('center_radius')) || 300);
function visitOut(v, now) {
  const end = v.end_at || (now ? now.ts : null);
  return {
    id: v.id, center_key: v.center_key, center: v.center_name, branch: v.branch_id, start_at: v.start_at, end_at: v.end_at,
    mins: end ? Math.max(0, Math.round(tsMin(end) - tsMin(v.start_at))) : 0, open: !v.end_at,
    dist: v.dist, far: v.dist != null && v.dist > centerRadius(), purpose: v.purpose || '', note: v.note || '', lat: v.lat, lng: v.lng
  };
}
/* the center's place is learned from the visits themselves (good GPS fixes only), unless the manager pinned it */
function learnCenter(c, lat, lng, acc) {
  if (lat == null || lng == null || (acc != null && acc > 120)) return;
  const r = db.prepare('SELECT * FROM staff_center WHERE key = ?').get(c.key);
  const now = nowLocal().ts;
  if (!r) { db.prepare('INSERT INTO staff_center (key, name, lat, lng, n, pinned, updated_at) VALUES (?,?,?,?,1,0,?)').run(c.key, c.name, lat, lng, now); _cc = null; return; }
  if (r.pinned || r.lat == null) { if (r.lat == null) { db.prepare('UPDATE staff_center SET lat = ?, lng = ?, n = 1, updated_at = ? WHERE key = ?').run(lat, lng, now, c.key); _cc = null; } return; }
  if (r.n >= 8 || haversine(lat, lng, r.lat, r.lng) > centerRadius()) return;      // far fixes never pull the point away
  const n = r.n + 1;
  db.prepare('UPDATE staff_center SET lat = ?, lng = ?, n = ?, updated_at = ? WHERE key = ?').run((r.lat * r.n + lat) / n, (r.lng * r.n + lng) / n, n, now, c.key);
  _cc = null;
}
function startVisit(e, b) {
  const now = nowLocal();
  const att = openRecord(e.id, now);
  if (!att) fail(409, 'سجّل حضورك الأول وبعدين اختار المركز');
  const c = centersFor(e).find(x => x.key === String(b.center || ''));
  if (!c) fail(404, 'المركز ده مش موجود في القايمة');
  const lat = num(b.lat), lng = num(b.lng), acc = num(b.acc);
  const has = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (cfg('require_location') === '1' && !has) fail(400, 'لازم تفعّل الموقع علشان تسجّل إنك في المركز');
  const cur = openVisit(e.id, now);
  if (cur && cur.center_key === c.key) return { ok: true, same: true, home: home(e) };
  if (cur) closeVisit(cur, now, has ? lat : null, has ? lng : null, 'next');
  const dist = has && c.lat != null ? Math.round(haversine(lat, lng, c.lat, c.lng)) : null;
  const purpose = PURPOSES.includes(b.purpose) ? b.purpose : (b.purpose ? str(b.purpose, 40) : '');
  const vr = db.prepare('INSERT INTO staff_visit (emp_id, att_id, date, center_key, center_name, branch_id, start_at, lat, lng, acc, dist, purpose, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(e.id, att.id, now.date, c.key, c.name, c.branch || null, now.ts, has ? lat : null, has ? lng : null, acc, dist, purpose, str(b.note, 200));
  try { X.visitStarted(e, Number(vr.lastInsertRowid), c.key, b.task); X.onVisit(e, { center_name: c.name, purpose }, 'start'); } catch (er) { console.error('[staff] visit hook', er.message); }
  if (has) { logLoc(e, att.id, now, lat, lng, acc, b.battery, 'visit'); if (dist === null || dist <= centerRadius()) learnCenter(c, lat, lng, acc); }
  return { ok: true, home: home(e), dist, far: dist != null && dist > centerRadius() };
}
function endVisit(e, b) {
  const now = nowLocal(), v = openVisit(e.id, now);
  if (!v) fail(409, 'إنت مش مسجّل في أي مركز دلوقتي');
  const lat = num(b.lat), lng = num(b.lng);
  closeVisit(v, now, lat, lng, 'emp');
  let fault = null;
  try { if (b.fault && (b.fault.title || b.fault.solution)) fault = X.addFault(e, b.fault, v.id, v.center_key); } catch (er) { console.error('[staff] fault', er.message); }
  return { ok: true, home: home(e), fault };
}
function centersList(e, q) {
  const lat = num(q.get('lat')), lng = num(q.get('lng'));
  const mine = new Map(db.prepare('SELECT center_key, MAX(start_at) AS last, COUNT(*) AS n FROM staff_visit WHERE emp_id = ? GROUP BY center_key').all(e.id).map(r => [r.center_key, r]));
  const brs = new Map((SRC.branches() || []).map(b => [b.id, b.name]));
  const many = brs.size > 1 && !e.branch_id;
  const list = centersFor(e).map(c => {
    const d = lat !== null && c.lat != null ? Math.round(haversine(lat, lng, c.lat, c.lng)) : null;
    const m = mine.get(c.key);
    return { key: c.key, name: c.name, address: c.address || '', branch: many ? (brs.get(c.branch) || '') : '', dist: d, known: c.lat != null, mine: m ? m.n : 0, last: m ? m.last : null };
  });
  list.sort((a, b) => {
    const an = a.dist != null && a.dist <= 1500, bn = b.dist != null && b.dist <= 1500;
    if (an !== bn) return an ? -1 : 1;
    if (an && bn) return a.dist - b.dist;
    if (!!a.mine !== !!b.mine) return a.mine ? -1 : 1;
    return a.name.localeCompare(b.name, 'ar');
  });
  return { list, radius: centerRadius() };
}

/* ── punch / ping ── */
function punch(e, b) {
  const now = nowLocal(), c = cfgAll();
  const type = b.type === 'out' ? 'out' : 'in';
  const lat = num(b.lat), lng = num(b.lng), acc = num(b.acc);
  const has = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (c.require_location === '1' && !has) fail(400, 'لازم تفعّل الموقع (GPS) في الموبايل وتسمح للمتصفح علشان تسجّل');
  if (has && acc !== null && acc > 1500) fail(400, 'إشارة الموقع ضعيفة جدًا — اطلع مكان مفتوح وجرّب تاني');
  const near = has ? nearest(e, lat, lng) : null;
  const sites = sitesAll().filter(s => s.lat !== null);
  if (c.geofence === 'block' && sites.length && type === 'in') {
    if (!has) fail(400, 'لازم تفعّل الموقع علشان نتأكد إنك في مكان الشغل');
    if (near && near.dist > near.radius) fail(403, 'إنت خارج نطاق "' + near.name + '" بمسافة ' + near.dist + ' متر — قرّب من مكان الشغل وجرّب تاني');
  }
  if (type === 'in') {
    if (openRecord(e.id, now)) fail(409, 'إنت مسجّل حضور بالفعل — سجّل الانصراف الأول');
    const last = db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(e.id, now.date);
    if (last && last.out_at && tsMin(now.ts) - tsMin(last.out_at) <= 10) {                       // tapped «انصراف» by mistake → carry on, same record
      db.prepare('UPDATE staff_att SET out_at = NULL, out_lat = NULL, out_lng = NULL, out_acc = NULL, out_dist = NULL, note = ? WHERE id = ?').run('رجع بعد انصراف بالغلط', last.id);
      if (has) logLoc(e, last.id, now, lat, lng, acc, b.battery, 'in');
      return { ok: true, type, resumed: true, home: home(e) };
    }
    if (last) fail(409, 'سجّلت حضورك وانصرافك النهارده بالفعل');
    const r = db.prepare('INSERT INTO staff_att (emp_id, date, in_at, in_lat, in_lng, in_acc, in_dist, in_site, source) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(e.id, now.date, now.ts, has ? lat : null, has ? lng : null, acc, near ? near.dist : null, near ? near.id : null, 'phone');
    if (has) logLoc(e, Number(r.lastInsertRowid), now, lat, lng, acc, b.battery, 'in');
    try {
      const rec = db.prepare('SELECT * FROM staff_att WHERE id = ?').get(Number(r.lastInsertRowid));
      X.onPunch(e, 'in', now, { late: calc(rec, e, now.ts).late, dist: near ? near.dist : null, far: !!(near && near.dist > near.radius), site: near ? near.name : '' });
    } catch (er) { console.error('[staff] notify', er.message); }
  } else {
    const open = openRecord(e.id, now);
    if (!open) fail(409, 'مفيش حضور مسجّل — سجّل الحضور الأول');
    const ov = db.prepare('SELECT * FROM staff_visit WHERE emp_id = ? AND end_at IS NULL ORDER BY id DESC LIMIT 1').get(e.id);
    if (ov) closeVisit(ov, now, has ? lat : null, has ? lng : null, 'out');
    db.prepare('UPDATE staff_att SET out_at = ?, out_lat = ?, out_lng = ?, out_acc = ?, out_dist = ? WHERE id = ?')
      .run(now.ts, has ? lat : null, has ? lng : null, acc, near ? near.dist : null, open.id);
    if (has) logLoc(e, open.id, now, lat, lng, acc, b.battery, 'out');
    try { X.onPunch(e, 'out', now, { worked: calc(Object.assign({}, open, { out_at: now.ts }), e, now.ts).worked, visits: db.prepare('SELECT COUNT(*) AS n FROM staff_visit WHERE emp_id = ? AND date = ?').get(e.id, now.date).n }); } catch (er) { console.error('[staff] notify', er.message); }
  }
  return { ok: true, type, home: home(e) };
}
function logLoc(e, attId, now, lat, lng, acc, battery, kind) {
  const bat = num(battery);
  db.prepare('INSERT INTO staff_loc (emp_id, att_id, at, lat, lng, acc, battery, kind) VALUES (?,?,?,?,?,?,?,?)')
    .run(e.id, attId, now.ts, lat, lng, acc, bat === null ? null : Math.max(0, Math.min(100, Math.round(bat))), kind);
}
function ping(e, b) {
  const now = nowLocal(), c = cfgAll();
  if (c.track !== '1' || e.track !== 1) return { ok: false, off: true };
  const open = openRecord(e.id, now);
  if (!open) return { ok: false, closed: true };                           // only while he is on shift
  const lat = num(b.lat), lng = num(b.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'موقع غير صالح');
  const last = db.prepare('SELECT at FROM staff_loc WHERE emp_id = ? ORDER BY id DESC LIMIT 1').get(e.id);
  if (last && tsMin(now.ts) - tsMin(last.at) < 2) return { ok: true, skipped: true, at: last.at };
  logLoc(e, open.id, now, lat, lng, num(b.acc), b.battery, 'ping');
  return { ok: true, at: now.ts };
}

/* ═════════════ the manager's side ═════════════ */
const adminEmp = (e, now) => {
  const open = openRecord(e.id, now);
  const today = db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(e.id, now.date);
  const R = rulesOf(e);
  return {
    id: e.id, name: e.name, job: e.job || '', phone: e.phone || '', username: e.username, active: !!e.active, track: !!e.track,
    shift_start: e.shift_start || '', shift_end: e.shift_end || '', rest_days: e.rest_days == null ? '' : e.rest_days, site_id: e.site_id || '', note: e.note || '',
    created_at: e.created_at, last_login_at: e.last_login_at, branch_id: e.branch_id || '',
    rules: { start: R.start, end: R.end, rest: R.rest },
    state: open ? 'in' : (today ? 'done' : 'out'),
    in_at: today ? today.in_at : null, out_at: today ? today.out_at : null
  };
};
function bootstrap() {
  const now = nowLocal();
  let brs = []; try { brs = (SRC.branches() || []).map(b => ({ id: b.id, name: b.name })); } catch (e) {}
  return { now, cfg: cfgAll(), sites: sitesAll(), branches: brs, centers: centersAll().length, purposes: PURPOSES, emps: db.prepare('SELECT * FROM staff_emp ORDER BY active DESC, name').all().map(e => adminEmp(e, now)) };
}
function saveEmp(b, who) {
  const name = str(b.name, 100); if (!name) fail(400, 'اكتب اسم الموظف');
  const id = str(b.id, 20);
  let username = str(b.username, 30);
  if (id) {
    const ex = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(id); if (!ex) fail(404, 'الموظف مش موجود');
    if (!username) username = ex.username;
  } else if (!username) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM staff_emp').get().n + 1;
    username = 'emp' + (100 + n);
    while (db.prepare('SELECT 1 FROM staff_emp WHERE username = ?').get(username)) username += Math.floor(Math.random() * 10);
  }
  if (!okUser(username)) fail(400, 'اسم المستخدم حروف إنجليزي وأرقام (3 لـ 30) من غير مسافات');
  const dup = db.prepare('SELECT id FROM staff_emp WHERE username = ? COLLATE NOCASE').get(username);
  if (dup && dup.id !== id) fail(400, 'اسم المستخدم ده مستخدم لموظف تاني');
  const ss = isHM(b.shift_start) ? b.shift_start : null, se = isHM(b.shift_end) ? b.shift_end : null;
  const rest = b.rest_days === '' || b.rest_days == null ? null : [...new Set(String(b.rest_days).split(',').map(x => x.trim()).filter(x => /^[0-6]$/.test(x)))].join(',');
  const site = b.site_id && db.prepare('SELECT 1 FROM staff_site WHERE id = ?').get(String(b.site_id)) ? String(b.site_id) : null;
  const row = { name, job: str(b.job, 80), phone: str(b.phone, 30), active: b.active === false || b.active === 0 ? 0 : 1, track: b.track === false || b.track === 0 ? 0 : 1, note: str(b.note, 300) };
  let branch = null; try { branch = b.branch_id && (SRC.branches() || []).some(x => x.id === String(b.branch_id)) ? String(b.branch_id) : null; } catch (e) {}
  let pw = null, eid = id;
  if (id) {
    db.prepare('UPDATE staff_emp SET name=?, job=?, phone=?, username=?, active=?, track=?, shift_start=?, shift_end=?, rest_days=?, site_id=?, note=? WHERE id=?')
      .run(row.name, row.job, row.phone, username, row.active, row.track, ss, se, rest, site, row.note, id);
    if (!row.active) db.prepare('DELETE FROM staff_sess WHERE emp_id = ?').run(id);
    if (b.password) { pw = String(b.password); if (pw.length < 6) fail(400, 'كلمة السر 6 حروف على الأقل'); db.prepare('UPDATE staff_emp SET pass = ? WHERE id = ?').run(auth.hashPassword(pw), id); db.prepare('DELETE FROM staff_sess WHERE emp_id = ?').run(id); }
  } else {
    pw = b.password ? String(b.password) : newPassword();
    if (pw.length < 6) fail(400, 'كلمة السر 6 حروف على الأقل');
    eid = rid();
    db.prepare('INSERT INTO staff_emp (id, name, job, phone, username, pass, active, track, shift_start, shift_end, rest_days, site_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(eid, row.name, row.job, row.phone, username, auth.hashPassword(pw), row.active, row.track, ss, se, rest, site, row.note, nowLocal().ts);
  }
  db.prepare('UPDATE staff_emp SET branch_id = ? WHERE id = ?').run(branch, eid);
  log(who, id ? 'emp.update' : 'emp.create', { id: eid, name });
  return { ok: true, id: eid, username, password: pw };                    // the password is shown once, here
}
function resetPass(id, who) {
  const e = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(str(id, 20)); if (!e) fail(404, 'الموظف مش موجود');
  const pw = newPassword();
  db.prepare('UPDATE staff_emp SET pass = ? WHERE id = ?').run(auth.hashPassword(pw), e.id);
  db.prepare('DELETE FROM staff_sess WHERE emp_id = ?').run(e.id);
  log(who, 'emp.reset', { id: e.id, name: e.name });
  return { ok: true, id: e.id, username: e.username, password: pw };
}
function deleteEmp(id, who) {
  const e = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(str(id, 20)); if (!e) fail(404, 'الموظف مش موجود');
  db.exec('BEGIN');
  try {
    for (const t of ['staff_att', 'staff_loc', 'staff_sess', 'staff_visit']) db.prepare('DELETE FROM ' + t + ' WHERE emp_id = ?').run(e.id);
    db.prepare('DELETE FROM staff_emp WHERE id = ?').run(e.id);
    db.exec('COMMIT');
  } catch (er) { db.exec('ROLLBACK'); throw er; }
  log(who, 'emp.delete', { id: e.id, name: e.name });
  return { ok: true };
}
function saveCfg(b, who) {
  const c = {};
  if (b.require_location !== undefined) c.require_location = b.require_location ? '1' : '0';
  if (b.track !== undefined) c.track = b.track ? '1' : '0';
  if (b.geofence !== undefined) { if (!['off', 'warn', 'block'].includes(b.geofence)) fail(400, 'اختيار غير صالح'); c.geofence = b.geofence; }
  if (b.ping_min !== undefined) c.ping_min = String(Math.max(5, Math.min(120, Math.round(Number(b.ping_min) || 15))));
  if (b.grace_min !== undefined) c.grace_min = String(Math.max(0, Math.min(120, Math.round(Number(b.grace_min) || 0))));
  if (b.shift_start !== undefined) { if (!isHM(b.shift_start)) fail(400, 'ميعاد البداية غلط'); c.shift_start = b.shift_start; }
  if (b.shift_end !== undefined) { if (!isHM(b.shift_end)) fail(400, 'ميعاد النهاية غلط'); c.shift_end = b.shift_end; }
  if (b.center_radius !== undefined) c.center_radius = String(Math.max(80, Math.min(3000, Math.round(Number(b.center_radius) || 300))));
  if (b.rest_days !== undefined) c.rest_days = [...new Set(String(b.rest_days).split(',').map(x => x.trim()).filter(x => /^[0-6]$/.test(x)))].join(',');
  for (const k of ['notify_in', 'notify_out', 'notify_arrive', 'notify_visit']) if (b[k] !== undefined) c[k] = b[k] ? '1' : '0';
  for (const k of Object.keys(c)) cfgSet(k, c[k]);
  if (Array.isArray(b.sites)) {
    const keep = new Set();
    db.exec('BEGIN');
    try {
      for (const s of b.sites.slice(0, 30)) {
        const lat = num(s.lat), lng = num(s.lng), name = str(s.name, 80);
        if (!name) continue;
        if ((lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) fail(400, 'إحداثيات "' + name + '" غلط');
        const id = s.id && db.prepare('SELECT 1 FROM staff_site WHERE id = ?').get(String(s.id)) ? String(s.id) : rid();
        const radius = Math.max(30, Math.min(5000, Math.round(Number(s.radius) || 250)));
        db.prepare('INSERT INTO staff_site (id, name, lat, lng, radius) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, lat=excluded.lat, lng=excluded.lng, radius=excluded.radius').run(id, name, lat, lng, radius);
        keep.add(id);
      }
      for (const s of sitesAll()) if (!keep.has(s.id)) { db.prepare('DELETE FROM staff_site WHERE id = ?').run(s.id); db.prepare('UPDATE staff_emp SET site_id = NULL WHERE site_id = ?').run(s.id); }
      db.exec('COMMIT');
    } catch (er) { db.exec('ROLLBACK'); throw er; }
  }
  log(who, 'cfg.save', c);
  return { ok: true, cfg: cfgAll(), sites: sitesAll() };
}
function live() {
  const now = nowLocal(), nowM = tsMin(now.ts), out = [];
  const sites = new Map(sitesAll().map(s => [s.id, s]));
  for (const e of db.prepare('SELECT * FROM staff_emp WHERE active = 1 ORDER BY name').all()) {
    const open = openRecord(e.id, now);
    const today = db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(e.id, now.date);
    const l = db.prepare('SELECT * FROM staff_loc WHERE emp_id = ? AND at >= ? ORDER BY id DESC LIMIT 1').get(e.id, now.date + ' 00:00:00');
    const item = { id: e.id, name: e.name, job: e.job || '', phone: e.phone || '', state: open ? 'in' : (today ? 'done' : 'out'), in_at: today ? today.in_at : null, out_at: today ? today.out_at : null, tracking: !!e.track };
    if (today) { const c = calc(today, e, now.ts); item.late = c.late; item.worked = c.worked; item.over = c.over; item.early = c.early; item.in_dist = today.in_dist; const ss = today.in_site && sites.get(today.in_site); item.in_far = today.in_dist != null && !!ss && today.in_dist > (ss.radius || 250); }
    if (l) {
      item.last = { lat: l.lat, lng: l.lng, acc: l.acc, at: l.at, battery: l.battery, kind: l.kind };
      item.age_min = Math.max(0, Math.round(nowM - tsMin(l.at)));
      const near = nearest(e, l.lat, l.lng);
      if (near) { item.site = near.name; item.dist = near.dist; item.at_site = near.dist <= near.radius; }
    }
    item.pings = db.prepare("SELECT COUNT(*) AS n FROM staff_loc WHERE emp_id = ? AND at >= ? AND kind = 'ping'").get(e.id, now.date + ' 00:00:00').n;
    const ov = openVisit(e.id, now);
    if (ov) item.visit = visitOut(ov, now);
    item.visits = db.prepare('SELECT COUNT(*) AS n FROM staff_visit WHERE emp_id = ? AND date = ?').get(e.id, now.date).n;
    out.push(item);
  }
  const rank = { in: 0, out: 1, done: 2 };
  out.sort((a, b) => (rank[a.state] - rank[b.state]) || a.name.localeCompare(b.name, 'ar'));
  /* the centers on the map: every center whose place is known, and who is in it right now */
  const here = {}; out.forEach(x => { if (x.visit) (here[x.visit.center_key] = here[x.visit.center_key] || []).push(x.name); });
  const todayN = new Map(db.prepare('SELECT center_key, COUNT(*) AS n FROM staff_visit WHERE date = ? GROUP BY center_key').all(now.date).map(r => [r.center_key, r.n]));
  const centers = centersAll().filter(c => c.lat != null).map(c => ({ key: c.key, name: c.name, lat: c.lat, lng: c.lng, here: here[c.key] || [], today: todayN.get(c.key) || 0 }));
  return { now, ping_min: Number(cfg('ping_min')) || 15, radius: centerRadius(), list: out, centers, tasks: X.board(), sites: sitesAll().filter(s => s.lat !== null).map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, radius: s.radius })) };
}
function track(empId, date) {
  const e = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(str(empId, 20)); if (!e) fail(404, 'الموظف مش موجود');
  const d = isDate(date) ? date : nowLocal().date;
  const att = db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND date = ? ORDER BY id').all(e.id, d);
  const points = db.prepare('SELECT at, lat, lng, acc, battery, kind FROM staff_loc WHERE emp_id = ? AND at >= ? AND at < ? ORDER BY at').all(e.id, d + ' 00:00:00', addDays(d, 1) + ' 12:00:00');
  const now = nowLocal();
  const visits = db.prepare('SELECT * FROM staff_visit WHERE emp_id = ? AND date = ? ORDER BY start_at').all(e.id, d).map(v => visitOut(v, now));
  const keys = new Set(visits.map(v => v.center_key));
  const centers = centersAll().filter(c => keys.has(c.key) && c.lat != null).map(c => ({ key: c.key, name: c.name, lat: c.lat, lng: c.lng }));
  return { date: d, emp: { id: e.id, name: e.name }, att, points, visits, centers, radius: centerRadius() };
}
function report(month) {
  const now = nowLocal();
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : now.date.slice(0, 7);
  const [a, b] = monthRange(m);
  const last = b < now.date ? b : now.date;
  const rows = [];
  for (const e of db.prepare('SELECT * FROM staff_emp ORDER BY name').all()) {
    const R = rulesOf(e), recs = db.prepare('SELECT * FROM staff_att WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date, id').all(e.id, a, b);
    const days = {}; let mins = 0, late = 0, lateMin = 0, over = 0, early = 0, openN = 0, outside = 0;
    for (const r of recs) {
      const c = calc(r, e, now.ts);
      const d = days[r.date] || (days[r.date] = { date: r.date, in_at: r.in_at, out_at: null, worked: 0, late: 0, over: 0, early: 0, open: false, att: [] });
      d.worked += c.worked; d.late = d.late || c.late; d.over += c.over; d.early += c.early; d.open = d.open || (c.open && r.date !== now.date);
      d.out_at = r.out_at || d.out_at; d.att.push(r.id);
      mins += c.worked; over += c.over; early += c.early;
      if (c.open && r.date < now.date) openN++;
      if (r.in_dist !== null && r.in_site) { const s = db.prepare('SELECT radius FROM staff_site WHERE id = ?').get(r.in_site); if (r.in_dist > ((s && s.radius) || 250)) outside++; }
    }
    for (const d of Object.values(days)) if (d.late) { late++; lateMin += d.late; }
    const from = e.created_at && e.created_at.slice(0, 10) > a ? e.created_at.slice(0, 10) : a;
    let absent = 0, expected = 0;
    for (let d = from; d <= last; d = addDays(d, 1)) { if (R.rest.includes(String(dow(d)))) continue; expected++; if (!days[d] && d < now.date) absent++; }
    const vs = db.prepare('SELECT * FROM staff_visit WHERE emp_id = ? AND date >= ? AND date <= ?').all(e.id, a, b).map(v => visitOut(v, now));
    const byDay = {}; db.prepare('SELECT date, COUNT(*) AS n FROM staff_visit WHERE emp_id = ? AND date >= ? AND date <= ? GROUP BY date').all(e.id, a, b).forEach(r => { byDay[r.date] = r.n; });
    Object.values(days).forEach(d => { d.visits = byDay[d.date] || 0; });
    rows.push({ id: e.id, name: e.name, job: e.job || '', active: !!e.active, present: Object.keys(days).length, absent, expected, mins, late, lateMin, over, early, noOut: openN, outside,
      visits: vs.length, visitMins: vs.reduce((t, v) => t + v.mins, 0), centersN: new Set(vs.map(v => v.center_key)).size, farVisits: vs.filter(v => v.far).length, days: Object.values(days) });
  }
  return { month: m, from: a, to: b, now, rows };
}
function saveAtt(b, who) {
  const e = db.prepare('SELECT * FROM staff_emp WHERE id = ?').get(str(b.emp_id, 20)); if (!e) fail(404, 'الموظف مش موجود');
  if (!isDate(b.date)) fail(400, 'التاريخ غلط');
  if (!isHM(b.in_time)) fail(400, 'اكتب ميعاد الحضور');
  const inTs = b.date + ' ' + b.in_time + ':00';
  let outTs = null;
  if (b.out_time) {
    if (!isHM(b.out_time)) fail(400, 'ميعاد الانصراف غلط');
    outTs = b.date + ' ' + b.out_time + ':00';
    if (tsMin(outTs) <= tsMin(inTs)) outTs = addDays(b.date, 1) + ' ' + b.out_time + ':00';          // past midnight
  }
  const note = str(b.note, 200) || 'تعديل يدوي من الإدارة';
  if (b.id) {
    const r = db.prepare('UPDATE staff_att SET date=?, in_at=?, out_at=?, note=?, source=? WHERE id = ? AND emp_id = ?').run(b.date, inTs, outTs, note, 'manager', Number(b.id), e.id);
    if (!r.changes) fail(404, 'السجل مش موجود');
  } else {
    db.prepare('INSERT INTO staff_att (emp_id, date, in_at, out_at, source, note) VALUES (?,?,?,?,?,?)').run(e.id, b.date, inTs, outTs, 'manager', note);
  }
  log(who, b.id ? 'att.edit' : 'att.add', { emp: e.name, date: b.date, in: b.in_time, out: b.out_time || null });
  return { ok: true };
}
function delAtt(id, who) {
  const r = db.prepare('SELECT a.*, e.name FROM staff_att a JOIN staff_emp e ON e.id = a.emp_id WHERE a.id = ?').get(Number(id)); if (!r) fail(404, 'السجل مش موجود');
  db.prepare('DELETE FROM staff_att WHERE id = ?').run(r.id); db.prepare('DELETE FROM staff_loc WHERE att_id = ?').run(r.id); db.prepare('DELETE FROM staff_visit WHERE att_id = ?').run(r.id);
  log(who, 'att.delete', { emp: r.name, date: r.date });
  return { ok: true };
}

/* 4.61 · «زيارات المراكز» — every center in a month: how many visits, how long, by whom, and where it is */
function visitsReport(month) {
  const now = nowLocal();
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : now.date.slice(0, 7);
  const [a, b] = monthRange(m);
  const names = new Map(db.prepare('SELECT id, name FROM staff_emp').all().map(r => [r.id, r.name]));
  const rows = db.prepare('SELECT * FROM staff_visit WHERE date >= ? AND date <= ? ORDER BY start_at DESC').all(a, b);
  const by = new Map();
  for (const r of rows) {
    const v = visitOut(r, now);
    const g = by.get(r.center_key) || { key: r.center_key, name: r.center_name, n: 0, mins: 0, far: 0, last: null, emps: {}, purposes: {}, list: [] };
    g.n++; g.mins += v.mins; if (v.far) g.far++; if (!g.last || r.start_at > g.last) g.last = r.start_at;
    const en = names.get(r.emp_id) || '—'; g.emps[en] = (g.emps[en] || 0) + 1;
    if (v.purpose) g.purposes[v.purpose] = (g.purposes[v.purpose] || 0) + 1;
    if (g.list.length < 40) g.list.push(Object.assign(v, { emp: en, date: r.date }));
    by.set(r.center_key, g);
  }
  const all = centersAll();
  const known = new Map(all.map(c => [c.key, c]));
  const out = [...by.values()].map(g => { const c = known.get(g.key); return Object.assign(g, { lat: c ? c.lat : null, lng: c ? c.lng : null, pinned: !!(c && c.pinned), samples: c ? c.samples || 0 : 0, gone: !c }); }).sort((x, y) => y.n - x.n);
  const visited = new Set(out.map(g => g.key));
  const never = all.filter(c => !visited.has(c.key)).map(c => ({ key: c.key, name: c.name, lat: c.lat, lng: c.lng }));
  return { month: m, now, total: rows.length, centers: out, never: never.slice(0, 300), neverN: never.length, radius: centerRadius() };
}
function pinCenter(b, who) {
  const c = centerByKey(String(b.key || '')); if (!c) fail(404, 'المركز مش موجود');
  if (b.clear) { db.prepare('DELETE FROM staff_center WHERE key = ?').run(c.key); _cc = null; log(who, 'center.clear', { name: c.name }); return { ok: true }; }
  const lat = num(b.lat), lng = num(b.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'الإحداثيات غلط');
  db.prepare('INSERT INTO staff_center (key, name, lat, lng, n, pinned, updated_at) VALUES (?,?,?,?,1,1,?) ON CONFLICT(key) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, pinned = 1, name = excluded.name, updated_at = excluded.updated_at').run(c.key, c.name, lat, lng, nowLocal().ts);
  _cc = null; log(who, 'center.pin', { name: c.name });
  return { ok: true };
}

/* old location points are dropped after 90 days (the hours stay) */
function sweep() {
  try {
    const lim = minToTs(tsMin(nowLocal().ts) - 90 * 1440);
    db.prepare('DELETE FROM staff_loc WHERE at < ?').run(lim);
    db.prepare('DELETE FROM staff_sess WHERE last_seen < ?').run(Date.now() - IDLE_MS);
  } catch (e) {}
}
sweep(); setInterval(sweep, 6 * 3600e3).unref();

/* 4.63 · notifications + بنك الأعطال + المهام */
X = require('./staffx')({ db, nowLocal, tsMin, haversine, num, str, fail, centerByKey, centersAll, centerRadius, cfg, openRecord, log, logLoc });

/* ═════════════ HTTP ═════════════ */
/* /staff/api/* — the employee's own endpoints (no ERP session; his own) */
async function handlePublic(req, res, pathname, h) {
  const { sendJSON, readBody } = h;
  const send = (st, o, hd) => sendJSON(res, st, o, hd);
  try {
    if (pathname === '/staff/api/brand' && req.method === 'GET') {
      const st = (h.settings && h.settings()) || {};
      return send(200, { name: String(st.companyName || '').slice(0, 120), logo: typeof st.companyLogo === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(st.companyLogo) ? st.companyLogo : '' });
    }
    if (pathname === '/staff/api/login' && req.method === 'POST') {
      const b = (await readBody(req, 0.02)) || {};
      const name = str(b.username, 40), pw = String(b.password || '').slice(0, 200);
      const key = 'staff:' + name.toLowerCase();
      const wait = auth.throttled(req, key);
      if (wait) return send(429, { error: 'too_many', message: 'محاولات كتير غلط — استنى ' + wait + ' دقيقة وجرّب تاني' });
      const e = name ? db.prepare('SELECT * FROM staff_emp WHERE username = ? COLLATE NOCASE').get(name) : null;
      if (!_dummy) _dummy = auth.hashPassword('dummy-password');
      let ok = false;
      try { ok = await auth.verifyPasswordAsync(pw, e ? e.pass : _dummy); } catch (er) { return send(503, { error: 'busy', message: 'السيرفر مشغول — جرّب كمان ثانية' }); }
      if (!e || !ok) { auth.failed(req, key); return send(401, { error: 'bad_login', message: 'اسم المستخدم أو كلمة السر غلط' }); }
      if (!e.active) return send(403, { error: 'off', message: 'حسابك موقوف — كلّم الإدارة' });
      auth.succeeded(req, key);
      const token = crypto.randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO staff_sess (id, emp_id, created, last_seen, ua) VALUES (?,?,?,?,?)').run(auth.sha(token), e.id, nowLocal().ts, Date.now(), str(req.headers['user-agent'], 120));
      db.prepare('UPDATE staff_emp SET last_login_at = ? WHERE id = ?').run(nowLocal().ts, e.id);
      const n = db.prepare('SELECT COUNT(*) AS n FROM staff_sess WHERE emp_id = ?').get(e.id).n;
      if (n > 5) db.prepare('DELETE FROM staff_sess WHERE id IN (SELECT id FROM staff_sess WHERE emp_id = ? ORDER BY last_seen LIMIT ?)').run(e.id, n - 5);
      return send(200, { ok: true, token, emp: publicEmp(e) }, { 'Set-Cookie': cookie(req, token) });
    }
    if (pathname === '/staff/api/logout' && req.method === 'POST') {
      const t = tokenOf(req); if (t) db.prepare('DELETE FROM staff_sess WHERE id = ?').run(auth.sha(t));
      return send(200, { ok: true }, { 'Set-Cookie': cookie(req, null) });
    }
    const me = empOf(req);
    if (!me) return send(401, { error: 'login', message: 'سجّل دخول الأول' });
    const e = me.emp;
    if (pathname === '/staff/api/home' && req.method === 'GET') return send(200, home(e));
    if (pathname === '/staff/api/punch' && req.method === 'POST') return send(200, punch(e, (await readBody(req, 0.02)) || {}));
    if (pathname === '/staff/api/ping' && req.method === 'POST') return send(200, ping(e, (await readBody(req, 0.02)) || {}));
    if (pathname === '/staff/api/centers' && req.method === 'GET') return send(200, centersList(e, new URL(req.url, 'http://x').searchParams));
    if (pathname === '/staff/api/visit' && req.method === 'POST') return send(200, startVisit(e, (await readBody(req, 0.02)) || {}));
    if (pathname === '/staff/api/visit/end' && req.method === 'POST') return send(200, endVisit(e, (await readBody(req, 0.02)) || {}));
    if (pathname === '/staff/api/history' && req.method === 'GET') {
      const m = String(new URL(req.url, 'http://x').searchParams.get('month') || '');
      const month = /^\d{4}-\d{2}$/.test(m) ? m : nowLocal().date.slice(0, 7);
      return send(200, monthSummary(e, month, nowLocal()));
    }
    if (pathname === '/staff/api/password' && req.method === 'POST') {
      const b = (await readBody(req, 0.02)) || {};
      let ok = false; try { ok = await auth.verifyPasswordAsync(String(b.old || ''), e.pass); } catch (er) { return send(503, { error: 'busy' }); }
      if (!ok) return send(400, { error: 'bad', message: 'كلمة السر الحالية غلط' });
      const nw = String(b.new || '');
      if (nw.length < 6) return send(400, { error: 'weak', message: 'كلمة السر الجديدة 6 حروف على الأقل' });
      db.prepare('UPDATE staff_emp SET pass = ? WHERE id = ?').run(auth.hashPassword(nw), e.id);
      db.prepare('DELETE FROM staff_sess WHERE emp_id = ? AND id != ?').run(e.id, auth.sha(me.token));
      return send(200, { ok: true });
    }
    if (await X.publicRoute(req, res, pathname, e, send, readBody)) return;
    return send(404, { error: 'not_found' });
  } catch (er) {
    if (er && er.staffMsg) return send(er.status || 400, { error: 'staff', message: er.staffMsg });
    throw er;
  }
}

/* /api/staff/* — the manager (admin only; checked by the caller) */
async function handleAdmin(req, res, pathname, me, h) {
  const { sendJSON, readBody } = h;
  const who = me.name || me.username || 'admin';
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    const p = pathname.slice('/api/staff'.length) || '/';
    const get = req.method === 'GET';
    const body = async () => (await readBody(req, 0.05)) || {};
    if (get && p === '/bootstrap') return sendJSON(res, 200, bootstrap());
    if (get && p === '/live') return sendJSON(res, 200, live());
    if (get && p === '/track') return sendJSON(res, 200, track(q.get('emp'), q.get('date')));
    if (get && p === '/report') return sendJSON(res, 200, report(q.get('month')));
    if (get && p === '/visits') return sendJSON(res, 200, visitsReport(q.get('month')));
    if (get && p === '/log') return sendJSON(res, 200, { rows: db.prepare('SELECT * FROM staff_log ORDER BY id DESC LIMIT 80').all() });
    if (req.method === 'POST') {
      if (p === '/emp') return sendJSON(res, 200, saveEmp(await body(), who));
      if (p === '/emp/reset') return sendJSON(res, 200, resetPass((await body()).id, who));
      if (p === '/emp/delete') return sendJSON(res, 200, deleteEmp((await body()).id, who));
      if (p === '/cfg') return sendJSON(res, 200, saveCfg(await body(), who));
      if (p === '/att') return sendJSON(res, 200, saveAtt(await body(), who));
      if (p === '/center') return sendJSON(res, 200, pinCenter(await body(), who));
      if (p === '/att/delete') return sendJSON(res, 200, delAtt((await body()).id, who));
    }
    if (await X.adminRoute(req, res, p, who, body, (st, o) => sendJSON(res, st, o))) return;
    return sendJSON(res, 404, { error: 'not_found' });
  } catch (er) {
    if (er && er.staffMsg) return sendJSON(res, er.status || 400, { error: 'staff', message: er.staffMsg });
    throw er;
  }
}

module.exports = { handlePublic, handleAdmin, setSource, setNotify: n => X.setNotify(n), _test: { nowLocal, calc, rulesOf, tsMin } };

'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · store — the live copy of the data + record-level saving
   ------------------------------------------------------------------
   · The whole dataset lives in memory (MEM) and in SQLite.
   · Devices send only WHAT CHANGED (js/axcore.js «wire» format):
       added records · removed ids · edited fields (+ the value they had)
     The server applies it on top of the newest data, so two devices
     working at once no longer overwrite each other; balances, stock
     quantities and paid amounts move by their difference.
   · Before applying, a change from a non-admin is judged with the SAME
     rules the browser uses («طلبات الموافقة»): anything that needs the
     admin is refused here too, even if someone bypasses the screen.
   · Backups: a gzip copy per day in DATA_DIR/backups (30 kept) — outside
     the database file — optionally sent to Telegram.
════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { db, DATA_DIR } = require('../db');
const bridge = require('./bridge');
const integrity = require('./integrity');
const AX = require(process.env.PUBLIC_DIR ? path.join(process.env.PUBLIC_DIR, 'js', 'axcore.js') : path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'axcore.js'));

let MEM = null;
const AUDIT_MAX = 5000;

function sortAudit() {
  if (Array.isArray(MEM.auditLog)) MEM.auditLog.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
}
function strip(u) { const o = Object.assign({}, u); delete o.password; return o; }

function load() {
  MEM = bridge.exportBlob();
  MEM.users = (MEM.users || []).map(strip);
  sortAudit();
  /* every record needs an id for record-level saving */
  let fixed = 0;
  Object.keys(MEM).forEach(k => {
    if (!Array.isArray(MEM[k]) || k === 'auditLog') return;
    MEM[k].forEach(r => { if (r && typeof r === 'object' && (r.id === undefined || r.id === null || r.id === '')) { r.id = 'mig_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); fixed++; } });
  });
  if (fixed) { full(MEM); console.log('🆔 gave ids to', fixed, 'old record(s)'); }
  return MEM;
}
function data() { if (!MEM) load(); return MEM; }
/* what a device receives: no password hashes, ever */
function publicData() { const d = data(); return Object.assign({}, d, { users: (d.users || []).map(strip) }); }
function user(id) { return (data().users || []).find(u => u.id === id) || null; }
function userByName(name) {
  const n = String(name || '').trim().toLowerCase();
  return (data().users || []).find(u => String(u.username || '').trim().toLowerCase() === n) || null;
}

/* full replace (admin restore / reset) */
function full(blob) {
  const clean = Object.assign({}, blob);
  delete clean.__version;
  bridge.importBlob(clean);
  MEM = bridge.exportBlob();
  MEM.users = (MEM.users || []).map(strip);
  sortAudit();
}

/* a change the server will not apply. status 403 on purpose: every client version (and the
   service worker queue) treats 403 as «refused — take the server's copy back», so nothing
   gets stuck retrying in an offline queue */
class Refused extends Error {
  constructor(code, msg, extra, status) { super(msg); this.code = code; this.extra = extra || {}; this.status = status || 403; }
}
const asRefused = e => (e instanceof integrity.IntegrityError ? new Refused(e.code, e.message, e.extra) : e);

/* ── approvals list: a non-admin may only add his own pending request
      or withdraw his own pending request ── */
function checkApprovals(u, cd) {
  if (!cd) return;
  const cur = AX.idx(((data().settings || {})._approvals) || []);
  (cd.added || []).forEach(r => {
    if (!r || r.status !== 'pending' || !r.by || r.by.id !== u.id) throw new Refused('forbidden', 'طلب موافقة غير صالح');
  });
  if ((cd.removed || []).length) throw new Refused('forbidden', 'مسح طلبات الموافقة للمدير بس');
  (cd.modified || []).forEach(x => {
    const r = cur[x.k];
    if (!r || !r.by || r.by.id !== u.id) throw new Refused('forbidden', 'ده مش طلبك');
    const ok = x.f.every(f => f === 'status' || f === 'decidedAt');
    if (!ok || r.status !== 'pending' || x.a.status !== 'withdrawn') throw new Refused('forbidden', 'القرار في الطلبات للمدير بس');
  });
}

/* ── requests & suggestions (4.11): a non-admin may only add his own pending
      request or withdraw his own pending one — approving / rejecting is the admin's ── */
function checkRequests(u, cd) {
  if (!cd) return;
  const cur = AX.idx(((data().settings || {})._requests) || []);
  (cd.added || []).forEach(r => {
    if (!r || r.status !== 'pending' || !r.by || r.by.id !== u.id) throw new Refused('forbidden', 'طلب غير صالح');
  });
  if ((cd.removed || []).length) throw new Refused('forbidden', 'مسح الطلبات للمدير بس');
  (cd.modified || []).forEach(x => {
    const r = cur[x.k];
    if (!r || !r.by || r.by.id !== u.id) throw new Refused('forbidden', 'ده مش طلبك');
    const ok = x.f.every(f => f === 'status' || f === 'decidedAt');
    if (!ok || r.status !== 'pending' || x.a.status !== 'withdrawn') throw new Refused('forbidden', 'القرار في الطلبات للمدير بس');
  });
}

/* ── 4.20 · security: a change is cleaned up before anything looks at it ──
   · no __proto__ / constructor / prototype anywhere (they could swap the settings' prototype)
   · «removed» is always a list of keys ("i:<id>"), so the approval check sees every delete
   · record ids can't carry quotes / tags / spaces (they end up inside onclick="…" on screens) */
const BAD_KEY = /^(__proto__|constructor|prototype)$/;
const BAD_ID = /["'`<>\\\s&()]/;
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function badId(id) { return id != null && (String(id).length > 100 || BAD_ID.test(String(id))); }
function scrub(v, depth) {
  if (!v || typeof v !== 'object' || depth > 40) return v;
  if (Array.isArray(v)) { v.forEach(x => scrub(x, depth + 1)); return v; }
  Object.keys(v).forEach(k => {
    if (BAD_KEY.test(k)) { delete v[k]; return; }
    if (k === 'id' && badId(v[k])) throw new Refused('bad_id', 'رقم السجل فيه رموز مش مسموحة');   // ids at any depth (payments inside a debt…)
    scrub(v[k], depth + 1);
  });
  return v;
}
function plainObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function sanitize(w) {
  w = plainObj(w);
  w.cols = plainObj(w.cols); w.sets = plainObj(w.sets); w.keys = plainObj(w.keys);
  [w.cols, w.sets, w.keys].forEach(g => Object.keys(g).forEach(k => { if (BAD_KEY.test(k)) delete g[k]; }));
  [w.cols, w.sets].forEach(g => Object.keys(g).forEach(k => {
    const cd = plainObj(g[k]);
    cd.added = (Array.isArray(cd.added) ? cd.added : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).map(r => scrub(r, 0));
    cd.added.forEach(r => { if (badId(r.id)) throw new Refused('bad_id', 'رقم السجل فيه رموز مش مسموحة'); });
    cd.removed = (Array.isArray(cd.removed) ? cd.removed : []).map(r => typeof r === 'string' ? r : AX.keyOf(r));
    cd.modified = (Array.isArray(cd.modified) ? cd.modified : []).filter(x => x && typeof x === 'object' && typeof x.k === 'string' && Array.isArray(x.f) && x.a && typeof x.a === 'object')
      .map(x => {
        /* an edit never renames a record (diffs are keyed by id) */
        x.f = x.f.filter(f => typeof f === 'string' && !BAD_KEY.test(f) && f !== 'id');
        delete x.a.id; if (x.b && typeof x.b === 'object') delete x.b.id;
        scrub(x.a, 0); if (x.b) scrub(x.b, 0); return x;
      });
    g[k] = cd;
  }));
  Object.keys(w.keys).forEach(k => { const e = plainObj(w.keys[k]); scrub(e, 0); w.keys[k] = e; });
  if (w.counters) {
    w.counters = plainObj(w.counters); w.counters.a = plainObj(w.counters.a);
    Object.keys(w.counters.a).forEach(n => { if (BAD_KEY.test(n) || !isFinite(Number(w.counters.a[n]))) delete w.counters.a[n]; });
  }
  return w;
}

/* ── the main entry: apply a change sent by a device ── */
function apply(u, w) {
  const d = data();
  w = sanitize(w);
  Object.keys(w.cols).forEach(k => { if (!bridge.KNOWN_KEYS.has(k)) { console.warn('[ops] unknown collection ignored:', k); delete w.cols[k]; } });
  const admin = u.role === 'admin';
  const s = d.settings || {};

  /* Phase 1 · checked for everyone, before anything is changed */
  let renumbered;
  try {
    integrity.checkIds(d, w);                 // I10 — a «new» id that already exists is refused
    integrity.checkRequired(d, w);            // C2  — never accept what the database would drop
    renumbered = integrity.assignNumbers(d, w);   // C5 — numbers stay unique
  } catch (e) { throw asRefused(e); }

  if (!admin) {
    if (w.cols.users) throw new Refused('forbidden', 'المستخدمين للمدير بس');
    Object.keys(w.keys).forEach(k => { if (!own(AX.USER_KEYS, k)) throw new Refused('forbidden', 'الإعداد ده للمدير بس: ' + k); });
    Object.keys(w.sets).forEach(k => { if (!own(AX.USER_KEYS, k)) throw new Refused('forbidden', 'الإعداد ده للمدير بس: ' + k); });
    /* a list (approvals, debts, cheques…) only changes item by item through «sets», never replaced whole through «keys» */
    Object.keys(w.keys).forEach(k => {
      const cur = s[k], nv = w.keys[k].a;
      if ((AX.isIdArr(cur) && cur.length) || (AX.isIdArr(nv) && nv.length)) throw new Refused('forbidden', 'القايمة دي بتتعدل عنصر عنصر بس: ' + k);
    });
    /* the audit log: a user can only add his own entries */
    if (w.cols.auditLog) w.cols.auditLog = { added: (w.cols.auditLog.added || []).filter(e => e && e.userId === u.id), removed: [], modified: [] };
    checkApprovals(u, w.sets._approvals);
    checkRequests(u, w.sets._requests);
    const df = AX.enrich(d, w);
    const level = AX.levelOf(s, u);   // per user (set by the admin in «المستخدمين»)
    let why = AX.classify(df, level || 'sensitive', { closedUntil: s.closedUntil || '' });
    if (why && (s.approvalsOff || !level)) why = why.filter(x => x.t === 'closed');
    if (why && why.length) throw new Refused('needs_approval', 'التعديل ده محتاج موافقة المدير', { why });
  }

  /* what will be written */
  const touched = {};   // blobKey → Set(ids)
  const removed = {};   // blobKey → Set(ids)
  const mark = (o, k, id) => { (o[k] = o[k] || new Set()).add(String(id)); };
  Object.keys(w.cols).forEach(k => {
    const cd = w.cols[k];
    (cd.added || []).forEach(r => r && r.id != null && mark(touched, k, r.id));
    (cd.modified || []).forEach(x => x.k && x.k.indexOf('i:') === 0 && mark(touched, k, x.k.slice(2)));
    (cd.removed || []).forEach(rk => { const key = typeof rk === 'string' ? rk : AX.keyOf(rk); if (key.indexOf('i:') === 0) mark(removed, k, key.slice(2)); });
  });

  /* plain passwords → hashes before they ever touch memory */
  const pwById = {};
  if (w.cols.users) {
    const auth = require('./auth');
    const pwOk = v => { if (String(v).length > 128) throw new Refused('weak', 'كلمة السر طويلة قوي (128 حرف بالكتير)'); return v; };
    (w.cols.users.added || []).forEach(r => { if (r && r.password) { pwById[r.id] = auth.hashPassword(pwOk(r.password)); delete r.password; } });
    (w.cols.users.modified || []).forEach(x => {
      const i = x.f.indexOf('password');
      if (i >= 0) {
        const v = x.a.password; x.f.splice(i, 1); delete x.a.password; if (x.b) delete x.b.password;
        if (v && x.k.indexOf('i:') === 0) pwById[x.k.slice(2)] = auth.hashPassword(pwOk(v));
      }
    });
  }

  /* a set password ends the «restored without a password» state */
  Object.keys(pwById).forEach(id => {
    (w.cols.users.modified || []).forEach(x => { if (x.k === 'i:' + id && !x.f.includes('passwordMissing')) { x.f.push('passwordMissing'); x.a.passwordMissing = undefined; } });
  });

  const undo = snapshot(d, w);
  AX.applyDiff(d, w, 'acc');
  if (Array.isArray(d.users)) d.users = d.users.map(strip);
  sortAudit();

  db.exec('BEGIN');
  try {
    Object.keys(removed).forEach(k => removed[k].forEach(id => bridge.deleteRecord(k, id)));
    Object.keys(touched).forEach(k => {
      const arr = Array.isArray(d[k]) ? d[k] : [];
      const byId = new Map(arr.map(r => [String(r.id), r]));
      touched[k].forEach(id => {
        if (removed[k] && removed[k].has(id)) return;
        const rec = byId.get(id); if (!rec) return;
        if (k === 'users') {
          const keep = pwById[id] || (db.prepare('SELECT password FROM users WHERE id = ?').get(id) || {}).password;
          bridge.upsertRecord('users', Object.assign({}, rec, { password: keep }));
        } else bridge.upsertRecord(k, rec);
      });
    });
    Object.keys(w.sets).forEach(k => bridge.setSetting(k, d.settings[k]));
    Object.keys(w.keys).forEach(k => bridge.setSetting(k, d.settings[k]));
    if (w.counters && w.counters.a) Object.keys(w.counters.a).forEach(n => bridge.setCounter(n, d.counters[n]));
    if (Array.isArray(d.auditLog) && d.auditLog.length > AUDIT_MAX) { d.auditLog.length = AUDIT_MAX; bridge.trimAudit(AUDIT_MAX); }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    /* C2 · nothing stays in memory that the database did not take */
    try { undo(); } catch (x) { console.error('[ops] undo failed, reloading', x.message); load(); }
    console.error('[ops] not saved:', e.message);
    if (/constraint|cannot be bound|datatype mismatch/i.test(String(e.message))) throw new Refused('db_rejected', 'السيرفر محفظش التعديل: ' + String(e.message).slice(0, 140));
    throw e;
  }
  /* 4.20 · a password the admin changed signs that user out everywhere */
  const changedPw = Object.keys(pwById).filter(id => !(w.cols.users.added || []).some(r => r && String(r.id) === id));
  if (changedPw.length) { const auth = require('./auth'); changedPw.forEach(id => auth.dropUserSessions(id)); }
  dirty = true;
  return { users: Object.keys(pwById).length, renumbered };
}

/* memory as it was before a change — cheap: only the touched records are copied */
function snapshot(d, w) {
  const cols = {}, sets = {}, keys = {};
  const st = d.settings || (d.settings = {});
  /* the old array is kept as is (applyDiff builds a new one); only the records it edits in place are copied */
  Object.keys(w.cols || {}).forEach(k => {
    const arr = d[k], saved = [];
    if (Array.isArray(arr)) {
      const mod = new Set(((w.cols[k] || {}).modified || []).map(x => x.k));
      if (mod.size) for (const r of arr) if (r && r.id != null && mod.has('i:' + r.id)) saved.push([r, AX.clone(r)]);
    }
    cols[k] = { arr, saved };
  });
  Object.keys(w.sets || {}).forEach(k => { sets[k] = { had: own(st, k), v: AX.clone(st[k]) }; });
  Object.keys(w.keys || {}).forEach(k => { keys[k] = { had: own(st, k), v: AX.clone(st[k]) }; });
  const counters = AX.clone(d.counters || {}), users = d.users, auditLog = d.auditLog;
  return function undo() {
    Object.keys(cols).forEach(k => {
      cols[k].saved.forEach(([obj, copy]) => { Object.keys(obj).forEach(f => { delete obj[f]; }); Object.assign(obj, copy); });
      d[k] = cols[k].arr;
    });
    [sets, keys].forEach(g => Object.keys(g).forEach(k => { if (g[k].had) d.settings[k] = g[k].v; else delete d.settings[k]; }));
    d.counters = counters;
    if (!cols.users) d.users = users;
    if (!cols.auditLog) d.auditLog = auditLog;
  };
}

/* ── I14 · restore: validated first; the admin doing it always keeps his login ── */
function restore(blob, me) {
  const auth = require('./auth');
  const current = { users: (data().users || []).map(strip), hashOf: id => auth.storedHash(id) };
  const meNow = me ? Object.assign({}, user(me.id) || me) : null;
  const r = integrity.prepareRestore(blob, current, meNow, auth.isHash, auth.hashPassword);
  if (r.problems.length) return r;
  full(r.blob);
  if (r.usersWithoutPassword.length) console.warn('[restore] users without a password (switched off until the admin sets one):', r.usersWithoutPassword.map(x => x.username).join(', '));
  return r;
}

/* ═════ backups ═════ */
const BK_DIR = path.join(DATA_DIR, 'backups');
const KEEP_DAYS = 30;
let dirty = true;
function today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function gzBlob() {
  const blob = Object.assign({}, data(), { __exportedAt: new Date().toISOString(), __app: 'ERP' });
  return zlib.gzipSync(Buffer.from(JSON.stringify(blob)), { level: 9 });
}
function listBackups() {
  if (!fs.existsSync(BK_DIR)) return [];
  return fs.readdirSync(BK_DIR).filter(f => /^erp-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort().reverse()
    .map(f => { const st = fs.statSync(path.join(BK_DIR, f)); return { file: f, size: st.size, at: st.mtimeMs }; });
}
function backupPath(file) {
  if (!/^erp-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(String(file || ''))) return null;
  const p = path.join(BK_DIR, file);
  return fs.existsSync(p) ? p : null;
}
function writeDaily(force) {
  if (!fs.existsSync(BK_DIR)) fs.mkdirSync(BK_DIR, { recursive: true });
  const file = 'erp-' + today() + '.json.gz', p = path.join(BK_DIR, file);
  if (!force && fs.existsSync(p) && !dirty) return { file, skipped: true };
  const gz = gzBlob();
  fs.writeFileSync(p + '.tmp', gz); fs.renameSync(p + '.tmp', p);
  dirty = false;
  /* keep the last KEEP_DAYS days */
  listBackups().slice(KEEP_DAYS).forEach(b => { try { fs.unlinkSync(path.join(BK_DIR, b.file)); } catch (_) {} });
  return { file, size: gz.length };
}
/* Telegram: set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in the server's
   environment (Railway → Variables). Nothing is sent when they are missing. */
function telegramReady() { return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID); }
let lastTelegram = { at: 0, ok: null, error: '' };
async function sendTelegram(note) {
  if (!telegramReady()) return { ok: false, error: 'not_configured' };
  const r = writeDaily(true);
  const p = path.join(BK_DIR, r.file);
  const base = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
  const fd = new FormData();
  fd.append('chat_id', process.env.TELEGRAM_CHAT_ID);
  fd.append('caption', '📦 نسخة احتياطية' + (((data() || {}).settings || {}).companyName ? ' — ' + data().settings.companyName : '') + '\n' + r.file + (note ? '\n' + note : ''));
  fd.append('document', new Blob([fs.readFileSync(p)], { type: 'application/gzip' }), r.file);
  try {
    const res = await fetch(base + '/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendDocument', { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
    const j = await res.json().catch(() => ({}));
    lastTelegram = { at: Date.now(), ok: !!j.ok, error: j.ok ? '' : (j.description || ('HTTP ' + res.status)) };
  } catch (e) { lastTelegram = { at: Date.now(), ok: false, error: e.message }; }
  return lastTelegram;
}
function telegramStatus() { return Object.assign({ configured: telegramReady() }, lastTelegram); }
/* once a day (and on start): file + Telegram */
const TG_MARK = () => path.join(BK_DIR, '.telegram-day');
async function daily() {
  try {
    const t = today();
    writeDaily(false);
    if (telegramReady()) {
      let last = ''; try { last = fs.readFileSync(TG_MARK(), 'utf8').trim(); } catch (_) {}
      if (last !== t) { const r = await sendTelegram(); if (r.ok) fs.writeFileSync(TG_MARK(), t); }
    }
  } catch (e) { console.error('[backup]', e.message); }
}
function markDirty() { dirty = true; }

module.exports = { load, data, publicData, user, userByName, full, restore, apply, Refused, listBackups, backupPath, writeDaily, gzBlob, sendTelegram, telegramStatus, daily, markDirty };

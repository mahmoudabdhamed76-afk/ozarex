'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · الفروع (4.32 · المرحلة 1) — one database file per branch
   ------------------------------------------------------------------
   · «الفرع الأساسي» (id 'main') IS the existing erp.db — untouched: same
     file, same records, same balances, same behaviour.
   · Every other branch has its own file DATA_DIR/branches/<id>.db with the
     same tables: its own stock, customers, suppliers, invoices, issuances,
     payments, expenses, cash, counters (own numbering) and audit log.
     A branch's records can never show up in another branch — they are
     not even in the same file.
   · Shared by the whole company (kept in the main file only): users and
     their passwords / sessions, the company settings (name, logo,
     currency, rules, the sections lock). A branch shows them in memory.
   · Who may open which branch: admin → all; anyone else → user.branches
     (set by the admin in «المستخدمين»); a user who was never given a list
     keeps the main branch only — exactly what he had before.
════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, DATA_DIR, BRANCH_DIR, openDb } = require('../db');
const bridge = require('./bridge');
const store = require('./store');

const ID_RE = /^b_[a-z0-9]{6,24}$/;
const stores = new Map([['main', store]]);

function row(r) {
  if (!r) return null;
  let extra; try { extra = r.data ? JSON.parse(r.data) || {} : {}; } catch (_) { extra = {}; }
  return { id: r.id, name: r.name, code: r.code || '', active: !!r.active, sort: Number(r.sort) || 0, main: r.id === 'main', createdAt: r.created_at, color: extra.color || '' };
}
function list() { return db.prepare('SELECT * FROM branches ORDER BY sort, created_at, id').all().map(row); }
function get(id) { return row(db.prepare('SELECT * FROM branches WHERE id = ?').get(String(id || ''))); }

/* what a branch shows from the main file (in memory only) */
function shared() {
  const m = store.data();
  const st = {}; Object.keys(m.settings || {}).forEach(k => { if (!store.isBranchKey(k)) st[k] = m.settings[k]; });
  return { users: m.users || [], settings: st };
}

/* the store of one branch (opened on first use) */
function storeOf(id) {
  id = String(id || 'main');
  if (stores.has(id)) return stores.get(id);
  if (!ID_RE.test(id) || !get(id)) return null;
  if (!fs.existsSync(BRANCH_DIR)) fs.mkdirSync(BRANCH_DIR, { recursive: true });
  const file = path.join(BRANCH_DIR, id + '.db');
  const d = openDb(file);
  const st = store.makeStore({ id, db: d, bridge: bridge.makeBridge(d), main: false,
    bkDir: path.join(DATA_DIR, 'backups', 'branches', id), label: () => (get(id) || {}).name || id, shared });
  stores.set(id, st);
  return st;
}
/* the company's users or shared settings changed in main → every open branch shows the new ones */
function refreshOverlays() { stores.forEach((st, id) => { if (id !== 'main') st.overlay(); }); }

/* ── who may open what ── */
function idsFor(u) {
  if (!u) return [];
  const active = list().filter(b => b.active);
  if (u.role === 'admin') return active.map(b => b.id);
  const mine = Array.isArray(u.branches) ? u.branches.map(String) : ['main'];
  return active.filter(b => mine.includes(b.id)).map(b => b.id);
}
function canUse(u, id) { return idsFor(u).includes(String(id || 'main')); }
function visible(u) { const ids = idsFor(u); const all = list(); return (u && u.role === 'admin') ? all : all.filter(b => ids.includes(b.id)); }

/* ── managing the list (admin) ── */
class BranchError extends Error { constructor(code, msg, status) { super(msg); this.code = code; this.status = status || 400; } }
function cleanName(v) { const s = String(v == null ? '' : v).replace(/[<>"'`]/g, '').trim(); return s.slice(0, 60); }
function cleanCode(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9؀-ۿ]/g, '').slice(0, 4).toUpperCase(); }
function create(b) {
  const name = cleanName(b && b.name);
  if (!name) throw new BranchError('bad_name', 'اكتب اسم الفرع');
  if (list().some(x => x.name === name)) throw new BranchError('dup_name', 'في فرع بنفس الاسم');
  const id = 'b_' + crypto.randomBytes(5).toString('hex');
  const sort = list().reduce((m, x) => Math.max(m, x.sort), 0) + 1;
  db.prepare('INSERT INTO branches (id, name, code, active, sort, data) VALUES (?, ?, ?, 1, ?, ?)').run(id, name, cleanCode(b && b.code), sort, JSON.stringify({ color: String((b && b.color) || '').slice(0, 16) }));
  storeOf(id);                                        // its file is made now, empty
  return get(id);
}
function update(id, b) {
  const cur = get(id); if (!cur) throw new BranchError('not_found', 'الفرع مش موجود', 404);
  const next = { name: cur.name, code: cur.code, active: cur.active, sort: cur.sort, color: cur.color };
  if (b && b.name !== undefined) { next.name = cleanName(b.name); if (!next.name) throw new BranchError('bad_name', 'اكتب اسم الفرع'); if (list().some(x => x.id !== id && x.name === next.name)) throw new BranchError('dup_name', 'في فرع بنفس الاسم'); }
  if (b && b.code !== undefined) next.code = cleanCode(b.code);
  if (b && b.sort !== undefined && Number.isFinite(Number(b.sort))) next.sort = Number(b.sort);
  if (b && b.color !== undefined) next.color = String(b.color || '').slice(0, 16);
  if (b && b.active !== undefined) {
    if (id === 'main' && !b.active) throw new BranchError('main_always', 'الفرع الأساسي مينفعش يتقفل');
    next.active = !!b.active;
  }
  db.prepare('UPDATE branches SET name = ?, code = ?, active = ?, sort = ?, data = ? WHERE id = ?').run(next.name, next.code, next.active ? 1 : 0, next.sort, JSON.stringify({ color: next.color }), id);
  return get(id);
}
/* (no delete on purpose: a branch with records is switched off, never wiped) */

/* ── a change sent to a branch: the company part (users, shared settings) goes to main ── */
function split(w) {
  const po = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  w = { cols: po(w && w.cols), sets: po(w && w.sets), keys: po(w && w.keys), counters: (w && w.counters) || null };
  const sh = { cols: {}, sets: {}, keys: {}, counters: null }, loc = { cols: Object.assign({}, (w && w.cols) || {}), sets: {}, keys: {}, counters: (w && w.counters) || null };
  if (loc.cols.users) { sh.cols.users = loc.cols.users; delete loc.cols.users; }
  ['sets', 'keys'].forEach(g => Object.keys((w && w[g]) || {}).forEach(k => { (store.isBranchKey(k) ? loc : sh)[g][k] = w[g][k]; }));
  const has = o => Object.keys(o.cols).length || Object.keys(o.sets).length || Object.keys(o.keys).length;
  return { shared: has(sh) ? sh : null, local: (has(loc) || (loc.counters && loc.counters.a && Object.keys(loc.counters.a).length)) ? loc : null };
}
/* does a change touch what branches show from main? */
function touchesShared(w) {
  if (!w) return false;
  if (w.cols && w.cols.users) return true;
  return ['sets', 'keys'].some(g => Object.keys(w[g] || {}).some(k => !store.isBranchKey(k)));
}

/* every branch store (for the daily backup), opened if needed */
function allStores() { return list().filter(b => b.active || b.main).map(b => storeOf(b.id)).filter(Boolean); }

module.exports = { list, get, storeOf, refreshOverlays, idsFor, canUse, visible, create, update, split, touchesShared, allStores, BranchError, ID_RE };

'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · audit (Phase 2 · C3) — the audit log is written by the SERVER.
   · One entry per record that a change really added / edited / deleted,
     built from the server's own data (before → after), with the signed-in
     user from the session — never what a device claims.
   · Same shape the «سجل التعديلات» page already reads (old entries stay
     readable): id, timestamp, userId, userName, userRole, operation, table,
     recordId, recordLabel, before, after, reason, suspicionLevel/Flags.
   · Append-only: written in the same transaction as the change, never
     trimmed, never deleted through the API (store.js refuses it).
   · A device may still send a typed «reason» (old and new clients do):
     it is kept as text on the matching server entry — nothing else is taken.
════════════════════════════════════════════════════════════════════ */
const path = require('node:path');
const crypto = require('node:crypto');
const AX = require(process.env.PUBLIC_DIR ? path.join(process.env.PUBLIC_DIR, 'js', 'axcore.js') : path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'axcore.js'));

/* never written into the log in clear */
const MASK_FIELDS = new Set(['password', 'passwordHash', 'token']);
const MASK_KEYS = new Set(['_auditLock', '_portal']);
/* settings that are personal screen preferences — not business changes */
const QUIET_KEYS = new Set(['tickerSpeed', 'tickerEvents', 'tickerPages', 'soundEnabled', 'reciterVolume', 'reciterEnabled', 'dailyBackupReminder', 'lastBackupReminderDate']);

function isEmpty(w) {
  const has = g => Object.keys(g || {}).some(k => { const cd = g[k]; return cd && ((cd.added || []).length || (cd.removed || []).length || (cd.modified || []).length); });
  return !has(w.cols) && !has(w.sets) && !Object.keys(w.keys || {}).length && !(w.counters && w.counters.a && Object.keys(w.counters.a).length);
}

/* "table|recordId|operation" → reason typed on the device */
function reasonsFrom(cd) {
  const out = new Map();
  ((cd && cd.added) || []).forEach(e => {
    if (!e || typeof e !== 'object' || !e.reason) return;
    out.set([e.table, e.recordId, e.operation].join('|'), String(e.reason).slice(0, 500));
  });
  return out;
}

function clean(o) {
  if (!o || typeof o !== 'object') return o === undefined ? null : o;
  const c = AX.clone(o);
  if (c && typeof c === 'object' && !Array.isArray(c)) Object.keys(c).forEach(k => { if (MASK_FIELDS.has(k)) c[k] = '•••'; });
  return c;
}
function labelOf(table, r) {
  r = r || {};
  const no = r.number != null && r.number !== '' ? '#' + r.number : '';
  const who = r.customerName || r.supplierName || '';
  const name = r.name || r.title || r.description || r.username || '';
  return [no, name || who].filter(Boolean).join(' - ').slice(0, 160) || String(r.id || '');
}

/* the same rules the browser used (analyzeSuspicion), run on the server */
function suspicion(entry, recent) {
  const flags = [], op = entry.operation, t = entry.table, b = entry.before || {}, a = entry.after || {};
  const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (op === 'delete' && (t === 'invoices' || t === 'issuances')) flags.push({ level: 'high', reason: 'حذف فاتورة' });
  if (t === 'invoices' && (a.discount || b.discount)) {
    const pct = ((a.discount || b.discount || 0) / (a.total || b.total || 1)) * 100;
    if (pct >= 20) flags.push({ level: 'high', reason: `خصم كبير ${pct.toFixed(1)}%` });
    else if (pct >= 10) flags.push({ level: 'medium', reason: `خصم متوسط ${pct.toFixed(1)}%` });
  }
  if (op === 'edit' && (t === 'products' || t === 'invoices' || t === 'issuances')) {
    const o = b.price || b.unitPrice || b.total, n = a.price || a.unitPrice || a.total;
    if (o && n && o > 0) { const ch = Math.abs((n - o) / o) * 100; if (ch >= 50) flags.push({ level: 'high', reason: `تغيير سعر ${ch.toFixed(0)}%` }); else if (ch >= 30) flags.push({ level: 'medium', reason: `تغيير سعر ${ch.toFixed(0)}%` }); }
  }
  if (op === 'edit' && t === 'customers' && b.balance && a.balance === 0 && b.balance > 1000) flags.push({ level: 'high', reason: `إزالة مديونية كاملة ${fmt(b.balance)}` });
  if (op === 'add' && t === 'payments' && (a.amount || 0) > 50000) flags.push({ level: 'medium', reason: `سداد كبير ${fmt(a.amount)}` });
  const h = new Date(entry.timestamp).getHours();
  if (h >= 22 || h < 6) flags.push({ level: 'medium', reason: 'عملية خارج ساعات العمل' });
  const n = (recent || []).filter(e => e && e.userId === entry.userId && Number(e.timestamp) >= entry.timestamp - 3600e3).length;
  if (n >= 30) flags.push({ level: 'high', reason: `${n} عملية في ساعة واحدة` }); else if (n >= 20) flags.push({ level: 'medium', reason: `${n} عملية في ساعة واحدة` });
  if (op === 'edit' && ['invoices', 'issuances', 'payments', 'products', 'customers'].includes(t) && !entry.reason) flags.push({ level: 'low', reason: 'تعديل بدون سبب موثق' });
  if (!flags.length) return { level: 'normal', flags };
  return { level: flags.some(f => f.level === 'high') ? 'high' : flags.some(f => f.level === 'medium') ? 'medium' : 'low', flags };
}

function base(u, now, seq) {
  return { id: 'srv_' + now.toString(36) + '_' + seq + '_' + crypto.randomUUID().slice(0, 8), timestamp: now, userId: u && u.id, userName: (u && u.name) || '', userRole: (u && u.role) || '', source: 'server', device: 'server', ip: '' };
}
function finish(e, recent) { const s = suspicion(e, recent); e.suspicionLevel = s.level; e.suspicionFlags = s.flags; return e; }

/* → audit entries for an accepted change (call BEFORE it is applied: reads the "before" from d) */
function entriesFor(d, w, u, opts) {
  opts = opts || {};
  const reasons = opts.reasons || new Map(), now = Date.now(), out = [];
  let seq = 0;
  const push = (op, table, id, label, before, after) => {
    const e = Object.assign(base(u, now, seq++), { operation: op, table, recordId: id == null ? null : String(id), recordLabel: label, before: before == null ? null : before, after: after == null ? null : after });
    e.reason = reasons.get([table, e.recordId, op].join('|')) || '';
    out.push(finish(e, (opts.recent || []).concat(out)));
  };
  const df = AX.enrich(d, w);
  Object.keys(df.cols).forEach(t => {
    const cd = df.cols[t];
    cd.added.forEach(r => push('add', t, r.id, labelOf(t, r), null, clean(r)));
    cd.modified.forEach(x => push('edit', t, (x.ra || x.rb || {}).id, labelOf(t, x.ra || x.rb), clean(x.b), clean(x.a)));
    cd.removed.forEach(r => push('delete', t, r.id, labelOf(t, r), clean(r), null));
  });
  /* passwords set by the admin (the field itself is never logged) */
  (opts.passwords || []).forEach(id => {
    if (!(w.cols.users && (w.cols.users.added || []).some(r => String(r.id) === String(id)))) {
      const usr = (d.users || []).find(x => String(x.id) === String(id)) || {};
      push('edit', 'users', id, labelOf('users', usr), { password: '•••' }, { password: '(اتغيّرت)' });
    }
  });
  Object.keys(df.sets).forEach(k => {
    const cd = df.sets[k], t = 'settings.' + k, mask = MASK_KEYS.has(k);
    cd.added.forEach(r => push('add', t, r.id, labelOf(t, r), null, mask ? '•••' : clean(r)));
    cd.modified.forEach(x => push('edit', t, (x.ra || x.rb || {}).id, labelOf(t, x.ra || x.rb), mask ? '•••' : clean(x.b), mask ? '•••' : clean(x.a)));
    cd.removed.forEach(r => push('delete', t, r.id, labelOf(t, r), mask ? '•••' : clean(r), null));
  });
  Object.keys(df.keys).forEach(k => {
    if (QUIET_KEYS.has(k)) return;
    const mask = MASK_KEYS.has(k);
    push('edit', 'settings', k, k, { [k]: mask ? '•••' : clean(df.keys[k].b) }, { [k]: mask ? '•••' : clean(df.keys[k].a) });
  });
  return out;
}

/* a server event that is not a record change (restore, reset, password change) */
function event(u, e, recent) {
  const now = Date.now();
  return finish(Object.assign(base(u, now, 0), { operation: e.operation, table: e.table, recordId: e.recordId || null, recordLabel: e.recordLabel || '', before: e.before || null, after: e.after || null, reason: e.reason || '' }), recent);
}

module.exports = { isEmpty, reasonsFrom, entriesFor, event, suspicion, MASK_KEYS };

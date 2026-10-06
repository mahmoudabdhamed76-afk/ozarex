'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · integrity (Phase 1) — checks a change BEFORE it touches memory or
   the database, so the server never answers «ok» for something it did
   not really save.
   · C2  required fields (the same NOT NULL columns the database has)
   · I10 a «new» record whose id already exists is refused, never overwrites
   · C5  invoice / issuance / purchase numbers stay unique: a clash gets the
         next free number from the server (the record is kept, not lost)
   · I14 a restore never leaves the system without a working admin and never
         gives employees a random password silently
   No schema change, no new endpoints, same wire format.
════════════════════════════════════════════════════════════════════ */
const path = require('node:path');
const AX = require(process.env.PUBLIC_DIR ? path.join(process.env.PUBLIC_DIR, 'js', 'axcore.js') : path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'axcore.js'));

/* fields the database refuses to store empty (NOT NULL without a default) */
const REQUIRED = {
  users: ['username', 'name'], customers: ['name'], suppliers: ['name'], products: ['name'], employees: ['name'],
  payments: ['date'], supplierPayments: ['date'], expenses: ['date'], stockMoves: ['date'], bankTransfers: ['date'], salaryRuns: ['date']
};
const COL_AR = {
  users: 'المستخدم', customers: 'العميل', suppliers: 'المورد', products: 'الصنف', employees: 'الموظف', payments: 'التحصيل',
  supplierPayments: 'دفعة المورد', expenses: 'المصروف', stockMoves: 'حركة المخزن', bankTransfers: 'التحويل', salaryRuns: 'المرتب',
  invoices: 'الفاتورة', issuances: 'الصرف', notes: 'الملاحظة'
};
const FIELD_AR = { name: 'الاسم', username: 'اسم المستخدم', date: 'التاريخ', id: 'رقم السجل', password: 'كلمة السر' };
/* numbered documents: collection → counter name (+ which records are numbered) */
const NUMBERED = [
  { col: 'invoices', counter: 'invoice', is: () => true },
  { col: 'issuances', counter: 'issuance', is: () => true },
  { col: 'expenses', counter: 'purchase', is: r => !!r && r.kind === 'purchase' }
];

class IntegrityError extends Error {
  constructor(code, msg, extra) { super(msg); this.code = code; this.extra = extra || {}; }
}
function blank(v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === ''); }
const colName = k => COL_AR[k] || k;

/* → null when fine, otherwise a short Arabic reason */
function problemOf(k, r, { isNew } = {}) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'سجل مش صالح';
  if (blank(r.id)) return FIELD_AR.id + ' مطلوب';
  for (const f of REQUIRED[k] || []) if (blank(r[f])) return (FIELD_AR[f] || f) + ' مطلوب';
  if (k === 'invoices' || k === 'issuances') {
    if (r.items !== undefined && r.items !== null && !Array.isArray(r.items)) return 'الأصناف لازم تكون قايمة';
    if (Array.isArray(r.items) && r.items.some(it => !it || typeof it !== 'object' || Array.isArray(it))) return 'صنف مش صالح جوه ' + colName(k);
  }
  if (k === 'users' && isNew && blank(r.password)) return FIELD_AR.password + ' مطلوبة للمستخدم الجديد';
  return null;
}

/* what each touched record will look like after the change (memory untouched) */
function preview(d, w) {
  const out = {};
  Object.keys(w.cols || {}).forEach(k => {
    if (k === 'auditLog') return;
    const cd = w.cols[k], list = [];
    const cur = (cd.modified || []).length ? AX.idx(Array.isArray(d[k]) ? d[k] : []) : {};
    (cd.added || []).forEach(r => list.push({ rec: r, isNew: true }));
    (cd.modified || []).forEach(x => {
      const c = cur[x.k]; if (!c) return;                                   // edit of a record deleted meanwhile → ignored, as before
      list.push({ rec: AX.applyCol([AX.clone(c)], { added: [], removed: [], modified: [x] }, 'acc')[0], isNew: false });
    });
    out[k] = list;
  });
  return out;
}

/* ── I10 · ids: a «new» record may not reuse an existing id ── */
function checkIds(d, w) {
  const groups = [['cols', w.cols || {}, k => d[k]], ['sets', w.sets || {}, k => (d.settings || {})[k]]];
  for (const [kind, g, arrOf] of groups) {
    Object.keys(g).forEach(k => {
      if (kind === 'cols' && k === 'auditLog') return;
      const cd = g[k]; if (!(cd.added || []).length) return;
      const arr = arrOf(k), cur = AX.idx(Array.isArray(arr) ? arr : []);
      const removed = new Set((cd.removed || []).map(r => typeof r === 'string' ? r : AX.keyOf(r)));
      const seen = new Set(), keep = [];
      (cd.added || []).forEach(r => {
        const key = AX.keyOf(r);
        if (seen.has(key)) throw new IntegrityError('duplicate_id', 'نفس رقم السجل اتبعت مرتين في ' + colName(k), { col: k, id: r && r.id });
        seen.add(key);
        const old = cur[key];
        if (old && !removed.has(key)) {
          if (!AX.fieldsChanged(old, r).length) return;                       // the same record sent again (a retry) → nothing to do
          throw new IntegrityError('duplicate_id', 'رقم السجل ده مستخدم لسجل تاني في ' + colName(k) + ' — البيانات اتحدّثت من السيرفر، اعمله تاني', { col: k, id: r.id });
        }
        keep.push(r);
      });
      cd.added = keep;
    });
  }
}

/* ── C2 · required fields + unique user names ── */
function checkRequired(d, w) {
  const pv = preview(d, w);
  Object.keys(pv).forEach(k => pv[k].forEach(({ rec, isNew }) => {
    const p = problemOf(k, rec, { isNew });
    if (p) throw new IntegrityError('invalid_record', 'مش هينفع يتحفظ ' + colName(k) + ': ' + p, { col: k, id: rec && rec.id, problem: p });
  }));
  if (pv.users) {
    const removed = new Set(((w.cols.users || {}).removed || []).map(String));
    const final = new Map();
    (d.users || []).forEach(u => { if (!removed.has('i:' + u.id)) final.set(String(u.id), u); });
    pv.users.forEach(({ rec }) => final.set(String(rec.id), rec));
    const names = new Map();
    for (const u of final.values()) {
      const n = String(u.username || '').trim().toLowerCase();
      if (names.has(n)) throw new IntegrityError('invalid_record', 'اسم المستخدم «' + u.username + '» مستخدم قبل كده', { col: 'users', id: u.id, problem: 'username_taken' });
      names.set(n, u.id);
    }
  }
}

/* ── C5 · numbers: a clash gets the next free number (server is the referee) ── */
function numOf(v) { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) && n > 0 ? n : null; }
function assignNumbers(d, w) {
  const changes = [];
  const counters = d.counters || {};
  NUMBERED.forEach(spec => {
    const cd = (w.cols || {})[spec.col]; if (!cd) return;
    if (!(cd.added || []).some(r => spec.is(r) && numOf(r.number) !== null) && !(cd.modified || []).some(x => x.f.indexOf('number') >= 0)) return;
    const removed = new Set((cd.removed || []).map(String));
    const taken = new Map();                                                 // number → id
    (Array.isArray(d[spec.col]) ? d[spec.col] : []).forEach(r => {
      if (!spec.is(r) || removed.has('i:' + r.id)) return;
      const n = numOf(r.number); if (n !== null && !taken.has(n)) taken.set(n, String(r.id));
    });
    let maxTaken = 0; for (const n of taken.keys()) if (n > maxTaken) maxTaken = n;
    const touchesNumber = (cd.modified || []).some(x => x.f.indexOf('number') >= 0);
    const cur = touchesNumber ? AX.idx(d[spec.col] || []) : {};
    const next = () => {
      let n = Math.max(Number(counters[spec.counter]) || 0, Number(((w.counters || {}).a || {})[spec.counter]) || 0, maxTaken) + 1;
      while (taken.has(n)) n++;
      return n;
    };
    const claim = (id, value, setter) => {
      const n = numOf(value); if (n === null) return;
      const owner = taken.get(n);
      if (owner !== undefined && owner !== String(id)) {
        const to = next();
        setter(typeof value === 'string' ? String(to) : to);
        taken.set(to, String(id)); if (to > maxTaken) maxTaken = to;
        changes.push({ col: spec.col, id: String(id), from: value, to });
      } else { taken.set(n, String(id)); if (n > maxTaken) maxTaken = n; }
    };
    (cd.added || []).forEach(r => { if (spec.is(r)) claim(r.id, r.number, v => { r.renumberedFrom = r.number; r.number = v; }); });
    (cd.modified || []).forEach(x => {
      if (x.f.indexOf('number') < 0 || !x.k.startsWith('i:')) return;
      const id = x.k.slice(2), base = cur[x.k] || {};
      if (!spec.is(Object.assign({}, base, x.a))) return;
      claim(id, x.a.number, v => { x.a.number = v; });
    });
  });
  if (!changes.length) return changes;
  /* the same change may point at a renumbered invoice (an issuance made with its invoice, a consolidated invoice…) */
  const byId = new Map(changes.filter(c => c.col === 'invoices').map(c => [c.id, c]));
  const fix = (o, idF, numF) => { if (o && byId.has(String(o[idF])) && numOf(o[numF]) === numOf(byId.get(String(o[idF])).from)) o[numF] = byId.get(String(o[idF])).to; };
  Object.keys(w.cols || {}).forEach(k => {
    (w.cols[k].added || []).forEach(r => { fix(r, 'invoiceId', 'invoiceNumber'); fix(r, 'consolidatedIntoId', 'consolidatedIntoNumber'); });
    (w.cols[k].modified || []).forEach(x => { fix(x.a, 'invoiceId', 'invoiceNumber'); fix(x.a, 'consolidatedIntoId', 'consolidatedIntoNumber'); });
  });
  /* the counters never fall behind a number the server handed out */
  w.counters = w.counters && typeof w.counters === 'object' ? w.counters : { a: {} };
  w.counters.a = w.counters.a && typeof w.counters.a === 'object' ? w.counters.a : {};
  changes.forEach(c => {
    const name = NUMBERED.find(s => s.col === c.col).counter;
    w.counters.a[name] = Math.max(Number(w.counters.a[name]) || 0, c.to);
  });
  return changes;
}

/* ── I14 · restore ──────────────────────────────────────────────
   blob     what the admin uploaded
   current  { users: [records without password], hashOf(id) → stored hash }
   me       the admin doing the restore (he must be able to log in afterwards)
   → { blob, problems, usersWithoutPassword, adminKept } */
const RESTORE_COLS = Object.keys(REQUIRED).concat(['invoices', 'issuances', 'notes']);
function prepareRestore(blob, current, me, isHash, hashPassword) {
  const problems = [];
  RESTORE_COLS.forEach(k => {
    if (blob[k] === undefined) return;
    if (!Array.isArray(blob[k])) { problems.push({ col: k, problem: 'مش قايمة' }); return; }
    const seen = new Set();
    blob[k].forEach((r, i) => {
      const p = problemOf(k, r, {});
      if (p) problems.push({ col: k, index: i, id: r && r.id, problem: p });
      else if (seen.has(String(r.id))) problems.push({ col: k, index: i, id: r.id, problem: 'رقم السجل متكرر' });
      else seen.add(String(r.id));
    });
  });
  if (problems.length) return { blob, problems, usersWithoutPassword: [], adminKept: null };

  const out = Object.assign({}, blob);
  const curUsers = current.users || [];
  /* a file with no users keeps today's users as they are */
  if (!Array.isArray(blob.users) || !blob.users.length) {
    out.users = curUsers.map(u => Object.assign({}, u, { password: current.hashOf(u.id) }));
    return { blob: out, problems, usersWithoutPassword: [], adminKept: me && me.username };
  }
  const curById = new Map(curUsers.map(u => [String(u.id), u]));
  const curByName = new Map(curUsers.map(u => [String(u.username || '').toLowerCase(), u]));
  const without = [];
  let users = blob.users.map(src => {
    const u = Object.assign({}, src);
    if (isHash(u.password)) return u;
    if (!blank(u.password)) return u;                                        // a plain password (very old exports) — hashed on import as before
    const same = curById.get(String(u.id)) || curByName.get(String(u.username || '').toLowerCase());
    const h = same && current.hashOf(same.id);
    if (h) { u.password = h; return u; }
    /* nobody knows this user's password: keep him, but switched off until the admin sets one (no silent random password) */
    u.password = hashPassword(require('node:crypto').randomBytes(24).toString('base64'));
    u.disabled = true; u.passwordMissing = true;
    without.push({ id: u.id, username: u.username, name: u.name });
    return u;
  });
  /* the admin who restores stays exactly able to log in */
  if (me) {
    const lc = String(me.username || '').toLowerCase();
    let mine = users.find(u => String(u.id) === String(me.id)) || users.find(u => String(u.username || '').toLowerCase() === lc);
    if (!mine) { mine = Object.assign({}, me); users.push(mine); }
    Object.assign(mine, { username: me.username, role: 'admin', password: current.hashOf(me.id) });
    delete mine.disabled; delete mine.passwordMissing;
    const wi = without.findIndex(x => String(x.id) === String(mine.id)); if (wi >= 0) without.splice(wi, 1);
    users = users.filter(u => u === mine || String(u.username || '').toLowerCase() !== lc);   // one login name, one person
  }
  out.users = users;
  return { blob: out, problems, usersWithoutPassword: without, adminKept: me && me.username };
}

module.exports = { IntegrityError, REQUIRED, problemOf, checkIds, checkRequired, assignNumbers, prepareRestore };

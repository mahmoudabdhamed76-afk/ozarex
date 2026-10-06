'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · permissions (Phase 2 · C1) — ONE place that decides what a user
   may read and change, on the server.

   page / feature  →  collections it reads  →  what it may change

   · A user's pages are the same list the browser uses (index.html
     PERMISSIONS + «المستخدمين» per-user pages) — tests keep the two equal.
   · Reads: GET /api/data sends only the collections (and settings keys)
     the user's pages need; everything else goes as an empty list, so
     the screens still open but never receive the hidden data.
   · Writes: /api/ops is refused (403 forbidden_page) for a collection,
     an action (add / edit / delete), a field or a settings key that none
     of the user's pages may change.
   · Admin: everything, unchanged.
   · The approval rules (store.js / axcore.js) still run after this —
     this only removes access, it never grants any.
════════════════════════════════════════════════════════════════════ */
const path = require('node:path');
const AX = require(process.env.PUBLIC_DIR ? path.join(process.env.PUBLIC_DIR, 'js', 'axcore.js') : path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'axcore.js'));

/* ── the pages a role gets when the admin did not choose them one by one (== index.html PERMISSIONS) ── */
const ROLE_PAGES = {
  admin: ['dashboard', 'customers', 'issuances', 'forecast', 'invoices', 'payments', 'aging', 'transfers', 'cheques', 'debts', 'suppliers', 'purchases', 'inventory', 'stock', 'expenses', 'reports', 'monthly', 'profit', 'aiassistant', 'approvals', 'requests', 'users', 'audit', 'security', 'settings'],
  accountant: ['dashboard', 'customers', 'issuances', 'forecast', 'invoices', 'payments', 'aging', 'transfers', 'cheques', 'debts', 'suppliers', 'purchases', 'expenses', 'reports', 'monthly', 'profit', 'aiassistant', 'approvals', 'requests'],
  sales: ['dashboard', 'customers', 'issuances', 'forecast', 'invoices', 'payments', 'aging', 'cheques', 'inventory', 'stock', 'aiassistant', 'approvals', 'requests']
};
const ADMIN_ONLY_PAGES = ['users', 'audit', 'security', 'settings'];
const ALWAYS_PAGES = ['approvals', 'requests', 'dashboard'];

/* every data collection the app has */
const COLLECTIONS = ['users', 'customers', 'products', 'invoices', 'payments', 'expenses', 'stockMoves', 'issuances', 'bankTransfers', 'suppliers', 'supplierPayments', 'notes', 'auditLog', 'employees', 'salaryRuns'];

/* fields a page may change on another module's records as a side effect of its own work
   (selling moves a balance and a stock quantity, collecting marks an invoice paid…) */
const SIDE = {
  customers: ['balance'],
  products: ['quantity'],
  invoices: ['paid', 'status', 'invoiceId', 'invoiceNumber', 'sourceIssuanceId', 'consolidatedIntoId', 'consolidatedIntoNumber', 'archived'],
  issuances: ['paid', 'status', 'invoiceId', 'invoiceNumber', 'sourceIssuanceId', 'archived'],
  payments: ['invoiceId', 'invoiceNumber']
};
/* a grant per collection: add / del / edit.rows ∈ false | 'purchase' (purchase rows only) | true ; edit.fields: true | [list] */
const FULL = { add: true, del: true, edit: { fields: true, rows: true } };
const PURCHASE_ROWS = { add: 'purchase', del: 'purchase', edit: { fields: true, rows: 'purchase' } };
const g = (add, del, fields) => ({ add: !!add, del: !!del, edit: fields ? { fields, rows: true } : null });

/* UI preferences any user may read and set (unchanged from before) */
const PREF_KEYS = ['tickerSpeed', 'tickerEvents', 'tickerPages', 'soundEnabled', 'reciterVolume', 'reciterEnabled', 'dailyBackupReminder', 'lastBackupReminderDate'];

/* ═══ THE MATRIX ═══
   read:     collections sent to the browser          readRows: row limits on what is sent
   write:    collection → grant                        keys / writeKeys: settings «_…» keys read / written
   costs:    sees purchase costs (products.cost, items[].cost)      directory: names of colleagues */
const SALES_READ = ['customers', 'products', 'invoices', 'issuances', 'payments'];
const POLICY = {
  dashboard: { read: [], keys: ['monthlyTarget'], writeKeys: ['monthlyTarget'] },
  approvals: { read: [], keys: ['_approvals'], writeKeys: ['_approvals'] },
  requests: { read: [], keys: ['_requests'], writeKeys: ['_requests'] },
  customers: { read: SALES_READ, write: { customers: FULL } },
  issuances: {
    read: SALES_READ.concat(['stockMoves']),
    write: { issuances: FULL, invoices: FULL, stockMoves: FULL, payments: g(1, 1, SIDE.payments), products: g(0, 0, SIDE.products), customers: g(1, 0, SIDE.customers) }
  },
  invoices: {
    read: SALES_READ.concat(['stockMoves']),
    write: { invoices: FULL, stockMoves: FULL, payments: g(1, 1, SIDE.payments), products: g(0, 0, SIDE.products), customers: g(1, 0, SIDE.customers),
      issuances: g(0, 0, SIDE.issuances.concat(['total', 'unitPrice'])) }
  },
  payments: {
    read: ['customers', 'invoices', 'issuances', 'payments', 'bankTransfers'], keys: ['_stmtWeek'], writeKeys: ['_stmtWeek'],
    write: { payments: FULL, customers: g(0, 0, SIDE.customers), invoices: g(0, 0, SIDE.invoices), issuances: g(0, 0, SIDE.issuances) }
  },
  aging: { read: ['customers', 'invoices', 'issuances', 'payments'], keys: ['_portal', '_stmtSent'], writeKeys: ['_portal', '_stmtSent'] },
  forecast: { read: SALES_READ, keys: ['_calls'], writeKeys: ['_calls'] },
  transfers: { read: ['bankTransfers', 'customers', 'invoices'], write: { bankTransfers: FULL } },
  cheques: {
    read: ['customers', 'suppliers', 'invoices', 'issuances', 'payments', 'supplierPayments'], keys: ['_cheques'], writeKeys: ['_cheques'],
    write: { payments: FULL, supplierPayments: g(1, 1, true), customers: g(0, 0, SIDE.customers), invoices: g(0, 0, SIDE.invoices), issuances: g(0, 0, SIDE.issuances) }
  },
  debts: {
    read: ['suppliers', 'supplierPayments', 'expenses', 'payments', 'bankTransfers'], keys: ['_debts', '_debtPlan'], writeKeys: ['_debts', '_debtPlan'],
    write: { supplierPayments: g(1, 1), expenses: g(1, 1) }
  },
  suppliers: { read: ['suppliers', 'supplierPayments', 'expenses', 'products'], readRows: { expenses: 'purchase' }, write: { suppliers: FULL, supplierPayments: FULL, expenses: PURCHASE_ROWS } },
  purchases: { read: ['suppliers', 'supplierPayments', 'expenses', 'products'], readRows: { expenses: 'purchase' }, write: { suppliers: FULL, supplierPayments: FULL, expenses: PURCHASE_ROWS }, costs: true },
  inventory: { read: ['products', 'stockMoves', 'suppliers', 'issuances'], write: { products: FULL, stockMoves: FULL }, costs: true },
  stock: {
    read: ['products', 'stockMoves', 'issuances', 'customers', 'suppliers', 'expenses'], readRows: { expenses: 'purchase' }, directory: true,
    keys: ['_stockCounts', '_custody', '_po', '_poLead', 'countBlind'], writeKeys: ['_stockCounts', '_custody', '_po', '_poLead', 'countBlind'],
    write: { products: FULL, stockMoves: FULL, expenses: g(1, 1) }, costs: true
  },
  expenses: { read: ['expenses', 'suppliers', 'employees', 'salaryRuns'], write: { expenses: FULL, employees: FULL, salaryRuns: FULL } },
  reports: { read: ['customers', 'products', 'invoices', 'issuances', 'payments', 'expenses', 'stockMoves', 'suppliers', 'supplierPayments', 'bankTransfers'], costs: true },
  monthly: { read: ['customers', 'products', 'invoices', 'issuances', 'payments', 'expenses', 'supplierPayments', 'bankTransfers'], keys: ['_closings', '_stmtWeek'], writeKeys: ['_stmtWeek'] },
  profit: { read: ['customers', 'products', 'invoices', 'issuances', 'expenses'], costs: true },
  aiassistant: { read: SALES_READ.concat(['stockMoves']), keys: ['_prospects'], writeKeys: ['_prospects'] }
};
/* every signed-in user: the shared notes + the UI preferences */
const COMMON = { read: ['notes'], write: { notes: FULL }, keys: PREF_KEYS, writeKeys: PREF_KEYS };

/* ── a user's pages (the same rule as userPages() in the browser) ── */
function pagesOf(u) {
  if (!u) return [];
  if (u.role === 'admin') return ROLE_PAGES.admin.slice();
  const base = Array.isArray(u.pages) ? u.pages : (ROLE_PAGES[u.role] || []);
  const out = base.filter(p => !ADMIN_ONLY_PAGES.includes(p) && POLICY[p]);
  ALWAYS_PAGES.forEach(p => { if (!out.includes(p)) out.unshift(p); });
  return out;
}

const rank = v => (v === true ? 2 : v === 'purchase' ? 1 : 0);
const wider = (a, b) => (rank(a) >= rank(b) ? a : b);
function mergeGrant(a, b) {
  if (!a) return { add: b.add || false, del: b.del || false, edit: b.edit ? { fields: b.edit.fields === true ? true : new Set(b.edit.fields), rows: b.edit.rows } : null };
  const out = { add: wider(a.add, b.add || false), del: wider(a.del, b.del || false), edit: a.edit };
  if (b.edit) {
    if (!out.edit) out.edit = { fields: b.edit.fields === true ? true : new Set(b.edit.fields), rows: b.edit.rows };
    else {
      out.edit = { fields: out.edit.fields === true || b.edit.fields === true ? true : new Set([...out.edit.fields, ...b.edit.fields]), rows: wider(out.edit.rows, b.edit.rows) };
    }
  }
  return out;
}

/* → the effective policy of one user (union of his pages) */
function policyFor(u) {
  const admin = !!u && u.role === 'admin';
  const pages = pagesOf(u);
  const p = { admin, pages, read: new Set(), rows: {}, write: {}, keys: new Set(), writeKeys: new Set(), costs: admin, directory: admin };
  if (admin) return p;
  [COMMON].concat(pages.map(x => POLICY[x])).forEach(pol => {
    (pol.read || []).forEach(c => {
      const lim = (pol.readRows || {})[c] || true;
      p.rows[c] = p.read.has(c) ? wider(p.rows[c], lim) : lim;
      p.read.add(c);
    });
    Object.keys(pol.write || {}).forEach(c => { p.write[c] = mergeGrant(p.write[c], pol.write[c]); });
    (pol.keys || []).forEach(k => p.keys.add(k));
    (pol.writeKeys || []).forEach(k => p.writeKeys.add(k));
    if (pol.costs) p.costs = true;
    if (pol.directory) p.directory = true;
  });
  return p;
}

/* ── READ: the dataset one user receives ── */
const SECRET_KEYS = ['_auditLock'];                             // admin only, always
function settingVisible(k, p) {
  if (p.admin) return true;
  if (SECRET_KEYS.includes(k)) return false;
  if (k.charAt(0) !== '_') return true;                           // company name, logo, currency, rules, closedUntil… (needed to work and print)
  return p.keys.has(k);                                           // «_…» lists: only the pages that use them (unknown ones: admin only)
}
const OWN_ROWS = { _approvals: 1, _requests: 1 };                 // a user sees his own requests only
function noCost(r) { if (!r || typeof r !== 'object') return r; const o = Object.assign({}, r); delete o.cost; if (Array.isArray(o.items)) o.items = o.items.map(it => { if (!it || typeof it !== 'object') return it; const x = Object.assign({}, it); delete x.cost; return x; }); return o; }

function filterData(d, u) {
  const p = policyFor(u);
  if (p.admin) return d;
  const out = {};
  COLLECTIONS.forEach(c => {
    if (c === 'users') return;
    let rows = p.read.has(c) && Array.isArray(d[c]) ? d[c] : [];
    if (p.rows[c] === 'purchase') rows = rows.filter(r => r && r.kind === 'purchase');
    if (!p.costs && (c === 'products' || c === 'invoices' || c === 'issuances')) rows = rows.map(noCost);
    if (c === 'employees' && !p.read.has(c) && p.directory) rows = (d.employees || []).map(e => ({ id: e.id, name: e.name }));
    out[c] = rows;
  });
  /* users: my own record; colleagues' names only for pages that need them (custody holders) */
  const me = (d.users || []).find(x => x.id === u.id);
  out.users = (d.users || []).filter(x => x.id === u.id || (p.directory && !x.disabled))
    .map(x => x.id === u.id ? Object.assign({}, x) : { id: x.id, name: x.name });
  if (!me) out.users.unshift({ id: u.id, username: u.username, name: u.name, role: u.role });
  const s = d.settings || {}, st = {};
  Object.keys(s).forEach(k => {
    if (!settingVisible(k, p)) return;
    st[k] = OWN_ROWS[k] && Array.isArray(s[k]) ? s[k].filter(r => r && r.by && r.by.id === u.id) : s[k];
  });
  out.settings = st;
  out.counters = d.counters;
  Object.keys(d).forEach(k => { if (!(k in out) && !COLLECTIONS.includes(k) && k !== 'settings') out[k] = Array.isArray(d[k]) ? [] : d[k]; });
  return out;
}

/* ── WRITE: refuse what none of the user's pages may change ── */
class Forbidden extends Error { constructor(msg, extra) { super(msg); this.code = 'forbidden_page'; this.extra = extra || {}; } }
const AR = { users: 'المستخدمين', customers: 'العملاء', products: 'الأصناف', invoices: 'الفواتير', payments: 'التحصيل', expenses: 'المصروفات', stockMoves: 'حركات المخزن',
  issuances: 'صرف الورق', bankTransfers: 'التحويلات', suppliers: 'الموردين', supplierPayments: 'مدفوعات الموردين', notes: 'الملاحظات', employees: 'الموظفين', salaryRuns: 'المرتبات' };
const deny = (what, extra) => { throw new Forbidden('مالكش صلاحية ' + what, extra); };
const rowOk = (lim, r) => lim === true || (lim === 'purchase' && !!r && r.kind === 'purchase');

function checkWrite(d, w, u) {
  const p = policyFor(u);
  if (p.admin) return p;
  Object.keys(w.cols || {}).forEach(c => {
    const cd = w.cols[c], gr = p.write[c], cur = AX.idx(Array.isArray(d[c]) ? d[c] : []);
    const name = AR[c] || c;
    if (!gr) deny('تعدّل في ' + name, { col: c });
    (cd.added || []).forEach(r => { if (!rowOk(gr.add, r)) deny('تضيف في ' + name, { col: c, id: r && r.id }); });
    (cd.removed || []).forEach(k => { if (!rowOk(gr.del, cur[k])) deny('تمسح من ' + name, { col: c, id: String(k).slice(2) }); });
    (cd.modified || []).forEach(x => {
      const fields = x.f.filter(f => AX.realField(f));
      if (!fields.length) return;
      if (!gr.edit) deny('تعدّل ' + name, { col: c, id: x.k.slice(2) });
      const after = Object.assign({}, cur[x.k] || {}, x.a);
      if (!rowOk(gr.edit.rows, cur[x.k]) || !rowOk(gr.edit.rows, after)) deny('تعدّل السجل ده في ' + name, { col: c, id: x.k.slice(2) });
      if (gr.edit.fields !== true) {
        const bad = fields.filter(f => !gr.edit.fields.has(f));
        if (bad.length) deny('تعدّل «' + bad.join('، ') + '» في ' + name, { col: c, id: x.k.slice(2), fields: bad });
      }
    });
  });
  Object.keys(w.sets || {}).concat(Object.keys(w.keys || {})).forEach(k => {
    if (!p.writeKeys.has(k)) deny('تغيّر الإعداد ده: ' + k, { key: k });
  });
  return p;
}

/* a user who cannot see costs still sends invoices / issuances: keep (or compute) the hidden cost
   so the profit reports stay right — the server fills it from its own data */
function keepHiddenCosts(d, w, p) {
  if (p.admin || p.costs) return;
  const prod = AX.idx(d.products || []);
  const unitCost = pid => { const x = prod['i:' + pid]; return x && Number(x.cost) > 0 ? Number(x.cost) : 0; };
  const qtyOf = it => Number(it.quantity != null ? it.quantity : it.qty) || 0;
  ['invoices', 'issuances'].forEach(c => {
    const cd = (w.cols || {})[c]; if (!cd) return;
    const cur = AX.idx(d[c] || []);
    const fill = (items, old) => (Array.isArray(items) ? items : []).forEach((it, i) => {
      if (!it || typeof it !== 'object' || it.cost !== undefined) return;
      const o = (old || []).find(x => x && x.productId === it.productId) || (old || [])[i];
      if (o && Number(o.cost) > 0 && qtyOf(o) > 0) it.cost = Number(o.cost) / qtyOf(o) * qtyOf(it);
      else if (it.productId && unitCost(it.productId)) it.cost = unitCost(it.productId) * qtyOf(it);
    });
    (cd.added || []).forEach(r => {
      fill(r.items);
      if (c === 'issuances' && r.cost === undefined && r.productId && unitCost(r.productId)) r.cost = unitCost(r.productId) * (Number(r.quantity) || 0);
    });
    (cd.modified || []).forEach(x => {
      const old = cur[x.k] || {};
      if (x.f.includes('items')) fill(x.a.items, old.items);
      if (x.f.includes('cost') && x.a.cost === undefined && old.cost !== undefined) { x.f = x.f.filter(f => f !== 'cost'); delete x.a.cost; }
    });
  });
}

module.exports = { ROLE_PAGES, ADMIN_ONLY_PAGES, ALWAYS_PAGES, COLLECTIONS, POLICY, COMMON, SIDE, PREF_KEYS, SECRET_KEYS, pagesOf, policyFor, filterData, checkWrite, keepHiddenCosts, Forbidden };

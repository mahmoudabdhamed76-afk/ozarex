/* Phase 2 · C1 — server-side least privilege: what each user receives from
   GET /api/data and what /api/ops lets him change, called straight at the API. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from '../helpers/server.mjs';
import { req, adminLogin, send, ops, col, data, createUser, seedOps, SALES, CLERK } from '../helpers/api.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require(path.join(ROOT, 'backend', 'src', 'permissions.js'));

let s, admin, sales, clerk, acct, keeper, buyer;
before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  assert.equal((await send(s.base, admin, seedOps())).status, 200);
  /* every kind of data, so we can see what leaks */
  assert.equal((await send(s.base, admin, ops({
    cols: {
      expenses: col({ added: [{ id: 'e1', description: 'إيجار', amount: 5000, date: '2026-10-01', category: 'إيجار' },
        { id: 'pur1', kind: 'purchase', number: 1001, supplierId: 's1', amount: 900, date: '2026-10-01', items: [{ productId: 'p1', name: 'ورق', qty: 10, price: 90 }] }] }),
      supplierPayments: col({ added: [{ id: 'sp1', supplierId: 's1', amount: 400, date: '2026-10-02' }] }),
      bankTransfers: col({ added: [{ id: 'bt1', amount: 700, date: '2026-10-02', customerId: 'c1' }] }),
      employees: col({ added: [{ id: 'emp1', name: 'موظف', salary: 9000 }] }),
      salaryRuns: col({ added: [{ id: 'sr1', employeeId: 'emp1', amount: 9000, date: '2026-09-30' }] }),
      issuances: col({ added: [{ id: 'is1', number: 1001, customerId: 'c1', productId: 'p1', quantity: 5, cost: 400, total: 600, date: '2026-10-03', items: [{ productId: 'p1', name: 'ورق', qty: 5, quantity: 5, cost: 400, total: 600 }] }] })
    },
    sets: { _cheques: col({ added: [{ id: 'chq1', no: '77', amount: 1000 }] }), _debts: col({ added: [{ id: 'd1', name: 'بنك', amount: 50000, payments: [] }] }) },
    keys: { _portal: { c1: 'ab'.repeat(20) }, _auditLock: 'f'.repeat(64), _secretThing: 'x', companyName: 'شركة' }
  }))).status, 200);
  sales = await createUser(s.base, admin, SALES);                                                   // Dashboard + Issuances only
  clerk = await createUser(s.base, admin, CLERK);                                                   // sales role defaults
  acct = await createUser(s.base, admin, { id: 'u_acct', username: 'acct', password: 'Acct-Test-Pass-1', name: 'محاسب', role: 'accountant' });
  keeper = await createUser(s.base, admin, { id: 'u_keep', username: 'keeper', password: 'Keep-Test-Pass-1', name: 'أمين مخزن', role: 'sales', pages: ['stock'] });
  buyer = await createUser(s.base, admin, { id: 'u_buy', username: 'buyer', password: 'Buy-Test-Pass-1', name: 'مشتريات', role: 'accountant', pages: ['purchases'] });
  /* a pending approval from someone else */
  await send(s.base, clerk, ops({ sets: { _approvals: col({ added: [{ id: 'apr_clerk', status: 'pending', by: { id: CLERK.id, name: 'كريم' }, createdAt: 1 }] }) } }));
});
after(() => s.stop());

const why = r => (r.json && r.json.error) + ' ' + (r.json && r.json.message);

/* ═══ the matrix itself ═══ */
test('matrix: role pages and admin-only pages are the same as the browser (index.html)', () => {
  const html = readFileSync(path.join(ROOT, 'frontend', 'public', 'index.html'), 'utf8');
  const block = html.slice(html.indexOf('const PERMISSIONS = {'), html.indexOf('};', html.indexOf('const PERMISSIONS = {')));
  for (const role of ['admin', 'accountant', 'sales']) {
    const m = block.match(new RegExp(role + ": \\[([^\\]]*)\\]"));
    assert.ok(m, role);
    assert.deepEqual(JSON.parse('[' + m[1].replace(/'/g, '"') + ']'), P.ROLE_PAGES[role], role);
  }
  const ao = html.match(/const ADMIN_ONLY_PAGES = \[([^\]]*)\]/);
  assert.deepEqual(JSON.parse('[' + ao[1].replace(/'/g, '"') + ']').sort(), P.ADMIN_ONLY_PAGES.slice().sort());
});

test('matrix: every page in the menu has a policy, every policy names real collections', () => {
  const html = readFileSync(path.join(ROOT, 'frontend', 'public', 'index.html'), 'utf8');
  const nav = [...html.slice(html.indexOf('const NAV_ITEMS'), html.indexOf('const SECTIONS')).matchAll(/key: '([a-z]+)'/g)].map(m => m[1]);
  /* 4.27: «المبيعات» is a view of the issuance records — the browser maps it to «صرف الورق» (same right, same data),
     so the server policy that covers it is the issuances one */
  const VIEWS = { sales: 'issuances' };
  assert.equal(nav.length, 26);
  assert.match(html, /if \(page === 'sales'\) page = 'issuances';/, 'the browser maps «المبيعات» to «صرف الورق»');
  for (const k of nav) { const real = VIEWS[k] || k; assert.ok(P.POLICY[real] || P.ADMIN_ONLY_PAGES.includes(real), 'no policy for page ' + k); }
  for (const [k, pol] of Object.entries(P.POLICY)) {
    for (const c of (pol.read || []).concat(Object.keys(pol.write || {}))) assert.ok(P.COLLECTIONS.includes(c), k + ' → ' + c);
  }
});

test('matrix: pages of a user follow the browser rule (always dashboard/approvals/requests, never admin pages)', () => {
  assert.deepEqual(P.pagesOf({ role: 'sales', pages: ['issuances', 'users', 'settings'] }).sort(), ['approvals', 'dashboard', 'issuances', 'requests']);
  assert.deepEqual(P.pagesOf({ role: 'sales' }).sort(), P.ROLE_PAGES.sales.slice().sort());
  assert.equal(P.pagesOf({ role: 'admin' }).length, 25);
  assert.deepEqual(P.pagesOf({ role: 'nobody' }).sort(), ['approvals', 'dashboard', 'requests']);
});

/* ═══ reads ═══ */
test('restricted user: no financial collections he has no page for', async () => {
  const d = await data(s.base, sales);
  for (const c of ['expenses', 'supplierPayments', 'bankTransfers', 'salaryRuns', 'employees', 'suppliers', 'auditLog']) assert.deepEqual(d[c], [], c);
  for (const k of ['_cheques', '_debts', '_portal', '_auditLock', '_secretThing']) assert.equal(d.settings[k], undefined, k);
});

test('restricted user: no purchase costs anywhere (products, issuances, items)', async () => {
  const d = await data(s.base, sales);
  assert.ok(d.products.length > 0);
  assert.doesNotMatch(JSON.stringify({ p: d.products, i: d.issuances, v: d.invoices }), /"cost"/);
});

test('restricted user: his own user record only — no colleagues, roles, page lists or hashes', async () => {
  const d = await data(s.base, sales);
  assert.deepEqual(d.users.map(u => u.id), [SALES.id]);
  assert.doesNotMatch(JSON.stringify(d.users), /scrypt|password/);
});

test('restricted user: sees only his own approval requests', async () => {
  await send(s.base, sales, ops({ sets: { _approvals: col({ added: [{ id: 'apr_sales', status: 'pending', by: { id: SALES.id, name: 'سارة' }, createdAt: 2 }] }) } }));
  const d = await data(s.base, sales);
  assert.deepEqual(d.settings._approvals.map(x => x.id), ['apr_sales']);
  assert.equal((await data(s.base, admin)).settings._approvals.length, 2, 'the admin still sees all');
});

test('restricted user: still gets everything the Issuances page needs', async () => {
  const d = await data(s.base, sales);
  for (const c of ['customers', 'products', 'invoices', 'issuances', 'payments', 'stockMoves']) assert.ok(Array.isArray(d[c]), c);
  assert.equal(d.customers.length, 2);
  assert.ok(d.products.find(p => p.id === 'p1').quantity > 0);
  assert.ok(d.counters.invoice >= 1001);
  assert.equal(d.settings.companyName, 'شركة', 'general settings (name, currency, logo) are shared');
});

test('stock-only user: purchase rows only (no rent / salaries), colleagues as names only, costs visible', async () => {
  const d = await data(s.base, keeper);
  assert.deepEqual(d.expenses.map(e => e.id), ['pur1']);
  assert.ok(d.users.length > 1);
  for (const u of d.users.filter(x => x.id !== 'u_keep')) assert.deepEqual(Object.keys(u).sort(), ['id', 'name']);
  assert.deepEqual(d.employees, [{ id: 'emp1', name: 'موظف' }], 'custody holders: names only, no salary');
  assert.equal(d.products.find(p => p.id === 'p1').cost, 80);
  assert.deepEqual(d.customers.length, 2);
  assert.deepEqual(d.payments, [], 'no collections data for a stock keeper');
});

test('accountant: sees money and costs, not the stock-only lists', async () => {
  const d = await data(s.base, acct);
  assert.equal(d.expenses.length, 2);
  assert.equal(d.employees[0].salary, 9000);
  assert.equal(d.products.find(p => p.id === 'p1').cost, 80);
  assert.equal(d.settings._cheques.length, 1);
  assert.equal(d.settings._stockCounts, undefined);
  assert.equal(d.settings._auditLock, undefined, 'the settings lock is admin-only for everyone');
  assert.deepEqual(d.auditLog, []);
});

test('admin: unchanged — everything, including the lock hash and the full audit log', async () => {
  const d = await data(s.base, admin);
  assert.equal(d.settings._auditLock, 'f'.repeat(64));
  assert.equal(d.settings._secretThing, 'x');
  assert.equal(d.expenses.length, 2);
  assert.ok(d.users.length >= 6);
  assert.ok(d.auditLog.length > 0);
  assert.equal(d.products.find(p => p.id === 'p1').cost, 80);
});

test('a change of pages by the admin takes effect on the next request', async () => {
  await send(s.base, admin, ops({ cols: { users: col({ modified: [{ id: 'u_keep', before: {}, after: { pages: ['stock', 'reports'] } }] }) } }));
  assert.equal((await data(s.base, keeper)).expenses.length, 2, 'reports added → all expenses');
  await send(s.base, admin, ops({ cols: { users: col({ modified: [{ id: 'u_keep', before: {}, after: { pages: ['stock'] } }] }) } }));
  assert.equal((await data(s.base, keeper)).expenses.length, 1);
});

/* ═══ writes ═══ */
test('restricted user can still do his whole job: an issuance with invoice, stock move, payment, balance', async () => {
  const p = (await data(s.base, admin)).products.find(x => x.id === 'p1');
  const r = await send(s.base, sales, ops({
    cols: {
      issuances: col({ added: [{ id: 'is_ok', number: 1002, customerId: 'c2', productId: 'p1', quantity: 2, unitPrice: 120, total: 240, paid: 100, date: '2026-10-06', items: [{ productId: 'p1', name: 'ورق A4', qty: 2, quantity: 2, price: 120, total: 240 }] }] }),
      invoices: col({ added: [{ id: 'inv_ok', number: 1002, customerId: 'c2', date: '2026-10-06', total: 240, paid: 100, items: [{ productId: 'p1', name: 'ورق A4', qty: 2, price: 120, total: 240 }] }] }),
      stockMoves: col({ added: [{ id: 'sm_ok', productId: 'p1', type: 'out', quantity: 2, date: '2026-10-06', reference: 'صرف #1002' }] }),
      payments: col({ added: [{ id: 'pay_ok', customerId: 'c2', amount: 100, date: '2026-10-06', invoiceId: 'inv_ok' }] }),
      products: col({ modified: [{ id: 'p1', before: { quantity: p.quantity }, after: { quantity: p.quantity - 2 } }] }),
      customers: col({ modified: [{ id: 'c2', before: { balance: 0 }, after: { balance: 140 } }], added: [{ id: 'c_new_from_picker', name: 'عميل جديد من البحث', balance: 0 }] })
    }, counters: { invoice: 1002, issuance: 1002 }
  }));
  assert.equal(r.status, 200, why(r));
  const d = await data(s.base, admin);
  /* the hidden purchase cost was filled in by the server, so the profit reports stay right */
  assert.equal(d.issuances.find(i => i.id === 'is_ok').items[0].cost, 160);
  assert.equal(d.invoices.find(i => i.id === 'inv_ok').items[0].cost, 160);
});

test('restricted user: an edit that keeps a hidden cost does not wipe it', async () => {
  const r = await send(s.base, sales, ops({ cols: { issuances: col({ modified: [{ id: 'is1', before: {}, after: { items: [{ productId: 'p1', name: 'ورق', qty: 6, quantity: 6, total: 720 }], total: 720 } }] }) } }));
  assert.ok(r.status === 200 || (r.status === 403 && r.json.error === 'needs_approval'), why(r));
  if (r.status === 200) assert.equal((await data(s.base, admin)).issuances.find(i => i.id === 'is1').items[0].cost, 480);
});

const refused = async (tok, o, label) => {
  const r = await send(s.base, tok, o);
  assert.equal(r.status, 403, label + ' → ' + r.status);
  assert.equal(r.json.error, 'forbidden_page', label + ' → ' + why(r));
};
test('restricted user: every module he has no page for is refused, whatever the action', async () => {
  await refused(sales, ops({ cols: { expenses: col({ added: [{ id: 'x1', description: 'x', amount: 1, date: '2026-10-06' }] }) } }), 'add expense');
  await refused(sales, ops({ cols: { expenses: col({ removed: ['e1'] }) } }), 'delete expense');
  await refused(sales, ops({ cols: { suppliers: col({ modified: [{ id: 's1', before: {}, after: { phone: '0' } }] }) } }), 'edit supplier');
  await refused(sales, ops({ cols: { bankTransfers: col({ added: [{ id: 'bt9', amount: 1, date: '2026-10-06' }] }) } }), 'add transfer');
  await refused(sales, ops({ cols: { supplierPayments: col({ added: [{ id: 'sp9', supplierId: 's1', amount: 1, date: '2026-10-06' }] }) } }), 'pay supplier');
  await refused(sales, ops({ cols: { employees: col({ modified: [{ id: 'emp1', before: {}, after: { salary: 1 } }] }) } }), 'edit salary');
  await refused(sales, ops({ cols: { salaryRuns: col({ removed: ['sr1'] }) } }), 'delete salary run');
  await refused(sales, ops({ sets: { _cheques: col({ added: [{ id: 'chq9', amount: 1 }] }) } }), 'add cheque');
  await refused(sales, ops({ sets: { _debts: col({ removed: ['d1'] }) } }), 'delete debt');
  await refused(sales, ops({ keys: { _portal: { c1: 'cd'.repeat(20) } } }), 'portal link');
});

test('restricted user: side effects only — no deleting customers, no changing prices or names', async () => {
  await refused(sales, ops({ cols: { customers: col({ removed: ['c2'] }) } }), 'delete customer');
  await refused(sales, ops({ cols: { customers: col({ modified: [{ id: 'c2', before: {}, after: { phone: '0' } }] }) } }), 'customer phone');
  await refused(sales, ops({ cols: { products: col({ modified: [{ id: 'p1', before: { price: 120 }, after: { price: 1 } }] }) } }), 'product price');
  await refused(sales, ops({ cols: { products: col({ added: [{ id: 'p_new', name: 'صنف جديد' }] }) } }), 'add product');
  await refused(sales, ops({ cols: { notes: col({ added: [{ id: 'n_ok', title: 'ok' }] }), products: col({ removed: ['p2'] }) } }), 'mixed change');
  assert.equal((await data(s.base, admin)).notes.some(n => n.id === 'n_ok'), false, 'a refused change saves nothing');
});

test('restricted user: notes and screen preferences stay open to everyone', async () => {
  assert.equal((await send(s.base, sales, ops({ cols: { notes: col({ added: [{ id: 'n_sales', title: 'ملاحظة' }] }) }, keys: { soundEnabled: false } }))).status, 200);
});

test('purchases-only user: purchase rows yes, other expenses no', async () => {
  assert.equal((await send(s.base, buyer, ops({ cols: { expenses: col({ added: [{ id: 'pur2', kind: 'purchase', number: 1002, supplierId: 's1', amount: 10, date: '2026-10-06' }] }) } }))).status, 200);
  await refused(buyer, ops({ cols: { expenses: col({ added: [{ id: 'ex_rent', description: 'إيجار', amount: 10, date: '2026-10-06' }] }) } }), 'add rent');
  await refused(buyer, ops({ cols: { expenses: col({ modified: [{ id: 'e1', before: {}, after: { amount: 1 } }] }) } }), 'edit rent');
  await refused(buyer, ops({ cols: { expenses: col({ modified: [{ id: 'pur2', before: {}, after: { kind: 'other' } }] }) } }), 'turn a purchase into another expense');
});

test('non-admins never write users, admin settings or the settings lock — even with every page', async () => {
  await refused(acct, ops({ keys: { _auditLock: '0'.repeat(64) } }), 'settings lock');
  const r = await send(s.base, acct, ops({ keys: { companyName: 'x' } }));
  assert.equal(r.status, 403);
  const u = await send(s.base, clerk, ops({ cols: { users: col({ modified: [{ id: CLERK.id, before: {}, after: { pages: P.ROLE_PAGES.admin } }] }) } }));
  assert.equal(u.status, 403);
});

test('the approval rules still run after the page check (nothing weakened)', async () => {
  const r = await send(s.base, clerk, ops({ cols: { customers: col({ removed: ['c2'] }) } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'needs_approval');
});

test('the browser cannot widen its own pages: the server reads them from its own user record', async () => {
  const body = { ops: ops({ cols: { expenses: col({ added: [{ id: 'x2', description: 'x', amount: 1, date: '2026-10-06' }] }) } }), opId: 'forge-1', cid: 'x', pages: P.ROLE_PAGES.admin, user: { role: 'admin' } };
  const r = await req(s.base, 'POST', '/api/ops', { token: sales, body, headers: { 'X-User-Role': 'admin' } });
  assert.equal(r.status, 403);
});

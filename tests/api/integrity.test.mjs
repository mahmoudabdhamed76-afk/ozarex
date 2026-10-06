/* Phase 1 regression tests: C2 (no silent loss), C5 (unique numbers),
   I10 (no id overwrite), I14 (safe restore). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { req, login, adminLogin, send, ops, col, data, createUser, seedOps, SALES } from '../helpers/api.mjs';

let s, admin, sales;
const relogin = async () => { admin = (await adminLogin(s.base)).token; };
before(async () => {
  s = await startServer();
  await relogin();
  assert.equal((await send(s.base, admin, seedOps())).status, 200);
  sales = await createUser(s.base, admin, SALES);
});
after(() => s.stop());
const inv = (id, number, extra = {}) => Object.assign({ id, number, customerId: 'c1', date: '2026-10-06', total: 10, paid: 0, items: [] }, extra);

/* ───────────── C2 · nothing is accepted that is not really saved ───────────── */
test('C2: one invalid record refuses the whole change — the valid part is not kept either', async () => {
  const r = await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_ok', name: 'سليم', balance: 0 }, { id: 'c_bad', phone: '1' }] }) } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'invalid_record');
  assert.equal(r.json.col, 'customers');
  assert.equal(r.json.id, 'c_bad');
  const d = await data(s.base, admin);
  assert.equal(d.customers.some(c => c.id === 'c_ok'), false);
});

test('C2: an edit that empties a required field is refused and the record is unchanged', async () => {
  const r = await send(s.base, admin, ops({ cols: { customers: col({ modified: [{ id: 'c1', before: { name: 'مركز النور' }, after: { name: '  ' } }] }) } }));
  assert.equal(r.status, 403);
  assert.equal((await data(s.base, admin)).customers.find(c => c.id === 'c1').name, 'مركز النور');
});

test('C2: required dates for every money / stock collection', async () => {
  for (const [k, rec] of [['payments', { customerId: 'c1', amount: 5 }], ['supplierPayments', { supplierId: 's1', amount: 5 }], ['expenses', { description: 'x', amount: 5 }],
    ['expenses', { kind: 'purchase', supplierId: 's1', amount: 5, number: 1 }], ['stockMoves', { productId: 'p1', quantity: 1 }], ['bankTransfers', { amount: 5 }], ['salaryRuns', { amount: 5 }]]) {
    const r = await send(s.base, admin, ops({ cols: { [k]: col({ added: [Object.assign({ id: 'x_' + k + Math.random().toString(36).slice(2, 6) }, rec)] }) } }));
    assert.equal(r.status, 403, k);
    assert.equal(r.json.error, 'invalid_record', k);
  }
});

test('C2: names are required for customers, suppliers, products, employees, users', async () => {
  for (const k of ['customers', 'suppliers', 'products', 'employees']) {
    const r = await send(s.base, admin, ops({ cols: { [k]: col({ added: [{ id: 'nn_' + k, phone: '1' }] }) } }));
    assert.equal(r.status, 403, k);
  }
  const u = await send(s.base, admin, ops({ cols: { users: col({ added: [{ id: 'u_nn', username: 'nn', password: 'Some-Pass-123', role: 'sales' }] }) } }));
  assert.equal(u.status, 403);
});

test('C2: invoice / issuance items must be a list of objects', async () => {
  const a = await send(s.base, admin, ops({ cols: { invoices: col({ added: [inv('i_items1', 3001, { items: { productId: 'p1' } })] }) } }));
  assert.equal(a.status, 403);
  const b = await send(s.base, admin, ops({ cols: { issuances: col({ added: [{ id: 'is_items2', number: 3001, customerId: 'c1', date: '2026-10-06', items: [null] }] }) } }));
  assert.equal(b.status, 403);
});

test('C2: a new user needs a password (no silent random password) and a free user name', async () => {
  const a = await send(s.base, admin, ops({ cols: { users: col({ added: [{ id: 'u_nopw', username: 'nopw', name: 'x', role: 'sales' }] }) } }));
  assert.equal(a.status, 403);
  const b = await send(s.base, admin, ops({ cols: { users: col({ added: [{ id: 'u_dupname', username: 'SARA', password: 'Another-Pass-1', name: 'x', role: 'sales' }] }) } }));
  assert.equal(b.status, 403);
  assert.match(b.json.message, /مستخدم قبل كده/);
});

test('C2: a database refusal rolls back both the database and the memory (no ghost record)', async () => {
  /* test-only trigger on this throw-away database: any customer named BOOM makes SQLite refuse the write */
  const db = new DatabaseSync(path.join(s.dataDir, 'erp.db'));
  db.exec("CREATE TRIGGER IF NOT EXISTS test_boom BEFORE INSERT ON customers WHEN NEW.name = 'BOOM' BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: test_boom'); END;");
  db.close();
  const r = await send(s.base, admin, ops({ cols: {
    customers: col({ added: [{ id: 'c_before', name: 'قبل', balance: 0 }, { id: 'c_boom', name: 'BOOM', balance: 0 }] }),
    products: col({ modified: [{ id: 'p2', before: { quantity: 200 }, after: { quantity: 150 } }] })
  } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'db_rejected');
  const d = await data(s.base, admin);
  assert.equal(d.customers.some(c => c.id === 'c_before' || c.id === 'c_boom'), false, 'memory kept a record the database refused');
  assert.equal(d.products.find(p => p.id === 'p2').quantity, 200, 'memory kept an edit from the refused change');
  await s.restart(); await relogin();
  assert.equal((await data(s.base, admin)).products.find(p => p.id === 'p2').quantity, 200);
  /* the server keeps working normally afterwards */
  assert.equal((await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_after_boom', name: 'بعدها', balance: 0 }] }) } }))).status, 200);
});

test('C2: a refused change is announced to nobody and does not move the version', async () => {
  const v = (await req(s.base, 'GET', '/api/version')).json.version;
  await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_v', phone: '1' }] }) } }));
  assert.equal((await req(s.base, 'GET', '/api/version')).json.version, v);
});

/* ───────────── I10 · ids ───────────── */
test('I10: the same record sent again unchanged (a retry) is accepted as a no-op', async () => {
  const rec = { id: 'c_retry', name: 'مرة واحدة', balance: 0, customPrices: {} };
  assert.equal((await send(s.base, admin, ops({ cols: { customers: col({ added: [rec] }) } }))).status, 200);
  assert.equal((await send(s.base, admin, ops({ cols: { customers: col({ added: [rec] }) } }))).status, 200);
  assert.equal((await data(s.base, admin)).customers.filter(c => c.id === 'c_retry').length, 1);
});

test('I10: two new records with the same id in one change are refused', async () => {
  const r = await send(s.base, admin, ops({ cols: { notes: col({ added: [{ id: 'n_twice', title: 'a' }, { id: 'n_twice', title: 'b' }] }) } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'duplicate_id');
});

test('I10: delete + "new" with the same id in one change is not a collision (unchanged rule: the delete wins)', async () => {
  await send(s.base, admin, ops({ cols: { notes: col({ added: [{ id: 'n_re', title: 'old' }] }) } }));
  const r = await send(s.base, admin, ops({ cols: { notes: col({ removed: ['n_re'], added: [{ id: 'n_re', title: 'new' }] }) } }));
  assert.equal(r.status, 200);
  assert.equal((await data(s.base, admin)).notes.some(n => n.id === 'n_re'), false);
});

test('I10: settings lists (cheques, debts…) refuse a new item with an existing id too', async () => {
  await send(s.base, admin, ops({ sets: { _cheques: col({ added: [{ id: 'chq1', no: '1', amount: 100 }] }) } }));
  const r = await send(s.base, admin, ops({ sets: { _cheques: col({ added: [{ id: 'chq1', no: '2', amount: 999 }] }) } }));
  assert.equal(r.status, 403);
  assert.equal((await data(s.base, admin)).settings._cheques.find(c => c.id === 'chq1').amount, 100);
});

test('I10: a non-admin gets the same refusal (not an approval request)', async () => {
  const r = await send(s.base, sales, ops({ cols: { customers: col({ added: [{ id: 'c2', name: 'تاني' }] }) } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'duplicate_id');
});

/* ───────────── C5 · numbers ───────────── */
test('C5: a clashing invoice number gets the next free one, the record is kept and marked', async () => {
  assert.equal((await send(s.base, admin, ops({ cols: { invoices: col({ added: [inv('n_a', 5000)] }) }, counters: { invoice: 5000 } }))).status, 200);
  const r = await send(s.base, sales, ops({ cols: { invoices: col({ added: [inv('n_b', 5000)] }) }, counters: { invoice: 5000 } }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.renumbered, [{ col: 'invoices', id: 'n_b', from: 5000, to: 5001 }]);
  const d = await data(s.base, admin);
  assert.equal(d.invoices.find(i => i.id === 'n_a').number, 5000);
  const b = d.invoices.find(i => i.id === 'n_b');
  assert.equal(b.number, 5001);
  assert.equal(b.renumberedFrom, 5000);
  assert.equal(d.counters.invoice, 5001, 'the counter moved past the new number');
});

test('C5: numbers never repeat inside one change either, and the next number skips used ones', async () => {
  await send(s.base, admin, ops({ cols: { invoices: col({ added: [inv('n_c', 5002)] }) } }));
  const r = await send(s.base, admin, ops({ cols: { invoices: col({ added: [inv('n_d', 5001), inv('n_e', 5001)] }) } }));
  assert.equal(r.status, 200);
  const nums = (await data(s.base, admin)).invoices.map(i => i.number);
  assert.equal(new Set(nums).size, nums.length, 'duplicate invoice numbers: ' + nums.join(','));
});

test('C5: an issuance made with its invoice keeps pointing at the invoice\'s new number', async () => {
  const r = await send(s.base, sales, ops({ cols: {
    invoices: col({ added: [inv('n_f', 5000)] }),
    issuances: col({ added: [{ id: 'is_f', number: 3100, customerId: 'c1', date: '2026-10-06', invoiceId: 'n_f', invoiceNumber: 5000, items: [] }] }),
    bankTransfers: col({ added: [{ id: 'bt_f', amount: 10, date: '2026-10-06', invoiceId: 'n_f', invoiceNumber: 5000 }] })
  } }));
  assert.equal(r.status, 200);
  const d = await data(s.base, admin);
  const n = d.invoices.find(i => i.id === 'n_f').number;
  assert.notEqual(n, 5000);
  assert.equal(d.issuances.find(i => i.id === 'is_f').invoiceNumber, n);
  assert.equal(d.bankTransfers.find(t => t.id === 'bt_f').invoiceNumber, n);
});

test('C5: issuance and purchase numbers are protected the same way (purchase numbers stay text if sent as text)', async () => {
  await send(s.base, admin, ops({ cols: { issuances: col({ added: [{ id: 'is_1', number: 7000, customerId: 'c1', date: '2026-10-06', items: [] }] }) } }));
  const a = await send(s.base, sales, ops({ cols: { issuances: col({ added: [{ id: 'is_2', number: 7000, customerId: 'c2', date: '2026-10-06', items: [] }] }) } }));
  assert.equal(a.json.renumbered[0].to, 7001);
  await send(s.base, admin, ops({ cols: { expenses: col({ added: [{ id: 'pur_1', kind: 'purchase', number: '8000', supplierId: 's1', amount: 5, date: '2026-10-06' }] }) } }));
  const b = await send(s.base, admin, ops({ cols: { expenses: col({ added: [{ id: 'pur_2', kind: 'purchase', number: '8000', supplierId: 's1', amount: 6, date: '2026-10-06' }, { id: 'exp_plain', number: '8000', description: 'مصروف عادي', amount: 1, date: '2026-10-06' }] }) } }));
  assert.equal(b.status, 200);
  const d = await data(s.base, admin);
  assert.equal(d.expenses.find(e => e.id === 'pur_2').number, '8001');
  assert.equal(d.expenses.find(e => e.id === 'exp_plain').number, '8000', 'ordinary expenses are not numbered documents');
});

test('C5: editing a number onto another invoice\'s number is moved to a free one', async () => {
  const r = await send(s.base, admin, ops({ cols: { invoices: col({ modified: [{ id: 'n_c', before: { number: 5002 }, after: { number: 5000 } }] }) } }));
  assert.equal(r.status, 200);
  assert.ok(r.json.renumbered && r.json.renumbered[0].id === 'n_c');
  const nums = (await data(s.base, admin)).invoices.map(i => i.number);
  assert.equal(new Set(nums).size, nums.length);
});

test('C5: a non-clashing number and an unchanged invoice are left alone', async () => {
  const r = await send(s.base, admin, ops({ cols: { invoices: col({ added: [inv('n_free', 9999)], modified: [{ id: 'n_a', before: { notes: '' }, after: { notes: 'x' } }] }) } }));
  assert.equal(r.status, 200);
  assert.equal(r.json.renumbered, undefined);
  assert.equal((await data(s.base, admin)).invoices.find(i => i.id === 'n_free').number, 9999);
});

/* ───────────── I14 · restore ───────────── */
test('I14: a backup with broken records is refused (400) and nothing is replaced', async () => {
  const before = await data(s.base, admin);
  const r = await req(s.base, 'POST', '/api/data', { token: admin, body: { customers: [{ id: 'r1', name: 'سليم' }, { id: 'r2' }], invoices: [] } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'invalid_backup');
  assert.equal(r.json.problems[0].id, 'r2');
  assert.equal((await data(s.base, admin)).customers.length, before.customers.length);
});

test('I14: a backup whose admin has another password: the admin who restores keeps his own login', async () => {
  const x = await startServer();
  try {
    const t = (await adminLogin(x.base)).token;
    const blob = { users: [{ id: 'u1', username: 'admin', name: 'مدير قديم', role: 'admin', password: 'Old-Admin-Pass-1' }, { id: 'u9', username: 'boss2', name: 'مدير تاني', role: 'admin', password: 'Boss-Two-Pass-1' }], customers: [], invoices: [] };
    const r = await req(x.base, 'POST', '/api/data', { token: t, body: blob });
    assert.equal(r.status, 200);
    assert.equal((await login(x.base, 'admin', ADMIN_PASSWORD)).status, 200, 'current admin password still works');
    assert.equal((await login(x.base, 'admin', 'Old-Admin-Pass-1')).status, 401);
    assert.equal((await login(x.base, 'boss2', 'Boss-Two-Pass-1')).status, 200, 'a plain password in an old export is still honoured (hashed)');
  } finally { await x.stop(); }
});

test('I14: a backup that demotes or disables the restoring admin cannot lock him out', async () => {
  const x = await startServer();
  try {
    const t = (await adminLogin(x.base)).token;
    const r = await req(x.base, 'POST', '/api/data', { token: t, body: { users: [{ id: 'u1', username: 'admin', name: 'x', role: 'sales', disabled: true }], customers: [], invoices: [] } });
    assert.equal(r.status, 200);
    const l = await login(x.base, 'admin', ADMIN_PASSWORD);
    assert.equal(l.status, 200);
    assert.equal(l.user.role, 'admin');
  } finally { await x.stop(); }
});

test('I14: employees in a hash-less backup keep their password when the same user already exists here', async () => {
  const blob = await data(s.base, admin);
  blob.users = blob.users.map(u => { const c = Object.assign({}, u); delete c.password; return c; });
  const r = await req(s.base, 'POST', '/api/data', { token: admin, body: blob });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.usersWithoutPassword, []);
  assert.equal((await login(s.base, SALES.username, SALES.password)).status, 200);
});

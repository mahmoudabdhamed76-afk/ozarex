/* What a non-admin may do (server-enforced approval rules) + the C1 checks
   (fixed in Phase 2 — more in api/access.test.mjs). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';
import { adminLogin, send, ops, col, data, createUser, seedOps, SALES, CLERK, req } from '../helpers/api.mjs';

let s, admin, sales, clerk;
before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  assert.equal((await send(s.base, admin, seedOps())).status, 200);
  sales = await createUser(s.base, admin, SALES);
  clerk = await createUser(s.base, admin, CLERK);
});
after(() => s.stop());

const why = r => (r.json && r.json.why || []).map(x => x.t + ':' + x.k).join(',');

test('sales (sensitive): adding new records goes straight through', async () => {
  const r = await send(s.base, clerk, ops({ cols: { customers: col({ added: [{ id: 'c_new', name: 'عميل جديد', balance: 0 }] }) } }));
  assert.equal(r.status, 200);
});

test('sales (sensitive): editing a customer phone is allowed', async () => {
  const r = await send(s.base, clerk, ops({ cols: { customers: col({ modified: [{ id: 'c2', before: { phone: '01000000002' }, after: { phone: '01099999999' } }] }) } }));
  assert.equal(r.status, 200);
});

test('sales (sensitive): deleting a customer needs approval', async () => {
  const r = await send(s.base, clerk, ops({ cols: { customers: col({ removed: ['c2'] }) } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'needs_approval');
  assert.match(why(r), /rm:customers/);
});

test('sales (sensitive): editing an existing invoice total needs approval', async () => {
  const r = await send(s.base, clerk, ops({ cols: { invoices: col({ modified: [{ id: 'i1', before: { total: 1200 }, after: { total: 10 } }] }) } }));
  assert.equal(r.status, 403);
  assert.match(why(r), /mod:invoices/);
});

test('sales (sensitive): changing a balance without a document needs approval', async () => {
  const r = await send(s.base, clerk, ops({ cols: { customers: col({ modified: [{ id: 'c1', before: { balance: 1000 }, after: { balance: 0 } }] }) } }));
  assert.equal(r.status, 403);
  assert.match(why(r), /bal:customers/);
});

test('sales (sensitive): a new invoice may move that customer balance and mark old invoices paid', async () => {
  const r = await send(s.base, clerk, ops({ cols: {
    invoices: col({ added: [{ id: 'i_s1', number: 2001, customerId: 'c1', date: '2026-10-06', total: 100, paid: 0, items: [] }] }),
    customers: col({ modified: [{ id: 'c1', before: { balance: 1000 }, after: { balance: 1100 } }] })
  } }));
  assert.equal(r.status, 200);
  const d = await data(s.base, admin);
  assert.equal(d.customers.find(c => c.id === 'c1').balance, 1100);
});

test('sales (sensitive): stock quantity change without a movement needs approval; with a movement it passes', async () => {
  const p = (await data(s.base, admin)).products.find(x => x.id === 'p1');
  const bad = await send(s.base, clerk, ops({ cols: { products: col({ modified: [{ id: 'p1', before: { quantity: p.quantity }, after: { quantity: p.quantity + 50 } }] }) } }));
  assert.equal(bad.status, 403);
  assert.match(why(bad), /qty:products/);
  const ok = await send(s.base, clerk, ops({ cols: {
    stockMoves: col({ added: [{ id: 'sm1', productId: 'p1', type: 'in', quantity: 50, date: '2026-10-06', reference: 'شراء' }] }),
    products: col({ modified: [{ id: 'p1', before: { quantity: p.quantity }, after: { quantity: p.quantity + 50 } }] })
  } }));
  assert.equal(ok.status, 200);
});

test('a refused change is all-or-nothing (the allowed part is not saved either)', async () => {
  const r = await send(s.base, clerk, ops({ cols: {
    customers: col({ added: [{ id: 'c_partial', name: 'لازم ميتحفظش', balance: 0 }], removed: ['c2'] })
  } }));
  assert.equal(r.status, 403);
  const d = await data(s.base, admin);
  assert.equal(d.customers.some(c => c.id === 'c_partial'), false);
  assert.equal(d.customers.some(c => c.id === 'c2'), true);
});

test('sales cannot write admin settings (company name), but may write user-level ones', async () => {
  const bad = await send(s.base, clerk, ops({ keys: { companyName: 'اختراق' } }));
  assert.equal(bad.status, 403);
  const ok = await send(s.base, clerk, ops({ keys: { monthlyTarget: 50000 } }));
  assert.equal(ok.status, 200);
});

test('sales cannot replace a whole settings list at once (only item by item)', async () => {
  await send(s.base, admin, ops({ sets: { _debts: col({ added: [{ id: 'd1', name: 'بنك', amount: 1000, payments: [] }] }) } }));
  const r = await send(s.base, clerk, ops({ keys: { _debts: [] } }));
  assert.equal(r.status, 403);
});

test('closed period: changes dated inside it need approval even for approval=none users', async () => {
  await send(s.base, admin, ops({ keys: { closedUntil: '2026-09-30' } }));
  const free = await createUser(s.base, admin, { id: 'u_free', username: 'free', password: 'Free-User-Pass-1', name: 'حر', role: 'sales', approval: 'none' });
  const r = await send(s.base, free, ops({ cols: { invoices: col({ added: [{ id: 'i_old', number: 2002, customerId: 'c2', date: '2026-09-15', total: 5, paid: 0, items: [] }] }) } }));
  assert.equal(r.status, 403);
  assert.match(why(r), /closed:invoices/);
  const ok = await send(s.base, free, ops({ cols: { invoices: col({ added: [{ id: 'i_new', number: 2003, customerId: 'c2', date: '2026-10-05', total: 5, paid: 0, items: [] }] }) } }));
  assert.equal(ok.status, 200);
  await send(s.base, admin, ops({ keys: { closedUntil: null } }));
});

test('approval=none user may delete; approval=edits user needs approval for a plain edit', async () => {
  const none = await createUser(s.base, admin, { id: 'u_none', username: 'none', password: 'None-User-Pass-1', name: 'x', role: 'sales', approval: 'none' });
  await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_del', name: 'للمسح', balance: 0 }] }) } }));
  assert.equal((await send(s.base, none, ops({ cols: { customers: col({ removed: ['c_del'] }) } }))).status, 200);
  const edits = await createUser(s.base, admin, { id: 'u_edits', username: 'edits', password: 'Edits-User-Pass-1', name: 'x', role: 'sales', approval: 'edits' });
  const r = await send(s.base, edits, ops({ cols: { customers: col({ modified: [{ id: 'c2', before: {}, after: { phone: '0111' } }] }) } }));
  assert.equal(r.status, 403);
  assert.match(why(r), /ed:customers/);
});

test('admin is never asked for approval', async () => {
  const r = await send(s.base, admin, ops({ cols: { invoices: col({ modified: [{ id: 'i1', before: { notes: '' }, after: { notes: 'تعديل مدير' } }] }) } }));
  assert.equal(r.status, 200);
});

test('ids with quotes / tags are refused (they end up inside onclick handlers)', async () => {
  const r = await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: "x');alert(1);//", name: 'x', balance: 0 }] }) } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'bad_id');
});

test('__proto__ keys are stripped instead of polluting objects', async () => {
  const body = '{"ops":{"cols":{},"sets":{},"keys":{"__proto__":{"a":{"polluted":1}}},"counters":null},"opId":"proto-1"}';
  const r = await fetch(s.base + '/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body });
  assert.equal(r.status, 200);
  const d = await data(s.base, admin);
  assert.equal(d.settings.polluted, undefined);
  assert.equal(({}).polluted, undefined);
});

/* ── C1 · page permissions on the server (fixed in Phase 2: least privilege) ── */
test('C1 (fixed): a user limited to Dashboard+Issuances does not download costs, users, portal tokens or the settings lock', async () => {
  await send(s.base, admin, ops({ keys: { _portal: { c1: 'a'.repeat(40) }, _auditLock: 'f'.repeat(64) } }));
  const d = await data(s.base, sales);
  assert.equal(d.products.some(p => 'cost' in p), false, 'product cost visible');
  assert.equal((d.users || []).length <= 1, true, 'user list visible');
  assert.equal(d.settings._portal, undefined, 'portal tokens visible');
  assert.equal(d.settings._auditLock, undefined, 'settings lock hash visible');
  assert.equal((d.expenses || []).length, 0, 'expenses visible');
});

test('C1 (fixed): a user limited to Dashboard+Issuances cannot write expenses', async () => {
  const r = await send(s.base, sales, ops({ cols: { expenses: col({ added: [{ id: 'e_c1', description: 'من غير صلاحية', amount: 5000, date: '2026-10-05' }] }) } }));
  assert.equal(r.status, 403);
});

test('C1 (fixed): a user limited to Dashboard+Issuances cannot edit supplier records', async () => {
  const r = await send(s.base, sales, ops({ cols: { suppliers: col({ modified: [{ id: 's1', before: {}, after: { phone: '000' } }] }) } }));
  assert.equal(r.status, 403);
});

test('control: admin-only pages for the UI are listed the same in browser and server (axcore)', async () => {
  const r = await req(s.base, 'GET', '/js/axcore.js');
  assert.equal(r.status, 200);
  assert.match(r.text, /ADMIN_ONLY_PAGES = \['users', 'audit', 'settings', 'security'\]/);
});

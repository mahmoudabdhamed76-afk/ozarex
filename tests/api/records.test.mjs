/* Save / edit / delete, what really reaches the database (checked after a restart),
   duplicate ids, missing required fields (C2), document numbering (C5), audit (C3). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';
import { adminLogin, send, ops, col, data, createUser, seedOps, SALES } from '../helpers/api.mjs';

let s, admin, sales;
const relogin = async () => { admin = (await adminLogin(s.base)).token; };
before(async () => {
  s = await startServer();
  await relogin();
  assert.equal((await send(s.base, admin, seedOps())).status, 200);
  sales = await createUser(s.base, admin, SALES);
});
after(() => s.stop());

test('seeded records survive a restart with all their fields', async () => {
  await s.restart(); await relogin();
  const d = await data(s.base, admin);
  assert.equal(d.customers.length, 2);
  assert.equal(d.customers.find(c => c.id === 'c1').balance, 1000);
  assert.equal(d.products.find(p => p.id === 'p1').quantity, 500, 'quantity lives in the data JSON, must still round-trip');
  const inv = d.invoices.find(i => i.id === 'i1');
  assert.equal(inv.number, 1001);
  assert.equal(inv.items.length, 1);
  assert.equal(inv.items[0].productId, 'p1');
  assert.equal(d.payments[0].amount, 200);
  assert.equal(d.counters.invoice, 1001);
});

test('extra fields the app adds (not table columns) are kept', async () => {
  await send(s.base, admin, ops({ cols: { invoices: col({ added: [{ id: 'i_x', number: 1002, customerId: 'c2', date: '2026-10-03', total: 50, paid: 0, driver: 'أحمد', sourceIssuanceId: 'is9',
    items: [{ productId: 'p2', name: 'فيلم', qty: 1, price: 50, total: 50, unit: 'فيلم', batch: 'B-7' }] }] }) } }));
  await s.restart(); await relogin();
  const inv = (await data(s.base, admin)).invoices.find(i => i.id === 'i_x');
  assert.equal(inv.driver, 'أحمد');
  assert.equal(inv.sourceIssuanceId, 'is9');
  assert.equal(inv.items[0].batch, 'B-7');
});

test('edit: only the changed field moves, and it persists', async () => {
  const r = await send(s.base, admin, ops({ cols: { customers: col({ modified: [{ id: 'c2', before: { phone: '01000000002' }, after: { phone: '01234567890', address: 'شبين' } }] }) } }));
  assert.equal(r.status, 200);
  await s.restart(); await relogin();
  const c = (await data(s.base, admin)).customers.find(x => x.id === 'c2');
  assert.equal(c.phone, '01234567890');
  assert.equal(c.address, 'شبين');
  assert.equal(c.name, 'مركز الشفاء');
});

test('edit an invoice: items are replaced, not duplicated', async () => {
  await send(s.base, admin, ops({ cols: { invoices: col({ modified: [{ id: 'i1', before: {}, after: { items: [{ productId: 'p1', name: 'ورق A4', qty: 5, price: 120, total: 600 }, { productId: 'p2', name: 'فيلم', qty: 1, price: 45, total: 45 }], total: 645 } }] }) } }));
  await s.restart(); await relogin();
  const inv = (await data(s.base, admin)).invoices.find(i => i.id === 'i1');
  assert.equal(inv.items.length, 2);
  assert.equal(inv.total, 645);
});

test('delete: the record and its items are gone after a restart', async () => {
  assert.equal((await send(s.base, admin, ops({ cols: { invoices: col({ removed: ['i_x'] }), payments: col({ removed: ['pay1'] }) } }))).status, 200);
  await s.restart(); await relogin();
  const d = await data(s.base, admin);
  assert.equal(d.invoices.some(i => i.id === 'i_x'), false);
  assert.equal(d.payments.some(p => p.id === 'pay1'), false);
});

test('settings lists (debts, cheques…) are saved item by item and persist', async () => {
  await send(s.base, admin, ops({ sets: { _cheques: col({ added: [{ id: 'ch1', no: '123', amount: 500, status: 'pending' }, { id: 'ch2', no: '124', amount: 700, status: 'pending' }] }) } }));
  await send(s.base, admin, ops({ sets: { _cheques: col({ modified: [{ id: 'ch1', before: { status: 'pending' }, after: { status: 'cleared' } }], removed: ['ch2'] }) } }));
  await s.restart(); await relogin();
  const ch = (await data(s.base, admin)).settings._cheques;
  assert.deepEqual(ch.map(x => x.id + ':' + x.status), ['ch1:cleared']);
});

test('a malformed request is rejected cleanly', async () => {
  const r1 = await fetch(s.base + '/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body: '{not json' });
  assert.equal(r1.status, 400);
  const r2 = await fetch(s.base + '/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body: JSON.stringify({ opId: 'x' }) });
  assert.equal(r2.status, 400);
});

test('a body over the 15 MB limit is refused (413)', async () => {
  const big = JSON.stringify({ opId: 'big', ops: { cols: { notes: { added: [{ id: 'n1', body: 'x'.repeat(16 * 1024 * 1024) }], removed: [], modified: [] } } } });
  let status;
  try { status = (await fetch(s.base + '/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body: big })).status; }
  catch (_) { status = 413; /* the server may cut the connection while we are still sending */ }
  assert.equal(status, 413);
});

/* ── duplicate ids ── */
test('non-admin re-sending an existing id as "new" is treated as an edit and judged as one', async () => {
  const r = await send(s.base, sales, ops({ cols: { customers: col({ added: [{ id: 'c1', name: 'سجل تاني بنفس الرقم', balance: 0 }] }) } }));
  assert.equal(r.status, 403);
  assert.equal((await data(s.base, admin)).customers.find(c => c.id === 'c1').name, 'مركز النور');
});

test('[KNOWN BUG I10] a "new" record whose id already exists must not overwrite the old one', { todo: 'I10 — id collisions overwrite records' }, async () => {
  await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_dup', name: 'الأصلي', balance: 750 }] }) } }));
  const r = await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_dup', name: 'سجل تاني بنفس الرقم' }] }) } }));
  const c = (await data(s.base, admin)).customers.find(x => x.id === 'c_dup');
  assert.ok(r.status === 409 || (c.name === 'الأصلي' && c.balance === 750), `status ${r.status}, now: ${c.name} / balance ${c.balance}`);
});

/* ── C2 · required fields ── */
async function rejectedOrKept(o, table, id) {
  const r = await send(s.base, admin, o);
  if (r.status >= 400) return { ok: true };
  await s.restart(); await relogin();
  const kept = (await data(s.base, admin))[table].some(x => x.id === id);
  return { ok: kept, msg: `server said ${r.status} but after a restart the ${table} record is ${kept ? 'there' : 'GONE'}` };
}
test('[KNOWN BUG C2] a customer without a name is either refused or really saved', { todo: 'C2 — silent data loss' }, async () => {
  const x = await rejectedOrKept(ops({ cols: { customers: col({ added: [{ id: 'c_noname', phone: '0100', balance: 500 }] }) } }), 'customers', 'c_noname');
  assert.ok(x.ok, x.msg);
});
test('[KNOWN BUG C2] a payment without a date is either refused or really saved', { todo: 'C2 — silent data loss' }, async () => {
  const x = await rejectedOrKept(ops({ cols: { payments: col({ added: [{ id: 'pay_nodate', customerId: 'c1', amount: 300 }] }) } }), 'payments', 'pay_nodate');
  assert.ok(x.ok, x.msg);
});
test('[KNOWN BUG C2] a product without a name is either refused or really saved', { todo: 'C2 — silent data loss' }, async () => {
  const x = await rejectedOrKept(ops({ cols: { products: col({ added: [{ id: 'p_noname', quantity: 10, cost: 1 }] }) } }), 'products', 'p_noname');
  assert.ok(x.ok, x.msg);
});
test('control: an invoice without a date gets today (current behavior) and persists', async () => {
  await send(s.base, admin, ops({ cols: { invoices: col({ added: [{ id: 'i_nodate', number: 1003, customerId: 'c1', total: 1, items: [] }] }) } }));
  await s.restart(); await relogin();
  const inv = (await data(s.base, admin)).invoices.find(i => i.id === 'i_nodate');
  assert.ok(inv);
  assert.match(inv.date, /^\d{4}-\d{2}-\d{2}$/);
});

/* ── document numbering ── */
test('counters only move up (max wins), never back', async () => {
  await send(s.base, admin, ops({ counters: { invoice: 1010 } }));
  await send(s.base, sales, ops({ counters: { invoice: 1005 } }));
  await s.restart(); await relogin();
  assert.equal((await data(s.base, admin)).counters.invoice, 1010);
});

test('[KNOWN BUG C5] two devices must not both save invoice number 1500', { todo: 'C5 — numbers are assigned in the browser' }, async () => {
  const a = await send(s.base, admin, ops({ cols: { invoices: col({ added: [{ id: 'iA', number: 1500, customerId: 'c1', date: '2026-10-06', total: 10, paid: 0, items: [] }] }) }, counters: { invoice: 1500 } }));
  const b = await send(s.base, sales, ops({ cols: { invoices: col({ added: [{ id: 'iB', number: 1500, customerId: 'c2', date: '2026-10-06', total: 10, paid: 0, items: [] }] }) }, counters: { invoice: 1500 } }));
  assert.equal(a.status, 200);
  const nums = (await data(s.base, admin)).invoices.filter(i => i.number === 1500);
  assert.ok(b.status === 409 || nums.length === 1, `second save → ${b.status}; invoices numbered 1500: ${nums.map(i => i.id).join(', ')}`);
});

/* ── C3 · audit log (decision: created by the server, append-only) ── */
test('control: a non-admin cannot remove audit entries or add them in someone else\'s name', async () => {
  await send(s.base, admin, ops({ cols: { auditLog: col({ added: [{ id: 'au1', timestamp: Date.now(), userId: 'u1', operation: 'add', table: 'customers', recordId: 'c1' }] }) } }));
  await send(s.base, sales, ops({ cols: { auditLog: col({ added: [{ id: 'au_fake', timestamp: Date.now(), userId: 'u1', operation: 'delete', table: 'invoices' }], removed: ['au1'] }) } }));
  const log = (await data(s.base, admin)).auditLog;
  assert.ok(log.some(x => x.id === 'au1'));
  assert.equal(log.some(x => x.id === 'au_fake'), false);
});
test('[KNOWN BUG C3] the server records an audit entry for a change even if the device sends none', { todo: 'C3 — audit written by the browser' }, async () => {
  const r = await send(s.base, sales, ops({ cols: { expenses: col({ added: [{ id: 'e_noaudit', description: 'بدون سجل', amount: 99, date: '2026-10-06' }] }) } }));
  assert.equal(r.status, 200);
  const log = (await data(s.base, admin)).auditLog;
  assert.ok(log.some(x => JSON.stringify(x).includes('e_noaudit')), 'no audit entry for e_noaudit');
});
test('[KNOWN BUG C3] audit entries are append-only (not even the admin can delete them through sync)', { todo: 'C3 — audit log can be wiped' }, async () => {
  await send(s.base, admin, ops({ cols: { auditLog: col({ removed: ['au1'] }) } }));
  assert.ok((await data(s.base, admin)).auditLog.some(x => x.id === 'au1'), 'admin deleted au1');
});

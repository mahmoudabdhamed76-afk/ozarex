/* 4.33 · Multi-branch — Phase 3: «جميع الفروع». Known records in two branches → the exact numbers per branch and
   the total, with the same rules the screens use; periods; switched-off branches left out; admin only. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, ops, col, createUser, SALES } from '../helpers/api.mjs';

let s, admin;
const CA = 'b_cairo00001', MI = 'b_minya00001';
const sendB = (id, o) => req(s.base, 'POST', '/api/ops', { token: admin, headers: { 'X-Branch': id }, body: { ops: o, opId: randomUUID(), cid: 't' } });
const sum = async q => { const r = await req(s.base, 'GET', '/api/branches/summary' + (q || ''), { token: admin }); assert.equal(r.status, 200, r.text); return r.json; };

before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  /* main (منوف): an issuance 1000 (cost 600) + its invoice (made from it — must not count twice) + a stand-alone invoice 500
     with 10% discount (cost 200) · a payment 700 · an expense 100 · a purchase 300 from a supplier (paid 50) · stock */
  assert.equal((await sendB('main', ops({ cols: {
    customers: col({ added: [{ id: 'c1', name: 'مركز 1', balance: 800, customPrices: {} }, { id: 'c2', name: 'مركز 2', balance: -50, customPrices: {} }] }),
    products: col({ added: [{ id: 'p1', name: 'ورق', unit: 'ورقة', quantity: 100, minQuantity: 10, cost: 6, price: 10 }, { id: 'p2', name: 'فيلم', unit: 'فيلم', quantity: 5, minQuantity: 10, cost: 40, price: 100 }] }),
    suppliers: col({ added: [{ id: 's1', name: 'مورد', openingBalance: 100 }] }),
    issuances: col({ added: [{ id: 'is1', number: 1001, customerId: 'c1', productId: 'p1', productName: 'ورق', quantity: 100, unitPrice: 10, total: 1000, paid: 0, date: '2026-10-05', invoiceId: 'iv1', items: [] }] }),
    invoices: col({ added: [
      { id: 'iv1', number: 1001, customerId: 'c1', date: '2026-10-05', subtotal: 1000, total: 1000, paid: 0, sourceIssuanceId: 'is1', items: [{ productId: 'p1', name: 'ورق', qty: 100, price: 10, total: 1000 }] },
      { id: 'iv2', number: 1002, customerId: 'c2', date: '2026-10-06', subtotal: 500, discount: 50, total: 450, paid: 0, items: [{ productId: 'p2', name: 'فيلم', qty: 5, price: 100, total: 500 }] }] }),
    payments: col({ added: [{ id: 'py1', customerId: 'c1', amount: 700, date: '2026-10-07', method: 'نقدي' }] }),
    expenses: col({ added: [{ id: 'e1', description: 'نقل', amount: 100, date: '2026-10-07' }, { id: 'e2', kind: 'purchase', supplierId: 's1', supplierName: 'مورد', amount: 300, date: '2026-10-08', number: 1 }] }),
    supplierPayments: col({ added: [{ id: 'sp1', supplierId: 's1', amount: 50, date: '2026-10-08' }] })
  }, counters: { invoice: 1002, issuance: 1001 } }))).status, 200);
  /* القاهرة: one invoice 2000 in September (cost 1200) and a payment 2000 */
  assert.equal((await sendB(CA, ops({ cols: {
    customers: col({ added: [{ id: 'k1', name: 'مركز القاهرة', balance: 0, customPrices: {} }] }),
    products: col({ added: [{ id: 'kp', name: 'ورق القاهرة', unit: 'ورقة', quantity: 10, minQuantity: 0, cost: 120, price: 200 }] }),
    invoices: col({ added: [{ id: 'kv', number: 1001, customerId: 'k1', date: '2026-09-15', subtotal: 2000, total: 2000, paid: 2000, items: [{ productId: 'kp', name: 'ورق القاهرة', qty: 10, price: 200, total: 2000 }] }] }),
    payments: col({ added: [{ id: 'kp1', customerId: 'k1', amount: 2000, date: '2026-09-16', method: 'نقدي' }] })
  }, counters: { invoice: 1001 } }))).status, 200);
});
after(() => s.stop());

test('every branch\'s numbers follow the screens\' rules, and the total adds them up', async () => {
  const j = await sum('?p=all');
  assert.deepEqual(j.branches.map(b => b.id), ['main', CA, MI]);
  const m = j.branches.find(b => b.id === 'main'), c = j.branches.find(b => b.id === CA), mi = j.branches.find(b => b.id === MI);
  assert.equal(m.name, 'فرع منوف');
  assert.equal(m.sales, 1450, 'issuance 1000 + stand-alone invoice 450 (the invoice made from the issuance is not counted twice)');
  assert.equal(m.salesDocs, 2);
  assert.equal(m.revenue, 1450, 'after the 10% discount');
  assert.equal(m.cost, 600 + 200);
  assert.equal(m.gross, 650);
  assert.equal(m.expenses, 100, 'purchases are not expenses');
  assert.equal(m.profit, 550);
  assert.equal(m.purchases, 300);
  assert.equal(m.collections, 700);
  assert.equal(m.treasury, 700 - 400 - 50, 'payments − all expenses − supplier payments (the dashboard rule)');
  assert.equal(m.receivables, 800, 'only positive balances');
  assert.equal(m.payables, 100 + 300 - 50);
  assert.equal(m.stockValue, 100 * 6 + 5 * 40);
  assert.equal(m.lowStock, 1);
  assert.equal(c.sales, 2000); assert.equal(c.profit, 800); assert.equal(c.treasury, 2000); assert.equal(c.stockValue, 1200);
  assert.equal(mi.sales, 0); assert.equal(mi.profit, 0);
  assert.equal(j.total.sales, 3450); assert.equal(j.total.profit, 1350); assert.equal(j.total.treasury, 2250); assert.equal(j.total.collections, 2700);
});

test('periods: a custom range only counts what falls inside it', async () => {
  const oct = await sum('?p=custom&from=2026-10-01&to=2026-10-31');
  assert.equal(oct.from, '2026-10-01');
  assert.equal(oct.branches.find(b => b.id === CA).sales, 0, 'القاهرة sold in September');
  assert.equal(oct.total.sales, 1450);
  const sep = await sum('?p=custom&from=2026-09-01&to=2026-09-30');
  assert.equal(sep.total.sales, 2000);
  assert.equal(sep.branches.find(b => b.id === 'main').treasury, 250, 'balances are as of now, whatever the period');
  const td = await sum('?p=today');
  assert.equal(td.from, td.to);
});

test('a switched-off branch is left out; only the admin sees «جميع الفروع»', async () => {
  assert.equal((await req(s.base, 'PUT', '/api/branches/' + MI, { token: admin, body: { active: false } })).status, 200);
  assert.deepEqual((await sum('?p=all')).branches.map(b => b.id), ['main', CA]);
  assert.equal((await req(s.base, 'PUT', '/api/branches/' + MI, { token: admin, body: { active: true } })).status, 200);
  const sales = await createUser(s.base, admin, SALES);
  assert.equal((await req(s.base, 'GET', '/api/branches/summary', { token: sales })).status, 403);
});

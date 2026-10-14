/* 4.35 · Multi-branch — Phase 5: sales returns and purchase returns. A return is a new record in the branch's
   settings._returns + its stock moves and the customer's balance — the original documents never change. Who may
   add which return, nobody but the admin may change or delete one, a closed period is refused, the numbers
   («جميع الفروع») subtract it, and a return made in one branch stays in that branch. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, ops, col, createUser, SALES } from '../helpers/api.mjs';

let s, admin, sales, acct, keeper;
const CA = 'b_cairo00001';
const T0 = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const sendAs = (tok, o, branch, opId) => req(s.base, 'POST', '/api/ops', { token: tok, headers: branch ? { 'X-Branch': branch } : {}, body: { ops: o, opId: opId || randomUUID(), cid: 't' } });
const dataAs = async (tok, branch) => { const r = await req(s.base, 'GET', '/api/data', { token: tok, headers: branch ? { 'X-Branch': branch } : {} }); assert.equal(r.status, 200, r.text); return r.json; };
const sum = async () => { const r = await req(s.base, 'GET', '/api/branches/summary?p=all', { token: admin }); assert.equal(r.status, 200, r.text); return r.json; };

/* what the screen sends for a sales return of `qty` × 10 (stock back, `refund` in cash) */
function saleReturn(id, { qty = 20, refund = 50, date = T0, bal = 1000, q = 100 } = {}) {
  const amount = qty * 10;
  return ops({
    sets: { _returns: col({ added: [{ id, type: 'sale', number: 1, date, customerId: 'c1', customerName: 'مركز 1', src: { kind: 'iss', id: 'is1', number: 1001, label: 'صرف #1001' },
      items: [{ key: 'is1', productId: 'p1', name: 'ورق', qty, price: 10, total: amount, net: amount, stock: true }], amount, net: amount, refund, reason: 'العميل رجّعها', by: { id: 'x', name: 'x' }, at: Date.now() }] }) },
    cols: {
      customers: col({ modified: [{ id: 'c1', before: { balance: bal }, after: { balance: bal - (amount - refund) } }] }),
      products: col({ modified: [{ id: 'p1', before: { quantity: q }, after: { quantity: q + qty } }] }),
      stockMoves: col({ added: [{ id: 'sm_rt_' + id + '_0', productId: 'p1', type: 'in', quantity: qty, date, kind: 'return', returnId: id, reference: 'مرتجع مبيعات #1' }] })
    }
  });
}
function purchaseReturn(id, { qty = 5, refund = 0, q = 120 } = {}) {
  const amount = qty * 30;
  return ops({
    sets: { _returns: col({ added: [{ id, type: 'purchase', number: 1, date: T0, supplierId: 's1', supplierName: 'مورد', src: { kind: 'pur', id: 'e2', number: 1, label: 'فاتورة شراء #1' },
      items: [{ key: '0', productId: 'p1', name: 'ورق', qty, price: 30, total: amount, net: amount, stock: true }], amount, net: amount, refund, reason: 'بضاعة تالفة', by: { id: 'x', name: 'x' }, at: Date.now() }] }) },
    cols: {
      products: col({ modified: [{ id: 'p1', before: { quantity: q }, after: { quantity: q - qty } }] }),
      stockMoves: col({ added: [{ id: 'sm_rt_' + id + '_0', productId: 'p1', type: 'out', quantity: qty, date: T0, kind: 'return', returnId: id, reference: 'مرتجع مشتريات #1' }] })
    }
  });
}

before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  assert.equal((await sendAs(admin, ops({ cols: {
    customers: col({ added: [{ id: 'c1', name: 'مركز 1', balance: 1000, customPrices: {} }] }),
    products: col({ added: [{ id: 'p1', name: 'ورق', unit: 'ورقة', quantity: 100, minQuantity: 0, cost: 6, price: 10 }] }),
    suppliers: col({ added: [{ id: 's1', name: 'مورد', openingBalance: 0 }] }),
    issuances: col({ added: [{ id: 'is1', number: 1001, customerId: 'c1', productId: 'p1', productName: 'ورق', quantity: 100, unitPrice: 10, total: 1000, paid: 0, date: '2026-10-05', items: [] }] }),
    expenses: col({ added: [{ id: 'e2', kind: 'purchase', supplierId: 's1', supplierName: 'مورد', amount: 600, date: '2026-10-08', number: 1, paymentMethod: 'credit', items: [{ name: 'ورق', unit: 'ورقة', qty: 20, price: 30 }] }] })
  }, counters: { issuance: 1001 } }))).status, 200);
  sales = await createUser(s.base, admin, SALES);                                                    // pages: dashboard + issuances
  acct = await createUser(s.base, admin, { id: 'u_acct', username: 'acct', password: 'Acct-Test-Pass-1', name: 'محاسب', role: 'accountant' });
  keeper = await createUser(s.base, admin, { id: 'u_keep', username: 'keeper', password: 'Keep-Test-Pass-1', name: 'أمين مخزن', role: 'sales', pages: ['stock'] });
});
after(() => s.stop());

test('a sales user records a sales return: stock back, balance down, the issuance itself untouched', async () => {
  const op = randomUUID();
  const r = await sendAs(sales, saleReturn('rt_s1'), null, op);
  assert.equal(r.status, 200, r.text);
  const d = await dataAs(admin);
  assert.equal(d.customers.find(c => c.id === 'c1').balance, 1000 - 150, 'the return 200 − the 50 given back in cash');
  assert.equal(d.products.find(p => p.id === 'p1').quantity, 120);
  assert.equal(d.settings._returns.length, 1);
  const is1 = d.issuances.find(i => i.id === 'is1');
  assert.equal(is1.total, 1000); assert.equal(is1.quantity, 100); assert.equal(is1.paid, 0);   // the historical document never changes
  const mv = d.stockMoves.find(m => m.id === 'sm_rt_rt_s1_0');
  assert.equal(mv.kind, 'return'); assert.equal(mv.type, 'in');
  /* the same request again (a retry after a lost answer) changes nothing twice; the same return id from another request is refused */
  assert.equal((await sendAs(sales, saleReturn('rt_s1'), null, op)).status, 200);
  const dup = await sendAs(sales, saleReturn('rt_s1', { bal: 850, q: 120 }));
  assert.equal(dup.json.error, 'duplicate_id', dup.text);
  const d2 = await dataAs(admin);
  assert.equal(d2.settings._returns.length, 1);
  assert.equal(d2.customers.find(c => c.id === 'c1').balance, 850);
  assert.equal(d2.products.find(p => p.id === 'p1').quantity, 120);
});

test('the numbers subtract the return: sales, revenue, cost, profit and the cash given back', async () => {
  const m = (await sum()).branches.find(b => b.id === 'main');
  assert.equal(m.salesReturns, 200);
  assert.equal(m.sales, 1000 - 200);
  assert.equal(m.revenue, 800);
  assert.equal(m.cost, 600 - 20 * 6);
  assert.equal(m.profit, 800 - 480);
  assert.equal(m.treasury, -600 - 50, 'all expenses (the dashboard rule) − the 50 given back');
  assert.equal(m.receivables, 850);
});

test('who may add which return; nobody but the admin changes or deletes one', async () => {
  let r = await sendAs(sales, purchaseReturn('rt_p_bad'));
  assert.equal(r.status, 403, 'a sales user cannot make a purchase return');
  r = await sendAs(keeper, saleReturn('rt_k', { bal: 850, q: 120 }));
  assert.equal(r.status, 403, 'a stock keeper cannot make a sales return');
  r = await sendAs(sales, ops({ sets: { _returns: col({ removed: ['rt_s1'] }) } }));
  assert.equal(r.status, 403, 'a return is never deleted by a user');
  r = await sendAs(sales, ops({ sets: { _returns: col({ modified: [{ id: 'rt_s1', before: { amount: 200 }, after: { amount: 20 } }] }) } }));
  assert.equal(r.status, 403, 'a return is never edited by a user');
  r = await sendAs(sales, ops({ sets: { _returns: col({ added: [{ id: 'rt_x', type: 'gift', date: T0, amount: 5 }] }) } }));
  assert.equal(r.status, 403, 'only sale / purchase returns');
  assert.equal((await dataAs(admin)).settings._returns.length, 1);
});

test('an accountant records a purchase return: stock out, payables down; sales users never see purchase returns', async () => {
  const r = await sendAs(acct, purchaseReturn('rt_p1', { refund: 30 }));
  assert.equal(r.status, 200, r.text);
  const d = await dataAs(admin);
  assert.equal(d.products.find(p => p.id === 'p1').quantity, 115);
  assert.equal(d.expenses.find(e => e.id === 'e2').amount, 600, 'the purchase invoice itself never changes');
  const m = (await sum()).branches.find(b => b.id === 'main');
  assert.equal(m.purchaseReturns, 150);
  assert.equal(m.purchases, 600 - 150);
  assert.equal(m.payables, 600 - (150 - 30), 'the goods sent back (150) − the cash the supplier gave back (30)');
  assert.equal(m.treasury, -600 - 50 + 30);
  assert.deepEqual((await dataAs(sales)).settings._returns.map(x => x.type), ['sale'], 'purchase returns carry purchase prices');
  assert.deepEqual((await dataAs(acct)).settings._returns.map(x => x.type).sort(), ['purchase', 'sale']);
});

test('a return dated in a closed period needs the admin', async () => {
  assert.equal((await sendAs(admin, ops({ keys: { closedUntil: '2026-09-30' } }))).status, 200);
  const d = await dataAs(admin);
  const bal = d.customers.find(c => c.id === 'c1').balance, q = d.products.find(p => p.id === 'p1').quantity;
  const r = await sendAs(sales, saleReturn('rt_old', { qty: 1, refund: 0, date: '2026-09-20', bal, q }));
  assert.equal(r.status, 403, r.text);
  assert.equal(r.json.error, 'needs_approval');
  assert.ok(r.json.why.some(w => w.t === 'closed'));
  assert.equal((await dataAs(admin)).settings._returns.length, 2);
  assert.equal((await sendAs(admin, ops({ keys: { closedUntil: null } }))).status, 200);
});

test('a return made in القاهرة stays in القاهرة', async () => {
  assert.equal((await sendAs(admin, ops({ cols: {
    customers: col({ added: [{ id: 'c1', name: 'مركز القاهرة', balance: 500, customPrices: {} }] }),
    products: col({ added: [{ id: 'p1', name: 'ورق', unit: 'ورقة', quantity: 10, minQuantity: 0, cost: 6, price: 10 }] }),
    issuances: col({ added: [{ id: 'is1', number: 1001, customerId: 'c1', productId: 'p1', productName: 'ورق', quantity: 50, unitPrice: 10, total: 500, paid: 0, date: '2026-10-05', items: [] }] })
  } }), CA)).status, 200);
  assert.equal((await sendAs(admin, saleReturn('rt_ca', { qty: 5, refund: 0, bal: 500, q: 10 }), CA)).status, 200);
  const ca = await dataAs(admin, CA), mn = await dataAs(admin);
  assert.deepEqual(ca.settings._returns.map(x => x.id), ['rt_ca']);
  assert.equal(ca.customers.find(c => c.id === 'c1').balance, 450);
  assert.ok(!mn.settings._returns.some(x => x.id === 'rt_ca'));
  assert.equal(mn.customers.find(c => c.id === 'c1').balance, 850, 'the main branch customer with the same id is not touched');
  const j = await sum();
  assert.equal(j.branches.find(b => b.id === CA).salesReturns, 50);
  assert.equal(j.total.salesReturns, 250);
});

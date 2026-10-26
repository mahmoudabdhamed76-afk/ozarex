/* 4.34 · Multi-branch — Phase 4: transfers between branches. Money moves between the branches' cash; nothing is a
   sale / expense / profit; nothing happens twice; a cancel puts everything back; permissions; a step cut in the middle
   is finished or undone at start.
   4.50: a transfer now arrives in the same action it is sent (first test block, the normal server). The older two-step
   flow (send · «تأكيد الاستلام» later) is still what transfers left «في الطريق» from before 4.50 go through, so the rest
   of the file runs a server in that mode (TRANSFERS_TWO_STEP=1) to keep receive / cancel / recovery covered. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, login, ops, col, createUser, SALES } from '../helpers/api.mjs';

let s, admin;
const CA = 'b_cairo00001', MI = 'b_minya00001';
const dataB = async (id, tok = admin) => { const r = await req(s.base, 'GET', '/api/data', { token: tok, headers: { 'X-Branch': id } }); assert.equal(r.status, 200, r.text); return r.json; };
const prod = (d, name) => d.products.find(p => p.name === name);
const tr = (body, tok = admin) => req(s.base, 'POST', '/api/transfers', { token: tok, body: Object.assign({ rid: randomUUID() }, body) });
const act = (id, what, tok = admin) => req(s.base, 'POST', '/api/transfers/' + id + '/' + what, { token: tok });
const sum = async () => (await req(s.base, 'GET', '/api/branches/summary?p=all', { token: admin })).json;
const relogin = async () => { admin = (await adminLogin(s.base)).token; };

before(async () => {
  s = await startServer({ env: { TRANSFERS_TWO_STEP: '1' } });
  await relogin();
  assert.equal((await req(s.base, 'POST', '/api/ops', { token: admin, body: { opId: randomUUID(), cid: 't', ops: ops({ cols: {
    customers: col({ added: [{ id: 'c1', name: 'مركز', balance: 0, customPrices: {} }] }),
    products: col({ added: [{ id: 'p1', name: 'ورق A4', unit: 'رزمة', sku: 'A4-80', quantity: 100, minQuantity: 5, cost: 150, price: 200 },
      { id: 'p2', name: 'فيلم 35×43', unit: 'علبة', quantity: 20, minQuantity: 2, cost: 900, price: 1200 }] }),
    issuances: col({ added: [{ id: 'is1', number: 1001, customerId: 'c1', productId: 'p1', productName: 'ورق A4', quantity: 10, unitPrice: 200, total: 2000, paid: 0, date: '2026-10-10', items: [] }] }),
    payments: col({ added: [{ id: 'py1', customerId: 'c1', amount: 5000, date: '2026-10-10', method: 'نقدي' }] })
  }, counters: { issuance: 1001 } }) } })).status, 200);
});
after(() => s.stop());

let t1;
test('goods: «إرسال» takes them out of the sender only; «تأكيد الاستلام» puts them into the receiver (a missing product is made there)', async () => {
  const before0 = await sum();
  const r = await tr({ kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 30 }, { productId: 'p2', qty: 5 }], note: 'تجهيز فرع القاهرة' });
  assert.equal(r.status, 200, r.text);
  t1 = r.json.transfer;
  assert.equal(t1.status, 'sent'); assert.equal(t1.number, 1); assert.equal(t1.fromName, 'فرع منوف'); assert.equal(t1.toName, 'فرع القاهرة');
  const m = await dataB('main');
  assert.equal(prod(m, 'ورق A4').quantity, 70); assert.equal(prod(m, 'فيلم 35×43').quantity, 15);
  const out = m.stockMoves.filter(x => x.transferId === t1.id);
  assert.equal(out.length, 2); assert.ok(out.every(x => x.type === 'out' && x.kind === 'transfer'));
  assert.equal((await dataB(CA)).products.length, 0, 'nothing arrives before it is confirmed');
  /* a transfer is not a sale, an expense or a profit */
  const after1 = await sum(), bm = b => b.branches.find(x => x.id === 'main');
  ['sales', 'profit', 'expenses', 'purchases', 'treasury'].forEach(k => assert.equal(bm(after1)[k], bm(before0)[k], k + ' unchanged'));
  assert.equal(bm(after1).stockValue, bm(before0).stockValue - 30 * 150 - 5 * 900, 'only the stock value moves');
  /* receive in القاهرة */
  const rc = await act(t1.id, 'receive');
  assert.equal(rc.status, 200, rc.text); assert.equal(rc.json.transfer.status, 'received');
  const c = await dataB(CA);
  assert.equal(prod(c, 'ورق A4').quantity, 30); assert.equal(prod(c, 'ورق A4').sku, 'A4-80'); assert.equal(prod(c, 'ورق A4').cost, 150);
  assert.equal(prod(c, 'فيلم 35×43').quantity, 5);
  assert.ok(c.stockMoves.filter(x => x.transferId === t1.id).every(x => x.type === 'in' && x.kind === 'transfer'));
  const cb = (await sum()).branches.find(x => x.id === CA);
  assert.equal(cb.sales, 0); assert.equal(cb.purchases, 0); assert.equal(cb.stockValue, 30 * 150 + 5 * 900);
});

test('never twice: the same receive again, the same request again, a received transfer can not be cancelled', async () => {
  const again = await act(t1.id, 'receive');
  assert.equal(again.status, 200); assert.equal(again.json.dup, true);
  assert.equal(prod(await dataB(CA), 'ورق A4').quantity, 30, 'not added twice');
  const rid = randomUUID();
  const a = await tr({ rid, kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 10 }] });
  const b = await tr({ rid, kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 10 }] });
  assert.equal(a.status, 200); assert.equal(b.json.dup, true); assert.equal(b.json.transfer.id, a.json.transfer.id);
  assert.equal(prod(await dataB('main'), 'ورق A4').quantity, 60, '70 − 10 once');
  assert.equal((await act(t1.id, 'cancel')).status, 400);
  /* the second one lands on the product already there (matched by its code) — no duplicate product */
  assert.equal((await act(a.json.transfer.id, 'receive')).status, 200);
  const c = await dataB(CA);
  assert.equal(c.products.filter(p => p.name === 'ورق A4').length, 1);
  assert.equal(prod(c, 'ورق A4').quantity, 40);
});

test('checks: not more than what is there, not to the same branch, not empty', async () => {
  const r = await tr({ kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p2', qty: 999 }] });
  assert.equal(r.status, 400); assert.match(r.json.message, /المتاح 15/);
  assert.equal((await tr({ kind: 'stock', from: 'main', to: 'main', items: [{ productId: 'p2', qty: 1 }] })).status, 400);
  assert.equal((await tr({ kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p2', qty: 0 }] })).status, 400);
  assert.equal((await tr({ kind: 'cash', from: 'main', to: CA, amount: -5 })).status, 400);
  assert.equal(prod(await dataB('main'), 'فيلم 35×43').quantity, 15, 'nothing moved');
});

test('cancel before it is received: everything goes back to the sender; a cancelled transfer can not be received', async () => {
  const r = await tr({ kind: 'stock', from: 'main', to: MI, items: [{ productId: 'p2', qty: 4 }] });
  assert.equal(prod(await dataB('main'), 'فيلم 35×43').quantity, 11);
  const c = await act(r.json.transfer.id, 'cancel');
  assert.equal(c.status, 200); assert.equal(c.json.transfer.status, 'cancelled');
  assert.equal(prod(await dataB('main'), 'فيلم 35×43').quantity, 15, 'back');
  assert.equal((await act(r.json.transfer.id, 'receive')).status, 400);
  assert.equal((await dataB(MI)).products.length, 0);
});

test('money: out of the sender\'s cash on «إرسال», into the receiver\'s on «استلام» — never a sale, an expense or a profit', async () => {
  const b0 = await sum(), bm = (j, id) => j.branches.find(x => x.id === id);
  const r = await tr({ kind: 'cash', from: 'main', to: MI, amount: 1500, note: 'مصاريف تشغيل' });
  assert.equal(r.status, 200, r.text);
  const b1 = await sum();
  assert.equal(bm(b1, 'main').treasury, bm(b0, 'main').treasury - 1500);
  assert.equal(bm(b1, MI).treasury, bm(b0, MI).treasury, 'not yet');
  assert.equal((await act(r.json.transfer.id, 'receive')).status, 200);
  const b2 = await sum();
  assert.equal(bm(b2, MI).treasury, bm(b0, MI).treasury + 1500);
  assert.equal(b2.total.treasury, b0.total.treasury, 'the company total stays the same');
  ['sales', 'profit', 'expenses', 'collections'].forEach(k => assert.equal(b2.total[k], b0.total[k], k));
  const mi = await dataB(MI);
  assert.equal(mi.settings._cashMoves.length, 1); assert.equal(mi.settings._cashMoves[0].dir, 'in');
  assert.ok(!(await dataB(CA)).settings._cashMoves, 'القاهرة untouched');
});

test('permissions: only someone who works with that stock / cash in that branch; receiving is the receiving branch\'s', async () => {
  const sales = await createUser(s.base, admin, SALES);                         // pages: dashboard + issuances, main only
  assert.equal((await tr({ kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 1 }] }, sales)).status, 403);
  await createUser(s.base, admin, { id: 'u_st', username: 'store1', password: 'Store-Test-Pass-1', name: 'أمين مخزن منوف', role: 'sales', pages: ['inventory'], branches: ['main'] });
  const st = (await login(s.base, 'store1', 'Store-Test-Pass-1')).token;
  const r = await tr({ kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 2 }] }, st);
  assert.equal(r.status, 200, r.text);
  assert.equal((await act(r.json.transfer.id, 'receive', st)).status, 403, 'he has no access to القاهرة');
  assert.equal((await tr({ kind: 'stock', from: CA, to: 'main', items: [{ productId: 'x', qty: 1 }] }, st)).status, 403);
  assert.equal((await tr({ kind: 'cash', from: 'main', to: CA, amount: 10 }, st)).status, 403, 'no cash pages');
  const ls = (await req(s.base, 'GET', '/api/transfers', { token: st })).json.transfers;
  assert.ok(ls.length >= 1 && ls.every(t => t.from === 'main' || t.to === 'main'));
  assert.equal((await act(r.json.transfer.id, 'receive')).status, 200);
});

test('a step cut in the middle (server stopped) is finished or undone at the next start', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'erp-tr-'));
  let x = await startServer({ dataDir: dir, env: { TRANSFERS_TWO_STEP: '1' } });
  try {
    let tok = (await adminLogin(x.base)).token;
    assert.equal((await req(x.base, 'POST', '/api/ops', { token: tok, body: { opId: randomUUID(), cid: 't', ops: ops({ cols: { products: col({ added: [{ id: 'p1', name: 'ورق A4', unit: 'رزمة', quantity: 50, minQuantity: 0, cost: 10, price: 20 }] }) } }) } })).status, 200);
    const sent = await req(x.base, 'POST', '/api/transfers', { token: tok, body: { rid: randomUUID(), kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 3 }] } });
    assert.equal(sent.status, 200, sent.text);
    const id = sent.json.transfer.id;
    await x.stop();                                                            // dataDir is ours → kept
    /* pretend: a receive cut before it touched القاهرة · a send cut before anything left منوف */
    const db = new DatabaseSync(path.join(dir, 'erp.db'));
    db.prepare("UPDATE branch_transfers SET status = 'receiving' WHERE id = ?").run(id);
    const g = db.prepare('SELECT * FROM branch_transfers WHERE id = ?').get(id);
    db.prepare("INSERT INTO branch_transfers (id, number, kind, from_branch, to_branch, status, data, created_at, updated_at) VALUES (?, 999, 'stock', 'main', ?, 'sending', ?, ?, ?)")
      .run('tr_ghost00000000000001', CA, g.data.replace(/"qty":3/, '"qty":7'), g.created_at, g.updated_at);
    db.close();
    x = await startServer({ dataDir: dir, env: { TRANSFERS_TWO_STEP: '1' } });
    tok = (await adminLogin(x.base)).token;
    const ls = (await req(x.base, 'GET', '/api/transfers', { token: tok })).json.transfers;
    assert.equal(ls.find(t => t.id === id).status, 'sent', 'the receive never happened → back to «في الطريق»');
    assert.ok(!ls.some(t => t.id === 'tr_ghost00000000000001'), 'a send that took nothing out → no document');
    const main = (await req(x.base, 'GET', '/api/data', { token: tok })).json;
    assert.equal(main.products.find(p => p.id === 'p1').quantity, 47, 'only the real send (3) left منوف');
    assert.equal((await req(x.base, 'POST', '/api/transfers/' + id + '/receive', { token: tok })).status, 200);
    const ca = (await req(x.base, 'GET', '/api/data', { token: tok, headers: { 'X-Branch': CA } })).json;
    assert.equal(ca.products.find(p => p.name === 'ورق A4').quantity, 3, 'received exactly once');
  } finally { await x.stop(); rmSync(dir, { recursive: true, force: true }); }
});

/* ═══ 4.50 · one step: sent = arrived ═══ */
test('4.50: goods sent from one branch arrive in the other at once — out of منوف, into القاهرة, never a sale, never twice', async () => {
  const y = await startServer();
  try {
    const tok = (await adminLogin(y.base)).token;
    const get = async (b) => (await req(y.base, 'GET', '/api/data', { token: tok, headers: { 'X-Branch': b } })).json;
    assert.equal((await req(y.base, 'POST', '/api/ops', { token: tok, body: { opId: randomUUID(), cid: 't', ops: ops({ cols: {
      products: col({ added: [{ id: 'p1', name: 'ورق A4', unit: 'رزمة', sku: 'A4-80', quantity: 100, minQuantity: 5, cost: 150, price: 200 }] }) } }) } })).status, 200);
    const sm = async () => (await req(y.base, 'GET', '/api/branches/summary?p=all', { token: tok })).json;
    const b0 = await sm();
    const rid = randomUUID();
    const r = await req(y.base, 'POST', '/api/transfers', { token: tok, body: { rid, kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 30 }] } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.transfer.status, 'received');
    assert.equal(r.json.transfer.auto, true);
    assert.equal(prod(await get('main'), 'ورق A4').quantity, 70, 'out of the sender');
    const c = await get(CA);
    assert.equal(prod(c, 'ورق A4').quantity, 30, 'into the receiver — no confirmation needed');
    assert.equal(prod(c, 'ورق A4').cost, 150);
    assert.deepEqual(c.stockMoves.filter(x => x.kind === 'transfer').map(x => x.type), ['in']);
    /* the same request again (a retry) — nothing twice */
    const again = await req(y.base, 'POST', '/api/transfers', { token: tok, body: { rid, kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 30 }] } });
    assert.equal(again.json.dup, true);
    assert.equal(prod(await get('main'), 'ورق A4').quantity, 70);
    assert.equal(prod(await get(CA), 'ورق A4').quantity, 30);
    /* a second one lands on the same product there */
    await req(y.base, 'POST', '/api/transfers', { token: tok, body: { rid: randomUUID(), kind: 'stock', from: 'main', to: CA, items: [{ productId: 'p1', qty: 5 }] } });
    assert.equal((await get(CA)).products.filter(p => p.name === 'ورق A4').length, 1);
    assert.equal(prod(await get(CA), 'ورق A4').quantity, 35);
    /* the company did not gain or lose anything */
    const b1 = await sm();
    assert.equal(b1.total.stockValue, b0.total.stockValue, 'stock value only moved between branches');
    ['sales', 'profit', 'expenses', 'purchases'].forEach(k => assert.equal(b1.total[k], b0.total[k], k));
    /* already arrived → can not be cancelled (send it back with a new transfer) */
    assert.equal((await req(y.base, 'POST', '/api/transfers/' + r.json.transfer.id + '/cancel', { token: tok })).status, 400);
    /* money arrives at once too */
    const m = await req(y.base, 'POST', '/api/transfers', { token: tok, body: { rid: randomUUID(), kind: 'cash', from: 'main', to: CA, amount: 1500 } });
    assert.equal(m.json.transfer.status, 'received');
    const b2 = await sm(), bm = id => b2.branches.find(x => x.id === id), bm0 = id => b0.branches.find(x => x.id === id);
    assert.equal(bm('main').treasury, bm0('main').treasury - 1500);
    assert.equal(bm(CA).treasury, bm0(CA).treasury + 1500);
    assert.equal(b2.total.treasury, b0.total.treasury);
  } finally { await y.stop(); }
});

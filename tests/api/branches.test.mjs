/* 4.32 · Multi-branch — Phase 1 (server foundation).
   The main branch is the existing database, unchanged; every other branch has its own file.
   Proves: isolation both ways (also after a restart), independent numbering, the company part
   (users + shared settings) stays in main, branch permissions enforced by the server, live
   updates per branch, per-branch backups / restore / reset that never touch main. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, login, send, ops, col, data, createUser, seedOps, SALES } from '../helpers/api.mjs';

let s, admin, menouf, cairo;
const B = id => ({ 'X-Branch': id });
const getB = async (tok, id) => { const r = await req(s.base, 'GET', '/api/data', { token: tok, headers: B(id) }); return r; };
const dataB = async (tok, id) => { const r = await getB(tok, id); assert.equal(r.status, 200, r.text); return r.json; };
const sendB = (tok, id, o, opId = randomUUID()) => req(s.base, 'POST', '/api/ops', { token: tok, headers: B(id), body: { ops: o, opId, cid: 'test' } });
const relogin = async () => { admin = (await adminLogin(s.base)).token; };
const mainSnapshot = d => JSON.stringify({ c: d.customers.map(x => [x.id, x.name, x.balance]).sort(), p: d.products.map(x => [x.id, x.quantity]).sort(), i: d.invoices.map(x => [x.id, x.number, x.total, x.paid]).sort(), pay: d.payments.map(x => [x.id, x.amount]).sort(), cnt: d.counters });

before(async () => {
  s = await startServer();
  await relogin();
  assert.equal((await send(s.base, admin, seedOps())).status, 200);
});
after(() => s.stop());

test('the main branch is there, named, and is what a request without a branch gets (old devices unchanged)', async () => {
  const r = await req(s.base, 'GET', '/api/branches', { token: admin });
  assert.equal(r.status, 200);
  const m = r.json.branches.find(b => b.id === 'main');
  assert.ok(m && m.main && m.active && m.name === 'الفرع الأساسي');
  const plain = await data(s.base, admin), viaHeader = await dataB(admin, 'main');
  assert.equal(mainSnapshot(plain), mainSnapshot(viaHeader));
  assert.equal(viaHeader.__branch, 'main');
});

test('only the admin creates branches; a new branch starts empty with its own numbering', async () => {
  const sales = await createUser(s.base, admin, SALES);
  assert.equal((await req(s.base, 'POST', '/api/branches', { token: sales, body: { name: 'فرع ممنوع' } })).status, 403);
  const a = await req(s.base, 'POST', '/api/branches', { token: admin, body: { name: 'فرع منوف', code: 'MN' } });
  assert.equal(a.status, 200, a.text); menouf = a.json.branch.id;
  const b = await req(s.base, 'POST', '/api/branches', { token: admin, body: { name: 'فرع القاهرة', code: 'CA' } });
  cairo = b.json.branch.id;
  assert.match(menouf, /^b_[a-z0-9]+$/);
  assert.equal((await req(s.base, 'POST', '/api/branches', { token: admin, body: { name: 'فرع منوف' } })).status, 400, 'same name twice');
  assert.ok(existsSync(path.join(s.dataDir, 'branches', menouf + '.db')), 'its own database file');
  const d = await dataB(admin, menouf);
  ['customers', 'products', 'invoices', 'issuances', 'payments', 'expenses', 'suppliers', 'stockMoves'].forEach(k => assert.deepEqual(d[k], [], k + ' starts empty'));
  assert.equal(d.counters.invoice, 1000);
  assert.ok(d.users.some(u => u.username === 'admin'), 'the company users are shown');
});

test('isolation both ways — a branch never sees the main branch and the main branch never changes', async () => {
  const before0 = mainSnapshot(await data(s.base, admin));
  const r = await sendB(admin, menouf, ops({ cols: {
    customers: col({ added: [{ id: 'c1', name: 'مركز منوف', balance: 700, customPrices: {} }, { id: 'mc2', name: 'مركز شبين', balance: 0, customPrices: {} }] }),
    products: col({ added: [{ id: 'p1', name: 'ورق منوف', unit: 'ورقة', quantity: 90, minQuantity: 5, cost: 70, price: 100 }] }),
    invoices: col({ added: [{ id: 'mi1', number: 1001, customerId: 'c1', date: '2026-10-13', subtotal: 700, total: 700, paid: 0, status: 'unpaid', items: [{ productId: 'p1', name: 'ورق منوف', qty: 7, price: 100, total: 700 }] }] }),
    payments: col({ added: [{ id: 'mp1', customerId: 'c1', amount: 300, date: '2026-10-13', method: 'نقدي' }] })
  }, counters: { invoice: 1001 } }));
  assert.equal(r.status, 200, r.text);
  assert.ok(!r.json.renumbered, 'number 1001 is free in this branch even though main has 1001');
  const m = await dataB(admin, menouf);
  assert.deepEqual(m.customers.map(c => c.name).sort(), ['مركز شبين', 'مركز منوف']);
  assert.equal(m.invoices[0].number, 1001);
  assert.equal(m.payments.length, 1);
  /* main: byte-for-byte what it was */
  assert.equal(mainSnapshot(await data(s.base, admin)), before0);
  /* the other branch: still empty */
  const c = await dataB(admin, cairo);
  assert.deepEqual(c.customers, []); assert.deepEqual(c.invoices, []);
  /* an edit in main does not leak into the branch (same id «c1» in both) */
  assert.equal((await send(s.base, admin, ops({ cols: { customers: col({ modified: [{ id: 'c1', before: { name: 'مركز النور' }, after: { name: 'مركز النور الجديد' } }] }) } }))).status, 200);
  assert.equal((await dataB(admin, menouf)).customers.find(x => x.id === 'c1').name, 'مركز منوف');
  /* … and after a restart it is all still separate */
  await s.restart(); await relogin();
  const m2 = await dataB(admin, menouf), main2 = await data(s.base, admin);
  assert.equal(m2.customers.find(x => x.id === 'c1').name, 'مركز منوف');
  assert.equal(m2.products.find(x => x.id === 'p1').quantity, 90);
  assert.equal(main2.customers.find(x => x.id === 'c1').name, 'مركز النور الجديد');
  assert.equal(main2.products.find(x => x.id === 'p1').quantity, 500);
  assert.equal(main2.invoices.length, 1);
});

test('each branch keeps its own audit log', async () => {
  const m = await dataB(admin, menouf), main = await data(s.base, admin);
  assert.ok(m.auditLog.some(e => e.table === 'invoices' && e.recordId === 'mi1'));
  assert.ok(!main.auditLog.some(e => e.recordId === 'mi1'), 'the branch invoice is not in the main log');
});

test('company part goes to main: a user or the company name changed from a branch is the same everywhere; a branch list stays in its branch', async () => {
  const u = { id: 'u_mn', username: 'mona', password: 'Mona-Test-Pass-31', name: 'منى', role: 'accountant', branches: [menouf] };
  const r = await sendB(admin, menouf, ops({ cols: { users: col({ added: [u] }) }, keys: { companyName: 'شركة التجربة' }, sets: { _cheques: col({ added: [{ id: 'chq1', no: '55', amount: 900, dir: 'in', status: 'pending', due: '2026-11-01' }] }) } }));
  assert.equal(r.status, 200, r.text);
  assert.equal((await login(s.base, 'mona', u.password)).status, 200, 'the user really exists (main users table)');
  const main = await data(s.base, admin), m = await dataB(admin, menouf), c = await dataB(admin, cairo);
  assert.equal(main.settings.companyName, 'شركة التجربة'); assert.equal(m.settings.companyName, 'شركة التجربة'); assert.equal(c.settings.companyName, 'شركة التجربة');
  assert.ok(main.users.some(x => x.username === 'mona'));
  assert.equal((m.settings._cheques || []).length, 1, 'the cheque is in منوف');
  assert.ok(!(main.settings._cheques || []).length, 'not in main');
  assert.ok(!(c.settings._cheques || []).length, 'not in القاهرة');
});

test('branch permissions are enforced by the server', async () => {
  const sales = (await login(s.base, SALES.username, SALES.password)).token;
  /* a user who was never given branches keeps the main branch only — as before */
  assert.equal((await getB(sales, 'main')).status, 200);
  assert.equal((await getB(sales, menouf)).status, 403);
  assert.equal((await sendB(sales, menouf, ops({ cols: { issuances: col({ added: [{ id: 'x1', number: 1, customerId: 'c1', date: '2026-10-13', total: 1 }] }) } }))).status, 403);
  /* mona: منوف only */
  const mona = (await login(s.base, 'mona', 'Mona-Test-Pass-31')).token;
  assert.equal((await getB(mona, menouf)).status, 200);
  assert.equal((await getB(mona, 'main')).status, 403, 'not given main');
  assert.equal((await getB(mona, cairo)).status, 403);
  assert.deepEqual((await req(s.base, 'GET', '/api/branches', { token: mona })).json.branches.map(b => b.id), [menouf]);
  /* a non-admin can not hand himself a branch */
  assert.equal((await sendB(mona, menouf, ops({ cols: { users: col({ modified: [{ id: 'u_mn', before: { branches: [menouf] }, after: { branches: [menouf, cairo] } }] }) } }))).status, 403);
  /* unknown branch */
  assert.equal((await getB(admin, 'b_nothere000')).status, 404);
});

test('a branch can be renamed and switched off (never deleted); the main branch can not be switched off', async () => {
  assert.equal((await req(s.base, 'PUT', '/api/branches/main', { token: admin, body: { active: false } })).status, 400);
  const r = await req(s.base, 'PUT', '/api/branches/' + cairo, { token: admin, body: { name: 'فرع القاهرة الجديدة', active: false } });
  assert.equal(r.status, 200); assert.equal(r.json.branch.active, false);
  assert.equal((await getB(admin, cairo)).status, 403, 'a switched-off branch can not be opened');
  assert.equal((await req(s.base, 'PUT', '/api/branches/' + cairo, { token: admin, body: { active: true } })).json.branch.name, 'فرع القاهرة الجديدة');
  assert.equal((await getB(admin, cairo)).status, 200);
});

test('live updates: a change in a branch is announced to that branch only', async () => {
  const open = async id => {
    const ac = new AbortController();
    const r = await fetch(s.base + '/api/events?branch=' + id, { headers: { Authorization: 'Bearer ' + admin }, signal: ac.signal });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    (async () => { try { for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); } } catch (_) { /* closed */ } })();
    return { text: () => buf, close: () => ac.abort() };
  };
  const evMain = await open('main'), evMn = await open(menouf);
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await sendB(admin, menouf, ops({ cols: { customers: col({ added: [{ id: 'mc3', name: 'مركز ثالث', balance: 0, customPrices: {} }] }) } }))).status, 200);
  await new Promise(r => setTimeout(r, 500));
  const n = t => (t.match(/"event":"data_changed"/g) || []).length;
  assert.equal(n(evMn.text()), 1, 'منوف hears it');
  assert.equal(n(evMain.text()), 0, 'main does not');
  assert.match(evMn.text(), new RegExp('"branch":"' + menouf + '"'));
  evMain.close(); evMn.close();
});

test('the same operation id is applied once, whatever branch it is sent to', async () => {
  const id = randomUUID(), o = ops({ cols: { expenses: col({ added: [{ id: 'me1', description: 'نقل', amount: 50, date: '2026-10-13' }] }) } });
  assert.equal((await sendB(admin, menouf, o, id)).status, 200);
  const again = await sendB(admin, menouf, o, id);
  assert.equal(again.json.dup, true);
  assert.equal((await dataB(admin, menouf)).expenses.length, 1);
});

test('backups per branch: their own folder; restore and reset of a branch never touch main', async () => {
  const mainBefore = mainSnapshot(await data(s.base, admin));
  const b = await req(s.base, 'POST', '/api/backup/now', { token: admin, headers: B(menouf) });
  assert.equal(b.status, 200);
  assert.ok(existsSync(path.join(s.dataDir, 'backups', 'branches', menouf, b.json.file)));
  const lst = await req(s.base, 'GET', '/api/backups', { token: admin, headers: B(menouf) });
  assert.equal(lst.json.branch, menouf); assert.equal(lst.json.files.length, 1);
  /* restore a small file into منوف */
  const blob = await dataB(admin, menouf);
  blob.customers = blob.customers.filter(c => c.id === 'c1');
  const rs = await req(s.base, 'POST', '/api/data', { token: admin, headers: B(menouf), body: blob });
  assert.equal(rs.status, 200, rs.text);
  assert.equal((await dataB(admin, menouf)).customers.length, 1);
  assert.equal(mainSnapshot(await data(s.base, admin)), mainBefore, 'restore of a branch: main untouched');
  /* reset منوف */
  assert.equal((await req(s.base, 'POST', '/api/reset', { token: admin, headers: B(menouf) })).status, 200);
  const m = await dataB(admin, menouf);
  assert.deepEqual(m.customers, []); assert.deepEqual(m.invoices, []);
  assert.ok(m.users.some(u => u.username === 'mona'), 'users are company-wide and stay');
  assert.equal(mainSnapshot(await data(s.base, admin)), mainBefore, 'reset of a branch: main untouched');
  assert.equal((await login(s.base, 'mona', 'Mona-Test-Pass-31')).status, 200);
});

test('a center link (/p/…) made in a branch opens that branch\'s center', async () => {
  const tok = 'ab'.repeat(16);
  assert.equal((await sendB(admin, menouf, ops({ cols: { customers: col({ added: [{ id: 'pc1', name: 'مركز رابط منوف', balance: 250, customPrices: {} }] }) }, keys: { _portal: { pc1: tok } } }))).status, 200);
  const r = await fetch(s.base + '/p/' + tok);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /مركز رابط منوف/);
  assert.ok(!((await data(s.base, admin)).settings._portal || {}).pc1, 'the link list stays in its branch');
});

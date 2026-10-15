/* 4.38 · «الفلوس» — the server keeps the money rules the admin switched on (per branch, settings._cashCfg):
   an expense above the receipt limit needs a receipt, above the approval limit it needs the admin, an expense
   dated on/before the last daily close needs the admin — even for a user whose approvals are off. A daily count
   is never edited or deleted by a user; owner draws and the settings are the admin's; every money record is
   stamped with who recorded it and when the server got it. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, ops, col, createUser } from '../helpers/api.mjs';

let s, admin, acct, keeper, free;
const CA = 'b_cairo00001';
const T0 = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const Y = new Date(Date.now() - 864e5 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const sendAs = (tok, o, branch) => req(s.base, 'POST', '/api/ops', { token: tok, headers: branch ? { 'X-Branch': branch } : {}, body: { ops: o, opId: randomUUID(), cid: 't' } });
const dataAs = async (tok, branch) => { const r = await req(s.base, 'GET', '/api/data', { token: tok, headers: branch ? { 'X-Branch': branch } : {} }); assert.equal(r.status, 200, r.text); return r.json; };
const RC = { name: 'r.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA' };
const exp = (id, amount, extra) => ops({ cols: { expenses: col({ added: [Object.assign({ id, category: 'نقل', amount, date: T0, description: 'x', createdAt: Date.now() }, extra || {})] }) } });
const CFG = { on: true, receipt: 500, approve: 2000, reserve: 1000, opening: { date: Y, amount: 3000 }, since: Y };

before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  acct = await createUser(s.base, admin, { id: 'u_acct', username: 'acct', password: 'Acct-Test-Pass-1', name: 'محاسبة', role: 'accountant' });
  keeper = await createUser(s.base, admin, { id: 'u_keep', username: 'keeper', password: 'Keep-Test-Pass-1', name: 'أمين مخزن', role: 'sales', pages: ['stock'] });
  free = await createUser(s.base, admin, { id: 'u_free', username: 'free', password: 'Free-Test-Pass-1', name: 'خزنة', role: 'accountant', approval: 'none' });
});
after(() => s.stop());

test('rules off until the admin switches them on: a big expense with no receipt goes through', async () => {
  const r = await sendAs(acct, exp('e_off', 5000));
  assert.equal(r.status, 200, r.text);
});

test('only the admin sets the money rules and records owner draws', async () => {
  assert.equal((await sendAs(acct, ops({ keys: { _cashCfg: CFG } }))).status, 403);
  assert.equal((await sendAs(acct, ops({ sets: { _ownerDraws: col({ added: [{ id: 'dr_x', date: T0, amount: 100, from: 'cash' }] }) } }))).status, 403);
  assert.equal((await sendAs(admin, ops({ keys: { _cashCfg: CFG } }))).status, 200);
  assert.equal((await sendAs(admin, ops({ sets: { _ownerDraws: col({ added: [{ id: 'dr_1', date: T0, amount: 100, from: 'cash' }] }) } }))).status, 200);
  const d = await dataAs(acct);
  assert.equal(d.settings._cashCfg.receipt, 500, 'every user reads the limits (the expense form needs them)');
});

test('the receipt rule and the approval limit — also for a user whose approvals are off', async () => {
  for (const tok of [acct, free]) {
    let r = await sendAs(tok, exp('e_nr_' + tok.slice(-4), 600));
    assert.equal(r.status, 403, r.text);
    assert.equal(r.json.error, 'needs_approval');
    assert.ok(r.json.why.some(w => w.t === 'cash' && w.k === 'exp_receipt'));
    r = await sendAs(tok, exp('e_rc_' + tok.slice(-4), 600, { attachment: RC }));
    assert.equal(r.status, 200, r.text);
    r = await sendAs(tok, exp('e_small_' + tok.slice(-4), 120));
    assert.equal(r.status, 200, 'under the receipt limit: fine');
    r = await sendAs(tok, exp('e_big_' + tok.slice(-4), 2500, { attachment: RC }));
    assert.equal(r.status, 403);
    assert.ok(r.json.why.some(w => w.t === 'cash' && w.k === 'exp_big'));
  }
  /* paid from a cash custody: settled there, no receipt rule */
  assert.equal((await sendAs(acct, exp('e_cus', 700, { custodyId: 'cus_1' }))).status, 200);
  /* the admin is never stopped */
  assert.equal((await sendAs(admin, exp('e_adm', 9000))).status, 200);
});

test('daily counts: users add them, nobody but the admin edits or deletes one; an expense dated on a closed day needs the admin', async () => {
  let r = await sendAs(acct, ops({ sets: { _cashCounts: col({ added: [{ id: 'cc_1', date: T0, total: 4200, denoms: { 200: 21 }, by: { id: 'u_acct', name: 'محاسبة' }, at: Date.now() }] }) } }));
  assert.equal(r.status, 200, r.text);
  r = await sendAs(acct, ops({ sets: { _cashCounts: col({ modified: [{ id: 'cc_1', before: { total: 4200 }, after: { total: 5000 } }] }) } }));
  assert.equal(r.status, 403);
  r = await sendAs(acct, ops({ sets: { _cashCounts: col({ removed: ['cc_1'] }) } }));
  assert.equal(r.status, 403);
  r = await sendAs(keeper, ops({ sets: { _cashCounts: col({ added: [{ id: 'cc_k', date: T0, total: 1, at: Date.now() }] }) } }));
  assert.equal(r.status, 403, 'only the collection / expenses pages close the day');
  r = await sendAs(acct, exp('e_late', 100));
  assert.equal(r.status, 403, 'today was closed — an expense dated today now needs the admin');
  assert.ok(r.json.why.some(w => w.k === 'exp_late'));
  r = await sendAs(admin, ops({ sets: { _cashCounts: col({ modified: [{ id: 'cc_1', before: { total: 4200 }, after: { total: 4300 } }] }) } }));
  assert.equal(r.status, 200, 'the admin may correct a count');
});

test('every money record carries who recorded it and when the server got it', async () => {
  const t0 = Date.now();
  assert.equal((await sendAs(acct, ops({ cols: { payments: col({ added: [{ id: 'py_1', customerId: 'c', amount: 300, method: 'كاش', date: T0, createdAt: 1 }] }) } }))).status, 200);
  const p = (await dataAs(admin)).payments.find(x => x.id === 'py_1');
  assert.deepEqual(p.by, { id: 'u_acct', name: 'محاسبة' });
  assert.ok(p.srvAt >= t0);
  assert.equal(p.createdAt, 1, 'the device time is kept as typed');
});

test('the rules belong to the branch: القاهرة has none until its admin sets them', async () => {
  const r = await sendAs(admin, exp('e_ca_admin', 10), CA);
  assert.equal(r.status, 200);
  const d = await dataAs(admin, CA);
  assert.equal(d.settings._cashCfg, undefined);
});

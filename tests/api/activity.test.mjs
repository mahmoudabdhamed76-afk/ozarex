/* 4.96 · «إشعار لكل المستخدمين»: any user adds an expense, a supply to a center or a collection → a push to every
   other user of that branch who may see that kind of record on his pages (not the one who did it), with the number for the app icon (badge) that counts up until
   that user opens the app (POST /api/push/seen → 0). One sale with several paper types = one push; a collection made
   with the supply goes in the same push. The admin switches each kind on/off; it works with the daily summary off.
   A fake push service decrypts every message with each device's own keys (RFC 8291), so the whole path is real. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto, { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, ops, col, createUser, SALES } from '../helpers/api.mjs';

let s, admin, sales, acct, fake, fakePort;
const got = [];                                   // { who, msg }
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const devices = {};
function device(who) { const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = crypto.randomBytes(16); devices[who] = { ua, auth }; return { endpoint: 'http://127.0.0.1:' + fakePort + '/push/' + who, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } }; }
function decrypt(who, body) {
  const { ua, auth } = devices[who];
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ikm = hmac(hmac(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(pt.subarray(0, pt.length - 1).toString());
}
const sendAs = (tok, o) => req(s.base, 'POST', '/api/ops', { token: tok, body: { ops: o, opId: randomUUID(), cid: 't' } });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle(n, ms = 6000) { const t = Date.now(); while (got.length < n && Date.now() - t < ms) await wait(50); await wait(250); }
const take = () => got.splice(0, got.length);
const T = () => new Date().toISOString().slice(0, 10);

before(async () => {
  fake = http.createServer((q, r) => { const c = []; q.on('data', x => c.push(x)); q.on('end', () => { const who = q.url.split('/')[2]; got.push({ who, msg: decrypt(who, Buffer.concat(c)) }); r.writeHead(201); r.end(); }); });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  fakePort = fake.address().port;
  s = await startServer({ env: { PUSH_ALLOW_HTTP: '1' } });
  admin = (await adminLogin(s.base)).token;
  sales = await createUser(s.base, admin, SALES);
  acct = await createUser(s.base, admin, { id: 'u_acct', username: 'acct', password: 'Acct-Test-Pass-1', name: 'محاسبة', role: 'accountant' });
  for (const [who, tok] of [['admin', admin], ['sales', sales], ['acct', acct]]) {
    const r = await req(s.base, 'POST', '/api/push/subscribe', { token: tok, body: { subscription: device(who) } });
    assert.equal(r.status, 200, r.text);
  }
  assert.equal((await sendAs(admin, ops({ cols: {
    customers: col({ added: [{ id: 'c1', name: 'مركز النور', balance: 0, customPrices: {} }] }),
    products: col({ added: [{ id: 'p1', name: 'ورق 8×10', unit: 'علبة', quantity: 100, minQuantity: 0, cost: 60, price: 100 }, { id: 'p2', name: 'فيلم 14×17', unit: 'علبة', quantity: 100, minQuantity: 0, cost: 80, price: 150 }] })
  } }))).status, 200);
  await wait(300); take();                        // customers / products: no push
});
after(() => { s.stop(); fake.close(); });

test('a new expense → a push to every other user who may see expenses (not the one who added it), with the app icon number', async () => {
  const r = await sendAs(admin, ops({ cols: { expenses: col({ added: [{ id: 'e1', amount: 350, category: 'بنزين', description: 'مشوار مركز النور', date: T(), createdAt: Date.now() }] }) } }));
  assert.equal(r.status, 200, r.text);
  await settle(1);
  const g = take();
  assert.deepEqual(g.map(x => x.who), ['acct'], 'not the admin who added it, and not the sales user — «المصروفات» is not one of his pages');
  for (const { msg } of g) {
    assert.match(msg.title, /مصروف 350 ج — بنزين/);
    assert.match(msg.body, /مشوار مركز النور/);
    assert.match(msg.body, /المدير|admin|مدير/);
    assert.equal(msg.url, './?go=expenses');
    assert.equal(msg.badge, 1);
  }
});

test('a supply with two paper types + its collection = ONE push; the icon number counts up', async () => {
  const r = await sendAs(acct, ops({ cols: {
    issuances: col({ added: [
      { id: 'i1', number: 501, customerId: 'c1', customerName: 'مركز النور', productId: 'p1', productName: 'ورق 8×10', quantity: 5, unitPrice: 100, total: 500, paid: 0, date: T(), batchIndex: 0, createdAt: Date.now() },
      { id: 'i2', number: 501, customerId: 'c1', customerName: 'مركز النور', productId: 'p2', productName: 'فيلم 14×17', quantity: 2, unitPrice: 150, total: 300, paid: 0, date: T(), batchIndex: 1, createdAt: Date.now() }] }),
    payments: col({ added: [{ id: 'pay1', customerId: 'c1', customerName: 'مركز النور', amount: 400, date: T(), method: 'cash', createdAt: Date.now() }] })
  }, counters: { issuance: 501 } }));
  assert.equal(r.status, 200, r.text);
  await settle(2);
  const g = take();
  assert.deepEqual(g.map(x => x.who).sort(), ['admin', 'sales'], 'one push each — not the accountant who made it');
  const m = g.find(x => x.who === 'sales').msg;
  assert.match(m.title, /توريد جديد #501 — مركز النور/);
  assert.match(m.body, /ورق 8×10 × 5، فيلم 14×17 × 2 · 800 ج · اتحصّل 400 ج · محاسبة/);
  assert.equal(m.url, './?go=issuances');
  assert.equal(m.badge, 1, 'his first (the expense never reached him)');
  assert.equal(g.find(x => x.who === 'admin').msg.badge, 1);
});

test('a collection on its own → «💰 تحصيل»; opening the app sets the number back to 0', async () => {
  assert.equal((await req(s.base, 'POST', '/api/push/seen', { token: sales, body: {} })).json.badge, 0);
  await sendAs(admin, ops({ cols: { payments: col({ added: [{ id: 'pay2', customerId: 'c1', amount: 1200, date: T(), method: 'تحويل', note: 'باقي فاتورة 501', createdAt: Date.now() }] }) } }));
  await settle(2);
  const g = take();
  const m = g.find(x => x.who === 'sales').msg;
  assert.match(m.title, /تحصيل 1,200 ج — مركز النور/);
  assert.match(m.body, /تحويل · باقي فاتورة 501/);
  assert.equal(m.badge, 1, 'back to 1 after «seen»');
  assert.equal(g.find(x => x.who === 'acct').msg.badge, 2, 'the expense + this one (the supply was hers)');
});

test('no push for a purchase, an old record (synced late), or an edit', async () => {
  await sendAs(admin, ops({ cols: { expenses: col({ added: [
    { id: 'e_pur', kind: 'purchase', amount: 5000, category: 'مشتريات', date: T(), createdAt: Date.now() },
    { id: 'e_old', amount: 90, category: 'شاي', date: '2026-01-01', createdAt: Date.now() - 3 * 24 * 3600e3 }] }) } }));
  await sendAs(admin, ops({ cols: { expenses: col({ modified: [{ id: 'e1', before: { amount: 350 }, after: { amount: 360 } }] }) } }));
  await wait(800);
  assert.deepEqual(take(), []);
});

test('the admin switches a kind off (only the admin); it works with the daily summary off', async () => {
  assert.equal((await req(s.base, 'PUT', '/api/activity', { token: sales, body: { actExpense: false } })).status, 403);
  const off = await req(s.base, 'PUT', '/api/activity', { token: admin, body: { actExpense: false } });
  assert.deepEqual(off.json.config, { actExpense: false, actIssue: true, actPay: true });
  assert.equal((await req(s.base, 'GET', '/api/digest', { token: admin })).json.config.on, false, 'the daily summary is off all along');
  await sendAs(acct, ops({ cols: { expenses: col({ added: [{ id: 'e2', amount: 70, category: 'شاي', date: T(), createdAt: Date.now() }] }) } }));
  await wait(800);
  assert.deepEqual(take(), []);
  await req(s.base, 'PUT', '/api/activity', { token: admin, body: { actExpense: true } });
  await sendAs(acct, ops({ cols: { expenses: col({ added: [{ id: 'e3', amount: 80, category: 'شاي', date: T(), createdAt: Date.now() }] }) } }));
  await settle(1);
  assert.deepEqual(take().map(x => x.who), ['admin']);
});

test('a disabled user gets nothing', async () => {
  const r = await sendAs(admin, ops({ cols: { users: col({ modified: [{ id: 'u_acct', before: { disabled: false }, after: { disabled: true } }] }) } }));
  assert.equal(r.status, 200, r.text);
  await sendAs(admin, ops({ cols: { payments: col({ added: [{ id: 'pay3', customerId: 'c1', amount: 40, date: T(), method: 'cash', createdAt: Date.now() }] }) } }));
  await settle(1);
  await wait(300);
  assert.deepEqual(take().map(x => x.who), ['sales']);
});

/* 4.39 · Push notifications + الملخص اليومي. A fake push service (it decrypts every message with the device's own
   keys, RFC 8291, and checks the VAPID signature, RFC 8292) and a fake WhatsApp API (CallMeBot) run here, so the
   whole path is real: subscribe → encrypted push → decrypted JSON; the daily summary of every branch with the right
   numbers; an instant alert when a daily close comes out short; admin only; sent once a day at the chosen hour. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, ops, col, createUser } from '../helpers/api.mjs';

let s, admin, acct, fake, fakePort;
const pushes = [], whats = [];
const CA = 'b_cairo00001';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = x => Buffer.from(String(x).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const sendAs = (tok, o, branch) => req(s.base, 'POST', '/api/ops', { token: tok, headers: branch ? { 'X-Branch': branch } : {}, body: { ops: o, opId: randomUUID(), cid: 't' } });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/* the device: its ECDH keys + auth secret, and the decryption a browser does */
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const secret = ua.computeSecret(asPub);
  const ikm = hmac(hmac(auth, secret), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2, 'the last-record padding delimiter');
  return JSON.parse(pt.subarray(0, pt.length - 1).toString());
}
function verifyVapid(h, key) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h); assert.ok(m, 'VAPID header');
  assert.equal(m[2], key);
  const [hd, pl, sig] = m[1].split('.');
  const pub = unb64u(key);
  const k = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(hd + '.' + pl), { key: k, dsaEncoding: 'ieee-p1363' }, unb64u(sig)), 'the JWT is signed with the server key');
  const p = JSON.parse(unb64u(pl).toString());
  assert.equal(p.aud, 'http://127.0.0.1:' + fakePort);
  assert.ok(p.exp > Date.now() / 1000);
}
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

before(async () => {
  fake = http.createServer((q, r) => {
    const chunks = []; q.on('data', c => chunks.push(c)); q.on('end', () => {
      if (q.url.startsWith('/push/')) pushes.push({ headers: q.headers, body: Buffer.concat(chunks) });
      else if (q.url.startsWith('/wa')) { const u = new URL(q.url, 'http://x'); whats.push({ phone: u.searchParams.get('phone'), apikey: u.searchParams.get('apikey'), text: u.searchParams.get('text') }); }
      r.writeHead(201); r.end('Message queued');
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  fakePort = fake.address().port;
  s = await startServer({ env: { PUSH_ALLOW_HTTP: '1', CALLMEBOT_URL: 'http://127.0.0.1:' + fakePort + '/wa', DIGEST_TICK_MS: '400' } });
  admin = (await adminLogin(s.base)).token;
  acct = await createUser(s.base, admin, { id: 'u_acct', username: 'acct', password: 'Acct-Test-Pass-1', name: 'محاسبة', role: 'accountant' });
  const T = today();
  assert.equal((await sendAs(admin, ops({ cols: {
    customers: col({ added: [{ id: 'c1', name: 'مركز 1', balance: 0, customPrices: {} }] }),
    products: col({ added: [{ id: 'p1', name: 'ورق', unit: 'رزمة', quantity: 100, minQuantity: 0, cost: 60, price: 100 }] }),
    issuances: col({ added: [{ id: 'i1', number: 1, customerId: 'c1', productId: 'p1', productName: 'ورق', quantity: 10, unitPrice: 100, total: 1000, paid: 0, date: T, items: [] }] }),
    payments: col({ added: [{ id: 'p1', customerId: 'c1', amount: 700, method: 'كاش', date: T }, { id: 'p2', customerId: 'c1', amount: 300, method: 'تحويل', date: T }] }),
    expenses: col({ added: [{ id: 'e1', category: 'نقل', amount: 650, date: T }, { id: 'e2', category: 'كهرباء', amount: 100, date: T }] })
  }, keys: { _cashCfg: { on: true, receipt: 500, approve: 2000, reserve: 0, opening: { date: T, amount: 1000 }, since: T } } }))).status, 200);
  assert.equal((await sendAs(admin, ops({ cols: { payments: col({ added: [{ id: 'k1', customerId: 'x', amount: 400, method: 'كاش', date: T }] }) } }), CA)).status, 200);
});
after(async () => { await s.stop(); fake.close(); });

test('a device subscribes; a push arrives encrypted for that device only and signed by the server', async () => {
  const k = await req(s.base, 'GET', '/api/push/key', { token: admin });
  assert.equal(k.status, 200);
  assert.equal(unb64u(k.json.key).length, 65);
  const sub = { endpoint: 'http://127.0.0.1:' + fakePort + '/push/dev1', keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };
  assert.equal((await req(s.base, 'POST', '/api/push/subscribe', { token: admin, body: { subscription: { endpoint: 'ftp://x', keys: sub.keys } } })).status, 400);
  const r = await req(s.base, 'POST', '/api/push/subscribe', { token: admin, body: { subscription: sub } });
  assert.equal(r.status, 200); assert.equal(r.json.devices, 1);
  const t = await req(s.base, 'POST', '/api/push/test', { token: admin, body: {} });
  assert.equal(t.json.sent, 1);
  assert.ok(await until(() => pushes.length >= 1));
  const p = pushes.shift();
  assert.equal(p.headers['content-encoding'], 'aes128gcm');
  verifyVapid(p.headers.authorization, k.json.key);
  const msg = decrypt(p.body);
  assert.equal(msg.title, '🔔 الإشعارات شغّالة');
});

test('the daily summary: every branch, the right numbers, sent on WhatsApp and as a push; admin only', async () => {
  assert.equal((await req(s.base, 'GET', '/api/digest', { token: acct })).status, 403);
  assert.equal((await req(s.base, 'PUT', '/api/digest', { token: acct, body: { on: true } })).status, 403);
  const c = await req(s.base, 'PUT', '/api/digest', { token: admin, body: { on: false, time: '23:59', phone: '01012345678', apikey: 'ABC123', wa: true, push: true } });
  assert.equal(c.status, 200);
  assert.equal(c.json.config.apikey, '••••23', 'the key never comes back');
  assert.equal(c.json.config.phone, '01012345678');
  whats.length = 0; pushes.length = 0;
  const r = await req(s.base, 'POST', '/api/digest/send', { token: admin, body: { test: true } });
  assert.equal(r.status, 200, r.text);
  const txt = r.json.text;
  assert.match(txt, /فرع منوف/); assert.match(txt, /فرع القاهرة/);
  assert.match(txt, /اتحصّل \*1,000\* \(كاش 700 · بنك 300\) — 2 عملية/);
  assert.match(txt, /مبيعات \*1,000\*/);
  assert.match(txt, /اتصرف \*750\*/);
  assert.match(txt, /نقل 650 ⚠من غير إيصال/, 'above the receipt limit, no receipt');
  assert.doesNotMatch(txt, /كهرباء 100 ⚠/);
  assert.match(txt, /ما قفلش اليومية/);
  assert.match(txt, /ربح النهارده تقريباً -350/, '1000 − 600 cost − 750 expenses (the profit page rule)');
  assert.ok(await until(() => whats.length >= 1 && pushes.length >= 1));
  assert.equal(whats[0].phone, '+201012345678');
  assert.equal(whats[0].apikey, 'ABC123');
  assert.match(whats[0].text, /رسالة تجربة/);
  const m = decrypt(pushes[0].body);
  assert.match(m.title, /ملخص/);
  assert.match(m.body, /اتحصّل 1,400/, 'both branches');
  assert.match(m.body, /ما قفلش: فرع منوف، فرع القاهرة/);
});

test('instant alert: a daily close that comes out short reaches the admin at once', async () => {
  await req(s.base, 'PUT', '/api/digest', { token: admin, body: { on: true, alertShort: true } });
  whats.length = 0; pushes.length = 0;
  /* expected in the box: 1000 opening + 700 cash in − 650 − 100 = 950 · counted 800 → short 150 */
  const r = await sendAs(acct, ops({ sets: { _cashCounts: col({ added: [{ id: 'cc1', date: today(), total: 800, by: { id: 'u_acct', name: 'محاسبة' }, at: Date.now() }] }) } }));
  assert.equal(r.status, 200, r.text);
  assert.ok(await until(() => pushes.length >= 1 && whats.length >= 1), 'push + WhatsApp');
  const m = decrypt(pushes[0].body);
  assert.match(m.title, /عجز 150 — فرع منوف/);
  assert.match(m.body, /المعدود 800 والمفروض 950/);
  assert.equal(m.urgent, true);
  assert.match(whats[0].text, /عجز 150/);
});

test('sent by itself once a day at the chosen hour, and kept in the history', async () => {
  pushes.length = 0; whats.length = 0;
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const before = now === '00:00' ? '00:00' : now;   // «now» has already started → due
  await req(s.base, 'PUT', '/api/digest', { token: admin, body: { on: true, time: before } });
  assert.ok(await until(() => pushes.some(p => /ملخص/.test(decrypt(p.body).title)), 6000), 'the clock sent it');
  const n = pushes.length;
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(pushes.filter(p => /ملخص/.test(decrypt(p.body).title)).length, 1, 'once a day');
  assert.ok(pushes.length >= n);
  const h = await req(s.base, 'GET', '/api/digest/history', { token: admin });
  assert.ok(h.json.history.some(x => x.kind === 'digest' && x.day === today()));
  assert.ok(h.json.history.some(x => x.kind === 'short'));
});

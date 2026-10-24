'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · Web Push (4.39) — notifications on the phone / computer even when
   the app is closed, with no outside library and no outside service:
   · VAPID keys (P-256) made once and kept in the main database (app_meta)
   · a device subscribes (POST /api/push/subscribe) → push_subs
   · send(): RFC 8291 (aes128gcm) payload encryption + RFC 8292 VAPID JWT,
     straight to the browser's push service (Google / Apple / Mozilla).
     A subscription the push service says is gone (404 / 410) is removed.
════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const { db } = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL, ua TEXT, created_at TEXT NOT NULL, last_ok TEXT, fails INTEGER DEFAULT 0)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subs(user_id)');

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
function meta(k, v) {
  if (v === undefined) { const r = db.prepare('SELECT v FROM app_meta WHERE k = ?').get(k); try { return r ? JSON.parse(r.v) : null; } catch (_) { return null; } }
  db.prepare('INSERT INTO app_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v));
  return v;
}

/* ── the server's VAPID identity (made once) ── */
let KEYS = null;
function keys() {
  if (KEYS) return KEYS;
  let k = meta('vapid');
  if (!k || !k.d || !k.x || !k.y) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const j = privateKey.export({ format: 'jwk' });
    k = meta('vapid', { d: j.d, x: j.x, y: j.y, at: new Date().toISOString() });
  }
  const priv = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: k.d, x: k.x, y: k.y }, format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), unb64u(k.x), unb64u(k.y)]);
  KEYS = { priv, pub, pubB64: b64u(pub) };
  return KEYS;
}
const publicKey = () => keys().pubB64;

/* ── subscriptions ── */
function subscribe(user, sub, ua) {
  const okUrl = /^https:\/\//.test(String(sub && sub.endpoint)) || (process.env.PUSH_ALLOW_HTTP === '1' && /^http:\/\/127\.0\.0\.1:/.test(String(sub && sub.endpoint)));   // http only for the tests
  if (!sub || typeof sub.endpoint !== 'string' || !okUrl || sub.endpoint.length > 1000) throw new Error('bad subscription');
  const k = sub.keys || {};
  if (unb64u(k.p256dh).length !== 65 || unb64u(k.auth).length < 16) throw new Error('bad subscription keys');
  db.prepare(`INSERT INTO push_subs (endpoint, user_id, data, ua, created_at, fails) VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data, ua = excluded.ua, fails = 0`)
    .run(sub.endpoint, String(user.id), JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } }), String(ua || '').slice(0, 200), new Date().toISOString());
  return true;
}
function unsubscribe(endpoint) { db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(String(endpoint || '')); }
function subsOf(userIds) {
  const ids = [...new Set((userIds || []).map(String))].filter(id => id && id.length <= 80);
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = db.prepare(`SELECT * FROM push_subs WHERE user_id IN (${chunk.map(() => '?').join(',')})`).all(...chunk);
    for (const r of rows) { try { out.push(Object.assign(JSON.parse(r.data), { _user: r.user_id })); } catch (_) {} }
  }
  return out;
}
function countFor(userId) { return db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').get(String(userId)).n; }

/* ── RFC 8291: encrypt the payload for one subscription ── */
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
function encrypt(sub, payload) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPub);
  const prkKey = hmac(auth, secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, body]);
}
/* ── RFC 8292: the VAPID token for the push service's origin ── */
function vapid(endpoint) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || 'mailto:admin@ozarex.app' }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: keys().priv, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + keys().pubB64;
}

async function sendOne(sub, msg) {
  const payload = JSON.stringify(msg).slice(0, 3000);
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: msg.urgent ? 'high' : 'normal', Authorization: vapid(sub.endpoint) },
      body: encrypt(sub, payload), signal: AbortSignal.timeout(15000)
    });
    if (r.status === 404 || r.status === 410) { unsubscribe(sub.endpoint); return { ok: false, gone: true, status: r.status }; }
    if (r.status >= 200 && r.status < 300) { db.prepare('UPDATE push_subs SET last_ok = ?, fails = 0 WHERE endpoint = ?').run(new Date().toISOString(), sub.endpoint); return { ok: true, status: r.status }; }
    db.prepare('UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?').run(sub.endpoint);
    return { ok: false, status: r.status, text: (await r.text().catch(() => '')).slice(0, 200) };
  } catch (e) {
    db.prepare('UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?').run(sub.endpoint);
    return { ok: false, error: e.message };
  }
}
/* msg: { title, body, url, tag, urgent } → every device of these users */
async function send(userIds, msg) {
  const subs = subsOf(userIds);
  const res = await Promise.all(subs.map(s => sendOne(s, msg)));
  return { devices: subs.length, ok: res.filter(r => r.ok).length, results: res };
}

module.exports = { publicKey, subscribe, unsubscribe, send, countFor, meta, encrypt, vapid, _keys: keys };

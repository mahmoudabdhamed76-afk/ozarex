/* Phase 2 · I11 — session lifetime and the live-stream ticket (no reusable token in URLs). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { req, login, adminLogin } from '../helpers/api.mjs';

let s, admin;
before(async () => { s = await startServer(); admin = (await adminLogin(s.base)).token; });
after(() => s.stop());

async function stream(path) {
  const ctrl = new AbortController();
  const r = await fetch(s.base + path, { signal: ctrl.signal });
  ctrl.abort();
  return r.status;
}

test('/api/me hands out a one-time stream ticket', async () => {
  const r = await req(s.base, 'GET', '/api/me', { token: admin });
  assert.match(r.json.streamTicket, /^[A-Za-z0-9_-]{30,}$/);
  assert.notEqual(r.json.streamTicket, admin);
});

test('the live stream opens with the ticket, once — the same ticket again is refused', async () => {
  const t = (await req(s.base, 'GET', '/api/me', { token: admin })).json.streamTicket;
  assert.equal(await stream('/api/events?st=' + t), 200);
  assert.equal(await stream('/api/events?st=' + t), 401);
  assert.equal(await stream('/api/events?st=' + 'x'.repeat(32)), 401);
});

test('a ticket works only for the live stream, never as a login for other API calls', async () => {
  const t = (await req(s.base, 'GET', '/api/me', { token: admin })).json.streamTicket;
  assert.equal((await fetch(s.base + '/api/data?st=' + t)).status, 401);
  assert.equal((await req(s.base, 'GET', '/api/data', { token: t })).status, 401);
});

test('a ticket dies with the session: after logout it no longer opens the stream', async () => {
  const tok = (await login(s.base, 'admin', ADMIN_PASSWORD)).token;
  const t = (await req(s.base, 'GET', '/api/me', { token: tok })).json.streamTicket;
  await req(s.base, 'POST', '/api/logout', { token: tok });
  await req(s.base, 'POST', '/api/logout', { token: admin });
  assert.equal(await stream('/api/events?st=' + t), 401);
  admin = (await adminLogin(s.base)).token;
});

test('compatibility: an old client that still sends ?t=<token> keeps working (to be removed later)', async () => {
  assert.equal(await stream('/api/events?t=' + admin), 200);
});

test('the session cookie lasts 30 days (was 365) and is still renewed by use', async () => {
  const r = await req(s.base, 'POST', '/api/login', { body: { username: 'admin', password: ADMIN_PASSWORD } });
  const c = r.headers.get('set-cookie');
  assert.match(c, /Max-Age=2592000\b/);
  const me = await req(s.base, 'GET', '/api/me', { token: r.json.token });
  assert.match(me.headers.get('set-cookie'), /Max-Age=2592000\b/);
});

test('idle sessions end: unused longer than the idle limit → signed out', async () => {
  const x = await startServer({ env: { SESSION_IDLE_DAYS: String(1.5 / 86400) } });   // 1.5 s, test only
  try {
    const t = (await adminLogin(x.base)).token;
    assert.equal((await req(x.base, 'GET', '/api/me', { token: t })).status, 200);
    await new Promise(r => setTimeout(r, 2000));
    assert.equal((await req(x.base, 'GET', '/api/me', { token: t })).status, 401);
  } finally { await x.stop(); }
});

test('every session ends after the maximum age, even if used all the time', async () => {
  const x = await startServer({ env: { SESSION_MAX_DAYS: String(2 / 86400) } });      // 2 s, test only
  try {
    const t = (await adminLogin(x.base)).token;
    for (let i = 0; i < 3; i++) { assert.equal((await req(x.base, 'GET', '/api/me', { token: t })).status, 200); await new Promise(r => setTimeout(r, 400)); }
    await new Promise(r => setTimeout(r, 1500));
    assert.equal((await req(x.base, 'GET', '/api/me', { token: t })).status, 401);
    assert.equal((await adminLogin(x.base)).status, 200, 'a fresh login works');
  } finally { await x.stop(); }
});

test('old sessions past the maximum age are removed when the server starts', async () => {
  const x = await startServer({ env: { SESSION_MAX_DAYS: String(1 / 86400) } });
  try {
    const t = (await adminLogin(x.base)).token;
    await new Promise(r => setTimeout(r, 1300));
    await x.restart();
    assert.equal((await req(x.base, 'GET', '/api/me', { token: t })).status, 401);
  } finally { await x.stop(); }
});

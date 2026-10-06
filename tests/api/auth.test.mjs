/* Login, sessions, weak passwords, throttling, admin-only endpoints. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { req, login, adminLogin, send, ops, col, createUser, SALES } from '../helpers/api.mjs';

let s, admin, sales;
before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  sales = await createUser(s.base, admin, SALES);
});
after(() => s.stop());

test('first admin is seeded from ADMIN_PASSWORD and can log in', async () => {
  const r = await login(s.base, 'admin', ADMIN_PASSWORD);
  assert.equal(r.status, 200);
  assert.equal(r.user.role, 'admin');
  assert.match(r.token, /^[a-f0-9]{64}$/);
  assert.equal(r.body.mustChange, false);
});

test('login cookie is HttpOnly + SameSite=Lax', async () => {
  const r = await req(s.base, 'POST', '/api/login', { body: { username: 'admin', password: ADMIN_PASSWORD } });
  const c = r.headers.get('set-cookie') || '';
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
});

test('wrong password → 401 with no token', async () => {
  const r = await login(s.base, 'admin', 'wrong-password');
  assert.equal(r.status, 401);
  assert.equal(r.token, undefined);
});

test('unknown user → 401 (same message as a wrong password)', async () => {
  const a = await login(s.base, 'nobody', 'x'), b = await login(s.base, 'admin', 'nope');
  assert.equal(a.status, 401);
  assert.equal(a.body.message, b.body.message);
});

test('8 wrong tries for one name from one address → 429 on the next', async () => {
  for (let i = 0; i < 8; i++) assert.equal((await login(s.base, 'throttle-me', 'bad' + i)).status, 401);
  assert.equal((await login(s.base, 'throttle-me', 'bad')).status, 429);
});

test('/api/me returns the user for a valid token, 401 without one', async () => {
  const ok = await req(s.base, 'GET', '/api/me', { token: sales });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.username, SALES.username);
  assert.equal((await req(s.base, 'GET', '/api/me')).status, 401);
});

test('logout ends the session', async () => {
  const t = (await login(s.base, SALES.username, SALES.password)).token;
  assert.equal((await req(s.base, 'POST', '/api/logout', { token: t })).status, 200);
  assert.equal((await req(s.base, 'GET', '/api/me', { token: t })).status, 401);
});

test('sessions survive a server restart', async () => {
  const t = (await login(s.base, SALES.username, SALES.password)).token;
  await s.restart();
  assert.equal((await req(s.base, 'GET', '/api/me', { token: t })).status, 200);
});

test('every /api route except the public ones needs a login', async () => {
  for (const [m, p] of [['GET', '/api/data'], ['POST', '/api/ops'], ['GET', '/api/events'], ['GET', '/api/backups'], ['POST', '/api/password'], ['GET', '/api/market']]) {
    assert.equal((await req(s.base, m, p, m === 'POST' ? { body: {} } : {})).status, 401, m + ' ' + p);
  }
  for (const p of ['/api/health', '/api/version', '/api/brand']) assert.equal((await req(s.base, 'GET', p)).status, 200, p);
});

test('admin-only endpoints refuse a non-admin (403)', async () => {
  const list = [['GET', '/api/backups'], ['GET', '/api/backup/download'], ['POST', '/api/backup/now'], ['POST', '/api/backup/telegram'],
    ['GET', '/api/sessions'], ['POST', '/api/sessions/revoke'], ['POST', '/api/reset'], ['POST', '/api/data']];
  for (const [m, p] of list) {
    const r = await req(s.base, m, p, { token: sales, body: m === 'POST' ? {} : undefined });
    assert.equal(r.status, 403, m + ' ' + p);
  }
});

test('a non-admin cannot create or edit users', async () => {
  const r = await send(s.base, sales, ops({ cols: { users: col({ added: [{ id: 'u_x', username: 'x', password: 'Xx-123456789', name: 'x', role: 'admin' }] }) } }));
  assert.equal(r.status, 403);
  const r2 = await send(s.base, sales, ops({ cols: { users: col({ modified: [{ id: SALES.id, before: { role: 'sales' }, after: { role: 'admin' } }] }) } }));
  assert.equal(r2.status, 403);
});

test('weak password: login works, writes are blocked until it is changed', async () => {
  const u = { id: 'u_weak', username: 'weak', password: 'password', name: 'ضعيف', role: 'sales' };
  await send(s.base, admin, ops({ cols: { users: col({ added: [u] }) } }));
  const l = await login(s.base, 'weak', 'password');
  assert.equal(l.status, 200);
  assert.equal(l.body.weak, true);
  assert.equal(l.body.mustChange, true);
  assert.equal((await req(s.base, 'GET', '/api/data', { token: l.token })).status, 200, 'reading is allowed');
  const w = await send(s.base, l.token, ops({ cols: { customers: col({ added: [{ id: 'cw', name: 'x', balance: 0 }] }) } }));
  assert.equal(w.status, 403);
  assert.equal(w.json.error, 'must_change');
  assert.equal((await req(s.base, 'POST', '/api/password', { token: l.token, body: { current: 'password', next: '123456' } })).status, 400, 'a common password is refused');
  assert.equal((await req(s.base, 'POST', '/api/password', { token: l.token, body: { current: 'password', next: 'Strong-New-Pass-1' } })).status, 200);
  assert.equal((await send(s.base, l.token, ops({ cols: { customers: col({ added: [{ id: 'cw', name: 'x', balance: 0 }] }) } }))).status, 200);
  assert.equal((await login(s.base, 'weak', 'Strong-New-Pass-1')).status, 200);
});

test('changing your own password needs the current one', async () => {
  const r = await req(s.base, 'POST', '/api/password', { token: sales, body: { current: 'wrong', next: 'Another-Pass-123' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'bad_current');
});

test('admin changing a user password signs that user out everywhere', async () => {
  const u = { id: 'u_pw', username: 'pwuser', password: 'First-Pass-123', name: 'x', role: 'sales' };
  const t = await createUser(s.base, admin, u);
  const r = await send(s.base, admin, ops({ cols: { users: col({ modified: [{ id: 'u_pw', before: {}, after: { password: 'Second-Pass-456' } }] }) } }));
  assert.equal(r.status, 200);
  assert.equal((await req(s.base, 'GET', '/api/me', { token: t })).status, 401);
  assert.equal((await login(s.base, 'pwuser', 'First-Pass-123')).status, 401);
  assert.equal((await login(s.base, 'pwuser', 'Second-Pass-456')).status, 200);
});

test('a disabled user cannot log in and his open session stops working', async () => {
  const u = { id: 'u_dis', username: 'disabled', password: 'Disabled-Pass-1', name: 'x', role: 'sales' };
  const t = await createUser(s.base, admin, u);
  await send(s.base, admin, ops({ cols: { users: col({ modified: [{ id: 'u_dis', before: {}, after: { disabled: true } }] }) } }));
  assert.equal((await login(s.base, 'disabled', 'Disabled-Pass-1')).status, 401);
  assert.equal((await req(s.base, 'GET', '/api/data', { token: t })).status, 401);
});

test('admin can list and revoke sessions', async () => {
  const t = (await login(s.base, SALES.username, SALES.password)).token;
  const list = await req(s.base, 'GET', '/api/sessions', { token: admin });
  assert.equal(list.status, 200);
  const mine = list.json.sessions.filter(x => x.user === SALES.name);
  assert.ok(mine.length >= 1);
  for (const x of mine) await req(s.base, 'POST', '/api/sessions/revoke', { token: admin, body: { id: x.id } });
  assert.equal((await req(s.base, 'GET', '/api/me', { token: t })).status, 401);
});

test('password hashes never leave the server', async () => {
  const d = await req(s.base, 'GET', '/api/data', { token: admin });
  assert.ok(d.json.users.length >= 2);
  for (const u of d.json.users) assert.equal('password' in u, false, u.username);
  assert.doesNotMatch(d.text, /scrypt\$/);
});

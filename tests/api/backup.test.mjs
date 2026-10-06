/* Backups (daily file, manual, download), restore (POST /api/data), reset,
   and the large synthetic dataset as a load fixture. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { req, login, adminLogin, send, data, createUser, seedOps, SALES } from '../helpers/api.mjs';
import { loadLargeDataset } from '../fixtures/load.mjs';

let s, admin;
before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  await send(s.base, admin, seedOps());
  await createUser(s.base, admin, SALES);
});
after(() => s.stop());

async function download(file) {
  const r = await fetch(s.base + '/api/backup/download' + (file ? '?file=' + encodeURIComponent(file) : ''), { headers: { Authorization: 'Bearer ' + admin } });
  return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) };
}

test('manual backup writes a dated .json.gz that shows in the list', async () => {
  const r = await req(s.base, 'POST', '/api/backup/now', { token: admin });
  assert.equal(r.status, 200);
  assert.match(r.json.file, /^erp-\d{4}-\d{2}-\d{2}\.json\.gz$/);
  const list = await req(s.base, 'GET', '/api/backups', { token: admin });
  assert.ok(list.json.files.some(f => f.file === r.json.file));
  assert.equal(list.json.telegram.configured, false);
});

test('a backup file downloads, unzips and holds the data — without password hashes', async () => {
  const name = (await req(s.base, 'GET', '/api/backups', { token: admin })).json.files[0].file;
  const f = await download(name);
  assert.equal(f.status, 200);
  assert.equal(f.type, 'application/gzip');
  const blob = JSON.parse(gunzipSync(f.buf).toString('utf8'));
  assert.equal(blob.customers.length, 2);
  assert.equal(blob.invoices[0].items.length, 1);
  assert.doesNotMatch(JSON.stringify(blob.users), /scrypt\$|"password"/);
});

test('backup download refuses file names outside the backups folder', async () => {
  for (const f of ['../erp.db', 'erp.db', '..%2ferp.db', 'erp-2026-01-01.json.gz']) assert.equal((await download(f)).status, 404, f);
});

test('restore (POST /api/data) puts back exactly what was backed up, users can still log in', async () => {
  const before = await data(s.base, admin);
  const blob = JSON.parse(gunzipSync((await download()).buf).toString('utf8'));
  await send(s.base, admin, { cols: { customers: { added: [{ id: 'c_after', name: 'بعد النسخة', balance: 0 }], removed: [], modified: [] } }, sets: {}, keys: {}, counters: null });
  const r = await req(s.base, 'POST', '/api/data', { token: admin, body: blob });
  assert.equal(r.status, 200);
  const after = await data(s.base, admin);
  assert.equal(after.customers.some(c => c.id === 'c_after'), false);
  assert.deepEqual(after.customers.map(c => c.id).sort(), before.customers.map(c => c.id).sort());
  assert.equal(after.invoices.find(i => i.id === 'i1').total, before.invoices.find(i => i.id === 'i1').total);
  assert.equal((await login(s.base, 'admin', ADMIN_PASSWORD)).status, 200);
  assert.equal((await login(s.base, SALES.username, SALES.password)).status, 200);
});

test('a restore first saves an internal snapshot of the data it replaces', async () => {
  const list = await req(s.base, 'GET', '/api/backups', { token: admin });
  assert.ok(list.json.db.length >= 1);
});

test('reset empties the data but keeps the users', async () => {
  const r = await req(s.base, 'POST', '/api/reset', { token: admin });
  assert.equal(r.status, 200);
  const d = await data(s.base, admin);
  assert.equal(d.customers.length, 0);
  assert.equal(d.invoices.length, 0);
  assert.ok(d.users.some(u => u.username === SALES.username));
  assert.equal((await login(s.base, 'admin', ADMIN_PASSWORD)).status, 200);
});

test('I14 (fixed in Phase 1): restoring a file that has no users must not lock everyone out', async () => {
  const x = await startServer();
  try {
    const t = (await adminLogin(x.base)).token;
    const r = await req(x.base, 'POST', '/api/data', { token: t, body: { customers: [{ id: 'c1', name: 'x', balance: 0 }], users: [] } });
    const l = await login(x.base, 'admin', ADMIN_PASSWORD);
    assert.ok(r.status >= 400 || l.status === 200, `restore → ${r.status}, admin login afterwards → ${l.status}`);
  } finally { await x.stop(); }
});

test('I14 (fixed in Phase 1): a hash-less backup on a NEW server keeps employees, switched off and listed — never a silent random password', async () => {
  const a = await startServer();
  const b = await startServer();
  try {
    const ta = (await adminLogin(a.base)).token;
    await createUser(a.base, ta, SALES);
    await req(a.base, 'POST', '/api/backup/now', { token: ta });
    const f = await fetch(a.base + '/api/backup/download', { headers: { Authorization: 'Bearer ' + ta } });
    const blob = JSON.parse(gunzipSync(Buffer.from(await f.arrayBuffer())).toString('utf8'));
    const tb = (await adminLogin(b.base)).token;
    const r = await req(b.base, 'POST', '/api/data', { token: tb, body: blob });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.usersWithoutPassword.map(u => u.username), [SALES.username], 'employees without a known password are reported');
    assert.equal(r.json.adminKept, 'admin');
    assert.equal((await login(b.base, 'admin', ADMIN_PASSWORD)).status, 200, 'the admin who restored can still log in');
    const tb2 = (await adminLogin(b.base)).token;
    const u = (await data(b.base, tb2)).users.find(x => x.username === SALES.username);
    assert.equal(u.disabled, true);
    assert.equal(u.passwordMissing, true);
    assert.equal((await login(b.base, SALES.username, SALES.password)).status, 401);
    /* the admin sets a password and switches him back on → he can log in, the flag is gone */
    const set = await send(b.base, tb2, { cols: { users: { added: [], removed: [], modified: [{ k: 'i:' + u.id, f: ['password', 'disabled'], b: {}, a: { password: 'Brand-New-Pass-9', disabled: false } }] } }, sets: {}, keys: {}, counters: null });
    assert.equal(set.status, 200);
    assert.equal((await login(b.base, SALES.username, 'Brand-New-Pass-9')).status, 200);
    assert.equal((await data(b.base, tb2)).users.find(x => x.username === SALES.username).passwordMissing, undefined);
  } finally { await a.stop(); await b.stop(); }
});

/* ── the large synthetic dataset (reusable fixture) ── */
test('large fixture: restore, read back, survive a restart (timings in the output)', async (t) => {
  const x = await startServer();
  try {
    let tok = (await adminLogin(x.base)).token;
    const blob = loadLargeDataset();
    let t0 = Date.now();
    assert.equal((await req(x.base, 'POST', '/api/data', { token: tok, body: blob })).status, 200);
    const restoreMs = Date.now() - t0;
    t0 = Date.now();
    const r = await req(x.base, 'GET', '/api/data', { token: tok });
    const readMs = Date.now() - t0;
    assert.equal(r.json.invoices.length, blob.invoices.length);
    assert.equal(r.json.issuances.length, blob.issuances.length);
    assert.equal(r.json.payments.length, blob.payments.length);
    assert.equal(r.json.customers.length, blob.customers.length);
    t0 = Date.now(); await x.restart(); const startMs = Date.now() - t0;
    tok = (await adminLogin(x.base)).token;
    const d = await data(x.base, tok);
    assert.equal(d.issuances.length, blob.issuances.length);
    assert.equal(d.issuances[0].items.length, 1);
    t.diagnostic(`restore ${restoreMs} ms · GET /api/data ${readMs} ms (${(r.text.length / 1e6).toFixed(2)} MB, content-encoding=${r.headers.get('content-encoding') || 'none'}) · restart ${startMs} ms`);
  } finally { await x.stop(); }
});

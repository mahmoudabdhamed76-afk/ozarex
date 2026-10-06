/* Static files, security headers, path traversal, public brand + customer portal. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, send, ops, seedOps } from '../helpers/api.mjs';

let s, admin;
before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  await send(s.base, admin, seedOps());
});
after(() => s.stop());

/* raw request — fetch() would normalise "../" before sending */
function raw(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: s.port, path }, r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => resolve({ status: r.statusCode, body: b, headers: r.headers })); }).on('error', reject);
  });
}

test('the app page is served with no-cache and security headers', async () => {
  const r = await raw('/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.headers['cache-control'], /no-store|no-cache/);
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(r.body, /<html lang="ar" dir="rtl">/);
});

test('every script and stylesheet the page loads exists', async () => {
  const html = (await raw('/')).body;
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css|vendor|fonts|icons)\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length > 30);
  for (const f of new Set(refs)) assert.equal((await raw('/' + f)).status, 200, f);
});

test('the service worker is served from the app root with no cache', async () => {
  const r = await raw('/sw.js');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /javascript/);
  assert.match(r.headers['cache-control'], /no-store|no-cache/);
});

test('unknown paths fall back to the app page (client routing)', async () => {
  const r = await raw('/some/page');
  assert.equal(r.status, 200);
  assert.match(r.body, /<html lang="ar"/);
});

test('path traversal never reaches backend files or the database', async () => {
  const page = (await raw('/')).body;
  for (const p of ['/../backend/server.js', '/..%2f..%2fbackend%2fserver.js', '/....//backend/server.js', '/%2e%2e/%2e%2e/backend/db/schema.sql', '/../data/erp.db', '/../../etc/passwd']) {
    const r = await raw(p);
    assert.ok(r.status === 404 || r.body === page, p + ' returned something other than the app page');
  }
});

test('unknown /api route → 404 JSON', async () => {
  const r = await req(s.base, 'GET', '/api/nope', { token: admin });
  assert.equal(r.status, 404);
  assert.equal(r.json.error, 'not_found');
});

test('public brand endpoint gives only the company name and logo', async () => {
  await send(s.base, admin, ops({ keys: { companyName: 'شركة الاختبار', companyPhone: '0100' } }));
  const r = await req(s.base, 'GET', '/api/brand');
  assert.deepEqual(Object.keys(r.json).sort(), ['logo', 'name']);
  assert.equal(r.json.name, 'شركة الاختبار');
});

test('customer portal: valid token shows that customer only, escaped; bad token → 404', async () => {
  const tok = 'ab'.repeat(20);
  await send(s.base, admin, { cols: { customers: { added: [{ id: 'c_x', name: '<script>alert(1)</script>', balance: 50 }], removed: [], modified: [] } }, sets: {}, keys: { _portal: { a: { c1: tok, c_x: 'cd'.repeat(20) } } }, counters: null });
  const r = await raw('/p/' + tok);
  assert.equal(r.status, 200);
  assert.match(r.body, /مركز النور/);
  assert.doesNotMatch(r.body, /مركز الشفاء/);
  assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
  const x = await raw('/p/' + 'cd'.repeat(20));
  assert.doesNotMatch(x.body, /<script>alert\(1\)<\/script>/);
  assert.match(x.body, /&lt;script&gt;/);
  assert.equal((await raw('/p/' + 'ef'.repeat(20))).status, 404);
  assert.equal((await raw('/p/short')).status, 404);
});

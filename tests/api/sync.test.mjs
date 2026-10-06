/* Regression tests for the current real-time sync (record-level ops + SSE). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, send, ops, col, data, createUser, seedOps, SALES } from '../helpers/api.mjs';

let s, admin, sales;
before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  await send(s.base, admin, seedOps());
  sales = await createUser(s.base, admin, SALES);
});
after(() => s.stop());

/* open the live stream like a device does (EventSource sends the token as ?t=) */
function openStream(token) {
  const ctrl = new AbortController(), events = [], waiters = [];
  const ready = fetch(s.base + '/api/events?t=' + token, { signal: ctrl.signal }).then(async r => {
    if (r.status !== 200) { events.push({ status: r.status }); return r.status; }
    (async () => {
      const dec = new TextDecoder(); let buf = '';
      try {
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true });
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = block.split('\n').find(l => l.startsWith('data: '));
            if (line) { const ev = JSON.parse(line.slice(6)); events.push(ev); waiters.splice(0).forEach(w => w()); }
          }
        }
      } catch (_) { /* aborted */ }
      events.push({ closed: true }); waiters.splice(0).forEach(w => w());
    })();
    return 200;
  });
  return {
    ready, events, close: () => ctrl.abort(),
    async waitFor(pred, ms = 3000) {
      const end = Date.now() + ms;
      while (!events.some(pred)) { if (Date.now() > end) return null; await new Promise(r => { waiters.push(r); setTimeout(r, 100); }); }
      return events.find(pred);
    }
  };
}

test('every write returns a new version and the version it replaced', async () => {
  const v0 = (await req(s.base, 'GET', '/api/version')).json.version;
  const r = await send(s.base, admin, ops({ cols: { notes: col({ added: [{ id: 'n1', title: 'x', body: 'y' }] }) } }));
  assert.equal(r.status, 200);
  assert.equal(r.json.prev, v0);
  assert.ok(r.json.version > v0);
  assert.equal((await data(s.base, admin)).__version, r.json.version);
});

test('the same opId sent twice (retry / offline queue) is applied once', async () => {
  const o = ops({ cols: { customers: col({ modified: [{ id: 'c1', before: { balance: 1000 }, after: { balance: 1100 } }] }) } });
  const a = await send(s.base, admin, o, 'retry-1');
  const b = await send(s.base, admin, o, 'retry-1');
  assert.equal(a.status, 200);
  assert.equal(b.json.dup, true);
  assert.equal((await data(s.base, admin)).customers.find(c => c.id === 'c1').balance, 1100);
});

test('applied opIds survive a restart (no double apply after a deploy)', async () => {
  const o = ops({ cols: { customers: col({ modified: [{ id: 'c1', before: { balance: 1100 }, after: { balance: 1200 } }] }) } });
  await send(s.base, admin, o, 'retry-2');
  await s.restart(); admin = (await adminLogin(s.base)).token;
  assert.equal((await send(s.base, admin, o, 'retry-2')).json.dup, true);
  assert.equal((await data(s.base, admin)).customers.find(c => c.id === 'c1').balance, 1200);
});

test('balance / quantity / paid: two devices changing at once → both differences count', async () => {
  const q = (await data(s.base, admin)).products.find(p => p.id === 'p2').quantity;   // 200
  await send(s.base, admin, ops({ cols: { products: col({ modified: [{ id: 'p2', before: { quantity: q }, after: { quantity: q - 30 } }] }) } }));
  /* the second device still thinks it is q */
  await send(s.base, admin, ops({ cols: { products: col({ modified: [{ id: 'p2', before: { quantity: q }, after: { quantity: q - 20 } }] }) } }));
  assert.equal((await data(s.base, admin)).products.find(p => p.id === 'p2').quantity, q - 50);
});

test('other fields: the last write wins', async () => {
  await send(s.base, admin, ops({ cols: { customers: col({ modified: [{ id: 'c2', before: { phone: '01000000002' }, after: { phone: '0111' } }] }) } }));
  await send(s.base, sales, ops({ cols: { customers: col({ modified: [{ id: 'c2', before: { phone: '01000000002' }, after: { phone: '0122' } }] }) } }));
  assert.equal((await data(s.base, admin)).customers.find(c => c.id === 'c2').phone, '0122');
});

test('an edit of a record deleted meanwhile on another device is ignored, not resurrected', async () => {
  await send(s.base, admin, ops({ cols: { notes: col({ added: [{ id: 'n_gone', title: 'x' }] }) } }));
  await send(s.base, admin, ops({ cols: { notes: col({ removed: ['n_gone'] }) } }));
  const r = await send(s.base, admin, ops({ cols: { notes: col({ modified: [{ id: 'n_gone', before: { title: 'x' }, after: { title: 'y' } }] }) } }));
  assert.equal(r.status, 200);
  assert.equal((await data(s.base, admin)).notes.some(n => n.id === 'n_gone'), false);
});

test('live stream: needs a login', async () => {
  const st = openStream('0'.repeat(64));
  assert.equal(await st.ready, 401);
});

test('live stream: another device is told about a change, with who made it', async () => {
  const st = openStream(admin);
  assert.equal(await st.ready, 200);
  assert.ok(await st.waitFor(e => e.event === 'connected'));
  const r = await req(s.base, 'POST', '/api/ops', { token: sales, headers: { 'X-Client-Id': 'device-B' },
    body: { opId: 'live-1', cid: 'device-B', ops: ops({ cols: { notes: col({ added: [{ id: 'n_live', title: 'live' }] }) } }) } });
  assert.equal(r.status, 200);
  const ev = await st.waitFor(e => e.event === 'data_changed');
  st.close();
  assert.ok(ev, 'no data_changed event');
  assert.equal(ev.source, 'device-B');
  assert.equal(ev.by, SALES.id);
  assert.equal(ev.version, r.json.version);
});

test('live stream: a refused change is not announced', async () => {
  const st = openStream(admin);
  await st.ready; await st.waitFor(e => e.event === 'connected');
  const n = st.events.length;
  assert.equal((await send(s.base, sales, ops({ cols: { customers: col({ removed: ['c2'] }) } }))).status, 403);
  await new Promise(r => setTimeout(r, 400));
  st.close();
  assert.equal(st.events.slice(n).some(e => e.event === 'data_changed'), false);
});

test('live stream: at most 6 per user — the oldest is closed', async () => {
  const streams = [];
  for (let i = 0; i < 7; i++) { const st = openStream(sales); await st.ready; await st.waitFor(e => e.event === 'connected'); streams.push(st); }
  const first = await streams[0].waitFor(e => e.closed, 2000);
  streams.forEach(x => x.close());
  assert.ok(first, 'the oldest stream was not closed');
});

test('a device can catch up with GET /api/version + GET /api/data (polling fallback)', async () => {
  const v = (await req(s.base, 'GET', '/api/version')).json.version;
  await send(s.base, sales, ops({ cols: { notes: col({ added: [{ id: 'n_poll', title: 'p' }] }) } }));
  const v2 = (await req(s.base, 'GET', '/api/version')).json.version;
  assert.ok(v2 > v);
  const d = await data(s.base, admin);
  assert.equal(d.__version, v2);
  assert.ok(d.notes.some(n => n.id === 'n_poll'));
});

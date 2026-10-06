/* «طلبات الموافقة» and «الطلبات والمقترحات»: who may add / withdraw / decide. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';
import { adminLogin, send, ops, col, data, createUser, seedOps, SALES, CLERK } from '../helpers/api.mjs';

let s, admin, sales, other, clerk;
before(async () => {
  s = await startServer();
  admin = (await adminLogin(s.base)).token;
  await send(s.base, admin, seedOps());
  sales = await createUser(s.base, admin, SALES);
  clerk = await createUser(s.base, admin, CLERK);
  other = await createUser(s.base, admin, { id: 'u_other', username: 'other', password: 'Other-User-Pass-1', name: 'تاني', role: 'sales' });
});
after(() => s.stop());

const reqItem = (id, by, extra = {}) => Object.assign({ id, status: 'pending', by: { id: by, name: 'x' }, createdAt: Date.now(), kind: 'edit', why: [{ t: 'rm', k: 'customers' }] }, extra);

for (const key of ['_approvals', '_requests']) {
  test(`${key}: a user may add his own pending request`, async () => {
    const r = await send(s.base, sales, ops({ sets: { [key]: col({ added: [reqItem(key + '1', SALES.id)] }) } }));
    assert.equal(r.status, 200);
    assert.ok((await data(s.base, admin)).settings[key].some(x => x.id === key + '1'));
  });

  test(`${key}: a user cannot add a request in someone else's name`, async () => {
    const r = await send(s.base, sales, ops({ sets: { [key]: col({ added: [reqItem(key + 'x', 'u_other')] }) } }));
    assert.equal(r.status, 403);
  });

  test(`${key}: a user cannot add an already-approved request`, async () => {
    const r = await send(s.base, sales, ops({ sets: { [key]: col({ added: [reqItem(key + 'y', SALES.id, { status: 'approved' })] }) } }));
    assert.equal(r.status, 403);
  });

  test(`${key}: a user cannot approve, even his own request`, async () => {
    const r = await send(s.base, sales, ops({ sets: { [key]: col({ modified: [{ id: key + '1', before: { status: 'pending' }, after: { status: 'approved', decidedAt: Date.now() } }] }) } }));
    assert.equal(r.status, 403);
  });

  test(`${key}: another user cannot withdraw it; the owner can`, async () => {
    const m = { id: key + '1', before: { status: 'pending' }, after: { status: 'withdrawn', decidedAt: Date.now() } };
    assert.equal((await send(s.base, other, ops({ sets: { [key]: col({ modified: [m] }) } }))).status, 403);
    assert.equal((await send(s.base, sales, ops({ sets: { [key]: col({ modified: [m] }) } }))).status, 200);
  });

  test(`${key}: a user cannot delete requests; the admin can decide and delete`, async () => {
    await send(s.base, sales, ops({ sets: { [key]: col({ added: [reqItem(key + '2', SALES.id)] }) } }));
    assert.equal((await send(s.base, sales, ops({ sets: { [key]: col({ removed: [key + '2'] }) } }))).status, 403);
    assert.equal((await send(s.base, admin, ops({ sets: { [key]: col({ modified: [{ id: key + '2', before: { status: 'pending' }, after: { status: 'approved' } }] }) } }))).status, 200);
    assert.equal((await send(s.base, admin, ops({ sets: { [key]: col({ removed: [key + '2'] }) } }))).status, 200);
  });
}

test('an approved change is applied by the admin and goes through', async () => {
  const r = await send(s.base, clerk, ops({ cols: { customers: col({ removed: ['c2'] }) } }));
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'needs_approval');
  /* the admin applies it (what «موافقة» does in the browser) */
  assert.equal((await send(s.base, admin, ops({ cols: { customers: col({ removed: ['c2'] }) } }))).status, 200);
  assert.equal((await data(s.base, admin)).customers.some(c => c.id === 'c2'), false);
});

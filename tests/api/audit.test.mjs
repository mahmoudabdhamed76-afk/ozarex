/* Phase 2 · C3 — the audit log is written by the server, append-only. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { req, adminLogin, send, ops, col, data, createUser, seedOps, SALES, CLERK } from '../helpers/api.mjs';

let s, admin, sales, clerk;
const relogin = async () => { admin = (await adminLogin(s.base)).token; };
before(async () => {
  s = await startServer();
  await relogin();
  await send(s.base, admin, seedOps());
  sales = await createUser(s.base, admin, SALES);
  clerk = await createUser(s.base, admin, CLERK);
});
after(() => s.stop());

const log = async () => (await data(s.base, admin)).auditLog;
const find = (l, pred) => l.find(pred);

test('every accepted change gets a server entry: who (from the session), when, what, which record', async () => {
  const t0 = Date.now();
  assert.equal((await send(s.base, clerk, ops({ cols: { customers: col({ added: [{ id: 'c_a', name: 'عميل للسجل', balance: 0 }] }) } }))).status, 200);
  const e = find(await log(), x => x.recordId === 'c_a' && x.operation === 'add');
  assert.ok(e, 'no entry');
  assert.equal(e.source, 'server');
  assert.equal(e.userId, CLERK.id);
  assert.equal(e.userName, CLERK.name);
  assert.equal(e.userRole, 'sales');
  assert.equal(e.table, 'customers');
  assert.equal(e.after.name, 'عميل للسجل');
  assert.ok(e.timestamp >= t0 && e.timestamp <= Date.now());
  assert.ok(['normal', 'low', 'medium', 'high'].includes(e.suspicionLevel));
});

test('an edit records only the fields that changed, before → after (as the server had them)', async () => {
  await send(s.base, clerk, ops({ cols: { customers: col({ modified: [{ id: 'c_a', before: { phone: 'whatever the device claims' }, after: { phone: '0123' } }] }) } }));
  const e = find(await log(), x => x.recordId === 'c_a' && x.operation === 'edit');
  assert.equal(e.before.phone, undefined, 'the server had no phone for this customer');
  assert.equal(e.after.phone, '0123');
  assert.ok(!('name' in e.after), 'unchanged fields are not repeated');
  assert.notEqual(e.before.phone, 'whatever the device claims', 'the "before" comes from the server, not the device');
});

test('a delete records the whole record as it was', async () => {
  await send(s.base, admin, ops({ cols: { customers: col({ removed: ['c_a'] }) } }));
  const e = find(await log(), x => x.recordId === 'c_a' && x.operation === 'delete');
  assert.equal(e.before.name, 'عميل للسجل');
  assert.equal(e.userId, 'u1');
});

test('the device cannot write the log: its entries are ignored (no fake user, no fake action)', async () => {
  const fake = { id: 'au_fake', timestamp: Date.now(), userId: 'u1', userName: 'المدير', operation: 'delete', table: 'invoices', recordId: 'i1' };
  const r = await send(s.base, clerk, ops({ cols: { auditLog: col({ added: [fake] }), notes: col({ added: [{ id: 'n1', title: 'x' }] }) } }));
  assert.equal(r.status, 200);
  const l = await log();
  assert.equal(l.some(x => x.id === 'au_fake'), false);
  assert.equal(l.some(x => x.table === 'invoices' && x.operation === 'delete' && x.recordId === 'i1'), false);
  assert.equal(find(l, x => x.recordId === 'n1').userId, CLERK.id);
});

test('a reason typed on the device is kept on the matching server entry (text only)', async () => {
  const reason = { id: 'au_r', operation: 'edit', table: 'customers', recordId: 'c2', reason: 'العميل طلب تعديل التليفون', userId: 'u1' };
  await send(s.base, clerk, ops({ cols: { customers: col({ modified: [{ id: 'c2', before: {}, after: { phone: '0999' } }] }), auditLog: col({ added: [reason] }) } }));
  const e = find(await log(), x => x.recordId === 'c2' && x.operation === 'edit' && x.after && x.after.phone === '0999');
  assert.equal(e.reason, 'العميل طلب تعديل التليفون');
  assert.equal(e.userId, CLERK.id, 'the reason never changes who did it');
});

test('an old client that sends ONLY audit entries: accepted as a no-op, nothing logged, no version bump', async () => {
  const v = (await req(s.base, 'GET', '/api/version')).json.version, n = (await log()).length;
  const r = await send(s.base, clerk, ops({ cols: { auditLog: col({ added: [{ id: 'au_only', userId: CLERK.id, operation: 'add', table: 'notes' }] }) } }));
  assert.equal(r.status, 200);
  assert.equal(r.json.noop, true);
  assert.equal((await req(s.base, 'GET', '/api/version')).json.version, v);
  assert.equal((await log()).length, n);
});

test('refused changes leave no entry (forbidden, needs approval, invalid, database refusal)', async () => {
  const n = (await log()).length;
  assert.equal((await send(s.base, sales, ops({ cols: { expenses: col({ added: [{ id: 'x', description: 'x', amount: 1, date: '2026-10-06' }] }) } }))).status, 403);
  assert.equal((await send(s.base, clerk, ops({ cols: { customers: col({ removed: ['c2'] }) } }))).status, 403);
  assert.equal((await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_noname' }] }) } }))).status, 403);
  const db = new DatabaseSync(path.join(s.dataDir, 'erp.db'));
  db.exec("CREATE TRIGGER IF NOT EXISTS t_boom BEFORE INSERT ON customers WHEN NEW.name = 'BOOM' BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: t_boom'); END;");
  db.close();
  assert.equal((await send(s.base, admin, ops({ cols: { customers: col({ added: [{ id: 'c_boom', name: 'BOOM' }] }) } }))).status, 403);
  assert.equal((await log()).length, n);
  await s.restart(); await relogin();
  assert.equal((await log()).length, n, 'and nothing slipped into the database either');
});

test('nobody can delete or edit entries through the API — not even the admin', async () => {
  const l = await log(), id = l[0].id, n = l.length;
  for (const tok of [admin, clerk]) {
    const del = await send(s.base, tok, ops({ cols: { auditLog: col({ removed: [id] }) } }));
    assert.equal(del.status, 403);
    assert.equal(del.json.error, 'audit_append_only');
    const ed = await send(s.base, tok, ops({ cols: { auditLog: col({ modified: [{ id, before: {}, after: { userName: 'حد تاني' } }] }) } }));
    assert.equal(ed.status, 403);
  }
  const l2 = await log();
  assert.equal(l2.length, n);
  assert.equal(find(l2, x => x.id === id).userName, l[0].userName);
});

test('a real change that carries an audit removal (old client trimming its local list) still saves; the log is untouched', async () => {
  const id = (await log()).at(-1).id;
  const r = await send(s.base, admin, ops({ cols: { notes: col({ added: [{ id: 'n_trim', title: 'x' }] }), auditLog: col({ removed: [id] }) } }));
  assert.equal(r.status, 200);
  assert.ok((await log()).some(x => x.id === id));
});

test('passwords never reach the log; a password change is recorded as "changed"', async () => {
  await send(s.base, admin, ops({ cols: { users: col({ added: [{ id: 'u_new', username: 'newbie', password: 'Newbie-Pass-123', name: 'جديد', role: 'sales' }] }) } }));
  await send(s.base, admin, ops({ cols: { users: col({ modified: [{ id: 'u_new', before: {}, after: { password: 'Newbie-Pass-456' } }] }) } }));
  const t = (await req(s.base, 'POST', '/api/login', { body: { username: 'newbie', password: 'Newbie-Pass-456' } })).json.token;
  await req(s.base, 'POST', '/api/password', { token: t, body: { current: 'Newbie-Pass-456', next: 'Newbie-Pass-789' } });
  const l = await log();
  assert.doesNotMatch(JSON.stringify(l), /Newbie-Pass|scrypt\$/);
  assert.ok(l.some(x => x.recordId === 'u_new' && x.after && x.after.password === '(اتغيّرت)'));
  assert.ok(l.some(x => x.recordId === 'u_new' && x.userId === 'u_new' && /بنفسه/.test(x.after.password)));
});

test('secret settings (portal links, settings lock) are logged as changed, without their values', async () => {
  await send(s.base, admin, ops({ keys: { _portal: { c1: 'ab'.repeat(20) }, _auditLock: 'e'.repeat(64) } }));
  const l = await log();
  const p = find(l, x => x.table === 'settings' && x.recordId === '_portal');
  assert.ok(p);
  assert.doesNotMatch(JSON.stringify(l), /abababab|eeeeeeee/);
});

test('restore and reset keep the whole history and add their own entry', async () => {
  const before = (await log()).length;
  const blob = await data(s.base, admin);
  assert.equal((await req(s.base, 'POST', '/api/data', { token: admin, body: Object.assign({}, blob, { auditLog: [{ id: 'au_from_file', userId: 'u1', operation: 'delete', table: 'invoices' }] }) })).status, 200);
  let l = await log();
  assert.equal(l.length, before + 1);
  assert.ok(find(l, x => x.operation === 'restore' && x.userId === 'u1'));
  assert.equal(l.some(x => x.id === 'au_from_file'), false, 'entries from a file are never imported');
  assert.equal((await req(s.base, 'POST', '/api/reset', { token: admin })).status, 200);
  l = await log();
  assert.equal(l.length, before + 2);
  assert.ok(find(l, x => x.operation === 'reset'));
});

test('old (device-written) entries already in the database stay readable', async () => {
  const db = new DatabaseSync(path.join(s.dataDir, 'erp.db'));
  const old = { id: 'au_legacy', timestamp: 1700000000000, userId: 'u1', userName: 'المدير', operation: 'edit', table: 'invoices', recordId: 'i1', recordLabel: 'فاتورة #1001', before: { total: 1 }, after: { total: 2 }, device: 'Chrome', ip: '1.2.3.4', suspicionLevel: 'low', suspicionFlags: [] };
  db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('u1', 'edit', 'invoices', 'au_legacy', JSON.stringify(old), '2023-11-14');
  db.close();
  await s.restart(); await relogin();
  const e = find(await log(), x => x.id === 'au_legacy');
  assert.deepEqual(e, old);
});

test('the log is append-only in the database too: never trimmed', async () => {
  const db = new DatabaseSync(path.join(s.dataDir, 'erp.db'));
  const n0 = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c;
  db.close();
  for (let i = 0; i < 5; i++) await send(s.base, admin, ops({ cols: { notes: col({ added: [{ id: 'nn' + i, title: 'x' }] }) } }));
  const db2 = new DatabaseSync(path.join(s.dataDir, 'erp.db'));
  assert.equal(db2.prepare('SELECT COUNT(*) c FROM audit_log').get().c, n0 + 5);
  db2.close();
});

test('non-admins do not receive the audit log', async () => {
  assert.deepEqual((await data(s.base, clerk)).auditLog, []);
});

test('suspicion rules run on the server (e.g. deleting an invoice is «high»)', async () => {
  await send(s.base, admin, ops({ cols: { invoices: col({ added: [{ id: 'i_del', number: 4444, customerId: 'c1', date: '2026-10-06', total: 5, items: [] }] }) } }));
  await send(s.base, admin, ops({ cols: { invoices: col({ removed: ['i_del'] }) } }));
  const e = find(await log(), x => x.recordId === 'i_del' && x.operation === 'delete');
  assert.equal(e.suspicionLevel, 'high');
  assert.ok(e.suspicionFlags.some(f => f.reason === 'حذف فاتورة'));
});

test('a renumbered invoice is logged with the number it really got', async () => {
  await send(s.base, admin, ops({ cols: { invoices: col({ added: [{ id: 'i_n1', number: 6000, customerId: 'c1', date: '2026-10-06', total: 5, items: [] }] }) } }));
  await send(s.base, admin, ops({ cols: { invoices: col({ added: [{ id: 'i_n2', number: 6000, customerId: 'c1', date: '2026-10-06', total: 5, items: [] }] }) } }));
  const e = find(await log(), x => x.recordId === 'i_n2' && x.operation === 'add');
  assert.equal(e.after.number, 6001);
  assert.equal(e.after.renumberedFrom, 6000);
});

test('sign-in still works after all of this (sanity)', async () => {
  assert.equal((await req(s.base, 'POST', '/api/login', { body: { username: 'admin', password: ADMIN_PASSWORD } })).status, 200);
});

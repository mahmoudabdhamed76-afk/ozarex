/* Phase 3 · C4 from real browsers: the offline copy lives in IndexedDB, the old localStorage copy is
   migrated safely, the queue of unsent changes is never touched by it, and the server stays the truth. */
import { test, expect, formLogin, watchErrors, ADMIN_PASSWORD, offlineCopy, clearOfflineCopy, queuedCount, localStorageChars, reopenOffline } from './fixtures.mjs';
import { adminLogin, req } from '../helpers/api.mjs';

/* while the device is offline a pull that was already queued fails with a network error — expected, logged by the app */
const OFFLINE_NET = /\[Sync\] pull failed: TypeError: Failed to fetch/;
const tag = () => test.info().project.name + '-' + Date.now().toString(36);
const serverHas = async (base, id) => (await req(base, 'GET', '/api/data', { token: (await adminLogin(base)).token })).json.customers.some(c => c.id === id);

/* signs in online (stores the offline password check), waits for the service worker */
async function signIn(page, base) {
  await formLogin(page, base, 'admin', ADMIN_PASSWORD);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.evaluate(() => OfflineManager.snapshotSettled());
}
async function goOffline(page, context) {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}
async function addOffline(page, id, name) {
  await page.evaluate(([i, n]) => { DB.data.customers.push({ id: i, name: n, balance: 0, customPrices: {} }); DB.save(); }, [id, name]);
}
/* puts a pre-Phase 3 copy in localStorage (exact old format) and empties IndexedDB's copy — as on a device
   that last ran the old version. The running app is told to stop saving so it can't overwrite the setup. */
async function plantOldCopy(page, { marker, ts, emptyIdb = true }) {
  await page.evaluate(() => { OfflineManager.trySave = async () => {}; });
  await page.evaluate(() => OfflineManager.snapshotSettled());
  if (emptyIdb) await clearOfflineCopy(page);
  return page.evaluate(([marker, ts]) => {
    const data = JSON.parse(JSON.stringify(DB.data));
    data.customers.push({ id: marker, name: 'من النسخة القديمة', balance: 0, customPrices: {} });
    const raw = JSON.stringify({ data, ts, owner: currentUser.id });
    localStorage.setItem('em_offline_snap', raw);
    return raw;
  }, [marker, ts]);
}

test('migration: an old localStorage copy is moved to IndexedDB, verified, then removed — queued changes untouched', async ({ page, server, context }) => {
  await signIn(page, server.base);
  const errors = watchErrors(page, { allow: OFFLINE_NET });   // from here on (the login page's own «not signed in yet» 401 is normal)
  await goOffline(page, context);
  const queued = 'c_q_' + tag();
  await addOffline(page, queued, 'في الطابور قبل الترحيل');
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBe(1);
  const marker = 'c_legacy_' + tag();
  const raw = await plantOldCopy(page, { marker, ts: Date.now() - 60_000 });
  expect(await offlineCopy(page)).toBeNull();
  expect(await queuedCount(page)).toBe(1);

  await reopenOffline(page, 'admin', ADMIN_PASSWORD);                    // the old version's copy opens offline
  expect(await page.evaluate(m => DB.data.customers.some(c => c.id === m), marker)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('em_offline_snap'))).toBeNull();   // removed only after the check
  const copy = await offlineCopy(page, { withJson: true });
  expect(copy.v).toBe(1);
  expect(copy.owner).toBe(JSON.parse(raw).owner);                        // whose copy it is (Phase 2) is kept
  expect(JSON.parse(copy.json).customers.some(c => c.id === marker)).toBe(true);
  expect(await queuedCount(page)).toBe(1);                                // the unsent change was not touched
  expect(await localStorageChars(page)).toBeLessThan(20_000);

  /* reconnect: the queued change is sent; the server stays the source of truth */
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => serverHas(server.base, queued), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 15_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('migration is idempotent: if IndexedDB already holds a newer copy, the stale old copy is only removed', async ({ page, server, context }) => {
  await signIn(page, server.base);
  const before = await offlineCopy(page);
  expect(before).not.toBeNull();
  const marker = 'c_stale_' + tag();
  await plantOldCopy(page, { marker, ts: before.ts - 3_600_000, emptyIdb: false });   // older than the IndexedDB copy
  await goOffline(page, context);
  await reopenOffline(page, 'admin', ADMIN_PASSWORD);
  expect(await page.evaluate(m => DB.data.customers.some(c => c.id === m), marker)).toBe(false);   // the newer copy won
  expect(await page.evaluate(() => localStorage.getItem('em_offline_snap'))).toBeNull();
  await context.setOffline(false);
});

test('a failed migration never deletes the old copy — it still opens offline, the failure is reported, and the next start retries', async ({ page, server, context }) => {
  await signIn(page, server.base);
  await goOffline(page, context);
  const marker = 'c_keep_' + tag();
  const raw = await plantOldCopy(page, { marker, ts: Date.now() - 60_000 });
  /* from the next load on, this page's IndexedDB refuses every write to the copy (as on a full disk) */
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) {
      if (this.name === 'data_snapshot') throw new DOMException('test: no space left', 'QuotaExceededError');
      return put.apply(this, a);
    };
  });
  const logged = [];
  page.on('console', m => { if (m.type() === 'error') logged.push(m.text()); });
  await reopenOffline(page, 'admin', ADMIN_PASSWORD);
  expect(await page.evaluate(m => DB.data.customers.some(c => c.id === m), marker)).toBe(true);    // opened from the old copy
  expect(await page.evaluate(() => localStorage.getItem('em_offline_snap'))).toBe(raw);           // untouched, byte for byte
  expect(await offlineCopy(page)).toBeNull();
  const st = await page.evaluate(() => OfflineManager.snapshotSettled());
  expect(st.ok).toBe(false);                                                                       // not silent: status…
  expect(st.error).toMatch(/QuotaExceededError/);
  expect(logged.some(t => /moving the offline copy to IndexedDB failed/.test(t))).toBe(true);     // …the console…
  await expect(page.locator('#toast-container')).toContainText('النسخة الأوف لاين متحفظتش');       // …and the user

  /* next start with working storage: migration runs again and succeeds */
  const page2 = await context.newPage();
  await page.close();
  await page2.goto(server.base + '/').catch(() => {});
  await reopenOffline(page2, 'admin', ADMIN_PASSWORD);
  expect(await page2.evaluate(m => DB.data.customers.some(c => c.id === m), marker)).toBe(true);
  expect(await page2.evaluate(() => localStorage.getItem('em_offline_snap'))).toBeNull();
  expect((await offlineCopy(page2)).bytes).toBeGreaterThan(100);
  await context.setOffline(false);
});

test('normal offline use: several changes stay queued across an offline reopen, are sent once after reconnecting, and the server wins', async ({ page, server, context }) => {
  await signIn(page, server.base);
  const errors = watchErrors(page, { allow: OFFLINE_NET });   // from here on (the login page's own «not signed in yet» 401 is normal)
  await goOffline(page, context);
  const ids = [1, 2, 3].map(i => 'c_off' + i + '_' + tag());
  for (const id of ids) { await addOffline(page, id, 'أوف لاين ' + id); await page.waitForTimeout(400); }
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBe(3);
  /* meanwhile another device changes a record on the server */
  const admin = (await adminLogin(server.base)).token;
  const other = 'c_srv_' + tag();
  await req(server.base, 'POST', '/api/ops', { token: admin, body: { opId: 'srv-' + other, ops: { cols: { customers: { added: [{ id: other, name: 'من جهاز تاني', balance: 0 }], removed: [], modified: [] } }, sets: {}, keys: {}, counters: null } } });

  await page.evaluate(() => OfflineManager.snapshotSettled());
  await reopenOffline(page, 'admin', ADMIN_PASSWORD);
  expect(await page.evaluate(i => i.every(x => DB.data.customers.some(c => c.id === x)), ids)).toBe(true);
  expect(await queuedCount(page)).toBe(3);
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBe(3);
  expect(await page.evaluate(o => DB.data.customers.some(c => c.id === o), other)).toBe(false);   // the copy is only a cache

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => { const d = (await req(server.base, 'GET', '/api/data', { token: admin })).json; return ids.filter(x => d.customers.some(c => c.id === x)).length; }, { timeout: 20_000 }).toBe(3);
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 15_000 }).toBe(0);
  await expect.poll(() => page.evaluate(o => DB.data.customers.some(c => c.id === o), other), { timeout: 15_000 }).toBe(true);   // server data pulled in
  const d = (await req(server.base, 'GET', '/api/data', { token: admin })).json;
  expect(d.customers.filter(c => ids.includes(c.id)).length).toBe(3);                          // each sent once
  expect(errors).toEqual([]);
});

test('a save that cannot be stored is reported (console + status + one warning), never swallowed', async ({ page, server }) => {
  await signIn(page, server.base);
  const logged = [];
  page.on('console', m => { if (m.type() === 'error') logged.push(m.text()); });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { if (this.name === 'data_snapshot') throw new DOMException('test: no space left', 'QuotaExceededError'); return put.apply(this, a); };
    DB.data.customers[0].notes = 'تجربة ' + Date.now(); DB.save();
  });
  await expect.poll(async () => (await page.evaluate(() => OfflineManager.snapshotSettled())).ok, { timeout: 10_000 }).toBe(false);
  expect(logged.some(t => /offline copy NOT saved/.test(t))).toBe(true);
  await expect(page.locator('#toast-container')).toContainText('النسخة الأوف لاين متحفظتش');
});

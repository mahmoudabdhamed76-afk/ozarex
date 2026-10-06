/* Regression tests for the current sync, driven from real browsers:
   two devices live, the offline queue, and the large dataset (C4 + timings). */
import { test, expect, openSignedIn, watchErrors, waitForApp, formLogin, offlineCopy } from './fixtures.mjs';
import { login, adminLogin, send, ops, col, req } from '../helpers/api.mjs';
import { ADMIN_PASSWORD } from '../helpers/server.mjs';

const tag = () => test.info().project.name + '-' + Date.now().toString(36);

test('a change from another device shows up live (SSE), without reloading', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => navigate('customers'));
  await page.waitForTimeout(1500);                                  // live stream connected
  const sales = (await login(server.base, 'sara', 'Sales-Test-Pass-77')).token;
  const name = 'من جهاز تاني ' + tag();
  expect((await send(server.base, sales, ops({ cols: { customers: col({ added: [{ id: 'c_' + tag(), name, balance: 0 }] }) } }))).status).toBe(200);
  await expect(page.locator('#page-content')).toContainText(name, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('two browsers: an edit in one appears in the other', async ({ app: a, server, browser }, info) => {
  const ctxB = await browser.newContext(info.project.use);
  const b = await ctxB.newPage();
  await openSignedIn(b, ctxB, server.base, (await login(server.base, 'admin', ADMIN_PASSWORD)).token);
  await b.waitForTimeout(1500);
  const name = 'تعديل من المتصفح أ ' + tag();
  await a.evaluate(n => { const c = DB.data.customers.find(x => x.id === 'c2'); c.notes = n; DB.save(); }, name);
  await expect.poll(() => b.evaluate(() => (DB.data.customers.find(x => x.id === 'c2') || {}).notes), { timeout: 10_000 }).toBe(name);
  await ctxB.close();
});

test('offline: changes are queued on the device and sent when the connection returns', async ({ app: page, server, context }) => {
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  const id = 'c_off_' + tag();
  await page.evaluate(i => { DB.data.customers.push({ id: i, name: 'اتعمل أوف لاين', balance: 0, customPrices: {} }); DB.save(); }, id);
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBeGreaterThan(0);
  const admin = (await adminLogin(server.base)).token;
  expect((await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === id)).toBe(false);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === id), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBe(0);
});

test('a change the server refuses is rolled back on the device', async ({ page, server, context }) => {
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, (await login(server.base, 'clerk', 'Clerk-Test-Pass-55')).token);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { DB.data.customers = DB.data.customers.filter(c => c.id !== 'c2'); DB.save(); });   // delete → needs approval
  await expect(page.locator('#toast-container')).toContainText('موافقة', { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => DB.data.customers.some(c => c.id === 'c2')), { timeout: 10_000 }).toBe(true);
  expect(errors.filter(e => !/403/.test(e))).toEqual([]);
});

test('control: with normal data the offline copy is saved (IndexedDB since Phase 3)', async ({ app: page }) => {
  await page.waitForTimeout(1500);
  expect((await page.evaluate(() => OfflineManager.snapshotSettled())).ok).toBe(true);
  expect((await offlineCopy(page)).bytes).toBeGreaterThan(100);
  expect(await page.evaluate(() => localStorage.getItem('em_offline_snap'))).toBeNull();
});

test('reopening while the server is down: the password is asked, then the saved copy opens (Phase 2 · I11)', async ({ page, server, context }) => {
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page.locator('#app')).toBeHidden();
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await waitForApp(page);
  await expect(page.locator('#offline-banner')).toHaveClass(/show/);
  expect(await page.evaluate(() => DB.data.customers.length)).toBeGreaterThan(0);
  await context.setOffline(false);
});

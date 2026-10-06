/* Phase 2 from real browsers: restricted users keep working pages; logout / offline / live-stream security. */
import { test, expect, PAGES, watchErrors, waitForApp, formLogin, openSignedIn, horizontalOverflow, ADMIN_PASSWORD, SALES, CLERK, offlineCopy } from './fixtures.mjs';
import { login, adminLogin, req } from '../helpers/api.mjs';

const USERS = {
  restricted: { username: SALES.username, password: SALES.password },          // Dashboard + Issuances
  sales: { username: CLERK.username, password: CLERK.password },               // the sales role's pages
  accountant: { username: 'acct', password: 'Acct-Test-Pass-1' },
  stockOnly: { username: 'keeper', password: 'Keep-Test-Pass-1' }
};

for (const [who, cred] of Object.entries(USERS)) {
  test(`C1: «${who}» — every page he may open works, with only his data (no errors, nothing refused)`, async ({ page, context, server }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openSignedIn(page, context, server.base, (await login(server.base, cred.username, cred.password)).token);
    await page.waitForTimeout(1500);
    const pages = await page.evaluate(() => (typeof userPages === 'function' ? userPages((DB.data.users || []).find(u => u.id === currentUser.id) || currentUser) : []));
    expect(pages.length).toBeGreaterThan(2);
    const sidebar = await page.$$eval('#sidebar-nav .nav-item', els => els.map(e => /navigate\('([^']+)'\)/.exec(e.getAttribute('onclick'))[1]));
    expect(sidebar.sort()).toEqual(pages.slice().sort());
    for (const k of pages) {
      await page.evaluate(k => navigate(k), k);
      await page.waitForFunction(k => currentPage === k, k);
      await page.waitForTimeout(500);
      await expect(page.locator('#topbar-title')).toHaveText(PAGES[k]);
      const bad = await page.evaluate(() => (document.getElementById('page-content').innerText.match(/.{0,20}(NaN|undefined|Invalid Date|\[object Object\]).{0,10}/g) || []));
      expect(bad, k + ' prints broken values').toEqual([]);
      expect(await horizontalOverflow(page), k).toBeLessThanOrEqual(test.info().project.name === 'iphone' ? 1 : 200);
    }
    await page.waitForTimeout(1200);
    expect(await page.locator('#toast-container').innerText(), 'a save was refused while just browsing').not.toMatch(/صلاحية|رفض/);
    expect(await page.evaluate(() => OfflineManager.pending)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('C1: the restricted user\'s device never receives hidden data, and the offline copy holds none of it', async ({ page, context, server }) => {
  await formLogin(page, server.base, USERS.restricted.username, USERS.restricted.password);
  await page.waitForTimeout(2000);
  await page.evaluate(() => OfflineManager.snapshotSettled());
  const copy = await offlineCopy(page, { withJson: true });            // Phase 3: the offline copy is in IndexedDB
  expect(copy && copy.bytes).toBeGreaterThan(100);
  const seen = { live: await page.evaluate(() => JSON.stringify(DB.data)), snap: copy.json };
  for (const blob of [seen.live, seen.snap]) {
    expect(blob).not.toContain('"cost"');
    expect(blob).not.toContain('"_auditLock"');
    expect(blob).not.toContain('"username":"admin"');
  }
});

test('C1: the sales role adds a customer through the real form (allowed module)', async ({ page, context, server }) => {
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, (await login(server.base, USERS.sales.username, USERS.sales.password)).token);
  const name = 'عميل من مندوب ' + test.info().project.name;
  await page.evaluate(() => { navigate('customers'); openCustomerForm(); });
  await page.fill('#cust-name-input', name);
  await page.locator('.modal-footer .btn-primary').click();
  const admin = (await adminLogin(server.base)).token;
  await expect.poll(async () => (await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.name === name), { timeout: 10_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('C1: a forbidden change made on the device is refused, shown, and rolled back', async ({ page, context, server }) => {
  const errors = watchErrors(page, { allow: /status of 403/ });
  await openSignedIn(page, context, server.base, (await login(server.base, USERS.restricted.username, USERS.restricted.password)).token);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { DB.data.expenses.push({ id: 'ex_forbidden', description: 'من الكونسول', amount: 1, date: '2026-10-06' }); DB.save(); });
  await expect(page.locator('#toast-container')).toContainText('صلاحية', { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => DB.data.expenses.length), { timeout: 10_000 }).toBe(0);
  expect(await page.evaluate(() => OfflineManager.pending)).toBe(0);
  expect(errors).toEqual([]);
});

/* ── I11 ── */
test('I11: the live stream uses a one-time ticket — the session token never appears in a URL', async ({ page, server }) => {
  const urls = [];
  page.on('request', r => urls.push(r.url()));
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForTimeout(2500);
  const token = await page.evaluate(() => localStorage.getItem('emx_tok'));
  const ev = urls.filter(u => u.includes('/api/events'));
  expect(ev.length).toBeGreaterThan(0);
  expect(ev.every(u => /[?&]st=/.test(u) && !/[?&]t=/.test(u))).toBe(true);
  expect(urls.some(u => token && u.includes(token))).toBe(false);
  await expect.poll(() => page.evaluate(() => document.getElementById('sync-status-dot') && document.getElementById('sync-status-dot').className), { timeout: 10_000 }).toContain('connected');
});

test('I11: after logout, the device cannot reopen the account offline — not even with the right password', async ({ page, server, context }) => {
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.evaluate(() => logout());
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await page.waitForTimeout(1500);
  await expect(page.locator('#app')).toBeHidden();
  expect(await page.evaluate(() => !!localStorage.getItem('em_offline_snap'))).toBe(false);
  expect(await offlineCopy(page)).toBeNull();
  await context.setOffline(false);
});

test('I11: offline, a wrong password never opens the saved copy', async ({ page, server, context }) => {
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', 'not-the-password');
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await page.waitForTimeout(2500);
  await expect(page.locator('#app')).toBeHidden();
  await context.setOffline(false);
});

test('I11: offline, one user can never open another user\'s saved copy on a shared device', async ({ page, server, context }) => {
  /* the clerk signs in once (his offline check is stored), then the admin uses the same device without signing out the clerk first */
  await formLogin(page, server.base, USERS.sales.username, USERS.sales.password);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { localStorage.removeItem('emx_tok'); });
  await context.clearCookies();
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await page.fill('#login-username', USERS.sales.username);
  await page.fill('#login-password', USERS.sales.password);
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await page.waitForTimeout(2500);
  await expect(page.locator('#app')).toBeHidden();          // the saved copy is the admin's — the clerk's password does not open it
  await context.setOffline(false);
});

test('I11: unsent changes at logout — you are asked; «wait» keeps you signed in, and the change is sent later', async ({ page, server, context }) => {
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(() => { DB.data.customers.push({ id: 'c_pending', name: 'لسه مترفعش', balance: 0, customPrices: {} }); DB.save(); });
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBeGreaterThan(0);
  page.evaluate(() => logout());
  await expect(page.locator('#logout-wait')).toBeVisible({ timeout: 10_000 });
  await page.click('#logout-wait');
  await page.waitForTimeout(800);
  await expect(page.locator('#app')).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const admin = (await adminLogin(server.base)).token;
  await expect.poll(async () => (await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === 'c_pending'), { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => logout());                        // now nothing is waiting → no question
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
});

test('I11: unsent changes at logout — «sign out and drop them» empties the device queue', async ({ page, server, context }) => {
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(() => { DB.data.customers.push({ id: 'c_dropped', name: 'هيتمسح', balance: 0, customPrices: {} }); DB.save(); });
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBeGreaterThan(0);
  page.evaluate(() => logout());
  await expect(page.locator('#logout-drop')).toBeVisible({ timeout: 10_000 });
  await page.click('#logout-drop');
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  const queued = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('erp-offline', 1); r.onsuccess = () => { const q = r.result.transaction('sync_queue').objectStore('sync_queue').getAll(); q.onsuccess = () => res(q.result.length); }; r.onerror = () => res(-1); })).catch(() => -2);
  await expect.poll(queued, { timeout: 10_000 }).toBe(0);
  await context.setOffline(false);
  const admin = (await adminLogin(server.base)).token;
  expect((await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === 'c_dropped')).toBe(false);
});

test('I11: a signed-in device still reopens straight in while the server is reachable (daily use unchanged)', async ({ page, server }) => {
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator('#login-page')).toBeHidden();
});

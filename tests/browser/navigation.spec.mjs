/* Real clicks: login form, sidebar, back button, mobile menu + bottom bar, logout. */
import { test, expect, PAGES, watchErrors, waitForApp, formLogin, ADMIN_PASSWORD, offlineCopy, queuedCount } from './fixtures.mjs';

test('login through the form, wrong password first', async ({ page, server }) => {
  const errors = watchErrors(page, { allow: /status of 401/ });   // the wrong password and the first "who am I" are 401 by design
  await page.goto(server.base + '/');
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', 'wrong-password');
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await expect(page.locator('#toast-container .toast.error')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.click('#login-form button[type=submit], #login-form .lgn-btn');
  await waitForApp(page);
  await expect(page.locator('#topbar-title')).toHaveText(PAGES.dashboard);
  expect(errors).toEqual([]);
});

test('sidebar: every item opens its page; back button returns', async ({ app: page }, info) => {
  const errors = watchErrors(page);
  const mobile = info.project.name === 'iphone';
  const labels = await page.$$eval('#sidebar-nav .nav-item', els => els.map(e => ({ text: e.innerText.trim().split('\n')[0], click: e.getAttribute('onclick') })));
  expect(labels.length).toBe(25);
  for (const it of labels) {
    const key = /navigate\('([^']+)'\)/.exec(it.click)[1];
    if (mobile) { await page.click('.topbar .menu-toggle'); await expect(page.locator('#sidebar')).toHaveClass(/open/); }
    await page.locator('#sidebar-nav .nav-item', { hasText: it.text }).first().click();
    await expect(page.locator('#topbar-title')).toHaveText(PAGES[key]);
    if (mobile) await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  }
  await page.click('#topbar-back-btn');
  await expect(page.locator('#topbar-title')).toHaveText(PAGES[/navigate\('([^']+)'\)/.exec(labels[labels.length - 2].click)[1]]);
  expect(errors).toEqual([]);
});

test('iPhone bottom bar: home, invoices, customers open; «بيع» and «المزيد» open their sheets', async ({ app: page }, info) => {
  test.skip(info.project.name !== 'iphone', 'bottom bar is the phone layout');
  const errors = watchErrors(page);
  const bar = page.locator('#bottom-nav');
  await expect(bar).toBeVisible();
  for (const [label, key] of [['الفواتير', 'invoices'], ['عملاء', 'customers'], ['الرئيسية', 'dashboard']]) {
    await bar.getByText(label, { exact: true }).click();
    await expect(page.locator('#topbar-title')).toHaveText(PAGES[key]);
  }
  for (const label of ['بيع', 'المزيد']) {
    const before = await page.evaluate(() => document.body.innerHTML.length);
    await bar.getByText(label, { exact: true }).click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.body.innerHTML.length), label + ' opened nothing').not.toBe(before);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { try { closeModal(); } catch (_) { /* none open */ } document.querySelectorAll('.mh-sheet').forEach(s => s.remove()); });
  }
  expect(errors).toEqual([]);
});

test('add a customer through the real form; it reaches the server', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const name = 'عميل من الواجهة ' + test.info().project.name;
  await page.evaluate(() => { navigate('customers'); openCustomerForm(); });
  await page.fill('#cust-name-input', name);
  await page.locator('.modal-footer .btn-primary').click();
  await expect.poll(async () => {
    const r = await fetch(server.base + '/api/data', { headers: { Cookie: 'emx_sid=' + (await page.context().cookies()).find(c => c.name === 'emx_sid').value } });
    return (await r.json()).customers.some(c => c.name === name);
  }, { timeout: 10_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('logout returns to the login screen and the session no longer works', async ({ app: page, server }) => {
  const token = (await page.context().cookies()).find(c => c.name === 'emx_sid').value;
  await page.evaluate(() => logout());
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  const r = await fetch(server.base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  expect(r.status).toBe(401);
});

test('I11 (fixed in Phase 2): logout removes the company data kept on the device', async ({ page, server }) => {
  await formLogin(page, server.base, 'admin', ADMIN_PASSWORD);
  await page.waitForTimeout(1500);
  await page.evaluate(() => OfflineManager.snapshotSettled());
  expect(await offlineCopy(page)).not.toBeNull();                     // Phase 3: the copy is in IndexedDB
  expect(await page.evaluate(() => !!localStorage.getItem('emx_offline_auth'))).toBe(true);
  /* a save is still being written when the user signs out — it must not bring the copy back afterwards */
  await page.evaluate(() => { DB.data.customers.push({ id: 'c_lastsave', name: 'آخر حفظة', balance: 0, customPrices: {} }); DB.save(); });
  await page.evaluate(() => logout());
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => ['em_offline_snap', 'emx_offline_auth', 'emx_last_user', 'emx_tok'].filter(k => localStorage.getItem(k)));
  expect(left).toEqual([]);
  expect(await offlineCopy(page)).toBeNull();
  expect(await queuedCount(page)).toBe(0);
});

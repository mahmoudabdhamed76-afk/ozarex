/* 4.96 · «إشعار لكل المستخدمين»: a sales user (not only the admin) gets the «🔔 إشعارات الموبايل — تفعيل» strip in
   the notification centre; opening the app clears the number on the app icon (clearAppBadge + /api/push/seen); a
   notification of a new expense / supply / collection opens that page; the admin switches each kind in «الملخص اليومي». */
import { test, expect, watchErrors, openSignedIn, SALES } from './fixtures.mjs';
import { login } from '../helpers/api.mjs';

test.describe.configure({ mode: 'serial' });

test('a sales user can turn push on; opening the app clears the icon number; a push link opens its page', async ({ page, context, server }) => {
  await context.addInitScript(() => {
    window.__cleared = 0;
    try { Object.defineProperty(Navigator.prototype, 'clearAppBadge', { configurable: true, value: function () { window.__cleared++; return Promise.resolve(); } }); } catch (e) {}
  });
  const seen = [];
  page.on('request', r => { if (r.url().endsWith('/api/push/seen')) seen.push(r.method()); });
  const tok = (await login(server.base, SALES.username, SALES.password)).token;
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, tok);
  await expect.poll(() => seen.length, { timeout: 15000 }).toBeGreaterThan(0);
  expect(seen[0]).toBe('POST');
  expect(await page.evaluate(() => window.__cleared)).toBeGreaterThan(0);
  await page.evaluate(() => openNotifications());
  const strip = page.locator('#axn-body [data-axp]');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('أي مصروف أو توريد أو تحصيل جديد (اللي صلاحياتك بتوريهولك)');
  await expect(strip).not.toContainText('العجز');                                  // admin-only alerts are not promised to a sales user
  await expect(strip.locator('.axp-btn')).toHaveText(/تفعيل|إيقاف/);
  await page.evaluate(() => AXN.close());
  await page.goto(server.base + '/?go=issuances');                                   // «📦 توريد جديد» → «صرف الورق للمراكز»
  await expect.poll(() => page.evaluate(() => typeof currentPage !== 'undefined' && currentPage), { timeout: 15000 }).toBe('issuances');
  expect(await page.evaluate(() => location.search)).not.toContain('go=');
  expect(errors).toEqual([]);
});

test('the admin: «💸 مصروف» / «💰 تحصيل» links open their pages; he switches each kind for everyone in «الملخص اليومي»', async ({ app: page, server }) => {
  for (const go of ['payments', 'expenses']) {
    await page.goto(server.base + '/?go=' + go);
    await expect.poll(() => page.evaluate(() => typeof currentPage !== 'undefined' && currentPage), { timeout: 15000 }).toBe(go);
  }
  const errors = watchErrors(page);                                                   // after the reloads (a reload cuts a pull short)
  await page.evaluate(() => { navigate('profit'); AXProfit.view('cash'); });
  await page.locator('.fx-dg').click();
  await expect(page.locator('.fx-dgf')).toContainText('إشعار لكل المستخدمين');
  for (const id of ['dg-aexp', 'dg-aiss', 'dg-apay']) await expect(page.locator('#' + id)).toBeChecked();
  await page.locator('label.fx-sw:has(#dg-apay)').click();
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  const cfg = await page.evaluate(() => fetch('/api/activity', { credentials: 'same-origin' }).then(r => r.json()));
  expect(cfg.config).toEqual({ actExpense: true, actIssue: true, actPay: false });
  await page.evaluate(() => fetch('/api/activity', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actPay: true }) }));
  expect(errors).toEqual([]);
});

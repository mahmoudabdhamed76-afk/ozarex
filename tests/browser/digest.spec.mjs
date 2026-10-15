/* 4.39 · «الملخص اليومي» screens: the settings sheet from «الفلوس» (time, WhatsApp number + key, alerts, the push
   switch for this device), saving it on the server, «الملخصات» (the history), the push strip in the notification
   centre for the admin, and a notification link that opens «الفلوس». */
import { test, expect, watchErrors } from './fixtures.mjs';

test.describe.configure({ mode: 'serial' });

test('the admin sets the daily summary from «الفلوس» and reads past summaries', async ({ app: page }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => { navigate('profit'); AXProfit.view('cash'); });
  await page.locator('.fx-dg').click();
  await expect(page.locator('.fx-dgf')).toBeVisible();
  await expect(page.locator('.fx-dgf [data-axp]')).toBeVisible();                 // the push switch for this device
  await expect(page.locator('.fx-dgf')).toContainText('I allow callmebot to send me messages');
  await expect(page.locator('.fx-dgf')).toContainText('@BotFather');                 // Telegram: make a bot, paste its code
  await expect(page.locator('#dg-tgtok')).toBeVisible();
  await page.locator('label.fx-sw:has(#dg-on)').click();
  await page.fill('#dg-time', '21:30');
  await page.fill('#dg-phone', '01012345678');
  await page.fill('#dg-key', 'K99');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  const cfg = await page.evaluate(() => fetch('/api/digest', { credentials: 'same-origin' }).then(r => r.json()));
  expect(cfg.config).toMatchObject({ on: true, time: '21:30', phone: '01012345678', hasKey: true });
  expect(cfg.config.apikey).not.toContain('K99');
  await page.evaluate(() => fetch('/api/digest', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: false }) }));
  await page.evaluate(() => AXFulus.digests());
  await expect(page.locator('.fx-hist')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the notification centre offers push on this device; a notification link opens «الفلوس»', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => openNotifications());
  await expect(page.locator('#axn-body [data-axp]')).toBeVisible();
  await expect(page.locator('#axn-body [data-axp] .axp-btn')).toHaveText(/تفعيل|إيقاف/);
  await page.evaluate(() => AXN.close());
  await page.goto(server.base + '/?go=fulus');
  await expect.poll(() => page.evaluate(() => typeof currentPage !== 'undefined' && currentPage), { timeout: 15000 }).toBe('profit');
  await expect(page.locator('.pfx-views button.on')).toHaveText('الفلوس');
  expect(await page.evaluate(() => location.search)).not.toContain('go=');
  expect(errors).toEqual([]);
});

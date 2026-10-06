/* Phase 1 regression tests seen from a real browser (old/new client compatibility). */
import { test, expect, watchErrors } from './fixtures.mjs';
import { login, send, ops, col, adminLogin, req } from '../helpers/api.mjs';

test('I10: new record ids are random UUIDs, also without crypto.randomUUID (plain http)', async ({ app: page }) => {
  const ids = await page.evaluate(() => {
    const a = uid(), b = uid();
    const keep = crypto.randomUUID; crypto.randomUUID = undefined;
    const c = uid();
    crypto.randomUUID = keep;
    return [a, b, c];
  });
  expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(ids[1]).not.toBe(ids[0]);
  expect(ids[2]).toMatch(/^[0-9a-f]{32}$/);
});

test('security page: the backup list shows the real date (no «NaN»)', async ({ app: page }) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => navigate('security'));
  const d = new Date(), want = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  await expect(page.locator('.sec-files li span').first()).toHaveText(want, { timeout: 10_000 });
  await expect(page.locator('#page-content')).not.toContainText('NaN');
});

test('C5: a device that used a number another device took gets the server\'s new number', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  await page.waitForTimeout(1500);
  const next = await page.evaluate(() => (DB.data.counters.invoice || 1000) + 1);
  const sales = (await login(server.base, 'sara', 'Sales-Test-Pass-77')).token;
  /* the other device saves invoice #next first */
  expect((await send(server.base, sales, ops({ cols: { invoices: col({ added: [{ id: 'inv_other_' + next, number: next, customerId: 'c2', date: '2026-10-06', total: 1, paid: 0, items: [] }] }) }, counters: { invoice: next } }))).status).toBe(200);
  /* this device (not refreshed yet) saves its own invoice with the same number */
  const mine = 'inv_mine_' + Date.now();
  await page.evaluate(([id, n]) => { DB.data.invoices.push({ id, number: n, customerId: 'c1', date: '2026-10-06', total: 2, paid: 0, items: [], createdAt: Date.now() }); DB.data.counters.invoice = n; DB.save(); }, [mine, next]);
  /* the device ends up with the number the server gave (the next free one — other tests may have used some) */
  const admin = (await adminLogin(server.base)).token;
  const onServer = async () => (await req(server.base, 'GET', '/api/data', { token: admin })).json.invoices.find(i => i.id === mine);
  await expect.poll(async () => (await onServer() || {}).number, { timeout: 15_000 }).toBeGreaterThan(next);
  const given = (await onServer()).number;
  await expect.poll(() => page.evaluate(id => (DB.data.invoices.find(i => i.id === id) || {}).number, mine), { timeout: 15_000 }).toBe(given);
  const nums = (await req(server.base, 'GET', '/api/data', { token: admin })).json.invoices.map(i => i.number).filter(n => n !== null && n !== undefined && n !== '').map(Number);
  expect(nums.filter((n, i) => nums.indexOf(n) !== i), 'duplicate invoice numbers').toEqual([]);
  expect(await page.evaluate(() => DB.data.counters.invoice)).toBeGreaterThanOrEqual(given);
  expect(errors).toEqual([]);
});

test('C2: an incomplete record from a device is refused, shown, and removed from that device', async ({ app: page, server }) => {
  const errors = watchErrors(page, { allow: /status of 403/ });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { DB.data.customers.push({ id: 'c_noname_ui', phone: '0100', balance: 0, customPrices: {} }); DB.save(); });
  await expect(page.locator('#toast-container')).toContainText('مش هينفع يتحفظ', { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => DB.data.customers.some(c => c.id === 'c_noname_ui')), { timeout: 10_000 }).toBe(false);
  const admin = (await adminLogin(server.base)).token;
  expect((await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === 'c_noname_ui')).toBe(false);
  /* the device keeps syncing normally afterwards (nothing stuck in its queue) */
  expect(await page.evaluate(() => OfflineManager.pending)).toBe(0);
  await page.evaluate(() => { DB.data.customers.push({ id: 'c_ok_ui', name: 'سليم', balance: 0, customPrices: {} }); DB.save(); });
  await expect.poll(async () => (await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === 'c_ok_ui'), { timeout: 10_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('C2: the same refusal while offline does not block the queue when the connection returns', async ({ app: page, server, context }) => {
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(() => { DB.data.customers.push({ id: 'c_bad_off', phone: '1', balance: 0, customPrices: {} }); DB.save(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { DB.data.customers.push({ id: 'c_good_off', name: 'بعد الغلط', balance: 0, customPrices: {} }); DB.save(); });
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const admin = (await adminLogin(server.base)).token;
  await expect.poll(async () => (await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === 'c_good_off'), { timeout: 20_000 }).toBe(true);
  expect((await req(server.base, 'GET', '/api/data', { token: admin })).json.customers.some(c => c.id === 'c_bad_off')).toBe(false);
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBe(0);
});

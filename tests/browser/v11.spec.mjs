/* Version 1.1 (features of 4.21–4.26) — smoke tests: each new feature opens and works without JS errors. */
import { test, expect, openSignedIn, watchErrors } from './fixtures.mjs';
import { login } from '../helpers/api.mjs';
import { ADMIN_PASSWORD } from '../helpers/server.mjs';

const isDesktop = () => test.info().project.name === 'desktop';

test('assistant understands everyday questions (paper stock, cash, who has not paid, fuzzy fallback)', async ({ app: page }) => {
  const errors = watchErrors(page);
  const r = await page.evaluate(() => ['عندي كام ورقة', 'الخزنة فيها كام', 'مين لسه مدفعش', 'ابعتلي ملخص', 'قبضت كام النهارده']
    .map(q => { const a = AXA.understand(q); return { q, title: a && a.title, plain: a ? AXA.plain(a) : '' }; }));
  for (const a of r) {
    expect(a.title, a.q).toBeTruthy();
    expect(a.plain, a.q).not.toMatch(/NaN|undefined|\[object Object\]/);
  }
  expect(errors).toEqual([]);
});

test('center statement (كشف مركز) opens from payments with the customer\'s operations', async ({ app: page }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => navigate('payments'));
  await page.waitForFunction(() => currentPage === 'payments');
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => { const x = AXStmt.model('c1'); return x ? JSON.stringify(x).length : 0; });
  expect(m).toBeGreaterThan(20);
  await page.evaluate(() => AXStmt.open('c1'));
  await expect(page.locator('#axst')).toHaveClass(/show/, { timeout: 5000 });
  const txt = await page.locator('#axst').innerText();
  expect(txt).toContain('مركز النور');
  expect(txt).not.toMatch(/NaN|undefined|Invalid Date/);
  await page.evaluate(() => AXStmt.close());
  expect(errors).toEqual([]);
});

test('floating «المزيد» on the computer: shown when signed in, opens, and is gone after logout', async ({ page, context, server }) => {
  test.skip(!isDesktop(), 'desktop only (mobile has «المزيد» in the bottom bar)');
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, (await login(server.base, 'admin', ADMIN_PASSWORD)).token);
  await expect(page.locator('#ax-more-fab')).toHaveClass(/show/, { timeout: 5000 });
  await page.click('#ax-more-fab');
  await expect(page.locator('#mh-more')).toHaveClass(/show/, { timeout: 5000 });
  await page.evaluate(() => AXDeskMore.toggle());
  expect(errors).toEqual([]);
  await page.evaluate(() => logout());
  await expect(page.locator('#login-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#ax-more-fab')).not.toHaveClass(/show/, { timeout: 2000 });   // not 3 s later via the safety timer
  /* after logout the app's own «still signed in?» check gets a 401 — expected (also before 1.1) */
  expect(errors.filter(e => !/status of 401/.test(e))).toEqual([]);
});

test('new success card (تم بنجاح) shows and closes', async ({ app: page }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => notify({ type: 'success', title: 'تم الحفظ', message: 'تجربة', autoClose: false }));
  const card = page.locator('.nk.nk-success');
  await expect(card).toBeVisible({ timeout: 5000 });
  await card.locator('.notify-close').click();
  await expect(card).toHaveCount(0, { timeout: 5000 });
  expect(errors).toEqual([]);
});

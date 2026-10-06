/* Layout checks for all 25 pages, one pass per screen size:
   · nothing wider than the screen (no sideways scrolling)
   · no broken values printed on screen (NaN, undefined, Invalid Date, [object Object])
   Pages listed in KNOWN_* fail today because of bugs that already exist; they are
   marked test.fail() so the suite stays green — when a bug is fixed, Playwright
   reports "expected to fail but passed" and the page must be removed from the list. */
import { test, expect, PAGES, openSignedIn, horizontalOverflow } from './fixtures.mjs';
import { login } from '../helpers/api.mjs';
import { ADMIN_PASSWORD } from '../helpers/server.mjs';

/* top bar too wide at 1366 px for pages with long titles → page scrolls sideways, icons cut off (found in Phase 0) */
const KNOWN_OVERFLOW = { desktop: ['issuances', 'forecast', 'payments', 'transfers', 'purchases', 'monthly', 'requests', 'users', 'audit', 'security'], iphone: [] };
/* (security page «NaN/10/6» in the backup list — fixed in Phase 1) */
const KNOWN_BAD_TEXT = [];

test.describe.configure({ mode: 'serial' });
let page;
test.beforeAll(async ({ browser, server }, info) => {
  const ctx = await browser.newContext(info.project.use);
  page = await ctx.newPage();
  await openSignedIn(page, ctx, server.base, (await login(server.base, 'admin', ADMIN_PASSWORD)).token);
});
test.afterAll(async () => { await page.context().close(); });

for (const key of Object.keys(PAGES)) {
  test(`«${key}» fits the screen width`, async ({}, info) => {
    test.fail((KNOWN_OVERFLOW[info.project.name] || []).includes(key), 'KNOWN BUG: page wider than the screen');
    await page.evaluate(k => navigate(k), key);
    await page.waitForTimeout(500);
    expect(await horizontalOverflow(page), 'extra width in px').toBeLessThanOrEqual(1);
  });
  test(`«${key}» prints no broken values`, async () => {
    test.fail(KNOWN_BAD_TEXT.includes(key), 'KNOWN BUG: broken value on screen');
    await page.evaluate(k => { if (currentPage !== k) navigate(k); }, key);
    await page.waitForTimeout(300);
    const bad = await page.evaluate(() => (document.getElementById('page-content').innerText.match(/.{0,20}(NaN|undefined|Invalid Date|\[object Object\]).{0,10}/g) || []));
    expect(bad).toEqual([]);
  });
}

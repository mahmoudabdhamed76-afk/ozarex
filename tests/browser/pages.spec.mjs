/* Every one of the 25 pages opens on desktop and at iPhone width:
   right title, content rendered, no JavaScript errors, and none of the
   injection probes in the data runs. (Width / broken text: layout.spec.mjs) */
import { test, expect, PAGES, watchErrors } from './fixtures.mjs';

for (const [key, title] of Object.entries(PAGES)) {
  test(`page «${key}» opens cleanly`, async ({ app: page }) => {
    const errors = watchErrors(page);
    await page.evaluate(k => navigate(k), key);
    await page.waitForFunction(k => currentPage === k, key);
    await page.waitForTimeout(600);                       // page-enter animation + late add-ons
    await expect(page.locator('#topbar-title')).toHaveText(title);
    const content = await page.evaluate(() => {
      const pc = document.getElementById('page-content');
      return { nodes: pc.querySelectorAll('*').length, text: pc.innerText.trim().length };
    });
    expect(content.nodes, 'page content is empty').toBeGreaterThan(3);
    expect(content.text).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__xss || 0), 'an injected script ran').toBe(0);
    expect(errors).toEqual([]);
  });
}

/* Phase 6 · desktop layout at five common screen widths: every page fits the screen (no sideways page scroll),
   every top-bar icon is on screen, the page title is not cut, the sidebar works (full and collapsed), and a
   table wider than the page scrolls inside its own box instead of the page. */
import { test, expect, PAGES, openSignedIn, watchErrors } from './fixtures.mjs';
import { login } from '../helpers/api.mjs';
import { ADMIN_PASSWORD } from '../helpers/server.mjs';

const WIDTHS = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720]];
/* the 10 pages that scrolled sideways at 1366 px before Phase 6 */
const WERE_BROKEN = ['issuances', 'forecast', 'payments', 'transfers', 'purchases', 'monthly', 'requests', 'users', 'audit', 'security'];

async function check(page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const over = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - W;
    const bar = document.querySelector('header.topbar');
    const off = Array.from(bar.children).filter(e => {
      const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = e.getBoundingClientRect(); if (!r.width) return false;
      return r.left < -1 || r.right > W + 1;
    }).map(e => e.id || e.className);
    const t = document.getElementById('topbar-title');
    const titleCut = t.scrollWidth > t.clientWidth + 1;
    /* tables wider than their box: the box must scroll sideways and itself stay on screen */
    const wide = Array.from(document.querySelectorAll('#page-content .table-scroll, #page-content .table-wrap')).filter(b => b.scrollWidth > b.clientWidth + 1).map(b => {
      const r = b.getBoundingClientRect(), ox = getComputedStyle(b).overflowX;
      return { box: b.className, scrolls: ox === 'auto' || ox === 'scroll', onScreen: r.left >= -1 && r.right <= W + 1 };
    });
    const sb = document.getElementById('sidebar').getBoundingClientRect();
    return { over, off, titleCut, wide, sidebarOnScreen: sb.width > 40 && sb.right <= W + 1 && sb.left >= -1 };
  });
}

test.describe('desktop widths', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop widths only (the iPhone width is covered by layout.spec)'); });

  for (const [w, h] of WIDTHS) {
    test(`${w}×${h}: all 25 pages fit, icons on screen, title whole, sidebar full + collapsed`, async ({ page, context, server }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await openSignedIn(page, context, server.base, (await login(server.base, 'admin', ADMIN_PASSWORD)).token);
      await page.evaluate(() => { document.documentElement.classList.remove('ax-rail'); });
      const tables = {};
      for (const k of Object.keys(PAGES)) {
        await page.evaluate(k => navigate(k), k);
        await page.waitForFunction(k => currentPage === k, k);
        await page.waitForTimeout(450);
        const r = await check(page);
        expect(r.over, `${k}: page wider than the screen by`).toBeLessThanOrEqual(1);
        expect(r.off, `${k}: top-bar items off screen`).toEqual([]);
        expect(r.titleCut, `${k}: page title cut`).toBe(false);
        expect(r.sidebarOnScreen, `${k}: sidebar`).toBe(true);
        for (const t of r.wide) { expect(t.scrolls, `${k}: wide table box scrolls sideways`).toBe(true); expect(t.onScreen, `${k}: wide table box on screen`).toBe(true); }
        if (r.wide.length) tables[k] = r.wide.length;
      }
      /* collapsed sidebar (the rail button) — the pages that used to break, again */
      await page.evaluate(() => AX.toggleRail());
      expect(await page.evaluate(() => document.documentElement.classList.contains('ax-rail'))).toBe(true);
      for (const k of WERE_BROKEN) {
        await page.evaluate(k => navigate(k), k);
        await page.waitForFunction(k => currentPage === k, k);
        await page.waitForTimeout(300);
        const r = await check(page);
        expect(r.over, `rail · ${k}`).toBeLessThanOrEqual(1);
        expect(r.off, `rail · ${k}`).toEqual([]);
      }
      await page.evaluate(() => AX.toggleRail());
      /* the menu button opens / closes the sidebar without breaking the width */
      await page.click('header.topbar .menu-toggle');
      expect((await check(page)).over).toBeLessThanOrEqual(1);
      await page.evaluate(() => toggleSidebar(false));
      test.info().annotations.push({ type: 'tables with their own sideways scroll', description: JSON.stringify(tables) });
      expect(errors).toEqual([]);
    });
  }

  test('1366×768, light theme: the pages that used to break fit too', async ({ page, context, server }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openSignedIn(page, context, server.base, (await login(server.base, 'admin', ADMIN_PASSWORD)).token);
    await page.evaluate(() => AX.setTheme('light'));
    for (const k of WERE_BROKEN) {
      await page.evaluate(k => navigate(k), k);
      await page.waitForFunction(k => currentPage === k, k);
      await page.waitForTimeout(300);
      const r = await check(page);
      expect(r.over, k).toBeLessThanOrEqual(1);
      expect(r.off, k).toEqual([]);
      expect(r.titleCut, k).toBe(false);
    }
    await page.evaluate(() => AX.setTheme('dark'));
  });
});

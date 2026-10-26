/* Phase 7.1 · every page as admin and as a sales user: console errors, page errors and unhandled promise rejections */
import { chromium } from '@playwright/test';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { login } from '../helpers/api.mjs';
import { openSignedIn, seedSmall, PAGES, SALES } from '../browser/fixtures.mjs';
const s = await startServer(); await seedSmall(s.base);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const out = {};
for (const [who, u, p] of [['admin', 'admin', ADMIN_PASSWORD], ['sales', SALES.username, SALES.password]]) {
  for (const vp of [{ width: 1366, height: 860 }, { width: 390, height: 844 }]) {
    const ctx = await b.newContext({ viewport: vp }); const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|net::ERR/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
    await page.addInitScript(() => { window.addEventListener('unhandledrejection', e => console.error('UNHANDLED ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason))); });
    await openSignedIn(page, ctx, s.base, (await login(s.base, u, p)).token);
    const keys = await page.evaluate(() => (typeof NAV_ITEMS !== 'undefined' ? NAV_ITEMS : []).map(n => n.key).filter(k => typeof can !== 'function' || can(k)));
    for (const k of keys) { await page.evaluate(k => navigate(k), k); await page.waitForTimeout(350); }
    await page.evaluate(() => navigate('dashboard')); await page.waitForTimeout(800);
    out[who + '@' + vp.width] = { pages: keys.length, errors: errs };
    await ctx.close();
  }
}
console.log(JSON.stringify(out));
await b.close(); await s.stop();

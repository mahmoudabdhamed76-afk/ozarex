/* Phase 7 · how long a signed-in device takes to show a usable app (small seeded data), 7 runs, median */
import { chromium } from '@playwright/test';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { login } from '../helpers/api.mjs';
import { openSignedIn, seedSmall } from '../browser/fixtures.mjs';
const s = await startServer(); await seedSmall(s.base);
const t = (await login(s.base, 'admin', ADMIN_PASSWORD)).token;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const runs = [];
for (let i = 0; i < 8; i++) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } }); const page = await ctx.newPage();
  const t0 = Date.now(); await openSignedIn(page, ctx, s.base, t);
  const ready = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
  const t1 = Date.now(); await page.evaluate(() => navigate('issuances')); await page.waitForSelector('#page-content table, #page-content .iss-card, #page-content .empty-state'); const iss = Date.now() - t1;
  const t2 = Date.now(); await page.evaluate(() => navigate('invoices')); await page.waitForSelector('#page-content table, #page-content .empty-state, #page-content .inv-card'); const inv = Date.now() - t2;
  if (i) runs.push({ ready, ...nav, iss, inv });
  await ctx.close();
}
const med = k => { const v = runs.map(r => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log(JSON.stringify({ appReadyMs: med('ready'), domContentLoadedMs: med('dcl'), loadEventMs: med('load'), issuancesMs: med('iss'), invoicesMs: med('inv') }));
await b.close(); await s.stop();

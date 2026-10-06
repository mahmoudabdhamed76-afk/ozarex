/* Load baseline with the large synthetic dataset (fixtures/large-dataset.json.gz):
   400 customers · 6,000 invoices · 6,000 issuances · 6,000 payments · 5,000 audit entries.
   Runs once, on a desktop screen (project «large-dataset»). Timings are recorded, not asserted —
   they are the "before" numbers for the performance phases. */
import { test, expect, openSignedIn, watchErrors } from './fixtures.mjs';
import { login, adminLogin, req } from '../helpers/api.mjs';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { loadLargeDataset } from '../fixtures/load.mjs';

/* ── the large synthetic dataset — desktop only, own server ── */
test.describe('large dataset', () => {
  let big;
  test.beforeAll(async () => {
    big = await startServer();
    const t = (await adminLogin(big.base)).token;
    const r = await req(big.base, 'POST', '/api/data', { token: t, body: loadLargeDataset() });
    if (r.status !== 200) throw new Error('fixture restore ' + r.status);
  });
  test.afterAll(async () => { if (big) await big.stop(); });

  test('main pages open with 6,000 invoices / issuances / payments (timings recorded)', async ({ page, context }) => {
    test.setTimeout(600_000);
    const errors = watchErrors(page);
    const t0 = Date.now();
    await openSignedIn(page, context, big.base, (await login(big.base, 'admin', ADMIN_PASSWORD)).token);
    const timings = { firstScreenMs: Date.now() - t0 };
    for (const k of ['dashboard', 'invoices', 'issuances', 'payments', 'customers', 'aging', 'reports']) {
      const tk = Date.now();
      await page.evaluate(k => navigate(k), k);
      await page.waitForFunction(k => currentPage === k, k, { timeout: 300_000 });
      await page.evaluate(() => new Promise(r => setTimeout(r, 0)));   // main thread free again = the page is usable
      timings[k + 'UsableAfterMs'] = Date.now() - tk;
      await page.waitForTimeout(400);
      /* navigate() renders on the next frame — time the page's own render function directly as well */
      timings[k + 'RenderMs'] = await page.evaluate(k => {
        const R = { dashboard: renderDashboard, invoices: renderInvoices, issuances: renderIssuances, payments: renderPayments, customers: renderCustomers, aging: window.renderAging, reports: renderReports };
        const t = performance.now(); R[k](); return Math.round(performance.now() - t);
      }, k);
    }
    timings.autosaveDiffMs = await page.evaluate(() => { const s = AXCore.snapshot(DB.data, {}); const t = performance.now(); AXCore.diff(s, DB.data, {}); return Math.round(performance.now() - t); });
    test.info().annotations.push({ type: 'timings', description: JSON.stringify(timings) });
    console.log('[large dataset timings]', JSON.stringify(timings));
    expect(await page.evaluate(() => window.__xss || 0)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('[KNOWN BUG C4] the offline copy is saved on the device even with a large dataset', async ({ page, context }) => {
    test.fail(true, 'KNOWN BUG C4: localStorage (~5 MB) is full → offline copy silently not saved');
    await openSignedIn(page, context, big.base, (await login(big.base, 'admin', ADMIN_PASSWORD)).token);
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => (localStorage.getItem('em_offline_snap') || '').length)).toBeGreaterThan(1_000_000);
  });
});


/* Load baseline with the large synthetic dataset (fixtures/large-dataset.json.gz):
   400 customers · 6,000 invoices · 6,000 issuances · 6,000 payments · 5,000 audit entries.
   Runs once, on a desktop screen (project «large-dataset»). Timings are recorded, not asserted —
   they are the "before" numbers for the performance phases. */
import { test, expect, openSignedIn, watchErrors, formLogin, offlineCopy, queuedCount, localStorageChars, reopenOffline } from './fixtures.mjs';
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

  /* C4 — fixed in Phase 3: the offline copy lives in IndexedDB (localStorage stopped at ~5 MB, silently) */
  test('C4 (fixed in Phase 3): the offline copy is saved on the device even with a large dataset', async ({ page, context }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    /* make sure the data is clearly above the browser's ~5 MB localStorage limit (since Phase 2 a restore no
       longer imports the 5,000 audit entries from the file, which had pushed the fixture over the edge) */
    const t = (await adminLogin(big.base)).token;
    const pad = Array.from({ length: 2500 }, (_, i) => ({ id: 'pad_' + i, title: 'ملاحظة ' + i, body: 'س'.repeat(800) }));
    const r = await req(big.base, 'POST', '/api/ops', { token: t, body: { opId: 'pad-notes', ops: { cols: { notes: { added: pad, removed: [], modified: [] } }, sets: {}, keys: {}, counters: null } } });
    if (r.status !== 200) throw new Error('padding ' + r.status);
    await openSignedIn(page, context, big.base, (await login(big.base, 'admin', ADMIN_PASSWORD)).token);
    await expect.poll(async () => ((await offlineCopy(page)) || {}).bytes || 0, { timeout: 60_000 }).toBeGreaterThan(5 * 1024 * 1024);
    const st = await page.evaluate(() => OfflineManager.snapshotSettled());
    expect(st.ok, st.error || '').toBe(true);
    /* the copy is complete: the same data the app holds */
    const same = await page.evaluate(async () => {
      const db = await new Promise(res => { const q = indexedDB.open('erp-offline', 1); q.onsuccess = () => res(q.result); });
      const rec = await new Promise(res => { const q = db.transaction('data_snapshot').objectStore('data_snapshot').get('snapshot'); q.onsuccess = () => res(q.result); });
      db.close();
      const d = JSON.parse(rec.json);
      return { invoices: d.invoices.length, issuances: d.issuances.length, payments: d.payments.length, notes: d.notes.length,
        live: { invoices: DB.data.invoices.length, issuances: DB.data.issuances.length, payments: DB.data.payments.length, notes: DB.data.notes.length } };
    });
    expect({ invoices: same.invoices, issuances: same.issuances, payments: same.payments, notes: same.notes }).toEqual(same.live);
    expect(same.invoices).toBeGreaterThanOrEqual(6000);
    /* nothing big left in localStorage */
    expect(await page.evaluate(() => localStorage.getItem('em_offline_snap'))).toBeNull();
    const lsChars = await localStorageChars(page);
    expect(lsChars).toBeLessThan(100_000);
    const writeMs = await page.evaluate(async () => {
      const t = performance.now(); DB.data.customers[0].notes = 'قياس ' + Date.now(); clearTimeout(DB._saveTimer); await DB._flush(); await OfflineManager.snapshotSettled(); return Math.round(performance.now() - t);
    });
    const info = { offlineCopyChars: (await offlineCopy(page)).bytes, localStorageChars: lsChars, saveWithCopyMs: writeMs };
    test.info().annotations.push({ type: 'storage', description: JSON.stringify(info) });
    console.log('[large dataset storage]', JSON.stringify(info));
    expect(errors).toEqual([]);
  });

  test('C4: with the large dataset, the device reopens offline (password asked), keeps queued changes, and sends them after reconnecting', async ({ page, context }) => {
    test.setTimeout(400_000);
    await formLogin(page, big.base, 'admin', ADMIN_PASSWORD);
    const errors = watchErrors(page, { allow: /\[Sync\] pull failed: TypeError: Failed to fetch/ });   // offline network failure is expected; from here on (the login page's own «not signed in yet» 401 is normal)
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30_000 });
    expect((await page.evaluate(() => OfflineManager.snapshotSettled())).ok).toBe(true);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const ids = ['c_big_off_1', 'c_big_off_2'];
    for (const id of ids) {
      await page.evaluate(i => { DB.data.customers.push({ id: i, name: 'أوف لاين ' + i, balance: 0, customPrices: {} }); DB.save(); }, id);
      await page.waitForTimeout(600);
    }
    await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 30_000 }).toBe(2);
    await page.evaluate(() => OfflineManager.snapshotSettled());
    const startupMs = await reopenOffline(page, 'admin', ADMIN_PASSWORD, { timeout: 180_000 });
    await expect(page.locator('#offline-banner')).toHaveClass(/show/);
    const opened = await page.evaluate(i => ({ invoices: DB.data.invoices.length, mine: i.filter(x => DB.data.customers.some(c => c.id === x)).length }), ids);
    expect(opened.invoices).toBeGreaterThanOrEqual(6000);
    expect(opened.mine).toBe(2);                                            // the offline edits are in the reopened copy
    expect(await queuedCount(page)).toBe(2);                                // …and still waiting to be sent, once each
    await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 30_000 }).toBe(2);
    test.info().annotations.push({ type: 'timings', description: JSON.stringify({ offlineReopenMs: startupMs }) });
    console.log('[large dataset offline reopen]', JSON.stringify({ offlineReopenMs: startupMs }));
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const admin = (await adminLogin(big.base)).token;
    await expect.poll(async () => { const d = (await req(big.base, 'GET', '/api/data', { token: admin })).json; return ids.filter(x => d.customers.some(c => c.id === x)).length; }, { timeout: 120_000 }).toBe(2);
    await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 60_000 }).toBe(0);
    const d = (await req(big.base, 'GET', '/api/data', { token: admin })).json;
    expect(d.customers.filter(c => ids.includes(c.id)).length).toBe(2);    // sent once each, not duplicated
    expect(errors).toEqual([]);
  });
});

/* Phase 5 · the issuances list is shown in steps when it is long: the same rows, in the same order, with the
   same mobile cards and highlighter, appear as the user scrolls — none missing, none twice. Short lists are
   rendered whole exactly as before. Own server with 420 issuances (more than two steps). */
import { test, expect, openSignedIn, watchErrors, PAGES } from './fixtures.mjs';
import { login, adminLogin, send, ops, col } from '../helpers/api.mjs';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { seedSmall } from './fixtures.mjs';

const N = 420;
/* the highlighter's state on the page: every element's tag + its marker classes / attributes, in order
   (not raw HTML: tickers and count-ups move by themselves; the 0.9-second «drawing» flag is a timer) */
const snap = page => page.evaluate(() => Array.from(document.getElementById('page-content').getElementsByTagName('*')).map(e => {
  const cls = Array.from(e.classList).filter(c => /^(ax-hl(?!-draw)|ax-mkb|hlk-)/.test(c)).sort().join('.');
  const at = ['data-mk', 'data-hlt', 'data-mkt'].map(n => e.getAttribute(n) || '').join('|');
  return cls || at !== '||' || e.tagName === 'AX-M' ? e.tagName + '.' + cls + '[' + at + ']' : e.tagName;
}).join('\n'));

/* Phase 5 · the highlighter now looks only at what changed. Proof it misses nothing: on every page, a full
   pass over the whole screen afterwards finds nothing left to do (the HTML is identical). */
test('marker: on every page, the incremental highlighter leaves exactly what a full pass would', async ({ app: page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  for (const k of Object.keys(PAGES)) {
    await page.evaluate(k => navigate(k), k);
    await page.waitForFunction(k => currentPage === k, k);
    await page.waitForTimeout(1400);                                     // count-ups finished, highlighter pass done
    const a = await snap(page);
    await page.evaluate(() => AXMarker.scan());                          // the full pass, as before Phase 5
    const b = await snap(page);
    if (b !== a) { const A = a.split('\n'), B = b.split('\n'); const i = A.findIndex((x, j) => x !== B[j]); console.log('[diff ' + k + ']', A.slice(i, i + 3), B.slice(i, i + 3)); }
    expect(b, k + ': a full pass still found something to mark').toBe(a);
  }
  expect(errors).toEqual([]);
});

test.describe('issuances list in steps', () => {
  let srv;
  test.beforeAll(async () => {
    srv = await startServer();
    await seedSmall(srv.base);
    const t = (await adminLogin(srv.base)).token;
    const added = Array.from({ length: N }, (_, k) => ({
      id: 'is_step_' + k, number: 5000 + k, customerId: k % 2 ? 'c1' : 'c2', customerName: k % 2 ? 'مركز النور' : 'مركز الشفاء',
      productId: 'p1', productName: 'ورق تجربة', quantity: 1 + (k % 7), unit: 'ورقة', unitPrice: 10, total: 10 * (1 + (k % 7)), paid: k % 3 ? 0 : 10 * (1 + (k % 7)),
      status: k % 3 ? 'unpaid' : 'paid', date: '2026-09-' + String(1 + (k % 28)).padStart(2, '0'), createdAt: 1_700_000_000_000 + k, items: [] }));
    const r = await send(srv.base, t, ops({ cols: { issuances: col({ added }) }, counters: { issuance: 5000 + N } }));
    if (r.status !== 200) throw new Error('seed ' + r.status + ' ' + JSON.stringify(r.json));
  });
  test.afterAll(async () => { if (srv) await srv.stop(); });

  const rows = page => page.evaluate(() => Array.from(document.querySelectorAll('#page-content .data-table tbody > tr')).map(tr => tr.querySelector('td b').textContent.trim()));
  async function scrollToEnd(page) {
    for (let k = 0; k < 40; k++) {
      const left = await page.evaluate(() => !!document.getElementById('iss-more'));
      if (!left) return;
      await page.evaluate(() => { const m = document.getElementById('iss-more'); if (m) m.scrollIntoView({ block: 'end' }); window.scrollTo(0, document.documentElement.scrollHeight); });
      await page.waitForTimeout(250);
    }
  }

  test('a long list starts with the first step, then every row arrives in order while scrolling — none missing or twice', async ({ page, context }) => {
    const errors = watchErrors(page);
    await openSignedIn(page, context, srv.base, (await login(srv.base, 'admin', ADMIN_PASSWORD)).token);
    await page.evaluate(() => navigate('issuances'));
    await page.waitForFunction(() => currentPage === 'issuances' && document.getElementById('iss-search') && document.querySelector('#page-content .data-table tbody tr'));
    const total = await page.evaluate(() => DB.data.issuances.length);
    expect(total).toBeGreaterThan(300);
    expect((await rows(page)).length).toBe(150);
    expect(await page.locator('#iss-more')).toHaveCount(1);
    /* the header numbers still count the whole list, not just what is on screen */
    expect(await page.locator('.stats-grid .stat-value').first().innerText()).toBe(String(total));
    await scrollToEnd(page);
    const all = await rows(page);
    const expected = await page.evaluate(() => DB.data.issuances.slice().sort((a, b) => b.createdAt - a.createdAt).map(i => '#' + i.number));
    expect(all).toEqual(expected);                                             // same order, nothing missing, nothing twice
    expect(await page.locator('#iss-more')).toHaveCount(0);
    /* every appended row got the same treatment as the first ones */
    const plain = await page.evaluate(() => Array.from(document.querySelectorAll('#page-content .data-table tbody > tr')).filter(tr => !tr.classList.contains('iss-row') || !tr.children[2].getAttribute('data-label')).length);
    expect(plain).toBe(0);
    await expect.poll(() => page.evaluate(() => { const tr = document.querySelector('#page-content .data-table tbody > tr:last-child'); return !!tr.querySelector('.ax-hl'); }), { timeout: 10_000 }).toBe(true);
    /* the appended rows were highlighted exactly as a full pass would do it */
    await page.waitForTimeout(400);
    const a = await snap(page);
    await page.evaluate(() => AXMarker.scan());
    expect(await snap(page)).toBe(a);
    expect(errors).toEqual([]);
  });

  test('a refresh keeps the rows already shown (the user keeps his place); a new filter starts from the first step', async ({ page, context }) => {
    await openSignedIn(page, context, srv.base, (await login(srv.base, 'admin', ADMIN_PASSWORD)).token);
    await page.evaluate(() => navigate('issuances'));
    await page.waitForFunction(() => currentPage === 'issuances' && document.getElementById('iss-search') && document.querySelector('#page-content .data-table tbody tr'));
    await page.evaluate(() => { document.getElementById('iss-more').scrollIntoView({ block: 'end' }); });
    await expect.poll(async () => (await rows(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(300);
    const before = (await rows(page)).length;
    await page.evaluate(() => renderIssuances());                            // what a live update from another device does
    expect((await rows(page)).length).toBe(before);
    /* a filter: customer c1 has 210 rows (≤ two steps) → all of them at once, nothing more to load */
    await page.selectOption('#iss-customer', 'c1');
    await expect.poll(async () => (await rows(page)).length).toBe(N / 2);
    expect(await page.locator('#iss-more')).toHaveCount(0);
    /* the search still finds a row that was never on screen */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.selectOption('#iss-customer', '');
    expect((await rows(page)).length).toBe(150);                               // filters changed → first step again
    await page.fill('#iss-search', '5000');
    await expect.poll(async () => (await rows(page))).toEqual(['#5000']);
  });

  test('a short list is rendered whole, as before (no steps)', async ({ page, context }) => {
    await openSignedIn(page, context, srv.base, (await login(srv.base, 'admin', ADMIN_PASSWORD)).token);
    await page.evaluate(() => { Object.assign(issuanceFilters, { search: '', customerId: '', productId: '', from: '2026-09-01', to: '2026-09-10' }); navigate('issuances'); });
    await page.waitForFunction(() => currentPage === 'issuances' && document.getElementById('iss-search') && document.querySelector('#page-content .data-table tbody tr'));
    const n = await page.evaluate(() => DB.data.issuances.filter(i => i.date >= '2026-09-01' && i.date <= '2026-09-10').length);
    expect(n).toBeLessThanOrEqual(300);
    expect((await rows(page)).length).toBe(n);
    expect(await page.locator('#iss-more')).toHaveCount(0);
    await page.evaluate(() => { issuanceFilters.from = ''; issuanceFilters.to = ''; });
  });
});

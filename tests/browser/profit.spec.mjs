/* 4.37 · «أرباحي»: the bottom bar's new tab, exact numbers from known records (revenue after discount and returns,
   cost of goods sold, expenses without purchases, net profit, margin), the comparison with the period before and the
   exact split of the change (volume + margin + expenses = Δ net), profit kept apart from cash collected, the most
   profitable products / customers, the monthly chart, the smart summary and advice built from the numbers. */
import { test, expect, watchErrors } from './fixtures.mjs';

const isDesktop = () => test.info().project.name === 'desktop';

/* a small known business: this period 1–10 Sep, the one before 21–31 Aug (11 days vs 10 — compute takes any two ranges) */
const DATA = {
  products: [{ id: 'A', name: 'ورق', cost: 6 }, { id: 'B', name: 'فيلم', cost: 40 }, { id: 'Z', name: 'من غير تكلفة', cost: 0 }],
  customers: [{ id: 'c1', name: 'مركز 1', balance: 500 }, { id: 'c2', name: 'مركز 2', balance: 0 }],
  issuances: [
    { id: 'i1', number: 1, customerId: 'c1', productId: 'A', productName: 'ورق', quantity: 100, total: 1000, date: '2026-09-02' },          // rev 1000 · cost 600
    { id: 'i0', number: 0, customerId: 'c1', productId: 'A', productName: 'ورق', quantity: 50, total: 500, date: '2026-08-25' }             // before: rev 500 · cost 300
  ],
  invoices: [
    { id: 'v1', number: 9, customerId: 'c2', date: '2026-09-05', subtotal: 500, discount: 50, tax: 45, total: 495, items: [{ productId: 'B', productName: 'فيلم', qty: 5, total: 500 }] },  // rev 450 · cost 200
    { id: 'v2', number: 8, customerId: 'c1', date: '2026-09-03', subtotal: 1000, total: 1000, sourceIssuanceId: 'i1', items: [{ productId: 'A', qty: 100, total: 1000 }] }      // from i1 — not twice
  ],
  expenses: [
    { id: 'e1', category: 'إيجار', amount: 300, date: '2026-09-01' }, { id: 'e2', kind: 'purchase', amount: 9999, date: '2026-09-04' },    // a purchase is not an expense
    { id: 'e0', category: 'إيجار', amount: 100, date: '2026-08-22' }
  ],
  payments: [{ id: 'p1', customerId: 'c1', amount: 700, date: '2026-09-06' }, { id: 'p2', customerId: 'c2', amount: -50, date: '2026-09-07' }],
  settings: { _returns: [{ id: 'r1', type: 'sale', date: '2026-09-08', customerId: 'c1', amount: 100, refund: 40, items: [{ productId: 'A', name: 'ورق', qty: 10, total: 100, net: 100 }] }] }
};

test('«أرباحي» numbers: revenue, cost, gross, expenses, net, margin; the change split exactly; profit apart from cash', async ({ app: page }) => {
  const R = await page.evaluate(d => { const r = AXProfit.compute(d, '2026-09-01', '2026-09-10', '2026-08-21', '2026-08-31'); return { cur: { ...r.cur, lines: r.cur.lines.length }, prev: { rev: r.prev.rev, cost: r.prev.cost, exp: r.prev.exp, net: r.prev.net }, drivers: r.drivers, receivables: r.receivables,
    topP: r.cur.byProduct.sort((a, b) => b.profit - a.profit).map(g => [g.name, g.profit]), topC: r.cur.byCustomer.sort((a, b) => b.profit - a.profit).map(g => [g.name, g.profit]) }; }, DATA);
  const c = R.cur;
  expect(c.rev).toBe(1000 + 450 - 100);                          // after the discount, without tax, minus the sales return
  expect(c.returns).toBe(100);
  expect(c.cost).toBe(600 + 200 - 60);
  expect(c.gross).toBe(1350 - 740);
  expect(c.exp).toBe(300);                                        // the purchase invoice is goods, not an expense
  expect(c.net).toBe(610 - 300);
  expect(Math.round(c.netMargin * 100) / 100).toBe(Math.round(310 / 1350 * 10000) / 100);
  expect(c.coll).toBe(700);                                       // money in — a bounced cheque (−50) is not a collection
  expect(c.cashIn).toBe(700 - 40);                                // minus the cash given back on the return
  expect(R.receivables).toBe(500);
  expect(R.prev).toEqual({ rev: 500, cost: 300, exp: 100, net: 100 });
  const dv = R.drivers;
  expect(Math.round((dv.volume + dv.margin + dv.expenses) * 100) / 100).toBe(310 - 100);   // exact
  expect(dv.expenses).toBe(-200);
  expect(R.topP.slice(0, 2)).toEqual([['ورق', 1000 - 600 - (100 - 60)], ['فيلم', 450 - 200]]);
  expect(R.topC[0][0]).toBe('مركز 1');
});

test('the page: tab in the bottom bar, filters, chart with a tooltip, summary, advice, rankings', async ({ app: page }) => {
  const errors = watchErrors(page);
  if (!isDesktop()) {
    const tab = page.locator('#bottom-nav .bn-item[data-page="profit"]');
    await expect(tab).toContainText('أرباحي');
    expect(await page.locator('#bottom-nav .bn-item[data-page="invoices"]').count()).toBe(0);
    await tab.click();
  } else await page.evaluate(() => navigate('profit'));
  await expect(page.locator('#topbar-title')).toHaveText('أرباحي');
  await expect(page.locator('.pfx-hero')).toBeVisible();
  await expect(page.locator('.pfx-k')).toHaveCount(6);
  for (const t of ['الإيرادات', 'تكلفة البضاعة المباعة', 'مجمل الربح', 'المصروفات', 'صافي الربح', 'هامش الربح']) await expect(page.locator('.pfx-kpis')).toContainText(t);
  await expect(page.locator('.pfx-sum p').first()).toBeVisible();
  await expect(page.locator('.pfx-cash')).toContainText('اللي اتحصّل فعلاً');
  await expect(page.locator('#pfx-chart .pfx-hit')).toHaveCount(12);
  await page.locator('#pfx-chart .pfx-hit').last().click();
  await expect(page.locator('.pfx-tip-box')).toBeVisible();
  await expect(page.locator('.pfx-tip-box')).toContainText('صافي الربح');
  await page.evaluate(() => AXProfit.period('year'));
  await expect(page.locator('.pfx-seg button.on').first()).toHaveText('السنة دي');
  await page.evaluate(() => AXProfit.period('custom'));
  await expect(page.locator('.pfx-dates input')).toHaveCount(2);
  await page.evaluate(() => AXProfit.custom('2026-01-01', '2026-12-31'));
  await expect(page.locator('.pfx-range')).toContainText('1/1/2026');
  await page.evaluate(() => AXProfit.tab('customers'));
  await expect(page.locator('.pfx-seg.sm button.on')).toHaveText('العملاء');
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => AXProfit.period('month'));
  expect(errors).toEqual([]);
});

test('advice comes from the numbers: below cost, thin margins, missing costs', async ({ app: page }) => {
  await page.evaluate(() => navigate('profit'));
  await expect(page.locator('.pfx-hero')).toBeVisible();
  const tips = await page.evaluate(() => {
    const d = { products: [{ id: 'L', name: 'خسران', cost: 12 }, { id: 'T', name: 'رفيع', cost: 9.5 }, { id: 'N', name: 'بلا تكلفة', cost: 0 }], customers: [{ id: 'c', name: 'ع' }],
      issuances: [{ id: 'a', customerId: 'c', productId: 'L', productName: 'خسران', quantity: 100, total: 1000, date: '2026-09-02' },
        { id: 'b', customerId: 'c', productId: 'T', productName: 'رفيع', quantity: 1000, total: 10500, date: '2026-09-02' },
        { id: 'n', customerId: 'c', productId: 'N', productName: 'بلا تكلفة', quantity: 1, total: 50, date: '2026-09-02' }], invoices: [], expenses: [], payments: [] };
    const saved = DB.data; DB.data = d;
    try { AXProfit.custom('2026-09-01', '2026-09-30'); AXProfit.period('custom'); return Array.from(document.querySelectorAll('.pfx-tip b:first-child')).map(b => b.textContent); }
    finally { DB.data = saved; AXProfit.period('month'); }
  });
  expect(tips.some(t => t.includes('بأقل من التكلفة'))).toBe(true);
  expect(tips.some(t => t.includes('هامشها ضعيف'))).toBe(true);
  expect(tips.some(t => t.includes('من غير سعر تكلفة'))).toBe(true);
});

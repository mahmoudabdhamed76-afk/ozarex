/* 4.38 · «أرباحي» ← «الفلوس»: the money engine on known records (cash / bank pockets, a bank transfer that is the
   same money as a collection counted once, a cash custody, daily counts against the count before + the cash flows
   between, «الربح راح فين؟» adding up exactly, «تقدر تسحب»), the tab (setup, «احسب الشهر», owner draw), the blind
   daily close from the collection page, and the receipt the expense form asks for above the limit. */
import { test, expect, watchErrors, openSignedIn, ADMIN_PASSWORD } from './fixtures.mjs';
import { login, req } from '../helpers/api.mjs';
import { randomUUID } from 'node:crypto';

test.describe.configure({ mode: 'serial' });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ACCT = { username: 'acct', password: 'Acct-Test-Pass-1' };
const setCfg = async (base, cfg) => { const t = (await login(base, 'admin', ADMIN_PASSWORD)).token; return req(base, 'POST', '/api/ops', { token: t, body: { ops: { cols: {}, sets: {}, keys: { _cashCfg: { a: cfg } }, counters: null }, opId: randomUUID(), cid: 't' } }); };

test.afterAll(async ({ server }) => { await setCfg(server.base, { on: false }); });   // leave the shared server as it was

test('the engine: pockets, no double counting, the cash box day by day, the bridge adds up exactly, how much you can take', async ({ app: page }) => {
  const R = await page.evaluate(() => {
    const d = {
      settings: {
        _cashCfg: { on: true, receipt: 500, approve: 2000, reserve: 1000, opening: { date: '2026-09-01', amount: 5000 }, since: '2026-09-01' },
        _cashCounts: [{ id: 'k1', date: '2026-09-02', total: 5600, by: { name: 'أحمد' }, at: 1 }, { id: 'k0', date: '2026-09-02', total: 1, at: 0 }, { id: 'k2', date: '2026-09-04', total: 4300, by: { name: 'أحمد' }, at: 2 }],
        _ownerDraws: [{ id: 'w', date: '2026-09-03', amount: 500, from: 'cash' }],
        _cashMoves: [{ id: 'm', date: '2026-09-03', dir: 'out', amount: 200 }],
        _custody: [{ id: 'cu', no: 1, type: 'cash', holder: 'سعيد', amount: 300, date: '2026-09-03', moves: [{ id: 'mv', kind: 'return', v: 50, date: '2026-09-04' }] }],
        _returns: [{ id: 'r', type: 'sale', number: 1, date: '2026-09-04', amount: 100, refund: 40, customerId: 'c1', items: [{ productId: 'A', name: 'ورق', qty: 10, total: 100, net: 100 }] }]
      },
      products: [{ id: 'A', name: 'ورق', cost: 6 }], customers: [{ id: 'c1', name: 'مركز', balance: 400 }],
      issuances: [{ id: 'i', customerId: 'c1', productId: 'A', productName: 'ورق', quantity: 100, total: 1000, date: '2026-09-02' }], invoices: [],
      payments: [{ id: 'p1', customerId: 'c1', amount: 800, method: 'كاش', date: '2026-09-02' }, { id: 'p2', customerId: 'c1', amount: 150, method: 'تحويل', date: '2026-09-03' }],
      bankTransfers: [{ id: 't1', customerId: 'c1', amount: 150, date: '2026-09-05' }],                                         // the same money as p2 → once
      expenses: [{ id: 'e1', category: 'نقل', amount: 200, date: '2026-09-02', createdAt: Date.parse('2026-09-02') },
        { id: 'e2', category: 'إيجار', amount: 700, date: '2026-09-03', paymentMethod: 'transfer', createdAt: Date.parse('2026-09-03'), attachment: { data: 'x' } },
        { id: 'e3', category: 'بنزين', amount: 120, date: '2026-09-04', custodyId: 'cu', createdAt: Date.parse('2026-09-04') },          // from the custody, not the box
        { id: 'pu', kind: 'purchase', supplierId: 's', amount: 900, date: '2026-09-02' }],
      supplierPayments: [{ id: 's1', supplierId: 's', amount: 400, method: 'cash', date: '2026-09-03' }]
    };
    const P = AXProfit.compute(d, '2026-09-01', '2026-09-30').cur;
    const r = AXCash.report(d, '2026-09-01', '2026-09-30', { today: '2026-09-05', profit: { rev: P.rev, cost: P.cost, exp: P.exp, net: P.net }, dueSoon: 100 });
    return { P: { rev: P.rev, cost: P.cost, exp: P.exp, net: P.net }, totals: r.totals, money: r.money, counts: r.cash.counts.map(c => [c.date, c.total, c.expected, c.diff]),
      now: r.cash.now, short: r.cash.shortage, bridge: r.bridge, draw: r.draw, alerts: r.alerts.map(a => a.k), kinds: Object.keys(r.byKind).sort() };
  });
  expect(R.P).toEqual({ rev: 900, cost: 540, exp: 1020, net: -660 });
  /* cash in 800 + custody return 50 · cash out 200 + 400 + 500 + 200 + 300 + 40 · bank in 150 · bank out 700 */
  expect(R.totals).toEqual({ cashIn: 850, cashOut: 1640, bankIn: 150, bankOut: 700 });
  expect(R.money).toBe(850 - 1640 + 150 - 700);
  expect(R.kinds).not.toContain('banktr');                                       // the logged bank transfer was p2
  /* day 2 (the later count of the day stands): 5000 + 800 − 200 = 5600 ✓ · day 4: 5600 − 400 − 500 − 200 − 300 + 50 − 40 = 4210, counted 4300 */
  expect(R.counts).toEqual([['2026-09-02', 5600, 5600, 0], ['2026-09-04', 4300, 4210, 90]]);
  expect(R.now).toBe(4300);
  expect(R.short).toBe(0);
  expect(Math.abs(R.bridge.check)).toBeLessThan(0.01);                          // the lines add up to the money that moved
  expect(R.bridge.total).toBe(R.money);
  const L = Object.fromEntries(R.bridge.lines.map(l => [l.k, l.v]));
  expect(L.unpaid).toBe(-(1000 - 100 - 950 + 40));                                // sold 900 net, collected 950 − 40 back
  expect(L.payable).toBe(900 - 400);
  expect(L.stock).toBe(-(900 - 540));
  expect(L.custody).toBe(-(250 - 120));                                          // 300 out − 50 back − 120 spent and booked
  expect(L.draw).toBe(-500);
  expect(L.branch).toBe(-200);
  expect(R.draw).toMatchObject({ cash: 4300, reserve: 1000, due: 100, cashAvail: 3200, profitLeft: -1160, amount: 0, limit: 'loss' });
  expect(R.alerts).toEqual(expect.arrayContaining(['excess', 'loss', 'overdraw']));
});

test('the tab: the admin switches the rules on with the cash in hand, «احسب الشهر», records what he took', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  await setCfg(server.base, { on: false });
  await page.evaluate(() => { DB.data.settings._cashCfg = { on: false }; navigate('profit'); AXProfit.view('cash'); });
  await expect(page.locator('.pfx-views button.on')).toHaveText('الفلوس');
  await expect(page.locator('.fx-setup')).toBeVisible();
  await page.fill('#fx-open', '12500');
  await page.locator('.fx-setup .fx-run').click();
  await expect(page.locator('.fx-setup')).toHaveCount(0);
  expect(await page.evaluate(() => DB.data.settings._cashCfg)).toMatchObject({ on: true, receipt: 500, approve: 2000, reserve: 15000, opening: { amount: 12500 } });
  await page.locator('#fx-run').click();
  await expect(page.locator('#fx-rep .fx-hero')).toBeVisible({ timeout: 5000 });
  for (const t of ['تقدر تسحب', 'دخل منين', 'خرج فين', 'الربح راح فين؟', 'تقفيلات اليومية', 'تحليل ذكي']) await expect(page.locator('#fx-rep')).toContainText(t);
  await expect(page.locator('.fx-bridge')).toContainText('الحساب مقفول');
  await page.evaluate(() => AXFulus.draw(0));
  await page.fill('#fx-dr', '1500');
  await page.locator('.modal-footer .btn-primary').click();
  await expect.poll(() => page.evaluate(() => (DB.data.settings._ownerDraws || []).reduce((s, w) => s + w.amount, 0))).toBeGreaterThanOrEqual(1500);
  await expect(page.locator('#fx-rep')).toContainText('1,500');
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('the daily close is blind for the person counting; the expense form asks for the receipt above the limit', async ({ page, context, server }) => {
  const errors = watchErrors(page);
  expect((await setCfg(server.base, { on: true, receipt: 500, approve: 2000, reserve: 15000, opening: { date: '2026-01-01', amount: 0 }, since: '2026-01-01' })).status).toBe(200);
  await openSignedIn(page, context, server.base, (await login(server.base, ACCT.username, ACCT.password)).token);
  await page.evaluate(() => navigate('payments'));
  await page.locator('.fx-close-btn').click();
  await expect(page.locator('.fx-cnt')).toBeVisible();
  await expect(page.locator('.fx-cnt')).not.toContainText('المفروض في');            // never the expected amount
  expect(await page.locator('.fx-cnt').innerText()).not.toMatch(/[1-9][\d,]*\.\d\d/);  // no amount on it before counting (the total shows 0.00)
  await expect(page.locator('.fx-cnt')).toContainText('مش هتشوف المفروض');
  await page.fill('.fx-dn[data-v="200"]', '10');
  await page.fill('.fx-dn[data-v="5"]', '3');
  await expect(page.locator('#fx-total')).toContainText('2,015');
  await page.locator('#fx-cbtn').click();
  await expect.poll(() => page.evaluate(() => (DB.data.settings._cashCounts || []).some(c => c.total === 2015 && c.by && c.by.name))).toBe(true);
  /* the receipt: required above 500 (the form stops before anything is saved) */
  await page.evaluate(() => navigate('expenses'));
  const n0 = await page.evaluate(() => DB.data.expenses.length);
  await page.evaluate(() => openExpenseForm());
  await page.fill('#exp-amount', '800');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#exp-form')).toBeVisible();                           // not saved: no receipt
  expect(await page.evaluate(() => DB.data.expenses.length)).toBe(n0);
  await page.setInputFiles('#exp-rcpt-in', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#exp-rcpt-l')).toContainText('✓');
  expect(await page.evaluate(() => !!(window._expAtt && /^data:image\/jpeg/.test(window._expAtt.data)))).toBe(true);
  /* with the receipt but above the approval limit (and today is closed): it goes to the admin, nothing is spent yet */
  await page.fill('#exp-amount', '2500');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#apr-ask')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#apr-ask')).toContainText('مصروف');
  expect(await page.evaluate(() => DB.data.expenses.length)).toBe(n0);
  expect(errors).toEqual([]);
});

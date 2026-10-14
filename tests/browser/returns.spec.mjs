/* 4.35 · Multi-branch — Phase 5 (the screens): «↩ مرتجع» on a sale (issuance / invoice) and on a purchase invoice,
   never more than what is left to return, stock / balance / supplier balance move, the original document stays
   as it was, the «المرتجعات» list and the numbers (home, profit, purchases) take it into account. */
import { test, expect, watchErrors, openSignedIn, SALES } from './fixtures.mjs';
import { login } from '../helpers/api.mjs';

test.describe.configure({ mode: 'serial' });

const today = page => page.evaluate(() => todayStr());

test('a sales return from a sale: only what is left, stock back, balance down, the sale itself unchanged', async ({ app: page }, info) => {
  const errors = watchErrors(page);
  const tag = info.project.name;
  const ids = await page.evaluate(tag => {
    const c = { id: 'c_rt_' + tag, name: 'مركز مرتجع ' + tag, phone: '', balance: 1000, customPrices: {} };
    const p = { id: 'p_rt_' + tag, name: 'ورق مرتجع ' + tag, unit: 'رزمة', quantity: 40, minQuantity: 0, cost: 60, price: 100 };
    DB.data.customers.push(c); DB.data.products.push(p);
    DB.data.issuances.push({ id: 'is_rt_' + tag, number: tag === 'desktop' ? 8801 : 8802, customerId: c.id, customerName: c.name, productId: p.id, productName: p.name, productUnit: 'رزمة', quantity: 10, unitPrice: 100, total: 1000, paid: 0, date: todayStr(), createdAt: Date.now(), items: [] });
    DB.save();
    return { c: c.id, p: p.id, i: 'is_rt_' + tag };
  }, tag);
  const sales0 = await page.evaluate(() => AXBStats.summary(DB.data, AXBStats.range('month')).sales);

  await page.evaluate(() => navigate('sales'));
  await expect(page.locator('#page-content .axr-page-btn')).toBeVisible();
  await page.evaluate(id => viewIssuance(id), ids.i);
  await page.locator('#modal .axr-btn').click();
  await expect(page.locator('#modal .axr-form')).toBeVisible();
  const q = page.locator('#modal .axr-q').first();
  await q.fill('12');                                                         // more than was sold
  await expect(page.locator('#axr-save')).toBeDisabled();
  await q.fill('4');
  await expect(page.locator('#axr-val')).toContainText('400');
  await expect(page.locator('#axr-refund')).toHaveValue('0');               // the debt (1000) absorbs it — nothing in cash
  await page.locator('#axr-save').click();
  await expect(page.locator('#modal .axr-view')).toBeVisible();
  await expect(page.locator('#modal')).toContainText('مرتجع مبيعات #');

  const after = await page.evaluate(ids => ({
    bal: DB.data.customers.find(c => c.id === ids.c).balance, q: DB.data.products.find(p => p.id === ids.p).quantity,
    iss: DB.data.issuances.find(i => i.id === ids.i), mv: DB.data.stockMoves.filter(m => m.kind === 'return' && m.productId === ids.p).length,
    sales: AXBStats.summary(DB.data, AXBStats.range('month')).sales, profit: AXProfit.lines().filter(l => l.pid === ids.p).reduce((s, l) => s + l.rev, 0)
  }), ids);
  expect(after.bal).toBe(600);
  expect(after.q).toBe(44);
  expect(after.iss.total).toBe(1000); expect(after.iss.quantity).toBe(10);
  expect(after.mv).toBe(1);
  expect(after.sales).toBe(sales0 - 400);
  expect(after.profit).toBe(600);

  /* again: only 6 are left */
  await page.evaluate(() => closeModal());
  await page.evaluate(id => viewIssuance(id), ids.i);
  await expect(page.locator('#modal .axr-note')).toContainText('اترجع منها');
  await page.locator('#modal .axr-btn').click();
  await expect(page.locator('#modal .axr-line').first()).toContainText('6');
  await page.locator('#modal .axr-allbtn').click();
  await expect(page.locator('#modal .axr-q').first()).toHaveValue('6');
  await page.locator('#axr-refund').fill('100');                            // 100 back in cash
  await page.locator('#axr-save').click();
  await expect(page.locator('#modal .axr-view')).toBeVisible();
  expect(await page.evaluate(id => DB.data.customers.find(c => c.id === id).balance, ids.c)).toBe(600 - 500);

  /* fully returned → the button says so instead of opening */
  await page.evaluate(() => closeModal());
  await page.evaluate(id => viewIssuance(id), ids.i);
  await page.locator('#modal .axr-btn').click();
  await expect(page.locator('#modal .axr-form')).toHaveCount(0);

  /* the list */
  await page.evaluate(() => { closeModal(); AXRet.list('sale'); });
  await expect(page.locator('#modal .axr-row').filter({ hasText: 'مركز مرتجع ' + tag })).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('a purchase return: payables down, stock out when it came from a purchase order, the invoice itself unchanged', async ({ app: page }, info) => {
  const errors = watchErrors(page);
  const tag = info.project.name;
  const ids = await page.evaluate(tag => {
    const s = { id: 's_rt_' + tag, name: 'مورد مرتجع ' + tag, openingBalance: 0 };
    const p = { id: 'pp_rt_' + tag, name: 'حبر ' + tag, unit: 'علبة', quantity: 30, minQuantity: 0, cost: 50, price: 80 };
    DB.data.suppliers.push(s); DB.data.products.push(p);
    DB.data.expenses.push({ id: 'pur_rt_' + tag, kind: 'purchase', supplierId: s.id, supplierName: s.name, number: tag === 'desktop' ? 8901 : 8902, date: todayStr(), description: 'حبر', amount: 1000, paymentMethod: 'credit', poId: 'po_x',
      items: [{ name: p.name, unit: 'علبة', qty: 20, price: 50, total: 1000, productId: p.id }], createdAt: Date.now() });
    DB.save();
    return { s: s.id, p: p.id, pur: 'pur_rt_' + tag };
  }, tag);
  await page.evaluate(() => navigate('purchases'));
  await expect(page.locator('#page-content .axr-page-btn')).toBeVisible();
  await page.evaluate(id => AXPur.view(id), ids.pur);
  await page.locator('#modal .axr-btn').click();
  await expect(page.locator('#axr-stock')).toBeChecked();
  await page.locator('#modal .axr-q').first().fill('5');
  await expect(page.locator('#axr-val')).toContainText('250');
  await page.locator('#axr-save').click();
  await expect(page.locator('#modal .axr-view')).toBeVisible();
  const r = await page.evaluate(ids => ({
    bal: supplierMetrics(ids.s).balance, q: DB.data.products.find(p => p.id === ids.p).quantity, amt: DB.data.expenses.find(e => e.id === ids.pur).amount,
    row: AXPur.rows().find(x => x.p.id === ids.pur)
  }), ids);
  expect(r.bal).toBe(750);
  expect(r.q).toBe(25);
  expect(r.amt).toBe(1000);
  expect(r.row.amt).toBe(750); expect(r.row.ret).toBe(250);
  await page.evaluate(() => closeModal());
  await page.evaluate(id => AXPur.view(id), ids.pur);
  await expect(page.locator('#modal .axr-note')).toContainText('اترجع منها');
  expect(await today(page)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('a sales user (صرف الورق only) gets «↩ مرتجع» on a sale, never purchase returns', async ({ page, context, server }) => {
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, (await login(server.base, SALES.username, SALES.password)).token);
  expect(await page.evaluate(() => ({ sale: AXRet.canSale(), pur: AXRet.canPurchase() }))).toEqual({ sale: true, pur: false });
  expect(await page.evaluate(() => (DB.data.settings._returns || []).every(r => r.type === 'sale'))).toBe(true);
  await page.evaluate(() => viewIssuance('is_xss'));
  await expect(page.locator('#modal .axr-btn')).toBeVisible();
  expect(errors).toEqual([]);
});

/* 5.04 · «لما باجي أعدل الكمية في المخزن مش بترضى تتغير»: in «تعديل منتج» the «الكمية الحالية» can be typed — a
   stock at −3000 is set to the real count, and the difference is recorded as a «تسوية جرد» stock move (in or out),
   so the movement history still adds up; a negative count is refused; leaving it as it is records nothing. */
import { test, expect, watchErrors } from './fixtures.mjs';
import { adminLogin, send, ops, col, data } from '../helpers/api.mjs';

test('a stock at −3000 is corrected from «تعديل منتج»; the difference is a «تسوية جرد» move', async ({ app: page, server }) => {
  const admin = (await adminLogin(server.base)).token;
  expect((await send(server.base, admin, ops({ cols: { products: col({ added: [
    { id: 'p_neg', name: 'A4 - Photo (200g) - Vivid', type: 'ورق', unit: 'ورقة', quantity: -3000, minQuantity: 0, cost: 1.62, price: 2.5 }] }) } }))).status).toBe(200);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && (DB.data.products || []).some(p => p.id === 'p_neg'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await page.evaluate(() => { navigate('inventory'); openProductForm('p_neg'); });
  const q = page.locator('#pf-qty');
  await expect(q).toBeEditable();
  await expect(page.locator('#pf-qty-hint')).toContainText('بالسالب');

  await q.fill('-5');
  await expect(page.locator('#pf-qty-hint')).toContainText('ماينفعش');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('.toast').last()).toContainText('بالسالب');
  expect(await page.evaluate(() => DB.data.products.find(p => p.id === 'p_neg').quantity)).toBe(-3000);

  await q.fill('500');
  await expect(page.locator('#pf-qty-hint')).toContainText('وارد +3,500');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await expect.poll(async () => (await data(server.base, admin)).products.find(p => p.id === 'p_neg').quantity, { timeout: 15000 }).toBe(500);
  let d = await data(server.base, admin);
  let mv = d.stockMoves.filter(m => m.productId === 'p_neg');
  expect(mv.map(m => [m.type, m.kind, m.quantity, m.reference])).toEqual([['in', 'adjust', 3500, 'تسوية جرد']]);
  expect(mv[0].note).toContain('من -3000 لـ 500');

  /* lower it: an «out» adjustment; the other fields still save; unchanged quantity records nothing */
  await page.evaluate(() => openProductForm('p_neg'));
  await q.fill('420');
  await page.fill('#prod-form [name="minQuantity"]', '50');
  await page.locator('.modal-footer .btn-primary').click();
  await expect.poll(async () => (await data(server.base, admin)).products.find(p => p.id === 'p_neg').quantity, { timeout: 15000 }).toBe(420);
  await page.evaluate(() => openProductForm('p_neg'));
  await page.fill('#prod-form [name="price"]', '2.75');
  await page.locator('.modal-footer .btn-primary').click();
  await expect.poll(async () => (await data(server.base, admin)).products.find(p => p.id === 'p_neg').price, { timeout: 15000 }).toBe(2.75);
  d = await data(server.base, admin);
  const p = d.products.find(x => x.id === 'p_neg');
  expect([p.quantity, p.minQuantity]).toEqual([420, 50]);
  mv = d.stockMoves.filter(m => m.productId === 'p_neg');
  expect(mv.map(m => [m.type, m.quantity])).toEqual([['in', 3500], ['out', 80]]);
  expect(errors).toEqual([]);
});

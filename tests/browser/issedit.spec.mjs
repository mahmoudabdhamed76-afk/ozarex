/* 5.03 · «اتسجل نوع ورق غلط في التوريد»: from «صرف الورق ← ✏️» the paper type is changed — the quantity goes back
   to the old item and out of the new one, the line's stock move follows, the center's balance and the linked invoice
   (also one with two paper types: only that line, totals by the difference) follow; the center's own price for the new
   item is offered; an invoice made from a supply shows «نوع الورق غلط؟» that opens that supply line; and a sales user
   (not only the admin / accountant) has the ✏️ — his change goes to «طلبات الموافقة» when his rule says so. */
import { test, expect, watchErrors, openSignedIn, CLERK } from './fixtures.mjs';
import { adminLogin, login, send, ops, col, data } from '../helpers/api.mjs';

test.describe.configure({ mode: 'serial' });

const T = '2026-11-18';
async function seedSale(server, k) {
  const admin = (await adminLogin(server.base)).token;
  const n = 7000 + k, c = 'c_ie' + k, A = 'p_ieA' + k, B = 'p_ieB' + k, C = 'p_ieC' + k, inv = 'inv_ie' + k;
  const r = await send(server.base, admin, ops({ cols: {
    customers: col({ added: [{ id: c, name: 'مركز الشفا ' + k, balance: 1100, customPrices: { [B]: 110 } }] }),
    products: col({ added: [
      { id: A, name: 'ورق 8×10 ' + k, unit: 'علبة', quantity: 45, minQuantity: 0, cost: 60, price: 100 },
      { id: B, name: 'ورق 10×12 ' + k, unit: 'علبة', quantity: 40, minQuantity: 0, cost: 70, price: 120 },
      { id: C, name: 'فيلم 14×17 ' + k, unit: 'علبة', quantity: 30, minQuantity: 0, cost: 80, price: 150 }] }),
    invoices: col({ added: [{ id: inv, number: 9000 + k, customerId: c, date: T, fromIssuance: true, paid: 0, status: 'unpaid', subtotal: 800, tax: 0, taxRate: 0, discount: 0, total: 800, paymentMethod: 'آجل', createdAt: Date.now(),
      items: [{ productId: A, productName: 'ورق 8×10 ' + k, qty: 5, price: 100, total: 500 }, { productId: C, productName: 'فيلم 14×17 ' + k, qty: 2, price: 150, total: 300 }] }] }),
    issuances: col({ added: [
      { id: 'is_ie' + k + 'a', number: n, invoiceId: inv, batchIndex: 0, date: T, customerId: c, customerName: 'مركز الشفا ' + k, productId: A, productName: 'ورق 8×10 ' + k, productUnit: 'علبة', quantity: 5, unitPrice: 100, total: 500, paid: 0, status: 'unpaid', createdAt: Date.now() },
      { id: 'is_ie' + k + 'b', number: n, invoiceId: inv, batchIndex: 1, date: T, customerId: c, customerName: 'مركز الشفا ' + k, productId: C, productName: 'فيلم 14×17 ' + k, productUnit: 'علبة', quantity: 2, unitPrice: 150, total: 300, paid: 0, status: 'unpaid', createdAt: Date.now() }] }),
    stockMoves: col({ added: [
      { id: 'sm_ie' + k + 'a', productId: A, type: 'out', quantity: 5, date: T, reference: 'صرف #' + n + ' - مركز الشفا ' + k + ' (فاتورة #' + (9000 + k) + ')', createdAt: Date.now() },
      { id: 'sm_ie' + k + 'b', productId: C, type: 'out', quantity: 2, date: T, reference: 'صرف #' + n + ' - مركز الشفا ' + k + ' (فاتورة #' + (9000 + k) + ')', createdAt: Date.now() }] })
  } }));
  expect(r.status).toBe(200);
  return { admin, n, c, A, B, C, inv };
}
const give = async (page, reason) => {
  await expect(page.locator('#audit-reason-input')).toBeVisible();
  await page.fill('#audit-reason-input', reason);
  await page.locator('.modal-footer .btn-primary').click();
};

test('the admin changes a supply line from «8×10» to «10×12»: stock, stock move, center balance and the two-paper invoice all follow', async ({ app: page, server }) => {
  const S = await seedSale(server, 1);
  const errors = watchErrors(page);
  await page.evaluate(() => DB.pull ? DB.pull() : null).catch(() => {});
  await page.reload(); await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data && (DB.data.issuances || []).some(i => i.id === 'is_ie1a'), null, { timeout: 20000 });
  await page.evaluate(() => navigate('issuances'));
  await page.evaluate(() => editIssuance('is_ie1a'));
  await expect(page.locator('.audit-reason-chip', { hasText: 'تصحيح نوع الورق' })).toBeVisible();
  await give(page, 'تصحيح نوع الورق');
  await expect(page.locator('#ei2-product')).toBeVisible();
  await expect(page.locator('#edit-issuance-form')).toContainText('تقدر تغيّر نوع الورق');
  await page.selectOption('#ei2-product', S.B);
  await expect(page.locator('#ei2-price')).toHaveValue('110');                        // the center's own price for 10×12
  await expect(page.locator('#ei2-stock')).toHaveValue(/40/);
  await expect(page.locator('#ei2-prod-note')).toContainText('هترجع');
  await expect(page.locator('#ei2-total-display')).toContainText('550');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);

  await expect.poll(async () => {
    const d = await data(server.base, S.admin);
    const i = d.issuances.find(x => x.id === 'is_ie1a');
    return i && i.productId;
  }, { timeout: 15000 }).toBe(S.B);
  const d = await data(server.base, S.admin);
  const P = id => d.products.find(x => x.id === id);
  const i = d.issuances.find(x => x.id === 'is_ie1a');
  expect([i.productName, i.quantity, i.unitPrice, i.total]).toEqual(['ورق 10×12 1', 5, 110, 550]);
  expect(P(S.A).quantity).toBe(50);                                                     // 45 + 5 back
  expect(P(S.B).quantity).toBe(35);                                                     // 40 − 5
  expect(P(S.C).quantity).toBe(30);                                                     // the other line is untouched
  expect(d.customers.find(x => x.id === S.c).balance).toBe(1150);                      // 1100 − 500 + 550
  const inv = d.invoices.find(x => x.id === S.inv);
  expect(inv.items.map(x => [x.productId, x.qty, x.price, x.total])).toEqual([[S.B, 5, 110, 550], [S.C, 2, 150, 300]]);
  expect([inv.subtotal, inv.total]).toEqual([850, 850]);
  const mv = d.stockMoves.filter(m => m.id.startsWith('sm_ie1'));
  expect(mv.find(m => m.id === 'sm_ie1a').productId).toBe(S.B);
  expect(mv.find(m => m.id === 'sm_ie1b').productId).toBe(S.C);
  expect(errors).toEqual([]);
});

test('the invoice made from that supply shows «نوع الورق غلط؟» and opens the supply line', async ({ app: page, server }) => {
  await seedSale(server, 2);
  await page.reload(); await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data && (DB.data.invoices || []).some(i => i.id === 'inv_ie2'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await page.evaluate(() => { navigate('invoices'); viewInvoice('inv_ie2'); });
  const box = page.locator('.inv-fixpaper');
  await expect(box).toContainText('نوع الورق غلط؟');
  await expect(box.locator('button')).toHaveCount(2);
  await box.locator('button', { hasText: 'فيلم 14×17 2' }).click();
  await expect(page.locator('#audit-reason-input')).toBeVisible();                      // → editIssuance of that line
  await give(page, 'تصحيح نوع الورق');
  await expect(page.locator('#ei2-product')).toHaveValue('p_ieC2');
  await page.evaluate(() => closeModal());
  expect(errors).toEqual([]);
});

test('a sales user has ✏️ on «صرف الورق»; his change of paper type goes to «طلبات الموافقة», data unchanged', async ({ page, context, server }) => {
  const S = await seedSale(server, 3);
  const tok = (await login(server.base, CLERK.username, CLERK.password)).token;
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, tok);
  await page.evaluate(() => navigate('issuances'));
  await expect(page.locator('button[onclick="editIssuance(\'is_ie3a\')"]')).toHaveCount(1);
  await page.evaluate(() => editIssuance('is_ie3a'));
  await give(page, 'تصحيح نوع الورق');
  await page.selectOption('#ei2-product', S.B);
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#apr-ask')).toBeVisible();                                 // «محتاجة موافقة المدير»
  await page.fill('#apr-reason', 'اتسجل 8×10 والمفروض 10×12');
  await page.locator('.modal-footer .btn-primary').click();
  await expect.poll(async () => { const d = await data(server.base, S.admin); return ((d.settings || {})._approvals || []).filter(a => a.status === 'pending' && JSON.stringify(a).includes('is_ie3a')).length; }, { timeout: 15000 }).toBe(1);
  const d = await data(server.base, S.admin);
  expect(d.issuances.find(x => x.id === 'is_ie3a').productId).toBe(S.A);               // waits for the admin
  expect(d.products.find(x => x.id === S.A).quantity).toBe(45);
  expect(errors).toEqual([]);

  /* the admin approves → the change lands exactly as if the admin made it */
  const adm = await context.newPage();
  const admErrors = watchErrors(adm);
  await adm.goto(server.base + '/');
  const { token } = await adminLogin(server.base);
  await context.clearCookies();
  await openSignedIn(adm, context, server.base, token);
  await adm.evaluate(() => navigate('approvals'));
  const id = await adm.evaluate(() => ((DB.data.settings || {})._approvals || []).find(a => a.status === 'pending' && JSON.stringify(a).includes('is_ie3a')).id);
  await adm.evaluate(i => AXApprovals.approve(i), id);
  await expect.poll(async () => { const x = await data(server.base, S.admin); return x.issuances.find(i => i.id === 'is_ie3a').productId; }, { timeout: 15000 }).toBe(S.B);
  const x = await data(server.base, S.admin);
  const P = pid => x.products.find(p => p.id === pid).quantity;
  expect([P(S.A), P(S.B), P(S.C)]).toEqual([50, 35, 30]);
  expect(x.customers.find(c => c.id === S.c).balance).toBe(1150);
  expect(x.invoices.find(v => v.id === S.inv).items[0].productId).toBe(S.B);
  expect(admErrors).toEqual([]);
});

/* 5.05 · «ملف المركز»: «عاوزة أعرف تفاصيل مركز — وردنا إيه — زي بروفايل لكل مركز».
   Opens from the search at the top (any center) and from «العملاء والمراكز»; shows the balance and credit limit,
   what we supplied per paper type, the last 6 months, the latest moves; «التوريدات» has one card per sale (two
   paper types = one card) with its status, filters, search, and ✏️ per line — a change made from there shows in the
   file at once; «التحصيلات», «البيانات» (special prices); the phone back button closes it. */
import { test, expect, watchErrors } from './fixtures.mjs';
import { adminLogin, send, ops, col, data } from '../helpers/api.mjs';

const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

async function seed(server) {
  const admin = (await adminLogin(server.base)).token;
  if ((await data(server.base, admin)).customers.some(c => c.id === 'c_nk')) return;    // one server per project: seed once
  const r = await send(server.base, admin, ops({ cols: {
    customers: col({ added: [{ id: 'c_nk', name: 'مركز النخبة بحر', company: 'النخبة للأشعة', phone: '01012345678', address: 'طنطا — شارع البحر', balance: 2750, creditLimit: 5000, customPrices: { p_gb: 95 }, createdAt: Date.now() - 90 * 864e5 }] }),
    products: col({ added: [
      { id: 'p_gb', name: 'Green Tec - Blue', unit: 'علبة', quantity: 80, minQuantity: 0, cost: 60, price: 100 },
      { id: 'p_gr', name: 'Green Tec - Red', unit: 'علبة', quantity: 80, minQuantity: 0, cost: 60, price: 100 },
      { id: 'p_gy', name: 'Green Tec - Yellow', unit: 'علبة', quantity: 80, minQuantity: 0, cost: 60, price: 100 }] }),
    issuances: col({ added: [
      { id: 'is_nk1', number: 1062, date: d(3), customerId: 'c_nk', customerName: 'مركز النخبة بحر', productId: 'p_gb', productName: 'Green Tec - Blue', productUnit: 'علبة', quantity: 10, unitPrice: 95, total: 950, paid: 0, status: 'unpaid', batchIndex: 0, createdAt: Date.now() - 3 * 864e5 },
      { id: 'is_nk2', number: 1062, date: d(3), customerId: 'c_nk', customerName: 'مركز النخبة بحر', productId: 'p_gr', productName: 'Green Tec - Red', productUnit: 'علبة', quantity: 8, unitPrice: 100, total: 800, paid: 0, status: 'unpaid', batchIndex: 1, createdAt: Date.now() - 3 * 864e5 },
      { id: 'is_nk3', number: 1062, date: d(3), customerId: 'c_nk', customerName: 'مركز النخبة بحر', productId: 'p_gy', productName: 'Green Tec - Yellow', productUnit: 'علبة', quantity: 10, unitPrice: 100, total: 1000, paid: 0, status: 'unpaid', batchIndex: 2, createdAt: Date.now() - 3 * 864e5 },
      { id: 'is_nk4', number: 1061, date: d(40), customerId: 'c_nk', customerName: 'مركز النخبة بحر', productId: 'p_gb', productName: 'Green Tec - Blue', productUnit: 'علبة', quantity: 20, unitPrice: 95, total: 1900, paid: 1900, status: 'paid', createdAt: Date.now() - 40 * 864e5 }] }),
    payments: col({ added: [{ id: 'pay_nk1', customerId: 'c_nk', customerName: 'مركز النخبة بحر', amount: 1900, date: d(35), method: 'cash', note: 'فاتورة 1061', createdAt: Date.now() - 35 * 864e5 }] })
  } }));
  expect(r.status).toBe(200);
}

test('«ملف المركز» from the search: balance, what we supplied, sales cards, edit from inside, payments, data; back closes', async ({ app: page, server }, info) => {
  await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && (DB.data.customers || []).some(c => c.id === 'c_nk'), null, { timeout: 20000 });
  const errors = watchErrors(page);

  /* from the search at the top */
  if (info.project.name === 'iphone') await page.evaluate(() => AXM.search(true));       // the phone opens its search screen first
  await page.locator('#global-search').fill('النخبة');
  const hit = page.locator('#search-results .search-result-item', { hasText: 'مركز النخبة بحر' }).first();
  await expect(hit).toContainText('ملف المركز');
  await hit.click();
  const f = page.locator('#axcf');
  await expect(f).toHaveClass(/show/);
  await expect(f.locator('.axcf-nm h2')).toHaveText('مركز النخبة بحر');
  await expect(f.locator('.axcf-nm p')).toContainText('النخبة للأشعة');
  await expect(f.locator('.axcf-bal b')).toContainText('2,750');
  await expect(f.locator('.axcf-lim small')).toContainText('55%');
  await expect(f.locator('.axcf-kpi').first()).toContainText('4,650');                 // 950 + 800 + 1000 + 1900
  await expect(f.locator('.axcf-kpi').nth(1)).toContainText('1,900');
  await expect(f.locator('.axcf-kpi', { hasText: 'طلبات مش متسددة' })).toContainText('1');
  const pp = f.locator('.axcf-pp');
  await expect(pp).toHaveCount(3);
  await expect(pp.first()).toContainText('Green Tec - Blue');                          // biggest first: 30 boxes, 2,850
  await expect(pp.first()).toContainText('30 علبة · 2 مرة');
  await expect(pp.first()).toContainText('سعره الخاص 95');
  await expect(f.locator('.axcf-col')).toHaveCount(6);
  await expect(f.locator('.axcf-tl li').first()).toContainText('توريد #1062');
  if (info.project.name === 'iphone') await page.screenshot({ path: test.info().outputPath('cf-over-mob.png') });

  /* «التوريدات»: one card per sale */
  await f.locator('.axcf-tabs [data-t="sales"]').click();
  const cards = f.locator('.axcf-sale');
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator('li')).toHaveCount(3);
  await expect(cards.first()).toContainText('مش متسدد');
  await expect(cards.nth(1)).toContainText('مسدد');
  await f.locator('.axcf-seg [data-f="open"]').click();
  await expect(cards).toHaveCount(1);
  await f.locator('.axcf-seg [data-f="all"]').click();
  await f.locator('#axcf-q').fill('yellow');
  await expect(cards).toHaveCount(1);
  await f.locator('#axcf-q').fill('');
  await expect(cards).toHaveCount(2);

  /* ✏️ from inside the file → the paper type changes → the file shows it once the window closes */
  await cards.first().locator('[data-a="ei"][data-id="is_nk3"]').click();
  await expect(page.locator('#audit-reason-input')).toBeVisible();
  await page.fill('#audit-reason-input', 'تصحيح نوع الورق');
  await page.locator('.modal-footer .btn-primary').click();
  await page.selectOption('#ei2-product', 'p_gr');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await expect(cards.first().locator('li', { hasText: 'Green Tec - Yellow' })).toHaveCount(0);
  await expect(cards.first().locator('li', { hasText: 'Green Tec - Red' })).toHaveCount(2);
  await expect(f).toHaveClass(/show/);                                                  // still in the file

  /* «التحصيلات» and «البيانات» */
  await f.locator('.axcf-tabs [data-t="pays"]').click();
  await expect(f.locator('.axcf-row')).toHaveCount(1);
  await expect(f.locator('.axcf-row')).toContainText('1,900');
  await f.locator('.axcf-tabs [data-t="info"]').click();
  await expect(f.locator('.axcf-kv', { hasText: 'التليفون' })).toContainText('01012345678');
  await expect(f.locator('.axcf-card', { hasText: 'أسعاره الخاصة' })).toContainText('Green Tec - Blue');
  await f.locator('.axcf-wide').click();                                                 // ✏️ تعديل بيانات المركز
  await expect(page.locator('#modal-overlay')).toHaveClass(/show/);
  await page.evaluate(() => closeModal());

  /* the phone back button closes it */
  await page.goBack();
  await expect(f).not.toHaveClass(/show/);
  expect(errors).toEqual([]);
});

test('«العملاء والمراكز»: the center name and 🪪 open its file; «كشف مركز» has «🪪 ملف المركز»', async ({ app: page, server }) => {
  await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && (DB.data.customers || []).some(c => c.id === 'c_nk'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await page.evaluate(() => navigate('customers'));
  await page.locator('.cust-open', { hasText: 'مركز النخبة بحر' }).click();
  await expect(page.locator('#axcf')).toHaveClass(/show/);
  await page.locator('#axcf [data-a="close"]').click();
  await expect(page.locator('#axcf')).not.toHaveClass(/show/);
  await page.locator('.btn-icon[title="ملف المركز"][onclick*="c_nk"]').click();
  await expect(page.locator('#axcf .axcf-nm h2')).toHaveText('مركز النخبة بحر');
  await page.locator('#axcf [data-a="close"]').click();
  await page.evaluate(() => { navigate('payments'); AXStmt.open('c_nk'); });
  await page.locator('.axst-act', { hasText: 'ملف المركز' }).click();
  await expect(page.locator('#axcf')).toHaveClass(/show/);
  expect(errors).toEqual([]);
});

/* 5.05 · «ملف المركز»: «عاوزة أعرف تفاصيل مركز — وردنا إيه — زي بروفايل لكل مركز».
   Opens from the search at the top (any center) and from «العملاء والمراكز»; shows the balance and credit limit,
   what we supplied per paper type, the last 6 months, the latest moves; «التوريدات» has one card per sale (two
   paper types = one card) with its status, filters, search, and ✏️ per line — a change made from there shows in the
   file at once; «التحصيلات», «البيانات» (special prices); the phone back button closes it. */
import { test, expect, watchErrors, openSignedIn, CLERK } from './fixtures.mjs';
import { adminLogin, login, send, ops, col, data } from '../helpers/api.mjs';

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

/* 5.06 · «💹 الربح» — the same numbers as «أرباحي»; below-cost and no-cost items are flagged; a sales user never sees it */
async function seedProfit(server) {
  const admin = (await adminLogin(server.base)).token;
  if ((await data(server.base, admin)).customers.some(c => c.id === 'c_pr')) return admin;
  const L = (id, pid, name, qty, price) => ({ id, number: 3100, date: d(5), customerId: 'c_pr', customerName: 'مركز الربح', productId: pid, productName: name, productUnit: 'علبة', quantity: qty, unitPrice: price, total: qty * price, paid: 0, status: 'unpaid', createdAt: Date.now() - 5 * 864e5 });
  const r = await send(server.base, admin, ops({ cols: {
    customers: col({ added: [{ id: 'c_pr', name: 'مركز الربح', balance: 1400, creditLimit: 0, customPrices: {} }] }),
    products: col({ added: [
      { id: 'p_pr1', name: 'ورق ربح', unit: 'علبة', quantity: 50, minQuantity: 0, cost: 60, price: 95 },
      { id: 'p_pr2', name: 'ورق بلا تكلفة', unit: 'علبة', quantity: 50, minQuantity: 0, cost: 0, price: 50 },
      { id: 'p_pr3', name: 'فيلم خسران', unit: 'علبة', quantity: 50, minQuantity: 0, cost: 120, price: 100 }] }),
    issuances: col({ added: [L('is_pr1', 'p_pr1', 'ورق ربح', 10, 95), L('is_pr2', 'p_pr2', 'ورق بلا تكلفة', 5, 50), L('is_pr3', 'p_pr3', 'فيلم خسران', 2, 100)] })
  } }));
  expect(r.status).toBe(200);
  return admin;
}

test('«💹 الربح»: revenue, cost, profit and margin per center and per paper type — same as «أرباحي»', async ({ app: page, server }) => {
  await seedProfit(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && (DB.data.customers || []).some(c => c.id === 'c_pr'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await page.evaluate(() => AXCenter.open('c_pr'));
  const f = page.locator('#axcf');
  const strip = f.locator('.axcf-pstrip');
  await expect(strip).toContainText('560');                                             // 1,400 − 840
  await expect(strip).toContainText('40%');
  await strip.click();
  await expect(f.locator('.axcf-tabs [data-t="profit"]')).toHaveClass(/on/);
  const k = f.locator('.axcf-kpi');
  await expect(k.nth(0)).toContainText('1,400');
  await expect(k.nth(1)).toContainText('840');
  await expect(k.nth(2)).toContainText('560');
  await expect(k.nth(3)).toContainText('40%');
  await expect(f.locator('.axcf-alert.bad')).toContainText('فيلم خسران');               // sold under its cost
  await expect(f.locator('.axcf-alert.warn')).toContainText('ورق بلا تكلفة');            // no cost recorded
  const rows = f.locator('.axcf-ptr:not(.axcf-pth)');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('ورق ربح');                                   // most profit first: 350
  await expect(rows.first()).toContainText('36.8%');
  await expect(rows.last()).toContainText('فيلم خسران');
  await expect(rows.last().locator('.neg')).toContainText('-40');
  /* the very numbers «أرباحي» uses */
  const same = await page.evaluate(() => { const ls = AXProfit.lines().filter(l => l.cid === 'c_pr'); const p = AXCenter.profit('c_pr', 'all'); return [ls.reduce((t, l) => t + l.rev, 0), ls.reduce((t, l) => t + l.cost, 0), p.me.rev, p.me.cost]; });
  expect(same[0]).toBe(same[2]); expect(same[1]).toBe(same[3]);
  await f.locator('.axcf-seg [data-pp="3m"]').click();
  await expect(k.nth(0)).toContainText('1,400');                                        // 5 days ago is inside 3 months
  expect(errors).toEqual([]);
});

test('a sales user: no «💹 الربح» tab or strip (the cost price stays hidden)', async ({ page, context, server }) => {
  await seedProfit(server);
  const tok = (await login(server.base, CLERK.username, CLERK.password)).token;
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, tok);
  await page.waitForFunction(() => typeof DB !== 'undefined' && (DB.data.customers || []).some(c => c.id === 'c_pr'), null, { timeout: 20000 });
  await page.evaluate(() => AXCenter.open('c_pr'));
  await expect(page.locator('#axcf .axcf-nm h2')).toHaveText('مركز الربح');
  await expect(page.locator('#axcf .axcf-tabs [data-t="profit"]')).toHaveCount(0);
  await expect(page.locator('#axcf .axcf-pstrip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('«العملاء والمراكز»: a tap anywhere on the row opens the file; the row\'s buttons keep their own job', async ({ app: page, server }) => {
  await seedProfit(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && (DB.data.customers || []).some(c => c.id === 'c_pr'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await page.evaluate(() => navigate('customers'));
  const row = page.locator('tr.cust-row[data-cid="c_pr"]');
  await row.locator('td').nth(4).click();                                               // the balance cell
  await expect(page.locator('#axcf')).toHaveClass(/show/);
  await expect(page.locator('#axcf .axcf-nm h2')).toHaveText('مركز الربح');
  await page.locator('#axcf [data-a="close"]').click();
  await expect(page.locator('#axcf')).not.toHaveClass(/show/);
  await row.locator('button[title="كشف الحساب"]').click();                              // its own button: the statement, not the file
  await expect(page.locator('#modal-overlay')).toHaveClass(/show/);
  await expect(page.locator('#axcf')).not.toHaveClass(/show/);
  await page.evaluate(() => closeModal());
  expect(errors).toEqual([]);
});

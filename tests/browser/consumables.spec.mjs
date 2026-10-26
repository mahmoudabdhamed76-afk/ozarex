/* 4.58 · «🧪 مستهلكات» in «المخازن»: stock taken to try / as a sample leaves the stock, is listed with its reason and cost,
   counts as an expense «مستهلكات» in «أرباحي» and in «جميع الفروع» (never a sale), «الفلوس» still adds up exactly,
   more than what is there is refused, and the admin can return one recorded by mistake. */
import { test, expect, watchErrors, ADMIN_PASSWORD } from './fixtures.mjs';
import { login, req } from '../helpers/api.mjs';

test.describe.configure({ mode: 'serial' });
const apiData = async base => { const t = (await login(base, 'admin', ADMIN_PASSWORD)).token; return (await req(base, 'GET', '/api/data', { token: t })).json; };

test('record consumables from «المخازن»: stock down, listed with its cost, an expense in «أرباحي», «الفلوس» exact, undo', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const pid = await page.evaluate(() => { const p = DB.data.products.find(x => x.quantity >= 5 && x.cost > 0); return p && p.id; });
  expect(pid).toBeTruthy();
  const p0 = await page.evaluate(id => { const p = DB.data.products.find(x => x.id === id); return { q: p.quantity, cost: p.cost, name: p.name }; }, pid);
  const ym = await page.evaluate(() => todayStr().slice(0, 7));
  const from = ym + '-01', to = await page.evaluate(() => todayStr());
  const exp0 = await page.evaluate(([f, t]) => AXProfit.compute(DB.data, f, t).cur.exp, [from, to]);
  await page.evaluate(() => navigate('inventory'));
  await page.locator('#page-content .cs-btn').click();
  await expect(page.locator('#cs-form')).toBeVisible();
  await page.selectOption('#cs-pid', pid);
  /* more than what is there → refused, nothing changes */
  await page.fill('#cs-qty', String(p0.q + 1));
  await expect(page.locator('#cs-sum')).toHaveClass(/bad/);
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#cs-form')).toBeVisible();
  expect(await page.evaluate(id => DB.data.products.find(x => x.id === id).quantity, pid)).toBe(p0.q);
  /* 3 to try a printer */
  await page.fill('#cs-qty', '3');
  await page.locator('.cs-chip', { hasText: 'تجربة طابعة' }).click();
  await page.fill('#cs-form [name="note"]', 'تجربة طابعة مركز النور');
  await expect(page.locator('#cs-sum')).toContainText((3 * p0.cost).toLocaleString('en-US'));
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  expect(await page.evaluate(id => DB.data.products.find(x => x.id === id).quantity, pid)).toBe(p0.q - 3);
  const mv = await page.evaluate(() => DB.data.stockMoves.filter(m => m.kind === 'consumable').slice(-1)[0]);
  expect(mv).toMatchObject({ type: 'out', kind: 'consumable', quantity: 3, cost: p0.cost, reason: 'تجربة طابعة / جهاز', note: 'تجربة طابعة مركز النور' });
  /* saved on the server */
  await expect.poll(async () => (await apiData(server.base)).stockMoves.some(m => m.id === mv.id)).toBe(true);
  expect((await apiData(server.base)).products.find(p => p.id === pid).quantity).toBe(p0.q - 3);
  /* the tab lists it with the month's total */
  await page.evaluate(() => { invTab = 'cons'; renderInventory(); });
  await expect(page.locator('#page-content .cs-tbl')).toContainText(p0.name);
  await expect(page.locator('#page-content .cs-kpi b')).toContainText((3 * p0.cost).toLocaleString('en-US'));
  /* «أرباحي»: an expense «مستهلكات», not a sale · «الفلوس»: still exact */
  const P = await page.evaluate(([f, t]) => AXProfit.compute(DB.data, f, t).cur, [from, to]);
  expect(P.cons).toBe(3 * p0.cost);
  expect(Math.round((P.exp - exp0) * 100) / 100).toBe(3 * p0.cost);
  expect(P.byCat['مستهلكات']).toBe(3 * p0.cost);
  const check = await page.evaluate(([f, t]) => { const P = AXProfit.compute(DB.data, f, t).cur; const R = AXCash.report(DB.data, f, t, { today: t, profit: { rev: P.rev, cost: P.cost, exp: P.exp, net: P.net, cons: P.cons } }); return R.bridge ? R.bridge.check : null; }, [from, to]);
  const check0 = await page.evaluate(([f, t]) => { const P = AXProfit.compute(DB.data, f, t).cur; const R = AXCash.report(DB.data, f, t, { today: t, profit: { rev: P.rev, cost: P.cost, exp: P.exp - P.cons, net: P.net + P.cons, cons: 0 } }); return R.bridge ? R.bridge.check : null; }, [from, to]);
  expect(check).toBe(check0);                                                      // consumables do not open a gap in «الربح راح فين؟»
  /* «جميع الفروع» (server, same rule) */
  const t = (await login(server.base, 'admin', ADMIN_PASSWORD)).token;
  const sm = (await req(server.base, 'GET', '/api/branches/summary?p=month', { token: t })).json;
  expect(sm.branches.find(b => b.id === 'main').consumables).toBe(3 * p0.cost);
  /* the admin returns it (recorded by mistake) */
  await page.locator('#page-content .cs-tbl button', { hasText: 'رجّعها' }).first().click();
  await page.locator('#confirm-yes').click();
  await expect.poll(() => page.evaluate(id => DB.data.products.find(x => x.id === id).quantity, pid)).toBe(p0.q);
  expect(await page.evaluate(id => DB.data.stockMoves.some(m => m.id === id), mv.id)).toBe(false);
  await expect.poll(async () => (await apiData(server.base)).products.find(p => p.id === pid).quantity).toBe(p0.q);
  expect(errors).toEqual([]);
});

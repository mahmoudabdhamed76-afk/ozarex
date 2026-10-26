/* 4.32 · Multi-branch — Phase 2 (the screens): the open branch is always shown, switching reloads the app on
   the other branch's data only, saves go to the branch they were made in (also from the offline queue), the
   offline copy is kept per branch, the admin manages branches and who opens which. */
import { test, expect, watchErrors, waitForApp, ADMIN_PASSWORD, SALES } from './fixtures.mjs';
import { login, req } from '../helpers/api.mjs';

const MN = 'b_minya00001', CA = 'b_cairo00001';   // MN: «فرع المنيا» (the main branch is منوف)
const apiData = async (base, branch) => { const t = (await login(base, 'admin', ADMIN_PASSWORD)).token; return (await req(base, 'GET', '/api/data', { token: t, headers: { 'X-Branch': branch } })).json; };
const idbKeys = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('erp-offline', 1); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('data_snapshot')) return res({}); const out = {}; const tx = db.transaction(['data_snapshot', 'sync_queue']);
  tx.objectStore('data_snapshot').openCursor().onsuccess = e => { const c = e.target.result; if (c) { out[c.key] = { branch: c.value.branch || 'main', n: (JSON.parse(c.value.json || '{}').customers || []).length }; c.continue(); } };
  const q = []; tx.objectStore('sync_queue').openCursor().onsuccess = e => { const c = e.target.result; if (c) { q.push(c.value.branch || 'main'); c.continue(); } };
  tx.oncomplete = () => res({ snaps: out, queue: q }); }; r.onerror = () => res({}); }));
const switchTo = async (page, id) => { await page.evaluate(id => AXBranch.go(id), id); await page.waitForFunction(id => { try { return Branch.get() === id && typeof currentUser !== 'undefined' && !!currentUser && getComputedStyle(document.getElementById('app')).display !== 'none'; } catch (_) { return false; } }, id, { timeout: 30000 }); await waitForApp(page); };

test.describe.configure({ mode: 'serial' });

test('the open branch is always shown (main = فرع منوف); the picker lists القاهرة / المنيا; switching opens that branch only', async ({ app: page, server }, info) => {
  const errors = watchErrors(page);
  const phone = info.project.name !== 'desktop';
  const chip = page.locator(phone ? '#axb-chip-m' : '#axb-chip-d');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('فرع منوف');
  const mainCustomers = await page.evaluate(() => DB.data.customers.length);
  expect(mainCustomers).toBeGreaterThan(0);
  await chip.click();
  const rows = page.locator('#axb-sheet .axb-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');
  for (const n of ['فرع منوف', 'فرع القاهرة', 'فرع المنيا']) await expect(page.locator('#axb-sheet')).toContainText(n);
  await expect(rows.nth(0)).toContainText('الفرع الأساسي');
  await rows.filter({ hasText: 'فرع المنيا' }).click();
  await page.waitForFunction(() => { try { return Branch.get() === 'b_minya00001' && !!currentUser; } catch (_) { return false; } }, null, { timeout: 30000 });
  await waitForApp(page);
  await expect(page.locator(phone ? '#axb-chip-m' : '#axb-chip-d')).toContainText('فرع المنيا');
  expect(await page.evaluate(() => DB.data.customers.length)).toBe(0);         // a new branch: empty
  expect(await page.evaluate(() => DB.data.invoices.length)).toBe(0);
  /* remembered on this device: a reload stays on منوف */
  await page.reload(); await waitForApp(page);
  expect(await page.evaluate(() => Branch.get())).toBe(MN);
  await switchTo(page, 'main');
  expect(await page.evaluate(() => DB.data.customers.length)).toBe(mainCustomers);
  expect(errors).toEqual([]);
});

test('a record saved in المنيا goes to المنيا only (the server and the screens)', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  await switchTo(page, MN);
  const id = 'c_mn_' + test.info().project.name;
  await page.evaluate(id => { DB.data.customers.push({ id, name: 'مركز منوف ' + id, phone: '', balance: 0, customPrices: {} }); DB.save(); }, id);
  await expect.poll(async () => (await apiData(server.base, MN)).customers.some(c => c.id === id), { timeout: 10000 }).toBe(true);
  expect((await apiData(server.base, 'main')).customers.some(c => c.id === id)).toBe(false);
  expect((await apiData(server.base, CA)).customers.some(c => c.id === id)).toBe(false);
  await switchTo(page, 'main');
  expect(await page.evaluate(id => DB.data.customers.some(c => c.id === id), id)).toBe(false);
  await switchTo(page, MN);
  expect(await page.evaluate(id => DB.data.customers.some(c => c.id === id), id)).toBe(true);
  /* the offline copy: one per branch, the main one keeps its key */
  await page.evaluate(() => OfflineManager.snapshotSettled());
  const k = await idbKeys(page);
  expect(k.snaps['snapshot@' + MN].branch).toBe(MN);
  expect(k.snaps.snapshot ? k.snaps.snapshot.branch : 'main').toBe('main');
  await switchTo(page, 'main');
  expect(errors).toEqual([]);
});

test('offline in المنيا: the change waits in the queue tagged المنيا and is sent to المنيا when back online', async ({ app: page, server, context }) => {
  await switchTo(page, MN);
  const id = 'c_off_' + test.info().project.name;
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(id => { DB.data.customers.push({ id, name: 'أوف لاين ' + id, phone: '', balance: 0, customPrices: {} }); DB.save(); }, id);
  await expect.poll(async () => (await idbKeys(page)).queue || [], { timeout: 10000 }).toContain(MN);
  await context.setOffline(false);
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); OfflineManager.flushQueue(); });
  await expect.poll(async () => (await apiData(server.base, MN)).customers.some(c => c.id === id), { timeout: 20000 }).toBe(true);
  expect((await apiData(server.base, 'main')).customers.some(c => c.id === id)).toBe(false);
  await switchTo(page, 'main');
});

test('the admin manages branches: add one, and choose who opens which (enforced by the server)', async ({ app: page, server }, info) => {
  const errors = watchErrors(page);
  await page.evaluate(() => AXBranch.manage());
  await expect(page.locator('#axb-sheet .axb-br')).toHaveCount(3);
  const name = 'فرع طنطا ' + info.project.name;
  await page.fill('#axb-new-n', name);
  await page.fill('#axb-new-c', 'TN');
  await page.locator('#axb-sheet .axb-new .axb-btn').click();
  await expect(page.locator('#axb-sheet .axb-br')).toHaveCount(4);
  expect(await page.evaluate(n => Branch.list().some(b => b.name === n), name)).toBe(true);
  /* make sure the restricted user exists, then give her منوف */
  const t = (await login(server.base, 'admin', ADMIN_PASSWORD)).token;
  const ul = await req(server.base, 'GET', '/api/data', { token: t });
  if (!ul.json.users.some(u => u.id === SALES.id)) throw new Error('fixture user missing');
  await page.evaluate(() => AXBranch.close());
  await page.evaluate(() => AXBranch.manage());
  const row = page.locator('#axb-sheet .axb-u').filter({ hasText: SALES.name });
  await row.locator('.axb-ch', { hasText: 'فرع المنيا' }).click();
  await expect(row.locator('.axb-ch.on', { hasText: 'فرع المنيا' })).toHaveCount(1);
  await page.locator('#axb-sheet .axb-btn.wide').click();
  const st = (await login(server.base, SALES.username, SALES.password)).token;
  await expect.poll(async () => (await req(server.base, 'GET', '/api/branches', { token: st })).json.allowed.sort(), { timeout: 10000 }).toEqual(['b_minya00001', 'main'].sort());
  expect((await req(server.base, 'GET', '/api/data', { token: st, headers: { 'X-Branch': CA } })).status).toBe(403);
  await page.evaluate(() => AXBranch.close());
  expect(errors).toEqual([]);
});

test('«جميع الفروع» (admin): totals + every branch, periods, and one tap opens a branch', async ({ app: page }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => AXBranch.open());
  await expect(page.locator('#axb-sheet .axb-all')).toBeVisible();
  await page.locator('#axb-sheet .axb-all').click();
  await expect(page.locator('#axb-sheet[data-k="all"] .axo-hero')).toBeVisible({ timeout: 10000 });
  const cards = page.locator('#axb-sheet .axo-c');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  await expect(cards.first()).toContainText('فرع منوف');
  await expect(cards.first()).toContainText('انت فيه دلوقتي');
  /* the hero = what the server says the total is */
  const j = await page.evaluate(() => fetch('/api/branches/summary?p=month', { credentials: 'same-origin' }).then(r => r.json()));
  await expect(page.locator('#axb-sheet .axo-hero b').first()).toContainText(Math.round(j.total.sales).toLocaleString('en-US'));
  await page.locator('#axb-sheet .axo-per button', { hasText: 'الكل' }).click();
  await expect(page.locator('#axb-sheet .axo-per button.on')).toHaveText('الكل');
  await expect(page.locator('#axb-sheet .axo-hero')).toContainText('من أول يوم');
  /* one tap → that branch */
  await page.locator('#axb-sheet .axo-c', { hasText: 'فرع القاهرة' }).locator('.axb-btn.pri').click();
  await page.waitForFunction(() => { try { return Branch.get() === 'b_cairo00001' && !!currentUser; } catch (_) { return false; } }, null, { timeout: 30000 });
  await waitForApp(page);
  await switchTo(page, 'main');
  expect(errors).toEqual([]);
});

test('transfers on screen (4.58): goods sent from منوف arrive in القاهرة at once — no confirmation; money too', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const p1Before = (await apiData(server.base, 'main')).products.find(p => p.id === 'p1').quantity;
  const caBefore = ((await apiData(server.base, CA)).products.find(p => p.name === 'ورق A4') || { quantity: 0 }).quantity;
  await page.evaluate(() => AXBranch.open());
  await page.locator('#axb-sheet .axb-trb').click();
  await expect(page.locator('#axb-sheet .axb-lead')).toContainText('في نفس اللحظة');
  await page.locator('#axb-sheet .axt-new .axb-btn', { hasText: 'تحويل بضاعة' }).click();
  await page.selectOption('#axb-sheet .axt-it select', 'p1');
  await page.fill('#axb-sheet .axt-it input', '7');
  await page.selectOption('#axt-to', CA);
  await page.click('#axt-send');
  await expect(page.locator('#axb-sheet .axt-r').first()).toContainText('وصل', { timeout: 10000 });
  await expect(page.locator('#axb-sheet .axt-r').first()).not.toContainText('في الطريق');
  await expect.poll(async () => (await apiData(server.base, 'main')).products.find(p => p.id === 'p1').quantity).toBe(p1Before - 7);
  await expect.poll(async () => ((await apiData(server.base, CA)).products.find(p => p.name === 'ورق A4') || {}).quantity, { timeout: 10000 }).toBe(caBefore + 7);
  await page.evaluate(() => AXBranch.close());
  /* القاهرة: nothing waits for a confirmation — the goods are already in its stock on this device */
  await switchTo(page, CA);
  const phone = test.info().project.name !== 'desktop';
  await expect.poll(() => page.evaluate(() => (DB.data.products.find(p => p.name === 'ورق A4') || {}).quantity), { timeout: 10000 }).toBe(caBefore + 7);
  await expect(page.locator((phone ? '#axb-chip-m' : '#axb-chip-d') + ' .axb-n')).toHaveCount(0);
  await page.evaluate(() => AXBranch.transfers());
  await expect(page.locator('#axb-sheet .axt-stuck')).toHaveCount(0);
  /* money from القاهرة back to منوف — out of one cash, into the other */
  const mainIn0 = ((await apiData(server.base, 'main')).settings._cashMoves || []).filter(m => m.dir === 'in').length;
  await page.locator('#axb-sheet .axt-new .axb-btn', { hasText: 'تحويل فلوس' }).click();
  await page.selectOption('#axt-to', 'main');
  await page.fill('#axt-amt', '250');
  await page.click('#axt-send');
  await expect.poll(async () => ((await apiData(server.base, CA)).settings._cashMoves || []).filter(m => m.dir === 'out').length, { timeout: 10000 }).toBeGreaterThan(0);
  await expect.poll(async () => ((await apiData(server.base, 'main')).settings._cashMoves || []).filter(m => m.dir === 'in').length, { timeout: 10000 }).toBe(mainIn0 + 1);
  await page.evaluate(() => AXBranch.close());
  await switchTo(page, 'main');
  expect(errors).toEqual([]);
});

/* 5.08 / 5.09 · «المخزن ثري دي»: a live 3D hangar at the top of «المخازن».
   One bay per item with cartons = the real quantity (sheets ÷ 1000, a box = a carton); about-to-run-out / out
   items are flagged; a change made on ANOTHER device (live sync) plays in the hangar (cartons go, «صرف …» on the
   ribbon); a tap on a bay opens its card and «➕ وارد» opens the stock form for that item — saving it adds the
   cartons; ✕ hides it (remembered) and «اعرض» brings it back; leaving the page and coming back keeps it working.
   5.09: a zone chip flies the camera to that zone and its bays show the REAL items at the REAL count (12 ink
   bottles, 3000 sheets = 6 reams …); a tap on a bay comes up to it with its card, ‹ › go to the next bay, ↩ goes
   back; a change while you look at a zone changes the real items at once.
   5.10: a zone too big for one line of racks: the camera stands straight in front of the tapped bay and every line
   of racks in front of it steps aside (it used to stand inside the line in front); ‹ › in the zone go to its
   other line.
   5.11: paper and parts look like the real thing — wrapped reams with size/weight (the opened last ream only as full
   as it is), boxes with lids (the top one opened), film boxes, rolls; print heads in blisters, rollers, boards in
   bags, fusers, belts, motors …, small parts in blue bins, anything else bagged with a barcode; a location tag on
   every bay (B-04); tap one item → it lights up «الريم 7 من 7 · مفتوح»; what comes in / goes out while you look
   close moves one by one; 🔍 finds an item and flies to it. */
import { test, expect, watchErrors } from './fixtures.mjs';
import { adminLogin, send, ops, col, data } from '../helpers/api.mjs';

test.describe.configure({ mode: 'serial' });
const P = (id, name, type, unit, quantity, minQuantity) => ({ id, name, type, unit, quantity, minQuantity, cost: 50, price: 80 });

async function seed(server) {
  const admin = (await adminLogin(server.base)).token;
  if ((await data(server.base, admin)).products.some(p => p.id === 'hz_blue')) return admin;
  const r = await send(server.base, admin, ops({ cols: { products: col({ added: [
    P('hz_blue', 'Green Tec - Blue', 'ورق', 'علبة', 42, 10), P('hz_vivid', 'A4 Photo Vivid', 'ورق', 'ورقة', 3000, 1000),
    P('hz_a3', 'A3 Photo Paper', 'ورق', 'ورقة', 0, 500), P('hz_mag', 'Epson Ink Magenta', 'حبر', 'خرطوشة', 3, 4),
    P('hz_head', 'رأس طباعة', 'قطع غيار', 'قطعة', 5, 1), P('hz_cyan', 'Epson Ink Cyan', 'حبر', 'خرطوشة', 12, 2)] }) } }));
  expect(r.status).toBe(200);
  return admin;
}
async function openHangar(page) {
  await page.evaluate(() => navigate('inventory'));
  await expect(page.locator('.axh .axh-cv')).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => AXHangar.ready())).toBe(true);
  await expect.poll(() => page.evaluate(() => { const s = AXHangar.state(); return s && Object.keys(s.bays).length; }), { timeout: 15000 }).toBeGreaterThan(4);
}
const shown = (page, id) => page.evaluate(i => { const s = AXHangar.state(); return s && s.bays[i] ? s.bays[i].shown : null; }, id);

test('the hangar: a bay per item, cartons = quantity, zones, run-out flags', async ({ app: page, server }) => {
  await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_head'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  expect(await shown(page, 'hz_blue')).toBe(42);                                       // 42 boxes = 42 cartons
  expect(await shown(page, 'hz_vivid')).toBe(3);                                       // 3000 sheets = 3 cartons
  expect(await shown(page, 'hz_a3')).toBe(0);
  const st = await page.evaluate(() => AXHangar.state().bays);
  expect(st.hz_a3.state).toBe('out');
  expect(st.hz_mag.state).toBe('low');
  expect(st.hz_blue.state).toBe('ok');
  expect(await page.evaluate(() => [AXHangar.zoneOf({ type: 'حبر' }), AXHangar.zoneOf({ name: 'رأس طباعة', unit: 'قطعة' }), AXHangar.zoneOf({ name: 'Green Tec - Red', unit: 'علبة' }), AXHangar.cartonsOf({ unit: 'ريم', quantity: 12 }), AXHangar.zoneOf({ name: 'بكرة سحب ورق', type: 'قطع غيار' })])).toEqual(['ink', 'parts', 'paper', 3, 'parts']);
  await expect(page.locator('.axh-zone', { hasText: 'أحبار' })).toHaveCount(1);
  await expect(page.locator('.axh-k')).toContainText('قربت تخلص');
  await expect(page.locator('.axh-k')).toContainText('خلصت');
  await expect(page.locator('.axh-l[data-id="hz_a3"]')).toContainText('خلص');
  /* the page below works as before: search re-renders and the hangar stays */
  await page.fill('#inv-search', 'Green');
  await expect(page.locator('.axh .axh-cv')).toBeVisible();
  await page.fill('#inv-search', '');
  expect(errors).toEqual([]);
});

test('a supply made on another device plays in the hangar: the cartons go, «صرف … لمركز» on the ribbon', async ({ app: page, server }) => {
  const admin = await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_head'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  const before = await shown(page, 'hz_blue');
  const d = await data(server.base, admin);
  const q = d.products.find(p => p.id === 'hz_blue').quantity;
  const r = await send(server.base, admin, ops({ cols: {
    products: col({ modified: [{ id: 'hz_blue', before: { quantity: q }, after: { quantity: q - 6 } }] }),
    customers: col({ added: [{ id: 'c_hz', name: 'مركز النخبة', balance: 0, customPrices: {} }] }),
    issuances: col({ added: [{ id: 'is_hz', number: 8801, customerId: 'c_hz', customerName: 'مركز النخبة', productId: 'hz_blue', productName: 'Green Tec - Blue', quantity: 6, unitPrice: 80, total: 480, paid: 0, date: new Date().toISOString().slice(0, 10), createdAt: Date.now() }] })
  } }));
  expect(r.status).toBe(200);
  await expect(page.locator('.axh-ribbon')).toContainText('صرف', { timeout: 20000 });
  await expect(page.locator('.axh-ribbon')).toContainText('مركز النخبة');
  await expect.poll(() => shown(page, 'hz_blue'), { timeout: 25000 }).toBe(before - 6);
  await expect(page.locator('.axh-l[data-id="hz_blue"]')).toContainText(String(q - 6));
  expect(errors).toEqual([]);
});

test('tap a bay → its card → «➕ وارد» opens the stock form for it; saving adds the cartons', async ({ app: page, server }) => {
  await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_head'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  await expect(page.locator('.axh-l[data-id="hz_mag"]')).toBeVisible();                // low stock: its tag shows on the phone too
  await page.evaluate(() => document.querySelector('.axh').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const at = await page.evaluate(() => AXHangar.screenOf('hz_mag'));
  await page.mouse.click(at.x, at.y);                                                   // a real tap on the bay
  const card = page.locator('.axh-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.axh-cn')).toHaveText('Epson Ink Magenta');
  const before = await shown(page, 'hz_mag');
  await card.locator('[data-a="in"]').click();
  await expect(page.locator('#move-form')).toBeVisible();
  await expect(page.locator('#move-form [name="productId"]')).toHaveValue('hz_mag');
  await expect(page.locator('#move-form [name="type"]')).toHaveValue('in');
  await page.fill('#move-form [name="quantity"]', '10');
  await page.locator('.modal-footer .btn-primary').click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await expect.poll(() => shown(page, 'hz_mag'), { timeout: 25000 }).toBe(before + 10);
  await expect.poll(() => page.evaluate(() => AXHangar.state().bays.hz_mag.state), { timeout: 5000 }).toBe('ok');
  expect(errors).toEqual([]);
});

test('✕ hides the hangar (remembered), «اعرض» brings it back; another page and back keeps it working', async ({ app: page, server }) => {
  await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_head'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  await page.locator('.axh-tools [data-a="off"]').click();
  await expect(page.locator('.axh')).toHaveCount(0);
  await expect(page.locator('.axh-show')).toBeVisible();
  await page.evaluate(() => navigate('dashboard'));
  await page.evaluate(() => navigate('inventory'));
  await expect(page.locator('.axh')).toHaveCount(0);                                     // remembered on this device
  await page.locator('.axh-show').click();
  await expect(page.locator('.axh .axh-cv')).toBeVisible();
  await page.evaluate(() => navigate('customers'));
  await page.evaluate(() => navigate('inventory'));
  await expect(page.locator('.axh .axh-cv')).toBeVisible();
  expect(await shown(page, 'hz_head')).toBe(5);
  expect(errors).toEqual([]);
});

const view = page => page.evaluate(() => { const s = AXHangar.state(); return s && s.view.mode + ':' + (s.view.zone || '') + ':' + (s.view.id || ''); });
const detail = (page, id) => page.evaluate(i => { const s = AXHangar.state(); return s && s.bays[i] ? s.bays[i].detail : null; }, id);

test('a zone chip flies to the zone and shows the real items at the real count; a bay comes up close with its card', async ({ app: page, server }) => {
  await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_cyan'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  expect(await page.evaluate(() => [AXHangar.kindOf({ name: 'Epson Ink Cyan', type: 'حبر', unit: 'خرطوشة' }), AXHangar.kindOf({ name: 'A4 Photo', unit: 'ورقة' }), AXHangar.unitsOf({ name: 'A4 Photo', unit: 'ورقة', quantity: 3000 }), AXHangar.kindOf({ name: 'رأس طباعة', unit: 'قطعة', type: 'قطع غيار' }), AXHangar.kindOf({ name: 'بكرة سحب ورق', unit: 'قطعة', type: 'قطع غيار' }), AXHangar.kindOf({ name: 'Green Tec - Blue', unit: 'علبة', type: 'ورق' })]))
    .toEqual(['bottle', 'ream', 6, 'head', 'roller', 'box']);
  expect(await detail(page, 'hz_cyan')).toBe(null);                                     // the whole hangar: cartons only
  await page.locator('.axh-zones button[data-zone="ink"]').click();
  await expect.poll(() => view(page)).toBe('zone:ink:');
  await expect(page.locator('.axh-zones button[data-zone="ink"]')).toHaveClass(/on/);
  expect(await detail(page, 'hz_cyan')).toBe(12);                                       // 12 bottles, one by one
  expect(await detail(page, 'hz_mag')).toBe(await page.evaluate(() => DB.data.products.find(p => p.id === 'hz_mag').quantity));
  expect(await detail(page, 'hz_vivid')).toBe(null);                                    // only the zone you look at is built
  await expect(page.locator('.axh-l[data-id="hz_cyan"]')).toBeVisible();                // every bay of the zone is named, phone too
  await expect.poll(() => page.evaluate(() => AXHangar.state().flying), { timeout: 5000 }).toBe(false);
  /* a tap on a bay: close up + its card */
  const at = await page.evaluate(() => AXHangar.screenOf('hz_cyan'));
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => view(page)).toBe('bay:ink:hz_cyan');
  const card = page.locator('.axh-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.axh-cn')).toHaveText('Epson Ink Cyan');
  await expect(card).toContainText('12 زجاجة');
  await page.locator('.axh-nav [data-a="next"]').click();                                // ‹ › the next bay of the zone
  await expect.poll(() => view(page)).toBe('bay:ink:hz_mag');
  await expect(card.locator('.axh-cn')).toHaveText('Epson Ink Magenta');
  await page.locator('.axh-nav [data-a="back"]').click();
  await expect.poll(() => view(page)).toBe('zone:ink:');
  await expect(card).toBeHidden();
  /* paper: 3000 sheets = 6 reams */
  await page.locator('.axh-zones button[data-zone="paper"]').click();
  await expect.poll(() => view(page)).toBe('zone:paper:');
  expect(await detail(page, 'hz_vivid')).toBe(6);
  expect(await detail(page, 'hz_cyan')).toBe(null);                                     // the ink zone was let go
  await page.locator('.axh-nav [data-a="back"]').click();
  await expect.poll(() => view(page)).toBe('all::');
  expect(await detail(page, 'hz_vivid')).toBe(null);
  expect(errors).toEqual([]);
});

test('a change made on another device while looking at a zone changes the real items at once', async ({ app: page, server }) => {
  const admin = await seed(server);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_cyan'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  await page.evaluate(() => AXHangar.zone('ink'));
  await expect.poll(() => view(page)).toBe('zone:ink:');
  const d = await data(server.base, admin);
  const q = d.products.find(p => p.id === 'hz_cyan').quantity;
  expect(await detail(page, 'hz_cyan')).toBe(q);
  const r = await send(server.base, admin, ops({ cols: { products: col({ modified: [{ id: 'hz_cyan', before: { quantity: q }, after: { quantity: q - 4 } }] }) } }));
  expect(r.status).toBe(200);
  await expect.poll(() => detail(page, 'hz_cyan'), { timeout: 20000 }).toBe(q - 4);
  await expect(page.locator('.axh-l[data-id="hz_cyan"]')).toContainText(String(q - 4));
  await expect(page.locator('.axh-ribbon')).toContainText('Epson Ink Cyan');
  expect(await page.evaluate(() => AXHangar.state().view.mode)).toBe('zone');            // the view stays where you were
  expect(errors).toEqual([]);
});

test('a big zone on two lines: a tapped bay on the back line is faced straight on, the lines in front step aside', async ({ app: page, server }) => {
  const admin = await seed(server);
  const inks = ['Black', 'Yellow', 'Light Cyan', 'Light Magenta', 'Vivid Magenta', 'Grey', 'Light Grey', 'Matte Black'];
  const r = await send(server.base, admin, ops({ cols: { products: col({ added: inks.map((n, i) => P('hz_ink' + i, 'MG Ink ' + n, 'حبر', 'خرطوشة', 4 + i, 1)) }) } }));
  expect(r.status).toBe(200);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_ink7'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  await page.evaluate(() => AXHangar.zone('ink'));
  await expect.poll(() => view(page)).toMatch(/^zone:ink:/);
  const st = await page.evaluate(() => AXHangar.state());
  expect(st.view.lines).toBeGreaterThan(1);                                             // 10 ink items: two lines of racks
  await expect(page.locator('.axh-nav [data-a="next"]')).toBeVisible();                 // ‹ › the zone's other line
  const first = st.view.line;
  await page.locator('.axh-nav [data-a="next"]').click();
  await expect.poll(() => page.evaluate(() => AXHangar.state().view.line)).not.toBe(first);
  /* the ink bay furthest back, with a line of racks in front of it */
  const ink = Object.entries(st.bays).filter(([, b]) => b.zone === 'ink');
  const backZ = Math.min(...ink.map(([, b]) => b.z));
  const id = ink.find(([, b]) => b.z === backZ)[0];
  expect(Object.values(st.bays).some(b => b.z > backZ)).toBe(true);
  await page.evaluate(i => AXHangar.bay(i), id);
  await expect.poll(() => view(page)).toBe('bay:ink:' + id);
  const s2 = await page.evaluate(() => AXHangar.state());
  for (const b of Object.values(s2.bays)) { expect(b.cut).toBe(b.z > backZ); if (b.cut) expect(b.drawn).toBe(false); }   // every line in front steps aside — rack, cartons and real items — the rest stays
  expect(s2.bays[id].detail).toBe(s2.bays[id].units);
  await expect.poll(() => page.evaluate(() => AXHangar.state().flying), { timeout: 8000 }).toBe(false);
  const off = await page.evaluate(i => { const r = document.querySelector('.axh-cv').getBoundingClientRect(), p = AXHangar.screenOf(i); return Math.abs(p.x - (r.left + r.width / 2)) / r.width; }, id);
  expect(off).toBeLessThan(0.03);                                                        // straight in front of it
  /* a tap on the canvas in front of it can't land on a hidden bay in the line that stepped aside */
  const at = await page.evaluate(i => AXHangar.screenOf(i), id);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => view(page)).toBe('bay:ink:' + id);
  await page.locator('.axh-nav [data-a="back"]').click();
  await expect.poll(() => view(page)).toMatch(/^zone:ink:/);
  await page.locator('.axh-zones button[data-zone=""]').click();
  await expect.poll(() => view(page)).toBe('all::');
  expect(Object.values(await page.evaluate(() => AXHangar.state().bays)).some(b => b.cut)).toBe(false);   // whole hangar: everything back
  expect(errors).toEqual([]);
});

test('real paper and parts: kinds, the opened ream, bins, location tags, one item tapped, one-by-one, find', async ({ app: page, server }) => {
  const admin = await seed(server);
  const r = await send(server.base, admin, ops({ cols: { products: col({ added: [P('hz_laser', 'A4 Laser 80g', 'ورق', 'ورقة', 3250, 500), P('hz_sens', 'حساس ورق', 'قطع غيار', 'قطعة', 30, 5)] }) } }));
  expect(r.status).toBe(200);
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.data.products.some(p => p.id === 'hz_sens'), null, { timeout: 20000 });
  const errors = watchErrors(page);
  await openHangar(page);
  const K = n => ({ name: n, unit: 'قطعة', type: 'قطع غيار' });
  expect(await page.evaluate(list => list.map(n => AXHangar.kindOf({ name: n, unit: 'قطعة', type: 'قطع غيار' })), ['فيوزر', 'سير الطابعة', 'ترس سحب', 'حساس ورق', 'كابل فلات', 'موتور', 'طرمبة حبر', 'دامبر', 'كاب ستيشن', 'مفتاح تشغيل', 'رأس طباعة', 'بكرة سحب ورق', 'بورد تحكم']))
    .toEqual(['fuser', 'belt', 'gear', 'sensor', 'cable', 'motor', 'pump', 'damper', 'cap', 'bag', 'head', 'roller', 'board']);
  void K;
  expect(await page.evaluate(() => [AXHangar.specOf({ name: 'A4 Photo (200g) Vivid' }), AXHangar.specOf({ name: 'Fuji Film 14×17' }), AXHangar.specOf({ name: 'ورق A3 260جم' })].map(s => s.size + '|' + s.gsm)))
    .toEqual(['A4|200g', '14×17|', 'A3|260g']);
  /* paper: 3250 sheets = 6 reams + one opened, half full */
  await page.evaluate(() => AXHangar.zone('paper'));
  await expect.poll(() => view(page)).toMatch(/^zone:paper:/);
  const st = await page.evaluate(() => AXHangar.state());
  expect(st.bays.hz_laser.detail).toBe(7);
  expect(st.bays.hz_laser.fill).toBe(0.5);
  for (const b of Object.values(st.bays)) expect(b.loc).toMatch(/^[A-Z]-\d\d$/);        // every bay has its location tag
  expect(new Set(Object.values(st.bays).map(b => b.loc)).size).toBe(Object.keys(st.bays).length);
  /* tap one item: the 7th ream, the opened one */
  await page.evaluate(() => AXHangar.bay('hz_laser'));
  await expect.poll(() => view(page)).toBe('bay:paper:hz_laser');
  await expect.poll(() => page.evaluate(() => AXHangar.state().flying), { timeout: 8000 }).toBe(false);
  await expect(page.locator('.axh-card')).toContainText('مكانه في الهانجر: ' + st.bays.hz_laser.loc);
  const at = await page.evaluate(() => AXHangar.itemScreen('hz_laser', 6));
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate(() => AXHangar.state().pick && AXHangar.state().pick.i)).toBe(6);
  await expect(page.locator('.axh-pick')).toContainText('الريم 7 من 7');
  await expect(page.locator('.axh-pick')).toContainText('مفتوح · 250 ورقة');
  expect(await page.evaluate(() => AXHangar.state().view.id)).toBe('hz_laser');
  /* in and out from another device while looking: one by one, then the right count */
  let q = 3250;
  const change = async to => { const rr = await send(server.base, admin, ops({ cols: { products: col({ modified: [{ id: 'hz_laser', before: { quantity: q }, after: { quantity: to } }] }) } })); expect(rr.status).toBe(200); q = to; };
  await change(4250);                                                                     // +1000 sheets: 9 reams (8 full + 1 half)
  await expect.poll(() => page.evaluate(() => AXHangar.state().bays.hz_laser.detail), { timeout: 20000 }).toBe(9);
  await change(1500);                                                                     // −2750: 3 reams, no opened one
  await expect.poll(() => page.evaluate(() => { const b = AXHangar.state().bays.hz_laser; return b.detail + '|' + b.fill; }), { timeout: 20000 }).toBe('3|1');
  await expect.poll(() => page.evaluate(() => AXHangar.state().leaving), { timeout: 10000 }).toBe(0);
  /* small parts sit in blue bins */
  await page.evaluate(() => AXHangar.bay('hz_sens'));
  await expect.poll(() => view(page)).toBe('bay:parts:hz_sens');
  const sens = (await page.evaluate(() => AXHangar.state())).bays.hz_sens;
  expect(sens.detail).toBe(30);
  expect(sens.bins).toBeGreaterThan(0);
  /* 🔍 find */
  await page.locator('.axh-tools [data-a="find"]').click();
  await page.locator('.axh-find input').fill('laser');
  await expect(page.locator('.axh-fr button')).toHaveCount(1);
  await page.locator('.axh-find input').press('Enter');
  await expect.poll(() => view(page)).toBe('bay:paper:hz_laser');
  await expect(page.locator('.axh-find')).toBeHidden();
  expect(errors).toEqual([]);
});

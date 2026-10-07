/* 4.27 · «الأمان والنسخ» + «المستخدمين» behind the settings password · «المزيد» on the computer (smaller, animated)
   · the new «المبيعات» page (phone: the attached design · computer: like «الفواتير»). */
import { test, expect, openSignedIn, watchErrors, unlockSection, LOCK_PW } from './fixtures.mjs';
import { login, adminLogin, send, ops, col } from '../helpers/api.mjs';

const isDesktop = () => test.info().project.name === 'desktop';
/* the sale numbers on screen: computer = table rows, phone = one card per sale */
const rows = page => page.evaluate(() => document.querySelector('#page-content .sl-m')
  ? Array.from(document.querySelectorAll('#page-content .sl-rows > .sl-row .sl-no')).map(e => e.textContent.trim())
  : Array.from(document.querySelectorAll('#page-content .sl-rows > tr:not(.sl-empty)')).map(tr => tr.children[0].textContent.trim()));

/* ── locks ── */
test('«الأمان والنسخ» and «المستخدمين» are locked like the settings; one unlock opens all four', async ({ app: page }) => {
  const errors = watchErrors(page);
  for (const k of ['security', 'users']) {
    await page.evaluate(k => navigate(k), k);
    await expect(page.locator('#axl-pw')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1500);                                         // the page's own late loading must not unlock it
    await expect(page.locator('#axl-pw')).toBeVisible();
    expect(await page.locator('#page-content .sec-files, #page-content .data-table').count(), k + ': content shown while locked').toBe(0);
  }
  /* wrong password → still locked */
  await page.evaluate(() => navigate('users'));
  await page.waitForSelector('#axl-pw');
  if (!(await page.locator('#axl-pw2').count())) {
    await page.fill('#axl-pw', 'not-the-password'); await page.click('.axl-go');
    await expect(page.locator('.axl-err')).toBeVisible({ timeout: 5000 });
  }
  await unlockSection(page);
  await expect(page.locator('#page-content')).toContainText('admin', { timeout: 10_000 });
  for (const k of ['security', 'settings', 'audit']) {                       // the same open window for the others
    await page.evaluate(k => navigate(k), k);
    await page.waitForTimeout(800);
    expect(await page.locator('#axl-pw').count(), k + ' still locked').toBe(0);
  }
  /* locking again (the audit log's lock button, on the audit page) closes them all */
  expect(await page.evaluate(() => currentPage)).toBe('audit');
  await page.evaluate(() => AXLock.lock('audit'));
  await expect(page.locator('#axl-pw')).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => navigate('users'));
  await expect(page.locator('#axl-pw')).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => navigate('security'));
  await expect(page.locator('#axl-pw')).toBeVisible({ timeout: 5000 });
  expect(errors).toEqual([]);
  expect(LOCK_PW.length).toBeGreaterThan(5);
});

/* ── «المزيد» on the computer ── */
test('«المزيد» on the computer: a smaller panel that opens with motion', async ({ app: page }) => {
  test.skip(!isDesktop(), 'desktop only');
  await page.click('#ax-more-fab');
  const first = await page.evaluate(() => { const p = document.querySelector('#mh-more .mh-panel'), cs = getComputedStyle(p);
    return { anim: cs.animationName, scale: new DOMMatrix(cs.transform).a }; });
  expect(first.anim).toBe('axMorePanelIn');
  expect(first.scale).toBeLessThan(0.9);                                    // starts small (grows out of the button)
  await expect.poll(() => page.evaluate(() => document.querySelector('#mh-more .mh-panel').getAnimations().filter(a => a.playState === 'running').length), { timeout: 5000 }).toBe(0);
  const done = await page.evaluate(() => { const r = document.querySelector('#mh-more .mh-panel').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), fits: r.top >= 0 && r.left >= 0 }; });
  expect(done.w).toBe(360);                                                 // was 430
  expect(done.fits).toBe(true);
  await page.evaluate(() => AXDeskMore.toggle());
});

/* ── «المبيعات» ── */
test.describe('«المبيعات»', () => {
  test.beforeAll(async ({ server }) => {
    const t = (await adminLogin(server.base)).token;
    const d = new Date(), ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const last = new Date(d.getFullYear(), d.getMonth() - 1, 15), lm = last.getFullYear() + '-' + String(last.getMonth() + 1).padStart(2, '0') + '-15';
    await send(server.base, t, ops({ cols: { issuances: col({ added: [
      { id: 'sl1', number: 7001, customerId: 'c2', customerName: 'مركز الشفاء', productId: 'p1', productName: 'ورق A3', quantity: 1000, unit: 'ورقة', unitPrice: 8.5, total: 8500, paid: 0, status: 'unpaid', date: ym + '-01', createdAt: 10, items: [] },
      { id: 'sl2', number: 7002, customerId: 'c1', customerName: 'مركز النور', productId: 'p1', productName: 'ورق A3', quantity: 250, unit: 'ورقة', unitPrice: 10, total: 2500, paid: 2500, status: 'paid', date: ym + '-01', createdAt: 11, items: [] },
      { id: 'sl3', number: 7003, customerId: 'c1', customerName: 'مركز النور', productId: 'p1', productName: 'ورق A3', quantity: 40, unit: 'ورقة', unitPrice: 10, total: 400, paid: 0, status: 'unpaid', date: lm, createdAt: 12, items: [] }
    ] }) } }));
  });

  test('in the menu right under «التحصيل والمديونيات», for whoever has «صرف الورق»', async ({ app: page }) => {
    const keys = await page.$$eval('#sidebar-nav .nav-item', els => els.map(e => /navigate\('([^']+)'\)/.exec(e.getAttribute('onclick'))[1]));
    expect(keys[keys.indexOf('payments') + 1]).toBe('sales');
    expect(await page.evaluate(() => can('sales') === can('issuances'))).toBe(true);
  });

  test('this month by default: the total, the count and the rows match the issuance records; sorting and periods work', async ({ app: page }) => {
    const errors = watchErrors(page);
    await page.evaluate(() => { AXSales.reset(); navigate('sales'); });
    await page.waitForFunction(() => currentPage === 'sales' && document.querySelector('#page-content .sl'));
    const want = await page.evaluate(() => { const t = todayStr(), from = t.slice(0, 8) + '01';
      const l = DB.data.issuances.filter(i => i.date >= from && i.date <= t); return { n: l.length, total: fmtCurrency(l.reduce((s, i) => s + i.total, 0)) }; });
    expect((await rows(page)).length).toBe(want.n);
    expect(await page.locator('#page-content').innerText()).toContain(want.total);
    expect(await rows(page)).toContain('#7001');
    expect(await rows(page)).not.toContain('#7003');                          // last month
    /* sort by quantity, small → big */
    await page.evaluate(() => { AXSales.sort('qty'); AXSales.sort('qty'); });
    const q = await page.evaluate(() => document.querySelector('#page-content .sl-m')
      ? Array.from(document.querySelectorAll('#page-content .sl-row')).map(c => Array.from(c.querySelectorAll('.sl-q')).reduce((s, e) => s + Number(e.textContent.replace(/,/g, '')), 0))
      : Array.from(document.querySelectorAll('#page-content .sl-rows > tr')).map(tr => Number((tr.children[4].textContent.match(/[\d,.]+/) || ['0'])[0].replace(/,/g, ''))));
    expect(q).toEqual(q.slice().sort((a, b) => a - b));
    /* other periods */
    await page.evaluate(() => AXSales.period('last'));
    expect(await rows(page)).toContain('#7003');
    await page.evaluate(() => AXSales.period('all'));
    expect((await rows(page)).length).toBe(await page.evaluate(() => DB.data.issuances.length));
    await page.evaluate(() => AXSales.reset());
    expect(errors).toEqual([]);
  });

  test('phone: the attached design — header (+ new · title · calendar / filter / search), total + period, list card with the count', async ({ app: page }) => {
    test.skip(isDesktop(), 'phone layout');
    const errors = watchErrors(page);
    await page.evaluate(() => { AXSales.reset(); navigate('sales'); });
    await page.waitForFunction(() => document.querySelector('#page-content .sl-m'));
    await expect(page.locator('.sl-m .sl-head .sl-new')).toBeVisible();
    await expect(page.locator('.sl-m .sl-title')).toContainText('المبيعات');
    expect(await page.locator('.sl-m .sl-tools .sl-tool').count()).toBe(3);
    await expect(page.locator('.sl-m .sl-sum .sl-total')).toContainText('إجمالي المبيعات');
    await expect(page.locator('#sl-period')).toHaveValue('month');
    await expect(page.locator('.sl-m .sl-chip')).toContainText(/عمليات? بيع/);
    expect(await page.$$eval('.sl-m .sl-sortbar .sl-sb', b => b.map(x => x.textContent.trim()))).toEqual(['التاريخ', 'نوع الورق', 'الكمية']);
    /* one card per sale: number, date, amount, center, and each paper type with its quantity — nothing wider than the phone */
    const card = page.locator('.sl-m .sl-row').first();
    for (const sel of ['.sl-no', '.sl-dt', '.sl-amt', '.sl-r-cu', '.sl-it .sl-pr', '.sl-it .sl-q']) await expect(card.locator(sel).first()).toBeVisible();
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
    /* Green Highlighter Marker: the total and the quantities get the green stroke */
    await expect(page.locator('.sl-m .sl-total-v.ax-hl.hlk-g, .sl-m .sl-total-v .ax-hl.hlk-g').first()).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.sl-m .sl-q.ax-hl.hlk-g, .sl-m .sl-q .ax-hl.hlk-g').first()).toBeAttached({ timeout: 5000 });
    /* search, filter, calendar */
    await page.click('.sl-m .sl-tool[aria-label="بحث"]');
    await page.fill('#sl-q', '7002');
    await expect.poll(() => rows(page)).toEqual(['#7002']);
    await page.evaluate(() => AXSales.toggleSearch());
    await page.click('.sl-m .sl-tool[aria-label="فلترة"]');
    await page.selectOption('#sl-m-cust', 'c2');
    await page.evaluate(() => AXSales.applyFilters());
    expect((await rows(page)).every(Boolean)).toBe(true);
    expect(await rows(page)).not.toContain('#7002');
    await page.evaluate(() => AXSales.clearFilters());
    await page.click('.sl-m .sl-tool[aria-label="فترة من تاريخ لتاريخ"]');
    await expect(page.locator('#sl-m-from')).toBeVisible();
    await page.evaluate(() => closeModal());
    /* tapping a row opens the sale */
    await page.locator('.sl-m .sl-row').first().click();
    await expect(page.locator('#modal-overlay')).toHaveClass(/show|active|open/, { timeout: 5000 });
    await page.evaluate(() => closeModal());
    expect(errors).toEqual([]);
  });

  test('phone: a sale with two paper types (same number, center and day) is one card with both lines', async ({ app: page }) => {
    test.skip(isDesktop(), 'phone layout');
    await page.evaluate(() => {
      const t = todayStr();
      DB.data.issuances.push(
        { id: 'sl_two_a', number: 7300, customerId: 'c1', customerName: 'مركز النور', productId: 'p1', productName: 'Green Tec - Black', quantity: 1, unit: 'علبة', unitPrice: 2500, total: 2500, paid: 0, status: 'unpaid', date: t, createdAt: Date.now(), items: [] },
        { id: 'sl_two_b', number: 7300, customerId: 'c1', customerName: 'مركز النور', productId: 'p1', productName: 'A3 - Photo ( 200 g ) - AGFA', quantity: 600, unit: 'ورقة', unitPrice: 8.5, total: 5100, paid: 0, status: 'unpaid', date: t, createdAt: Date.now() + 1, items: [] });
      AXSales.reset(); navigate('sales');
    });
    await page.waitForFunction(() => document.querySelector('#page-content .sl-m .sl-row'));
    expect((await rows(page)).filter(n => n === '#7300').length).toBe(1);
    const card = page.locator('.sl-m .sl-row', { hasText: '#7300' });
    expect(await card.locator('.sl-it').count()).toBe(2);
    await expect(card.locator('.sl-amt')).toContainText('7,600.00');
    await page.evaluate(() => { DB.data.issuances = DB.data.issuances.filter(i => i.number !== 7300); AXSales.render(); });
  });

  test('computer: like «الفواتير» — header, buttons, number boxes, filters, table with actions', async ({ app: page }) => {
    test.skip(!isDesktop(), 'computer layout');
    const errors = watchErrors(page);
    await page.evaluate(() => { AXSales.reset(); navigate('sales'); });
    await page.waitForFunction(() => document.querySelector('#page-content .sl-d'));
    for (const sel of ['.page-header .page-title', '.section-action-bar .btn-primary', '.kpi-bar .kpi', '.filter-bar #sl-q', '.table-wrap .data-table']) await expect(page.locator('#page-content ' + sel).first()).toBeVisible();
    expect(await page.locator('#page-content .kpi-bar .kpi').count()).toBe(4);
    expect(await page.locator('#page-content .data-table tbody tr').first().locator('.btn-icon').count()).toBeGreaterThanOrEqual(2);
    await page.selectOption('#sl-period', 'custom');
    await expect(page.locator('#sl-from')).toBeVisible();
    await page.evaluate(() => AXSales.reset());
    expect(errors).toEqual([]);
  });

  test('a sale added from this page appears here (the page does not turn into «صرف الورق»)', async ({ app: page, server }) => {
    await page.evaluate(() => { AXSales.reset(); navigate('sales'); });
    await page.waitForFunction(() => document.querySelector('#page-content .sl'));
    await page.evaluate(() => { DB.data.issuances.push({ id: 'sl_new', number: 7100, customerId: 'c1', customerName: 'مركز النور', productId: 'p1', productName: 'ورق A3', quantity: 5, unit: 'ورقة', unitPrice: 10, total: 50, paid: 0, status: 'unpaid', date: todayStr(), createdAt: Date.now(), items: [] }); DB.save(); renderIssuances(); });
    expect(await page.evaluate(() => currentPage)).toBe('sales');
    expect(await page.locator('#page-content .sl').count()).toBe(1);
    expect(await rows(page)).toContain('#7100');
    /* and from another device: live */
    const t = (await adminLogin(server.base)).token;
    await send(server.base, t, ops({ cols: { issuances: col({ added: [{ id: 'sl_live', number: 7101, customerId: 'c2', customerName: 'مركز الشفاء', productId: 'p1', productName: 'ورق A3', quantity: 3, unit: 'ورقة', unitPrice: 10, total: 30, paid: 0, status: 'unpaid', date: await page.evaluate(() => todayStr()), createdAt: Date.now(), items: [] }] }) } }));
    await expect.poll(() => rows(page), { timeout: 10_000 }).toContain('#7101');
  });

  test('a user without «صرف الورق» has no «المبيعات»', async ({ page, context, server }) => {
    await openSignedIn(page, context, server.base, (await login(server.base, 'keeper', 'Keep-Test-Pass-1')).token);
    expect(await page.evaluate(() => can('sales'))).toBe(false);
    expect(await page.locator('#sidebar-nav .nav-item[onclick*="\'sales\'"]').count()).toBe(0);
  });
});

/* ── 4.28 · glass bottom bar (phone) ── */
test('4.28 phone: the bottom bar is floating glass; the glowing capsule sits under the open tab and follows it', async ({ app: page }) => {
  test.skip(isDesktop(), 'phone only');
  const errors = watchErrors(page);
  const bar = await page.evaluate(() => { const n = document.getElementById('bottom-nav'), cs = getComputedStyle(n), r = n.getBoundingClientRect();
    return { radius: parseFloat(cs.borderTopLeftRadius), blur: (cs.backdropFilter || cs.webkitBackdropFilter || '').includes('blur'), left: r.left, right: innerWidth - r.right, bottomGap: innerHeight - r.bottom }; });
  expect(bar.radius).toBeGreaterThanOrEqual(24);
  expect(bar.blur).toBe(true);
  expect(bar.left).toBeGreaterThan(4); expect(bar.right).toBeGreaterThan(4); expect(bar.bottomGap).toBeGreaterThan(4);   // floating
  const under = () => page.evaluate(() => { const g = document.querySelector('#bottom-nav .bn-glass'), a = document.querySelector('#bottom-nav .bn-item.active');
    if (!g || !a) return null; const r1 = g.getBoundingClientRect(), r2 = a.getBoundingClientRect(); return { page: a.dataset.page, dx: Math.abs(r1.left - r2.left), dw: Math.abs(r1.width - r2.width), on: g.classList.contains('on') }; });
  for (const [k, tab] of [['customers', 'customers'], ['invoices', 'invoices'], ['sales', 'issuances'], ['dashboard', 'dashboard']]) {
    await page.evaluate(k => navigate(k), k);
    await expect.poll(async () => { const u = await under(); return u && u.on && u.page === tab && u.dx < 1.5 && u.dw < 1.5; }, { timeout: 5000 }).toBe(true);
  }
  /* a page that has no tab: no capsule */
  await page.evaluate(() => navigate('expenses'));
  await expect.poll(() => page.evaluate(() => document.querySelector('#bottom-nav .bn-glass').classList.contains('on')), { timeout: 5000 }).toBe(false);
  expect(errors).toEqual([]);
});

/* ── 4.29 · App Store style lens: drag across the bar, release opens the tab under the finger ── */
test('4.29 phone: pressing a tab grows the glass lens; dragging moves it; releasing opens the tab under the finger', async ({ app: page }) => {
  test.skip(isDesktop(), 'phone only');
  const errors = watchErrors(page);
  await page.evaluate(() => navigate('dashboard'));
  const box = async k => page.locator('#bottom-nav .bn-item[data-page="' + k + '"]').boundingBox();
  const from = await box('issuances'), to = await box('customers');
  const y = from.y + from.height / 2;
  await page.mouse.move(from.x + from.width / 2, y);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => document.querySelector('#bottom-nav .bn-glass').classList.contains('drag'))).toBe(true);
  expect(await page.evaluate(() => document.getElementById('bottom-nav').classList.contains('bn-dragging'))).toBe(true);
  const steps = 8;
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + from.width / 2 + (to.x - from.x) * i / steps, y);
  /* the tab under the finger lights up, nothing opens before release */
  await expect.poll(() => page.evaluate(() => (document.querySelector('#bottom-nav .bn-item.bn-hot') || {}).dataset?.page)).toBe('customers');
  expect(await page.evaluate(() => currentPage)).toBe('dashboard');
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => currentPage), { timeout: 5000 }).toBe('customers');
  await expect.poll(() => page.evaluate(() => { const g = document.querySelector('#bottom-nav .bn-glass'); return !g.classList.contains('drag') && !document.querySelector('#bottom-nav .bn-hot') && !document.getElementById('bottom-nav').classList.contains('bn-dragging'); })).toBe(true);
  /* the copies inside the lens are gone, and the tabs are not duplicated */
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#bottom-nav .bn-ghost').length)).toBe(0);
  expect(await page.locator('#bottom-nav .bn-item[data-page="customers"]').count()).toBe(1);
  /* the page opened once, not twice (no double navigation from the browser's own click) */
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => currentPage)).toBe('customers');
  /* a plain tap still works */
  const home = await box('dashboard');
  await page.mouse.click(home.x + home.width / 2, home.y + home.height / 2);
  await expect.poll(() => page.evaluate(() => currentPage), { timeout: 5000 }).toBe('dashboard');
  expect(errors).toEqual([]);
});

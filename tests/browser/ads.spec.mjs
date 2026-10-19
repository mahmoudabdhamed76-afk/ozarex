/* 4.41 · «الإعلانات 📢» screens: the admin section inside the locked Settings (stats, the two sample drafts,
   the editor with its live phone preview), publishing an ad makes it pop up in the app with a working wa.me link,
   a guide ad shows its checklist and «تمام، فهمت» to another user, and an ad's text never runs as HTML. */
import { test, expect, watchErrors, unlockSection, openSignedIn, SALES, ADMIN_PASSWORD } from './fixtures.mjs';
import { login, req } from '../helpers/api.mjs';

test.describe.configure({ mode: 'serial' });

const adminTok = async server => (await login(server.base, 'admin', ADMIN_PASSWORD)).token;
async function pauseAll(server) {
  const t = await adminTok(server);
  const r = await req(server.base, 'GET', '/api/ads', { token: t });
  for (const a of r.json.ads) if (a.status === 'active') await req(server.base, 'POST', '/api/ads/' + a.id + '/status', { token: t, body: { status: 'paused' } });
}

test('the admin publishes an ad from «الإعدادات ← الإعلانات» and it pops up in the app', async ({ app: page, server }, info) => {
  const errors = watchErrors(page);
  await pauseAll(server);
  await page.evaluate(() => navigate('settings'));
  await unlockSection(page);
  await page.locator('.axs-tab[data-g="ads"]').click();
  await expect(page.locator('.axad-card')).toBeVisible();
  await expect(page.locator('.axad-kpis')).toBeVisible();
  await expect(page.locator('.axad-row').first()).toBeVisible();
  await expect(page.locator('#axad-root')).toContainText('إعلان إرشادي — تحديث جديد');
  await expect(page.locator('#axad-root')).not.toContainText(/EMDADX/i);

  await page.locator('.axad-new .btn-primary').click();                                   // ＋ إعلان ترويجي
  await expect(page.locator('#axad-form')).toBeVisible();
  const title = 'عرض *الورق* ' + info.project.name;
  await page.fill('#axad-form [name="title"]', title);
  await page.fill('#axad-form [name="text"]', '<b>خصم</b> لحد آخر الشهر');
  await page.fill('#axad-form [name="wa"]', '01012345678');
  await page.fill('#axad-form [name="msg"]', 'عايز العرض');
  await page.fill('#axad-form [name="delaySec"]', '0');
  await expect(page.locator('#axad-frame .sad .sad-t')).toContainText('الورق');           // live preview follows the form
  await expect(page.locator('#axad-wa-hint')).toContainText('wa.me/201012345678');
  await page.locator('.modal-footer .btn-primary').click();                               // حفظ ونشر
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);

  const pop = page.locator('.sad.sad-ov:not(.pv)');
  await expect(pop).toBeVisible({ timeout: 15000 });
  await expect(pop.locator('.sad-t .sad-em')).toHaveText('الورق');                       // *word* → highlighted
  await expect(pop.locator('.sad-p')).toHaveText('<b>خصم</b> لحد آخر الشهر');            // plain text, not HTML
  await expect(pop.locator('a.sad-b.pri')).toHaveAttribute('href', /^https:\/\/wa\.me\/201012345678\?text=/);
  await expect(pop.locator('.sad-tag')).toContainText('OZAREX');
  await pop.locator('.sad-x').click();
  await expect(pop).toHaveCount(0);
  await expect.poll(async () => {
    const r = await req(server.base, 'GET', '/api/ads', { token: await adminTok(server) });
    const a = r.json.ads.find(x => x.title === title); return a ? a.stats.view + ':' + a.stats.close : '';
  }).toBe('1:1');
  await pauseAll(server);
  expect(errors).toEqual([]);
});

test('a guide ad reaches another user with its checklist and «تمام، فهمت»', async ({ page, context, server }, info) => {
  const t = await adminTok(server);
  await pauseAll(server);
  const r = await req(server.base, 'POST', '/api/ads', { token: t, body: { kind: 'guide', status: 'active', format: 'popup', delaySec: 0, frequency: 'every',
    title: 'تحديث ' + info.project.name, text: 'ضفنا *حاجات*', guide: { version: '4.41', items: ['أرباحي', 'الفلوس'], okLabel: 'تمام، فهمت' } } });
  expect(r.status).toBe(200);
  const tok = (await login(server.base, SALES.username, SALES.password)).token;                // a sales user, not the admin
  const errors = watchErrors(page);
  await openSignedIn(page, context, server.base, tok);
  const pop = page.locator('.sad.sad-guide:not(.pv)');
  await expect(pop).toBeVisible({ timeout: 15000 });
  await expect(pop.locator('.sad-list li')).toHaveCount(2);
  await expect(pop.locator('.sad-tag')).toContainText('4.41');
  await pop.locator('.sad-b', { hasText: 'تمام، فهمت' }).click();
  await expect(pop).toHaveCount(0);
  await req(server.base, 'POST', '/api/ads/' + r.json.ad.id + '/status', { token: t, body: { status: 'paused' } });
  expect(errors).toEqual([]);
});

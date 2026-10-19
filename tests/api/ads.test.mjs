/* 4.41 · Smart Ads Manager on the server: only the admin manages ads (everyone else gets 403), a signed-in user's
   feed holds only the active ads meant for them (audience, dates, max shows), views / clicks are counted in the
   stats, every field is cleaned (no HTML, no javascript: links, WhatsApp number normalised), and the two sample
   ads are OZAREX drafts nobody sees until the admin turns them on. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';
import { req, adminLogin, createUser, SALES } from '../helpers/api.mjs';

let s, admin, sales, acct;
const A = (tok, method, path, body) => req(s.base, method, '/api/ads' + path, { token: tok, body });

before(async () => {
  s = await startServer({ env: { ADS_VIEW_GAP_MS: '1000' } });     // the «same view again» window, short for the test (30 s in the app)
  admin = (await adminLogin(s.base)).token;
  sales = await createUser(s.base, admin, SALES);
  acct = await createUser(s.base, admin, { id: 'u_acct', username: 'acct', password: 'Acct-Test-Pass-1', name: 'محاسب', role: 'accountant' });
});
after(() => s.stop());

test('the sample ads are OZAREX drafts — no EMDADX name, and nobody gets them in their feed', async () => {
  const r = await A(admin, 'GET', '');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ads.length, 2);
  assert.ok(r.json.ads.every(a => a.status === 'draft'));
  assert.ok(!/emdad/i.test(JSON.stringify(r.json.ads)), 'the sale copy must not carry the EMDADX name');
  assert.ok(r.json.ads.some(a => a.kind === 'guide' && /OZAREX/.test(a.title)));
  const f = await A(sales, 'GET', '/feed');
  assert.equal(f.status, 200, f.text);
  assert.equal(f.json.ads.length, 0);
});

test('only the admin creates, edits, switches and deletes ads', async () => {
  for (const [m, p] of [['GET', ''], ['POST', ''], ['POST', '/settings']]) {
    const r = await A(sales, m, p, m === 'GET' ? undefined : { title: 'x' });
    assert.equal(r.status, 403, m + ' ' + p);
  }
  const c = await A(admin, 'POST', '', { title: 'عرض *أكتوبر*', text: '<img src=x onerror=alert(1)>', format: 'banner', position: 'top', status: 'active',
    cta: { label: 'كلمنا', wa: '01012345678', msg: 'عايز العرض' }, cta2: { label: 'اعرف أكتر', url: 'javascript:alert(1)' }, theme: { bg: 'red', accent: '#22c55e' } });
  assert.equal(c.status, 200, c.text);
  const ad = c.json.ad;
  assert.equal(ad.status, 'active');
  assert.equal(ad.cta.wa, '201012345678');                    // Egyptian local number → international
  assert.equal(ad.cta2.url, '');                              // javascript: dropped
  assert.equal(ad.theme.bg, '#16090C');                       // bad colour → the default
  assert.equal(ad.theme.accent, '#22C55E');
  assert.equal(ad.text, '<img src=x onerror=alert(1)>');      // kept as plain text, drawn with textContent
  assert.equal((await A(sales, 'PUT', '/' + ad.id, { title: 'هاك' })).status, 403);
  assert.equal((await A(sales, 'DELETE', '/' + ad.id)).status, 403);
  assert.equal((await A(admin, 'POST', '', { title: '   ' })).status, 400);
  const off = await A(admin, 'POST', '/' + ad.id + '/status', { status: 'paused' });
  assert.equal(off.json.ad.status, 'paused');
  const dup = await A(admin, 'POST', '/' + ad.id + '/duplicate');
  assert.equal(dup.json.ad.status, 'draft');
  assert.equal((await A(admin, 'DELETE', '/' + dup.json.ad.id)).status, 200);
  assert.equal((await A(admin, 'PUT', '/' + dup.json.ad.id, { title: 'x' })).status, 404);
});

test('the feed follows audience, dates and max shows; views and clicks reach the stats', async () => {
  const mk = async b => (await A(admin, 'POST', '', Object.assign({ status: 'active', format: 'popup' }, b))).json.ad;
  const all = await mk({ title: 'للكل', maxShows: 2 });
  const adm = await mk({ title: 'للمدير بس', audience: { mode: 'roles', roles: ['admin'] } });
  const old = await mk({ title: 'خلص', startAt: '2020-01-01', endAt: '2020-01-02' });
  const guide = await mk({ title: 'تحديث', kind: 'guide', guide: { items: 'نقطة 1\nنقطة 2\n', okLabel: 'تمام', actionLabel: 'جرّب', actionPage: 'profit' } });
  assert.deepEqual(guide.guide.items, ['نقطة 1', 'نقطة 2']);
  let ids = (await A(sales, 'GET', '/feed')).json.ads.map(a => a.id);
  assert.ok(ids.includes(all.id) && ids.includes(guide.id));
  assert.ok(!ids.includes(adm.id) && !ids.includes(old.id));
  assert.ok((await A(admin, 'GET', '/feed')).json.ads.some(a => a.id === adm.id));
  const feedAd = (await A(sales, 'GET', '/feed')).json.ads.find(a => a.id === all.id);
  assert.equal(feedAd.audience, undefined);                   // who else it targets is not shown to a user
  assert.equal(feedAd.name, undefined);

  assert.equal((await A(sales, 'POST', '/event', { id: all.id, type: 'view' })).status, 200);
  assert.equal((await A(sales, 'POST', '/event', { id: all.id, type: 'click' })).status, 200);
  assert.equal((await A(sales, 'POST', '/event', { id: all.id, type: 'bogus' })).status, 400);
  await new Promise(r => setTimeout(r, 1600));               // past the «same view again» window
  await A(sales, 'POST', '/event', { id: all.id, type: 'view' });
  ids = (await A(sales, 'GET', '/feed')).json.ads.map(a => a.id);
  assert.ok(!ids.includes(all.id), 'seen twice = max shows reached');
  const st = (await A(admin, 'GET', '')).json.ads.find(a => a.id === all.id).stats;
  assert.equal(st.view, 2); assert.equal(st.click, 1); assert.equal(st.reach, 1); assert.equal(st.ctr, 50);
  await A(admin, 'POST', '/' + all.id + '/reset-stats');
  assert.equal((await A(admin, 'GET', '')).json.ads.find(a => a.id === all.id).stats.view, 0);
});

test('the default WhatsApp number is cleaned and given to every feed', async () => {
  const r = await A(admin, 'POST', '/settings', { defaultWa: '+20 101 234 5678' });
  assert.equal(r.json.defaultWa, '201012345678');
  assert.equal((await A(sales, 'GET', '/feed')).json.defaultWa, '201012345678');
  assert.equal((await A(admin, 'POST', '/settings', { defaultWa: 'abc' })).json.defaultWa, '');
});

test('signed out: no feed', async () => {
  assert.equal((await req(s.base, 'GET', '/api/ads/feed', {})).status, 401);
});

const wait = ms => new Promise(r => setTimeout(r, ms));
const ev = (tok, id, type, imp) => A(tok, 'POST', '/event', imp ? { id, type, imp } : { id, type });

test('4.42 · no duplicate or false counts: same showing, too soon, click with no view, paused / not-for-you ads', async () => {
  const ad = (await A(admin, 'POST', '', { title: 'عدّ دقيق', status: 'active' })).json.ad;
  const mine = (await A(admin, 'POST', '', { title: 'للمدير بس', status: 'active', audience: { mode: 'roles', roles: ['admin'] } })).json.ad;
  const draft = (await A(admin, 'POST', '', { title: 'مسودة', status: 'draft' })).json.ad;
  const counted = async (...a) => (await ev(...a)).json.counted;

  assert.equal(await counted(sales, ad.id, 'click', 'imp-aaaaaaaa'), false, 'a click before any view is false');
  assert.equal(await counted(sales, ad.id, 'view', 'imp-aaaaaaaa'), true);
  assert.equal(await counted(sales, ad.id, 'view', 'imp-bbbbbbbb'), false, 'a second view right away (another tab / refresh) is the same view');
  await wait(1600);
  assert.equal(await counted(sales, ad.id, 'view', 'imp-aaaaaaaa'), false, 'the same showing replayed never counts again');
  assert.equal(await counted(sales, ad.id, 'click', 'imp-zzzzzzzz'), false, 'a click on a showing that was never viewed');
  assert.equal(await counted(sales, ad.id, 'click', 'imp-aaaaaaaa'), true);
  await wait(1600);
  assert.equal(await counted(sales, ad.id, 'click', 'imp-aaaaaaaa'), false, 'one click per showing');
  assert.equal(await counted(sales, mine.id, 'view', 'imp-cccccccc'), false, 'not meant for this user');
  assert.equal(await counted(sales, draft.id, 'view', 'imp-dddddddd'), false, 'a draft is never counted');
  await A(admin, 'POST', '/' + ad.id + '/status', { status: 'paused' });
  await wait(1600);
  assert.equal(await counted(sales, ad.id, 'view', 'imp-eeeeeeee'), false, 'a paused ad is never counted');
  await A(admin, 'POST', '/' + ad.id + '/status', { status: 'active' });
  assert.equal(await counted(sales, ad.id, 'view', 'imp-ffffffff'), true, 'a new showing later is a new view');
  const st = (await A(admin, 'GET', '')).json.ads.find(a => a.id === ad.id).stats;
  assert.equal(st.view, 2); assert.equal(st.click, 1);
  await A(admin, 'POST', '/' + ad.id + '/status', { status: 'paused' });
  await A(admin, 'POST', '/' + mine.id + '/status', { status: 'paused' });
});

test('4.42 · «مين شافه»: one line per user (name, views, last view), unique viewers, who has not seen it — admin only', async () => {
  const ad = (await A(admin, 'POST', '', { title: 'تقرير المشاهدات', status: 'active', audience: { mode: 'roles', roles: ['sales', 'accountant'] } })).json.ad;
  assert.equal((await ev(sales, ad.id, 'view', 'imp-s0000001')).json.counted, true);
  await wait(1600);
  assert.equal((await ev(sales, ad.id, 'view', 'imp-s0000002')).json.counted, true);
  await wait(1600);
  assert.equal((await ev(sales, ad.id, 'view', 'imp-s0000003')).json.counted, true);
  assert.equal((await ev(sales, ad.id, 'close', 'imp-s0000003')).json.counted, true);
  assert.equal((await A(sales, 'GET', '/' + ad.id + '/viewers')).status, 403);
  let r = await A(admin, 'GET', '/' + ad.id + '/viewers');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.totals.unique, 1);
  assert.equal(r.json.totals.views, 3);
  assert.equal(r.json.people[0].username, 'sara');
  assert.equal(r.json.people[0].name, SALES.name);
  assert.equal(r.json.people[0].views, 3);
  assert.equal(r.json.people[0].closes, 1);
  assert.ok(r.json.people[0].last >= r.json.people[0].first && r.json.people[0].last > Date.now() - 60000);
  assert.deepEqual(r.json.notSeen.map(u => u.username), ['acct'], 'the accountant is targeted and has not seen it; the admin is not targeted');
  assert.equal(r.json.recent[0].type, 'close');
  assert.equal((await ev(acct, ad.id, 'view', 'imp-a0000001')).json.counted, true);
  r = await A(admin, 'GET', '/' + ad.id + '/viewers');
  assert.equal(r.json.totals.unique, 2); assert.equal(r.json.totals.views, 4); assert.equal(r.json.totals.avg, 2);
  assert.equal(r.json.notSeen.length, 0);
  assert.deepEqual(r.json.people.map(p => p.username), ['sara', 'acct']);   // most views first
  assert.equal((await A(admin, 'GET', '/ad_nope/viewers')).status, 404);
});

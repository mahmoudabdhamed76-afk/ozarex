/* Phase 4 · the sync race: a local edit made while a pull (refresh) is downloading must never be lost,
   and must reach the server exactly once. The pull's response is HELD inside the page (installGate) until
   the edit is made, so each race happens exactly — not by luck of timing. */
import { test, expect, watchErrors, installGate, gate, heldCount, releaseAll, gateStats } from './fixtures.mjs';
import { adminLogin, req, send, ops, col } from '../helpers/api.mjs';

const uid = () => test.info().project.name.slice(0, 3) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const OFFLINE_NET = /\[Sync\] pull failed: TypeError: Failed to fetch/;

async function serverData(base) { return (await req(base, 'GET', '/api/data', { token: (await adminLogin(base)).token })).json; }
const countOn = (d, id) => d.customers.filter(c => c.id === id).length;
async function otherDeviceAdds(base, ids) {
  const t = (await adminLogin(base)).token;
  const r = await send(base, t, ops({ cols: { customers: col({ added: ids.map(id => ({ id, name: 'جهاز تاني ' + id, balance: 0, customPrices: {} })) }) } }));
  expect(r.status).toBe(200);
}
const onDevice = (page, id) => page.evaluate(i => DB.data.customers.filter(c => c.id === i).length, id);
/* nothing left to do on the device: no held / running request, no save waiting, nothing queued, nothing unsent */
async function settled(page) {
  await expect.poll(() => page.evaluate(() => {
    const g = window.__gate;
    return g.started.data === g.done.data && g.started.ops === g.done.ops && !DB._saveTimer && !DB._saveInflight &&
      OfflineManager.pending === 0 && !OfflineManager._debug().diff;
  }), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(700);                              // a pull scheduled right at the end has run too
  await expect.poll(() => page.evaluate(() => { const g = window.__gate; return g.started.data === g.done.data && !DB._saveTimer && !DB._saveInflight; }), { timeout: 20_000 }).toBe(true);
}
/* a pull triggered by another device is being downloaded and its answer is held */
async function holdAPull(page, base, otherIds) {
  await gate(page, 'data', true);
  await otherDeviceAdds(base, otherIds);
  await expect.poll(() => heldCount(page, 'data'), { timeout: 10_000 }).toBeGreaterThan(0);
}
async function letPullsThrough(page) { await gate(page, 'data', false); await releaseAll(page, 'data'); }
const addLocal = (page, id, save = true) => page.evaluate(([i, s]) => { DB.data.customers.push({ id: i, name: 'من الجهاز ده ' + i, balance: 0, customPrices: {} }); if (s) DB.save(); }, [id, save]);

test.beforeEach(async ({ app: page }) => { await page.waitForTimeout(1200); await installGate(page); });

for (const mode of ['saved and already sent', 'saved, send still waiting', 'not saved yet (autosave would)']) {
  test(`race 1 · an edit made during an active pull is kept and sent once — ${mode}`, async ({ app: page, server }) => {
    const errors = watchErrors(page);
    const other = 'o' + uid(), mine = 'm' + uid();
    await holdAPull(page, server.base, [other]);
    await addLocal(page, mine, mode !== 'not saved yet (autosave would)');
    if (mode === 'saved and already sent') await expect.poll(async () => countOn(await serverData(server.base), mine), { timeout: 10_000 }).toBe(1);
    await letPullsThrough(page);                               // the old answer (without my edit) arrives now
    await settled(page);
    expect(await onDevice(page, mine)).toBe(1);
    await expect.poll(() => onDevice(page, other), { timeout: 10_000 }).toBe(1);
    const d = await serverData(server.base);
    expect(countOn(d, mine)).toBe(1);
    expect(countOn(d, other)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('race 2 · several edits (adds + field edits, saved and not) during one active pull — all kept, all sent', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const base = 'b' + uid();
  await otherDeviceAdds(server.base, [base]);                 // a record this device will edit
  await expect.poll(() => onDevice(page, base), { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(500);
  const other = 'o' + uid(), mine = [1, 2, 3].map(i => 'm' + i + uid());
  await holdAPull(page, server.base, [other]);
  await addLocal(page, mine[0]);
  await page.waitForTimeout(400);
  await addLocal(page, mine[1], false);
  await page.evaluate(b => { DB.data.customers.find(c => c.id === b).phone = '01099998888'; DB.save(); }, base);
  await expect.poll(async () => countOn(await serverData(server.base), mine[1]), { timeout: 10_000 }).toBe(1);   // that save has gone out
  await addLocal(page, mine[2], false);                         // these two are only in memory when the old answer lands
  await page.evaluate(() => { DB.data.customers.find(c => c.id === 'c2').address = 'عنوان اتعدل أثناء التحديث'; });
  await letPullsThrough(page);
  await settled(page);
  const d = await serverData(server.base);
  for (const id of mine) { expect(countOn(d, id), id).toBe(1); expect(await onDevice(page, id), id).toBe(1); }
  expect(d.customers.find(c => c.id === base).phone).toBe('01099998888');
  expect(d.customers.find(c => c.id === 'c2').address).toBe('عنوان اتعدل أثناء التحديث');
  expect(await page.evaluate(b => DB.data.customers.find(c => c.id === b).phone, base)).toBe('01099998888');
  expect(countOn(d, other)).toBe(1);
  await expect.poll(() => onDevice(page, other), { timeout: 10_000 }).toBe(1);
  expect(errors).toEqual([]);
});

test('race 3 · another device changes data while this device is saving — both changes end up on both sides', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const other = 'o' + uid(), mine = 'm' + uid();
  await gate(page, 'ops', true);                               // the server has my save, but its answer is held
  await addLocal(page, mine);
  await expect.poll(() => heldCount(page, 'ops'), { timeout: 10_000 }).toBe(1);
  await otherDeviceAdds(server.base, [other]);                 // → live notice → pull while my save is "in flight"
  await page.waitForTimeout(800);
  await gate(page, 'ops', false); await releaseAll(page, 'ops');
  await settled(page);
  expect(await onDevice(page, mine)).toBe(1);
  await expect.poll(() => onDevice(page, other), { timeout: 10_000 }).toBe(1);
  const d = await serverData(server.base);
  expect(countOn(d, mine)).toBe(1); expect(countOn(d, other)).toBe(1);
  expect(errors).toEqual([]);
});

test('race 4 · several refresh notices arrive during one pull — none is dropped, the local edit survives', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const others = [1, 2, 3, 4, 5].map(i => 'o' + i + uid()), mine = 'm' + uid();
  await holdAPull(page, server.base, [others[0]]);
  for (const [i, id] of others.slice(1).entries()) {
    await otherDeviceAdds(server.base, [id]);
    if (i === 1) await addLocal(page, mine);
    await page.waitForTimeout(150);
  }
  await letPullsThrough(page);
  await settled(page);
  for (const id of others) await expect.poll(() => onDevice(page, id), { timeout: 10_000 }).toBe(1);
  expect(await onDevice(page, mine)).toBe(1);
  expect(countOn(await serverData(server.base), mine)).toBe(1);
  expect(errors).toEqual([]);
});

test('race 5 · a balance edit made during a pull is applied exactly once (deltas would double if sent twice)', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const acct = 'bal' + uid();
  await otherDeviceAdds(server.base, [acct]);
  await expect.poll(() => onDevice(page, acct), { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(500);
  await holdAPull(page, server.base, ['o' + uid()]);
  await page.evaluate(a => { DB.data.customers.find(c => c.id === a).balance += 100; DB.save(); }, acct);
  await expect.poll(async () => (await serverData(server.base)).customers.find(c => c.id === acct).balance, { timeout: 10_000 }).toBe(100);
  await page.evaluate(a => { DB.data.customers.find(c => c.id === a).balance += 50; }, acct);   // not saved yet
  await letPullsThrough(page);
  await settled(page);
  await page.waitForTimeout(1500);
  expect((await serverData(server.base)).customers.find(c => c.id === acct).balance).toBe(150);
  expect(await page.evaluate(a => DB.data.customers.find(c => c.id === a).balance, acct)).toBe(150);
  const g = await gateStats(page);
  expect(g.started.ops).toBeLessThanOrEqual(3);               // the two edits (+ at most one empty autosave) — no resends
  expect(errors).toEqual([]);
});

test('race 8 · an invoice renumbered by the server while a refresh is running ends with the server\'s number, once', async ({ app: page, server }) => {
  const errors = watchErrors(page);
  const next = await page.evaluate(() => (DB.data.counters.invoice || 1000) + 1);
  const theirs = 'inv_o' + uid(), mine = 'inv_m' + uid();
  await gate(page, 'data', true);
  const t = (await adminLogin(server.base)).token;
  expect((await send(server.base, t, ops({ cols: { invoices: col({ added: [{ id: theirs, number: next, customerId: 'c2', date: '2026-10-06', total: 1, paid: 0, items: [] }] }) }, counters: { invoice: next } }))).status).toBe(200);
  await expect.poll(() => heldCount(page, 'data'), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.evaluate(([id, n]) => { DB.data.invoices.push({ id, number: n, customerId: 'c1', date: '2026-10-06', total: 2, paid: 0, items: [], createdAt: Date.now() }); DB.data.counters.invoice = n; DB.save(); }, [mine, next]);
  await page.waitForTimeout(500);
  await letPullsThrough(page);
  await settled(page);
  const d = await serverData(server.base);
  const given = d.invoices.filter(i => i.id === mine);
  expect(given.length).toBe(1);
  expect(given[0].number).toBeGreaterThan(next);
  await expect.poll(() => page.evaluate(id => (DB.data.invoices.find(i => i.id === id) || {}).number, mine), { timeout: 10_000 }).toBe(given[0].number);
  const nums = d.invoices.map(i => i.number).filter(n => n !== null && n !== undefined && n !== '').map(Number);
  expect(nums.filter((n, i) => nums.indexOf(n) !== i), 'duplicate invoice numbers').toEqual([]);
  expect(errors).toEqual([]);
});

test('race 6/9 · offline changes + a live refresh while they are being sent — nothing disappears, each sent once', async ({ app: page, server, context }) => {
  const errors = watchErrors(page, { allow: OFFLINE_NET });
  const mine = ['q1' + uid(), 'q2' + uid()], other = 'o' + uid();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  for (const id of mine) { await addLocal(page, id); await page.waitForTimeout(400); }
  await expect.poll(() => page.evaluate(() => OfflineManager.pending), { timeout: 10_000 }).toBe(2);
  await otherDeviceAdds(server.base, [other]);                 // happened on the server while this device was offline
  /* watch the device's own records every 20 ms from now on: they must never vanish, not even for a moment */
  await page.evaluate(ids => { window.__gone = 0; window.__watch = setInterval(() => { const ok = ids.every(i => DB.data.customers.some(c => c.id === i)); if (!ok) window.__gone++; if (ok !== window.__lastOk) { (window.__gate.log ||= []).push([Math.round(performance.now()), 'visible', ok, OfflineManager.pending, OfflineManager.busy]); window.__lastOk = ok; } }, 20); }, mine);
  await gate(page, 'ops', true);                               // sending the queue is slow…
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => heldCount(page, 'ops'), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.evaluate(() => SyncEngine.pullLatest('test-live-refresh', true));   // …and a live refresh comes in meanwhile
  await page.waitForTimeout(1500);
  await gate(page, 'ops', false); await releaseAll(page, 'ops');
  await settled(page);
  await expect.poll(() => onDevice(page, other), { timeout: 15_000 }).toBe(1);
  const gone = await page.evaluate(() => { clearInterval(window.__watch); return window.__gone; });
  if (gone) console.log('[timeline]', JSON.stringify(await page.evaluate(() => window.__gate.log)));
  expect(gone, 'times the queued records were missing on the device').toBe(0);
  const d = await serverData(server.base);
  for (const id of mine) expect(countOn(d, id), id).toBe(1);
  expect(errors).toEqual([]);
});

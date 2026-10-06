/* Phase 5 · profile one page of the app with the large dataset (test tooling, not shipped).
   node bench/page-profile.mjs [page=issuances] [--small] [--top=40] [--app=/other/checkout]
   Prints: time until usable, render-function time, DOM nodes, long tasks, JS heap, and the
   functions with the most self time (CPU profile via the Chrome DevTools Protocol). */
import { chromium } from '@playwright/test';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { adminLogin, login, req } from '../helpers/api.mjs';
import { loadLargeDataset } from '../fixtures/load.mjs';
import { seedSmall } from '../browser/fixtures.mjs';

const args = process.argv.slice(2);
const pageKey = args.find(a => !a.startsWith('--')) || 'issuances';
const small = args.includes('--small');
const top = +((args.find(a => a.startsWith('--top=')) || '--top=40').slice(6));
const noProfile = args.includes('--no-profile');
const app = (args.find(a => a.startsWith('--app=')) || '').slice(6);
const runs = +((args.find(a => a.startsWith('--runs=')) || '--runs=1').slice(7));

const env = app ? { ERP_APP_ROOT: app } : {};
if (app) process.env.ERP_APP_ROOT = app;
const srv = await startServer({ env });
try {
  if (small) await seedSmall(srv.base);
  else {
    const t = (await adminLogin(srv.base)).token;
    const r = await req(srv.base, 'POST', '/api/data', { token: t, body: loadLargeDataset() });
    if (r.status !== 200) throw new Error('restore ' + r.status);
  }
  const browser = await chromium.launch();
  const out = [];
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
    const token = (await login(srv.base, 'admin', ADMIN_PASSWORD)).token;
    await context.addCookies([{ name: 'emx_sid', value: token, domain: new URL(srv.base).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.addInitScript(t => {
      localStorage.setItem('emx_tok', t);
      window.__long = [];
      try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch (_) { /* no longtask API */ }
    }, token);
    page.on('pageerror', e => console.error('pageerror:', e.message));
    const t0 = Date.now();
    await page.goto(srv.base + '/');
    await page.waitForFunction(() => { const a = document.getElementById('app'), pc = document.getElementById('page-content'); return a && getComputedStyle(a).display !== 'none' && pc && pc.children.length > 0; }, null, { timeout: 120_000 });
    const firstScreenMs = Date.now() - t0;
    await page.waitForTimeout(2500);                                   // first save / stream settle
    const cdp = await context.newCDPSession(page);
    if (!noProfile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
    await page.evaluate(() => { window.__long = []; });
    /* usable = from navigate() until the main thread has answered every 20 ms tick on time (gap < 100 ms)
       for 500 ms in a row — i.e. rendering, layout and every follow-up effect are done */
    const windowMs = +((args.find(a => a.startsWith('--window=')) || '--window=0').slice(9));
    if (windowMs) { await page.evaluate(k => { setTimeout(() => navigate(k), 0); }, pageKey); await new Promise(r => setTimeout(r, windowMs)); }
    const usableMs = windowMs ? -2 : await page.evaluate(k => new Promise(done => {
      const t0 = performance.now(); let last = t0, calm = t0;
      navigate(k);
      const tick = () => {
        const now = performance.now();
        if (now - last > 100) calm = now;
        last = now;
        if (currentPage === k && now - calm > 500) return done(Math.round(calm - t0));
        if (now - t0 > 150000) return done(-1);
        setTimeout(tick, 20);
      };
      setTimeout(tick, 20);
    }), pageKey);
    /* --scroll: keep scrolling to the end of a stepped list until every row is on screen; report the jank */
    let scroll = null;
    if (args.includes('--scroll')) {
      scroll = await page.evaluate(maxSteps => new Promise(done => {
        window.__long = []; const t0 = performance.now(); let steps = 0, maxGap = 0, last = performance.now(); const per = []; let ts = performance.now();
        const hb = setInterval(() => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 16);
        const go = () => {
          const m = document.querySelector('[id$="-more"]');
          const nrows = document.querySelectorAll('#page-content .data-table tbody > tr').length;
          if (steps) { per.push([nrows, Math.round(performance.now() - ts)]); }
          ts = performance.now();
          if (!m || steps >= maxSteps) { clearInterval(hb); return setTimeout(() => done({ ms: Math.round(performance.now() - t0), steps, per, maxGapMs: Math.round(maxGap), rows: document.querySelectorAll('#page-content .data-table tbody > tr').length, longTasks: window.__long.length, blockingMs: window.__long.reduce((s, d) => s + Math.max(0, d - 50), 0), longest: Math.max(0, ...window.__long) }), 1500); }
          steps++; window.scrollTo(0, document.documentElement.scrollHeight); m.scrollIntoView({ block: 'end' });
          requestAnimationFrame(() => setTimeout(go, 50));
        };
        go();
      }), +((args.find(a => a.startsWith('--steps=')) || '--steps=1000').slice(8)));
    }
    let profile = null;
    if (!noProfile) profile = (await cdp.send('Profiler.stop', undefined)).profile;
    await page.waitForTimeout(600);
    const m = await page.evaluate(k => {
      const R = { issuances: renderIssuances, invoices: renderInvoices, payments: renderPayments, customers: renderCustomers, dashboard: renderDashboard };
      const t = performance.now(); if (R[k]) R[k](); const renderMs = Math.round(performance.now() - t);
      return { renderMs, domNodes: document.getElementsByTagName('*').length, pageNodes: document.getElementById('page-content').getElementsByTagName('*').length,
        longTasks: window.__long.slice(), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
    }, pageKey);
    const longest = m.longTasks.length ? Math.max(...m.longTasks) : 0;
    const blocking = m.longTasks.reduce((s, d) => s + Math.max(0, d - 50), 0);
    out.push({ scroll, page: pageKey, dataset: small ? 'small' : 'large', firstScreenMs, usableMs, renderMs: m.renderMs, domNodes: m.domNodes, pageNodes: m.pageNodes, longestTaskMs: longest, blockingMs: blocking, heapMB: m.heapMB });
    if (profile && run === 0) {
      const byId = new Map(profile.nodes.map(n => [n.id, n]));
      const self = new Map();
      const dt = profile.timeDeltas; let total = 0;
      profile.samples.forEach((id, i) => {
        const n = byId.get(id), cf = n.callFrame;
        const key = (cf.functionName || '(anon)') + '  ' + (cf.url ? cf.url.replace(srv.base, '') : '') + ':' + (cf.lineNumber + 1);
        self.set(key, (self.get(key) || 0) + (dt[i] || 0)); total += dt[i] || 0;
      });
      /* inclusive time per function (each sample counted once per distinct function on its stack) */
      const parent = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
      const incl = new Map();
      profile.samples.forEach((id, i) => {
        const seen = new Set(); let cur = id;
        while (cur) { const cf = byId.get(cur).callFrame; const key = (cf.functionName || '(anon)') + '  ' + (cf.url ? cf.url.replace(srv.base, '') : '') + ':' + (cf.lineNumber + 1);
          if (!seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) || 0) + (dt[i] || 0)); } cur = parent.get(cur); }
      });
      const fmt = ([k, v]) => (v / 1000).toFixed(0).padStart(7) + ' ms  ' + k;
      console.log('\n── self time (top ' + top + ', total ' + (total / 1000).toFixed(0) + ' ms) ──');
      [...self].sort((a, b) => b[1] - a[1]).slice(0, top).forEach(e => console.log(fmt(e)));
      console.log('\n── inclusive time (top ' + top + ') ──');
      [...incl].sort((a, b) => b[1] - a[1]).slice(0, top).forEach(e => console.log(fmt(e)));
    }
    await context.close();
  }
  console.log('\n[result]', JSON.stringify(out));
  await browser.close();
} finally { await srv.stop(); }

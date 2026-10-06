/* Phase 6 · which element makes a page wider than the screen? (test tooling, not shipped)
   node bench/layout-probe.mjs [--widths=1920x1080,1366x768] [--pages=issuances,users] [--large]
   For each page: the page's extra width, then the outermost elements that stick out of the viewport and are
   not inside a box that scrolls sideways itself — with the CSS that explains why. */
import { chromium } from '@playwright/test';
import { startServer, ADMIN_PASSWORD } from '../helpers/server.mjs';
import { login, adminLogin, req } from '../helpers/api.mjs';
import { seedSmall, PAGES } from '../browser/fixtures.mjs';
import { loadLargeDataset } from '../fixtures/load.mjs';

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const widths = arg('widths', '1920x1080,1600x900,1440x900,1366x768,1280x720').split(',').map(s => s.split('x').map(Number));
const pages = arg('pages', Object.keys(PAGES).join(',')).split(',');
const app = arg('app', '');
if (app) process.env.ERP_APP_ROOT = app;
const srv = await startServer();
if (process.argv.includes('--large')) await req(srv.base, 'POST', '/api/data', { token: (await adminLogin(srv.base)).token, body: loadLargeDataset() });
else await seedSmall(srv.base);
const b = await chromium.launch();
const summary = {};
for (const [w, h] of widths) {
  const c = await b.newContext({ viewport: { width: w, height: h }, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
  const tok = (await login(srv.base, 'admin', ADMIN_PASSWORD)).token;
  await c.addCookies([{ name: 'emx_sid', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const p = await c.newPage(); await p.addInitScript(x => localStorage.setItem('emx_tok', x), tok);
  await p.goto(srv.base + '/');
  await p.waitForFunction(() => document.getElementById('page-content') && document.getElementById('page-content').children.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  for (const k of pages) {
    await p.evaluate(k => navigate(k), k); await p.waitForFunction(k => currentPage === k, k); await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const W = window.innerWidth, over = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - W;
      const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
      const path = e => { const out = []; for (let x = e; x && x !== document.body && out.length < 6; x = x.parentElement) out.unshift(name(x)); return out.join(' > '); };
      const scrollsX = e => { const s = getComputedStyle(e); return /(auto|scroll|hidden|clip)/.test(s.overflowX) && e !== document.documentElement && e !== document.body; };
      const out = [];
      if (over > 1) {
        for (const e of document.body.getElementsByTagName('*')) {
          const r = e.getBoundingClientRect();
          if (!r.width || (r.left >= -1 && r.right <= W + 1)) continue;
          const cs = getComputedStyle(e);
          if (cs.position === 'fixed' && (cs.visibility === 'hidden' || cs.opacity === '0')) continue;
          let clipped = false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (scrollsX(a)) { clipped = true; break; }
          if (clipped) continue;
          /* outermost only: skip if the parent also sticks out the same way */
          const pr = e.parentElement && e.parentElement.getBoundingClientRect();
          if (pr && e.parentElement !== document.body && (pr.left < -1 || pr.right > W + 1)) continue;
          out.push({ el: path(e), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
            css: { w: cs.width, minW: cs.minWidth, flex: cs.flex, ws: cs.whiteSpace, pos: cs.position, disp: cs.display, gtc: cs.gridTemplateColumns !== 'none' ? cs.gridTemplateColumns.slice(0, 80) : undefined } });
          if (out.length >= 6) break;
        }
      }
      return { over, out };
    });
    summary[w + 'x' + h] = summary[w + 'x' + h] || {};
    summary[w + 'x' + h][k] = r.over;
    if (r.over > 1) { console.log(`\n■ ${w}x${h} ${k}: +${r.over}px`); r.out.forEach(o => console.log('   ', JSON.stringify(o))); }
  }
  await c.close();
}
console.log('\n[summary]', JSON.stringify(Object.fromEntries(Object.entries(summary).map(([v, m]) => [v, Object.entries(m).filter(([, o]) => o > 1)]))));
await b.close(); await srv.stop();

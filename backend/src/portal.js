'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · لينك المركز — /c/<code> (و /p/<token> القديم)
   صفحة لمركز واحد من غير تسجيل دخول: المستحق وأعمار الدين، وكل شهر
   سحب كام (كميات الورق مجمّعة) واتحصّل منه كام، ورسم بياني للسنة،
   وفواتير الشهر، وكشف الحساب — وكمان «اطلب ورق» يوصل للبرنامج في
   «متابعة العملاء» بإشعار. الكود في settings._portal والأدمن يوقفه في أي وقت.
   الأرقام من js/axcore.js — نفس كود البرنامج.
════════════════════════════════════════════════════════════════════ */
const path = require('node:path');
const zlib = require('node:zlib');
const AX = require(process.env.PUBLIC_DIR ? path.join(process.env.PUBLIC_DIR, 'js', 'axcore.js') : path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'axcore.js'));
const { db } = require('../db');

/* 4.74 · طلبات الورق من المراكز */
db.exec(`CREATE TABLE IF NOT EXISTS portal_req (
  id INTEGER PRIMARY KEY AUTOINCREMENT, branch TEXT, branch_name TEXT, customer_id TEXT NOT NULL, customer_name TEXT,
  items TEXT NOT NULL, note TEXT, contact TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL,
  seen_at TEXT, done_at TEXT, done_by TEXT, reply TEXT
);
CREATE INDEX IF NOT EXISTS ix_portal_req ON portal_req (customer_id, id);
CREATE INDEX IF NOT EXISTS ix_portal_req_st ON portal_req (status, id);`);
try { if (!db.prepare('PRAGMA table_info(portal_req)').all().some(c => c.name === 'kind')) db.exec("ALTER TABLE portal_req ADD COLUMN kind TEXT NOT NULL DEFAULT 'order'"); } catch (e) { console.error('[portal] kind', e.message); }
db.exec('CREATE TABLE IF NOT EXISTS portal_photo (id INTEGER PRIMARY KEY AUTOINCREMENT, req_id INTEGER NOT NULL, mime TEXT, data BLOB NOT NULL, created_at TEXT); CREATE INDEX IF NOT EXISTS ix_portal_photo ON portal_photo (req_id, id);');
const MSTATUS = { new: 'اتبعت — مستني فني', ok: 'اتحوّل لفني — جاي', sent: 'اتصلحت ✓', no: 'اتلغى' };
const DEVICES = ['طابعة', 'جهاز الأشعة', 'كمبيوتر / سيستم', 'حاجة تانية'];
const STATUS = { new: 'اتبعت — مستني التأكيد', ok: 'اتأكد — بيتجهز', sent: 'اتسلّم ✓', no: 'اتلغى' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const n0 = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
function cur(s) { const c = (s && s.currency) || 'جنيه'; return c === 'جنيه' ? 'ج.م' : c === 'ريال' ? 'ر.س' : c === 'درهم' ? 'د.إ' : c; }
const TZ = process.env.TZ_APP || 'Africa/Cairo';
function today() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }   // Egypt's date even on a UTC server
function nowTs() { try { return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()).replace('T', ' '); } catch (e) { return new Date().toISOString().slice(0, 19).replace('T', ' '); } }
const dmy = ds => { if (!ds) return ''; const p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; };
const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const p2 = n => String(n).padStart(2, '0');
function hm(ts) { const m = /(\d{2}):(\d{2})/.exec(String(ts || '').slice(11)); if (!m) return ''; const h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + (h < 12 ? ' ص' : ' م'); }

function findCenter(d, token) {
  if (!/^[A-Za-z0-9]{6,64}$/.test(String(token || ''))) return null;   // short codes (/c/xxxxxxxx) or the old long ones
  const map = (d.settings && d.settings._portal) || {};
  const cid = Object.keys(map).find(k => map[k] === token);
  if (!cid) return null;
  return (d.customers || []).find(c => c.id === cid) || null;
}

/* 4.75 · what a center can order — a fixed list */
const ORDER_ITEMS = [{ name: 'ورق A3', unit: '' }, { name: 'ورق A4', unit: '' }, { name: 'A3 plastic', unit: '' }, { name: 'A4 plastic', unit: '' }];
function productsOf(d, cid) {
  const seen = new Map();
  (d.issuances || []).filter(i => i.customerId === cid).sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach(i => {
    const k = String(i.productName || '').trim(); if (!k || seen.has(k)) return; seen.set(k, { name: k, unit: i.productUnit || '' });
  });
  return [...seen.values()].slice(0, 30);
}
/* one year by month: what was drawn (value + qty by product) and what was paid */
function yearOf(d, cid, y) {
  const M = Array.from({ length: 12 }, () => ({ val: 0, paid: 0, n: 0, items: {} }));
  (d.issuances || []).forEach(i => {
    if (i.customerId !== cid || String(i.date || '').slice(0, 4) !== y) return;
    const m = M[+String(i.date).slice(5, 7) - 1]; if (!m) return;
    m.val += Number(i.total) || 0; m.n++;
    const k = String(i.productName || 'صنف').trim(), x = m.items[k] || (m.items[k] = { name: k, unit: i.productUnit || '', qty: 0, val: 0 });
    x.qty += Number(i.quantity) || 0; x.val += Number(i.total) || 0;
  });
  (d.invoices || []).forEach(v => {   // an invoice made on its own (not from a صرف) counts too
    if (v.customerId !== cid || v.archived || v.sourceIssuanceId || v.fromIssuance || v.isConsolidated || String(v.date || '').slice(0, 4) !== y) return;
    const m = M[+String(v.date).slice(5, 7) - 1]; if (!m) return;
    m.val += Number(v.total) || 0; m.n++;
    (Array.isArray(v.items) ? v.items : []).forEach(it => {
      const k = String(it.productName || it.name || 'صنف').trim(), x = m.items[k] || (m.items[k] = { name: k, unit: '', qty: 0, val: 0 });
      x.qty += Number(it.qty != null ? it.qty : it.quantity) || 0; x.val += Number(it.total) || 0;
    });
  });
  (d.payments || []).forEach(p => {
    if (p.customerId !== cid || String(p.date || '').slice(0, 4) !== y) return;
    const m = M[+String(p.date).slice(5, 7) - 1]; if (m) m.paid += Number(p.amount) || 0;
  });
  return M;
}

/* the yearly chart: two bars a month (سحبتوا / دفعتوا), the chosen month highlighted; each month is a link */
function chart(M, y, mi, href) {
  const W = 340, H = 170, top = 14, base = 132, max = Math.max(1, ...M.map(m => Math.max(m.val, m.paid)));
  const cw = W / 12, bw = Math.max(5, cw * 0.28);
  const sc = v => Math.max(v > 0 ? 3 : 0, (v / max) * (base - top));
  let g = '';
  for (let k = 1; k <= 3; k++) { const yy = base - (base - top) * k / 3; g += `<line x1="0" x2="${W}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" class="gl"/>`; }
  const bars = M.map((m, i) => {
    const x = W - (i + 1) * cw + cw / 2, on = i === mi, h1 = sc(m.val), h2 = sc(m.paid);
    return `<a href="${href(y, i + 1)}" aria-label="${MON[i]}"><rect x="${(x - cw / 2).toFixed(1)}" y="0" width="${cw.toFixed(1)}" height="${H}" class="hit${on ? ' on' : ''}"/>` +
      `<rect x="${(x - bw - 1).toFixed(1)}" y="${(base - h1).toFixed(1)}" width="${bw.toFixed(1)}" height="${h1.toFixed(1)}" rx="3" class="b1"/>` +
      `<rect x="${(x + 1).toFixed(1)}" y="${(base - h2).toFixed(1)}" width="${bw.toFixed(1)}" height="${h2.toFixed(1)}" rx="3" class="b2"/>` +
      `<text x="${x.toFixed(1)}" y="${base + 16}" class="ml${on ? ' on' : ''}">${MON[i].slice(0, 3)}</text></a>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="المسحوب والمدفوع كل شهر في ${y}">${g}<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="bl"/>${bars}</svg>`;
}

function page(d, c, q, tok, pre, br) {
  const s = d.settings || {}, C = cur(s), t = today();
  const a = AX.aging(d, c.id, t), st = AX.statement(d, c.id, 40);
  let y = String(q.get('y') || ''), m = Number(q.get('m'));
  if (!/^\d{4}$/.test(y)) y = t.slice(0, 4);
  if (!(m >= 1 && m <= 12)) m = y === t.slice(0, 4) ? +t.slice(5, 7) : 12;
  if (y === t.slice(0, 4) && m > +t.slice(5, 7)) m = +t.slice(5, 7);
  const ym = y + '-' + p2(m), M = yearOf(d, c.id, y), cm = M[m - 1];
  const self = (pre ? '/' + pre : '') + '/' + tok;   // 4.76 · /<code> (6) or /c/<code> or /p/<token>
  const href = (yy, mm) => self + '?y=' + yy + '&m=' + mm + '#mon';
  const due = Math.max(0, a.balance), total = a.buckets.reduce((x, v) => x + v, 0) || 1;
  const labels = ['30 يوم أو أقل', '31 – 60 يوم', '61 – 90 يوم', 'أكتر من 90 يوم'], colors = ['#16A34A', '#F59E0B', '#F97316', '#DC2626'];
  const logo = typeof s.companyLogo === 'string' && s.companyLogo.startsWith('data:image') ? s.companyLogo : '';
  const yTot = M.reduce((o, x) => ({ val: o.val + x.val, paid: o.paid + x.paid }), { val: 0, paid: 0 });
  const items = Object.values(cm.items).sort((a1, b1) => b1.qty - a1.qty), qmax = Math.max(1, ...items.map(x => x.qty));
  const inv = (d.invoices || []).filter(v => v.customerId === c.id && !v.archived && String(v.date || '').slice(0, 7) === ym).sort((a1, b1) => String(b1.date).localeCompare(String(a1.date)));
  const pays = (d.payments || []).filter(p => p.customerId === c.id && String(p.date || '').slice(0, 7) === ym && Number(p.amount) > 0).sort((a1, b1) => String(b1.date).localeCompare(String(a1.date)));
  const prods = ORDER_ITEMS;
  const orders = db.prepare('SELECT * FROM portal_req WHERE customer_id = ? AND branch = ? ORDER BY id DESC LIMIT 8').all(c.id, br || 'main');
  const ty = +t.slice(0, 4), years = []; for (let k = ty; k >= ty - 3; k--) years.push(String(k));
  const st2 = (tot, paid) => { const r = (Number(tot) || 0) - (Number(paid) || 0); return r <= 0.5 ? '<span class="tg ok">مسددة</span>' : (Number(paid) || 0) > 0.5 ? '<span class="tg pt">باقي ' + n0(r) + '</span>' : '<span class="tg no">آجل</span>'; };

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light only"><meta name="theme-color" content="#F4F6FA">
<title>${esc(c.name)} — ${esc(s.companyName || 'Ozarex')}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
:root{color-scheme:light;--bg:#F4F6FA;--card:#fff;--soft:#F1F4F9;--line:#E6EAF0;--ink:#0F172A;--mut:#64748B;--faint:#94A3B8;--pri:#0E9F9A;--pri2:#0B7F7B;--draw:#2563EB;--pay:#16A34A;--red:#DC2626;--sh:0 1px 2px rgba(15,23,42,.04),0 8px 24px -12px rgba(15,23,42,.12)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html{scroll-behavior:smooth}html{touch-action:manipulation;-webkit-text-size-adjust:100%;text-size-adjust:100%}@supports (-webkit-touch-callout:none){input,select,textarea{font-size:16px!important}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'IBM Plex Sans Arabic','Cairo',Tahoma,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
.w{max-width:720px;margin:0 auto;padding:16px 16px 48px}
.n{font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.top{display:flex;align-items:center;gap:12px;padding:4px 2px 14px}.top img{width:44px;height:44px;border-radius:12px;object-fit:contain;background:#fff;box-shadow:var(--sh)}
.top .lg{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,var(--pri),#22C1B8);color:#fff;font-weight:800;font-size:18px}
.top b{display:block;font-size:16px}.top span{font-size:12.5px;color:var(--mut)}
.card{background:var(--card);border-radius:22px;padding:18px;margin-top:12px;box-shadow:var(--sh);animation:up .5s cubic-bezier(.2,.8,.2,1) both}
.card:nth-of-type(2){animation-delay:.05s}.card:nth-of-type(3){animation-delay:.1s}.card:nth-of-type(4){animation-delay:.15s}
@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
h2{font-size:15.5px;margin:0 0 12px;display:flex;align-items:center;gap:8px}h2 small{margin-inline-start:auto;font-size:12px;color:var(--mut);font-weight:500}
.hero{background:linear-gradient(140deg,#0E9F9A 0%,#0B7F7B 55%,#0A5F70 100%);color:#fff;border-radius:26px;padding:20px 20px 16px;box-shadow:0 18px 40px -20px rgba(11,127,123,.7);animation:up .5s both}
.hero small{display:block;color:rgba(255,255,255,.78);font-size:13px}.hero .v{font:800 38px/1.15 'Zain','IBM Plex Sans Arabic',sans-serif;margin:4px 0 2px}.hero .v span{font-size:18px;font-weight:700;opacity:.85}
.bar{display:flex;gap:2px;height:10px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.18);margin-top:14px}.bar i{display:block;height:100%}
.leg{list-style:none;padding:0;margin:10px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.leg li{display:flex;align-items:center;gap:7px;font-size:12px;background:rgba(255,255,255,.12);border-radius:11px;padding:7px 9px}.leg i{width:9px;height:9px;border-radius:3px;flex:none}.leg b{margin-inline-start:auto}
.hq{display:flex;gap:8px;margin-top:14px}.hq a,.hq button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:14px;padding:11px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;text-decoration:none}
.hq .a1{background:#fff;color:var(--pri2)}.hq .a2{background:rgba(255,255,255,.16);color:#fff}
.yr{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:10px}.yr::-webkit-scrollbar{display:none}
.yr a{flex:none;padding:6px 14px;border-radius:999px;background:var(--soft);color:var(--mut);text-decoration:none;font-weight:700;font-size:13px}.yr a.on{background:var(--ink);color:#fff}
.ch{width:100%;height:auto;display:block}.ch .gl{stroke:var(--line);stroke-dasharray:3 4}.ch .bl{stroke:#CBD5E1}
.ch .b1{fill:var(--draw)}.ch .b2{fill:var(--pay)}.ch .hit{fill:transparent}.ch .hit.on{fill:rgba(37,99,235,.07)}.ch a{cursor:pointer}
.ch .ml{font-size:10px;fill:var(--faint);text-anchor:middle;font-family:inherit}.ch .ml.on{fill:var(--ink);font-weight:800}
.lgd{display:flex;gap:14px;font-size:12px;color:var(--mut);margin-top:6px}.lgd i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:5px;vertical-align:-1px}
.ytot{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.ytot div{background:var(--soft);border-radius:14px;padding:10px 12px}.ytot span{font-size:12px;color:var(--mut);display:block}.ytot b{font-size:16px}
.mh{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:12px}.mh::-webkit-scrollbar{display:none}
.mh a{flex:none;min-width:54px;text-align:center;padding:8px 10px;border-radius:14px;background:var(--soft);color:var(--mut);text-decoration:none;font-size:12.5px;font-weight:700;transition:transform .2s}
.mh a.on{background:linear-gradient(135deg,var(--pri),#22C1B8);color:#fff;transform:scale(1.04)}.mh a.off{opacity:.35;pointer-events:none}.mh a.has::after{content:'';display:block;width:5px;height:5px;border-radius:50%;background:currentColor;margin:3px auto 0;opacity:.6}
.kp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.kp div{border-radius:16px;padding:12px 10px;background:var(--soft)}
.kp span{font-size:11.5px;color:var(--mut);display:block}.kp b{font-size:17px;display:block;margin-top:2px}.kp .d b{color:var(--draw)}.kp .p b{color:var(--pay)}
.it{margin-top:14px}.ir{padding:10px 0;border-bottom:1px solid var(--line)}.ir:last-child{border-bottom:0}
.ir .r{display:flex;align-items:baseline;gap:8px}.ir .r b{flex:1;font-size:14px}.ir .r em{font-style:normal;font-weight:800;font-size:16px}.ir .r small{color:var(--mut);font-size:12px}
.ir .tr{height:6px;border-radius:999px;background:var(--soft);margin-top:7px;overflow:hidden}.ir .tr i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#60A5FA,var(--draw));animation:gr .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes gr{from{width:0!important}}
.mt{color:var(--mut);margin:0;font-size:14px}.emp{text-align:center;padding:18px 6px;color:var(--mut)}.emp i{font-style:normal;font-size:30px;display:block;margin-bottom:4px}
.tg{display:inline-block;font-size:11.5px;font-weight:700;border-radius:8px;padding:2px 8px;white-space:nowrap}.tg.ok{background:#DCFCE7;color:#15803D}.tg.pt{background:#FEF3C7;color:#B45309}.tg.no{background:#FEE2E2;color:#B91C1C}.tg.nw{background:#E0F2FE;color:#0369A1}
details.iv{border:1px solid var(--line);border-radius:14px;margin-top:8px;overflow:hidden}details.iv summary{display:flex;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;list-style:none;font-size:14px}
details summary::-webkit-details-marker{display:none}details.iv summary b{margin-inline-start:auto}
table{width:100%;border-collapse:collapse;font-size:13px}th{font-weight:700;color:var(--mut);text-align:right;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}td{padding:8px 10px;border-bottom:1px solid var(--line)}
.ivf{display:flex;gap:16px;padding:8px 12px 12px;font-size:13px;color:var(--mut)}.c{color:var(--pay)}.dd{color:var(--red)}
.pl{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}.pl:last-child{border-bottom:0}
details.stm>summary{cursor:pointer;font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px}details.stm>summary::after{content:'⌄';margin-inline-start:auto;color:var(--mut);transition:transform .2s}details.stm[open]>summary::after{transform:rotate(180deg)}
.tw{overflow-x:auto;margin-top:10px}
/* order */
.oform{display:none}.oform.on{display:block;animation:up .35s both}
.ol{display:flex;gap:8px;align-items:center;margin-bottom:8px}.ol select,.ol input,.fld{font:inherit;font-size:15px;border:1px solid var(--line);border-radius:12px;padding:11px 12px;background:#fff;color:var(--ink);min-width:0}
.ol select{flex:1}.ol input{width:96px;text-align:center}.ol .x{border:0;background:var(--soft);color:var(--mut);width:40px;height:44px;border-radius:12px;font-size:18px;cursor:pointer;flex:none}
.fld{width:100%;margin-top:8px}.add{border:1px dashed #94A3B8;background:transparent;color:var(--pri2);border-radius:12px;padding:10px;width:100%;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer}
.go{margin-top:12px;width:100%;border:0;border-radius:14px;padding:14px;background:linear-gradient(135deg,var(--pri),#22C1B8);color:#fff;font-weight:800;font-size:15.5px;font-family:inherit;cursor:pointer;box-shadow:0 10px 24px -12px rgba(14,159,154,.8)}
.go:disabled{opacity:.6}.omsg{margin-top:10px;font-size:14px;text-align:center}
.or{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)}.or:last-child{border-bottom:0}.or .dt{flex:1;font-size:13.5px}.or .dt small{display:block;color:var(--mut);font-size:12px}
.dv{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}.dvb{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:9px 14px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}.dvb.on{background:#FFF7ED;border-color:#F97316;color:#C2410C}
.phw{margin-top:10px}.phr{display:flex;gap:8px}.phb{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:1.5px dashed #F97316;background:#FFF7ED;color:#C2410C;border-radius:14px;padding:12px 8px;font-weight:800;font-size:14.5px;cursor:pointer}.phb.g{border-color:#94A3B8;background:#F8FAFC;color:#334155}
.phs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.phs div{position:relative;width:88px;height:88px;border-radius:14px;overflow:hidden;box-shadow:var(--sh);animation:pop .4s cubic-bezier(.2,1.6,.4,1) both}.phs img{width:100%;height:100%;object-fit:cover;display:block}
.phs button{position:absolute;top:4px;inset-inline-end:4px;width:24px;height:24px;border-radius:50%;border:0;background:rgba(15,23,42,.7);color:#fff;font-size:15px;line-height:24px;cursor:pointer;padding:0}.phs small{position:absolute;bottom:0;inset-inline:0;background:rgba(15,23,42,.6);color:#fff;font-size:10px;text-align:center;padding:1px}
.phn{display:block;color:var(--faint);font-size:11.5px;margin-top:6px}
.urg{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:14px;font-weight:700;color:#B91C1C}.urg input{width:20px;height:20px;accent-color:#DC2626}
.btn{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:14px;padding:11px 16px;background:var(--ink);color:#fff;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer}
.acts{display:flex;justify-content:center;margin-top:16px}.foot{margin-top:14px;font-size:12px;color:var(--faint);text-align:center}
.done{position:fixed;inset:0;display:grid;place-items:center;background:rgba(244,246,250,.85);backdrop-filter:blur(6px);z-index:9;animation:up .3s both}.done div{background:#fff;border-radius:24px;padding:26px 30px;text-align:center;box-shadow:var(--sh)}.done i{font-style:normal;font-size:48px;display:block;animation:pop .6s cubic-bezier(.2,1.6,.4,1) both}
@keyframes pop{from{transform:scale(.3)}to{transform:none}}
@media (max-width:420px){.hero .v{font-size:33px}.kp b{font-size:15px}}
@media print{body{background:#fff}.hq,.yr,.mh,.acts,#order,.foot{display:none!important}.card,.hero{box-shadow:none;border:1px solid #ddd;animation:none}.hero{background:#fff;color:#000}.hero small{color:#444}details{display:block}details>*{display:block}}
</style></head><body><div class="w">
<div class="top">${logo ? `<img src="${esc(logo)}" alt="">` : `<span class="lg">${esc(String(s.companyName || 'O').charAt(0))}</span>`}<div><b>${esc(c.name)}</b><span>حسابكم عند ${esc(s.companyName || 'Ozarex')} · ${dmy(t)}</span></div></div>

<section class="hero"><small>المستحق عليكم</small><div class="v n">${n0(due)} <span>${esc(C)}</span></div>
<small>${due > 0.5 ? (a.oldestDays > 0 ? 'أقدم مبلغ مستحق من ' + a.oldestDays + ' يوم' : 'مستحق حديثاً') : 'الحساب مسدد بالكامل — شكراً لكم 🙏'}${a.lastPay ? ' · آخر دفعة ' + n0(a.lastPay.amount) + ' يوم ' + dmy(a.lastPay.date) : ''}</small>
${due > 0.5 ? `<div class="bar">${a.buckets.map((v, i) => v > 0 ? `<i style="width:${(v / total * 100).toFixed(2)}%;background:${colors[i]}"></i>` : '').join('')}</div>
<ul class="leg">${a.buckets.map((v, i) => `<li><i style="background:${colors[i]}"></i><span>${labels[i]}</span><b class="n">${n0(v)}</b></li>`).join('')}</ul>` : ''}
<div class="hq"><button class="a1" type="button" onclick="openOrder()">📦 اطلب ورق</button><button class="a1" type="button" onclick="openMaint()">🛠 طلب صيانة</button></div>
<div class="hq" style="margin-top:8px"><a class="a2" href="#mon">📊 حساب الشهر</a></div>
</section>

<section class="card" id="order"><h2>📦 اطلب ورق</h2>
<p class="mt" id="o-lead">اختار الصنف (ورق A3 · ورق A4 · A3 plastic · A4 plastic) واكتب الكمية اللي محتاجينها، والطلب هيوصلنا على طول.</p>
<div class="oform" id="oform">
<div id="olines"></div>
<button class="add" type="button" onclick="addLine()">＋ صنف كمان</button>
<input class="fld" id="o-who" maxlength="60" placeholder="اسم اللي طالب ورقم تليفونه (اختياري)">
<textarea class="fld" id="o-note" rows="2" maxlength="300" placeholder="ملاحظة (اختياري) — مثلاً: محتاجينه قبل الخميس"></textarea>
<button class="go" id="o-go" type="button" onclick="sendOrder()">ابعت الطلب</button><div class="omsg" id="o-msg"></div>
</div>
<button class="go" id="o-open" type="button" onclick="openOrder()">اطلب دلوقتي</button>
${orders.length ? `<div style="margin-top:14px"><h2 style="font-size:14px">طلباتكم الأخيرة</h2>${orders.map(o => { let it = []; try { it = JSON.parse(o.items); } catch (e) {} const mt = o.kind === 'maint'; return `<div class="or"><div class="dt"><b>${mt ? '🛠 صيانة' + (it && it.device ? ' — ' + esc(it.device) : '') + (o.note ? ': ' + esc(String(o.note).slice(0, 60)) : '') : (Array.isArray(it) ? it : []).map(x => esc(x.qty) + ' ' + esc(x.unit || '') + ' ' + esc(x.name)).join(' · ')}</b><small>${dmy(o.created_at)} ${hm(o.created_at)}${o.reply ? ' · ' + esc(o.reply) : ''}</small></div><span class="tg ${o.status === 'sent' ? 'ok' : o.status === 'no' ? 'no' : o.status === 'ok' ? 'pt' : 'nw'}">${(mt ? MSTATUS : STATUS)[o.status] || o.status}</span></div>`; }).join('')}</div>` : ''}
</section>

<section class="card" id="maint"><h2>🛠 طلب صيانة</h2>
<p class="mt">عندكم عطل؟ اكتبوا الشكوى وصوّروا العطل، والفني هيتواصل معاكم.</p>
<div class="oform" id="mform">
<div class="dv">${DEVICES.map((x, i) => `<button type="button" class="dvb${i === 0 ? ' on' : ''}" onclick="pickDev(this)">${esc(x)}</button>`).join('')}</div>
<textarea class="fld" id="m-pr" rows="3" maxlength="400" placeholder="اكتب الشكوى — مثلاً: الطابعة بتطلع الفيلم فاضي / بتسحب ورقتين"></textarea>
<div class="phw"><div class="phr"><label class="phb">📷 صوّر العطل<input type="file" accept="image/*" capture="environment" onchange="addPh(this)" hidden></label><label class="phb g">🖼 من الصور<input type="file" accept="image/*" multiple onchange="addPh(this)" hidden></label></div>
<div class="phs" id="phs"></div><small class="phn">لحد 3 صور — الصورة بتتصغّر تلقائي قبل ما تتبعت</small></div>
<label class="urg"><input type="checkbox" id="m-ur"> <span>🚨 مستعجل — الشغل واقف</span></label>
<input class="fld" id="m-who" maxlength="60" placeholder="اسم اللي طالب ورقم تليفونه (اختياري)">
<button class="go" id="m-go" type="button" onclick="sendMaint()">ابعت طلب الصيانة</button><div class="omsg" id="m-msg"></div>
</div>
<button class="go" id="m-open" type="button" onclick="openMaint()" style="background:linear-gradient(135deg,#F59E0B,#F97316);box-shadow:0 10px 24px -12px rgba(249,115,22,.8)">🛠 اطلب صيانة</button>
</section>

<section class="card"><h2>📊 السحب والتحصيل ${esc(y)}</h2>
<div class="yr">${years.map(x => `<a class="${x === y ? 'on' : ''}" href="${href(x, x === t.slice(0, 4) ? +t.slice(5, 7) : 12)}">${x}</a>`).join('')}</div>
${chart(M, y, m - 1, href)}
<div class="lgd"><span><i style="background:var(--draw)"></i>سحبتوا</span><span><i style="background:var(--pay)"></i>دفعتوا</span><span style="margin-inline-start:auto">دوس على أي شهر</span></div>
<div class="ytot"><div><span>سحبتوا في ${esc(y)}</span><b class="n" style="color:var(--draw)">${n0(yTot.val)}</b></div><div><span>دفعتوا في ${esc(y)}</span><b class="n" style="color:var(--pay)">${n0(yTot.paid)}</b></div></div>
</section>

<section class="card" id="mon"><h2>🗓 ${MON[m - 1]} ${esc(y)}</h2>
<div class="mh">${MON.map((x, i) => { const fut = y === t.slice(0, 4) && i + 1 > +t.slice(5, 7); return `<a class="${i === m - 1 ? 'on' : ''}${fut ? ' off' : ''}${M[i].n || M[i].paid ? ' has' : ''}" href="${href(y, i + 1)}">${x}</a>`; }).join('')}</div>
<div class="kp"><div class="d"><span>سحبتوا</span><b class="n">${n0(cm.val)}</b></div><div class="p"><span>دفعتوا</span><b class="n">${n0(cm.paid)}</b></div><div><span>${cm.val - cm.paid >= 0 ? 'الفرق عليكم' : 'دفعتوا زيادة'}</span><b class="n">${n0(Math.abs(cm.val - cm.paid))}</b></div></div>
<div class="it">${items.length ? `<h2 style="font-size:14px;margin-bottom:4px">الورق اللي وصلكم الشهر ده</h2>` + items.map(x => `<div class="ir"><div class="r"><b>${esc(x.name)}</b><em class="n">${n0(x.qty)}</em><small>${esc(x.unit)}</small></div><div class="tr"><i style="width:${(x.qty / qmax * 100).toFixed(1)}%"></i></div></div>`).join('') : '<div class="emp"><i>📭</i>مفيش ورق اتسحب في الشهر ده</div>'}</div>
${pays.length ? `<h2 style="font-size:14px;margin:16px 0 4px">💵 دفعات الشهر</h2>${pays.map(p => `<div class="pl"><span>${dmy(p.date)} · ${esc(p.method || 'نقدي')}</span><b class="n c">${n0(p.amount)}</b></div>`).join('')}` : ''}
</section>

${inv.length ? `<section class="card"><h2>🧾 فواتير ${MON[m - 1]} <small>${inv.length} فاتورة</small></h2>${inv.map(v => `<details class="iv"><summary><span class="n">#${esc(v.number)}</span><span>${dmy(v.date)}</span><b class="n">${n0(v.total)} ${esc(C)}</b>${st2(v.total, v.paid)}</summary>
${Array.isArray(v.items) && v.items.length ? `<table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${v.items.map(x => `<tr><td>${esc(x.productName || x.name || '')}</td><td class="n">${num(x.qty != null ? x.qty : x.quantity)}</td><td class="n">${num(x.price != null ? x.price : x.unitPrice)}</td><td class="n">${num(x.total)}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="ivf"><span>المدفوع: <b class="c n">${n0(v.paid)}</b></span><span>الباقي: <b class="n ${(Number(v.total) || 0) - (Number(v.paid) || 0) > 0.5 ? 'dd' : ''}">${n0(Math.max(0, (Number(v.total) || 0) - (Number(v.paid) || 0)))}</b></span></div></details>`).join('')}</section>` : ''}

<section class="card"><details class="stm"><summary>📒 كشف الحساب</summary>${st.rows.length ? `<div class="tw"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>عليكم</th><th>دفعتم</th><th>الرصيد</th></tr></thead><tbody>
${st.rows.map(r => `<tr><td class="n">${dmy(r.date)}</td><td>${esc(r.label)}</td><td class="n dd">${r.debit ? n0(r.debit) : ''}</td><td class="n c">${r.credit ? n0(r.credit) : ''}</td><td class="n">${n0(r.balance)}</td></tr>`).join('')}
</tbody></table></div>` : '<p class="mt" style="margin-top:10px">مفيش حركات لسه</p>'}</details></section>
<div class="acts"><button class="btn" onclick="print()">🖨️ طباعة / PDF</button></div>
<p class="foot">الصفحة دي لحسابكم بس، والأرقام بتتحدّث أول بأول.${s.companyPhone ? ' للاستفسار: ' + esc(s.companyPhone) : ''}</p>
</div>
<script>
(function(){var p=function(e){e.preventDefault()};document.addEventListener('gesturestart',p,{passive:false});document.addEventListener('gesturechange',p,{passive:false});document.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});document.addEventListener('dblclick',p,{passive:false})})();
try{var mo=document.querySelector('.mh a.on');if(mo)mo.parentNode.scrollLeft=mo.offsetLeft-mo.parentNode.clientWidth/2+mo.clientWidth/2;}catch(e){}
var P=${JSON.stringify(prods).replace(/</g, '\\u003c')},U=${JSON.stringify(self + '/order')};
function opts(){return '<option value="">اختار الصنف…</option>'+P.map(function(p,i){return '<option value="'+i+'">'+p.name.replace(/[<&]/g,'')+(p.unit?' ('+p.unit.replace(/[<&]/g,'')+')':'')+'</option>'}).join('')}
function addLine(){var d=document.createElement('div');d.className='ol';d.innerHTML='<select>'+opts()+'</select><input type="number" inputmode="numeric" min="1" placeholder="الكمية"><button class="x" type="button" aria-label="شيل" onclick="this.parentNode.remove()">×</button>';document.getElementById('olines').appendChild(d);}
var PH=[];
function shrink(f,cb){var u=URL.createObjectURL(f),im=new Image();im.onload=function(){var M=1024,w=im.naturalWidth,h=im.naturalHeight,k=Math.min(1,M/Math.max(w,h));var c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);var d=c.toDataURL('image/jpeg',0.5);if(d.length>1100000)d=c.toDataURL('image/jpeg',0.35);cb(d);};im.onerror=function(){URL.revokeObjectURL(u);cb(null)};im.src=u;}
function addPh(inp){var fs=[].slice.call(inp.files||[]);inp.value='';fs.forEach(function(f){if(PH.length>=3)return;if(!/^image/.test(f.type||'image'))return;shrink(f,function(d){if(d&&PH.length<3){PH.push(d);drawPh();}});});}
function drawPh(){document.getElementById('phs').innerHTML=PH.map(function(d,i){return '<div><img src="'+d+'" alt=""><button type="button" onclick="PH.splice('+i+',1);drawPh()">×</button><small>'+Math.round(d.length*0.75/1024)+' KB</small></div>'}).join('');}
function pickDev(b){[].forEach.call(document.querySelectorAll('.dvb'),function(x){x.classList.toggle('on',x===b)});}
function openMaint(){var f=document.getElementById('mform');if(!f.classList.contains('on')){f.classList.add('on');document.getElementById('m-open').style.display='none';}document.getElementById('maint').scrollIntoView({behavior:'smooth',block:'start'});setTimeout(function(){var t=document.getElementById('m-pr');if(t)t.focus()},400);}
function sendMaint(){var pr=document.getElementById('m-pr').value.trim(),m=document.getElementById('m-msg');if(pr.length<3){m.textContent='اكتب المشكلة';m.style.color='#DC2626';return;}
var d=document.querySelector('.dvb.on'),b=document.getElementById('m-go');b.disabled=true;b.textContent='بنبعت…';
fetch(U.slice(0,-6)+'/maint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:d?d.textContent:'',problem:pr,urgent:document.getElementById('m-ur').checked,contact:document.getElementById('m-who').value,photos:PH})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||'محصلش');return j})})
.then(function(){var o=document.createElement('div');o.className='done';o.innerHTML='<div><i>🛠</i><b>طلب الصيانة وصلنا</b><p class="mt">الفني هيتواصل معاكم في أقرب وقت</p></div>';document.body.appendChild(o);setTimeout(function(){location.reload()},1800);})
.catch(function(e){m.textContent=e.message;m.style.color='#DC2626';b.disabled=false;b.textContent='ابعت طلب الصيانة';});}
function openOrder(){var f=document.getElementById('oform');if(!f.classList.contains('on')){f.classList.add('on');document.getElementById('o-open').style.display='none';if(!document.querySelector('.ol'))addLine();}document.getElementById('order').scrollIntoView({behavior:'smooth',block:'start'});}
function sendOrder(){var items=[].map.call(document.querySelectorAll('.ol'),function(l){var s=l.querySelector('select'),t=l.querySelector('.fld'),q=Number(l.querySelector('input[type=number]').value);var p=s&&s.value!==''&&s.value!=='x'?P[+s.value]:null;var name=p?p.name:(t?t.value.trim():'');return name&&q>0?{name:name,unit:p?p.unit:'',qty:q}:null}).filter(Boolean);
var m=document.getElementById('o-msg');if(!items.length){m.textContent='اختار صنف واكتب الكمية';m.style.color='#DC2626';return;}
var b=document.getElementById('o-go');b.disabled=true;b.textContent='بنبعت…';
fetch(U,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items,contact:document.getElementById('o-who').value,note:document.getElementById('o-note').value})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||'محصلش');return j})})
.then(function(){var o=document.createElement('div');o.className='done';o.innerHTML='<div><i>✅</i><b>الطلب وصلنا</b><p class="mt">هنأكده معاكم في أقرب وقت</p></div>';document.body.appendChild(o);setTimeout(function(){location.reload()},1800);})
.catch(function(e){m.textContent=e.message;m.style.color='#DC2626';b.disabled=false;b.textContent='ابعت الطلب';});}
</script></body></html>`;
}

function notFound() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light only">
<title>اللينك مش شغال</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;font-family:Tahoma,system-ui,sans-serif;background:#F4F6FA;color:#0F172A;text-align:center;padding:16px}b{display:block;font-size:20px;margin-bottom:6px}span{color:#64748B}</style></head>
<body><div><b>اللينك ده مش شغال</b><span>يمكن اتوقف أو اتغير — اطلب لينك جديد من الشركة.</span></div></body></html>`;
}

/* ── notifications to the admins (set by server.js) ── */
let NT = { admins: () => [], event: () => {}, push: null };
function setNotify(n) { NT = Object.assign(NT, n || {}); }

/* a center sends an order → stored, the admins hear about it */
const ORD = new Map();   // token → [times]
function takeOrder(req, res, stores, tok) {
  let found = null;
  for (const x of stores) { const k = findCenter(x.data, tok); if (k) { found = { st: x, c: k }; break; } }
  const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  if (!found) return send(404, { message: 'اللينك ده مش شغال' });
  const now = Date.now(), times = (ORD.get(tok) || []).filter(t => now - t < 3600e3);
  if (times.length >= 8) return send(429, { message: 'بعتّوا طلبات كتير — كلمونا لو مستعجلين' });
  let raw = '', size = 0;
  req.on('data', ch => { size += ch.length; if (size > 20000) { req.destroy(); return; } raw += ch; });
  req.on('end', () => {
    let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(400, { message: 'الطلب مش مفهوم' }); }
    const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
    const okName = new Set(ORDER_ITEMS.map(x => x.name));
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12).map(x => ({ name: clean(x && x.name, 80), unit: '', qty: Math.round(Number(x && x.qty) || 0) }))
      .filter(x => okName.has(x.name) && x.qty > 0 && x.qty <= 1000000);
    if (!items.length) return send(400, { message: 'اختار صنف واكتب الكمية' });
    times.push(now); ORD.set(tok, times); if (ORD.size > 5000) ORD.clear();
    const r = db.prepare('INSERT INTO portal_req (branch, branch_name, customer_id, customer_name, items, note, contact, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(found.st.id || 'main', found.st.name || '', found.c.id, String(found.c.name || '').slice(0, 120), JSON.stringify(items), clean(b.note, 300), clean(b.contact, 60), 'new', nowTs());
    const what = items.map(x => x.qty + ' ' + (x.unit ? x.unit + ' ' : '') + x.name).join(' · ');
    try { NT.event('portal', { kind: 'order', id: Number(r.lastInsertRowid), center: String(found.c.name || ''), items, contact: clean(b.contact, 60), note: clean(b.note, 300), text: '📦 طلب ورق من ' + found.c.name + ': ' + what }); } catch (e) {}
    try { const ids = (NT.admins() || []).slice(0, 50); if (ids.length && NT.push) NT.push.send(ids, { title: '📦 طلب ورق — ' + found.c.name, body: what, url: './?go=clients', tag: 'preq-' + r.lastInsertRowid, urgent: true }).catch(() => {}); } catch (e) {}
    send(200, { ok: true });
  });
}

/* 4.82 · a center asks for maintenance → stored, admins hear it (green card), employees get a push */
function takeMaint(req, res, stores, tok) {
  let found = null;
  for (const x of stores) { const k = findCenter(x.data, tok); if (k) { found = { st: x, c: k }; break; } }
  const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  if (!found) return send(404, { message: 'اللينك ده مش شغال' });
  const now = Date.now(), times = (ORD.get(tok) || []).filter(t => now - t < 3600e3);
  if (times.length >= 8) return send(429, { message: 'بعتّوا طلبات كتير — كلمونا لو مستعجلين' });
  let raw = '', size = 0;
  req.on('data', ch => { size += ch.length; if (size > 3000000) { req.destroy(); return; } raw += ch; });   // 4.83 · up to 3 small photos
  req.on('end', () => {
    let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(400, { message: 'الطلب مش مفهوم' }); }
    const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
    const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 3).map(u => { const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || '')); if (!m) return null; const buf = Buffer.from(m[2], 'base64'); return buf.length > 200 && buf.length <= 900000 ? { mime: m[1], buf } : null; }).filter(Boolean);
    const problem = clean(b.problem, 400); if (problem.length < 3) return send(400, { message: 'اكتب المشكلة' });
    const device = DEVICES.includes(clean(b.device, 40)) ? clean(b.device, 40) : '';
    const urgent = !!b.urgent, contact = clean(b.contact, 60);
    times.push(now); ORD.set(tok, times);
    const r = db.prepare("INSERT INTO portal_req (branch, branch_name, customer_id, customer_name, items, note, contact, status, created_at, kind) VALUES (?,?,?,?,?,?,?,?,?, 'maint')")
      .run(found.st.id || 'main', found.st.name || '', found.c.id, String(found.c.name || '').slice(0, 120), JSON.stringify({ device, urgent }), problem, contact, 'new', nowTs());
    const id = Number(r.lastInsertRowid), head = (urgent ? '🚨 ' : '🛠 ') + 'طلب صيانة — ' + found.c.name;
    photos.forEach(p => { try { db.prepare('INSERT INTO portal_photo (req_id, mime, data, created_at) VALUES (?,?,?,?)').run(id, p.mime, p.buf, nowTs()); } catch (e) {} });
    try { NT.event('portal', { kind: 'maint', id, photos: photos.length, cid: found.c.id, branch: found.st.id || 'main', center: String(found.c.name || ''), device, problem, urgent, contact, text: head + ': ' + problem }); } catch (e) {}
    try { const ids = (NT.admins() || []).slice(0, 50); if (ids.length && NT.push) NT.push.send(ids, { title: head, body: (device ? device + ': ' : '') + problem, url: './?go=clients', tag: 'pmt-' + id, urgent: true }).catch(() => {}); } catch (e) {}
    try { if (NT.staff) { const emps = NT.staff.activeEmps().map(e => e.id); if (emps.length) NT.staff.toEmps(emps, { title: head, body: (device ? device + ': ' : '') + problem + ' — لو هتروح سجّل مهمة للمركز ده', tag: 'pmt-' + id, urgent }); } } catch (e) {}
    send(200, { ok: true });
  });
}

/* ── the admin side: /api/portal/* (server.js checks admin) ── */
function rowOut(r) { let items = []; try { items = JSON.parse(r.items); } catch (e) {} let photos = 0; try { photos = db.prepare('SELECT COUNT(*) AS n FROM portal_photo WHERE req_id = ?').get(r.id).n; } catch (e) {} return Object.assign({}, r, { items, photos }); }
function adminApi(req, res, pathname, me, h) {
  const { sendJSON, readBody } = h, q = new URL(req.url, 'http://x').searchParams;
  if (req.method === 'GET' && pathname === '/api/portal/requests') {
    const st = q.get('status');
    const rows = (st === 'open' ? db.prepare("SELECT * FROM portal_req WHERE status IN ('new','ok') ORDER BY id DESC LIMIT 200").all() : db.prepare('SELECT * FROM portal_req ORDER BY id DESC LIMIT 200').all()).map(rowOut);
    return sendJSON(res, 200, { list: rows, newCount: db.prepare("SELECT COUNT(*) AS n FROM portal_req WHERE status = 'new'").get().n });
  }
  if (req.method === 'GET' && pathname === '/api/portal/photo') {
    const ph = db.prepare('SELECT * FROM portal_photo WHERE req_id = ? ORDER BY id LIMIT 1 OFFSET ?').get(Number(q.get('req')), Math.max(0, Number(q.get('i')) || 0));
    if (!ph) return sendJSON(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': ph.mime || 'image/jpeg', 'Content-Length': ph.data.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }); res.end(ph.data); return;
  }
  if (req.method === 'GET' && pathname === '/api/portal/emps') return sendJSON(res, 200, { list: NT.staff ? NT.staff.activeEmps() : [] });
  if (req.method === 'POST' && pathname === '/api/portal/assign') {
    return readBody(req, 0.02).then(b => {
      b = b || {}; const r = db.prepare('SELECT * FROM portal_req WHERE id = ?').get(Number(b.id));
      if (!r) return sendJSON(res, 404, { error: 'not_found', message: 'الطلب مش موجود' });
      if (!NT.staff) return sendJSON(res, 400, { error: 'bad', message: 'قسم الموظفين مش شغال' });
      let it = {}; try { it = JSON.parse(r.items) || {}; } catch (e) {}
      const who = me.name || me.username || 'admin';
      try {
        NT.staff.createTask({ emp_id: b.emp_id, center: (r.branch || 'main') + ':' + r.customer_id, title: '🛠 صيانة' + (it.device ? ' — ' + it.device : '') + (it.urgent ? ' (مستعجل)' : ''), note: r.note, portal_req: r.id }, who);
      } catch (er) { return sendJSON(res, er.status || 400, { error: 'bad', message: er.staffMsg || er.message || 'محصلش' }); }
      const emp = (NT.staff.activeEmps() || []).find(e => e.id === String(b.emp_id));
      db.prepare("UPDATE portal_req SET status = 'ok', reply = ?, done_at = ?, done_by = ? WHERE id = ?").run('اتحوّل لـ ' + (emp ? emp.name : 'فني'), nowTs(), who, r.id);
      try { NT.event('portal', { kind: 'status', id: r.id }); } catch (e) {}
      return sendJSON(res, 200, { ok: true, emp: emp ? emp.name : '' });
    });
  }
  if (req.method === 'GET' && pathname === '/api/portal/count') return sendJSON(res, 200, { newCount: db.prepare("SELECT COUNT(*) AS n FROM portal_req WHERE status = 'new'").get().n });
  if (req.method === 'POST' && pathname === '/api/portal/request') {
    return readBody(req, 0.02).then(b => {
      b = b || {}; const id = Number(b.id), st = String(b.status || '');
      if (!['new', 'ok', 'sent', 'no'].includes(st)) return sendJSON(res, 400, { error: 'bad', message: 'حالة غلط' });
      const who = me.name || me.username || 'admin';
      const ch = db.prepare('UPDATE portal_req SET status = ?, reply = ?, done_at = ?, done_by = ? WHERE id = ?').run(st, String(b.reply || '').slice(0, 160) || null, nowTs(), who, id).changes;
      if (!ch) return sendJSON(res, 404, { error: 'not_found', message: 'الطلب مش موجود' });
      try { NT.event('portal', { kind: 'status', id }); } catch (e) {}
      return sendJSON(res, 200, { ok: true });
    });
  }
  if (req.method === 'POST' && pathname === '/api/portal/request/delete') {
    return readBody(req, 0.02).then(b => { db.prepare('DELETE FROM portal_req WHERE id = ?').run(Number((b || {}).id)); db.prepare('DELETE FROM portal_photo WHERE req_id = ?').run(Number((b || {}).id)); try { NT.event('portal', { kind: 'status' }); } catch (e) {} return sendJSON(res, 200, { ok: true }); });
  }
  return sendJSON(res, 404, { error: 'not_found' });
}

/* → true when handled */
const MISS = new Map();
function handle(req, res, pathname, data) {
  const m = /^\/(?:([pc])\/)?([A-Za-z0-9]+)(\/order|\/maint)?\/?$/.exec(pathname);
  if (!m) return false;
  const bare = !m[1];   // 4.76 · the shortest link: ozarex.pro/<6 letters with a digit>
  if (bare && !(m[2].length === 6 && /\d/.test(m[2]))) return false;
  const isOrder = !!m[3];
  if (isOrder ? req.method !== 'POST' : req.method !== 'GET') return false;
  /* a short code is guessable only by trying a lot — too many wrong ones from one address → wait */
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), now = Date.now();
  const miss = MISS.get(ip);
  if (miss && miss.n >= 30 && now - miss.t < 600e3) { res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '600' }); res.end('حاولت كتير — جرّب بعد شوية'); return true; }
  /* data() → every branch: [{ id, name, data }] (or plain datasets, older callers) */
  const stores = [].concat(data() || []).map(x => x && x.data ? x : { id: 'main', name: '', data: x || {} });
  if (bare && !stores.some(x => findCenter(x.data, m[2]))) { const x = MISS.get(ip); MISS.set(ip, x && now - x.t < 600e3 ? { n: x.n + 1, t: x.t } : { n: 1, t: now }); return false; }   // not a center → the app handles it
  if (isOrder) { if (m[3] === '/maint') takeMaint(req, res, stores, m[2]); else takeOrder(req, res, stores, m[2]); return true; }
  let st = stores[0] || { data: {} }, c = null;
  for (const x of stores) { const k = findCenter(x.data, m[2]); if (k) { st = x; c = k; break; } }
  if (!c) { const x = MISS.get(ip); MISS.set(ip, x && now - x.t < 600e3 ? { n: x.n + 1, t: x.t } : { n: 1, t: now }); if (MISS.size > 5000) MISS.clear(); }
  const html = c ? page(st.data, c, new URL(req.url, 'http://x').searchParams, m[2], m[1] || '', st.id) : notFound();
  const status = c ? 200 : 404;
  const headers = {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY'
  };
  const buf = Buffer.from(html);
  if (status === 200 && buf.length >= 1024 && /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))) {
    zlib.gzip(buf, { level: 6 }, (err, gz) => {
      if (res.headersSent || res.writableEnded) return;
      if (err || !gz || gz.length >= buf.length) { res.writeHead(status, headers); res.end(html); return; }
      res.writeHead(status, Object.assign({}, headers, { 'Content-Encoding': 'gzip', 'Content-Length': gz.length, 'Vary': 'Accept-Encoding' }));
      res.end(gz);
    });
    return true;
  }
  res.writeHead(status, headers);
  res.end(html);
  return true;
}

module.exports = { handle, adminApi, setNotify };

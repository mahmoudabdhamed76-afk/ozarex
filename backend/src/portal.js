'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · لينك المركز — /p/<token>
   A read-only page for ONE center: balance, how old the debt is, the
   latest movements and a printable statement. No login: the token in
   settings._portal (made from «أعمار الديون») is the key, and the admin
   can stop it any time. Numbers come from js/axcore.js — the same code
   the program itself uses.
════════════════════════════════════════════════════════════════════ */
const path = require('node:path');
const AX = require(process.env.PUBLIC_DIR ? path.join(process.env.PUBLIC_DIR, 'js', 'axcore.js') : path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'axcore.js'));

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
function cur(s) { const c = (s && s.currency) || 'جنيه'; return c === 'جنيه' ? 'ج.م' : c === 'ريال' ? 'ر.س' : c === 'درهم' ? 'د.إ' : c; }
function today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const dmy = ds => { if (!ds) return ''; const p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; };

function findCenter(d, token) {
  if (!/^[a-f0-9]{32,64}$/.test(String(token || ''))) return null;
  const map = (d.settings && d.settings._portal) || {};
  const cid = Object.keys(map).find(k => map[k] === token);
  if (!cid) return null;
  return (d.customers || []).find(c => c.id === cid) || null;
}

function page(d, c) {
  const s = d.settings || {}, C = cur(s), t = today();
  const a = AX.aging(d, c.id, t), st = AX.statement(d, c.id, 60);
  const due = Math.max(0, a.balance), total = a.buckets.reduce((x, v) => x + v, 0) || 1;
  const labels = ['30 يوم أو أقل', '31 – 60 يوم', '61 – 90 يوم', 'أكتر من 90 يوم'];
  const colors = ['#1E9A4C', '#D98200', '#E8590C', '#E01B0F'];
  const logo = typeof s.companyLogo === 'string' && s.companyLogo.startsWith('data:image') ? s.companyLogo : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(c.name)} — كشف حساب ${esc(s.companyName || 'نظام الحسابات')}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
:root{--bg:#F2F2F2;--card:#fff;--soft:#F6F6F6;--line:#E6E6E6;--ink:#000;--mut:#6B6B6B;--faint:#9A9A9A}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#121212;--soft:#1A1A1A;--line:#262626;--ink:#fff;--mut:#9E9E9E;--faint:#6E6E6E}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:'IBM Plex Sans Arabic','Cairo',Tahoma,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.w{max-width:760px;margin:0 auto;padding:18px 16px 40px}
.top{display:flex;align-items:center;gap:12px;margin-bottom:14px}.top img{width:46px;height:46px;border-radius:12px;object-fit:contain;background:#fff}
.top b{display:block;font-size:17px}.top span{font-size:12.5px;color:var(--mut)}
.hero{background:#000;color:#fff;border-radius:24px;padding:22px}
@media (prefers-color-scheme:dark){.hero{background:#161616;box-shadow:0 0 0 1px var(--line)}}
.hero small{display:block;color:#A6A6A6;font-size:13px}.hero .v{font:800 40px/1.15 'Zain','IBM Plex Sans Arabic',sans-serif;margin:4px 0 2px;font-variant-numeric:tabular-nums}
.bar{display:flex;gap:2px;height:12px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.12);margin-top:14px}.bar i{display:block;height:100%}
.leg{list-style:none;padding:0;margin:12px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.leg li{display:flex;align-items:center;gap:8px;font-size:12.5px;background:rgba(255,255,255,.07);border-radius:12px;padding:8px 10px}
.leg i{width:10px;height:10px;border-radius:3px;flex:none}.leg b{margin-inline-start:auto;font-variant-numeric:tabular-nums}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
.facts div{background:var(--card);border-radius:18px;padding:14px}.facts span{display:block;font-size:12px;color:var(--mut)}.facts b{font-size:17px}
.card{background:var(--card);border-radius:20px;padding:16px;margin-top:12px}.card h2{font-size:15px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}th{font-weight:700;color:var(--mut);text-align:right;padding:8px 6px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:top}td.n{white-space:nowrap;font-variant-numeric:tabular-nums}
.d{color:#E01B0F}.c{color:#1E9A4C}.foot{margin-top:16px;font-size:12px;color:var(--faint);text-align:center}
.btn{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:14px;padding:11px 16px;background:var(--ink);color:var(--bg);font:700 14px inherit;cursor:pointer;font-family:inherit}
.acts{display:flex;justify-content:flex-end;margin-top:12px}
@media print{body{background:#fff;color:#000}.acts,.foot a{display:none}.hero{background:#fff;color:#000;border:1px solid #000}.hero small{color:#444}.card,.facts div{border:1px solid #ccc}}
</style></head><body><div class="w">
<div class="top">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><b>${esc(s.companyName || 'نظام الحسابات')}</b><span>كشف حساب — ${dmy(t)}</span></div></div>
<section class="hero"><small>المستحق على ${esc(c.name)}</small><div class="v">${num(due)} <span style="font-size:20px">${esc(C)}</span></div>
<small>${due > 0.5 ? (a.oldestDays > 0 ? 'أقدم مبلغ مستحق من ' + a.oldestDays + ' يوم' : 'مستحق حديثاً') : 'الحساب مسدد بالكامل — شكراً لكم 🙏'}</small>
${due > 0.5 ? `<div class="bar">${a.buckets.map((v, i) => v > 0 ? `<i style="width:${(v / total * 100).toFixed(2)}%;background:${colors[i]}"></i>` : '').join('')}</div>
<ul class="leg">${a.buckets.map((v, i) => `<li><i style="background:${colors[i]}"></i><span>${labels[i]}</span><b>${num(v)}</b></li>`).join('')}</ul>` : ''}
</section>
<div class="facts"><div><span>آخر دفعة</span><b>${a.lastPay ? num(a.lastPay.amount) + ' ' + esc(C) : '—'}</b><span>${a.lastPay ? dmy(a.lastPay.date) : ''}</span></div>
<div><span>عدد الحركات</span><b>${st.count}</b><span>من أول التعامل</span></div></div>
<section class="card"><h2>آخر الحركات</h2>${st.rows.length ? `<table><thead><tr><th>التاريخ</th><th>البيان</th><th>عليكم</th><th>دفعتم</th><th>الرصيد</th></tr></thead><tbody>
${st.rows.map(r => `<tr><td class="n">${dmy(r.date)}</td><td>${esc(r.label)}</td><td class="n d">${r.debit ? num(r.debit) : ''}</td><td class="n c">${r.credit ? num(r.credit) : ''}</td><td class="n">${num(r.balance)}</td></tr>`).join('')}
</tbody></table>` : '<p style="color:var(--mut)">مفيش حركات لسه</p>'}</section>
<div class="acts"><button class="btn" onclick="print()">🖨️ طباعة / PDF</button></div>
<p class="foot">الصفحة دي لحسابكم بس، والأرقام بتتحدّث أول بأول.${s.companyPhone ? ' للاستفسار: ' + esc(s.companyPhone) : ''}</p>
</div></body></html>`;
}

function notFound() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>اللينك مش شغال</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;font-family:Tahoma,system-ui,sans-serif;background:#F2F2F2;color:#000;text-align:center;padding:16px}b{display:block;font-size:20px;margin-bottom:6px}span{color:#6B6B6B}</style></head>
<body><div><b>اللينك ده مش شغال</b><span>يمكن اتوقف أو اتغير — اطلب لينك جديد من الشركة.</span></div></body></html>`;
}

/* → true when handled */
function handle(req, res, pathname, data) {
  const m = /^\/p\/([A-Za-z0-9]+)\/?$/.exec(pathname);
  if (!m || req.method !== 'GET') return false;
  const d = data();
  const c = findCenter(d, m[1]);
  const html = c ? page(d, c) : notFound();
  res.writeHead(c ? 200 : 404, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY'
  });
  res.end(html);
  return true;
}

module.exports = { handle };

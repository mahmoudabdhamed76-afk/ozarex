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
const zlib = require('node:zlib');
const AX = require(process.env.PUBLIC_DIR ? path.join(process.env.PUBLIC_DIR, 'js', 'axcore.js') : path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'axcore.js'));

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
function cur(s) { const c = (s && s.currency) || 'جنيه'; return c === 'جنيه' ? 'ج.م' : c === 'ريال' ? 'ر.س' : c === 'درهم' ? 'د.إ' : c; }
function today() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ_APP || 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); } }   // 4.72 · Egypt's date even on a UTC server
const dmy = ds => { if (!ds) return ''; const p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; };

function findCenter(d, token) {
  if (!/^[a-f0-9]{32,64}$/.test(String(token || ''))) return null;
  const map = (d.settings && d.settings._portal) || {};
  const cid = Object.keys(map).find(k => map[k] === token);
  if (!cid) return null;
  return (d.customers || []).find(c => c.id === cid) || null;
}


/* 4.72 · متابعة العملاء — يوم / شهر / سنة: الورق اللي وصل، الفواتير، والتحصيلات في الفترة */
const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const p2 = n => String(n).padStart(2, '0');
function periodOf(q, t) {
  let v = ['day', 'month', 'year'].includes(q.get('v')) ? q.get('v') : 'month', d = String(q.get('d') || '');
  if (v === 'day' && !/^\d{4}-\d{2}-\d{2}$/.test(d)) d = t;
  if (v === 'month' && !/^\d{4}-\d{2}$/.test(d)) d = t.slice(0, 7);
  if (v === 'year' && !/^\d{4}$/.test(d)) d = t.slice(0, 4);
  const shift = k => {
    if (v === 'year') return String(+d + k);
    if (v === 'month') { const x = +d.slice(0, 4) * 12 + (+d.slice(5, 7) - 1) + k; return Math.floor(x / 12) + '-' + p2(x % 12 + 1); }
    const z = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + k)); return z.toISOString().slice(0, 10);
  };
  const label = v === 'year' ? 'سنة ' + d : v === 'month' ? MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : (d === t ? 'النهارده · ' : '') + dmy(d);
  const cut = v === 'year' ? t.slice(0, 4) : v === 'month' ? t.slice(0, 7) : t;
  return { v, d, t, label, prev: shift(-1), next: d < cut ? shift(1) : null, has: x => String(x || '').slice(0, d.length) === d };
}
function periodHtml(d, c, P, C, tok) {
  const iss = (d.issuances || []).filter(i => i.customerId === c.id && P.has(i.date)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.number || 0) - (a.number || 0));
  const inv = (d.invoices || []).filter(v => v.customerId === c.id && !v.archived && P.has(v.date)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.number || 0) - (a.number || 0));
  const pay = (d.payments || []).filter(x => x.customerId === c.id && P.has(x.date) && Number(x.amount) > 0).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const issVal = iss.reduce((t, i) => t + (Number(i.total) || 0), 0), payVal = pay.reduce((t, x) => t + (Number(x.amount) || 0), 0);
  const byP = {}; iss.forEach(i => { const k = (i.productName || 'صنف') + '|' + (i.productUnit || ''); const x = byP[k] || (byP[k] = { name: i.productName || 'صنف', unit: i.productUnit || '', qty: 0, val: 0 }); x.qty += Number(i.quantity) || 0; x.val += Number(i.total) || 0; });
  const st = (tot, paid) => { const r = (Number(tot) || 0) - (Number(paid) || 0); return r <= 0.5 ? '<span class="tg ok">مسدد</span>' : (Number(paid) || 0) > 0.5 ? '<span class="tg pt">باقي ' + num(r) + '</span>' : '<span class="tg no">آجل</span>'; };
  const href = (v, dd) => '/p/' + tok + '?v=' + v + '&d=' + dd;
  const t = P.t, inP = P.has(t);
  const tabs = [['day', 'يوم', P.v === 'day' ? P.d : inP ? t : (P.v === 'month' ? P.d + '-01' : P.d + '-01-01')], ['month', 'شهر', P.v === 'year' ? (inP ? t.slice(0, 7) : P.d + '-01') : P.d.slice(0, 7)], ['year', 'سنة', P.d.slice(0, 4)]];
  const days = new Set(iss.map(i => i.date)).size;
  return `<nav class="per">
<div class="seg">${tabs.map(x => `<a class="${P.v === x[0] ? 'on' : ''}" href="${href(x[0], x[2])}">${x[1]}</a>`).join('')}</div>
<div class="mv"><a class="ar" href="${href(P.v, P.prev)}" aria-label="اللي قبله">‹</a><b>${esc(P.label)}</b>${P.next ? `<a class="ar" href="${href(P.v, P.next)}" aria-label="اللي بعده">›</a>` : '<span class="ar off">›</span>'}</div>
${P.v === 'day' ? `<form class="pk" method="get" action="/p/${tok}"><input type="hidden" name="v" value="day"><input type="date" name="d" value="${P.d}" onchange="this.form.submit()"></form>` : ''}
</nav>
<div class="facts f3"><div><span>الورق اللي وصلكم</span><b>${iss.length}</b><span>${iss.length ? 'عملية صرف' + (P.v !== 'day' ? ' في ' + days + ' يوم' : '') : 'مفيش صرف في الفترة دي'}</span></div>
<div><span>قيمة المسحوب</span><b>${num(issVal)}</b><span>${esc(C)}</span></div>
<div><span>اللي دفعتوه</span><b class="c">${num(payVal)}</b><span>${pay.length ? pay.length + ' دفعة' : '—'}</span></div></div>
${Object.keys(byP).length ? `<section class="card"><h2>📦 ملخص الأصناف</h2><div class="chips">${Object.values(byP).sort((a, b) => b.qty - a.qty).map(x => `<div class="chip"><b>${num(x.qty)}</b><span>${esc(x.unit)}</span><small>${esc(x.name)}</small></div>`).join('')}</div></section>` : ''}
<section class="card"><h2>🚚 الورق اللي وصلكم</h2>${iss.length ? `<div class="il">${iss.map(i => `<div class="ir"><div class="ip"><b>${esc(i.productName || 'صنف')}</b><span>${dmy(i.date)} · إذن #${esc(i.number)}</span></div><div class="iq"><b>${num(i.quantity)}</b><span>${esc(i.productUnit || '')}</span></div><div class="iv2"><b class="n">${num(i.total)}</b>${st(i.total, i.paid)}</div></div>`).join('')}</div>` : '<p class="mt">مفيش ورق اتصرف في الفترة دي.</p>'}</section>
<section class="card"><h2>🧾 الفواتير</h2>${inv.length ? inv.map(v => `<details class="iv"><summary><span class="n">#${esc(v.number)}</span><span>${dmy(v.date)}</span><b class="n">${num(v.total)} ${esc(C)}</b>${st(v.total, v.paid)}</summary>
${Array.isArray(v.items) && v.items.length ? `<table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${v.items.map(x => `<tr><td>${esc(x.productName || x.name || '')}</td><td class="n">${num(x.qty != null ? x.qty : x.quantity)}</td><td class="n">${num(x.price != null ? x.price : x.unitPrice)}</td><td class="n">${num(x.total)}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="ivf"><span>المدفوع: <b class="c">${num(v.paid)}</b></span><span>الباقي: <b class="${(Number(v.total) || 0) - (Number(v.paid) || 0) > 0.5 ? 'd' : ''}">${num(Math.max(0, (Number(v.total) || 0) - (Number(v.paid) || 0)))}</b></span></div></details>`).join('') : '<p class="mt">مفيش فواتير في الفترة دي.</p>'}</section>
${pay.length ? `<section class="card"><h2>💵 التحصيلات</h2><table><thead><tr><th>التاريخ</th><th>الطريقة</th><th>المبلغ</th></tr></thead><tbody>${pay.map(x => `<tr><td class="n">${dmy(x.date)}</td><td>${esc(x.method || 'نقدي')}${x.reference ? ' · ' + esc(x.reference) : ''}</td><td class="n c">${num(x.amount)}</td></tr>`).join('')}</tbody></table></section>` : ''}`;
}

function page(d, c, q, tok) {
  const s = d.settings || {}, C = cur(s), t = today();
  const a = AX.aging(d, c.id, t), st = AX.statement(d, c.id, 60), P = periodOf(q, t);
  const due = Math.max(0, a.balance), total = a.buckets.reduce((x, v) => x + v, 0) || 1;
  const labels = ['30 يوم أو أقل', '31 – 60 يوم', '61 – 90 يوم', 'أكتر من 90 يوم'];
  const colors = ['#1E9A4C', '#D98200', '#E8590C', '#E01B0F'];
  const logo = typeof s.companyLogo === 'string' && s.companyLogo.startsWith('data:image') ? s.companyLogo : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(c.name)} — كشف حساب ${esc(s.companyName || 'Ozarex')}</title>
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

.per{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:14px 0 2px}.seg{display:flex;background:var(--card);border-radius:14px;padding:4px;gap:2px}
.seg a{padding:8px 16px;border-radius:11px;color:var(--mut);text-decoration:none;font-weight:700;font-size:14px}.seg a.on{background:var(--ink);color:var(--bg)}
.mv{display:flex;align-items:center;gap:8px;margin-inline-start:auto}.mv b{font-size:15px;min-width:110px;text-align:center}
.ar{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--card);color:var(--ink);text-decoration:none;font-size:20px}.ar.off{opacity:.3}
.pk input{font:inherit;padding:8px 10px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.facts.f3{grid-template-columns:repeat(3,minmax(0,1fr))}@media (max-width:480px){.facts.f3 div{padding:12px 10px}.facts.f3 b{font-size:15px}.mv{margin-inline-start:0;width:100%;justify-content:space-between}}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{background:var(--soft);border-radius:14px;padding:10px 12px;min-width:96px}.chip b{font-size:18px}.chip span{font-size:12px;color:var(--mut);margin-inline-start:4px}.chip small{display:block;font-size:12px;color:var(--mut)}
.il{display:flex;flex-direction:column}.ir{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)}.ir:last-child{border-bottom:0}.ip{flex:1;min-width:0}.ip b{display:block;font-size:14px}.ip span{font-size:12px;color:var(--mut)}.iq{text-align:center;min-width:54px;background:var(--soft);border-radius:12px;padding:6px 8px}.iq b{display:block;font-size:16px}.iq span{font-size:11px;color:var(--mut)}.iv2{text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:3px;min-width:76px}.tw{overflow-x:auto}.mt{color:var(--mut);margin:0}
.tg{display:inline-block;font-size:11.5px;font-weight:700;border-radius:8px;padding:2px 8px;white-space:nowrap}.tg.ok{background:rgba(30,154,76,.14);color:#1E9A4C}.tg.pt{background:rgba(217,130,0,.14);color:#D98200}.tg.no{background:rgba(224,27,15,.12);color:#E01B0F}
.iv{border:1px solid var(--line);border-radius:14px;margin-top:8px;overflow:hidden}.iv summary{display:flex;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;list-style:none;font-size:14px}.iv summary::-webkit-details-marker{display:none}
.iv summary b{margin-inline-start:auto}.iv table{margin:0 0 4px}.iv td,.iv th{padding-inline:12px}.ivf{display:flex;gap:16px;padding:8px 12px 12px;font-size:13px;color:var(--mut)}
details.stm summary{cursor:pointer;font-weight:700;font-size:15px}
@media print{.per{display:none}details{display:block}details>*{display:block}body{background:#fff;color:#000}.acts,.foot a{display:none}.hero{background:#fff;color:#000;border:1px solid #000}.hero small{color:#444}.card,.facts div{border:1px solid #ccc}}
</style></head><body><div class="w">
<div class="top">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><b>${esc(s.companyName || 'Ozarex')}</b><span>كشف حساب — ${dmy(t)}</span></div></div>
<section class="hero"><small>المستحق على ${esc(c.name)}</small><div class="v">${num(due)} <span style="font-size:20px">${esc(C)}</span></div>
<small>${due > 0.5 ? (a.oldestDays > 0 ? 'أقدم مبلغ مستحق من ' + a.oldestDays + ' يوم' : 'مستحق حديثاً') : 'الحساب مسدد بالكامل — شكراً لكم 🙏'}</small>
${due > 0.5 ? `<div class="bar">${a.buckets.map((v, i) => v > 0 ? `<i style="width:${(v / total * 100).toFixed(2)}%;background:${colors[i]}"></i>` : '').join('')}</div>
<ul class="leg">${a.buckets.map((v, i) => `<li><i style="background:${colors[i]}"></i><span>${labels[i]}</span><b>${num(v)}</b></li>`).join('')}</ul>` : ''}
</section>
<div class="facts"><div><span>آخر دفعة</span><b>${a.lastPay ? num(a.lastPay.amount) + ' ' + esc(C) : '—'}</b><span>${a.lastPay ? dmy(a.lastPay.date) : ''}</span></div>
<div><span>عدد الحركات</span><b>${st.count}</b><span>من أول التعامل</span></div></div>
${periodHtml(d, c, P, C, tok)}
<section class="card"><details class="stm"><summary>📒 كشف الحساب (آخر الحركات)</summary>${st.rows.length ? `<table><thead><tr><th>التاريخ</th><th>البيان</th><th>عليكم</th><th>دفعتم</th><th>الرصيد</th></tr></thead><tbody>
${st.rows.map(r => `<tr><td class="n">${dmy(r.date)}</td><td>${esc(r.label)}</td><td class="n d">${r.debit ? num(r.debit) : ''}</td><td class="n c">${r.credit ? num(r.credit) : ''}</td><td class="n">${num(r.balance)}</td></tr>`).join('')}
</tbody></table>` : '<p style="color:var(--mut)">مفيش حركات لسه</p>'}</details></section>
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
  /* 4.32 · data() may give one dataset or the list of every branch's: the token is looked up in each */
  const all = [].concat(data() || []);
  let d = all[0] || {}, c = null;
  for (const x of all) { const k = findCenter(x, m[1]); if (k) { d = x; c = k; break; } }
  const html = c ? page(d, c, new URL(req.url, 'http://x').searchParams, m[1]) : notFound();
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

module.exports = { handle };

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
try { const pc = db.prepare('PRAGMA table_info(portal_req)').all().map(c => c.name); if (!pc.includes('rating')) db.exec('ALTER TABLE portal_req ADD COLUMN rating INTEGER'); if (!pc.includes('rate_tags')) db.exec('ALTER TABLE portal_req ADD COLUMN rate_tags TEXT'); } catch (e) { console.error('[portal] rating', e.message); }
db.exec('CREATE TABLE IF NOT EXISTS portal_link (customer_id TEXT PRIMARY KEY, path TEXT, at TEXT)');
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

/* 4.87 · صفحة المركز بقت أبلكيشن: السيرفر بيبعت البيانات (PD) والشكل كله في /portal-app.js و /portal-app.css */
const APPV = String(Date.now());
function forecastOf(d, cid, t) {
  const by = {};
  (d.issuances || []).forEach(i => {
    if (i.customerId !== cid || !i.date) return;
    const k = String(i.productName || '').trim(); if (!k) return;
    const x = by[k] || (by[k] = { name: k, unit: i.productUnit || '', days: {}, qty: 0 });
    x.days[String(i.date).slice(0, 10)] = (x.days[String(i.date).slice(0, 10)] || 0) + (Number(i.quantity) || 0);
  });
  const dd = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  return Object.values(by).map(x => {
    const ds = Object.keys(x.days).sort().filter(z => dd(z, t) <= 365);
    if (ds.length < 2) return null;
    const every = Math.max(1, Math.round(dd(ds[0], ds[ds.length - 1]) / (ds.length - 1))), last = ds[ds.length - 1];
    const since = dd(last, t), next = new Date(Date.parse(last) + every * 864e5).toISOString().slice(0, 10);
    const avg = Math.round(ds.reduce((s0, z) => s0 + x.days[z], 0) / ds.length);
    return { name: x.name, unit: x.unit, every, last, next, since, left: every - since, pct: Math.min(100, Math.round(since / every * 100)), avg };
  }).filter(Boolean).sort((a1, b1) => a1.left - b1.left).slice(0, 4);
}
function dataOf(d, c, tok, pre, br) {
  const s = d.settings || {}, t = today(), a = AX.aging(d, c.id, t), st = AX.statement(d, c.id, 40);
  const self = (pre ? '/' + pre : '') + '/' + tok, ty = +t.slice(0, 4), years = {};
  for (let k = ty; k >= ty - 3; k--) { years[k] = yearOf(d, c.id, String(k)).map(m => ({ val: Math.round(m.val), paid: Math.round(m.paid), n: m.n, items: Object.values(m.items).sort((x1, x2) => x2.qty - x1.qty).map(x => ({ name: x.name, unit: x.unit, qty: x.qty })) })); }
  const inv = (d.invoices || []).filter(v => v.customerId === c.id && !v.archived).sort((x1, x2) => String(x2.date).localeCompare(String(x1.date)) || (x2.number || 0) - (x1.number || 0)).slice(0, 80)
    .map(v => ({ id: v.id, no: v.number, date: v.date, total: Number(v.total) || 0, paid: Number(v.paid) || 0, items: (Array.isArray(v.items) ? v.items : []).map(x => ({ name: x.productName || x.name || '', qty: x.qty != null ? x.qty : x.quantity, price: x.price != null ? x.price : x.unitPrice, total: x.total })) }));
  const pays = (d.payments || []).filter(x => x.customerId === c.id && Number(x.amount) > 0).sort((x1, x2) => String(x2.date).localeCompare(String(x1.date))).slice(0, 60).map(x => ({ date: x.date, amount: Number(x.amount) || 0, method: x.method || '' }));
  const orders = db.prepare('SELECT * FROM portal_req WHERE customer_id = ? AND (branch = ? OR branch IS NULL) ORDER BY id DESC LIMIT 20').all(c.id, br || 'main').map(r => {
    let it = []; try { it = JSON.parse(r.items); } catch (e) {}
    let n = 0; try { n = db.prepare('SELECT COUNT(*) AS n FROM portal_photo WHERE req_id = ?').get(r.id).n; } catch (e) {}
    return { id: r.id, kind: r.kind || 'order', status: r.status, at: r.created_at, items: Array.isArray(it) ? it : [], device: !Array.isArray(it) && it ? it.device || '' : '', urgent: !Array.isArray(it) && it ? !!it.urgent : false, amount: !Array.isArray(it) && it ? it.amount || 0 : 0, note: r.note || '', reply: r.reply || '', rating: r.rating || 0, photos: n };
  });
  const lastOrder = orders.find(o => o.kind === 'order' && o.items.length);
  const pi = s._payinfo && typeof s._payinfo === 'object' ? s._payinfo : {};
  let vapid = ''; try { vapid = NT.push && NT.push.publicKey ? NT.push.publicKey() : ''; } catch (e) {}
  return {
    self, v: APPV, today: t, cur: cur(s), center: { name: c.name },
    company: { name: s.companyName || 'Ozarex', phone: s.companyPhone || '', logo: typeof s.companyLogo === 'string' && s.companyLogo.startsWith('data:image') ? s.companyLogo : '' },
    due: Math.max(0, a.balance), oldest: a.oldestDays, buckets: a.buckets, lastPay: a.lastPay,
    years, invoices: inv, payments: pays, statement: st.rows, orders, lastOrder: lastOrder ? lastOrder.items : null,
    forecast: forecastOf(d, c.id, t), payinfo: { instapay: String(pi.instapay || ''), wallet: String(pi.wallet || ''), bank: String(pi.bank || ''), iban: String(pi.iban || ''), note: String(pi.note || '') },
    orderable: ORDER_ITEMS, devices: DEVICES, vapid
  };
}
function page(d, c, q, tok, pre, br) {
  const D = dataOf(d, c, tok, pre, br), self = D.self;
  const json = JSON.stringify(D).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light only"><meta name="theme-color" content="#0E9F9A">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="${esc(String(c.name).slice(0, 24))}">
<link rel="manifest" href="${self}/manifest.json"><link rel="apple-touch-icon" href="/icons/icon-192.png">
<title>${esc(c.name)} — ${esc(D.company.name)}</title>
<link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/portal-app.css?v=${APPV}">
</head><body><div id="app"><div class="boot"><i></i><b>${esc(c.name)}</b></div></div>
<script>window.PD=${json};</script><script src="/portal-app.js?v=${APPV}"></script></body></html>`;
}
/* a single invoice, printable (→ «حفظ كـ PDF») */
function invoicePage(d, c, id) {
  const s = d.settings || {}, C = cur(s), v = (d.invoices || []).find(x => x.id === id && x.customerId === c.id && !x.archived);
  if (!v) return null;
  const items = Array.isArray(v.items) ? v.items : [], rest = Math.max(0, (Number(v.total) || 0) - (Number(v.paid) || 0));
  const logo = typeof s.companyLogo === 'string' && s.companyLogo.startsWith('data:image') ? s.companyLogo : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>فاتورة #${esc(v.number)} — ${esc(c.name)}</title><link rel="stylesheet" href="/fonts/fonts.css"><style>
body{margin:0;background:#F4F6FA;font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;color:#0F172A}.pg{max-width:720px;margin:20px auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 10px 30px -18px rgba(0,0,0,.3)}
.hd{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0E9F9A;padding-bottom:14px}.hd img{width:54px;height:54px;object-fit:contain}.hd b{font-size:20px;display:block}.hd span{color:#64748B;font-size:13px}.hd .no{margin-inline-start:auto;text-align:left}
.meta{display:flex;justify-content:space-between;margin:16px 0;font-size:14px}table{width:100%;border-collapse:collapse;font-size:14px}th{background:#F1F5F9;text-align:right;padding:9px}td{padding:9px;border-bottom:1px solid #E2E8F0}.n{direction:ltr;text-align:left;font-variant-numeric:tabular-nums}
.tot{margin-top:14px;margin-inline-start:auto;width:260px;font-size:14.5px}.tot div{display:flex;justify-content:space-between;padding:6px 0}.tot .b{font-weight:800;font-size:17px;border-top:2px solid #0F172A}
.ft{margin-top:22px;color:#94A3B8;font-size:12px;text-align:center}.pr{display:block;margin:16px auto 0;border:0;border-radius:12px;background:#0F172A;color:#fff;font:700 15px inherit;font-family:inherit;padding:12px 22px;cursor:pointer}
@media print{body{background:#fff}.pg{box-shadow:none;margin:0}.pr{display:none}}</style></head><body><div class="pg">
<div class="hd">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><b>${esc(s.companyName || 'Ozarex')}</b><span>${esc(s.companyPhone || '')}</span></div><div class="no"><b>فاتورة #${esc(v.number)}</b><span>${dmy(v.date)}</span></div></div>
<div class="meta"><span>العميل: <b>${esc(c.name)}</b></span><span>${rest > 0.5 ? 'الباقي: <b>' + n0(rest) + ' ' + esc(C) + '</b>' : '<b style="color:#16A34A">مسددة ✓</b>'}</span></div>
<table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map(x => `<tr><td>${esc(x.productName || x.name || '')}</td><td class="n">${num(x.qty != null ? x.qty : x.quantity)}</td><td class="n">${num(x.price != null ? x.price : x.unitPrice)}</td><td class="n">${num(x.total)}</td></tr>`).join('')}</tbody></table>
<div class="tot"><div><span>الإجمالي</span><span class="n">${num(v.total)}</span></div><div><span>المدفوع</span><span class="n">${num(v.paid)}</span></div><div class="b"><span>الباقي</span><span class="n">${num(rest)} ${esc(C)}</span></div></div>
<p class="ft">اتطبعت من صفحة حسابكم — ${dmy(today())}</p><button class="pr" onclick="print()">🖨️ طباعة / حفظ PDF</button></div>
<script>setTimeout(function(){try{print()}catch(e){}},600)</script></body></html>`;
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
    try { if (NT.staff) { const emps = NT.staff.techs ? NT.staff.techs() : NT.staff.activeEmps().map(e => e.id); if (emps.length) NT.staff.toEmps(emps, { title: head, body: (device ? device + ': ' : '') + problem + ' — افتح البرنامج ودوس «أنا هاخدها»', tag: 'pmt-' + id, urgent }); } } catch (e) {}
    send(200, { ok: true });
  });
}

/* 4.87 · إشعار للمركز نفسه (لو فعّل الإشعارات من صفحته) */
function notifyCenter(cid, msg) {
  try {
    if (!NT.push || !cid) return;
    const l = db.prepare('SELECT path FROM portal_link WHERE customer_id = ?').get(String(cid));
    NT.push.send(['ctr:' + cid], { title: msg.title, body: msg.body || '', url: (l && l.path) || '/', tag: msg.tag || undefined, urgent: !!msg.urgent }).catch(() => {});
  } catch (e) {}
}
function readJson(req, max, cb, send) {
  let raw = '', size = 0;
  req.on('data', ch => { size += ch.length; if (size > max) { req.destroy(); return; } raw += ch; });
  req.on('end', () => { let b; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(400, { message: 'الطلب مش مفهوم' }); } cb(b || {}); });
}
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
function photosIn(list) {
  return (Array.isArray(list) ? list : []).slice(0, 3).map(u => { const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || '')); if (!m) return null; const buf = Buffer.from(m[2], 'base64'); return buf.length > 200 && buf.length <= 900000 ? { mime: m[1], buf } : null; }).filter(Boolean);
}
/* the center sends a transfer (amount + photo of the receipt) */
function takePay(req, res, found, tok, send) {
  const now = Date.now(), times = (ORD.get(tok) || []).filter(t => now - t < 3600e3);
  if (times.length >= 8) return send(429, { message: 'بعتّوا طلبات كتير — كلمونا' });
  readJson(req, 3000000, b => {
    const amount = Math.round((Number(b.amount) || 0) * 100) / 100; if (!(amount > 0 && amount < 100000000)) return send(400, { message: 'اكتب المبلغ' });
    const method = clean(b.method, 30), photos = photosIn(b.photos);
    times.push(now); ORD.set(tok, times);
    const r = db.prepare("INSERT INTO portal_req (branch, branch_name, customer_id, customer_name, items, note, contact, status, created_at, kind) VALUES (?,?,?,?,?,?,?,?,?, 'pay')")
      .run(found.st.id || 'main', found.st.name || '', found.c.id, String(found.c.name || '').slice(0, 120), JSON.stringify({ amount, method }), clean(b.note, 300), clean(b.contact, 60), 'new', nowTs());
    const id = Number(r.lastInsertRowid);
    photos.forEach(ph => { try { db.prepare('INSERT INTO portal_photo (req_id, mime, data, created_at) VALUES (?,?,?,?)').run(id, ph.mime, ph.buf, nowTs()); } catch (e) {} });
    const head = '💳 تحويل من ' + found.c.name + ': ' + n0(amount);
    try { NT.event('portal', { kind: 'pay', id, cid: found.c.id, center: String(found.c.name || ''), amount, method, photos: photos.length, note: clean(b.note, 300), text: head }); } catch (e) {}
    try { const ids = (NT.admins() || []).slice(0, 50); if (ids.length && NT.push) NT.push.send(ids, { title: head, body: method ? 'عن طريق ' + method : 'اتبعت من صفحة المركز', url: './?go=clients', tag: 'ppy-' + id, urgent: true }).catch(() => {}); } catch (e) {}
    send(200, { ok: true });
  }, send);
}
/* rating the technician after the job */
function takeRate(req, res, found, send) {
  readJson(req, 8000, b => {
    const r = db.prepare("SELECT * FROM portal_req WHERE id = ? AND customer_id = ? AND kind = 'maint'").get(Number(b.id), found.c.id);
    if (!r) return send(404, { message: 'الطلب مش موجود' });
    const stars = Math.max(1, Math.min(5, Math.round(Number(b.stars) || 0))), tags = (Array.isArray(b.tags) ? b.tags : []).slice(0, 6).map(x => clean(x, 20)).filter(Boolean);
    db.prepare('UPDATE portal_req SET rating = ?, rate_tags = ? WHERE id = ?').run(stars, JSON.stringify({ tags, note: clean(b.note, 200) }), r.id);
    let task = null; try { task = db.prepare('SELECT * FROM staff_task WHERE portal_req = ? ORDER BY id DESC LIMIT 1').get(r.id); } catch (e) {}
    const who = task ? (db.prepare('SELECT name FROM staff_emp WHERE id = ?').get(task.emp_id) || {}).name : '';
    try { NT.event('portal', { kind: 'rate', id: r.id, text: '⭐'.repeat(stars) + ' ' + found.c.name + ' قيّم ' + (who || 'الفني') + (tags.length ? ' — ' + tags.join('، ') : '') }); } catch (e) {}
    try { if (task && NT.staff && NT.staff.toEmps) NT.staff.toEmps([task.emp_id], { title: '⭐'.repeat(stars) + ' ' + found.c.name + ' قيّمك', body: tags.join('، ') || 'شكراً على شغلك', tag: 'prt-' + r.id }); } catch (e) {}
    send(200, { ok: true });
  }, send);
}
/* where is the technician now (polled by the center page) */
function trackOf(found, id) {
  const r = db.prepare("SELECT * FROM portal_req WHERE id = ? AND customer_id = ? AND kind = 'maint'").get(Number(id), found.c.id);
  if (!r) return null;
  let t = null; try { t = NT.staff && NT.staff.taskByReq ? NT.staff.taskByReq(r.id) : null; } catch (e) {}
  return { id: r.id, status: r.status, rating: r.rating || 0, task: t };
}

/* ── the admin side: /api/portal/* (server.js checks admin) ── */
function rowOut(r) { let items = []; try { items = JSON.parse(r.items); } catch (e) {} let photos = 0; try { photos = db.prepare('SELECT COUNT(*) AS n FROM portal_photo WHERE req_id = ?').get(r.id).n; } catch (e) {} return Object.assign({}, r, { items, photos }); }
function adminApi(req, res, pathname, me, h) {
  const { sendJSON, readBody } = h, q = new URL(req.url, 'http://x').searchParams;
  if (req.method === 'GET' && pathname === '/api/portal/requests') {
    const st = q.get('status');
    const rows = (st === 'open' ? db.prepare("SELECT * FROM portal_req WHERE status IN ('new','ok','road') ORDER BY id DESC LIMIT 200").all() : db.prepare('SELECT * FROM portal_req ORDER BY id DESC LIMIT 200').all()).map(rowOut);
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
      notifyCenter(r.customer_id, { title: '👷 ' + (emp ? emp.name : 'فني') + ' هييجي يصلّح العطل', body: 'تقدروا تتابعوه من صفحتكم', tag: 'pc-' + r.id });
      try { NT.event('portal', { kind: 'status', id: r.id }); } catch (e) {}
      return sendJSON(res, 200, { ok: true, emp: emp ? emp.name : '' });
    });
  }
  if (req.method === 'GET' && pathname === '/api/portal/count') return sendJSON(res, 200, { newCount: db.prepare("SELECT COUNT(*) AS n FROM portal_req WHERE status = 'new'").get().n });
  if (req.method === 'POST' && pathname === '/api/portal/request') {
    return readBody(req, 0.02).then(b => {
      b = b || {}; const id = Number(b.id), st = String(b.status || '');
      if (!['new', 'ok', 'road', 'sent', 'no'].includes(st)) return sendJSON(res, 400, { error: 'bad', message: 'حالة غلط' });
      const who = me.name || me.username || 'admin';
      const ch = db.prepare('UPDATE portal_req SET status = ?, reply = ?, done_at = ?, done_by = ? WHERE id = ?').run(st, String(b.reply || '').slice(0, 160) || null, nowTs(), who, id).changes;
      if (!ch) return sendJSON(res, 404, { error: 'not_found', message: 'الطلب مش موجود' });
      try { NT.event('portal', { kind: 'status', id }); } catch (e) {}
      try {
        const rr = db.prepare('SELECT * FROM portal_req WHERE id = ?').get(id);
        if (rr) {
          const T = rr.kind === 'maint' ? { ok: '👷 طلب الصيانة اتحوّل لفني', sent: '✅ العطل اتصلح — قيّموا الفني', no: 'طلب الصيانة اتلغى' } : rr.kind === 'pay' ? { sent: '✅ التحويل اتسجّل — شكراً لكم', no: 'التحويل محتاج مراجعة — كلمونا' } : { ok: '✅ طلب الورق اتأكد وبيتجهز', road: '🚚 طلب الورق في الطريق ليكم', sent: '📦 طلب الورق اتسلّم — شكراً لكم', no: 'طلب الورق اتلغى' };
          if (T[st]) notifyCenter(rr.customer_id, { title: T[st], body: rr.customer_name || '', tag: 'pc-' + id });
        }
      } catch (e) {}
      return sendJSON(res, 200, { ok: true });
    });
  }
  /* 4.86 · ريست لمركز: يمسح طلبات الورق أو الصيانة (أو الاتنين) من صفحته ومن «الطلبات» */
  if (req.method === 'POST' && pathname === '/api/portal/reset') {
    return readBody(req, 0.02).then(b => {
      b = b || {}; const cid = String(b.cid || '').slice(0, 80); if (!cid) return sendJSON(res, 400, { error: 'bad', message: 'المركز مش محدد' });
      const kinds = (Array.isArray(b.kinds) ? b.kinds : []).filter(k => k === 'order' || k === 'maint' || k === 'pay'); if (!kinds.length) return sendJSON(res, 400, { error: 'bad', message: 'اختار هتعمل ريست لإيه' });
      const ids = db.prepare('SELECT id FROM portal_req WHERE customer_id = ? AND kind IN (' + kinds.map(() => '?').join(',') + ')').all(cid, ...kinds).map(r => r.id);
      db.exec('BEGIN');
      try {
        ids.forEach(id => { db.prepare('DELETE FROM portal_photo WHERE req_id = ?').run(id); db.prepare('DELETE FROM portal_req WHERE id = ?').run(id); });
        db.exec('COMMIT');
      } catch (er) { db.exec('ROLLBACK'); throw er; }
      try { NT.event('portal', { kind: 'status' }); } catch (e) {}
      return sendJSON(res, 200, { ok: true, n: ids.length });
    });
  }
  if (req.method === 'GET' && pathname === '/api/portal/counts') {
    const cid = String(q.get('cid') || '').slice(0, 80);
    const rows = db.prepare('SELECT kind, COUNT(*) AS n FROM portal_req WHERE customer_id = ? GROUP BY kind').all(cid), o = { order: 0, maint: 0, pay: 0 };
    rows.forEach(r => { o[r.kind === 'maint' ? 'maint' : r.kind === 'pay' ? 'pay' : 'order'] += r.n; });
    return sendJSON(res, 200, o);
  }
  if (req.method === 'POST' && pathname === '/api/portal/request/delete') {
    return readBody(req, 0.02).then(b => { db.prepare('DELETE FROM portal_req WHERE id = ?').run(Number((b || {}).id)); db.prepare('DELETE FROM portal_photo WHERE req_id = ?').run(Number((b || {}).id)); try { NT.event('portal', { kind: 'status' }); } catch (e) {} return sendJSON(res, 200, { ok: true }); });
  }
  return sendJSON(res, 404, { error: 'not_found' });
}

/* → true when handled */
const MISS = new Map();
function handle(req, res, pathname, data) {
  const m = /^\/(?:([pc])\/)?([A-Za-z0-9]+)(\/(?:order|maint|pay|rate|push|track|tech|manifest\.json|inv\/[A-Za-z0-9_-]{1,80}))?\/?$/.exec(pathname);
  if (!m) return false;
  const bare = !m[1];   // 4.76 · the shortest link: ozarex.pro/<6 letters with a digit>
  if (bare && !(m[2].length === 6 && /\d/.test(m[2]))) return false;
  const sub = m[3] ? m[3].slice(1) : '';
  const POSTS = ['order', 'maint', 'pay', 'rate', 'push'];
  const isOrder = sub === 'order' || sub === 'maint';
  if (POSTS.includes(sub) ? req.method !== 'POST' : req.method !== 'GET') return false;
  /* a short code is guessable only by trying a lot — too many wrong ones from one address → wait */
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), now = Date.now();
  const miss = MISS.get(ip);
  if (miss && miss.n >= 30 && now - miss.t < 600e3) { res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '600' }); res.end('حاولت كتير — جرّب بعد شوية'); return true; }
  /* data() → every branch: [{ id, name, data }] (or plain datasets, older callers) */
  const stores = [].concat(data() || []).map(x => x && x.data ? x : { id: 'main', name: '', data: x || {} });
  if (bare && !stores.some(x => findCenter(x.data, m[2]))) { const x = MISS.get(ip); MISS.set(ip, x && now - x.t < 600e3 ? { n: x.n + 1, t: x.t } : { n: 1, t: now }); return false; }   // not a center → the app handles it
  if (isOrder) { if (sub === 'maint') takeMaint(req, res, stores, m[2]); else takeOrder(req, res, stores, m[2]); return true; }
  if (sub) {
    let fd = null; for (const x of stores) { const k = findCenter(x.data, m[2]); if (k) { fd = { st: x, c: k }; break; } }
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!fd) { const x = MISS.get(ip); MISS.set(ip, x && now - x.t < 600e3 ? { n: x.n + 1, t: x.t } : { n: 1, t: now }); send(404, { message: 'اللينك ده مش شغال' }); return true; }
    const self = (m[1] ? '/' + m[1] : '') + '/' + m[2];
    if (sub === 'pay') { takePay(req, res, fd, m[2], send); return true; }
    if (sub === 'rate') { takeRate(req, res, fd, send); return true; }
    if (sub === 'track') { const t = trackOf(fd, new URL(req.url, 'http://x').searchParams.get('id')); send(t ? 200 : 404, t || { message: 'مش موجود' }); return true; }
    if (sub === 'push') {
      readJson(req, 8000, b => {
        try {
          if (b.off) { if (NT.push && NT.push.unsubscribe) NT.push.unsubscribe(b.endpoint); return send(200, { ok: true }); }
          NT.push.subscribe({ id: 'ctr:' + fd.c.id }, b.subscription, req.headers['user-agent']);
          db.prepare('INSERT INTO portal_link (customer_id, path, at) VALUES (?,?,?) ON CONFLICT(customer_id) DO UPDATE SET path = excluded.path, at = excluded.at').run(fd.c.id, self, nowTs());
          send(200, { ok: true });
        } catch (e) { send(400, { message: 'الإشعارات مش متاحة على الجهاز ده' }); }
      }, send);
      return true;
    }
    if (sub === 'tech') {   // the technician's photo, only for a request of this center
      const t = trackOf(fd, new URL(req.url, 'http://x').searchParams.get('id'));
      const ph = t && t.task && t.task.emp_id && NT.staff && NT.staff.staffPhoto ? NT.staff.staffPhoto(t.task.emp_id) : null;
      if (!ph) { res.writeHead(404); res.end(); return true; }
      res.writeHead(200, { 'Content-Type': ph.mime, 'Content-Length': ph.buf.length, 'Cache-Control': 'private, max-age=3600' }); res.end(ph.buf); return true;
    }
    if (sub === 'manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ name: String(fd.c.name) + ' — ' + ((fd.st.data.settings || {}).companyName || 'Ozarex'), short_name: String(fd.c.name).slice(0, 18), start_url: self, scope: self, display: 'standalone', background_color: '#F4F6FA', theme_color: '#0E9F9A', lang: 'ar', dir: 'rtl', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }));
      return true;
    }
    if (sub.indexOf('inv/') === 0) {
      const html = invoicePage(fd.st.data, fd.c, sub.slice(4));
      res.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
      res.end(html || notFound()); return true;
    }
    return false;
  }
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

module.exports = { handle, adminApi, setNotify, notifyCenter };

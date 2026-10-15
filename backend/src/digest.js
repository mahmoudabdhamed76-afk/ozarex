'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · الملخص اليومي + التنبيهات الفورية (4.39)
   ------------------------------------------------------------------
   · Every day at the hour the admin chose (Cairo time): one message with
     every branch — collected (cash / bank), sales, spent (and what had no
     receipt), supplier payments, the daily close (who, when, shortage or
     not closed), expenses waiting for approval, today's and the month's
     profit. Sent on WhatsApp (CallMeBot — free, to the owner's own number)
     and as a push notification to the admin's devices; always kept here
     (daily_digests) so a missed day can be read in «الفلوس» ← «الملخصات».
   · Instant: a daily close with a shortage, an expense waiting for the
     admin, money / goods transferred to a branch.
   The numbers come from the same code as the screens (js/cashbook.js,
   js/branchstats.js).
════════════════════════════════════════════════════════════════════ */
const path = require('node:path');
const { db } = require('../db');
const webpush = require('./webpush');
const PUB = process.env.PUBLIC_DIR || path.join(__dirname, '..', '..', 'frontend', 'public');
const CASH = require(path.join(PUB, 'js', 'cashbook.js'));
const BS = require(path.join(PUB, 'js', 'branchstats.js'));

db.exec(`CREATE TABLE IF NOT EXISTS daily_digests (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, text TEXT NOT NULL, data TEXT, sent TEXT, created_at TEXT NOT NULL)`);

const TZ = () => process.env.TZ_APP || process.env.TZ || 'Africa/Cairo';
const DEF = { on: false, time: '22:00', phone: '', apikey: '', wa: true, push: true, profit: true, alertShort: true, alertApproval: true, alertTransfer: true };
function config() { return Object.assign({}, DEF, webpush.meta('digest') || {}); }
function publicConfig() { const c = config(); return Object.assign({}, c, { apikey: c.apikey ? '••••' + String(c.apikey).slice(-2) : '', hasKey: !!c.apikey }); }
function setConfig(b) {
  const c = config(), out = Object.assign({}, c);
  if (b.on !== undefined) out.on = !!b.on;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time || ''))) out.time = b.time;
  if (b.phone !== undefined) out.phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (b.apikey !== undefined && !/^••••/.test(String(b.apikey))) out.apikey = String(b.apikey || '').replace(/[^\w-]/g, '').slice(0, 40);
  ['wa', 'push', 'profit', 'alertShort', 'alertApproval', 'alertTransfer'].forEach(k => { if (b[k] !== undefined) out[k] = !!b[k]; });
  webpush.meta('digest', out);
  return publicConfig();
}
/* the phone in international form (+20…) — an Egyptian 01… number gets +20 */
function intl(p) { p = String(p || '').replace(/[^\d+]/g, ''); if (/^01\d{9}$/.test(p)) return '+2' + p; if (/^20\d{10}$/.test(p)) return '+' + p; if (/^00/.test(p)) return '+' + p.slice(2); return p.charAt(0) === '+' ? p : (p ? '+' + p : ''); }

function local(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d || new Date());
  const g = t => (f.find(x => x.type === t) || {}).value;
  return { day: g('year') + '-' + g('month') + '-' + g('day'), time: (g('hour') === '24' ? '00' : g('hour')) + ':' + g('minute') };
}
const hm = ts => ts ? new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: TZ(), hour: 'numeric', minute: '2-digit' }).format(new Date(ts)) : '';
const N = v => { v = Number(v); return isFinite(v) ? v : 0; };
const m0 = v => Math.round(N(v)).toLocaleString('en-US');
const DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function dayName(s) { const p = s.split('-'); const d = new Date(+p[0], +p[1] - 1, +p[2]); return DAYS[d.getDay()] + ' ' + (+p[2]) + ' ' + MONTHS[+p[1] - 1]; }

/* ── one branch on one day ── */
function branchDay(d, day) {
  const cfg = CASH.cfgOf(d), fl = CASH.flows(d).filter(x => x.date === day);
  const sum = (f) => fl.filter(f).reduce((s, x) => s + x.amt, 0);
  const isColl = x => x.kind === 'collect' || x.kind === 'banktr';
  const coll = { cash: sum(x => isColl(x) && x.pocket === 'cash'), bank: sum(x => isColl(x) && x.pocket === 'bank'), n: fl.filter(isColl).length };
  const exps = (d.expenses || []).filter(e => e && e.kind !== 'purchase' && String(e.date || '').slice(0, 10) === day);
  const byCat = {};
  exps.forEach(e => { const c = String(e.category || 'أخرى'); const k = byCat[c] || (byCat[c] = { cat: c, amount: 0, noRc: 0 }); k.amount += N(e.amount);
    if (cfg.receipt > 0 && N(e.amount) >= cfg.receipt && !e.custodyId && !(e.attachment && e.attachment.data)) k.noRc += N(e.amount); });
  const L = CASH.ledger(d);
  const close = L.counts.filter(c => c.date === day).pop() || null;
  const S = BS.summary(d, [day, day]), M = BS.summary(d, [day.slice(0, 8) + '01', day]);
  const pend = ((d.settings && d.settings._approvals) || []).filter(r => r && r.status === 'pending' && r.diff && r.diff.cols && r.diff.cols.expenses).map(r => ({ title: r.title || 'مصروف', by: (r.by && r.by.name) || '' }));
  return {
    coll, sales: S.sales, salesDocs: S.salesDocs, spent: exps.reduce((s, e) => s + N(e.amount), 0), cats: Object.values(byCat).sort((a, b) => b.amount - a.amount),
    supplier: -sum(x => x.kind === 'supplier'), draws: -sum(x => x.kind === 'draw'),
    close: close ? { by: close.by, at: close.at, total: close.total, diff: close.diff } : null, cashOn: cfg.on, active: fl.length > 0 || S.salesDocs > 0,
    profit: S.profit, monthProfit: M.profit, pending: pend
  };
}

/* ── the whole message ── */
function build(branchList, day, cfg) {
  cfg = cfg || config();
  const parts = [], rows = [], short = [];
  let tColl = 0, tSpent = 0, tProfit = 0, tMonth = 0, missing = [];
  branchList.forEach(b => {
    const x = branchDay(b.data, day);
    rows.push(Object.assign({ id: b.id, name: b.name }, x));
    tColl += x.coll.cash + x.coll.bank; tSpent += x.spent; tProfit += x.profit; tMonth += x.monthProfit;
    let t = '*🏠 ' + b.name + '*\n';
    t += '💰 اتحصّل *' + m0(x.coll.cash + x.coll.bank) + '*' + (x.coll.bank ? ' (كاش ' + m0(x.coll.cash) + ' · بنك ' + m0(x.coll.bank) + ')' : '') + (x.coll.n ? ' — ' + x.coll.n + ' عملية' : '') + '\n';
    if (x.sales) t += '🧾 مبيعات *' + m0(x.sales) + '* — ' + x.salesDocs + ' فاتورة\n';
    t += '💸 اتصرف *' + m0(x.spent) + '*\n';
    if (x.cats.length) t += '   ' + x.cats.slice(0, 5).map(c => c.cat + ' ' + m0(c.amount) + (c.noRc ? ' ⚠من غير إيصال' : '')).join(' · ') + '\n';
    if (x.supplier) t += '🏭 سداد موردين ' + m0(x.supplier) + '\n';
    if (x.draws) t += '👤 اتحوّلك ' + m0(x.draws) + '\n';
    if (x.close) {
      const st = x.close.diff == null ? 'أول عدّ' : Math.abs(x.close.diff) < 1 ? 'مطابق ✅' : x.close.diff < 0 ? '🔴 *عجز ' + m0(-x.close.diff) + '*' : '🟡 زيادة ' + m0(x.close.diff);
      t += '🔒 التقفيل: ' + (x.close.by || '—') + ' ' + hm(x.close.at) + ' — ' + st + '\n';
      if (x.close.diff != null && x.close.diff <= -1) short.push(b.name + ' ' + m0(-x.close.diff));
    } else if (x.cashOn || x.active) { t += '❗ *ما قفلش اليومية*\n'; missing.push(b.name); }
    if (cfg.profit) t += '📈 ربح النهارده تقريباً ' + m0(x.profit) + '\n';
    parts.push(t);
  });
  const pend = rows.flatMap(r => r.pending.map(p => p.title + (p.by ? ' (' + p.by + ')' : '') + (rows.length > 1 ? ' — ' + r.name : '')));
  const head = '*📊 ملخص ' + dayName(day) + '*\n';
  let tail = '';
  if (pend.length) tail += '\n⏳ *مستني موافقتك:*\n' + pend.slice(0, 6).map(p => '• ' + p).join('\n') + '\n';
  if (cfg.profit) tail += '\n📅 ربح الشهر لحد دلوقتي *' + m0(tMonth) + '*';
  if (rows.length > 1) tail = '\n*الإجمالي:* اتحصّل ' + m0(tColl) + ' · اتصرف ' + m0(tSpent) + (cfg.profit ? ' · ربح النهارده ' + m0(tProfit) : '') + '\n' + tail;
  const text = head + '\n' + parts.join('\n') + tail;
  /* the short form for a notification */
  const pushBody = 'اتحصّل ' + m0(tColl) + ' · اتصرف ' + m0(tSpent) + (cfg.profit ? ' · ربح ' + m0(tProfit) : '') +
    (short.length ? '\n🔴 عجز: ' + short.join('، ') : '') + (missing.length ? '\n❗ ما قفلش: ' + missing.join('، ') : '') + (pend.length ? '\n⏳ ' + pend.length + ' مصروف مستني موافقتك' : '');
  return { day, text, pushTitle: '📊 ملخص ' + dayName(day), pushBody, rows, short, missing, pending: pend.length };
}

/* ── delivery ── */
async function whatsapp(cfg, text) {
  const phone = intl(cfg.phone);
  if (!phone || !cfg.apikey) return { ok: false, skipped: true, why: 'مفيش رقم أو كود تفعيل' };
  /* a long message goes in pieces (the free API takes the text in the link) */
  const chunks = [], lines = text.split('\n'); let cur = '';
  lines.forEach(l => { if (encodeURIComponent(cur + l + '\n').length > 5000 && cur) { chunks.push(cur); cur = ''; } cur += l + '\n'; });
  if (cur.trim()) chunks.push(cur);
  const out = [];
  for (const c of chunks) {
    try {
      const r = await fetch((process.env.CALLMEBOT_URL || 'https://api.callmebot.com/whatsapp.php') + '?phone=' + encodeURIComponent(phone) + '&text=' + encodeURIComponent(c.trim()) + '&apikey=' + encodeURIComponent(cfg.apikey), { signal: AbortSignal.timeout(20000) });
      const body = (await r.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      out.push({ ok: r.ok && !/error|invalid|not/i.test(body.slice(0, 60)), status: r.status, body });
    } catch (e) { out.push({ ok: false, error: e.message }); }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 1500));
  }
  return { ok: out.every(x => x.ok), parts: out.length, results: out };
}
function admins(mainData) { return ((mainData && mainData.users) || []).filter(u => u && u.role === 'admin' && !u.disabled).map(u => u.id); }

function save(day, kind, title, text, data, sent) {
  db.prepare('INSERT INTO daily_digests (day, kind, title, text, data, sent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(day, kind, title || '', text, JSON.stringify(data || {}), JSON.stringify(sent || {}), new Date().toISOString());
  db.prepare("DELETE FROM daily_digests WHERE id NOT IN (SELECT id FROM daily_digests ORDER BY id DESC LIMIT 400)").run();
}
function history(limit) {
  return db.prepare('SELECT id, day, kind, title, text, sent, created_at FROM daily_digests ORDER BY id DESC LIMIT ?').all(Math.min(200, Number(limit) || 60))
    .map(r => { let s = {}; try { s = JSON.parse(r.sent || '{}'); } catch (_) {} return { id: r.id, day: r.day, kind: r.kind, title: r.title, text: r.text, sent: s, at: r.created_at }; });
}

/* ctx: { branches: [{ id, name, data }], mainData } */
async function run(ctx, opts) {
  opts = opts || {};
  const cfg = config(), day = opts.day || local().day;
  const D = build(ctx.branches, day, cfg);
  const sent = {};
  if (cfg.wa || opts.test) sent.wa = await whatsapp(cfg, opts.test ? '🧪 *رسالة تجربة من Ozarex*\n\n' + D.text : D.text);
  if (cfg.push || opts.test) sent.push = await webpush.send(opts.to || admins(ctx.mainData), { title: (opts.test ? '🧪 ' : '') + D.pushTitle, body: D.pushBody, url: './?go=fulus', tag: 'digest-' + day, urgent: D.short.length > 0 });
  if (!opts.test) save(day, 'digest', D.pushTitle, D.text, { short: D.short, missing: D.missing, pending: D.pending }, sent);
  return Object.assign({ sent }, D);
}

/* ── instant alerts ── */
async function alert(ctx, kind, title, body, opts) {
  const cfg = config();
  if (!cfg.on) return null;
  if (kind === 'short' && !cfg.alertShort) return null;
  if (kind === 'approval' && !cfg.alertApproval) return null;
  if (kind === 'transfer' && !cfg.alertTransfer) return null;
  const sent = {};
  if (cfg.push) sent.push = await webpush.send(admins(ctx.mainData), { title, body, url: (opts && opts.url) || './?go=fulus', tag: kind + '-' + Date.now(), urgent: kind === 'short' });
  if (cfg.wa && kind !== 'transfer') sent.wa = await whatsapp(cfg, '*' + title + '*\n' + body);
  save(local().day, kind, title, title + '\n' + body, {}, sent);
  return sent;
}
/* after a change was accepted in a branch: a close with a shortage · an expense now waiting for the admin */
function onOps(ctx, branch, before, ops, user) {
  try {
    const cfg = config(); if (!cfg.on) return;
    const sets = (ops && ops.sets) || {};
    const cc = sets._cashCounts && sets._cashCounts.added;
    if (cc && cc.length) {
      const L = CASH.ledger(branch.data);
      cc.forEach(c => {
        const row = L.counts.find(r => r.id === c.id);
        if (row && row.diff != null && row.diff <= -1) alert(ctx, 'short', '🔴 عجز ' + m0(-row.diff) + ' — ' + branch.name, 'تقفيل ' + (row.by || (user && user.name) || '') + ' ' + hm(row.at || Date.now()) + ': المعدود ' + m0(row.total) + ' والمفروض ' + m0(row.expected)).catch(e => console.error('[digest] alert', e.message));
      });
    }
    const ap = sets._approvals;
    if (ap) {
      const wasPending = new Set(((before && before.settings && before.settings._approvals) || []).filter(r => r && r.status === 'pending').map(r => r.id));
      const now = ((branch.data.settings && branch.data.settings._approvals) || []).filter(r => r && r.status === 'pending' && !wasPending.has(r.id) && r.diff && r.diff.cols && r.diff.cols.expenses);
      now.forEach(r => alert(ctx, 'approval', '⏳ مصروف مستني موافقتك — ' + branch.name, (r.title || 'مصروف') + ((r.by && r.by.name) ? ' (' + r.by.name + ')' : ''), { url: './?go=approvals' }).catch(e => console.error('[digest] alert', e.message)));
    }
  } catch (e) { console.error('[digest] onOps', e.message); }
}

/* ── the clock: once a day at the chosen time (a server that was down sends it as soon as it is back the same day) ── */
let timer = null, busy = false;
function start(getCtx) {
  if (timer) return;
  const tick = async () => {
    if (busy) return;
    const cfg = config(); if (!cfg.on) return;
    const t = local();
    if (t.time < cfg.time || webpush.meta('digest_last') === t.day) return;
    busy = true;
    try { webpush.meta('digest_last', t.day); await run(getCtx(), { day: t.day }); }
    catch (e) { console.error('[digest] run', e.message); }
    finally { busy = false; }
  };
  const every = Number(process.env.DIGEST_TICK_MS) || 30e3;
  timer = setInterval(tick, every); if (timer.unref) timer.unref();
  setTimeout(tick, Math.min(5e3, every));
}

module.exports = { config, publicConfig, setConfig, build, run, alert, onOps, history, start, local, intl, branchDay };

'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · أسعار السوق المباشرة (4.19) — الدولار والدهب للشريط اللي فوق
   ------------------------------------------------------------------
   · الدولار/الجنيه: Yahoo Finance (EGP=X) — ولو مردش: open.er-api.com
   · أونصة الدهب بالدولار: gold-api.com — ولو مردش: Yahoo (GC=F)
   · اليورو والريال والدرهم: open.er-api.com (بيتحدث مرة في اليوم)
   · جرام الدهب بالجنيه محسوب من الأونصة × الدولار (عيار 24 / 21 / 18) —
     ده السعر العالمي المحوّل، مش سعر محلات الصاغة (بيبقى أعلى شوية).
   · كاش دقيقة؛ لو المصادر وقعت بيرجع آخر أسعار معروفة ومعاها stale:true.
   · «التغيّر» = مقارنة بإقفال امبارح (Yahoo) أو بأول سعر شفناه النهارده.
   Zero dependencies: Node 22 global fetch.
════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const OZ = 31.1034768;
const TTL = 60 * 1000;
const UA = { 'User-Agent': 'Mozilla/5.0 (ERP market tape)', 'Accept': 'application/json' };

let cache = null, cacheAt = 0, inflight = null, fxCache = null, fxAt = 0;
let file = null, dayOpen = { day: '', usd: null, oz: null };

function init(dataDir) {
  try {
    file = path.join(dataDir, 'market.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && j.last) cache = j.last;
    if (j && j.dayOpen) dayOpen = j.dayOpen;
  } catch (e) { /* first run */ }
}
function persist() {
  if (!file) return;
  try { fs.writeFileSync(file, JSON.stringify({ last: cache, dayOpen })); } catch (e) {}
}

async function getJSON(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(url.split('?')[0] + ' → ' + r.status);
  return r.json();
}
async function yahoo(sym) {
  const j = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=15m');
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error('yahoo ' + sym + ' empty');
  return { price: m.regularMarketPrice, prev: m.chartPreviousClose || m.previousClose || null };
}
async function erApi() {
  if (fxCache && Date.now() - fxAt < 60 * 60 * 1000) return fxCache;
  const j = await getJSON('https://open.er-api.com/v6/latest/USD');
  if (!j || !j.rates || !(j.rates.EGP > 0)) throw new Error('er-api empty');
  fxCache = j.rates; fxAt = Date.now();
  return fxCache;
}
async function usd() {
  try { const y = await yahoo('EGP=X'); return Object.assign({ src: 'yahoo' }, y); }
  catch (e1) {
    const r = await erApi();
    return { price: r.EGP, prev: null, src: 'er-api' };
  }
}
async function gold() {
  try {
    const j = await getJSON('https://api.gold-api.com/price/XAU');
    if (!(j && j.price > 0)) throw new Error('gold-api empty');
    let prev = null;
    try { prev = (await yahoo('GC=F')).prev; } catch (e) {}
    return { price: j.price, prev, src: 'gold-api' };
  } catch (e1) {
    const y = await yahoo('GC=F');
    return Object.assign({ src: 'yahoo' }, y);
  }
}

function pct(now, before) { return before > 0 ? (now - before) / before * 100 : null; }
function cairoDay() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }

async function fetchAll() {
  const [u, g, fx] = await Promise.allSettled([usd(), gold(), erApi()]);
  if (u.status !== 'fulfilled' && g.status !== 'fulfilled') throw new Error('all sources down: ' + [u.reason, g.reason].map(String).join(' | '));
  const prevLast = cache || {};
  const usdP = u.status === 'fulfilled' ? u.value.price : prevLast.usd;
  const ozP = g.status === 'fulfilled' ? g.value.price : prevLast.goldOz;
  const day = cairoDay();
  if (dayOpen.day !== day) dayOpen = { day, usd: usdP || null, oz: ozP || null };
  if (!dayOpen.usd && usdP) dayOpen.usd = usdP;
  if (!dayOpen.oz && ozP) dayOpen.oz = ozP;
  const usdPrev = (u.status === 'fulfilled' && u.value.prev) || dayOpen.usd;
  const ozPrev = (g.status === 'fulfilled' && g.value.prev) || dayOpen.oz;
  const g24 = ozP && usdP ? ozP / OZ * usdP : null;
  const rates = fx.status === 'fulfilled' ? fx.value : null;
  const per = (code) => rates && rates[code] > 0 && usdP ? usdP / rates[code] : null;   // EGP for 1 unit, at today's dollar
  const out = {
    at: Date.now(),
    usd: usdP || null, usdChg: pct(usdP, usdPrev),
    goldOz: ozP || null, goldOzChg: pct(ozP, ozPrev),
    g24: g24, g21: g24 ? g24 * 21 / 24 : null, g18: g24 ? g24 * 18 / 24 : null,
    goldChg: (pct(ozP, ozPrev) != null && pct(usdP, usdPrev) != null) ? ((1 + pct(ozP, ozPrev) / 100) * (1 + pct(usdP, usdPrev) / 100) - 1) * 100 : pct(ozP, ozPrev),
    eur: per('EUR'), sar: per('SAR'), aed: per('AED'),
    src: { usd: u.status === 'fulfilled' ? u.value.src : 'cache', gold: g.status === 'fulfilled' ? g.value.src : 'cache' },
    stale: u.status !== 'fulfilled' || g.status !== 'fulfilled'
  };
  cache = out; cacheAt = Date.now(); persist();
  return out;
}

async function get() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  if (process.env.MARKET_MOCK) {                                     // offline test data
    const t = Date.now() / 60000, usdP = 48.3 + Math.sin(t) * .2, oz = 2650 + Math.cos(t) * 12, g24v = oz / OZ * usdP;
    cache = { at: Date.now(), usd: usdP, usdChg: .21, goldOz: oz, goldOzChg: -.35, g24: g24v, g21: g24v * .875, g18: g24v * .75, goldChg: -.14, eur: 52.4, sar: 12.88, aed: 13.15, src: { usd: 'mock', gold: 'mock' }, stale: false };
    cacheAt = Date.now(); return cache;
  }
  if (!inflight) inflight = fetchAll().catch((e) => {
    console.warn('[market]', e.message);
    cacheAt = Date.now() - TTL / 2;                                  // try again in ~30 s, not on every request
    if (cache) return Object.assign({}, cache, { stale: true });
    throw e;
  }).finally(() => { inflight = null; });
  return inflight;
}

module.exports = { init, get };

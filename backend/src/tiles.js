'use strict';
/* ════════════════════════════════════════════════════════════════════
   4.81 · صور الخريطة من سيرفرنا: /tiles/<z>/<x>/<y>.png
   OpenStreetMap بيرفض البرامج اللي مش بتبعت مصدر (نسخة الكمبيوتر وتطبيقات الموبايل)،
   و CARTO بقى بيطلب مفتاح — فالسيرفر بيجيب الصورة بنفسه بهوية واضحة
   (User-Agent + Referer زي ما سياسة OSM بتطلب)، ويحفظها في الذاكرة،
   والمتصفح يحفظها أسبوع — يعني طلبات قليلة جداً على سيرفرات OSM.
════════════════════════════════════════════════════════════════════ */
const https = require('node:https');
const CACHE = new Map();                 // key → { buf, type, at }
const MAX = 3000, TTL = 7 * 864e5;
const PENDING = new Map();               // key → [callbacks] (one fetch per tile at a time)
const SOURCES = [
  (z, x, y) => 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png',
  (z, x, y) => 'https://' + 'abc'[(x + y) % 3] + '.tile.openstreetmap.fr/osmfr/' + z + '/' + x + '/' + y + '.png'
];
function get(u, cb) {
  const rq = https.get(u, { headers: { 'User-Agent': 'Ozarex-ERP/4.81 (+https://ozarex.pro; staff map)', 'Referer': 'https://ozarex.pro/', 'Accept': 'image/png,image/*' }, timeout: 8000 }, r => {
    if (r.statusCode !== 200 || !/^image\//.test(String(r.headers['content-type'] || ''))) { r.resume(); return cb(new Error('status ' + r.statusCode)); }
    const parts = []; let n = 0;
    r.on('data', c => { n += c.length; if (n > 400000) { rq.destroy(); return; } parts.push(c); });
    r.on('end', () => cb(null, Buffer.concat(parts), r.headers['content-type']));
    r.on('error', cb);
  });
  rq.on('timeout', () => rq.destroy(new Error('timeout')));
  rq.on('error', cb);
}
function fetchTile(z, x, y, cb, i) {
  i = i || 0;
  if (i >= SOURCES.length) return cb(new Error('no source'));
  get(SOURCES[i](z, x, y), (er, buf, type) => er ? fetchTile(z, x, y, cb, i + 1) : cb(null, buf, type));
}
/* → true when handled */
function handle(req, res, pathname) {
  const m = /^\/tiles\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/.exec(pathname);
  if (!m || req.method !== 'GET') return false;
  const z = +m[1], x = +m[2], y = +m[3], lim = Math.pow(2, z);
  if (z > 19 || x >= lim || y >= lim) { res.writeHead(404); res.end(); return true; }
  const key = z + '/' + x + '/' + y, now = Date.now();
  const send = (buf, type) => {
    res.writeHead(200, { 'Content-Type': type || 'image/png', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=604800', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  };
  const hit = CACHE.get(key);
  if (hit && now - hit.at < TTL) { CACHE.delete(key); CACHE.set(key, hit); send(hit.buf, hit.type); return true; }
  if (PENDING.has(key)) { PENDING.get(key).push([res, send]); return true; }
  PENDING.set(key, [[res, send]]);
  fetchTile(z, x, y, (er, buf, type) => {
    const waiters = PENDING.get(key) || []; PENDING.delete(key);
    if (er) { waiters.forEach(([r]) => { if (!r.headersSent) { r.writeHead(502, { 'Cache-Control': 'no-store' }); r.end(); } }); return; }
    CACHE.set(key, { buf, type, at: Date.now() });
    while (CACHE.size > MAX) CACHE.delete(CACHE.keys().next().value);
    waiters.forEach(([r, s]) => { if (!r.headersSent) s(buf, type); });
  });
  return true;
}
module.exports = { handle };

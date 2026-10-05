/* ════════════════════════════════════════════════════════════════════
   ERP · شريط الدولار والدهب المباشر (4.19)
   مكان «رصيد الورق» في الهيدر وبنفس حجمه: شريط متحرك فيه سعر الدولار
   ودهب عيار 21 / 24 / 18 والأونصة واليورو والريال والدرهم، والتغيّر
   عن إقفال امبارح ▲▼. بيتحدث كل دقيقة من السيرفر (/api/market)،
   ولو النت وقع بيفضل يعرض آخر أسعار ومعاها وقت آخر تحديث.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var KEY = 'ax_market', EVERY = 60 * 1000;
  var data = null, sig = '', timer = 0, busy = false;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function n(v, d) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function time(ts) { try { return new Date(ts).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function delta(c) { if (c == null || !isFinite(c) || Math.abs(c) < 0.005) return null; return { dir: c >= 0 ? 'up' : 'down', text: Math.abs(c).toFixed(2) + '%', good: c >= 0 }; }

  function items(m) {
    if (!m || !m.usd) return [{ key: 'none', label: '💵 الدولار والدهب', value: m && m.failed ? 'مش متاحة دلوقتي — هتتحدث لوحدها' : 'بتحمّل…', level: m && m.failed ? 'bad' : 'info' }];
    var out = [
      { key: 'usd', label: '💵 الدولار', value: n(m.usd, 2) + ' ج', delta: delta(m.usdChg), level: 'info' }
    ];
    if (m.g21) out.push(
      { key: 'g21', label: '🟡 دهب عيار 21', value: n(m.g21) + ' ج/جم', delta: delta(m.goldChg), level: 'warn' },
      { key: 'g24', label: 'عيار 24', value: n(m.g24) + ' ج/جم', delta: delta(m.goldChg), level: 'warn' },
      { key: 'g18', label: 'عيار 18', value: n(m.g18) + ' ج/جم', delta: delta(m.goldChg), level: 'warn' },
      { key: 'oz', label: 'الأونصة', value: '$' + n(m.goldOz), delta: delta(m.goldOzChg), level: 'warn' }
    );
    if (m.eur) out.push({ key: 'eur', label: '💶 اليورو', value: n(m.eur, 2) + ' ج', level: 'info' });
    if (m.sar) out.push({ key: 'sar', label: '🇸🇦 الريال', value: n(m.sar, 2) + ' ج', level: 'info' });
    if (m.aed) out.push({ key: 'aed', label: '🇦🇪 الدرهم', value: n(m.aed, 2) + ' ج', level: 'info' });
    out.push({ key: 'upd', label: m.stale ? 'آخر أسعار معروفة' : 'آخر تحديث', value: time(m.at), sub: m.g21 ? 'الدهب سعر عالمي محوّل للجنيه' : '', level: m.stale ? 'bad' : 'ok' });
    return out;
  }

  function host() {
    var h = document.getElementById('fx-tape');
    if (h && h.isConnected) return h;
    var pc = document.getElementById('paper-counter');
    if (!pc || !pc.parentNode) return null;
    h = document.createElement('div'); h.id = 'fx-tape'; h.className = 'fx-tape ax-hl-off';
    h.setAttribute('aria-label', 'أسعار الدولار والدهب');
    pc.parentNode.insertBefore(h, pc.nextSibling);
    sig = '';
    return h;
  }
  function render(force) {
    var h = host(); if (!h || !window.AXTicker) return;
    var list = items(data), s = JSON.stringify(list.map(function (i) { return [i.key, i.value, i.delta && i.delta.text, i.delta && i.delta.dir]; }));
    if (!force && s === sig && h.firstChild) return;
    sig = s;
    AXTicker.create(h, { id: 'fx', variant: 'bar', label: 'أسعار الدولار والدهب مباشر', items: list });
  }
  function load() {
    if (busy || document.hidden) return;
    if (typeof currentUser === 'undefined' || !currentUser) return;
    busy = true;
    fetch('/api/market', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (m) { if (m && m.usd) { data = m; ls(KEY, JSON.stringify(m)); } })
      .catch(function () { if (data && data.usd) data.stale = true; else data = { failed: true }; })
      .then(function () { busy = false; render(); });
  }
  function boot() {
    try { data = JSON.parse(ls(KEY) || 'null'); } catch (e) { data = null; }
    render(true);
    load();
    clearInterval(timer); timer = setInterval(load, EVERY);
    var quick = setInterval(function () { if (data && data.usd && !data.stale && data.at > Date.now() - 5 * 60e3) clearInterval(quick); else load(); }, 4000);   // right after login
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
    // the header is rebuilt on some screens — put the tape back whenever it goes missing
    new MutationObserver(function () { if (!document.getElementById('fx-tape') && document.getElementById('paper-counter')) render(true); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  else setTimeout(boot, 300);
  window.AXFx = { load: load, render: render, data: function () { return data; } };
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · قايمة الاختيار العايمة بالبحث (4.15)
   على الموبايل: أي قايمة منسدلة (<select>) في البرنامج بدل قايمة
   الآيفون/الأندرويد بتفتح قايمة عايمة تحت الخانة:
   • تكتب جوه الخانة بأي حرف والنتايج تتفلتر وتتعلّم.
   • المراكز: نقطة ملونة (خالص / عليه فلوس / متأخر) + آخر صرف + المبلغ،
     ولو المركز مش موجود «＋ ضيف كمركز جديد» على طول.
   • الأصناف: المتاح في المخزن ونقطة لو خلص أو قرّب يخلص.
   الـ<select> الأصلي فاضل زي ما هو (القيمة والـ onchange وكل الكود
   القديم شغال)، إحنا بس بنمنع القايمة الأصلية ونفتح بتاعتنا.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ROOTS = '#page-content, .modal-overlay, .mh-sheet, #axn';
  var MQ = window.matchMedia('(pointer: coarse), (max-width: 900px)');
  var cur = null, timer = 0;

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function days(a) { return Math.round((pd(today()) - pd(a)) / 86400000); }
  function ago(d) { var n = days(d); return n <= 0 ? 'النهارده' : n === 1 ? 'امبارح' : n === 2 ? 'من يومين' : n <= 10 ? 'من ' + n + ' أيام' : 'من ' + n + ' يوم'; }
  function dd(n) { return n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يوم'; }

  /* per-character Arabic normaliser that keeps an index map, so we can highlight the match in the original text */
  function nch(c) {
    if (/[ً-ٰٟـء]/.test(c)) return '';
    if (/[إأآٱ]/.test(c)) return 'ا';
    if (c === 'ة') return 'ه'; if (c === 'ى' || c === 'ئ') return 'ي'; if (c === 'ؤ') return 'و';
    if (/\s/.test(c)) return ' ';
    return c.toLowerCase();
  }
  function nmap(s) {
    var out = '', map = [];
    for (var i = 0; i < s.length; i++) { var m = nch(s[i]); for (var j = 0; j < m.length; j++) { out += m[j]; map.push(i); } }
    return { s: out, map: map };
  }
  function nq(q) { return nmap(String(q || '').trim().replace(/\s+/g, ' ')).s; }
  function hl(text, q) {
    if (!q) return esc(text);
    var m = nmap(text), at = m.s.indexOf(q);
    if (at < 0) return esc(text);
    var a = m.map[at], b = m.map[at + q.length - 1] + 1;
    return esc(text.slice(0, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>' + esc(text.slice(b));
  }

  /* ════════ which selects ════════ */
  function on() { return MQ.matches; }
  function mark() {
    timer = 0;
    document.documentElement.classList.toggle('axp-mob', on());
    if (!on()) return;
    Array.prototype.forEach.call(document.querySelectorAll(ROOTS), function (r) {
      Array.prototype.forEach.call(r.querySelectorAll('select:not(.axp-on):not([multiple]):not(.axp-native)'), function (s) {
        if (s.size > 1) return;
        s.classList.add('axp-on');
      });
    });
  }
  function later() { if (!timer) timer = setTimeout(mark, 120); }

  function hit(x, y) {
    var list = document.querySelectorAll('select.axp-on'), best = null;
    for (var i = 0; i < list.length; i++) {
      var s = list[i]; if (s.disabled) continue;
      var r = s.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) best = s;   // last = top-most in a stacked modal
    }
    return best;
  }

  /* ════════ what kind of list ════════ */
  function kind(sel) {
    var vals = Array.prototype.map.call(sel.options, function (o) { return o.value; }).filter(Boolean);
    if (!vals.length) return 'plain';
    var cs = {}, ps = {};
    A('customers').forEach(function (c) { cs[c.id] = c; });
    A('products').forEach(function (p) { ps[p.id] = p; });
    var c = vals.filter(function (v) { return cs[v]; }).length, p = vals.filter(function (v) { return ps[v]; }).length;
    if (c >= vals.length * 0.6) return 'cust';
    if (p >= vals.length * 0.6) return 'prod';
    return 'plain';
  }
  function custInfo() {
    var last = {}, R = window.AXRules ? AXRules.get() : {}, od = N(R.overdueDays) || 30;
    A('issuances').forEach(function (i) { if (i.customerId && i.date && (!last[i.customerId] || i.date > last[i.customerId])) last[i.customerId] = i.date; });
    var map = {};
    A('customers').forEach(function (c) {
      var bal = N(c.balance), old = (window.AXCredit && AXCredit.oldestUnpaid) ? AXCredit.oldestUnpaid(c.id) : null;
      var age = old ? days(old) : 0, st = bal <= 0.5 ? 'ok' : (age > od ? 'bad' : 'warn');
      var bits = [];
      if (last[c.id]) bits.push('صرف ' + ago(last[c.id]));
      if (st === 'ok') bits.push('<span class="axp-ok">خالص</span>');
      else bits.push('عليه <b class="axp-' + st + '">' + num(bal) + ' ج</b>' + (st === 'bad' ? ' · متأخر ' + dd(age) : ''));
      map[c.id] = { st: st, name: c.name + (c.company ? ' - ' + c.company : ''), sub: bits.join(' · '), extra: c.phone || '' };
    });
    return map;
  }
  function prodInfo() {
    var map = {};
    A('products').forEach(function (p) {
      var q = N(p.quantity), st = q <= 0 ? 'bad' : (q <= N(p.minQuantity) ? 'warn' : 'ok');
      map[p.id] = { st: st, name: p.name, sub: 'المتاح: <b class="axp-' + st + '">' + num(q) + ' ' + esc(p.unit || '') + '</b>' + (st === 'bad' ? ' · خلص' : st === 'warn' ? ' · قرّب يخلص' : '') };
    });
    return map;
  }

  /* ════════ open / render / pick ════════ */
  function items(sel) {
    var out = [];
    Array.prototype.forEach.call(sel.options, function (o, i) {
      var t = (o.textContent || '').trim();
      if (o.value === '' && (/اختر|اختار/.test(t) || /^[-—–\s]*$/.test(t))) return;   // «-- اختر المركز --» placeholder — «جميع المراكز» stays
      var g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : '';
      out.push({ i: i, v: o.value, t: t, dis: o.disabled, g: g });
    });
    return out;
  }

  function open(sel) {
    close();
    var k = kind(sel), info = k === 'cust' ? custInfo() : k === 'prod' ? prodInfo() : null;
    var r0 = sel.getBoundingClientRect(), vv = window.visualViewport, vh = vv ? vv.height : innerHeight;
    if (r0.top > vh * 0.42) { try { sel.scrollIntoView({ block: 'start' }); } catch (e) { } }
    var all = items(sel);
    var ph = (sel.selectedIndex >= 0 && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].value !== '') ? sel.options[sel.selectedIndex].textContent.trim() : '';

    var bd = document.createElement('div'); bd.className = 'axp-bd';
    var fld = document.createElement('div'); fld.className = 'axp-fld';
    fld.innerHTML = '<span class="axp-ic">🔍</span><input id="axp-q" type="search" enterkeyhint="done" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="' + esc(ph || 'اكتب أي حرف للبحث…') + '"><span class="axp-n"></span>';
    var pop = document.createElement('div'); pop.className = 'axp-pop'; pop.setAttribute('role', 'listbox');
    document.body.appendChild(bd); document.body.appendChild(fld); document.body.appendChild(pop);
    var inp = fld.querySelector('input'), cnt = fld.querySelector('.axp-n');

    cur = { sel: sel, bd: bd, fld: fld, pop: pop, inp: inp, cnt: cnt, k: k, info: info, all: all, act: -1, shown: [] };
    render();
    place();
    if (all.length > 8) inp.focus({ preventScroll: true });     // long list → keyboard right away; short list → just tap
    requestAnimationFrame(function () { if (cur) { cur.fld.classList.add('in'); cur.pop.classList.add('in'); } });

    bd.addEventListener('click', close);
    bd.addEventListener('touchend', function (e) { e.preventDefault(); close(); }, { passive: false });
    pop.addEventListener('mousedown', function (e) { e.preventDefault(); });        // keep the search box focused while tapping a row
    inp.addEventListener('input', function () { cur.act = -1; render(); });
    inp.addEventListener('keydown', key);
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (b) { pick(+b.getAttribute('data-i')); return; }
      if (e.target.closest('.axp-add')) addNew();
    });
    if (vv) { vv.addEventListener('resize', place); vv.addEventListener('scroll', place); }
    addEventListener('resize', place);
  }

  function render() {
    var c = cur, q = nq(c.inp.value), sv = c.sel.value, html = '', g = null;
    c.shown = c.all.filter(function (o) {
      if (!q) return true;
      var t = c.info && c.info[o.v] ? c.info[o.v].name + ' ' + (c.info[o.v].extra || '') : o.t;
      return nmap(t).s.indexOf(q) >= 0;
    });
    if (c.act < 0) {
      c.act = q ? (c.shown.findIndex(function (o) { return !o.dis; })) : c.shown.findIndex(function (o) { return o.v === sv; });
    }
    c.shown.forEach(function (o, n) {
      if (o.g && o.g !== g) { g = o.g; html += '<div class="axp-g">' + esc(g) + '</div>'; }
      var inf = c.info && c.info[o.v], name = inf ? inf.name : o.t;
      html += '<div class="axp-row' + (n === c.act ? ' hi' : '') + (o.v === sv ? ' sel' : '') + (o.dis ? ' dis' : '') + (o.v === '' ? ' all' : '') + '" data-i="' + o.i + '" role="option">' +
        (inf ? '<span class="axp-dot axp-d-' + inf.st + '"></span>' : '') +
        '<div class="axp-tx"><div class="axp-nm">' + hl(name, q) + '</div>' + (inf && inf.sub ? '<div class="axp-sub">' + inf.sub + '</div>' : '') + '</div>' +
        (n === c.act ? '<span class="axp-go">↵</span>' : (o.v === sv ? '<span class="axp-ck">✓</span>' : '')) +
        '</div>';
    });
    if (!c.shown.length) html += '<div class="axp-empty">مفيش نتايج لـ «' + esc(c.inp.value.trim()) + '»</div>';
    var raw = c.inp.value.trim();
    if (c.k === 'cust' && raw && typeof can === 'function' && can('customers') &&
        !c.shown.some(function (o) { var inf = c.info[o.v]; return inf && nq(inf.name) === q; }))
      html += '<button type="button" class="axp-add">＋ ضيف «' + esc(raw) + '» كمركز جديد</button>';
    html += '<div class="axp-foot">' + (c.k === 'cust' ? '<span>🟢 خالص · 🟠 عليه فلوس · 🔴 متأخر</span>' : c.k === 'prod' ? '<span>🟢 متاح · 🟠 قرّب يخلص · 🔴 خلص</span>' : '<span></span>') + '<span>اكتب أي حرف</span></div>';
    c.pop.innerHTML = html;
    c.cnt.textContent = (q && c.shown.length) ? (c.shown.length + (c.shown.length === 1 ? ' نتيجة' : ' نتايج')) : '';
    var a = c.pop.querySelector('.axp-row.hi');
    if (a && !q) a.scrollIntoView({ block: 'nearest' });
  }

  function place() {
    var c = cur; if (!c) return;
    var r = c.sel.getBoundingClientRect(), vv = window.visualViewport;
    var top0 = vv ? vv.offsetTop : 0, bot = vv ? vv.offsetTop + vv.height : innerHeight, W = innerWidth;
    var h = Math.max(r.height, 44);
    c.fld.style.cssText = 'top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + h + 'px';
    var w = Math.min(W - 24, Math.max(r.width, 340));                        // the list may be wider than a narrow filter
    var left = Math.min(Math.max(12, r.right - w), W - w - 12);              // RTL: anchor on the right edge
    var below = bot - (r.top + h) - 16, above = r.top - top0 - 16;
    if (below >= 200 || below >= above) {
      c.pop.style.cssText = 'top:' + (r.top + h + 8) + 'px;left:' + left + 'px;width:' + w + 'px;max-height:' + Math.max(150, below) + 'px';
      c.pop.classList.remove('up');
    } else {
      c.pop.style.cssText = 'bottom:' + (innerHeight - r.top + 8) + 'px;left:' + left + 'px;width:' + w + 'px;max-height:' + Math.max(150, above) + 'px';
      c.pop.classList.add('up');
    }
  }

  function key(e) {
    var c = cur; if (!c) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); var n = c.act, d = e.key === 'ArrowDown' ? 1 : -1;
      for (var k = 0; k < c.shown.length; k++) { n = (n + d + c.shown.length) % c.shown.length; if (!c.shown[n].dis) break; }
      c.act = n; renderKeep(); return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      var o = c.shown[c.act];
      if (o && !o.dis) pick(o.i); else if (c.pop.querySelector('.axp-add')) addNew();
    }
  }
  function renderKeep() { render(); var a = cur.pop.querySelector('.axp-row.hi'); if (a) a.scrollIntoView({ block: 'nearest' }); }

  function pick(i) {
    var c = cur; if (!c) return;
    var o = c.sel.options[i]; if (!o || o.disabled) return;
    var changed = c.sel.selectedIndex !== i;
    c.sel.selectedIndex = i;
    close();
    if (changed) {
      c.sel.dispatchEvent(new Event('input', { bubbles: true }));
      c.sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function addNew() {
    var c = cur; if (!c) return;
    var name = c.inp.value.trim(); if (!name) return;
    var d = D(); if (!Array.isArray(d.customers)) d.customers = [];
    var rec = { id: 'c_' + (typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2, 10)), name: name, phone: '', company: '', address: '', creditLimit: 0, balance: 0, customPrices: {}, createdAt: Date.now() };
    d.customers.push(rec);
    try { DB.save(); } catch (e) { }
    try { if (typeof logAudit === 'function') logAudit({ operation: 'add', table: 'customers', recordId: rec.id, recordLabel: rec.name, before: null, after: JSON.parse(JSON.stringify(rec)), reason: 'إضافة سريعة من قايمة الاختيار' }); } catch (e) { }
    // every customer list on screen gets the new one; this one selects it
    Array.prototype.forEach.call(document.querySelectorAll('select'), function (s) {
      if (s !== c.sel && kind(s) !== 'cust') return;
      var op = document.createElement('option'); op.value = rec.id; op.textContent = rec.name; s.appendChild(op);
    });
    if (typeof toast === 'function') toast('اتضاف «' + name + '» كمركز جديد — تقدر تكمّل بياناته من العملاء والمراكز', 'success');
    pick(c.sel.options.length - 1);
  }

  function close() {
    var c = cur; if (!c) return;
    cur = null;
    var vv = window.visualViewport;
    if (vv) { vv.removeEventListener('resize', place); vv.removeEventListener('scroll', place); }
    removeEventListener('resize', place);
    try { c.inp.blur(); } catch (e) { }
    [c.bd, c.fld, c.pop].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
  }

  /* ════════ wiring ════════ */
  // the real <select> has pointer-events:none on mobile, so the tap lands on whatever is under it — find the select by position.
  // iOS doesn't send «click» to plain containers, so touch is handled on touchend (still a user gesture → the keyboard may open).
  var t0 = null, lastTouch = 0;
  function skipTarget(t) { return t && t.closest && t.closest('button, a, input, textarea, label[for], .axp-pop, .axp-fld, .axp-bd'); }
  document.addEventListener('touchstart', function (e) {
    t0 = (!cur && on() && e.touches.length === 1 && !skipTarget(e.target)) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', function (e) {
    if (!t0 || cur) return;
    var p = e.changedTouches[0], s0 = t0; t0 = null;
    if (Math.abs(p.clientX - s0.x) > 10 || Math.abs(p.clientY - s0.y) > 10) return;      // it was a scroll
    var s = hit(p.clientX, p.clientY); if (!s) return;
    e.preventDefault(); lastTouch = Date.now();
    open(s);
  }, { capture: true, passive: false });
  document.addEventListener('click', function (e) {
    if (cur || !on() || Date.now() - lastTouch < 600) return;
    if (skipTarget(e.target)) return;
    var s = hit(e.clientX, e.clientY); if (!s) return;
    e.preventDefault(); e.stopPropagation();
    open(s);
  }, true);
  // a modal closing / page change under an open list
  function boot() {
    new MutationObserver(function () {
      later();
      if (cur && !document.body.contains(cur.sel)) close();
    }).observe(document.body, { childList: true, subtree: true });
    mark();
    if (MQ.addEventListener) MQ.addEventListener('change', mark); else if (MQ.addListener) MQ.addListener(mark);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.AXPicker = { open: open, close: close, mark: mark };
})();

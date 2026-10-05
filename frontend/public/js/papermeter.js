/* ════════════════════════════════════════════════════════════════════
   ERP · عداد الورق في الهيدر (4.10)
   ------------------------------------------------------------------
   · رصيد الورق (من غير الحبر) بخط كبير، ولونه بيقول حال المخزن:
     أخضر تمام · برتقاني صنف قرب يخلص · أحمر صنف هيخلص خلال أسبوع
   · شريط رفيع تحته = الرصيد يكفي كام يوم (من 30)
   · لما الرصيد يتغير يطلع جنبه «−20» أو «+500» لحظة
   · تدوس عليه: قايمة بكل صنف ورق ورصيده ويكفي لإمتى، وطلع كام النهارده
     والشهر ده، وزرار للصرف ولمخزوني
   · على الموبايل بيبقى سطر كامل تحت عنوان الصفحة
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var last = null, popOpen = false, NEON_MIN = 10000;
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var EXCL = ['حبر', 'تنر', 'تونر', 'ink', 'toner', 'كارتريدج', 'cartridge', 'ريبون', 'ribbon'];
  var INCL = ['ورق', 'بلاستك', 'بلاستيك', 'فوتو', 'photo', 'paper', 'a4', 'a3', 'a5', 'فيلم', 'افلام', 'أفلام'];

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function dm(d) { return d ? d.getDate() + ' ' + MONTHS[d.getMonth()] : ''; }

  function isPaper(p) {
    var name = String(p.name || '').toLowerCase(), unit = String(p.unit || '').toLowerCase();
    if (EXCL.some(function (w) { return name.indexOf(w) >= 0; })) return false;
    if (INCL.some(function (w) { return name.indexOf(w) >= 0 || unit.indexOf(w) >= 0; })) return true;
    return ['ورقة', 'لفة', 'رزمة', 'رول', 'فيلم'].some(function (w) { return unit.indexOf(w) >= 0; });
  }
  function model() {
    var items;
    try { items = (window.AXStock && AXStock.model) ? AXStock.model().items : null; } catch (e) { items = null; }
    if (!items) items = A('products').map(function (p) { var b = +p.quantity || 0; return { p: p, id: p.id, name: p.name, unit: p.unit || '', bal: b, avg: 0, cover: Infinity, state: b <= 0 ? 'empty' : b <= (+p.minQuantity || 0) ? 'low' : 'ok', until: null }; });
    items = items.filter(function (i) { return isPaper(i.p || i); });
    var ids = {}; items.forEach(function (i) { ids[i.id] = 1; });
    var t = today(), ms = t.slice(0, 8) + '01', outToday = 0, outMonth = 0;
    A('stockMoves').forEach(function (m) {
      if (!m || m.type !== 'out' || !ids[m.productId]) return;
      var d = String(m.date || '').slice(0, 10), q = Number(m.quantity || m.qty || 0);
      if (/جرد|تسوية|adjust/i.test(String(m.reference || m.note || ''))) return;
      if (d === t) outToday += q;
      if (d >= ms && d <= t) outMonth += q;
    });
    var total = items.reduce(function (s, i) { return s + Math.max(0, i.bal); }, 0);
    var avg = items.reduce(function (s, i) { return s + (i.avg || 0); }, 0);
    var cover = avg > 0 ? total / avg : Infinity;
    var rank = { empty: 0, crit: 1, low: 2, ok: 3, idle: 4 };
    items.sort(function (a, b) { return (rank[a.state] - rank[b.state]) || (a.cover - b.cover) || (b.bal - a.bal); });
    var bad = items.filter(function (i) { return i.state === 'empty' || i.state === 'crit'; }).length;
    var low = items.filter(function (i) { return i.state === 'low'; }).length;
    var unit = unitOf(items);
    return { items: items, total: total, avg: avg, cover: cover, outToday: outToday, outMonth: outMonth, bad: bad, low: low, unit: unit, state: !items.length ? 'none' : bad ? 'bad' : low ? 'warn' : 'ok' };
  }
  function unitOf(items) {
    var u = {}; items.forEach(function (i) { var k = String(i.unit || '').trim(); if (k) u[k] = (u[k] || 0) + 1; });
    var keys = Object.keys(u);
    if (keys.length === 1) return keys[0];
    return 'ورقة';
  }
  function coverTxt(i) {
    if (i.bal <= 0 || i.state === 'empty') return 'خلص';
    if (!isFinite(i.cover)) return 'مفيش سحب الشهر ده';
    var d = Math.floor(i.cover);
    if (d < 1) return 'يخلص النهارده';
    if (d > 365) return 'يكفي أكتر من سنة';
    return 'يكفي ' + (d === 1 ? 'يوم' : d === 2 ? 'يومين' : d + ' يوم') + (i.until ? ' · لحد ' + dm(i.until) : '');
  }
  function subTxt(M) {
    if (M.state === 'none') return 'مفيش أصناف ورق';
    if (M.bad) return M.bad === 1 ? 'صنف هيخلص قريب' : M.bad + ' أصناف هتخلص قريب';
    if (M.low) return M.low === 1 ? 'صنف قرب يخلص' : M.low + ' أصناف قربت تخلص';
    if (!isFinite(M.cover)) return 'مفيش سحب الشهر ده';
    var d = Math.floor(M.cover);
    return d > 365 ? 'يكفي أكتر من سنة' : 'يكفي ' + d + ' يوم';
  }

  /* ── the chip ── */
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h8l4 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 15.5h4"/><path d="M3 7v12a3 3 0 0 0 3 3h9" opacity=".55"/></svg>';
  function ensure() {
    var el = document.getElementById('paper-counter');
    if (!el || el.dataset.pm) return el;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'paper-counter'; b.className = 'paper-counter pm'; b.dataset.pm = '1';
    /* 4.17 · just a display now — tapping it doesn't open anything */
    b.tabIndex = -1; b.setAttribute('aria-disabled', 'true');
    b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); };
    b.innerHTML = '<span class="pm-ic">' + ICON + '</span>' +
      '<span class="pm-t"><small class="pm-lab">رصيد الورق</small><span class="pm-v"><b class="paper-counter-num" id="paper-counter-num">0</b><em id="pm-unit">ورقة</em></span></span>' +
      '<span class="pm-sub" id="pm-sub"></span>' +
      '<span class="pm-chev" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>' +
      '<span class="pm-lvl" aria-hidden="true"><i id="pm-lvl"></i></span>' +
      '<span class="paper-counter-delta pm-delta" id="paper-counter-delta"></span>';
    el.parentNode.replaceChild(b, el);
    return b;
  }

  function update() {
    var el = ensure(); if (!el || !D().products) return;
    var M = model();
    var n = document.getElementById('paper-counter-num'); if (n) n.textContent = num(M.total);
    var u = document.getElementById('pm-unit'); if (u) u.textContent = M.unit;
    var s = document.getElementById('pm-sub'); if (s) s.textContent = subTxt(M);
    var l = document.getElementById('pm-lvl'); if (l) l.style.width = (isFinite(M.cover) ? Math.max(4, Math.min(100, M.cover / 30 * 100)) : (M.total > 0 ? 100 : 0)) + '%';
    /* 4.16 · neon: green while the paper on hand is 10,000 or more, red under 10,000 */
    var neon = M.state === 'none' ? '' : (M.total >= NEON_MIN ? ' n-ok' : ' n-low');
    el.className = 'paper-counter pm s-' + M.state + neon + ((M.bad || M.low) && M.total >= NEON_MIN ? ' n-note' : '') + (popOpen ? ' open' : '');
    el.title = 'رصيد الورق: ' + num(M.total) + ' ' + M.unit + ' — ' + subTxt(M);
    if (last !== null && Math.round(M.total) !== Math.round(last)) {
      var d = document.getElementById('paper-counter-delta'), diff = M.total - last;
      if (d) {
        d.textContent = (diff > 0 ? '+' : '−') + num(Math.abs(diff));
        d.className = 'paper-counter-delta pm-delta ' + (diff > 0 ? 'up' : 'down');
        void d.offsetWidth; d.classList.add('show');
      }
      el.classList.add('bump'); setTimeout(function () { el.classList.remove('bump'); }, 500);
    }
    last = M.total;
    if (popOpen) fill();
  }

  /* ── the panel ── */
  function pop() {
    var p = document.getElementById('pm-pop');
    if (!p) {
      p = document.createElement('div'); p.id = 'pm-pop'; p.className = 'pm-pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'رصيد الورق');
      p.addEventListener('click', function (e) { e.stopPropagation(); });
      var bd = document.createElement('div'); bd.id = 'pm-backdrop'; bd.className = 'pm-backdrop'; bd.onclick = close;
      document.body.appendChild(bd); document.body.appendChild(p);
    }
    return p;
  }
  function fill() {
    var p = pop(), M = model();
    var stTxt = M.state === 'bad' ? 'محتاج طلب' : M.state === 'warn' ? 'خلي بالك' : M.state === 'ok' ? 'كله تمام' : '';
    p.className = 'pm-pop s-' + M.state + (popOpen ? ' show' : '');
    p.innerHTML =
      '<div class="pm-h"><div><span>رصيد الورق</span><b>' + num(M.total) + ' <small>' + esc(M.unit) + '</small></b></div>' + (stTxt ? '<em>' + stTxt + '</em>' : '') +
        '<button type="button" class="pm-x" onclick="AXPaper.close()" aria-label="اقفل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="pm-stats">' +
        '<div><span>طلع النهارده</span><b>' + num(M.outToday) + '</b></div>' +
        '<div><span>طلع الشهر ده</span><b>' + num(M.outMonth) + '</b></div>' +
        '<div><span>بيطلع في اليوم</span><b>' + (M.avg ? num(M.avg) : '—') + '</b></div>' +
      '</div>' +
      (M.items.length ? '<ul class="pm-items">' + M.items.map(function (i) {
        var st = i.state === 'empty' || i.state === 'crit' ? 'bad' : i.state === 'low' ? 'warn' : i.state === 'idle' ? 'idle' : 'ok';
        var w = isFinite(i.cover) ? Math.max(3, Math.min(100, i.cover / 30 * 100)) : (i.bal > 0 ? 100 : 0);
        return '<li class="s-' + st + '"><div class="pm-in"><b>' + esc(i.name) + '</b><span>' + coverTxt(i) + '</span></div>' +
          '<strong>' + num(i.bal) + ' <small>' + esc(i.unit || '') + '</small></strong>' +
          '<i class="pm-ib"><u style="width:' + w.toFixed(0) + '%"></u></i></li>';
      }).join('') + '</ul>' : '<p class="pm-empty">مفيش أصناف ورق متسجلة في المخازن.</p>') +
      '<div class="pm-f">' +
        '<button type="button" onclick="AXPaper.go(\'issue\')">صرف ورق</button>' +
        (M.bad || M.low ? '<button type="button" onclick="AXPaper.go(\'po\')">طلب شراء</button>' : '') +
        '<button type="button" class="pri" onclick="AXPaper.go(\'stock\')">مخزوني وجرد</button>' +
      '</div>';
  }
  function place() {
    var p = document.getElementById('pm-pop'), b = document.getElementById('paper-counter');
    if (!p || !b) return;
    if (window.matchMedia('(max-width: 768px)').matches) { p.style.top = ''; p.style.left = ''; return; }
    var r = b.getBoundingClientRect(), w = Math.min(380, window.innerWidth - 24);
    var left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    p.style.top = (r.bottom + 10) + 'px'; p.style.left = left + 'px';
  }
  function open() {
    popOpen = true; fill(); place();
    var p = pop(); requestAnimationFrame(function () { p.classList.add('show'); });
    document.documentElement.classList.add('pm-on');
    var b = document.getElementById('paper-counter'); if (b) { b.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
  }
  function close() {
    popOpen = false;
    var p = document.getElementById('pm-pop'); if (p) p.classList.remove('show');
    document.documentElement.classList.remove('pm-on');
    var b = document.getElementById('paper-counter'); if (b) { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
  }
  function toggle() { if (popOpen) close(); else open(); }
  function go(where) {
    close();
    if (where === 'issue') { if (typeof navigate === 'function') navigate('issuances'); setTimeout(function () { if (typeof openIssuanceForm === 'function') openIssuanceForm(); }, 150); }
    else if (where === 'po') { navigate('stock'); setTimeout(function () { if (window.AXStock) AXStock.tab('po'); }, 120); }
    else navigate('stock');
  }
  document.addEventListener('click', function () { if (popOpen) close(); });
  /* mobile: the strip folds away once you scroll into the page and comes back at the top
     (hysteresis + scroll compensation, so the content under the sticky header never jumps) */
  var mini = false;
  document.addEventListener('scroll', function (e) {
    if (!window.matchMedia('(max-width: 768px)').matches) { if (mini) { mini = false; document.documentElement.classList.remove('pm-mini'); } return; }
    var t = e.target, root = t === document || t === document.documentElement;
    if (!root && t !== document.body && !(t && t.id === 'page-content')) return;
    var y = root ? (window.scrollY || document.documentElement.scrollTop || 0) : t.scrollTop;
    var b = document.getElementById('fx-tape') || document.getElementById('paper-counter'); if (!b) return;
    if (!mini && y > 160) {
      var h = b.getBoundingClientRect().height + 10;
      mini = true; document.documentElement.classList.add('pm-mini'); if (popOpen) close();
      if (root) window.scrollBy(0, -h); else t.scrollTop -= h;
    } else if (mini && y < 8) { mini = false; document.documentElement.classList.remove('pm-mini'); }
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popOpen) close(); });
  window.addEventListener('resize', function () { if (popOpen) place(); });

  window.updatePaperCounter = update;
  window.AXPaper = { update: update, open: open, close: close, toggle: toggle, go: go, model: model };
  if (document.readyState !== 'loading') ensure(); else document.addEventListener('DOMContentLoaded', ensure);
})();

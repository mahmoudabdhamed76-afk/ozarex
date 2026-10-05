/* ════════════════════════════════════════════════════════════════════
   ERP · AURUM — features layer (v4)
   Loaded after the main app script. Uses the app's globals (DB, navigate,
   openModal, fmt, todayStr, …) and never changes stored data shapes,
   so sync + offline keep working exactly as before.

   Adds:
     • theme switch (Midnight / Paper) + collapsible icon-rail sidebar
     • dashboard hero "يومك" with a monthly sales target ring
     • day closing report  (تقفيل اليومية)  — on screen + print
     • collections calendar (تقويم التحصيل)
     • mobile quick-create sheet (center + button)
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var AX = window.AX = window.AX || {};
  var root = document.documentElement;

  /* ─────────────── helpers ─────────────── */
  // DB is a top-level const in the main script: reachable by name, not via window
  function data() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function arr(k) { return Array.isArray(data()[k]) ? data()[k] : []; }
  function settings() { var d = data(); if (!d.settings) d.settings = {}; return d.settings; }
  function curSym() { return settings().currency || 'ج'; }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function money(n) { return num(n) + ' ' + curSym(); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function sum(list, f) { var t = 0; for (var i = 0; i < list.length; i++) t += Number(f(list[i]) || 0); return t; }
  function ymd(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function productName(id) { var p = arr('products').find(function (x) { return x.id === id; }); return p ? p.name : ''; }
  function customerName(id) { var c = arr('customers').find(function (x) { return x.id === id; }); return c ? c.name : ''; }

  function classify(name) {
    var n = String(name || '').toLowerCase();
    if (/حبر|تنر|تونر|ink|toner/.test(n)) return 'ink';
    if (/بلاستك|بلاستيك|plastic|فيلم|film|افلام|أفلام/.test(n)) return 'plastic';
    if (/ورق|paper|a4|a3|a5|b4|b5|فرخ|ريم|رزمة|فوتو|photo|لفة/.test(n)) return 'paper';
    return 'other';
  }
  var CLASS_LABEL = { paper: 'ورق', plastic: 'أفلام وبلاستك', ink: 'حبر', other: 'أصناف أخرى' };

  function fmtLong(dateObj, cal) {
    try {
      if (cal === 'hijri') {
        return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
      }
      return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
    } catch (e) { return dateObj.toDateString(); }
  }
  function monthName(y, m) {
    try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }).format(new Date(y, m, 1)); }
    catch (e) { return (m + 1) + '/' + y; }
  }

  var ICON = {
    invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 14l2 2 4-4"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    expense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="7" y1="15" x2="11" y2="15"/></svg>',
    moon: '<svg class="ax-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    sun: '<svg class="ax-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    rail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="8 10 10 12 8 14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  /* ─────────────── theme + rail ─────────────── */
  AX.setTheme = function (t) {
    t = t === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#002055' : '#000000');
    if (typeof updateThemeIcon === 'function') { try { updateThemeIcon(t); } catch (e) {} }
    if (typeof currentPage !== 'undefined' && currentPage === 'dashboard' && typeof renderDashboard === 'function') {
      try { renderDashboard(); } catch (e) {}
    }
  };
  AX.toggleTheme = function () { AX.setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); };
  // the settings page + profile menu call the legacy toggleTheme() — route it here
  window.toggleTheme = AX.toggleTheme;

  AX.toggleRail = function () {
    var on = !root.classList.contains('ax-rail');
    root.classList.toggle('ax-rail', on);
    try { localStorage.setItem('ax_rail', on ? '1' : '0'); } catch (e) {}
    var b = document.getElementById('ax-rail-btn');
    if (b) b.setAttribute('title', on ? 'توسيع القائمة' : 'تصغير القائمة');
  };

  function mountChrome() {
    var brand = document.querySelector('.sidebar-brand');
    if (brand && !document.getElementById('ax-rail-btn')) {
      var rb = document.createElement('button');
      rb.id = 'ax-rail-btn'; rb.type = 'button'; rb.className = 'ax-rail-btn';
      rb.setAttribute('title', root.classList.contains('ax-rail') ? 'توسيع القائمة' : 'تصغير القائمة');
      rb.setAttribute('aria-label', 'تصغير أو توسيع القائمة الجانبية');
      rb.innerHTML = ICON.rail;
      rb.onclick = AX.toggleRail;
      brand.appendChild(rb);
    }
    var notif = document.getElementById('notif-btn');
    if (notif && !document.getElementById('ax-theme-btn')) {
      var tb = document.createElement('button');
      tb.id = 'ax-theme-btn'; tb.type = 'button'; tb.className = 'icon-btn ax-theme-btn';
      tb.setAttribute('title', 'الوضع الليلي / النهاري');
      tb.setAttribute('aria-label', 'تبديل الوضع الليلي والنهاري');
      tb.innerHTML = ICON.moon + ICON.sun;
      tb.onclick = AX.toggleTheme;
      notif.parentNode.insertBefore(tb, notif);
    }
    var bn = document.getElementById('bottom-nav');
    if (bn && !bn.querySelector('.bn-create')) {
      var items = bn.querySelectorAll('.bn-item');
      var cb = document.createElement('button');
      cb.className = 'bn-item bn-create'; cb.type = 'button';
      cb.setAttribute('aria-label', 'إنشاء سريع');
      cb.innerHTML = ICON.plus + '<span>جديد</span>';
      cb.onclick = function () { AX.quickSheet(); };
      if (items.length >= 2) bn.insertBefore(cb, items[2]); else bn.appendChild(cb);
    }
  }

  /* ─────────────── dashboard hero ─────────────── */
  function heroMetrics() {
    var t = today(), m0 = t.slice(0, 7) + '-01';
    var inv = arr('invoices'), pay = arr('payments'), iss = arr('issuances');
    var exp = arr('expenses').filter(function (e) { return e.kind !== 'purchase'; });
    var sp = arr('supplierPayments');
    // sales = paper issuances + invoices that are NOT made from an issuance (no double counting)
    var standalone = inv.filter(function (i) { return !i.sourceIssuanceId; });
    var todaySales = sum(iss.filter(function (i) { return i.date === t; }), function (i) { return i.total; })
                   + sum(standalone.filter(function (i) { return i.date === t; }), function (i) { return i.total; });
    var todayCollect = sum(pay.filter(function (p) { return p.date === t; }), function (p) { return p.amount; });
    var todayIss = iss.filter(function (i) { return i.date === t; });
    var todayOut = sum(exp.filter(function (e) { return e.date === t; }), function (e) { return e.amount; })
                 + sum(sp.filter(function (p) { return p.date === t; }), function (p) { return p.amount; });
    var inMonth = function (i) { return (i.date || '') >= m0 && (i.date || '') <= t; };
    var monthSales = sum(iss.filter(inMonth), function (i) { return i.total; }) + sum(standalone.filter(inMonth), function (i) { return i.total; });
    var now = new Date();
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
    var overdue = iss.filter(function (i) { return i.dueDate && i.dueDate < t && i.status !== 'paid' && (Number(i.total) - Number(i.paid || 0)) > 0; });
    return {
      todaySales: todaySales, todayCollect: todayCollect,
      todayIssQty: sum(todayIss, function (i) { return i.quantity; }), todayIssOps: todayIss.length,
      todayOut: todayOut, net: todayCollect - todayOut,
      monthSales: monthSales, target: Number(settings().monthlyTarget || 0),
      daysLeft: daysLeft, overdueCount: overdue.length,
      overdueAmount: sum(overdue, function (i) { return Number(i.total) - Number(i.paid || 0); })
    };
  }

  /* target ring colour: red → orange → yellow → green as the target fills */
  function ringColor(pct) {
    var p = Math.max(0, Math.min(100, pct));
    var h = p >= 100 ? 145 : 4 + 124 * Math.pow(p / 100, 1.5);   // red → orange → yellow (~60%) → lime → green at 100%
    return 'hsl(' + h.toFixed(0) + ', 88%, ' + (p >= 100 ? 52 : 56) + '%)';
  }
  function targetState(pct, pace) {
    if (pct >= 100) return { tone: 'done', label: 'حققت الهدف' };
    if (pct >= pace) return { tone: 'ahead', label: 'ماشي أسرع من المطلوب' };
    if (pct >= pace * 0.8) return { tone: 'near', label: 'قريب من المعدل' };
    return { tone: 'behind', label: 'متأخر عن المعدل' };
  }
  /* fill the ring from 0 and let its colour travel with the number */
  function animateRing(ring) {
    var target = Number(ring.getAttribute('data-pct')) || 0;
    var bars = ring.querySelectorAll('.ax-ring-bar, .ax-ring-glow'), num = ring.querySelector('.ax-ring-center b');
    var C = 2 * Math.PI * 52, t0 = performance.now(), dur = 1400;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = target * e;
      ring.style.setProperty('--ring', ringColor(v));
      bars.forEach(function (b) { b.style.strokeDashoffset = (C * (1 - Math.min(100, v) / 100)).toFixed(1); });
      if (num) num.textContent = Math.round(v) + '%';
      if (k < 1) requestAnimationFrame(step);
      else if (target >= 100) ring.classList.add('ax-ring-done');
    })(t0);
  }

  function heroHTML() {
    var m = heroMetrics();
    var now = new Date();
    var h = now.getHours();
    var greet = h < 12 ? 'صباح الخير' : 'مساء الخير';
    var who = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) ? currentUser.name : '';
    var pctReal = m.target > 0 ? Math.round(m.monthSales / m.target * 100) : 0;
    var pct = Math.min(100, pctReal);
    var C = 2 * Math.PI * 52;
    var needPerDay = m.target > 0 ? Math.max(0, (m.target - m.monthSales) / m.daysLeft) : 0;
    var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var pace = Math.round(now.getDate() / dim * 100);                 // where you "should" be today
    var st = targetState(pctReal, pace);
    var pa = pace / 100 * 2 * Math.PI;
    var tick = '<line class="ax-ring-pace" x1="' + (60 + 43 * Math.cos(pa)).toFixed(1) + '" y1="' + (60 + 43 * Math.sin(pa)).toFixed(1) +
               '" x2="' + (60 + 61 * Math.cos(pa)).toFixed(1) + '" y2="' + (60 + 61 * Math.sin(pa)).toFixed(1) + '"/>';

    var ring = m.target > 0
      ? '<div class="ax-ring ax-ring-live" id="ax-ring" data-pct="' + pctReal + '" style="--ring:' + ringColor(pctReal) + '" role="img" aria-label="تحقيق ' + pctReal + '% من هدف الشهر — ' + st.label + '">' +
          '<svg viewBox="0 0 120 120"><circle class="ax-ring-track" cx="60" cy="60" r="52"/>' +
          '<circle class="ax-ring-glow" cx="60" cy="60" r="52" style="stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + (C * (1 - pct / 100)).toFixed(1) + '"/>' +
          '<circle class="ax-ring-bar" cx="60" cy="60" r="52" style="stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + (C * (1 - pct / 100)).toFixed(1) + '"/>' +
          tick + '</svg>' +
          '<div class="ax-ring-center"><b class="ax-num">' + pctReal + '%</b><span>من الهدف</span></div>' +
        '</div>' +
        '<div class="ax-target-state ax-ts-' + st.tone + '"><i></i>' + st.label + '</div>' +
        '<div class="ax-target-meta">' +
          '<div><span>تم بيع</span><b class="ax-num">' + money(m.monthSales) + '</b></div>' +
          '<div><span>الهدف</span><b class="ax-num">' + money(m.target) + '</b></div>' +
          '<div><span>المفروض النهارده</span><b class="ax-num">' + pace + '%</b></div>' +
          (pctReal < 100
            ? '<div class="ax-target-hint">محتاج <b class="ax-num">' + money(needPerDay) + '</b> يومياً لآخر الشهر</div>'
            : '<div class="ax-target-hint ax-ok">حققت هدف الشهر' + (pctReal > 100 ? ' وزيادة ' + (pctReal - 100) + '%' : '') + '</div>') +
        '</div>' +
        '<div class="ax-ring-scale" aria-hidden="true"><i></i><span>0%</span><span>50%</span><span>100%</span></div>'
      : '<div class="ax-target-empty"><b>هدف مبيعات الشهر</b><span>حدد رقم تستهدفه، والبرنامج يتابع تقدمك يوم بيوم.</span></div>';

    var chips = [];
    if (m.overdueCount) chips.push('<button class="ax-chip ax-chip-bad" onclick="AX.calendar()">' + m.overdueCount + ' تحصيل متأخر · ' + money(m.overdueAmount) + '</button>');

    return '' +
    '<section class="ax-hero" id="ax-hero">' +
      '<svg class="ax-hero-arcs" viewBox="0 0 400 400" aria-hidden="true">' +
        '<circle cx="200" cy="200" r="170" class="ax-arc ax-arc-gold"/>' +
        '<circle cx="200" cy="200" r="150" class="ax-arc ax-arc-blue"/>' +
        '<circle cx="200" cy="200" r="120" class="ax-arc ax-arc-faint"/>' +
      '</svg>' +
      '<div class="ax-hero-main">' +
        '<div class="ax-eyebrow">' + greet + (who ? '، ' + esc(who) : '') + '</div>' +
        '<h1 class="ax-hero-title">ملخص يومك</h1>' +
        '<div class="ax-hero-date"><span>' + esc(fmtLong(now)) + '</span><i></i><span>' + esc(fmtLong(now, 'hijri')) + '</span></div>' +
        '<div class="ax-today">' +
          '<div class="ax-fig"><span>مبيعات اليوم</span><b class="ax-num ax-count">' + money(m.todaySales) + '</b></div>' +
          '<div class="ax-fig"><span>تحصيل اليوم</span><b class="ax-num ax-count">' + money(m.todayCollect) + '</b></div>' +
          '<div class="ax-fig"><span>صرف ورق اليوم</span><b class="ax-num ax-count">' + num(m.todayIssQty) + '</b><em>' + m.todayIssOps + ' عملية</em></div>' +
          '<div class="ax-fig ' + (m.net < 0 ? 'ax-neg' : '') + '"><span>صافي الخزنة اليوم</span><b class="ax-num ax-count">' + money(m.net) + '</b></div>' +
        '</div>' +
        '<div class="ax-actions">' +
          '<button class="ax-act ax-act-main" onclick="openNewInvoice()">' + ICON.invoice + '<span>فاتورة جديدة</span></button>' +
          '<button class="ax-act" onclick="openIssuanceForm()">' + ICON.paper + '<span>صرف ورق</span></button>' +
          '<button class="ax-act" onclick="openPaymentForm()">' + ICON.cash + '<span>تحصيل</span></button>' +
          '<button class="ax-act" onclick="openCustomerForm()">' + ICON.user + '<span>عميل جديد</span></button>' +
          '<span class="ax-act-sep"></span>' +
          '<button class="ax-act ax-act-ghost" onclick="AX.dayClose()">' + ICON.lock + '<span>تقفيل اليوم</span></button>' +
          '<button class="ax-act ax-act-ghost" onclick="AX.calendar()">' + ICON.cal + '<span>تقويم التحصيل</span></button>' +
        '</div>' +
        (chips.length ? '<div class="ax-chips">' + chips.join('') + '</div>' : '') +
      '</div>' +
      '<aside class="ax-target">' +
        '<div class="ax-target-head"><span>هدف ' + esc(monthName(now.getFullYear(), now.getMonth())) + '</span>' +
          '<button class="ax-link" onclick="AX.setTarget()">' + ICON.edit + (m.target > 0 ? 'تعديل' : 'تحديد الهدف') + '</button></div>' +
        ring +
      '</aside>' +
    '</section>';
  }

  AX._lastHeroAnim = 0;
  function mountHero() {
    var pc = document.getElementById('page-content');
    if (!pc || typeof currentPage === 'undefined' || currentPage !== 'dashboard') return;
    var old = document.getElementById('ax-hero');
    if (old) old.remove();
    pc.insertAdjacentHTML('afterbegin', heroHTML());
    var hero = document.getElementById('ax-hero');
    // cash flow first, then "ملخص يومك"
    var cf = document.getElementById('cashflow-container');
    var cfRow = cf && (cf.closest('.dash-row') || cf.closest('.dash-card'));
    if (cfRow && hero) { cfRow.classList.add('ax-cf-top'); pc.insertBefore(cfRow, hero); }
    var ringEl = document.getElementById('ax-ring');
    var nowTs = Date.now();
    if (nowTs - AX._lastHeroAnim > 15000 && typeof countUpEl === 'function') {
      AX._lastHeroAnim = nowTs;
      document.querySelectorAll('#ax-hero .ax-count').forEach(function (el) { try { countUpEl(el); } catch (e) {} });
      if (ringEl) animateRing(ringEl);
    } else {
      if (hero) hero.classList.add('ax-still');
      if (ringEl && Number(ringEl.getAttribute('data-pct')) >= 100) ringEl.classList.add('ax-ring-done');
    }
  }

  function wrapDashboard() {
    if (typeof window.renderDashboard !== 'function' || window.renderDashboard._ax) return;
    var orig = window.renderDashboard;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { mountHero(); } catch (e) { console.warn('[aurum] hero', e); }
      return r;
    };
    wrapped._ax = true;
    window.renderDashboard = wrapped;
    try { renderDashboard = wrapped; } catch (e) {}
  }

  AX.setTarget = function () {
    var cur = Number(settings().monthlyTarget || 0);
    openModal('هدف مبيعات الشهر',
      '<p class="ax-modal-lead">اكتب إجمالي المبيعات اللي عايز توصله الشهر ده. البرنامج هيحسب نسبة التحقيق والمطلوب يومياً تلقائياً.</p>' +
      '<div class="form-group"><label>قيمة الهدف (' + esc(curSym()) + ')</label>' +
      '<input class="form-control" type="number" min="0" step="100" id="ax-target-input" value="' + (cur || '') + '" placeholder="مثال: 250000"></div>',
      '<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>' +
      (cur ? '<button class="btn btn-secondary" onclick="AX.saveTarget(0)">إلغاء الهدف</button>' : '') +
      '<button class="btn btn-primary" onclick="AX.saveTarget()">حفظ الهدف</button>');
    setTimeout(function () { var i = document.getElementById('ax-target-input'); if (i) i.focus(); }, 60);
  };
  AX.saveTarget = function (forced) {
    var v = forced === 0 ? 0 : Number((document.getElementById('ax-target-input') || {}).value || 0);
    if (forced !== 0 && !(v > 0)) { if (typeof toast === 'function') toast('اكتب قيمة أكبر من صفر', 'warning'); return; }
    settings().monthlyTarget = v;
    DB.save();
    closeModal();
    if (typeof toast === 'function') toast(v ? 'تم حفظ هدف الشهر' : 'تم إلغاء هدف الشهر');
    if (typeof renderDashboard === 'function' && currentPage === 'dashboard') renderDashboard();
  };

  /* ─────────────── day closing (تقفيل اليومية) ─────────────── */
  function dayReport(d) {
    var inv = arr('invoices').filter(function (i) { return i.date === d; });
    var pay = arr('payments').filter(function (p) { return p.date === d; });
    var iss = arr('issuances').filter(function (i) { return i.date === d; });
    var exp = arr('expenses').filter(function (e) { return e.date === d && e.kind !== 'purchase'; });
    var pur = arr('expenses').filter(function (e) { return e.date === d && e.kind === 'purchase'; });
    var sp  = arr('supplierPayments').filter(function (p) { return p.date === d; });

    var byMethod = {};
    pay.forEach(function (p) { var k = p.method || 'نقدي'; byMethod[k] = (byMethod[k] || 0) + Number(p.amount || 0); });
    var byCat = {};
    exp.forEach(function (e) { var k = e.category || 'أخرى'; byCat[k] = (byCat[k] || 0) + Number(e.amount || 0); });
    var byClass = { paper: 0, plastic: 0, ink: 0, other: 0 };
    iss.forEach(function (i) { byClass[classify(i.productName || productName(i.productId))] += Number(i.quantity || 0); });
    var byCustomer = {};
    iss.forEach(function (i) {
      var k = i.customerName || customerName(i.customerId) || '—';
      if (!byCustomer[k]) byCustomer[k] = { qty: 0, total: 0 };
      byCustomer[k].qty += Number(i.quantity || 0); byCustomer[k].total += Number(i.total || 0);
    });

    var soloInv = inv.filter(function (i) { return !i.sourceIssuanceId; });
    var sales = sum(iss, function (i) { return i.total; }) + sum(soloInv, function (i) { return i.total; });
    var paidAtSale = sum(iss, function (i) { return i.paid; }) + sum(soloInv, function (i) { return i.paid; });
    var collected = sum(pay, function (p) { return p.amount; });
    var spent = sum(exp, function (e) { return e.amount; });
    var toSuppliers = sum(sp, function (p) { return p.amount; });
    return {
      date: d, invCount: Object.keys(iss.reduce(function (m, i) { m[i.number || i.id] = 1; return m; }, {})).length + soloInv.length, sales: sales, credit: Math.max(0, sales - paidAtSale),
      collected: collected, byMethod: byMethod,
      issOps: iss.length, byClass: byClass, byCustomer: byCustomer,
      spent: spent, byCat: byCat, purchases: sum(pur, function (e) { return e.amount; }),
      toSuppliers: toSuppliers, net: collected - spent - toSuppliers
    };
  }

  function rows(obj, fmtFn) {
    var keys = Object.keys(obj).filter(function (k) { return obj[k]; });
    if (!keys.length) return '<div class="ax-dc-empty">لا يوجد</div>';
    return keys.sort(function (a, b) { return obj[b] - obj[a]; })
      .map(function (k) { return '<div class="ax-dc-row"><span>' + esc(k) + '</span><b class="ax-num">' + fmtFn(obj[k]) + '</b></div>'; }).join('');
  }

  function dayCloseBody(r) {
    var classes = {}; Object.keys(r.byClass).forEach(function (k) { if (r.byClass[k]) classes[CLASS_LABEL[k]] = r.byClass[k]; });
    var custRows = Object.keys(r.byCustomer).sort(function (a, b) { return r.byCustomer[b].total - r.byCustomer[a].total; })
      .map(function (k) { var c = r.byCustomer[k]; return '<div class="ax-dc-row"><span>' + esc(k) + '</span><em class="ax-num">' + num(c.qty) + '</em><b class="ax-num">' + money(c.total) + '</b></div>'; }).join('')
      || '<div class="ax-dc-empty">لا توجد عمليات صرف في هذا اليوم</div>';
    return '' +
      '<div class="ax-dc-bar"><label for="ax-dc-date">اليوم</label>' +
        '<input class="form-control" type="date" id="ax-dc-date" value="' + r.date + '" max="' + today() + '" onchange="AX.dayClose(this.value)"></div>' +
      '<div class="ax-dc-tiles">' +
        '<div class="ax-dc-tile"><span>المبيعات</span><b class="ax-num">' + money(r.sales) + '</b><em>' + r.invCount + ' عملية بيع · آجل ' + money(r.credit) + '</em></div>' +
        '<div class="ax-dc-tile ax-t-ok"><span>المحصّل</span><b class="ax-num">' + money(r.collected) + '</b><em>' + Object.keys(r.byMethod).length + ' طريقة دفع</em></div>' +
        '<div class="ax-dc-tile ax-t-bad"><span>المصروف والسداد</span><b class="ax-num">' + money(r.spent + r.toSuppliers) + '</b><em>مصروفات ' + money(r.spent) + ' · موردين ' + money(r.toSuppliers) + '</em></div>' +
        '<div class="ax-dc-tile ax-t-gold"><span>صافي الخزنة</span><b class="ax-num">' + money(r.net) + '</b><em>المحصّل ناقص المصروف</em></div>' +
      '</div>' +
      '<div class="ax-dc-grid">' +
        '<div class="ax-dc-box"><h4>التحصيل حسب طريقة الدفع</h4>' + rows(r.byMethod, money) + '</div>' +
        '<div class="ax-dc-box"><h4>المصروفات حسب البند</h4>' + rows(r.byCat, money) + (r.purchases ? '<div class="ax-dc-row ax-dc-note"><span>مشتريات من موردين (آجل)</span><b class="ax-num">' + money(r.purchases) + '</b></div>' : '') + '</div>' +
        '<div class="ax-dc-box"><h4>الكميات المصروفة حسب النوع</h4>' + rows(classes, num) + '<div class="ax-dc-row ax-dc-note"><span>عدد عمليات الصرف</span><b class="ax-num">' + r.issOps + '</b></div></div>' +
        '<div class="ax-dc-box ax-dc-wide"><h4>المراكز اللي اتصرف لها النهارده</h4><div class="ax-dc-head"><span>المركز</span><em>الكمية</em><b>القيمة</b></div>' + custRows + '</div>' +
      '</div>';
  }

  AX.dayClose = function (d) {
    d = d || today();
    AX._dc = dayReport(d);
    var isOpen = document.getElementById('ax-dc-date');
    if (isOpen && document.getElementById('modal-overlay').classList.contains('show')) {
      document.querySelector('#modal .modal-body').innerHTML = dayCloseBody(AX._dc);
      return;
    }
    openModal('تقفيل اليومية', dayCloseBody(AX._dc),
      '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>' +
      '<button class="btn btn-primary" onclick="AX.printDayClose()">' + ICON.print.replace('<svg', '<svg width="16" height="16"') + ' طباعة التقفيل</button>', 'large');
  };

  AX.printDayClose = function () {
    var r = AX._dc || dayReport(today());
    var s = settings();
    var logo = new URL('icons/logo-square.png', location.href).href;
    var classes = {}; Object.keys(r.byClass).forEach(function (k) { if (r.byClass[k]) classes[CLASS_LABEL[k]] = r.byClass[k]; });
    function tbl(title, obj, f) {
      var ks = Object.keys(obj).filter(function (k) { return obj[k]; });
      return '<h3>' + title + '</h3><table><tbody>' + (ks.length ? ks.map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="n">' + f(obj[k]) + '</td></tr>'; }).join('') : '<tr><td colspan="2" class="e">لا يوجد</td></tr>') + '</tbody></table>';
    }
    var cust = Object.keys(r.byCustomer).map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="n">' + num(r.byCustomer[k].qty) + '</td><td class="n">' + money(r.byCustomer[k].total) + '</td></tr>'; }).join('') || '<tr><td colspan="3" class="e">لا يوجد</td></tr>';
    var dateLabel = fmtLong(new Date(r.date + 'T12:00:00'));
    var html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقفيل ' + r.date + '</title>' +
      '<link rel="stylesheet" href="' + new URL('fonts/fonts.css', location.href).href + '">' +
      '<style>*{box-sizing:border-box}body{font-family:"IBM Plex Sans Arabic","Cairo",sans-serif;color:#000;margin:0;padding:28px}' +
      '.frame{border:3px solid #000;outline:1.5px solid #bdbdbd;outline-offset:-9px;padding:28px 30px;min-height:96vh}' +
      'header{text-align:center;border-bottom:2px solid #bdbdbd;padding-bottom:14px;margin-bottom:18px}header img{width:74px;height:74px;border-radius:50%}' +
      'h1{font-family:"Zain","Cairo",sans-serif;font-weight:800;margin:6px 0 2px;font-size:26px}h2{margin:10px 0 0;background:#000;color:#fff;font-size:16px;padding:8px;font-weight:600}' +
      '.d{color:#6b6b6b;font-size:13px}.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}' +
      '.t{border:1px solid #e0e0e0;border-top:3px solid #000;padding:10px}.t span{display:block;font-size:12px;color:#6b6b6b}.t b{font-family:"Zain","Cairo",sans-serif;font-size:22px;font-weight:800}.t.g{border-top-color:#bdbdbd}' +
      '.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}h3{font-size:14px;margin:14px 0 6px;color:#000}' +
      'table{width:100%;border-collapse:collapse;font-size:13px}td,th{border:1px solid #e6e6e6;padding:6px 8px;text-align:right}th{background:#f2f2f2;font-weight:600}.n{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}.e{color:#9a9a9a;text-align:center}' +
      '.sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:44px;text-align:center;font-size:13px}.sig div{border-top:1.5px solid #000;padding-top:6px}' +
      '@media print{body{padding:0}@page{margin:12mm}}</style></head><body><div class="frame">' +
      '<header><img src="' + logo + '" alt=""><h1>' + esc(s.companyName || 'نظام الحسابات') + '</h1><div class="d">' + esc(dateLabel) + '</div><h2>تقرير تقفيل اليومية</h2></header>' +
      '<div class="tiles"><div class="t"><span>المبيعات</span><b>' + money(r.sales) + '</b></div><div class="t"><span>المحصّل</span><b>' + money(r.collected) + '</b></div>' +
      '<div class="t"><span>المصروف والسداد</span><b>' + money(r.spent + r.toSuppliers) + '</b></div><div class="t g"><span>صافي الخزنة</span><b>' + money(r.net) + '</b></div></div>' +
      '<div class="cols"><div>' + tbl('التحصيل حسب طريقة الدفع', r.byMethod, money) + tbl('المصروفات حسب البند', r.byCat, money) + '</div>' +
      '<div>' + tbl('الكميات المصروفة حسب النوع', classes, num) + '<h3>ملخص</h3><table><tbody><tr><td>عدد الفواتير</td><td class="n">' + r.invCount + '</td></tr><tr><td>مبيعات آجل</td><td class="n">' + money(r.credit) + '</td></tr><tr><td>سداد للموردين</td><td class="n">' + money(r.toSuppliers) + '</td></tr><tr><td>مشتريات آجل</td><td class="n">' + money(r.purchases) + '</td></tr></tbody></table></div></div>' +
      '<h3>المراكز</h3><table><thead><tr><th>المركز</th><th>الكمية</th><th>القيمة</th></tr></thead><tbody>' + cust + '</tbody></table>' +
      '<div class="sig"><div>توقيع المحاسب</div><div>توقيع المدير</div></div>' +
      '</div><script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>';
    var w = window.open('', '_blank');
    if (!w) { if (typeof toast === 'function') toast('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'warning'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ─────────────── collections calendar (تقويم التحصيل) ─────────────── */
  var WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

  function dueMap(y, m) {
    var start = ymd(y, m, 1), end = ymd(y, m, new Date(y, m + 1, 0).getDate());
    var map = {};
    arr('issuances').forEach(function (i) {
      if (!i.dueDate || i.status === 'paid') return;
      var rem = Number(i.total || 0) - Number(i.paid || 0);
      if (rem <= 0 || i.dueDate < start || i.dueDate > end) return;
      (map[i.dueDate] = map[i.dueDate] || { in: [], out: [] }).in.push({
        id: i.id, customerId: i.customerId, name: i.customerName || customerName(i.customerId),
        what: i.productName || productName(i.productId), amount: rem, number: i.number
      });
    });
    arr('expenses').forEach(function (e) {
      if (e.kind !== 'purchase' || !e.dueDate || e.paymentMethod !== 'credit') return;
      if (e.dueDate < start || e.dueDate > end) return;
      (map[e.dueDate] = map[e.dueDate] || { in: [], out: [] }).out.push({
        id: e.id, supplierId: e.supplierId, name: e.supplierName || '', what: e.description || 'فاتورة شراء', amount: Number(e.amount || 0), number: e.number
      });
    });
    return map;
  }

  function calendarBody(y, m, sel) {
    var t = today();
    var map = dueMap(y, m);
    var first = new Date(y, m, 1).getDay();            // 0=Sun … 6=Sat
    var lead = (first + 1) % 7;                        // week starts Saturday
    var days = new Date(y, m + 1, 0).getDate();
    var totIn = 0, totOver = 0, totOut = 0;
    Object.keys(map).forEach(function (k) {
      var a = sum(map[k].in, function (x) { return x.amount; });
      totIn += a; if (k < t) totOver += a;
      totOut += sum(map[k].out, function (x) { return x.amount; });
    });

    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<div class="ax-cal-cell ax-cal-pad"></div>';
    for (var d = 1; d <= days; d++) {
      var key = ymd(y, m, d), e = map[key];
      var aIn = e ? sum(e.in, function (x) { return x.amount; }) : 0;
      var aOut = e ? sum(e.out, function (x) { return x.amount; }) : 0;
      var cls = 'ax-cal-cell';
      if (key === t) cls += ' ax-today';
      if (key === sel) cls += ' ax-sel';
      if (aIn && key < t) cls += ' ax-over';
      cells += '<button type="button" class="' + cls + '" onclick="AX.calendar(' + y + ',' + m + ',\'' + key + '\')">' +
        '<span class="ax-cal-d">' + d + '</span>' +
        (aIn ? '<span class="ax-cal-in ax-num">' + num(aIn) + '</span>' : '') +
        (aOut ? '<span class="ax-cal-out ax-num">' + num(aOut) + '</span>' : '') +
      '</button>';
    }

    var detail = '';
    if (sel) {
      var e2 = map[sel] || { in: [], out: [] };
      var list = e2.in.map(function (x) {
        return '<div class="ax-cal-item"><div><b>' + esc(x.name) + '</b><span>' + esc(x.what) + (x.number ? ' · #' + x.number : '') + '</span></div>' +
          '<b class="ax-num ax-in">' + money(x.amount) + '</b>' +
          '<button class="btn btn-sm btn-primary" onclick="closeModal();navigate(\'payments\');setTimeout(function(){openPaymentForm(\'' + x.customerId + '\')},120)">تحصيل</button></div>';
      }).join('') + e2.out.map(function (x) {
        return '<div class="ax-cal-item"><div><b>' + esc(x.name) + '</b><span>مستحق لمورد · ' + esc(x.what) + '</span></div>' +
          '<b class="ax-num ax-out">' + money(x.amount) + '</b>' +
          '<button class="btn btn-sm btn-secondary" onclick="closeModal();navigate(\'suppliers\');setTimeout(function(){openSupplierPaymentForm(null,\'' + x.supplierId + '\')},120)">سداد</button></div>';
      }).join('');
      detail = '<div class="ax-cal-detail"><h4>' + esc(fmtLong(new Date(sel + 'T12:00:00'))) + '</h4>' +
        (list || '<div class="ax-dc-empty">لا توجد مستحقات في هذا اليوم</div>') + '</div>';
    }

    return '' +
      '<div class="ax-cal-top">' +
        '<div class="ax-cal-nav">' +
          '<button class="icon-btn" title="الشهر السابق" onclick="AX.calendar(' + (m === 0 ? y - 1 : y) + ',' + (m === 0 ? 11 : m - 1) + ')">' + ICON.chevR + '</button>' +
          '<b>' + esc(monthName(y, m)) + '</b>' +
          '<button class="icon-btn" title="الشهر التالي" onclick="AX.calendar(' + (m === 11 ? y + 1 : y) + ',' + (m === 11 ? 0 : m + 1) + ')">' + ICON.chevL + '</button>' +
        '</div>' +
        '<div class="ax-cal-sum">' +
          '<span><i class="ax-dot-in"></i>مستحق تحصيله <b class="ax-num">' + money(totIn) + '</b></span>' +
          (totOver ? '<span class="ax-bad-text"><i class="ax-dot-bad"></i>منه متأخر <b class="ax-num">' + money(totOver) + '</b></span>' : '') +
          '<span><i class="ax-dot-out"></i>مستحق للموردين <b class="ax-num">' + money(totOut) + '</b></span>' +
        '</div>' +
      '</div>' +
      '<div class="ax-cal-week">' + WEEK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="ax-cal-grid">' + cells + '</div>' + detail;
  }

  AX.calendar = function (y, m, sel) {
    var now = new Date();
    if (y == null) { y = now.getFullYear(); m = now.getMonth(); }
    var body = calendarBody(y, m, sel || '');
    var overlay = document.getElementById('modal-overlay');
    if (overlay && overlay.classList.contains('show') && document.querySelector('#modal .ax-cal-grid')) {
      document.querySelector('#modal .modal-body').innerHTML = body;
      return;
    }
    openModal('تقويم التحصيل والمستحقات', body, '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>', 'large');
  };

  /* ─────────────── mobile quick-create sheet ─────────────── */
  AX.quickSheet = function (force) {
    var sheet = document.getElementById('ax-sheet');
    var btn = document.querySelector('.bn-create');
    var open = force !== undefined ? force : !(sheet && sheet.classList.contains('show'));
    if (!sheet && !open) return;
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'ax-sheet';
      sheet.innerHTML = '<div class="ax-sheet-scrim" onclick="AX.quickSheet(false)"></div>' +
        '<div class="ax-sheet-panel" role="dialog" aria-label="إنشاء سريع"><div class="ax-sheet-grip"></div><div class="ax-sheet-title">إنشاء سريع</div><div class="ax-sheet-grid">' +
        [['openNewInvoice()', ICON.invoice, 'فاتورة جديدة', 'gold'],
         ['openIssuanceForm()', ICON.paper, 'صرف ورق', 'blue'],
         ['openPaymentForm()', ICON.cash, 'تحصيل', 'ok'],
         ['openCustomerForm()', ICON.user, 'عميل جديد', 'violet'],
         ['openExpenseForm()', ICON.expense, 'مصروف', 'bad'],
         ['AX.dayClose()', ICON.lock, 'تقفيل اليوم', 'teal'],
         ['AX.calendar()', ICON.cal, 'تقويم التحصيل', 'warn'],
         ['navigate(\'suppliers\');setTimeout(function(){openSupplierPaymentForm()},120)', ICON.wallet, 'سداد لمورد', 'blue']]
          .map(function (a) { return '<button class="ax-sheet-btn ax-c-' + a[3] + '" onclick="AX.quickSheet(false);' + a[0] + '">' + a[1] + '<span>' + a[2] + '</span></button>'; }).join('') +
        '</div></div>';
      document.body.appendChild(sheet);
      void sheet.offsetWidth;
    }
    sheet.classList.toggle('show', open);
    if (btn) btn.classList.toggle('open', open);
  };

  /* ─────────────── cash flow · glowing line ─────────────── */
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function parseD(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var CF_MODES = [['net', 'الصافي'], ['cum', 'الرصيد التراكمي'], ['split', 'داخل وخارج']];
  function cfMode() { try { return localStorage.getItem('ax_cf_mode') || 'net'; } catch (e) { return 'net'; } }
  AX.cfMode = function (m) { try { localStorage.setItem('ax_cf_mode', m); } catch (e) {} AX.renderCashFlow(); };

  AX.renderCashFlow = function (periodDays) {
    var box = document.getElementById('cashflow-container');
    var sel = document.getElementById('cashflow-period');
    if (!box) return;
    var days = parseInt(periodDays || (sel && sel.value) || 30, 10) || 30;
    var weekly = days >= 60;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var start = new Date(now); start.setDate(now.getDate() - days + 1);
    var startStr = lds(start);

    function key(ds) {
      if (!weekly) return ds;
      var d = parseD(ds); d.setDate(d.getDate() - ((d.getDay() + 1) % 7));   // week starts Saturday
      return lds(d);
    }
    var B = {}, order = [];
    for (var i = 0; i < days; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var k = key(lds(d));
      if (!B[k]) { B[k] = { key: k, inn: 0, out: 0, nIn: 0, nOut: 0 }; order.push(k); }
    }
    function add(ds, field, amt) {
      if (!ds || ds < startStr) return;
      var b = B[key(String(ds).slice(0, 10))]; if (!b) return;
      b[field] += Number(amt || 0); if (field === 'inn') b.nIn++; else b.nOut++;
    }
    arr('payments').forEach(function (p) { add(p.date, 'inn', p.amount); });
    arr('bankTransfers').forEach(function (t) {
      if (t.type === 'out' || t.type === 'withdrawal') add(t.date, 'out', t.amount);
      else add(t.date, 'inn', t.amount);
    });
    arr('expenses').forEach(function (e) { if (e.kind === 'purchase' && e.paymentMethod === 'credit') return; add(e.date, 'out', e.amount); });
    arr('supplierPayments').forEach(function (p) { add(p.date, 'out', p.amount); });

    var list = order.map(function (k) { return B[k]; });
    var labels = list.map(function (b) {
      var d = parseD(b.key);
      if (!weekly) return d.getDate() + '/' + (d.getMonth() + 1);
      return 'أسبوع ' + d.getDate() + '/' + (d.getMonth() + 1);
    });
    var tIn = sum(list, function (b) { return b.inn; }), tOut = sum(list, function (b) { return b.out; });
    var net = tIn - tOut, avg = net / days;
    var nPay = arr('payments').filter(function (p) { return p.date >= startStr; }).length;
    var mode = cfMode();
    var run = 0, cum = list.map(function (b) { run += b.inn - b.out; return run; });
    var netV = list.map(function (b) { return b.inn - b.out; });
    var posDays = netV.filter(function (v) { return v > 0; }).length, negDays = netV.filter(function (v) { return v < 0; }).length;
    var best = 0; netV.forEach(function (v, i) { if (v > netV[best]) best = i; });
    var sign = function (v) { return '\u200E' + (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v)); };
    var unit = weekly ? 'أسبوع' : 'يوم';

    var fc = '';
    if (avg !== 0) {
      var p30 = avg * 30;
      fc = p30 > 0
        ? '<div class="ax-cf-fc ok"><b>على نفس المعدل</b> هيدخلك صافي <strong>' + money(p30) + '</strong> في الـ30 يوم الجايين.</div>'
        : '<div class="ax-cf-fc bad"><b>تنبيه</b> على نفس المعدل الكاش هينقص <strong>' + money(Math.abs(p30)) + '</strong> خلال 30 يوم — راجع المصروفات.</div>';
    }

    var legend = mode === 'split'
      ? '<span class="ax-cf-key"><i style="background:var(--ax-ok)"></i>داخل</span><span class="ax-cf-key"><i style="background:var(--ax-bad)"></i>خارج</span>'
      : '<span class="ax-cf-key"><i style="background:var(--ax-ok)"></i>إضاءة خضرا = ' + (mode === 'cum' ? 'رصيد موجب' : 'داخل أكتر من الخارج') + '</span>' +
        '<span class="ax-cf-key"><i style="background:var(--ax-bad)"></i>إضاءة حمرا = ' + (mode === 'cum' ? 'رصيد سالب' : 'خارج أكتر') + '</span>';

    box.innerHTML =
      '<div class="ax-cf-stats">' +
        '<div class="ax-cf-stat"><span>إجمالي الداخل</span><b class="ok">' + money(tIn) + '</b><small>' + nPay + ' عملية تحصيل</small></div>' +
        '<div class="ax-cf-stat"><span>إجمالي الخارج</span><b class="bad">' + money(tOut) + '</b><small>مصروفات + سداد موردين</small></div>' +
        '<div class="ax-cf-stat ax-cf-net ' + (net >= 0 ? 'pos' : 'neg') + '"><span>صافي التدفق</span><b>' + sign(net) + ' <em>' + esc(curSym()) + '</em></b><small>متوسط يومي ' + sign(avg) + '</small></div>' +
      '</div>' +
      '<div class="ax-cf-bar">' +
        '<div class="ax-seg" role="tablist" aria-label="طريقة العرض">' + CF_MODES.map(function (m) {
          return '<button role="tab" aria-selected="' + (m[0] === mode) + '" class="' + (m[0] === mode ? 'on' : '') + '" onclick="AX.cfMode(\'' + m[0] + '\')">' + m[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="ax-cf-legend">' + legend + '</div>' +
      '</div>' +
      '<div id="ax-cf-chart" class="ax-cf-chart"></div>' +
      '<div class="ax-cf-foot">' +
        '<span class="ax-cf-chip ok">' + posDays + ' ' + unit + ' موجب</span>' +
        '<span class="ax-cf-chip bad">' + negDays + ' ' + unit + ' سالب</span>' +
        (netV[best] > 0 ? '<span class="ax-cf-chip">أحسن ' + unit + ': ' + labels[best].replace('أسبوع ', '') + ' (' + sign(netV[best]) + ')</span>' : '') +
      '</div>' + fc +
      (window.AXChart ? AXChart.table(labels, [
        { name: 'داخل', values: list.map(function (b) { return b.inn; }) },
        { name: 'خارج', values: list.map(function (b) { return b.out; }) },
        { name: 'الصافي', values: netV },
        { name: 'التراكمي', values: cum }], num) : '');

    if (!window.AXChart) return;
    var detail = function (i) {
      var b = list[i];
      return [['داخل', money(b.inn), 'var(--ax-ok)'], ['خارج', money(b.out), 'var(--ax-bad)']].concat(
        mode === 'split' ? [['الصافي', sign(b.inn - b.out), null]] : mode === 'cum' ? [['صافي ال' + unit, sign(b.inn - b.out), null]] : [['الرصيد التراكمي', sign(cum[i]), null]]);
    };
    var cfg = { labels: labels, height: window.innerWidth < 700 ? 210 : 260, fmt: sign, title: 'التدفق النقدي' };
    if (mode === 'split') {
      cfg.series = [{ name: 'داخل', values: list.map(function (b) { return b.inn; }), color: 'var(--ax-ok)' },
                    { name: 'خارج', values: list.map(function (b) { return b.out; }), color: 'var(--ax-bad)' }];
      cfg.fmt = num;
      cfg.detail = function (i) { return [['الصافي', sign(list[i].inn - list[i].out), null]]; };
    } else {
      cfg.diverging = true;
      cfg.series = [{ name: mode === 'cum' ? 'الرصيد التراكمي' : 'صافي ال' + unit, values: mode === 'cum' ? cum : netV }];
      cfg.detail = detail;
    }
    AXChart.line(document.getElementById('ax-cf-chart'), cfg);
  };
  window.renderCashFlow = AX.renderCashFlow;

  /* ─────────────── boot ─────────────── */
  function boot() {
    wrapDashboard();
    mountChrome();
    // re-attach chrome if the app re-renders parts of the DOM
    if (typeof currentPage !== 'undefined' && currentPage === 'dashboard' && document.getElementById('page-content') &&
        document.getElementById('app') && document.getElementById('app').style.display !== 'none' && !document.getElementById('ax-hero')) {
      try { mountHero(); } catch (e) {}
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('load', boot);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') AX.quickSheet(false);
  });
})();

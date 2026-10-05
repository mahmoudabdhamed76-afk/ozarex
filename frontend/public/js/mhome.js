/* ════════════════════════════════════════════════════════════════════
   ERP · واجهة الموبايل — مصممة للآيفون (4.12)
   ------------------------------------------------------------------
   على الشاشات الصغيرة (≤ 768px):
   · هيدر متدرّج: اسم الشركة + الدور، وأيقونات (خروج · بحث · الموافقات ·
     الإشعارات · القايمة)
   · الرئيسية: عنوان باسم الشركة، كروت 2×3 (مبيعات/تحصيل اليوم والشهر،
     أصناف تحت الحد، مراكز معادها في السحب)، شريط «تصدير كل البيانات
     لإكسل»، وبلاطات الأقسام الكبيرة عمودين
   · شريط سفلي 6 خانات: الرئيسية · بيع · الفواتير · عملاء · شاشتي · المزيد
   · «المزيد»: كل الأقسام + إنشاء سريع + الوضع الليلي + اختيار «شاشتي»
   · بحث بملء الشاشة (نفس البحث الشامل)
   لوحة التحليلات الكاملة لسه موجودة من زرار تحت الرئيسية.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MQ = window.matchMedia ? window.matchMedia('(max-width: 768px)') : { matches: false, addEventListener: function () {} };
  var classic = false, boxHome = null;
  var MO = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var WD = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

  function mobile() { return !!MQ.matches; }
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function cur() { var c = S().currency || 'جنيه'; return c === 'جنيه' ? 'ج.م' : c === 'ريال' ? 'ر.س' : c === 'درهم' ? 'د.إ' : c; }
  function money(n) { n = N(n); var a = Math.abs(n); return (a >= 1e6 ? (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : num(n)) + ' ' + cur(); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || null; }
  function canGo(p) { try { return typeof can === 'function' && can(p); } catch (e) { return false; } }
  function go(p) { if (canGo(p)) navigate(p); else if (typeof toast === 'function') toast('القسم ده مش متاح ليك', 'error'); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function roleLabel(u) { try { return ROLE_LABELS[u.role] || u.role || ''; } catch (e) { return ''; } }
  function initial(name) { var w = String(name || '').trim().split(/\s+/)[0] || '؟'; w = w.replace(/^ال(?=..)/, ''); return w.charAt(0) || '؟'; }
  function navItem(k) { try { return NAV_ITEMS.find(function (n) { return n.key === k; }) || null; } catch (e) { return null; } }

  var IC = {
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.6-4.6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20z"/></svg>',
    sell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M12 10v6M9 13h6"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="10" r="3"/><path d="M7 19a5 5 0 0 1 10 0"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    xls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m8.5 12.5 5 5M13.5 12.5l-5 5"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18M12 14v3l2 1"/></svg>'
  };
  var PURCH_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>';

  /* ════════ numbers for the home ════════ */
  function metrics() {
    var t = today(), m0 = t.slice(0, 8) + '01';
    var linked = {}; A('issuances').forEach(function (i) { if (i.invoiceId) linked[i.invoiceId] = 1; });
    var solo = A('invoices').filter(function (v) { return !(v.sourceIssuanceId || v.sourceIssuance || v.fromIssuance || (v.fromIssuances && v.fromIssuances.length) || linked[v.id]); });
    function sales(from) {
      var docs = {}, tot = 0;
      A('issuances').forEach(function (i) { var d = String(i.date || ''); if (d < from || d > t) return; tot += N(i.total); docs['i' + (i.invoiceId || i.number || i.id)] = 1; });
      solo.forEach(function (v) { var d = String(v.date || ''); if (d < from || d > t) return; tot += N(v.total); docs['v' + v.id] = 1; });
      return { v: tot, n: Object.keys(docs).length };
    }
    function coll(from) {
      var l = A('payments').filter(function (p) { var d = String(p.date || ''); return d >= from && d <= t && N(p.amount) > 0; });
      return { v: l.reduce(function (s, p) { return s + N(p.amount); }, 0), n: l.length };
    }
    var low = A('products').filter(function (p) { return N(p.quantity) <= N(p.minQuantity); });
    var fc = window.AXFc ? AXFc.reminders() : [];
    var dm = pd(t);
    return { sT: sales(t), cT: coll(t), sM: sales(m0), cM: coll(m0), low: low, fc: fc, month: MO[dm.getMonth()] + ' ' + dm.getFullYear(), day: WD[dm.getDay()] + ' ' + dm.getDate() + ' ' + MO[dm.getMonth()] };
  }

  var TILES = [
    ['issuances', 'صرف الورق'], ['invoices', 'المبيعات'], ['purchases', 'المشتريات'], ['payments', 'التحصيل'],
    ['customers', 'العملاء'], ['forecast', 'مواعيد السحب'], ['inventory', 'المخازن'], ['stock', 'مخزوني وجرد'],
    ['suppliers', 'الموردين'], ['expenses', 'المصروفات'], ['reports', 'التقارير'], ['profit', 'الأرباح'],
    ['cheques', 'الشيكات'], ['monthly', 'تقرير الشهر'], ['aging', 'أعمار الديون'], ['requests', 'الطلبات'], ['aiassistant', 'المساعد الذكي']
  ];
  function tileSub(k, m) {
    var t = today(), m0 = t.slice(0, 8) + '01';
    try {
      switch (k) {
        case 'issuances': var n = A('issuances').filter(function (i) { return i.date === t; }).length; return n ? n + ' صرف النهارده' : 'صرف جديد للمراكز';
        case 'invoices': return m.sM.n + ' فاتورة الشهر';
        case 'purchases': return A('expenses').filter(function (e) { return e.kind === 'purchase' && (e.date || '') >= m0; }).length + ' فاتورة الشهر';
        case 'payments': var d = A('customers').reduce(function (s, c) { return s + Math.max(0, N(c.balance)); }, 0); return d ? 'مديونيات ' + money(d) : 'مفيش مديونيات';
        case 'customers': return A('customers').length + ' مركز';
        case 'forecast': return m.fc.length ? m.fc.length + ' معادهم قرّب' : 'اعرف مين هيسحب قريب';
        case 'inventory': return A('products').length + ' صنف';
        case 'stock': return 'جرد · عهدة · طلب شراء';
        case 'suppliers': var o = 0; if (typeof supplierMetrics === 'function') A('suppliers').forEach(function (s) { o += Math.max(0, supplierMetrics(s.id).balance); }); return o ? 'مستحق ' + money(o) : A('suppliers').length + ' مورد';
        case 'expenses': return money(A('expenses').filter(function (e) { return e.kind !== 'purchase' && (e.date || '') >= m0; }).reduce(function (s, e) { return s + N(e.amount); }, 0)) + ' الشهر';
        case 'reports': return 'تقارير وتحليلات';
        case 'profit': return 'هامش وأرباح';
        case 'monthly': return 'تقفيل وطباعة PDF';
        case 'cheques': var c = window.AXCheq && AXCheq.dueSoon ? AXCheq.dueSoon().length : 0; return c ? c + ' ميعادهم قرّب' : 'وارد وصادر';
        case 'aging': return 'مين متأخر وبقاله قد إيه';
        case 'requests': var r = window.AXReq ? AXReq.list().filter(function (x) { return x.status === 'pending'; }).length : 0; return r ? r + ' مستني' : 'طلبات واقتراحات';
        case 'aiassistant': return 'اسأل عن أي حاجة';
      }
    } catch (e) {}
    return '';
  }

  function homeHtml() {
    var u = me() || {}, m = metrics(), s = S();
    var kpi = function (cls, onclick, label, val, sub, chev) {
      return '<button type="button" class="mh-k ' + cls + '" onclick="' + onclick + '"><span class="mh-kl">' + label + (chev ? IC.chev : '') + '</span><b>' + val + '</b><em>' + sub + '</em></button>';
    };
    var tiles = TILES.filter(function (t) { return canGo(t[0]); }).map(function (t) {
      var n = navItem(t[0]) || {}, ic = t[0] === 'purchases' ? PURCH_IC : (n.icon || IC.doc), col = n.color || '#3b82f6';
      return '<button type="button" class="mh-tile" style="--tc:' + col + '" onclick="AXM.go(\'' + t[0] + '\')"><span class="mh-ti">' + ic + '</span><b>' + esc(t[1]) + '</b><em>' + esc(tileSub(t[0], m)) + '</em></button>';
    }).join('');
    var showXl = u.role === 'admin' || canGo('reports');
    return '<div class="mh" id="mh-root">' +
      '<section class="mh-hello"><div><h1>' + esc(s.companyName || 'نظام الحسابات') + '</h1><p>' + esc(roleLabel(u)) + (u.name ? ' · ' + esc(u.name) : '') + '</p></div><span class="mh-date">' + esc(m.day) + '</span></section>' +
      '<section class="mh-kpis" aria-label="أرقام اليوم والشهر">' +
        kpi('hi', "AXM.go('" + (canGo('issuances') ? 'issuances' : 'invoices') + "')", 'مبيعات اليوم', money(m.sT.v), m.sT.n + ' فاتورة') +
        kpi('', "AXM.go('payments')", 'تحصيل اليوم', money(m.cT.v), m.cT.n + ' عملية', 1) +
        kpi('', "AXM.go('invoices')", 'مبيعات الشهر', money(m.sM.v), m.month + ' · ' + m.sM.n + ' فاتورة') +
        kpi('', "AXM.go('payments')", 'تحصيل الشهر', money(m.cM.v), m.cM.n + ' عملية') +
        kpi(m.low.length ? 'warn' : 'ok', 'AXM.low()', 'أصناف تحت الحد', num(m.low.length), m.low.length ? 'اضغط لعرضها' : 'كله تمام') +
        kpi(m.fc.length ? 'blue' : 'ok', "AXM.go('forecast')", 'مراكز معادها في السحب', num(m.fc.length), m.fc.length ? 'اضغط عشان تكلّمهم' : 'مفيش حد متأخر') +
      '</section>' +
      (showXl ? '<button type="button" class="mh-xl" onclick="AXM.excel()"><span class="mh-xl-i">' + IC.xls + '</span><span class="mh-xl-t"><b>تصدير كل بيانات البرنامج إلى إكسل</b><em>(ملف واحد بكل الأوراق والمعادلات)</em></span><span class="mh-xl-d">' + IC.down + '</span></button>' : '') +
      '<h2 class="mh-sec">الأقسام</h2>' +
      '<section class="mh-tiles">' + tiles + '</section>' +
    '</div>';
  }
  function renderHome() {
    var pc = document.getElementById('page-content'); if (!pc) return;
    pc.innerHTML = homeHtml();
  }

  /* renderDashboard: phone → the home above; desktop (or «التحليلات الكاملة») → the classic one */
  function wrapDash() {
    var curFn = window.renderDashboard;
    if (typeof curFn !== 'function' || curFn._mh) return;
    /* 4.12.2 · on the phone: the short home on top, and the full analytics right under it — always */
    var w = function () {
      var r = curFn.apply(this, arguments);
      if (mobile()) {
        var pc = document.getElementById('page-content');
        if (pc && !document.getElementById('mh-root')) pc.insertAdjacentHTML('afterbegin', homeHtml() + '<h2 class="mh-sec mh-an" id="mh-an">لوحة التحليلات</h2>');
      }
      return r;
    };
    w._mh = 1; w._ax = curFn._ax; w._pxs = curFn._pxs;
    window.renderDashboard = w;
  }

  /* ════════ header ════════ */
  function mountHeader() {
    var title = document.getElementById('topbar-title'), notif = document.getElementById('notif-btn');
    if (!title || !notif) return;
    if (!document.getElementById('mh-id')) title.insertAdjacentHTML('afterend', '<div class="mh-id" id="mh-id"><b id="mh-co"></b><span id="mh-role"></span></div>');
    if (!document.getElementById('mh-power')) {
      notif.insertAdjacentHTML('afterend',
        '<button type="button" class="icon-btn mh-ic" id="mh-shield" onclick="AXM.shield()" aria-label="الموافقات والطلبات">' + IC.shield + '<span class="mh-dot" id="mh-shield-dot" hidden></span></button>' +
        '<button type="button" class="icon-btn mh-ic" id="mh-search" onclick="AXM.search()" aria-label="بحث">' + IC.search + '</button>' +
        '<button type="button" class="icon-btn mh-ic" id="mh-power" onclick="AXM.power()" aria-label="تسجيل خروج">' + IC.power + '</button>');
    }
    fillHeader();
  }
  function fillHeader() {
    var u = me(); if (!u) return;
    var co = document.getElementById('mh-co'), ro = document.getElementById('mh-role');
    if (co) co.textContent = S().companyName || 'نظام الحسابات';
    if (ro) ro.textContent = roleLabel(u);
    var dot = document.getElementById('mh-shield-dot');
    if (dot) {
      var n = 0;
      try {
        if (u.role === 'admin') {
          n += (window.AXApprovals && AXApprovals.pendingCount) ? AXApprovals.pendingCount() : 0;
          n += window.AXReq ? AXReq.list().filter(function (r) { return r.status === 'pending'; }).length : 0;
        } else if (window.AXReq && AXReq.badgeCount) n += AXReq.badgeCount();
      } catch (e) {}
      dot.hidden = !n; dot.textContent = n > 9 ? '9+' : (n || '');
    }
  }

  /* ════════ bottom nav ════════ */
  function mine() {
    var u = me() || {}, k = ls('ax_mine_' + (u.id || '')) || '';
    if (k && canGo(k)) return k;
    return ['stock', 'forecast', 'payments', 'issuances'].find(canGo) || 'dashboard';
  }
  function buildNav() {
    var bn = document.getElementById('bottom-nav'), u = me(); if (!bn || !u) return;
    var sig = [u.id, canGo('invoices'), canGo('customers'), canGo('issuances'), 'v2'].join('|');
    if (bn.getAttribute('data-mh') === sig && !bn.querySelector('.bn-create')) return;
    var item = function (page, label, icon, click, extra) {
      return '<button type="button" class="bn-item' + (extra || '') + '"' + (page ? ' data-page="' + page + '"' : '') + ' onclick="' + click + '" aria-label="' + label + '">' + icon + '<span>' + label + '</span></button>';
    };
    bn.innerHTML =
      item('dashboard', 'الرئيسية', IC.home, "navigate('dashboard')") +
      item(canGo('issuances') ? 'issuances' : '', 'بيع', IC.sell, 'AXM.sell()', ' bn-sell') +
      (canGo('invoices') ? item('invoices', 'الفواتير', IC.doc, "navigate('invoices')") : '') +
      (canGo('customers') ? item('customers', 'عملاء', IC.users, "navigate('customers')") : '') +
      item('', 'المزيد', IC.more, 'AXM.more()', ' bn-more');
    bn.setAttribute('data-mh', sig);
  }
  var _uhf = window.updateHomeFab;
  window.updateHomeFab = function () {
    try { mountHeader(); buildNav(); } catch (e) { console.warn('[mhome]', e); }
    var r = (typeof _uhf === 'function') ? _uhf.apply(this, arguments) : undefined;
    try { document.documentElement.classList.toggle('mh-home', typeof currentPage !== 'undefined' && currentPage === 'dashboard'); } catch (e) {}
    return r;
  };

  /* ════════ «المزيد» sheet ════════ */
  function more(open) {
    var el = document.getElementById('mh-more');
    if (open === false) { if (el) el.classList.remove('show'); document.documentElement.classList.remove('mh-lock'); return; }
    var u = me() || {};
    var quick = [
      ['issuances', 'AXM.sell()', 'صرف ورق', '#3b82f6'], ['invoices', 'openNewInvoice()', 'فاتورة', '#06b6d4'],
      ['payments', 'openPaymentForm()', 'تحصيل', '#10b981'], ['customers', 'openCustomerForm()', 'عميل جديد', '#8b5cf6'],
      ['expenses', 'openExpenseForm()', 'مصروف', '#ef4444'], ['suppliers', 'openPurchaseForm()', 'فاتورة شراء', '#f97316'],
      ['suppliers', "navigate('suppliers');setTimeout(function(){openSupplierPaymentForm()},140)", 'سداد مورد', '#d97706'],
      ['payments', 'AXWeekly.open()', 'كشوف الأسبوع', '#16a34a'],
      ['dashboard', 'AX.dayClose()', 'تقفيل اليوم', '#0d9488'],
      ['customers', 'AXM.owed()', 'ليا كام برا', '#16a34a'],
      ['suppliers', 'AXM.owe()', 'عليا كام', '#dc2626']
    ].filter(function (q) { return (canGo(q[0]) || (q[0] === 'suppliers' && canGo('debts'))) && (q[1].indexOf('AX.') !== 0 || window.AX); });
    quick = sortQuick(quick, u);
    var all = [];
    try { all = NAV_ITEMS.filter(function (n) { return canGo(n.key); }); } catch (e) {}
    var theme = document.documentElement.getAttribute('data-theme') === 'dark';
    var html = '<div class="mh-scrim" onclick="AXM.more(false)"></div>' +
      '<div class="mh-panel" role="dialog" aria-modal="true" aria-label="المزيد"><div class="mh-grip"></div>' +
        '<div class="mh-me"><span class="mh-av">' + esc(initial(u.name)) + '</span><div><b>' + esc(u.name || '') + '</b><span>' + esc(roleLabel(u)) + ' · ' + esc(S().companyName || 'نظام الحسابات') + '</span></div>' +
          '<button type="button" class="mh-theme" onclick="toggleTheme();AXM.more(false)" aria-label="تبديل الوضع">' + IC.moon + '<span>' + (theme ? 'نهاري' : 'ليلي') + '</span></button></div>' +
        '<button type="button" class="mh-sbox" onclick="AXM.more(false);AXM.search()">' + IC.search + '<span>ابحث عن عميل، فاتورة، صنف…</span></button>' +
        (quick.length ? '<div class="mh-qh"><h6>إنشاء سريع</h6><button type="button" class="mh-qsort" onclick="AXM.qedit()">' + 'رتّب' + '</button></div>' +
          '<p class="mh-qhint">دوس مطوّل على أي زرار وحرّكه للمكان اللي تحبه</p>' +
          '<div class="mh-quick" id="mh-quick">' + quick.map(function (q) { return '<button type="button" data-q="' + esc(q[2]) + '" style="--tc:' + q[3] + '" onclick="AXM.more(false);' + q[1].replace(/"/g, '&quot;') + '"><i>+</i><span>' + q[2] + '</span></button>'; }).join('') + '</div>' : '') +
        '<h6>كل الأقسام</h6><div class="mh-all">' + all.map(function (n) {
          var ic = n.key === 'purchases' ? PURCH_IC : n.icon;
          return '<button type="button" style="--tc:' + n.color + '" onclick="AXM.more(false);navigate(\'' + n.key + '\')"><span class="mh-ai">' + ic + '</span><span>' + esc(n.label) + '</span></button>';
        }).join('') + '</div>' +
        '<button type="button" class="mh-out" onclick="AXM.power()">' + IC.power + 'تسجيل خروج</button>' +
      '</div>';
    if (!el) { el = document.createElement('div'); el.id = 'mh-more'; el.className = 'mh-sheet'; document.body.appendChild(el); }
    el.innerHTML = html; void el.offsetWidth;
    el.classList.add('show');
    document.documentElement.classList.add('mh-lock');
    wireQuick(el);
  }

  /* ════════ «إنشاء سريع» — your own order: long-press a button, then drag it where you like ════════ */
  function qKey(u) { return 'ax_quick_' + ((u && u.id) || ''); }
  function sortQuick(list, u) {
    var saved; try { saved = JSON.parse(ls(qKey(u)) || '[]'); } catch (e) { saved = []; }
    if (!Array.isArray(saved) || !saved.length) return list;
    return list.map(function (q, i) { var k = saved.indexOf(q[2]); return { q: q, k: k < 0 ? 1000 + i : k }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.q; });
  }
  function saveQuick() {
    var box = document.getElementById('mh-quick'); if (!box) return;
    var order = Array.prototype.map.call(box.children, function (b) { return b.getAttribute('data-q'); });
    ls(qKey(me()), JSON.stringify(order));
  }
  var qe = { on: false, drag: null, timer: 0, x: 0, y: 0, ate: 0 };
  function qEdit(on) {
    var panel = document.querySelector('#mh-more .mh-panel'); if (!panel) return;
    qe.on = on === undefined ? !qe.on : !!on;
    panel.classList.toggle('mh-qedit', qe.on);
    var b = panel.querySelector('.mh-qsort'); if (b) b.textContent = qe.on ? 'تم ✓' : 'رتّب';
    if (!qe.on) { saveQuick(); if (qe.drag) qe.drag.classList.remove('mh-qdrag'); qe.drag = null; }
  }
  function wireQuick(el) {
    var box = el.querySelector('#mh-quick'); if (!box) return;
    qe.on = false; qe.drag = null;
    // while arranging, a tap doesn't open anything
    box.addEventListener('click', function (e) { if (qe.on || Date.now() - qe.ate < 400) { e.preventDefault(); e.stopPropagation(); } }, true);
    box.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    box.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      qe.x = e.clientX; qe.y = e.clientY;
      if (qe.on) { startDrag(b); return; }
      clearTimeout(qe.timer);
      qe.timer = setTimeout(function () {                                      // long press → arrange mode, and this button is already in hand
        qEdit(true); qe.ate = Date.now(); startDrag(b);
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (x) {}
      }, 420);
    });
    function startDrag(b) { qe.drag = b; b.classList.add('mh-qdrag'); }
    box.addEventListener('pointermove', function (e) {
      if (!qe.drag) { if (Math.abs(e.clientX - qe.x) > 8 || Math.abs(e.clientY - qe.y) > 8) clearTimeout(qe.timer); return; }
      var t = document.elementFromPoint(e.clientX, e.clientY), over = t && t.closest ? t.closest('#mh-quick > button') : null;
      if (!over || over === qe.drag) return;
      var kids = Array.prototype.slice.call(box.children);
      if (kids.indexOf(over) > kids.indexOf(qe.drag)) box.insertBefore(qe.drag, over.nextSibling); else box.insertBefore(qe.drag, over);
    });
    function drop() { clearTimeout(qe.timer); if (qe.drag) { qe.drag.classList.remove('mh-qdrag'); qe.drag = null; qe.ate = Date.now(); saveQuick(); } }
    box.addEventListener('pointerup', drop); box.addEventListener('pointercancel', drop);
    // no page scrolling while a button is in hand (iOS ignores touch-action set mid-gesture)
    box.addEventListener('touchmove', function (e) { if (qe.drag) e.preventDefault(); }, { passive: false });
  }

  /* ════════ «ليا كام برا» — كل مركز عليه فلوس وقد إيه، من الأكبر للأصغر ════════ */
  function owed(open) {
    var el = document.getElementById('mh-owed');
    if (open === false) { if (el) el.classList.remove('show'); document.documentElement.classList.remove('mh-lock'); return; }
    var list = A('customers').filter(function (c) { return N(c.balance) > 0.5; }).sort(function (a, b) { return N(b.balance) - N(a.balance); });
    var total = list.reduce(function (t, c) { return t + N(c.balance); }, 0), top = list.length ? N(list[0].balance) : 1;
    var rows = list.map(function (c, i) {
      var w = Math.max(4, Math.round(N(c.balance) / top * 100));
      return '<button type="button" class="mo-row" onclick="AXM.owed(false);' + (canGo('payments') ? 'openPaymentForm(\'' + c.id + '\')' : 'navigate(\'customers\')') + '">' +
        '<span class="mo-n">' + (i + 1) + '</span>' +
        '<span class="mo-t"><b>' + esc(c.name) + '</b><i class="mo-bar"><u style="width:' + w + '%"></u></i></span>' +
        '<strong>' + num(c.balance) + ' <small>' + cur() + '</small></strong></button>';
    }).join('');
    var html = '<div class="mh-scrim" onclick="AXM.owed(false)"></div>' +
      '<div class="mh-panel mo" role="dialog" aria-modal="true" aria-label="ليا كام برا"><div class="mh-grip"></div>' +
        '<div class="mo-h"><div><span>ليا كام برا</span><b>' + num(total) + ' <small>' + cur() + '</small></b><em>' +
          (list.length ? 'عند ' + list.length + ' ' + (list.length === 1 ? 'مركز' : list.length <= 10 ? 'مراكز' : 'مركز') : 'مفيش فلوس برا — كله خالص') + '</em></div>' +
          '<button type="button" class="mo-x" onclick="AXM.owed(false)" aria-label="اقفل">✕</button></div>' +
        (list.length ? '<div class="mo-list">' + rows + '</div>' : '') +
        (canGo('aging') ? '<button type="button" class="mo-more" onclick="AXM.owed(false);navigate(\'aging\')">أعمار الديون بالتفصيل</button>' : '') +
      '</div>';
    if (!el) { el = document.createElement('div'); el.id = 'mh-owed'; el.className = 'mh-sheet mo-sheet ax-hl-off'; document.body.appendChild(el); }
    el.innerHTML = html; void el.offsetWidth;
    el.classList.add('show');
    document.documentElement.classList.add('mh-lock');
  }

  /* ════════ «عليا كام» — اللي عليك: الموردين (بضاعة لسه متسددتش) + أي دين تاني مسجّل في «سداد المديونية» ════════ */
  var DKIND = { bank: 'بنك / قرض', person: 'شخص', rent: 'إيجار / أقساط', other: 'دين', supplier: 'مورد' };
  function owe(open) {
    var el = document.getElementById('mh-owe');
    if (open === false) { if (el) el.classList.remove('show'); document.documentElement.classList.remove('mh-lock'); return; }
    var rows = [];
    if (typeof supplierMetrics === 'function') A('suppliers').forEach(function (sp) {
      var b = 0; try { b = N(supplierMetrics(sp.id).balance); } catch (e) {}
      if (b > 0.5) rows.push({ name: sp.name, kind: 'مورد · بضاعة', bal: b, on: canGo('suppliers') ? "navigate('suppliers');setTimeout(function(){openSupplierPaymentForm(null,'" + sp.id + "')},150)" : '' });
    });
    (Array.isArray(S()._debts) ? S()._debts : []).forEach(function (d) {
      if (d.supplierId) return;                                                 // already counted with its supplier
      var paid = (d.payments || []).reduce(function (t, p) { return t + N(p.amount); }, 0), b = Math.max(0, N(d.amount) - paid);
      if (b > 0.5) rows.push({ name: d.name || 'دين', kind: DKIND[d.kind] || 'دين', bal: b, due: d.due, on: canGo('debts') ? "navigate('debts')" : '' });
    });
    rows.sort(function (a, b) { return b.bal - a.bal; });
    var total = rows.reduce(function (t, r) { return t + r.bal; }, 0), top = rows.length ? rows[0].bal : 1;
    var list = rows.map(function (r, i) {
      return '<button type="button" class="mo-row" onclick="AXM.owe(false);' + (r.on ? r.on.replace(/"/g, '&quot;') : '') + '">' +
        '<span class="mo-n">' + (i + 1) + '</span>' +
        '<span class="mo-t"><b>' + esc(r.name) + '</b><em class="mo-k">' + esc(r.kind) + (r.due ? ' · لحد ' + esc(r.due) : '') + '</em><i class="mo-bar"><u style="width:' + Math.max(4, Math.round(r.bal / top * 100)) + '%"></u></i></span>' +
        '<strong>' + num(r.bal) + ' <small>' + cur() + '</small></strong></button>';
    }).join('');
    var html = '<div class="mh-scrim" onclick="AXM.owe(false)"></div>' +
      '<div class="mh-panel mo mo-owe" role="dialog" aria-modal="true" aria-label="عليا كام"><div class="mh-grip"></div>' +
        '<div class="mo-h"><div><span>عليا كام</span><b>' + num(total) + ' <small>' + cur() + '</small></b><em>' +
          (rows.length ? 'لـ ' + rows.length + ' ' + (rows.length === 1 ? 'جهة' : rows.length <= 10 ? 'جهات' : 'جهة') + ' — موردين وديون' : 'مفيش عليك حاجة لحد — كله متسدد') + '</em></div>' +
          '<button type="button" class="mo-x" onclick="AXM.owe(false)" aria-label="اقفل">✕</button></div>' +
        (rows.length ? '<div class="mo-list">' + list + '</div>' : '') +
        '<div class="mo-btns">' +
          (canGo('suppliers') ? '<button type="button" class="mo-more" onclick="AXM.owe(false);navigate(\'suppliers\')">الموردين</button>' : '') +
          (canGo('debts') ? '<button type="button" class="mo-more" onclick="AXM.owe(false);navigate(\'debts\')">سجّل / سدّد دين</button>' : '') +
        '</div>' +
      '</div>';
    if (!el) { el = document.createElement('div'); el.id = 'mh-owe'; el.className = 'mh-sheet mo-sheet ax-hl-off'; document.body.appendChild(el); }
    el.innerHTML = html; void el.offsetWidth;
    el.classList.add('show');
    document.documentElement.classList.add('mh-lock');
  }

  /* ════════ full-screen search (re-uses the global search box) ════════ */
  function search(open) {
    var ov = document.getElementById('mh-sov'), box = document.getElementById('global-search-box');
    if (open === false) {
      if (ov) ov.classList.remove('show');
      document.documentElement.classList.remove('mh-lock');
      if (box && boxHome && box.parentNode !== boxHome.p) { boxHome.p.insertBefore(box, boxHome.n); box.classList.remove('mh-in'); }
      var sr = document.getElementById('search-results'); if (sr) sr.classList.remove('show');
      return;
    }
    if (!box) return;
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'mh-sov'; ov.className = 'mh-sov';
      ov.innerHTML = '<div class="mh-sov-h"><button type="button" class="mh-sov-x" onclick="AXM.search(false)" aria-label="رجوع">' + IC.back + '</button><div class="mh-sov-slot" id="mh-sov-slot"></div></div>' +
        '<p class="mh-sov-hint">ابحث في العملاء والفواتير وصرف الورق والأصناف والتحصيل — أو اضغط على الميكروفون واتكلم</p>';
      ov.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.search-result-item')) setTimeout(function () { search(false); }, 40); });
      document.body.appendChild(ov);
    }
    if (!boxHome || box.parentNode !== document.getElementById('mh-sov-slot')) boxHome = { p: box.parentNode, n: box.nextSibling };
    document.getElementById('mh-sov-slot').appendChild(box);
    box.classList.add('mh-in');
    ov.classList.add('show');
    document.documentElement.classList.add('mh-lock');
    var inp = document.getElementById('global-search');
    if (inp) { inp.value = ''; try { inp.focus(); } catch (e) {} }
  }

  /* ════════ actions ════════ */
  function sell() {
    if (canGo('issuances') && typeof openIssuanceForm === 'function') openIssuanceForm();
    else if (canGo('invoices') && typeof openNewInvoice === 'function') openNewInvoice();
    else if (typeof toast === 'function') toast('البيع مش متاح ليك', 'error');
  }
  function power() {
    more(false);
    if (typeof confirmDialog === 'function') confirmDialog('تسجيل خروج من البرنامج؟', function () { if (typeof logout === 'function') logout(); });
    else if (typeof logout === 'function') logout();
  }
  function shield() {
    var u = me() || {};
    if (u.role === 'admin') {
      var ap = (window.AXApprovals && AXApprovals.pendingCount) ? AXApprovals.pendingCount() : 0;
      var rq = window.AXReq ? AXReq.list().filter(function (r) { return r.status === 'pending'; }).length : 0;
      return go(rq && !ap ? 'requests' : 'approvals');
    }
    go(window.AXReq && AXReq.badgeCount && AXReq.badgeCount() ? 'requests' : 'approvals');
  }
  function low() {
    var l = A('products').filter(function (p) { return N(p.quantity) <= N(p.minQuantity); }).sort(function (a, b) { return N(a.quantity) / Math.max(1, N(a.minQuantity)) - N(b.quantity) / Math.max(1, N(b.minQuantity)); });
    var asked = function (pid) { return !!(window.AXReq && AXReq.pendingFor && AXReq.pendingFor(pid)); };
    var body = l.length ? '<ul class="mh-low">' + l.map(function (p) {
      var pct = Math.max(0, Math.min(100, Math.round(N(p.quantity) / Math.max(1, N(p.minQuantity)) * 100)));
      return '<li><div><b>' + esc(p.name) + '</b><span>' + num(p.quantity) + ' ' + esc(p.unit || '') + ' من حد ' + num(p.minQuantity) + '</span><i><u style="width:' + pct + '%"></u></i></div>' +
        (asked(p.id) ? '<em>متطلب</em>' : (canGo('requests') && window.AXReq ? '<button type="button" onclick="AXM.order(\'' + p.id + '\')">اطلب</button>' : '')) + '</li>';
    }).join('') + '</ul>' : '<p class="mh-low-ok">كل الأصناف فوق الحد الأدنى 👌</p>';
    openModal('أصناف تحت الحد (' + l.length + ')', body, '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>' + (canGo('stock') || canGo('inventory') ? '<button class="btn btn-primary" onclick="closeModal();AXM.go(\'' + (canGo('stock') ? 'stock' : 'inventory') + '\')">افتح المخزن</button>' : ''));
  }
  function order(pid) {
    var before = window.AXReq ? AXReq.list().length : 0;
    if (window.AXReq) AXReq.quick(pid);
    if (!window.AXReq || AXReq.list().length === before) { closeModal(); go('stock'); setTimeout(function () { if (window.AXStock && AXStock.tab) AXStock.tab('po'); }, 140); return; }
    low();
  }

  /* keep the header fresh with the data */
  document.addEventListener('axn:badge', function () { try { fillHeader(); } catch (e) {} });
  if (MQ.addEventListener) MQ.addEventListener('change', function () {
    try { if (typeof currentPage !== 'undefined' && currentPage === 'dashboard' && me()) renderDashboard(); } catch (e) {}
    if (!mobile()) { more(false); search(false); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { more(false); search(false); } });
  function boot() { wrapDash(); try { if (me()) { mountHeader(); buildNav(); } } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('load', boot);

  window.AXM = {
    render: renderHome, more: more, owed: owed, owe: owe, qedit: function () { qEdit(); }, search: search, sell: sell, power: power, shield: shield, low: low, order: order, mine: mine,
    go: function (p) { more(false); go(p); },
    setMine: function (k) { var u = me() || {}; ls('ax_mine_' + (u.id || ''), k); buildNav(); if (typeof updateHomeFab === 'function') updateHomeFab(); if (typeof toast === 'function') toast('«شاشتي» بقت: ' + ((navItem(k) || {}).label || k)); },
    excel: function () { if (window.AXX) AXX.exportAll(); },
    classic: function (on) { classic = !!on; if (typeof renderDashboard === 'function') renderDashboard(); try { window.scrollTo(0, 0); } catch (e) {} },
    _metrics: metrics
  };
})();

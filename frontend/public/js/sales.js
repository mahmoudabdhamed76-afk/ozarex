/* ════════════════════════════════════════════════════════════════════
   ERP · المبيعات (4.27)
   كل عملية بيع = عملية صرف ورق لمركز/عميل (رقم · تاريخ · المركز · نوع الورق · الكمية · المبلغ).
   • الموبايل: كارت عنوان («+ مبيعات جديدة» · المبيعات · تقويم/فلتر/بحث) ← إجمالي المبيعات مع
     اختيار الفترة ← «قائمة المبيعات» بعدد العمليات وجدول بيترتب بالتاريخ / نوع الورق / الكمية.
   • الكمبيوتر: نفس شكل صفحة الفواتير (عنوان · أزرار · مربعات أرقام · فلاتر · جدول).
   • «مبيعات جديدة» = نفس فورمة صرف الورق. اللي يقدر يفتح «صرف الورق» بيقدر يفتح «المبيعات».
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MQ = window.matchMedia('(max-width: 768px)');
  var F = { period: 'month', from: '', to: '', q: '', customerId: '', productId: '', sort: 'date', dir: -1, search: false };
  var steps = { mark: 'sl-more', shown: 0, key: '', obs: null, tbody: '#page-content .sl-rows' };
  var PERIODS = [['today', 'النهارده'], ['week', 'الأسبوع ده'], ['month', 'هذا الشهر'], ['last', 'الشهر اللي فات'], ['year', 'السنة دي'], ['all', 'كل الفترات'], ['custom', 'فترة مخصصة']];

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function money(n) { return typeof fmtCurrency === 'function' ? fmtCurrency(n) : N(n).toFixed(2); }
  function num(n) { return typeof fmt === 'function' ? fmt(n) : String(n); }
  function norm(s) { return typeof normalizeArabic === 'function' ? normalizeArabic(s) : String(s || '').toLowerCase(); }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return typeof todayStr === 'function' ? todayStr() : ymd(new Date()); }
  function role() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || ''; }
  function mobile() { return MQ.matches; }

  /* the period → [from, to] (inclusive dates, '' = open) */
  function range() {
    var t = today(), d = new Date(t + 'T00:00:00');
    switch (F.period) {
      case 'today': return [t, t];
      case 'week': { var s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return [ymd(s), t]; }   // the week starts on Saturday
      case 'month': return [t.slice(0, 8) + '01', t];
      case 'last': { var a = new Date(d.getFullYear(), d.getMonth() - 1, 1), b = new Date(d.getFullYear(), d.getMonth(), 0); return [ymd(a), ymd(b)]; }
      case 'year': return [t.slice(0, 4) + '-01-01', t];
      case 'custom': return [F.from || '', F.to || ''];
      default: return ['', ''];
    }
  }
  function periodLabel() {
    if (F.period === 'custom') { var r = range(); return (r[0] || '…') + ' ← ' + (r[1] || '…'); }
    var p = PERIODS.find(function (x) { return x[0] === F.period; }); return p ? p[1] : '';
  }

  function list() {
    var r = range(), q = norm(F.q.trim());
    var out = A('issuances').filter(function (i) {
      if (r[0] && String(i.date || '') < r[0]) return false;
      if (r[1] && String(i.date || '') > r[1]) return false;
      if (F.customerId && i.customerId !== F.customerId) return false;
      if (F.productId && i.productId !== F.productId) return false;
      if (q && norm(i.customerName).indexOf(q) < 0 && norm(i.productName).indexOf(q) < 0 && String(i.number).indexOf(F.q.trim()) < 0) return false;
      return true;
    });
    var k = F.sort, dir = F.dir;
    var val = { date: function (i) { return String(i.date || '') + String(1e15 + N(i.createdAt)); }, number: function (i) { return N(i.number); },
      customer: function (i) { return String(i.customerName || ''); }, product: function (i) { return String(i.productName || ''); },
      qty: function (i) { return N(i.quantity); }, total: function (i) { return N(i.total); } }[k] || function (i) { return String(i.date || ''); };
    out.sort(function (a, b) {
      var x = val(a), y = val(b);
      var c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ar');
      if (!c) c = N(b.createdAt) - N(a.createdAt);
      return c * dir;
    });
    return out;
  }
  function ops(n) { return n + ' ' + (n >= 3 && n <= 10 ? 'عمليات بيع' : 'عملية بيع'); }

  var I = {
    plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    bars: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="11" width="4.5" height="10" rx="1.6"/><rect x="9.75" y="4" width="4.5" height="17" rx="1.6"/><rect x="16.5" y="8" width="4.5" height="13" rx="1.6"/></svg>',
    cal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><line x1="16" y1="2.5" x2="16" y2="6"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/></svg>',
    filter: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    trend: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" opacity=".9"/><path d="M14 2v6h6" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/><rect x="8" y="12" width="8" height="1.8" rx=".9" fill="#fff"/><rect x="8" y="16" width="6" height="1.8" rx=".9" fill="#fff"/></svg>',
    list: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
  };
  function sortTh(k, label, cls) {
    var on = F.sort === k, arrow = '<i class="sl-sort' + (on ? (F.dir > 0 ? ' up' : ' down') : '') + '" aria-hidden="true"></i>';
    return '<th class="sl-th-s' + (on ? ' on' : '') + (cls ? ' ' + cls : '') + '" onclick="AXSales.sort(\'' + k + '\')" aria-sort="' + (on ? (F.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><span>' + label + arrow + '</span></th>';
  }
  function periodOptions() {
    return PERIODS.map(function (p) { return '<option value="' + p[0] + '"' + (F.period === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('');
  }

  /* ── one row ── */
  function rowM(i) {
    return '<tr onclick="AXSales.open(\'' + esc(i.id) + '\')"><td class="sl-no">#' + esc(i.number) + '</td><td class="sl-dt">' + esc(i.date) + '</td>' +
      '<td class="sl-cu">' + esc(i.customerName) + '</td><td class="sl-pr">' + esc(i.productName) + '</td><td class="sl-q">' + num(i.quantity) + '</td></tr>';
  }
  function rowD(i, ctx) {
    var rem = N(i.total) - N(i.paid);
    return '<tr>' +
      '<td><b style="color:var(--primary)">#' + esc(i.number) + '</b></td>' +
      '<td>' + esc(i.date) + '</td>' +
      '<td><b>' + esc(i.customerName) + '</b></td>' +
      '<td>' + esc(i.productName) + '</td>' +
      '<td><b>' + num(i.quantity) + '</b> <small style="color:var(--text-muted)">' + esc(i.unit || i.productUnit || '') + '</small></td>' +
      '<td><b>' + money(i.total) + '</b></td>' +
      '<td style="color:' + (rem > 0 ? 'var(--danger)' : 'var(--success)') + '">' + money(rem) + '</td>' +
      '<td>' + (typeof statusBadge === 'function' ? statusBadge(i.status) : esc(i.status)) + '</td>' +
      '<td><div class="row-actions">' +
        '<button class="btn-icon" title="عرض" onclick="viewIssuance(\'' + esc(i.id) + '\')">' + I.eye + '</button>' +
        '<button class="btn-icon" title="طباعة إيصال" onclick="printIssuance(\'' + esc(i.id) + '\')">' + I.print + '</button>' +
        (ctx.canEdit ? '<button class="btn-icon" title="تعديل" style="color:var(--info)" onclick="editIssuance(\'' + esc(i.id) + '\')">' + I.edit + '</button>' : '') +
      '</div></td></tr>';
  }

  /* ── the page ── */
  function render() {
    var root = document.getElementById('page-content'); if (!root) return;
    var l = list(), total = 0, paid = 0;
    l.forEach(function (i) { total += N(i.total); paid += N(i.paid); });
    var key = JSON.stringify([F.period, F.from, F.to, F.q, F.customerId, F.productId, F.sort, F.dir, mobile()]);
    var shown = (typeof _stepCount === 'function') ? _stepCount(steps, l, key) : l.length;
    var ctx = { canEdit: role() === 'admin' || role() === 'accountant' };
    var head = mobile() ? mHead(l, total) : dHead(l, total, paid);
    var rows = l.slice(0, shown).map(mobile() ? rowM : function (i) { return rowD(i, ctx); }).join('');
    var empty = '<tr class="sl-empty"><td colspan="' + (mobile() ? 5 : 9) + '"><div class="empty-state"><div class="icon">📊</div><p>مفيش مبيعات في ' + esc(F.period === 'all' ? 'البرنامج لسه' : 'الفترة دي') + '</p>' +
      '<button class="btn btn-primary" style="margin-top:12px" onclick="AXSales.add()">مبيعات جديدة</button></div></td></tr>';
    root.innerHTML = head.replace('%ROWS%', function () { return l.length ? rows : empty; }) + ((typeof _stepMark === 'function') ? _stepMark(steps, l) : '');
    if (typeof _stepWatch === 'function') _stepWatch(steps, l, mobile() ? rowM : function (i) { return rowD(i, ctx); });
    wire();
  }

  function mHead(l, total) {
    return '<div class="sl sl-m ax-hl-off">' +
      '<header class="sl-head">' +
        '<button type="button" class="sl-new" onclick="AXSales.add()" aria-label="مبيعات جديدة">' + I.plus + '<span class="sl-new-l">مبيعات جديدة</span><span class="sl-new-s">جديدة</span></button>' +
        '<div class="sl-title"><b><i class="sl-bars">' + I.bars + '</i><span>المبيعات</span></b><span>قائمة المبيعات</span></div>' +
        '<div class="sl-tools">' +
          '<button type="button" class="sl-tool' + (F.period === 'custom' ? ' on' : '') + '" aria-label="فترة من تاريخ لتاريخ" onclick="AXSales.dates()">' + I.cal + '</button>' +
          '<button type="button" class="sl-tool' + (F.customerId || F.productId ? ' on' : '') + '" aria-label="فلترة" onclick="AXSales.filters()">' + I.filter + '</button>' +
          '<button type="button" class="sl-tool' + (F.search || F.q ? ' on' : '') + '" aria-label="بحث" onclick="AXSales.toggleSearch()">' + I.search + '</button>' +
        '</div>' +
      '</header>' +
      (F.search || F.q ? '<div class="sl-sbar">' + I.search + '<input id="sl-q" type="search" placeholder="ابحث باسم المركز أو نوع الورق أو الرقم…" value="' + esc(F.q) + '" autocomplete="off"></div>' : '') +
      '<section class="sl-sum">' +
        '<label class="sl-period">' + I.cal + '<select id="sl-period" aria-label="الفترة">' + periodOptions() + '</select>' + (F.period === 'custom' ? '<em>' + esc(periodLabel()) + '</em>' : '') + I.chev + '</label>' +
        '<div class="sl-total"><span>إجمالي المبيعات <i>' + I.trend + '</i></span><b class="ax-hl-off">' + money(total) + '</b></div>' +
      '</section>' +
      '<section class="sl-card">' +
        '<div class="sl-card-h">' +
          '<div class="sl-card-t"><b><i>' + I.doc + '</i><span>قائمة المبيعات</span></b><span>جميع عمليات البيع المسجلة في النظام</span></div>' +
          '<span class="sl-chip">' + I.list + '<span>' + ops(l.length) + '</span></span>' +
        '</div>' +
        '<div class="sl-tbl-wrap"><table class="sl-tbl"><thead><tr>' +
          '<th class="sl-th-no">رقم</th>' + sortTh('date', 'التاريخ') + '<th>المركز / العميل</th>' + sortTh('product', 'نوع الورق') + sortTh('qty', 'الكمية') +
        '</tr></thead><tbody class="sl-rows">%ROWS%</tbody></table></div>' +
      '</section></div>';
  }

  function dHead(l, total, paid) {
    var cs = A('customers').slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
    var ps = A('products');
    return '<div class="sl sl-d">' +
      '<div class="page-header"><div><div class="page-title">المبيعات</div>' +
        '<div class="page-subtitle">' + ops(l.length) + ' • ' + esc(periodLabel()) + ' • إجمالي: ' + money(total) + '</div></div></div>' +
      '<div class="section-action-bar">' +
        '<button class="btn btn-primary" onclick="AXSales.add()">' + I.plus + ' مبيعات جديدة</button>' +
        '<button class="btn btn-secondary" onclick="exportCSV(\'issuances\')">📥 تصدير Excel</button>' +
      '</div>' +
      '<div class="kpi-bar">' +
        '<div class="kpi"><div class="l">عدد عمليات البيع</div><div class="v">' + l.length + '</div></div>' +
        '<div class="kpi"><div class="l">إجمالي المبيعات</div><div class="v" style="color:var(--success)">' + money(total) + '</div></div>' +
        '<div class="kpi"><div class="l">المحصل</div><div class="v">' + money(paid) + '</div></div>' +
        '<div class="kpi"><div class="l">المتبقي</div><div class="v" style="color:var(--danger)">' + money(total - paid) + '</div></div>' +
      '</div>' +
      '<div class="filter-bar">' +
        '<input class="form-control" id="sl-q" type="search" placeholder="🔍 بحث (المركز، نوع الورق، الرقم...)" value="' + esc(F.q) + '" style="flex:1;min-width:200px">' +
        '<select class="form-control" id="sl-period" style="max-width:170px" aria-label="الفترة">' + periodOptions() + '</select>' +
        (F.period === 'custom' ? '<input class="form-control" type="date" id="sl-from" value="' + esc(F.from) + '" title="من" style="max-width:150px"><input class="form-control" type="date" id="sl-to" value="' + esc(F.to) + '" title="إلى" style="max-width:150px">' : '') +
        '<select class="form-control" id="sl-cust" style="min-width:150px;max-width:220px"><option value="">جميع المراكز</option>' +
          cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (F.customerId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' +
        '<select class="form-control" id="sl-prod" style="min-width:140px;max-width:200px"><option value="">جميع أنواع الورق</option>' +
          ps.map(function (p) { return '<option value="' + esc(p.id) + '"' + (F.productId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-ghost" onclick="AXSales.reset()">إعادة ضبط</button>' +
      '</div>' +
      '<div class="table-wrap"><div class="table-scroll"><table class="data-table sl-dtable"><thead><tr>' +
        sortTh('number', 'رقم') + sortTh('date', 'التاريخ') + sortTh('customer', 'المركز / العميل') + sortTh('product', 'نوع الورق') + sortTh('qty', 'الكمية') +
        sortTh('total', 'الإجمالي') + '<th>المتبقي</th><th>الحالة</th><th>إجراءات</th>' +
      '</tr></thead><tbody class="sl-rows">%ROWS%</tbody></table></div></div></div>';
  }

  function wire() {
    var q = document.getElementById('sl-q');
    if (q) q.addEventListener('input', function (e) {
      F.q = e.target.value; render();
      var s = document.getElementById('sl-q'); if (s) { s.focus(); try { s.setSelectionRange(s.value.length, s.value.length); } catch (x) {} }
    });
    var p = document.getElementById('sl-period');
    if (p) p.addEventListener('change', function (e) { if (e.target.value === 'custom' && mobile()) { dates(); return; } F.period = e.target.value; render(); });
    [['sl-from', 'from'], ['sl-to', 'to'], ['sl-cust', 'customerId'], ['sl-prod', 'productId']].forEach(function (x) {
      var el = document.getElementById(x[0]); if (el) el.addEventListener('change', function (e) { F[x[1]] = e.target.value; render(); });
    });
  }

  /* ── phone: calendar + filter sheets (the app's normal popup) ── */
  function dates() {
    if (typeof openModal !== 'function') return;
    var r = range();
    openModal('📅 فترة المبيعات',
      '<div class="form-row"><div class="form-group"><label>من تاريخ</label><input class="form-control" type="date" id="sl-m-from" value="' + esc(F.period === 'custom' ? F.from : r[0]) + '"></div>' +
      '<div class="form-group"><label>إلى تاريخ</label><input class="form-control" type="date" id="sl-m-to" value="' + esc(F.period === 'custom' ? F.to : r[1]) + '"></div></div>',
      '<button class="btn btn-ghost" onclick="AXSales.period(\'month\')">هذا الشهر</button><button class="btn btn-primary" onclick="AXSales.applyDates()">عرض</button>');
  }
  function filters() {
    if (typeof openModal !== 'function') return;
    var cs = A('customers').slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
    openModal('فلترة المبيعات',
      '<div class="form-group"><label>المركز / العميل</label><select class="form-control" id="sl-m-cust"><option value="">جميع المراكز</option>' +
        cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (F.customerId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>نوع الورق</label><select class="form-control" id="sl-m-prod"><option value="">جميع أنواع الورق</option>' +
        A('products').map(function (p) { return '<option value="' + esc(p.id) + '"' + (F.productId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>',
      '<button class="btn btn-ghost" onclick="AXSales.clearFilters()">مسح الفلتر</button><button class="btn btn-primary" onclick="AXSales.applyFilters()">عرض</button>');
  }
  function close() { if (typeof closeModal === 'function') closeModal(); }

  window.renderSales = render;
  window.AXSales = {
    render: render, list: list, range: range,
    add: function () { if (typeof openIssuanceForm === 'function') openIssuanceForm(); },
    open: function (id) { if (typeof viewIssuance === 'function') viewIssuance(id); },
    sort: function (k) { if (F.sort === k) F.dir = -F.dir; else { F.sort = k; F.dir = (k === 'date' || k === 'qty' || k === 'total' || k === 'number') ? -1 : 1; } render(); },
    period: function (p) { F.period = p; close(); render(); },
    dates: dates, filters: filters,
    applyDates: function () { F.from = (document.getElementById('sl-m-from') || {}).value || ''; F.to = (document.getElementById('sl-m-to') || {}).value || ''; F.period = 'custom'; close(); render(); },
    applyFilters: function () { F.customerId = (document.getElementById('sl-m-cust') || {}).value || ''; F.productId = (document.getElementById('sl-m-prod') || {}).value || ''; close(); render(); },
    clearFilters: function () { F.customerId = ''; F.productId = ''; close(); render(); },
    toggleSearch: function () { F.search = !F.search; if (!F.search) F.q = ''; render(); var s = document.getElementById('sl-q'); if (s) s.focus(); },
    reset: function () { F.period = 'month'; F.from = ''; F.to = ''; F.q = ''; F.customerId = ''; F.productId = ''; F.sort = 'date'; F.dir = -1; F.search = false; render(); },
    filtersState: function () { return JSON.parse(JSON.stringify(F)); }
  };

  /* an issuance saved / edited / deleted while «المبيعات» is open → this page refreshes (not the issuances page) */
  var ri = window.renderIssuances;
  if (typeof ri === 'function' && !ri._sl) {
    var w = function () { if (typeof currentPage !== 'undefined' && currentPage === 'sales') return render(); return ri.apply(this, arguments); };
    w._sl = true; window.renderIssuances = w;
  }
  /* phone ↔ computer width change while the page is open */
  try { MQ.addEventListener('change', function () { if (typeof currentPage !== 'undefined' && currentPage === 'sales') render(); }); } catch (e) {}
})();

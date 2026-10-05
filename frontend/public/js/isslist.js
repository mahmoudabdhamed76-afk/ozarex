/* ════════════════════════════════════════════════════════════════════
   ERP · صرف الورق — القايمة (4.10)
   ------------------------------------------------------------------
   قايمة هادية تتقري بسرعة: كل عملية صرف سطر واحد بس —
     · نقطة الحالة (أخضر مدفوع · برتقاني جزئي/عليها فلوس · أحمر متأخر)
     · اسم المركز، وتحته الصنف والكمية
     · المبلغ، وتحته «مدفوع» أو «باقي …» أو «متأخر …»
   ومفيش أزرار في القايمة: تدوس على السطر تفتح ورقة العملية وفيها كل
   حاجة (تحصيل، طباعة، تعديل، حذف). الأيام عناوين صغيرة، والفلاتر
   الزيادة مستخبية في «فلترة».
   كل عملية صرف سطر واحد حتى لو فيها كذا صنف (نفس الرقم والمركز والتاريخ).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PAGE = 50;
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function cur() { return ((D().settings || {}).currency) || 'ج'; }
  function num(n) {
    n = Number(n) || 0;
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    return n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }
  function money(n) { return '‎' + num(n) + ' ' + cur(); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function addDays(ds, k) { var d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + k); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 864e5); }
  function F() {
    if (typeof issuanceFilters === 'undefined') window.issuanceFilters = {};
    var f = issuanceFilters;
    if (f.search == null) f.search = '';
    ['from', 'to', 'customerId', 'productId', 'status'].forEach(function (k) { if (f[k] == null) f[k] = ''; });
    if (!f.group) f.group = 'day';
    if (!f.limit) f.limit = PAGE;
    return f;
  }
  function role() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || ''; }
  function canEdit() { return role() === 'admin' || role() === 'accountant'; }
  function canDelete() { return role() === 'admin'; }

  function dayLabel(ds) {
    var t = today();
    if (ds === t) return 'النهارده';
    if (ds === addDays(t, -1)) return 'امبارح';
    var d = new Date(ds + 'T00:00:00');
    if (isNaN(d)) return ds || '—';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (String(d.getFullYear()) !== t.slice(0, 4) ? ' ' + d.getFullYear() : '');
  }
  function shortDate(ds) { var d = new Date(ds + 'T00:00:00'); return isNaN(d) ? (ds || '') : d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function ops(n) { return n + ' ' + (n === 1 ? 'عملية' : n >= 3 && n <= 10 ? 'عمليات' : 'عملية'); }
  function unitOf(i) { return i.productUnit || i.unit || ((A('products').find(function (p) { return p.id === i.productId; }) || {}).unit) || ''; }

  /* ── one line per صرف: same number + center + date ── */
  function batches() {
    var m = {}, out = [];
    A('issuances').forEach(function (i) {
      var k = (i.number || i.id) + '|' + (i.customerId || '') + '|' + (i.date || '');
      var b = m[k];
      if (!b) {
        b = m[k] = { key: k, number: i.number, date: i.date || '', customerId: i.customerId, customerName: i.customerName || '—', items: [], total: 0, paid: 0, due: null, notes: '', createdAt: 0 };
        out.push(b);
      }
      b.items.push(i);
      b.total += Number(i.total) || 0;
      b.paid += Number(i.paid) || 0;
      b.createdAt = Math.max(b.createdAt, Number(i.createdAt) || 0);
      if (i.notes && !b.notes) b.notes = i.notes;
      var rem = (Number(i.total) || 0) - (Number(i.paid) || 0);
      if (i.dueDate && rem > 0.005 && (!b.due || i.dueDate < b.due)) b.due = i.dueDate;
    });
    var t = today();
    out.forEach(function (b) {
      b.items.sort(function (x, y) { return (x.batchIndex || 0) - (y.batchIndex || 0); });
      b.rem = Math.max(0, b.total - b.paid);
      b.status = b.rem <= 0.005 ? 'paid' : b.paid > 0.005 ? 'partial' : 'unpaid';
      b.late = b.due && b.due < t && b.rem > 0.005 ? daysBetween(b.due, t) : 0;
      b.qty = b.items.reduce(function (s, i) { return s + (Number(i.quantity) || 0); }, 0);
    });
    out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || (Number(b.number) || 0) - (Number(a.number) || 0) || b.createdAt - a.createdAt; });
    return out;
  }

  function norm(s) { return (typeof normalizeArabic === 'function') ? normalizeArabic(s) : String(s || '').toLowerCase(); }
  function baseFilter(all) {
    var f = F(), q = norm(f.search.trim());
    return all.filter(function (b) {
      if (f.from && b.date < f.from) return false;
      if (f.to && b.date > f.to) return false;
      if (f.customerId && b.customerId !== f.customerId) return false;
      if (f.productId && !b.items.some(function (i) { return i.productId === f.productId; })) return false;
      if (q) {
        var hay = norm(b.customerName + ' ' + b.items.map(function (i) { return i.productName; }).join(' ') + ' ' + b.number + ' ' + (b.notes || ''));
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function byStatus(list, s) {
    if (!s) return list;
    if (s === 'late') return list.filter(function (b) { return b.late > 0; });
    if (s === 'open') return list.filter(function (b) { return b.rem > 0.005; });
    return list.filter(function (b) { return b.status === s; });
  }
  function tone(b) { return b.late ? 'late' : b.status === 'paid' ? 'paid' : b.status === 'partial' ? 'part' : 'open'; }
  function stateTxt(b) {
    if (b.status === 'paid') return 'مدفوع';
    if (b.late) return 'متأخر ' + b.late + ' يوم';
    return 'باقي ' + money(b.rem);
  }
  function what(b) {
    var first = b.items[0];
    if (b.items.length === 1) return esc(first.productName || 'صنف') + ' · ' + num(first.quantity) + (unitOf(first) ? ' ' + esc(unitOf(first)) : '');
    return b.items.length + ' أصناف · ' + b.items.slice(0, 2).map(function (i) { return esc(i.productName || 'صنف'); }).join('، ') + (b.items.length > 2 ? '…' : '');
  }

  var IC = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>'
  };

  function row(b, mode) {
    var t = tone(b);
    var title = mode === 'center' ? dayLabel(b.date) : b.customerName;
    var k = esc(b.key).replace(/'/g, '&#39;');
    return '<button type="button" class="isl-row t-' + t + '" onclick="AXIss.open(\'' + k + '\')">' +
      '<i class="isl-dot" aria-hidden="true"></i>' +
      '<span class="isl-main"><b>' + esc(title) + '</b><span>' + what(b) + '</span></span>' +
      '<span class="isl-amt"><b>' + money(b.total) + '</b><span>' + stateTxt(b) + '</span></span>' +
      '<span class="isl-chev" aria-hidden="true">' + IC.chev + '</span>' +
    '</button>';
  }

  function groups(list, mode) {
    var m = {}, out = [];
    list.forEach(function (b) {
      var k = mode === 'center' ? b.customerId : b.date;
      var g = m[k];
      if (!g) { g = m[k] = { key: k, label: mode === 'center' ? b.customerName : dayLabel(b.date), list: [], total: 0, rem: 0, last: b.date }; out.push(g); }
      g.list.push(b); g.total += b.total; g.rem += b.rem;
      if (b.date > g.last) g.last = b.date;
    });
    if (mode === 'center') out.sort(function (a, b) { return b.rem - a.rem || String(b.last).localeCompare(String(a.last)); });
    return out;
  }

  function drawList() {
    var host = document.getElementById('isx-list'); if (!host) return;
    var f = F(), all = batches(), base = baseFilter(all), list = byStatus(base, f.status);
    var cnt = function (s) { return byStatus(base, s).length; };
    var chips = [['', 'الكل'], ['open', 'عليها فلوس'], ['late', 'متأخر'], ['paid', 'مدفوع']];
    var ch = document.getElementById('isx-chips');
    if (ch) ch.innerHTML = chips.map(function (c) {
      var n = cnt(c[0]);
      return '<button type="button" class="' + (f.status === c[0] ? 'on' : '') + (c[0] === 'late' ? ' late' : '') + '" onclick="AXIss.status(\'' + c[0] + '\')" aria-pressed="' + (f.status === c[0]) + '">' + c[1] + (n ? ' <em>' + n + '</em>' : '') + '</button>';
    }).join('');
    var fb = document.getElementById('isx-fcount');
    if (fb) { var n = ['customerId', 'productId', 'from', 'to'].filter(function (k) { return f[k]; }).length + (f.group === 'center' ? 1 : 0); fb.textContent = n ? n : ''; fb.hidden = !n; }

    if (!list.length) {
      var any = all.length > 0;
      host.innerHTML = '<div class="isl-empty"><b>' + (any ? 'مفيش عمليات بالفلتر ده' : 'لسه مفيش عمليات صرف') + '</b>' +
        '<span>' + (any ? 'جرّب تمسح البحث أو الفلاتر' : 'أول عملية صرف هتظهر هنا') + '</span>' +
        (any ? '<button type="button" onclick="AXIss.reset()">امسح الفلاتر</button>' : '<button type="button" class="pri" onclick="openIssuanceForm()">صرف ورق جديد</button>') + '</div>';
      return;
    }
    var shown = list.slice(0, f.limit), mode = f.group;
    var sumTot = list.reduce(function (s, b) { return s + b.total; }, 0), sumRem = list.reduce(function (s, b) { return s + b.rem; }, 0);
    var filtered = f.status || f.search || f.customerId || f.productId || f.from || f.to;
    host.innerHTML =
      (filtered ? '<div class="isl-found">' + ops(list.length) + ' · ' + money(sumTot) + (sumRem > 0.5 ? ' · باقي ' + money(sumRem) : '') + '</div>' : '') +
      '<div class="isl">' + groups(shown, mode).map(function (g) {
        return '<div class="isl-day"><b>' + esc(g.label) + '</b><span>' + money(g.total) + '</span></div>' +
          g.list.map(function (b) { return row(b, mode); }).join('');
      }).join('') + '</div>' +
      (list.length > shown.length ? '<button type="button" class="isl-more" onclick="AXIss.more()">اعرض كمان (فاضل ' + (list.length - shown.length) + ')</button>' : '');
  }

  function renderIssuances() {
    var root = document.getElementById('page-content'); if (!root) return;
    var f = F(), all = batches(), t = today(), ms = t.slice(0, 8) + '01';
    var todayB = all.filter(function (b) { return b.date === t; });
    var monthB = all.filter(function (b) { return b.date >= ms; });
    var open = all.filter(function (b) { return b.rem > 0.005; }), openTot = open.reduce(function (s, b) { return s + b.rem; }, 0);
    var uninv = (typeof issUninvoicedCount === 'function') ? issUninvoicedCount() : 0;
    var C = A('customers').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
    var P = A('products');
    var fOpen = !!f._open;

    root.innerHTML = '<div class="isl-page">' +
      '<div class="isl-head">' +
        '<div><h2 class="page-title">صرف الورق</h2><p class="page-subtitle">كل عملية بتتخصم من المخزن وبتتضاف على حساب المركز</p></div>' +
        '<div class="isl-head-a">' +
          '<button class="btn btn-secondary" onclick="openInvoiceFromIssuances()">فاتورة من الصرف' + (uninv ? ' <span class="iss-uninv-badge">' + uninv + '</span>' : '') + '</button>' +
          '<button class="btn btn-secondary isl-xls" onclick="exportCSV(\'issuances\')"><span>تصدير </span>Excel</button>' +
          '<button class="btn btn-primary" onclick="openIssuanceForm()">' + IC.plus + ' صرف جديد</button>' +
        '</div>' +
      '</div>' +

      '<div class="isl-sum">' +
        '<div><span>النهارده</span><b>' + money(todayB.reduce(function (s, b) { return s + b.total; }, 0)) + '</b><small>' + ops(todayB.length) + '</small></div>' +
        '<div><span>الشهر ده</span><b>' + money(monthB.reduce(function (s, b) { return s + b.total; }, 0)) + '</b><small>' + ops(monthB.length) + '</small></div>' +
        '<div class="' + (openTot > 0.5 ? 'warn' : '') + '"><span>باقي على المراكز</span><b>' + money(openTot) + '</b><small>' + ops(open.length) + '</small></div>' +
      '</div>' +

      '<div class="isl-tools">' +
        '<label class="isl-search">' + IC.search + '<input type="search" id="iss-search" placeholder="دوّر بالمركز أو الصنف أو الرقم" value="' + esc(f.search) + '" autocomplete="off"></label>' +
        '<button type="button" class="isl-ftoggle' + (fOpen ? ' on' : '') + '" onclick="AXIss.toggleF()" aria-expanded="' + fOpen + '">' + IC.filter + '<span>فلترة</span><em id="isx-fcount" hidden></em></button>' +
      '</div>' +
      '<div class="isl-filters" id="isx-filters"' + (fOpen ? '' : ' hidden') + '>' +
        '<div class="isl-seg" role="group" aria-label="التقسيم"><span>اعرض</span>' +
          '<button type="button" class="' + (f.group === 'day' ? 'on' : '') + '" onclick="AXIss.group(\'day\')">بالأيام</button>' +
          '<button type="button" class="' + (f.group === 'center' ? 'on' : '') + '" onclick="AXIss.group(\'center\')">بالمراكز</button>' +
        '</div>' +
        '<select class="form-control" id="iss-customer"><option value="">كل المراكز</option>' + C.map(function (c) { return '<option value="' + c.id + '"' + (f.customerId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' +
        '<select class="form-control" id="iss-product"><option value="">كل الأصناف</option>' + P.map(function (p) { return '<option value="' + p.id + '"' + (f.productId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
        '<label class="isl-date"><span>من</span><input class="form-control" type="date" id="iss-from" value="' + esc(f.from) + '"></label>' +
        '<label class="isl-date"><span>لحد</span><input class="form-control" type="date" id="iss-to" value="' + esc(f.to) + '"></label>' +
        '<button type="button" class="isl-reset" onclick="AXIss.reset()">امسح الفلاتر</button>' +
      '</div>' +
      '<div class="isl-chips" id="isx-chips" role="group" aria-label="الحالة"></div>' +

      '<div id="isx-list"></div></div>';

    var to;
    var s = document.getElementById('iss-search');
    s.addEventListener('input', function (e) { F().search = e.target.value; F().limit = PAGE; clearTimeout(to); to = setTimeout(drawList, 160); });
    [['iss-customer', 'customerId'], ['iss-product', 'productId'], ['iss-from', 'from'], ['iss-to', 'to']].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.addEventListener('change', function (e) { F()[p[1]] = e.target.value; F().limit = PAGE; drawList(); });
    });
    drawList();
  }

  /* ── the صرف sheet: everything about one operation, and every action ── */
  function open(key) {
    var b = batches().find(function (x) { return x.key === key; }); if (!b) return;
    var t = tone(b), multi = b.items.length > 1, first = b.items[0];
    var pct = b.total > 0 ? Math.min(100, Math.round(b.paid / b.total * 100)) : 100;
    var due = '';
    if (b.rem > 0.005 && b.due) {
      var d = daysBetween(today(), b.due);
      due = d < 0 ? 'ميعاد التحصيل عدّى من ' + (-d) + ' يوم (' + shortDate(b.due) + ')' : d === 0 ? 'ميعاد التحصيل النهارده' : d === 1 ? 'ميعاد التحصيل بكرة' : 'ميعاد التحصيل ' + shortDate(b.due) + ' — بعد ' + d + ' يوم';
    }
    var html = '<div class="isl-sheet t-' + t + '">' +
      '<div class="isl-sh-top"><div><b>' + esc(b.customerName) + '</b><span>' + dayLabel(b.date) + ' · صرف #' + esc(b.number) + '</span></div>' +
        '<em class="isl-sh-st">' + (b.status === 'paid' ? 'مدفوع' : b.late ? 'متأخر' : b.status === 'partial' ? 'مدفوع جزئي' : 'لسه مدفعش') + '</em></div>' +
      '<div class="isl-sh-money"><div><span>الإجمالي</span><b>' + money(b.total) + '</b></div><div><span>اتدفع</span><b>' + money(b.paid) + '</b></div><div class="rem"><span>الباقي</span><b>' + money(b.rem) + '</b></div></div>' +
      '<div class="isl-sh-bar"><i style="width:' + pct + '%"></i></div>' +
      (due ? '<p class="isl-sh-due">' + due + '</p>' : '') +
      '<ul class="isl-sh-items">' + b.items.map(function (i) {
        var u = unitOf(i);
        return '<li><div><b>' + esc(i.productName || 'صنف') + '</b><span>' + num(i.quantity) + (u ? ' ' + esc(u) : '') + ' × ' + money(i.unitPrice) + '</span></div><strong>' + money(i.total) + '</strong>' +
          (multi && (canEdit() || canDelete()) ? '<div class="isl-sh-ia">' +
            (canEdit() ? '<button type="button" onclick="closeModal();editIssuance(\'' + i.id + '\')" title="تعديل الصنف ده" aria-label="تعديل">' + IC.edit + '</button>' : '') +
            (canDelete() ? '<button type="button" class="del" onclick="closeModal();deleteIssuance(\'' + i.id + '\')" title="حذف الصنف ده" aria-label="حذف">' + IC.del + '</button>' : '') + '</div>' : '') +
          '</li>';
      }).join('') + '</ul>' +
      (b.notes ? '<p class="isl-sh-note">' + esc(b.notes) + '</p>' : '') +
      '<div class="isl-sh-acts">' +
        (b.rem > 0.005 ? '<button type="button" class="pri" onclick="closeModal();openPaymentForm(\'' + b.customerId + '\')">تحصيل</button>' : '') +
        '<button type="button" onclick="closeModal();printIssuance(\'' + first.id + '\')">طباعة الإيصال</button>' +
        (!multi && canEdit() ? '<button type="button" onclick="closeModal();editIssuance(\'' + first.id + '\')">تعديل</button>' : '') +
        (!multi && canDelete() ? '<button type="button" class="del" onclick="closeModal();deleteIssuance(\'' + first.id + '\')">حذف</button>' : '') +
      '</div>' +
    '</div>';
    openModal('عملية صرف', html);
  }

  window.renderIssuances = renderIssuances;
  window.AXIss = {
    batches: batches, draw: drawList, open: open, batch: open,
    status: function (s) { F().status = s; F().limit = PAGE; drawList(); },
    group: function (g) { F().group = g; F().limit = PAGE; drawList(); document.querySelectorAll('.isl-seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('onclick').indexOf("'" + g + "'") > 0); }); },
    more: function () { F().limit += PAGE; drawList(); },
    toggleF: function () {
      var f = F(); f._open = !f._open;
      var p = document.getElementById('isx-filters'), b = document.querySelector('.isl-ftoggle');
      if (p) p.hidden = !f._open;
      if (b) { b.classList.toggle('on', f._open); b.setAttribute('aria-expanded', f._open); }
    },
    reset: function () {
      var o = F()._open;
      window.issuanceFilters = { search: '', from: '', to: '', customerId: '', productId: '', status: '', group: 'day', limit: PAGE, _open: o };
      try { issuanceFilters = window.issuanceFilters; } catch (e) {}
      renderIssuances();
    }
  };
})();

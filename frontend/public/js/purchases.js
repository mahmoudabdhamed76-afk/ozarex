/* ════════════════════════════════════════════════════════════════════
   ERP · فواتير المشتريات (4.12)
   ------------------------------------------------------------------
   صفحة مستقلة لكل فواتير الشراء (expenses kind:'purchase'):
   · من/إلى + اختصارات (اليوم · الشهر · 3 شهور · السنة · الكل) + بحث
     برقم الفاتورة أو المورد أو الصنف
   · عدد الفواتير · الإجمالي · المدفوع · المستحق للموردين
   · المدفوع لكل فاتورة: الكاش/التحويل/الشيك مدفوعة كاملة، والآجل
     بيتوزع عليه اللي اتدفع للمورد من الأقدم للأحدث (بعد الرصيد
     الافتتاحي) — نفس رصيد المورد في «الموردين» بالظبط
   · جدول على الكمبيوتر، كروت على الموبايل
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { range: '', from: '', to: '', q: '' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n, dec) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(Number(n || 0)); } catch (e) {} return num(n, 1); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function ds(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function norm(s) { return (typeof normalizeArabic === 'function') ? normalizeArabic(s) : String(s || '').toLowerCase(); }
  function canGo(p) { try { return typeof can !== 'function' || can(p); } catch (e) { return true; } }

  function purchases() { return A('expenses').filter(function (e) { return e.kind === 'purchase'; }); }

  /* paid per purchase — same arithmetic as supplierMetrics(): opening balance first, then oldest invoice first */
  function paidMap() {
    var map = {}, auto = {}, bySup = {};
    var all = purchases();
    all.forEach(function (p) { if (p.autoPaymentId) auto[p.autoPaymentId] = p.id; });
    all.forEach(function (p) { (bySup[p.supplierId || '_'] = bySup[p.supplierId || '_'] || []).push(p); });
    var pool = {};
    A('supplierPayments').forEach(function (sp) {
      if (auto[sp.id]) return;
      pool[sp.supplierId || '_'] = (pool[sp.supplierId || '_'] || 0) + (Number(sp.amount) || 0);
    });
    Object.keys(bySup).forEach(function (sid) {
      var sup = A('suppliers').find(function (s) { return s.id === sid; });
      var left = (pool[sid] || 0) - Math.max(0, sup ? Number(sup.openingBalance) || 0 : 0);
      bySup[sid].slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0); })
        .forEach(function (p) {
          var amt = Number(p.amount) || 0;
          if (p.paymentMethod && p.paymentMethod !== 'credit') { map[p.id] = amt; return; }
          var take = Math.max(0, Math.min(left, amt)); map[p.id] = take; left -= take;
        });
    });
    return map;
  }
  function stateOf(p, paid) {
    var amt = Number(p.amount) || 0, rem = Math.max(0, amt - paid);
    if (rem <= 0.009) return { k: 'paid', l: 'مدفوعة' };
    if (p.dueDate && p.dueDate < today()) return { k: 'late', l: 'متأخرة' };
    if (paid > 0.009) return { k: 'part', l: 'مدفوعة جزئياً' };
    return { k: 'open', l: 'آجل' };
  }
  function rows() {
    var pm = paidMap(), list = purchases().map(function (p) {
      var paid = pm[p.id] || 0, amt = Number(p.amount) || 0;
      return { p: p, paid: paid, rem: Math.max(0, amt - paid), amt: amt, st: stateOf(p, paid) };
    });
    if (ui.from) list = list.filter(function (r) { return (r.p.date || '') >= ui.from; });
    if (ui.to) list = list.filter(function (r) { return (r.p.date || '') <= ui.to; });
    var q = ui.q.trim();
    if (q) {
      var nq = norm(q);
      list = list.filter(function (r) {
        var p = r.p;
        if (String(p.number || '').indexOf(q) >= 0 || String(p.reference || '').indexOf(q) >= 0) return true;
        if (norm(p.supplierName).indexOf(nq) >= 0 || norm(p.description).indexOf(nq) >= 0) return true;
        return (p.items || []).some(function (it) { return norm(it.name || it.productName).indexOf(nq) >= 0; });
      });
    }
    return list.sort(function (a, b) { return (b.p.date || '').localeCompare(a.p.date || '') || (b.p.createdAt || 0) - (a.p.createdAt || 0); });
  }

  function setRange(k) {
    var t = pd(today()), from = '';
    if (k === 'today') from = today();
    else if (k === 'month') from = today().slice(0, 8) + '01';
    else if (k === '3m') { var d = new Date(t); d.setMonth(d.getMonth() - 3); d.setDate(d.getDate() + 1); from = ds(d); }
    else if (k === 'year') from = today().slice(0, 4) + '-01-01';
    ui.range = k; ui.from = from; ui.to = k === 'all' ? '' : today();
    ls('ax_pur_range', k);
    draw();
  }
  function itemsCell(p) {
    var n = (p.items || []).length;
    if (!n) return '<span class="pi-desc">' + esc(p.description || 'إدخال يدوي') + '</span>';
    var first = p.items[0].name || p.items[0].productName || '';
    return '<b>' + n + '</b> <span class="pi-desc">' + esc(first) + (n > 1 ? ' +' + (n - 1) : '') + '</span>';
  }
  function draw() {
    var root = document.getElementById('pi-root'); if (!root) return;
    var list = rows();
    var tot = list.reduce(function (s, r) { return s + r.amt; }, 0), paid = list.reduce(function (s, r) { return s + Math.min(r.paid, r.amt); }, 0);
    var due = list.reduce(function (s, r) { return s + r.rem; }, 0);
    var chips = [['today', 'اليوم'], ['month', 'الشهر'], ['3m', '3 شهور'], ['year', 'السنة'], ['all', 'الكل']];
    var canAdd = canGo('suppliers') || canGo('purchases');

    root.innerHTML =
      '<div class="page-header pi-head"><div><h2 class="page-title">فواتير المشتريات</h2>' +
        '<p class="page-subtitle">كل فواتير الشراء من الموردين — المدفوع والمتبقي على كل فاتورة</p></div>' +
        (canAdd ? '<button type="button" class="btn btn-primary pi-add" onclick="AXPur.add()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>فاتورة شراء</button>' : '') +
      '</div>' +
      '<div class="pi-filters">' +
        '<div class="pi-dates"><label><span>من</span><input type="date" class="form-control" id="pi-from" value="' + esc(ui.from) + '"></label>' +
        '<label><span>إلى</span><input type="date" class="form-control" id="pi-to" value="' + esc(ui.to) + '"></label></div>' +
        '<div class="pi-chips" role="group" aria-label="الفترة">' + chips.map(function (c) { return '<button type="button" class="' + (ui.range === c[0] ? 'on' : '') + '" onclick="AXPur.range(\'' + c[0] + '\')">' + c[1] + '</button>'; }).join('') + '</div>' +
        '<input type="search" class="form-control pi-q" id="pi-q" placeholder="رقم / مورد / صنف" value="' + esc(ui.q) + '">' +
      '</div>' +
      '<div class="pi-kpis">' +
        '<div class="pi-k"><span>عدد الفواتير</span><b>' + num(list.length) + '</b></div>' +
        '<div class="pi-k"><span>الإجمالي</span><b>' + money(tot) + '</b></div>' +
        '<div class="pi-k t-ok"><span>المدفوع</span><b>' + money(paid) + '</b></div>' +
        '<div class="pi-k t-bad"><span>المستحق للموردين</span><b>' + money(due) + '</b></div>' +
      '</div>' +
      (list.length ?
        '<div class="table-wrap pi-table"><div class="table-scroll"><table class="data-table"><thead><tr>' +
          '<th>رقم</th><th>التاريخ</th><th>المورد</th><th>فاتورة المورد</th><th>البنود</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th>' +
        '</tr></thead><tbody>' + list.map(function (r) {
          var p = r.p;
          return '<tr class="pi-row" tabindex="0" onclick="AXPur.view(\'' + p.id + '\')" onkeydown="if(event.key===\'Enter\')AXPur.view(\'' + p.id + '\')">' +
            '<td><b>#' + esc(p.number || '-') + '</b>' + (p.attachment && p.attachment.data ? ' <span title="فيه مرفق">📎</span>' : '') + '</td>' +
            '<td>' + esc(p.date || '') + '</td><td><b>' + esc(p.supplierName || '-') + '</b></td>' +
            '<td>' + esc(p.reference || '—') + '</td><td>' + itemsCell(p) + '</td>' +
            '<td class="pi-n">' + num(r.amt, 1) + '</td><td class="pi-n t-ok">' + num(r.paid, 1) + '</td>' +
            '<td class="pi-n ' + (r.rem > 0.009 ? 't-bad' : '') + '">' + num(r.rem, 1) + '</td>' +
            '<td><span class="pi-st s-' + r.st.k + '">' + r.st.l + '</span></td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<div class="pi-cards">' + list.map(function (r) {
          var p = r.p, pct = r.amt ? Math.round(Math.min(r.paid, r.amt) / r.amt * 100) : 0;
          return '<button type="button" class="pi-card" onclick="AXPur.view(\'' + p.id + '\')">' +
            '<div class="pi-c1"><b>' + esc(p.supplierName || '-') + '</b><span class="pi-st s-' + r.st.k + '">' + r.st.l + '</span></div>' +
            '<div class="pi-c2"><span>#' + esc(p.number || '-') + ' · ' + esc(p.date || '') + (p.reference ? ' · مورد: ' + esc(p.reference) : '') + '</span><span>' + itemsCell(p) + '</span></div>' +
            '<div class="pi-c3"><div><em>الإجمالي</em><b>' + num(r.amt) + '</b></div><div><em>المدفوع</em><b class="t-ok">' + num(r.paid) + '</b></div><div><em>المتبقي</em><b class="' + (r.rem > 0.009 ? 't-bad' : '') + '">' + num(r.rem) + '</b></div></div>' +
            '<div class="pi-bar"><i style="width:' + pct + '%"></i></div></button>';
        }).join('') + '</div>'
        : '<div class="pi-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg><b>مفيش فواتير شراء ' + (ui.range === 'all' && !ui.q ? 'لسه' : 'في الفترة دي') + '</b>' +
          (ui.range !== 'all' || ui.q ? '<button type="button" class="btn btn-secondary" onclick="AXPur.range(\'all\')">اعرض الكل</button>' : (canAdd ? '<button type="button" class="btn btn-primary" onclick="AXPur.add()">سجّل أول فاتورة شراء</button>' : '')) + '</div>');

    var f = document.getElementById('pi-from'), t = document.getElementById('pi-to'), q = document.getElementById('pi-q');
    if (f) f.addEventListener('change', function () { ui.from = f.value; ui.range = ''; draw(); });
    if (t) t.addEventListener('change', function () { ui.to = t.value; ui.range = ''; draw(); });
    if (q) q.addEventListener('input', function () {
      ui.q = q.value; var pos = q.selectionStart; draw();
      var q2 = document.getElementById('pi-q'); if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }
    });
  }

  function view(pid) {
    var r = rows().find(function (x) { return x.p.id === pid; }) || null;
    if (!r) { var pm = paidMap(), p0 = purchases().find(function (x) { return x.id === pid; }); if (!p0) return; var pa = pm[p0.id] || 0; r = { p: p0, paid: pa, amt: Number(p0.amount) || 0, rem: Math.max(0, (Number(p0.amount) || 0) - pa), st: stateOf(p0, pa) }; }
    var p = r.p, items = p.items || [];
    var method = (typeof PURCHASE_PAYMENT_METHODS !== 'undefined' ? (PURCHASE_PAYMENT_METHODS.find(function (m) { return m.v === p.paymentMethod; }) || {}).l : '') || p.paymentMethod || '';
    var body = '<div class="pi-view">' +
      '<div class="pi-vh"><div><b>' + esc(p.supplierName || '-') + '</b><span>#' + esc(p.number || '-') + ' · ' + esc(p.date || '') + (p.reference ? ' · فاتورة المورد ' + esc(p.reference) : '') + '</span></div><span class="pi-st s-' + r.st.k + '">' + r.st.l + '</span></div>' +
      '<div class="pi-vk"><div><em>الإجمالي</em><b>' + money(r.amt) + '</b></div><div><em>المدفوع</em><b class="t-ok">' + money(r.paid) + '</b></div><div><em>المتبقي</em><b class="' + (r.rem > 0.009 ? 't-bad' : '') + '">' + money(r.rem) + '</b></div></div>' +
      '<div class="pi-vm"><span>طريقة الدفع: <b>' + esc(method) + '</b></span>' + (p.dueDate ? '<span>الاستحقاق: <b>' + esc(p.dueDate) + '</b></span>' : '') + (p.description ? '<span>' + esc(p.description) + '</span>' : '') + '</div>' +
      (items.length ? '<table class="data-table pi-vt"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>' +
        items.map(function (it) { var q = Number(it.qty != null ? it.qty : it.quantity) || 0, pr = Number(it.price) || 0; return '<tr><td>' + esc(it.name || it.productName || '') + '</td><td>' + num(q, q % 1 !== 0) + ' ' + esc(it.unit || '') + '</td><td>' + num(pr, 1) + '</td><td><b>' + num(it.total != null ? it.total : q * pr, 1) + '</b></td></tr>'; }).join('') + '</tbody></table>' : '') +
      (p.notes ? '<p class="pi-notes">' + esc(p.notes) + '</p>' : '') + '</div>';
    var att = p.attachment && p.attachment.data;
    window._piAtt = att ? p.attachment : null;
    var foot = '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>' +
      (att ? '<button class="btn btn-secondary" onclick="if(window._piAtt)openAttachmentLightbox(_piAtt.name||\'\',_piAtt.data,_piAtt.type||\'\')">📎 المرفق</button>' : '') +
      (r.rem > 0.009 && p.supplierId && typeof openSupplierPaymentForm === 'function' ? '<button class="btn btn-secondary" onclick="closeModal();openSupplierPaymentForm(\'\',\'' + p.supplierId + '\')">سداد للمورد</button>' : '') +
      (typeof deletePurchase === 'function' ? '<button class="btn btn-ghost" style="color:var(--danger)" onclick="closeModal();deletePurchase(\'' + p.id + '\')">حذف</button>' : '') +
      (typeof openPurchaseForm === 'function' ? '<button class="btn btn-primary" onclick="closeModal();openPurchaseForm(\'' + p.id + '\')">تعديل</button>' : '');
    openModal('فاتورة شراء #' + esc(p.number || ''), body, foot, 'large');
  }

  window.renderPurchaseInvoices = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    if (!ui.range && !ui.from && !ui.to) { var k = ls('ax_pur_range') || 'month'; root.innerHTML = '<div class="pi" id="pi-root"></div>'; setRange(k); return; }
    root.innerHTML = '<div class="pi" id="pi-root"></div>';
    draw();
  };

  /* the purchase form & delete re-render «الموردين» when done → stay on this page if we came from it */
  var _rsup = window.renderSuppliers;
  if (typeof _rsup === 'function' && !_rsup._pi) {
    var w = function () {
      if (typeof currentPage !== 'undefined' && currentPage === 'purchases') return window.renderPurchaseInvoices();
      return _rsup.apply(this, arguments);
    };
    w._pi = 1; window.renderSuppliers = w;
  }

  window.AXPur = {
    render: window.renderPurchaseInvoices, range: setRange, view: view, paidMap: paidMap, rows: rows,
    add: function () { if (typeof openPurchaseForm === 'function') openPurchaseForm(); }
  };
})();

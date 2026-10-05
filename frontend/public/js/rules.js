/* ════════════════════════════════════════════════════════════════════
   ERP · قواعد البيع والتنبيهات (4.12)
   ------------------------------------------------------------------
   · كارت في «الإعدادات»: عميل متأخر بعد كام يوم بلا سداد، صنف راكد بعد
     كام يوم بلا بيع، تحذير الصلاحية قبل كام يوم، وإلزام اختيار العميل
     قبل ما تبدأ فاتورة البيع.
   · الحسابات المشتركة اللي الإشعارات والموبايل بيستخدموها:
     lateCustomers() · staleItems() · expiringItems()
   · بوابة «العميل الأول»: في فاتورة البيع وصرف الورق، الأصناف والمبالغ
     بتفضل مقفولة لحد ما تختار العميل (لو القاعدة شغالة).
   Stored in settings: overdueDays, staleDays, expiryWarnDays, requireCustomerFirst
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var DEF = { overdueDays: 30, staleDays: 60, expiryWarnDays: 60, requireCustomerFirst: true, creditBlock: true, blockOverdueDays: 60, minMargin: 5 };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function diff(a, b) { if (!a || !b) return 0; return Math.round((pd(b) - pd(a)) / 86400000); }   // days from a to b
  function int(v, d) { var n = parseInt(v, 10); return n > 0 && n < 3650 ? n : d; }

  function get() {
    var s = S();
    return {
      overdueDays: int(s.overdueDays, DEF.overdueDays),
      staleDays: int(s.staleDays, DEF.staleDays),
      expiryWarnDays: int(s.expiryWarnDays, DEF.expiryWarnDays),
      requireCustomerFirst: s.requireCustomerFirst !== false,
      creditBlock: s.creditBlock !== false,
      blockOverdueDays: int(s.blockOverdueDays, DEF.blockOverdueDays),
      minMargin: (s.minMargin === 0 || (Number(s.minMargin) > 0 && Number(s.minMargin) < 90)) ? Number(s.minMargin) : DEF.minMargin
    };
  }

  /* ── customers who owe money and haven't paid for N days ── */
  function lastPayMap() {
    var m = {};
    A('payments').forEach(function (p) {
      if (!p.customerId || !(Number(p.amount) > 0) || !p.date) return;
      if (!m[p.customerId] || p.date > m[p.customerId]) m[p.customerId] = p.date;
    });
    return m;
  }
  function oldestOpenMap() {   // oldest unpaid document per customer
    var m = {};
    function put(cid, d) { if (cid && d && (!m[cid] || d < m[cid])) m[cid] = d; }
    A('issuances').forEach(function (i) { if ((Number(i.total) || 0) - (Number(i.paid) || 0) > 0.01) put(i.customerId, i.date); });
    A('invoices').forEach(function (v) { if (!v.sourceIssuanceId && (Number(v.total) || 0) - (Number(v.paid) || 0) > 0.01) put(v.customerId, v.date); });
    return m;
  }
  function lateCustomers() {
    var r = get(), t = today(), lp = lastPayMap(), oo = oldestOpenMap(), out = [];
    A('customers').forEach(function (c) {
      var bal = Number(c.balance) || 0; if (bal <= 0.5) return;
      var ref = lp[c.id] || oo[c.id] || (c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '');
      if (!ref) return;
      var days = diff(ref, t);
      if (days >= r.overdueDays) out.push({ c: c, days: days, lastPay: lp[c.id] || '', since: ref, balance: bal });
    });
    return out.sort(function (a, b) { return b.balance - a.balance; });
  }

  /* ── items in stock that haven't sold for N days ── */
  function lastSaleMap() {
    var m = {};
    function put(pid, d) { if (pid && d && (!m[pid] || d > m[pid])) m[pid] = d; }
    A('issuances').forEach(function (i) { put(i.productId, i.date); });
    A('invoices').forEach(function (v) { (v.items || []).forEach(function (it) { put(it.productId, v.date); }); });
    A('stockMoves').forEach(function (s) { if (s.type === 'out') put(s.productId, s.date); });
    return m;
  }
  function firstInMap() {
    var m = {};
    A('stockMoves').forEach(function (s) { if (s.type === 'in' && s.productId && s.date && (!m[s.productId] || s.date < m[s.productId])) m[s.productId] = s.date; });
    return m;
  }
  function staleItems() {
    var r = get(), t = today(), ls = lastSaleMap(), fi = firstInMap(), out = [];
    A('products').forEach(function (p) {
      var q = Number(p.quantity) || 0; if (q <= 0) return;
      var ref = ls[p.id] || fi[p.id] || ''; if (!ref) return;
      var days = diff(ref, t);
      if (days >= r.staleDays) out.push({ p: p, days: days, lastSale: ls[p.id] || '', never: !ls[p.id], value: q * (Number(p.cost) || Number(p.price) || 0) });
    });
    return out.sort(function (a, b) { return b.value - a.value; });
  }

  /* ── items whose expiry date is near (or passed) ── */
  function expiringItems() {
    var r = get(), t = today(), out = [];
    A('products').forEach(function (p) {
      if (!p.expiryDate || !((Number(p.quantity) || 0) > 0)) return;
      var left = diff(t, p.expiryDate);
      if (left <= r.expiryWarnDays) out.push({ p: p, left: left, expired: left < 0 });
    });
    return out.sort(function (a, b) { return a.left - b.left; });
  }

  /* ════════ settings card ════════ */
  function cardHtml() {
    var r = get();
    function field(id, label, val, hint) {
      return '<label class="axr-f" for="' + id + '"><span>' + label + '</span>' +
        '<input class="form-control" type="number" inputmode="numeric" min="1" max="3650" step="1" id="' + id + '" value="' + val + '" oninput="AXRules.preview()">' +
        '<em>' + hint + '</em></label>';
    }
    return '<div class="card axr-card" id="axr-card">' +
      '<div class="card-header"><h3 class="card-title">قواعد البيع والتنبيهات</h3></div>' +
      '<div class="axr-body">' +
        '<p class="axr-lead">الأرقام دي بتحدد إمتى البرنامج ينبّهك — في الإشعارات والرئيسية والمساعد.</p>' +
        '<div class="axr-grid">' +
          field('axr-overdue', 'عميل متأخر بعد (يوم بلا سداد)', r.overdueDays, 'عليه فلوس ومدفعش من المدة دي') +
          field('axr-stale', 'صنف راكد بعد (يوم بلا بيع)', r.staleDays, 'موجود في المخزن ومحدش سحبه') +
          field('axr-expiry', 'تحذير الصلاحية قبل (يوم)', r.expiryWarnDays, 'للأصناف اللي ليها تاريخ صلاحية') +
        '</div>' +
        '<label class="axr-check"><input type="checkbox" id="axr-cust"' + (r.requireCustomerFirst ? ' checked' : '') + '>' +
          '<span><b>إلزام اختيار العميل قبل بدء فاتورة البيع</b><em>الأصناف والمبالغ تفضل مقفولة لحد ما تختار العميل — في الفاتورة وصرف الورق</em></span></label>' +
        '<div class="axr-grid" style="margin-top:14px">' +
          field('axr-block', 'وقف الصرف لو عليه متأخرات أكتر من (يوم)', r.blockOverdueDays, 'أقدم فلوس عليه لسه متدفعتش') +
          '<label class="axr-f" for="axr-margin"><span>أقل هامش ربح مقبول (%)</span><input class="form-control" type="number" inputmode="decimal" min="0" max="89" step="0.5" id="axr-margin" value="' + r.minMargin + '"><em>تحته يجيلك تنبيه إن سعر المركز محتاج يتعدّل</em></label>' +
        '</div>' +
        '<label class="axr-check"><input type="checkbox" id="axr-credit"' + (r.creditBlock ? ' checked' : '') + '>' +
          '<span><b>وقف الصرف لو المركز عدّى حد الائتمان أو عليه متأخرات</b><em>المدير يكمّل بتأكيد، والموظف يبعت طلب استثناء للمدير في «الطلبات والمقترحات»</em></span></label>' +
        '<div class="axr-foot"><span id="axr-preview" aria-live="polite"></span>' +
          '<button type="button" class="btn btn-primary" onclick="AXRules.save()">حفظ القواعد</button></div>' +
      '</div></div>';
  }
  function preview() {
    var el = document.getElementById('axr-preview'); if (!el) return;
    var s = S(), keep = { o: s.overdueDays, st: s.staleDays, e: s.expiryWarnDays };
    s.overdueDays = int((document.getElementById('axr-overdue') || {}).value, DEF.overdueDays);
    s.staleDays = int((document.getElementById('axr-stale') || {}).value, DEF.staleDays);
    s.expiryWarnDays = int((document.getElementById('axr-expiry') || {}).value, DEF.expiryWarnDays);
    var a = lateCustomers().length, b = staleItems().length, c = expiringItems().length;
    s.overdueDays = keep.o; s.staleDays = keep.st; s.expiryWarnDays = keep.e;
    if (keep.o === undefined) delete s.overdueDays;
    if (keep.st === undefined) delete s.staleDays;
    if (keep.e === undefined) delete s.expiryWarnDays;
    el.innerHTML = 'بالأرقام دي: <b>' + a + '</b> عميل متأخر · <b>' + b + '</b> صنف راكد · <b>' + c + '</b> صنف صلاحيته قرّبت';
  }
  function save() {
    var s = S();
    s.overdueDays = int((document.getElementById('axr-overdue') || {}).value, DEF.overdueDays);
    s.staleDays = int((document.getElementById('axr-stale') || {}).value, DEF.staleDays);
    s.expiryWarnDays = int((document.getElementById('axr-expiry') || {}).value, DEF.expiryWarnDays);
    s.requireCustomerFirst = !!(document.getElementById('axr-cust') || {}).checked;
    s.creditBlock = !!(document.getElementById('axr-credit') || {}).checked;
    s.blockOverdueDays = int((document.getElementById('axr-block') || {}).value, DEF.blockOverdueDays);
    var mm = parseFloat((document.getElementById('axr-margin') || {}).value); s.minMargin = mm >= 0 && mm < 90 ? mm : DEF.minMargin;
    DB.save();
    T('اتحفظت قواعد البيع والتنبيهات');
    try { if (typeof updateNotifBadge === 'function') updateNotifBadge(); } catch (e) {}
    ['axr-overdue', 'axr-stale', 'axr-expiry'].forEach(function (k, i) { var el = document.getElementById(k); if (el) el.value = [s.overdueDays, s.staleDays, s.expiryWarnDays][i]; });
    preview();
  }
  function mountCard() {
    var root = document.getElementById('page-content'); if (!root || document.getElementById('axr-card')) return;
    var form = root.querySelector('#settings-form'), first = (form && form.closest('.card')) || root.querySelector('.card'); if (!first) return;
    first.insertAdjacentHTML('afterend', cardHtml());
    preview();
  }
  var _rs = window.renderSettings;
  if (typeof _rs === 'function' && !_rs._axr) {
    var ws = function () { var r = _rs.apply(this, arguments); try { mountCard(); } catch (e) { console.warn('[rules]', e); } return r; };
    ws._axr = 1; window.renderSettings = ws;
  }

  /* ════════ «العميل الأول» gate ════════ */
  function lockForm(form, custSel, keep) {
    if (!form || !custSel || !get().requireCustomerFirst || custSel.value) return;
    var ctrls = Array.prototype.slice.call(form.querySelectorAll('input, select, textarea, button'));
    var foot = document.querySelector('#modal .modal-footer .btn-primary');
    if (foot) ctrls.push(foot);
    ctrls.forEach(function (el) {
      if (el === custSel || el.disabled || (keep && keep(el))) return;
      el.disabled = true; el.setAttribute('data-axr', '1');
    });
    form.classList.add('axr-wait');
    var row = custSel.closest('.form-row') || custSel.closest('.form-group');
    if (row && !form.querySelector('.axr-gate')) {
      row.insertAdjacentHTML('afterend', '<div class="axr-gate" role="status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>اختار العميل الأول — بعدها الأصناف والمبالغ تتفتح</span></div>');
    }
    var open = function () { unlock(form, custSel); };
    custSel.addEventListener('change', open);
    custSel.addEventListener('input', open);
  }
  function unlock(form, custSel) {
    if (!form || (custSel && !custSel.value)) return;
    var nodes = document.querySelectorAll('[data-axr="1"]');
    Array.prototype.forEach.call(nodes, function (el) { el.disabled = false; el.removeAttribute('data-axr'); });
    form.classList.remove('axr-wait');
    var g = form.querySelector('.axr-gate'); if (g) g.remove();
  }
  function keepDate(el) { return el.name === 'date' || el.classList.contains('voice-mic-btn') || el.id === 'iss-customer-mic'; }

  var _oni = window.openNewInvoice;
  if (typeof _oni === 'function' && !_oni._axr) {
    var wi = function () {
      var r = _oni.apply(this, arguments);
      try { var f = document.getElementById('invoice-form'); if (f) lockForm(f, f.querySelector('[name="customerId"]'), keepDate); } catch (e) { console.warn('[rules]', e); }
      return r;
    };
    wi._axr = 1; window.openNewInvoice = wi;
  }
  var _oif = window.openIssuanceForm;
  if (typeof _oif === 'function' && !_oif._axr) {
    var wf = function () {
      var r = _oif.apply(this, arguments);
      try { var f = document.getElementById('iss-form'); if (f) lockForm(f, document.getElementById('iss-form-customer'), keepDate); } catch (e) { console.warn('[rules]', e); }
      return r;
    };
    wf._axr = 1; window.openIssuanceForm = wf;
  }
  /* the voice picker sets the customer without a change event */
  var _occ = window.onIssuanceCustomerChange;
  if (typeof _occ === 'function' && !_occ._axr) {
    var wc = function () {
      var r = _occ.apply(this, arguments);
      try { unlock(document.getElementById('iss-form'), document.getElementById('iss-form-customer')); } catch (e) {}
      return r;
    };
    wc._axr = 1; window.onIssuanceCustomerChange = wc;
  }

  window.AXRules = {
    get: get, save: save, preview: preview, mountCard: mountCard,
    lateCustomers: lateCustomers, staleItems: staleItems, expiringItems: expiringItems,
    lastSaleMap: lastSaleMap, diff: diff, pd: pd, DEF: DEF
  };
})();

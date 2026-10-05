/* ════════════════════════════════════════════════════════════════════
   ERP · business rules
   1) صرف الورق منفصل عن الفواتير
      · the issuance form has «إصدار فاتورة مع الصرف» (off by default, 0% tax)
      · «فاتورة من الصرف»: turn un-invoiced issuances into one invoice later
      · deleting an invoice that came from issuances only unlinks it
        (the issuance, stock and the center's balance stay as they are)
      · old merged issuance invoices get sourceIssuanceId (no double sales)
   2) أسعار المراكز في الفواتير
      · a center's special prices fill invoice lines automatically
      · center form: copy prices from another center / fill by discount %
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function fm(n) { return (typeof fmtCurrency === 'function') ? fmtCurrency(n) : Number(n || 0).toLocaleString('en-US'); }
  function nm(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function saveNoGuard() { window.__axNoGuard = true; try { DB.save(); } finally { window.__axNoGuard = false; } }

  /* ─────────── 1 · issuance ↔ invoice ─────────── */
  window.onIssMakeInvoiceChange = function (on) {
    var b = document.getElementById('iss-save-btn'), h = document.getElementById('iss-inv-hint');
    if (b) b.textContent = on ? '💾 حفظ الصرف وإصدار الفاتورة' : '💾 حفظ الصرف';
    if (h) h.textContent = on ? 'هتتعمل فاتورة بالأصناف دي بضريبة 0% ومربوطة بالصرف.'
      : 'مقفول: الصرف يتسجل على حساب المركز من غير فاتورة — وتقدر تعمل له فاتورة بعدين من «فاتورة من الصرف».';
    var t = document.querySelector('.iss-inv-toggle'); if (t) t.classList.toggle('on', !!on);
  };
  function uninvoiced(cid) {
    var inv = {}; A('invoices').forEach(function (i) { inv[i.id] = 1; });
    return A('issuances').filter(function (i) { return (!i.invoiceId || !inv[i.invoiceId]) && (!cid || i.customerId === cid); });
  }
  window.issUninvoicedCount = function () { return uninvoiced().length; };

  window.openInvoiceFromIssuances = function (cid) {
    var all = uninvoiced(), by = {};
    all.forEach(function (i) { (by[i.customerId] = by[i.customerId] || []).push(i); });
    var custs = A('customers').filter(function (c) { return by[c.id]; });
    if (!custs.length) { toast('كل الصرف ليه فواتير — مفيش صرف من غير فاتورة', 'info'); return; }
    if (!cid || !by[cid]) cid = custs[0].id;
    openModal('🧾 فاتورة من الصرف',
      '<p class="ax-modal-lead">اختار المركز والصرفيات اللي عايز تعملها فاتورة. الفاتورة بتتعمل بضريبة 0% وبالأسعار اللي اتصرف بيها، ومش بتأثر على المخزن أو رصيد المركز (الصرف اتحسب خلاص).</p>' +
      '<div class="form-group"><label>المركز</label><select class="form-control" id="fi-cust" onchange="AXBiz.fiList(this.value)">' +
        custs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.name) + ' — ' + by[c.id].length + ' صرف</option>'; }).join('') +
      '</select></div><div id="fi-list"></div>' +
      '<div class="form-group"><label>ملاحظة على الفاتورة</label><input class="form-control" id="fi-note" placeholder="اختياري"></div>',
      '<button class="btn btn-primary" onclick="AXBiz.fiCreate()">🧾 إنشاء الفاتورة</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>', 'large');
    fiList(cid);
  };
  function fiList(cid) {
    var box = document.getElementById('fi-list'); if (!box) return;
    var list = uninvoiced(cid).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    box.innerHTML = '<div class="fi-head"><label class="fi-all"><input type="checkbox" checked onchange="document.querySelectorAll(\'.fi-row input\').forEach(function(c){c.checked=this.checked}.bind(this));AXBiz.fiSum()"> الكل</label><b id="fi-sum"></b></div>' +
      '<div class="fi-rows">' + list.map(function (i) {
        return '<label class="fi-row"><input type="checkbox" value="' + i.id + '" checked onchange="AXBiz.fiSum()">' +
          '<span class="fi-d">' + esc(i.date) + '<small>صرف #' + esc(i.number) + '</small></span>' +
          '<span class="fi-p">' + esc(i.productName) + '<small>' + nm(i.quantity) + ' ' + esc(i.productUnit || '') + ' × ' + nm(i.unitPrice) + '</small></span>' +
          '<b>' + fm(i.total) + '</b></label>';
      }).join('') + '</div>';
    fiSum();
  }
  function fiSum() {
    var ids = Array.prototype.map.call(document.querySelectorAll('.fi-row input:checked'), function (c) { return c.value; });
    var t = A('issuances').filter(function (i) { return ids.indexOf(i.id) >= 0; }).reduce(function (s, i) { return s + Number(i.total || 0); }, 0);
    var el = document.getElementById('fi-sum'); if (el) el.textContent = ids.length + ' صرف · ' + fm(t);
  }
  function fiCreate() {
    var cid = (document.getElementById('fi-cust') || {}).value;
    var ids = Array.prototype.map.call(document.querySelectorAll('.fi-row input:checked'), function (c) { return c.value; });
    var iss = A('issuances').filter(function (i) { return ids.indexOf(i.id) >= 0; });
    if (!iss.length) { toast('اختار صرف واحد على الأقل', 'error'); return; }
    var c = A('customers').find(function (x) { return x.id === cid; });
    var total = iss.reduce(function (s, i) { return s + Number(i.total || 0); }, 0);
    var paid = Math.min(total, iss.reduce(function (s, i) { return s + Number(i.paid || 0); }, 0));
    if (!D().counters) D().counters = { invoice: 1000 };
    var inv = {
      id: 'inv_' + id(), number: ++D().counters.invoice, customerId: cid, date: today(),
      items: iss.map(function (i) { return { productId: i.productId, productName: i.productName, qty: i.quantity, price: i.unitPrice, total: i.total }; }),
      subtotal: total, tax: 0, taxRate: 0, discount: 0, total: total, paid: paid,
      paymentMethod: paid >= total ? 'كاش' : 'آجل', status: paid >= total - .005 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      notes: (document.getElementById('fi-note') || {}).value || '', sourceIssuanceId: iss[0].id, fromIssuance: true,
      fromIssuances: iss.map(function (i) { return i.id; }), createdAt: Date.now()
    };
    D().invoices.push(inv);
    iss.forEach(function (i) { i.invoiceId = inv.id; });
    DB.save();
    if (typeof logAudit === 'function') { try { logAudit({ operation: 'add', table: 'invoices', recordId: inv.id, recordLabel: 'فاتورة #' + inv.number + ' من ' + iss.length + ' صرف — ' + (c ? c.name : ''), before: null, after: JSON.parse(JSON.stringify(inv)), reason: '' }); } catch (e) {} }
    closeModal();
    toast('✓ اتعملت فاتورة #' + inv.number + ' — ' + fm(total), 'success');
    if (typeof currentPage !== 'undefined') {
      if (currentPage === 'invoices' && typeof renderInvoices === 'function') renderInvoices();
      else if (currentPage === 'issuances' && typeof renderIssuances === 'function') renderIssuances();
    }
  }

  /* deleting an invoice that was made from issuances = unlink only */
  function hookDelete() {
    var orig = window.deleteInvoice;
    if (typeof orig !== 'function' || orig._axbiz) return;
    var w = function (invId) {
      var inv = A('invoices').find(function (x) { return x.id === invId; });
      var linked = inv ? A('issuances').filter(function (i) { return i.invoiceId === invId; }) : [];
      if (!inv || !linked.length) return orig.apply(this, arguments);
      confirmDialog('إلغاء فاتورة #' + inv.number + '؟\nالفاتورة دي معمولة من ' + linked.length + ' صرف — هتتلغي بس، والصرف نفسه والمخزن ورصيد المركز هيفضلوا زي ما هم (والصرف يرجع «من غير فاتورة»).', function () {
        var before = JSON.parse(JSON.stringify(inv));
        linked.forEach(function (i) { i.invoiceId = null; });
        A('payments').forEach(function (p) { if (p.invoiceId === invId) p.invoiceId = null; });
        D().invoices = A('invoices').filter(function (x) { return x.id !== invId; });
        DB.save();
        if (typeof logAudit === 'function') { try { logAudit({ operation: 'delete', table: 'invoices', recordId: invId, recordLabel: 'فاتورة #' + inv.number + ' (من الصرف — اتلغت والصرف فضل)', before: before, after: null, reason: '' }); } catch (e) {} }
        toast('اتلغت الفاتورة والصرف رجع من غير فاتورة');
        if (typeof renderInvoices === 'function' && currentPage === 'invoices') renderInvoices();
      });
    };
    w._axbiz = true;
    window.deleteInvoice = w;
  }

  /* old builds made the issuance invoice without sourceIssuanceId → sales counted twice */
  var migrated = false;
  function migrate() {
    /* data fixes are written by the admin only (the server refuses them from other roles) */
    if (migrated || typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'admin') return;
    migrated = true;
    var changed = 0, byInv = {};
    /* «وحدة» → «ورقة» for paper / film items (ink keeps its own unit) */
    A('products').forEach(function (p) {
      var n = String((p.name || '') + ' ' + (p.type || '')).toLowerCase();
      if (p.unit === 'وحدة' && !/حبر|ink|toner|خرطوش/.test(n)) { p.unit = 'ورقة'; changed++; }
    });
    A('issuances').forEach(function (i) { if (i.invoiceId && !byInv[i.invoiceId]) byInv[i.invoiceId] = i.id; });
    A('invoices').forEach(function (inv) {
      if (!inv.sourceIssuanceId && byInv[inv.id]) { inv.sourceIssuanceId = byInv[inv.id]; inv.fromIssuance = true; changed++; }
    });
    if (changed) { saveNoGuard(); console.info('[biz] data fixes:', changed); }
  }

  /* ─────────── 2 · center prices in invoices ─────────── */
  function invCustomer() {
    var s = document.querySelector('#invoice-form [name="customerId"]');
    return s && s.value ? A('customers').find(function (c) { return c.id === s.value; }) : null;
  }
  function priceFor(c, pid, def) {
    var cp = c && c.customPrices && c.customPrices[pid];
    return cp != null && cp !== '' && !isNaN(cp) ? Number(cp) : def;
  }
  function hookInvoice() {
    if (typeof window.updateInvoiceRow === 'function' && !window.updateInvoiceRow._axbiz) {
      var w = function (sel) {
        var opt = sel.options[sel.selectedIndex], def = parseFloat(opt && opt.dataset.price) || 0;
        var c = invCustomer(), pr = priceFor(c, sel.value, def), tr = sel.closest('tr');
        tr.querySelector('.row-price').value = pr;
        var tag = tr.querySelector('.inv-sp-tag');
        if (c && pr !== def && sel.value) {
          if (!tag) { tag = document.createElement('span'); tag.className = 'inv-sp-tag'; sel.parentNode.appendChild(tag); }
          tag.textContent = '💎 سعر ' + c.name + ': ' + nm(pr) + ' (الافتراضي ' + nm(def) + ')';
        } else if (tag) tag.remove();
        if (typeof recalcInvoice === 'function') recalcInvoice();
      };
      w._axbiz = true;
      window.updateInvoiceRow = w;
    }
    var o = window.openNewInvoice;
    if (typeof o === 'function' && !o._axbiz) {
      var w2 = function () {
        var r = o.apply(this, arguments);
        var s = document.querySelector('#invoice-form [name="customerId"]');
        if (s) {
          var info = document.createElement('div'); info.className = 'inv-cust-info'; s.parentNode.appendChild(info);
          s.addEventListener('change', function () {
            var c = invCustomer(), n = c && c.customPrices ? Object.keys(c.customPrices).filter(function (k) { return c.customPrices[k] != null && c.customPrices[k] !== ''; }).length : 0;
            info.textContent = n ? '💎 للمركز ده أسعار خاصة لـ ' + n + ' صنف — بتتكتب أوتوماتيك' : '';
            document.querySelectorAll('#invoice-rows .row-product').forEach(function (sel) { if (sel.value) window.updateInvoiceRow(sel); });
          });
        }
        return r;
      };
      w2._axbiz = true;
      window.openNewInvoice = w2;
    }
  }

  /* center form: copy prices / fill by discount */
  function hookCustomerForm() {
    var o = window.openCustomerForm;
    if (typeof o !== 'function' || o._axbiz) return;
    var w = function (cid) {
      var r = o.apply(this, arguments);
      var form = document.getElementById('cust-form');
      var first = form && form.querySelector('input[name^="custprice_"]');
      if (!first) return r;
      var block = first.closest('div[style*="max-height"]') || first.closest('table');
      if (!block) return r;
      var box = block.parentNode; box.classList.add('cust-prices');
      var others = A('customers').filter(function (c) { return c.id !== cid && c.customPrices && Object.keys(c.customPrices).length; });
      var tools = document.createElement('div'); tools.className = 'cust-price-tools';
      tools.innerHTML =
        (others.length ? '<select class="form-control" onchange="AXBiz.copyPrices(this.value);this.value=\'\'"><option value="">📋 انسخ الأسعار من مركز…</option>' +
          others.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + ' (' + Object.keys(c.customPrices).length + ' صنف)</option>'; }).join('') + '</select>' : '') +
        '<div class="cpt-disc"><input class="form-control" type="number" min="0" max="100" step="0.5" id="cpt-disc" placeholder="خصم %"><button type="button" class="btn btn-secondary btn-sm" onclick="AXBiz.discPrices()">طبّق على كل الأصناف</button></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="AXBiz.clearPrices()">مسح الأسعار الخاصة</button>';
      box.insertBefore(tools, block);
      return r;
    };
    w._axbiz = true;
    window.openCustomerForm = w;
  }

  function hookAll() { hookDelete(); hookInvoice(); hookCustomerForm(); }
  window.AXBiz = {
    fiList: fiList, fiSum: fiSum, fiCreate: fiCreate, migrate: migrate,
    copyPrices: function (cid) {
      var c = A('customers').find(function (x) { return x.id === cid; }); if (!c) return;
      var n = 0;
      document.querySelectorAll('#cust-form input[name^="custprice_"]').forEach(function (inp) {
        var pid = inp.name.replace('custprice_', ''); if (c.customPrices[pid] != null) { inp.value = c.customPrices[pid]; n++; }
      });
      toast('اتنسخ ' + n + ' سعر من ' + c.name);
    },
    discPrices: function () {
      var d = parseFloat((document.getElementById('cpt-disc') || {}).value);
      if (isNaN(d) || d < 0 || d >= 100) { toast('اكتب نسبة خصم من 0 لـ 99', 'error'); return; }
      document.querySelectorAll('#cust-form input[name^="custprice_"]').forEach(function (inp) {
        var p = A('products').find(function (x) { return x.id === inp.name.replace('custprice_', ''); });
        if (p && p.price) inp.value = Math.round(p.price * (1 - d / 100) * 100) / 100;
      });
      toast('اتطبّق خصم ' + d + '% على كل الأصناف');
    },
    clearPrices: function () { document.querySelectorAll('#cust-form input[name^="custprice_"]').forEach(function (inp) { inp.value = ''; }); }
  };

  hookAll();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookAll);
  window.addEventListener('load', function () { hookAll(); setTimeout(function () { try { migrate(); } catch (e) {} }, 1500); });
  // data arrives after login → run the one-time link fix then
  var rs = window.renderSidebar;
  if (typeof rs === 'function' && !rs._axbiz) {
    var w = function () { var r = rs.apply(this, arguments); try { migrate(); } catch (e) {} return r; };
    w._axbiz = true; window.renderSidebar = w;
  }
})();

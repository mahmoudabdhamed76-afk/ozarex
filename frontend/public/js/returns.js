/* ════════════════════════════════════════════════════════════════════
   ERP · المرتجعات (4.35 · المرحلة 5) — مرتجع مبيعات ومرتجع مشتريات
   ------------------------------------------------------------------
   · مرتجع مبيعات: من عملية صرف أو فاتورة بيع في الفرع ده — الأصناف
     والكميات اللي رجعت (مش أكتر من اللي اتباع ناقص اللي رجع قبل كده).
       البضاعة بترجع المخزن (حركة «وارد · مرتجع مبيعات») إلا لو تالفة،
       رصيد العميل بيقل بقيمة المرتجع، ولو رجّعت له فلوس كاش بتطلع من الخزنة.
   · مرتجع مشتريات: من فاتورة شراء — الأصناف (أو مبلغ لو الفاتورة من غير
     أصناف). المستحق للمورد بيقل، ولو المورد رجّع فلوس بتدخل الخزنة،
     والكميات بتطلع من المخزن لو علّمت «اطلع من المخزن».
   · المرتجع سجل جديد (settings._returns في الفرع) — الفاتورة الأصلية
     والأرقام القديمة مبتتغيرش أبداً. كل الشاشات (الرئيسية · لوحة التحكم ·
     الأرباح · جميع الفروع · الموردين · فواتير المشتريات) بتطرحه.
   · المرتجع مبيتعدلش ولا بيتمسح من البرنامج (السيرفر بيرفض) — بيتسجل في
     سجل التعديلات باسم اللي عمله.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var REASONS = { sale: ['العميل رجّعها', 'غلط في الطلب', 'زيادة عن المطلوب', 'بضاعة تالفة', 'سبب تاني'],
    purchase: ['بضاعة تالفة', 'غلط في التوريد', 'زيادة عن المطلوب', 'سبب تاني'] };
  var F = null;                 // the open form: { type, src, lines, party, amountMode, max }
  var L = { type: 'sale', p: 'month', q: '' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function list() { var s = S(); if (!Array.isArray(s._returns)) s._returns = []; return s._returns; }
  function all() { return window.AXBStats ? AXBStats.rets(D()) : []; }
  function N(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(v) { return Math.round(N(v) * 100) / 100; }
  function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(N(n)); } catch (e) {} return num(n); }
  function today() { return typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10); }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function id() { return typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2, 12); }
  function me() { var u = typeof currentUser !== 'undefined' && currentUser; return u ? { id: u.id, name: u.name || u.username || '' } : { id: '', name: '' }; }
  function admin() { return typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin'; }
  function may(p) { try { return admin() || (typeof can === 'function' && can(p)); } catch (e) { return false; } }
  function canSale() { return may('issuances') || may('invoices'); }
  function canPurchase() { return may('suppliers') || may('purchases'); }
  function norm(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
  function dmy(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : ''; }
  var KIND = { sale: 'مرتجع مبيعات', purchase: 'مرتجع مشتريات' };

  /* ── what was sold / bought on a document (one line per item) ── */
  function issBatch(i) {
    var l = A('issuances').filter(function (x) {
      if (!x) return false;
      if (i.invoiceId && x.invoiceId === i.invoiceId) return true;
      return String(x.number) === String(i.number) && x.customerId === i.customerId && x.date === i.date;
    });
    return l.length ? l : [i];
  }
  function saleSrc(kind, docId) {
    if (kind === 'inv') {
      var v = A('invoices').find(function (x) { return x && x.id === docId; });
      if (!v) return null;
      if (v.isConsolidated) return { err: 'دي فاتورة مجمعة — اعمل المرتجع من الفاتورة الأصلية أو من عملية الصرف' };
      var fromIss = A('issuances').find(function (x) { return x && x.invoiceId === v.id; });
      if (fromIss) return saleSrc('iss', fromIss.id);
      var sub = N(v.subtotal) || (v.items || []).reduce(function (s, it) { return s + N(it.total); }, 0);
      var kT = sub > 0 ? N(v.total) / sub : 1, kN = sub > 0 ? Math.max(0, sub - N(v.discount)) / sub : 1;
      return {
        kind: 'inv', id: v.id, number: v.number, date: v.date, label: 'فاتورة #' + v.number, customerId: v.customerId,
        lines: (v.items || []).map(function (it, k) {
          var q = N(it.qty != null ? it.qty : it.quantity), u = q ? N(it.total) / q : N(it.price);
          return { key: String(k), productId: it.productId || '', name: it.productName || it.name || 'صنف', unit: it.unit || '', qty: q, unitTot: u * kT, unitNet: u * kN };
        }).filter(function (l) { return l.qty > 0; })
      };
    }
    var i = A('issuances').find(function (x) { return x && x.id === docId; });
    if (!i) return null;
    var lines = [];
    issBatch(i).forEach(function (x) {
      if (Array.isArray(x.items) && x.items.length && !x.productId) {
        x.items.forEach(function (it, k) {
          var q = N(it.qty != null ? it.qty : it.quantity), u = q ? N(it.total != null ? it.total : q * N(it.price || it.unitPrice)) / q : N(it.price || it.unitPrice);
          lines.push({ key: x.id + ':' + k, productId: it.productId || '', name: it.productName || it.name || 'صنف', unit: it.unit || '', qty: q, unitTot: u, unitNet: u });
        });
      } else {
        var q = N(x.quantity), u = q ? N(x.total) / q : N(x.unitPrice);
        lines.push({ key: x.id, productId: x.productId || '', name: x.productName || 'صنف', unit: x.productUnit || x.unit || '', qty: q, unitTot: u, unitNet: u });
      }
    });
    var head = issBatch(i)[0];
    var inv = i.invoiceId && A('invoices').find(function (v) { return v && v.id === i.invoiceId; });
    return { kind: 'iss', id: head.id, number: i.number, date: i.date, label: 'صرف #' + i.number + (inv ? ' (فاتورة #' + inv.number + ')' : ''), customerId: i.customerId, invoiceId: i.invoiceId || null,
      lines: lines.filter(function (l) { return l.qty > 0; }) };
  }
  function productFor(it) {
    var P = A('products');
    if (it.productId) { var x = P.find(function (p) { return p && p.id === it.productId; }); if (x) return x; }
    var n = norm(it.name || it.productName), u = norm(it.unit);
    return P.find(function (p) { return p && norm(p.name) === n && (!u || !p.unit || norm(p.unit) === u); }) || null;
  }
  function purchaseSrc(pid) {
    var p = A('expenses').find(function (x) { return x && x.id === pid && x.kind === 'purchase'; });
    if (!p) return null;
    var lines = (p.items || []).map(function (it, k) {
      var q = N(it.qty != null ? it.qty : it.quantity), pr = q ? N(it.total != null ? it.total : q * N(it.price)) / q : N(it.price), prod = productFor(it);
      return { key: String(k), productId: prod ? prod.id : '', name: it.name || it.productName || 'صنف', unit: it.unit || '', qty: q, unitTot: pr, unitNet: pr };
    }).filter(function (l) { return l.qty > 0; });
    return { kind: 'pur', id: p.id, number: p.number, date: p.date, label: 'فاتورة شراء #' + (p.number || '-'), supplierId: p.supplierId, amount: N(p.amount), poId: p.poId || null, lines: lines };
  }
  /* already returned off a document: per line (qty) and in money */
  function returnedOf(srcId) {
    var q = {}, m = 0, n = 0;
    all().forEach(function (r) {
      if (!r.src || r.src.id !== srcId) return;
      n++; m += N(r.amount);
      (r.items || []).forEach(function (it) { q[it.key] = (q[it.key] || 0) + N(it.qty); });
    });
    return { qty: q, amount: m, count: n };
  }
  function custBal(cid) { var c = A('customers').find(function (x) { return x && x.id === cid; }); return c ? N(c.balance) : 0; }
  function supBal(sid) { try { return typeof supplierMetrics === 'function' ? N(supplierMetrics(sid).balance) : 0; } catch (e) { return 0; } }

  /* ── the form ── */
  function openSale(kind, docId) {
    if (!canSale()) { T('مالكش صلاحية تعمل مرتجع مبيعات', 'error'); return; }
    var src = saleSrc(kind, docId);
    if (!src) { T('المستند مش موجود', 'error'); return; }
    if (src.err) { T(src.err, 'warning'); return; }
    var c = A('customers').find(function (x) { return x && x.id === src.customerId; });
    open({ type: 'sale', src: src, party: { id: src.customerId, name: c ? c.name : 'عميل' } });
  }
  function openPurchase(pid) {
    if (!canPurchase()) { T('مالكش صلاحية تعمل مرتجع مشتريات', 'error'); return; }
    var src = purchaseSrc(pid);
    if (!src) { T('فاتورة الشراء مش موجودة', 'error'); return; }
    var s = A('suppliers').find(function (x) { return x && x.id === src.supplierId; });
    open({ type: 'purchase', src: src, party: { id: src.supplierId, name: s ? s.name : 'مورد' } });
  }
  function open(f) {
    var done = returnedOf(f.src.id);
    f.lines = f.src.lines.map(function (l) { return Object.assign({}, l, { done: done.qty[l.key] || 0, avail: Math.max(0, r2(l.qty - (done.qty[l.key] || 0))) }); });
    f.amountMode = f.type === 'purchase' && !f.lines.length;
    f.max = f.amountMode ? Math.max(0, r2(f.src.amount - done.amount)) : 0;
    f.done = done;
    if (!f.amountMode && !f.lines.some(function (l) { return l.avail > 0; })) { T('المستند ده اترجع كله قبل كده', 'warning'); return; }
    if (f.amountMode && f.max <= 0) { T('الفاتورة دي اترجعت كلها قبل كده', 'warning'); return; }
    F = f;
    var sale = f.type === 'sale', stockDefault = sale ? true : !!f.src.poId;
    var body = '<div class="ax-hl-off axr-form" dir="rtl">' +
      '<div class="axr-doc"><div><b>' + esc(f.party.name) + '</b><span>' + esc(f.src.label) + ' · ' + esc(dmy(f.src.date)) + '</span></div>' +
        '<em class="axr-tag ' + f.type + '">' + KIND[f.type] + '</em></div>' +
      (done.count ? '<div class="axr-note">اترجع من المستند ده قبل كده ' + done.count + ' مرة بقيمة <b>' + money(done.amount) + '</b></div>' : '') +
      (f.amountMode ?
        '<label class="axr-f"><span>قيمة المرتجع</span><input id="axr-amt" class="form-control" type="number" min="0" step="any" max="' + f.max + '" inputmode="decimal" oninput="AXRet.calc()" placeholder="0"><small>الفاتورة من غير أصناف — المتاح ' + money(f.max) + '</small></label>'
        : '<div class="axr-lines"><div class="axr-lh"><span>الصنف</span><span>' + (sale ? 'اتباع' : 'اتشرى') + '</span><span>المتاح</span><span>الراجع</span></div>' +
          f.lines.map(function (l, k) {
            return '<div class="axr-line' + (l.avail <= 0 ? ' off' : '') + '"><div class="axr-ln"><b>' + esc(l.name) + '</b><small>' + money(l.unitTot) + ' / ' + esc(l.unit || 'وحدة') + (l.done ? ' · رجع ' + num(l.done) : '') + '</small></div>' +
              '<span class="axr-n">' + num(l.qty) + '</span><span class="axr-n">' + num(l.avail) + '</span>' +
              '<input class="form-control axr-q" type="number" min="0" step="any" inputmode="decimal" data-k="' + k + '" max="' + l.avail + '"' + (l.avail <= 0 ? ' disabled' : '') + ' oninput="AXRet.calc()" placeholder="0" aria-label="الكمية الراجعة من ' + esc(l.name) + '"></div>';
          }).join('') +
          '<button type="button" class="btn btn-ghost btn-sm axr-allbtn" onclick="AXRet.fillAll()">رجّع الكل</button></div>') +
      '<div class="axr-grid">' +
        '<label class="axr-f"><span>التاريخ</span><input id="axr-date" class="form-control" type="date" value="' + today() + '" max="' + today() + '"></label>' +
        '<label class="axr-f"><span>السبب</span><select id="axr-reason" class="form-control" onchange="AXRet.reason()">' + REASONS[f.type].map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      (f.amountMode ? '' : '<label class="axr-check"><input type="checkbox" id="axr-stock"' + (stockDefault ? ' checked' : '') + '><span>' +
        (sale ? 'البضاعة ترجع المخزن <small>(شيل العلامة لو تالفة ومش هتتباع)</small>' : 'اطلع الكميات من المخزن <small>' + (f.src.poId ? '(الفاتورة دي دخلت المخزن من طلب شراء)' : '(فاتورة الشراء العادية مبتدخلش المخزن لوحدها — علّم لو البضاعة كانت متسجلة في المخزن)') + '</small>') + '</span></label>') +
      '<label class="axr-f"><span>ملاحظة</span><input id="axr-note" class="form-control" maxlength="200" placeholder="اختياري"></label>' +
      '<div class="axr-sum"><div><span>قيمة المرتجع</span><b id="axr-val">' + money(0) + '</b></div>' +
        '<label class="axr-f axr-ref"><span>' + (sale ? 'رجّعت له فلوس كاش' : 'المورد رجّع فلوس كاش') + '</span><input id="axr-refund" class="form-control" type="number" min="0" step="any" inputmode="decimal" value="0" oninput="AXRet.calc(true)"></label>' +
        '<p id="axr-eff" class="axr-eff"></p></div>' +
      '</div>';
    if (typeof openModal === 'function') openModal('↩ ' + KIND[f.type] + ' — ' + esc(f.src.label), body,
      '<button class="btn btn-primary" id="axr-save" onclick="AXRet.save()">تسجيل المرتجع</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
    F.refundTouched = false;
    calc();
  }
  function value() {
    if (!F) return { amount: 0, net: 0, items: [] };
    if (F.amountMode) { var a = r2((document.getElementById('axr-amt') || {}).value); return { amount: a, net: a, items: [], bad: a > F.max + 0.005 }; }
    var items = [], amount = 0, net = 0, bad = false;
    document.querySelectorAll('.axr-q').forEach(function (inp) {
      var l = F.lines[+inp.dataset.k], q = N(inp.value);
      if (!l || q <= 0) { inp.classList.remove('bad'); return; }
      var over = q > l.avail + 1e-9; inp.classList.toggle('bad', over); if (over) bad = true;
      var t = r2(q * l.unitTot), n = r2(q * l.unitNet);
      amount += t; net += n;
      items.push({ key: l.key, productId: l.productId, name: l.name, unit: l.unit, qty: q, price: r2(l.unitTot), total: t, net: n });
    });
    return { amount: r2(amount), net: r2(net), items: items, bad: bad };
  }
  function calc(byHand) {
    if (!F) return;
    if (byHand) F.refundTouched = true;
    var v = value(), ref = document.getElementById('axr-refund'), sale = F.type === 'sale';
    var owed = sale ? custBal(F.party.id) : supBal(F.party.id);
    if (ref && !F.refundTouched) ref.value = r2(Math.max(0, v.amount - Math.max(0, owed)));   // what the debt can't absorb → cash
    var refund = Math.min(N(ref && ref.value), v.amount), credit = r2(v.amount - refund);
    var el = document.getElementById('axr-val'); if (el) el.textContent = money(v.amount);
    var eff = document.getElementById('axr-eff');
    if (eff) eff.innerHTML = v.amount <= 0 ? 'اكتب الكمية الراجعة' :
      (sale ? 'رصيد ' + esc(F.party.name) + ' هيقل <b>' + money(credit) + '</b>' + (refund > 0 ? ' · <b>' + money(refund) + '</b> تطلع من الخزنة' : '')
            : 'المستحق لـ ' + esc(F.party.name) + ' هيقل <b>' + money(credit) + '</b>' + (refund > 0 ? ' · <b>' + money(refund) + '</b> تدخل الخزنة' : ''));
    var b = document.getElementById('axr-save'); if (b) b.disabled = v.amount <= 0 || v.bad;
  }
  function fillAll() {
    if (!F) return;
    document.querySelectorAll('.axr-q').forEach(function (inp) { var l = F.lines[+inp.dataset.k]; if (l && l.avail > 0) inp.value = l.avail; });
    calc();
  }
  function reason() {
    var r = (document.getElementById('axr-reason') || {}).value, st = document.getElementById('axr-stock');
    if (st && F && F.type === 'sale') st.checked = r !== 'بضاعة تالفة';
  }

  function save() {
    if (!F) return;
    var f = F, sale = f.type === 'sale', v = value();
    if (v.amount <= 0) { T('اكتب الكمية الراجعة', 'warning'); return; }
    if (v.bad) { T(f.amountMode ? 'المبلغ أكبر من المتاح (' + money(f.max) + ')' : 'الكمية أكبر من المتاح', 'error'); return; }
    var date = (document.getElementById('axr-date') || {}).value || today();
    var lock = S().closedUntil;
    if (date > today()) { T('التاريخ في المستقبل', 'error'); return; }
    if (lock && date <= lock) { T('الفترة لحد ' + dmy(lock) + ' مقفولة — اختار تاريخ بعدها', 'error'); return; }
    var refund = r2(Math.max(0, Math.min(N((document.getElementById('axr-refund') || {}).value), v.amount)));
    var stock = !f.amountMode && !!(document.getElementById('axr-stock') || {}).checked;
    var P = A('products'), byId = {}; P.forEach(function (p) { if (p) byId[p.id] = p; });
    if (stock && !sale) {
      var need = {};
      v.items.forEach(function (it) { if (it.productId) need[it.productId] = (need[it.productId] || 0) + it.qty; });
      var short = Object.keys(need).filter(function (k) { return byId[k] && N(byId[k].quantity) + 1e-9 < need[k]; });
      if (short.length) { T('الكمية في المخزن أقل من المرتجع: ' + short.map(function (k) { return byId[k].name + ' (المتاح ' + num(byId[k].quantity) + ')'; }).join('، ') + ' — شيل علامة «اطلع من المخزن» لو مش متسجلة', 'error'); return; }
    }
    var number = all().filter(function (r) { return r.type === f.type; }).reduce(function (m, r) { return Math.max(m, N(r.number)); }, 0) + 1;
    var rec = {
      id: 'rt_' + id(), type: f.type, number: number, date: date,
      src: { kind: f.src.kind, id: f.src.id, number: f.src.number, label: f.src.label, date: f.src.date },
      items: v.items.map(function (it) { return Object.assign(it, { stock: stock && !!it.productId && !!byId[it.productId] }); }),
      amount: v.amount, net: v.net, refund: refund,
      reason: (document.getElementById('axr-reason') || {}).value || '', note: String((document.getElementById('axr-note') || {}).value || '').replace(/[<>]/g, '').slice(0, 200),
      by: me(), at: Date.now()
    };
    if (sale) { rec.customerId = f.party.id; rec.customerName = f.party.name; } else { rec.supplierId = f.party.id; rec.supplierName = f.party.name; }
    try { if (window.Branch && Branch.get) rec.branch = Branch.get(); } catch (e) {}

    /* the effects — new records + the accumulated numbers (balance / quantity) */
    var d = D(); if (!Array.isArray(d.stockMoves)) d.stockMoves = [];
    var ref = KIND[f.type] + ' #' + number + ' — ' + f.src.label + ' — ' + f.party.name;
    rec.items.forEach(function (it, k) {
      if (!it.stock) return;
      var p = byId[it.productId];
      p.quantity = r2(N(p.quantity) + (sale ? 1 : -1) * it.qty);
      d.stockMoves.push({ id: 'sm_rt_' + rec.id + '_' + k, productId: p.id, productName: p.name, type: sale ? 'in' : 'out', quantity: it.qty, date: date,
        kind: 'return', returnId: rec.id, reference: ref, note: rec.reason, createdAt: Date.now() });
    });
    if (sale) {
      var c = A('customers').find(function (x) { return x && x.id === f.party.id; });
      if (c) c.balance = r2(N(c.balance) - (rec.amount - rec.refund));
    }
    list().push(rec);
    if (typeof DB.save === 'function') DB.save();
    try {
      if (typeof logAudit === 'function') logAudit({ operation: 'add', table: 'returns', recordId: rec.id,
        recordLabel: ref + ' — ' + money(rec.amount) + (rec.refund ? ' (رد كاش ' + money(rec.refund) + ')' : ''), before: null, after: JSON.parse(JSON.stringify(rec)), reason: rec.reason });
    } catch (e) {}
    F = null;
    if (typeof playTone === 'function') { try { playTone('save'); } catch (e) {} }
    T('اتسجل ' + KIND[rec.type] + ' #' + rec.number + ' ✓');
    view(rec.id);
    rerender();
  }
  function rerender() {
    var page = typeof currentPage !== 'undefined' ? currentPage : '';
    var R = { invoices: window.renderInvoices, issuances: window.renderIssuances, sales: window.renderSales, purchases: window.renderPurchaseInvoices,
      suppliers: window.renderSuppliers, customers: window.renderCustomers, dashboard: window.renderDashboard, inventory: window.renderInventory, profit: window.renderProfit };
    try { if (typeof R[page] === 'function') R[page](); } catch (e) {}
  }

  /* ── one return: details + print ── */
  function find(rid) { return all().find(function (r) { return r.id === rid; }) || null; }
  function view(rid) {
    var r = find(rid); if (!r) return;
    var sale = r.type === 'sale', party = sale ? r.customerName : r.supplierName;
    var body = '<div class="ax-hl-off axr-view" dir="rtl">' +
      '<div class="axr-doc"><div><b>' + esc(party || '-') + '</b><span>' + esc((r.src && r.src.label) || '') + ' · ' + esc(dmy(r.date)) + '</span></div><em class="axr-tag ' + r.type + '">' + KIND[r.type] + ' #' + r.number + '</em></div>' +
      (r.items && r.items.length ? '<table class="data-table axr-vt"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>القيمة</th></tr></thead><tbody>' +
        r.items.map(function (it) { return '<tr><td>' + esc(it.name) + (it.stock ? '' : ' <small class="axr-mut">' + (sale ? '(مرجعتش المخزن)' : '(من غير مخزن)') + '</small>') + '</td><td>' + num(it.qty) + ' ' + esc(it.unit || '') + '</td><td>' + money(it.price) + '</td><td><b>' + money(it.total) + '</b></td></tr>'; }).join('') +
        '</tbody></table>' : '') +
      '<div class="axr-vk"><div><em>قيمة المرتجع</em><b>' + money(r.amount) + '</b></div><div><em>' + (sale ? 'اتخصم من الرصيد' : 'اتخصم من المستحق') + '</em><b>' + money(r2(N(r.amount) - N(r.refund))) + '</b></div><div><em>' + (sale ? 'اترد كاش' : 'دخل كاش') + '</em><b>' + money(r.refund) + '</b></div></div>' +
      '<p class="axr-meta">السبب: <b>' + esc(r.reason || '—') + '</b>' + (r.note ? ' · ' + esc(r.note) : '') + ' · سجّله ' + esc((r.by && r.by.name) || '') + '</p></div>';
    if (typeof openModal === 'function') openModal('↩ ' + KIND[r.type] + ' #' + r.number, body,
      '<button class="btn btn-primary" onclick="AXRet.print(\'' + r.id + '\')">🖨 طباعة</button><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
  }
  function print(rid) {
    var r = find(rid); if (!r) return;
    var w = window.open('', '_blank'); if (!w) { T('المتصفح منع نافذة الطباعة', 'error'); return; }
    var s = S(), sale = r.type === 'sale', br = typeof branchPrintLine === 'function' ? branchPrintLine() : '';
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + KIND[r.type] + ' #' + r.number + '</title><style>@page{size:A5;margin:12mm}body{font-family:"Zain","IBM Plex Sans Arabic","Cairo",Tahoma,sans-serif;color:#000}h1{margin:0;font-size:20px}h2{margin:4px 0 12px;font-size:14px;font-weight:600}table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}th,td{border:1px solid #000;padding:6px;text-align:right}th{background:#eee}.t{margin-top:10px;font-size:13px;line-height:1.9}.sig{display:flex;justify-content:space-between;margin-top:34px;font-size:12px}</style></head><body>' +
      '<h1>' + esc(s.companyName || 'Ozarex') + '</h1>' + (br ? '<div>' + esc(br) + '</div>' : '') +
      '<h2>' + KIND[r.type] + ' #' + r.number + ' — ' + esc(dmy(r.date)) + '<br>' + (sale ? 'العميل: ' : 'المورد: ') + esc((sale ? r.customerName : r.supplierName) || '') + ' — ' + esc((r.src && r.src.label) || '') + '</h2>' +
      (r.items && r.items.length ? '<table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>القيمة</th></tr></thead><tbody>' +
        r.items.map(function (it, k) { return '<tr><td>' + (k + 1) + '</td><td>' + esc(it.name) + '</td><td>' + num(it.qty) + ' ' + esc(it.unit || '') + '</td><td>' + num(it.price) + '</td><td>' + num(it.total) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<div class="t">قيمة المرتجع: <b>' + num(r.amount) + '</b><br>' + (sale ? 'اترد كاش: ' : 'المورد رد كاش: ') + '<b>' + num(r.refund) + '</b> · ' + (sale ? 'اتخصم من الرصيد: ' : 'اتخصم من المستحق: ') + '<b>' + num(r2(N(r.amount) - N(r.refund))) + '</b><br>السبب: ' + esc(r.reason || '—') + (r.note ? ' — ' + esc(r.note) : '') + '</div>' +
      '<div class="sig"><span>توقيع المستلم: ................</span><span>توقيع المسؤول: ................</span></div></body></html>');
    w.document.close(); setTimeout(function () { try { w.print(); } catch (e) {} }, 300);
  }

  /* ── the list of returns (+ a new one) ── */
  function inRange(x) {
    if (L.p === 'all') return true;
    var r = window.AXBStats ? AXBStats.range(L.p, today()) : ['0000', '9999'];
    return x >= r[0] && x <= r[1];
  }
  function showList(type) {
    if (type) L.type = type;
    if (L.type === 'sale' && !canSale() && canPurchase()) L.type = 'purchase';
    if (L.type === 'purchase' && !canPurchase() && canSale()) L.type = 'sale';
    var rows = all().filter(function (r) { return r.type === L.type && inRange(String(r.date || '')); })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || N(b.number) - N(a.number); });
    var tot = rows.reduce(function (s, r) { return s + N(r.amount); }, 0), cash = rows.reduce(function (s, r) { return s + N(r.refund); }, 0);
    var tabs = [['sale', 'مرتجع المبيعات', canSale()], ['purchase', 'مرتجع المشتريات', canPurchase()]].filter(function (t) { return t[2]; });
    var per = [['month', 'الشهر'], ['last', 'اللي فات'], ['year', 'السنة'], ['all', 'الكل']];
    var body = '<div class="ax-hl-off axr-list" dir="rtl">' +
      '<div class="axr-tabs">' + tabs.map(function (t) { return '<button type="button" class="' + (L.type === t[0] ? 'on' : '') + '" onclick="AXRet.list(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="axr-per">' + per.map(function (p) { return '<button type="button" class="' + (L.p === p[0] ? 'on' : '') + '" onclick="AXRet.period(\'' + p[0] + '\')">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<div class="axr-kpis"><div><span>عدد المرتجعات</span><b>' + rows.length + '</b></div><div><span>القيمة</span><b>' + money(tot) + '</b></div><div><span>' + (L.type === 'sale' ? 'اترد كاش' : 'دخل كاش') + '</span><b>' + money(cash) + '</b></div></div>' +
      (rows.length ? '<div class="axr-rows">' + rows.map(function (r) {
        return '<button type="button" class="axr-row" onclick="AXRet.view(\'' + r.id + '\')"><div><b>#' + r.number + ' · ' + esc((r.type === 'sale' ? r.customerName : r.supplierName) || '-') + '</b>' +
          '<span>' + esc(dmy(r.date)) + ' · ' + esc((r.src && r.src.label) || '') + ' · ' + esc(r.reason || '') + '</span></div><b class="axr-amt">' + money(r.amount) + '</b></button>';
      }).join('') + '</div>' : '<div class="axr-empty">مفيش مرتجعات ' + (L.p === 'all' ? 'لسه' : 'في الفترة دي') + '</div>') +
      '</div>';
    if (typeof openModal === 'function') openModal('↩ المرتجعات', body,
      '<button class="btn btn-primary" onclick="AXRet.pick()">+ مرتجع جديد</button><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
  }
  /* pick the document a new return comes from */
  function docs(type) {
    if (type === 'purchase') {
      return A('expenses').filter(function (p) { return p && p.kind === 'purchase'; }).map(function (p) {
        return { kind: 'pur', id: p.id, no: p.number, date: p.date, who: p.supplierName || '', total: N(p.amount), label: 'فاتورة شراء #' + (p.number || '-') };
      });
    }
    var out = [], seen = {}, cust = {};
    A('customers').forEach(function (c) { if (c) cust[c.id] = c.name; });
    A('issuances').forEach(function (i) {
      if (!i) return; var k = i.invoiceId || (i.number + '|' + i.customerId + '|' + i.date);
      if (seen[k]) { seen[k].total += N(i.total); return; }
      seen[k] = { kind: 'iss', id: i.id, no: i.number, date: i.date, who: i.customerName || cust[i.customerId] || '', total: N(i.total), label: 'صرف #' + i.number };
      out.push(seen[k]);
    });
    A('invoices').forEach(function (v) {
      if (!v || v.isConsolidated || A('issuances').some(function (i) { return i && i.invoiceId === v.id; })) return;
      out.push({ kind: 'inv', id: v.id, no: v.number, date: v.date, who: cust[v.customerId] || '', total: N(v.total), label: 'فاتورة #' + v.number });
    });
    return out;
  }
  function pick(q) {
    var type = L.type;
    if (q == null) { L.q = ''; }
    var nq = String(q == null ? '' : q).trim();
    var l = docs(type).filter(function (x) { return !nq || String(x.no).indexOf(nq) >= 0 || String(x.who).indexOf(nq) >= 0; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 60);
    var rows = l.length ? l.map(function (x) {
      return '<button type="button" class="axr-row" onclick="AXRet.from(\'' + x.kind + '\',\'' + x.id + '\')"><div><b>' + esc(x.label) + ' · ' + esc(x.who) + '</b><span>' + esc(dmy(x.date)) + '</span></div><b class="axr-amt">' + money(x.total) + '</b></button>';
    }).join('') : '<div class="axr-empty">مفيش مستندات بالبحث ده</div>';
    var host = document.getElementById('axr-pick-rows');
    if (host && q != null) { host.innerHTML = rows; return; }
    if (typeof openModal === 'function') openModal('↩ ' + KIND[type] + ' جديد — اختار المستند',
      '<div class="ax-hl-off axr-list" dir="rtl"><input class="form-control" id="axr-pick-q" type="search" placeholder="' + (type === 'sale' ? 'رقم الصرف / الفاتورة أو اسم العميل' : 'رقم فاتورة الشراء أو اسم المورد') + '" oninput="AXRet.pick(this.value)" autocomplete="off">' +
        '<div class="axr-rows" id="axr-pick-rows">' + rows + '</div></div>',
      '<button class="btn btn-ghost" onclick="AXRet.list()">رجوع</button>');
  }
  function from(kind, docId) { if (kind === 'pur') openPurchase(docId); else openSale(kind, docId); }

  /* ── the «مرتجع» button on a document, and «المرتجعات» on the pages ── */
  function addToModal(btnHtml, noteHtml) {
    var m = document.getElementById('modal'); if (!m) return;
    var foot = m.querySelector('.modal-footer');
    if (!foot) { foot = document.createElement('div'); foot.className = 'modal-footer'; m.appendChild(foot); }
    if (btnHtml && !foot.querySelector('.axr-btn')) foot.insertAdjacentHTML('beforeend', btnHtml);
    var b = m.querySelector('.modal-body');
    if (noteHtml && b && !b.querySelector('.axr-note')) b.insertAdjacentHTML('afterbegin', noteHtml);
  }
  function noteFor(srcId) {
    var d = returnedOf(srcId);
    return d.count ? '<div class="axr-note">اترجع منها ' + d.count + ' مرة بقيمة <b>' + money(d.amount) + '</b> — <a href="#" onclick="event.preventDefault();AXRet.list(\'' + (srcId.indexOf('pur_') === 0 ? 'purchase' : 'sale') + '\')">المرتجعات</a></div>' : '';
  }
  function hook() {
    var vi = window.viewIssuance;
    if (typeof vi === 'function' && !vi._axr) {
      var w1 = function (iid) {
        var r = vi.apply(this, arguments);
        try {
          var src = saleSrc('iss', iid);
          if (src && !src.err) addToModal(canSale() ? '<button class="btn btn-secondary axr-btn" onclick="AXRet.openSale(\'iss\',\'' + esc(iid) + '\')">↩ مرتجع</button>' : '', noteFor(src.id));
        } catch (e) {}
        return r;
      };
      w1._axr = 1; window.viewIssuance = w1;
    }
    var vv = window.viewInvoice;
    if (typeof vv === 'function' && !vv._axr) {
      var w2 = function (vid) {
        var r = vv.apply(this, arguments);
        try {
          var src = saleSrc('inv', vid);
          if (src && !src.err) addToModal(canSale() ? '<button class="btn btn-secondary axr-btn" onclick="AXRet.openSale(\'inv\',\'' + esc(vid) + '\')">↩ مرتجع</button>' : '', noteFor(src.id));
        } catch (e) {}
        return r;
      };
      w2._axr = 1; window.viewInvoice = w2;
    }
  }
  var PAGES = { invoices: 'sale', issuances: 'sale', sales: 'sale', purchases: 'purchase' };
  function pageButton() {
    var page = typeof currentPage !== 'undefined' ? currentPage : '', type = PAGES[page];
    if (!type || !(type === 'sale' ? canSale() : canPurchase())) return;
    var pc = document.getElementById('page-content'); if (!pc || pc.querySelector('.axr-page-btn')) return;
    var html = '<button type="button" class="btn btn-secondary axr-page-btn" onclick="AXRet.list(\'' + type + '\')">↩ المرتجعات</button>';
    var bar = pc.querySelector('.section-action-bar') || pc.querySelector('.pi-head');
    if (bar) { bar.insertAdjacentHTML('beforeend', html); return; }
    var sum = pc.querySelector('.sl-m .sl-sum');           // the phone «المبيعات» header keeps its three tools — the link sits under the total
    if (sum) sum.insertAdjacentHTML('afterend', '<button type="button" class="axr-mlink axr-page-btn ax-hl-off" onclick="AXRet.list(\'sale\')"><span class="axr-ic">↩</span> المرتجعات</button>');
  }
  function watch() {
    var pc = document.getElementById('page-content');
    if (!pc || pc._axr || typeof MutationObserver === 'undefined') return;
    pc._axr = 1;
    var q = 0;
    new MutationObserver(function () { if (q) return; q = 1; requestAnimationFrame(function () { q = 0; pageButton(); }); }).observe(pc, { childList: true, subtree: true });
    pageButton();
  }
  function boot() { hook(); watch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 0);

  window.AXRet = {
    openSale: openSale, openPurchase: openPurchase, calc: calc, fillAll: fillAll, reason: reason, save: save,
    view: view, print: print, list: function (t) { showList(t); }, period: function (p) { L.p = p; showList(); },
    pick: pick, from: from, canSale: canSale, canPurchase: canPurchase, returnedOf: returnedOf, saleSrc: saleSrc, purchaseSrc: purchaseSrc
  };
})();

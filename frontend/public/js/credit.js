/* ════════════════════════════════════════════════════════════════════
   ERP · حد الائتمان وهامش الربح (4.13)
   ------------------------------------------------------------------
   ١) وقف الصرف: لو المركز هيعدّي حد الائتمان بالصرف ده، أو عليه فلوس
      متأخرة أكتر من N يوم (من «قواعد البيع والتنبيهات») — صرف الورق
      والفاتورة الآجلة بيقفوا:
      · المدير: يشوف السبب ويقدر يكمّل بزرار.
      · الموظف: يبعت «طلب استثناء» للمدير في «الطلبات والمقترحات»،
        ولما المدير يوافق يقدر يكمّل خلال 24 ساعة.
   ٢) هامش الربح: البرنامج بيقارن آخر سعر بيع لكل مركز في كل صنف بآخر
      سعر شراء من المورد. لو الهامش أقل من الحد (أو بخسارة) بيجيلك
      إشعار وزرار تعدّل سعر المركز ده على طول (أسعار المركز الخاصة).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var bypass = false;

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n, d) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 0 : d }); }
  function money(n) { var c = (S().currency || 'جنيه'); return num(n) + ' ' + (c === 'جنيه' ? 'ج' : c); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function diff(a, b) { return Math.round((pd(b) - pd(a)) / 86400000); }
  function user() { var u = (typeof currentUser !== 'undefined' && currentUser) || {}; return u; }
  function isAdmin() { return user().role === 'admin'; }
  function rules() { return window.AXRules ? AXRules.get() : { creditBlock: true, blockOverdueDays: 60, minMargin: 5 }; }
  function norm(s) { return (typeof normalizeArabic === 'function') ? normalizeArabic(s) : String(s || '').toLowerCase().trim(); }
  function cust(cid) { return A('customers').find(function (c) { return c.id === cid; }) || null; }
  function dd(n) { n = Math.abs(n); return n === 1 ? 'يوم' : n === 2 ? 'يومين' : (n <= 10 ? n + ' أيام' : n + ' يوم'); }

  /* ════════ 1 · credit ════════ */
  function oldestUnpaid(cid) {
    var o = null;
    A('issuances').forEach(function (i) { if (i.customerId === cid && N(i.total) - N(i.paid) > 0.5 && i.date && (!o || i.date < o)) o = i.date; });
    A('invoices').forEach(function (v) { if (v.customerId === cid && !v.sourceIssuanceId && !v.sourceIssuance && N(v.total) - N(v.paid) > 0.5 && v.date && (!o || v.date < o)) o = v.date; });
    return o;
  }
  function state(cid, debt) {
    var c = cust(cid), R = rules(), out = { block: false, why: [] };
    if (!c || !R.creditBlock) return out;
    var limit = N(c.creditLimit), bal = N(c.balance);
    if (limit > 0 && debt > 0.5 && bal + debt > limit + 0.5)
      out.why.push('هيعدّي حد الائتمان (' + money(limit) + ') — عليه ' + money(bal) + ' والصرف ده ' + money(debt));
    var old = oldestUnpaid(cid), age = old ? diff(old, today()) : 0;
    if (old && age >= R.blockOverdueDays && debt > 0.5) out.why.push('عليه فلوس متأخرة من ' + dd(age) + ' (أكتر من ' + R.blockOverdueDays + ' يوم)');
    out.block = out.why.length > 0; out.c = c; out.debt = debt;
    return out;
  }
  function excepted(cid) {
    var since = Date.now() - 24 * 3600e3;
    var l = (window.AXReq && AXReq.list) ? AXReq.list() : (S()._requests || []);
    return l.some(function (r) { return r.credit && r.credit.cid === cid && r.status === 'approved' && N(r.decidedAt) > since; });
  }
  function pendingAsk(cid) {
    var l = (window.AXReq && AXReq.list) ? AXReq.list() : (S()._requests || []);
    return l.find(function (r) { return r.credit && r.credit.cid === cid && r.status === 'pending' && r.by && r.by.id === user().id; }) || null;
  }
  function ask(cid, amt) {
    var c = cust(cid); if (!c) return;
    if (pendingAsk(cid)) { T('طلب الاستثناء متبعت ومستني المدير', 'info'); return; }
    var st = state(cid, amt), list = S()._requests || (S()._requests = []);
    var no = list.reduce(function (m, x) { return Math.max(m, x.no || 0); }, 0) + 1;
    var u = user();
    list.push({ id: 'rq_' + ((typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10)), no: no, type: 'idea', status: 'pending',
      title: 'استثناء حد ائتمان — ' + c.name, note: st.why.join(' · ') + ' · قيمة الصرف ' + money(amt), items: [],
      by: { id: u.id || '', name: u.name || '', role: u.role || '' }, at: Date.now(), date: today(), credit: { cid: cid, amt: Math.round(amt) } });
    DB.save();
    try { if (window.AXReq && AXReq.badge) AXReq.badge(); } catch (e) {}
    T('اتبعت طلب الاستثناء #' + no + ' للمدير — لما يوافق تقدر تكمّل الصرف', 'success', 5000);
    var b = document.getElementById('axc-block'); if (b) b.querySelector('.axc-acts').innerHTML = '<span class="axc-wait">مستني موافقة المدير…</span>';
  }
  function banner(form, st, retry) {
    var old = document.getElementById('axc-block'); if (old) old.remove();
    var acts = isAdmin()
      ? '<button type="button" class="btn btn-primary" id="axc-go">كمّل الصرف برضه</button>'
      : (pendingAsk(st.c.id) ? '<span class="axc-wait">طلب الاستثناء مستني موافقة المدير…</span>'
        : '<button type="button" class="btn btn-primary" id="axc-ask">اطلب استثناء من المدير</button>');
    form.insertAdjacentHTML('afterbegin', '<div class="axc-block" id="axc-block" role="alert"><b>الصرف واقف للمركز ده</b><ul>' +
      st.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul><div class="axc-acts">' + acts + '</div></div>');
    var go = document.getElementById('axc-go'); if (go) go.onclick = function () { bypass = true; try { retry(); } finally { bypass = false; } };
    var as = document.getElementById('axc-ask'); if (as) as.onclick = function () { ask(st.c.id, st.debt); };
    var body = form.closest('.modal-body') || form; try { body.scrollTop = 0; } catch (e) {}
  }
  function guard(name, ctx) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig._axc) return;
    var w = function () {
      var self = this, args = arguments;
      if (bypass) return orig.apply(self, args);
      var c = null; try { c = ctx(); } catch (e) { c = null; }
      if (!c || !c.cid) return orig.apply(self, args);
      var st = state(c.cid, c.debt);
      if (!st.block || excepted(c.cid)) return orig.apply(self, args);
      banner(c.form, st, function () { orig.apply(self, args); });
      T('الصرف واقف — شوف السبب فوق', 'warning');
    };
    w._axc = 1; window[name] = w;
  }
  guard('saveIssuance', function () {
    var f = document.getElementById('iss-form'); if (!f) return null;
    var cid = (document.getElementById('iss-form-customer') || {}).value;
    var cart = (typeof _issuanceCart !== 'undefined' && Array.isArray(_issuanceCart)) ? _issuanceCart : [];
    var tot = cart.reduce(function (s, it) { return s + N(it.total); }, 0);
    var pp = (document.getElementById('iss-form-product') || {}).value, q = N((document.getElementById('iss-qty') || {}).value), pr = N((document.getElementById('iss-price') || {}).value);
    if (pp && q > 0) tot += q * pr;
    return { form: f, cid: cid, debt: Math.max(0, tot - N((document.getElementById('iss-paid') || {}).value)) };
  });
  guard('saveInvoice', function () {
    var f = document.getElementById('invoice-form'); if (!f) return null;
    var cid = (f.querySelector('[name="customerId"]') || {}).value, t = document.getElementById('t-total');
    return { form: f, cid: cid, debt: Math.max(0, N(t && t.dataset.value) - N((document.getElementById('invoice-paid') || {}).value)) };
  });

  /* ════════ 2 · margins ════════ */
  function lastCosts() {
    var byId = {}, byName = {}, prods = A('products');
    var nameToId = {}; prods.forEach(function (p) { nameToId[norm(p.name)] = p.id; });
    A('expenses').filter(function (e) { return e.kind === 'purchase'; })
      .sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')) || N(a.createdAt) - N(b.createdAt); })
      .forEach(function (e) {
        (e.items || []).forEach(function (it) {
          var pid = it.productId || nameToId[norm(it.name || it.productName)], price = N(it.price);
          if (pid && price > 0) byId[pid] = { cost: price, date: e.date, sup: e.supplierName || '' };
        });
      });
    prods.forEach(function (p) { if (!byId[p.id] && N(p.cost) > 0) byId[p.id] = { cost: N(p.cost), date: '', sup: '' }; });
    return byId;
  }
  function list() {
    var R = rules(), min = R.minMargin, costs = lastCosts(), cut = (function () { var d = pd(today()); d.setDate(d.getDate() - 120); return d.toISOString().slice(0, 10); })();
    var last = {};
    function put(cid, pid, date, price) {
      if (!cid || !pid || !(N(price) > 0) || String(date || '') < cut) return;
      var k = cid + '|' + pid; if (!last[k] || String(date) >= last[k].date) last[k] = { cid: cid, pid: pid, date: String(date), price: N(price) };
    }
    A('issuances').forEach(function (i) { put(i.customerId, i.productId, i.date, i.unitPrice); });
    A('invoices').forEach(function (v) { if (v.sourceIssuanceId || v.sourceIssuance) return; (v.items || []).forEach(function (it) { put(v.customerId, it.productId, v.date, it.price); }); });
    var prods = {}; A('products').forEach(function (p) { prods[p.id] = p; });
    var out = [];
    Object.keys(last).forEach(function (k) {
      var x = last[k], c = cust(x.cid), p = prods[x.pid], k2 = costs[x.pid]; if (!c || !p || !k2) return;
      var custom = c.customPrices && N(c.customPrices[x.pid]) > 0 ? N(c.customPrices[x.pid]) : 0;
      var price = custom || x.price;            // the price they'll be charged next time
      var m = (price - k2.cost) / price * 100;
      if (m < min) out.push({ c: c, p: p, price: price, cost: k2.cost, margin: m, date: x.date, costDate: k2.date, sup: k2.sup, loss: price < k2.cost,
        suggest: Math.ceil(k2.cost / (1 - min / 100) * 2) / 2 });
    });
    return out.sort(function (a, b) { return a.margin - b.margin; });
  }
  function fix(cid, pid) {
    var x = list().find(function (r) { return r.c.id === cid && r.p.id === pid; });
    var c = cust(cid), p = A('products').find(function (q) { return q.id === pid; }); if (!c || !p) return;
    var price = x ? x.price : N((c.customPrices || {})[pid]) || N(p.price), cost = x ? x.cost : N(p.cost), sug = x ? x.suggest : price;
    openModal('تعديل سعر ' + esc(p.name) + ' لـ ' + esc(c.name),
      '<div class="axm-fix"><div class="axm-k"><div><em>سعره دلوقتي</em><b>' + num(price, 2) + '</b></div><div><em>آخر سعر شراء</em><b>' + num(cost, 2) + '</b></div><div><em>الهامش</em><b class="' + (price < cost ? 't-bad' : 't-warn') + '">' + num((price - cost) / (price || 1) * 100, 1) + '%</b></div></div>' +
      (x && x.sup ? '<p class="axm-note">آخر شراء من ' + esc(x.sup) + (x.costDate ? ' يوم ' + esc(x.costDate) : '') + '</p>' : '') +
      '<div class="form-group"><label for="axm-new">السعر الجديد للمركز ده</label><input class="form-control" type="number" step="0.5" min="0" id="axm-new" value="' + sug + '"></div>' +
      '<p class="axm-note">المقترح ' + num(sug, 2) + ' = هامش ' + rules().minMargin + '%. السعر ده بيتكتب لوحده في الصرف والفواتير الجاية للمركز ده بس.</p></div>',
      '<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="AXMargin.save(\'' + cid + '\',\'' + pid + '\')">حفظ السعر</button>');
  }
  function save(cid, pid) {
    var v = N((document.getElementById('axm-new') || {}).value), c = cust(cid);
    if (!c || !(v > 0)) { T('اكتب سعر صحيح', 'error'); return; }
    c.customPrices = Object.assign({}, c.customPrices || {}); c.customPrices[pid] = v;
    DB.save(); closeModal(); T('اتعدّل سعر ' + c.name + ' ✓');
    try { if (typeof updateNotifBadge === 'function') updateNotifBadge(); } catch (e) {}
    if (document.getElementById('axm-list')) open();
  }
  function open() {
    var l = list(), min = rules().minMargin;
    openModal('مراجعة أسعار المراكز',
      '<p class="ax-modal-lead">المراكز اللي سعرها بقى بخسارة أو هامشها أقل من ' + min + '% بعد آخر سعر شراء من المورد.</p>' +
      (l.length ? '<ul class="axm-list" id="axm-list">' + l.map(function (x) {
        return '<li class="' + (x.loss ? 'loss' : '') + '"><div><b>' + esc(x.c.name) + '</b><span>' + esc(x.p.name) + ' · بيشتري بـ ' + num(x.price, 2) + ' والشراء ' + num(x.cost, 2) + '</span></div>' +
          '<em>' + num(x.margin, 1) + '%</em><button type="button" onclick="AXMargin.fix(\'' + x.c.id + '\',\'' + x.p.id + '\')">عدّل</button></li>';
      }).join('') + '</ul>' : '<p class="axm-ok">كل الأسعار فوق الهامش ✓</p>'),
      '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>', 'large');
  }

  /* notifications (notify.js reads window.AXNSources) */
  (window.AXNSources = window.AXNSources || []).push(function () {
    try { if (typeof can === 'function' && !(can('customers') || can('inventory'))) return []; } catch (e) {}
    return list().slice(0, 10).map(function (x) {
      return { id: 'mg:' + x.c.id + ':' + x.p.id, sig: Math.round(x.cost * 2) + '|' + Math.round(x.price * 2), cat: 'stock', sev: x.loss ? 3 : 2, ic: 'trend',
        title: x.c.name + ' — ' + x.p.name, sub: (x.loss ? 'بيبيع بخسارة: ' : 'هامش ' + num(x.margin, 1) + '% بس: ') + 'سعره ' + num(x.price, 2) + ' وآخر شراء ' + num(x.cost, 2),
        amt: num(x.margin, 1) + '%', tag: x.loss ? 'سعر بخسارة' : 'هامش قليل', up: x.loss ? true : undefined,
        go: function () { open(); }, acts: [{ l: 'عدّل السعر', pri: 1, fn: function () { fix(x.c.id, x.p.id); } }, { l: 'كل الأسعار', fn: function () { open(); } }] };
    });
  });

  window.AXCredit = { state: state, excepted: excepted, ask: ask, oldestUnpaid: oldestUnpaid };
  window.AXMargin = { list: list, open: open, fix: fix, save: save, costs: lastCosts };
})();

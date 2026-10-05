/* ════════════════════════════════════════════════════════════════════
   ERP · طلب الشراء الذكي — تبويب داخل «مخزوني وجرد»
   ------------------------------------------------------------------
   · من معدل السحب (AXStock.model): كل صنف بيخلص إمتى، ولازم تطلب
     إمتى وكام عشان يكفيك فترة التوريد + شهر
   · أرخص مورد من قوائم أسعار الموردين (أو آخر مورد اشتريت منه)
   · طلب شراء لكل مورد: طباعة / واتساب للمورد / «اتستلم» → وارد للمخزن
     بحركة «استلام طلب شراء #n» + فاتورة شراء آجل عند المورد
   Stored in settings._po (orders) and settings._poLead (supply days)
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var COVER = 30, SAFETY = 7;
  var ui = { pick: {}, qty: {}, sup: {} };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); if (!Array.isArray(d[k])) d[k] = []; return d[k]; }
  function list() { var s = S(); if (!Array.isArray(s._po)) s._po = []; return s._po; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(Number(n || 0)); } catch (e) {} return num(n); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function today() { return lds(new Date()); }
  function dmy(ds) { if (!ds) return ''; var p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function me() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || ''; }
  function lead() { var v = Number(S()._poLead); return v > 0 ? v : 7; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim(); }
  function phoneOf(p) { try { return typeof normalizeEgyptianPhone === 'function' ? normalizeEgyptianPhone(p) : String(p || '').replace(/\D/g, ''); } catch (e) { return ''; } }

  /* cheapest supplier price for a product (price lists), else the last one we bought it from */
  function bestSupplier(p) {
    var n = norm(p.name), best = null;
    A('suppliers').forEach(function (s) {
      (s.priceList || []).forEach(function (it) {
        var m = norm(it.name); if (!m || !n) return;
        if (m === n || m.indexOf(n) >= 0 || n.indexOf(m) >= 0) {
          var pr = Number(it.price) || 0;
          if (pr > 0 && (!best || pr < best.price)) best = { sid: s.id, name: s.name, price: pr, from: 'list' };
        }
      });
    });
    if (best) return best;
    var last = A('expenses').filter(function (e) { return e.kind === 'purchase' && (e.items || []).some(function (it) { return norm(it.name) === n || it.productId === p.id; }); })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0];
    if (last) {
      var it = (last.items || []).find(function (x) { return norm(x.name) === n || x.productId === p.id; }) || {};
      return { sid: last.supplierId, name: last.supplierName || '', price: Number(it.price) || Number(p.cost) || 0, from: 'last' };
    }
    return { sid: '', name: '', price: Number(p.cost) || 0, from: 'cost' };
  }

  function suggestions() {
    if (!window.AXStock || !AXStock.model) return [];
    var L = lead(), out = [];
    AXStock.model().items.forEach(function (it) {
      var need = 0, why = '', lvl = '';
      if (it.avg > 0) {
        var target = it.avg * (L + COVER);
        need = Math.ceil(target - Math.max(0, it.bal));
        if (it.cover < L) { lvl = 'urgent'; why = 'هيخلص قبل ما الطلب يوصل'; }
        else if (it.cover < L + SAFETY) { lvl = 'order'; why = 'اطلب دلوقتي'; }
        else if (it.cover < L + SAFETY + 14) { lvl = 'soon'; why = 'قرّب'; }
      } else if (it.belowMin) { need = Math.ceil(it.min * 2 - Math.max(0, it.bal)); lvl = 'order'; why = 'تحت الحد الأدنى'; }
      if (!lvl || need <= 0) return;
      var sup = bestSupplier(it.p);
      out.push({ it: it, need: need, lvl: lvl, why: why, sup: sup });
    });
    var rank = { urgent: 0, order: 1, soon: 2 };
    return out.sort(function (a, b) { return rank[a.lvl] - rank[b.lvl] || a.it.cover - b.it.cover; });
  }

  var host = null;
  function render(h) {
    if (h) host = h;
    if (!host || !host.isConnected) host = document.getElementById('po-root');
    if (!host) return;
    var sg = suggestions(), L = lead();
    sg.forEach(function (s) {
      var asked = window.AXReq && AXReq.pendingFor && AXReq.pendingFor(s.it.id);
      if (ui.pick[s.it.id] === undefined) ui.pick[s.it.id] = s.lvl !== 'soon' && !asked;
      if (ui.qty[s.it.id] === undefined) ui.qty[s.it.id] = s.need;
      if (ui.sup[s.it.id] === undefined) ui.sup[s.it.id] = s.sup.sid || '';
    });
    var picked = sg.filter(function (s) { return ui.pick[s.it.id]; });
    var est = picked.reduce(function (t, s) { return t + (Number(ui.qty[s.it.id]) || 0) * s.sup.price; }, 0);
    var sups = A('suppliers'), orders = list().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var openO = orders.filter(function (o) { return o.status !== 'received' && o.status !== 'cancelled'; });
    var urgent = sg.filter(function (s) { return s.lvl === 'urgent'; }).length;

    host.innerHTML =
      '<section class="cus-hero po-hero">' +
        '<div class="cus-hero-t"><span>محتاج تطلب</span><b>' + sg.filter(function (s) { return s.lvl !== 'soon'; }).length + ' <i>صنف</i></b>' +
          '<small>على معدل السحب: يكفيك فترة التوريد (' + L + ' يوم) + ' + COVER + ' يوم شغل. ' + (urgent ? urgent + ' صنف هيخلص قبل ما الطلب يوصل.' : '') + '</small></div>' +
        '<div class="cus-hero-figs">' +
          '<div><span>متختار</span><b>' + picked.length + '</b><small>صنف</small></div>' +
          '<div><span>التكلفة التقريبية</span><b>' + money(est) + '</b><small>بأرخص سعر</small></div>' +
          '<div><span>طلبات مفتوحة</span><b>' + openO.length + '</b><small>مستنية الاستلام</small></div>' +
        '</div>' +
        '<label class="po-lead"><span>فترة التوريد</span><input type="number" min="1" max="90" value="' + L + '" onchange="AXPO.setLead(this.value)"><em>يوم</em></label>' +
      '</section>' +
      pendingHtml() +
      (sg.length ? '<section class="po-card"><header><b>الاقتراحات</b><span>علّم الأصناف وعدّل الكمية أو المورد، وبعدين ابعت الطلب — بيروح للمدير في «الطلبات والمقترحات»، ولما يوافق بيتعمل طلب شراء لكل مورد</span></header>' +
        '<div class="po-tbl-w"><table class="po-tbl"><thead><tr><th></th><th>الصنف</th><th>الرصيد</th><th>بيخلص</th><th>الكمية</th><th>المورد</th><th>السعر</th></tr></thead><tbody>' +
        sg.map(function (s) {
          var it = s.it, cov = !isFinite(it.cover) ? '—' : it.cover < 1 ? 'النهارده' : 'بعد ' + Math.floor(it.cover) + ' يوم';
          return '<tr class="l-' + s.lvl + '"><td><input type="checkbox" ' + (ui.pick[it.id] ? 'checked' : '') + ' onchange="AXPO.pick(\'' + it.id + '\',this.checked)"></td>' +
            '<td><b>' + esc(it.name) + '</b>' + (window.AXReq && AXReq.pendingFor && AXReq.pendingFor(it.id) ? '<em class="po-asked">متطلب ومستني الموافقة</em>' : '') + '<small>' + s.why + ' · بيتسحب ' + num(Math.round(it.avg * 10) / 10) + ' ' + esc(it.unit) + '/يوم</small></td>' +
            '<td class="n">' + num(it.bal) + '</td><td class="n"><em class="po-c ' + s.lvl + '">' + cov + '</em></td>' +
            '<td><input class="po-q" type="number" min="1" value="' + (ui.qty[it.id] || '') + '" onchange="AXPO.qty(\'' + it.id + '\',this.value)"> <small>' + esc(it.unit) + '</small></td>' +
            '<td><select class="po-s" onchange="AXPO.sup(\'' + it.id + '\',this.value)"><option value="">— مورد —</option>' + sups.map(function (x) {
              return '<option value="' + x.id + '"' + (ui.sup[it.id] === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
              (s.sup.from === 'list' ? '<small>الأرخص في قوائم الأسعار</small>' : s.sup.from === 'last' ? '<small>آخر مرة اشترينا منه</small>' : '') + '</td>' +
            '<td class="n">' + (s.sup.price ? money(s.sup.price) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<footer class="po-send"><input class="form-control" id="po-note" placeholder="ملاحظة للمدير (اختياري)"><button class="btn btn-primary" onclick="AXPO.make()"' + (picked.length ? '' : ' disabled') + '>ابعت طلب الشراء للمدير (' + picked.length + ')</button></footer></section>'
        : '<div class="skh-empty"><b>مفيش أصناف محتاجة طلب دلوقتي</b><span>كل صنف بيكفي فترة التوريد + أسبوع على الأقل (على معدل السحب)</span></div>') +
      (orders.length ? '<section class="po-card"><header><b>طلبات الشراء</b><span>' + orders.length + ' طلب</span></header><ul class="po-orders">' + orders.slice(0, 30).map(orderRow).join('') + '</ul></section>' : '');
  }
  function pendingHtml() {
    if (!window.AXReq || !AXReq.list) return '';
    var rs = AXReq.list().filter(function (r) { return r.type === 'po' && r.status === 'pending'; });
    if (!rs.length) return '';
    return '<section class="po-card po-wait"><header><b>مستني موافقة المدير</b><span>' + rs.length + ' طلب في «الطلبات والمقترحات»</span></header><ul class="po-orders">' +
      rs.map(function (r) {
        var t = (r.items || []).reduce(function (a, x) { return a + (Number(x.qty) || 0) * (Number(x.price) || 0); }, 0);
        return '<li><div><b>طلب شراء #' + r.no + ' — ' + esc((r.by && r.by.name) || '') + '</b><span>' + (r.items || []).map(function (x) { return esc(x.name) + ' × ' + num(x.qty); }).join('، ') + (t ? ' · ' + money(t) : '') + '</span></div>' +
          '<em>مستني الموافقة</em><div class="po-o-act"><button class="pri" onclick="navigate(\'requests\')">افتح</button></div></li>';
      }).join('') + '</ul></section>';
  }
  var STL = { draft: 'مسودة', sent: 'اتبعت للمورد', received: 'اتستلم ✓', cancelled: 'اتلغى' };
  function total(o) { return (o.items || []).reduce(function (t, x) { return t + (Number(x.qty) || 0) * (Number(x.price) || 0); }, 0); }
  function orderRow(o) {
    return '<li class="st-' + o.status + '"><div><b>طلب #' + o.no + ' — ' + esc(o.supplierName || 'من غير مورد') + '</b><span>' + (o.items || []).length + ' صنف · ' + money(total(o)) + ' · ' + dmy(o.date) + (o.requestNo ? ' · من الطلب #' + o.requestNo : '') + '</span></div>' +
      '<em>' + STL[o.status] + '</em><div class="po-o-act">' +
      '<button onclick="AXPO.print(\'' + o.id + '\')">طباعة</button>' +
      (o.status !== 'received' && o.status !== 'cancelled' ? '<button onclick="AXPO.whatsapp(\'' + o.id + '\')">واتساب</button><button class="pri" onclick="AXPO.receive(\'' + o.id + '\')">اتستلم</button><button onclick="AXPO.cancel(\'' + o.id + '\')">إلغاء</button>' : '') +
      '</div></li>';
  }

  /* 4.11 · the selection goes to the admin as a request («الطلبات والمقترحات»);
     the purchase orders are made when he approves */
  function picked() {
    return suggestions().filter(function (s) { return ui.pick[s.it.id] && Number(ui.qty[s.it.id]) > 0; }).map(function (s) {
      var sid = ui.sup[s.it.id] || '';
      var sup = A('suppliers').find(function (x) { return x.id === sid; });
      var price = s.sup.sid === sid ? s.sup.price : (function () { var b = null; ((sup && sup.priceList) || []).forEach(function (it) { var m = norm(it.name), n = norm(s.it.name); if (m && (m === n || m.indexOf(n) >= 0 || n.indexOf(m) >= 0)) b = Number(it.price) || b; }); return b || Number(s.it.p.cost) || 0; })();
      return { productId: s.it.id, name: s.it.name, unit: s.it.unit, qty: Number(ui.qty[s.it.id]), price: price, supplierId: sid, supplierName: sup ? sup.name : '', bal: s.it.bal, why: s.why };
    });
  }
  function make() {
    var items = picked();
    if (!items.length) { T('علّم صنف واحد على الأقل', 'warning'); return; }
    if (window.AXReq && AXReq.create) {
      var r = AXReq.create({ type: 'po', items: items, note: ((document.getElementById('po-note') || {}).value || '').trim() });
      ui.pick = {}; ui.qty = {}; ui.sup = {};
      T('اتبعت طلب الشراء #' + r.no + ' للمدير في «الطلبات والمقترحات»' + ((typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') ? ' — وافق عليه من هناك' : ''), 'success', 6000);
      render();
      return;
    }
    var made = createPOs(items, {});
    ui.pick = {}; ui.qty = {}; ui.sup = {};
    T('اتعمل ' + made.length + ' طلب شراء — اطبعه أو ابعته للمورد واتساب');
    render();
  }
  /* one purchase order per supplier (called when the admin approves a request) */
  function createPOs(items, meta) {
    meta = meta || {};
    var groups = {};
    items.forEach(function (x) { var sid = x.supplierId || ''; (groups[sid] || (groups[sid] = [])).push({ productId: x.productId, name: x.name, unit: x.unit, qty: Number(x.qty) || 0, price: Number(x.price) || 0 }); });
    var made = [];
    Object.keys(groups).forEach(function (sid) {
      var sup = A('suppliers').find(function (x) { return x.id === sid; });
      var no = list().reduce(function (m, x) { return Math.max(m, x.no || 0); }, 0) + 1;
      var o = { id: 'po_' + id(), no: no, supplierId: sid, supplierName: sup ? sup.name : (groups[sid][0] && items.find(function (x) { return (x.supplierId || '') === sid; }) || {}).supplierName || '',
        items: groups[sid], date: today(), status: 'draft', by: meta.by || me(), approvedBy: me(), requestId: meta.requestId || '', requestNo: meta.requestNo || null, createdAt: Date.now() };
      list().push(o); made.push(o);
    });
    DB.save();
    return made;
  }
  function find(oid) { return list().find(function (x) { return x.id === oid; }); }
  function text(o) {
    var s = S(), L = ['السلام عليكم ' + (o.supplierName || ''), 'طلب شراء #' + o.no + ' من *' + (s.companyName || 'نظام الحسابات') + '* — ' + dmy(o.date) + ':', ''];
    (o.items || []).forEach(function (x, i) { L.push((i + 1) + '. ' + x.name + ' — ' + num(x.qty) + ' ' + (x.unit || '')); });
    L.push('', 'ياريت تأكدوا الأسعار وميعاد التسليم 🙏');
    if (s.companyPhone) L.push('📞 ' + s.companyPhone);
    return L.join('\n');
  }
  function whatsapp(oid) {
    var o = find(oid); if (!o) return;
    var sup = A('suppliers').find(function (x) { return x.id === o.supplierId; }), ph = sup ? phoneOf(sup.phone) : '';
    window.open('https://wa.me/' + (ph || '') + '?text=' + encodeURIComponent(text(o)), '_blank');
    if (o.status === 'draft') { o.status = 'sent'; o.sentAt = Date.now(); DB.save(); render(); }
  }
  function print(oid) {
    var o = find(oid); if (!o) return;
    var s = S(), w = window.open('', '_blank'); if (!w) { T('المتصفح منع نافذة الطباعة', 'error'); return; }
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طلب شراء #' + o.no + '</title><style>@page{size:A4;margin:14mm}body{font-family:"Zain","IBM Plex Sans Arabic","Cairo",Tahoma,sans-serif;color:#000}h1{margin:0;font-size:22px}h2{margin:4px 0 14px;font-size:14px;font-weight:600;color:#444}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #000;padding:7px;text-align:right}th{background:#eee}.sig{display:flex;justify-content:space-between;margin-top:40px;font-size:13px}</style></head><body>' +
      '<h1>' + esc(s.companyName || 'نظام الحسابات') + '</h1><h2>طلب شراء #' + o.no + ' — ' + dmy(o.date) + ' — المورد: ' + esc(o.supplierName || '—') + '</h2>' +
      '<table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>السعر المتوقع</th><th>الإجمالي</th></tr></thead><tbody>' +
      (o.items || []).map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td>' + num(x.qty) + '</td><td>' + esc(x.unit || '') + '</td><td>' + num(x.price) + '</td><td>' + num(x.qty * x.price) + '</td></tr>'; }).join('') +
      '<tr><th colspan="5">الإجمالي التقريبي</th><th>' + num(total(o)) + '</th></tr></tbody></table>' +
      '<div class="sig"><span>توقيع المسؤول: ................</span><span>اعتماد المورد: ................</span></div></body></html>');
    w.document.close(); setTimeout(function () { w.print(); }, 300);
  }
  function receive(oid) {
    var o = find(oid); if (!o) return;
    openModal('استلام طلب شراء #' + o.no,
      '<p class="ax-modal-lead">عدّل الكمية والسعر حسب اللي وصل فعلاً. الكمية هتدخل المخزن بحركة «استلام طلب شراء #' + o.no + '»، وهتتعمل فاتورة شراء آجل عند ' + esc(o.supplierName || 'المورد') + '.</p>' +
      '<div class="po-tbl-w"><table class="po-tbl"><thead><tr><th>الصنف</th><th>الكمية اللي وصلت</th><th>السعر</th></tr></thead><tbody>' +
      (o.items || []).map(function (x, i) {
        return '<tr><td><b>' + esc(x.name) + '</b></td><td><input class="po-q" type="number" min="0" step="any" data-i="' + i + '" data-k="qty" value="' + x.qty + '"> <small>' + esc(x.unit || '') + '</small></td>' +
          '<td><input class="po-q" type="number" min="0" step="any" data-i="' + i + '" data-k="price" value="' + (x.price || 0) + '"></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (o.supplierId ? '<label class="dbt-check" style="margin-top:10px"><input type="checkbox" id="po-inv" checked><span>اعمل فاتورة شراء آجل عند المورد بالمبلغ</span></label>' : ''),
      '<button class="btn btn-primary" onclick="AXPO.doReceive(\'' + o.id + '\')">تأكيد الاستلام</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function doReceive(oid) {
    var o = find(oid); if (!o || o.status === 'received') { closeModal(); return; }
    var got = (o.items || []).map(function (x) { return Object.assign({}, x); });
    document.querySelectorAll('.modal .po-q[data-i]').forEach(function (inp) { var g = got[+inp.dataset.i]; if (g) g[inp.dataset.k] = Number(inp.value) || 0; });
    got = got.filter(function (x) { return x.qty > 0; });
    if (!got.length) { T('مفيش كميات', 'warning'); return; }
    var d = D(), ref = 'استلام طلب شراء #' + o.no;
    got.forEach(function (x) {
      var p = A('products').find(function (q) { return q.id === x.productId; }); if (!p) return;
      p.quantity = Number(p.quantity || 0) + x.qty;
      A('stockMoves').push({ id: 'sm_' + id(), productId: p.id, type: 'in', quantity: x.qty, date: today(), note: ref, reference: ref, createdAt: Date.now() });
    });
    var mkInv = o.supplierId && (document.getElementById('po-inv') || {}).checked;
    if (mkInv) {
      if (!d.counters) d.counters = {};
      d.counters.purchase = (d.counters.purchase || 1000) + 1;
      var amount = got.reduce(function (t, x) { return t + x.qty * x.price; }, 0);
      var pur = { id: 'pur_' + id(), kind: 'purchase', supplierId: o.supplierId, supplierName: o.supplierName, number: d.counters.purchase, date: today(),
        description: 'طلب شراء #' + o.no + ': ' + got.map(function (x) { return x.name; }).join('، '), amount: amount, paymentMethod: 'credit',
        items: got.map(function (x) { return { name: x.name, qty: x.qty, price: x.price, unit: x.unit, productId: x.productId }; }), attachment: null, poId: o.id, createdAt: Date.now() };
      A('expenses').push(pur);
      o.purchaseId = pur.id;
    }
    o.status = 'received'; o.receivedAt = Date.now(); o.received = got;
    DB.save(); closeModal();
    T('اتستلم الطلب #' + o.no + ' ودخل المخزن' + (mkInv ? ' + فاتورة شراء آجل' : ''));
    if (typeof renderStockHub === 'function') renderStockHub(); else render();
  }
  function cancel(oid) {
    var o = find(oid); if (!o) return;
    confirmDialog('تلغي طلب الشراء #' + o.no + '؟', function () { o.status = 'cancelled'; DB.save(); render(); });
  }

  window.AXPO = {
    render: render, suggestions: suggestions, make: make, createPOs: createPOs, picked: picked, whatsapp: whatsapp, print: print, receive: receive, doReceive: doReceive, cancel: cancel,
    pick: function (k, v) { ui.pick[k] = !!v; render(); }, qty: function (k, v) { ui.qty[k] = Math.max(0, Math.round(Number(v) || 0)); render(); },
    sup: function (k, v) { ui.sup[k] = v; render(); },
    setLead: function (v) { var n = Math.max(1, Math.min(90, Math.round(Number(v) || 7))); S()._poLead = n; DB.save(); render(); },
    openCount: function () { return list().filter(function (o) { return o.status === 'draft' || o.status === 'sent'; }).length; },
    needCount: function () { try { return suggestions().filter(function (s) { return s.lvl !== 'soon'; }).length; } catch (e) { return 0; } }
  };
})();

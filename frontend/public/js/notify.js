/* ════════════════════════════════════════════════════════════════════
   ERP · مركز الإشعارات (4.12)
   ------------------------------------------------------------------
   بدل الشاشة الطويلة القديمة:
   · درج جانبي على الكمبيوتر، وشاشة كاملة على الموبايل
   · تبويبات: الكل · عاجل · التحصيل · المراكز · المخزون · الموردين · الطلبات
   · كل إشعار ليه زرار يعمل الحاجة على طول (تحصيل · واتساب · اتصال ·
     اطلب شراء · صرف ورق · سداد …) + «بكرة» يأجّله + ✓ مقروء
   · تحصيل متجمّع لكل عميل (التوريدات اللي فات معادها + أيام بلا سداد
     حسب «قواعد البيع والتنبيهات»)، مراكز معادها في السحب، أصناف هتخلص
     قبل ما الطلب يوصل، صلاحية، أصناف راكدة، فواتير موردين متأخرة
     (بالمتبقي الحقيقي)، شيكات، طلبات وموافقات
   · المقروء والمؤجّل محفوظين لكل مستخدم على الجهاز ده
   · رقم الجرس = الإشعارات المهمة والعاجلة اللي لسه متقرتش
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { tab: 'all', snoozed: false, open: false };
  var acts = [], _st = null, _bt = null, lastUrgent = -1;

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function money(n) { var c = (S().currency || 'جنيه'); return num(n) + ' ' + (c === 'جنيه' ? 'ج' : c); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function ds(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addD(s, n) { var d = pd(s); d.setDate(d.getDate() + n); return ds(d); }
  function diff(a, b) { return Math.round((pd(b) - pd(a)) / 86400000); }
  function dd(n) { n = Math.abs(n); return n === 1 ? 'يوم' : n === 2 ? 'يومين' : (n <= 10 ? n + ' أيام' : n + ' يوم'); }
  function user() { var u = (typeof currentUser !== 'undefined' && currentUser) || {}; return u; }
  function isAdmin() { return user().role === 'admin'; }
  function canGo(p) { try { return typeof can !== 'function' || can(p); } catch (e) { return false; } }
  function call(fn) { try { return fn(); } catch (e) { console.warn('[notify]', e); return null; } }
  function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  /* ── read / snooze (per user, this device) ── */
  function skey() { return 'ax_ntf_' + (user().id || 'x'); }
  function st() {
    if (_st && _st.k === skey()) return _st;
    var o = {}; try { o = JSON.parse(localStorage.getItem(skey()) || '{}') || {}; } catch (e) { o = {}; }
    _st = { k: skey(), r: o.r || {}, z: o.z || {} };
    return _st;
  }
  function persist(live) {
    var s = st();
    if (live) {   // forget entries of notifications that no longer exist
      var ids = {}; live.forEach(function (x) { ids[x.id] = 1; });
      Object.keys(s.r).forEach(function (k) { if (!ids[k]) delete s.r[k]; });
      Object.keys(s.z).forEach(function (k) { if (!ids[k] || s.z[k] <= today()) delete s.z[k]; });
    }
    try { localStorage.setItem(skey(), JSON.stringify({ r: s.r, z: s.z })); } catch (e) {}
  }
  function isRead(x) { return st().r[x.id] === String(x.sig); }
  function isSnoozed(x) { var z = st().z[x.id]; return !!(z && z > today()); }

  /* ── icons ── */
  var I = {
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/></svg>',
    center: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M12 14v3l2 1"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>',
    hour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h14v12H1zM15 9h4l4 4v3h-8"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/></svg>',
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    cheque: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h6M6 14h4M15 14h3"/></svg>',
    task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  var CATS = [['all', 'الكل'], ['urgent', 'عاجل'], ['money', 'التحصيل'], ['centers', 'المراكز'], ['stock', 'المخزون'], ['suppliers', 'الموردين'], ['tasks', 'الطلبات']];

  /* ════════ collect everything worth telling ════════ */
  function collect() {
    var out = [], t = today();
    var R = window.AXRules ? AXRules.get() : { overdueDays: 30, staleDays: 60, expiryWarnDays: 60 };
    var custs = {}; A('customers').forEach(function (c) { custs[c.id] = c; });
    function push(x) { x.acts = x.acts || []; out.push(x); }
    function tel(phone) { return phone ? { l: 'اتصال', fn: function () { location.href = 'tel:' + String(phone).replace(/[^\d+]/g, ''); }, keep: 1 } : null; }

    /* 1 · collections — one card per customer */
    if (canGo('payments')) call(function () {
      var over = (typeof getOverdueIssuances === 'function') ? getOverdueIssuances() : [];
      var byC = {};
      over.forEach(function (i) { var b = byC[i.customerId] || (byC[i.customerId] = { n: 0, amt: 0, max: 0 }); b.n++; b.amt += i.remaining || 0; b.max = Math.max(b.max, i.daysOverdue || 0); });
      var late = window.AXRules ? AXRules.lateCustomers() : [], lm = {};
      late.forEach(function (x) { lm[x.c.id] = x; });
      Object.keys(byC).concat(Object.keys(lm).filter(function (k) { return !byC[k]; })).forEach(function (cid) {
        var c = custs[cid]; if (!c) return;
        var o = byC[cid], l = lm[cid], bal = Number(c.balance) || 0;
        if (bal <= 0.5 && !o) return;
        var sev = (o && o.max >= 7) || (l && l.days >= R.overdueDays * 2) ? 3 : 2, parts = [];
        if (o) parts.push(o.n + ' ' + (o.n === 1 ? 'توريد فات معاده' : 'توريدات فات معادها') + ' · أقدمها من ' + dd(o.max));
        if (l) parts.push(l.lastPay ? 'آخر دفعة من ' + dd(l.days) : 'مدفعش خالص من ' + dd(l.days));
        push({ id: 'col:' + cid, sig: Math.round(Math.max(bal, o ? o.amt : 0) / 50) + '|' + (o ? o.n : 0), cat: 'money', sev: sev, ic: 'money',
          title: c.name, sub: parts.join(' · '), amt: money(Math.max(bal, o ? o.amt : 0)), tag: sev === 3 ? 'تحصيل متأخر' : 'تحصيل',
          go: function () { navigate('payments'); setTimeout(function () { if (typeof openPaymentForm === 'function') openPaymentForm(cid); }, 140); },
          acts: [{ l: 'تحصيل', pri: 1, fn: function () { navigate('payments'); setTimeout(function () { if (typeof openPaymentForm === 'function') openPaymentForm(cid); }, 140); } },
            c.phone && typeof sendDebtReminderWhatsApp === 'function' ? { l: 'واتساب', fn: function () { sendDebtReminderWhatsApp(cid); }, keep: 1 } : null, tel(c.phone)] });
      });
      /* due in the next 7 days */
      var soon = (typeof getDueSoonIssuances === 'function') ? getDueSoonIssuances() : [], sm = {};
      soon.forEach(function (i) { if (byC[i.customerId]) return; var b = sm[i.customerId] || (sm[i.customerId] = { n: 0, amt: 0, d: 99 }); b.n++; b.amt += i.remaining || 0; b.d = Math.min(b.d, i.daysUntil); });
      Object.keys(sm).forEach(function (cid) {
        var c = custs[cid]; if (!c) return; var b = sm[cid];
        push({ id: 'due:' + cid, sig: b.d + '|' + Math.round(b.amt / 50), cat: 'money', sev: b.d <= 1 ? 2 : 1, ic: 'money', title: c.name,
          sub: b.n + ' ' + (b.n === 1 ? 'توريد' : 'توريدات') + ' معاد تحصيلها ' + (b.d === 0 ? 'النهارده' : b.d === 1 ? 'بكرة' : 'بعد ' + dd(b.d)),
          amt: money(b.amt), tag: 'قرّب معاده',
          go: function () { if (typeof viewCustomerStatement === 'function' && canGo('customers')) { navigate('customers'); setTimeout(function () { viewCustomerStatement(cid); }, 140); } else navigate('payments'); },
          acts: [{ l: 'كشف الحساب', fn: function () { navigate('customers'); setTimeout(function () { if (typeof viewCustomerStatement === 'function') viewCustomerStatement(cid); }, 140); } }, tel(c.phone)] });
      });
    });

    /* 2 · cheques */
    if (canGo('cheques') && window.AXCheq && AXCheq.dueSoon) call(function () {
      AXCheq.dueSoon().forEach(function (c) {
        var left = diff(t, c.due), sup = c.dir === 'out';
        push({ id: 'chq:' + c.id, sig: (left < 0 ? 'late' : left) + '|' + c.status, cat: sup ? 'suppliers' : 'money', sev: left < 0 ? 3 : 2, ic: 'cheque',
          title: (sup ? 'شيك لـ ' : 'شيك من ') + (c.partyName || '—') + ' #' + (c.no || ''),
          sub: left < 0 ? 'ميعاده عدّى من ' + dd(left) : left === 0 ? 'ميعاده النهارده' : 'ميعاده ' + (left === 1 ? 'بكرة' : 'بعد ' + dd(left)) + ' (' + c.due + ')',
          amt: money(c.amount), tag: sup ? 'شيك صادر' : 'شيك وارد',
          go: function () { navigate('cheques'); setTimeout(function () { if (AXCheq.view) AXCheq.view(c.id); }, 140); },
          acts: [{ l: 'افتح الشيك', pri: 1, fn: function () { navigate('cheques'); setTimeout(function () { if (AXCheq.view) AXCheq.view(c.id); }, 140); } }] });
      });
    });

    /* 3 · centers due for their usual withdrawal */
    if ((canGo('forecast') || canGo('issuances')) && window.AXFc) call(function () {
      AXFc.reminders().forEach(function (x) {
        var basket = x.basket.slice(0, 2).map(function (b) { return num(b.qty) + ' ' + (b.unit || '') + ' ' + b.name; }).join(' + ');
        push({ id: 'fc:' + x.cid + ':' + x.last, sig: x.st + '|' + (x.call ? x.call.id : ''), cat: 'centers', sev: x.st === 'late' ? 2 : 1, ic: 'center',
          title: x.name, sub: AXFc.label(x) + ' · بيسحب كل ~' + dd(x.gap) + (basket ? ' · عادةً ' + basket : ''),
          amt: x.value ? '≈ ' + money(x.value) : '', tag: x.st === 'late' ? 'متأخر عن عادته' : 'معاده في السحب',
          go: function () { navigate(canGo('forecast') ? 'forecast' : 'issuances'); },
          acts: [x.phone ? { l: 'اتصال', pri: 1, fn: function () { AXFc.call(x.cid); }, keep: 1 } : null,
            x.phone ? { l: 'واتساب', fn: function () { AXFc.wa(x.cid); }, keep: 1 } : null,
            canGo('issuances') ? { l: 'صرف ورق', fn: function () { AXFc.sell(x.cid); } } : null,
            { l: 'سجّل', fn: function () { AXFc.log(x.cid); } }] });
      });
    });

    /* 4 · stock: will run out before the order arrives / below the minimum */
    if (canGo('inventory') || canGo('stock')) call(function () {
      var seen = {}, sg = (window.AXPO && AXPO.suggestions) ? (call(AXPO.suggestions) || []) : [];
      function asked(pid) { return !!(window.AXReq && AXReq.pendingFor && AXReq.pendingFor(pid)); }
      function order(pid) {
        return { l: 'اطلب شراء', pri: 1, fn: function () {
          var before = window.AXReq ? AXReq.list().length : 0;
          if (window.AXReq && canGo('requests')) AXReq.quick(pid);
          if (!window.AXReq || AXReq.list().length === before) { navigate('stock'); setTimeout(function () { if (window.AXStock && AXStock.tab) AXStock.tab('po'); }, 140); }
        } };
      }
      sg.forEach(function (s) {
        if (s.lvl === 'soon') return; var p = s.it.p || {}, pid = s.it.id; seen[pid] = 1;
        var a = asked(pid);
        push({ id: 'stk:' + pid, sig: s.lvl + '|' + (a ? 'a' : ''), cat: 'stock', sev: a ? 1 : (s.lvl === 'urgent' ? 3 : 2), ic: 'box',
          title: s.it.name || p.name || '', sub: s.why + ' · الرصيد ' + num(s.it.bal) + ' ' + (s.it.unit || p.unit || '') + (s.it.cover < 900 && s.it.avg > 0 ? ' (يكفي ~' + dd(Math.max(0, Math.round(s.it.cover))) + ')' : ''),
          amt: 'محتاج ' + num(s.need), tag: a ? 'متطلب ومستني الموافقة' : (s.lvl === 'urgent' ? 'هيخلص' : 'اطلب'),
          go: function () { navigate(canGo('stock') ? 'stock' : 'inventory'); },
          acts: a ? [{ l: 'افتح الطلبات', fn: function () { navigate('requests'); } }] : [order(pid)] });
      });
      A('products').forEach(function (p) {
        if (seen[p.id] || !((Number(p.quantity) || 0) <= (Number(p.minQuantity) || 0)) || !(Number(p.minQuantity) > 0)) return;
        var a = asked(p.id);
        push({ id: 'stk:' + p.id, sig: 'min|' + (a ? 'a' : '') + '|' + ((Number(p.quantity) || 0) <= 0 ? 0 : 1), cat: 'stock', sev: a ? 1 : ((Number(p.quantity) || 0) <= 0 ? 3 : 2), ic: 'box',
          title: p.name, sub: ((Number(p.quantity) || 0) <= 0 ? 'خلص من المخزن' : 'تحت الحد الأدنى') + ' · ' + num(p.quantity) + ' ' + (p.unit || '') + ' من ' + num(p.minQuantity),
          amt: '', tag: a ? 'متطلب ومستني الموافقة' : 'تحت الحد',
          go: function () { navigate(canGo('stock') ? 'stock' : 'inventory'); },
          acts: a ? [{ l: 'افتح الطلبات', fn: function () { navigate('requests'); } }] : [order(p.id)] });
      });
      if (window.AXRules) {
        AXRules.expiringItems().forEach(function (e) {
          var p = e.p;
          push({ id: 'exp:' + p.id + ':' + p.expiryDate, sig: e.expired ? 'x' : (e.left <= 14 ? 'n' : 'w'), cat: 'stock', sev: e.expired ? 3 : (e.left <= 14 ? 2 : 1), ic: 'hour',
            title: p.name, sub: (e.expired ? 'صلاحيته انتهت من ' + dd(e.left) : e.left === 0 ? 'صلاحيته بتنتهي النهارده' : 'صلاحيته بتنتهي بعد ' + dd(e.left)) + ' · فاضل ' + num(p.quantity) + ' ' + (p.unit || ''),
            amt: p.expiryDate, tag: e.expired ? 'منتهي الصلاحية' : 'صلاحية',
            go: function () { navigate('inventory'); }, acts: canGo('issuances') ? [{ l: 'صرّفه', fn: function () { if (typeof openIssuanceForm === 'function') openIssuanceForm(undefined, p.id); } }] : [] });
        });
        AXRules.staleItems().slice(0, 8).forEach(function (s) {
          var p = s.p;
          push({ id: 'stale:' + p.id, sig: Math.floor(s.days / 30), cat: 'stock', sev: 1, ic: 'snow',
            title: p.name, sub: (s.never ? 'متباعش خالص من ' : 'آخر بيع من ') + dd(s.days) + ' · راكد ' + num(p.quantity) + ' ' + (p.unit || ''),
            amt: s.value ? money(s.value) : '', tag: 'صنف راكد', go: function () { navigate('inventory'); }, acts: [] });
        });
      }
    });

    /* 5 · suppliers: purchase invoices past / near their due date (real remaining), balances, price changes */
    if (canGo('suppliers')) call(function () {
      var pm = window.AXPur ? AXPur.paidMap() : {};
      A('expenses').forEach(function (e) {
        if (e.kind !== 'purchase' || e.paymentMethod !== 'credit' || !e.dueDate) return;
        var rem = (Number(e.amount) || 0) - (pm[e.id] || 0); if (rem <= 0.5) return;
        var left = diff(t, e.dueDate); if (left > 7) return;
        push({ id: 'pur:' + e.id, sig: (left < 0 ? 'late' : left) + '|' + Math.round(rem / 50), cat: 'suppliers', sev: left < 0 ? 3 : 2, ic: 'truck',
          title: e.supplierName || 'مورد', sub: 'فاتورة شراء #' + (e.number || '') + ' · ' + (left < 0 ? 'معاد سدادها عدّى من ' + dd(left) : left === 0 ? 'معاد سدادها النهارده' : 'معاد سدادها بعد ' + dd(left)),
          amt: money(rem), tag: left < 0 ? 'سداد متأخر' : 'سداد قرّب',
          go: function () { if (canGo('purchases')) { navigate('purchases'); setTimeout(function () { if (window.AXPur) AXPur.view(e.id); }, 160); } else navigate('suppliers'); },
          acts: [{ l: 'سداد', pri: 1, fn: function () { navigate('suppliers'); setTimeout(function () { if (typeof openSupplierPaymentForm === 'function') openSupplierPaymentForm('', e.supplierId); }, 140); } }] });
      });
      if (typeof supplierMetrics === 'function') {
        A('suppliers').map(function (s) { return { s: s, m: supplierMetrics(s.id) }; }).filter(function (x) { return x.m.balance > 0.5; })
          .sort(function (a, b) { return b.m.balance - a.m.balance; }).slice(0, 5).forEach(function (x) {
            push({ id: 'sup:' + x.s.id, sig: Math.round(x.m.balance / 500), cat: 'suppliers', sev: 1, ic: 'truck', title: x.s.name,
              sub: 'رصيد مستحق ليه' + (x.m.lastPaymentDate ? ' · آخر سداد ' + x.m.lastPaymentDate : ''), amt: money(x.m.balance), tag: 'مستحق للمورد',
              go: function () { navigate('suppliers'); },
              acts: [{ l: 'سداد', fn: function () { navigate('suppliers'); setTimeout(function () { if (typeof openSupplierPaymentForm === 'function') openSupplierPaymentForm('', x.s.id); }, 140); } }] });
          });
      }
      if (typeof getRecentPriceChanges === 'function') {
        getRecentPriceChanges().sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); }).slice(0, 6).forEach(function (pc) {
          var up = pc.diff > 0;
          push({ id: 'pc:' + pc.supplierId + ':' + pc.itemName, sig: Math.round(pc.newPrice), cat: 'suppliers', sev: 1, ic: 'trend',
            title: pc.itemName, sub: pc.supplierName + ' ' + (up ? 'غلّى' : 'رخّص') + ' السعر ' + Math.abs(pc.diff).toFixed(0) + '% · ' + num(pc.oldPrice) + ' ← ' + num(pc.newPrice),
            amt: (up ? '▲ ' : '▼ ') + Math.abs(pc.diff).toFixed(1) + '%', tag: 'تغيير سعر', up: up,
            go: function () { navigate('suppliers'); setTimeout(function () { if (typeof openSupplierPriceList === 'function') openSupplierPriceList(pc.supplierId); }, 140); }, acts: [] });
        });
      }
    });

    /* 6 · requests & approvals */
    call(function () {
      if (isAdmin()) {
        var rq = window.AXReq ? AXReq.list().filter(function (r) { return r.status === 'pending'; }) : [];
        if (rq.length) push({ id: 'rq:pending', sig: rq.map(function (r) { return r.no; }).join(','), cat: 'tasks', sev: 2, ic: 'task',
          title: rq.length + ' ' + (rq.length === 1 ? 'طلب مستني قرارك' : 'طلبات مستنية قرارك'), sub: rq.slice(0, 3).map(function (r) { return '#' + r.no + ' ' + (r.title || '') + (r.by && r.by.name ? ' (' + r.by.name + ')' : ''); }).join(' · '),
          amt: '', tag: 'الطلبات والمقترحات', go: function () { navigate('requests'); }, acts: [{ l: 'افتح', pri: 1, fn: function () { navigate('requests'); } }] });
        var ap = (window.AXApprovals && AXApprovals.pendingCount) ? AXApprovals.pendingCount() : 0;
        if (ap) push({ id: 'apr:pending', sig: ap, cat: 'tasks', sev: 2, ic: 'task', title: ap + ' ' + (ap === 1 ? 'تعديل مستني موافقتك' : 'تعديلات مستنية موافقتك'),
          sub: 'تعديلات على فلوس أو مستندات عملها الفريق', amt: '', tag: 'طلبات الموافقة', go: function () { navigate('approvals'); }, acts: [{ l: 'افتح', pri: 1, fn: function () { navigate('approvals'); } }] });
      } else if (window.AXReq && AXReq.badgeCount) {
        var n = AXReq.badgeCount();
        if (n) push({ id: 'rq:mine', sig: n, cat: 'tasks', sev: 1, ic: 'task', title: 'المدير رد على ' + (n === 1 ? 'طلب ليك' : n + ' طلبات ليك'), sub: 'افتح «الطلبات والمقترحات» تشوف القرار',
          amt: '', tag: 'الطلبات', go: function () { navigate('requests'); }, acts: [] });
      }
    });

    /* 4.13 · other modules add their own (margins, weekly statements …) */
    (window.AXNSources || []).forEach(function (fn) { var l = call(fn); if (Array.isArray(l)) l.forEach(function (x) { if (x) push(x); }); });
    out.forEach(function (x) { x.acts = (x.acts || []).filter(Boolean); });
    return out;
  }

  /* ════════ badge ════════ */
  function badgeNow() {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    var all = collect(), live = all.filter(function (x) { return !isRead(x) && !isSnoozed(x); });
    var n = live.filter(function (x) { return x.sev >= 2; }).length, urgent = live.filter(function (x) { return x.sev >= 3; }).length;
    var dot = document.getElementById('notif-dot');
    if (dot) { dot.style.display = n > 0 ? 'flex' : 'none'; dot.textContent = n > 0 ? (n > 9 ? '9+' : n) : ''; dot.classList.toggle('calm', n > 0 && !urgent); }
    var btn = document.getElementById('notif-btn');
    if (btn) {
      btn.setAttribute('aria-label', 'الإشعارات' + (n ? ' — ' + n + ' جديد' : ''));
      if (lastUrgent >= 0 && urgent > lastUrgent) { btn.classList.remove('axn-ring'); void btn.offsetWidth; btn.classList.add('axn-ring'); }
    }
    lastUrgent = urgent;
    if (ui.open) draw();
    try { document.dispatchEvent(new CustomEvent('axn:badge', { detail: { n: n, urgent: urgent } })); } catch (e) {}
  }
  window.updateNotifBadge = function () {
    try { if (typeof updatePaperCounter === 'function') updatePaperCounter(); } catch (e) {}
    try { if (typeof updateWalletBadge === 'function') updateWalletBadge(); } catch (e) {}
    clearTimeout(_bt); _bt = setTimeout(function () { call(badgeNow); }, 60);
  };

  /* ════════ panel ════════ */
  function itemHtml(x) {
    var read = isRead(x), sn = isSnoozed(x);
    var buttons = x.acts.map(function (a) { acts.push(a); return '<button type="button" class="axn-a' + (a.pri ? ' pri' : '') + '" onclick="event.stopPropagation();AXN.act(' + (acts.length - 1) + ',\'' + q(x.id) + '\')">' + esc(a.l) + '</button>'; }).join('');
    acts.push({ fn: x.go });
    var goI = acts.length - 1;
    return '<article class="axn-it sev-' + x.sev + (read ? ' read' : '') + (sn ? ' snz' : '') + '" data-cat="' + x.cat + '" tabindex="0" role="button" onclick="AXN.act(' + goI + ',\'' + q(x.id) + '\')" onkeydown="if(event.key===\'Enter\')AXN.act(' + goI + ',\'' + q(x.id) + '\')">' +
      '<span class="axn-ic c-' + x.cat + '">' + (I[x.ic] || I.bell) + '</span>' +
      '<div class="axn-b"><div class="axn-r1"><b>' + esc(x.title) + '</b>' + (x.amt ? '<em class="' + (x.up === true ? 'up' : x.up === false ? 'down' : '') + '">' + esc(x.amt) + '</em>' : '') + '</div>' +
        '<p>' + (x.tag ? '<span class="axn-tag">' + esc(x.tag) + '</span>' : '') + esc(x.sub) + '</p>' +
        '<div class="axn-r3">' + buttons +
          '<span class="axn-sp"></span>' +
          (sn ? '<button type="button" class="axn-a ghost" onclick="event.stopPropagation();AXN.unsnooze(\'' + q(x.id) + '\')">رجّعه</button>'
              : '<button type="button" class="axn-a ghost" title="أجّله لبكرة" onclick="event.stopPropagation();AXN.snooze(\'' + q(x.id) + '\')">بكرة</button>') +
          (read ? '' : '<button type="button" class="axn-a ghost ic" title="تعليم كمقروء" aria-label="تعليم كمقروء" onclick="event.stopPropagation();AXN.read(\'' + q(x.id) + '\')">' + I.check + '</button>') +
        '</div></div></article>';
  }
  function draw() {
    var box = document.getElementById('axn-body'); if (!box) return;
    acts = [];
    var all = collect(); persist(all);
    var vis = all.filter(function (x) { return ui.snoozed ? isSnoozed(x) : !isSnoozed(x); });
    var cnt = {}; CATS.forEach(function (c) { cnt[c[0]] = 0; });
    vis.forEach(function (x) { cnt.all++; cnt[x.cat]++; if (x.sev >= 3) cnt.urgent++; });
    var list = vis.filter(function (x) { return ui.tab === 'all' || (ui.tab === 'urgent' ? x.sev >= 3 : x.cat === ui.tab); });
    list.sort(function (a, b) { return b.sev - a.sev || (isRead(a) ? 1 : 0) - (isRead(b) ? 1 : 0); });
    var unread = all.filter(function (x) { return !isRead(x) && !isSnoozed(x); }).length;
    var snoozedN = all.filter(isSnoozed).length;
    var colItems = all.filter(function (x) { return x.id.indexOf('col:') === 0; });
    var debt = colItems.reduce(function (s, x) { var c = A('customers').find(function (k) { return 'col:' + k.id === x.id; }); return s + (c ? Math.max(0, Number(c.balance) || 0) : 0); }, 0);
    var calls = all.filter(function (x) { return x.cat === 'centers'; }).length;
    var stockN = all.filter(function (x) { return x.id.indexOf('stk:') === 0 && x.sev >= 2; }).length;

    var head = document.getElementById('axn-sub');
    if (head) head.textContent = unread ? unread + ' جديد' + (cnt.urgent ? ' · ' + cnt.urgent + ' عاجل' : '') : 'مفيش جديد';
    var sum = '<div class="axn-sum">' +
      '<button type="button" onclick="AXN.tab(\'money\')"><span>لازم تتحصّل</span><b>' + (debt ? num(debt) : '0') + '</b><em>' + colItems.length + ' عميل</em></button>' +
      '<button type="button" onclick="AXN.tab(\'centers\')"><span>مراكز تكلّمها</span><b>' + calls + '</b><em>معادها في السحب</em></button>' +
      '<button type="button" onclick="AXN.tab(\'stock\')"><span>أصناف محتاجة طلب</span><b>' + stockN + '</b><em>هتخلص أو تحت الحد</em></button></div>';
    var tabs = '<div class="axn-tabs" role="tablist">' + CATS.map(function (c) {
      if (c[0] !== 'all' && c[0] !== ui.tab && !cnt[c[0]]) return '';
      return '<button type="button" role="tab" aria-selected="' + (ui.tab === c[0]) + '" class="' + (ui.tab === c[0] ? 'on' : '') + (c[0] === 'urgent' ? ' u' : '') + '" onclick="AXN.tab(\'' + c[0] + '\')">' + c[1] + (cnt[c[0]] ? ' <em>' + cnt[c[0]] + '</em>' : '') + '</button>';
    }).join('') + '</div>';
    var groups = [[3, 'عاجل'], [2, 'مهم'], [1, 'للعلم']], body = '';
    groups.forEach(function (g) {
      var l = list.filter(function (x) { return x.sev === g[0]; }); if (!l.length) return;
      body += '<section class="axn-g g-' + g[0] + '"><h5>' + g[1] + ' <i>' + l.length + '</i></h5>' + l.map(itemHtml).join('') + '</section>';
    });
    if (!list.length) body = '<div class="axn-empty">' + I.check + '<b>' + (ui.snoozed ? 'مفيش حاجة متأجلة' : 'كله تمام') + '</b><span>' + (ui.snoozed ? '' : 'مفيش تنبيهات هنا دلوقتي — الحمد لله') + '</span></div>';
    box.innerHTML = (ui.snoozed ? '' : sum) + tabs + '<div class="axn-list">' + body + '</div>';
    var foot = document.getElementById('axn-foot');
    if (foot) foot.innerHTML =
      '<button type="button" class="axn-fb" onclick="AXN.toggleSnoozed()">' + (ui.snoozed ? 'رجوع للإشعارات' : 'المتأجّل' + (snoozedN ? ' (' + snoozedN + ')' : '')) + '</button>' +
      (isAdmin() ? '<button type="button" class="axn-fb" onclick="AXN.close();navigate(\'settings\');setTimeout(function(){var c=document.getElementById(\'axr-card\');if(c)c.scrollIntoView({block:\'start\'})},260)">قواعد التنبيهات</button>' : '');
  }
  function open() {
    var el = document.getElementById('axn');
    if (!el) {
      el = document.createElement('div'); el.id = 'axn'; el.className = 'axn';
      el.innerHTML = '<div class="axn-scrim" onclick="AXN.close()"></div>' +
        '<aside class="axn-panel" role="dialog" aria-modal="true" aria-labelledby="axn-title" tabindex="-1">' +
          '<header class="axn-head"><span class="axn-hic">' + I.bell + '</span><div class="axn-t"><b id="axn-title">الإشعارات</b><span id="axn-sub"></span></div>' +
            '<button type="button" class="axn-all" onclick="AXN.readAll()">علّم الكل كمقروء</button>' +
            '<button type="button" class="axn-close" onclick="AXN.close()" aria-label="إغلاق">' + I.x + '</button></header>' +
          '<div class="axn-body" id="axn-body"></div><footer class="axn-foot" id="axn-foot"></footer></aside>';
      document.body.appendChild(el);
      void el.offsetWidth;
    }
    ui.open = true; ui.snoozed = false;
    draw();
    el.classList.add('show');
    document.documentElement.classList.add('axn-lock');
    var b = document.getElementById('notif-btn'); if (b) b.classList.remove('axn-ring');
    setTimeout(function () { var c = el.querySelector('.axn-panel'); if (c) try { c.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function close() {
    ui.open = false;
    var el = document.getElementById('axn'); if (el) el.classList.remove('show');
    document.documentElement.classList.remove('axn-lock');
    window.updateNotifBadge();
  }
  function act(i, xid) {
    var a = acts[i]; if (!a) return;
    st().r[xid] = String((collect().find(function (x) { return x.id === xid; }) || {}).sig || '');
    persist();
    if (!a.keep) close();
    call(a.fn);
    if (a.keep) draw();
  }
  function mark(xid) {
    var x = collect().find(function (k) { return k.id === xid; }); if (!x) return;
    st().r[xid] = String(x.sig); persist(); draw(); window.updateNotifBadge();
  }
  function readAll() {
    collect().forEach(function (x) { if (!isSnoozed(x)) st().r[x.id] = String(x.sig); });
    persist(); draw(); window.updateNotifBadge();
  }
  function snooze(xid) { st().z[xid] = addD(today(), 1); persist(); draw(); window.updateNotifBadge(); if (typeof toast === 'function') toast('هيرجعلك بكرة', 'info', 2200); }
  function unsnooze(xid) { delete st().z[xid]; persist(); draw(); window.updateNotifBadge(); }

  window.openNotifications = open;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ui.open) close(); });

  window.AXN = {
    open: open, close: close, act: act, read: mark, readAll: readAll, snooze: snooze, unsnooze: unsnooze, collect: collect, badge: badgeNow,
    tab: function (t) {
      ui.tab = t; draw();
      var l = document.querySelector('#axn .axn-body'); if (l) l.scrollTop = 0;
      var on = document.querySelector('#axn .axn-tabs .on'); if (on && on.scrollIntoView) try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {}
    },
    toggleSnoozed: function () { ui.snoozed = !ui.snoozed; ui.tab = 'all'; draw(); },
    count: function () { return collect().filter(function (x) { return !isRead(x) && !isSnoozed(x) && x.sev >= 2; }).length; }
  };
})();

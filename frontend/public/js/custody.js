/* ════════════════════════════════════════════════════════════════════
   ERP · عهدتي — custody (cash and items) inside «مخزوني وجرد»
   ------------------------------------------------------------------
   · عهدة نقدية: cash advanced to someone → spend from it (each spend can be
     posted as an expense with its category), top up, return the rest, settle
   · عهدة أصناف/أجهزة: items from the store (stock goes out with a move
     "عهدة #n" and comes back with "رد عهدة #n") or free items (laptop,
     car, tools…) → return / used / damaged-lost
   · who holds what, overdue settlements, printable receipt (إقرار استلام)
     and settlement statement (كشف تسوية)
   Stored in settings._custody.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var EXP_CATS = ['نقل', 'صيانة', 'مرتبات', 'أحبار', 'كهرباء', 'إيجار', 'مياه', 'إنترنت', 'مستلزمات مكتبية', 'مصاريف بنكية', 'ضرائب', 'أخرى'];
  var ui = { f: 'open', who: '' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function list() { var s = S(); if (!Array.isArray(s._custody)) s._custody = []; return s._custody; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function cur() { var c = S().currency || 'جنيه'; return c === 'جنيه' ? 'ج.م' : c === 'ريال' ? 'ر.س' : c === 'درهم' ? 'د.إ' : String(c).slice(0, 3); }
  function money(n) { return num(Math.round(Number(n || 0) * 100) / 100) + ' ' + cur(); }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function today() { return lds(new Date()); }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function me() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || ''; }
  function save() { try { DB.save(); } catch (e) {} }
  function dmy(ds) { if (!ds) return ''; var p = String(ds).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
  function daysLate(c) { if (!c.due || c.status !== 'open') return 0; return Math.max(0, Math.round((new Date(today()) - new Date(c.due)) / 864e5)); }
  function sumK(c, k) { return (c.moves || []).filter(function (m) { return m.kind === k; }).reduce(function (s, m) { return s + Number(m.v || 0); }, 0); }
  function remaining(c) {
    return c.type === 'cash'
      ? Number(c.amount || 0) + sumK(c, 'add') - sumK(c, 'spend') - sumK(c, 'return')
      : Number(c.qty || 0) + sumK(c, 'add') - sumK(c, 'return') - sumK(c, 'use') - sumK(c, 'lost');
  }
  function totalIn(c) { return (c.type === 'cash' ? Number(c.amount || 0) : Number(c.qty || 0)) + sumK(c, 'add'); }
  function holders() {
    var h = {};
    A('users').forEach(function (u) { if (u.name) h[u.name] = 1; });
    A('employees').forEach(function (e) { if (e.name) h[e.name] = 1; });
    list().forEach(function (c) { if (c.holder) h[c.holder] = 1; });
    return Object.keys(h);
  }
  function stockMove(pid, type, qty, ref) {
    var p = A('products').find(function (x) { return x.id === pid; }); if (!p || !qty) return null;
    p.quantity = Number(p.quantity || 0) + (type === 'in' ? 1 : -1) * qty;
    if (!Array.isArray(D().stockMoves)) D().stockMoves = [];
    var m = { id: 'sm_' + id(), productId: pid, type: type, quantity: qty, date: today(), note: ref, reference: ref, createdAt: Date.now() };
    D().stockMoves.push(m);
    return m.id;
  }
  var ICON = {
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    item: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
  };
  var KIND_L = { spend: 'صرف منها', add: 'زيادة', return: 'رد', use: 'اتستخدم', lost: 'تالف / فاقد' };

  /* ── page ── */
  var host = null;
  function render(h) {
    if (h) host = h;
    if (!host || !host.isConnected) host = document.getElementById('cus-root');
    if (!host) return;
    var all = list(), open = all.filter(function (c) { return c.status === 'open'; });
    var cashOpen = open.filter(function (c) { return c.type === 'cash'; }).reduce(function (s, c) { return s + remaining(c); }, 0);
    var items = open.filter(function (c) { return c.type === 'item'; });
    var late = open.filter(function (c) { return daysLate(c) > 0; });
    var mine = open.filter(function (c) { return c.holder === me(); });
    var who = {}; all.forEach(function (c) { who[c.holder || '—'] = (who[c.holder || '—'] || 0) + (c.status === 'open' ? 1 : 0); });
    var shown = all.filter(function (c) {
      return (ui.f === 'all' || (ui.f === 'open' ? c.status === 'open' : c.status === 'closed')) && (!ui.who || c.holder === ui.who);
    }).sort(function (a, b) { return (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || daysLate(b) - daysLate(a) || (b.createdAt || 0) - (a.createdAt || 0); });

    host.innerHTML =
      '<section class="cus-hero">' +
        '<div class="cus-hero-t"><span>العُهد المفتوحة</span><b>' + money(cashOpen) + '</b><small>نقدية مع ' + open.filter(function (c) { return c.type === 'cash'; }).length + ' عهدة · ' + items.length + ' عهدة أصناف</small></div>' +
        '<div class="cus-hero-figs">' +
          '<div><span>عهدتي أنا</span><b>' + mine.length + '</b><small>' + money(mine.filter(function (c) { return c.type === 'cash'; }).reduce(function (s, c) { return s + remaining(c); }, 0)) + '</small></div>' +
          '<div><span>متأخرة التسوية</span><b class="' + (late.length ? 'bad' : 'ok') + '">' + late.length + '</b><small>' + (late.length ? 'فات ميعادها' : 'كله في ميعاده') + '</small></div>' +
          '<div><span>اتقفلت</span><b>' + (all.length - open.length) + '</b><small>عهدة</small></div>' +
        '</div>' +
        '<button class="cus-new" onclick="AXCustody.form()">+ عهدة جديدة</button>' +
      '</section>' +
      '<div class="cus-tools">' +
        '<div class="ax-seg">' + [['open', 'مفتوحة'], ['closed', 'اتقفلت'], ['all', 'الكل']].map(function (o) {
          return '<button class="' + (ui.f === o[0] ? 'on' : '') + '" onclick="AXCustody.filter(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<div class="cus-who">' + (ui.whoList = ['', me()].concat(Object.keys(who).filter(function (k) { return k !== me(); })).filter(function (v, i, a) { return a.indexOf(v) === i; })).map(function (k, i) {
          var label = k === '' ? 'كل الناس' : k === me() ? 'عهدتي' : k;
          return '<button class="' + (ui.who === k ? 'on' : '') + '" onclick="AXCustody.who(' + i + ')">' + esc(label) + (k && who[k] ? ' <em>' + who[k] + '</em>' : '') + '</button>';
        }).join('') + '</div>' +
      '</div>' +
      (shown.length ? '<div class="cus-grid">' + shown.map(card).join('') + '</div>'
        : '<div class="skh-empty"><b>' + (all.length ? 'مفيش عهد هنا' : 'لسه مفيش عهد') + '</b><span>' + (all.length ? 'غيّر الفلتر' : 'سجّل أي فلوس أو أصناف أو أجهزة مع حد — والبرنامج يتابع الصرف والرد والتسوية') + '</span></div>');
  }

  function card(c) {
    var rem = remaining(c), tin = totalIn(c), used = Math.max(0, tin - rem), pct = tin ? used / tin * 100 : 0, late = daysLate(c);
    var unit = c.type === 'cash' ? cur() : (c.unit || 'قطعة');
    var fmtV = function (v) { return c.type === 'cash' ? money(v) : num(v) + ' ' + esc(unit); };
    var st = c.status === 'closed' ? '<span class="cus-st ok">اتقفلت ✓</span>' : late ? '<span class="cus-st bad">متأخرة ' + late + ' يوم</span>' : c.due ? '<span class="cus-st">التسوية ' + dmy(c.due) + '</span>' : '<span class="cus-st">مفتوحة</span>';
    var moves = (c.moves || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); }).slice(0, 4);
    return '<article class="cus-card t-' + c.type + (c.status === 'closed' ? ' is-closed' : '') + '">' +
      '<header><span class="cus-ic">' + (c.type === 'cash' ? ICON.cash : ICON.item) + '</span>' +
        '<div class="cus-ct"><b>' + esc(c.type === 'cash' ? (c.purpose || 'عهدة نقدية') : (c.itemName || 'صنف')) + '</b><span>#' + c.no + ' · مع ' + esc(c.holder || '—') + ' · من ' + dmy(c.date) + (c.type === 'item' && c.purpose ? ' · ' + esc(c.purpose) : '') + '</span></div>' + st + '</header>' +
      '<div class="cus-amt"><div><span>' + (c.type === 'cash' ? 'الباقي معاه' : 'لسه معاه') + '</span><b>' + fmtV(rem) + '</b></div>' +
        '<div><span>' + (c.type === 'cash' ? 'اتسلّم' : 'الكمية') + '</span><b class="mut">' + fmtV(tin) + '</b></div>' +
        '<div><span>' + (c.type === 'cash' ? 'اتصرف' : 'اتستخدم/رجع') + '</span><b class="mut">' + fmtV(used) + '</b></div></div>' +
      '<div class="cus-bar"><i style="width:' + Math.min(100, pct).toFixed(1) + '%"></i></div>' +
      (moves.length ? '<ul class="cus-moves">' + moves.map(function (m) {
        return '<li class="k-' + m.kind + '"><span>' + KIND_L[m.kind] + (m.category ? ' · ' + esc(m.category) : '') + (m.note ? ' — ' + esc(m.note) : '') + '</span><b>' + (m.kind === 'add' ? '+' : '−') + fmtV(m.v) + '</b><small>' + dmy(m.date) + '</small></li>';
      }).join('') + '</ul>' : '') +
      '<footer>' + (c.status === 'open'
        ? (c.type === 'cash'
          ? '<button class="pri" onclick="AXCustody.move(\'' + c.id + '\',\'spend\')">صرف منها</button><button onclick="AXCustody.move(\'' + c.id + '\',\'add\')">زيادة</button><button onclick="AXCustody.move(\'' + c.id + '\',\'return\')">رد</button>'
          : '<button class="pri" onclick="AXCustody.move(\'' + c.id + '\',\'return\')">رجّع</button><button onclick="AXCustody.move(\'' + c.id + '\',\'use\')">اتستخدم</button><button onclick="AXCustody.move(\'' + c.id + '\',\'lost\')">تالف/فاقد</button>') +
          '<button onclick="AXCustody.settle(\'' + c.id + '\')">تسوية وإغلاق</button>'
        : '') +
        '<button class="ic" title="إقرار استلام" onclick="AXCustody.print(\'' + c.id + '\',\'receipt\')">' + ICON.print + '</button>' +
        '<button class="ic" title="كشف التسوية" onclick="AXCustody.print(\'' + c.id + '\',\'statement\')">كشف</button>' +
      '</footer></article>';
  }

  /* ── forms ── */
  function form(type) {
    type = type || 'cash';
    var hs = holders(), prods = A('products');
    openModal('عهدة جديدة',
      '<form id="cus-form" onsubmit="return false">' +
        '<div class="cus-type ax-seg"><button type="button" class="' + (type === 'cash' ? 'on' : '') + '" onclick="AXCustody.form(\'cash\')">' + ICON.cash + ' عهدة نقدية</button>' +
          '<button type="button" class="' + (type === 'item' ? 'on' : '') + '" onclick="AXCustody.form(\'item\')">' + ICON.item + ' أصناف / أجهزة</button></div>' +
        '<input type="hidden" name="type" value="' + type + '">' +
        '<div class="form-row"><div class="form-group"><label>العهدة مع *</label><input class="form-control" name="holder" list="cus-holders" value="' + esc(me()) + '" required>' +
          '<datalist id="cus-holders">' + hs.map(function (h) { return '<option value="' + esc(h) + '">'; }).join('') + '</datalist></div>' +
          '<div class="form-group"><label>' + (type === 'cash' ? 'الغرض *' : 'ملاحظة / الغرض') + '</label><input class="form-control" name="purpose" placeholder="' + (type === 'cash' ? 'مثال: مصاريف نقل وتوصيل الأسبوع' : 'مثال: للصيانة عند مركز النور') + '"></div></div>' +
        (type === 'cash'
          ? '<div class="form-group"><label>المبلغ *</label><input class="form-control" name="amount" type="number" inputmode="decimal" min="0" step="any" required></div>'
          : '<div class="form-group"><label>الصنف</label><select class="form-control" name="productId" onchange="AXCustody.prodPick(this)"><option value="">— صنف مش من المخزن (جهاز / أداة / عربية…) —</option>' +
              prods.map(function (p) { return '<option value="' + p.id + '" data-unit="' + esc(p.unit || '') + '">' + esc(p.name) + ' (متاح ' + num(p.quantity) + ' ' + esc(p.unit || '') + ')</option>'; }).join('') + '</select></div>' +
            '<div class="form-row"><div class="form-group" id="cus-iname"><label>اسم الصنف *</label><input class="form-control" name="itemName" placeholder="مثال: لابتوب HP / شنطة عدة صيانة"></div>' +
              '<div class="form-group"><label>الكمية *</label><input class="form-control" name="qty" type="number" inputmode="decimal" min="0" step="any" value="1"></div>' +
              '<div class="form-group"><label>الوحدة</label><input class="form-control" name="unit" value="قطعة"></div></div>' +
            '<label class="dbt-check" id="cus-deduct" style="display:none"><input type="checkbox" name="deduct" checked><span>اخصمها من المخزن دلوقتي (وترجع له لما تترد)</span></label>' +
            '<div class="form-group"><label>سيريال / تفاصيل</label><input class="form-control" name="serial" placeholder="اختياري"></div>') +
        '<div class="form-row"><div class="form-group"><label>تاريخ التسليم</label><input class="form-control" name="date" type="date" value="' + today() + '"></div>' +
          '<div class="form-group"><label>ميعاد التسوية / الرد</label><input class="form-control" name="due" type="date"></div></div>' +
      '</form>',
      '<button class="btn btn-primary" onclick="AXCustody.saveForm()">حفظ العهدة</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
  }
  function saveForm() {
    var v = Object.fromEntries(new FormData(document.getElementById('cus-form')));
    v.holder = String(v.holder || '').trim();
    if (!v.holder) { toast('اكتب العهدة مع مين', 'error'); return; }
    var n = list().reduce(function (m, c) { return Math.max(m, c.no || 0); }, 0) + 1;
    var c = { id: 'cus_' + id(), no: n, type: v.type, holder: v.holder, purpose: v.purpose || '', date: v.date || today(), due: v.due || '',
      status: 'open', by: me(), createdAt: Date.now(), moves: [] };
    if (v.type === 'cash') {
      c.amount = Number(v.amount || 0);
      if (!(c.amount > 0)) { toast('اكتب المبلغ', 'error'); return; }
      if (!c.purpose) { toast('اكتب الغرض من العهدة', 'error'); return; }
    } else {
      c.qty = Number(v.qty || 0); c.unit = v.unit || 'قطعة'; c.serial = v.serial || '';
      if (!(c.qty > 0)) { toast('اكتب الكمية', 'error'); return; }
      if (v.productId) {
        var p = A('products').find(function (x) { return x.id === v.productId; });
        c.productId = v.productId; c.itemName = p ? p.name : ''; c.unit = (p && p.unit) || c.unit; c.fromStock = !!v.deduct;
        if (c.fromStock) c.smOut = stockMove(c.productId, 'out', c.qty, 'عهدة #' + n + ' - ' + c.holder);
      } else {
        c.itemName = String(v.itemName || '').trim();
        if (!c.itemName) { toast('اكتب اسم الصنف', 'error'); return; }
      }
    }
    list().push(c); save(); closeModal();
    toast('اتسجلت عهدة #' + n + ' مع ' + c.holder);
    rerender();
  }
  function move(cid, kind) {
    var c = list().find(function (x) { return x.id === cid; }); if (!c) return;
    var rem = remaining(c), isCash = c.type === 'cash';
    var title = { spend: 'صرف من العهدة', add: 'زيادة العهدة', return: isCash ? 'رد نقدية' : 'رد الصنف', use: 'اتستخدم / اتركّب', lost: 'تالف / فاقد' }[kind];
    openModal(title + ' — #' + c.no,
      '<form id="cus-mv" onsubmit="return false">' +
        '<div class="dbt-payhead"><div><span>' + (isCash ? 'الباقي معاه' : 'لسه معاه') + '</span><b>' + (isCash ? money(rem) : num(rem) + ' ' + esc(c.unit || '')) + '</b></div><div><span>مع</span><b>' + esc(c.holder) + '</b></div></div>' +
        '<div class="form-group"><label>' + (isCash ? 'المبلغ' : 'الكمية') + ' *</label><input class="form-control" name="v" type="number" inputmode="decimal" min="0" step="any" value="' + (kind === 'return' ? rem : '') + '" required></div>' +
        (kind === 'spend' ? '<div class="form-group"><label>البند</label><select class="form-control" name="category">' + EXP_CATS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></div>' : '') +
        '<div class="form-row"><div class="form-group"><label>التاريخ</label><input class="form-control" name="date" type="date" value="' + today() + '"></div>' +
          '<div class="form-group"><label>ملاحظة</label><input class="form-control" name="note" placeholder="' + (kind === 'spend' ? 'مثال: بنزين توصيل لمركز النور' : 'اختياري') + '"></div></div>' +
        (kind === 'spend' ? '<label class="dbt-check"><input type="checkbox" name="post" checked><span>سجّلها في المصروفات (بنفس البند)</span></label>' : '') +
        (!isCash && c.fromStock && kind === 'return' ? '<p class="dbt-hint">الكمية دي هترجع للمخزن بحركة «رد عهدة #' + c.no + '».</p>' : '') +
      '</form>',
      '<button class="btn btn-primary" onclick="AXCustody.saveMove(\'' + cid + '\',\'' + kind + '\')">تسجيل</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
  }
  function saveMove(cid, kind) {
    var c = list().find(function (x) { return x.id === cid; }); if (!c) return;
    var v = Object.fromEntries(new FormData(document.getElementById('cus-mv')));
    var val = Number(v.v || 0), rem = remaining(c);
    if (!(val > 0)) { toast('اكتب قيمة صحيحة', 'error'); return; }
    if (kind !== 'add' && val > rem + 1e-9) { toast('أكبر من الباقي (' + num(rem) + ')', 'error'); return; }
    var m = { id: 'cm_' + id(), kind: kind, v: val, date: v.date || today(), note: v.note || '', category: v.category || '', at: Date.now() };
    if (kind === 'spend' && v.post) {
      if (!Array.isArray(D().expenses)) D().expenses = [];
      var ex = { id: 'ex_' + id(), category: m.category || 'أخرى', amount: val, date: m.date, description: 'من عهدة #' + c.no + ' (' + c.holder + ')' + (m.note ? ' — ' + m.note : ''), custodyId: c.id, createdAt: Date.now() };
      D().expenses.push(ex); m.expId = ex.id;
    }
    if (c.type === 'item' && c.fromStock && c.productId) {
      if (kind === 'return') m.smId = stockMove(c.productId, 'in', val, 'رد عهدة #' + c.no + ' - ' + c.holder);
      if (kind === 'add') m.smId = stockMove(c.productId, 'out', val, 'عهدة #' + c.no + ' - ' + c.holder);
    }
    c.moves = c.moves || []; c.moves.push(m);
    var left = remaining(c);
    if (left <= 1e-9 && kind !== 'add') { c.status = 'closed'; c.closedAt = Date.now(); }
    save(); closeModal();
    toast(c.status === 'closed' ? 'اتقفلت عهدة #' + c.no + ' ✓' : 'اتسجّل — الباقي ' + (c.type === 'cash' ? money(left) : num(left) + ' ' + (c.unit || '')));
    rerender();
  }
  function settle(cid) {
    var c = list().find(function (x) { return x.id === cid; }); if (!c) return;
    var rem = remaining(c);
    var go = function () {
      if (rem > 1e-9) {
        var m = { id: 'cm_' + id(), kind: 'return', v: rem, date: today(), note: 'رد الباقي عند التسوية', at: Date.now() };
        if (c.type === 'item' && c.fromStock && c.productId) m.smId = stockMove(c.productId, 'in', rem, 'رد عهدة #' + c.no + ' - ' + c.holder);
        c.moves.push(m);
      }
      c.status = 'closed'; c.closedAt = Date.now();
      save(); toast('اتقفلت عهدة #' + c.no + ' ✓'); rerender();
    };
    if (rem > 1e-9) confirmDialog('لسه مع ' + c.holder + ' ' + (c.type === 'cash' ? money(rem) : num(rem) + ' ' + (c.unit || '')) + ' — هيتسجّل إنهم اترَدّوا وتتقفل العهدة. تكمل؟', go);
    else go();
  }
  function print(cid, kind) {
    var c = list().find(function (x) { return x.id === cid; }); if (!c) return;
    var co = S().companyName || 'نظام الحسابات', isCash = c.type === 'cash', fv = function (v) { return isCash ? money(v) : num(v) + ' ' + (c.unit || ''); };
    var w = window.open('', '_blank'); if (!w) { toast('المتصفح منع نافذة الطباعة', 'error'); return; }
    var body = kind === 'receipt'
      ? '<h2>إقرار استلام عهدة ' + (isCash ? 'نقدية' : 'عينية') + ' رقم ' + c.no + '</h2>' +
        '<p>أقر أنا / <b>' + esc(c.holder) + '</b> بأنني استلمت من ' + esc(co) + ' بتاريخ ' + dmy(c.date) + ' ' +
        (isCash ? 'مبلغ وقدره <b>' + money(c.amount) + '</b>' : '<b>' + num(c.qty) + ' ' + esc(c.unit || '') + ' — ' + esc(c.itemName) + '</b>' + (c.serial ? ' (سيريال: ' + esc(c.serial) + ')' : '')) +
        (c.purpose ? ' وذلك بغرض: ' + esc(c.purpose) : '') + '، وأتعهد ' + (isCash ? 'بتقديم ما يثبت أوجه الصرف ورد المتبقي' : 'بالمحافظة عليها وردها') + (c.due ? ' في موعد أقصاه ' + dmy(c.due) : ' عند الطلب') + '.</p>'
      : '<h2>كشف تسوية عهدة رقم ' + c.no + ' — ' + esc(c.holder) + '</h2>' +
        '<table><thead><tr><th>التاريخ</th><th>البيان</th><th>البند</th><th>القيمة</th></tr></thead><tbody>' +
        '<tr><td>' + dmy(c.date) + '</td><td>استلام العهدة' + (c.purpose ? ' — ' + esc(c.purpose) : '') + '</td><td></td><td>' + fv(isCash ? c.amount : c.qty) + '</td></tr>' +
        (c.moves || []).map(function (m) { return '<tr><td>' + dmy(m.date) + '</td><td>' + KIND_L[m.kind] + (m.note ? ' — ' + esc(m.note) : '') + '</td><td>' + esc(m.category || '') + '</td><td>' + (m.kind === 'add' ? '+' : '−') + fv(m.v) + '</td></tr>'; }).join('') +
        '<tr><th colspan="3">الباقي</th><th>' + fv(remaining(c)) + '</th></tr></tbody></table>';
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عهدة #' + c.no + '</title><style>@page{size:A4;margin:16mm}body{font-family:"Zain","IBM Plex Sans Arabic","Cairo",Tahoma,sans-serif;color:#000;line-height:2}' +
      'h1{font-size:22px;margin:0}h2{font-size:17px;margin:10px 0 16px}p{font-size:15px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #000;padding:7px;text-align:right}th{background:#eee}.sig{display:flex;justify-content:space-between;margin-top:48px;font-size:14px}</style></head><body>' +
      '<h1>' + esc(co) + '</h1>' + body +
      '<div class="sig"><span>المستلم: ' + esc(c.holder) + '<br>التوقيع: ..................</span><span>المسلِّم: ' + esc(c.by || '') + '<br>التوقيع: ..................</span><span>التاريخ: ' + today() + '</span></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }
  function rerender() {
    if (typeof currentPage !== 'undefined' && currentPage === 'stock' && typeof renderStockHub === 'function') renderStockHub();
    else render();
  }

  window.AXCustody = {
    render: render, form: function (t) { form(t); }, saveForm: saveForm, move: move, saveMove: saveMove, settle: settle, print: print,
    openCount: function () { return list().filter(function (c) { return c.status === 'open'; }).length; },
    filter: function (f) { ui.f = f; render(); },
    who: function (i) { ui.who = (ui.whoList || [])[i] || ''; render(); },
    prodPick: function (sel) {
      var n = document.getElementById('cus-iname'), dd = document.getElementById('cus-deduct'), u = document.querySelector('#cus-form [name=unit]');
      if (n) n.style.display = sel.value ? 'none' : '';
      if (dd) dd.style.display = sel.value ? '' : 'none';
      if (u && sel.value) u.value = sel.selectedOptions[0].getAttribute('data-unit') || u.value;
    }
  };
})();

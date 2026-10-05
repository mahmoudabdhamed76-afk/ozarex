/* ════════════════════════════════════════════════════════════════════
   ERP · الطلبات والمقترحات (4.11)
   ------------------------------------------------------------------
   · طلب الشراء من «مخزوني وجرد ← طلب شراء» مبيتعملش على طول: بيروح هنا
     للمدير. المدير يقدر يعدّل الكميات ويوافق ← بيتعمل طلب شراء لكل
     مورد (مسودة جاهزة للطباعة والواتساب)، أو يرفض ويكتب السبب.
   · «اقتراحات البرنامج»: الأصناف اللي قربت تخلص ومحدش طلبها لسه —
     زرار «اطلب» يعمل طلب بالكمية المقترحة وأرخص مورد.
   · أي حد يقدر يكتب اقتراح أو طلب (مش شراء) والمدير يرد عليه.
   · اللي عمل الطلب يقدر يسحبه وهو لسه مستني.
   Stored in settings._requests (the server lets a non-admin add only his
   own pending request, or withdraw it — the decision is the admin's).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { f: 'pending' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function list() { var s = S(); if (!Array.isArray(s._requests)) s._requests = []; return s._requests; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(Number(n || 0)); } catch (e) {} return num(n); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function user() { var u = (typeof currentUser !== 'undefined' && currentUser) || {}; return { id: u.id || '', name: u.name || '', role: u.role || '' }; }
  function isAdmin() { return user().role === 'admin'; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function when(ts) {
    if (!ts) return '';
    var d = new Date(ts), t = today(), ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var h = d.getHours(), tm = (h % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + (h < 12 ? ' ص' : ' م');
    if (ds === t) return 'النهارده ' + tm;
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'امبارح ' + tm;
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + tm;
  }
  function total(r) { return (r.items || []).reduce(function (t, x) { return t + (Number(x.qty) || 0) * (Number(x.price) || 0); }, 0); }
  function visible() { var u = user(); return list().filter(function (r) { return isAdmin() || (r.by && r.by.id === u.id); }); }
  function pendingFor(pid) { return list().some(function (r) { return r.type === 'po' && r.status === 'pending' && (r.items || []).some(function (x) { return x.productId === pid; }); }); }

  /* ── create ── */
  function create(o) {
    var no = list().reduce(function (m, x) { return Math.max(m, x.no || 0); }, 0) + 1;
    var r = { id: 'rq_' + id(), no: no, type: o.type || 'po', status: 'pending', title: o.title || '', note: o.note || '',
      items: o.items || [], by: user(), at: Date.now(), date: today() };
    if (!r.title && r.type === 'po') r.title = 'طلب شراء ' + r.items.length + ' ' + (r.items.length === 1 ? 'صنف' : 'أصناف');
    list().push(r);
    DB.save();
    badge();
    return r;
  }

  /* program suggestions: items that need ordering and nobody asked for yet */
  function smart() {
    var sg = [];
    try { sg = (window.AXPO && AXPO.suggestions) ? AXPO.suggestions() : []; } catch (e) { sg = []; }
    return sg.filter(function (s) { return s.lvl !== 'soon' && !pendingFor(s.it.id); });
  }
  function itemFrom(s, qty) {
    return { productId: s.it.id, name: s.it.name, unit: s.it.unit, qty: Math.max(1, Math.round(qty || s.need)), price: s.sup.price || 0,
      supplierId: s.sup.sid || '', supplierName: s.sup.name || '', bal: s.it.bal, why: s.why };
  }
  function quick(pid) {
    var s = smart().find(function (x) { return x.it.id === pid; }); if (!s) return;
    var r = create({ type: 'po', items: [itemFrom(s)], note: 'من اقتراحات البرنامج: ' + s.why });
    T('اتبعت طلب الشراء #' + r.no + ' للمدير' + (isAdmin() ? ' — وافق عليه من هنا' : ''));
    render();
  }

  /* ── decide ── */
  function approve(rid) {
    if (!isAdmin()) return;
    var r = list().find(function (x) { return x.id === rid; }); if (!r || r.status !== 'pending') return;
    if (r.type === 'po') {
      document.querySelectorAll('.rq-q[data-r="' + rid + '"]').forEach(function (inp) { var it = r.items[+inp.dataset.i]; if (it) it.qty = Math.max(0, Number(inp.value) || 0); });
      var items = r.items.filter(function (x) { return x.qty > 0; });
      if (!items.length) { T('كل الكميات صفر', 'warning'); return; }
      var made = (window.AXPO && AXPO.createPOs) ? AXPO.createPOs(items, { requestId: r.id, requestNo: r.no, by: r.by && r.by.name }) : [];
      r.poIds = made.map(function (o) { return o.id; });
      r.poNos = made.map(function (o) { return o.no; });
    }
    r.status = 'approved'; r.decidedAt = Date.now(); r.decidedBy = { id: user().id, name: user().name };
    DB.save();
    T(r.type === 'po' ? 'وافقت — اتعمل ' + (r.poNos || []).length + ' طلب شراء (' + (r.poNos || []).map(function (n) { return '#' + n; }).join('، ') + ')' : 'وافقت على الطلب');
    render(); badge();
  }
  function reject(rid) {
    if (!isAdmin()) return;
    var r = list().find(function (x) { return x.id === rid; }); if (!r) return;
    openModal('رفض الطلب #' + r.no,
      '<div class="form-group"><label>السبب (اختياري — هيوصل لـ' + esc((r.by && r.by.name) || 'صاحب الطلب') + ')</label><textarea class="form-control" id="rq-why" rows="3" placeholder="مثلاً: عندنا كمية في المخزن التاني"></textarea></div>',
      '<button class="btn btn-danger" onclick="AXReq.doReject(\'' + rid + '\')">ارفض</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function doReject(rid) {
    var r = list().find(function (x) { return x.id === rid; }); if (!r || r.status !== 'pending') { closeModal(); return; }
    r.status = 'rejected'; r.reply = ((document.getElementById('rq-why') || {}).value || '').trim(); r.decidedAt = Date.now(); r.decidedBy = { id: user().id, name: user().name };
    DB.save(); closeModal(); T('اترفض الطلب #' + r.no, 'warning'); render(); badge();
  }
  function withdraw(rid) {
    var r = list().find(function (x) { return x.id === rid; }); if (!r || r.status !== 'pending' || !r.by || r.by.id !== user().id) return;
    confirmDialog('تسحب الطلب #' + r.no + '؟', function () { r.status = 'withdrawn'; r.decidedAt = Date.now(); DB.save(); render(); badge(); });
  }
  function reply(rid) {
    if (!isAdmin()) return;
    var r = list().find(function (x) { return x.id === rid; }); if (!r) return;
    openModal('رد على ' + esc(r.title || 'الطلب'),
      '<div class="form-group"><label>الرد</label><textarea class="form-control" id="rq-rep" rows="3">' + esc(r.reply || '') + '</textarea></div>',
      '<button class="btn btn-primary" onclick="AXReq.doReply(\'' + rid + '\')">حفظ الرد</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function doReply(rid) {
    var r = list().find(function (x) { return x.id === rid; }); if (!r) { closeModal(); return; }
    r.reply = ((document.getElementById('rq-rep') || {}).value || '').trim(); DB.save(); closeModal(); render();
  }

  /* a free suggestion / request (not a purchase) */
  function idea() {
    openModal('اقتراح أو طلب جديد',
      '<div class="form-group"><label>العنوان *</label><input class="form-control" id="rq-title" placeholder="مثلاً: نغيّر مورد الأفلام، أو محتاجين طابعة جديدة"></div>' +
      '<div class="form-group"><label>التفاصيل</label><textarea class="form-control" id="rq-note" rows="4" placeholder="اكتب اللي محتاجه أو اقتراحك بالتفصيل"></textarea></div>' +
      '<p class="rq-hint">هيوصل للمدير في «الطلبات والمقترحات» ويقدر يوافق أو يرفض أو يرد عليك.</p>',
      '<button class="btn btn-primary" onclick="AXReq.saveIdea()">ابعت</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
    setTimeout(function () { var i = document.getElementById('rq-title'); if (i) i.focus(); }, 100);
  }
  function saveIdea() {
    var t = ((document.getElementById('rq-title') || {}).value || '').trim();
    if (!t) { T('اكتب عنوان', 'warning'); return; }
    var r = create({ type: 'idea', title: t, note: ((document.getElementById('rq-note') || {}).value || '').trim() });
    closeModal(); T('اتبعت #' + r.no + ' للمدير'); ui.f = 'pending'; render();
  }

  /* ── page ── */
  var ST = { pending: 'مستني الموافقة', approved: 'اتوافق', rejected: 'اترفض', withdrawn: 'اتسحب' };
  var IC = {
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L22 7H6.2"/></svg>',
    idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>'
  };
  function card(r) {
    var mine = r.by && r.by.id === user().id, pend = r.status === 'pending', admin = isAdmin();
    var items = r.type === 'po' && (r.items || []).length ? '<div class="rq-tw"><table class="rq-t"><thead><tr><th>الصنف</th><th>الكمية</th><th>المورد</th><th>السعر التقريبي</th><th>الإجمالي</th></tr></thead><tbody>' +
      r.items.map(function (x, i) {
        return '<tr><td><b>' + esc(x.name) + '</b>' + (x.bal != null ? '<small>الرصيد ' + num(x.bal) + ' ' + esc(x.unit || '') + (x.why ? ' · ' + esc(x.why) : '') + '</small>' : '') + '</td>' +
          '<td>' + (admin && pend ? '<input class="rq-q" type="number" min="0" step="1" data-r="' + r.id + '" data-i="' + i + '" value="' + (x.qty || 0) + '"> ' : '<b>' + num(x.qty) + '</b> ') + '<small>' + esc(x.unit || '') + '</small></td>' +
          '<td>' + esc(x.supplierName || '—') + '</td><td>' + (x.price ? money(x.price) : '—') + '</td><td><b>' + (x.price ? money(x.qty * x.price) : '—') + '</b></td></tr>';
      }).join('') + '</tbody></table></div>' + (total(r) ? '<div class="rq-sum">الإجمالي التقريبي <b>' + money(total(r)) + '</b></div>' : '') : '';
    var dec = '';
    if (r.status === 'approved') dec = '<p class="rq-dec ok">وافق ' + esc((r.decidedBy && r.decidedBy.name) || 'المدير') + ' ' + when(r.decidedAt) + (r.poNos && r.poNos.length ? ' — اتعمل طلب شراء ' + r.poNos.map(function (n) { return '#' + n; }).join('، ') : '') + '</p>';
    if (r.status === 'rejected') dec = '<p class="rq-dec bad">رفض ' + esc((r.decidedBy && r.decidedBy.name) || 'المدير') + ' ' + when(r.decidedAt) + (r.reply ? ' — السبب: ' + esc(r.reply) : '') + '</p>';
    if (r.status === 'withdrawn') dec = '<p class="rq-dec">سحبه صاحبه ' + when(r.decidedAt) + '</p>';
    if (r.reply && r.status === 'approved') dec += '<p class="rq-dec">رد المدير: ' + esc(r.reply) + '</p>';
    var acts = [];
    if (admin && pend) { acts.push('<button class="pri" onclick="AXReq.approve(\'' + r.id + '\')">' + (r.type === 'po' ? 'وافق واعمل طلب الشراء' : 'وافق') + '</button>'); acts.push('<button class="no" onclick="AXReq.reject(\'' + r.id + '\')">ارفض</button>'); }
    if (admin && r.type === 'idea') acts.push('<button onclick="AXReq.reply(\'' + r.id + '\')">' + (r.reply ? 'عدّل الرد' : 'اكتب رد') + '</button>');
    if (!admin && mine && pend) acts.push('<button onclick="AXReq.withdraw(\'' + r.id + '\')">اسحب الطلب</button>');
    if (r.status === 'approved' && r.type === 'po') acts.push('<button onclick="AXReq.openPO()">افتح طلبات الشراء</button>');
    return '<article class="rq-card s-' + r.status + ' t-' + r.type + '">' +
      '<header><span class="rq-ic">' + (r.type === 'po' ? IC.cart : IC.idea) + '</span>' +
        '<div><b>' + (r.type === 'po' ? 'طلب شراء #' + r.no : esc(r.title) + ' <i>#' + r.no + '</i>') + '</b><span>' + (r.type === 'po' ? esc(r.title) + ' · ' : '') + 'من ' + esc((r.by && r.by.name) || '—') + ' · ' + when(r.at) + '</span></div>' +
        '<em class="rq-st">' + ST[r.status] + '</em></header>' +
      items + (r.note ? '<p class="rq-note">' + esc(r.note) + '</p>' : '') + dec +
      (acts.length ? '<footer>' + acts.join('') + '</footer>' : '') +
    '</article>';
  }

  function render() {
    var root = document.getElementById('rq-root');
    if (!root) return;
    var all = visible().slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var cnt = { pending: 0, approved: 0, rejected: 0 };
    all.forEach(function (r) { if (cnt[r.status] != null) cnt[r.status]++; });
    var shown = ui.f === 'all' ? all : all.filter(function (r) { return r.status === ui.f || (ui.f === 'rejected' && r.status === 'withdrawn'); });
    var sm = smart();
    var tabs = [['pending', 'مستنية', cnt.pending], ['approved', 'اتوافق', cnt.approved], ['rejected', 'اترفض', cnt.rejected], ['all', 'الكل', all.length]];
    root.innerHTML =
      '<div class="page-header"><div><h2 class="page-title">الطلبات والمقترحات</h2><p class="page-subtitle">' +
        (isAdmin() ? 'طلبات الشراء والاقتراحات بتوصلك هنا — توافق أو ترفض' : 'طلباتك واقتراحاتك للمدير — وهنا تشوف ردّه') + '</p></div>' +
        '<div class="rq-head-a"><button class="btn btn-secondary" onclick="AXReq.idea()">اقتراح أو طلب جديد</button><button class="btn btn-primary" onclick="AXReq.openPO()">طلب شراء من المخزن</button></div></div>' +
      (sm.length ? '<section class="rq-smart"><header><span class="rq-ic">' + IC.spark + '</span><div><b>اقتراحات البرنامج</b><span>أصناف قربت تخلص ومحدش طلبها لسه</span></div></header><ul>' +
        sm.slice(0, 8).map(function (s) {
          var cov = !isFinite(s.it.cover) ? '' : s.it.cover < 1 ? 'يخلص النهارده' : 'يكفي ' + Math.floor(s.it.cover) + ' يوم';
          return '<li class="l-' + s.lvl + '"><div><b>' + esc(s.it.name) + '</b><span>الرصيد ' + num(s.it.bal) + ' ' + esc(s.it.unit) + (cov ? ' · ' + cov : '') + ' · ' + esc(s.why) + '</span></div>' +
            '<em>اطلب ' + num(s.need) + ' ' + esc(s.it.unit) + (s.sup.name ? ' من ' + esc(s.sup.name) : '') + '</em>' +
            '<button onclick="AXReq.quick(\'' + s.it.id + '\')">اطلب</button></li>';
        }).join('') + '</ul></section>' : '') +
      '<div class="rq-tabs" role="tablist">' + tabs.map(function (t) {
        return '<button role="tab" class="' + (ui.f === t[0] ? 'on' : '') + '" aria-selected="' + (ui.f === t[0]) + '" onclick="AXReq.filter(\'' + t[0] + '\')">' + t[1] + (t[2] ? ' <em>' + t[2] + '</em>' : '') + '</button>';
      }).join('') + '</div>' +
      (shown.length ? '<div class="rq-list">' + shown.map(card).join('') + '</div>'
        : '<div class="rq-empty"><b>' + (ui.f === 'pending' ? 'مفيش طلبات مستنية' : 'مفيش طلبات هنا') + '</b><span>طلبات الشراء بتتعمل من «مخزوني وجرد ← طلب شراء»، أو من «اقتراحات البرنامج» فوق.</span></div>');
  }
  function page() {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="rq" id="rq-root"></div>';
    ls('ax_rq_seen_' + user().id, Date.now());
    render(); badge();
  }

  /* ── sidebar badge: pending for the admin, fresh decisions for the others ── */
  function badgeCount() {
    var u = user(); if (!u.id) return 0;
    if (isAdmin()) return list().filter(function (r) { return r.status === 'pending'; }).length;
    var seen = +ls('ax_rq_seen_' + u.id) || 0;
    return list().filter(function (r) { return r.by && r.by.id === u.id && (r.status === 'approved' || r.status === 'rejected') && (r.decidedAt || 0) > seen; }).length;
  }
  function badge() {
    var el = document.querySelector('#sidebar-nav .nav-item[onclick*="\'requests\'"]'); if (!el) return;
    var b = el.querySelector('.rq-badge'); if (b) b.remove();
    var n = badgeCount();
    if (n > 0) el.insertAdjacentHTML('beforeend', '<span class="badge rq-badge">' + (n > 9 ? '9+' : n) + '</span>');
  }

  window.renderRequests = page;
  window.AXReq = {
    render: render, create: create, quick: quick, approve: approve, reject: reject, doReject: doReject, withdraw: withdraw,
    reply: reply, doReply: doReply, idea: idea, saveIdea: saveIdea, pendingFor: pendingFor, badge: badge, badgeCount: badgeCount, list: list,
    filter: function (f) { ui.f = f; render(); },
    openPO: function () { navigate('stock'); setTimeout(function () { if (window.AXStock) AXStock.tab('po'); }, 120); }
  };
})();

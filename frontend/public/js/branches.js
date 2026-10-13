/* ════════════════════════════════════════════════════════════════════
   ERP · الفروع (4.32 · المرحلة 2) — اختيار الفرع + إدارة الفروع
   · فوق: اسم الفرع المفتوح دايمًا باين (الكمبيوتر جنب عنوان الصفحة،
     الموبايل تحت اسم الشركة). تضغط عليه → تختار فرع تاني.
   · تغيير الفرع: اللي لسه متحفظش بيتبعت الأول (أو بيستنى في طابور
     الجهاز باسم فرعه)، وبعدين البرنامج بيتفتح من جديد على الفرع
     التاني — مفيش أي بيانات من الفرع القديم بتفضل في الذاكرة.
   · المدير: «إدارة الفروع» — فرع جديد، تغيير الاسم والكود، قفل/فتح
     فرع (مفيش مسح)، ومين من الموظفين يفتح أنهي فرع.
   The server decides what each user may open (X-Branch, backend/src/branches.js).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var IC = {
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15v3M11 11v7M15 7v11M19 4v14"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
  };
  function B() { return window.Branch; }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || null; }
  function isAdmin() { var u = me(); return !!(u && u.role === 'admin'); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function say(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function api(method, url, body) {
    return fetch(API_BASE + url, { method: method, credentials: 'same-origin', cache: 'no-store', headers: Object.assign({ 'X-Branch': 'main' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
  }
  function switchable() { return B() && B().allowed().length > 1; }

  /* ── the chip (always shows the open branch) ── */
  function chipHtml(kind) {
    var b = B().info(), sw = switchable() || isAdmin();
    return '<button type="button" class="axb-chip ' + kind + (b.main ? ' is-main' : '') + '" ' + (sw ? 'onclick="AXBranch.open()" aria-haspopup="dialog"' : 'tabindex="-1"') +
      ' aria-label="الفرع المفتوح: ' + esc(b.name) + '" title="الفرع المفتوح: ' + esc(b.name) + '">' +
      '<i class="axb-ic">' + IC.shop + '</i><em class="axb-nm">' + esc(b.name) + '</em>' + (b.code ? '<i class="axb-cd">' + esc(b.code) + '</i>' : '') + (sw ? '<i class="axb-cv">' + IC.chev + '</i>' : '') + '</button>';
  }
  function mount() {
    if (!B() || !me()) { document.querySelectorAll('.axb-chip').forEach(function (e) { e.remove(); }); return; }
    var title = document.getElementById('topbar-title'), mid = document.getElementById('mh-id');
    var d = document.getElementById('axb-chip-d'), m = document.getElementById('axb-chip-m');
    var sig = B().get() + '|' + B().info().name + '|' + B().info().code + '|' + switchable() + '|' + isAdmin();
    if (title && (!d || d.getAttribute('data-sig') !== sig)) {
      if (d) d.remove();
      title.insertAdjacentHTML('afterend', chipHtml('d').replace('<button ', '<button id="axb-chip-d" data-sig="' + esc(sig) + '" '));
    }
    if (mid && (!m || m.getAttribute('data-sig') !== sig || m.parentNode !== mid)) {
      if (m) m.remove();
      mid.insertAdjacentHTML('beforeend', chipHtml('m').replace('<button ', '<button id="axb-chip-m" data-sig="' + esc(sig) + '" '));
    }
    document.documentElement.setAttribute('data-branch', B().get());
  }

  /* ── a bottom sheet / centred panel ── */
  function sheet(id, title, body) {
    close();
    var el = document.createElement('div');
    el.id = 'axb-sheet'; el.className = 'axb-wrap'; el.setAttribute('data-k', id);
    el.innerHTML = '<div class="axb-scrim" onclick="AXBranch.close()"></div><section class="axb-panel" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header class="axb-head"><b>' + esc(title) + '</b><button type="button" class="axb-x" onclick="AXBranch.close()" aria-label="إغلاق">' + IC.x + '</button></header>' +
      '<div class="axb-body">' + body + '</div></section>';
    document.body.appendChild(el);
    void el.offsetWidth; el.classList.add('show');
    document.documentElement.classList.add('axb-lock');
    return el;
  }
  function close() {
    var el = document.getElementById('axb-sheet'); if (!el) return;
    el.remove(); document.documentElement.classList.remove('axb-lock');
  }

  /* ── pick a branch ── */
  function open() {
    var cur = B().get(), allowed = B().allowed();
    var rows = B().list().filter(function (b) { return allowed.indexOf(b.id) >= 0; }).map(function (b) {
      var on = b.id === cur;
      return '<button type="button" class="axb-row' + (on ? ' on' : '') + '" onclick="AXBranch.go(\'' + q(b.id) + '\')"' + (on ? ' aria-current="true"' : '') + '>' +
        '<span class="axb-ri">' + IC.shop + '</span><span class="axb-rt"><b>' + esc(b.name) + '</b><em>' + (b.main ? 'الفرع الأساسي · بياناتك الحالية' : 'مخزن وحسابات مستقلة') + (b.code ? ' · ' + esc(b.code) : '') + '</em></span>' +
        (on ? '<span class="axb-ok">' + IC.check + '</span>' : '') + '</button>';
    }).join('');
    var all = isAdmin() && B().list().filter(function (b) { return b.active; }).length > 1
      ? '<button type="button" class="axb-all" onclick="AXBranch.overview()"><span class="axb-ri">' + IC.chart + '</span><span class="axb-rt"><b>جميع الفروع</b><em>مبيعات وأرباح وخزائن ومخزون كل فرع والإجمالي</em></span><i class="axb-go">' + IC.left + '</i></button>' : '';
    sheet('pick', 'اختار الفرع', all + '<p class="axb-lead">كل فرع ليه مخزنه وعملاءه وموردينه وفواتيره وخزنته. اللي هتشوفه وتسجّله بعد الاختيار بيخص الفرع ده بس.</p>' +
      '<div class="axb-list">' + rows + '</div>' +
      (isAdmin() ? '<button type="button" class="axb-manage" onclick="AXBranch.manage()">' + IC.gear + ' إدارة الفروع</button>' : ''));
  }
  async function go(id) {
    if (!B() || id === B().get()) { close(); return; }
    if (B().allowed().indexOf(id) < 0) { say('مالكش صلاحية على الفرع ده', 'error'); return; }
    var name = B().info(id).name;
    /* what is still being saved goes first; anything that can't be sent now waits in this device's queue
       under ITS branch (it is sent there later, whatever branch is open) */
    try { if (DB._saveTimer || DB._saveInflight) { clearTimeout(DB._saveTimer); await DB._flush(); } } catch (_) { /* queued instead */ }
    try { if (window.OfflineManager && OfflineManager.snapshotSettled) await OfflineManager.snapshotSettled(); } catch (_) { /* the copy is only a cache */ }
    B().remember(id);
    window.__axLeaving = true;                 // the reload cuts any pull in flight — not an error
    close();
    var o = document.createElement('div'); o.className = 'axb-switching';
    o.innerHTML = '<div><i>' + IC.shop + '</i><b>' + esc(name) + '</b><span>بيفتح الفرع…</span></div>';
    document.body.appendChild(o);
    setTimeout(function () { location.reload(); }, 260);
  }

  /* ── «إدارة الفروع» (admin) ── */
  function users() { return ((typeof DB !== 'undefined' && DB.data && DB.data.users) || []).filter(function (u) { return u && u.role !== 'admin' && !u.disabled; }); }
  function userBranches(u) { return Array.isArray(u.branches) ? u.branches.slice() : ['main']; }
  var draft = null;     // userId → [branch ids] while the sheet is open
  async function refreshList() {
    var j = await api('GET', '/api/branches');
    if (j.__status === 200 && B()) { B().set(j); try { localStorage.setItem(B()._k(B()._uid, 's'), JSON.stringify(j)); } catch (_) { /* cache only */ } }
    mount();
  }
  function manageHtml() {
    var list = B().list();
    var rows = list.map(function (b) {
      return '<div class="axb-br' + (b.active ? '' : ' off') + '" data-id="' + esc(b.id) + '">' +
        '<div class="axb-br1"><span class="axb-ri">' + IC.shop + '</span>' +
          '<input class="axb-in" id="axb-n-' + esc(b.id) + '" value="' + esc(b.name) + '" maxlength="60" aria-label="اسم الفرع">' +
          '<input class="axb-in axb-code" id="axb-c-' + esc(b.id) + '" value="' + esc(b.code) + '" maxlength="4" aria-label="كود الفرع" placeholder="كود">' +
        '</div>' +
        '<div class="axb-br2">' +
          (b.main ? '<span class="axb-tag">الأساسي · البيانات الحالية</span>' : '<label class="axb-sw"><input type="checkbox" id="axb-a-' + esc(b.id) + '"' + (b.active ? ' checked' : '') + '><span></span>' + (b.active ? 'شغّال' : 'مقفول') + '</label>') +
          '<button type="button" class="axb-btn" onclick="AXBranch.saveBranch(\'' + q(b.id) + '\')">حفظ</button>' +
        '</div></div>';
    }).join('');
    var act = list.filter(function (b) { return b.active; });
    var us = users();
    if (!draft) { draft = {}; us.forEach(function (u) { draft[u.id] = userBranches(u); }); }
    var matrix = us.length ? us.map(function (u) {
      return '<div class="axb-u"><b>' + esc(u.name || u.username) + '</b><div class="axb-uc">' + act.map(function (b) {
        var on = draft[u.id].indexOf(b.id) >= 0;
        return '<button type="button" class="axb-ch' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="AXBranch.toggleUser(\'' + q(u.id) + '\',\'' + q(b.id) + '\')">' + esc(b.name) + '</button>';
      }).join('') + '</div></div>';
    }).join('') : '<p class="axb-lead">مفيش موظفين غير المدير لسه.</p>';
    return '<div class="axb-new"><input class="axb-in" id="axb-new-n" maxlength="60" placeholder="اسم فرع جديد (مثلًا: فرع طنطا)"><input class="axb-in axb-code" id="axb-new-c" maxlength="4" placeholder="كود">' +
        '<button type="button" class="axb-btn pri" onclick="AXBranch.addBranch()">' + IC.plus + ' إضافة</button></div>' +
      '<h4 class="axb-h">الفروع</h4><div class="axb-brs">' + rows + '</div>' +
      '<p class="axb-note">الفرع مبيتمسحش — لو مش محتاجه اقفله، وبياناته بتفضل محفوظة.</p>' +
      '<h4 class="axb-h">مين يفتح أنهي فرع</h4><p class="axb-lead">المدير بيفتح كل الفروع. الموظف اللي ملوش اختيار بيفضل على الفرع الأساسي زي ما هو.</p>' +
      '<div class="axb-us">' + matrix + '</div>' +
      (us.length ? '<button type="button" class="axb-btn pri wide" onclick="AXBranch.saveUsers()">حفظ صلاحيات الفروع</button>' : '');
  }
  async function manage() {
    if (!isAdmin()) return;
    draft = null;
    await refreshList();
    sheet('manage', 'إدارة الفروع', manageHtml());
  }
  function redraw() { var el = document.getElementById('axb-sheet'); if (el && el.getAttribute('data-k') === 'manage') el.querySelector('.axb-body').innerHTML = manageHtml(); }
  async function addBranch() {
    var n = document.getElementById('axb-new-n'), c = document.getElementById('axb-new-c');
    var name = (n && n.value || '').trim();
    if (!name) { say('اكتب اسم الفرع', 'error'); if (n) n.focus(); return; }
    var j = await api('POST', '/api/branches', { name: name, code: c ? c.value : '' });
    if (j.__status !== 200) { say(j.message || 'محصلش', 'error'); return; }
    say('✓ اتعمل ' + j.branch.name + ' — بمخزن وحسابات جديدة فاضية');
    await refreshList(); redraw();
  }
  async function saveBranch(id) {
    var body = { name: (document.getElementById('axb-n-' + id) || {}).value, code: (document.getElementById('axb-c-' + id) || {}).value };
    var a = document.getElementById('axb-a-' + id); if (a) body.active = a.checked;
    var j = await api('PUT', '/api/branches/' + encodeURIComponent(id), body);
    if (j.__status !== 200) { say(j.message || 'محصلش', 'error'); return; }
    say('✓ اتحفظ ' + j.branch.name);
    await refreshList(); redraw();
  }
  function toggleUser(uid, bid) {
    if (!draft || !draft[uid]) return;
    var l = draft[uid], i = l.indexOf(bid);
    if (i >= 0) { if (l.length === 1) { say('لازم يفضل فرع واحد على الأقل', 'warning'); return; } l.splice(i, 1); } else l.push(bid);
    redraw();
  }
  function saveUsers() {
    if (!draft || typeof DB === 'undefined') return;
    var n = 0;
    (DB.data.users || []).forEach(function (u) {
      if (!u || !draft[u.id]) return;
      var next = draft[u.id].slice().sort(), was = userBranches(u).sort();
      if (next.join('|') === was.join('|')) return;
      u.branches = next; n++;
    });
    if (!n) { say('مفيش تغيير'); return; }
    DB.save();
    say('✓ اتحفظت صلاحيات الفروع (' + n + ' موظف)');
    draft = null; redraw();
  }

  /* ── «جميع الفروع» (admin) — 4.33 · المرحلة 3 ── */
  var ov = { p: 'month', from: '', to: '', data: null, busy: false };
  var PERIODS = [['today', 'النهارده'], ['month', 'الشهر ده'], ['last', 'الشهر اللي فات'], ['year', 'السنة دي'], ['all', 'الكل']];
  function money(n) { var v = Math.round(Number(n) || 0); try { if (typeof fmtCurrency === 'function') return fmtCurrency(v).replace(/\.00(?=\D|$)/, ''); } catch (_) { /* plain */ } return v.toLocaleString('en-US') + ' ج.م'; }
  function num(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function dmy(s) { var p = String(s || '').split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : s; }
  function overviewHtml() {
    var d = ov.data;
    var chips = '<div class="axo-per" role="tablist">' + PERIODS.map(function (x) { return '<button type="button" role="tab" aria-selected="' + (ov.p === x[0]) + '" class="' + (ov.p === x[0] ? 'on' : '') + '" onclick="AXBranch.period(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div>';
    if (!d) return chips + '<div class="axo-load">' + (ov.busy ? 'بيحسب أرقام الفروع…' : 'مفيش اتصال بالسيرفر — جرّب تاني') + '</div>';
    var t = d.total, list = d.branches.slice(), maxS = Math.max(1, Math.max.apply(null, list.map(function (b) { return b.sales; })));
    var when = d.period === 'all' ? 'من أول يوم' : (d.from === d.to ? dmy(d.from) : dmy(d.from) + ' ← ' + dmy(d.to));
    var k = function (lbl, v, sub, cls) { return '<div class="axo-k' + (cls ? ' ' + cls : '') + '"><span>' + lbl + '</span><b>' + v + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>'; };
    var head = '<div class="axo-hero"><div><span>إجمالي مبيعات كل الفروع · ' + esc(when) + '</span><b>' + money(t.sales) + '</b><em>' + num(t.salesDocs) + ' عملية بيع · ' + list.length + ' فروع</em></div>' +
      '<div class="axo-hp"><span>صافي الربح</span><b class="' + (t.profit < 0 ? 'neg' : '') + '">' + money(t.profit) + '</b><em>بعد التكلفة والمصروفات</em></div></div>';
    var grid = '<div class="axo-grid">' +
      k('التحصيل', money(t.collections), num(t.collectionsCount) + ' عملية') +
      k('المشتريات', money(t.purchases), 'فواتير الشراء') +
      k('المصروفات', money(t.expenses), 'من غير المشتريات') +
      k('الخزائن', money(t.treasury), 'الرصيد الحالي', t.treasury < 0 ? 'neg' : '') +
      k('مديونيات العملاء', money(t.receivables), num(t.customers) + ' عميل') +
      k('مستحق للموردين', money(t.payables), num(t.suppliers) + ' مورد') +
      k('قيمة المخزون', money(t.stockValue), num(t.products) + ' صنف' + (t.lowStock ? ' · ' + num(t.lowStock) + ' تحت الحد' : '')) +
      k('الربح الإجمالي', money(t.gross), 'المبيعات − التكلفة') + '</div>';
    var bars = '<h4 class="axb-h">المبيعات حسب الفرع</h4><div class="axo-bars">' + list.map(function (b) {
      var pc = t.sales > 0 ? Math.round(b.sales / t.sales * 100) : 0;
      return '<div class="axo-bar"><span class="axo-bn">' + esc(b.name) + '</span><span class="axo-bt"><i style="width:' + Math.max(b.sales > 0 ? 2 : 0, b.sales / maxS * 100).toFixed(1) + '%"></i></span><span class="axo-bv">' + money(b.sales) + ' <small>' + pc + '%</small></span></div>';
    }).join('') + '</div>';
    var cards = '<h4 class="axb-h">كل فرع لوحده</h4><div class="axo-cards">' + list.map(function (b) {
      var cur = b.id === B().get();
      var r = function (l, v, cls) { return '<div class="axo-r' + (cls ? ' ' + cls : '') + '"><span>' + l + '</span><b>' + v + '</b></div>'; };
      return '<article class="axo-c' + (cur ? ' cur' : '') + '"><header><span class="axb-ri">' + IC.shop + '</span><div><b>' + esc(b.name) + '</b><em>' + (b.main ? 'الفرع الأساسي' : 'فرع') + (b.code ? ' · ' + esc(b.code) : '') + (cur ? ' · مفتوح دلوقتي' : '') + '</em></div></header>' +
        '<div class="axo-cs"><span>المبيعات</span><b>' + money(b.sales) + '</b><em>' + num(b.salesDocs) + ' عملية</em></div>' +
        r('صافي الربح', money(b.profit), b.profit < 0 ? 'neg' : 'pos') + r('التحصيل', money(b.collections)) + r('المشتريات', money(b.purchases)) + r('المصروفات', money(b.expenses)) +
        r('الخزنة', money(b.treasury), b.treasury < 0 ? 'neg' : '') + r('مديونيات العملاء', money(b.receivables)) + r('مستحق للموردين', money(b.payables)) + r('قيمة المخزون', money(b.stockValue)) +
        (cur ? '<button type="button" class="axb-btn wide" disabled>انت فيه دلوقتي</button>' : (B().allowed().indexOf(b.id) >= 0 ? '<button type="button" class="axb-btn pri wide" onclick="AXBranch.go(\'' + q(b.id) + '\')">افتح ' + esc(b.name) + '</button>' : '')) +
        '</article>';
    }).join('') + '</div>';
    return chips + head + grid + bars + cards + '<p class="axb-note">المبيعات = الصرف + الفواتير اللي مش طالعة من صرف · الربح = المبيعات بعد الخصم − تكلفة الأصناف − المصروفات · الخزنة = التحصيل − المصروفات − سداد الموردين (زي لوحة التحكم). التحويلات بين الفروع مش بتتحسب مبيعات.</p>';
  }
  function redrawOv() { var el = document.getElementById('axb-sheet'); if (el && el.getAttribute('data-k') === 'all') el.querySelector('.axb-body').innerHTML = overviewHtml(); }
  async function loadOv() {
    ov.busy = true; redrawOv();
    try {
      var r = await fetch(API_BASE + '/api/branches/summary?p=' + encodeURIComponent(ov.p), { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Branch': 'main' } });
      ov.data = r.ok ? await r.json() : null;
    } catch (_) { ov.data = null; }
    ov.busy = false; redrawOv();
  }
  function overview() {
    if (!isAdmin()) return;
    ov.data = null;
    var el = sheet('all', 'جميع الفروع', overviewHtml());
    el.classList.add('axo');
    loadOv();
  }
  function period(p) { ov.p = p; ov.data = null; loadOv(); }

  /* keep the chip in place: the header is rebuilt on every page change */
  var o = window.updateHomeFab;
  if (typeof o === 'function' && !o._axb) {
    var w = function () { var r = o.apply(this, arguments); try { mount(); } catch (e) { console.warn('[branches]', e); } return r; };
    w._axb = true; window.updateHomeFab = w;
  }
  document.addEventListener('ax:branch', function () { try { mount(); } catch (_) { /* before the app is drawn */ } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('axb-sheet')) close(); });

  window.AXBranch = { overview: overview, period: period, mount: mount, open: open, close: close, go: go, manage: manage, addBranch: addBranch, saveBranch: saveBranch, toggleUser: toggleUser, saveUsers: saveUsers };
})();

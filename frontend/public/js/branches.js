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
        '<span class="axb-ri">' + IC.shop + '</span><span class="axb-rt"><b>' + esc(b.name) + '</b><em>' + (b.main ? 'البيانات الحالية للشركة' : 'مخزن وحسابات مستقلة') + (b.code ? ' · ' + esc(b.code) : '') + '</em></span>' +
        (on ? '<span class="axb-ok">' + IC.check + '</span>' : '') + '</button>';
    }).join('');
    sheet('pick', 'اختار الفرع', '<p class="axb-lead">كل فرع ليه مخزنه وعملاءه وموردينه وفواتيره وخزنته. اللي هتشوفه وتسجّله بعد الاختيار بيخص الفرع ده بس.</p>' +
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

  /* keep the chip in place: the header is rebuilt on every page change */
  var o = window.updateHomeFab;
  if (typeof o === 'function' && !o._axb) {
    var w = function () { var r = o.apply(this, arguments); try { mount(); } catch (e) { console.warn('[branches]', e); } return r; };
    w._axb = true; window.updateHomeFab = w;
  }
  document.addEventListener('ax:branch', function () { try { mount(); } catch (_) { /* before the app is drawn */ } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('axb-sheet')) close(); });

  window.AXBranch = { mount: mount, open: open, close: close, go: go, manage: manage, addBranch: addBranch, saveBranch: saveBranch, toggleUser: toggleUser, saveUsers: saveUsers };
})();

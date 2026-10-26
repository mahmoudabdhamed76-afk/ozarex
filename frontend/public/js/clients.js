/* ════════════════════════════════════════════════════════════════════
   ERP · «متابعة العملاء» (4.72) — تحت «الموظفين»
   لينك لكل مركز (/p/<token>) يدخل منه يشوف فواتيره والورق اللي وصله
   يوم بيوم أو بالشهر أو بالسنة، ورصيده وكشف حسابه — من نفس بيانات
   التحصيل والمديونيات. اللينكات نفسها اللي في «أعمار الديون» (settings._portal).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { q: '', f: 'all' };
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function base() { return typeof API_BASE !== 'undefined' && API_BASE ? API_BASE : location.origin; }
  function url(tok) { return base().replace(/\/$/, '') + (String(tok).length <= 12 ? '/c/' : '/p/') + tok; }
  function phoneOf(c) { try { return typeof normalizeEgyptianPhone === 'function' ? normalizeEgyptianPhone(c.phone) : String(c.phone || '').replace(/\D/g, ''); } catch (e) { return ''; } }
  function company() { return S().companyName || 'Ozarex'; }
  function links() { return S()._portal || {}; }
  function newToken() {   // 4.73 · short code (8 letters/digits) → /c/xxxxxxxx
    var AB = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', used = {}, L = (S()._portal || {}), k, t;
    for (k in L) used[L[k]] = 1;
    do { var a = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(a); t = Array.from(a, function (b) { return AB.charAt(b % AB.length); }).join(''); } while (used[t]);
    return t;
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim(); }

  function rows() {
    var m = today().slice(0, 7), L = links(), byC = {};
    A('issuances').forEach(function (i) {
      var x = byC[i.customerId] || (byC[i.customerId] = { n: 0, val: 0, last: '' });
      if (String(i.date || '').slice(0, 7) === m) { x.n++; x.val += Number(i.total) || 0; }
      if (String(i.date || '') > x.last) x.last = String(i.date || '');
    });
    return A('customers').map(function (c) { var x = byC[c.id] || { n: 0, val: 0, last: '' }; return { c: c, tok: L[c.id] || '', n: x.n, val: x.val, last: x.last, bal: Number(c.balance) || 0 }; });
  }
  function card(r) {
    var c = r.c, ph = phoneOf(c);
    return '<div class="cl-it' + (r.tok ? ' on' : '') + '"><div class="cl-h"><span class="cl-av">' + esc(String(c.name || '?').trim().charAt(0)) + '</span><div class="cl-n"><b>' + esc(c.name) + '</b><small>' +
      (r.n ? '🚚 ' + r.n + ' صرف الشهر ده · ' + num(r.val) : (r.last ? 'آخر صرف ' + esc(r.last) : 'مفيش صرف لسه')) + '</small></div>' +
      '<div class="cl-b ' + (r.bal > 0.5 ? 'd' : '') + '"><b>' + num(Math.max(0, r.bal)) + '</b><small>' + (r.bal > 0.5 ? 'عليه' : 'مسدد') + '</small></div></div>' +
      (r.tok
        ? '<div class="cl-l"><input readonly value="' + esc(url(r.tok)) + '" onclick="this.select()"><button class="btn btn-secondary btn-sm" onclick="AXClients.copy(\'' + c.id + '\')">نسخ</button></div>' +
          '<div class="cl-a"><a class="btn btn-secondary btn-sm" href="' + esc(url(r.tok)) + '" target="_blank" rel="noopener">👁 فتح</a>' +
          (ph ? '<button class="btn btn-secondary btn-sm cl-wa" onclick="AXClients.wa(\'' + c.id + '\')">واتساب</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="AXClients.rotate(\'' + c.id + '\')" title="لينك جديد والقديم يقف">↻ لينك جديد</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="AXClients.stop(\'' + c.id + '\')">⏸ إيقاف</button></div>'
        : '<div class="cl-a"><button class="btn btn-primary btn-sm" onclick="AXClients.make(\'' + c.id + '\')">🔗 اعمل لينك</button><span class="cl-mt">لسه ملوش لينك</span></div>') +
      '</div>';
  }
  function render() {
    var root = document.getElementById('cl-root'); if (!root) return;
    var all = rows(), on = all.filter(function (r) { return r.tok; }).length, q = norm(ui.q);
    var list = all.filter(function (r) { return (ui.f === 'all' || (ui.f === 'on' ? r.tok : !r.tok)) && (!q || norm(r.c.name).indexOf(q) >= 0 || String(r.c.phone || '').indexOf(ui.q) >= 0); })
      .sort(function (a, b) { return b.n - a.n || b.bal - a.bal || String(a.c.name).localeCompare(String(b.c.name), 'ar'); });
    root.innerHTML =
      '<div class="page-header"><div><h2 class="page-title">متابعة العملاء</h2><p class="page-subtitle">لينك لكل مركز يشوف منه فواتيره والورق اللي وصله باليوم أو بالشهر أو بالسنة — من غير ما يدخل البرنامج</p></div>' +
      '<div class="page-actions">' + (all.some(function (r) { return r.tok && r.tok.length > 12; }) ? '<button class="btn btn-secondary" onclick="AXClients.shortAll()">✂ اختصر اللينكات الطويلة</button>' : '') + (all.length > on ? '<button class="btn btn-primary" onclick="AXClients.makeAll()">🔗 اعمل لينك لكل المراكز (' + (all.length - on) + ')</button>' : '') + '</div></div>' +
      '<div class="cl-st"><div><b>' + all.length + '</b><span>مركز</span></div><div class="ok"><b>' + on + '</b><span>ليهم لينك</span></div><div><b>' + (all.length - on) + '</b><span>من غير لينك</span></div></div>' +
      '<div class="cl-bar"><input class="form-control cl-q" placeholder="🔍 دوّر على مركز بالاسم أو التليفون" value="' + esc(ui.q) + '" oninput="AXClients.search(this.value)">' +
      '<div class="cl-seg">' + [['all', 'الكل'], ['on', 'ليهم لينك'], ['off', 'من غير لينك']].map(function (x) { return '<button class="' + (ui.f === x[0] ? 'on' : '') + '" onclick="AXClients.filter(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      (list.length ? '<div class="cl-list">' + list.map(card).join('') + '</div>' : '<div class="card stf-empty"><p>' + (all.length ? 'مفيش مراكز بالبحث ده.' : 'لسه مفيش مراكز — ضيفهم من «العملاء والمراكز».') + '</p></div>') +
      '<p class="stf-note">اللي بيظهر للمركز: الورق اللي اتصرفله (الصنف والكمية والقيمة وحالة السداد)، الفواتير بأصنافها، التحصيلات، ورصيده وكشف حسابه — قراءة بس. «لينك جديد» بيوقف القديم على طول.</p>';
  }
  function save(p) { S()._portal = p; if (typeof DB !== 'undefined' && DB.save) DB.save(); }
  function make(cid) { var p = Object.assign({}, links()); p[cid] = newToken(); save(p); T('اتعمل اللينك ✅'); render(); }
  function makeAll() {
    var p = Object.assign({}, links()), n = 0;
    A('customers').forEach(function (c) { if (!p[c.id]) { p[c.id] = newToken(); n++; } });
    if (!n) return; save(p); T('اتعمل ' + n + ' لينك ✅'); render();
  }
  function shortAll() {
    var go = function () { var p = Object.assign({}, links()), n = 0; Object.keys(p).forEach(function (k) { if (String(p[k]).length > 12) { S()._portal = p; p[k] = newToken(); n++; } }); save(p); T('اتختصر ' + n + ' لينك — ابعت اللينكات الجديدة للمراكز'); render(); };
    var msg = 'هتتعمل لينكات قصيرة بدل الطويلة، واللينكات الطويلة القديمة هتقف — لازم تبعت الجديدة للمراكز. تكمل؟';
    if (typeof confirmDialog === 'function') confirmDialog(msg, go); else if (confirm(msg)) go();
  }
  function rotate(cid) {
    var go = function () { var p = Object.assign({}, links()); p[cid] = newToken(); save(p); T('اتعمل لينك جديد — القديم وقف'); render(); };
    if (typeof confirmDialog === 'function') confirmDialog('تعمل لينك جديد؟ اللينك القديم هيقف على طول.', go); else if (confirm('تعمل لينك جديد؟ اللينك القديم هيقف.')) go();
  }
  function stop(cid) {
    var go = function () { var p = Object.assign({}, links()); delete p[cid]; save(p); T('اللينك اتوقف', 'info'); render(); };
    if (typeof confirmDialog === 'function') confirmDialog('توقف اللينك ده؟ المركز مش هيقدر يفتحه تاني.', go); else if (confirm('توقف اللينك؟')) go();
  }
  function copy(cid) {
    var tok = links()[cid]; if (!tok) return; var u = url(tok);
    try { navigator.clipboard.writeText(u).then(function () { T('اتنسخ ✓'); }, function () { T('انسخه من الخانة', 'info'); }); } catch (e) { T('انسخه من الخانة', 'info'); }
  }
  function wa(cid) {
    var c = A('customers').filter(function (x) { return x.id === cid; })[0], tok = links()[cid]; if (!c || !tok) return;
    var txt = 'السلام عليكم ' + c.name + ' 🌿\nده لينك متابعة حسابكم عند *' + company() + '*\nتقدروا تشوفوا منه الورق اللي وصلكم والفواتير باليوم أو بالشهر أو بالسنة، والرصيد وكشف الحساب في أي وقت:\n' + url(tok) + '\n\nشكراً لتعاملكم معانا 🙏';
    window.open('https://wa.me/' + phoneOf(c) + '?text=' + encodeURIComponent(txt), '_blank');
  }

  window.renderClients = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="cl" id="cl-root"></div>';
    render();
  };
  window.AXClients = {
    render: render, make: make, makeAll: makeAll, shortAll: shortAll, rotate: rotate, stop: stop, copy: copy, wa: wa,
    filter: function (f) { ui.f = f; render(); },
    search: function (q) { ui.q = String(q || ''); clearTimeout(ui.t); ui.t = setTimeout(function () { render(); var i = document.querySelector('.cl-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 220); }
  };
})();

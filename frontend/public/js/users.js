/* ════════════════════════════════════════════════════════════════════
   ERP · المستخدمين وصلاحياتهم (4.8)
   ------------------------------------------------------------------
   المدير بيحدد لكل مستخدم لوحده:
     · الأقسام اللي يدخلها (لوحة التحكم وطلبات الموافقة دايماً متاحين)
     · إيه اللي يحتاج موافقته:
         الحساس بس (زي 4.6) · أي تعديل أو حذف · من غير موافقة
   بيتحفظ على المستخدم نفسه (pages / approval) — والسيرفر بيطبّقها.
   Replaces renderUsers / openUserForm / saveUser of index.html.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var LV = [
    ['sensitive', 'الحساس بس بموافقتك', 'الحذف وتعديل الفواتير والفلوس والأرصدة وكميات المخزن بيروحلك في «طلبات الموافقة». باقي التعديلات بتتنفذ على طول.'],
    ['edits', 'أي تعديل أو حذف بموافقتك', 'أي تعديل أو حذف في أي حاجة بيروحلك الأول. الإضافة الجديدة (فاتورة، صرف، تحصيل…) بتتسجل على طول.'],
    ['none', 'من غير موافقة', 'كل تعديلاته بتتنفذ على طول (إلا لو الفترة مقفولة). وكله بيتسجل في سجل التعديلات.']
  ];
  var ROLE = { admin: 'مدير', accountant: 'محاسب', sales: 'موظف مبيعات' };
  var ALWAYS = ['dashboard', 'approvals', 'requests'];
  var form = { pages: [] };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function users() { var d = D(); if (!Array.isArray(d.users)) d.users = []; return d.users; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function adminOnly() { try { return ADMIN_ONLY_PAGES; } catch (e) { return ['users', 'audit', 'security', 'settings']; } }
  function navs() { try { return NAV_ITEMS.filter(function (n) { return adminOnly().indexOf(n.key) < 0; }); } catch (e) { return []; } }
  function roleDefault(role) { try { return (PERMISSIONS[role] || []).filter(function (k) { return adminOnly().indexOf(k) < 0; }); } catch (e) { return []; } }
  function pagesOf(u) { return typeof userPages === 'function' ? userPages(u) : roleDefault(u.role); }
  function levelOf(u) { if (u.role === 'admin') return 'admin'; return u.approval === 'edits' || u.approval === 'none' ? u.approval : 'sensitive'; }
  function lvLabel(l) { var x = LV.find(function (v) { return v[0] === l; }); return x ? x[1] : 'كل الصلاحيات'; }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || {}; }
  function labelOf(k) { var n = navs().find(function (x) { return x.key === k; }); return n ? n.label : k; }

  function render() {
    var root = document.getElementById('page-content'); if (!root) return;
    var list = users().slice().sort(function (a, b) { return (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || String(a.name).localeCompare(String(b.name), 'ar'); });
    var count = function (r) { return list.filter(function (u) { return u.role === r; }).length; };
    var total = navs().length;
    root.innerHTML =
      '<section class="cus-hero usr-hero">' +
        '<div class="cus-hero-t"><span>المستخدمين</span><b>' + list.length + '</b><small>إنت اللي بتحدد لكل مستخدم الأقسام اللي يدخلها، وإيه اللي يحتاج موافقتك قبل ما يتنفذ.</small></div>' +
        '<div class="cus-hero-figs"><div><span>مدير</span><b>' + count('admin') + '</b></div><div><span>محاسب</span><b>' + count('accountant') + '</b></div><div><span>مبيعات</span><b>' + count('sales') + '</b></div></div>' +
        '<button class="cus-new" onclick="openUserForm()">+ مستخدم جديد</button>' +
      '</section>' +
      '<div class="usr-grid">' + list.map(function (u) {
        var lv = levelOf(u), pg = pagesOf(u).filter(function (k) { return ALWAYS.indexOf(k) < 0; });
        var mine = u.id === me().id;
        return '<article class="usr-card r-' + esc(u.role) + '">' +
          '<header><span class="usr-av">' + esc((u.name || 'U').charAt(0)) + '</span>' +
            '<div><b>' + esc(u.name) + (mine ? ' <em>(إنت)</em>' : '') + '</b><span dir="ltr">@' + esc(u.username) + '</span></div>' +
            '<i class="usr-role">' + (ROLE[u.role] || esc(u.role)) + '</i></header>' +
          '<div class="usr-lv lv-' + lv + '"><span>التعديل والحذف</span><b>' + lvLabel(lv) + '</b></div>' +
          '<div class="usr-pg"><span>الأقسام' + (u.role === 'admin' ? '' : ' · ' + pg.length + ' من ' + (total - ALWAYS.length)) + (u.role !== 'admin' && !Array.isArray(u.pages) ? ' (زي الدور)' : '') + '</span>' +
            (u.role === 'admin' ? '<p>كل الأقسام + المستخدمين والإعدادات والأمان</p>'
              : '<ul>' + pg.slice(0, 12).map(function (k) { return '<li>' + esc(labelOf(k)) + '</li>'; }).join('') + (pg.length > 12 ? '<li>و ' + (pg.length - 12) + ' كمان</li>' : '') + (pg.length ? '' : '<li class="none">لوحة التحكم بس</li>') + '</ul>') +
          '</div>' +
          '<footer><button class="pri" onclick="openUserForm(\'' + u.id + '\')">' + (u.role === 'admin' ? 'تعديل' : 'الصلاحيات والبيانات') + '</button>' +
            (mine ? '' : '<button class="del" onclick="deleteUser(\'' + u.id + '\')">حذف</button>') + '</footer>' +
        '</article>';
      }).join('') + '</div>';
  }

  function chips() {
    var box = document.getElementById('usr-pages'); if (!box) return;
    box.innerHTML = navs().map(function (n, i) {
      var lock = ALWAYS.indexOf(n.key) >= 0, on = lock || form.pages.indexOf(n.key) >= 0;
      return '<button type="button" class="' + (on ? 'on' : '') + (lock ? ' lock' : '') + '" style="--c:' + n.color + '"' + (lock ? ' disabled title="دايماً متاح"' : ' onclick="AXUsers.toggle(' + i + ')"') + '><i>' + (on ? '✓' : '') + '</i>' + esc(n.label) + '</button>';
    }).join('');
  }
  function syncRole() {
    var role = (document.querySelector('#user-form [name=role]') || {}).value;
    var block = document.getElementById('usr-perms');
    if (block) block.style.display = role === 'admin' ? 'none' : '';
    var note = document.getElementById('usr-admin-note');
    if (note) note.style.display = role === 'admin' ? '' : 'none';
  }
  function open(id) {
    var u = id ? users().find(function (x) { return x.id === id; }) : { name: '', username: '', role: 'accountant' };
    if (!u) return;
    form.pages = u.role === 'admin' ? roleDefault('accountant') : pagesOf(u).filter(function (k) { return ALWAYS.indexOf(k) < 0; });
    form.custom = Array.isArray(u.pages);
    var lv = u.role === 'admin' ? 'sensitive' : levelOf(u), self = id && id === me().id;
    openModal(id ? 'صلاحيات ' + esc(u.name) : 'مستخدم جديد',
      '<form id="user-form" class="usr-form" onsubmit="return false">' +
        '<div class="form-row"><div class="form-group"><label>الاسم *</label><input class="form-control" name="name" value="' + esc(u.name) + '" required></div>' +
          '<div class="form-group"><label>اسم الدخول *</label><input class="form-control" name="username" dir="ltr" value="' + esc(u.username) + '" ' + (id ? 'readonly' : 'required') + '></div></div>' +
        '<div class="form-row"><div class="form-group"><label>كلمة السر ' + (id ? '(سيبها فاضية لو مش هتغيّرها)' : '*') + '</label><input class="form-control" type="password" name="password" autocomplete="new-password" ' + (id ? '' : 'required') + ' placeholder="' + (id ? '••••••' : '6 حروف على الأقل') + '"></div>' +
          '<div class="form-group"><label>الدور</label><select class="form-control" name="role" onchange="AXUsers.role(this.value)"' + (self ? ' disabled title="مينفعش تغيّر دورك إنت"' : '') + '>' +
            ['admin', 'accountant', 'sales'].map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + ROLE[r] + '</option>'; }).join('') + '</select></div></div>' +
        '<p class="usr-admin-note" id="usr-admin-note" style="display:none">المدير بيدخل كل الأقسام وتعديلاته بتتنفذ على طول، وهو اللي بيوافق على الطلبات.</p>' +
        '<div id="usr-perms">' +
          '<div class="usr-sec"><b>الأقسام اللي يدخلها</b><span>' +
            '<button type="button" onclick="AXUsers.all(true)">الكل</button><button type="button" onclick="AXUsers.all(false)">ولا حاجة</button><button type="button" onclick="AXUsers.byRole()">زي الدور</button></span></div>' +
          '<div class="apr-pages usr-pages" id="usr-pages"></div>' +
          '<div class="usr-sec"><b>التعديل والحذف</b></div>' +
          '<div class="usr-lvs">' + LV.map(function (v) {
            return '<label class="usr-lvopt"><input type="radio" name="approval" value="' + v[0] + '"' + (lv === v[0] ? ' checked' : '') + '><span><b>' + v[1] + '</b><em>' + v[2] + '</em></span></label>';
          }).join('') + '</div>' +
          '<p class="usr-hint">المستخدمين وسجل التعديلات والإعدادات والأمان للمدير بس.</p>' +
        '</div>' +
      '</form>',
      '<button class="btn btn-primary" onclick="saveUser(\'' + (id || '') + '\')">حفظ</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
    chips(); syncRole();
  }
  function save(id) {
    var f = document.getElementById('user-form'); if (!f) return;
    var d = Object.fromEntries(new FormData(f));
    var u = id ? users().find(function (x) { return x.id === id; }) : null;
    if (id && !u) return;
    d.name = String(d.name || '').trim();
    var role = d.role || (u && u.role) || 'accountant';   // a disabled select (my own role) isn't in the form
    if (!d.name) { T('اكتب الاسم', 'error'); return; }
    if (!id) {
      d.username = String(d.username || '').trim();
      if (!d.username) { T('اكتب اسم الدخول', 'error'); return; }
      if (users().some(function (x) { return String(x.username).toLowerCase() === d.username.toLowerCase(); })) { T('اسم الدخول ده موجود', 'error'); return; }
      if (String(d.password || '').length < 6) { T('كلمة السر 6 حروف على الأقل', 'error'); return; }
    } else if (d.password && String(d.password).length < 6) { T('كلمة السر 6 حروف على الأقل', 'error'); return; }
    if (id && id === me().id && role !== 'admin' && u.role === 'admin') { T('مينفعش تشيل صلاحية المدير من نفسك', 'error'); return; }
    var rec = u || { id: 'u_' + (typeof uid === 'function' ? uid() : Date.now().toString(36)), username: d.username, createdAt: Date.now() };
    rec.name = d.name; rec.role = role;
    if (d.password) rec.password = d.password;           // the server keeps only a hash
    if (role === 'admin') { delete rec.pages; delete rec.approval; }
    else { rec.pages = form.pages.slice(); rec.approval = d.approval || 'sensitive'; }
    if (!u) users().push(rec);
    DB.save(); closeModal();
    T(u ? 'اتحفظت صلاحيات ' + rec.name : 'اتضاف ' + rec.name);
    render();
  }

  window.renderUsers = render;
  window.openUserForm = open;
  window.saveUser = save;
  window.AXUsers = {
    render: render,
    toggle: function (i) { var n = navs()[i]; if (!n) return; var at = form.pages.indexOf(n.key); if (at >= 0) form.pages.splice(at, 1); else form.pages.push(n.key); chips(); },
    all: function (on) { form.pages = on ? navs().map(function (n) { return n.key; }).filter(function (k) { return ALWAYS.indexOf(k) < 0; }) : []; chips(); },
    byRole: function () { var r = (document.querySelector('#user-form [name=role]') || {}).value || 'accountant'; form.pages = roleDefault(r === 'admin' ? 'accountant' : r).filter(function (k) { return ALWAYS.indexOf(k) < 0; }); chips(); },
    role: function (r) { if (r !== 'admin') { form.pages = roleDefault(r).filter(function (k) { return ALWAYS.indexOf(k) < 0; }); chips(); } syncRole(); }
  };
})();

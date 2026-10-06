/* ════════════════════════════════════════════════════════════════════
   ERP · الأمان والنسخ الاحتياطي (admin) — js/security.js
   · كلمة السر بتاعتي (POST /api/password)
   · النسخ الاحتياطية: نسخة يومية مضغوطة برا قاعدة البيانات (آخر 30 يوم)،
     تنزيل، نسخة دلوقتي، استرجاع من ملف، وإرسال لتليجرام
   · قفل الفترة (settings.closedUntil)
   · الأجهزة اللي داخلة دلوقتي + خروج جهاز
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { bk: null, ses: null, loading: false };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function isAdmin() { return typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin'; }
  function base() { return (typeof API_BASE !== 'undefined' ? API_BASE : ''); }
  async function api(path, body) {
    var r = await fetch(base() + path, body === undefined ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var j = null; try { j = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, j: j || {} };
  }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  /* the day inside a backup file name (erp-2026-10-06.json.gz, or the older emdadx-…) — never a fixed position */
  function fileDate(name) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(name || '')); return m ? m[0] : ''; }
  function dmy(ds) { if (!ds) return ''; var p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
  function when(ts) {
    if (!ts) return '—';
    var d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    var s = (Date.now() - d.getTime()) / 1000;
    if (s < 90) return 'دلوقتي';
    if (s < 3600) return 'من ' + Math.round(s / 60) + ' دقيقة';
    if (s < 86400) return 'من ' + Math.round(s / 3600) + ' ساعة';
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function device(ua) {
    ua = String(ua || '');
    var os = /Android/i.test(ua) ? 'أندرويد' : /iPhone|iPad/i.test(ua) ? 'آيفون' : /Windows/i.test(ua) ? 'ويندوز' : /Mac OS/i.test(ua) ? 'ماك' : /Linux/i.test(ua) ? 'لينكس' : 'جهاز';
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return os + (br ? ' · ' + br : '');
  }
  var IC = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    dev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="11" rx="2"/><path d="M6 19h6M9 15v4"/><rect x="17" y="9" width="5" height="11" rx="1.5"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>'
  };

  async function loadRemote() {
    ui.loading = true;
    var b = await api('/api/backups').catch(function () { return null; });
    var s = await api('/api/sessions').catch(function () { return null; });
    ui.bk = b && b.ok ? b.j : { files: [], telegram: { configured: false }, error: true };
    ui.ses = s && s.ok ? s.j.sessions : [];
    ui.loading = false;
    draw();
  }

  function check(ok, title, sub) {
    return '<li class="' + (ok ? 'ok' : 'bad') + '"><i>' + (ok ? IC.ok : IC.warn) + '</i><div><b>' + title + '</b><span>' + sub + '</span></div></li>';
  }

  function draw() {
    var host = document.getElementById('sec-root'); if (!host) return;
    var bk = ui.bk || { files: [], telegram: {} }, tg = bk.telegram || {};
    var files = bk.files || [], last = files[0];
    var weak = sessionStorage.getItem('emx_weak') === '1';
    var closed = S().closedUntil || '';
    var lastMonthEnd = (function () { var d = new Date(); d.setDate(0); return lds(d); })();
    var score = [true, true, !weak, !!last, !!tg.configured, !!closed].filter(Boolean).length;

    host.innerHTML =
      '<section class="cus-hero sec-hero">' +
        '<div class="cus-hero-t"><span>حالة الأمان</span><b>' + score + '<i>/6</i></b>' +
          '<small>الدخول والصلاحيات بقت على السيرفر نفسه — مفيش حد يقدر يتخطاها من المتصفح.</small></div>' +
        '<ul class="sec-checks">' +
          check(true, 'تسجيل الدخول على السيرفر', 'أي طلب للبيانات من غير دخول بيترفض') +
          check(true, 'كلمات السر متشفّرة', 'scrypt — ومحدش يقدر يشوفها حتى المدير') +
          check(!weak, weak ? 'كلمة السر بتاعتك سهلة' : 'كلمة سر المدير', weak ? 'غيّرها من تحت دلوقتي' : 'مش من الكلمات السهلة المعروفة') +
          check(!!last, 'نسخة احتياطية النهارده', last ? 'آخر نسخة ' + when(last.at) : 'لسه — دوس «نسخة دلوقتي»') +
          check(!!tg.configured, 'نسخة برا السيرفر', tg.configured ? 'بتتبعت تليجرام كل يوم' + (tg.at ? ' · آخر مرة ' + when(tg.at) + (tg.ok === false ? ' (فشلت)' : '') : '') : 'شغّل تليجرام (الطريقة تحت)') +
          check(!!closed, 'قفل الفترة', closed ? 'مقفولة لحد ' + dmy(closed) : 'مفيش فترة مقفولة') +
        '</ul>' +
      '</section>' +

      '<div class="sec-grid">' +
      /* password */
      '<section class="sec-card"><header><span class="sec-ic k-key">' + IC.key + '</span><div><b>كلمة السر بتاعتك</b><span>بعد التغيير، كل الأجهزة التانية اللي داخلة بحسابك هتخرج.</span></div></header>' +
        '<form id="sec-pw" onsubmit="AXSec.changePw();return false">' +
          '<div class="form-group"><label>كلمة السر الحالية</label><input class="form-control" type="password" name="current" autocomplete="current-password" required></div>' +
          '<div class="form-row"><div class="form-group"><label>الجديدة</label><input class="form-control" type="password" name="next" autocomplete="new-password" minlength="6" required></div>' +
          '<div class="form-group"><label>تأكيد الجديدة</label><input class="form-control" type="password" name="again" autocomplete="new-password" minlength="6" required></div></div>' +
          '<button class="btn btn-primary" type="submit">' + IC.key + ' غيّر كلمة السر</button>' +
        '</form></section>' +

      /* closing */
      '<section class="sec-card"><header><span class="sec-ic k-lock">' + IC.lock + '</span><div><b>قفل الفترة</b>' +
        '<span>بعد ما تراجع الشهر اقفله: أي إضافة أو تعديل أو حذف بتاريخ في الفترة المقفولة بيروحلك كطلب موافقة، وإنت نفسك بيطلعلك تأكيد.</span></div></header>' +
        '<div class="sec-close-now"><span>' + (closed ? 'مقفولة لحد' : 'مفيش قفل') + '</span><b>' + (closed ? dmy(closed) : '—') + '</b></div>' +
        '<div class="form-row"><div class="form-group"><label>اقفل لحد يوم</label><input class="form-control" type="date" id="sec-close-d" value="' + (closed || lastMonthEnd) + '" max="' + lds(new Date()) + '"></div></div>' +
        '<div class="sec-btns"><button class="btn btn-primary" onclick="AXSec.closeTo()">' + IC.lock + ' اقفل</button>' +
          '<button class="btn btn-secondary" onclick="document.getElementById(\'sec-close-d\').value=\'' + lastMonthEnd + '\'">آخر الشهر اللي فات</button>' +
          (closed ? '<button class="btn btn-ghost" onclick="AXSec.reopen()">افتح الفترة</button>' : '') + '</div></section>' +

      /* backups */
      '<section class="sec-card sec-wide"><header><span class="sec-ic k-box">' + IC.box + '</span><div><b>النسخ الاحتياطية</b>' +
        '<span>نسخة مضغوطة كل يوم في فولدر لوحدها برا قاعدة البيانات (آخر 30 يوم)، وبتتحدّث طول اليوم.</span></div></header>' +
        '<div class="sec-btns">' +
          '<button class="btn btn-primary" onclick="AXSec.backupNow()">' + IC.ok + ' نسخة دلوقتي</button>' +
          '<a class="btn btn-secondary" href="' + base() + '/api/backup/download" download>' + IC.down + ' تنزيل نسخة كاملة</a>' +
          '<button class="btn btn-secondary" onclick="AXSec.pickRestore()">' + IC.up + ' استرجاع من ملف</button>' +
          (tg.configured ? '<button class="btn btn-secondary" onclick="AXSec.telegram()">' + IC.send + ' ابعت لتليجرام دلوقتي</button>' : '') +
        '</div>' +
        (ui.loading && !ui.bk ? '<div class="sec-empty">بيحمّل…</div>' :
          files.length ? '<ul class="sec-files">' + files.slice(0, 30).map(function (f) {
            return '<li><span>' + dmy(fileDate(f.file)) + '</span><em>' + size(f.size) + ' · اتحدّثت ' + when(f.at) + '</em>' +
              '<a href="' + base() + '/api/backup/download?file=' + encodeURIComponent(f.file) + '" download>' + IC.down + ' تنزيل</a></li>';
          }).join('') + '</ul>' : '<div class="sec-empty">لسه مفيش نسخ — أول نسخة بتتعمل أوتوماتيك بعد تشغيل السيرفر بثواني.</div>') +
        '<details class="sec-tg"' + (tg.configured ? '' : ' open') + '><summary>' + IC.send + ' تليجرام: ' + (tg.configured ? 'شغّال ✓' : 'مش متفعّل') + '</summary>' +
          '<ol><li>في تليجرام افتح <b>@BotFather</b> واكتب <code>/newbot</code> — هيديك <b>توكن</b> البوت.</li>' +
          '<li>ابعت أي رسالة للبوت الجديد، وبعدها افتح <b>@userinfobot</b> عشان تعرف <b>رقم المحادثة</b> (Chat ID) بتاعك.</li>' +
          '<li>في Railway: المشروع ← <b>Variables</b> ← ضيف <code>TELEGRAM_BOT_TOKEN</code> و <code>TELEGRAM_CHAT_ID</code> وأعد التشغيل.</li>' +
          '<li>من ساعتها كل يوم هيوصلك ملف النسخة على تليجرام لوحده.</li></ol>' +
          '<p>التوكن بيتحط في إعدادات السيرفر بس — مش جوه البرنامج ومش بيتبعت لأي حد.</p>' +
        '</details>' +
      '</section>' +

      /* devices */
      '<section class="sec-card sec-wide"><header><span class="sec-ic k-dev">' + IC.dev + '</span><div><b>الأجهزة اللي داخلة دلوقتي</b>' +
        '<span>لو في جهاز مش معروف أو موبايل اتسرق، خرّجه من هنا.</span></div></header>' +
        (ui.ses && ui.ses.length ? '<ul class="sec-dev">' + ui.ses.map(function (s) {
          return '<li class="' + (s.me ? 'me' : '') + '"><div><b>' + esc(s.user) + '</b><span>' + esc(device(s.ua)) + (s.ip ? ' · ' + esc(s.ip) : '') + '</span></div>' +
            '<em>آخر نشاط ' + when(s.lastSeen) + '</em>' +
            (s.me ? '<i class="tag">الجهاز ده</i>' : '<button onclick="AXSec.revoke(\'' + esc(s.id) + '\')">خروج</button>') + '</li>';
        }).join('') + '</ul>' : '<div class="sec-empty">' + (ui.ses ? 'مفيش أجهزة' : 'بيحمّل…') + '</div>') +
        '<p class="sec-note">صلاحيات كل مستخدم (الأقسام اللي يدخلها وإيه اللي يحتاج موافقتك) من <a href="javascript:void(0)" onclick="navigate(\'users\')">«المستخدمين»</a>.</p>' +
      '</section>' +
      '</div>';
  }

  window.renderSecurity = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    if (!isAdmin()) { root.innerHTML = '<div class="skh-empty"><b>للمدير بس</b></div>'; return; }
    root.innerHTML = '<div class="sec" id="sec-root"></div>';
    draw();
    loadRemote();
  };

  async function changePw(inModal) {
    var f = document.getElementById('sec-pw'); if (!f) return;
    var v = Object.fromEntries(new FormData(f));
    if (v.next !== v.again) { T('التأكيد مش زي كلمة السر الجديدة', 'error'); return; }
    if (String(v.next).length < 6) { T('كلمة السر الجديدة 6 حروف على الأقل', 'error'); return; }
    var r = await api('/api/password', { current: v.current, next: v.next });
    if (!r.ok) { T(r.j.message || 'ماتغيرتش', 'error'); return; }
    try { sessionStorage.removeItem('emx_weak'); if (typeof OfflineAuth !== 'undefined' && currentUser) OfflineAuth.save(currentUser.username, v.next, { id: currentUser.id, username: currentUser.username, name: currentUser.name, role: currentUser.role }); } catch (e) {}
    f.reset();
    if (inModal === true) closeModal();
    T('اتغيّرت كلمة السر ✓ — الأجهزة التانية خرجت');
    if (document.getElementById('sec-root')) loadRemote();
  }
  function saveSetting(k, v) {
    if (v === null || v === undefined) delete S()[k]; else S()[k] = v;
    DB.save();
  }
  function closeTo() {
    var d = (document.getElementById('sec-close-d') || {}).value;
    if (!d) { T('اختار التاريخ', 'error'); return; }
    if (d > lds(new Date())) { T('مينفعش تقفل تاريخ لسه مجاش', 'error'); return; }
    confirmDialog('تقفل كل حاجة لحد ' + dmy(d) + '؟ أي إضافة أو تعديل أو حذف بتاريخ في الفترة دي هيحتاج موافقتك.', function () {
      saveSetting('closedUntil', d);
      T('اتقفلت الفترة لحد ' + dmy(d));
      draw();
    });
  }
  function reopen() {
    confirmDialog('تفتح الفترة المقفولة؟ التعديلات القديمة هترجع تتعمل عادي (حسب الصلاحيات).', function () {
      saveSetting('closedUntil', null);
      T('اتفتحت الفترة', 'info');
      draw();
    });
  }
  async function backupNow() {
    var r = await api('/api/backup/now', {});
    if (!r.ok) { T(r.j.message || 'ماتعملتش', 'error'); return; }
    T('اتعملت نسخة ✓');
    loadRemote();
  }
  async function telegram() {
    T('بيتبعت…', 'info', 2000);
    var r = await api('/api/backup/telegram', {});
    if (r.ok && r.j.ok) T('اتبعتت النسخة على تليجرام ✓'); else T('ماتبعتتش: ' + (r.j.error || ''), 'error', 6000);
    loadRemote();
  }
  async function revoke(id) {
    var r = await api('/api/sessions/revoke', { id: id });
    T(r.ok && r.j.ok ? 'الجهاز اتخرّج' : 'مالقيتوش', r.ok ? 'success' : 'error');
    loadRemote();
  }
  /* restore: .json or .json.gz made by this program */
  function pickRestore() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.gz,.json,application/json,application/gzip';
    inp.onchange = function () { if (inp.files && inp.files[0]) readRestore(inp.files[0]); };
    inp.click();
  }
  async function readRestore(file) {
    var data;
    try {
      var buf = await file.arrayBuffer(), bytes = new Uint8Array(buf), text;
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') { T('المتصفح ده مش بيفك الملفات المضغوطة — استخدم Chrome أو Edge', 'error'); return; }
        text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      } else text = new TextDecoder().decode(bytes);
      data = JSON.parse(text);
    } catch (e) { T('الملف ده مش نسخة سليمة', 'error'); return; }
    if (!data || !Array.isArray(data.customers) || !Array.isArray(data.invoices)) { T('الملف ده مش نسخة من البرنامج', 'error'); return; }
    var n = (data.invoices || []).length, c = (data.customers || []).length, at = data.__exportedAt ? ' (' + dmy(data.__exportedAt) + ')' : '';
    confirmDialog('هترجع البيانات للنسخة دي' + at + ': ' + c + ' عميل و ' + n + ' فاتورة.\nكل اللي اتعمل بعدها هيتمسح من كل الأجهزة (السيرفر بياخد نسخة من الحالي الأول).\nتكمل؟', async function () {
      var r = await fetch(base() + '/api/data', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) { T('الاسترجاع فشل (' + r.status + ')', 'error'); return; }
      T('اترجعت النسخة ✓ — البرنامج هيفتح من جديد');
      setTimeout(function () { location.reload(); }, 1200);
    });
  }

  /* any user: change my password (from the user menu) */
  function pwModal() {
    openModal('🔑 تغيير كلمة السر',
      '<form id="sec-pw" onsubmit="AXSec.changePw(true);return false">' +
        '<div class="form-group"><label>كلمة السر الحالية</label><input class="form-control" type="password" name="current" autocomplete="current-password" required></div>' +
        '<div class="form-group"><label>الجديدة (6 حروف على الأقل)</label><input class="form-control" type="password" name="next" autocomplete="new-password" minlength="6" required></div>' +
        '<div class="form-group"><label>تأكيد الجديدة</label><input class="form-control" type="password" name="again" autocomplete="new-password" minlength="6" required></div>' +
        '<p class="ax-modal-lead">بعد التغيير، أي جهاز تاني داخل بحسابك هيخرج.</p></form>',
      '<button class="btn btn-primary" onclick="AXSec.changePw(true)">حفظ</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
  }
  window.AXSec = { render: window.renderSecurity, changePw: changePw, closeTo: closeTo, reopen: reopen, backupNow: backupNow, telegram: telegram, revoke: revoke, pickRestore: pickRestore, pwModal: pwModal };
})();

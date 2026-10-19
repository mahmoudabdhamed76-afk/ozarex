/* ════════════════════════════════════════════════════════════════════
   OzareX · «إدارة الإعلانات 📢» (4.41) — the app side of Smart Ads
   · starts the ad engine (js/adscore.js) for the signed-in user
   · adds the admin-only section to Settings: list + stats, editor with
     live phone / desktop preview, on/off, duplicate, archive, delete
   All changes go to the server (/api/ads, admin-checked there too) and
   reach every open device at once through the live-updates channel.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var API = (typeof API_BASE !== 'undefined' ? API_BASE : '');
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || null; }
  function isAdmin() { var u = me(); return !!(u && u.role === 'admin'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function api(method, path, body) {
    return fetch(API + '/api/ads' + (path || ''), { method: method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error((j && j.message) || 'محصلش — جرّب تاني'); return j; }); });
  }

  /* ════════ 1 · the engine for everyone ════════ */
  function bottomNavH() {
    if (!window.matchMedia('(max-width: 768px)').matches) return 0;
    var bn = document.getElementById('bottom-nav');
    if (!bn || document.documentElement.classList.contains('bn-hide')) return 0;
    var r = bn.getBoundingClientRect(); return r.height > 0 ? Math.round(r.height) : 0;
  }
  function blocked() {
    if (!me()) return true;
    if (document.getElementById('axpw') || document.documentElement.classList.contains('ax-splash-on')) return true;
    var lp = document.getElementById('login-page'); if (lp && lp.offsetParent !== null && getComputedStyle(lp).display !== 'none') return true;
    var m = document.getElementById('modal-overlay'); if (m && m.classList.contains('show')) return true;
    if (document.querySelector('.notify-overlay.show, .mh-sheet.show, #axn.show')) return true;
    return false;
  }
  var started = false;
  function start() {
    if (started || !window.SmartAds) return;
    if (!me()) return;
    started = true;
    SmartAds.init({ api: API, brand: 'OZAREX', user: me, page: function () { try { return typeof currentPage !== 'undefined' ? currentPage : ''; } catch (e) { return ''; } }, blocked: blocked, bottomOffset: bottomNavH, go: function (p) { try { if (typeof navigate === 'function') navigate(p); } catch (e) {} } });
  }
  setInterval(function () { if (!started) start(); else if (!me() && window.SmartAds) SmartAds.close(); }, 1500);

  /* ════════ 2 · the settings section (admin) ════════ */
  var state = { ads: [], defaultWa: '', loaded: false, filter: 'all' };
  var KIND = { promo: ['ترويجي', '📣'], guide: ['إرشادي', '🆕'] };
  var ANIM = { bounce: 'نطّة (Bounce)', zoom: 'تكبير (Zoom)', slide: 'انزلاق (Slide)', flip: 'قلب (Flip)', drop: 'وقوع من فوق (Drop)', fade: 'ظهور هادي (Fade)' };
  var DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  var STATUS = { draft: ['مسودة', 'd'], active: ['نشط', 'a'], paused: ['متوقف', 'p'], archived: ['مؤرشف', 'r'] };
  var FORMAT = { popup: ['Popup', 'نافذة عند فتح البرنامج'], banner: ['Banner', 'شريط أعلى / أسفل الصفحة'], card: ['Floating Card', 'بطاقة عايمة صغيرة'] };
  var FREQ = { once: 'مرة واحدة بس', every: 'كل دخول', daily: 'كام مرة في اليوم', days: 'كل كام يوم' };
  var PRESETS = [
    { n: 'أحمر وأسود OZAREX', bg: '#16090C', accent: '#25D366', text: '#FFFFFF' },
    { n: 'كحلي', bg: '#0F2250', accent: '#25D366', text: '#FFFFFF' },
    { n: 'أسود فخم', bg: '#121212', accent: '#F2B233', text: '#FFFFFF' },
    { n: 'أحمر', bg: '#3A0B12', accent: '#F43F5E', text: '#FFFFFF' },
    { n: 'أخضر', bg: '#0B3D2A', accent: '#34D399', text: '#FFFFFF' },
    { n: 'بنفسجي', bg: '#24124D', accent: '#A78BFA', text: '#FFFFFF' },
    { n: 'فاتح', bg: '#F4F6FB', accent: '#1F63E0', text: '#0B1630' }
  ];

  function cardHtml() {
    return '<div class="card axad-card"><div class="card-header"><div class="card-title">📢 إدارة الإعلانات</div></div><div id="axad-root" class="axad"><div class="axad-load">بيحمّل الإعلانات…</div></div></div>';
  }
  function statsHtml() {
    var t = { view: 0, click: 0, close: 0, cta2: 0 }, act = 0;
    state.ads.forEach(function (a) { var s = a.stats || {}; t.view += s.view || 0; t.click += s.click || 0; t.close += s.close || 0; t.cta2 += s.cta2 || 0; if (a.status === 'active') act++; });
    var ctr = t.view ? (Math.round(t.click / t.view * 1000) / 10) : 0;
    return '<div class="axad-kpis">' +
      kpi('الإعلانات النشطة', num(act) + ' / ' + num(state.ads.filter(function (a) { return a.status !== 'archived'; }).length)) +
      kpi('مرات الظهور', num(t.view)) + kpi('ضغطات واتساب', num(t.click)) + kpi('معدل النقر CTR', ctr + '%') + kpi('مرات الإغلاق', num(t.close)) + '</div>';
    function kpi(l, v) { return '<div class="axad-kpi"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; }
  }
  function rowHtml(a) {
    var s = a.stats || {}, st = STATUS[a.status] || STATUS.draft, on = a.status === 'active';
    var when = (a.startAt || a.endAt) ? ((a.startAt ? 'من ' + a.startAt : '') + (a.endAt ? ' لحد ' + a.endAt : '')) : 'من غير تاريخ';
    return '<div class="axad-row' + (a.status === 'archived' ? ' arch' : '') + '" data-id="' + esc(a.id) + '">' +
      '<div class="axad-ic" style="--c:' + esc(a.theme && a.theme.accent || '#25D366') + '">' + esc(a.icon || '📢') + '</div>' +
      '<div class="axad-main"><b>' + esc(a.name || a.title) + '</b>' +
        '<small><span class="axad-st s-' + st[1] + '">' + st[0] + '</span> <span class="axad-kd k-' + esc(a.kind || 'promo') + '">' + (KIND[a.kind] || KIND.promo)[1] + ' ' + (KIND[a.kind] || KIND.promo)[0] + '</span> · ' + esc(FORMAT[a.format] ? FORMAT[a.format][0] : a.format) + ' · ' + esc(a.frequency === 'daily' ? (a.perDay || 1) + ' مرة في اليوم' : (FREQ[a.frequency] || '')) + (a.timeFrom || a.timeTo ? ' · ' + esc((a.timeFrom || '00:00') + '–' + (a.timeTo || '24:00')) : '') + (a.durationSec ? ' · ' + esc(a.durationSec) + ' ث' : '') + ' · أولوية ' + esc(a.priority) + ' · ' + esc(when) + '</small>' +
        '<div class="axad-mini"><span>👁 ' + num(s.view) + ' ظهور</span><span>👆 ' + num(s.click) + ' ضغطة</span><span>📈 ' + (s.ctr || 0) + '% CTR</span><span>✕ ' + num(s.close) + ' إغلاق</span><span>👥 ' + num(s.reach) + ' شخص</span></div></div>' +
      '<div class="axad-acts">' +
        (a.status === 'archived' ? '' : '<label class="axad-sw" title="' + (on ? 'إيقاف' : 'تشغيل') + '"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="AXAds.toggle(\'' + esc(a.id) + '\', this.checked)"><i></i></label>') +
        '<button type="button" class="btn btn-sm btn-secondary" onclick="AXAds.edit(\'' + esc(a.id) + '\')">✏️ تعديل</button>' +
        '<button type="button" class="btn btn-sm btn-secondary" onclick="AXAds.look(\'' + esc(a.id) + '\')">👁 معاينة</button>' +
        '<button type="button" class="btn btn-sm btn-secondary" onclick="AXAds.dup(\'' + esc(a.id) + '\')">⧉ نسخة</button>' +
        (a.status === 'archived'
          ? '<button type="button" class="btn btn-sm btn-secondary" onclick="AXAds.status(\'' + esc(a.id) + '\', \'paused\')">↩︎ استرجاع</button>'
          : '<button type="button" class="btn btn-sm btn-secondary" onclick="AXAds.status(\'' + esc(a.id) + '\', \'archived\')">🗄 أرشفة</button>') +
        '<button type="button" class="btn btn-sm btn-danger" onclick="AXAds.del(\'' + esc(a.id) + '\')">🗑 حذف</button>' +
      '</div></div>';
  }
  function draw() {
    var root = document.getElementById('axad-root'); if (!root) return;
    var list = state.ads.filter(function (a) { return state.filter === 'all' || (a.kind || 'promo') === state.filter; });
    var cnt = function (k) { return state.ads.filter(function (a) { return k === 'all' || (a.kind || 'promo') === k; }).length; };
    root.innerHTML = statsHtml() +
      '<div class="axad-tabs" role="tablist">' + [['all', 'الكل'], ['promo', '📣 الترويجية'], ['guide', '🆕 الإرشادية']].map(function (t) { return '<button type="button" class="' + (state.filter === t[0] ? 'on' : '') + '" onclick="AXAds.filter(\'' + t[0] + '\')">' + t[1] + ' <i>' + cnt(t[0]) + '</i></button>'; }).join('') + '</div>' +
      '<div class="axad-bar"><div class="axad-new"><button type="button" class="btn btn-primary" onclick="AXAds.edit(null, \'promo\')">＋ إعلان ترويجي</button><button type="button" class="btn btn-secondary" onclick="AXAds.edit(null, \'guide\')">🆕 إعلان إرشادي (تحديث / معلومة)</button></div>' +
        '<div class="axad-defwa"><label>رقم واتساب الافتراضي</label><input class="form-control" id="axad-defwa" inputmode="tel" placeholder="مثلاً 01012345678" value="' + esc(state.defaultWa) + '"><button type="button" class="btn btn-secondary btn-sm" onclick="AXAds.saveDefault()">حفظ</button></div></div>' +
      '<p class="axad-hint"><b>الإرشادي</b> للتحديثات والمعلومات الجديدة: قايمة نقط وزرار «تمام، فهمت» وزرار يوديه للصفحة الجديدة. اكتب أي كلمة بين نجمتين زي <b>*شهرين*</b> عشان تطلع كبيرة ومميزة. الإعلان «المسودة» بيظهر لك أنت بس في المعاينة. أول ما تشغّله بيوصل لكل الأجهزة المفتوحة على طول. أي إعلان يتقفل بسهولة ومش بيجبر حد يتفاعل معاه.</p>' +
      (list.length ? '<div class="axad-list">' + list.map(rowHtml).join('') + '</div>' : '<div class="axad-empty">مفيش إعلانات لسه — دوس «＋ إعلان جديد».</div>');
  }
  function reload() {
    return api('GET', '').then(function (j) { state.ads = j.ads || []; state.defaultWa = j.defaultWa || ''; state.loaded = true; draw(); })
      .catch(function (e) { var r = document.getElementById('axad-root'); if (r) r.innerHTML = '<div class="axad-empty">' + esc(e.message) + '</div>'; });
  }

  /* ════════ editor ════════ */
  var cur = null, device = 'phone', pvTimer = 0;
  function byId(id) { return state.ads.find(function (a) { return a.id === id; }) || null; }
  function blankAd(kind) {
    var g = kind === 'guide';
    return { kind: g ? 'guide' : 'promo', name: '', title: g ? 'تحديث جديد في البرنامج 🎉' : '', text: '', desc: '', icon: g ? '🆕' : '📢', format: 'popup', position: 'center', pages: 'all', anim: g ? 'drop' : 'bounce',
      theme: g ? { bg: '#16090C', accent: '#F43F5E', text: '#FFFFFF', glass: true } : { bg: '#16090C', accent: '#25D366', text: '#FFFFFF', glass: true },
      startAt: '', endAt: '', timeFrom: '', timeTo: '', weekdays: [], frequency: g ? 'once' : 'daily', everyDays: 3, perDay: 1, gapMin: 60, maxShows: 0, delaySec: 2, durationSec: 0, priority: g ? 2 : 5,
      audience: { mode: 'all', users: [], roles: [] }, badge: { value: '', label: '' },
      guide: { version: '', items: [], okLabel: 'تمام، فهمت', actionLabel: '', actionPage: '' },
      cta: { label: g ? '' : 'تواصل معنا عبر واتساب', wa: '', msg: '' }, cta2: { label: '', url: '' }, status: 'draft' };
  }
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function pages() { try { return (typeof NAV_ITEMS !== 'undefined' ? NAV_ITEMS : []).map(function (n) { return { k: n.key, l: n.label }; }); } catch (e) { return []; } }
  function users() { try { return (DB.data.users || []).map(function (u) { return { id: u.id, name: u.name || u.username, role: u.role }; }); } catch (e) { return []; } }
  function formHtml(a) {
    var pg = a.pages === 'all' ? [] : (Array.isArray(a.pages) ? a.pages : []);
    var roles = []; users().forEach(function (u) { if (u.role && roles.indexOf(u.role) < 0) roles.push(u.role); });
    var RL = { admin: 'المدير', accountant: 'محاسب', sales: 'موظف مبيعات' };
    return '<div class="axad-ed">' +
      '<form class="axad-form k-' + esc(a.kind || 'promo') + '" id="axad-form" onsubmit="return false" oninput="AXAds.pv()" onchange="AXAds.pv()">' +
      '<div class="axad-kind">' + Object.keys(KIND).map(function (k) { return '<label class="' + ((a.kind || 'promo') === k ? 'on' : '') + '"><input type="radio" name="kind" value="' + k + '"' + ((a.kind || 'promo') === k ? ' checked' : '') + '><b>' + KIND[k][1] + ' إعلان ' + KIND[k][0] + '</b><small>' + (k === 'guide' ? 'تحديث تم أو معلومة جديدة في البرنامج' : 'عرض أو خدمة بزرار واتساب') + '</small></label>'; }).join('') + '</div>' +
      sec('المحتوى', '✍️',
        f('اسم داخلي (ليك أنت بس)', '<input class="form-control" name="name" maxlength="80" value="' + esc(a.name) + '" placeholder="مثلاً: عرض أكتوبر">') +
        '<div class="axad-2">' + f('الأيقونة', '<input class="form-control axad-emo" name="icon" maxlength="8" value="' + esc(a.icon) + '">') +
          f('الأولوية (1 = الأهم)', '<input class="form-control" type="number" name="priority" min="1" max="99" value="' + esc(a.priority) + '">') + '</div>' +
        '<div class="axad-emos">' + ['📢', '🚀', '🎁', '🔥', '⭐', '💡', '🏥', '🏭', '📦', '💬', '🎉', '👑'].map(function (e) { return '<button type="button" onclick="AXAds.emo(\'' + e + '\')">' + e + '</button>'; }).join('') + '</div>' +
        f('العنوان — اكتب الكلمة المميزة بين نجمتين *كده*', '<input class="form-control" name="title" maxlength="140" required value="' + esc(a.title) + '">') +
        f('النص', '<textarea class="form-control" name="text" rows="2" maxlength="400">' + esc(a.text) + '</textarea>') +
        '<div class="axad-2">' + f('رقم كبير بدل الأيقونة (اختياري) — مثلاً 2', '<input class="form-control" name="badgeV" maxlength="6" value="' + esc((a.badge || {}).value || '') + '">') + f('تحت الرقم — مثلاً «شهر متبقي»', '<input class="form-control" name="badgeL" maxlength="24" value="' + esc((a.badge || {}).label || '') + '">') + '</div>' +
        '<div class="only-promo">' + f('وصف إضافي (بيظهر لما يدوس الزرار التاني لو مفيش لينك)', '<textarea class="form-control" name="desc" rows="2" maxlength="1200">' + esc(a.desc) + '</textarea>') + '</div>') +
      '<div class="only-guide">' + sec('التحديث / المعلومة', '🆕',
        '<div class="axad-2">' + f('رقم الإصدار (اختياري)', '<input class="form-control" name="gVer" maxlength="20" value="' + esc((a.guide || {}).version || '') + '" placeholder="4.41">') + f('كلام زرار القفل', '<input class="form-control" name="gOk" maxlength="30" value="' + esc((a.guide || {}).okLabel || 'تمام، فهمت') + '">') + '</div>' +
        f('النقط (كل سطر نقطة — لحد 8)', '<textarea class="form-control" name="gItems" rows="4">' + esc(((a.guide || {}).items || []).join('\n')) + '</textarea>') +
        '<div class="axad-2">' + f('زرار يوديه لصفحة (اختياري)', '<input class="form-control" name="gAct" maxlength="30" value="' + esc((a.guide || {}).actionLabel || '') + '" placeholder="جرّب الميزة">') +
          f('الصفحة', '<select class="form-control" name="gPage">' + opt('', '— من غير —', (a.guide || {}).actionPage || '') + pages().map(function (p) { return opt(p.k, p.l, (a.guide || {}).actionPage || ''); }).join('') + '</select>') + '</div>') + '</div>' +
      sec('الشكل والمكان', '🎨',
        '<div class="axad-fmt">' + Object.keys(FORMAT).map(function (k) { return '<label class="' + (a.format === k ? 'on' : '') + '"><input type="radio" name="format" value="' + k + '"' + (a.format === k ? ' checked' : '') + '><b>' + FORMAT[k][0] + '</b><small>' + FORMAT[k][1] + '</small></label>'; }).join('') + '</div>' +
        f('مكانه', '<select class="form-control" name="position">' + opt('center', 'في النص (Popup)', a.position) + opt('top', 'فوق (Banner)', a.position) + opt('bottom', 'تحت (Banner)', a.position) + opt('bottom-end', 'تحت على الشمال (بطاقة)', a.position) + opt('bottom-start', 'تحت على اليمين (بطاقة)', a.position) + '</select>') +
        '<div class="axad-presets">' + PRESETS.map(function (p, i) { return '<button type="button" title="' + esc(p.n) + '" style="--b:' + p.bg + ';--a:' + p.accent + '" onclick="AXAds.preset(' + i + ')"></button>'; }).join('') + '</div>' +
        '<div class="axad-3">' + f('الخلفية', '<input type="color" name="bg" value="' + esc(a.theme.bg) + '">') + f('لون الزرار', '<input type="color" name="accent" value="' + esc(a.theme.accent) + '">') + f('لون الكلام', '<input type="color" name="tc" value="' + esc(a.theme.text) + '">') + '</div>' +
        '<label class="axad-chk"><input type="checkbox" name="glass"' + (a.theme.glass === false ? '' : ' checked') + '> زجاج خفيف (Glassmorphism)</label>' +
        f('حركة الظهور', '<select class="form-control" name="anim">' + Object.keys(ANIM).map(function (k) { return opt(k, ANIM[k], a.anim || 'bounce'); }).join('') + '</select><button type="button" class="btn btn-secondary btn-sm axad-replay" onclick="AXAds.pv(true)">▶ شوف الحركة تاني</button>')) +
      sec('الظهور', '⏱',
        '<div class="axad-2">' + f('يبدأ من', '<input class="form-control" type="date" name="startAt" value="' + esc(a.startAt) + '">') + f('لحد', '<input class="form-control" type="date" name="endAt" value="' + esc(a.endAt) + '">') + '</div>' +
        '<div class="axad-2">' + f('من الساعة (فاضي = طول اليوم)', '<input class="form-control" type="time" name="timeFrom" value="' + esc(a.timeFrom || '') + '">') + f('لحد الساعة', '<input class="form-control" type="time" name="timeTo" value="' + esc(a.timeTo || '') + '">') + '</div>' +
        f('في أيام (من غير اختيار = كل الأيام)', '<div class="axad-pages axad-wd">' + DAYS.map(function (d, i) { return '<label><input type="checkbox" name="wd" value="' + i + '"' + ((a.weekdays || []).indexOf(i) >= 0 ? ' checked' : '') + '>' + d + '</label>'; }).join('') + '</div>') +
        f('بيظهر', '<select class="form-control" name="frequency">' + Object.keys(FREQ).map(function (k) { return opt(k, FREQ[k], a.frequency); }).join('') + '</select>') +
        '<div class="axad-2 only-daily">' + f('كام مرة في اليوم', '<input class="form-control" type="number" name="perDay" min="1" max="24" value="' + esc(a.perDay || 1) + '">') + f('بين كل مرة والتانية (دقيقة)', '<input class="form-control" type="number" name="gapMin" min="0" max="1440" value="' + esc(a.gapMin == null ? 60 : a.gapMin) + '">') + '</div>' +
        f('مدة الإعلان: يختفي لوحده بعد كام ثانية (0 = لحد ما يتقفل)', '<input class="form-control" type="number" name="durationSec" min="0" max="600" value="' + esc(a.durationSec || 0) + '">') +
        '<div class="axad-3">' + f('كل كام يوم', '<input class="form-control" type="number" name="everyDays" min="1" max="365" value="' + esc(a.everyDays) + '">') +
          f('أقصى عدد مرات للشخص (0 = مفتوح)', '<input class="form-control" type="number" name="maxShows" min="0" max="1000" value="' + esc(a.maxShows) + '">') +
          f('يستنى كام ثانية قبل ما يظهر', '<input class="form-control" type="number" name="delaySec" min="0" max="120" value="' + esc(a.delaySec) + '">') + '</div>' +
        f('في أنهي صفحات', '<label class="axad-chk"><input type="checkbox" name="allPages"' + (a.pages === 'all' ? ' checked' : '') + '> كل الصفحات</label><div class="axad-pages' + (a.pages === 'all' ? ' off' : '') + '">' + pages().map(function (p) { return '<label><input type="checkbox" name="page" value="' + esc(p.k) + '"' + (pg.indexOf(p.k) >= 0 ? ' checked' : '') + '>' + esc(p.l) + '</label>'; }).join('') + '</div>') +
        f('مين يشوفه', '<select class="form-control" name="aud">' + opt('all', 'الكل', a.audience.mode) + opt('users', 'مستخدمين محددين', a.audience.mode) + opt('roles', 'حسب الصلاحية', a.audience.mode) + '</select>' +
          '<div class="axad-pages axad-users' + (a.audience.mode === 'users' ? '' : ' hide') + '">' + users().map(function (u) { return '<label><input type="checkbox" name="user" value="' + esc(u.id) + '"' + (a.audience.users.indexOf(u.id) >= 0 ? ' checked' : '') + '>' + esc(u.name) + '</label>'; }).join('') + '</div>' +
          '<div class="axad-pages axad-roles' + (a.audience.mode === 'roles' ? '' : ' hide') + '">' + roles.map(function (r) { return '<label><input type="checkbox" name="role" value="' + esc(r) + '"' + (a.audience.roles.indexOf(r) >= 0 ? ' checked' : '') + '>' + esc(RL[r] || r) + '</label>'; }).join('') + '</div>')) +
      '<div class="only-promo">' + sec('زرار واتساب', '💬',
        f('كلام الزرار', '<input class="form-control" name="ctaLabel" maxlength="40" value="' + esc(a.cta.label) + '">') +
        f('رقم واتساب لهذا الإعلان (فاضي = الرقم الافتراضي)', '<input class="form-control" name="wa" inputmode="tel" value="' + esc(a.cta.wa) + '" placeholder="' + esc(state.defaultWa || '01012345678') + '"><small class="axad-wa-hint" id="axad-wa-hint"></small>') +
        f('الرسالة الجاهزة (العميل بيراجعها قبل ما يبعت)', '<textarea class="form-control" name="msg" rows="2" maxlength="500">' + esc(a.cta.msg) + '</textarea>')) +
      sec('الزرار التاني', '🔗',
        f('كلامه (فاضي = مفيش زرار)', '<input class="form-control" name="cta2Label" maxlength="40" value="' + esc(a.cta2.label) + '">') +
        f('لينك (اختياري — https فقط)', '<input class="form-control" name="cta2Url" inputmode="url" dir="ltr" value="' + esc(a.cta2.url) + '" placeholder="https://">')) + '</div>' +
      '</form>' +
      '<aside class="axad-pv"><div class="axad-dev"><button type="button" data-d="phone" class="' + (device === 'phone' ? 'on' : '') + '" onclick="AXAds.device(\'phone\')">📱 موبايل</button><button type="button" data-d="desktop" class="' + (device === 'desktop' ? 'on' : '') + '" onclick="AXAds.device(\'desktop\')">🖥 كمبيوتر</button></div>' +
        '<div class="axad-frame ' + device + '" id="axad-frame"><div class="axad-fake"><i></i><i></i><i></i><i></i></div></div>' +
        '<button type="button" class="btn btn-secondary btn-sm axad-live" onclick="AXAds.live()">جرّبه جوه البرنامج دلوقتي ↗</button></aside>' +
      '</div>';
    function sec(t, ic, body) { return '<fieldset class="axad-sec"><legend>' + ic + ' ' + esc(t) + '</legend>' + body + '</fieldset>'; }
    function f(l, inner) { return '<div class="axad-f"><label>' + esc(l) + '</label>' + inner + '</div>'; }
  }
  function read() {
    var F = document.getElementById('axad-form'); if (!F) return cur;
    var g = function (n) { var e = F.elements[n]; return e ? e.value : ''; };
    var all = F.elements.allPages && F.elements.allPages.checked;
    var chk = function (n) { return Array.prototype.slice.call(F.querySelectorAll('input[name="' + n + '"]:checked')).map(function (x) { return x.value; }); };
    var fmt = (F.querySelector('input[name="format"]:checked') || {}).value || 'popup';
    var kind = (F.querySelector('input[name="kind"]:checked') || {}).value || 'promo';
    var a = Object.assign({}, cur, {
      name: g('name'), icon: g('icon'), priority: +g('priority') || 5, title: g('title'), text: g('text'), desc: g('desc'),
      format: fmt, position: g('position'),
      theme: { bg: g('bg'), accent: g('accent'), text: g('tc'), glass: !!(F.elements.glass && F.elements.glass.checked) },
      startAt: g('startAt'), endAt: g('endAt'), frequency: g('frequency'), everyDays: +g('everyDays') || 1, maxShows: +g('maxShows') || 0, delaySec: +g('delaySec') || 0,
      pages: all ? 'all' : (chk('page').length ? chk('page') : 'all'),
      audience: { mode: g('aud'), users: chk('user'), roles: chk('role') },
      cta: { label: g('ctaLabel'), wa: g('wa'), msg: g('msg') }, cta2: { label: g('cta2Label'), url: g('cta2Url') },
      kind: kind, anim: g('anim') || 'bounce', timeFrom: g('timeFrom'), timeTo: g('timeTo'), weekdays: chk('wd').map(Number),
      perDay: +g('perDay') || 1, gapMin: +g('gapMin') || 0, durationSec: +g('durationSec') || 0,
      badge: { value: g('badgeV'), label: g('badgeL') },
      guide: { version: g('gVer'), okLabel: g('gOk'), items: g('gItems').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8), actionLabel: g('gAct'), actionPage: g('gPage') }
    });
    /* keep the position in step with the format */
    if (fmt === 'popup') a.position = 'center';
    else if (fmt === 'banner' && a.position !== 'top' && a.position !== 'bottom') a.position = 'top';
    else if (fmt === 'card' && a.position !== 'bottom-start' && a.position !== 'bottom-end') a.position = 'bottom-end';
    return a;
  }
  function paint() {
    pvTimer = 0;
    var F = document.getElementById('axad-form'), fr = document.getElementById('axad-frame'); if (!F || !fr || !window.SmartAds) return;
    var a = read();
    F.classList.toggle('k-guide', a.kind === 'guide'); F.classList.toggle('k-promo', a.kind !== 'guide');
    F.classList.toggle('f-daily', a.frequency === 'daily');
    Array.prototype.forEach.call(F.querySelectorAll('.axad-kind label'), function (l) { l.classList.toggle('on', !!l.querySelector('input:checked')); });
    if (F.elements.position) F.elements.position.value = a.position;
    Array.prototype.forEach.call(F.querySelectorAll('.axad-fmt label'), function (l) { l.classList.toggle('on', !!l.querySelector('input:checked')); });
    var pgBox = F.querySelector('.axad-pages:not(.axad-users):not(.axad-roles):not(.axad-wd)'); if (pgBox) pgBox.classList.toggle('off', a.pages === 'all' && F.elements.allPages.checked);
    F.querySelector('.axad-users').classList.toggle('hide', a.audience.mode !== 'users');
    F.querySelector('.axad-roles').classList.toggle('hide', a.audience.mode !== 'roles');
    var h = document.getElementById('axad-wa-hint'), link = SmartAds.waLink(a, state.defaultWa);
    if (h) { h.textContent = link ? 'هيفتح: ' + link.split('?')[0] : '⚠️ مفيش رقم واتساب صحيح — زرار واتساب مش هيظهر'; h.className = 'axad-wa-hint' + (link ? '' : ' bad'); }
    var old = fr.querySelector('.sad'); if (old) old.remove();
    fr.appendChild(SmartAds.render(a, state.defaultWa));
  }
  function edit(id, kind) {
    if (!isAdmin()) return;
    cur = id ? JSON.parse(JSON.stringify(byId(id) || blankAd())) : blankAd(kind);
    cur = Object.assign(blankAd(cur.kind), cur);
    var foot = '<button class="btn btn-primary" onclick="AXAds.save(\'active\')">حفظ ونشر</button>' +
      '<button class="btn btn-secondary" onclick="AXAds.save(\'' + (cur.id && cur.status !== 'draft' ? cur.status : 'draft') + '\')">' + (cur.id && cur.status !== 'draft' ? 'حفظ' : 'حفظ كمسودة') + '</button>' +
      '<button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>';
    openModal(cur.id ? '✏️ تعديل الإعلان' : '📢 إعلان جديد', formHtml(cur), foot, 'large');
    var m = document.getElementById('modal'); if (m) m.classList.add('axad-modal');
    setTimeout(paint, 30);
  }
  function save(status) {
    var a = read(); if (!a.title || !a.title.trim()) { T('اكتب عنوان الإعلان', 'error'); return; }
    var body = Object.assign({}, a, { status: status }); delete body.stats; delete body.id; delete body.createdAt; delete body.updatedAt;
    var p = cur.id ? api('PUT', '/' + encodeURIComponent(cur.id), body) : api('POST', '', body);
    p.then(function () { closeModal(); T(status === 'active' ? 'اتنشر الإعلان ✓ — بيوصل للأجهزة دلوقتي' : 'اتحفظ ✓'); return reload(); })
     .catch(function (e) { T(e.message, 'error'); });
  }

  /* ════════ actions ════════ */
  window.AXAds = {
    reload: reload, edit: edit, save: save,
    pv: function (now) { if (now) { paint(); return; } if (!pvTimer) pvTimer = setTimeout(paint, 90); },
    filter: function (k) { state.filter = k; draw(); },
    device: function (d) { device = d; var fr = document.getElementById('axad-frame'); if (fr) fr.className = 'axad-frame ' + d; document.querySelectorAll('.axad-dev button').forEach(function (b) { b.classList.toggle('on', b.dataset.d === d); }); paint(); },
    emo: function (e) { var F = document.getElementById('axad-form'); if (F) { F.elements.icon.value = e; paint(); } },
    preset: function (i) { var p = PRESETS[i], F = document.getElementById('axad-form'); if (!p || !F) return; F.elements.bg.value = p.bg; F.elements.accent.value = p.accent; F.elements.tc.value = p.text; paint(); },
    live: function () { var a = read(); closeModal(); setTimeout(function () { SmartAds.preview(a, state.defaultWa); }, 250); },
    look: function (id) { var a = byId(id); if (a) SmartAds.preview(a, state.defaultWa); },
    toggle: function (id, on) { api('POST', '/' + encodeURIComponent(id) + '/status', { status: on ? 'active' : 'paused' }).then(function () { T(on ? 'الإعلان اشتغل ✓' : 'الإعلان وقف'); reload(); }).catch(function (e) { T(e.message, 'error'); reload(); }); },
    status: function (id, s) { api('POST', '/' + encodeURIComponent(id) + '/status', { status: s }).then(function () { T(s === 'archived' ? 'اتأرشف' : 'رجع (متوقف) — شغّله لما تحب'); reload(); }).catch(function (e) { T(e.message, 'error'); }); },
    dup: function (id) { api('POST', '/' + encodeURIComponent(id) + '/duplicate').then(function () { T('اتعملت نسخة (مسودة)'); reload(); }).catch(function (e) { T(e.message, 'error'); }); },
    del: function (id) {
      var a = byId(id); var go = function () { api('DELETE', '/' + encodeURIComponent(id)).then(function () { T('اتمسح الإعلان'); reload(); }).catch(function (e) { T(e.message, 'error'); }); };
      if (typeof confirmDialog === 'function') confirmDialog('تمسح الإعلان «' + ((a && (a.name || a.title)) || '') + '» وإحصائياته نهائي؟ (لو عايز تحتفظ بيه استخدم «أرشفة»)', go); else go();
    },
    saveDefault: function () { var v = (document.getElementById('axad-defwa') || {}).value || ''; api('POST', '/settings', { defaultWa: v }).then(function (j) { state.defaultWa = j.defaultWa || ''; T(j.defaultWa ? 'اتحفظ الرقم ✓' : 'الرقم مش صحيح — اتمسح', j.defaultWa ? 'success' : 'warning'); draw(); }).catch(function (e) { T(e.message, 'error'); }); }
  };

  /* the section lives in Settings (admin only; Settings itself is password-locked) */
  var orig = window.renderSettings;
  if (typeof orig === 'function' && !orig._axad) {
    var w = function () {
      var r = orig.apply(this, arguments);
      try {
        var root = document.getElementById('page-content');
        if (root && isAdmin() && !root.querySelector('.axad-card')) { root.insertAdjacentHTML('beforeend', cardHtml()); reload(); }
      } catch (e) { console.warn('[ads]', e); }
      return r;
    };
    w._axad = true; window.renderSettings = w;
  }
  /* an open list follows changes made on another device */
  window.addEventListener('ax:ads-changed', function () { if (document.getElementById('axad-root') && state.loaded) reload(); });
})();

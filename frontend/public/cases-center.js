/* ════════════════════════════════════════════════════════════════════
   حالات المرضى — صفحة المركز (من الكمبيوتر) /k/<code>
   4.90 · يرفع PDF الحالة ← بيتشفّر هنا في المتصفح ← الأصل يتحفظ على الجهاز ده
          (IndexedDB)، ونسخة مشفّرة مؤقتة على السيرفر 7 أيام، وبعدها لايف من هنا.
   4.91 · شكل جديد + اختيار تاني: باركود ثابت على كل الورق (هيدر سيرفر الطباعة)
          المريض يمسحه ← يكتب موبايله ← يوصل لحالته (4.99: الموبايل بس).
          + رفع كذا ملف مرة واحدة، قراءة الاسم والموبايل من الـ PDF، مراقبة فولدر
          سيرفر الطباعة، فلاتر، ونسخة احتياطية تتنقل لكمبيوتر تاني.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var C = window.CD || {}, BASE = '/k/' + C.code, $ = function (id) { return document.getElementById(id); }, K = window.OZK;
  var ui = { logo: C.logo || '', logoImg: null, recent: [], vwOpen: '', asks: [], wa: C.wa || '', prefill: null, list: [], local: {}, q: '', f: 'all', queue: [], live: false, es: null, fixed: !!C.fixedOn, dir: null, dirName: '', seen: {}, watchT: 0, pend: {}, auto: false, lastScan: 0 };
  var QID = 0;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { var el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 3000); }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function n0(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function when(ts) { var m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(ts || '')); if (!m) return ''; var d = new Date(+m[1], m[2] - 1, +m[3]), t = new Date(); t.setHours(0, 0, 0, 0); var dd = Math.round((t - d) / 864e5), h = +m[4], hm = ((h % 12) || 12) + ':' + m[5] + (h < 12 ? ' ص' : ' م'); return dd === 0 ? 'النهارده ' + hm : dd === 1 ? 'إمبارح ' + hm : (+m[3]) + '/' + (+m[2]) + '/' + m[1]; }
  function api(method, sub, body) {
    return fetch(BASE + '/' + sub, { method: method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401 && j.login) { location.reload(); throw new Error(''); } if (!r.ok) throw new Error(j.message || 'محصلش — جرّب تاني'); return j; }); });
  }
  function linkOf(tok) { var L = ui.local[tok]; return L ? location.origin + '/v/' + tok + '#' + L.key : ''; }
  function fixedUrl() { return location.origin + '/h/' + C.pub; }
  function phoneWa(p) { var d = K.digits(p); if (!d) return ''; if (d.indexOf('00') === 0) d = d.slice(2); else if (d.indexOf('0') === 0) d = '2' + d; else if (d.length === 10 && d.charAt(0) === '1') d = '20' + d; return d; }
  function beep() { try { var Ac = window.AudioContext || window.webkitAudioContext; if (!Ac) return; var a = beep.a = beep.a || new Ac(), t = a.currentTime; [[880, 0], [1320, .12]].forEach(function (n) { var o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = n[0]; g.gain.setValueAtTime(.0001, t + n[1]); g.gain.exponentialRampToValueAtTime(.15, t + n[1] + .02); g.gain.exponentialRampToValueAtTime(.0001, t + n[1] + .25); o.start(t + n[1]); o.stop(t + n[1] + .26); }); } catch (e) {} }

  /* 4.97 · line icons + a colour per exam type */
  var ICO = {
    today: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="12" cy="15" r="1.6"/>',
    month: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    disk: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 14h18M7 17h.01M11 17h.01"/>',
    down: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>', up: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
    wa: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.4 8.4 0 1 1 21 11.5z"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', play: '<path d="M7 4l13 8-13 8z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'
  };
  function ic(n, c) { return '<svg class="i' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24">' + (ICO[n] || '') + '</svg>'; }
  var EXC = [[/مقطع|ct/i, '#4F46E5'], [/رنين|mri/i, '#8B5CF6'], [/سونار|موجات|ultra/i, '#06B6D4'], [/ماموجرا|mammo/i, '#EC4899'], [/دوبلر|doppler/i, '#F43F5E'], [/بانوراما|panor/i, '#F59E0B'], [/كثافة|dexa/i, '#10B981'], [/عادية|x-?ray/i, '#64748B']];
  function exColor(e) { for (var i = 0; i < EXC.length; i++) if (EXC[i][0].test(String(e || ''))) return EXC[i][1]; return '#6366F1'; }
  function dayOf(ts) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(ts || '')); if (!m) return 'من غير تاريخ'; var d = new Date(+m[1], m[2] - 1, +m[3]), t = new Date(); t.setHours(0, 0, 0, 0); var dd = Math.round((t - d) / 864e5); if (dd === 0) return 'النهارده'; if (dd === 1) return 'إمبارح'; var W = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت']; return (dd < 7 ? W[d.getDay()] + ' · ' : '') + (+m[3]) + '/' + (+m[2]) + '/' + m[1]; }
  function hmOf(ts) { var m = / (\d{2}):(\d{2})/.exec(String(ts || '')); if (!m) return ''; var h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + (h < 12 ? ' ص' : ' م'); }

  /* ── the files on THIS computer (IndexedDB): store f = cases, store h = settings (watched folder, seen files) ── */
  var IDB = null;
  function idb() {
    if (IDB) return IDB;
    IDB = new Promise(function (ok, no) { var r = indexedDB.open('ozx-cases', 2); r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains('f')) d.createObjectStore('f', { keyPath: 'token' }); if (!d.objectStoreNames.contains('h')) d.createObjectStore('h'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; });
    return IDB;
  }
  function put(rec) { return idb().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction('f', 'readwrite'); t.objectStore('f').put(rec); t.oncomplete = ok; t.onerror = function () { no(t.error); }; t.onabort = function () { no(t.error || new Error('مساحة الجهاز مش كفاية')); }; }); }); }
  function del(tok) { return idb().then(function (d) { return new Promise(function (ok) { var t = d.transaction('f', 'readwrite'); t.objectStore('f').delete(tok); t.oncomplete = ok; t.onerror = ok; }); }); }
  function localAll() { return idb().then(function (d) { return new Promise(function (ok) { var out = {}, c = d.transaction('f').objectStore('f').openCursor(); c.onsuccess = function () { var x = c.result; if (!x) return ok(out); var v = x.value; if (v.code === C.code) out[v.token] = { key: v.key, size: v.size, thumb: v.thumb || '' }; x.continue(); }; c.onerror = function () { ok(out); }; }); }).catch(function () { return {}; }); }
  function localGet(tok) { return idb().then(function (d) { return new Promise(function (ok) { var r = d.transaction('f').objectStore('f').get(tok); r.onsuccess = function () { ok(r.result || null); }; r.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); }
  function hGet(k) { return idb().then(function (d) { return new Promise(function (ok) { var r = d.transaction('h').objectStore('h').get(k); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ok(undefined); }; }); }).catch(function () { return undefined; }); }
  function hSet(k, v) { return idb().then(function (d) { return new Promise(function (ok) { var t = d.transaction('h', 'readwrite'); if (v === undefined) t.objectStore('h').delete(k); else t.objectStore('h').put(v, k); t.oncomplete = ok; t.onerror = ok; }); }).catch(function () {}); }

  /* ── QR (vendor/qrcode.js) ── */
  /* 4.98 · the center's logo sits in the middle of every QR (level H keeps it readable) */
  function qrM(text) { var q = qrcode(0, ui.logo ? 'H' : 'M'); q.addData(text); q.make(); return q; }
  function hole(n) { if (!ui.logo) return null; var k = Math.max(5, Math.round(n * 0.24)); if (k % 2 !== n % 2) k++; var a = (n - k) / 2; return { a: a, b: a + k, k: k }; }
  function qrSvg(text) {
    var q = qrM(text), n = q.getModuleCount(), m = 2, sz = n + m * 2, d = '', h = hole(n);
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c) && !(h && r >= h.a && r < h.b && c >= h.a && c < h.b)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    var lg = h ? '<rect x="' + (h.a + m + 0.3) + '" y="' + (h.a + m + 0.3) + '" width="' + (h.k - 0.6) + '" height="' + (h.k - 0.6) + '" rx="' + (h.k * 0.22) + '" fill="#fff" stroke="#E4E7F2" stroke-width=".25"/><image href="' + ui.logo + '" x="' + (h.a + m + 0.9) + '" y="' + (h.a + m + 0.9) + '" width="' + (h.k - 1.8) + '" height="' + (h.k - 1.8) + '" preserveAspectRatio="xMidYMid meet"/>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sz + ' ' + sz + '" shape-rendering="crispEdges"><rect width="' + sz + '" height="' + sz + '" fill="#fff"/><path d="' + d + '" fill="#0F172A"/>' + lg + '</svg>';
  }
  function qrDraw(ctx, text, x, y, size) {
    var q = qrM(text), n = q.getModuleCount(), cell = size / (n + 4), h = hole(n); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, size, size); ctx.fillStyle = '#0F172A';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c) && !(h && r >= h.a && r < h.b && c >= h.a && c < h.b)) ctx.fillRect(Math.floor(x + (c + 2) * cell), Math.floor(y + (r + 2) * cell), Math.ceil(cell), Math.ceil(cell));
    if (h && ui.logoImg && ui.logoImg.complete && ui.logoImg.naturalWidth) {
      var lx = x + (h.a + 2) * cell, w = h.k * cell, I = ui.logoImg, p = w * 0.08, k = Math.min((w - 2 * p) / I.naturalWidth, (w - 2 * p) / I.naturalHeight), iw = I.naturalWidth * k, ih = I.naturalHeight * k;
      ctx.fillStyle = '#fff'; ctx.fillRect(lx, y + (h.a + 2) * cell, w, w); ctx.drawImage(I, lx + (w - iw) / 2, y + (h.a + 2) * cell + (w - ih) / 2, iw, ih);
    }
  }
  function logoTag(cls) { return ui.logo ? '<img class="' + (cls || '') + '" src="' + ui.logo + '" alt="">' : esc(String(C.center || 'م').trim().charAt(0)); }
  function loadLogoImg() { ui.logoImg = null; if (!ui.logo) return; var I = new Image(); I.src = ui.logo; ui.logoImg = I; }
  loadLogoImg();
  function pickLogo() {
    modal('<h3>لوجو المركز</h3><p>بيظهر فوق في الصفحة، وفي نص كل باركود (باركود كل حالة والباركود الثابت والاستيكر)، وفي صفحة المريض.</p><div class="lgpv">' + (ui.logo ? '<img src="' + ui.logo + '" alt="">' : '<span>' + esc(String(C.center || 'م').trim().charAt(0)) + '</span>') + '</div>' +
      '<div class="bt"><button class="btn" data-x="pick">اختار صورة</button>' + (ui.logo ? '<button class="btn d" data-x="rm">شيل اللوجو</button>' : '<button class="btn g" data-x="cl">إلغاء</button>') + '</div><p style="font-size:11.5px;margin-top:10px">أحسن حاجة صورة مربعة بخلفية بيضا أو شفافة (PNG).</p>',
      function (k, close) {
        if (k === 'rm') { saveLogo('').then(close); }
        if (k === 'pick') { var f = document.createElement('input'); f.type = 'file'; f.accept = 'image/png,image/jpeg,image/webp'; f.onchange = function () { if (f.files[0]) shrink(f.files[0]).then(saveLogo).then(close).catch(function (e) { toast(e.message || 'مش قادر أقرا الصورة'); }); }; f.click(); }
      });
  }
  function shrink(file) {
    return new Promise(function (ok, no) {
      var u = URL.createObjectURL(file), I = new Image();
      I.onload = function () { var S = 256, k = Math.min(1, S / Math.max(I.width, I.height)), w = Math.round(I.width * k), h = Math.round(I.height * k), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(I, 0, 0, w, h); URL.revokeObjectURL(u); var d = cv.toDataURL('image/png'); if (d.length > 280000) d = cv.toDataURL('image/webp', 0.9); ok(d); };
      I.onerror = function () { no(new Error('الملف ده مش صورة')); }; I.src = u;
    });
  }
  function saveLogo(d) {
    return api('POST', 'logo', { data: d }).then(function () {
      ui.logo = d; loadLogoImg();
      var paint = function () { brand(); fixedCard(); table(); toast(d ? 'اتحفظ اللوجو ✓ — هيظهر في نص كل باركود' : 'اتشال اللوجو'); };
      if (ui.logoImg) { ui.logoImg.onload = paint; ui.logoImg.onerror = paint; } else paint();
    }).catch(function (e) { toast(e.message); });
  }
  function brand() { [].forEach.call(document.querySelectorAll('[data-logo]'), function (el) { el.innerHTML = logoTag(); el.classList.toggle('img', !!ui.logo); }); }

  /* ════ login ════ */
  function login() {
    document.body.innerHTML = '<div class="gate"><div class="box"><i class="glg' + (ui.logo ? ' img' : '') + '">' + (ui.logo ? '<img src="' + ui.logo + '" alt="">' : '▦') + '</i><h1>QR Patient</h1><p>' + esc(C.center) + '</p><input class="fld" id="pw" type="password" autocomplete="current-password" placeholder="الباسوورد" autofocus><div class="err" id="er"></div><button class="btn w" id="go" style="margin-top:6px;padding:13px">دخول</button><p style="margin-top:14px;font-size:12px">الباسوورد من الشركة — مختلف عن لينك الحسابات.</p></div></div><div class="toast" id="toast"></div>';
    var go = function () {
      var p = $('pw').value; if (!p) return; $('go').disabled = true;
      fetch(BASE + '/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: p }) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'محصلش'); location.reload(); }); })
        .catch(function (e) { $('go').disabled = false; $('er').textContent = e.message; $('pw').select(); });
    };
    $('go').onclick = go; $('pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  /* ════ the page ════ */
  function shell() {
    var dirOk = 'showDirectoryPicker' in window;
    document.body.innerHTML =
      '<header class="tbar"><div class="tb-in"><span class="lg' + (ui.logo ? ' img' : '') + '" data-logo>' + logoTag() + '</span><div class="tt"><b>QR Patient</b><small>' + esc(C.center) + '</small></div>' +
        '<div class="sp"><span class="pill" id="st"><i></i><span>بيتصل…</span></span><button class="ib" id="bk" title="نسخة احتياطية من حالات الجهاز ده — تنقلها لكمبيوتر تاني">' + ic('down') + '<span>نسخة احتياطية</span></button><button class="ib" id="rs" title="رجّع نسخة احتياطية">' + ic('up') + '<span>استرجاع</span></button><input type="file" id="rsf" accept=".ozxcases" hidden><button class="ib x" id="out" title="خروج">' + ic('out') + '<span>خروج</span></button></div></div></header>' +
      '<div class="wrap">' +
      '<section class="hero2"><div class="hl"><button class="clogo' + (ui.logo ? ' img' : '') + '" id="lgo" type="button" title="لوجو المركز"><span data-logo>' + logoTag() + '</span><em>' + (ui.logo ? 'غيّر' : '+ لوجو') + '</em></button>' +
          '<div><small>QR Patient</small><h1>' + esc(C.center) + '</h1><p>ارفع PDF الحالة واطبع الباركود — والمريض يفتح نتيجته من موبايله.</p></div></div>' +
        '<div class="hs"><div><b id="s1">0</b><span>النهارده</span></div><div><b id="s2">0</b><span>الشهر ده</span></div><div><b id="s3">0</b><span>مرة اتفتحت</span></div><div><b id="s4">0</b><span>على الجهاز ده</span></div></div></section>' +
      '<div class="kgrid"><div class="kmain">' +
        '<div id="mwda"></div><div class="upz"><div class="drop" id="drop"><span class="beam"></span><span class="ic">' + ic('file') + '</span><div><b>اسحب ملفات PDF هنا</b><small>ملف واحد أو كذا ملف مرة واحدة · لحد ' + C.maxMb + ' ميجا للملف · بنحاول نقرا الاسم والموبايل من الملف</small></div><div class="db"><button class="btn" id="pk" type="button">＋ اختار ملفات</button></div><input type="file" id="fi" accept="application/pdf,.pdf" multiple hidden></div>' +
          (dirOk ? '<div class="watch" id="wt"></div>' : '') + '</div>' +
        '<div class="queue" id="qu"></div>' +
        '<section class="card list"><div class="ch"><div class="h"><h2>الحالات</h2><small id="lc"></small></div><div class="srch">' + ic('search') + '<input class="fld q" id="q" placeholder="اسم المريض أو الموبايل أو الفحص"></div></div><div class="seg" id="fl"></div><div id="tbl"><div class="sk"></div><div class="sk" style="opacity:.7"></div><div class="sk" style="opacity:.45"></div></div></section>' +
      '</div><aside class="kside"><div id="asks"></div><div class="opt fxc" id="fx"></div>' +
        '<div class="opt"><h3>' + ic('qr') + ' باركود لكل حالة <span class="tg ok">شغال دايماً</span></h3><div class="how"><div><span>1</span>اسحب PDF الحالة واكتب اسم المريض</div><div><span>2</span>اطبع الاستيكر أو ابعته واتساب</div><div><span>3</span>المريض يمسحه ويشوف أشعته على طول</div></div></div>' +
        '<div class="opt rec"><h3>' + ic('eye') + ' آخر مرات الفتح</h3><div id="rec"></div></div>' +
        '<div class="disk" id="disk"><div class="sk" style="height:40px;margin:0"></div></div></aside></div></div><div class="toast" id="toast"></div>';
    $('lgo').onclick = pickLogo;
    $('out').onclick = function () { api('POST', 'logout').then(function () { location.reload(); }).catch(function () { location.reload(); }); };
    $('bk').onclick = backup; $('rs').onclick = function () { $('rsf').click(); }; $('rsf').onchange = function () { if (this.files[0]) restore(this.files[0]); this.value = ''; };
    var dr = $('drop'), fi = $('fi');
    $('pk').onclick = function (e) { e.stopPropagation(); fi.click(); };
    dr.onclick = function (e) { if (e.target === dr || e.target.closest('.ic')) fi.click(); };
    fi.onchange = function () { add([].slice.call(fi.files || [])); fi.value = ''; };
    ['dragenter', 'dragover'].forEach(function (k) { dr.addEventListener(k, function (e) { e.preventDefault(); dr.classList.add('ov'); }); });
    ['dragleave', 'drop'].forEach(function (k) { dr.addEventListener(k, function (e) { e.preventDefault(); dr.classList.remove('ov'); }); });
    dr.addEventListener('drop', function (e) { add([].slice.call((e.dataTransfer && e.dataTransfer.files) || [])); });
    document.addEventListener('dragover', function (e) { e.preventDefault(); }); document.addEventListener('drop', function (e) { e.preventDefault(); });
    $('q').oninput = function () { ui.q = this.value.trim(); table(); };
    fixedCard(); watchBar();
    if (window.OZDicom) OZDicom.mount($('mwda'), { center: C.center, toast: toast, onPdf: addConverted });   /* 4.94 · مودة: DICOM → PDF right here */
  }
  function addConverted(L) {
    if (!L.length) return;
    L.forEach(function (x) {
      var q = { id: ++QID, file: x.file, name: x.file.name, size: x.file.size, pages: x.pages || 0, thumb: '', patient: x.patient || '', phone: '', exam: x.exam || '', st: 'ready', af: '🩻 اتعمل من DICOM — ' + 'راجع الاسم واكتب موبايل المريض', dir: false };
      ui.queue.push(q); readPdf(q);
    });
    queue(); beep();
    toast('🩻 اتعمل ' + L.length + (L.length === 1 ? ' PDF' : ' ملفات PDF') + ' — اكتب موبايل المريض واحفظ');
    var qu = $('qu'); if (qu) setTimeout(function () { qu.scrollIntoView({ behavior: 'smooth', block: 'start' }); var i = qu.querySelector('[data-k=phone]'); if (i) i.focus(); }, 300);
  }
  function count(el, to) { var t0 = performance.now(); (function f(t) { var k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = n0(to * e); if (k < 1) requestAnimationFrame(f); })(t0); }
  function stats() {
    var td = ymd(), mo = td.slice(0, 7), a = 0, b = 0, v = 0;
    ui.list.forEach(function (r) { var d = String(r.at || '').slice(0, 10); if (d === td) a++; if (d.slice(0, 7) === mo) b++; v += r.views || 0; });
    [[$('s1'), a], [$('s2'), b], [$('s3'), v], [$('s4'), Object.keys(ui.local).length]].forEach(function (x) { if (x[0] && x[0].dataset.v !== String(x[1])) { x[0].dataset.v = x[1]; count(x[0], x[1]); } });
  }

  /* ── option 2: the fixed barcode on every report ── */
  function fixedCard() {
    var el = $('fx'); if (!el) return;
    el.innerHTML = '<h3>📌 باركود ثابت على كل الورق <button class="sw' + (ui.fixed ? ' on' : '') + '" id="fsw" type="button" aria-label="تشغيل/إيقاف"></button></h3>' +
      '<p>باركود واحد للمركز في هيدر سيرفر الطباعة — المريض يمسحه ويكتب <b>رقم موبايله</b> بس ويوصل لحالته.</p>' +
      '<div class="fq' + (ui.fixed ? '' : ' off') + '" id="fqm" title="كبّر"><span class="corner a"></span><span class="corner b"></span>' + qrSvg(fixedUrl()) + '</div>' +
      '<div class="ob"><button class="btn sm" id="fh">' + ic('down') + ' صورة الهيدر</button><button class="btn g sm" id="fq">' + ic('qr') + ' الباركود لوحده</button><button class="btn g sm" id="fp">' + ic('print') + ' اطبع</button><button class="btn g sm" id="fc">نسخ اللينك</button></div>' +
      '<div class="st2 ' + (ui.fixed ? 'on' : 'of') + '"><i></i>' + (ui.fixed ? 'شغال — اكتب موبايل المريض مع كل حالة عشان يلاقيها' : 'موقوف — المرضى مش هيقدروا يدوّروا') + '</div>' +
      '<p style="font-size:11.5px;margin-top:8px">📨 اللي مايلاقيش نتيجته يبعت طلب، ويظهرلك هنا لايف بصوت.</p>';
    $('fsw').onclick = function () { var on = !ui.fixed; api('POST', 'fixed', { on: on }).then(function () { ui.fixed = on; fixedCard(); toast(on ? '📌 الباركود الثابت اشتغل' : '⏸ الباركود الثابت اتوقف'); }).catch(function (e) { toast(e.message); }); };
    $('fh').onclick = function () { headerPng(function (u) { dl(u, 'هيدر-باركود-' + C.center + '.png'); }); };
    $('fq').onclick = function () { qrPng(function (u) { dl(u, 'باركود-' + C.center + '.png'); }); };
    $('fp').onclick = printFixed;
    $('fc').onclick = function () { try { navigator.clipboard.writeText(fixedUrl()).then(function () { toast('اتنسخ ✓'); }); } catch (e) {} };
    $('fqm').onclick = function () { headerPng(function (u) { modal('<h3>📌 الباركود الثابت</h3><p>حط الصورة دي في هيدر التقارير على سيرفر الطباعة</p><div class="qbig">' + qrSvg(fixedUrl()) + '</div><img class="hdr" src="' + u + '" alt=""><div class="lk"><input readonly value="' + esc(fixedUrl()) + '"></div><div class="bt"><button class="btn" data-x="h">⬇ صورة الهيدر</button><button class="btn g" data-x="p">🖨 اطبع</button></div><button class="btn g w" data-x="cl" style="margin-top:8px">تمام</button>', function (k) { if (k === 'h') dl(u, 'هيدر-باركود-' + C.center + '.png'); if (k === 'p') printFixed(); }); }); };
  }
  function dl(u, name) { var a = document.createElement('a'); a.href = u; a.download = name.replace(/[\\/:*?"<>|]+/g, ' '); document.body.appendChild(a); a.click(); a.remove(); }
  function fontsReady(cb) { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(cb, cb); }
  function headerPng(cb) {   /* a wide strip for the report's header: name + how-to on one side, the barcode on the other */
    fontsReady(function () {
      var W = 2400, H = 460, cv = document.createElement('canvas'), x = cv.getContext('2d'); cv.width = W; cv.height = H;
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
      var g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0E9F9A'); g.addColorStop(1, '#0B1F33'); x.fillStyle = g; x.fillRect(0, H - 14, W, 14);
      qrDraw(x, fixedUrl(), 60, 22, 360);
      x.direction = 'rtl'; x.textAlign = 'right'; x.fillStyle = '#0F172A';
      var F = "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif";
      x.font = '800 92px ' + F; x.fillText(C.center || '', W - 70, 150);
      x.fillStyle = '#0B7F7B'; x.font = '700 62px ' + F; x.fillText('نتيجة الأشعة على موبايلك 📱', W - 70, 255);
      x.fillStyle = '#475569'; x.font = '500 46px ' + F; x.fillText('امسح الباركود ← اكتب رقم موبايلك ← افتح نتيجتك', W - 70, 345);
      x.textAlign = 'center'; x.fillStyle = '#64748B'; x.font = '600 30px ' + F; x.fillText('امسح هنا', 240, 412);
      cb(cv.toDataURL('image/png'));
    });
  }
  function qrPng(cb) {
    fontsReady(function () {
      var W = 1200, H = 1380, cv = document.createElement('canvas'), x = cv.getContext('2d'); cv.width = W; cv.height = H;
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); qrDraw(x, fixedUrl(), 100, 80, 1000);
      var F = "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif"; x.direction = 'rtl'; x.textAlign = 'center';
      x.fillStyle = '#0F172A'; x.font = '800 62px ' + F; x.fillText(C.center || '', W / 2, 1180);
      x.fillStyle = '#0B7F7B'; x.font = '700 46px ' + F; x.fillText('امسح الباركود وشوف نتيجتك', W / 2, 1270);
      cb(cv.toDataURL('image/png'));
    });
  }
  function printFixed() {
    headerPng(function (u) {
      var w = window.open('', '_blank', 'width=900,height=700'); if (!w) return toast('اسمح بالنوافذ المنبثقة');
      w.document.write('<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>الباركود الثابت</title><style>@page{size:A4;margin:12mm}body{margin:0;font-family:Tahoma,Arial,sans-serif;text-align:center;color:#0F172A}img{width:100%}.q{width:120mm;margin:14mm auto 4mm}.q svg{width:100%}p{font-size:15px;color:#334155}</style><img src="' + u + '"><div class="q">' + qrSvg(fixedUrl()) + '</div><p><b>' + esc(C.center) + '</b> — امسح الباركود، اكتب رقم موبايلك، وشوف نتيجتك.</p><script>setTimeout(function(){print()},400)<\/script></html>');
      w.document.close();
    });
  }

  /* ── the upload queue ── */
  function pdfjs(cb) {
    if (window.pdfjsLib) return cb(window.pdfjsLib);
    if (pdfjs.q) return pdfjs.q.push(cb); pdfjs.q = [cb];
    var s = document.createElement('script'); s.src = '/vendor/pdfjs/pdf.min.js';
    var fin = function (lib) { var q = pdfjs.q; pdfjs.q = null; q.forEach(function (f) { f(lib); }); };
    s.onload = function () { try { pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; } catch (e) {} fin(window.pdfjsLib); }; s.onerror = function () { fin(null); };
    document.head.appendChild(s);
  }
  var EXAMS = [[/مقطعي|ct\b|c\.t|computed/i, 'أشعة مقطعية'], [/رنين|mri|m\.r\.i|magnetic/i, 'رنين مغناطيسي'], [/ماموجرا|mammo/i, 'ماموجرام'], [/دوبلر|doppler/i, 'دوبلر'], [/سونار|موجات صوتية|ultra ?sound|sonar|\bus\b/i, 'سونار'], [/بانوراما|panoram|opg/i, 'أشعة بانوراما'], [/كثافة|dexa|dxa|densit/i, 'قياس كثافة العظام'], [/x-?ray|أشعة عادية|radiograph/i, 'أشعة عادية'], [/pet/i, 'PET']];
  /* best effort: the patient's name, mobile and the exam from the report's first page */
  function sniff(text) {
    var t = String(text || '').replace(/[ \t\u00A0]+/g, ' '), o = {};
    var d = K.digits(t.replace(/[\s\-]/g, '')), pm = /(?:0020|\+?20)?(01[0125]\d{8})/.exec(d); if (pm) o.phone = pm[1];
    var nm = /(?:اسم المريض|اسم المريضة|المريض|المريضة|الاسم|patient'?s? name|patient|name)[ \t]*[:：\-][ \t]*([؀-ۿa-zA-Z][؀-ۿa-zA-Z .]{2,50})/i.exec(t);
    if (nm) { var n = (' ' + nm[1] + ' ').replace(/\s(age|sex|date|id|ref|dr|السن|النوع|التاريخ|العمر|رقم|كود|الكود|الجنس|الانطباع|التقرير|الفحص|النتيجه|النتيجة|الطبيب|دكتور|المحول|الرأي|التشخيص|الرئتين|القلب)(\s.*|$)/i, ' ').trim().split(/\s+/).slice(0, 4).join(' '); if (n.length >= 3) o.patient = n; }
    for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i][0].test(t)) { o.exam = EXAMS[i][1]; break; }
    return o;
  }
  function add(files, fromDir) {
    files = files.filter(function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    if (!files.length) return toast('اختار ملفات PDF');
    files.forEach(function (f) {
      if (f.size > C.maxMb * 1048576) return toast(f.name + ' أكبر من ' + C.maxMb + ' ميجا');
      var q = { id: ++QID, file: f, name: f.name, size: f.size, pages: 0, thumb: '', patient: '', phone: '', exam: '', st: 'ready', af: '', dir: !!fromDir };
      if (ui.prefill && files.length === 1) { q.patient = ui.prefill.patient || ''; q.phone = ui.prefill.phone || ''; }
      var g = f.name.replace(/\.pdf$/i, '').replace(/[_\-.]+/g, ' ').replace(/\d{5,}/g, ' ').replace(/\s+/g, ' ').trim(); 
      if (!q.patient && /[؀-ۿ]/.test(g)) q.patient = g.slice(0, 80);
      ui.queue.push(q); readPdf(q);
    });
    ui.prefill = null;
    queue();
    if (fromDir) { beep(); toast('📄 ' + (files.length > 1 ? files.length + ' ملفات جديدة' : 'ملف جديد') + ' من فولدر سيرفر الطباعة'); }
  }
  function readPdf(q) {
    pdfjs(function (lib) {
      if (!lib) return;
      q.file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (doc) {
        q.pages = doc.numPages;
        return doc.getPage(1).then(function (pg) {
          var vp = pg.getViewport({ scale: 1 }), k = 220 / vp.width, v2 = pg.getViewport({ scale: k }), cv = document.createElement('canvas'); cv.dir = 'ltr'; cv.width = v2.width; cv.height = v2.height;
          return Promise.all([pg.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise.then(function () { q.thumb = cv.toDataURL('image/jpeg', 0.6); }), pg.getTextContent().then(function (tc) {
            /* Arabic often comes out glyph by glyph, in presentation forms and in visual (reversed) order → try it as is and reversed */
            var raw = tc.items.map(function (i) { return i.str + (i.hasEOL ? '\n' : ''); }).join(''), nf = raw.normalize ? raw.normalize('NFKC') : raw;
            var rev = nf.split('\n').map(function (l) { return /[\u0600-\u06FF]/.test(l) ? Array.from(l).reverse().join('') : l; }).join('\n');
            var a1 = sniff(rev), a2 = sniff(nf), s = { patient: a1.patient || a2.patient, phone: a2.phone || a1.phone, exam: a1.exam || a2.exam }, got = [];
            if (s.patient && (!q.patient || q.patient === q.name)) { q.patient = s.patient; got.push('الاسم'); }
            if (s.phone && !q.phone) { q.phone = s.phone; got.push('الموبايل'); }
            if (s.exam && !q.exam) { q.exam = s.exam; got.push('الفحص'); }
            if (got.length) q.af = '✨ قريت ' + got.join(' و') + ' من الملف — راجعه';
          }).catch(function () {})]);
        });
      }).catch(function () { q.af = '⚠ مش قادر أقرا الملف — اتأكد إنه PDF سليم'; }).then(function () {
        paintQ(q);
        if (ui.auto && q.dir && q.patient && K.last10(q.phone) && q.st === 'ready') saveOne(q, true).catch(function () {});
      });
    });
  }
  function queue() {
    var el = $('qu'), L = ui.queue.filter(function (q) { return q.st !== 'gone'; });
    if (!L.length) { el.innerHTML = ''; return; }
    var ready = L.filter(function (q) { return q.st === 'ready' || q.st === 'err'; }).length;
    el.innerHTML = (L.length > 1 ? '<div class="qbar"><span>📥 ' + L.length + ' ملف مستني' + (ready ? ' — ' + ready + ' جاهز للحفظ' : '') + '</span><span style="display:flex;gap:6px"><button class="btn sm" id="qall"' + (ready ? '' : ' disabled') + '>▦ احفظ الكل</button><button class="btn g sm" id="qclr">شيل المحفوظ</button></span></div>' : '') +
      L.map(function (q) { return '<div class="qi" id="qi' + q.id + '"></div>'; }).join('');
    L.forEach(paintQ);
    var a = $('qall'); if (a) a.onclick = function () { saveMany(ui.queue.filter(function (q) { return q.st === 'ready' || q.st === 'err'; })); };
    var c = $('qclr'); if (c) c.onclick = function () { ui.queue = ui.queue.filter(function (q) { return q.st !== 'done'; }); queue(); };
  }
  function paintQ(q) {
    var el = $('qi' + q.id); if (!el) return;
    el.className = 'qi' + (q.st === 'done' ? ' done' : q.st === 'err' ? ' err' : '');
    if (q.st === 'done') {
      el.innerHTML = (q.thumb ? '<img class="th" src="' + q.thumb + '" alt="">' : '<span class="th">✅</span>') + '<div class="nm"><b>✅ ' + esc(q.patient) + '</b><small>' + esc(q.exam || '') + ' · اتحفظت</small></div><div class="qf" style="display:block;color:#15803D;font-weight:700;font-size:13px">' + (q.wrapped ? '📌 تتلاقى بالباركود الثابت · ' : '') + '▦ الباركود جاهز</div><div class="qa"><button class="btn sm" data-x="qr">▦ باركود</button><button class="btn g sm" data-x="pr">🖨</button><button class="btn g sm" data-x="rm">×</button></div>';
    } else {
      var busy = q.st === 'saving';
      el.innerHTML = (q.thumb ? '<img class="th" src="' + q.thumb + '" alt="">' : '<span class="th">📄</span>') +
        '<div class="nm"><b>' + esc(q.name) + '</b><small>' + mb(q.size) + (q.pages ? ' · ' + q.pages + ' صفحة' : '') + '</small>' + (q.af ? '<small class="af">' + esc(q.af) + '</small>' : '') + (q.msg ? '<small style="color:#DC2626;font-weight:700">' + esc(q.msg) + '</small>' : '') + (busy ? '<div class="pb"><i id="pb' + q.id + '"></i></div>' : '') + '</div>' +
        '<div class="qf"><input class="fld" data-k="patient" maxlength="80" placeholder="اسم المريض *" value="' + esc(q.patient) + '"' + (busy ? ' disabled' : '') + '><input class="fld n" data-k="phone" maxlength="20" inputmode="tel" placeholder="موبايل المريض' + (ui.fixed ? ' *' : '') + '" style="text-align:right" value="' + esc(q.phone) + '"' + (busy ? ' disabled' : '') + '><input class="fld" data-k="exam" maxlength="80" list="exl" placeholder="نوع الفحص" value="' + esc(q.exam) + '"' + (busy ? ' disabled' : '') + '></div>' +
        '<div class="qa"><button class="btn sm" data-x="sv"' + (busy ? ' disabled' : '') + '>' + (busy ? '⏳' : '▦ احفظ') + '</button><button class="btn g sm" data-x="rm"' + (busy ? ' disabled' : '') + ' title="شيل">×</button></div>';
      [].forEach.call(el.querySelectorAll('[data-k]'), function (i) { i.oninput = function () { q[i.dataset.k] = i.value; }; i.onkeydown = function (e) { if (e.key === 'Enter') saveOne(q).catch(function () {}); }; });
    }
    [].forEach.call(el.querySelectorAll('[data-x]'), function (b) { b.onclick = function () { var x = b.dataset.x; if (x === 'sv') saveOne(q).catch(function () {}); if (x === 'rm') { q.st = 'gone'; queue(); } if (x === 'qr') showQr(q.token, true); if (x === 'pr') printSticker(q.token); }; });
    if (!$('exl')) { var dl2 = document.createElement('datalist'); dl2.id = 'exl'; dl2.innerHTML = ['أشعة مقطعية', 'رنين مغناطيسي', 'سونار', 'أشعة عادية', 'ماموجرام', 'دوبلر', 'أشعة بانوراما', 'قياس كثافة العظام'].map(function (x) { return '<option>' + x + '</option>'; }).join(''); document.body.appendChild(dl2); }
  }
  function saveMany(L) { var i = 0; (function nx() { if (i >= L.length) return; saveOne(L[i++], true).then(nx, nx); })(); }
  function saveOne(q, quiet) {
    if (q.st === 'saving' || q.st === 'done') return Promise.resolve();
    q.patient = String(q.patient || '').trim(); q.phone = String(q.phone || '').trim();
    if (q.patient.length < 2) { q.msg = 'اكتب اسم المريض'; paintQ(q); return Promise.reject(); }
    if (ui.fixed && !K.last10(q.phone) && !q.noPhoneOk) { q.msg = 'اكتب موبايل المريض عشان يلاقي حالته بالباركود الثابت (أو دوس احفظ تاني لو مش موجود)'; q.noPhoneOk = true; paintQ(q); return Promise.reject(); }
    if (!(window.crypto && crypto.subtle)) { toast('المتصفح ده مش بيدعم التشفير — استخدم Chrome أو Edge'); return Promise.reject(); }
    q.st = 'saving'; q.msg = ''; paintQ(q);
    var iv = crypto.getRandomValues(new Uint8Array(12)), key, rawKey, wrapped = null, wrapped2 = null;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt'])   /* 128-bit: a shorter link → a lighter barcode */
      .then(function (k) { key = k; return crypto.subtle.exportKey('raw', k); }).then(function (r) { rawKey = K.b64u(r); return K.wrap(rawKey, q.patient, q.phone); })
      .then(function (w) { wrapped = w; return K.wrap2(rawKey, q.phone); })
      .then(function (w2) { wrapped2 = w2; return q.file.arrayBuffer(); })
      .then(function (buf) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, buf); })
      .then(function (ct) {
        var blob = new Blob([iv, ct], { type: 'application/octet-stream' }), meta = { patient: q.patient, phone: q.phone, exam: String(q.exam || '').trim(), name: q.name, pages: q.pages, wrap: wrapped, wrap2: wrapped2 };
        return new Promise(function (ok, no) {
          var x = new XMLHttpRequest(); x.open('POST', BASE + '/case'); x.withCredentials = true;
          x.setRequestHeader('Content-Type', 'application/octet-stream');
          x.setRequestHeader('X-Meta', K.b64u(new TextEncoder().encode(JSON.stringify(meta))));
          x.upload.onprogress = function (e) { var b = $('pb' + q.id); if (b && e.lengthComputable) b.style.width = Math.max(4, Math.round(e.loaded / e.total * 100)) + '%'; };
          x.onload = function () { var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} if (x.status === 200 && j.item) ok({ item: j.item, blob: blob }); else no(new Error(j.message || 'محصلش — جرّب تاني')); };
          x.onerror = function () { no(new Error('النت فصل — جرّب تاني')); };
          x.send(blob);
        });
      })
      .then(function (r) { return put({ token: r.item.token, code: C.code, key: rawKey, blob: r.blob, size: r.blob.size, thumb: q.thumb, name: q.name, at: Date.now() }).then(function () { return r; }); })
      .then(function (r) {
        ui.local[r.item.token] = { key: rawKey, size: r.blob.size, thumb: q.thumb };
        ui.list.unshift(r.item); q.st = 'done'; q.token = r.item.token; q.wrapped = !!(wrapped || wrapped2); q.file = null;
        if (K.last10(q.phone) && ui.asks.some(function (a) { return K.last10(a.phone) === K.last10(q.phone); })) api('POST', 'ask', { phone: q.phone }).then(function (x) { ui.asks = x.asks || []; asks(); toast('✅ ' + q.patient + ' اتحفظت — وطلبه اتقفل'); }).catch(function () {});
        queue(); table(); stats(); disk();
        var open = ui.queue.filter(function (x) { return x.st !== 'gone' && x.st !== 'done'; }).length;
        if (!quiet && !open && ui.queue.filter(function (x) { return x.st === 'done'; }).length === 1) { showQr(r.item.token, true); setTimeout(function () { q.st = 'gone'; queue(); }, 400); }
        else toast('✅ ' + q.patient + ' اتحفظت');
      })
      .catch(function (e) { q.st = 'err'; q.msg = e && e.message || 'محصلش'; paintQ(q); throw e; });
  }

  /* ── watching the print server's folder (Chrome / Edge) ── */
  function watchBar() {
    var el = $('wt'); if (!el) return;
    if (!ui.dir) { el.className = 'watch'; el.innerHTML = '<span class="wi">📂</span><div style="flex:1"><b>اربط فولدر سيرفر الطباعة</b><small>أي PDF جديد يتحفظ في الفولدر ده بيظهر هنا لوحده — مش محتاج تسحبه.</small></div><button class="btn sm" id="wpk">📂 اختار الفولدر</button>'; $('wpk').onclick = pickDir; return; }
    if (ui.dirNeed) { el.className = 'watch'; el.innerHTML = '<span class="wi">⏸</span><div style="flex:1"><b>فولدر «' + esc(ui.dirName) + '»</b><small>المتصفح محتاج إذنك تاني عشان يكمّل يراقب الفولدر.</small></div><button class="btn sm" id="wgo">▶ كمّل المراقبة</button><button class="btn g sm" id="wx">فك الربط</button>'; $('wgo').onclick = function () { ui.dir.requestPermission({ mode: 'read' }).then(function (p) { if (p === 'granted') { ui.dirNeed = false; startWatch(); } }); }; $('wx').onclick = unlink; return; }
    el.className = 'watch on'; el.innerHTML = '<span class="wi">👀</span><div style="flex:1"><b>بيراقب فولدر «' + esc(ui.dirName) + '»</b><small id="wls">' + (ui.lastScan ? 'آخر فحص ' + new Date(ui.lastScan).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'بيبدأ…') + '</small></div><label><input type="checkbox" id="wau"' + (ui.auto ? ' checked' : '') + '> احفظ لوحده لو لقيت الاسم والموبايل في الملف</label><button class="btn g sm" id="wsc">↻ افحص دلوقتي</button><button class="btn g sm" id="wx">فك الربط</button>';
    $('wau').onchange = function () { ui.auto = this.checked; hSet('auto:' + C.code, ui.auto); };
    $('wsc').onclick = function () { scan(); }; $('wx').onclick = unlink;
  }
  function unlink() { clearInterval(ui.watchT); ui.dir = null; ui.dirNeed = false; hSet('dir:' + C.code, undefined); watchBar(); toast('اتفك ربط الفولدر'); }
  function pickDir() {
    window.showDirectoryPicker({ mode: 'read', id: 'ozx-print' }).then(function (h) {
      ui.dir = h; ui.dirName = h.name; ui.dirNeed = false; hSet('dir:' + C.code, h);
      return listDir(h).then(function (all) { all.forEach(function (x) { ui.seen[x.key] = 1; }); hSet('seen:' + C.code, Object.keys(ui.seen).slice(-3000)); toast('👀 بيراقب «' + h.name + '» — أي PDF جديد هيظهر هنا (' + all.length + ' ملف قديم اتساب)'); startWatch(); });
    }).catch(function (e) { if (e && e.name !== 'AbortError') toast('مش قادر أفتح الفولدر'); });
  }
  function listDir(h) {
    var out = [];
    return (async function () { for await (var ent of h.values()) { if (ent.kind === 'file' && /\.pdf$/i.test(ent.name)) { try { var f = await ent.getFile(); out.push({ f: f, key: f.name + '|' + f.size + '|' + f.lastModified }); } catch (e) {} } } return out; })();
  }
  function startWatch() { clearInterval(ui.watchT); watchBar(); scan(); ui.watchT = setInterval(scan, 12000); }
  function scan() {
    if (!ui.dir || ui.dirNeed || scan.busy) return; scan.busy = true;
    listDir(ui.dir).then(function (all) {
      var fresh = [];
      all.forEach(function (x) {
        if (ui.seen[x.key]) return;
        var p = ui.pend[x.f.name];   /* wait until the print server finished writing it (same size twice) */
        if (!p || p !== x.f.size || Date.now() - x.f.lastModified < 4000) { ui.pend[x.f.name] = x.f.size; return; }
        delete ui.pend[x.f.name]; ui.seen[x.key] = 1; fresh.push(x.f);
      });
      if (fresh.length) { hSet('seen:' + C.code, Object.keys(ui.seen).slice(-3000)); add(fresh, true); }
      ui.lastScan = Date.now(); var w = $('wls'); if (w) w.textContent = 'آخر فحص ' + new Date(ui.lastScan).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    }).catch(function (e) { if (e && e.name === 'NotAllowedError') { ui.dirNeed = true; clearInterval(ui.watchT); watchBar(); } }).then(function () { scan.busy = false; });
  }
  function bootWatch() {
    if (!('showDirectoryPicker' in window)) return;
    Promise.all([hGet('dir:' + C.code), hGet('seen:' + C.code), hGet('auto:' + C.code)]).then(function (a) {
      (a[1] || []).forEach(function (k) { ui.seen[k] = 1; }); ui.auto = !!a[2];
      var h = a[0]; if (!h) return watchBar();
      ui.dir = h; ui.dirName = h.name;
      h.queryPermission({ mode: 'read' }).then(function (p) { if (p === 'granted') startWatch(); else { ui.dirNeed = true; watchBar(); } }).catch(function () { ui.dirNeed = true; watchBar(); });
    });
  }

  /* ── 4.92 · patients who didn't find their result and asked on WhatsApp ── */
  function asks() {
    var el = $('asks'); if (!el) return; var L = ui.asks || [];
    if (!L.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="asks"><div class="ah"><span class="ping">📨</span><div><b>مرضى بيطلبوا نتايجهم</b><small>دوّروا بالباركود الثابت ومالقوش نتيجتهم</small></div><em>' + L.length + '</em></div>' +
      L.map(function (a, i) { return '<div style="animation-delay:' + (i * 60) + 'ms" class="ar' + (ui.newAsk && K.last10(a.phone) === ui.newAsk ? ' new' : '') + '" data-id="' + a.id + '"><span class="ai">🙋</span><div><b>' + esc(a.name) + ' <span class="n" style="font-weight:600;color:var(--mut)">' + esc(a.phone) + '</span></b><small>' + when(a.at) + (a.note ? ' · ' + esc(a.note) : '') + '</small></div><div class="acts"><button class="btn sm" data-k="up">📂 ارفع حالته</button><button class="ic2 wa" data-k="wa" data-tip="واتساب">' + ic('wa') + '</button><button class="ic2" data-k="ok" data-tip="خلصت">' + ic('check') + '</button></div></div>'; }).join('') + '</div>';
    ui.newAsk = null;
    [].forEach.call(el.querySelectorAll('[data-k]'), function (b) {
      b.onclick = function () {
        var id = +b.closest('.ar').dataset.id, a = L.filter(function (x) { return x.id === id; })[0]; if (!a) return; var k = b.dataset.k;
        if (k === 'up') { ui.prefill = { patient: a.name === 'مريض' ? '' : a.name, phone: a.phone }; clearTimeout(ui.pfT); ui.pfT = setTimeout(function () { ui.prefill = null; }, 120000); $('fi').click(); }
        if (k === 'wa') { var ph = phoneWa(a.phone); if (ph) window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent('أهلاً ' + a.name + ' 🌿\nطلبك وصل ' + C.center + '، وبنجهّز نتيجتك وهنبعتهالك حالاً 🙏'), '_blank'); }
        if (k === 'ok') api('POST', 'ask/' + id + '/done').then(function (x) { ui.asks = x.asks || []; asks(); }).catch(function (e) { toast(e.message); });
      };
    });
  }

  /* ── the list ── */
  function inF(r) {
    var d = String(r.at || '').slice(0, 10);
    if (ui.f === 'today') return d === ymd();
    if (ui.f === 'week') return d >= ymd(new Date(Date.now() - 6 * 864e5));
    if (ui.f === 'off') return !r.active;
    if (ui.f === 'new') return !r.views && r.active;
    return true;
  }
  function chips() {
    var F = [['all', 'الكل'], ['today', 'النهارده'], ['week', 'الأسبوع'], ['new', 'لسه متفتحتش'], ['off', 'موقوفة']], save = ui.f, fl = $('fl');
    fl.innerHTML = '<i class="ind"></i>' + F.map(function (x) { ui.f = x[0]; var n = ui.list.filter(inF).length; return '<button data-f="' + x[0] + '" class="' + (save === x[0] ? 'on' : '') + '">' + x[1] + '<em>' + n + '</em></button>'; }).join('');
    ui.f = save;
    var ind = fl.querySelector('.ind'), on = fl.querySelector('button.on');
    if (ui.ind) { ind.style.transition = 'none'; ind.style.left = ui.ind[0] + 'px'; ind.style.width = ui.ind[1] + 'px'; }
    if (on) requestAnimationFrame(function () { ind.style.transition = ''; ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px'; ui.ind = [on.offsetLeft, on.offsetWidth]; });
    [].forEach.call(fl.querySelectorAll('button'), function (b) { b.onclick = function () { ui.f = b.dataset.f; table(); }; });
  }
  function table() {
    chips();
    var q = ui.q.toLowerCase(), L = ui.list.filter(inF).filter(function (r) { return !q || String(r.patient).toLowerCase().indexOf(q) > -1 || String(r.phone || '').indexOf(q) > -1 || String(r.exam || '').toLowerCase().indexOf(q) > -1; });
    var lc = $('lc'); if (lc) lc.textContent = L.length ? L.length + ' حالة' : '';
    if (!L.length) { var srch = q || ui.f !== 'all'; $('tbl').innerHTML = '<div class="emp"><svg class="ill" viewBox="0 0 120 96" fill="none"><rect x="26" y="14" width="56" height="70" rx="10" fill="#EEF2FF" stroke="#C7CAF7" stroke-width="2"/><path d="M38 34h32M38 46h24M38 58h28" stroke="#A5B4FC" stroke-width="4" stroke-linecap="round"/>' + (srch ? '<circle cx="84" cy="62" r="16" fill="#fff" stroke="#6366F1" stroke-width="4"/><path d="M96 74l10 10" stroke="#6366F1" stroke-width="5" stroke-linecap="round"/>' : '<circle cx="88" cy="66" r="16" fill="url(#eg)"/><path d="M88 58v16M80 66h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/><defs><linearGradient id="eg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4F46E5"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs>') + '</svg><b>' + (srch ? 'مفيش حالات هنا' : 'لسه مفيش حالات') + '</b>' + (srch ? 'غيّر البحث أو الفلتر' : 'اسحب أول PDF فوق وهيطلعله باركود على طول') + '</div>'; return; }
    var G = [], cur = null;
    L.slice(0, 300).forEach(function (r) { var d = dayOf(r.at); if (!cur || cur.d !== d) { cur = { d: d, L: [] }; G.push(cur); } cur.L.push(r); });
    var idx = 0;
    $('tbl').innerHTML = G.map(function (g) {
      return '<div class="dg"><div class="dh"><span>' + esc(g.d) + '</span><em>' + g.L.length + '</em></div>' + g.L.map(function (r) {
        var i = idx++, loc = ui.local[r.token], days = r.cached ? Math.max(1, Math.ceil((r.cache_until - Date.now()) / 864e5)) : 0;
        var src = !r.active ? '<span class="tg of">⏸ موقوفة</span>' : (loc ? '<span class="tg lc" title="الملف الأصلي على الكمبيوتر ده">💾 الجهاز ده</span>' : '') + (r.cached ? '<span class="tg nw" title="نسخة مشفّرة مؤقتة على السيرفر">☁ ' + days + ' يوم</span>' : '') + (!loc && !r.cached ? '<span class="tg wr">⚠ على جهاز تاني</span>' : '') + (r.wrapped ? '<span class="tg pn" title="المريض يلاقيها بالباركود الثابت">📌</span>' : (r.phone ? '' : '<span class="tg of" title="من غير موبايل — مش هتتلاقى بالباركود الثابت">📵</span>'));
        var qr = loc ? '<div class="cq" data-qr="' + r.token + '" title="كبّر الباركود"><div class="fx' + (loc.thumb ? ' two' : '') + '"><div class="fa">' + qrSvg(linkOf(r.token)) + '</div>' + (loc.thumb ? '<div class="fb"><img src="' + loc.thumb + '" alt=""></div>' : '') + '</div></div>' : '<div class="cq na" title="الباركود متاح على الجهاز اللي اترفعت منه"><div class="fx"><div class="fa">▦</div></div></div>';
        return '<div class="cr' + (r.active ? '' : ' off') + '" style="--i:' + Math.min(i, 14) + ';--x:' + exColor(r.exam) + '" data-t="' + r.token + '">' + qr +
          '<div class="cm"><span class="av">' + esc(String(r.patient || '؟').trim().charAt(0)) + '</span><div><b title="' + esc(r.patient) + '">' + esc(r.patient) + '</b><span class="n">' + esc(r.phone || '—') + '</span></div></div>' +
          '<div class="ce"><span class="ex"><i></i>' + esc(r.exam || 'فحص') + '</span>' + (r.pages ? '<small>' + r.pages + ' صفحة · ' + mb(r.size) + '</small>' : '') + '</div>' +
          '<div class="ct">' + hmOf(r.at) + '<small>اتحفظت</small></div><div class="cs">' + src + '</div>' +
          '<div class="cv"><span class="vw' + (r.views ? ' on' : '') + '" data-vw="' + r.token + '" title="مين فتح الحالة وإمتى" id="vw-' + r.token + '">' + ic('eye') + (r.views ? r.views : 'لسه') + '</span><small id="lv-' + r.token + '">' + (r.last_view ? when(r.last_view) : '') + '</small></div>' +
          '<div class="ca">' + (loc && r.active ? '<button class="ic2" data-a="qr" data-tip="الباركود">' + ic('qr') + '</button><button class="ic2" data-a="print" data-tip="اطبع استيكر">' + ic('print') + '</button>' + (r.phone ? '<button class="ic2 wa" data-a="wa" data-tip="واتساب للمريض">' + ic('wa') + '</button>' : '') : '') +
          (r.active ? '<button class="ic2" data-a="stop" data-tip="وقّف — الباركود مش هيفتح">' + ic('pause') + '</button>' : '<button class="ic2 go" data-a="start">' + ic('play') + ' شغّل</button>') + '<button class="ic2 dl" data-a="del" data-tip="امسح">' + ic('trash') + '</button></div></div>';
      }).join('') + '</div>';
    }).join('');
    [].forEach.call($('tbl').querySelectorAll('[data-qr]'), function (x) { x.onclick = function () { showQr(x.dataset.qr); }; });
    [].forEach.call($('tbl').querySelectorAll('[data-vw]'), function (x) { x.onclick = function () { viewsModal(x.dataset.vw); }; });
    [].forEach.call($('tbl').querySelectorAll('[data-a]'), function (b) { b.onclick = function () { act(b.closest('[data-t]').dataset.t, b.dataset.a, b); }; });
  }
  /* ── 4.98 · access log: every time a patient opens his case ── */
  var VIA = { qr: ['▦', 'باركود الحالة'], fixed: ['📌', 'الباركود الثابت'] }, SRC = { cache: '☁ من السيرفر', center: '💻 من جهاز المركز' };
  function entryRow(e, withName) {
    var v = VIA[e.via] || VIA.qr;
    return '<div class="ve"><span class="vi">' + v[0] + '</span><div><b>' + (withName ? esc(e.patient || '') + (e.exam ? ' <small>· ' + esc(e.exam) + '</small>' : '') : esc(e.dev || 'جهاز')) + '</b><small>' + when(e.at) + ' · ' + v[1] + (withName ? (e.dev ? ' · ' + esc(e.dev) : '') : (SRC[e.src] ? ' · ' + SRC[e.src] : '')) + '</small></div></div>';
  }
  function recent() {
    var el = $('rec'); if (!el) return; var L = ui.recent.slice(0, 6);
    el.innerHTML = L.length ? L.map(function (e, i) { return '<div class="rx" data-vt="' + esc(e.token) + '" style="animation-delay:' + i * 40 + 'ms">' + entryRow(e, true) + '</div>'; }).join('') : '<p class="rmt">لسه محدش فتح حالته — أول ما مريض يفتح هتلاقيه هنا لايف.</p>';
    [].forEach.call(el.querySelectorAll('[data-vt]'), function (x) { x.onclick = function () { viewsModal(x.dataset.vt); }; });
  }
  function viewsModal(tok) {
    var r = itemOf(tok); if (!r) return;
    ui.vwOpen = tok;
    var o = modal('<h3>مرات فتح الحالة</h3><p>' + esc(r.patient) + (r.exam ? ' · ' + esc(r.exam) : '') + '</p><div class="vsum"><div><b id="vmn">' + (r.views || 0) + '</b><span>مرة اتفتحت</span></div><div><b>' + (r.last_view ? when(r.last_view) : '—') + '</b><span>آخر مرة</span></div></div><div class="vlist" id="vml"><div class="sk"></div><div class="sk" style="opacity:.6"></div></div><button class="btn g w" data-x="cl" style="margin-top:12px">تمام</button>');
    var obs = new MutationObserver(function () { if (!document.body.contains(o)) { ui.vwOpen = ''; obs.disconnect(); } }); obs.observe(document.body, { childList: true });
    api('GET', 'views/' + tok).then(function (x) {
      var el = $('vml'); if (!el) return; var L = x.list || [];
      el.innerHTML = L.length ? L.map(function (e) { return entryRow(e, false); }).join('') : '<p class="rmt">لسه المريض مافتحهاش.</p>' + (r.views ? '<p class="rmt">(المرات القديمة قبل التحديث ده اتعدّت من غير تفاصيل)</p>' : '');
    }).catch(function (e) { var el = $('vml'); if (el) el.innerHTML = '<p class="rmt">' + esc(e.message) + '</p>'; });
  }
  function itemOf(tok) { return ui.list.filter(function (r) { return r.token === tok; })[0]; }
  function act(tok, a, b) {
    var r = itemOf(tok); if (!r) return;
    if (a === 'qr') return showQr(tok);
    if (a === 'print') return printSticker(tok);
    if (a === 'wa') return wa(tok);
    if (a === 'del' && !confirm('تمسح حالة «' + r.patient + '» نهائي؟\nالباركود هيقف، والملف هيتمسح من الجهاز ده ومن السيرفر.')) return;
    b.disabled = true;
    api('POST', 'item/' + tok + '/' + (a === 'del' ? 'delete' : a)).then(function () {
      if (a === 'del') { ui.list = ui.list.filter(function (x) { return x.token !== tok; }); delete ui.local[tok]; del(tok).catch(function () {}); toast('اتمسحت'); disk(); stats(); }
      else { r.active = a === 'start'; toast(a === 'start' ? '▶ الحالة اشتغلت تاني' : '⏸ الحالة اتوقفت — الباركود مش هيفتح'); }
      table();
    }).catch(function (e) { b.disabled = false; toast(e.message); });
  }
  function modal(html, on) {
    var o = document.createElement('div'); o.className = 'mdl'; o.innerHTML = '<div class="pn">' + html + '</div>'; document.body.appendChild(o);
    var close = function () { o.remove(); document.removeEventListener('keydown', kd); }, kd = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', kd);
    o.onclick = function (e) { var x = e.target.closest('[data-x]'); if (e.target === o) return close(); if (!x) return; if (x.dataset.x === 'cl') return close(); if (on) on(x.dataset.x, close, x); };
    return o;
  }
  function showQr(tok, fresh) {
    var r = itemOf(tok), u = linkOf(tok); if (!r || !u) return;
    modal((fresh ? '<div class="okb">' + ic('check') + '</div><h3>اتحفظت — ده الباركود</h3>' : '<h3>▦ باركود الحالة</h3>') + '<p>' + esc(r.patient) + (r.exam ? ' · ' + esc(r.exam) : '') + '</p><div class="qbig">' + qrSvg(u) + '</div><p>المريض يمسحه بكاميرا الموبايل ويشوف حالته على طول' + (r.wrapped ? ' — أو يلاقيها بالباركود الثابت برقم موبايله' : '') + '</p>' +
      '<div class="lk"><input readonly value="' + esc(u) + '"><button class="btn g sm" data-x="cp">نسخ</button></div><div class="bt"><button class="btn" data-x="pr">🖨 اطبع استيكر</button>' + (r.phone ? '<button class="btn" data-x="wa" style="background:#16A34A">واتساب للمريض</button>' : '<button class="btn g" data-x="op">👁 افتح</button>') + '</div><button class="btn g w" data-x="cl" style="margin-top:8px">تمام</button>',
      function (k, close, x) { if (k === 'pr') printSticker(tok); if (k === 'wa') wa(tok); if (k === 'op') window.open(u, '_blank', 'noopener'); if (k === 'cp') { try { navigator.clipboard.writeText(u).then(function () { toast('اتنسخ ✓'); }); } catch (er) { x.previousElementSibling.select(); } } });
  }
  function wa(tok) {
    var r = itemOf(tok), u = linkOf(tok), ph = phoneWa(r && r.phone); if (!r || !u || !ph) return;
    var t = 'أهلاً ' + r.patient + ' 🌿\nنتيجة ' + (r.exam || 'الفحص') + ' من *' + C.center + '* جاهزة.\nتقدر تشوفها وتنزّلها من هنا:\n' + u + '\n\nسلامتك 🙏';
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(t), '_blank');
  }
  function printSticker(tok) {
    var r = itemOf(tok), u = linkOf(tok); if (!r || !u) return;
    var w = window.open('', '_blank', 'width=420,height=620'); if (!w) return toast('اسمح بالنوافذ المنبثقة');
    w.document.write('<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>استيكر ' + esc(r.patient) + '</title><style>@page{size:70mm 95mm;margin:0}body{margin:0;font-family:Tahoma,Arial,sans-serif;color:#0F172A}.s{width:70mm;height:95mm;padding:5mm;box-sizing:border-box;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}h1{font-size:15px;margin:0}p{margin:3px 0;font-size:12px;color:#334155}.q{width:48mm;height:48mm;margin:3mm 0}.q svg{width:100%;height:100%}small{font-size:10px;color:#64748B}</style>' +
      '<div class="s"><h1>' + esc(C.center) + '</h1><p><b>' + esc(r.patient) + '</b>' + (r.exam ? ' · ' + esc(r.exam) : '') + '</p><div class="q">' + qrSvg(u) + '</div><p>📱 امسح الباركود بكاميرا الموبايل</p><small>وشوف نتيجة الفحص وانزّلها PDF</small></div><script>setTimeout(function(){print()},300)<\/script></html>');
    w.document.close();
  }

  /* ── backup / restore of THIS computer's cases (move them to another PC) ── */
  function backup() {
    var toks = Object.keys(ui.local); if (!toks.length) return toast('مفيش حالات على الجهاز ده');
    toast('بنجهّز النسخة…');
    Promise.all(toks.map(localGet)).then(function (recs) {
      recs = recs.filter(function (x) { return x && x.blob; });
      var head = JSON.stringify({ v: 1, code: C.code, center: C.center, at: Date.now(), items: recs.map(function (x) { return { token: x.token, key: x.key, size: x.blob.size, thumb: x.thumb || '', name: x.name || '', at: x.at || 0 }; }) }), hb = new TextEncoder().encode(head);
      var blob = new Blob(['OZXC1\n', String(hb.length).padStart(10, '0') + '\n', hb].concat(recs.map(function (x) { return x.blob; })), { type: 'application/octet-stream' });
      dl(URL.createObjectURL(blob), 'حالات-' + C.center + '-' + ymd() + '.ozxcases');
      toast('⬇ اتنزّلت نسخة فيها ' + recs.length + ' حالة (' + mb(blob.size) + ') — احفظها في مكان آمن');
    });
  }
  function restore(file) {
    file.slice(0, 17).text().then(function (t) {
      if (t.slice(0, 6) !== 'OZXC1\n') throw new Error('الملف ده مش نسخة حالات');
      var n = Number(t.slice(6, 16)), off = 17;
      return file.slice(off, off + n).text().then(function (h) {
        var H = JSON.parse(h); if (H.code !== C.code && !confirm('النسخة دي من لينك تاني (' + (H.center || '') + '). ترجّعها هنا برضه؟')) return 0;
        var p = off + n, jobs = H.items.map(function (it) { var b = file.slice(p, p + it.size); p += it.size; return put({ token: it.token, code: C.code, key: it.key, blob: b, size: it.size, thumb: it.thumb, name: it.name, at: it.at }); });
        return Promise.all(jobs).then(function () { return H.items.length; });
      });
    }).then(function (n) { if (!n) return; return localAll().then(function (L) { ui.local = L; table(); stats(); disk(); toast('⬆ اترجّع ' + n + ' حالة على الجهاز ده'); backfill(); }); })
      .catch(function (e) { toast(e.message || 'مش قادر أقرا النسخة'); });
  }

  /* ── cases saved before 4.91 → wrap their key so the fixed barcode finds them ── */
  function backfill() {
    /* 4.99 · and every case with a mobile gets the mobile-only key, so the patient finds it by his mobile alone */
    var L = ui.list.filter(function (r) { return !r.wrapped2 && r.phone && K.last10(r.phone) && ui.local[r.token]; }), i = 0;
    (function nx() {
      if (i >= L.length) { if (L.length) table(); return; } var r = L[i++];
      K.wrap2(ui.local[r.token].key, r.phone).then(function (w) { return w ? api('POST', 'item/' + r.token + '/wrap', { p: w }).then(function () { r.wrapped = r.wrapped2 = true; }) : null; }).catch(function () {}).then(nx);
    })();
  }

  /* ── live: the server asks this page for a file when a patient opens it ── */
  function setLive(on) { ui.live = on; var s = $('st'); if (!s) return; s.className = 'pill' + (on ? ' on' : ''); s.lastChild.textContent = on ? 'متصل — المرضى يقدروا يفتحوا' : 'مش متصل — بنحاول تاني…'; }
  function connect() {
    try { if (ui.es) ui.es.close(); } catch (e) {}
    var es = new EventSource(BASE + '/live'); ui.es = es;
    es.addEventListener('hello', function () { setLive(true); });
    es.onerror = function () { setLive(false); };
    es.addEventListener('need', function (ev) {
      var m = {}; try { m = JSON.parse(ev.data); } catch (e) { return; }
      localGet(m.token).then(function (rec) {
        if (!rec || !rec.blob) return fetch(BASE + '/relay/' + m.ticket + '?miss=1', { method: 'POST', credentials: 'same-origin' });
        return fetch(BASE + '/relay/' + m.ticket, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: rec.blob });
      }).catch(function () {});
    });
    es.addEventListener('ask', function (ev) {
      var m = {}; try { m = JSON.parse(ev.data); } catch (e) { return; }
      ui.asks = m.asks || ui.asks; ui.newAsk = K.last10(m.phone); asks(); beep(); toast('📨 ' + (m.name || 'مريض') + ' بيطلب نتيجته');
    });
    es.addEventListener('view', function (ev) {
      var m = {}; try { m = JSON.parse(ev.data); } catch (e) { return; }
      var r = itemOf(m.token); if (r) { r.views = m.views; r.last_view = m.last_view; }
      var t = $('vw-' + m.token); if (t) { t.className = 'vw on'; void t.offsetWidth; t.className = 'vw on pop'; t.innerHTML = ic('eye') + m.views; }
      var lv = $('lv-' + m.token); if (lv) lv.textContent = when(m.last_view);
      if (m.entry) { ui.recent.unshift(m.entry); ui.recent = ui.recent.slice(0, 30); recent(); var f = $('rec') && $('rec').firstChild; if (f && f.classList) f.classList.add('new'); }
      if (m.entry && ui.vwOpen === m.token) { var vl = $('vml'), vn = $('vmn'); if (vn) vn.textContent = m.views; if (vl) { if (!vl.querySelector('.ve')) vl.innerHTML = ''; vl.insertAdjacentHTML('afterbegin', entryRow(m.entry, false)); vl.firstChild.classList.add('new'); } }
      if (r) { toast('👁 ' + r.patient + ' فتح حالته دلوقتي' + (m.entry && m.entry.dev ? ' (' + m.entry.dev + ')' : '')); stats(); }
    });
  }
  function disk() {
    var n = 0, sz = 0; Object.keys(ui.local).forEach(function (k) { n++; sz += ui.local[k].size || 0; });
    var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
    est.then(function (e) {
      var pct = e && e.quota ? Math.max(2, Math.min(100, Math.round(e.usage / e.quota * 100))) : 0;
      $('disk').innerHTML = '<div class="dt"><span>💾</span><div><b>' + n + ' حالة · ' + mb(sz) + '</b><small>محفوظة على الكمبيوتر ده' + (e && e.quota ? ' · متاح حوالي ' + mb(Math.max(0, e.quota - e.usage)) : '') + '</small></div></div>' +
        (e && e.quota ? '<div class="du"><i style="width:0" data-w="' + pct + '%"></i></div>' : '<div style="height:10px"></div>') +
        '<p>كل حالة ليها نسخة مشفّرة على السيرفر أول ' + C.cacheDays + ' أيام، وبعدها بتفتح للمريض من الجهاز ده — <b>سيب الصفحة مفتوحة والكمبيوتر شغال</b>. متمسحش بيانات المتصفح، واعمل «نسخة احتياطية» كل أسبوع.</p>';
      var du = $('disk').querySelector('.du i'); if (du) requestAnimationFrame(function () { requestAnimationFrame(function () { du.style.width = du.dataset.w; }); });
    });
  }
  function boot() {
    shell();
    Promise.all([api('GET', 'list'), localAll()]).then(function (a) { ui.list = a[0].list || []; ui.local = a[1] || {}; ui.asks = a[0].asks || []; ui.recent = a[0].recent || []; asks(); recent(); table(); stats(); disk(); backfill(); }).catch(function (e) { $('tbl').innerHTML = '<div class="emp"><i>⚠️</i>' + esc(e.message) + '</div>'; });
    connect(); bootWatch();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && (!ui.es || ui.es.readyState === 2)) connect(); });
    window.addEventListener('beforeunload', function (e) { if (Object.keys(ui.local).length || ui.queue.some(function (q) { return q.st === 'ready' || q.st === 'saving'; })) { e.preventDefault(); e.returnValue = ''; } });
  }
  if (C.auth) boot(); else login();
})();

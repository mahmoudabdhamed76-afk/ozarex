/* ════════════════════════════════════════════════════════════════════
   حالات المرضى — صفحة المركز (من الكمبيوتر) /k/<code>
   4.90 · يرفع PDF الحالة ← بيتشفّر هنا في المتصفح ← الأصل يتحفظ على الجهاز ده
          (IndexedDB)، ونسخة مشفّرة مؤقتة على السيرفر 7 أيام، وبعدها لايف من هنا.
   4.91 · شكل جديد + اختيار تاني: باركود ثابت على كل الورق (هيدر سيرفر الطباعة)
          المريض يمسحه ← يكتب موبايله وأول اسمه ← يوصل لحالته.
          + رفع كذا ملف مرة واحدة، قراءة الاسم والموبايل من الـ PDF، مراقبة فولدر
          سيرفر الطباعة، فلاتر، ونسخة احتياطية تتنقل لكمبيوتر تاني.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var C = window.CD || {}, BASE = '/k/' + C.code, $ = function (id) { return document.getElementById(id); }, K = window.OZK;
  var ui = { list: [], local: {}, q: '', f: 'all', queue: [], live: false, es: null, fixed: !!C.fixedOn, dir: null, dirName: '', seen: {}, watchT: 0, pend: {}, auto: false, lastScan: 0 };
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
  function qrM(text) { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q; }
  function qrSvg(text) {
    var q = qrM(text), n = q.getModuleCount(), m = 2, sz = n + m * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sz + ' ' + sz + '" shape-rendering="crispEdges"><rect width="' + sz + '" height="' + sz + '" fill="#fff"/><path d="' + d + '" fill="#0F172A"/></svg>';
  }
  function qrDraw(ctx, text, x, y, size) { var q = qrM(text), n = q.getModuleCount(), cell = size / (n + 4); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, size, size); ctx.fillStyle = '#0F172A'; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(Math.floor(x + (c + 2) * cell), Math.floor(y + (r + 2) * cell), Math.ceil(cell), Math.ceil(cell)); }

  /* ════ login ════ */
  function login() {
    document.body.innerHTML = '<div class="gate"><div class="box"><i>🔐</i><h1>حالات المرضى</h1><p>' + esc(C.center) + '</p><input class="fld" id="pw" type="password" autocomplete="current-password" placeholder="الباسوورد" autofocus><div class="err" id="er"></div><button class="btn w" id="go" style="margin-top:6px;padding:13px">دخول</button><p style="margin-top:14px;font-size:12px">الباسوورد من الشركة — مختلف عن لينك الحسابات.</p></div></div><div class="toast" id="toast"></div>';
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
    document.body.innerHTML = '<div class="wrap">' +
      '<div class="hero"><div class="top"><span class="lg">' + esc(String(C.center || 'م').trim().charAt(0)) + '</span><div><h1>📁 حالات المرضى</h1><small>' + esc(C.center) + '</small></div>' +
        '<div class="sp"><span class="pill" id="st"><i></i><span>بيتصل…</span></span><button class="hb" id="bk" title="نسخة احتياطية من حالات الجهاز ده — تنقلها لكمبيوتر تاني">⬇ نسخة احتياطية</button><button class="hb" id="rs" title="رجّع نسخة احتياطية">⬆ استرجاع</button><input type="file" id="rsf" accept=".ozxcases" hidden><button class="hb" id="out">خروج</button></div></div>' +
        '<div class="stats"><div><b id="s1">0</b><span>حالة النهارده</span></div><div><b id="s2">0</b><span>حالة الشهر ده</span></div><div><b id="s3">0</b><span>مرة المرضى فتحوا</span></div><div><b id="s4">0</b><span>محفوظة على الجهاز ده</span></div></div></div>' +
      '<div class="opts"><div class="opt"><span class="oi" style="background:#E0F2FE">▦</span><div><h3>باركود لكل حالة <span class="tg ok">شغال دايماً</span></h3><p>بعد ما تحفظ الحالة بيطلعلها باركود لوحدها — تطبعه استيكر على الظرف أو تبعته للمريض واتساب، والمريض يفتح على طول من غير ما يكتب حاجة.</p></div></div>' +
        '<div class="opt b" id="fx"></div></div>' +
      '<div class="upz"><div class="drop" id="drop"><span class="ic">📄</span><div><b>اسحب ملفات PDF هنا</b><small>ملف واحد أو كذا ملف مرة واحدة · لحد ' + C.maxMb + ' ميجا للملف · بنحاول نقرا الاسم والموبايل من الملف</small></div><div class="db"><button class="btn" id="pk" type="button">＋ اختار ملفات</button></div><input type="file" id="fi" accept="application/pdf,.pdf" multiple hidden></div>' +
        (dirOk ? '<div class="watch" id="wt"></div>' : '') + '</div>' +
      '<div class="queue" id="qu"></div>' +
      '<div class="card list"><div class="ch"><h2>الحالات</h2><div class="chips" id="fl"></div><input class="fld q" id="q" placeholder="🔍 اسم المريض أو الموبايل أو الفحص"></div><div id="tbl"><div class="emp"><div class="spin"></div></div></div></div>' +
      '<div class="disk" id="disk">💾 <span>بنحسب المساحة…</span></div></div><div class="toast" id="toast"></div>';
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
    el.innerHTML = '<span class="qm' + (ui.fixed ? '' : ' off') + '" id="fqm" title="كبّر">' + qrSvg(fixedUrl()) + '</span><div style="flex:1;min-width:0"><h3>📌 باركود ثابت على كل الورق <span class="tg pn">جديد</span><button class="sw' + (ui.fixed ? ' on' : '') + '" id="fsw" type="button" aria-label="تشغيل/إيقاف"></button></h3>' +
      '<p>باركود واحد للمركز تحطه في هيدر سيرفر الطباعة، فيتطبع على كل التقارير. المريض يمسحه ← يكتب <b>رقم موبايله</b> و<b>أول اسمه</b> ← يوصل لحالته.</p>' +
      '<div class="ob"><button class="btn sm" id="fh">⬇ صورة الهيدر</button><button class="btn g sm" id="fq">⬇ الباركود لوحده</button><button class="btn g sm" id="fp">🖨 اطبع</button><button class="btn g sm" id="fc">نسخ اللينك</button></div>' +
      '<p style="font-size:12px;margin-top:8px">' + (ui.fixed ? '✅ شغال — لازم تكتب موبايل المريض مع كل حالة عشان يلاقيها.' : '⏸ موقوف — المرضى مش هيقدروا يدوّروا.') + '</p></div>';
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
      x.fillStyle = '#475569'; x.font = '500 46px ' + F; x.fillText('امسح الباركود ← اكتب رقم موبايلك وأول اسمك ← افتح نتيجتك', W - 70, 345);
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
      w.document.write('<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>الباركود الثابت</title><style>@page{size:A4;margin:12mm}body{margin:0;font-family:Tahoma,Arial,sans-serif;text-align:center;color:#0F172A}img{width:100%}.q{width:120mm;margin:14mm auto 4mm}.q svg{width:100%}p{font-size:15px;color:#334155}</style><img src="' + u + '"><div class="q">' + qrSvg(fixedUrl()) + '</div><p><b>' + esc(C.center) + '</b> — امسح الباركود، اكتب رقم موبايلك وأول اسمك، وشوف نتيجتك.</p><script>setTimeout(function(){print()},400)<\/script></html>');
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
      var g = f.name.replace(/\.pdf$/i, '').replace(/[_\-.]+/g, ' ').replace(/\d{5,}/g, ' ').replace(/\s+/g, ' ').trim(); if (/[؀-ۿ]/.test(g)) q.patient = g.slice(0, 80);
      ui.queue.push(q); readPdf(q);
    });
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
    var iv = crypto.getRandomValues(new Uint8Array(12)), key, rawKey, wrapped = null;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt'])   /* 128-bit: a shorter link → a lighter barcode */
      .then(function (k) { key = k; return crypto.subtle.exportKey('raw', k); }).then(function (r) { rawKey = K.b64u(r); return K.wrap(rawKey, q.patient, q.phone); })
      .then(function (w) { wrapped = w; return q.file.arrayBuffer(); })
      .then(function (buf) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, buf); })
      .then(function (ct) {
        var blob = new Blob([iv, ct], { type: 'application/octet-stream' }), meta = { patient: q.patient, phone: q.phone, exam: String(q.exam || '').trim(), name: q.name, pages: q.pages, wrap: wrapped };
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
        ui.list.unshift(r.item); q.st = 'done'; q.token = r.item.token; q.wrapped = !!wrapped; q.file = null;
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
    var F = [['all', 'الكل'], ['today', 'النهارده'], ['week', 'الأسبوع'], ['new', 'لسه متفتحتش'], ['off', 'موقوفة']], save = ui.f;
    $('fl').innerHTML = F.map(function (x) { ui.f = x[0]; var n = ui.list.filter(inF).length; return '<button data-f="' + x[0] + '" class="' + (save === x[0] ? 'on' : '') + '">' + x[1] + '<em>' + n + '</em></button>'; }).join('');
    ui.f = save;
    [].forEach.call($('fl').querySelectorAll('button'), function (b) { b.onclick = function () { ui.f = b.dataset.f; table(); }; });
  }
  function table() {
    chips();
    var q = ui.q.toLowerCase(), L = ui.list.filter(inF).filter(function (r) { return !q || String(r.patient).toLowerCase().indexOf(q) > -1 || String(r.phone || '').indexOf(q) > -1 || String(r.exam || '').toLowerCase().indexOf(q) > -1; });
    if (!L.length) { $('tbl').innerHTML = '<div class="emp"><i>' + (q || ui.f !== 'all' ? '🔍' : '📭') + '</i>' + (q || ui.f !== 'all' ? 'مفيش حالات هنا' : 'لسه مفيش حالات — اسحب أول PDF فوق') + '</div>'; return; }
    $('tbl').innerHTML = '<table class="tb"><thead><tr><th style="width:64px"></th><th style="width:48px"></th><th>المريض</th><th>الفحص</th><th>اتحفظت</th><th>متاحة منين</th><th>اتفتحت</th><th></th></tr></thead><tbody>' + L.slice(0, 300).map(function (r, i) {
      var loc = ui.local[r.token], days = r.cached ? Math.max(1, Math.ceil((r.cache_until - Date.now()) / 864e5)) : 0;
      var src = !r.active ? '<span class="tg of">⏸ موقوفة</span>' : (loc ? '<span class="tg lc">💾 الجهاز ده</span> ' : '') + (r.cached ? '<span class="tg nw">☁ ' + days + ' يوم</span> ' : '') + (!loc && !r.cached ? '<span class="tg wr">⚠ على جهاز تاني</span> ' : '') + (r.wrapped ? '<span class="tg pn" title="المريض يلاقيها بالباركود الثابت">📌</span>' : (r.phone ? '' : '<span class="tg of" title="من غير موبايل — مش هتتلاقى بالباركود الثابت">📵</span>'));
      return '<tr style="animation-delay:' + Math.min(i * 25, 400) + 'ms" data-t="' + r.token + '"><td>' + (loc ? '<span class="qr" data-qr="' + r.token + '" title="كبّر الباركود">' + qrSvg(linkOf(r.token)) + '</span>' : '<span class="qr na" title="الباركود متاح على الجهاز اللي اترفعت منه">▦</span>') + '</td>' +
        '<td>' + (loc && loc.thumb ? '<img class="th2" src="' + loc.thumb + '" alt="">' : '') + '</td>' +
        '<td><b>' + esc(r.patient) + '</b><small class="n">' + esc(r.phone || '') + '</small></td><td>' + esc(r.exam || '—') + (r.pages ? '<small style="display:block">' + r.pages + ' صفحة · ' + mb(r.size) + '</small>' : '') + '</td><td>' + when(r.at) + '</td><td>' + src + '</td>' +
        '<td><span class="tg ' + (r.views ? 'ok' : 'of') + '" id="vw-' + r.token + '">' + (r.views ? '👁 ' + r.views : 'لسه') + '</span><small style="display:block" id="lv-' + r.token + '">' + (r.last_view ? when(r.last_view) : '') + '</small></td>' +
        '<td><div class="acts">' + (loc && r.active ? '<button class="btn g sm" data-a="qr">▦</button><button class="btn g sm" data-a="print" title="استيكر">🖨</button>' + (r.phone ? '<button class="btn g sm" data-a="wa" style="color:#15803D">واتساب</button>' : '') : '') +
        (r.active ? '<button class="btn g sm" data-a="stop" title="وقّف — الباركود مش هيفتح">وقّف</button>' : '<button class="btn g sm" data-a="start">▶ شغّل</button>') + '<button class="btn d sm" data-a="del" title="امسح">🗑</button></div></td></tr>';
    }).join('') + '</tbody></table>';
    [].forEach.call($('tbl').querySelectorAll('[data-qr]'), function (x) { x.onclick = function () { showQr(x.dataset.qr); }; });
    [].forEach.call($('tbl').querySelectorAll('[data-a]'), function (b) { b.onclick = function () { act(b.closest('tr').dataset.t, b.dataset.a, b); }; });
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
    modal((fresh ? '<div style="font-size:34px">✅</div><h3>اتحفظت — ده الباركود</h3>' : '<h3>▦ باركود الحالة</h3>') + '<p>' + esc(r.patient) + (r.exam ? ' · ' + esc(r.exam) : '') + '</p><div class="qbig">' + qrSvg(u) + '</div><p>المريض يمسحه بكاميرا الموبايل ويشوف حالته على طول' + (r.wrapped ? ' — أو يلاقيها بالباركود الثابت بموبايله وأول اسمه' : '') + '</p>' +
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
    var L = ui.list.filter(function (r) { return !r.wrapped && r.phone && K.last10(r.phone) && ui.local[r.token]; }), i = 0;
    (function nx() {
      if (i >= L.length) { if (L.length) table(); return; } var r = L[i++];
      K.wrap(ui.local[r.token].key, r.patient, r.phone).then(function (w) { return w ? api('POST', 'item/' + r.token + '/wrap', w).then(function () { r.wrapped = true; }) : null; }).catch(function () {}).then(nx);
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
    es.addEventListener('view', function (ev) {
      var m = {}; try { m = JSON.parse(ev.data); } catch (e) { return; }
      var r = itemOf(m.token); if (r) { r.views = m.views; r.last_view = m.last_view; }
      var t = $('vw-' + m.token); if (t) { t.className = 'tg ok pop'; t.textContent = '👁 ' + m.views; }
      var lv = $('lv-' + m.token); if (lv) lv.textContent = when(m.last_view);
      if (r) { toast('👁 ' + r.patient + ' فتح حالته دلوقتي'); stats(); }
    });
  }
  function disk() {
    var n = 0, sz = 0; Object.keys(ui.local).forEach(function (k) { n++; sz += ui.local[k].size || 0; });
    var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
    est.then(function (e) {
      $('disk').innerHTML = '💾 <span>على الكمبيوتر ده: <b>' + n + ' حالة · ' + mb(sz) + '</b>' + (e && e.quota ? ' (المساحة المتاحة للمتصفح حوالي ' + mb(Math.max(0, e.quota - e.usage)) + ')' : '') + '.<br>' +
        'كل حالة ليها نسخة مشفّرة على السيرفر أول ' + C.cacheDays + ' أيام، وبعدها بتفتح للمريض من الجهاز ده — <b>سيب الصفحة مفتوحة والكمبيوتر شغال</b>. متمسحش بيانات المتصفح، واعمل «⬇ نسخة احتياطية» كل أسبوع.</span>';
    });
  }
  function boot() {
    shell();
    Promise.all([api('GET', 'list'), localAll()]).then(function (a) { ui.list = a[0].list || []; ui.local = a[1] || {}; table(); stats(); disk(); backfill(); }).catch(function (e) { $('tbl').innerHTML = '<div class="emp"><i>⚠️</i>' + esc(e.message) + '</div>'; });
    connect(); bootWatch();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && (!ui.es || ui.es.readyState === 2)) connect(); });
    window.addEventListener('beforeunload', function (e) { if (Object.keys(ui.local).length || ui.queue.some(function (q) { return q.st === 'ready' || q.st === 'saving'; })) { e.preventDefault(); e.returnValue = ''; } });
  }
  if (C.auth) boot(); else login();
})();

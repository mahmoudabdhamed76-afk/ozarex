/* ════════════════════════════════════════════════════════════════════
   4.90 · حالات المرضى — صفحة المركز (من الكمبيوتر) /k/<code>
   · يرفع PDF الحالة ← بيتشفّر هنا في المتصفح ← الأصل يتحفظ على الجهاز ده
     (IndexedDB)، ونسخة مشفّرة مؤقتة على السيرفر 7 أيام.
   · الباركود فيه مفتاح فك التشفير (بعد #) — مبيتبعتش للسيرفر أبداً.
   · طول ما الصفحة مفتوحة، أي مريض يفتح حالته بعد الـ 7 أيام بيوصله
     الملف من الجهاز ده لايف.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var C = window.CD || {}, BASE = '/k/' + C.code, $ = function (id) { return document.getElementById(id); };
  var ui = { list: [], local: {}, q: '', file: null, meta: null, live: false, es: null };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { var el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2800); }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function when(ts) { var m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(ts || '')); if (!m) return ''; var d = new Date(+m[1], m[2] - 1, +m[3]), t = new Date(); t.setHours(0, 0, 0, 0); var dd = Math.round((t - d) / 864e5), h = +m[4], hm = ((h % 12) || 12) + ':' + m[5] + (h < 12 ? ' ص' : ' م'); return dd === 0 ? 'النهارده ' + hm : dd === 1 ? 'إمبارح ' + hm : (+m[3]) + '/' + (+m[2]) + '/' + m[1]; }
  function api(method, sub, body) {
    return fetch(BASE + '/' + sub, { method: method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401 && j.login) { location.reload(); throw new Error(''); } if (!r.ok) throw new Error(j.message || 'محصلش — جرّب تاني'); return j; }); });
  }
  function b64u(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function linkOf(tok) { var L = ui.local[tok]; return L ? location.origin + '/v/' + tok + '#' + L.key : ''; }
  function phoneWa(p) { var d = String(p || '').replace(/\D/g, ''); if (!d) return ''; if (d.indexOf('00') === 0) d = d.slice(2); else if (d.indexOf('0') === 0) d = '2' + d; else if (d.length === 10 && d.charAt(0) === '1') d = '20' + d; return d; }

  /* ── the files on THIS computer (IndexedDB) ── */
  var IDB = null;
  function idb() {
    if (IDB) return IDB;
    IDB = new Promise(function (ok, no) { var r = indexedDB.open('ozx-cases', 1); r.onupgradeneeded = function () { r.result.createObjectStore('f', { keyPath: 'token' }); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; });
    return IDB;
  }
  function tx(mode, fn) { return idb().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction('f', mode), s = t.objectStore('f'), out = fn(s); t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { no(t.error); }; t.onabort = function () { no(t.error || new Error('مساحة الجهاز مش كفاية')); }; }); }); }
  function localAll() { return idb().then(function (d) { return new Promise(function (ok) { var out = {}, c = d.transaction('f').objectStore('f').openCursor(); c.onsuccess = function () { var x = c.result; if (!x) return ok(out); var v = x.value; if (v.code === C.code) out[v.token] = { key: v.key, size: v.size, thumb: v.thumb || '' }; x.continue(); }; c.onerror = function () { ok(out); }; }); }).catch(function () { return {}; }); }
  function localGet(tok) { return idb().then(function (d) { return new Promise(function (ok) { var r = d.transaction('f').objectStore('f').get(tok); r.onsuccess = function () { ok(r.result || null); }; r.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); }

  /* ── QR (vendor/qrcode.js) ── */
  function qrSvg(text) {
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = 2, sz = n + m * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sz + ' ' + sz + '" shape-rendering="crispEdges"><rect width="' + sz + '" height="' + sz + '" fill="#fff"/><path d="' + d + '" fill="#0F172A"/></svg>';
  }

  /* ════ login ════ */
  function login() {
    document.body.innerHTML = '<div class="gate"><div class="box"><i>🔐</i><h1>حالات المرضى</h1><p>' + esc(C.center) + '</p><input class="fld" id="pw" type="password" inputmode="text" autocomplete="current-password" placeholder="الباسوورد" autofocus><div class="err" id="er"></div><button class="btn w" id="go" style="margin-top:6px;padding:13px">دخول</button><p style="margin-top:14px;font-size:12px">الباسوورد من الشركة — مختلف عن لينك الحسابات.</p></div></div><div class="toast" id="toast"></div>';
    var go = function () {
      var p = $('pw').value; if (!p) return; $('go').disabled = true;
      fetch(BASE + '/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: p }) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'محصلش'); location.reload(); }); })
        .catch(function (e) { $('go').disabled = false; $('er').textContent = e.message; $('pw').select(); });
    };
    $('go').onclick = go; $('pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  /* ════ app ════ */
  function shell() {
    document.body.innerHTML = '<div class="wrap"><div class="hd"><span class="lg">' + esc(String(C.center || 'م').trim().charAt(0)) + '</span><div><h1>📁 حالات المرضى</h1><small>' + esc(C.center) + '</small></div><span class="st" id="st"><i></i><span>بيتصل…</span></span><button class="btn g sm" id="out" title="خروج">خروج</button></div>' +
      '<div class="up"><div class="drop" id="drop"><div class="ic">📄</div><b>اسحب PDF الحالة هنا</b><small>أو دوس واختار من الجهاز · لحد ' + C.maxMb + ' ميجا</small><input type="file" id="fi" accept="application/pdf,.pdf" hidden></div>' +
      '<div class="form"><label class="l">اسم المريض *</label><input class="fld" id="pn" maxlength="80" placeholder="مثلاً: محمد أحمد علي"><div class="row2"><div><label class="l">موبايل المريض</label><input class="fld n" id="pp" maxlength="20" inputmode="tel" placeholder="01xxxxxxxxx" style="text-align:right"></div><div><label class="l">نوع الفحص</label><input class="fld" id="pe" maxlength="80" list="exl" placeholder="مقطعية · رنين · سونار…"><datalist id="exl"><option>أشعة مقطعية</option><option>رنين مغناطيسي</option><option>سونار</option><option>أشعة عادية</option><option>ماموجرام</option><option>دوبلر</option><option>أشعة بانوراما</option><option>قياس كثافة العظام</option></datalist></div></div>' +
      '<button class="btn w" id="save" style="margin-top:14px;padding:13px" disabled>▦ احفظ واطلع الباركود</button><div class="bar" id="bar"><i></i></div></div></div>' +
      '<div class="card"><div class="ch"><h2>الحالات</h2><em id="cnt"></em><input class="fld q" id="q" placeholder="🔍 دوّر باسم المريض أو الموبايل"></div><div id="tbl"><div class="emp"><div class="spin"></div></div></div></div>' +
      '<div class="disk" id="disk">💾 <span>بنحسب المساحة…</span></div></div><div class="toast" id="toast"></div>';
    $('out').onclick = function () { api('POST', 'logout').then(function () { location.reload(); }).catch(function () { location.reload(); }); };
    var dr = $('drop'), fi = $('fi');
    dr.onclick = function (e) { if (!ui.file && e.target.id !== 'fi') fi.click(); };
    fi.onchange = function () { if (fi.files[0]) pick(fi.files[0]); fi.value = ''; };
    ['dragenter', 'dragover'].forEach(function (k) { dr.addEventListener(k, function (e) { e.preventDefault(); dr.classList.add('ov'); }); });
    ['dragleave', 'drop'].forEach(function (k) { dr.addEventListener(k, function (e) { e.preventDefault(); dr.classList.remove('ov'); }); });
    dr.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) pick(f); });
    document.addEventListener('dragover', function (e) { e.preventDefault(); }); document.addEventListener('drop', function (e) { e.preventDefault(); });
    $('pn').oninput = canSave; $('save').onclick = save;
    $('q').oninput = function () { ui.q = this.value.trim(); table(); };
  }
  function canSave() { $('save').disabled = !(ui.file && $('pn').value.trim().length >= 2); }

  /* pdf.js (only to count the pages and draw a small preview of page 1) */
  function pdfjs(cb) {
    if (window.pdfjsLib) return cb(window.pdfjsLib);
    var s = document.createElement('script'); s.src = '/vendor/pdfjs/pdf.min.js';
    s.onload = function () { try { pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; } catch (e) {} cb(window.pdfjsLib); }; s.onerror = function () { cb(null); };
    document.head.appendChild(s);
  }
  function pick(f) {
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return toast('اختار ملف PDF');
    if (f.size > C.maxMb * 1048576) return toast('الملف أكبر من ' + C.maxMb + ' ميجا');
    ui.file = f; ui.meta = { pages: 0, thumb: '' };
    var dr = $('drop'); dr.classList.add('has');
    dr.innerHTML = '<button class="x" id="dx" type="button" title="شيل الملف">×</button><div class="pv"><div class="th" id="th" style="display:grid;place-items:center;font-size:34px">📄</div><div style="min-width:0"><b>' + esc(f.name) + '</b><small>' + mb(f.size) + ' · <span id="pgs">بنقرا الصفحات…</span></small><small style="margin-top:6px;color:#0F766E;font-weight:700">🔒 الملف هيتشفّر على الجهاز ده قبل ما يتحفظ</small></div></div>';
    $('dx').onclick = function (e) { e.stopPropagation(); reset(); };
    if (!$('pn').value) { var guess = f.name.replace(/\.pdf$/i, '').replace(/[_\-.]+/g, ' ').replace(/\d{5,}/g, '').trim(); if (/[؀-ۿ]/.test(guess)) $('pn').value = guess.slice(0, 80); }
    canSave(); $('pn').focus();
    pdfjs(function (lib) {
      if (!lib) { $('pgs').textContent = 'PDF'; return; }
      f.arrayBuffer().then(function (buf) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (doc) {
        ui.meta.pages = doc.numPages; var el = $('pgs'); if (el) el.textContent = doc.numPages + ' صفحة';
        return doc.getPage(1).then(function (pg) { var vp = pg.getViewport({ scale: 1 }), k = 240 / vp.width, v2 = pg.getViewport({ scale: k }), cv = document.createElement('canvas'); cv.dir = 'ltr'; cv.width = v2.width; cv.height = v2.height; return pg.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise.then(function () { ui.meta.thumb = cv.toDataURL('image/jpeg', 0.6); var th = $('th'); if (th && ui.file === f) { var im = new Image(); im.className = 'th'; im.src = ui.meta.thumb; th.replaceWith(im); } }); });
      }).catch(function () { var el = $('pgs'); if (el) el.textContent = 'مش قادر أقرا الملف — اتأكد إنه PDF سليم'; });
    });
  }
  function reset() {
    ui.file = null; ui.meta = null; var dr = $('drop'); dr.classList.remove('has');
    dr.innerHTML = '<div class="ic">📄</div><b>اسحب PDF الحالة هنا</b><small>أو دوس واختار من الجهاز · لحد ' + C.maxMb + ' ميجا</small><input type="file" id="fi" accept="application/pdf,.pdf" hidden>';
    var fi = $('fi'); fi.onchange = function () { if (fi.files[0]) pick(fi.files[0]); fi.value = ''; };
    $('pn').value = $('pp').value = $('pe').value = ''; canSave();
  }
  function save() {
    var f = ui.file, b = $('save'); if (!f) return;
    if (!(window.crypto && crypto.subtle)) return toast('المتصفح ده مش بيدعم التشفير — استخدم Chrome أو Edge');
    b.disabled = true; b.textContent = '🔒 بنشفّر…'; var bar = $('bar'); bar.style.display = 'block'; bar.firstChild.style.width = '3%';
    var meta = { patient: $('pn').value.trim(), phone: $('pp').value.trim(), exam: $('pe').value.trim(), name: f.name, pages: ui.meta && ui.meta.pages || 0 }, thumb = ui.meta && ui.meta.thumb || '';
    var key, iv = crypto.getRandomValues(new Uint8Array(12)), rawKey;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt'])   /* 128-bit: a shorter link → a lighter barcode that scans easily from a small sticker */.then(function (k) { key = k; return crypto.subtle.exportKey('raw', k); }).then(function (r) { rawKey = b64u(r); return f.arrayBuffer(); })
      .then(function (buf) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, buf); })
      .then(function (ct) {
        var blob = new Blob([iv, ct], { type: 'application/octet-stream' });
        b.textContent = '⬆ بنرفع…';
        return new Promise(function (ok, no) {
          var x = new XMLHttpRequest(); x.open('POST', BASE + '/case'); x.withCredentials = true;
          x.setRequestHeader('Content-Type', 'application/octet-stream');
          x.setRequestHeader('X-Meta', b64u(new TextEncoder().encode(JSON.stringify(meta))));
          x.upload.onprogress = function (e) { if (e.lengthComputable) bar.firstChild.style.width = Math.max(3, Math.round(e.loaded / e.total * 100)) + '%'; };
          x.onload = function () { var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} if (x.status === 200 && j.item) ok({ item: j.item, blob: blob }); else no(new Error(j.message || 'محصلش — جرّب تاني')); };
          x.onerror = function () { no(new Error('النت فصل — جرّب تاني')); };
          x.send(blob);
        });
      })
      .then(function (r) {
        return tx('readwrite', function (s) { s.put({ token: r.item.token, code: C.code, key: rawKey, blob: r.blob, size: r.blob.size, thumb: thumb, name: f.name, at: Date.now() }); }).then(function () { return r; });
      })
      .then(function (r) {
        ui.local[r.item.token] = { key: rawKey, size: r.blob.size, thumb: thumb };
        ui.list.unshift(r.item); reset(); table(); disk();
        b.textContent = '▦ احفظ واطلع الباركود'; bar.style.display = 'none'; bar.firstChild.style.width = '0';
        showQr(r.item.token, true);
      })
      .catch(function (e) { b.disabled = false; b.textContent = '▦ احفظ واطلع الباركود'; bar.style.display = 'none'; toast(e.message || 'محصلش'); });
  }

  function table() {
    var q = ui.q.toLowerCase(), L = ui.list.filter(function (r) { return !q || String(r.patient).toLowerCase().indexOf(q) > -1 || String(r.phone || '').indexOf(q) > -1 || String(r.exam || '').toLowerCase().indexOf(q) > -1; });
    $('cnt').textContent = ui.list.length ? ui.list.length + ' حالة' : '';
    if (!L.length) { $('tbl').innerHTML = '<div class="emp"><i>' + (q ? '🔍' : '📭') + '</i>' + (q ? 'مفيش حالة بالاسم ده' : 'لسه مفيش حالات — اسحب أول PDF فوق') + '</div>'; return; }
    $('tbl').innerHTML = '<table class="tb"><thead><tr><th style="width:64px"></th><th>المريض</th><th>الفحص</th><th>اتحفظت</th><th>متاحة منين</th><th>اتفتحت</th><th></th></tr></thead><tbody>' + L.slice(0, 300).map(function (r, i) {
      var loc = !!ui.local[r.token], days = r.cached ? Math.max(1, Math.ceil((r.cache_until - Date.now()) / 864e5)) : 0;
      var src = !r.active ? '<span class="tg of">⏸ موقوفة</span>' : (loc ? '<span class="tg lc">💾 الجهاز ده</span> ' : '') + (r.cached ? '<span class="tg nw">☁ ' + days + ' يوم كمان</span>' : '') + (!loc && !r.cached ? '<span class="tg wr">⚠ على جهاز تاني</span>' : '');
      return '<tr style="animation-delay:' + Math.min(i * 30, 400) + 'ms" data-t="' + r.token + '"><td>' + (loc ? '<span class="qr" data-qr="' + r.token + '" title="كبّر الباركود">' + qrSvg(linkOf(r.token)) + '</span>' : '<span class="qr na" title="الباركود متاح على الجهاز اللي اترفعت منه">▦</span>') + '</td>' +
        '<td><b>' + esc(r.patient) + '</b><small class="n">' + esc(r.phone || '') + '</small></td><td>' + esc(r.exam || '—') + (r.pages ? '<small style="display:block">' + r.pages + ' صفحة · ' + mb(r.size) + '</small>' : '') + '</td><td>' + when(r.at) + '</td><td>' + src + '</td>' +
        '<td><span class="tg ' + (r.views ? 'ok' : 'of') + '" id="vw-' + r.token + '">' + (r.views ? '👁 ' + r.views + (r.views === 1 ? ' مرة' : ' مرات') : 'لسه') + '</span>' + (r.last_view ? '<small style="display:block">' + when(r.last_view) + '</small>' : '') + '</td>' +
        '<td><div class="acts">' + (loc && r.active ? '<button class="btn g sm" data-a="qr">▦ باركود</button><button class="btn g sm" data-a="print">🖨 استيكر</button>' + (r.phone ? '<button class="btn g sm" data-a="wa" style="color:#15803D">واتساب</button>' : '') : '') +
        (r.active ? '<button class="btn g sm" data-a="stop" title="وقّف الحالة — الباركود مش هيفتح">وقّف</button>' : '<button class="btn g sm" data-a="start">▶ تشغيل</button>') + '<button class="btn d sm" data-a="del" title="امسح">🗑</button></div></td></tr>';
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
      if (a === 'del') { ui.list = ui.list.filter(function (x) { return x.token !== tok; }); delete ui.local[tok]; tx('readwrite', function (s) { s.delete(tok); }).catch(function () {}); toast('اتمسحت'); disk(); }
      else { r.active = a === 'start'; toast(a === 'start' ? '▶ الحالة اشتغلت تاني' : '⏸ الحالة اتوقفت — الباركود مش هيفتح'); }
      table();
    }).catch(function (e) { b.disabled = false; toast(e.message); });
  }
  function showQr(tok, fresh) {
    var r = itemOf(tok), u = linkOf(tok); if (!r || !u) return;
    var o = document.createElement('div'); o.className = 'mdl';
    o.innerHTML = '<div class="pn">' + (fresh ? '<div style="font-size:34px">✅</div><h3>اتحفظت — ده الباركود</h3>' : '<h3>▦ باركود الحالة</h3>') + '<p>' + esc(r.patient) + (r.exam ? ' · ' + esc(r.exam) : '') + '</p><div class="qbig">' + qrSvg(u) + '</div><p>المريض يمسحه بكاميرا الموبايل ويشوف حالته على طول</p>' +
      '<div class="lk"><input readonly value="' + esc(u) + '"><button class="btn g sm" data-x="cp">نسخ</button></div><div class="bt"><button class="btn" data-x="pr">🖨 اطبع استيكر</button>' + (r.phone ? '<button class="btn" data-x="wa" style="background:#16A34A">واتساب للمريض</button>' : '<button class="btn g" data-x="op">👁 افتح</button>') + '</div><button class="btn g w" data-x="cl" style="margin-top:8px">تمام</button></div>';
    document.body.appendChild(o);
    var close = function () { o.remove(); };
    o.onclick = function (e) { var x = e.target.closest('[data-x]'); if (e.target === o) return close(); if (!x) return; var k = x.dataset.x;
      if (k === 'cl') close(); if (k === 'pr') printSticker(tok); if (k === 'wa') wa(tok); if (k === 'op') window.open(u, '_blank', 'noopener');
      if (k === 'cp') { try { navigator.clipboard.writeText(u).then(function () { toast('اتنسخ ✓'); }); } catch (er) { o.querySelector('input').select(); } } };
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
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

  /* ── live: the server asks this page for a file when a patient opens it ── */
  function setLive(on) { ui.live = on; var s = $('st'); if (!s) return; s.className = 'st' + (on ? ' on' : ''); s.lastChild.textContent = on ? 'جهازك متصل — المرضى يقدروا يفتحوا حالاتهم' : 'مش متصل — بنحاول تاني…'; }
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
      var t = $('vw-' + m.token); if (t) { t.className = 'tg ok pop'; t.textContent = '👁 ' + m.views + (m.views === 1 ? ' مرة' : ' مرات'); }
      if (r) { toast('👁 ' + r.patient + ' فتح حالته دلوقتي'); var sm = t && t.parentNode.querySelector('small'); if (t && !sm) { sm = document.createElement('small'); sm.style.display = 'block'; t.parentNode.appendChild(sm); } if (sm) sm.textContent = when(m.last_view); }
    });
  }
  function disk() {
    var n = 0, sz = 0; Object.keys(ui.local).forEach(function (k) { n++; sz += ui.local[k].size || 0; });
    var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
    est.then(function (e) {
      $('disk').innerHTML = '💾 <span>على الكمبيوتر ده: <b>' + n + ' حالة · ' + mb(sz) + '</b>' + (e && e.quota ? ' (المساحة المتاحة للمتصفح حوالي ' + mb(Math.max(0, e.quota - e.usage)) + ')' : '') + '.<br>' +
        'كل حالة ليها نسخة مشفّرة على السيرفر أول ' + C.cacheDays + ' أيام بس، وبعدها بتفتح للمريض من الجهاز ده — <b>سيب الصفحة دي مفتوحة والكمبيوتر شغال</b>. ومتمسحش بيانات المتصفح (History/Cookies) عشان الحالات متضيعش.</span>';
    });
  }
  function boot() {
    shell();
    Promise.all([api('GET', 'list'), localAll()]).then(function (a) { ui.list = a[0].list || []; ui.local = a[1] || {}; table(); disk(); }).catch(function (e) { $('tbl').innerHTML = '<div class="emp"><i>⚠️</i>' + esc(e.message) + '</div>'; });
    connect();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && (!ui.es || ui.es.readyState === 2)) connect(); });
    window.addEventListener('beforeunload', function (e) { if (Object.keys(ui.local).length) { e.preventDefault(); e.returnValue = ''; } });
  }
  if (C.auth) boot(); else login();
})();

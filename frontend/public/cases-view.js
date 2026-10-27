/* ════════════════════════════════════════════════════════════════════
   4.90 · حالات المرضى — صفحة المريض /v/<token>#<key>
   بيجيب الملف المشفّر (من النسخة المؤقتة أو من جهاز المركز لايف)،
   ويفك تشفيره هنا بالمفتاح اللي في الباركود، ويعرضه صفحات (pdf.js).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var C = window.CD || {}, $ = function (id) { return document.getElementById(id); }, KEY = String(location.hash || '').slice(1), PDF = null, TRY = 0;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function dmy(ts) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(ts || '')); return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] : ''; }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  try { if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; } catch (e) {}

  function shell() {
    var head = '<div class="ctr"><span class="lg">' + esc(String(C.center || 'م').trim().charAt(0)) + '</span><div><b>' + esc(C.center || '') + '</b><span>نتيجة الفحص</span></div></div>';
    if (C.missing) { document.body.innerHTML = '<div class="w"><div class="ld" style="margin-top:30vh"><i>🔍</i><b>الحالة دي مش موجودة</b><p>اتأكد من الباركود، أو كلّم المركز.</p></div></div>'; return; }
    var back = null; try { back = /^\/h\/[A-Za-z0-9]{8}$/.exec(sessionStorage.getItem('ozx_back') || ''); } catch (e) {}
    if (back) head = head.replace('</div></div>', '</div><a class="btn g sm" href="' + back[0] + '" style="margin-inline-start:auto">↩ نتايج تانية</a></div>');
    document.body.innerHTML = '<div class="w">' + head + '<div class="pt"><small>المريض</small><h1>' + esc(C.patient) + '</h1><div class="m">' + (C.exam ? '<span>🩻 ' + esc(C.exam) + '</span>' : '') + '<span>📅 ' + dmy(C.at) + '</span>' + (C.pages ? '<span>📄 ' + C.pages + ' صفحة</span>' : '') + '</div></div>' +
      '<div id="body"></div><p class="foot">الملف متشفّر — بيتفتح بس بالباركود ده. · ' + esc(C.center || '') + '</p></div>';
  }
  /* 4.92 · stuck (center offline / file missing / stopped) → ask the center on WhatsApp */
  function waBtn() { return '<button class="btn ask2" id="askc" style="margin-top:10px;display:flex;width:100%">📨 اطلبها من المركز</button>'; }
  function wireAsk() {
    var b = $('askc'); if (!b) return;
    b.onclick = function () {
      b.disabled = true; b.textContent = 'بنبعت…';
      fetch(location.pathname.replace(/\/$/, '') + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || 'محصلش'); }); })
        .then(function () { b.outerHTML = '<p style="margin-top:10px;color:#15803D;font-weight:800">✅ طلبك وصل للمركز — هيرفعوا نتيجتك تاني</p>'; })
        .catch(function (e) { b.disabled = false; b.textContent = '📨 اطلبها من المركز'; b.textContent = e.message; });
    };
  }
  function box(icon, title, sub, extra) { if (icon !== 'spin' && icon !== '🔑') extra = (extra || '') + waBtn(); $('body').innerHTML = '<div class="ld">' + (icon === 'spin' ? '<div class="spin"></div>' : '<i>' + icon + '</i>') + '<b>' + title + '</b>' + (sub ? '<p>' + sub + '</p>' : '') + (extra || '') + '</div>';  wireAsk(); }

  function load() {
    if (!C.active) return box('⏸', 'الحالة دي اتوقفت', 'كلّم المركز لو محتاجها.');
    if (!KEY || KEY.length < 20) return box('🔑', 'اللينك ناقص', 'امسح الباركود تاني بكاميرا الموبايل — أو افتح اللينك كامل زي ما اتبعتلك.');
    if (!(window.crypto && crypto.subtle)) return box('⚠️', 'المتصفح ده قديم', 'افتح اللينك من Chrome أو Safari.');
    box('spin', 'بنجيب الحالة…', '', '<div class="bar"><i id="pr" style="width:4%"></i></div><p id="prt" style="margin-top:6px"></p>');
    fetch(location.pathname.replace(/\/$/, '') + '/file', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.message || 'محصلش'); e.j = j; e.status = r.status; throw e; });
      var total = Number(r.headers.get('Content-Length')) || C.size || 0, src = r.headers.get('X-Source');
      if (!r.body || !r.body.getReader) return r.arrayBuffer().then(function (b) { return { buf: b, src: src }; });
      var rd = r.body.getReader(), parts = [], got = 0;
      return (function pump() { return rd.read().then(function (x) {
        if (x.done) { var o = new Uint8Array(got), p = 0; parts.forEach(function (c) { o.set(c, p); p += c.length; }); return { buf: o.buffer, src: src }; }
        parts.push(x.value); got += x.value.length;
        if (total) { var k = Math.min(99, Math.round(got / total * 100)), e1 = $('pr'), e2 = $('prt'); if (e1) e1.style.width = k + '%'; if (e2) e2.textContent = mb(got) + ' من ' + mb(total) + (src === 'center' ? ' · من جهاز المركز لايف' : ''); }
        return pump();
      }); })();
    }).then(function (x) {
      var all = new Uint8Array(x.buf), iv = all.slice(0, 12), ct = all.slice(12);
      return crypto.subtle.importKey('raw', unb64u(KEY), { name: 'AES-GCM' }, false, ['decrypt']).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, k, ct); })
        .catch(function () { var e = new Error('bad'); e.bad = true; throw e; });
    }).then(function (plain) { PDF = new Uint8Array(plain); show(); })
      .catch(function (e) {
        if (e.bad) return box('🔑', 'مش قادر أفتح الملف', 'الباركود ده مش بتاع الحالة دي أو ناقص — امسحه تاني.');
        if (e.j && e.j.stopped) return box('⏸', 'الحالة دي اتوقفت', 'كلّم المركز لو محتاجها.');
        if (e.j && e.j.missing) return box('📁', 'الملف مش موجود على جهاز المركز', 'كلّم المركز يرفع الحالة تاني.');
        if (e.j && e.j.offline) { TRY++; box('🌙', 'جهاز المركز مقفول دلوقتي', 'الحالة محفوظة على كمبيوتر المركز، وهتتفتح أول ما يشتغل. هنجرّب تاني لوحدنا…', '<button class="btn" id="re" style="margin-top:14px">↻ جرّب دلوقتي</button>'); $('re').onclick = load; clearTimeout(load.t); load.t = setTimeout(load, Math.min(120000, 20000 * TRY)); return; }
        box('⚠️', 'محصلش', esc(e.message || 'النت فصل — جرّب تاني'), '<button class="btn" id="re" style="margin-top:14px">↻ جرّب تاني</button>'); $('re').onclick = load;
      });
  }
  function fname() { return (String(C.patient || 'case') + (C.exam ? ' - ' + C.exam : '')).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf'; }
  function blobUrl() { if (!blobUrl.u) blobUrl.u = URL.createObjectURL(new Blob([PDF], { type: 'application/pdf' })); return blobUrl.u; }
  function show() {
    var canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([PDF], fname(), { type: 'application/pdf' })] })); } catch (e) {}
    $('body').innerHTML = '<div class="tools"><a class="btn" id="dl" download="' + esc(fname()) + '">⬇ نزّل PDF</a>' + (canShare ? '<button class="btn g" id="sh">↗ ابعتها للدكتور</button>' : '<a class="btn g" id="op" target="_blank" rel="noopener">↗ افتح</a>') + '</div><div class="pages" id="pages"></div>';
    var dl = $('dl'); dl.href = blobUrl();
    var op = $('op'); if (op) op.href = blobUrl();
    var sh = $('sh'); if (sh) sh.onclick = function () { navigator.share({ files: [new File([PDF], fname(), { type: 'application/pdf' })], title: fname() }).catch(function () {}); };
    if (!window.pdfjsLib) { $('pages').innerHTML = '<div class="ld"><i>📄</i><b>الحالة جاهزة</b><p>دوس «نزّل PDF» وافتحها.</p></div>'; return; }
    pdfjsLib.getDocument({ data: PDF.slice(0) }).promise.then(function (doc) {
      var wrap = $('pages'), W = Math.min(wrap.clientWidth || 360, 900), dpr = Math.min(2.5, window.devicePixelRatio || 1);
      var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); draw(e.target); } }); }, { rootMargin: '600px 0px' }) : null;
      function draw(el) {
        var n = +el.dataset.p; if (el.dataset.done) return; el.dataset.done = '1';
        doc.getPage(n).then(function (pg) { var v1 = pg.getViewport({ scale: 1 }), k = W / v1.width, vp = pg.getViewport({ scale: k * dpr }), cv = document.createElement('canvas'); cv.dir = 'ltr'; cv.style.direction = 'ltr'; cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); el.style.minHeight = ''; el.insertBefore(cv, el.firstChild); return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; }).catch(function () {});
      }
      for (var i = 1; i <= doc.numPages; i++) {
        var d = document.createElement('div'); d.className = 'pg'; d.dataset.p = i; d.style.minHeight = Math.round(W * 1.3) + 'px'; d.innerHTML = '<em>' + i + ' / ' + doc.numPages + '</em>';
        wrap.appendChild(d); if (io) io.observe(d); else draw(d);
      }
    }).catch(function () { $('pages').innerHTML = '<div class="ld"><i>📄</i><b>الحالة جاهزة</b><p>مش قادر أعرضها هنا — دوس «نزّل PDF» وافتحها.</p></div>'; });
  }
  shell(); if (!C.missing) load();
})();

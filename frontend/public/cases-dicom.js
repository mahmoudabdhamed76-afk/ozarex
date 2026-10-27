/* ════════════════════════════════════════════════════════════════════
   4.94 · «مودة» جوّه صفحة حالات المرضى — DICOM ← PDF ← حالة بباركود
   نفس محرك MAWDA Pro (قراءة DICOM + نوافذ CT + شبكة ثابتة + ترويسة عربية
   مرسومة على Canvas)، والـ PDF اللي بيطلع بيدخل على طول في قايمة الحفظ
   باسم المريض ونوع الفحص من ملفات الـ DICOM نفسها.
   زيادة على مودة: ترتيب الصور بالسيريز ورقم الصورة، وفصل كل مريض في PDF
   لوحده لو الفولدر فيه كذا مريض، وقراءة الأسماء العربي (UTF-8 / ISO_IR 127).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var MOD = { CT: 'أشعة مقطعية', MR: 'رنين مغناطيسي', US: 'سونار', CR: 'أشعة عادية', DX: 'أشعة عادية', DR: 'أشعة عادية', RF: 'أشعة بالصبغة', MG: 'ماموجرام', XA: 'قسطرة', NM: 'مسح ذري', PT: 'PET', OT: 'أشعة', SC: 'أشعة', PX: 'أشعة بانوراما', IO: 'أشعة أسنان', BMD: 'قياس كثافة العظام' };

  /* ── DICOM → image + tags (MAWDA's engine, + charset) ── */
  function decodeDicom(bytes, cfg) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var VALID = { AE: 1, AS: 1, AT: 1, CS: 1, DA: 1, DS: 1, DT: 1, FL: 1, FD: 1, IS: 1, LO: 1, LT: 1, OB: 1, OD: 1, OF: 1, OL: 1, OW: 1, PN: 1, SH: 1, SL: 1, SQ: 1, SS: 1, ST: 1, TM: 1, UC: 1, UI: 1, UL: 1, UN: 1, UR: 1, US: 1, UT: 1 };
    var LONG = { OB: 1, OW: 1, OF: 1, SQ: 1, UC: 1, UN: 1, UR: 1, UT: 1, OD: 1, OL: 1 };
    var pxi = -1, i;
    for (i = 0; i < bytes.length - 4; i++) if (bytes[i] === 0xE0 && bytes[i + 1] === 0x7F && bytes[i + 2] === 0x10 && bytes[i + 3] === 0x00) { pxi = i; break; }
    if (pxi < 0) return null;
    var tags = {}, pos = 0;
    while (pos < pxi) {
      try {
        var g = dv.getUint16(pos, true), e = dv.getUint16(pos + 2, true), vr = String.fromCharCode(bytes[pos + 4], bytes[pos + 5]);
        if (!VALID[vr]) { pos++; continue; }
        var len, vs;
        if (LONG[vr]) { len = dv.getUint32(pos + 8, true); vs = pos + 12; } else { len = dv.getUint16(pos + 6, true); vs = pos + 8; }
        if (len === 0xFFFFFFFF) { pos = vs; continue; }
        if (vs + len > bytes.length) break;
        var key = (g << 16) | e; if (!tags[key]) tags[key] = [vs, len];
        pos = vs + len; if (len % 2) pos++;
      } catch (er) { pos++; }
    }
    function gus(g, e) { var t = tags[(g << 16) | e]; return (t && t[1] >= 2) ? dv.getUint16(t[0], true) : 0; }
    function raw(g, e) { var t = tags[(g << 16) | e]; return t ? bytes.slice(t[0], t[0] + t[1]) : null; }
    var cs = (function () { var b = raw(0x0008, 0x0005); return b ? new TextDecoder('latin1').decode(b).toUpperCase() : ''; })();
    var enc = /ISO_IR 192/.test(cs) ? 'utf-8' : /ISO_IR 127/.test(cs) ? 'iso-8859-6' : 'latin1';
    function gst(g, e) { var b = raw(g, e); if (!b) return ''; var s; try { s = new TextDecoder(enc).decode(b); } catch (er) { s = new TextDecoder('latin1').decode(b); } return s.replace(/\0/g, '').trim(); }
    function gfl(g, e) { var v = parseFloat(gst(g, e)); return isNaN(v) ? null : v; }
    var rows = gus(0x0028, 0x0010) || 512, cols = gus(0x0028, 0x0011) || 512, bits = gus(0x0028, 0x0100) || 8, samples = gus(0x0028, 0x0002) || 1, signed = gus(0x0028, 0x0103) === 1;
    var wc = gfl(0x0028, 0x1050), ww = gfl(0x0028, 0x1051), ri = gfl(0x0028, 0x1052) || 0, rs = gfl(0x0028, 0x1053) || 1;
    var photo = gst(0x0028, 0x0004);
    var meta = {
      rows: rows, cols: cols, bits: bits, samples: samples, modality: gst(0x0008, 0x0060), patient: gst(0x0010, 0x0010), patID: gst(0x0010, 0x0020),
      patSex: gst(0x0010, 0x0040), patAge: gst(0x0010, 0x1010), study: gst(0x0008, 0x1030), series: gst(0x0008, 0x103E), studyDate: gst(0x0008, 0x0020),
      studyUID: gst(0x0020, 0x000D), instNum: parseInt(gst(0x0020, 0x0013), 10) || gus(0x0020, 0x0013) || 0, serNum: parseInt(gst(0x0020, 0x0011), 10) || gus(0x0020, 0x0011) || 0,
      wc: wc != null ? wc.toFixed(0) : null, ww: ww != null ? ww.toFixed(0) : null
    };
    var pxVR = String.fromCharCode(bytes[pxi + 4], bytes[pxi + 5]), pxStart, pxLen;
    if (LONG[pxVR]) { pxLen = dv.getUint32(pxi + 8, true); pxStart = pxi + 12; } else { pxLen = dv.getUint32(pxi + 4, true); pxStart = pxi + 8; }
    if (pxLen === 0xFFFFFFFF) throw new Error('الصورة مضغوطة (JPEG) — صدّرها من الجهاز من غير ضغط');
    var numPx = rows * cols, cv = document.createElement('canvas'); cv.width = cols; cv.height = rows;
    var ctx = cv.getContext('2d'), id = ctx.createImageData(cols, rows), px = id.data, inv = cfg.inv !== (photo === 'MONOCHROME1');
    if (bits === 16) {
      var sl = Math.min(numPx * 2, pxLen, bytes.byteLength - pxStart), abuf = bytes.buffer.slice(bytes.byteOffset + pxStart, bytes.byteOffset + pxStart + sl - (sl % 2));
      var arr = signed ? new Int16Array(abuf) : new Uint16Array(abuf), low, high, mn = Infinity, mx = -Infinity, k;
      var W = cfg.win;
      if (W === 'wl' && wc != null && ww != null) { low = ((wc - ww / 2) - ri) / rs; high = ((wc + ww / 2) - ri) / rs; }
      else if (W === 'brain') { low = (0 - ri) / rs; high = (100 - ri) / rs; }
      else if (W === 'bone') { low = (300 - ri) / rs; high = (1800 - ri) / rs; }
      else if (W === 'lung') { low = (-1500 - ri) / rs; high = (-100 - ri) / rs; }
      else if (W === 'soft') { low = (-110 - ri) / rs; high = (240 - ri) / rs; }
      else if (W === 'full') { for (k = 0; k < arr.length; k++) { if (arr[k] < mn) mn = arr[k]; if (arr[k] > mx) mx = arr[k]; } low = mn; high = mx; }
      else {   /* auto: 0.5% – 99.9% of the non-zero pixels (MAWDA's default) */
        var hist = [], step = Math.max(1, Math.floor(arr.length / 60000)); for (k = 0; k < arr.length; k += step) if (arr[k] > 0) hist.push(arr[k]);
        if (hist.length > 100) { hist.sort(function (a, b) { return a - b; }); low = hist[Math.floor(hist.length * 0.005)]; high = hist[Math.floor(hist.length * 0.999)]; }
        else { for (k = 0; k < arr.length; k++) { if (arr[k] < mn) mn = arr[k]; if (arr[k] > mx) mx = arr[k]; } low = mn; high = mx; }
      }
      var range = (high - low) || 1;
      for (k = 0; k < numPx; k++) { var v = k < arr.length ? arr[k] : 0, gg = Math.round(((v - low) / range) * 255); gg = gg < 0 ? 0 : gg > 255 ? 255 : gg; if (inv) gg = 255 - gg; px[k * 4] = px[k * 4 + 1] = px[k * 4 + 2] = gg; px[k * 4 + 3] = 255; }
    } else if (samples === 3) {
      for (k = 0; k < numPx && k * 3 + 2 < pxLen; k++) { px[k * 4] = bytes[pxStart + k * 3]; px[k * 4 + 1] = bytes[pxStart + k * 3 + 1]; px[k * 4 + 2] = bytes[pxStart + k * 3 + 2]; px[k * 4 + 3] = 255; }
    } else {
      for (k = 0; k < numPx && k < pxLen; k++) { var g8 = bytes[pxStart + k]; if (inv) g8 = 255 - g8; px[k * 4] = px[k * 4 + 1] = px[k * 4 + 2] = g8; px[k * 4 + 3] = 255; }
    }
    ctx.putImageData(id, 0, 0);
    return { img: cv.toDataURL('image/jpeg', cfg.q), meta: meta };
  }
  function fmtDate(d) { return d && d.length >= 8 ? d.slice(6, 8) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4) : (d || ''); }
  function nameOf(m) { var n = String(m.patient || '').replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim(); return n && /[a-zA-Z؀-ۿ0-9]/.test(n) ? n : ''; }
  function arText(text, o) {   /* Arabic on a canvas → PNG (jsPDF has no Arabic font) */
    var fs = o.fontSize || 48, fw = o.fontWeight || 'bold', font = fw + ' ' + fs + "px 'IBM Plex Sans Arabic', Tahoma, Arial";
    var t = document.createElement('canvas').getContext('2d'); t.font = font;
    var w = Math.ceil(t.measureText(text).width) + 16, h = Math.ceil(fs * 1.5), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d'); c.font = font; c.fillStyle = o.color || '#fff'; c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2);
    return { url: cv.toDataURL('image/png'), w: w, h: h };
  }
  function jspdf(cb) {
    if (window.jspdf && window.jspdf.jsPDF) return cb(window.jspdf.jsPDF);
    if (jspdf.q) return jspdf.q.push(cb); jspdf.q = [cb];
    var s = document.createElement('script'); s.src = '/vendor/jspdf/jspdf.umd.min.js';
    s.onload = function () { var q = jspdf.q; jspdf.q = null; q.forEach(function (f) { f(window.jspdf && window.jspdf.jsPDF); }); };
    s.onerror = function () { var q = jspdf.q; jspdf.q = null; q.forEach(function (f) { f(null); }); };
    document.head.appendChild(s);
  }
  /* one PDF for one patient's images — MAWDA's fixed COLS×ROWS layout */
  function buildPdf(JsPDF, list, cfg, onStep) {
    var dims = { a4: [210, 297], a3: [297, 420], letter: [216, 279], a5: [148, 210] }, P = dims[cfg.page] || dims.a3, PW = P[0], PH = P[1];
    if (cfg.ori === 'landscape') { PW = P[1]; PH = P[0]; }
    var doc = new JsPDF({ orientation: cfg.ori, unit: 'mm', format: cfg.page }), GAP = 0.8, M = cfg.margin;
    var HDR = cfg.hdr ? 10 : 0, CLN = cfg.clinic ? 8 : 0, TOP = HDR + CLN, uW = PW - M * 2, cW = (uW - (cfg.cols - 1) * GAP) / cfg.cols, uH = PH - M * 2 - TOP, cH = (uH - (cfg.rows - 1) * GAP) / cfg.rows, PER = cfg.cols * cfg.rows;
    var f = list[0].meta, pat = nameOf(f) || 'Unknown Patient', mod = f.modality || '', desc = f.study || '', sd = fmtDate(f.studyDate);
    var black = cfg.black, clinicImg = cfg.clinic && cfg.clinicName ? arText(cfg.clinicName, { fontSize: 48, color: black ? '#f5c463' : '#1a1a1a' }) : null;
    var drImg = cfg.clinic && cfg.doctor && /[؀-ۿ]/.test(cfg.doctor) ? arText(cfg.doctor, { fontSize: 30, fontWeight: '600', color: black ? '#a0a0a0' : '#3c3c3c' }) : null;
    var pages = Math.ceil(list.length / PER), done = 0;
    return (async function () {
      for (var pg = 0; pg < pages; pg++) {
        if (pg) doc.addPage();
        if (black) { doc.setFillColor(0, 0, 0); doc.rect(0, 0, PW, PH, 'F'); }
        if (cfg.clinic) {
          doc.setFillColor(black ? 18 : 230, black ? 18 : 230, black ? 18 : 230); doc.rect(M, M, uW, CLN, 'F');
          if (clinicImg) { var ih = 6, iw = ih * clinicImg.w / clinicImg.h; try { doc.addImage(clinicImg.url, 'PNG', PW / 2 - iw / 2, M + (CLN - ih) / 2, iw, ih); } catch (e) {} }
          doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(black ? 160 : 60, black ? 160 : 60, black ? 160 : 60);
          if (drImg) { var dh = 4.2, dw = dh * drImg.w / drImg.h; try { doc.addImage(drImg.url, 'PNG', M + 1.5, M + (CLN - dh) / 2, dw, dh); } catch (e) {} }
          else if (cfg.doctor) doc.text(String(cfg.doctor).slice(0, 40), M + 2, M + 4.5);
          doc.text('Page ' + (pg + 1) + '/' + pages, PW - M - 1, M + 4.5, { align: 'right' });
        }
        if (cfg.hdr) {
          var hy = M + CLN, hdr = pat + (mod ? ' · ' + mod : '') + (desc ? ' · ' + desc : '') + (sd ? ' — ' + sd : '');
          if (/[؀-ۿ]/.test(hdr)) { var hi = arText(hdr, { fontSize: 34, color: black ? '#d2d2d2' : '#141414' }), hh = 4.6, hw = Math.min(uW, hh * hi.w / hi.h); try { doc.addImage(hi.url, 'PNG', PW - M - hw, hy + 1, hw, hh); } catch (e) {} }
          else { doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(black ? 210 : 20, black ? 210 : 20, black ? 210 : 20); doc.text(hdr.slice(0, 140), M, hy + 4); }
          doc.setDrawColor(black ? 50 : 180, black ? 50 : 180, black ? 50 : 180); doc.setLineWidth(0.15); doc.line(M, hy + 5.5, PW - M, hy + 5.5);
        }
        var slice = list.slice(pg * PER, (pg + 1) * PER);
        for (var k = 0; k < slice.length; k++) {
          var en = slice[k], col = k % cfg.cols, row = Math.floor(k / cfg.cols), ratio = (en.meta.cols || 500) / (en.meta.rows || 512);
          var x = M + col * (cW + GAP), y = M + TOP + row * (cH + GAP), w = cW, h = cW / ratio; if (h > cH) { h = cH; w = cH * ratio; }
          var dx = x + (cW - w) / 2, dy = y + (cH - h) / 2;
          try { doc.addImage(en.img, 'JPEG', dx, dy, w, h); } catch (e) {}
          if (cfg.meta) {
            var m = en.meta, fs = Math.max(2.5, w * 0.046); doc.setFontSize(fs); doc.setFont(undefined, 'normal'); doc.setTextColor(black ? 195 : 35, black ? 195 : 35, black ? 195 : 35);
            var pn = String(m.patient || '').split('^')[0].trim(); if (!/[a-zA-Z0-9]/.test(pn)) pn = '';
            if (pn) doc.text(pn.substring(0, 18), dx + 0.5, dy + fs * 0.9);
            if (m.instNum) doc.text('#' + m.instNum, dx + w - 0.3, dy + fs * 0.9, { align: 'right' });
            if (m.wc && m.ww) doc.text('W:' + m.ww + ' L:' + m.wc, dx + 0.5, dy + h - 0.5);
            if (m.modality) doc.text(m.modality, dx + w - 0.3, dy + h - 0.5, { align: 'right' });
          }
          done++; if (onStep) onStep(done, list.length); if (done % 6 === 0) await sleep(1);
        }
      }
      return { blob: doc.output('blob'), pages: pages, patient: pat, modality: mod, desc: desc, date: sd };
    })();
  }

  /* ════ the studio card ════ */
  function mount(el, o) {
    var S = lsGet('ozx_mwda', {}), st = {
      cols: S.cols || 4, rows: S.rows || 4, page: S.page || 'a3', ori: S.ori || 'portrait', win: S.win || 'auto', q: S.q || 92, margin: S.margin != null ? S.margin : 5,
      hdr: S.hdr !== false, clinic: S.clinic !== false, meta: S.meta !== false, black: S.black !== false, inv: !!S.inv, split: S.split !== false, dl: !!S.dl,
      clinicName: S.clinicName || o.center || '', doctor: S.doctor || ''
    };
    var files = [], sig = '', open = !!S.open, busy = false, FID = 0;
    function save() { lsSet('ozx_mwda', Object.assign({}, st, { open: open })); }
    function cfg() { return { win: st.win, inv: st.inv, q: st.q / 100 }; }
    function sigOf() { return st.win + '|' + st.inv + '|' + st.q; }
    function groups() {
      var by = {}, out = [];
      files.filter(function (f) { return f.st === 'ok' && f.sel; }).forEach(function (f) {
        var k = st.split ? (f.meta.patID || '') + '|' + nameOf(f.meta) + '|' + (f.meta.studyUID || f.meta.studyDate || '') : 'all';
        (by[k] = by[k] || []).push(f);
      });
      Object.keys(by).forEach(function (k) { var L = by[k].sort(function (a, b) { return (a.meta.serNum - b.meta.serNum) || (a.meta.instNum - b.meta.instNum) || (a.id - b.id); }); out.push(L); });
      return out;
    }
    function shell() {
      el.innerHTML = '<div class="mw' + (open ? ' op' : '') + '"><div class="mwh" id="mwH"><span class="mwi">🩻</span><div><b>مودة — حوّل <bdi>DICOM</bdi> لـ <bdi>PDF</bdi> وارفعه على طول</b><small>اسحب ملفات أو فولدر الأشعة ← الـ <bdi>PDF</bdi> بيتعمل هنا ويدخل قايمة الحفظ باسم المريض ونوع الفحص</small></div><span class="mwc">⌄</span></div><div class="mwb" id="mwB"></div></div>';
      $('mwH').onclick = function () { open = !open; save(); el.firstChild.classList.toggle('op', open); if (open && !$('mwDrop')) body(); };
      if (open) body();
    }
    function body() {
      var b = $('mwB');
      b.innerHTML = '<div class="mwg"><div><div class="mwd" id="mwDrop"><span class="ic">🩻</span><div><b>اسحب ملفات <bdi>DICOM</bdi> أو فولدر الحالة هنا</b><small>أو اختار — بيتقروا على الجهاز ده بس</small></div><div class="db"><label class="btn sm">📄 ملفات<input type="file" id="mwF" multiple hidden></label><label class="btn g sm">📁 فولدر<input type="file" id="mwD" webkitdirectory multiple hidden></label></div></div>' +
        '<div id="mwL"></div></div>' +
        '<div class="mws"><div class="mwgp"><div class="gp" id="mwGP"></div><div><b id="mwGL"></b><small id="mwGS"></small></div></div>' +
        '<div class="mwf"><label>المقاس<select id="mwPage"><option value="a3">A3</option><option value="a4">A4</option><option value="letter">Letter</option><option value="a5">A5</option></select></label>' +
        '<label>الاتجاه<select id="mwOri"><option value="portrait">طولي</option><option value="landscape">عرضي</option></select></label>' +
        '<label>النافذة<select id="mwWin"><option value="auto">تلقائي</option><option value="wl">من الجهاز (W/L)</option><option value="soft">أنسجة رخوة</option><option value="brain">مخ</option><option value="bone">عظم</option><option value="lung">رئة</option><option value="full">المدى كله</option></select></label>' +
        '<label>الهامش (مم)<input type="number" id="mwMrg" min="0" max="25"></label><label class="wide">الجودة <em id="mwQv"></em><input type="range" id="mwQ" min="50" max="100"></label>' +
        '<label class="wide">اسم المركز في الترويسة<input id="mwCN" maxlength="60"></label><label class="wide">اسم الدكتور (اختياري)<input id="mwDr" maxlength="60" placeholder="مثلاً: Dr. Mahmoud Saber"></label></div>' +
        '<div class="chips mwch">' + [['hdr', 'ترويسة المريض'], ['clinic', 'اسم المركز'], ['meta', 'بيانات تقنية'], ['black', 'خلفية سوداء'], ['inv', 'عكس الألوان'], ['split', 'كل مريض PDF لوحده'], ['dl', 'نزّل نسخة على الجهاز']].map(function (x) { return '<button type="button" data-c="' + x[0] + '" class="' + (st[x[0]] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
        '<div class="mwa"><button class="btn" id="mwGo" disabled>🩻 حوّل وحطّهم في قايمة الحفظ</button><div class="bar" id="mwBar" style="flex:1"><i></i></div><span id="mwPt" style="font-size:12.5px;color:var(--mut)"></span></div>';
      $('mwPage').value = st.page; $('mwOri').value = st.ori; $('mwWin').value = st.win; $('mwMrg').value = st.margin; $('mwQ').value = st.q; $('mwQv').textContent = st.q + '%'; $('mwCN').value = st.clinicName; $('mwDr').value = st.doctor;
      [['mwPage', 'page'], ['mwOri', 'ori'], ['mwWin', 'win']].forEach(function (x) { $(x[0]).onchange = function () { st[x[1]] = this.value; save(); info(); }; });
      $('mwMrg').oninput = function () { st.margin = Math.max(0, Math.min(25, Number(this.value) || 0)); save(); };
      $('mwQ').oninput = function () { st.q = Number(this.value); $('mwQv').textContent = st.q + '%'; save(); };
      $('mwCN').oninput = function () { st.clinicName = this.value.trim(); save(); }; $('mwDr').oninput = function () { st.doctor = this.value.trim(); save(); };
      [].forEach.call(b.querySelectorAll('[data-c]'), function (x) { x.onclick = function () { st[x.dataset.c] = !st[x.dataset.c]; x.classList.toggle('on', st[x.dataset.c]); save(); if (x.dataset.c === 'inv') rethumb(); list(); }; });
      var dr = $('mwDrop');
      ['dragenter', 'dragover'].forEach(function (k) { dr.addEventListener(k, function (e) { e.preventDefault(); e.stopPropagation(); dr.classList.add('ov'); }); });
      ['dragleave', 'drop'].forEach(function (k) { dr.addEventListener(k, function (e) { e.preventDefault(); e.stopPropagation(); dr.classList.remove('ov'); }); });
      dr.addEventListener('drop', function (e) { readDrop(e.dataTransfer); });
      $('mwF').onchange = function () { load([].slice.call(this.files || [])); this.value = ''; };
      $('mwD').onchange = function () { load([].slice.call(this.files || [])); this.value = ''; };
      $('mwGo').onclick = convert;
      picker(); list();
    }
    function picker() {
      var gp = $('mwGP'), h = '';
      for (var r = 1; r <= 6; r++) for (var c = 1; c <= 6; c++) h += '<i data-c="' + c + '" data-r="' + r + '"></i>';
      gp.innerHTML = h;
      var paint = function (C, R) { [].forEach.call(gp.children, function (x) { x.className = (+x.dataset.c <= C && +x.dataset.r <= R) ? 'on' : ''; }); $('mwGL').textContent = C + ' × ' + R; $('mwGS').textContent = (C * R) + ' صورة في الصفحة'; };
      gp.onmouseover = function (e) { var t = e.target; if (t.dataset && t.dataset.c) paint(+t.dataset.c, +t.dataset.r); };
      gp.onmouseleave = function () { paint(st.cols, st.rows); };
      gp.onclick = function (e) { var t = e.target; if (!t.dataset || !t.dataset.c) return; st.cols = +t.dataset.c; st.rows = +t.dataset.r; save(); paint(st.cols, st.rows); info(); };
      paint(st.cols, st.rows);
    }
    function readDrop(dt) {   /* a dropped folder: walk it */
      var items = dt && dt.items ? [].slice.call(dt.items) : [], ents = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
      if (!ents.length) return load([].slice.call((dt && dt.files) || []));
      var out = [], pend = 0, fin = function () { if (!pend) load(out); };
      var walk = function (en) { pend++; if (en.isFile) en.file(function (f) { out.push(f); pend--; fin(); }, function () { pend--; fin(); }); else if (en.isDirectory) { var rd = en.createReader(), all = []; (function more() { rd.readEntries(function (L) { if (L.length) { all = all.concat([].slice.call(L)); more(); } else { all.forEach(walk); pend--; fin(); } }, function () { pend--; fin(); }); })(); } else { pend--; fin(); } };
      ents.forEach(walk);
    }
    function load(L) {
      L = L.filter(function (f) { return !/^\./.test(f.name) && !/\.(txt|xml|html?|exe|ini|inf|jpg|jpeg|png|pdf|dll|js|css|json|zip)$/i.test(f.name) && f.size > 132; });
      if (!L.length) return o.toast('مفيش ملفات DICOM هنا');
      var c = cfg(); sig = sigOf();
      L.forEach(function (f) { files.push({ id: ++FID, file: f, st: 'ld', sel: true }); });
      list();
      var todo = files.filter(function (x) { return x.st === 'ld'; }), i = 0;
      (function nx() {
        if (i >= todo.length) { list(); return; }
        var en = todo[i++];
        en.file.arrayBuffer().then(function (buf) { var r = decodeDicom(new Uint8Array(buf), c); if (!r) throw new Error('مش DICOM'); en.img = r.img; en.meta = r.meta; en.st = 'ok'; })
          .catch(function (e) { en.st = 'er'; en.err = e.message; }).then(function () { if (i % 8 === 0 || i >= todo.length) list(); setTimeout(nx, 0); });
      })();
    }
    function rethumb() {   /* window / invert / quality changed → decode again */
      if (sigOf() === sig || !files.length) return Promise.resolve();
      var c = cfg(), L = files.filter(function (f) { return f.st === 'ok'; }); sig = sigOf();
      return L.reduce(function (p, en) { return p.then(function () { return en.file.arrayBuffer().then(function (b) { var r = decodeDicom(new Uint8Array(b), c); if (r) en.img = r.img; }).catch(function () {}); }); }, Promise.resolve()).then(list);
    }
    function info() { var G = groups(), n = 0, pg = 0; G.forEach(function (L) { n += L.length; pg += Math.ceil(L.length / (st.cols * st.rows)); }); var e = $('mwPt'); if (e) e.textContent = n ? n + ' صورة · ' + G.length + (G.length === 1 ? ' مريض' : ' مرضى') + ' · ~' + pg + ' صفحة' : ''; var g = $('mwGo'); if (g) g.disabled = busy || !n; }
    function list() {
      var el2 = $('mwL'); if (!el2) return;
      var ld = files.filter(function (f) { return f.st === 'ld'; }).length, er = files.filter(function (f) { return f.st === 'er'; }), G = groups();
      if (!files.length) { el2.innerHTML = ''; info(); return; }
      el2.innerHTML = '<div class="mwsum"><span>📥 ' + files.length + ' ملف' + (ld ? ' · بنقرا ' + ld + '…' : '') + (er.length ? ' · <b style="color:#DC2626">' + er.length + ' مش DICOM / مضغوط</b>' : '') + '</span><button class="btn g sm" id="mwClr">شيل الكل</button></div>' +
        G.map(function (L, gi) { var m = L[0].meta; return '<div class="mwp"><div class="th">' + L.slice(0, 6).map(function (f) { return '<img src="' + f.img + '" alt="">'; }).join('') + '</div><div><b>' + esc(nameOf(m) || 'من غير اسم') + '</b><small>' + esc((MOD[m.modality] || m.modality || '') + (m.study ? ' · ' + m.study : '') + (m.studyDate ? ' · ' + fmtDate(m.studyDate) : '')) + ' · ' + L.length + ' صورة</small></div></div>'; }).join('') +
        (er.length && er.length === files.length ? '<p style="color:#DC2626;font-size:12.5px;margin-top:6px">' + esc(er[0].err || '') + '</p>' : '');
      $('mwClr').onclick = function () { files = []; list(); };
      info();
    }
    function convert() {
      if (busy) return; var G0 = groups(); if (!G0.length) return;
      busy = true; info(); var bar = $('mwBar'); bar.style.display = 'block'; bar.firstChild.style.width = '2%';
      rethumb().then(function () {
        jspdf(function (JsPDF) {
          if (!JsPDF) { busy = false; info(); return o.toast('مش قادر أحمّل مكتبة الـ PDF — اتأكد من النت'); }
          var G = groups(), total = 0, doneAll = 0, out = []; G.forEach(function (L) { total += L.length; });
          var c = { cols: st.cols, rows: st.rows, page: st.page, ori: st.ori, margin: st.margin, hdr: st.hdr, clinic: st.clinic, meta: st.meta, black: st.black, clinicName: st.clinicName, doctor: st.doctor };
          G.reduce(function (p, L) {
            return p.then(function () {
              var base = doneAll;
              return buildPdf(JsPDF, L, c, function (d) { bar.firstChild.style.width = Math.max(2, Math.round((base + d) / total * 100)) + '%'; $('mwPt').textContent = 'بنحوّل ' + (base + d) + '/' + total; }).then(function (r) {
                doneAll += L.length;
                var nm = (r.patient === 'Unknown Patient' ? 'حالة' : r.patient).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40), fn = nm + (r.modality ? ' - ' + r.modality : '') + (r.date ? ' - ' + r.date.replace(/\//g, '-') : '') + '.pdf';
                var file = new File([r.blob], fn, { type: 'application/pdf' });
                if (st.dl) { var a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
                out.push({ file: file, patient: r.patient === 'Unknown Patient' ? '' : r.patient, exam: MOD[r.modality] || r.modality || '', pages: r.pages });
              });
            });
          }, Promise.resolve()).then(function () {
            busy = false; bar.firstChild.style.width = '100%'; setTimeout(function () { bar.style.display = 'none'; bar.firstChild.style.width = '0'; }, 900);
            files = []; list();
            o.onPdf(out);
          }).catch(function (e) { busy = false; info(); o.toast('محصلش: ' + (e && e.message || '')); });
        });
      });
    }
    shell();
  }
  window.OZDicom = { mount: mount, decode: decodeDicom };
})();

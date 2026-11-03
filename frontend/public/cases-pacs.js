/* ════════════════════════════════════════════════════════════════════
   5.00 · QR Patient — حالة DICOM
   صفحة المركز: ملفات DICOM ← بتتقري هنا ← البكسلات بتتضغط (فرق الجيران + gzip
   من المتصفح نفسه، من غير ما نبوّظ ولا قيمة) ← حزمة واحدة بتتشفّر وتترفع زي الـ PDF.
   صفحة المريض: «باكس صغير» على الموبايل — تباين/سطوع بالصباع، زوم بصباعين، تحريك،
   تقليب الشرايح، قوالب CT، عكس، تشغيل الشرايح، صورة للدكتور.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MAGIC = 'OZXD1\n';

  /* ── read one DICOM file: tags + the raw pixels (every frame) ── */
  function parse(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var VALID = { AE: 1, AS: 1, AT: 1, CS: 1, DA: 1, DS: 1, DT: 1, FL: 1, FD: 1, IS: 1, LO: 1, LT: 1, OB: 1, OD: 1, OF: 1, OL: 1, OW: 1, PN: 1, SH: 1, SL: 1, SQ: 1, SS: 1, ST: 1, TM: 1, UC: 1, UI: 1, UL: 1, UN: 1, UR: 1, US: 1, UT: 1 };
    var LONG = { OB: 1, OW: 1, OF: 1, SQ: 1, UC: 1, UN: 1, UR: 1, UT: 1, OD: 1, OL: 1 };
    var pxi = -1, i;
    for (i = 132; i < bytes.length - 4; i++) if (bytes[i] === 0xE0 && bytes[i + 1] === 0x7F && bytes[i + 2] === 0x10 && bytes[i + 3] === 0x00) { pxi = i; break; }
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
    function raw(g, e) { var t = tags[(g << 16) | e]; return t ? bytes.subarray(t[0], t[0] + t[1]) : null; }
    var cs = (function () { var b = raw(0x0008, 0x0005); return b ? new TextDecoder('latin1').decode(b).toUpperCase() : ''; })();
    var enc = /ISO_IR 192/.test(cs) ? 'utf-8' : /ISO_IR 127/.test(cs) ? 'iso-8859-6' : 'latin1';
    function gst(g, e) { var b = raw(g, e); if (!b) return ''; var s; try { s = new TextDecoder(enc).decode(b); } catch (er) { s = new TextDecoder('latin1').decode(b); } return s.replace(/\0/g, '').trim(); }
    function gfl(g, e) { var v = parseFloat(gst(g, e)); return isNaN(v) ? null : v; }
    var rows = gus(0x0028, 0x0010), cols = gus(0x0028, 0x0011); if (!rows || !cols) return null;
    var bits = gus(0x0028, 0x0100) || 16, spp = gus(0x0028, 0x0002) || 1, signed = gus(0x0028, 0x0103) === 1, planar = gus(0x0028, 0x0006) === 1;
    var nf = parseInt(gst(0x0028, 0x0008), 10) || 1, sp = gst(0x0028, 0x0030).split('\\').map(parseFloat), ipp = gst(0x0020, 0x0032).split('\\').map(parseFloat);
    var pxVR = String.fromCharCode(bytes[pxi + 4], bytes[pxi + 5]), pxStart, pxLen;
    if (LONG[pxVR]) { pxLen = dv.getUint32(pxi + 8, true); pxStart = pxi + 12; } else { pxLen = dv.getUint32(pxi + 4, true); pxStart = pxi + 8; }
    if (pxLen === 0xFFFFFFFF) throw new Error('الصور مضغوطة (JPEG) — صدّرها من الجهاز من غير ضغط');
    var per = rows * cols * spp * (bits === 16 ? 2 : 1), frames = [];
    for (var f = 0; f < nf; f++) {
      var st = pxStart + f * per; if (st + per > bytes.length) break;
      if (bits === 16) { var ab = bytes.buffer.slice(bytes.byteOffset + st, bytes.byteOffset + st + per); frames.push(new Uint16Array(ab)); }
      else if (spp === 3 && planar) { var o = new Uint8Array(rows * cols * 3), n = rows * cols; for (var p = 0; p < n; p++) { o[p * 3] = bytes[st + p]; o[p * 3 + 1] = bytes[st + n + p]; o[p * 3 + 2] = bytes[st + 2 * n + p]; } frames.push(o); }
      else frames.push(bytes.slice(st, st + per));
    }
    if (!frames.length) return null;
    var wc = gfl(0x0028, 0x1050), ww = gfl(0x0028, 0x1051);
    return {
      rows: rows, cols: cols, b: bits === 16 ? 16 : 8, rgb: spp === 3, signed: signed, slope: gfl(0x0028, 0x1053) || 1, inter: gfl(0x0028, 0x1052) || 0,
      wc: wc, ww: ww, mono1: gst(0x0028, 0x0004) === 'MONOCHROME1', spacing: sp.length === 2 && sp[0] > 0 ? sp : null, frames: frames,
      modality: gst(0x0008, 0x0060), patient: gst(0x0010, 0x0010).replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim(), patID: gst(0x0010, 0x0020), sex: gst(0x0010, 0x0040), age: gst(0x0010, 0x1010),
      study: gst(0x0008, 0x1030), series: gst(0x0008, 0x103E), date: gst(0x0008, 0x0020), studyUID: gst(0x0020, 0x000D), serUID: gst(0x0020, 0x000E),
      serNum: parseInt(gst(0x0020, 0x0011), 10) || 0, inst: parseInt(gst(0x0020, 0x0013), 10) || 0, z: ipp.length === 3 && !isNaN(ipp[2]) ? ipp[2] : null, inst2: gst(0x0008, 0x0080)
    };
  }

  /* ── squeeze: big images → max 1536 px, then delta per row + gzip (lossless on what's kept) ── */
  function shrink(fr, rows, cols, b, rgb, maxSide) {
    var k = Math.ceil(Math.max(rows, cols) / maxSide); if (k <= 1) return { fr: fr, rows: rows, cols: cols };
    var R = Math.floor(rows / k), Cc = Math.floor(cols / k), ch = rgb ? 3 : 1, out = b === 16 ? new Uint16Array(R * Cc) : new Uint8Array(R * Cc * ch);
    for (var y = 0; y < R; y++) for (var x = 0; x < Cc; x++) for (var c = 0; c < ch; c++) {
      var s = 0; for (var yy = 0; yy < k; yy++) for (var xx = 0; xx < k; xx++) s += fr[((y * k + yy) * cols + (x * k + xx)) * ch + c];
      out[(y * Cc + x) * ch + c] = Math.round(s / (k * k));
    }
    return { fr: out, rows: R, cols: Cc };
  }
  function delta(a) { var o = new a.constructor(a.length), m = a instanceof Uint16Array ? 0xFFFF : 0xFF; o[0] = a[0]; for (var i = 1; i < a.length; i++) o[i] = (a[i] - a[i - 1]) & m; return o; }
  function undelta(a) { var m = a instanceof Uint16Array ? 0xFFFF : 0xFF; for (var i = 1; i < a.length; i++) a[i] = (a[i] + a[i - 1]) & m; return a; }
  function gz(u8) { return new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function ungz(u8) { return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); }
  function examOf(s) {
    var m = String(s.modality || '').toUpperCase(), t = (s.study || '') + ' ' + (s.series || '');
    return ({ CT: 'أشعة مقطعية', MR: 'رنين مغناطيسي', US: 'سونار', MG: 'ماموجرام', CR: 'أشعة عادية', DX: 'أشعة عادية', XA: 'أشعة قسطرة', NM: 'مسح ذري', PT: 'PET', OT: 'أشعة', PX: 'أشعة بانوراما', IO: 'أشعة أسنان' })[m] || (t.trim() ? t.trim().slice(0, 60) : 'أشعة');
  }
  function fmtDate(d) { return d && d.length >= 8 ? (+d.slice(6, 8)) + '/' + (+d.slice(4, 6)) + '/' + d.slice(0, 4) : ''; }

  /* files → [{ blob, patient, exam, date, count, series, thumb }] — one per study (one patient's exam) */
  function pack(files, o) {
    o = o || {}; var step = o.step || function () {}, maxBytes = (o.maxMb || 80) * 1048576;
    var parsed = [], bad = 0, i = 0;
    return (function nx() {
      if (i >= files.length) return Promise.resolve();
      var f = files[i++]; step('read', i, files.length);
      return f.arrayBuffer().then(function (b) { var r = null; try { r = parse(new Uint8Array(b)); } catch (e) { if (/JPEG/.test(e.message)) throw e; } if (r) parsed.push(r); else bad++; }).then(nx);
    })().then(function () {
      if (!parsed.length) throw new Error('مفيش ملفات DICOM مقروءة' + (bad ? ' (' + bad + ' ملف اتساب)' : ''));
      var studies = {}; parsed.forEach(function (p) { var k = p.studyUID || p.patID || p.patient || 'x'; (studies[k] = studies[k] || []).push(p); });
      return Object.keys(studies).reduce(function (pr, k) { return pr.then(function (acc) { return build(studies[k], 1536).then(function (r) { if (r.blob.size > maxBytes) return build(studies[k], 768); return r; }).then(function (r) { if (r.blob.size > maxBytes) throw new Error('الحالة كبيرة أوي حتى بعد الضغط — اختار سيريز أقل'); acc.push(r); return acc; }); }); }, Promise.resolve([]));
    });
    function build(L, maxSide) {
      var ser = {}; L.forEach(function (p) { var k = p.serUID || (p.serNum + '|' + p.series); (ser[k] = ser[k] || []).push(p); });
      var S = Object.keys(ser).map(function (k) { return ser[k].sort(function (a, b) { return (a.z != null && b.z != null && a.z !== b.z) ? b.z - a.z : a.inst - b.inst; }); }).sort(function (a, b) { return b.reduce(function (n, p) { return n + p.frames.length; }, 0) - a.reduce(function (n, p) { return n + p.frames.length; }, 0) || a[0].serNum - b[0].serNum; });
      var head = { v: 1, patient: L[0].patient, patID: L[0].patID, sex: L[0].sex, age: L[0].age, date: L[0].date, modality: L[0].modality, study: L[0].study, inst: L[0].inst2, series: [] }, parts = [], total = 0, done = 0;
      S.forEach(function (s) { s.forEach(function (p) { total += p.frames.length; }); });
      return S.reduce(function (pr, s) {
        return pr.then(function () {
          var p0 = s[0], sh = shrink(p0.frames[0], p0.rows, p0.cols, p0.b, p0.rgb, maxSide), k = p0.rows / sh.rows;
          var se = { desc: p0.series || p0.study || p0.modality || '', rows: sh.rows, cols: sh.cols, b: p0.b, rgb: p0.rgb, signed: p0.signed, slope: p0.slope, inter: p0.inter, wc: p0.wc, ww: p0.ww, mono1: p0.mono1, sp: p0.spacing ? [p0.spacing[0] * k, p0.spacing[1] * k] : null, modality: p0.modality, f: [] };
          head.series.push(se);
          var fl = []; s.forEach(function (p) { if (p.rows === p0.rows && p.cols === p0.cols) p.frames.forEach(function (fr) { fl.push(fr); }); });
          return fl.reduce(function (q, fr) { return q.then(function () { var r = shrink(fr, p0.rows, p0.cols, p0.b, p0.rgb, maxSide); return gz(new Uint8Array(delta(r.fr).buffer)).then(function (z) { parts.push(z); se.f.push(z.length); step('pack', ++done, total); }); }); }, Promise.resolve());
        });
      }, Promise.resolve()).then(function () {
        var hb = new TextEncoder().encode(JSON.stringify(head)), blob = new Blob([MAGIC, String(hb.length).padStart(10, '0') + '\n', hb].concat(parts), { type: 'application/octet-stream' });
        var s0 = head.series[0], mid = Math.floor(s0.f.length / 2);
        return thumbOf(blob, head, mid).then(function (th) { return { blob: blob, patient: head.patient, exam: examOf(L[0]), date: fmtDate(head.date), count: head.series.reduce(function (n, s) { return n + s.f.length; }, 0), series: head.series.length, thumb: th }; });
      });
    }
  }

  /* ── open a bundle ── */
  function openBundle(buf) {
    var u = new Uint8Array(buf), t = new TextDecoder().decode(u.subarray(0, 17));
    if (t.slice(0, 6) !== MAGIC) throw new Error('الملف ده مش حالة DICOM');
    var n = Number(t.slice(6, 16)), head = JSON.parse(new TextDecoder().decode(u.subarray(17, 17 + n))), off = 17 + n;
    head.series.forEach(function (s) { s.o = []; s.f.forEach(function (len) { s.o.push(off); off += len; }); s.cache = {}; });
    head.frame = function (si, fi) {
      var s = head.series[si]; if (s.cache[fi]) return Promise.resolve(s.cache[fi]);
      return ungz(u.subarray(s.o[fi], s.o[fi] + s.f[fi])).then(function (ab) { var a = undelta(s.b === 16 ? new Uint16Array(ab) : new Uint8Array(ab)); if (s.b === 16 && s.signed) a = new Int16Array(a.buffer); s.cache[fi] = a; return a; });
    };
    return head;
  }
  function autoWL(s, a) {
    if (s.wc != null && s.ww != null && s.ww > 1) return [s.wc, s.ww];
    var h = [], st = Math.max(1, Math.floor(a.length / 40000)); for (var i = 0; i < a.length; i += st) h.push(a[i] * s.slope + s.inter);
    h.sort(function (x, y) { return x - y; }); var lo = h[Math.floor(h.length * 0.01)], hi = h[Math.floor(h.length * 0.995)]; return [(lo + hi) / 2, Math.max(1, hi - lo)];
  }
  function paint(s, a, wc, ww, inv, id) {
    var px = id.data, n = s.rows * s.cols, lo = wc - ww / 2, sc = 255 / ww, m1 = s.mono1 !== !!inv;
    if (s.rgb) { for (var i = 0; i < n; i++) { var r = a[i * 3], g = a[i * 3 + 1], b = a[i * 3 + 2]; if (inv) { r = 255 - r; g = 255 - g; b = 255 - b; } px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255; } return; }
    var sl = s.slope, it = s.inter;
    for (var j = 0; j < n; j++) { var v = ((a[j] * sl + it) - lo) * sc; v = v < 0 ? 0 : v > 255 ? 255 : v; if (m1) v = 255 - v; px[j * 4] = px[j * 4 + 1] = px[j * 4 + 2] = v; px[j * 4 + 3] = 255; }
  }
  function thumbOf(blob, head0, mid) {
    return blob.arrayBuffer().then(function (b) {
      var h = openBundle(b), s = h.series[0];
      return h.frame(0, mid).then(function (a) {
        var wl = autoWL(s, a), cv = document.createElement('canvas'); cv.width = s.cols; cv.height = s.rows; var x = cv.getContext('2d'), id = x.createImageData(s.cols, s.rows); paint(s, a, wl[0], wl[1], false, id); x.putImageData(id, 0, 0);
        var t = document.createElement('canvas'), k = 220 / Math.max(s.cols, s.rows); t.width = Math.round(s.cols * k); t.height = Math.round(s.rows * k); t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.7);
      });
    }).catch(function () { return ''; });
  }

  /* ════ the mini PACS (patient's phone) ════ */
  function viewer(el, buf, o) {
    o = o || {};
    var H = openBundle(buf), si = 0, fi = 0, wc = 0, ww = 1, inv = false, z = 1, px = 0, py = 0, tool = 'wl', S = H.series[0], A = null, play = 0;
    var CT = String(H.modality || S.modality || '').toUpperCase() === 'CT';
    var PRE = CT ? [['تلقائي', null], ['مخ', [40, 80]], ['بطن', [40, 400]], ['رئة', [-600, 1500]], ['عظم', [400, 1800]]] : [['تلقائي', null]];
    el.innerHTML = '<div class="px">' +
      '<div class="pxs" id="pxS"></div>' +
      '<div class="pxv" id="pxV"><canvas id="pxC"></canvas><div class="pxo tl" id="pxTL"></div><div class="pxo tr"><b>' + esc(H.patient || '') + '</b><span>' + esc(fmtDate(H.date)) + '</span></div><div class="pxo bl" id="pxBL"></div><div class="pxo br" id="pxBR"></div><div class="pxh" id="pxH">اسحب بصباعك للتباين · صباعين للزوم</div></div>' +
      '<div class="pxr"><button id="pxPl" class="pxb" title="شغّل">▶</button><input type="range" id="pxR" min="1" value="1"><span id="pxN"></span></div>' +
      '<div class="pxt">' +
        '<button data-t="wl" class="on">◐<span>تباين</span></button><button data-t="pan">✥<span>تحريك</span></button><button data-t="zoom">⊕<span>زوم</span></button><button data-t="scroll">⇅<span>شرايح</span></button>' +
        '<button data-a="inv">◑<span>عكس</span></button><button data-a="reset">↺<span>رجّع</span></button><button data-a="fs">⛶<span>كبّر</span></button><button data-a="snap">📷<span>صورة</span></button></div>' +
      '<div class="pxp" id="pxP"></div></div>';
    var $ = function (id) { return el.querySelector('#' + id); }, cv = $('pxC'), ctx = cv.getContext('2d'), V = $('pxV'), oc = document.createElement('canvas'), ox = oc.getContext('2d'), id = null;
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    $('pxS').innerHTML = H.series.length > 1 ? H.series.map(function (s, i) { return '<button data-s="' + i + '" class="' + (i ? '' : 'on') + '">' + esc(s.desc || ('سيريز ' + (i + 1))) + '<em>' + s.f.length + '</em></button>'; }).join('') : '';
    $('pxP').innerHTML = PRE.length > 1 ? PRE.map(function (p, i) { return '<button data-p="' + i + '"' + (i ? '' : ' class="on"') + '>' + p[0] + '</button>'; }).join('') : '';
    function size() { var r = V.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); draw(); }
    function setSeries(i) {
      si = i; S = H.series[i]; fi = Math.floor(S.f.length / 2); oc.width = S.cols; oc.height = S.rows; id = ox.createImageData(S.cols, S.rows); A = null; z = 1; px = py = 0;
      var r = $('pxR'); r.max = S.f.length; r.value = fi + 1; el.querySelector('.pxr').style.display = S.f.length > 1 ? '' : 'none';
      [].forEach.call(el.querySelectorAll('[data-s]'), function (b) { b.classList.toggle('on', +b.dataset.s === i); });
      load(true);
    }
    var want = -1;
    function load(first) {
      var w = fi; want = w;
      H.frame(si, w).then(function (a) { if (want !== w) return; A = a; if (first) { var wl = autoWL(S, a); wc = wl[0]; ww = wl[1]; } render(); pre(w + 1); pre(w - 1); });
    }
    function pre(i) { if (i >= 0 && i < S.f.length) H.frame(si, i).catch(function () {}); }
    function render() { if (!A) return; paint(S, A, wc, ww, inv, id); ox.putImageData(id, 0, 0); draw(); }
    function draw() {
      if (!A) return; var W = cv.width, Hh = cv.height, k = Math.min(W / S.cols, Hh / S.rows) * z, d = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, Hh); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(oc, W / 2 - S.cols * k / 2 + px * d, Hh / 2 - S.rows * k / 2 + py * d, S.cols * k, S.rows * k);
      $('pxTL').innerHTML = S.rgb ? '' : '<span>W ' + Math.round(ww) + ' · L ' + Math.round(wc) + '</span>' + (z !== 1 ? '<span>' + z.toFixed(1) + '×</span>' : '');
      $('pxBL').textContent = S.f.length > 1 ? (fi + 1) + ' / ' + S.f.length : '';
      $('pxBR').textContent = (S.desc || '') + (S.sp ? ' · ' + (S.sp[1] * S.cols / 10).toFixed(0) + ' سم' : '');
      $('pxN').textContent = (fi + 1) + ' / ' + S.f.length;
    }
    function go(n) { n = Math.max(0, Math.min(S.f.length - 1, n)); if (n === fi) return; fi = n; $('pxR').value = n + 1; draw(); load(false); }
    /* gestures */
    var P = {}, last = null, pinch = null, moved = 0, tapT = 0;
    V.addEventListener('pointerdown', function (e) { V.setPointerCapture(e.pointerId); P[e.pointerId] = { x: e.clientX, y: e.clientY }; last = { x: e.clientX, y: e.clientY }; moved = 0; pinch = null; $('pxH').classList.add('gone'); });
    V.addEventListener('pointermove', function (e) {
      if (!P[e.pointerId]) return; P[e.pointerId] = { x: e.clientX, y: e.clientY }; var ids = Object.keys(P);
      if (ids.length >= 2) {
        var a = P[ids[0]], b = P[ids[1]], dd = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (pinch) { z = Math.max(0.5, Math.min(12, z * dd / pinch.d)); px += cx - pinch.x; py += cy - pinch.y; draw(); }
        pinch = { d: dd, x: cx, y: cy }; moved += 10; return;
      }
      var dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy);
      if (tool === 'wl' && !S.rgb) { var k = Math.max(0.5, ww / 220); ww = Math.max(1, ww + dx * k); wc = wc + dy * k; render(); clearPre(); }
      else if (tool === 'pan' || S.rgb && tool === 'wl') { px += dx; py += dy; draw(); }
      else if (tool === 'zoom') { z = Math.max(0.5, Math.min(12, z * (1 - dy / 200))); draw(); }
      else if (tool === 'scroll') { scr += dy; var st = Math.max(4, 300 / S.f.length); while (Math.abs(scr) > st) { go(fi + (scr > 0 ? 1 : -1)); scr -= (scr > 0 ? st : -st); } }
    });
    var scr = 0;
    function up(e) { delete P[e.pointerId]; if (!Object.keys(P).length) { pinch = null; if (moved < 6) { var t = Date.now(); if (t - tapT < 320) reset(); tapT = t; } } }
    V.addEventListener('pointerup', up); V.addEventListener('pointercancel', up);
    V.addEventListener('wheel', function (e) { e.preventDefault(); if (e.ctrlKey) { z = Math.max(0.5, Math.min(12, z * (e.deltaY < 0 ? 1.1 : 0.9))); draw(); } else go(fi + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
    function clearPre() { [].forEach.call(el.querySelectorAll('[data-p]'), function (b) { b.classList.remove('on'); }); }
    function reset() { z = 1; px = py = 0; inv = false; if (A) { var wl = autoWL(S, A); wc = wl[0]; ww = wl[1]; } [].forEach.call(el.querySelectorAll('[data-p]'), function (b, i) { b.classList.toggle('on', !i); }); render(); }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !el.contains(b)) return;
      if (b.dataset.t) { tool = b.dataset.t; [].forEach.call(el.querySelectorAll('[data-t]'), function (x) { x.classList.toggle('on', x === b); }); }
      if (b.dataset.s) setSeries(+b.dataset.s);
      if (b.dataset.p) { var p = PRE[+b.dataset.p][1]; if (p) { wc = p[0]; ww = p[1]; } else if (A) { var wl = autoWL(S, A); wc = wl[0]; ww = wl[1]; } [].forEach.call(el.querySelectorAll('[data-p]'), function (x) { x.classList.toggle('on', x === b); }); render(); }
      var a = b.dataset.a;
      if (a === 'inv') { inv = !inv; b.classList.toggle('on', inv); render(); }
      if (a === 'reset') reset();
      if (a === 'fs') { var r = el.querySelector('.px'); if (document.fullscreenElement) document.exitFullscreen(); else if (r.requestFullscreen) r.requestFullscreen().catch(function () { r.classList.toggle('max'); setTimeout(size, 50); }); else { r.classList.toggle('max'); setTimeout(size, 50); } }
      if (a === 'snap') cv.toBlob(function (bl) { if (!bl) return; var f = new File([bl], (o.name || 'صورة') + ' - ' + (fi + 1) + '.png', { type: 'image/png' }); try { if (navigator.canShare && navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: f.name }).catch(function () {}); } catch (er) {} var l = document.createElement('a'); l.href = URL.createObjectURL(bl); l.download = f.name; document.body.appendChild(l); l.click(); l.remove(); }, 'image/png');
      if (b.id === 'pxPl') { if (play) { clearInterval(play); play = 0; b.textContent = '▶'; } else { b.textContent = '❚❚'; play = setInterval(function () { go(fi + 1 >= S.f.length ? 0 : fi + 1); }, 110); } }
    });
    $('pxR').oninput = function () { go(+this.value - 1); };
    window.addEventListener('resize', size); document.addEventListener('fullscreenchange', function () { setTimeout(size, 60); });
    document.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(fi + 1); if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(fi - 1); });
    setSeries(0); size();
    return { head: H };
  }

  window.OZPacs = { parse: parse, pack: pack, open: openBundle, viewer: viewer, isBundle: function (u8) { return new TextDecoder().decode(u8.subarray(0, 6)) === MAGIC; } };
})();

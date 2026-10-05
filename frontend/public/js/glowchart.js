/* ════════════════════════════════════════════════════════════════════
   ERP · GlowLine — hand-drawn SVG line chart with a data-driven glow
   ------------------------------------------------------------------
   AXChart.line(el, cfg)
     cfg.labels   : ['1/9', …]                       x labels (oldest → newest)
     cfg.series   : [{ name, values:[…], color }]    color = CSS color / var()
     cfg.diverging: true → one series, glow is green above zero and red below
     cfg.height   : px (default 240)
     cfg.fmt      : value → string
     cfg.detail   : i → [[label, value, color?], …]   extra tooltip rows
     cfg.title    : accessible name
   Time runs right → left (RTL): the oldest point sits on the right.
   No library; redraws on resize; hover + keyboard crosshair; table view.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var uidN = 0;

  function niceStep(range, count) {
    var raw = range / Math.max(1, count);
    var p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(v));
  }
  /* monotone cubic (Fritsch–Carlson): smooth, never overshoots the data */
  function monotonePath(pts) {
    var n = pts.length;
    if (n === 0) return '';
    if (n === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
    var dx = [], dy = [], m = [], t = [];
    for (var i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += 'C' + (pts[i][0] + h).toFixed(1) + ',' + (pts[i][1] + t[i] * h).toFixed(1) + ' ' +
           (pts[i + 1][0] - h).toFixed(1) + ',' + (pts[i + 1][1] - t[i + 1] * h).toFixed(1) + ' ' +
           pts[i + 1][0].toFixed(1) + ',' + pts[i + 1][1].toFixed(1);
    }
    return d;
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function draw(host) {
    var cfg = host._axcfg; if (!cfg) return;
    var labels = cfg.labels || [];
    var series = (cfg.series || []).filter(function (s) { return s && s.values; });
    var n = labels.length;
    var W = Math.max(280, host.clientWidth || 600);
    var H = cfg.height || 240;
    var fmt = cfg.fmt || function (v) { return Math.round(v).toLocaleString('en-US'); };
    var id = host._axid;
    host.innerHTML = '';
    host.classList.add('axc');
    if (!n || !series.length) { host.innerHTML = '<div class="axc-empty">لا توجد بيانات في هذه الفترة</div>'; return; }

    var padT = 22, padB = 30, padL = 14, padR = 54;          // y-axis on the right (RTL start)
    var x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    var all = []; series.forEach(function (s) { all = all.concat(s.values); });
    var vmin = Math.min.apply(null, all), vmax = Math.max.apply(null, all);
    if (cfg.diverging || vmin >= 0) vmin = Math.min(0, vmin);
    if (vmax <= 0) vmax = cfg.diverging ? Math.max(1, Math.abs(vmin) * .25) : 1;
    var step = niceStep(vmax - vmin, 4);
    var lo = Math.floor(vmin / step) * step, hi = Math.ceil(vmax / step) * step;
    if (hi === lo) hi = lo + step;
    function X(i) { return n === 1 ? (x0 + x1) / 2 : x1 - i * (x1 - x0) / (n - 1); }   // oldest on the right
    function Y(v) { return y1 - (v - lo) / (hi - lo) * (y1 - y0); }
    var zeroY = Y(0);
    var f = Math.min(1, Math.max(0, (zeroY - y0) / (y1 - y0)));

    var svg = el('svg', { direction: 'ltr', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': cfg.title || 'رسم بياني' }, host);
    var defs = el('defs', {}, svg);
    var glow = el('filter', { id: id + 'g', x: '-10%', y: '-40%', width: '120%', height: '180%' }, defs);
    el('feGaussianBlur', { stdDeviation: 5 }, glow);

    // gradients
    if (cfg.diverging) {
      var lg = el('linearGradient', { id: id + 's', gradientUnits: 'userSpaceOnUse', x1: 0, y1: y0, x2: 0, y2: y1 }, defs);
      [[0, 'var(--ax-ok)'], [f, 'var(--ax-ok)'], [f, 'var(--ax-bad)'], [1, 'var(--ax-bad)']].forEach(function (s) {
        el('stop', { offset: s[0], style: 'stop-color:' + s[1] }, lg);
      });
      var ag = el('linearGradient', { id: id + 'a', gradientUnits: 'userSpaceOnUse', x1: 0, y1: y0, x2: 0, y2: y1 }, defs);
      [[0, 'var(--ax-ok)', .30], [f, 'var(--ax-ok)', .02], [f, 'var(--ax-bad)', .02], [1, 'var(--ax-bad)', .30]].forEach(function (s) {
        el('stop', { offset: s[0], style: 'stop-color:' + s[1] + ';stop-opacity:' + s[2] }, ag);
      });
    } else {
      series.forEach(function (s, k) {
        var g = el('linearGradient', { id: id + 'a' + k, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el('stop', { offset: 0, style: 'stop-color:' + s.color + ';stop-opacity:.26' }, g);
        el('stop', { offset: 1, style: 'stop-color:' + s.color + ';stop-opacity:0' }, g);
      });
    }

    // grid + y ticks (hairline, recessive)
    var grid = el('g', { class: 'axc-grid' }, svg);
    for (var v = lo; v <= hi + step / 2; v += step) {
      var yy = Y(v);
      el('line', { x1: x0, x2: x1, y1: yy, y2: yy, class: Math.abs(v) < step / 1e6 ? 'axc-zero' : 'axc-hair' }, grid);
      var tx = el('text', { x: x1 + 10, y: yy + 4, class: 'axc-tick', 'text-anchor': 'start' }, grid);
      tx.textContent = compact(v);
    }
    // x labels (~6)
    var every = Math.max(1, Math.ceil(n / (W < 520 ? 4 : 6)));
    for (var i = n - 1; i >= 0; i -= every) {                  // anchor labels on the newest point
      var t = el('text', { x: X(i), y: H - 9, class: 'axc-tick', 'text-anchor': i === n - 1 && n > 1 ? 'start' : i === 0 && n > 1 ? 'end' : 'middle' }, grid);
      t.textContent = labels[i];
    }

    // series
    var lines = [];
    series.forEach(function (s, k) {
      var pts = s.values.map(function (val, i) { return [X(i), Y(val)]; }).reverse();   // left → right for the path
      var d = monotonePath(pts);
      var stroke = cfg.diverging ? 'url(#' + id + 's)' : s.color;
      var area = cfg.diverging
        ? d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + zeroY.toFixed(1) + 'L' + pts[0][0].toFixed(1) + ',' + zeroY.toFixed(1) + 'Z'
        : d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + y1 + 'L' + pts[0][0].toFixed(1) + ',' + y1 + 'Z';
      el('path', { d: area, class: 'axc-area', fill: cfg.diverging ? 'url(#' + id + 'a)' : 'url(#' + id + 'a' + k + ')' }, svg);
      el('path', { d: d, class: 'axc-glow', stroke: stroke, filter: 'url(#' + id + 'g)' }, svg);
      var ln = el('path', { d: d, class: 'axc-line', stroke: stroke }, svg);
      lines.push(ln);
      // newest point: live dot with halo + value label
      var last = s.values[n - 1];
      var dotColor = cfg.diverging ? (last >= 0 ? 'var(--ax-ok)' : 'var(--ax-bad)') : s.color;
      var cx = X(n - 1), cy = Y(last);
      el('circle', { cx: cx, cy: cy, r: 5, class: 'axc-halo', style: 'fill:' + dotColor }, svg);
      el('circle', { cx: cx, cy: cy, r: 4.5, class: 'axc-dot', style: 'fill:' + dotColor }, svg);
      if (series.length === 1 || k === 0) {
        var lab = el('text', { x: cx + 9, y: cy - 10, class: 'axc-endlabel', 'text-anchor': 'start' }, svg);
        lab.textContent = fmt(last);
      }
    });

    // draw-in animation
    requestAnimationFrame(function () {
      lines.forEach(function (ln) {
        try {
          var L = ln.getTotalLength();
          ln.style.strokeDasharray = L; ln.style.strokeDashoffset = L;
          ln.getBoundingClientRect();
          ln.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)';
          ln.style.strokeDashoffset = 0;
        } catch (e) {}
      });
    });

    // hover / keyboard crosshair
    var cross = el('line', { x1: 0, x2: 0, y1: y0, y2: y1, class: 'axc-cross' }, svg);
    var focusDots = series.map(function () { return el('circle', { r: 5, class: 'axc-focus' }, svg); });
    var tip = document.createElement('div'); tip.className = 'axc-tip'; host.appendChild(tip);
    var hit = el('rect', { x: x0 - 6, y: y0, width: x1 - x0 + 12, height: y1 - y0, class: 'axc-hit' }, svg);
    host.tabIndex = 0;
    host.setAttribute('aria-label', (cfg.title || 'رسم بياني') + ' — استخدم الأسهم للتنقل بين الأيام');

    function show(i) {
      i = Math.max(0, Math.min(n - 1, i));
      host._axi = i;
      var cx = X(i);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); svg.classList.add('axc-hover');
      series.forEach(function (s, k) {
        var val = s.values[i];
        focusDots[k].setAttribute('cx', cx); focusDots[k].setAttribute('cy', Y(val));
        focusDots[k].style.fill = cfg.diverging ? (val >= 0 ? 'var(--ax-ok)' : 'var(--ax-bad)') : s.color;
      });
      tip.textContent = '';
      var h = document.createElement('div'); h.className = 'axc-tip-h'; h.textContent = labels[i]; tip.appendChild(h);
      function row(name, val, color, strong) {
        var r = document.createElement('div'); r.className = 'axc-tip-r' + (strong ? ' axc-strong' : '');
        var key = document.createElement('i'); key.style.background = color || 'var(--ax-faint)';
        var b = document.createElement('b'); b.textContent = val;
        var sp = document.createElement('span'); sp.textContent = name;
        r.appendChild(key); r.appendChild(b); r.appendChild(sp); tip.appendChild(r);
      }
      series.forEach(function (s) {
        var val = s.values[i];
        row(s.name, fmt(val), cfg.diverging ? (val >= 0 ? 'var(--ax-ok)' : 'var(--ax-bad)') : s.color, true);
      });
      if (cfg.detail) (cfg.detail(i) || []).forEach(function (d) { row(d[0], d[1], d[2], false); });
      tip.classList.add('on');
      var tw = tip.offsetWidth, hw = host.clientWidth;
      var left = cx - tw - 14; if (left < 4) left = cx + 14; if (left + tw > hw - 4) left = hw - tw - 4;
      tip.style.left = left + 'px';
      tip.style.top = Math.max(0, y0 - 6) + 'px';
    }
    function hide() { svg.classList.remove('axc-hover'); tip.classList.remove('on'); }
    function nearest(evt) {
      var r = svg.getBoundingClientRect();
      var px = (evt.clientX - r.left) * (W / r.width);
      return n === 1 ? 0 : Math.round((x1 - px) / ((x1 - x0) / (n - 1)));
    }
    hit.addEventListener('pointermove', function (e) { show(nearest(e)); });
    hit.addEventListener('pointerdown', function (e) { show(nearest(e)); });
    hit.addEventListener('pointerleave', hide);
    host.onkeydown = function (e) {
      var i = host._axi == null ? n - 1 : host._axi;
      if (e.key === 'ArrowLeft') { show(i + 1); e.preventDefault(); }      // RTL: left = newer
      else if (e.key === 'ArrowRight') { show(i - 1); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    };
    host.onfocus = function () { show(host._axi == null ? n - 1 : host._axi); };
    host.onblur = hide;
  }

  var ro = ('ResizeObserver' in window) ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) {
      var h = en.target;
      if (!h.isConnected || !h._axcfg) return;
      var w = Math.round(en.contentRect.width);
      if (w && Math.abs(w - (h._axw || 0)) > 4) { h._axw = w; clearTimeout(h._axt); h._axt = setTimeout(function () { draw(h); }, 120); }
    });
  }) : null;

  window.AXChart = {
    line: function (host, cfg) {
      if (!host) return;
      host._axcfg = cfg;
      if (!host._axid) host._axid = 'axc' + (++uidN);
      host._axi = null;
      host._axw = host.clientWidth;
      draw(host);
      if (ro && !host._axobs) { ro.observe(host); host._axobs = true; }
    },
    /* accessible table of the same numbers */
    table: function (labels, series, fmt) {
      var h = '<details class="axc-table"><summary>عرض البيانات كجدول</summary><div class="axc-table-wrap"><table><thead><tr><th>الفترة</th>' +
        series.map(function (s) { return '<th>' + s.name + '</th>'; }).join('') + '</tr></thead><tbody>';
      for (var i = labels.length - 1; i >= 0; i--) {
        h += '<tr><td>' + labels[i] + '</td>' + series.map(function (s) { return '<td>' + fmt(s.values[i]) + '</td>'; }).join('') + '</tr>';
      }
      return h + '</tbody></table></div></details>';
    }
  };
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · Pulse Scene — motion replacement for the dashboard pulse cards
   (الورق · الحبر · الفواتير · تحصيل اليوم · عليك للموردين · الخزنة)
   ------------------------------------------------------------------
   Layers (back → front), all driven by GSAP, no video / GIF:
     1. drifting glow blobs
     2. a tilted 3D wall of checkboxes — one box per invoice of the
        month; a cursor ticks the paid ones in, holds, then resets
     3. a glowing area graph (0–100%) of the selected metric, 30 days,
        with a light that keeps running along the line
     4. a ticker of every metric along the bottom
   plus pointer / scroll parallax and six metric tiles that switch the
   graph. Values are read from the app's own cards so the numbers
   always match the rest of the dashboard.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var DAYS = 30;
  var state = { active: 'paper', lastIntro: 0, ctx: null, obs: null, io: null };

  var META = {
    paper:     { title: 'الورق',          color: '#7CF0C5', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>', go: 'stock',     graph: 'رصيد الورق' },
    ink:       { title: 'الحبر',          color: '#FF7EB6', icon: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',                                  go: 'stock',     graph: 'رصيد الحبر' },
    invoices:  { title: 'الفواتير',       color: '#A99BFF', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>', go: 'invoices', graph: 'نسبة تحصيل الفواتير' },
    collect:   { title: 'تحصيل اليوم',    color: '#6FB6FF', icon: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',                   go: 'payments',  graph: 'التحصيل اليومي' },
    suppliers: { title: 'عليك للموردين',  color: '#FFC46B', icon: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>',                                        go: 'suppliers', graph: 'المستحق للموردين' },
    treasury:  { title: 'الخزنة',         color: '#5CE89A', icon: '<rect x="2" y="6" width="20" height="14" rx="3"/><path d="M16 13h4M2 10h20"/>',          go: 'payments',  graph: 'رصيد الخزنة' }
  };
  var ORDER = ['paper', 'ink', 'invoices', 'collect', 'suppliers', 'treasury'];
  var LEVEL = { success: ['ok', 'آمن'], warning: ['warn', 'متابعة'], danger: ['bad', 'تنبيه'], info: ['info', ''], purple: ['info', ''] };

  /* ── data ── */
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function days() { var out = [], t = new Date(); t.setHours(0, 0, 0, 0); for (var i = DAYS - 1; i >= 0; i--) { var d = new Date(t); d.setDate(t.getDate() - i); out.push(lds(d)); } return out; }
  function isInk(p) { return /حبر|ink|toner|خرطوش/i.test((p.name || '') + ' ' + (p.type || '')); }
  function isPaper(p) { return /ورق|paper|a4|a3|فرخ|ريم/i.test((p.name || '') + ' ' + (p.type || '')); }
  function sumBy(list, f) { var s = 0; list.forEach(function (x) { s += Number(f(x) || 0); }); return s; }

  /* level on each day = today's value rolled back through the later movements */
  function rollback(current, deltas, ds) {        // deltas: {date: +change that happened that day}
    var out = new Array(ds.length), v = current;
    for (var i = ds.length - 1; i >= 0; i--) { out[i] = v; v -= (deltas[ds[i]] || 0); }
    return out;
  }
  function stockSeries(pick, ds) {
    var prods = A('products').filter(pick), ids = {};
    prods.forEach(function (p) { ids[p.id] = 1; });
    var d = {};
    A('stockMoves').forEach(function (m) { if (ids[m.productId]) d[m.date] = (d[m.date] || 0) + (m.type === 'in' ? 1 : -1) * Number(m.quantity || 0); });
    return rollback(sumBy(prods, function (p) { return p.quantity; }), d, ds);
  }
  function series(key) {
    var ds = days(), first = ds[0];
    if (key === 'paper') {
      var hasPaper = A('products').some(function (p) { return isPaper(p) && !isInk(p); });
      return stockSeries(function (p) { return !isInk(p) && (!hasPaper || isPaper(p)); }, ds);
    }
    if (key === 'ink') return stockSeries(isInk, ds);
    if (key === 'invoices') {                    // % of the last-14-days invoices that are paid, per day
      var inv = A('invoices');
      return ds.map(function (day) {
        var from = new Date(day); from.setDate(from.getDate() - 13); var f = lds(from);
        var w = inv.filter(function (i) { return i.date >= f && i.date <= day; });
        var t = sumBy(w, function (i) { return i.total; });
        return t ? Math.min(100, sumBy(w, function (i) { return Math.min(Number(i.paid || 0), Number(i.total || 0)); }) / t * 100) : 0;
      });
    }
    if (key === 'collect') {
      var by = {}; A('payments').forEach(function (p) { if (p.date >= first) by[p.date] = (by[p.date] || 0) + Number(p.amount || 0); });
      return ds.map(function (d) { return by[d] || 0; });
    }
    if (key === 'suppliers') {
      var sd = {};
      A('expenses').forEach(function (e) { if (e.kind === 'purchase' && e.paymentMethod === 'credit') sd[e.date] = (sd[e.date] || 0) + Number(e.amount || 0); });
      A('supplierPayments').forEach(function (p) { sd[p.date] = (sd[p.date] || 0) - Number(p.amount || 0); });
      return rollback(state.values.suppliers || 0, sd, ds);
    }
    if (key === 'treasury') {
      var td = {};
      function add(d, v) { td[d] = (td[d] || 0) + v; }
      A('payments').forEach(function (p) { add(p.date, Number(p.amount || 0)); });
      A('bankTransfers').forEach(function (t) { add(t.date, (t.type === 'out' || t.type === 'withdrawal' ? -1 : 1) * Number(t.amount || 0)); });
      A('expenses').forEach(function (e) { if (!(e.kind === 'purchase' && e.paymentMethod === 'credit')) add(e.date, -Number(e.amount || 0)); });
      A('supplierPayments').forEach(function (p) { add(p.date, -Number(p.amount || 0)); });
      return rollback(state.values.treasury || 0, td, ds);
    }
    return ds.map(function () { return 0; });
  }
  /* graph works in 0–100% of the window's own range */
  function toPct(key, raw) {
    if (key === 'invoices') return raw.slice();
    var mx = Math.max.apply(null, raw), mn = Math.min.apply(null, raw);
    if (key === 'collect' || mn >= 0) mn = 0;
    var r = mx - mn;
    return raw.map(function (v) { return r ? 6 + (v - mn) / r * 88 : 50; });
  }
  /* inverse of toPct: a y-level (0–100) back to the real value, for the axis labels */
  function fromPct(key, raw, p) {
    if (key === 'invoices') return p;
    var mx = Math.max.apply(null, raw), mn = Math.min.apply(null, raw);
    if (key === 'collect' || mn >= 0) mn = 0;
    var r = mx - mn;
    return r ? mn + (p - 6) / 88 * r : mx;
  }
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(0) + 'K';
    if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(v));
  }
  function dayLabel(ds, long) {
    var p = ds.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (!long) return d.getDate() + '/' + (d.getMonth() + 1);
    try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(d); }
    catch (e) { return d.getDate() + '/' + (d.getMonth() + 1); }
  }

  /* ── read the app's own cards ── */
  function readCards(grid) {
    var cards = grid.querySelectorAll('.pg-card'), out = {};
    cards.forEach(function (c, i) {
      var key = ORDER[i]; if (!key) return;
      var lv = (c.className.match(/pg-(success|warning|danger|info|purple)/) || [])[1] || 'info';
      out[key] = {
        value: ((c.querySelector('.pg-value') || {}).textContent || '').trim(),
        status: ((c.querySelector('.pg-status') || {}).textContent || '').trim(),
        level: lv
      };
    });
    return out;
  }
  function numOf(s) { var m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; }
  function fmtN(n) { return Math.round(n).toLocaleString('en-US'); }

  /* ── smooth path ── */
  function smooth(pts) {
    var n = pts.length; if (n < 2) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }
  function svgEl(tag, a, p) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function ico(path) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; }

  /* ── ticker items: each metric + its change since yesterday, mixed with the latest activity ── */
  var UP_GOOD = { paper: true, ink: true, invoices: false, collect: true, suppliers: false, treasury: true };
  function invDelta(n) {                       // overdue invoices: compared with the first look today
    try {
      var today = lds(new Date()), b = JSON.parse(localStorage.getItem('ax_tk_inv') || 'null');
      if (!b || b.date !== today) { localStorage.setItem('ax_tk_inv', JSON.stringify({ date: today, n: n })); return null; }
      var diff = n - b.n; if (!diff) return null;
      return { dir: diff > 0 ? 'up' : 'down', text: String(Math.abs(diff)), good: diff < 0, hint: 'من أول النهارده' };
    } catch (e) { return null; }
  }
  function tickerItems() {
    var items = ORDER.map(function (k) {
      var c = state.cards[k] || {}, d = null;
      try {
        if (k === 'invoices') d = invDelta(numOf(c.value));
        else {
          var raw = series(k), diff = raw[raw.length - 1] - raw[raw.length - 2];
          if (Math.abs(diff) >= .5) d = { dir: diff > 0 ? 'up' : 'down', text: fmtN(Math.abs(diff)), good: (diff > 0) === UP_GOOD[k],
            hint: k === 'collect' ? 'مقارنة بتحصيل امبارح' : 'التغيير عن امبارح' };
        }
      } catch (e) {}
      return { key: 'm-' + k, label: META[k].title, value: c.value || '—', level: (LEVEL[c.level] || LEVEL.info)[0], delta: d, go: META[k].go };
    });
    return AXTicker.withEvents(items, 4);
  }

  /* ── build ── */
  function build(grid) {
    var cards = readCards(grid);
    state.cards = cards;
    state.values = { suppliers: numOf((cards.suppliers || {}).value), treasury: numOf((cards.treasury || {}).value) };
    // sales documents = each paper-issuance batch + every invoice that is NOT made from an issuance
    var m0 = lds(new Date()).slice(0, 7) + '-01', docs = {};
    A('issuances').forEach(function (i) {
      var k = 'i' + (i.number || i.id), d = docs[k] || (docs[k] = { date: i.date || '', total: 0, paid: 0 });
      d.total += Number(i.total || 0); d.paid += Number(i.paid || 0);
    });
    A('invoices').forEach(function (i) { if (!i.sourceIssuanceId) docs['v' + i.id] = { date: i.date || '', total: Number(i.total || 0), paid: Number(i.paid || 0) }; });
    var all = Object.keys(docs).map(function (k) { return docs[k]; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var monthDocs = all.filter(function (d) { return d.date >= m0; });
    if (monthDocs.length < 5) monthDocs = all.slice(-40);
    var paid = monthDocs.filter(function (d) { return d.paid >= d.total - .005; }).length;
    state.inv = { total: monthDocs.length, paid: paid, recent: !!(monthDocs.length && monthDocs[0].date < m0) };

    var sec = document.createElement('section');
    sec.className = 'pxs'; sec.id = 'pxs';
    sec.setAttribute('aria-label', 'نبض الشركة: الورق والحبر والفواتير والتحصيل والموردين والخزنة');
    sec.innerHTML =
      '<div class="pxs-tkhost"></div>' +
      '<div class="pxs-stage">' +
        '<div class="pxs-glow pxs-g1"></div><div class="pxs-glow pxs-g2"></div><div class="pxs-glow pxs-g3"></div>' +
        '<div class="pxs-wall-wrap"><div class="pxs-wall" aria-hidden="true"></div></div>' +
        '<div class="pxs-cap"><span class="pxs-cap-dot"></span><b class="pxs-cap-n">0</b><span>من ' + state.inv.total + ' عملية بيع اتحصّلت ' + (state.inv.recent ? 'مؤخراً' : 'الشهر ده') + '</span></div>' +
        '<div class="pxs-graph">' +
          '<div class="pxs-gh"><div class="pxs-gt"><span class="pxs-gname"></span><b class="pxs-gval"></b></div><span class="pxs-gdelta"></span></div>' +
          '<div class="pxs-plot"></div>' +
        '</div>' +
      '</div>' +
      '<div class="pxs-tiles" role="tablist" aria-label="اختار المؤشر">' + ORDER.map(function (k) {
        var c = cards[k] || {}, L = LEVEL[c.level] || LEVEL.info;
        return '<button class="pxs-tile lv-' + L[0] + '" role="tab" data-k="' + k + '" style="--c:' + META[k].color + '">' +
          '<span class="pxs-ti">' + ico(META[k].icon) + '</span>' +
          '<span class="pxs-tt">' + META[k].title + '</span>' +
          '<b class="pxs-tv" data-v="' + (c.value || '—') + '">' + (c.value || '—') + '</b>' +
          '<span class="pxs-ts"><i></i>' + (c.status || '') + '</span>' +
          '<span class="pxs-go" data-go="' + META[k].go + '">فتح ' + ico('<path d="m15 18-6-6 6-6"/>') + '</span>' +
        '</button>';
      }).join('') + '</div>';
    grid.parentNode.insertBefore(sec, grid);
    grid.classList.add('pxs-replaced');
    return sec;
  }

  /* checkbox wall */
  function fillWall(sec) {
    var wall = sec.querySelector('.pxs-wall');
    var w = sec.querySelector('.pxs-stage').clientWidth;
    var cell = w < 560 ? 20 : 26, gap = w < 560 ? 10 : 14;
    var cols = Math.max(12, Math.ceil((w * 1.5) / (cell + gap))), rows = w < 560 ? 7 : 8;
    wall.style.setProperty('--cell', cell + 'px'); wall.style.setProperty('--gap', gap + 'px');
    wall.style.gridTemplateColumns = 'repeat(' + cols + ', var(--cell))';
    var h = '';
    for (var i = 0; i < cols * rows; i++) h += '<i class="pxs-c"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></i>';
    wall.innerHTML = h + '<span class="pxs-cursor"></span>';
    return { wall: wall, cols: cols, rows: rows, cells: wall.querySelectorAll('.pxs-c'), cursor: wall.querySelector('.pxs-cursor'), cell: cell, gap: gap };
  }

  /* ── graph: glowing line that answers back — hover / touch / arrows show the real number of each day ── */
  function Graph(sec) {
    var plot = sec.querySelector('.pxs-plot');
    var g = { plot: plot, vals: new Array(DAYS).fill(0), raw: new Array(DAYS).fill(0), days: days(), run: { p: 0 }, hover: -1 };
    g.draw = function () {
      var W = Math.max(280, plot.clientWidth), H = plot.clientHeight || 190;
      g.W = W; g.H = H;
      plot.innerHTML = '';
      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, direction: 'ltr' }, plot);
      g.svg = svg;
      var defs = svgEl('defs', {}, svg);
      var f = svgEl('filter', { id: 'pxs-blur', x: '-20%', y: '-60%', width: '140%', height: '220%' }, defs);
      svgEl('feGaussianBlur', { stdDeviation: 7 }, f);
      var lg = svgEl('linearGradient', { id: 'pxs-area', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      g.s1 = svgEl('stop', { offset: 0, 'stop-opacity': 0.34 }, lg); g.s2 = svgEl('stop', { offset: 1, 'stop-opacity': 0 }, lg);
      var cp = svgEl('clipPath', { id: 'pxs-clip' }, defs);
      g.clip = svgEl('rect', { x: 0, y: -20, width: W, height: H + 40 }, cp);
      g.pl = 12; g.pr = 58; g.pt = 12; g.pb = 26;
      g.levels = [0, 25, 50, 75, 100];
      g.axis = svgEl('g', {}, svg);
      g.levels.forEach(function (v) { var y = g.y(v); svgEl('line', { x1: g.pl, x2: W - g.pr, y1: y, y2: y, class: 'pxs-hair' }, g.axis); });
      g.ticks = svgEl('g', {}, svg);
      var grp = svgEl('g', { 'clip-path': 'url(#pxs-clip)' }, svg);
      g.area = svgEl('path', { class: 'pxs-area', fill: 'url(#pxs-area)' }, grp);
      g.glow = svgEl('path', { class: 'pxs-lglow', filter: 'url(#pxs-blur)' }, grp);
      g.line = svgEl('path', { class: 'pxs-line' }, grp);
      g.runner = svgEl('path', { class: 'pxs-runner' }, grp);
      g.head = svgEl('circle', { r: 4.5, class: 'pxs-head' }, svg);
      g.headGlow = svgEl('circle', { r: 14, class: 'pxs-headglow' }, svg);
      g.now = svgEl('circle', { r: 5, class: 'pxs-now' }, svg);
      g.cross = svgEl('line', { x1: 0, x2: 0, y1: g.pt, y2: H - g.pb, class: 'pxs-cross' }, svg);
      g.focus = svgEl('circle', { r: 6, class: 'pxs-focus' }, svg);
      g.hit = svgEl('rect', { x: g.pl - 6, y: 0, width: W - g.pr - g.pl + 12, height: H, class: 'pxs-hit' }, svg);
      g.tip = document.createElement('div'); g.tip.className = 'pxs-tip'; plot.appendChild(g.tip);
      plot.tabIndex = 0;
      plot.setAttribute('role', 'img');
      g.bind();
      g.labels();
      g.paint();
    };
    g.x = function (i) { return (g.W - g.pr) - i * ((g.W - g.pr - g.pl) / (DAYS - 1)); };   // oldest on the right
    g.y = function (v) { return (g.H - g.pb) - v / 100 * (g.H - g.pb - g.pt); };
    /* value labels on the right (real units, not %) + dates along the bottom */
    g.labels = function () {
      if (!g.ticks) return;
      g.ticks.textContent = '';
      g.levels.forEach(function (lv) {
        if (!lv) return;
        var t = svgEl('text', { x: g.W - g.pr + 10, y: g.y(lv) + 4, class: 'pxs-ax' }, g.ticks);
        t.textContent = g.key === 'invoices' ? lv + '%' : compact(fromPct(g.key, g.raw, lv));
      });
      [DAYS - 1, 22, 15, 8, 0].forEach(function (i) {
        var t = svgEl('text', { x: g.x(i), y: g.H - 6, class: 'pxs-ax pxs-axd', 'text-anchor': i === DAYS - 1 ? 'start' : i === 0 ? 'end' : 'middle' }, g.ticks);
        t.textContent = i === DAYS - 1 ? 'النهارده' : dayLabel(g.days[i]);
      });
      g.plot.setAttribute('aria-label', (g.name || '') + ' — آخر ' + DAYS + ' يوم. استخدم الأسهم للتنقل بين الأيام');
    };
    g.paint = function () {
      if (!g.line) return;
      var pts = g.vals.map(function (v, i) { return [g.x(i), g.y(Math.max(0, Math.min(100, v)))]; }).reverse();
      var d = smooth(pts);
      g.line.setAttribute('d', d); g.glow.setAttribute('d', d); g.runner.setAttribute('d', d);
      g.area.setAttribute('d', d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + (g.H - g.pb) + 'L' + pts[0][0].toFixed(1) + ',' + (g.H - g.pb) + 'Z');
      g.len = g.line.getTotalLength();
      g.runner.style.strokeDasharray = '70 ' + (g.len + 80);
      var n = pts[0]; g.now.setAttribute('cx', n[0]); g.now.setAttribute('cy', n[1]);
      g.moveHead();
      if (g.hover >= 0) g.show(g.hover, true);
    };
    g.moveHead = function () {
      if (!g.len) return;
      var at = g.len * (1 - g.run.p);                  // travel right (old) → left (new)
      var p = g.line.getPointAtLength(Math.max(0, at));
      g.head.setAttribute('cx', p.x); g.head.setAttribute('cy', p.y);
      g.headGlow.setAttribute('cx', p.x); g.headGlow.setAttribute('cy', p.y);
      g.runner.style.strokeDashoffset = -(at - 70);
    };
    g.color = function (c) { g.plot.style.setProperty('--gc', c); [g.s1, g.s2].forEach(function (s) { s.setAttribute('stop-color', c); }); };
    /* the numbers behind the line */
    g.setData = function (key, raw, fmt, name) { g.key = key; g.raw = raw.slice(); g.fmt = fmt; g.name = name; g.labels(); };
    g.show = function (i, quiet) {
      i = Math.max(0, Math.min(DAYS - 1, i)); g.hover = i;
      var x = g.x(i), y = g.y(Math.max(0, Math.min(100, g.vals[i])));
      g.cross.setAttribute('x1', x); g.cross.setAttribute('x2', x);
      g.focus.setAttribute('cx', x); g.focus.setAttribute('cy', y);
      g.svg.classList.add('pxs-hovering');
      var v = g.raw[i], pv = i > 0 ? g.raw[i - 1] : null, diff = pv == null ? 0 : v - pv;
      var good = (diff > 0) === (g.key === 'invoices' ? true : !!UP_GOOD[g.key]);   // invoices graph = % collected
      g.tip.textContent = '';
      var h = document.createElement('div'); h.className = 'pxs-tip-d'; h.textContent = i === DAYS - 1 ? 'النهارده' : dayLabel(g.days[i], true);
      var b = document.createElement('b'); b.textContent = g.fmt(v);
      g.tip.appendChild(h); g.tip.appendChild(b);
      if (pv != null && Math.abs(diff) >= .5) {
        var c = document.createElement('span'); c.className = 'pxs-tip-c ' + (good ? 'good' : 'bad');
        c.textContent = (diff > 0 ? '▲ ' : '▼ ') + g.fmt(Math.abs(diff)) + ' عن اليوم اللي قبله';
        g.tip.appendChild(c);
      } else if (pv != null) {
        var c2 = document.createElement('span'); c2.className = 'pxs-tip-c'; c2.textContent = 'زي اليوم اللي قبله'; g.tip.appendChild(c2);
      }
      g.tip.classList.add('on');
      var tw = g.tip.offsetWidth, left = x - tw / 2;
      left = Math.max(4, Math.min(g.W - tw - 4, left));
      g.tip.style.left = left + 'px';
      g.tip.style.top = Math.max(0, y - g.tip.offsetHeight - 16) + 'px';
      if (!quiet && g.onHover) g.onHover(i);
    };
    g.hide = function () {
      g.hover = -1; if (!g.svg) return;
      g.svg.classList.remove('pxs-hovering'); g.tip.classList.remove('on');
      if (g.onHover) g.onHover(-1);
    };
    g.bind = function () {
      function idx(e) {
        var r = g.svg.getBoundingClientRect(), px = (e.clientX - r.left) * (g.W / r.width);
        return Math.round(((g.W - g.pr) - px) / ((g.W - g.pr - g.pl) / (DAYS - 1)));
      }
      g.hit.addEventListener('pointermove', function (e) { g.show(idx(e)); });
      g.hit.addEventListener('pointerdown', function (e) { g.show(idx(e)); });
      g.hit.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') g.hide(); });
      g.hit.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') { clearTimeout(g.ht); g.ht = setTimeout(g.hide, 2600); } });
      plot.onkeydown = function (e) {
        var i = g.hover < 0 ? DAYS - 1 : g.hover;
        if (e.key === 'ArrowLeft') { g.show(i + 1); e.preventDefault(); }       // RTL: left = newer
        else if (e.key === 'ArrowRight') { g.show(i - 1); e.preventDefault(); }
        else if (e.key === 'Escape') g.hide();
      };
      plot.onfocus = function () { g.show(g.hover < 0 ? DAYS - 1 : g.hover); };
      plot.onblur = g.hide;
    };
    return g;
  }

  /* ── mount ── */
  function mount() {
    var grid = document.getElementById('pulse-grid');
    if (!grid || typeof gsap === 'undefined') return;
    if (state.ctx) { try { state.ctx.revert(); } catch (e) {} state.ctx = null; }
    if (state.ro) { try { state.ro.disconnect(); } catch (e) {} }
    if (state.io) { try { state.io.disconnect(); } catch (e) {} }
    var old = document.getElementById('pxs'); if (old) old.remove();
    var sec = build(grid);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var intro = !reduce && (Date.now() - state.lastIntro > 20000);
    if (intro) state.lastIntro = Date.now();
    var G = Graph(sec);
    var W = fillWall(sec);
    var stage = sec.querySelector('.pxs-stage');
    gsap.set(W.wall, { rotationX: 40, rotationZ: -8, y: 0, transformOrigin: '50% 0%' });

    state.ctx = gsap.context(function () {
      var loops = [];

      /* 1 · glow blobs drift */
      if (!reduce) {
        loops.push(gsap.to('.pxs-g1', { xPercent: 18, yPercent: -12, scale: 1.15, duration: 7, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
        loops.push(gsap.to('.pxs-g2', { xPercent: -22, yPercent: 10, scale: .9, duration: 9, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
        loops.push(gsap.to('.pxs-g3', { opacity: .35, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
        loops.push(gsap.to('.pxs-wall', { y: -12, rotationZ: -8.8, duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      }

      /* 2 · checkbox wall — cursor ticks the paid invoices, holds, resets */
      var total = W.cells.length;
      var ratio = state.inv.total ? state.inv.paid / state.inv.total : 0;
      var target = Math.round(total * ratio);
      var order = [];
      // only the columns that sit inside the visible part of the tilted wall (grid runs right → left in RTL)
      var cA = Math.ceil(W.cols * .19), cB = Math.floor(W.cols * .81);
      for (var c = cA; c < cB; c++) for (var r = 0; r < W.rows - 2; r++) order.push({ i: r * W.cols + c, k: (c - cA) + Math.random() * 2.2 });
      total = order.length;
      order.sort(function (a, b) { return a.k - b.k; });
      var picks = order.slice(0, target).map(function (o) { return W.cells[o.i]; });
      var cap = sec.querySelector('.pxs-cap-n');
      function capTo(k) { cap.textContent = Math.round(state.inv.paid * k / Math.max(1, target)); }
      function posOf(el) { return { x: el.offsetLeft - 5, y: el.offsetTop - 5 }; }
      if (reduce || !target) {
        picks.forEach(function (el) { el.classList.add('on'); });
        cap.textContent = state.inv.paid;
        gsap.set(W.cursor, { autoAlpha: 0 });
      } else {
        var step = Math.max(.06, Math.min(.32, 7 / target));
        var tl = gsap.timeline({ repeat: -1, repeatDelay: .4, delay: intro ? .9 : .2 });
        tl.set(W.cursor, { autoAlpha: 1, x: posOf(picks[0]).x, y: posOf(picks[0]).y });
        picks.forEach(function (el, n) {
          var p = posOf(el), t = n * step + .05;
          tl.to(W.cursor, { x: p.x, y: p.y, duration: step * .7, ease: 'power2.inOut' }, t);
          tl.call(function () { el.classList.add('on', 'hot'); capTo(n + 1); setTimeout(function () { el.classList.remove('hot'); }, 380); }, null, t + step * .7);
          tl.fromTo(el, { scale: .6 }, { scale: 1, duration: .35, ease: 'back.out(3)', immediateRender: false }, t + step * .7);
        });
        tl.call(function () { cap.textContent = state.inv.paid; }, null, picks.length * step + .4);
        tl.to(W.cursor, { autoAlpha: 0, duration: .4 }, '+=.2');
        tl.to({}, { duration: 2.8 });
        tl.to(picks.slice().reverse(), { opacity: 0, duration: .25, stagger: Math.min(.02, 1.2 / target), ease: 'power1.in' });
        tl.call(function () { picks.forEach(function (el) { el.classList.remove('on'); gsap.set(el, { opacity: 1 }); }); cap.textContent = 0; });
        loops.push(tl);
      }

      /* 3 · graph */
      G.draw();
      var tip = sec.querySelector('.pxs-graph');
      function select(k, animate) {
        state.active = k;
        var m = META[k], raw = series(k), pct = toPct(k, raw), c = state.cards[k] || {};
        sec.querySelectorAll('.pxs-tile').forEach(function (t) { var on = t.dataset.k === k; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
        sec.style.setProperty('--gc', m.color);
        G.color(m.color);
        tip.querySelector('.pxs-gname').textContent = m.graph + ' · آخر ' + DAYS + ' يوم';
        tip.querySelector('.pxs-gval').textContent = c.value || '—';
        var a = raw[0], b = raw[raw.length - 1];
        var dl = tip.querySelector('.pxs-gdelta');
        if (k === 'collect') { dl.textContent = 'إجمالي ' + DAYS + ' يوم: ' + fmtN(raw.reduce(function (s, v) { return s + v; }, 0)); dl.className = 'pxs-gdelta'; }
        else if (k === 'invoices') { dl.textContent = 'اتحصّل ' + Math.round(b) + '% من فواتير آخر أسبوعين'; dl.className = 'pxs-gdelta'; }
        else if (a) { var ch = (b - a) / Math.abs(a) * 100; dl.textContent = '‎' + (ch >= 0 ? '+' : '') + ch.toFixed(0) + '% من ' + DAYS + ' يوم'; dl.className = 'pxs-gdelta ' + (ch >= 0 ? 'up' : 'down'); }
        else { dl.textContent = ''; }
        var unit = k === 'invoices' ? '%' : String(c.value || '').replace(/[-\d.,\s]+/, '').trim();
        if (unit === '—') unit = '';
        var fmt = function (v) { return k === 'invoices' ? Math.round(v) + '%' : fmtN(v) + (unit ? ' ' + unit : ''); };
        G.setData(k, raw, fmt, m.graph);
        G.onHover = function (i) {
          var gv = tip.querySelector('.pxs-gval'), gn = tip.querySelector('.pxs-gname');
          if (i < 0) { gv.textContent = c.value || '—'; gn.textContent = m.graph + ' · آخر ' + DAYS + ' يوم'; tip.classList.remove('is-hover'); return; }
          gv.textContent = fmt(raw[i]);
          gn.textContent = m.graph + ' · ' + (i === DAYS - 1 ? 'النهارده' : dayLabel(G.days[i], true));
          tip.classList.add('is-hover');
        };
        if (G.hover >= 0) G.hide();
        if (animate && !reduce) {
          gsap.to(G.vals, { endArray: pct, duration: 1.1, ease: 'expo.inOut', onUpdate: G.paint });
          gsap.fromTo('.pxs-gt', { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .6, ease: 'power3.out' });
        } else { G.vals = pct.slice(); G.paint(); }
      }
      state.select = select;
      select(state.active, false);
      if (intro) {
        gsap.fromTo(G.clip, { attr: { x: G.W, width: 0 } }, { attr: { x: 0, width: G.W }, duration: 1.8, ease: 'power3.inOut', delay: .35 });
        gsap.from(G.now, { attr: { r: 0 }, duration: .6, delay: 2, ease: 'back.out(3)' });
      }
      if (!reduce) {
        loops.push(gsap.to(G.run, { p: 1, duration: 5.5, ease: 'none', repeat: -1, repeatDelay: .6, onUpdate: G.moveHead, delay: intro ? 2 : 0 }));
        loops.push(gsap.to(G.now, { attr: { r: 8 }, opacity: .55, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
        loops.push(gsap.to(G.area, { opacity: .7, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      } else { gsap.set([G.head, G.headGlow, G.runner], { autoAlpha: 0 }); }

      /* 4 · شريط النبض (js/ticker.js) — the strip on top of this panel */
      if (window.AXTicker) {
        AXTicker.create(sec.querySelector('.pxs-tkhost'), { id: 'dash', variant: 'bar', label: 'شريط النبض: كل الأرقام وآخر الحركات', items: tickerItems() });
      }
      /* the panel is the first thing on the dashboard, the cash flow follows (hero after it) —
         aurum.js moves the cash flow in the same render, so settle the order right after */
      Promise.resolve().then(function () {
        var pc = document.getElementById('page-content');
        if (!pc || sec.parentNode !== pc) return;
        pc.insertBefore(sec, pc.firstChild);
        var cf = document.getElementById('cashflow-container'), cfRow = cf && (cf.closest('.dash-row') || cf.closest('.dash-card'));
        if (cfRow && cfRow.parentNode === pc) pc.insertBefore(cfRow, sec.nextSibling);
      });

      /* intro */
      if (intro) {
        gsap.from('.pxs-wall-wrap', { rotationX: 70, y: -60, autoAlpha: 0, duration: 1.4, ease: 'expo.out' });
        gsap.from('.pxs-c', { scale: 0, autoAlpha: 0, duration: .5, ease: 'back.out(2)', stagger: { amount: .9, grid: [W.rows, W.cols], from: 'end' } });
        gsap.from('.pxs-cap, .pxs-gh', { y: 16, autoAlpha: 0, duration: .8, ease: 'power3.out', delay: .5, stagger: .1 });
        gsap.from('.pxs-tile', { y: 24, autoAlpha: 0, duration: .7, ease: 'power3.out', stagger: .07, delay: .3 });
        sec.querySelectorAll('.pxs-tv').forEach(function (b) {
          var txt = b.dataset.v, n = numOf(txt); if (!n || !/\d/.test(txt)) return;
          var o = { v: 0 };
          gsap.to(o, { v: n, duration: 1.4, ease: 'power3.out', delay: .5, onUpdate: function () { b.textContent = txt.replace(/-?[\d,]+(\.\d+)?/, fmtN(o.v)); } });
        });
      }

      /* parallax: pointer on desktop, scroll on touch */
      if (!reduce) {
        var qx = gsap.quickTo('.pxs-wall-wrap', 'rotationY', { duration: .9, ease: 'power3' });
        var qwx = gsap.quickTo('.pxs-wall-wrap', 'x', { duration: .9, ease: 'power3' });
        var qwy = gsap.quickTo('.pxs-wall-wrap', 'y', { duration: .9, ease: 'power3' });
        var qgx = gsap.quickTo('.pxs-graph', 'x', { duration: 1.1, ease: 'power3' });
        var qgy = gsap.quickTo('.pxs-graph', 'y', { duration: 1.1, ease: 'power3' });
        var qbx = gsap.quickTo('.pxs-g1', 'x', { duration: 1.6, ease: 'power3' });
        var qby = gsap.quickTo('.pxs-g2', 'y', { duration: 1.6, ease: 'power3' });
        stage.addEventListener('pointermove', function (e) {
          if (e.pointerType === 'touch') return;
          var r = stage.getBoundingClientRect();
          var nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5;
          qx(nx * 10); qwx(nx * -26); qwy(ny * -14); qgx(nx * 12); qgy(ny * 8); qbx(nx * -60); qby(ny * -40);
        });
        stage.addEventListener('pointerleave', function () { qx(0); qwx(0); qwy(0); qgx(0); qgy(0); qbx(0); qby(0); });
        var onScroll = function () {
          var r = stage.getBoundingClientRect(), vh = window.innerHeight || 800;
          var k = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
          qwy(k * 30); qgy(k * -10); qby(k * 50);
        };
        document.body.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        state.unscroll = function () { document.body.removeEventListener('scroll', onScroll); window.removeEventListener('scroll', onScroll); };
      }

      /* pause everything while off-screen (battery) */
      if ('IntersectionObserver' in window) {
        state.io = new IntersectionObserver(function (en) {
          var vis = en[0].isIntersecting;
          loops.forEach(function (t) { vis ? t.resume() : t.pause(); });
        });
        state.io.observe(stage);
      }
    }, sec);

    /* tiles: tap selects the graph, "فتح" opens the page */
    sec.querySelector('.pxs-tiles').addEventListener('click', function (e) {
      var go = e.target.closest('.pxs-go');
      var t = e.target.closest('.pxs-tile'); if (!t) return;
      if (go && t.classList.contains('on')) { if (typeof navigate === 'function') navigate(go.dataset.go); return; }
      if (state.select && state.active !== t.dataset.k) state.ctx.add(function () { state.select(t.dataset.k, true); });
    });

    /* redraw the graph + wall on resize */
    if ('ResizeObserver' in window) {
      var lastW = stage.clientWidth;
      state.ro = new ResizeObserver(function () {
        var w = stage.clientWidth; if (Math.abs(w - lastW) < 40) return; lastW = w;
        clearTimeout(state.rt); state.rt = setTimeout(function () { if (document.getElementById('pxs')) mount(); }, 250);
      });
      state.ro.observe(stage);
    }
    /* stop when the dashboard goes away */
    clearInterval(state.gc);
    state.gc = setInterval(function () {
      if (!sec.isConnected) {
        clearInterval(state.gc);
        if (state.ctx) { try { state.ctx.revert(); } catch (e) {} state.ctx = null; }
        if (state.io) state.io.disconnect(); if (state.ro) state.ro.disconnect(); if (state.unscroll) state.unscroll();
      }
    }, 1500);
  }

  function wrap() {
    if (state.wrapped || typeof window.renderDashboard !== 'function') return;
    state.wrapped = true;
    var orig = window.renderDashboard;
    var w = function () {
      var r = orig.apply(this, arguments);
      try { if (state.unscroll) state.unscroll(); mount(); } catch (e) { console.warn('[pulse-scene]', e); }
      return r;
    };
    w._pxs = true; if (orig._ax) w._ax = true;
    window.renderDashboard = w;
  }
  window.AXPulse = { mount: mount };
  wrap();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrap);
  window.addEventListener('load', function () {
    wrap();
    if (typeof currentPage !== 'undefined' && currentPage === 'dashboard' && document.getElementById('pulse-grid') && !document.getElementById('pxs')) { try { mount(); } catch (e) {} }
  });
})();

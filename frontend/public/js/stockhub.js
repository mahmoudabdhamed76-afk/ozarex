/* ════════════════════════════════════════════════════════════════════
   ERP · مخزوني — stock hub
   ------------------------------------------------------------------
   Every number is derived from the live data (products, stockMoves,
   issuances); nothing is stored. Per item:
     balance   = product.quantity
     avgDaily  = stock pulled ("out" moves) in the last 30 days ÷ 30
     coverage  = balance ÷ avgDaily  → a concrete "يكفي لحد" date
     state     = نفد / حرج (<7 يوم) / قرب يخلص (<21) / مستقر / مفيش سحب
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var WIN = 30;                     // consumption window (days)
  var st = { cat: 'all', q: '', sort: 'cover', tab: 'stock' };

  /* ── helpers ── */
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function cur() { return (D().settings && D().settings.currency) || 'ج'; }
  function num(n, dec) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: dec == null ? 0 : dec }); }
  function qty(n) { return num(n, Math.abs(n) < 10 && n % 1 ? 1 : 0); }
  function money(n) { return num(n) + ' ' + cur(); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function parseD(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isAdj(m) { return /^(تسوية جرد|عهدة|رد عهدة)/.test(String(m.reference || m.note || '')); }   // stocktake corrections are not consumption
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function daysSince(s) { return Math.round((today0() - parseD(s)) / 864e5); }
  function dayMonth(d) {
    try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' }).format(d); }
    catch (e) { return d.getDate() + '/' + (d.getMonth() + 1); }
  }
  function weekday(d) {
    try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long' }).format(d); } catch (e) { return ''; }
  }

  /* ── categories ── */
  var CATS = [
    { k: 'ink',     label: 'حبر',       tint: 'ink',    re: /حبر|تونر|تنر|ink|toner|خرطوش/ },
    { k: 'chem',    label: 'كيماويات',  tint: 'ok',     re: /كيماو|مظهر|مثبت|محلول|developer|fixer|chem/ },
    { k: 'spare',   label: 'قطع غيار',  tint: 'misc',   re: /قطع غيار|قطعة غيار|spare|part|درام|drum|فيوزر|fuser|ترس|موتور|بلية|سنسور|sensor|رأس طباعة|هيد|لمبة|فلتر|filter|صيانة|بكرة/ },
    { k: 'thermal', label: 'حراري',     tint: 'warn',   re: /حرار|thermal|كاشير|رول/ },
    { k: 'photo',   label: 'فوتو',      tint: 'pink',   re: /فوتو|photo|لامع|glossy|مط/ },
    { k: 'plastic', label: 'بلاستك',    tint: 'violet', re: /بلاستك|بلاستيك|plastic|تغليف|جراب|سلوفان|لامينيشن|laminat/ },
    { k: 'film',    label: 'أفلام',     tint: 'teal',   re: /فيلم|أفلام|افلام|film|x-?ray|اشعة|أشعة/ },
    { k: 'paper',   label: 'ورق',       tint: 'blue',   re: /ورق|paper|a4|a3|a5|b4|b5|فرخ|ريم|رزمة|كوشيه|دشت/ },
    { k: 'misc',    label: 'أخرى',      tint: 'misc',   re: /$^/ }
  ];
  var CAT = {}; CATS.forEach(function (c) { CAT[c.k] = c; });
  function classify(p) {
    var n = (String(p.name || '') + ' ' + String(p.type || '')).toLowerCase();
    for (var i = 0; i < CATS.length - 1; i++) if (CATS[i].re.test(n)) return CATS[i].k;
    return 'misc';
  }
  var ICO = {
    paper:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    thermal: '<path d="M6 3h12v16l-2-1.5L14 19l-2-1.5-2 1.5-2-1.5L6 19z"/><path d="M9 8h6M9 12h6"/>',
    photo:   '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 15-5-5-8 9"/>',
    plastic: '<path d="M7 4h10l2 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z"/><path d="M5 8h14"/>',
    film:    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M16 3v18M4 8h4M4 13h4M4 18h4M16 8h4M16 13h4M16 18h4"/>',
    chem:    '<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7 15h10"/>',
    ink:     '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    spare:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    misc:    '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>'
  };
  function icon(k, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICO[k] || ICO.misc) + '</svg>'; }
  var I = {
    in:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    out:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>'
  };

  var STATE = {
    empty: { label: 'نفد',        tone: 'bad',  rank: 0 },
    crit:  { label: 'حرج',        tone: 'bad',  rank: 1 },
    low:   { label: 'قرب يخلص',   tone: 'warn', rank: 2 },
    ok:    { label: 'مستقر',      tone: 'ok',   rank: 3 },
    idle:  { label: 'مفيش سحب',   tone: 'idle', rank: 4 }
  };

  /* ── model ── */
  function model() {
    var t0 = today0(), from = lds(addDays(t0, -(WIN - 1)));
    var outs = {}, lastMove = {}, series = {};
    A('stockMoves').forEach(function (m) {
      if (!m || !m.productId) return;
      var d = String(m.date || '').slice(0, 10);
      if (!lastMove[m.productId] || d > lastMove[m.productId]) lastMove[m.productId] = d;
      if (m.type !== 'out' || d < from || isAdj(m)) return;
      outs[m.productId] = (outs[m.productId] || 0) + Number(m.quantity || 0);
    });
    var items = A('products').map(function (p) {
      var bal = Number(p.quantity || 0), pulled = outs[p.id] || 0, avg = pulled / WIN;
      var cover = avg > 0 ? Math.max(0, bal) / avg : Infinity;
      var s = bal <= 0 ? 'empty' : avg <= 0 ? 'idle' : cover < 7 ? 'crit' : cover < 21 ? 'low' : 'ok';
      var min = Number(p.minQuantity || 0);
      return {
        p: p, id: p.id, name: p.name || '—', unit: p.unit || 'ورقة', cat: classify(p),
        bal: bal, pulled: pulled, avg: avg, cover: cover, state: s,
        until: isFinite(cover) ? addDays(t0, Math.floor(cover)) : null,
        belowMin: min > 0 && bal <= min, min: min,
        value: Math.max(0, bal) * Number(p.cost || p.price || 0),
        pulledValue: pulled * Number(p.price || p.cost || 0),
        last: lastMove[p.id] || ''
      };
    });
    return { items: items, from: from };
  }

  function coverText(it) {
    if (it.state === 'empty') return 'الرصيد خلص';
    if (!isFinite(it.cover)) return 'مفيش سحب آخر ' + WIN + ' يوم';
    if (it.cover < 1) return 'يخلص النهارده';
    var d = Math.floor(it.cover);
    return 'يكفي ' + (d > 365 ? 'أكتر من سنة' : d + ' يوم') + (d <= 365 ? ' · لحد ' + dayMonth(it.until) : '');
  }

  /* rounded-square "fuel" ring: the stroke shortens as the share of healthy items drops */
  function ring(pct, size) {
    size = size || 132;
    var r = size * 0.28, sw = size * 0.085, o = sw / 2 + 1, w = size - 2 * o;
    return '<svg class="skh-ring" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<rect x="' + o + '" y="' + o + '" width="' + w + '" height="' + w + '" rx="' + r + '" class="skh-ring-bg" style="stroke-width:' + sw + '"/>' +
      '<rect x="' + o + '" y="' + o + '" width="' + w + '" height="' + w + '" rx="' + r + '" pathLength="100" class="skh-ring-fg" ' +
      'style="stroke-width:' + sw + ';stroke-dasharray:' + Math.max(0.01, pct).toFixed(1) + ' 100"/></svg>';
  }

  /* ── page ── */
  function renderStockHub() {
    var root = document.getElementById('page-content');
    if (!root) return;
    var M = model(), items = M.items;
    var tracked = items.filter(function (x) { return x.state !== 'idle'; });
    var healthy = tracked.filter(function (x) { return x.state === 'ok'; }).length;
    var pct = tracked.length ? healthy / tracked.length * 100 : 100;
    var totalValue = items.reduce(function (s, x) { return s + x.value; }, 0);
    var pulledValue = items.reduce(function (s, x) { return s + x.pulledValue; }, 0);
    var urgent = items.filter(function (x) { return x.state === 'empty' || x.state === 'crit'; })
      .sort(function (a, b) { return a.cover - b.cover; });
    var soon = items.filter(function (x) { return x.state !== 'empty' && isFinite(x.cover); }).sort(function (a, b) { return a.cover - b.cover; })[0];
    var below = items.filter(function (x) { return x.belowMin; }).length;
    var counts = {}; items.forEach(function (x) { counts[x.cat] = (counts[x.cat] || 0) + 1; });

    var headline = !items.length ? 'ضيف أول صنف من صفحة المخازن'
      : soon ? '<span>أقرب صنف هيخلص</span><b>' + esc(soon.name) + '</b><em>' + (soon.cover < 1 ? 'النهارده' : weekday(soon.until) + ' ' + dayMonth(soon.until) + ' · بعد ' + Math.floor(soon.cover) + ' يوم') + '</em>'
      : '<span>المخزون مستقر</span><b>مفيش صنف قرب يخلص</b><em>على معدل السحب آخر ' + WIN + ' يوم</em>';

    var due = window.AXCount ? AXCount.dueCount() : 0;
    var head =
      '<div class="page-header skh-head"><div><h2 class="page-title">مخزوني وجرد</h2>' +
        '<p class="page-subtitle">رصيد كل صنف، بيكفي لإمتى، مين بيسحب منه — وجرد ذكي يقولك تعدّ إيه الأول</p></div>' +
        '<div class="page-actions">' +
          '<button class="btn btn-secondary" onclick="openStockMoveForm(null,\'in\')">' + I.in + ' وارد</button>' +
          '<button class="btn btn-primary" onclick="openIssuanceForm()">' + I.send + ' صرف لمركز</button>' +
        '</div></div>' +
      '<div id="skh-ticker" class="axtk-host"></div>' +
      '<div class="skh-tabs" role="tablist" aria-label="أقسام الصفحة">' +
        '<button role="tab" aria-selected="' + (['count', 'custody', 'po'].indexOf(st.tab) < 0) + '" class="' + (['count', 'custody', 'po'].indexOf(st.tab) < 0 ? 'on' : '') + '" onclick="AXStock.tab(\'stock\')">' + icon('misc') + '<span>المخزون</span></button>' +
        '<button role="tab" aria-selected="' + (st.tab === 'count') + '" class="' + (st.tab === 'count' ? 'on' : '') + '" onclick="AXStock.tab(\'count\')">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>' +
          '<span>الجرد الذكي</span>' + (due ? '<em>' + due + '</em>' : '') + '</button>' +
        '<button role="tab" aria-selected="' + (st.tab === 'custody') + '" class="' + (st.tab === 'custody' ? 'on' : '') + '" onclick="AXStock.tab(\'custody\')">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1zM10 5h4v2h-4z"/><path d="M3 13h18"/></svg>' +
          '<span>عهدتي</span>' + (window.AXCustody && AXCustody.openCount() ? '<em class="n">' + AXCustody.openCount() + '</em>' : '') + '</button>' +
        (window.AXPO ? '<button role="tab" aria-selected="' + (st.tab === 'po') + '" class="' + (st.tab === 'po' ? 'on' : '') + '" onclick="AXStock.tab(\'po\')">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6"/></svg>' +
          '<span>طلب شراء</span>' + (function () { var n = AXPO.needCount(); return n ? '<em>' + n + '</em>' : ''; })() + '</button>' : '') +
      '</div>';
    if (st.tab === 'po' && window.AXPO) {
      root.innerHTML = head + '<div id="po-root"></div>';
      st._items = items;
      ticker(items);
      AXPO.render(document.getElementById('po-root'));
      return;
    }
    if (st.tab === 'custody' && window.AXCustody) {
      root.innerHTML = head + '<div id="cus-root"></div>';
      st._items = items;
      ticker(items);
      AXCustody.render(document.getElementById('cus-root'));
      return;
    }
    if (st.tab === 'count' && window.AXCount) {
      root.innerHTML = head + '<div id="skc-root"></div>';
      st._items = items;
      ticker(items);
      AXCount.render(document.getElementById('skc-root'));
      return;
    }

    root.innerHTML = head +
      '<section class="skh-hero">' +
        '<div class="skh-hero-ring">' + ring(pct) +
          '<div class="skh-ring-c"><b>' + Math.round(pct) + '%</b><span>أصناف مستقرة</span></div></div>' +
        '<div class="skh-hero-main">' +
          '<div class="skh-hero-head">' + headline + '</div>' +
          '<div class="skh-hero-figs">' +
            '<div><span>قيمة المخزون</span><b>' + num(totalValue) + '</b><small>' + esc(cur()) + '</small></div>' +
            '<div><span>المسحوب آخر ' + WIN + ' يوم</span><b>' + num(pulledValue) + '</b><small>' + esc(cur()) + '</small></div>' +
            '<div><span>قربت تخلص</span><b>' + urgent.length + '</b><small>صنف</small></div>' +
            '<div><span>تحت الحد الأدنى</span><b>' + below + '</b><small>صنف</small></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      (urgent.length ? '<div class="skh-alerts">' + I.alert + '<div class="skh-alerts-list">' + urgent.slice(0, 6).map(function (x) {
        return '<button class="skh-alert" onclick="AXStock.detail(\'' + esc(x.id) + '\')"><b>' + esc(x.name) + '</b><span>' +
          (x.state === 'empty' ? 'نفد' : coverText(x)) + '</span></button>';
      }).join('') + '</div></div>' : '') +

      '<div class="skh-controls">' +
        '<div class="skh-chips" role="tablist" aria-label="الأقسام">' +
          chip('all', 'الكل', items.length, 'all') +
          CATS.filter(function (c) { return counts[c.k]; }).map(function (c) { return chip(c.k, c.label, counts[c.k], c.tint); }).join('') +
        '</div>' +
        '<div class="skh-tools">' +
          '<label class="skh-search">' + I.search + '<input id="skh-q" type="search" placeholder="دوّر على صنف…" value="' + esc(st.q) + '" oninput="AXStock.search(this.value)"></label>' +
          '<div class="ax-seg skh-sort" role="tablist" aria-label="الترتيب">' +
            [['cover', 'الأقرب للنفاد'], ['pulled', 'الأكثر سحب'], ['value', 'الأعلى قيمة']].map(function (o) {
              return '<button role="tab" aria-selected="' + (st.sort === o[0]) + '" class="' + (st.sort === o[0] ? 'on' : '') + '" onclick="AXStock.sort(\'' + o[0] + '\')">' + o[1] + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="skh-grid" class="skh-grid"></div>' +

      '<div class="skh-row">' +
        '<div class="dash-card skh-card"><div class="dash-card-header"><div class="dash-card-title">حركة السحب اليومية</div><div class="skh-note">قيمة المسحوب · آخر ' + WIN + ' يوم</div></div>' +
          '<div id="skh-trend"></div><div id="skh-trend-table"></div></div>' +
        '<div class="dash-card skh-card"><div class="dash-card-header"><div class="dash-card-title">المراكز الأكثر سحباً</div><div class="skh-note">آخر ' + WIN + ' يوم</div></div>' +
          centers(M.from) + '</div>' +
      '</div>' +

      '<div class="dash-card skh-card"><div class="dash-card-header"><div class="dash-card-title">آخر الحركات</div>' +
        '<button class="skh-link" onclick="navigate(\'inventory\')">كل الحركات ' + I.more + '</button></div>' + feed(A('stockMoves'), 10) + '</div>';

    st._items = items;
    grid();
    trend(M.from);
    ticker(items);
  }

  /* شريط النبض on top of the page: every item (most urgent first) + today's in/out, plus the latest stock activity */
  function ticker(items) {
    var host = document.getElementById('skh-ticker');
    if (!host || !window.AXTicker) return;
    var S = D().settings || {};
    if (S.tickerPages === false) { host.remove(); return; }
    var today = lds(today0()), net = {};
    A('stockMoves').forEach(function (m) {
      if (String(m.date || '').slice(0, 10) === today) net[m.productId] = (net[m.productId] || 0) + (m.type === 'in' ? 1 : -1) * Number(m.quantity || 0);
    });
    var list = items.slice().sort(function (a, b) { return STATE[a.state].rank - STATE[b.state].rank || a.cover - b.cover; }).map(function (x) {
      var n = net[x.id] || 0, tone = STATE[x.state].tone;
      return {
        key: 'sk-' + x.id, label: x.name, value: qty(x.bal) + ' ' + x.unit,
        level: tone === 'idle' ? 'info' : tone, go: 'stock', sub: coverText(x),
        delta: n ? { dir: n > 0 ? 'up' : 'down', text: qty(Math.abs(n)), good: n > 0, hint: 'حركة النهارده' } : null
      };
    });
    if (S.tickerEvents !== false) {
      var ev = AXTicker.events(8).filter(function (e) { return e.icon === 'in' || e.icon === 'iss'; });
      list = list.concat(ev);
    }
    AXTicker.create(host, { id: 'stock', variant: 'bar', label: 'شريط المخزون المتحرك', items: list,
      onItem: function (k) { if (k.indexOf('sk-') === 0) { detail(k.slice(3)); return true; } } });
  }

  function chip(k, label, n, tint) {
    return '<button role="tab" aria-selected="' + (st.cat === k) + '" class="skh-chip t-' + tint + (st.cat === k ? ' on' : '') + '" onclick="AXStock.cat(\'' + k + '\')">' +
      (k !== 'all' ? '<i>' + icon(k) + '</i>' : '') + '<span>' + label + '</span><em>' + n + '</em></button>';
  }

  function grid() {
    var box = document.getElementById('skh-grid'); if (!box) return;
    var q = st.q.trim().toLowerCase();
    var list = (st._items || []).filter(function (x) {
      return (st.cat === 'all' || x.cat === st.cat) && (!q || (x.name + ' ' + (x.p.type || '')).toLowerCase().indexOf(q) >= 0);
    });
    list.sort(st.sort === 'value' ? function (a, b) { return b.value - a.value; }
      : st.sort === 'pulled' ? function (a, b) { return b.pulledValue - a.pulledValue; }
      : function (a, b) { return STATE[a.state].rank - STATE[b.state].rank || a.cover - b.cover || a.name.localeCompare(b.name, 'ar'); });
    if (!list.length) {
      box.innerHTML = '<div class="skh-empty">' + icon('misc') + '<b>' + ((st._items || []).length ? 'مفيش أصناف مطابقة' : 'لسه مفيش أصناف') + '</b>' +
        '<span>' + ((st._items || []).length ? 'جرّب قسم تاني أو كلمة بحث مختلفة' : 'ضيف الأصناف من صفحة المخازن وهتظهر هنا') + '</span></div>';
      return;
    }
    box.innerHTML = list.map(card).join('');
  }

  function card(x) {
    var c = CAT[x.cat], S = STATE[x.state];
    var fill = x.state === 'empty' ? 0 : !isFinite(x.cover) ? 100 : Math.max(4, Math.min(100, x.cover / 60 * 100));
    return '<article class="skh-item s-' + S.tone + '">' +
      '<header><span class="skh-ico t-' + c.tint + '">' + icon(x.cat) + '</span>' +
        '<div class="skh-item-t"><b title="' + esc(x.name) + '">' + esc(x.name) + '</b><span>' + c.label + (x.p.type && x.p.type !== c.label ? ' · ' + esc(x.p.type) : '') + '</span></div>' +
        '<span class="skh-state s-' + S.tone + '"><i></i>' + S.label + '</span></header>' +
      '<div class="skh-bal"><b>' + qty(x.bal) + '</b><span>' + esc(x.unit) + '</span>' +
        (x.belowMin ? '<em class="skh-min">تحت الحد (' + qty(x.min) + ')</em>' : '') + '</div>' +
      '<div class="skh-cover"><div class="skh-bar"><i style="width:' + fill.toFixed(0) + '%"></i></div>' +
        '<span>' + coverText(x) + '</span></div>' +
      '<dl class="skh-meta"><div><dt>سحب يومي</dt><dd>' + (x.avg ? qty(x.avg) : '—') + '</dd></div>' +
        '<div><dt>سحب ' + WIN + ' يوم</dt><dd>' + qty(x.pulled) + '</dd></div>' +
        '<div><dt>القيمة</dt><dd>' + num(x.value) + '</dd></div></dl>' +
      '<footer>' +
        '<button onclick="openStockMoveForm(\'' + esc(x.id) + '\',\'in\')">' + I.in + 'وارد</button>' +
        '<button onclick="openIssuanceForm(null,\'' + esc(x.id) + '\')">' + I.send + 'صرف</button>' +
        '<button class="skh-more" onclick="AXStock.detail(\'' + esc(x.id) + '\')">تفاصيل' + I.more + '</button>' +
      '</footer></article>';
  }

  /* daily pulled value, oldest → newest */
  function trend(from) {
    var host = document.getElementById('skh-trend'); if (!host || !window.AXChart) return;
    var t0 = today0(), labels = [], vals = [], idx = {}, price = {};
    A('products').forEach(function (p) { price[p.id] = Number(p.price || p.cost || 0); });
    for (var i = WIN - 1; i >= 0; i--) { var d = addDays(t0, -i); idx[lds(d)] = labels.length; labels.push(d.getDate() + '/' + (d.getMonth() + 1)); vals.push(0); }
    var cnt = vals.map(function () { return 0; });
    A('stockMoves').forEach(function (m) {
      var k = String(m.date || '').slice(0, 10);
      if (m.type === 'out' && !isAdj(m) && idx[k] != null) { vals[idx[k]] += Number(m.quantity || 0) * (price[m.productId] || 0); cnt[idx[k]]++; }
    });
    AXChart.line(host, {
      labels: labels, height: window.innerWidth < 700 ? 190 : 220, title: 'قيمة المسحوب يومياً',
      series: [{ name: 'قيمة المسحوب', values: vals, color: 'var(--ax-teal)' }],
      fmt: function (v) { return num(v); },
      detail: function (i) { return [['عدد حركات الصرف', String(cnt[i]), null]]; }
    });
    var tb = document.getElementById('skh-trend-table');
    if (tb) tb.innerHTML = AXChart.table(labels, [{ name: 'قيمة المسحوب', values: vals }], num);
  }

  function centers(from) {
    var by = {};
    A('issuances').forEach(function (s) {
      var d = String(s.date || '').slice(0, 10);
      var k = s.customerId || s.customerName; if (!k) return;
      var o = by[k] || (by[k] = { id: s.customerId, name: s.customerName || '', qty: 0, total: 0, last: '', n: 0 });
      if (!o.last || d > o.last) o.last = d;
      if (d >= from) { o.qty += Number(s.quantity || 0); o.total += Number(s.total || 0); o.n++; }
    });
    var cust = {}; A('customers').forEach(function (c) { cust[c.id] = c.name; });
    var list = Object.keys(by).map(function (k) { var o = by[k]; if (cust[o.id]) o.name = cust[o.id]; return o; })
      .filter(function (o) { return o.total > 0 || o.qty > 0; })
      .sort(function (a, b) { return b.total - a.total || b.qty - a.qty; }).slice(0, 7);
    if (!list.length) return '<div class="skh-empty sm"><span>مفيش صرف للمراكز آخر ' + WIN + ' يوم</span></div>';
    var max = list[0].total || list[0].qty || 1;
    return '<ol class="skh-centers">' + list.map(function (o) {
      var ago = o.last ? daysSince(o.last) : null;
      var w = Math.max(3, (o.total || o.qty) / max * 100);
      return '<li><div class="skh-c-top"><b>' + esc(o.name || '—') + '</b><strong>' + num(o.total) + ' <small>' + esc(cur()) + '</small></strong></div>' +
        '<div class="skh-hbar"><i style="width:' + w.toFixed(0) + '%"></i></div>' +
        '<div class="skh-c-sub"><span>' + o.n + ' مرة صرف · ' + qty(o.qty) + ' ورقة</span>' +
        (ago == null ? '' : '<span class="' + (ago > 20 ? 'late' : '') + '">' + (ago === 0 ? 'سحب النهارده' : ago === 1 ? 'سحب امبارح' : 'بقاله ' + ago + ' يوم') + '</span>') +
        '</div></li>';
    }).join('') + '</ol>';
  }

  function feed(moves, n, withName) {
    var pn = {}; A('products').forEach(function (p) { pn[p.id] = p; });
    var list = moves.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0);
    }).slice(0, n);
    if (!list.length) return '<div class="skh-empty sm"><span>مفيش حركات لسه</span></div>';
    return '<ul class="skh-feed">' + list.map(function (m) {
      var p = pn[m.productId] || {}, inn = m.type === 'in';
      var d = String(m.date || '').slice(0, 10), ago = d ? daysSince(d) : null;
      return '<li class="' + (inn ? 'in' : 'out') + '"><span class="skh-f-ico">' + (inn ? I.in : I.out) + '</span>' +
        '<div class="skh-f-t"><b>' + (withName === false ? (inn ? 'وارد' : 'صرف') : esc(p.name || 'صنف محذوف')) + '</b>' +
        '<span>' + esc(m.reference || m.note || (inn ? 'وارد للمخزن' : 'صرف من المخزن')) + '</span></div>' +
        '<div class="skh-f-v"><b>&lrm;' + (inn ? '+' : '−') + qty(m.quantity) + '</b><span>' + (ago === 0 ? 'النهارده' : ago === 1 ? 'امبارح' : d) + '</span></div></li>';
    }).join('') + '</ul>';
  }

  /* ── item detail ── */
  function detail(id) {
    var M = model(), x = M.items.find(function (i) { return i.id === id; });
    if (!x) return;
    var c = CAT[x.cat], S = STATE[x.state], t0 = today0();
    var labels = [], vals = [], idx = {};
    for (var i = WIN - 1; i >= 0; i--) { var d = addDays(t0, -i); idx[lds(d)] = labels.length; labels.push(d.getDate() + '/' + (d.getMonth() + 1)); vals.push(0); }
    var moves = A('stockMoves').filter(function (m) { return m.productId === id; });
    moves.forEach(function (m) { var k = String(m.date || '').slice(0, 10); if (m.type === 'out' && !isAdj(m) && idx[k] != null) vals[idx[k]] += Number(m.quantity || 0); });
    var who = {};
    A('issuances').forEach(function (s) {
      if (s.productId !== id || String(s.date || '') < lds(addDays(t0, -89))) return;
      var k = s.customerName || '—'; who[k] = (who[k] || 0) + Number(s.quantity || 0);
    });
    var top = Object.keys(who).map(function (k) { return [k, who[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);

    var body =
      '<div class="skh-d">' +
        '<div class="skh-d-head"><span class="skh-ico lg t-' + c.tint + '">' + icon(x.cat) + '</span>' +
          '<div><b>' + esc(x.name) + '</b><span>' + c.label + ' · ' + esc(x.unit) + '</span></div>' +
          '<span class="skh-state s-' + S.tone + '"><i></i>' + S.label + '</span></div>' +
        '<div class="skh-d-figs">' +
          '<div><span>الرصيد</span><b>' + qty(x.bal) + '</b><small>' + esc(x.unit) + '</small></div>' +
          '<div><span>سحب يومي</span><b>' + (x.avg ? qty(x.avg) : '—') + '</b><small>متوسط ' + WIN + ' يوم</small></div>' +
          '<div><span>يكفي</span><b>' + (isFinite(x.cover) ? (x.cover > 365 ? '+365' : Math.floor(x.cover)) : '∞') + '</b><small>' + (x.until && x.cover <= 365 ? 'لحد ' + dayMonth(x.until) : 'يوم') + '</small></div>' +
          '<div><span>القيمة</span><b>' + num(x.value) + '</b><small>' + esc(cur()) + '</small></div>' +
        '</div>' +
        (x.belowMin ? '<div class="skh-d-warn">' + I.alert + '<span>الرصيد تحت الحد الأدنى (' + qty(x.min) + ' ' + esc(x.unit) + ') — محتاج طلبية.</span></div>' : '') +
        '<h4>السحب اليومي — آخر ' + WIN + ' يوم</h4><div id="skh-d-chart"></div>' +
        '<div class="skh-d-cols">' +
          '<div><h4>مين بيسحب (90 يوم)</h4>' + (top.length ? '<ol class="skh-mini">' + top.map(function (t) {
            return '<li><span>' + esc(t[0]) + '</span><b>' + qty(t[1]) + ' ' + esc(x.unit) + '</b></li>'; }).join('') + '</ol>' : '<div class="skh-empty sm"><span>مفيش صرف للمراكز</span></div>') + '</div>' +
          '<div><h4>آخر الحركات</h4>' + feed(moves, 6, false) + '</div>' +
        '</div>' +
      '</div>';
    openModal('تفاصيل الصنف', body,
      '<button class="btn btn-primary" onclick="closeModal();openIssuanceForm(null,\'' + esc(id) + '\')">صرف لمركز</button>' +
      '<button class="btn btn-secondary" onclick="closeModal();openStockMoveForm(\'' + esc(id) + '\',\'in\')">وارد</button>' +
      '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>', 'large');
    setTimeout(function () {
      var h = document.getElementById('skh-d-chart');
      if (h && window.AXChart) AXChart.line(h, {
        labels: labels, height: 180, title: 'السحب اليومي من ' + x.name,
        series: [{ name: 'المسحوب (' + x.unit + ')', values: vals, color: 'var(--ax-teal)' }], fmt: function (v) { return qty(v); }
      });
    }, 60);
  }

  window.AXStock = {
    detail: detail,
    tab: function (t) { st.tab = t; renderStockHub(); var pc = document.getElementById('page-content'); if (pc) pc.scrollTop = 0; },
    model: model, classify: classify, CATS: CATS, CAT: CAT, icon: icon, qty: qty, money: money, num: num,
    cat: function (k) { st.cat = k; document.querySelectorAll('.skh-chip').forEach(function (b) {
      var on = b.getAttribute('onclick').indexOf("'" + k + "'") > 0; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); grid(); },
    sort: function (k) { st.sort = k; document.querySelectorAll('.skh-sort button').forEach(function (b) {
      var on = b.getAttribute('onclick').indexOf("'" + k + "'") > 0; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); grid(); },
    search: function (v) { st.q = v || ''; grid(); }
  };
  window.renderStockHub = renderStockHub;

  /* keep the hub live when a stock move / issuance is saved while it is open */
  function onStock() { return typeof currentPage !== 'undefined' && currentPage === 'stock'; }
  ['renderInventory', 'renderIssuances'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== 'function' || orig._skh) return;
    var w = function () { if (onStock()) return renderStockHub(); return orig.apply(this, arguments); };
    w._skh = true;
    window[fn] = w;
  });
})();

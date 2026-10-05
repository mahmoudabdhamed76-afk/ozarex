/* ════════════════════════════════════════════════════════════════════
   ERP · شريط النبض — Live Ticker (infinite marquee)
   ------------------------------------------------------------------
   AXTicker.create(host, { id, items, variant: 'embed'|'bar', label })
     item = { key, kind: 'metric'|'event', label, value, level: ok|warn|bad|info,
              delta: { dir: 'up'|'down', text, good: bool, hint } | null,
              html (events), sub, icon, go (page to open) }
   · moves continuously (speed from Settings: بطيء / عادي / سريع)
   · hover, focus or touch → glides to a stop; drag it left/right to scrub;
     tap an item → opens its page
   · items whose value changed since the last render flash once
   · pauses off-screen / in background tabs; reduced-motion → manual scroll
   AXTicker.events(n)  → the latest activity (تحصيل، صرف، وارد، مصروف…)
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var SPEEDS = { slow: 26, normal: 48, fast: 84 };           // px per second
  var live = [];                                              // mounted tickers
  var prev = {};                                              // id → { key: value } for change flashes

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function S() { var d = D(); return d.settings || {}; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n) { return Math.round(Number(n || 0)).toLocaleString('en-US'); }
  function cur() {
    var c = S().currency || 'جنيه';
    return c === 'جنيه' ? 'ج.م' : c === 'ريال' ? 'ر.س' : c === 'درهم' ? 'د.إ' : String(c).slice(0, 3);
  }
  function money(n) { return num(n) + ' ' + cur(); }
  function speed() { return SPEEDS[S().tickerSpeed] || SPEEDS.normal; }
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* ── relative time, Egyptian Arabic ── */
  function plural(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : (n <= 10 ? n + ' ' + few : n + ' ' + many); }
  function ago(ts, dateStr) {
    var t = Number(ts) || 0;
    if (!t && dateStr) { var p = String(dateStr).split('-'); t = new Date(+p[0], +p[1] - 1, +p[2], 12).getTime(); }
    if (!t) return '';
    var s = (Date.now() - t) / 1000;
    if (s < 60) return 'من لحظات';
    var m = Math.floor(s / 60); if (m < 60) return 'من ' + plural(m, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة');
    var h = Math.floor(m / 60); if (h < 24) return 'من ' + plural(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    var d = Math.floor(h / 24); if (d === 1) return 'امبارح';
    return 'من ' + plural(d, 'يوم', 'يومين', 'أيام', 'يوم');
  }

  /* ── latest activity from the app's own data ── */
  var EV_ICON = {
    pay:   '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    iss:   '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    in:    '<path d="M12 19V5M5 12l7-7 7 7"/>',
    exp:   '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/>',
    sup:   '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>',
    inv:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'
  };
  function events(n) {
    var list = [], cust = {}, prod = {}, sup = {};
    A('customers').forEach(function (c) { cust[c.id] = c.name; });
    A('products').forEach(function (p) { prod[p.id] = p; });
    A('suppliers').forEach(function (s) { sup[s.id] = s.name; });
    function push(o, when, date) { o.t = Number(when) || (date ? new Date(date + 'T12:00:00').getTime() : 0); o.when = ago(when, date); list.push(o); }
    A('payments').forEach(function (p) {
      push({ key: 'ev-pay-' + p.id, kind: 'event', icon: 'pay', tone: 'ok', go: 'payments',
        html: 'آخر تحصيل <b>' + esc(money(p.amount)) + '</b> من ' + esc(p.customerName || cust[p.customerId] || 'عميل') }, p.createdAt, p.date);
    });
    A('issuances').forEach(function (i) {
      var u = i.unit || (prod[i.productId] || {}).unit || '';
      push({ key: 'ev-iss-' + i.id, kind: 'event', icon: 'iss', tone: 'info', go: 'issuances',
        html: 'آخر صرف <b>' + esc(num(i.quantity) + ' ' + u) + '</b> ' + esc(i.productName || (prod[i.productId] || {}).name || '') + ' لـ ' + esc(i.customerName || cust[i.customerId] || '') }, i.createdAt, i.date);
    });
    A('stockMoves').forEach(function (m) {
      if (m.type !== 'in') return;
      var p = prod[m.productId] || {};
      push({ key: 'ev-in-' + m.id, kind: 'event', icon: 'in', tone: 'ok', go: 'stock',
        html: 'آخر وارد <b>' + esc(num(m.quantity) + ' ' + (p.unit || '')) + '</b> ' + esc(p.name || '') }, m.createdAt, m.date);
    });
    A('expenses').forEach(function (e) {
      if (e.kind === 'purchase') return;
      push({ key: 'ev-exp-' + e.id, kind: 'event', icon: 'exp', tone: 'warn', go: 'expenses',
        html: 'آخر مصروف <b>' + esc(money(e.amount)) + '</b> ' + esc(e.category || e.description || '') }, e.createdAt, e.date);
    });
    A('supplierPayments').forEach(function (p) {
      push({ key: 'ev-sup-' + p.id, kind: 'event', icon: 'sup', tone: 'info', go: 'suppliers',
        html: 'آخر سداد لمورد <b>' + esc(money(p.amount)) + '</b> ' + esc(sup[p.supplierId] || '') }, p.createdAt, p.date);
    });
    A('invoices').forEach(function (i) {
      if (i.sourceIssuance || i.sourceIssuanceId) return;
      push({ key: 'ev-inv-' + i.id, kind: 'event', icon: 'inv', tone: 'info', go: 'invoices',
        html: 'آخر فاتورة <b>#' + esc(i.number) + ' · ' + esc(money(i.total)) + '</b> ' + esc(cust[i.customerId] || '') }, i.createdAt, i.date);
    });
    list.sort(function (a, b) { return b.t - a.t; });
    // one of each kind first, so a busy day of payments doesn't hide everything else
    var seen = {}, out = [];
    list.forEach(function (e) { if (!seen[e.icon] && out.length < n) { seen[e.icon] = 1; out.push(e); } });
    return out;
  }

  /* ── markup ── */
  function svg(path) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'; }
  function itemHTML(it, copy) {
    var tab = copy ? ' tabindex="-1"' : '';
    var go = it.go ? ' data-go="' + esc(it.go) + '"' : '';
    if (it.kind === 'event') {
      return '<button type="button" class="axtk-ev tone-' + (it.tone || 'info') + '" data-k="' + esc(it.key) + '"' + go + tab + '>' +
        '<span class="axtk-ei">' + svg(EV_ICON[it.icon] || EV_ICON.inv) + '</span>' +
        '<span class="axtk-et">' + it.html + '</span>' + (it.when ? '<small>' + esc(it.when) + '</small>' : '') + '</button>';
    }
    var d = it.delta;
    return '<button type="button" class="axtk-it lv-' + (it.level || 'info') + '" data-k="' + esc(it.key) + '"' + go + tab +
      (d && d.hint ? ' title="' + esc(d.hint) + '"' : '') + '>' +
      '<i class="axtk-dot"></i><em>' + esc(it.label) + '</em><b>' + esc(it.value) + '</b>' +
      (d ? '<span class="axtk-d ' + (d.good ? 'good' : 'bad') + '">' + (d.dir === 'up' ? '▲' : '▼') + ' ' + esc(d.text) + '</span>'
         : '<span class="axtk-d flat">▾</span>') +
      (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</button>';
  }
  function groupHTML(items, copy) {
    return '<div class="axtk-group"' + (copy ? ' aria-hidden="true"' : '') + '>' +
      items.map(function (it) { return itemHTML(it, copy) + '<i class="axtk-sep" aria-hidden="true"></i>'; }).join('') + '</div>';
  }

  /* ── component ── */
  function create(host, opts) {
    if (!host) return null;
    if (host._axtk) host._axtk.destroy();
    opts = opts || {};
    var id = opts.id || 'tk', items = (opts.items || []).filter(Boolean);
    if (!items.length) { host.innerHTML = ''; return null; }
    var variant = opts.variant || 'bar';
    host.innerHTML =
      '<div class="axtk axtk--' + variant + '" role="region" aria-roledescription="شريط متحرك" aria-label="' + esc(opts.label || 'شريط النبض') + '">' +
        '<div class="axtk-view"><div class="axtk-track">' + groupHTML(items, false) + '</div></div>' +
        (variant === 'bar' ? '<span class="axtk-live" aria-hidden="true"><i></i>مباشر</span>' : '') +
      '</div>';
    var root = host.firstChild, view = root.querySelector('.axtk-view'), track = root.querySelector('.axtk-track');
    var first = track.firstChild;
    var T = { host: host, id: id, root: root, G: 0, pos: 0, v: 0, target: 0, visible: true, hover: false, focus: false, hold: false, dead: false };

    function measure() {
      var G = first.getBoundingClientRect().width;
      if (!G) return;
      T.G = G;
      var need = Math.max(2, Math.ceil(view.clientWidth / G) + 1);
      var have = track.children.length;
      for (var i = have; i < need; i++) track.insertAdjacentHTML('beforeend', groupHTML(items, true));
      while (track.children.length > need) track.removeChild(track.lastChild);
    }
    function wantMove() { return !reduced() && !T.hover && !T.focus && !T.hold && T.visible && !document.hidden; }
    function retarget() { T.target = wantMove() ? speed() : 0; }
    T.retarget = retarget;
    function paint() {
      if (!T.G) return;
      var m = ((T.pos % T.G) + T.G) % T.G;          // content drifts to the right (RTL reading flow)
      track.style.transform = 'translate3d(' + (m - T.G).toFixed(2) + 'px,0,0)';
    }
    var last = 0;
    function frame(t) {
      if (T.dead) return;
      if (!root.isConnected) { destroy(); return; }
      var dt = last ? Math.min(64, t - last) : 16; last = t;
      if (!T.drag) {
        T.v += (T.target - T.v) * Math.min(1, dt / 1000 * 3.2);   // glide to a stop / back to speed
        if (Math.abs(T.v) > .01) { T.pos += T.v * dt / 1000; paint(); }
      }
      T.raf = requestAnimationFrame(frame);
    }

    /* hover / focus / touch / drag / tap */
    root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { T.hover = true; retarget(); } });
    root.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { T.hover = false; retarget(); } });
    root.addEventListener('focusin', function () { T.focus = true; retarget(); });
    root.addEventListener('focusout', function () { T.focus = false; retarget(); });
    view.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      clearTimeout(T.resume);
      T.hold = true; retarget(); T.v = 0;
      T.drag = { x: e.clientX, y: e.clientY, pos: T.pos, moved: false, id: e.pointerId, target: e.target };
    });
    view.addEventListener('pointermove', function (e) {
      var d = T.drag; if (!d || d.id !== e.pointerId) return;
      var dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - d.y)) {
        d.moved = true; root.classList.add('is-drag');
        try { view.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (d.moved) { T.pos = d.pos + dx; paint(); e.preventDefault(); }
    });
    function release(e) {
      var d = T.drag; if (!d || (e && d.id !== e.pointerId)) return;
      T.drag = null; root.classList.remove('is-drag');
      if (e && e.type === 'pointerup' && !d.moved) {
        var hit = d.target && d.target.closest && d.target.closest('[data-go]');
        if (hit) { flash(hit); setTimeout(function () { open(hit); }, 160); }
      }
      T.resume = setTimeout(function () { T.hold = false; retarget(); }, e && e.pointerType === 'mouse' ? 0 : 1400);
    }
    view.addEventListener('pointerup', release);
    view.addEventListener('pointercancel', release);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.closest('[data-go]')) open(e.target.closest('[data-go]'));
    });
    root.addEventListener('click', function (e) { e.preventDefault(); });   // taps are handled on pointerup

    /* visibility */
    if ('IntersectionObserver' in window) {
      T.io = new IntersectionObserver(function (en) { T.visible = en[0].isIntersecting; retarget(); });
      T.io.observe(root);
    }
    if ('ResizeObserver' in window) { T.ro = new ResizeObserver(function () { measure(); paint(); }); T.ro.observe(view); T.ro.observe(first); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); paint(); });

    function open(el) {
      if (opts.onItem && opts.onItem(el.getAttribute('data-k')) === true) return;
      if (typeof navigate === 'function') navigate(el.getAttribute('data-go'));
    }
    function flash(el) {
      var k = el.getAttribute('data-k');
      root.querySelectorAll('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]').forEach(function (n) {
        n.classList.remove('axtk-flash'); void n.offsetWidth; n.classList.add('axtk-flash');
      });
    }
    function destroy() {
      T.dead = true; cancelAnimationFrame(T.raf); clearTimeout(T.resume);
      if (T.io) T.io.disconnect(); if (T.ro) T.ro.disconnect();
      live = live.filter(function (x) { return x !== T; });
      if (host._axtk === api) host._axtk = null;
    }

    measure();
    // start a little into the loop so the strip is full from the first frame
    T.pos = reduced() ? 0 : T.G * .35; paint();
    retarget(); T.v = T.target;
    T.raf = requestAnimationFrame(frame);

    /* flash whatever changed since this ticker was last shown */
    var before = prev[id], now = {};
    items.forEach(function (it) { if (it.kind !== 'event') now[it.key] = String(it.value); });
    if (before) {
      Object.keys(now).forEach(function (k) {
        if (before[k] != null && before[k] !== now[k]) {
          var n0 = root.querySelector('[data-k="' + k + '"]');
          if (n0) setTimeout(function () { flash(n0); root.querySelectorAll('[data-k="' + k + '"]').forEach(function (n) { n.classList.add('axtk-new'); }); }, 350);
        }
      });
    }
    prev[id] = now;

    var api = { destroy: destroy, retarget: retarget, root: root };
    host._axtk = api;
    live.push(T);
    return api;
  }

  document.addEventListener('visibilitychange', function () { live.forEach(function (T) { T.retarget(); }); });

  /* ── settings card (speed + what to show) ── */
  function settingsCard() {
    var s = S(), sp = s.tickerSpeed || 'normal';
    return '<div class="card axtk-settings" id="axtk-settings">' +
      '<div class="card-header"><h3 class="card-title">شريط النبض المتحرك</h3></div>' +
      '<div class="axtk-set-body">' +
        '<div class="axtk-set-row"><div><b>سرعة الشريط</b><span>الشريط اللي بتعدّي فيه الأرقام في لوحة التحكم ومخزوني والتقارير</span></div>' +
          '<div class="ax-seg" role="radiogroup" aria-label="سرعة الشريط">' + [['slow', 'بطيء'], ['normal', 'عادي'], ['fast', 'سريع']].map(function (o) {
            return '<button type="button" role="radio" aria-checked="' + (sp === o[0]) + '" class="' + (sp === o[0] ? 'on' : '') + '" onclick="AXTicker.setSpeed(\'' + o[0] + '\')">' + o[1] + '</button>';
          }).join('') + '</div></div>' +
        '<label class="axtk-set-row"><div><b>آخر الحركات</b><span>"آخر تحصيل 3,600 من مركز النور من 5 دقايق" وسط الأرقام</span></div>' +
          '<input type="checkbox" ' + (s.tickerEvents === false ? '' : 'checked') + ' onchange="AXTicker.setOpt(\'tickerEvents\', this.checked)"></label>' +
        '<label class="axtk-set-row"><div><b>الشريط في مخزوني والتقارير</b><span>يظهر أعلى الصفحتين دول كمان</span></div>' +
          '<input type="checkbox" ' + (s.tickerPages === false ? '' : 'checked') + ' onchange="AXTicker.setOpt(\'tickerPages\', this.checked)"></label>' +
        '<div class="axtk-set-preview" id="axtk-preview"></div>' +
      '</div></div>';
  }
  function save() { try { DB.save(); } catch (e) {} }
  function mountPreview() {
    var h = document.getElementById('axtk-preview'); if (!h) return;
    create(h, { id: 'preview', variant: 'bar', label: 'معاينة الشريط', items: [
      { key: 'p1', label: 'الورق', value: '4,665 ورقة', level: 'ok', delta: { dir: 'up', text: '500', good: true } },
      { key: 'p2', label: 'تحصيل اليوم', value: '3,600 ' + cur(), level: 'info', delta: { dir: 'down', text: '1,200', good: false } }
    ].concat(S().tickerEvents === false ? [] : events(2)) });
  }

  /* ── hook pages the ticker lives on (reports + settings; dashboard and stock call create() themselves) ── */
  function reportItems() {
    var t = new Date(), y = t.getFullYear(), m = t.getMonth(), day = t.getDate();
    function ym(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
    var mNow = ym(t), mPrev = ym(new Date(y, m - 1, 1));
    var cutPrev = mPrev + '-' + String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, '0');
    function inMonth(list, f, key) {
      var a = 0, b = 0;
      list.forEach(function (x) {
        var d = String(x.date || '');
        if (d.slice(0, 7) === mNow) a += Number(f(x) || 0);
        else if (d.slice(0, 7) === mPrev && d <= cutPrev) b += Number(f(x) || 0);
      });
      return [a, b];
    }
    function delta(a, b, upGood) {
      if (!b) return null;
      var ch = (a - b) / Math.abs(b) * 100; if (Math.abs(ch) < .5) return null;
      return { dir: ch >= 0 ? 'up' : 'down', text: Math.abs(ch).toFixed(0) + '%', good: (ch >= 0) === upGood, hint: 'مقارنة بنفس الفترة من الشهر اللي فات' };
    }
    var s1 = inMonth(A('issuances'), function (i) { return i.total; }), s2 = inMonth(A('invoices').filter(function (i) { return !i.sourceIssuanceId; }), function (i) { return i.total; });
    var sales = [s1[0] + s2[0], s1[1] + s2[1]];
    var coll = inMonth(A('payments'), function (p) { return p.amount; });
    var exp = inMonth(A('expenses').filter(function (e) { return e.kind !== 'purchase'; }), function (e) { return e.amount; });
    var iss = inMonth(A('issuances'), function (i) { return i.quantity; });
    var debt = A('customers').reduce(function (s, c) { return s + Math.max(0, Number(c.balance || 0)); }, 0);
    var top = {}; A('issuances').forEach(function (i) { if (String(i.date || '').slice(0, 7) === mNow) top[i.customerName || i.customerId] = (top[i.customerName || i.customerId] || 0) + Number(i.total || 0); });
    var best = Object.keys(top).sort(function (a, b) { return top[b] - top[a]; })[0];
    var net = sales[0] - exp[0];
    return [
      { key: 'r-sales', label: 'مبيعات الشهر', value: money(sales[0]), level: 'info', delta: delta(sales[0], sales[1], true), go: 'invoices' },
      { key: 'r-coll', label: 'تحصيل الشهر', value: money(coll[0]), level: 'ok', delta: delta(coll[0], coll[1], true), go: 'payments' },
      { key: 'r-exp', label: 'مصروفات الشهر', value: money(exp[0]), level: 'warn', delta: delta(exp[0], exp[1], false), go: 'expenses' },
      { key: 'r-net', label: 'المبيعات بعد المصروفات', value: money(net), level: net >= 0 ? 'ok' : 'bad', delta: null },
      { key: 'r-iss', label: 'ورق مصروف الشهر', value: num(iss[0]), level: 'info', delta: delta(iss[0], iss[1], true), go: 'issuances' },
      { key: 'r-debt', label: 'المديونيات', value: money(debt), level: debt > 0 ? 'bad' : 'ok', delta: null, go: 'payments' },
      best ? { key: 'r-top', label: 'أكبر مركز الشهر', value: best + ' · ' + money(top[best]), level: 'info', delta: null, go: 'customers' } : null
    ].filter(Boolean);
  }
  function withEvents(items, n) {
    if (S().tickerEvents === false) return items;
    var ev = events(n || 3), out = [], step = Math.max(1, Math.ceil(items.length / Math.max(1, ev.length)));
    items.forEach(function (it, i) { out.push(it); if ((i + 1) % step === 0 && ev.length) out.push(ev.shift()); });
    return out.concat(ev);
  }
  function hook(name, after) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig._axtk) return;
    var w = function () { var r = orig.apply(this, arguments); try { after(); } catch (e) { console.warn('[ticker]', e); } return r; };
    w._axtk = true; for (var k in orig) if (orig.hasOwnProperty(k)) w[k] = orig[k];
    window[name] = w;
  }
  function hookAll() {
    hook('renderReports', function () {
      if (S().tickerPages === false) return;
      var pc = document.getElementById('page-content'), head = pc && pc.querySelector('.page-header');
      if (!head || document.getElementById('axtk-reports')) return;
      head.insertAdjacentHTML('afterend', '<div id="axtk-reports" class="axtk-host"></div>');
      create(document.getElementById('axtk-reports'), { id: 'reports', variant: 'bar', label: 'ملخص الشهر المتحرك', items: withEvents(reportItems(), 3) });
    });
    hook('renderSettings', function () {
      var pc = document.getElementById('page-content'); if (!pc || document.getElementById('axtk-settings')) return;
      var head = pc.querySelector('.page-header');
      if (head) head.insertAdjacentHTML('afterend', settingsCard()); else pc.insertAdjacentHTML('afterbegin', settingsCard());
      mountPreview();
    });
  }

  window.AXTicker = {
    create: create, events: events, withEvents: withEvents, ago: ago, money: money, num: num,
    setSpeed: function (sp) {
      var s = D().settings || (D().settings = {}); s.tickerSpeed = sp; save();
      document.querySelectorAll('#axtk-settings .ax-seg button').forEach(function (b) {
        var on = b.getAttribute('onclick').indexOf("'" + sp + "'") > 0; b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
      });
      live.forEach(function (T) { T.retarget(); });
      if (typeof toast === 'function') toast('سرعة الشريط: ' + ({ slow: 'بطيء', normal: 'عادي', fast: 'سريع' })[sp]);
    },
    setOpt: function (k, v) {
      var s = D().settings || (D().settings = {}); s[k] = !!v; save(); mountPreview();
      if (typeof toast === 'function') toast(v ? 'اتفعّلت' : 'اتقفلت');
    }
  };
  hookAll();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookAll);
  window.addEventListener('load', hookAll);
})();

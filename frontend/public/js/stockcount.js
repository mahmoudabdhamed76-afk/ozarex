/* ════════════════════════════════════════════════════════════════════
   ERP · الجرد الذكي — smart stocktake inside «مخزوني وجرد»
   ------------------------------------------------------------------
   · tells you WHAT to count first: ABC class by 90-day consumption value
     (A every 7 days, B every 30, C every 90), never-counted items,
     big variance last time, negative balances, busy items this week
   · smart count (only what's due) / full count / one category
   · blind count option (hides the system balance while counting)
   · live variance per line in units, % and money + hints
     (e.g. "the difference equals the issuance of 24/9 — recorded twice?")
   · moves that happen WHILE counting are added to the expected balance
   · approve → adjustment stock moves "تسوية جرد #n" + balances fixed
   · history with accuracy trend, printable count sheet and report
   Stored in settings._stockCounts (round-trips through the server).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var FREQ = { A: 7, B: 30, C: 90 };
  var ui = { filter: 'all', q: '' };
  var saveT = 0;

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function list() { var s = S(); if (!Array.isArray(s._stockCounts)) s._stockCounts = []; return s._stockCounts; }
  function draft() { return list().find(function (c) { return c.status === 'draft'; }); }
  function done() { return list().filter(function (c) { return c.status === 'done'; }).sort(function (a, b) { return (a.finishedAt || 0) - (b.finishedAt || 0); }); }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n, dec) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: dec == null ? 0 : dec }); }
  function qty(n) { return num(n, Math.abs(n) < 10 && n % 1 ? 2 : 0); }
  function cur() { return S().currency || 'ج'; }
  function money(n) { return num(n) + ' ' + cur(); }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function today() { return lds(new Date()); }
  function daysBetween(a, b) { return Math.round((b - a) / 864e5); }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function save(now) {
    clearTimeout(saveT);
    var go = function () { try { DB.save(); } catch (e) {} };
    if (now) go(); else saveT = setTimeout(go, 700);
  }
  function prodMap() { var m = {}; A('products').forEach(function (p) { m[p.id] = p; }); return m; }
  function dayMonth(ds) { var p = String(ds).split('-'); return (+p[2]) + '/' + (+p[1]); }
  function whenText(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(d); }
    catch (e) { return d.toLocaleString(); }
  }
  function catOf(p) { return window.AXStock && AXStock.classify ? AXStock.classify(p) : 'misc'; }
  function catInfo(k) { return (window.AXStock && AXStock.CAT && AXStock.CAT[k]) || { label: 'أخرى', tint: 'misc' }; }
  function ico(k) { return window.AXStock && AXStock.icon ? AXStock.icon(k) : ''; }
  var SVG = {
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 7a3 3 0 1 1 4-2.8M16 7a3 3 0 1 0-4-2.8M7 12a3 3 0 1 1 0-6M17 12a3 3 0 1 0 0-6M7 12a3 3 0 1 0 5 2.2M17 12a3 3 0 1 1-5 2.2M8 21a3 3 0 0 1 4-3M16 21a3 3 0 0 0-4-3"/></svg>',
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>'
  };

  /* ── what should be counted first ── */
  function analysis() {
    var now = Date.now(), t0 = new Date(); t0.setHours(0, 0, 0, 0);
    var f90 = lds(new Date(t0.getTime() - 89 * 864e5)), f7 = lds(new Date(t0.getTime() - 6 * 864e5));
    var outV = {}, busy = {};
    var pm = prodMap();
    A('stockMoves').forEach(function (m) {
      var d = String(m.date || '').slice(0, 10), p = pm[m.productId]; if (!p) return;
      if (m.type === 'out' && d >= f90 && !/^تسوية جرد/.test(String(m.reference || ''))) outV[p.id] = (outV[p.id] || 0) + Number(m.quantity || 0) * Number(p.cost || p.price || 0);
      if (d >= f7) busy[p.id] = (busy[p.id] || 0) + 1;
    });
    var prods = A('products').slice();
    var total = prods.reduce(function (s, p) { return s + (outV[p.id] || 0); }, 0), run = 0, cls = {};
    prods.slice().sort(function (a, b) { return (outV[b.id] || 0) - (outV[a.id] || 0); }).forEach(function (p) {
      var v = outV[p.id] || 0;
      if (!total || !v) { cls[p.id] = busy[p.id] ? 'B' : 'C'; return; }
      var share = run / total; run += v;
      cls[p.id] = share < .8 ? 'A' : share < .95 ? 'B' : 'C';
    });
    var last = {};
    done().forEach(function (c) {
      (c.lines || []).forEach(function (l) {
        if (l.counted == null) return;
        var exp = l.expected != null ? l.expected : l.sys;
        last[l.pid] = { at: c.finishedAt, varPct: exp ? Math.abs((l.counted - exp) / exp * 100) : (l.counted ? 100 : 0) };
      });
    });
    return prods.map(function (p) {
      var c = cls[p.id] || 'C', L = last[p.id], since = L ? daysBetween(L.at, now) : Infinity;
      var score = 0, why = [];
      if (Number(p.quantity) < 0) { score += 100; why.push({ t: 'رصيد بالسالب!', tone: 'bad' }); }
      if (!L) { score += 20 + (c === 'A' ? 30 : c === 'B' ? 15 : 5); why.push({ t: 'عمره ما اتجرد', tone: 'warn' }); }
      else if (since >= FREQ[c]) { score += 10 + since / FREQ[c] * 10; why.push({ t: 'آخر جرد من ' + since + ' يوم', tone: 'warn' }); }
      if (L && L.varPct >= 5) { score += Math.min(60, L.varPct * 2); why.push({ t: 'فرق ' + Math.round(L.varPct) + '% المرة اللي فاتت', tone: 'bad' }); }
      if (c === 'A') { score += 5; why.push({ t: 'فئة A · سحب عالي', tone: 'info' }); }
      if ((busy[p.id] || 0) >= 5) { score += 6; why.push({ t: (busy[p.id]) + ' حركة الأسبوع ده', tone: 'info' }); }
      return { p: p, id: p.id, cls: c, since: since, score: score, why: why, due: score >= 20, value: outV[p.id] || 0 };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* ── session helpers ── */
  function movesSince(pid, ts) {
    var n = 0;
    A('stockMoves').forEach(function (m) { if (m.productId === pid && Number(m.createdAt || 0) > ts) n += (m.type === 'in' ? 1 : -1) * Number(m.quantity || 0); });
    return n;
  }
  function expectedOf(c, l) { return Number(l.sys) + movesSince(l.pid, c.startTs); }
  function lineStats(c) {
    var pm = prodMap(), s = { total: c.lines.length, counted: 0, match: 0, diff: 0, plusV: 0, minusV: 0 };
    c.lines.forEach(function (l) {
      if (l.counted == null || l.counted === '') return;
      s.counted++;
      var d = Number(l.counted) - expectedOf(c, l), p = pm[l.pid] || {}, cost = Number(p.cost || p.price || l.cost || 0);
      if (Math.abs(d) < 1e-9) s.match++; else { s.diff++; if (d > 0) s.plusV += d * cost; else s.minusV += -d * cost; }
    });
    return s;
  }
  function hint(c, l, exp) {
    var d = Number(l.counted) - exp;
    if (Math.abs(d) < 1e-9) return { t: 'مطابق', tone: 'ok' };
    if (Number(l.counted) === 0 && exp > 0) return { t: 'مفيش ولا حاجة؟ اتأكد من كل أماكن التخزين قبل الاعتماد', tone: 'bad' };
    var from = lds(new Date(Date.now() - 14 * 864e5)), ad = Math.abs(d), hit = null;
    A('stockMoves').forEach(function (m) {
      if (!hit && m.productId === l.pid && String(m.date || '') >= from && Math.abs(Number(m.quantity || 0) - ad) < 1e-9) hit = m;
    });
    if (hit) return { t: 'الفرق بالظبط = ' + (hit.type === 'in' ? 'وارد' : 'صرف') + ' يوم ' + dayMonth(hit.date) + ' (' + qty(hit.quantity) + ') — ممكن يكون اتسجل مرتين أو ما اتسجلش', tone: 'warn' };
    var pct = exp ? ad / Math.abs(exp) * 100 : 100;
    if (pct >= 10) return { t: 'فرق كبير (' + Math.round(pct) + '%) — عِدّ تاني قبل الاعتماد', tone: 'bad' };
    return { t: 'فرق بسيط (' + (Math.round(pct * 10) / 10) + '%)', tone: 'warn' };
  }

  function start(kind, cat) {
    if (draft()) { render(); return; }
    var an = analysis(), pick;
    if (kind === 'smart') pick = an.filter(function (x) { return x.due; });
    else if (kind === 'cat') pick = an.filter(function (x) { return catOf(x.p) === cat; });
    else pick = an;
    if (!pick.length) { if (typeof toast === 'function') toast(kind === 'smart' ? 'مفيش أصناف مستحقة للجرد دلوقتي — اعمل جرد شامل أو جرد قسم' : 'مفيش أصناف', 'warning'); return; }
    var n = list().reduce(function (m, c) { return Math.max(m, c.no || 0); }, 0) + 1;
    var who = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || '';
    list().push({
      id: 'cnt_' + id(), no: n, status: 'draft', kind: kind, cat: cat || '', by: who,
      startTs: Date.now(), date: today(), blind: !!S().countBlind,
      lines: pick.map(function (x) {
        return { pid: x.id, name: x.p.name || '', unit: x.p.unit || '', cls: x.cls, sys: Number(x.p.quantity || 0), cost: Number(x.p.cost || x.p.price || 0), counted: null };
      })
    });
    ui.filter = 'all'; ui.q = '';
    save(true);
    render();
    if (typeof toast === 'function') toast('بدأ الجرد #' + n + ' — ' + pick.length + ' صنف');
  }

  /* ── views ── */
  var host = null;
  function render(h) {
    if (h) host = h;
    if (!host || !host.isConnected) host = document.getElementById('skc-root');
    if (!host) return;
    var c = draft();
    host.innerHTML = c ? countView(c) : homeView();
    if (c) { refreshAll(c); } else { trend(); }
  }

  function homeView() {
    var an = analysis(), due = an.filter(function (x) { return x.due; }), hist = done();
    var lastC = hist[hist.length - 1], lastS = lastC ? lastC.result || {} : null;
    var acc = lastS && lastS.counted ? Math.round(lastS.match / lastS.counted * 100) : null;
    var cats = {}; an.forEach(function (x) { var k = catOf(x.p); cats[k] = (cats[k] || 0) + 1; });
    var classN = { A: 0, B: 0, C: 0 }; an.forEach(function (x) { classN[x.cls]++; });
    return '' +
      '<section class="skc-hero">' +
        '<div class="skc-hero-acc"><span>دقة آخر جرد</span><b class="' + (acc == null ? '' : acc >= 95 ? 'ok' : acc >= 80 ? 'warn' : 'bad') + '">' + (acc == null ? '—' : acc + '%') + '</b>' +
          '<small>' + (lastC ? 'جرد #' + lastC.no + ' · ' + dayMonth(lastC.date) : 'لسه ما اتعملش جرد') + '</small></div>' +
        '<div class="skc-hero-main">' +
          '<div class="skc-hero-t">' + (due.length ? '<b>' + due.length + ' صنف محتاجين جرد دلوقتي</b><span>مرتّبين حسب الأهمية: الأعلى سحب، اللي بقاله كتير ما اتعدّش، واللي كان فيه فرق</span>'
            : '<b>كل الأصناف متجردة في ميعادها</b><span>الجرد الذكي هيقولك أول ما صنف يستحق يتعدّ</span>') + '</div>' +
          '<div class="skc-abc">' +
            '<div><i class="a">A</i><b>' + classN.A + '</b><span>كل 7 أيام</span></div>' +
            '<div><i class="b">B</i><b>' + classN.B + '</b><span>كل 30 يوم</span></div>' +
            '<div><i class="c">C</i><b>' + classN.C + '</b><span>كل 90 يوم</span></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<div class="skc-starts">' +
        '<button class="skc-start is-rec" onclick="AXCount.start(\'smart\')"' + (due.length ? '' : ' disabled') + '>' +
          '<span class="skc-si">' + SVG.brain + '</span><b>جرد ذكي</b><span>' + (due.length ? due.length + ' صنف مستحق بس — أسرع وأدق' : 'مفيش أصناف مستحقة') + '</span>' +
          (due.length ? '<em>المقترح</em>' : '') + '</button>' +
        '<button class="skc-start" onclick="AXCount.start(\'all\')"><span class="skc-si">' + SVG.all + '</span><b>جرد شامل</b><span>كل أصناف المخزن (' + an.length + ') — ورق، حبر، قطع غيار وغيرهم</span></button>' +
        '<div class="skc-start skc-start-cat"><span class="skc-si">' + ico('paper') + '</span><b>جرد قسم</b><div class="skc-catbtns">' +
          Object.keys(cats).map(function (k) { return '<button class="t-' + catInfo(k).tint + '" onclick="AXCount.start(\'cat\',\'' + k + '\')">' + catInfo(k).label + ' <small>' + cats[k] + '</small></button>'; }).join('') +
        '</div></div>' +
      '</div>' +
      '<div class="skc-opts">' +
        '<label class="skc-blind"><input type="checkbox" ' + (S().countBlind ? 'checked' : '') + ' onchange="AXCount.setBlind(this.checked)">' +
          '<span><b>جرد أعمى</b><small>الرصيد المسجّل يستخبى وإنت بتعدّ — عشان العدّ يبقى من غير تأثير</small></span></label>' +
        '<div class="skc-opt-btns"><button class="btn btn-secondary" onclick="openProductForm()">+ صنف جديد للمخزن</button>' +
        '<button class="btn btn-secondary" onclick="AXCount.printSheet()">' + SVG.print + ' ورقة جرد فاضية للطباعة</button></div>' +
      '</div>' +

      '<div class="dash-card skc-card"><div class="dash-card-header"><div class="dash-card-title">أولوية الجرد</div><div class="skh-note">الأهم فوق</div></div>' +
        (an.length ? '<ul class="skc-prio">' + an.slice(0, 12).map(function (x) {
          var ci = catInfo(catOf(x.p));
          return '<li class="' + (x.due ? 'due' : '') + '"><span class="skh-ico t-' + ci.tint + '">' + ico(catOf(x.p)) + '</span>' +
            '<div class="skc-pt"><b>' + esc(x.p.name) + ' <i class="skc-cls ' + x.cls.toLowerCase() + '">' + x.cls + '</i></b>' +
            '<div class="skc-why">' + (x.why.length ? x.why.map(function (w) { return '<span class="tone-' + w.tone + '">' + esc(w.t) + '</span>'; }).join('') : '<span class="tone-ok">متجرد في ميعاده</span>') + '</div></div>' +
            '<span class="skc-pl">' + (isFinite(x.since) ? 'من ' + x.since + ' يوم' : 'أول مرة') + '</span></li>';
        }).join('') + '</ul>' : '<div class="skh-empty sm"><span>ضيف أصناف الأول</span></div>') +
      '</div>' +

      '<div class="dash-card skc-card"><div class="dash-card-header"><div class="dash-card-title">سجل الجرد</div><div class="skh-note">' + hist.length + ' جرد</div></div>' +
        (hist.length > 1 ? '<div id="skc-trend"></div>' : '') +
        (hist.length ? '<ul class="skc-hist">' + hist.slice().reverse().slice(0, 10).map(function (c) {
          var r = c.result || {}, a = r.counted ? Math.round(r.match / r.counted * 100) : 0;
          return '<li><button onclick="AXCount.report(\'' + c.id + '\')"><div><b>جرد #' + c.no + '</b><span>' + dayMonth(c.date) + ' · ' + (r.counted || 0) + ' صنف' + (c.by ? ' · ' + esc(c.by) : '') + '</span></div>' +
            '<div class="skc-hv"><b class="' + (a >= 95 ? 'ok' : a >= 80 ? 'warn' : 'bad') + '">' + a + '%</b><span>' + (r.net ? '\u200E' + (r.net > 0 ? '+' : '−') + money(Math.abs(r.net)) : 'بدون فروق') + '</span></div></button></li>';
        }).join('') + '</ul>' : '<div class="skh-empty sm"><span>أول جرد هيظهر هنا بدقته وفروقه</span></div>') +
      '</div>';
  }

  function trend() {
    var h = document.getElementById('skc-trend'); if (!h || !window.AXChart) return;
    var hist = done().slice(-12);
    AXChart.line(h, {
      labels: hist.map(function (c) { return '#' + c.no; }), height: 170, title: 'دقة الجرد',
      series: [{ name: 'دقة الجرد', values: hist.map(function (c) { var r = c.result || {}; return r.counted ? Math.round(r.match / r.counted * 100) : 0; }), color: 'var(--ax-teal)' }],
      fmt: function (v) { return Math.round(v) + '%'; }
    });
  }

  function countView(c) {
    var ci = c.kind === 'cat' ? catInfo(c.cat).label : c.kind === 'smart' ? 'جرد ذكي' : 'جرد شامل';
    return '' +
      '<section class="skc-bar">' +
        '<div class="skc-bar-t"><span>' + ci + ' · بدأ ' + esc(whenText(c.startTs)) + (c.by ? ' · ' + esc(c.by) : '') + '</span><b>جرد #' + c.no + '</b></div>' +
        '<div class="skc-prog"><div class="skc-prog-bar"><i id="skc-pb"></i></div><span id="skc-pt"></span></div>' +
        '<div class="skc-sum">' +
          '<div><span>مطابق</span><b id="skc-sm" class="ok">0</b></div>' +
          '<div><span>فيه فرق</span><b id="skc-sd" class="warn">0</b></div>' +
          '<div><span>زيادة</span><b id="skc-sp" class="ok">0</b></div>' +
          '<div><span>عجز</span><b id="skc-sn" class="bad">0</b></div>' +
        '</div>' +
      '</section>' +
      '<div class="skc-tools">' +
        '<div class="ax-seg" role="tablist">' + [['all', 'الكل'], ['todo', 'لسه'], ['diff', 'فيه فرق'], ['match', 'مطابق']].map(function (o) {
          return '<button class="' + (ui.filter === o[0] ? 'on' : '') + '" onclick="AXCount.filter(\'' + o[0] + '\')">' + o[1] + '</button>';
        }).join('') + '</div>' +
        '<label class="skh-search">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input type="search" id="skc-q" placeholder="دوّر على صنف…" value="' + esc(ui.q) + '" oninput="AXCount.search(this.value)"></label>' +
        '<label class="skc-blind sm"><input type="checkbox" ' + (c.blind ? 'checked' : '') + ' onchange="AXCount.setBlind(this.checked, true)"><span><b>جرد أعمى</b></span></label>' +
      '</div>' +
      '<div class="skc-lines">' + c.lines.map(function (l, i) { return lineHTML(c, l, i); }).join('') + '</div>' +
      '<div class="skc-actions">' +
        '<button class="btn btn-primary" onclick="AXCount.approve()">' + SVG.check + ' اعتماد الجرد</button>' +
        '<button class="btn btn-secondary skc-print" onclick="AXCount.printSheet(true)" title="طباعة ورقة الجرد">' + SVG.print + '<span> طباعة ورقة الجرد</span></button>' +
        '<button class="btn btn-ghost skc-cancel" onclick="AXCount.cancel()">إلغاء<span> الجرد</span></button>' +
      '</div>';
  }

  function lineHTML(c, l, i) {
    var p = prodMap()[l.pid] || {}, k = catOf(p.id ? p : { name: l.name }), ci = catInfo(k);
    var v = l.counted == null ? '' : l.counted;
    return '<article class="skc-line" data-pid="' + esc(l.pid) + '" data-i="' + i + '">' +
      '<header><span class="skh-ico t-' + ci.tint + '">' + ico(k) + '</span>' +
        '<div class="skc-lt"><b>' + esc(l.name) + ' <i class="skc-cls ' + (l.cls || 'c').toLowerCase() + '">' + (l.cls || 'C') + '</i></b><span>' + esc(l.unit) + ' · ' + ci.label + '</span></div>' +
        '<span class="skc-state"></span></header>' +
      '<div class="skc-lb">' +
        '<div class="skc-exp"><span>المسجّل</span><b class="skc-expv"></b><small class="skc-mv"></small></div>' +
        '<div class="skc-in">' +
          '<button type="button" aria-label="ناقص واحد" onclick="AXCount.step(' + i + ',-1)">−</button>' +
          '<input type="number" inputmode="decimal" step="any" min="0" placeholder="العدد الفعلي" value="' + esc(v) + '" aria-label="العدد الفعلي لـ ' + esc(l.name) + '" oninput="AXCount.set(' + i + ', this.value)" onkeydown="AXCount.key(event,' + i + ')">' +
          '<button type="button" aria-label="زيادة واحد" onclick="AXCount.step(' + i + ',1)">+</button>' +
        '</div>' +
        '<button type="button" class="skc-match" onclick="AXCount.match(' + i + ')">' + SVG.check + ' مطابق</button>' +
      '</div>' +
      '<div class="skc-var"></div>' +
    '</article>';
  }

  /* update one line in place (no re-render → the keyboard stays open on mobile) */
  function refreshLine(c, i) {
    var el = host && host.querySelector('.skc-line[data-i="' + i + '"]'); if (!el) return;
    var l = c.lines[i], exp = expectedOf(c, l), mv = exp - Number(l.sys), p = prodMap()[l.pid] || {};
    var cost = Number(p.cost || p.price || l.cost || 0);
    el.querySelector('.skc-expv').textContent = c.blind ? 'مخفي' : qty(exp);
    el.querySelector('.skc-mv').textContent = mv ? '\u200E' + (mv > 0 ? '+' : '−') + qty(Math.abs(mv)) + ' \u200Fحركة أثناء الجرد' : '';
    el.querySelector('.skc-match').style.display = c.blind ? 'none' : '';
    var st = el.querySelector('.skc-state'), vv = el.querySelector('.skc-var');
    el.classList.remove('is-match', 'is-diff', 'is-todo');
    if (l.counted == null || l.counted === '') {
      el.classList.add('is-todo'); st.textContent = 'لسه'; vv.innerHTML = ''; return;
    }
    var d = Number(l.counted) - exp;
    if (Math.abs(d) < 1e-9) { el.classList.add('is-match'); st.textContent = 'مطابق'; vv.innerHTML = ''; return; }
    el.classList.add('is-diff'); st.textContent = d > 0 ? 'زيادة' : 'عجز';
    var h = hint(c, l, exp);
    vv.innerHTML = '<b class="' + (d > 0 ? 'plus' : 'minus') + '">' + (c.blind ? '' : '<bdi>\u200E' + (d > 0 ? '+' : '−') + qty(Math.abs(d)) + '</bdi> ' + esc(l.unit) + ' · ') + '<bdi>\u200E' + (d > 0 ? '+' : '−') + num(Math.abs(d) * cost) + '</bdi> ' + esc(cur()) + '</b>' +
      '<span class="tone-' + h.tone + '">' + esc(c.blind ? (d > 0 ? 'العدد أكتر من المسجّل' : 'العدد أقل من المسجّل') : h.t) + '</span>';
  }
  function refreshSum(c) {
    if (!host) return;
    var s = lineStats(c), pct = s.total ? s.counted / s.total * 100 : 0;
    var pb = host.querySelector('#skc-pb'); if (!pb) return;
    pb.style.width = pct.toFixed(1) + '%';
    host.querySelector('#skc-pt').textContent = s.counted + ' من ' + s.total + ' صنف';
    host.querySelector('#skc-sm').textContent = s.match;
    host.querySelector('#skc-sd').textContent = s.diff;
    host.querySelector('#skc-sp').textContent = '\u200E+' + num(s.plusV);
    host.querySelector('#skc-sn').textContent = '\u200E−' + num(s.minusV);
  }
  function applyFilter(c) {
    if (!host) return;
    var q = ui.q.trim().toLowerCase();
    host.querySelectorAll('.skc-line').forEach(function (el) {
      var l = c.lines[+el.getAttribute('data-i')];
      var show = (!q || (l.name || '').toLowerCase().indexOf(q) >= 0) &&
        (ui.filter === 'all' || (ui.filter === 'todo' && el.classList.contains('is-todo')) ||
         (ui.filter === 'diff' && el.classList.contains('is-diff')) || (ui.filter === 'match' && el.classList.contains('is-match')));
      el.style.display = show ? '' : 'none';
    });
  }
  function refreshAll(c) { c.lines.forEach(function (_, i) { refreshLine(c, i); }); refreshSum(c); applyFilter(c); }

  /* ── approve / cancel / report / print ── */
  function approve() {
    var c = draft(); if (!c) return;
    var s = lineStats(c);
    if (!s.counted) { if (typeof toast === 'function') toast('اكتب العدد الفعلي لصنف واحد على الأقل', 'warning'); return; }
    var rows = c.lines.filter(function (l) { return l.counted != null && l.counted !== '' && Math.abs(Number(l.counted) - expectedOf(c, l)) > 1e-9; });
    var body = '<p class="ax-modal-lead">هيتم تعديل رصيد <b>' + rows.length + '</b> صنف بحركة «تسوية جرد #' + c.no + '»' +
      (s.total - s.counted ? '، و<b>' + (s.total - s.counted) + '</b> صنف ما اتعدّوش هيفضلوا زي ما هم' : '') + '.</p>' +
      '<div class="skc-appr">' +
        '<div><span>مطابق</span><b class="ok">' + s.match + '</b></div><div><span>زيادة</span><b class="ok">\u200E+' + money(s.plusV) + '</b></div>' +
        '<div><span>عجز</span><b class="bad">\u200E−' + money(s.minusV) + '</b></div><div><span>الصافي</span><b>\u200E' + ((s.plusV - s.minusV) >= 0 ? '+' : '−') + money(Math.abs(s.plusV - s.minusV)) + '</b></div>' +
      '</div>' +
      (rows.length ? '<table class="skc-tbl"><thead><tr><th>الصنف</th><th>المسجّل</th><th>الفعلي</th><th>الفرق</th></tr></thead><tbody>' + rows.map(function (l) {
        var e = expectedOf(c, l), d = Number(l.counted) - e;
        return '<tr><td>' + esc(l.name) + '</td><td>' + qty(e) + '</td><td>' + qty(l.counted) + '</td><td class="' + (d > 0 ? 'plus' : 'minus') + '">\u200E' + (d > 0 ? '+' : '−') + qty(Math.abs(d)) + '</td></tr>';
      }).join('') + '</tbody></table>' : '');
    openModal('اعتماد جرد #' + c.no, body,
      '<button class="btn btn-primary" onclick="AXCount.confirmApprove()">' + SVG.check + ' اعتماد وتسوية الأرصدة</button>' +
      '<button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function confirmApprove() {
    var c = draft(); if (!c) return;
    var pm = prodMap(), t = today(), res = { counted: 0, match: 0, diff: 0, plusV: 0, minusV: 0, net: 0, total: c.lines.length };
    if (!Array.isArray(D().stockMoves)) D().stockMoves = [];
    c.lines.forEach(function (l) {
      if (l.counted == null || l.counted === '') { l.expected = null; return; }
      var e = expectedOf(c, l), cnt = Number(l.counted), d = cnt - e, p = pm[l.pid];
      l.expected = e; l.counted = cnt; res.counted++;
      if (Math.abs(d) < 1e-9) { res.match++; return; }
      res.diff++;
      var cost = Number((p && (p.cost || p.price)) || l.cost || 0);
      if (d > 0) res.plusV += d * cost; else res.minusV += -d * cost;
      if (p) {
        p.quantity = Number(p.quantity || 0) + d;
        D().stockMoves.push({ id: 'sm_' + id(), productId: p.id, type: d > 0 ? 'in' : 'out', quantity: Math.abs(d), date: t,
          note: 'تسوية جرد #' + c.no, reference: 'تسوية جرد #' + c.no, createdAt: Date.now() });
      }
    });
    res.net = res.plusV - res.minusV;
    c.result = res; c.status = 'done'; c.finishedAt = Date.now();
    save(true);
    closeModal();
    if (typeof toast === 'function') toast('اتعمد الجرد #' + c.no + ' — دقة ' + (res.counted ? Math.round(res.match / res.counted * 100) : 0) + '%');
    if (typeof celebrate === 'function' && res.counted && res.match === res.counted) { try { celebrate(); } catch (e) {} }
    if (typeof renderSidebar === 'function') { try { renderSidebar(); } catch (e) {} }
    if (typeof renderStockHub === 'function') renderStockHub();
  }
  function cancel() {
    var c = draft(); if (!c) return;
    var go = function () {
      var s = S(); s._stockCounts = list().filter(function (x) { return x !== c; });
      save(true); if (typeof closeModal === 'function') closeModal(); render();
      if (typeof toast === 'function') toast('اتلغى الجرد');
    };
    if (typeof confirmDialog === 'function') confirmDialog('تلغي الجرد #' + c.no + '؟ الأعداد اللي كتبتها هتتمسح.', go); else go();
  }
  function report(cid) {
    var c = list().find(function (x) { return x.id === cid; }); if (!c) return;
    var r = c.result || {}, a = r.counted ? Math.round(r.match / r.counted * 100) : 0;
    var rows = (c.lines || []).filter(function (l) { return l.counted != null; }).sort(function (x, y) {
      return Math.abs((y.counted - y.expected) * (y.cost || 0)) - Math.abs((x.counted - x.expected) * (x.cost || 0));
    });
    openModal('تقرير جرد #' + c.no,
      '<div class="skc-appr">' +
        '<div><span>الدقة</span><b class="' + (a >= 95 ? 'ok' : a >= 80 ? 'warn' : 'bad') + '">' + a + '%</b></div>' +
        '<div><span>اتعدّ</span><b>' + (r.counted || 0) + ' صنف</b></div>' +
        '<div><span>زيادة</span><b class="ok">\u200E+' + money(r.plusV || 0) + '</b></div>' +
        '<div><span>عجز</span><b class="bad">\u200E−' + money(r.minusV || 0) + '</b></div>' +
      '</div>' +
      '<p class="ax-modal-lead">' + esc(whenText(c.finishedAt)) + (c.by ? ' · ' + esc(c.by) : '') + '</p>' +
      '<table class="skc-tbl"><thead><tr><th>الصنف</th><th>المسجّل</th><th>الفعلي</th><th>الفرق</th></tr></thead><tbody>' + rows.map(function (l) {
        var d = l.counted - l.expected;
        return '<tr><td>' + esc(l.name) + '</td><td>' + qty(l.expected) + '</td><td>' + qty(l.counted) + '</td><td class="' + (d > 0 ? 'plus' : d < 0 ? 'minus' : '') + '">' + (d ? '\u200E' + (d > 0 ? '+' : '−') + qty(Math.abs(d)) : '✓') + '</td></tr>';
      }).join('') + '</tbody></table>',
      '<button class="btn btn-secondary" onclick="AXCount.printReport(\'' + c.id + '\')">' + SVG.print + ' طباعة</button><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>', 'large');
  }
  function printDoc(title, inner) {
    var co = S().companyName || 'نظام الحسابات';
    var w = window.open('', '_blank'); if (!w) { if (typeof toast === 'function') toast('المتصفح منع نافذة الطباعة', 'error'); return; }
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>@page{size:A4;margin:14mm}body{font-family:"Zain","IBM Plex Sans Arabic","Cairo",Tahoma,sans-serif;color:#000;margin:0}' +
      'h1{font-size:22px;margin:0}h2{font-size:14px;font-weight:600;margin:4px 0 14px;color:#444}table{width:100%;border-collapse:collapse;font-size:13px}' +
      'th,td{border:1px solid #000;padding:7px 8px;text-align:right}th{background:#eee}td.blank{height:22px}.foot{margin-top:28px;display:flex;justify-content:space-between;font-size:13px}' +
      '.sum{display:flex;gap:18px;margin:0 0 12px;font-size:14px}</style></head><body>' +
      '<h1>' + esc(co) + '</h1><h2>' + esc(title) + '</h2>' + inner +
      '<div class="foot"><span>اسم القائم بالجرد: ....................</span><span>التوقيع: ....................</span><span>التاريخ: ' + today() + '</span></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }
  function printSheet(fromDraft) {
    var c = fromDraft ? draft() : null, blind = c ? c.blind : !!S().countBlind;
    var rows = c ? c.lines.map(function (l) { return { name: l.name, unit: l.unit, exp: expectedOf(c, l), cls: l.cls, v: l.counted }; })
      : analysis().map(function (x) { return { name: x.p.name, unit: x.p.unit, exp: Number(x.p.quantity || 0), cls: x.cls, v: null }; });
    printDoc((c ? 'ورقة جرد #' + c.no : 'ورقة جرد') + (blind ? ' (جرد أعمى)' : ''),
      '<table><thead><tr><th>#</th><th>الصنف</th><th>الفئة</th><th>الوحدة</th>' + (blind ? '' : '<th>المسجّل</th>') + '<th>العدد الفعلي</th><th>ملاحظات</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + (r.cls || '') + '</td><td>' + esc(r.unit || '') + '</td>' +
          (blind ? '' : '<td>' + qty(r.exp) + '</td>') + '<td class="blank">' + (r.v != null && r.v !== '' ? qty(r.v) : '') + '</td><td></td></tr>';
      }).join('') + '</tbody></table>');
  }
  function printReport(cid) {
    var c = list().find(function (x) { return x.id === cid; }); if (!c) return;
    var r = c.result || {}, a = r.counted ? Math.round(r.match / r.counted * 100) : 0;
    printDoc('تقرير جرد #' + c.no + ' — ' + c.date,
      '<div class="sum"><b>الدقة: ' + a + '%</b><span>اتعدّ: ' + (r.counted || 0) + ' صنف</span><span>زيادة: ' + money(r.plusV || 0) + '</span><span>عجز: ' + money(r.minusV || 0) + '</span></div>' +
      '<table><thead><tr><th>الصنف</th><th>الوحدة</th><th>المسجّل</th><th>الفعلي</th><th>الفرق</th><th>قيمة الفرق</th></tr></thead><tbody>' +
      (c.lines || []).filter(function (l) { return l.counted != null; }).map(function (l) {
        var d = l.counted - l.expected;
        return '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.unit) + '</td><td>' + qty(l.expected) + '</td><td>' + qty(l.counted) + '</td><td>' + (d ? (d > 0 ? '+' : '−') + qty(Math.abs(d)) : '✓') + '</td><td>' + (d ? money(Math.abs(d) * (l.cost || 0)) : '') + '</td></tr>';
      }).join('') + '</tbody></table>');
  }

  window.AXCount = {
    render: render, start: start, approve: approve, confirmApprove: confirmApprove, cancel: cancel, report: report,
    printSheet: printSheet, printReport: printReport, analysis: analysis,
    dueCount: function () { try { return analysis().filter(function (x) { return x.due; }).length; } catch (e) { return 0; } },
    set: function (i, v) {
      var c = draft(); if (!c || !c.lines[i]) return;
      c.lines[i].counted = (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      refreshLine(c, i); refreshSum(c); save();
    },
    step: function (i, d) {
      var c = draft(); if (!c || !c.lines[i]) return;
      var l = c.lines[i], base = l.counted == null ? (c.blind ? 0 : expectedOf(c, l)) : Number(l.counted);
      l.counted = Math.max(0, base + d);
      var inp = host.querySelector('.skc-line[data-i="' + i + '"] input'); if (inp) inp.value = l.counted;
      refreshLine(c, i); refreshSum(c); save();
    },
    match: function (i) {
      var c = draft(); if (!c || !c.lines[i]) return;
      var l = c.lines[i]; l.counted = expectedOf(c, l);
      var el = host.querySelector('.skc-line[data-i="' + i + '"]'); if (el) el.querySelector('input').value = l.counted;
      refreshLine(c, i); refreshSum(c); save();
      var next = el && el.nextElementSibling; while (next && next.style.display === 'none') next = next.nextElementSibling;
      if (next && next.scrollIntoView) next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    key: function (e, i) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var el = host.querySelector('.skc-line[data-i="' + i + '"]'), next = el && el.nextElementSibling;
      while (next && next.style.display === 'none') next = next.nextElementSibling;
      if (next) { var inp = next.querySelector('input'); inp.focus(); inp.select(); } else e.target.blur();
    },
    filter: function (f) {
      ui.filter = f; var c = draft(); if (!c) return;
      host.querySelectorAll('.skc-tools .ax-seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('onclick').indexOf("'" + f + "'") > 0); });
      applyFilter(c);
    },
    search: function (q) { ui.q = q || ''; var c = draft(); if (c) applyFilter(c); },
    setBlind: function (on, inDraft) {
      S().countBlind = !!on;
      var c = draft(); if (c && inDraft) { c.blind = !!on; refreshAll(c); }
      save();
    }
  };
})();

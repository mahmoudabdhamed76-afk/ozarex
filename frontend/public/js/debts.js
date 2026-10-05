/* ════════════════════════════════════════════════════════════════════
   ERP · سداد المديونية — debt repayment planner
   ------------------------------------------------------------------
   You write what you owe and to whom; the page builds a month-by-month
   plan and follows it with you:
   · suggested monthly amount from your real cash flow (last 90 days)
   · "finish in 6 / 12 / 24 months" solver + a live slider
   · strategies: ذكي (deadlines first → highest interest → smallest),
     الأعلى فايدة (avalanche), الأصغر أولاً (snowball), بالتناسب
   · debt-free date, total interest, what-if (+ extra per month),
     deadline warnings, remaining-balance glow chart, full schedule
   · record payments: a supplier-linked debt reads its live balance from
     the suppliers module and each payment is a real supplier payment;
     other debts can optionally post the payment as an expense
   Stored in settings._debts / settings._debtPlan.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var KINDS = { supplier: 'مورد', bank: 'بنك / قرض', person: 'شخص', rent: 'إيجار / أقساط', other: 'أخرى' };
  var STRAT = {
    smart:     { label: 'ذكي', hint: 'اللي ليها ميعاد لازم تتدفع الأول، وبعدين الأعلى فايدة، وبعدين الأصغر — عشان متتأخرش ومتدفعش فوايد زيادة' },
    avalanche: { label: 'الأعلى فايدة', hint: 'كل الزيادة تروح للمديونية اللي فايدتها أعلى — أقل فوايد إجمالي' },
    snowball:  { label: 'الأصغر أولاً', hint: 'تقفل المديونيات الصغيرة بسرعة واحدة ورا التانية — إحساس إنجاز وعدد جهات أقل' },
    equal:     { label: 'بالتناسب', hint: 'القسط يتوزع على الكل بنسبة كل مديونية — الكل بيقل مع بعض' }
  };
  var ui = { t: 0 };

  /* ── helpers ── */
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function debts() { var s = S(); if (!Array.isArray(s._debts)) s._debts = []; return s._debts; }
  function plan() { var s = S(); if (!s._debtPlan || typeof s._debtPlan !== 'object') s._debtPlan = { strategy: 'smart', budget: null }; return s._debtPlan; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n) { return Math.round(Number(n || 0)).toLocaleString('en-US'); }
  function cur() { var c = S().currency || 'جنيه'; return c === 'جنيه' ? 'ج.م' : c === 'ريال' ? 'ر.س' : c === 'درهم' ? 'د.إ' : String(c).slice(0, 3); }
  function money(n) { return num(n) + ' ' + cur(); }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function today() { return lds(new Date()); }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function save() { try { DB.save(); } catch (e) {} }
  function monthName(offset, short) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
    try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', short ? { month: 'short', year: '2-digit' } : { month: 'long', year: 'numeric' }).format(d); }
    catch (e) { return (d.getMonth() + 1) + '/' + d.getFullYear(); }
  }
  function monthsUntil(ds) {
    if (!ds) return null;
    var p = String(ds).split('-'), n = new Date();
    return (+p[0] - n.getFullYear()) * 12 + (+p[1] - 1 - n.getMonth());
  }
  function mText(n) { return n === 1 ? 'شهر' : n === 2 ? 'شهرين' : n <= 10 ? n + ' شهور' : n + ' شهر'; }
  function dmy(ds) { if (!ds) return ''; var p = String(ds).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
  function supBalance(sid) {
    if (typeof supplierMetrics === 'function') { try { return Math.max(0, supplierMetrics(sid).balance || 0); } catch (e) {} }
    return 0;
  }
  function supName(sid) { var s = A('suppliers').find(function (x) { return x.id === sid; }); return s ? s.name : ''; }
  function paidOf(d) { return (d.payments || []).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0); }
  function balanceOf(d) { return d.supplierId ? supBalance(d.supplierId) : Math.max(0, Number(d.amount || 0) - paidOf(d)); }
  function originalOf(d) { return d.supplierId ? balanceOf(d) + paidOf(d) : Number(d.amount || 0); }
  function paidThisMonth(d) {
    var m = today().slice(0, 7);
    return (d.payments || []).filter(function (p) { return String(p.date || '').slice(0, 7) === m; }).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
  }
  function active() { return debts().map(function (d) { return { d: d, bal: balanceOf(d) }; }); }

  /* ── cash-flow based suggestion (last 90 days) ── */
  function cashflow() {
    var from = lds(new Date(Date.now() - 89 * 864e5)), inn = 0, out = 0, mine = {};
    // payments made from this plan are the plan itself — they must not shrink the suggestion
    debts().forEach(function (d) { (d.payments || []).forEach(function (p) { if (p.spId) mine[p.spId] = 1; if (p.expId) mine[p.expId] = 1; }); });
    A('payments').forEach(function (p) { if (p.date >= from) inn += Number(p.amount || 0); });
    A('bankTransfers').forEach(function (t) {
      if (t.date < from) return;
      if (t.type === 'out' || t.type === 'withdrawal') out += Number(t.amount || 0); else inn += Number(t.amount || 0);
    });
    A('expenses').forEach(function (e) { if (e.date >= from && !mine[e.id] && !(e.kind === 'purchase' && e.paymentMethod === 'credit')) out += Number(e.amount || 0); });
    A('supplierPayments').forEach(function (p) { if (p.date >= from && !mine[p.id]) out += Number(p.amount || 0); });
    var net = (inn - out) / 3;
    return { inn: inn / 3, out: out / 3, net: net, suggest: net > 0 ? Math.max(100, Math.round(net * .5 / 100) * 100) : 0 };
  }

  /* ── the planner ── */
  function simulate(budget, strategy, firstMonthBudget) {
    var list = active().filter(function (x) { return x.bal > .5; }).map(function (x) {
      return { id: x.d.id, name: x.d.name, bal: x.bal, rate: Number(x.d.rate || 0), min: Number(x.d.minPay || 0), due: x.d.due || null, payoff: null, interest: 0 };
    });
    var months = [], totalInt = 0, stuck = false, MAX = 240;
    for (var m = 0; m < MAX; m++) {
      var live = list.filter(function (d) { return d.bal > .5; });
      if (!live.length) break;
      var before = live.reduce(function (s, d) { return s + d.bal; }, 0);
      live.forEach(function (d) { var i = d.bal * d.rate / 1200; d.bal += i; d.interest += i; totalInt += i; });
      var avail = m === 0 && firstMonthBudget != null ? firstMonthBudget : budget, pays = {};
      function pay(d, amt) { amt = Math.min(amt, d.bal, avail); if (amt <= 0) return; d.bal -= amt; avail -= amt; pays[d.id] = (pays[d.id] || 0) + amt; }
      live.forEach(function (d) { if (d.min) pay(d, d.min); });
      if (strategy === 'equal') {
        for (var pass = 0; pass < 4 && avail > .5; pass++) {
          var open = live.filter(function (d) { return d.bal > .5; }), tot = open.reduce(function (s, d) { return s + d.bal; }, 0), a0 = avail;
          if (!tot) break;
          open.forEach(function (d) { pay(d, a0 * d.bal / tot); });
        }
      } else {
        if (strategy === 'smart') {                                // hit every deadline: pay what each one needs this month
          live.filter(function (d) { return d.due; }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); }).forEach(function (d) {
            var left = Math.max(1, monthsUntil(d.due) - m + 1);
            pay(d, d.bal / left);
          });
        }
        var order = live.slice().sort(function (a, b) {
          if (strategy === 'snowball') return a.bal - b.bal;
          if (strategy === 'avalanche') return (b.rate - a.rate) || (a.bal - b.bal);
          // smart
          var ad = a.due ? 0 : 1, bd = b.due ? 0 : 1;
          return (ad - bd) || (a.due && b.due ? String(a.due).localeCompare(String(b.due)) : 0) || (b.rate - a.rate) || (a.bal - b.bal);
        });
        order.forEach(function (d) { pay(d, avail); });
      }
      live.forEach(function (d) { if (d.bal <= .5 && d.payoff == null) { d.bal = 0; d.payoff = m; } });
      var after = list.reduce(function (s, d) { return s + Math.max(0, d.bal); }, 0);
      months.push({ m: m, pays: pays, paid: Object.keys(pays).reduce(function (s, k) { return s + pays[k]; }, 0), remaining: after });
      if (m > 2 && after >= before - .5) { stuck = true; break; }
    }
    var left = list.filter(function (d) { return d.bal > .5; });
    return { months: months, debts: list, interest: totalInt, done: !left.length && !stuck, stuck: stuck || !!left.length,
      payoffMonth: left.length ? null : months.length - 1 };
  }
  function minBudget() {
    return active().reduce(function (s, x) { return s + (x.bal > .5 ? x.bal * Number(x.d.rate || 0) / 1200 + Number(x.d.minPay || 0) : 0); }, 0);
  }
  function solveFor(months, strategy) {                       // smallest monthly amount that finishes within N months
    var total = active().reduce(function (s, x) { return s + x.bal; }, 0);
    if (!total) return 0;
    var lo = Math.max(1, minBudget()), hi = total * 2 + 1;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2, r = simulate(mid, strategy);
      if (r.done && r.months.length <= months) hi = mid; else lo = mid;
    }
    return Math.ceil(hi / 50) * 50;
  }
  function budgetNow() {
    var p = plan();
    if (p.budget > 0) return Number(p.budget);
    var cf = cashflow();
    return cf.suggest || solveFor(12, p.strategy || 'smart') || 0;
  }
  function firstBudget(b) {
    var paid = debts().reduce(function (s, d) { return s + paidThisMonth(d); }, 0);
    return Math.max(0, b - paid);
  }

  /* ── page ── */
  function renderDebts() {
    var root = document.getElementById('page-content'); if (!root) return;
    var list = active(), total = list.reduce(function (s, x) { return s + x.bal; }, 0);
    var orig = debts().reduce(function (s, d) { return s + originalOf(d); }, 0), paid = Math.max(0, orig - total);
    var head = '<div class="page-header dbt-head"><div><h2 class="page-title">سداد المديونية</h2>' +
      '<p class="page-subtitle">اكتب عليك كام ولمين — والبرنامج يعملك خطة سداد شهر بشهر ويتابعها معاك</p></div>' +
      '<div class="page-actions">' + (importable().length ? '<button class="btn btn-secondary" onclick="AXDebt.importSuppliers()">استيراد من الموردين</button>' : '') +
      '<button class="btn btn-primary" onclick="AXDebt.form()">+ مديونية جديدة</button></div></div>';
    if (!debts().length) {
      root.innerHTML = head +
        '<section class="dbt-empty"><div class="dbt-empty-ic">' + ICON.target + '</div><b>ابدأ بأول مديونية</b>' +
        '<span>اكتب اسم الجهة اللي ليها فلوس عندك والمبلغ، ولو ليها فايدة أو ميعاد لازم تخلص فيه. البرنامج هيقترح قسط شهري من حركة الخزنة عندك، ويرتّب مين يتدفع الأول، ويقولك هتخلص إمتى بالظبط.</span>' +
        '<div class="dbt-empty-act"><button class="btn btn-primary" onclick="AXDebt.form()">+ مديونية جديدة</button>' +
        (importable().length ? '<button class="btn btn-secondary" onclick="AXDebt.importSuppliers()">استيراد اللي عليك للموردين (' + importable().length + ')</button>' : '') + '</div></section>';
      return;
    }
    var p = plan(), b = budgetNow(), cf = cashflow(), mb = minBudget();
    if (!(p.budget > 0) && b > 0) { p.budget = b; save(); }          // the plan keeps its amount until you change it
    root.innerHTML = head +
      '<section class="dbt-hero">' +
        '<div class="dbt-ring">' + ring(orig ? paid / orig * 100 : 0) + '<div class="dbt-ring-c"><b>' + (orig ? Math.round(paid / orig * 100) : 0) + '%</b><span>اتسدّد</span></div></div>' +
        '<div class="dbt-hero-main">' +
          '<span class="dbt-eyebrow">إجمالي المتبقي عليك</span><b class="dbt-total">' + money(total) + '</b>' +
          '<div id="dbt-free" class="dbt-free"></div>' +
          '<div class="dbt-hero-figs">' +
            '<div><span>اتسدّد لحد دلوقتي</span><b>' + money(paid) + '</b></div>' +
            '<div><span>عدد الجهات</span><b>' + list.filter(function (x) { return x.bal > .5; }).length + '</b></div>' +
            '<div id="dbt-month"></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="dash-card dbt-plan">' +
        '<div class="dash-card-header"><div class="dash-card-title">خطة السداد</div><button class="dbt-link" onclick="AXDebt.print()">' + ICON.print + ' طباعة الخطة</button></div>' +
        '<div class="dbt-budget">' +
          '<label for="dbt-b">القسط الشهري اللي تقدر تدفعه</label>' +
          '<div class="dbt-bin"><input id="dbt-b" type="number" inputmode="numeric" min="0" step="100" value="' + Math.round(b) + '" oninput="AXDebt.budget(this.value)"><span>' + cur() + ' / شهر</span></div>' +
          '<input id="dbt-r" class="dbt-range" type="range" min="' + Math.max(100, Math.ceil(mb / 100) * 100) + '" max="' + Math.max(1000, Math.ceil(total / 100) * 100) + '" step="100" value="' + Math.round(b) + '" oninput="AXDebt.budget(this.value, true)" aria-label="القسط الشهري">' +
          '<div class="dbt-chips">' +
            (cf.suggest ? '<button onclick="AXDebt.budget(' + cf.suggest + ',false,true)"><b>' + money(cf.suggest) + '</b><span>نص الفايض الشهري عندك</span></button>' : '') +
            [6, 12, 24].map(function (n) { var v = solveFor(n, p.strategy || 'smart'); return v ? '<button onclick="AXDebt.budget(' + v + ',false,true)"><b>' + money(v) + '</b><span>تخلص في ' + mText(n) + '</span></button>' : ''; }).join('') +
          '</div>' +
          '<p class="dbt-cf">' + (cf.net > 0
            ? 'آخر 3 شهور: بيدخلك في المتوسط <b>' + money(cf.inn) + '</b> وبيخرج <b>' + money(cf.out) + '</b> — يعني فايض حوالي <b>' + money(cf.net) + '</b> في الشهر.'
            : 'آخر 3 شهور الخارج أكتر من الداخل (' + money(Math.abs(cf.net)) + ' في الشهر) — ابدأ بأقل قسط تقدر عليه وراجع المصروفات.') + '</p>' +
        '</div>' +
        '<div class="dbt-strat"><span>طريقة الترتيب</span><div class="ax-seg" role="radiogroup">' + Object.keys(STRAT).map(function (k) {
          return '<button role="radio" aria-checked="' + ((p.strategy || 'smart') === k) + '" class="' + ((p.strategy || 'smart') === k ? 'on' : '') + '" onclick="AXDebt.strategy(\'' + k + '\')">' + STRAT[k].label + '</button>';
        }).join('') + '</div><p id="dbt-sh">' + STRAT[p.strategy || 'smart'].hint + '</p></div>' +
        '<div id="dbt-out"></div>' +
      '</section>' +

      '<div class="dbt-list" id="dbt-list"></div>' +

      '<section class="dash-card dbt-sched"><div class="dash-card-header"><div class="dash-card-title">جدول السداد شهر بشهر</div><div class="skh-note" id="dbt-sn"></div></div><div id="dbt-sched"></div></section>';
    update();
  }

  /* recompute plan pieces only (keeps the input focused while typing / sliding) */
  function update() {
    var p = plan(), b = budgetNow(), st = p.strategy || 'smart';
    var sim = simulate(b, st, firstBudget(b)), total = active().reduce(function (s, x) { return s + x.bal; }, 0);
    var mb = minBudget();
    var out = document.getElementById('dbt-out'); if (!out) return;
    var free = document.getElementById('dbt-free');
    if (!total) {
      free.innerHTML = '<b class="ok">مفيش عليك حاجة — مبروك 🎉</b>';
    } else if (sim.done) {
      free.innerHTML = '<span>هتخلص كل المديونيات في</span><b>' + monthName(sim.payoffMonth) + '</b><em>بعد ' + mText(sim.payoffMonth + 1) + '</em>';
    } else {
      free.innerHTML = '<b class="bad">القسط ده مش كفاية يقفل المديونية</b><span>لازم يزيد عن ' + money(mb) + ' في الشهر عشان يغطي الفوايد والحد الأدنى</span>';
    }
    // this month
    var mo = document.getElementById('dbt-month');
    var paidNow = debts().reduce(function (s, d) { return s + paidThisMonth(d); }, 0);
    mo.innerHTML = '<span>اتدفع الشهر ده</span><b>' + money(paidNow) + ' <small>من ' + money(Math.min(b, total + paidNow)) + '</small></b>';

    // result + what-if + warnings
    var html = '';
    if (total && sim.done) {
      var extra = Math.max(500, Math.round(b * .2 / 100) * 100), sim2 = simulate(b + extra, st, firstBudget(b + extra));
      var saveM = sim2.done ? sim.months.length - sim2.months.length : 0, saveI = sim.interest - sim2.interest;
      html += '<div class="dbt-res">' +
        '<div><span>عدد الأقساط</span><b>' + sim.months.length + '</b></div>' +
        '<div><span>آخر قسط</span><b>' + monthName(sim.payoffMonth) + '</b></div>' +
        '<div><span>فوايد متوقعة</span><b class="' + (sim.interest > 1 ? 'warn' : 'ok') + '">' + (sim.interest > 1 ? money(sim.interest) : 'مفيش') + '</b></div>' +
        '<div><span>إجمالي هتدفعه</span><b>' + money(total + sim.interest) + '</b></div>' +
      '</div>';
      if (saveM > 0 || saveI > 1) html += '<div class="dbt-whatif">' + ICON.bolt + '<span>لو زوّدت <b>' + money(extra) + '</b> في الشهر هتخلص ' +
        (saveM > 0 ? 'قبلها بـ <b>' + mText(saveM) + '</b>' : 'في نفس الوقت') +
        (saveI > 1 ? ' وتوفّر <b>' + money(saveI) + '</b> فوايد' : '') + '.</span><button onclick="AXDebt.budget(' + (b + extra) + ',false,true)">جرّبها</button></div>';
    }
    // deadline check
    sim.debts.forEach(function (d) {
      if (!d.due) return;
      var mu = monthsUntil(d.due);
      if (d.payoff == null || d.payoff > mu) {
        html += '<div class="dbt-warn">' + ICON.alert + '<span><b>' + esc(d.name) + '</b> لازم تخلص قبل ' + dmy(d.due) + ' — ' +
          (d.payoff == null ? 'الخطة الحالية مش هتقفلها.' : 'الخطة هتقفلها ' + monthName(d.payoff) + '.') + ' اختار «ذكي» أو زوّد القسط.</span></div>';
      }
    });
    html += '<div id="dbt-chart" class="dbt-chart"></div>';
    out.innerHTML = html;
    if (window.AXChart && sim.months.length) {
      var labels = ['النهارده'].concat(sim.months.map(function (x) { return monthName(x.m, true); }));
      var vals = [total].concat(sim.months.map(function (x) { return x.remaining; }));
      AXChart.line(document.getElementById('dbt-chart'), {
        labels: labels, height: 220, title: 'المتبقي شهر بشهر', fmt: function (v) { return num(v); },
        series: [{ name: 'المتبقي', values: vals, color: 'var(--ax-warn)' }],
        detail: function (i) { return i ? [['قسط الشهر', money(sim.months[i - 1].paid), null]] : []; }
      });
    }
    renderList(sim, b);
    renderSched(sim);
  }

  function renderList(sim, b) {
    var box = document.getElementById('dbt-list'); if (!box) return;
    var byId = {}; sim.debts.forEach(function (d) { byId[d.id] = d; });
    var m0 = sim.months[0] ? sim.months[0].pays : {};
    box.innerHTML = debts().map(function (d) {
      var bal = balanceOf(d), orig = originalOf(d), paid = Math.max(0, orig - bal), pct = orig ? paid / orig * 100 : 100;
      var s = byId[d.id], planned = (m0[d.id] || 0) + paidThisMonth(d), paidM = paidThisMonth(d);
      var status = bal <= .5 ? '<span class="dbt-st ok">اتسدّدت ✓</span>'
        : d.due && monthsUntil(d.due) < 0 ? '<span class="dbt-st bad">فات ميعادها</span>'
        : planned > 0 && paidM >= planned - .5 ? '<span class="dbt-st ok">قسط الشهر اتدفع</span>'
        : planned > 0 ? '<span class="dbt-st warn">قسط الشهر: ' + money(planned - paidM) + '</span>'
        : '<span class="dbt-st">مستنية دورها</span>';
      return '<article class="dbt-card' + (bal <= .5 ? ' is-done' : '') + '">' +
        '<header><span class="dbt-ic k-' + (d.kind || 'other') + '">' + (ICON[d.kind] || ICON.other) + '</span>' +
          '<div class="dbt-ct"><b>' + esc(d.name) + '</b><span>' + (KINDS[d.kind] || 'أخرى') + (d.supplierId ? ' · مربوطة بحساب المورد' : '') +
            (Number(d.rate) ? ' · فايدة ' + d.rate + '% سنوياً' : '') + (d.due ? ' · قبل ' + dmy(d.due) : '') + '</span></div>' + status + '</header>' +
        '<div class="dbt-amt"><div><span>المتبقي</span><b>' + money(bal) + '</b></div><div><span>الأصل</span><b class="mut">' + money(orig) + '</b></div>' +
          '<div><span>هتخلص</span><b class="mut">' + (bal <= .5 ? '—' : s && s.payoff != null ? monthName(s.payoff) : '؟') + '</b></div></div>' +
        '<div class="dbt-bar"><i style="width:' + Math.min(100, pct).toFixed(1) + '%"></i></div>' +
        '<div class="dbt-bar-l"><span>اتسدّد ' + Math.round(pct) + '%</span><span>' + (d.payments || []).length + ' دفعة</span></div>' +
        '<footer>' +
          (bal > .5 ? '<button class="dbt-pay" onclick="AXDebt.pay(\'' + d.id + '\')">' + ICON.cash + ' سداد دفعة</button>' : '') +
          '<button onclick="AXDebt.history(\'' + d.id + '\')">السجل</button>' +
          '<button onclick="AXDebt.form(\'' + d.id + '\')">تعديل</button>' +
          '<button class="del" onclick="AXDebt.remove(\'' + d.id + '\')" aria-label="حذف">' + ICON.trash + '</button>' +
        '</footer></article>';
    }).join('');
  }

  function renderSched(sim) {
    var box = document.getElementById('dbt-sched'); if (!box) return;
    var sn = document.getElementById('dbt-sn');
    var ds = sim.debts;
    if (!sim.months.length) { box.innerHTML = '<div class="skh-empty sm"><span>مفيش أقساط — كل المديونيات اتسدّدت</span></div>'; if (sn) sn.textContent = ''; return; }
    if (sn) sn.textContent = sim.months.length + ' شهر';
    var rows = sim.months.slice(0, 60);
    box.innerHTML = '<div class="dbt-tw"><table class="dbt-tbl"><thead><tr><th>الشهر</th>' + ds.map(function (d) { return '<th>' + esc(d.name) + '</th>'; }).join('') +
      '<th>القسط</th><th>المتبقي بعده</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr' + (r.m === 0 ? ' class="now"' : '') + '><td>' + monthName(r.m) + '</td>' + ds.map(function (d) {
          var v = r.pays[d.id]; return '<td>' + (v ? num(v) : '<span class="z">—</span>') + (d.payoff === r.m ? ' <i class="fin">✓</i>' : '') + '</td>';
        }).join('') + '<td><b>' + num(r.paid) + '</b></td><td>' + num(r.remaining) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (sim.months.length > 60 ? '<p class="dbt-cf">أول 60 شهر بس — زوّد القسط عشان المدة تقل.</p>' : '');
  }

  function ring(pct) {
    var C = 2 * Math.PI * 52;
    return '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="dbt-ring-t"/>' +
      '<circle cx="60" cy="60" r="52" class="dbt-ring-b" style="stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + (C * (1 - Math.min(100, pct) / 100)).toFixed(1) + '"/></svg>';
  }

  /* ── forms ── */
  function importable() {
    var linked = {}; debts().forEach(function (d) { if (d.supplierId) linked[d.supplierId] = 1; });
    return A('suppliers').filter(function (s) { return !linked[s.id] && supBalance(s.id) > .5; });
  }
  function form(did) {
    var d = did ? debts().find(function (x) { return x.id === did; }) : null; d = d || {};
    var sups = A('suppliers');
    openModal(did ? 'تعديل مديونية' : 'مديونية جديدة',
      '<form id="dbt-form" class="dbt-form" onsubmit="return false">' +
        '<div class="form-group"><label>الجهة اللي ليها الفلوس *</label><input class="form-control" name="name" required list="dbt-names" value="' + esc(d.name || '') + '" placeholder="مثال: بنك مصر / شركة عبدالله للورق / أ. محمد">' +
          '<datalist id="dbt-names">' + sups.map(function (s) { return '<option value="' + esc(s.name) + '">'; }).join('') + '</datalist></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>النوع</label><select class="form-control" name="kind" onchange="AXDebt.kindChange(this.value)">' + Object.keys(KINDS).map(function (k) {
            return '<option value="' + k + '"' + ((d.kind || 'other') === k ? ' selected' : '') + '>' + KINDS[k] + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-group" id="dbt-supg"' + ((d.kind || '') === 'supplier' ? '' : ' style="display:none"') + '><label>اربطها بحساب المورد</label><select class="form-control" name="supplierId" onchange="AXDebt.supChange(this.value)"><option value="">— من غير ربط —</option>' +
            sups.map(function (s) { return '<option value="' + s.id + '"' + (d.supplierId === s.id ? ' selected' : '') + '>' + esc(s.name) + ' — عليك ' + money(supBalance(s.id)) + '</option>'; }).join('') + '</select></div>' +
        '</div>' +
        '<div class="form-group" id="dbt-amtg"' + (d.supplierId ? ' style="display:none"' : '') + '><label>المبلغ المدين بيه *</label><input class="form-control" name="amount" type="number" inputmode="decimal" min="0" step="any" value="' + (d.amount || '') + '" placeholder="اكتب المتبقي عليك دلوقتي"></div>' +
        '<p class="dbt-hint" id="dbt-suphint"' + (d.supplierId ? '' : ' style="display:none"') + '>المتبقي هيتقري أوتوماتيك من حساب المورد، وكل دفعة هتتسجل سداد للمورد.</p>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>الفايدة السنوية % <small>(لو فيه)</small></label><input class="form-control" name="rate" type="number" inputmode="decimal" min="0" step="0.1" value="' + (d.rate || '') + '" placeholder="0"></div>' +
          '<div class="form-group"><label>أقل قسط شهري <small>(لو متفق عليه)</small></label><input class="form-control" name="minPay" type="number" inputmode="decimal" min="0" step="any" value="' + (d.minPay || '') + '" placeholder="0"></div>' +
        '</div>' +
        '<div class="form-group"><label>لازم تخلص قبل <small>(اختياري)</small></label><input class="form-control" name="due" type="date" value="' + esc(d.due || '') + '"></div>' +
        '<div class="form-group"><label>ملاحظات</label><input class="form-control" name="note" value="' + esc(d.note || '') + '"></div>' +
      '</form>',
      '<button class="btn btn-primary" onclick="AXDebt.saveForm(\'' + (did || '') + '\')">حفظ</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
  }
  function saveForm(did) {
    var f = document.getElementById('dbt-form'); if (!f) return;
    var v = Object.fromEntries(new FormData(f));
    v.name = String(v.name || '').trim();
    if (v.kind !== 'supplier') v.supplierId = '';
    if (v.supplierId && !v.name) v.name = supName(v.supplierId);
    if (!v.name) { toast('اكتب اسم الجهة', 'error'); return; }
    var amt = Number(v.amount || 0);
    if (!v.supplierId && !(amt > 0)) { toast('اكتب المبلغ المدين بيه', 'error'); return; }
    var rec = { name: v.name, kind: v.kind || 'other', supplierId: v.supplierId || '', amount: v.supplierId ? 0 : amt,
      rate: Number(v.rate || 0), minPay: Number(v.minPay || 0), due: v.due || '', note: v.note || '' };
    if (did) { var d = debts().find(function (x) { return x.id === did; }); if (d) Object.assign(d, rec); }
    else debts().push(Object.assign({ id: 'dbt_' + id(), createdAt: Date.now(), payments: [] }, rec));
    save(); closeModal(); toast(did ? 'اتعدّلت' : 'اتضافت المديونية'); renderDebts();
  }
  function importSuppliers() {
    var list = importable();
    if (!list.length) { toast('مفيش موردين عليك ليهم فلوس', 'warning'); return; }
    openModal('استيراد من الموردين',
      '<p class="ax-modal-lead">اختار الموردين اللي عايز تحطهم في خطة السداد. المتبقي هيتقري من حساب كل مورد أوتوماتيك، وأي دفعة هتتسجل سداد للمورد.</p>' +
      '<div class="dbt-imp">' + list.map(function (s) {
        return '<label><input type="checkbox" value="' + s.id + '" checked><span>' + esc(s.name) + '</span><b>' + money(supBalance(s.id)) + '</b></label>';
      }).join('') + '</div>',
      '<button class="btn btn-primary" onclick="AXDebt.doImport()">استيراد</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
  }
  function doImport() {
    var n = 0;
    document.querySelectorAll('.dbt-imp input:checked').forEach(function (c) {
      debts().push({ id: 'dbt_' + id(), createdAt: Date.now(), payments: [], name: supName(c.value), kind: 'supplier', supplierId: c.value, amount: 0, rate: 0, minPay: 0, due: '', note: '' });
      n++;
    });
    save(); closeModal(); toast('اتضاف ' + n + ' مورد للخطة'); renderDebts();
  }
  function payForm(did) {
    var d = debts().find(function (x) { return x.id === did; }); if (!d) return;
    var b = budgetNow(), sim = simulate(b, plan().strategy || 'smart', firstBudget(b));
    var planned = sim.months[0] ? (sim.months[0].pays[d.id] || 0) : 0, bal = balanceOf(d);
    var sugg = Math.round(Math.min(bal, planned || bal));
    openModal('سداد دفعة — ' + esc(d.name),
      '<form id="dbt-pay" onsubmit="return false">' +
        '<div class="dbt-payhead"><div><span>المتبقي</span><b>' + money(bal) + '</b></div><div><span>قسط الشهر في الخطة</span><b>' + (planned ? money(planned) : '—') + '</b></div></div>' +
        '<div class="form-group"><label>المبلغ *</label><input class="form-control" name="amount" type="number" inputmode="decimal" min="0" step="any" value="' + (sugg || '') + '" required></div>' +
        '<div class="dbt-quick">' + [planned, bal / 2, bal].filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; }).map(function (v, i) {
          return '<button type="button" onclick="document.querySelector(\'#dbt-pay [name=amount]\').value=' + Math.round(v) + '">' + (v === bal ? 'الباقي كله' : v === planned ? 'قسط الشهر' : 'النص') + ' · ' + num(v) + '</button>'; }).join('') + '</div>' +
        '<div class="form-row"><div class="form-group"><label>التاريخ</label><input class="form-control" name="date" type="date" value="' + today() + '"></div>' +
          '<div class="form-group"><label>طريقة الدفع</label><select class="form-control" name="method"><option value="cash">كاش</option><option value="transfer">تحويل بنكي</option><option value="check">شيك</option></select></div></div>' +
        '<div class="form-group"><label>ملاحظة</label><input class="form-control" name="note" placeholder="اختياري"></div>' +
        (d.supplierId ? '<p class="dbt-hint">هتتسجل سداد للمورد «' + esc(supName(d.supplierId)) + '» ورصيده هيقل أوتوماتيك.</p>'
          : '<label class="dbt-check"><input type="checkbox" name="asExpense"><span>اخصمها من الخزنة (تتسجل مصروف «سداد مديونيات»)</span></label>') +
      '</form>',
      '<button class="btn btn-primary" onclick="AXDebt.savePay(\'' + did + '\')">تسجيل الدفعة</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
  }
  function savePay(did) {
    var d = debts().find(function (x) { return x.id === did; }); if (!d) return;
    var v = Object.fromEntries(new FormData(document.getElementById('dbt-pay')));
    var amt = Number(v.amount || 0);
    if (!(amt > 0)) { toast('اكتب مبلغ صحيح', 'error'); return; }
    var bal = balanceOf(d);
    if (amt > bal + .5) { toast('المبلغ أكبر من المتبقي (' + money(bal) + ')', 'error'); return; }
    var p = { id: 'dp_' + id(), date: v.date || today(), amount: amt, method: v.method || 'cash', note: v.note || '', createdAt: Date.now() };
    if (d.supplierId) {
      if (!Array.isArray(D().supplierPayments)) D().supplierPayments = [];
      var sp = { id: 'sp_' + id(), supplierId: d.supplierId, supplierName: supName(d.supplierId), amount: amt, date: p.date, method: p.method,
        beneficiaryName: '', note: 'سداد من خطة المديونية' + (p.note ? ' — ' + p.note : ''), createdAt: Date.now() };
      D().supplierPayments.push(sp); p.spId = sp.id;
    } else if (v.asExpense) {
      var ex = { id: 'ex_' + id(), category: 'سداد مديونيات', amount: amt, date: p.date, description: 'سداد لـ ' + d.name + (p.note ? ' — ' + p.note : ''), paymentMethod: p.method, createdAt: Date.now() };
      D().expenses.push(ex); p.expId = ex.id;
    }
    if (!Array.isArray(d.payments)) d.payments = [];
    d.payments.push(p);
    save(); closeModal();
    var left = balanceOf(d);
    toast(left <= .5 ? 'اتقفلت مديونية ' + d.name + ' 🎉' : 'اتسجلت الدفعة — فاضل ' + money(left));
    if (left <= .5 && typeof celebrate === 'function') { try { celebrate(); } catch (e) {} }
    renderDebts();
  }
  function history(did) {
    var d = debts().find(function (x) { return x.id === did; }); if (!d) return;
    var ps = (d.payments || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || b.createdAt - a.createdAt; });
    openModal('سجل الدفعات — ' + esc(d.name),
      ps.length ? '<ul class="dbt-hist">' + ps.map(function (p) {
        return '<li><div><b>' + money(p.amount) + '</b><span>' + dmy(p.date) + (p.note ? ' · ' + esc(p.note) : '') + (p.spId ? ' · سداد للمورد' : p.expId ? ' · اتسجل مصروف' : '') + '</span></div>' +
          '<button onclick="AXDebt.delPay(\'' + d.id + '\',\'' + p.id + '\')" aria-label="حذف الدفعة">' + ICON.trash + '</button></li>';
      }).join('') + '</ul>' : '<div class="skh-empty sm"><span>لسه مفيش دفعات</span></div>',
      '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
  }
  function delPay(did, pid) {
    var d = debts().find(function (x) { return x.id === did; }); if (!d) return;
    confirmDialog('تحذف الدفعة دي؟' + ' لو كانت مسجلة سداد لمورد أو مصروف هتتحذف من هناك كمان.', function () {
      var p = (d.payments || []).find(function (x) { return x.id === pid; });
      if (p && p.spId) D().supplierPayments = A('supplierPayments').filter(function (x) { return x.id !== p.spId; });
      if (p && p.expId) D().expenses = A('expenses').filter(function (x) { return x.id !== p.expId; });
      d.payments = (d.payments || []).filter(function (x) { return x.id !== pid; });
      save(); closeModal(); toast('اتحذفت الدفعة'); renderDebts();
    });
  }
  function remove(did) {
    var d = debts().find(function (x) { return x.id === did; }); if (!d) return;
    confirmDialog('تشيل «' + d.name + '» من خطة السداد؟ (الدفعات اللي اتسجلت للموردين أو المصروفات هتفضل زي ما هي)', function () {
      S()._debts = debts().filter(function (x) { return x.id !== did; });
      save(); toast('اتشالت من الخطة'); renderDebts();
    });
  }
  function print() {
    var b = budgetNow(), st = plan().strategy || 'smart', sim = simulate(b, st, firstBudget(b));
    var total = active().reduce(function (s, x) { return s + x.bal; }, 0), co = S().companyName || 'نظام الحسابات';
    var w = window.open('', '_blank'); if (!w) { toast('المتصفح منع نافذة الطباعة', 'error'); return; }
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>خطة سداد المديونية</title><style>@page{size:A4;margin:14mm}body{font-family:"Zain","IBM Plex Sans Arabic","Cairo",Tahoma,sans-serif;color:#000}' +
      'h1{margin:0;font-size:22px}h2{margin:4px 0 12px;font-size:14px;font-weight:600;color:#444}.s{display:flex;gap:22px;margin:0 0 12px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}th,td{border:1px solid #000;padding:6px;text-align:right}th{background:#eee}</style></head><body>' +
      '<h1>' + esc(co) + '</h1><h2>خطة سداد المديونية — ' + today() + ' · طريقة الترتيب: ' + STRAT[st].label + '</h2>' +
      '<div class="s"><b>المتبقي: ' + money(total) + '</b><span>القسط: ' + money(b) + ' / شهر</span><span>' + (sim.done ? 'آخر قسط: ' + monthName(sim.payoffMonth) : 'القسط مش كفاية') + '</span><span>فوايد متوقعة: ' + money(sim.interest) + '</span></div>' +
      '<table><thead><tr><th>الجهة</th><th>المتبقي</th><th>الفايدة</th><th>لازم قبل</th><th>هتخلص</th></tr></thead><tbody>' + sim.debts.map(function (d) {
        return '<tr><td>' + esc(d.name) + '</td><td>' + money(active().find(function (x) { return x.d.id === d.id; }).bal) + '</td><td>' + (d.rate ? d.rate + '%' : '—') + '</td><td>' + (d.due ? dmy(d.due) : '—') + '</td><td>' + (d.payoff != null ? monthName(d.payoff) : '—') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<table><thead><tr><th>الشهر</th>' + sim.debts.map(function (d) { return '<th>' + esc(d.name) + '</th>'; }).join('') + '<th>القسط</th><th>المتبقي</th><th>اتدفع ✓</th></tr></thead><tbody>' +
      sim.months.slice(0, 60).map(function (r) { return '<tr><td>' + monthName(r.m) + '</td>' + sim.debts.map(function (d) { return '<td>' + (r.pays[d.id] ? num(r.pays[d.id]) : '') + '</td>'; }).join('') + '<td>' + num(r.paid) + '</td><td>' + num(r.remaining) + '</td><td></td></tr>'; }).join('') +
      '</tbody></table><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }

  var ICON = {
    supplier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    rent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8v10H3z"/><path d="M9 21v-6h6v6"/></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>'
  };

  window.renderDebts = renderDebts;
  window.AXDebt = {
    form: form, saveForm: saveForm, pay: payForm, savePay: savePay, history: history, delPay: delPay, remove: remove,
    importSuppliers: importSuppliers, doImport: doImport, print: print, simulate: simulate, solveFor: solveFor,
    kindChange: function (k) {
      var g = document.getElementById('dbt-supg'); if (g) g.style.display = k === 'supplier' ? '' : 'none';
      if (k !== 'supplier') AXDebt.supChange('');
    },
    supChange: function (sid) {
      var a = document.getElementById('dbt-amtg'), h = document.getElementById('dbt-suphint');
      if (a) a.style.display = sid ? 'none' : ''; if (h) h.style.display = sid ? '' : 'none';
      var n = document.querySelector('#dbt-form [name=name]'); if (sid && n && !n.value) n.value = supName(sid);
      if (!sid) { var s = document.querySelector('#dbt-form [name=supplierId]'); if (s) s.value = ''; }
    },
    budget: function (v, fromRange, apply) {
      var n = Math.max(0, Number(v) || 0);
      plan().budget = n;
      var bi = document.getElementById('dbt-b'), br = document.getElementById('dbt-r');
      if (bi && (fromRange || apply)) bi.value = Math.round(n);
      if (br && !fromRange) { if (n > Number(br.max)) br.max = Math.ceil(n / 100) * 100; br.value = n; }
      clearTimeout(ui.t); ui.t = setTimeout(function () { update(); save(); }, apply ? 0 : 120);
    },
    strategy: function (k) {
      plan().strategy = k; save();
      document.querySelectorAll('.dbt-strat .ax-seg button').forEach(function (b) { var on = b.getAttribute('onclick').indexOf("'" + k + "'") > 0; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      var h = document.getElementById('dbt-sh'); if (h) h.textContent = STRAT[k].hint;
      update();
    }
  };
})();

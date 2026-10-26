/* ════════════════════════════════════════════════════════════════════
   ERP · «أرباحي» ← «الفلوس» (4.38) — حساب الشهر بزرار واحد
   ------------------------------------------------------------------
   · «احسب الشهر»: تقدر تسحب كام · الخزنة المفروض فيها كام وفيها كام ·
     الفلوس دخلت منين وخرجت فين (خزنة / بنك) · المصروفات حسب النوع ومقارنة
     بالمتوسط · «الربح راح فين؟» (مضبوط بالقرش) · تقفيلات اليومية والعجز ·
     تحليل ذكي للمخالفات · مصاريف مستنية موافقتك · مين سجّل إيه · المسحوبات
   · «تقفيل اليومية» (من صفحة التحصيل / المصروفات): عدّ أعمى بالفئات —
     اللي بيعدّ ما بيشوفش المفروض كام
   · إيصال المصروف إجباري فوق الحد، والمصروف الكبير أو بتاريخ يوم اتقفل
     محتاج موافقة المدير (js/axcore.js — نفس القاعدة على السيرفر)
   The numbers: js/cashbook.js (AXCash). Settings: settings._cashCfg (per branch).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { month: '', ran: false, busy: false };
  var DEN = [200, 100, 50, 20, 10, 5, 1];

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function N(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(v) { return Math.round(N(v) * 100) / 100; }
  function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(N(n)); } catch (e) {} return num(n); }
  function sgn(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v)); }
  function ds(x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  function today() { return typeof todayStr === 'function' ? todayStr() : ds(new Date()); }
  function dmy(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) : ''; }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function id() { return typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2, 12); }
  function me() { var u = typeof currentUser !== 'undefined' && currentUser; return u ? { id: u.id, name: u.name || u.username || '' } : { id: '', name: '' }; }
  function admin() { return typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin'; }
  function may(p) { try { return admin() || (typeof can === 'function' && can(p)); } catch (e) { return false; } }
  function canClose() { return may('payments') || may('expenses'); }
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function monthOf(ym) { var p = ym.split('-'); return { from: ym + '-01', to: ds(new Date(+p[0], +p[1], 0)), label: MONTHS[+p[1] - 1] + ' ' + p[0] }; }
  function branchName() { try { if (window.Branch && Branch.info) { var b = Branch.info(); return (b && b.name) || ''; } } catch (e) {} return ''; }
  function cfgRaw() { var c = S()._cashCfg; return c && typeof c === 'object' ? c : {}; }

  /* supplier credit due in the next 30 days (what is still unpaid on each purchase invoice) */
  function dueSoon() {
    try {                                   // all purchase invoices (not the purchases page's own date filter)
      if (!window.AXPur || !AXPur.paidMap) return 0;
      var lim = AXCash.addDays(today(), 30), pm = AXPur.paidMap(), ret = {};
      (window.AXBStats ? AXBStats.rets(D()) : []).forEach(function (r) { if (r.type === 'purchase' && r.src && r.src.id) ret[r.src.id] = (ret[r.src.id] || 0) + N(r.amount); });
      return r2((D().expenses || []).filter(function (p) { return p && p.kind === 'purchase' && p.paymentMethod === 'credit' && p.dueDate && p.dueDate <= lim; })
        .reduce(function (s, p) { return s + Math.max(0, N(p.amount) - (ret[p.id] || 0) - N(pm[p.id])); }, 0));
    } catch (e) { return 0; }
  }

  function compute() {
    var m = monthOf(ui.month), P = window.AXProfit && AXProfit.compute ? AXProfit.compute(D(), m.from, m.to).cur : { rev: 0, cost: 0, exp: 0, net: 0 };
    var R = AXCash.report(D(), m.from, m.to, { today: today(), profit: { rev: P.rev, cost: P.cost, exp: P.exp, net: P.net, cons: P.cons || 0 }, dueSoon: dueSoon(), fmt: money, fdate: function (x) { var q = String(x || '').split('-'); return q.length === 3 ? (+q[2]) + '/' + (+q[1]) : x; } });
    R.m = m; R.P = P;
    return R;
  }

  /* ════════ the tab ════════ */
  function render(host) {
    host = host || document.getElementById('fx-root'); if (!host) return;
    if (!window.AXCash) { host.innerHTML = '<div class="pfx-empty">ملف الحسابات مش متحمّل</div>'; return; }
    if (!ui.month) ui.month = today().slice(0, 7);
    var cfg = AXCash.cfgOf(D()), m = monthOf(ui.month), bn = branchName();
    var head = '<div class="fx-ctl ax-hl-off">' +
      '<button type="button" class="fx-nav" onclick="AXFulus.shift(-1)" aria-label="الشهر اللي قبله">›</button>' +
      '<label class="fx-month"><input type="month" value="' + ui.month + '" max="' + today().slice(0, 7) + '" onchange="AXFulus.month(this.value)"><b>' + m.label + '</b></label>' +
      '<button type="button" class="fx-nav" onclick="AXFulus.shift(1)" aria-label="الشهر اللي بعده"' + (ui.month >= today().slice(0, 7) ? ' disabled' : '') + '>‹</button>' +
      (bn ? '<span class="fx-br">' + esc(bn) + '</span>' : '') +
      (admin() ? '<button type="button" class="fx-dg" onclick="AXFulus.digest()">📲 الملخص اليومي</button><button type="button" class="fx-gear" onclick="AXFulus.settings()" aria-label="إعدادات الفلوس">⚙</button>' : '') + '</div>' +
      '<button type="button" class="fx-run' + (ui.busy ? ' busy' : '') + '" id="fx-run" onclick="AXFulus.run()"><span>' + (ui.busy ? 'بيحلل كل حركة فلوس…' : (ui.ran ? '↻ احسب تاني' : '⚡ احسب الشهر')) + '</span></button>';
    var setup = '';
    if (!cfg.on) {
      setup = admin()
        ? '<section class="pfx-card fx-setup ax-hl-off"><header><b>فعّل رقابة الفلوس</b><span>مرة واحدة لكل فرع</span></header>' +
          '<p class="pfx-note" style="margin-top:0">عشان نحسب العجز بالظبط محتاجين رصيد الخزنة النهارده، ومن ساعتها: المسؤول يقفّل اليومية بعدّ الفلوس، والإيصال إجباري فوق الحد، والمصروف الكبير يستنى موافقتك.</p>' +
          setupForm(cfgRaw(), 'fx') + '<button type="button" class="fx-run sm" onclick="AXFulus.saveCfg(true, \'fx\')">فعّل</button></section>'
        : '<section class="pfx-card ax-hl-off"><p class="pfx-note" style="margin:0">رقابة الفلوس لسه ما اتفعّلتش في الفرع ده — المدير يفعّلها من هنا. الأرقام تحت محسوبة من المتسجل بس.</p></section>';
    }
    host.innerHTML = head + setup + (ui.ran ? '<div id="fx-rep" class="fx-rep">' + report(compute()) + '</div>' : '<div class="fx-idle ax-hl-off"><b>دوس «احسب الشهر»</b><span>هيحسب كل جنيه دخل أو خرج في ' + m.label + (bn ? ' — ' + esc(bn) : '') + '، ويقارنه بالخزنة والأرباح، ويطلعلك أي حاجة مش مظبوطة.</span></div>');
  }

  function report(R) {
    var c = R.cash, b = R.bridge, dr = R.draw, k = R.byKind;
    var out = '';
    /* 1 · how much you can take */
    var lim = { cash: 'المحدد هنا الفلوس الموجودة', profit: 'مش أكتر من ربح الشهر اللي لسه ما اتحوّلكش', loss: 'الشهر ده خسران — أي سحب بياكل من رأس المال', drawn: 'اتحوّلك ربح الشهر كله خلاص', nocash: 'سجّل رصيد الخزنة أو اعمل تقفيل عشان نعرف الموجود' }[dr.limit];
    out += '<section class="pfx-hero fx-hero ax-hl-off"><div class="pfx-hn"><span>تقدر تسحب من ' + esc(R.m.label) + '</span><b class="' + (dr.amount > 0 ? '' : 'zero') + '">' + (dr.amount == null ? '—' : money(dr.amount)) + '</b>' +
      '<div class="fx-why">' + esc(lim) + '</div>' +
      (admin() && dr.amount > 0 ? '<button type="button" class="fx-mini" onclick="AXFulus.draw(' + dr.amount + ')">سجّل إني سحبت</button>' : admin() ? '<button type="button" class="fx-mini ghost" onclick="AXFulus.draw(0)">سجّل سحب</button>' : '') + '</div>' +
      '<div class="fx-calc">' +
        row('الفلوس في الخزنة دلوقتي', dr.cash == null ? '—' : money(dr.cash), c.lastCount ? 'آخر عدّ ' + dmy(c.lastCount.date) + (c.lastCount.by ? ' (' + esc(c.lastCount.by) + ')' : '') + ' + حركة بعده' : 'محسوبة من المتسجل') +
        row('− احتياطي التشغيل', money(dr.reserve), 'من الإعدادات') +
        row('− مستحق للموردين خلال 30 يوم', money(dr.due), 'فواتير شراء آجل') +
        row('= متاح من الفلوس', dr.cashAvail == null ? '—' : money(dr.cashAvail), '', dr.cashAvail != null && dr.cashAvail < 0 ? 'neg' : '') +
        row('ربح الشهر اللي لسه ما اتحوّلكش', money(dr.profitLeft), 'صافي ربح ' + money(R.P.net) + ' − اتحوّلك ' + money(b ? b.draws : 0), dr.profitLeft < 0 ? 'neg' : '') +
      '</div></section>';
    /* 2 · the cash box */
    var shortTxt = c.shortage < 0 ? '<b class="neg">عجز ' + money(-c.shortage) + '</b>' : '<b class="pos">مفيش عجز</b>';
    out += '<section class="pfx-kpis fx-box ax-hl-off">' +
      kpi('المفروض في الخزنة', c.now == null ? '—' : money(c.now), 'آخر عدّ + كل حركة كاش بعده') +
      kpi('آخر عدّ', c.lastCount ? money(c.lastCount.total) : '—', c.lastCount ? dmy(c.lastCount.date) + (c.lastCount.by ? ' · ' + esc(c.lastCount.by) : '') : 'مفيش تقفيل الشهر ده') +
      kpi('عجز / زيادة الشهر', shortTxt + (c.excess > 0 ? ' <small class="warn">زيادة ' + money(c.excess) + '</small>' : ''), c.counts.length + ' تقفيل', c.shortage < 0 ? 'bad' : '') +
      kpi('صافي الكاش', sgn(R.cashNet), 'دخل ' + money(R.totals.cashIn) + ' · خرج ' + money(R.totals.cashOut)) +
      kpi('صافي البنك', sgn(R.bankNet), 'دخل ' + money(R.totals.bankIn) + ' · خرج ' + money(R.totals.bankOut)) +
      kpi('صافي ربح الشهر', money(R.P.net), 'من «الربح»', R.P.net < 0 ? 'bad' : '') + '</section>';
    var bad = R.alerts.filter(function (a) { return a.lvl === 'bad'; });
    if (bad.length) out += '<div class="fx-alert ax-hl-off"><i>!</i><div><b>' + esc(bad[0].title) + '</b><span>' + esc(bad[0].detail || '') + '</span></div>' + (bad.length > 1 ? '<em>+' + (bad.length - 1) + '</em>' : '') + '</div>';
    /* 3 · in / out */
    var ins = ['collect', 'banktr', 'branch', 'srefund'], outs = ['expense', 'supplier', 'bounce', 'branch', 'refund', 'custody', 'debt', 'bankout', 'draw'];
    var side = function (keys, sign) {
      var rows = [], tc = 0, tb = 0;
      keys.forEach(function (kk) {
        var x = k[kk]; if (!x) return;
        var cash = sign > 0 ? Math.max(0, x.cash) : Math.max(0, -x.cash), bank = sign > 0 ? Math.max(0, x.bank) : Math.max(0, -x.bank);
        if (kk === 'branch' || kk === 'custody') {      // two-way kinds: split by direction
          var fl = R.flows.filter(function (f) { return f.kind === kk && (sign > 0 ? f.amt > 0 : f.amt < 0); });
          cash = Math.abs(fl.filter(function (f) { return f.pocket === 'cash'; }).reduce(function (s, f) { return s + f.amt; }, 0));
          bank = Math.abs(fl.filter(function (f) { return f.pocket === 'bank'; }).reduce(function (s, f) { return s + f.amt; }, 0));
          if (kk === 'custody' && sign > 0) return;
        }
        if (!cash && !bank) return;
        tc += cash; tb += bank;
        var lab = kk === 'branch' ? (sign > 0 ? 'جت من فروع تانية' : 'اتحولت لفروع تانية') : kk === 'custody' ? 'عهد نقدية (صافي)' : x.label;
        rows.push('<tr><td>' + lab + '</td><td>' + (cash ? num(r2(cash)) : '—') + '</td><td>' + (bank ? num(r2(bank)) : '—') + '</td><td><b>' + num(r2(cash + bank)) + '</b></td></tr>');
      });
      return '<table class="fx-t"><thead><tr><th></th><th>خزنة</th><th>بنك</th><th>الإجمالي</th></tr></thead><tbody>' + (rows.join('') || '<tr><td colspan="4" class="mut">مفيش</td></tr>') +
        '</tbody><tfoot><tr><td>الإجمالي</td><td>' + num(r2(tc)) + '</td><td>' + num(r2(tb)) + '</td><td class="' + (sign > 0 ? 'pos' : 'neg') + '">' + num(r2(tc + tb)) + '</td></tr></tfoot></table>';
    };
    out += '<div class="pfx-two">' +
      '<section class="pfx-card ax-hl-off"><header><b>دخل منين</b><span>' + money(R.totals.cashIn + R.totals.bankIn) + '</span></header>' + side(ins, 1) + '</section>' +
      '<section class="pfx-card ax-hl-off"><header><b>خرج فين</b><span>' + money(R.totals.cashOut + R.totals.bankOut) + '</span></header>' + side(outs, -1) +
        '<p class="pfx-note">الخزنة: ' + (c.open == null ? 'أول الشهر مش معروف' : 'أول الشهر ' + money(c.open)) + ' ← المفروض آخره ' + (c.expectedEnd == null ? '—' : money(c.expectedEnd)) + '</p></section></div>';
    /* 4 · expenses by type */
    if (R.cats.length) {
      var mx = R.cats[0].amount || 1;
      out += '<section class="pfx-card ax-hl-off"><header><b>المصروفات حسب النوع</b><span>مقارنة بمتوسط آخر 3 شهور</span></header><div class="pfx-cats">' + R.cats.map(function (x) {
        var hot = x.up != null && x.up >= 50 && x.amount - x.avg >= 500;
        return '<div class="pfx-cat fx-cat"><span>' + esc(x.cat) + (hot ? ' <em class="fx-tag r">+' + Math.round(x.up) + '%</em>' : x.fresh ? ' <em class="fx-tag">جديد</em>' : '') + '</span>' +
          '<span class="pfx-rb"><i style="width:' + Math.max(2, x.amount / mx * 100).toFixed(1) + '%;background:' + (hot ? '#E5232F' : '#14A094') + '"></i></span><b>' + money(x.amount) + '</b><small>' + (x.noHist ? 'مفيش شهور قبله' : 'متوسط ' + money(x.avg)) + '</small></div>';
      }).join('') + '</div></section>';
    }
    /* 5 · where did the profit go */
    if (b) {
      var mxb = Math.max(1, Math.abs(b.profit), Math.max.apply(null, b.lines.map(function (l) { return Math.abs(l.v); })));
      var lab = function (l) {
        if (l.k === 'unpaid') return l.v < 0 ? 'مبيعات لسه ما اتحصّلتش' : 'حصّلت ديون قديمة';
        if (l.k === 'stock') return l.v < 0 ? 'بضاعة اشتريتها زيادة عن اللي اتباع' : 'بعت من مخزون قديم';
        if (l.k === 'payable') return l.v > 0 ? 'مشتريات لسه ما اتدفعتش للموردين' : 'سددت للموردين ديون قديمة';
        return l.label;
      };
      var hint = function (l) {
        if (l.k === 'unpaid') return 'بعت بـ ' + money(l.a) + ' وحصّلت ' + money(l.b);
        if (l.k === 'stock') return 'اشتريت بـ ' + money(l.a) + ' وتكلفة اللي اتباع ' + money(l.b);
        if (l.k === 'payable') return 'اشتريت بـ ' + money(l.a) + ' ودفعت ' + money(l.b);
        if (l.k === 'tax') return 'ضريبة الفواتير بتدخل فلوس بس مش ربح';
        return '';
      };
      out += '<section class="pfx-card fx-bridge ax-hl-off"><header><b>الربح راح فين؟</b><span>' + esc(R.m.label) + ' — مضبوط بالقرش</span></header>' +
        wf('صافي الربح من البيع', b.profit, '', mxb, 'p') +
        b.lines.filter(function (l) { return Math.abs(l.v) >= 0.01; }).map(function (l) { return wf(lab(l), l.v, hint(l), mxb); }).join('') +
        '<div class="fx-wt"><span>= الفلوس (خزنة + بنك) ' + (b.total >= 0 ? 'زادت' : 'قلّت') + '</span><b class="' + (b.total < 0 ? 'neg' : 'pos') + '">' + money(Math.abs(b.total)) + '</b></div>' +
        '<p class="pfx-note">' + (Math.abs(b.check) < 0.01 ? '✓ الحساب مقفول: مجموع السطور = حركة الفلوس الفعلية بالظبط.' : '⚠ فرق ' + money(b.check) + ' في المطابقة') +
        (R.cash.shortage < 0 ? ' والخزنة ناقص منها <b class="neg">' + money(-R.cash.shortage) + '</b> عن كده في التقفيلات.' : '') + '</p></section>';
    }
    /* 6 · daily closes */
    out += '<section class="pfx-card ax-hl-off"><header><b>تقفيلات اليومية</b><span>' + c.counts.length + ' في ' + esc(R.m.label) + '</span></header>' +
      (c.counts.length ? '<div class="fx-closes">' + c.counts.slice().reverse().map(function (x) {
        var st = x.diff == null ? '<em class="fx-tag">أول عدّ</em>' : Math.abs(x.diff) < 1 ? '<em class="fx-tag g">مطابق ✓</em>' : x.diff < 0 ? '<em class="fx-tag r">عجز ' + money(-x.diff) + '</em>' : '<em class="fx-tag">زيادة ' + money(x.diff) + '</em>';
        return '<div class="fx-close"><div><b>' + dmy(x.date) + '</b><small>' + esc(x.by || '') + '</small></div><div><span>المعدود</span><b>' + money(x.total) + '</b></div><div><span>المفروض</span><b>' + (x.expected == null ? '—' : money(x.expected)) + '</b></div>' + st + '</div>';
      }).join('') + '</div>' : '<div class="pfx-empty">مفيش تقفيلات في الشهر ده' + (canClose() ? ' — <a href="#" onclick="event.preventDefault();AXFulus.close()">قفّل النهارده</a>' : '') + '</div>') + '</section>';
    /* 7 · the analysis */
    out += '<section class="pfx-card pfx-tips ax-hl-off"><header><b>🔎 تحليل ذكي</b><span>' + (R.alerts.length ? R.alerts.length + ' حاجة محتاجة نظرك' : 'كله مظبوط') + '</span></header>' +
      (R.alerts.length ? R.alerts.map(function (a) {
        return '<div class="pfx-tip ' + (a.lvl === 'bad' ? 'bad' : a.lvl === 'warn' ? 'warn' : 'info') + '"><i>' + (a.lvl === 'bad' ? '!' : a.lvl === 'warn' ? '↑' : 'i') + '</i><div><b>' + esc(a.title) + '</b><p>' + esc(a.detail || '') + '</p></div></div>';
      }).join('') : '<div class="pfx-tip good"><i>✓</i><div><b>مفيش أي مخالفة</b><p>كل التقفيلات مطابقة، والمصاريف بإيصالات، ومفيش تكرار أو تواريخ قديمة.</p></div></div>') + '</section>';
    /* 8 · waiting for you */
    var pend = (S()._approvals || []).filter(function (r) { return r && r.status === 'pending' && r.diff && r.diff.cols && r.diff.cols.expenses; });
    if (pend.length) out += '<section class="pfx-card ax-hl-off"><header><b>مصاريف مستنية موافقتك</b><span>' + pend.length + '</span></header>' + pend.slice(0, 6).map(function (r) {
      return '<div class="fx-pend"><div><b>' + esc(r.title || 'مصروف') + '</b><small>' + esc((r.by && r.by.name) || '') + '</small></div><button type="button" class="fx-mini" onclick="navigate(\'approvals\')">افتح</button></div>';
    }).join('') + '</section>';
    /* 9 · who recorded what */
    if (R.people.length) out += '<section class="pfx-card ax-hl-off"><header><b>مين سجّل إيه</b><span>حركة الخزنة بالاسم</span></header><div class="fx-tw"><table class="fx-t"><thead><tr><th>الاسم</th><th>استلم كاش</th><th>صرف كاش</th><th>منها مصروفات</th><th>تقفيلات</th><th>العجز</th></tr></thead><tbody>' +
      R.people.map(function (p) { return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + num(p.cashIn) + '</td><td>' + num(p.cashOut) + '</td><td>' + num(p.exp) + '</td><td>' + p.counts + (p.lastCount ? ' <small>' + dmy(p.lastCount) + '</small>' : '') + '</td><td class="' + (p.diff < -0.5 ? 'neg' : '') + '">' + (p.counts ? num(p.diff) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    /* 10 · draws */
    var draws = R.flows.filter(function (f) { return f.kind === 'draw'; });
    out += '<section class="pfx-card ax-hl-off"><header><b>اللي اتحوّلك</b><span>' + money(b ? b.draws : 0) + '</span></header>' +
      (draws.length ? draws.map(function (f) { return '<div class="fx-pend"><div><b>' + money(-f.amt) + '</b><small>' + dmy(f.date) + ' · من ' + (f.pocket === 'bank' ? 'البنك' : 'الخزنة') + (f.label.indexOf('—') > 0 ? ' · ' + esc(f.label.split('—')[1]) : '') + '</small></div></div>'; }).join('') : '<div class="pfx-empty">مفيش مسحوبات متسجلة الشهر ده</div>') + '</section>';
    out += '<div class="fx-actions ax-hl-off"><button type="button" class="fx-run sm" onclick="AXFulus.print()">🖨 طباعة / PDF</button><button type="button" class="fx-run sm wa" onclick="AXFulus.share()">واتساب</button></div>' +
      '<p class="pfx-foot">الخزنة = الفلوس الكاش · البنك = تحويل / إيداع / شيك / محفظة (من طريقة الدفع) · التحويل البنكي من عميل اللي متسجل كتحصيل بنفس المبلغ ما اتحسبش مرتين · مصروف من عهدة نقدية بيتحسب من العهدة مش من الخزنة · فواتير الشراء مش فلوس خارجة — سداد الموردين هو اللي بيطلع.</p>';
    return out;
  }
  function row(l, v, h, cls) { return '<div class="fx-cr' + (cls ? ' ' + cls : '') + '"><span>' + l + (h ? '<small>' + h + '</small>' : '') + '</span><b>' + v + '</b></div>'; }
  function kpi(l, v, h, cls) { return '<div class="pfx-k' + (cls ? ' ' + cls : '') + '"><span class="pfx-kl">' + l + '</span><b>' + v + '</b>' + (h ? '<small>' + h + '</small>' : '') + '</div>'; }
  function wf(l, v, h, mx, cls) {
    return '<div class="fx-w' + (cls ? ' ' + cls : '') + '"><div class="fx-wl"><span>' + esc(l) + '</span>' + (h ? '<small>' + esc(h) + '</small>' : '') + '</div><b class="' + (v < 0 ? 'neg' : 'pos') + '">' + sgn(v) + '</b>' +
      '<span class="fx-wb"><i class="' + (cls === 'p' ? 'p' : v < 0 ? 'neg' : 'pos') + '" style="width:' + Math.max(1.5, Math.abs(v) / mx * 100).toFixed(1) + '%"></i></span></div>';
  }

  /* ════════ actions ════════ */
  function run() {
    ui.busy = true; render();
    setTimeout(function () { ui.busy = false; ui.ran = true; render(); var r = document.getElementById('fx-rep'); if (r && r.scrollIntoView) try { r.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }, 650);
  }
  function setupForm(c, P) {
    var o = c.opening || {}; P = P || 'fx';
    return '<div class="fx-form"><label><span>رصيد الخزنة (كاش)</span><input class="form-control" id="' + P + '-open" type="number" inputmode="decimal" step="any" min="0" value="' + (o.amount != null ? o.amount : '') + '" placeholder="اعدّه واكتبه"></label>' +
      '<label><span>من يوم</span><input class="form-control" id="' + P + '-open-d" type="date" value="' + (o.date || today()) + '" max="' + today() + '"></label>' +
      '<label><span>الإيصال إجباري فوق</span><input class="form-control" id="' + P + '-rc" type="number" inputmode="decimal" min="0" value="' + (c.receipt != null ? c.receipt : 500) + '"></label>' +
      '<label><span>المصروف محتاج موافقتك فوق</span><input class="form-control" id="' + P + '-ap" type="number" inputmode="decimal" min="0" value="' + (c.approve != null ? c.approve : 2000) + '"></label>' +
      '<label><span>احتياطي التشغيل (يفضل في الخزنة)</span><input class="form-control" id="' + P + '-rs" type="number" inputmode="decimal" min="0" value="' + (c.reserve != null ? c.reserve : 15000) + '"></label></div>';
  }
  function settings() {
    if (!admin()) return;
    var c = cfgRaw();
    openModal('⚙ إعدادات الفلوس' + (branchName() ? ' — ' + esc(branchName()) : ''), '<div class="ax-hl-off">' + setupForm(c, 'fxm') +
      '<label class="axr-check" style="margin-top:10px"><input type="checkbox" id="fx-on"' + (c.on ? ' checked' : '') + '><span>الرقابة شغّالة <small>(الإيصال الإجباري، الموافقة على المصروف الكبير، والمصروف بتاريخ يوم اتقفل)</small></span></label>' +
      '<p class="pfx-note">رصيد الخزنة نقطة البداية: كل تقفيل بعد كده بيتقارن بالتقفيل اللي قبله + حركة الكاش بينهم.</p></div>',
      '<button class="btn btn-primary" onclick="AXFulus.saveCfg(false, \'fxm\')">حفظ</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function saveCfg(enable, P) {
    if (!admin()) return;
    P = P || 'fx';
    var v = function (i) { var e = document.getElementById(P + i.slice(2)); return e ? e.value : ''; };
    var amt = v('fx-open'), dd = v('fx-open-d') || today();
    if (amt === '' || !(N(amt) >= 0)) { T('اكتب رصيد الخزنة (ولو صفر)', 'error'); return; }
    var c = { on: enable ? true : !!(document.getElementById('fx-on') || {}).checked, receipt: N(v('fx-rc')), approve: N(v('fx-ap')), reserve: N(v('fx-rs')),
      opening: { date: dd, amount: r2(amt) }, since: (cfgRaw().since || dd), setBy: me().name, setAt: Date.now() };
    S()._cashCfg = c;
    if (typeof DB.save === 'function') DB.save();
    try { if (typeof logAudit === 'function') logAudit({ operation: 'edit', table: 'settings', recordId: '_cashCfg', recordLabel: 'إعدادات الفلوس', before: null, after: c }); } catch (e) {}
    if (typeof closeModal === 'function') try { closeModal(); } catch (e) {}
    T(c.on ? 'رقابة الفلوس اشتغلت ✓' : 'اتحفظ');
    render();
  }
  function draw(suggest) {
    if (!admin()) return;
    openModal('سجّل اللي اتحوّلك', '<div class="fx-form ax-hl-off">' +
      '<label><span>المبلغ</span><input class="form-control" id="fx-dr" type="number" inputmode="decimal" step="any" min="0" value="' + (suggest > 0 ? suggest : '') + '"></label>' +
      '<label><span>من</span><select class="form-control" id="fx-dr-f"><option value="cash">الخزنة (كاش)</option><option value="bank">البنك</option></select></label>' +
      '<label><span>التاريخ</span><input class="form-control" id="fx-dr-d" type="date" value="' + today() + '" max="' + today() + '"></label>' +
      '<label><span>ملاحظة</span><input class="form-control" id="fx-dr-n" maxlength="120" placeholder="اختياري"></label></div>' +
      '<p class="pfx-note">ده مش مصروف — بيتسجل «مسحوبات المالك» عشان يبان في حساب الفلوس وما يتحسبش من الربح.</p>',
      '<button class="btn btn-primary" onclick="AXFulus.saveDraw()">تسجيل</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function saveDraw() {
    var a = r2((document.getElementById('fx-dr') || {}).value);
    if (!(a > 0)) { T('اكتب المبلغ', 'error'); return; }
    var s = S(); if (!Array.isArray(s._ownerDraws)) s._ownerDraws = [];
    var rec = { id: 'dr_' + id(), date: (document.getElementById('fx-dr-d') || {}).value || today(), amount: a, from: (document.getElementById('fx-dr-f') || {}).value === 'bank' ? 'bank' : 'cash',
      note: String((document.getElementById('fx-dr-n') || {}).value || '').replace(/[<>]/g, '').slice(0, 120), by: me(), at: Date.now() };
    s._ownerDraws.push(rec);
    DB.save();
    try { if (typeof logAudit === 'function') logAudit({ operation: 'add', table: 'settings._ownerDraws', recordId: rec.id, recordLabel: 'مسحوبات المالك ' + money(a), before: null, after: rec }); } catch (e) {}
    closeModal(); T('اتسجل ' + money(a) + ' ✓'); render();
  }

  /* ════════ «الملخص اليومي» — WhatsApp + push (server: backend/src/digest.js) ════════ */
  function api(path, method, body) {
    var b = typeof API_BASE !== 'undefined' ? API_BASE : '';
    return fetch(b + path, { method: method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: Object.assign({ 'X-Branch': 'main' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'تعذر الاتصال بالسيرفر'); return j; }); });
  }
  function sw(id, on, label, sub) { return '<label class="fx-sw"><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><i></i></label>'; }
  function digest() {
    if (!admin()) return;
    openModal('📲 الملخص اليومي', '<div class="pfx-empty">بيحمّل…</div>', '');
    api('/api/digest').then(function (r) {
      var c = r.config, last = (r.history || []).filter(function (h) { return h.kind === 'digest'; })[0];
      openModal('📲 الملخص اليومي', '<div class="fx-dgf ax-hl-off">' +
        '<p class="pfx-note" style="margin-top:0">كل يوم في الساعة اللي تختارها يوصلك ملخص كل الفروع: اتحصّل كام، اتصرف كام وفي إيه، التقفيل والعجز، المصاريف المستنية موافقتك، والربح. وأي عجز أو مصروف مستني موافقتك يوصلك على طول.</p>' +
        sw('dg-on', c.on, 'الملخص اليومي شغّال') +
        '<div class="fx-form"><label><span>الساعة (بتوقيت القاهرة)</span><input class="form-control" id="dg-time" type="time" value="' + esc(c.time) + '"></label></div>' +
        '<h4 class="fx-h4">🔔 إشعار على الموبايل</h4>' + (window.AXPush ? AXPush.strip() : '') + sw('dg-push', c.push, 'ابعت الملخص والتنبيهات كإشعار') +
        '<h4 class="fx-h4">✈️ تليجرام</h4>' + tgBlock(c) +
        '<h4 class="fx-h4">💬 واتساب</h4>' + sw('dg-wa', c.wa, 'ابعت على الواتساب كمان') +
        '<div class="fx-form"><label><span>رقم الواتساب بتاعك</span><input class="form-control" id="dg-phone" inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx" value="' + esc(c.phone) + '"></label>' +
        '<label><span>كود التفعيل (apikey)</span><input class="form-control" id="dg-key" dir="ltr" placeholder="' + (c.hasKey ? 'متسجل — اكتب كود جديد لو اتغير' : '123456') + '" value=""></label></div>' +
        '<details class="fx-how"><summary>إزاي أجيب كود التفعيل؟ (مرة واحدة — دقيقة)</summary><ol>' +
          '<li>سجّل الرقم ده في موبايلك: <b dir="ltr">+34 623 78 64 49</b> (CallMeBot)</li>' +
          '<li>ابعتله على الواتساب الرسالة دي بالظبط: <b dir="ltr">I allow callmebot to send me messages</b></li>' +
          '<li>هيرد عليك برسالة فيها <b>apikey</b> — اكتبه هنا واحفظ.</li>' +
          '<li>لو ما ردّش خلال دقيقتين استنى 24 ساعة وجرّب تاني. لو الرقم اتغير هتلاقيه في <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noopener">صفحة CallMeBot</a> (الرقم القديم +34 644 43 38 04 اتقفل).</li></ol>' +
          '<p class="pfx-note">الخدمة مجانية وبتبعت لرقمك إنت بس. لو وقفت في يوم، الملخص بيوصل كإشعار وبيتحفظ هنا في «الملخصات».</p></details>' +
        '<h4 class="fx-h4">⚡ تنبيه فوري</h4>' + sw('dg-short', c.alertShort, 'عجز في أي تقفيل يومية') + sw('dg-ap', c.alertApproval, 'مصروف مستني موافقتك') + sw('dg-tr', c.alertTransfer, 'تحويل بين الفروع', 'إشعار بس') +
        sw('dg-profit', c.profit, 'الربح في الملخص') +
        '<p class="pfx-note" id="dg-res">' + (last ? 'آخر ملخص: ' + esc(last.day) + ' ' + sentTxt(last.sent) : 'لسه ما اتبعتش ملخص') + '</p></div>',
        '<button class="btn btn-primary" onclick="AXFulus.saveDigest()">حفظ</button><button class="btn btn-success" onclick="AXFulus.testDigest()">ابعتلي تجربة دلوقتي</button><button class="btn btn-ghost" onclick="AXFulus.digests()">الملخصات</button>');
      if (window.AXPush) AXPush.check();
    }).catch(function (e) { openModal('📲 الملخص اليومي', '<div class="pfx-empty">' + esc(e.message) + '</div>', '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>'); });
  }
  function tgBlock(c) {
    var link = c.tgBot ? 'https://t.me/' + encodeURIComponent(c.tgBot) + '?start=ozarex' : '';
    if (c.hasTg && c.tgChat) return sw('dg-tg', c.tg, 'ابعت على تليجرام') +
      '<div class="fx-tgok"><span>✓ مربوط' + (c.tgChatName ? ' بـ <b>' + esc(c.tgChatName) + '</b>' : '') + ' عن طريق <b dir="ltr">@' + esc(c.tgBot) + '</b></span><button type="button" class="fx-mini ghost" onclick="AXFulus.unlinkTg()">افصل</button></div>';
    if (c.hasTg) return '<div class="fx-how open"><b>البوت <span dir="ltr">@' + esc(c.tgBot) + '</span> جاهز — فاضل خطوة:</b><ol>' +
      '<li><a href="' + link + '" target="_blank" rel="noopener">افتح البوت في تليجرام</a> ودوس <b>Start</b> (أو ابعتله أي كلمة).</li><li>ارجع هنا ودوس <b>«اربط»</b>.</li></ol>' +
      '<div class="fx-tgrow"><button type="button" class="fx-mini" onclick="AXFulus.linkTg()">اربط</button><button type="button" class="fx-mini ghost" onclick="AXFulus.unlinkTg()">بوت تاني</button></div></div>';
    return '<details class="fx-how" open><summary>اعمل بوت تليجرام (مرة واحدة — دقيقتين)</summary><ol>' +
      '<li>افتح تليجرام وابحث عن <b dir="ltr">@BotFather</b> (عليه علامة زرقا ✓) ودوس <b>Start</b>.</li>' +
      '<li>ابعتله <b dir="ltr">/newbot</b>، واكتب أي اسم (مثلاً Ozarex منوف)، وبعدين اسم ينتهي بـ <b dir="ltr">bot</b> (مثلاً <span dir="ltr">ozarex_mahmoud_bot</span>).</li>' +
      '<li>هيبعتلك <b>كود</b> شكله <span dir="ltr">123456789:AAH…</span> — انسخه كله وحطه هنا.</li>' +
      '<li>افتح البوت الجديد (اللينك في رسالة BotFather) ودوس <b>Start</b>، وارجع دوس «اربط».</li></ol>' +
      '<div class="fx-tgrow"><input class="form-control" id="dg-tgtok" dir="ltr" placeholder="123456789:AAH..." autocomplete="off"><button type="button" class="fx-mini" onclick="AXFulus.linkTg()">اربط</button></div></details>';
  }
  function linkTg() {
    var inp = document.getElementById('dg-tgtok'), tok = inp ? inp.value.trim() : '';
    saveDigest(true).catch(function () {}).then(function () { return api('/api/digest/telegram', 'POST', { token: tok }); }).then(function (r) {
      T(r.linked ? 'تليجرام اتربط ✓ — بعتنالك رسالة تجربة' : 'البوت @' + r.bot + ' جاهز — افتحه ودوس Start وارجع دوس «اربط»', r.linked ? 'success' : 'info');
      if (r.linked) api('/api/digest/send', 'POST', { test: true }).catch(function () {});
      digest();
    }).catch(function (e) { T(e.message, 'error'); });
  }
  function unlinkTg() { api('/api/digest', 'PUT', { tgUnlink: true }).then(function () { digest(); }).catch(function (e) { T(e.message, 'error'); }); }
  function sentTxt(s) {
    s = s || {}; var a = [];
    if (s.tg) a.push(s.tg.skipped ? 'تليجرام: مش مربوط' : s.tg.ok ? 'تليجرام ✓' : 'تليجرام ✗');
    if (s.wa) a.push(s.wa.skipped ? 'واتساب: مش متظبط' : s.wa.ok ? 'واتساب ✓' : 'واتساب ✗');
    if (s.push) a.push(s.push.devices ? 'إشعار ✓ (' + s.push.ok + '/' + s.push.devices + ')' : 'إشعار: مفيش جهاز مفعّل');
    return a.join(' · ');
  }
  function digestBody() {
    var v = function (i) { var e = document.getElementById(i); return e ? e.value : ''; }, c = function (i) { var e = document.getElementById(i); return !!(e && e.checked); };
    var b = { on: c('dg-on'), time: v('dg-time') || '22:00', push: c('dg-push'), wa: c('dg-wa'), tg: document.getElementById('dg-tg') ? c('dg-tg') : true, phone: v('dg-phone'), alertShort: c('dg-short'), alertApproval: c('dg-ap'), alertTransfer: c('dg-tr'), profit: c('dg-profit') };
    if (v('dg-key').trim()) b.apikey = v('dg-key').trim();
    return b;
  }
  function saveDigest(silent) {
    var b = digestBody();
    if (b.wa && b.on && b.phone && !/^(\+|0)\d{9,14}$/.test(String(b.phone).replace(/\s/g, ''))) { T('اكتب رقم الواتساب صح (مثلاً 01012345678)', 'error'); return Promise.reject(new Error('phone')); }
    return api('/api/digest', 'PUT', b).then(function (r) { if (!silent) { T(r.config.on ? 'الملخص اليومي هيوصلك الساعة ' + r.config.time + ' ✓' : 'اتحفظ'); closeModal(); } return r; })
      .catch(function (e) { if (e.message !== 'phone') T(e.message, 'error'); throw e; });
  }
  function testDigest() {
    var res = document.getElementById('dg-res'); if (res) res.textContent = 'بيبعت…';
    saveDigest(true).then(function () { return api('/api/digest/send', 'POST', { test: true }); }).then(function (r) {
      if (res) res.innerHTML = 'اتبعتت التجربة: ' + esc(sentTxt(r.sent));
      T('اتبعتت رسالة التجربة — ' + sentTxt(r.sent));
    }).catch(function (e) { if (res) res.textContent = e.message; });
  }
  function digests() {
    if (!admin()) return;
    api('/api/digest/history').then(function (r) {
      var h = r.history || [];
      var KIND = { digest: '📊', short: '🔴', approval: '⏳', transfer: '🚚' };
      openModal('📚 الملخصات والتنبيهات', '<div class="fx-hist ax-hl-off">' + (h.length ? h.map(function (x, i) {
        return '<details' + (i === 0 ? ' open' : '') + '><summary><span>' + (KIND[x.kind] || '•') + ' ' + esc(x.title || x.day) + '</span><small>' + esc(new Date(x.at).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) + ' · ' + esc(sentTxt(x.sent)) + '</small></summary>' +
          '<pre>' + esc(String(x.text || '').replace(/\*/g, '')) + '</pre></details>';
      }).join('') : '<div class="pfx-empty">لسه مفيش ملخصات — أول ملخص هيتبعت في الساعة اللي اخترتها</div>') + '</div>',
        '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
    }).catch(function (e) { T(e.message, 'error'); });
  }

  /* ════════ «تقفيل اليومية» — a blind count ════════ */
  function close() {
    if (!canClose()) { T('مالكش صلاحية تقفّل اليومية', 'error'); return; }
    var mine = (S()._cashCounts || []).filter(function (c) { return c && c.date === today(); });
    var last = mine[mine.length - 1];
    openModal('🔒 تقفيل اليومية' + (branchName() ? ' — ' + esc(branchName()) : ''), '<div class="fx-cnt ax-hl-off">' +
      '<p class="pfx-note" style="margin-top:0">اعدّ الفلوس الكاش اللي في الخزنة دلوقتي واكتب عدد كل فئة. الرقم بيتبعت للمدير' + (admin() ? '' : ' — مش هتشوف المفروض كام') + '.</p>' +
      (last ? '<div class="axr-note">اتقفلت النهارده ' + new Date(last.at).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) + (last.by && last.by.name ? ' (' + esc(last.by.name) + ')' : '') + ' — العدّ الجديد هيحل محله.</div>' : '') +
      '<div class="fx-den">' + DEN.map(function (v) { return '<label><span>' + v + ' ×</span><input class="form-control fx-dn" type="number" inputmode="numeric" min="0" step="1" data-v="' + v + '" oninput="AXFulus.sum()" placeholder="0"></label>'; }).join('') +
      '<label><span>فكة / عملات</span><input class="form-control fx-dn" type="number" inputmode="decimal" min="0" step="any" data-v="coins" oninput="AXFulus.sum()" placeholder="0"></label></div>' +
      '<div class="fx-sum"><span>إجمالي اللي معاك</span><b id="fx-total">' + money(0) + '</b></div>' +
      '<label class="axr-f"><span>ملاحظة</span><input class="form-control" id="fx-cn" maxlength="160" placeholder="اختياري"></label></div>',
      '<button class="btn btn-primary" id="fx-cbtn" onclick="AXFulus.saveClose()">🔒 قفّل اليوم</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function denoms() {
    var o = {}, t = 0;
    document.querySelectorAll('.fx-dn').forEach(function (i) { var n = N(i.value); if (n <= 0) return; o[i.dataset.v] = n; t += i.dataset.v === 'coins' ? n : n * N(i.dataset.v); });
    return { d: o, total: r2(t) };
  }
  function sum() { var x = denoms(), e = document.getElementById('fx-total'); if (e) e.textContent = money(x.total); }
  function saveClose() {
    var x = denoms(), typed = Array.prototype.some.call(document.querySelectorAll('.fx-dn'), function (i) { return String(i.value).trim() !== ''; });
    if (!typed) { T('اكتب عدد كل فئة (لو الخزنة فاضية اكتب 0)', 'error'); return; }
    var s = S(); if (!Array.isArray(s._cashCounts)) s._cashCounts = [];
    var rec = { id: 'cc_' + id(), date: today(), total: x.total, denoms: x.d, note: String((document.getElementById('fx-cn') || {}).value || '').replace(/[<>]/g, '').slice(0, 160), by: me(), at: Date.now() };
    try { if (window.Branch && Branch.get) rec.branch = Branch.get(); } catch (e) {}
    s._cashCounts.push(rec);
    DB.save();
    try { if (typeof logAudit === 'function') logAudit({ operation: 'add', table: 'settings._cashCounts', recordId: rec.id, recordLabel: 'تقفيل يومية ' + money(x.total), before: null, after: rec }); } catch (e) {}
    closeModal(); T('اتقفلت اليومية ' + money(x.total) + ' ✓ — اتبعتت للمدير');
    if (typeof currentPage !== 'undefined' && currentPage === 'profit') render();
  }

  /* ════════ print / share ════════ */
  function print() {
    var R = compute(), w = window.open('', '_blank'); if (!w) { T('المتصفح منع نافذة الطباعة', 'error'); return; }
    var s = S(), b = R.bridge, br = branchName();
    var tr = function (a, v) { return '<tr><td>' + a + '</td><td>' + v + '</td></tr>'; };
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>حساب الفلوس — ' + esc(R.m.label) + '</title><style>@page{size:A4;margin:12mm}body{font-family:"Cairo","IBM Plex Sans Arabic",Tahoma,sans-serif;color:#000;font-size:12.5px}h1{margin:0;font-size:20px}h2{font-size:14px;margin:14px 0 6px;border-bottom:2px solid #000;padding-bottom:3px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:5px 7px;text-align:right}th{background:#eee}.big{font-size:22px;font-weight:800}</style></head><body>' +
      '<h1>' + esc(s.companyName || 'Ozarex') + (br ? ' — ' + esc(br) : '') + '</h1><div>حساب الفلوس · ' + esc(R.m.label) + ' · اتطبع ' + today() + '</div>' +
      '<h2>تقدر تسحب</h2><div class="big">' + (R.draw.amount == null ? '—' : money(R.draw.amount)) + '</div>' +
      '<table>' + tr('الفلوس في الخزنة دلوقتي', R.draw.cash == null ? '—' : money(R.draw.cash)) + tr('احتياطي التشغيل', money(R.draw.reserve)) + tr('مستحق للموردين خلال 30 يوم', money(R.draw.due)) + tr('ربح الشهر اللي لسه ما اتحوّلكش', money(R.draw.profitLeft)) + '</table>' +
      '<h2>الخزنة</h2><table>' + tr('أول الشهر', R.cash.open == null ? '—' : money(R.cash.open)) + tr('دخل كاش', money(R.totals.cashIn)) + tr('خرج كاش', money(R.totals.cashOut)) + tr('المفروض آخر الشهر', R.cash.expectedEnd == null ? '—' : money(R.cash.expectedEnd)) + tr('عجز التقفيلات', money(-R.cash.shortage)) + tr('زيادة التقفيلات', money(R.cash.excess)) + '</table>' +
      '<h2>دخل وخرج</h2><table><tr><th>البند</th><th>خزنة</th><th>بنك</th></tr>' + Object.keys(R.byKind).map(function (k) { var x = R.byKind[k]; return '<tr><td>' + x.label + '</td><td>' + num(x.cash) + '</td><td>' + num(x.bank) + '</td></tr>'; }).join('') + '</table>' +
      (b ? '<h2>الربح راح فين؟</h2><table>' + tr('صافي الربح', money(b.profit)) + b.lines.filter(function (l) { return Math.abs(l.v) >= 0.01; }).map(function (l) { return tr(l.label, sgn(l.v)); }).join('') + tr('<b>الفلوس اتغيرت</b>', '<b>' + sgn(b.total) + '</b>') + '</table>' : '') +
      '<h2>المصروفات حسب النوع</h2><table><tr><th>النوع</th><th>المبلغ</th><th>متوسط 3 شهور</th></tr>' + R.cats.map(function (x) { return '<tr><td>' + esc(x.cat) + '</td><td>' + num(x.amount) + '</td><td>' + num(x.avg) + '</td></tr>'; }).join('') + '</table>' +
      '<h2>تقفيلات اليومية</h2><table><tr><th>اليوم</th><th>عدّها</th><th>المعدود</th><th>المفروض</th><th>الفرق</th></tr>' + R.cash.counts.map(function (c) { return '<tr><td>' + c.date + '</td><td>' + esc(c.by) + '</td><td>' + num(c.total) + '</td><td>' + (c.expected == null ? '—' : num(c.expected)) + '</td><td>' + (c.diff == null ? '—' : num(c.diff)) + '</td></tr>'; }).join('') + '</table>' +
      '<h2>التحليل</h2><table>' + (R.alerts.length ? R.alerts.map(function (a) { return tr(esc(a.title), esc(a.detail || '')); }).join('') : tr('كله مظبوط', '')) + '</table></body></html>');
    w.document.close(); setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
  }
  function share() {
    var R = compute(), b = R.bridge, br = branchName();
    var t = '*حساب الفلوس — ' + R.m.label + (br ? ' — ' + br : '') + '*\n' +
      'تقدر تسحب: ' + (R.draw.amount == null ? '—' : money(R.draw.amount)) + '\n' +
      'صافي الربح: ' + money(R.P.net) + '\n' +
      'دخل: ' + money(R.totals.cashIn + R.totals.bankIn) + ' · خرج: ' + money(R.totals.cashOut + R.totals.bankOut) + '\n' +
      'المفروض في الخزنة: ' + (R.cash.now == null ? '—' : money(R.cash.now)) + (R.cash.lastCount ? ' · آخر عدّ ' + money(R.cash.lastCount.total) + ' (' + dmy(R.cash.lastCount.date) + ')' : '') + '\n' +
      (R.cash.shortage < 0 ? '⚠ عجز التقفيلات: ' + money(-R.cash.shortage) + '\n' : '') +
      (b ? 'الفلوس ' + (b.total >= 0 ? 'زادت ' : 'قلّت ') + money(Math.abs(b.total)) + '\n' : '') +
      (R.alerts.length ? '\nمحتاج نظرك:\n' + R.alerts.slice(0, 6).map(function (a) { return '• ' + a.title; }).join('\n') : '\nكله مظبوط ✓');
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
  }

  /* ════════ «تقفيل اليومية» on the collection / expenses pages ════════ */
  var PAGES = { payments: 1, expenses: 1 };
  function pageButton() {
    var page = typeof currentPage !== 'undefined' ? currentPage : '';
    if (!PAGES[page] || !canClose()) return;
    var pc = document.getElementById('page-content'); if (!pc || pc.querySelector('.fx-close-btn')) return;
    var html = '<button type="button" class="btn btn-secondary fx-close-btn" onclick="AXFulus.close()">🔒 تقفيل اليومية</button>';
    var bar = pc.querySelector('.section-action-bar') || pc.querySelector('.page-header');
    if (bar) bar.insertAdjacentHTML('beforeend', html);
  }
  function watch() {
    var pc = document.getElementById('page-content');
    if (!pc || pc._fx || typeof MutationObserver === 'undefined') return;
    pc._fx = 1;
    var q = 0;
    new MutationObserver(function () { if (q) return; q = 1; requestAnimationFrame(function () { q = 0; pageButton(); }); }).observe(pc, { childList: true, subtree: true });
    pageButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  setTimeout(watch, 0);

  window.AXFulus = {
    render: render, run: run, compute: compute, settings: settings, digest: digest, saveDigest: function () { saveDigest().catch(function () {}); }, testDigest: testDigest, digests: digests, linkTg: linkTg, unlinkTg: unlinkTg, saveCfg: saveCfg, draw: draw, saveDraw: saveDraw,
    close: close, sum: sum, saveClose: saveClose, print: print, share: share,
    month: function (v) { if (v) { ui.month = v; render(); } },
    shift: function (n) { var p = (ui.month || today().slice(0, 7)).split('-'); var x = new Date(+p[0], +p[1] - 1 + n, 1); var ym = ds(x).slice(0, 7); if (ym > today().slice(0, 7)) return; ui.month = ym; render(); },
    reset: function () { ui.ran = false; ui.month = ''; }
  };
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · أرباحي (4.37) — الربح الحقيقي، ليه اتغير، وإزاي يزيد
   ------------------------------------------------------------------
   · الإيرادات = الصرف + الفواتير اللي مش طالعة من صرف (بعد الخصم ومن غير
     ضريبة) − مرتجع المبيعات · تكلفة البضاعة المباعة = الكمية × سعر تكلفة
     الصنف · مجمل الربح = الإيرادات − التكلفة · المصروفات = كل المصروفات
     ما عدا فواتير الشراء (دي بضاعة) · صافي الربح = مجمل الربح − المصروفات
   · الربح ≠ الفلوس: التحصيل الفعلي في الفترة بيتعرض لوحده جنب الربح
   · مقارنة بالفترة اللي قبلها (نفس الطول) وتحليل أسباب الفرق:
     حجم المبيعات · هامش الربح · المصروفات — مجموعهم = الفرق بالظبط
   · رسم شهري لآخر 12 شهر (التكلفة + المصروفات + الصافي = الإيرادات)
   · أكتر الأصناف والعملاء ربحاً، والنصايح محسوبة من الأرقام الفعلية
   AXProfit.compute(data, from, to) — pure numbers (used by the tests)
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { p: 'month', from: '', to: '', tab: 'products', all: false, view: 'profit' };
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var C = { cost: '#4C79D4', exp: '#14A094', net: '#E5232F' };    // validated (dark + light, CVD-safe adjacent pairs)

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(d, k) { return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(N(n)); } catch (e) {} return num(n); }
  function cur() { var s = D().settings || {}; return s.currency || 'ج'; }
  function compact(v) { var a = Math.abs(v), s = v < 0 ? '−' : ''; return s + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'م' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'ك' : num(a)); }
  function pct(v) { return (isFinite(v) ? (Math.round(v * 10) / 10) : 0) + '%'; }
  function ds(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function today() { return typeof todayStr === 'function' ? todayStr() : ds(new Date()); }
  function dmy(s) { var p = String(s || '').split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : ''; }
  function day(s) { return String(s || '').slice(0, 10); }
  function addDays(s, n) { var d = pd(s); d.setDate(d.getDate() + n); return ds(d); }
  function spanDays(a, b) { return Math.round((pd(b) - pd(a)) / 864e5) + 1; }

  /* ── the period and the one before it ── */
  function range(p, t) {
    t = t || today(); var d = pd(t), y = d.getFullYear(), m = d.getMonth();
    if (p === 'month') return { from: ds(new Date(y, m, 1)), to: t, label: 'الشهر ده', prevLabel: 'نفس الأيام من الشهر اللي فات',
      prev: [ds(new Date(y, m - 1, 1)), ds(new Date(y, m - 1, Math.min(d.getDate(), new Date(y, m, 0).getDate())))] };
    if (p === 'last') return { from: ds(new Date(y, m - 1, 1)), to: ds(new Date(y, m, 0)), label: 'الشهر اللي فات', prevLabel: 'الشهر اللي قبله', prev: [ds(new Date(y, m - 2, 1)), ds(new Date(y, m - 1, 0))] };
    if (p === '3m') { var f3 = ds(new Date(y, m - 2, 1)); return { from: f3, to: t, label: 'آخر 3 شهور', prevLabel: 'الـ3 شهور اللي قبلهم', prev: [ds(new Date(y, m - 5, 1)), addDays(f3, -1)] }; }
    if (p === 'year') return { from: ds(new Date(y, 0, 1)), to: t, label: 'السنة دي', prevLabel: 'نفس الفترة من السنة اللي فاتت', prev: [ds(new Date(y - 1, 0, 1)), ds(new Date(y - 1, m, Math.min(d.getDate(), new Date(y - 1, m + 1, 0).getDate())))] };
    var f = ui.from || ds(new Date(y, m, 1)), to = ui.to || t;
    if (f > to) { var x = f; f = to; to = x; }
    var n = spanDays(f, to);
    return { from: f, to: to, label: dmy(f) + ' ← ' + dmy(to), prevLabel: 'الـ' + n + ' يوم اللي قبلها', prev: [addDays(f, -n), addDays(f, -1)] };
  }

  /* ── every sold line: { date, cid, pid, name, qty, rev, cost, noCost, ret } (returns have a minus) ── */
  function lines(d) {
    d = d || D();
    var prod = {}; A(d, 'products').forEach(function (p) { if (p) prod[p.id] = p; });
    var out = [];
    function push(date, cid, pid, name, qty, rev, ret) {
      var p = prod[pid], unitCost = p ? N(p.cost) : 0;
      out.push({ date: day(date), cid: cid, pid: pid || ('n:' + name), name: (p && p.name) || name || 'صنف', qty: N(qty), rev: N(rev),
        cost: unitCost * N(qty), noCost: !unitCost, ret: !!ret });
    }
    A(d, 'issuances').forEach(function (i) {
      if (!i) return;
      if (Array.isArray(i.items) && i.items.length && !i.productId) {
        i.items.forEach(function (it) { push(i.date, i.customerId, it.productId, it.productName || it.name, it.qty || it.quantity, it.total != null ? it.total : N(it.qty || it.quantity) * N(it.price || it.unitPrice)); });
      } else push(i.date, i.customerId, i.productId, i.productName, i.quantity, i.total);
    });
    A(d, 'invoices').forEach(function (v) {
      if (!v || v.sourceIssuanceId) return;     // made from an issuance — already counted
      var sub = N(v.subtotal) || (v.items || []).reduce(function (s, it) { return s + N(it.total); }, 0);
      var k = sub > 0 ? Math.max(0, sub - N(v.discount)) / sub : 1;
      (v.items || []).forEach(function (it) { push(v.date, v.customerId, it.productId, it.productName || it.name, it.qty || it.quantity, N(it.total) * k); });
    });
    var rets = (d.settings && Array.isArray(d.settings._returns)) ? d.settings._returns : [];
    rets.forEach(function (r) {
      if (!r || r.type !== 'sale') return;
      (r.items || []).forEach(function (it) { push(r.date, r.customerId, it.productId, it.name, -N(it.qty), -N(it.net != null ? it.net : it.total), true); });
    });
    return out;
  }
  function group(ls, key, names) {
    var m = {};
    ls.forEach(function (l) {
      var k = l[key], g = m[k] || (m[k] = { key: k, name: (names && names[k]) || l.name, rev: 0, cost: 0, qty: 0, n: 0, noCost: 0, below: 0 });
      g.rev += l.rev; g.cost += l.cost; g.qty += l.qty; if (!l.ret) g.n++;
      if (l.noCost && !l.ret) g.noCost++;
      if (!l.noCost && !l.ret && l.rev < l.cost - 0.01) g.below++;
    });
    return Object.keys(m).map(function (k) { var g = m[k]; g.profit = g.rev - g.cost; g.margin = g.rev ? g.profit / g.rev * 100 : 0; return g; });
  }
  function inR(x, a, b) { x = day(x); return x >= a && x <= b; }

  /* ── one period's numbers ── */
  function period(d, all, from, to) {
    var ls = all.filter(function (l) { return l.date >= from && l.date <= to; });
    var rev = 0, cost = 0, returns = 0;
    ls.forEach(function (l) { rev += l.rev; cost += l.cost; if (l.ret) returns -= l.rev; });
    var exps = A(d, 'expenses').filter(function (e) { return e && e.kind !== 'purchase' && inR(e.date, from, to); });
    var exp = 0, byCat = {};
    exps.forEach(function (e) { var a = N(e.amount), c = String(e.category || 'أخرى'); exp += a; byCat[c] = (byCat[c] || 0) + a; });
    var coll = 0, nColl = 0;
    A(d, 'payments').forEach(function (p) { if (p && inR(p.date, from, to) && N(p.amount) > 0) { coll += N(p.amount); nColl++; } });
    var refunds = 0;
    ((d.settings && Array.isArray(d.settings._returns)) ? d.settings._returns : []).forEach(function (r) { if (r && r.type === 'sale' && inR(r.date, from, to)) refunds += N(r.refund); });
    var gross = rev - cost, net = gross - exp;
    return { from: from, to: to, lines: ls, rev: rev, cost: cost, gross: gross, exp: exp, net: net, returns: returns,
      grossMargin: rev ? gross / rev * 100 : 0, netMargin: rev ? net / rev * 100 : 0, expRatio: rev ? exp / rev * 100 : 0,
      byCat: byCat, coll: coll, nColl: nColl, refunds: refunds, cashIn: coll - refunds };
  }

  /* ── everything the page shows (pure: data in, numbers out) ── */
  function compute(d, from, to, prevFrom, prevTo) {
    d = d || D();
    var all = lines(d);
    var names = {}; A(d, 'customers').forEach(function (c) { if (c) names[c.id] = c.name; });
    var c = period(d, all, from, to);
    var p = prevFrom ? period(d, all, prevFrom, prevTo) : null;
    c.byProduct = group(c.lines, 'pid');
    c.byCustomer = group(c.lines, 'cid', names).map(function (g) { if (!names[g.key]) g.name = 'عميل محذوف'; return g; });
    var out = { cur: c, prev: p };
    if (p) {
      /* why the net profit moved — exact: Δnet = volume + margin + expenses */
      var pm = p.rev ? p.gross / p.rev : 0, cm = c.rev ? c.gross / c.rev : 0;
      out.drivers = { volume: (c.rev - p.rev) * pm, margin: c.rev * (cm - pm), expenses: -(c.exp - p.exp), total: c.net - p.net };
      p.byProduct = group(p.lines, 'pid');
      p.byCustomer = group(p.lines, 'cid', names);
      out.movers = { products: movers(c.byProduct, p.byProduct), customers: movers(c.byCustomer, p.byCustomer, names) };
      var cats = {}; Object.keys(c.byCat).concat(Object.keys(p.byCat)).forEach(function (k) { cats[k] = (c.byCat[k] || 0) - (p.byCat[k] || 0); });
      out.expMovers = Object.keys(cats).map(function (k) { return { name: k, diff: cats[k], cur: c.byCat[k] || 0, prev: p.byCat[k] || 0 }; }).sort(function (a, b) { return b.diff - a.diff; });
    }
    /* receivables now (what customers owe) */
    out.receivables = A(d, 'customers').reduce(function (s, x) { return s + Math.max(0, x ? N(x.balance) : 0); }, 0);
    out.debtors = A(d, 'customers').filter(function (x) { return x && N(x.balance) > 0; }).sort(function (a, b) { return N(b.balance) - N(a.balance); }).slice(0, 3);
    return out;
  }
  function movers(curG, prevG, names) {
    var m = {};
    curG.forEach(function (g) { m[g.key] = { key: g.key, name: g.name, cur: g.profit, prev: 0 }; });
    prevG.forEach(function (g) { (m[g.key] || (m[g.key] = { key: g.key, name: (names && names[g.key]) || g.name, cur: 0, prev: 0 })).prev = g.profit; });
    return Object.keys(m).map(function (k) { var x = m[k]; x.diff = x.cur - x.prev; return x; }).sort(function (a, b) { return b.diff - a.diff; });
  }
  /* the last 12 months ending with the month of `to` */
  function monthly(d, to) {
    var all = lines(d), e = pd(to), out = [];
    for (var i = 11; i >= 0; i--) {
      var f = new Date(e.getFullYear(), e.getMonth() - i, 1), l = new Date(e.getFullYear(), e.getMonth() - i + 1, 0);
      var x = period(d, all, ds(f), ds(l));
      out.push({ key: ds(f).slice(0, 7), label: MONTHS[f.getMonth()], year: f.getFullYear(), rev: x.rev, cost: x.cost, exp: x.exp, net: x.net, margin: x.netMargin });
    }
    return out;
  }

  /* ── the smart summary: what happened and why ── */
  function summary(R, rg) {
    var c = R.cur, p = R.prev, out = [];
    if (!c.rev && !c.exp) return ['مفيش مبيعات ولا مصروفات في ' + rg.label + ' — اختار فترة تانية.'];
    var st = c.net >= 0 ? 'صافي ربحك في ' + rg.label + ' <b>' + money(c.net) + '</b>' : 'في ' + rg.label + ' عندك <b>خسارة ' + money(-c.net) + '</b>';
    st += ' من إيرادات ' + money(c.rev) + ' — يعني كل 100 ' + cur() + ' بيع بيفضل منها <b>' + num(c.netMargin) + ' ' + cur() + '</b> صافي.';
    out.push(st);
    if (p && (p.rev || p.exp)) {
      var dl = R.drivers.total, chg = p.net ? dl / Math.abs(p.net) * 100 : null;
      var head = Math.abs(dl) < 1 ? 'الربح زي ' + rg.prevLabel + ' تقريباً.'
        : 'الربح ' + (dl > 0 ? '<b class="up">زاد ' : '<b class="down">قلّ ') + money(Math.abs(dl)) + (chg != null && isFinite(chg) ? ' (' + pct(Math.abs(chg)) + ')' : '') + '</b> عن ' + rg.prevLabel + '.';
      out.push(head);
      if (Math.abs(dl) >= 1) {
        var dv = R.drivers, parts = [
          { v: dv.volume, t: dv.volume >= 0 ? 'المبيعات زادت ' + money(c.rev - p.rev) : 'المبيعات قلّت ' + money(p.rev - c.rev) },
          { v: dv.margin, t: dv.margin >= 0 ? 'هامش الربح اتحسّن من ' + pct(p.grossMargin) + ' لـ ' + pct(c.grossMargin) : 'هامش الربح نزل من ' + pct(p.grossMargin) + ' لـ ' + pct(c.grossMargin) },
          { v: dv.expenses, t: dv.expenses >= 0 ? 'المصروفات قلّت ' + money(p.exp - c.exp) : 'المصروفات زادت ' + money(c.exp - p.exp) }
        ].sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
        out.push('السبب الأكبر: ' + parts[0].t + ' (أثرها ' + sign(parts[0].v) + ')' + (Math.abs(parts[1].v) >= 1 ? '، وبعده ' + parts[1].t + ' (' + sign(parts[1].v) + ')' : '') + '.');
        var mv = R.movers, up = mv.customers[0], dn = mv.customers[mv.customers.length - 1], pu = mv.products[0], pdn = mv.products[mv.products.length - 1];
        var who = [];
        if (dl > 0 && up && up.diff > 0) who.push('أكتر عميل زوّد ربحك: <b>' + esc(up.name) + '</b> (' + sign(up.diff) + ')');
        if (dl > 0 && pu && pu.diff > 0) who.push('وأكتر صنف: <b>' + esc(pu.name) + '</b> (' + sign(pu.diff) + ')');
        if (dl < 0 && dn && dn.diff < 0) who.push('أكتر عميل ربحه قلّ: <b>' + esc(dn.name) + '</b> (' + sign(dn.diff) + ')');
        if (dl < 0 && pdn && pdn.diff < 0) who.push('وأكتر صنف: <b>' + esc(pdn.name) + '</b> (' + sign(pdn.diff) + ')');
        if (who.length) out.push(who.join('، ') + '.');
      }
    } else out.push('مفيش بيانات في ' + rg.prevLabel + ' للمقارنة.');
    return out;
  }
  function sign(v) { return (v >= 0 ? '+' : '−') + money(Math.abs(v)); }

  /* ── advice from the real numbers (largest money first) ── */
  function advice(R, M) {
    var c = R.cur, tips = [];
    var prods = c.byProduct.filter(function (g) { return g.rev > 0 && !g.noCost; });
    /* 1 · sold below cost */
    var below = prods.filter(function (g) { return g.profit < 0; }).sort(function (a, b) { return a.profit - b.profit; });
    if (below.length) tips.push({ k: 'bad', w: -below.reduce(function (s, g) { return s + g.profit; }, 0) * 3, t: 'بتبيع ' + below.length + ' صنف بأقل من التكلفة',
      d: below.slice(0, 3).map(function (g) { return '<b>' + esc(g.name) + '</b> خسارة ' + money(-g.profit); }).join('، ') + ' — ارفع السعر أو راجع سعر التكلفة.', gain: -below.reduce(function (s, g) { return s + g.profit; }, 0) });
    /* 2 · low margin, worth a price raise to 20% */
    var low = prods.filter(function (g) { return g.profit >= 0 && g.margin < 15 && g.rev >= Math.max(500, c.rev * 0.03); }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 3);
    if (low.length) {
      var gain = 0, txt = low.map(function (g) { var need = g.cost / 0.8, up = need / g.rev - 1; gain += need - g.rev; return '<b>' + esc(g.name) + '</b> هامشه ' + pct(g.margin) + ' — زوّد سعره ' + pct(up * 100); });
      tips.push({ k: 'warn', w: gain, t: 'أصناف هامشها ضعيف — زيادة بسيطة في السعر تفرق', d: txt.join('، ') + ' عشان يوصل 20%. لو اتباعت نفس الكميات هتكسب زيادة <b>' + money(gain) + '</b> في الفترة دي.', gain: gain });
    }
    /* 3 · push the best-margin products */
    var star = prods.filter(function (g) { return g.margin >= 25 && g.rev > 0; }).sort(function (a, b) { return b.margin - a.margin; }).slice(0, 2);
    if (star.length) {
      var sg = star.reduce(function (s, g) { return s + g.profit * 0.1; }, 0);
      tips.push({ k: 'good', w: sg, t: 'ركّز على الأصناف اللي بتكسّبك أكتر', d: star.map(function (g) { return '<b>' + esc(g.name) + '</b> هامشه ' + pct(g.margin); }).join('، ') + ' — كل 10% زيادة في بيعهم = <b>' + money(sg) + '</b> ربح زيادة.', gain: sg });
    }
    /* 4 · customers on thin margins (special prices) */
    var lowC = c.byCustomer.filter(function (g) { return g.rev >= Math.max(1000, c.rev * 0.05) && g.margin < 10 && !g.noCost; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 3);
    if (lowC.length) tips.push({ k: 'warn', w: lowC.reduce(function (s, g) { return s + g.rev * 0.05; }, 0), t: 'عملاء بيشتروا كتير بهامش ضعيف',
      d: lowC.map(function (g) { return '<b>' + esc(g.name) + '</b> ' + pct(g.margin); }).join('، ') + ' — راجع أسعارهم الخاصة؛ زيادة 5% بس عليهم = <b>' + money(lowC.reduce(function (s, g) { return s + g.rev * 0.05; }, 0)) + '</b>.', gain: lowC.reduce(function (s, g) { return s + g.rev * 0.05; }, 0) });
    /* 5 · expenses that grew */
    if (R.expMovers) {
      var eg = R.expMovers.filter(function (x) { return x.diff > 0 && x.prev > 0 && x.diff / x.prev > 0.2 && x.diff >= 200; }).slice(0, 2);
      if (eg.length) tips.push({ k: 'warn', w: eg.reduce(function (s, x) { return s + x.diff; }, 0), t: 'مصروفات زادت عن الفترة اللي فاتت',
        d: eg.map(function (x) { return '<b>' + esc(x.name) + '</b> من ' + money(x.prev) + ' لـ ' + money(x.cur); }).join('، ') + ' — لو رجعت لمستواها هتوفر <b>' + money(eg.reduce(function (s, x) { return s + x.diff; }, 0)) + '</b>.', gain: eg.reduce(function (s, x) { return s + x.diff; }, 0) });
    }
    if (c.rev > 0 && c.expRatio > 30) tips.push({ k: 'bad', w: c.exp * 0.1, t: 'المصروفات بتاكل ' + pct(c.expRatio) + ' من الإيرادات', d: 'تقليل المصروفات 10% بس يزوّد صافي ربحك <b>' + money(c.exp * 0.1) + '</b>.', gain: c.exp * 0.1 });
    /* 6 · profit on paper, not in the drawer */
    if (c.rev > 0 && c.cashIn < c.rev * 0.7) {
      var dbt = R.debtors.map(function (x) { return '<b>' + esc(x.name) + '</b> ' + money(x.balance); }).join('، ');
      tips.push({ k: 'warn', w: (c.rev - c.cashIn) * 0.2, t: 'الربح على الورق أكتر من الفلوس اللي دخلت', d: 'حصّلت ' + money(c.cashIn) + ' بس من مبيعات ' + money(c.rev) + ' — المديونيات عند العملاء ' + money(R.receivables) + (dbt ? ' (أكبرهم: ' + dbt + ')' : '') + '. حصّل الأول عشان الربح يبقى فلوس.', gain: 0 });
    }
    /* 7 · depending on one customer */
    var tot = c.byCustomer.reduce(function (s, g) { return s + Math.max(0, g.profit); }, 0), top = c.byCustomer.slice().sort(function (a, b) { return b.profit - a.profit; })[0];
    if (top && tot > 0 && c.byCustomer.length > 2 && top.profit / tot > 0.4) tips.push({ k: 'info', w: top.profit * 0.05, t: 'ربحك معتمد على عميل واحد', d: '<b>' + esc(top.name) + '</b> لوحده ' + pct(top.profit / tot * 100) + ' من الربح — وسّع عملاءك عشان تقلل المخاطرة.', gain: 0 });
    /* 8 · missing costs, returns, trend */
    var nc = c.byProduct.filter(function (g) { return g.noCost && g.rev > 0; });
    if (nc.length) tips.push({ k: 'info', w: 1e9, t: nc.length + ' صنف من غير سعر تكلفة — الربح بيطلع أكبر من الحقيقي', d: nc.slice(0, 4).map(function (g) { return '<b>' + esc(g.name) + '</b>'; }).join('، ') + (nc.length > 4 ? '…' : '') + ' — سجّل التكلفة من المخازن.', gain: 0 });
    if (c.rev > 0 && c.returns / (c.rev + c.returns) > 0.05) tips.push({ k: 'warn', w: c.returns * 0.3, t: 'المرتجعات ' + pct(c.returns / (c.rev + c.returns) * 100) + ' من المبيعات', d: 'رجع بضاعة بـ ' + money(c.returns) + ' — راجع أسباب المرتجع (الجودة / غلط الطلبات).', gain: 0 });
    if (M && M.length >= 3) {
      var l3 = M.slice(-3);
      if (l3[0].net > l3[1].net && l3[1].net > l3[2].net) tips.push({ k: 'bad', w: (l3[0].net - l3[2].net), t: 'صافي الربح نازل 3 شهور ورا بعض', d: MONTHS.indexOf(l3[0].label) >= 0 ? 'من ' + money(l3[0].net) + ' (' + l3[0].label + ') لـ ' + money(l3[2].net) + ' (' + l3[2].label + ') — راجع الأسعار والمصروفات الشهر ده.' : '', gain: 0 });
    }
    if (!tips.length && c.rev > 0) tips.push({ k: 'good', w: 0, t: 'أرقامك كويسة', d: 'هامش صافي ' + pct(c.netMargin) + ' والمصروفات ' + pct(c.expRatio) + ' من الإيرادات — كمّل على كده وراقب الأصناف الجديدة.', gain: 0 });
    return tips.sort(function (a, b) { return b.w - a.w; }).slice(0, 6);
  }

  /* ════════ the page ════════ */
  var IC = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 9v8H9"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>'
  };
  var TIPK = { bad: '!', warn: '↑', good: '★', info: 'i' };

  function delta(curV, prevV, invert, pts) {
    if (prevV == null || (pts && Math.abs(prevV) > 100)) return '';   // a margin beyond ±100% (almost no sales then) can't be compared
    var d = curV - prevV;
    if (Math.abs(d) < (pts ? 0.05 : 0.5)) return '<em class="pfx-d same">زي الفترة اللي فاتت</em>';
    var good = invert ? d < 0 : d > 0, p = prevV ? Math.abs(d / prevV * 100) : null;
    var txt = pts ? (Math.round(Math.abs(d) * 10) / 10) + ' نقطة' : (p != null && isFinite(p) && p < 1000 ? pct(p) : money(Math.abs(d)));   // a margin moves in points, not in % of itself
    return '<em class="pfx-d ' + (good ? 'good' : 'bad') + '">' + (d > 0 ? IC.up : IC.down) + '<span>' + txt + '</span></em>';
  }
  function kpi(label, v, prevV, opt) {
    opt = opt || {};
    return '<div class="pfx-k' + (opt.cls ? ' ' + opt.cls : '') + '"><span class="pfx-kl">' + (opt.dot ? '<i style="background:' + opt.dot + '"></i>' : '') + label + '</span>' +
      '<b>' + (opt.fmt ? opt.fmt(v) : money(v)) + '</b>' + delta(v, prevV, opt.invert, opt.pts) +
      (prevV != null ? '<small>قبلها: ' + (opt.fmt ? opt.fmt(prevV) : money(prevV)) + '</small>' : '') + '</div>';
  }

  /* 4.38 · two views: «الربح» (this page) · «الفلوس» (js/fulusi.js) */
  function views() {
    return '<div class="pfx-views ax-hl-off" role="tablist">' + [['profit', 'الربح'], ['cash', 'الفلوس']].map(function (o) {
      return '<button type="button" role="tab" aria-selected="' + (ui.view === o[0]) + '" class="' + (ui.view === o[0] ? 'on' : '') + '" onclick="AXProfit.view(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function render() {
    var host = document.getElementById('pfx-root'); if (!host) return;
    if (ui.view === 'cash' && window.AXFulus) {
      host.innerHTML = '<header class="pfx-head ax-hl-off"><div><h2>أرباحي</h2><p>الفلوس دخلت منين وراحت فين، والخزنة فيها كام بالظبط، وتقدر تسحب كام</p></div></header>' + views() + '<div id="fx-root" class="fx"></div>';
      AXFulus.render(document.getElementById('fx-root'));
      return;
    }
    var rg = range(ui.p), R = compute(D(), rg.from, rg.to, rg.prev[0], rg.prev[1]), c = R.cur, p = R.prev, M = monthly(D(), rg.to);
    var periods = [['month', 'الشهر ده'], ['last', 'الشهر اللي فات'], ['3m', 'آخر 3 شهور'], ['year', 'السنة دي'], ['custom', 'فترة']];
    var sum = summary(R, rg), tips = advice(R, M);
    var base = Math.max(c.rev, c.cost + c.exp, 1);
    var w = function (v) { return Math.max(0, v / base * 100).toFixed(2) + '%'; };

    var list = (ui.tab === 'products' ? c.byProduct : c.byCustomer).filter(function (g) { return g.rev !== 0 || g.cost !== 0; }).sort(function (a, b) { return b.profit - a.profit; });
    var shown = ui.all ? list : list.slice(0, 6), maxP = list.reduce(function (m, g) { return Math.max(m, Math.abs(g.profit)); }, 1);
    var cats = Object.keys(c.byCat).map(function (k) { return { k: k, v: c.byCat[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 5), maxCat = cats.length ? cats[0].v : 1;
    var dv = R.drivers, maxDv = dv ? Math.max(1, Math.abs(dv.volume), Math.abs(dv.margin), Math.abs(dv.expenses)) : 1;
    var drv = function (label, v, hint) {
      var wd = (Math.abs(v) / maxDv * 50).toFixed(2);
      return '<div class="pfx-dr"><div class="pfx-drl"><b>' + label + '</b><small>' + hint + '</small></div><div class="pfx-drb"><i class="' + (v >= 0 ? 'pos' : 'neg') + '" style="width:' + wd + '%"></i></div><b class="pfx-drv ' + (v >= 0 ? 'pos' : 'neg') + '">' + sign(v) + '</b></div>';
    };

    host.innerHTML =
      '<header class="pfx-head ax-hl-off"><div><h2>أرباحي</h2><p>الربح الحقيقي من البيع، ليه اتغير، وإزاي يزيد — من أرقامك الفعلية</p></div></header>' + views() +
      '<div class="pfx-filters ax-hl-off"><div class="pfx-seg" role="group" aria-label="الفترة">' + periods.map(function (o) {
        return '<button type="button" class="' + (ui.p === o[0] ? 'on' : '') + '" onclick="AXProfit.period(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        (ui.p === 'custom' ? '<div class="pfx-dates"><label><span>من</span><input class="form-control" type="date" value="' + rg.from + '" onchange="AXProfit.custom(this.value,null)"></label><label><span>إلى</span><input class="form-control" type="date" value="' + rg.to + '" onchange="AXProfit.custom(null,this.value)"></label></div>' : '') +
        '<span class="pfx-range">' + dmy(rg.from) + ' ← ' + dmy(rg.to) + ' · مقارنة بـ' + esc(rg.prevLabel) + '</span></div>' +

      /* hero: net profit + the smart summary */
      '<section class="pfx-hero ax-hl-off"><div class="pfx-hn"><span>صافي الربح · ' + esc(rg.label) + '</span><b class="' + (c.net < 0 ? 'neg' : '') + '">' + money(c.net) + '</b>' +
        '<div class="pfx-hm"><span>هامش صافي <b>' + pct(c.netMargin) + '</b></span>' + delta(c.net, p ? p.net : null) + '</div></div>' +
        '<div class="pfx-sum"><h3>' + IC.spark + 'ملخص ذكي</h3>' + sum.map(function (s) { return '<p>' + s + '</p>'; }).join('') + '</div></section>' +

      /* the five numbers */
      '<section class="pfx-kpis ax-hl-off">' +
        kpi('الإيرادات', c.rev, p ? p.rev : null) +
        kpi('تكلفة البضاعة المباعة', c.cost, p ? p.cost : null, { invert: true, dot: C.cost }) +
        kpi('مجمل الربح', c.gross, p ? p.gross : null) +
        kpi('المصروفات', c.exp, p ? p.exp : null, { invert: true, dot: C.exp }) +
        kpi('صافي الربح', c.net, p ? p.net : null, { cls: c.net < 0 ? 'neg' : 'hl', dot: C.net }) +
        kpi('هامش الربح', c.netMargin, p ? p.netMargin : null, { fmt: pct, pts: true }) +
      '</section>' +

      /* where every pound of sales went */
      '<section class="pfx-card ax-hl-off"><header><b>كل جنيه بيع راح فين؟</b><span>' + money(c.rev) + ' إيرادات' + (c.returns ? ' (بعد مرتجع ' + money(c.returns) + ')' : '') + '</span></header>' +
        '<div class="pfx-flow" role="img" aria-label="الإيرادات مقسمة: تكلفة ' + money(c.cost) + '، مصروفات ' + money(c.exp) + '، صافي ' + money(c.net) + '">' +
          '<i style="width:' + w(c.cost) + ';background:' + C.cost + '"></i><i style="width:' + w(c.exp) + ';background:' + C.exp + '"></i>' + (c.net > 0 ? '<i style="width:' + w(c.net) + ';background:' + C.net + '"></i>' : '') + '</div>' +
        '<div class="pfx-flowl">' +
          '<span><i style="background:' + C.cost + '"></i>تكلفة البضاعة <b>' + money(c.cost) + '</b> <small>' + pct(c.rev ? c.cost / c.rev * 100 : 0) + '</small></span>' +
          '<span><i style="background:' + C.exp + '"></i>المصروفات <b>' + money(c.exp) + '</b> <small>' + pct(c.expRatio) + '</small></span>' +
          '<span><i style="background:' + C.net + '"></i>' + (c.net >= 0 ? 'صافي الربح' : 'خسارة') + ' <b>' + money(Math.abs(c.net)) + '</b> <small>' + pct(Math.abs(c.netMargin)) + '</small></span></div></section>' +

      /* monthly chart */
      '<section class="pfx-card ax-hl-off"><header><b>الأرباح شهر بشهر</b><span>آخر 12 شهر — العمود كله = الإيرادات</span></header>' +
        '<div class="pfx-legend"><span><i style="background:' + C.cost + '"></i>تكلفة البضاعة</span><span><i style="background:' + C.exp + '"></i>المصروفات</span><span><i style="background:' + C.net + '"></i>صافي الربح</span><span><i class="hatch"></i>خسارة</span></div>' +
        '<div id="pfx-chart" class="pfx-chart"></div>' +
        '<details class="pfx-table"><summary>عرض الأرقام كجدول</summary><div class="pfx-tw"><table><thead><tr><th>الشهر</th><th>الإيرادات</th><th>التكلفة</th><th>المصروفات</th><th>صافي الربح</th><th>الهامش</th></tr></thead><tbody>' +
          M.slice().reverse().map(function (m) { return '<tr><td>' + m.label + ' ' + m.year + '</td><td>' + num(m.rev) + '</td><td>' + num(m.cost) + '</td><td>' + num(m.exp) + '</td><td class="' + (m.net < 0 ? 'neg' : '') + '">' + num(m.net) + '</td><td>' + pct(m.margin) + '</td></tr>'; }).join('') +
        '</tbody></table></div></details></section>' +

      '<div class="pfx-two">' +
      /* why it moved */
      (dv ? '<section class="pfx-card ax-hl-off"><header><b>ليه الربح اتغير؟</b><span>' + sign(dv.total) + ' عن ' + esc(rg.prevLabel) + '</span></header>' +
        drv('حجم المبيعات', dv.volume, 'بعت ' + (c.rev >= p.rev ? 'أكتر' : 'أقل') + ' بـ ' + money(Math.abs(c.rev - p.rev))) +
        drv('هامش الربح', dv.margin, 'من ' + pct(p.grossMargin) + ' لـ ' + pct(c.grossMargin)) +
        drv('المصروفات', dv.expenses, money(p.exp) + ' ← ' + money(c.exp)) +
        '<p class="pfx-note">الثلاثة مع بعض = الفرق في صافي الربح بالظبط.</p></section>' : '') +
      /* profit is not cash */
      '<section class="pfx-card pfx-cash ax-hl-off"><header><b>' + IC.cash + 'الربح مش هو الفلوس</b><span>التحصيل الفعلي في نفس الفترة</span></header>' +
        '<div class="pfx-cg"><div><span>صافي الربح</span><b>' + money(c.net) + '</b></div><div><span>اللي اتحصّل فعلاً</span><b>' + money(c.cashIn) + '</b><small>' + c.nColl + ' عملية تحصيل' + (c.refunds ? ' − رد مرتجع ' + money(c.refunds) : '') + '</small></div>' +
        '<div><span>المبيعات اللي اتحصّلت</span><b>' + pct(c.rev ? Math.min(999, c.cashIn / c.rev * 100) : 0) + '</b></div><div><span>مديونيات العملاء دلوقتي</span><b>' + money(R.receivables) + '</b></div></div>' +
        '<p class="pfx-note">الربح بيتحسب ساعة البيع حتى لو آجل؛ التحصيل هو الفلوس اللي دخلت فعلاً. الاتنين منفصلين هنا.</p></section>' +
      '</div>' +

      /* advice */
      '<section class="pfx-card pfx-tips ax-hl-off"><header><b>' + IC.bulb + 'نصايح لزيادة الربح</b><span>محسوبة من أرقام ' + esc(rg.label) + '</span></header>' +
        (tips.length ? tips.map(function (t) {
          return '<div class="pfx-tip ' + t.k + '"><i>' + TIPK[t.k] + '</i><div><b>' + t.t + '</b><p>' + t.d + '</p></div></div>';
        }).join('') : '<div class="pfx-empty">سجّل مبيعات عشان النصايح تظهر</div>') + '</section>' +

      /* top products / customers */
      '<section class="pfx-card ax-hl-off"><header><div class="pfx-seg sm">' + [['products', 'الأصناف'], ['customers', 'العملاء']].map(function (o) {
          return '<button type="button" class="' + (ui.tab === o[0] ? 'on' : '') + '" onclick="AXProfit.tab(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<span>الأكتر ربحاً · ' + list.length + (ui.tab === 'products' ? ' صنف' : ' عميل') + '</span></header>' +
        (shown.length ? '<div class="pfx-rank">' + shown.map(function (g, i) {
          var wd = Math.max(2, Math.abs(g.profit) / maxP * 100);
          return '<div class="pfx-r"><span class="pfx-ri">' + (i + 1) + '</span><div class="pfx-rn"><b>' + esc(g.name) + '</b><small>' + money(g.rev) + ' مبيعات · ' + (ui.tab === 'products' ? num(g.qty) + ' اتباع' : g.n + ' عملية') + '</small>' +
            '<span class="pfx-rb"><i class="' + (g.profit < 0 ? 'neg' : '') + '" style="width:' + wd.toFixed(1) + '%"></i></span></div>' +
            '<div class="pfx-rv"><b class="' + (g.profit < 0 ? 'neg' : '') + '">' + money(g.profit) + '</b><em class="pfx-m ' + (g.noCost ? 'na' : g.margin < 10 ? 'lo' : g.margin < 25 ? 'mid' : 'hi') + '">' + (g.noCost ? 'تكلفة؟' : pct(g.margin)) + '</em></div></div>';
        }).join('') + '</div>' + (list.length > 6 ? '<button type="button" class="pfx-more" onclick="AXProfit.all()">' + (ui.all ? 'أقل' : 'عرض الكل (' + list.length + ')') + '</button>' : '')
          : '<div class="pfx-empty">مفيش مبيعات في الفترة دي</div>') + '</section>' +

      /* expenses by category */
      (cats.length ? '<section class="pfx-card ax-hl-off"><header><b>المصروفات حسب النوع</b><span>' + money(c.exp) + '</span></header><div class="pfx-cats">' + cats.map(function (x) {
        return '<div class="pfx-cat"><span>' + esc(x.k) + '</span><span class="pfx-rb"><i style="width:' + Math.max(2, x.v / maxCat * 100).toFixed(1) + '%;background:' + C.exp + '"></i></span><b>' + money(x.v) + '</b></div>'; }).join('') + '</div></section>' : '') +

      '<p class="pfx-foot">التكلفة بسعر التكلفة الحالي لكل صنف · الضريبة مش داخلة في الإيرادات · فواتير الشراء مش مصروف (دي بضاعة) · مرتجع المبيعات بيتخصم · الفواتير اللي طالعة من صرف متحسبتش مرتين.</p>';

    chart(document.getElementById('pfx-chart'), M);
  }

  /* ── monthly stacked columns (cost + expenses + net = revenue), oldest on the right ── */
  function chart(host, M) {
    if (!host) return;
    host._m = M;
    var W = Math.max(280, host.clientWidth || 600), H = W < 520 ? 230 : 280, padT = 26, padB = 30, padS = 44;
    var top = M.reduce(function (m, x) { return Math.max(m, x.rev, x.cost + x.exp); }, 0) || 1;
    var step = nice(top / 4), maxV = step * Math.ceil(top / step);
    var ih = H - padT - padB, n = M.length, cw = (W - padS - 8) / n, bw = Math.min(34, cw * 0.62);
    var y = function (v) { return padT + ih - v / maxV * ih; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="الأرباح شهر بشهر لآخر 12 شهر">' +
      '<defs><pattern id="pfx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(229,35,47,.18)"/><line x1="0" y1="0" x2="0" y2="6" stroke="#E5232F" stroke-width="2"/></pattern></defs>';
    for (var g = 0; g <= maxV + 1e-9; g += step) {
      s += '<line x1="' + padS + '" x2="' + (W - 4) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '" class="pfx-grid"/>' +
        '<text x="' + (padS - 6) + '" y="' + (y(g) + 4).toFixed(1) + '" class="pfx-ax" text-anchor="end">' + compact(g) + '</text>';
    }
    M.forEach(function (m, i) {
      var cx = W - 8 - cw * (i + 0.5), x = cx - bw / 2, segs = [[m.cost, C.cost], [m.exp, C.exp]];
      if (m.net > 0) segs.push([m.net, C.net]);
      var acc = 0, last = -1;
      segs.forEach(function (sg, k) { if (sg[0] > 0) last = k; });
      segs.forEach(function (sg, k) {
        if (sg[0] <= 0) return;
        var y0 = y(acc), y1 = y(acc + sg[0]), h = Math.max(0, y0 - y1 - (k === last ? 0 : 2));
        if (h > 0.4) s += k === last ? '<path d="' + topRounded(x, y0 - h, bw, h, 4) + '" fill="' + sg[1] + '"/>' : '<rect x="' + x.toFixed(1) + '" y="' + (y0 - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + sg[1] + '"/>';
        acc += sg[0];
      });
      if (m.net < 0 && m.rev >= 0) {                                   // a loss: the part of the costs above the revenue
        var yr = y(m.rev), yt = y(m.cost + m.exp);
        s += '<rect x="' + x.toFixed(1) + '" y="' + yt.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, yr - yt).toFixed(1) + '" fill="url(#pfx-hatch)"/>' +
          '<line x1="' + (x - 3).toFixed(1) + '" x2="' + (x + bw + 3).toFixed(1) + '" y1="' + yr.toFixed(1) + '" y2="' + yr.toFixed(1) + '" class="pfx-revl"/>';
      }
      if (i === n - 1 || m.net === Math.max.apply(null, M.map(function (q) { return q.net; }))) {
        if (m.rev > 0 || m.net) s += '<text x="' + cx.toFixed(1) + '" y="' + (y(Math.max(m.rev, m.cost + m.exp)) - 8).toFixed(1) + '" class="pfx-lab" text-anchor="middle">' + compact(m.net) + '</text>';
      }
      var every = cw < 34 ? 2 : 1;                                       // narrow screens: every other month (the newest always)
      if ((n - 1 - i) % every === 0) s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" class="pfx-ax" text-anchor="middle">' + (cw < 60 ? m.label.slice(0, 3) : m.label) + '</text>';
      s +=
        '<rect class="pfx-hit" x="' + (cx - cw / 2).toFixed(1) + '" y="' + padT + '" width="' + cw.toFixed(1) + '" height="' + ih + '" data-i="' + i + '" tabindex="0" role="button" aria-label="' + m.label + ' ' + m.year + ': صافي ' + money(m.net) + '"/>';
    });
    s += '</svg><div class="pfx-tip-box" hidden></div>';
    host.innerHTML = s;
    var box = host.querySelector('.pfx-tip-box');
    var show = function (el) {
      var i = +el.getAttribute('data-i'), m = M[i]; if (!m) return;
      host.querySelectorAll('.pfx-hit.on').forEach(function (h) { h.classList.remove('on'); }); el.classList.add('on');
      box.innerHTML = '<b>' + m.label + ' ' + m.year + '</b>' +
        '<div><span>الإيرادات</span><b>' + money(m.rev) + '</b></div><div><span><i style="background:' + C.cost + '"></i>تكلفة البضاعة</span><b>' + money(m.cost) + '</b></div>' +
        '<div><span><i style="background:' + C.exp + '"></i>المصروفات</span><b>' + money(m.exp) + '</b></div><div class="t"><span><i style="background:' + C.net + '"></i>صافي الربح</span><b class="' + (m.net < 0 ? 'neg' : '') + '">' + money(m.net) + '</b></div>' +
        '<div><span>الهامش</span><b>' + pct(m.margin) + '</b></div>';
      box.hidden = false;
      var r = el.getBoundingClientRect(), hr = host.getBoundingClientRect(), bw2 = box.offsetWidth;
      var left = r.left - hr.left + r.width / 2 - bw2 / 2;
      box.style.left = Math.max(0, Math.min(hr.width - bw2, left)) + 'px';
    };
    host.querySelectorAll('.pfx-hit').forEach(function (el) {
      el.addEventListener('pointerenter', function () { show(el); });
      el.addEventListener('click', function () { show(el); });
      el.addEventListener('focus', function () { show(el); });
    });
    host.addEventListener('pointerleave', function () { box.hidden = true; host.querySelectorAll('.pfx-hit.on').forEach(function (h) { h.classList.remove('on'); }); });
    if (!host._ro && typeof ResizeObserver !== 'undefined') {
      host._ro = new ResizeObserver(function () { var w2 = host.clientWidth; if (w2 && Math.abs(w2 - (host._w || 0)) > 6) { host._w = w2; clearTimeout(host._t); host._t = setTimeout(function () { if (host.isConnected) chart(host, host._m); }, 120); } });
      host._ro.observe(host); host._w = host.clientWidth;
    }
  }
  function topRounded(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) + 'V' + (y + r).toFixed(1) + 'Q' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + y.toFixed(1) +
      'H' + (x + w - r).toFixed(1) + 'Q' + (x + w).toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + w).toFixed(1) + ',' + (y + r).toFixed(1) + 'V' + (y + h).toFixed(1) + 'Z';
  }
  function nice(v) { if (v <= 0) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }

  window.renderProfit = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="pfx" id="pfx-root" dir="rtl"></div>';
    render();
  };
  window.AXProfit = {
    render: window.renderProfit, lines: function () { return lines(D()); }, compute: compute, range: range, monthly: monthly,
    view: function (v) { ui.view = v === 'cash' ? 'cash' : 'profit'; render(); },
    period: function (p) { ui.p = p; ui.all = false; render(); }, tab: function (t) { ui.tab = t; ui.all = false; render(); },
    all: function () { ui.all = !ui.all; render(); },
    custom: function (f, t) { if (f) ui.from = f; if (t) ui.to = t; render(); }
  };
})();

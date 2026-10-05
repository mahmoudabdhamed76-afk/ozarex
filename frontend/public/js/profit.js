/* ════════════════════════════════════════════════════════════════════
   ERP · الأرباح — الربح الحقيقي لكل مركز ولكل صنف
   ------------------------------------------------------------------
   · المبيعات = الصرف + الفواتير اللي مش طالعة من صرف (من غير ضريبة،
     وبعد الخصم) · التكلفة = الكمية × سعر تكلفة الصنف
   · الربح الإجمالي والهامش لكل مركز وصنف وشهر، والصافي بعد المصروفات
   · تنبيهات: أصناف من غير تكلفة، بيع بأقل من التكلفة، مراكز هامشها ضعيف
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { p: 'month', from: '', to: '', tab: 'centers' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(Number(n || 0)); } catch (e) {} return num(n); }
  function pct(v) { return (isFinite(v) ? (Math.round(v * 10) / 10) : 0) + '%'; }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  function range() {
    var t = new Date(), y = t.getFullYear(), m = t.getMonth();
    if (ui.p === 'month') return [lds(new Date(y, m, 1)), lds(t)];
    if (ui.p === 'last') return [lds(new Date(y, m - 1, 1)), lds(new Date(y, m, 0))];
    if (ui.p === '3m') return [lds(new Date(y, m - 2, 1)), lds(t)];
    if (ui.p === 'year') return [lds(new Date(y, 0, 1)), lds(t)];
    return [ui.from || lds(new Date(y, m, 1)), ui.to || lds(t)];
  }

  /* every sold line: { date, cid, pid, name, qty, rev, cost } */
  function lines() {
    var prod = {}; A('products').forEach(function (p) { prod[p.id] = p; });
    var out = [];
    function push(date, cid, pid, name, qty, rev) {
      var p = prod[pid], unitCost = p ? Number(p.cost) || 0 : 0;
      out.push({ date: String(date || '').slice(0, 10), cid: cid, pid: pid || ('n:' + name), name: (p && p.name) || name || 'صنف', qty: Number(qty) || 0, rev: Number(rev) || 0,
        cost: unitCost * (Number(qty) || 0), noCost: !unitCost });
    }
    A('issuances').forEach(function (i) {
      if (Array.isArray(i.items) && i.items.length && !i.productId) {
        i.items.forEach(function (it) { push(i.date, i.customerId, it.productId, it.productName || it.name, it.qty || it.quantity, it.total != null ? it.total : (it.qty || it.quantity || 0) * (it.price || it.unitPrice || 0)); });
      } else push(i.date, i.customerId, i.productId, i.productName, i.quantity, i.total);
    });
    A('invoices').forEach(function (v) {
      if (v.sourceIssuanceId) return;     // made from an issuance — already counted
      var sub = Number(v.subtotal) || (v.items || []).reduce(function (s, it) { return s + (Number(it.total) || 0); }, 0);
      var k = sub > 0 ? Math.max(0, sub - (Number(v.discount) || 0)) / sub : 1;
      (v.items || []).forEach(function (it) { push(v.date, v.customerId, it.productId, it.productName || it.name, it.qty || it.quantity, (Number(it.total) || 0) * k); });
    });
    return out;
  }
  function group(ls, key) {
    var m = {};
    ls.forEach(function (l) {
      var k = l[key], g = m[k] || (m[k] = { key: k, rev: 0, cost: 0, qty: 0, n: 0, noCost: 0, below: 0, name: l.name });
      g.rev += l.rev; g.cost += l.cost; g.qty += l.qty; g.n++;
      if (l.noCost) g.noCost++;
      if (!l.noCost && l.rev < l.cost - 0.01) g.below++;
    });
    return Object.keys(m).map(function (k) { var g = m[k]; g.profit = g.rev - g.cost; g.margin = g.rev ? g.profit / g.rev * 100 : 0; return g; });
  }

  function render() {
    var host = document.getElementById('pf-root'); if (!host) return;
    var r = range(), all = lines(), ls = all.filter(function (l) { return l.date >= r[0] && l.date <= r[1]; });
    var rev = ls.reduce(function (s, l) { return s + l.rev; }, 0), cost = ls.reduce(function (s, l) { return s + l.cost; }, 0), gp = rev - cost;
    var exp = A('expenses').filter(function (e) { return e.kind !== 'purchase' && String(e.date || '').slice(0, 10) >= r[0] && String(e.date || '').slice(0, 10) <= r[1]; })
      .reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
    var net = gp - exp, margin = rev ? gp / rev * 100 : 0;
    var cust = {}; A('customers').forEach(function (c) { cust[c.id] = c.name; });
    var byC = group(ls, 'cid').map(function (g) { g.name = cust[g.key] || 'عميل محذوف'; return g; }).sort(function (a, b) { return b.profit - a.profit; });
    var byP = group(ls, 'pid').sort(function (a, b) { return b.profit - a.profit; });
    var noCost = byP.filter(function (g) { return g.noCost; });
    var below = byC.filter(function (g) { return g.below; });
    var weak = byC.filter(function (g) { return g.rev > 0 && g.margin < 10 && !g.noCost; });
    var periods = [['month', 'الشهر ده'], ['last', 'الشهر اللي فات'], ['3m', 'آخر 3 شهور'], ['year', 'السنة دي'], ['custom', 'فترة']];
    var list = ui.tab === 'centers' ? byC : byP, maxP = list.reduce(function (m, g) { return Math.max(m, Math.abs(g.profit)); }, 1);

    host.innerHTML =
      '<div class="cus-tools pf-tools"><div class="ax-seg">' + periods.map(function (o) {
        return '<button class="' + (ui.p === o[0] ? 'on' : '') + '" onclick="AXProfit.period(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        (ui.p === 'custom' ? '<input class="form-control" type="date" value="' + r[0] + '" onchange="AXProfit.custom(this.value,null)"><input class="form-control" type="date" value="' + r[1] + '" onchange="AXProfit.custom(null,this.value)">' : '') +
      '</div>' +
      '<section class="cus-hero pf-hero">' +
        '<div class="cus-hero-t"><span>الربح الإجمالي</span><b class="' + (gp < 0 ? 'neg' : '') + '">' + money(gp) + '</b><small>هامش ' + pct(margin) + ' · من ' + r[0].split('-').reverse().join('/') + ' لـ ' + r[1].split('-').reverse().join('/') + '</small></div>' +
        '<div class="cus-hero-figs pf-figs">' +
          '<div><span>المبيعات</span><b>' + money(rev) + '</b><small>من غير ضريبة</small></div>' +
          '<div><span>تكلفة البضاعة</span><b>' + money(cost) + '</b><small>بسعر التكلفة</small></div>' +
          '<div><span>المصروفات</span><b>' + money(exp) + '</b><small>من غير المشتريات</small></div>' +
          '<div><span>الصافي التقريبي</span><b class="' + (net < 0 ? 'bad' : 'ok') + '">' + money(net) + '</b><small>الربح − المصروفات</small></div>' +
        '</div></section>' +
      '<section class="pf-card"><header><b>الربح شهر بشهر</b><span>آخر 12 شهر</span></header><div id="pf-chart" class="pf-chart"></div></section>' +
      ((noCost.length || below.length || weak.length) ? '<section class="pf-alerts">' +
        (noCost.length ? '<div class="pf-alert warn"><b>' + noCost.length + ' صنف من غير سعر تكلفة</b><span>الربح بتاعهم بيطلع أكبر من الحقيقي: ' + noCost.slice(0, 4).map(function (g) { return esc(g.name); }).join('، ') + (noCost.length > 4 ? '…' : '') + ' — سجّل التكلفة من المخازن.</span></div>' : '') +
        (below.length ? '<div class="pf-alert bad"><b>بيع بأقل من التكلفة</b><span>' + below.slice(0, 4).map(function (g) { return esc(g.name) + ' (' + g.below + ' مرة)'; }).join('، ') + ' — راجع أسعار المراكز دي.</span></div>' : '') +
        (weak.length ? '<div class="pf-alert"><b>مراكز هامشها أقل من 10%</b><span>' + weak.slice(0, 5).map(function (g) { return esc(g.name) + ' ' + pct(g.margin); }).join('، ') + '</span></div>' : '') +
      '</section>' : '') +
      '<section class="pf-card"><header><div class="ax-seg">' + [['centers', 'المراكز'], ['products', 'الأصناف']].map(function (o) {
          return '<button class="' + (ui.tab === o[0] ? 'on' : '') + '" onclick="AXProfit.tab(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<span>' + list.length + (ui.tab === 'centers' ? ' مركز' : ' صنف') + '</span></header>' +
        (list.length ? '<div class="pf-tbl-w"><table class="pf-tbl"><thead><tr><th>' + (ui.tab === 'centers' ? 'المركز' : 'الصنف') + '</th><th>المبيعات</th><th>التكلفة</th><th>الربح</th><th>الهامش</th></tr></thead><tbody>' +
          list.map(function (g) {
            var w = Math.max(2, Math.abs(g.profit) / maxP * 100);
            return '<tr><td><b>' + esc(g.name) + '</b>' + (ui.tab === 'products' ? '<small>' + num(g.qty) + ' اتباع</small>' : '<small>' + g.n + ' عملية</small>') + '</td>' +
              '<td class="n">' + money(g.rev) + '</td><td class="n mut">' + money(g.cost) + '</td>' +
              '<td class="n"><b class="' + (g.profit < 0 ? 'neg' : '') + '">' + money(g.profit) + '</b><span class="pf-b"><i class="' + (g.profit < 0 ? 'neg' : '') + '" style="width:' + w.toFixed(1) + '%"></i></span></td>' +
              '<td class="n"><em class="pf-m ' + (g.noCost ? 'na' : g.margin < 10 ? 'lo' : g.margin < 25 ? 'mid' : 'hi') + '">' + (g.noCost ? 'تكلفة؟' : pct(g.margin)) + '</em></td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<div class="skh-empty sm"><span>مفيش مبيعات في الفترة دي</span></div>') +
      '</section>' +
      '<p class="pf-note">التكلفة محسوبة بسعر التكلفة الحالي لكل صنف. الفواتير اللي طالعة من صرف متحسبتش مرتين، والضريبة مش داخلة في المبيعات.</p>';

    /* 12-month trend */
    if (window.AXChart) {
      var t = new Date(), labels = [], gpv = [], revv = [], costv = [];
      for (var i = 11; i >= 0; i--) {
        var d = new Date(t.getFullYear(), t.getMonth() - i, 1), key = lds(d).slice(0, 7);
        var ml = all.filter(function (l) { return l.date.slice(0, 7) === key; });
        var mr = ml.reduce(function (s, l) { return s + l.rev; }, 0), mc = ml.reduce(function (s, l) { return s + l.cost; }, 0);
        labels.push(MONTHS[d.getMonth()].slice(0, 3)); gpv.push(Math.round(mr - mc)); revv.push(mr); costv.push(mc);
      }
      AXChart.line(document.getElementById('pf-chart'), {
        labels: labels, height: 220, diverging: true, title: 'الربح الإجمالي شهر بشهر',
        fmt: function (v) { return num(v); },
        series: [{ name: 'الربح', values: gpv }],
        detail: function (i) { return [['المبيعات', money(revv[i]), null], ['التكلفة', money(costv[i]), null], ['الهامش', revv[i] ? pct((revv[i] - costv[i]) / revv[i] * 100) : '—', null]]; }
      });
    }
  }

  window.renderProfit = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="pf" id="pf-root"></div>';
    render();
  };
  window.AXProfit = {
    render: window.renderProfit, lines: lines,
    period: function (p) { ui.p = p; render(); }, tab: function (t) { ui.tab = t; render(); },
    custom: function (f, t) { if (f) ui.from = f; if (t) ui.to = t; render(); }
  };
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · «الفلوس» — the money engine (4.38). Pure numbers, no screen.
   ------------------------------------------------------------------
   Every pound that enters or leaves the branch is one FLOW:
     + تحصيل من العملاء (payments; a bounced cheque is a minus)
     + تحويل بنكي من عميل متسجل في «التحويلات البنكية» ومش متسجل كتحصيل
     − مصروفات (expenses that are not purchase invoices; one paid from a
       cash custody is not from the cash box — the custody handout was)
     − سداد موردين (supplier payments; a bounced cheque to a supplier is a plus)
     ± فلوس بين الفروع (_cashMoves) · − رد فلوس مرتجع مبيعات · + فلوس ردّها مورد
     − عهد نقدية اتسلمت لحد (+ اللي رجع منها) · − سداد مديونيات/قروض
     − سحب/تحويل بنكي خارج · − اللي اتحوّل للمالك (_ownerDraws)
   Each flow sits in a POCKET: «خزنة» (cash) or «بنك» (transfer, deposit,
   cheque, wallet…) from its payment method.
   · The cash box is checked by blind daily counts (_cashCounts): every count
     is compared with the count before it (or the opening balance) + the cash
     flows in between → عجز / زيادة for that day, exactly.
   · «الربح راح فين؟»: from the net profit of «أرباحي» to the change in money,
     line by line — the lines add up EXACTLY (algebra, not estimates).
   · «تقدر تسحب»: min(cash after the reserve and the supplier dues of the
     next 30 days, the profit not drawn yet).
   UMD: the browser (window.AXCash) and the tests use the same code.
════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AXCash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function N(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(v) { return Math.round(N(v) * 100) / 100; }
  function day(s) { return String(s || '').slice(0, 10); }
  function A(d, k) { return d && Array.isArray(d[k]) ? d[k] : []; }
  function S(d, k) { var s = d && d.settings; return s && Array.isArray(s[k]) ? s[k] : []; }
  function pd(s) { var p = day(s).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function ds(x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  function addDays(s, n) { var x = pd(s); x.setDate(x.getDate() + n); return ds(x); }
  function dayOfTs(ts) { var x = new Date(N(ts)); return isNaN(x) || !ts ? '' : ds(x); }

  /* where the money is: «بنك» for transfer / deposit / cheque / wallet / card, else «خزنة» */
  var BANK = /(transfer|تحويل|إيداع|ايداع|bank|بنك|check|cheque|شيك|instapay|انستا|إنستا|محفظ|wallet|فودافون|vodafone|visa|فيزا|card|كارت|بطاقة)/i;
  function pocket(m) { return BANK.test(String(m || '')) ? 'bank' : 'cash'; }

  /* the settings of the money section (per branch) */
  function cfgOf(d) {
    var c = (d && d.settings && d.settings._cashCfg) || {};
    return { on: !!c.on, receipt: N(c.receipt), approve: N(c.approve), reserve: N(c.reserve),
      opening: c.opening && c.opening.date ? { date: day(c.opening.date), amount: N(c.opening.amount) } : null, since: day(c.since || (c.opening && c.opening.date) || '') };
  }

  /* who recorded a record: its own stamp, else the audit log */
  function whoMap(d) {
    var m = {};
    A(d, 'auditLog').forEach(function (e) { if (e && e.operation === 'add' && e.recordId) m[e.table + '|' + e.recordId] = e.userName || ''; });
    return function (table, r) { return (r && r.by && (r.by.name || r.by)) || m[table + '|' + (r && r.id)] || ''; };
  }

  /* ── every flow of money, ever (signed: + in, − out) ── */
  function flows(d) {
    var who = whoMap(d), out = [];
    function f(o) { o.amt = r2(o.amt); if (o.amt) out.push(o); }
    /* collections */
    var pays = A(d, 'payments').filter(Boolean);
    pays.forEach(function (p) {
      var a = N(p.amount);
      f({ id: 'p:' + p.id, date: day(p.date), amt: a, pocket: pocket(p.method), kind: a >= 0 ? 'collect' : 'bounce', party: p.customerName || p.customerId || '',
        label: a >= 0 ? 'تحصيل' + (p.method ? ' · ' + p.method : '') : 'ارتداد ' + (p.note || 'شيك'), by: who('payments', p), at: N(p.createdAt), cid: p.customerId });
    });
    /* bank transfers logged in «التحويلات البنكية»: the same money as a bank collection of the same customer & amount (±7 days) → not twice */
    var used = {};
    A(d, 'bankTransfers').filter(Boolean).forEach(function (t) {
      var a = N(t.amount), out1 = t.type === 'out' || t.type === 'withdrawal';
      if (out1) { f({ id: 'bt:' + t.id, date: day(t.date), amt: -a, pocket: 'bank', kind: 'bankout', label: 'سحب / تحويل بنكي خارج', by: who('bankTransfers', t), at: N(t.createdAt) }); return; }
      var m = pays.find(function (p) {
        return !used[p.id] && p.customerId === t.customerId && Math.abs(N(p.amount) - a) < 0.01 && pocket(p.method) === 'bank' &&
          Math.abs((pd(p.date) - pd(t.date)) / 864e5) <= 7;
      });
      if (m) { used[m.id] = 1; return; }
      f({ id: 'bt:' + t.id, date: day(t.date), amt: a, pocket: 'bank', kind: 'banktr', party: t.customerName || '', unmatched: true, cid: t.customerId,
        label: 'تحويل بنكي من عميل (مش متسجل كتحصيل)', by: who('bankTransfers', t), at: N(t.createdAt) });
    });
    /* expenses (purchase invoices are goods: paid through supplier payments) */
    A(d, 'expenses').filter(function (e) { return e && e.kind !== 'purchase'; }).forEach(function (e) {
      if (e.custodyId) return;                                         // paid from a cash custody — the handout left the box
      f({ id: 'e:' + e.id, date: day(e.date), amt: -N(e.amount), pocket: pocket(e.paymentMethod), kind: 'expense', cat: String(e.category || 'أخرى'),
        label: (e.category || 'مصروف') + (e.description ? ' — ' + String(e.description).slice(0, 60) : ''), by: who('expenses', e), at: N(e.createdAt), rec: e });
    });
    A(d, 'supplierPayments').filter(Boolean).forEach(function (p) {
      f({ id: 'sp:' + p.id, date: day(p.date), amt: -N(p.amount), pocket: pocket(p.method), kind: 'supplier', party: p.supplierName || '',
        label: 'سداد مورد' + (p.supplierName ? ' — ' + p.supplierName : ''), by: who('supplierPayments', p), at: N(p.createdAt) });
    });
    S(d, '_cashMoves').filter(Boolean).forEach(function (m) {
      f({ id: 'cm:' + m.id, date: day(m.date), amt: (m.dir === 'in' ? 1 : -1) * N(m.amount), pocket: 'cash', kind: 'branch',
        label: m.dir === 'in' ? 'فلوس جت من ' + (m.otherName || 'فرع') : 'فلوس اتحولت لـ ' + (m.otherName || 'فرع'), at: N(m.at) });
    });
    S(d, '_returns').filter(Boolean).forEach(function (r) {
      if (!N(r.refund)) return;
      f({ id: 'rt:' + r.id, date: day(r.date), amt: (r.type === 'purchase' ? 1 : -1) * N(r.refund), pocket: 'cash', kind: r.type === 'purchase' ? 'srefund' : 'refund',
        label: r.type === 'purchase' ? 'مورد رد فلوس مرتجع #' + r.number : 'رد فلوس مرتجع #' + r.number, by: (r.by && r.by.name) || '', at: N(r.at) });
    });
    S(d, '_ownerDraws').filter(Boolean).forEach(function (w) {
      f({ id: 'dr:' + w.id, date: day(w.date), amt: -N(w.amount), pocket: w.from === 'bank' ? 'bank' : 'cash', kind: 'draw', label: 'اتحوّل للمالك' + (w.note ? ' — ' + w.note : ''),
        by: (w.by && w.by.name) || '', at: N(w.at) });
    });
    S(d, '_custody').filter(function (c) { return c && c.type === 'cash'; }).forEach(function (c) {
      f({ id: 'cu:' + c.id, date: day(c.date), amt: -N(c.amount), pocket: 'cash', kind: 'custody', label: 'عهدة نقدية #' + c.no + ' مع ' + (c.holder || ''), by: c.by || '', at: N(c.createdAt) });
      (c.moves || []).forEach(function (m) {
        if (m.kind === 'add') f({ id: 'cu:' + c.id + ':' + m.id, date: day(m.date), amt: -N(m.v), pocket: 'cash', kind: 'custody', label: 'زيادة عهدة #' + c.no + ' — ' + (c.holder || ''), at: N(m.at) });
        if (m.kind === 'return') f({ id: 'cu:' + c.id + ':' + m.id, date: day(m.date), amt: N(m.v), pocket: 'cash', kind: 'custody', label: 'رد من عهدة #' + c.no + ' — ' + (c.holder || ''), at: N(m.at) });
      });
    });
    S(d, '_debts').filter(Boolean).forEach(function (db) {
      (db.payments || []).forEach(function (p) {
        if (p.expId || p.spId) return;                                   // already an expense / a supplier payment
        f({ id: 'db:' + db.id + ':' + p.id, date: day(p.date), amt: -N(p.amount), pocket: pocket(p.method), kind: 'debt', label: 'سداد مديونية — ' + (db.name || ''), at: N(p.createdAt) });
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at; });
  }

  var KINDS = {
    collect: 'تحصيل من العملاء', banktr: 'تحويلات بنكية مش متسجلة تحصيل', bounce: 'شيكات ارتدت', expense: 'مصروفات', supplier: 'سداد موردين',
    branch: 'بين الفروع', refund: 'رد فلوس مرتجعات', srefund: 'موردين ردّوا فلوس', draw: 'اتحوّل للمالك', custody: 'عهد نقدية', debt: 'سداد مديونيات', bankout: 'سحب بنكي خارج'
  };

  /* ── the cash box: every count against the one before (+ the cash flows between) ── */
  function ledger(d, all) {
    var cfg = cfgOf(d), cash = (all || flows(d)).filter(function (x) { return x.pocket === 'cash'; });
    var counts = S(d, '_cashCounts').filter(function (c) { return c && c.date; }).slice()
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : N(a.at) - N(b.at); });
    /* one count per day: the last one of the day stands */
    var byDay = {}; counts.forEach(function (c) { byDay[day(c.date)] = c; });
    counts = Object.keys(byDay).sort().map(function (k) { return byDay[k]; });
    var sumBetween = function (afterDay, uptoDay) {        // flows with afterDay < date ≤ uptoDay
      return r2(cash.reduce(function (s, x) { return x.date > afterDay && x.date <= uptoDay ? s + x.amt : s; }, 0));
    };
    var anchor = cfg.opening ? { day: addDays(cfg.opening.date, -1), value: cfg.opening.amount, kind: 'opening' } : null;
    var rows = counts.map(function (c) {
      var row = { id: c.id, date: day(c.date), total: r2(c.total), by: (c.by && c.by.name) || c.by || '', at: N(c.at), note: c.note || '', denoms: c.denoms || null };
      if (anchor && anchor.day < row.date) {
        row.flows = sumBetween(anchor.day, row.date);
        row.expected = r2(anchor.value + row.flows);
        row.diff = r2(row.total - row.expected);
        row.from = anchor.kind;
      } else { row.expected = null; row.diff = null; row.first = true; }
      anchor = { day: row.date, value: row.total, kind: 'count' };
      return row;
    });
    return { cfg: cfg, counts: rows, last: anchor, cashFlows: cash,
      /* the expected cash at the end of a day: the last anchor on/before it + the cash flows after it */
      expectedAt: function (uptoDay) {
        var a = null;
        if (cfg.opening && addDays(cfg.opening.date, -1) <= uptoDay) a = { day: addDays(cfg.opening.date, -1), value: cfg.opening.amount };
        rows.forEach(function (r) { if (r.date <= uptoDay) a = { day: r.date, value: r.total }; });
        return a ? r2(a.value + sumBetween(a.day, uptoDay)) : null;
      } };
  }

  /* ── one period: in / out by kind and pocket, the cash box, the bridge, the alerts ── */
  function report(d, from, to, opts) {
    opts = opts || {};
    var today = opts.today || ds(new Date()), all = flows(d), L = ledger(d, all), cfg = L.cfg;
    var inP = function (x) { return x.date >= from && x.date <= to; };
    var fl = all.filter(inP);
    var by = {}, tot = { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 };
    fl.forEach(function (x) {
      var k = by[x.kind] || (by[x.kind] = { kind: x.kind, label: KINDS[x.kind] || x.kind, cash: 0, bank: 0, n: 0 });
      k[x.pocket] = r2(k[x.pocket] + x.amt); k.n++;
      if (x.pocket === 'cash') { if (x.amt > 0) tot.cashIn += x.amt; else tot.cashOut -= x.amt; }
      else { if (x.amt > 0) tot.bankIn += x.amt; else tot.bankOut -= x.amt; }
    });
    Object.keys(tot).forEach(function (k) { tot[k] = r2(tot[k]); });
    var money = r2(fl.reduce(function (s, x) { return s + x.amt; }, 0));
    var cashNet = r2(tot.cashIn - tot.cashOut), bankNet = r2(tot.bankIn - tot.bankOut);

    /* the cash box in the period */
    var end = to < today ? to : today;
    var openCash = L.expectedAt(addDays(from, -1)), expectedEnd = L.expectedAt(end);
    var counts = L.counts.filter(function (c) { return c.date >= from && c.date <= to; });
    var lastCount = counts.length ? counts[counts.length - 1] : null;
    var shortage = r2(counts.reduce(function (s, c) { return s + (c.diff != null && c.diff < 0 ? c.diff : 0); }, 0));
    var excess = r2(counts.reduce(function (s, c) { return s + (c.diff != null && c.diff > 0 ? c.diff : 0); }, 0));
    var cashNow = L.expectedAt(today);                        // last count + the cash flows after it

    /* expenses by category (this period and the 3 months before) */
    var cats = {}, catsPrev = {}, prevMonths = {};
    var p3from = ds(new Date(pd(from).getFullYear(), pd(from).getMonth() - 3, 1)), p3to = addDays(from, -1);
    A(d, 'expenses').filter(function (e) { return e && e.kind !== 'purchase'; }).forEach(function (e) {
      var x = day(e.date), c = String(e.category || 'أخرى');
      if (x >= from && x <= to) cats[c] = r2((cats[c] || 0) + N(e.amount));
      else if (x >= p3from && x <= p3to) { catsPrev[c] = r2((catsPrev[c] || 0) + N(e.amount)); prevMonths[x.slice(0, 7)] = 1; }
    });
    /* the monthly average of the months before that have expenses at all (a new branch is not diluted by empty months);
       a month in progress is compared with a FULL month — only a real jump shows */
    var months3 = Math.max(1, Object.keys(prevMonths).length);
    var catList = Object.keys(cats).map(function (k) {
      var avg = Object.keys(prevMonths).length ? r2((catsPrev[k] || 0) / months3) : null;
      return { cat: k, amount: cats[k], avg: avg == null ? 0 : avg, up: avg > 0 ? (cats[k] - avg) / avg * 100 : null, fresh: avg === 0, noHist: avg == null };
    }).sort(function (a, b) { return b.amount - a.amount; });

    /* «الربح راح فين؟» — exact */
    var bridge = null;
    if (opts.profit) {
      var P = opts.profit;                                     // { rev, cost, exp, net } of «أرباحي» for the same period
      var linked = {}; A(d, 'issuances').forEach(function (i) { if (i && i.invoiceId) linked[i.invoiceId] = 1; });
      var Ssales = 0;
      A(d, 'issuances').forEach(function (i) { if (i && inP({ date: day(i.date) })) Ssales += N(i.total); });
      A(d, 'invoices').forEach(function (v) { if (v && !(v.sourceIssuanceId || v.sourceIssuance || v.fromIssuance || (v.fromIssuances && v.fromIssuances.length) || linked[v.id]) && inP({ date: day(v.date) })) Ssales += N(v.total); });
      var Rret = 0, Rpur = 0; S(d, '_returns').forEach(function (r) { if (!r || !inP({ date: day(r.date) })) return; if (r.type === 'sale') Rret += N(r.amount); else if (r.type === 'purchase') Rpur += N(r.amount); });
      var PN = -Rpur; A(d, 'expenses').forEach(function (e) { if (e && e.kind === 'purchase' && inP({ date: day(e.date) })) PN += N(e.amount); });
      var Ec = 0; A(d, 'expenses').forEach(function (e) { if (e && e.kind !== 'purchase' && e.custodyId && inP({ date: day(e.date) })) Ec += N(e.amount); });
      var sumK = function (ks) { return fl.reduce(function (s, x) { return ks.indexOf(x.kind) >= 0 ? s + x.amt : s; }, 0); };
      var C = sumK(['collect', 'bounce', 'banktr']), F = -sumK(['refund']), SR = sumK(['srefund']), SP = -sumK(['supplier']), T = sumK(['branch']),
        W = -sumK(['draw']), CU = -sumK(['custody']), DP = -sumK(['debt']), BO = -sumK(['bankout']);
      var lines = [
        { k: 'unpaid', label: 'مبيعات لسه ما اتحصّلتش', a: r2(Ssales - Rret), b: r2(C - F), v: -(Ssales - Rret - C + F) },          // a: sold · b: collected
        { k: 'tax', label: 'ضرايب وفروق فواتير', v: Ssales - Rret - N(P.rev) },
        { k: 'stock', label: 'بضاعة اشتريتها زيادة عن اللي اتباع', a: r2(PN), b: r2(P.cost), v: -(PN - N(P.cost)) },                 // a: bought · b: cost of what was sold
        { k: 'payable', label: 'مشتريات لسه ما اتدفعتش للموردين', a: r2(PN), b: r2(SP - SR), v: PN - SP + SR },                       // a: bought · b: paid
        { k: 'branch', label: 'فلوس بين الفروع (صافي)', v: T },
        { k: 'custody', label: 'عهد نقدية لسه مع الناس', v: -(CU - Ec) },
        { k: 'debt', label: 'سداد مديونيات وقروض', v: -DP },
        { k: 'bankout', label: 'سحب / تحويل بنكي خارج', v: -BO },
        { k: 'draw', label: 'اتحوّلك (مسحوبات المالك)', v: -W }
      ].map(function (l) { l.v = r2(l.v); return l; });
      var total = r2(N(P.net) + lines.reduce(function (s, l) { return s + l.v; }, 0));
      bridge = { profit: r2(P.net), lines: lines, total: total, money: money, check: r2(total - money), draws: r2(W) };
    }

    /* «تقدر تسحب» */
    var draw = null;
    if (opts.profit) {
      var base = lastCount && lastCount.date >= addDays(today, -1) ? lastCount.total + r2(all.filter(function (x) { return x.pocket === 'cash' && x.date > lastCount.date; }).reduce(function (s, x) { return s + x.amt; }, 0)) : cashNow;
      var due = N(opts.dueSoon), reserve = cfg.reserve;
      var cashAvail = base == null ? null : r2(base - reserve - due);
      var profitLeft = r2(N(opts.profit.net) - (bridge ? bridge.draws : 0));
      var can = cashAvail == null ? null : r2(Math.max(0, Math.min(cashAvail, profitLeft)));
      draw = { cash: base, reserve: reserve, due: r2(due), cashAvail: cashAvail, profitLeft: profitLeft, amount: can,
        limit: cashAvail == null ? 'nocash' : N(opts.profit.net) <= 0 ? 'loss' : profitLeft <= 0 ? 'drawn' : cashAvail <= profitLeft ? 'cash' : 'profit' };
    }

    /* ── the analysis: what looks wrong, with the money involved ── */
    var M = opts.fmt || function (v) { return String(r2(v)); }, Dt = opts.fdate || function (x) { return x; };
    var alerts = [];
    counts.forEach(function (c) {
      if (c.diff != null && c.diff <= -1) alerts.push({ lvl: 'bad', k: 'short', amount: -c.diff, date: c.date, title: 'عجز ' + M(-c.diff) + ' في تقفيل ' + Dt(c.date), detail: 'المفروض ' + M(c.expected) + ' والمعدود ' + M(c.total) + (c.by ? ' — عدّها ' + c.by : '') });
      else if (c.diff != null && c.diff >= 1) alerts.push({ lvl: 'warn', k: 'excess', amount: c.diff, date: c.date, title: 'زيادة ' + M(c.diff) + ' في تقفيل ' + Dt(c.date), detail: 'فلوس زيادة عن المتسجل — غالباً تحصيل أو بيع ما اتسجلش' + (c.by ? ' (عدّها ' + c.by + ')' : '') });
    });
    if (cfg.on) {
      var have = {}; L.counts.forEach(function (c) { have[c.date] = 1; });
      var miss = {}, start = from > cfg.since ? from : cfg.since, stop = addDays(today, -1) < to ? addDays(today, -1) : to;
      L.cashFlows.forEach(function (x) { if (x.date >= start && x.date <= stop && !have[x.date]) miss[x.date] = r2((miss[x.date] || 0) + Math.abs(x.amt)); });
      var md = Object.keys(miss);
      if (md.length) alerts.push({ lvl: 'warn', k: 'noclose', amount: md.reduce(function (s, k) { return s + miss[k]; }, 0), title: md.length + ' يوم فيهم حركة فلوس ومن غير تقفيل', detail: md.slice(-5).map(Dt).join('، ') + (md.length > 5 ? '…' : '') });
    }
    if (!cfg.opening && !L.counts.length) alerts.push({ lvl: 'info', k: 'noopen', amount: 0, title: 'مفيش رصيد بداية للخزنة', detail: 'سجّل رصيد الخزنة أو اعمل أول تقفيل عشان نقدر نحسب العجز بالظبط' });
    var exps = A(d, 'expenses').filter(function (e) { return e && e.kind !== 'purchase' && inP({ date: day(e.date) }); });
    if (cfg.receipt > 0) {
      var noRc = exps.filter(function (e) { return !e.custodyId && N(e.amount) >= cfg.receipt && !(e.attachment && e.attachment.data); });
      if (noRc.length) alerts.push({ lvl: 'bad', k: 'noreceipt', amount: noRc.reduce(function (s, e) { return s + N(e.amount); }, 0), title: noRc.length + ' مصروف فوق ' + M(cfg.receipt) + ' من غير إيصال', detail: noRc.slice(0, 4).map(function (e) { return (e.category || 'مصروف') + ' ' + M(N(e.amount)); }).join('، '), items: noRc.map(function (e) { return e.id; }) });
    }
    var late = exps.filter(function (e) { var c = dayOfTs(e.createdAt || e.srvAt); return c && c > addDays(day(e.date), 1); });   // when it was typed (an offline entry keeps its own time)
    if (late.length) alerts.push({ lvl: 'warn', k: 'late', amount: late.reduce(function (s, e) { return s + N(e.amount); }, 0), title: late.length + ' مصروف اتسجل بتاريخ قديم', detail: late.slice(0, 3).map(function (e) { return (e.category || '') + ' ' + M(N(e.amount)) + ' بتاريخ ' + Dt(day(e.date)) + ' (اتسجل ' + Dt(dayOfTs(e.createdAt || e.srvAt)) + ')'; }).join('، ') });
    var seen = {}, dup = [];
    exps.slice().sort(function (a, b) { return day(a.date) < day(b.date) ? -1 : 1; }).forEach(function (e) {
      var key = String(e.category || '') + '|' + N(e.amount), prev = seen[key];
      if (prev && Math.abs((pd(e.date) - pd(prev.date)) / 864e5) <= 7 && N(e.amount) >= 100) dup.push([prev, e]);
      seen[key] = e;
    });
    if (dup.length) alerts.push({ lvl: 'warn', k: 'dup', amount: dup.reduce(function (s, p) { return s + N(p[1].amount); }, 0), title: dup.length + ' مصروف متكرر بنفس المبلغ والنوع في أقل من أسبوع', detail: dup.slice(0, 3).map(function (p) { return (p[1].category || '') + ' ' + M(N(p[1].amount)) + ' (' + Dt(day(p[0].date)) + ' و ' + Dt(day(p[1].date)) + ')'; }).join('، ') });
    catList.forEach(function (c) { if (c.up != null && c.up >= 50 && c.amount - c.avg >= 500) alerts.push({ lvl: 'warn', k: 'spike', amount: r2(c.amount - c.avg), title: 'مصروف «' + c.cat + '» زاد ' + Math.round(c.up) + '% عن متوسطه', detail: 'الفترة دي ' + M(c.amount) + ' والمتوسط ' + M(c.avg) }); });
    var unm = fl.filter(function (x) { return x.unmatched; });
    if (unm.length) alerts.push({ lvl: 'warn', k: 'unmatched', amount: unm.reduce(function (s, x) { return s + x.amt; }, 0), title: unm.length + ' تحويل بنكي من عملاء مش متسجل كتحصيل', detail: 'الفلوس اتحسبت هنا، بس رصيد العميل ما اتخصمش: ' + unm.slice(0, 3).map(function (x) { return x.party + ' ' + M(x.amt); }).join('، ') });
    if (opts.profit && N(opts.profit.net) < 0) alerts.push({ lvl: 'bad', k: 'loss', amount: -N(opts.profit.net), title: 'الفترة دي خسرانة ' + M(-N(opts.profit.net)), detail: 'أي سحب دلوقتي بيطلع من رأس المال' });
    if (bridge && bridge.draws > Math.max(0, N(opts.profit.net)) + 1) alerts.push({ lvl: 'warn', k: 'overdraw', amount: r2(bridge.draws - Math.max(0, N(opts.profit.net))), title: 'اتحوّلك أكتر من ربح الفترة', detail: 'سحبت ' + M(bridge.draws) + ' والربح ' + M(N(opts.profit.net)) });
    var rank = { bad: 0, warn: 1, info: 2 };
    alerts.sort(function (a, b) { return rank[a.lvl] - rank[b.lvl] || b.amount - a.amount; });

    /* who recorded what (cash in / out by person) */
    var people = {};
    fl.forEach(function (x) {
      if (!x.by) return;
      var p = people[x.by] || (people[x.by] = { name: x.by, cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0, exp: 0, n: 0, counts: 0, diff: 0, lastCount: '' });
      if (x.pocket === 'cash') { if (x.amt > 0) p.cashIn += x.amt; else p.cashOut -= x.amt; } else { if (x.amt > 0) p.bankIn += x.amt; else p.bankOut -= x.amt; }
      if (x.kind === 'expense') p.exp -= x.amt;
      p.n++;
    });
    counts.forEach(function (c) {
      if (!c.by) return;
      var p = people[c.by] || (people[c.by] = { name: c.by, cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0, exp: 0, n: 0, counts: 0, diff: 0, lastCount: '' });
      p.counts++; if (c.diff != null) p.diff += c.diff; if (c.date > p.lastCount) p.lastCount = c.date;
    });
    var peopleList = Object.keys(people).map(function (k) { var p = people[k]; ['cashIn', 'cashOut', 'bankIn', 'bankOut', 'exp', 'diff'].forEach(function (f) { p[f] = r2(p[f]); }); return p; })
      .sort(function (a, b) { return (b.cashIn + b.cashOut) - (a.cashIn + a.cashOut); });

    return {
      from: from, to: to, today: today, cfg: cfg, flows: fl, byKind: by, totals: tot, money: money, cashNet: cashNet, bankNet: bankNet,
      cash: { open: openCash, expectedEnd: expectedEnd, end: end, counts: counts, lastCount: lastCount, shortage: shortage, excess: excess, now: cashNow, allCounts: L.counts },
      cats: catList, bridge: bridge, draw: draw, alerts: alerts, people: peopleList
    };
  }

  return { pocket: pocket, flows: flows, ledger: ledger, report: report, cfgOf: cfgOf, KINDS: KINDS, addDays: addDays };
});

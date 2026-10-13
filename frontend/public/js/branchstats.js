/* ════════════════════════════════════════════════════════════════════
   ERP · أرقام الفرع (4.33 · المرحلة 3) — one function, the same rules the
   screens use, so «جميع الفروع» always matches what each branch shows:
   · المبيعات = الصرف + الفواتير اللي مش طالعة من صرف (زي الرئيسية)
   · الربح = (المبيعات بعد الخصم من غير ضريبة − التكلفة) − المصروفات
     (زي صفحة الأرباح؛ فواتير الشراء مش مصروف — هي بضاعة)
   · الخزنة = التحصيل − المصروفات − سداد الموردين (زي لوحة التحكم)
   · مديونيات العملاء = أرصدة العملاء الموجبة · مستحق للموردين = رصيد
     أول المدة + المشتريات − المدفوع (زي صفحة الموردين)
   · قيمة المخزون = الكمية × سعر التكلفة
   Used by the server (/api/branches/summary) — UMD, no dependencies.
════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AXBStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function N(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function day(s) { return String(s || '').slice(0, 10); }
  function ds(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* period → [from, to] (yyyy-mm-dd, inclusive) */
  function range(p, today) {
    var t = today ? new Date(today + 'T12:00:00') : new Date(), y = t.getFullYear(), m = t.getMonth(), T = ds(t);
    if (p === 'today') return [T, T];
    if (p === 'last') return [ds(new Date(y, m - 1, 1)), ds(new Date(y, m, 0))];
    if (p === 'year') return [ds(new Date(y, 0, 1)), T];
    if (p === 'all') return ['0000-00-00', '9999-12-31'];
    return [ds(new Date(y, m, 1)), T];                              // 'month' (default)
  }

  function summary(d, r) {
    d = d || {}; r = r || range('month');
    var A = function (k) { return Array.isArray(d[k]) ? d[k] : []; };
    var inR = function (x) { x = day(x); return x >= r[0] && x <= r[1]; };

    /* sales — the home screen's rule */
    var linked = {}; A('issuances').forEach(function (i) { if (i && i.invoiceId) linked[i.invoiceId] = 1; });
    var solo = A('invoices').filter(function (v) { return v && !(v.sourceIssuanceId || v.sourceIssuance || v.fromIssuance || (v.fromIssuances && v.fromIssuances.length) || linked[v.id]); });
    var sales = 0, docs = {};
    A('issuances').forEach(function (i) { if (!i || !inR(i.date)) return; sales += N(i.total); docs['i' + (i.invoiceId || i.number || i.id)] = 1; });
    solo.forEach(function (v) { if (!inR(v.date)) return; sales += N(v.total); docs['v' + v.id] = 1; });

    /* profit — the profit page's rule */
    var prod = {}; A('products').forEach(function (p) { if (p) prod[p.id] = p; });
    var rev = 0, cost = 0;
    function line(date, pid, qty, r2) { if (!inR(date)) return; var p = prod[pid]; rev += N(r2); cost += (p ? N(p.cost) : 0) * N(qty); }
    A('issuances').forEach(function (i) {
      if (!i) return;
      if (Array.isArray(i.items) && i.items.length && !i.productId) i.items.forEach(function (it) { line(i.date, it.productId, it.qty || it.quantity, it.total != null ? it.total : N(it.qty || it.quantity) * N(it.price || it.unitPrice)); });
      else line(i.date, i.productId, i.quantity, i.total);
    });
    A('invoices').forEach(function (v) {
      if (!v || v.sourceIssuanceId) return;
      var sub = N(v.subtotal) || (v.items || []).reduce(function (s, it) { return s + N(it.total); }, 0);
      var k = sub > 0 ? Math.max(0, sub - N(v.discount)) / sub : 1;
      (v.items || []).forEach(function (it) { line(v.date, it.productId, it.qty || it.quantity, N(it.total) * k); });
    });

    var expenses = 0, purchases = 0, collections = 0, nColl = 0;
    A('expenses').forEach(function (e) { if (!e || !inR(e.date)) return; if (e.kind === 'purchase') purchases += N(e.amount); else expenses += N(e.amount); });
    A('payments').forEach(function (p) { if (!p || !inR(p.date) || N(p.amount) <= 0) return; collections += N(p.amount); nColl++; });

    /* balances (as of now) */
    var sum = function (k, f) { return A(k).reduce(function (s, x) { return s + (x ? N(x[f]) : 0); }, 0); };
    var treasury = sum('payments', 'amount') - sum('expenses', 'amount') - sum('supplierPayments', 'amount');
    var receivables = A('customers').reduce(function (s, c) { return s + Math.max(0, c ? N(c.balance) : 0); }, 0);
    var bySup = {}; A('suppliers').forEach(function (s) { if (s) bySup[s.id] = N(s.openingBalance); });
    A('expenses').forEach(function (e) { if (e && e.kind === 'purchase' && Object.prototype.hasOwnProperty.call(bySup, e.supplierId)) bySup[e.supplierId] += N(e.amount); });
    A('supplierPayments').forEach(function (p) { if (p && Object.prototype.hasOwnProperty.call(bySup, p.supplierId)) bySup[p.supplierId] -= N(p.amount); });
    var payables = Object.keys(bySup).reduce(function (s, k) { return s + Math.max(0, bySup[k]); }, 0);
    var stockValue = 0, low = 0;
    A('products').forEach(function (p) { if (!p) return; stockValue += Math.max(0, N(p.quantity)) * N(p.cost); if (N(p.minQuantity) > 0 && N(p.quantity) <= N(p.minQuantity)) low++; });

    var gross = rev - cost;
    return {
      from: r[0], to: r[1],
      sales: sales, salesDocs: Object.keys(docs).length,
      revenue: rev, cost: cost, gross: gross, expenses: expenses, profit: gross - expenses,
      purchases: purchases, collections: collections, collectionsCount: nColl,
      treasury: treasury, receivables: receivables, payables: payables,
      stockValue: stockValue, products: A('products').length, lowStock: low,
      customers: A('customers').length, suppliers: A('suppliers').length
    };
  }

  var SUM_KEYS = ['sales', 'salesDocs', 'revenue', 'cost', 'gross', 'expenses', 'profit', 'purchases', 'collections', 'collectionsCount', 'treasury', 'receivables', 'payables', 'stockValue', 'products', 'lowStock', 'customers', 'suppliers'];
  function total(list) {
    var t = {}; SUM_KEYS.forEach(function (k) { t[k] = 0; });
    (list || []).forEach(function (x) { SUM_KEYS.forEach(function (k) { t[k] += N(x[k]); }); });
    return t;
  }
  return { summary: summary, range: range, total: total, SUM_KEYS: SUM_KEYS };
});

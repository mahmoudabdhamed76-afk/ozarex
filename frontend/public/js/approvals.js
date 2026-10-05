/* ════════════════════════════════════════════════════════════════════
   ERP · طلبات الموافقة — maker / checker approvals
   ------------------------------------------------------------------
   · Any user who is not the admin (محاسب، مبيعات…) can still do every
     normal day-to-day operation (new invoice, issuance, collection,
     expense, purchase…). But a SENSITIVE change does not hit the data:
       – deleting an invoice / issuance / collection / expense / purchase /
         supplier payment / bank transfer / customer / supplier / item
       – editing any of those money records
       – editing a customer or supplier balance (رصيد، رصيد افتتاحي، حد ائتمان)
       – changing stock quantities without a real movement (and approving a
         stock count)
       – deleting a debt or changing what is owed in «سداد المديونية»
     Instead the change is captured, the data is put back exactly as it was,
     and the user gets a «تقديم طلب للمدير» sheet with a required reason.
   · The admin sees the request in «طلبات الموافقة»: موافقة → the captured
     change is applied automatically (balances and quantities by their
     difference, so anything that happened since is kept), or رفض with a
     reason that goes back to the requester.
   · The guard sits on DB.save(): it compares the data against a snapshot
     taken before the user's action, so every screen is covered without
     touching each delete / edit function.
   Stored in settings._approvals.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof DB === 'undefined' || !DB || typeof DB.save !== 'function' || DB.save._apr) return;
  var X = window.AXCore;
  if (!X) { console.error('[approvals] js/axcore.js is missing'); return; }

  var FIN = X.FIN;
  var ORDER = FIN.concat(['customers', 'suppliers', 'products', 'stockMoves']);
  var SNAP = { skip: { auditLog: 1 }, skipSet: { _approvals: 1 } };
  var BAL = X.BAL;
  var BAL_L = { balance: 'رصيد ', openingBalance: 'الرصيد الافتتاحي لـ', creditLimit: 'حد ائتمان ' };
  var same = X.same, clone = X.clone, blank = X.blank, isNum = X.isNum, keyOf = X.keyOf, idx = X.idx,
    fieldsChanged = X.fieldsChanged, realField = X.realField;
  var NAMES = {
    invoices: ['فاتورة', 'فواتير'], issuances: ['صرف', 'عمليات صرف'], payments: ['تحصيل', 'تحصيلات'], expenses: ['مصروف', 'مصروفات'],
    supplierPayments: ['سداد مورد', 'سدادات موردين'], bankTransfers: ['تحويل بنكي', 'تحويلات بنكية'], customers: ['عميل', 'عملاء'],
    suppliers: ['مورد', 'موردين'], products: ['صنف', 'أصناف'], stockMoves: ['حركة مخزن', 'حركات مخزن'], employees: ['موظف', 'موظفين'],
    notes: ['ملاحظة', 'ملاحظات'], salaryRuns: ['مسير رواتب', 'مسيرات رواتب'], users: ['مستخدم', 'مستخدمين'],
    _custody: ['عهدة', 'عهد'], _debts: ['مديونية', 'مديونيات'], _stockCounts: ['جرد', 'عمليات جرد'], _cheques: ['شيك', 'شيكات']
  };
  var FL = { items: 'الأصناف', customPrices: 'الأسعار الخاصة', invoiceId: 'الفاتورة', lines: 'سطور الجرد', payments: 'الدفعات',
    result: 'نتيجة الجرد', finishedAt: 'وقت الاعتماد', creditLimit: 'حد الائتمان', note: 'ملاحظة', depositor: 'المودِع',
    bankAccount: 'الحساب البنكي', kind: 'النوع', rate: 'الفايدة', minPay: 'أقل قسط', due: 'الميعاد', holder: 'مع', moves: 'الحركات' };
  var ST = { paid: 'مدفوعة', partial: 'مدفوعة جزئياً', unpaid: 'مش مدفوعة', draft: 'مسودة', done: 'اتعمد', open: 'مفتوحة', closed: 'اتقفلت',
    pending: 'مستني', approved: 'اتنفذ', rejected: 'مرفوض' };
  var KIND = {
    delete: { l: 'حذف', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>' },
    edit: { l: 'تعديل', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>' },
    balance: { l: 'رصيد', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0zM8 21h8"/></svg>' },
    stock: { l: 'مخزن', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>' },
    debt: { l: 'مديونية', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>' }
  };
  var ICON = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>'
  };

  /* ── small helpers ── */
  function D() { return DB.data || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function list() { var s = S(); if (!Array.isArray(s._approvals)) s._approvals = []; return s._approvals; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(Number(n || 0)); } catch (e) {} return num(n); }
  function user() { return (typeof currentUser !== 'undefined' && currentUser) || null; }
  function role() { var u = user(); return (u && u.role) || ''; }
  function isAdmin() { return role() === 'admin'; }
  function me() { var u = user(); return (u && u.name) || ''; }
  function newId() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, String(v)); } catch (e) { return null; } }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, String(v)); } catch (e) { return null; } }
  function custName(id) { var c = A('customers').find(function (x) { return x.id === id; }); return c ? c.name : ''; }
  function supName(id) { var s = A('suppliers').find(function (x) { return x.id === id; }); return s ? s.name : ''; }
  function roleName(r) { try { if (typeof ROLE_LABELS !== 'undefined' && ROLE_LABELS[r]) return ROLE_LABELS[r]; } catch (e) {} return r || ''; }
  function fl(f) {
    if (FL[f]) return FL[f];
    try { if (typeof AUDIT_FIELD_LABELS !== 'undefined' && AUDIT_FIELD_LABELS[f]) return AUDIT_FIELD_LABELS[f]; } catch (e) {}
    return f;
  }
  function fv(f, v) {
    if (blank(v)) return '—';
    if (f === 'customerId') return custName(v) || String(v);
    if (f === 'supplierId') return supName(v) || String(v);
    if (f === 'status') return ST[v] || String(v);
    if (isNum(v)) return num(v);
    if (typeof v === 'boolean') return v ? 'آه' : 'لأ';
    if (Array.isArray(v)) return v.length + ' بند';
    if (typeof v === 'object') return Object.keys(v).length + ' قيمة';
    var s = String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
  function dmy(ts) { var d = new Date(ts); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }
  function hm(ts) { var d = new Date(ts), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' ص' : ' م'); }
  function ago(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return 'دلوقتي';
    var m = Math.round(s / 60); if (m < 60) return 'من ' + (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m + (m <= 10 ? ' دقايق' : ' دقيقة'));
    var h = Math.round(m / 60); if (h < 24) return 'من ' + (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h + (h <= 10 ? ' ساعات' : ' ساعة'));
    var d = Math.round(h / 24); if (d < 7) return 'من ' + (d === 1 ? 'يوم' : d === 2 ? 'يومين' : d + ' أيام');
    return dmy(ts);
  }
  function unit(v, one, few) { return v >= 3 && v <= 10 ? few : one; }
  function dur(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return { v: m, u: unit(m, 'دقيقة', 'دقايق') };
    var h = Math.round(m / 60); if (h < 48) return { v: h, u: unit(h, 'ساعة', 'ساعات') };
    var d = Math.round(h / 24); return { v: d, u: unit(d, 'يوم', 'أيام') };
  }

  /* Original functions (the wrappers below suppress them while a captured
     action finishes, but our own messages must always get through). */
  var ORIG = {};
  function T(msg, type, ms) { var f = ORIG.toast || window.toast; if (typeof f === 'function') f(msg, type || 'success', ms); }

  /* ════════ 1 · snapshot + diff ════════ */
  var base = null, lastAct = 0, held = null, pending = null, applying = false;

  function topId() { var a = D().auditLog; return Array.isArray(a) && a.length ? a[0].id : null; }
  function snapNow() { var b = X.snapshot(D(), SNAP); b.top = topId(); return b; }
  function snap() { try { base = snapNow(); } catch (e) { base = null; } }
  function computeDiff() { var r = X.diff(base, D(), SNAP); r.cur.top = topId(); return r; }

  /* ════════ 2 · what needs the admin — roles + rules (js/axcore.js) ════════ */
  var ADMIN_ONLY = X.ADMIN_ONLY_PAGES, ALWAYS = ['dashboard', 'approvals'];
  /* the admin sets, per user in «المستخدمين», what needs approval (js/axcore.js levelOf) */
  function freshUser() { var u = user(); if (!u) return null; return A('users').find(function (x) { return x.id === u.id; }) || u; }
  function levelFor() { return X.levelOf(S(), freshUser()); }
  function classify(df) { return X.classify(df, levelFor() || 'sensitive', { closedUntil: S().closedUntil || '' }); }

  /* ════════ 3 · human words for a change ════════ */
  function shortLab(k, r) {
    r = r || {};
    switch (k) {
      case 'invoices': return 'فاتورة #' + (r.number || '?');
      case 'issuances': return 'صرف #' + (r.number || '?');
      case 'payments': return 'تحصيل ' + money(r.amount);
      case 'expenses': return r.kind === 'purchase' ? 'فاتورة شراء' + (r.number ? ' #' + r.number : '') : 'مصروف ' + (r.category ? '«' + r.category + '» ' : '') + money(r.amount);
      case 'supplierPayments': return 'سداد مورد ' + money(r.amount);
      case 'bankTransfers': return 'تحويل بنكي ' + money(r.amount);
      case 'customers': return 'العميل «' + (r.name || '') + '»';
      case 'suppliers': return 'المورد «' + (r.name || '') + '»';
      case 'products': return 'الصنف «' + (r.name || '') + '»';
      case 'stockMoves': return 'حركة مخزن' + (r.note ? ' «' + r.note + '»' : '');
      case '_debts': return 'مديونية «' + (r.name || '') + '»';
      case '_stockCounts': return 'جرد #' + (r.no || '?');
      case '_custody': return 'عهدة #' + (r.no || '?');
      default: return (NAMES[k] ? NAMES[k][0] : k) + (r.name ? ' «' + r.name + '»' : r.number ? ' #' + r.number : '');
    }
  }
  function party(k, r) {
    r = r || {};
    if (k === 'invoices' || k === 'issuances' || k === 'payments' || k === 'bankTransfers') return r.customerName || custName(r.customerId);
    if (k === 'expenses') return r.kind === 'purchase' ? (r.supplierName || supName(r.supplierId)) : (r.description && r.description !== r.category ? r.description : '');
    if (k === 'supplierPayments') return r.supplierName || supName(r.supplierId);
    return '';
  }
  function lab(k, r) {
    var s = shortLab(k, r), p = party(k, r);
    if (p) s += ' — ' + p;
    if ((k === 'invoices' || k === 'issuances') && r && r.total != null) s += ' · ' + money(r.total);
    if (k === 'expenses' && r && r.kind === 'purchase' && r.amount != null) s += ' · ' + money(r.amount);
    return s;
  }
  function chg(f, b, a) { return fl(f) + ' من ' + fv(f, b) + ' إلى ' + fv(f, a); }

  function describe(df) {
    var lines = [], rows = [];
    function addRow(rec, f, b, a) { if (rows.length < 80) rows.push([rec, fl(f), fv(f, b), fv(f, a)]); }
    function walk(k, cd) {
      if (!cd) return;
      if (k === 'stockMoves') {
        if (cd.removed.length) lines.push({ t: 'rm', s: cd.removed.length === 1 ? 'حذف ' + shortLab(k, cd.removed[0]) : 'حذف ' + cd.removed.length + ' حركات مخزن مرتبطة' });
        if (cd.added.length) lines.push({ t: 'add', s: 'تسجيل ' + (cd.added.length === 1 ? shortLab(k, cd.added[0]) : cd.added.length + ' حركات مخزن') });
        if (cd.modified.length) lines.push({ t: 'mod', s: 'تعديل ' + cd.modified.length + ' حركة مخزن' });
        return;
      }
      cd.removed.forEach(function (r) { lines.push({ t: 'rm', s: 'حذف ' + lab(k, r) }); rows.push([shortLab(k, r), 'السجل كله', 'موجود', 'هيتحذف']); });
      cd.modified.forEach(function (x) {
        var rf = x.f.filter(realField); if (!rf.length) return;
        var name = shortLab(k, x.rb);
        rf.forEach(function (f) { addRow(name, f, x.b[f], x.a[f]); });
        if (k === 'customers' || k === 'suppliers') {
          var bal = rf.filter(function (f) { return BAL.indexOf(f) >= 0; }), rest = rf.filter(function (f) { return BAL.indexOf(f) < 0; });
          bal.forEach(function (f) { lines.push({ t: 'bal', s: BAL_L[f] + name + ': من ' + fv(f, x.b[f]) + ' إلى ' + fv(f, x.a[f]) }); });
          if (rest.length) lines.push({ t: 'mod', s: 'تعديل بيانات ' + name + ': ' + rest.slice(0, 3).map(fl).join('، ') });
        } else if (k === 'products') {
          if (rf.indexOf('quantity') >= 0) lines.push({ t: 'qty', s: 'كمية ' + name + ': من ' + fv('quantity', x.b.quantity) + ' إلى ' + fv('quantity', x.a.quantity) });
          var o = rf.filter(function (f) { return f !== 'quantity'; });
          if (o.length) lines.push({ t: 'mod', s: 'تعديل ' + name + ': ' + o.slice(0, 3).map(fl).join('، ') });
        } else if (k === '_stockCounts' && x.a.status === 'done') {
          lines.push({ t: 'qty', s: 'اعتماد ' + name + ' وتسوية أرصدة الأصناف' });
        } else if (k === '_debts') {
          if (rf.indexOf('amount') >= 0) lines.push({ t: 'debt', s: 'المبلغ المدين بيه لـ ' + name + ': من ' + fv('amount', x.b.amount) + ' إلى ' + fv('amount', x.a.amount) });
          if (rf.indexOf('payments') >= 0) lines.push({ t: 'debt', s: 'دفعات ' + name + ': من ' + (x.b.payments || []).length + ' إلى ' + (x.a.payments || []).length });
          var od = rf.filter(function (f) { return f !== 'amount' && f !== 'payments'; });
          if (od.length) lines.push({ t: 'mod', s: 'تعديل ' + name + ': ' + od.slice(0, 3).map(fl).join('، ') });
        } else {
          lines.push({ t: 'mod', s: 'تعديل ' + lab(k, x.rb) + ': ' + rf.slice(0, 3).map(function (f) { return chg(f, x.b[f], x.a[f]); }).join('، ') + (rf.length > 3 ? ' (+' + (rf.length - 3) + ')' : '') });
        }
      });
      cd.added.forEach(function (r) { lines.push({ t: 'add', s: 'إضافة ' + lab(k, r) }); });
    }
    ORDER.forEach(function (k) { walk(k, df.cols[k]); });
    Object.keys(df.cols).forEach(function (k) { if (ORDER.indexOf(k) < 0) walk(k, df.cols[k]); });
    Object.keys(df.sets).forEach(function (k) { walk(k, df.sets[k]); });
    Object.keys(df.keys).forEach(function (k) {
      if (X.EDIT_KEYS[k]) { lines.push({ t: 'mod', s: X.EDIT_KEYS[k] + ': من ' + fv(k, df.keys[k].b) + ' إلى ' + fv(k, df.keys[k].a) }); rows.push([X.EDIT_KEYS[k], 'القيمة', fv(k, df.keys[k].b), fv(k, df.keys[k].a)]); }
    });
    return { lines: lines, rows: rows };
  }

  function titleOf(why, df, audit) {
    /* the screen's own audit entry tells which record the user meant
       (deleting an issuance also removes its invoice — the title should
       still say «حذف صرف #…») */
    var hint = (audit || []).find(function (a) { return a && df.cols[a.table] && (a.operation === 'delete' || a.operation === 'edit'); });
    if (hint) {
      var hc = df.cols[hint.table], hk = 'i:' + hint.recordId;
      if (hint.operation === 'delete') {
        var hr = hc.removed.find(function (r) { return keyOf(r) === hk; });
        if (hr) return { title: 'حذف ' + shortLab(hint.table, hr), kind: 'delete', table: hint.table };
      } else {
        var hm = hc.modified.find(function (x) { return x.k === hk && x.f.some(realField); });
        if (hm && why.some(function (w) { return w.k === hint.table; })) {
          var balOnly = hm.f.filter(realField).every(function (f) { return BAL.indexOf(f) >= 0; });
          return { title: (balOnly ? 'تعديل رصيد ' : 'تعديل ') + shortLab(hint.table, hm.rb), kind: balOnly ? 'balance' : 'edit', table: hint.table };
        }
      }
    }
    var w = why[0], cd = df.cols[w.k] || df.sets[w.k] || { added: [], removed: [], modified: [] }, kind = 'edit', title = '';
    if (w.t === 'closed') {
      var cr = cd.removed[0], cm = cd.modified.find(function (x) { return x.f.some(realField); }), ca = cd.added[0];
      kind = cr ? 'delete' : 'edit';
      title = (cr ? 'حذف ' + shortLab(w.k, cr) : cm ? 'تعديل ' + shortLab(w.k, cm.rb) : ca ? 'إضافة ' + shortLab(w.k, ca) : 'تعديل') + ' في فترة مقفولة';
    } else if (w.t === 'ed') {
      if (w.key) title = 'تعديل ' + (X.EDIT_KEYS[w.k] || w.k);
      else {
        var me2 = cd.modified.filter(function (x) { return x.f.some(realField); });
        title = me2.length === 1 ? 'تعديل ' + shortLab(w.k, me2[0].rb) : 'تعديل ' + me2.length + ' ' + (NAMES[w.k] ? NAMES[w.k][1] : w.k);
      }
    } else if (w.t === 'rm') {
      kind = 'delete';
      var real = cd.removed;
      title = real.length === 1 ? 'حذف ' + shortLab(w.k, real[0]) : 'حذف ' + real.length + ' ' + (NAMES[w.k] ? NAMES[w.k][1] : w.k);
    } else if (w.t === 'mod') {
      var m = cd.modified.filter(function (x) { return x.f.some(realField); });
      title = m.length === 1 ? 'تعديل ' + shortLab(w.k, m[0].rb) : 'تعديل ' + m.length + ' ' + NAMES[w.k][1];
    } else if (w.t === 'bal') {
      kind = 'balance';
      var b = cd.modified.filter(function (x) { return x.f.some(function (f) { return BAL.indexOf(f) >= 0; }); });
      title = b.length === 1 ? 'تعديل رصيد ' + shortLab(w.k, b[0].rb) : 'تعديل أرصدة ' + b.length + ' ' + NAMES[w.k][1];
    } else if (w.t === 'qty') {
      kind = 'stock';
      var sc = df.sets._stockCounts && df.sets._stockCounts.modified.find(function (x) { return x.a.status === 'done'; });
      var q = cd.modified.filter(function (x) { return x.f.indexOf('quantity') >= 0; });
      title = sc ? 'اعتماد ' + shortLab('_stockCounts', sc.rb) + ' (' + q.length + ' صنف)' : q.length === 1 ? 'تعديل كمية ' + shortLab('products', q[0].rb) : 'تعديل كميات ' + q.length + ' أصناف';
    } else if (w.t === 'debt') {
      kind = 'debt';
      title = cd.removed.length ? 'حذف ' + shortLab('_debts', cd.removed[0]) : 'تعديل ' + shortLab('_debts', (cd.modified[0] || {}).rb);
    }
    return { title: title, kind: kind, table: w.k.charAt(0) === '_' ? 'settings' : w.k };
  }

  /* what gets stored with the request: only the changed fields of a modified
     record (+ a label), full records for added / removed ones */
  function slim(df) {
    function s(k, cd) {
      return { added: cd.added, removed: cd.removed, modified: cd.modified.map(function (x) { return { k: x.k, f: x.f, b: x.b, a: x.a, lab: shortLab(k, x.rb) }; }) };
    }
    var out = { cols: {}, sets: {}, keys: df.keys, counters: df.counters };
    Object.keys(df.cols).forEach(function (k) { out.cols[k] = s(k, df.cols[k]); });
    Object.keys(df.sets).forEach(function (k) { out.sets[k] = s(k, df.sets[k]); });
    return clone(out);
  }

  /* the same change asked twice (e.g. pressing «اعتماد» again on a count
     that is already waiting) must not become two requests — two approvals
     would apply the difference twice */
  function sigOf(df) {
    function part(cd) {
      if (!cd) return null;
      return [cd.removed.map(keyOf).sort(), cd.modified.map(function (x) {
        var f = x.f.filter(function (k) { return realField(k) && !/(At|Ts)$/.test(k); }).sort();
        return [x.k, f, f.map(function (k) { return x.a[k]; })];
      }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }), cd.added.length];
    }
    var o = {};
    Object.keys(df.cols).sort().forEach(function (k) { o['c:' + k] = part(df.cols[k]); });
    Object.keys(df.sets).sort().forEach(function (k) { o['s:' + k] = part(df.sets[k]); });
    Object.keys(df.keys).sort().forEach(function (k) { o['k:' + k] = df.keys[k].a; });
    var str2 = JSON.stringify(o), h = 0;
    for (var i = 0; i < str2.length; i++) { h = ((h << 5) - h + str2.charCodeAt(i)) | 0; }
    return h.toString(36) + ':' + str2.length;
  }

  /* ════════ 4 · put the data back + collect what the screen logged ════════ */
  function pullAudit() {
    var a = D().auditLog; if (!Array.isArray(a) || !a.length) return [];
    var i = base.top ? a.findIndex(function (e) { return e.id === base.top; }) : a.length;
    if (i <= 0 || i > 50) return [];
    return a.splice(0, i).reverse().map(pick);
  }
  function pick(o) {
    o = o || {};
    return clone({ operation: o.operation, table: o.table, recordId: o.recordId || null, recordLabel: o.recordLabel || '', before: o.before || null, after: o.after || null, reason: o.reason || '' });
  }
  function restore(df) {
    var d = D();
    Object.keys(df.cols).forEach(function (k) { d[k] = JSON.parse(base.cols[k] || '[]'); });
    var st = d.settings || (d.settings = {});
    Object.keys(df.sets).concat(Object.keys(df.keys)).forEach(function (k) {
      if (base.set[k] === undefined) delete st[k]; else st[k] = JSON.parse(base.set[k]);
    });
    if (df.counters) d.counters = JSON.parse(base.counters);
    return pullAudit();
  }
  function mergeDiff(into, df) {
    function m(dst, src) {
      ['added', 'removed'].forEach(function (p) {
        var have = {}; dst[p].forEach(function (r) { have[keyOf(r)] = 1; });
        src[p].forEach(function (r) { if (!have[keyOf(r)]) dst[p].push(r); });
      });
      src.modified.forEach(function (x) {
        var i = dst.modified.findIndex(function (y) { return y.k === x.k; });
        if (i < 0) dst.modified.push(x); else dst.modified[i] = x;
      });
    }
    Object.keys(df.cols).forEach(function (k) { if (into.cols[k]) m(into.cols[k], df.cols[k]); else into.cols[k] = df.cols[k]; });
    Object.keys(df.sets).forEach(function (k) { if (into.sets[k]) m(into.sets[k], df.sets[k]); else into.sets[k] = df.sets[k]; });
    Object.keys(df.keys).forEach(function (k) { into.keys[k] = df.keys[k]; });
    if (df.counters) into.counters = df.counters;
  }

  /* ════════ 5 · the guard on DB.save ════════ */
  /* 'full'         a non-admin: requests to the admin
     'closed-only'  a non-admin while approvals are off: the closed period still counts
     'admin-closed' the admin while a period is closed: a confirmation sheet */
  function guardMode() {
    var r = role();
    if (!r || applying || window.__axNoGuard) return null;
    var closed = !!S().closedUntil;
    if (r === 'admin') return closed ? 'admin-closed' : null;
    if (S().approvalsOff || !levelFor()) return closed ? 'closed-only' : null;
    return 'full';
  }
  function guardOn() { return !!guardMode(); }
  function classifyFor(df) {
    var m = guardMode();
    if (m === 'full') return classify(df);
    if (!m) return null;
    var w = (X.classify(df, 'sensitive', { closedUntil: S().closedUntil || '' }) || []).filter(function (x) { return x.t === 'closed'; });
    return w.length ? w : null;
  }
  function quiet() { return !!(held && Date.now() < held.until); }

  var origSave = DB.save;
  function rawSave() { return origSave.apply(DB, arguments); }
  var guardedSave = function () {
    if (!guardOn()) return rawSave.apply(null, arguments);
    if (!base) { var r0 = rawSave.apply(null, arguments); snap(); return r0; }
    var res;
    try { res = computeDiff(); } catch (e) { console.warn('[approvals] diff failed', e); return rawSave.apply(null, arguments); }
    var df = res.df;
    if (quiet() && held.req === pending) {
      if (df.n) { mergeDiff(held.df, df); held.req.audit = held.req.audit.concat(restore(df)); finishReq(held.req, held.df); }
      return true;
    }
    var why = df.n ? classifyFor(df) : null;
    if (!why || Date.now() - lastAct > 8000) {
      var r = rawSave.apply(null, arguments);
      base = res.cur;
      return r;
    }
    var req = { id: 'apr_' + newId(), status: 'draft', by: { id: (user() || {}).id, name: me(), role: role() }, page: (typeof currentPage !== 'undefined' ? currentPage : ''), audit: [] };
    req.why = why;
    req.adminConfirm = guardMode() === 'admin-closed';
    req.audit = restore(df);
    held = { req: req, df: df, until: Date.now() + 900 };
    pending = req;
    finishReq(req, df);
    setTimeout(function () { ask(req); }, 180);
    setTimeout(function () {
      if (pending !== req || document.getElementById('apr-ask')) return;
      var ov = document.getElementById('modal-overlay');
      if (!req._asked || (ov && ov.classList.contains('show'))) ask(req);
    }, 950);
    return true;
  };
  guardedSave._apr = 1;
  DB.save = guardedSave;

  function finishReq(req, df) {
    var why = classifyFor(df) || req.why || [{ t: 'mod', k: Object.keys(df.cols)[0] || 'invoices' }];
    var t = titleOf(why, df, req.audit), d = describe(df);
    req.title = t.title; req.kind = t.kind; req.table = t.table;
    req.lines = d.lines; req.rows = d.rows;
    req.diff = slim(df);
    req.sig = sigOf(df);
  }

  /* Track the user's actions: a snapshot right before each action (only when
     no sheet is open, so everything done inside a form/confirm is captured). */
  function overlayOpen() {
    var ov = document.getElementById('modal-overlay');
    return !!(ov && ov.classList.contains('show')) || !!document.querySelector('.notify-overlay.show');
  }
  document.addEventListener('pointerdown', function (e) {
    if (!guardOn()) return;
    lastAct = Date.now();
    if (quiet() || overlayOpen()) return;
    var t = e.target && e.target.closest ? e.target.closest('button,.btn,[onclick],a,[role="button"],label,summary,.nav-item') : null;
    if (t) snap();
  }, true);
  document.addEventListener('keydown', function () { if (guardOn()) lastAct = Date.now(); }, true);

  /* Wrap the feedback functions so a captured action doesn't announce
     "تم الحذف" for something that did not happen. */
  ['toast', 'notify', 'celebrate', 'playTone'].forEach(function (fn) {
    var o = window[fn]; if (typeof o !== 'function' || o._apr) return;
    ORIG[fn] = o;
    var w = function () { if (quiet()) return; return o.apply(this, arguments); };
    w._apr = 1; window[fn] = w;
  });
  var _log = window.logAudit;
  if (typeof _log === 'function' && !_log._apr) {
    var wl = function (opts) {
      if (quiet() && held.req === pending && guardOn()) { held.req.audit.push(pick(opts)); try { finishReq(held.req, held.df); } catch (e) {} return; }
      var r = _log.apply(this, arguments);
      if (base && guardOn()) base.top = topId();
      return r;
    };
    wl._apr = 1; window.logAudit = wl;
  }

  /* ════════ 6 · the request sheet (maker side) ════════ */
  var LINE_IC = { rm: '−', mod: '✎', add: '+', bal: '⚖', qty: '▣', debt: '◎' };
  function linesHtml(lines, max) {
    max = max || 8;
    var shown = lines.slice(0, max);
    return '<ul class="apr-lines">' + shown.map(function (l) {
      return '<li class="l-' + l.t + '"><i>' + (LINE_IC[l.t] || '•') + '</i><span>' + esc(l.s) + '</span></li>';
    }).join('') + (lines.length > max ? '<li class="l-more"><i>…</i><span>و ' + (lines.length - max) + ' تغيير تاني</span></li>' : '') + '</ul>';
  }
  function ask(req) {
    if (pending !== req) return;
    req._asked = 1;
    if (req.adminConfirm) {
      openModal('<span class="apr-mt">' + ICON.lock + ' الفترة دي مقفولة</span>',
        '<div class="apr-ask" id="apr-ask"><div class="apr-ask-head k-' + req.kind + '"><span class="apr-ic">' + (KIND[req.kind] || KIND.edit).ic + '</span><div><b>' + esc(req.title) + '</b>' +
          '<span>الفترة مقفولة لحد ' + dmyStr(S().closedUntil) + '. ولا حاجة اتغيرت لسه — أكّد لو عايز التعديل ده يتنفذ.</span></div></div>' +
          '<div class="apr-sec">اللي هيحصل</div>' + linesHtml(req.lines, 7) + '</div>',
        '<button class="btn btn-danger" onclick="AXApprovals.confirmClosed()">' + ICON.check + ' تنفيذ التعديل</button><button class="btn btn-ghost" onclick="AXApprovals.discard()">إلغاء</button>');
      return;
    }
    var dup = list().find(function (r) { return r.status === 'pending' && r.sig && r.sig === req.sig; });
    if (dup) {
      pending = null; held = null;
      openModal('<span class="apr-mt">' + ICON.shield + ' الطلب ده متبعت قبل كده</span>',
        '<div class="apr-ask" id="apr-ask"><div class="apr-ask-head k-' + dup.kind + '"><span class="apr-ic">' + (KIND[dup.kind] || KIND.edit).ic + '</span><div><b>' + esc(dup.title) + '</b>' +
        '<span>طلب #' + dup.no + ' من ' + esc(dup.by && dup.by.name) + ' ' + ago(dup.at) + ' — لسه مستني قرار المدير. أول ما يوافق هيتنفذ أوتوماتيك، ومفيش داعي تبعته تاني.</span></div></div></div>',
        '<button class="btn btn-primary" onclick="closeModal();navigate(\'approvals\')">افتح طلبات الموافقة</button><button class="btn btn-ghost" onclick="closeModal()">تمام</button>');
      return;
    }
    var hint = (req.audit.find(function (a) { return a.reason; }) || {}).reason || '';
    if (/^حذف عميل من قِبل المستخدم$/.test(hint)) hint = '';
    var k = KIND[req.kind] || KIND.edit;
    openModal('<span class="apr-mt">' + ICON.shield + ' محتاجة موافقة المدير</span>',
      '<div class="apr-ask" id="apr-ask">' +
        '<div class="apr-ask-head k-' + req.kind + '"><span class="apr-ic">' + k.ic + '</span><div><b>' + esc(req.title) + '</b>' +
          '<span>ولا حاجة اتغيرت لسه. ابعت الطلب والمدير يوافق فيتنفذ أوتوماتيك، أو يرفض ويقولك السبب.</span></div></div>' +
        '<div class="apr-sec">اللي هيحصل لو المدير وافق</div>' + linesHtml(req.lines, 7) +
        '<div class="form-group" style="margin-top:14px"><label>سبب الطلب *</label>' +
          '<textarea id="apr-reason" class="form-control" rows="3" placeholder="مثال: الفاتورة اتسجلت مرتين بالغلط">' + esc(hint) + '</textarea></div>' +
        '<div class="apr-chips">' + ['تصحيح خطأ في الإدخال', 'مكررة بالغلط', 'طلب من العميل', 'مطابقة مع المستند الأصلي'].map(function (s) {
          return '<button type="button" onclick="document.getElementById(\'apr-reason\').value=this.textContent">' + s + '</button>'; }).join('') + '</div>' +
      '</div>',
      '<button class="btn btn-primary" onclick="AXApprovals.submit()">' + ICON.shield + ' إرسال الطلب للمدير</button>' +
      '<button class="btn btn-ghost" onclick="AXApprovals.discard()">إلغاء</button>');
    setTimeout(function () { var t = document.getElementById('apr-reason'); if (t && !t.value) try { t.focus(); } catch (e) {} }, 80);
  }
  function nextNo() { return list().reduce(function (m, r) { return Math.max(m, r.no || 0); }, 0) + 1; }
  function trim() {
    var l = list(); if (l.length <= 400 || !isAdmin()) return;
    var keep = l.filter(function (r) { return r.status === 'pending'; }), done = l.filter(function (r) { return r.status !== 'pending'; })
      .sort(function (a, b) { return (b.decidedAt || b.at) - (a.decidedAt || a.at); }).slice(0, 400 - keep.length);
    S()._approvals = keep.concat(done);
  }
  function submit() {
    var req = pending;
    if (!req) { closeModal(); return; }
    var why = String((document.getElementById('apr-reason') || {}).value || '').trim();
    if (why.length < 3) { T('اكتب سبب الطلب (3 حروف على الأقل)', 'warning'); return; }
    delete req.why; delete req._asked;
    req.reason = why; req.no = nextNo(); req.at = Date.now(); req.status = 'pending';
    list().unshift(req); trim();
    pending = null; held = null;
    rawSave();
    snap();
    closeModal();
    T('اتبعت طلب #' + req.no + ' للمدير — هيتنفذ أول ما يوافق، وهتلاقيه في «طلبات الموافقة»', 'info', 5000);
    refresh();
  }
  function confirmClosed() {
    var req = pending; if (!req || !req.adminConfirm) { closeModal(); return; }
    pending = null; held = null;
    applying = true;
    try {
      X.applyDiff(D(), req.diff || {}, 'all');
      (req.audit || []).forEach(function (a) {
        try { _log({ operation: a.operation, table: a.table, recordId: a.recordId, recordLabel: a.recordLabel, before: a.before, after: a.after, reason: (a.reason || '') + ' (في فترة مقفولة — بتأكيد المدير)' }); } catch (e) {}
      });
      rawSave();
    } finally { applying = false; }
    snap();
    closeModal();
    T('اتنفذ التعديل');
    refresh(true);
  }
  function discard() {
    pending = null; held = null;
    closeModal();
    T('اتلغت العملية — ولا حاجة اتغيرت', 'info');
  }

  /* ════════ 7 · apply / decide (checker side) ════════ */
  function applyDiff(df) { X.applyDiff(D(), df, 'all'); }
  /* records that changed after the request was sent */
  function conflicts(df) {
    var out = [];
    function chk(arr, cd, k) {
      var m = idx(arr), money = FIN.indexOf(k) >= 0;
      cd.modified.forEach(function (x) {
        var c = m[x.k];
        if (!c) { out.push((x.lab || shortLab(k, {})) + ' (اتحذف)'); return; }
        if (x.f.some(function (f) { return realField(f) && (money || !isNum(x.b[f])) && !same(c[f], x.b[f]); })) out.push(x.lab || shortLab(k, c));
      });
      cd.removed.forEach(function (r) {
        if (k === 'stockMoves') return;
        var c = m[keyOf(r)];
        if (!c) { out.push(shortLab(k, r) + ' (اتحذف خلاص — يمكن الطلب اتنفذ قبل كده)'); return; }
        if (fieldsChanged(r, c).some(realField)) out.push(shortLab(k, c));
      });
    }
    Object.keys(df.cols || {}).forEach(function (k) { chk(A(k), df.cols[k], k); });
    Object.keys(df.sets || {}).forEach(function (k) { chk(Array.isArray(S()[k]) ? S()[k] : [], df.sets[k], k); });
    return out;
  }
  function find(id) { return list().find(function (r) { return r.id === id; }); }
  function approve(id) {
    if (!isAdmin()) { T('الموافقة للمدير بس', 'error'); return; }
    var r = find(id); if (!r || r.status !== 'pending') { T('الطلب ده اتاخد فيه قرار خلاص', 'warning'); refresh(); return; }
    var cf = conflicts(r.diff || {});
    var go = function () { execute(r, cf.length); };
    if (cf.length) confirmDialog('في بيانات اتغيرت من وقت ما الطلب اتبعت:\n• ' + cf.slice(0, 6).join('\n• ') + (cf.length > 6 ? '\n…' : '') +
      '\n\nلو كملت هيتنفذ الطلب على البيانات الحالية (الأرصدة والكميات بتتعدّل بالفرق بس). تكمل؟', go);
    else go();
  }
  function execute(r, nConf) {
    var backup = JSON.stringify(D()), adm = me();
    applying = true;
    try {
      applyDiff(r.diff || {});
      var audits = (r.audit && r.audit.length) ? r.audit : [{ operation: r.kind === 'delete' ? 'delete' : 'edit', table: r.table || 'settings', recordLabel: r.title, reason: '' }];
      audits.forEach(function (a) {
        try {
          _log({ operation: a.operation, table: a.table, recordId: a.recordId, recordLabel: a.recordLabel, before: a.before, after: a.after,
            reason: (a.reason || r.reason || '') + ' — بموافقة ' + adm + ' (طلب #' + r.no + ')' });
          var e = (D().auditLog || [])[0];
          if (e && r.by) { e.userId = r.by.id; e.userName = r.by.name; e.userRole = r.by.role; e.approvedBy = adm; e.approvalNo = r.no; }
        } catch (e2) {}
      });
      var cur = find(r.id) || r;
      cur.status = 'approved'; cur.decidedAt = Date.now(); cur.decidedBy = { id: (user() || {}).id, name: adm };
      if (nConf) cur.conflicts = nConf;
      rawSave();
    } catch (e) {
      console.error('[approvals] apply failed', e);
      try { DB.data = JSON.parse(backup); } catch (e3) {}
      applying = false;
      T('حصلت مشكلة وماتنفذش الطلب — البيانات زي ما هي', 'error');
      refresh();
      return;
    }
    applying = false;
    T('اتنفذ طلب #' + r.no + ': ' + r.title);
    refresh(true);
  }
  function reject(id) {
    if (!isAdmin()) return;
    var r = find(id); if (!r || r.status !== 'pending') { refresh(); return; }
    openModal('رفض طلب #' + r.no,
      '<p class="ax-modal-lead">' + esc(r.title) + ' — من ' + esc(r.by && r.by.name) + '. السبب هيوصله أول ما يفتح البرنامج.</p>' +
      '<div class="form-group"><label>سبب الرفض *</label><textarea id="apr-rej" class="form-control" rows="3" placeholder="مثال: محتاج صورة من المستند الأصلي الأول"></textarea></div>' +
      '<div class="apr-chips">' + ['السبب مش كافي', 'محتاج المستند الأصلي', 'التعديل ده غلط', 'اتعمل بطريقة تانية', 'كلمني الأول'].map(function (s) {
        return '<button type="button" onclick="document.getElementById(\'apr-rej\').value=this.textContent">' + s + '</button>'; }).join('') + '</div>',
      '<button class="btn btn-danger" onclick="AXApprovals.doReject(\'' + r.id + '\')">' + ICON.x + ' رفض الطلب</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
    setTimeout(function () { var t = document.getElementById('apr-rej'); if (t) try { t.focus(); } catch (e) {} }, 80);
  }
  function doReject(id) {
    var r = find(id); if (!r || r.status !== 'pending') { closeModal(); refresh(); return; }
    var why = String((document.getElementById('apr-rej') || {}).value || '').trim();
    if (why.length < 3) { T('اكتب سبب الرفض', 'warning'); return; }
    r.status = 'rejected'; r.rejectReason = why; r.decidedAt = Date.now(); r.decidedBy = { id: (user() || {}).id, name: me() };
    rawSave(); closeModal();
    T('اترفض طلب #' + r.no, 'info');
    refresh(true);
  }
  function withdraw(id) {
    var r = find(id), u = user();
    if (!r || r.status !== 'pending' || !u || !r.by || r.by.id !== u.id) return;
    confirmDialog('تسحب طلب #' + r.no + ' (' + r.title + ')؟', function () {
      r.status = 'withdrawn'; r.decidedAt = Date.now();
      rawSave(); if (guardOn()) snap();
      T('اتسحب الطلب', 'info'); refresh(true);
    });
  }
  function toggleOn(on) {
    if (!isAdmin()) return;
    if (on) delete S().approvalsOff; else S().approvalsOff = true;
    rawSave();
    T(on ? 'الموافقات شغّالة — أي تعديل حساس من غير المدير هيحتاج موافقة' : 'الموافقات اتقفلت — التعديلات هتتنفذ على طول', on ? 'success' : 'warning', 4500);
    draw();
  }

  /* ════════ 8 · the page ════════ */
  var ui = { f: 'pending', who: '', whoList: [] };
  function mineOnly(all) { var u = user(); return isAdmin() ? all : all.filter(function (r) { return r.by && u && r.by.id === u.id; }); }
  function pendingCount() { return list().filter(function (r) { return r.status === 'pending'; }).length; }
  function unseenDecisions() {
    var u = user(); if (!u) return 0;
    var seen = +ls('ax_apr_seen_' + u.id) || 0;
    return list().filter(function (r) { return r.by && r.by.id === u.id && (r.status === 'approved' || r.status === 'rejected') && (r.decidedAt || 0) > seen; }).length;
  }

  function card(r) {
    var k = KIND[r.kind] || KIND.edit, u = user(), mine = r.by && u && r.by.id === u.id;
    var stTxt = { pending: 'مستني القرار', approved: 'اتنفذ ✓', rejected: 'مرفوض', withdrawn: 'اتسحب' }[r.status] || r.status;
    var rows = r.rows || [];
    var dec = '';
    if (r.status === 'approved') dec = '<div class="apr-dec ok">' + ICON.check + '<span>وافق ' + esc(r.decidedBy && r.decidedBy.name) + ' · ' + ago(r.decidedAt) + (r.conflicts ? ' · اتنفذ على بيانات اتغيرت بعد الطلب' : '') + '</span></div>';
    else if (r.status === 'rejected') dec = '<div class="apr-dec bad">' + ICON.x + '<span><b>رفض ' + esc(r.decidedBy && r.decidedBy.name) + ':</b> ' + esc(r.rejectReason || '') + '</span></div>';
    else if (r.status === 'withdrawn') dec = '<div class="apr-dec">' + ICON.undo + '<span>صاحب الطلب سحبه · ' + ago(r.decidedAt) + '</span></div>';
    var foot = '';
    if (r.status === 'pending' && isAdmin()) foot = '<footer><button class="ok" onclick="AXApprovals.approve(\'' + r.id + '\')">' + ICON.check + ' موافقة وتنفيذ</button><button class="no" onclick="AXApprovals.reject(\'' + r.id + '\')">' + ICON.x + ' رفض</button></footer>';
    else if (r.status === 'pending' && mine) foot = '<footer><button onclick="AXApprovals.withdraw(\'' + r.id + '\')">' + ICON.undo + ' سحب الطلب</button></footer>';
    return '<article class="apr-card k-' + r.kind + ' s-' + r.status + '">' +
      '<header><span class="apr-ic">' + k.ic + '</span><div class="apr-ct"><b>' + esc(r.title) + '</b>' +
        '<span>#' + r.no + ' · ' + esc(r.by && r.by.name) + (r.by && r.by.role ? ' (' + esc(roleName(r.by.role)) + ')' : '') + ' · ' + ago(r.at) + '</span></div>' +
        '<span class="apr-st">' + stTxt + '</span></header>' +
      (r.reason ? '<p class="apr-why"><b>السبب:</b> ' + esc(r.reason) + '</p>' : '') +
      linesHtml(r.lines || [], 5) +
      (rows.length ? '<details class="apr-more"><summary>التفاصيل · ' + rows.length + ' ' + (rows.length === 1 ? 'تغيير' : rows.length <= 10 ? 'تغييرات' : 'تغيير') + '</summary>' +
        '<div class="apr-tbl-w"><table class="apr-tbl"><thead><tr><th>السجل</th><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead><tbody>' +
        rows.map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td><td class="b">' + esc(x[2]) + '</td><td class="a">' + esc(x[3]) + '</td></tr>'; }).join('') +
        '</tbody></table></div><small class="apr-at">اتبعت ' + dmy(r.at) + ' الساعة ' + hm(r.at) + '</small></details>' : '') +
      dec + foot + '</article>';
  }

  function draw() {
    var host = document.getElementById('apr-root'); if (!host) return;
    var admin = isAdmin(), all = mineOnly(list().slice()).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var pend = all.filter(function (r) { return r.status === 'pending'; });
    var mStart = new Date(); mStart.setDate(1); mStart.setHours(0, 0, 0, 0);
    var month = all.filter(function (r) { return (r.decidedAt || 0) >= mStart.getTime(); });
    var appr = month.filter(function (r) { return r.status === 'approved'; }).length, rej = month.filter(function (r) { return r.status === 'rejected'; }).length;
    var decided = all.filter(function (r) { return (r.status === 'approved' || r.status === 'rejected') && r.decidedAt && r.at; });
    var avg = decided.length ? dur(decided.reduce(function (s, r) { return s + (r.decidedAt - r.at); }, 0) / decided.length) : null;
    var who = {};
    all.forEach(function (r) { var n = (r.by && r.by.name) || '—'; who[n] = (who[n] || 0) + (r.status === 'pending' ? 1 : 0); });
    var shown = all.filter(function (r) {
      return (ui.f === 'all' || r.status === ui.f || (ui.f === 'rejected' && r.status === 'withdrawn')) && (!ui.who || (r.by && r.by.name) === ui.who);
    });
    var off = !!S().approvalsOff;
    var counts = { pending: pend.length, approved: all.filter(function (r) { return r.status === 'approved'; }).length, rejected: all.filter(function (r) { return r.status === 'rejected' || r.status === 'withdrawn'; }).length, all: all.length };
    host.innerHTML =
      '<section class="cus-hero apr-hero">' +
        '<div class="cus-hero-t"><span>' + (admin ? 'مستني قرارك' : 'طلباتك اللي مستنية') + '</span><b>' + pend.length + ' <i>' + (pend.length === 1 ? 'طلب' : pend.length && pend.length <= 10 ? 'طلبات' : 'طلب') + '</i></b>' +
          '<small>' + (admin ? 'أي حذف أو تعديل حساس من المحاسبين بيستناك هنا — توافق يتنفذ أوتوماتيك، ترفض بسبب.' : 'أي تعديل حساس (فواتير، فلوس، أرصدة، حذف) بيروح للمدير، وتعرف القرار هنا أول ما ياخده.') + '</small></div>' +
        '<div class="cus-hero-figs">' +
          '<div><span>اتنفذت</span><b class="ok">' + appr + '</b><small>الشهر ده</small></div>' +
          '<div><span>اترفضت</span><b class="' + (rej ? 'bad' : '') + '">' + rej + '</b><small>الشهر ده</small></div>' +
          '<div><span>وقت القرار</span><b>' + (avg ? avg.v : '—') + '</b><small>' + (avg ? avg.u + ' في المتوسط' : 'لسه مفيش') + '</small></div>' +
        '</div>' +
        (admin ? '<label class="apr-switch' + (off ? '' : ' on') + '"><input type="checkbox" ' + (off ? '' : 'checked') + ' onchange="AXApprovals.toggle(this.checked)"><i></i><span>' + (off ? 'الموافقات مقفولة' : 'الموافقات شغّالة') + '</span></label>' : '') +
      '</section>' +
      (off ? '<div class="apr-offnote">' + ICON.warn + '<span>' + (admin ? 'الموافقات مقفولة: أي مستخدم يقدر يحذف ويعدّل من غير ما يرجعلك. شغّلها من الزرار اللي فوق.' : 'المدير قافل الموافقات دلوقتي.') + '</span></div>' : '') +
      '<div class="cus-tools">' +
        '<div class="ax-seg">' + [['pending', 'مستنية'], ['approved', 'اتنفذت'], ['rejected', 'اترفضت'], ['all', 'الكل']].map(function (o) {
          return '<button class="' + (ui.f === o[0] ? 'on' : '') + '" onclick="AXApprovals.filter(\'' + o[0] + '\')">' + o[1] + (counts[o[0]] ? ' <em class="apr-n">' + counts[o[0]] + '</em>' : '') + '</button>'; }).join('') + '</div>' +
        (admin && Object.keys(who).length > 1 ? '<div class="cus-who">' + (ui.whoList = [''].concat(Object.keys(who))).map(function (n, i) {
          return '<button class="' + (ui.who === n ? 'on' : '') + '" onclick="AXApprovals.who(' + i + ')">' + esc(n || 'الكل') + (n && who[n] ? ' <em>' + who[n] + '</em>' : '') + '</button>'; }).join('') + '</div>' : '') +
      '</div>' +
      (shown.length ? '<div class="apr-grid">' + shown.map(card).join('') + '</div>'
        : '<div class="skh-empty"><b>' + (ui.f === 'pending' ? (admin ? 'مفيش طلبات مستنية' : 'مفيش طلبات مستنية منك') : 'مفيش طلبات هنا') + '</b><span>' +
          (ui.f === 'pending' ? (admin ? 'أول ما محاسب يحاول يعدّل أو يحذف حاجة، الطلب هيظهر هنا ويوصلك تنبيه.' : 'لو حاولت تعدّل أو تحذف حاجة هيطلعلك زرار «إرسال الطلب للمدير».') : 'غيّر الفلتر') + '</span></div>') +
      (admin ? '<p class="apr-perm-link">' + ICON.key + ' إيه اللي يحتاج موافقتك لكل مستخدم، والأقسام اللي يدخلها — بتحددها من <a href="javascript:void(0)" onclick="navigate(\'users\')">«المستخدمين»</a>.</p>' : '') +
      '<details class="apr-rules"' + (admin ? '' : ' open') + '><summary>' + ICON.shield + ' إيه اللي بيحتاج موافقة؟</summary><ul>' +
        (admin ? '' : '<li class="me"><b>صلاحيتك:</b> ' + LEVEL_NOTE[levelFor() || 'none'] + '</li>') +
        (S().closedUntil ? '<li>أي حاجة تاريخها ' + dmyStr(S().closedUntil) + ' أو قبله (الفترة مقفولة)</li>' : '') +
        '<li>حذف فاتورة أو صرف أو تحصيل أو مصروف أو فاتورة شراء أو سداد مورد أو تحويل بنكي</li>' +
        '<li>تعديل أي فاتورة أو فلوس اتسجلت (المبلغ، الخصم، الضريبة، التاريخ…)</li>' +
        '<li>تعديل رصيد عميل أو مورد (الرصيد، الرصيد الافتتاحي، حد الائتمان)</li>' +
        '<li>حذف عميل أو مورد أو صنف، وتعديل كميات المخزن من غير حركة، واعتماد الجرد</li>' +
        '<li>حذف مديونية أو تغيير المبلغ المدين بيه في «سداد المديونية»</li>' +
        '<li>ولو المدير محدد للمستخدم «أي تعديل أو حذف»: كمان تعديل أي بيانات (عميل، مورد، صنف، موظف، عهدة، هدف الشهر…) وحذف أي حاجة</li>' +
        '<li class="ok">الإضافة الجديدة (فاتورة، صرف، تحصيل، مصروف، عهدة…) بتتسجل على طول من غير موافقة. والمدير نفسه مش محتاج موافقة.</li>' +
      '</ul></details>';
  }

  var LEVEL_NOTE = {
    edits: 'أي تعديل أو حذف في أي حاجة بيروح للمدير الأول. الإضافة الجديدة (فاتورة، صرف، تحصيل، مصروف…) بتتسجل على طول.',
    sensitive: 'الحذف وتعديل الفواتير والفلوس والأرصدة وكميات المخزن بس اللي بيروح للمدير. تعديل البيانات العادية (اسم، تليفون، سعر…) بيتنفذ على طول.',
    none: 'تعديلاتك بتتنفذ على طول من غير موافقة (إلا لو الفترة مقفولة).'
  };
  function dmyStr(ds) { var p = String(ds).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
  window.renderApprovals = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="apr" id="apr-root"></div>';
    var u = user(); if (u) ls('ax_apr_seen_' + u.id, Date.now());
    draw();
    badge();
  };
  function refresh(sidebar) {
    if (typeof currentPage !== 'undefined' && currentPage === 'approvals') draw();
    else if (typeof currentPage !== 'undefined') {
      var R = { invoices: 'renderInvoices', payments: 'renderPayments', customers: 'renderCustomers', issuances: 'renderIssuances', expenses: 'renderExpenses',
        suppliers: 'renderSuppliers', transfers: 'renderTransfersPage', inventory: 'renderInventory', stock: 'renderStockHub', debts: 'renderDebts', dashboard: 'renderDashboard' };
      var fn = window[R[currentPage]];
      if (typeof fn === 'function') { try { fn(); } catch (e) {} }
    }
    if (sidebar !== false) { try { if (typeof renderSidebar === 'function') renderSidebar(); } catch (e) {} }
    badge();
  }

  /* ════════ 9 · badge + notifications ════════ */
  function badge() {
    var el = document.querySelector('#sidebar-nav .nav-item[onclick*="\'approvals\'"]'); if (!el) return;
    var n = isAdmin() ? pendingCount() : unseenDecisions();
    var b = el.querySelector('.apr-badge'); if (b) b.remove();
    if (n > 0) el.insertAdjacentHTML('beforeend', '<span class="badge apr-badge' + (isAdmin() ? '' : ' mine') + '">' + (n > 9 ? '9+' : n) + '</span>');
  }
  function checkEvents() {
    var u = user(); if (!u || !u.id) return;
    var key = 'ax_apr_evt_' + u.id, last = +ls(key) || 0, all = list(), now = Date.now();
    if (isAdmin()) {
      var pend = all.filter(function (r) { return r.status === 'pending'; });
      if (!ss('ax_apr_sum_' + u.id)) {
        ss('ax_apr_sum_' + u.id, 1);
        if (pend.length) T('عندك ' + pend.length + ' ' + (pend.length === 1 ? 'طلب موافقة مستني' : 'طلبات موافقة مستنية') + ' قرارك — افتح «طلبات الموافقة»', 'info', 6000);
      } else {
        var fresh = pend.filter(function (r) { return (r.at || 0) > last && !(r.by && r.by.id === u.id); });
        if (fresh.length) T(fresh.length === 1 ? 'طلب موافقة جديد من ' + (fresh[0].by && fresh[0].by.name) + ': ' + fresh[0].title : fresh.length + ' طلبات موافقة جديدة', 'info', 6000);
      }
    } else if (last) {
      all.filter(function (r) { return r.by && r.by.id === u.id && (r.status === 'approved' || r.status === 'rejected') && (r.decidedAt || 0) > last; })
        .slice(0, 3).forEach(function (r) {
          T(r.status === 'approved' ? 'المدير وافق على طلبك #' + r.no + ' واتنفذ: ' + r.title : 'المدير رفض طلبك #' + r.no + (r.rejectReason ? ' — السبب: ' + r.rejectReason : ''),
            r.status === 'approved' ? 'success' : 'warning', 7000);
        });
    }
    ls(key, now);
    badge();
  }

  var _rs = window.renderSidebar;
  if (typeof _rs === 'function' && !_rs._apr) {
    var wrs = function () {
      var r = _rs.apply(this, arguments);
      try {
        if (!base && guardOn()) snap();
        badge();
        if (user() && typeof currentPage !== 'undefined' && currentPage && typeof can === 'function' && !can(currentPage)) setTimeout(function () { try { navigate('dashboard'); } catch (e) {} }, 0);
      } catch (e) {}
      return r;
    };
    wrs._apr = 1; window.renderSidebar = wrs;
  }
  /* A sync from the server (another device saved) hands DB._bootstrapData the
     fresh copy, merges it, then refreshes the badges — right there we take a
     new snapshot so someone else's change is never mistaken for this user's. */
  var merged = false;
  try {
    var bd = DB._bootstrapData;
    Object.defineProperty(DB, '_bootstrapData', {
      configurable: true, enumerable: true,
      get: function () { return bd; },
      set: function (v) { bd = v; merged = true; }
    });
  } catch (e) {}
  var _unb = window.updateNotifBadge;
  if (typeof _unb === 'function' && !_unb._apr) {
    var wnb = function () {
      var r = _unb.apply(this, arguments);
      try {
        if (merged) {
          merged = false;
          if (guardOn() && !quiet()) snap();
          if (typeof renderSidebar === 'function') { try { renderSidebar(); } catch (e) {} }   // the admin may have changed my sections
        }
        checkEvents();
      } catch (e) {}
      return r;
    };
    wnb._apr = 1; window.updateNotifBadge = wnb;
  }

  window.AXApprovals = {
    submit: submit, discard: discard, confirmClosed: confirmClosed, approve: approve, reject: reject, doReject: doReject, withdraw: withdraw, toggle: toggleOn,
    filter: function (f) { ui.f = f; draw(); },
    levelFor: levelFor, LEVEL_NOTE: LEVEL_NOTE,
    who: function (i) { var n = ui.whoList[i] || ''; ui.who = ui.who === n ? '' : n; draw(); },
    pendingCount: pendingCount, render: window.renderApprovals,
    /* internals (kept public for tests / other modules) */
    _diff: function () { return base ? computeDiff().df : null; }, _snap: snap, _classify: classify, _applyDiff: applyDiff, _conflicts: conflicts
  };
})();

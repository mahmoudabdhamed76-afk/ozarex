/* ════════════════════════════════════════════════════════════════════
   ERP · axcore — change detection + business rules
   ------------------------------------------------------------------
   One file used by BOTH sides, so the browser and the server always agree:
     · the browser: «طلبات الموافقة» (what needs the admin) and the sync
       (send only what changed)
     · the server (require('…/js/axcore.js')): applies the changes it
       receives record by record and refuses what a non-admin may not do
   Pure functions only — no DOM, no globals.
════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AXCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FIN = ['invoices', 'issuances', 'payments', 'expenses', 'supplierPayments', 'bankTransfers'];
  var GUARD_RM = FIN.concat(['customers', 'suppliers', 'products', 'stockMoves']);
  var BAL = ['balance', 'openingBalance', 'creditLimit'];
  /* fields that only record that something was printed / shared / viewed */
  var IGN = {};
  ['printed', 'printedAt', 'printCount', 'lastPrintedAt', 'sentAt', 'whatsappAt', 'whatsappSentAt', 'reminderAt', 'remindedAt',
    'lastReminder', 'seen', 'viewedAt', 'updatedAt', 'pinned', 'archived', 'isArchived', 'dueDate', 'sharedAt', 'lastSharedAt']
    .forEach(function (f) { IGN[f] = 1; });
  /* what a NEW invoice / payment / issuance may change on existing money records */
  var SIDE_FIN = {};
  ['paid', 'status', 'invoiceId', 'invoiceNumber', 'consolidatedIntoId', 'consolidatedIntoNumber', 'archived', 'sourceIssuanceId', 'fromIssuance', 'fromIssuances']
    .forEach(function (f) { SIDE_FIN[f] = 1; });
  /* accumulated numbers: when two devices change them at once, both differences count */
  var ACC = { balance: 1, quantity: 1, paid: 1 };
  /* settings a user can change outside the settings page */
  var EDIT_KEYS = { monthlyTarget: 'هدف مبيعات الشهر' };
  /* settings keys a non-admin may write at all (the server refuses the rest) */
  var USER_KEYS = { monthlyTarget: 1, _debtPlan: 1, countBlind: 1, _approvals: 1, _custody: 1, _debts: 1, _stockCounts: 1, _cheques: 1, _po: 1,
    tickerSpeed: 1, tickerEvents: 1, tickerPages: 1, soundEnabled: 1, reciterVolume: 1, reciterEnabled: 1, dailyBackupReminder: 1,
    lastBackupReminderDate: 1, _prospects: 1, _portal: 1, _stmtSent: 1, _poLead: 1, _requests: 1, _calls: 1, _stmtWeek: 1 };
  /* how much needs the admin — set PER USER by the admin in «المستخدمين»:
       'sensitive' (default, like 4.6) · 'edits' (any edit / delete) · 'none'
     → null means nothing needs approval (admin, or a user set to 'none') */
  var DEFAULT_LEVEL = { accountant: 'sensitive', sales: 'sensitive' };
  function levelOf(settings, user) {
    var u = user && typeof user === 'object' ? user : { role: user };
    if (!u.role || u.role === 'admin') return null;
    if (u.approval === 'none') return null;
    if (u.approval === 'edits' || u.approval === 'sensitive') return u.approval;
    return DEFAULT_LEVEL[u.role] || 'sensitive';
  }
  /* inside these settings records, these fields are part of the normal flow */
  var FLOW_FIELDS = { _custody: { status: 1, closedAt: 1, moves: 1 }, _cheques: { status: 1, statusAt: 1, history: 1, paymentId: 1, spId: 1, revId: 1 },
    _po: { status: 1, sentAt: 1, receivedAt: 1, purchaseId: 1, received: 1 },
    _requests: { status: 1, decidedAt: 1 } };
  var ADMIN_ONLY_PAGES = ['users', 'audit', 'settings', 'security'];

  function blank(v) { return v === undefined || v === null || v === ''; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numLike(v) { return isNum(v) || (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))); }
  function same(x, y) {
    if (x === y) return true;
    if (blank(x) && blank(y)) return true;
    if (numLike(x) && numLike(y)) return Math.abs(Number(x) - Number(y)) < 1e-9;
    if ((x && typeof x === 'object') || (y && typeof y === 'object')) return JSON.stringify(x) === JSON.stringify(y);
    return false;
  }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function str(v) { return JSON.stringify(v === undefined ? null : v); }
  function rnd(v) { return Math.round(v * 1e6) / 1e6; }
  function realField(f) { return !IGN[f]; }
  function keyOf(r) { return r && typeof r === 'object' && r.id != null ? 'i:' + r.id : 'j:' + JSON.stringify(r); }
  function idx(arr) { var m = {}; (arr || []).forEach(function (r) { m[keyOf(r)] = r; }); return m; }
  function isIdArr(v) { return Array.isArray(v) && v.every(function (o) { return o && typeof o === 'object' && o.id != null; }); }
  function has(cd) { return !!(cd && (cd.added.length || cd.removed.length || cd.modified.length)); }
  function fieldsChanged(b, a) {
    var out = [], seen = {};
    Object.keys(b || {}).concat(Object.keys(a || {})).forEach(function (k) {
      if (seen[k]) return; seen[k] = 1;
      if (!same((b || {})[k], (a || {})[k])) out.push(k);
    });
    return out;
  }

  /* ── diff of one list of records ── */
  function colDiff(bArr, aArr) {
    var bm = idx(bArr), am = idx(aArr), out = { added: [], removed: [], modified: [] };
    Object.keys(am).forEach(function (k) { if (!(k in bm)) out.added.push(clone(am[k])); });
    Object.keys(bm).forEach(function (k) {
      if (!(k in am)) { out.removed.push(clone(bm[k])); return; }
      var b = bm[k], a = am[k];
      if (JSON.stringify(b) === JSON.stringify(a)) return;
      var f = fieldsChanged(b, a); if (!f.length) return;
      var bb = {}, aa = {};
      f.forEach(function (x) { bb[x] = clone(b[x]); aa[x] = clone(a[x]); });
      out.modified.push({ k: k, f: f, b: bb, a: aa, rb: clone(b), ra: clone(a) });
    });
    return out;
  }

  /* ── snapshot (strings per list) and diff against it ──
     opts.skip:    top-level keys left out (e.g. auditLog for approvals)
     opts.skipSet: settings keys left out (e.g. _approvals) */
  function snapshot(d, opts) {
    opts = opts || {};
    var skip = opts.skip || {}, skipSet = opts.skipSet || {};
    var b = { cols: {}, set: {}, counters: str(d.counters || {}) };
    Object.keys(d).forEach(function (k) { if (!skip[k] && Array.isArray(d[k])) b.cols[k] = JSON.stringify(d[k]); });
    var s = d.settings || {};
    Object.keys(s).forEach(function (k) { if (!skipSet[k] && s[k] !== undefined) b.set[k] = str(s[k]); });
    return b;
  }
  function diff(base, d, opts) {
    opts = opts || {};
    var skip = opts.skip || {}, skipSet = opts.skipSet || {};
    var cur = { cols: {}, set: {}, counters: str(d.counters || {}) };
    var df = { cols: {}, sets: {}, keys: {}, counters: null, n: 0 }, keys = {};
    Object.keys(d).forEach(function (k) { if (!skip[k] && Array.isArray(d[k])) keys[k] = 1; });
    Object.keys(base.cols).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var s = JSON.stringify(Array.isArray(d[k]) ? d[k] : []);
      cur.cols[k] = s;
      if (s === (base.cols[k] || '[]')) return;
      var cd = colDiff(JSON.parse(base.cols[k] || '[]'), Array.isArray(d[k]) ? d[k] : []);
      if (has(cd)) { df.cols[k] = cd; df.n++; }
    });
    var st = d.settings || {}, sk = {};
    Object.keys(st).forEach(function (k) { sk[k] = 1; });
    Object.keys(base.set).forEach(function (k) { sk[k] = 1; });
    Object.keys(skipSet).forEach(function (k) { delete sk[k]; });
    Object.keys(sk).forEach(function (k) {
      var s = st[k] === undefined ? undefined : str(st[k]);
      if (s !== undefined) cur.set[k] = s;
      if (s === base.set[k]) return;
      var bv = base.set[k] === undefined ? undefined : JSON.parse(base.set[k]), av = st[k];
      if ((bv === undefined || isIdArr(bv)) && (av === undefined || isIdArr(av)) && (isIdArr(bv) || isIdArr(av))) {
        var cd = colDiff(bv || [], av || []);
        if (has(cd)) { df.sets[k] = cd; df.n++; }
      } else { df.keys[k] = { b: bv, a: clone(av) }; df.n++; }
    });
    if (cur.counters !== base.counters) { df.counters = { b: JSON.parse(base.counters), a: clone(d.counters || {}) }; df.n++; }
    return { df: df, cur: cur };
  }

  /* ── what a change needs ──
     level 'sensitive': deleting, editing money records, balances, stock
                        quantities without a real movement, debts
     level 'edits':     the above + ANY edit or delete of existing data
                        (new records still go straight through)
     opts.closedUntil:  'YYYY-MM-DD' — anything dated on/before it */
  function refs(df) {
    var c = {}, s = {}, p = {};
    FIN.forEach(function (k) {
      (df.cols[k] ? df.cols[k].added : []).forEach(function (r) {
        if (r.customerId) c[r.customerId] = 1;
        if (r.supplierId) s[r.supplierId] = 1;
        if (r.productId) p[r.productId] = 1;
        (Array.isArray(r.items) ? r.items : []).forEach(function (it) { if (it && it.productId) p[it.productId] = 1; });
      });
    });
    (df.cols.stockMoves ? df.cols.stockMoves.added : []).forEach(function (m) {
      if (m.productId && !/^تسوية جرد/.test(String(m.note || m.reference || ''))) p[m.productId] = 1;
    });
    (df.cols.customers ? df.cols.customers.added : []).forEach(function (r) { c[r.id] = 1; });
    (df.cols.suppliers ? df.cols.suppliers.added : []).forEach(function (r) { s[r.id] = 1; });
    (df.cols.products ? df.cols.products.added : []).forEach(function (r) { p[r.id] = 1; });
    return { c: c, s: s, p: p };
  }
  function idOfKey(k) { return k.indexOf('i:') === 0 ? k.slice(2) : null; }
  function nestedAdd(x) {
    return ['moves', 'payments', 'history'].some(function (f) {
      if (x.f.indexOf(f) < 0) return false;
      var ids = {}; (x.b[f] || []).forEach(function (p) { if (p && p.id) ids[p.id] = 1; });
      return (x.a[f] || []).some(function (p) { return p && p.id && !ids[p.id]; });
    });
  }
  function nestedRemove(x, f) {
    if (x.f.indexOf(f) < 0) return false;
    var ids = {}; (x.a[f] || []).forEach(function (p) { if (p && p.id) ids[p.id] = 1; });
    return (x.b[f] || []).some(function (p) { return p && p.id && !ids[p.id]; });
  }
  function isDraftCount(k, x) { return k === '_stockCounts' && (x.rb || {}).status === 'draft' && (x.ra || {}).status === 'draft'; }
  function dateOf(r) { return r && typeof r.date === 'string' ? r.date.slice(0, 10) : ''; }

  function classify(df, level, opts) {
    opts = opts || {};
    var c = df.cols, why = [], seen = {};
    function push(t, k, extra) { var id = t + ':' + k; if (seen[id]) return; seen[id] = 1; var w = { t: t, k: k }; if (extra) for (var e in extra) w[e] = extra[e]; why.push(w); }
    var finAdd = FIN.some(function (k) { return c[k] && c[k].added.length; });
    var R = refs(df), edits = level === 'edits';
    var anyAdd = Object.keys(c).some(function (k) { return k !== 'auditLog' && c[k].added.length; }) ||
      Object.keys(df.sets).some(function (k) { return k !== '_approvals' && (df.sets[k].added.length || df.sets[k].modified.some(nestedAdd)); });

    /* 0 · closed period */
    if (opts.closedUntil) {
      FIN.concat(['stockMoves']).forEach(function (k) {
        var cd = c[k]; if (!cd) return;
        var hit = cd.added.concat(cd.removed).some(function (r) { var d = dateOf(r); return d && d <= opts.closedUntil; }) ||
          cd.modified.some(function (x) {
            if (!x.f.some(realField)) return false;
            var d1 = dateOf(x.rb), d2 = dateOf(x.ra);
            return (d1 && d1 <= opts.closedUntil) || (d2 && d2 <= opts.closedUntil);
          });
        if (hit) push('closed', k);
      });
    }
    /* 1 · deleting */
    Object.keys(c).forEach(function (k) {
      if (k === 'auditLog' || !c[k].removed.length) return;
      if (GUARD_RM.indexOf(k) >= 0 || edits) push('rm', k);
    });
    if (df.sets._debts && df.sets._debts.removed.length) push('debt', '_debts');
    if (edits) Object.keys(df.sets).forEach(function (k) {
      if (k === '_approvals') return;
      if (df.sets[k].removed.some(function (r) { return !(k === '_stockCounts' && r.status === 'draft'); })) push('rm', k);
    });
    /* 2 · editing existing records */
    Object.keys(c).forEach(function (k) {
      if (k === 'auditLog') return;
      c[k].modified.forEach(function (x) {
        var rf = x.f.filter(realField); if (!rf.length) return;
        var id = idOfKey(x.k), rec = x.rb || {};
        if (FIN.indexOf(k) >= 0) {
          var side = finAdd && rf.every(function (f) { return SIDE_FIN[f]; }) && (!rec.customerId || R.c[rec.customerId]);
          if (!side) push('mod', k);
          return;
        }
        if (k === 'customers' || k === 'suppliers') {
          var bal = rf.filter(function (f) { return BAL.indexOf(f) >= 0; });
          var okBal = bal.every(function (f) { return f === 'balance' && (k === 'customers' ? R.c[id] : R.s[id]); });
          if (bal.length && !okBal) push('bal', k);
          if (edits && rf.some(function (f) { return BAL.indexOf(f) < 0; })) push('ed', k);
          return;
        }
        if (k === 'products') {
          if (rf.indexOf('quantity') >= 0 && !R.p[id]) push('qty', k);
          if (edits && rf.some(function (f) { return f !== 'quantity'; })) push('ed', k);
          return;
        }
        if (edits && !anyAdd) push('ed', k);
      });
    });
    /* 3 · settings records (debts, custody, counts…) */
    var dd = df.sets._debts;
    if (dd && dd.modified.some(function (x) { return x.f.indexOf('amount') >= 0 || nestedRemove(x, 'payments'); })) push('debt', '_debts');
    if (edits) {
      Object.keys(df.sets).forEach(function (k) {
        if (k === '_approvals') return;
        var flow = FLOW_FIELDS[k] || {};
        if (df.sets[k].modified.some(function (x) {
          if (isDraftCount(k, x) || nestedAdd(x)) return false;
          if (k === '_stockCounts' && (x.ra || {}).status === 'done') return false;   // approving a count → the stock rule decides
          return x.f.some(function (f) { return realField(f) && !flow[f] && !/(At|Ts)$/.test(f); });
        })) push('ed', k);
      });
      Object.keys(df.keys).forEach(function (k) { if (EDIT_KEYS[k]) push('ed', k, { key: true }); });
    }
    return why.length ? why : null;
  }

  /* ── applying a change ──
     mode 'all': every number moves by its difference (approvals: the data
                 may have changed since the request was made)
     mode 'acc': only accumulated numbers (balance, quantity, paid) move by
                 their difference, everything else takes the new value (sync) */
  function applyCol(arr, cd, mode) {
    var m = idx(arr), rm = {};
    (cd.removed || []).forEach(function (r) { rm[typeof r === 'string' ? r : keyOf(r)] = 1; });
    (cd.modified || []).forEach(function (x) {
      var c = m[x.k]; if (!c || rm[x.k]) return;
      x.f.forEach(function (f) {
        var b = x.b ? x.b[f] : undefined, a = x.a[f], v = c[f];
        var delta = (mode === 'all' || ACC[f]) && isNum(a) && isNum(b) && (isNum(v) || blank(v));
        if (delta) c[f] = rnd(Number(v || 0) + (a - b));
        else if (a === undefined) delete c[f];
        else c[f] = clone(a);
      });
    });
    var out = arr.filter(function (r) { return !rm[keyOf(r)]; });
    (cd.added || []).forEach(function (r) {
      var k = keyOf(r);
      if (!m[k]) out.push(clone(r));
      else if (mode === 'acc') { var i = out.indexOf(m[k]); if (i >= 0) out[i] = clone(r); }   // same id sent again → newest copy
    });
    return out;
  }
  function applyDiff(d, df, mode) {
    if (!d.settings) d.settings = {};
    var st = d.settings;
    Object.keys(df.cols || {}).forEach(function (k) { d[k] = applyCol(Array.isArray(d[k]) ? d[k] : [], df.cols[k], mode); });
    Object.keys(df.sets || {}).forEach(function (k) { st[k] = applyCol(Array.isArray(st[k]) ? st[k] : [], df.sets[k], mode); });
    Object.keys(df.keys || {}).forEach(function (k) { var v = df.keys[k].a; if (v === undefined || v === null) delete st[k]; else st[k] = clone(v); });
    if (df.counters && df.counters.a) {
      var c = d.counters || (d.counters = {});
      Object.keys(df.counters.a).forEach(function (k) { c[k] = Math.max(Number(c[k] || 0), Number(df.counters.a[k] || 0)); });
    }
    return d;
  }
  /* what travels: only the changed fields of an edited record */
  function wire(df) {
    function s(cd) {
      return { added: cd.added, removed: cd.removed.map(keyOf), modified: cd.modified.map(function (x) { return { k: x.k, f: x.f, b: x.b, a: x.a }; }) };
    }
    var out = { cols: {}, sets: {}, keys: {}, counters: df.counters ? { a: df.counters.a } : null };
    Object.keys(df.cols).forEach(function (k) { out.cols[k] = s(df.cols[k]); });
    Object.keys(df.sets).forEach(function (k) { out.sets[k] = s(df.sets[k]); });
    Object.keys(df.keys).forEach(function (k) { out.keys[k] = { a: df.keys[k].a === undefined ? null : df.keys[k].a }; });
    return out;
  }
  /* the server rebuilds full before/after records from its own data before
     judging a change (never trusts the "before" a client says it had) */
  function enrich(d, w) {
    var df = { cols: {}, sets: {}, keys: {}, counters: w.counters || null, n: 0 };
    function one(arr, cd) {
      var m = idx(arr), out = { added: [], removed: [], modified: [] };
      (cd.added || []).forEach(function (r) {
        var k = keyOf(r), cur = m[k];
        if (!cur) { out.added.push(r); return; }
        var f = fieldsChanged(cur, r);   // a record sent again as "new" is really an edit
        if (f.length) { var bb = {}, aa = {}; f.forEach(function (x) { bb[x] = cur[x]; aa[x] = r[x]; }); out.modified.push({ k: k, f: f, b: bb, a: aa, rb: cur, ra: r }); }
      });
      (cd.removed || []).forEach(function (k) { if (m[k]) out.removed.push(m[k]); });
      (cd.modified || []).forEach(function (x) {
        var cur = m[x.k]; if (!cur) return;
        var ra = clone(cur), bb = {}, f = [];
        x.f.forEach(function (fl) {
          var a = x.a[fl], b = x.b ? x.b[fl] : undefined;
          var nv = ACC[fl] && isNum(a) && isNum(b) && (isNum(cur[fl]) || blank(cur[fl])) ? rnd(Number(cur[fl] || 0) + (a - b)) : a;
          if (!same(cur[fl], nv)) { f.push(fl); bb[fl] = cur[fl]; if (nv === undefined) delete ra[fl]; else ra[fl] = nv; }
        });
        if (f.length) { var aa = {}; f.forEach(function (fl) { aa[fl] = ra[fl]; }); out.modified.push({ k: x.k, f: f, b: bb, a: aa, rb: cur, ra: ra }); }
      });
      return out;
    }
    Object.keys(w.cols || {}).forEach(function (k) { var cd = one(Array.isArray(d[k]) ? d[k] : [], w.cols[k]); if (has(cd)) { df.cols[k] = cd; df.n++; } });
    var st = d.settings || {};
    Object.keys(w.sets || {}).forEach(function (k) { var cd = one(Array.isArray(st[k]) ? st[k] : [], w.sets[k]); if (has(cd)) { df.sets[k] = cd; df.n++; } });
    Object.keys(w.keys || {}).forEach(function (k) { if (!same(st[k], w.keys[k].a)) { df.keys[k] = { b: st[k], a: w.keys[k].a }; df.n++; } });
    return df;
  }

  /* ═════ business numbers shared by the screens and the center's link ═════ */
  function daysBetween(from, to) {
    var a = Date.parse(String(from || '').slice(0, 10)), b = Date.parse(String(to || '').slice(0, 10));
    return isFinite(a) && isFinite(b) ? Math.round((b - a) / 864e5) : 0;
  }
  /* sales documents of a center: issuances + invoices that were not made from an issuance */
  function salesDocs(d, cid) {
    var out = [];
    (d.issuances || []).forEach(function (i) {
      if (i.customerId !== cid) return;
      out.push({ kind: 'iss', id: i.id, no: i.number, date: i.date, total: Number(i.total) || 0, paid: Number(i.paid) || 0,
        label: 'صرف #' + i.number + (i.productName ? ' — ' + i.productName : (Array.isArray(i.items) && i.items.length ? ' — ' + i.items.map(function (x) { return x.productName || x.name; }).filter(Boolean).slice(0, 2).join('، ') : '')) });
    });
    (d.invoices || []).forEach(function (v) {
      if (v.customerId !== cid || v.sourceIssuanceId) return;
      out.push({ kind: 'inv', id: v.id, no: v.number, date: v.date, total: Number(v.total) || 0, paid: Number(v.paid) || 0, label: 'فاتورة #' + v.number });
    });
    return out;
  }
  /* what a center owes, split by age: 0–30 · 31–60 · 61–90 · +90 days */
  function aging(d, cid, today) {
    var c = (d.customers || []).find(function (x) { return x.id === cid; }) || {};
    var bal = Number(c.balance) || 0, B = [0, 0, 0, 0];
    var docs = salesDocs(d, cid).map(function (x) { return Object.assign({}, x, { due: Math.max(0, x.total - x.paid) }); })
      .filter(function (x) { return x.due > 0.005; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var sum = docs.reduce(function (t, x) { return t + x.due; }, 0), diff = bal - sum;
    if (diff < 0) {   // money received but not matched to a document yet → it pays the oldest first
      var left = -diff;
      docs.forEach(function (x) { if (left <= 0) return; var t = Math.min(x.due, left); x.due -= t; left -= t; });
    }
    docs = docs.filter(function (x) { return x.due > 0.005; });
    docs.forEach(function (x) { var a = daysBetween(x.date, today); B[a <= 30 ? 0 : a <= 60 ? 1 : a <= 90 ? 2 : 3] += x.due; });
    if (diff > 0.005) B[3] += diff;   // an older / opening balance that has no document
    var pays = (d.payments || []).filter(function (p) { return p.customerId === cid && Number(p.amount) > 0; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0); });
    return {
      balance: bal, buckets: B.map(function (v) { return rnd(v); }), docs: docs,
      oldestDays: docs.length ? daysBetween(docs[0].date, today) : (diff > 0.005 ? 91 : 0),
      openingPart: diff > 0.005 ? rnd(diff) : 0,
      lastPay: pays[0] ? { amount: Number(pays[0].amount) || 0, date: pays[0].date } : null
    };
  }
  /* statement rows (newest first) with a running balance that ends at the current balance */
  function statement(d, cid, limit) {
    var c = (d.customers || []).find(function (x) { return x.id === cid; }) || {};
    var rows = salesDocs(d, cid).map(function (x) { return { date: x.date, label: x.label, debit: x.total, credit: 0, ts: 0 }; });
    (d.payments || []).forEach(function (p) {
      if (p.customerId !== cid) return;
      var a = Number(p.amount) || 0;
      rows.push({ date: p.date, label: a < 0 ? 'ارتداد ' + (p.note || 'شيك') : 'تحصيل' + (p.method ? ' — ' + p.method : '') + (p.reference ? ' ' + p.reference : ''),
        debit: a < 0 ? -a : 0, credit: a > 0 ? a : 0, ts: p.createdAt || 0 });
    });
    rows.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || a.credit - b.credit || a.ts - b.ts; });
    var net = rows.reduce(function (t, r) { return t + r.debit - r.credit; }, 0), run = (Number(c.balance) || 0) - net;
    var opening = rnd(run);
    rows.forEach(function (r) { run += r.debit - r.credit; r.balance = rnd(run); });
    rows.reverse();
    return { opening: opening, rows: limit ? rows.slice(0, limit) : rows, count: rows.length };
  }

  return {
    daysBetween: daysBetween, salesDocs: salesDocs, aging: aging, statement: statement,
    FIN: FIN, GUARD_RM: GUARD_RM, BAL: BAL, IGN: IGN, ACC: ACC, SIDE_FIN: SIDE_FIN, EDIT_KEYS: EDIT_KEYS, USER_KEYS: USER_KEYS,
    ADMIN_ONLY_PAGES: ADMIN_ONLY_PAGES, DEFAULT_LEVEL: DEFAULT_LEVEL, levelOf: levelOf,
    blank: blank, isNum: isNum, same: same, clone: clone, str: str, rnd: rnd, realField: realField, keyOf: keyOf, idx: idx,
    isIdArr: isIdArr, has: has, fieldsChanged: fieldsChanged, colDiff: colDiff, snapshot: snapshot, diff: diff,
    classify: classify, applyCol: applyCol, applyDiff: applyDiff, wire: wire, enrich: enrich, refs: refs
  };
});

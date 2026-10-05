/* ════════════════════════════════════════════════════════════════════
   ERP · تقرير الشهر والتقفيل + كشوف الحساب الأسبوعية (4.13)
   ------------------------------------------------------------------
   ١) «تقرير الشهر والتقفيل»: اختار الشهر ← المبيعات والتحصيل والأرباح
      والمصروفات والمشتريات مقارنة بالشهر اللي فات، أكبر 5 مراكز، المراكز
      اللي وقفت سحب، الأصناف الراكدة، والأسعار اللي هامشها قليل.
      · «طباعة / PDF»: تقرير مرتب من صفحتين.
      · «قفل الشهر» (للمدير): أي تعديل بتاريخ في الشهر ده بعد كده
        يحتاج موافقة المدير (نفس «قفل الفترة» في الأمان).
   ٢) كشوف الحساب الأسبوعية على واتساب: كل خميس البرنامج يفكّرك، ويجهّز
      لكل مركز عليه فلوس رسالة كشف حساب. «ابعت للي بعده» يفتح واتساب
      للمركز اللي عليه الدور. اللي اتبعتله في آخر 6 أيام عليه ✓
      (محفوظ في settings._stmtWeek عشان الفريق كله يشوفه).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { m: '' };
  var MO = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n, d) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d || 0 }); }
  function cur() { var c = S().currency || 'جنيه'; return c === 'جنيه' ? 'ج' : c; }
  function money(n) { return num(n) + ' ' + cur(); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function ds(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diff(a, b) { return Math.round((pd(b) - pd(a)) / 86400000); }
  function user() { var u = (typeof currentUser !== 'undefined' && currentUser) || {}; return u; }
  function isAdmin() { return user().role === 'admin'; }
  function canGo(p) { try { return typeof can !== 'function' || can(p); } catch (e) { return false; } }
  function mShift(m, k) { var d = pd(m + '-01'); d.setMonth(d.getMonth() + k); return ds(d).slice(0, 7); }
  function mEnd(m) { var d = pd(m + '-01'); d.setMonth(d.getMonth() + 1); d.setDate(0); return ds(d); }
  function mName(m) { var d = pd(m + '-01'); return MO[d.getMonth()] + ' ' + d.getFullYear(); }
  function phoneOf(c) { return (typeof normalizeEgyptianPhone === 'function') ? normalizeEgyptianPhone(c && c.phone) : String((c && c.phone) || '').replace(/\D/g, ''); }

  /* ════════ 1 · the month in numbers ════════ */
  function stats(m) {
    var from = m + '-01', to = mEnd(m), inM = function (d) { d = String(d || '').slice(0, 10); return d >= from && d <= to; };
    var linked = {}; A('issuances').forEach(function (i) { if (i.invoiceId) linked[i.invoiceId] = 1; });
    var solo = A('invoices').filter(function (v) { return !(v.sourceIssuanceId || v.sourceIssuance || v.fromIssuance || (v.fromIssuances && v.fromIssuances.length) || linked[v.id]); });
    var iss = A('issuances').filter(function (i) { return inM(i.date); }), sv = solo.filter(function (v) { return inM(v.date); });
    var byC = {};
    function addC(cid, k, v) { var o = byC[cid] || (byC[cid] = { sales: 0, paid: 0, qty: 0 }); o[k] += v; }
    iss.forEach(function (i) { addC(i.customerId, 'sales', N(i.total)); addC(i.customerId, 'qty', N(i.quantity)); });
    sv.forEach(function (v) { addC(v.customerId, 'sales', N(v.total)); });
    var pays = A('payments').filter(function (p) { return inM(p.date) && N(p.amount) > 0; });
    pays.forEach(function (p) { addC(p.customerId, 'paid', N(p.amount)); });
    var sales = iss.reduce(function (s, i) { return s + N(i.total); }, 0) + sv.reduce(function (s, v) { return s + N(v.total); }, 0);
    var exp = A('expenses').filter(function (e) { return e.kind !== 'purchase' && inM(e.date); }).reduce(function (s, e) { return s + N(e.amount); }, 0);
    var pur = A('expenses').filter(function (e) { return e.kind === 'purchase' && inM(e.date); }).reduce(function (s, e) { return s + N(e.amount); }, 0);
    /* gross profit = the same sales above − their cost (product cost × quantity) */
    var pc = {}; A('products').forEach(function (p) { pc[p.id] = N(p.cost); });
    var cost = iss.reduce(function (s, i) { return s + N(i.quantity) * (pc[i.productId] || 0); }, 0) +
      sv.reduce(function (s, v) { return s + (v.items || []).reduce(function (t, it) { return t + N(it.quantity != null ? it.quantity : it.qty) * (pc[it.productId] || 0); }, 0); }, 0);
    var gross = sales - cost;
    var custs = {}; A('customers').forEach(function (c) { custs[c.id] = c; });
    var top = Object.keys(byC).filter(function (k) { return custs[k] && byC[k].sales > 0; }).map(function (k) { return { c: custs[k], sales: byC[k].sales, paid: byC[k].paid, qty: byC[k].qty }; })
      .sort(function (a, b) { return b.sales - a.sales; }).slice(0, 5);
    return { m: m, from: from, to: to, sales: sales, coll: pays.reduce(function (s, p) { return s + N(p.amount); }, 0), ops: iss.length + sv.length,
      qty: iss.reduce(function (s, i) { return s + N(i.quantity); }, 0), exp: exp, pur: pur, gross: gross, net: gross == null ? null : gross - exp,
      centers: Object.keys(byC).filter(function (k) { return byC[k].sales > 0; }).length, top: top };
  }
  function delta(a, b, lowerIsGood) {
    if (!b) return a ? '<i class="mr-d up">جديد</i>' : '';
    var p = (a - b) / Math.abs(b) * 100, good = lowerIsGood ? p <= 0 : p >= 0;
    return '<i class="mr-d ' + (good ? 'up' : 'down') + '">' + (p >= 0 ? '▲ ' : '▼ ') + num(Math.abs(p), 1) + '%</i>';
  }
  function extras() {
    var out = { stopped: [], late: [], stale: [], margins: [], debt: 0, low: 0 };
    try { if (window.AXFc) { var fl = AXFc.model().list; out.stopped = fl.filter(function (x) { return x.st === 'stopped'; }).slice(0, 6); out.late = fl.filter(function (x) { return x.st === 'late'; }).slice(0, 6); } } catch (e) {}
    try { if (window.AXRules) out.stale = AXRules.staleItems().slice(0, 6); } catch (e) {}
    try { if (window.AXMargin) out.margins = AXMargin.list().slice(0, 6); } catch (e) {}
    out.debt = A('customers').reduce(function (s, c) { return s + Math.max(0, N(c.balance)); }, 0);
    out.low = A('products').filter(function (p) { return N(p.quantity) <= N(p.minQuantity); }).length;
    return out;
  }

  function closedTo() { return S().closedUntil || ''; }
  function render() {
    var root = document.getElementById('mr-root'); if (!root) return;
    if (!ui.m) ui.m = today().slice(0, 7);
    var a = stats(ui.m), b = stats(mShift(ui.m, -1)), x = extras(), end = mEnd(ui.m), closed = closedTo() >= end, t = today();
    var k = function (label, val, d, cls) { return '<div class="mr-k ' + (cls || '') + '"><span>' + label + '</span><b>' + val + '</b>' + (d || '') + '</div>'; };
    var row = function (l) { return '<li><b>' + l[0] + '</b><span>' + l[1] + '</span>' + (l[2] ? '<em>' + l[2] + '</em>' : '') + '</li>'; };
    var closeBtn = !isAdmin() ? '' : closed ? '<span class="mr-closed">🔒 الشهر مقفول</span>'
      : (end <= t ? '<button type="button" class="btn btn-primary" onclick="AXMonth.close()">🔒 قفل ' + mName(ui.m) + '</button>' : '<span class="mr-hint">القفل بيبقى متاح من آخر يوم في الشهر</span>');
    root.innerHTML =
      '<div class="page-header mr-head"><div><h2 class="page-title">تقرير الشهر والتقفيل</h2><p class="page-subtitle">صورة كاملة للشهر في صفحة واحدة — اطبعها PDF أو اقفل الشهر</p></div>' +
        '<div class="mr-acts"><button type="button" class="btn btn-secondary" onclick="AXMonth.print()">🖨 طباعة / PDF</button>' + closeBtn + '</div></div>' +
      '<div class="mr-pick"><button type="button" onclick="AXMonth.go(-1)" aria-label="الشهر اللي فات">›</button><b>' + mName(ui.m) + '</b>' +
        '<button type="button" onclick="AXMonth.go(1)" aria-label="الشهر الجاي"' + (ui.m >= t.slice(0, 7) ? ' disabled' : '') + '>‹</button><span>مقارنة بـ ' + mName(b.m) + '</span></div>' +
      '<div class="mr-kpis">' +
        k('المبيعات', money(a.sales), delta(a.sales, b.sales), 'hi') + k('التحصيل', money(a.coll), delta(a.coll, b.coll)) +
        (a.gross != null && canGo('profit') ? k('مجمل الربح', money(a.gross), delta(a.gross, b.gross)) + k('صافي بعد المصروفات', money(a.net), delta(a.net, b.net), a.net < 0 ? 'bad' : 'ok') : '') +
        k('المصروفات', money(a.exp), delta(a.exp, b.exp, true)) + k('المشتريات', money(a.pur), delta(a.pur, b.pur, true)) +
        k('الورق المصروف', num(a.qty), delta(a.qty, b.qty)) + k('المراكز اللي سحبت', num(a.centers), delta(a.centers, b.centers)) +
      '</div>' +
      '<div class="mr-grid">' +
        '<section class="mr-box"><h3>أكبر 5 مراكز في ' + mName(ui.m) + '</h3>' + (a.top.length ? '<ol class="mr-top">' + a.top.map(function (r) {
          return '<li><b>' + esc(r.c.name) + '</b><span>مبيعات ' + money(r.sales) + ' · دفع ' + money(r.paid) + '</span><em class="' + (N(r.c.balance) > 0 ? 't-bad' : '') + '">عليه ' + money(Math.max(0, N(r.c.balance))) + '</em></li>'; }).join('') + '</ol>' : '<p class="mr-none">مفيش مبيعات في الشهر ده</p>') + '</section>' +
        '<section class="mr-box"><h3>مراكز محتاجة متابعة</h3><ul class="mr-list">' +
          (x.stopped.concat(x.late).length ? x.stopped.map(function (f) { return row([esc(f.name), 'وقف سحب من ' + f.since + ' يوم', 'وقف']); }).join('') + x.late.map(function (f) { return row([esc(f.name), (window.AXFc ? AXFc.label(f) : ''), 'متأخر']); }).join('') : '<li class="mr-none">كل المراكز ماشية على عادتها ✓</li>') +
        '</ul></section>' +
        '<section class="mr-box"><h3>أصناف راكدة</h3><ul class="mr-list">' + (x.stale.length ? x.stale.map(function (s) { return row([esc(s.p.name), num(s.p.quantity) + ' ' + esc(s.p.unit || '') + ' · من ' + s.days + ' يوم', s.value ? money(s.value) : '']); }).join('') : '<li class="mr-none">مفيش أصناف راكدة ✓</li>') + '</ul></section>' +
        '<section class="mr-box"><h3>أسعار محتاجة تتعدّل</h3><ul class="mr-list">' + (x.margins.length ? x.margins.map(function (g) { return row([esc(g.c.name), esc(g.p.name) + ' · ' + num(g.price, 2) + ' والشراء ' + num(g.cost, 2), num(g.margin, 1) + '%']); }).join('') : '<li class="mr-none">كل الأسعار فوق الهامش ✓</li>') + '</ul>' +
          (x.margins.length ? '<button type="button" class="btn btn-secondary mr-more" onclick="AXMargin.open()">راجع الأسعار</button>' : '') + '</section>' +
      '</div>' +
      '<div class="mr-foot"><span>مديونيات العملاء دلوقتي: <b>' + money(x.debt) + '</b></span><span>أصناف تحت الحد: <b>' + x.low + '</b></span>' +
        (canGo('payments') ? '<button type="button" class="btn btn-secondary" onclick="AXWeekly.open()">📨 كشوف الحساب على واتساب</button>' : '') + '</div>';
  }
  window.renderMonthly = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="mr" id="mr-root"></div>'; render();
  };
  function close() {
    var end = mEnd(ui.m);
    if (!isAdmin()) return;
    if (end > today()) { T('مينفعش تقفل شهر لسه مخلصش', 'error'); return; }
    confirmDialog('تقفل ' + mName(ui.m) + '؟ أي إضافة أو تعديل أو حذف بتاريخ لحد ' + end + ' هيحتاج موافقتك بعد كده.', function () {
      var s = S(), a = stats(ui.m);
      if (!s.closedUntil || s.closedUntil < end) s.closedUntil = end;
      s._closings = (Array.isArray(s._closings) ? s._closings : []).filter(function (c) { return c.m !== ui.m; })
        .concat([{ m: ui.m, at: Date.now(), by: user().name || '', sales: Math.round(a.sales), coll: Math.round(a.coll), exp: Math.round(a.exp) }]).slice(-36);
      DB.save(); T('اتقفل ' + mName(ui.m) + ' ✓'); render();
    });
  }

  /* the printable report (two A4 pages) */
  function print() {
    var a = stats(ui.m), b = stats(mShift(ui.m, -1)), x = extras(), s = S();
    var pct = function (p, q) { if (!q) return '—'; var v = (p - q) / Math.abs(q) * 100; return (v >= 0 ? '▲ ' : '▼ ') + num(Math.abs(v), 1) + '%'; };
    var rows = [['المبيعات', a.sales, b.sales], ['التحصيل', a.coll, b.coll]];
    if (a.gross != null && canGo('profit')) rows.push(['مجمل الربح', a.gross, b.gross], ['صافي بعد المصروفات', a.net, b.net]);
    rows.push(['المصروفات', a.exp, b.exp], ['المشتريات', a.pur, b.pur]);
    var base = location.pathname.replace(/\/[^/]*$/, '');
    var html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير ' + mName(ui.m) + '</title>' +
      '<link rel="stylesheet" href="' + location.origin + base + '/fonts/fonts.css">' +
      '<style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:"IBM Plex Sans Arabic",Cairo,Tahoma,sans-serif;color:#0b1630;margin:0;font-size:12.5px}' +
      'h1{font-size:22px;margin:0}h2{font-size:15px;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #002055;color:#002055}' +
      '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #D79613;padding-bottom:10px}.hd span{color:#47536b}' +
      'table{width:100%;border-collapse:collapse}th,td{padding:7px 8px;border-bottom:1px solid #d5dde8;text-align:right}th{background:#f1f4f9;color:#47536b;font-weight:700}' +
      'td.n{font-variant-numeric:tabular-nums;font-weight:700}.pb{page-break-before:always}.ft{margin-top:16px;color:#737e95;font-size:11px}</style></head><body>' +
      '<div class="hd"><div><h1>' + esc(s.companyName || 'نظام الحسابات') + '</h1><span>تقرير شهر ' + mName(ui.m) + '</span></div><span>اتطبع ' + today() + (closedTo() >= mEnd(ui.m) ? ' · الشهر مقفول' : '') + '</span></div>' +
      '<h2>الأرقام مقارنة بـ ' + mName(b.m) + '</h2><table><tr><th>البند</th><th>' + mName(ui.m) + '</th><th>' + mName(b.m) + '</th><th>التغيير</th></tr>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="n">' + money(r[1]) + '</td><td class="n">' + money(r[2]) + '</td><td class="n">' + pct(r[1], r[2]) + '</td></tr>'; }).join('') +
      '<tr><td>الورق المصروف</td><td class="n">' + num(a.qty) + '</td><td class="n">' + num(b.qty) + '</td><td class="n">' + pct(a.qty, b.qty) + '</td></tr>' +
      '<tr><td>عدد العمليات</td><td class="n">' + a.ops + '</td><td class="n">' + b.ops + '</td><td class="n">' + pct(a.ops, b.ops) + '</td></tr></table>' +
      '<h2>أكبر 5 مراكز</h2><table><tr><th>المركز</th><th>المبيعات</th><th>اتحصّل</th><th>عليه دلوقتي</th></tr>' +
      (a.top.length ? a.top.map(function (r) { return '<tr><td>' + esc(r.c.name) + '</td><td class="n">' + money(r.sales) + '</td><td class="n">' + money(r.paid) + '</td><td class="n">' + money(Math.max(0, N(r.c.balance))) + '</td></tr>'; }).join('') : '<tr><td colspan="4">مفيش مبيعات</td></tr>') + '</table>' +
      '<p class="ft">مديونيات العملاء دلوقتي: ' + money(x.debt) + ' · أصناف تحت الحد: ' + x.low + '</p>' +
      '<div class="pb"></div><h2>مراكز محتاجة متابعة</h2><table><tr><th>المركز</th><th>الحالة</th></tr>' +
      (x.stopped.concat(x.late).length ? x.stopped.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td>وقف سحب من ' + f.since + ' يوم</td></tr>'; }).join('') + x.late.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td>' + esc(window.AXFc ? AXFc.label(f) : '') + '</td></tr>'; }).join('') : '<tr><td colspan="2">كل المراكز ماشية على عادتها</td></tr>') + '</table>' +
      '<h2>أصناف راكدة</h2><table><tr><th>الصنف</th><th>الكمية</th><th>بلا بيع من</th><th>القيمة</th></tr>' +
      (x.stale.length ? x.stale.map(function (r) { return '<tr><td>' + esc(r.p.name) + '</td><td class="n">' + num(r.p.quantity) + ' ' + esc(r.p.unit || '') + '</td><td>' + r.days + ' يوم</td><td class="n">' + money(r.value) + '</td></tr>'; }).join('') : '<tr><td colspan="4">مفيش</td></tr>') + '</table>' +
      '<h2>أسعار هامشها قليل أو بخسارة</h2><table><tr><th>المركز</th><th>الصنف</th><th>سعره</th><th>آخر شراء</th><th>الهامش</th></tr>' +
      (x.margins.length ? x.margins.map(function (g) { return '<tr><td>' + esc(g.c.name) + '</td><td>' + esc(g.p.name) + '</td><td class="n">' + num(g.price, 2) + '</td><td class="n">' + num(g.cost, 2) + '</td><td class="n">' + num(g.margin, 1) + '%</td></tr>'; }).join('') : '<tr><td colspan="5">كل الأسعار فوق الهامش</td></tr>') + '</table>' +
      '<p class="ft">تقرير آلي</p><script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
    var w = window.open('', '_blank');
    if (!w) { T('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'error'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ════════ 2 · weekly WhatsApp statements ════════ */
  function sentMap() { var m = S()._stmtWeek; return m && typeof m === 'object' ? m : {}; }
  function sentRecently(cid) { var d = sentMap()[cid]; return !!(d && diff(d, today()) < 6); }
  function due() {
    return A('customers').filter(function (c) { return N(c.balance) > 0.5 && phoneOf(c); })
      .sort(function (a, b) { return N(b.balance) - N(a.balance); });
  }
  function text(cid) {
    if (window.AXAging && AXAging.stmtText) return AXAging.stmtText(cid);
    var c = A('customers').find(function (x) { return x.id === cid; }) || {};
    return 'السلام عليكم ' + (c.name || '') + ' 🌿\nالمستحق عليكم عندنا لحد النهارده: ' + money(c.balance) + '\nشكراً لتعاملكم معانا 🙏';
  }
  function send(cid) {
    var c = A('customers').find(function (x) { return x.id === cid; }); if (!c) return;
    var ph = phoneOf(c); if (!ph) { T('رقم التليفون مش صحيح', 'error'); return; }
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(text(cid)), '_blank');
    var m = Object.assign({}, sentMap()); m[cid] = today(); S()._stmtWeek = m; DB.save();
    if (document.getElementById('wk-list')) openW();
    try { if (typeof updateNotifBadge === 'function') updateNotifBadge(); } catch (e) {}
  }
  function next() { var c = due().find(function (x) { return !sentRecently(x.id); }); if (c) send(c.id); else T('كله اتبعتله الأسبوع ده ✓'); }
  function openW() {
    var l = due(), left = l.filter(function (c) { return !sentRecently(c.id); }), nx = left[0];
    var body = '<p class="ax-modal-lead">كل مركز عليه فلوس وليه تليفون. «ابعت للي بعده» يفتح واتساب برسالة كشف الحساب جاهزة لأول مركز لسه متبعتلوش — دوس إرسال في واتساب وارجع هنا للي بعده.</p>' +
      '<div class="wk-head"><b>' + (l.length - left.length) + ' من ' + l.length + '</b><span>اتبعتلهم الأسبوع ده</span><i><u style="width:' + (l.length ? Math.round((l.length - left.length) / l.length * 100) : 0) + '%"></u></i></div>' +
      (nx ? '<button type="button" class="btn btn-primary wk-next" onclick="AXWeekly.next()">ابعت للي بعده: ' + esc(nx.name) + '</button>' : '<p class="wk-done">✓ كله اتبعتله الأسبوع ده</p>') +
      (l.length ? '<ul class="wk-list" id="wk-list">' + l.map(function (c) {
        var done = sentRecently(c.id);
        return '<li class="' + (done ? 'done' : '') + '"><div><b>' + esc(c.name) + '</b><span>' + money(c.balance) + (done ? ' · اتبعت ' + sentMap()[c.id] : '') + '</span></div><button type="button" onclick="AXWeekly.send(\'' + c.id + '\')">' + (done ? 'تاني' : 'ابعت') + '</button></li>';
      }).join('') + '</ul>' : '<p class="wk-done">مفيش مراكز عليها فلوس وليها تليفون</p>');
    openModal('📨 كشوف الحساب الأسبوعية', body, '<button class="btn btn-ghost" onclick="closeModal()">خلصت</button>', 'large');
  }
  (window.AXNSources = window.AXNSources || []).push(function () {
    if (!canGo('payments')) return [];
    var wd = pd(today()).getDay(); if (wd !== 4 && wd !== 5 && wd !== 6) return [];   // Thursday → Saturday
    var left = due().filter(function (c) { return !sentRecently(c.id); }); if (!left.length) return [];
    return [{ id: 'wk:' + today().slice(0, 7) + ':' + Math.floor(pd(today()).getDate() / 7), sig: left.length, cat: 'money', sev: 2, ic: 'money',
      title: 'كشوف الحساب الأسبوعية', sub: left.length + ' مركز عليه فلوس لسه متبعتلوش كشف حساب الأسبوع ده', amt: '', tag: 'كل خميس',
      go: function () { openW(); }, acts: [{ l: 'ابعت الكشوف', pri: 1, fn: function () { openW(); } }] }];
  });
  /* a button in «التحصيل والمديونيات» */
  var _rp = window.renderPayments;
  if (typeof _rp === 'function' && !_rp._wk) {
    var w = function () {
      var r = _rp.apply(this, arguments);
      try { var bar = document.querySelector('#page-content .section-action-bar'); if (bar && !document.getElementById('wk-btn')) bar.insertAdjacentHTML('beforeend', '<button class="btn btn-secondary" id="wk-btn" onclick="AXWeekly.open()">📨 كشوف الأسبوع على واتساب</button>'); } catch (e) {}
      return r;
    };
    w._wk = 1; window.renderPayments = w;
  }

  window.AXMonth = { render: window.renderMonthly, stats: stats, print: print, close: close, go: function (k) { var n = mShift(ui.m || today().slice(0, 7), k); if (n > today().slice(0, 7)) return; ui.m = n; render(); }, set: function (m) { ui.m = m; render(); } };
  window.AXWeekly = { open: openW, send: send, next: next, due: due, sentRecently: sentRecently };
})();

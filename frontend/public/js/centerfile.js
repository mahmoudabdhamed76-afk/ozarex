/* ════════════════════════════════════════════════════════════════════
   ERP · «ملف المركز» (5.05) — بروفايل كامل لكل مركز في شاشة واحدة
   بيتفتح من: البحث فوق (أي مركز) · «العملاء والمراكز» (اسم المركز أو 🪪)
   فيه:
     · الهيدر: الاسم والشركة والتليفون والعنوان + الباقي عليه وحده الائتماني
     · مؤشرات: المسحوب · المدفوع · عدد الطلبات · آخر توريد · آخر تحصيل · أقدم مبلغ مش متسدد
     · «نظرة عامة»: وردنا إيه (كل نوع ورق بكميته ومبلغه وآخر مرة) + آخر 6 شهور + آخر الحركات
     · «التوريدات»: كل طلب (البيعة اللي فيها كذا نوع = كارت واحد) بحالته، ومنه 👁 و✏️ لكل سطر
     · «التحصيلات» · «الفواتير» · «البيانات» (بيانات المركز وأسعاره الخاصة)
     · «💹 الربح» (5.06 — لمين عنده «أرباحي» بس): الإيرادات والتكلفة والربح والهامش منه، ومقارنة بمتوسط
       كل المراكز وترتيبه بينهم، وربح كل نوع ورق (متوسط سعر البيع والتكلفة والهامش) + تنبيه للبيع تحت التكلفة
       والأصناف اللي مالهاش تكلفة. بنفس حسبة «أرباحي» بالظبط (AXProfit.lines) فالرقمين بيطلعوا زي بعض
   ومنه على طول: ✏️ تعديل البيانات · 💰 تحصيل · 📋 صرف جديد · 📄 كشف الحساب · واتساب
   أي تعديل من جوه الملف (تعديل صرف، تحصيل، بيانات) بيرجع يحدّث الملف لوحده.
   كل تاب بيظهر لمين صلاحياته بتوريه الصفحة دي بس.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ID = 'axcf', ui = { id: null, tab: 'over', f: 'all', q: '', pp: 'all' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { return Number(Math.round(N(n))).toLocaleString('en-US') + ' ' + cur(); }
  function cur() { var c = (D().settings || {}).currency || 'جنيه'; return c === 'جنيه' ? 'ج' : c; }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function days(a) { return Math.max(0, Math.round((pd(today()) - pd(a)) / 86400000)); }
  function ago(a) { if (!a) return ''; var n = days(a); return n === 0 ? 'النهارده' : n === 1 ? 'امبارح' : n === 2 ? 'من يومين' : n <= 10 ? 'من ' + n + ' أيام' : n < 60 ? 'من ' + n + ' يوم' : 'من ' + Math.round(n / 30) + ' شهر'; }
  function dfmt(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : esc(s || ''); }
  function canGo(p) { try { return typeof can !== 'function' || can(p); } catch (e) { return false; } }
  function isAdmin() { try { return currentUser && currentUser.role === 'admin'; } catch (e) { return false; } }
  function initials(name) {
    var w = String(name || '').replace(/^(مركز|معمل|عيادة|مستشفى|مستشفي|د\.?|دكتور)\s+/, '').trim().split(/\s+/).map(function (x) { return x.replace(/^ال(?=..)/, ''); });
    return esc(((w[0] || '')[0] || '') + ((w[1] || '')[0] || '')) || '🏥';
  }
  function phone(c) { try { return typeof normalizeEgyptianPhone === 'function' ? normalizeEgyptianPhone(c.phone) : String(c.phone || '').replace(/\D/g, ''); } catch (e) { return ''; } }
  var METHOD = { cash: 'نقدي', transfer: 'تحويل', bank: 'تحويل بنكي', cheque: 'شيك', check: 'شيك', wallet: 'محفظة', vodafone: 'فودافون كاش', instapay: 'إنستاباي', card: 'كارت' };
  function method(m) { return METHOD[String(m || '').toLowerCase()] || m || ''; }
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  /* ── everything about one center ── */
  function model(id) {
    var c = A('customers').find(function (x) { return x && x.id === id; });
    if (!c) return null;
    var iss = A('issuances').filter(function (i) { return i && i.customerId === id; });
    var linked = {};
    iss.forEach(function (i) { if (i.invoiceId) linked[i.invoiceId] = 1; });
    var invs = A('invoices').filter(function (v) { return v && v.customerId === id; });
    var direct = invs.filter(function (v) { return !linked[v.id] && !v.isConsolidated && !v.fromIssuance; });
    var pays = A('payments').filter(function (p) { return p && p.customerId === id; })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || N(b.createdAt) - N(a.createdAt); });
    var rets = [];
    try { rets = (window.AXBStats ? AXBStats.rets(D()) : []).filter(function (r) { return r.type === 'sale' && r.customerId === id; }); } catch (e) {}

    /* one sale = same number + day (a sale with several paper types is one card) */
    var sales = {}, order = [];
    iss.forEach(function (i) {
      var k = 'i' + i.number + '|' + String(i.date || '').slice(0, 10);
      if (!sales[k]) { sales[k] = { key: k, kind: 'iss', number: i.number, date: i.date, ts: N(i.createdAt), lines: [], total: 0, paid: 0 }; order.push(sales[k]); }
      var g = sales[k]; g.lines.push(i); g.total += N(i.total); g.paid += Math.min(N(i.paid), N(i.total)); g.ts = Math.max(g.ts, N(i.createdAt));
    });
    direct.forEach(function (v) {
      var g = { key: 'v' + v.id, kind: 'inv', inv: v, number: v.number, date: v.date, ts: N(v.createdAt), total: N(v.total), paid: Math.min(N(v.paid), N(v.total)),
        lines: (v.items || []).map(function (it) { return { productId: it.productId, productName: it.productName || it.name || 'صنف', quantity: N(it.qty != null ? it.qty : it.quantity), total: N(it.total), productUnit: it.unit || '' }; }) };
      order.push(g);
    });
    order.forEach(function (g) { g.rem = Math.max(0, Math.round((g.total - g.paid) * 100) / 100); g.st = g.rem <= 0.5 ? 'paid' : g.paid > 0.5 ? 'part' : 'open'; });
    order.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || b.ts - a.ts; });

    /* what we supplied, per paper type */
    var byP = {}, P = {};
    A('products').forEach(function (p) { if (p) P[p.id] = p; });
    order.forEach(function (g) {
      g.lines.forEach(function (l) {
        var k = l.productId || l.productName, p = P[l.productId];
        if (!byP[k]) byP[k] = { id: l.productId, name: (p && p.name) || l.productName || 'صنف', unit: (p && p.unit) || l.productUnit || '', qty: 0, total: 0, last: '', times: 0 };
        var b = byP[k]; b.qty += N(l.quantity); b.total += N(l.total); b.times++; if (String(g.date) > b.last) b.last = String(g.date || '');
      });
    });
    var papers = Object.keys(byP).map(function (k) { return byP[k]; }).sort(function (a, b) { return b.total - a.total; });

    /* last 6 months: supplied vs collected */
    var now = pd(today()), months = [];
    for (var m = 5; m >= 0; m--) { var d = new Date(now.getFullYear(), now.getMonth() - m, 1); months.push({ k: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), l: MONTHS[d.getMonth()], took: 0, paid: 0 }); }
    var mi = {}; months.forEach(function (x, i) { mi[x.k] = i; });
    order.forEach(function (g) { var i = mi[String(g.date || '').slice(0, 7)]; if (i != null) months[i].took += g.total; });
    pays.forEach(function (p) { var i = mi[String(p.date || '').slice(0, 7)]; if (i != null) months[i].paid += N(p.amount); });

    /* activity timeline */
    var ev = [];
    order.slice(0, 12).forEach(function (g) { ev.push({ d: g.date, ts: g.ts, ic: '📦', t: (g.kind === 'inv' ? 'فاتورة #' : 'توريد #') + g.number, s: g.lines.map(function (l) { return l.productName + ' × ' + num(l.quantity); }).slice(0, 2).join('، ') + (g.lines.length > 2 ? ' +' + (g.lines.length - 2) : ''), v: g.total, tone: 'out' }); });
    pays.slice(0, 12).forEach(function (p) { ev.push({ d: p.date, ts: N(p.createdAt), ic: '💰', t: 'تحصيل', s: [method(p.method), p.note].filter(Boolean).join(' · '), v: N(p.amount), tone: 'in' }); });
    rets.slice(0, 6).forEach(function (r) { ev.push({ d: r.date, ts: N(r.at), ic: '↩️', t: 'مرتجع #' + r.number, s: (r.src && r.src.label) || '', v: N(r.amount), tone: 'in' }); });
    ev.sort(function (a, b) { return String(b.d || '').localeCompare(String(a.d || '')) || b.ts - a.ts; });

    var took = order.reduce(function (t, g) { return t + g.total; }, 0);
    var qty = order.reduce(function (t, g) { return t + g.lines.reduce(function (s, l) { return s + N(l.quantity); }, 0); }, 0);
    var oldest = null;
    try { oldest = window.AXCredit && AXCredit.oldestUnpaid ? AXCredit.oldestUnpaid(id) : null; } catch (e) {}
    if (!oldest) { var op = order.filter(function (g) { return g.st !== 'paid'; }); if (op.length) oldest = op[op.length - 1].date; }
    var avgMonth = (function () { var act = months.filter(function (x) { return x.took > 0; }); return act.length ? act.reduce(function (t, x) { return t + x.took; }, 0) / act.length : 0; })();
    return { c: c, sales: order, pays: pays, invs: invs.slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }), rets: rets, papers: papers, months: months, ev: ev.slice(0, 10),
      took: took, paid: pays.reduce(function (t, p) { return t + N(p.amount); }, 0), qty: qty, bal: N(c.balance), limit: N(c.creditLimit),
      lastSale: order[0] || null, lastPay: pays[0] || null, oldest: oldest, avgMonth: avgMonth, open: order.filter(function (g) { return g.st !== 'paid'; }).length };
  }

  /* ── pieces ── */
  var ST = { paid: ['مسدد', 'ok'], part: ['جزئي', 'warn'], open: ['مش متسدد', 'bad'] };
  function chip(st, rem) { var s = ST[st]; return '<span class="axcf-chip ' + s[1] + '">' + s[0] + (st === 'part' ? ' · باقي ' + money(rem) : '') + '</span>'; }
  function kpi(l, v, sub, tone) { return '<div class="axcf-kpi' + (tone ? ' ' + tone : '') + '"><span>' + l + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
  function empty(ic, t) { return '<div class="axcf-empty"><i>' + ic + '</i><p>' + t + '</p></div>'; }

  function head(M) {
    var c = M.c, ph = phone(c), over = M.limit > 0 && M.bal > M.limit, pct = M.limit > 0 ? Math.min(100, Math.round(M.bal / M.limit * 100)) : 0;
    var od = M.oldest && M.bal > 0 ? days(M.oldest) : 0;
    var acts = [
      '<button type="button" class="axcf-act" data-a="edit"><i>✏️</i>تعديل البيانات</button>',
      canGo('payments') ? '<button type="button" class="axcf-act pri" data-a="pay"><i>💰</i>تحصيل</button>' : '',
      canGo('issuances') ? '<button type="button" class="axcf-act" data-a="iss"><i>📋</i>صرف جديد</button>' : '',
      '<button type="button" class="axcf-act" data-a="stmt"><i>📄</i>كشف الحساب</button>',
      ph ? '<a class="axcf-act wa" href="https://wa.me/' + esc(ph) + '" target="_blank" rel="noopener"><i>💬</i>واتساب</a>' : ''
    ].join('');
    return '<header class="axcf-head">' +
      '<div class="axcf-bar"><button type="button" class="axcf-x" data-a="close" aria-label="رجوع">→</button><span>ملف المركز</span><span></span></div>' +
      '<div class="axcf-id"><div class="axcf-av">' + initials(c.name) + '</div><div class="axcf-nm"><h2>' + esc(c.name) + '</h2>' +
        '<p>' + [c.company ? esc(c.company) : '', c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '', c.address ? esc(c.address) : ''].filter(Boolean).join(' · ') + '</p>' +
        '<div class="axcf-tags">' + (M.bal > 0 ? '<span class="axcf-chip bad">عليه ' + money(M.bal) + '</span>' : M.bal < 0 ? '<span class="axcf-chip ok">ليه ' + money(-M.bal) + '</span>' : '<span class="axcf-chip ok">مسدد بالكامل</span>') +
        (over ? '<span class="axcf-chip bad">⚠️ متجاوز الحد</span>' : '') + (od >= 30 ? '<span class="axcf-chip warn">أقدم مبلغ ' + ago(M.oldest) + '</span>' : '') +
        (M.lastSale ? '<span class="axcf-chip">آخر توريد ' + ago(M.lastSale.date) + '</span>' : '<span class="axcf-chip">لسه ماتوردلوش</span>') + '</div></div></div>' +
      '<div class="axcf-bal"><div><span>الباقي عليه</span><b class="' + (M.bal > 0 ? 'bad' : 'ok') + '">' + money(M.bal) + '</b></div>' +
        (M.limit > 0 ? '<div class="axcf-lim"><div class="axcf-meter"><i style="width:' + pct + '%" class="' + (over ? 'bad' : pct > 75 ? 'warn' : 'ok') + '"></i></div><small>' + pct + '% من الحد الائتماني (' + money(M.limit) + ')</small></div>' : '<div class="axcf-lim"><small>مافيش حد ائتماني متحدد</small></div>') + '</div>' +
      '<div class="axcf-acts">' + acts + '</div>' +
    '</header>';
  }

  function tabs(M) {
    var T = [['over', 'نظرة عامة', ''], ['sales', 'التوريدات', M.sales.length], canGo('payments') || isAdmin() ? ['pays', 'التحصيلات', M.pays.length] : null,
      canGo('invoices') ? ['invs', 'الفواتير', M.invs.length] : null, canProfit() ? ['profit', '💹 الربح', ''] : null, ['info', 'البيانات', '']].filter(Boolean);
    if (!T.some(function (t) { return t[0] === ui.tab; })) ui.tab = 'over';
    return '<nav class="axcf-tabs" role="tablist">' + T.map(function (t) { return '<button type="button" role="tab" data-t="' + t[0] + '" class="' + (ui.tab === t[0] ? 'on' : '') + '" aria-selected="' + (ui.tab === t[0]) + '">' + t[1] + (t[2] !== '' ? ' <em>' + t[2] + '</em>' : '') + '</button>'; }).join('') + '</nav>';
  }

  function over(M) {
    var maxP = M.papers.reduce(function (t, p) { return Math.max(t, p.total); }, 0) || 1;
    var maxM = M.months.reduce(function (t, x) { return Math.max(t, x.took, x.paid); }, 0) || 1;
    return '<div class="axcf-kpis">' +
      kpi('إجمالي المسحوب', money(M.took), num(M.qty) + ' وحدة · ' + M.sales.length + ' طلب') +
      kpi('إجمالي المدفوع', money(M.paid), M.pays.length + ' تحصيل', 'ok') +
      kpi('آخر توريد', M.lastSale ? dfmt(M.lastSale.date) : '—', M.lastSale ? ago(M.lastSale.date) + ' · ' + money(M.lastSale.total) : '') +
      kpi('آخر تحصيل', M.lastPay ? dfmt(M.lastPay.date) : '—', M.lastPay ? ago(M.lastPay.date) + ' · ' + money(M.lastPay.amount) : 'مادفعش لسه', M.lastPay ? '' : 'warn') +
      kpi('طلبات مش متسددة', String(M.open), M.oldest && M.bal > 0 ? 'أقدمها ' + ago(M.oldest) : 'كله مسدد', M.open ? 'bad' : 'ok') +
      kpi('متوسط شهري', money(M.avgMonth), 'آخر 6 شهور') +
    '</div>' + profitStrip(M) +
    '<section class="axcf-card"><h3>📦 وردنا له إيه</h3>' + (M.papers.length ? '<div class="axcf-papers">' + M.papers.map(function (p) {
      var cp = M.c.customPrices && p.id && M.c.customPrices[p.id] != null ? M.c.customPrices[p.id] : null;
      return '<div class="axcf-pp"><div class="axcf-pp-t"><b>' + esc(p.name) + '</b><span>' + money(p.total) + '</span></div>' +
        '<div class="axcf-meter thin"><i style="width:' + Math.max(3, Math.round(p.total / maxP * 100)) + '%"></i></div>' +
        '<small>' + num(p.qty) + ' ' + esc(p.unit) + ' · ' + p.times + ' مرة · آخر مرة ' + dfmt(p.last) + (cp != null ? ' · سعره الخاص ' + num(cp) + ' ' + cur() : '') + '</small></div>';
    }).join('') + '</div>' : empty('📦', 'لسه ماتوردلوش حاجة')) + '</section>' +
    '<section class="axcf-card"><h3>📅 آخر 6 شهور</h3><div class="axcf-chart" role="img" aria-label="المسحوب والمدفوع آخر 6 شهور">' + M.months.map(function (x) {
      return '<div class="axcf-col" title="' + x.l + ': مسحوب ' + money(x.took) + ' · مدفوع ' + money(x.paid) + '"><div class="axcf-bars"><i class="t" style="height:' + Math.round(x.took / maxM * 100) + '%"></i><i class="p" style="height:' + Math.round(x.paid / maxM * 100) + '%"></i></div><span>' + x.l + '</span></div>';
    }).join('') + '</div><div class="axcf-legend"><span><i class="t"></i>مسحوب</span><span><i class="p"></i>مدفوع</span></div></section>' +
    '<section class="axcf-card"><h3>🕘 آخر الحركات</h3>' + (M.ev.length ? '<ul class="axcf-tl">' + M.ev.map(function (e) {
      return '<li><i>' + e.ic + '</i><div><b>' + esc(e.t) + '</b><small>' + dfmt(e.d) + (e.s ? ' · ' + esc(e.s) : '') + '</small></div><span class="' + e.tone + '">' + (e.tone === 'in' ? '−' : '+') + money(e.v) + '</span></li>';
    }).join('') + '</ul>' : empty('🕘', 'مافيش حركات')) + '</section>';
  }

  function salesTab(M) {
    var q = ui.q.trim().toLowerCase();
    var list = M.sales.filter(function (g) {
      if (ui.f === 'open' && g.st === 'paid') return false;
      if (ui.f === 'paid' && g.st !== 'paid') return false;
      if (q && !g.lines.some(function (l) { return String(l.productName || '').toLowerCase().indexOf(q) >= 0; }) && String(g.number).indexOf(q) < 0) return false;
      return true;
    });
    var F = [['all', 'الكل', M.sales.length], ['open', 'مش متسدد', M.open], ['paid', 'متسدد', M.sales.length - M.open]];
    var canEditIss = canGo('issuances');
    return '<div class="axcf-tools"><div class="axcf-seg">' + F.map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (ui.f === f[0] ? 'on' : '') + '">' + f[1] + ' <em>' + f[2] + '</em></button>'; }).join('') + '</div>' +
      '<input class="axcf-q" id="axcf-q" placeholder="دوّر بالورق أو الرقم…" value="' + esc(ui.q) + '"></div>' +
      (list.length ? '<div class="axcf-sales">' + list.map(function (g) {
        return '<article class="axcf-sale st-' + g.st + '"><div class="axcf-sale-h"><div><b>' + (g.kind === 'inv' ? 'فاتورة' : 'توريد') + ' #' + esc(g.number) + '</b><small>' + dfmt(g.date) + ' · ' + ago(g.date) + '</small></div>' + chip(g.st, g.rem) + '</div>' +
          '<ul>' + g.lines.map(function (l) {
            var acts = g.kind === 'iss' ? '<span class="axcf-la">' + (window.viewIssuance ? '<button type="button" title="عرض" data-a="vi" data-id="' + esc(l.id) + '">👁</button>' : '') + (canEditIss && window.editIssuance ? '<button type="button" title="تعديل (نوع الورق، الكمية، السعر)" data-a="ei" data-id="' + esc(l.id) + '">✏️</button>' : '') + '</span>'
              : '';
            return '<li><span class="n">' + esc(l.productName) + '</span><span class="q">' + num(l.quantity) + ' ' + esc(l.productUnit || '') + '</span><span class="v">' + money(l.total) + '</span>' + acts + '</li>';
          }).join('') + '</ul>' +
          '<div class="axcf-sale-f"><span>الإجمالي <b>' + money(g.total) + '</b></span>' + (g.paid > 0 && g.st !== 'paid' ? '<span>اتدفع ' + money(g.paid) + '</span>' : '') +
          (g.kind === 'inv' && window.viewInvoice ? '<button type="button" class="axcf-lnk" data-a="vv" data-id="' + esc(g.inv.id) + '">عرض الفاتورة</button>' : '') + '</div></article>';
      }).join('') + '</div>' : empty('📋', q || ui.f !== 'all' ? 'مافيش نتايج' : 'لسه ماتوردلوش حاجة'));
  }

  function paysTab(M) {
    if (!M.pays.length) return empty('💰', 'مادفعش أي تحصيل لسه');
    return '<div class="axcf-list">' + M.pays.map(function (p) {
      return '<div class="axcf-row"><i class="ok">💰</i><div><b>' + money(p.amount) + '</b><small>' + dfmt(p.date) + ' · ' + ago(p.date) + (p.method ? ' · ' + esc(method(p.method)) : '') + (p.reference ? ' · ' + esc(p.reference) : '') + '</small>' + (p.note ? '<small>' + esc(p.note) + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  function invsTab(M) {
    if (!M.invs.length) return empty('📄', 'مافيش فواتير');
    return '<div class="axcf-list">' + M.invs.map(function (v) {
      var rem = Math.max(0, N(v.total) - N(v.paid)), st = rem <= 0.5 ? 'paid' : N(v.paid) > 0.5 ? 'part' : 'open';
      return '<button type="button" class="axcf-row btn-row" data-a="vv" data-id="' + esc(v.id) + '"><i>📄</i><div><b>فاتورة #' + esc(v.number) + (v.isConsolidated ? ' · مجمّعة' : '') + '</b><small>' + dfmt(v.date) + ' · ' + (v.items || []).length + ' صنف</small></div><span class="axcf-rv"><b>' + money(v.total) + '</b>' + chip(st, rem) + '</span></button>';
    }).join('') + '</div>';
  }

  function infoTab(M) {
    var c = M.c, P = A('products').filter(function (p) { return p && !p.archived; });
    var cps = c.customPrices || {}, special = P.filter(function (p) { return cps[p.id] != null && cps[p.id] !== ''; });
    var row = function (l, v) { return v ? '<div class="axcf-kv"><span>' + l + '</span><b>' + v + '</b></div>' : ''; };
    return '<section class="axcf-card"><h3>🪪 بيانات المركز</h3>' +
      row('الاسم', esc(c.name)) + row('الشركة', esc(c.company || '')) + row('التليفون', c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '') +
      row('العنوان', esc(c.address || '')) + row('الحد الائتماني', M.limit ? money(M.limit) : 'مش متحدد') + row('الرصيد', money(M.bal)) +
      row('عميل من', c.createdAt ? dfmt(new Date(N(c.createdAt)).toISOString().slice(0, 10)) : '') + row('ملاحظات', esc(c.notes || c.note || '')) +
      '<button type="button" class="axcf-wide" data-a="edit">✏️ تعديل بيانات المركز</button></section>' +
      '<section class="axcf-card"><h3>🏷️ أسعاره الخاصة</h3>' + (special.length ? '<div class="axcf-list">' + special.map(function (p) {
        return '<div class="axcf-kv"><span>' + esc(p.name) + '</span><b>' + num(cps[p.id]) + ' ' + cur() + ' <small>(العادي ' + num(p.price) + ')</small></b></div>';
      }).join('') + '</div>' : '<p class="axcf-note">بيتحاسب بالأسعار العادية — الأسعار الخاصة بتتحط من «تعديل بيانات المركز».</p>') + '</section>';
  }

  /* ── 5.06 · profit from one center — the same lines «أرباحي» counts (current item cost × qty, returns minus) ── */
  function canProfit() { return canGo('profit') && !!(window.AXProfit && AXProfit.lines); }
  var PP = [['all', 'من الأول'], ['year', 'السنة دي'], ['3m', 'آخر 3 شهور']];
  function ppFrom(pp) {
    var t = pd(today());
    if (pp === 'year') return t.getFullYear() + '-01-01';
    if (pp === '3m') { var d = new Date(t.getFullYear(), t.getMonth() - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }
    return '';
  }
  function profitModel(id, pp) {
    if (!canProfit()) return null;
    var from = ppFrom(pp), all;
    try { all = AXProfit.lines().filter(function (l) { return !from || l.date >= from; }); } catch (e) { return null; }
    var mine = all.filter(function (l) { return l.cid === id; });
    var sum = function (ls) { var r = { rev: 0, cost: 0, qty: 0 }; ls.forEach(function (l) { r.rev += l.rev; r.cost += l.cost; r.qty += l.qty; }); r.profit = r.rev - r.cost; r.margin = r.rev ? r.profit / r.rev * 100 : 0; return r; };
    var me = sum(mine), co = sum(all);
    /* rank among the centers that bought in the same period, by profit */
    var byC = {};
    all.forEach(function (l) { if (!l.cid) return; var g = byC[l.cid] || (byC[l.cid] = 0); byC[l.cid] = g + l.rev - l.cost; });
    var ranked = Object.keys(byC).sort(function (a, b) { return byC[b] - byC[a]; });
    var P = {};
    mine.forEach(function (l) {
      var g = P[l.pid] || (P[l.pid] = { pid: l.pid, name: l.name, qty: 0, rev: 0, cost: 0, sold: 0, below: 0, noCost: 0 });
      g.qty += l.qty; g.rev += l.rev; g.cost += l.cost;
      if (!l.ret) { g.sold += l.qty; if (l.noCost) g.noCost++; else if (l.rev < l.cost - 0.01) g.below++; }
    });
    var papers = Object.keys(P).map(function (k) { var g = P[k]; g.profit = g.rev - g.cost; g.margin = g.rev ? g.profit / g.rev * 100 : 0; g.avgP = g.qty ? g.rev / g.qty : 0; g.avgC = g.qty ? g.cost / g.qty : 0; return g; })
      .sort(function (a, b) { return b.profit - a.profit; });
    return { me: me, co: co, papers: papers, rank: ranked.indexOf(id) + 1, centers: ranked.length,
      noCost: papers.filter(function (g) { return g.noCost; }), below: papers.filter(function (g) { return g.below; }),
      returns: -mine.filter(function (l) { return l.ret; }).reduce(function (t, l) { return t + l.rev; }, 0), n: mine.filter(function (l) { return !l.ret; }).length };
  }
  function pct(v) { return (Math.round(v * 10) / 10).toLocaleString('en-US') + '%'; }
  function profitStrip(M) {
    var R = profitModel(M.c.id, 'all');
    if (!R || !R.n) return '';
    return '<button type="button" class="axcf-pstrip ' + (R.me.profit < 0 ? 'bad' : '') + '" data-t="profit"><i>💹</i><span>ربحنا منه <b>' + money(R.me.profit) + '</b> · هامش <b>' + pct(R.me.margin) + '</b>' +
      (R.centers > 1 ? ' · ترتيبه <b>' + R.rank + '</b> من ' + R.centers : '') + '</span><em>التفاصيل ←</em></button>';
  }
  function profitTab(M) {
    var R = profitModel(M.c.id, ui.pp);
    var seg = '<div class="axcf-tools"><div class="axcf-seg">' + PP.map(function (x) { return '<button type="button" data-pp="' + x[0] + '" class="' + (ui.pp === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    if (!R || !R.n) return seg + empty('💹', 'مافيش مبيعات للمركز ده في الفترة دي');
    var me = R.me, diff = me.margin - R.co.margin, maxAbs = R.papers.reduce(function (t, g) { return Math.max(t, Math.abs(g.margin)); }, 0) || 1;
    var cmp = R.co.rev ? '<span class="axcf-chip ' + (diff >= 0 ? 'ok' : 'warn') + '">' + (Math.abs(diff) < 0.5 ? 'زي متوسط المراكز' : (diff > 0 ? 'أعلى' : 'أقل') + ' من متوسط المراكز بـ ' + pct(Math.abs(diff))) + '</span>' : '';
    var warn = '';
    if (R.below.length) warn += '<div class="axcf-alert bad">🔻 <b>بيتباع تحت التكلفة:</b> ' + R.below.map(function (g) { return esc(g.name) + ' (متوسط البيع ' + num(Math.round(g.avgP * 100) / 100) + ' والتكلفة ' + num(Math.round(g.avgC * 100) / 100) + ')'; }).join('، ') + '</div>';
    if (R.noCost.length) warn += '<div class="axcf-alert warn">⚠️ <b>' + R.noCost.length + ' صنف مالوش تكلفة متسجلة</b> (' + R.noCost.map(function (g) { return esc(g.name); }).join('، ') + ') — ربحه محسوب كامل، فالربح هنا أعلى من الحقيقي. حط التكلفة من «المخازن».</div>';
    return seg +
      '<div class="axcf-kpis">' +
        kpi('الإيرادات منه', money(me.rev), num(me.qty) + ' وحدة' + (R.returns ? ' · بعد مرتجع ' + money(R.returns) : '')) +
        kpi('تكلفة البضاعة', money(me.cost), pct(me.rev ? me.cost / me.rev * 100 : 0) + ' من الإيرادات') +
        kpi('الربح منه', money(me.profit), R.centers > 1 ? 'ترتيبه ' + R.rank + ' من ' + R.centers + ' مركز' : '', me.profit < 0 ? 'bad' : 'ok') +
        '<div class="axcf-kpi' + (me.margin < 0 ? ' bad' : '') + '"><span>هامش الربح</span><b>' + pct(me.margin) + '</b><small>متوسط كل المراكز ' + pct(R.co.margin) + '</small>' + cmp + '</div>' +
      '</div>' + warn +
      '<section class="axcf-card"><h3>📦 ربح كل نوع ورق</h3><div class="axcf-ptbl" role="table">' +
        '<div class="axcf-ptr axcf-pth" role="row"><span>الصنف</span><span>الكمية</span><span>متوسط البيع</span><span>متوسط التكلفة</span><span>الربح</span><span>الهامش</span></div>' +
        R.papers.map(function (g) {
          var tone = g.noCost ? 'warn' : g.margin < 0 ? 'bad' : g.margin < 10 ? 'warn' : 'ok';
          return '<div class="axcf-ptr" role="row"><span class="n">' + esc(g.name) + '</span><span data-l="الكمية">' + num(g.qty) + '</span><span data-l="متوسط البيع">' + num(Math.round(g.avgP * 100) / 100) + '</span>' +
            '<span data-l="متوسط التكلفة">' + (g.noCost ? '<em class="axcf-miss">مش متسجلة</em>' : num(Math.round(g.avgC * 100) / 100)) + '</span>' +
            '<span data-l="الربح" class="' + (g.profit < 0 ? 'neg' : '') + '"><b>' + money(g.profit) + '</b></span>' +
            '<span data-l="الهامش" class="m"><i class="axcf-mbar ' + tone + '"><i style="width:' + Math.max(3, Math.round(Math.abs(g.margin) / maxAbs * 100)) + '%"></i></i><b class="' + tone + '">' + pct(g.margin) + '</b></span></div>';
        }).join('') + '</div></section>' +
      '<p class="axcf-note axcf-foot">بنفس حسبة «أرباحي»: تكلفة الصنف الحالية × الكمية، والمرتجعات بتتخصم. المصروفات العامة (إيجار، مرتبات…) مش متوزعة على المراكز هنا.</p>';
  }

  function body(M) {
    return ui.tab === 'sales' ? salesTab(M) : ui.tab === 'pays' ? paysTab(M) : ui.tab === 'invs' ? invsTab(M) : ui.tab === 'info' ? infoTab(M) : ui.tab === 'profit' ? profitTab(M) : over(M);
  }

  /* ── the screen ── */
  function root() {
    var el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID; el.className = 'axcf ax-hl-off'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'ملف المركز');
    el.innerHTML = '<div class="axcf-scroll" id="axcf-scroll"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-t],[data-f],[data-pp],[data-a]');
      if (!t) return;
      if (t.hasAttribute('data-t')) { ui.tab = t.getAttribute('data-t'); draw(true); return; }
      if (t.hasAttribute('data-f')) { ui.f = t.getAttribute('data-f'); draw(); return; }
      if (t.hasAttribute('data-pp')) { ui.pp = t.getAttribute('data-pp'); draw(); return; }
      act(t.getAttribute('data-a'), t.getAttribute('data-id'));
    });
    el.addEventListener('input', function (e) { if (e.target.id === 'axcf-q') { ui.q = e.target.value; var pos = e.target.selectionStart; draw(); var i = document.getElementById('axcf-q'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} } } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen() && !modalOpen()) close(); });
    /* a change made from inside (edit a supply, a payment, the center's data) → redraw when its window closes */
    var mo = document.getElementById('modal-overlay');
    if (mo && window.MutationObserver) new MutationObserver(function () { if (isOpen() && !modalOpen()) setTimeout(function () { if (isOpen()) draw(); }, 60); }).observe(mo, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('popstate', function () { if (isOpen()) close(true); });
    return el;
  }
  function modalOpen() { var mo = document.getElementById('modal-overlay'); return !!(mo && mo.classList.contains('show')); }
  function isOpen() { var el = document.getElementById(ID); return !!(el && el.classList.contains('show')); }

  function draw(top) {
    var box = document.getElementById('axcf-scroll'); if (!box) return;
    var M = model(ui.id);
    if (!M) { close(); return; }
    var y = box.scrollTop;
    box.innerHTML = head(M) + tabs(M) + '<main class="axcf-body">' + body(M) + '</main>';
    box.scrollTop = top ? Math.min(y, (box.querySelector('.axcf-tabs') || {}).offsetTop || 0) : y;
  }

  function act(a, id) {
    var c = ui.id;
    switch (a) {
      case 'close': return close();
      case 'edit': return typeof openCustomerForm === 'function' && openCustomerForm(c);
      case 'pay': return typeof openPaymentForm === 'function' && openPaymentForm(c);
      case 'iss': return typeof openIssuanceForm === 'function' && openIssuanceForm(c);
      case 'stmt': return typeof viewCustomerStatement === 'function' && viewCustomerStatement(c);
      case 'vi': return window.viewIssuance && viewIssuance(id);
      case 'ei': return window.editIssuance && editIssuance(id);
      case 'vv': return window.viewInvoice && viewInvoice(id);
    }
  }

  function open(id, tab) {
    if (!A('customers').some(function (x) { return x && x.id === id; })) return;
    var el = root(), was = isOpen();
    ui.id = id; ui.tab = tab || 'over'; ui.f = 'all'; ui.q = ''; ui.pp = 'all';
    draw();
    var box = document.getElementById('axcf-scroll'); if (box) box.scrollTop = 0;
    if (!was) {
      try { history.pushState({ axcf: id }, ''); } catch (e) {}
      void el.offsetWidth; el.classList.add('show');
      document.documentElement.classList.add('axcf-on');
    }
  }
  function close(fromPop) {
    var el = document.getElementById(ID); if (!el || !el.classList.contains('show')) return;
    el.classList.remove('show');
    document.documentElement.classList.remove('axcf-on');
    if (!fromPop) { try { if (history.state && history.state.axcf) history.back(); } catch (e) {} }
  }

  /* 5.06 · a tap anywhere on a center's row in «العملاء والمراكز» opens its file (the row's own buttons keep their job) */
  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('tr.cust-row[data-cid]');
    if (!tr || e.target.closest('button, a, input, select, textarea, label, .row-actions')) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return;                                        // selecting text to copy, not a tap
    open(tr.getAttribute('data-cid'));
  });

  window.AXCenter = { open: open, close: close, model: model, isOpen: isOpen, profit: profitModel };
})();

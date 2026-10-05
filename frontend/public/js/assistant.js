/* ════════════════════════════════════════════════════════════════════
   ERP · المساعد الذكي (4.9)
   ------------------------------------------------------------------
   · بيفهم السؤال بالعامية: الفترة (النهارده، امبارح، الأسبوع، الشهر ده،
     الشهر اللي فات، اسم شهر، آخر N يوم، السنة) واسم المركز أو الصنف أو
     المورد لو اتذكر، ويكمّل على آخر سؤال («والشهر اللي فات؟»)
   · الرد «إيصال» منظم: سطور حساب بنقط، رسم صغير لأيام الفترة، ترتيب
     بالأعمدة، والخلاصة، وأزرار تنفّذ على طول (تحصيل، كشف واتساب،
     طلب شراء…) — ويتنسخ أو يتبعت واتساب
   · كل الحسابات من بيانات البرنامج نفسه، على الجهاز، ومن غير إنترنت
   · بيحترم صلاحيات المستخدم: اللي ملوش «الأرباح» مثلاً ميعرفش الربح منه
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var st = { tab: 'chat', msgs: [], ctx: null, fns: {}, fid: 0, busy: false, rec: null };
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

  /* ───────────────────────── basics ───────────────────────── */
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function S() { return D().settings || {}; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cur() { return S().currency || 'ج'; }
  function num(n, dec) {
    n = Number(n) || 0;
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    var d = dec != null ? dec : (whole || Math.abs(n) >= 1000 ? 0 : 2);
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function money(n) { return '‎' + num(n) + ' ' + cur(); }
  function lds(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : lds(new Date()); }
  function dt(s) { return new Date(String(s).slice(0, 10) + 'T00:00:00'); }
  function addDays(s, k) { var d = dt(s); d.setDate(d.getDate() + k); return lds(d); }
  function daysBetween(a, b) { return Math.round((dt(b) - dt(a)) / 864e5); }
  function dm(s) { var d = dt(s); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function dayName(s) { var t = today(); if (s === t) return 'النهارده'; if (s === addDays(t, -1)) return 'امبارح'; var d = dt(s); return DAYS[d.getDay()] + ' ' + dm(s); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function allowed(page) { try { return typeof can !== 'function' || can(page); } catch (e) { return true; } }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || {}; }
  function fn(f) { var id = 'f' + (++st.fid); st.fns[id] = f; return "AXA.run('" + id + "')"; }
  function plural(n, one, few, many) { return n === 1 ? one : (n >= 3 && n <= 10) ? few : many; }

  /* Arabic normalisation: hamza forms, taa marbuta, alef maqsura, diacritics, Arabic digits */
  function N(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[إأآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[؟?!.,،؛:"'«»()\-_/]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function W(list) { return list.map(N); }
  function has(q, list) { for (var i = 0; i < list.length; i++) if (q.indexOf(list[i]) >= 0) return true; return false; }

  /* ───────────────────────── time periods ───────────────────────── */
  var K = {
    today: W(['النهارده', 'انهارده', 'النهاردة', 'اليوم ده', 'اليوم']),
    yday: W(['امبارح', 'إمبارح', 'أمس', 'امس']),
    lweek: W(['الاسبوع اللي فات', 'الأسبوع اللي فات', 'الاسبوع الماضي', 'الأسبوع الماضي', 'الاسبوع السابق']),
    week: W(['الاسبوع', 'الأسبوع', 'اسبوع']),
    lmonth: W(['الشهر اللي فات', 'الشهر الماضي', 'الشهر السابق', 'الشهر اللى فات', 'شهر فات']),
    month: W(['الشهر ده', 'الشهر دا', 'هذا الشهر', 'الشهر الحالي', 'الشهر']),
    year: W(['السنه دي', 'السنة دي', 'السنه', 'السنة', 'العام']),
    all: W(['من الاول', 'من الأول', 'طول الوقت', 'كل الوقت', 'من البدايه', 'الاجمالي كله'])
  };
  var MN = W(['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر']);

  function period(q, def) {
    var t = today(), d = dt(t), y = d.getFullYear(), m = d.getMonth();
    function P(from, to, label, pf, pt, pl) { return { from: from, to: to, label: label, prev: { from: pf, to: pt, label: pl } }; }
    function mtd() {
      var from = lds(new Date(y, m, 1)), pEnd = new Date(y, m, 0), pd = Math.min(d.getDate(), pEnd.getDate());
      return P(from, t, 'الشهر ده', lds(new Date(y, m - 1, 1)), lds(new Date(y, m - 1, pd)), 'نفس الفترة من الشهر اللي فات');
    }
    function monthOf(yy, mm, label) { return P(lds(new Date(yy, mm, 1)), lds(new Date(yy, mm + 1, 0)), label, lds(new Date(yy, mm - 1, 1)), lds(new Date(yy, mm, 0)), MONTHS[(mm + 11) % 12]); }
    var n = q.match(/(?:اخر|آخر)\s*(\d{1,3})\s*(?:يوم|ايام|أيام)/);
    if (n) { var k = Math.max(1, Math.min(365, +n[1])); return P(addDays(t, -(k - 1)), t, 'آخر ' + k + ' يوم', addDays(t, -(2 * k - 1)), addDays(t, -k), 'الـ ' + k + ' يوم اللي قبلهم'); }
    if (has(q, K.all)) return { from: '0000-00-00', to: '9999-12-31', label: 'من الأول', all: true };
    if (has(q, K.yday)) { var yd = addDays(t, -1); return P(yd, yd, 'امبارح', addDays(t, -2), addDays(t, -2), 'أول امبارح'); }
    if (has(q, K.today)) return P(t, t, 'النهارده', addDays(t, -1), addDays(t, -1), 'امبارح');
    if (has(q, K.lweek)) { var ws = addDays(t, -((d.getDay() + 1) % 7)); return P(addDays(ws, -7), addDays(ws, -1), 'الأسبوع اللي فات', addDays(ws, -14), addDays(ws, -8), 'الأسبوع اللي قبله'); }
    if (has(q, K.lmonth)) return monthOf(y, m - 1, 'الشهر اللي فات (' + MONTHS[(m + 11) % 12] + ')');
    for (var i = 0; i < 12; i++) if (q.indexOf(MN[i]) >= 0) { var yy = i > m ? y - 1 : y; return i === m ? mtd() : monthOf(yy, i, MONTHS[i] + (yy !== y ? ' ' + yy : '')); }
    var sm = q.match(/شهر\s*(\d{1,2})/);
    if (sm && +sm[1] >= 1 && +sm[1] <= 12) { var mi = +sm[1] - 1, y2 = mi > m ? y - 1 : y; return mi === m ? mtd() : monthOf(y2, mi, MONTHS[mi] + (y2 !== y ? ' ' + y2 : '')); }
    if (has(q, K.week)) { var w0 = addDays(t, -((d.getDay() + 1) % 7)), len = daysBetween(w0, t); return P(w0, t, 'الأسبوع ده', addDays(w0, -7), addDays(w0, -7 + len), 'نفس الأيام من الأسبوع اللي فات'); }
    if (has(q, K.year)) return P(lds(new Date(y, 0, 1)), t, 'السنة دي', lds(new Date(y - 1, 0, 1)), lds(new Date(y - 1, m, d.getDate())), 'نفس الفترة السنة اللي فاتت');
    if (has(q, K.month)) return mtd();
    if (def === 'today') return P(t, t, 'النهارده', addDays(t, -1), addDays(t, -1), 'امبارح');
    if (def === 'all') return { from: '0000-00-00', to: '9999-12-31', label: 'من الأول', all: true };
    return mtd();
  }
  function hasPeriod(q) { return /(?:اخر|آخر)\s*\d/.test(q) || /شهر\s*\d/.test(q) || [K.all, K.yday, K.today, K.lweek, K.lmonth, K.week, K.year, K.month, MN].some(function (l) { return has(q, l); }); }
  function inP(p, s) { s = String(s || '').slice(0, 10); return s >= p.from && s <= p.to; }
  function rangeTxt(p) { if (p.all) return 'من أول ما بدأنا'; if (p.from === p.to) return dayName(p.from); return 'من ' + dm(p.from) + ' لحد ' + dm(p.to); }

  /* ───────────────────────── data ───────────────────────── */
  function invFromIss() {
    var s = {}; A('issuances').forEach(function (i) { if (i.invoiceId) s[i.invoiceId] = 1; }); return s;
  }
  /* every sale: issuances + invoices that didn't come from an issuance */
  function sales(p) {
    var out = [], fromIss = invFromIss();
    A('issuances').forEach(function (i) { if (inP(p, i.date)) out.push({ date: i.date, cid: i.customerId, name: i.customerName, total: +i.total || 0, paid: +i.paid || 0, qty: +i.quantity || 0, pid: i.productId, pname: i.productName, unit: i.productUnit || i.unit, n: i.number, kind: 'iss' }); });
    A('invoices').forEach(function (v) {
      if (v.sourceIssuanceId || v.sourceIssuance || fromIss[v.id] || !inP(p, v.date)) return;
      var items = Array.isArray(v.items) ? v.items : [];
      if (!items.length) { out.push({ date: v.date, cid: v.customerId, total: +v.total || 0, paid: +v.paid || 0, qty: 0, n: v.number, kind: 'inv' }); return; }
      var sub = items.reduce(function (s, it) { return s + (+it.total || 0); }, 0) || 1, k = (+v.total || 0) / sub, kp = (+v.paid || 0) / sub;
      items.forEach(function (it) { out.push({ date: v.date, cid: v.customerId, total: (+it.total || 0) * k, paid: (+it.total || 0) * kp, qty: +(it.qty || it.quantity) || 0, pid: it.productId, pname: it.productName || it.name, n: v.number, kind: 'inv' }); });
    });
    return out;
  }
  function ops(list) { var s = {}; list.forEach(function (x) { s[x.kind + (x.n || '') + '|' + x.cid + '|' + x.date] = 1; }); return Object.keys(s).length; }
  function sum(list, k) { return list.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0); }
  function pays(p) { return A('payments').filter(function (x) { return inP(p, x.date); }); }
  function exps(p) { return A('expenses').filter(function (e) { return e.kind !== 'purchase' && inP(p, e.date); }); }
  function cust(id) { return A('customers').find(function (c) { return c.id === id; }); }
  function cname(id, fb) { var c = cust(id); return c ? c.name : (fb || 'مركز'); }
  function groupBy(list, key, val) {
    var m = {}; list.forEach(function (x) { var k = x[key]; if (k == null) return; m[k] = (m[k] || 0) + (typeof val === 'function' ? val(x) : Number(x[val]) || 0); });
    return Object.keys(m).map(function (k) { return { k: k, v: m[k] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function delta(a, b, inv) {
    if (!b && !a) return '';
    if (!b) return '<em class="up' + (inv ? ' inv' : '') + '">جديد</em>';
    var d = Math.round((a - b) / Math.abs(b) * 100);
    if (d === 0) return '<em>زي ما هو</em>';
    var txt = (b > 0 && a / b >= 3) ? (Math.round(a / b * 10) / 10) + '×' : Math.abs(d) + '%';
    return '<em class="' + (d > 0 ? 'up' : 'down') + (inv ? ' inv' : '') + '">' + (d > 0 ? '▲ ' : '▼ ') + txt + '</em>';
  }
  function debtors() { return A('customers').filter(function (c) { return (+c.balance || 0) > 0.5; }).sort(function (a, b) { return b.balance - a.balance; }); }
  function agingOf(cid) { try { return window.AXCore ? AXCore.aging(D(), cid, today()) : null; } catch (e) { return null; } }
  function overdue() { try { return typeof getOverdueIssuances === 'function' ? getOverdueIssuances() : []; } catch (e) { return []; } }
  function stockModel() {
    try { if (window.AXStock && AXStock.model) return AXStock.model().items; } catch (e) {}
    return A('products').map(function (p) { var b = +p.quantity || 0; return { p: p, id: p.id, name: p.name, unit: p.unit || '', bal: b, avg: 0, cover: Infinity, state: b <= 0 ? 'empty' : b <= (+p.minQuantity || 0) ? 'low' : 'ok', until: null, value: b * (+p.cost || 0) }; });
  }
  function coverTxt(it) {
    if (it.state === 'empty' || it.bal <= 0) return 'خلص';
    if (!isFinite(it.cover)) return 'مفيش سحب الشهر ده';
    var d = Math.floor(it.cover);
    if (d < 1) return 'يخلص النهارده';
    return 'يكفي ' + (d > 365 ? 'أكتر من سنة' : d + ' يوم');
  }
  function phoneOf(c) {
    var p = String((c && c.phone) || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (!p) return '';
    if (/^01\d{9}$/.test(p)) return '2' + p;
    if (/^1\d{9}$/.test(p)) return '20' + p;
    return p.length >= 10 ? p : '';
  }

  /* ───────────────────────── who / what is the question about ───────────────────────── */
  var GENERIC_C = W(['مركز', 'مراكز', 'مستشفي', 'مستشفى', 'عياده', 'عيادة', 'للاشعه', 'الاشعه', 'اشعه', 'للأشعة', 'سكان', 'معمل', 'دكتور', 'د', 'شركه', 'شركة', 'مجموعه', 'الطبي', 'الطبيه', 'طبي', 'التخصصي', 'لل']);
  var GENERIC_P = W(['ورق', 'افلام', 'فيلم', 'جرام', 'جم', 'مقاس', 'نوع', 'صنف']);
  function tokens(name, generic) {
    return N(name).split(' ').map(function (w) { return w.replace(/^(وال|بال|لل|ال)/, ''); })
      .filter(function (w) { return w.length >= 2 && generic.indexOf(w) < 0 && generic.indexOf('ال' + w) < 0; });
  }
  function qwords(q) { return q.split(' ').map(function (w) { return w.replace(/^(وال|بال|لل|ال|و|ب|ل)(?=..)/, ''); }); }
  function match(q, list, generic, weak) {
    var qw = qwords(q), qn = ' ' + q + ' ', out = [];
    list.forEach(function (x) {
      var nm = N(x.name); if (!nm) return;
      var score = 0;
      if (qn.indexOf(' ' + nm + ' ') >= 0) score = 100 + nm.length;
      else {
        var tk = tokens(x.name, generic), hit = 0;
        tk.forEach(function (t) {
          if (t.length < 2) return;
          if (qw.indexOf(t) >= 0 || (t.length >= 4 && q.indexOf(t) >= 0)) hit += t.length >= 3 || /\d/.test(t) ? t.length : 1;
        });
        if (weak) (N(x.name).split(' ')).forEach(function (w) { if (weak.indexOf(w) >= 0 && qw.indexOf(w) >= 0) hit += 0.5; });
        score = hit;
      }
      if (score >= 2) out.push({ x: x, s: score });
    });
    return out.sort(function (a, b) { return b.s - a.s || N(b.x.name).length - N(a.x.name).length; });
  }
  function findCustomer(q) { var m = match(q, A('customers'), GENERIC_C); return m.length && (m.length === 1 || m[0].s > m[1].s) ? m[0].x : null; }
  function findProducts(q) { var m = match(q, A('products'), GENERIC_P, W(['ورق', 'افلام', 'حبر'])); if (!m.length) return []; return m.filter(function (r) { return r.s === m[0].s; }).map(function (r) { return r.x; }); }
  function findSupplier(q) { var m = match(q, A('suppliers'), GENERIC_C.concat(W(['مورد', 'للورق', 'للافلام']))); return m.length && (m.length === 1 || m[0].s > m[1].s) ? m[0].x : null; }

  /* ───────────────────────── answers ───────────────────────── */
  function noAccess(what) { return { icon: 'lock', title: 'القسم ده مش متاح لحسابك', note: 'أسأل المدير يفتحلك «' + what + '» من صفحة المستخدمين لو محتاجه.', tone: 'warn' }; }

  function brief() {
    var t = today(), P0 = { from: t, to: t };
    var s = sales(P0), py = pays(P0).filter(function (x) { return +x.amount > 0; });
    var od = overdue(), odSum = sum(od, 'remaining');
    var odBy = groupBy(od, 'customerId', 'remaining');
    var low = stockModel().filter(function (i) { return i.state === 'crit' || i.state === 'empty'; });
    var chq = (window.AXCheq && allowed('cheques')) ? AXCheq.dueSoon() : [];
    var ledger = [
      { l: 'صرف النهارده', v: ops(s) + ' ' + plural(ops(s), 'عملية', 'عمليات', 'عملية') + ' بـ ' + money(sum(s, 'total')) },
      { l: 'اتحصّل النهارده', v: money(sum(py, 'amount')), tone: sum(py, 'amount') > 0 ? 'ok' : '' },
      { l: 'متأخر في الدفع', v: od.length ? money(odSum) : 'مفيش', tone: od.length ? 'bad' : 'ok' },
      { l: 'أصناف قربت تخلص', v: low.length ? low.length + ' ' + plural(low.length, 'صنف', 'أصناف', 'صنف') : 'مفيش', tone: low.length ? 'warn' : 'ok' }
    ];
    if (chq.length) ledger.push({ l: 'شيكات ميعادها قرب', v: chq.length + ' ' + plural(chq.length, 'شيك', 'شيكات', 'شيك'), tone: 'warn' });
    var acts = [];
    if (od.length) acts.push({ t: 'المتأخرين', on: fn(function () { ask('مين متأخر في الدفع؟'); }), pri: true });
    if (low.length) acts.push({ t: 'اللي قرب يخلص', on: fn(function () { ask('إيه اللي قرب يخلص في المخزن؟'); }) });
    acts.push({ t: 'أعمل إيه النهارده؟', on: fn(function () { ask('أعمل إيه النهارده؟'); }) });
    return {
      icon: 'sun', title: 'ملخص النهارده', sub: dayName(t) + ' ' + dm(t),
      ledger: ledger,
      note: od.length ? 'أكبر متأخرات عند ' + esc(cname(odBy[0].k)) + ' بـ ' + money(odBy[0].v) + '.' : 'مفيش فلوس متأخرة على حد — يوم هادي.',
      tone: od.length ? 'bad' : 'ok', acts: acts,
      follow: ['مبيعات الشهر ده', 'قارن الشهر ده بالشهر اللي فات', 'مين أكتر مركز عليه فلوس؟']
    };
  }

  function salesAns(p) {
    var s = sales(p), tot = sum(s, 'total'), n = ops(s), pr = p.prev ? sales(p.prev) : null, ptot = pr ? sum(pr, 'total') : 0;
    if (!s.length) return { icon: 'chart', title: 'المبيعات ' + p.label, sub: rangeTxt(p), note: 'مفيش مبيعات متسجلة في الفترة دي.' + (pr && ptot ? ' الفترة اللي قبلها كانت ' + money(ptot) + '.' : ''), follow: ['مبيعات الشهر اللي فات', 'ملخص النهارده'] };
    var days = p.all ? 0 : daysBetween(p.from, p.to) + 1;
    var top = groupBy(s, 'cid', 'total').slice(0, 5), mx = top.length ? top[0].v : 1;
    var r = {
      icon: 'chart', title: 'المبيعات ' + p.label, sub: rangeTxt(p),
      ledger: [
        { l: 'إجمالي المبيعات', v: money(tot), d: pr ? delta(tot, ptot) : '' , big: true },
        { l: 'عدد العمليات', v: num(n) },
        { l: 'اتدفع منها', v: money(sum(s, 'paid')) + ' (' + pct(sum(s, 'paid'), tot) + '%)' },
        { l: 'باقي على المراكز', v: money(tot - sum(s, 'paid')), tone: tot - sum(s, 'paid') > 0.5 ? 'warn' : 'ok' }
      ],
      bars: { title: 'أكتر المراكز شراءً', items: top.map(function (x) { var c = cust(x.k); return { l: cname(x.k), txt: money(x.v), w: x.v / mx, on: c ? fn(function () { ask('حساب ' + c.name, { cid: c.id }); }) : '' }; }) },
      follow: ['قارن الشهر ده بالشهر اللي فات', 'المبيعات الأسبوع ده', 'أكتر صنف بيتباع']
    };
    if (days > 1 && days <= 62) {
      var byDay = {}; s.forEach(function (x) { byDay[x.date] = (byDay[x.date] || 0) + x.total; });
      var items = []; for (var i = 0; i < days; i++) { var dd = addDays(p.from, i); items.push({ l: dm(dd), v: byDay[dd] || 0 }); }
      r.spark = { items: items, fmt: money };
      var best = items.slice().sort(function (a, b) { return b.v - a.v; })[0];
      r.note = 'متوسط اليوم ' + money(tot / days) + '، وأعلى يوم كان ' + best.l + ' بـ ' + money(best.v) + '.';
    }
    if (pr && ptot) r.ledger[0].sub = p.prev.label + ': ' + money(ptot);
    return r;
  }

  function collectAns(p) {
    var py = pays(p), inn = py.filter(function (x) { return +x.amount > 0; }), back = py.filter(function (x) { return +x.amount < 0; });
    var tot = sum(py, 'amount'), s = sum(sales(p), 'total');
    var pr = p.prev ? sum(pays(p.prev), 'amount') : 0;
    if (!py.length) return { icon: 'cash', title: 'التحصيل ' + p.label, sub: rangeTxt(p), note: 'مفيش تحصيل متسجل في الفترة دي.', acts: debtors().length ? [{ t: 'مين عليه فلوس؟', on: fn(function () { ask('مين أكتر مركز عليه فلوس؟'); }), pri: true }] : [], follow: ['التحصيل الشهر اللي فات', 'مين متأخر في الدفع؟'] };
    var top = groupBy(inn, 'customerId', 'amount').slice(0, 5), mx = top.length ? top[0].v : 1;
    var methods = groupBy(inn.map(function (x) { return { m: x.method || 'نقدي', a: +x.amount }; }), 'm', 'a');
    var led = [
      { l: 'صافي التحصيل', v: money(tot), d: p.prev ? delta(tot, pr) : '', big: true, tone: 'ok' },
      { l: 'عدد الدفعات', v: num(inn.length) }
    ];
    if (back.length) led.push({ l: 'شيكات مرتجعة', v: money(-sum(back, 'amount')), tone: 'bad' });
    if (s) led.push({ l: 'نسبة التحصيل من مبيعات الفترة', v: pct(tot, s) + '%' });
    if (methods.length > 1) led.push({ l: 'طرق الدفع', v: methods.slice(0, 3).map(function (m) { return m.k + ' ' + money(m.v); }).join('، ') });
    return {
      icon: 'cash', title: 'التحصيل ' + p.label, sub: rangeTxt(p), ledger: led,
      bars: { title: 'أكتر المراكز دفعًا', items: top.map(function (x) { return { l: cname(x.k, (inn.find(function (y) { return y.customerId === x.k; }) || {}).customerName), txt: money(x.v), w: x.v / mx }; }) },
      follow: ['مين أكتر مركز عليه فلوس؟', 'التحصيل الأسبوع ده', 'المبيعات ' + p.label]
    };
  }

  function profitAns(p) {
    if (!allowed('profit')) return noAccess('الأرباح');
    var ls = (window.AXProfit && AXProfit.lines) ? AXProfit.lines().filter(function (l) { return inP(p, l.date); }) : sales(p).map(function (x) { var pr = A('products').find(function (y) { return y.id === x.pid; }); return { cid: x.cid, rev: x.total, cost: (pr ? +pr.cost || 0 : 0) * x.qty, noCost: !(pr && +pr.cost) }; });
    var rev = sum(ls, 'rev'), cost = sum(ls, 'cost'), gross = rev - cost, ex = sum(exps(p), 'amount'), net = gross - ex;
    if (!ls.length) return { icon: 'coin', title: 'الأرباح ' + p.label, sub: rangeTxt(p), note: 'مفيش مبيعات في الفترة دي عشان أحسب الربح.' };
    var by = {}; ls.forEach(function (l) { var g = by[l.cid] || (by[l.cid] = { rev: 0, cost: 0 }); g.rev += l.rev; g.cost += l.cost; });
    var top = Object.keys(by).map(function (k) { return { k: k, v: by[k].rev - by[k].cost, m: by[k].rev ? (by[k].rev - by[k].cost) / by[k].rev * 100 : 0 }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
    var mx = top.length ? Math.max(1, Math.abs(top[0].v)) : 1, noCost = ls.filter(function (l) { return l.noCost; }).length;
    return {
      icon: 'coin', title: 'الأرباح ' + p.label, sub: rangeTxt(p),
      ledger: [
        { l: 'المبيعات', v: money(rev) },
        { l: 'تكلفة البضاعة', v: money(cost) },
        { l: 'الربح الإجمالي', v: money(gross) + ' (' + (rev ? Math.round(gross / rev * 100) : 0) + '%)', tone: gross >= 0 ? 'ok' : 'bad' },
        { l: 'المصروفات', v: money(ex) },
        { l: 'صافي الربح', v: money(net), big: true, tone: net >= 0 ? 'ok' : 'bad' }
      ],
      bars: { title: 'أكتر المراكز ربحًا', items: top.map(function (x) { return { l: cname(x.k), txt: money(x.v) + ' · ' + Math.round(x.m) + '%', w: Math.max(0, x.v) / mx, tone: x.v < 0 ? 'bad' : '' }; }) },
      note: noCost ? noCost + ' سطر مبيعات أصنافهم من غير سعر تكلفة، فالربح الحقيقي أقل من كده. سجّل التكلفة من المخازن.' : '',
      tone: noCost ? 'warn' : '',
      acts: [{ t: 'افتح الأرباح', on: fn(function () { navigate('profit'); }) }],
      follow: ['قارن الشهر ده بالشهر اللي فات', 'المصروفات ' + p.label]
    };
  }

  function debtsAns() {
    var ds = debtors(), tot = sum(ds, 'balance');
    if (!ds.length) return { icon: 'check', title: 'مفيش حد عليه فلوس', note: 'كل المراكز مسددة حساباتها.', tone: 'ok' };
    var B = [0, 0, 0, 0], ages = {};
    ds.forEach(function (c) { var a = agingOf(c.id); if (!a) return; a.buckets.forEach(function (v, i) { B[i] += v; }); ages[c.id] = a.oldestDays; });
    var top = ds.slice(0, 6), mx = top[0].balance;
    var r = {
      icon: 'wallet', title: 'الفلوس اللي برا', sub: ds.length + ' ' + plural(ds.length, 'مركز', 'مراكز', 'مركز') + ' عليهم فلوس',
      ledger: [{ l: 'المستحق على المراكز', v: money(tot), big: true }],
      bars: { title: 'الأكتر', items: top.map(function (c) { return { l: c.name, txt: money(c.balance), w: c.balance / mx, sub: ages[c.id] ? 'أقدم دين ' + ages[c.id] + ' يوم' : '', tone: ages[c.id] > 60 ? 'bad' : ages[c.id] > 30 ? 'warn' : '', on: fn(function () { ask('حساب ' + c.name, { cid: c.id }); }) }; }) },
      acts: [{ t: 'افتح أعمار الديون', on: fn(function () { navigate('aging'); }), pri: true }],
      follow: ['مين متأخر في الدفع؟', 'التحصيل الشهر ده', 'أعمل إيه النهارده؟']
    };
    if (B.some(function (v) { return v > 0.5; })) {
      var labels = ['أقل من شهر', 'من شهر لشهرين', 'من شهرين لـ 3', 'أكتر من 3 شهور'];
      B.forEach(function (v, i) { if (v > 0.5) r.ledger.push({ l: labels[i], v: money(v) + ' (' + pct(v, tot) + '%)', tone: i >= 3 ? 'bad' : i === 2 ? 'warn' : '' }); });
      if (B[3] > 0.5) r.note = money(B[3]) + ' عدّى عليهم أكتر من 3 شهور — دول أولى بالمتابعة.';
    }
    return r;
  }

  function overdueAns() {
    var od = overdue();
    if (!od.length) return { icon: 'check', title: 'مفيش حد متأخر', note: 'كل عمليات الصرف اللي ليها ميعاد تحصيل اتدفعت في ميعادها أو لسه ميعادها مجاش.', tone: 'ok', follow: ['مين أكتر مركز عليه فلوس؟'] };
    var m = {};
    od.forEach(function (i) { var g = m[i.customerId] || (m[i.customerId] = { cid: i.customerId, name: i.customerName, sum: 0, n: 0, days: 0 }); g.sum += i.remaining; g.n++; g.days = Math.max(g.days, i.daysOverdue); });
    var list = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.sum - a.sum; });
    return {
      icon: 'clock', title: 'المتأخرين في الدفع', sub: od.length + ' ' + plural(od.length, 'عملية', 'عمليات', 'عملية') + ' عدّى ميعادها',
      ledger: [{ l: 'إجمالي المتأخر', v: money(sum(od, 'remaining')), big: true, tone: 'bad' }],
      rows: list.slice(0, 8).map(function (g) {
        var c = cust(g.cid), ph = phoneOf(c);
        return { l: cname(g.cid, g.name), sub: g.n + ' ' + plural(g.n, 'عملية', 'عمليات', 'عملية') + ' · أقدمها متأخر ' + g.days + ' يوم', v: money(g.sum), tone: g.days > 30 ? 'bad' : 'warn',
          btns: [{ t: 'تحصيل', on: fn(function () { if (typeof openPaymentForm === 'function') openPaymentForm(g.cid); }) }].concat(ph ? [{ t: 'واتساب', wa: true, on: fn(function () { sendStatement(g.cid); }) }] : []) };
      }),
      acts: [{ t: 'افتح أعمار الديون', on: fn(function () { navigate('aging'); }) }],
      follow: ['التحصيل الشهر ده', 'أعمل إيه النهارده؟']
    };
  }

  function customerAns(c, p) {
    p = p || period('', 'month');
    var bal = +c.balance || 0, a = agingOf(c.id);
    var iss = A('issuances').filter(function (i) { return i.customerId === c.id; }).sort(function (x, y) { return String(y.date).localeCompare(String(x.date)) || (y.createdAt || 0) - (x.createdAt || 0); });
    var last = iss[0];
    var s = sales(p).filter(function (x) { return x.cid === c.id; });
    var py = A('payments').filter(function (x) { return x.customerId === c.id && +x.amount > 0; }).sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
    var dates = []; iss.forEach(function (i) { if (dates.indexOf(i.date) < 0) dates.push(i.date); });
    var gap = 0; if (dates.length >= 3) { var g = 0; for (var k = 1; k < Math.min(dates.length, 12); k++) g += daysBetween(dates[k], dates[k - 1]); gap = Math.round(g / (Math.min(dates.length, 12) - 1)); }
    var since = last ? daysBetween(last.date, today()) : null;
    var led = [{ l: 'عليه دلوقتي', v: bal > 0.5 ? money(bal) : (bal < -0.5 ? 'ليه عندنا ' + money(-bal) : 'مفيش'), big: true, tone: bal > 0.5 ? (a && a.oldestDays > 60 ? 'bad' : 'warn') : 'ok' }];
    if (a && bal > 0.5 && a.oldestDays) led.push({ l: 'أقدم دين', v: a.oldestDays + ' يوم', tone: a.oldestDays > 60 ? 'bad' : '' });
    led.push({ l: 'سحب ' + p.label, v: s.length ? money(sum(s, 'total')) + ' (' + ops(s) + ' ' + plural(ops(s), 'عملية', 'عمليات', 'عملية') + ')' : 'مسحبش' });
    if (last) led.push({ l: 'آخر صرف', v: dayName(last.date) + ' — ' + num(last.quantity) + ' ' + (last.productUnit || last.unit || '') + ' ' + (last.productName || '') });
    if (py[0]) led.push({ l: 'آخر دفعة', v: money(py[0].amount) + ' — ' + dayName(py[0].date) });
    if (gap) led.push({ l: 'بيسحب عادةً كل', v: gap + ' يوم' });
    var byP = groupBy(A('issuances').filter(function (i) { return i.customerId === c.id && daysBetween(i.date, today()) <= 90; }), 'productName', 'quantity').slice(0, 4);
    var mx = byP.length ? byP[0].v : 1;
    var note = '';
    if (gap && since != null && since > gap * 1.6) note = 'بقاله ' + since + ' يوم مسحبش، وده أكتر من عادته (كل ' + gap + ' يوم تقريبًا). يستاهل تليفون.';
    else if (a && a.oldestDays > 60 && bal > 0.5) note = 'فيه دين عدّى عليه ' + a.oldestDays + ' يوم — ابعتله كشف حساب.';
    var acts = [];
    if (bal > 0.5) acts.push({ t: 'تحصيل', pri: true, on: fn(function () { if (typeof openPaymentForm === 'function') openPaymentForm(c.id); }) });
    if (phoneOf(c) && bal > 0.5) acts.push({ t: 'كشف واتساب', wa: true, on: fn(function () { sendStatement(c.id); }) });
    acts.push({ t: 'صرف ورق له', on: fn(function () { navigate('issuances'); setTimeout(function () { if (typeof openIssuanceForm === 'function') openIssuanceForm(c.id); }, 150); }) });
    if (typeof viewCustomerStatement === 'function') acts.push({ t: 'كشف الحساب', on: fn(function () { viewCustomerStatement(c.id); }) });
    st.ctx = { intent: 'customer', cid: c.id };
    return {
      icon: 'building', title: c.name, sub: [c.address, c.phone].filter(Boolean).join(' — '),
      ledger: led,
      bars: byP.length ? { title: 'بيسحب إيه (آخر 3 شهور)', items: byP.map(function (x) { return { l: x.k, txt: num(x.v), w: x.v / mx }; }) } : null,
      note: note, tone: note ? 'warn' : '', acts: acts,
      follow: ['مين متأخر في الدفع؟', 'أكتر المراكز سحبًا الشهر ده']
    };
  }

  function productAns(it) {
    var p = it.p || {}, t = today(), from = addDays(t, -29);
    var cons = groupBy(A('issuances').filter(function (i) { return i.productId === it.id && i.date >= from; }), 'customerId', 'quantity').slice(0, 5), mx = cons.length ? cons[0].v : 1;
    var led = [
      { l: 'الرصيد', v: num(it.bal) + ' ' + (it.unit || ''), big: true, tone: it.state === 'empty' || it.state === 'crit' ? 'bad' : it.state === 'low' ? 'warn' : 'ok' },
      { l: 'بيتسحب منه في اليوم', v: it.avg ? num(it.avg, it.avg < 10 ? 1 : 0) + ' ' + (it.unit || '') : 'مفيش سحب الشهر ده' },
      { l: 'الرصيد يكفي', v: coverTxt(it).replace(/^يكفي /, '') + (it.until && isFinite(it.cover) && it.cover >= 1 ? ' — لحد ' + dm(lds(it.until)) : '') }
    ];
    if (+p.minQuantity) led.push({ l: 'الحد الأدنى', v: num(p.minQuantity) });
    if (+p.price) led.push({ l: 'سعر البيع', v: money(p.price) + (+p.cost ? ' — التكلفة ' + money(p.cost) : '') });
    var acts = [];
    if (it.state === 'crit' || it.state === 'empty' || it.state === 'low' || it.belowMin) acts.push({ t: 'اعمل طلب شراء', pri: true, on: fn(function () { navigate('stock'); setTimeout(function () { if (window.AXStock) AXStock.tab('po'); }, 120); }) });
    acts.push({ t: 'افتح مخزوني', on: fn(function () { navigate('stock'); }) });
    return {
      icon: 'box', title: it.name, sub: 'المخزن',
      ledger: led,
      bars: cons.length ? { title: 'أكتر المراكز سحبًا منه (آخر 30 يوم)', items: cons.map(function (x) { return { l: cname(x.k), txt: num(x.v), w: x.v / mx }; }) } : null,
      tone: it.state === 'crit' || it.state === 'empty' ? 'bad' : '', note: it.state === 'crit' ? 'الرصيد مش هيكمّل أسبوع بالمعدل ده — اطلب دلوقتي.' : it.state === 'empty' ? 'الصنف خلص من المخزن.' : '',
      acts: acts, follow: ['إيه اللي قرب يخلص في المخزن؟', 'طلعنا قد إيه ورق الشهر ده؟']
    };
  }

  function stockAns(only) {
    var items = stockModel(); if (only) items = items.filter(function (i) { return only.indexOf(i.id) >= 0; });
    if (!items.length) return { icon: 'box', title: 'المخزن', note: 'مفيش أصناف متسجلة.' };
    var rank = { empty: 0, crit: 1, low: 2, ok: 3, idle: 4 };
    items = items.slice().sort(function (a, b) { return (rank[a.state] - rank[b.state]) || (a.cover - b.cover); });
    var bad = items.filter(function (i) { return i.state === 'empty' || i.state === 'crit'; }), low = items.filter(function (i) { return i.state === 'low'; });
    var value = sum(items, 'value');
    var r = {
      icon: 'box', title: only ? 'الأصناف دي في المخزن' : 'حال المخزن', sub: items.length + ' ' + plural(items.length, 'صنف', 'أصناف', 'صنف'),
      ledger: only ? [] : [
        { l: 'خلص أو هيخلص خلال أسبوع', v: bad.length ? bad.length + ' ' + plural(bad.length, 'صنف', 'أصناف', 'صنف') : 'مفيش', tone: bad.length ? 'bad' : 'ok' },
        { l: 'هيخلص خلال 3 أسابيع', v: low.length ? low.length + ' ' + plural(low.length, 'صنف', 'أصناف', 'صنف') : 'مفيش', tone: low.length ? 'warn' : 'ok' },
        { l: 'قيمة البضاعة', v: money(value) }
      ],
      rows: items.slice(0, 8).map(function (i) {
        return { l: i.name, sub: coverTxt(i) + (i.avg ? ' · بيتسحب ' + num(i.avg, i.avg < 10 ? 1 : 0) + ' في اليوم' : ''), v: num(i.bal) + ' ' + (i.unit || ''), tone: i.state === 'empty' || i.state === 'crit' ? 'bad' : i.state === 'low' ? 'warn' : 'ok', on: fn(function () { ask(i.name, { pid: i.id }); }) };
      }),
      acts: [], follow: ['طلعنا قد إيه ورق الشهر ده؟', 'أكتر صنف بيتباع']
    };
    if (bad.length || low.length) r.acts.push({ t: 'اعمل طلب شراء', pri: true, on: fn(function () { navigate('stock'); setTimeout(function () { if (window.AXStock) AXStock.tab('po'); }, 120); }) });
    r.acts.push({ t: 'افتح مخزوني', on: fn(function () { navigate('stock'); }) });
    return r;
  }

  function outputAns(p) {
    var s = sales(p).filter(function (x) { return x.qty > 0; });
    if (!s.length) return { icon: 'stack', title: 'المصروف من المخزن ' + p.label, sub: rangeTxt(p), note: 'مفيش صرف متسجل في الفترة دي.' };
    var byP = {}; s.forEach(function (x) { var k = x.pid || x.pname; var g = byP[k] || (byP[k] = { name: x.pname || 'صنف', unit: x.unit || '', q: 0, v: 0 }); g.q += x.qty; g.v += x.total; if (!g.unit && x.unit) g.unit = x.unit; });
    var list = Object.keys(byP).map(function (k) { var g = byP[k]; if (!g.unit) { var pr = A('products').find(function (y) { return y.id === k; }); if (pr) g.unit = pr.unit || ''; } return g; }).sort(function (a, b) { return b.v - a.v; });
    var mx = Math.max.apply(null, list.map(function (g) { return g.v; })) || 1;
    var cs = groupBy(s, 'cid', 'total').slice(0, 5), cmx = cs.length ? cs[0].v : 1;
    var pr = p.prev ? sales(p.prev) : null;
    return {
      icon: 'stack', title: 'اللي طلع من المخزن ' + p.label, sub: rangeTxt(p),
      ledger: [{ l: 'قيمة المصروف', v: money(sum(s, 'total')), d: pr ? delta(sum(s, 'total'), sum(pr, 'total')) : '', big: true }, { l: 'عدد العمليات', v: num(ops(s)) }],
      bars: { title: 'حسب الصنف', items: list.slice(0, 8).map(function (g) { return { l: g.name, txt: num(g.q) + ' ' + g.unit, sub: money(g.v), w: g.v / mx }; }) },
      bars2: { title: 'أكتر المراكز سحبًا', items: cs.map(function (x) { var c = cust(x.k); return { l: cname(x.k), txt: money(x.v), w: x.v / cmx, on: c ? fn(function () { ask('حساب ' + c.name, { cid: c.id }); }) : '' }; }) },
      follow: ['إيه اللي قرب يخلص في المخزن؟', 'قارن الشهر ده بالشهر اللي فات']
    };
  }

  function topProductsAns(p) {
    var s = sales(p); if (!s.length) return { icon: 'trophy', title: 'أكتر الأصناف مبيعًا ' + p.label, sub: rangeTxt(p), note: 'مفيش مبيعات في الفترة دي.' };
    var m = {}; s.forEach(function (x) { var k = x.pid || x.pname || '؟'; var g = m[k] || (m[k] = { name: x.pname || 'صنف', q: 0, v: 0, unit: x.unit || '' }); g.q += x.qty; g.v += x.total; });
    var list = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.v - a.v; }), mx = list[0].v || 1, tot = sum(s, 'total');
    return { icon: 'trophy', title: 'أكتر الأصناف مبيعًا ' + p.label, sub: rangeTxt(p),
      bars: { items: list.slice(0, 6).map(function (g) { return { l: g.name, txt: money(g.v), sub: num(g.q) + ' ' + g.unit + ' · ' + pct(g.v, tot) + '% من المبيعات', w: g.v / mx }; }) },
      follow: ['أكتر المراكز شراءً ' + p.label, 'إيه اللي قرب يخلص في المخزن؟'] };
  }
  function topCustomersAns(p) {
    var s = sales(p); if (!s.length) return { icon: 'trophy', title: 'أكتر المراكز شراءً ' + p.label, sub: rangeTxt(p), note: 'مفيش مبيعات في الفترة دي.' };
    var top = groupBy(s, 'cid', 'total').slice(0, 8), mx = top[0].v || 1, tot = sum(s, 'total');
    return { icon: 'trophy', title: 'أكتر المراكز شراءً ' + p.label, sub: rangeTxt(p),
      bars: { items: top.map(function (x) { var c = cust(x.k); var q = sum(s.filter(function (y) { return y.cid === x.k; }), 'qty'); return { l: cname(x.k), txt: money(x.v), sub: pct(x.v, tot) + '% من المبيعات · ' + num(q) + ' وحدة', w: x.v / mx, on: c ? fn(function () { ask('حساب ' + c.name, { cid: c.id }); }) : '' }; }) },
      note: top.length >= 3 && pct(top[0].v + top[1].v + top[2].v, tot) >= 60 ? 'أكبر 3 مراكز عاملين ' + pct(top[0].v + top[1].v + top[2].v, tot) + '% من المبيعات — حافظ عليهم كويس.' : '',
      follow: ['مراكز وقفت سحب', 'أكتر صنف بيتباع'] };
  }

  function compareAns(p) {
    if (!p.prev) p = period('', 'month');
    var a = sales(p), b = sales(p.prev), pa = sum(pays(p), 'amount'), pb = sum(pays(p.prev), 'amount');
    var ca = {}, cb = {}; a.forEach(function (x) { ca[x.cid] = 1; }); b.forEach(function (x) { cb[x.cid] = 1; });
    function row(l, x, y, f, inv) { return { l: l, v: f(x), d: delta(x, y, inv), sub: p.prev.label + ': ' + f(y) }; }
    var led = [
      row('المبيعات', sum(a, 'total'), sum(b, 'total'), money),
      row('التحصيل', pa, pb, money),
      row('عمليات الصرف والفواتير', ops(a), ops(b), function (v) { return num(v); }),
      row('مراكز اتعاملت', Object.keys(ca).length, Object.keys(cb).length, function (v) { return num(v); })
    ];
    if (allowed('expenses')) led.push(row('المصروفات', sum(exps(p), 'amount'), sum(exps(p.prev), 'amount'), money, true));
    var lost = Object.keys(cb).filter(function (k) { return !ca[k]; });
    return {
      icon: 'scale', title: 'مقارنة: ' + p.label, sub: rangeTxt(p) + ' قصاد ' + p.prev.label,
      ledger: led, compare: true,
      note: lost.length && p.to === today() ? lost.length + ' ' + plural(lost.length, 'مركز', 'مراكز', 'مركز') + ' سحبوا في الفترة اللي فاتت ولسه مسحبوش المرة دي: ' + lost.slice(0, 3).map(function (k) { return esc(cname(k)); }).join('، ') + (lost.length > 3 ? '…' : '') + '.' : '',
      follow: ['المبيعات ' + p.label, 'أكتر المراكز شراءً ' + p.label]
    };
  }

  function suppliersAns(sup) {
    if (!allowed('suppliers')) return noAccess('الموردين');
    if (typeof supplierMetrics !== 'function') return { icon: 'truck', title: 'الموردين', note: 'صفحة الموردين مش متاحة.' };
    if (sup) {
      var m = supplierMetrics(sup.id);
      return { icon: 'truck', title: sup.name, sub: sup.company || 'مورد',
        ledger: [{ l: 'عليك له', v: m.balance > 0.5 ? money(m.balance) : 'مفيش', big: true, tone: m.balance > 0.5 ? 'warn' : 'ok' }, { l: 'إجمالي المشتريات', v: money(m.totalPurchases) + ' (' + m.purchasesCount + ')' }, { l: 'إجمالي المدفوع', v: money(m.totalPaid) }]
          .concat(m.lastPurchaseDate ? [{ l: 'آخر شراء', v: dayName(m.lastPurchaseDate) }] : []).concat(m.lastPaymentDate ? [{ l: 'آخر سداد', v: dayName(m.lastPaymentDate) }] : []),
        acts: [{ t: 'افتح الموردين', on: fn(function () { navigate('suppliers'); }) }], follow: ['عليا كام للموردين؟'] };
    }
    var list = A('suppliers').map(function (s) { return { s: s, b: supplierMetrics(s.id).balance }; }).filter(function (x) { return x.b > 0.5; }).sort(function (a, b) { return b.b - a.b; });
    if (!list.length) return { icon: 'check', title: 'مفيش عليك حاجة للموردين', tone: 'ok' };
    var mx = list[0].b;
    return { icon: 'truck', title: 'اللي عليك للموردين', sub: list.length + ' ' + plural(list.length, 'مورد', 'موردين', 'مورد'),
      ledger: [{ l: 'الإجمالي', v: money(sum(list, 'b')), big: true, tone: 'warn' }],
      bars: { items: list.slice(0, 6).map(function (x) { return { l: x.s.name, txt: money(x.b), w: x.b / mx, on: fn(function () { ask(x.s.name, { sid: x.s.id }); }) }; }) },
      acts: [{ t: 'افتح الموردين', on: fn(function () { navigate('suppliers'); }) }], follow: ['التحصيل الشهر ده', 'الشيكات'] };
  }

  function chequesAns() {
    if (!allowed('cheques')) return noAccess('الشيكات');
    var list = (S()._cheques || []).filter(function (c) { return c.status === 'pending' || c.status === 'deposited'; });
    if (!list.length) return { icon: 'cheque', title: 'مفيش شيكات مفتوحة', tone: 'ok', acts: [{ t: 'افتح الشيكات', on: fn(function () { navigate('cheques'); }) }] };
    var t = today();
    list = list.slice().sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
    var inn = list.filter(function (c) { return c.dir === 'in'; }), out = list.filter(function (c) { return c.dir !== 'in'; });
    return { icon: 'cheque', title: 'الشيكات المفتوحة', sub: list.length + ' ' + plural(list.length, 'شيك', 'شيكات', 'شيك'),
      ledger: [{ l: 'ليك (وارد)', v: money(sum(inn, 'amount')) + ' — ' + inn.length, tone: 'ok' }, { l: 'عليك (صادر)', v: money(sum(out, 'amount')) + ' — ' + out.length, tone: out.length ? 'warn' : '' }],
      rows: list.slice(0, 8).map(function (c) { var d = daysBetween(t, c.due); return { l: (c.dir === 'in' ? 'من ' : 'لـ ') + (c.partyName || '—'), sub: 'شيك ' + (c.number || '') + (c.bank ? ' — ' + c.bank : '') + ' · ' + (d < 0 ? 'فات ميعاده بـ ' + (-d) + ' يوم' : d === 0 ? 'ميعاده النهارده' : 'بعد ' + d + ' يوم'), v: money(c.amount), tone: d < 0 ? 'bad' : d <= 3 ? 'warn' : '' }; }),
      acts: [{ t: 'افتح الشيكات', pri: true, on: fn(function () { navigate('cheques'); }) }] };
  }

  function expensesAns(p) {
    if (!allowed('expenses')) return noAccess('المصروفات');
    var e = exps(p), tot = sum(e, 'amount'), pr = p.prev ? sum(exps(p.prev), 'amount') : 0;
    if (!e.length) return { icon: 'receipt', title: 'المصروفات ' + p.label, sub: rangeTxt(p), note: 'مفيش مصروفات متسجلة في الفترة دي.' };
    var by = groupBy(e.map(function (x) { return { c: x.category || 'أخرى', a: +x.amount || 0 }; }), 'c', 'a'), mx = by[0].v || 1;
    return { icon: 'receipt', title: 'المصروفات ' + p.label, sub: rangeTxt(p),
      ledger: [{ l: 'الإجمالي', v: money(tot), d: p.prev ? delta(tot, pr, true) : '', big: true }, { l: 'عدد البنود', v: num(e.length) }],
      bars: { title: 'حسب البند', items: by.slice(0, 6).map(function (x) { return { l: x.k, txt: money(x.v), sub: pct(x.v, tot) + '%', w: x.v / mx }; }) },
      follow: ['الأرباح ' + p.label, 'قارن الشهر ده بالشهر اللي فات'] };
  }

  function customersAns() {
    var C = A('customers'), t = today(), last = {};
    A('issuances').forEach(function (i) { if (!last[i.customerId] || i.date > last[i.customerId]) last[i.customerId] = i.date; });
    var active = C.filter(function (c) { return last[c.id] && daysBetween(last[c.id], t) <= 30; });
    var asleep = C.filter(function (c) { return last[c.id] && daysBetween(last[c.id], t) > 30; }).sort(function (a, b) { return String(last[a.id]).localeCompare(String(last[b.id])); });
    var churn = []; try { churn = typeof computeChurnRisk === 'function' ? computeChurnRisk() : []; } catch (e) {}
    return { icon: 'users', title: 'المراكز', sub: C.length + ' ' + plural(C.length, 'مركز', 'مراكز', 'مركز') + ' متسجلين',
      ledger: [{ l: 'سحبوا آخر 30 يوم', v: num(active.length), tone: 'ok' }, { l: 'مسحبوش من أكتر من شهر', v: num(asleep.length), tone: asleep.length ? 'warn' : '' }, { l: 'عليهم فلوس', v: num(debtors().length) }, { l: 'معرضين نخسرهم', v: num(churn.length), tone: churn.length ? 'bad' : '' }],
      rows: asleep.slice(0, 6).map(function (c) { return { l: c.name, sub: 'آخر صرف من ' + daysBetween(last[c.id], t) + ' يوم', v: '', tone: 'warn', on: fn(function () { ask('حساب ' + c.name, { cid: c.id }); }) }; }),
      acts: churn.length ? [{ t: 'المعرضين للفقد', pri: true, on: fn(function () { tab('churn'); }) }] : [],
      follow: ['أكتر المراكز شراءً الشهر ده', 'مين متأخر في الدفع؟'] };
  }

  function prospectsAns() {
    var pr = (S()._prospects || []).filter(function (p) { return p.stage !== 'won' && p.stage !== 'lost'; });
    if (!pr.length) return { icon: 'target', title: 'مفيش فرص متسجلة', note: 'سجّل المراكز اللي بتكلمها عشان أفكّرك تتابعهم.', acts: [{ t: 'سجّل فرصة', pri: true, on: fn(function () { tab('prospects'); setTimeout(function () { if (typeof toggleProspectForm === 'function') toggleProspectForm(); }, 80); }) }] };
    var t = today(), late = pr.filter(function (p) { return !p.lastContact || daysBetween(p.lastContact, t) >= 7; });
    return { icon: 'target', title: 'الفرص والمستهدفين', sub: pr.length + ' ' + plural(pr.length, 'فرصة', 'فرص', 'فرصة') + ' مفتوحة',
      ledger: [{ l: 'القيمة المتوقعة', v: money(sum(pr, 'expectedValue')) }, { l: 'محتاجين متابعة (7 أيام من غير كلام)', v: num(late.length), tone: late.length ? 'warn' : 'ok' }],
      rows: pr.slice().sort(function (a, b) { return String(a.lastContact || '').localeCompare(String(b.lastContact || '')); }).slice(0, 6).map(function (p) { var d = p.lastContact ? daysBetween(p.lastContact, t) : null; return { l: p.company, sub: (typeof PROSPECT_STAGES !== 'undefined' && PROSPECT_STAGES[p.stage] ? PROSPECT_STAGES[p.stage].label : '') + (d != null ? ' · آخر كلام من ' + d + ' يوم' : ''), v: p.expectedValue ? money(p.expectedValue) : '', tone: d == null || d >= 7 ? 'warn' : '' }; }),
      acts: [{ t: 'افتح المستهدفين', pri: true, on: fn(function () { tab('prospects'); }) }] };
  }

  function invoicesAns(p) {
    var v = A('invoices').filter(function (x) { return inP(p, x.date); }), un = A('invoices').filter(function (x) { return x.status !== 'paid'; });
    var uninv = typeof issUninvoicedCount === 'function' ? issUninvoicedCount() : 0;
    var r = { icon: 'receipt', title: 'الفواتير ' + p.label, sub: rangeTxt(p),
      ledger: [{ l: 'فواتير الفترة', v: num(v.length) + ' — ' + money(sum(v, 'total')) }, { l: 'متوسط الفاتورة', v: v.length ? money(sum(v, 'total') / v.length) : '—' }, { l: 'مش مدفوعة بالكامل (كلها)', v: num(un.length), tone: un.length ? 'warn' : 'ok' }],
      acts: [{ t: 'افتح الفواتير', on: fn(function () { navigate('invoices'); }) }] };
    if (uninv) { r.ledger.push({ l: 'صرف لسه من غير فاتورة', v: num(uninv) }); r.acts.unshift({ t: 'فاتورة من الصرف', pri: true, on: fn(function () { navigate('issuances'); setTimeout(function () { if (typeof openInvoiceFromIssuances === 'function') openInvoiceFromIssuances(); }, 150); }) }); }
    return r;
  }

  function adviceAns() {
    var rows = [], t = today();
    var od = overdue();
    if (od.length) { var g = groupBy(od, 'customerId', 'remaining')[0], c = cust(g.k); rows.push({ l: 'حصّل من ' + cname(g.k), sub: 'عليه ' + money(g.v) + ' متأخرين', tone: 'bad', btns: [{ t: 'تحصيل', on: fn(function () { if (typeof openPaymentForm === 'function') openPaymentForm(g.k); }) }].concat(c && phoneOf(c) ? [{ t: 'واتساب', wa: true, on: fn(function () { sendStatement(g.k); }) }] : []) }); }
    var crit = stockModel().filter(function (i) { return i.state === 'crit' || i.state === 'empty'; });
    if (crit.length) rows.push({ l: 'اطلب ' + crit.slice(0, 2).map(function (i) { return i.name; }).join(' و') + (crit.length > 2 ? ' و' + (crit.length - 2) + ' كمان' : ''), sub: crit[0].name + ': ' + coverTxt(crit[0]), tone: 'bad', btns: [{ t: 'طلب شراء', on: fn(function () { navigate('stock'); setTimeout(function () { if (window.AXStock) AXStock.tab('po'); }, 120); }) }] });
    if (window.AXCheq && allowed('cheques')) { var ch = AXCheq.dueSoon(); if (ch.length) rows.push({ l: ch.length + ' ' + plural(ch.length, 'شيك', 'شيكات', 'شيك') + ' ميعادهم خلال 3 أيام', sub: 'بإجمالي ' + money(sum(ch, 'amount')), tone: 'warn', btns: [{ t: 'الشيكات', on: fn(function () { navigate('cheques'); }) }] }); }
    var churn = []; try { churn = (typeof computeChurnRisk === 'function' ? computeChurnRisk() : []).filter(function (r) { return r.risk === 'high'; }); } catch (e) {}
    if (churn.length) { var cc = churn[0].cu; rows.push({ l: 'كلّم ' + cc.name, sub: 'مسحبش من ' + churn[0].daysSince + ' يوم، وده مش عادته', tone: 'warn', btns: phoneOf(cc) ? [{ t: 'اتصال', href: 'tel:' + (cc.phone || '') }] : [{ t: 'المعرضين للفقد', on: fn(function () { tab('churn'); }) }] }); }
    var pr = (S()._prospects || []).filter(function (p) { return p.stage !== 'won' && p.stage !== 'lost' && (!p.lastContact || daysBetween(p.lastContact, t) >= 7); });
    if (pr.length) rows.push({ l: 'تابع ' + pr[0].company, sub: pr.length > 1 ? 'و' + (pr.length - 1) + ' فرص تانية مستنية متابعة' : 'فرصة مستنية متابعة', tone: '', btns: [{ t: 'المستهدفين', on: fn(function () { tab('prospects'); }) }] });
    var d = dt(t).getDate(), sent = (S()._stmtSent || {}), ym = t.slice(0, 7);
    if (d <= 7 && window.AXAging && allowed('aging')) { var due = debtors().filter(function (c) { return phoneOf(c) && !(sent[c.id] && String(sent[c.id]).slice(0, 7) === ym); }); if (due.length) rows.push({ l: 'ابعت كشوف أول الشهر', sub: due.length + ' ' + plural(due.length, 'مركز', 'مراكز', 'مركز') + ' لسه مبعتلهمش الشهر ده', tone: '', btns: [{ t: 'أعمار الديون', on: fn(function () { navigate('aging'); }) }] }); }
    if (!rows.length) return { icon: 'check', title: 'مفيش حاجة مستعجلة', note: 'مفيش متأخرات، والمخزن تمام، ومفيش شيكات قريبة. ركّز على مراكز جديدة.', tone: 'ok', follow: ['أكتر المراكز شراءً الشهر ده', 'الفرص والمستهدفين'] };
    return { icon: 'list', title: 'أولويات النهارده', sub: 'بالترتيب — الأهم الأول', rows: rows, ordered: true, follow: ['ملخص النهارده', 'قارن الشهر ده بالشهر اللي فات'] };
  }

  function helpAns() {
    var g = [
      ['الفلوس', ['مبيعات الشهر ده', 'اتحصّل كام الأسبوع ده؟', 'مين أكتر مركز عليه فلوس؟'].concat(allowed('profit') ? ['الأرباح الشهر اللي فات'] : [])],
      ['المراكز', ['حساب ' + ((A('customers')[0] || {}).name || 'مركز النور'), 'مين متأخر في الدفع؟', 'مراكز وقفت سحب']],
      ['المخزن', ['إيه اللي قرب يخلص؟', 'طلعنا قد إيه ورق الشهر ده؟', 'أكتر صنف بيتباع']],
      ['مقارنات وحسابات', ['قارن الشهر ده بالشهر اللي فات', 'أعمل إيه النهارده؟', '1500*12']]
    ];
    return { icon: 'spark', title: 'بتعرف تسألني عن إيه؟', sub: 'اكتب بطريقتك — بفهم الفترة واسم المركز أو الصنف',
      groups: g, note: 'ممكن تكمّل على آخر سؤال: «والشهر اللي فات؟» أو «وامبارح؟».' };
  }

  function calcAns(q) {
    var e = q.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '').replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
    if (!/^[\d.+\-*/()%]+$/.test(e) || !/\d[+\-*/%]/.test(e)) return null;
    var pctM = e.match(/^([\d.]+)%(?:\*|من)?([\d.]+)$/);
    var v;
    try { v = pctM ? (+pctM[1] / 100) * +pctM[2] : Function('"use strict";return (' + e.replace(/%/g, '/100') + ')')(); } catch (x) { return null; }
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return { icon: 'calc', title: num(v, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2), sub: q.trim(), plainOnly: true };
  }

  /* ───────────────────────── understanding ───────────────────────── */
  var I = {
    hi: W(['صباح', 'مساء', 'ازيك', 'إزيك', 'اهلا', 'أهلا', 'السلام', 'هاي', 'hello', 'hi']),
    thanks: W(['شكرا', 'شكراً', 'تسلم', 'متشكر', 'ميرسي', 'thanks', 'حبيبي']),
    help: W(['بتعرف تعمل', 'تقدر تعمل', 'تعرف تعمل', 'بتعمل ايه', 'مساعده', 'ساعدني', 'اسالك عن', 'اسألك عن', 'help']),
    brief: W(['ملخص', 'الوضع', 'اخبار', 'الموقف', 'تقرير', 'عامل ايه', 'ايه الدنيا']),
    compare: W(['قارن', 'مقارنه', 'مقارنة', 'بالنسبه للشهر', 'احسن ولا', 'أحسن ولا']),
    advice: W(['نصيحه', 'نصيحتك', 'انصحني', 'تنصحني', 'اعمل ايه', 'أعمل إيه', 'اولويات', 'أولويات', 'مهام', 'ابدا بايه', 'اقتراح']),
    prospects: W(['مستهدف', 'مستهدفين', 'فرص', 'فرصه', 'تعاقد', 'عملاء جداد']),
    cheques: W(['شيك', 'شيكات']),
    overdue: W(['متاخر', 'متأخر', 'متاخرين', 'متأخرين', 'فات ميعاد', 'عدى ميعاد', 'فات معاد', 'عدى معاد']),
    suppliers: W(['مورد', 'موردين', 'للموردين', 'مورّد']),
    expenses: W(['مصروف', 'مصاريف', 'مصروفات', 'صرفنا فلوس', 'نفقات']),
    profit: W(['ربح', 'ارباح', 'أرباح', 'مكسب', 'كسبنا', 'كسبت', 'هامش', 'صافي']),
    debts: W(['عليه فلوس', 'عليهم فلوس', 'مديون', 'مديونيه', 'مديونية', 'ديون', 'الدين', 'مستحق', 'فلوس برا', 'فلوسنا', 'عليه كام', 'عليهم كام', 'باقي على']),
    collect: W(['تحصيل', 'حصلنا', 'حصّلنا', 'حصلت', 'اتحصل', 'اتحصّل', 'قبضنا', 'دفعات', 'دفعوا', 'دخل الخزنه', 'الخزنه']),
    output: W(['طلعنا', 'صرفنا', 'اتصرف', 'طلع من', 'خرج من', 'استهلاك', 'سحبنا', 'المنصرف', 'المصروف من', 'كميه', 'كمية']),
    stock: W(['مخزن', 'مخزون', 'المخزن', 'رصيد الورق', 'قرب يخلص', 'هيخلص', 'يخلص', 'ناقص', 'نواقص', 'نطلب', 'طلب شراء', 'عندنا كام', 'فاضل كام', 'باقي كام', 'كام رزمه', 'الاصناف', 'الأصناف', 'بضاعه']),
    topP: W(['اكتر صنف', 'أكتر صنف', 'اكتر منتج', 'أكتر منتج', 'افضل صنف', 'أفضل صنف', 'افضل منتج', 'اكثر مبيع', 'الاكثر مبيعا', 'اكتر حاجه']),
    topC: W(['اكتر مركز', 'أكتر مركز', 'اكتر المراكز', 'أكتر المراكز', 'افضل مركز', 'أفضل مركز', 'افضل عميل', 'أفضل عميل', 'اكتر عميل', 'أكتر عميل', 'اكبر مركز', 'أكبر مركز', 'اكبر عميل', 'اكبر المراكز', 'أكبر المراكز', 'اكبر العملاء', 'اكتر العملاء', 'أكتر العملاء']),
    sales: W(['مبيعات', 'مبيعاتي', 'بعنا', 'بعت', 'بيع', 'البيع', 'ايراد', 'إيراد', 'ايرادات', 'دخلنا', 'شغلنا']),
    customers: W(['كام مركز', 'كام عميل', 'عدد العملاء', 'عدد المراكز', 'المراكز', 'العملاء', 'عملائي', 'وقفت سحب', 'وقفوا', 'بطلت', 'مسحبتش', 'نايمه', 'نايمين']),
    invoices: W(['فاتوره', 'فواتير', 'متوسط الفاتوره']),
    cust: W(['حساب', 'كشف', 'اخبار', 'بيسحب', 'سحب']),
    fc: W(['هيسحب', 'هيسحبوا', 'هتسحب', 'معاده', 'معادهم', 'ميعاده', 'ميعاد السحب', 'مواعيد السحب', 'معاد السحب', 'اكلم مين', 'أكلم مين', 'هكلم مين', 'نكلم مين', 'السحب الجاي', 'السحبه الجايه'])
  };

  /* 4.12 · expected withdrawals (js/forecast.js) */
  function forecastAns(c) {
    if (!window.AXFc) return null;
    var m = AXFc.model(), dd = function (n) { return n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يوم'; };
    var go = { t: 'افتح مواعيد السحب', pri: true, on: fn(function () { navigate('forecast'); }) };
    if (c) {
      var x = AXFc.forCustomer(c.id);
      if (!x) return { icon: 'clock', title: c.name, sub: 'لسه مفيش تاريخ كفاية', note: 'محتاجين المركز ده يكون سحب مرتين على الأقل عشان نعرف عادته.', acts: [go] };
      return { icon: 'clock', title: c.name + ' — ' + AXFc.label(x), sub: 'بيسحب كل ~' + dd(x.gap) + ' · آخر سحب ' + x.last,
        ledger: [{ l: 'السحبة الجاية المتوقعة', v: x.next, big: true, tone: x.st === 'late' ? 'bad' : x.st === 'due' ? 'warn' : '' }, { l: 'قيمتها التقريبية', v: money(x.value) }],
        rows: x.basket.map(function (b) { return { l: b.name, sub: 'الكمية المعتادة', v: num(b.qty) + ' ' + (b.unit || '') }; }),
        acts: [{ t: 'واتساب', pri: true, on: fn(function () { AXFc.wa(x.cid); }) }, go] };
    }
    var l = m.list.filter(function (x) { return x.st === 'late' || x.st === 'due' || x.st === 'week'; });
    if (!l.length) return { icon: 'clock', title: 'مفيش حد معاده قريب', tone: 'ok', note: 'محدش متأخر عن عادته ومحدش معاده الأسبوع ده.', acts: [go] };
    var late = l.filter(function (x) { return x.st === 'late'; }).length, due = l.filter(function (x) { return x.st === 'due'; }).length;
    return { icon: 'clock', title: 'مين معاده في السحب', sub: late + ' متأخر عن عادته · ' + due + ' النهارده وبكرة · ' + (l.length - late - due) + ' باقي الأسبوع',
      rows: l.slice(0, 8).map(function (x) { return { l: x.name, sub: AXFc.label(x) + ' · كل ~' + dd(x.gap), v: '≈ ' + money(x.value), tone: x.st === 'late' ? 'bad' : x.st === 'due' ? 'warn' : '' }; }),
      acts: [go], follow: ['مين متأخر في الدفع؟', 'مراكز وقفت سحب'] };
  }

  function understand(raw, force) {
    var q = N(raw);
    force = force || {};
    if (force.cid) { var c0 = cust(force.cid); if (c0) return customerAns(c0, period(q, 'month')); }
    if (force.pid) { var it0 = stockModel().find(function (i) { return i.id === force.pid; }); if (it0) return productAns(it0); }
    if (force.sid) { var s0 = A('suppliers').find(function (s) { return s.id === force.sid; }); if (s0) return suppliersAns(s0); }
    if (!q) return helpAns();
    var calc = calcAns(raw); if (calc) return calc;
    var words = q.split(' ').length;
    if (has(q, I.thanks) && words <= 4) return { icon: 'spark', title: 'العفو', note: 'تحب أجيبلك حاجة تانية؟', follow: ['ملخص النهارده', 'أعمل إيه النهارده؟'], plainOnly: true };
    if (has(q, I.help)) return helpAns();
    if (has(q, I.hi) && words <= 4 && !has(q, I.brief)) return brief();

    var per = function (def) { return period(q, def); };
    var set = function (intent, p) { st.ctx = { intent: intent, p: p }; };
    if (has(q, I.compare)) { var pc = has(q, W(['الشهر ده', 'الشهر دا', 'هذا الشهر'])) ? period('الشهر ده') : has(q, W(['الاسبوع ده', 'الأسبوع ده'])) ? period('الاسبوع') : per('month'); set('compare', pc); return compareAns(pc); }
    if (has(q, I.advice)) return adviceAns();
    if (has(q, I.prospects)) return prospectsAns();
    if (has(q, I.cheques)) return chequesAns();
    if (has(q, I.fc) && window.AXFc && (has(q, W(['سحب', 'يسحب', 'هيسحب', 'هيسحبوا', 'السحب'])) || !(has(q, I.overdue) || has(q, I.debts) || has(q, I.collect) || has(q, W(['دفع', 'الدفع', 'يدفع', 'سداد', 'فلوس']))))) { var fa = forecastAns(findCustomer(q)); if (fa) return fa; }
    var sup = findSupplier(q);
    if (sup && (has(q, I.suppliers) || !findCustomer(q))) return suppliersAns(sup);
    if (has(q, I.suppliers)) return suppliersAns();
    if (has(q, I.expenses) && !has(q, W(['المصروف من']))) { var pe = per('month'); set('expenses', pe); return expensesAns(pe); }
    if (has(q, I.profit)) { var pp = per('month'); set('profit', pp); return profitAns(pp); }

    var c = findCustomer(q);
    var ranking = has(q, I.topC) || has(q, I.topP);
    if (c && !ranking) return customerAns(c, per('month'));
    var prods = findProducts(q);
    if (prods.length && !ranking && !has(q, I.sales) && !has(q, I.output)) {
      var items = stockModel().filter(function (i) { return prods.some(function (p) { return p.id === i.id; }); });
      if (items.length === 1) return productAns(items[0]);
      if (items.length > 1) return stockAns(items.map(function (i) { return i.id; }));
    }
    if (has(q, I.overdue)) return overdueAns();
    if (has(q, I.debts) && !has(q, I.topP)) return debtsAns();
    if (has(q, I.collect)) { var pcl = per('month'); set('collect', pcl); return collectAns(pcl); }
    if (has(q, I.topP)) { var ptp = per('month'); set('topP', ptp); return topProductsAns(ptp); }
    if (has(q, I.topC)) { var ptc = per('month'); set('topC', ptc); return topCustomersAns(ptc); }
    if (has(q, I.output)) { var po = per('month'); set('output', po); return outputAns(po); }
    if (has(q, I.sales)) { var ps = per('month'); set('sales', ps); return salesAns(ps); }
    if (has(q, I.stock)) return stockAns();
    if (has(q, I.invoices)) { var pi = per('month'); set('invoices', pi); return invoicesAns(pi); }
    if (has(q, I.customers)) return customersAns();
    if (has(q, I.brief)) return brief();

    /* «والشهر اللي فات؟» — same question as before, another period */
    if (st.ctx && hasPeriod(q) && words <= 6) {
      var p2 = per('month'), x = st.ctx;
      if (x.intent === 'customer') { var cc = cust(x.cid); if (cc) return customerAns(cc, p2); }
      var map = { sales: salesAns, collect: collectAns, profit: profitAns, expenses: expensesAns, output: outputAns, topP: topProductsAns, topC: topCustomersAns, compare: compareAns, invoices: invoicesAns };
      if (map[x.intent]) { set(x.intent, p2); return map[x.intent](p2); }
    }
    if (hasPeriod(q) && words <= 4) { var pd = per('month'); set('sales', pd); return salesAns(pd); }
    if (prods.length) return stockAns(prods.map(function (p) { return p.id; }));
    return { icon: 'question', title: 'مش متأكد فهمت', note: 'جرّب تسأل بشكل تاني، أو اختار من دول:', follow: ['ملخص النهارده', 'مبيعات الشهر ده', 'مين أكتر مركز عليه فلوس؟', 'إيه اللي قرب يخلص؟', 'بتعرف تعمل إيه؟'] };
  }

  /* ───────────────────────── WhatsApp statement ───────────────────────── */
  function sendStatement(cid) {
    var c = cust(cid); if (!c) return;
    var ph = phoneOf(c); if (!ph) { if (typeof toast === 'function') toast('رقم تليفون المركز مش صحيح', 'error'); return; }
    var txt = (window.AXAging && AXAging.stmtText) ? AXAging.stmtText(cid) : ('السلام عليكم ' + c.name + '\nالمستحق عليكم: ' + money(c.balance));
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(txt), '_blank');
    try { var s = S(); if (!s._stmtSent || typeof s._stmtSent !== 'object') s._stmtSent = {}; s._stmtSent[cid] = today(); DB.save(); } catch (e) {}
  }

  /* ───────────────────────── drawing ───────────────────────── */
  var ICONS = {
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12"/>',
    wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16" cy="14" r="1.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    stack: '<path d="M12 3 2 8l10 5 10-5z"/><path d="M2 13l10 5 10-5"/><path d="M2 17.5l10 5 10-5"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    scale: '<path d="M12 3v18M5 21h14M6 7h12"/><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
    truck: '<rect x="1" y="6" width="14" height="10" rx="1"/><path d="M15 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    cheque: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h7M6 14h4M15 14l1.5 1.5L19 12"/>',
    receipt: '<path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    wa: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2z"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    new: '<path d="M12 5v14M5 12h14"/>'
  };
  function ic(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || ICONS.spark) + '</svg>'; }
  /* the assistant itself: three sheets of paper, the top one with a fold */
  function mark(cls) {
    return '<span class="axa-mark ' + (cls || '') + '" aria-hidden="true"><i></i><i></i><i></i></span>';
  }

  function ledgerHtml(L, compare) {
    if (!L || !L.length) return '';
    return '<dl class="axa-ledger' + (compare ? ' cmp' : '') + '">' + L.map(function (r) {
      return '<div class="' + (r.big ? 'big ' : '') + (r.tone ? 't-' + r.tone : '') + '"><dt>' + esc(r.l) + '</dt><i></i><dd>' + esc(r.v) + (r.d || '') + '</dd>' +
        (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</div>';
    }).join('') + '</dl>';
  }
  function barsHtml(B) {
    if (!B || !B.items || !B.items.length) return '';
    return '<div class="axa-block">' + (B.title ? '<h4>' + esc(B.title) + '</h4>' : '') + '<ol class="axa-bars">' + B.items.map(function (x) {
      var inner = '<span class="l">' + esc(x.l) + '</span><span class="v">' + esc(x.txt) + '</span>' +
        '<span class="b' + (x.tone ? ' t-' + x.tone : '') + '"><u style="width:' + Math.max(2, Math.round((x.w || 0) * 100)) + '%"></u></span>' +
        (x.sub ? '<small>' + esc(x.sub) + '</small>' : '');
      return '<li>' + (x.on ? '<button type="button" onclick="' + x.on + '">' + inner + '</button>' : '<div>' + inner + '</div>') + '</li>';
    }).join('') + '</ol></div>';
  }
  function sparkHtml(sp) {
    if (!sp || !sp.items || sp.items.length < 2) return '';
    var mx = Math.max.apply(null, sp.items.map(function (x) { return x.v; })) || 1, n = sp.items.length;
    return '<div class="axa-block"><div class="axa-spark" role="img" aria-label="المبيعات يوم بيوم">' + sp.items.map(function (x, i) {
      return '<span class="' + (i === n - 1 ? 'now' : '') + (x.v ? '' : ' zero') + '" style="height:' + Math.max(3, Math.round(x.v / mx * 100)) + '%" title="' + esc(x.l + ': ' + (sp.fmt ? sp.fmt(x.v) : num(x.v))) + '"></span>';
    }).join('') + '</div><div class="axa-spark-x"><span>' + esc(sp.items[0].l) + '</span><span>' + esc(sp.items[n - 1].l) + '</span></div></div>';
  }
  function rowsHtml(R, ordered) {
    if (!R || !R.length) return '';
    var tag = ordered ? 'ol' : 'ul';
    return '<' + tag + ' class="axa-rows' + (ordered ? ' ord' : '') + '">' + R.map(function (r) {
      var btns = (r.btns || []).map(function (b) { return b.href ? '<a class="axa-mini" href="' + esc(b.href) + '">' + esc(b.t) + '</a>' : '<button type="button" class="axa-mini' + (b.wa ? ' wa' : '') + '" onclick="' + b.on + '">' + esc(b.t) + '</button>'; }).join('');
      var main = '<span class="dot t-' + (r.tone || 'n') + '"></span><span class="m"><b>' + esc(r.l) + '</b>' + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</span>' + (r.v ? '<em>' + esc(r.v) + '</em>' : '');
      return '<li>' + (r.on ? '<button type="button" class="axa-rowb" onclick="' + r.on + '">' + main + '</button>' : '<div class="axa-rowb">' + main + '</div>') + (btns ? '<div class="axa-rowa">' + btns + '</div>' : '') + '</li>';
    }).join('') + '</' + tag + '>';
  }
  function groupsHtml(G) {
    if (!G) return '';
    return '<div class="axa-help">' + G.map(function (g) {
      return '<section><h4>' + esc(g[0]) + '</h4>' + g[1].map(function (q) { return '<button type="button" onclick="' + fn(function () { ask(q); }) + '">' + esc(q) + '</button>'; }).join('') + '</section>';
    }).join('') + '</div>';
  }
  function actsHtml(acts) {
    if (!acts || !acts.length) return '';
    return '<div class="axa-acts">' + acts.map(function (a) { return '<button type="button" class="' + (a.pri ? 'pri' : '') + (a.wa ? ' wa' : '') + '" onclick="' + a.on + '">' + esc(a.t) + '</button>'; }).join('') + '</div>';
  }
  function plain(r) {
    var L = [r.title + (r.sub ? ' — ' + r.sub : '')];
    (r.ledger || []).forEach(function (x) { L.push('• ' + x.l + ': ' + x.v + (x.d ? ' (' + x.d.replace(/<[^>]+>/g, '') + ')' : '')); });
    [r.bars, r.bars2].forEach(function (B) { if (B && B.items) { if (B.title) L.push('', B.title + ':'); B.items.forEach(function (x, i) { L.push((i + 1) + '. ' + x.l + ' — ' + x.txt); }); } });
    (r.rows || []).forEach(function (x, i) { L.push((r.ordered ? (i + 1) + '. ' : '• ') + x.l + (x.v ? ' — ' + x.v : '') + (x.sub ? ' (' + x.sub + ')' : '')); });
    if (r.note) L.push('', String(r.note).replace(/<[^>]+>/g, ''));
    return L.join('\n');
  }
  function slip(r, at) {
    var id = 'm' + (++st.fid);
    st.fns['c' + id] = function () { copy(plain(r)); };
    st.fns['w' + id] = function () { window.open('https://wa.me/?text=' + encodeURIComponent(plain(r) + '\n\n— ' + (S().companyName || 'نظام الحسابات')), '_blank'); };
    if (r.plainOnly) {
      return '<div class="axa-slip short' + (r.tone ? ' t-' + r.tone : '') + '"><header><span class="axa-ic">' + ic(r.icon) + '</span><div><b>' + esc(r.title) + '</b>' + (r.sub ? '<span>' + esc(r.sub) + '</span>' : '') + '</div></header>' + (r.note ? '<p class="axa-note">' + r.note + '</p>' : '') + '</div>';
    }
    return '<div class="axa-slip' + (r.tone ? ' t-' + r.tone : '') + '">' +
      '<header><span class="axa-ic">' + ic(r.icon) + '</span><div><b>' + esc(r.title) + '</b>' + (r.sub ? '<span>' + esc(r.sub) + '</span>' : '') + '</div></header>' +
      ledgerHtml(r.ledger, r.compare) + sparkHtml(r.spark) + barsHtml(r.bars) + barsHtml(r.bars2) + rowsHtml(r.rows, r.ordered) + groupsHtml(r.groups) +
      (r.note ? '<p class="axa-note">' + r.note + '</p>' : '') +
      actsHtml(r.acts) +
      '<footer><time>' + at + '</time><button type="button" onclick="AXA.run(\'c' + id + '\')" title="انسخ الرد">' + ic('copy') + '<span>نسخ</span></button>' +
      '<button type="button" onclick="AXA.run(\'w' + id + '\')" title="ابعت الرد على واتساب">' + ic('wa') + '<span>واتساب</span></button></footer>' +
    '</div>';
  }
  function copy(t) {
    function ok() { if (typeof toast === 'function') toast('اتنسخ'); }
    try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).then(ok, fallback); return; } } catch (e) {}
    fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove(); }
  }
  function clock() { var d = new Date(), h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0'); return (h % 12 || 12) + ':' + m + (h < 12 ? ' ص' : ' م'); }

  function msgHtml(m) {
    if (m.who === 'me') return '<div class="axa-msg me"><div class="axa-bubble">' + esc(m.q) + '</div></div>';
    return '<div class="axa-msg bot">' + mark() + m.html + '</div>';
  }
  function followHtml(list) {
    if (!list || !list.length) return '';
    return '<div class="axa-follow" role="group" aria-label="أسئلة مقترحة">' + list.map(function (q) { return '<button type="button" onclick="' + fn(function () { ask(q); }) + '">' + esc(q) + '</button>'; }).join('') + '</div>';
  }

  /* ───────────────────────── conversation ───────────────────────── */
  function ask(q, force) {
    q = String(q || '').trim();
    if (!q || st.busy) return;
    if (pageNow() !== 'aiassistant') { st.pending = { q: q, force: force }; navigate('aiassistant'); return; }
    if (st.tab !== 'chat') { st.tab = 'chat'; render(); }
    st.busy = true;
    var box = document.getElementById('axa-msgs'), inp = document.getElementById('axa-q');
    if (inp) inp.value = '';
    st.msgs.push({ who: 'me', q: q });
    var old = box && box.querySelector('.axa-follow'); if (old) old.remove();
    var start = box && box.querySelector('.axa-empty'); if (start) start.remove();
    if (st.msgs.length === 1) { var qh = document.querySelector('.axa-quick-h'); if (qh && !qh.querySelector('button')) qh.insertAdjacentHTML('beforeend', '<button type="button" onclick="AXA.clear()" aria-label="محادثة جديدة" title="محادثة جديدة">' + ic('new') + '<span>محادثة جديدة</span></button>'); }
    if (box) {
      box.insertAdjacentHTML('beforeend', msgHtml({ who: 'me', q: q }) + '<div class="axa-msg bot axa-thinking" id="axa-thinking">' + mark('busy') + '<span>بحسبها…</span></div>');
      scrollEnd();
    }
    var r;
    try { r = understand(q, force); } catch (e) { console.error(e); r = { icon: 'question', title: 'حصلت مشكلة وأنا بحسب', note: 'جرّب تاني، ولو اتكررت قول للمدير.', tone: 'bad' }; }
    setTimeout(function () {
      var th = document.getElementById('axa-thinking'); if (th) th.remove();
      var at = clock(), m = { who: 'bot', html: slip(r, at), follow: r.follow, q2: { q: q, f: force }, at: at };
      st.msgs.push(m);
      if (st.msgs.length > 60) st.msgs.splice(0, st.msgs.length - 60);
      if (box) { box.insertAdjacentHTML('beforeend', msgHtml(m) + followHtml(r.follow)); scrollEnd(true); }
      st.busy = false;
    }, 420 + Math.random() * 260);
  }
  function scrollEnd(toLastBot) {
    requestAnimationFrame(function () {
      var box = document.getElementById('axa-msgs'); if (!box) return;
      var el = toLastBot ? box.querySelectorAll('.axa-msg.me') : null;
      var target = el && el.length ? el[el.length - 1] : box.lastElementChild;
      if (!target) return;
      /* the messages scroll inside the chat box; the quick questions above stay put */
      var top = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
      try { box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); } catch (e) { box.scrollTop = top; }
    });
  }
  function pageNow() { try { return typeof currentPage !== 'undefined' ? currentPage : ''; } catch (e) { return ''; } }

  /* ───────────────────────── page ───────────────────────── */
  function greeting() {
    var h = new Date().getHours(), n = String(me().name || '').trim().split(' ')[0];
    return (h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير') + (n ? ' يا ' + n : '');
  }
  function heroLines() {
    var t = today(), P0 = { from: t, to: t }, s = sales(P0), py = sum(pays(P0).filter(function (x) { return +x.amount > 0; }), 'amount');
    var od = overdue(), low = stockModel().filter(function (i) { return i.state === 'crit' || i.state === 'empty'; });
    var n = ops(s), odSum = sum(od, 'remaining'), g = od.length ? groupBy(od, 'customerId', 'remaining') : [];
    var b;
    if (od.length) b = 'أكتر متأخرات عند <b>' + esc(cname(g[0].k)) + '</b>' + (low.length ? ' · و<b>' + low.length + '</b> ' + plural(low.length, 'صنف', 'أصناف', 'صنف') + ' في المخزن ' + (low.length === 1 ? 'قرب يخلص' : 'قربوا يخلصوا') : '') + '.';
    else if (low.length) b = '<b>' + low.length + '</b> ' + plural(low.length, 'صنف', 'أصناف', 'صنف') + ' في المخزن ' + (low.length === 1 ? 'قرب يخلص' : 'قربوا يخلصوا') + '.';
    else b = 'مفيش متأخرات، والمخزن تمام.';
    var kpis = [
      { c: 'b', l: 'صرف النهارده', v: n ? money(sum(s, 'total')) : '0', s: n ? n + ' ' + plural(n, 'عملية', 'عمليات', 'عملية') : 'لسه مفيش' },
      { c: 'g', l: 'اتحصّل النهارده', v: py > 0 ? money(py) : '0', s: py > 0 ? 'تحصيل' : 'لسه مفيش' },
      od.length ? { c: 'r', l: 'متأخرات', v: money(odSum), s: 'عند ' + g.length + ' ' + plural(g.length, 'مركز', 'مراكز', 'مركز') }
                : { c: low.length ? 'y' : 'g', l: 'المخزن', v: low.length ? String(low.length) : 'تمام', s: low.length ? plural(low.length, 'صنف قرب يخلص', 'أصناف قربت تخلص', 'صنف قربوا يخلصوا') : 'مفيش نواقص' }
    ];
    return { b: b, kpis: kpis, od: od.length, low: low.length };
  }
  /* the quick questions, pinned at the top of the chat — each topic has its own color */
  var CATS = [
    { k: 'money', name: 'الفلوس', icon: 'cash', qs: function () { return ['مبيعات الشهر ده', 'اتحصّل كام الأسبوع ده؟', 'مين أكتر مركز عليه فلوس؟'].concat(allowed('profit') ? ['الأرباح الشهر ده'] : []); } },
    { k: 'centers', name: 'المراكز', icon: 'building', qs: function () { return ['مين متأخر في الدفع؟', 'مين هيسحب الأسبوع ده؟', 'أكتر المراكز شراءً الشهر ده', 'مراكز وقفت سحب']; } },
    { k: 'stock', name: 'المخزن', icon: 'box', qs: function () { return ['إيه اللي قرب يخلص؟', 'طلعنا قد إيه ورق الشهر ده؟', 'أكتر صنف بيتباع']; } },
    { k: 'decide', name: 'قرارات', icon: 'scale', qs: function () { return ['أعمل إيه النهارده؟', 'قارن الشهر ده بالشهر اللي فات'].concat(allowed('suppliers') ? ['عليا كام للموردين؟'] : []); } }
  ];
  function quickHtml() {
    if (!st.cat) st.cat = 'money';
    return '<div class="axa-quick">' +
      '<div class="axa-quick-h"><div><b>اسألني عن أي حاجة في الشغل</b><span>دوس على سؤال، أو اكتب سؤالك تحت بطريقتك</span></div>' +
        (st.msgs.length ? '<button type="button" onclick="AXA.clear()" aria-label="محادثة جديدة" title="محادثة جديدة">' + ic('new') + '<span>محادثة جديدة</span></button>' : '') + '</div>' +
      '<div class="axa-qt" role="tablist">' + CATS.map(function (c) {
        return '<button type="button" role="tab" class="c-' + c.k + (st.cat === c.k ? ' on' : '') + '" aria-selected="' + (st.cat === c.k) + '" onclick="AXA.cat(\'' + c.k + '\')">' + ic(c.icon) + esc(c.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="axa-qg">' + CATS.map(function (c) {
        return '<section class="c-' + c.k + (st.cat === c.k ? ' on' : '') + '" data-cat="' + c.k + '"><h3>' + ic(c.icon) + esc(c.name) + '</h3><div class="axa-qc">' +
          c.qs().map(function (q) { return '<button type="button" onclick="' + fn(function () { ask(q); }) + '">' + esc(q) + '</button>'; }).join('') + '</div></section>';
      }).join('') + '</div>' +
    '</div>';
  }
  function counts() {
    var ch = 0, pr = 0;
    try { ch = typeof computeChurnRisk === 'function' ? computeChurnRisk().length : 0; } catch (e) {}
    pr = (S()._prospects || []).filter(function (p) { return p.stage !== 'won' && p.stage !== 'lost'; }).length;
    return { ch: ch, pr: pr };
  }

  function render() {
    var root = document.getElementById('page-content'); if (!root) return;
    st.fns = {}; st.fid = 0;
    var H = heroLines(), C = counts();
    var heroActs = [];
    if (H.od) heroActs.push(['المتأخرين', 'مين متأخر في الدفع؟']);
    if (H.low) heroActs.push(['اللي قرب يخلص', 'إيه اللي قرب يخلص في المخزن؟']);
    heroActs.push(['ملخص النهارده', 'ملخص النهارده'], ['أعمل إيه النهارده؟', 'أعمل إيه النهارده؟']);
    var html =
      '<section class="axa-hero axa-hero-c">' +
        '<div class="axa-hero-top"><h2><span class="axa-bot" aria-hidden="true">🤖</span><span>المساعد الذكي</span><span class="axa-spark" aria-hidden="true">✨</span></h2>' +
          '<small>' + esc(DAYS[dt(today()).getDay()] + ' ' + dm(today())) + '</small></div>' +
        '<div class="axa-kpis">' + H.kpis.map(function (k) { return '<div class="axa-kpi k-' + k.c + '" title="' + esc(k.s) + '"><span>' + esc(k.l) + '</span><b>' + esc(k.v) + '</b></div>'; }).join('') + '</div>' +
        '<div class="axa-hero-acts">' + heroActs.filter(function (a) { return a[0] !== 'أعمل إيه النهارده؟' || heroActs.length < 4; }).map(function (a) { return '<button type="button" onclick="' + fn(function () { ask(a[1]); }) + '">' + esc(a[0]) + '</button>'; }).join('') + '</div>' +
      '</section>' +
      '<nav class="axa-tabs" role="tablist">' +
        tabBtn('chat', 'المحادثة', 0) + tabBtn('churn', 'معرضين نخسرهم', C.ch) + tabBtn('prospects', 'المستهدفين', C.pr) +
      '</nav>';
    if (st.tab === 'chat') {
      /* answers are rebuilt from their questions: fresh numbers and live buttons after coming back */
      var body = st.msgs.map(function (m) { if (m.who === 'bot' && m.q2) { try { var r0 = understand(m.q2.q, m.q2.f); m.html = slip(r0, m.at || clock()); m.follow = r0.follow; } catch (e) {} } return msgHtml(m); }).join('');
      var lastBot = null; for (var i = st.msgs.length - 1; i >= 0; i--) if (st.msgs[i].who === 'bot') { lastBot = st.msgs[i]; break; }
      html += '<section class="axa-chat">' + quickHtml() +
        '<div class="axa-msgs" id="axa-msgs" aria-live="polite">' + (body || '<div class="axa-empty">' + mark() + '<p>أنا جاهز. اختار سؤال من فوق، أو اكتب سؤالك — بفهم العامية، والفترة («الشهر اللي فات»)، واسم المركز أو الصنف.</p></div>') + (lastBot ? followHtml(lastBot.follow) : '') + '</div>' +
        '<form class="axa-composer" onsubmit="AXA.send(event)">' +
          '<button type="button" class="axa-micb" id="axa-mic" onclick="AXA.mic()" aria-label="اسأل بصوتك" title="اسأل بصوتك"' + (voiceOk() ? '' : ' hidden') + '>' + ic('mic') + '</button>' +
          '<input id="axa-q" type="text" placeholder="مثلاً: حساب مركز النور، أو مبيعات الشهر اللي فات" autocomplete="off" enterkeyhint="send" aria-label="سؤالك">' +
          '<button type="submit" class="axa-sendb" aria-label="اسأل">' + ic('send') + '</button>' +
        '</form>' +
      '</section>';
    } else if (st.tab === 'churn') {
      html += '<div class="churn-section axa-panel"><div class="churn-head"><div><div class="churn-title">مراكز ممكن نخسرها</div><div class="churn-sub">مراكز قلّ سحبها عن عادتها، أو بقالها كتير مسحبتش ورق</div></div></div><div id="churn-list" class="churn-list"></div></div>';
    } else {
      html += '<div class="churn-section prospects-section axa-panel"><div class="churn-head"><div><div class="churn-title">المراكز المستهدفة</div><div class="churn-sub">فرص تعاقد جديدة — آخر كلام معاهم، والخطوة الجاية</div></div>' +
        '<button class="btn btn-primary btn-sm" onclick="toggleProspectForm()">سجّل فرصة</button></div>' +
        '<div id="prospect-summary" class="prospect-summary"></div><div id="prospect-form" class="prospect-form" style="display:none"></div><div id="prospects-list" class="churn-list"></div></div>';
    }
    root.innerHTML = '<div class="axa">' + html + '</div>';
    if (st.tab === 'churn' && typeof renderChurnRisk === 'function') renderChurnRisk();
    if (st.tab === 'prospects' && typeof renderProspects === 'function') renderProspects();
    if (st.tab === 'chat') {
      var mb = document.getElementById('axa-msgs'); if (mb && st.msgs.length) mb.scrollTop = mb.scrollHeight;
      if (st.pending) { var p = st.pending; st.pending = null; setTimeout(function () { ask(p.q, p.force); }, 60); }
      else if (window.matchMedia && window.matchMedia('(min-width: 769px)').matches) { var inp = document.getElementById('axa-q'); if (inp) inp.focus({ preventScroll: true }); }
    }
  }
  function tabBtn(k, label, n) {
    return '<button type="button" role="tab" aria-selected="' + (st.tab === k) + '" class="' + (st.tab === k ? 'on' : '') + '" onclick="AXA.tab(\'' + k + '\')">' + label + (n ? '<em>' + n + '</em>' : '') + '</button>';
  }
  function tab(k) {
    st.tab = k;
    if (pageNow() !== 'aiassistant') { navigate('aiassistant'); return; }
    render();
  }


  /* ───────────────────────── voice ───────────────────────── */
  function voiceOk() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function mic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, b = document.getElementById('axa-mic'), inp = document.getElementById('axa-q');
    if (!SR) return;
    if (st.rec) { try { st.rec.stop(); } catch (e) {} return; }
    var r = new SR(); r.lang = 'ar-EG'; r.interimResults = true; r.maxAlternatives = 1; st.rec = r;
    var fin = '';
    if (b) b.classList.add('on');
    if (inp) inp.placeholder = 'بسمعك…';
    r.onresult = function (e) { var t = ''; for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript; else t += e.results[i][0].transcript; } if (inp) inp.value = (fin + t).trim(); };
    r.onerror = function (e) { if (typeof toast === 'function') toast(e.error === 'not-allowed' ? 'المتصفح مش سامح بالميكروفون' : 'مسمعتش كويس، جرّب تاني', 'warning'); };
    r.onend = function () { st.rec = null; if (b) b.classList.remove('on'); if (inp) inp.placeholder = 'مثلاً: حساب مركز النور، أو مبيعات الشهر اللي فات'; if (fin.trim()) ask(fin.trim()); };
    try { r.start(); } catch (e) { st.rec = null; if (b) b.classList.remove('on'); }
  }

  window.renderAIAssistant = render;
  window.askAI = function (q) { var inp = document.getElementById('axa-q'); ask(q || (inp ? inp.value : '')); };
  window.aiAnswer = function (q) { return plain(understand(q)).replace(/\n/g, '<br>'); };
  window.AXA = {
    ask: function (q, f) { ask(q, f); }, understand: understand, plain: plain, period: period, N: N,
    run: function (id) { var f = st.fns[id]; if (f) f(); },
    send: function (e) { if (e) e.preventDefault(); var inp = document.getElementById('axa-q'); if (inp) ask(inp.value); },
    tab: tab, mic: mic,
    cat: function (k) { st.cat = k; document.querySelectorAll('.axa-qt button').forEach(function (b) { var on = b.classList.contains('c-' + k); b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); document.querySelectorAll('.axa-qg section').forEach(function (x) { x.classList.toggle('on', x.dataset.cat === k); }); },
    clear: function () { st.msgs = []; st.ctx = null; render(); }
  };
})();

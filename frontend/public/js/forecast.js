/* ════════════════════════════════════════════════════════════════════
   ERP · مواعيد السحب المتوقعة (4.12)
   ------------------------------------------------------------------
   البرنامج بيتعلّم من تاريخ كل مركز: بيسحب كل كام يوم (الوسيط مش
   المتوسط عشان سحبة شاذة متبوظش الحساب) وبيسحب إيه وبكام —
   ويطلّع إمتى غالباً هيسحب تاني، ومين متأخر عن عادته عشان تكلّمه قبل
   ما يروح لحد تاني.
   · صفحة «مواعيد السحب المتوقعة» + شريط أسبوعين + اتصال/واتساب/صرف
   · «سجّل التواصل» بيخفي التذكير مدة حسب النتيجة (هيسحب / مش دلوقتي /
     مردّش) — محفوظ في settings._calls عشان كل الفريق يشوفه
   · AXFc.reminders() بيغذي الإشعارات والرئيسية على الموبايل
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { f: '', day: '', q: '' };
  var HIDE = { will: 3, later: 7, noanswer: 1, wa: 1 };
  var OUT = { will: 'قال هيسحب قريب', later: 'مش محتاج دلوقتي', noanswer: 'مردّش', wa: 'اتبعتله واتساب' };
  var WD = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  var MO = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var cache = null;

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function calls() { var s = S(); if (!Array.isArray(s._calls)) s._calls = []; return s._calls; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function money(n) { var c = (S().currency || 'جنيه'); return num(n) + ' ' + (c === 'جنيه' ? 'ج' : c); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function ds(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function add(s, n) { var d = pd(s); d.setDate(d.getDate() + n); return ds(d); }
  function diff(a, b) { return Math.round((pd(b) - pd(a)) / 86400000); }
  function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function dd(n) { n = Math.abs(n); return n === 1 ? 'يوم' : n === 2 ? 'يومين' : (n <= 10 ? n + ' أيام' : n + ' يوم'); }
  function initial(name) {
    var w = String(name || '').trim().split(/\s+/), skip = /^(مركز|مستشفى|مستشفي|معمل|عيادة|عياده|صيدلية|صيدليه|شركة|شركه|مؤسسة|مؤسسه|د\.?|دكتور)$/;
    var k = w.find(function (x) { return x && !skip.test(x); }) || w[0] || '؟';
    k = k.replace(/^ال(?=..)/, '');
    return k.charAt(0) || '؟';
  }
  function short(s) { var d = pd(s); return d.getDate() + '/' + (d.getMonth() + 1); }
  function user() { var u = (typeof currentUser !== 'undefined' && currentUser) || {}; return { id: u.id || '', name: u.name || '' }; }
  function canGo(p) { try { return typeof can !== 'function' || can(p); } catch (e) { return true; } }

  /* ── every withdrawal day per center (issuances + invoices not made from an issuance) ── */
  function events() {
    var by = {}, linked = {}, units = {};
    A('products').forEach(function (p) { units[p.id] = p.unit || ''; });
    A('issuances').forEach(function (i) { if (i.invoiceId) linked[i.invoiceId] = 1; });
    function put(cid, date, pid, name, unit, qty, price, total) {
      if (!cid || !date) return;
      var c = by[cid] || (by[cid] = {});
      var d = c[date] || (c[date] = { items: {}, total: 0 });
      var k = pid || name || '?';
      var it = d.items[k] || (d.items[k] = { pid: pid || '', name: name || '', unit: unit || units[pid] || '', qty: 0, price: 0 });
      it.qty += Number(qty) || 0;
      if (Number(price) > 0) it.price = Number(price);
      d.total += Number(total) || (Number(qty) || 0) * (Number(price) || 0);
    }
    A('issuances').forEach(function (i) {
      if (i.status === 'cancelled') return;
      put(i.customerId, String(i.date || '').slice(0, 10), i.productId, i.productName, i.unit, i.quantity, i.unitPrice, i.total);
    });
    A('invoices').forEach(function (v) {
      if (v.sourceIssuanceId || v.sourceIssuance || v.fromIssuance || (v.fromIssuances && v.fromIssuances.length) || linked[v.id] || v.consolidatedIntoId) return;
      (v.items || []).forEach(function (it) {
        put(v.customerId, String(v.date || '').slice(0, 10), it.productId, it.productName || it.name, '', it.quantity != null ? it.quantity : it.qty, it.price, it.total);
      });
    });
    return by;
  }

  function lastCall(cid) {
    var l = calls().filter(function (x) { return x.cid === cid; });
    return l.sort(function (a, b) { return (b.at || 0) - (a.at || 0); })[0] || null;
  }

  function build() {
    var t = today(), ev = events(), out = [], fresh = 0;
    var custs = {}; A('customers').forEach(function (c) { custs[c.id] = c; });
    Object.keys(ev).forEach(function (cid) {
      var c = custs[cid]; if (!c) return;
      var days = Object.keys(ev[cid]).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x) && x <= t; }).sort();
      if (days.length < 2) { if (days.length) fresh++; return; }
      var recent = days.slice(-9), gaps = [];
      for (var i = 1; i < recent.length; i++) { var g = diff(recent[i - 1], recent[i]); if (g > 0) gaps.push(g); }
      if (!gaps.length) { fresh++; return; }
      var med = Math.max(1, Math.round(median(gaps)));
      var mad = median(gaps.map(function (g) { return Math.abs(g - med); }));
      var cv = mad / med;
      var conf = gaps.length >= 3 && cv <= 0.3 ? 'high' : (gaps.length >= 2 && cv <= 0.6 ? 'mid' : 'low');
      var last = days[days.length - 1], next = add(last, med), left = diff(t, next), since = diff(last, t);
      var tol = Math.max(1, Math.round(med * 0.2));
      var st = since > Math.max(med * 3, med + 45) ? 'stopped' : left < -tol ? 'late' : left <= 1 ? 'due' : left <= 7 ? 'week' : 'later';
      /* the usual basket: items that show up in ≥40% of the last six withdrawals, at their usual quantity */
      var lastDays = days.slice(-6), agg = {};
      lastDays.forEach(function (d) {
        var items = ev[cid][d].items;
        Object.keys(items).forEach(function (k) {
          var it = items[k], a = agg[k] || (agg[k] = { pid: it.pid, name: it.name, unit: it.unit, qs: [], price: 0, n: 0 });
          a.qs.push(it.qty); a.n++; if (it.price) a.price = it.price; if (it.name) a.name = it.name;
        });
      });
      var basket = Object.keys(agg).map(function (k) { var a = agg[k]; return { pid: a.pid, name: a.name, unit: a.unit, qty: Math.round(median(a.qs)), price: a.price, share: a.n / lastDays.length }; })
        .filter(function (x) { return x.share >= 0.4 && x.qty > 0; })
        .sort(function (a, b) { return b.qty * b.price - a.qty * a.price; });
      if (!basket.length) {
        var lastItems = ev[cid][last].items;
        basket = Object.keys(lastItems).map(function (k) { var it = lastItems[k]; return { pid: it.pid, name: it.name, unit: it.unit, qty: Math.round(it.qty), price: it.price, share: 1 }; });
      }
      basket = basket.slice(0, 4);
      var value = basket.reduce(function (s, x) { return s + x.qty * (x.price || 0); }, 0);
      var call = lastCall(cid), quiet = false;
      if (call && call.date >= last) quiet = diff(call.date, t) < (HIDE[call.outcome] || 1);
      out.push({ c: c, cid: cid, name: c.name || '', phone: c.phone || '', n: days.length, last: last, gap: med, conf: conf, next: next, left: left, since: since, tol: tol,
        st: st, basket: basket, value: value, call: call, quiet: quiet, pct: Math.min(100, Math.round(since / med * 100)) });
    });
    var rank = { late: 0, due: 1, week: 2, later: 3, stopped: 4 };
    out.sort(function (a, b) { return rank[a.st] - rank[b.st] || (a.st === 'late' ? a.left - b.left : a.left - b.left) || b.value - a.value; });
    return { list: out, fresh: fresh, t: t };
  }
  function model() {
    var k = [today(), A('issuances').length, A('invoices').length, calls().length, A('customers').length].join('|');
    if (cache && cache.k === k && Date.now() - cache.at < 5000) return cache.v;
    var v = build(); cache = { k: k, v: v, at: Date.now() };
    return v;
  }
  function reminders() { return model().list.filter(function (x) { return (x.st === 'late' || x.st === 'due') && !x.quiet; }); }
  function forCustomer(cid) { return model().list.find(function (x) { return x.cid === cid; }) || null; }

  function label(x) {
    if (x.st === 'stopped') return 'وقف من ' + dd(x.since);
    if (x.st === 'late') return 'متأخر ' + dd(-x.left) + ' عن عادته';
    if (x.st === 'due') return x.left < 0 ? 'كان معاده من ' + dd(-x.left) : x.left === 0 ? 'معاده النهارده' : 'معاده بكرة';
    return x.left === 2 ? 'بعد يومين' : 'بعد ' + dd(x.left);
  }
  var CONF = { high: 'ثقة عالية', mid: 'ثقة متوسطة', low: 'ثقة قليلة' };

  /* ── actions ── */
  function waText(x) {
    var s = S(), lines = ['السلام عليكم ' + x.name + ' 🌿', 'معاكم ' + (s.companyName || 'نظام الحسابات') + '.', 'حبينا نطمن عليكم ونسأل لو محتاجين:'];
    x.basket.forEach(function (b) { lines.push('• ' + num(b.qty) + ' ' + (b.unit || '') + ' ' + b.name); });
    lines.push('نجهّزها ونوصّلها في أقرب وقت.', 'شكراً لثقتكم 🙏');
    if (s.companyPhone) lines.push('📞 ' + s.companyPhone);
    return lines.join('\n');
  }
  function wa(cid) {
    var x = forCustomer(cid); if (!x) return;
    var digits = (typeof normalizeEgyptianPhone === 'function') ? normalizeEgyptianPhone(x.phone) : String(x.phone || '').replace(/\D/g, '');
    if (!digits) { T('مفيش رقم تليفون صحيح للمركز ده — ضيفه من «العملاء»', 'error'); return; }
    window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(waText(x)), '_blank');
    record(cid, 'wa', '');
  }
  function call(cid) {
    var x = forCustomer(cid); if (!x) return;
    if (!x.phone) { T('مفيش رقم تليفون للمركز ده — ضيفه من «العملاء»', 'error'); return; }
    location.href = 'tel:' + String(x.phone).replace(/[^\d+]/g, '');
    setTimeout(function () { logForm(cid); }, 900);
  }
  function sell(cid) {
    var x = forCustomer(cid);
    if (canGo('issuances') && typeof openIssuanceForm === 'function') openIssuanceForm(cid, x && x.basket[0] ? x.basket[0].pid : undefined);
    else if (typeof openNewInvoice === 'function') openNewInvoice();
  }
  function record(cid, outcome, note) {
    var u = user();
    calls().push({ id: 'cl_' + id(), cid: cid, date: today(), at: Date.now(), by: { id: u.id, name: u.name }, outcome: outcome, note: note || '' });
    if (u && (typeof currentUser !== 'undefined') && currentUser && currentUser.role === 'admin' && calls().length > 800) {
      var cut = add(today(), -180); S()._calls = calls().filter(function (x) { return x.date >= cut; });
    }
    cache = null;
    DB.save();
    try { if (typeof updateNotifBadge === 'function') updateNotifBadge(); } catch (e) {}
    if (typeof currentPage !== 'undefined' && currentPage === 'forecast') render();
  }
  function logForm(cid) {
    var x = forCustomer(cid); if (!x) return;
    var opt = function (v, t, h, on) { return '<label class="fc-opt"><input type="radio" name="fco" value="' + v + '"' + (on ? ' checked' : '') + '><span><b>' + t + '</b><em>' + h + '</em></span></label>'; };
    openModal('تسجيل تواصل — ' + esc(x.name),
      '<div class="fc-log"><p class="fc-log-lead">بيسحب كل ~' + dd(x.gap) + ' · آخر سحب ' + short(x.last) + ' · ' + esc(label(x)) + '</p>' +
      '<div class="fc-opts" role="radiogroup" aria-label="نتيجة التواصل">' +
        opt('will', 'هيسحب قريب', 'نخفي التذكير 3 أيام', true) + opt('later', 'مش محتاج دلوقتي', 'نخفيه أسبوع') + opt('noanswer', 'مردّش', 'نفكّرك بكرة') +
      '</div><div class="form-group" style="margin-top:12px"><label for="fc-note">ملاحظة (اختياري)</label>' +
      '<textarea class="form-control" id="fc-note" rows="2" placeholder="مثال: هيبعت مندوب يوم الخميس"></textarea></div></div>',
      '<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="AXFc.saveLog(\'' + cid + '\')">حفظ</button>');
  }
  function saveLog(cid) {
    var o = document.querySelector('input[name="fco"]:checked'), n = document.getElementById('fc-note');
    record(cid, o ? o.value : 'will', n ? n.value.trim() : '');
    closeModal(); T('اتسجل التواصل');
  }

  /* ════════ page ════════ */
  var IC = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M12 14v3l2 1"/></svg>'
  };
  function filtered(m) {
    var l = m.list.filter(function (x) { return x.st !== 'stopped'; }), q = ui.q.trim();
    if (q) {
      var n = (typeof normalizeArabic === 'function') ? normalizeArabic : function (s) { return String(s || '').toLowerCase(); };
      var nq = n(q); l = l.filter(function (x) { return n(x.name).indexOf(nq) >= 0 || String(x.phone).indexOf(q) >= 0; });
    }
    if (ui.day === 'late') return l.filter(function (x) { return x.st === 'late'; });
    if (ui.day) return l.filter(function (x) { return bucket(x, m.t) === ui.day; });
    if (ui.f === 'call') return l.filter(function (x) { return (x.st === 'late' || x.st === 'due') && !x.quiet; });
    if (ui.f === 'week') return l.filter(function (x) { return x.st === 'late' || x.left <= 7; });
    if (ui.f === 'called') return l.filter(function (x) { return x.quiet; });
    return l;
  }
  function bucket(x, t) { if (x.st === 'late') return 'late'; return x.next < t ? t : x.next; }

  function card(x) {
    var st = x.quiet ? 'quiet' : x.st;
    var basket = x.basket.map(function (b) { return '<span class="fc-chip"><b>' + num(b.qty) + '</b> ' + esc(b.unit || '') + ' · ' + esc(b.name) + '</span>'; }).join('');
    var called = x.call && x.call.date >= x.last
      ? '<div class="fc-called">' + IC.note + '<span>' + (x.call.date === today() ? 'النهارده' : short(x.call.date)) + ' — ' + esc(OUT[x.call.outcome] || '') + (x.call.note ? ' · «' + esc(x.call.note) + '»' : '') + (x.call.by && x.call.by.name ? ' <i>(' + esc(x.call.by.name) + ')</i>' : '') + '</span></div>' : '';
    return '<article class="fc-card st-' + st + '">' +
      '<header><span class="fc-av" aria-hidden="true">' + esc(initial(x.name)) + '</span>' +
        '<div class="fc-h"><b>' + esc(x.name) + '</b><span>بيسحب كل ~' + dd(x.gap) + ' · آخر سحب ' + short(x.last) + ' (من ' + dd(x.since) + ')</span></div>' +
        '<span class="fc-pill">' + esc(label(x)) + '</span></header>' +
      '<div class="fc-track" title="' + x.pct + '% من دورته المعتادة"><i style="width:' + x.pct + '%"></i></div>' +
      '<div class="fc-meta"><span>متوقع ' + WD[pd(x.next).getDay()] + ' ' + short(x.next) + '</span><span class="fc-conf c-' + x.conf + '"><i></i><i></i><i></i>' + CONF[x.conf] + ' · ' + x.n + ' سحبة</span></div>' +
      '<div class="fc-basket">' + basket + (x.value ? '<strong>≈ ' + money(x.value) + '</strong>' : '') + '</div>' + called +
      '<footer>' +
        '<button type="button" class="fc-b" onclick="AXFc.call(\'' + x.cid + '\')"' + (x.phone ? '' : ' disabled') + '>' + IC.phone + 'اتصال</button>' +
        '<button type="button" class="fc-b wa" onclick="AXFc.wa(\'' + x.cid + '\')"' + (x.phone ? '' : ' disabled') + '>' + IC.wa + 'واتساب</button>' +
        '<button type="button" class="fc-b" onclick="AXFc.log(\'' + x.cid + '\')">' + IC.note + 'سجّل</button>' +
        '<button type="button" class="fc-b pri" onclick="AXFc.sell(\'' + x.cid + '\')">' + IC.paper + 'صرف ورق</button>' +
      '</footer></article>';
  }
  function render() {
    var root = document.getElementById('fc-root'); if (!root) return;
    var m = model(), t = m.t, all = m.list.filter(function (x) { return x.st !== 'stopped'; });
    var late = all.filter(function (x) { return x.st === 'late'; }), due = all.filter(function (x) { return x.st === 'due'; });
    var week = all.filter(function (x) { return x.st === 'week'; });
    var toCall = all.filter(function (x) { return (x.st === 'late' || x.st === 'due') && !x.quiet; });
    var weekVal = all.filter(function (x) { return x.st !== 'later'; }).reduce(function (s, x) { return s + x.value; }, 0);
    if (!ui.f) ui.f = toCall.length ? 'call' : 'week';

    var cal = '<button type="button" class="fc-day late' + (ui.day === 'late' ? ' on' : '') + '" onclick="AXFc.day(\'late\')"><span>متأخرين</span><b>' + late.length + '</b><em>' + (late.length ? 'كلّمهم' : '—') + '</em></button>';
    for (var i = 0; i < 14; i++) {
      var d = add(t, i), n = all.filter(function (x) { return bucket(x, t) === d; });
      var v = n.reduce(function (s, x) { return s + x.value; }, 0);
      cal += '<button type="button" class="fc-day' + (i === 0 ? ' today' : '') + (ui.day === d ? ' on' : '') + (n.length ? ' has' : '') + '" onclick="AXFc.day(\'' + d + '\')">' +
        '<span>' + (i === 0 ? 'النهارده' : i === 1 ? 'بكرة' : WD[pd(d).getDay()]) + '</span><b>' + pd(d).getDate() + '</b>' +
        '<em>' + (n.length ? n.length + ' مركز' : '—') + '</em>' + (v ? '<i>' + (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K' : num(v)) + '</i>' : '') + '</button>';
    }
    var list = filtered(m);
    var chips = [['call', 'لازم تكلّمهم', toCall.length], ['week', 'الأسبوع ده', late.length + due.length + week.length], ['all', 'الكل', all.length], ['called', 'اتكلمنا معاهم', all.filter(function (x) { return x.quiet; }).length]];
    var stopped = m.list.filter(function (x) { return x.st === 'stopped'; });
    var dayLbl = ui.day === 'late' ? 'المتأخرين عن عادتهم' : ui.day ? (ui.day === t ? 'النهارده' : WD[pd(ui.day).getDay()] + ' ' + short(ui.day)) : '';

    root.innerHTML =
      '<div class="page-header"><div><h2 class="page-title">مواعيد السحب المتوقعة</h2>' +
        '<p class="page-subtitle">البرنامج بيتعلّم من تاريخ كل مركز: بيسحب كل كام يوم وبيسحب إيه — ويقولك مين معاده قرّب عشان تكلّمه قبل ما يروح لحد تاني</p></div></div>' +
      '<div class="fc-kpis">' +
        '<button type="button" class="fc-k t-bad" onclick="AXFc.day(\'late\')"><span>متأخرين عن عادتهم</span><b>' + late.length + '</b><em>مركز</em></button>' +
        '<button type="button" class="fc-k t-warn" onclick="AXFc.day(\'' + t + '\')"><span>معادهم النهارده وبكرة</span><b>' + due.length + '</b><em>مركز</em></button>' +
        '<button type="button" class="fc-k t-blue" onclick="AXFc.filter(\'week\')"><span>باقي الأسبوع</span><b>' + week.length + '</b><em>مركز</em></button>' +
        '<div class="fc-k t-ok"><span>المتوقع الأسبوع ده</span><b>' + money(weekVal) + '</b><em>لو كلهم سحبوا عادتهم</em></div>' +
      '</div>' +
      '<div class="fc-cal" role="tablist" aria-label="الأسبوعين الجايين">' + cal + '</div>' +
      '<div class="fc-bar">' +
        (ui.day ? '<span class="fc-dayf">' + IC.cal + esc(dayLbl) + ' <button type="button" onclick="AXFc.day(\'\')" aria-label="إلغاء فلتر اليوم">×</button></span>'
          : '<div class="fc-chips">' + chips.map(function (c) { return '<button type="button" class="' + (ui.f === c[0] ? 'on' : '') + '" onclick="AXFc.filter(\'' + c[0] + '\')">' + c[1] + ' <em>' + c[2] + '</em></button>'; }).join('') + '</div>') +
        '<input type="search" class="form-control fc-q" id="fc-q" placeholder="ابحث باسم المركز أو التليفون" value="' + esc(ui.q) + '">' +
      '</div>' +
      (list.length ? '<div class="fc-list">' + list.map(card).join('') + '</div>'
        : '<div class="fc-empty">' + IC.cal + '<b>' + (all.length ? 'مفيش مراكز هنا' : 'لسه مفيش تاريخ كفاية') + '</b><span>' +
          (all.length ? (ui.f === 'call' && !ui.day ? 'كله تمام — مفيش حد متأخر عن عادته ومحدش معاده النهارده' : 'جرّب فلتر تاني') : 'محتاجين كل مركز يكون سحب مرتين على الأقل عشان نعرف عادته') + '</span></div>') +
      (stopped.length ? '<details class="fc-more"><summary>مراكز وقفت سحب (' + stopped.length + ')</summary><ul>' +
        stopped.map(function (x) { return '<li><b>' + esc(x.name) + '</b><span>كان بيسحب كل ~' + dd(x.gap) + ' · آخر سحب ' + short(x.last) + ' (من ' + dd(x.since) + ')</span><button type="button" onclick="AXFc.wa(\'' + x.cid + '\')"' + (x.phone ? '' : ' disabled') + '>واتساب</button></li>'; }).join('') +
        '</ul></details>' : '') +
      (m.fresh ? '<p class="fc-note">' + m.fresh + ' مركز سحب مرة واحدة بس — محتاجين سحبة كمان عشان نعرف عادتهم.</p>' : '');
    var q = document.getElementById('fc-q');
    if (q) q.addEventListener('input', function () {
      ui.q = q.value; var pos = q.selectionStart; render();
      var q2 = document.getElementById('fc-q'); if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }
    });
    var on = root.querySelector('.fc-day.on'); if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
  }
  window.renderForecast = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="fc" id="fc-root"></div>';
    render();
  };

  window.AXFc = {
    model: model, reminders: reminders, forCustomer: forCustomer, label: label, render: window.renderForecast,
    call: call, wa: wa, sell: sell, log: logForm, saveLog: saveLog, record: record, waText: waText,
    filter: function (f) { ui.f = f; ui.day = ''; render(); },
    day: function (d) { ui.day = ui.day === d ? '' : d; render(); },
    _reset: function () { cache = null; }
  };
})();

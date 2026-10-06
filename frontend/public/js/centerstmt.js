/* ════════════════════════════════════════════════════════════════════
   ERP · «كشف مركز» في التحصيل والمديونيات (4.21)
   زرار جديد: تدوّر على أي مركز بأي حرف (نفس شكل قايمة البحث العايمة)
   وتختاره ← يطلعلك كل اللي عليه:
     · الباقي عليه دلوقتي + إجمالي المسحوب والمدفوع
     · كل عملية صرف/فاتورة: مسددة ✓ · جزئي (باقي كام) · مش مسددة (من كام يوم)
     · التحصيلات اللي دفعها
   ومنه على طول: تحصيل · واتساب · كشف الحساب الكامل.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ID = 'axst', view = 'pick', cid = null, filt = 'all', q = '', act = 0, kb = false;

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function cur() { var c = (D().settings || {}).currency || 'جنيه'; return c === 'جنيه' ? 'ج' : c; }
  function today() { return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10); }
  function pd(s) { var p = String(s || '').slice(0, 10).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function days(a) { return Math.max(0, Math.round((pd(today()) - pd(a)) / 86400000)); }
  function dd(n) { return n === 0 ? 'النهارده' : n === 1 ? 'امبارح' : n === 2 ? 'من يومين' : n <= 10 ? 'من ' + n + ' أيام' : 'من ' + n + ' يوم'; }
  function canGo(p) { try { return typeof can !== 'function' || can(p); } catch (e) { return false; } }
  function od() { var R = window.AXRules ? AXRules.get() : {}; return N(R.overdueDays) || 30; }
  function dfmt(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : esc(s || ''); }

  /* Arabic-tolerant search with highlight (same rules as the floating picker) */
  function nch(c) {
    if (/[ً-ٰٟـء]/.test(c)) return '';
    if (/[إأآٱ]/.test(c)) return 'ا';
    if (c === 'ة') return 'ه'; if (c === 'ى' || c === 'ئ') return 'ي'; if (c === 'ؤ') return 'و';
    if (/\s/.test(c)) return ' ';
    return c.toLowerCase();
  }
  function nmap(s) { var out = '', map = []; s = String(s || ''); for (var i = 0; i < s.length; i++) { var m = nch(s[i]); for (var j = 0; j < m.length; j++) { out += m[j]; map.push(i); } } return { s: out, map: map }; }
  function nq(x) { return nmap(String(x || '').trim().replace(/\s+/g, ' ')).s; }
  function hl(text, k) {
    if (!k) return esc(text);
    var m = nmap(text), at = m.s.indexOf(k); if (at < 0) return esc(text);
    var a = m.map[at], b = m.map[at + k.length - 1] + 1;
    return esc(text.slice(0, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>' + esc(text.slice(b));
  }

  /* ════════ the numbers for one center ════════ */
  function model(id) {
    var c = A('customers').find(function (x) { return x.id === id; }); if (!c) return null;
    var groups = {}, order = [];
    A('issuances').forEach(function (i) {
      if (i.customerId !== id) return;
      var k = i.invoiceId || ('n' + (i.number || i.id) + '|' + (i.date || ''));
      var g = groups[k];
      if (!g) { g = groups[k] = { kind: 'صرف', no: i.number, date: i.date || '', ts: N(i.createdAt), due: i.dueDate || '', items: [], total: 0, paid: 0 }; order.push(g); }
      g.items.push({ name: i.productName || 'صنف', qty: N(i.quantity), unit: i.productUnit || '' });
      g.total += N(i.total); g.paid += Math.min(N(i.paid), N(i.total));
      if (i.date && (!g.date || i.date < g.date)) g.date = i.date;
    });
    A('invoices').forEach(function (v) {
      if (v.customerId !== id || v.sourceIssuanceId || v.sourceIssuance) return;   // issued paper = already counted above
      order.push({ kind: 'فاتورة', no: v.number, date: v.date || '', ts: N(v.createdAt), due: v.dueDate || '',
        items: (v.items || []).map(function (it) { return { name: it.productName || it.name || 'صنف', qty: N(it.quantity), unit: it.productUnit || it.unit || '' }; }),
        total: N(v.total), paid: Math.min(N(v.paid), N(v.total)) });
    });
    var limit = od();
    order.forEach(function (g) {
      g.rem = Math.max(0, g.total - g.paid);
      g.st = g.rem <= 0.5 ? 'paid' : g.paid > 0.5 ? 'part' : 'open';
      g.age = days(g.date);
      g.late = g.st !== 'paid' && g.age > limit;
    });
    var bal = N(c.balance), sumRem = order.reduce(function (t, g) { return t + g.rem; }, 0);
    if (bal - sumRem > 0.5) order.push({ kind: 'رصيد', no: '', date: '', ts: 0, items: [], total: bal - sumRem, paid: 0, rem: bal - sumRem, st: 'open', age: 0, late: false, old: true });
    order.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || b.ts - a.ts; });
    var pays = A('payments').filter(function (p) { return p.customerId === id; })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || N(b.createdAt) - N(a.createdAt); });
    return {
      c: c, bal: bal, ops: order, pays: pays,
      took: order.reduce(function (t, g) { return t + g.total; }, 0),
      paidSum: pays.reduce(function (t, p) { return t + N(p.amount); }, 0),
      n: { all: order.length, open: order.filter(function (g) { return g.st !== 'paid'; }).length, paid: order.filter(function (g) { return g.st === 'paid'; }).length, pays: pays.length }
    };
  }

  /* ════════ picking a center ════════ */
  function centers() {
    var last = {}, limit = od();
    A('issuances').forEach(function (i) { if (i.customerId && i.date && (!last[i.customerId] || i.date > last[i.customerId])) last[i.customerId] = i.date; });
    return A('customers').map(function (c) {
      var bal = N(c.balance), old = (window.AXCredit && AXCredit.oldestUnpaid) ? AXCredit.oldestUnpaid(c.id) : null, age = old ? days(old) : 0;
      return { id: c.id, name: c.name + (c.company ? ' - ' + c.company : ''), extra: c.phone || '', bal: bal, last: last[c.id] || '', st: bal <= 0.5 ? 'ok' : (age > limit ? 'bad' : 'warn'), age: age };
    }).sort(function (a, b) { return (b.bal > 0.5) - (a.bal > 0.5) || b.bal - a.bal || a.name.localeCompare(b.name, 'ar'); });
  }
  function pickHTML() {
    return '<div class="axst-top"><div class="axst-tt"><span class="axst-badge">🔎</span><div><b>كشف مركز</b><em>اختار أي مركز يطلعلك كل اللي عليه — مسدد ولا لأ</em></div></div>' +
      '<button type="button" class="mo-x" onclick="AXStmt.close()" aria-label="اقفل">✕</button></div>' +
      '<label class="axst-fld"><span class="axp-ic">🔍</span><input id="axst-q" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="اكتب أي حرف من اسم المركز…" value="' + esc(q) + '"><span class="axp-n" id="axst-n"></span></label>' +
      '<div class="axst-list" id="axst-list" role="listbox"></div>' +
      '<div class="axp-foot axst-foot"><span>🟢 خالص · 🟠 عليه فلوس · 🔴 متأخر</span><span>اكتب أي حرف</span></div>';
  }
  function renderList() {
    var box = document.getElementById('axst-list'); if (!box) return;
    var k = nq(q), on = !!k || kb, all = centers(), shown = all.filter(function (o) { return !k || nmap(o.name + ' ' + o.extra).s.indexOf(k) >= 0; });
    if (act >= shown.length) act = shown.length - 1; if (act < 0) act = 0;
    var html = shown.map(function (o, n) {
      var bits = [];
      if (o.last) bits.push('صرف ' + dd(days(o.last)));
      bits.push(o.st === 'ok' ? '<span class="axp-ok">خالص</span>' : 'عليه <b class="axp-' + o.st + '">' + num(o.bal) + ' ' + cur() + '</b>' + (o.st === 'bad' ? ' · متأخر ' + o.age + ' يوم' : ''));
      return '<div class="axp-row' + (on && n === act ? ' hi' : '') + '" data-id="' + esc(o.id) + '" role="option"><span class="axp-dot axp-d-' + o.st + '"></span>' +
        '<div class="axp-tx"><div class="axp-nm">' + hl(o.name, k) + '</div><div class="axp-sub">' + bits.join(' · ') + '</div></div>' +
        (on && n === act ? '<span class="axp-go">↵</span>' : '<span class="axst-chev">‹</span>') + '</div>';
    }).join('');
    if (!shown.length) html = '<div class="axp-empty">' + (all.length ? 'مفيش مركز اسمه «' + esc(q.trim()) + '»' : 'لسه مفيش مراكز متسجلة') + '</div>';
    box.innerHTML = html;
    var n = document.getElementById('axst-n'); if (n) n.textContent = k && shown.length ? shown.length + (shown.length === 1 ? ' نتيجة' : ' نتايج') : '';
    box._shown = shown;
  }

  /* ════════ the statement ════════ */
  var ST = { paid: ['مسددة', 'ok'], part: ['جزئي', 'warn'], open: ['مش مسددة', 'bad'] };
  function opHTML(g) {
    var pct = g.total > 0 ? Math.round(g.paid / g.total * 100) : 0, s = ST[g.st];
    var items = g.items.slice(0, 3).map(function (it) { return (it.qty ? num(it.qty) + ' × ' : '') + esc(it.name); }).join('، ') + (g.items.length > 3 ? ' +' + (g.items.length - 3) : '');
    if (g.old) return '<div class="axst-op st-open"><div class="axst-op-h"><span class="axst-pill p-bad">مش مسدد</span><b>رصيد قديم</b><strong>' + num(g.rem) + ' <small>' + cur() + '</small></strong></div>' +
      '<div class="axst-op-s">مبلغ عليه من قبل كده مش متفصّل في فواتير (رصيد افتتاحي أو تعديل)</div></div>';
    return '<div class="axst-op st-' + g.st + (g.late ? ' late' : '') + '">' +
      '<div class="axst-op-h"><span class="axst-pill p-' + s[1] + '">' + (g.st === 'paid' ? '✓ ' : '') + s[0] + '</span>' +
        '<b>' + g.kind + (g.no ? ' <bdi>#' + esc(g.no) + '</bdi>' : '') + '</b><strong>' + num(g.total) + ' <small>' + cur() + '</small></strong></div>' +
      '<div class="axst-op-s"><span>📅 ' + dfmt(g.date) + (g.st !== 'paid' ? ' · ' + dd(g.age) : '') + (g.late ? ' · <b class="axp-bad">متأخرة</b>' : '') + '</span>' + (items ? '<span class="axst-it">' + items + '</span>' : '') + '</div>' +
      (g.st === 'paid' ? '' :
        '<div class="axst-op-b"><i class="axst-bar"><u style="width:' + pct + '%"></u></i><span>دفع ' + num(g.paid) + ' · <b>باقي ' + num(g.rem) + ' ' + cur() + '</b></span></div>') +
      '</div>';
  }
  function payHTML(p) {
    return '<div class="axst-op axst-pay"><div class="axst-op-h"><span class="axst-pill p-ok">💵 تحصيل</span><b>' + esc(p.method || 'نقدي') + (p.reference ? ' · ' + esc(p.reference) : '') + '</b><strong class="axp-ok">' + num(p.amount) + ' <small>' + cur() + '</small></strong></div>' +
      '<div class="axst-op-s"><span>📅 ' + dfmt(p.date) + '</span>' + (p.note ? '<span class="axst-it">' + esc(p.note) + '</span>' : '') + '</div></div>';
  }
  function stmtHTML() {
    var m = model(cid); if (!m) { view = 'pick'; return pickHTML(); }
    var owes = m.bal > 0.5;
    var chips = [['all', 'الكل', m.n.all], ['open', 'مش مسدد', m.n.open], ['paid', 'مسدد', m.n.paid], ['pays', 'الدفعات', m.n.pays]].map(function (c) {
      return '<button type="button" class="axst-chip' + (filt === c[0] ? ' on' : '') + (c[0] === 'open' && c[2] ? ' red' : '') + '" onclick="AXStmt.filter(\'' + c[0] + '\')">' + c[1] + ' <i>' + c[2] + '</i></button>';
    }).join('');
    var body;
    if (filt === 'pays') body = m.pays.length ? m.pays.map(payHTML).join('') : '<div class="axp-empty">مدفعش أي تحصيلات لسه</div>';
    else {
      var ops = m.ops.filter(function (g) { return filt === 'all' || (filt === 'open' ? g.st !== 'paid' : g.st === 'paid'); });
      body = ops.length ? ops.map(opHTML).join('') : '<div class="axp-empty">' + (filt === 'open' ? 'كل حاجة متسددة 🎉' : filt === 'paid' ? 'مفيش عمليات متسددة بالكامل لسه' : 'مفيش عمليات للمركز ده لسه') + '</div>';
    }
    var acts = '';
    if (canGo('payments') && typeof openPaymentForm === 'function') acts += '<button type="button" class="axst-act ok" onclick="AXStmt.pay()">💰 تحصيل</button>';
    if (owes && m.c.phone && typeof sendDebtReminderWhatsApp === 'function') acts += '<button type="button" class="axst-act wa" onclick="AXStmt.wa()">📲 واتساب</button>';
    if (typeof viewCustomerStatement === 'function') acts += '<button type="button" class="axst-act" onclick="AXStmt.full()">📄 الكشف الكامل</button>';
    return '<div class="axst-top"><button type="button" class="axst-back" onclick="AXStmt.back()" aria-label="مركز تاني">→ مركز تاني</button>' +
        '<button type="button" class="mo-x" onclick="AXStmt.close()" aria-label="اقفل">✕</button></div>' +
      '<div class="axst-hero ' + (owes ? 'owes' : 'clear') + '">' +
        '<div class="axst-who"><b>' + esc(m.c.name) + '</b>' + (m.c.company || m.c.phone ? '<em>' + esc([m.c.company, m.c.phone].filter(Boolean).join(' · ')) + '</em>' : '') + '</div>' +
        '<span class="axst-lbl">' + (owes ? 'الباقي عليه' : m.bal < -0.5 ? 'ليه رصيد عندك' : 'الحساب') + '</span>' +
        '<div class="axst-big">' + (owes || m.bal < -0.5 ? num(Math.abs(m.bal)) + ' <small>' + cur() + '</small>' : 'خالص ✓') + '</div>' +
        '<div class="axst-kpis"><div><span>المسحوب</span><b>' + num(m.took) + '</b></div><div><span>المدفوع</span><b>' + num(m.paidSum) + '</b></div><div><span>مش مسددة</span><b>' + m.n.open + '</b></div></div>' +
      '</div>' +
      '<div class="axst-chips" role="tablist">' + chips + '</div>' +
      '<div class="axst-ops">' + body + '</div>' +
      (acts ? '<div class="axst-acts">' + acts + '</div>' : '');
  }

  /* ════════ sheet ════════ */
  function sheet() {
    var el = document.getElementById(ID);
    if (!el) {
      el = document.createElement('div'); el.id = ID; el.className = 'mh-sheet axst-sheet ax-hl-off';
      el.innerHTML = '<div class="mh-scrim" onclick="AXStmt.close()"></div><div class="mh-panel mo axst" role="dialog" aria-modal="true" aria-label="كشف مركز"><div class="mh-grip"></div><div class="axst-in" id="axst-in"></div></div>';
      document.body.appendChild(el);
      el.addEventListener('input', function (e) { if (e.target.id === 'axst-q') { q = e.target.value; act = 0; kb = false; renderList(); } });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { close(); return; }
        if (e.target.id !== 'axst-q') return;
        var sh = (document.getElementById('axst-list') || {})._shown || [];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); kb = true; act = (act + (e.key === 'ArrowDown' ? 1 : -1) + sh.length) % Math.max(1, sh.length); renderList(); var h = document.querySelector('#axst-list .hi'); if (h) h.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter') { e.preventDefault(); if (sh[act]) choose(sh[act].id); }
      });
      el.addEventListener('click', function (e) { var r = e.target.closest && e.target.closest('#axst-list [data-id]'); if (r) choose(r.getAttribute('data-id')); });
    }
    return el;
  }
  function draw(focus) {
    var el = sheet(), box = document.getElementById('axst-in');
    box.innerHTML = view === 'pick' ? pickHTML() : stmtHTML();
    el.querySelector('.axst').classList.toggle('axst-s', view !== 'pick');
    if (view === 'pick') {
      renderList();
      if (focus) { var i = document.getElementById('axst-q'); if (i) setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (x) {} }, window.matchMedia('(pointer: coarse)').matches ? 360 : 60); }
    }
    var p = el.querySelector('.mh-panel'); if (p) p.scrollTop = 0;
  }
  function choose(id) { cid = id; filt = 'all'; view = 'stmt'; try { document.activeElement && document.activeElement.blur(); } catch (e) {} draw(); }
  function open(id) {
    var el = sheet();
    if (id) { cid = id; view = 'stmt'; filt = 'all'; } else { view = 'pick'; q = ''; act = 0; kb = false; }
    draw(!id);
    void el.offsetWidth; el.classList.add('show');
    document.documentElement.classList.add('mh-lock');
  }
  function close() {
    var el = document.getElementById(ID); if (el) el.classList.remove('show');
    document.documentElement.classList.remove('mh-lock');
    try { document.activeElement && document.activeElement.blur(); } catch (e) {}
  }

  /* ════════ the button on the payments page ════════ */
  function inject() {
    var root = document.getElementById('page-content'); if (!root || root.querySelector('.axst-open')) return;
    var bar = root.querySelector('.section-action-bar'); if (!bar) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn axst-open';
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8.5 11h5M11 8.5v5"/></svg> كشف مركز';
    b.title = 'اختار أي مركز يطلعلك اللي عليه — مسدد ولا لأ';
    b.onclick = function () { open(); };
    var first = bar.querySelector('.btn');
    if (first && first.nextSibling) bar.insertBefore(b, first.nextSibling); else bar.appendChild(b);
  }
  var orig = window.renderPayments;
  if (typeof orig === 'function' && !orig._axst) {
    var w = function () { var r = orig.apply(this, arguments); try { inject(); } catch (e) { console.warn('[stmt]', e); } return r; };
    w._axst = true;
    window.renderPayments = w;
  }

  window.AXStmt = {
    open: open, close: close, model: model,
    back: function () { view = 'pick'; draw(true); },
    filter: function (f) { filt = f; var y = (document.querySelector('#axst .mh-panel') || {}).scrollTop; draw(); var p = document.querySelector('#axst .mh-panel'); if (p && y) p.scrollTop = Math.min(y, p.scrollHeight); var on = document.querySelector('#axst .axst-chip.on'); if (on) try { on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {} },
    pay: function () { var id = cid; close(); setTimeout(function () { openPaymentForm(id); }, 180); },
    wa: function () { sendDebtReminderWhatsApp(cid); },
    full: function () { var id = cid; close(); setTimeout(function () { viewCustomerStatement(id); }, 180); }
  };
  // a payment saved from here → the statement is fresh next time it opens; if it's still open, redraw
  var sp = window.savePayment;
  if (typeof sp === 'function' && !sp._axst) {
    var w2 = function () { var r = sp.apply(this, arguments); var el = document.getElementById(ID); if (el && el.classList.contains('show') && view === 'stmt') draw(); return r; };
    w2._axst = true; window.savePayment = w2;
  }
})();

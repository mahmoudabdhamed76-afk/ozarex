/* ════════════════════════════════════════════════════════════════════
   ERP · الشيكات — وارد من المراكز وصادر للموردين
   ------------------------------------------------------------------
   · شيك وارد: يتسجل تحصيل على طول (يقلل رصيد المركز) أو لما يتصرف
   · شيك صادر: يتسجل سداد للمورد على طول أو لما يتصرف
   · مرتجع: يرجع المبلغ على الرصيد بحركة «ارتداد شيك» (بالسالب)
   · المستحق قريب: شارة على القسم + تنبيه أول ما تفتح البرنامج
   Stored in settings._cheques
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { f: 'open', dir: 'all' };
  var ST = { pending: 'مستني الميعاد', deposited: 'اتودع البنك', cleared: 'اتصرف', bounced: 'مرتجع', cancelled: 'اتلغى' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { var d = D(); if (!Array.isArray(d[k])) d[k] = []; return d[k]; }
  function list() { var s = S(); if (!Array.isArray(s._cheques)) s._cheques = []; return s._cheques; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(Number(n || 0)); } catch (e) {} return num(n); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function today() { return lds(new Date()); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return lds(d); }
  function dmy(ds) { if (!ds) return ''; var p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
  function id() { return (typeof uid === 'function') ? uid() : Math.random().toString(36).slice(2, 10); }
  function me() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || ''; }
  function daysTo(ds) { return Math.round((Date.parse(ds) - Date.parse(today())) / 864e5); }
  function open(c) { return c.status === 'pending' || c.status === 'deposited'; }
  function save() { try { DB.save(); } catch (e) {} }
  function rerender() { if (typeof currentPage !== 'undefined' && currentPage === 'cheques') render(); try { if (typeof renderSidebar === 'function') renderSidebar(); } catch (e) {} }
  var IC = {
    in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    chq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h6M6 14h4M15 14h3"/></svg>'
  };

  /* ── money movements (same logic as «التحصيل»: oldest unpaid first) ── */
  function payDocs(cid, amount) {
    var rem = amount;
    A('invoices').filter(function (i) { return i.customerId === cid && i.status !== 'paid'; }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); })
      .forEach(function (inv) { if (rem <= 0) return; var due = (inv.total || 0) - (inv.paid || 0), ap = Math.min(due, rem); if (ap <= 0) return; inv.paid = (inv.paid || 0) + ap; rem -= ap; inv.status = inv.paid >= inv.total ? 'paid' : inv.paid > 0 ? 'partial' : 'unpaid'; });
    rem = amount;
    A('issuances').filter(function (i) { return i.customerId === cid && i.status !== 'paid'; }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); })
      .forEach(function (iss) { if (rem <= 0) return; var due = (iss.total || 0) - (iss.paid || 0), ap = Math.min(due, rem); if (ap <= 0) return; iss.paid = (iss.paid || 0) + ap; rem -= ap; iss.status = iss.paid >= iss.total ? 'paid' : iss.paid > 0 ? 'partial' : 'unpaid'; });
  }
  function unpayDocs(cid, amount) {   // newest paid first
    ['invoices', 'issuances'].forEach(function (k) {
      var rem = amount;
      A(k).filter(function (i) { return i.customerId === cid && (i.paid || 0) > 0; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })
        .forEach(function (doc) { if (rem <= 0) return; var take = Math.min(doc.paid || 0, rem); doc.paid = (doc.paid || 0) - take; rem -= take; doc.status = doc.paid >= doc.total ? 'paid' : doc.paid > 0 ? 'partial' : 'unpaid'; });
    });
  }
  function customerPay(c, chq, sign, date) {
    var cust = A('customers').find(function (x) { return x.id === c.partyId; }); if (!cust) return null;
    var p = { id: 'pay_' + id(), customerId: cust.id, customerName: cust.name, amount: sign * c.amount, date: date || today(), method: sign > 0 ? 'شيك' : 'شيك مرتجع',
      reference: 'شيك ' + (c.number || ''), bankAccount: c.bank || '', isTransfer: false, invoiceId: null, chequeId: c.id,
      note: sign > 0 ? 'شيك #' + c.no + (c.bank ? ' — ' + c.bank : '') : 'ارتداد شيك #' + c.no + (c.bounceNote ? ' — ' + c.bounceNote : ''), createdAt: Date.now() };
    A('payments').push(p);
    cust.balance = (Number(cust.balance) || 0) - sign * c.amount;
    if (sign > 0) payDocs(cust.id, c.amount); else unpayDocs(cust.id, c.amount);
    return p.id;
  }
  function supplierPay(c, sign, date) {
    var sup = A('suppliers').find(function (x) { return x.id === c.partyId; });
    var sp = { id: 'sp_' + id(), supplierId: c.partyId || '', supplierName: sup ? sup.name : c.partyName, amount: sign * c.amount, date: date || today(), method: 'cheque',
      beneficiaryName: '', chequeId: c.id, note: sign > 0 ? 'شيك #' + c.no + ' رقم ' + (c.number || '') : 'ارتداد شيك #' + c.no, createdAt: Date.now() };
    A('supplierPayments').push(sp);
    return sp.id;
  }
  function hist(c, status, note) {
    if (!Array.isArray(c.history)) c.history = [];
    c.history.push({ id: 'h_' + id(), status: status, at: Date.now(), by: me(), note: note || '' });
    c.status = status; c.statusAt = Date.now();
  }

  /* ── page ── */
  function render() {
    var host = document.getElementById('chq-root'); if (!host) return;
    var all = list(), t = today();
    var inOpen = all.filter(function (c) { return c.dir === 'in' && open(c); }), outOpen = all.filter(function (c) { return c.dir === 'out' && open(c); });
    var soon = all.filter(function (c) { return open(c) && daysTo(c.due) <= 7; });
    var late = all.filter(function (c) { return open(c) && daysTo(c.due) < 0; });
    var yr = t.slice(0, 4), bounced = all.filter(function (c) { return c.status === 'bounced' && String(c.due || '').slice(0, 4) === yr; });
    var sum = function (l) { return l.reduce(function (s, c) { return s + (Number(c.amount) || 0); }, 0); };
    var shown = all.filter(function (c) {
      if (ui.dir !== 'all' && c.dir !== ui.dir) return false;
      if (ui.f === 'open') return open(c);
      if (ui.f === 'cleared') return c.status === 'cleared';
      if (ui.f === 'bounced') return c.status === 'bounced' || c.status === 'cancelled';
      return true;
    }).sort(function (a, b) { return ui.f === 'open' ? String(a.due).localeCompare(String(b.due)) : (b.createdAt || 0) - (a.createdAt || 0); });
    /* the next 14 days */
    var days = [];
    for (var i = -3; i < 14; i++) {
      var ds = addDays(i), cs = all.filter(function (c) { return open(c) && c.due === ds; });
      if (cs.length || i === 0) days.push({ ds: ds, i: i, inn: sum(cs.filter(function (c) { return c.dir === 'in'; })), out: sum(cs.filter(function (c) { return c.dir === 'out'; })), n: cs.length });
    }
    var lateAll = all.filter(function (c) { return open(c) && c.due < addDays(-3); });

    host.innerHTML =
      '<section class="cus-hero chq-hero">' +
        '<div class="cus-hero-t"><span>شيكات تحت التحصيل</span><b>' + money(sum(inOpen)) + '</b><small>' + inOpen.length + ' شيك وارد من المراكز</small></div>' +
        '<div class="cus-hero-figs">' +
          '<div><span>شيكات علينا</span><b>' + money(sum(outOpen)) + '</b><small>' + outOpen.length + ' شيك للموردين</small></div>' +
          '<div><span>مستحق خلال أسبوع</span><b class="' + (soon.length ? 'bad' : 'ok') + '">' + soon.length + '</b><small>' + (late.length ? late.length + ' فات ميعاده' : 'مفيش متأخر') + '</small></div>' +
          '<div><span>مرتجع السنة دي</span><b class="' + (bounced.length ? 'bad' : '') + '">' + bounced.length + '</b><small>' + money(sum(bounced)) + '</small></div>' +
        '</div>' +
        '<div class="chq-new"><button onclick="AXCheq.form(\'in\')">' + IC.in + ' شيك وارد</button><button onclick="AXCheq.form(\'out\')">' + IC.out + ' شيك صادر</button></div>' +
      '</section>' +
      '<div class="chq-days">' + (lateAll.length ? '<div class="chq-day late"><span>متأخر</span><b>' + lateAll.length + '</b><em>' + money(sum(lateAll)) + '</em></div>' : '') +
        days.map(function (d) {
          return '<div class="chq-day' + (d.i === 0 ? ' now' : '') + (d.i < 0 ? ' past' : '') + (d.n ? '' : ' empty') + '"><span>' + (d.i === 0 ? 'النهارده' : d.i === 1 ? 'بكرة' : dmy(d.ds).slice(0, -5)) + '</span>' +
            (d.n ? (d.inn ? '<em class="in">\u200E+' + num(d.inn) + '</em>' : '') + (d.out ? '<em class="out">\u200E−' + num(d.out) + '</em>' : '') : '<em>—</em>') + '</div>';
        }).join('') + '</div>' +
      '<div class="cus-tools">' +
        '<div class="ax-seg">' + [['open', 'مستنية'], ['cleared', 'اتصرفت'], ['bounced', 'مرتجعة'], ['all', 'الكل']].map(function (o) {
          return '<button class="' + (ui.f === o[0] ? 'on' : '') + '" onclick="AXCheq.filter(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<div class="ax-seg">' + [['all', 'الكل'], ['in', 'وارد'], ['out', 'صادر']].map(function (o) {
          return '<button class="' + (ui.dir === o[0] ? 'on' : '') + '" onclick="AXCheq.dirF(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
      '</div>' +
      (shown.length ? '<div class="chq-list">' + shown.map(card).join('') + '</div>'
        : '<div class="skh-empty"><b>' + (all.length ? 'مفيش شيكات هنا' : 'لسه مفيش شيكات') + '</b><span>' + (all.length ? 'غيّر الفلتر' : 'سجّل أي شيك استلمته من مركز أو كتبته لمورد، والبرنامج يفكّرك بميعاده') + '</span></div>');
  }
  function card(c) {
    var d = daysTo(c.due), isOpen = open(c);
    var when = !isOpen ? (ST[c.status] || '') : d < 0 ? 'متأخر ' + (-d) + ' يوم' : d === 0 ? 'ميعاده النهارده' : d === 1 ? 'ميعاده بكرة' : 'باقي ' + d + ' يوم';
    var cls = !isOpen ? 's-' + c.status : d < 0 ? 's-late' : d <= 3 ? 's-soon' : 's-ok';
    return '<article class="chq-card d-' + c.dir + ' ' + cls + '">' +
      '<span class="chq-ic">' + (c.dir === 'in' ? IC.in : IC.out) + '</span>' +
      '<div class="chq-main"><b>' + esc(c.partyName || '—') + '</b><span>#' + c.no + ' · شيك ' + esc(c.number || '—') + (c.bank ? ' · ' + esc(c.bank) : '') + ' · ميعاده ' + dmy(c.due) + '</span>' +
        (c.paymentId || c.spId ? '<span class="chq-rec">' + (c.dir === 'in' ? 'متسجل تحصيل' : 'متسجل سداد للمورد') + '</span>' : (isOpen ? '<span class="chq-rec no">لسه متسجلش ' + (c.dir === 'in' ? 'تحصيل' : 'سداد') + ' — هيتسجل لما يتصرف</span>' : '')) + '</div>' +
      '<div class="chq-amt"><b>\u200E' + (c.dir === 'in' ? '+' : '−') + money(c.amount) + '</b><em class="' + cls + '">' + when + '</em></div>' +
      '<div class="chq-act">' + (isOpen
        ? (c.dir === 'in' && c.status === 'pending' ? '<button onclick="AXCheq.deposit(\'' + c.id + '\')">اتودع</button>' : '') +
          '<button class="ok" onclick="AXCheq.clear(\'' + c.id + '\')">اتصرف</button><button class="no" onclick="AXCheq.bounce(\'' + c.id + '\')">مرتجع</button>'
        : '') + '<button class="ic" title="التفاصيل" onclick="AXCheq.view(\'' + c.id + '\')">⋯</button></div>' +
    '</article>';
  }

  /* ── forms ── */
  function form(dir, cid) {
    var c = cid ? list().find(function (x) { return x.id === cid; }) : null;
    dir = c ? c.dir : (dir || 'in');
    var parties = dir === 'in' ? A('customers') : A('suppliers');
    openModal((c ? 'تعديل شيك #' + c.no : dir === 'in' ? 'شيك وارد من مركز' : 'شيك صادر لمورد'),
      '<form id="chq-form" onsubmit="return false">' +
        '<div class="form-group"><label>' + (dir === 'in' ? 'من المركز / العميل' : 'للمورد') + ' *</label><select class="form-control" name="partyId" required>' +
          '<option value="">— اختار —</option>' + parties.map(function (p) { return '<option value="' + p.id + '"' + (c && c.partyId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') +
          '<option value="__other"' + (c && !c.partyId ? ' selected' : '') + '>جهة تانية (اكتب الاسم)</option></select></div>' +
        '<div class="form-group" id="chq-other"' + (c && !c.partyId ? '' : ' style="display:none"') + '><label>اسم الجهة</label><input class="form-control" name="partyName" value="' + esc(c && !c.partyId ? c.partyName : '') + '"></div>' +
        '<div class="form-row"><div class="form-group"><label>المبلغ *</label><input class="form-control" name="amount" type="number" inputmode="decimal" min="0" step="any" value="' + (c ? c.amount : '') + '" required></div>' +
          '<div class="form-group"><label>رقم الشيك</label><input class="form-control" name="number" value="' + esc(c ? c.number : '') + '"></div></div>' +
        '<div class="form-row"><div class="form-group"><label>البنك</label><input class="form-control" name="bank" list="chq-banks" value="' + esc(c ? c.bank : '') + '">' +
          '<datalist id="chq-banks">' + ['البنك الأهلي المصري', 'بنك مصر', 'بنك القاهرة', 'CIB', 'QNB', 'بنك الإسكندرية', 'بنك فيصل', 'البنك الزراعي', 'HSBC', 'بنك قناة السويس'].map(function (b) { return '<option value="' + b + '">'; }).join('') + '</datalist></div>' +
          '<div class="form-group"><label>ميعاد الصرف *</label><input class="form-control" name="due" type="date" value="' + (c ? c.due : addDays(30)) + '" required></div></div>' +
        '<div class="form-row"><div class="form-group"><label>' + (dir === 'in' ? 'تاريخ الاستلام' : 'تاريخ الإصدار') + '</label><input class="form-control" name="date" type="date" value="' + (c ? c.date : today()) + '"></div>' +
          '<div class="form-group"><label>ملاحظة</label><input class="form-control" name="note" value="' + esc(c ? c.note : '') + '"></div></div>' +
        (c ? '' : '<label class="dbt-check"><input type="checkbox" name="recordNow" checked><span>' + (dir === 'in' ? 'سجّله تحصيل دلوقتي (يقلل رصيد المركز) — لو اترجع هيرجع على الرصيد' : 'سجّله سداد للمورد دلوقتي — لو اترجع هيرجع على حسابه') + '</span></label>') +
        '<input type="hidden" name="dir" value="' + dir + '">' +
      '</form>',
      '<button class="btn btn-primary" onclick="AXCheq.saveForm(' + (c ? '\'' + c.id + '\'' : '') + ')">حفظ</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
    var sel = document.querySelector('#chq-form [name=partyId]');
    if (sel) sel.onchange = function () { var o = document.getElementById('chq-other'); if (o) o.style.display = sel.value === '__other' ? '' : 'none'; };
  }
  function saveForm(cid) {
    var f = document.getElementById('chq-form'); if (!f) return;
    var v = Object.fromEntries(new FormData(f));
    var amt = Number(v.amount || 0);
    if (!(amt > 0)) { T('اكتب المبلغ', 'error'); return; }
    if (!v.partyId) { T('اختار ' + (v.dir === 'in' ? 'المركز' : 'المورد'), 'error'); return; }
    if (!v.due) { T('اكتب ميعاد الصرف', 'error'); return; }
    var other = v.partyId === '__other';
    var party = other ? null : (v.dir === 'in' ? A('customers') : A('suppliers')).find(function (p) { return p.id === v.partyId; });
    var name = other ? String(v.partyName || '').trim() : (party ? party.name : '');
    if (!name) { T('اكتب اسم الجهة', 'error'); return; }
    if (cid) {
      var c0 = list().find(function (x) { return x.id === cid; }); if (!c0) return;
      if ((c0.paymentId || c0.spId) && Number(c0.amount) !== amt) { T('الشيك ده متسجل ' + (c0.dir === 'in' ? 'تحصيل' : 'سداد') + ' — المبلغ بيتعدّل من هناك أو اعمل مرتجع وسجّل شيك جديد', 'warning', 6000); return; }
      Object.assign(c0, { partyId: other ? '' : v.partyId, partyName: name, amount: amt, number: v.number || '', bank: v.bank || '', due: v.due, date: v.date || c0.date, note: v.note || '' });
      save(); closeModal(); T('اتعدّل الشيك'); rerender(); return;
    }
    var no = list().reduce(function (m, x) { return Math.max(m, x.no || 0); }, 0) + 1;
    var c = { id: 'chq_' + id(), no: no, dir: v.dir, partyId: other ? '' : v.partyId, partyName: name, amount: amt, number: v.number || '', bank: v.bank || '',
      due: v.due, date: v.date || today(), note: v.note || '', status: 'pending', statusAt: Date.now(), by: me(), createdAt: Date.now(), history: [] };
    c.history.push({ id: 'h_' + id(), status: 'pending', at: Date.now(), by: me(), note: v.dir === 'in' ? 'استلام' : 'إصدار' });
    if (v.recordNow) {
      if (c.dir === 'in' && c.partyId) c.paymentId = customerPay(c, c, 1, c.date);
      if (c.dir === 'out' && c.partyId) c.spId = supplierPay(c, 1, c.date);
    }
    list().push(c); save(); closeModal();
    T('اتسجل شيك #' + no + (c.paymentId ? ' — واتسجل تحصيل' : c.spId ? ' — واتسجل سداد للمورد' : ''));
    rerender();
  }
  function find(cid) { return list().find(function (x) { return x.id === cid; }); }
  function deposit(cid) { var c = find(cid); if (!c || c.status !== 'pending') return; hist(c, 'deposited', 'اتودع البنك'); save(); T('اتسجل إنه اتودع'); rerender(); }
  function clear(cid) {
    var c = find(cid); if (!c || !open(c)) return;
    confirmDialog('الشيك #' + c.no + ' (' + money(c.amount) + ') اتصرف؟' + (!c.paymentId && !c.spId && c.partyId ? (c.dir === 'in' ? ' — هيتسجل تحصيل للمركز دلوقتي.' : ' — هيتسجل سداد للمورد دلوقتي.') : ''), function () {
      if (c.dir === 'in' && !c.paymentId && c.partyId) c.paymentId = customerPay(c, c, 1, today());
      if (c.dir === 'out' && !c.spId && c.partyId) c.spId = supplierPay(c, 1, today());
      hist(c, 'cleared', 'اتصرف');
      save(); T('اتصرف ✓'); rerender();
    });
  }
  function bounce(cid) {
    var c = find(cid); if (!c || !open(c)) return;
    openModal('شيك مرتجع #' + c.no,
      '<p class="ax-modal-lead">' + esc(c.partyName) + ' — ' + money(c.amount) + '.' + (c.paymentId ? ' المبلغ هيرجع على رصيد المركز بحركة «ارتداد شيك».' : c.spId ? ' المبلغ هيرجع على حساب المورد.' : '') + '</p>' +
      '<div class="form-group"><label>السبب</label><input class="form-control" id="chq-bn" placeholder="مثال: الرصيد لا يسمح"></div>',
      '<button class="btn btn-danger" onclick="AXCheq.doBounce(\'' + c.id + '\')">تسجيل مرتجع</button><button class="btn btn-ghost" onclick="closeModal()">رجوع</button>');
  }
  function doBounce(cid) {
    var c = find(cid); if (!c || !open(c)) { closeModal(); return; }
    c.bounceNote = String((document.getElementById('chq-bn') || {}).value || '').trim();
    if (c.dir === 'in' && c.paymentId) c.revId = customerPay(c, c, -1, today());
    if (c.dir === 'out' && c.spId) c.revId = supplierPay(c, -1, today());
    hist(c, 'bounced', c.bounceNote || 'مرتجع');
    save(); closeModal(); T('اتسجل مرتجع — المبلغ رجع على الرصيد', 'warning'); rerender();
  }
  function view(cid) {
    var c = find(cid); if (!c) return;
    openModal('شيك #' + c.no + ' — ' + esc(c.partyName),
      '<div class="dbt-payhead"><div><span>المبلغ</span><b>' + money(c.amount) + '</b></div><div><span>الحالة</span><b>' + (ST[c.status] || c.status) + '</b></div></div>' +
      '<ul class="chq-hist">' + (c.history || []).slice().reverse().map(function (h) {
        return '<li><b>' + (ST[h.status] || h.status) + '</b><span>' + new Date(h.at).toLocaleString('ar-EG') + (h.by ? ' · ' + esc(h.by) : '') + (h.note ? ' — ' + esc(h.note) : '') + '</span></li>';
      }).join('') + '</ul>' +
      '<p class="ax-modal-lead">رقم الشيك: ' + esc(c.number || '—') + (c.bank ? ' · ' + esc(c.bank) : '') + ' · ميعاده ' + dmy(c.due) + (c.note ? '<br>' + esc(c.note) : '') + '</p>',
      (open(c) ? '<button class="btn btn-secondary" onclick="AXCheq.form(null,\'' + c.id + '\')">تعديل</button><button class="btn btn-ghost" onclick="AXCheq.cancel(\'' + c.id + '\')">إلغاء الشيك</button>' : '') +
      '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
  }
  function cancel(cid) {
    var c = find(cid); if (!c || !open(c)) return;
    confirmDialog('تلغي الشيك #' + c.no + '؟' + (c.paymentId || c.spId ? ' التحصيل/السداد اللي اتسجل بيه هيرجع.' : ''), function () {
      if (c.dir === 'in' && c.paymentId) c.revId = customerPay(Object.assign({}, c, { bounceNote: 'إلغاء' }), c, -1, today());
      if (c.dir === 'out' && c.spId) c.revId = supplierPay(c, -1, today());
      hist(c, 'cancelled', 'اتلغى');
      save(); closeModal(); T('اتلغى الشيك', 'info'); rerender();
    });
  }

  /* ── badge + daily reminder ── */
  function dueSoon() { return list().filter(function (c) { return open(c) && daysTo(c.due) <= 3; }); }
  function badge() {
    var el = document.querySelector('#sidebar-nav .nav-item[onclick*="\'cheques\'"]'); if (!el) return;
    var b = el.querySelector('.chq-badge'); if (b) b.remove();
    var n = dueSoon().length;
    if (n) el.insertAdjacentHTML('beforeend', '<span class="badge chq-badge">' + (n > 9 ? '9+' : n) + '</span>');
  }
  function remind() {
    try {
      if (typeof can === 'function' && !can('cheques')) return;
      var key = 'ax_chq_remind_' + today(); if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      var l = dueSoon(); if (!l.length) return;
      var late = l.filter(function (c) { return daysTo(c.due) < 0; }).length, td = l.filter(function (c) { return daysTo(c.due) === 0; }).length;
      T('🧾 ' + l.length + ' شيك ميعاده قرّب' + (td ? ' (' + td + ' النهارده)' : '') + (late ? ' و ' + late + ' متأخر' : '') + ' — افتح «الشيكات»', late ? 'warning' : 'info', 7000);
    } catch (e) {}
  }
  var _rs = window.renderSidebar;
  if (typeof _rs === 'function' && !_rs._chq) {
    var w = function () { var r = _rs.apply(this, arguments); try { badge(); remind(); } catch (e) {} return r; };
    w._chq = 1; window.renderSidebar = w;
  }

  window.renderCheques = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="chq" id="chq-root"></div>';
    render();
  };
  window.AXCheq = {
    render: window.renderCheques, form: form, saveForm: saveForm, deposit: deposit, clear: clear, bounce: bounce, doBounce: doBounce, view: view, cancel: cancel,
    filter: function (f) { ui.f = f; render(); }, dirF: function (d) { ui.dir = d; render(); }, dueSoon: dueSoon
  };
})();

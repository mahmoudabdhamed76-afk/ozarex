/* ════════════════════════════════════════════════════════════════════
   ERP · أعمار الديون + كشوف الحساب على واتساب + لينك المركز
   ------------------------------------------------------------------
   · كل مركز: عليه كام، ومتقسم 0–30 / 31–60 / 61–90 / +90 يوم
     (الأرقام من js/axcore.js — نفس اللي بيظهر في لينك المركز)
   · كشف حساب جاهز يتبعت واتساب، ورسائل أول الشهر لكل المراكز
   · لينك خاص لكل مركز يشوف فيه حسابه (قراءة بس) — settings._portal
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.AXCore;
  var ui = { f: 'all', q: '', sort: 'amount' };
  var BK = [['0–30 يوم', 'b0'], ['31–60', 'b1'], ['61–90', 'b2'], ['+90 يوم', 'b3']];

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(Number(n || 0)); } catch (e) {} return num(n); }
  function T(m, t, ms) { if (typeof toast === 'function') toast(m, t || 'success', ms); }
  function lds(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function today() { return lds(new Date()); }
  function dm(ds) { if (!ds) return ''; var p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]); }
  function dmy(ds) { if (!ds) return ''; var p = String(ds).slice(0, 10).split('-'); return (+p[2]) + '/' + (+p[1]) + '/' + p[0]; }
  function month() { return today().slice(0, 7); }
  function phoneOf(c) { try { return typeof normalizeEgyptianPhone === 'function' ? normalizeEgyptianPhone(c.phone) : String(c.phone || '').replace(/\D/g, ''); } catch (e) { return ''; } }
  function company() { var s = S(); return s.companyName || 'نظام الحسابات'; }
  function base() { return typeof API_BASE !== 'undefined' ? API_BASE : location.origin; }
  function daysTxt(n) { return n === 0 ? 'النهارده' : n === 1 ? 'يوم' : n === 2 ? 'يومين' : n + (n <= 10 ? ' أيام' : ' يوم'); }

  function rows() {
    var t = today();
    return A('customers').map(function (c) {
      var a = X.aging(D(), c.id, t);
      return { c: c, a: a, due: Math.max(0, a.balance) };
    }).filter(function (r) { return r.due > 0.5; });
  }

  function bar(B, total, cls) {
    total = total || B.reduce(function (s, v) { return s + v; }, 0) || 1;
    return '<div class="ag-bar ' + (cls || '') + '">' + B.map(function (v, i) {
      return v > 0 ? '<i class="' + BK[i][1] + '" style="width:' + Math.max(1.5, v / total * 100).toFixed(2) + '%" title="' + BK[i][0] + ': ' + num(v) + '"></i>' : '';
    }).join('') + '</div>';
  }

  function render() {
    var host = document.getElementById('ag-root'); if (!host) return;
    var all = rows(), total = all.reduce(function (s, r) { return s + r.due; }, 0);
    var B = [0, 0, 0, 0]; all.forEach(function (r) { r.a.buckets.forEach(function (v, i) { B[i] += v; }); });
    var oldest = all.reduce(function (m, r) { return Math.max(m, r.a.oldestDays); }, 0);
    var sent = S()._stmtSent || {}, m = month();
    var withPhone = all.filter(function (r) { return phoneOf(r.c); }), sentN = withPhone.filter(function (r) { return sent[r.c.id] === m; }).length;
    var shown = all.filter(function (r) {
      if (ui.f === '30' && r.a.buckets[1] + r.a.buckets[2] + r.a.buckets[3] <= 0.5) return false;
      if (ui.f === '60' && r.a.buckets[2] + r.a.buckets[3] <= 0.5) return false;
      if (ui.f === '90' && r.a.buckets[3] <= 0.5) return false;
      if (ui.q && String(r.c.name || '').indexOf(ui.q) < 0 && String(r.c.phone || '').indexOf(ui.q) < 0) return false;
      return true;
    }).sort(function (a, b) { return ui.sort === 'old' ? b.a.oldestDays - a.a.oldestDays || b.due - a.due : b.due - a.due; });
    var pc = function (v) { return total ? Math.round(v / total * 100) : 0; };

    host.innerHTML =
      '<section class="cus-hero ag-hero">' +
        '<div class="cus-hero-t"><span>المستحق على المراكز</span><b>' + money(total) + '</b>' +
          '<small>' + all.length + ' مركز عليهم فلوس' + (oldest ? ' · أقدم دين من ' + daysTxt(oldest) : '') + '</small></div>' +
        '<div class="ag-hero-b">' + bar(B, total, 'big') +
          '<ul class="ag-legend">' + B.map(function (v, i) {
            return '<li class="' + BK[i][1] + '"><i></i><span>' + BK[i][0] + '</span><b>' + money(v) + '</b><em>' + pc(v) + '%</em></li>'; }).join('') + '</ul></div>' +
      '</section>' +
      '<div class="cus-tools ag-tools">' +
        '<div class="ax-seg">' + [['all', 'الكل'], ['30', 'متأخر +30'], ['60', '+60'], ['90', '+90']].map(function (o) {
          return '<button class="' + (ui.f === o[0] ? 'on' : '') + '" onclick="AXAging.filter(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<input class="form-control ag-q" placeholder="ابحث بالاسم أو التليفون" value="' + esc(ui.q) + '" oninput="AXAging.search(this.value)">' +
        '<div class="ax-seg">' + [['amount', 'الأكبر'], ['old', 'الأقدم']].map(function (o) {
          return '<button class="' + (ui.sort === o[0] ? 'on' : '') + '" onclick="AXAging.sortBy(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<button class="ag-bulk" onclick="AXAging.bulk()">📨 كشوف أول الشهر <em>' + sentN + '/' + withPhone.length + '</em></button>' +
      '</div>' +
      (shown.length ? '<div class="ag-list">' + shown.map(row).join('') + '</div>'
        : '<div class="skh-empty"><b>' + (all.length ? 'مفيش مراكز في الفلتر ده' : 'مفيش فلوس على حد 🎉') + '</b><span>' + (all.length ? 'غيّر الفلتر' : 'كل المراكز مسددة') + '</span></div>');
  }

  function row(r) {
    var c = r.c, a = r.a, ph = phoneOf(c), late = a.oldestDays;
    var sev = late > 90 ? 'b3' : late > 60 ? 'b2' : late > 30 ? 'b1' : 'b0';
    var sent = (S()._stmtSent || {})[c.id] === month();
    return '<article class="ag-row">' +
      '<div class="ag-who"><b>' + esc(c.name) + '</b><span>' + (c.phone ? esc(c.phone) : 'من غير تليفون') +
        (a.lastPay ? ' · آخر دفعة ' + money(a.lastPay.amount) + ' يوم ' + dm(a.lastPay.date) : ' · مفيش دفعات') + '</span></div>' +
      '<div class="ag-amt"><b>' + money(r.due) + '</b>' + bar(a.buckets, r.due) + '</div>' +
      '<span class="ag-age ' + sev + '">' + (late ? 'أقدم دين ' + daysTxt(late) : 'جديد') + '</span>' +
      '<div class="ag-act">' +
        (ph ? '<button class="wa' + (sent ? ' sent' : '') + '" onclick="AXAging.whatsapp(\'' + c.id + '\')" title="كشف حساب واتساب">' + (sent ? '✓ ' : '') + 'واتساب</button>' : '') +
        '<button onclick="AXAging.collect(\'' + c.id + '\')">تحصيل</button>' +
        '<button onclick="AXAging.statement(\'' + c.id + '\')">كشف</button>' +
        '<button onclick="AXAging.portal(\'' + c.id + '\')" title="لينك المركز">🔗</button>' +
      '</div></article>';
  }

  /* ── the WhatsApp statement ── */
  function stmtText(cid) {
    var c = A('customers').find(function (x) { return x.id === cid; }) || {};
    var a = X.aging(D(), cid, today()), st = X.statement(D(), cid, 6), s = S();
    var L = ['السلام عليكم ' + (c.name || '') + ' 🌿', 'ده كشف حسابكم عند *' + company() + '* لحد ' + dmy(today()) + ':', '',
      '💰 *المستحق:* ' + money(Math.max(0, a.balance))];
    var labels = ['من 30 يوم أو أقل', 'من 31 لـ 60 يوم', 'من 61 لـ 90 يوم', 'من أكتر من 90 يوم'];
    a.buckets.forEach(function (v, i) { if (v > 0.5) L.push('   • ' + labels[i] + ': ' + money(v)); });
    if (a.lastPay) L.push('✅ آخر دفعة: ' + money(a.lastPay.amount) + ' يوم ' + dmy(a.lastPay.date));
    if (st.rows.length) {
      L.push('', '🧾 *آخر الحركات:*');
      st.rows.forEach(function (r) { L.push('   ' + dm(r.date) + ' — ' + r.label + ': ' + (r.debit ? money(r.debit) : '−' + money(r.credit))); });
    }
    var tok = (S()._portal || {})[cid];
    if (tok) L.push('', '🔗 حسابكم كامل في أي وقت: ' + base() + '/p/' + tok);
    L.push('', 'شكراً لتعاملكم معانا 🙏');
    if (s.companyPhone) L.push('📞 ' + s.companyPhone);
    return L.join('\n');
  }
  function markSent(cid) {
    var m = Object.assign({}, S()._stmtSent || {}); m[cid] = month();
    S()._stmtSent = m; DB.save();
  }
  function whatsapp(cid) {
    var c = A('customers').find(function (x) { return x.id === cid; }); if (!c) return;
    var ph = phoneOf(c); if (!ph) { T('رقم التليفون مش صحيح', 'error'); return; }
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(stmtText(cid)), '_blank');
    markSent(cid);
    setTimeout(render, 300);
  }
  function bulk() {
    var all = rows().filter(function (r) { return phoneOf(r.c); }).sort(function (a, b) { return b.due - a.due; });
    var sent = S()._stmtSent || {}, m = month();
    openModal('📨 كشوف حساب أول الشهر',
      '<p class="ax-modal-lead">كل مركز عليه فلوس وليه تليفون. دوس «ابعت» يفتح واتساب برسالة كشف الحساب جاهزة، وبعدها ارجع هنا للي بعده. اللي اتبعت الشهر ده عليه ✓.</p>' +
      (all.length ? '<ul class="ag-bulk-list">' + all.map(function (r) {
        var done = sent[r.c.id] === m;
        return '<li class="' + (done ? 'done' : '') + '"><div><b>' + esc(r.c.name) + '</b><span>' + money(r.due) + (r.a.oldestDays > 30 ? ' · متأخر ' + daysTxt(r.a.oldestDays) : '') + '</span></div>' +
          '<button onclick="AXAging.bulkSend(\'' + r.c.id + '\', this)">' + (done ? '✓ اتبعت — تاني' : 'ابعت') + '</button></li>';
      }).join('') + '</ul>' : '<div class="skh-empty sm"><span>مفيش مراكز عليها فلوس وليها تليفون</span></div>'),
      '<button class="btn btn-ghost" onclick="closeModal()">خلصت</button>', 'modal-lg');
  }
  function bulkSend(cid, btn) {
    whatsapp(cid);
    if (btn) { btn.textContent = '✓ اتبعت — تاني'; var li = btn.closest('li'); if (li) li.classList.add('done'); }
  }
  function collect(cid) { if (typeof openPaymentForm === 'function') openPaymentForm(cid); }
  function statement(cid) { if (typeof viewCustomerStatement === 'function') viewCustomerStatement(cid); }

  /* ── the center's own link (read-only page on the server: /p/<token>) ── */
  function newToken() {
    var a = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function portal(cid) {
    var c = A('customers').find(function (x) { return x.id === cid; }); if (!c) return;
    var tok = (S()._portal || {})[cid], url = tok ? base() + '/p/' + tok : '';
    openModal('🔗 لينك ' + esc(c.name),
      '<p class="ax-modal-lead">صفحة للمركز يشوف فيها رصيده وأعمار الدين وآخر الحركات وكشف الحساب — قراءة بس، ومن غير ما يدخل البرنامج. اللينك سري: أي حد معاه يقدر يفتحه، فابعته للمركز بس.</p>' +
      (tok ? '<div class="ag-link"><input class="form-control" readonly value="' + esc(url) + '" onclick="this.select()"><button class="btn btn-secondary" onclick="AXAging.copy(\'' + esc(url) + '\')">نسخ</button></div>' +
        '<div class="sec-btns" style="margin-top:12px">' +
          '<a class="btn btn-secondary" href="' + esc(url) + '" target="_blank" rel="noopener">فتح اللينك</a>' +
          (phoneOf(c) ? '<button class="btn btn-secondary" onclick="AXAging.sendLink(\'' + cid + '\')">ابعته واتساب</button>' : '') +
          '<button class="btn btn-ghost" onclick="AXAging.revoke(\'' + cid + '\')">وقف اللينك</button></div>'
        : '<div class="skh-empty sm"><span>المركز ده لسه ملوش لينك</span></div>'),
      tok ? '<button class="btn btn-ghost" onclick="closeModal()">تمام</button>'
        : '<button class="btn btn-primary" onclick="AXAging.makeLink(\'' + cid + '\')">اعمل لينك</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
  }
  function makeLink(cid) {
    var p = Object.assign({}, S()._portal || {}); p[cid] = newToken();
    S()._portal = p; DB.save();
    setTimeout(function () { portal(cid); }, 400);
  }
  function revoke(cid) {
    confirmDialog('توقف اللينك ده؟ اللي معاه مش هيقدر يفتحه تاني (وتقدر تعمل لينك جديد).', function () {
      var p = Object.assign({}, S()._portal || {}); delete p[cid];
      S()._portal = p; DB.save(); T('اللينك اتوقف', 'info');
    });
  }
  function copy(text) {
    try { navigator.clipboard.writeText(text).then(function () { T('اتنسخ ✓'); }, function () { T('انسخه من الخانة', 'info'); }); } catch (e) { T('انسخه من الخانة', 'info'); }
  }
  function sendLink(cid) {
    var c = A('customers').find(function (x) { return x.id === cid; }); var tok = (S()._portal || {})[cid]; if (!c || !tok) return;
    var txt = 'السلام عليكم ' + c.name + ' 🌿\nده لينك حسابكم عند *' + company() + '* — تقدروا تشوفوا منه الرصيد وكشف الحساب في أي وقت:\n' + base() + '/p/' + tok + '\nشكراً لتعاملكم معانا 🙏';
    window.open('https://wa.me/' + phoneOf(c) + '?text=' + encodeURIComponent(txt), '_blank');
  }

  window.renderAging = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    root.innerHTML = '<div class="ag" id="ag-root"></div>';
    render();
  };
  window.AXAging = {
    render: window.renderAging, filter: function (f) { ui.f = f; render(); }, sortBy: function (s) { ui.sort = s; render(); },
    search: function (q) { ui.q = String(q || '').trim(); clearTimeout(ui.t); ui.t = setTimeout(function () { render(); var i = document.querySelector('.ag-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); },
    whatsapp: whatsapp, bulk: bulk, bulkSend: bulkSend, collect: collect, statement: statement, stmtText: stmtText,
    portal: portal, makeLink: makeLink, revoke: revoke, copy: copy, sendLink: sendLink, rows: rows
  };
})();

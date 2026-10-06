/* ════════════════════════════════════════════════════════════════════
   ERP · سجل التعديلات — شكل جديد + قفل بكلمة سر (4.17)
   · الصفحة مقفولة بكلمة سر خاصة بيها (غير كلمة سر الدخول) — المدير بس.
     الكلمة مش متخزنة في الكود: متخزن «بصمتها» (SHA-256) بس، وتقدر
     تغيرها من جوه الصفحة. بعد ما تفتح بتفضل مفتوحة 10 دقايق أو لحد
     ما تدوس «اقفل».
   · الشكل: ملخص 4 أرقام، بحث + فلاتر سريعة (نوع العملية والخطورة)
     وفلاتر أكتر، وكل عملية كارت: مين عمل إيه في إيه وإمتى، وقبل ← بعد،
     متقسمة بالأيام (النهارده، امبارح…)، و«عرض أكتر» تحت.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var SALT = 'erp-audit|';
  var OPEN_MS = 10 * 60 * 1000;
  var openUntil = 0, shown = 40, busy = false;

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || {}; }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  /* no built-in password: the first time, the admin picks one (setup screen) */
  function lockHash() { return S()._auditLock || ''; }
  function needsSetup() { return !S()._auditLock; }

  /* ── SHA-256 (WebCrypto when available, a small pure-JS one otherwise — e.g. plain http on the LAN) ── */
  function sha256js(str) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var utf = unescape(encodeURIComponent(str)), bytes = [], i;
    for (i = 0; i < utf.length; i++) bytes.push(utf.charCodeAt(i));
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
    var rot = function (v, k) { return (v >>> k) | (v << (32 - k)); }, w = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function hash(pw) {
    var s = SALT + pw;
    try {
      if (window.crypto && crypto.subtle && window.isSecureContext) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
          return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        });
      }
    } catch (e) {}
    return Promise.resolve(sha256js(s));
  }

  /* ════════ the lock ════════ */
  function isOpen() { return Date.now() < openUntil; }
  var KINDS = {
    audit: { title: 'سجل التعديلات مقفول', sub: 'القسم ده ليك انت بس — اكتب كلمة السر عشان تفتحه.', go: 'افتح السجل' },
    settings: { title: 'الإعدادات مقفولة', sub: 'الإعدادات ليك انت بس — اكتب نفس كلمة سر سجل التعديلات عشان تفتحها.', go: 'افتح الإعدادات' },
    security: { title: 'الأمان والنسخ مقفول', sub: 'النسخ الاحتياطي والأمان ليك انت بس — اكتب نفس كلمة سر الإعدادات عشان تفتحه.', go: 'افتح الأمان والنسخ' },
    users: { title: 'المستخدمين مقفولين', sub: 'إدارة المستخدمين ليك انت بس — اكتب نفس كلمة سر الإعدادات عشان تفتحها.', go: 'افتح المستخدمين' }
  };
  function setupHtml(err) {
    return '<div class="axl"><div class="axl-card' + (err ? ' shake' : '') + '">' +
      '<div class="axl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4"/></svg></div>' +
      '<h2>اعمل كلمة سر للإعدادات والسجل</h2><p>أول مرة بس — الكلمة دي هتقفل «الإعدادات» و«سجل التعديلات» و«الأمان والنسخ» و«المستخدمين» (للمدير بس). اختار كلمة غير كلمة سر الدخول.</p>' +
      '<form onsubmit="AXAudit.setup(event)" autocomplete="off">' +
        '<input id="axl-pw" class="form-control" type="password" autocomplete="new-password" minlength="6" placeholder="كلمة السر الجديدة (6 حروف على الأقل)" aria-label="كلمة السر الجديدة">' +
        '<input id="axl-pw2" class="form-control" type="password" autocomplete="new-password" minlength="6" placeholder="اكتبها تاني" aria-label="تأكيد كلمة السر" style="margin-top:10px">' +
        (err ? '<div class="axl-err">' + err + '</div>' : '') +
        '<button type="submit" class="btn btn-primary axl-go">احفظ وافتح</button>' +
      '</form></div></div>';
  }
  function setup(e) {
    if (e) e.preventDefault();
    if (!needsSetup()) return;
    var a = (document.getElementById('axl-pw') || {}).value || '', b = (document.getElementById('axl-pw2') || {}).value || '';
    var root = document.getElementById('page-content');
    var bad = a.length < 6 ? 'كلمة السر لازم 6 حروف على الأقل' : (a !== b ? 'الكلمتين مش زي بعض' : '');
    if (bad) { if (root) { root.innerHTML = setupHtml(bad); focusPw(); } return; }
    hash(a).then(function (h) {
      S()._auditLock = h;
      try { DB.save(); } catch (x) {}
      openUntil = Date.now() + OPEN_MS; shown = 40;
      T('اتحفظت كلمة السر');
      rerender(_setupKind);
    });
  }
  var _setupKind = 'audit';
  function lockHtml(err, kind) {
    var K = KINDS[kind] || KINDS.audit;
    if (needsSetup()) { _setupKind = kind || 'audit'; return setupHtml(''); }
    return '<div class="axl"><div class="axl-card' + (err ? ' shake' : '') + '">' +
      '<div class="axl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4"/></svg></div>' +
      '<h2>' + K.title + '</h2><p>' + K.sub + '</p>' +
      '<form onsubmit="AXAudit.unlock(event, \'' + (kind || 'audit') + '\')" autocomplete="off">' +
        '<input id="axl-pw" class="form-control" type="password" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="كلمة السر" aria-label="كلمة السر">' +
        (err ? '<div class="axl-err">كلمة السر غلط — جرّب تاني</div>' : '') +
        '<button type="submit" class="btn btn-primary axl-go">' + K.go + '</button>' +
      '</form></div></div>';
  }
  /* wrong tries: 5 → wait a minute (on this device) */
  var bad = 0, badUntil = 0;
  function unlock(e, kind) {
    if (e) e.preventDefault();
    if (busy) return;
    var root = document.getElementById('page-content');
    if (Date.now() < badUntil) { if (typeof toast === 'function') toast('محاولات كتير غلط — استنى دقيقة', 'error'); return; }
    busy = true;
    var inp = document.getElementById('axl-pw'), pw = inp ? inp.value : '';
    hash(pw).then(function (h) {
      busy = false;
      if (lockHash() && h === lockHash()) { bad = 0; openUntil = Date.now() + OPEN_MS; shown = 40; rerender(kind); }
      else { if (++bad >= 5) { bad = 0; badUntil = Date.now() + 60e3; } if (root) { root.innerHTML = lockHtml(true, kind); focusPw(); } }
    });
  }
  function rerender(kind) {
    var fn = { settings: 'renderSettings', security: 'renderSecurity', users: 'renderUsers' }[kind];
    if (fn) { if (typeof window[fn] === 'function') window[fn](); } else render();
  }
  function lock(kind) { openUntil = 0; rerender(kind); }
  function focusPw() { setTimeout(function () { var i = document.getElementById('axl-pw'); if (i) try { i.focus(); } catch (e) {} }, 60); }
  function changePw() {
    if (typeof openModal !== 'function') return;
    openModal('تغيير كلمة سر السجل',
      '<form id="axl-cf" onsubmit="AXAudit.savePw(event)">' +
        '<div class="form-group"><label>كلمة السر الحالية</label><input class="form-control" type="password" name="o" required autocomplete="off"></div>' +
        '<div class="form-group"><label>كلمة السر الجديدة (6 حروف على الأقل)</label><input class="form-control" type="password" name="n" required minlength="6" autocomplete="new-password"></div>' +
        '<div class="form-group"><label>اكتبها تاني</label><input class="form-control" type="password" name="n2" required minlength="6" autocomplete="new-password"></div>' +
      '</form>',
      '<button class="btn btn-secondary" onclick="closeModal()">إلغاء</button><button class="btn btn-primary" onclick="AXAudit.savePw()">حفظ</button>');
  }
  function savePw(e) {
    if (e) e.preventDefault();
    var f = document.getElementById('axl-cf'); if (!f) return;
    var o = f.o.value, n = f.n.value, n2 = f.n2.value;
    if (n.length < 6) { T('كلمة السر الجديدة لازم 6 حروف على الأقل', 'error'); return; }
    if (n !== n2) { T('الكلمتين الجداد مش زي بعض', 'error'); return; }
    hash(o).then(function (h) {
      if (h !== lockHash()) { T('كلمة السر الحالية غلط', 'error'); return; }
      return hash(n).then(function (nh) {
        S()._auditLock = nh;
        try { DB.save(); } catch (x) {}
        if (typeof closeModal === 'function') closeModal();
        T('اتغيرت كلمة سر السجل');
      });
    });
  }

  /* ════════ the page ════════ */
  var OPS = { add: { l: 'إضافة', v: 'ضاف', c: 'g', ic: '<path d="M12 5v14M5 12h14"/>' },
              edit: { l: 'تعديل', v: 'عدّل', c: 'b', ic: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>' },
              delete: { l: 'حذف', v: 'حذف', c: 'r', ic: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>' } };
  var SUS = { high: { l: 'خطيرة', c: 'r' }, medium: { l: 'مشبوهة', c: 'y' }, low: { l: 'منخفضة', c: 'n' } };
  function F() { return auditFilters; }
  function setF(k, v) { F()[k] = v; shown = 40; render(); }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dayTitle(k) {
    var t = (typeof todayStr === 'function') ? todayStr() : dayKey(Date.now());
    var y = dayKey(Date.now() - 864e5);
    if (k === t) return 'النهارده'; if (k === y) return 'امبارح';
    try { return new Date(k + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return k; }
  }
  function filtered(all) {
    var f = F(), out = all;
    if (f.user) out = out.filter(function (e) { return e.userId === f.user; });
    if (f.op) out = out.filter(function (e) { return e.operation === f.op; });
    if (f.table) out = out.filter(function (e) { return e.table === f.table; });
    if (f.suspicion) out = out.filter(function (e) { return (e.suspicionLevel || 'normal') === f.suspicion; });
    if (f.from) { var a = new Date(f.from).getTime(); out = out.filter(function (e) { return e.timestamp >= a; }); }
    if (f.to) { var b = new Date(f.to).getTime() + 864e5; out = out.filter(function (e) { return e.timestamp <= b; }); }
    if (f.search) {
      var q = String(f.search).toLowerCase();
      out = out.filter(function (e) { return [e.userName, e.recordLabel, e.reason, e.recordId, (typeof tableLabel === 'function' ? tableLabel(e.table) : e.table)].some(function (x) { return String(x || '').toLowerCase().indexOf(q) >= 0; }); });
    }
    return out;
  }
  function preview(e) {
    try {
      if (e.operation === 'edit' && e.before && e.after && typeof diffObjects === 'function') {
        var ch = diffObjects(e.before, e.after); if (!ch.length) return '';
        var c = ch[0];
        return '<div class="axu-diff"><span class="axu-f">' + esc(typeof fieldLabel === 'function' ? fieldLabel(c.field) : c.field) + '</span>' +
          '<span class="axu-b">' + fmtAuditValue(c.before) + '</span><span class="axu-ar">←</span><span class="axu-a">' + fmtAuditValue(c.after) + '</span>' +
          (ch.length > 1 ? '<em>+' + (ch.length - 1) + ' تغيير</em>' : '') + '</div>';
      }
    } catch (x) {}
    return '';
  }
  function card(e) {
    var op = OPS[e.operation] || OPS.edit, sus = SUS[e.suspicionLevel];
    var t = new Date(e.timestamp), time = t.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    var rec = e.recordLabel || ('#' + String(e.recordId || '').slice(-6));
    var tbl = typeof tableLabel === 'function' ? tableLabel(e.table) : e.table;
    return '<article class="axu-item op-' + op.c + (sus ? ' sus-' + sus.c : '') + '" onclick="showAuditDetails(\'' + e.id + '\')">' +
      '<span class="axu-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + op.ic + '</svg></span>' +
      '<div class="axu-body">' +
        '<div class="axu-t"><b>' + esc(e.userName || 'مستخدم') + '</b> ' + op.v + ' <span class="axu-tbl">' + esc(tbl) + '</span> <b class="axu-rec">' + esc(rec) + '</b></div>' +
        '<div class="axu-m"><span>' + esc(time) + '</span>' + (e.reason ? '<span class="axu-why">السبب: ' + esc(String(e.reason).slice(0, 60)) + '</span>' : '') +
          (sus ? '<span class="axu-sus s-' + sus.c + '">' + sus.l + '</span>' : '') + '</div>' +
        preview(e) +
      '</div>' +
      '<button type="button" class="axu-del" title="حذف من السجل" aria-label="حذف من السجل" onclick="event.stopPropagation();deleteAuditEntry(\'' + e.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '</article>';
  }
  function chip(k, v, label, n) {
    var on = (F()[k] || '') === v;
    return '<button type="button" class="axu-chip' + (on ? ' on' : '') + '" onclick="AXAudit.f(\'' + k + '\',\'' + v + '\')">' + label + (n != null ? ' <em>' + n + '</em>' : '') + '</button>';
  }
  function page(root) {
    if (typeof markAuditAsSeen === 'function') try { markAuditAsSeen(); } catch (e) {}
    var all = (D().auditLog || []).slice().sort(function (a, b) { return b.timestamp - a.timestamp; });
    var list = filtered(all), f = F();
    var tk = dayKey(Date.now()), today = all.filter(function (e) { return dayKey(e.timestamp) === tk; }).length;
    var high = all.filter(function (e) { return e.suspicionLevel === 'high'; }).length, med = all.filter(function (e) { return e.suspicionLevel === 'medium'; }).length;
    var recent = all.filter(function (e) { return e.timestamp >= Date.now() - 864e5 && (e.suspicionLevel === 'high' || e.suspicionLevel === 'medium'); }).length;
    var users = {}, tables = {};
    all.forEach(function (e) { if (e.userId) users[e.userId] = e.userName; if (e.table) tables[e.table] = 1; });
    var more = !!(f.user || f.table || f.from || f.to);
    var items = list.slice(0, shown), groups = [], cur = null;
    items.forEach(function (e) { var k = dayKey(e.timestamp); if (!cur || cur.k !== k) { cur = { k: k, list: [] }; groups.push(cur); } cur.list.push(e); });
    var opN = function (o) { return all.filter(function (e) { return e.operation === o; }).length; };

    root.innerHTML = '<div class="axu">' +
      '<header class="axu-h"><div><h1>سجل التعديلات</h1><p>كل إضافة وتعديل وحذف — مين عمل إيه وإمتى</p></div>' +
        '<div class="axu-ha"><button type="button" class="btn btn-secondary btn-sm" onclick="AXAudit.changePw()">🔑 كلمة السر</button>' +
        '<button type="button" class="btn btn-primary btn-sm" onclick="AXAudit.lock()">🔒 اقفل</button></div></header>' +
      (recent ? '<div class="axu-alert"><span>⚠️</span><div><b>تنبيه</b> — فيه ' + recent + ' ' + (recent === 1 ? 'عملية مشبوهة' : 'عمليات مشبوهة') + ' في آخر 24 ساعة</div><button type="button" onclick="AXAudit.f(\'suspicion\',\'high\')">اعرضها</button></div>' : '') +
      '<div class="axu-kpis">' +
        '<div class="axu-kpi"><span>كل العمليات</span><b>' + all.length.toLocaleString('en-US') + '</b></div>' +
        '<div class="axu-kpi k-b"><span>النهارده</span><b>' + today + '</b></div>' +
        '<div class="axu-kpi k-y"><span>مشبوهة</span><b>' + med + '</b></div>' +
        '<div class="axu-kpi k-r"><span>خطيرة</span><b>' + high + '</b></div>' +
      '</div>' +
      '<section class="axu-filters">' +
        '<div class="axu-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
          '<input type="search" class="form-control" placeholder="ابحث باسم المستخدم أو العميل أو الفاتورة أو السبب…" value="' + esc(f.search || '') + '" oninput="AXAudit.search(this.value)"></div>' +
        '<div class="axu-chips">' + chip('op', '', 'الكل', all.length) + chip('op', 'add', 'إضافة', opN('add')) + chip('op', 'edit', 'تعديل', opN('edit')) + chip('op', 'delete', 'حذف', opN('delete')) +
          '<span class="axu-sep"></span>' + chip('suspicion', 'high', '⚠️ خطيرة', high) + chip('suspicion', 'medium', 'مشبوهة', med) + (f.suspicion ? chip('suspicion', '', 'كل المستويات') : '') + '</div>' +
        '<details class="axu-more"' + (more ? ' open' : '') + '><summary>فلاتر أكتر' + (more ? ' •' : '') + '</summary><div class="axu-mg">' +
          '<label>المستخدم<select class="form-control" onchange="AXAudit.f(\'user\',this.value)"><option value="">كل المستخدمين</option>' +
            Object.keys(users).map(function (id) { return '<option value="' + esc(id) + '"' + (f.user === id ? ' selected' : '') + '>' + esc(users[id]) + '</option>'; }).join('') + '</select></label>' +
          '<label>القسم<select class="form-control" onchange="AXAudit.f(\'table\',this.value)"><option value="">كل الأقسام</option>' +
            Object.keys(tables).map(function (t) { return '<option value="' + esc(t) + '"' + (f.table === t ? ' selected' : '') + '>' + esc(typeof tableLabel === 'function' ? tableLabel(t) : t) + '</option>'; }).join('') + '</select></label>' +
          '<label>من<input type="date" class="form-control" value="' + esc(f.from || '') + '" onchange="AXAudit.f(\'from\',this.value)"></label>' +
          '<label>لحد<input type="date" class="form-control" value="' + esc(f.to || '') + '" onchange="AXAudit.f(\'to\',this.value)"></label>' +
          '<button type="button" class="btn btn-secondary btn-sm" onclick="AXAudit.reset()">⟳ امسح الفلاتر</button>' +
        '</div></details>' +
      '</section>' +
      '<div class="axu-count">' + (list.length === all.length ? list.length + ' عملية' : list.length + ' من ' + all.length + ' عملية') + '</div>' +
      (groups.length ? groups.map(function (g) {
        return '<section class="axu-day"><h3>' + esc(dayTitle(g.k)) + ' <em>' + g.list.length + '</em></h3><div class="axu-list">' + g.list.map(card).join('') + '</div></section>';
      }).join('') : '<div class="axu-empty">🔍<p>مفيش عمليات بالفلاتر دي</p></div>') +
      (list.length > shown ? '<button type="button" class="axu-loadmore" onclick="AXAudit.more()">عرض أكتر (' + (list.length - shown) + ' باقيين)</button>' : '') +
      '<section class="axu-danger"><div><b>تنظيف السجل</b><span>الحذف من السجل نهائي</span></div>' +
        '<button type="button" class="btn btn-sm btn-secondary" onclick="deleteFilteredAuditEntries()">حذف الظاهر (' + list.length + ')</button>' +
        '<button type="button" class="btn btn-sm btn-danger" onclick="clearAllAuditLog()">مسح السجل كله</button></section>' +
    '</div>';
  }

  var orig = window.renderAuditLog;
  function render() {
    var root = document.getElementById('page-content'); if (!root) return;
    if (me().role !== 'admin') { root.innerHTML = '<div class="empty-state"><div class="icon">🔒</div><p>الصفحة دي للمدير بس</p></div>'; return; }
    if (!isOpen()) { root.innerHTML = lockHtml(false, 'audit'); focusPw(); return; }
    openUntil = Date.now() + OPEN_MS;                                           // still using it → keep it open
    try { page(root); } catch (e) { console.error('[auditx]', e); if (typeof orig === 'function') orig(); }
  }
  window.renderAuditLog = render;
  var st = 0;
  /* shared with the settings page: one password, one open window */
  window.AXLock = {
    isOpen: isOpen, touch: function () { if (isOpen()) openUntil = Date.now() + OPEN_MS; },
    html: lockHtml, focus: focusPw, lock: lock, changePw: changePw
  };
  window.AXAudit = {
    unlock: unlock, setup: setup, lock: lock, changePw: changePw, savePw: savePw,
    f: function (k, v) { setF(k, v); },
    search: function (v) { F().search = v; clearTimeout(st); st = setTimeout(function () { shown = 40; render(); var i = document.querySelector('.axu-search input'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) {} } }, 250); },
    reset: function () { auditFilters = { user: '', op: '', table: '', search: '', from: '', to: '', suspicion: '' }; shown = 40; render(); },
    more: function () { shown += 40; render(); },
    _hash: hash
  };
})();

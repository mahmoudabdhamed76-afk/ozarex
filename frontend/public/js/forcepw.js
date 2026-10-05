/* ════════════════════════════════════════════════════════════════════
   ERP · تغيير كلمة السر الإجباري (4.20)
   لو كلمة السر سهلة التخمين (زي admin/admin أول تشغيل) السيرفر بيقفل أي
   تعديل لحد ما تتغير — والشاشة دي بتطلع ومتتقفلش غير بعد التغيير.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var shown = false;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function open() {
    if (shown || document.getElementById('axpw')) return;
    shown = true;
    var el = document.createElement('div'); el.id = 'axpw'; el.className = 'axpw ax-hl-off';
    el.innerHTML = '<div class="axpw-card" role="dialog" aria-modal="true" aria-labelledby="axpw-t">' +
      '<div class="axpw-ic">🔐</div>' +
      '<h2 id="axpw-t">غيّر كلمة السر الأول</h2>' +
      '<p>كلمة السر الحالية سهلة التخمين، فالبرنامج مقفول على التعديل لحد ما تغيرها. اختار كلمة سر من 6 حروف على الأقل ومحدش يعرفها.</p>' +
      '<form id="axpw-f" autocomplete="off">' +
        '<input class="form-control" type="password" name="current" placeholder="كلمة السر الحالية" autocomplete="current-password" required>' +
        '<input class="form-control" type="password" name="next" placeholder="كلمة السر الجديدة" autocomplete="new-password" minlength="6" required>' +
        '<input class="form-control" type="password" name="next2" placeholder="اكتبها تاني" autocomplete="new-password" minlength="6" required>' +
        '<div class="axpw-err" id="axpw-err" role="alert"></div>' +
        '<button type="submit" class="btn btn-primary axpw-go">حفظ كلمة السر</button>' +
        '<button type="button" class="axpw-out" onclick="AXForcePw.logout()">تسجيل خروج</button>' +
      '</form></div>';
    document.body.appendChild(el);
    var f = document.getElementById('axpw-f');
    f.addEventListener('submit', function (e) { e.preventDefault(); save(f); });
    setTimeout(function () { try { f.current.focus(); } catch (x) {} }, 80);
  }
  function err(m) { var e = document.getElementById('axpw-err'); if (e) e.textContent = m || ''; }
  function save(f) {
    var cur = f.current.value, nx = f.next.value, nx2 = f.next2.value;
    if (nx.length < 6) return err('كلمة السر الجديدة 6 حروف على الأقل');
    if (nx !== nx2) return err('الكلمتين الجداد مش زي بعض');
    if (nx === cur) return err('اختار كلمة سر جديدة غير القديمة');
    err('');
    var b = f.querySelector('.axpw-go'); if (b) b.disabled = true;
    fetch('/api/password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: cur, next: nx }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (b) b.disabled = false;
        if (!x.ok) return err((x.j && x.j.message) || 'محصلش — جرّب تاني');
        var el = document.getElementById('axpw'); if (el) el.remove();
        shown = false; window.__mustChange = false;
        try { sessionStorage.removeItem('emx_weak'); } catch (e) {}
        try { if (window.OfflineAuth && typeof currentUser !== 'undefined' && currentUser) OfflineAuth.save(currentUser.username, nx, currentUser); } catch (e) {}
        if (typeof toast === 'function') toast('اتغيرت كلمة السر ✓ — الأجهزة التانية هتحتاج تسجل دخول تاني');
      })
      .catch(function () { if (b) b.disabled = false; err('مفيش اتصال بالسيرفر'); });
  }

  /* the server says «must_change» on any write → show the screen */
  var _f = window.fetch;
  window.fetch = function (input, init) {
    return _f.apply(this, arguments).then(function (r) {
      try {
        var u = typeof input === 'string' ? input : (input && input.url) || '';
        if (r.status === 403 && u.indexOf('/api/') >= 0) r.clone().json().then(function (j) { if (j && j.error === 'must_change') open(); }).catch(function () {});
      } catch (e) {}
      return r;
    });
  };

  window.AXForcePw = {
    open: open,
    check: function (j) { if (j && j.mustChange) { window.__mustChange = true; setTimeout(open, 600); } },
    logout: function () { if (typeof logout === 'function') logout(); else location.reload(); }
  };
  if (window.__mustChange) setTimeout(open, 1200);
})();

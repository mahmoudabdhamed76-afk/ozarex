/* ════════════════════════════════════════════════════════════════════
   ERP · زرار «المزيد» العايم على الكمبيوتر (4.22)
   جنب المساعد الذكي العايم: بيفتح نفس «المزيد» اللي في الموبايل
   (إنشاء سريع بترتيبك · كل الأقسام · الوضع الليلي · خروج) كلوحة عايمة
   فوق الزرار. على الموبايل مبيظهرش (عندك «المزيد» في الشريط السفلي).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MQ = window.matchMedia('(min-width: 769px)');
  var IC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';

  function logged() { return typeof currentUser !== 'undefined' && !!currentUser; }
  function isOpen() { var el = document.getElementById('mh-more'); return !!(el && el.classList.contains('show')); }

  function fab() {
    var b = document.getElementById('ax-more-fab');
    if (!b) {
      b = document.createElement('button');
      b.id = 'ax-more-fab'; b.type = 'button'; b.className = 'ax-hl-off';
      b.title = 'المزيد'; b.setAttribute('aria-label', 'المزيد'); b.setAttribute('aria-haspopup', 'dialog');
      b.innerHTML = IC + '<span>المزيد</span>';
      b.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
      document.body.appendChild(b);
    }
    return b;
  }
  function sync() {
    var b = fab();
    var on = MQ.matches && logged() && !!window.AXM;
    b.classList.toggle('show', on);
    b.classList.toggle('on', on && isOpen());
  }
  function toggle() {
    if (!window.AXM) return;
    if (isOpen()) AXM.more(false); else AXM.more();
  }

  /* the sheet becomes a floating panel on the computer */
  function hookMore() {
    if (!window.AXM || AXM.more._axd) return !!window.AXM;
    var orig = AXM.more;
    var w = function (open) {
      var r = orig.apply(this, arguments);
      var el = document.getElementById('mh-more');
      if (el) {
        var desk = MQ.matches && open !== false;
        if (open !== false) el.classList.toggle('mh-desk', MQ.matches);
        if (desk) {
          // the search row → the search box in the top bar
          var sb = el.querySelector('.mh-sbox');
          if (sb) sb.setAttribute('onclick', "AXM.more(false);setTimeout(function(){var i=document.getElementById('global-search');if(i){i.focus();i.select&&i.select();}},60)");
          var p = el.querySelector('.mh-panel'); if (p) p.scrollTop = 0;
        }
      }
      setTimeout(sync, 0);
      return r;
    };
    w._axd = true;
    AXM.more = w;
    return true;
  }

  function boot() {
    hookMore() || setTimeout(function () { hookMore(); sync(); }, 800);
    sync();
    // page change / login / logout all go through these
    ['updateHomeFab', 'logout'].forEach(function (fn) {
      var o = window[fn];
      if (typeof o !== 'function' || o._axd) return;
      /* logout() is async (it may first send or ask about unsent changes) → also sync once it has finished */
      var w = function () { var r = o.apply(this, arguments); setTimeout(sync, 0); if (r && typeof r.then === 'function') r.then(function () { setTimeout(sync, 0); }, function () {}); return r; };
      w._axd = true; window[fn] = w;
    });
    try { MQ.addEventListener('change', function () { if (isOpen()) AXM.more(false); sync(); }); } catch (e) {}
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen() && MQ.matches) AXM.more(false); });
    setInterval(sync, 3000);   // cheap safety net (login screen, session expiry)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.AXDeskMore = { toggle: toggle, sync: sync };
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · الشريط السفلي الذكي (4.21) — موبايل بس
   · تنزل لتحت  ← الشريط بيختفي تدريجي (حركة ناعمة)
   · تطلع لفوق   ← بيرجع فوراً
   · أول الصفحة  ← ظاهر دايماً
   مبيختفيش وفيه شيت/نافذة/بحث مفتوح، وبيرجع مع كل تنقل بين الصفحات.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var TOP = 64,          // أول الصفحة: الشريط ظاهر
      DOWN = 14,         // لازم تنزل المسافة دي على الأقل عشان يختفي (مش أي رعشة صباع)
      UP = 6;            // أي طلوع بسيط يرجّعه
  var html = document.documentElement, mq = window.matchMedia('(max-width: 768px)');
  var lastY = 0, acc = 0, ticking = false, hidden = false, lastMini = null, holdUntil = 0;

  function y() { return Math.max(0, window.pageYOffset || html.scrollTop || 0); }
  function maxY() { return Math.max(0, (document.scrollingElement || html).scrollHeight - window.innerHeight); }
  function blocked() {
    if (html.classList.contains('mh-lock') || html.classList.contains('axn-lock')) return true;
    var m = document.getElementById('modal-overlay'); if (m && m.classList.contains('show')) return true;
    if (document.querySelector('.notify-overlay.show, .axp.show, .axp-ov.show, #axpw')) return true;
    return false;
  }
  function set(h) {
    if (h === hidden) return;
    hidden = h;
    html.classList.toggle('bn-hide', h);
  }
  function show() { acc = 0; set(false); }

  function frame() {
    ticking = false;
    if (!mq.matches) { show(); lastY = y(); return; }
    var cur = Math.min(y(), maxY());
    // papermeter بيصغّر الهيدر وبيعوّض السكرول — دي مش حركة من المستخدم
    var mini = html.classList.contains('pm-mini');
    if (mini !== lastMini || Date.now() < holdUntil) { lastMini = mini; lastY = cur; return; }
    var d = cur - lastY; lastY = cur;
    if (cur <= TOP || blocked()) return show();
    if (d < 0) { acc = 0; if (-d >= UP) set(false); return; }
    if (d > 0) { acc += d; if (acc >= DOWN) set(true); }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { lastY = y(); if (!mq.matches) show(); }, { passive: true });
  try { mq.addEventListener('change', function () { show(); }); } catch (e) {}
  // لمسة على مكان الشريط وهو مستخبي (آخر الشاشة) ترجّعه
  document.addEventListener('touchstart', function (e) {
    if (!hidden || !e.touches || !e.touches[0]) return;
    if (e.touches[0].clientY > window.innerHeight - 28) show();
  }, { passive: true });

  // كل تنقل بين الصفحات يرجّع الشريط
  function hook() {
    var nav = window.navigate;
    if (typeof nav !== 'function' || nav._axns) return;
    var w = function () { holdUntil = Date.now() + 350; show(); return nav.apply(this, arguments); };
    w._axns = true;
    window.navigate = w;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  setTimeout(hook, 1500);

  window.AXNavSmart = { show: show, hide: function () { set(true); }, isHidden: function () { return hidden; } };
})();

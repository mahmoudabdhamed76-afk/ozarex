/* ════════════════════════════════════════════════════════════════════
   ERP · «مساعدك الذكي» بيتكتب حرف حرف مع كل نطة للروبوت (4.23)
   متزامن مع حركة النط (CSS axHop): أول الدورة الكلمة بتختفي، ومع الاستعداد
   للنطة بتتكتب من الأول وهو في الهوا.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var TEXT = 'مساعدك الذكي', START = 330, STEP = 62;
  var timers = [];
  function clear() { timers.forEach(clearTimeout); timers = []; }
  function els() {
    var b = document.getElementById('ai-fab'); if (!b) return null;
    return { b: b, jump: b.querySelector('.axbot-jump'), tag: b.querySelector('.axbot-tag'), txt: b.querySelector('.axbot-txt') };
  }
  function type() {
    var e = els(); if (!e || !e.tag || !e.txt) return;
    clear();
    var chars = Array.from(TEXT);
    e.txt.textContent = ''; e.tag.classList.add('empty'); e.tag.classList.remove('typing');
    timers.push(setTimeout(function () { e.tag.classList.remove('empty'); e.tag.classList.add('typing'); }, START - 40));
    chars.forEach(function (c, i) {
      timers.push(setTimeout(function () { e.txt.textContent = chars.slice(0, i + 1).join(''); }, START + i * STEP));
    });
    timers.push(setTimeout(function () { e.tag.classList.remove('typing'); }, START + chars.length * STEP + 700));
  }
  function boot() {
    var e = els(); if (!e || !e.jump) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { e.txt.textContent = TEXT; e.tag.classList.remove('empty'); return; }
    e.txt.textContent = '';
    e.tag.classList.add('empty');
    function on(ev) { if (ev.target === e.jump && ev.animationName === 'axHop') type(); }
    e.jump.addEventListener('animationstart', on);
    e.jump.addEventListener('animationiteration', on);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

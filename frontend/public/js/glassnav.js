/* ════════════════════════════════════════════════════════════════════
   ERP · الشريط السفلي الزجاجي (4.28) — موبايل بس
   شريط عايم ببلور قوي وحواف دائرية كبيرة، والتاب المفتوح جوه كبسولة
   زجاجية مضيئة بتتزحلق بنطة خفيفة من تاب للتاني. نفس الأيقونات والترتيب.
   («بيع» بيبقى مفتوح في «صرف الورق» و«المبيعات»)
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MQ = window.matchMedia('(max-width: 768px)');
  var ALSO = { sales: 'issuances' };                       // a page shown under another tab

  function page() { return typeof currentPage !== 'undefined' ? currentPage : ''; }
  function capsule(bn) {
    var c = bn.querySelector(':scope > .bn-glass');
    if (!c) { c = document.createElement('span'); c.className = 'bn-glass'; c.setAttribute('aria-hidden', 'true'); bn.insertBefore(c, bn.firstChild); c.__first = true; }
    return c;
  }
  function sync() {
    var bn = document.getElementById('bottom-nav'); if (!bn) return;
    var p = page(), tab = ALSO[p] || p;
    var items = bn.querySelectorAll('.bn-item'), act = null;
    Array.prototype.forEach.call(items, function (b) {
      var on = !!b.dataset.page && b.dataset.page === tab;
      b.classList.toggle('active', on);
      if (on) { act = b; b.setAttribute('aria-current', 'page'); } else b.removeAttribute('aria-current');
    });
    if (!MQ.matches) return;
    var c = capsule(bn);
    if (!act || !act.offsetWidth) { c.classList.remove('on'); return; }
    var x = act.offsetLeft, w = act.offsetWidth;
    if (c.__first) c.classList.add('no-anim');                // the first time: straight to its place, no slide
    c.style.width = w + 'px';
    c.style.transform = 'translate3d(' + x + 'px, 0, 0)';
    c.classList.add('on');
    if (c.__first) { c.__first = false; void c.offsetWidth; c.classList.remove('no-anim'); }
    if (act.__was !== true) { act.classList.remove('bn-pop'); void act.offsetWidth; act.classList.add('bn-pop'); }
    Array.prototype.forEach.call(items, function (b) { b.__was = b === act; });
  }
  var raf = 0;
  function later() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; sync(); }); }

  /* every page change and every rebuild of the bar goes through updateHomeFab */
  var o = window.updateHomeFab;
  if (typeof o === 'function' && !o._glass) {
    var w = function () { var r = o.apply(this, arguments); later(); return r; };
    w._glass = true; window.updateHomeFab = w;
  }
  addEventListener('resize', later);
  try { MQ.addEventListener('change', later); } catch (e) {}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later); else later();
  window.AXGlassNav = { sync: sync };
})();

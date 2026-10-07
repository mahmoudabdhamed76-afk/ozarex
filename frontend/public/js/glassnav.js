/* ════════════════════════════════════════════════════════════════════
   ERP · الشريط السفلي — عدسة زجاجية زي متجر آبل (4.29) — موبايل بس
   • التاب المفتوح: عدسة زجاجية هادية تحته.
   • تلمس الشريط وتسحب صباعك: العدسة بتكبر وتطلع برا الشريط، بتمشي مع صباعك،
     وجواها نسخة مكبّرة من اللي تحتها (زي العدسة) بحافة ألوان خفيفة؛ التاب اللي
     تحتها بيتلوّن.
   • تفلت صباعك: العدسة بتستقر على أقرب تاب بنطة وتفتحه. لمسة عادية = نفس الكلام.
   نفس الأيقونات والترتيب. («بيع» مفتوح في «صرف الورق» و«المبيعات»)
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MQ = window.matchMedia('(max-width: 768px)');
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ALSO = { sales: 'issuances' };                       // a page shown under another tab
  var drag = null, blockClicksUntil = 0;

  function page() { return typeof currentPage !== 'undefined' ? currentPage : ''; }
  function nav() { return document.getElementById('bottom-nav'); }
  function tabs(bn) { return Array.prototype.slice.call(bn.querySelectorAll(':scope > .bn-item')); }
  function lens(bn) {
    var c = bn.querySelector(':scope > .bn-glass');
    if (!c) {
      c = document.createElement('span'); c.className = 'bn-glass'; c.setAttribute('aria-hidden', 'true');
      c.innerHTML = '<span class="bn-lens-in"></span>';
      bn.insertBefore(c, bn.firstChild); c.__first = true;
    }
    return c;
  }
  function place(c, x, w) { c.__x = x; c.__w = w; c.style.width = w + 'px'; c.style.setProperty('--x', x + 'px'); }

  /* ── resting state: the lens under the open tab ── */
  function sync() {
    var bn = nav(); if (!bn) return;
    var p = page(), tab = ALSO[p] || p, act = null;
    tabs(bn).forEach(function (b) {
      var on = !!b.dataset.page && b.dataset.page === tab;
      b.classList.toggle('active', on);
      if (on) { act = b; b.setAttribute('aria-current', 'page'); } else b.removeAttribute('aria-current');
    });
    if (!MQ.matches || drag) return;
    var c = lens(bn);
    if (!act || !act.offsetWidth) { c.classList.remove('on'); return; }
    if (c.__first) c.classList.add('no-anim');               // the first time: straight to its place
    place(c, act.offsetLeft, act.offsetWidth);
    c.classList.add('on');
    if (c.__first) { c.__first = false; void c.offsetWidth; c.classList.remove('no-anim'); }
  }
  var raf = 0;
  function later() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; sync(); }); }

  /* ── dragging: the lens follows the finger and magnifies what is under it ── */
  function nearest(bn, cx) {
    var best = null, d = 1e9;
    tabs(bn).forEach(function (b) { var m = b.offsetLeft + b.offsetWidth / 2, k = Math.abs(m - cx); if (k < d) { d = k; best = b; } });
    return best;
  }
  function fillLens(bn, c) {
    /* a copy of the tabs, laid out exactly like the real ones, shown inside the lens */
    var inn = c.querySelector('.bn-lens-in');
    /* plain copies (not buttons, not «.bn-item»): nothing else in the app ever finds them; gone after the drag */
    /* the labels are drawn by CSS (::after) so the copies hold no text: a search for «عملاء» finds only the real tab */
    inn.textContent = '';
    tabs(bn).forEach(function (b) {
      var g = document.createElement('span'); g.className = 'bn-ghost' + (b.classList.contains('active') ? ' active' : '');
      Array.prototype.forEach.call(b.childNodes, function (n) {
        if (n.nodeType !== 1) return;
        if (n.tagName.toLowerCase() === 'svg') { g.appendChild(n.cloneNode(true)); return; }
        var t = document.createElement('span'); t.className = 'bn-gl'; t.setAttribute('data-t', n.textContent.trim()); g.appendChild(t);
      });
      inn.appendChild(g);
    });
    var cs = getComputedStyle(bn);
    inn.style.width = bn.clientWidth + 'px'; inn.style.height = bn.clientHeight + 'px';
    inn.style.padding = cs.padding; inn.style.gap = cs.gap;
  }
  function moveTo(bn, c, cx, instant) {
    var w = c.__w || 70, min = 0, max = bn.clientWidth - w;
    var x = Math.max(min, Math.min(max, cx - w / 2));
    if (instant) c.classList.add('no-anim');
    place(c, x, w);
    var inn = c.querySelector('.bn-lens-in');
    inn.style.transform = 'translate3d(' + (-x - c.clientLeft) + 'px, ' + (-c.offsetTop - c.clientTop) + 'px, 0)';
    if (instant) { void c.offsetWidth; c.classList.remove('no-anim'); }
    var hot = nearest(bn, x + w / 2), list = tabs(bn), i = list.indexOf(hot);
    list.forEach(function (b, k) { b.classList.toggle('bn-hot', k === i); });
    Array.prototype.forEach.call(inn.children, function (b, k) { b.classList.toggle('bn-hot', k === i); });
    return hot;
  }
  function down(e) {
    if (!MQ.matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var bn = nav(); if (!bn || !bn.contains(e.target)) return;
    var first = e.target.closest('.bn-item'); if (!first) return;
    var c = lens(bn);
    var r = bn.getBoundingClientRect(), cx = e.clientX - r.left - bn.clientLeft;
    drag = { id: e.pointerId, bn: bn, c: c, x0: e.clientX, moved: false, hot: first };
    try { bn.setPointerCapture(e.pointerId); } catch (_) {}
    if (!c.__w) place(c, first.offsetLeft, first.offsetWidth);
    place(c, c.__x, first.offsetWidth);
    fillLens(bn, c);
    c.classList.add('on', 'drag');
    bn.classList.add('bn-dragging');
    drag.hot = moveTo(bn, c, cx, false);                     // the lens jumps (with a spring) to the finger
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.abs(e.clientX - drag.x0) > 4) drag.moved = true;
    var r = drag.bn.getBoundingClientRect();
    drag.c.classList.add('follow');                          // follow the finger 1:1 while moving
    drag.hot = moveTo(drag.bn, drag.c, e.clientX - r.left - drag.bn.clientLeft, false);
    e.preventDefault();
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    try { d.bn.releasePointerCapture(e.pointerId); } catch (_) {}
    var target = e.type === 'pointercancel' ? null : d.hot;
    d.c.classList.remove('follow', 'drag');
    d.bn.classList.remove('bn-dragging');
    tabs(d.bn).forEach(function (b) { b.classList.remove('bn-hot'); });
    blockClicksUntil = Date.now() + 450;                     // the browser's own click after this touch is ignored
    var inn = d.c.querySelector('.bn-lens-in');
    setTimeout(function () { if (!drag && inn) inn.innerHTML = ''; }, 350);
    if (target) {
      place(d.c, target.offsetLeft, target.offsetWidth);     // settles on the tab with a spring…
      setTimeout(function () { target.__ours = true; target.click(); target.__ours = false; later(); }, RM.matches ? 0 : 140);   // …then opens it
    } else later();
  }
  /* a click that comes from the touch we just handled must not open a second time */
  document.addEventListener('click', function (e) {
    var bn = nav(); if (!bn || !bn.contains(e.target)) return;
    var b = e.target.closest('.bn-item');
    if (b && b.__ours) return;
    if (Date.now() < blockClicksUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  function boot() {
    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    later();
  }
  /* every page change and every rebuild of the bar goes through updateHomeFab */
  var o = window.updateHomeFab;
  if (typeof o === 'function' && !o._glass) {
    var w = function () { var r = o.apply(this, arguments); later(); return r; };
    w._glass = true; window.updateHomeFab = w;
  }
  addEventListener('resize', later);
  try { MQ.addEventListener('change', later); } catch (e) {}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.AXGlassNav = { sync: sync };
})();

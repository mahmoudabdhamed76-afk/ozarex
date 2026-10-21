/* ════════════════════════════════════════════════════════════
   4.46 · رسمة الدولاب (Hairline Cabinet)
   1) رأس صفحة «الأمان والنسخ»: كل درج = نسخة احتياطية
   2) شاشة المزامنة: لما البرنامج يرفع التعديلات اللي اتعملت أوفلاين
   الدرج اللي بيتفتح بياخد لون دهبي مختلف عن الباقي.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function when(fn) { if (window.Hairline) fn(); else window.addEventListener('hairline:ready', fn, { once: true }); }

  /* a cabinet inside el; returns { destroy } right away, even before the library lands */
  function mount(el, opts) {
    var fig = null, dead = false;
    when(function () { if (dead || !el.isConnected) return; try { fig = window.Hairline.cabinet(el, Object.assign({ play: !reduced(), intensity: 0.75, label: 'دولاب أدراج بيتفتح ويتقفل' }, opts || {})); } catch (e) {} });
    return { destroy: function () { dead = true; try { fig && fig.destroy(); } catch (e) {} } };
  }

  /* ── sync overlay ── */
  var ov = null, cab = null, t0 = 0, total = 0, hideT = 0;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function start(n) {
    total = Math.max(1, n | 0); t0 = Date.now(); clearTimeout(hideT);
    if (!ov) {
      ov = el('div', 'axsync ax-hl-off'); ov.setAttribute('role', 'status'); ov.setAttribute('aria-live', 'polite');
      var f = el('div', 'axsync-fig axcab'); ov.appendChild(f);
      ov.appendChild(el('h3', '', 'بنزامن بياناتك…'));
      ov.appendChild(el('p', 'axsync-sub', ''));
      var bar = el('div', 'axsync-bar'); bar.appendChild(el('i')); ov.appendChild(bar);
      ov.appendChild(el('small', 'axsync-tip', 'دوس في أي حتة تكمّل شغلك — المزامنة شغّالة في الخلفية'));
      ov.addEventListener('click', function () { hide(true); });
      document.body.appendChild(ov);
      cab = mount(f, { intensity: 0.85 });
    }
    ov.querySelector('.axsync-sub').textContent = 'بنرفع ' + total + ' تعديل اتعمل وانت أوفلاين';
    step(0);
    void ov.offsetWidth; ov.classList.add('show');
  }
  function step(k) {
    if (!ov) return;
    var i = ov.querySelector('.axsync-bar i'); if (i) i.style.width = Math.max(6, Math.min(100, Math.round(100 * (k | 0) / total))) + '%';
  }
  function done(sent) {
    if (!ov) return;
    step(total);
    ov.querySelector('h3').textContent = sent ? '✓ اتزامن كله' : 'خلصنا';
    if (sent) ov.querySelector('.axsync-sub').textContent = 'اترفع ' + sent + ' تعديل على السيرفر';
    var wait = Math.max(900, 1700 - (Date.now() - t0));      // never just a flash
    clearTimeout(hideT); hideT = setTimeout(function () { hide(); }, wait);
  }
  function hide(now) {
    if (!ov) return;
    var o = ov, c = cab; ov = null; cab = null;
    o.classList.remove('show'); o.classList.add('out');
    setTimeout(function () { try { c && c.destroy(); } catch (e) {} if (o.parentNode) o.parentNode.removeChild(o); }, now ? 200 : 450);
  }

  window.AXCab = { mount: mount, sync: { start: start, step: step, done: done, hide: hide } };
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · «AI agent» فوق وش المساعد العايم (4.49)
   الكتابة متزامنة مع axFaceBeat. تعابير الوش (AXFace.set):
   happy ابتسامة · sad عيون نازلة · thinking بتبص يمين وشمال · غير كده محايد
   (رمشة + نظرة فوق/تحت/يمين/شمال من CSS).
   الصفحة المفتوحة (المساعد الذكي) بتبتسم لوحدها عن طريق .is-open.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var TEXT = 'AI agent', START = 330, STEP = 62;
  var timers = [];
  var linger = 0;
  var MOODS = { happy: 'mood-happy', sad: 'mood-sad', thinking: 'mood-thinking' };

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function fab() { return document.getElementById('ai-fab'); }
  function els() {
    var b = fab(); if (!b) return null;
    return { b: b, beat: b.querySelector('.axface-float'), tag: b.querySelector('.axbot-tag'), txt: b.querySelector('.axbot-txt') };
  }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function type() {
    var e = els(); if (!e || !e.tag || !e.txt) return;
    clearTimers();
    var chars = Array.from(TEXT);
    e.txt.textContent = ''; e.tag.classList.add('empty'); e.tag.classList.remove('typing');
    timers.push(setTimeout(function () {
      var n = els(); if (!n || !n.tag) return;
      n.tag.classList.remove('empty'); n.tag.classList.add('typing');
    }, START - 40));
    chars.forEach(function (c, i) {
      timers.push(setTimeout(function () {
        var n = els(); if (!n || !n.txt) return;
        n.txt.textContent = chars.slice(0, i + 1).join('');
      }, START + i * STEP));
    });
    timers.push(setTimeout(function () {
      var n = els(); if (!n || !n.tag) return;
      n.tag.classList.remove('typing');
    }, START + chars.length * STEP + 700));
  }
  function showTip() {
    var e = els(); if (!e || !e.txt || !e.tag) return;
    clearTimers();
    e.txt.textContent = TEXT;
    e.tag.classList.remove('empty', 'typing');
  }
  function syncOpen() {
    var b = fab(); if (!b) return;
    var open = false;
    try { open = typeof currentPage !== 'undefined' && currentPage === 'aiassistant'; } catch (e) {}
    b.classList.toggle('is-open', !!open);
  }
  function setMood(mood) {
    var b = fab(); if (!b) return;
    clearTimeout(linger);
    Object.keys(MOODS).forEach(function (k) { b.classList.remove(MOODS[k]); });
    if (MOODS[mood]) b.classList.add(MOODS[mood]);
    b.setAttribute('data-mood', MOODS[mood] ? mood : 'neutral');
    if (mood === 'happy' || mood === 'sad') linger = setTimeout(function () { setMood('neutral'); }, 5200);
  }
  function boot() {
    var e = els(); if (!e) return;
    syncOpen();
    if (reduced()) { showTip(); return; }
    if (e.txt) e.txt.textContent = '';
    if (e.tag) e.tag.classList.add('empty');
    if (!e.beat) return;
    function on(ev) { if (ev.target === e.beat && ev.animationName === 'axFaceBeat') type(); }
    e.beat.addEventListener('animationstart', on);
    e.beat.addEventListener('animationiteration', on);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* deskmore.js may wrap updateHomeFab on DOMContentLoaded; wrap whatever is current then */
  function hookNav() {
    var o = window.updateHomeFab;
    if (typeof o !== 'function' || o._axface) { syncOpen(); return; }
    var w = function () { var r = o.apply(this, arguments); syncOpen(); return r; };
    w._axface = true;
    window.updateHomeFab = w;
  }
  hookNav();
  document.addEventListener('DOMContentLoaded', hookNav);

  window.AXFace = { set: setMood, sync: syncOpen };
})();

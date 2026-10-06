/* ════════════════════════════════════════════════════════════════════
   ERP · قلم الهايلايتر (4.14 أخضر · 4.14.1 أحمر · 4.16 كل الألوان)
   أي كلام أو رقم ملوّن في البرنامج بياخد ضربة قلم هايلايتر بنفس لونه:
     أخضر · أحمر · أزرق · أصفر/دهبي · برتقاني · بنفسجي · تركواز · بمبي
   • النصوص الملونة (رقم أو جملة قصيرة) → ضربة ماركر وراها.
   • الشارات الملونة (مسدد، غير مدفوع، أقدم دين …) → الضربة بتاخد مكان الشارة.
   • الزراير المليانة (كشوف أول الشهر، اطلب شراء، حفظ …) → الزرار نفسه
     بيبقى ضربة ماركر بلونه: حواف غير منتظمة ولون أتقل في أولها.
   • الزراير الشفافة اللي كلامها ملوّن → ضربة ماركر بلون الكلام.
   بيشتغل لوحده على كل الصفحات والنوافذ والإشعارات: بيقيس اللون المحسوب.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ROOTS = '#page-content, .modal-overlay, #axn, .mh-sheet, #pm-pop, .topbar';
  var SKIP = 'input, textarea, select, option, .ax-mkb, svg, canvas, script, style, #bottom-nav, .sidebar, .nav-item, .badge, .notif-dot, .mh-dot, .fc-day, .pm, .pxs-go, .ax-hl-off';
  var BTN = 'button, a.btn, .btn, [role="tab"]';
  var BTN_SKIP = '#bottom-nav, .sidebar, .nav-item, .pm, .pxs-tiles, .ax-hl-off, .btn-icon, .voice-mic-btn, .axa-micb, .axa-sendb, .topbar-btn, .modal-close, .mh-ic, svg';
  var DIGIT = /[0-9٠-٩]/, LETTERS = /[A-Za-zء-ي]/g, WORDISH = /[0-9٠-٩A-Za-zء-ي]/;
  var OURS = /\b(ax-hl[\w-]*|ax-mkb[\w-]*|hlk-\w+)\b/g;
  var FAM = ['g', 'r', 'b', 'y', 'o', 'v', 't', 'p'];
  /* always a green stroke, whatever its own colour — and it's drawn again every 15 seconds
     (the big number over the live board's graph: «34,000 ورقة») */
  var FORCE_G = '.pxs-gval', REDRAW_MS = 15000;
  var timer = 0, inkRGB = null;

  function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function isNumberText(t) {
    t = clean(t);
    if (!t || t.length > 26 || !DIGIT.test(t)) return false;
    if ((t.match(LETTERS) || []).length > 6) return false;
    return /^[+\-−▲▼≈~(#]?\s*[0-9٠-٩]/.test(t);
  }
  function isShortText(t) {                                          // a number, a word, a label or a short sentence — not a paragraph
    t = clean(t);
    return !!t && t.length <= 48 && WORDISH.test(t) && t.split(' ').length <= 7;
  }
  function rgba(c) {
    var m = c && c.match(/[\d.]+/g); if (!m || m.length < 3) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
  }
  /* colour → marker family by hue (grey / white / black → null) */
  function family(c) {
    if (!c || c.a <= 0.35) return null;
    var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    if (d * 255 < 40) return null;
    var s = d / (1 - Math.abs(2 * l - 1));
    if (s < 0.38 || l < 0.2 || l > 0.88) return null;
    var h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    return h < 12 || h >= 345 ? 'r' : h < 35 ? 'o' : h < 66 ? 'y' : h < 165 ? 'g' : h < 195 ? 't' : h < 255 ? 'b' : h < 290 ? 'v' : 'p';
  }
  function kindOf(el) { return family(rgba(getComputedStyle(el).color)); }
  function isGreen(el) { return kindOf(el) === 'g'; }
  function isPill(el) {
    var cs = getComputedStyle(el), bg = rgba(cs.backgroundColor);
    if (!bg || bg.a <= 0.03) return false;
    if (/^inline/.test(cs.display)) return true;
    return el.getBoundingClientRect().width < 280 && parseFloat(cs.borderTopLeftRadius) >= 8;   // a small rounded chip
  }
  function ink() {
    if (inkRGB) return inkRGB;
    var p = document.createElement('i'); p.style.cssText = 'position:absolute;visibility:hidden;color:var(--ax-ink, #fff)';
    document.body.appendChild(p); inkRGB = rgba(getComputedStyle(p).color); p.remove();
    return inkRGB;
  }
  /* the stroke colour lives in a generated stylesheet, not in style="" — rewriting style="" would break
     page rules that match on it (e.g. the day theme's .btn[style*="#7c3aed"] → gold) */
  var mkSheet = null, mkSeen = {};
  function setMk(el, v) {
    if (!mkSeen[v]) {
      mkSeen[v] = 1;
      if (!mkSheet) { mkSheet = document.createElement('style'); mkSheet.id = 'ax-mk-colors'; document.head.appendChild(mkSheet); }
      mkSheet.appendChild(document.createTextNode('[data-mk="' + v + '"]{--mk:' + v + '}\n'));
    }
    el.setAttribute('data-mk', v);
  }
  function near(a, b) { return a && b && Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 36; }
  function strip(el) {
    el.classList.remove('ax-hl', 'ax-hl-draw', 'ax-hl-host', 'ax-mkb', 'ax-mkb-t');
    FAM.forEach(function (k) { el.classList.remove('hlk-' + k); });
    el.removeAttribute('data-mk');
  }

  /* ════════ text & pills ════════ */
  function judge(el) {
    var txt = el.textContent;
    if (el.getAttribute('data-hlt') === txt) return;
    el.setAttribute('data-hlt', txt);
    var inner = null;
    for (var i = 0; i < el.children.length; i++) if (el.children[i].classList.contains('ax-hl-in')) inner = el.children[i];
    var tgtOld = inner || el, was = tgtOld.classList.contains('ax-hl');
    strip(tgtOld); el.classList.remove('ax-hl-host');
    var only = Array.prototype.every.call(el.childNodes, function (c) {
      return c.nodeType === 3 || c === inner || (c.nodeType === 1 && !c.textContent.trim());
    });
    if (!only) return;
    var forced = el.matches(FORCE_G);
    var k = forced ? 'g' : kindOf(el);
    if (!k || !(isNumberText(txt) || isShortText(txt))) return;
    if (forced) { if (el.__hlDrawn) was = true; el.__hlDrawn = true; }      // the count-up rewrites it often — draw once, then every 15 s
    var tgt = inner;
    if (!tgt) {
      if (getComputedStyle(el).display === 'inline') tgt = el;
      else {
        tgt = document.createElement('ax-m'); tgt.className = 'ax-hl-in';            // own tag: page rules for «.card span» don't touch it
        while (el.firstChild) tgt.appendChild(el.firstChild);
        el.appendChild(tgt); el.setAttribute('data-hlt', el.textContent);
      }
    }
    if (tgt !== el && isPill(el)) el.classList.add('ax-hl-host');
    tgt.classList.add('ax-hl', 'hlk-' + k);
    if (!was) {
      tgt.classList.add('ax-hl-draw');
      setTimeout(function () { tgt.classList.remove('ax-hl-draw'); }, 900);
    }
  }

  /* ════════ buttons ════════ */
  function judgeBtn(b) {
    var key = clean(b.textContent) + '|' + String(b.className || '').replace(OURS, '').replace(/\s+/g, ' ').trim() + '|' + (b.disabled ? 1 : 0) + (b.getAttribute('aria-selected') || '');
    if (b.getAttribute('data-mkt') === key) return;
    b.setAttribute('data-mkt', key);
    strip(b);
    var t = clean(b.textContent);
    if (!t || t.length > 36 || !WORDISH.test(t)) return;
    var cs = getComputedStyle(b), bg = rgba(cs.backgroundColor);
    var gi = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage.match(/rgba?\([^)]+\)/) : null;
    if (gi) { var g0 = rgba(gi[0]); if (g0 && g0.a >= 0.6) bg = g0; }               // a gradient button: its own first colour
    if (bg && bg.a >= 0.6) {
      var fb = family(bg);
      if (fb || near(bg, ink())) {                                     // a filled button → the button itself becomes the stroke
        setMk(b, Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b));
        b.classList.add('ax-mkb');
        return;
      }
    }
    var fk = family(rgba(cs.color));                                    // see-through / tinted button with coloured words
    if (fk && b.getAttribute('role') === 'tab' && b.getAttribute('aria-selected') !== 'true') return;   // an unselected tab stays an outline
    if (fk) b.classList.add('ax-mkb', 'ax-mkb-t', 'hlk-' + fk);
  }

  /* ════════ scan ════════ */
  /* list / btns: arrays in document order + Sets for «seen already» (Phase 5: was indexOf → O(n²)) */
  function addText(n, list, seen) {
    if (!WORDISH.test(n.nodeValue)) return;
    var el = n.parentElement; if (!el) return;
    if (el.classList.contains('ax-hl-in')) el = el.parentElement;
    if (!el || seen.has(el) || el.matches(BTN) || el.closest(SKIP)) return;
    seen.add(el); list.push(el);
  }
  function addBtn(b, btns, seenB) {
    if (!seenB.has(b) && !b.closest(BTN_SKIP) && !b.matches('.btn-icon, .voice-mic-btn')) { seenB.add(b); btns.push(b); }
  }
  function scanRoot(root, c) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return WORDISH.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    var n;
    while ((n = w.nextNode())) addText(n, c.list, c.seen);
    Array.prototype.forEach.call(root.querySelectorAll(BTN), function (b) { addBtn(b, c.btns, c.seenB); });
  }
  function judgeAll(c) {
    c.btns.forEach(judgeBtn);                                          // buttons first: text inside a stroked button is left alone
    c.list.forEach(function (el) {
      if (el.getAttribute('data-hlt') === el.textContent) return;      // unchanged since last time (judge() would stop here too)
      if (!el.closest('.ax-mkb')) judge(el);
    });
  }
  function fresh() { return { list: [], btns: [], seen: new Set(), seenB: new Set() }; }
  /* the whole screen: at start, on a theme switch, or when called from outside (AXMarker.scan) */
  function scan() {
    timer = 0; pend = []; full = false;
    try {
      var c = fresh();
      Array.prototype.forEach.call(document.querySelectorAll(ROOTS), function (r) { scanRoot(r, c); });
      judgeAll(c);
    } catch (e) { console.warn('[marker]', e); }
  }
  /* Phase 5 · only what changed since the last pass (the observer's records), not the whole screen again:
     a list that grows by 150 rows costs 150 rows, not the whole page */
  var pend = [], full = true;
  function inRoots(el) { return !!(el && el.closest && el.closest(ROOTS)); }
  function scanChanged() {
    if (full) return scan();
    timer = 0;
    var work = pend; pend = [];
    try {
      var c = fresh();
      work.forEach(function (x) {
        var n = x.n;
        if (!n || !n.isConnected) return;
        if (x.k === 'btn') {                                           // a button's own state changed → it, then the words inside it
          if (!inRoots(n)) return;
          addBtn(n, c.btns, c.seenB); scanRoot(n, c); return;
        }
        if (n.nodeType === 3) {                                         // a text node added / edited
          var p = n.parentElement; if (!p || !inRoots(p)) return;
          addText(n, c.list, c.seen);
          var b = p.closest(BTN); if (b) addBtn(b, c.btns, c.seenB);   // words of a button changed
          return;
        }
        if (n.nodeType !== 1) return;
        if (inRoots(n)) {
          scanRoot(n, c);
          var ob = n.parentElement && n.parentElement.closest(BTN); if (ob) addBtn(ob, c.btns, c.seenB);
          if (n.matches(BTN)) addBtn(n, c.btns, c.seenB);
        } else Array.prototype.forEach.call(n.querySelectorAll(ROOTS), function (r) { scanRoot(r, c); });   // e.g. a new modal holding a root
      });
      judgeAll(c);
    } catch (e) { console.warn('[marker]', e); }
  }
  function later() { if (!timer) timer = setTimeout(scanChanged, 140); }
  function want(n, k) { pend.push({ n: n, k: k }); if (pend.length > 4000) full = true; later(); }   // a flood of changes → one full pass
  function redraw() {
    if (document.hidden) return;
    Array.prototype.forEach.call(document.querySelectorAll(FORCE_G + ' .ax-hl, ' + FORCE_G + '.ax-hl'), function (h) {
      h.classList.remove('ax-hl-draw'); void h.offsetWidth; h.classList.add('ax-hl-draw');
      setTimeout(function () { h.classList.remove('ax-hl-draw'); }, 900);
    });
  }
  setInterval(redraw, REDRAW_MS);
  function boot() {
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i], t = m.target;
        if (m.type === 'characterData') { want(t, 'node'); continue; }
        if (m.type === 'childList') {
          for (var a = 0; a < m.addedNodes.length; a++) want(m.addedNodes[a], 'node');
          if (m.removedNodes.length && !m.addedNodes.length) want(t, 'node');   // words removed: look at what is left
          continue;
        }
        /* a class flip on a tab / toggle (not one of ours) */
        if (m.attributeName === 'aria-selected' && t.matches && t.matches(BTN)) { want(t, 'btn'); continue; }
        if (t.matches && t.matches(BTN) && String(t.className).replace(OURS, '').replace(/\s+/g, ' ').trim() !== String(m.oldValue || '').replace(OURS, '').replace(/\s+/g, ' ').trim()) { want(t, 'btn'); continue; }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled', 'aria-selected'], attributeOldValue: true });
    later();
    var themeKey = '';
    function tk() { var h = document.documentElement; return (h.classList.contains('aurum') ? 'a' : '-') + (h.getAttribute('data-theme') || ''); }
    themeKey = tk();
    new MutationObserver(function () {
      var k = tk(); if (k === themeKey) return; themeKey = k;               // only a real theme switch (html also flips other classes)
      inkRGB = null;
      Array.prototype.forEach.call(document.querySelectorAll('[data-hlt],[data-mkt]'), function (e) { e.removeAttribute('data-hlt'); e.removeAttribute('data-mkt'); });
      full = true; later();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.AXMarker = { scan: scan, redraw: redraw, kindOf: kindOf, family: family, isGreen: isGreen, isNumberText: isNumberText, isShortText: isShortText };
})();

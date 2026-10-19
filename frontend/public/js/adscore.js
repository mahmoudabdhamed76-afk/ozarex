/* ════════════════════════════════════════════════════════════════════
   Smart Ads — engine + renderer (OzareX 4.41)
   Brand-neutral and app-neutral: the host app only tells it where the API
   is, who is signed in and which page is open:

     SmartAds.init({ api: '', brand: 'OZAREX', user: () => me, page: () => key, blocked: () => bool, bottomOffset: () => px })

   · asks the server for the ads meant for this user (/api/ads/feed)
   · decides «once / every visit / daily / every N days» per user
   · one popup at a time (highest priority first), one banner, one card
   · records view / click / close; WhatsApp opens wa.me with a ready
     message the user still reviews and sends himself
   · everything is drawn with textContent — no HTML from an ad ever runs
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var O = { api: '', brand: '', user: function () { return null; }, page: function () { return ''; }, blocked: function () { return false; }, bottomOffset: function () { return 0; }, go: function () {} };
  var feed = [], defaultWa = '', shown = {}, live = { popup: null, banner: null, card: null }, timer = 0, loading = false, lastPage = null, lastLoad = 0;

  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  function hex(v, d) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : d; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null && text !== '') e.textContent = text; return e; }
  function svg(path) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.4'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true'); var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); s.appendChild(p); return s; }
  var WA_PATH = 'M3 21l1.65-4.8A8.5 8.5 0 1 1 8 19.6L3 21z M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2L9 9.5z';
  function waNum(v) { var d = String(v || '').replace(/[^\d]/g, ''); if (/^0\d{10}$/.test(d)) d = '2' + d; if (d.indexOf('00') === 0) d = d.slice(2); return d.length >= 8 && d.length <= 15 ? d : ''; }
  function waLink(ad) { var n = waNum((ad.cta && ad.cta.wa) || defaultWa); if (!n) return ''; var m = (ad.cta && ad.cta.msg) || ''; return 'https://wa.me/' + n + (m ? '?text=' + encodeURIComponent(m) : ''); }
  function safeUrl(u) { try { var x = new URL(String(u || '')); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch (e) { return ''; } }
  /* *word* in a title / text → a highlighted word (built as nodes, never as HTML) */
  function rich(node, str) {
    String(str || '').split(/(\*[^*\n]{1,40}\*)/).forEach(function (part) {
      if (/^\*[^*]+\*$/.test(part)) node.appendChild(el('strong', 'sad-em', part.slice(1, -1)));
      else if (part) node.appendChild(document.createTextNode(part));
    });
    return node;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ════════ talking to the server ════════ */
  function post(path, body) { try { return fetch(O.api + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(function () {}); } catch (e) {} }
  /* every showing gets its own id: the server counts one view / click / close per showing, and only after a real view */
  function impId() { try { if (window.crypto && crypto.getRandomValues) { var b = new Uint8Array(12); crypto.getRandomValues(b); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); } } catch (e) {} return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 24); }
  function track(ad, type, pv) { if (pv || !ad || !ad.id) return; if (type === 'view') ad._imp = impId(); post('/api/ads/event', ad._imp ? { id: ad.id, type: type, imp: ad._imp } : { id: ad.id, type: type }); }
  function load(force) {
    if (loading || !O.user()) return;
    if (!force && Date.now() - lastLoad < 20000) { decide(); return; }
    loading = true;
    fetch(O.api + '/api/ads/feed', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && Array.isArray(j.ads)) { feed = j.ads; defaultWa = j.defaultWa || ''; lastLoad = Date.now(); retire(); } })
      .catch(function () {})
      .then(function () { loading = false; decide(); });
  }
  /* an ad that was stopped / edited away while on screen leaves */
  function retire() {
    ['popup', 'banner', 'card'].forEach(function (slot) {
      var x = live[slot]; if (!x || x.pv) return;
      if (!feed.some(function (a) { return a.id === x.ad.id; }) || !inWindow(x.ad)) close(slot, false);
    });
  }

  /* ════════ who shows what, now ════════ */
  function onPage(ad, page) { var p = ad.pages; return !p || p === 'all' || (Array.isArray(p) && p.indexOf(page) >= 0); }
  /* «now» rules: weekdays + hours of the day (overnight windows allowed) */
  function inWindow(ad) {
    var d = new Date(), day = today();
    if (ad.startAt && day < ad.startAt) return false;
    if (ad.endAt && day > ad.endAt) return false;
    if (Array.isArray(ad.weekdays) && ad.weekdays.length && ad.weekdays.indexOf(d.getDay()) < 0) return false;
    var t = d.getHours() * 60 + d.getMinutes(), m = function (s) { var p = String(s || '').split(':'); return p.length === 2 ? (+p[0]) * 60 + (+p[1]) : null; };
    var a = m(ad.timeFrom), b = m(ad.timeTo);
    if (a != null && b != null) return a <= b ? (t >= a && t < b) : (t >= a || t < b);
    if (a != null) return t >= a;
    if (b != null) return t < b;
    return true;
  }
  function todayViews(ad) {
    var start = new Date(); start.setHours(0, 0, 0, 0);
    return ((ad.seen && ad.seen.recent) || []).filter(function (t) { return t >= start.getTime(); }).length;
  }
  function due(ad) {
    if (!inWindow(ad)) return false;
    var seen = ad.seen || {}, last = +seen.last || 0;
    if (ad.frequency === 'daily') {                        // N times a day, with a gap between them
      if (todayViews(ad) >= (ad.perDay || 1)) return false;
      if (last && Date.now() - last < (ad.gapMin || 0) * 60000) return false;
      if (ss('sad_x_' + ad.id) && (ad.perDay || 1) <= 1) return false;
      return true;
    }
    if (ss('sad_x_' + ad.id)) return false;                 // closed in this visit
    if (ss('sad_s_' + ad.id) && ad.format === 'popup') return false;   // a popup once per visit at most
    if (ad.frequency === 'once') return !(seen.views > 0) || !!ss('sad_s_' + ad.id);
    if (ad.frequency === 'days') return !last || Date.now() - last >= (ad.everyDays || 1) * 864e5 || !!ss('sad_s_' + ad.id);
    return true;                                           // every visit
  }
  function decide() {
    if (!O.user() || O.blocked()) return;
    var page = O.page();
    ['banner', 'card'].forEach(function (slot) { var x = live[slot]; if (x && !x.pv && !onPage(x.ad, page)) close(slot, false); });
    var slots = { popup: 'popup', banner: 'banner', card: 'card' };
    Object.keys(slots).forEach(function (slot) {
      if (live[slot]) return;
      var list = feed.filter(function (a) { return a.format === slot && onPage(a, page) && due(a); })
        .sort(function (a, b) { return (a.priority || 5) - (b.priority || 5); });
      if (!list.length) return;
      if (slot === 'popup' && live.popup) return;
      var ad = list[0];
      if (shown[ad.id + slot]) return;
      shown[ad.id + slot] = true;
      setTimeout(function () { if (!O.blocked() && !live[slot] && O.user()) show(ad, {}); else shown[ad.id + slot] = false; }, slot === 'popup' ? (ad.delaySec || 0) * 1000 : 600);
    });
  }

  /* ════════ drawing ════════ */
  function build(ad, opts) {
    opts = opts || {};
    var pv = !!opts.preview, f = ad.format || 'popup', t = ad.theme || {};
    var root = el('div', 'sad ax-hl-off a-' + (ad.anim || 'bounce') + (ad.kind === 'guide' ? ' sad-guide' : '') + ' ' + (f === 'popup' ? 'sad-ov' : f === 'banner' ? 'sad-ban ' + (ad.position === 'bottom' ? 'bottom' : 'top') : 'sad-flt ' + (ad.position || 'bottom-end')) + (t.glass === false ? '' : ' glass') + (pv ? ' pv' : ''));
    root.style.setProperty('--sad-bg', hex(t.bg, '#16090C'));
    root.style.setProperty('--sad-accent', hex(t.accent, '#25D366'));
    root.style.setProperty('--sad-text', hex(t.text, '#FFFFFF'));
    if (!pv && f !== 'popup') root.style.setProperty('--sad-bottom', (O.bottomOffset() || 0) + 'px');
    root.setAttribute('role', f === 'popup' ? 'dialog' : 'complementary');
    if (f === 'popup') root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', ad.title || 'إعلان');
    var box = el('div', f === 'popup' ? 'sad-pop' : '');
    var card = el('div', 'sad-card');
    var x = el('button', 'sad-x'); x.type = 'button'; x.setAttribute('aria-label', 'اقفل'); x.appendChild(svg('M18 6 6 18M6 6l12 12'));
    var ic = el('div', 'sad-ic', ad.icon || '📢');
    var title = rich(el('h3', 'sad-t'), ad.title || '');
    var text = rich(el('p', 'sad-p'), ad.text || '');
    var guide = ad.kind === 'guide', G = ad.guide || {};
    /* a big number tile (e.g. «2 · شهر متبقي») in place of the icon */
    if (ad.badge && ad.badge.value) {
      ic = el('div', 'sad-ic sad-badge');
      ic.appendChild(el('i', 'sad-rings')); ic.appendChild(el('b', '', ad.badge.value)); if (ad.badge.label) ic.appendChild(el('small', '', ad.badge.label));
    }
    var desc = ad.desc ? el('p', 'sad-desc', ad.desc) : null;
    var wa = waLink(ad), url = safeUrl(ad.cta2 && ad.cta2.url);
    var btns = el('div', 'sad-btns');
    var list = null;
    if (guide) {
      if (G.items && G.items.length) { list = el('ul', 'sad-list'); G.items.forEach(function (it, i) { var li = el('li'); li.style.setProperty('--i', i); li.appendChild(el('i', '', '✓')); li.appendChild(rich(el('span'), it)); list.appendChild(li); }); }
      if (G.actionLabel && G.actionPage) {
        var ga = el('button', 'sad-b pri', G.actionLabel); ga.type = 'button';
        ga.addEventListener('click', function () { track(ad, 'click', pv); if (pv && opts.noLinks) return; closeEl(ga); try { O.go(G.actionPage); } catch (e) {} });
        btns.appendChild(ga);
      }
      var gk = el('button', 'sad-b ' + (G.actionLabel && G.actionPage ? 'sec' : 'pri'), G.okLabel || 'تمام، فهمت'); gk.type = 'button';
      gk.addEventListener('click', function () { track(ad, 'cta2', pv); closeEl(gk); });
      btns.appendChild(gk);
    }
    if (!guide && wa && ad.cta && ad.cta.label !== undefined) {
      var b1 = el('a', 'sad-b pri'); b1.href = wa; b1.target = '_blank'; b1.rel = 'noopener noreferrer';
      b1.appendChild(svg(WA_PATH)); b1.appendChild(el('span', 'lbl', (ad.cta && ad.cta.label) || 'تواصل معنا عبر واتساب'));
      b1.addEventListener('click', function (e) { if (pv && opts.noLinks) { e.preventDefault(); return; } track(ad, 'click', pv); });
      btns.appendChild(b1);
    }
    /* second button: a link if one is set, else the extra description, else a WhatsApp «tell me more» */
    var more = !url && !desc && wa ? 'https://wa.me/' + waNum((ad.cta && ad.cta.wa) || defaultWa) + '?text=' + encodeURIComponent('السلام عليكم، عايز أعرف تفاصيل أكتر عن «' + (ad.title || '') + '»') : '';
    if (!guide && ad.cta2 && ad.cta2.label && (url || desc || more)) {
      var href = url || more;
      var b2 = el(href ? 'a' : 'button', 'sad-b sec', ad.cta2.label);
      if (href) { b2.href = href; b2.target = '_blank'; b2.rel = 'noopener noreferrer'; } else b2.type = 'button';
      b2.addEventListener('click', function (e) {
        if (!href) { e.preventDefault(); desc.classList.toggle('on'); }
        else if (pv && opts.noLinks) e.preventDefault();
        track(ad, 'cta2', pv);
      });
      btns.appendChild(b2);
    }
    if (f === 'banner') {
      var mid = el('div', 'sad-mid'); mid.appendChild(title); if (ad.text) mid.appendChild(text);
      card.appendChild(ic); card.appendChild(mid); Array.prototype.slice.call(btns.children).forEach(function (b) { card.appendChild(b); }); card.appendChild(x);
    } else {
      var hd = el('div', 'sad-hd'), hx = el('div');
      if (O.brand || guide) { var tag = el('span', 'sad-tag'); tag.appendChild(el('i')); tag.appendChild(document.createTextNode(guide ? ('تحديث جديد' + (G.version ? ' · ' + G.version : '')) : O.brand)); hx.appendChild(tag); }
      hx.appendChild(title); hd.appendChild(ic); hd.appendChild(hx);
      card.appendChild(x); card.appendChild(hd);
      if (ad.text) card.appendChild(text);
      if (list) card.appendChild(list);
      if (desc) card.appendChild(desc);
      if (btns.children.length) card.appendChild(btns);
      card.appendChild(el('i', 'sad-shine'));
    }
    box.appendChild(card); root.appendChild(f === 'popup' ? box : card);
    return { root: root, x: x };
  }

  function closeEl(node) { ['popup', 'banner', 'card'].forEach(function (s) { var x = live[s]; if (x && x.el.contains(node)) close(s, false); }); }
  function slotOf(ad) { return ad.format === 'banner' ? 'banner' : ad.format === 'card' ? 'card' : 'popup'; }
  function show(ad, opts) {
    opts = opts || {};
    var slot = slotOf(ad), pv = !!opts.preview;
    if (live[slot]) close(slot, false);
    var b = build(ad, { preview: false, noLinks: false });
    var rec = { ad: ad, el: b.root, pv: pv };
    live[slot] = rec;
    document.body.appendChild(b.root);
    void b.root.offsetWidth; b.root.classList.add('in');
    b.x.addEventListener('click', function () { close(slot, true); });
    if (slot === 'popup') {
      b.root.addEventListener('click', function (e) { if (e.target === b.root) close(slot, true); });
      rec.key = function (e) { if (e.key === 'Escape') close(slot, true); };
      document.addEventListener('keydown', rec.key);
      setTimeout(function () { try { b.x.focus({ preventScroll: true }); } catch (e) {} }, 60);
    }
    if (!pv) { ss('sad_s_' + ad.id, '1'); track(ad, 'view', false); var sn = ad.seen || {}; ad.seen = { views: (sn.views || 0) + 1, last: Date.now(), recent: [Date.now()].concat(sn.recent || []) }; }
    if (ad.durationSec > 0) rec.timer = setTimeout(function () { if (live[slot] === rec) close(slot, 'auto'); }, ad.durationSec * 1000);
    return rec;
  }
  function close(slot, byUser) {
    var x = live[slot]; if (!x) return;
    live[slot] = null;
    if (x.timer) clearTimeout(x.timer);
    if (x.key) document.removeEventListener('keydown', x.key);
    var auto = byUser === 'auto'; if (auto) byUser = false;      // its time on screen ran out = done for this visit
    if (byUser && !x.pv) track(x.ad, 'close', false);
    if ((byUser || auto) && !x.pv) ss('sad_x_' + x.ad.id, '1');
    if ((!byUser && !auto) || x.ad.frequency === 'daily') shown[x.ad.id + slot] = false;   // may come back (page change, edit, next time of the day)
    x.el.classList.add('out'); x.el.classList.remove('in');
    setTimeout(function () { if (x.el.parentNode) x.el.parentNode.removeChild(x.el); }, 380);
  }

  /* ════════ wiring ════════ */
  function tick() {
    var p = O.page();
    if (p !== lastPage) lastPage = p;
    retire();
    if (feed.length && (!live.popup || !live.banner || !live.card)) decide();   // something may be waiting for a modal to close
    if (live.banner || live.card) { var off = (O.bottomOffset() || 0) + 'px'; ['banner', 'card'].forEach(function (s) { if (live[s] && !live[s].pv) live[s].el.style.setProperty('--sad-bottom', off); }); }
  }
  function init(opts) {
    Object.keys(opts || {}).forEach(function (k) { O[k] = opts[k]; });
    clearInterval(timer); timer = setInterval(tick, 1200);
    setInterval(function () { load(true); }, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(false); });
    window.addEventListener('ax:ads-changed', function () { load(true); });
    load(true);
  }

  window.SmartAds = {
    init: init, refresh: function () { load(true); },
    /* a live look in the real app — nothing is counted */
    preview: function (ad, def) { var keep = defaultWa; if (def !== undefined) defaultWa = def; var r = show(Object.assign({}, ad, { id: ad.id || 'preview' }), { preview: true }); defaultWa = keep; return r; },
    /* a static copy for the admin's phone / desktop frames */
    render: function (ad, def) { var keep = defaultWa; if (def !== undefined) defaultWa = def; var b = build(ad, { preview: true, noLinks: true }); defaultWa = keep; b.root.classList.add('in'); return b.root; },
    waLink: function (ad, def) { var keep = defaultWa; if (def !== undefined) defaultWa = def; var l = waLink(ad); defaultWa = keep; return l; },
    close: function () { ['popup', 'banner', 'card'].forEach(function (s) { close(s, false); }); }
  };
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · «المخزن ثري دي» (5.09) — a live 3D hangar at the top of «المخازن»
   ─────────────────────────────────────────────────────────────────────
   Three ways to look at it:
     1 · the whole hangar — every item has a bay on a rack in its zone (ورق وأفلام · أحبار · قطع غيار ·
         أصناف تانية) and the cartons on it follow the real quantity (sheets ÷ 1000, reams ÷ 5 …)
     2 · a zone — tap its chip (or its sign): the camera glides to that line of racks and the cartons turn
         into the REAL items, one by one, at the REAL count, with a light rise: ink bottles side by side, film
         / paper boxes, reams (sheets ÷ 500), print heads, rollers, boards, rolls, cartons
     3 · one bay — tap a bay: the camera comes right up to it (‹ › go to the next bay), with its card:
         quantity, what one item is, last move, «وارد» «منصرف» «مستهلكات» «تعديل»
   LIVE: any change to the stock — a supply to a center, a purchase, «حركة مخزن», «مستهلكات», a return, a stock
   count, a branch transfer, a new / edited / deleted item, or a change another user made on their own device —
   plays: the forklift goes to the bay, picks the cartons up and drives out through the loading door (or brings
   them in from the truck and shelves them), «−8 علبة» floats over the bay and the ribbon says why; when you are
   looking at a zone or a bay, the real items appear / go at once.
   The hangar: insulated panel walls, high window band, steel roof trusses with skylights, polished concrete with
   joints, aisle lines and a hatched dock, wire-mesh decks, wooden pallets, bollards, fire extinguishers, a dock
   door with a truck, a forklift with its driver, a worker, image-based lighting (a small room is baked into an
   environment map at start, no image files) and soft shadows.
   Fast: three.js loads only when «المخازن» opens (vendor, kept offline), it draws only while on screen, stops on
   other pages / hidden tabs, idles at 30 fps, static parts are instanced, real items are built only for the zone
   you look at, weak phones get lighter quality, «less motion» skips the driving, no WebGL → the page as before.
   Hook: renderInventory() calls AXHangar.attach(root).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var THREE_URL = new URL('vendor/three.module.min.js', document.baseURI).href;   // import() resolves against this script (js/), so anchor it to the page
  var OFF_KEY = 'ax_hangar_off', TALL_KEY = 'ax_hangar_tall';
  var S = { host: null, eng: null, booting: null, failed: false };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtN(n) { return Number(Math.round(N(n) * 100) / 100).toLocaleString('en-US'); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ════════════ what an item is ════════════ */
  var ZONES = [
    { key: 'paper', title: 'ورق وأفلام', color: '#E8C27A' },
    { key: 'ink', title: 'أحبار', color: '#7FC8F8' },
    { key: 'parts', title: 'قطع غيار', color: '#B8C2CC' },
    { key: 'other', title: 'أصناف تانية', color: '#C9A0DC' }
  ];
  function zoneOf(p) {
    var ty = String(p.type || '').toLowerCase();                              // the type the user typed wins over the name
    if (/قطع|غيار|spare|part/.test(ty)) return 'parts';
    if (/حبر|احبار|أحبار|ink|toner|تونر/.test(ty)) return 'ink';
    if (/ورق|فيلم|film|paper/.test(ty)) return 'paper';
    var t = String((p.type || '') + ' ' + (p.name || '')).toLowerCase(), u = String(p.unit || '');
    if (/حبر|احبار|أحبار|ink|toner|تونر|cyan|magenta|سيان|ماجنتا/.test(t) || u === 'خرطوشة') return 'ink';
    if (/ورق|فيلم|film|paper|photo|فوتو|green ?tec|a4|a3|kodak|fuji|agfa|konica/.test(t) || /^(ورقة|فرخ|ريم|فيلم)$/.test(u)) return 'paper';
    if (/قطع|غيار|رأس|راس|بكرة|بكره|بورد|head|roller|board|spare|part|ماكينة|طابعة|printer/.test(t) || u === 'قطعة' || u === 'طقم') return 'parts';
    return 'other';
  }
  var PER = { 'ورقة': 1000, 'فرخ': 1000, 'ريم': 5, 'كيلو': 10, 'متر': 10 };
  function cartonsOf(p) { var q = Math.max(0, N(p.quantity)), per = PER[String(p.unit || '')] || 1; return q <= 0 ? 0 : Math.ceil(q / per - 1e-9); }
  function perCarton(p) { return PER[String(p.unit || '')] || 1; }
  /* the real thing on the shelf: what it looks like, how many of them, what one is called */
  function kindOf(p) {
    var u = String(p.unit || ''), n = String((p.name || '') + ' ' + (p.type || '')).toLowerCase(), z = zoneOf(p);
    if (u === 'ورقة' || u === 'فرخ' || u === 'ريم') return 'ream';
    if (u === 'لفة' || u === 'رول') return 'roll';
    if (u === 'كرتونة' || u === 'كيلو' || u === 'متر') return 'carton';
    if (u === 'فيلم' || (/film|فيلم/.test(n) && u !== 'قطعة')) return 'film';
    if (z === 'ink' && (u === 'خرطوشة' || u === 'زجاجة' || u === 'عبوة' || u === '' || /bottle|زجاج|حبر|ink/.test(n))) return 'bottle';
    if (z === 'parts' || u === 'قطعة' || u === 'طقم') {
      if (/رأس|راس|head|nozzle/.test(n)) return 'head';
      if (/بكر|roller|رول/.test(n)) return 'roller';
      if (/بورد|board|لوحة|كارت|pcb/.test(n)) return 'board';
      return 'part';
    }
    return 'box';
  }
  var KIND_WORD = { bottle: 'زجاجة', ream: 'ريم', box: 'علبة', film: 'علبة فيلم', roll: 'لفة', head: 'رأس', roller: 'بكرة', board: 'بورد', part: 'قطعة', carton: 'كرتونة' };
  function unitsOf(p, kind) {
    var q = Math.max(0, N(p.quantity)), u = String(p.unit || '');
    if (kind === 'ream') return u === 'ريم' ? Math.ceil(q - 1e-9) : Math.ceil(q / 500 - 1e-9);
    if (kind === 'carton') return cartonsOf(p);
    if (kind === 'bottle' && /^(مل|ملي|ml)$/i.test(u)) return Math.ceil(q / 1000 - 1e-9);   // a litre bottle each
    return Math.ceil(q - 1e-9);
  }
  function tintOf(p) {
    var n = String((p.name || '') + ' ' + (p.type || '')).toLowerCase();
    if (/light ?cyan|لايت سيان/.test(n)) return 0x6EC6F0;
    if (/light ?magenta|لايت ماجنتا/.test(n)) return 0xF08FC0;
    if (/blue|أزرق|ازرق|cyan|سيان/.test(n)) return 0x1E88E5;
    if (/red|أحمر|احمر|magenta|ماجنتا/.test(n)) return 0xD81B60;
    if (/yellow|أصفر|اصفر/.test(n)) return 0xF6C12B;
    if (/green|أخضر|اخضر/.test(n) && !/green ?tec/.test(n)) return 0x27AE60;
    if (/black|أسود|اسود/.test(n)) return 0x262626;
    if (/vivid|photo|فوتو|glossy|لامع/.test(n)) return 0x8E44AD;
    if (/film|فيلم/.test(n)) return 0x16A085;
    var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return [0xC0392B, 0xD35400, 0x2980B9, 0x8E44AD, 0x16A085, 0xB7950B][h % 6];
  }
  function stateOf(p) { var q = N(p.quantity), m = N(p.minQuantity); return q <= 0 ? 'out' : (m > 0 && q <= m) ? 'low' : 'ok'; }

  /* ── why did the quantity change? (the newest move / supply of that item) ── */
  function reasonFor(pid, delta) {
    var now = Date.now(), mv = null, iss = null;
    A('stockMoves').forEach(function (m) { if (m && m.productId === pid && now - N(m.createdAt) < 180000 && (!mv || N(m.createdAt) > N(mv.createdAt))) mv = m; });
    A('issuances').forEach(function (i) { if (i && i.productId === pid && now - N(i.createdAt) < 180000 && (!iss || N(i.createdAt) > N(iss.createdAt))) iss = i; });
    var ref = mv ? String((mv.reference || '') + ' ' + (mv.note || '')) : '';
    if (mv && mv.kind === 'consumable') return { ic: '🧪', t: 'مستهلكات' + (mv.reason ? ' — ' + mv.reason : '') };
    if (mv && mv.kind === 'adjust') return { ic: '⚖️', t: 'تسوية جرد' };
    if (mv && (/^sm_rt_/.test(String(mv.id)) || /مرتجع/.test(ref))) return { ic: '↩️', t: 'مرتجع' };
    if (mv && /تحويل|transfer/i.test(ref + ' ' + (mv.kind || ''))) return { ic: '🔁', t: delta > 0 ? 'تحويل جاي من فرع تاني' : 'تحويل لفرع تاني' };
    if (delta < 0 && iss && (!mv || N(iss.createdAt) >= N(mv.createdAt) - 5000)) return { ic: '📦', t: 'صرف' + (iss.number ? ' #' + iss.number : '') + (iss.customerName ? ' لـ' + iss.customerName : '') };
    if (mv && /فاتورة/.test(ref) && delta < 0) return { ic: '🧾', t: ref.trim().split(' ').slice(0, 2).join(' ') };
    if (mv && /جرد/.test(ref)) return { ic: '⚖️', t: 'جرد' };
    if (mv && /شراء|مشتريات|مورد|purchase/i.test(ref + ' ' + (mv.kind || ''))) return { ic: '🚚', t: 'وارد من مورد' };
    if (mv && /افتتاحي/.test(ref)) return { ic: '✨', t: 'رصيد افتتاحي' };
    return delta > 0 ? { ic: '🚚', t: 'وارد' } : { ic: '📤', t: 'منصرف' };
  }

  /* ════════════ the page hook ════════════ */
  function attach(root) {
    if (!root || S.failed) return;
    var anchor = root.querySelector('.page-header');
    if (!anchor) return;
    if (ls(OFF_KEY) === '1') {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'axh-show'; b.textContent = '🏭 اعرض المخزن ثري دي';
      b.onclick = function () { ls(OFF_KEY, null); b.remove(); attach(root); };
      anchor.insertAdjacentElement('afterend', b);
      return;
    }
    if (!window.WebGLRenderingContext) { S.failed = true; return; }
    if (!S.host) {
      S.host = document.createElement('section');
      S.host.className = 'axh ax-hl-off';
      S.host.setAttribute('aria-label', 'المخزن ثري دي');
      S.host.innerHTML = '<div class="axh-load"><i></i><span>بنجهّز المخزن…</span></div>';
    }
    S.host.classList.toggle('tall', ls(TALL_KEY) === '1');
    anchor.insertAdjacentElement('afterend', S.host);
    if (S.eng) { S.eng.resume(); return; }
    if (S.booting) return;
    S.booting = import(THREE_URL).then(function (T) {
      try { S.eng = engine(T, S.host); S.eng.resume(); }
      catch (e) { fail(e); }
    }).catch(fail);
  }
  function fail(e) {
    S.failed = true;
    try { console.warn('[hangar3d] off:', e && e.message); } catch (x) {}
    if (S.host) S.host.remove();
  }

  /* ════════════ the engine ════════════ */
  function engine(T, host) {
    var weak = (navigator.hardwareConcurrency || 4) <= 4 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    host.innerHTML = '<canvas class="axh-cv"></canvas><div class="axh-labels"></div><div class="axh-fx"></div>' +
      '<div class="axh-hud"><b>🏭 المخزن دلوقتي</b><span class="axh-k"></span></div>' +
      '<div class="axh-tools"><button type="button" data-a="zin" title="قرّب" aria-label="قرّب">＋</button><button type="button" data-a="zout" title="بعّد" aria-label="بعّد">－</button><button type="button" data-a="tall" title="كبّر / صغّر" aria-label="كبّر أو صغّر">⤢</button><button type="button" data-a="off" title="اخفي المخزن ثري دي" aria-label="اخفي المخزن ثري دي">✕</button></div>' +
      '<nav class="axh-zones" aria-label="أقسام المخزن"></nav>' +
      '<div class="axh-nav" hidden><button type="button" data-a="prev" aria-label="الرف اللي قبله">‹</button><button type="button" data-a="back" class="axh-back">↩ <span></span></button><button type="button" data-a="next" aria-label="الرف اللي بعده">›</button></div>' +
      '<div class="axh-ribbon" aria-live="polite"></div><div class="axh-card" hidden></div>' +
      '<div class="axh-tip">اسحب عشان تلف · دوس على قسم أو رف</div>';
    var cv = host.querySelector('.axh-cv'), labelsEl = host.querySelector('.axh-labels'), fxEl = host.querySelector('.axh-fx'),
      kEl = host.querySelector('.axh-k'), ribbon = host.querySelector('.axh-ribbon'), card = host.querySelector('.axh-card'),
      zonesEl = host.querySelector('.axh-zones'), navEl = host.querySelector('.axh-nav'), tipEl = host.querySelector('.axh-tip');

    var renderer = new T.WebGLRenderer({ canvas: cv, antialias: !weak, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, weak ? 1.25 : 1.75));
    renderer.shadowMap.enabled = !weak; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    var scene = new T.Scene();
    scene.background = new T.Color(0x15110F);
    scene.fog = new T.Fog(0x15110F, 110, 240);
    var cam = new T.PerspectiveCamera(38, 1, 0.3, 300);

    /* image-based light: a warm hangar room baked once into an environment map (no image file) */
    (function () {
      var pm = new T.PMREMGenerator(renderer), room = new T.Scene(), box = new T.BoxGeometry(1, 1, 1);
      var wallM = new T.MeshStandardMaterial({ color: 0x5A4A40, side: T.BackSide, roughness: 1 });
      var r = new T.Mesh(box, wallM); r.scale.set(30, 12, 30); r.position.y = 6; room.add(r);
      var lampM = new T.MeshBasicMaterial({ color: new T.Color(0xFFE2B0).multiplyScalar(9) });
      [[-8, 11.5, -6], [0, 11.5, -6], [8, 11.5, -6], [-8, 11.5, 6], [0, 11.5, 6], [8, 11.5, 6]].forEach(function (p) { var l = new T.Mesh(box, lampM); l.scale.set(4, 0.2, 1.2); l.position.set(p[0], p[1], p[2]); room.add(l); });
      var winM = new T.MeshBasicMaterial({ color: new T.Color(0xFFF4E2).multiplyScalar(3) });
      var w = new T.Mesh(box, winM); w.scale.set(28, 1.4, 0.2); w.position.set(0, 9.6, -14.8); room.add(w);
      scene.environment = pm.fromScene(room, 0.03).texture;
      scene.environmentIntensity = 0.85;
      pm.dispose();
    })();
    scene.add(new T.HemisphereLight(0xFFF4E6, 0x4A3E36, 0.8));
    var fill = new T.DirectionalLight(0xFFFFFF, 0.55); fill.position.set(20, 18, 60); scene.add(fill);
    var sun = new T.DirectionalLight(0xFFE0B4, 1.5); sun.castShadow = !weak;
    sun.shadow.mapSize.set(weak ? 512 : 1536, weak ? 512 : 1536); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; scene.add(sun); scene.add(sun.target);

    /* ── canvas textures (all drawn here — no image files) ── */
    function canvasTex(w, h, draw, rep, srgb) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); if (srgb !== false) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
    function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
    var TX = {
      floor: canvasTex(512, 512, function (g, w, h) {
        g.fillStyle = '#7A746E'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < 70; i++) { var r = 20 + Math.random() * 90, x = Math.random() * w, y = Math.random() * h, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + (Math.random() < .5 ? '255,255,255' : '40,30,24') + ',.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
        for (var j = 0; j < 4000; j++) { var v = 80 + Math.random() * 60 | 0; g.fillStyle = 'rgba(' + v + ',' + (v - 3) + ',' + (v - 7) + ',.12)'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
        g.strokeStyle = 'rgba(30,24,20,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);               // saw-cut joints
      }),
      panel: canvasTex(256, 512, function (g, w, h) {
        g.fillStyle = '#DCDFE2'; g.fillRect(0, 0, w, h);
        for (var x = 0; x < w; x += 32) { var gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, '#C3C7CB'); gr.addColorStop(0.12, '#F1F2F3'); gr.addColorStop(0.5, '#DCDFE2'); gr.addColorStop(0.92, '#C6CACE'); gr.addColorStop(1, '#AEB3B8'); g.fillStyle = gr; g.fillRect(x, 0, 32, h); }
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, h * 0.5 - 1, w, 2);
      }),
      plinth: canvasTex(256, 64, function (g, w, h) { g.fillStyle = '#8D8C88'; g.fillRect(0, 0, w, h); for (var i = 0; i < 500; i++) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }),
      upright: canvasTex(32, 256, function (g, w, h) { g.fillStyle = '#3A3F45'; g.fillRect(0, 0, w, h); g.fillStyle = '#16191C'; for (var y = 6; y < h; y += 16) { g.fillRect(9, y, 5, 9); g.fillRect(19, y, 5, 9); } }),
      mesh: canvasTex(128, 128, function (g, w, h) { g.clearRect(0, 0, w, h); g.strokeStyle = '#9AA0A6'; g.lineWidth = 3; for (var i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }),
      wood: canvasTex(128, 128, function (g, w, h) { g.fillStyle = '#A57B4F'; g.fillRect(0, 0, w, h); for (var s = 0; s < 5; s++) { g.fillStyle = s % 2 ? '#B48A5C' : '#9A7146'; g.fillRect(0, s * 26, w, 22); g.fillStyle = 'rgba(60,35,15,.5)'; g.fillRect(0, s * 26 + 22, w, 4); } for (var k = 0; k < 120; k++) { g.fillStyle = 'rgba(70,40,15,.12)'; g.fillRect(Math.random() * w, Math.random() * h, 12, 1); } }),
      hatch: canvasTex(64, 64, function (g, w, h) { g.fillStyle = '#F2B705'; g.fillRect(0, 0, w, h); g.fillStyle = '#1E1E1E'; for (var i = -64; i < 128; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 11 - 64, 64); g.lineTo(i - 64, 64); g.closePath(); g.fill(); } }, [6, 1]),
      contact: canvasTex(128, 64, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
      pcb: canvasTex(128, 96, function (g, w, h) {
        g.fillStyle = '#1F6B3A'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(210,180,90,.7)'; g.lineWidth = 1.5;
        for (var i = 0; i < 26; i++) { g.beginPath(); var x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 60, y); g.lineTo(x + (Math.random() - .5) * 60, y + (Math.random() - .5) * 40); g.stroke(); }
        g.fillStyle = '#151515'; [[20, 20, 30, 22], [70, 30, 26, 26], [30, 58, 18, 14], [86, 66, 22, 14]].forEach(function (r) { g.fillRect(r[0], r[1], r[2], r[3]); });
        g.fillStyle = '#D9D9D9'; for (var p = 0; p < 12; p++) g.fillRect(6 + p * 10, h - 8, 6, 6);
      })
    };
    TX.floor.wrapS = TX.floor.wrapT = T.RepeatWrapping; TX.panel.wrapS = T.RepeatWrapping; TX.plinth.wrapS = T.RepeatWrapping; TX.upright.wrapS = TX.upright.wrapT = T.RepeatWrapping; TX.mesh.wrapS = TX.mesh.wrapT = T.RepeatWrapping; TX.mesh.repeat.set(10, 5);
    var M = {
      floor: new T.MeshStandardMaterial({ map: TX.floor, roughness: 0.42, metalness: 0.08 }),
      panel: new T.MeshStandardMaterial({ map: TX.panel, roughness: 0.5, metalness: 0.2 }),
      plinth: new T.MeshStandardMaterial({ map: TX.plinth, roughness: 0.9 }),
      steel: new T.MeshStandardMaterial({ color: 0x2C2622, metalness: 0.75, roughness: 0.4 }),
      roof: new T.MeshStandardMaterial({ color: 0x3A322C, metalness: 0.4, roughness: 0.7, side: T.DoubleSide }),
      sky: new T.MeshStandardMaterial({ color: 0xFFF3DD, emissive: 0xFFF0D2, emissiveIntensity: 1.6 }),
      windows: new T.MeshStandardMaterial({ color: 0xDDE6EE, emissive: 0xFFF4E2, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.1 }),
      upright: new T.MeshStandardMaterial({ map: TX.upright, metalness: 0.6, roughness: 0.4 }),
      beam: new T.MeshStandardMaterial({ color: 0xE8641E, metalness: 0.35, roughness: 0.4 }),
      deck: new T.MeshStandardMaterial({ map: TX.mesh, alphaTest: 0.4, transparent: false, metalness: 0.7, roughness: 0.35, side: T.DoubleSide }),
      pallet: new T.MeshStandardMaterial({ map: TX.wood, roughness: 0.85 }),
      yellow: new T.MeshStandardMaterial({ color: 0xF2B705, roughness: 0.5 }),
      hatch: new T.MeshStandardMaterial({ map: TX.hatch, roughness: 0.6 }),
      bollard: new T.MeshStandardMaterial({ color: 0xF2B705, roughness: 0.45, metalness: 0.2 }),
      red: new T.MeshStandardMaterial({ color: 0xC62828, roughness: 0.4, metalness: 0.1 }),
      dark: new T.MeshStandardMaterial({ color: 0x1D1D1D, roughness: 0.6 }),
      metal: new T.MeshStandardMaterial({ color: 0xC9CDD2, metalness: 0.9, roughness: 0.25 }),
      rubber: new T.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.85 }),
      door: new T.MeshStandardMaterial({ color: 0x8A2B22, roughness: 0.5, metalness: 0.35 }),
      slat: new T.MeshBasicMaterial({ color: 0x5C1C16 }),
      contact: new T.MeshBasicMaterial({ map: TX.contact, transparent: true, depthWrite: false }),
      pcb: new T.MeshStandardMaterial({ map: TX.pcb, roughness: 0.55, metalness: 0.1 }),
      white: new T.MeshStandardMaterial({ color: 0xF4F1EA, roughness: 0.7 }),
      hit: new T.MeshBasicMaterial({ visible: false })
    };
    /* per product: a carton, a box / ream / bottle label — cached */
    var cache = {};
    function once(k, fn) { return cache[k] || (cache[k] = fn()); }
    function cartonMat(color) {
      return once('c' + color, function () {
        return new T.MeshStandardMaterial({ roughness: 0.8, map: canvasTex(128, 128, function (g, w, h) {
          g.fillStyle = '#D8B47C'; g.fillRect(0, 0, w, h);
          for (var i = 0; i < 300; i++) { g.fillStyle = 'rgba(120,80,40,.08)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); }
          g.fillStyle = hex(color); g.fillRect(0, h * 0.64, w, h * 0.13);
          g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(w * 0.1, h * 0.16, w * 0.46, h * 0.18);
          g.fillStyle = 'rgba(40,30,20,.55)'; g.fillRect(w * 0.13, h * 0.2, w * 0.3, 3); g.fillRect(w * 0.13, h * 0.26, w * 0.22, 3);
          g.strokeStyle = 'rgba(40,30,20,.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.78, h * 0.3); g.lineTo(w * 0.78, h * 0.12); g.moveTo(w * 0.72, h * 0.18); g.lineTo(w * 0.78, h * 0.12); g.lineTo(w * 0.84, h * 0.18); g.stroke();
          g.fillStyle = 'rgba(150,110,60,.45)'; g.fillRect(w * 0.46, 0, w * 0.08, h);
          g.strokeStyle = 'rgba(90,60,30,.45)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
        }) });
      });
    }
    function labelMat(kind, color, text) {
      return once(kind + color + text, function () {
        var big = kind === 'box' || kind === 'film' || kind === 'ream';
        return new T.MeshStandardMaterial({ roughness: kind === 'ream' ? 0.8 : 0.45, map: canvasTex(big ? 256 : 128, big ? 128 : 128, function (g, w, h) {
          if (kind === 'ream') { g.fillStyle = '#F6F3EC'; g.fillRect(0, 0, w, h); g.fillStyle = hex(color); g.fillRect(0, h * 0.62, w, h * 0.2); }
          else if (kind === 'bottle') { g.fillStyle = hex(color); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(0, h * 0.34, w, h * 0.34); g.fillStyle = hex(color); g.fillRect(w * 0.08, h * 0.42, w * 0.18, h * 0.18); }
          else { var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#FBFBFB'); gr.addColorStop(1, '#E8E6E1'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = hex(color); g.fillRect(0, 0, w, h * 0.3); g.fillRect(0, h * 0.86, w, h * 0.14); }
          if (text && big) { g.fillStyle = kind === 'ream' ? '#333' : '#222'; g.font = '700 ' + Math.round(h * 0.2) + 'px Cairo, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(text).slice(0, 18), w / 2, kind === 'ream' ? h * 0.35 : h * 0.58, w * 0.92); }
        }) });
      });
    }
    var G = {
      carton: new T.BoxGeometry(0.68, 0.5, 0.54),
      upright: new T.BoxGeometry(0.12, 5.6, 0.12), pallet: new T.BoxGeometry(1.35, 0.14, 1.15),
      beam: new T.BoxGeometry(3.1 - 0.12, 0.14, 0.1), deck: new T.PlaneGeometry(3.1 - 0.2, 1.5),
      bollard: new T.CylinderGeometry(0.13, 0.13, 1.1, 14), cap: new T.CylinderGeometry(0.14, 0.14, 0.06, 14)
    };
    (function () { var uv = G.upright.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 6); })();

    /* ── the real items: a few parts each, every part an instanced mesh ── */
    function bottleParts(color) {
      return once('bp' + color, function () {
        var body = new T.CylinderGeometry(0.07, 0.07, 0.22, 18); body.translate(0, 0.11, 0);
        var shoulder = new T.CylinderGeometry(0.035, 0.07, 0.04, 18); shoulder.translate(0, 0.24, 0);
        var cap = new T.CylinderGeometry(0.03, 0.03, 0.05, 14); cap.translate(0, 0.285, 0);
        var liquid = new T.MeshPhysicalMaterial({ color: color, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
        return [[body, labelMat('bottle', color, '')], [shoulder, liquid], [cap, M.dark]];
      });
    }
    var KIND = {
      bottle: { fp: [0.17, 0.17], h: 0.31, stack: 1, parts: function (p) { return bottleParts(tintOf(p)); } },
      box: { fp: [0.5, 0.38], h: 0.15, stack: 6, parts: function (p) { return [[once('gbox', function () { var b = new T.BoxGeometry(0.46, 0.14, 0.34); b.translate(0, 0.07, 0); return b; }), labelMat('box', tintOf(p), shortName(p))]]; } },
      film: { fp: [0.48, 0.4], h: 0.11, stack: 8, parts: function (p) { return [[once('gfilm', function () { var b = new T.BoxGeometry(0.44, 0.1, 0.36); b.translate(0, 0.05, 0); return b; }), labelMat('film', tintOf(p), shortName(p))]]; } },
      ream: { fp: [0.45, 0.33], h: 0.1, stack: 8, parts: function (p) { return [[once('gream', function () { var b = new T.BoxGeometry(0.42, 0.09, 0.3); b.translate(0, 0.045, 0); return b; }), labelMat('ream', tintOf(p), shortName(p))]]; } },
      carton: { fp: [0.72, 0.58], h: 0.51, stack: 3, parts: function (p) { return [[once('gcarton', function () { var b = G.carton.clone(); b.translate(0, 0.25, 0); return b; }), cartonMat(tintOf(p))]]; } },
      head: { fp: [0.28, 0.22], h: 0.13, stack: 2, parts: function () {
        return once('phead', function () {
          var body = new T.BoxGeometry(0.22, 0.09, 0.15); body.translate(0, 0.045, 0);
          var plate = new T.BoxGeometry(0.18, 0.01, 0.11); plate.translate(0, 0.095, 0);
          var cable = new T.BoxGeometry(0.06, 0.02, 0.1); cable.translate(0.09, 0.1, 0.02);
          return [[body, M.dark], [plate, M.metal], [cable, new T.MeshStandardMaterial({ color: 0xE8A33D, roughness: 0.5 })]];
        });
      } },
      roller: { fp: [1.36, 0.13], h: 0.11, stack: 3, parts: function () {
        return once('proller', function () {
          var r = new T.CylinderGeometry(0.05, 0.05, 1.15, 16); r.rotateZ(Math.PI / 2); r.translate(0, 0.05, 0);
          var s = new T.CylinderGeometry(0.014, 0.014, 1.34, 8); s.rotateZ(Math.PI / 2); s.translate(0, 0.05, 0);
          return [[r, M.rubber], [s, M.metal]];
        });
      } },
      board: { fp: [0.34, 0.27], h: 0.03, stack: 10, parts: function () {
        return once('pboard', function () { var b = new T.BoxGeometry(0.3, 0.018, 0.22); b.translate(0, 0.009, 0); var c = new T.BoxGeometry(0.06, 0.014, 0.05); c.translate(0.06, 0.025, -0.04); return [[b, M.pcb], [c, M.dark]]; });
      } },
      part: { fp: [0.34, 0.26], h: 0.17, stack: 3, parts: function () {
        return once('ppart', function () { var b = new T.BoxGeometry(0.3, 0.16, 0.22); b.translate(0, 0.08, 0); return [[b, new T.MeshStandardMaterial({ color: 0x8C939A, metalness: 0.6, roughness: 0.35 })]]; });
      } },
      roll: { fp: [0.36, 0.36], h: 0.5, stack: 1, parts: function () {
        return once('proll', function () { var r = new T.CylinderGeometry(0.16, 0.16, 0.5, 20); r.translate(0, 0.25, 0); var c = new T.CylinderGeometry(0.05, 0.05, 0.51, 12); c.translate(0, 0.25, 0); return [[r, M.white], [c, new T.MeshStandardMaterial({ color: 0x8B6B47, roughness: 0.8 })]]; });
      } }
    };
    function shortName(p) { return String(p.name || '').replace(/\s+/g, ' ').trim(); }

    /* ── layout: zones in pieces of ≤7 bays, side by side on lines of ≤9 bays, lines back → front ── */
    var BAY_W = 3.1, RACK_D = 1.5, LEVELS = [0.15, 2.05, 3.95], MAXROW = 7, LINE_MAX = 9, LINE_GAP = 6.2;
    function layout(products) {
      var groups = {}; ZONES.forEach(function (z) { groups[z.key] = []; });
      products.forEach(function (p) { groups[zoneOf(p)].push(p); });
      var segs = [];
      ZONES.forEach(function (zn) {
        var list = groups[zn.key].sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
        for (var i = 0; i < list.length; i += MAXROW) segs.push({ zone: zn, items: list.slice(i, i + MAXROW), first: i === 0 });
      });
      var lines = [], cur = null;
      segs.forEach(function (sg) {
        var need = sg.items.length + (cur && cur.segs.length ? 1 : 0);
        if (!cur || cur.w + need > LINE_MAX) { cur = { segs: [], w: 0 }; lines.push(cur); need = sg.items.length; }
        sg.at = cur.w + (cur.segs.length ? 1 : 0); cur.w += need; cur.segs.push(sg);
      });
      var rows = [], maxW = 1, depth = (lines.length - 1) * LINE_GAP;
      lines.forEach(function (ln, li) {
        maxW = Math.max(maxW, ln.w);
        var z = -depth / 2 + li * LINE_GAP, left = -((ln.w - 1) * BAY_W) / 2;
        ln.segs.forEach(function (sg) { rows.push({ zone: sg.zone, items: sg.items, first: sg.first, z: z, x0: left + sg.at * BAY_W }); });
      });
      return { rows: rows, halfW: Math.max(9, (maxW * BAY_W) / 2 + 2), halfD: Math.max(7, depth / 2 + 4), cW: (maxW * BAY_W) / 2, cD: depth / 2 + RACK_D };
    }

    /* ── the hangar shell ── */
    var shell = new T.Group(); scene.add(shell);
    var racks = new T.Group(); scene.add(racks);
    var details = new T.Group(); scene.add(details);
    var door = null, dockPos = new T.Vector3();
    function buildShell(L) {
      disposeGroup(shell);
      var W = L.halfW * 2 + 12, Dp = L.halfD * 2 + 12, back = -L.halfD - 6, H = 13;
      TX.floor.repeat.set(W / 6, (Dp + 60) / 6);
      var floor = new T.Mesh(new T.PlaneGeometry(W, Dp + 60), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.z = back + (Dp + 60) / 2; floor.receiveShadow = true; shell.add(floor);
      /* walls: insulated panels over a concrete plinth, a band of high windows */
      function wall(w, x, z, ry) {
        var g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; shell.add(g);
        var tp = TX.panel.clone(); tp.needsUpdate = true; tp.repeat.set(w / 4, 1); tp.wrapS = T.RepeatWrapping;
        var pm = M.panel.clone(); pm.map = tp;
        var p = new T.Mesh(new T.PlaneGeometry(w, H - 1.2), pm); p.position.y = 1.2 + (H - 1.2) / 2; p.receiveShadow = true; g.add(p);
        var tl = TX.plinth.clone(); tl.needsUpdate = true; tl.repeat.set(w / 4, 1); tl.wrapS = T.RepeatWrapping; var plm = M.plinth.clone(); plm.map = tl;
        var pl = new T.Mesh(new T.PlaneGeometry(w, 1.2), plm); pl.position.y = 0.6; g.add(pl);
        var wn = new T.Mesh(new T.PlaneGeometry(w - 4, 1.1), M.windows); wn.position.set(0, H - 2.4, 0.02); g.add(wn);
        return g;
      }
      wall(W, 0, back, 0); wall(Dp, -W / 2, back + Dp / 2, Math.PI / 2); wall(Dp, W / 2, back + Dp / 2, -Math.PI / 2);
      /* roof: steel trusses, roof sheets, skylight strips, lamps */
      for (var tx = -W / 2 + 3; tx <= W / 2 - 2; tx += 6) {
        var curve = new T.QuadraticBezierCurve3(new T.Vector3(tx, H, back), new T.Vector3(tx, H + 4.5, back + Dp / 2), new T.Vector3(tx, H, back + Dp));
        var tr = new T.Mesh(new T.TubeGeometry(curve, 20, 0.14, 6), M.steel); shell.add(tr);
        var tie = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, Dp, 6), M.steel); tie.rotation.x = Math.PI / 2; tie.position.set(tx, H, back + Dp / 2); shell.add(tie);
        var lamp = new T.Mesh(new T.CylinderGeometry(0.45, 0.65, 0.28, 14), new T.MeshStandardMaterial({ color: 0x222222, emissive: 0xFFD08A, emissiveIntensity: 2.4 })); lamp.position.set(tx, H - 1.1, back + Dp * 0.42); shell.add(lamp);
      }
      for (var sx = -W / 2 + 6; sx <= W / 2 - 6; sx += 12) { var sk = new T.Mesh(new T.PlaneGeometry(2.2, Dp * 0.8), M.sky); sk.rotation.x = Math.PI / 2; sk.position.set(sx, H + 3.6, back + Dp / 2); shell.add(sk); }
      /* the loading dock: door, hatched apron, a truck behind */
      var dx = -L.halfW + 2.5;
      door = new T.Mesh(new T.PlaneGeometry(6, 6), M.door); door.geometry.translate(0, -3, 0); door.position.set(dx, 6, back + 0.03); shell.add(door);
      for (var i = 0; i < 10; i++) { var ln = new T.Mesh(new T.PlaneGeometry(6, 0.05), M.slat); ln.position.set(0, -6 + 0.4 + i * 0.58, 0.01); door.add(ln); }
      var frame = new T.Mesh(new T.BoxGeometry(6.6, 0.3, 0.3), M.yellow); frame.position.set(dx, 6.15, back + 0.15); shell.add(frame);
      [-3.15, 3.15].forEach(function (o) { var f = new T.Mesh(new T.BoxGeometry(0.3, 6.3, 0.3), M.hatch); f.position.set(dx + o, 3.15, back + 0.15); shell.add(f); });
      var apron = new T.Mesh(new T.PlaneGeometry(6, 2.4), M.hatch); apron.rotation.x = -Math.PI / 2; apron.position.set(dx, 0.013, back + 1.4); shell.add(apron);
      var truck = new T.Group(); truck.position.set(dx, 0, back - 4.2); shell.add(truck);
      var tb = new T.Mesh(new T.BoxGeometry(5.4, 4.6, 7), new T.MeshStandardMaterial({ color: 0xEDE7E0, roughness: 0.5, metalness: 0.2 })); tb.position.y = 3.1; truck.add(tb);
      var ts = new T.Mesh(new T.BoxGeometry(5.45, 0.5, 7.05), M.red); ts.position.y = 2.2; truck.add(ts);
      dockPos.set(dx, 0, back + 2.6);
      /* aisle lines, bollards at the rack ends, extinguishers on the walls */
      var zs = {};
      L.rows.forEach(function (r) {
        if (zs[r.z]) return; zs[r.z] = 1;
        [r.z + RACK_D / 2 + 0.6, r.z - RACK_D / 2 - 0.6].forEach(function (zz) { var l = new T.Mesh(new T.PlaneGeometry(L.halfW * 2 - 2, 0.12), M.yellow); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.012, zz); shell.add(l); });
        var sh = new T.Mesh(new T.PlaneGeometry(L.cW * 2 + 2, RACK_D + 1.6), M.contact); sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.016, r.z); shell.add(sh);
      });
      var bol = [];
      L.rows.forEach(function (r) { var n = r.items.length; [r.x0 - BAY_W / 2 - 0.45, r.x0 + (n - 1) * BAY_W + BAY_W / 2 + 0.45].forEach(function (x) { bol.push([x, r.z + RACK_D / 2 + 0.25]); }); });
      if (bol.length) {
        var bi = new T.InstancedMesh(G.bollard, M.bollard, bol.length), ci = new T.InstancedMesh(G.cap, M.dark, bol.length), m4 = new T.Matrix4();
        bol.forEach(function (b, i) { m4.makeTranslation(b[0], 0.55, b[1]); bi.setMatrixAt(i, m4); m4.makeTranslation(b[0], 1.12, b[1]); ci.setMatrixAt(i, m4); });
        bi.castShadow = true; shell.add(bi); shell.add(ci);
      }
      [[-W / 2 + 0.2, back + Dp * 0.3, Math.PI / 2], [W / 2 - 0.2, back + Dp * 0.3, -Math.PI / 2], [W / 2 - 0.2, back + Dp * 0.65, -Math.PI / 2]].forEach(function (e) {
        var g = new T.Group(); g.position.set(e[0], 1.1, e[1]); g.rotation.y = e[2]; shell.add(g);
        var cyl = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.55, 14), M.red); cyl.position.z = 0.15; g.add(cyl);
        var sign = new T.Mesh(new T.PlaneGeometry(0.4, 0.4), M.red); sign.position.set(0, 0.75, 0.01); g.add(sign);
      });
      var sc = sun.shadow.camera; sc.left = -W / 2; sc.right = W / 2; sc.top = Dp / 2 + 4; sc.bottom = -Dp / 2 - 4; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix();
      sun.position.set(-16, 34, back + Dp / 2 + 18); sun.target.position.set(0, 0, back + Dp / 2);
    }
    function disposeGroup(g) {
      var keepG = Object.values(G), keepM = Object.values(M), cached = Object.values(cache);
      g.traverse(function (o) {
        if (o.geometry && keepG.indexOf(o.geometry) < 0 && !o.userData.sharedGeo) o.geometry.dispose();
        if (o.material && keepM.indexOf(o.material) < 0 && cached.indexOf(o.material) < 0 && !o.userData.sharedMat) { if (o.material.map && o.material.map !== TX.panel && o.material.map !== TX.plinth) o.material.map.dispose(); o.material.dispose(); }
        if (o.isInstancedMesh) o.dispose();
      });
      while (g.children.length) g.remove(g.children[0]);
    }

    /* ── racks + bays (overview cartons) ── */
    var bays = {}, order = [], picks = [], labelItems = [], L = null, STATIC, lineGroups = {};
    /* the static rack parts are instanced per line of racks, so a line in front of the one you look at can step aside */
    function lineOf(z) { var best = null; L.rows.forEach(function (r) { if (best === null || Math.abs(r.z - z) < Math.abs(best - z)) best = r.z; }); return String(best); }
    function staticPut(kind, x, y, z, rx) { var m = new T.Matrix4(), k = lineOf(z); if (rx) m.makeRotationX(rx); m.setPosition(x, y, z); (STATIC[k] = STATIC[k] || { upright: [], beam: [], deck: [], pallet: [] })[kind].push(m); }
    function staticBuild() {
      lineGroups = {};
      Object.keys(STATIC).forEach(function (lz) {
        var grp = new T.Group(); racks.add(grp); lineGroups[lz] = grp;
        [['upright', G.upright, M.upright, true], ['beam', G.beam, M.beam, true], ['deck', G.deck, M.deck, false], ['pallet', G.pallet, M.pallet, true]].forEach(function (k) {
          var list = STATIC[lz][k[0]]; if (!list.length) return;
          var im = new T.InstancedMesh(k[1], k[2], list.length); list.forEach(function (m, i) { im.setMatrixAt(i, m); });
          im.castShadow = k[3]; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); grp.add(im);
        });
      });
    }
    /* looking at a line: the lines in front of it are lifted out of the way (back in the whole-hangar view) */
    function cutaway(zFocus) {
      Object.keys(lineGroups).forEach(function (lz) { lineGroups[lz].visible = zFocus === null || Number(lz) <= zFocus + 0.5; });
      order.forEach(function (b) { b.cut = zFocus !== null && b.z > zFocus + 0.5; b.g.visible = !b.cut; if (b.label) b.label.cut = b.cut; });
      labelItems.forEach(function (l) { if (l.zone) l.cut = zFocus !== null; });               // zone signs: the chips do that job up close
    }
    function bayCapacity() { return 2 * 2 * 3 * 2 * LEVELS.length; }
    function buildRacks(products) {
      leaveDetail(true);
      disposeGroup(racks); bays = {}; order = []; picks = []; labelItems = [];
      STATIC = {};
      L = layout(products);
      buildShell(L);
      L.rows.forEach(function (row) {
        var n = row.items.length, x0 = row.x0;
        if (row.first) labelItems.push({ zone: row.zone.key, lineZ: row.z, pos: new T.Vector3(x0 - BAY_W / 2 - 0.4, 6.9, row.z), html: '<button type="button" class="axh-zone" data-zone="' + row.zone.key + '" style="--c:' + row.zone.color + '">' + row.zone.title + '</button>' });
        for (var i = 0; i <= n; i++) [0, RACK_D].forEach(function (dz) { staticPut('upright', x0 + i * BAY_W - BAY_W / 2, 2.8, row.z + dz - RACK_D / 2); });
        row.items.forEach(function (p, i) { makeBay(p, x0 + i * BAY_W, row.z, row.zone.key); });
      });
      staticBuild();
      labelsEl.innerHTML = labelItems.map(function (l, i) { return '<div class="axh-l' + (l.zone ? ' z' : '') + (l.bay && l.bay.state !== 'ok' ? ' axh-al' : '') + '" data-i="' + i + '"' + (l.bay ? ' data-id="' + esc(l.bay.id) + '" data-zone="' + l.bay.zone + '"' : '') + '>' + l.html + '</div>'; }).join('');
      labelItems.forEach(function (l, i) { l.el = labelsEl.children[i]; if (l.bay) l.bay.label = l; });
      chips();
      fitCamera();
      hud();
    }
    function makeBay(p, cx, cz, zone) {
      var bay = { p: p, id: p.id, zone: zone, g: new T.Group(), cap: bayCapacity(), x: cx, z: cz, front: new T.Vector3(cx, 0, cz + RACK_D / 2 + 2.3), shown: 0 };
      bay.g.position.set(cx, 0, cz); racks.add(bay.g);
      LEVELS.forEach(function (y, li) {
        [-RACK_D / 2, RACK_D / 2].forEach(function (dz) { staticPut('beam', cx, y, cz + dz); });
        if (li) staticPut('deck', cx, y + 0.06, cz, -Math.PI / 2);
      });
      var per = [2, 2, 3], gx = 0.7, gy = 0.51, gz = 0.56;
      var inst = new T.InstancedMesh(G.carton, cartonMat(tintOf(p)), bay.cap);
      inst.castShadow = true; inst.receiveShadow = true;
      var m4 = new T.Matrix4(), k = 0;
      for (var lv = 0; lv < LEVELS.length; lv++) for (var pal = 0; pal < 2; pal++) {
        var px = pal ? 0.72 : -0.72, base = LEVELS[lv] + (lv ? 0.1 : 0.02);
        staticPut('pallet', cx + px, base + 0.07, cz);
        for (var yy = 0; yy < per[2]; yy++) for (var zz = 0; zz < per[1]; zz++) for (var xx = 0; xx < per[0]; xx++) {
          m4.makeRotationY(((k * 7919) % 13 - 6) * 0.005);
          m4.setPosition(px + (xx - (per[0] - 1) / 2) * gx, base + 0.14 + gy / 2 + yy * gy, (zz - (per[1] - 1) / 2) * gz);
          inst.setMatrixAt(k++, m4);
        }
      }
      bay.inst = inst; bay.g.add(inst);
      var glow = new T.Mesh(new T.PlaneGeometry(BAY_W - 0.2, RACK_D + 0.6), new T.MeshBasicMaterial({ color: 0xFF3B30, transparent: true, opacity: 0, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; glow.visible = false; bay.g.add(glow); bay.glow = glow;
      var hit = new T.Mesh(new T.BoxGeometry(BAY_W, 5.4, RACK_D + 0.4), M.hit); hit.position.y = 2.7; hit.userData.id = p.id; bay.g.add(hit); picks.push(hit);
      var lb = { bay: bay, pos: new T.Vector3(cx, 5.75, cz + RACK_D / 2), html: '' };
      labelItems.push(lb);
      bays[p.id] = bay; order.push(bay);
      bay.label = lb;
      setCount(bay, cartonsOf(p));
      paintBay(bay);
    }
    function setCount(bay, n) {
      n = Math.max(0, Math.min(bay.cap, n)); bay.shown = n; bay.inst.count = n; bay.inst.visible = n > 0 && !bay.detail; bay.inst.instanceMatrix.needsUpdate = true;
    }
    function paintBay(bay) {
      var p = bay.p, st = stateOf(p), c = cartonsOf(p), kind = kindOf(p), u = unitsOf(p, kind);
      bay.state = st;
      bay.glow.material.color.set(st === 'out' ? 0xFF3B30 : 0xFF9F1C);
      var sub = st === 'out' ? 'خلص' : fmtN(p.quantity) + ' ' + esc(p.unit || '') + (c > bay.cap && !bay.detail ? ' +' : '');
      if (bay.detail && st !== 'out' && (kind === 'ream' || kind === 'carton') && u !== N(p.quantity)) sub += ' · ' + fmtN(u) + ' ' + KIND_WORD[kind];
      if (bay.detail && bay.detail.over) sub += ' · ظاهر ' + fmtN(bay.detail.shown);
      var html = '<div class="axh-lb ' + st + '"><b>' + esc(p.name) + '</b><span>' + sub + '</span></div>';
      if (bay.label) { bay.label.html = html; if (bay.label.el) { bay.label.el.innerHTML = html; bay.label.el.classList.toggle('axh-al', st !== 'ok'); } }
    }
    function hud() {
      var tot = 0, low = 0, out = 0;
      order.forEach(function (b) { tot += cartonsOf(b.p); if (b.state === 'low') low++; if (b.state === 'out') out++; });
      kEl.innerHTML = '<span>' + fmtN(tot) + ' كرتونة</span>' + (low ? '<span class="low">' + low + ' قربت تخلص</span>' : '') + (out ? '<span class="out">' + out + ' خلصت</span>' : '');
      host.setAttribute('aria-label', 'المخزن ثري دي: ' + fmtN(tot) + ' كرتونة' + (low ? '، ' + low + ' قربت تخلص' : '') + (out ? '، ' + out + ' خلصت' : ''));
    }
    function chips() {
      var present = {}; order.forEach(function (b) { present[b.zone] = (present[b.zone] || 0) + 1; });
      zonesEl.innerHTML = '<button type="button" data-zone="" class="' + (view.mode === 'all' ? 'on' : '') + '">كل المخزن</button>' +
        ZONES.filter(function (z) { return present[z.key]; }).map(function (z) { return '<button type="button" data-zone="' + z.key + '" style="--c:' + z.color + '" class="' + (view.zone === z.key && view.mode !== 'all' ? 'on' : '') + '">' + z.title + ' <em>' + present[z.key] + '</em></button>'; }).join('');
    }

    /* ════════════ the real items: built for the zone you look at ════════════ */
    var detailZone = null, appear = [];
    function enterDetail(zone) {
      if (detailZone === zone) return;
      leaveDetail(true);
      detailZone = zone;
      var k = 0;
      order.forEach(function (b) { if (b.zone === zone) { buildBayDetail(b, k); k++; } });
      labelsEl.classList.add('zfocus'); labelsEl.setAttribute('data-zone', zone);
    }
    function leaveDetail(now) {
      order.forEach(function (b) { if (b.detail) { b.detail.meshes.forEach(function (m) { details.remove(m); m.dispose(); }); b.detail = null; b.inst.visible = b.shown > 0; if (b.label) { b.label.pos.set(b.x, 5.75, b.z + RACK_D / 2); b.label.below = false; } paintBay(b); } });
      appear = []; detailZone = null; labelsEl.classList.remove('zfocus');
    }
    /* where every one of the real items sits on the 3 shelves of a bay, front row first, left → right, then up */
    function slotsFor(kind, max) {
      var K = KIND[kind], fx = K.fp[0], fz = K.fp[1], nx = Math.max(1, Math.floor((BAY_W - 0.36) / fx)), nz = Math.max(1, Math.floor(1.12 / fz));
      var levelH = 1.5, nst = Math.max(1, Math.min(K.stack, Math.floor(levelH / K.h))), out = [];
      var lvOrder = [1, 0, 2];                                                  // eye level first, then the floor, then the top
      for (var li = 0; li < 3 && out.length < max; li++) {
        var lv = lvOrder[li], base = LEVELS[lv] + (lv ? 0.1 : 0.02) + 0.145;   // on top of the pallets
        for (var iz = 0; iz < nz && out.length < max; iz++) for (var is = 0; is < nst && out.length < max; is++) for (var ix = 0; ix < nx && out.length < max; ix++) {
          out.push([(ix - (nx - 1) / 2) * fx, base + is * K.h, 0.56 - fz / 2 - iz * fz]);
        }
      }
      return out;
    }
    function buildBayDetail(b, idx) {
      var kind = kindOf(b.p), units = unitsOf(b.p, kind), slots = slotsFor(kind, Math.min(units, 2000)), parts = KIND[kind].parts(b.p);
      var m4 = new T.Matrix4(), meshes = parts.map(function (pt) {
        var im = new T.InstancedMesh(pt[0], pt[1], Math.max(1, slots.length)); im.userData.sharedGeo = true; im.userData.sharedMat = true;
        im.castShadow = !weak; im.receiveShadow = true; im.count = slots.length; im.visible = slots.length > 0;
        slots.forEach(function (s, i) { m4.makeRotationY(((i * 7919) % 11 - 5) * 0.01); m4.setPosition(b.x + s[0], s[1], b.z + s[2]); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); details.add(im); return im;
      });
      b.detail = { kind: kind, units: units, shown: slots.length, over: units > slots.length, slots: slots, meshes: meshes };
      b.inst.visible = false;
      if (b.label) { b.label.pos.set(b.x, LEVELS[1] - 0.05, b.z + RACK_D / 2 + 0.1); b.label.below = true; }
      paintBay(b);
      if (!reduce) appear.push({ b: b, t: -idx * 0.06, slots: slots });                // a light rise, bay after bay
    }
    function refreshBayDetail(b) { if (!b.detail) return; b.detail.meshes.forEach(function (m) { details.remove(m); m.dispose(); }); b.detail = null; buildBayDetail(b, 0); appear = appear.filter(function (a) { return a.b !== b; }); }
    function stepAppear(dt) {
      if (!appear.length) return;
      var m4 = new T.Matrix4(), q = new T.Quaternion(), sv = new T.Vector3(), pv = new T.Vector3(), up = new T.Vector3(0, 1, 0);
      for (var a = appear.length - 1; a >= 0; a--) {
        var ap = appear[a]; ap.t += dt; var b = ap.b; if (!b.detail) { appear.splice(a, 1); continue; }
        var n = ap.slots.length, done = true;
        for (var i = 0; i < n; i++) {
          var tt = Math.max(0, Math.min(1, (ap.t - i * Math.min(0.012, 0.5 / n)) / 0.35)), e = 1 - Math.pow(1 - tt, 3);
          if (tt < 1) done = false;
          var s = ap.slots[i]; pv.set(b.x + s[0], s[1] + (1 - e) * 0.35, b.z + s[2]); sv.setScalar(Math.max(0.001, e));
          q.setFromAxisAngle(up, ((i * 7919) % 11 - 5) * 0.01); m4.compose(pv, q, sv);
          b.detail.meshes.forEach(function (m) { m.setMatrixAt(i, m4); });
        }
        b.detail.meshes.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
        if (done) appear.splice(a, 1);
      }
    }

    /* ── forklift (with its driver) + worker ── */
    function person(vestColor) {
      var g = new T.Group(), vest = new T.MeshStandardMaterial({ color: vestColor, roughness: 0.6 }), pants = new T.MeshStandardMaterial({ color: 0x2D3436, roughness: 0.8 }), skin = new T.MeshStandardMaterial({ color: 0xC68B59, roughness: 0.7 });
      var legs = new T.Mesh(new T.CapsuleGeometry(0.16, 0.6, 4, 8), pants); legs.position.y = 0.55; g.add(legs);
      var torso = new T.Mesh(new T.CapsuleGeometry(0.24, 0.45, 4, 8), vest); torso.position.y = 1.25; torso.castShadow = true; g.add(torso);
      var stripe = new T.Mesh(new T.CylinderGeometry(0.245, 0.245, 0.06, 14), new T.MeshStandardMaterial({ color: 0xE0E0E0, emissive: 0x666666, roughness: 0.3 })); stripe.position.y = 1.2; g.add(stripe);
      var head = new T.Mesh(new T.SphereGeometry(0.16, 14, 10), skin); head.position.y = 1.8; g.add(head);
      var hat = new T.Mesh(new T.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xF2C230, roughness: 0.4 })); hat.position.y = 1.84; g.add(hat);
      var brim = new T.Mesh(new T.CylinderGeometry(0.21, 0.21, 0.02, 14), hat.material); brim.position.set(0, 1.84, 0.03); g.add(brim);
      return g;
    }
    var fk = (function () {
      var g = new T.Group(), body = new T.MeshStandardMaterial({ color: 0xF2A71B, metalness: 0.35, roughness: 0.4 });
      var chassis = new T.Mesh(new T.BoxGeometry(1.3, 0.75, 2.0), body); chassis.position.y = 0.72; chassis.castShadow = true; g.add(chassis);
      var cw = new T.Mesh(new T.CylinderGeometry(0.65, 0.65, 1.3, 18, 1, false, 0, Math.PI), M.dark); cw.rotation.z = Math.PI / 2; cw.rotation.y = Math.PI / 2; cw.position.set(0, 0.95, -1.0); g.add(cw);
      [[-0.6, -0.75], [0.6, -0.75], [-0.6, 0.6], [0.6, 0.6]].forEach(function (p) { var post = new T.Mesh(new T.BoxGeometry(0.07, 1.25, 0.07), M.dark); post.position.set(p[0], 1.72, p[1] * 0.75); g.add(post); });
      var guard = new T.Mesh(new T.BoxGeometry(1.3, 0.06, 1.25), M.dark); guard.position.set(0, 2.36, -0.1); g.add(guard);
      var seat = new T.Mesh(new T.BoxGeometry(0.5, 0.12, 0.5), M.dark); seat.position.set(0, 1.15, -0.35); g.add(seat);
      var driver = person(0xFF7A00); driver.scale.setScalar(0.82); driver.position.set(0, 0.7, -0.3); driver.children[0].visible = false; g.add(driver);
      var wheel = new T.CylinderGeometry(0.32, 0.32, 0.26, 16);
      [[-0.68, -0.6], [0.68, -0.6], [-0.68, 0.65], [0.68, 0.65]].forEach(function (w) { var wh = new T.Mesh(wheel, M.rubber); wh.rotation.z = Math.PI / 2; wh.position.set(w[0], 0.32, w[1]); g.add(wh); var rim = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.28, 12), M.metal); rim.rotation.z = Math.PI / 2; rim.position.copy(wh.position); g.add(rim); });
      [-0.42, 0.42].forEach(function (x) { var rail = new T.Mesh(new T.BoxGeometry(0.1, 3.0, 0.12), M.steel); rail.position.set(x, 1.6, 1.08); g.add(rail); });
      var carriage = new T.Group(); g.add(carriage);
      var plate = new T.Mesh(new T.BoxGeometry(1.0, 0.45, 0.06), M.dark); plate.position.set(0, 0.45, 1.16); carriage.add(plate);
      [-0.32, 0.32].forEach(function (x) { var f = new T.Mesh(new T.BoxGeometry(0.11, 0.05, 1.2), M.steel); f.position.set(x, 0.3, 1.75); carriage.add(f); });
      var load = new T.Group(); load.position.set(0, 0.42, 1.75); carriage.add(load);
      var pal = new T.Mesh(G.pallet, M.pallet); pal.scale.set(0.9, 1, 0.95); load.add(pal);
      var loadInst = new T.InstancedMesh(G.carton, cartonMat(0x1E88E5), 8); var m4 = new T.Matrix4();
      for (var i = 0; i < 8; i++) { m4.makeTranslation((i % 2 ? 0.3 : -0.3), 0.32 + Math.floor(i / 4) * 0.5, (Math.floor(i / 2) % 2 ? 0.27 : -0.27)); loadInst.setMatrixAt(i, m4); }
      loadInst.castShadow = true; load.add(loadInst); load.visible = false;
      var beacon = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), new T.MeshStandardMaterial({ color: 0xFF8A00, emissive: 0xFF8A00, emissiveIntensity: 3 })); beacon.position.set(0, 2.45, -0.4); g.add(beacon);
      scene.add(g);
      return { g: g, carriage: carriage, load: load, loadInst: loadInst, beacon: beacon, heading: 0 };
    })();
    function setLoad(n, color) { fk.load.visible = n > 0; fk.loadInst.count = Math.max(1, Math.min(8, n)); fk.loadInst.material = cartonMat(color || 0x1E88E5); }
    var wk = person(0xFF7A00); scene.add(wk);
    var wkBox = new T.Mesh(new T.BoxGeometry(0.5, 0.36, 0.4), cartonMat(0xD81B60)); wkBox.position.set(0, 1.3, 0.38); wk.add(wkBox);

    /* ── the forklift's jobs ── */
    var queue = [], job = null, patrolT = 0;
    function enqueue(ev) {
      if (reduce || queue.length >= 3) { applyEnd(ev); flash(ev); return; }
      queue.push(ev);
    }
    function applyEnd(ev) { var b = bays[ev.id]; if (!b) return; b.p = ev.p; setCount(b, ev.to); if (b.detail) refreshBayDetail(b); paintBay(b); hud(); }
    function startJob(ev) {
      var b = bays[ev.id]; if (!b) return null;
      var color = tintOf(ev.p), n = Math.max(1, Math.min(8, Math.abs(ev.to - ev.from) || 1)), inbound = ev.to > ev.from, steps = [];
      var aisle = function (pt) { return new T.Vector3(pt.x, 0, pt.z); };
      if (inbound) {
        steps.push({ go: dockPos.clone(), door: true });
        steps.push({ wait: 0.5, fn: function () { setLoad(n, color); } });
        steps.push({ go: aisle(b.front) });
        steps.push({ face: b.g.position.clone(), lift: 1, wait: 0.6, fn: function () { setLoad(0); applyEnd(ev); flash(ev); } });
        steps.push({ lift: 0, wait: 0.25 });
      } else {
        steps.push({ go: aisle(b.front) });
        steps.push({ face: b.g.position.clone(), lift: 1, wait: 0.6, fn: function () { setLoad(n, color); applyEnd(ev); flash(ev); } });
        steps.push({ lift: 0, wait: 0.2 });
        steps.push({ go: dockPos.clone(), door: true });
        steps.push({ wait: 0.45, fn: function () { setLoad(0); } });
      }
      ribbonSay(ev);
      return { ev: ev, steps: steps, i: 0, t: 0, until: performance.now() + 9000 };   // a slow phone never leaves a bay wrong
    }
    var doorOpen = 0, doorWant = 0, lift = 0, liftWant = 0, tmpV = new T.Vector3();
    function finishJob() { for (var i = job.i; i < job.steps.length; i++) if (job.steps[i].fn) job.steps[i].fn(); setLoad(0); liftWant = 0; doorWant = 0; job = null; }
    function stepJob(dt) {
      if (performance.now() > job.until) return finishJob();
      var s = job.steps[job.i];
      if (!s) { job = null; return; }
      if (s.door) doorWant = 1;
      if (s.go) {
        tmpV.subVectors(s.go, fk.g.position); tmpV.y = 0;
        var dist = tmpV.length();
        if (dist < 0.15) { delete s.go; return; }
        var want = Math.atan2(tmpV.x, tmpV.z); fk.heading = turn(fk.heading, want, dt * 6);
        fk.g.position.addScaledVector(tmpV.normalize(), Math.min(dist, 10 * dt * (Math.abs(angleDiff(fk.heading, want)) > 1 ? 0.25 : 1)));
        return;
      }
      if (s.face) { var w = Math.atan2(s.face.x - fk.g.position.x, s.face.z - fk.g.position.z); fk.heading = turn(fk.heading, w, dt * 6); if (Math.abs(angleDiff(fk.heading, w)) > 0.05) return; delete s.face; }
      if (s.lift !== undefined) liftWant = s.lift;
      job.t += dt;
      if (job.t >= (s.wait || 0)) { if (s.fn) s.fn(); job.i++; job.t = 0; if (!job.steps[job.i] || !job.steps[job.i].door) doorWant = 0; }
    }
    function angleDiff(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
    function turn(a, b, k) { return a + angleDiff(a, b) * Math.min(1, k); }
    function patrol(dt) {
      if (!L || !L.rows.length) return;
      patrolT += dt * 0.035;
      var n = L.rows.length, r = L.rows[((Math.floor(patrolT) % n) + n) % n], f = ((patrolT % 1) + 1) % 1, x = (f < 0.5 ? -1 + f * 4 : 3 - f * 4) * (L.halfW - 3);
      tmpV.set(x - fk.g.position.x, 0, r.z + RACK_D / 2 + 2.3 - fk.g.position.z);
      var d = tmpV.length(); if (d > 0.05) { var want = Math.atan2(tmpV.x, tmpV.z); fk.heading = turn(fk.heading, want, dt * 3); fk.g.position.addScaledVector(tmpV.normalize(), Math.min(d, dt * 3.2)); }
    }

    /* ── «+5 / −3» and the ribbon ── */
    var fxItems = [];
    function flash(ev) {
      var b = bays[ev.id]; if (!b) return;
      var d = N(ev.p.quantity) - N(ev.fromQty), el = document.createElement('div'); el.className = 'axh-pop ' + (d >= 0 ? 'in' : 'out');
      el.textContent = (d >= 0 ? '+' : '−') + fmtN(Math.abs(d)) + ' ' + (ev.p.unit || ''); fxEl.appendChild(el);
      fxItems.push({ el: el, pos: b.g.position.clone().add(new T.Vector3(0, 6.6, RACK_D / 2)), t: 0 });
      b.pulse = 1.2;
    }
    var ribbonTimer = null;
    function say(html) { ribbon.innerHTML = html; ribbon.classList.add('show'); clearTimeout(ribbonTimer); ribbonTimer = setTimeout(function () { ribbon.classList.remove('show'); }, 5200); }
    function ribbonSay(ev) { var r = ev.reason, d = N(ev.p.quantity) - N(ev.fromQty); say('<i>' + r.ic + '</i><span><b>' + esc(r.t) + '</b> · ' + esc(ev.p.name) + ' ' + (d >= 0 ? '+' : '−') + fmtN(Math.abs(d)) + ' ' + esc(ev.p.unit || '') + '</span>'); }

    /* ── watch the data: any change, from any path ── */
    var known = {}, layoutSig = '';
    function products() { return A('products').filter(function (p) { return p && p.id != null && !p.archived && !p.deleted; }); }
    function sigOf(list) { return list.map(function (p) { return p.id + '|' + p.name + '|' + zoneOf(p) + '|' + (p.unit || ''); }).sort().join('~'); }
    function sync(first, instant) {
      var list = products(), sig = sigOf(list);
      if (sig !== layoutSig) {
        var added = layoutSig && list.filter(function (p) { return !known[p.id]; }), keep = view.mode !== 'all' ? { mode: view.mode, zone: view.zone, id: view.id } : null;
        layoutSig = sig; buildRacks(list);
        if (keep && order.some(function (b) { return b.zone === keep.zone; })) setView(keep.mode, keep.zone, keep.mode === 'bay' && bays[keep.id] ? keep.id : null, true); else setView('all', null, null, true);
        if (added && added.length) say('<i>✨</i><span><b>صنف جديد</b> · ' + esc(added.map(function (p) { return p.name; }).join('، ')) + '</span>');
        known = {}; list.forEach(function (p) { known[p.id] = { q: N(p.quantity), min: N(p.minQuantity) }; });
        return;
      }
      list.forEach(function (p) {
        var k = known[p.id], q = N(p.quantity);
        if (!k) { known[p.id] = { q: q, min: N(p.minQuantity) }; return; }
        if (k.q !== q) {
          var b = bays[p.id], from = b ? b.shown : cartonsOf(p), to = Math.min(b ? b.cap : 1e9, cartonsOf(p));
          var ev = { id: p.id, p: p, fromQty: k.q, from: from, to: to, reason: reasonFor(p.id, q - k.q) };
          k.q = q; k.min = N(p.minQuantity);
          if (first || instant) applyEnd(ev);
          else if (from === to || (b && b.detail)) {
            applyEnd(ev); flash(ev); ribbonSay(ev);
            if (b && b.detail && from !== to && !reduce && queue.length < 3) queue.push({ id: p.id, p: p, from: from, to: to, ghost: true });   // the forklift still makes the trip
          }
          else enqueue(ev);
          if (cardId === p.id) openCard(bays[p.id], true);
        } else if (k.min !== N(p.minQuantity) && bays[p.id]) { k.min = N(p.minQuantity); bays[p.id].p = p; paintBay(bays[p.id]); hud(); }
      });
    }

    /* ════════════ the camera: whole hangar → a zone → one bay ════════════ */
    var view = { mode: 'all', zone: null, id: null };
    var yaw = 0, pitch = 0, zoom = 1, pan = 0, fitR = 30, drag = null, pinch = null;
    var camPos = new T.Vector3(0, 30, 30), camLook = new T.Vector3(), wantPos = new T.Vector3(), wantLook = new T.Vector3(), flyPos = new T.Vector3(), flyLook = new T.Vector3(), fly = 0;
    function fitCamera() {
      var w = host.clientWidth || 600, h = host.clientHeight || 340, asp = Math.max(0.6, w / h);
      var cW = L ? Math.max(6, L.cW) : 10, cD = L ? Math.max(3, L.cD) : 4;
      var vfov = cam.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * asp);
      fitR = Math.max((cW + 2.5) / Math.tan(hfov / 2), (cD + 3) / Math.tan(vfov / 2)) * (w < 600 ? 0.78 : 1.0);
    }
    function hfovHalf() { var w = host.clientWidth || 600, h = host.clientHeight || 340; return Math.atan(Math.tan(cam.fov * Math.PI / 360) * Math.max(0.5, w / h)); }
    function zoneSpan(zone) {
      var xs = [], z = null; order.forEach(function (b) { if (b.zone === zone) { xs.push(b.x); if (z === null || b.z > z) z = b.z; } });
      if (!xs.length) return null;
      var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
      var zFront = z; return { cx: (lo + hi) / 2, half: (hi - lo) / 2 + BAY_W / 2, z: zFront, lo: lo, hi: hi };
    }
    function target(t) {
      var a = yaw + (reduce || drag || view.mode !== 'all' ? 0 : Math.sin(t * 0.00011) * 0.12);
      if (view.mode === 'all') {
        var r = fitR * zoom;
        wantPos.set(Math.sin(a) * r, r * (0.86 + pitch), Math.cos(a) * r + 2); wantLook.set(0, 1.0, -0.8);
      } else if (view.mode === 'zone') {
        var sp = zoneSpan(view.zone); if (!sp) return;
        var vis = Math.min(sp.half + 0.8, BAY_W * ((host.clientWidth || 600) < 600 ? 1.2 : 3.7));
        var d = Math.min(30, Math.max(6.5, vis / Math.tan(hfovHalf()))) * zoom, cx = sp.cx + pan;
        wantPos.set(cx + Math.sin(a) * d * 0.5, 2.8 + d * (0.2 + pitch), sp.z + RACK_D / 2 + d); wantLook.set(cx, 2.1, sp.z);
      } else {
        var b = bays[view.id]; if (!b) return;
        var dd = Math.max(3.4, (BAY_W / 2 + 0.5) / Math.tan(hfovHalf())) * zoom;
        var low = (host.clientWidth || 600) < 600 ? 0.75 : -0.15;               // a phone's card covers the bottom: keep the shelf in the top half
        wantPos.set(b.x + Math.sin(a) * dd * 0.6, 2.6 + dd * (0.18 + pitch) - low, b.z + RACK_D / 2 + dd); wantLook.set(b.x, 2.05 - low, b.z);
      }
    }
    function setView(mode, zone, id, instant) {
      view.mode = mode; view.zone = zone || null; view.id = id || null; pan = 0; yaw = 0; pitch = 0; zoom = 1;
      if (mode === 'zone') {
        var sp0 = zoneSpan(view.zone);
        if (sp0 && (host.clientWidth || 600) < 600) { var fb = order.filter(function (b) { return b.zone === view.zone && b.z === sp0.z; }).sort(function (a, c) { return a.x - c.x; }), st0 = fb.find(function (b) { return N(b.p.quantity) > 0; }) || fb[0]; if (st0) pan = st0.x - sp0.cx; }
        else if (sp0) { var vis0 = Math.min(sp0.half + 0.8, BAY_W * 3.7); pan = Math.min(0, sp0.lo - BAY_W / 2 - 0.4 + vis0 - sp0.cx); }
      }
      flyPos.copy(camPos); flyLook.copy(camLook);
      if (mode === 'all') leaveDetail(); else enterDetail(view.zone);
      var spc = mode === 'all' ? null : zoneSpan(view.zone); cutaway(spc ? spc.z : null);
      chips();
      navEl.hidden = mode === 'all';
      navEl.querySelector('[data-a="prev"]').hidden = navEl.querySelector('[data-a="next"]').hidden = mode !== 'bay';
      navEl.querySelector('.axh-back span').textContent = mode === 'bay' ? (ZONES.find(function (z) { return z.key === view.zone; }) || {}).title || 'القسم' : 'كل المخزن';
      tipEl.textContent = mode === 'all' ? 'اسحب عشان تلف · دوس على قسم أو رف' : mode === 'zone' ? 'دوس على أي رف عشان تقرّب منه' : '‹ › للرف اللي جنبه';
      host.classList.toggle('axh-close', mode !== 'all'); host.classList.toggle('axh-bay', mode === 'bay');
      fly = instant ? 1 : 0;
      if (mode !== 'bay') closeCard();
    }
    function focusBay(id) {
      var b = bays[id]; if (!b) return;
      setView('bay', b.zone, id); openCard(b);
    }
    function neighbor(dir) {
      var list = order.filter(function (b) { return b.zone === view.zone; }), i = list.findIndex(function (b) { return b.id === view.id; });
      if (i < 0) return; var nb = list[(i + dir + list.length) % list.length]; focusBay(nb.id);
    }
    function pickAt(cx, cy) {
      var r = cv.getBoundingClientRect(), v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      var ray = new T.Raycaster(); ray.setFromCamera(v, cam); var hit = ray.intersectObjects(picks).filter(function (h) { var b = bays[h.object.userData.id]; return b && !b.cut; })[0];
      return hit ? bays[hit.object.userData.id] : null;
    }
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch, pan: pan, moved: false, id: e.pointerId }; });
    cv.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId || pinch) { if (!drag && e.pointerType === 'mouse') cv.style.cursor = pickAt(e.clientX, e.clientY) ? 'pointer' : 'grab'; return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      if (view.mode === 'zone') { var sp = zoneSpan(view.zone) || { half: 0 }; pan = Math.max(-sp.half, Math.min(sp.half, drag.pan - dx * 0.03)); pitch = Math.max(-0.2, Math.min(0.5, drag.pitch + dy * 0.003)); }
      else { yaw = Math.max(-0.85, Math.min(0.85, drag.yaw - dx * 0.005)); pitch = Math.max(view.mode === 'bay' ? -0.15 : -0.35, Math.min(0.5, drag.pitch + dy * 0.003)); }
    });
    window.addEventListener('pointerup', function (e) {
      if (drag && !drag.moved && !pinch && e.target === cv) {
        var b = pickAt(e.clientX, e.clientY);
        if (b) { if (view.mode === 'bay' && view.id === b.id) openCard(b); else focusBay(b.id); }
        else if (view.mode === 'bay') closeCard();
      }
      drag = null;
    });
    cv.addEventListener('wheel', function (e) { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom = Math.max(0.45, Math.min(1.6, zoom * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
    cv.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { pinch = { d: dist2(e.touches), z: zoom }; drag = null; } }, { passive: true });
    cv.addEventListener('touchmove', function (e) { if (pinch && e.touches.length === 2) { zoom = Math.max(0.45, Math.min(1.6, pinch.z * pinch.d / dist2(e.touches))); e.preventDefault(); } }, { passive: false });
    cv.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });
    function dist2(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy) || 1; }

    /* ── a bay's card ── */
    var cardId = null;
    function openCard(b, keep) {
      if (!b) return; cardId = b.id;
      var p = b.p, st = stateOf(p), c = cartonsOf(p), per = perCarton(p), kind = kindOf(p), u = unitsOf(p, kind), last = null;
      A('stockMoves').forEach(function (m) { if (m && m.productId === p.id && (!last || N(m.createdAt) > N(last.createdAt))) last = m; });
      var can = function (fn) { return typeof window[fn] === 'function'; };
      var what = KIND_WORD[kind] + (kind === 'ream' && p.unit !== 'ريم' ? ' (500 ورقة)' : '');
      card.innerHTML = '<button type="button" class="axh-cx" data-a="cx" aria-label="اقفل">✕</button>' +
        '<b class="axh-cn">' + esc(p.name) + '</b>' +
        '<div class="axh-cq ' + st + '">' + (st === 'out' ? 'خلص' : fmtN(p.quantity) + ' ' + esc(p.unit || '')) + '</div>' +
        '<small>على الرف: ' + fmtN(u) + ' ' + what + (b.detail && b.detail.over ? ' (ظاهر ' + fmtN(b.detail.shown) + ')' : '') + '</small>' + (per > 1 ? '<small>' + fmtN(c) + ' كرتونة (الكرتونة ' + fmtN(per) + ' ' + esc(p.unit || '') + ')</small>' : '') +
        (N(p.minQuantity) ? '<small>الحد الأدنى ' + fmtN(p.minQuantity) + '</small>' : '') +
        (last ? '<small>آخر حركة: ' + (last.type === 'in' ? 'وارد' : 'منصرف') + ' ' + fmtN(last.quantity) + ' · ' + esc(String(last.date || '')) + '</small>' : '') +
        '<div class="axh-ca">' +
          (can('openStockMoveForm') ? '<button type="button" data-a="in">➕ وارد</button><button type="button" data-a="out">➖ منصرف</button>' : '') +
          (window.AXCons ? '<button type="button" data-a="cons">🧪 مستهلكات</button>' : '') +
          (can('openProductForm') ? '<button type="button" data-a="edit">✏️ تعديل</button>' : '') +
        '</div>';
      card.hidden = false;
      order.forEach(function (x) { x.sel = x.id === b.id; });
      if (!keep) card.classList.remove('min');
    }
    function closeCard() { card.hidden = true; cardId = null; order.forEach(function (x) { x.sel = false; }); }
    host.addEventListener('click', function (e) {
      var z = e.target.closest && e.target.closest('[data-zone]');
      if (z && (z.closest('.axh-zones') || z.classList.contains('axh-zone'))) { var key = z.getAttribute('data-zone'); if (!key) setView('all'); else setView('zone', key); return; }
      var t = e.target.closest && e.target.closest('[data-a]'); if (!t) return;
      var a = t.getAttribute('data-a'), id = cardId;
      if (a === 'cx') return closeCard();
      if (a === 'back') return view.mode === 'bay' ? setView('zone', view.zone) : setView('all');
      if (a === 'prev' || a === 'next') return neighbor(a === 'next' ? 1 : -1);
      if (a === 'tall') { var on = !host.classList.contains('tall'); host.classList.toggle('tall', on); ls(TALL_KEY, on ? '1' : null); setTimeout(size, 320); return; }
      if (a === 'zin' || a === 'zout') { zoom = Math.max(0.45, Math.min(1.6, zoom * (a === 'zin' ? 0.85 : 1.18))); return; }
      if (a === 'off') { ls(OFF_KEY, '1'); pause(); var root = host.closest('#page-content') || host.parentNode; host.remove(); if (root) attach(root); return; }
      if (!id) return;
      closeCard();
      if (a === 'in') return window.openStockMoveForm(id, 'in');
      if (a === 'out') return window.openStockMoveForm(id, 'out');
      if (a === 'cons') return window.AXCons.open(id);
      if (a === 'edit') return window.openProductForm(id);
    });

    /* ── size + the loop ── */
    function size() { var w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); fitCamera(); }
    var ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(host); else window.addEventListener('resize', size);
    var visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) resume(); }).observe(host);
    var running = false, last = 0, frameN = 0, pollAt = 0, v3 = new T.Vector3();
    function loop(t) {
      if (!running) return;
      if (!host.isConnected) { running = false; return; }
      requestAnimationFrame(loop);
      if (!visible || document.hidden) { if (t > pollAt) { pollAt = t + 1000; sync(false, true); } last = t; return; }
      var dt = Math.max(0, Math.min(0.05, (t - last) / 1000 || 0.016)); last = t;
      if (t > pollAt) { pollAt = t + 600; sync(false); }
      var busy = !!job || queue.length || fxItems.length || appear.length || drag || pinch || fly < 1;
      if (!busy && (frameN++ & 1)) return;
      tick(busy ? dt : Math.min(0.1, dt * 2), t);
    }
    function tick(dt, t) {
      if (!job && queue.length) { var nx = queue.shift(); job = nx.ghost ? startGhost(nx) : startJob(nx); }
      if (job) stepJob(dt); else if (!reduce) patrol(dt);
      stepAppear(dt);
      fk.g.rotation.y = fk.heading;
      lift += (liftWant - lift) * Math.min(1, dt * 5); fk.carriage.position.y = lift * 1.9;
      doorOpen += (doorWant - doorOpen) * Math.min(1, dt * 3); if (door) door.scale.y = 1 - doorOpen * 0.85;
      fk.beacon.material.emissiveIntensity = 1.5 + Math.sin(t * 0.012) * 1.5;
      if (L && L.rows.length && !reduce) {
        var r0 = L.rows[L.rows.length - 1], ws = (t * 0.00002) % 1, wx = Math.sin(ws * Math.PI * 2) * (L.halfW - 4), prevX = wk.position.x;
        wk.position.set(wx, Math.abs(Math.sin(t * 0.009)) * 0.05, r0.z + RACK_D / 2 + 3.4); wk.rotation.y = wx > prevX ? Math.PI / 2 : -Math.PI / 2;
      }
      order.forEach(function (b) {
        var base = b.state === 'ok' ? 0 : 0.22 + (Math.sin(t * 0.004) + 1) * 0.12;
        if (b.pulse) { b.pulse = Math.max(0, b.pulse - dt); b.glow.material.color.set(b.state === 'out' ? 0xFF3B30 : 0x2ECC71); base = Math.max(base, b.pulse * 0.45); if (!b.pulse) paintBay(b); }
        if (b.sel) base = Math.max(base, 0.38);
        b.glow.material.opacity = base; b.glow.visible = base > 0.01;
      });
      /* the camera glides to where it should be */
      target(t);
      if (fly < 1) { fly = Math.min(1, fly + dt / (reduce ? 0.01 : 1.0)); var e = fly < 0.5 ? 4 * fly * fly * fly : 1 - Math.pow(-2 * fly + 2, 3) / 2; camPos.copy(flyPos).lerp(wantPos, e); camLook.copy(flyLook).lerp(wantLook, e); }
      else { camPos.lerp(wantPos, Math.min(1, dt * 8)); camLook.lerp(wantLook, Math.min(1, dt * 8)); }
      cam.position.copy(camPos); cam.lookAt(camLook);
      renderer.render(scene, cam);
      var w = host.clientWidth, h = host.clientHeight;
      labelItems.forEach(function (l) {
        if (!l.el) return; v3.copy(l.pos).project(cam);
        if (l.cut || v3.z > 1 || v3.x < -1.2 || v3.x > 1.2 || v3.y > 1.3) { l.el.style.display = 'none'; return; }
        var lx = (v3.x + 1) / 2 * w; if (l.zone) lx = Math.max(46, Math.min(w - 46, lx));
        l.el.style.display = ''; l.el.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ((1 - v3.y) / 2 * h).toFixed(1) + 'px) translate(-50%,' + (l.below ? '0' : '-100%') + ')';   // close up: under the shelf, not over the items
      });
      for (var i = fxItems.length - 1; i >= 0; i--) {
        var f = fxItems[i]; f.t += dt; v3.copy(f.pos); v3.y += f.t * 2.2; v3.project(cam);
        f.el.style.transform = 'translate(' + ((v3.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v3.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-100%)';
        f.el.style.opacity = String(Math.max(0, 1 - Math.max(0, f.t - 1.2) / 0.8));
        if (f.t > 2) { f.el.remove(); fxItems.splice(i, 1); }
      }
    }
    /* in a close view the items changed at once; the forklift still drives the trip, with the cartons, for the story */
    function startGhost(ev) {
      var b = bays[ev.id]; if (!b) return null;
      var color = tintOf(ev.p), n = Math.max(1, Math.min(8, Math.abs(ev.to - ev.from) || 1)), inbound = ev.to > ev.from;
      var steps = inbound ? [{ go: dockPos.clone(), door: true }, { wait: 0.4, fn: function () { setLoad(n, color); } }, { go: new T.Vector3(b.front.x, 0, b.front.z) }, { face: b.g.position.clone(), lift: 1, wait: 0.5, fn: function () { setLoad(0); } }, { lift: 0, wait: 0.2 }]
        : [{ go: new T.Vector3(b.front.x, 0, b.front.z) }, { face: b.g.position.clone(), lift: 1, wait: 0.5, fn: function () { setLoad(n, color); } }, { lift: 0, wait: 0.2 }, { go: dockPos.clone(), door: true }, { wait: 0.4, fn: function () { setLoad(0); } }];
      return { ev: ev, steps: steps, i: 0, t: 0, until: performance.now() + 9000 };
    }
    function resume() { if (running || !host.isConnected) return; size(); sync(!layoutSig); running = true; last = performance.now(); requestAnimationFrame(loop); }
    function pause() { running = false; }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) resume(); });

    /* where a bay is on the screen (its top shelf, front face — the part a row in front does not hide) */
    function screenOf(id) {
      var b = bays[id]; if (!b) return null;
      var r = cv.getBoundingClientRect(), p = b.g.position.clone().add(new T.Vector3(0, view.mode === 'all' ? 4.7 : 2.6, RACK_D / 2)).project(cam);
      return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    }

    /* first build */
    sync(true);
    setView('all', null, null, true);
    fk.g.position.copy(dockPos); fk.g.position.z += 1;
    target(0); camPos.copy(wantPos); camLook.copy(wantLook);
    tick(0.016, performance.now());
    return {
      resume: resume, pause: pause, screenOf: screenOf, sync: function () { sync(false); },
      zone: function (z) { if (!z) setView('all'); else setView('zone', z); }, bay: focusBay,
      state: function () {
        var o = {};
        order.forEach(function (b) { o[b.id] = { shown: b.shown, state: b.state, cap: b.cap, zone: b.zone, kind: kindOf(b.p), units: unitsOf(b.p, kindOf(b.p)), detail: b.detail ? b.detail.shown : null }; });
        return { bays: o, queue: queue.length, busy: !!job, ribbon: ribbon.textContent, view: { mode: view.mode, zone: view.zone, id: view.id }, flying: fly < 1, appearing: appear.length };
      }
    };
  }

  window.AXHangar = {
    attach: attach,
    zoneOf: zoneOf, cartonsOf: cartonsOf, kindOf: kindOf, unitsOf: function (p) { return unitsOf(p, kindOf(p)); },
    state: function () { return S.eng ? S.eng.state() : null; },
    screenOf: function (id) { return S.eng ? S.eng.screenOf(id) : null; },
    zone: function (z) { if (S.eng) S.eng.zone(z); },
    bay: function (id) { if (S.eng) S.eng.bay(id); },
    ready: function () { return S.booting ? S.booting.then(function () { return !!S.eng; }) : Promise.resolve(!!S.eng); }
  };
})();

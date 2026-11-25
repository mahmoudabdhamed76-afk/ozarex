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
    if (z === 'parts' || u === 'قطعة' || u === 'طقم') return partKind(n);
    return 'box';
  }
  /* a spare part, by its name */
  function partKind(n) {
    if (/رأس|راس|هيد|head|nozzle|نوزل/.test(n)) return 'head';
    if (/بكر|roller|رولر|pick ?up|بيك اب/.test(n)) return 'roller';
    if (/بورد|board|لوحة|كارت|pcb|ماذر/.test(n)) return 'board';
    if (/فيوزر|fuser|سخان|heater|هيتر/.test(n)) return 'fuser';
    if (/سير|belt/.test(n)) return 'belt';
    if (/ترس|تروس|gear/.test(n)) return 'gear';
    if (/حساس|سنسور|sensor/.test(n)) return 'sensor';
    if (/كابل|كيبل|فلات|cable|flat/.test(n)) return 'cable';
    if (/موتور|ماتور|motor/.test(n)) return 'motor';
    if (/طرمب|طلمب|pump/.test(n)) return 'pump';
    if (/دامبر|damper/.test(n)) return 'damper';
    if (/كاب|capping|cap ?station|\bcap\b|وايبر|wiper/.test(n)) return 'cap';
    return 'bag';                                                                // anything else: in its anti-static bag with a barcode
  }
  var KIND_WORD = { bottle: 'زجاجة', ream: 'ريم', box: 'علبة', film: 'علبة فيلم', roll: 'لفة', head: 'رأس', roller: 'بكرة', board: 'بورد', carton: 'كرتونة',
    fuser: 'فيوزر', belt: 'سير', gear: 'ترس', sensor: 'حساس', cable: 'كابل', motor: 'موتور', pump: 'طرمبة', damper: 'دامبر', cap: 'كاب', bag: 'قطعة' };
  var KIND_ONE = { bottle: 'الإزازة', ream: 'الريم', box: 'العلبة', film: 'علبة الفيلم', roll: 'اللفة', head: 'الرأس', roller: 'البكرة', board: 'البورد', carton: 'الكرتونة',
    fuser: 'الفيوزر', belt: 'السير', gear: 'الترس', sensor: 'الحساس', cable: 'الكابل', motor: 'الموتور', pump: 'الطرمبة', damper: 'الدامبر', cap: 'الكاب', bag: 'القطعة' };
  function unitsOf(p, kind) {
    var q = Math.max(0, N(p.quantity)), u = String(p.unit || '');
    if (kind === 'ream') return u === 'ريم' ? Math.ceil(q - 1e-9) : Math.ceil(q / 500 - 1e-9);
    if (kind === 'carton') return cartonsOf(p);
    if (kind === 'bottle' && /^(مل|ملي|ml)$/i.test(u)) return Math.ceil(q / 1000 - 1e-9);   // a litre bottle each
    return Math.ceil(q - 1e-9);
  }
  /* sheets: the last ream may be an opened one — how full it is (0 < f < 1), or 1 */
  function lastFill(p, kind) {
    var q = Math.max(0, N(p.quantity)), u = String(p.unit || '');
    if (kind !== 'ream' || q <= 0) return 1;
    var r = u === 'ريم' ? q % 1 : (q % 500) / 500;
    return r > 1e-6 ? r : 1;
  }
  /* what the print says: paper size and weight, film size — read from the item name */
  function specOf(p) {
    var n = String(p.name || ''), size = '', gsm = '', m;
    if ((m = n.match(/\bA\s?([0-6])\b/i))) size = 'A' + m[1];
    else if ((m = n.match(/(\d{1,2}(?:\.\d)?)\s*[x×*]\s*(\d{1,2}(?:\.\d)?)/))) size = m[1] + '×' + m[2];
    if ((m = n.match(/(\d{2,3})\s*(?:gsm|gm|g|جرام|جم|ج)(?![a-z])/i))) gsm = m[1] + 'g';
    var sc = 1;
    if (/^A3$/.test(size)) sc = 1.25; else if (/^A5$/.test(size)) sc = 0.8;
    else if ((m = size.match(/^(\d+(?:\.\d)?)×(\d+(?:\.\d)?)$/))) sc = Math.max(0.75, Math.min(1.2, Math.max(N(m[1]), N(m[2])) / 15));
    return { size: size, gsm: gsm, scale: sc, glossy: /photo|فوتو|glossy|لامع|vivid|satin/i.test(n) };
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
      '<div class="axh-tools"><button type="button" data-a="find" title="دوّر على صنف" aria-label="دوّر على صنف">🔍</button><button type="button" data-a="zin" title="قرّب" aria-label="قرّب">＋</button><button type="button" data-a="zout" title="بعّد" aria-label="بعّد">－</button><button type="button" data-a="tall" title="كبّر / صغّر" aria-label="كبّر أو صغّر">⤢</button><button type="button" data-a="off" title="اخفي المخزن ثري دي" aria-label="اخفي المخزن ثري دي">✕</button></div>' +
      '<nav class="axh-zones" aria-label="أقسام المخزن"></nav>' +
      '<div class="axh-nav" hidden><button type="button" data-a="prev" aria-label="الرف اللي قبله">‹</button><button type="button" data-a="back" class="axh-back">↩ <span></span></button><button type="button" data-a="next" aria-label="الرف اللي بعده">›</button></div>' +
      '<div class="axh-find" hidden><input type="search" placeholder="اكتب اسم الصنف…" aria-label="دوّر على صنف في المخزن" autocomplete="off"><div class="axh-fr"></div></div>' +
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
    var G = {
      carton: new T.BoxGeometry(0.68, 0.5, 0.54),
      upright: new T.BoxGeometry(0.12, 5.6, 0.12), pallet: new T.BoxGeometry(1.35, 0.14, 1.15),
      beam: new T.BoxGeometry(3.1 - 0.12, 0.14, 0.1), deck: new T.PlaneGeometry(3.1 - 0.2, 1.5),
      bollard: new T.CylinderGeometry(0.13, 0.13, 1.1, 14), cap: new T.CylinderGeometry(0.14, 0.14, 0.06, 14)
    };
    (function () { var uv = G.upright.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 6); })();

    /* ── the real items: a few parts each, every part an instanced mesh ── */
    /* ── print on the packs: drawn here, cached per item ── */
    function rtl(t) { return /[؀-ۿ]/.test(String(t)); }
    function text(g, t, x, y, px, color, weight, maxW, align) {
      g.fillStyle = color; g.font = (weight || 700) + ' ' + Math.round(px) + 'px Cairo, Arial, sans-serif';
      g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.direction = rtl(t) ? 'rtl' : 'ltr';
      g.fillText(String(t), x, y, maxW);
    }
    function barcode(g, seed, x, y, w, h) {
      var hsh = 7; for (var i = 0; i < seed.length; i++) hsh = (hsh * 31 + seed.charCodeAt(i)) >>> 0;
      g.fillStyle = '#111'; var cx = x;
      while (cx < x + w - 2) { var bw = 1 + (hsh % 3); hsh = (hsh * 1103515245 + 12345) >>> 0; if (hsh % 5) g.fillRect(cx, y, bw, h); cx += bw + 1 + (hsh % 2); }
    }
    function shade(c, k) { var r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255; return hex((Math.round(r * k) << 16) | (Math.round(gg * k) << 8) | Math.round(b * k)); }
    function mat(tex, o) { var m = new T.MeshStandardMaterial({ map: tex, roughness: o && o.r != null ? o.r : 0.6, metalness: o && o.m || 0 }); if (o && o.double) m.side = T.DoubleSide; return m; }
    var NONE = new T.MeshBasicMaterial({ visible: false });
    /* a ream: wrapped in printed paper, size + weight on the front, the wrapper folded at the ends */
    function reamMats(p) {
      var c = tintOf(p), sp = specOf(p), nm = shortName(p);
      return once('ream' + c + nm, function () {
        var front = canvasTex(256, 64, function (g, w, h) {
          g.fillStyle = '#F7F4EC'; g.fillRect(0, 0, w, h);
          g.fillStyle = hex(c); g.fillRect(0, h * 0.62, w, h * 0.38);
          g.fillStyle = shade(c, 0.75); g.fillRect(0, h * 0.62, w, 3);
          text(g, sp.size || 'A4', w * 0.13, h * 0.32, h * 0.46, shade(c, 0.6), 900);
          if (sp.gsm) text(g, sp.gsm, w * 0.3, h * 0.36, h * 0.26, '#555', 800);
          text(g, nm, w * 0.66, h * 0.3, h * 0.24, '#333', 700, w * 0.6);
          text(g, '500 SHEETS', w * 0.5, h * 0.82, h * 0.2, 'rgba(255,255,255,.92)', 800);
        });
        var end = canvasTex(64, 64, function (g, w, h) {
          g.fillStyle = '#EFEBE2'; g.fillRect(0, 0, w, h);
          g.fillStyle = hex(c); g.fillRect(0, h * 0.62, w, h * 0.38);
          g.strokeStyle = 'rgba(90,80,60,.35)'; g.lineWidth = 2;                 // the folds of the wrapper
          g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.32, h * 0.5); g.lineTo(0, h); g.moveTo(w, 0); g.lineTo(w * 0.68, h * 0.5); g.lineTo(w, h); g.moveTo(w * 0.32, h * 0.5); g.lineTo(w * 0.68, h * 0.5); g.stroke();
          g.fillStyle = 'rgba(0,0,0,.06)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.32, h * 0.5); g.lineTo(0, h); g.fill();
        });
        var top = canvasTex(256, 128, function (g, w, h) {
          g.fillStyle = '#F8F5EE'; g.fillRect(0, 0, w, h);
          g.fillStyle = hex(c); g.fillRect(0, h * 0.4, w, h * 0.22);
          text(g, nm, w / 2, h * 0.2, h * 0.15, '#333', 800, w * 0.9);
          text(g, (sp.size || '') + (sp.gsm ? '  ·  ' + sp.gsm : ''), w / 2, h * 0.51, h * 0.15, '#fff', 900, w * 0.9);
          g.strokeStyle = 'rgba(90,80,60,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.86); g.lineTo(w, h * 0.86); g.stroke();   // the seam
        });
        var f = mat(front, { r: 0.75 }), e = mat(end, { r: 0.75 }), t = mat(top, { r: 0.75 }), b = mat(end, { r: 0.9 });
        return [e, e, t, b, f, f];
      });
    }
    /* the opened ream: loose sheets, their edges showing */
    var SHEETS = null;
    function sheetMats() {
      if (SHEETS) return SHEETS;
      var edge = canvasTex(128, 64, function (g, w, h) { g.fillStyle = '#FBFAF6'; g.fillRect(0, 0, w, h); for (var y = 0; y < h; y += 2) { g.fillStyle = 'rgba(120,110,90,' + (0.08 + Math.random() * 0.12) + ')'; g.fillRect(0, y, w, 1); } });
      var top = canvasTex(64, 64, function (g, w, h) { var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#EEECE6'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      var e = mat(edge, { r: 0.85 }), t = mat(top, { r: 0.5 });
      SHEETS = [e, e, t, e, e, e];
      return SHEETS;
    }
    /* a box of paper / film: a printed body and a lid that sits over it */
    function boxMats(p, film) {
      var c = tintOf(p), sp = specOf(p), nm = shortName(p);
      return once('box' + (film ? 'f' : '') + c + nm, function () {
        var front = canvasTex(256, 64, function (g, w, h) {
          var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, film ? shade(c, 0.55) : '#FFFFFF'); gr.addColorStop(1, film ? shade(c, 0.8) : '#ECEAE4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
          if (!film) { g.fillStyle = hex(c); g.fillRect(0, h * 0.7, w, h * 0.3); g.beginPath(); g.moveTo(w * 0.62, h); g.lineTo(w * 0.78, 0); g.lineTo(w, 0); g.lineTo(w, h); g.fill(); }
          else { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, h * 0.78, w, 3); }
          text(g, nm, w * 0.36, h * 0.36, h * 0.3, film ? '#fff' : '#222', 800, w * 0.64);
          text(g, sp.size || (film ? 'X-RAY' : ''), w * 0.87, h * 0.42, h * 0.38, '#fff', 900, w * 0.24);
        });
        var side = canvasTex(64, 32, function (g, w, h) { g.fillStyle = film ? shade(c, 0.6) : hex(c); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, h * 0.7, w, 2); });
        var lidTop = canvasTex(256, 192, function (g, w, h) {
          g.fillStyle = film ? shade(c, 0.6) : '#FAFAF8'; g.fillRect(0, 0, w, h);
          g.fillStyle = film ? 'rgba(255,255,255,.14)' : hex(c); g.fillRect(0, h * 0.62, w, h * 0.38);
          if (film) { for (var i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.05 + i * 0.02) + ')'; g.fillRect(w * 0.06 + i * 10, h * 0.1, 6, h * 0.44); } }
          text(g, nm, w / 2, h * 0.26, h * 0.13, film ? '#fff' : '#222', 900, w * 0.86);
          text(g, film ? 'X-RAY FILM' + (sp.size ? '  ' + sp.size : '') : (sp.size || '') + (sp.gsm ? ' · ' + sp.gsm : '') + (sp.glossy ? ' · PHOTO' : ''), w / 2, h * 0.45, h * 0.11, film ? 'rgba(255,255,255,.9)' : shade(c, 0.6), 800, w * 0.86);
          text(g, film ? '100 SHEETS' : '', w / 2, h * 0.8, h * 0.1, '#fff', 800);
          barcode(g, nm, w * 0.7, h * 0.7, w * 0.24, h * 0.18);
        });
        var lidSide = canvasTex(64, 16, function (g, w, h) { g.fillStyle = film ? shade(c, 0.5) : shade(c, 0.85); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 2, w, 2); });
        var o = { r: sp.glossy ? 0.3 : 0.6 };
        var F = mat(front, o), Sd = mat(side, o), LT = mat(lidTop, o), LS = mat(lidSide, o);
        return { body: [Sd, Sd, Sd, Sd, F, F], lid: [LS, LS, LT, LS, LS, LS], tray: [mat(side, { r: 0.6, double: true }), mat(side, { r: 0.6, double: true }), NONE, mat(side, { r: 0.7, double: true }), mat(front, { r: 0.6, double: true }), mat(side, { r: 0.6, double: true })] };
      });
    }
    function rollMats() {
      return once('rollm', function () {
        var side = canvasTex(128, 64, function (g, w, h) { g.fillStyle = '#F5F2EA'; g.fillRect(0, 0, w, h); for (var i = 0; i < 40; i++) { g.fillStyle = 'rgba(150,140,120,.08)'; g.fillRect(0, Math.random() * h, w, 1); } });
        var end = canvasTex(128, 128, function (g, w, h) {
          g.fillStyle = '#F2EEE4'; g.fillRect(0, 0, w, h);
          for (var r = 62; r > 18; r -= 3) { g.strokeStyle = 'rgba(140,125,100,' + (0.1 + (r % 2) * 0.08) + ')'; g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.stroke(); }
          g.fillStyle = '#9C7A52'; g.beginPath(); g.arc(w / 2, h / 2, 18, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#3A2B1C'; g.beginPath(); g.arc(w / 2, h / 2, 12, 0, Math.PI * 2); g.fill();
        });
        return [mat(side, { r: 0.8 }), mat(end, { r: 0.8 }), mat(end, { r: 0.8 })];
      });
    }
    var M2 = {
      clear: new T.MeshStandardMaterial({ color: 0xEAF4FA, transparent: true, opacity: 0.24, roughness: 0.08, metalness: 0.1, depthWrite: false }),
      wrap: new T.MeshStandardMaterial({ color: 0xE6EEF2, transparent: true, opacity: 0.2, roughness: 0.12, metalness: 0.1, depthWrite: false }),
      bag: new T.MeshStandardMaterial({ color: 0xB8BEC6, transparent: true, opacity: 0.42, roughness: 0.32, metalness: 0.85, depthWrite: false }),
      foam: new T.MeshStandardMaterial({ color: 0x3C3F44, roughness: 0.95 }),
      plastic: new T.MeshStandardMaterial({ color: 0xEDE6D6, roughness: 0.5 }),
      gray: new T.MeshStandardMaterial({ color: 0x6E747B, roughness: 0.45, metalness: 0.4 }),
      cable: new T.MeshStandardMaterial({ color: 0xC98A2B, roughness: 0.5 }),
      wire1: new T.MeshStandardMaterial({ color: 0xC62828, roughness: 0.5 }),
      wire2: new T.MeshStandardMaterial({ color: 0x1D1D1D, roughness: 0.5 }),
      cap1: new T.MeshStandardMaterial({ color: 0x2471A3, roughness: 0.5 }),
      foil: new T.MeshStandardMaterial({ color: 0xD9DDE2, roughness: 0.25, metalness: 0.95 }),
      sheet: new T.MeshStandardMaterial({ color: 0xFCFBF8, roughness: 0.45 }),
      bin: new T.MeshStandardMaterial({ color: 0x1F5FAE, roughness: 0.55, side: T.DoubleSide }),
      steel: new T.MeshStandardMaterial({ color: 0x9AA1A8, roughness: 0.3, metalness: 0.85 })
    };
    function bagMats(p) {
      var nm = shortName(p);
      return once('bag' + nm, function () {
        var top = canvasTex(128, 96, function (g, w, h) {
          var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#CED3D8'); gr.addColorStop(0.5, '#9EA5AD'); gr.addColorStop(1, '#C3C8CE'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
          g.fillStyle = '#FFFFFF'; g.fillRect(w * 0.12, h * 0.2, w * 0.76, h * 0.56);
          text(g, nm, w / 2, h * 0.32, h * 0.12, '#222', 800, w * 0.7); barcode(g, nm, w * 0.18, h * 0.44, w * 0.64, h * 0.26);
          g.fillStyle = '#E6B800'; g.fillRect(w * 0.12, h * 0.06, w * 0.18, h * 0.1);                 // the anti-static mark
        });
        var side = mat(canvasTex(16, 16, function (g, w, h) { g.fillStyle = '#A9B0B7'; g.fillRect(0, 0, w, h); }), { r: 0.3, m: 0.8 });
        return [side, side, mat(top, { r: 0.35, m: 0.35 }), side, side, side];
      });
    }
    function geo(key, fn) { return once('g_' + key, fn); }
    function box(w, h, d, x, y, z) { var b = new T.BoxGeometry(w, h, d); b.translate(x || 0, (y || 0) + h / 2, z || 0); return b; }
    function cyl(r, len, axis, x, y, z, seg) { var c = new T.CylinderGeometry(r, r, len, seg || 16); if (axis === 'x') c.rotateZ(Math.PI / 2); if (axis === 'z') c.rotateX(Math.PI / 2); c.translate(x || 0, y || 0, z || 0); return c; }
    function gearGeo(r, h, teeth) {
      var g = new T.CylinderGeometry(r, r, h, teeth * 2, 1), pos = g.attributes.position, v = new T.Vector3();
      for (var i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); var rr = Math.hypot(v.x, v.z); if (rr > r * 0.98) { var a = Math.atan2(v.z, v.x), k = Math.round((a / (Math.PI * 2)) * teeth * 2); var f = (k % 2 === 0) ? 1.12 : 0.9; pos.setXYZ(i, v.x * f, v.y, v.z * f); } }
      g.computeVertexNormals(); g.translate(0, h / 2, 0); return g;
    }
    function bottleParts(color) {
      return once('bp' + color, function () {
        var body = new T.CylinderGeometry(0.07, 0.07, 0.22, 18); body.translate(0, 0.11, 0);
        var shoulder = new T.CylinderGeometry(0.035, 0.07, 0.04, 18); shoulder.translate(0, 0.24, 0);
        var cap = new T.CylinderGeometry(0.03, 0.03, 0.05, 14); cap.translate(0, 0.285, 0);
        var label = new T.MeshStandardMaterial({ roughness: 0.45, map: canvasTex(128, 128, function (g, w, h) { g.fillStyle = hex(color); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(0, h * 0.34, w, h * 0.34); g.fillStyle = hex(color); g.fillRect(w * 0.08, h * 0.42, w * 0.18, h * 0.18); }) });
        var liquid = new T.MeshPhysicalMaterial({ color: color, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
        return [[body, label], [shoulder, liquid], [cap, M.dark]];
      });
    }
    /* every kind: its footprint on the shelf (x, z), height, how high it stacks, and its parts (geometry, material);
       «bin» kinds are small parts kept in blue bins; «variant» = the opened box / the opened ream */
    var KIND = {
      bottle: { fp: [0.17, 0.17], h: 0.31, stack: 1, parts: function (p) { return bottleParts(tintOf(p)); } },
      ream: { fp: [0.45, 0.33], h: 0.092, stack: 8, scaled: true,
        variant: function (i, n, p) { return i === n - 1 && lastFill(p, 'ream') < 1 ? 'loose' : ''; },
        parts: function (p, v) { return v === 'loose' ? [[geo('loose', function () { return box(0.41, 0.09, 0.29); }), sheetMats()]] : [[geo('ream', function () { return box(0.42, 0.09, 0.3); }), reamMats(p)]]; } },
      box: { fp: [0.5, 0.38], h: 0.152, stack: 6, scaled: true,
        variant: function (i, n) { return i === n - 1 && n > 1 ? 'open' : ''; },   // the one on top is opened
        parts: function (p, v) {
          var m = boxMats(p, false);
          if (v === 'open') return [[geo('tray', function () { return box(0.46, 0.11, 0.34); }), m.tray], [geo('traysheets', function () { return box(0.43, 0.085, 0.31, 0, 0.006); }), M2.sheet]];
          return [[geo('boxbody', function () { return box(0.46, 0.11, 0.34); }), m.body], [geo('boxlid', function () { return box(0.47, 0.045, 0.35, 0, 0.105); }), m.lid]];
        } },
      film: { fp: [0.48, 0.4], h: 0.102, stack: 8, scaled: true,
        variant: function (i, n) { return i === n - 1 && n > 1 ? 'open' : ''; },
        parts: function (p, v) {
          var m = boxMats(p, true);
          if (v === 'open') return [[geo('ftray', function () { return box(0.44, 0.075, 0.36); }), m.tray], [geo('ffoil', function () { return box(0.41, 0.055, 0.33, 0, 0.006); }), M2.foil]];
          return [[geo('fbody', function () { return box(0.44, 0.075, 0.36); }), m.body], [geo('flid', function () { return box(0.45, 0.03, 0.37, 0, 0.072); }), m.lid]];
        } },
      carton: { fp: [0.72, 0.58], h: 0.51, stack: 3, wrap: true, parts: function (p) { return [[geo('carton', function () { var b = G.carton.clone(); b.translate(0, 0.25, 0); return b; }), cartonMat(tintOf(p))]]; } },
      roll: { fp: [0.36, 0.36], h: 0.5, stack: 1, parts: function () {
        return [[geo('roll', function () { return cyl(0.16, 0.5, 'y', 0, 0.25, 0, 28); }), rollMats()], [geo('rollwrap', function () { return cyl(0.166, 0.505, 'y', 0, 0.2525, 0, 28); }), M2.wrap]];
      } },
      head: { big: 1.8, fp: [0.3, 0.23], h: 0.14, stack: 2, parts: function () {
        return [
          [geo('hfoam', function () { return box(0.25, 0.03, 0.19); }), M2.foam],
          [geo('hbody', function () { return box(0.17, 0.06, 0.11, -0.02, 0.03); }), M.dark],
          [geo('hplate', function () { return box(0.15, 0.008, 0.09, -0.02, 0.09); }), M.metal],
          [geo('hcable', function () { return box(0.05, 0.004, 0.1, 0.085, 0.03, 0.01); }), M2.cable],
          [geo('hconn', function () { return box(0.03, 0.02, 0.02, 0.085, 0.034, -0.045); }), M2.plastic],
          [geo('hblister', function () { return box(0.26, 0.13, 0.2); }), M2.clear]];
      } },
      roller: { fp: [1.4, 0.14], h: 0.11, stack: 3, parts: function () {
        return [
          [geo('rrub', function () { return cyl(0.05, 1.1, 'x', 0, 0.05, 0, 20); }), M.rubber],
          [geo('rshaft', function () { return cyl(0.012, 1.36, 'x', 0, 0.05); }), M.metal],
          [geo('rbear', function () { var a = cyl(0.026, 0.035, 'x', -0.6, 0.05), b = cyl(0.026, 0.035, 'x', 0.58, 0.05); return mergeTwo(a, b); }), M2.steel],
          [geo('rgear', function () { var gg = gearGeo(0.045, 0.02, 14); gg.rotateZ(Math.PI / 2); gg.translate(0.65, 0.05, 0); return gg; }), M2.plastic]];
      } },
      board: { big: 1.6, fp: [0.36, 0.29], h: 0.05, stack: 6, parts: function () {
        return [
          [geo('bpcb', function () { return box(0.3, 0.016, 0.22); }), M.pcb],
          [geo('bchip', function () { return box(0.07, 0.012, 0.07, -0.06, 0.016, -0.02); }), M.dark],
          [geo('bchip2', function () { return mergeTwo(box(0.035, 0.01, 0.025, 0.05, 0.016, 0.05), box(0.035, 0.01, 0.025, 0.05, 0.016, -0.06)); }), M.dark],
          [geo('bcaps', function () { return mergeTwo(cyl(0.011, 0.03, 'y', 0.1, 0.031, 0.02, 10), cyl(0.011, 0.03, 'y', 0.12, 0.031, -0.01, 10)); }), M2.cap1],
          [geo('bconn', function () { return box(0.09, 0.022, 0.025, 0.0, 0.016, 0.095); }), M2.plastic],
          [geo('bbag', function () { return box(0.34, 0.045, 0.26); }), M2.bag]];
      } },
      fuser: { fp: [1.0, 0.2], h: 0.15, stack: 3, parts: function () {
        return [
          [geo('fubody', function () { return box(0.92, 0.1, 0.14); }), M2.gray],
          [geo('furoll', function () { return cyl(0.032, 0.84, 'x', 0, 0.115, 0.03, 18); }), M2.steel],
          [geo('fuends', function () { return mergeTwo(box(0.05, 0.14, 0.15, -0.46), box(0.05, 0.14, 0.15, 0.46)); }), M.dark],
          [geo('fuconn', function () { return box(0.05, 0.03, 0.04, 0.4, 0.1, -0.04); }), M2.plastic]];
      } },
      belt: { big: 1.3, fp: [0.38, 0.2], h: 0.026, stack: 10, parts: function () {
        return [[geo('belt', function () { var t = new T.TorusGeometry(0.16, 0.011, 6, 40); t.rotateX(Math.PI / 2); t.scale(1, 1, 0.45); t.translate(0, 0.011, 0); return t; }), M.rubber]];
      } },
      gear: { big: 1.6, fp: [0.15, 0.15], h: 0.028, stack: 3, bin: true, parts: function () { return [[geo('gear', function () { return gearGeo(0.058, 0.026, 18); }), M2.plastic], [geo('gearhub', function () { return cyl(0.014, 0.03, 'y', 0, 0.015, 0, 10); }), M2.steel]]; } },
      sensor: { big: 1.9, fp: [0.1, 0.09], h: 0.04, stack: 3, bin: true, parts: function () {
        return [[geo('sbody', function () { return box(0.06, 0.032, 0.045); }), M.dark], [geo('swin', function () { return box(0.02, 0.006, 0.02, 0.012, 0.032); }), M2.clear],
          [geo('swire1', function () { return cyl(0.003, 0.06, 'x', -0.055, 0.01, 0.006, 6); }), M2.wire1], [geo('swire2', function () { return cyl(0.003, 0.06, 'x', -0.055, 0.01, -0.006, 6); }), M2.wire2]];
      } },
      cable: { big: 1.5, fp: [0.17, 0.17], h: 0.02, stack: 4, bin: true, parts: function () {
        return [[geo('cable', function () { var t = new T.TorusGeometry(0.06, 0.008, 6, 30); t.rotateX(Math.PI / 2); t.translate(0, 0.008, 0); return t; }), M2.plastic], [geo('cconn', function () { return box(0.035, 0.016, 0.02, 0.06, 0.002); }), M.dark]];
      } },
      motor: { big: 1.8, fp: [0.17, 0.12], h: 0.1, stack: 2, parts: function () {
        return [[geo('mbody', function () { return cyl(0.045, 0.09, 'x', 0, 0.046, 0, 18); }), M2.steel], [geo('mflange', function () { return box(0.012, 0.09, 0.09, 0.05, 0.001); }), M2.gray],
          [geo('mshaft', function () { return cyl(0.005, 0.04, 'x', 0.075, 0.046); }), M.metal], [geo('mpin', function () { var gg = gearGeo(0.014, 0.012, 10); gg.rotateZ(Math.PI / 2); gg.translate(0.09, 0.046, 0); return gg; }), M2.plastic]];
      } },
      pump: { big: 1.8, fp: [0.12, 0.1], h: 0.06, stack: 2, bin: true, parts: function () {
        return [[geo('pbody', function () { return box(0.08, 0.05, 0.06); }), M.dark], [geo('pnip', function () { return mergeTwo(cyl(0.006, 0.03, 'z', -0.02, 0.025, 0.04, 8), cyl(0.006, 0.03, 'z', 0.02, 0.025, 0.04, 8)); }), M2.clear]];
      } },
      damper: { big: 1.9, fp: [0.07, 0.07], h: 0.055, stack: 1, bin: true, parts: function (p) {
        return [[geo('dbody', function () { return box(0.04, 0.05, 0.03); }), M2.clear], [geo('dink', function () { return box(0.028, 0.03, 0.018, 0, 0.008); }), once('dink' + tintOf(p), function () { return new T.MeshStandardMaterial({ color: tintOf(p), roughness: 0.3 }); })],
          [geo('dnip', function () { return cyl(0.006, 0.015, 'y', 0, 0.057, 0, 8); }), M2.plastic]];
      } },
      cap: { big: 1.7, fp: [0.15, 0.11], h: 0.045, stack: 2, bin: true, parts: function () {
        return [[geo('ctray', function () { return box(0.12, 0.025, 0.08); }), M2.gray], [geo('ccaps', function () { return mergeTwo(box(0.035, 0.018, 0.05, -0.025, 0.025), box(0.035, 0.018, 0.05, 0.025, 0.025)); }), M.rubber]];
      } },
      bag: { big: 1.4, fp: [0.3, 0.24], h: 0.042, stack: 8, parts: function (p) { return [[geo('bagbox', function () { return box(0.27, 0.04, 0.21); }), bagMats(p)]]; } }
    };
    function mergeMany(list) { return list.reduce(function (acc, g) { return acc ? mergeTwo(acc, g) : (g.index ? g.toNonIndexed() : g); }, null); }
    function mergeTwo(a, b) {                                                     // two simple shapes as one (non-indexed so groups stay simple)
      a = a.index ? a.toNonIndexed() : a; b = b.index ? b.toNonIndexed() : b;
      var g = new T.BufferGeometry();
      ['position', 'normal', 'uv'].forEach(function (k) { var x = a.attributes[k].array, y = b.attributes[k].array, z = new Float32Array(x.length + y.length); z.set(x); z.set(y, x.length); g.setAttribute(k, new T.BufferAttribute(z, a.attributes[k].itemSize)); });
      return g;
    }
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
      SHADOW = { l: -W / 2, r: W / 2, t: Dp / 2 + 4, b: -Dp / 2 - 4, c: new T.Vector3(0, 0, back + Dp / 2) };
    }
    /* close up the sun's shadow map covers only what you look at: sharp, soft-edged shadows between the items */
    var SHADOW = null, SUN_DIR = new T.Vector3(-16, 34, 18).normalize();
    function shadowFocus(c, half) {
      if (!SHADOW) return;
      var sc = sun.shadow.camera, def = !c;
      if (def) { c = SHADOW.c; sc.left = SHADOW.l; sc.right = SHADOW.r; sc.top = SHADOW.t; sc.bottom = SHADOW.b; }
      else { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; }
      sun.target.position.copy(c); sun.position.copy(c).addScaledVector(SUN_DIR, def ? 40 : 30); sun.target.updateMatrixWorld();
      sc.near = 1; sc.far = def ? 140 : 70; sc.updateProjectionMatrix();
      if (sun.shadow.map) sun.shadow.needsUpdate = true;
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
      order.forEach(function (b) {
        b.cut = zFocus !== null && b.z > zFocus + 0.5; b.g.visible = !b.cut; if (b.label) b.label.cut = b.cut;
        if (b.detail) b.detail.meshes.forEach(function (m) { m.visible = !b.cut && (b.detail.shown > 0 || !m.isInstancedMesh); });   // its real items too
      });
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
      assignLocations();
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
      if (bay.loc) makeTag(bay);
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
      order.forEach(function (b) { if (b.detail) { disposeDetail(b); b.inst.visible = b.shown > 0; if (b.label) { b.label.pos.set(b.x, 5.75, b.z + RACK_D / 2); b.label.below = false; } paintBay(b); } });
      appear = []; leaving = []; detailZone = null; labelsEl.classList.remove('zfocus'); clearPick();
    }
    /* where things sit on the 3 shelves of a bay: on the pallets, front row first, side by side, then up, then the rows
       behind; eye level first, then the floor, then the top */
    function slotsFor(d, max) {
      var fx = d.fp[0], fz = d.fp[1], nx = Math.max(1, Math.floor((BAY_W - 0.36) / fx)), nz = Math.max(1, Math.floor(1.12 / fz));
      var nst = Math.max(1, Math.min(d.stack, Math.floor(1.5 / d.h))), out = [], lvOrder = [1, 0, 2];
      for (var li = 0; li < 3 && out.length < max; li++) {
        var lv = lvOrder[li], base = LEVELS[lv] + (lv ? 0.1 : 0.02) + 0.145;
        for (var iz = 0; iz < nz && out.length < max; iz++) for (var is = 0; is < nst && out.length < max; is++) for (var ix = 0; ix < nx && out.length < max; ix++) {
          out.push([(ix - (nx - 1) / 2) * fx, base + is * d.h, 0.56 - fz / 2 - iz * fz, 1, lv]);
        }
      }
      return out;
    }
    var BIN = { fp: [0.47, 0.33], h: 0.15, stack: 1 }, BIN_IN = [0.42, 0.28, 0.13];
    /* everything that goes on a bay's shelves: the items (and the bins small parts sit in) */
    function planOf(b) {
      var p = b.p, kind = kindOf(p), K = KIND[kind], units = unitsOf(p, kind), sy = K.big || 1, sc = (K.scaled ? specOf(p).scale : 1) * sy;
      var d = { fp: [K.fp[0] * sc, K.fp[1] * sc], h: K.h * sy, stack: K.stack }, slots, bins = [];
      if (K.bin) {
        var nx = Math.max(1, Math.floor(BIN_IN[0] / d.fp[0])), nz = Math.max(1, Math.floor(BIN_IN[1] / d.fp[1])), ns = Math.max(1, Math.min(d.stack, Math.floor(BIN_IN[2] / d.h))), per = nx * nz * ns;
        bins = slotsFor(BIN, Math.ceil(Math.min(units, 2000) / per)); slots = [];
        bins.forEach(function (bn) { for (var is = 0; is < ns; is++) for (var iz = 0; iz < nz; iz++) for (var ix = 0; ix < nx; ix++) if (slots.length < units) slots.push([bn[0] + (ix - (nx - 1) / 2) * d.fp[0], bn[1] + 0.012 + is * d.h, bn[2] + (iz - (nz - 1) / 2) * d.fp[1], 1, bn[4]]); });
      } else slots = slotsFor(d, Math.min(units, 2000));
      var fill = lastFill(p, kind);
      if (fill < 1 && slots.length === units && slots.length) slots[slots.length - 1][3] = Math.max(0.12, fill);   // the opened ream is only that full
      return { kind: kind, K: K, units: units, slots: slots, bins: bins, sc: sc, sy: sy, fill: fill };
    }
    function instanced(geoM, n, b, list) {
      var im = new T.InstancedMesh(geoM[0], geoM[1], Math.max(1, n)); im.userData.sharedGeo = true; im.userData.sharedMat = true;
      im.castShadow = !weak && !geoM[1].transparent; im.receiveShadow = true; im.count = n; im.visible = n > 0 && !b.cut; im.frustumCulled = false;
      details.add(im); list.push(im); return im;
    }
    var m4a = new T.Matrix4(), qa = new T.Quaternion(), va = new T.Vector3(), sa = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
    function slotMatrix(b, s, i, e, lift, sc, sy) {
      qa.setFromAxisAngle(UP, ((i * 7919) % 11 - 5) * 0.01);
      va.set(b.x + s[0], s[1] + lift, b.z + s[2]); sa.set(sc * Math.max(0.001, e), Math.max(0.001, e) * s[3] * (sy || 1), sc * Math.max(0.001, e));
      return m4a.compose(va, qa, sa);
    }
    function buildBayDetail(b, idx, plan, from) {
      plan = plan || planOf(b);
      var K = plan.K, slots = plan.slots, meshes = [], sets = {}, where = [];
      slots.forEach(function (s, i) { var v = K.variant ? K.variant(i, slots.length, b.p) : ''; (sets[v] = sets[v] || []).push(i); where.push([v, sets[v].length - 1]); });
      var setList = Object.keys(sets).map(function (v) {
        var idxs = sets[v], ms = K.parts(b.p, v).map(function (pt) { return instanced(pt, idxs.length, b, meshes); });
        idxs.forEach(function (i, k) { var m = slotMatrix(b, slots[i], i, 1, 0, plan.sc, plan.sy); ms.forEach(function (im) { im.setMatrixAt(k, m); }); });
        ms.forEach(function (im) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); });
        return { v: v, idx: idxs, meshes: ms };
      });
      var setOf = {}; setList.forEach(function (st, k) { setOf[st.v] = k; });
      where = where.map(function (w) { return [setOf[w[0]], w[1]]; });
      if (plan.bins.length) {                                                     // small parts: blue bins, each with its label
        var bm = instanced([geo('bin', function () { return mergeMany([box(0.45, 0.012, 0.31), box(0.45, 0.14, 0.012, 0, 0, -0.149), box(0.012, 0.14, 0.31, -0.219), box(0.012, 0.14, 0.31, 0.219), box(0.45, 0.06, 0.012, 0, 0, 0.149)]); }), M2.bin], plan.bins.length, b, meshes);
        var lm = instanced([geo('binlabel', function () { var g = new T.PlaneGeometry(0.2, 0.05); g.translate(0, 0.032, 0.156); return g; }), binLabel(b.p)], plan.bins.length, b, meshes);
        plan.bins.forEach(function (bn, k) { var m = new T.Matrix4().makeTranslation(b.x + bn[0], bn[1], b.z + bn[2]); bm.setMatrixAt(k, m); lm.setMatrixAt(k, m); });
        bm.castShadow = !weak; bm.computeBoundingSphere(); lm.computeBoundingSphere();
      }
      if (K.wrap) wrapPallets(b, slots, plan.sc, meshes);
      b.detail = { kind: plan.kind, units: plan.units, shown: slots.length, over: plan.units > slots.length, slots: slots, meshes: meshes, sets: setList, where: where, sc: plan.sc, sy: plan.sy, fill: plan.fill };
      b.inst.visible = false;
      if (b.label) { b.label.pos.set(b.x, LEVELS[1] - 0.05, b.z + RACK_D / 2 + 0.1); b.label.below = true; }
      paintBay(b);
      if (!reduce) {
        if (from == null) appear.push({ b: b, t: -idx * 0.06, from: 0, stagger: Math.min(0.012, 0.5 / Math.max(1, slots.length)) });   // a light rise, bay after bay
        else if (slots.length > from) appear.push({ b: b, t: 0, from: from, stagger: Math.min(0.18, 2.4 / (slots.length - from)), one: true });   // came in: one by one
      }
      if (from != null || appear.length) appear.forEach(function (a) { if (a.b === b) stepAppearOne(a, 0); });
    }
    /* cartons on a pallet: shrink-wrapped, like a real warehouse */
    function wrapPallets(b, slots, sc, meshes) {
      var groups = {};
      slots.forEach(function (s) { var k = s[4] + (s[0] < 0 ? 'L' : 'R'); var g = groups[k] = groups[k] || { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9, n: 0 }; g.n++; g.x0 = Math.min(g.x0, s[0]); g.x1 = Math.max(g.x1, s[0]); g.z0 = Math.min(g.z0, s[2]); g.z1 = Math.max(g.z1, s[2]); g.y0 = Math.min(g.y0, s[1]); g.y1 = Math.max(g.y1, s[1]); });
      Object.keys(groups).forEach(function (k) {
        var g = groups[k]; if (g.n < 3) return;
        var w = g.x1 - g.x0 + KIND.carton.fp[0] * sc + 0.02, dd = g.z1 - g.z0 + KIND.carton.fp[1] * sc + 0.02, hh = g.y1 - g.y0 + KIND.carton.h + 0.02;
        var m = new T.Mesh(geo('wrapbox', function () { return box(1, 1, 1); }), M2.wrap); m.userData.sharedGeo = true; m.userData.sharedMat = true;
        m.scale.set(w, hh, dd); m.position.set(b.x + (g.x0 + g.x1) / 2, g.y0 - 0.01, b.z + (g.z0 + g.z1) / 2); m.visible = !b.cut; m.renderOrder = 2;
        details.add(m); meshes.push(m);
      });
    }
    function binLabel(p) {
      var nm = shortName(p);
      return once('binl' + nm, function () { return new T.MeshBasicMaterial({ map: canvasTex(128, 40, function (g, w, h) { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); text(g, nm, w / 2, h * 0.32, h * 0.32, '#1A1A1A', 800, w * 0.92); barcode(g, nm, w * 0.12, h * 0.58, w * 0.76, h * 0.32); }) }); });
    }
    function disposeDetail(b) { if (!b.detail) return; b.detail.meshes.forEach(function (m) { details.remove(m); if (m.isInstancedMesh) m.dispose(); }); b.detail = null; if (pick && pick.b === b) clearPick(); }
    /* a live change while you look close: what came in rises onto the shelf one by one, what went out lifts off one by one */
    var leaving = [];
    function refreshBayDetail(b, animate) {
      if (!b.detail) return;
      leaving = leaving.filter(function (l) { return l.b !== b; });
      appear = appear.filter(function (a) { return a.b !== b; });
      var old = b.detail.shown, plan = planOf(b);
      if (animate && !reduce && plan.slots.length < old) { leaving.push({ b: b, from: old, to: plan.slots.length, t: 0, plan: plan, stagger: Math.min(0.18, 2.4 / (old - plan.slots.length)) }); paintBay(b); return; }
      disposeDetail(b); buildBayDetail(b, 0, plan, animate ? old : plan.slots.length);
    }
    function setSlot(b, i, m) { var w = b.detail.where[i]; if (!w) return; b.detail.sets[w[0]].meshes.forEach(function (im) { im.setMatrixAt(w[1], m); im.instanceMatrix.needsUpdate = true; }); }
    function stepAppearOne(ap, dt) {
      ap.t += dt; var b = ap.b, n = b.detail ? b.detail.slots.length : 0, done = true;
      for (var i = ap.from; i < n; i++) {
        var tt = Math.max(0, Math.min(1, (ap.t - (i - ap.from) * ap.stagger) / (ap.one ? 0.4 : 0.35))), e = 1 - Math.pow(1 - tt, 3);
        if (tt < 1) done = false;
        setSlot(b, i, slotMatrix(b, b.detail.slots[i], i, e, (1 - e) * (ap.one ? 0.55 : 0.35), b.detail.sc, b.detail.sy));
      }
      return done;
    }
    function stepAppear(dt) {
      for (var a = appear.length - 1; a >= 0; a--) { var ap = appear[a]; if (!ap.b.detail || stepAppearOne(ap, dt)) appear.splice(a, 1); }
      for (var l = leaving.length - 1; l >= 0; l--) {
        var lv = leaving[l], b = lv.b; lv.t += dt;
        if (!b.detail) { leaving.splice(l, 1); continue; }
        var done = true;
        for (var k = 0; k < lv.from - lv.to; k++) {
          var i = lv.from - 1 - k, tt = Math.max(0, Math.min(1, (lv.t - k * lv.stagger) / 0.4)), e = tt * tt;
          if (tt < 1) done = false;
          setSlot(b, i, slotMatrix(b, b.detail.slots[i], i, 1 - e, e * 0.6, b.detail.sc, b.detail.sy));
        }
        if (done) { leaving.splice(l, 1); disposeDetail(b); buildBayDetail(b, 0, lv.plan, lv.to); }
      }
    }

    /* ── tap one item: it lights up and says which one it is ── */
    var pick = null, HI = new T.Color(1.55, 1.45, 1.2), WHITE = new T.Color(1, 1, 1);
    function pickItem(cx, cy) {
      var r = cv.getBoundingClientRect(), v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new T.Raycaster(); ray.setFromCamera(v, cam);
      var cands = [], owner = new Map();
      order.forEach(function (b) { if (b.detail && !b.cut) b.detail.sets.forEach(function (st, si) { st.meshes.forEach(function (m) { if (!m.material.transparent) { cands.push(m); owner.set(m, [b, si]); } }); }); });
      var hit = ray.intersectObjects(cands, false)[0]; if (!hit || hit.instanceId == null) return null;
      var o = owner.get(hit.object), st = o[0].detail.sets[o[1]];
      return { b: o[0], i: st.idx[hit.instanceId] };
    }
    function paintPick(on) { if (!pick || !pick.b.detail) return; var w = pick.b.detail.where[pick.i]; if (!w) return; pick.b.detail.sets[w[0]].meshes.forEach(function (m) { m.setColorAt(w[1], on ? HI : WHITE); m.instanceColor.needsUpdate = true; }); }
    function clearPick() { if (!pick) return; paintPick(false); if (pick.el) pick.el.remove(); pick = null; }
    function selectItem(b, i) {
      clearPick();
      var d = b.detail, s = d.slots[i], n = d.units, last = i === d.slots.length - 1 && d.fill < 1;
      pick = { b: b, i: i, pos: new T.Vector3(b.x + s[0], s[1] + KIND[d.kind].h * (d.sy || 1) * s[3] + 0.06, b.z + s[2]) };
      paintPick(true);
      var el = document.createElement('div'); el.className = 'axh-pick';
      el.innerHTML = '<b>' + KIND_ONE[d.kind] + ' ' + fmtN(i + 1) + ' من ' + fmtN(n) + '</b>' + (last ? '<span>مفتوح · ' + fmtN(Math.round(d.fill * (b.p.unit === 'ريم' ? 1 : 500) * 100) / 100) + (b.p.unit === 'ريم' ? ' ريم' : ' ورقة') + '</span>' : d.over ? '<span>ظاهر ' + fmtN(d.shown) + '</span>' : '');
      fxEl.appendChild(el); pick.el = el;
    }

    /* ── a location tag on every bay's beam: B-04 = line B (from the back), bay 4 (from the right) ── */
    function assignLocations() {
      var zs = []; order.forEach(function (b) { if (zs.indexOf(b.z) < 0) zs.push(b.z); }); zs.sort(function (a, c) { return a - c; });
      zs.forEach(function (z, li) { order.filter(function (b) { return b.z === z; }).sort(function (a, c) { return c.x - a.x; }).forEach(function (b, k) { b.loc = String.fromCharCode(65 + li) + '-' + String(k + 1).padStart(2, '0'); }); });
      order.forEach(makeTag);
    }
    function makeTag(b) {
      var st = stateOf(b.p);
      if (b.tag && b.tagKey === st + b.loc) return;
      var tex = canvasTex(256, 64, function (g, w, h) {
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
        g.fillStyle = st === 'out' ? '#E53935' : st === 'low' ? '#FB8C00' : '#2E7D32'; g.fillRect(0, 0, 10, h);
        text(g, b.loc, w * 0.2, h * 0.5, h * 0.5, '#111', 900);
        text(g, shortName(b.p), w * 0.66, h * 0.28, h * 0.24, '#222', 800, w * 0.6);
        barcode(g, b.loc + b.id, w * 0.4, h * 0.52, w * 0.52, h * 0.36);
      });
      if (!b.tag) { b.tag = new T.Mesh(new T.PlaneGeometry(0.62, 0.155), new T.MeshBasicMaterial({ map: tex })); b.tag.position.set(-0.95, LEVELS[1], RACK_D / 2 + 0.057); b.g.add(b.tag); }
      else { if (b.tag.material.map) b.tag.material.map.dispose(); b.tag.material.map = tex; b.tag.material.needsUpdate = true; }
      b.tagKey = st + b.loc;
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
    function applyEnd(ev) { var b = bays[ev.id]; if (!b) return; b.p = ev.p; setCount(b, ev.to); if (b.detail) refreshBayDetail(b, true); paintBay(b); makeTag(b); hud(); }
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
    function park(dt) {
      tmpV.set(dockPos.x - fk.g.position.x, 0, dockPos.z + 1.2 - fk.g.position.z);
      var d = tmpV.length(); if (d > 0.05) { var want = Math.atan2(tmpV.x, tmpV.z); fk.heading = turn(fk.heading, want, dt * 4); fk.g.position.addScaledVector(tmpV.normalize(), Math.min(d, dt * (reduce ? 1e3 : 6))); }
    }
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
        var added = layoutSig && list.filter(function (p) { return !known[p.id]; }), keep = view.mode !== 'all' ? { mode: view.mode, zone: view.zone, id: view.id, line: view.line } : null;
        layoutSig = sig; buildRacks(list);
        if (keep && order.some(function (b) { return b.zone === keep.zone; })) setView(keep.mode === 'bay' && !bays[keep.id] ? 'zone' : keep.mode, keep.zone, keep.mode === 'bay' && bays[keep.id] ? keep.id : null, true, keep.line); else setView('all', null, null, true);
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
    var view = { mode: 'all', zone: null, id: null, line: null };
    var yaw = 0, pitch = 0, zoom = 1, pan = 0, fitR = 30, drag = null, pinch = null;
    var camPos = new T.Vector3(0, 30, 30), camLook = new T.Vector3(), wantPos = new T.Vector3(), wantLook = new T.Vector3(), flyPos = new T.Vector3(), flyLook = new T.Vector3(), fly = 0, flyAt = 0;
    function fitCamera() {
      var w = host.clientWidth || 600, h = host.clientHeight || 340, asp = Math.max(0.6, w / h);
      var cW = L ? Math.max(6, L.cW) : 10, cD = L ? Math.max(3, L.cD) : 4;
      var vfov = cam.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * asp);
      fitR = Math.max((cW + 2.5) / Math.tan(hfov / 2), (cD + 3) / Math.tan(vfov / 2)) * (w < 600 ? 0.78 : 1.0);
    }
    function hfovHalf() { var w = host.clientWidth || 600, h = host.clientHeight || 340; return Math.atan(Math.tan(cam.fov * Math.PI / 360) * Math.max(0.5, w / h)); }
    /* a big zone can sit on more than one line of racks: the lines it uses, in layout order (its first bay's line first) */
    function zoneLines(zone) { var zs = []; order.forEach(function (b) { if (b.zone === zone && zs.indexOf(b.z) < 0) zs.push(b.z); }); return zs; }
    /* the part of a zone on one line of racks */
    function zoneSpan(zone, line) {
      if (line == null) line = zoneLines(zone)[0];
      var xs = []; order.forEach(function (b) { if (b.zone === zone && b.z === line) xs.push(b.x); });
      if (!xs.length) return null;
      var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
      return { cx: (lo + hi) / 2, half: (hi - lo) / 2 + BAY_W / 2, z: line, lo: lo, hi: hi };
    }
    function target(t) {
      var a = yaw + (reduce || drag || view.mode !== 'all' ? 0 : Math.sin(t * 0.00011) * 0.12);
      if (view.mode === 'all') {
        var r = fitR * zoom;
        wantPos.set(Math.sin(a) * r, r * (0.86 + pitch), Math.cos(a) * r + 2); wantLook.set(0, 1.0, -0.8);
      } else if (view.mode === 'zone') {
        var sp = zoneSpan(view.zone, view.line); if (!sp) return;
        var vis = Math.min(sp.half + 0.8, BAY_W * ((host.clientWidth || 600) < 600 ? 1.2 : 3.7));
        var d = Math.min(30, Math.max(6.5, vis / Math.tan(hfovHalf()))) * zoom, cx = sp.cx + pan;
        wantPos.set(cx + Math.sin(a) * d * 0.5, 2.8 + d * (0.2 + pitch), sp.z + RACK_D / 2 + d); wantLook.set(cx, 2.1, sp.z);
      } else {
        var b = bays[view.id]; if (!b) return;
        var phone = (host.clientWidth || 600) < 600;
        var dd = Math.max(3.4, (BAY_W / 2 + (phone ? -0.2 : 0.5)) / Math.tan(hfovHalf())) * zoom;   // the bay fills the width
        /* straight in front of the bay, at the height of its middle shelf (on a phone looking a little lower, so the shelf sits above the card) */
        wantPos.set(b.x + Math.sin(a) * dd * 0.6, phone ? 2.6 + dd * pitch : 3.2 + dd * (0.18 + pitch), b.z + RACK_D / 2 + dd); wantLook.set(b.x, phone ? 1.7 : 2.2, b.z);
      }
    }
    function setView(mode, zone, id, instant, line) {
      view.mode = mode; view.zone = zone || null; view.id = id || null; pan = 0; yaw = 0; pitch = 0; zoom = 1;
      var lines = view.zone ? zoneLines(view.zone) : [];
      view.line = mode === 'bay' && bays[view.id] ? bays[view.id].z : mode === 'zone' ? (lines.indexOf(line) >= 0 ? line : lines[0]) : null;
      if (mode === 'zone') {
        var sp0 = zoneSpan(view.zone, view.line);
        if (sp0 && (host.clientWidth || 600) < 600) { var fb = order.filter(function (b) { return b.zone === view.zone && b.z === sp0.z; }).sort(function (a, c) { return a.x - c.x; }), st0 = fb.find(function (b) { return N(b.p.quantity) > 0; }) || fb[0]; if (st0) pan = st0.x - sp0.cx; }
        else if (sp0) { var vis0 = Math.min(sp0.half + 0.8, BAY_W * 3.7); pan = Math.min(0, sp0.lo - BAY_W / 2 - 0.4 + vis0 - sp0.cx); }
      }
      flyPos.copy(camPos); flyLook.copy(camLook);
      if (mode === 'all') leaveDetail(); else enterDetail(view.zone);
      cutaway(mode === 'all' ? null : view.line);                                // every line in front of the one you look at steps aside
      if (mode === 'bay' && bays[view.id]) shadowFocus(new T.Vector3(bays[view.id].x, 2, bays[view.id].z), 4.5);
      else if (mode === 'zone') { var spz = zoneSpan(view.zone, view.line); shadowFocus(spz ? new T.Vector3(spz.cx, 2, spz.z) : null, spz ? spz.half + 3 : 0); }
      else shadowFocus(null);
      clearPick();
      chips();
      navEl.hidden = mode === 'all';
      navEl.querySelector('[data-a="prev"]').hidden = navEl.querySelector('[data-a="next"]').hidden = !(mode === 'bay' || (mode === 'zone' && lines.length > 1));
      navEl.querySelector('.axh-back span').textContent = mode === 'bay' ? (ZONES.find(function (z) { return z.key === view.zone; }) || {}).title || 'القسم' : 'كل المخزن';
      tipEl.textContent = mode === 'all' ? 'اسحب عشان تلف · دوس على قسم أو رف' : mode === 'zone' ? (lines.length > 1 ? 'دوس على أي رف · ‹ › باقي القسم' : 'دوس على أي رف عشان تقرّب منه') : '‹ › للرف اللي جنبه';
      host.classList.toggle('axh-close', mode !== 'all'); host.classList.toggle('axh-bay', mode === 'bay');
      fly = instant ? 1 : 0; flyAt = performance.now();
      if (mode !== 'bay') closeCard();
    }
    function focusBay(id) {
      var b = bays[id]; if (!b) return;
      setView('bay', b.zone, id); openCard(b);
    }
    function neighbor(dir) {
      if (view.mode === 'zone') { var ls = zoneLines(view.zone), k = ls.indexOf(view.line); if (ls.length > 1) setView('zone', view.zone, null, false, ls[(k + dir + ls.length) % ls.length]); return; }
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
      if (view.mode === 'zone') { var sp = zoneSpan(view.zone, view.line) || { half: 0 }; pan = Math.max(-sp.half, Math.min(sp.half, drag.pan - dx * 0.03)); pitch = Math.max(-0.2, Math.min(0.5, drag.pitch + dy * 0.003)); }
      else { yaw = Math.max(-0.85, Math.min(0.85, drag.yaw - dx * 0.005)); pitch = Math.max(view.mode === 'bay' ? -0.15 : -0.35, Math.min(0.5, drag.pitch + dy * 0.003)); }
    });
    window.addEventListener('pointerup', function (e) {
      if (drag && !drag.moved && !pinch && e.target === cv) {
        var it = view.mode !== 'all' ? pickItem(e.clientX, e.clientY) : null;
        if (it) { if (view.mode !== 'bay' || view.id !== it.b.id) focusBay(it.b.id); else openCard(it.b, true); selectItem(it.b, it.i); drag = null; return; }
        var b = pickAt(e.clientX, e.clientY);
        if (b) { if (view.mode === 'bay' && view.id === b.id) openCard(b); else focusBay(b.id); }
        else if (view.mode === 'bay') { closeCard(); clearPick(); }
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
        (b.loc ? '<small class="axh-loc">📍 مكانه في الهانجر: <b>' + b.loc + '</b></small>' : '') +
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
    /* 🔍 find an item: type, tap, the camera flies to its bay */
    var findEl = host.querySelector('.axh-find'), findIn = findEl.querySelector('input'), findRes = findEl.querySelector('.axh-fr');
    function norm(t) { t = String(t || '').toLowerCase(); return typeof normalizeArabic === 'function' ? normalizeArabic(t) : t; }
    function toggleFind(on) {
      if (on === undefined) on = findEl.hidden;
      findEl.hidden = !on; host.classList.toggle('axh-finding', on);
      if (on) { findIn.value = ''; runFind(); setTimeout(function () { try { findIn.focus(); } catch (x) {} }, 30); }
    }
    function runFind() {
      var q = norm(findIn.value).trim(), list = order.filter(function (b) { return !q || norm(b.p.name).indexOf(q) >= 0 || norm(b.p.type).indexOf(q) >= 0 || (b.loc && b.loc.toLowerCase() === q); });
      findRes.innerHTML = list.slice(0, 7).map(function (b) { var z = ZONES.find(function (zz) { return zz.key === b.zone; }); return '<button type="button" data-a="go" data-id="' + esc(b.id) + '"><b>' + esc(b.p.name) + '</b><span>' + (b.state === 'out' ? 'خلص' : fmtN(b.p.quantity) + ' ' + esc(b.p.unit || '')) + ' · ' + (z ? z.title : '') + ' · ' + b.loc + '</span></button>'; }).join('') || '<em>مفيش صنف بالاسم ده</em>';
    }
    findIn.addEventListener('input', runFind);
    findIn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); toggleFind(false); }
      if (e.key === 'Enter') { var f = findRes.querySelector('[data-a="go"]'); if (f) { e.preventDefault(); toggleFind(false); focusBay(f.getAttribute('data-id')); } }
    });
    function closeCard() { card.hidden = true; cardId = null; order.forEach(function (x) { x.sel = false; }); }
    host.addEventListener('click', function (e) {
      var z = e.target.closest && e.target.closest('[data-zone]');
      if (z && (z.closest('.axh-zones') || z.classList.contains('axh-zone'))) { var key = z.getAttribute('data-zone'); if (!key) setView('all'); else setView('zone', key); return; }
      var t = e.target.closest && e.target.closest('[data-a]'); if (!t) return;
      var a = t.getAttribute('data-a'), id = cardId;
      if (a === 'cx') { clearPick(); return closeCard(); }
      if (a === 'find') return toggleFind();
      if (a === 'go') { toggleFind(false); return focusBay(t.getAttribute('data-id')); }
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
      if (job) stepJob(dt); else if (view.mode !== 'all') park(dt); else if (!reduce) patrol(dt);   // up close it waits by the door, out of the way
      wk.visible = view.mode === 'all';
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
      if (fly < 1) { fly = Math.min(1, (performance.now() - flyAt) / (reduce ? 1 : 1000)); /* by the clock: a slow device arrives on time too */ var e = fly < 0.5 ? 4 * fly * fly * fly : 1 - Math.pow(-2 * fly + 2, 3) / 2; camPos.copy(flyPos).lerp(wantPos, e); camLook.copy(flyLook).lerp(wantLook, e); }
      else { camPos.lerp(wantPos, Math.min(1, dt * 8)); camLook.lerp(wantLook, Math.min(1, dt * 8)); }
      cam.position.copy(camPos); cam.lookAt(camLook);
      renderer.render(scene, cam);
      var w = host.clientWidth, h = host.clientHeight;
      labelItems.forEach(function (l) {
        if (!l.el) return; v3.copy(l.pos).project(cam);
        if (l.cut || (view.mode === 'bay' && l.bay && l.bay.id === view.id) || v3.z > 1 || v3.x < -1.2 || v3.x > 1.2 || v3.y > 1.3) { l.el.style.display = 'none'; return; }
        var lx = (v3.x + 1) / 2 * w; if (l.zone) lx = Math.max(46, Math.min(w - 46, lx));
        l.el.style.display = ''; l.el.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ((1 - v3.y) / 2 * h).toFixed(1) + 'px) translate(-50%,' + (l.below ? '0' : '-100%') + ')';   // close up: under the shelf, not over the items
      });
      if (pick && pick.el) { v3.copy(pick.pos).project(cam); pick.el.style.transform = 'translate(' + Math.max(70, Math.min(w - 70, (v3.x + 1) / 2 * w)).toFixed(1) + 'px,' + ((1 - v3.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-100%)'; pick.el.style.display = v3.z > 1 ? 'none' : ''; }
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
      itemScreen: function (id, i) {                                             // where item i of a bay is on the screen (tests)
        var b = bays[id]; if (!b || !b.detail || !b.detail.slots[i]) return null;
        var s = b.detail.slots[i], r = cv.getBoundingClientRect(), pp = new T.Vector3(b.x + s[0], s[1] + KIND[b.detail.kind].h * (b.detail.sy || 1) * s[3] * 0.5, b.z + s[2] + KIND[b.detail.kind].fp[1] * b.detail.sc * 0.45).project(cam);
        return { x: r.left + (pp.x + 1) / 2 * r.width, y: r.top + (1 - pp.y) / 2 * r.height };
      },
      state: function () {
        var o = {};
        order.forEach(function (b) { o[b.id] = { shown: b.shown, state: b.state, cap: b.cap, zone: b.zone, kind: kindOf(b.p), units: unitsOf(b.p, kindOf(b.p)), detail: b.detail ? b.detail.shown : null, z: b.z, cut: !!b.cut, loc: b.loc, fill: b.detail ? b.detail.fill : null, bins: b.detail ? b.detail.meshes.filter(function (m) { return m.geometry === cache.g_bin; }).reduce(function (a, m) { return a + m.count; }, 0) : 0, drawn: b.g.visible && (!b.detail || b.detail.meshes.some(function (m) { return m.visible; })) }; });
        return { bays: o, queue: queue.length, busy: !!job, ribbon: ribbon.textContent, view: { mode: view.mode, zone: view.zone, id: view.id, line: view.line, lines: view.zone ? zoneLines(view.zone).length : 0 }, flying: fly < 1, appearing: appear.length, leaving: leaving.length, gl: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, cam: [cam.position.x, cam.position.y, cam.position.z, camLook.x, camLook.y, camLook.z, host.clientWidth, host.clientHeight].map(function (v) { return Math.round(v * 100) / 100; }) }, pick: pick ? { id: pick.b.id, i: pick.i, text: pick.el ? pick.el.textContent : '' } : null };
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
    itemScreen: function (id, i) { return S.eng ? S.eng.itemScreen(id, i) : null; }, specOf: specOf,
    ready: function () { return S.booting ? S.booting.then(function () { return !!S.eng; }) : Promise.resolve(!!S.eng); }
  };
})();

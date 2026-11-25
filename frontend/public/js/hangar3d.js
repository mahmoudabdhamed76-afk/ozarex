/* ════════════════════════════════════════════════════════════════════
   ERP · «المخزن ثري دي» (5.08) — a live 3D hangar at the top of «المخازن»
   ─────────────────────────────────────────────────────────────────────
   · every item has its own bay on a rack, in its zone (ورق وأفلام · أحبار · قطع غيار · أصناف تانية)
   · the cartons on a bay = the real quantity: sheets ÷ 1000, reams ÷ 5, kilos / meters ÷ 10,
     and a box / carton / piece / cartridge / film … = one carton
   · LIVE: any change to the stock — a supply to a center, a purchase, «حركة مخزن», «مستهلكات», a return,
     a stock count, a branch transfer, a new / edited / deleted item, or a change another user made on
     their own device (live sync) — plays in the hangar: the forklift goes to the bay, picks the cartons up
     and takes them out through the loading door, or brings them in from the truck and puts them on the shelf;
     a «+5» / «−3» floats over the bay and the event is written on the ribbon
   · an item about to run out glows amber, an item at zero glows red with an empty bay and «خلص»
   · tap a bay → its card: quantity, cartons, last move + «وارد» «منصرف» «مستهلكات» «تعديل»
   · drag to turn, wheel / pinch to zoom; ⤢ makes it taller; ✕ hides it (remembered on this device)
   · fast: three.js is loaded only when «المخازن» opens (vendor/three.module.min.js, kept by the service
     worker for offline), it draws only while on screen, stops on other pages and in a hidden tab, idles at
     30 fps, keeps the cartons of a bay in one instanced mesh, lowers quality on weak phones, and a phone
     that asks for less motion gets the changes without the driving. No WebGL → the page is just as before.
   Hook: renderInventory() calls AXHangar.attach(root) — one line; nothing else in the page changes.
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

  /* ── what an item is, and how many cartons it makes ── */
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
  function tintOf(p) {
    var n = String((p.name || '') + ' ' + (p.type || '')).toLowerCase();
    if (/blue|أزرق|ازرق|cyan|سيان/.test(n)) return 0x2F7DE1;
    if (/red|أحمر|احمر|magenta|ماجنتا/.test(n)) return 0xE0353B;
    if (/yellow|أصفر|اصفر/.test(n)) return 0xF2C230;
    if (/green|أخضر|اخضر/.test(n) && !/green ?tec/.test(n)) return 0x27AE60;
    if (/black|أسود|اسود/.test(n)) return 0x2B2B2B;
    if (/vivid|photo|فوتو|glossy|لامع/.test(n)) return 0x8E44AD;
    if (/film|فيلم/.test(n)) return 0x16A085;
    var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return [0xC0392B, 0xD35400, 0x2980B9, 0x8E44AD, 0x16A085, 0xB7950B][h % 6];
  }
  function stateOf(p) { var q = N(p.quantity), m = N(p.minQuantity); return q <= 0 ? 'out' : (m > 0 && q <= m) ? 'low' : 'ok'; }

  /* ── why did the quantity of an item change? (the newest move / supply of that item) ── */
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
      '<div class="axh-ribbon" aria-live="polite"></div><div class="axh-card" hidden></div>' +
      '<div class="axh-tip">اسحب عشان تلف · دوس على أي رف</div>';
    var cv = host.querySelector('.axh-cv'), labelsEl = host.querySelector('.axh-labels'), fxEl = host.querySelector('.axh-fx'),
      kEl = host.querySelector('.axh-k'), ribbon = host.querySelector('.axh-ribbon'), card = host.querySelector('.axh-card');

    var renderer = new T.WebGLRenderer({ canvas: cv, antialias: !weak, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, weak ? 1.25 : 1.75));
    renderer.shadowMap.enabled = !weak; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
    var scene = new T.Scene();
    scene.background = new T.Color(0x1A1412);
    scene.fog = new T.Fog(0x1A1412, 60, 130);
    var cam = new T.PerspectiveCamera(38, 1, 0.5, 260);

    /* light — warm hangar lamps */
    scene.add(new T.HemisphereLight(0xFFF0DA, 0x3A2E26, 1.35));
    var fill = new T.DirectionalLight(0xFFF3E0, 0.9); fill.position.set(4, 14, 30); scene.add(fill);
    var sun = new T.DirectionalLight(0xFFD7A0, 1.6); sun.position.set(-14, 26, 16); sun.castShadow = !weak;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; scene.add(sun); scene.add(sun.target);

    /* shared materials + canvas textures (no image files) */
    function canvasTex(w, h, draw, rep) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
    var floorTex = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#6E6862'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) { var v = 90 + Math.random() * 40 | 0; g.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 8) + ',.18)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    }, [1, 1]);
    var wallTex = canvasTex(256, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, w, 0); for (var i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? '#4A3A33' : '#5C4A40'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, [1, 1]);
    var M = {
      floor: new T.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.02 }),
      wall: new T.MeshStandardMaterial({ map: wallTex, roughness: 0.8, metalness: 0.35 }),
      steel: new T.MeshStandardMaterial({ color: 0x2C2622, metalness: 0.7, roughness: 0.45 }),
      upright: new T.MeshStandardMaterial({ color: 0x3A3F45, metalness: 0.6, roughness: 0.4 }),
      beam: new T.MeshStandardMaterial({ color: 0xE8641E, metalness: 0.4, roughness: 0.45 }),
      deck: new T.MeshStandardMaterial({ color: 0x55504A, metalness: 0.5, roughness: 0.6 }),
      pallet: new T.MeshStandardMaterial({ color: 0x9C7448, roughness: 0.9 }),
      yellow: new T.MeshBasicMaterial({ color: 0xF2B705 }),
      door: new T.MeshStandardMaterial({ color: 0x8A2B22, roughness: 0.6, metalness: 0.3 }),
      lamp: new T.MeshStandardMaterial({ color: 0x222222, emissive: 0xFFC56E, emissiveIntensity: 2.2 }),
      slat: new T.MeshBasicMaterial({ color: 0x5C1C16 }),
      hit: new T.MeshBasicMaterial({ visible: false })
    };
    var cartonMats = {};
    function cartonMat(color, small) {
      var k = color + (small ? 's' : '');
      if (cartonMats[k]) return cartonMats[k];
      var tex = canvasTex(128, 128, function (g, w, h) {
        g.fillStyle = '#E2BE85'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < 300; i++) { g.fillStyle = 'rgba(120,80,40,.08)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); }
        g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, h * 0.62, w, h * (small ? 0.2 : 0.14));
        g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(w * 0.12, h * 0.18, w * 0.44, h * 0.16);
        g.strokeStyle = 'rgba(90,60,30,.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
        g.fillStyle = 'rgba(90,60,30,.35)'; g.fillRect(w * 0.47, 0, w * 0.06, h);
      });
      return (cartonMats[k] = new T.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    }
    var G = {
      carton: new T.BoxGeometry(0.68, 0.5, 0.54), small: new T.BoxGeometry(0.42, 0.36, 0.36),
      upright: new T.BoxGeometry(0.12, 5.6, 0.12), pallet: new T.BoxGeometry(1.35, 0.14, 1.15),
      beam: new T.BoxGeometry(3.1 - 0.12, 0.14, 0.1), deck: new T.BoxGeometry(3.1 - 0.2, 0.04, 1.5)
    };

    /* ── layout: each zone in pieces of ≤7 bays; pieces sit side by side on a line (≤9 bays, a bay's gap between
          zones), lines go back → front — so a few items make a wide hangar, many items add lines behind ── */
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

    /* ── the hangar shell, sized to the layout ── */
    var shell = new T.Group(); scene.add(shell);
    var racks = new T.Group(); scene.add(racks);
    var door = null, dockPos = new T.Vector3();
    function buildShell(L) {
      disposeGroup(shell);
      var W = L.halfW * 2 + 12, Dp = L.halfD * 2 + 10, back = -L.halfD - 5;
      floorTex.repeat.set(W / 4.4, (Dp + 60) / 4.4);
      var floor = new T.Mesh(new T.PlaneGeometry(W, Dp + 60), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.z = 30 + back + Dp / 2 - Dp / 2; floor.position.z = back + (Dp + 60) / 2; floor.receiveShadow = true; shell.add(floor);
      wallTex.repeat.set(W / 3, 1);
      var bw = new T.Mesh(new T.PlaneGeometry(W, 14), M.wall); bw.position.set(0, 7, back); bw.receiveShadow = true; shell.add(bw);
      [-1, 1].forEach(function (s) { var w = new T.Mesh(new T.PlaneGeometry(Dp, 14), M.wall); w.position.set(s * W / 2, 7, back + Dp / 2); w.rotation.y = -s * Math.PI / 2; shell.add(w); });
      for (var tx = -W / 2 + 4; tx <= W / 2 - 3; tx += 6) {
        var curve = new T.QuadraticBezierCurve3(new T.Vector3(tx, 12, back), new T.Vector3(tx, 17, back + Dp / 2), new T.Vector3(tx, 12, back + Dp));
        shell.add(new T.Mesh(new T.TubeGeometry(curve, 20, 0.12, 6), M.steel));
        var lamp = new T.Mesh(new T.CylinderGeometry(0.5, 0.7, 0.3, 14), M.lamp); lamp.position.set(tx, 11.2, back + Dp * 0.4); shell.add(lamp);
      }
      /* the loading door + a truck behind it */
      var dx = -L.halfW + 2.5;
      door = new T.Mesh(new T.PlaneGeometry(6, 6), M.door); door.position.set(dx, 3, back + 0.03); shell.add(door);
      door.geometry.translate(0, -3, 0); door.position.y = 6;                 // hinge at the top: it rolls up
      for (var i = 0; i < 10; i++) { var ln = new T.Mesh(new T.PlaneGeometry(6, 0.05), M.slat); ln.position.set(0, -6 + 0.4 + i * 0.58, 0.01); door.add(ln); }
      var truck = new T.Group(); truck.position.set(dx, 0, back - 4.2); shell.add(truck);
      var box = new T.Mesh(new T.BoxGeometry(5.4, 4.6, 7), new T.MeshStandardMaterial({ color: 0xEDE7E0, roughness: 0.6 })); box.position.y = 3.1; truck.add(box);
      var stripe = new T.Mesh(new T.BoxGeometry(5.45, 0.5, 7.05), new T.MeshStandardMaterial({ color: 0xC62828 })); stripe.position.y = 2.2; truck.add(stripe);
      dockPos.set(dx, 0, back + 2.6);
      /* aisle lines */
      var zs = {}; L.rows.forEach(function (r) { if (zs[r.z]) return; zs[r.z] = 1; var l = new T.Mesh(new T.PlaneGeometry(L.halfW * 2 - 2, 0.16), M.yellow); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.012, r.z + RACK_D / 2 + 2.3); shell.add(l); });
      var sc = sun.shadow.camera; sc.left = -W / 2; sc.right = W / 2; sc.top = Dp / 2 + 4; sc.bottom = -Dp / 2 - 4; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix();
      sun.position.set(-14, 30, back + Dp / 2 + 16); sun.target.position.set(0, 0, back + Dp / 2);
    }
    function disposeGroup(g) {
      var keepG = Object.values(G), keepM = Object.values(M);
      g.traverse(function (o) {
        if (o.geometry && keepG.indexOf(o.geometry) < 0) o.geometry.dispose();
        if (o.material && keepM.indexOf(o.material) < 0 && Object.values(cartonMats).indexOf(o.material) < 0) o.material.dispose();
        if (o.isInstancedMesh) o.dispose();
      });
      while (g.children.length) g.remove(g.children[0]);
    }

    /* ── racks + bays ── */
    var bays = {}, picks = [], labelItems = [], L = null;
    function bayCapacity(small) { return (small ? 3 * 3 * 4 : 2 * 2 * 3) * 2 * LEVELS.length; }
    var STATIC;                                           // all uprights / beams / decks / pallets of the hangar → 4 instanced meshes
    function staticPut(kind, x, y, z) { var m = new T.Matrix4(); m.makeTranslation(x, y, z); STATIC[kind].push(m); }
    function staticBuild() {
      [['upright', G.upright, M.upright, true, false], ['beam', G.beam, M.beam, true, false], ['deck', G.deck, M.deck, false, true], ['pallet', G.pallet, M.pallet, true, false]].forEach(function (k) {
        var list = STATIC[k[0]]; if (!list.length) return;
        var im = new T.InstancedMesh(k[1], k[2], list.length); list.forEach(function (m, i) { im.setMatrixAt(i, m); });
        im.castShadow = k[3]; im.receiveShadow = k[4] || true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); racks.add(im);
      });
    }
    function buildRacks(products) {
      disposeGroup(racks); bays = {}; picks = []; labelItems = [];
      STATIC = { upright: [], beam: [], deck: [], pallet: [] };
      L = layout(products);
      buildShell(L);
      L.rows.forEach(function (row) {
        var n = row.items.length, x0 = row.x0;
        if (row.first) labelItems.push({ zone: 1, pos: new T.Vector3(x0 - BAY_W / 2 - 0.4, 6.9, row.z), html: '<div class="axh-zone" style="--c:' + row.zone.color + '">' + row.zone.title + '</div>' });
        for (var i = 0; i <= n; i++) [0, RACK_D].forEach(function (dz) { staticPut('upright', x0 + i * BAY_W - BAY_W / 2, 2.8, row.z + dz - RACK_D / 2); });
        row.items.forEach(function (p, i) { makeBay(p, x0 + i * BAY_W, row.z, row.zone.key !== 'paper'); });
      });
      staticBuild();
      labelsEl.innerHTML = labelItems.map(function (l, i) { return '<div class="axh-l' + (l.zone ? ' z' : '') + (l.bay && l.bay.state !== 'ok' ? ' axh-al' : '') + '" data-i="' + i + '"' + (l.bay ? ' data-id="' + esc(l.bay.id) + '"' : '') + '>' + l.html + '</div>'; }).join('');
      labelItems.forEach(function (l, i) { l.el = labelsEl.children[i]; if (l.bay) l.bay.label = l; });
      fitCamera();
      hud();
    }
    function makeBay(p, cx, cz, small) {
      var bay = { p: p, id: p.id, g: new T.Group(), small: small, cap: bayCapacity(small), front: new T.Vector3(cx, 0, cz + RACK_D / 2 + 2.3), shown: 0 };
      bay.g.position.set(cx, 0, cz); racks.add(bay.g);
      LEVELS.forEach(function (y, li) {
        [-RACK_D / 2, RACK_D / 2].forEach(function (dz) { staticPut('beam', cx, y, cz + dz); });
        if (li) staticPut('deck', cx, y + 0.06, cz);
      });
      /* every carton slot, filled bottom → top: the bay shows the first «count» of them */
      var per = small ? [3, 3, 4] : [2, 2, 3], gx = small ? 0.44 : 0.7, gy = small ? 0.37 : 0.51, gz = small ? 0.38 : 0.56;
      var inst = new T.InstancedMesh(small ? G.small : G.carton, cartonMat(tintOf(p), small), bay.cap);
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
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; bay.g.add(glow); bay.glow = glow;
      var hit = new T.Mesh(new T.BoxGeometry(BAY_W, 5.4, RACK_D + 0.4), M.hit); hit.position.y = 2.7; hit.userData.id = p.id; bay.g.add(hit); picks.push(hit);
      var lb = { bay: bay, pos: new T.Vector3(cx, 5.75, cz + RACK_D / 2), html: '' };
      labelItems.push(lb);
      bays[p.id] = bay;
      setCount(bay, cartonsOf(p));
      bay.label = lb; paintBay(bay);
    }
    function setCount(bay, n) {
      n = Math.max(0, Math.min(bay.cap, n)); bay.shown = n; bay.inst.count = n; bay.inst.visible = n > 0; bay.inst.instanceMatrix.needsUpdate = true;
    }
    function paintBay(bay) {
      var p = bay.p, st = stateOf(p), c = cartonsOf(p);
      bay.state = st;
      bay.glow.material.color.set(st === 'out' ? 0xFF3B30 : 0xFF9F1C);
      var html = '<div class="axh-lb ' + st + '"><b>' + esc(p.name) + '</b><span>' + (st === 'out' ? 'خلص' : fmtN(p.quantity) + ' ' + esc(p.unit || '') + (c > bay.cap ? ' +' : '')) + '</span></div>';
      if (bay.label) { bay.label.html = html; if (bay.label.el) { bay.label.el.innerHTML = html; bay.label.el.classList.toggle('axh-al', st !== 'ok'); } }
    }
    function hud() {
      var tot = 0, low = 0, out = 0;
      Object.keys(bays).forEach(function (k) { var b = bays[k]; tot += cartonsOf(b.p); if (b.state === 'low') low++; if (b.state === 'out') out++; });
      kEl.innerHTML = '<span>' + fmtN(tot) + ' كرتونة</span>' + (low ? '<span class="low">' + low + ' قربت تخلص</span>' : '') + (out ? '<span class="out">' + out + ' خلصت</span>' : '');
      host.setAttribute('aria-label', 'المخزن ثري دي: ' + fmtN(tot) + ' كرتونة' + (low ? '، ' + low + ' قربت تخلص' : '') + (out ? '، ' + out + ' خلصت' : ''));
    }

    /* ── forklift + worker ── */
    var fk = (function () {
      var g = new T.Group(), body = new T.MeshStandardMaterial({ color: 0xF2A71B, metalness: 0.3, roughness: 0.5 }), dark = new T.MeshStandardMaterial({ color: 0x1F1F1F, roughness: 0.7 });
      var b = new T.Mesh(new T.BoxGeometry(1.4, 0.9, 2.1), body); b.position.y = 0.75; b.castShadow = true; g.add(b);
      var cab = new T.Mesh(new T.BoxGeometry(1.3, 1.2, 1.0), new T.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.3, transparent: true, opacity: 0.55 })); cab.position.set(0, 1.8, -0.3); g.add(cab);
      var roof = new T.Mesh(new T.BoxGeometry(1.4, 0.08, 1.2), body); roof.position.set(0, 2.45, -0.3); g.add(roof);
      var mast = new T.Mesh(new T.BoxGeometry(1.1, 2.8, 0.12), dark); mast.position.set(0, 1.6, 1.1); g.add(mast);
      var carriage = new T.Group(); carriage.position.set(0, 0, 0); g.add(carriage);
      [-0.35, 0.35].forEach(function (x) { var f = new T.Mesh(new T.BoxGeometry(0.12, 0.06, 1.2), dark); f.position.set(x, 0.35, 1.7); carriage.add(f); });
      [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.7], [0.7, 0.7]].forEach(function (w) { var wh = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.25, 14), dark); wh.rotation.z = Math.PI / 2; wh.position.set(w[0], 0.32, w[1]); g.add(wh); });
      var load = new T.Group(); load.position.set(0, 0.48, 1.75); carriage.add(load);
      load.add(new T.Mesh(new T.BoxGeometry(1.2, 0.14, 1.1), M.pallet));
      var loadInst = new T.InstancedMesh(G.carton, cartonMat(0x2F7DE1, false), 8); var m4 = new T.Matrix4();
      for (var i = 0; i < 8; i++) { m4.makeTranslation((i % 2 ? 0.3 : -0.3), 0.32 + Math.floor(i / 4) * 0.5, (Math.floor(i / 2) % 2 ? 0.27 : -0.27)); loadInst.setMatrixAt(i, m4); }
      loadInst.castShadow = true; load.add(loadInst); load.visible = false;
      var beacon = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), new T.MeshStandardMaterial({ color: 0xFF8A00, emissive: 0xFF8A00, emissiveIntensity: 3 })); beacon.position.set(0, 2.6, -0.3); g.add(beacon);
      scene.add(g);
      return { g: g, carriage: carriage, load: load, loadInst: loadInst, beacon: beacon, heading: 0 };
    })();
    function setLoad(n, color) { fk.load.visible = n > 0; fk.loadInst.count = Math.max(1, Math.min(8, n)); fk.loadInst.material = cartonMat(color || 0x2F7DE1, false); }
    var wk = (function () {
      var g = new T.Group(), vest = new T.MeshStandardMaterial({ color: 0xFF7A00, roughness: 0.6 }), pants = new T.MeshStandardMaterial({ color: 0x2D3436 }), skin = new T.MeshStandardMaterial({ color: 0xC68B59 });
      var legs = new T.Mesh(new T.CapsuleGeometry(0.17, 0.6, 4, 8), pants); legs.position.y = 0.55; g.add(legs);
      var torso = new T.Mesh(new T.CapsuleGeometry(0.24, 0.45, 4, 8), vest); torso.position.y = 1.25; torso.castShadow = true; g.add(torso);
      var head = new T.Mesh(new T.SphereGeometry(0.17, 14, 10), skin); head.position.y = 1.8; g.add(head);
      var hat = new T.Mesh(new T.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xF2C230 })); hat.position.y = 1.85; g.add(hat);
      var box = new T.Mesh(new T.BoxGeometry(0.5, 0.36, 0.4), cartonMat(0xE0353B, false)); box.position.set(0, 1.3, 0.38); g.add(box);
      scene.add(g); return g;
    })();

    /* ── the forklift's jobs: idle patrol, or play a stock change ── */
    var queue = [], job = null, patrolT = 0;
    function enqueue(ev) {
      if (reduce || queue.length >= 3) { applyEnd(ev); flash(ev); return; }   // a burst (import, a big sync): the rest land at once
      queue.push(ev);
    }
    function applyEnd(ev) { var b = bays[ev.id]; if (!b) return; b.p = ev.p; setCount(b, ev.to); paintBay(b); hud(); }
    function startJob(ev) {
      var b = bays[ev.id]; if (!b) return null;
      var color = tintOf(ev.p), n = Math.max(1, Math.min(8, Math.abs(ev.to - ev.from) || 1));
      var inbound = ev.to > ev.from, steps = [];
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
      return { ev: ev, steps: steps, i: 0, t: 0 };
    }
    var doorOpen = 0, doorWant = 0, lift = 0, liftWant = 0;
    var tmpV = new T.Vector3();
    function stepJob(dt) {
      var s = job.steps[job.i];
      if (!s) { job = null; return; }
      if (s.door) doorWant = 1;
      if (s.go) {
        tmpV.subVectors(s.go, fk.g.position); tmpV.y = 0;
        var dist = tmpV.length(), speed = 10;
        if (dist < 0.15) { delete s.go; return; }
        var want = Math.atan2(tmpV.x, tmpV.z); fk.heading = turn(fk.heading, want, dt * 6);
        var mv = Math.min(dist, speed * dt * (Math.abs(angleDiff(fk.heading, want)) > 1 ? 0.25 : 1));
        fk.g.position.addScaledVector(tmpV.normalize(), mv);
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

    /* ── floating «+5 / −3» and the ribbon ── */
    var fxItems = [];
    function flash(ev) {
      var b = bays[ev.id]; if (!b) return;
      var d = N(ev.p.quantity) - N(ev.fromQty), unit = ev.p.unit || '';
      var el = document.createElement('div'); el.className = 'axh-pop ' + (d >= 0 ? 'in' : 'out');
      el.textContent = (d >= 0 ? '+' : '−') + fmtN(Math.abs(d)) + ' ' + unit; fxEl.appendChild(el);
      fxItems.push({ el: el, pos: b.g.position.clone().add(new T.Vector3(0, 6.6, RACK_D / 2)), t: 0 });
      b.pulse = 1.2;
    }
    var ribbonTimer = null;
    function ribbonSay(ev) {
      var r = ev.reason, d = N(ev.p.quantity) - N(ev.fromQty);
      ribbon.innerHTML = '<i>' + r.ic + '</i><span><b>' + esc(r.t) + '</b> · ' + esc(ev.p.name) + ' ' + (d >= 0 ? '+' : '−') + fmtN(Math.abs(d)) + ' ' + esc(ev.p.unit || '') + '</span>';
      ribbon.classList.add('show'); clearTimeout(ribbonTimer); ribbonTimer = setTimeout(function () { ribbon.classList.remove('show'); }, 5200);
    }

    /* ── watch the data: any change, from any path (this device or live sync) ── */
    var known = {}, layoutSig = '';
    function products() { return A('products').filter(function (p) { return p && p.id != null && !p.archived && !p.deleted; }); }
    function sigOf(list) { return list.map(function (p) { return p.id + '|' + p.name + '|' + zoneOf(p) + '|' + (p.unit || ''); }).sort().join('~'); }
    function sync(first, instant) {
      var list = products(), sig = sigOf(list);
      if (sig !== layoutSig) {                                        // items added / removed / renamed / moved zone → rebuild the racks
        var added = layoutSig && list.filter(function (p) { return !known[p.id]; });
        layoutSig = sig; buildRacks(list);
        if (added && added.length) { ribbon.innerHTML = '<i>✨</i><span><b>صنف جديد</b> · ' + esc(added.map(function (p) { return p.name; }).join('، ')) + '</span>'; ribbon.classList.add('show'); clearTimeout(ribbonTimer); ribbonTimer = setTimeout(function () { ribbon.classList.remove('show'); }, 5200); }
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
          if (first || instant) applyEnd(ev); else if (from === to) { applyEnd(ev); flash(ev); ribbonSay(ev); } else enqueue(ev);
        } else if (k.min !== N(p.minQuantity) && bays[p.id]) { k.min = N(p.minQuantity); bays[p.id].p = p; paintBay(bays[p.id]); hud(); }
      });
    }

    /* ── camera: fits the hangar; drag to turn, wheel / pinch to zoom ── */
    var yaw = 0, pitch = 0, zoom = 1, fitR = 30, drag = null, pinch = null;
    function fitCamera() {
      var w = host.clientWidth || 600, h = host.clientHeight || 340, asp = Math.max(0.6, w / h);
      var cW = L ? Math.max(6, L.cW) : 10, cD = L ? Math.max(3, L.cD) : 4;     // frame the racks, not the empty hangar
      var vfov = cam.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * asp);
      fitR = Math.max((cW + 2.5) / Math.tan(hfov / 2), (cD + 3) / Math.tan(vfov / 2)) * (w < 600 ? 0.78 : 1.0);   // seen from above, the depth looks shorter
    }
    function place(t) {
      var a = yaw + (reduce || drag ? 0 : Math.sin(t * 0.00011) * 0.12), r = fitR * zoom;
      cam.position.set(Math.sin(a) * r, r * (0.86 + pitch), Math.cos(a) * r + 2);
      cam.lookAt(0, 1.0, -0.8);
    }
    function pickAt(cx, cy) {
      var r = cv.getBoundingClientRect(), v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      var ray = new T.Raycaster(); ray.setFromCamera(v, cam); var hit = ray.intersectObjects(picks)[0];
      return hit ? bays[hit.object.userData.id] : null;
    }
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch, moved: false, id: e.pointerId }; });
    cv.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId || pinch) { if (!drag && e.pointerType === 'mouse') cv.style.cursor = pickAt(e.clientX, e.clientY) ? 'pointer' : 'grab'; return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) { yaw = Math.max(-0.85, Math.min(0.85, drag.yaw - dx * 0.005)); pitch = Math.max(-0.35, Math.min(0.5, drag.pitch + dy * 0.003)); }
    });
    window.addEventListener('pointerup', function (e) {
      if (drag && !drag.moved && !pinch && e.target === cv) { var b = pickAt(e.clientX, e.clientY); if (b) openCard(b); else closeCard(); }
      drag = null;
    });
    cv.addEventListener('wheel', function (e) {                                // Ctrl + wheel (or a trackpad pinch) zooms; a plain wheel scrolls the page as usual
      if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom = Math.max(0.45, Math.min(1.5, zoom * (1 + Math.sign(e.deltaY) * 0.08)));
    }, { passive: false });
    cv.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { pinch = { d: dist2(e.touches), z: zoom }; drag = null; } }, { passive: true });
    cv.addEventListener('touchmove', function (e) { if (pinch && e.touches.length === 2) { zoom = Math.max(0.45, Math.min(1.5, pinch.z * pinch.d / dist2(e.touches))); e.preventDefault(); } }, { passive: false });
    cv.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });
    function dist2(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy) || 1; }

    /* ── a bay's card ── */
    var cardId = null;
    function openCard(b) {
      cardId = b.id;
      var p = b.p, st = stateOf(p), c = cartonsOf(p), per = perCarton(p), last = null;
      A('stockMoves').forEach(function (m) { if (m && m.productId === p.id && (!last || N(m.createdAt) > N(last.createdAt))) last = m; });
      var can = function (fn) { return typeof window[fn] === 'function'; };
      card.innerHTML = '<button type="button" class="axh-cx" data-a="cx" aria-label="اقفل">✕</button>' +
        '<b class="axh-cn">' + esc(p.name) + '</b>' +
        '<div class="axh-cq ' + st + '">' + (st === 'out' ? 'خلص' : fmtN(p.quantity) + ' ' + esc(p.unit || '')) + '</div>' +
        '<small>' + fmtN(c) + ' كرتونة' + (per > 1 ? ' (الكرتونة ' + fmtN(per) + ' ' + esc(p.unit || '') + ')' : '') + (N(p.minQuantity) ? ' · الحد الأدنى ' + fmtN(p.minQuantity) : '') + '</small>' +
        (last ? '<small>آخر حركة: ' + (last.type === 'in' ? 'وارد' : 'منصرف') + ' ' + fmtN(last.quantity) + ' · ' + esc(String(last.date || '')) + '</small>' : '') +
        '<div class="axh-ca">' +
          (can('openStockMoveForm') ? '<button type="button" data-a="in">➕ وارد</button><button type="button" data-a="out">➖ منصرف</button>' : '') +
          (window.AXCons ? '<button type="button" data-a="cons">🧪 مستهلكات</button>' : '') +
          (can('openProductForm') ? '<button type="button" data-a="edit">✏️ تعديل</button>' : '') +
        '</div>';
      card.hidden = false;
      Object.keys(bays).forEach(function (k) { bays[k].sel = k === String(b.id); });
    }
    function closeCard() { card.hidden = true; cardId = null; Object.keys(bays).forEach(function (k) { bays[k].sel = false; }); }
    host.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-a]'); if (!t) return;
      var a = t.getAttribute('data-a'), id = cardId;
      if (a === 'cx') return closeCard();
      if (a === 'tall') { var on = !host.classList.contains('tall'); host.classList.toggle('tall', on); ls(TALL_KEY, on ? '1' : null); setTimeout(size, 320); return; }
      if (a === 'zin' || a === 'zout') { zoom = Math.max(0.45, Math.min(1.5, zoom * (a === 'zin' ? 0.85 : 1.18))); return; }
      if (a === 'off') { ls(OFF_KEY, '1'); pause(); var root = host.closest('#page-content') || host.parentNode; host.remove(); if (root) attach(root); return; }
      if (!id) return;
      closeCard();
      if (a === 'in') return window.openStockMoveForm(id, 'in');
      if (a === 'out') return window.openStockMoveForm(id, 'out');
      if (a === 'cons') return window.AXCons.open(id);
      if (a === 'edit') return window.openProductForm(id);
    });

    /* ── size + the loop: only while «المخازن» is on screen ── */
    function size() { var w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); fitCamera(); }
    var ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(host); else window.addEventListener('resize', size);
    var visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) resume(); }).observe(host);
    var running = false, last = 0, frameN = 0, pollAt = 0, v3 = new T.Vector3();
    function loop(t) {
      if (!running) return;
      if (!host.isConnected) { running = false; return; }                      // left «المخازن» — stop until the page comes back
      requestAnimationFrame(loop);
      if (!visible || document.hidden) {                                       // off screen: keep the bays right, without the driving
        if (t > pollAt) { pollAt = t + 1000; sync(false, true); }
        last = t; return;
      }
      var dt = Math.max(0, Math.min(0.05, (t - last) / 1000 || 0.016)); last = t;   // a frame stamp can be a hair before «last»
      if (t > pollAt) { pollAt = t + 600; sync(false); }
      var busy = !!job || queue.length || fxItems.length || drag || pinch;
      if (!busy && (frameN++ & 1)) return;                                    // idle → 30 fps
      if (busy) dt = Math.min(0.05, dt);
      tick(dt * (busy ? 1 : 2), t);
    }
    function tick(dt, t) {
      if (!job && queue.length) job = startJob(queue.shift());
      if (job) stepJob(dt); else if (!reduce) patrol(dt);
      fk.g.rotation.y = fk.heading;
      lift += (liftWant - lift) * Math.min(1, dt * 5); fk.carriage.position.y = lift * 1.9;
      doorOpen += (doorWant - doorOpen) * Math.min(1, dt * 3); if (door) door.scale.y = 1 - doorOpen * 0.85;
      fk.beacon.material.emissiveIntensity = 1.5 + Math.sin(t * 0.012) * 1.5;
      if (L && L.rows.length && !reduce) {
        var r0 = L.rows[L.rows.length - 1], ws = (t * 0.00002) % 1, wx = Math.sin(ws * Math.PI * 2) * (L.halfW - 4);
        var nz = r0.z + RACK_D / 2 + 3.4; var prevX = wk.position.x;
        wk.position.set(wx, Math.abs(Math.sin(t * 0.009)) * 0.06, nz); wk.rotation.y = wx > prevX ? Math.PI / 2 : -Math.PI / 2;
      }
      Object.keys(bays).forEach(function (k) {
        var b = bays[k], base = b.state === 'ok' ? 0 : 0.22 + (Math.sin(t * 0.004) + 1) * 0.12;
        if (b.pulse) { b.pulse = Math.max(0, b.pulse - dt); b.glow.material.color.set(b.state === 'out' ? 0xFF3B30 : 0x2ECC71); base = Math.max(base, b.pulse * 0.45); if (!b.pulse) paintBay(b); }
        if (b.sel) base = Math.max(base, 0.38);
        b.glow.material.opacity = base; b.glow.visible = base > 0.01;
      });
      place(t);
      renderer.render(scene, cam);
      var w = host.clientWidth, h = host.clientHeight;
      labelItems.forEach(function (l) {
        if (!l.el) return; v3.copy(l.pos).project(cam);
        if (v3.z > 1 || v3.x < -1.2 || v3.x > 1.2) { l.el.style.display = 'none'; return; }
        var lx = (v3.x + 1) / 2 * w; if (l.zone) lx = Math.max(46, Math.min(w - 46, lx));     // a zone sign never leaves the frame
        l.el.style.display = ''; l.el.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ((1 - v3.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-100%)';
      });
      for (var i = fxItems.length - 1; i >= 0; i--) {
        var f = fxItems[i]; f.t += dt; v3.copy(f.pos); v3.y += f.t * 2.2; v3.project(cam);
        f.el.style.transform = 'translate(' + ((v3.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v3.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-100%)';
        f.el.style.opacity = String(Math.max(0, 1 - Math.max(0, f.t - 1.2) / 0.8));
        if (f.t > 2) { f.el.remove(); fxItems.splice(i, 1); }
      }
    }
    function resume() { if (running || !host.isConnected) return; size(); sync(!layoutSig); running = true; last = performance.now(); requestAnimationFrame(loop); }
    function pause() { running = false; }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) resume(); });

    /* first build, then sit at the dock */
    sync(true);
    fk.g.position.copy(dockPos); fk.g.position.z += 1;
    tick(0.016, performance.now());
    /* where a bay is on the screen (its top shelf, front face — the part a row in front does not hide) */
    function screenOf(id) {
      var b = bays[id]; if (!b) return null;
      var r = cv.getBoundingClientRect(), p = b.g.position.clone().add(new T.Vector3(0, 4.7, RACK_D / 2)).project(cam);
      return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    }
    return { resume: resume, pause: pause, screenOf: screenOf, sync: function () { sync(false); }, state: function () { var o = {}; Object.keys(bays).forEach(function (k) { o[k] = { shown: bays[k].shown, state: bays[k].state, cap: bays[k].cap }; }); return { bays: o, queue: queue.length, busy: !!job, ribbon: ribbon.textContent }; } };
  }

  window.AXHangar = {
    attach: attach,
    zoneOf: zoneOf, cartonsOf: cartonsOf,
    state: function () { return S.eng ? S.eng.state() : null; },
    screenOf: function (id) { return S.eng ? S.eng.screenOf(id) : null; },
    ready: function () { return S.booting ? S.booting.then(function () { return !!S.eng; }) : Promise.resolve(!!S.eng); }
  };
})();

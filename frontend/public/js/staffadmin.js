/* ════════════════════════════════════════════════════════════════════
   OzareX · «الموظفين» (4.60) — the manager's side of attendance
   · النهارده: who is in, who is late, where each one is (from the phone's
     own location, sent every N minutes ONLY while he is checked in) + a map
   · الموظفين: add / edit / stop, a link + username + password per employee,
     sent on WhatsApp (the password is shown once, only a hash is kept)
   · التقرير: a month per employee (days, hours, late, overtime, absent),
     a day-by-day view with the route, manual corrections, print / CSV
   · الإعدادات: working hours, rest days, grace, ping interval, GPS rules,
     and the workplaces (with a radius)
   All numbers come from the server (/api/staff, admin only).
   The employee's own page is /staff (staff.html).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var API = (typeof API_BASE !== 'undefined' ? API_BASE : '');
  var S = { tab: 'live', boot: null, live: null, report: null, month: '', timer: 0, q: '', logs: null, busy: false };
  var DAYN = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  var MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || null; }
  function isPage() { try { return currentPage === 'staff'; } catch (e) { return false; } }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function hm(ts) { return ts ? String(ts).slice(11, 16) : '—'; }
  function dur(m) { m = Math.max(0, Math.round(Number(m) || 0)); return p2(Math.floor(m / 60)) + ':' + p2(m % 60); }
  function dowOf(d) { return new Date(d + 'T00:00:00Z').getUTCDay(); }
  function dmy(d) { var p = String(d).split('-'); return (+p[2]) + '/' + (+p[1]); }
  function api(method, path, body) {
    return fetch(API + '/api/staff' + path, { method: method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error((j && j.message) || 'محصلش — جرّب تاني'); return j; }); });
  }
  function link(u) { return (/^https?:/i.test(API) ? API : location.origin + API).replace(/\/$/, '') + '/staff' + (u ? '?u=' + encodeURIComponent(u) : ''); }
  function maps(lat, lng) { return 'https://www.google.com/maps?q=' + lat + ',' + lng; }
  function wa(phone, text) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2); else if (d.charAt(0) === '0') d = '20' + d.slice(1);
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
  }
  function copy(text) {
    var ok = function () { T('اتنسخ ✅'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { T('انسخ يدويًا', 'error'); } t.remove(); }
  }
  function emps() { return (S.boot && S.boot.emps) || []; }
  function empById(id) { return emps().filter(function (e) { return e.id === id; })[0]; }
  function sites() { return (S.boot && S.boot.sites) || []; }
  function cfg() { return (S.boot && S.boot.cfg) || {}; }
  function today() { return (S.boot && S.boot.now && S.boot.now.date) || new Date().toISOString().slice(0, 10); }

  /* ════════ a small map (no map library, works offline): sites + people / a route ════════ */
  function mapSvg(points, siteList, o) {
    o = o || {};
    var all = points.concat(siteList.filter(function (s) { return s.lat != null && s.lng != null; }));
    if (!all.length) return '<div class="stf-nomap">مفيش مواقع تتعرض لسه</div>';
    var lat0 = all.reduce(function (a, p) { return a + p.lat; }, 0) / all.length, lng0 = all.reduce(function (a, p) { return a + p.lng; }, 0) / all.length;
    var kx = Math.cos(lat0 * Math.PI / 180);
    var pr = function (p) { return { x: (p.lng - lng0) * 111320 * kx, y: -(p.lat - lat0) * 110574 }; };
    var xs = [], ys = [];
    points.forEach(function (p) { var q = pr(p); xs.push(q.x); ys.push(q.y); });
    siteList.forEach(function (s) { if (s.lat == null) return; var q = pr(s), r = s.radius || 200; xs.push(q.x - r, q.x + r); ys.push(q.y - r, q.y + r); });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var W = 640, Hh = o.h || 320, pad = 34;
    var sx = Math.max(maxx - minx, 300), sy = Math.max(maxy - miny, 200);
    var sc = Math.min((W - pad * 2) / sx, (Hh - pad * 2) / sy);
    var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    var X = function (q) { return W / 2 + (q.x - cx) * sc; }, Y = function (q) { return Hh / 2 + (q.y - cy) * sc; };
    var g = '';
    for (var i = 1; i < 8; i++) g += '<line x1="' + (W / 8 * i) + '" y1="0" x2="' + (W / 8 * i) + '" y2="' + Hh + '"/>';
    for (var j = 1; j < 5; j++) g += '<line x1="0" y1="' + (Hh / 5 * j) + '" x2="' + W + '" y2="' + (Hh / 5 * j) + '"/>';
    var s = '<svg class="stf-map" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="خريطة"><g class="gr">' + g + '</g>';
    siteList.forEach(function (st) {
      if (st.lat == null) return; var q = pr(st);
      s += '<circle class="site" cx="' + X(q).toFixed(1) + '" cy="' + Y(q).toFixed(1) + '" r="' + Math.max(8, (st.radius || 200) * sc).toFixed(1) + '"/><circle class="sitec" cx="' + X(q).toFixed(1) + '" cy="' + Y(q).toFixed(1) + '" r="3.5"/>' +
        '<text class="sitet" x="' + X(q).toFixed(1) + '" y="' + (Y(q) - Math.max(8, (st.radius || 200) * sc) - 6).toFixed(1) + '" text-anchor="middle">' + esc(st.name) + '</text>';
    });
    if (o.route && points.length > 1) {
      s += '<polyline class="route" points="' + points.map(function (p) { var q = pr(p); return X(q).toFixed(1) + ',' + Y(q).toFixed(1); }).join(' ') + '"/>';
    }
    points.forEach(function (p, k) {
      var q = pr(p), x = X(q).toFixed(1), y = Y(q).toFixed(1), cls = p.cls || 'on';
      if (o.route) {
        s += '<circle class="pt ' + cls + '" cx="' + x + '" cy="' + y + '" r="' + (p.big ? 8 : 4.5) + '"><title>' + esc(p.title || '') + '</title></circle>';
        if (p.big) s += '<text class="ptt" x="' + x + '" y="' + (+y - 12) + '" text-anchor="middle">' + esc(p.label || '') + '</text>';
      } else {
        s += '<g class="pp ' + cls + '"><circle cx="' + x + '" cy="' + y + '" r="13"/><text x="' + x + '" y="' + (+y + 4.5) + '" text-anchor="middle">' + esc(p.label || '') + '</text><title>' + esc(p.title || '') + '</title></g>';
      }
    });
    return s + '</svg>';
  }

  /* ════════ 4.61 · a real map (Leaflet, vendored) on light tiles — falls back to the small drawing offline ════════ */
  var LFP = null, MAPS = {};
  function leaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (LFP) return LFP;
    LFP = new Promise(function (res, rej) {
      if (!document.getElementById('lf-css')) { var c = document.createElement('link'); c.id = 'lf-css'; c.rel = 'stylesheet'; c.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(c); }
      var sc = document.createElement('script'); sc.src = 'vendor/leaflet/leaflet.js';
      sc.onload = function () { window.L && window.L.map ? res(window.L) : rej(new Error('leaflet')); };
      sc.onerror = function () { LFP = null; rej(new Error('leaflet')); };
      document.head.appendChild(sc);
    });
    return LFP;
  }
  function mapBox(id, h, cls) { return '<div class="stf-lmap ax-hl-off ' + (cls || '') + '" id="' + id + '" dir="ltr" style="height:' + (h || 380) + 'px"><div class="stf-lwait">بنحمّل الخريطة…</div></div><div class="stf-noinet">الخريطة محتاجة إنترنت — المواقع لسه ظاهرة كنقط</div>'; }
  function pinIcon(L, html, cls, size, anchor) { size = size || [34, 34]; anchor = anchor || [size[0] / 2, size[1] / 2]; return L.divIcon({ className: 'emk-w ' + (cls || ''), html: html, iconSize: size, iconAnchor: anchor, popupAnchor: [0, -anchor[1] + 6] }); }
  var BLD = '<svg viewBox="0 0 24 24"><path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-5h6v5M10 9h4M12 7v4"/></svg>';
  function km(a, b) { var R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) * Math.sin(dg / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  /* same system as the EmdadX attendance app: ONE map per page that stays alive; base (sites + centers), live (employees) and trail layers; employee = photo-style bubble + name coloured by freshness */
  function mapFor(L, id) {
    var el = document.getElementById(id); if (!el) return null;
    var m = MAPS[id];
    if (m && m._container === el) return m;
    if (m) { try { m.remove(); } catch (e) {} }
    el.innerHTML = '';
    m = MAPS[id] = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    m.attributionControl.setPrefix(false);
    var ok = 0, bad = 0, alt = false, tl;
    function mk(url, opt) {
      tl = L.tileLayer(url, opt).addTo(m);
      tl.on('tileload', function () { ok++; el.parentNode && el.parentNode.classList.remove('noinet'); });
      tl.on('tileerror', function () {
        if (++bad > 4 && !ok) {
          if (!alt) { alt = true; bad = 0; m.removeLayer(tl); mk('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap · © CARTO' }); }
          else if (el.parentNode) el.parentNode.classList.add('noinet');
        }
      });
    }
    mk('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    m._base = L.layerGroup().addTo(m); m._live = L.layerGroup().addTo(m); m._trail = L.layerGroup().addTo(m);
    m._mk = {}; m._fitted = false; m._sig = '';
    m.on('click', function () { m.scrollWheelZoom.enable(); });
    return m;
  }
  function empBubble(L, x, st) {
    var nm = String(x.name || '').trim().split(/\s+/).slice(0, 2).join(' ');
    return L.divIcon({ className: 'emk-w', html: '<div class="emk ' + st + '"><b class="emk-av">' + esc(String(x.name || '?').trim().charAt(0)) + '</b><span>' + esc(nm) + '</span></div>', iconSize: [120, 68], iconAnchor: [60, 24], popupAnchor: [0, -22] });
  }
  function empPop(x) {
    var u = empById(x.id) || {};
    return '<div dir="rtl" class="lm-pop"><div class="pop-h"><b class="emk-av sm">' + esc(String(x.name || '?').trim().charAt(0)) + '</b><div><b>' + esc(x.name) + '</b><span>' + esc(u.job || '') + '</span></div></div>' +
      '<div class="pop-k"><span>الحالة</span><b>' + esc(x.stText) + '</b><span>آخر تحديث</span><b>' + hm(x.at) + ' (' + ago(x.age) + ')</b>' + (x.in_at ? '<span>الحضور</span><b>' + hm(x.in_at) + '</b>' : '') + (x.place ? '<span>المكان</span><b>' + esc(x.place) + '</b>' : '') + (x.battery != null ? '<span>البطارية</span><b>' + x.battery + '%</b>' : '') + (x.visit ? '<span>في مركز</span><b>' + esc(x.visit.center) + ' من ' + hm(x.visit.start_at) + '</b>' : '') + '</div>' +
      '<div class="pop-a"><button class="btn btn-sm btn-primary" data-a="day" data-id="' + esc(x.id) + '">🛣 مسار اليوم</button>' + (u.phone ? '<a class="btn btn-sm btn-secondary" href="tel:' + esc(u.phone) + '">📞</a><a class="btn btn-sm btn-secondary" target="_blank" rel="noopener" href="' + wa(u.phone, 'أهلاً ' + x.name) + '">💬</a>' : '') + '<a class="btn btn-sm btn-secondary" target="_blank" rel="noopener" href="' + maps(x.lat, x.lng) + '">↗</a></div></div>';
  }
  /* layers: { sites, centers, emps, route, visits } — keep: keep the view the user zoomed to (live refresh) */
  function drawMap(id, layers, keep) {
    var el = document.getElementById(id); if (!el) return;
    return leaflet().then(function (L) {
      var m = mapFor(L, id); if (!m) return;
      var pts = [];
      /* base — only redrawn when a site / center moved */
      var sig = JSON.stringify([(layers.sites || []).map(function (s) { return [s.id, s.lat, s.lng, s.radius]; }), (layers.centers || []).map(function (c) { return [c.key, c.lat, c.lng, c.n, c.gray ? 1 : 0, c.here ? c.here.length : 0, c.label ? 1 : 0]; })]);
      if (m._sig !== sig) {
        m._sig = sig; m._base.clearLayers();
        (layers.sites || []).forEach(function (st) {
          if (st.lat == null) return;
          L.circle([st.lat, st.lng], { radius: st.radius || 200, color: '#f7c12d', weight: 2, fillColor: '#f7c12d', fillOpacity: .08 }).addTo(m._base);
          L.marker([st.lat, st.lng], { icon: pinIcon(L, '<div class="cmk site">' + BLD + '</div>', '', [30, 30]), zIndexOffset: -100 }).bindTooltip(esc(st.name), { direction: 'top', offset: [0, -12], className: 'lm-tip' }).addTo(m._base);
        });
        (layers.centers || []).forEach(function (c) {
          var busy = c.here && c.here.length, badge = busy ? c.here.length : c.n;
          var mk = L.marker([c.lat, c.lng], { icon: pinIcon(L, '<div class="cmk' + (busy ? ' busy' : '') + (c.gray ? ' gray' : '') + '">' + BLD + (badge ? '<b>' + badge + '</b>' : '') + '</div>', '', [30, 30]), zIndexOffset: busy ? 300 : -200 });
          mk.bindTooltip(esc(c.name), { direction: 'top', offset: [0, -12], className: 'lm-tip', permanent: !!busy || !!c.label });
          mk.bindPopup('<div dir="rtl" class="lm-pop"><b>🏥 ' + esc(c.name) + '</b>' + (busy ? '<div>فيه دلوقتي: <b>' + c.here.map(esc).join('، ') + '</b></div>' : '') + (c.n ? '<div>زيارات الشهر: <b>' + c.n + '</b>' + (c.mins ? ' · ' + dur(c.mins) + ' ساعة' : '') + '</div>' : '') + (c.gray ? '<div>ما اتزارش الشهر ده</div>' : '') + '<a href="' + maps(c.lat, c.lng) + '" target="_blank" rel="noopener">افتح في جوجل ماب ↗</a></div>');
          mk.addTo(m._base);
        });
      }
      (layers.sites || []).forEach(function (s) { if (s.lat != null) pts.push([s.lat, s.lng]); });
      (layers.centers || []).forEach(function (c) { pts.push([c.lat, c.lng]); });
      /* live employees — markers are moved in place, never rebuilt, so the popup / zoom survive every refresh */
      var seen = {};
      (layers.emps || []).forEach(function (x) {
        seen[x.id] = 1; pts.push([x.lat, x.lng]);
        var key = x.st + '|' + x.name, mk = m._mk[x.id];
        if (!mk) { mk = m._mk[x.id] = L.marker([x.lat, x.lng], { icon: empBubble(L, x, x.st), zIndexOffset: x.st === 'off' || x.st === 'none' ? 0 : 500 }).bindPopup(empPop(x), { maxWidth: 290 }).addTo(m._live); mk._k = key; }
        else { mk.setLatLng([x.lat, x.lng]); if (mk._k !== key) { mk.setIcon(empBubble(L, x, x.st)); mk._k = key; } mk.setPopupContent(empPop(x)); mk.setZIndexOffset(x.st === 'off' || x.st === 'none' ? 0 : 500); }
      });
      Object.keys(m._mk).forEach(function (k) { if (!seen[k]) { m._live.removeLayer(m._mk[k]); delete m._mk[k]; } });
      /* trail of one day — gold line, numbered pings, حضور / انصراف bubbles, purple center visits */
      m._trail.clearLayers();
      var rt = layers.route || [];
      if (rt.length) {
        var line = rt.map(function (p) { return [p.lat, p.lng]; });
        if (line.length > 1) { L.polyline(line, { color: '#0a2357', weight: 8, opacity: .25 }).addTo(m._trail); L.polyline(line, { color: '#f7c12d', weight: 4, opacity: .95 }).addTo(m._trail); }
        var n = 0;
        rt.forEach(function (p, i) {
          var tip = hm(p.at) + (p.battery != null ? ' • 🔋 ' + p.battery + '%' : '') + (p.acc ? ' • دقة ' + Math.round(p.acc) + ' م' : '');
          if (p.kind === 'in' || p.kind === 'out') L.marker([p.lat, p.lng], { icon: pinIcon(L, '<div class="pnum ' + p.kind + '">' + (p.kind === 'in' ? 'ح' : 'ن') + '</div>', '', [28, 28]), zIndexOffset: 400 }).bindTooltip((p.kind === 'in' ? 'حضور ' : 'انصراف ') + tip, { direction: 'top', offset: [0, -12], className: 'lm-tip' }).addTo(m._trail);
          else { n++; L.marker([p.lat, p.lng], { icon: pinIcon(L, '<div class="pnum">' + n + '</div>', '', [22, 22]) }).bindTooltip((p.kind === 'visit' ? '🏥 ' : '') + tip, { direction: 'top', offset: [0, -10], className: 'lm-tip' }).addTo(m._trail); }
          pts.push([p.lat, p.lng]);
        });
      }
      (layers.visits || []).forEach(function (v) {
        if (v.lat == null) return;
        L.marker([v.lat, v.lng], { icon: pinIcon(L, '<div class="cmk visit">' + BLD + '</div>', '', [30, 30]), zIndexOffset: 600 }).bindPopup('<div dir="rtl" class="lm-pop"><b>🏥 ' + esc(v.center) + '</b><div>' + hm(v.start_at) + ' ← ' + (v.end_at ? hm(v.end_at) : 'لسه هناك') + ' · ' + dur(v.mins) + (v.purpose ? '<br>' + esc(v.purpose) : '') + '</div></div>').addTo(m._trail);
        pts.push([v.lat, v.lng]);
      });
      if (!keep || !m._fitted) {
        if (pts.length === 1) m.setView(pts[0], 15);
        else if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(.25), { maxZoom: 16 });
        else m.setView([30.05, 31.24], 6);
        m._fitted = true;
      }
      setTimeout(function () { try { m.invalidateSize(); } catch (e) {} }, 220);
    }).catch(function () {
      el = document.getElementById(id); if (!el) return;
      var P = (layers.emps || []).map(function (x) { return { lat: x.lat, lng: x.lng, label: x.name.trim().charAt(0), cls: x.state === 'in' ? 'on' : 'done' }; });
      el.innerHTML = mapSvg(P.concat((layers.route || []).map(function (p) { return { lat: p.lat, lng: p.lng, cls: 'on' }; })), (layers.sites || []), { route: !!(layers.route && layers.route.length) });
    });
  }
  function focusEmp(id) {
    var m = MAPS['stf-map'], mk = m && m._mk[id];
    S.sel = String(id); [].forEach.call(document.querySelectorAll('.lv-it'), function (b) { b.classList.toggle('on', b.dataset.id === String(id)); });
    if (!mk) return T('الموظف ده مفيش له موقع على الخريطة', 'error');
    m.flyTo(mk.getLatLng(), Math.max(m.getZoom(), 15), { duration: .8 });
    setTimeout(function () { mk.openPopup(); }, 850);
    var el = document.getElementById('stf-map'); if (el && el.scrollIntoView && window.innerWidth < 900) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ════════ 4.63 · الفنيين في الطريق ════════ */
  function keepTstat(l) { S.tstat = {}; (l.tasks || []).forEach(function (t) { S.tstat[t.id] = t.status; }); }
  function kmT(m) { return m == null ? '—' : (m < 1000 ? m + ' م' : (m / 1000).toFixed(1) + ' كم'); }
  function roadHtml(tasks) {
    var list = (tasks || []).filter(function (t) { return t.status !== 'cancel'; });
    var h = '<div class="card stf-road ax-hl-off" id="stf-road"><div class="card-header"><h3 class="card-title">🚗 الفنيين في الطريق</h3><button class="btn btn-sm btn-primary" data-a="newtask">＋ مهمة لموظف</button></div>';
    if (!list.length) return h + '<p class="stf-note" style="margin:6px 4px 2px">مفيش مهام النهارده — اضغط «＋ مهمة لموظف» وحدد المركز، والموظف هيوصله إشعار ويبدأ الطريق وانت تتابعه هنا.</p></div>';
    h += '<div class="rd-list">' + list.map(function (t) {
      var cls = t.status, pct = t.pct;
      var head = '<div class="rd-h"><b>' + esc(t.emp) + '</b><span>← ' + esc(t.center) + (t.title && t.title.indexOf('زيارة ') !== 0 ? ' · ' + esc(t.title) : '') + '</span>';
      var st = t.status === 'going' ? '<em class="rd-st g">في الطريق</em>' : t.status === 'arrived' ? '<em class="rd-st a">🎉 وصل ' + hm(t.arrived_at) + '</em>' : t.status === 'done' ? '<em class="rd-st d">✅ خلّص ' + hm(t.done_at) + '</em>' : '<em class="rd-st n">⏳ لسه ما بدأش</em>';
      var x = (t.status === 'new' || t.status === 'going' || t.status === 'arrived') ? '<button class="rd-x" data-a="tcancel" data-id="' + t.id + '" title="إلغاء المهمة">✕</button>' : '';
      var road = '<div class="rd-road"><i style="width:' + pct + '%"></i><span class="rd-man' + (t.status === 'going' ? ' walk' : '') + '" style="inset-inline-start:' + pct + '%">' + (t.status === 'arrived' || t.status === 'done' ? '🎉' : '🚶') + '</span><span class="rd-end">🏥</span></div>';
      var nums = t.status === 'going' ? '<div class="rd-n"><span>باقي <b>' + kmT(t.dist) + '</b></span><span>' + (t.eta ? 'حوالي <b>' + t.eta + '</b> دقيقة' : '') + '</span><span><b>' + pct + '%</b></span>' + (t.known ? '' : '<span class="rd-warn">مكان المركز لسه مش معروف</span>') + '</div>' : t.status === 'new' ? '' : '<div class="rd-n"><span>بدأ ' + hm(t.started_at) + '</span><span>' + (t.arrived_at ? 'وصل ' + hm(t.arrived_at) : '') + '</span></div>';
      return '<div class="rd-it ' + cls + '">' + head + st + x + '</div>' + road + nums + '</div>';
    }).join('') + '</div></div>';
    return h;
  }
  function celebrate(t) {
    T('🎉 ' + t.emp + ' وصل ' + t.center, 'success');
    try {
      var d = document.createElement('div'); d.className = 'stf-party';
      d.innerHTML = '<div class="pt-msg">🎉 ' + esc(t.emp) + ' وصل<br><small>' + esc(t.center) + '</small></div>' + Array.apply(null, Array(36)).map(function (_, i) { return '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;animation-delay:' + (Math.random() * .8).toFixed(2) + 's;font-size:' + (14 + Math.random() * 16).toFixed(0) + 'px">' + ['🎉', '✨', '🎊', '⭐', '🟢'][i % 5] + '</i>'; }).join('');
      document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3800);
      var Ac = window.AudioContext || window.webkitAudioContext;
      if (Ac) { var a = new Ac(), t0 = a.currentTime; [523, 659, 784, 1047].forEach(function (f, i) { var o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(.0001, t0 + i * .12); g.gain.exponentialRampToValueAtTime(.18, t0 + i * .12 + .03); g.gain.exponentialRampToValueAtTime(.0001, t0 + i * .12 + .35); o.connect(g); g.connect(a.destination); o.start(t0 + i * .12); o.stop(t0 + i * .12 + .4); }); }
    } catch (e) {}
  }
  function taskModal(empId) {
    api('GET', '/centers').then(function (r) {
      var es = emps().filter(function (e) { return e.active; });
      if (!es.length) { T('ضيف موظف الأول', 'error'); return; }
      openModal('📌 مهمة جديدة لموظف',
        '<div class="form-group"><label>الموظف</label><select class="form-control" id="tk-e">' + es.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === empId ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-group"><label>المركز</label><input class="form-control" id="tk-c" placeholder="🔎 دوّر باسم المركز…" autocomplete="off"><div class="stf-cpick" id="tk-cl"></div><small class="stf-note">لو المركز مكانه لسه مش معروف هتتحسب المسافة بعد أول زيارة ليه أو ثبّت مكانه من تبويب «المراكز».</small></div>' +
        '<div class="form-group"><label>المطلوب (اختياري)</label><input class="form-control" id="tk-t" placeholder="مثلاً: توصيل ورق / تحصيل / صيانة الطابعة" maxlength="120"></div>' +
        '<div class="form-group"><label>ملاحظة (اختياري)</label><input class="form-control" id="tk-n" maxlength="300"></div>',
        '<button class="btn btn-primary" id="tk-go">إرسال المهمة</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
      /* a real list you can see and tap (the iPhone hides a <datalist>) */
      var pick = null, inp = document.getElementById('tk-c'), box = document.getElementById('tk-cl');
      var nz = function (x) { return String(x || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\u064B-\u065F\u0640]/g, '').toLowerCase().trim(); };
      var brn = {}; ((S.boot && S.boot.branches) || []).forEach(function (b) { brn[b.id] = b.name; });
      var many = Object.keys(brn).length > 1;
      function draw() {
        var q = nz(inp.value), L = r.list.filter(function (c) { return !q || nz(c.name).indexOf(q) > -1; });
        box.innerHTML = L.length ? L.slice(0, 150).map(function (c) {
          return '<button type="button" class="stf-cpi' + (pick && pick.key === c.key ? ' on' : '') + '" data-k="' + esc(c.key) + '"><b>' + esc(c.name) + '</b><small>' + (many && brn[c.branch] ? esc(brn[c.branch]) + ' · ' : '') + (c.known ? '📍 مكانه معروف' : 'مكانه لسه مش معروف') + '</small></button>'; }).join('') + (L.length > 150 ? '<p class="stf-note">… اكتب جزء من الاسم علشان تلاقي الباقي</p>' : '')
          : '<p class="stf-note" style="padding:10px">' + (r.list.length ? 'مفيش مركز بالاسم ده' : 'مفيش مراكز — المراكز بتيجي من «العملاء والمراكز» في البرنامج') + '</p>';
        [].forEach.call(box.querySelectorAll('.stf-cpi'), function (b) { b.onclick = function () { pick = r.list.filter(function (x) { return x.key === b.dataset.k; })[0]; inp.value = pick.name; draw(); }; });
      }
      inp.oninput = function () { pick = null; draw(); };
      draw();
      document.getElementById('tk-go').onclick = function () {
        var nm = inp.value.trim(), c = pick || r.list.filter(function (x) { return x.name === nm; })[0];
        if (!c) { T('اختار المركز من القايمة', 'error'); return; }
        api('POST', '/task', { emp_id: document.getElementById('tk-e').value, center: c.key, title: document.getElementById('tk-t').value, note: document.getElementById('tk-n').value })
          .then(function () { closeModal(); T('اتبعتت المهمة والموظف اتبلّغ ✅'); if (S.tab === 'live') refreshLive(); }).catch(function (e) { T(e.message, 'error'); });
      };
    }).catch(function (e) { T(e.message, 'error'); });
  }

  /* ════════ 4.63 · بنك الأعطال ════════ */
  function faultsHtml() {
    var F = S.faults || { list: [], recurring: [], total: 0 };
    var h = '<div class="card stf-form"><div class="stf-fbar"><input class="form-control" id="stf-fq" placeholder="🔎 كود العطل أو وصفه" value="' + esc(S.fq || '') + '"><button class="btn btn-secondary" data-a="fsearch">بحث</button><button class="btn btn-primary" data-a="fadd">＋ حل</button></div><p class="stf-note" style="margin:8px 2px 0">' + F.total + ' حل في البنك — الفنيين بيسجّلوه وهما بيخلّصوا زيارة، وبيوصل لكل زميل إشعار لحظي.</p></div>';
    if (F.recurring && F.recurring.length && !S.fq) {
      h += '<div class="card stf-form"><div class="card-header"><h3 class="card-title">🔁 أعطال متكررة (آخر 90 يوم)</h3></div><div class="stf-rec">' + F.recurring.map(function (r) {
        return '<div class="stf-recit ax-hl-off"><span class="rn">' + r.n + '×</span><div><b>' + (r.code ? '<code>' + esc(r.code) + '</code> ' : '') + esc(r.title) + '</b><small>' + esc(r.centers.join('، ') || '—') + '</small>' + (r.best ? '<small class="ok">الحل: ' + esc(r.best.solution.slice(0, 110)) + ' — ' + esc(r.best.emp || '') + '</small>' : '') + '</div></div>'; }).join('') + '</div></div>';
    }
    h += F.list.length ? '<div class="stf-flist">' + F.list.map(function (f) {
      return '<div class="card stf-fi ax-hl-off"><div class="stf-fh"><b>' + esc(f.title) + '</b>' + (f.code ? '<code>' + esc(f.code) + '</code>' : '') + '</div><div class="stf-sol">' + esc(f.solution) + '</div><div class="stf-fm"><span>👷 ' + esc(f.emp) + '</span>' + (f.center ? '<span>🏥 ' + esc(f.center) + '</span>' : '') + '<span>' + esc(String(f.at).slice(0, 16)) + '</span>' + (f.repeats > 1 ? '<span class="rep">اتكرر ' + f.repeats + '×</span>' : '') +
        '<button class="stf-vt' + (f.voted ? ' on' : '') + '" data-a="fvote" data-id="' + f.id + '">👍 ' + f.votes + '</button><button class="stf-vt" data-a="fdel" data-id="' + f.id + '" title="مسح">🗑</button></div></div>'; }).join('') + '</div>' : '<div class="card stf-empty"><div class="stf-ill">🛠</div><h3>' + (S.fq ? 'مفيش نتايج' : 'البنك لسه فاضي') + '</h3><p>' + (S.fq ? 'جرّب كلمة تانية أو الكود بس.' : 'أول ما فني يخلّص زيارة وفيها عطل ويسجّل حلّه هيظهر هنا.') + '</p></div>';
    return h;
  }
  function faultModal() {
    openModal('🛠 حل جديد في البنك',
      '<div class="form-group"><label>كود العطل (اختياري)</label><input class="form-control" id="fl-c" dir="ltr" maxlength="30" placeholder="E45"></div><div class="form-group"><label>وصف العطل</label><input class="form-control" id="fl-t" maxlength="160"></div><div class="form-group"><label>الحل</label><textarea class="form-control" id="fl-s" rows="3" maxlength="800"></textarea></div>',
      '<button class="btn btn-primary" id="fl-go">حفظ</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
    document.getElementById('fl-go').onclick = function () {
      api('POST', '/fault', { code: document.getElementById('fl-c').value, title: document.getElementById('fl-t').value, solution: document.getElementById('fl-s').value })
        .then(function () { closeModal(); T('اتسجّل والفريق اتبلّغ ✅'); load(); }).catch(function (e) { T(e.message, 'error'); });
    };
  }
  /* a punch / a fault / an arrival happened somewhere → a toast, and the live screen refreshes itself */
  document.addEventListener('ax:sse', function (ev) {
    var m = ev.detail || {}; if (m.event !== 'staff') return;
    var u = me(); if (!u || u.role !== 'admin') return;
    T(m.text || 'تحديث في الموظفين', m.kind === 'out' ? 'info' : 'success');
    if (isPage() && S.tab === 'live') refreshLive();
  });

  /* ════════ page ════════ */
  function render() {
    var root = document.getElementById('page-content'); if (!root) return;
    clearInterval(S.timer);
    root.innerHTML =
      '<div class="page-header stf-head"><div><h2 class="page-title">الموظفين</h2><p class="page-subtitle">حضور وانصراف بالموقع من لينك خاص بكل موظف</p></div>' +
      '<div class="page-actions"><button class="btn btn-secondary" data-a="link">🔗 اللينك</button><button class="btn btn-primary" data-a="new">＋ موظف</button></div></div>' +
      '<div class="stf-tabs" id="stf-tabs">' + [['live', 'النهارده'], ['centers', 'المراكز'], ['faults', 'الأعطال'], ['emps', 'الموظفين'], ['report', 'التقرير'], ['cfg', 'الإعدادات']].map(function (t) {
        return '<button data-t="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="stf-body"><div class="stf-load">بنحمّل…</div></div>';
    root.onclick = onClick;
    load();
  }
  function onClick(e) {
    var t = e.target.closest('[data-t]');
    if (t && t.parentNode.id === 'stf-tabs') { S.tab = t.dataset.t; [].forEach.call(t.parentNode.children, function (b) { b.classList.toggle('on', b === t); }); load(); return; }
    var b = e.target.closest('[data-a]'); if (!b) return;
    act(b.dataset.a, b.dataset.id, b.dataset.d, b);
  }
  function load() {
    clearInterval(S.timer);
    var body = document.getElementById('stf-body'); if (!body) return;
    api('GET', '/bootstrap').then(function (b) {
      S.boot = b;
      if (S.tab === 'live') return api('GET', '/live').then(function (l) { S.live = l; keepTstat(l); S.fast = (l.tasks || []).some(function (t) { return t.status === 'going'; }); paint(); S.timer = setInterval(refreshLive, S.fast ? 10000 : 30000); });
      if (S.tab === 'report') return api('GET', '/report?month=' + (S.month || '')).then(function (r) { S.report = r; S.month = r.month; paint(); });
      if (S.tab === 'cfg') return api('GET', '/log').then(function (l) { S.logs = l.rows; paint(); });
      if (S.tab === 'faults') return api('GET', '/faults?q=' + encodeURIComponent(S.fq || '')).then(function (r) { S.faults = r; paint(); });
      if (S.tab === 'centers') return api('GET', '/visits?month=' + (S.vmonth || '')).then(function (r) { S.visits = r; S.vmonth = r.month; paint(); });
      paint();
    }).catch(function (e) { var bd = document.getElementById('stf-body'); if (bd) bd.innerHTML = '<div class="stf-load bad">' + esc(e.message) + '</div>'; });
  }
  function refreshLive() {
    if (!isPage() || S.tab !== 'live') { clearInterval(S.timer); return; }
    var m = document.getElementById('modal-overlay'); if (m && m.classList.contains('show')) return;
    api('GET', '/live').then(function (l) {
      S.live = l; if (!isPage() || S.tab !== 'live') return;
      var st = document.getElementById('stf-lstats'), cd = document.getElementById('stf-lcards');
      if (st && cd && l.list.length) {
        var prev = S.tstat || {}; (l.tasks || []).forEach(function (t) { if (t.status === 'arrived' && prev[t.id] === 'going') celebrate(t); });
        st.outerHTML = liveStats(l.list); cd.innerHTML = liveList(l); var rd = document.getElementById('stf-road'); if (rd) rd.outerHTML = roadHtml(l.tasks || []); drawLive(true); keepTstat(l);
        var fast = (l.tasks || []).some(function (t) { return t.status === 'going'; }); if (fast !== S.fast) { S.fast = fast; clearInterval(S.timer); S.timer = setInterval(refreshLive, fast ? 10000 : 30000); }
      } else paint();
    }).catch(function () {});
  }
  function paint() {
    var body = document.getElementById('stf-body'); if (!body) return;
    body.innerHTML = S.tab === 'live' ? liveHtml() : S.tab === 'centers' ? centersHtml() : S.tab === 'faults' ? faultsHtml() : S.tab === 'emps' ? empsHtml() : S.tab === 'report' ? reportHtml() : cfgHtml();
    if (S.tab === 'live' && S.live && S.live.list.length) drawLive(false);
    if (S.tab === 'centers' && S.visits) drawCenters();
  }
  /* freshness of an employee's last ping — same words as the EmdadX app */
  function lst(x, L) {
    if (!x.last) return 'none'; if (x.state !== 'in') return 'off';
    var iv = L.ping_min || 15, a = x.age_min == null ? 0 : x.age_min;
    return a <= iv * 1.6 ? 'fresh' : a <= iv * 4 ? 'stale' : 'old';
  }
  var STT = { fresh: 'مباشر', stale: 'متأخر في التحديث', old: 'التحديث واقف', off: 'انصرف', none: 'مفيش موقع' };
  function placeOf(x) {
    if (x.visit && x.state === 'in') return 'في ' + x.visit.center;
    if (x.site) return x.at_site ? 'في ' + x.site : (x.dist != null ? 'بعيد ' + x.dist + ' م عن ' + x.site : '');
    return '';
  }
  function drawLive(keep) {
    var L = S.live;
    var emps = L.list.filter(function (x) { return x.last; }).map(function (x) {
      var st = lst(x, L);
      return { id: x.id, name: x.name, st: st, stText: STT[st], state: x.state, lat: x.last.lat, lng: x.last.lng, at: x.last.at, age: x.age_min, battery: x.last.battery, in_at: x.in_at, visit: x.visit, place: placeOf(x) };
    });
    drawMap('stf-map', { sites: L.sites, centers: L.centers, emps: emps }, keep);
  }

  /* ─ النهارده ─ */
  function ago(m) { if (m == null) return ''; if (m < 1) return 'دلوقتي'; if (m < 60) return 'من ' + m + ' دقيقة'; return 'من ' + Math.floor(m / 60) + ' ساعة'; }
  function liveHtml() {
    var L = S.live, list = L.list;
    if (!list.length) return '<div class="card stf-empty"><div class="stf-ill">👥</div><h3>مفيش موظفين لسه</h3><p>ضيف أول موظف، وابعتله اللينك باسم المستخدم وكلمة السر، وهو هيسجّل حضوره من موبايله.</p><button class="btn btn-primary" data-a="new">＋ موظف جديد</button></div>';
    var h = liveStats(list) + roadHtml(L.tasks || []);
    h += '<div class="stf-live"><div class="card stf-mapcard lt">' + mapBox('stf-map', 520, 'tall') + '</div><div class="card stf-lvcard"><div class="stf-lvh ax-hl-off"><b class="ax-hl-off">الموظفين النهارده</b><span class="stf-livedot ax-hl-off"><i></i>مباشر · تحديث كل ' + L.ping_min + ' د</span></div><div class="stf-lvlist" id="stf-lcards">' + liveList(L) + '</div></div></div>';
    return h;
  }
  function liveStats(list) {
    var inn = list.filter(function (x) { return x.state === 'in'; }).length, done = list.filter(function (x) { return x.state === 'done'; }).length, out = list.filter(function (x) { return x.state === 'out'; }).length;
    var late = list.filter(function (x) { return x.late > 0; }).length, atc = list.filter(function (x) { return x.visit; }).length;
    return '<div class="stf-stats five" id="stf-lstats"><div class="st-in"><b>' + inn + '</b><span>في الشغل دلوقتي</span></div><div class="st-c"><b>' + atc + '</b><span>في مراكز دلوقتي</span></div><div><b>' + done + '</b><span>خلّصوا النهارده</span></div><div class="' + (out ? 'st-out' : '') + '"><b>' + out + '</b><span>لسه ما سجّلوش</span></div><div class="' + (late ? 'st-late' : '') + '"><b>' + late + '</b><span>متأخرين</span></div></div>';
  }
  function liveList(L) {
    var order = { in: 0, done: 1, out: 2 };
    return L.list.slice().sort(function (a, b) { return (order[a.state] - order[b.state]) || a.name.localeCompare(b.name, 'ar'); }).map(function (x) {
      var st = lst(x, L), pl = placeOf(x), tags = '';
      if (x.late > 0) tags += '<span class="stf-tag ax-hl-off l">تأخير ' + x.late + ' د</span>';
      if (x.in_far) tags += '<span class="stf-tag ax-hl-off o" title="سجّل الحضور بعيد عن مكان الشغل">حضور برّه المكان</span>';
      var vis = x.visit && x.state === 'in' ? '<span class="lv-vis ax-hl-off' + (x.visit.far ? ' far' : '') + '">🏥 ' + esc(x.visit.center) + ' · من ' + hm(x.visit.start_at) + (x.visit.far ? ' · بعيد ' + x.visit.dist + ' م' : '') + '</span>' : '';
      var sub = x.state === 'out' && !x.in_at ? 'لسه ما سجّلش حضور' : (x.in_at ? 'حضور ' + hm(x.in_at) + (x.out_at ? ' ← ' + hm(x.out_at) : '') + ' · ' + dur(x.worked) : '');
      return '<div class="lv-it ax-hl-off' + (String(S.sel) === String(x.id) ? ' on' : '') + (x.last ? '' : ' nolast') + '" data-a="focus" data-id="' + x.id + '"><b class="emk-av ' + st + '">' + esc(x.name.trim().charAt(0)) + '</b>' +
        '<div class="t"><b>' + esc(x.name) + '</b><div class="sub"><span class="lvs ax-hl-off ' + st + '"><i></i>' + (x.state === 'out' ? (x.in_at ? 'انصرف' : 'لسه') : STT[st]) + '</span>' + (pl && !vis ? '<span>📍 ' + esc(pl) + '</span>' : '') + (sub ? '<span>' + sub + '</span>' : '') + '</div>' + (vis ? '<div class="sub">' + vis + '</div>' : (x.visits ? '<div class="sub"><span>🏥 زار ' + x.visits + ' ' + (x.visits === 1 ? 'مركز' : 'مراكز') + '</span></div>' : '')) + (tags ? '<div class="sub">' + tags + '</div>' : '') + '</div>' +
        '<div class="end"><span>' + (x.last ? ago(x.age_min) : '') + '</span>' + (x.last && x.last.battery != null ? '<span>🔋 ' + x.last.battery + '%</span>' : '') + '<button class="lv-day" data-a="day" data-id="' + x.id + '" title="مسار اليوم">🛣</button></div></div>';
    }).join('');
  }
  function centersHtml() {
    var V = S.visits, m = V.month.split('-');
    var h = '<div class="stf-bar"><div class="stf-mn"><button class="btn btn-secondary btn-sm" data-a="vm" data-d="-1">‹</button><b>' + MON[+m[1] - 1] + ' ' + m[0] + '</b><button class="btn btn-secondary btn-sm" data-a="vm" data-d="1"' + (V.month >= today().slice(0, 7) ? ' disabled' : '') + '>›</button></div><div class="stf-spacer"></div><button class="btn btn-secondary btn-sm" data-a="vcsv">⬇ CSV</button></div>';
    if (!S.boot.centers) return h + '<div class="card stf-empty"><div class="stf-ill">🏥</div><h3>مفيش مراكز في البرنامج</h3><p>الموظف بيختار المركز من «العملاء والمراكز». ضيف المراكز هناك وهتظهرله على طول.</p></div>';
    var mins = V.centers.reduce(function (t, c) { return t + c.mins; }, 0);
    h += '<div class="stf-stats"><div class="st-c"><b>' + V.total + '</b><span>زيارة الشهر ده</span></div><div><b>' + V.centers.length + '</b><span>مركز اتزار</span></div><div><b>' + dur(mins) + '</b><span>وقت جوه المراكز</span></div><div class="' + (V.neverN ? 'st-late' : '') + '"><b>' + V.neverN + '</b><span>مركز ما اتزارش</span></div></div>';
    h += '<div class="card stf-mapcard lt"><div class="card-header"><h3 class="card-title">خريطة المراكز</h3><span class="stf-sub">مكان المركز بيتعرف لوحده من زيارات الموظفين (أو ثبّته إنت) · الرقم = عدد الزيارات · الرمادي ما اتزارش</span></div>' + mapBox('stf-cmap', 380) + '</div>';
    if (!V.centers.length) h += '<div class="card stf-empty"><p>لسه مفيش زيارات في الشهر ده. الموظف بعد ما يسجّل حضور بيدوس «اختار المركز اللي شغّال فيه».</p></div>';
    else h += '<div class="stf-clist">' + V.centers.map(function (c) {
      var who = Object.keys(c.emps).map(function (n) { return '<span class="stf-tag ax-hl-off x">' + esc(n) + ' ×' + c.emps[n] + '</span>'; }).join('');
      var pur = Object.keys(c.purposes).map(function (n) { return esc(n) + ' ' + c.purposes[n]; }).join(' · ');
      var loc = c.lat != null ? (c.pinned ? '📌 مكانه مثبّت' : '📍 مكانه متعرّف من ' + c.samples + ' زيارة') : '❔ مكانه لسه مش معروف';
      return '<div class="card stf-cc"><div class="stf-ccr"><div class="stf-cci">🏥</div><div class="stf-ci"><div class="stf-top"><b>' + esc(c.name) + '</b>' + (c.far ? '<span class="stf-tag ax-hl-off o">' + c.far + ' بعيد عن المركز</span>' : '') + (c.gone ? '<span class="stf-tag ax-hl-off o">اتشال من البرنامج</span>' : '') + '</div>' +
        '<div class="stf-meta"><b>' + c.n + '</b> زيارة · <b>' + dur(c.mins) + '</b> ساعة · آخر زيارة ' + dmy(c.last.slice(0, 10)) + ' ' + hm(c.last) + (pur ? ' · ' + pur : '') + '</div><div class="stf-meta">' + who + '</div><div class="stf-meta faint">' + loc + '</div></div>' +
        '<div class="stf-acts"><button class="btn btn-sm btn-secondary" data-a="cvis" data-id="' + esc(c.key) + '">الزيارات</button>' + (c.gone ? '' : '<button class="btn btn-sm btn-ghost" data-a="pin" data-id="' + esc(c.key) + '">📌 المكان</button>') + '</div></div></div>';
    }).join('') + '</div>';
    if (V.neverN) h += '<details class="card stf-never"><summary>🕸 مراكز ما اتزارتش الشهر ده (' + V.neverN + ')</summary><div class="stf-nv">' + V.never.map(function (c) { return '<span>' + esc(c.name) + '</span>'; }).join('') + (V.neverN > V.never.length ? '<span>… و' + (V.neverN - V.never.length) + ' كمان</span>' : '') + '</div></details>';
    return h;
  }
  function drawCenters() {
    var V = S.visits;
    var cs = V.centers.filter(function (c) { return c.lat != null; }).map(function (c) { return { key: c.key, name: c.name, lat: c.lat, lng: c.lng, n: c.n, mins: c.mins, label: true }; })
      .concat(V.never.filter(function (c) { return c.lat != null; }).map(function (c) { return { key: c.key, name: c.name, lat: c.lat, lng: c.lng, gray: true }; }));
    drawMap('stf-cmap', { sites: sites(), centers: cs });
  }
  function centerVisits(key) {
    var c = S.visits.centers.filter(function (x) { return x.key === key; })[0]; if (!c) return;
    openModal('🏥 ' + esc(c.name) + ' — الزيارات', '<div class="stf-dl">' + c.list.map(function (v) {
      return '<div class="stf-dr"><b>' + DAYN[dowOf(v.date)] + ' ' + dmy(v.date) + '</b><span>' + esc(v.emp) + (v.purpose ? ' · ' + esc(v.purpose) : '') + '</span><span dir="ltr">' + hm(v.start_at) + ' - ' + (v.end_at ? hm(v.end_at) : '…') + '</span>' + (v.far ? '<span class="stf-tag ax-hl-off o">بعيد ' + v.dist + ' م</span>' : '') + '<em>' + dur(v.mins) + '</em>' + (v.note ? '<div class="stf-meta" style="width:100%">📝 ' + esc(v.note) + '</div>' : '') + '</div>';
    }).join('') + '</div>' + (c.n > c.list.length ? '<p class="stf-note">ظاهر آخر ' + c.list.length + ' زيارة.</p>' : ''), '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
  }
  function pinModal(key) {
    var c = (S.visits.centers.filter(function (x) { return x.key === key; })[0]) || (S.visits.never.filter(function (x) { return x.key === key; })[0]); if (!c) return;
    openModal('📌 مكان ' + esc(c.name),
      '<p class="stf-note" style="margin-top:0">البرنامج بيتعلّم مكان المركز لوحده من أول زيارات الموظفين. لو عايز تثبّته بنفسك: روح المركز ودوس «📍 هنا»، أو انسخ الإحداثيات من جوجل ماب (دوس مطوّل على المكان).</p>' +
      '<div class="stf-grid2"><div class="form-group"><label>خط العرض</label><input class="form-control" id="pn-la" dir="ltr" value="' + (c.lat != null ? c.lat.toFixed(6) : '') + '"></div><div class="form-group"><label>خط الطول</label><input class="form-control" id="pn-lo" dir="ltr" value="' + (c.lng != null ? c.lng.toFixed(6) : '') + '"></div></div>',
      '<button class="btn btn-primary" id="pn-sv">📌 ثبّت</button><button class="btn btn-secondary" id="pn-here">📍 هنا</button>' + (c.lat != null ? '<button class="btn btn-ghost" id="pn-cl">خليه يتعلّم من جديد</button>' : '') + '<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
    document.getElementById('pn-here').onclick = function () {
      navigator.geolocation && navigator.geolocation.getCurrentPosition(function (p) { document.getElementById('pn-la').value = p.coords.latitude.toFixed(6); document.getElementById('pn-lo').value = p.coords.longitude.toFixed(6); }, function () { T('مقدرتش أحدد موقعك', 'error'); }, { enableHighAccuracy: true, timeout: 15000 });
    };
    var la = document.getElementById('pn-la');
    la.addEventListener('paste', function (e) {           // «30.4631, 30.9328» pasted in one box → both boxes
      var t = (e.clipboardData || window.clipboardData).getData('text'), mm = /(-?\d+\.\d+)\s*[,،]\s*(-?\d+\.\d+)/.exec(t || '');
      if (mm) { e.preventDefault(); la.value = mm[1]; document.getElementById('pn-lo').value = mm[2]; }
    });
    document.getElementById('pn-sv').onclick = function () {
      api('POST', '/center', { key: key, lat: Number(la.value), lng: Number(document.getElementById('pn-lo').value) }).then(function () { closeModal(); T('اتثبّت مكان المركز ✅'); load(); }).catch(function (e) { T(e.message, 'error'); });
    };
    var cl = document.getElementById('pn-cl');
    if (cl) cl.onclick = function () { api('POST', '/center', { key: key, clear: true }).then(function () { closeModal(); T('هيتعلّم مكانه من الزيارات الجاية'); load(); }).catch(function (e) { T(e.message, 'error'); }); };
  }
  function vcsv() {
    var V = S.visits, lines = [['المركز', 'عدد الزيارات', 'الوقت', 'آخر زيارة', 'الموظفين', 'الغرض']];
    V.centers.forEach(function (c) { lines.push([c.name, c.n, dur(c.mins), c.last, Object.keys(c.emps).map(function (n) { return n + ' ×' + c.emps[n]; }).join(' / '), Object.keys(c.purposes).map(function (n) { return n + ' ' + c.purposes[n]; }).join(' / ')]); });
    V.never.forEach(function (c) { lines.push([c.name, 0, '', '', '', '']); });
    var txt = '\ufeff' + lines.map(function (l) { return l.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = 'center-visits-' + V.month + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ─ الموظفين ─ */
  function empsHtml() {
    var list = emps();
    if (!list.length) return '<div class="card stf-empty"><div class="stf-ill">👥</div><h3>مفيش موظفين لسه</h3><p>ضيف موظف وهيطلعلك لينك واسم مستخدم وكلمة سر تبعتهم له على واتساب.</p><button class="btn btn-primary" data-a="new">＋ موظف جديد</button></div>';
    return '<div class="stf-cards">' + list.map(function (e) {
      var rest = e.rules.rest.map(function (d) { return DAYN[+d]; }).join('، ');
      return '<div class="card stf-card' + (e.active ? '' : ' off') + '"><div class="stf-av">' + esc(e.name.trim().charAt(0)) + '</div><div class="stf-ci"><div class="stf-top"><b>' + esc(e.name) + '</b>' + (e.active ? '' : '<span class="stf-chip ax-hl-off"><i></i>موقوف</span>') + '</div>' +
        '<div class="stf-meta">' + esc(e.job || '—') + ' · <code>' + esc(e.username) + '</code></div>' +
        '<div class="stf-meta">شغل ' + e.rules.start + ' - ' + e.rules.end + ' · إجازة ' + esc(rest || 'مفيش') + (e.track ? '' : ' · من غير تتبع') + '</div>' +
        '<div class="stf-meta faint">' + (e.last_login_at ? 'آخر دخول ' + dmy(e.last_login_at.slice(0, 10)) + ' ' + hm(e.last_login_at) : 'لسه ما دخلش') + '</div></div>' +
        '<div class="stf-acts"><button class="btn btn-sm btn-primary" data-a="send" data-id="' + e.id + '">🔑 ابعت البيانات</button><button class="btn btn-sm btn-secondary" data-a="edit" data-id="' + e.id + '">✏ تعديل</button></div></div>';
    }).join('') + '</div>';
  }

  /* ─ التقرير ─ */
  function reportHtml() {
    var R = S.report, rows = R.rows.filter(function (r) { return r.active || r.present; });
    var m = R.month.split('-');
    var tot = rows.reduce(function (a, r) { a.p += r.present; a.a += r.absent; a.m += r.mins; a.l += r.late; return a; }, { p: 0, a: 0, m: 0, l: 0 });
    var h = '<div class="stf-bar"><div class="stf-mn"><button class="btn btn-secondary btn-sm" data-a="pm" data-d="-1">‹</button><b>' + MON[+m[1] - 1] + ' ' + m[0] + '</b><button class="btn btn-secondary btn-sm" data-a="pm" data-d="1"' + (R.month >= today().slice(0, 7) ? ' disabled' : '') + '>›</button></div>' +
      '<div class="stf-spacer"></div><button class="btn btn-secondary btn-sm" data-a="csv">⬇ CSV</button><button class="btn btn-secondary btn-sm" data-a="print">🖨 طباعة</button></div>';
    h += '<div class="stf-stats"><div><b>' + tot.p + '</b><span>يوم حضور (كله)</span></div><div><b>' + dur(tot.m) + '</b><span>ساعات الشغل</span></div><div class="' + (tot.a ? 'st-out' : '') + '"><b>' + tot.a + '</b><span>يوم غياب</span></div><div class="' + (tot.l ? 'st-late' : '') + '"><b>' + tot.l + '</b><span>مرة تأخير</span></div></div>';
    if (!rows.length) return h + '<div class="card stf-empty"><p>مفيش بيانات في الشهر ده.</p></div>';
    h += '<div class="card"><div class="table-scroll"><table class="data-table stf-table"><thead><tr><th>الموظف</th><th>حضور</th><th>غياب</th><th>الساعات</th><th>تأخير</th><th>إضافي</th><th>زيارات المراكز</th><th>ملاحظات</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var notes = [];
        if (r.noOut) notes.push(r.noOut + ' من غير انصراف');
        if (r.outside) notes.push(r.outside + ' برّه المكان');
        if (r.farVisits) notes.push(r.farVisits + ' زيارة بعيدة عن المركز');
        return '<tr data-a="emprep" data-id="' + r.id + '" class="stf-tr"><td><b>' + esc(r.name) + '</b><div class="stf-meta">' + esc(r.job) + '</div></td><td>' + r.present + ' من ' + r.expected + '</td><td class="' + (r.absent ? 'bad' : '') + '">' + r.absent + '</td><td><b>' + dur(r.mins) + '</b></td><td class="' + (r.late ? 'warn' : '') + '">' + (r.late ? r.late + ' (' + r.lateMin + ' د)' : '—') + '</td><td>' + (r.over ? dur(r.over) : '—') + '</td><td>' + (r.visits ? '<b>' + r.visits + '</b> في ' + r.centersN + ' مركز · ' + dur(r.visitMins) : '—') + '</td><td class="stf-meta">' + esc(notes.join(' · ') || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return h + '<p class="stf-note">دوس على أي موظف تشوف أيامه وتعدّل أو تضيف حضور يدوي. «حضور» = أيام اشتغل فيها ÷ أيام الشغل المفروضة (من غير الإجازة الأسبوعية).</p>';
  }

  /* ─ الإعدادات ─ */
  function cfgHtml() {
    var c = cfg();
    var rest = String(c.rest_days || '').split(',');
    var h = '<div class="card stf-form"><div class="card-header"><h3 class="card-title">مواعيد الشغل (الافتراضي لكل الموظفين)</h3></div><div class="stf-grid">' +
      '<div class="form-group"><label>بداية الشغل</label><input class="form-control" type="time" id="c-ss" value="' + esc(c.shift_start) + '"></div>' +
      '<div class="form-group"><label>نهاية الشغل</label><input class="form-control" type="time" id="c-se" value="' + esc(c.shift_end) + '"></div>' +
      '<div class="form-group"><label>سماح التأخير (دقيقة)</label><input class="form-control" type="number" min="0" max="120" id="c-gr" value="' + esc(c.grace_min) + '"></div></div>' +
      '<div class="form-group"><label>الإجازة الأسبوعية</label><div class="stf-days" id="c-rest">' + DAYN.map(function (d, i) { return '<label class="stf-day"><input type="checkbox" value="' + i + '"' + (rest.indexOf(String(i)) >= 0 ? ' checked' : '') + '><span>' + d + '</span></label>'; }).join('') + '</div></div></div>';
    h += '<div class="card stf-form"><div class="card-header"><h3 class="card-title">الموقع والتتبع</h3></div>' +
      '<label class="stf-sw"><input type="checkbox" id="c-rl"' + (c.require_location === '1' ? ' checked' : '') + '><span><b>إجبار الموقع عند التسجيل</b><small>الموظف ما يقدرش يسجّل حضور من غير ما يفعّل الـ GPS</small></span></label>' +
      '<label class="stf-sw"><input type="checkbox" id="c-tr"' + (c.track === '1' ? ' checked' : '') + '><span><b>تتبع الموقع وقت الشغل</b><small>الموبايل يبعت مكانه كل فترة طول ما هو مسجّل حضور — وبيقف أول ما يسجّل انصراف</small></span></label>' +
      '<div class="stf-grid"><div class="form-group"><label>كل كام دقيقة يبعت الموقع</label><input class="form-control" type="number" min="5" max="120" id="c-pm" value="' + esc(c.ping_min) + '"></div>' +
      '<div class="form-group"><label>نطاق المركز (متر)</label><input class="form-control" type="number" min="80" max="3000" id="c-cr" value="' + esc(c.center_radius || 300) + '"></div>' + '<div class="form-group"><label>لو الموظف برّه المكان</label><select class="form-control" id="c-gf"><option value="off"' + (c.geofence === 'off' ? ' selected' : '') + '>مفيش تحقق من المسافة</option><option value="warn"' + (c.geofence === 'warn' ? ' selected' : '') + '>يسجّل بس يتعلّم «برّه المكان»</option><option value="block"' + (c.geofence === 'block' ? ' selected' : '') + '>يتمنع من تسجيل الحضور</option></select></div></div></div>';
    var nv = function (k, dflt) { return c[k] === undefined ? dflt : c[k] === '1'; };
    h += '<div class="card stf-form"><div class="card-header"><h3 class="card-title">الإشعارات 🔔</h3></div>' +
      '<label class="stf-sw"><input type="checkbox" id="c-ni"' + (nv('notify_in', true) ? ' checked' : '') + '><span><b>لما موظف يسجّل حضور</b><small>إشعار على موبايلك (والشاشة المفتوحة) بالاسم والوقت والتأخير</small></span></label>' +
      '<label class="stf-sw"><input type="checkbox" id="c-no"' + (nv('notify_out', true) ? ' checked' : '') + '><span><b>لما موظف يسجّل انصراف</b><small>بمدة الشغل وعدد الزيارات</small></span></label>' +
      '<label class="stf-sw"><input type="checkbox" id="c-na"' + (nv('notify_arrive', true) ? ' checked' : '') + '><span><b>لما فني يوصل المركز</b><small>🎉 وهو في الطريق بتشوفه على لوحة «الفنيين في الطريق»</small></span></label>' +
      '<label class="stf-sw"><input type="checkbox" id="c-nv"' + (nv('notify_visit', false) ? ' checked' : '') + '><span><b>لما موظف يبدأ زيارة مركز</b><small>مقفول افتراضيًا علشان ما يكترش</small></span></label>' +
      '<div data-axp></div><p class="stf-note">علشان الإشعار يوصلك والتطبيق مقفول: افتح مركز الإشعارات 🔔 واضغط «تفعيل» على الجهاز ده.</p></div>';
    h += '<div class="card stf-form"><div class="card-header"><h3 class="card-title">أماكن الشغل</h3><button class="btn btn-sm btn-secondary" data-a="addsite">＋ مكان</button></div><div id="c-sites">' + sites().map(siteRow).join('') + (sites().length ? '' : '<p class="stf-note" id="c-nosite">ضيف مكان الشغل (المكتب أو الفرع) وحدد نطاقه، علشان البرنامج يعرف الموظف وصل ولا لأ.</p>') + '</div></div>';
    h += '<div class="stf-savebar"><button class="btn btn-primary" data-a="savecfg">💾 حفظ الإعدادات</button></div>';
    h += '<div class="card"><div class="card-header"><h3 class="card-title">آخر العمليات</h3></div><div class="stf-log">' + ((S.logs || []).length ? S.logs.slice(0, 25).map(function (r) {
      return '<div><span>' + esc(String(r.at).slice(5, 16)) + '</span><b>' + esc(r.who) + '</b><span>' + esc(logName(r.action)) + '</span><small>' + esc(logDetail(r.detail)) + '</small></div>'; }).join('') : '<p class="stf-note">لسه مفيش عمليات</p>') + '</div></div>';
    return h;
  }
  function logName(a) { return { 'emp.create': 'ضاف موظف', 'emp.update': 'عدّل موظف', 'emp.reset': 'كلمة سر جديدة', 'emp.delete': 'مسح موظف', 'cfg.save': 'عدّل الإعدادات', 'att.add': 'ضاف حضور يدوي', 'att.edit': 'عدّل حضور', 'att.delete': 'مسح حضور', 'center.pin': 'ثبّت مكان مركز', 'center.clear': 'مسح مكان مركز' }[a] || a; }
  function logDetail(d) { try { var o = JSON.parse(d || '{}'); return o.name || o.emp || ''; } catch (e) { return ''; } }
  function siteRow(s) {
    return '<div class="stf-site" data-id="' + esc(s.id || '') + '"><input class="form-control s-n" placeholder="اسم المكان (مثلاً: مكتب منوف)" value="' + esc(s.name || '') + '">' +
      '<input class="form-control s-la" inputmode="decimal" placeholder="خط العرض" dir="ltr" value="' + (s.lat != null ? s.lat : '') + '"><input class="form-control s-lo" inputmode="decimal" placeholder="خط الطول" dir="ltr" value="' + (s.lng != null ? s.lng : '') + '">' +
      '<input class="form-control s-r" type="number" min="30" max="5000" title="النطاق بالمتر" value="' + (s.radius || 250) + '"><span class="stf-m">م</span>' +
      '<button class="btn btn-sm btn-secondary" data-a="here" title="خد موقعي الحالي">📍 هنا</button><button class="btn btn-sm btn-ghost" data-a="rmsite" title="حذف">✕</button></div>';
  }

  /* ════════ actions ════════ */
  function act(a, id, d, el) {
    if (a === 'new') return empForm();
    if (a === 'edit') return empForm(id);
    if (a === 'send') return sendCreds(id);
    if (a === 'link') return linkModal();
    if (a === 'focus') return focusEmp(id);
    if (a === 'newtask') return taskModal();
    if (a === 'tcancel') { if (!confirm('تلغي المهمة دي؟')) return; return api('POST', '/task/cancel', { id: Number(id) }).then(function () { T('اتلغت المهمة'); refreshLive(); }).catch(function (e) { T(e.message, 'error'); }); }
    if (a === 'fadd') return faultModal();
    if (a === 'fvote') return api('POST', '/fault/vote', { id: Number(id) }).then(function (r) { el.textContent = '👍 ' + r.votes; el.classList.toggle('on', r.voted); }).catch(function (e) { T(e.message, 'error'); });
    if (a === 'fdel') { if (!confirm('تمسح الحل ده من البنك؟')) return; return api('POST', '/fault/delete', { id: Number(id) }).then(function () { T('اتمسح'); load(); }).catch(function (e) { T(e.message, 'error'); }); }
    if (a === 'fsearch') { S.fq = (document.getElementById('stf-fq') || {}).value || ''; return load(); }
    if (a === 'day') { var e = empById(id); return dayModal(id, S.live ? S.live.now.date : today(), e && e.name); }
    if (a === 'emprep') return empReport(id);
    if (a === 'cvis') return centerVisits(id);
    if (a === 'pin') return pinModal(id);
    if (a === 'vcsv') return vcsv();
    if (a === 'vm') { var q = S.vmonth.split('-'), dq = new Date(Date.UTC(+q[0], +q[1] - 1 + Number(d), 1)); S.vmonth = dq.getUTCFullYear() + '-' + p2(dq.getUTCMonth() + 1); return load(); }
    if (a === 'pm') { var p = S.month.split('-'), dt = new Date(Date.UTC(+p[0], +p[1] - 1 + Number(d), 1)); S.month = dt.getUTCFullYear() + '-' + p2(dt.getUTCMonth() + 1); return load(); }
    if (a === 'csv') return csv();
    if (a === 'print') return printReport();
    if (a === 'addsite') { var w = document.getElementById('c-sites'), n = document.getElementById('c-nosite'); if (n) n.remove(); w.insertAdjacentHTML('beforeend', siteRow({})); return; }
    if (a === 'rmsite') { el.closest('.stf-site').remove(); return; }
    if (a === 'here') return here(el.closest('.stf-site'));
    if (a === 'savecfg') return saveCfg();
  }
  function here(row) {
    if (!navigator.geolocation) { T('المتصفح مش بيدعم الموقع', 'error'); return; }
    T('بنحدد موقعك…', 'info');
    navigator.geolocation.getCurrentPosition(function (p) {
      row.querySelector('.s-la').value = p.coords.latitude.toFixed(6); row.querySelector('.s-lo').value = p.coords.longitude.toFixed(6);
      T('اتحدد موقعك الحالي — دقة ' + Math.round(p.coords.accuracy) + ' م');
    }, function () { T('مقدرتش أحدد الموقع — اسمح للمتصفح أو اكتب الإحداثيات يدوي (من جوجل ماب: دوس مطوّل على المكان)', 'error'); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  function saveCfg() {
    var rows = [].map.call(document.querySelectorAll('#c-sites .stf-site'), function (r) {
      var la = r.querySelector('.s-la').value.trim().replace(/[^\d.\-]/g, ''), lo = r.querySelector('.s-lo').value.trim().replace(/[^\d.\-]/g, '');
      return { id: r.dataset.id || undefined, name: r.querySelector('.s-n').value.trim(), lat: la === '' ? null : Number(la), lng: lo === '' ? null : Number(lo), radius: Number(r.querySelector('.s-r').value) || 250 };
    }).filter(function (x) { return x.name; });
    if (rows.some(function (x) { return x.lat === null || x.lng === null; })) { T('حدد إحداثيات كل مكان (زرار 📍 هنا وانت في المكان)', 'error'); return; }
    var rest = [].filter.call(document.querySelectorAll('#c-rest input'), function (i) { return i.checked; }).map(function (i) { return i.value; }).join(',');
    api('POST', '/cfg', {
      shift_start: document.getElementById('c-ss').value, shift_end: document.getElementById('c-se').value, grace_min: document.getElementById('c-gr').value, rest_days: rest,
      notify_in: document.getElementById('c-ni').checked, notify_out: document.getElementById('c-no').checked, notify_arrive: document.getElementById('c-na').checked, notify_visit: document.getElementById('c-nv').checked, require_location: document.getElementById('c-rl').checked, track: document.getElementById('c-tr').checked, ping_min: document.getElementById('c-pm').value, geofence: document.getElementById('c-gf').value, center_radius: document.getElementById('c-cr').value, sites: rows
    }).then(function (r) { S.boot.cfg = r.cfg; S.boot.sites = r.sites; T('اتحفظت الإعدادات ✅'); paint(); }).catch(function (e) { T(e.message, 'error'); });
  }

  /* ─ employee form ─ */
  function empForm(id) {
    var e = id ? empById(id) : null, c = cfg();
    var rest = e ? String(e.rest_days) : '';
    var restSet = rest === '' ? null : rest.split(',');
    openModal(e ? 'تعديل ' + esc(e.name) : 'موظف جديد',
      '<form id="stf-f" onsubmit="return false" autocomplete="off"><div class="stf-grid">' +
      '<div class="form-group"><label>الاسم *</label><input class="form-control" name="name" maxlength="100" value="' + esc(e ? e.name : '') + '"></div>' +
      '<div class="form-group"><label>الوظيفة</label><input class="form-control" name="job" maxlength="80" value="' + esc(e ? e.job : '') + '" placeholder="مثلاً: مندوب / محاسب"></div>' +
      '<div class="form-group"><label>رقم الواتساب</label><input class="form-control" name="phone" inputmode="tel" dir="ltr" maxlength="30" value="' + esc(e ? e.phone : '') + '" placeholder="01012345678"></div>' +
      '<div class="form-group"><label>اسم المستخدم (للدخول)</label><input class="form-control" name="username" dir="ltr" autocapitalize="none" maxlength="30" value="' + esc(e ? e.username : '') + '" placeholder="بيتعمل تلقائي لو فاضي"></div></div>' +
      '<div class="stf-grid"><div class="form-group"><label>بداية الشغل</label><input class="form-control" type="time" name="shift_start" value="' + esc(e ? e.shift_start : '') + '"><small class="stf-hint">فاضي = ' + esc(c.shift_start) + '</small></div>' +
      '<div class="form-group"><label>نهاية الشغل</label><input class="form-control" type="time" name="shift_end" value="' + esc(e ? e.shift_end : '') + '"><small class="stf-hint">فاضي = ' + esc(c.shift_end) + '</small></div>' +
      ((S.boot.branches || []).length > 1 ? '<div class="form-group"><label>الفرع</label><select class="form-control" name="branch_id"><option value="">كل الفروع (يشوف مراكز الكل)</option>' + S.boot.branches.map(function (b) { return '<option value="' + esc(b.id) + '"' + (e && e.branch_id === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></div>' : '') + '<div class="form-group"><label>مكان الشغل</label><select class="form-control" name="site_id"><option value="">أي مكان من الأماكن</option>' + sites().map(function (s) { return '<option value="' + esc(s.id) + '"' + (e && e.site_id === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="form-group"><label>الإجازة الأسبوعية <small class="stf-hint">— سيبها من غير اختيار علشان تمشي بإعداد الشركة</small></label><div class="stf-days">' + DAYN.map(function (d, i) { return '<label class="stf-day"><input type="checkbox" name="rd" value="' + i + '"' + (restSet && restSet.indexOf(String(i)) >= 0 ? ' checked' : '') + '><span>' + d + '</span></label>'; }).join('') + '</div></div>' +
      (e ? '' : '<div class="form-group"><label>كلمة السر <small class="stf-hint">— لو سيبتها فاضية بيتعمل واحدة سهلة تلقائي</small></label><input class="form-control" name="password" dir="ltr" autocomplete="off" maxlength="60" placeholder="6 حروف على الأقل"></div>') +
      '<label class="stf-sw"><input type="checkbox" name="track"' + (!e || e.track ? ' checked' : '') + '><span><b>تتبع الموقع وقت الشغل</b><small>كل ' + esc(c.ping_min) + ' دقيقة وهو مسجّل حضور بس</small></span></label>' +
      (e ? '<label class="stf-sw"><input type="checkbox" name="active"' + (e.active ? ' checked' : '') + '><span><b>الحساب شغّال</b><small>لو وقفته الموظف مش هيقدر يدخل</small></span></label>' : '') +
      '<div class="form-group"><label>ملاحظة</label><input class="form-control" name="note" maxlength="300" value="' + esc(e ? e.note : '') + '"></div></form>',
      '<button class="btn btn-primary" id="stf-sv">' + (e ? 'حفظ' : 'إضافة') + '</button>' + (e ? '<button class="btn btn-danger" id="stf-dl">🗑 مسح</button>' : '') + '<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
    document.getElementById('stf-sv').onclick = function () {
      var f = document.getElementById('stf-f'), fd = new FormData(f);
      var body = { id: e ? e.id : undefined, name: fd.get('name'), job: fd.get('job'), phone: fd.get('phone'), username: fd.get('username'), shift_start: fd.get('shift_start') || '', shift_end: fd.get('shift_end') || '', site_id: fd.get('site_id') || '', branch_id: fd.get('branch_id') || '', note: fd.get('note'), track: !!fd.get('track'), rest_days: fd.getAll('rd').join(',') };
      if (!e) body.password = fd.get('password') || ''; else body.active = !!fd.get('active');
      if (!String(body.name || '').trim()) { T('اكتب الاسم', 'error'); return; }
      var sv = document.getElementById('stf-sv'); sv.disabled = true;
      api('POST', '/emp', body).then(function (r) {
        closeModal();
        return api('GET', '/bootstrap').then(function (b) { S.boot = b; if (!e) credsModal(r, body.name, body.phone); else T('اتحفظت بيانات ' + body.name); if (isPage()) { if (S.tab === 'live') load(); else paint(); } });
      }).catch(function (er) { sv.disabled = false; T(er.message, 'error'); });
    };
    var dl = document.getElementById('stf-dl');
    if (dl) dl.onclick = function () {
      if (!confirm('مسح ' + e.name + ' نهائي مع كل حضوره ومواقعه؟ (لو عايز بس توقفه من الدخول، شيل علامة «الحساب شغّال»)')) return;
      api('POST', '/emp/delete', { id: e.id }).then(function () { closeModal(); T('اتمسح ' + e.name); load(); }).catch(function (er) { T(er.message, 'error'); });
    };
  }

  /* ─ the link + username + password, once ─ */
  function msgText(name, user, pass) {
    return 'أهلاً ' + name + ' 👋\nتسجيل الحضور والانصراف من اللينك ده:\n' + link() + '\n\nاسم المستخدم: ' + user + '\nكلمة السر: ' + pass + '\n\nافتح اللينك من موبايلك واسمح للمتصفح بتحديد الموقع، وسجّل حضورك أول ما توصل شغلك. غيّر كلمة السر بعد أول دخول.';
  }
  function credsModal(r, name, phone) {
    var t = msgText(name, r.username, r.password);
    openModal('بيانات دخول ' + esc(name),
      '<div class="stf-cred"><div class="stf-warn">⚠ كلمة السر بتظهر <b>المرة دي بس</b> (البرنامج مش بيحتفظ إلا بنسخة مشفّرة). ابعتها دلوقتي، ولو ضاعت اعمل كلمة سر جديدة.</div>' +
      '<div class="stf-cr"><span>اللينك</span><code dir="ltr">' + esc(link()) + '</code></div><div class="stf-cr"><span>اسم المستخدم</span><code dir="ltr">' + esc(r.username) + '</code></div><div class="stf-cr"><span>كلمة السر</span><code dir="ltr" class="big">' + esc(r.password) + '</code></div>' +
      '<pre class="stf-msg">' + esc(t) + '</pre></div>',
      (phone ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + wa(phone, t) + '">💬 ابعت على واتساب</a>' : '') + '<button class="btn btn-secondary" id="stf-cp">📋 انسخ الرسالة</button><button class="btn btn-ghost" onclick="closeModal()">تمام</button>');
    document.getElementById('stf-cp').onclick = function () { copy(t); };
  }
  function sendCreds(id) {
    var e = empById(id); if (!e) return;
    openModal('ابعت بيانات ' + esc(e.name),
      '<p class="stf-note" style="margin-top:0">كلمة السر القديمة مش بتتخزّن بشكل يتقري، فهنعمل <b>كلمة سر جديدة</b> ونبعتهالك مع اللينك واسم المستخدم. أي جهاز كان مسجّل دخول بيتفصل.</p>',
      '<button class="btn btn-primary" id="stf-rs">🔑 اعمل كلمة سر جديدة</button><button class="btn btn-secondary" id="stf-lk">🔗 اللينك بس</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
    document.getElementById('stf-rs').onclick = function () {
      this.disabled = true;
      api('POST', '/emp/reset', { id: id }).then(function (r) { closeModal(); credsModal(r, e.name, e.phone); }).catch(function (er) { T(er.message, 'error'); });
    };
    document.getElementById('stf-lk').onclick = function () { copy(link(e.username)); };
  }
  function linkModal() {
    openModal('لينك الموظفين', '<div class="stf-cred"><p class="stf-note" style="margin-top:0">ده اللينك اللي كل الموظفين بيفتحوه، وبيدخلوا بحساب كل واحد. ينفع يتحفظ على شاشة الموبايل الرئيسية زي تطبيق.</p><div class="stf-cr"><span>اللينك</span><code dir="ltr">' + esc(link()) + '</code></div></div>',
      '<button class="btn btn-primary" id="stf-cl">📋 انسخ اللينك</button><a class="btn btn-secondary" target="_blank" rel="noopener" href="' + esc(link()) + '">افتحه</a><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
    document.getElementById('stf-cl').onclick = function () { copy(link()); };
  }

  /* ─ a day: the records, the route, manual fixes ─ */
  function dayModal(empId, date, name) {
    api('GET', '/track?emp=' + encodeURIComponent(empId) + '&date=' + encodeURIComponent(date)).then(function (t) {
      var d = new Date(date + 'T00:00:00Z');
      /* the day as a timeline: in → each center → out */
      var ev = [];
      t.att.forEach(function (a) { ev.push({ at: a.in_at, k: 'in', html: '🟢 <b>حضور</b>' + (a.in_dist != null ? ' · على بعد ' + a.in_dist + ' م من المكان' : '') + (a.source === 'manager' ? ' · ✍ يدوي' : '') }); if (a.out_at) ev.push({ at: a.out_at, k: 'out', html: '🔴 <b>انصراف</b>' }); });
      (t.visits || []).forEach(function (v) { ev.push({ at: v.start_at, k: 'v', html: '🏥 <b>' + esc(v.center) + '</b>' + (v.purpose ? ' · ' + esc(v.purpose) : '') + ' · ' + hm(v.start_at) + ' ← ' + (v.end_at ? hm(v.end_at) : 'لسه هناك') + ' · <b>' + dur(v.mins) + '</b>' + (v.far ? ' <span class="stf-tag ax-hl-off o">بعيد ' + v.dist + ' م عن المركز</span>' : '') + (v.note ? '<div class="stf-meta">📝 ' + esc(v.note) + '</div>' : '') }); });
      var P = t.points || [], iv = (S.live && S.live.ping_min) || Number(cfg().ping_min) || 15, dist = 0;
      for (var q = 1; q < P.length; q++) {
        dist += km(P[q - 1], P[q]);
        var gap = (Date.parse(P[q].at.replace(' ', 'T')) - Date.parse(P[q - 1].at.replace(' ', 'T'))) / 60000;
        if (gap > iv * 2.5 && P[q].kind !== 'in') ev.push({ at: P[q - 1].at, k: 'g', html: '📡 <b>التحديث وقف ' + dur(gap) + '</b><div class="stf-meta">غالبًا البرنامج كان مقفول على موبايله</div>' });
      }
      ev.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
      var sum = P.length ? '<div class="stf-trksum"><div><b>' + (Math.round(dist * 10) / 10) + '</b><span>كم تقريبًا</span></div><div><b>' + P.length + '</b><span>نقطة موقع</span></div><div><b>' + (t.visits || []).length + '</b><span>زيارة</span></div></div>' : '';
      var tl = ev.length ? '<div class="stf-tl">' + ev.map(function (e) { return '<div class="' + e.k + '"><span>' + hm(e.at) + '</span><div>' + e.html + '</div></div>'; }).join('') + '</div>' : '<p class="stf-note">مفيش حضور مسجّل في اليوم ده.</p>';
      var edit = (t.att.length ? t.att.map(function (a) {
          return '<div class="stf-att" data-id="' + a.id + '"><div class="stf-grid2"><div class="form-group"><label>حضور</label><input type="time" class="form-control a-in" value="' + hm(a.in_at) + '"></div><div class="form-group"><label>انصراف</label><input type="time" class="form-control a-out" value="' + (a.out_at ? hm(a.out_at) : '') + '"></div></div>' +
            '<div class="stf-meta">' + (a.source === 'manager' ? '✍ يدوي من الإدارة' : '📱 من الموبايل') + (a.note ? ' · ' + esc(a.note) : '') + '</div>' +
            '<div class="stf-acts"><button class="btn btn-sm btn-primary a-sv">حفظ التعديل</button><button class="btn btn-sm btn-ghost a-dl">🗑 مسح</button></div></div>'; }).join('') : '') +
        '<div class="stf-att add"><b>＋ إضافة حضور يدوي</b><div class="stf-grid2"><div class="form-group"><label>حضور</label><input type="time" class="form-control n-in"></div><div class="form-group"><label>انصراف</label><input type="time" class="form-control n-out"></div></div><button class="btn btn-sm btn-secondary n-sv">إضافة</button></div>';
      openModal(esc(name || t.emp.name) + ' — ' + DAYN[d.getUTCDay()] + ' ' + dmy(date),
        '<div class="stf-daybar"><input type="date" class="form-control" id="stf-dd" value="' + esc(date) + '"><button class="btn btn-secondary btn-sm" id="stf-ddg">عرض</button></div>' + tl +
        (t.points.length || (t.centers || []).length ? sum + '<div class="stf-mapcard lt in-modal">' + mapBox('stf-dmap', 340) + '</div>' : '<p class="stf-note">مفيش مواقع متسجّلة في اليوم ده.</p>') +
        '<details class="stf-edit"' + (t.att.length ? '' : ' open') + '><summary>✍ تعديل أو إضافة حضور يدوي</summary>' + edit + '</details>',
        '<button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
      document.getElementById('stf-ddg').onclick = function () { var v = document.getElementById('stf-dd').value; if (v) { closeModal(); dayModal(empId, v, name); } };
      if (document.getElementById('stf-dmap')) drawMap('stf-dmap', { sites: sites(), centers: (t.centers || []).map(function (c) { return { key: c.key, name: c.name, lat: c.lat, lng: c.lng, label: true }; }), route: t.points, visits: t.visits || [] });
      var again = function () { closeModal(); dayModal(empId, date, name); if (S.tab === 'report') { api('GET', '/report?month=' + S.month).then(function (r) { S.report = r; }); } };
      [].forEach.call(document.querySelectorAll('.stf-att[data-id]'), function (box) {
        box.querySelector('.a-sv').onclick = function () {
          api('POST', '/att', { id: Number(box.dataset.id), emp_id: empId, date: date, in_time: box.querySelector('.a-in').value, out_time: box.querySelector('.a-out').value }).then(function () { T('اتعدّل'); again(); }).catch(function (e) { T(e.message, 'error'); });
        };
        box.querySelector('.a-dl').onclick = function () { if (!confirm('مسح تسجيل الحضور ده؟')) return; api('POST', '/att/delete', { id: Number(box.dataset.id) }).then(function () { T('اتمسح'); again(); }).catch(function (e) { T(e.message, 'error'); }); };
      });
      var ns = document.querySelector('.stf-att.add .n-sv');
      if (ns) ns.onclick = function () {
        var box = ns.closest('.stf-att');
        api('POST', '/att', { emp_id: empId, date: date, in_time: box.querySelector('.n-in').value, out_time: box.querySelector('.n-out').value }).then(function () { T('اتضاف'); again(); }).catch(function (e) { T(e.message, 'error'); });
      };
    }).catch(function (e) { T(e.message, 'error'); });
  }
  function empReport(id) {
    var r = S.report.rows.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var m = S.report.month.split('-');
    openModal(esc(r.name) + ' — ' + MON[+m[1] - 1] + ' ' + m[0],
      '<div class="stf-stats mini"><div><b>' + r.present + '</b><span>حضور</span></div><div class="' + (r.absent ? 'st-out' : '') + '"><b>' + r.absent + '</b><span>غياب</span></div><div><b>' + dur(r.mins) + '</b><span>ساعات</span></div><div class="' + (r.late ? 'st-late' : '') + '"><b>' + r.late + '</b><span>تأخير</span></div></div>' +
      (r.days.length ? '<div class="stf-dl">' + r.days.map(function (d) {
        var tg = ''; if (d.late) tg += '<span class="stf-tag ax-hl-off l">تأخير ' + d.late + ' د</span>'; if (d.over >= 30) tg += '<span class="stf-tag ax-hl-off x">إضافي ' + dur(d.over) + '</span>'; if (d.open) tg += '<span class="stf-tag ax-hl-off o">من غير انصراف</span>'; if (d.visits) tg += '<span class="stf-tag ax-hl-off x">🏥 ' + d.visits + '</span>';
        return '<div class="stf-dr" data-date="' + d.date + '"><b>' + DAYN[dowOf(d.date)] + ' ' + dmy(d.date) + '</b><span dir="ltr">' + hm(d.in_at) + ' ← ' + (d.out_at ? hm(d.out_at) : '…') + '</span>' + tg + '<em>' + dur(d.worked) + '</em></div>'; }).join('') + '</div>' : '<p class="stf-note">مفيش حضور في الشهر ده.</p>'),
      '<button class="btn btn-secondary" id="stf-ad">＋ إضافة حضور يدوي</button><button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>');
    [].forEach.call(document.querySelectorAll('.stf-dr'), function (row) { row.onclick = function () { var dt = row.dataset.date; closeModal(); dayModal(id, dt, r.name); }; });
    document.getElementById('stf-ad').onclick = function () {
      var def = S.report.month === today().slice(0, 7) ? today() : S.report.month + '-01';
      closeModal(); dayModal(id, def, r.name);
    };
  }

  /* ─ export ─ */
  function csv() {
    var R = S.report, head = ['الموظف', 'الوظيفة', 'أيام الحضور', 'أيام الغياب', 'الساعات', 'مرات التأخير', 'دقائق التأخير', 'إضافي', 'من غير انصراف', 'برّه المكان'];
    var lines = [head].concat(R.rows.filter(function (r) { return r.active || r.present; }).map(function (r) { return [r.name, r.job, r.present, r.absent, dur(r.mins), r.late, r.lateMin, dur(r.over), r.noOut, r.outside]; }));
    var txt = '﻿' + lines.map(function (l) { return l.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = 'attendance-' + R.month + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function printReport() {
    var R = S.report, m = R.month.split('-'), co = '';
    try { co = (DB.data.settings || {}).companyName || ''; } catch (e) {}
    var w = window.open('', '_blank'); if (!w) { T('اسمح بالنوافذ المنبثقة للطباعة', 'error'); return; }
    w.document.write('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>حضور ' + esc(R.month) + '</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#000}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #bbb;padding:7px 8px;text-align:right}th{background:#eee}</style><h1>' + esc(co) + ' — تقرير الحضور</h1><p>' + MON[+m[1] - 1] + ' ' + m[0] + '</p><table><thead><tr><th>الموظف</th><th>حضور</th><th>غياب</th><th>الساعات</th><th>تأخير</th><th>إضافي</th></tr></thead><tbody>' +
      R.rows.filter(function (r) { return r.active || r.present; }).map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + r.present + '</td><td>' + r.absent + '</td><td>' + dur(r.mins) + '</td><td>' + (r.late ? r.late + ' (' + r.lateMin + ' د)' : '—') + '</td><td>' + (r.over ? dur(r.over) : '—') + '</td></tr>'; }).join('') + '</tbody></table><script>onload=function(){print()}<\/script>');
    w.document.close();
  }

  window.renderStaff = render;
  window.AXStaff = { render: render, reload: load };
})();

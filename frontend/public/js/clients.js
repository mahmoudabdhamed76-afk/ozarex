/* ════════════════════════════════════════════════════════════════════
   ERP · «متابعة العملاء» (4.72 → 4.74) — تحت «الموظفين»
   · «الطلبات»: طلبات الورق اللي المراكز بتبعتها من اللينك (إشعار + رقم على الأيقونة)
   · «المراكز»: مجموعات تتفتح (ليهم لينك / من غير لينك)، وكل مركز يتفتح يطلع
     لينكه (قصير /c/xxxxxxxx) ونسخ وفتح وواتساب ولينك جديد وإيقاف.
   اللينكات نفسها اللي في «أعمار الديون» (settings._portal).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = { q: '', tab: 'req', open: {}, grp: { on: true, off: false }, rq: null, rf: 'open', newCount: 0, busy: false };
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function S() { var d = D(); if (!d.settings) d.settings = {}; return d.settings; }
  function A(k) { return Array.isArray(D()[k]) ? D()[k] : []; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function base() { return typeof API_BASE !== 'undefined' && API_BASE ? API_BASE : location.origin; }
  function url(tok) { return base().replace(/\/$/, '') + (String(tok).length === 6 ? '/' : String(tok).length <= 12 ? '/c/' : '/p/') + tok; }
  function phoneOf(c) { try { return typeof normalizeEgyptianPhone === 'function' ? normalizeEgyptianPhone(c.phone) : String(c.phone || '').replace(/\D/g, ''); } catch (e) { return ''; } }
  function company() { return S().companyName || 'Ozarex'; }
  function links() { return S()._portal || {}; }
  function isPage() { try { return currentPage === 'clients'; } catch (e) { return false; } }
  function isAdmin() { try { return currentUser && currentUser.role === 'admin'; } catch (e) { return false; } }
  function newToken() {   // short code (8 letters/digits) → /c/xxxxxxxx
    var AB = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', used = {}, L = links(), k, t;
    for (k in L) used[L[k]] = 1;
    do { var a = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(a); t = Array.from(a.slice(0, 6), function (b) { return AB.charAt(b % AB.length); }).join(''); } while (used[t] || !/\d/.test(t));
    return t;
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim(); }
  function api(method, path, body) {
    return fetch(base().replace(/\/$/, '') + '/api/portal' + path, { method: method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || 'محصلش — جرّب تاني'); return j; }); });
  }
  function ago(ts) {
    var p = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(ts || '')); if (!p) return '';
    var t = new Date(+p[1], +p[2] - 1, +p[3], +p[4], +p[5]).getTime(), m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'دلوقتي'; if (m < 60) return 'من ' + m + ' دقيقة'; var h = Math.round(m / 60); if (h < 24) return 'من ' + h + ' ساعة';
    var d = Math.round(h / 24); return d === 1 ? 'امبارح' : 'من ' + d + ' يوم';
  }

  /* ── styles live with the page (so it never shows unstyled from an old cached css) ── */
  function css() {
    if (document.getElementById('cl-css')) return;
    var s = document.createElement('style'); s.id = 'cl-css';
    s.textContent = [
      '.cl{--cl-c:var(--ax-card,rgba(255,255,255,.045));--cl-l:var(--ax-line,rgba(255,255,255,.09));--cl-a:#14b8a6}',
      '.cl-hd{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}.cl-hd h2{margin:0;font-size:24px}.cl-hd p{margin:4px 0 0;opacity:.7;font-size:13.5px;max-width:560px}',
      '.cl-tb{display:flex;gap:6px;padding:5px;border-radius:16px;background:var(--cl-c);border:1px solid var(--cl-l);margin-bottom:14px}',
      '.cl-tb button{flex:1;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;font-size:14.5px;padding:11px 10px;border-radius:12px;cursor:pointer;opacity:.7;display:flex;align-items:center;justify-content:center;gap:8px}',
      '.cl-tb button.on{background:var(--cl-a);color:#fff;opacity:1;box-shadow:0 8px 20px -10px var(--cl-a)}.cl-tb em{font-style:normal;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:12px;line-height:20px}',
      '.cl-st{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.cl-st div{background:var(--cl-c);border:1px solid var(--cl-l);border-radius:16px;padding:11px 13px}.cl-st b{display:block;font-size:21px}.cl-st span{font-size:12px;opacity:.7}.cl-st .ok b{color:#22c55e}',
      '.cl-q{width:100%;font:inherit;font-size:15px;padding:12px 14px;border-radius:14px;border:1px solid var(--cl-l);background:var(--cl-c);color:inherit;margin-bottom:12px}',
      '.cl-g{border:1px solid var(--cl-l);background:var(--cl-c);border-radius:18px;margin-bottom:10px;overflow:hidden}',
      '.cl-gh{display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer;user-select:none}.cl-gh b{font-size:15px}.cl-gh .ct{font-size:12.5px;opacity:.7}.cl-gh .cv{margin-inline-start:auto;transition:transform .25s;opacity:.6}.cl-g.op .cl-gh .cv{transform:rotate(180deg)}',
      '.cl-gh .dt{width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.15)}.cl-g.off .cl-gh .dt{background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.15)}',
      '.cl-gb{display:none;border-top:1px solid var(--cl-l)}.cl-g.op .cl-gb{display:block}',
      '.cl-gx{display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--cl-l)}',
      '.cl-r{border-bottom:1px solid var(--cl-l)}.cl-r:last-child{border-bottom:0}',
      '.cl-rh{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer}.cl-rh:active{background:rgba(127,127,127,.06)}',
      '.cl-av{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(20,184,166,.15);color:var(--cl-a);font-weight:800;flex:none}',
      '.cl-n{flex:1;min-width:0}.cl-n b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cl-n small{font-size:12px;opacity:.65}',
      '.cl-b{text-align:left;flex:none}.cl-b b{display:block;font-size:15px}.cl-b small{font-size:11px;opacity:.65}.cl-b.d b{color:#f87171}',
      '.cl-rb{display:none;padding:0 14px 14px}.cl-r.op .cl-rb{display:block;animation:clIn .25s both}@keyframes clIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
      '.cl-l{display:flex;gap:6px;margin-bottom:8px}.cl-l input{flex:1;min-width:0;font:inherit;font-size:13.5px;direction:ltr;padding:10px 12px;border-radius:12px;border:1px solid var(--cl-l);background:transparent;color:inherit}',
      '.cl-a{display:flex;flex-wrap:wrap;gap:6px}.cl-a .btn{flex:1;min-width:88px;justify-content:center}.cl-wa{color:#22c55e!important}',
      '.cl-rq{border:1px solid var(--cl-l);background:var(--cl-c);border-radius:18px;padding:14px;margin-bottom:10px;animation:clIn .3s both}',
      '.cl-rq.new{border-color:rgba(239,68,68,.55);box-shadow:0 0 0 3px rgba(239,68,68,.08)}',
      '.cl-rq .h{display:flex;align-items:center;gap:10px}.cl-rq .h b{font-size:15px}.cl-rq .h small{display:block;font-size:12px;opacity:.65}.cl-rq .h .tg{margin-inline-start:auto}',
      '.cl-rq ul{list-style:none;padding:0;margin:10px 0;display:flex;flex-direction:column;gap:6px}.cl-rq li{display:flex;align-items:baseline;gap:8px;background:rgba(127,127,127,.07);border-radius:12px;padding:9px 12px}.cl-rq li b{font-size:17px}.cl-rq li span{opacity:.75;font-size:13px}',
      '.cl-rq .nt{font-size:13px;opacity:.8;margin:0 0 10px}.cl-tg{font-size:11.5px;font-weight:700;border-radius:8px;padding:3px 9px;white-space:nowrap}',
      '.cl-tg.new{background:rgba(239,68,68,.15);color:#f87171}.cl-tg.ok{background:rgba(245,158,11,.15);color:#fbbf24}.cl-tg.sent{background:rgba(34,197,94,.15);color:#4ade80}.cl-tg.no{background:rgba(148,163,184,.15);color:#94a3b8}',
      '.cl-rf{display:flex;gap:6px;margin-bottom:12px}.cl-rf button{border:1px solid var(--cl-l);background:transparent;color:inherit;font:inherit;font-size:13px;padding:7px 14px;border-radius:999px;cursor:pointer;opacity:.75}.cl-rf button.on{background:var(--cl-a);border-color:transparent;color:#fff;opacity:1}',
      '.cl-emp{text-align:center;padding:36px 12px;opacity:.7;border:1px dashed var(--cl-l);border-radius:18px}.cl-emp i{font-style:normal;font-size:34px;display:block;margin-bottom:6px}',
      '.cl-note{font-size:12.5px;opacity:.6;margin-top:12px}',
      '.nav-item .badge.cl-badge{background:#ef4444!important;color:#fff!important;animation:clPulse 1.6s ease-in-out infinite}@keyframes clPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── data ── */
  function rows() {
    var m = today().slice(0, 7), L = links(), byC = {};
    A('issuances').forEach(function (i) {
      var x = byC[i.customerId] || (byC[i.customerId] = { n: 0, val: 0, last: '' });
      if (String(i.date || '').slice(0, 7) === m) { x.n++; x.val += Number(i.total) || 0; }
      if (String(i.date || '') > x.last) x.last = String(i.date || '');
    });
    return A('customers').filter(function (c) { return c && !c.archived; }).map(function (c) { var x = byC[c.id] || { n: 0, val: 0, last: '' }; return { c: c, tok: L[c.id] || '', n: x.n, val: x.val, last: x.last, bal: Number(c.balance) || 0 }; });
  }

  /* ── the centers tab ── */
  function rowHtml(r) {
    var c = r.c, ph = phoneOf(c), op = ui.open[c.id];
    return '<div class="cl-r' + (op ? ' op' : '') + '" data-c="' + c.id + '"><div class="cl-rh" onclick="AXClients.toggle(\'' + c.id + '\')"><span class="cl-av">' + esc(String(c.name || '?').trim().charAt(0)) + '</span>' +
      '<div class="cl-n"><b>' + esc(c.name) + '</b><small>' + (r.n ? '🚚 ' + r.n + ' صرف الشهر ده' : (r.last ? 'آخر صرف ' + esc(r.last) : 'مفيش صرف لسه')) + '</small></div>' +
      '<div class="cl-b ' + (r.bal > 0.5 ? 'd' : '') + '"><b>' + num(Math.max(0, r.bal)) + '</b><small>' + (r.bal > 0.5 ? 'عليه' : 'مسدد') + '</small></div></div>' +
      '<div class="cl-rb">' + (r.tok
        ? '<div class="cl-l"><input readonly value="' + esc(url(r.tok)) + '" onclick="this.select()"><button class="btn btn-secondary btn-sm" onclick="AXClients.copy(\'' + c.id + '\')">نسخ</button></div>' +
          '<div class="cl-a"><a class="btn btn-secondary btn-sm" href="' + esc(url(r.tok)) + '" target="_blank" rel="noopener">👁 فتح</a>' +
          (ph ? '<button class="btn btn-secondary btn-sm cl-wa" onclick="AXClients.wa(\'' + c.id + '\')">واتساب</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="AXClients.rotate(\'' + c.id + '\')">↻ لينك جديد</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="AXClients.stop(\'' + c.id + '\')">⏸ إيقاف</button></div>'
        : '<div class="cl-a"><button class="btn btn-primary btn-sm" onclick="AXClients.make(\'' + c.id + '\')">🔗 اعمل لينك للمركز ده</button></div>') +
      '</div></div>';
  }
  function group(key, title, list, extra) {
    var op = ui.q ? true : ui.grp[key];
    return '<div class="cl-g ' + key + (op ? ' op' : '') + '"><div class="cl-gh" onclick="AXClients.grp(\'' + key + '\')"><span class="dt"></span><b>' + title + '</b><span class="ct">' + list.length + ' مركز</span><span class="cv">⌄</span></div>' +
      '<div class="cl-gb">' + (extra || '') + (list.length ? list.map(rowHtml).join('') : '<div class="cl-note" style="padding:14px">مفيش مراكز هنا' + (ui.q ? ' بالبحث ده' : '') + '.</div>') + '</div></div>';
  }
  function centersHtml() {
    var all = rows(), q = norm(ui.q);
    var f = all.filter(function (r) { return !q || norm(r.c.name).indexOf(q) >= 0 || String(r.c.phone || '').indexOf(ui.q) >= 0; })
      .sort(function (a, b) { return b.n - a.n || b.bal - a.bal || String(a.c.name).localeCompare(String(b.c.name), 'ar'); });
    var on = f.filter(function (r) { return r.tok; }), off = f.filter(function (r) { return !r.tok; }), allOn = all.filter(function (r) { return r.tok; }).length;
    var longN = all.filter(function (r) { return r.tok && r.tok.length > 6; }).length;
    return '<div class="cl-st"><div><b>' + all.length + '</b><span>مركز ومستشفى</span></div><div class="ok"><b>' + allOn + '</b><span>ليهم لينك</span></div><div><b>' + (all.length - allOn) + '</b><span>من غير لينك</span></div></div>' +
      '<input class="cl-q" placeholder="🔍 دوّر على مركز بالاسم أو التليفون" value="' + esc(ui.q) + '" oninput="AXClients.search(this.value)">' +
      group('on', '🔗 ليهم لينك', on, longN ? '<div class="cl-gx"><button class="btn btn-secondary btn-sm" onclick="AXClients.shortAll()">✂ اختصر ' + longN + ' لينك طويل</button></div>' : '') +
      group('off', '⚪ من غير لينك', off, off.length ? '<div class="cl-gx"><button class="btn btn-primary btn-sm" onclick="AXClients.makeAll()">🔗 اعمل لينك لكل المراكز دي (' + (all.length - allOn) + ')</button></div>' : '') +
      '<p class="cl-note">دوس على أي مركز يتفتح لينكه. المركز بيشوف من اللينك: المستحق عليه، وكل شهر سحب كام واتحصّل منه كام برسم بياني، والورق اللي وصله، وفواتيره، وكشف حسابه — وكمان يقدر يطلب ورق.</p>';
  }

  /* ── the requests tab ── */
  var ST = { new: 'جديد', ok: 'اتأكد — بيتجهز', sent: 'اتسلّم', no: 'اتلغى' };
  function reqHtml() {
    if (!ui.rq) { loadReq(); return '<div class="cl-emp"><i>⏳</i>بنحمّل الطلبات…</div>'; }
    var list = ui.rq.filter(function (r) { return ui.rf === 'all' || r.status === 'new' || r.status === 'ok'; });
    var h = '<div class="cl-rf"><button class="' + (ui.rf === 'open' ? 'on' : '') + '" onclick="AXClients.rf(\'open\')">المفتوحة</button><button class="' + (ui.rf === 'all' ? 'on' : '') + '" onclick="AXClients.rf(\'all\')">الكل</button></div>';
    if (!list.length) return h + '<div class="cl-emp"><i>📭</i>' + (ui.rf === 'open' ? 'مفيش طلبات مفتوحة.' : 'لسه مفيش طلبات.') + '<br><small>المراكز بتطلب ورق من اللينك بتاعها، والطلب بيظهر هنا بإشعار.</small></div>';
    return h + list.map(function (r) {
      var c = A('customers').filter(function (x) { return x.id === r.customer_id; })[0], ph = c ? phoneOf(c) : '';
      return '<div class="cl-rq ' + r.status + '"><div class="h"><span class="cl-av">📦</span><div><b>' + esc(r.customer_name) + '</b><small>' + ago(r.created_at) + (r.branch_name ? ' · ' + esc(r.branch_name) : '') + (r.contact ? ' · ' + esc(r.contact) : '') + '</small></div><span class="cl-tg ' + r.status + '">' + ST[r.status] + '</span></div>' +
        '<ul>' + r.items.map(function (x) { return '<li><b>' + num(x.qty) + '</b><span>' + esc(x.unit || '') + '</span><span style="opacity:1">' + esc(x.name) + '</span></li>'; }).join('') + '</ul>' +
        (r.note ? '<p class="nt">📝 ' + esc(r.note) + '</p>' : '') + (r.done_by && r.status !== 'new' ? '<p class="nt" style="opacity:.55">' + esc(ST[r.status]) + ' بواسطة ' + esc(r.done_by) + '</p>' : '') +
        '<div class="cl-a">' +
          (r.status === 'new' ? '<button class="btn btn-primary btn-sm" onclick="AXClients.st(' + r.id + ',\'ok\')">✓ تأكيد</button>' : '') +
          (r.status === 'new' || r.status === 'ok' ? '<button class="btn btn-secondary btn-sm" onclick="AXClients.st(' + r.id + ',\'sent\')">🚚 اتسلّم</button>' : '') +
          (r.status === 'new' || r.status === 'ok' ? '<button class="btn btn-ghost btn-sm" onclick="AXClients.st(' + r.id + ',\'no\')">إلغاء</button>' : '<button class="btn btn-ghost btn-sm" onclick="AXClients.del(' + r.id + ')">🗑 مسح</button>') +
          (ph ? '<button class="btn btn-secondary btn-sm cl-wa" onclick="AXClients.waReq(' + r.id + ')">واتساب</button>' : '') +
          (typeof openIssuanceForm === 'function' && c && r.status !== 'no' && r.status !== 'sent' ? '<button class="btn btn-secondary btn-sm" onclick="AXClients.issue(\'' + c.id + '\')">🧾 صرف</button>' : '') +
        '</div></div>';
    }).join('');
  }
  function loadReq() {
    if (ui.busy) return; ui.busy = true;
    api('GET', '/requests').then(function (r) { ui.busy = false; ui.rq = r.list || []; setCount(r.newCount || 0); if (isPage()) render(); })
      .catch(function (e) { ui.busy = false; ui.rq = []; if (isPage()) { render(); T(e.message, 'error'); } });
  }

  function render() {
    var root = document.getElementById('cl-root'); if (!root) return; css();
    var all = rows(), on = all.filter(function (r) { return r.tok; }).length;
    root.innerHTML =
      '<div class="cl-hd"><div><h2>متابعة العملاء</h2><p>لينك لكل مركز ومستشفى يتابع منه حسابه وسحبه كل شهر ويطلب ورق — من غير ما يدخل البرنامج.</p></div></div>' +
      '<div class="cl-tb"><button class="' + (ui.tab === 'req' ? 'on' : '') + '" onclick="AXClients.tab(\'req\')">📦 الطلبات' + (ui.newCount ? '<em>' + ui.newCount + '</em>' : '') + '</button>' +
      '<button class="' + (ui.tab === 'centers' ? 'on' : '') + '" onclick="AXClients.tab(\'centers\')">🏥 المراكز <span style="opacity:.7;font-weight:500">' + on + '/' + all.length + '</span></button></div>' +
      '<div id="cl-body">' + (ui.tab === 'req' ? reqHtml() : centersHtml()) + '</div>';
  }

  /* ── badge on the menu icon ── */
  function setCount(n) { ui.newCount = Number(n) || 0; paintBadge(); }
  function paintBadge() {
    css();
    [].forEach.call(document.querySelectorAll('.nav-item'), function (it) {
      if (!/navigate\('clients'\)/.test(it.getAttribute('onclick') || '')) return;
      var b = it.querySelector('.cl-badge');
      if (!ui.newCount) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'badge cl-badge'; it.appendChild(b); }
      b.textContent = ui.newCount > 9 ? '9+' : ui.newCount;
    });
    try { var mb = document.querySelector('[data-page="clients"] .cl-badge'); if (mb) mb.textContent = ui.newCount; } catch (e) {}
  }
  function refreshCount() { if (!isAdmin()) return; api('GET', '/count').then(function (r) { setCount(r.newCount); }).catch(function () {}); }
  /* the sidebar is redrawn by the app now and then → put the badge back */
  try {
    var mo = new MutationObserver(function () { if (ui.newCount && !document.querySelector('.nav-item .cl-badge')) paintBadge(); });
    var startObs = function () { var n = document.getElementById('sidebar-nav'); if (n) mo.observe(n, { childList: true }); else setTimeout(startObs, 800); };
    startObs();
  } catch (e) {}

  /* 4.76 · a new order on a computer → a big card in the middle of the screen (animated) */
  var POPQ = [];
  function popCss() {
    if (document.getElementById('cl-pop-css')) return;
    var s = document.createElement('style'); s.id = 'cl-pop-css';
    s.textContent = [
      '.clp-ov{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(15,23,42,.38);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:clpF .25s ease both;padding:16px}',
      '.clp-ov.out{animation:clpF .22s ease reverse both}.clp-ov.out .clp{animation:clpOut .22s ease both}',
      '@keyframes clpF{from{opacity:0}to{opacity:1}}@keyframes clpOut{to{opacity:0;transform:scale(.92) translateY(10px)}}',
      '.clp{width:min(520px,100%);background:#fff;color:#334155;border:1px solid #E5E7EB;border-radius:30px;padding:34px 34px 28px;text-align:center;box-shadow:0 30px 80px -20px rgba(15,23,42,.45);animation:clpIn .55s cubic-bezier(.2,1.4,.35,1) both;font-family:inherit}',
      '@keyframes clpIn{from{opacity:0;transform:scale(.7) translateY(24px)}to{opacity:1;transform:none}}',
      '.clp-hd{display:flex;align-items:center;justify-content:center;margin-bottom:22px}',
      '.clp-dot{width:16px;height:16px;border-radius:50%;background:#A8D8AE;flex:none;transform:scale(0);animation:clpPop .4s .55s cubic-bezier(.2,1.6,.4,1) forwards}',
      '.clp-ln{height:3px;flex:1;max-width:150px;background:#BFE5C4;border-radius:3px;transform:scaleX(0);animation:clpLn .45s .3s cubic-bezier(.2,.8,.2,1) forwards}.clp-ln.l{transform-origin:left}.clp-ln.r{transform-origin:right}',
      '@keyframes clpLn{to{transform:scaleX(1)}}@keyframes clpPop{to{transform:scale(1)}}',
      '.clp-ring{position:relative;width:118px;height:118px;border-radius:50%;background:#F1FBF3;display:grid;place-items:center;flex:none;margin:0 14px;animation:clpPop2 .5s .1s cubic-bezier(.2,1.6,.4,1) both}',
      '@keyframes clpPop2{from{transform:scale(0)}to{transform:scale(1)}}',
      '.clp-ring::after{content:"";position:absolute;inset:0;border-radius:50%;border:3px solid #A8D8AE;opacity:0;animation:clpWave 1.8s 1s ease-out infinite}',
      '@keyframes clpWave{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.45)}}',
      '.clp-ck{width:64px;height:64px;border-radius:50%;background:#58A85E;display:grid;place-items:center;box-shadow:0 10px 24px -8px rgba(88,168,94,.7)}',
      '.clp-ck svg{width:34px;height:34px}.clp-ck path{stroke:#fff;stroke-width:3.4;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:30;stroke-dashoffset:30;animation:clpCk .45s .55s ease forwards}',
      '@keyframes clpCk{to{stroke-dashoffset:0}}',
      '.clp h3{margin:0 0 4px;font-size:25px;color:#1F2937!important;-webkit-text-fill-color:#1F2937!important;background:none!important;font-weight:800;opacity:1!important}',
      '.clp .ctr{font-size:17px;color:#475569;margin:0 0 16px}',
      '.clp ul{list-style:none;padding:0;margin:0 0 14px;display:flex;flex-direction:column;gap:8px}',
      '.clp li{display:flex;align-items:center;gap:10px;background:#F6FAF6;border:1px solid #E3F1E5;border-radius:16px;padding:12px 16px;opacity:0;animation:clpRow .4s cubic-bezier(.2,.8,.2,1) forwards}',
      '@keyframes clpRow{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '.clp li b{font-size:24px;color:#2F855A;font-weight:800;min-width:64px}.clp li span{font-size:17px;color:#334155;font-weight:600}',
      '.clp .mt2{font-size:14px;color:#64748B;margin:0 0 6px}',
      '.clp-bt{display:flex;flex-direction:column;gap:10px;margin-top:20px}',
      '.clp-ok{border:1px solid #8EE29B;background:#69C973;color:#fff;font-weight:800;font-size:19px;font-family:inherit;padding:15px;border-radius:14px;cursor:pointer;box-shadow:0 0 0 4px rgba(105,201,115,.14);transition:transform .15s,filter .15s}.clp-ok:hover{filter:brightness(1.05);transform:translateY(-1px)}',
      '.clp-ok:focus,.clp-go:focus{outline:none!important;box-shadow:0 0 0 4px rgba(105,201,115,.25)!important}.clp-go:focus{box-shadow:none!important;text-decoration:underline}',
      '.clp-go{border:0;background:transparent;color:#2F855A;font-weight:700;font-size:15px;font-family:inherit;padding:8px;cursor:pointer}',
      '.clp-more{display:inline-block;margin-top:4px;font-size:13px;color:#fff;background:#ef4444;border-radius:999px;padding:3px 10px}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function showPop(m) {
    popCss();
    var ov = document.querySelector('.clp-ov');
    if (ov) { POPQ.push(m); var mo = ov.querySelector('.clp-more'); if (mo) { mo.textContent = '+' + POPQ.length + ' طلب كمان'; mo.style.display = ''; } return; }
    ov = document.createElement('div'); ov.className = 'clp-ov ax-hl-off';
    var items = Array.isArray(m.items) ? m.items : [];
    ov.innerHTML = '<div class="clp" role="dialog" aria-modal="true"><div class="clp-hd"><span class="clp-dot"></span><span class="clp-ln l"></span>' +
      '<span class="clp-ring"><span class="clp-ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></span><span class="clp-ln r"></span><span class="clp-dot"></span></div>' +
      '<h3>📦 طلب ورق جديد</h3><p class="ctr">' + esc(m.center || '') + '</p>' +
      (items.length ? '<ul>' + items.map(function (x, i) { return '<li style="animation-delay:' + (0.7 + i * 0.08).toFixed(2) + 's"><b>' + num(x.qty) + '</b><span>' + esc(x.name) + '</span></li>'; }).join('') + '</ul>' : '<p class="mt2">' + esc(m.text || '') + '</p>') +
      (m.contact ? '<p class="mt2">👤 ' + esc(m.contact) + '</p>' : '') + (m.note ? '<p class="mt2">📝 ' + esc(m.note) + '</p>' : '') +
      '<span class="clp-more" style="display:none"></span>' +
      '<div class="clp-bt"><button class="clp-ok" type="button">حسنا</button><button class="clp-go" type="button">افتح الطلبات ←</button></div></div>';
    document.body.appendChild(ov);
    var close = function (then) {
      ov.classList.add('out'); setTimeout(function () { ov.remove(); if (then) then(); else if (POPQ.length) showPop(POPQ.shift()); }, 220);
    };
    ov.querySelector('.clp-ok').onclick = function () { close(); };
    ov.querySelector('.clp-go').onclick = function () { POPQ = []; close(function () { ui.tab = 'req'; ui.rq = null; if (isPage()) render(); else if (typeof navigate === 'function') navigate('clients'); }); };
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var key = function (e) { if (!document.body.contains(ov)) return document.removeEventListener('keydown', key); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); document.removeEventListener('keydown', key); close(); } };
    document.addEventListener('keydown', key);
  }
  document.addEventListener('ax:sse', function (ev) {
    var m = ev.detail || {}; if (m.event !== 'portal' || !isAdmin()) return;
    if (m.kind === 'order') {
      if (window.innerWidth >= 760) showPop(m); else T(m.text || 'طلب ورق جديد 📦', 'success');
      try { var Ac = window.AudioContext || window.webkitAudioContext; if (Ac) { var ac = new Ac(), o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.setValueAtTime(.12, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .5); o.start(); o.stop(ac.currentTime + .5); } } catch (e) {}
    }
    if (isPage()) { ui.rq = ui.rq || []; loadReq(); } else refreshCount();
  });
  var tries = 0; (function boot() { if (typeof currentUser === 'undefined' || !currentUser) { if (++tries < 80) setTimeout(boot, 500); return; } refreshCount(); setInterval(refreshCount, 120000); })();

  /* ── actions ── */
  function save(p) { S()._portal = p; if (typeof DB !== 'undefined' && DB.save) DB.save(); }
  function make(cid) { var p = Object.assign({}, links()); p[cid] = newToken(); save(p); ui.open[cid] = true; T('اتعمل اللينك ✅'); render(); }
  function makeAll() {
    var p = Object.assign({}, links()), n = 0;
    A('customers').forEach(function (c) { if (c && !c.archived && !p[c.id]) { S()._portal = p; p[c.id] = newToken(); n++; } });
    if (!n) return; save(p); ui.grp.on = true; T('اتعمل ' + n + ' لينك ✅'); render();
  }
  function ask(msg, go) { if (typeof confirmDialog === 'function') confirmDialog(msg, go); else if (confirm(msg)) go(); }
  function shortAll() {
    ask('هتتعمل لينكات قصيرة بدل الطويلة، واللينكات الطويلة القديمة هتقف — لازم تبعت الجديدة للمراكز. تكمل؟', function () {
      var p = Object.assign({}, links()), n = 0; Object.keys(p).forEach(function (k) { if (String(p[k]).length > 6) { S()._portal = p; p[k] = newToken(); n++; } });
      save(p); T('اتختصر ' + n + ' لينك — ابعت اللينكات الجديدة للمراكز'); render();
    });
  }
  function rotate(cid) { ask('تعمل لينك جديد؟ اللينك القديم هيقف على طول.', function () { var p = Object.assign({}, links()); p[cid] = newToken(); save(p); T('اتعمل لينك جديد — القديم وقف'); render(); }); }
  function stop(cid) { ask('توقف اللينك ده؟ المركز مش هيقدر يفتحه تاني.', function () { var p = Object.assign({}, links()); delete p[cid]; save(p); T('اللينك اتوقف', 'info'); render(); }); }
  function copy(cid) {
    var tok = links()[cid]; if (!tok) return; var u = url(tok);
    try { navigator.clipboard.writeText(u).then(function () { T('اتنسخ ✓'); }, function () { T('انسخه من الخانة', 'info'); }); } catch (e) { T('انسخه من الخانة', 'info'); }
  }
  function wa(cid) {
    var c = A('customers').filter(function (x) { return x.id === cid; })[0], tok = links()[cid]; if (!c || !tok) return;
    var txt = 'السلام عليكم ' + c.name + ' 🌿\nده لينك متابعة حسابكم عند *' + company() + '*\nتقدروا تشوفوا منه كل شهر سحبتوا كام ودفعتوا كام، والفواتير وكشف الحساب — وكمان تطلبوا ورق منه على طول:\n' + url(tok) + '\n\nشكراً لتعاملكم معانا 🙏';
    window.open('https://wa.me/' + phoneOf(c) + '?text=' + encodeURIComponent(txt), '_blank');
  }
  function setSt(id, st) {
    api('POST', '/request', { id: id, status: st }).then(function () {
      (ui.rq || []).forEach(function (r) { if (r.id === id) r.status = st; });
      setCount((ui.rq || []).filter(function (r) { return r.status === 'new'; }).length);
      T(st === 'ok' ? 'اتأكد الطلب ✓' : st === 'sent' ? 'اتعلّم إنه اتسلّم 🚚' : 'اتلغى الطلب', st === 'no' ? 'info' : 'success'); render();
    }).catch(function (e) { T(e.message, 'error'); });
  }
  function del(id) { ask('تمسح الطلب ده من القايمة؟', function () { api('POST', '/request/delete', { id: id }).then(function () { ui.rq = (ui.rq || []).filter(function (r) { return r.id !== id; }); render(); }).catch(function (e) { T(e.message, 'error'); }); }); }
  function waReq(id) {
    var r = (ui.rq || []).filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var c = A('customers').filter(function (x) { return x.id === r.customer_id; })[0]; if (!c) return;
    var what = r.items.map(function (x) { return '• ' + x.qty + ' ' + (x.unit || '') + ' ' + x.name; }).join('\n');
    var txt = 'السلام عليكم ' + c.name + ' 🌿\nطلبكم وصلنا ✅\n' + what + '\n' + (r.status === 'sent' ? 'واتسلّم — شكراً لكم 🙏' : 'وجاري تجهيزه، هنبلغكم بميعاد التسليم.') + '\n' + company();
    window.open('https://wa.me/' + phoneOf(c) + '?text=' + encodeURIComponent(txt), '_blank');
  }
  function issue(cid) { try { openIssuanceForm(cid); } catch (e) {} }

  window.renderClients = function () {
    var root = document.getElementById('page-content'); if (!root) return;
    css(); root.innerHTML = '<div class="cl ax-hl-off" id="cl-root"></div>';
    if (ui.tab === 'req') { ui.rq = null; }
    render();
  };
  window.AXClients = {
    render: render, make: make, makeAll: makeAll, shortAll: shortAll, rotate: rotate, stop: stop, copy: copy, wa: wa,
    st: setSt, del: del, _pop: showPop, waReq: waReq, issue: issue, count: function () { return ui.newCount; }, refresh: refreshCount,
    tab: function (t) { ui.tab = t; if (t === 'req') ui.rq = null; render(); },
    rf: function (f) { ui.rf = f; render(); },
    grp: function (k) { ui.grp[k] = !ui.grp[k]; render(); },
    toggle: function (cid) { ui.open[cid] = !ui.open[cid]; var el = document.querySelector('.cl-r[data-c="' + cid + '"]'); if (el) el.classList.toggle('op', !!ui.open[cid]); else render(); },
    search: function (q) { ui.q = String(q || ''); clearTimeout(ui.t); ui.t = setTimeout(function () { render(); var i = document.querySelector('.cl-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 220); }
  };
})();

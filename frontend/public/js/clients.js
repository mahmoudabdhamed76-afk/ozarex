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
          '<button class="btn btn-secondary btn-sm" onclick="AXClients.qr(\'' + c.id + '\')">▦ باركود</button>' +
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
    var ow = owing();
    var dueBar = canDue() ? '<div class="cl-g" style="padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:22px">' + (dueOn() ? '🔔' : '🔕') + '</span><div style="flex:1;min-width:180px"><b>تذكير يومي بالمراكز المتأخرة</b><div style="font-size:12.5px;opacity:.7">' + ow.length + ' مركز عليه فلوس من أسبوع أو أكتر — كل واحد بيطلعلك مرة في اليوم في وقت عشوائي</div></div>' +
      '<button class="btn btn-secondary btn-sm" onclick="AXClients.dueTry()">جرّب</button><button class="btn ' + (dueOn() ? 'btn-ghost' : 'btn-primary') + ' btn-sm" onclick="AXClients.dueToggle()">' + (dueOn() ? 'إيقاف' : 'تشغيل') + '</button></div>' : '';
    if (canStock()) { var sl = stockList(), sr = sl.filter(function (x) { return x.st === 'r'; }).length, so = sl.filter(function (x) { return x.st === 'o'; }).length;
      dueBar += '<div class="cl-g" style="padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:22px">' + (stockOn() ? '📦' : '🔕') + '</span><div style="flex:1;min-width:180px"><b>تقرير المخزن اليومي</b><div style="font-size:12.5px;opacity:.7">كل يوم الصبح: ' + sl.length + ' صنف · ' + sr + ' ناقص · ' + so + ' قرب يخلص</div></div>' +
        '<button class="btn btn-secondary btn-sm" onclick="AXClients.stockShow()">اعرض دلوقتي</button><button class="btn ' + (stockOn() ? 'btn-ghost' : 'btn-primary') + ' btn-sm" onclick="AXClients.stockToggle()">' + (stockOn() ? 'إيقاف' : 'تشغيل') + '</button></div>'; }
    return dueBar + '<div class="cl-st"><div><b>' + all.length + '</b><span>مركز ومستشفى</span></div><div class="ok"><b>' + allOn + '</b><span>ليهم لينك</span></div><div><b>' + (all.length - allOn) + '</b><span>من غير لينك</span></div></div>' +
      '<input class="cl-q" placeholder="🔍 دوّر على مركز بالاسم أو التليفون" value="' + esc(ui.q) + '" oninput="AXClients.search(this.value)">' +
      group('on', '🔗 ليهم لينك', on, (on.length || longN) ? '<div class="cl-gx">' + (on.length ? '<button class="btn btn-secondary btn-sm" onclick="AXClients.qrPrint()">🖨 اطبع باركود كل المراكز (' + allOn + ')</button>' : '') + (longN ? '<button class="btn btn-secondary btn-sm" onclick="AXClients.shortAll()">✂ اختصر ' + longN + ' لينك طويل</button>' : '') + '</div>' : '') +
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
    if (!EMPS && list.some(function (r) { return r.kind === 'maint'; })) loadEmps(function () { if (isPage() && ui.tab === 'req') render(); });
    return h + list.map(function (r) {
      var c = A('customers').filter(function (x) { return x.id === r.customer_id; })[0], ph = c ? phoneOf(c) : '';
      if (r.kind === 'maint') {
        var it = r.items && !Array.isArray(r.items) ? r.items : {}, MS = { new: 'جديد', ok: 'اتحوّل لفني', sent: 'اتصلحت', no: 'اتلغى' };
        return '<div class="cl-rq ' + r.status + '"><div class="h"><span class="cl-av" style="background:rgba(249,115,22,.15)">' + (it.urgent ? '🚨' : '🛠') + '</span><div><b>' + esc(r.customer_name) + ' — طلب صيانة</b><small>' + ago(r.created_at) + (r.branch_name ? ' · ' + esc(r.branch_name) : '') + (r.contact ? ' · ' + esc(r.contact) : '') + '</small></div><span class="cl-tg ' + r.status + '">' + MS[r.status] + '</span></div>' +
          phStrip(r.id, r.photos, 'cl-ph') + '<ul><li>' + (it.device ? '<span style="opacity:1;font-weight:800;color:#f59e0b">' + esc(it.device) + '</span>' : '') + '<span style="opacity:1">' + esc(r.note || '') + '</span></li></ul>' +
          (it.urgent ? '<p class="nt" style="color:#f87171;font-weight:700">🚨 مستعجل — الشغل واقف</p>' : '') + (r.reply ? '<p class="nt" style="opacity:.7">👷 ' + esc(r.reply) + (r.done_by ? ' · بواسطة ' + esc(r.done_by) : '') + '</p>' : '') +
          '<div class="cl-a">' + (r.status === 'new' || r.status === 'ok' ? (EMPS ? empSel(r.id) + '<button class="btn btn-primary btn-sm" onclick="AXClients.assign(' + r.id + ', this.previousElementSibling)">👷 حوّل للموظف</button>' : '<span class="cl-note">بنحمّل الموظفين…</span>') +
            '<button class="btn btn-secondary btn-sm" onclick="AXClients.st(' + r.id + ',\'sent\')">✅ اتصلحت</button><button class="btn btn-ghost btn-sm" onclick="AXClients.st(' + r.id + ',\'no\')">إلغاء</button>' : '<button class="btn btn-ghost btn-sm" onclick="AXClients.del(' + r.id + ')">🗑 مسح</button>') +
          (ph ? '<button class="btn btn-secondary btn-sm cl-wa" onclick="AXClients.waReq(' + r.id + ')">واتساب</button>' : '') + '</div></div>';
      }
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
  var EMPS = null;
  function loadEmps(cb) { if (EMPS) return cb(EMPS); api('GET', '/emps').then(function (r) { EMPS = r.list || []; cb(EMPS); }).catch(function () { cb([]); }); }
  function empSel(id) { return '<select class="form-control cl-emp" data-rq="' + id + '" style="flex:1;min-width:150px">' + '<option value="">اختار الموظف…</option>' + (EMPS || []).map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + (e.job ? ' — ' + esc(e.job) : '') + '</option>'; }).join('') + '</select>'; }
  function assign(id, sel) {
    var v = sel && sel.value; if (!v) return T('اختار الموظف الأول', 'error');
    api('POST', '/assign', { id: id, emp_id: v }).then(function (r) {
      (ui.rq || []).forEach(function (x) { if (x.id === id) { x.status = 'ok'; x.reply = 'اتحوّل لـ ' + r.emp; } });
      setCount((ui.rq || []).filter(function (x) { return x.status === 'new'; }).length);
      T('🛠 اتحوّلت المشكلة لـ ' + r.emp + ' — وصله إشعار بالمهمة'); if (isPage()) render(); else refreshCount();
    }).catch(function (e) { T(e.message, 'error'); });
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
      '.clp-ck path.lg{stroke-dasharray:80;stroke-dashoffset:80;animation:clpCk .9s .55s ease forwards}',
      '.clp .amt{font-size:44px;font-weight:800;color:#2F855A;line-height:1.1;margin:6px 0 2px;font-variant-numeric:tabular-nums;animation:clpRow .5s .6s both}.clp .amt small{font-size:18px;color:#64748B;font-weight:700}',
      '.clp .late{display:inline-block;background:#FEF3C7;color:#B45309;font-weight:800;font-size:15px;border-radius:999px;padding:5px 14px;margin:6px 0 12px;animation:clpRow .5s .7s both}',
      '.clp .late.hot{background:#FEE2E2;color:#B91C1C}',
      '.clp-two{display:flex;gap:8px}.clp-b2{flex:1;border:1px solid #CDEBD1;background:#F1FBF3;color:#2F855A;font-weight:700;font-size:15px;font-family:inherit;padding:12px 8px;border-radius:14px;cursor:pointer}.clp-b2:hover{background:#E3F6E6}.clp-b2.wa{color:#15803D}',
      '.clp-b2:focus{outline:none!important}',
      '.clp-sk{display:flex;gap:6px;justify-content:center;margin:4px 0 12px;flex-wrap:wrap}.clp-sk span{font-size:13px;font-weight:800;border-radius:999px;padding:5px 12px}',
      '.clp-sk .r,.clp-tg.r{background:#FEE2E2;color:#B91C1C}.clp-sk .o,.clp-tg.o{background:#FEF3C7;color:#B45309}.clp-sk .g,.clp-tg.g{background:#DCFCE7;color:#15803D}',
      '.clp-sl{max-height:min(42vh,340px);overflow:auto;text-align:right;margin:0 -6px;padding:0 6px}',
      '.clp-sl .sr{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#F8FAFC;margin-bottom:6px;opacity:0;animation:clpRow .35s cubic-bezier(.2,.8,.2,1) forwards}',
      '.clp-sl .sr.r{background:#FEF2F2}.clp-sl .sr.o{background:#FFFBEB}.clp-sl .sr .nm{flex:1;min-width:0;font-weight:700;font-size:14.5px;color:#1F2937}',
      '.clp-sl .sr .q{font-weight:800;font-size:19px;color:#0F172A;font-variant-numeric:tabular-nums}.clp-sl .sr .u{font-size:12px;color:#64748B;margin-inline-start:3px}',
      '.clp-tg{font-size:11.5px;font-weight:800;border-radius:8px;padding:3px 9px;white-space:nowrap}',
      '.clp-pr{background:#FFF7ED;border:1px solid #FED7AA;color:#7C2D12;border-radius:16px;padding:14px 16px;font-size:17px;font-weight:700;line-height:1.6;margin:6px 0 4px;text-align:right;white-space:pre-wrap;animation:clpRow .45s .65s both}',
      '.clp-ph{display:flex;gap:8px;justify-content:center;margin:8px 0 2px;animation:clpRow .45s .75s both}.clp-ph img{width:92px;height:92px;object-fit:cover;border-radius:14px;border:2px solid #FED7AA;display:block}',
      '.cl-ph{display:flex;gap:8px;margin-top:10px}.cl-ph img{width:84px;height:84px;object-fit:cover;border-radius:12px;display:block;border:1px solid rgba(255,255,255,.15)}',
      '.clp-sel{flex:1.4;border:1px solid #CDEBD1!important;border-radius:14px!important;padding:11px 12px!important;font-family:inherit;font-size:15px!important;background:#fff!important;color:#1F2937!important;-webkit-text-fill-color:#1F2937}.clp-wait{flex:1;font-size:13px;color:#64748B;padding:10px}',
      '.clp-as{margin-top:2px}',
      '.clp-more{display:inline-block;margin-top:4px;font-size:13px;color:#fff;background:#ef4444;border-radius:999px;padding:3px 10px}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function showPop(m) {
    popCss();
    var ov = document.querySelector('.clp-ov');
    if (ov) { POPQ.push(m); var mo = ov.querySelector('.clp-more'); if (mo) { mo.textContent = '+' + POPQ.length + ' إشعار كمان'; mo.style.display = ''; } return; }
    ov = document.createElement('div'); ov.className = 'clp-ov ax-hl-off';
    var items = Array.isArray(m.items) ? m.items : [], due = m.kind === 'due', stk = m.kind === 'stock', mnt = m.kind === 'maint';
    var ic = mnt ? '<svg viewBox="0 0 24 24"><path class="lg" d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>' : stk ? '<svg viewBox="0 0 24 24"><path class="lg" d="M3.5 8L12 3.5L20.5 8V16L12 20.5L3.5 16zM3.5 8L12 12.5L20.5 8M12 12.5V20.5"/></svg>' : due ? '<svg viewBox="0 0 24 24"><path class="lg" d="M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17M12 7.5V12l3 2"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    ov.innerHTML = '<div class="clp" role="dialog" aria-modal="true"><div class="clp-hd"><span class="clp-dot"></span><span class="clp-ln l"></span>' +
      '<span class="clp-ring"><span class="clp-ck">' + ic + '</span></span><span class="clp-ln r"></span><span class="clp-dot"></span></div>' +
      (mnt ? maintBody(m) : stk ? stockBody(m) : due ? dueBody(m) : '') + (due || stk || mnt ? '' :
      '<h3>📦 طلب ورق جديد</h3><p class="ctr">' + esc(m.center || '') + '</p>' +
      (items.length ? '<ul>' + items.map(function (x, i) { return '<li style="animation-delay:' + (0.7 + i * 0.08).toFixed(2) + 's"><b>' + num(x.qty) + '</b><span>' + esc(x.name) + '</span></li>'; }).join('') + '</ul>' : '<p class="mt2">' + esc(m.text || '') + '</p>') +
      (m.contact ? '<p class="mt2">👤 ' + esc(m.contact) + '</p>' : '') + (m.note ? '<p class="mt2">📝 ' + esc(m.note) + '</p>' : '') +
      '') + '<span class="clp-more" style="display:none"></span>' +
      '<div class="clp-bt"><button class="clp-ok" type="button">حسنا</button>' + (mnt ? '<div class="clp-two clp-as"><span class="clp-wait">بنحمّل الموظفين…</span></div><button class="clp-go" type="button">افتح الطلبات ←</button>' : stk ? '<button class="clp-go" data-go="inv" type="button">افتح المخزن ←</button>' : due ? '<div class="clp-two"><button class="clp-b2" data-x="pay" type="button">💵 تحصيل</button>' + (m.phone ? '<button class="clp-b2 wa" data-x="wa" type="button">واتساب</button>' : '') + '<button class="clp-b2" data-x="stmt" type="button">📒 كشف الحساب</button></div>' : '<button class="clp-go" type="button">افتح الطلبات ←</button>') + '</div></div>';
    document.body.appendChild(ov);
    if (mnt) loadEmps(function (L) {
      var box = ov.querySelector('.clp-as'); if (!box) return;
      if (!L.length) { box.innerHTML = '<span class="clp-wait">مفيش موظفين نشطين — ضيفهم من «الموظفين»</span>'; return; }
      box.innerHTML = '<select class="clp-sel"><option value="">اختار الموظف…</option>' + L.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + '</option>'; }).join('') + '</select><button class="clp-b2" data-x="assign" type="button">👷 حوّله</button>';
      box.querySelector('[data-x=assign]').onclick = function () { var sl = box.querySelector('.clp-sel'); if (!sl.value) { sl.focus(); return T('اختار الموظف الأول', 'error'); } assign(m.id, sl); close(); };
    });
    var close = function (then) {
      ov.classList.add('out'); setTimeout(function () { ov.remove(); if (then) then(); else if (POPQ.length) showPop(POPQ.shift()); }, 220);
    };
    ov.querySelector('.clp-ok').onclick = function () { close(); };
    [].forEach.call(ov.querySelectorAll('.clp-b2'), function (b) { b.onclick = function () { var x = b.dataset.x; close(function () {
      try { if (x === 'pay' && typeof openPaymentForm === 'function') openPaymentForm(m.cid); else if (x === 'wa' && window.AXAging) AXAging.whatsapp(m.cid); else if (x === 'stmt' && typeof viewCustomerStatement === 'function') viewCustomerStatement(m.cid); } catch (e) {}
      if (POPQ.length) setTimeout(function () { showPop(POPQ.shift()); }, 400); }); }; });
    var goB = ov.querySelector('.clp-go'); if (goB && goB.dataset.go === 'inv') { goB.onclick = function () { close(function () { if (typeof navigate === 'function') navigate('inventory'); }); }; goB = null; }
    if (goB) goB.onclick = function () { POPQ = []; close(function () { ui.tab = 'req'; ui.rq = null; if (isPage()) render(); else if (typeof navigate === 'function') navigate('clients'); }); };
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var key = function (e) { if (!document.body.contains(ov)) return document.removeEventListener('keydown', key); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); document.removeEventListener('keydown', key); close(); } };
    document.addEventListener('keydown', key);
  }
  /* ── 4.78 · daily reminders: every center that owes money for a week or more pops up once a day, at a random time ── */
  var DUE = { min: 7, from: 9 * 60 + 30, to: 21 * 60, gap: 4 };
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function dueOn() { try { return localStorage.getItem('ax_due_on') !== '0'; } catch (e) { return true; } }
  function canDue() { try { if (isAdmin()) return true; return typeof can === 'function' && can('payments'); } catch (e) { return false; } }
  function owing() {
    var X = window.AXCore; if (!X || !X.aging) return [];
    var t = today();
    return A('customers').filter(function (c) { return c && !c.archived && (Number(c.balance) || 0) > 0.5; }).map(function (c) {
      var a = X.aging(D(), c.id, t); return { c: c, a: a };
    }).filter(function (x) { return x.a.balance > 0.5 && x.a.oldestDays >= DUE.min; }).sort(function (x, y) { return y.a.oldestDays - x.a.oldestDays; });
  }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function plan() {
    var k = 'ax_due_' + today(), p = lsGet(k);
    if (p && p.slots) return p;
    var list = owing(), slots = {}, span = Math.max(60, DUE.to - DUE.from);
    list.forEach(function (x) { slots[x.c.id] = DUE.from + Math.floor(Math.random() * span); });
    p = { slots: slots, shown: {}, last: 0 };
    lsSet(k, p);
    try { Object.keys(localStorage).forEach(function (kk) { if (/^ax_due_\d{4}-/.test(kk) && kk !== k) localStorage.removeItem(kk); }); } catch (e) {}
    return p;
  }
  function dueMsg(x) {
    var a = x.a, cur = (S().currency || 'جنيه') === 'جنيه' ? 'ج' : S().currency;
    return { kind: 'due', cid: x.c.id, center: x.c.name, amount: a.balance, days: a.oldestDays, cur: cur, last: a.lastPay, phone: phoneOf(x.c) };
  }
  function dueBody(m) {
    var d = m.days, dt = d >= 60 ? 'hot' : '';
    var dtx = d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? d + ' أيام' : d + ' يوم';
    return '<h3>⏰ تذكير تحصيل</h3><p class="ctr">' + esc(m.center) + '</p>' +
      '<div class="amt">' + num(m.amount) + ' <small>' + esc(m.cur || 'ج') + '</small></div>' +
      '<span class="late ' + dt + '">متأخر من ' + dtx + '</span>' +
      (m.last ? '<p class="mt2">آخر دفعة: ' + num(m.last.amount) + ' يوم ' + esc(String(m.last.date || '').split('-').reverse().join('/')) + '</p>' : '<p class="mt2">مفيش دفعات متسجلة</p>');
  }
  function phStrip(id, n, cls) {
    n = Number(n) || 0; if (!n) return '';
    var b = base().replace(/\/$/, '') + '/api/portal/photo?req=' + id + '&i=';
    var h = '<div class="' + cls + '">'; for (var i = 0; i < n; i++) h += '<a href="' + b + i + '" target="_blank" rel="noopener"><img src="' + b + i + '" alt="صورة العطل" loading="lazy"></a>';
    return h + '</div>';
  }
  function maintBody(m) {
    return '<h3>' + (m.urgent ? '🚨' : '🛠') + ' طلب صيانة</h3><p class="ctr">' + esc(m.center || '') + '</p>' +
      (m.device ? '<span class="late" style="background:#FFF7ED;color:#C2410C">' + esc(m.device) + '</span>' : '') + (m.urgent ? ' <span class="late hot">مستعجل — الشغل واقف</span>' : '') +
      '<div class="clp-pr">' + esc(m.problem || '') + '</div>' + phStrip(m.id, m.photos, 'clp-ph') + (m.contact ? '<p class="mt2">👤 ' + esc(m.contact) + '</p>' : '') +
      '<p class="mt2" style="margin-top:8px">وصل إشعار لكل الموظفين — حوّله لموظف معيّن يتسجّل عنده مهمة:</p>';
  }
  function dueTick(force) {
    if (!canDue() || (!dueOn() && !force)) return;
    if (document.querySelector('.clp-ov') || (document.getElementById('modal-overlay') || { classList: { contains: function () { return false; } } }).classList.contains('show')) return;
    var p = plan(), m = nowMin(), k = 'ax_due_' + today();
    if (!force && Date.now() - (p.last || 0) < DUE.gap * 60e3) return;
    var ids = Object.keys(p.slots).filter(function (id) { return !p.shown[id] && (force || p.slots[id] <= m); }).sort(function (a, b) { return p.slots[a] - p.slots[b]; });
    var list = owing(), byId = {}; list.forEach(function (x) { byId[x.c.id] = x; });
    for (var i = 0; i < ids.length; i++) {
      var x = byId[ids[i]];
      p.shown[ids[i]] = 1;
      if (!x) continue;                       // paid meanwhile → nothing to say
      p.last = Date.now(); lsSet(k, p);
      showPop(dueMsg(x));
      try { var Ac = window.AudioContext || window.webkitAudioContext; if (Ac) { var ac = new Ac(); [660, 880].forEach(function (f, j) { var o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = f; g.gain.setValueAtTime(.1, ac.currentTime + j * .18); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + j * .18 + .35); o.start(ac.currentTime + j * .18); o.stop(ac.currentTime + j * .18 + .36); }); } } catch (e) {}
      return;
    }
    lsSet(k, p);
  }
  function dueTry() { var x = owing()[Math.floor(Math.random() * Math.max(1, owing().length))]; if (!x) return T('مفيش مراكز متأخرة أسبوع أو أكتر 🎉', 'info'); showPop(dueMsg(x)); }
  function dueToggle() { try { localStorage.setItem('ax_due_on', dueOn() ? '0' : '1'); } catch (e) {} T(dueOn() ? '🔔 التذكير اليومي اشتغل' : 'التذكير اليومي اتوقف', 'info'); render(); }
  (function dueBoot() { var n = 0; (function w() { if (typeof currentUser === 'undefined' || !currentUser || !window.AXCore || !A('customers').length) { if (++n < 120) setTimeout(w, 1000); return; } setTimeout(function () { dueTick(); }, 90e3); setInterval(function () { dueTick(); }, 60e3); })(); })();

  /* ── 4.81 · تقرير المخزن اليومي: الناقص واللي قرب يخلص والموجود — مرة كل يوم الصبح ── */
  function stockOn() { try { return localStorage.getItem('ax_stk_on') !== '0'; } catch (e) { return true; } }
  function canStock() { try { if (isAdmin()) return true; return typeof can === 'function' && can('inventory'); } catch (e) { return false; } }
  function stockList() {
    return A('products').filter(function (p) { return p && !p.archived && !p.deleted; }).map(function (p) {
      var q = Number(p.quantity) || 0, mn = Number(p.minQuantity) || 0;
      var st = q <= 0 ? 'r' : (mn > 0 && q <= mn) ? 'r' : (mn > 0 && q <= mn * 1.5) ? 'o' : 'g';
      var tx = q <= 0 ? 'خلص' : st === 'r' ? 'ناقص' : st === 'o' ? 'قرب يخلص' : 'كويس';
      return { name: p.name, q: q, unit: p.unit || '', min: mn, st: st, tx: tx };
    }).sort(function (a, b) { var o = { r: 0, o: 1, g: 2 }; return o[a.st] - o[b.st] || a.q - b.q || String(a.name).localeCompare(String(b.name), 'ar'); });
  }
  function stockBody(m) {
    var L = m.list || [], n = { r: 0, o: 0, g: 0 }; L.forEach(function (x) { n[x.st]++; });
    return '<h3>📦 تقرير المخزن النهارده</h3><p class="ctr">' + L.length + ' صنف في المخزن</p>' +
      '<div class="clp-sk">' + (n.r ? '<span class="r">🔴 ناقص ' + n.r + '</span>' : '') + (n.o ? '<span class="o">🟠 قرب يخلص ' + n.o + '</span>' : '') + '<span class="g">🟢 كويس ' + n.g + '</span></div>' +
      '<div class="clp-sl">' + L.map(function (x, i) { return '<div class="sr ' + x.st + '" style="animation-delay:' + Math.min(1.6, 0.6 + i * 0.05).toFixed(2) + 's"><span class="nm">' + esc(x.name) + (x.min ? '<small style="display:block;font-weight:500;font-size:11.5px;color:#64748B">الحد الأدنى ' + num(x.min) + '</small>' : '') + '</span><span><span class="q">' + num(x.q) + '</span><span class="u">' + esc(x.unit) + '</span></span><span class="clp-tg ' + x.st + '">' + x.tx + '</span></div>'; }).join('') + '</div>';
  }
  function stockShow() { var L = stockList(); if (!L.length) return T('مفيش أصناف في المخزن', 'info'); showPop({ kind: 'stock', list: L }); }
  function stockTick() {
    if (!canStock() || !stockOn() || document.querySelector('.clp-ov')) return;
    var k = 'ax_stk_' + today(), p = lsGet(k);
    if (!p) { p = { at: 9 * 60 + 15 + Math.floor(Math.random() * 90), done: 0 }; lsSet(k, p); try { Object.keys(localStorage).forEach(function (kk) { if (/^ax_stk_\d{4}-/.test(kk) && kk !== k) localStorage.removeItem(kk); }); } catch (e) {} }
    if (p.done || nowMin() < p.at) return;
    var m = document.getElementById('modal-overlay'); if (m && m.classList.contains('show')) return;
    p.done = 1; lsSet(k, p);
    if (!stockList().length) return;
    stockShow();
    try { var Ac = window.AudioContext || window.webkitAudioContext; if (Ac) { var ac = new Ac(), o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 740; g.gain.setValueAtTime(.1, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .45); o.start(); o.stop(ac.currentTime + .45); } } catch (e) {}
  }
  function stockToggle() { try { localStorage.setItem('ax_stk_on', stockOn() ? '0' : '1'); } catch (e) {} T(stockOn() ? '📦 تقرير المخزن اليومي اشتغل' : 'تقرير المخزن اليومي اتوقف', 'info'); render(); }
  (function stockBoot() { var n = 0; (function w() { if (typeof currentUser === 'undefined' || !currentUser || !A('products').length) { if (++n < 120) setTimeout(w, 1000); return; } setTimeout(stockTick, 60e3 + Math.random() * 60e3); setInterval(stockTick, 60e3); })(); })();

  document.addEventListener('ax:sse', function (ev) {
    var m = ev.detail || {}; if (m.event !== 'portal' || !isAdmin()) return;
    if (m.kind === 'maint') {
      if (window.innerWidth >= 760) showPop(m); else T(m.text || 'طلب صيانة 🛠', 'success');
      try { var Ac2 = window.AudioContext || window.webkitAudioContext; if (Ac2) { var ac2 = new Ac2(); [520, 780, 520].forEach(function (f, j) { var o = ac2.createOscillator(), g = ac2.createGain(); o.connect(g); g.connect(ac2.destination); o.frequency.value = f; g.gain.setValueAtTime(.1, ac2.currentTime + j * .16); g.gain.exponentialRampToValueAtTime(.001, ac2.currentTime + j * .16 + .3); o.start(ac2.currentTime + j * .16); o.stop(ac2.currentTime + j * .16 + .31); }); } } catch (e) {}
    }
    if (m.kind === 'order') {
      if (window.innerWidth >= 760) showPop(m); else T(m.text || 'طلب ورق جديد 📦', 'success');
      try { var Ac = window.AudioContext || window.webkitAudioContext; if (Ac) { var ac = new Ac(), o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.setValueAtTime(.12, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .5); o.start(); o.stop(ac.currentTime + .5); } } catch (e) {}
    }
    if (isPage()) { ui.rq = ui.rq || []; loadReq(); } else refreshCount();
  });
  var tries = 0; (function boot() { if (typeof currentUser === 'undefined' || !currentUser) { if (++tries < 80) setTimeout(boot, 500); return; } refreshCount(); setInterval(refreshCount, 120000); })();


  /* ── 4.80 · باركود (QR) لكل لينك — استيكر يتلزق على الطابعة؛ بيتعمل من اللينك الحالي، فلو اتعمل لينك جديد الباركود بيتغير معاه ── */
  function withQR(cb) {
    if (typeof qrcode === 'function') return cb();
    var sc = document.createElement('script'); sc.src = base().replace(/\/$/, '') + '/vendor/qrcode.js';
    sc.onload = function () { cb(); }; sc.onerror = function () { T('مش قادر أحمّل مولّد الباركود — اتأكد من النت', 'error'); };
    document.head.appendChild(sc);
  }
  function qrSvg(text, px) {
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = 2, sz = n + m * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sz + ' ' + sz + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges"><rect width="' + sz + '" height="' + sz + '" fill="#fff"/><path d="' + d + '" fill="#0F172A"/></svg>';
  }
  function sticker(c, tok, big) {
    var u = url(tok), logo = typeof S().companyLogo === 'string' && S().companyLogo.indexOf('data:image') === 0 ? S().companyLogo : '';
    return '<div class="qs' + (big ? ' big' : '') + '"><div class="qs-h">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '<b>' + esc(company()) + '</b></div>' +
      '<div class="qs-c">' + esc(c.name) + '</div><div class="qs-q">' + qrSvg(u, big ? 240 : 170) + '</div>' +
      '<div class="qs-t">📱 امسح الكود بكاميرا الموبايل</div><div class="qs-s">حسابكم · سحبكم كل شهر · اطلبوا ورق</div><div class="qs-u">' + esc(u.replace(/^https?:\/\//, '')) + '</div></div>';
  }
  var QS_CSS = '.qs{width:64mm;background:#fff;color:#0F172A;border:1.5px dashed #94A3B8;border-radius:5mm;padding:4mm 4mm 3.5mm;text-align:center;font-family:Tahoma,Arial,sans-serif;box-sizing:border-box;break-inside:avoid;page-break-inside:avoid}' +
    '.qs.big{width:auto;max-width:340px;margin:auto;border-style:solid;border-color:#E2E8F0;padding:18px;border-radius:22px;box-shadow:0 12px 30px -18px rgba(15,23,42,.4)}' +
    '.qs-h{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px}.qs-h img{width:22px;height:22px;object-fit:contain;border-radius:5px}.qs-h b{font-size:13px}' +
    '.qs-c{font-weight:800;font-size:15px;margin:2mm 0 1mm;line-height:1.3}.qs.big .qs-c{font-size:19px;margin:8px 0 4px}' +
    '.qs-q svg{display:block;margin:0 auto;max-width:100%;height:auto}.qs-t{font-weight:700;font-size:12px;margin-top:1.5mm}.qs.big .qs-t{font-size:14px;margin-top:6px}' +
    '.qs-s{font-size:10px;color:#475569;margin-top:.5mm}.qs.big .qs-s{font-size:12.5px}.qs-u{font-family:monospace;font-size:10.5px;color:#0F172A;direction:ltr;margin-top:1mm;letter-spacing:.3px}.qs.big .qs-u{font-size:13px;margin-top:6px}';
  function qrModal(cid) {
    var c = A('customers').filter(function (x) { return x.id === cid; })[0], tok = links()[cid]; if (!c || !tok) return;
    withQR(function () {
      if (!document.getElementById('qs-css')) { var st = document.createElement('style'); st.id = 'qs-css'; st.textContent = QS_CSS; document.head.appendChild(st); }
      var body = '<div class="ax-hl-off" style="padding:6px 0">' + sticker(c, tok, true) + '<p style="font-size:12.5px;opacity:.7;text-align:center;margin:12px 0 0">اطبعه والزقه على الطابعة عند المركز. لو عملت «لينك جديد» الباركود القديم بيقف — اطبع الجديد.</p></div>';
      var foot = '<button class="btn btn-primary" onclick="AXClients.qrPrint([\'' + cid + '\'])">🖨 اطبع الاستيكر</button><button class="btn btn-secondary" onclick="AXClients.qrPng(\'' + cid + '\')">⬇ صورة</button><button class="btn btn-ghost" onclick="closeModal()">قفل</button>';
      if (typeof openModal === 'function') openModal('▦ باركود ' + esc(c.name), body, foot); 
    });
  }
  function qrPrint(ids) {
    var L = links(), list = (ids && ids.length ? ids : Object.keys(L)).map(function (id) { var c = A('customers').filter(function (x) { return x.id === id; })[0]; return c && L[id] ? { c: c, tok: L[id] } : null; }).filter(Boolean);
    if (!list.length) return T('مفيش مراكز ليها لينك', 'info');
    withQR(function () {
      var w = window.open('', '_blank'); if (!w) return T('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'error');
      w.document.open();
      w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>باركود المراكز</title><style>@page{size:A4;margin:8mm}body{margin:0;background:#fff}.g{display:flex;flex-wrap:wrap;gap:5mm;justify-content:center}' + QS_CSS + '</style></head><body><div class="g">' +
        list.map(function (x) { return sticker(x.c, x.tok, false); }).join('') + '</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>');
      w.document.close();
    });
  }
  function qrPng(cid) {
    var c = A('customers').filter(function (x) { return x.id === cid; })[0], tok = links()[cid]; if (!c || !tok) return;
    withQR(function () {
      var q = qrcode(0, 'M'); q.addData(url(tok)); q.make();
      var n = q.getModuleCount(), cell = 12, pad = 40, qs = n * cell, W = qs + pad * 2, H = qs + pad * 2 + 120;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#0F172A';
      g.font = 'bold 30px Tahoma, Arial'; g.textAlign = 'center'; g.direction = 'rtl'; g.fillText(String(c.name).slice(0, 40), W / 2, 56);
      for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(pad + k * cell, 80 + r * cell, cell, cell);
      g.font = '22px monospace'; g.direction = 'ltr'; g.fillText(url(tok).replace(/^https?:\/\//, ''), W / 2, 80 + qs + 40);
      g.font = 'bold 20px Tahoma, Arial'; g.direction = 'rtl'; g.fillText('امسح الكود — حسابكم وطلب الورق', W / 2, 80 + qs + 76);
      var a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'باركود-' + String(c.name).replace(/[\\/:*?"<>|]/g, '') + '.png'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  /* ── actions ── */
  function save(p) { S()._portal = p; if (typeof DB !== 'undefined' && DB.save) DB.save(); }
  function make(cid) { var p = Object.assign({}, links()); p[cid] = newToken(); save(p); ui.open[cid] = true; T('اتعمل اللينك ✅ — والباركود بتاعه جاهز «▦ باركود»'); render(); }
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
  function rotate(cid) { ask('تعمل لينك جديد؟ اللينك القديم هيقف على طول.', function () { var p = Object.assign({}, links()); p[cid] = newToken(); save(p); T('اتعمل لينك جديد — القديم وقف، وده الباركود الجديد'); render(); setTimeout(function () { qrModal(cid); }, 450); }); }
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
    if (r.kind === 'maint') { var mi = r.items || {}; window.open('https://wa.me/' + phoneOf(c) + '?text=' + encodeURIComponent('السلام عليكم ' + c.name + ' 🌿\nطلب الصيانة وصلنا ✅' + (mi.device ? ' (' + mi.device + ')' : '') + '\n«' + (r.note || '') + '»\n' + (r.status === 'sent' ? 'واتصلح — شكراً لكم 🙏' : r.reply ? r.reply + ' وهيتواصل معاكم.' : 'والفني هيتواصل معاكم في أقرب وقت.') + '\n' + company()), '_blank'); return; }
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
    st: setSt, del: del, _pop: showPop, assign: assign, dueTry: dueTry, dueToggle: dueToggle, dueTick: dueTick, qr: qrModal, qrPrint: qrPrint, qrPng: qrPng, stockShow: stockShow, stockToggle: stockToggle, waReq: waReq, issue: issue, count: function () { return ui.newCount; }, refresh: refreshCount,
    tab: function (t) { ui.tab = t; if (t === 'req') ui.rq = null; render(); },
    rf: function (f) { ui.rf = f; render(); },
    grp: function (k) { ui.grp[k] = !ui.grp[k]; render(); },
    toggle: function (cid) { ui.open[cid] = !ui.open[cid]; var el = document.querySelector('.cl-r[data-c="' + cid + '"]'); if (el) el.classList.toggle('op', !!ui.open[cid]); else render(); },
    search: function (q) { ui.q = String(q || ''); clearTimeout(ui.t); ui.t = setTimeout(function () { render(); var i = document.querySelector('.cl-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 220); }
  };
})();

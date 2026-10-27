/* ════════════════════════════════════════════════════════════════════
   صفحة المركز (4.87) — أبلكيشن صغير للمركز من اللينك / الباركود
   الرئيسية · حسابي · الفواتير · الصيانة — وزرار «＋» للطلبات
   البيانات جاية جاهزة من السيرفر في window.PD
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var P = window.PD || {}, SELF = P.self || location.pathname.replace(/\/$/, '');
  var MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var ST = { order: { new: ['اتبعت', 'nw'], ok: ['اتأكد — بيتجهز', 'pt'], road: ['في الطريق 🚚', 'rd'], sent: ['اتسلّم ✓', 'ok'], no: ['اتلغى', 'no'] },
    maint: { new: ['مستني فني', 'nw'], ok: ['الفني جاي 👷', 'pt'], sent: ['اتصلحت ✓', 'ok'], no: ['اتلغى', 'no'] },
    pay: { new: ['بيتراجع', 'nw'], ok: ['بيتراجع', 'pt'], sent: ['اتسجّل ✓', 'ok'], no: ['محتاج مراجعة', 'no'] } };
  var ui = { tab: 'home', y: String(P.today || '').slice(0, 4), m: +String(P.today || '').slice(5, 7) || 1, rate: {}, track: {}, map: null };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function dmy(d) { var p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + '/' + (+p[1]) + '/' + p[0] : ''; }
  function dm(d) { var p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + ' ' + MON[+p[1] - 1] : ''; }
  function hm(ts) { var m = /(\d{2}):(\d{2})/.exec(String(ts || '').slice(11)); if (!m) return ''; var h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + (h < 12 ? ' ص' : ' م'); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('on'); }, 2800); }
  function post(sub, body) {
    return fetch(SELF + '/' + sub, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || 'محصلش — جرّب تاني'); return j; }); });
  }
  function countUp(el, to, ms) {
    if (!el) return; var t0 = performance.now(), from = 0;
    (function f(t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = n0(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); })(t0);
  }
  function confetti() {
    var C = ['#0E9F9A', '#22C1B8', '#F97316', '#FBBF24', '#16A34A', '#2563EB', '#EC4899'];
    for (var i = 0; i < 46; i++) { var d = document.createElement('i'); d.className = 'cf'; d.style.left = Math.random() * 100 + 'vw'; d.style.background = C[i % C.length]; d.style.animationDelay = (Math.random() * .5).toFixed(2) + 's'; d.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)'; document.body.appendChild(d); (function (x) { setTimeout(function () { x.remove(); }, 2600); })(d); }
  }
  function doneBox(icon, title, sub) {
    var o = document.createElement('div'); o.className = 'done'; o.innerHTML = '<div><i>' + icon + '</i><b>' + esc(title) + '</b><p class="mt">' + esc(sub) + '</p></div>';
    document.body.appendChild(o); confetti(); setTimeout(function () { location.reload(); }, 2100);
  }

  /* ── data helpers ── */
  var Y = P.years || {};
  function yr(y) { return Y[y] || Array.apply(null, Array(12)).map(function () { return { val: 0, paid: 0, n: 0, items: [] }; }); }
  function openOrder() { return (P.orders || []).filter(function (o) { return o.kind === 'order' && (o.status === 'new' || o.status === 'ok' || o.status === 'road'); })[0]; }
  function maints() { return (P.orders || []).filter(function (o) { return o.kind === 'maint'; }); }
  function activeMaint() { return maints().filter(function (o) { return o.status === 'new' || o.status === 'ok'; })[0]; }
  function unrated() { return maints().filter(function (o) { return o.status === 'sent' && !o.rating; })[0]; }
  function tag(o) { var s = (ST[o.kind] || ST.order)[o.status] || [o.status, 'nw']; return '<span class="tg ' + s[1] + '">' + s[0] + '</span>'; }

  /* ── shell ── */
  function shell() {
    var c = P.company || {}, logo = c.logo ? '<img class="lg" src="' + esc(c.logo) + '" alt="">' : '<span class="lg t">' + esc(String(c.name || 'O').charAt(0)) + '</span>';
    var h = new Date().getHours(), hi = h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير';
    var badge = (activeMaint() ? 1 : 0) + (openOrder() ? 1 : 0);
    $('app').innerHTML = '<div class="w">' +
      '<div class="top">' + logo + '<div style="min-width:0"><b>' + esc(P.center.name) + '</b><span>' + hi + ' 👋 · حسابكم عند ' + esc(c.name) + '</span></div><button class="ib" id="bell" aria-label="الطلبات">🔔' + (badge ? '<i></i>' : '') + '</button></div>' +
      '<section class="view" id="v-home"></section><section class="view" id="v-acct"></section><section class="view" id="v-inv"></section><section class="view" id="v-help"></section>' +
      '<p style="text-align:center;color:var(--faint);font-size:11.5px;margin-top:18px">الصفحة دي لحسابكم بس، والأرقام بتتحدّث أول بأول.' + (c.phone ? ' للاستفسار: ' + esc(c.phone) : '') + '</p></div>' +
      '<nav class="nav"><div class="in"><button data-t="home"><i>🏠</i>الرئيسية</button><button data-t="acct"><i>📊</i>حسابي</button><button class="fab" id="fab" aria-label="طلب جديد">＋</button><button data-t="inv"><i>🧾</i>الفواتير</button><button data-t="help"><i>🛠</i>الصيانة' + (activeMaint() ? '<span class="bd">1</span>' : '') + '</button></div></nav>' +
      '<div class="sh" id="sh"><div class="bk"></div><div class="pn" id="shp"></div></div><div class="toast" id="toast"></div>';
    [].forEach.call(document.querySelectorAll('.nav [data-t]'), function (b) { b.onclick = function () { go(b.dataset.t); }; });
    $('fab').onclick = pickSheet;
    $('bell').onclick = function () { go('home'); setTimeout(function () { var x = $('recent'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); };
    $('sh').querySelector('.bk').onclick = closeSheet;
  }
  function go(t) {
    ui.tab = t; try { history.replaceState(null, '', '#' + t); } catch (e) {}
    [].forEach.call(document.querySelectorAll('.nav [data-t]'), function (b) { b.classList.toggle('on', b.dataset.t === t); });
    ['home', 'acct', 'inv', 'help'].forEach(function (k) { $('v-' + k).classList.toggle('on', k === t); });
    ({ home: home, acct: acct, inv: invView, help: help })[t]();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ════ الرئيسية ════ */
  function home() {
    var el = $('v-home'), Mo = yr(String(P.today).slice(0, 4)), tv = 0, tp = 0;
    Mo.forEach(function (m) { tv += m.val; tp += m.paid; });
    var pct = P.due <= 0.5 ? 100 : tv > 0 ? Math.max(0, Math.min(100, Math.round(tp / tv * 100))) : 0;
    var od = P.oldest || 0, oc = od >= 90 ? 'r' : od >= 60 ? 'o' : od >= 30 ? 'y' : 'g';
    var h = '<div class="bk2"><div class="h"><span>المستحق عليكم</span>' + (P.due > 0.5 ? '<em class="' + oc + '">⏳ ' + (od > 0 ? 'أقدم مبلغ من ' + od + ' يوم' : 'مستحق حديثاً') + '</em>' : '<em class="g">🎉 مسدد بالكامل</em>') + '</div>' +
      '<div class="amt"><span id="due" class="n">0</span><span class="cur">' + esc(P.cur) + '</span></div>' +
      '<div class="sub">' + (P.due > 0.5 ? (P.lastPay ? 'آخر دفعة ' + n0(P.lastPay.amount) + ' ' + esc(P.cur) + ' يوم ' + dmy(P.lastPay.date) : 'لسه مفيش دفعات متسجّلة') : 'شكراً لكم — مفيش عليكم أي مبالغ') + '</div>' +
      '<div class="st"><div><b class="n" id="hv">0</b><small>سحبتوا السنة دي</small></div><div><b class="n" id="hp">0</b><small>دفعتوا السنة دي</small></div><div><b class="n"><span id="rp">0</span>%</b><small>نسبة السداد</small><i><u id="rg" data-w="' + pct + '"></u></i></div></div>' +
      (P.due > 0.5 ? '<button class="go" data-q="pay">💳 ادفع / حوّل دلوقتي</button>' : '') + '</div>';
    h += '<div class="qa"><button data-q="order"><i style="background:#E0F2FE">📦</i>اطلب ورق</button><button data-q="maint"><i style="background:#FFEDD5">🛠</i>صيانة</button><button data-q="pay"><i style="background:#DCFCE7">💳</i>ادفع / حوّل</button><button data-q="stmt"><i style="background:#F3E8FF">📄</i>كشف PDF</button></div>';
    h += banner();
    /* forecast */
    var F = P.forecast || [];
    if (F.length) {
      var hot = F[0];
      h += '<div class="card"><h3>📊 الورق اللي عندكم يكفي لحد إمتى؟<em>من متوسط سحبكم</em></h3>' + F.map(function (f) {
        var cls = f.pct >= 90 ? 'r' : f.pct >= 70 ? 'o' : '', left = f.left;
        return '<div class="fc"><div class="r"><b>' + esc(f.name) + '</b><span>' + (left > 1 ? 'باقي حوالي ' + left + ' يوم' : left >= 0 ? 'وقت الطلب النهارده' : 'متأخرين ' + (-left) + ' يوم') + '</span></div><div class="gauge ' + cls + '"><i data-w="' + Math.max(4, f.pct) + '"></i></div>' +
          '<div style="font-size:11.5px;color:var(--mut);margin-top:4px">بتسحبوا كل ~' + f.every + ' يوم (حوالي ' + n0(f.avg) + ' ' + esc(f.unit || '') + ') · آخر مرة ' + dm(f.last) + ' · المتوقع ' + dm(f.next) + '</div></div>';
      }).join('') +
        (hot.pct >= 70 ? '<div class="warn">⚠️ <span><b>' + esc(hot.name) + '</b> ' + (hot.left > 0 ? 'هيخلص حوالي <b>' + dm(hot.next) + '</b>' : 'وقت طلبه جه') + ' — اطلبوا قبل ما الشغل يقف</span><button class="btn o" data-q="order" style="margin-inline-start:auto">اطلب</button></div>' : '') + '</div>';
    }
    /* current order */
    var oo = openOrder();
    if (oo) {
      var k = ['new', 'ok', 'road', 'sent'].indexOf(oo.status), steps = [['📝', 'اتبعت'], ['✅', 'اتأكد'], ['🚚', 'في الطريق'], ['📦', 'اتسلّم']];
      h += '<div class="card"><h3>🚚 طلبكم الحالي<em>' + oo.items.map(function (x) { return n0(x.qty) + ' ' + esc(x.name); }).join(' · ') + '</em></h3><div class="trk"><span class="ln" data-w="' + (k / 3 * 100) + '"></span>' +
        steps.map(function (s, i) { return '<div class="' + (i < k ? 'ok' : i === k ? 'cur' : '') + '"><i>' + s[0] + '</i>' + s[1] + (i === 0 ? '<em>' + hm(oo.at) + '</em>' : '') + '</div>'; }).join('') + '</div></div>';
    }
    /* active maintenance */
    var am = activeMaint();
    if (am) h += '<div class="re" style="background:linear-gradient(135deg,#FFF7ED,#FFFBEB);border-color:#FED7AA" data-go="help">' + (am.urgent ? '🚨' : '🛠') + '<div><b>طلب الصيانة: ' + (am.status === 'ok' ? 'الفني جاي ليكم 👷' : 'بندوّر على فني') + '</b><small>' + esc(am.device || '') + (am.note ? ' · ' + esc(String(am.note).slice(0, 40)) : '') + '</small></div><button class="btn o">تابع</button></div>';
    var ur = unrated();
    if (ur) h += '<div class="re" style="background:linear-gradient(135deg,#FEFCE8,#FFF7ED);border-color:#FDE68A" data-go="help">⭐<div><b>العطل اتصلح — قيّموا الفني</b><small>رأيكم بيفرق معانا</small></div><button class="btn" style="background:#F59E0B">قيّم</button></div>';
    /* reorder */
    if (P.lastOrder && P.lastOrder.length && !oo) h += '<div class="re">🔁<div><b>اطلب نفس آخر طلب</b><small>' + P.lastOrder.map(function (x) { return n0(x.qty) + ' ' + esc(x.name); }).join(' · ') + '</small></div><button class="btn t" id="reord">بضغطة</button></div>';
    /* recent */
    var R = (P.orders || []).slice(0, 6);
    h += '<div class="card" id="recent"><h3>🔔 طلباتكم الأخيرة</h3>' + (R.length ? R.map(function (o) {
      var w = o.kind === 'maint' ? '🛠 صيانة' + (o.device ? ' — ' + esc(o.device) : '') : o.kind === 'pay' ? '💳 تحويل ' + n0(o.amount) + ' ' + esc(P.cur) : '📦 ' + o.items.map(function (x) { return n0(x.qty) + ' ' + esc(x.name); }).join(' · ');
      return '<div class="or"><div class="dt"><b>' + w + '</b><small>' + dmy(o.at) + ' ' + hm(o.at) + (o.reply ? ' · ' + esc(o.reply) : '') + '</small></div>' + tag(o) + '</div>';
    }).join('') : '<div class="emp"><i>📭</i>لسه مفيش طلبات — دوس «＋» تحت</div>') + '</div>';
    el.innerHTML = h;
    wire(el);
    var reo = $('reord'); if (reo) reo.onclick = function () { reorder(reo); };
    setTimeout(function () {
      countUp($('due'), P.due, 1300); countUp($('rp'), pct, 1300); countUp($('hv'), tv, 1300); countUp($('hp'), tp, 1300); grow(el);
    }, 120);
  }
  function grow(el) { [].forEach.call(el.querySelectorAll('[data-w]'), function (x) { x.style.width = x.dataset.w + '%'; }); [].forEach.call(el.querySelectorAll('[data-h]'), function (x) { x.style.height = x.dataset.h + '%'; }); }
  function wire(el) {
    [].forEach.call(el.querySelectorAll('[data-q]'), function (b) { b.onclick = function (e) { e.stopPropagation(); var q = b.dataset.q; if (q === 'order') orderSheet(); else if (q === 'maint') maintSheet(); else if (q === 'pay') paySheet(); else if (q === 'stmt') printStmt(); }; });
    [].forEach.call(el.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { go(b.dataset.go); }; });
  }
  function reorder(b) {
    if (!confirm('نبعت نفس الطلب؟\n' + P.lastOrder.map(function (x) { return x.qty + ' ' + x.name; }).join('\n'))) return;
    b.disabled = true; post('order', { items: P.lastOrder.map(function (x) { return { name: x.name, unit: x.unit || '', qty: x.qty }; }) })
      .then(function () { doneBox('✅', 'الطلب وصلنا', 'هنأكده معاكم في أقرب وقت'); }).catch(function (e) { b.disabled = false; toast(e.message); });
  }
  /* install / notifications banner */
  var BIP = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); BIP = e; if (ui.tab === 'home') home(); });
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function pushOK() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!P.vapid; }
  function banner() {
    if (ls('pc_ban_' + SELF) === 'x') return '';
    if (!standalone()) {
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      return '<div class="ban">📲<div><b>ضيفوا الصفحة للشاشة الرئيسية</b>' + (ios && !BIP ? 'من زرار المشاركة <b style="display:inline">⎋</b> ← «إضافة إلى الشاشة الرئيسية»' : 'تفتح زي الأبلكيشن على طول') + '</div>' + (BIP ? '<button class="btn t" id="inst">ضيف</button>' : '') + '<button class="cl" id="banx">×</button></div>';
    }
    if (pushOK() && Notification.permission !== 'granted' && ls('pc_push_' + SELF) !== '1') return '<div class="ban">🔔<div><b>فعّلوا الإشعارات</b>نبلغكم لما الطلب يتأكد أو الفني يتحرك</div><button class="btn t" id="pushon">فعّل</button><button class="cl" id="banx">×</button></div>';
    return '';
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'banx') { ls('pc_ban_' + SELF, 'x'); t.closest('.ban').remove(); }
    if (t.id === 'inst' && BIP) { BIP.prompt(); BIP.userChoice.then(function () { BIP = null; home(); }); }
    if (t.id === 'pushon') enablePush(t);
  });
  function b64u(s) { var p = '='.repeat((4 - s.length % 4) % 4), b = (s + p).replace(/-/g, '+').replace(/_/g, '/'), r = atob(b), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
  function enablePush(btn) {
    if (!pushOK()) return toast('الإشعارات مش مدعومة هنا — على الآيفون ضيفوا الصفحة للشاشة الرئيسية الأول');
    btn.disabled = true;
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('الإشعارات اترفضت من الموبايل');
      return navigator.serviceWorker.register('/portal-sw.js', { scope: SELF + '/' });
    }).then(function (reg) { return navigator.serviceWorker.ready.then(function () { return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(P.vapid) }); }); }); })
      .then(function (sub) { return post('push', { subscription: sub.toJSON ? sub.toJSON() : sub }); })
      .then(function () { ls('pc_push_' + SELF, '1'); toast('🔔 تمام — هنبلغكم بكل جديد'); var b = btn.closest('.ban'); if (b) b.remove(); })
      .catch(function (e) { btn.disabled = false; toast(e.message || 'محصلش'); });
  }

  /* ════ حسابي ════ */
  function acct() {
    var el = $('v-acct'), M = yr(ui.y), ty = String(P.today).slice(0, 4), tm = +String(P.today).slice(5, 7);
    if (ui.y === ty && ui.m > tm) ui.m = tm;
    var cm = M[ui.m - 1] || { val: 0, paid: 0, items: [] }, max = Math.max(1, Math.max.apply(null, M.map(function (x) { return Math.max(x.val, x.paid); })));
    var prev = M.slice(0, ui.m - 1).filter(function (x) { return x.val > 0; }), avg = prev.length ? prev.reduce(function (a, x) { return a + x.val; }, 0) / prev.length : 0;
    var diff = avg > 0 && cm.val > 0 ? Math.round((cm.val - avg) / avg * 100) : null;
    var yTot = M.reduce(function (o, x) { return { v: o.v + x.val, p: o.p + x.paid }; }, { v: 0, p: 0 });
    var years = Object.keys(Y).sort().reverse();
    var h = '<div class="card"><h3>📊 السحب والدفع ' + esc(ui.y) + '<em>دوس على أي شهر</em></h3><div class="yr">' + years.map(function (x) { return '<button data-y="' + x + '" class="' + (x === ui.y ? 'on' : '') + '">' + x + '</button>'; }).join('') + '</div>' +
      '<div class="bars">' + M.map(function (x, i) { var fut = ui.y === ty && i + 1 > tm; return '<button data-m="' + (i + 1) + '" class="' + (i + 1 === ui.m ? 'on' : '') + '"' + (fut ? ' disabled' : '') + ' aria-label="' + MON[i] + '"><i class="a" data-h="' + (x.val / max * 100).toFixed(1) + '" style="transition-delay:' + (i * 45) + 'ms"></i><i class="b" data-h="' + (x.paid / max * 100).toFixed(1) + '" style="transition-delay:' + (i * 45 + 20) + 'ms"></i></button>'; }).join('') + '</div>' +
      '<div class="ml">' + MON.map(function (x, i) { return '<span class="' + (i + 1 === ui.m ? 'on' : '') + '">' + x.slice(0, 3) + '</span>'; }).join('') + '</div>' +
      '<div class="lgd"><span><i style="background:var(--draw)"></i>سحبتوا ' + n0(yTot.v) + '</span><span><i style="background:var(--pay)"></i>دفعتوا ' + n0(yTot.p) + '</span></div></div>';
    h += '<div class="card"><h3>🗓 ' + MON[ui.m - 1] + ' ' + esc(ui.y) + '</h3><div class="mh">' + MON.map(function (x, i) { var fut = ui.y === ty && i + 1 > tm; return '<button data-m="' + (i + 1) + '" class="' + (i + 1 === ui.m ? 'on' : '') + '"' + (fut ? ' disabled' : '') + '>' + x + '</button>'; }).join('') + '</div>' +
      '<div class="kp"><div class="d"><span>سحبتوا</span><b class="n">' + n0(cm.val) + '</b>' + (diff !== null ? '<small class="' + (diff > 0 ? 'up' : 'dn') + '">' + (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + '% عن المعتاد</small>' : '') + '</div><div class="p"><span>دفعتوا</span><b class="n">' + n0(cm.paid) + '</b></div><div><span>' + (cm.val - cm.paid >= 0 ? 'الفرق عليكم' : 'دفعتوا زيادة') + '</span><b class="n">' + n0(Math.abs(cm.val - cm.paid)) + '</b></div></div>';
    var qmax = Math.max.apply(null, [1].concat(cm.items.map(function (x) { return x.qty; })));
    h += cm.items.length ? '<h3 style="margin:14px 0 2px;font-size:13.5px">📦 الورق اللي وصلكم الشهر ده</h3>' + cm.items.map(function (x) { return '<div class="ir"><div class="r"><b>' + esc(x.name) + '</b><em class="n">' + n0(x.qty) + '</em><small>' + esc(x.unit || '') + '</small></div><div class="tr"><i data-w="' + (x.qty / qmax * 100).toFixed(1) + '"></i></div></div>'; }).join('') : '<div class="emp"><i>📭</i>مفيش ورق اتسحب في الشهر ده</div>';
    var ym = ui.y + '-' + ('0' + ui.m).slice(-2), pays = (P.payments || []).filter(function (x) { return String(x.date).slice(0, 7) === ym; });
    if (pays.length) h += '<h3 style="margin:14px 0 2px;font-size:13.5px">💵 دفعات الشهر</h3>' + pays.map(function (x) { return '<div class="or"><div class="dt">' + dmy(x.date) + (x.method ? ' · ' + esc(x.method) : '') + '</div><b class="n c">' + n0(x.amount) + '</b></div>'; }).join('');
    h += '</div>';
    var S = P.statement || [];
    h += '<div class="card"><details class="iv"><summary><h3 style="margin:0">📒 كشف الحساب<em>آخر ' + S.length + ' حركة ⌄</em></h3></summary>' + (S.length ? '<div class="tw" style="margin-top:8px"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>عليكم</th><th>دفعتم</th><th>الرصيد</th></tr></thead><tbody>' + S.map(function (r) { return '<tr><td class="n">' + dmy(r.date) + '</td><td>' + esc(r.label) + '</td><td class="n dd">' + (r.debit ? n0(r.debit) : '') + '</td><td class="n c">' + (r.credit ? n0(r.credit) : '') + '</td><td class="n">' + n0(r.balance) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="mt" style="margin-top:8px">مفيش حركات لسه</p>') + '<button class="btn g w" style="margin-top:10px" data-q="stmt">🖨 اطبع / PDF</button></details></div>';
    el.innerHTML = h; wire(el);
    [].forEach.call(el.querySelectorAll('[data-y]'), function (b) { b.onclick = function () { ui.y = b.dataset.y; ui.m = ui.y === ty ? tm : 12; acct(); }; });
    [].forEach.call(el.querySelectorAll('[data-m]'), function (b) { b.onclick = function () { ui.m = +b.dataset.m; acct(); }; });
    setTimeout(function () { grow(el); var on = el.querySelector('.mh .on'); if (on) on.parentNode.scrollLeft = on.offsetLeft - on.parentNode.clientWidth / 2 + on.clientWidth / 2; }, 60);
  }
  function printStmt() {
    var S = P.statement || [], c = P.company || {};
    var w = window.open('', '_blank'); if (!w) return toast('اسمحوا بالنوافذ المنبثقة');
    w.document.write('<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>كشف حساب ' + esc(P.center.name) + '</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#0F172A}h1{font-size:20px;margin:0}p{color:#64748B;margin:4px 0 16px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#F1F5F9;text-align:right;padding:8px}td{padding:8px;border-bottom:1px solid #E2E8F0}.n{direction:ltr;text-align:left}.b{margin-top:14px;font-size:16px;font-weight:800}</style>' +
      '<h1>كشف حساب — ' + esc(P.center.name) + '</h1><p>' + esc(c.name) + ' · ' + dmy(P.today) + '</p><table><thead><tr><th>التاريخ</th><th>البيان</th><th>عليكم</th><th>دفعتم</th><th>الرصيد</th></tr></thead><tbody>' +
      S.map(function (r) { return '<tr><td class="n">' + dmy(r.date) + '</td><td>' + esc(r.label) + '</td><td class="n">' + (r.debit ? n0(r.debit) : '') + '</td><td class="n">' + (r.credit ? n0(r.credit) : '') + '</td><td class="n">' + n0(r.balance) + '</td></tr>'; }).join('') +
      '</tbody></table><div class="b">المستحق: ' + n0(P.due) + ' ' + esc(P.cur) + '</div><script>setTimeout(function(){print()},400)<\/script></html>');
    w.document.close();
  }

  /* ════ الفواتير + الدفع ════ */
  function invView() {
    var el = $('v-inv'), I = P.invoices || [], pi = P.payinfo || {}, by = {};
    I.forEach(function (v) { var k = String(v.date).slice(0, 7); (by[k] = by[k] || []).push(v); });
    var h = '<div class="card"><h3>💳 ادفعوا بسهولة</h3>' +
      (pi.instapay ? '<div class="pi"><span style="font-size:22px">⚡</span><div class="x"><small>InstaPay</small><b class="n">' + esc(pi.instapay) + '</b></div><button class="cp" data-cp="' + esc(pi.instapay) + '">نسخ</button></div>' : '') +
      (pi.wallet ? '<div class="pi"><span style="font-size:22px">📱</span><div class="x"><small>محفظة (فودافون كاش وغيرها)</small><b class="n">' + esc(pi.wallet) + '</b></div><button class="cp" data-cp="' + esc(pi.wallet) + '">نسخ</button></div>' : '') +
      (pi.bank || pi.iban ? '<div class="pi"><span style="font-size:22px">🏦</span><div class="x"><small>تحويل بنكي' + (pi.bank ? ' · ' + esc(pi.bank) : '') + '</small><b class="n">' + esc(pi.iban || '') + '</b></div>' + (pi.iban ? '<button class="cp" data-cp="' + esc(pi.iban) + '">نسخ</button>' : '') + '</div>' : '') +
      (!pi.instapay && !pi.wallet && !pi.bank && !pi.iban ? '<p class="mt">كلمونا وهنبعتلكم طريقة الدفع.</p>' : '') + (pi.note ? '<p class="mt" style="margin-top:6px">' + esc(pi.note) + '</p>' : '') +
      '<button class="btn big w" style="margin-top:10px" data-q="pay">📸 ابعتوا صورة التحويل</button></div>';
    var ks = Object.keys(by).sort().reverse();
    h += '<div class="card"><h3>🧾 الفواتير<em>' + I.length + ' فاتورة</em></h3>' + (ks.length ? ks.map(function (k) {
      var p = k.split('-');
      return '<div style="font-size:12px;font-weight:800;color:var(--mut);margin:10px 0 2px">' + MON[+p[1] - 1] + ' ' + p[0] + '</div>' + by[k].map(function (v) {
        var r = v.total - v.paid, t = r <= .5 ? '<span class="tg ok">مسددة</span>' : v.paid > .5 ? '<span class="tg pt">باقي ' + n0(r) + '</span>' : '<span class="tg no">آجل</span>';
        return '<details class="iv"><summary class="inv"><div class="x"><b>#' + esc(v.no) + ' · ' + n0(v.total) + ' ' + esc(P.cur) + '</b><small>' + dmy(v.date) + ' · ' + v.items.length + ' صنف</small></div>' + t + '<a class="pdf" href="' + SELF + '/inv/' + encodeURIComponent(v.id) + '" target="_blank" onclick="event.stopPropagation()">PDF</a></summary>' +
          (v.items.length ? '<div class="tw"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>' + v.items.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + n0(x.qty) + '</td><td class="n">' + n0(x.price) + '</td><td class="n">' + n0(x.total) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</details>';
      }).join('');
    }).join('') : '<div class="emp"><i>🧾</i>مفيش فواتير لسه</div>') + '</div>';
    el.innerHTML = h; wire(el);
    [].forEach.call(el.querySelectorAll('[data-cp]'), function (b) { b.onclick = function () { try { navigator.clipboard.writeText(b.dataset.cp).then(function () { toast('اتنسخ ✓'); }); } catch (e) { toast(b.dataset.cp); } }; });
  }

  /* ════ الصيانة: تتبّع الفني + تقييم ════ */
  function help() {
    var el = $('v-help'), L = maints(), am = activeMaint(), ur = unrated(), c = P.company || {};
    var ph = String(c.phone || '').replace(/\D/g, ''), wa = ph ? (ph.indexOf('0') === 0 ? '2' + ph : ph) : '';
    var h = '';
    if (am) h += '<div class="card" id="trkc"><h3><span id="trkh">' + (am.urgent ? '🚨' : '🛠') + ' طلب الصيانة الحالي</span><em>' + dmy(am.at) + ' ' + hm(am.at) + '</em></h3><p class="mt"><b style="color:var(--ink)">' + esc(am.device || '') + '</b> ' + esc(am.note || '') + '</p><div id="trkb"><div class="emp"><i>⏳</i>' + (am.status === 'new' ? 'بندوّر على أقرب فني…' : 'بنجيب مكان الفني…') + '</div></div></div>';
    if (ur) h += rateCard(ur);
    h += '<button class="btn big o w" style="margin-top:12px" data-q="maint">🛠 اطلب صيانة جديدة</button>';
    if (ph) h += '<div class="card"><h3>📞 كلّمونا</h3><div style="display:flex;gap:8px"><a class="btn g" style="flex:1;text-decoration:none" href="tel:' + esc(ph) + '">📞 اتصال</a><a class="btn" style="flex:1;background:#16A34A;text-decoration:none" href="https://wa.me/' + esc(wa) + '" target="_blank">واتساب</a></div></div>';
    h += '<div class="card"><h3>🧰 طلبات الصيانة<em>' + L.length + '</em></h3>' + (L.length ? L.map(function (o) { return '<div class="or"><div class="dt"><b>' + esc(o.device || 'صيانة') + (o.note ? ': ' + esc(String(o.note).slice(0, 60)) : '') + '</b><small>' + dmy(o.at) + ' ' + hm(o.at) + (o.reply ? ' · ' + esc(o.reply) : '') + (o.rating ? ' · ' + '⭐'.repeat(o.rating) : '') + '</small></div>' + tag(o) + '</div>'; }).join('') : '<div class="emp"><i>✨</i>مفيش طلبات صيانة</div>') + '</div>';
    el.innerHTML = h; wire(el); if (ur) wireRate(ur);
    if (am) { LV.id = am.id; LV.map = null; clearTimeout(ui.tt); track(am.id); }
  }
  /* ── 4.89 · live tracking: one map that stays, the technician glides to each new spot, his trail, ETA and "مباشر" ── */
  var LV = { id: 0, map: null, me: null, ctr: null, line: null, trail: null, pts: [], at: '', fit: false, last: null };
  function ago(ts) { var m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(String(ts || '')); if (!m) return ''; var t = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime(), s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 15 ? 'دلوقتي' : s < 60 ? 'من ' + s + ' ثانية' : s < 3600 ? 'من ' + Math.round(s / 60) + ' دقيقة' : 'من ' + Math.round(s / 3600) + ' ساعة'; }
  function km(d) { return d == null ? '' : d >= 1000 ? (d / 1000).toFixed(1) + ' كم' : d + ' م'; }
  function track(id) {
    fetch(SELF + '/track?id=' + id, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var box = $('trkb'); if (!box || !d || LV.id !== id) return;
      var t = d.task, going = t && t.status === 'going';
      clearTimeout(ui.tt); ui.tt = setTimeout(function () { if (ui.tab === 'help' && document.visibilityState === 'visible') track(id); else ui.tt = setTimeout(function () { track(id); }, 4000); }, going ? 8000 : 20000);
      var hd = $('trkh');
      if (!t) { box.innerHTML = '<div class="emp"><i>📣</i>الطلب اتبعت لكل الفنيين — أول واحد يقبل هيتحرك ليكم</div>'; return; }
      if (d.status === 'sent' || t.status === 'done') { location.reload(); return; }
      if (hd) hd.innerHTML = { new: '👷 الفني قبل الطلب', going: '📍 الفني في الطريق ليكم', arrived: '📍 الفني وصل عندكم', working: '🔧 الفني بيصلّح دلوقتي' }[t.status] || 'طلب الصيانة';
      var hasLoc = t.last_lat != null && (t.status === 'going' || t.status === 'arrived');
      if (!box.querySelector('.lvw') || !!box.querySelector('.map') !== hasLoc) {
        LV.map = null; LV.pts = []; LV.fit = false;
        var av = t.has_photo ? '<img src="' + SELF + '/tech?id=' + id + '" alt="">' : esc(String(t.emp || '?').charAt(0));
        box.innerHTML = '<div class="lvw">' + (hasLoc ? '<div class="map" id="tmap"><span class="live"><i></i>مباشر · <em id="lvago"></em></span></div>' : '') +
          '<div class="tech' + (hasLoc ? ' ov' : '') + '"><span class="av">' + av + '</span><div style="min-width:0"><b>' + esc(t.emp) + ' · ' + esc(t.job || 'فني صيانة') + '</b><small id="lvst"></small></div><div class="eta" id="lveta"></div></div>' +
          '<div class="trk"><span class="ln" id="lvln"></span>' + [['📝', 'اتبعت'], ['👷', 'اتقبل'], ['🚗', 'في الطريق'], ['📍', 'وصل'], ['🔧', 'بيصلّح']].map(function (s2, i) { return '<div data-k="' + i + '"><i>' + s2[0] + '</i>' + s2[1] + '</div>'; }).join('') + '</div>' +
          (!hasLoc ? '<p class="mt" style="text-align:center;margin-top:6px">' + (t.status === 'new' ? '🗺 هيظهر على الخريطة لايف أول ما يتحرك ليكم' : '') + '</p>' : '') + '</div>';
      }
      var k = { new: 1, going: 2, arrived: 3, working: 4 }[t.status] || 1;
      [].forEach.call(box.querySelectorAll('.trk [data-k]'), function (x) { var i = +x.dataset.k; x.className = i < k ? 'ok' : i === k ? 'cur' : ''; });
      setTimeout(function () { var ln = $('lvln'); if (ln) ln.style.width = (k / 4 * 100) + '%'; }, 40);
      var st = $('lvst'); if (st) st.innerHTML = (t.stars ? '⭐ ' + t.stars + ' · ' : '') + (t.jobs ? n0(t.jobs) + ' مهمة خلّصها' : 'فني صيانة') + (going && t.dist != null ? ' · باقي ' + km(t.dist) : '');
      var et = $('lveta');
      if (et) { if (going && t.eta) { et.innerHTML = t.eta + '<small>دقيقة</small>'; et.style.display = ''; } else if (going && t.dist != null) { et.innerHTML = km(t.dist); et.style.display = ''; } else if (t.status === 'arrived') { et.innerHTML = '📍<small>وصل</small>'; et.style.display = ''; } else et.style.display = 'none'; }
      LV.at = t.last_at; var ag = $('lvago'); if (ag) ag.textContent = ago(t.last_at);
      if (hasLoc) drawMap(t);
    }).catch(function () { clearTimeout(ui.tt); ui.tt = setTimeout(function () { track(id); }, 15000); });
  }
  setInterval(function () { var ag = $('lvago'); if (ag && LV.at) ag.textContent = ago(LV.at); }, 5000);
  function leaflet(cb) {
    if (window.L && L.map) return cb();
    if (leaflet.q) return leaflet.q.push(cb); leaflet.q = [cb];
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/vendor/leaflet/leaflet.css'; document.head.appendChild(l);
    var s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = function () { var q = leaflet.q; leaflet.q = null; q.forEach(function (f) { f(); }); }; document.head.appendChild(s);
  }
  function glide(mk, to, ms) {   /* move the marker smoothly instead of jumping */
    var fr = mk.getLatLng(), t0 = performance.now();
    if (Math.abs(fr.lat - to[0]) + Math.abs(fr.lng - to[1]) < 1e-7) return;
    (function f(n) { var k = Math.min(1, (n - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; mk.setLatLng([fr.lat + (to[0] - fr.lat) * e, fr.lng + (to[1] - fr.lng) * e]); if (LV.line && LV.ctr) LV.line.setLatLngs([mk.getLatLng(), LV.ctr.getLatLng()]); if (k < 1) requestAnimationFrame(f); })(t0);
  }
  function fitLive(here, t, anim) {   /* keep the technician and the center in view, clear of the «مباشر» chip and the card over the map */
    var o = { paddingTopLeft: [34, 58], paddingBottomRight: [34, 86], maxZoom: 16, animate: !!anim, duration: 1 };
    if (LV.ctr) LV.map.fitBounds([here, [t.c_lat, t.c_lng]], o); else LV.map.setView(here, 15, { animate: !!anim });
  }
  function drawMap(t) {
    leaflet(function () {
      var el = $('tmap'); if (!el) return;
      var here = [t.last_lat, t.last_lng];
      if (!LV.map || LV.map.getContainer() !== el) {
        var m = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, tap: true }); L.control.attribution({ position: 'topleft', prefix: false }).addTo(m);
        L.tileLayer('/tiles/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
        LV.map = m; LV.pts = [here];
        LV.trail = L.polyline([here], { color: '#F97316', weight: 4, opacity: .45 }).addTo(m);
        LV.ctr = t.c_lat != null ? L.marker([t.c_lat, t.c_lng], { icon: L.divIcon({ className: '', html: '<div class="cdot"><span>🏥</span></div>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(m) : null;
        LV.line = LV.ctr ? L.polyline([here, [t.c_lat, t.c_lng]], { color: '#0E9F9A', weight: 4, dashArray: '8 9', opacity: .85, className: 'ant' }).addTo(m) : null;
        LV.me = L.marker(here, { zIndexOffset: 500, icon: L.divIcon({ className: '', html: '<div class="dot"><span>🚗</span></div>', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(m);
        fitLive(here, t, false);
        m.on('dragstart zoomstart', function () { LV.fit = true; });
        setTimeout(function () { m.invalidateSize(); }, 200);
        return;
      }
      var lp = LV.pts[LV.pts.length - 1];
      if (!lp || lp[0] !== here[0] || lp[1] !== here[1]) { LV.pts.push(here); LV.trail.addLatLng(here); glide(LV.me, here, 1600); }
      if (!LV.fit) fitLive(here, t, true);
    });
  }
  function rateCard(o) {
    return '<div class="card" id="ratec" style="text-align:center"><h3 style="justify-content:center">⭐ العطل اتصلح — قيّموا الفني</h3><p class="mt">' + esc(o.device || '') + ' · ' + dmy(o.at) + '</p>' +
      '<div class="stars">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-s="' + n + '">★</button>'; }).join('') + '</div>' +
      '<div class="chips">' + ['سريع', 'محترم', 'نضيف في شغله', 'شرح العطل', 'جه في ميعاده'].map(function (x) { return '<button data-tg="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
      '<input class="fld" id="rnote" maxlength="200" placeholder="كلمة للفني (اختياري)"><button class="btn big w" id="rgo" style="margin-top:10px" disabled>ابعت التقييم</button></div>';
  }
  function wireRate(o) {
    var st = 0, tags = {};
    [].forEach.call(document.querySelectorAll('#ratec [data-s]'), function (b) { b.onclick = function () { st = +b.dataset.s; [].forEach.call(document.querySelectorAll('#ratec [data-s]'), function (x) { x.classList.toggle('on', +x.dataset.s <= st); }); $('rgo').disabled = false; }; });
    [].forEach.call(document.querySelectorAll('#ratec [data-tg]'), function (b) { b.onclick = function () { tags[b.dataset.tg] = !tags[b.dataset.tg]; b.classList.toggle('on', !!tags[b.dataset.tg]); }; });
    $('rgo').onclick = function () {
      var b = $('rgo'); b.disabled = true;
      post('rate', { id: o.id, stars: st, tags: Object.keys(tags).filter(function (k) { return tags[k]; }), note: $('rnote').value })
        .then(function () { doneBox('⭐', 'شكراً على تقييمكم', 'رأيكم وصل للفني وللإدارة'); }).catch(function (e) { b.disabled = false; toast(e.message); });
    };
  }

  /* ════ sheets ════ */
  function sheet(html) { $('shp').innerHTML = '<div class="gr"></div><button class="x" type="button" aria-label="قفل">×</button>' + html; $('sh').classList.add('on'); $('shp').querySelector('.x').onclick = closeSheet; document.body.style.overflow = 'hidden'; }
  function closeSheet() { $('sh').classList.remove('on'); document.body.style.overflow = ''; }
  function pickSheet() {
    sheet('<h2>عايزين إيه؟</h2><div class="pick"><button data-k="order"><i style="background:#E0F2FE">📦</i><span><b>اطلب ورق</b><small>A3 · A4 · plastic — بالكمية اللي محتاجينها</small></span></button>' +
      '<button data-k="maint"><i style="background:#FFEDD5">🛠</i><span><b>طلب صيانة</b><small>اكتبوا العطل وصوّروه — أقرب فني هيتحرك</small></span></button>' +
      '<button data-k="pay"><i style="background:#DCFCE7">💳</i><span><b>ابعتوا تحويل</b><small>المبلغ وصورة الإيصال</small></span></button></div>');
    [].forEach.call($('shp').querySelectorAll('[data-k]'), function (b) { b.onclick = function () { ({ order: orderSheet, maint: maintSheet, pay: paySheet })[b.dataset.k](); }; });
  }
  function orderSheet() {
    var O = P.orderable || [];
    sheet('<h2>📦 اطلب ورق</h2><p class="mt">اختاروا الصنف واكتبوا الكمية</p><div id="ols"></div><button class="add" id="oadd" type="button">＋ صنف كمان</button>' +
      '<input class="fld" id="owho" maxlength="60" placeholder="اسم اللي طالب ورقم تليفونه (اختياري)"><textarea class="fld" id="onote" rows="2" maxlength="300" placeholder="ملاحظة (اختياري)"></textarea>' +
      '<button class="btn big w" id="ogo" style="margin-top:12px">ابعت الطلب</button><div class="msg" id="omsg"></div>');
    var line = function (pre) { var d = document.createElement('div'); d.className = 'ol'; d.innerHTML = '<select><option value="">اختار الصنف…</option>' + O.map(function (p, i) { return '<option value="' + i + '"' + (pre && pre.name === p.name ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select><input type="number" inputmode="numeric" min="1" placeholder="الكمية"' + (pre ? ' value="' + pre.qty + '"' : '') + '><button class="rm" type="button">×</button>'; d.querySelector('.rm').onclick = function () { d.remove(); }; $('ols').appendChild(d); };
    line(); $('oadd').onclick = function () { line(); };
    $('ogo').onclick = function () {
      var items = [].map.call(document.querySelectorAll('#ols .ol'), function (l) { var s = l.querySelector('select').value, q = Number(l.querySelector('input').value); return s !== '' && q > 0 ? { name: O[+s].name, unit: O[+s].unit || '', qty: q } : null; }).filter(Boolean);
      if (!items.length) { $('omsg').textContent = 'اختاروا صنف واكتبوا الكمية'; return; }
      var b = $('ogo'); b.disabled = true; b.textContent = 'بنبعت…';
      post('order', { items: items, contact: $('owho').value, note: $('onote').value }).then(function () { closeSheet(); doneBox('✅', 'الطلب وصلنا', 'هنأكده معاكم في أقرب وقت'); })
        .catch(function (e) { b.disabled = false; b.textContent = 'ابعت الطلب'; $('omsg').textContent = e.message; });
    };
  }
  var PH = [];
  function shrink(f, cb) { var u = URL.createObjectURL(f), im = new Image(); im.onload = function () { var M = 1024, w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, M / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); var d = c.toDataURL('image/jpeg', 0.5); if (d.length > 1100000) d = c.toDataURL('image/jpeg', 0.35); cb(d); }; im.onerror = function () { URL.revokeObjectURL(u); cb(null); }; im.src = u; }
  function photoBox(max) {
    PH = [];
    return '<div class="phr"><label class="phb">📷 صوّر<input type="file" accept="image/*" capture="environment" hidden data-ph></label><label class="phb g">🖼 من الصور<input type="file" accept="image/*" multiple hidden data-ph></label></div><div class="phs" id="phs"></div><small style="display:block;color:var(--faint);font-size:11.5px;margin-top:6px">لحد ' + max + ' صور — بتتصغّر تلقائي قبل ما تتبعت</small>';
  }
  function wirePhotos(max) {
    var draw = function () { $('phs').innerHTML = PH.map(function (d, i) { return '<div><img src="' + d + '" alt=""><button type="button" data-rm="' + i + '">×</button><small>' + Math.round(d.length * .75 / 1024) + ' KB</small></div>'; }).join(''); [].forEach.call($('phs').querySelectorAll('[data-rm]'), function (b) { b.onclick = function () { PH.splice(+b.dataset.rm, 1); draw(); }; }); };
    [].forEach.call($('shp').querySelectorAll('[data-ph]'), function (inp) { inp.onchange = function () { [].slice.call(inp.files || []).forEach(function (f) { if (PH.length >= max) return; shrink(f, function (d) { if (d && PH.length < max) { PH.push(d); draw(); } }); }); inp.value = ''; }; });
  }
  function maintSheet() {
    var D = P.devices || [];
    sheet('<h2>🛠 طلب صيانة</h2><p class="mt">اكتبوا الشكوى وصوّروا العطل — أقرب فني هيتحرك ليكم</p><div class="dv" id="mdv">' + D.map(function (x, i) { return '<button type="button" class="' + (i === 0 ? 'on' : '') + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<textarea class="fld" id="mpr" rows="3" maxlength="400" placeholder="اكتب الشكوى — مثلاً: الطابعة بتطلع الفيلم فاضي"></textarea>' + photoBox(3) +
      '<label class="urg"><input type="checkbox" id="mur"> <span>🚨 مستعجل — الشغل واقف</span></label><input class="fld" id="mwho" maxlength="60" placeholder="اسم اللي طالب ورقم تليفونه (اختياري)">' +
      '<button class="btn big o w" id="mgo" style="margin-top:12px">ابعت طلب الصيانة</button><div class="msg" id="mmsg"></div>');
    [].forEach.call($('mdv').querySelectorAll('button'), function (b) { b.onclick = function () { [].forEach.call($('mdv').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); }; });
    wirePhotos(3);
    $('mgo').onclick = function () {
      var pr = $('mpr').value.trim(); if (pr.length < 3) { $('mmsg').textContent = 'اكتبوا الشكوى'; return; }
      var d = $('mdv').querySelector('.on'), b = $('mgo'); b.disabled = true; b.textContent = 'بنبعت…';
      post('maint', { device: d ? d.textContent : '', problem: pr, urgent: $('mur').checked, contact: $('mwho').value, photos: PH }).then(function () { closeSheet(); doneBox('🛠', 'طلب الصيانة وصلنا', 'أقرب فني هيتحرك — تابعوه من «الصيانة»'); })
        .catch(function (e) { b.disabled = false; b.textContent = 'ابعت طلب الصيانة'; $('mmsg').textContent = e.message; });
    };
  }
  function paySheet() {
    var pi = P.payinfo || {}, M = [pi.instapay ? 'InstaPay' : '', pi.wallet ? 'محفظة' : '', pi.bank || pi.iban ? 'تحويل بنكي' : '', 'كاش'].filter(Boolean);
    sheet('<h2>💳 ابعتوا تحويل</h2><p class="mt">اكتبوا المبلغ وصوّروا الإيصال — هيتسجّل بعد المراجعة</p>' +
      '<input class="fld" id="pam" type="number" inputmode="decimal" min="1" placeholder="المبلغ (' + esc(P.cur) + ')" style="font-size:20px;font-weight:800;text-align:center">' +
      '<div class="dv" id="pmt">' + M.map(function (x, i) { return '<button type="button" class="' + (i === 0 ? 'on' : '') + '">' + esc(x) + '</button>'; }).join('') + '</div>' + photoBox(2) +
      '<input class="fld" id="pnote" maxlength="200" placeholder="ملاحظة (اختياري) — مثلاً: رقم العملية">' +
      '<button class="btn big w" id="pgo" style="margin-top:12px">ابعت</button><div class="msg" id="pmsg"></div>');
    [].forEach.call($('pmt').querySelectorAll('button'), function (b) { b.onclick = function () { [].forEach.call($('pmt').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); }; });
    wirePhotos(2);
    $('pgo').onclick = function () {
      var a = Number($('pam').value); if (!(a > 0)) { $('pmsg').textContent = 'اكتبوا المبلغ'; return; }
      var m = $('pmt').querySelector('.on'), b = $('pgo'); b.disabled = true; b.textContent = 'بنبعت…';
      post('pay', { amount: a, method: m ? m.textContent : '', note: $('pnote').value, photos: PH }).then(function () { closeSheet(); doneBox('💳', 'التحويل وصلنا', 'هيتراجع ويتسجّل في حسابكم'); })
        .catch(function (e) { b.disabled = false; b.textContent = 'ابعت'; $('pmsg').textContent = e.message; });
    };
  }

  /* ── no zoom on phones ── */
  (function () { var p = function (e) { e.preventDefault(); }; document.addEventListener('gesturestart', p, { passive: false }); document.addEventListener('gesturechange', p, { passive: false }); document.addEventListener('touchmove', function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false }); document.addEventListener('dblclick', p, { passive: false }); })();

  shell();
  var t0 = String(location.hash || '').slice(1);
  go(['home', 'acct', 'inv', 'help'].indexOf(t0) > -1 ? t0 : (unrated() || activeMaint() && /maint|help/.test(t0) ? 'help' : 'home'));
})();

/* ════════════════════════════════════════════════════════════════════
   ERP · إشعارات الموبايل (4.39) — زي PrintWatch: زرار «تفعيل» مرة واحدة
   على كل جهاز، وبعدها توصلك الإشعارات والبرنامج مقفول:
   · الملخص اليومي · عجز في تقفيل اليومية · مصروف مستني موافقتك · تحويل لفرع
   · على iPhone لازم البرنامج يكون متضاف للشاشة الرئيسية (iOS 16.4+)
   · الضغط على الإشعار بيفتح المكان بتاعه («الفلوس» / طلبات الموافقة)
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var state = { on: false, busy: false, checked: false };
  function base() { return typeof API_BASE !== 'undefined' ? API_BASE : ''; }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function admin() { return typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin'; }
  function ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function why() {
    if (!window.isSecureContext) return 'الإشعارات محتاجة رابط آمن (https).';
    if (ios() && !standalone()) return 'على الآيفون: افتح البرنامج من Safari ← زرار المشاركة ⬆️ ← «إضافة إلى الشاشة الرئيسية»، وافتحه من الأيقونة الجديدة وفعّل من هناك (iOS 16.4 أو أحدث).';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'المتصفح ده مش بيدعم الإشعارات — على أندرويد استخدم Chrome.';
    if (Notification.permission === 'denied') return 'الإشعارات مقفولة للبرنامج ده من إعدادات المتصفح/الموبايل — افتحها من هناك وارجع فعّل.';
    return null;
  }
  function api(path, body) {
    return fetch(base() + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'تعذر الاتصال'); return j; }); });
  }
  function reg() { return navigator.serviceWorker.getRegistration(base() + '/').then(function (r) { return r || navigator.serviceWorker.register(base() + '/sw.js', { scope: base() + '/' }); }); }
  function u8(b64) { var s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

  function check() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') { state.checked = true; paint(); return Promise.resolve(false); }
    return reg().then(function (r) { return r.pushManager.getSubscription(); }).then(function (s) { state.on = !!s && Notification.permission === 'granted'; state.checked = true; paint(); return state.on; }).catch(function () { state.checked = true; paint(); return false; });
  }
  function enable() {
    var w = why(); if (w) { info(w); return Promise.resolve(false); }
    state.busy = true; paint();
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('محتاج توافق على الإشعارات');
      return Promise.all([reg(), api('/api/push/key')]);
    }).then(function (x) {
      var r = x[0], key = x[1].key;
      return navigator.serviceWorker.ready.then(function () { return r.pushManager.getSubscription(); }).then(function (old) {
        return old ? old.unsubscribe().then(function () { return null; }) : null;
      }).then(function () { return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) }); });
    }).then(function (sub) { return api('/api/push/subscribe', { subscription: sub.toJSON() }); })
      .then(function () { state.on = true; state.busy = false; paint(); T('الإشعارات اشتغلت على الجهاز ده ✓'); return api('/api/push/test', {}); })
      .then(function () { return true; })
      .catch(function (e) { state.busy = false; paint(); T(e.message || 'ما اتفعلتش', 'error'); return false; });
  }
  function disable() {
    state.busy = true; paint();
    return reg().then(function (r) { return r.pushManager.getSubscription(); }).then(function (s) {
      if (!s) return null;
      var ep = s.endpoint; return s.unsubscribe().then(function () { return api('/api/push/unsubscribe', { endpoint: ep }); });
    }).then(function () { state.on = false; state.busy = false; paint(); T('الإشعارات اتقفلت على الجهاز ده'); })
      .catch(function () { state.busy = false; paint(); });
  }
  function toggle() { return state.on ? disable() : enable(); }
  function info(msg) { if (typeof openModal === 'function') openModal('🔔 إشعارات الموبايل', '<p class="pfx-note" style="font-size:14px;line-height:1.9">' + msg + '</p>', '<button class="btn btn-primary" onclick="closeModal()">تمام</button>'); else T(msg, 'info'); }

  /* the strip in the notification centre + the row in «الملخص اليومي» */
  function strip() {
    if (!admin()) return '';
    return '<div class="axp-strip ax-hl-off" data-axp><span class="axp-ic">🔔</span><div><b>إشعارات الموبايل</b><small>' + (state.on ? 'شغّالة على الجهاز ده — الملخص اليومي والعجز والموافقات' : 'توصلك والبرنامج مقفول: الملخص اليومي، أي عجز، أي مصروف مستني موافقتك') + '</small></div>' +
      '<button type="button" class="axp-btn' + (state.on ? ' on' : '') + '" onclick="AXPush.toggle()"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? '…' : state.on ? 'إيقاف' : 'تفعيل') + '</button></div>';
  }
  function paint() { document.querySelectorAll('[data-axp]').forEach(function (el) { var t = document.createElement('div'); t.innerHTML = strip(); if (t.firstChild) el.replaceWith(t.firstChild); }); }

  /* a notification was tapped → open its place */
  function go(u) {
    var p = ''; try { p = new URL(u, location.href).searchParams.get('go') || ''; } catch (e) {}
    if (!p) return;
    var tries = 0;
    (function wait() {
      if (typeof currentUser === 'undefined' || !currentUser || typeof navigate !== 'function' || !document.getElementById('page-content') || !document.getElementById('page-content').children.length) { if (++tries < 60) setTimeout(wait, 250); return; }
      if (p === 'staff') navigate('staff');
      else if (p === 'approvals') navigate('approvals');
      else if (p === 'fulus') { navigate('profit'); if (window.AXProfit && AXProfit.view) AXProfit.view('cash'); setTimeout(function () { if (window.AXFulus && AXFulus.digests) AXFulus.digests(); }, 300); }
    })();
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'ax-go') go(e.data.url); });
  try {
    if (/[?&]go=/.test(location.search)) { var u0 = location.href; history.replaceState(null, '', location.pathname + location.search.replace(/[?&]go=[^&]*/, '').replace(/^&/, '?') + location.hash); go(u0); }
  } catch (e) {}
  setTimeout(check, 1500);

  window.AXPush = { strip: strip, toggle: toggle, enable: enable, disable: disable, check: check, state: function () { return { on: state.on, why: why() }; } };
})();

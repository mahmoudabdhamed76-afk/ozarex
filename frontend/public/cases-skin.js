/* ════════════════════════════════════════════════════════════════════
   5.01 · QR Patient — شكل صفحات المريض
   الشكل بيختاره المركز: A «نَفَس» (أبيض وتركواز) أو C «دفا» (كريمي وبرتقالي)،
   + وضع ليلي (زرار 🌙، وبيتبع الموبايل أول مرة)،
   + شاشة ترحيب «ألف سلامة» باسم المركز ولوجوه (مرة في كل زيارة، وبتختفي لوحدها).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var C = window.CD || {}, H = document.documentElement, T = C.theme === 'c' ? 'c' : 'a';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function getDark() { try { var v = localStorage.getItem('ozx_dark'); if (v === '1') return true; if (v === '0') return false; } catch (e) {} return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
  function setDark(on) { H.classList.toggle('dk', on); var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = on ? (T === 'c' ? '#17110D' : '#061416') : (T === 'c' ? '#FBF6EF' : '#F2FBFA'); var b = document.getElementById('dkb'); if (b) b.innerHTML = on ? '☀️' : '🌙'; }
  H.classList.add('tx', 't' + T); setDark(getDark());
  function logo(cls) { return C.logo ? '<img class="' + (cls || '') + '" src="' + C.logo + '" alt="">' : '<b class="' + (cls || '') + ' ini">' + esc(String(C.center || 'م').trim().charAt(0)) + '</b>'; }
  var name = String(C.center || '').trim(), nm2 = /^مركز/.test(name) ? name : 'مركز ' + name;
  var ECG = '<svg class="ecg" viewBox="0 0 320 60"><path d="M0 32h96l10-18 12 36 12-44 10 26h8l6-8 6 8h160" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="146" cy="32" r="5"/></svg>';
  function splashHtml() {
    if (T === 'c') return '<div class="spl sc"><div class="sun"></div><div class="lg2">' + logo('') + '<div><b>' + esc(name) + '</b><small>نتيجة الأشعة على موبايلك</small></div></div>' +
      '<h1 class="big"><span>ألف</span><span class="o">سلامة</span><span>عليك</span></h1><p class="pp">' + esc(nm2) + ' بيرحّب بيكم على مدار اليوم — وإحنا معاك لحد ما تطمّن.</p>' +
      '<div class="hc"><span class="ht">♥</span><svg viewBox="0 0 200 40"><path d="M0 22h60l8-14 10 28 10-34 8 20h104" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><b>معاك 24 ساعة</b></div>' +
      '<div class="pills"><span>☀ الصبح</span><span>🌙 بالليل</span></div><button class="go" type="button">ادخل على نتيجتك <i>←</i></button></div>';
    return '<div class="spl sa"><i class="bl b1"></i><i class="bl b2"></i><div class="lgw"><span class="r r3"></span><span class="r r2"></span><span class="r"></span>' + logo('') + '</div>' +
      '<h1>ألف سلامة <i>♥</i></h1><h2>' + esc(nm2) + '</h2><p>بيرحّب بيكم على مدار اليوم<br>نتيجتك معاك على موبايلك في أي وقت</p>' + ECG +
      '<div class="h24"><b></b>شغالين 24 ساعة</div><button class="go" type="button">شوف نتيجتك ←</button></div>';
  }
  function splash() {
    if (C.missing) return;
    var key = 'ozx_spl:' + (C.pub || C.token || ''), back = '';
    try { back = sessionStorage.getItem('ozx_back') || ''; if (sessionStorage.getItem(key) || (C.token && back)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    var o = document.createElement('div'); o.className = 'splw'; o.innerHTML = splashHtml(); document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    var gone = false, close = function () { if (gone) return; gone = true; o.classList.add('out'); document.body.style.overflow = ''; setTimeout(function () { o.remove(); }, 650); };
    o.addEventListener('click', close); setTimeout(close, 3400);
  }
  function toggle() {
    var b = document.createElement('button'); b.id = 'dkb'; b.type = 'button'; b.title = 'وضع ليلي'; b.innerHTML = H.classList.contains('dk') ? '☀️' : '🌙';
    b.onclick = function () { var on = !H.classList.contains('dk'); setDark(on); try { localStorage.setItem('ozx_dark', on ? '1' : '0'); } catch (e) {} };
    var top = document.querySelector('.v .top'); if (top) { b.className = 'in'; top.appendChild(b); } else document.body.appendChild(b);
  }
  function mount() { toggle(); splash(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else setTimeout(mount, 0);
  window.OZSkin = { theme: T, logo: logo, nm2: nm2 };
})();

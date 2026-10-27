/* 4.91 · حالات المرضى — أدوات مشتركة بين صفحة المركز وصفحة «دوّر على نتيجتك»
   مفتاح كل حالة بيتغلّف بمفتاح طالع من (أول اسم المريض + آخر 10 أرقام من موبايله)،
   فالمريض اللي عارف الاتنين بس هو اللي يفتح حالته من الباركود الثابت. */
(function () {
  'use strict';
  function b64u(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  function digits(s) { return String(s || '').replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); }).replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x6F0); }).replace(/\D/g, ''); }
  function last10(p) { var d = digits(p); return d.length >= 8 ? d.slice(-10) : ''; }
  /* «أول اسم» normalized: no tashkeel, one shape of alef/yaa/taa marbuta; «عبد الله» = «عبدالله», «أبو بكر» = «ابوبكر» */
  function normName(n) {
    var s = String(n || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[^؀-ۿa-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var w = s.split(' ');
    if (!w[0]) return '';
    if (/^(عبد|ابو|ام|abd|abu)$/.test(w[0]) && w[1]) return w[0] + w[1];
    return w[0];
  }
  function kek(name, phone, salt) {
    var pw = new TextEncoder().encode('ozx|' + normName(name) + '|' + last10(phone));
    return crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 120000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']);
    });
  }
  /* rawKey (base64url of the case's AES key) → { s, i, k } that only (name, phone) opens */
  function wrap(rawKey, name, phone) {
    if (!normName(name) || !last10(phone)) return Promise.resolve(null);
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return kek(name, phone, salt).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, unb64u(rawKey)); })
      .then(function (ct) { return { s: b64u(salt), i: b64u(iv), k: b64u(ct) }; });
  }
  function unwrap(w, name, phone) {
    return kek(name, phone, unb64u(w.s)).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(w.i) }, k, unb64u(w.k)); })
      .then(function (raw) { return b64u(raw); }, function () { return null; });
  }
  window.OZK = { b64u: b64u, unb64u: unb64u, last10: last10, digits: digits, normName: normName, wrap: wrap, unwrap: unwrap };
})();

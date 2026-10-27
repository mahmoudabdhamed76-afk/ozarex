/* ════════════════════════════════════════════════════════════════════
   4.91 · «دوّر على نتيجتك» — الباركود الثابت المطبوع على كل تقارير المركز /h/<pub>
   المريض يكتب موبايله وأول اسمه ← السيرفر بيرجّع الحالات المتسجّلة على الرقم ده
   (من غير مفاتيحها) ← المفتاح بيتفك هنا بس لو الاسم صح ← يفتح الحالة.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var C = window.CD || {}, K = window.OZK, $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dmy(ts) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(ts || '')); return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] : ''; }
  document.body.className = 'v f';
  if (C.missing) { document.body.innerHTML = '<div class="w"><div class="ld" style="margin-top:30vh"><i>🔍</i><b>الباركود ده مش شغال</b><p>كلّم المركز.</p></div></div>'; return; }
  document.body.innerHTML = '<div class="w"><div class="hero"><span class="lg" style="width:58px;height:58px;font-size:26px">' + esc(String(C.center || 'م').trim().charAt(0)) + '</span><h1>' + esc(C.center) + '</h1><p>شوف نتيجة الأشعة بتاعتك على موبايلك 📱</p></div>' +
    '<div class="srch" id="sr">' + (C.on ?
      '<label class="l">رقم موبايلك (اللي اتسجّل في المركز)</label><input class="fld n" id="ph" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="01xxxxxxxxx" style="text-align:right">' +
      '<label class="l">أول اسمك</label><input class="fld" id="nm" autocomplete="given-name" maxlength="40" placeholder="مثلاً: محمد"><p class="hint">زي ما اتكتب في المركز — الاسم الأول بس.</p>' +
      '<button class="btn w" id="go" style="margin-top:14px;padding:14px;font-size:16px">🔍 دوّر على نتيجتي</button><div class="err" id="er" style="color:var(--red);font-weight:700;text-align:center;margin-top:8px;min-height:20px"></div>'
      : '<div class="ld" style="box-shadow:none;padding:6px"><i>⏸</i><b>البحث مقفول دلوقتي</b><p>كلّم المركز يبعتلك لينك نتيجتك.</p></div>') + '</div>' +
    '<div class="res" id="res"></div>' +
    '<div class="steps"><div><i>📷</i>مسحت الباركود</div><div><i>✍️</i>اكتب موبايلك واسمك</div><div><i>🩻</i>افتح نتيجتك</div></div>' +
    '<p class="foot">نتيجتك متشفّرة — محدش يقدر يفتحها غير بموبايلك واسمك.</p></div>';
  if (!C.on) return;
  try { var last = JSON.parse(sessionStorage.getItem('ozx_find') || 'null'); if (last) { $('ph').value = last.p || ''; $('nm').value = last.n || ''; } } catch (e) {}
  var go = function () {
    var ph = $('ph').value, nm = $('nm').value, b = $('go'), er = $('er'); er.textContent = '';
    if (!K.last10(ph)) { er.textContent = 'اكتب رقم الموبايل كامل'; $('ph').focus(); return; }
    if (!K.normName(nm)) { er.textContent = 'اكتب أول اسمك'; $('nm').focus(); return; }
    if (!(window.crypto && crypto.subtle)) { er.textContent = 'المتصفح ده قديم — افتح من Chrome أو Safari'; return; }
    b.disabled = true; b.innerHTML = '<span class="spin" style="width:20px;height:20px;border-width:3px;margin:0"></span> بندوّر…'; $('res').innerHTML = '';
    fetch(location.pathname.replace(/\/$/, '') + '/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: ph }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || 'محصلش — جرّب تاني'); return j.list || []; }); })
      .then(function (L) { return Promise.all(L.map(function (x) { return K.unwrap(x.w, nm, ph).then(function (k) { return k ? { x: x, k: k } : null; }); })); })
      .then(function (M) {
        M = M.filter(Boolean); b.disabled = false; b.innerHTML = '🔍 دوّر على نتيجتي';
        if (!M.length) { er.textContent = ''; $('res').innerHTML = '<div class="ld"><i>🤔</i><b>ملقيناش نتيجة بالبيانات دي</b><p>اتأكد إن الرقم هو اللي اتسجّل في المركز، والاسم الأول مكتوب زي ما اتكتب هناك. لو النتيجة لسه طالعة النهارده جرّب بعد شوية.</p></div>'; return; }
        try { sessionStorage.setItem('ozx_find', JSON.stringify({ p: ph, n: nm })); sessionStorage.setItem('ozx_back', location.pathname.replace(/\/$/, '')); } catch (e) {}
        var href = function (m) { return '/v/' + m.x.token + '#' + m.k; };
        if (M.length === 1) { $('res').innerHTML = '<div class="ld"><i>✅</i><b>لقينا نتيجتك</b><p>بنفتحها…</p></div>'; setTimeout(function () { location.href = href(M[0]); }, 450); return; }
        $('res').innerHTML = '<p style="color:var(--mut);font-weight:700;margin:4px 4px 0">لقينا ' + M.length + ' نتايج — اختار:</p>' + M.map(function (m, i) {
          return '<a class="rc" href="' + href(m) + '" style="animation-delay:' + (i * 60) + 'ms"><span class="ri">🩻</span><div><b>' + esc(m.x.exam || 'نتيجة فحص') + '</b><small>📅 ' + dmy(m.x.at) + (m.x.pages ? ' · ' + m.x.pages + ' صفحة' : '') + ' · ' + esc(m.x.hint) + '</small></div><span class="go">←</span></a>';
        }).join('');
      })
      .catch(function (e) { b.disabled = false; b.innerHTML = '🔍 دوّر على نتيجتي'; er.textContent = e.message; });
  };
  $('go').onclick = go; $('nm').onkeydown = $('ph').onkeydown = function (e) { if (e.key === 'Enter') go(); };
})();

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
    (C.on ? '<div class="miss" id="miss"><b>مش لاقي نتيجتك؟</b><p>اكتب موبايلك وأول اسمك فوق، ودوس هنا — طلبك بيوصل للمركز على طول وهم يرفعولك النتيجة.</p><input class="fld" id="nt0" maxlength="100" placeholder="نوع الفحص وتاريخه (اختياري) — مثلاً: مقطعية يوم 25/10" style="margin-bottom:8px"><button class="btn ask2 w" id="wa0">📨 اطلب نتيجتك من المركز</button></div>' : '') +
    '<div class="steps"><div><i>📷</i>مسحت الباركود</div><div><i>✍️</i>اكتب موبايلك واسمك</div><div><i>🩻</i>افتح نتيجتك</div></div>' +
    '<p class="foot">نتيجتك متشفّرة — محدش يقدر يفتحها غير بموبايلك واسمك.</p></div>';
  /* 4.95 · «اطلب نتيجتك» → a request inside the system (the center sees it live on its cases page) — no WhatsApp */
  var wa0 = $('wa0');
  if (wa0) wa0.onclick = function () {
    var ph = $('ph').value.trim(), nm = $('nm').value.trim(), er = $('er');
    if (!K.last10(ph) || !K.normName(nm)) { if (er) er.textContent = 'اكتب رقم موبايلك وأول اسمك الأول'; (K.last10(ph) ? $('nm') : $('ph')).focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    askIn(ph, nm, ($('nt0') || {}).value || '', wa0);
  };
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
        if (!M.length) { er.textContent = ''; notFound(ph, nm); return; }
        try { sessionStorage.setItem('ozx_find', JSON.stringify({ p: ph, n: nm })); sessionStorage.setItem('ozx_back', location.pathname.replace(/\/$/, '')); } catch (e) {}
        var href = function (m) { return '/v/' + m.x.token + '#' + m.k; };
        if (M.length === 1) { $('res').innerHTML = '<div class="ld"><i>✅</i><b>لقينا نتيجتك</b><p>بنفتحها…</p></div>'; setTimeout(function () { location.href = href(M[0]); }, 450); return; }
        $('res').innerHTML = '<p style="color:var(--mut);font-weight:700;margin:4px 4px 0">لقينا ' + M.length + ' نتايج — اختار:</p>' + M.map(function (m, i) {
          return '<a class="rc" href="' + href(m) + '" style="animation-delay:' + (i * 60) + 'ms"><span class="ri">🩻</span><div><b>' + esc(m.x.exam || 'نتيجة فحص') + '</b><small>📅 ' + dmy(m.x.at) + (m.x.pages ? ' · ' + m.x.pages + ' صفحة' : '') + ' · ' + esc(m.x.hint) + '</small></div><span class="go">←</span></a>';
        }).join('');
      })
      .catch(function (e) { b.disabled = false; b.innerHTML = '🔍 دوّر على نتيجتي'; er.textContent = e.message; });
  };
  function askIn(ph, name, note, b) {
    var t0 = b ? b.innerHTML : ''; if (b) { b.disabled = true; b.innerHTML = '<span class="spin" style="width:18px;height:18px;border-width:3px;margin:0"></span> بنبعت…'; }
    fetch(location.pathname.replace(/\/$/, '') + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: String(name).trim(), phone: ph, note: String(note || '').trim() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || 'محصلش — جرّب تاني'); }); })
      .then(function () {
        var mi = $('miss'); if (mi) mi.style.display = 'none';
        $('res').innerHTML = '<div class="ld ok2"><i>✅</i><b>طلبك وصل للمركز</b><p>أول ما يرفعوا نتيجتك هتلاقيها هنا بموبايلك وأول اسمك. سيب الصفحة مفتوحة وهنفتحهالك لوحدها أول ما تجهز.</p><p style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:center;font-weight:700;color:#0F766E"><span class="spin" style="width:18px;height:18px;border-width:3px;margin:0"></span> مستنيين المركز يرفعها…</p></div>';
        try { sessionStorage.setItem('ozx_find', JSON.stringify({ p: ph, n: name })); } catch (e) {}
        watch(ph, name);
      })
      .catch(function (e) { if (b) { b.disabled = false; b.innerHTML = t0; } var er = $('er'); if (er) er.textContent = e.message; toastIn(e.message); });
  }
  function toastIn(t) { var r = $('res'); if (r && !r.innerHTML) r.innerHTML = '<p style="color:var(--red);font-weight:700;text-align:center">' + esc(t) + '</p>'; }
  /* after asking: look again every 2 minutes (quietly) and open the result once it's uploaded */
  function watch(ph, nm) {
    var n = 0; clearInterval(watch.t);
    watch.t = setInterval(function () {
      if (++n > 15) return clearInterval(watch.t);
      if (document.visibilityState !== 'visible') return;
      fetch(location.pathname.replace(/\/$/, '') + '/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: ph }) })
        .then(function (r) { return r.ok ? r.json() : { list: [] }; })
        .then(function (j) { return Promise.all((j.list || []).map(function (x) { return K.unwrap(x.w, nm, ph).then(function (k) { return k ? { x: x, k: k } : null; }); })); })
        .then(function (M) { M = M.filter(Boolean); if (!M.length) return; clearInterval(watch.t); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} $('res').innerHTML = '<div class="ld"><i>🎉</i><b>نتيجتك جهزت!</b><p>بنفتحها…</p></div>'; try { sessionStorage.setItem('ozx_back', location.pathname.replace(/\/$/, '')); } catch (e) {} setTimeout(function () { location.href = '/v/' + M[0].x.token + '#' + M[0].k; }, 900); })
        .catch(function () {});
    }, 120000);
  }
  function notFound(ph, nm) {
    var mi = $('miss'); if (mi) mi.style.display = 'none';
    $('res').innerHTML = '<div class="ld"><i>🤔</i><b>ملقيناش نتيجة بالبيانات دي</b><p>اتأكد إن الرقم هو اللي اتسجّل في المركز، والاسم الأول مكتوب زي ما اتكتب هناك. لو النتيجة لسه طالعة النهارده جرّب بعد شوية.</p>' +
      '<div class="ask"><input class="fld" id="nt" maxlength="100" placeholder="نوع الفحص وتاريخه (اختياري) — مثلاً: مقطعية يوم 25/10"><button class="btn ask2" id="wa">📨 اطلب نتيجتك من المركز</button><small>طلبك بيوصل للمركز على طول، وهم يرفعولك النتيجة.</small></div></div>';
    var b = $('wa'); if (!b) return;
    b.onclick = function () { askIn(ph, String(nm).trim(), ($('nt') || {}).value || '', b); };
  }
  $('go').onclick = go; $('nm').onkeydown = $('ph').onkeydown = function (e) { if (e.key === 'Enter') go(); };
})();

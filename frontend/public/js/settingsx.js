/* ════════════════════════════════════════════════════════════════════
   ERP · الإعدادات — مقفولة بكلمة سر + مترتبة في أقسام (4.20)
   · المدير بس، وبنفس كلمة سر «سجل التعديلات» (فتح واحد بيفتح الاتنين 10 دقايق)
   · كل الكروت اللي كانت متكومة تحت بعض بقت في 5 أقسام بأزرار فوق:
     الشركة · البيع والتنبيهات · الشكل · النسخ الاحتياطي · منطقة الخطر
   · كل الكروت بنفس الشكل (من غير ألوان وخلفيات مختلفة)، والقسم اللي
     كنت فيه بيفضل مفتوح لما ترجع
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var GROUPS = [
    { k: 'company', t: 'الشركة', ic: '🏢', hint: 'بيانات الشركة واللوجو والعملة والضريبة' },
    { k: 'sales', t: 'البيع والتنبيهات', ic: '🧾', hint: 'قواعد البيع وحد الائتمان والأصوات' },
    { k: 'look', t: 'الشكل', ic: '🎨', hint: 'الوضع الليلي والشريط المتحرك والقرآن' },
    { k: 'backup', t: 'النسخ الاحتياطي', ic: '💾', hint: 'تنزيل نسخة واسترجاعها' },
    { k: 'danger', t: 'منطقة الخطر', ic: '⚠️', hint: 'مسح البيانات' }
  ];
  var RULES = [
    [/بيانات الشركة/, 'company'], [/معلومات النظام/, 'company'],
    [/قواعد البيع/, 'sales'], [/الأصوات/, 'sales'],
    [/المظهر/, 'look'], [/شريط النبض/, 'look'], [/سورة|قرآن|القرآن/, 'look'],
    [/OneDrive|النسخ الاحتياطي|نسخة/, 'backup'],
    [/منطقة الخطر/, 'danger']
  ];
  var KEY = 'ax_set_tab';
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || {}; }
  function version() { var v = document.querySelector('.version'); return v ? v.textContent.replace(/[^\d.]/g, '') : ''; }

  function organize(root) {
    if (root.querySelector('.axs')) return;
    var cards = Array.prototype.slice.call(root.querySelectorAll(':scope > .card'));
    if (!cards.length) return;
    var head = root.querySelector(':scope > .page-header');
    var wrap = document.createElement('div'); wrap.className = 'axs';
    var tab = ss(KEY) || 'company';
    var bins = {};
    GROUPS.forEach(function (g) { var sec = document.createElement('section'); sec.className = 'axs-group'; sec.dataset.g = g.k; sec.hidden = g.k !== tab; bins[g.k] = sec; });
    cards.forEach(function (c) {
      var title = (c.querySelector('.card-title') || {}).textContent || '';
      var g = 'company';
      for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(title)) { g = RULES[i][1]; break; }
      c.removeAttribute('style'); c.classList.add('axs-card');
      Array.prototype.forEach.call(c.querySelectorAll('.card-header, .card-title'), function (h) { h.removeAttribute('style'); });
      if (/معلومات النظام/.test(title)) {
        var v = version(), first = c.querySelector('div > div');
        if (v && first && /الإصدار/.test(first.textContent)) first.innerHTML = '<b>الإصدار:</b> ' + v;
      }
      bins[g].appendChild(c);
    });
    var nav = '<nav class="axs-tabs" role="tablist">' + GROUPS.map(function (g) {
      var n = bins[g.k].children.length; if (!n) return '';
      return '<button type="button" role="tab" class="axs-tab' + (g.k === 'danger' ? ' d' : '') + (g.k === tab ? ' on' : '') + '" aria-selected="' + (g.k === tab) + '" data-g="' + g.k + '" onclick="AXSettings.tab(\'' + g.k + '\')"><span>' + g.ic + '</span><b>' + g.t + '</b><small>' + g.hint + '</small></button>';
    }).join('') + '</nav>';
    wrap.innerHTML = nav;
    GROUPS.forEach(function (g) { if (bins[g.k].children.length) wrap.appendChild(bins[g.k]); });
    if (!bins[tab] || !bins[tab].children.length) { var firstG = GROUPS.filter(function (g) { return bins[g.k].children.length; })[0]; if (firstG) setTab(firstG.k, wrap); }
    if (head) {
      head.classList.add('axs-head');
      if (!head.querySelector('.axs-lock')) head.insertAdjacentHTML('beforeend', '<div class="axs-lock"><button type="button" class="btn btn-secondary btn-sm" onclick="AXLock.changePw()">🔑 كلمة السر</button><button type="button" class="btn btn-primary btn-sm" onclick="AXLock.lock(\'settings\')">🔒 اقفل</button></div>');
      head.insertAdjacentElement('afterend', wrap);
    } else root.insertBefore(wrap, root.firstChild);
  }
  function setTab(k, scope) {
    scope = scope || document;
    ss(KEY, k);
    Array.prototype.forEach.call(scope.querySelectorAll('.axs-tab'), function (b) { var on = b.dataset.g === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    Array.prototype.forEach.call(scope.querySelectorAll('.axs-group'), function (s) { s.hidden = s.dataset.g !== k; });
  }

  function after() {
    var root = document.getElementById('page-content'); if (!root) return;
    if (me().role !== 'admin') { root.innerHTML = '<div class="empty-state"><div class="icon">🔒</div><p>الإعدادات للمدير بس</p></div>'; return; }
    if (!window.AXLock) return organize(root);
    if (!AXLock.isOpen()) { root.innerHTML = AXLock.html(false, 'settings'); AXLock.focus(); return; }
    AXLock.touch();
    try { organize(root); } catch (e) { console.warn('[settingsx]', e); }
  }

  var orig = window.renderSettings;
  if (typeof orig === 'function' && !orig._axs) {
    var w = function () {
      var r = orig.apply(this, arguments);
      /* every other add-on that hooks the settings page runs in this same call — decide after all of them */
      (window.queueMicrotask || function (f) { Promise.resolve().then(f); })(after);
      return r;
    };
    w._axs = true;
    window.renderSettings = w;
  }
  window.AXSettings = { tab: function (k) { setTab(k); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} } };

  /* «الأمان والنسخ» و«المستخدمين» — same lock as the settings and the audit log
     (one password, one unlock opens all four for 10 minutes; admin only) */
  [['renderSecurity', 'security'], ['renderUsers', 'users']].forEach(function (x) {
    var fn = x[0], kind = x[1], o = window[fn];
    if (typeof o !== 'function' || o._axlk) return;
    var w = function () {
      var r = o.apply(this, arguments);
      (window.queueMicrotask || function (f) { Promise.resolve().then(f); })(function () {
        if (typeof currentPage !== 'undefined' && currentPage !== kind) return;
        var root = document.getElementById('page-content'); if (!root || !window.AXLock) return;
        if (!AXLock.isOpen()) { root.innerHTML = AXLock.html(false, kind); AXLock.focus(); return; }
        AXLock.touch();
      });
      return r;
    };
    w._axlk = true;
    window[fn] = w;
  });
})();

/* js/core/ui.js — UI shell: theme, toast / modal / confirm, sounds, ripple, count-up, Ctrl+K quick nav, shortcuts help, notification centre
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* =========================================================
   THEME
========================================================= */
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
  // Re-render charts if visible
  if (currentPage === 'dashboard') renderDashboard();
}
function updateThemeIcon(theme) {
  const ic = document.getElementById('theme-icon');
  if (!ic) return;
  if (theme === 'dark') {
    ic.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    ic.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}
function loadTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  updateThemeIcon(t);
}

function toggleSound() {
  DB.data.settings.soundEnabled = !(DB.data.settings.soundEnabled !== false);
  DB.save();
  if (DB.data.settings.soundEnabled) {
    playTone('success');
    toast('تم تفعيل الصوت');
  } else {
    toast('تم إيقاف الصوت');
  }
  if (currentPage === 'settings') renderSettings();
}

function toggleReciterSetting() {
  const audio = document.getElementById('reciter-audio');
  if (audio && audio.paused) playReciter();
  else pauseReciter();
  if (currentPage === 'settings') renderSettings();
}

function setReciterVolume(val) {
  const v = parseFloat(val) / 100;
  DB.data.settings.reciterVolume = v;
  DB.save();
  const audio = document.getElementById('reciter-audio');
  if (audio) audio.volume = v;
}

function toggleDailyBackupReminder(enabled) {
  DB.data.settings.dailyBackupReminder = enabled;
  if (enabled) {
    DB.data.settings.lastBackupReminderDate = todayStr();
  }
  DB.save();
  toast(enabled ? '✓ تم تفعيل التذكير اليومي' : '✗ تم إيقاف التذكير اليومي');
}

function checkBackupReminder() {
  if (!DB.data.settings.dailyBackupReminder) return;
  const today = todayStr();
  const lastReminder = DB.data.settings.lastBackupReminderDate || '';
  if (lastReminder !== today) {
    DB.data.settings.lastBackupReminderDate = today;
    DB.save();
    setTimeout(() => {
      playTone('notify');
      toast('☁️ مذكر يومي: لا تنسى أخذ نسخة احتياطية وحفظها على OneDrive!', 'info');
    }, 3500);
  }
}

/* =========================================================
   TOAST / MODAL
========================================================= */
/* ========================= SOUND SYSTEM (Web Audio API) ========================= */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { return null; }
  }
  return audioCtx;
}
function playTone(type='success') {
  if (!DB.data.settings || DB.data.settings.soundEnabled === false) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  // VOLUME is higher now - 0.32 base instead of 0.18
  // DIFFERENT melodic patterns per type so user can identify by ear
  const presets = {
    // Successful save (issuance/invoice creation) — bright triple-rise: C5 → E5 → G5 → C6 ascending major chord
    save:    [ {f:523, t:0,   d:.10, g:.35}, {f:659, t:.08, d:.10, g:.38}, {f:784, t:.16, d:.12, g:.40}, {f:1047, t:.24, d:.18, g:.45} ],

    // Collection/payment — warm 2-note bell: A4 + E5 together, then C6 ding
    collect: [ {f:440, t:0,   d:.18, g:.35}, {f:659, t:0,   d:.18, g:.25}, {f:1047, t:.18, d:.22, g:.45} ],

    // Generic small success ding (light)
    success: [ {f:880, t:0,   d:.08, g:.30}, {f:1175, t:.06, d:.14, g:.32} ],

    // Error: low buzz
    error:   [ {f:220, t:0,   d:.20, g:.40}, {f:180, t:.18, d:.20, g:.30} ],

    // Warning: ominous two-tone descending
    warning: [ {f:520, t:0,   d:.14, g:.32}, {f:392, t:.12, d:.18, g:.32} ],

    // Info chime
    info:    [ {f:659, t:0,   d:.12, g:.28} ],

    // Delete: short descending pair
    delete:  [ {f:392, t:0,   d:.08, g:.30}, {f:262, t:.07, d:.14, g:.30} ],

    // Notification: 3 chimes
    notify:  [ {f:880, t:0,   d:.10, g:.32}, {f:880, t:.18, d:.10, g:.32}, {f:1175, t:.36, d:.18, g:.40} ]
  };
  const notes = presets[type] || presets.success;
  const now = ctx.currentTime;
  notes.forEach(n => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Type=triangle for save (warm), sine for others (gentle)
    osc.type = (type === 'save' || type === 'collect' || type === 'notify') ? 'triangle' : 'sine';
    osc.frequency.value = n.f;
    const peak = n.g || 0.32;
    gain.gain.setValueAtTime(0, now + n.t);
    gain.gain.linearRampToValueAtTime(peak, now + n.t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + .05);
  });
}

function celebrate() {
  if (!DB.data.settings || DB.data.settings.soundEnabled === false) return;
  // Small confetti burst
  const colors = ['#10b981', '#059669', '#ea580c', '#dc2626', '#8b5cf6', '#06b6d4', '#db2777', '#f59e0b'];
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    p.style.left = (40 + Math.random() * 20) + '%';
    p.style.top = '20%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.transform = `translateX(${(Math.random()-.5)*200}px) rotate(${Math.random()*360}deg)`;
    p.style.animationDelay = (Math.random() * 0.2) + 's';
    p.style.animationDuration = (1.2 + Math.random() * 1.2) + 's';
    p.style.width = (5 + Math.random() * 6) + 'px';
    p.style.height = (8 + Math.random() * 10) + 'px';
    container.appendChild(p);
  }
  setTimeout(() => container.remove(), 2400);
}

/* ════════════════════════════════════════════════════════════
   RIPPLE EFFECT — material-style click feedback (global delegate)
════════════════════════════════════════════════════════════ */
document.addEventListener('pointerdown', function (e) {
  const target = e.target.closest('.btn, button, .nav-item, .pg-card, .bn-item, .stat-card');
  if (!target || target.disabled) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.4;
  const circle = document.createElement('span');
  circle.className = 'ripple-circle';
  circle.style.width = circle.style.height = size + 'px';
  circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
  circle.style.top = (e.clientY - rect.top - size / 2) + 'px';
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
  target.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
}, true);

/* ════════════════════════════════════════════════════════════
   COUNT-UP ANIMATION — numbers tick up on render
════════════════════════════════════════════════════════════ */
function countUpEl(el) {
  const raw = (el.textContent || '').trim();
  const m = raw.match(/[\d,]+(\.\d+)?/);
  if (!m) return;
  const target = parseFloat(m[0].replace(/,/g, ''));
  if (!isFinite(target) || target === 0) return;
  const prefix = raw.slice(0, m.index), suffix = raw.slice(m.index + m[0].length);
  const dur = 650, start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = target * eased;
    const isInt = !m[0].includes('.');
    el.textContent = prefix + (isInt ? Math.round(val).toLocaleString('en-US') : val.toLocaleString('en-US', { maximumFractionDigits: 2 })) + suffix;
    if (p < 1) requestAnimationFrame(tick); else el.textContent = raw;
  }
  requestAnimationFrame(tick);
}
function animateCountUps(root) {
  const scope = root || document;
  scope.querySelectorAll('.pg-value, .stat-card .value, .stat-value').forEach(el => {
    el.classList.add('count-up-active');
    countUpEl(el);
  });
}

/* ════════════════════════════════════════════════════════════
   CTRL+K — focus global search + quick-nav grid when empty
════════════════════════════════════════════════════════════ */
function showQuickNav() {
  const sr = document.getElementById('search-results');
  if (!sr || typeof NAV_ITEMS === 'undefined') return;
  const items = NAV_ITEMS.filter(it => typeof can !== 'function' || can(it.key));
  sr.innerHTML = `<div class="qnav-label">انتقال سريع</div><div class="qnav-grid">${
    items.map(it => `<div class="qnav-tile" style="--qc:${it.color}" onclick="navigate('${it.key}');document.getElementById('search-results').classList.remove('show');document.getElementById('global-search').blur();">
      <i>${it.icon}</i><span>${it.label}</span>
    </div>`).join('')
  }</div>`;
  sr.classList.add('show');
}
document.addEventListener('keydown', function (e) {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'k') {
    e.preventDefault();
    const gs = document.getElementById('global-search');
    if (!gs) return;
    if (window.innerWidth < 992 && typeof toggleSidebar === 'function') toggleSidebar(false);
    gs.focus();
    if (!gs.value.trim()) showQuickNav();
  }
  if (e.key === '?' && !['INPUT','TEXTAREA','SELECT'].includes((document.activeElement||{}).tagName)) {
    e.preventDefault();
    toggleShortcuts();
  }
  if (e.key === 'Escape') {
    const so = document.getElementById('shortcuts-overlay');
    if (so) so.classList.remove('show');
  }
});

/* ════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS HELP — press ?
════════════════════════════════════════════════════════════ */
function ensureShortcutsModal() {
  if (document.getElementById('shortcuts-overlay')) return;
  const SHORTCUTS = [
    ['البحث السريع / الانتقال لأي صفحة', 'Ctrl', 'K'],
    ['عرض هذه القائمة', '?'],
    ['إغلاق أي نافذة مفتوحة', 'Esc'],
    ['الرجوع للصفحة السابقة', 'Alt', '←'],
  ];
  const ov = document.createElement('div');
  ov.id = 'shortcuts-overlay';
  ov.onclick = (e) => { if (e.target === ov) toggleShortcuts(false); };
  ov.innerHTML = `<div id="shortcuts-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="margin:0;color:#fff;font-weight:900;font-size:16px">⌨️ اختصارات لوحة المفاتيح</h3>
      <button class="icon-btn" onclick="toggleShortcuts(false)" style="width:30px;height:30px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    ${SHORTCUTS.map(s => `<div class="sk-row"><span class="sk-label">${s[0]}</span><span class="sk-keys">${s.slice(1).map(k => `<kbd>${k}</kbd>`).join('<span style="color:#5d7195">+</span>')}</span></div>`).join('')}
  </div>`;
  document.body.appendChild(ov);
}
function toggleShortcuts(force) {
  ensureShortcutsModal();
  const ov = document.getElementById('shortcuts-overlay');
  const show = force !== undefined ? force : !ov.classList.contains('show');
  ov.classList.toggle('show', show);
}

function toast(msg, type='success', duration) {
  const box = document.getElementById('toast-container');
  if (!box) return;
  // Keep max 3 toasts visible — remove oldest
  while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const ic = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' }[type] || 'ℹ';
  el.innerHTML = `<span class="icon">${ic}</span><span class="msg">${escapeHtml(msg)}</span><span class="close-x" style="margin-inline-start:auto;font-size:18px;font-weight:900;cursor:pointer;color:var(--text-muted);padding:0 6px">×</span>`;
  const dismiss = () => {
    if (el.classList.contains('toast-leaving')) return;
    el.classList.add('toast-leaving');
    setTimeout(() => el.remove(), 320);
  };
  el.querySelector('.close-x').onclick = dismiss;
  box.appendChild(el);
  try { playTone(type); } catch(_) {}
  const auto = duration || (type === 'error' || type === 'warning' ? 5000 : 3000);
  setTimeout(dismiss, auto);
}

/* ============================================================
   🔔 ENTERPRISE NOTIFICATION CENTER — premium centered modal
   Usage: notify({ type:'success', title:'تم إضافة العميل',
                   message:'تم إضافة العميل "X" بنجاح' })
============================================================ */
let _notifyTimer = null, _notifyRAF = null;
function notify(opts) {
  opts = opts || {};
  const type = opts.type || 'success';
  const title = opts.title || 'تم بنجاح';
  const message = opts.message || '';
  const autoClose = opts.autoClose !== false;          // default true
  const duration = opts.duration || 3000;
  const showMeta = opts.showMeta !== false;            // show date/time/user

  const themes = {
    success: { color:'#10b981', dark:'#059669', glow:'rgba(16,185,129,', icon:'M20 6L9 17l-5-5' },
    error:   { color:'#ef4444', dark:'#dc2626', glow:'rgba(239,68,68,',  icon:'M18 6L6 18M6 6l12 12' },
    warning: { color:'#f59e0b', dark:'#d97706', glow:'rgba(245,158,11,', icon:'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
    info:    { color:'#3b82f6', dark:'#2563eb', glow:'rgba(59,130,246,', icon:'M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' }
  };
  const t = themes[type] || themes.success;

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
  const userName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) ? currentUser.name : 'النظام';

  // Remove any existing
  const existing = document.getElementById('notify-overlay');
  if (existing) existing.remove();
  if (_notifyTimer) clearTimeout(_notifyTimer);
  if (_notifyRAF) cancelAnimationFrame(_notifyRAF);

  const overlay = document.createElement('div');
  overlay.id = 'notify-overlay';
  overlay.className = 'notify-overlay';
  const kicker = { success:'تمت العملية', error:'محصلش', warning:'تنبيه', info:'معلومة' }[type] || 'تمت العملية';
  const okText = opts.okText || (type === 'error' ? 'تمام، فهمت' : 'تمام');
  overlay.innerHTML = `
    <div class="nk nk-${type}" role="alertdialog" aria-live="assertive" aria-labelledby="nk-t">
      <div class="nk-band">
        <span class="nk-orb nk-orb1"></span><span class="nk-orb nk-orb2"></span>
        <button class="notify-close nk-x" aria-label="إغلاق">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <span class="nk-kick">${kicker}</span>
        <div class="nk-seal">
          <svg class="nk-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg>
          <span class="nk-disc">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${t.icon}" class="nk-path"/></svg>
          </span>
        </div>
        ${autoClose ? `<div class="nk-time"><i id="notify-progress-bar"></i></div>` : ''}
      </div>
      <div class="nk-body">
        <div class="nk-title" id="nk-t">${escapeHtml(title)}</div>
        ${message ? `<div class="nk-msg">${message}</div>` : ''}
        ${showMeta ? `
        <div class="nk-perf" aria-hidden="true"></div>
        <div class="nk-meta">
          <div><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>التاريخ</span><b>${dateStr}</b></div>
          <div><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>الوقت</span><b>${timeStr}</b></div>
          <div><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>بواسطة</span><b>${escapeHtml(userName)}</b></div>
        </div>` : ''}
        <button class="notify-ok-btn nk-ok">${escapeHtml(okText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  try { playTone(type); } catch(_) {}

  // trigger open animation
  requestAnimationFrame(() => overlay.classList.add('show'));

  function close() {
    overlay.classList.remove('show');
    overlay.classList.add('closing');
    if (_notifyTimer) clearTimeout(_notifyTimer);
    if (_notifyRAF) cancelAnimationFrame(_notifyRAF);
    setTimeout(() => { try { overlay.remove(); } catch(_){} }, 250);
    // Also sweep any other stale overlays
    setTimeout(() => {
      document.querySelectorAll('.notify-overlay').forEach(o => {
        if (!o.classList.contains('show')) try { o.remove(); } catch(_){}
      });
    }, 300);
  }
  overlay.querySelector('.notify-close').onclick = close;
  overlay.querySelector('.notify-ok-btn').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  if (autoClose) {
    const bar = overlay.querySelector('#notify-progress-bar');
    const start = Date.now();
    function tick() {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration * 100));
      if (bar) bar.style.width = pct + '%';
      if (elapsed < duration) _notifyRAF = requestAnimationFrame(tick);
    }
    tick();
    _notifyTimer = setTimeout(close, duration);
  }
}


function openModal(title, bodyHTML, footerHTML='', size='') {
  // Remove any stale notification overlay before opening modal
  document.querySelectorAll('.notify-overlay:not(.show)').forEach(o => { try{o.remove();}catch(_){} });
  const m = document.getElementById('modal');
  m.className = 'modal' + (size ? ' '+size : '');
  m.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="icon-btn" onclick="closeModal()" aria-label="إغلاق">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">${bodyHTML}</div>
    ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
  `;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  // Safety: remove any stray notification overlay that might block clicks
  document.querySelectorAll('.notify-overlay').forEach(o => {
    if (!o.classList.contains('show')) o.remove();
  });
}

function confirmDialog(msg, onYes) {
  openModal('تأكيد',
    `<p style="font-size:14px;line-height:1.7">${escapeHtml(msg)}</p>`,
    `<button class="btn btn-danger" id="confirm-yes">نعم، متابعة</button>
     <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>`
  );
  document.getElementById('confirm-yes').onclick = () => { closeModal(); onYes(); };
}

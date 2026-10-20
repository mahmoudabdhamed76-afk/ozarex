/* js/core/startup.js — startup: brand (name / logo), branch print line, startApp (after-login checks), auto-save timers
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* =========================================================
   STARTUP
========================================================= */
/* ═══ the buyer's own brand: company name + logo from الإعدادات → الشركة, everywhere (login too) ═══ */
/* 4.32 · printed papers from a branch say which branch (nothing for the main branch) */
function branchPrintLine() { try { if (!window.Branch || Branch.get() === 'main') return ''; const b = Branch.info(); return b.name + (b.code ? ' (' + b.code + ')' : ''); } catch (_) { return ''; } }
const BRAND_DEFAULT = 'Ozarex';
function applyBrand(src) {
  try {
    let b = src;
    if (!b) {
      const st = (typeof DB !== 'undefined' && DB && DB.data && DB.data.settings) || null;
      if (st) b = { name: st.companyName || '', logo: st.companyLogo || '' };
    }
    if (!b) { try { b = JSON.parse(localStorage.getItem('erp_brand') || 'null'); } catch (e) {} }
    if (!b) return;
    let name = String(b.name || '').trim() || BRAND_DEFAULT;
    if (name === 'نظام' + ' الحسابات') name = BRAND_DEFAULT;          /* 4.31 · the old default name → Ozarex */
    const logo = (typeof b.logo === 'string' && b.logo.startsWith('data:image/')) ? b.logo : '';
    const key = name + '|' + logo.length;
    if (applyBrand._k === key) return;
    applyBrand._k = key;
    document.querySelectorAll('.js-brand-name').forEach(el => { el.textContent = name; });
    document.querySelectorAll('.js-brand-logo').forEach(el => {
      const want = logo || 'icons/logo-square.png';
      if (el.getAttribute('src') !== want) { el.style.display = ''; el.setAttribute('src', want); }
    });
    document.querySelectorAll('.js-year').forEach(el => { el.textContent = String(new Date().getFullYear()); });
    document.title = name + ' — إدارة التوريدات';
    try { localStorage.setItem('erp_brand', JSON.stringify({ name: b.name || '', logo })); } catch (e) {}
  } catch (e) { console.warn('[brand]', e); }
}
document.addEventListener('DOMContentLoaded', () => {
  applyBrand();
  fetch(API_BASE + '/api/brand', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(b => { if (b) applyBrand(b); }).catch(() => {});
});

function startApp() {
  applyBrand();
  const _bnav = document.getElementById('bottom-nav');
  if (_bnav) _bnav.style.display = '';
  const un = document.getElementById('user-name'); if (un) un.innerText = currentUser.name;
  const ur = document.getElementById('user-role'); if (ur) ur.innerText = ROLE_LABELS[currentUser.role];
  const ua = document.getElementById('user-avatar'); if (ua) ua.innerText = (currentUser.name || 'U').charAt(0);
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Show topbar buttons (home + reciter inline) — old floating versions stay hidden
  const homeBtn = document.getElementById('topbar-home-btn'); if (homeBtn) homeBtn.style.display = 'grid';
  const reciterInline = document.getElementById('reciter-inline'); if (reciterInline) reciterInline.style.display = 'flex';

  // Start autosave timer (every 5 seconds)
  startAutoSave();
  
  // Start Quran reciter if enabled in settings
  if (DB.data.settings && DB.data.settings.reciterEnabled) {
    setTimeout(() => playReciter(), 1200);
  } else {
    updateReciterLabel(false);
  }

  updateNotifBadge();
  if (typeof updateNotesCount === 'function') updateNotesCount();
  if (typeof initAuditTrail === 'function') initAuditTrail();
  // ensure user starts on a page they have access to
  if (!can(currentPage)) currentPage = PERMISSIONS[currentUser.role][0];
  navigate(currentPage);

  // Show overdue alert popup if any
  setTimeout(() => {
    const overdueIss = getOverdueIssuances();
    if (overdueIss.length > 0) {
      playTone('notify');
      const c = overdueIss[0];
      toast(`💝 يا ريت تروح تحصل من "${c.customerName}" — ${overdueIss.length>1?'و'+(overdueIss.length-1)+' غيره ':''}متأخرين عليك بـ ${fmtCurrency(c.remaining)} 🤲`, 'warning');
    }
  }, 2000);

  // Daily backup reminder
  checkBackupReminder();
}

/* ============ AUTO-SAVE (every 5 seconds + snapshot every 5 minutes) ============ */
let _autoSaveInterval = null;
let _snapshotInterval = null;
let _lastSaveStamp = 0;
function startAutoSave() {
  if (_autoSaveInterval) clearInterval(_autoSaveInterval);
  if (_snapshotInterval) clearInterval(_snapshotInterval);

  // Quick save every 5 seconds
  _autoSaveInterval = setInterval(() => {
    try {
      if (DB._saveTimer || DB._saveInflight) return;
      DB.save();   // sends nothing when nothing changed (record-level sync)
      _lastSaveStamp = Date.now();
    } catch(e) { console.error('autosave failed', e); }
  }, 5000);

  // Take a backup snapshot every 5 minutes
  _snapshotInterval = setInterval(() => {
    try {
      const key = DB.snapshot();
      if (key) {
        showAutoSaveIndicator('✓ تم حفظ نسخة احتياطية تلقائية');
      }
    } catch(e) { console.error('snapshot failed', e); }
  }, 5 * 60 * 1000);

  // Take initial snapshot
  setTimeout(() => DB.snapshot(), 30000);
}

function showAutoSaveIndicator(message) {
  const el = document.getElementById('autosave-indicator');
  if (!el) return;
  const txt = document.getElementById('autosave-text');
  if (txt) txt.innerText = message || 'تم الحفظ تلقائياً ✓';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

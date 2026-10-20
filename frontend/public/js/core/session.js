/* js/core/session.js — session: current user, roles and page permissions (PERMISSIONS, userPages, can), user menu, logout, restoreSession
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* =========================================================
   SESSION / AUTH
========================================================= */
let currentUser = null;
const ROLE_LABELS = { admin: 'مدير النظام', accountant: 'محاسب', sales: 'موظف مبيعات' };
const PERMISSIONS = {
  admin: ['dashboard','customers','issuances','forecast','invoices','payments','aging','transfers','cheques','debts','suppliers','purchases','inventory','stock','expenses','reports','monthly','profit','aiassistant','approvals','requests','users','audit','security','settings'],
  accountant: ['dashboard','customers','issuances','forecast','invoices','payments','aging','transfers','cheques','debts','suppliers','purchases','expenses','reports','monthly','profit','aiassistant','approvals','requests'],
  sales: ['dashboard','customers','issuances','forecast','invoices','payments','aging','cheques','inventory','stock','aiassistant','approvals','requests']
};
/* 4.8 · each user has his own sections (set by the admin in «المستخدمين»);
   a user who was never customised gets his role's list above */
const ADMIN_ONLY_PAGES = ['users', 'audit', 'security', 'settings'];
function userPages(u) {
  if (!u) return [];
  if (u.role === 'admin') return PERMISSIONS.admin.slice();
  const base = Array.isArray(u.pages) ? u.pages : (PERMISSIONS[u.role] || []);
  const out = base.filter(p => !ADMIN_ONLY_PAGES.includes(p));
  ['approvals', 'requests', 'dashboard'].forEach(p => { if (!out.includes(p)) out.unshift(p); });
  return out;
}
function can(page) {
  if (!currentUser) return false;
  if (page === 'sales') page = 'issuances';      // «المبيعات» shows the issuance records — same right as «صرف الورق»
  const fresh = (DB.data.users || []).find(x => x.id === currentUser.id) || currentUser;   // picks up a change the admin just made
  return userPages(fresh).includes(page);
}

/* 4.7: the password is checked by the server (Auth.login) — never in the browser */
function login() { return false; }

/* Opens a small user menu modal */
function openUserMenu() {
  if (!currentUser) return;
  openModal('👤 ' + escapeHtml(currentUser.name), `
    <div style="text-align:center;padding:10px 0">
      <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#14b8a6,#0d9488);color:#fff;display:grid;place-items:center;font-size:36px;font-weight:800;margin:0 auto 14px">
        ${escapeHtml((currentUser.name||'U').charAt(0))}
      </div>
      <div style="font-size:18px;font-weight:800;margin-bottom:4px">${escapeHtml(currentUser.name)}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px">${escapeHtml(currentUser.username||'')}</div>
      <div style="display:inline-block;padding:5px 14px;background:rgba(20,184,166,.15);color:#2dd4bf;border-radius:999px;font-size:12px;font-weight:700;border:1px solid rgba(20,184,166,.3)">${ROLE_LABELS[currentUser.role]||currentUser.role}</div>
    </div>
    <div style="margin-top:18px;display:grid;gap:8px">
      <button class="btn btn-secondary" onclick="closeModal();navigate('settings')" style="justify-content:flex-start;width:100%">
        ⚙️ الإعدادات
      </button>
      ${can('users') ? `<button class="btn btn-secondary" onclick="closeModal();navigate('users')" style="justify-content:flex-start;width:100%">
        👥 إدارة المستخدمين
      </button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal();AXSec.pwModal()" style="justify-content:flex-start;width:100%">
        🔑 تغيير كلمة السر
      </button>
      <button class="btn btn-secondary" onclick="closeModal();toggleTheme()" style="justify-content:flex-start;width:100%">
        🌓 تبديل الوضع
      </button>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>
    <button class="btn btn-danger" onclick="closeModal();logout()">🚪 تسجيل خروج</button>
  `);
}

async function logout() {
  if (!(await Auth.settleBeforeLogout())) return;          // Phase 2 · I11 — unsent changes: send, or ask
  pauseReciter();
  if (_autoSaveInterval) clearInterval(_autoSaveInterval);
  if (_snapshotInterval) clearInterval(_snapshotInterval);
  currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
  // Show the login sheet at the top of the page WITHOUT hiding the app behind it.
  // The login card is now a transparent floating sheet — must not block content below.
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('login-form').reset();
  const fab = document.getElementById('home-fab'); if (fab) fab.style.display = 'none';
  const bnav = document.getElementById('bottom-nav'); if (bnav) bnav.style.display = 'none';
  const aifab = document.getElementById('ai-fab'); if (aifab) aifab.style.display = 'none';
  const bar = document.getElementById('reciter-bar'); if (bar) bar.style.display = 'none';
  const homeBtn = document.getElementById('topbar-home-btn'); if (homeBtn) homeBtn.style.display = 'none';
  const reciterInline = document.getElementById('reciter-inline'); if (reciterInline) reciterInline.style.display = 'none';
  // end the session on the server too, then start clean (no data left in memory)
  try { if (DB._saveTimer || DB._saveInflight) await new Promise(r => setTimeout(r, 900)); } catch (_) {}
  await Auth.logout();
  location.reload();
}
function restoreSession() {
  const uid = sessionStorage.getItem(SESSION_KEY);
  if (!uid) return false;
  const u = DB.data.users.find(x => x.id === uid);
  if (!u) return false;
  currentUser = u;
  return true;
}

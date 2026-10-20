/* js/core/app.js — small app-shell pieces: topbar refresh, home button, password eye on login, seedData (first empty database)
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* ── topbar manual refresh (runs silently in background) ── */
/* Home FAB — show on every page except dashboard */
function updateHomeFab() {
  const fab = document.getElementById('home-fab');
  if (fab) {
    fab.style.display = '';   // clear any inline display:none (e.g. from logout)
    const show = typeof currentPage !== 'undefined' && currentPage !== 'dashboard';
    fab.classList.toggle('visible', show);
  }
  // bottom nav active state
  document.querySelectorAll('#bottom-nav .bn-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === currentPage);
  });
  // AI FAB — on dashboard only
  const aiFab = document.getElementById('ai-fab');
  if (aiFab) {
    aiFab.style.display = '';
    aiFab.classList.toggle('visible', currentPage === 'dashboard');
  }
}

function lgxTogglePass() {
  const p = document.getElementById('login-password');
  if (p) p.type = p.type === 'password' ? 'text' : 'password';
}

function topbarRefresh() {
  const btn = document.getElementById('topbar-refresh-btn');
  if (btn) { btn.classList.add('spinning'); setTimeout(() => btn.classList.remove('spinning'), 900); }
  SyncEngine.pullLatest('manual-refresh').then(() => {
    if (typeof toast === 'function') toast('تم التحديث ✓');
  });
}


async function bootstrapFromServer() {
  // Try live server first (6s timeout)
  try {
    const res = await fetch(API_BASE + '/api/data', {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store', credentials: 'same-origin',
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error('ليس JSON');
    DB._bootstrapData = await res.json();
    DB._bootstrapped = true;
    DB._serverVersion = DB._bootstrapData.__version || 0;
    DB._bootOnline = true;
    return; // online
  } catch (e) {
    console.warn('[Bootstrap] server unreachable, trying offline snapshot:', e.message);
  }
  // Offline fallback: the copy saved on this device (IndexedDB since Phase 3)
  const snap = await OfflineManager.getCachedData();
  if (snap) {
    console.info('[Bootstrap] loaded offline snapshot');
    DB._bootstrapData = snap;
    DB._bootstrapped  = true;
    const banner = document.getElementById('offline-banner');
    if (banner) {
      const m = banner.querySelector('.ob-msg');
      if (m) m.textContent = 'أوف لاين — العمل على البيانات المحفوظة محلياً';
      banner.classList.add('show');
    }
    return; // offline
  }
  throw new Error('تعذّر الوصول للسيرفر (' + API_BASE + ').\nافتح البرنامج وأنت أونلاين أول مرة عشان البيانات تتخزن للعمل أوف لاين.');
}


/* Seed initial data - empty database with only admin user */
function seedData() {
  DB.data = {
    users: [
      { id: 'u1', username: 'admin', password: 'admin', name: 'المدير', role: 'admin' }
    ],
    customers: [],
    products: [],
    invoices: [],
    payments: [],
    expenses: [],
    stockMoves: [],
    issuances: [],
    bankTransfers: [],
    suppliers: [],
    supplierPayments: [],
    notes: [],
    auditLog: [],
    employees: [],
    salaryRuns: [],
    settings: {
      companyName: 'Ozarex',
      companyAddress: '',
      companyPhone: '',
      taxNumber: '',
      taxRate: 0,
      currency: 'جنيه',
      defaultMinStock: 10,
      soundEnabled: true
    },
    counters: { invoice: 1000, issuance: 1000, purchase: 1000 }
  };
  DB.save();
}

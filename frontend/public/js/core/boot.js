/* js/core/boot.js — the app's main start (DOMContentLoaded): theme, who is signed in, offline copy, live sync, first page
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  // Global safety net: a stray (hidden) notification overlay must never block clicks.
  // On every pointer-down, sweep away any .notify-overlay that isn't actively shown.
  document.addEventListener('pointerdown', () => {
    document.querySelectorAll('.notify-overlay:not(.show)').forEach(o => o.remove());
  }, true);
  /* 4.7 · who is this browser? (server session cookie) */
  const dismissBoot = () => { document.documentElement.classList.remove('ax-resume'); try { if (window.AXSplash) AXSplash.done(); } catch (_) {} };
  const prepareData = () => {
    if (!DB.load()) seedData();
    OfflineManager.setBase(DB.data);      // what the server has → every save sends only the difference
    // Ensure latest schema bits exist
    if (!DB.data.settings) DB.data.settings = { companyName:'Ozarex', taxRate:0, currency:'جنيه', soundEnabled: true };
    if (DB.data.settings.soundEnabled === undefined) DB.data.settings.soundEnabled = true;
    if (!DB.data.counters) DB.data.counters = { invoice: 1000, issuance: 1000, purchase: 1000 };
    if (!DB.data.counters.issuance) DB.data.counters.issuance = 1000;
    if (!DB.data.counters.purchase) DB.data.counters.purchase = 1000;
    if (!DB.data.stockMoves) DB.data.stockMoves = [];
    if (!DB.data.issuances) DB.data.issuances = [];
    if (!DB.data.suppliers) DB.data.suppliers = [];
    if (!DB.data.supplierPayments) DB.data.supplierPayments = [];
  };
  const showOfflineBanner = () => {
    const banner = document.getElementById('offline-banner');
    if (banner) { const m = banner.querySelector('.ob-msg'); if (m) m.textContent = 'أوف لاين — شغال على البيانات المحفوظة على الجهاز'; banner.classList.add('show'); }
  };
  const launch = (u) => {
    currentUser = (DB.data.users || []).find(x => x.id === u.id) || u;
    startApp(); SyncEngine.init(); OfflineManager.init();
    DB.save();
  };
  const loadOffline = async (owner) => {
    const snap = await OfflineManager.getCachedData(owner);
    if (!snap) return false;
    DB._bootstrapData = snap; DB._bootstrapped = true;
    prepareData(); showOfflineBanner();
    return true;
  };

  let me = await Auth.me();
  if (me && me !== 'offline') {
    try { await Branch.init(me.id); await bootstrapFromServer(); prepareData(); launch(me); }
    catch (e) { console.error(e); if (await loadOffline(me.id)) launch(me); else alert('فشل تحميل البيانات من السيرفر: ' + e.message); }
  } else if (me === 'offline') {
    /* Phase 2 · I11: no automatic entry when the server can't be reached — the login form checks the
       password against this device's offline record (see the submit handler below) */
    setTimeout(() => toast('مفيش اتصال بالسيرفر — اكتب كلمة السر عشان تشتغل أوف لاين', 'warning', 6000), 300);
  }
  dismissBoot();

  // Resume audio context on first user interaction (required by browsers)
  const audioResume = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    document.removeEventListener('click', audioResume);
    document.removeEventListener('keydown', audioResume);
  };
  document.addEventListener('click', audioResume);
  document.addEventListener('keydown', audioResume);

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    const btn = document.querySelector('#login-form button[type=submit], #login-form .lgn-btn');
    if (btn) btn.disabled = true;
    try {
      const j = await Auth.login(u, p);
      if (j.token) DeviceToken.set(j.token);
      await OfflineAuth.save(u, p, j.user);
      await Branch.init(j.user && j.user.id);
      await bootstrapFromServer();
      prepareData();
      launch(j.user);
      toast('مرحباً بك ' + currentUser.name);
      if (window.AXForcePw) AXForcePw.check(j);
      try { if (j.weak) sessionStorage.setItem('emx_weak', '1'); else sessionStorage.removeItem('emx_weak'); } catch (_) {}
      if (j.weak) setTimeout(() => toast('كلمة السر بتاعتك سهلة التخمين — غيّرها' + (currentUser.role === 'admin' ? ' من «الأمان والنسخ»' : ' من القايمة اللي على اسمك'), 'warning', 8000), 1800);
    } catch (err) {
      if (err.status === 401 || err.status === 429) toast(err.message || 'بيانات الدخول غير صحيحة', 'error');
      else {
        // server unreachable → offline login with the verifier saved on this device
        const ou = await OfflineAuth.check(u, p);
        if (ou) await Branch.init(ou.id, true);
        if (ou && await loadOffline(ou.id)) { launch(ou); toast('دخلت أوف لاين — التعديلات هتترفع أول ما النت يرجع', 'warning', 6000); }
        else toast('مفيش اتصال بالسيرفر' + (ou ? '' : ' — ولازم تكون دخلت مرة من الجهاز ده وإنت أونلاين'), 'error', 6000);
      }
    } finally { if (btn) btn.disabled = false; }
  });

  // Global Search with results dropdown
  const gs = document.getElementById('global-search');
  const sr = document.getElementById('search-results');
  gs.addEventListener('input', e => runGlobalSearch(e.target.value.trim()));
  gs.addEventListener('focus', e => { if (e.target.value.trim()) runGlobalSearch(e.target.value.trim()); });
  // Close on outside click
  document.addEventListener('click', e => {
    const box = document.getElementById('global-search-box');
    if (box && !box.contains(e.target)) sr.classList.remove('show');
  });
  // Close on Escape
  gs.addEventListener('keydown', e => {
    if (e.key === 'Escape') { sr.classList.remove('show'); gs.value=''; gs.blur(); }
  });
});

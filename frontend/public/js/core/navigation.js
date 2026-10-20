/* js/core/navigation.js — navigation: NAV_ITEMS / sections, sidebar, navigate() with permissions, back history, scroll memory, progress bar, mobile menu
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* =========================================================
   ROUTING / NAVIGATION
========================================================= */
let currentPage = 'dashboard';
const NAV_ITEMS = [
  { key: 'dashboard', label: 'لوحة التحكم', color: '#10b981', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>', section: 'main' },
  { key: 'issuances', label: 'صرف الورق', color: '#3b82f6', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13l2 2 4-4"/></svg>', section: 'main' },
  { key: 'forecast', label: 'مواعيد السحب المتوقعة', color: '#0EA5E9', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M12 14v3l2 1"/></svg>', section: 'main' },
  { key: 'customers', label: 'العملاء والمراكز', color: '#8b5cf6', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', section: 'main' },
  { key: 'invoices', label: 'الفواتير', color: '#06b6d4', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', section: 'main' },
  { key: 'payments', label: 'التحصيل والمديونيات', color: '#f59e0b', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>', section: 'main' },
  { key: 'sales', label: 'المبيعات', color: '#2563EB', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="9"/></svg>', section: 'main' },
  { key: 'aging', label: 'أعمار الديون', color: '#F43F5E', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>', section: 'main' },
  { key: 'transfers', label: 'التحويلات البنكية', color: '#ec4899', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 10h18"/><path d="M3 14h18"/><path d="M5 21V3"/><path d="M19 21V3"/><circle cx="12" cy="12" r="3"/></svg>', section: 'main' },
  { key: 'cheques', label: 'الشيكات', color: '#0891B2', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h6M6 14h4M15 14h3"/></svg>', section: 'main' },
  { key: 'debts', label: 'سداد المديونية', color: '#F59E0B', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>', section: 'main' },
  { key: 'suppliers', label: 'الموردين', color: '#f97316', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M3 16v5h5"/><path d="M16 21h5v-5"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4"/><path d="M12 19v4"/></svg>', section: 'main' },
  { key: 'purchases', label: 'فواتير المشتريات', color: '#EA580C', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>', section: 'main' },
  { key: 'inventory', label: 'المخازن', color: '#84cc16', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', section: 'ops' },
  { key: 'stock', label: 'مخزوني وجرد', color: '#00A9A0', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 16v-3M12 16V8M16 16v-6"/></svg>', section: 'ops' },
  { key: 'expenses', label: 'المصروفات', color: '#ef4444', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>', section: 'ops' },
  { key: 'reports', label: 'التقارير', color: '#a855f7', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', section: 'ops' },
  { key: 'monthly', label: 'تقرير الشهر والتقفيل', color: '#0D9488', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>', section: 'ops' },
  { key: 'profit', label: 'أرباحي', color: '#22C55E', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>', section: 'ops' },
  { key: 'aiassistant', label: 'المساعد الذكي', color: '#34d399', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>', section: 'ops' },
  { key: 'approvals', label: 'طلبات الموافقة', color: '#6366F1', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>', section: 'ops' },
  { key: 'requests', label: 'الطلبات والمقترحات', color: '#D79613', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>', section: 'ops' },
  { key: 'users', label: 'المستخدمين', color: '#14b8a6', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', section: 'admin' },
  { key: 'audit', label: 'سجل التعديلات', color: '#dc2626', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>', section: 'admin' },
  { key: 'security', label: 'الأمان والنسخ', color: '#0EA5E9', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><rect x="9" y="10" width="6" height="5" rx="1"/><path d="M10.5 10V8.5a1.5 1.5 0 0 1 3 0V10"/></svg>', section: 'admin' },
  { key: 'settings', label: 'الإعدادات', color: '#64748b', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', section: 'admin' }
];
const SECTIONS = { main: 'الإدارة اليومية', ops: 'العمليات والتقارير', admin: 'إعدادات النظام' };

function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  let html = '';
  let lastSection = '';
  NAV_ITEMS.forEach(it => {
    if (!can(it.key)) return;
    // Section title
    if (it.section !== lastSection) {
      html += `<div class="nav-section-title">${SECTIONS[it.section]}</div>`;
      lastSection = it.section;
    }
    let badge = '';
    if (it.key === 'inventory') {
      const low = DB.data.products.filter(p => p.quantity <= p.minQuantity).length;
      if (low > 0) badge = `<span class="badge">${low > 9 ? '9+' : low}</span>`;
    }
    if (it.key === 'payments') {
      const overdue = DB.data.customers.filter(c => c.balance > 0).length;
      if (overdue > 0) badge = `<span class="badge">${overdue > 9 ? '9+' : overdue}</span>`;
    }
    if (it.key === 'suppliers') {
      // Count suppliers we still owe money to
      const owedCount = (DB.data.suppliers || []).filter(s => {
        const m = supplierMetrics(s.id);
        return m.balance > 0;
      }).length;
      if (owedCount > 0) badge = `<span class="badge">${owedCount > 9 ? '9+' : owedCount}</span>`;
    }
    if (it.key === 'requests' && typeof AXReq !== 'undefined') {
      const n = AXReq.badgeCount();
      if (n > 0) badge = `<span class="badge rq-badge">${n > 9 ? '9+' : n}</span>`;
    }
    if (it.key === 'audit' && currentUser.role === 'admin') {
      // Count audit entries NOT yet seen by the admin
      const lastSeen = parseInt(localStorage.getItem('erp_audit_seen_ts') || '0');
      const unread = (DB.data.auditLog || []).filter(e => e.timestamp > lastSeen).length;
      if (unread > 0) badge = `<span class="badge badge-audit">${unread > 99 ? '99+' : unread}</span>`;
    }
    const isActive = currentPage === it.key;
    html += `<div class="nav-item ${isActive?'active':''}" style="--nav-color:${it.color}" onclick="navigate('${it.key}')">
      <span class="icon nav-icon-colored" style="background:${hexToRgba(it.color,0.15)};color:${it.color};border:1px solid ${hexToRgba(it.color,0.3)}">${it.icon}</span>
      <span>${it.label}</span>
      ${badge}
    </div>`;
  });
  nav.innerHTML = html;
}

// helper: convert hex color to rgba
function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

let _navHistory = [];
/* ── Route progress bar (Linear style) ── */
let _rpTimer = null;
function routeProgressStart() {
  const wrap = document.getElementById('route-progress');
  if (!wrap) return;
  const bar = wrap.querySelector('.rp-bar');
  clearTimeout(_rpTimer);
  wrap.classList.add('active');
  bar.style.width = '30%';
  requestAnimationFrame(() => { bar.style.width = '70%'; });
}
function routeProgressDone() {
  const wrap = document.getElementById('route-progress');
  if (!wrap) return;
  const bar = wrap.querySelector('.rp-bar');
  bar.style.width = '100%';
  _rpTimer = setTimeout(() => {
    wrap.classList.remove('active');
    bar.style.width = '0%';
  }, 220);
}

/* ── Per-page scroll memory ── */
const _scrollMemory = {};

function navigate(page, isBack) {
  if (!can(page)) { toast('ليس لديك صلاحية للوصول لهذه الصفحة', 'error'); return; }
  if (!isBack && typeof currentPage !== 'undefined' && currentPage && currentPage !== page) {
    _navHistory.push(currentPage);
    if (_navHistory.length > 40) _navHistory.shift();
  }

  // Save scroll position of the page we're leaving
  const prevPage = typeof currentPage !== 'undefined' ? currentPage : null;
  if (prevPage && prevPage !== page) {
    _scrollMemory[prevPage] = window.scrollY || document.documentElement.scrollTop || 0;
  }

  const samePage = prevPage === page;
  currentPage = page;
  renderSidebar();
  toggleSidebar(false);
  const titles = { sales:'المبيعات', dashboard:'لوحة التحكم', customers:'العملاء والمراكز', issuances:'صرف الورق للمراكز', forecast:'مواعيد السحب المتوقعة', purchases:'فواتير المشتريات', monthly:'تقرير الشهر والتقفيل', invoices:'الفواتير', payments:'التحصيل والمديونيات', transfers:'التحويلات البنكية', debts:'سداد المديونية', suppliers:'الموردين', inventory:'إدارة المخازن', stock:'مخزوني وجرد', expenses:'المصروفات', reports:'التقارير', aiassistant:'المساعد الذكي', approvals:'طلبات الموافقة', requests:'الطلبات والمقترحات', aging:'أعمار الديون', cheques:'الشيكات', profit:'أرباحي', users:'إدارة المستخدمين', security:'الأمان والنسخ الاحتياطي', audit:'سجل التعديلات الذكي', settings:'الإعدادات' };
  document.getElementById('topbar-title').innerText = titles[page] || '';

  const pc = document.getElementById('page-content');
  routeProgressStart();

  // Exit phase (skip when re-rendering same page)
  if (pc && !samePage) {
    pc.classList.remove('page-enter');
    pc.classList.add('page-exit');
  }

  const doRender = () => {
    const renderers = { sales: (typeof renderSales === 'function' ? renderSales : renderDashboard), dashboard: renderDashboard, customers: renderCustomers, issuances: renderIssuances, invoices: renderInvoices, payments: renderPayments, transfers: renderTransfersPage, debts: (typeof renderDebts === 'function' ? renderDebts : renderDashboard), suppliers: renderSuppliers, inventory: renderInventory, stock: (typeof renderStockHub === 'function' ? renderStockHub : renderDashboard), expenses: renderExpenses, reports: renderReports, aiassistant: renderAIAssistant, approvals: (typeof renderApprovals === 'function' ? renderApprovals : renderDashboard), requests: (typeof renderRequests === 'function' ? renderRequests : renderDashboard), forecast: (typeof renderForecast === 'function' ? renderForecast : renderDashboard), monthly: (typeof renderMonthly === 'function' ? renderMonthly : renderDashboard), purchases: (typeof renderPurchaseInvoices === 'function' ? renderPurchaseInvoices : renderDashboard), aging: (typeof renderAging === 'function' ? renderAging : renderDashboard), cheques: (typeof renderCheques === 'function' ? renderCheques : renderDashboard), profit: (typeof renderProfit === 'function' ? renderProfit : renderDashboard), users: renderUsers, security: (typeof renderSecurity === 'function' ? renderSecurity : renderDashboard), audit: renderAuditLog, settings: renderSettings };
    (renderers[page] || renderDashboard)();
    updateBackButton();
    updateHomeFab();
    try { animateCountUps(document.getElementById('page-content')); } catch (_) {}
    
    // Restore scroll: returning via back → restore memory, otherwise top
    const targetY = (isBack && _scrollMemory[page] !== undefined) ? _scrollMemory[page] : 0;
    window.scrollTo(0, targetY);

    // Enter phase
    if (pc) {
      pc.classList.remove('page-exit');
      void pc.offsetWidth;            // reflow → restart animation
      pc.classList.add('page-enter');
      setTimeout(() => pc.classList.remove('page-enter'), 550);
    }
    routeProgressDone();
  };

  // 1 frame for exit to paint, then render (total ≈ instant, feels native)
  if (pc && !samePage) requestAnimationFrame(() => requestAnimationFrame(doRender));
  else doRender();
}

function goBack() {
  if (_navHistory.length === 0) { navigate('dashboard', true); return; }
  const prev = _navHistory.pop();
  navigate(prev, true);
}

function updateBackButton() {
  const btn = document.getElementById('topbar-back-btn');
  if (btn) btn.style.display = _navHistory.length > 0 ? 'grid' : 'none';
}

// Stock counter: total quantity of ALL products combined, with a green +delta on increase
let _paperCountLast = null;
function updatePaperCounter() {
  const el = document.getElementById('paper-counter');
  const numEl = document.getElementById('paper-counter-num');
  if (!el || !numEl || !DB.data || !DB.data.products) return;
  // Count only paper/plastic/photo products — exclude ink, toner, cartridge
  const excludeWords = ['حبر','تنر','تونر','ink','toner','كارتريدج','cartridge','ريبون','ribbon'];
  const includeWords = ['ورق','بلاستك','بلاستيك','فوتو','photo','paper','a4','a3','a5','فيلم'];
  const paperProds = DB.data.products.filter(p => {
    const name = (p.name || '').toLowerCase();
    const unit = (p.unit || '').toLowerCase();
    // Exclude ink/toner explicitly
    if (excludeWords.some(w => name.includes(w))) return false;
    // Include if name or unit has paper/plastic/photo keyword
    if (includeWords.some(w => name.includes(w) || unit.includes(w))) return true;
    // Also include if unit is ورقة/وحدة/لفة (typical paper/plastic units)
    if (['ورقة','لفة','رزمة','رول'].some(w => unit.includes(w))) return true;
    return false;
  });
  const total = paperProds.reduce((s,p)=> s + (Number(p.quantity)||0), 0);

  numEl.textContent = fmt(Math.round(total));

  if (_paperCountLast !== null && total > _paperCountLast) {
    const delta = total - _paperCountLast;
    const d = document.getElementById('paper-counter-delta');
    if (d) {
      d.textContent = '+' + fmt(Math.round(delta));
      d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
    }
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  _paperCountLast = total;
}

function toggleSidebar(state) {
  const s = document.getElementById('sidebar');
  const b = document.getElementById('overlay-backdrop');
  const want = state === undefined ? !s.classList.contains('open') : state;
  s.classList.toggle('open', want);
  if (b) b.classList.toggle('show', want);
  document.body.classList.toggle('mobile-drawer-open', want);
}

document.addEventListener('click', function (e) {
  if (window.innerWidth > 768) return;
  const link = e.target.closest('.sidebar-nav a, .sidebar-nav button, .sidebar-nav [data-tab]');
  if (link) toggleSidebar(false);
});

window.addEventListener('resize', function () {
  if (window.innerWidth > 768) {
    document.body.classList.remove('mobile-drawer-open');
    const s = document.getElementById('sidebar');
    if (s) s.classList.remove('open');
  }
});

/* js/core/badges.js — top bar: Quran reciter button, overdue / due-soon issuances, notification badge, price changes, wallet badge
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* ============ QURAN RECITER ============ */
function playReciter() {
  const audio = document.getElementById('reciter-audio');
  if (!audio) return;
  audio.volume = DB.data.settings.reciterVolume != null ? DB.data.settings.reciterVolume : 0.45;
  audio.play().then(() => {
    updateReciterLabel(true);
    DB.data.settings.reciterEnabled = true;
    DB.save();
  }).catch(err => {
    console.warn('reciter play blocked:', err.message);
    updateReciterLabel(false);
  });
}

function pauseReciter() {
  const audio = document.getElementById('reciter-audio');
  if (!audio) return;
  audio.pause();
  updateReciterLabel(false);
  DB.data.settings.reciterEnabled = false;
  DB.save();
}

function toggleReciter() {
  const audio = document.getElementById('reciter-audio');
  if (!audio) return;
  if (audio.paused) playReciter(); else pauseReciter();
}

function updateReciterLabel(playing) {
  const bar = document.getElementById('reciter-bar');
  const label = document.getElementById('reciter-label');
  const inline = document.getElementById('reciter-inline');
  const inlineLabel = document.getElementById('reciter-label-inline');
  const text = playing ? '⏸ سورة يوسف' : '▶ سورة يوسف';
  if (bar) bar.classList.toggle('playing', !!playing);
  if (label) label.innerText = text;
  if (inline) inline.classList.toggle('playing', !!playing);
  if (inlineLabel) inlineLabel.innerText = text;
}

function getOverdueIssuances() {
  // Issuances with dueDate that has passed and still have unpaid amount
  const today = todayStr();
  return (DB.data.issuances || []).filter(i =>
    i.dueDate && i.dueDate < today && (i.total - (i.paid||0)) > 0
  ).map(i => ({
    ...i,
    daysOverdue: Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000),
    remaining: i.total - (i.paid||0)
  })).sort((a,b) => b.daysOverdue - a.daysOverdue);
}

function getDueSoonIssuances() {
  // Issuances with dueDate within next 7 days and still unpaid
  const today = todayStr();
  const inSevenDays = new Date();
  inSevenDays.setDate(inSevenDays.getDate() + 7);
  const cutoff = inSevenDays.toISOString().slice(0,10);
  return (DB.data.issuances || []).filter(i =>
    i.dueDate && i.dueDate >= today && i.dueDate <= cutoff && (i.total - (i.paid||0)) > 0
  ).map(i => ({
    ...i,
    daysUntil: Math.floor((new Date(i.dueDate) - new Date(today)) / 86400000),
    remaining: i.total - (i.paid||0)
  })).sort((a,b) => a.daysUntil - b.daysUntil);
}

function updateNotifBadge() {
  updatePaperCounter();
  const low = DB.data.products.filter(p => p.quantity <= p.minQuantity).length;
  const overdueIss = getOverdueIssuances().length;
  const dueSoon = getDueSoonIssuances().length;
  // Top customers we should chase (mediunia > threshold)
  const heavyDebtors = DB.data.customers.filter(c => (c.balance||0) > 1000).length;
  // Suppliers we owe money to
  const owedSuppliers = (DB.data.suppliers || []).filter(s => {
    const m = supplierMetrics(s.id);
    return m.balance > 0;
  }).length;
  // Recent price changes on supplier price lists (compared to last purchase)
  const priceChanges = getRecentPriceChanges().length;

  // Supplier purchase payments overdue or due soon (by dueDate)
  const supOverdue = getOverdueSupplierPurchases().length;
  const supDueSoon = getDueSoonSupplierPurchases().length;

  const total = low + overdueIss + dueSoon + heavyDebtors + owedSuppliers + priceChanges + supOverdue + supDueSoon;
  const dot = document.getElementById('notif-dot');
  if (dot) {
    dot.style.display = total > 0 ? 'flex' : 'none';
    dot.textContent = total > 0 ? (total > 9 ? '9+' : total) : '';
  }
  updateWalletBadge();
}

/* Detect price changes: compare each supplier's current price list against the
   most recent purchase of the same product name in the last 60 days */
function getRecentPriceChanges() {
  const changes = [];
  const purchases = (DB.data.expenses || [])
    .filter(e => e.kind === 'purchase' && e.items && e.items.length > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  (DB.data.suppliers || []).forEach(sup => {
    if (!sup.priceList || !sup.priceList.length) return;
    // Get this supplier's most recent purchase that has items
    const recent = purchases.find(p => p.supplierId === sup.id);
    if (!recent) return;
    recent.items.forEach(boughtItem => {
      const listed = sup.priceList.find(pl => pl.name === boughtItem.name);
      if (!listed) return;
      const oldPrice = boughtItem.price || 0;
      const newPrice = listed.price || 0;
      if (oldPrice === 0 || newPrice === 0) return;
      const diff = ((newPrice - oldPrice) / oldPrice) * 100;
      if (Math.abs(diff) >= 5) { // ≥5% change is noteworthy
        changes.push({
          supplierId: sup.id,
          supplierName: sup.name,
          itemName: boughtItem.name,
          oldPrice, newPrice, diff,
          lastDate: recent.date
        });
      }
    });
  });
  return changes;
}

/* Wallet badge: shows total liquid cash on hand.
   = collections (cash + transfer + check + card) − cash expenses
   We use the user-facing definition: "إجمالي (كاش + تحويلات + بنوك)" */
function updateWalletBadge() {
  const el = document.getElementById('topbar-wallet-amount');
  const btn = document.getElementById('topbar-wallet-btn');
  if (!el) return;

  // Inflows
  const paymentsTotal = (DB.data.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const bankInflows = (DB.data.bankTransfers || [])
    .filter(t => t.type === 'in' || t.type === 'deposit' || !t.type) // legacy entries default to inflow
    .reduce((s, t) => s + (t.amount || 0), 0);

  // Outflows
  const expensesTotal = (DB.data.expenses || [])
    .filter(e => e.kind !== 'purchase' || e.paymentMethod === 'cash' || e.paymentMethod === 'transfer')
    .reduce((s, e) => s + (e.amount || 0), 0);
  const supplierPaymentsTotal = (DB.data.supplierPayments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const bankOutflows = (DB.data.bankTransfers || [])
    .filter(t => t.type === 'out' || t.type === 'withdrawal')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const net = paymentsTotal + bankInflows - expensesTotal - supplierPaymentsTotal - bankOutflows + (window.AXBStats ? AXBStats.cashNet(DB.data) : 0);   // 4.34 · ± transfers between branches

  const cur = (DB.data.settings && DB.data.settings.currency) || 'جنيه';
  const curShort = cur === 'جنيه' ? 'ج.م' : cur === 'ريال' ? 'ر.س' : cur === 'درهم' ? 'د.إ' : cur.slice(0, 3);

  const display = Math.abs(net) >= 1000
    ? (net / 1000).toFixed(net >= 10000 ? 0 : 1) + 'K ' + curShort
    : fmt(net).split('.')[0] + ' ' + curShort;

  // Flash animation if value changed
  if (btn && el.textContent !== display && el.textContent !== '0') {
    btn.classList.remove('wallet-flash');
    void btn.offsetWidth; // restart animation
    btn.classList.add('wallet-flash');
  }
  el.textContent = display;

  // Red-ish color if net is negative (owed more than we have)
  if (btn) {
    if (net < 0) {
      el.style.color = 'var(--danger)';
    } else {
      el.style.color = '';
    }
  }
}

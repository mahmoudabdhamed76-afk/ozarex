/* js/core/notifications.js — openNotifications(): the alerts modal (low stock, top debtors, due soon, owed suppliers, price changes) — js/notify.js replaces it later
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* =========================================================
   NOTIFICATIONS PANEL
========================================================= */
function openNotifications() {
  const low = DB.data.products.filter(p => p.quantity <= p.minQuantity);
  const overdueCustomers = DB.data.customers.filter(c => c.balance > 0)
    .sort((a,b)=>b.balance-a.balance);
  const overdueIss = getOverdueIssuances();
  const dueSoon = getDueSoonIssuances();
  const owedSuppliers = (DB.data.suppliers || [])
    .map(s => ({ ...s, _metrics: supplierMetrics(s.id) }))
    .filter(s => s._metrics.balance > 0)
    .sort((a, b) => b._metrics.balance - a._metrics.balance);
  const priceChanges = getRecentPriceChanges().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const supOverduePur = getOverdueSupplierPurchases();
  const supDueSoonPur = getDueSoonSupplierPurchases();

  let html = '';
  const nothing = low.length === 0 && overdueCustomers.length === 0 && overdueIss.length === 0
    && dueSoon.length === 0 && owedSuppliers.length === 0 && priceChanges.length === 0
    && supOverduePur.length === 0 && supDueSoonPur.length === 0;

  if (nothing) {
    html = '<div class="empty-state"><div class="icon" style="font-size:48px">🎉</div><p>لا توجد تنبيهات حالياً<br><span style="color:var(--text-muted);font-size:12px">كل شيء تمام والحمد لله</span></p></div>';
  } else {
    // 1) OVERDUE ISSUANCES (highest priority - most urgent)
    if (overdueIss.length > 0) {
      html += `<div style="background:linear-gradient(135deg,#fee2e2,#fecaca);padding:12px;border-radius:10px;margin-bottom:14px;border-right:4px solid var(--danger)">
        <h4 style="color:var(--danger);margin:0 0 4px;font-size:15px">🚨 توريدات متأخرة في التحصيل (${overdueIss.length})</h4>
        <p style="color:#7f1d1d;font-size:12px;margin:0">المراكز دي فات موعد تحصيلها — لازم تتواصل معاها</p>
      </div>`;
      overdueIss.slice(0, 10).forEach(i => {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid var(--danger);padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="closeModal();navigate('issuances');setTimeout(()=>viewIssuance('${i.id}'),100)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div>
              <b style="font-size:14px">${escapeHtml(i.customerName)}</b>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📄 ${escapeHtml(i.productName)} • #${i.number}</div>
            </div>
            <div style="text-align:left">
              <div style="color:var(--danger);font-weight:800;font-size:14px">${fmtCurrency(i.remaining)}</div>
              <div style="font-size:11px;color:var(--danger);background:rgba(239,68,68,.1);padding:2px 8px;border-radius:999px;margin-top:2px;display:inline-block">⏰ متأخر ${i.daysOverdue} يوم</div>
            </div>
          </div>
        </div>`;
      });
    }

    // 2) TOP DEBTORS (biggest overdue customers)
    if (overdueCustomers.length > 0) {
      const top = overdueCustomers.slice(0, 5);
      const totalDebt = overdueCustomers.reduce((s, c) => s + c.balance, 0);
      html += `<div style="background:linear-gradient(135deg,#fce7f3,#fbcfe8);padding:12px;border-radius:10px;margin:14px 0;border-right:4px solid #db2777">
        <h4 style="color:#9d174d;margin:0 0 4px;font-size:15px">💸 أعلى المدينين (${overdueCustomers.length} مركز • ${fmtCurrency(totalDebt)})</h4>
        <p style="color:#831843;font-size:12px;margin:0">أكبر العملاء اللي عليك تحصّل منهم</p>
      </div>`;
      top.forEach(c => {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid #db2777;padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="closeModal();navigate('payments');setTimeout(()=>openPaymentForm('${c.id}'),100)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div>
              <b style="font-size:14px">${escapeHtml(c.name)}</b>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${c.phone ? '📞 ' + escapeHtml(c.phone) : ''}</div>
            </div>
            <div style="text-align:left">
              <div style="color:#db2777;font-weight:800;font-size:15px">${fmtCurrency(c.balance)}</div>
              <div style="font-size:11px;color:#9d174d;background:rgba(219,39,119,.10);padding:2px 8px;border-radius:999px;margin-top:2px;display:inline-block">اضغط للتحصيل</div>
            </div>
          </div>
        </div>`;
      });
      if (overdueCustomers.length > 5) {
        html += `<div style="text-align:center;padding:6px;color:var(--text-muted);font-size:11.5px">و ${overdueCustomers.length - 5} مركز آخر — <a href="javascript:void(0)" onclick="closeModal();navigate('payments')" style="color:var(--primary);font-weight:700">شوف الكل</a></div>`;
      }
    }

    // 3) DUE SOON (warning)
    if (dueSoon.length > 0) {
      html += `<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);padding:12px;border-radius:10px;margin:14px 0;border-right:4px solid var(--warning)">
        <h4 style="color:#92400e;margin:0 0 4px;font-size:15px">⏰ توريدات قرب موعد تحصيلها (${dueSoon.length})</h4>
        <p style="color:#78350f;font-size:12px;margin:0">هتستحق التحصيل خلال الأسبوع الجاي</p>
      </div>`;
      dueSoon.slice(0, 8).forEach(i => {
        const lbl = i.daysUntil === 0 ? 'النهارده' : i.daysUntil === 1 ? 'بكرة' : `بعد ${i.daysUntil} يوم`;
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid var(--warning);padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="closeModal();navigate('issuances');setTimeout(()=>viewIssuance('${i.id}'),100)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div>
              <b style="font-size:14px">${escapeHtml(i.customerName)}</b>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📄 ${escapeHtml(i.productName)} • #${i.number}</div>
            </div>
            <div style="text-align:left">
              <div style="color:var(--warning);font-weight:800;font-size:14px">${fmtCurrency(i.remaining)}</div>
              <div style="font-size:11px;color:#92400e;background:rgba(245,158,11,.15);padding:2px 8px;border-radius:999px;margin-top:2px;display:inline-block">📅 ${lbl}</div>
            </div>
          </div>
        </div>`;
      });
    }

    // 4) MONEY OWED TO SUPPLIERS
    if (owedSuppliers.length > 0) {
      const totalOwed = owedSuppliers.reduce((s, x) => s + x._metrics.balance, 0);
      html += `<div style="background:linear-gradient(135deg,#fff7ed,#fed7aa);padding:12px;border-radius:10px;margin:14px 0;border-right:4px solid #ea580c">
        <h4 style="color:#9a3412;margin:0 0 4px;font-size:15px">🏭 ديون موردين عليك (${owedSuppliers.length} مورد • ${fmtCurrency(totalOwed)})</h4>
        <p style="color:#7c2d12;font-size:12px;margin:0">الموردين اللي ينتظروا منك تحويلات</p>
      </div>`;
      owedSuppliers.slice(0, 5).forEach(s => {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid #ea580c;padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="closeModal();navigate('suppliers');setTimeout(()=>openSupplierPaymentForm('','${s.id}'),100)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div>
              <b style="font-size:14px">${escapeHtml(s.name)}</b>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${s.phone ? '📞 ' + escapeHtml(s.phone) : ''}</div>
            </div>
            <div style="text-align:left">
              <div style="color:#ea580c;font-weight:800;font-size:15px">${fmtCurrency(s._metrics.balance)}</div>
              <div style="font-size:11px;color:#9a3412;background:rgba(234,88,12,.12);padding:2px 8px;border-radius:999px;margin-top:2px;display:inline-block">اضغط للسداد</div>
            </div>
          </div>
        </div>`;
      });
    }

    // 4b) SUPPLIER PURCHASES OVERDUE BY DUE DATE (most urgent)
    if (supOverduePur.length > 0) {
      const t = supOverduePur.reduce((s, x) => s + (x.amount || 0), 0);
      html += `<div style="background:linear-gradient(135deg,#fee2e2,#fecaca);padding:12px;border-radius:10px;margin:14px 0;border-right:4px solid var(--danger)">
        <h4 style="color:var(--danger);margin:0 0 4px;font-size:15px">⏰ فواتير موردين فات موعد سدادها (${supOverduePur.length} • ${fmtCurrency(t)})</h4>
        <p style="color:#7f1d1d;font-size:12px;margin:0">الفواتير دي عدّى تاريخ استحقاقها — سدّدها بسرعة</p>
      </div>`;
      supOverduePur.slice(0, 8).forEach(e => {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid var(--danger);padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="closeModal();navigate('suppliers');setTimeout(()=>openSupplierPaymentForm('','${e.supplierId}'),100)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div>
              <b style="font-size:14px">${escapeHtml(e.supplierName||'')}</b>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📄 ${escapeHtml(e.description||'')}</div>
            </div>
            <div style="text-align:left">
              <div style="color:var(--danger);font-weight:800;font-size:14px">${fmtCurrency(e.amount)}</div>
              <div style="font-size:11px;color:var(--danger);background:rgba(239,68,68,.1);padding:2px 8px;border-radius:999px;margin-top:2px;display:inline-block">⏰ متأخر ${e.daysOverdue} يوم</div>
            </div>
          </div>
        </div>`;
      });
    }

    // 4c) SUPPLIER PURCHASES DUE SOON (within 7 days)
    if (supDueSoonPur.length > 0) {
      const t = supDueSoonPur.reduce((s, x) => s + (x.amount || 0), 0);
      html += `<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);padding:12px;border-radius:10px;margin:14px 0;border-right:4px solid var(--warning)">
        <h4 style="color:#92400e;margin:0 0 4px;font-size:15px">📅 مواعيد سداد موردين قريبة (${supDueSoonPur.length} • ${fmtCurrency(t)})</h4>
        <p style="color:#78350f;font-size:12px;margin:0">جهّز السداد قبل ما يعدّي الموعد</p>
      </div>`;
      supDueSoonPur.slice(0, 8).forEach(e => {
        const label = e.daysUntil === 0 ? 'النهاردة' : ('باقي ' + e.daysUntil + ' يوم');
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid var(--warning);padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="closeModal();navigate('suppliers');setTimeout(()=>openSupplierPaymentForm('','${e.supplierId}'),100)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div>
              <b style="font-size:14px">${escapeHtml(e.supplierName||'')}</b>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📄 ${escapeHtml(e.description||'')} • 📅 ${e.dueDate}</div>
            </div>
            <div style="text-align:left">
              <div style="color:#92400e;font-weight:800;font-size:14px">${fmtCurrency(e.amount)}</div>
              <div style="font-size:11px;color:#92400e;background:rgba(245,158,11,.12);padding:2px 8px;border-radius:999px;margin-top:2px;display:inline-block">${label}</div>
            </div>
          </div>
        </div>`;
      });
    }

    // 5) PRICE CHANGES (inflation watch)
    if (priceChanges.length > 0) {
      html += `<div style="background:linear-gradient(135deg,#ede9fe,#ddd6fe);padding:12px;border-radius:10px;margin:14px 0;border-right:4px solid #7c3aed">
        <h4 style="color:#5b21b6;margin:0 0 4px;font-size:15px">📊 تغيرات في أسعار الموردين (${priceChanges.length})</h4>
        <p style="color:#4c1d95;font-size:12px;margin:0">الموردين دول غيّروا أسعار في قائمتهم — راجع قبل الشراء</p>
      </div>`;
      priceChanges.slice(0, 6).forEach(pc => {
        const isUp = pc.diff > 0;
        const arrowColor = isUp ? '#dc2626' : '#059669';
        const arrow = isUp ? '▲' : '▼';
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid #7c3aed;padding:10px 12px;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="closeModal();navigate('suppliers');setTimeout(()=>openSupplierPriceList('${pc.supplierId}'),100)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="min-width:0;flex:1">
              <b style="font-size:13.5px">${escapeHtml(pc.itemName)}</b>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">من ${escapeHtml(pc.supplierName)} • آخر شراء ${pc.lastDate}</div>
            </div>
            <div style="text-align:left;white-space:nowrap">
              <div style="color:${arrowColor};font-weight:800;font-size:13.5px">${arrow} ${Math.abs(pc.diff).toFixed(1)}%</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${fmt(pc.oldPrice).split('.')[0]} → <b style="color:${arrowColor}">${fmt(pc.newPrice).split('.')[0]}</b></div>
            </div>
          </div>
        </div>`;
      });
    }

    // 6) Low stock
    if (low.length > 0) {
      html += `<div style="background:linear-gradient(135deg,#dbeafe,#bfdbfe);padding:12px;border-radius:10px;margin:14px 0;border-right:4px solid var(--info)">
        <h4 style="color:#1e40af;margin:0 0 4px;font-size:15px">📦 مخزون منخفض (${low.length})</h4>
        <p style="color:#1e3a8a;font-size:12px;margin:0">المنتجات دي قاربت تنفد من المخزن</p>
      </div>`;
      low.forEach(p => {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-right:3px solid var(--info);padding:10px 12px;border-radius:8px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>${escapeHtml(p.name)}</b>
            <div style="font-size:11px"><span style="color:var(--danger);font-weight:800">${p.quantity} ${p.unit||''}</span> / حد أدنى ${p.minQuantity}</div>
          </div>
        </div>`;
      });
    }
  }

  openModal('🔔 الإشعارات والتنبيهات', html, '<button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>', 'large');
}

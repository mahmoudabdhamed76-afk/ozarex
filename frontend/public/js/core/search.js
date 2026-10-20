/* js/core/search.js — global search (invoices, customers, products, payments) + voice search
   Phase 7: moved verbatim from the inline app script of index.html (no code changes). A classic script:
   it must load at exactly this point of index.html — see docs/FRONTEND-LOAD-ORDER.md. */
/* =========================================================
   GLOBAL SEARCH (invoices, customers, products, payments)
========================================================= */
function runGlobalSearch(q) {
  const sr = document.getElementById('search-results');
  if (!q || q.length < 1) { sr.classList.remove('show'); sr.innerHTML = ''; return; }
  const qLower = q.toLowerCase();

  // Search customers/centers
  const customers = (DB.data.customers || []).filter(c =>
    (c.name||'').toLowerCase().includes(qLower) ||
    (c.company||'').toLowerCase().includes(qLower) ||
    (c.phone||'').includes(q)
  ).slice(0, 5);

  // Search invoices by number/customer
  const invoices = (DB.data.invoices || []).filter(i =>
    (i.number||'').toString().toLowerCase().includes(qLower) ||
    (i.customerName||'').toLowerCase().includes(qLower)
  ).slice(0, 5);

  // Search products
  const products = (DB.data.products || []).filter(p =>
    (p.name||'').toLowerCase().includes(qLower) ||
    (p.code||'').toLowerCase().includes(qLower)
  ).slice(0, 5);

  // Search payments by ref/customer/amount
  const payments = (DB.data.payments || []).filter(p =>
    (p.reference||'').toLowerCase().includes(qLower) ||
    (p.customerName||'').toLowerCase().includes(qLower) ||
    (p.amount||'').toString().includes(q) ||
    (p.note||'').toLowerCase().includes(qLower)
  ).slice(0, 5);

  // Search issuances
  const issuances = (DB.data.issuances || []).filter(i =>
    (i.number||'').toString().toLowerCase().includes(qLower) ||
    (i.customerName||'').toLowerCase().includes(qLower) ||
    (i.productName||'').toLowerCase().includes(qLower)
  ).slice(0, 5);

  let html = '';
  if (customers.length === 0 && invoices.length === 0 && products.length === 0 && payments.length === 0 && issuances.length === 0) {
    html = `<div class="search-result-empty">
      <div class="sre-icon">🔍</div>
      لا توجد نتائج للبحث عن "<b>${escapeHtml(q)}</b>"
    </div>`;
  } else {
    if (customers.length) {
      html += `<div class="search-result-section">
        <div class="search-result-header">👥 العملاء / المراكز (${customers.length})</div>
        ${customers.map(c => `
          <div class="search-result-item" onclick="navigate('customers');setTimeout(()=>{document.getElementById('global-search').value='';document.getElementById('search-results').classList.remove('show');},50)">
            <div class="sr-icon" style="background:rgba(139,92,246,.15);color:#8b5cf6">👤</div>
            <div class="sr-body">
              <div class="sr-title">${escapeHtml(c.name)}</div>
              <div class="sr-sub">${escapeHtml(c.phone||'-')} ${c.balance>0?'• <b style="color:var(--danger)">مديونية '+fmtCurrency(c.balance)+'</b>':''}</div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
    if (invoices.length) {
      html += `<div class="search-result-section">
        <div class="search-result-header">📄 الفواتير (${invoices.length})</div>
        ${invoices.map(i => `
          <div class="search-result-item" onclick="navigate('invoices');setTimeout(()=>{if(window.viewInvoice)viewInvoice('${i.id}');document.getElementById('global-search').value='';document.getElementById('search-results').classList.remove('show');},80)">
            <div class="sr-icon" style="background:rgba(6,182,212,.15);color:#06b6d4">📄</div>
            <div class="sr-body">
              <div class="sr-title">فاتورة #${escapeHtml(i.number)} - ${escapeHtml(i.customerName||'')}</div>
              <div class="sr-sub">${i.date} • <b>${fmtCurrency(i.total||0)}</b></div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
    if (issuances.length) {
      html += `<div class="search-result-section">
        <div class="search-result-header">📋 صرف الورق (${issuances.length})</div>
        ${issuances.map(i => `
          <div class="search-result-item" onclick="navigate('issuances');setTimeout(()=>{if(window.viewIssuance)viewIssuance('${i.id}');document.getElementById('global-search').value='';document.getElementById('search-results').classList.remove('show');},80)">
            <div class="sr-icon" style="background:rgba(59,130,246,.15);color:#3b82f6">📋</div>
            <div class="sr-body">
              <div class="sr-title">#${escapeHtml(i.number)} - ${escapeHtml(i.customerName||'')}</div>
              <div class="sr-sub">${escapeHtml(i.productName||'')} • ${i.date}</div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
    if (products.length) {
      html += `<div class="search-result-section">
        <div class="search-result-header">📦 المنتجات (${products.length})</div>
        ${products.map(p => `
          <div class="search-result-item" onclick="navigate('inventory');setTimeout(()=>{document.getElementById('global-search').value='';document.getElementById('search-results').classList.remove('show');},50)">
            <div class="sr-icon" style="background:rgba(132,204,22,.15);color:#84cc16">📦</div>
            <div class="sr-body">
              <div class="sr-title">${escapeHtml(p.name)}</div>
              <div class="sr-sub">${escapeHtml(p.code||'')} • متاح: <b>${p.quantity||0}</b></div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
    if (payments.length) {
      html += `<div class="search-result-section">
        <div class="search-result-header">💰 التحصيلات (${payments.length})</div>
        ${payments.map(p => `
          <div class="search-result-item" onclick="navigate('payments');setTimeout(()=>{document.getElementById('global-search').value='';document.getElementById('search-results').classList.remove('show');},50)">
            <div class="sr-icon" style="background:rgba(245,158,11,.15);color:#f59e0b">💰</div>
            <div class="sr-body">
              <div class="sr-title">${fmtCurrency(p.amount)} - ${escapeHtml(p.customerName||'')}</div>
              <div class="sr-sub">${p.date} • ${escapeHtml(p.method||'')} ${p.reference?'• '+escapeHtml(p.reference):''}</div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
  }
  sr.innerHTML = html;
  sr.classList.add('show');
}

/* Voice search (Web Speech API) */
let voiceRecognition = null;
function toggleVoiceSearch() {
  const btn = document.getElementById('search-mic-btn');
  const input = document.getElementById('global-search');

  // Toggle off if already listening
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch(e) {}
    voiceRecognition = null;
    btn.classList.remove('listening');
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('متصفحك ما يدعمش البحث الصوتي - جرب على Chrome', 'error');
    return;
  }

  try {
    voiceRecognition = new SR();
    voiceRecognition.lang = 'ar-EG';
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = true;

    btn.classList.add('listening');
    toast('🎤 اتكلم دلوقتي...', 'info');

    voiceRecognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('');
      input.value = transcript;
      runGlobalSearch(transcript.trim());
    };

    voiceRecognition.onerror = (e) => {
      btn.classList.remove('listening');
      voiceRecognition = null;
      if (e.error === 'no-speech') toast('ما سمعتش حاجة، جرب تاني', 'warning');
      else if (e.error === 'not-allowed') toast('لازم تسمح بالميكروفون من الإعدادات', 'error');
      else toast('حصلت مشكلة في البحث الصوتي', 'error');
    };

    voiceRecognition.onend = () => {
      btn.classList.remove('listening');
      voiceRecognition = null;
    };

    voiceRecognition.start();
  } catch(err) {
    btn.classList.remove('listening');
    voiceRecognition = null;
    toast('ما قدرتش أشغّل البحث الصوتي', 'error');
  }
}

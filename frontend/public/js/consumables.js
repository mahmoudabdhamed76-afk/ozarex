/* ════════════════════════════════════════════════════════════════════
   ERP · «🧪 مستهلكات» (4.50) — paper / film / any item taken from the store
   NOT to sell: trying a printer, a sample for a customer, internal use,
   damaged… It leaves the stock like any «منصرف» (product quantity down +
   a stock move), but marked kind:'consumable' with its reason, who took
   it and its cost at that moment, so:
     · «المخازن» shows it in its own tab «المستهلكات» with the month's total;
     · «أرباحي» counts its cost as an expense «مستهلكات» (it is a real cost,
       never a sale), and «الفلوس» keeps adding up exactly;
     · the admin can return one that was recorded by mistake (stock back).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var REASONS = ['تجربة طابعة / جهاز', 'تجربة ورق / فيلم', 'عينة لعميل', 'استخدام داخلي', 'تالف / مكسور'];
  var ui = { month: '' };

  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { var d = D(); if (!Array.isArray(d[k])) d[k] = []; return d[k]; }
  function N(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function money(n) { try { if (typeof fmtCurrency === 'function') return fmtCurrency(N(n)); } catch (e) {} return N(n).toFixed(2); }
  function qn(n) { return N(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function today() { return typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10); }
  function T(m, t) { if (typeof toast === 'function') toast(m, t || 'success'); }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) || {}; }
  function isAdmin() { return me().role === 'admin'; }
  function may() { if (isAdmin()) return true; try { var p = typeof userPages === 'function' ? userPages(me()) : []; return p.indexOf('inventory') >= 0 || p.indexOf('stock') >= 0; } catch (e) { return false; } }
  function newId() { return 'sm_cs_' + (typeof uid === 'function' ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }
  function isCons(m) { return m && m.kind === 'consumable'; }
  function costOf(m) { return N(m.quantity) * N(m.cost); }
  function monthNow() { return today().slice(0, 7); }

  /* the cost of what was consumed between two days — the profit page / branch numbers use this (pure) */
  function costIn(d, from, to) {
    var t = 0;
    ((d && Array.isArray(d.stockMoves)) ? d.stockMoves : []).forEach(function (m) { if (isCons(m) && String(m.date || '').slice(0, 10) >= from && String(m.date || '').slice(0, 10) <= to) t += costOf(m); });
    return Math.round(t * 100) / 100;
  }

  /* ════════ the form ════════ */
  function open(productId) {
    if (!may()) { T('مالكش صلاحية على المخزن', 'error'); return; }
    var ps = A('products').filter(function (p) { return p && N(p.quantity) > 0; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
    if (!ps.length) { T('مفيش أصناف في المخزن', 'error'); return; }
    openModal('🧪 مستهلكات — خدنا من المخزن ومش للبيع',
      '<form id="cs-form" class="cs-form ax-hl-off" onsubmit="return false" oninput="AXCons.calc()" onchange="AXCons.calc()">' +
        '<p class="cs-lead">للورق أو الفيلم أو أي صنف اتاخد يتجرب بيه أو عينة أو استخدام داخلي — بيتخصم من المخزن ويتسجل <b>مستهلكات</b> بتكلفته، مش مبيعات.</p>' +
        '<div class="form-group"><label>الصنف *</label><select class="form-control" name="pid" id="cs-pid">' + ps.map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (p.id === productId ? ' selected' : '') + '>' + esc(p.name) + ' — متاح ' + qn(p.quantity) + ' ' + esc(p.unit || '') + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-row"><div class="form-group"><label>الكمية *</label><input class="form-control" type="number" inputmode="decimal" min="0" step="any" name="qty" id="cs-qty" placeholder="0"></div>' +
          '<div class="form-group"><label>التاريخ</label><input class="form-control" type="date" name="date" value="' + today() + '"></div></div>' +
        '<div class="form-group"><label>اتاخدت ليه؟ *</label><div class="cs-chips">' + REASONS.map(function (r, i) {
          return '<label class="cs-chip"><input type="radio" name="reason" value="' + esc(r) + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(r) + '</span></label>'; }).join('') +
          '<label class="cs-chip"><input type="radio" name="reason" value="other"><span>سبب تاني</span></label></div>' +
          '<input class="form-control cs-other" name="other" maxlength="80" placeholder="اكتب السبب"></div>' +
        '<div class="form-row"><div class="form-group"><label>مين خدها</label><input class="form-control" name="taker" maxlength="60" value="' + esc(me().name || me().username || '') + '"></div>' +
          '<div class="form-group"><label>ملاحظة</label><input class="form-control" name="note" maxlength="160" placeholder="مثلاً: تجربة طابعة مركز النور"></div></div>' +
        '<div class="cs-sum" id="cs-sum"></div>' +
      '</form>',
      '<button class="btn btn-primary" onclick="AXCons.save()">🧪 سجّل مستهلكات</button><button class="btn btn-secondary" onclick="AXCons.list()">📋 السجل</button><button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>');
    calc();
  }
  function form() {
    var F = document.getElementById('cs-form'); if (!F) return null;
    var g = function (n) { var e = F.elements[n]; return e ? String(e.value || '').trim() : ''; };
    var r = (F.querySelector('input[name="reason"]:checked') || {}).value || '';
    return { pid: g('pid'), qty: N(g('qty')), date: g('date') || today(), reason: r === 'other' ? g('other') : r, other: r === 'other', taker: g('taker'), note: g('note') };
  }
  function calc() {
    var f = form(), el = document.getElementById('cs-sum'), F = document.getElementById('cs-form'); if (!f || !el) return;
    if (F) F.classList.toggle('other', f.other);
    var p = A('products').find(function (x) { return x && x.id === f.pid; });
    if (!p) { el.innerHTML = ''; return; }
    var over = f.qty > N(p.quantity) + 1e-9;
    el.className = 'cs-sum' + (over ? ' bad' : '');
    el.innerHTML = f.qty > 0
      ? (over ? 'المتاح ' + qn(p.quantity) + ' ' + esc(p.unit || '') + ' بس'
        : 'هيتخصم <b>' + qn(f.qty) + ' ' + esc(p.unit || '') + '</b> — يفضل ' + qn(N(p.quantity) - f.qty) + ' · تكلفتها <b>' + money(f.qty * N(p.cost)) + '</b> تتحسب مستهلكات')
      : 'اكتب الكمية';
  }
  function save() {
    var f = form(); if (!f) return;
    var p = A('products').find(function (x) { return x && x.id === f.pid; });
    if (!p) { T('اختار الصنف', 'error'); return; }
    if (!(f.qty > 0)) { T('اكتب الكمية', 'error'); return; }
    if (f.qty > N(p.quantity) + 1e-9) { T('الكمية أكبر من المتاح (' + qn(p.quantity) + ')', 'error'); return; }
    if (!f.reason) { T('اكتب السبب', 'error'); return; }
    var before = N(p.quantity);
    p.quantity = Math.round((before - f.qty) * 1e6) / 1e6;
    var mv = { id: newId(), productId: p.id, productName: p.name, unit: p.unit || '', type: 'out', kind: 'consumable', quantity: f.qty, cost: N(p.cost), date: f.date,
      reason: f.reason, takenBy: f.taker, reference: 'مستهلكات — ' + f.reason, note: f.note, by: { id: me().id, name: me().name || me().username }, createdAt: Date.now() };
    try { if (window.Branch && Branch.get) mv.branch = Branch.get(); } catch (e) {}
    A('stockMoves').push(mv);
    DB.save();
    try { if (typeof logAudit === 'function') logAudit({ operation: 'add', table: 'stockMoves', recordId: mv.id, recordLabel: 'مستهلكات: ' + p.name + ' ×' + qn(f.qty) + ' (' + f.reason + ')', before: { quantity: before }, after: mv }); } catch (e) {}
    closeModal();
    T('🧪 اتسجلت مستهلكات: ' + p.name + ' ×' + qn(f.qty) + ' — ' + money(costOf(mv)));
    refresh();
  }

  /* ════════ the log ════════ */
  function rows(month) { return A('stockMoves').filter(function (m) { return isCons(m) && String(m.date || '').slice(0, 7) === month; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || N(b.createdAt) - N(a.createdAt); }); }
  function months() { var s = {}; s[monthNow()] = 1; A('stockMoves').forEach(function (m) { if (isCons(m)) s[String(m.date || '').slice(0, 7)] = 1; }); return Object.keys(s).filter(Boolean).sort().reverse(); }
  function mLabel(ym) { var M = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'], p = ym.split('-'); return M[+p[1] - 1] + ' ' + p[0]; }
  function tabHtml() {
    var m = ui.month || monthNow(), list = rows(m), total = 0, byR = {}, byP = {};
    list.forEach(function (x) { var c = costOf(x); total += c; byR[x.reason || 'أخرى'] = (byR[x.reason || 'أخرى'] || 0) + c; var k = x.productName || x.productId; byP[k] = byP[k] || { q: 0, u: x.unit || '', c: 0 }; byP[k].q += N(x.quantity); byP[k].c += c; });
    var head = '<div class="cs-head"><div class="cs-kpi"><span>مستهلكات ' + esc(mLabel(m)) + '</span><b>' + money(total) + '</b><small>' + list.length + ' مرة · بتتحسب مصروف في «أرباحي»</small></div>' +
      '<div class="cs-tools"><select class="form-control" onchange="AXCons.month(this.value)">' + months().map(function (x) { return '<option value="' + x + '"' + (x === m ? ' selected' : '') + '>' + esc(mLabel(x)) + '</option>'; }).join('') + '</select>' +
      (may() ? '<button class="btn btn-primary" onclick="AXCons.open()">🧪 سجّل مستهلكات</button>' : '') + '</div></div>';
    if (!list.length) return '<div class="cs-wrap">' + head + '<div class="empty-state"><div class="icon">🧪</div><p>مفيش مستهلكات في ' + esc(mLabel(m)) + '</p></div></div>';
    var chips = '<div class="cs-by">' + Object.keys(byR).sort(function (a, b) { return byR[b] - byR[a]; }).map(function (r) { return '<span>' + esc(r) + ' <b>' + money(byR[r]) + '</b></span>'; }).join('') + '</div>' +
      '<div class="cs-by p">' + Object.keys(byP).sort(function (a, b) { return byP[b].c - byP[a].c; }).map(function (k) { return '<span>' + esc(k) + ' <b>×' + qn(byP[k].q) + ' ' + esc(byP[k].u) + '</b></span>'; }).join('') + '</div>';
    var tbl = '<div class="table-wrap"><div class="table-scroll"><table class="data-table cs-tbl"><thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>التكلفة</th><th>السبب</th><th>مين خدها</th><th>ملاحظة</th>' + (isAdmin() ? '<th></th>' : '') + '</tr></thead><tbody>' +
      list.map(function (x) {
        return '<tr><td>' + esc(x.date) + '</td><td><b>' + esc(x.productName || '') + '</b></td><td>' + qn(x.quantity) + ' ' + esc(x.unit || '') + '</td><td>' + money(costOf(x)) + '</td><td><span class="cs-r">' + esc(x.reason || '') + '</span></td><td>' + esc(x.takenBy || (x.by && x.by.name) || '') + '</td><td>' + esc(x.note || '') + '</td>' +
          (isAdmin() ? '<td><button class="btn btn-sm btn-ghost" onclick="AXCons.undo(\'' + esc(x.id) + '\')" title="اتسجلت غلط">↩ رجّعها</button></td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div></div>';
    return '<div class="cs-wrap">' + head + chips + tbl + '</div>';
  }
  function list() { if (typeof closeModal === 'function') closeModal(); if (typeof invTab !== 'undefined') { try { invTab = 'cons'; } catch (e) {} } if (typeof navigate === 'function') navigate('inventory'); }
  function undo(id) {
    if (!isAdmin()) return;
    var mv = A('stockMoves').find(function (m) { return m && m.id === id && isCons(m); }); if (!mv) return;
    var go = function () {
      var p = A('products').find(function (x) { return x && x.id === mv.productId; });
      var before = p ? N(p.quantity) : null;
      if (p) p.quantity = Math.round((N(p.quantity) + N(mv.quantity)) * 1e6) / 1e6;
      DB.data.stockMoves = A('stockMoves').filter(function (m) { return m.id !== id; });
      DB.save();
      try { if (typeof logAudit === 'function') logAudit({ operation: 'delete', table: 'stockMoves', recordId: id, recordLabel: 'إلغاء مستهلكات: ' + (mv.productName || '') + ' ×' + qn(mv.quantity), before: mv, after: p ? { quantity: p.quantity, was: before } : null }); } catch (e) {}
      T('↩ رجعت ' + qn(mv.quantity) + ' ' + (mv.unit || '') + ' للمخزن');
      refresh();
    };
    if (typeof confirmDialog === 'function') confirmDialog('ترجّع ' + qn(mv.quantity) + ' ' + (mv.unit || '') + ' من «' + (mv.productName || '') + '» للمخزن وتشيلها من المستهلكات؟', go); else go();
  }
  function refresh() { try { if (typeof currentPage !== 'undefined' && currentPage === 'inventory' && typeof renderInventory === 'function') renderInventory(); if (typeof renderSidebar === 'function') renderSidebar(); } catch (e) {} }

  window.AXCons = { open: open, calc: calc, save: save, list: list, undo: undo, tabHtml: tabHtml, costIn: costIn, isCons: isCons,
    month: function (m) { ui.month = m; refresh(); } };
})();

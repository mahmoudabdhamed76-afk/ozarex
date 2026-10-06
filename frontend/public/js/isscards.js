/* ════════════════════════════════════════════════════════════════════
   ERP · قايمة صرف الورق على الموبايل — كروت طولية (4.13)
   على الكمبيوتر الجدول زي ما هو. على الموبايل كل صف بيبقى كارت:
   الرقم والحالة فوق، اسم المركز، الصنف والتاريخ، والأرقام في مربعات،
   والأزرار تحت — من غير ما تسحب بالعرض.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function cardify() {
    var pc = document.getElementById('page-content'); if (!pc) return;
    var t = pc.querySelector('.table-wrap .data-table'); if (!t) return;
    var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    if (heads.length < 10) return;
    t.classList.add('iss-tbl');
    var wrap = t.closest('.table-wrap'); if (wrap) wrap.classList.add('iss-wrap');
    var mobile = !!(window.matchMedia && matchMedia('(max-width: 768px)').matches);
    /* Phase 5: only rows not done yet (a long list is appended in steps) */
    Array.prototype.forEach.call(t.querySelectorAll('tbody tr:not(.iss-row)'), function (tr) {
      var tds = tr.children; if (tds.length !== heads.length) return;
      tr.classList.add('iss-row');
      Array.prototype.forEach.call(tds, function (td, i) {
        td.setAttribute('data-label', heads[i]); td.classList.add('ic-' + i);
        if (i >= 4 && i <= 8) {
          td.setAttribute('title', td.textContent.trim());
          if (mobile) td.innerHTML = td.innerHTML.replace(/(\d)\.00(?!\d)/g, '$1');   // «16,500 ج» بدل «16,500.00 ج» على الموبايل
        }
      });
    });
  }
  var _ri = window.renderIssuances;
  if (typeof _ri === 'function' && !_ri._ic) {
    var w = function () { var r = _ri.apply(this, arguments); try { cardify(); } catch (e) { console.warn('[isscards]', e); } return r; };
    w._ic = 1; window.renderIssuances = w;
  }
  window.AXIssCards = { apply: cardify };
})();

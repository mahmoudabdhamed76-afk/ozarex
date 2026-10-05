/* ════════════════════════════════════════════════════════════════════
   ERP · تصدير كل البيانات لإكسل (4.12)
   ------------------------------------------------------------------
   ملف .xlsx واحد حقيقي (مش CSV) فيه ورقة لكل جدول + ورقة «ملخص»
   بمعادلات بتربط الأوراق ببعض (SUM / SUMIF)، والأعمدة المحسوبة
   (الإجمالي = الكمية × السعر، المتبقي = الإجمالي − المدفوع …) معادلات
   حقيقية جوه الشيت. الأوراق من اليمين للشمال، الصف الأول مثبّت وعليه
   فلتر. بيتبني بالكامل في المتصفح بـ buildZip() — مفيش مكتبات.
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function D() { return (typeof DB !== 'undefined' && DB && DB.data) || {}; }
  function A(k) { var d = D(); return Array.isArray(d[k]) ? d[k] : []; }
  function S() { return D().settings || {}; }
  function x(s) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function col(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function N(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(N(n) * 100) / 100; }

  /* a sheet = { name, cols:[{h, w, t:'s'|'n'|'i'|'d'}], rows:[[v | {f, v}]] } */
  function sheetXml(sh) {
    var rows = sh.rows, nc = sh.cols.length, last = col(nc - 1) + (rows.length + 1);
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<dimension ref="A1:' + last + '"/>',
      '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"' + (sh.first ? ' tabSelected="1"' : '') + '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      '<sheetFormatPr defaultRowHeight="18"/><cols>'];
    sh.cols.forEach(function (c, i) { out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 14) + '" customWidth="1"/>'); });
    out.push('</cols><sheetData>');
    out.push('<row r="1" ht="22" customHeight="1">' + sh.cols.map(function (c, i) { return '<c r="' + col(i) + '1" t="inlineStr" s="1"><is><t>' + x(c.h) + '</t></is></c>'; }).join('') + '</row>');
    rows.forEach(function (row, ri) {
      var r = ri + 2, cells = [];
      row.forEach(function (v, ci) {
        var ref = col(ci) + r, t = (sh.cols[ci] || {}).t || 's', st = t === 'n' ? 2 : t === 'i' ? 3 : 0;
        if (v && typeof v === 'object' && v.f) {
          var val = v.v;
          if (typeof val === 'string') cells.push('<c r="' + ref + '" t="str" s="' + (v.s != null ? v.s : st) + '"><f>' + x(v.f.replace(/\{r\}/g, r)) + '</f><v>' + x(val) + '</v></c>');
          else cells.push('<c r="' + ref + '" s="' + (v.s != null ? v.s : st) + '"><f>' + x(v.f.replace(/\{r\}/g, r)) + '</f><v>' + r2(val) + '</v></c>');
        } else if (v === null || v === undefined || v === '') {
          return;
        } else if ((t === 'n' || t === 'i') && !(typeof v === 'string' && !isFinite(Number(v)))) {
          cells.push('<c r="' + ref + '" s="' + st + '"><v>' + r2(v) + '</v></c>');
        } else {
          cells.push('<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>');
        }
      });
      out.push('<row r="' + r + '">' + cells.join('') + '</row>');
    });
    out.push('</sheetData>');
    if (rows.length && !sh.noFilter) out.push('<autoFilter ref="A1:' + last + '"/>');
    out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>');
    return out.join('');
  }
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF002055"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function build() {
    var linked = {}; A('issuances').forEach(function (i) { if (i.invoiceId) linked[i.invoiceId] = 1; });
    var isLinked = function (v) { return !!(v.sourceIssuanceId || v.sourceIssuance || v.fromIssuance || (v.fromIssuances && v.fromIssuances.length) || linked[v.id]); };
    var custName = {}; A('customers').forEach(function (c) { custName[c.id] = c.name; });
    var sheets = [];

    var cust = A('customers');
    sheets.push({ name: 'العملاء', cols: [{ h: 'الاسم', w: 28 }, { h: 'الشركة', w: 20 }, { h: 'التليفون', w: 16 }, { h: 'العنوان', w: 22 }, { h: 'حد الائتمان', t: 'n' }, { h: 'الرصيد (المديونية)', t: 'n', w: 18 }],
      rows: cust.map(function (c) { return [c.name, c.company, c.phone, c.address, N(c.creditLimit), N(c.balance)]; }) });

    var iss = A('issuances').slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    sheets.push({ name: 'صرف الورق', cols: [{ h: 'رقم', t: 'i', w: 9 }, { h: 'التاريخ', w: 12 }, { h: 'المركز', w: 26 }, { h: 'الصنف', w: 24 }, { h: 'الوحدة', w: 10 }, { h: 'الكمية', t: 'n' }, { h: 'السعر', t: 'n' }, { h: 'الإجمالي', t: 'n' }, { h: 'المدفوع', t: 'n' }, { h: 'المتبقي', t: 'n' }, { h: 'الاستحقاق', w: 12 }],
      rows: iss.map(function (i) { var tot = N(i.quantity) * N(i.unitPrice) || N(i.total); return [N(i.number), i.date, i.customerName || custName[i.customerId], i.productName, i.unit, N(i.quantity), N(i.unitPrice), { f: 'F{r}*G{r}', v: tot }, N(i.paid), { f: 'H{r}-I{r}', v: tot - N(i.paid) }, i.dueDate || '']; }) });

    var inv = A('invoices').slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    sheets.push({ name: 'الفواتير', cols: [{ h: 'رقم', t: 'i', w: 9 }, { h: 'التاريخ', w: 12 }, { h: 'العميل', w: 26 }, { h: 'عدد البنود', t: 'i', w: 10 }, { h: 'قبل الخصم', t: 'n' }, { h: 'الخصم', t: 'n' }, { h: 'الضريبة', t: 'n' }, { h: 'الإجمالي', t: 'n' }, { h: 'المدفوع', t: 'n' }, { h: 'المتبقي', t: 'n' }, { h: 'المصدر', w: 12 }],
      rows: inv.map(function (v) { return [N(v.number), v.date, v.customerName || custName[v.customerId], (v.items || []).length, N(v.subtotal), N(v.discount), N(v.tax), N(v.total), N(v.paid), { f: 'H{r}-I{r}', v: N(v.total) - N(v.paid) }, isLinked(v) ? 'من صرف ورق' : 'مستقلة']; }) });

    var lines = [];
    inv.forEach(function (v) { (v.items || []).forEach(function (it) { var q = N(it.quantity != null ? it.quantity : it.qty); lines.push([N(v.number), v.date, v.customerName || custName[v.customerId], it.productName || it.name, q, N(it.price), { f: 'E{r}*F{r}', v: q * N(it.price) }]); }); });
    sheets.push({ name: 'بنود الفواتير', cols: [{ h: 'رقم الفاتورة', t: 'i', w: 11 }, { h: 'التاريخ', w: 12 }, { h: 'العميل', w: 26 }, { h: 'الصنف', w: 24 }, { h: 'الكمية', t: 'n' }, { h: 'السعر', t: 'n' }, { h: 'الإجمالي', t: 'n' }], rows: lines });

    var pay = A('payments').slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    sheets.push({ name: 'التحصيل', cols: [{ h: 'التاريخ', w: 12 }, { h: 'العميل', w: 26 }, { h: 'المبلغ', t: 'n' }, { h: 'الطريقة', w: 12 }, { h: 'المرجع', w: 16 }, { h: 'ملاحظات', w: 26 }],
      rows: pay.map(function (p) { return [p.date, p.customerName || custName[p.customerId], N(p.amount), p.method, p.reference, p.note]; }) });

    var prods = A('products');
    sheets.push({ name: 'المخزون', cols: [{ h: 'الكود', w: 10 }, { h: 'الصنف', w: 26 }, { h: 'النوع', w: 14 }, { h: 'الوحدة', w: 10 }, { h: 'الكمية', t: 'n' }, { h: 'الحد الأدنى', t: 'n' }, { h: 'التكلفة', t: 'n' }, { h: 'سعر البيع', t: 'n' }, { h: 'قيمة المخزون بالتكلفة', t: 'n', w: 20 }, { h: 'قيمة المخزون بالبيع', t: 'n', w: 19 }, { h: 'الحالة', w: 11 }, { h: 'الصلاحية', w: 12 }],
      rows: prods.map(function (p) { var q = N(p.quantity); return [p.code, p.name, p.type, p.unit, q, N(p.minQuantity), N(p.cost), N(p.price), { f: 'E{r}*G{r}', v: q * N(p.cost) }, { f: 'E{r}*H{r}', v: q * N(p.price) }, { f: 'IF(E{r}<=F{r},"تحت الحد","تمام")', v: q <= N(p.minQuantity) ? 'تحت الحد' : 'تمام' }, p.expiryDate || '']; }) });

    var pname = {}; prods.forEach(function (p) { pname[p.id] = p.name; });
    var moves = A('stockMoves').slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    sheets.push({ name: 'حركات المخزن', cols: [{ h: 'التاريخ', w: 12 }, { h: 'الصنف', w: 26 }, { h: 'النوع', w: 10 }, { h: 'الكمية', t: 'n' }, { h: 'البيان', w: 30 }],
      rows: moves.map(function (m) { return [m.date, pname[m.productId] || m.productName || '', m.type === 'in' ? 'وارد' : m.type === 'out' ? 'منصرف' : (m.type || ''), N(m.quantity), m.note || m.reference || '']; }) });

    var purs = A('expenses').filter(function (e) { return e.kind === 'purchase'; }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    var pm = window.AXPur ? AXPur.paidMap() : {};
    var methods = { credit: 'آجل', cash: 'كاش', transfer: 'تحويل', check: 'شيك' };
    sheets.push({ name: 'المشتريات', cols: [{ h: 'رقم', t: 'i', w: 9 }, { h: 'التاريخ', w: 12 }, { h: 'المورد', w: 24 }, { h: 'فاتورة المورد', w: 14 }, { h: 'الوصف', w: 26 }, { h: 'طريقة الدفع', w: 11 }, { h: 'الإجمالي', t: 'n' }, { h: 'المدفوع', t: 'n' }, { h: 'المتبقي', t: 'n' }, { h: 'الاستحقاق', w: 12 }],
      rows: purs.map(function (p) { var paid = pm[p.id] || 0; return [N(p.number), p.date, p.supplierName, p.reference, p.description, methods[p.paymentMethod] || p.paymentMethod, N(p.amount), paid, { f: 'G{r}-H{r}', v: N(p.amount) - paid }, p.dueDate || '']; }) });

    var sps = A('supplierPayments').slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    var supName = {}; A('suppliers').forEach(function (s) { supName[s.id] = s.name; });
    sheets.push({ name: 'مدفوعات الموردين', cols: [{ h: 'التاريخ', w: 12 }, { h: 'المورد', w: 24 }, { h: 'المبلغ', t: 'n' }, { h: 'الطريقة', w: 12 }, { h: 'المرجع', w: 16 }],
      rows: sps.map(function (p) { return [p.date, p.supplierName || supName[p.supplierId] || '', N(p.amount), methods[p.method] || p.method, p.reference]; }) });

    var sups = A('suppliers');
    sheets.push({ name: 'الموردين', cols: [{ h: 'الاسم', w: 24 }, { h: 'الشركة', w: 20 }, { h: 'التليفون', w: 16 }, { h: 'رصيد افتتاحي', t: 'n' }, { h: 'المشتريات', t: 'n' }, { h: 'المدفوع', t: 'n' }, { h: 'الرصيد المستحق', t: 'n', w: 16 }],
      rows: sups.map(function (s) {
        var tp = purs.filter(function (p) { return p.supplierId === s.id; }).reduce(function (a, p) { return a + N(p.amount); }, 0);
        var tpaid = sps.filter(function (p) { return p.supplierId === s.id; }).reduce(function (a, p) { return a + N(p.amount); }, 0);
        return [s.name, s.company, s.phone, N(s.openingBalance), { f: "SUMIF('المشتريات'!C:C,A{r},'المشتريات'!G:G)", v: tp }, { f: "SUMIF('مدفوعات الموردين'!B:B,A{r},'مدفوعات الموردين'!C:C)", v: tpaid }, { f: 'D{r}+E{r}-F{r}', v: N(s.openingBalance) + tp - tpaid }];
      }) });

    var exps = A('expenses').filter(function (e) { return e.kind !== 'purchase'; }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    sheets.push({ name: 'المصروفات', cols: [{ h: 'التاريخ', w: 12 }, { h: 'البند', w: 16 }, { h: 'الوصف', w: 30 }, { h: 'المبلغ', t: 'n' }],
      rows: exps.map(function (e) { return [e.date, e.category, e.description, N(e.amount)]; }) });

    /* summary sheet — every number is a formula over the other sheets */
    function sum(arr, f) { return arr.reduce(function (a, v) { return a + N(f(v)); }, 0); }
    var vIss = sum(iss, function (i) { return N(i.quantity) * N(i.unitPrice) || N(i.total); }), vSolo = sum(inv.filter(function (v) { return !isLinked(v); }), function (v) { return v.total; });
    var vPay = sum(pay, function (p) { return p.amount; }), vDebt = sum(cust, function (c) { return c.balance; });
    var vStock = sum(prods, function (p) { return N(p.quantity) * N(p.cost); }), vPur = sum(purs, function (p) { return p.amount; });
    var vSp = sum(sps, function (p) { return p.amount; }), vExp = sum(exps, function (e) { return e.amount; });
    var vOwe = sum(sups, function (s) { return N(s.openingBalance); }) + vPur - vSp;
    var sumRows = [
      ['مبيعات صرف الورق', { f: "SUM('صرف الورق'!H:H)", v: vIss, s: 2 }],
      ['فواتير مستقلة (مش من صرف ورق)', { f: "SUMIF('الفواتير'!K:K,\"مستقلة\",'الفواتير'!H:H)", v: vSolo, s: 2 }],
      ['إجمالي المبيعات', { f: 'B2+B3', v: vIss + vSolo, s: 4 }],
      ['إجمالي التحصيل', { f: "SUM('التحصيل'!C:C)", v: vPay, s: 2 }],
      ['مديونيات العملاء', { f: "SUM('العملاء'!F:F)", v: vDebt, s: 4 }],
      ['قيمة المخزون بالتكلفة', { f: "SUM('المخزون'!I:I)", v: vStock, s: 2 }],
      ['أصناف تحت الحد', { f: "COUNTIF('المخزون'!K:K,\"تحت الحد\")", v: prods.filter(function (p) { return N(p.quantity) <= N(p.minQuantity); }).length, s: 3 }],
      ['إجمالي المشتريات', { f: "SUM('المشتريات'!G:G)", v: vPur, s: 2 }],
      ['المدفوع للموردين', { f: "SUM('مدفوعات الموردين'!C:C)", v: vSp, s: 2 }],
      ['المستحق للموردين', { f: "SUM('الموردين'!G:G)", v: vOwe, s: 4 }],
      ['المصروفات', { f: "SUM('المصروفات'!D:D)", v: vExp, s: 2 }],
      ['صافي الكاش (تحصيل − موردين − مصروفات)', { f: 'B5-B10-B12', v: vPay - vSp - vExp, s: 4 }]
    ];
    var now = new Date();
    sumRows.push(['', null], ['الشركة', S().companyName || 'نظام الحسابات'], ['تاريخ التصدير', now.toLocaleString('en-GB')]);
    sheets.unshift({ name: 'ملخص', first: true, noFilter: true, cols: [{ h: 'البند', w: 40 }, { h: 'القيمة', t: 'n', w: 22 }], rows: sumRows });
    return sheets;
  }

  function xlsx(sheets) {
    var enc = new TextEncoder(), files = [];
    function put(name, s) { files.push({ name: name, data: enc.encode(s) }); }
    put('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    put('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    var iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    put('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x((S().companyName || 'نظام الحسابات') + ' — كل البيانات') + '</dc:title><dc:creator>ERP</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created></cp:coreProperties>');
    put('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>');
    put('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000" activeTab="0"/></bookViews><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + x(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    put('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    put('xl/styles.xml', STYLES);
    sheets.forEach(function (s, i) { put('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)); });
    return buildZip(files);
  }

  function exportAll() {
    try {
      if (typeof buildZip !== 'function') throw new Error('buildZip غير موجود');
      var sheets = build(), bytes = xlsx(sheets);
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a'), url = URL.createObjectURL(blob);
      var t = (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10);
      a.href = url; a.download = 'erp-' + t + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      var rows = sheets.reduce(function (s, sh) { return s + sh.rows.length; }, 0);
      if (typeof toast === 'function') toast('اتصدّر ملف إكسل فيه ' + sheets.length + ' ورقة و' + rows.toLocaleString('en-US') + ' صف ✓');
      return { sheets: sheets.length, rows: rows, bytes: bytes.length };
    } catch (e) {
      console.error('[xlsx]', e);
      if (typeof toast === 'function') toast('التصدير ما نفعش: ' + e.message, 'error');
      return null;
    }
  }

  window.AXX = { exportAll: exportAll, build: build, xlsx: xlsx };
  /* «الإعدادات ← تصدير Excel» used to write a CSV — now the same real workbook */
  if (typeof window.exportBackupExcel === 'function') window.exportBackupExcel = function () { return exportAll(); };
})();

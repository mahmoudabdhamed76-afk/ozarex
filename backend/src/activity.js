/* ════════════════════════════════════════════════════════════════════
   ERP · إشعار الحركة لكل المستخدمين (4.96)
   أي يوزر يضيف مصروف أو توريد لمركز أو تحصيل → إشعار على موبايل كل
   المستخدمين اللي شغالين في الفرع ده (ما عدا اللي عمل الحركة نفسه)،
   والرقم بيتحط على أيقونة البرنامج (اللي متضاف للشاشة الرئيسية).
   · مستقل عن «الملخص اليومي» — بيشتغل حتى لو الملخص مقفول
   · المدير يقفل/يفتح كل نوع من «الفلوس ← الملخص اليومي»
   · بيعة فيها كذا نوع ورق = إشعار واحد (نفس الرقم + المركز + اليوم)
   · تحصيل اتعمل مع التوريد في نفس الحفظة بيتكتب في نفس الإشعار
   · حركة قديمة (أكتر من يوم — مزامنة جهاز كان أوفلاين من زمان أو استرجاع) ما بتبعتش
   · كل يوزر يوصله اللي صلاحياته بتوريهوله بس: المصروف لمين يقدر يشوف «المصروفات»،
     والتوريد والتحصيل لمين يقدر يشوف التوريدات / التحصيل (زي ما السيرفر بيبعتله الداتا بالظبط)
════════════════════════════════════════════════════════════════════ */
const webpush = require('./webpush');
const perms = require('./permissions');

const DEF = { actExpense: true, actIssue: true, actPay: true };
function config() { return Object.assign({}, DEF, webpush.meta('activity') || {}); }
function setConfig(b) {
  const out = config();
  Object.keys(DEF).forEach(k => { if (b && b[k] !== undefined) out[k] = !!b[k]; });
  webpush.meta('activity', out);
  return out;
}

const N = v => Number(v) || 0;
const money = v => Math.round(N(v)).toLocaleString('en-US') + ' ج';
const qty = v => { const n = N(v); return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); };
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const DAY = 24 * 3600e3;
const fresh = r => !r || !r.createdAt || (Date.now() - N(r.createdAt)) < DAY;

/* the records this change ADDED (by id), read back from the data after the server accepted it */
function added(ops, name, data) {
  const cd = ops && ops.cols && ops.cols[name];
  const ids = ((cd && cd.added) || []).map(r => r && r.id).filter(id => id != null).map(String);
  if (!ids.length) return [];
  const byId = new Map(((data && data[name]) || []).filter(Boolean).map(r => [String(r.id), r]));
  return ids.map(id => byId.get(id)).filter(Boolean).filter(fresh);
}

/* what to say: one message per kind, at most */
function messages(ops, data, user, branch, cfg) {
  const who = (user && (user.name || user.username)) || '';
  const where = branch && branch.id !== 'main' && branch.name ? ' — ' + branch.name : '';
  const out = [];

  if (cfg.actIssue) {
    const iss = added(ops, 'issuances', data);
    const sales = new Map();
    iss.forEach(i => { const k = i.number + '|' + i.customerId + '|' + String(i.date || '').slice(0, 10); if (!sales.has(k)) sales.set(k, []); sales.get(k).push(i); });
    const list = [...sales.values()];
    if (list.length) {
      const pays = added(ops, 'payments', data);
      const paidNow = pays.reduce((a, p) => a + N(p.amount), 0);
      if (list.length === 1) {
        const lines = list[0], f = lines[0];
        const items = lines.map(l => clip(l.productName, 24) + ' × ' + qty(l.quantity)).slice(0, 3).join('، ') + (lines.length > 3 ? ' +' + (lines.length - 3) : '');
        const total = lines.reduce((a, l) => a + N(l.total), 0);
        out.push({ kind: 'issue', title: '📦 توريد جديد' + (f.number ? ' #' + f.number : '') + ' — ' + clip(f.customerName || 'مركز', 30),
          body: items + ' · ' + money(total) + (paidNow > 0 ? ' · اتحصّل ' + money(paidNow) : '') + (who ? ' · ' + who : '') + where, url: './?go=issuances' });
      } else {
        const total = list.reduce((a, s) => a + s.reduce((b, l) => b + N(l.total), 0), 0);
        out.push({ kind: 'issue', title: '📦 ' + list.length + ' توريدات جديدة', body: money(total) + (who ? ' · ' + who : '') + where, url: './?go=issuances' });
      }
    }
  }

  if (cfg.actPay) {
    /* a collection on its own (one that came with a new supply is already in that message) */
    const withSale = !!(cfg.actIssue && added(ops, 'issuances', data).length);
    const pays = withSale ? [] : added(ops, 'payments', data).filter(p => N(p.amount) > 0);
    if (pays.length === 1) {
      const p = pays[0];
      const cname = p.customerName || (((data && data.customers) || []).find(c => c && c.id === p.customerId) || {}).name || '';
      out.push({ kind: 'pay', title: '💰 تحصيل ' + money(p.amount) + (cname ? ' — ' + clip(cname, 30) : ''),
        body: [p.method ? clip(p.method, 20) : '', p.note ? clip(p.note, 60) : '', who].filter(Boolean).join(' · ') + where, url: './?go=payments' });
    } else if (pays.length > 1) {
      out.push({ kind: 'pay', title: '💰 ' + pays.length + ' تحصيلات — ' + money(pays.reduce((a, p) => a + N(p.amount), 0)), body: (who || '') + where, url: './?go=payments' });
    }
  }

  if (cfg.actExpense) {
    const exps = added(ops, 'expenses', data).filter(e => e.kind !== 'purchase' && N(e.amount) > 0);
    if (exps.length === 1) {
      const e = exps[0];
      out.push({ kind: 'expense', title: '💸 مصروف ' + money(e.amount) + (e.category ? ' — ' + clip(e.category, 30) : ''),
        body: [e.description ? clip(e.description, 80) : '', who].filter(Boolean).join(' · ') + where, url: './?go=expenses' });
    } else if (exps.length > 1) {
      out.push({ kind: 'expense', title: '💸 ' + exps.length + ' مصروفات — ' + money(exps.reduce((a, e) => a + N(e.amount), 0)), body: (who || '') + where, url: './?go=expenses' });
    }
  }
  return out;
}

/* who gets it: every active user who works in this branch and may see this kind of record (his pages), except the
   one who made the change. An expense needs «المصروفات» (a user who only sees purchases does not get it). */
const COLL = { expense: 'expenses', issue: 'issuances', pay: 'payments' };
function mayRead(u, coll) {
  const p = perms.policyFor(u);
  if (p.admin) return true;
  if (!p.read.has(coll)) return false;
  return !(coll === 'expenses' && p.rows.expenses === 'purchase');
}
function recipients(mainData, branchId, user, canUse, coll) {
  return ((mainData && mainData.users) || []).filter(u => u && !u.disabled && u.active !== false && (!user || String(u.id) !== String(user.id)) &&
    (!canUse || canUse(u, branchId)) && (!coll || mayRead(u, coll))).map(u => u.id);
}

/* called after a change was accepted. Never throws, never waits the request. */
function onOps(ctx, branch, ops, user) {
  try {
    if (!ops || !ops.cols || !(ops.cols.expenses || ops.cols.issuances || ops.cols.payments)) return [];
    const cfg = config();
    if (!cfg.actExpense && !cfg.actIssue && !cfg.actPay) return [];
    const msgs = messages(ops, branch.data, user, branch, cfg);
    if (!msgs.length) return [];
    msgs.forEach(m => {
      m.to = recipients(ctx.mainData, branch.id, user, ctx.canUse, COLL[m.kind]);
      if (m.to.length) webpush.send(m.to, { title: m.title, body: m.body, url: m.url, tag: 'act-' + m.kind + '-' + Date.now() }).catch(e => console.error('[activity] push', e.message));
    });
    return msgs;
  } catch (e) { console.error('[activity] onOps', e.message); return []; }
}

module.exports = { config, setConfig, onOps, messages, recipients };

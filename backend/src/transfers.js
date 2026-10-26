'use strict';
/* ════════════════════════════════════════════════════════════════════
   ERP · التحويلات بين الفروع (4.34 · المرحلة 4)
   ------------------------------------------------------------------
   · One document per transfer (main database, table branch_transfers):
       بضاعة: الأصناف والكميات · فلوس: المبلغ — من فرع إلى فرع.
   · «إرسال»: the goods leave the sending branch's stock (or the money its
     cash) — a stock move «منصرف · تحويل» / a cash move «خارج» — and (4.50)
     enter the receiving branch in the same action (a product missing there
     is made with the same name / unit / code / cost). A transfer left
     «في الطريق» from before 4.50 is still received with «تأكيد الاستلام».
     «إلغاء» (before it is received): everything goes back to the sender.
   · A transfer is never a sale, a purchase, an expense or a profit: stock
     moves carry kind:'transfer' (left out of consumption), cash moves live
     in the branch's own list _cashMoves and only change the cash balance.
   · Never applied twice: every step writes records with fixed ids made from
     the transfer id, and checks them first. Each step changes ONE branch
     file in one transaction; the document moves sending → sent →
     receiving → received (or cancelling → cancelled). If the server stops
     in the middle, recover() at start finishes or undoes the step.
════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const { db } = require('../db');
const branches = require('./branches');

db.exec(`CREATE TABLE IF NOT EXISTS branch_transfers (
  id TEXT PRIMARY KEY, number INTEGER NOT NULL, kind TEXT NOT NULL, from_branch TEXT NOT NULL, to_branch TEXT NOT NULL,
  status TEXT NOT NULL, data TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_branch_transfers_status ON branch_transfers(status)');

class TransferError extends Error { constructor(code, msg, status) { super(msg); this.code = code; this.status = status || 400; } }
const now = () => new Date().toISOString();
const N = v => { v = Number(v); return Number.isFinite(v) ? v : 0; };
const RID = /^[A-Za-z0-9_-]{8,64}$/;
/* the pre-4.50 two-step flow (send now, «تأكيد الاستلام» later) — kept only so transfers still «في الطريق» from before
   4.50 (receive / cancel) stay covered by the tests */
const TWO_STEP = process.env.TRANSFERS_TWO_STEP === '1';

function row(r) {
  if (!r) return null;
  let d; try { d = r.data ? JSON.parse(r.data) || {} : {}; } catch (_) { d = {}; }
  return Object.assign(d, { id: r.id, number: r.number, kind: r.kind, from: r.from_branch, to: r.to_branch, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
}
function get(id) { return row(db.prepare('SELECT * FROM branch_transfers WHERE id = ?').get(String(id || ''))); }
function setStatus(id, status, extra) {
  const cur = get(id); if (!cur) return null;
  const keep = Object.assign({}, cur, extra || {});
  ['id', 'number', 'kind', 'from', 'to', 'status', 'createdAt', 'updatedAt'].forEach(k => delete keep[k]);
  db.prepare('UPDATE branch_transfers SET status = ?, data = ?, updated_at = ? WHERE id = ?').run(status, JSON.stringify(keep), now(), id);
  return get(id);
}

/* who may do what */
function pagesOf(u) { return u && u.role === 'admin' ? null : require('./permissions').pagesOf(u); }
function canStock(u) { const p = pagesOf(u); return !p || p.includes('inventory') || p.includes('stock'); }
function canCash(u) { const p = pagesOf(u); return !p || p.includes('payments') || p.includes('expenses'); }
function mayDo(u, kind, branch) {
  if (!branches.canUse(u, branch)) return false;
  return kind === 'cash' ? canCash(u) : canStock(u);
}

/* the store helpers: a diff in the app's wire format, applied by the branch's own store (audit with the real user) */
const col = (added, modified) => ({ added: added || [], removed: [], modified: (modified || []).map(m => ({ k: 'i:' + m.id, f: Object.keys(m.after), b: m.before, a: m.after })) });
function applyTo(branchId, u, w) {
  const st = branches.storeOf(branchId);
  if (!st) throw new TransferError('branch_not_found', 'الفرع مش موجود', 404);
  const sys = Object.assign({}, u, { role: 'admin' });        // the checks were done here; the audit keeps the user's name
  return st.apply(sys, Object.assign({ cols: {}, sets: {}, keys: {} }, w));
}
const dataOf = id => { const st = branches.storeOf(id); return st ? st.data() : {}; };
const has = (arr, id) => (Array.isArray(arr) ? arr : []).some(x => x && x.id === id);

/* ── the effects of each step (fixed ids → never twice) ── */
function moveId(t, i, tag) { return 'sm_tr_' + t.id + '_' + i + '_' + tag; }
function cashId(t, tag) { return 'cm_' + t.id + '_' + tag; }
function label(t, dir) {
  const other = branches.get(dir === 'out' ? t.to : t.from);
  return 'تحويل بين الفروع #' + t.number + (dir === 'out' ? ' ← إلى ' : ' ← من ') + ((other && other.name) || '');
}
function stockOut(t, u, tag, sign) {           // sign -1: send (out) · +1: back to the sender (cancel)
  const d = dataOf(t.from);
  if (has(d.stockMoves, moveId(t, 0, tag))) return false;
  const prod = new Map((d.products || []).map(p => [String(p.id), p]));
  const mods = [], moves = [], date = now().slice(0, 10);
  t.items.forEach((it, i) => {
    const p = prod.get(String(it.productId));
    if (!p) throw new TransferError('no_product', 'الصنف مش موجود في الفرع ده: ' + (it.name || it.productId));
    const q = N(p.quantity);
    mods.push({ id: p.id, before: { quantity: q }, after: { quantity: q + sign * it.qty } });
    moves.push({ id: moveId(t, i, tag), productId: p.id, productName: p.name, type: sign < 0 ? 'out' : 'in', quantity: it.qty, date, kind: 'transfer', transferId: t.id,
      reference: sign < 0 ? label(t, 'out') : 'رجوع ' + label(t, 'out') + ' (اتلغى)', note: t.note || '', createdAt: Date.now() });
  });
  applyTo(t.from, u, { cols: { products: col(null, mods), stockMoves: col(moves) } });
  return true;
}
function stockIn(t, u) {
  const d = dataOf(t.to);
  if (has(d.stockMoves, moveId(t, 0, 'i'))) return false;
  const prods = d.products || [];
  const norm = s => String(s || '').trim().replace(/\s+/g, ' ');
  const adds = [], mods = [], moves = [], date = now().slice(0, 10), seen = new Map();
  t.items.forEach((it, i) => {
    let p = (it.sku && prods.find(x => x && x.sku && norm(x.sku) === norm(it.sku))) ||
      prods.find(x => x && norm(x.name) === norm(it.name) && norm(x.unit) === norm(it.unit)) || seen.get(norm(it.name) + '|' + norm(it.unit));
    if (!p) {
      p = { id: 'p_tr_' + t.id + '_' + i, name: it.name, unit: it.unit || '', sku: it.sku || '', category: it.category || '', cost: N(it.cost), price: N(it.price), minQuantity: 0, quantity: it.qty, createdAt: Date.now() };
      adds.push(p); seen.set(norm(it.name) + '|' + norm(it.unit), p);
    } else if (adds.includes(p)) p.quantity = N(p.quantity) + it.qty;
    else {
      const m = mods.find(x => x.id === p.id);
      if (m) m.after.quantity += it.qty; else mods.push({ id: p.id, before: { quantity: N(p.quantity) }, after: { quantity: N(p.quantity) + it.qty } });
    }
    moves.push({ id: moveId(t, i, 'i'), productId: p.id, productName: p.name, type: 'in', quantity: it.qty, date, kind: 'transfer', transferId: t.id, reference: label(t, 'in'), note: t.note || '', createdAt: Date.now() });
  });
  applyTo(t.to, u, { cols: { products: col(adds, mods), stockMoves: col(moves) } });
  return true;
}
function cashMove(t, u, branchId, tag, dir, why) {
  const d = dataOf(branchId);
  const list = (d.settings && d.settings._cashMoves) || [];
  if (has(list, cashId(t, tag))) return false;
  applyTo(branchId, u, { sets: { _cashMoves: col([{ id: cashId(t, tag), transferId: t.id, number: t.number, dir, amount: t.amount, date: now().slice(0, 10),
    other: dir === 'out' ? t.to : t.from, otherName: ((branches.get(dir === 'out' ? t.to : t.from) || {}).name) || '', note: why || t.note || '', at: Date.now() }]) } });
  return true;
}
const sendEffect = (t, u) => (t.kind === 'cash' ? cashMove(t, u, t.from, 'o', 'out') : stockOut(t, u, 'o', -1));
const receiveEffect = (t, u) => (t.kind === 'cash' ? cashMove(t, u, t.to, 'i', 'in') : stockIn(t, u));
const cancelEffect = (t, u) => (t.kind === 'cash' ? cashMove(t, u, t.from, 'r', 'in', 'رجوع تحويل #' + t.number + ' (اتلغى)') : stockOut(t, u, 'r', +1));
const sentDone = t => (t.kind === 'cash' ? has(((dataOf(t.from).settings || {})._cashMoves), cashId(t, 'o')) : has(dataOf(t.from).stockMoves, moveId(t, 0, 'o')));
const receivedDone = t => (t.kind === 'cash' ? has(((dataOf(t.to).settings || {})._cashMoves), cashId(t, 'i')) : has(dataOf(t.to).stockMoves, moveId(t, 0, 'i')));
const cancelledDone = t => (t.kind === 'cash' ? has(((dataOf(t.from).settings || {})._cashMoves), cashId(t, 'r')) : has(dataOf(t.from).stockMoves, moveId(t, 0, 'r')));

/* ── the API ── */
function list(u) {
  const ids = new Set(branches.idsFor(u));
  return db.prepare('SELECT * FROM branch_transfers ORDER BY number DESC LIMIT 400').all().map(row)
    .filter(t => ids.has(t.from) || ids.has(t.to)).filter(t => t.status !== 'sending');
}
function create(u, b) {
  b = b || {};
  const kind = b.kind === 'cash' ? 'cash' : 'stock', from = String(b.from || ''), to = String(b.to || '');
  const rid = String(b.rid || '');
  if (!RID.test(rid)) throw new TransferError('bad_request', 'طلب غير صالح');
  const id = 'tr_' + crypto.createHash('sha256').update(u.id + '|' + rid).digest('hex').slice(0, 20);
  const was = get(id);
  if (was) return { transfer: was, dup: true };                     // the same request again (a retry) — nothing happens twice
  const fb = branches.get(from), tb = branches.get(to);
  if (!fb || !tb || !fb.active || !tb.active) throw new TransferError('branch_not_found', 'اختار فرع شغّال', 404);
  if (from === to) throw new TransferError('same_branch', 'مينفعش تحوّل لنفس الفرع');
  if (!mayDo(u, kind, from)) throw new TransferError('forbidden', 'مالكش صلاحية تحوّل من الفرع ده', 403);
  const note = String(b.note || '').replace(/[<>]/g, '').slice(0, 300);
  const doc = { kind, from, to, note, fromName: fb.name, toName: tb.name, by: { id: u.id, name: u.name || u.username }, sentAt: now() };
  if (kind === 'cash') {
    const amount = Math.round(N(b.amount) * 100) / 100;
    if (!(amount > 0)) throw new TransferError('bad_amount', 'اكتب المبلغ');
    doc.amount = amount;
  } else {
    const src = dataOf(from), prod = new Map((src.products || []).map(p => [String(p.id), p]));
    const want = new Map();
    (Array.isArray(b.items) ? b.items : []).slice(0, 200).forEach(it => { const q = N(it && it.qty); if (q > 0 && it.productId) want.set(String(it.productId), (want.get(String(it.productId)) || 0) + q); });
    if (!want.size) throw new TransferError('no_items', 'اختار صنف وكمية');
    doc.items = [...want].map(([pid, qty]) => {
      const p = prod.get(pid);
      if (!p) throw new TransferError('no_product', 'الصنف مش موجود في الفرع ده');
      if (qty > N(p.quantity) + 1e-9) throw new TransferError('not_enough', 'الكمية مش موجودة: ' + p.name + ' — المتاح ' + N(p.quantity) + ' ' + (p.unit || ''));
      return { productId: p.id, name: p.name, unit: p.unit || '', sku: p.sku || '', category: p.category || '', cost: N(p.cost), price: N(p.price), qty };
    });
  }
  const number = (db.prepare('SELECT MAX(number) AS n FROM branch_transfers').get().n || 0) + 1;
  const t0 = now();
  db.prepare('INSERT INTO branch_transfers (id, number, kind, from_branch, to_branch, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, number, kind, from, to, 'sending', JSON.stringify(doc), t0, t0);
  try { sendEffect(get(id), u); }
  catch (e) { db.prepare('DELETE FROM branch_transfers WHERE id = ?').run(id); throw e; }   // nothing left the branch → no document
  setStatus(id, 'sent');
  if (TWO_STEP) return { transfer: get(id) };
  /* 4.50 · one step: what leaves one branch enters the other at the same moment (it used to wait for «تأكيد الاستلام»
     in the receiving branch, so the goods / money were taken off one side and never showed on the other).
     If entering fails for any reason the transfer simply stays «في الطريق» and can still be received or cancelled. */
  try {
    setStatus(id, 'receiving');
    receiveEffect(get(id), u);
    return { transfer: setStatus(id, 'received', { receivedBy: { id: u.id, name: u.name || u.username }, receivedAt: now(), auto: true }) };
  } catch (e) {
    console.error('[transfers] auto-receive', id, e.message);
    return { transfer: setStatus(id, 'sent') };
  }
}
function receive(u, id) {
  const t = get(id);
  if (!t || t.status === 'sending') throw new TransferError('not_found', 'التحويل مش موجود', 404);
  if (t.status === 'received') return { transfer: t, dup: true };
  if (t.status !== 'sent') throw new TransferError('bad_state', 'التحويل ده ' + (t.status === 'cancelled' ? 'اتلغى' : 'مش مستني استلام'));
  if (!mayDo(u, t.kind, t.to)) throw new TransferError('forbidden', 'الاستلام من الفرع اللي رايح له التحويل', 403);
  setStatus(id, 'receiving');
  try { receiveEffect(t, u); }
  catch (e) { setStatus(id, 'sent'); throw e; }
  return { transfer: setStatus(id, 'received', { receivedBy: { id: u.id, name: u.name || u.username }, receivedAt: now() }) };
}
function cancel(u, id) {
  const t = get(id);
  if (!t || t.status === 'sending') throw new TransferError('not_found', 'التحويل مش موجود', 404);
  if (t.status === 'cancelled') return { transfer: t, dup: true };
  if (t.status !== 'sent') throw new TransferError('bad_state', t.status === 'received' ? 'اتستلم خلاص — مينفعش يتلغى' : 'مينفعش يتلغى دلوقتي');
  if (!(u.role === 'admin' || (t.by && t.by.id === u.id && mayDo(u, t.kind, t.from)))) throw new TransferError('forbidden', 'الإلغاء للي بعته أو للمدير', 403);
  setStatus(id, 'cancelling');
  try { cancelEffect(t, u); }
  catch (e) { setStatus(id, 'sent'); throw e; }
  return { transfer: setStatus(id, 'cancelled', { cancelledBy: { id: u.id, name: u.name || u.username }, cancelledAt: now() }) };
}

/* the server stopped in the middle of a step → finish it or undo it (at start) */
function recover() {
  const fixed = [];
  db.prepare("SELECT * FROM branch_transfers WHERE status IN ('sending', 'receiving', 'cancelling')").all().map(row).forEach(t => {
    try {
      if (t.status === 'sending') { if (sentDone(t)) setStatus(t.id, 'sent'); else db.prepare('DELETE FROM branch_transfers WHERE id = ?').run(t.id); }
      else if (t.status === 'receiving') setStatus(t.id, receivedDone(t) ? 'received' : 'sent');
      else if (t.status === 'cancelling') setStatus(t.id, cancelledDone(t) ? 'cancelled' : 'sent');
      fixed.push(t.id);
    } catch (e) { console.error('[transfers] recover', t.id, e.message); }
  });
  if (fixed.length) console.log('[transfers] finished / undid', fixed.length, 'interrupted step(s)');
  return fixed;
}

module.exports = { list, get, create, receive, cancel, recover, TransferError };

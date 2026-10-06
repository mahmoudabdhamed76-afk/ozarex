/* Thin HTTP client that speaks the app's real wire format (js/axcore.js «wire»). */
import { randomUUID } from 'node:crypto';
import { ADMIN_PASSWORD } from './server.mjs';

export async function req(base, method, path, { token, body, headers } = {}) {
  const h = Object.assign({}, headers || {});
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) { /* not json */ }
  return { status: r.status, json, text, headers: r.headers };
}

export async function login(base, username, password) {
  const r = await req(base, 'POST', '/api/login', { body: { username, password } });
  return { status: r.status, token: r.json && r.json.token, user: r.json && r.json.user, body: r.json };
}
export const adminLogin = base => login(base, 'admin', ADMIN_PASSWORD);

/* one collection change: added records, removed ids, modified { id, before, after } */
export function col({ added = [], removed = [], modified = [] } = {}) {
  return {
    added,
    removed: removed.map(id => 'i:' + id),
    modified: modified.map(m => ({ k: 'i:' + m.id, f: Object.keys(m.after), b: m.before || {}, a: m.after }))
  };
}
export function ops({ cols = {}, sets = {}, keys = {}, counters = null } = {}) {
  const k = {}; Object.keys(keys).forEach(n => { k[n] = { a: keys[n] }; });
  return { cols, sets, keys: k, counters: counters ? { a: counters } : null };
}
export async function send(base, token, o, opId = randomUUID()) {
  return req(base, 'POST', '/api/ops', { token, body: { ops: o, opId, cid: 'test' } });
}
export async function data(base, token) {
  const r = await req(base, 'GET', '/api/data', { token });
  if (r.status !== 200) throw new Error('GET /api/data → ' + r.status);
  return r.json;
}

/* admin creates a user; returns a logged-in token for that user */
export async function createUser(base, adminToken, user) {
  const r = await send(base, adminToken, ops({ cols: { users: col({ added: [user] }) } }));
  if (r.status !== 200) throw new Error('create user → ' + r.status + ' ' + r.text);
  const l = await login(base, user.username, user.password);
  if (l.status !== 200) throw new Error('user login → ' + l.status);
  return l.token;
}

export const SALES = { id: 'u_sales', username: 'sara', password: 'Sales-Test-Pass-77', name: 'سارة', role: 'sales', pages: ['dashboard', 'issuances'], approval: 'sensitive' };

/* a small business: 2 customers, 2 products, 1 supplier, 1 invoice, 1 payment */
export function seedOps() {
  return ops({
    cols: {
      customers: col({ added: [
        { id: 'c1', name: 'مركز النور', phone: '01000000001', balance: 1000, customPrices: {} },
        { id: 'c2', name: 'مركز الشفاء', phone: '01000000002', balance: 0, customPrices: {} }] }),
      products: col({ added: [
        { id: 'p1', name: 'ورق A4', unit: 'ورقة', quantity: 500, minQuantity: 50, cost: 80, price: 120 },
        { id: 'p2', name: 'فيلم 35×43', unit: 'فيلم', quantity: 200, minQuantity: 20, cost: 30, price: 45 }] }),
      suppliers: col({ added: [{ id: 's1', name: 'شركة الورق', phone: '0220000000', openingBalance: 0 }] }),
      invoices: col({ added: [{ id: 'i1', number: 1001, customerId: 'c1', date: '2026-10-01', subtotal: 1200, total: 1200, paid: 200, status: 'partial',
        items: [{ productId: 'p1', name: 'ورق A4', qty: 10, price: 120, total: 1200 }], createdAt: 1 }] }),
      payments: col({ added: [{ id: 'pay1', customerId: 'c1', amount: 200, date: '2026-10-02', method: 'نقدي' }] })
    },
    counters: { invoice: 1001 }
  });
}

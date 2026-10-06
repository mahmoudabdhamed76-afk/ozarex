/* Large synthetic dataset (the one used in the audit), deterministic.
   400 customers · 300 products · 6,000 invoices · 6,000 issuances (with items)
   6,000 payments · 5,000 audit entries · script-injection probes in names/notes.
   Writes fixtures/large-dataset.json.gz — a full blob for POST /api/data (restore).
   Run:  node fixtures/gen-large-dataset.mjs   (or: npm run fixture) */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
export const SIZES = { customers: 400, products: 300, invoices: 6000, issuances: 6000, payments: 6000, audit: 5000 };

export function buildLargeDataset(sizes = SIZES) {
  let seed = 20261006;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const date = () => `2026-${String(int(1, 9)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;

  const customers = Array.from({ length: sizes.customers }, (_, i) => ({ id: `c${i}`, name: i === 0 ? XSS : `مركز ${i}`, phone: '0100000' + String(i).padStart(4, '0'), balance: 0, customPrices: {} }));
  const products = Array.from({ length: sizes.products }, (_, i) => ({ id: `p${i}`, name: i === 0 ? XSS : `ورق صنف ${i}`, unit: 'ورقة', quantity: 10000, minQuantity: 50, cost: 50, price: 80 }));
  const invoices = Array.from({ length: sizes.invoices }, (_, i) => {
    const c = pick(customers), p = pick(products), q = int(1, 50);
    return { id: `i${i}`, number: 1000 + i, customerId: c.id, customerName: c.name, date: date(), createdAt: 1767225600000 + i * 60000,
      items: [{ productId: p.id, productName: p.name, name: p.name, quantity: q, qty: q, price: 80, total: q * 80 }],
      subtotal: q * 80, total: q * 80, paid: 0, status: 'unpaid', notes: i === 0 ? XSS : '' };
  });
  const issuances = Array.from({ length: sizes.issuances }, (_, i) => {
    const c = pick(customers), p = pick(products), q = int(1, 50);
    return { id: `is${i}`, number: 1000 + i, customerId: c.id, customerName: c.name, productId: p.id, productName: p.name, quantity: q, unit: 'ورقة',
      unitPrice: 80, total: q * 80, paid: 0, date: date(), createdAt: 1767225600000 + i * 60000,
      items: [{ productId: p.id, productName: p.name, name: p.name, quantity: q, qty: q, unitPrice: 80, total: q * 80 }] };
  });
  const payments = Array.from({ length: sizes.payments }, (_, i) => { const c = pick(customers); return { id: `pay${i}`, customerId: c.id, customerName: c.name, amount: int(50, 900), date: date(), method: 'نقدي', createdAt: 1767225600000 + i * 60000 }; });
  const auditLog = Array.from({ length: sizes.audit }, (_, i) => ({ id: `a${i}`, timestamp: 1790000000000 + i * 1000, userId: 'u1', userName: 'المدير', operation: 'add', table: 'invoices', recordId: `i${i}`, recordLabel: `فاتورة ${i}`, after: { total: 100 } }));
  return {
    users: [{ id: 'u1', username: 'admin', name: 'المدير', role: 'admin' }],
    customers, products, suppliers: [{ id: 's0', name: XSS, phone: '0100' }], invoices, issuances, payments,
    expenses: [{ id: 'e0', description: XSS, amount: 10, date: '2026-09-01', category: XSS }],
    stockMoves: [], bankTransfers: [], supplierPayments: [], notes: [], auditLog, employees: [], salaryRuns: [],
    settings: { companyName: 'شركة تجربة كبيرة', currency: 'جنيه' },
    counters: { invoice: 1000 + sizes.invoices, issuance: 1000 + sizes.issuances, purchase: 1000 }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'large-dataset.json.gz');
  const json = JSON.stringify(buildLargeDataset());
  writeFileSync(out, gzipSync(Buffer.from(json), { level: 9 }));
  console.log(`wrote ${out} (${(json.length / 1e6).toFixed(2)} MB raw)`);
}

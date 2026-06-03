'use strict';

const { db } = require('../db');

const tables = {
  users: { cols: ['id','username','password','name','role','created_at','updated_at'], json: [] },
  customers: { cols: ['id','name','phone','address','email','notes','opening_balance','data','created_at','updated_at'], json: ['data'] },
  suppliers: { cols: ['id','name','phone','address','email','notes','opening_balance','data','created_at','updated_at'], json: ['data'] },
  products: { cols: ['id','name','sku','category','unit','price','cost','stock','min_stock','data','created_at','updated_at'], json: ['data'] },
  employees: { cols: ['id','name','phone','position','salary','hire_date','notes','data','created_at','updated_at'], json: ['data'] },
  expenses: { cols: ['id','description','amount','category','date','notes','data','created_at'], json: ['data'] },
  payments: { cols: ['id','customer_id','invoice_id','amount','date','method','notes','data','created_at'], json: ['data'] },
  supplier_payments: { cols: ['id','supplier_id','amount','date','method','notes','data','created_at'], json: ['data'] },
  stock_moves: { cols: ['id','product_id','qty','type','reference','date','notes','data','created_at'], json: ['data'] },
  bank_transfers: { cols: ['id','amount','date','from_account','to_account','notes','data','created_at'], json: ['data'] },
  salary_runs: { cols: ['id','employee_id','amount','date','period','notes','data','created_at'], json: ['data'] },
  notes: { cols: ['id','title','body','pinned','data','created_at','updated_at'], json: ['data'] }
};

const blobToTable = {
  users: 'users', customers: 'customers', suppliers: 'suppliers',
  products: 'products', employees: 'employees', expenses: 'expenses',
  payments: 'payments', supplierPayments: 'supplier_payments',
  stockMoves: 'stock_moves', bankTransfers: 'bank_transfers',
  salaryRuns: 'salary_runs', notes: 'notes'
};

function unpackJson(row, jsonCols) {
  const out = { ...row };
  for (const k of jsonCols) {
    if (typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch (_) {}
    }
  }
  return out;
}

function camelToSnake(s) { return s.replace(/[A-Z]/g, m => '_' + m.toLowerCase()); }
function snakeToCamel(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function snakeKeys(o) { const r = {}; for (const k of Object.keys(o)) r[camelToSnake(k)] = o[k]; return r; }
function camelKeys(o) { const r = {}; for (const k of Object.keys(o)) r[snakeToCamel(k)] = o[k]; return r; }

function listInvoices() {
  const heads = db.prepare(`SELECT * FROM invoices ORDER BY date DESC, id DESC`).all();
  const itemsStmt = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`);
  return heads.map(h => {
    const items = itemsStmt.all(h.id).map(it => {
      const x = unpackJson(it, ['data']);
      return { productId: x.product_id, name: x.name, qty: x.qty, price: x.price, total: x.total, ...(x.data || {}) };
    });
    const obj = unpackJson(h, ['data']);
    return {
      id: obj.id, number: obj.number, customerId: obj.customer_id,
      date: obj.date, subtotal: obj.subtotal, discount: obj.discount,
      tax: obj.tax, total: obj.total, paid: obj.paid, status: obj.status,
      notes: obj.notes, items, ...(obj.data || {})
    };
  });
}

function listIssuances() {
  const heads = db.prepare(`SELECT * FROM issuances ORDER BY date DESC, id DESC`).all();
  const itemsStmt = db.prepare(`SELECT * FROM issuance_items WHERE issuance_id = ?`);
  return heads.map(h => {
    const items = itemsStmt.all(h.id).map(it => {
      const x = unpackJson(it, ['data']);
      return { productId: x.product_id, name: x.name, qty: x.qty, ...(x.data || {}) };
    });
    const obj = unpackJson(h, ['data']);
    return { id: obj.id, number: obj.number, customerId: obj.customer_id, date: obj.date, notes: obj.notes, items, ...(obj.data || {}) };
  });
}

function exportBlob() {
  const blob = {};
  for (const [blobKey, tableName] of Object.entries(blobToTable)) {
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    const jsonCols = tables[tableName].json;
    blob[blobKey] = rows.map(r => {
      const obj = unpackJson(r, jsonCols);
      if (obj.data && typeof obj.data === 'object') {
        const merged = { ...obj.data, ...obj };
        delete merged.data;
        return camelKeys(merged);
      }
      delete obj.data;
      return camelKeys(obj);
    });
  }
  blob.invoices = listInvoices();
  blob.issuances = listIssuances();
  // Audit log: the full frontend entry is stored as JSON in `details`.
  // Reconstruct it so all fields (timestamp, before/after, suspicionFlags...) survive.
  blob.auditLog = db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 5000`).all().map(r => {
    if (r.details) {
      try {
        const full = JSON.parse(r.details);
        if (full && typeof full === 'object') return full;
      } catch (_) {}
    }
    return {
      id: r.entity_id || ('au_' + r.id),
      userId: r.user_id, operation: r.action, table: r.entity,
      recordId: r.entity_id, createdAt: r.created_at
    };
  });

  const sRows = db.prepare(`SELECT key, value FROM settings`).all();
  blob.settings = {};
  for (const r of sRows) {
    try { blob.settings[r.key] = JSON.parse(r.value); } catch (_) { blob.settings[r.key] = r.value; }
  }
  const cRows = db.prepare(`SELECT name, value FROM counters`).all();
  blob.counters = {};
  for (const r of cRows) blob.counters[r.name] = r.value;

  for (const k of ['users','customers','suppliers','products','employees','expenses','payments','supplierPayments','stockMoves','bankTransfers','salaryRuns','notes','invoices','issuances','auditLog']) {
    if (!Array.isArray(blob[k])) blob[k] = [];
  }
  // Frontend reads stock move quantity as `quantity`; expose both for compatibility.
  for (const m of blob.stockMoves) {
    if (m.quantity === undefined && m.qty !== undefined) m.quantity = m.qty;
  }
  if (!blob.counters.invoice) blob.counters.invoice = 1000;
  if (!blob.counters.issuance) blob.counters.issuance = 1000;
  if (!blob.counters.purchase) blob.counters.purchase = 1000;
  for (const c of blob.customers) {
    if (!c.customPrices) c.customPrices = {};
  }
  return blob;
}

// Columns that must never be NULL — coerce to a numeric default per table.
// Prevents "NOT NULL constraint failed" errors (e.g. stock_moves.qty).
const NUMERIC_REQUIRED = {
  stock_moves:       { qty: 0 },
  payments:          { amount: 0 },
  supplier_payments: { amount: 0 },
  expenses:          { amount: 0 },
  bank_transfers:    { amount: 0 },
  salary_runs:       { amount: 0 }
};

function toNumber(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Convert ANY JS value into something SQLite can bind:
// - null/undefined        -> null
// - number/string         -> as-is
// - boolean               -> 1 / 0
// - object/array          -> JSON string
// This prevents "Provided value cannot be bound to SQLite" (HTTP 500).
function toSqliteValue(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? v : null;
  if (t === 'string') return v;
  if (t === 'boolean') return v ? 1 : 0;
  if (t === 'bigint') return Number(v);
  // object, array, function, symbol -> stringify safely
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

function insertGeneric(tableName, item, cfg) {
  const row = snakeKeys(item);
  const knownCols = new Set(cfg.cols);

  // Alias handling: frontend uses `quantity` for stock moves, DB column is `qty`.
  if (tableName === 'stock_moves') {
    if (row.qty === undefined || row.qty === null || row.qty === '') {
      if (row.quantity !== undefined) row.qty = row.quantity;
    }
    delete row.quantity; // don't leak into data blob
  }

  const extras = {};
  for (const k of Object.keys(row)) {
    if (!knownCols.has(k) && k !== 'customPrices') extras[k] = row[k];
  }
  if (item.customPrices) extras.customPrices = item.customPrices;
  if (Object.keys(extras).length > 0 && knownCols.has('data')) {
    row.data = JSON.stringify(extras);
  }

  // Coerce required numeric columns so they are always present and valid.
  const required = NUMERIC_REQUIRED[tableName];
  if (required) {
    for (const [col, def] of Object.entries(required)) {
      row[col] = toNumber(row[col], def);
    }
  }

  const cols = cfg.cols.filter(c => c in row);
  if (cols.length === 0) return;
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map(c => toSqliteValue(row[c]));
  db.prepare(`INSERT OR REPLACE INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
}

function insertInvoice(inv) {
  const knownHeader = new Set(['id','number','customer_id','customerId','date','subtotal','discount','tax','total','paid','status','notes','data','created_at','updated_at','createdAt','updatedAt','items']);
  const headerData = {};
  for (const k of Object.keys(inv)) {
    if (!knownHeader.has(k)) headerData[k] = inv[k];
  }
  db.prepare(`INSERT OR REPLACE INTO invoices (id, number, customer_id, date, subtotal, discount, tax, total, paid, status, notes, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      inv.id, inv.number ?? null,
      inv.customerId ?? inv.customer_id ?? null,
      inv.date, inv.subtotal ?? 0, inv.discount ?? 0, inv.tax ?? 0,
      inv.total ?? 0, inv.paid ?? 0, inv.status ?? 'open', inv.notes ?? null,
      Object.keys(headerData).length ? JSON.stringify(headerData) : null,
      inv.createdAt || inv.created_at || new Date().toISOString(),
      inv.updatedAt || inv.updated_at || new Date().toISOString()
    );
  const itemStmt = db.prepare(`INSERT INTO invoice_items (invoice_id, product_id, name, qty, price, total, data) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const it of (inv.items || [])) {
    const known = new Set(['productId','product_id','name','qty','price','total']);
    const d = {};
    for (const k of Object.keys(it)) { if (!known.has(k)) d[k] = it[k]; }
    itemStmt.run(inv.id, it.productId ?? it.product_id ?? null, it.name ?? null, it.qty ?? 0, it.price ?? 0, it.total ?? 0, Object.keys(d).length ? JSON.stringify(d) : null);
  }
}

function insertIssuance(iss) {
  const known = new Set(['id','number','customerId','customer_id','date','notes','items','data','createdAt','updatedAt','created_at','updated_at']);
  const headerData = {};
  for (const k of Object.keys(iss)) { if (!known.has(k)) headerData[k] = iss[k]; }
  db.prepare(`INSERT OR REPLACE INTO issuances (id, number, customer_id, date, notes, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(iss.id, iss.number ?? null, iss.customerId ?? iss.customer_id ?? null, iss.date, iss.notes ?? null,
      Object.keys(headerData).length ? JSON.stringify(headerData) : null,
      iss.createdAt || iss.created_at || new Date().toISOString(),
      iss.updatedAt || iss.updated_at || new Date().toISOString());
  const itemStmt = db.prepare(`INSERT INTO issuance_items (issuance_id, product_id, name, qty, data) VALUES (?, ?, ?, ?, ?)`);
  for (const it of (iss.items || [])) {
    const k2 = new Set(['productId','product_id','name','qty']);
    const d = {};
    for (const k of Object.keys(it)) { if (!k2.has(k)) d[k] = it[k]; }
    itemStmt.run(iss.id, it.productId ?? it.product_id ?? null, it.name ?? null, it.qty ?? 0, Object.keys(d).length ? JSON.stringify(d) : null);
  }
}

function importBlob(blob) {
  db.exec('BEGIN');
  try {
    for (const tableName of Object.values(blobToTable)) {
      db.prepare(`DELETE FROM ${tableName}`).run();
    }
    db.prepare(`DELETE FROM invoice_items`).run();
    db.prepare(`DELETE FROM invoices`).run();
    db.prepare(`DELETE FROM issuance_items`).run();
    db.prepare(`DELETE FROM issuances`).run();
    db.prepare(`DELETE FROM audit_log`).run();
    db.prepare(`DELETE FROM settings`).run();

    for (const [blobKey, tableName] of Object.entries(blobToTable)) {
      const items = Array.isArray(blob[blobKey]) ? blob[blobKey] : [];
      for (const item of items) insertGeneric(tableName, item, tables[tableName]);
    }
    for (const inv of (blob.invoices || [])) insertInvoice(inv);
    for (const iss of (blob.issuances || [])) insertIssuance(iss);

    const auditStmt = db.prepare(`INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const a of (blob.auditLog || [])) {
      if (!a || typeof a !== 'object') continue;
      // Store the entire frontend entry as JSON so nothing is lost.
      const fullJson = JSON.stringify(a);
      const createdAt = a.createdAt || a.created_at ||
        (typeof a.timestamp === 'number' ? new Date(a.timestamp).toISOString() : null) ||
        a.date || new Date().toISOString();
      auditStmt.run(
        a.userId || a.user_id || null,
        a.operation || a.action || null,
        a.table || a.entity || null,
        a.recordId || a.entityId || a.entity_id || null,
        fullJson,
        createdAt
      );
    }

    if (blob.settings && typeof blob.settings === 'object') {
      const sst = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);
      for (const [k, v] of Object.entries(blob.settings)) sst.run(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    if (blob.counters && typeof blob.counters === 'object') {
      const cst = db.prepare(`INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value`);
      for (const [n, v] of Object.entries(blob.counters)) cst.run(n, Number(v) || 0);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function defaultBlob() {
  return {
    users: [{ id: 'u1', username: 'admin', password: 'admin', name: 'المدير', role: 'admin' }],
    customers: [], products: [], invoices: [], payments: [],
    expenses: [], stockMoves: [], issuances: [], bankTransfers: [],
    suppliers: [], supplierPayments: [], notes: [], auditLog: [],
    employees: [], salaryRuns: [], settings: {},
    counters: { invoice: 1000, issuance: 1000, purchase: 1000 }
  };
}

module.exports = { exportBlob, importBlob, defaultBlob };

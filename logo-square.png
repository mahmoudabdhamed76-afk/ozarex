PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  email       TEXT,
  notes       TEXT,
  opening_balance REAL DEFAULT 0,
  data        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS suppliers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  email       TEXT,
  notes       TEXT,
  opening_balance REAL DEFAULT 0,
  data        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sku         TEXT,
  category    TEXT,
  unit        TEXT,
  price       REAL DEFAULT 0,
  cost        REAL DEFAULT 0,
  stock       REAL DEFAULT 0,
  min_stock   REAL DEFAULT 0,
  data        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  position    TEXT,
  salary      REAL DEFAULT 0,
  hire_date   TEXT,
  notes       TEXT,
  data        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id           TEXT PRIMARY KEY,
  number       INTEGER,
  customer_id  TEXT,
  date         TEXT NOT NULL,
  subtotal     REAL DEFAULT 0,
  discount     REAL DEFAULT 0,
  tax          REAL DEFAULT 0,
  total        REAL DEFAULT 0,
  paid         REAL DEFAULT 0,
  status       TEXT DEFAULT 'open',
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   TEXT NOT NULL,
  product_id   TEXT,
  name         TEXT,
  qty          REAL DEFAULT 0,
  price        REAL DEFAULT 0,
  total        REAL DEFAULT 0,
  data         TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS issuances (
  id           TEXT PRIMARY KEY,
  number       INTEGER,
  customer_id  TEXT,
  date         TEXT NOT NULL,
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issuance_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  issuance_id  TEXT NOT NULL,
  product_id   TEXT,
  name         TEXT,
  qty          REAL DEFAULT 0,
  data         TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT,
  invoice_id   TEXT,
  amount       REAL NOT NULL DEFAULT 0,
  date         TEXT NOT NULL,
  method       TEXT,
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id           TEXT PRIMARY KEY,
  supplier_id  TEXT,
  amount       REAL NOT NULL DEFAULT 0,
  date         TEXT NOT NULL,
  method       TEXT,
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  description  TEXT,
  amount       REAL NOT NULL DEFAULT 0,
  category     TEXT,
  date         TEXT NOT NULL,
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id           TEXT PRIMARY KEY,
  product_id   TEXT,
  qty          REAL NOT NULL DEFAULT 0,
  type         TEXT,
  reference    TEXT,
  date         TEXT NOT NULL,
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_transfers (
  id           TEXT PRIMARY KEY,
  amount       REAL NOT NULL DEFAULT 0,
  date         TEXT NOT NULL,
  from_account TEXT,
  to_account   TEXT,
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salary_runs (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT,
  amount       REAL NOT NULL DEFAULT 0,
  date         TEXT NOT NULL,
  period       TEXT,
  notes        TEXT,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id           TEXT PRIMARY KEY,
  title        TEXT,
  body         TEXT,
  pinned       INTEGER DEFAULT 0,
  data         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT,
  action       TEXT,
  entity       TEXT,
  entity_id    TEXT,
  details      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS counters (
  name         TEXT PRIMARY KEY,
  value        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS backups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  payload      TEXT NOT NULL
);

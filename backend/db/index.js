'use strict';

const fs   = require('node:fs');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('ERROR: Node.js 22.5+ required. Current:', process.version);
  process.exit(1);
}

// Allow override via DATA_DIR env var (important for Railway/Docker volume mounts)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'emdadx.db');
const SCHEMA   = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
const schemaSql = fs.readFileSync(SCHEMA, 'utf8');
db.exec(schemaSql);

const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  db.prepare(`INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)`)
    .run('u1', 'admin', 'admin', 'المدير', 'admin');
  console.log('🌱 Seeded default admin (admin/admin)');
}

const defaultCounters = [['invoice', 1000], ['issuance', 1000], ['purchase', 1000]];
const insCounter = db.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, ?)');
for (const [n, v] of defaultCounters) insCounter.run(n, v);

module.exports = { db, DB_FILE, DATA_DIR };

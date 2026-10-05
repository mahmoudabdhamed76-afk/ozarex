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
const DB_FILE  = path.join(DATA_DIR, 'erp.db');
const SCHEMA   = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
const schemaSql = fs.readFileSync(SCHEMA, 'utf8');
db.exec(schemaSql);

// 4.8 · users keep extra fields (the sections each user may open, what needs approval)
try {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('data')) db.exec('ALTER TABLE users ADD COLUMN data TEXT');
} catch (e) { console.error('users.data migration:', e.message); }

// 4.20 · a weak password (e.g. the first admin/admin) must be changed before anything else is allowed
// 4.20 · drop any settings row named like an object internal (could only have come from a crafted request)
try { db.exec("DELETE FROM settings WHERE key IN ('__proto__', 'constructor', 'prototype')"); } catch (e) {}
db.exec('CREATE TABLE IF NOT EXISTS user_flags (user_id TEXT PRIMARY KEY, must_change INTEGER NOT NULL DEFAULT 0)');

const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  /* 4.20 · a fresh install never opens with admin/admin: the first password comes from the
     ADMIN_PASSWORD variable, or a random one is made and written to the log + a file in DATA_DIR */
  let first = String(process.env.ADMIN_PASSWORD || '');
  let made = false;
  if (first.length < 6 && !(process.env.EMX_DEV_WEAK_OK === '1' && first)) { first = require('node:crypto').randomBytes(9).toString('base64url'); made = true; }
  db.prepare(`INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)`)
    .run('u1', 'admin', first, 'المدير', 'admin');
  if (made) {
    try { fs.writeFileSync(path.join(DATA_DIR, 'FIRST_ADMIN_PASSWORD.txt'), 'username: admin\npassword: ' + first + '\n(change it after the first login, then delete this file)\n', { mode: 0o600 }); } catch (e) {}
    console.log('====================================');
    console.log('  🌱 First admin  →  username: admin   password: ' + first);
    console.log('     (also saved in ' + path.join(DATA_DIR, 'FIRST_ADMIN_PASSWORD.txt') + ')');
    console.log('====================================');
  } else console.log('🌱 Seeded admin from ADMIN_PASSWORD');
}

const defaultCounters = [['invoice', 1000], ['issuance', 1000], ['purchase', 1000]];
const insCounter = db.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, ?)');
for (const [n, v] of defaultCounters) insCounter.run(n, v);

module.exports = { db, DB_FILE, DATA_DIR };

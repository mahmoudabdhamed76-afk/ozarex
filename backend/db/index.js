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

const schemaSql = fs.readFileSync(SCHEMA, 'utf8');
/* 4.32 · one opener for every database file: the main one (erp.db — the main branch, as it always was)
   and each branch's own file (DATA_DIR/branches/<id>.db, same tables, created empty on first use) */
function openDb(file) {
  const d = new DatabaseSync(file);
  d.exec(schemaSql);
  try {
    const cols = d.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!cols.includes('data')) d.exec('ALTER TABLE users ADD COLUMN data TEXT');
  } catch (e) { console.error('users.data migration:', e.message); }
  const ins = d.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, ?)');
  for (const [n, v] of [['invoice', 1000], ['issuance', 1000], ['purchase', 1000]]) ins.run(n, v);
  return d;
}
const BRANCH_DIR = path.join(DATA_DIR, 'branches');
const db = openDb(DB_FILE);

// 4.8 · users keep extra fields (the sections each user may open, what needs approval) — see openDb

// 4.20 · a weak password (e.g. the first admin/admin) must be changed before anything else is allowed
// 4.20 · drop any settings row named like an object internal (could only have come from a crafted request)
try { db.exec("DELETE FROM settings WHERE key IN ('__proto__', 'constructor', 'prototype')"); } catch (e) {}
// 4.31 · the old default company name becomes Ozarex (a name the buyer typed himself stays as it is)
try { db.prepare("UPDATE settings SET value = 'Ozarex' WHERE key = 'companyName' AND value IN ('نظام الحسابات', '\"نظام الحسابات\"')").run(); } catch (e) { console.error('companyName migration:', e.message); }
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

/* 4.32 · the branch list lives in the main database (only this table is new there — no existing row changes) */
db.exec(`CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT, active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0, data TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.prepare("INSERT OR IGNORE INTO branches (id, name, code, active, sort) VALUES ('main', 'الفرع الأساسي', 'A', 1, 0)").run();
/* 4.32 · المرحلة 2 · the three branches asked for — made once (empty); later renamed / switched off from «إدارة الفروع» */
try {
  const m = db.prepare("SELECT data FROM branches WHERE id = 'main'").get();
  let md = {}; try { md = m && m.data ? JSON.parse(m.data) || {} : {}; } catch (_) { md = {}; }
  if (!md.seeded && process.env.EMX_NO_SEED_BRANCHES !== '1') {
    const add = db.prepare('INSERT OR IGNORE INTO branches (id, name, code, active, sort) VALUES (?, ?, ?, 1, ?)');
    const have = new Set(db.prepare('SELECT name FROM branches').all().map(r => r.name));
    [['b_cairo00001', 'فرع القاهرة', 'CA', 2], ['b_minya00001', 'فرع المنيا', 'MI', 3]]
      .forEach(([id, name, code, sort]) => { if (!have.has(name)) add.run(id, name, code, sort); });
    md.seeded = true;
    db.prepare("UPDATE branches SET data = ? WHERE id = 'main'").run(JSON.stringify(md));
  }
} catch (e) { console.error('branches seed:', e.message); }
/* 4.33 · the main branch IS منوف: it is named «فرع منوف» and the separate «فرع منوف» made in 4.32 goes away —
   deleted only when nothing was ever written in it (its file is kept in backups/removed); if it holds any
   record it is switched off and renamed «منوف (قديم)» instead, so nothing is ever lost. Runs once. */
try {
  const m = db.prepare("SELECT name, data FROM branches WHERE id = 'main'").get();
  let md = {}; try { md = m && m.data ? JSON.parse(m.data) || {} : {}; } catch (_) { md = {}; }
  if (!md.menoufMain) {
    db.prepare("UPDATE branches SET name = 'فرع منوف', code = 'MN' WHERE id = 'main'").run();
    const old = db.prepare("SELECT id FROM branches WHERE id = 'b_menouf0001'").get();
    if (old) {
      const file = path.join(BRANCH_DIR, 'b_menouf0001.db');
      let rows = 0;
      if (fs.existsSync(file)) {
        const bd = new DatabaseSync(file);
        try {
          for (const t of ['customers', 'suppliers', 'products', 'employees', 'expenses', 'payments', 'supplier_payments', 'stock_moves', 'bank_transfers', 'salary_runs', 'notes', 'invoices', 'issuances', 'settings']) {
            try { rows += bd.prepare('SELECT COUNT(*) AS c FROM ' + t).get().c; } catch (_) { /* table missing = empty */ }
          }
        } finally { bd.close(); }
      }
      if (rows === 0) {
        db.prepare("DELETE FROM branches WHERE id = 'b_menouf0001'").run();
        if (fs.existsSync(file)) {
          const keep = path.join(DATA_DIR, 'backups', 'removed'); fs.mkdirSync(keep, { recursive: true });
          for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(file + ext)) fs.renameSync(file + ext, path.join(keep, 'b_menouf0001-' + Date.now() + '.db' + ext));
        }
        console.log('[branches] «فرع منوف» (empty) removed — the main branch is منوف now');
      } else {
        db.prepare("UPDATE branches SET name = 'منوف (قديم)', active = 0 WHERE id = 'b_menouf0001'").run();
        console.warn('[branches] «فرع منوف» had ' + rows + ' record(s): switched off and renamed «منوف (قديم)» — nothing deleted');
      }
    }
    md.menoufMain = true;
    db.prepare("UPDATE branches SET data = ? WHERE id = 'main'").run(JSON.stringify(md));
  }
} catch (e) { console.error('branches · منوف:', e.message); }

module.exports = { db, DB_FILE, DATA_DIR, BRANCH_DIR, openDb };

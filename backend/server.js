'use strict';

process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(w);
});

const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const url  = require('node:url');

const { db, DB_FILE } = require('./db');
const { exportBlob, importBlob, defaultBlob } = require('./src/bridge');

// 🔑 Railway / Docker / local-friendly config
// - PORT: Railway injects this automatically. Fallback to 8787.
// - HOST: bind to 0.0.0.0 so Railway/Docker can reach the server.
const PORT      = Number(process.env.PORT) || 8787;
const HOST      = process.env.HOST || '0.0.0.0';
// APP_PATH can be overridden; on Railway with a custom domain, set APP_PATH=''
const APP_PATH  = process.env.APP_PATH !== undefined ? process.env.APP_PATH : '/Ozarex';
const PUBLIC    = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'frontend', 'public');
const MAX_BACKUPS = 20;

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const LIMIT = 100 * 1024 * 1024;
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMIT) { req.destroy(); reject(new Error('Payload too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length
    });
    res.end(data);
  });
}

function takeBackup() {
  const json = JSON.stringify(exportBlob());
  const now  = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO backups (created_at, payload) VALUES (?, ?)').run(now, json);
    const ids = db.prepare('SELECT id FROM backups ORDER BY id DESC').all().map(r => r.id);
    if (ids.length > MAX_BACKUPS) {
      const del = db.prepare('DELETE FROM backups WHERE id = ?');
      for (const id of ids.slice(MAX_BACKUPS)) del.run(id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return now;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = parsed.pathname || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // If APP_PATH is set, redirect root → APP_PATH; otherwise serve directly from root
  if (APP_PATH) {
    if (pathname === '/' || pathname === '' || pathname === APP_PATH) {
      res.writeHead(302, { Location: APP_PATH + '/' });
      return res.end();
    }
    if (pathname.startsWith(APP_PATH + '/')) {
      pathname = pathname.slice(APP_PATH.length);
    } else if (!pathname.startsWith('/api/')) {
      // fall through - serve from root anyway
    }
  }

  try {
    if (pathname === '/api/health') {
      return sendJSON(res, 200, { ok: true, time: new Date().toISOString(), dbFile: DB_FILE });
    }

    if (pathname === '/api/data' && req.method === 'GET') {
      return sendJSON(res, 200, exportBlob());
    }

    if (pathname === '/api/data' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body !== 'object') {
        return sendJSON(res, 400, { error: 'Invalid body' });
      }
      importBlob(body);
      const at = takeBackup();
      return sendJSON(res, 200, { ok: true, saved_at: at });
    }

    if (pathname === '/api/backups' && req.method === 'GET') {
      const rows = db.prepare('SELECT id, created_at FROM backups ORDER BY id DESC').all();
      return sendJSON(res, 200, rows);
    }

    if (pathname === '/api/reset' && req.method === 'POST') {
      importBlob(defaultBlob());
      return sendJSON(res, 200, { ok: true });
    }

    // Static files
    let rel = pathname === '/' ? '/index.html' : pathname;
    rel = rel.replace(/\.\./g, '');
    const filePath = path.join(PUBLIC, rel);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveStatic(res, filePath);
    }
    return serveStatic(res, path.join(PUBLIC, 'index.html'));
  } catch (e) {
    console.error(`[${req.method} ${pathname}]`, e);
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('====================================');
  console.log('  Ozarex ERP Server');
  console.log('====================================');
  console.log('  Listening: ' + HOST + ':' + PORT);
  console.log('  Database : ' + DB_FILE);
  console.log('  App path : ' + (APP_PATH || '(root)'));
  console.log('  Login    : admin / admin');
  console.log('====================================');
});

server.on('error', (e) => {
  console.error('Server error:', e);
  process.exit(1);
});

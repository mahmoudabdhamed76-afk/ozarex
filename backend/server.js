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

const PORT     = Number(process.env.PORT) || 8787;
const HOST     = process.env.HOST || '0.0.0.0';
const APP_PATH = process.env.APP_PATH !== undefined ? process.env.APP_PATH : '/Ozarex';
const PUBLIC   = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'frontend', 'public');
const MAX_BACKUPS = 20;

/* ═══════════════════════════════════════════════════════
   REAL-TIME SYNC — SSE broadcast hub
   WhatsApp Web / Notion style: push version token to all
   connected clients; clients fetch fresh data themselves.
═══════════════════════════════════════════════════════ */
let _dataVersion = Date.now();          // monotonic version counter
const _clients   = new Map();           // clientId → { res, lastPing }
let   _clientSeq = 0;

function broadcast(eventName, payload) {
  const data = JSON.stringify({ event: eventName, version: _dataVersion, ...payload });
  const dead = [];
  for (const [id, client] of _clients) {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch (_) {
      dead.push(id);
    }
  }
  dead.forEach(id => _clients.delete(id));
}

// Bump version + broadcast "data_changed" after every write
function notifyDataChanged(meta = {}) {
  _dataVersion = Date.now();
  broadcast('data_changed', { changedAt: new Date().toISOString(), ...meta });
}

// Keep SSE connections alive
setInterval(() => {
  const now = Date.now();
  const dead = [];
  for (const [id, client] of _clients) {
    try {
      client.res.write(`: ping ${now}\n\n`);
    } catch (_) {
      dead.push(id);
    }
  }
  dead.forEach(id => _clients.delete(id));
}, 20000);

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type':   'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control':  'no-store',
    'Access-Control-Allow-Origin':  '*',
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
      try { const raw = Buffer.concat(chunks).toString('utf8'); resolve(raw ? JSON.parse(raw) : null); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon'
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type':   MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control':  isHtml ? 'no-cache, no-store, must-revalidate' : 'no-cache',
      'Pragma':  'no-cache',
      'Expires': '0'
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

/* ═══════════════════════════════════════════════════════
   REQUEST ROUTER
═══════════════════════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = parsed.pathname || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // Strip APP_PATH prefix
  if (APP_PATH) {
    if (pathname === '/' || pathname === APP_PATH) {
      res.writeHead(302, { Location: APP_PATH + '/' });
      return res.end();
    }
    if (pathname.startsWith(APP_PATH + '/')) {
      pathname = pathname.slice(APP_PATH.length);
    }
  }

  try {
    /* ── Health ── */
    if (pathname === '/api/health') {
      return sendJSON(res, 200, {
        ok: true,
        time: new Date().toISOString(),
        dbFile: DB_FILE,
        version: _dataVersion,
        connectedClients: _clients.size
      });
    }

    /* ── Version check (lightweight — no data transfer) ── */
    if (pathname === '/api/version' && req.method === 'GET') {
      return sendJSON(res, 200, { version: _dataVersion });
    }

    /* ── GET full data ── */
    if (pathname === '/api/data' && req.method === 'GET') {
      const blob = exportBlob();
      blob.__version = _dataVersion;
      return sendJSON(res, 200, blob);
    }

    /* ── POST save data (from any client) ── */
    if (pathname === '/api/data' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return sendJSON(res, 400, { error: 'Invalid body' });

      // Extract metadata for broadcast (don't persist __version from client)
      const { __version: _clientVer, ...cleanBody } = body;

      importBlob(cleanBody);
      const at = takeBackup();

      // Notify all OTHER connected clients
      notifyDataChanged({ source: req.headers['x-client-id'] || 'unknown', savedAt: at });

      return sendJSON(res, 200, { ok: true, saved_at: at, version: _dataVersion });
    }

    /* ── SSE endpoint — real-time event stream ── */
    if (pathname === '/api/events' && req.method === 'GET') {
      const clientId = (++_clientSeq).toString();

      res.writeHead(200, {
        'Content-Type':      'text/event-stream; charset=utf-8',
        'Cache-Control':     'no-cache, no-store',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',       // nginx: disable buffering
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      });

      // Send client its ID and current version immediately
      res.write(`data: ${JSON.stringify({ event: 'connected', clientId, version: _dataVersion })}\n\n`);

      _clients.set(clientId, { res });

      // Clean up on disconnect
      req.on('close',   () => _clients.delete(clientId));
      req.on('error',   () => _clients.delete(clientId));
      req.socket.on('close', () => _clients.delete(clientId));

      // Keep connection alive (Railway has 60s idle timeout)
      const keepalive = setInterval(() => {
        try { res.write(`: heartbeat\n\n`); } catch { clearInterval(keepalive); _clients.delete(clientId); }
      }, 15000);

      return; // don't end response — SSE stays open
    }

    /* ── Backups ── */
    if (pathname === '/api/backups' && req.method === 'GET') {
      const rows = db.prepare('SELECT id, created_at FROM backups ORDER BY id DESC').all();
      return sendJSON(res, 200, rows);
    }

    /* ── Reset ── */
    if (pathname === '/api/reset' && req.method === 'POST') {
      importBlob(defaultBlob());
      notifyDataChanged({ type: 'reset' });
      return sendJSON(res, 200, { ok: true });
    }

    /* ── Static files ── */
    let rel = pathname === '/' ? '/index.html' : pathname;
    rel = rel.replace(/\.\./g, '');
    const filePath = path.join(PUBLIC, rel);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return serveStatic(res, filePath);
    return serveStatic(res, path.join(PUBLIC, 'index.html'));

  } catch (e) {
    console.error(`[${req.method} ${pathname}]`, e);
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('====================================');
  console.log('  Ozarex ERP — Real-time Sync');
  console.log('====================================');
  console.log('  Listening : ' + HOST + ':' + PORT);
  console.log('  Database  : ' + DB_FILE);
  console.log('  App path  : ' + (APP_PATH || '(root)'));
  console.log('  SSE events: /api/events');
  console.log('====================================');
});

server.on('error', (e) => { console.error('Server error:', e); process.exit(1); });

// Increase max connections for SSE
server.maxConnections = 1000;

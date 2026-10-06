/* Starts the real app (backend/server.js) as a child process on a free port
   with its own throwaway DATA_DIR, so every test file gets a clean database.
   Nothing in the app is mocked — the tests talk to it over HTTP. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ADMIN_PASSWORD = 'Admin-Test-Pass-2026';

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function spawnApp(port, dataDir, extraEnv) {
  const base = `http://127.0.0.1:${port}`;
  const env = Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1', APP_PATH: '', DATA_DIR: dataDir,
    ADMIN_PASSWORD, TRUST_PROXY: '0'
  }, extraEnv || {});
  for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']) delete env[k];
  const child = spawn(process.execPath, [path.join(process.env.ERP_APP_ROOT || ROOT, 'backend', 'server.js')]   /* ERP_APP_ROOT: run the same tests against another checkout (benchmarks) */, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = { child, log: '' };
  child.stdout.on('data', d => { out.log += d; });
  child.stderr.on('data', d => { out.log += d; });
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error('server exited early:\n' + out.log);
    try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch (_) { /* not up yet */ }
    if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error('server did not start:\n' + out.log); }
    await new Promise(r => setTimeout(r, 100));
  }
  return out;
}
function kill(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise(res => {
    child.once('exit', res);
    child.kill('SIGTERM');
    setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) { /* gone */ } }, 3000);
  });
}

export async function startServer({ dataDir, env } = {}) {
  const own = !dataDir;
  dataDir = dataDir || mkdtempSync(path.join(tmpdir(), 'erp-test-'));
  const port = await freePort();
  let proc = await spawnApp(port, dataDir, env);
  return {
    base: `http://127.0.0.1:${port}`, port, dataDir,
    get log() { return proc.log; },
    /* stop and start again on the same data — proves what really reached the database */
    async restart() { await kill(proc.child); proc = await spawnApp(port, dataDir, env); },
    async stop() { await kill(proc.child); if (own) rmSync(dataDir, { recursive: true, force: true }); }
  };
}

/* 4.32 · upgrade check (test tooling, not shipped): an old checkout writes the large dataset, the new code opens the same files —
   the main branch must read back byte-for-byte identical.   OLD=/path/to/old/checkout node bench/upgrade-check.mjs */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../helpers/server.mjs';
import { adminLogin, req } from '../helpers/api.mjs';
import { loadLargeDataset } from '../fixtures/load.mjs';
const OLD = process.env.OLD;
const dir = mkdtempSync(path.join(tmpdir(), 'erp-upg-'));
const strip = j => { delete j.__version; delete j.__branch; return JSON.stringify(j); };
/* 1 · old version writes the business */
process.env.ERP_APP_ROOT = OLD;
let s = await startServer({ dataDir: dir, env: { ERP_APP_ROOT: OLD } });
let t = (await adminLogin(s.base)).token;
const r = await req(s.base, 'POST', '/api/data', { token: t, body: loadLargeDataset() });
if (r.status !== 200) throw new Error('restore ' + r.status);
const before = strip((await req(s.base, 'GET', '/api/data', { token: t })).json);
await s.stop();
/* 2 · new version opens the same files */
delete process.env.ERP_APP_ROOT;
s = await startServer({ dataDir: dir });
t = (await adminLogin(s.base)).token;
const after = strip((await req(s.base, 'GET', '/api/data', { token: t })).json);
const viaMain = strip((await req(s.base, 'GET', '/api/data', { token: t, headers: { 'X-Branch': 'main' } })).json);
const br = (await req(s.base, 'GET', '/api/branches', { token: t })).json;
await s.stop(); rmSync(dir, { recursive: true, force: true });
const J = JSON.parse(before);
console.log('records:', ['customers', 'products', 'invoices', 'issuances', 'payments', 'expenses', 'stockMoves', 'suppliers', 'supplierPayments'].map(k => k + '=' + (J[k] || []).length).join(' '));
console.log('bytes', before.length, 'identical(no header):', before === after, 'identical(X-Branch main):', before === viaMain);
console.log('branches:', JSON.stringify(br.branches.map(b => [b.id, b.name])));
if (before !== after || before !== viaMain) process.exit(1);

/* Server-side timing with the large fixture: restore, restart, GET /api/data, and
   200 single-record saves (/api/ops). Usage: node bench/ops-bench.mjs [app root] */
import { startServer } from '../helpers/server.mjs';
import { adminLogin, send, ops, col, req } from '../helpers/api.mjs';
import { loadLargeDataset } from '../fixtures/load.mjs';

if (process.argv[2]) process.env.ERP_APP_ROOT = process.argv[2];
const s = await startServer();
let t = (await adminLogin(s.base)).token;
const ms = async f => { const t0 = process.hrtime.bigint(); await f(); return Number(process.hrtime.bigint() - t0) / 1e6; };
const out = {};
out.restoreMs = await ms(() => req(s.base, 'POST', '/api/data', { token: t, body: loadLargeDataset() }));
out.restartMs = await ms(() => s.restart());
t = (await adminLogin(s.base)).token;
out.getDataMs = await ms(() => req(s.base, 'GET', '/api/data', { token: t }));
const times = [];
for (let i = 0; i < 200; i++) {
  const o = i % 2
    ? ops({ cols: { customers: col({ modified: [{ id: 'c5', before: {}, after: { phone: '0100' + i } }] }) } })
    : ops({ cols: { invoices: col({ added: [{ id: 'bench_' + i, number: 900000 + i, customerId: 'c1', date: '2026-10-06', total: 1, paid: 0, items: [{ productId: 'p1', name: 'x', qty: 1, price: 1, total: 1 }] }] }) } });
  times.push(await ms(async () => { const r = await send(s.base, t, o); if (r.status !== 200) throw new Error(r.text); }));
}
times.sort((a, b) => a - b);
out.opsMedianMs = +times[100].toFixed(2); out.opsP95Ms = +times[190].toFixed(2);
for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100;
console.log(JSON.stringify(out));
await s.stop();

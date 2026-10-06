/* Zero-dependency checks: every JS file parses (including the inline <script>s
   in index.html), every JSON file is valid, every file index.html loads exists,
   and the service worker pre-caches every script the page loads. */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = path.join(root, 'frontend', 'public');
const problems = [];
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (['node_modules', '.git', 'vendor', 'tests'].includes(n)) continue; statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk(root);

let js = 0;
for (const f of files.filter(f => f.endsWith('.js'))) {
  try { new vm.Script(readFileSync(f, 'utf8'), { filename: f }); js++; } catch (e) { problems.push(`${path.relative(root, f)}: ${e.message}`); }
}
const html = readFileSync(path.join(pub, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>\n/g)];
inline.forEach((m, i) => { try { new vm.Script(m[1], { filename: `index.html inline script #${i + 1}` }); } catch (e) { problems.push(`index.html inline script #${i + 1}: ${e.message}`); } });
for (const f of files.filter(f => f.endsWith('.json'))) { try { JSON.parse(readFileSync(f, 'utf8')); } catch (e) { problems.push(`${path.relative(root, f)}: invalid JSON (${e.message})`); } }

const refs = [...html.matchAll(/(?:src|href)="((?:js|css|vendor|fonts|icons)\/[^"]+|manifest\.json)"/g)].map(m => m[1]);
for (const r of new Set(refs)) if (!existsSync(path.join(pub, r))) problems.push(`index.html loads a missing file: ${r}`);
const sw = readFileSync(path.join(pub, 'sw.js'), 'utf8');
for (const r of new Set(refs.filter(r => /\.(js|css)$/.test(r)))) if (!sw.includes(`'./${r}'`)) problems.push(`sw.js APP_SHELL does not pre-cache ${r} (offline start would miss it)`);

console.log(`syntax: ${js} JS files + ${inline.length} inline scripts parsed · ${files.filter(f => f.endsWith('.json')).length} JSON files · ${new Set(refs).size} page references checked`);
if (problems.length) { console.log(problems.map(p => '  ✗ ' + p).join('\n')); process.exit(1); }

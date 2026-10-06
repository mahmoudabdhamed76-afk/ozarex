/* Runs ESLint over the repo and compares the warnings with lint/eslint-baseline.json.
   Errors always fail. Warnings fail only if a rule has MORE than the baseline.
   After cleaning code up:  node lint/run-eslint.mjs --update-baseline */
import { ESLint } from 'eslint';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const baselineFile = path.join(here, 'eslint-baseline.json');
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(here, '..', 'eslint.config.mjs') });
const results = await eslint.lintFiles(['.']);

const counts = {}; let errors = 0;
for (const f of results) for (const m of f.messages) {
  if (m.severity === 2) { errors++; console.log(`error  ${path.relative(root, f.filePath)}:${m.line}  ${m.ruleId}  ${m.message}`); }
  else counts[m.ruleId] = (counts[m.ruleId] || 0) + 1;
}
if (process.argv.includes('--update-baseline')) { writeFileSync(baselineFile, JSON.stringify(counts, null, 2) + '\n'); console.log('baseline updated', counts); process.exit(errors ? 1 : 0); }

const base = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
let worse = 0;
for (const rule of new Set([...Object.keys(base), ...Object.keys(counts)])) {
  const now = counts[rule] || 0, was = base[rule] || 0;
  if (now > was) { worse++; console.log(`more warnings than the baseline: ${rule} ${was} → ${now}`); }
  else if (now < was) console.log(`fewer warnings (${rule} ${was} → ${now}) — run with --update-baseline to lock it in`);
}
console.log(`eslint: ${results.length} files · ${errors} errors · warnings ${JSON.stringify(counts)}`);
process.exit(errors || worse ? 1 : 0);

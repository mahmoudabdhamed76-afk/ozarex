/* Runs the whole Phase 0 safety net and prints one summary:
   lint → API tests → browser tests. Exit code 1 only on a real failure
   (a KNOWN BUG test that still fails is expected and does not fail the run).
   Also writes test-results/summary.json. */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);                       // e.g. node run-all.mjs api
const run = (cmd, args) => new Promise(res => {
  const t = Date.now(); let out = '';
  const p = spawn(cmd, args, { cwd: here, shell: process.platform === 'win32' });
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out, ms: Date.now() - t }));
});
const sec = ms => (ms / 1000).toFixed(1) + ' s';
const summary = {};
mkdirSync(path.join(here, 'test-results'), { recursive: true });

if (!only.length || only.includes('lint')) {
  const a = await run(process.execPath, ['lint/check-syntax.mjs']);
  const b = await run(process.execPath, ['lint/run-eslint.mjs']);
  summary.lint = { ok: a.code === 0 && b.code === 0, ms: a.ms + b.ms, detail: (a.out + b.out).trim().split('\n').slice(-3) };
  console.log(`\n■ lint ${summary.lint.ok ? 'OK' : 'FAILED'} (${sec(summary.lint.ms)})\n  ` + summary.lint.detail.join('\n  '));
}

if (!only.length || only.includes('api')) {
  const r = await run(process.execPath, ['--test', '--test-concurrency=4', '--test-reporter=tap', 'api/*.test.mjs']);
  const num = k => Number((r.out.match(new RegExp('^# ' + k + ' (\\d+)', 'm')) || [])[1] || 0);
  const lines = r.out.split('\n');
  const known = lines.filter(l => /^\s*not ok \d+ - .*# TODO/.test(l)).map(l => l.replace(/^\s*not ok \d+ - /, ''));
  const fixed = lines.filter(l => /^\s*ok \d+ - .*# TODO/.test(l)).map(l => l.replace(/^\s*ok \d+ - /, ''));
  const failed = lines.filter(l => /^\s*not ok \d+ - /.test(l) && !/# TODO/.test(l)).map(l => l.replace(/^\s*not ok \d+ - /, ''));
  summary.api = { ok: r.code === 0, tests: num('tests'), passed: num('pass') - fixed.length, knownBugs: known, fixedKnownBugs: fixed, failed, ms: r.ms };
  console.log(`\n■ API tests ${summary.api.ok ? 'OK' : 'FAILED'} (${sec(r.ms)}): ${summary.api.passed} passed · ${known.length} known bugs still failing · ${failed.length} unexpected failures`);
  known.forEach(k => console.log('  ⚠ ' + k));
  fixed.forEach(k => console.log('  ✓ fixed? ' + k + '  → remove the todo'));
  failed.forEach(k => console.log('  ✗ ' + k));
  if (!summary.api.ok) console.log(r.out.split('\n').filter(l => /error:|expected|actual/.test(l)).slice(0, 30).join('\n'));
}

if (!only.length || only.includes('browser')) {
  const r = await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'test', '--reporter=json']);
  let j = null; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch (_) { /* reporter crashed */ }
  const all = [];
  const walk = s => { (s.suites || []).forEach(walk); (s.specs || []).forEach(sp => sp.tests.forEach(t => all.push({ title: sp.title, project: t.projectName, status: t.status, fail: (t.annotations || []).find(a => a.type === 'fail'), notes: t.annotations || [], results: t.results }))); };
  if (j) walk(j);
  const known = all.filter(t => t.fail && t.status === 'expected');
  const bad = all.filter(t => t.status === 'unexpected' || t.status === 'flaky');
  const timings = all.flatMap(t => t.notes.filter(a => a.type === 'timings').map(a => a.description));
  summary.browser = { ok: r.code === 0, tests: all.length, passed: all.filter(t => t.status === 'expected' && !t.fail).length, skipped: all.filter(t => t.status === 'skipped').length,
    knownBugs: known.map(t => `[${t.project}] ${t.title}`), failed: bad.map(t => `[${t.project}] ${t.title} (${t.status})`), timings, ms: r.ms };
  console.log(`\n■ browser tests ${summary.browser.ok ? 'OK' : 'FAILED'} (${sec(r.ms)}): ${summary.browser.passed} passed · ${known.length} known bugs still failing · ${summary.browser.skipped} skipped · ${bad.length} unexpected`);
  known.forEach(k => console.log('  ⚠ [' + k.project + '] ' + k.title));
  bad.forEach(k => console.log('  ✗ [' + k.project + '] ' + k.title + ' — ' + ((k.results.at(-1) || {}).error || {}).message?.split('\n')[0]));
  timings.forEach(t => console.log('  ⏱ large dataset ' + t));
  if (!j) console.log(r.out.slice(-2000));
}

writeFileSync(path.join(here, 'test-results', 'summary.json'), JSON.stringify(summary, null, 2));
const ok = Object.values(summary).every(x => x.ok);
console.log(`\n${ok ? '✅ all green (known bugs are expected to fail)' : '❌ something failed'} — total ${sec(Object.values(summary).reduce((t, x) => t + x.ms, 0))}`);
process.exit(ok ? 0 : 1);

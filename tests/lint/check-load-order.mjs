/* Phase 7 · the app script of index.html is now several classic <script>s (js/core/*, js/utils/*, and what is
   still inline). In ONE script every top-level function exists before any line runs; split into files, a name
   from a LATER file does not exist yet while an earlier file runs. This check parses every app script in page
   order and fails if code that runs while the page loads (top-level statements, immediately-called functions,
   and — transitively — the functions they call) uses a top-level name declared in a later script.
   Handlers / callbacks (DOMContentLoaded, onclick, setTimeout …) run later and are fine. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url));
const espree = createRequire(path.join(here, '..', 'package.json'))('espree');
const pub = path.join(here, '..', '..', 'frontend', 'public');
const html = readFileSync(path.join(pub, 'index.html'), 'utf8');

/* the app scripts, in page order: from js/core/api.js to the end of the inline script that follows the moved files */
const segs = [];
const re = /<script src="(js\/(?:core|utils)\/[^"]+)"><\/script>|<script>\n([\s\S]*?)<\/script>\n/g;
let m, started = false;
while ((m = re.exec(html))) {
  if (m[1]) { started = true; segs.push({ name: m[1], src: readFileSync(path.join(pub, m[1]), 'utf8') }); }
  else if (started) { segs.push({ name: 'index.html inline #' + segs.length, src: m[2] }); if (!/<script src="js\/(core|utils)\//.test(html.slice(re.lastIndex, re.lastIndex + 400))) break; }
}
const decl = new Map();                        // top-level name → index of the script that declares it
const fnBody = new Map(), loadTime = [];       // function name → names its body uses · [script index, names used at load]
const pat = (p, f) => { if (!p) return; if (p.type === 'Identifier') f(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => pat(q.value || q.argument, f)); else if (p.type === 'ArrayPattern') p.elements.forEach(e => pat(e, f)); else if (p.type === 'AssignmentPattern') pat(p.left, f); else if (p.type === 'RestElement') pat(p.argument, f); };
function names(node, deep) {                   // identifiers used; nested functions only when deep (or called at once)
  const out = new Set();
  (function walk(n, parent, key) {
    if (!n || typeof n.type !== 'string') return;
    if (/Function/.test(n.type) && !deep && !(parent && parent.type === 'CallExpression' && key === 'callee')) return;
    if (n.type === 'Identifier') {
      if (parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
      if (parent && /^(Property|MethodDefinition|PropertyDefinition)$/.test(parent.type) && key === 'key' && !parent.computed) return;
      out.add(n.name); return;
    }
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, n, k)); else if (v && typeof v.type === 'string') walk(v, n, k); }
  })(node, null, null);
  return out;
}
segs.forEach((s, i) => {
  const ast = espree.parse(s.src, { ecmaVersion: 2023, sourceType: 'script', loc: true });
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration') { decl.set(st.id.name, i); fnBody.set(st.id.name, names(st, true)); continue; }
    if (st.type === 'ClassDeclaration') decl.set(st.id.name, i);
    if (st.type === 'VariableDeclaration') st.declarations.forEach(d => pat(d.id, n => decl.set(n, i)));
    loadTime.push([i, names(st, false), st.loc.start.line]);
  }
});
const problems = [];
for (const [i, used, line] of loadTime) {
  const all = new Set(used), q = [...used];
  while (q.length) { const b = fnBody.get(q.pop()); if (b) for (const n of b) if (!all.has(n)) { all.add(n); q.push(n); } }
  for (const n of all) if (decl.has(n) && decl.get(n) > i) problems.push(`${segs[i].name}:${line} uses «${n}» while loading, but it is declared later in ${segs[decl.get(n)].name}`);
}
console.log(`load order: ${segs.length} app scripts, ${decl.size} top-level names, ${loadTime.length} load-time statements checked`);
if (problems.length) { console.log(problems.map(p => '  ✗ ' + p).join('\n')); process.exit(1); }

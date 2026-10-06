// tools/changed-tests.mjs: run only the test files a change can affect (the fast inner loop).
//
//   node tools/changed-tests.mjs                 # tests affected by this branch + uncommitted work
//   node tools/changed-tests.mjs --list          # print them, run nothing
//   node tools/changed-tests.mjs --base HEAD     # only uncommitted work
//   node tools/changed-tests.mjs app/game.js     # tests affected by these files
//   node tools/changed-tests.mjs -- --test-name-pattern=K-9   # anything after -- goes to node --test
//
// "Changed" = the files that differ from the merge base with main (committed or not) plus
// untracked files, or the files named on the command line. A test file is picked when it
// changed itself or when something it depends on changed. Its dependencies are found by
// reading the source: static and dynamic imports, followed through tests/lib and the game's
// modules, plus repo paths written as string literals (next.html, desk/desk.css, '../sim/'
// for a whole folder); next.html brings in what it links. A test that walks folders
// (readdirSync, or tests/lib/js-tokens.js) depends on everything.
//
// The full suite (`node --test`) still runs once before a merge and in CI.

import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join, dirname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => relative(ROOT, p).split(sep).join('/');
const args = process.argv.slice(2);
const dash = args.indexOf('--');
const own = dash < 0 ? args : args.slice(0, dash);
const pass = dash < 0 ? [] : args.slice(dash + 1);
const list = own.includes('--list');
const bi = own.indexOf('--base');
const named = own.filter((a, i) => !a.startsWith('--') && !(bi >= 0 && i === bi + 1));

const git = (...a) => execFileSync('git', a, {cwd: ROOT, encoding: 'utf8'}).split('\n').map(s => s.trim()).filter(Boolean);

function changedFiles() {
  if (named.length) return named.map(f => rel(resolve(process.cwd(), f)));
  let base = bi >= 0 ? own[bi + 1] : null;
  if (!base) {
    for (const ref of ['origin/main', 'main']) {
      try { base = git('merge-base', 'HEAD', ref)[0]; break; } catch { /* try the next */ }
    }
  }
  const out = new Set(git('diff', '--name-only', base || 'HEAD'));
  for (const f of git('ls-files', '--others', '--exclude-standard')) out.add(f);
  return [...out];
}

// ---------------------------------------------------------------- dependencies, read from source

const PATH_LIT = /^(?:(?:\.\.?\/)+)?(?:(?:app|desk|sim|render|content|tools|tests|audio)\/[\w./-]*|[\w-]+\.(?:html|css|md|json))$/;
const deps = new Map();   // file (repo-relative) -> {files:Set, prefixes:Set, all:boolean}

function scan(file) {
  if (deps.has(file)) return deps.get(file);
  const d = {files: new Set(), prefixes: new Set(), all: false};
  deps.set(file, d);
  const abs = join(ROOT, file);
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { return d; }
  const here = dirname(abs);
  const add = target => {
    const r = rel(target);
    if (r.startsWith('..')) return;
    let isDir = false;
    try { isDir = statSync(target).isDirectory(); } catch { /* a file that may not exist yet */ }
    if (isDir || r.endsWith('/') || r === '') { if (r === '') d.all = true; else d.prefixes.add(r.replace(/\/?$/, '/')); }
    else d.files.add(r);
  };
  if (file.endsWith('.html')) {
    for (const m of src.matchAll(/\b(?:src|href)="([^"#?:]+)"/g)) add(resolve(here, m[1]));
    return d;
  }
  if (!/\.(m?js|cjs)$/.test(file)) return d;
  for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)) {
    if (m[1].startsWith('.')) add(resolve(here, m[1]));
  }
  for (const m of src.matchAll(/['"]([^'"\n]+)['"]/g)) {
    const s = m[1];
    if (s === '..' && /new URL\(\s*['"]\.\.['"]/.test(src)) continue;   // ROOT itself: only what is joined to it counts
    if (!PATH_LIT.test(s)) continue;
    add(s.startsWith('.') ? resolve(here, s) : join(ROOT, s));
  }
  if (/\breaddirSync\b/.test(src) && file.endsWith('.test.js')) d.all = true;   // a test that walks folders itself
  return d;
}

/** Everything a test depends on, transitively. */
function closure(test) {
  const seen = new Set([test]), prefixes = new Set(), todo = [test];
  let all = false;
  while (todo.length) {
    const d = scan(todo.pop());
    if (d.all) all = true;
    for (const p of d.prefixes) prefixes.add(p);
    for (const f of d.files) if (!seen.has(f)) { seen.add(f); todo.push(f); }
  }
  return {files: seen, prefixes, all};
}

const tests = readdirSync(join(ROOT, 'tests')).filter(n => n.endsWith('.test.js')).map(n => 'tests/' + n).sort();
const changed = changedFiles();
const picked = tests.filter(t => {
  if (!existsSync(join(ROOT, t))) return false;
  const c = closure(t);
  return changed.some(f => c.all || c.files.has(f) || [...c.prefixes].some(p => f.startsWith(p)));
});

if (!changed.length) { console.log('changed-tests: nothing has changed against main; nothing to run.'); process.exit(0); }
console.log('changed-tests: ' + changed.length + ' changed file(s) -> ' + picked.length + ' of ' + tests.length + ' test files');
if (list || !picked.length) {
  for (const t of picked) console.log('  ' + t);
  if (!picked.length) console.log('  (no test depends on the changed files)');
  process.exit(0);
}
const r = spawnSync(process.execPath, ['--test', ...pass, ...picked], {cwd: ROOT, stdio: 'inherit'});
process.exit(r.status ?? 1);

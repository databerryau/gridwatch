// F-2 / F-3 / risk 5: sim/ is pure, deterministic and engine-independent.
//  - no DOM, timers, clocks, storage, network, console or Math.random (F-2, F-3)
//  - no transcendental Math functions and no ** (risk 5: cross-engine floating point)
//  - imports are relative, end in .js, and stay inside sim/ (or read content/)
//  - LF line endings in sim/ and content/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
import {tokenize, jsFiles, importSpecifiers} from './lib/js-tokens.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SIM = fileURLToPath(new URL('../sim/', import.meta.url));
const CONTENT = fileURLToPath(new URL('../content/', import.meta.url));
const rel = f => relative(ROOT, f).replace(/\\/g, '/');
const files = jsFiles(SIM).map(f => ({f, src: readFileSync(f, 'utf8')})).map(x => Object.assign(x, {toks: tokenize(x.src)}));

// Identifiers that must not appear as code under sim/ (comments and strings are fine).
// globalThis / self / eval / Function would reach any of these indirectly
// (globalThis.Date.now() hides Date behind a '.'); Intl and the locale methods depend on
// the user's locale; crypto, WeakRef and the task queues are non-deterministic.
const FORBIDDEN = new Set(['document', 'window', 'Date', 'performance', 'localStorage', 'sessionStorage', 'setTimeout',
  'setInterval', 'requestAnimationFrame', 'navigator', 'fetch', 'XMLHttpRequest', 'process', 'require', 'console',
  'globalThis', 'self', 'eval', 'Function', 'Intl', 'crypto', 'WeakRef', 'FinalizationRegistry', 'queueMicrotask',
  'setImmediate', 'SharedArrayBuffer', 'Atomics']);
// Property names that must not be called under sim/ (locale-dependent results).
const FORBIDDEN_PROPS = new Set(['localeCompare', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString',
  'toLocaleUpperCase', 'toLocaleLowerCase']);
const TRANSCENDENTAL = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh',
  'acosh', 'atanh', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot', 'random']);

test('sim/ exists and is tokenised', () => {
  assert.ok(files.length >= 9, 'expected the sim modules, found ' + files.map(x => rel(x.f)));
  for (const x of files) assert.ok(x.toks.length > 0, rel(x.f));
});

test('F-2: no DOM, timers, clocks, storage, network, console, global escapes or locale calls under sim/', () => {
  const bad = [];
  for (const {f, toks} of files) {
    toks.forEach((t, k) => {
      if (t.type !== 'ident') return;
      const prev = toks[k - 1];
      if (prev && prev.text === '.') { // a property name such as obj.window
        if (FORBIDDEN_PROPS.has(t.text)) bad.push(rel(f) + ':' + t.line + ' .' + t.text);
        return;
      }
      if (FORBIDDEN.has(t.text)) bad.push(rel(f) + ':' + t.line + ' ' + t.text);
    });
  }
  assert.deepEqual(bad, []);
});

test('the lint itself catches globalThis.Date, Math[...] and localeCompare', () => {
  const src = 'const t = globalThis.Date.now(); const r = Math["random"](); a.localeCompare(b); const ok = x.window;';
  const toks = tokenize(src);
  const hits = [];
  toks.forEach((t, k) => {
    if (t.type !== 'ident') return;
    if (toks[k - 1] && toks[k - 1].text === '.') { if (FORBIDDEN_PROPS.has(t.text)) hits.push(t.text); return; }
    if (FORBIDDEN.has(t.text)) hits.push(t.text);
    if (t.text === 'Math' && toks[k + 1] && toks[k + 1].text === '[') hits.push('Math[');
  });
  assert.deepEqual(hits, ['globalThis', 'Math[', 'localeCompare']);
});

test('F-3 / risk 5: no Math.random and no transcendental Math function or ** under sim/', () => {
  const bad = [];
  for (const {f, toks} of files) {
    toks.forEach((t, k) => {
      if (t.type === 'ident' && t.text === 'Math' && toks[k + 1] && toks[k + 1].text === '.' && toks[k + 2] &&
          TRANSCENDENTAL.has(toks[k + 2].text)) bad.push(rel(f) + ':' + t.line + ' Math.' + toks[k + 2].text);
      // Math['exp'] or Math[name] would dodge the check above.
      if (t.type === 'ident' && t.text === 'Math' && toks[k + 1] && toks[k + 1].text === '[') bad.push(rel(f) + ':' + t.line + ' Math[');
      if (t.type === 'punct' && t.text === '*' && toks[k + 1] && toks[k + 1].text === '*' && toks[k + 1].pos === t.pos + 1)
        bad.push(rel(f) + ':' + t.line + ' **');
    });
  }
  assert.deepEqual(bad, []);
});

test('sim/ imports are relative .js paths inside sim/ or content/', () => {
  const bad = [];
  for (const {f, toks} of files) {
    for (const s of importSpecifiers(toks)) {
      const ok = /^\.\/[\w-]+\.js$/.test(s) || /^\.\.\/content\/[\w-]+\.js$/.test(s);
      if (!ok) bad.push(rel(f) + ' imports ' + s);
    }
  }
  assert.deepEqual(bad, []);
});

test('S-4: autopilot.js imports only params.js and step.js (the information barrier)', () => {
  const ap = files.find(x => rel(x.f) === 'sim/autopilot.js');
  assert.ok(ap, 'sim/autopilot.js missing');
  for (const s of importSpecifiers(ap.toks)) assert.ok(['./params.js', './step.js'].includes(s), 'autopilot imports ' + s);
});

test('sim/ and content/ use LF line endings', () => {
  for (const f of [...jsFiles(SIM), ...jsFiles(CONTENT)]) assert.ok(!readFileSync(f, 'utf8').includes('\r'), rel(f) + ' has CR');
});

test('F-2: node imports sim/step.js without a DOM shim and createState runs', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const {createState} = await import('../sim/step.js');
  const {CLASSIC} = await import('../content/scenarios.js');
  assert.equal(createState(1, CLASSIC).tick, 0);
});

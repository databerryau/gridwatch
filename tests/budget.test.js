// F-11 (Phase 1b): the parts of the performance budget that do not depend on the machine.
// The first visit to next.html transfers <= 400 KB compressed, in files this repo serves
// itself (C-1). Frame and draw times are measured by `node tools/perf.mjs` and next.html?perf.
// Q-44 (desk/README.md §30.3.1): the help texts and the alarm panel load on demand, outside it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {firstVisit, moduleClosure, BUDGET} from '../tools/perf.mjs';
import {tokenize, jsFiles} from './lib/js-tokens.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = p => relative(ROOT, p).split(sep).join('/');

test('F-11: the first visit to next.html is at most 400 KB gzip-compressed', () => {
  const files = firstVisit('next.html');
  const gz = files.reduce((a, f) => a + f.gzip, 0);
  assert.ok(gz <= BUDGET.firstVisitGzipBytes, 'first visit is ' + (gz / 1024).toFixed(1) + ' KB gzip over ' + files.length + ' files');
  // The walk found the whole game, not just the page: every layer of the site is in it.
  const paths = files.map(f => f.path);
  for (const p of ['next.html', 'desk/desk.css', 'app/boot.js', 'app/shell.js', 'app/game.js', 'sim/step.js', 'sim/physics.js',
    'desk/desk.js', 'render/map.js', 'render/livestack.js', 'audio/audio.js', 'content/anchors.js']) {
    assert.ok(paths.includes(p), p + ' is part of the first visit');
  }
});

test('F-11: next.html loads nothing the legacy game or the tools need (no tools/, tests/ or classic.html code)', () => {
  for (const f of firstVisit('next.html')) assert.ok(!/^(tools|tests)\//.test(f.path), f.path);
});

// Q-44: the modules that load on demand, each with its gzip -9 cap (bytes; their owners: W5 the
// texts, W3 the alarm panel and its explainers).
const ON_DEMAND = Object.freeze({'content/text.js': 17 * 1024, 'app/alarmpanel.js': 6 * 1024, 'content/alarmhelp.js': 5 * 1024});

test('Q-44: the on-demand modules stay out of the first visit, are the only ones loaded by import(), bring only each other, and keep their caps', () => {
  const first = new Set(firstVisit('next.html').map(f => f.path));
  const named = Object.keys(ON_DEMAND);
  // (a) none is in the first visit
  for (const m of named) assert.ok(!first.has(m), m + ' is in the first visit');
  // (b) every import( in the page's code names one of them, as a string
  for (const dir of ['app', 'desk', 'render', 'content', 'audio']) {
    for (const f of jsFiles(join(ROOT, dir))) {
      const toks = tokenize(readFileSync(f, 'utf8'));
      toks.forEach((t, k) => {
        if (t.type !== 'ident' || t.text !== 'import' || !toks[k + 1] || toks[k + 1].text !== '(') return;
        const s = toks[k + 2];
        assert.ok(s && s.type === 'str' && toks[k + 3] && toks[k + 3].text === ')', rel(f) + ':' + t.line + ': import( of a string literal');
        const target = rel(join(dirname(f), s.text.slice(1, -1)));
        assert.ok(named.includes(target), rel(f) + ':' + t.line + ' loads ' + target + ' on demand: name it in ON_DEMAND (with a cap)');
      });
    }
  }
  for (const m of named) {
    if (!existsSync(join(ROOT, m))) continue;
    // (c) what it imports statically is in the first visit already, or on demand itself
    for (const f of moduleClosure(m)) assert.ok(first.has(f.path) || named.includes(f.path), m + ' brings ' + f.path + ' with it');
    // (d) its cap
    const gz = gzipSync(readFileSync(join(ROOT, m)), {level: 9}).length;
    assert.ok(gz <= ON_DEMAND[m], m + ' is ' + (gz / 1024).toFixed(1) + ' KB gzip, over its ' + ON_DEMAND[m] / 1024 + ' KB');
  }
});

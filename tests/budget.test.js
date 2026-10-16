// F-11 (Phase 1b): the parts of the performance budget that do not depend on the machine.
// Q-84 (the owner, 2026-10-13): the first visit's size is measured and reported, not capped; what
// stays a test is its shape (the page loads the whole game from this repo, C-1, and nothing else).
// Frame and draw times are measured by `node tools/perf.mjs` and next.html?perf.
// Q-44 (desk/README.md §30.3.1): the help texts and the alarm panel load on demand, outside it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {firstVisit, moduleClosure} from '../tools/perf.mjs';
import {tokenize, jsFiles} from './lib/js-tokens.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = p => relative(ROOT, p).split(sep).join('/');

test('F-11 (Q-84): the first visit to next.html is the whole game; its size is reported, not capped', t => {
  const files = firstVisit('next.html');
  const gz = files.reduce((a, f) => a + f.gzip, 0);
  t.diagnostic('first visit ' + gz + ' B gzip (' + (gz / 1024).toFixed(1) + ' KB) over ' + files.length + ' files; 2c so far +' +
    (gz - POST_MOVE_GZIP) + ' B after the Q-61 move (desk/README §32.3 keeps what each part cost)');
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

// Q-61: the first visit after stage A's second header move (`node tools/perf.mjs --sizes`), the base of the report above.
const POST_MOVE_GZIP = 385154;

// Q-44: the modules that load on demand, each with the gzip -9 size it was given (bytes, reported since Q-84; their owners: W5 the
// texts and the end card (§30.9), W3 the alarm panel and its explainers; Q-49: the ?perf overlay; Q-56: the suburb card, 2b's card;
// 2b raised the texts 17 -> 18.5 KB (the city levers' three entries); 2c (Q-61) the texts to 20 KB, the alarm help to 5.5 KB).
const ON_DEMAND = Object.freeze({'content/text.js': 20 * 1024, 'app/alarmpanel.js': 6 * 1024, 'content/alarmhelp.js': 5.5 * 1024, 'app/endcard.js': 7.5 * 1024, 'render/charts.js': 7 * 1024,
  'app/perf.js': 2 * 1024, 'app/suburbcard.js': 6.5 * 1024, 'app/momentimage.js': 4 * 1024}); // (2c map: a held suburb's face, §32.11, 6 -> 6.5 KB; W3: the verdict, the end card 5 -> 6.5 KB and its charts; W6: YOUR CARD and SHARE, 6.5 -> 7.5 KB; Y-6: the moment's picture, 4 KB)

test('Q-44: the on-demand modules stay out of the first visit, are the only ones loaded by import(), bring only each other (sizes reported, Q-84)', t => {
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
        if (rel(f) === 'app/start.js' && target === 'app/boot.js') return;   // (W6, Y-8: the page's entry loads the game at once, or the landing page)
        assert.ok(named.includes(target), rel(f) + ':' + t.line + ' loads ' + target + ' on demand: name it in ON_DEMAND (with a cap)');
      });
    }
  }
  for (const m of named) {
    if (!existsSync(join(ROOT, m))) continue;
    // (c) what it imports statically is in the first visit already, or on demand itself
    for (const f of moduleClosure(m)) assert.ok(first.has(f.path) || named.includes(f.path), m + ' brings ' + f.path + ' with it');
    // (d) its size, reported against what it was given (Q-84: not a gate)
    const gz = gzipSync(readFileSync(join(ROOT, m)), {level: 9}).length;
    t.diagnostic(m + ' ' + gz + ' B gzip (given ' + ON_DEMAND[m] + ')');
  }
});

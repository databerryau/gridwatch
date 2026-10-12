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

// Q-61 (desk/README.md §32.3, §32.5.1): slice 2c's eager ceiling. POST_MOVE_GZIP is the first visit
// measured after stage A's second header move (`node tools/perf.mjs --sizes`: 397,123 B before it,
// 385,154 B after); 2c adds at most 12.4 KB to it (11.4 before the stage-A merge), shared out by §32.3's caps (KB, by owner). The caps
// are read from §32.3's table (rows `| **owner** (ID) | ... | N KB |`), so a reallocation is one edit.
const POST_MOVE_GZIP = 385154, TOTAL_2C_KB = 12.4;
const CAPS_2C = (() => {
  const md = readFileSync(join(ROOT, 'desk/README.md'), 'utf8'), at = md.indexOf('\n### 32.3 '), caps = {};
  const table = md.slice(at, md.indexOf('\n### 32.4 ', at));
  for (const m of table.matchAll(/^\| \*\*([\w-]+)\*\* \((\w+)\) \|.*\| ([\d.]+) KB \|\r?$/gm)) caps[m[1] + ' (' + m[2] + ')'] = Number(m[3]);
  return Object.freeze(caps);
})();

test('Q-61: slice 2c keeps the first visit within the post-move total + 12.4 KB (§32.3\'s caps)', () => {
  const caps = Object.values(CAPS_2C).reduce((a, x) => a + x, 0);
  assert.equal(caps.toFixed(1), TOTAL_2C_KB.toFixed(1), '§32.3\'s caps add up to 2c\'s ' + TOTAL_2C_KB + ' KB: ' + JSON.stringify(CAPS_2C));
  const gz = firstVisit('next.html').reduce((a, f) => a + f.gzip, 0), ceiling = Math.floor(POST_MOVE_GZIP + TOTAL_2C_KB * 1024);
  assert.ok(gz <= ceiling, 'first visit ' + gz + ' B gzip (' + (gz / 1024).toFixed(2) + ' KB), over 2c\'s ceiling ' + ceiling + ' B (' +
    POST_MOVE_GZIP + ' B after the Q-61 move + ' + TOTAL_2C_KB + ' KB; 2c so far +' + (gz - POST_MOVE_GZIP) + ' B). Caps (KB): ' +
    Object.entries(CAPS_2C).map(([k, v]) => k + ' ' + v).join(', ') + '. Measure with node tools/perf.mjs --sizes; over a cap, report it (§32.3).');
});

// Q-44: the modules that load on demand, each with its gzip -9 cap (bytes; their owners: W5 the
// texts and the end card (§30.9), W3 the alarm panel and its explainers; Q-49: the ?perf overlay; Q-56: the suburb card, 2b's card;
// 2b raised the texts 17 -> 18.5 KB (the city levers' three entries); 2c (Q-61) the texts to 20 KB, the alarm help to 5.5 KB).
const ON_DEMAND = Object.freeze({'content/text.js': 20 * 1024, 'app/alarmpanel.js': 6 * 1024, 'content/alarmhelp.js': 5.5 * 1024, 'app/endcard.js': 5 * 1024,
  'app/perf.js': 2 * 1024, 'app/suburbcard.js': 6 * 1024});

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

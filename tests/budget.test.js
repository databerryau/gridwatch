// F-11 (Phase 1b): the parts of the performance budget that do not depend on the machine.
// The first visit to next.html transfers <= 400 KB compressed, in files this repo serves
// itself (C-1). Frame and draw times are measured by `node tools/perf.mjs` and next.html?perf.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {firstVisit, BUDGET} from '../tools/perf.mjs';

test('F-11: the first visit to next.html is at most 400 KB gzip-compressed', () => {
  const files = firstVisit('next.html');
  const gz = files.reduce((a, f) => a + f.gzip, 0);
  assert.ok(gz <= BUDGET.firstVisitGzipBytes, 'first visit is ' + (gz / 1024).toFixed(1) + ' KB gzip over ' + files.length + ' files');
  // The walk found the whole game, not just the page: every layer of the site is in it.
  const paths = files.map(f => f.path);
  for (const p of ['next.html', 'desk/desk.css', 'app/boot.js', 'app/shell.js', 'app/game.js', 'sim/step.js', 'sim/physics.js',
    'desk/desk.js', 'render/map.js', 'render/livestack.js', 'audio/audio.js', 'content/text.js']) {
    assert.ok(paths.includes(p), p + ' is part of the first visit');
  }
});

test('F-11: next.html loads nothing the legacy game or the tools need (no tools/, tests/ or classic.html code)', () => {
  for (const f of firstVisit('next.html')) assert.ok(!/^(tools|tests)\//.test(f.path), f.path);
});

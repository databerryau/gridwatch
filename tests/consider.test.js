// tests/consider.test.js: the "? IF PRESSED" and ARMED line stays true (X-42).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {CONSIDER_REST_MS} from '../app/game.js';

const line = p => p.$('objective-level').textContent + ' ' + p.$('objective-text').textContent;
const hhmm = p => p.clock().slice(0, 5);
const plus = (t, m) => { const x = +t.slice(0, 2) * 60 + +t.slice(3) + m; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };

test('X-42: with GT·A\'s cover up at 06:00 the ARMED line\'s "by HH:MM, N min from now" follows the clock', () => {
  const p = openGame({seed: 20261007});
  p.to('06:00');
  p.click('guard-start-gta1');
  let seen = 0;
  for (let i = 0; i < 4; i++) {
    const t = line(p), m = t.match(/by (\d\d:\d\d), (\d+) min from now/);
    assert.ok(/ARMED/.test(t) && m, t);
    // the promise is read off now's clock: by = now + N, to the minute either side
    const now = hhmm(p), ok = [-1, 0, 1].some(e => plus(now, +m[2] + e) === m[1]);
    assert.ok(ok, now + ': ' + t);
    seen += m[1] !== plus('06:00', +m[2]) ? 1 : 0;
    p.real(1);
  }
  assert.ok(seen >= 2, 'the figures moved with the clock');
});

test('X-42: a pointer resting on a guard gives the line back to the plan after 4 real s', () => {
  const p = openGame({seed: 20261007});
  p.to('06:00');
  p.hover('guard-start-gta1');
  p.frame();
  assert.match(line(p), /IF PRESSED/);
  p.real(CONSIDER_REST_MS / 1000 + 0.2);
  assert.doesNotMatch(line(p), /IF PRESSED|ARMED/, 'the plan line is back: ' + line(p));
  p.hover(null); p.frame(); p.hover('guard-start-gta1'); p.frame();
  assert.match(line(p), /IF PRESSED/, 'a new rest shows it again');
});

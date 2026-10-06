// tests/lib/play.js, the fast headless play driver (tools/play.mjs is its command line): a smoke
// test. It boots the real page, jumps, reads what the player sees, presses a guard, and checks
// that a jump lands where frame-by-frame play does with the same snapshot (the frequency dial's
// figure aside: it eases and refreshes every 0.5 real s, so frame-by-frame play shows an older one).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame, parseTime, diffLooks} from './lib/play.js';

test('play driver: a jump shows what frame-by-frame play shows; look, buttons, click, until', () => {
  // frame-by-frame reference: 04:30:02 + 150 frames of 2 grid s = 04:35:02
  const slow = openGame({seed: 20261007});
  slow.frames(150);
  const fast = openGame({seed: 20261007});
  const r = fast.to('04:35:02');
  assert.deepEqual([r.why, r.at], ['target', '04:35:02']);
  assert.equal(fast.game.state.tick, slow.game.state.tick);
  assert.equal(fast.now, slow.now, 'the page clock advanced as 150 frames would');
  const noDial = l => l.split('\n').filter(x => !x.startsWith('DIAL ')).join('\n');
  assert.equal(noDial(fast.look()), noDial(slow.look()));

  const l = fast.look();
  assert.match(l, /^CLOCK 04:35:02 \| CRUISE 120× \|/m);
  assert.match(l, /^LINE \S/m);
  assert.match(l, /^BALANCE \S/m);
  assert.match(l, /^CTRL .*btn-pause "PAUSE"/m);
  assert.ok(fast.buttons().some(b => b.id === 'guard-start-gta1' && b.label === '○1'));

  // a guarded START by mouse: the first click lifts the cover and the line says what it would do
  fast.click('guard-start-gta1');
  const armed = fast.look();
  assert.match(armed, /guard-start-gta1 "START\?" \[pressed,ARMED/);
  assert.match(armed, /^LINE ● ARMED Press again to confirm\. START GT·A/m);
  assert.match(diffLooks(l, armed), /^CTRL .*guard-start-gta1 "START\?"/m);

  // until: no trip this early, so the guard stops it; the cover dropped on the way (2 real s)
  const u = fast.until('trip', {max: '+20m'});
  assert.equal(u.why, 'target');
  assert.equal(fast.game.state.tick, (parseTime('04:35:02') + 1200) * 50 + 100);
  assert.match(fast.look(), /guard-start-gta1 "○1"/);
  assert.throws(() => fast.click('no such control'), /no element or visible control/);

  // press(): three samples (before, the press frame, 0.5 real s after) and the diff across them
  const s = fast.press('guard-start-gta1');
  assert.match(s.before, /guard-start-gta1 "○1"/);
  assert.match(s.during, /guard-start-gta1 "START\?" \[pressed,ARMED/);
  assert.match(s.after, /guard-start-gta1 "START\?" \[pressed,ARMED/, 'the cover stays up for 0.5 s');
  assert.match(s.diff, /^CTRL .*guard-start-gta1 "START\?"/m);
});

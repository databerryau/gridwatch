// tests/lib/play.js, the fast headless play driver (tools/play.mjs is its command line): a smoke
// test. It boots the real page, jumps, reads what the player sees, presses a guard, and checks
// that a jump lands where frame-by-frame play does with the same snapshot (the frequency dial's
// figure aside: it eases and refreshes every 0.5 real s, so frame-by-frame play shows an older one).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame, diffLooks} from './lib/play.js';
import {badgeText} from '../render/format.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;

test('play driver: a jump shows what frame-by-frame play shows; look, buttons, click, until; the D-2 clock since Space', () => {
  // frame-by-frame reference: 150 frames from 04:30:09 (9 grid s each at the profile's 540x: 04:52:39); the jump goes where they went
  const slow = openGame({seed: 20261007});
  slow.frames(150);
  const at = slow.clock();
  const fast = openGame({seed: 20261007});
  const r = fast.to(slow.game.state.tick / TPS);
  assert.deepEqual([r.why, r.at], ['target', at]);
  assert.equal(fast.game.state.tick, slow.game.state.tick);
  assert.equal(fast.now, slow.now, 'the page clock advanced as 150 frames would');
  const noDial = l => l.split('\n').filter(x => !x.startsWith('DIAL ')).join('\n');
  assert.equal(noDial(fast.look()), noDial(slow.look()));

  const l = fast.look();
  assert.equal(fast.mode(), 'CRUISE');
  assert.ok(l.startsWith('CLOCK ' + at + ' | ' + badgeText(fast.vm().mode) + ' |'), l.split('\n')[0]); // (the rate read: slice 2c's profile)
  assert.match(l, /^LINE \S/m);
  assert.match(l, /^BALANCE \S/m);
  assert.match(l, /^CTRL .*btn-pause "PAUSE"/m);
  assert.ok(fast.buttons().some(b => b.id === 'station-start-gta' && b.label === 'START')); // (K-24: an AGC day's START is the station's word)

  // a guarded START by mouse: the first click lifts the cover and the line says what it would do
  fast.click('guard-start-gta1');
  const armed = fast.look();
  assert.match(armed, /station-start-gta "START\?" \[pressed,ARMED/);
  assert.match(armed, /^LINE ● ARMED Press again to confirm\. START GT·A/m);
  assert.match(diffLooks(l, armed), /^CTRL .*station-start-gta "START\?"/m);

  // until: no trip this early, so the guard stops it; the cover dropped on the way (a click's 5 real s: an hour at 540x)
  const t0 = fast.game.state.tick, u = fast.until('trip', {max: '+1h'});
  assert.equal(u.why, 'target');
  assert.equal(fast.game.state.tick, t0 + 3600 * TPS);
  assert.match(fast.look(), /station-start-gta "START"/);
  // D-2's clock (tools/play.mjs clock): every real second since Space is the profile's, the frames and jumps alike
  const ck = fast.clockReport();
  assert.ok(fast.spaceMs > 0 && Math.abs(ck.sinceS - (fast.now - fast.spaceMs) / 1000) < 1e-6 && Math.abs(ck.offS) < 0.1, JSON.stringify(ck));
  assert.throws(() => fast.click('no such control'), /no element or visible control/);

  // press(): three samples (before, the press frame, 0.5 real s after) and the diff across them
  const s = fast.press('guard-start-gta1');
  assert.match(s.before, /station-start-gta "START"/);
  assert.match(s.during, /station-start-gta "START\?" \[pressed,ARMED/);
  assert.match(s.after, /station-start-gta "START\?" \[pressed,ARMED/, 'the cover stays up for 0.5 s');
  assert.match(s.diff, /^CTRL .*station-start-gta "START\?"/m);
});

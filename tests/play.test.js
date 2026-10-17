// tests/lib/play.js, the fast headless play driver (tools/play.mjs is its command line): a smoke
// test. It boots the real page, jumps, reads what the player sees, presses a guard, and checks
// that a jump lands where frame-by-frame play does with the same snapshot (the frequency dial's
// figure aside: it eases and refreshes every 0.5 real s, so frame-by-frame play shows an older one),
// and so does realJump(), real() sampled. W6 (the test budget): skipTo(), to() without the frames,
// holds where a jump holds (a feeder card) and lands on the same sim state.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame, diffLooks, parseTime} from './lib/play.js';
import {badgeText} from '../render/format.js';
import * as A from '../app/alarms.js';
import {hashState} from '../sim/step.js';
import {realBetween} from '../sim/clock.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;

test('play driver: a jump shows what frame-by-frame play shows; look, buttons, click, until; the D-2 clock since Space', () => {
  // frame-by-frame reference: 60 frames from 04:30:09 (9 grid s each at the profile's 540x: 04:39:09); the jump goes where they went
  const slow = openGame({seed: 20261007});
  slow.frames(60);
  const at = slow.clock();
  const fast = openGame({seed: 20261007});
  const r = fast.to(slow.game.state.tick / TPS);
  assert.deepEqual([r.why, r.at], ['target', at]);
  assert.equal(fast.game.state.tick, slow.game.state.tick);
  assert.equal(fast.now, slow.now, 'the page clock advanced as 60 frames would');
  const noDial = l => l.split('\n').filter(x => !x.startsWith('DIAL ')).join('\n');
  assert.equal(noDial(fast.look()), noDial(slow.look()));

  const l = fast.look();
  assert.equal(fast.mode(), 'CRUISE');
  assert.ok(l.startsWith('CLOCK ' + at + ' | ' + badgeText(fast.vm().mode) + ' |'), l.split('\n')[0]); // (the rate read: slice 2c's profile)
  assert.match(l, /^LINE \S/m);
  assert.match(l, /^BALANCE \S/m);
  assert.match(l, /^CTRL .*btn-pause "PAUSE"/m);
  assert.ok(fast.buttons().some(b => b.id === 'station-start-gta' && b.label === 'START')); // (K-24: an AGC day's START is the station's word)
  // realJump(): half a real second, 29 virtual frames and one drawn, lands where 30 more frames do
  slow.frames(30);
  fast.realJump(0.5);
  assert.deepEqual([fast.game.state.tick, fast.now], [slow.game.state.tick, slow.now]);
  assert.equal(noDial(fast.look()), noDial(slow.look()));

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

test('play driver: skipTo() holds where a jump holds (RED7\'s card at 06:45) and lands on the same sim state; the page clock, D-2\'s clock and the annunciator move on as the page\'s', () => {
  const page = openGame({seed: 20261007}), skip = openGame({seed: 20261007}), at = p => [p.clock(), p.mode(), hashState(p.game.state)];
  const r = page.to('07:30', {stop: []}), now0 = skip.now, s = skip.skipTo('07:30');
  assert.deepEqual([s.why, s.at], [r.why, r.at]);
  assert.deepEqual([s.why, s.at], ['held:FEEDER-CARD', '06:45:00'], 'the hand-back holds the clock on its card');
  assert.deepEqual(at(skip), at(page));
  assert.ok(Math.abs(skip.now - now0 - 1000 * realBetween(parseTime('04:30') + 9, parseTime('06:45'))) < 50, 'the page clock: the profile\'s real s');
  for (const p of [page, skip]) p.key('Enter');   // RESTORE: RED7 closes, RED5 queued for 07:15
  const r2 = page.to('07:30', {stop: []}), s2 = skip.skipTo('07:30');
  assert.deepEqual([s2.why, s2.at, r2.why, r2.at], ['target', '07:30:00', 'target', '07:30:00']);
  assert.deepEqual(at(skip), at(page));
  // the page clock: the restore's FOCUS (2 grid s at 1x) and RED5's are real seconds off the profile, as the page's frames charge them
  assert.ok(Math.abs(skip.now - page.now) < 50, 'the page clock ' + skip.now + ' ms, the page\'s ' + page.now);
  // D-2's clock (clockReport): every skipped second counted, each in its part
  const ck = skip.clockReport(), pk = page.clockReport(), parts = c => Object.entries(c.parts).map(([k, x]) => [k, x.n, Math.round(x.realS * 10) / 10]);
  assert.ok(Math.abs(ck.sinceS - (skip.now - skip.spaceMs) / 1000) < 1e-6 && Math.abs(ck.offS - pk.offS) < 0.05, JSON.stringify([ck, pk]));
  assert.deepEqual(parts(ck), parts(pk));
  // the annunciator: the 06:55 dip set UNDER FREQ and cleared it inside the skip (the ring-back, ◇), and sounded once
  const panel = p => [A.TILES.map(x => x.id + ':' + p.game.alarms.tiles[x.id].state).join(' '), p.game.alarms.audible];
  assert.match(panel(page)[0], /underFreq:cleared/);
  assert.deepEqual(panel(skip), panel(page));
  assert.deepEqual(skip.game.state.log.filter(x => x.type === 'restore').map(x => [x.tick, x.args.district]),
    page.game.state.log.filter(x => x.type === 'restore').map(x => [x.tick, x.args.district]));
  assert.deepEqual(skip.game.state.log.filter(x => x.type === 'restore').map(x => x.args.district), ['RED7', 'RED5']);
  assert.deepEqual([page.h.mods.errors, skip.h.mods.errors], [[], []]);
});

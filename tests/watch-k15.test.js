// tests/watch-k15.test.js: K-15 amended (Q-97): slow motion for the first real fall; a rise compact with its own
// strip; the slow part ends after the extreme; the first directed shed's compact watch. And X-40's card on the
// same evening (tests/respond-card.test.js has its words on made-up catches).
//
// One game on 2026-10-14 for the page's tests, each going on from the one before (W6, the test budget: this file
// played the day twice and tests/respond-card.test.js a third time, 11 s of tests): tripFrom() and skipTo() run the
// hours with nothing to look at as the sim alone, stopping at each card for the page's answer (HAR4's hand-back at
// 06:55: Enter restores it and queues HAR3), and the page plays from a little before each moment: the 12:19 tie trip,
// the city desk's first shed at 18:30, the 19:19 trip and its card.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as D from '../app/director.js';
import * as W from '../app/watch.js';
import {RISE_STRIP} from '../app/shell.js';
import {observe} from '../sim/step.js';
import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;
const S = {};

test('K-15 (Q-97): on 2026-10-14 the 12:19 tie trip (a rise) plays compact, with its own strip', () => {
  const p = S.p = openGame({seed: 20261014});
  p.tripFrom('12:10');
  const tie = p.game.state.conts.at(-1);
  assert.ok(tie.lostMW < 0, 'a loss of load: ' + tie.lostMW);
  assert.equal(D.scheduleFor(p.game.director, tie), D.WATCH_SCHEDULE_COMPACT);
  assert.equal(p.game.director.seen.watch, false, 'a rise is not the first real fall');
  assert.deepEqual(RISE_STRIP.map(s => s[0]), ['SPIN', 'INVERTERS', 'SETTLE']);
  p.key('Enter');
});

test('K-15 (Q-97): the full watch\'s 0.15x part ends half a second after the extreme, never before T+2 s nor after T+3 s; the grid clock still advances 30 s', () => {
  const c = {startTick: 0, extremeTick: 60};                  // the extreme at T+1.2 s
  const at = s => D.watchRate(Math.round(s * TPS), D.WATCH_SCHEDULE, c);
  assert.deepEqual([at(1.9), at(2.0), at(2.9), at(3.0)], [0.15, 1, 1, 1], 'past T+2 s and the extreme + 0.5 s: 1x');
  const late = {startTick: 0, extremeTick: 120};              // at T+2.4 s
  const atL = s => D.watchRate(Math.round(s * TPS), D.WATCH_SCHEDULE, late);
  assert.deepEqual([atL(2.5), atL(2.9), atL(2.92), atL(3.0)], [0.15, 0.15, 1, 1]);
  const never = {startTick: 0, extremeTick: 200};             // at T+4 s: the slow part ends at T+3 s
  assert.equal(D.watchRate(Math.round(2.96 * TPS), D.WATCH_SCHEDULE, never), 0.15);
  assert.equal(D.watchRate(Math.round(3 * TPS), D.WATCH_SCHEDULE, never), 1);
  // D-2's arithmetic: 29 real s at its longest, 22.3 at its shortest; the grid advances WATCH_S either way
  assert.ok(Math.abs(D.watchRealS(D.WATCH_SCHEDULE) - 29) < 1e-9 && Math.abs(D.watchRealS(D.WATCH_SCHEDULE, 2) - (2 / 0.15 + 8 + 2)) < 1e-9);
  assert.equal(D.WATCH_SCHEDULE.at(-1).toS, V.WATCH_S);
});

test('K-15 (Q-97): the first directed shed outside a contingency plays a compact watch with its sentence, once a browser; the desk stays the player\'s', () => {
  const p = S.p;
  p.skipTo('18:20');
  for (let n = 0; n < 40 && !p.game.director.shedW; n++) {
    const r = p.until(({game}) => game.director.shedW !== null, {max: '21:00', line: 'near'});
    if (r.why.startsWith('held')) p.key('Enter');
  }
  p.frame();
  assert.equal(p.mode(), 'SHED-WATCH');
  const m = D.modeOf(p.game.director, p.game.state);
  assert.equal(m.locked, false, 'not a contingency: the desk is the player\'s');
  assert.match(p.look(), /^WATCH T\+\d\.\d\d s ×0\.5 \| You are [\d,]+ MW short: the city desk sheds [A-Z]+\d, \d+ MW, to hold frequency\. \| $/m);
  assert.equal(p.game.director.seen.shed, true);
  assert.equal(D.startShedWatch(p.game.director, p.game.state, 'again'), false, 'once a browser');
});

test('K-15 (Q-97): on 2026-10-14 the 19:19 trip, the first real fall, plays full (the rise and the shed watch before it did not count)', () => {
  const p = S.p;
  S.c = p.tripFrom('19:10');
  const fall = p.game.state.conts.at(-1);
  assert.ok(fall.lostMW >= D.FULL_WATCH_MW);
  assert.equal(D.scheduleFor(p.game.director, fall), D.WATCH_SCHEDULE);
});

test('X-40: the 2026-10-14 19:19 card prints no catch of zero or less as a number; FOS asks; load relief explained', () => {
  const p = S.p, c = S.c, k = c.caught;
  assert.ok(k.batteryMW + k.guardMW < 0 && k.governorsMW < 0, 'the review\'s case: the battery and the governors caught less than nothing');
  const card = W.respondCard(observe(p.game.state), c);
  assert.doesNotMatch(card.lines[1], /-\d|−\d/, card.lines[1]);
  assert.match(card.lines[1], /battery empty/);
  assert.match(card.lines[1], /governors spent/);
  assert.match(card.lines[0], /FOS asks: back in 49\.85–50\.15 Hz within 5:00\.$/);
});

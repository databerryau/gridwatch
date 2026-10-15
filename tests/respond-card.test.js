// tests/respond-card.test.js: the K-16 respond card's words (X-40).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../app/watch.js';
import {observe} from '../sim/step.js';
import {openGame} from './lib/play.js';

test('X-40: the 2026-10-14 19:19 card prints no catch of zero or less as a number; FOS asks; load relief explained', () => {
  const p = openGame({seed: 20261014}), c = p.tripFrom('19:10'), k = c.caught;
  assert.ok(k.batteryMW + k.guardMW < 0 && k.governorsMW < 0, 'the review\'s case: the battery and the governors caught less than nothing');
  const card = W.respondCard(observe(p.game.state), c);
  assert.doesNotMatch(card.lines[1], /-\d|−\d/, card.lines[1]);
  assert.match(card.lines[1], /battery empty/);
  assert.match(card.lines[1], /governors spent/);
  assert.match(card.lines[0], /FOS asks: back in 49\.85–50\.15 Hz within 5:00\.$/);
});

test('X-40: a GUARD the player set is named beside the battery\'s catch; the load relief says what it is', () => {
  const c = {n: 2, lostMW: 600, extremeHz: 49.41, secureByTick: 0, caught: {inertiaMW: 0, batteryMW: 94, guardMW: 400, governorsMW: 300, loadReliefMW: 30, uflsMW: 0}};
  const obs = {tick: 0, s: 0, sec: {lMW: 0, r5MW: 0, level: 'SECURE'}, districts: [], battery: {guardMW: 400}};
  assert.equal(W.respondCard(obs, c).lines[1], 'Caught by: spin → battery 494 MW (your GUARD 400) → governors 300 MW → load relief (motors slow) 30 MW.');
  obs.battery.guardMW = 0;
  assert.match(W.respondCard(obs, c).lines[1], /battery 494 MW → /);
  // a rise: the same words for nothing given
  const rise = {...c, lostMW: -300, extremeHz: 50.3, caught: {inertiaMW: 0, batteryMW: 5, guardMW: 0, governorsMW: 20, loadReliefMW: 0, uflsMW: 0}};
  assert.equal(W.respondCard(obs, rise).lines[1], 'Caught by: spin → battery full → governors at minimum.');
});

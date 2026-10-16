// tests/respond-card.test.js: the K-16 respond card's words (X-40). (Its accept on the review's 2026-10-14 19:19 card
// is tests/watch-k15.test.js's, which plays that evening for K-15 anyway: W6, the test budget.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../app/watch.js';

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

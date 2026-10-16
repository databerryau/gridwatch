// tests/hand.test.js: HAND tells the truth (X-43): no auto-synchroniser in its times, a SYNC ask, no "after the trip" without one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observe} from '../sim/step.js';
import {guardStillText} from '../app/objective.js';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import {V} from '../sim/params.js';

const line = p => p.$('objective-text').textContent;

test('X-43: at 04:30 on 2026-10-14 HAND says 45 min where AGC says 49; observe() leaves the auto-sync out', () => {
  const hand = openGame({seed: 20261014, agc: false}), agc = openGame({seed: 20261014});
  G.ui(hand.game, {do: 'coach'});   // (O-8: a HAND day is a second shift, in problem mode unless COACH is on)
  hand.to('04:30'); agc.to('04:30');
  assert.match(line(hand), /Start CCGT 2 now: it takes 45 min to reach the grid\./);
  assert.match(line(agc), /Start CCGT 2 now: it takes 49 min to reach the grid\./);
  const h = observe(hand.game.state).units.find(u => u.id === 'ccgt2'), a = observe(agc.game.state).units.find(u => u.id === 'ccgt2');
  assert.equal(a.startToMinS - h.startToMinS, 240);
});

test('X-43: an obedient HAND run gets a SYNC ask at full speed', () => {
  const p = openGame({seed: 20261014, agc: false});
  p.to('04:30');
  p.send({type: 'start', unit: 'ccgt2'});
  p.until(({state}) => state.units.find(u => u.id === 'ccgt2').mode === 'ready', {max: '06:00'});
  p.until('line', {max: '+5m'});
  assert.match(line(p), /^CCGT 2 is at full speed\. HAND has no auto-sync: press its START to open the synchroscope, then SYNC\.$/);
  assert.ok(p.vm().glow.has('guard-start-ccgt2'));
});

test('X-43: the GUARD line says "after the trip" only when there was one', () => {
  const p = openGame({seed: 20261014});
  p.to('11:30', {stop: []});
  const obs = observe(p.game.state);
  obs.battery.ffrMW = 120;
  obs.contingencies = [];
  assert.equal(guardStillText(obs), 'Frequency is high: the battery GUARD is still giving its 120 MW since frequency fell. Turn it down to 0 MW; it can go back up once the GUARD has re-armed.');
  obs.contingencies = [{startS: obs.s - 600}];
  assert.match(guardStillText(obs), /120 MW after the trip./);
});

test('D-7: with empty storage no HAND choice shows; after one finished shift it does', () => {
  assert.equal(openGame({take: false}).$('btn-hand').hidden, true, 'a first visit');
  // a shift played to its end (headless) in a browser's storage, then the next visit
  const mem = new Map(), storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v))};
  const game = G.createGame({seed: 20261014, scenario: G.scenarioForSeed, storage});
  G.takeDesk(game);
  G.runTo(game, V.DAY_TICKS);
  G.buildVm(game, {nowMs: 1});
  assert.equal(JSON.parse(mem.get(G.SEEN_KEY)).shifts, 1);
  const next = openGame({take: false, storage});
  assert.equal(next.$('btn-hand').hidden, false);
  assert.match(next.$('btn-hand').title, /no AGC and no auto-sync .*\(harder\)/);
});


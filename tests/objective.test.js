// SPEC §9.1 Q-18: the commitment is the player's. The system operator in 'player' mode never
// starts a unit; the standing objective (app/objective.js) says what the desk needs next. These
// tests prove the two halves of that: a day with no input runs short, and a player who does
// only what the objective line says gets through it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, observe, applyInput, replay, hashState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {DESK, CLASSIC, getScenario} from '../content/scenarios.js';
import * as SYS from '../app/system.js';
import * as PV from '../app/planview.js';
import {objective, capacityShort} from '../app/objective.js';
import {slowOnly} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const tickAt = h => Math.round((h - V.DAY_START_H) * 3600 * TPS);

/** A day on DESK in 'player' mode; follow: do what the objective says, once a grid minute. */
function day(seed, follow, untilH) {
  const st = createState(seed, DESK), sys = SYS.createSystem({commit: 'player'});
  const said = [];
  const end = untilH === undefined ? Infinity : tickAt(untilH);
  while (!st.over && st.tick < end) {
    if (follow && st.tick > V.PLAYER_START_TICK && st.tick % (60 * TPS) === 2) {
      const obs = observe(st);
      if (!obs.inWatch) {
        const o = objective(obs, {edited: sys.edited, planview: PV});
        if (o.action) {
          said.push(o);
          if (o.action.redispatch) { const r = SYS.redispatch(sys, st); if (r.input) applyInput(st, r.input, []); }
          else applyInput(st, o.action, []);
        }
      }
    }
    step(st, SYS.systemInputs(sys, st));
  }
  return {st, sys, said, score: observe(st).score};
}

test('the DESK scenario is the classic day with CCGT 2 off at 04:00', () => {
  assert.equal(getScenario('desk'), DESK);
  const a = observe(createState(7, CLASSIC)), b = observe(createState(7, DESK));
  const on = o => o.units.filter(u => u.mode === 'on').map(u => u.id);
  assert.deepEqual(on(a).filter(id => !on(b).includes(id)), ['ccgt2']);
  assert.deepEqual(a.forecast.demandP50, b.forecast.demandP50, 'the same day');
});

test('player mode: the system never books a start or a stop, and re-dispatches what is committed', () => {
  const {st, sys} = day(7, false, 8);
  const loads = st.log.filter(r => r.type === 'planLoad');
  assert.ok(loads.length >= 20, 'a dispatch every 5 grid-minutes: ' + loads.length);
  for (const r of loads) { assert.deepEqual(r.args.starts, []); assert.deepEqual(r.args.stops, []); }
  assert.equal(st.log.filter(r => r.type === 'start' || r.type === 'planStart').length, 0);
  assert.equal(sys.commit, 'player');
  // F-6: the day is its log.
  assert.equal(hashState(replay(7, DESK, st.log, {untilTick: st.tick})), hashState(st));
});

test('the objective sees the morning shortfall ahead and names the CCGT, with its lead time', () => {
  const st = createState(7, DESK), sys = SYS.createSystem({commit: 'player'});
  while (st.tick < V.PLAYER_START_TICK + 120 * TPS) step(st, SYS.systemInputs(sys, st));
  const obs = observe(st);
  const short = capacityShort(obs);
  assert.ok(short && short.atS > obs.s + 1800, 'short later this morning, not now');
  const o = objective(obs, {edited: false, planview: PV});
  assert.match(o.text, /^You will be \d+ MW short from 0\d:\d\d\. Start RIVERTON CCGT 2/);
  assert.match(o.text, /it takes 49 min to reach the grid/);
  assert.deepEqual(o.targets, ['guard-start-ccgt2']);
  assert.ok(['plan', 'act'].includes(o.level));
  if (o.level === 'plan') assert.equal(o.action, null, 'nothing to do yet: the line says by when');
});

test('levers held by hand with the plan short: the objective says RE-DISPATCH', () => {
  const st = createState(7, DESK), sys = SYS.createSystem({commit: 'player'});
  while (st.tick < V.PLAYER_START_TICK + 600 * TPS) step(st, SYS.systemInputs(sys, st));
  assert.equal(applyInput(st, {type: 'basePoint', station: 'coal', mw: 1000}, []).ok, true); // the coal lever pulled down
  for (let i = 0; i < 400 * TPS; i++) step(st, SYS.systemInputs(sys, st));
  assert.equal(sys.edited, true, 'a hand move takes the levers over');
  const o = objective(observe(st), {edited: sys.edited, planview: PV});
  assert.equal(o.level, 'crit');
  assert.match(o.text, /RE-DISPATCH \(N\) hands every lever back/);
  assert.deepEqual(o.action, {redispatch: true});
  const r = SYS.redispatch(sys, st);
  assert.equal(applyInput(st, r.input, []).ok, true);
  assert.equal(sys.edited, false);
});

test('a day with no input runs short by mid-morning; following the objective keeps the lights on (seed 7)', () => {
  const idle = day(7, false, 13);
  assert.ok(idle.score.unservedMWh > 1000, 'no input: ' + idle.score.unservedMWh.toFixed(0) + ' MWh unserved by 13:00');
  const led = day(7, true, 13);
  assert.equal(led.score.unservedMWh, 0, 'following the line: nothing unserved by 13:00');
  assert.ok(led.said.some(o => /RIVERTON CCGT 2/.test(o.text)), 'it started the CCGT');
  for (const o of led.said) assert.ok(o.text.length <= 170, 'one line: ' + o.text);
});

test('following the objective for whole days: never black, zero unserved on most seeds (slow)', {...slowOnly()}, () => {
  const seeds = [1, 2, 3, 4, 5, 7, 8, 11, 13, 20260930, 20261001];
  let clean = 0;
  for (const seed of seeds) {
    const r = day(seed, true);
    assert.equal(r.st.black, false, 'seed ' + seed);
    if (r.score.unservedMWh === 0) clean++;
    assert.ok(day(seed, false).score.unservedMWh > 10000, 'seed ' + seed + ' with no input is a bad day');
  }
  assert.ok(clean >= 9, clean + ' of ' + seeds.length + ' clean');
});

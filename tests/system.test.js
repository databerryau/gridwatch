// Phase 1a (sim agent): app/system.js, the game's system operator (desk/README.md §3.4; SPEC L-0,
// A-1 RE-DISPATCH, F-6). Whole no-input days on more seeds run with GRIDWATCH_SLOW=1.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe, hashState, replay} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {createSystem, systemInputs, redispatch} from '../app/system.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {SLOW, ticksAt, injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const SEEDS = n => Array.from({length: n}, (_, i) => i + 1);

/** A game day driven by the system only (and any extra inputs by tick), to untilTick. */
function gameDay(seed, untilTick = V.DAY_TICKS, extra = new Map(), state) {
  const s = state || createState(seed, CLASSIC), sys = createSystem();
  while (!s.over && s.tick < untilTick) {
    const x = systemInputs(sys, s);
    const more = extra.get(s.tick);
    step(s, more ? x.concat(typeof more === 'function' ? more(sys, s) : more) : x);
  }
  return {s, sys};
}

test('L-0: at 04:30 the system loads the pre-dispatch plan (a logged planLoad, stops included); the levers follow it', () => {
  const {s} = gameDay(1, ticksAt(6));
  const loads = s.log.filter(r => r.type === 'planLoad');
  assert.equal(loads.length, 1);
  assert.equal(loads[0].tick, V.PLAYER_START_TICK + 1);
  assert.equal(s.plan.madeAtS, V.PLAYER_START_S);
  assert.ok(s.plan.stations.some(p => p.doneS > V.PLAYER_START_S), 'keys executed');
  assert.ok(loads[0].args.starts.length + loads[0].args.stops.length > 0, 'the L-0 commitment is booked');
});

test('a no-input game day (system only) is the planOnly proxy\'s day, hash for hash', () => {
  const until = ticksAt(9);
  const {s} = gameDay(4, until);
  const r = runPar(4, CLASSIC, {proxy: 'planOnly', untilTick: until});
  assert.equal(hashState(s), hashState(r.state));
  assert.deepEqual(s.log, r.log);
});

test('L-0 accept: a no-input game day (the system alone) never ends black (seeds 1-6; 1-30 with GRIDWATCH_SLOW=1)', () => {
  for (const seed of SEEDS(SLOW ? 30 : 6)) {
    const {s} = gameDay(seed);
    assert.equal(s.black, false, 'seed ' + seed);
    assert.equal(s.over, true);
  }
});

test('A-1 RE-DISPATCH: refused before 04:30, during the watch and after the day; then a planLoad over the player\'s commitment', () => {
  const s = injectTrip(createState(2, CLASSIC), V.PLAYER_START_S + 3600), sys = createSystem();
  assert.match(redispatch(sys, s).reason, /04:30/);
  while (s.tick < ticksAt(5)) step(s, systemInputs(sys, s));
  // The player commits GT·A and books a stop for a CCGT unit; RE-DISPATCH keeps both.
  assert.equal(applyInput(s, {type: 'start', unit: 'gta1'}).ok, true);
  assert.equal(applyInput(s, {type: 'planStop', unit: 'ccgt2', atS: V.PLAYER_START_S + 7200}).ok, true);
  const r = redispatch(sys, s);
  assert.equal(r.reason, '');
  assert.equal(r.input.type, 'planLoad');
  assert.equal(r.input.fromS, Math.floor(s.tick / TPS));
  assert.deepEqual(r.input.stops.find(b => b[0] === 'ccgt2'), ['ccgt2', V.PLAYER_START_S + 7200], 'the booked stop is kept');
  assert.ok(r.input.stations.gta.length > 0, 'the unit the player started is dispatched');
  assert.equal(applyInput(s, r.input).ok, true);
  while (s.contIdx < 0) step(s, systemInputs(sys, s));
  step(s);
  assert.match(redispatch(sys, s).reason, /watch/);
});

test('L-0 re-flow: while districts are dark the system re-dispatches for the lit load; the periodic re-flow waits while the player owns the plan', () => {
  const s = createState(3, CLASSIC), sys = createSystem();
  while (s.tick < ticksAt(5)) step(s, systemInputs(sys, s));
  s.sec.level = 'SHORT'; // A-3: DIRECT SHED needs a shortfall (test poke of the gauge)
  assert.equal(applyInput(s, {type: 'directShed'}).ok, true);
  s.sec.level = 'SHORT';
  assert.equal(applyInput(s, {type: 'directShed'}).ok, true);
  const n0 = s.log.filter(r => r.type === 'planLoad').length;
  while (s.tick < ticksAt(5, 2)) step(s, systemInputs(sys, s));
  assert.equal(s.log.filter(r => r.type === 'planLoad').length, n0 + 1, 'the dark share moved: a re-flow');
  // The player edits the plan: the 30-min re-flow waits (their edits win) ...
  assert.equal(applyInput(s, {type: 'basePoint', station: 'coal', mw: 2100}).ok, true);
  while (s.tick < ticksAt(5, 2) + (V.PLAN_REFLOW_S + 120) * TPS) step(s, systemInputs(sys, s));
  assert.equal(s.log.filter(r => r.type === 'planLoad').length, n0 + 1, 'no periodic re-flow over the player\'s plan');
  // ... until RE-DISPATCH hands the plan back.
  const r = redispatch(sys, s);
  assert.equal(applyInput(s, r.input).ok, true);
  const n1 = s.log.filter(x => x.type === 'planLoad').length;
  while (s.tick < ticksAt(5, 2) + (2 * V.PLAN_REFLOW_S + 240) * TPS) step(s, systemInputs(sys, s));
  assert.ok(s.log.filter(x => x.type === 'planLoad').length > n1, 'the periodic re-flow resumed');
});

test('F-6: a game day (system, RE-DISPATCH, desk inputs) replays from its log; the system resumes from a JSON copy', () => {
  const until = ticksAt(7);
  const extra = new Map([
    [ticksAt(5) + 7, [{type: 'planKey', station: 'gtb', atS: V.PLAYER_START_S + 3600, mw: 600}]],
    [ticksAt(5, 30) + 3, (sys, s) => [redispatch(sys, s).input]],
    [ticksAt(6) + 11, [{type: 'tie', mw: 500}]],
  ]);
  const a = gameDay(5, until, extra);
  assert.ok(a.s.log.some(r => r.type === 'planKey') && a.s.log.filter(r => r.type === 'planLoad').length >= 2);
  const b = replay(5, CLASSIC, a.s.log, {untilTick: until});
  assert.equal(hashState(b), hashState(a.s));
  // Resume: the state and the system as JSON copies, mid-day.
  const mid = gameDay(5, ticksAt(6), extra);
  const s2 = JSON.parse(JSON.stringify(mid.s)), sys2 = JSON.parse(JSON.stringify(mid.sys));
  while (s2.tick < until) {
    const x = systemInputs(sys2, s2);
    const more = extra.get(s2.tick);
    step(s2, more ? x.concat(more) : x);
  }
  assert.equal(hashState(s2), hashState(a.s));
  assert.deepEqual(observe(s2).plan, observe(a.s).plan);
});

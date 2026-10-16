// Phase 1a (sim agent): app/system.js, the game's system operator (desk/README.md §3.4; SPEC L-0,
// A-1 RE-DISPATCH, F-6). One whole no-input day (seed 4, the heat day) is shared by the
// hash-for-hash test and the L-0 accept; the other tests stop at the hour they need. (Phase 2a's
// player mode, §21.3, and tools/follow.mjs's helpers are tests/system-player.test.js's: W6, the
// test budget, the two were 6-8 s in one file.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe, hashState, replay} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {createSystem, systemInputs, redispatch, heldByHand} from '../app/system.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {ticksAt, injectTrip, legacyDesk} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;

/** A game day driven by the system only (and any extra inputs by tick), to untilTick; `from` ({s, sys}) carries on that day. */
function gameDay(seed, untilTick = V.DAY_TICKS, extra = new Map(), from) {
  const {s, sys} = from || {s: createState(seed, CLASSIC), sys: createSystem()};
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

// Seed 4's no-input game day, run once: to 09:00 (its hash and log kept), then on to the end of
// the day by the L-0 accept. Seed 4 is the heat day, the one on which the plan alone sheds the
// most (tools/baseline-v4.golden.md, planOnly: 33,866 MWh, against 16,981-18,271 on seeds 1-2).
let day4 = null;
function noInputDay4() {
  if (!day4) {
    day4 = gameDay(4, ticksAt(9));
    day4.at9 = {tick: day4.s.tick, hash: hashState(day4.s), log: JSON.parse(JSON.stringify(day4.s.log))};
  }
  return day4;
}

test('a no-input game day (system only) is the planOnly proxy\'s day, hash for hash', () => {
  const until = ticksAt(9);
  const {at9} = noInputDay4();
  assert.equal(at9.tick, until);
  const r = runPar(4, CLASSIC, {proxy: 'planOnly', untilTick: until});
  assert.equal(at9.hash, hashState(r.state));
  assert.deepEqual(at9.log, r.log);
});

test('L-0 accept: a no-input game day (the system alone) never ends black (seed 4, the heat day, carried on from its 09:00 state)', () => {
  const d = noInputDay4();
  gameDay(4, V.DAY_TICKS, undefined, d);
  assert.equal(d.s.black, false, 'seed 4');
  assert.equal(d.s.over, true);
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

test('heldByHand: a lever or plan key moved by hand counts at once, not at the system\'s next look; a commitment input is not one', () => {
  const s = createState(7, legacyDesk()), sys = createSystem({commit: 'player'}); // (today's desk events: the plan keeps CCGT 2 out on seed 7)
  // 04:32:10 and a half: the system looked at 04:32:00 and looks again at 04:33:00
  while (s.tick < V.PLAYER_START_TICK + 130 * TPS + 25) step(s, systemInputs(sys, s));
  assert.equal(heldByHand(sys, s), false);
  assert.equal(applyInput(s, {type: 'start', unit: 'ccgt2'}).ok, true);
  assert.equal(heldByHand(sys, s), false, 'a START is the player\'s commitment, not a hand edit of the levers');
  const coal = observe(s).stations.find(x => x.id === 'coal');
  assert.equal(applyInput(s, {type: 'basePoint', station: 'coal', mw: coal.basePointMW + 120}).ok, true);
  assert.equal(sys.edited, false, 'the system has not looked yet');
  assert.equal(heldByHand(sys, s), true);
  assert.equal(sys.edited, true, 'the flag the system reads is the fresh one');
  // the system's own look agrees, and leaves the plan to the player (no planLoad over the hand edit)
  const n = s.log.length;
  while (s.tick < V.PLAYER_START_TICK + 200 * TPS) step(s, systemInputs(sys, s));
  assert.equal(sys.edited, true);
  assert.deepEqual(s.log.slice(n).filter(r => r.type === 'planLoad'), []);
  // RE-DISPATCH hands the levers back
  assert.equal(applyInput(s, redispatch(sys, s).input).ok, true);
  assert.equal(heldByHand(sys, s), false);
});

test('F-6: a game day (system, RE-DISPATCH, desk inputs) replays from its log; the system resumes from a JSON copy', () => {
  const until = ticksAt(7);
  const extra = new Map([
    [ticksAt(5) + 7, [{type: 'planKey', station: 'gtb', atS: V.PLAYER_START_S + 3600, mw: 600}]],
    [ticksAt(5, 30) + 3, (sys, s) => [redispatch(sys, s).input]],
    [ticksAt(6) + 11, [{type: 'tie', mw: 500}]],
  ]);
  // One day: to 06:00, where the state and the system are copied as JSON (the resume below), then on to 07:00.
  const a = gameDay(5, ticksAt(6), extra);
  const s2 = JSON.parse(JSON.stringify(a.s)), sys2 = JSON.parse(JSON.stringify(a.sys));
  gameDay(5, until, extra, a);
  assert.ok(a.s.log.some(r => r.type === 'planKey') && a.s.log.filter(r => r.type === 'planLoad').length >= 2);
  const b = replay(5, CLASSIC, a.s.log, {untilTick: until});
  assert.equal(hashState(b), hashState(a.s));
  // Resume: the state and the system as JSON copies, mid-day.
  while (s2.tick < until) {
    const x = systemInputs(sys2, s2);
    const more = extra.get(s2.tick);
    step(s2, more ? x.concat(more) : x);
  }
  assert.equal(hashState(s2), hashState(a.s));
  assert.deepEqual(observe(s2).plan, observe(a.s).plan);
});

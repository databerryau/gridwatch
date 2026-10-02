// Phase 1a (sim agent): app/system.js, the game's system operator (desk/README.md §3.4; SPEC L-0,
// A-1 RE-DISPATCH, F-6). Whole no-input days on more seeds run with GRIDWATCH_SLOW=1.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe, hashState, replay} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {createSystem, systemInputs, redispatch, commitSig, DISPATCH_S} from '../app/system.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {SLOW, ticksAt, injectTrip} from './lib/sim-helpers.js';
import {followDay} from './lib/follow.js';
import {quotedSaving, stopLines, skipping, planCost, PLAN_COST_KEYS} from '../tools/follow.mjs';

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

// ---------------------------------------------------------------- Phase 2a (desk/README.md §21.3): the game's day, the battery in the dispatch

/** A game day in 'player' mode on `scn` with no player input, to untilTick. */
function playerDay(seed, scn, untilTick) {
  const s = createState(seed, scn), sys = createSystem({commit: 'player'});
  while (!s.over && s.tick < untilTick) step(s, systemInputs(sys, s));
  return {s, sys};
}
const planLoads = s => s.log.filter(r => r.type === 'planLoad').length;
/** What the dispatcher's plan asks the units and the tie to cover in the q-th column from now (its working copy in the memo). */
function planCover(sys, s, q) {
  const P = sys.memo.plan, k = Math.floor((Math.floor(s.tick / TPS) - P.madeAtS) / P.stepS) + q;
  return P.tie[k] + P.lever.reduce((a, col) => a + col[k], 0) + P.gap[k];
}

test('§21.3 commitSig: the dispatch is made over the battery\'s mode, order and GUARD too (not its state of charge)', () => {
  const obs = observe(createState(2, DESK)), sig = commitSig(obs);
  const poked = o => { const x = JSON.parse(JSON.stringify(obs)); Object.assign(x.battery, o); return commitSig(x); };
  assert.equal(poked({}), sig);
  assert.equal(poked({socMWh: 123, schedMW: 40, outMW: 40, agcTrimMW: -20}), sig, 'the level and AGC\'s trim are not a commitment');
  assert.notEqual(poked({mode: 'charge', orderMW: 300}), sig);
  assert.notEqual(poked({mode: 'charge', orderMW: 300}), poked({mode: 'charge', orderMW: 350}));
  assert.notEqual(poked({mode: 'charge', orderMW: 300}), poked({mode: 'discharge', orderMW: 300}));
  assert.notEqual(poked({mode: 'charge', orderMW: 300}), poked({mode: 'charge', orderMW: 300, fullHold: true}), 'a charge paused on a full battery is no longer a load');
  assert.notEqual(poked({guardMW: 100}), sig);
});

test('§21.3 player mode: a battery order re-flows the plan at the system\'s next look, not at the next 5-minute dispatch; the plan carries it', () => {
  const {s, sys} = playerDay(2, DESK, ticksAt(10));
  let n = planLoads(s);
  while (planLoads(s) === n) step(s, systemInputs(sys, s)); // just after a 5-minute dispatch
  const before = planCover(sys, s, 2), t0 = s.tick;
  n = planLoads(s);
  assert.equal(applyInput(s, {type: 'battery', mode: 'charge', mw: 300}).ok, true);
  while (planLoads(s) === n) step(s, systemInputs(sys, s));
  const waitS = (s.tick - t0) / TPS;
  assert.ok(waitS <= V.PAR_DECIDE_EVERY_S + 1 && waitS < DISPATCH_S / 2, 're-dispatched ' + waitS.toFixed(0) + ' s after the order');
  const after = planCover(sys, s, 2);
  assert.ok(Math.abs(after - before - 300) < 60, 'the charge is load in the plan: +' + (after - before).toFixed(0) + ' MW');
  // The GUARD changes what the order can be (K-5): a re-dispatch too.
  n = planLoads(s);
  const t1 = s.tick;
  assert.equal(applyInput(s, {type: 'guard', mw: 300}).ok, true);
  while (planLoads(s) === n) step(s, systemInputs(sys, s));
  assert.ok((s.tick - t1) / TPS <= V.PAR_DECIDE_EVERY_S + 1);
  assert.ok(Math.abs(planCover(sys, s, 2) - before - 200) < 60, 'CHARGE 300 under a 300-MW GUARD is 200 MW of load');
  // Every one of them is a logged planLoad with no booking: the day still replays (F-6).
  for (const r of s.log.filter(x => x.type === 'planLoad')) { assert.deepEqual(r.args.starts, []); assert.deepEqual(r.args.stops, []); }
  assert.equal(hashState(replay(2, DESK, s.log, {untilTick: s.tick})), hashState(s));
});

test('§21.3 player mode in the belly: units at their floor, the tie at the export limit, the dispatch spilling the rest; no shortfall from what it holds back', () => {
  // A mild weekend noon with no input: the weekend commitment (three coal, one CCGT) and more sun than load.
  const {s, sys} = playerDay(1, DESK_WEEKEND, ticksAt(12, 30));
  const obs = observe(s);
  const spill = obs.wind.autoMW + obs.solar.autoMW;
  assert.ok(spill > V.SURPLUS_MIN_MW, 'the fixture: ' + spill.toFixed(0) + ' MW being spilled');
  // (a lever key is written only for a move of PLAN_KEYFRAME_MIN_MW or more, so "at the floor" is within that)
  for (const u of obs.units) if (u.mode === 'on' && u.cls !== 'hydro') assert.ok(u.basePointMW < u.minMW + V.PLAN_KEYFRAME_MIN_MW, u.id + ' at ' + u.basePointMW.toFixed(0) + ' MW');
  assert.ok(obs.tie.setMW < -obs.tie.exportLimitMW + V.PLAN_KEYFRAME_MIN_MW, 'the tie exports to its limit: ' + obs.tie.setMW);
  // The plan shows the surplus (a negative gap) in the coming columns, never a shortfall: the
  // forecast it dispatches for is what is AVAILABLE, not the curtailed output.
  for (const q of [0, 1, 2, 6]) {
    const P = sys.memo.plan, k = Math.floor((obs.s - P.madeAtS) / P.stepS) + q;
    assert.ok(P.gap[k] < -V.SURPLUS_MIN_MW, 'column +' + (q + 1) * 5 + ' min: gap ' + P.gap[k].toFixed(0) + ' MW');
  }
  assert.ok(Math.abs(obs.agc.requestMW) < V.PAR_REBASE_MW, 'AGC is not carrying the plan: ' + obs.agc.requestMW.toFixed(0) + ' MW');
  assert.ok(Math.abs(obs.f.hz - V.F0_HZ) < 0.1);
});

// ---------------------------------------------------------------- tools/follow.mjs (the hint-following player's command line)

test('tools/follow.mjs: a STOP line\'s quoted saving is read from the line; the followed STOPs and the day with one skipped', () => {
  assert.equal(quotedSaving({text: 'RIVERTON CCGT 2 is not needed until 16:10. Stop it: saves about $41,000. Start it again by 15:21.'}), 41000);
  assert.equal(quotedSaving({text: 'A start costs $8,000. Stopping GT·A now saves $12,500 by 15:00.'}), 12500);
  assert.equal(quotedSaving({text: 'Stop it: saves about $41,000.', saving: 38250}), 38250, 'a number on the line wins over its text');
  assert.equal(quotedSaving({text: 'Stop it.', action: {type: 'stop', unit: 'ccgt2', saving: 9000}}), 9000);
  assert.equal(quotedSaving({text: 'Stop RIVERTON CCGT 2: it is in the way of the sun.'}), null);
  assert.equal(quotedSaving({}), null);
  // The cost the §21.4 accept compares leaves the emergency resources out.
  assert.deepEqual(PLAN_COST_KEYS, ['fuel', 'noLoad', 'starts', 'tie', 'battWear']);
  assert.equal(planCost({fuel: 5, noLoad: 4, starts: 3, tie: 2, battWear: 1, dr: 100, rert: 1000, flex: 10000}), 15);
  const said = [
    {s: 100, kind: 'commit', accepted: true, action: {type: 'start', unit: 'ccgt2'}},
    {s: 200, kind: 'stop', accepted: true, action: {type: 'stop', unit: 'ccgt2'}, text: 'saves about $20,000'},
    {s: 260, kind: 'stop', accepted: false, action: {type: 'stop', unit: 'gta1'}},
    {s: 300, kind: 'stop', accepted: true, action: {type: 'stop', unit: 'gta1'}},
    {s: 900, kind: 'commit', accepted: true, action: {type: 'start', unit: 'ccgt2'}},
  ];
  const stops = stopLines(said);
  assert.deepEqual(stops.map(x => [x.line.s, x.line.action.unit, x.untilS]), [[200, 'ccgt2', 900], [300, 'gta1', V.DAY_S]]);
  // skipping(): the line still shows; its action is dropped for that unit inside the window only.
  const line = obs => ({kind: 'stop', level: 'plan', text: 't', action: {type: 'stop', unit: obs.unit}});
  const skip = skipping(stops[0].line, stops[0].untilS, line);
  assert.equal(skip({s: 200, unit: 'ccgt2'}).action, null);
  assert.equal(skip({s: 899, unit: 'ccgt2'}).kind, 'stop');
  assert.equal(skip({s: 899, unit: 'ccgt2'}).action, null);
  assert.deepEqual(skip({s: 900, unit: 'ccgt2'}).action, {type: 'stop', unit: 'ccgt2'});
  assert.deepEqual(skip({s: 199, unit: 'ccgt2'}).action, {type: 'stop', unit: 'ccgt2'});
  assert.deepEqual(skip({s: 500, unit: 'gta1'}).action, {type: 'stop', unit: 'gta1'});
  // followDay takes it as its objective: a day with every action dropped is the day with no input.
  const none = followDay(7, DESK, {untilH: 6, objective: () => null}), idle = followDay(7, DESK, {untilH: 6, follow: false});
  assert.equal(hashState(none.st), hashState(idle.st));
});

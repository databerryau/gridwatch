// app/system.js in 'player' mode on the game's day (Phase 2a, desk/README.md §21.3): the battery in the
// dispatch, the belly's floor and the export limit, commitSig; and tools/follow.mjs's helpers (the
// hint-following player's command line). (W6, the test budget: these were tests/system.test.js's.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe, hashState, replay} from '../sim/step.js';
import {createSystem, systemInputs, commitSig, DISPATCH_S} from '../app/system.js';
import {V} from '../sim/params.js';
import {DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {ticksAt, withoutTask} from './lib/sim-helpers.js';
import {followDay} from './lib/follow.js';
import {quotedSaving, stopLines, skipping, planCost, dearerThanPar, SKIPPED, PLAN_COST_KEYS} from '../tools/follow.mjs';
import * as fleet from '../sim/fleet.js';

const TPS = V.TICKS_PER_S;

// ---------------------------------------------------------------- the game's day, the battery in the dispatch

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
  // (and, as before Phase 2a, over the dark share of the city and the tie being in service)
  const other = poke => { const x = JSON.parse(JSON.stringify(obs)); poke(x); return commitSig(x); };
  assert.notEqual(other(x => { x.districts[3].dark = true; }), sig);
  assert.notEqual(other(x => { x.tie.tripped = true; }), sig);
  assert.notEqual(other(x => { x.levers.rev += 1; }), sig, '2b: a lever booked or cancelled (desk/README.md §31.3.11)');
});

test('§21.3 player mode: a battery order re-flows the plan at the system\'s next look, not at the next 5-minute dispatch; the plan carries it', () => {
  const {s, sys} = playerDay(2, DESK, ticksAt(10));
  // (Q-69: HAR3 and HAR4 were handed back at 06:35 and 07:55 and nobody closed them. A handed-back feeder
  // counts dark, so AGC did not carry its load into the battery: 648 MWh measured, full when it counted lit.)
  assert.ok(['HAR3', 'HAR4'].every(id => s.city.districts.find(d => d.id === id).dark) && s.battery.socMWh < 0.75 * V.BATT_MWH, s.battery.socMWh.toFixed(0) + ' MWh');
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

test('§21.3 player mode in the belly: units at their floor, the tie at the export limit, the dispatch spilling the rest; no shortfall from what it holds back; a dark net-exporting suburb raises what is dispatched (P-12)', () => {
  // A mild weekend noon with no input: the weekend's 04:00 fleet (three coal machines and the CCGTs it
  // opens with; C-14 is tuned in stage C, the asserts do not count machines) and more sun than load.
  // A regression guard: the dispatch before wave 2 already planned this noon so. What it got wrong
  // is below (a dark suburb that is a net exporter) and in 'a battery order re-flows the plan'.
  // (The day without the restore task, Q-68: the dark suburb below is the only darkness at noon.)
  const {s, sys} = playerDay(1, withoutTask(DESK_WEEKEND), ticksAt(12, 30));
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

  // P-12 in the game's dispatch: Solstice Rise goes dark (five districts, 14.7% of the customers,
  // a quarter of the rooftop: at noon a net exporter). The system re-dispatches at its next look,
  // and the plan's columns are for the LIT demand: the lit customers' load less the rooftop still
  // connected, which is MORE than before, not P50 x (1 - shed).
  const D = {shed: 0, roof: DESK_WEEKEND.rooftop.share[DESK_WEEKEND.city.suburbs.findIndex(x => x.id === 'SOL')]};
  while (s.tick < ticksAt(12, 32)) step(s, systemInputs(sys, s)); // (off the 5-minute dispatch: the next one is three minutes away)
  s.city.districts.forEach((d, i) => { if (d.suburb === 'SOL') { fleet.setDistrictDark(s, i, true, 'directed'); D.shed += d.share; } });
  assert.ok(D.roof === 0.25 && D.shed > 0.14 && D.shed < 0.15);
  const n = planLoads(s), t0 = s.tick;
  while (planLoads(s) === n) step(s, systemInputs(sys, s));
  assert.ok((s.tick - t0) / TPS <= V.PAR_DECIDE_EVERY_S + 1, 'the dark share moved: re-dispatched at the next look');
  const o2 = observe(s), P = sys.memo.plan, fc = o2.forecast, k0 = Math.floor((o2.s - P.madeAtS) / P.stepS);
  for (const q of [2, 6]) {
    // plan column k0 + q lies between two forecast columns: the same linear mix of both
    const j = (P.t0 + (k0 + q) * P.stepS - o2.s) / fc.stepS - 1, a = Math.floor(j), mix = arr => arr[a] + (arr[a + 1] - arr[a]) * (j - a);
    const p50 = mix(fc.demandP50), roof = mix(fc.rooftopMW), lit = (p50 + roof) * (1 - D.shed) - roof * (1 - D.roof);
    const want = lit - mix(fc.windMW) - mix(fc.solarMW);
    assert.ok(Math.abs(planCover(sys, s, q) - want) < 5, 'column +' + q + ': the plan covers ' + planCover(sys, s, q).toFixed(0) + ' MW, lit net demand is ' + want.toFixed(0) + ' MW');
    assert.ok(lit > p50 && lit - p50 * (1 - D.shed) > 250, 'share arithmetic would read ' + (lit - p50 * (1 - D.shed)).toFixed(0) + ' MW less');
  }
});

// ---------------------------------------------------------------- tools/follow.mjs (the hint-following player's command line)

test('tools/follow.mjs: a STOP line\'s quoted saving is read from the line; the followed STOPs and the day with one skipped', () => {
  assert.equal(quotedSaving({text: 'RIVERTON CCGT 2 is not needed until 16:10. Stop it: saves about $41,000. Start it again by 15:21.'}), 41000);
  assert.equal(quotedSaving({text: 'A start costs $8,000. Stopping GT·A now saves $12,500 by 15:00.'}), 12500);
  assert.equal(quotedSaving({text: 'Stop it: saves about $41,000.', saving: 38250}), 38250, 'a number on the line wins over its text');
  assert.equal(quotedSaving({text: 'Stop it.', action: {type: 'stop', unit: 'ccgt2', saving: 9000}}), 9000);
  assert.equal(quotedSaving({text: 'Stop RIVERTON CCGT 2: it is in the way of the sun.'}), null);
  assert.equal(quotedSaving({}), null);
  // The cost the §21.4 accept compares leaves the emergency resources out; the city's payments are the plan's (§31.6).
  assert.deepEqual(PLAN_COST_KEYS, ['fuel', 'noLoad', 'starts', 'tie', 'battWear', 'flex']);
  assert.equal(planCost({fuel: 5, noLoad: 4, starts: 3, tie: 2, battWear: 1, dr: 100, rert: 1000, flex: 10000}), 10015);
  const said = [
    {s: 100, kind: 'commit', accepted: true, action: {type: 'start', unit: 'ccgt2'}},
    {s: 200, kind: 'stop', accepted: true, action: {type: 'stop', unit: 'ccgt2'}, text: 'saves about $20,000'},
    {s: 260, kind: 'stop', accepted: false, action: {type: 'stop', unit: 'gta1'}},
    {s: 300, kind: 'stop', accepted: true, action: {type: 'stop', unit: 'gta1'}},
    {s: 900, kind: 'commit', accepted: true, action: {type: 'start', unit: 'ccgt2'}},
  ];
  const stops = stopLines(said);
  assert.deepEqual(stops.map(x => [x.line.s, x.line.action.unit, x.untilS]), [[200, 'ccgt2', 900], [300, 'gta1', V.DAY_S]]);
  // skipping(): a line in the §21.4 branch order, STOP above BATTERY. The STOP's candidate is the
  // first unit; when it is not free to stop there is no STOP line and the battery branch speaks.
  const CHARGE = {type: 'battery', mode: 'charge', mw: 300};
  const line = obs => {
    const u = obs.units[0];
    if (u.mode === 'on' && u.stopBlock === '') return {kind: 'stop', level: 'plan', text: 'Stop it: saves about $20,000.', action: {type: 'stop', unit: u.id}};
    return {kind: 'battery', level: 'plan', text: 'Charge: power is being spilled.', action: CHARGE};
  };
  const obsAt = (s, first) => ({s, units: [{id: first, mode: 'on', stopBlock: ''}, {id: 'coal1', mode: 'on', stopBlock: ''}]});
  const skip = skipping(stops[0].line, stops[0].untilS, line);
  // Inside the window the skipped day follows what the line says to a player who cannot stop that
  // unit: the branch BELOW the STOP, action and all (not a STOP line with its action removed).
  for (const s of [200, 899]) {
    const x = skip(obsAt(s, 'ccgt2'));
    assert.equal(x.kind, 'battery', 'at ' + s + ' s');
    assert.deepEqual(x.action, CHARGE);
  }
  // Before and after it, and for another unit inside it, the line is the line.
  assert.deepEqual(skip(obsAt(199, 'ccgt2')).action, {type: 'stop', unit: 'ccgt2'});
  assert.deepEqual(skip(obsAt(900, 'ccgt2')).action, {type: 'stop', unit: 'ccgt2'});
  assert.deepEqual(skip(obsAt(500, 'gta1')).action, {type: 'stop', unit: 'gta1'});
  // The observation the line was given is a copy: the caller's is untouched, the unit reads as not free to stop.
  const seen = [], mine = obsAt(500, 'ccgt2');
  skipping(stops[0].line, stops[0].untilS, obs => { seen.push(obs); return null; })(mine);
  assert.equal(mine.units[0].stopBlock, '');
  assert.equal(seen[0].units[0].stopBlock, SKIPPED);
  assert.equal(seen[0].units[1].stopBlock, '');
  // A line that names the unit all the same (it ignores stopBlock) has that action dropped; the line still shows.
  const stubborn = obs => ({kind: 'stop', level: 'plan', text: 't', action: {type: 'stop', unit: obs.units[0].id}});
  const skip2 = skipping(stops[0].line, stops[0].untilS, stubborn);
  assert.equal(skip2(obsAt(500, 'ccgt2')).kind, 'stop');
  assert.equal(skip2(obsAt(500, 'ccgt2')).action, null);
  assert.deepEqual(skip2(obsAt(900, 'ccgt2')).action, {type: 'stop', unit: 'ccgt2'});
  // "Dearer than par" leaves out a day that ended black (its cost stopped when it did).
  const day = (planCost, black, parCost, parBlack = false) => ({planCost, black, par: {planCost: parCost, black: parBlack}});
  assert.deepEqual(dearerThanPar([day(6, false, 5), day(4, false, 5), day(1.5, true, 5), day(9, false, 2, true)]), {dearer: 1, of: 2, na: 2});
  // followDay takes it as its objective: a day with every action dropped is the day with no input.
  const none = followDay(7, DESK, {untilH: 6, objective: () => null}), idle = followDay(7, DESK, {untilH: 6, follow: false});
  assert.equal(hashState(none.st), hashState(idle.st));
});

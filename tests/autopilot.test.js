// Stage B owner "autopilot": sim/autopilot.js acceptance (L-0, S-4, S-11, S-12, P-6, D-2;
// S-4 pace and D-9 are in tests/baseline-v4.test.js).
// The import barrier (autopilot imports only params.js and step.js) is checked for real in
// sim-lint.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, createAutopilot, decide, refRealSeconds, preDispatch, replan, planUpdates} from '../sim/autopilot.js';
import {createState, step, observe, hashState, applyInput} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {ticksAt, TPS, injectTrip, clone} from './lib/sim-helpers.js';

// Whole-day statistics over many seeds (S-12, S-11, P-6, L-0's planOnly days) are measured by
// tools/par.js and tools/baseline-v4.js (section 2), not in the test run.
// Tuning pass (owner decisions D1-D3, 2026-09-30; SPEC S-12 has the table): GT·C 2 x 300 MW,
// minimum down time after planned stops only, rule 8's adequacy walk; then the finishing pass's
// preview refresh on frequency drift (H-4), then the review-fix pass (rule 6's window end,
// rule 2's sustainable GUARD, the price on the lit demand). Measured (v4-core-0.2.2,
// tools/baseline-v4.js): par clean on 181/200 raw and 75/100 forced-heat seeds, RERT on 47/200,
// commitAll dearer on 86/100 (seeds 1-100), lean A on 0/100, planOnly black on 0/100.

/** A state stepped (no inputs) to the given tick. */
function stepTo(seed, tick, scenario = CLASSIC) {
  const s = createState(seed, scenario);
  while (!s.over && s.tick < tick) step(s);
  return s;
}

// Par's own days on the game's days, shared by the tests below (the information barrier and the
// Phase 2a rules): each day is run once and every caller gets a JSON copy of it.
const DAYS = new Map();
// The times asked of one par day, in order: the day is played once, resumed from its own state
// and memory at each (the same day as a fresh run to that time: 'par memory is plain JSON' below).
const FIXTURE_TIMES = new Map([['1' + DESK.id, [[8, 0], [10, 0], [12, 30]]], ['2' + DESK.id, [[10, 0], [16, 0]]]]);
/** Par's day on `scn` to hh:mm (a JSON copy of the state; each day is run once). */
function parDayAt(seed, scn, h, m) {
  const key = seed + scn.id + h + ':' + m;
  if (!DAYS.has(key)) {
    let r = null;
    for (const [hh, mm] of FIXTURE_TIMES.get(seed + scn.id) || [[h, m]]) {
      r = runPar(seed, scn, r ? {state: r.state, memo: r.memo, untilTick: ticksAt(hh, mm) + 1} : {untilTick: ticksAt(hh, mm) + 1});
      DAYS.set(seed + scn.id + hh + ':' + mm, clone(r.state));
    }
    assert.ok(DAYS.has(key), key + ' is not in FIXTURE_TIMES');
  }
  return clone(DAYS.get(key));
}

// S-4 "par is deterministic per seed" is checked by 'par memory is plain JSON' below: two runs
// of the same seed (one whole, one resumed) give the same log, origins and hourly hashes.

test('L-0: the pre-dispatch plan is deterministic, starts at the desk opening and obeys ramps and start times', () => {
  const s = stepTo(4, V.PLAYER_START_TICK);
  const plan = preDispatch(observe(s, {dayAhead: true}));
  assert.deepEqual(preDispatch(observe(stepTo(4, V.PLAYER_START_TICK), {dayAhead: true})), plan, 'same seed, same plan');
  assert.equal(plan.madeAtS, V.PLAYER_START_S);
  // Phase 1a: the plan is a planLoad input (arrive-by keys at the column times, bookings sorted).
  const L = plan.load;
  assert.equal(L.type, 'planLoad');
  assert.equal(L.fromS, V.PLAYER_START_S);
  assert.deepEqual(Object.keys(L.stations), V.STATION_IDS);
  for (const [list, at] of [['starts', 1], ['stops', 1], ['tie', 0], ...V.STATION_IDS.map(id => [id, 0])]) {
    const xs = list in L.stations ? L.stations[list] : L[list];
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i][at] >= xs[i - 1][at], list + ' sorted');
    for (const e of xs) assert.ok(e[at] > V.PLAYER_START_S && e[at] < V.DAY_S, list + ' at ' + e[at]);
  }
  for (const id of V.STATION_IDS) for (const e of L.stations[id]) assert.equal((e[0] - V.PLAYER_START_S) % V.FC_STEP_S, 0, 'arrive-by at a column time');
  // L-4: every planned step is reachable at the station's ramp from the previous keyframe (whole MW: 1 MW).
  for (const id of V.STATION_IDS) {
    const bp = L.stations[id];
    const st = V.STATIONS[id], rampPerS = st.rampMWMin / 60 * st.machines;
    for (let i = 1; i < bp.length; i++) {
      assert.ok(Math.abs(bp[i][1] - bp[i - 1][1]) <= rampPerS * (bp[i][0] - bp[i - 1][0]) + 1, id + ' ramp at ' + bp[i][0]);
      assert.ok(bp[i][1] <= st.totalMW + 1e-9);
    }
  }
  // The tie follows merit order: at least one import and one lower setpoint over the day (P-6).
  assert.ok(new Set(L.tie.map(t => t[1])).size >= 2, 'tie plan pinned at one value');
  // The sim accepts it as it is.
  assert.equal(applyInput(s, L).ok, true);
  assert.equal(s.plan.madeAtS, V.PLAYER_START_S);
});

test('S-4: information barrier: scrambling hidden state (future events, the regime, the series, the heat window) leaves par\'s log unchanged', () => {
  // Par runs on a state whose ext is replaced after the cut by another seed's; its input log
  // before the cut must be identical (nothing hidden after the cut was observable before it).
  // The donor is a heat day (seed 4: heat announced 10:30, after the cut) and the subject a day
  // without one, so the regime and the heat window really change (review fix: seeds 5 and 6 are
  // both storm days with no heat window, and the scramble changed neither).
  // Phase 2a (desk/README.md §25): on DESK, the game's day, the hidden state also holds each
  // suburb's rooftop sky (ext.rooftop.clearPm) and the regime's temperature class. state.day is
  // public (MILD / HOT, the weekend) and is not swapped. The par runs are on DESK only (budget,
  // F-10): its hidden state is every field the classic day hides plus the rooftop skies, and par's
  // code is the same on both; the decide() check below is on the classic day. The subject is seed
  // 1 (a MILD calm day; the donor a heatwave announced at 10:30), whose plain run to the cut is
  // the shared par day (parDayAt), so only the scrambled run is extra.
  const cutS = (10 - V.DAY_START_H) * 3600, cut = cutS * TPS + 1; // just after the 10:00:00 grid update, where parDayAt stops
  for (const scn of [DESK]) {
    const plain = parDayAt(1, scn, 10, 0);
    assert.equal(plain.tick, cut);
    const donor = createState(4, scn);
    const s = createState(1, scn);
    assert.notDeepEqual(donor.ext.regime, s.ext.regime, 'the donor has another regime');
    assert.ok(donor.ext.heat !== null && s.ext.heat === null && donor.ext.heat.announceS > cutS, 'a heat window announced after the cut');
    s.ext.regime = donor.ext.regime;
    s.ext.heat = donor.ext.heat;
    s.ext.events = s.ext.events.filter(e => e.atS < cutS).concat(donor.ext.events.filter(e => e.atS >= cutS));
    for (const k of ['demandNoiseMW', 'windPm', 'clearPm']) {
      s.ext.series[k] = s.ext.series[k].map((x, j) => (j * V.SERIES_STEP_S > cutS ? donor.ext.series[k][j] : x));
    }
    if (scn === DESK) {
      const roof = s.ext.rooftop, before = JSON.stringify(roof.clearPm);
      assert.equal(s.day.temp, 'MILD');
      assert.equal(donor.ext.regime.temp, 'HEATWAVE');
      roof.clearPm = roof.clearPm.map((row, j) => row.map((x, i) => (i * roof.stepS > cutS ? donor.ext.rooftop.clearPm[j][i] : x)));
      assert.notEqual(JSON.stringify(roof.clearPm), before, 'the rooftop skies after the cut really change');
    }
    const scrambled = runPar(1, scn, {state: s, untilTick: cut});
    assert.ok(plain.log.length > 10, scn.id + ': par acted before the cut');
    assert.deepEqual(scrambled.log, plain.log, scn.id);
  }
  const donor = createState(4, CLASSIC);
  // decide() sees observe() only: the same observation gives the same decision whatever state.ext holds.
  const a = stepTo(5, V.PLAYER_START_TICK), b = stepTo(5, V.PLAYER_START_TICK);
  b.ext.events = []; b.ext.regime = {cls: 'heat'}; b.ext.heat = donor.ext.heat; // seed 5 is a storm day with no heat window
  assert.notDeepEqual(b.ext.regime, a.ext.regime);
  assert.deepEqual(decide(observe(a), createAutopilot()), decide(observe(b), createAutopilot()));
});

// S-4 pace and D-9 (par's runtime) are checked on the golden's heat day, seed 4, in
// tests/baseline-v4.test.js, beside the run that compares that day with its golden row.

test('D-2: the reference profile integrates to 245 +- 3 real s from 04:30 to 04:00; night hours are unwrapped', () => {
  assert.ok(Math.abs(refRealSeconds(V.PLAYER_START_S, V.DAY_S, []) - 245) <= 3);
  const night = refRealSeconds((21 - V.DAY_START_H) * 3600, V.DAY_S, []); // 21:00-04:00 at 2,100x
  assert.ok(Math.abs(night - 12) <= 0.1, 'night roll ' + night + ' real s');
  // A contingency adds the watch, the respond card and the RESPOND segment (D-5).
  const c = [{startS: 50000, watchEndS: 50030, backInBandS: 50060}];
  assert.ok(refRealSeconds(49000, 52000, c) > refRealSeconds(49000, 52000, []) + V.REF_WATCH_REAL_S);
});

test('K-13 / par rule 9: par restores a shed district once the permissive allows', () => {
  const s = createState(2, CLASSIC);
  while (!s.over && s.tick < ticksAt(4, 10)) step(s);
  s.sec.level = 'SHORT'; // A-3: DIRECT SHED needs a shortfall (test poke of the gauge)
  step(s, [{type: 'directShed'}]);
  const id = s.city.districts.find(d => d.dark).id;
  const r = runPar(2, CLASSIC, {state: s, untilTick: ticksAt(6)});
  assert.equal(r.state.city.districts.find(d => d.id === id).dark, false, id + ' still dark at 06:00');
  assert.ok(r.origins.includes('rule9'));
});

test('S-11: commitAll starts every offline machine at 04:00 in one batch (no pace, before the desk opens)', () => {
  const r = runPar(3, CLASSIC, {proxy: 'commitAll', untilTick: ticksAt(4, 5)});
  const starts = r.log.filter(x => x.type === 'start');
  assert.deepEqual(starts.map(x => x.args.unit).sort(), ['gta1', 'gtb1', 'gtb2', 'gtc1', 'gtc2', 'hydro3']);
  assert.ok(starts.every(x => x.tick === 0));
});

test('par memory is plain JSON: a day resumed from JSON copies of the state and the memo is the same day (review fix); S-4: par is deterministic per seed', () => {
  // Seed 2 with a trip injected at 04:31, resumed 20 s after its watch, when the decision
  // cadence is off the minute grid: the resumed run must decide at the same seconds and play the
  // same inputs. (Before the fix the cadence lived in runPar's locals, the old test compared []
  // with [], and a day resumed here diverged before 06:00, on seeds 2, 3 and 5 alike.)
  const tripS = V.PLAYER_START_S + 60, mid = (tripS + V.WATCH_S + 20) * TPS + 1, end = ticksAt(6);
  const s0 = injectTrip(createState(2, CLASSIC), tripS);
  const whole = runPar(2, CLASSIC, {state: clone(s0), untilTick: end});
  const first = runPar(2, CLASSIC, {state: clone(s0), untilTick: mid});
  assert.ok(first.state.conts.length > 0 && first.memo.nextS * TPS > mid, 'resumed after a contingency, before a decision');
  assert.notEqual((first.memo.nextS - V.PLAYER_START_S) % V.PAR_DECIDE_EVERY_S, 0, 'the cadence is off the minute grid');
  const state = JSON.parse(JSON.stringify(first.state)), memo = JSON.parse(JSON.stringify(first.memo));
  assert.deepEqual(memo, first.memo, 'memo survives a JSON round trip unchanged');
  const rest = runPar(2, CLASSIC, {state, memo, untilTick: end});
  assert.ok(rest.log.length > first.log.length, 'the resumed part acts');
  assert.deepEqual(rest.log, whole.log, 'the resumed day plays the same inputs');
  assert.deepEqual(rest.origins.slice(first.log.length), whole.origins.slice(first.log.length));
  assert.equal(hashState(rest.state), hashState(whole.state));
  assert.ok(whole.origins.every(o => o === 'plan' || o === 'replan' || /^rule[1-9]$/.test(o)));
  // S-4: par is deterministic per seed. The two runs of seed 2 agree input for input (above),
  // origin for origin and hash for hash every sim-hour.
  assert.equal(whole.origins.length, whole.log.length);
  assert.deepEqual(first.origins, whole.origins.slice(0, first.log.length));
  assert.ok(whole.hashes.length >= 2);
  assert.deepEqual(first.hashes.concat(rest.hashes), whole.hashes, 'the same hourly hashes');
});

test('par rule 6 and rule 2 (review fix): a discharge order past 22:00 is ended before rules 2-5; the GUARD is raised only as far as the battery sustains it', () => {
  // 22:10 on a fresh state: no plan (no day-ahead obs), no trip, the battery discharging.
  const s = createState(3, CLASSIC);
  s.tick = ticksAt(22, 10) + 1;
  Object.assign(s.battery, {mode: 'discharge', orderMW: 124, socMWh: 600, guardMW: 0});
  const obs = observe(s);
  // Rule 2 would raise the GUARD (a low TRIP PREVIEW, nothing short), but rule 6's window end goes first.
  Object.assign(obs.sec, {r5MW: 2000, lMW: 600, lKind: 'unit', lId: 'coal1', previewNadirHz: V.PAR_NADIR_MIN_HZ - 0.2});
  Object.assign(obs.agc, {unmetMW: 0}); obs.f.hz = 50; obs.fos.outsideS = 0;
  const m1 = createAutopilot();
  assert.deepEqual(decide(obs, m1), [{type: 'battery', mode: 'idle', mw: 0}]);
  assert.equal(m1.lastOrigin, 'rule6');
  // Idle battery: rule 2 raises the GUARD while the battery can sustain it ...
  obs.battery.mode = 'idle'; obs.battery.orderMW = 0;
  const m2 = createAutopilot();
  assert.deepEqual(decide(obs, m2), [{type: 'guard', mw: V.PAR_GUARD_STEP_MW}]);
  assert.equal(m2.lastOrigin, 'rule2');
  // ... and starts a peaker instead when it cannot (energy for GUARD_SUSTAIN_S at the new level).
  obs.battery.socMWh = V.PAR_GUARD_STEP_MW * V.GUARD_SUSTAIN_S / 3600 - 1;
  const m3 = createAutopilot();
  const d3 = decide(obs, m3);
  assert.equal(m3.lastOrigin, 'rule2');
  assert.equal(d3.length, 1);
  assert.equal(d3[0].type, 'start');
});

// ---------------------------------------------------------------- Phase 2a: the belly (S-14, P-12; desk/README.md C-12, §21.3)
// Poked observations of REAL game days, in the style of the rule 6 / rule 2 test above: par's own
// day on DESK or DESK_WEEKEND up to the given time (parDayAt: run once and cloned), then the
// observation is poked so that rules 1 to 3 want nothing and the rule under test decides.

/** An observation in which rules 1-3 want nothing: no contingency in hand, security comfortable, no GUARD to step down. */
function quiet(obs) {
  obs.contingencies = [];
  Object.assign(obs.sec, {r5MW: 2000, lMW: 600, lKind: 'unit', lId: 'coal1', previewNadirHz: 49.7});
  Object.assign(obs.agc, {unmetMW: 0, requestMW: 0}); obs.f.hz = 50; obs.fos.outsideS = 0;
  obs.battery.guardMW = 0;
  return obs;
}
const thermalOn = obs => obs.units.filter(u => u.mode === 'on' && u.cls !== 'hydro');
const gasOff = obs => obs.units.filter(u => (u.cls === 'ccgt' || u.cls === 'ocgt') && u.mode === 'off');
const gasCommitted = obs => obs.units.filter(u => (u.cls === 'ccgt' || u.cls === 'ocgt') && u.mode !== 'off' && u.mode !== 'tripped');

test('S-14 rule 2 (C-12): par charges whenever the price is at or below $0 or power is being spilled and the battery has room, a union with rule 6\'s window', () => {
  // A MILD weekday at 12:30, inside the 09:30-15:30 window: four coal machines at their floor.
  const at = (poke, memo = createAutopilot()) => {
    const obs = quiet(observe(parDayAt(1, DESK, 12, 30)));
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 700, fullHold: false});
    obs.price.mwh = 26; obs.wind.autoMW = 0; obs.solar.autoMW = 0;
    for (const u of thermalOn(obs)) u.outMW = u.minMW;
    for (const u of obs.units) if (u.cls === 'hydro') u.outMW = 0;
    Object.assign(obs.tie, {tripped: false, flowMW: -obs.tie.exportLimitMW}); // exporting at its limit
    poke(obs);
    const d = decide(obs, memo);
    return {d, memo, obs};
  };
  assert.equal(gasCommitted(observe(parDayAt(1, DESK, 12, 30))).length, 0, 'the fixture: no gas unit left for rule 4 to stop');
  const windowMW = (V.PAR_BATT_CHARGE_TO * V.BATT_MWH - 700) / V.BATT_CHARGE_EFF / 3; // 12:30 to 15:30
  // Nothing spilled, the price positive: the window's own rate, as before Phase 2a.
  let r = at(() => {});
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: Math.floor(windowMW)}]);
  assert.equal(r.memo.lastOrigin, 'rule6');
  assert.equal(r.memo.belly, false);
  // 240 MW being spilled: the order is the spill (free power), above the window's rate.
  r = at(obs => { obs.wind.autoMW = 100; obs.solar.autoMW = 140; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 240}]);
  assert.equal(r.memo.lastOrigin, 'rule6');
  assert.equal(r.memo.belly, true);
  // Spill alone is enough (the price is still on its way down) once it is above SURPLUS_MIN_MW ...
  r = at(obs => { obs.solar.autoMW = V.SURPLUS_MIN_MW + 130; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: V.SURPLUS_MIN_MW + 130}]);
  // ... and so is a price at or below $0; never less than the window's rate.
  r = at(obs => { obs.price.mwh = 0; obs.solar.autoMW = 20; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: Math.floor(windowMW)}]);
  assert.equal(r.memo.belly, false, 'an order at the rate of the window is a window order');
  // More spill than the rule's limit: PAR_BATT_CHARGE_MAX_MW.
  r = at(obs => { obs.solar.autoMW = 900; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: V.PAR_BATT_CHARGE_MAX_MW}]);
  // The order is on top of what is already ordered (the sim's cut is net of the order).
  r = at(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 120}); obs.solar.autoMW = 110; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 230}]);
  // No more than reaches PAR_BATT_CHARGE_TO by par's next possible action (3 real s at 300x: 15 grid-min).
  r = at(obs => { obs.battery.socMWh = 950; obs.solar.autoMW = 300; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: Math.floor((970 - 950) / V.BATT_CHARGE_EFF / 0.25)}]);
  // No more than the inverter less the GUARD (K-5: the GUARD's MW are never the order's).
  r = at(obs => { obs.battery.guardMW = 300; obs.sec.previewNadirHz = 49.4; obs.solar.autoMW = 300; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: V.BATT_MW - 300}]);
  assert.equal(r.memo.lastOrigin, 'rule6');
  // A charge order paused on a full battery (FULL-HOLD) is taking nothing: the new order is the spill alone.
  r = at(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 300, fullHold: true, socMWh: 940}); obs.solar.autoMW = 110; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 110}]);
  // No room: nothing to charge, and a charge order is ended.
  r = at(obs => { obs.battery.socMWh = 968; obs.solar.autoMW = 300; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.notEqual(r.memo.lastOrigin, 'rule6');
  r = at(obs => { Object.assign(obs.battery, {socMWh: 968, mode: 'charge', orderMW: 300}); obs.solar.autoMW = 300; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'idle', mw: 0}]);

  // The hold. A belly order that takes the whole spill leaves a positive price and nothing spilled:
  // it stays while the thermal units sit at their floor ...
  const held = () => Object.assign(createAutopilot(), {belly: true});
  const charging = obs => Object.assign(obs.battery, {mode: 'charge', orderMW: 300, socMWh: 900});
  r = at(charging, held());
  assert.notEqual(r.memo.lastOrigin, 'rule6', 'held: ' + JSON.stringify(r.d));
  assert.equal(r.memo.belly, true);
  // ... comes down by what they carry above it (that part is fuel, not surplus) ...
  r = at(obs => { charging(obs); for (const u of thermalOn(obs)) u.outMW = u.minMW + 200 / thermalOn(obs).length; }, held());
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 100}]);
  assert.equal(r.memo.belly, true);
  // ... and falls back to the window's rate once nearly all of it is fuel.
  r = at(obs => { charging(obs); for (const u of thermalOn(obs)) u.outMW = u.minMW + 280 / thermalOn(obs).length; }, held());
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: Math.floor((970 - 900) / V.BATT_CHARGE_EFF / 3)}]);
  assert.equal(r.memo.belly, false);
  // The same order without the belly flag (a window order) is not held at 300 MW either.
  r = at(charging);
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: Math.floor((970 - 900) / V.BATT_CHARGE_EFF / 3)}]);
  // Free power only: what the tie carries above its export limit is bought from the neighbour (or
  // not sold to it), and what hydro generates is water. The order comes down by both ...
  r = at(obs => { charging(obs); obs.tie.flowMW = -obs.tie.exportLimitMW + 100; }, held());
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 200}], 'the tie exports 100 MW short of its limit');
  r = at(obs => { charging(obs); obs.units.find(u => u.id === 'hydro1').outMW = 120; }, held());
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 180}], 'hydro generates 120 MW');
  // ... and a belly order fed by an import is the window's order again.
  r = at(obs => { charging(obs); obs.tie.flowMW = 250; }, held());
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: Math.floor((970 - 900) / V.BATT_CHARGE_EFF / 3)}], 'the tie imports 250 MW');
  assert.equal(r.memo.belly, false);
  // A tripped tie carries nothing (and has no export limit to be short of).
  r = at(obs => { charging(obs); Object.assign(obs.tie, {tripped: true, flowMW: 0}); }, held());
  assert.notEqual(r.memo.lastOrigin, 'rule6', 'held with the tie out: ' + JSON.stringify(r.d));
  assert.equal(r.memo.belly, true);
  // While power is still being spilled nothing is netted off (the units are on their way down to
  // MIN, and the spill is counted from their floors): the order grows by the spill.
  r = at(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 200, socMWh: 900}); obs.solar.autoMW = 100;
    for (const u of thermalOn(obs)) u.outMW = u.minMW + 200 / thermalOn(obs).length; }, held());
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 300}]);
  // The flag follows the order in place even when nothing is re-ordered: a small belly order
  // that is no longer fed by a surplus and already sits at the window's rate is a window order.
  r = at(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 30, socMWh: 900}); obs.tie.flowMW = 250; }, held());
  assert.notEqual(r.memo.lastOrigin, 'rule6', 'within the order tolerance of the window rate: ' + JSON.stringify(r.d));
  assert.equal(r.memo.belly, false);

  // Outside the window (08:40; no plan in hand): spill or a price at or below $0 charges, nothing else does.
  const early = poke => at(obs => { obs.s = ticksAt(8, 40) / TPS; obs.tick = ticksAt(8, 40) + 1; obs.dayAhead = null; poke(obs); });
  r = early(obs => { obs.solar.autoMW = 180; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 180}]);
  assert.equal(r.memo.lastOrigin, 'rule6');
  r = early(obs => { obs.price.mwh = -0.01; });
  assert.equal(r.memo.lastOrigin, '', 'a price below $0 with nothing spilled and no window: nothing to order, ' + JSON.stringify(r.d));
  r = early(() => {});
  assert.notEqual(r.memo.lastOrigin, 'rule6');
  // The threshold is SURPLUS_MIN_MW exactly: 50 MW spilled at a positive price is not a surplus, 51 MW is.
  r = early(obs => { obs.solar.autoMW = V.SURPLUS_MIN_MW; });
  assert.notEqual(r.memo.lastOrigin, 'rule6');
  r = early(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 100}); obs.solar.autoMW = V.SURPLUS_MIN_MW; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'idle', mw: 0}], '50 MW spilled does not keep a charge order going');
  r = early(obs => { obs.solar.autoMW = V.SURPLUS_MIN_MW + 1; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: V.SURPLUS_MIN_MW + 1}]);
  // The price alone keeps a charge order going (at $0, 30 MW spilled); at a positive price it is ended.
  r = early(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 100}); obs.solar.autoMW = 30; obs.price.mwh = 0; });
  assert.notEqual(r.memo.lastOrigin, 'rule6', 'kept at $0: ' + JSON.stringify(r.d));
  r = early(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 100}); obs.solar.autoMW = 30; obs.price.mwh = 26; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'idle', mw: 0}]);
  // In the evening window a price at or below $0 turns a discharge into a charge (never sell at a negative price).
  r = at(obs => { obs.s = ticksAt(17, 0) / TPS; obs.tick = ticksAt(17, 0) + 1; obs.dayAhead = null; Object.assign(obs.battery, {mode: 'discharge', orderMW: 140});
    obs.solar.autoMW = 90; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 90}]);
});

test('S-14 rule 4 (C-12): one coal machine is stopped only if MSL2 is forecast for 3 h and the evening holds N-1 without it; gas goes first', () => {
  // A mild weekend morning at 10:30 (par's own day for the weather, the water and the forecast's
  // shape). The FLEET is poked, so the case does not depend on which machines the weekend opens
  // with (C-14 is tuned in stage C): four coal machines at their floor, coal 4 inside its 8-h
  // minimum up time, so coal 3 is the candidate; every gas unit off and not free to start; three
  // hydro machines on with 400 MW of release left in the water. MSL2 for three hours does not
  // occur on real days, so the 4.5-h forecast is poked to it, and the hours beyond it (the
  // day-ahead columns) to a flat evening of `evening` MW with no wind and no sun.
  const stepS = V.FC_STEP_S, cols = V.PAR_COAL_MSL2_H * 3600 / stepS, coal = V.STATIONS.coal, hyd = V.STATIONS.hydro;
  const waterMW = 400, releaseH = V.PAR_WATER_EMPTY_BY_H - V.PAR_WATER_HOLD_UNTIL_H;
  const pokeFleet = obs => {
    for (const u of obs.units) {
      if (u.cls === 'coal') Object.assign(u, {mode: 'on', sync: true, timerS: 0, availMW: u.ratingMW, outMW: u.minMW, schedMW: u.minMW, basePointMW: u.minMW, upForS: 6 * 3600, stopBlock: ''});
      else if (u.cls === 'hydro') Object.assign(u, {mode: 'on', sync: true, timerS: 0, availMW: u.ratingMW, outMW: 0, schedMW: 0, basePointMW: 0});
      else Object.assign(u, {mode: 'off', sync: false, timerS: 0, outMW: 0, schedMW: 0, basePointMW: 0, startBlock: 'minimum down time: 2 h left'});
    }
    obs.units.find(u => u.id === 'coal4').stopBlock = 'minimum up time: 2 h left';
    obs.hydro.storageMWh = V.HYDRO_STOP_MWH + V.PAR_WATER_RESERVE_MWH + waterMW * releaseH;
  };
  const flat = (obs, evening) => {
    const da = obs.dayAhead;
    da.demandP50 = da.demandP50.map(() => evening); da.windMW = da.windMW.map(() => 0); da.solarMW = da.solarMW.map(() => 0); da.rooftopMW = da.rooftopMW.map(() => 0);
  };
  // What the evening can lean on without coal 3 (eveningHolds): three coal machines and the tie at
  // PAR_MAX_LOADING, hydro at the rate the water sustains, less the largest single loss.
  const bigMW = V.PAR_MAX_LOADING * coal.ratingMW;
  const firm = 3 * bigMW + Math.min(3 * V.PAR_MAX_LOADING * hyd.ratingMW, waterMW) + bigMW - bigMW;
  const holds = firm - V.PAR_COMMIT_MARGIN_MW; // the flat evening that is exactly covered
  assert.ok(Math.abs(firm - 2262.25) < 1e-6 && waterMW < 3 * V.PAR_MAX_LOADING * hyd.ratingMW, 'the fixture: water, not machines, limits hydro');
  const at = (evening, poke = () => {}, memo = createAutopilot()) => {
    const obs = quiet(observe(parDayAt(1, DESK_WEEKEND, 10, 30), {dayAhead: true}));
    pokeFleet(obs);
    obs.plan.starts = []; obs.plan.stops = [];
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 975}); // nothing for rule 6 to order
    obs.forecast.demandP50 = obs.forecast.demandP50.map(() => V.MSL2_MW - 50);
    if (evening !== null) flat(obs, evening);
    poke(obs);
    return {d: decide(obs, memo), memo, obs};
  };
  const stops = r => r.d.filter(x => x.type === 'stop').map(x => x.unit);
  const fixture = observe(parDayAt(1, DESK_WEEKEND, 10, 30), {dayAhead: true});
  assert.equal(fixture.day.temp, 'MILD');
  assert.equal(fixture.s, ticksAt(10, 30) / TPS);
  // The real evening (about 6 GW at the peak) does not hold N-1 without a coal machine: no stop.
  let r = at(null);
  assert.ok(Math.max(...fixture.dayAhead.demandP50) > 5000, 'the fixture: a real evening peak');
  assert.deepEqual(stops(r), [], 'the real evening: ' + JSON.stringify(r.d));
  assert.equal(r.memo.coalStops, 0);
  // An evening the rest of the fleet covers with N-1 and the margin: the coal machine goes (the
  // last in merit order that is free to stop: coal 3). Five MW heavier and it stays.
  r = at(holds - 5);
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}]);
  assert.equal(r.memo.lastOrigin, 'rule4');
  assert.equal(r.memo.coalStops, 1);
  r = at(holds + 5);
  assert.deepEqual(stops(r), [], 'N-1 plus PAR_COMMIT_MARGIN_MW: ' + JSON.stringify(r.d));
  assert.equal(r.memo.coalStops, 0);
  // One a day.
  r = at(holds - 5, () => {}, Object.assign(createAutopilot(), {coalStops: 1}));
  assert.deepEqual(stops(r), []);
  // Not before PAR_DECOMMIT_MIN_ON_MIN on: the next coal machine in line goes instead.
  r = at(holds - 5, obs => { obs.units.find(u => u.id === 'coal3').upForS = V.PAR_DECOMMIT_MIN_ON_MIN * 60 - 60; });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal2'}], 'coal 3 has been on for 89 min');
  // MSL2 for five minutes short of three hours: no stop.
  r = at(holds - 5, obs => { obs.forecast.demandP50 = obs.forecast.demandP50.map((x, k) => (k < cols - 1 ? x : V.MSL2_MW + 1)); });
  assert.deepEqual(stops(r), [], 'MSL2 for ' + (cols - 1) * stepS / 60 + ' min');
  r = at(holds - 5, obs => { obs.forecast.demandP50 = obs.forecast.demandP50.map((x, k) => (k < cols ? x : V.MSL2_MW + 1)); });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'MSL2 for exactly three hours');
  // The three hours need not be one run (they are counted over the forecast's 5-minute columns).
  r = at(holds - 5, obs => { obs.forecast.demandP50 = obs.forecast.demandP50.map((x, k) => (k % 3 !== 2 ? x : V.MSL2_MW + 1)); });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], '36 of 54 columns at MSL2');
  // With the tie out the threshold is 300 MW higher in the columns before its return (M-1), and
  // the tie is no supply in the columns before its return either.
  const tieOut = (obs, lockoutS) => { Object.assign(obs.tie, {tripped: true, lockoutS, flowMW: 0}); obs.forecast.demandP50 = obs.forecast.demandP50.map(() => V.MSL2_MW + 200); };
  r = at(holds - bigMW - 5, obs => tieOut(obs, 12 * 3600));
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'tie out all day: 1,500 MW counts as MSL2, and the evening holds without the tie');
  r = at(holds - 5, obs => tieOut(obs, 12 * 3600));
  assert.deepEqual(stops(r), [], 'tie out all day: the evening that needs the tie does not hold');
  r = at(holds - 5, obs => tieOut(obs, 4.5 * 3600));
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'tie back at 15:00, before the evening: it counts again');
  r = at(holds - bigMW - 5, obs => tieOut(obs, 2 * 3600));
  assert.deepEqual(stops(r), [], 'tie back in 2 h: only 2 h of MSL2');
  // Hydro counts for the water behind it (rule 5's release rate), not for its machines.
  r = at(holds + 100, obs => { obs.hydro.storageMWh += 105 * releaseH; });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], '105 MW more water carries a 100-MW heavier evening');
  r = at(holds + 600, obs => { obs.hydro.storageMWh = 7000; });
  assert.deepEqual(stops(r), [], 'however much water: three machines at PAR_MAX_LOADING');
  // Gas goes first: while a gas unit is committed the coal stays (rule 4 stops the gas unit, or nothing).
  r = at(holds - 5, obs => { Object.assign(obs.units.find(u => u.id === 'gta1'), {mode: 'starting', timerS: 200}); });
  assert.ok(!r.d.some(x => x.type === 'stop' && /^coal/.test(x.unit)), JSON.stringify(r.d));
  // N-1 in minutes without it (as for a gas unit): R5 short of L, no stop.
  // (L is the tie import here; 640 MW is >= 1.05 L, but not without a coal machine's 15 MW of 5-min headroom.)
  r = at(holds - 5, obs => { Object.assign(obs.sec, {r5MW: 640, lMW: 600, lKind: 'link', lId: 'tie'}); });
  assert.deepEqual(stops(r), [], 'N-1 in minutes: ' + JSON.stringify(r.d));
  // No plan yet (an observation without the day-ahead forecast): nothing to judge the evening by, no stop.
  r = at(holds - 5, obs => { obs.dayAhead = null; });
  assert.deepEqual(r.d, []);
  // "The evening" runs until the machine could be back at minimum load: stopped at 10:30 from its
  // floor it is off the grid at 11:40 (T4), may START at 19:40 (8 h down) and is at MIN at 21:44
  // (T1 50 + auto-sync 4 + T2 70 min). A heavy column before that blocks the stop; one after does not.
  const backS = ticksAt(10, 30) / TPS + (coal.t4Min + coal.minDownH * 60 + coal.t1Min + V.AUTO_SYNC_S / 60 + coal.t2Min) * 60;
  assert.equal(backS, ticksAt(21, 44) / TPS);
  const heavyAt = (t, poke = () => {}) => obs => { poke(obs); const k = Math.round((t - obs.dayAhead.fromS) / stepS) - 1; obs.dayAhead.demandP50[k] = 9000; };
  r = at(holds - 5, heavyAt(backS - 240)); // the 21:40 column
  assert.deepEqual(stops(r), [], 'a heavy 21:40');
  r = at(holds - 5, heavyAt(backS + 360)); // the 21:50 column
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'a heavy 21:50 is after it is back');
  // From 36 MW above its floor it first unloads for 12 minutes (3 MW/min): back at 21:56, and the 21:50 column counts.
  // (every coal machine: one still at its floor would be back at 21:44 and go in its place)
  const above = obs => { for (const u of obs.units) if (u.cls === 'coal') u.outMW = u.schedMW = u.basePointMW = u.minMW + 12 * coal.rampMWMin; };
  r = at(holds - 5, heavyAt(backS + 360, above));
  assert.deepEqual(stops(r), [], 'above its floor, a heavy 21:50');
  r = at(holds - 5, heavyAt(backS + 1260, above)); // the 22:05 column
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'above its floor, a heavy 22:05');
  r = at(holds - 5, heavyAt(backS + 360, obs => { above(obs); const u = obs.units.find(x => x.id === 'coal2'); u.outMW = u.schedMW = u.basePointMW = u.minMW; }));
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal2'}], 'coal 2 at its floor is back before the heavy 21:50 and goes in its place');

  // The evening is the LIT demand (P-12): with four districts dark it is lighter by their customers.
  const DARK = ['RED1', 'RED2', 'TAL1', 'SAL1'];
  const dark = obs => { for (const id of DARK) Object.assign(obs.districts.find(d => d.id === id), {dark: true, shedBy: 'directed', restoreBlock: 'wait 5 min after the last restore'}); };
  const litShare = 1 - DARK.reduce((a, id) => a + fixture.districts.find(d => d.id === id).share, 0);
  assert.ok(litShare < 0.9);
  r = at((holds - 5) / litShare, dark);
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'four districts dark: the lit evening holds');
  r = at((holds + 5) / litShare, dark);
  assert.deepEqual(stops(r), []);

  // The first plan column lies between the present and the forecast, and the present is the sim's
  // LIT demand: on a plan made at 10:28 the 10:33 column is 2/5 the present. Lit demand of 9 GW now
  // (it is not: a poke) makes that column too heavy; the operational total alone does not.
  const off = poke => { const memo = createAutopilot(), early = quiet(observe(parDayAt(1, DESK_WEEKEND, 10, 30), {dayAhead: true}));
    pokeFleet(early); flat(early, holds - 5); early.s -= 120; early.tick -= 120 * TPS; planUpdates(early, memo); return at(holds - 5, poke, memo); };
  r = off(obs => { obs.demand.nowMW = 9000; });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'demand.nowMW is not what the evening is judged on');
  r = off(obs => { obs.demand.litMW = 9000; });
  assert.deepEqual(stops(r), [], 'lit demand now');

  // Inside the 4.5-h forecast the columns are lit demand as well. The last 90 minutes of the
  // forecast are poked to 1,500 MW under 3,000 MW of rooftop, with no wind and no utility solar:
  // with every district lit the fleet covers that (1,500 + 700 < 2,262). With Solstice Rise dark
  // (14.7% of the customers, a quarter of the rooftop) the lit demand there is 1,588 MW, and it does not.
  const noon = (obs, darken) => {
    const fc = obs.forecast, D = darken ? solDark(obs) : {shed: 0, roof: 0};
    fc.demandP50 = fc.demandP50.map((x, k) => (k < cols ? x : 1500)); fc.rooftopMW = fc.rooftopMW.map(() => 3000);
    fc.windMW = fc.windMW.map(() => 0); fc.solarMW = fc.solarMW.map(() => 0);
    return litOf(1500, 3000, D) + V.PAR_COMMIT_MARGIN_MW - firm;
  };
  r = at(holds - 300, obs => { assert.ok(noon(obs, false) < -50); });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'the poked noon, every district lit');
  r = at(holds - 300, obs => { assert.ok(noon(obs, true) > 20); });
  assert.deepEqual(stops(r), [], 'the poked noon with Solstice Rise dark');

  // A heatwave announced AFTER the plan was made: the day-ahead evening is lifted by
  // HEAT_DEMAND_UPLIFT and the thermal machines are derated inside its window. Announced before
  // the plan, the day-ahead forecast already carries the demand, and only the derate applies.
  const hotFirm = 3 * bigMW * (1 - V.HEAT_THERMAL_DERATE) + waterMW, hotHolds = hotFirm - V.PAR_COMMIT_MARGIN_MW;
  const heatAt = (evening, newsAtS) => {
    const memo = createAutopilot(), early = quiet(observe(parDayAt(1, DESK_WEEKEND, 10, 30), {dayAhead: true}));
    pokeFleet(early); flat(early, evening);
    early.s -= stepS; early.tick -= stepS * TPS;
    planUpdates(early, memo); // the plan, made at 10:25
    assert.equal(memo.plan.madeAtS, ticksAt(10, 25) / TPS);
    return at(evening, obs => { obs.news.push({atS: early.s + newsAtS, kind: 'heat', fromS: ticksAt(13, 30) / TPS, toS: ticksAt(23, 0) / TPS, text: 'WEATHER BUREAU: extreme heat.'}); }, memo);
  };
  r = heatAt((hotHolds - 5) / (1 + V.HEAT_DEMAND_UPLIFT), 60);
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'a late heatwave: the lifted evening against the derated fleet');
  r = heatAt((hotHolds + 5) / (1 + V.HEAT_DEMAND_UPLIFT), 60);
  assert.deepEqual(stops(r), [], 'a late heatwave, 5 MW heavier');
  r = heatAt(hotHolds - 5, -60);
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'announced before the plan: the day-ahead forecast already has the heat');
  r = heatAt(hotHolds + 5, -60);
  assert.deepEqual(stops(r), [], 'announced before the plan: the derate still applies');
});

test('rule 7 in a surplus (desk/README.md §25): AGC lowering the units to MIN while the dispatch spills is not drift, and a surplus the plan shows is not a miss', () => {
  // The same MILD noon. rule 7 marks its look in memo.rebaseQuietS (no lever to move) or acts (origin rule7).
  const at = poke => {
    const obs = quiet(observe(parDayAt(1, DESK, 12, 30), {dayAhead: true}));
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 975, agcTrimMW: 0}); // nothing for rule 6 to order
    obs.wind.autoMW = 0; obs.solar.autoMW = 0;
    for (const u of obs.units) u.agcTrimMW = 0;
    poke(obs);
    const memo = createAutopilot();
    decide(obs, memo);
    return {memo, looked: memo.lastOrigin === 'rule7' || memo.rebaseQuietS >= obs.s};
  };
  // The fixture's own plan shows the surplus for the coming column (units at their floor, the tie
  // at the export limit): before Phase 2a that alone read as a 150-MW miss of the forecast.
  let r = at(() => {});
  const P = r.memo.plan;
  assert.ok(P.gap[0] < -V.PAR_REBASE_MW, 'the plan shows a surplus of ' + (-P.gap[0]).toFixed(0) + ' MW');
  assert.equal(r.looked, false, 'a surplus the plan shows is not a miss');
  // AGC asked for 400 MW less, all of it the units' trims toward MIN, while the dispatch spills: its own work.
  const lowering = obs => { obs.agc.requestMW = -400; const on = thermalOn(obs); for (const u of on) u.agcTrimMW = -400 / on.length; };
  r = at(obs => { lowering(obs); obs.solar.autoMW = 300; });
  assert.equal(r.looked, false, 'lowering while spilling');
  // The same request with nothing spilled is a plan gone stale: rule 7 looks.
  r = at(lowering);
  assert.equal(r.looked, true, 'the same request with no spill');
  // While spilling, what the BATTERY carries beyond PAR_REBASE_MW still counts (the deep belly).
  r = at(obs => { lowering(obs); obs.solar.autoMW = 300; obs.agc.requestMW = -400 - V.PAR_REBASE_MW - 10; });
  assert.equal(r.looked, true, 'the battery carries 160 MW on AGC');
  // Only a SURPLUS the plan shows is excused. A plan 300 MW short of the forecast for the coming
  // column (a positive gap: the red on the Live Stack) is a miss, and rule 7 looks.
  const again = pokePlan => {
    const obs = quiet(observe(parDayAt(1, DESK, 12, 30), {dayAhead: true}));
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 975, agcTrimMW: 0});
    obs.wind.autoMW = 0; obs.solar.autoMW = 0;
    for (const u of obs.units) u.agcTrimMW = 0;
    const memo = createAutopilot();
    decide(obs, memo); // makes the plan; nothing to do
    assert.ok(memo.lastOrigin === '' && memo.rebaseQuietS < obs.s, 'the fixture: no look before the poke');
    pokePlan(memo.plan);
    decide(obs, memo);
    return memo.lastOrigin === 'rule7' || memo.rebaseQuietS >= obs.s;
  };
  assert.equal(again(() => {}), false);
  assert.equal(again(plan => { plan.tie[0] -= 300 - plan.gap[0]; plan.gap[0] = 300; }), true, 'a 300-MW shortfall in the plan');
});

test('P-12: the dispatch is for the LIT operational demand: a dark suburb takes its roofs with it (not a proportional slice)', () => {
  // The mild noon again. SOL3 (Solstice Rise: a quarter of the rooftop on five districts) is a net
  // exporter at this hour: darkening it RAISES what the rest of the grid must supply.
  const run = dark => {
    const s = parDayAt(1, DESK, 12, 30);
    const d = s.city.districts.findIndex(x => x.id === 'SOL3');
    const netMW = fleet.districtColdLoadMW(s, d); // its net load while lit
    if (dark) fleet.setDistrictDark(s, d, true, 'directed');
    for (let k = 0; k < 2 * TPS; k++) step(s);
    const obs = observe(s, {dayAhead: true}), memo = createAutopilot({proxy: 'planOnly'});
    planUpdates(obs, memo);
    replan(obs, memo);
    return {obs, P: memo.plan, netMW, share: s.city.districts[d].share};
  };
  const lit = run(false), dark = run(true);
  assert.ok(lit.netMW < 20, 'SOL3 is about a net exporter at 12:30: ' + lit.netMW.toFixed(1) + ' MW');
  // The plan's gap is cover - supply; both plans sit at the floor with the tie at the export limit,
  // so the difference of their gaps is the difference of the demand they are dispatched for.
  const k = 2, moved = dark.P.gap[k] - lit.P.gap[k];
  assert.ok(Math.abs(moved + lit.netMW) < 15, 'the dispatch moved by ' + moved.toFixed(1) + ' MW for a district of net ' + lit.netMW.toFixed(1) + ' MW');
  const slice = lit.share * lit.obs.forecast.demandP50[k];
  assert.ok(slice > 50 && Math.abs(moved + slice) > 40, 'share arithmetic would have taken ' + slice.toFixed(0) + ' MW off');
  // The observation itself: the sim's lit demand (obs.demand.litMW) moved by the district's net load too.
  // (What the dispatch, the cold-load term, the adequacy walk and rule 4's evening do with it: the tests below.)
  assert.ok(Math.abs(dark.obs.demand.litMW - (lit.obs.demand.litMW - lit.netMW)) < 15);
  assert.ok(Math.abs(dark.obs.demand.nowMW * (1 - lit.share) - dark.obs.demand.litMW) > 40, 'not nowMW x (1 - shed)');
});

// The five districts of Solstice Rise hold a quarter of the rooftop PV and 14.7% of the customers.
const SOL = ['SOL1', 'SOL2', 'SOL3', 'SOL4', 'SOL5'];
/** Poke the Solstice Rise districts dark in an observation (directed, not restorable yet); returns {shed, roof}: their share of customers and of rooftop. */
function solDark(obs) {
  let shed = 0;
  for (const id of SOL) { const d = obs.districts.find(x => x.id === id); Object.assign(d, {dark: true, shedBy: 'directed', restoreBlock: 'wait 5 min after the last restore'}); shed += d.share; }
  return {shed, roof: DESK.rooftop.share[DESK.city.suburbs.findIndex(x => x.id === 'SOL')]};
}
/** P-12 on a forecast column, written out here independently of the autopilot: the lit customers' load less the rooftop still connected. */
const litOf = (p50, roofMW, D) => (p50 + roofMW) * (1 - D.shed) - roofMW * (1 - D.roof);

test('rule 8\'s adequacy walk reads wind and solar as AVAILABLE (what the dispatch holds back is not a shortage, C-6) and demand as LIT (P-12)', () => {
  // The mild noon with the tie out, no water above par's floor, and the coal machines poked nearly
  // unavailable, so firm capacity now is 4 x 100 MW at the hot gate: 384 MW. The present is poked
  // to round numbers: 2,000 MW of lit demand, 1,000 MW of wind and 500 MW of sun available.
  const firmNow = 4 * 100 * V.HOT_LOADING_FRAC;
  const at = poke => {
    const obs = quiet(observe(parDayAt(1, DESK, 12, 30)));
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 975});
    Object.assign(obs.tie, {tripped: true, lockoutS: 7200, flowMW: 0, setMW: 0});
    obs.hydro.storageMWh = V.HYDRO_STOP_MWH + V.PAR_WATER_RESERVE_MWH;
    for (const u of thermalOn(obs)) { u.availMW = 100; u.outMW = 100; u.schedMW = 100; u.basePointMW = 100; }
    Object.assign(obs.demand, {litMW: 2000, nowMW: 2000});
    Object.assign(obs.wind, {availMW: 1000, outMW: 1000, autoMW: 0, ofgsTrippedFrac: 0});
    Object.assign(obs.solar, {availMW: 500, outMW: 500, autoMW: 0});
    poke(obs);
    const memo = createAutopilot({proxy: 'lean'}); // rules 1, 2, 7, 8, 9: no commitment rule in front of rule 8
    return {d: decide(obs, memo), memo, obs};
  };
  const acted = r => r.d.filter(x => x.type === 'callDR' || x.type === 'armRERT');
  assert.equal(thermalOn(at(() => {}).obs).length, 4, 'the fixture: four coal machines');
  // Units, tie and diesel are 176 MW short of the present; the battery's 500 MW carries that: no DR.
  let r = at(() => {});
  assert.ok(2000 - 1500 + V.PAR_DR_MARGIN_MW - firmNow < V.BATT_MW);
  assert.deepEqual(acted(r), [], 'nothing held back: ' + JSON.stringify(r.d));
  // The dispatch is spilling all but 100 MW of each: their OUTPUT is 200 MW, and nothing has changed.
  const heldBack = obs => { Object.assign(obs.wind, {outMW: 100, autoMW: 900}); Object.assign(obs.solar, {outMW: 100, autoMW: 400}); };
  r = at(heldBack);
  assert.deepEqual(acted(r), [], 'held back by the dispatch: ' + JSON.stringify(r.d));
  // The same low output with nothing held back (a still, dark noon) IS a shortage: DR at once.
  r = at(obs => { heldBack(obs); obs.wind.autoMW = 0; obs.solar.autoMW = 0; obs.wind.availMW = 100; obs.solar.availMW = 100;
    obs.forecast.windMW = obs.forecast.windMW.map(() => 100); obs.forecast.solarMW = obs.forecast.solarMW.map(() => 100); });
  assert.deepEqual(r.d, [{type: 'callDR'}]);
  assert.equal(r.memo.lastOrigin, 'rule8');
  // Wind held back on turbines that OFGS has tripped is not there to release (autoMW is stored
  // before OFGS): with half of them off, 450 of the 900 MW held back is gone, and that is a shortage.
  r = at(obs => { heldBack(obs); obs.wind.ofgsTrippedFrac = 0.5; });
  assert.deepEqual(r.d, [{type: 'callDR'}], 'half the wind farm tripped by OFGS');
  // The present is the sim's LIT demand (obs.demand.litMW), not the operational total: with a relit
  // suburb's roofs still off, the lit customers draw 400 MW more than demand.nowMW says.
  r = at(obs => { obs.demand.litMW = 2400; });
  assert.deepEqual(r.d, [{type: 'callDR'}], 'lit demand 400 MW above the operational total');
  r = at(obs => { obs.demand.nowMW = 2400; });
  assert.deepEqual(acted(r), [], 'the operational total alone moves nothing');

  // Ahead (P-12): Solstice Rise dark. Its districts take 14.7% of the customers and 25% of the
  // rooftop with them, so at noon the lit demand is ABOVE P50 x (1 - shed) by 10% of the rooftop
  // forecast. The forecast is poked flat (3,000 MW of rooftop, no wind, no utility solar) and its
  // P50 so that the lit net demand sits 150 MW above what four coal machines carry at the hot gate
  // 20 to 25 minutes out, with no gas unit free to start, DR spent and the battery at its reserve: the diesel is armed.
  // By share arithmetic the same columns would read 160 MW under it.
  const firmAhead = 4 * V.STATIONS.coal.ratingMW * V.HOT_LOADING_FRAC, roofMW = 3000;
  const ahead = (extraMW, pokeMore = () => {}) => at(obs => {
    const D = solDark(obs), fc = obs.forecast;
    const p50 = (firmAhead - V.PAR_RERT_MARGIN_MW + extraMW - roofMW * (D.roof - D.shed)) / (1 - D.shed);
    assert.ok(Math.abs(litOf(p50, roofMW, D) + V.PAR_RERT_MARGIN_MW - firmAhead - extraMW) < 1e-6);
    assert.ok(p50 * (1 - D.shed) + V.PAR_RERT_MARGIN_MW - firmAhead < extraMW - 300, 'share arithmetic reads 300 MW less');
    fc.demandP50 = fc.demandP50.map(() => p50); fc.rooftopMW = fc.rooftopMW.map(() => roofMW);
    fc.windMW = fc.windMW.map(() => 0); fc.solarMW = fc.solarMW.map(() => 0);
    for (const u of thermalOn(obs)) { u.availMW = u.ratingMW; }
    for (const u of gasOff(obs)) u.startBlock = 'minimum down time: 1 h left'; // no gas unit is free to start
    Object.assign(obs.demand, {litMW: 1000, nowMW: 1000});
    Object.assign(obs.dr, {callsLeft: 0, activeS: 0});
    obs.battery.socMWh = V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH;
    pokeMore(obs);
  });
  r = ahead(150);
  assert.deepEqual(r.d, [{type: 'armRERT'}], 'the lit forecast is 150 MW short');
  assert.equal(r.memo.lastOrigin, 'rule8');
  r = ahead(-20);
  assert.deepEqual(acted(r), [], 'the lit forecast is 20 MW inside');
});

test('the dispatch on lit demand (P-12, desk/README.md §21.3): the present is obs.demand.litMW, a restored district\'s surge is counted once, and the day-ahead hours carry the rooftop', () => {
  // A MILD morning, re-dispatched as the game does it (replan on the system's planOnly memory): the
  // plan is made at 08:00 and re-dispatched two minutes later, between two columns, so the first
  // plan column (08:05) lies 3/5 of the way from the present to the forecast's first column.
  const run = (poke = () => {}) => {
    const s = parDayAt(1, DESK, 8, 0), memo = createAutopilot({proxy: 'planOnly'});
    Object.assign(s.battery, {mode: 'idle', orderMW: 0});
    const obs0 = observe(s, {dayAhead: true});
    planUpdates(obs0, memo);
    for (let k = 0; k < 120 * TPS; k++) step(s);
    const obs = observe(s);
    const D = poke(obs, obs0) || {shed: 0, roof: 0};
    replan(obs, memo);
    const P = memo.plan, k0 = Math.floor((obs.s - P.madeAtS) / P.stepS);
    return {obs, obs0, D, P, k0, cover: q => P.tie[k0 + q] + P.lever.reduce((x, col) => x + col[k0 + q], 0) + P.gap[k0 + q]};
  };
  const near = (x, y, tol = 2) => Math.abs(x - y) <= tol;
  const base = run();
  assert.equal(base.obs.s, base.P.madeAtS + 120);
  assert.equal(base.k0, 0);
  const fc = base.obs.forecast;
  // No district dark, nothing restored: the first column is the forecast's own net demand, 3/5 of the way from the present.
  const w = 180 / V.FC_STEP_S, mix = (now, next) => now + (next - now) * w;
  const net0 = mix(base.obs.demand.litMW, fc.demandP50[0]) - mix(base.obs.wind.availMW, fc.windMW[0]) - mix(base.obs.solar.availMW, fc.solarMW[0]);
  assert.ok(near(base.cover(0), net0), 'first column ' + base.cover(0).toFixed(1) + ' against ' + net0.toFixed(1));
  // The present is the sim's lit demand: 200 MW more of it (a relit suburb's roofs still waiting)
  // is 80 MW more in the first column (2/5 of the present is left in it) and nothing later.
  let x = run(obs => { obs.demand.litMW += 200; obs.balance.servedMW += 200; });
  assert.ok(near(x.cover(0) - base.cover(0), 200 * (1 - w)), 'lit demand now +200: first column +' + (x.cover(0) - base.cover(0)).toFixed(1));
  assert.ok(near(x.cover(1), base.cover(1)) && near(x.cover(12), base.cover(12)));
  // The operational total alone (demand.nowMW) is not what the dispatch reads.
  x = run(obs => { obs.demand.nowMW += 200; });
  assert.ok(near(x.cover(0), base.cover(0)), 'demand.nowMW +200 moves nothing: ' + (x.cover(0) - base.cover(0)).toFixed(1));
  // K-13 cold load: 180 MW served above the lit demand (a district just restored) fades over
  // COLD_LOAD_DECAY_S; it is read against obs.demand.litMW, so the roofs still off are not counted twice.
  const fade = q => Math.max(0, 1 - (180 + q * V.FC_STEP_S) / V.COLD_LOAD_DECAY_S);
  x = run(obs => { obs.balance.servedMW += 180; });
  for (const q of [0, 1, 2]) assert.ok(near(x.cover(q) - base.cover(q), 180 * fade(q)), 'surge, column ' + q + ': +' + (x.cover(q) - base.cover(q)).toFixed(1));
  x = run(obs => { obs.demand.litMW += 300; obs.balance.servedMW += 300 + 180; });
  assert.ok(near(x.cover(0) - base.cover(0), 300 * (1 - w) + 180 * fade(0)), 'surge with roofs still off: +' + (x.cover(0) - base.cover(0)).toFixed(1));
  assert.ok(near(x.cover(1) - base.cover(1), 180 * fade(1)));

  // Solstice Rise dark. Inside the 4.5-h forecast a column is the lit demand of P-12 ...
  x = run(obs => { const D = solDark(obs); obs.demand.litMW = litOf(obs.demand.nowMW, obs.rooftop.availMW, D); obs.balance.servedMW = obs.demand.litMW; return D; });
  // (plan column q, q >= 1, lies 3/5 of the way from forecast column q - 1 to column q)
  const at = (arr, q) => arr[q - 1] + (arr[q] - arr[q - 1]) * w;
  const q1 = 30, p1 = at(fc.demandP50, q1), roof1 = at(fc.rooftopMW, q1), lit1 = litOf(p1, roof1, x.D);
  assert.ok(near(x.cover(q1) - base.cover(q1), lit1 - p1), '+2 h 35: ' + (x.cover(q1) - base.cover(q1)).toFixed(1) + ' against ' + (lit1 - p1).toFixed(1));
  assert.ok(Math.abs(lit1 - p1 * (1 - x.D.shed)) > 150, 'not P50 x (1 - shed): the rooftop forecast there is ' + roof1.toFixed(0) + ' MW');
  // ... and so is a column BEYOND it, from the plan's day-ahead forecast and its rooftop column
  // (13:05, five hours out: 3.3 GW of rooftop, a quarter of it dark).
  const q2 = 60, da = x.obs0.dayAhead;
  assert.ok(q2 >= fc.n + 2 && da.rooftopMW[q2] > 2500, 'the fixture: beyond the 4.5-h forecast, under a high sun');
  const lit2 = litOf(da.demandP50[q2], da.rooftopMW[q2], x.D);
  assert.ok(near(x.cover(q2) - base.cover(q2), lit2 - da.demandP50[q2]), '+5 h: ' + (x.cover(q2) - base.cover(q2)).toFixed(1) + ' against ' + (lit2 - da.demandP50[q2]).toFixed(1));
  assert.ok(Math.abs(lit2 - da.demandP50[q2] * (1 - x.D.shed)) > 250);
  // A heatwave announced after the plan was made lifts the UNDERLYING demand there (P50 + rooftop)
  // by HEAT_DEMAND_UPLIFT: the roofs do not shrink the uplift. Inside the 4.5-h forecast the
  // forecast already carries it, and before its window nothing moves.
  const heat = obs => { obs.news.push({atS: obs.s - 30, kind: 'heat', fromS: ticksAt(12, 30) / TPS, toS: ticksAt(20, 0) / TPS, text: 'WEATHER BUREAU: extreme heat.'}); };
  x = run(heat);
  const up = V.HEAT_DEMAND_UPLIFT * (da.demandP50[q2] + da.rooftopMW[q2]);
  assert.ok(near(x.cover(q2) - base.cover(q2), up), 'late heat at 13:05: +' + (x.cover(q2) - base.cover(q2)).toFixed(1) + ' against ' + up.toFixed(1));
  assert.ok(up - V.HEAT_DEMAND_UPLIFT * da.demandP50[q2] > 150);
  const q3 = 53; // 12:30: inside the heat window and still inside the 4.5-h forecast, which is the newer word
  assert.ok(q3 < fc.n && x.P.t0 + q3 * V.FC_STEP_S === ticksAt(12, 30) / TPS);
  assert.ok(near(x.cover(q3), base.cover(q3)), 'inside the forecast: ' + (x.cover(q3) - base.cover(q3)).toFixed(1));
  assert.ok(near(x.cover(q1), base.cover(q1)), 'before its window');
  const q4 = 155; // 21:00: beyond the forecast, after the window has closed
  assert.equal(x.P.t0 + q4 * V.FC_STEP_S, ticksAt(21, 0) / TPS);
  assert.ok(near(x.cover(q4), base.cover(q4)), 'after its window: ' + (x.cover(q4) - base.cover(q4)).toFixed(1));
  // (the units' heat derate is the dispatch's too, but it changes capacity, not what is to be covered)
  x = run(obs => { heat(obs); obs.news[obs.news.length - 1].atS = obs.s - 600; });
  assert.ok(near(x.cover(q2), base.cover(q2)), 'announced before the plan was made: the day-ahead forecast already has it');
});

test('par rule 9 in the belly (P-12): a dark district\'s pickup may be larger than L when the dispatch is spilling at least as much', () => {
  // The mild noon: L is a coal machine at its 240-MW floor, and a dark district picks up its
  // underlying load with its roofs off (about 270 MW). Before the fix rule 9 refused every district
  // for hours (cold load > L) while a gigawatt was being spilled.
  const at = poke => {
    const obs = quiet(observe(parDayAt(1, DESK, 12, 30)));
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 975});
    Object.assign(obs.sec, {lMW: 240, lKind: 'unit', lId: 'coal1', r5MW: 1900, previewNadirHz: 49.8});
    Object.assign(obs.districts.find(d => d.id === 'RED3'), {dark: true, shedBy: 'directed', restoreBlock: '', coldLoadMW: 270});
    Object.assign(obs.wind, {autoMW: 400}); Object.assign(obs.solar, {autoMW: 500});
    poke(obs);
    const memo = createAutopilot({proxy: 'lean'}); // rules 1, 2, 7, 8, 9
    return {d: decide(obs, memo), memo};
  };
  const first = 'RED3';
  // 900 MW spilled: the 270-MW pickup is restored although L is 240 MW.
  let r = at(() => {});
  assert.deepEqual(r.d, [{type: 'restore', district: first}]);
  assert.equal(r.memo.lastOrigin, 'rule9');
  // The spill must cover the pickup: 269 MW spilled does not lift the cap, 270 MW does.
  r = at(obs => { obs.wind.autoMW = 0; obs.solar.autoMW = 269; });
  assert.deepEqual(r.d, [], 'spilling 269 MW');
  r = at(obs => { obs.wind.autoMW = 0; obs.solar.autoMW = 270; });
  assert.deepEqual(r.d, [{type: 'restore', district: first}], 'spilling 270 MW');
  // Nothing spilled (any classic day, any evening): no larger than L, as before.
  r = at(obs => { obs.wind.autoMW = 0; obs.solar.autoMW = 0; });
  assert.deepEqual(r.d, []);
  r = at(obs => { obs.wind.autoMW = 0; obs.solar.autoMW = 0; obs.sec.lMW = 270; });
  assert.deepEqual(r.d, [{type: 'restore', district: first}], 'a pickup of exactly L');
  // The estimate of the dip still decides (the TRIP PREVIEW for L, scaled by pickup / L, against
  // the K-13 restore line): a preview of 49.55 Hz for 240 MW scales to 49.49 Hz for 270 MW.
  assert.ok(V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ > 50 - 0.45 * 270 / 240, 'the restore line is above the scaled dip');
  r = at(obs => { obs.sec.previewNadirHz = 49.55; });
  assert.deepEqual(r.d, [], 'the scaled dip is under the restore line');
  // The sim's own permissive is never overruled.
  r = at(obs => { for (const d of obs.districts) if (d.dark) d.restoreBlock = 'not enough reserve to carry it: 200 MW spare in 5 min for 270 MW'; });
  assert.deepEqual(r.d, []);
});

test('the battery in the plan (desk/README.md §21.3): an order counts for the energy behind it, the player\'s and par\'s own', () => {
  // A HOT morning at 10:00, re-dispatched as the game does it (replan on the system's planOnly memory).
  const supply = (battery, proxy = 'planOnly', memoPoke = {}, h = 10) => {
    const s = parDayAt(2, DESK, h, 0);
    Object.assign(s.battery, {guardMW: 0, fullHold: false}, battery);
    const obs = observe(s, {dayAhead: true}), memo = Object.assign(createAutopilot({proxy}), memoPoke);
    planUpdates(obs, memo); // makes the day's plan (the L-0 pre-dispatch) in the memo
    replan(observe(s), memo);
    const P = memo.plan, k0 = Math.floor((obs.s - P.madeAtS) / P.stepS);
    return q => P.tie[k0 + q] + P.lever.reduce((a, col) => a + col[k0 + q], 0) + P.gap[k0 + q]; // what the units and the tie are asked to cover (gap = cover - supply)
  };
  const reserve = V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH, near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
  const idle = supply({mode: 'idle', orderMW: 0, socMWh: 600});
  // DISCHARGE 300 with 110 MWh above the reserve: 22 minutes of it. Columns at 5..20 min carry it, later ones do not.
  let x = supply({mode: 'discharge', orderMW: 300, socMWh: reserve + 110});
  for (const q of [0, 1, 2, 3]) assert.ok(near(idle(q) - x(q), 300), 'column +' + (q + 1) * 5 + ' min: ' + (idle(q) - x(q)).toFixed(1));
  for (const q of [4, 8, 30, 100]) assert.ok(near(idle(q), x(q)), 'column +' + (q + 1) * 5 + ' min: ' + (idle(q) - x(q)).toFixed(1));
  // At the reserve it is no supply at all.
  x = supply({mode: 'discharge', orderMW: 300, socMWh: reserve});
  for (const q of [0, 3, 30]) assert.ok(near(idle(q), x(q)));
  // CHARGE 400 with 96 MWh of room: 17 minutes at 85% efficiency, then the load is gone.
  x = supply({mode: 'charge', orderMW: 400, socMWh: V.BATT_MWH - 96});
  for (const q of [0, 1, 2]) assert.ok(near(x(q) - idle(q), 400), 'charging, column +' + (q + 1) * 5 + ' min: ' + (x(q) - idle(q)).toFixed(1));
  for (const q of [3, 8, 30]) assert.ok(near(idle(q), x(q)), 'full, column +' + (q + 1) * 5 + ' min');
  // A charge order paused on a full battery (FULL-HOLD) is no load; the GUARD's MW are not the order's.
  x = supply({mode: 'charge', orderMW: 400, socMWh: V.BATT_MWH, fullHold: true});
  assert.ok(near(idle(0), x(0)) && near(idle(8), x(8)));
  // (it stays paused until a new order, also after AGC has drawn the battery down again)
  x = supply({mode: 'charge', orderMW: 400, socMWh: 900, fullHold: true});
  assert.ok(near(idle(0), x(0)) && near(idle(2), x(2)), 'FULL-HOLD at 900 MWh: ' + (x(0) - idle(0)).toFixed(1));
  x = supply({mode: 'discharge', orderMW: 300, socMWh: 900, guardMW: 350});
  assert.ok(near(idle(0) - x(0), 150), 'the order is limited to the inverter less the GUARD: ' + (idle(0) - x(0)).toFixed(1));
  // Par's own orders are read the same way (a memory that runs rule 6): 22 minutes of discharge above the reserve ...
  const parIdle = supply({mode: 'idle', orderMW: 0, socMWh: 600}, 'par');
  x = supply({mode: 'discharge', orderMW: 300, socMWh: reserve + 110}, 'par');
  for (const q of [0, 1, 2, 3]) assert.ok(near(parIdle(q) - x(q), 300), 'par, column +' + (q + 1) * 5 + ' min: ' + (parIdle(q) - x(q)).toFixed(1));
  for (const q of [4, 8, 100]) assert.ok(near(parIdle(q), x(q)), 'par, column +' + (q + 1) * 5 + ' min: ' + (parIdle(q) - x(q)).toFixed(1));
  // ... under the GUARD as the sim limits it ...
  x = supply({mode: 'discharge', orderMW: 300, socMWh: 900, guardMW: 350}, 'par');
  assert.ok(near(parIdle(0) - x(0), 150));
  // ... and never past the end of the discharge window, where rule 6 ends it whatever is left
  // (50 MW from a full battery would last until 02:00; the 22:00 column no longer has it). The
  // player's order runs on: nobody ends it for them.
  const col = (hh, mm) => ((hh - 10) * 60 + mm) / 5 - 1; // the plan column at hh:mm, counted from 10:00
  x = supply({mode: 'discharge', orderMW: 50, socMWh: V.BATT_MWH}, 'par');
  for (const q of [0, col(21, 55)]) assert.ok(near(parIdle(q) - x(q), 50), 'par, 50 MW, column ' + q);
  for (const q of [col(22, 0), col(23, 30)]) assert.ok(near(parIdle(q), x(q)), 'par, past 22:00, column ' + q);
  x = supply({mode: 'discharge', orderMW: 50, socMWh: V.BATT_MWH});
  for (const q of [col(22, 0), col(25, 55)]) assert.ok(near(idle(q) - x(q), 50), 'the player, 50 MW, column ' + q);
  assert.ok(near(idle(col(26, 0)), x(col(26, 0))), 'the player: 800 MWh at 50 MW ends at 02:00');
  // A par charge counts up to PAR_BATT_CHARGE_TO (17 minutes here), a belly order (S-14 rule 2) or not.
  for (const memoPoke of [{belly: true}, {}]) {
    x = supply({mode: 'charge', orderMW: 340, socMWh: V.PAR_BATT_CHARGE_TO * V.BATT_MWH - 82}, 'par', memoPoke);
    for (const q of [0, 1, 2]) assert.ok(near(x(q) - parIdle(q), 340), 'par charge, column +' + (q + 1) * 5 + ' min: ' + (x(q) - parIdle(q)).toFixed(1));
    for (const q of [3, 30]) assert.ok(near(parIdle(q), x(q)), 'par charge ended, column +' + (q + 1) * 5 + ' min');
  }
  // A charge ordered AFTER the 09:30-15:30 window (the night's recharge of a battery AGC has drawn
  // down) is load in par's plan for as long as it runs. It used to count "until 15:30", which had
  // passed: the plan never saw it and AGC carried the whole order for hours.
  const lateIdle = supply({mode: 'idle', orderMW: 0, socMWh: 100}, 'par', {}, 16);
  x = supply({mode: 'charge', orderMW: 300, socMWh: 100}, 'par', {}, 16);
  for (const q of [0, 6, 24]) assert.ok(near(x(q) - lateIdle(q), 300), 'a 16:00 charge, column +' + (q + 1) * 5 + ' min: ' + (x(q) - lateIdle(q)).toFixed(1));
  const fullAt = Math.floor((V.PAR_BATT_CHARGE_TO * V.BATT_MWH - 100) / (300 * V.BATT_CHARGE_EFF) * 12); // columns until 97%
  assert.ok(near(x(fullAt + 1), lateIdle(fullAt + 1)), 'and no longer once it is at 97%');
});

test('a unit still loading in the belly (final review of Phase 2a): the dispatch counts its output on its T2 slope and never imports what it supplies', () => {
  // The mild noon of par's day, poked: coal 4 is back on the grid and loading (100 MW of its 240-MW
  // floor), the other three coal machines at their floor, hydro spinning empty, the battery idle.
  // Flat forecast: wind and sun as now; lit demand 50 MW above the three machines' floor plus the
  // wind and the sun, so it is the loading machine's output that keeps the grid in a surplus. The
  // sim's cut counts that output as must-run (grid.js surplusMW), so the plan must not buy it from
  // the neighbour at its $6 (before the fix: 50 MW imported in every column while it loads, and the
  // sim's cut spilling about what the machine supplies).
  const i4 = V.MACHINE_IDS.indexOf('coal4'), m4 = V.MACHINES[i4];
  const loadRate = (m4.minMW - Math.min(m4.syncBlockMW, m4.minMW)) / m4.t2S, out0 = 100;
  const plan = proxy => {
    const s = parDayAt(1, DESK, 12, 30);
    Object.assign(s.battery, {mode: 'idle', orderMW: 0, socMWh: 700, fullHold: false});
    const obs = observe(s, {dayAhead: true}), memo = createAutopilot({proxy});
    planUpdates(obs, memo); // the day's plan (the L-0 pre-dispatch) in the memo
    const u = obs.units[i4];
    Object.assign(u, {mode: 'loading', schedMW: out0, outMW: out0, basePointMW: 0, timerS: Math.ceil((m4.minMW - out0) / loadRate)});
    const floorMW = obs.units.reduce((a, x) => a + (x.mode === 'on' ? x.minMW : 0), 0);
    const renMW = obs.wind.availMW + obs.solar.availMW, litMW = floorMW + renMW + 50, fc = obs.forecast;
    Object.assign(obs.demand, {litMW, nowMW: litMW});
    Object.assign(obs.wind, {autoMW: 0, ofgsTrippedFrac: 0}); obs.solar.autoMW = 0;
    fc.demandP50 = fc.demandP50.map(() => litMW); // no district dark: the lit forecast is P50
    fc.windMW = fc.windMW.map(() => obs.wind.availMW); fc.solarMW = fc.solarMW.map(() => obs.solar.availMW);
    replan(obs, memo);
    return {obs, P: memo.plan, k0: Math.floor((obs.s - memo.plan.madeAtS) / memo.plan.stepS), onS: obs.s + u.timerS, floorMW, renMW, litMW};
  };
  for (const proxy of ['planOnly', 'par']) { // the game's dispatch (app/system.js, replan) and par's amend
    const {obs, P, k0, onS, floorMW, renMW, litMW} = plan(proxy);
    assert.equal(floorMW, 3 * m4.minMW, 'the fixture: three coal machines on, hydro at 0 MW');
    assert.ok(obs.tie.neighbourPrice < V.STATIONS.coal.offer, 'the fixture: importing is cheaper than raising coal');
    let cols = 0;
    for (let k = k0; P.t0 + k * P.stepS < onS; k++) {
      const t = P.t0 + k * P.stepS, loadingMW = Math.min(m4.minMW, out0 + loadRate * (t - obs.s));
      assert.ok(floorMW + renMW < litMW && floorMW + loadingMW + renMW >= litMW, 'the fixture at column ' + k);
      assert.ok(P.tie[k] <= 0, proxy + ': the plan imports ' + P.tie[k].toFixed(0) + ' MW at +' + (t - obs.s) + ' s with ' + loadingMW.toFixed(0) + ' MW loading');
      cols++;
    }
    assert.ok(cols >= 8, 'the machine loads for ' + cols + ' plan columns');
    // From its floor on it is the coal station's (its MIN in the lever), not counted twice: the plan exports.
    const kOn = Math.ceil((onS - P.t0) / P.stepS) + 1;
    assert.ok(P.lever[0][kOn] >= 4 * m4.minMW - 1 && P.tie[kOn] <= 0, proxy + ': after it is on, coal ' + P.lever[0][kOn].toFixed(0) + ' MW, tie ' + P.tie[kOn].toFixed(0));
  }
});

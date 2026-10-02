// Stage B owner "autopilot": sim/autopilot.js acceptance (L-0, S-4, S-11, S-12, P-6, D-2, D-9).
// The import barrier (autopilot imports only params.js and step.js) is checked for real in
// sim-lint. Slow tests still todo carry the measured result and the reason in their todo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, createAutopilot, decide, refRealSeconds, preDispatch, replan, planUpdates} from '../sim/autopilot.js';
import {createState, step, observe, hashState, applyInput} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {slowOnly, ticksAt, SLOW, TPS, injectTrip, clone} from './lib/sim-helpers.js';
import {yardstickNs, workClock, budgetUnits} from './lib/speed.js';

// Whole-day statistics run only with GRIDWATCH_SLOW=1 (npm run test:slow), or in tools/par.js.
// Tuning pass (owner decisions D1-D3, 2026-09-30; SPEC S-12 has the table): GT·C 2 x 300 MW,
// minimum down time after planned stops only, rule 8's adequacy walk; then the finishing pass's
// preview refresh on frequency drift (H-4), then the review-fix pass (rule 6's window end,
// rule 2's sustainable GUARD, the price on the lit demand). Measured (v4-core-0.2.2,
// tools/baseline-v4.js): par clean on 181/200 raw and 75/100 forced-heat seeds, RERT on 47/200,
// commitAll dearer on 86/100 (seeds 1-100), lean A on 0/100, planOnly black on 0/100.
const SEEDS = n => Array.from({length: n}, (_, i) => i + 1);

/** S-5 letter grade of a proxy's run against par's on the same seed (tools/par.js grade()). */
function grade(r, par) {
  if (r.black) return 'F';
  const du = r.score.unservedMWh - par.score.unservedMWh;
  if (du <= 10) return r.summary.costDollars <= par.summary.costDollars * 1.05 ? 'A' : 'B';
  if (du <= 150) return 'B';
  return du <= 600 ? 'C' : 'D';
}

/** A state stepped (no inputs) to the given tick. */
function stepTo(seed, tick, scenario = CLASSIC) {
  const s = createState(seed, scenario);
  while (!s.over && s.tick < tick) step(s);
  return s;
}

test('S-4: par is deterministic per seed', () => {
  const a = runPar(3, CLASSIC, {untilTick: ticksAt(8)}), b = runPar(3, CLASSIC, {untilTick: ticksAt(8)});
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.origins, b.origins);
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(a.origins.length, a.log.length);
});

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
  // The donor is a heat day (seed 4: heat announced 10:30, after the cut) and seed 5 a storm
  // day, so the regime and the heat window really change (review fix: seeds 5 and 6 are both
  // storm days with no heat window, and the scramble changed neither).
  // Phase 2a (desk/README.md §25): the same on DESK, the game's day, where the hidden state also
  // holds each suburb's rooftop sky (ext.rooftop.clearPm) and the regime's temperature class
  // (seed 5 is a MILD storm day, the donor a heatwave announced at 10:30). state.day is public
  // (MILD / HOT, the weekend) and is not swapped.
  const cutS = (10 - V.DAY_START_H) * 3600, cut = cutS * TPS;
  for (const scn of [CLASSIC, DESK]) {
    const plain = runPar(5, scn, {untilTick: cut});
    const donor = createState(4, scn);
    const s = createState(5, scn);
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
    const scrambled = runPar(5, scn, {state: s, untilTick: cut});
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

test('S-4 pace: at most one discrete action per 3 real s of the reference playback, none in a watch; D-9: a par day <= 2 x 1.6 s on the owner\'s laptop, timed against a CPU yardstick that shares no code with the sim', () => {
  const yard = yardstickNs();
  const clock = workClock();
  const r = runPar(7, CLASSIC);
  const secs = clock();
  const conts = observe(r.state).contingencies;
  // 'plan' is the L-0 plan; 'replan' is par's re-dispatched schedule after an action (the
  // RE-PLAN, part of the action it follows: SPEC S-4 and §8.2). Every other input is a
  // discrete action and is paced.
  const acts = r.log.filter((x, i) => r.origins[i] !== 'plan' && r.origins[i] !== 'replan');
  assert.ok(acts.length > 10 && acts.every((x, i) => /^rule[1-9]$/.test(r.origins[r.log.indexOf(x)])), 'discrete actions are rules');
  for (let i = 1; i < acts.length; i++) {
    const a = acts[i - 1].tick / TPS, b = acts[i].tick / TPS;
    assert.ok(refRealSeconds(a, b, conts) >= V.PAR_ACTION_GAP_REAL_S - 1e-9, 'actions at ' + a + ' and ' + b + ' s too close');
  }
  // A re-plan follows an action: none before par's first discrete action, and it only moves
  // levers and the tie or starts what the re-dispatch commits (par decommits by rule 4 only).
  const firstAct = r.origins.findIndex(o => /^rule/.test(o));
  const re = r.log.filter((x, i) => r.origins[i] === 'replan');
  assert.ok(re.length > 0 && r.origins.indexOf('replan') > firstAct, 'replan before any action');
  assert.ok(re.every(x => x.type === 'planLoad' && x.args.stops.length === 0), 'a re-plan is a planLoad and never stops a unit');
  assert.equal(r.log.filter((x, i) => r.origins[i] === 'plan').length, 1, 'one L-0 plan (a planLoad at 04:30)');
  for (const x of r.log) {
    const sx = x.tick / TPS;
    assert.ok(!conts.some(c => sx >= c.startS && sx < c.watchEndS), 'input during the watch at ' + sx);
    assert.ok(x.tick >= V.PLAYER_START_TICK, 'par acted before 04:30');
  }
  // D-9: 365 par days in <= 10 min on one core needs <= 1.6 s a day on the owner's laptop;
  // 2x margin. The day is timed on the main thread's CPU clock where Node has one (other
  // processes of the parallel `node --test` run do not inflate it) and divided by a CPU
  // yardstick measured just before it (tests/lib/speed.js), so a slower machine is not a
  // failure and a slower ENGINE is (review fix: the old fallback compared par with planOnly,
  // which share the engine, so a 4x slower physics still passed). Measured on the owner's
  // laptop after the review fixes: ~1.5-1.7 s, ~5 yardstick units per tick against 10.6.
  const limit = budgetUnits(2 * 1.6e9 / V.DAY_TICKS);
  const units = (x, y) => x * 1e9 / V.DAY_TICKS / y;
  let got = units(secs, yard);
  if (got > limit) { // one re-time before failing: the yardstick again, then par again (the faster of each)
    const y2 = Math.min(yard, yardstickNs()), c2 = workClock();
    runPar(7, CLASSIC);
    got = units(Math.min(secs, c2()), y2);
  }
  assert.ok(got <= limit, 'a par day costs ' + got.toFixed(2) + ' yardstick units per tick (' + secs.toFixed(2) + ' s here), budget ' +
    limit.toFixed(2) + ' (2 x 1.6 s on the owner\'s laptop)');
});

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

test('par memory is plain JSON: a day resumed from JSON copies of the state and the memo is the same day (review fix)', () => {
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
// day on DESK or DESK_WEEKEND up to the given time (run once per case and cloned), then the
// observation is poked so that rules 1 to 3 want nothing and the rule under test decides.

const DAYS = new Map();
/** Par's day on `scn` to hh:mm (a JSON copy of the state; each distinct day is run once). */
function parDayAt(seed, scn, h, m) {
  const key = seed + scn.id + h + ':' + m;
  if (!DAYS.has(key)) DAYS.set(key, runPar(seed, scn, {untilTick: ticksAt(h, m) + 1}).state);
  return clone(DAYS.get(key));
}
/** An observation in which rules 1-3 want nothing: no contingency in hand, security comfortable, no GUARD to step down. */
function quiet(obs) {
  obs.contingencies = [];
  Object.assign(obs.sec, {r5MW: 2000, lMW: 600, lKind: 'unit', lId: 'coal1', previewNadirHz: 49.7});
  Object.assign(obs.agc, {unmetMW: 0, requestMW: 0}); obs.f.hz = 50; obs.fos.outsideS = 0;
  obs.battery.guardMW = 0;
  return obs;
}
const thermalOn = obs => obs.units.filter(u => u.mode === 'on' && u.cls !== 'hydro');
const gasCommitted = obs => obs.units.filter(u => (u.cls === 'ccgt' || u.cls === 'ocgt') && u.mode !== 'off' && u.mode !== 'tripped');

test('S-14 rule 2 (C-12): par charges whenever the price is at or below $0 or power is being spilled and the battery has room, a union with rule 6\'s window', () => {
  // A MILD weekday at 12:30, inside the 09:30-15:30 window: four coal machines at their floor.
  const at = (poke, memo = createAutopilot()) => {
    const obs = quiet(observe(parDayAt(1, DESK, 12, 30)));
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 700, fullHold: false});
    obs.price.mwh = 26; obs.wind.autoMW = 0; obs.solar.autoMW = 0;
    for (const u of thermalOn(obs)) u.outMW = u.minMW;
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
  // More spill than the rule's limit: PAR_BATT_CHARGE_MAX_MW.
  r = at(obs => { obs.solar.autoMW = 900; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: V.PAR_BATT_CHARGE_MAX_MW}]);
  // The order is on top of what is already ordered (the sim's cut is net of the order).
  r = at(obs => { Object.assign(obs.battery, {mode: 'charge', orderMW: 120}); obs.solar.autoMW = 110; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 230}]);
  // No more than reaches PAR_BATT_CHARGE_TO by par's next possible action (3 real s at 300x: 15 grid-min).
  r = at(obs => { obs.battery.socMWh = 950; obs.solar.autoMW = 300; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: Math.floor((970 - 950) / V.BATT_CHARGE_EFF / 0.25)}]);
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

  // Outside the window (08:40; no plan in hand): spill or a price at or below $0 charges, nothing else does.
  const early = poke => at(obs => { obs.s = ticksAt(8, 40) / TPS; obs.tick = ticksAt(8, 40) + 1; obs.dayAhead = null; poke(obs); });
  r = early(obs => { obs.solar.autoMW = 180; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 180}]);
  assert.equal(r.memo.lastOrigin, 'rule6');
  r = early(obs => { obs.price.mwh = -0.01; });
  assert.equal(r.memo.lastOrigin, '', 'a price below $0 with nothing spilled and no window: nothing to order, ' + JSON.stringify(r.d));
  r = early(() => {});
  assert.notEqual(r.memo.lastOrigin, 'rule6');
  // In the evening window a price at or below $0 turns a discharge into a charge (never sell at a negative price).
  r = at(obs => { obs.s = ticksAt(17, 0) / TPS; obs.tick = ticksAt(17, 0) + 1; obs.dayAhead = null; Object.assign(obs.battery, {mode: 'discharge', orderMW: 140});
    obs.solar.autoMW = 90; obs.price.mwh = V.RENEWABLE_OFFER; });
  assert.deepEqual(r.d, [{type: 'battery', mode: 'charge', mw: 90}]);
});

test('S-14 rule 4 (C-12): one coal machine is stopped only if MSL2 is forecast for 3 h and the evening holds N-1 without it; gas goes first', () => {
  // A mild weekend at 10:30. Coal 4, off since Friday night, was started by par at 04:30 (rule 3)
  // and is inside its 8-h minimum up time, so the candidate is coal 3. MSL2 for three hours does
  // not occur on real days, so the forecast is poked to it.
  const stepS = V.FC_STEP_S, cols = V.PAR_COAL_MSL2_H * 3600 / stepS;
  const at = (poke, memo = createAutopilot()) => {
    const obs = quiet(observe(parDayAt(1, DESK_WEEKEND, 10, 30), {dayAhead: true}));
    for (const u of obs.units) if (u.cls === 'ccgt' || u.cls === 'ocgt') Object.assign(u, {mode: 'off', sync: false, outMW: 0, schedMW: 0, basePointMW: 0, startBlock: ''});
    for (const u of thermalOn(obs)) u.outMW = u.minMW;
    obs.plan.starts = []; obs.plan.stops = [];
    Object.assign(obs.battery, {mode: 'idle', orderMW: 0, socMWh: 975}); // nothing for rule 6 to order
    obs.forecast.demandP50 = obs.forecast.demandP50.map(() => V.MSL2_MW - 50);
    poke(obs);
    return {d: decide(obs, memo), memo, obs};
  };
  const fixture = observe(parDayAt(1, DESK_WEEKEND, 10, 30));
  assert.equal(fixture.day.temp, 'MILD');
  assert.deepEqual(thermalOn(fixture).map(u => u.id), ['coal1', 'coal2', 'coal3', 'coal4'], 'the fixture: four coal machines, no gas');
  assert.match(fixture.units.find(u => u.id === 'coal4').stopBlock, /minimum up/);
  const lighter = f => obs => { obs.dayAhead.demandP50 = obs.dayAhead.demandP50.map(x => x * f); };
  // The real evening (6.0 GW at the 19:35 peak, 5.3 GW net of wind) does not hold N-1 without it: no stop.
  let r = at(() => {});
  assert.ok(!r.d.some(x => x.type === 'stop'), 'the real evening: ' + JSON.stringify(r.d));
  assert.equal(r.memo.coalStops, 0);
  // A lighter evening holds it: the coal machine goes (the last in merit order that is free to stop: coal 3).
  r = at(lighter(0.8));
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}]);
  assert.equal(r.memo.lastOrigin, 'rule4');
  assert.equal(r.memo.coalStops, 1);
  // One a day.
  r = at(lighter(0.8), Object.assign(createAutopilot(), {coalStops: 1}));
  assert.ok(!r.d.some(x => x.type === 'stop'));
  // MSL2 for five minutes short of three hours: no stop.
  r = at(obs => { lighter(0.8)(obs); obs.forecast.demandP50 = obs.forecast.demandP50.map((x, k) => (k < cols - 1 ? x : V.MSL2_MW + 1)); });
  assert.ok(!r.d.some(x => x.type === 'stop'), 'MSL2 for ' + (cols - 1) * stepS / 60 + ' min');
  r = at(obs => { lighter(0.8)(obs); obs.forecast.demandP50 = obs.forecast.demandP50.map((x, k) => (k < cols ? x : V.MSL2_MW + 1)); });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'MSL2 for exactly three hours');
  // With the tie out the threshold is 300 MW higher in the columns before its return (M-1).
  const tieOut = (obs, lockoutS) => { Object.assign(obs.tie, {tripped: true, lockoutS, flowMW: 0}); obs.forecast.demandP50 = obs.forecast.demandP50.map(() => V.MSL2_MW + 200); };
  r = at(obs => { lighter(0.6)(obs); tieOut(obs, 4.5 * 3600); });
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'tie out all window: 1,500 MW counts as MSL2');
  r = at(obs => { lighter(0.6)(obs); tieOut(obs, 2 * 3600); });
  assert.ok(!r.d.some(x => x.type === 'stop'), 'tie back in 2 h: only 2 h of MSL2');
  // Gas goes first: while a gas unit is committed the coal stays (rule 4 stops the gas unit, or nothing).
  r = at(obs => { lighter(0.8)(obs); Object.assign(obs.units.find(u => u.id === 'gta1'), {mode: 'starting', timerS: 200}); });
  assert.ok(!r.d.some(x => x.type === 'stop' && /^coal/.test(x.unit)), JSON.stringify(r.d));
  // N-1 in minutes without it (as for a gas unit): R5 short of L, no stop.
  // (L is the tie import here; 640 MW is >= 1.05 L, but not without a coal machine's 15 MW of 5-min headroom.)
  r = at(obs => { lighter(0.8)(obs); Object.assign(obs.sec, {r5MW: 640, lMW: 600, lKind: 'link', lId: 'tie'}); });
  assert.ok(!r.d.some(x => x.type === 'stop'), 'N-1 in minutes: ' + JSON.stringify(r.d));
  // "The evening" runs until the machine could be back at minimum load: stopped at 10:30 from its
  // floor it is off the grid at 11:40 (T4), may START at 19:40 (8 h down) and is at MIN at 21:44
  // (T1 50 + auto-sync 4 + T2 70 min). A heavy column before that blocks the stop; one after does not.
  const coal = V.STATIONS.coal, backS = ticksAt(10, 30) / TPS + (coal.t4Min + coal.minDownH * 60 + coal.t1Min + V.AUTO_SYNC_S / 60 + coal.t2Min) * 60;
  assert.equal(backS, ticksAt(21, 44) / TPS);
  const heavyAt = t => obs => { lighter(0.8)(obs); const k = Math.round((t - obs.dayAhead.fromS) / stepS) - 1; obs.dayAhead.demandP50[k] = 9000; };
  r = at(heavyAt(backS - 240)); // the 21:40 column
  assert.ok(!r.d.some(x => x.type === 'stop'), 'a heavy 21:40');
  r = at(heavyAt(backS + 360)); // the 21:50 column
  assert.deepEqual(r.d, [{type: 'stop', unit: 'coal3'}], 'a heavy 21:50 is after it is back');
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
  // The present: the sim's own lit demand (obs.demand.litMW) is what the adequacy walk and the cold-load term read.
  assert.ok(Math.abs(dark.obs.demand.litMW - (lit.obs.demand.litMW - lit.netMW)) < 15);
  assert.ok(Math.abs(dark.obs.demand.nowMW * (1 - lit.share) - dark.obs.demand.litMW) > 40, 'not nowMW x (1 - shed)');
});

test('the battery in the plan (desk/README.md §21.3): the player\'s order counts for the energy behind it; par\'s window orders end with their window', () => {
  // A HOT morning at 10:00, re-dispatched as the game does it (replan on the system's planOnly memory).
  const supply = (battery, proxy = 'planOnly', memoPoke = {}) => {
    const s = parDayAt(2, DESK, 10, 0);
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
  x = supply({mode: 'discharge', orderMW: 300, socMWh: 900, guardMW: 350});
  assert.ok(near(idle(0) - x(0), 150), 'the order is limited to the inverter less the GUARD: ' + (idle(0) - x(0)).toFixed(1));
  // Par's own orders: a window discharge counts to 22:00 as before Phase 2a (rule 6 sized it to that) ...
  const parIdle = supply({mode: 'idle', orderMW: 0, socMWh: 600}, 'par');
  x = supply({mode: 'discharge', orderMW: 300, socMWh: reserve + 110}, 'par');
  for (const q of [0, 8, 100]) assert.ok(near(parIdle(q) - x(q), 300), 'par, column +' + (q + 1) * 5 + ' min');
  // ... and its belly charge (S-14 rule 2) for the energy up to PAR_BATT_CHARGE_TO (17 minutes here).
  x = supply({mode: 'charge', orderMW: 340, socMWh: V.PAR_BATT_CHARGE_TO * V.BATT_MWH - 82}, 'par', {belly: true});
  for (const q of [0, 1, 2]) assert.ok(near(x(q) - parIdle(q), 340), 'par belly charge, column +' + (q + 1) * 5 + ' min: ' + (x(q) - parIdle(q)).toFixed(1));
  for (const q of [3, 30]) assert.ok(near(parIdle(q), x(q)), 'par belly charge ended, column +' + (q + 1) * 5 + ' min');
});

test('S-12: par sheds zero on >= 85% of 200 raw seeds; arms RERT on <= 25%; the lean proxy earns A on <= 40%', slowOnly(), () => {
  let clean = 0, rert = 0, leanA = 0;
  const LEAN_SEEDS = 50;
  for (const seed of SEEDS(200)) {
    const r = runPar(seed, CLASSIC);
    if (r.score.unservedMWh === 0 && !r.black) clean++;
    if (r.log.some(x => x.type === 'armRERT')) rert++;
    if (seed <= LEAN_SEEDS && grade(runPar(seed, CLASSIC, {proxy: 'lean'}), r) === 'A') leanA++;
  }
  assert.ok(clean >= 170, 'par clean on ' + clean + '/200');
  assert.ok(rert <= 50, 'par armed RERT on ' + rert + '/200');
  assert.ok(leanA <= 0.4 * LEAN_SEEDS, 'lean A on ' + leanA + '/' + LEAN_SEEDS);
});

test('S-12: par sheds zero on >= 75% of 100 forced-heatwave seeds', slowOnly(), () => {
  // Forced heat: seeds whose regime is heat (the 15% class), first 100 of them.
  const heatSeeds = [];
  for (let seed = 1; heatSeeds.length < 100; seed++) if (createState(seed, CLASSIC).ext.regime.cls === 'heat') heatSeeds.push(seed);
  const clean = heatSeeds.filter(seed => { const r = runPar(seed, CLASSIC); return r.score.unservedMWh === 0 && !r.black; }).length;
  assert.ok(clean >= 75, 'par clean on ' + clean + '/100 heat seeds');
});

test('P-6: par\'s tie flow is not pinned at one limit all day on >= 50% of seeds (importing is a decision)', slowOnly(), () => {
  let varied = 0;
  for (const seed of SEEDS(40)) {
    const flows = new Set();
    runPar(seed, CLASSIC, {onStep: st => { if (st.tick % (300 * TPS) === 0) flows.add(Math.round(st.tie.flowMW)); }});
    const pinned = flows.size <= 1 || [...flows].every(f => f >= V.TIE_MAX_MW - 1);
    if (!pinned) varied++;
  }
  assert.ok(varied >= 20, varied + '/40');
});

test('S-11: "commit everything at 04:00" costs more than par on >= 70% of seeds', slowOnly(), () => {
  let dearer = 0;
  for (const seed of SEEDS(30)) {
    const par = runPar(seed, CLASSIC).summary.costDollars;
    const all = runPar(seed, CLASSIC, {proxy: 'commitAll'}).summary.costDollars;
    if (all > par) dearer++;
  }
  assert.ok(dearer >= 21, dearer + '/30');
});

test('L-0: AGC plus the pre-dispatch plan with no other input (planOnly) never ends the day black', slowOnly(), () => {
  for (const seed of SEEDS(SLOW ? 50 : 20)) assert.equal(runPar(seed, CLASSIC, {proxy: 'planOnly'}).black, false, 'seed ' + seed);
});

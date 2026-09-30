// Stage B owner "autopilot": sim/autopilot.js acceptance (L-0, S-4, S-11, S-12, P-6, D-2, D-9).
// The import barrier (autopilot imports only params.js and step.js) is checked for real in
// sim-lint. Slow tests still todo carry the measured result and the reason in their todo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, createAutopilot, decide, refRealSeconds, preDispatch} from '../sim/autopilot.js';
import {createState, step, observe, hashState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
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
  for (const list of ['starts', 'stops', 'basePoints', 'ties']) {
    for (let i = 1; i < plan[list].length; i++) assert.ok(plan[list][i].atS >= plan[list][i - 1].atS, list + ' sorted');
    for (const e of plan[list]) assert.ok(e.atS >= V.PLAYER_START_S && e.atS < V.DAY_S, list + ' at ' + e.atS);
  }
  // Every base point is reachable at the station's ramp from the previous keyframe.
  for (const id of V.STATION_IDS) {
    const bp = plan.basePoints.filter(b => b.station === id);
    const st = V.STATIONS[id], rampPerS = st.rampMWMin / 60 * st.machines;
    for (let i = 1; i < bp.length; i++) {
      assert.ok(Math.abs(bp[i].mw - bp[i - 1].mw) <= rampPerS * (bp[i].atS - bp[i - 1].atS) + 1e-6, id + ' ramp at ' + bp[i].atS);
      assert.ok(bp[i].mw <= st.totalMW + 1e-9);
    }
  }
  // The tie follows merit order: at least one import and one lower setpoint over the day (P-6).
  assert.ok(new Set(plan.ties.map(t => t.mw)).size >= 2, 'tie plan pinned at one value');
});

test('S-4: information barrier: scrambling hidden state (future events, the regime, the series, the heat window) leaves par\'s log unchanged', () => {
  // Par runs on a state whose ext is replaced after the cut by another seed's; its input log
  // before the cut must be identical (nothing hidden after the cut was observable before it).
  // The donor is a heat day (seed 4: heat announced 10:30, after the cut) and seed 5 a storm
  // day, so the regime and the heat window really change (review fix: seeds 5 and 6 are both
  // storm days with no heat window, and the scramble changed neither).
  const cutS = (10 - V.DAY_START_H) * 3600, cut = cutS * TPS;
  const plain = runPar(5, CLASSIC, {untilTick: cut});
  const donor = createState(4, CLASSIC);
  const s = createState(5, CLASSIC);
  assert.notDeepEqual(donor.ext.regime, s.ext.regime, 'the donor has another regime');
  assert.ok(donor.ext.heat !== null && s.ext.heat === null && donor.ext.heat.announceS > cutS, 'a heat window announced after the cut');
  s.ext.regime = donor.ext.regime;
  s.ext.heat = donor.ext.heat;
  s.ext.events = s.ext.events.filter(e => e.atS < cutS).concat(donor.ext.events.filter(e => e.atS >= cutS));
  for (const k of ['demandNoiseMW', 'windPm', 'clearPm']) {
    s.ext.series[k] = s.ext.series[k].map((x, j) => (j * V.SERIES_STEP_S > cutS ? donor.ext.series[k][j] : x));
  }
  const scrambled = runPar(5, CLASSIC, {state: s, untilTick: cut});
  assert.deepEqual(scrambled.log, plain.log);
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
  assert.ok(re.every(x => x.type === 'basePoint' || x.type === 'tie' || x.type === 'start'), 'a re-plan never stops a unit');
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

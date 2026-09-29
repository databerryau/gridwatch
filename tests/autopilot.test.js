// Stage B owner "autopilot": sim/autopilot.js acceptance (L-0, S-4, S-11, S-12, P-6, D-2, D-9).
// These run whole days, so they need every sim module; todo until then. The import
// barrier (autopilot imports only params.js and step.js) is checked for real in sim-lint.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, createAutopilot, decide, refRealSeconds, preDispatch} from '../sim/autopilot.js';
import {createState, step, observe} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {slowOnly, ticksAt, SLOW, TPS} from './lib/sim-helpers.js';

const TODO = {todo: 'stage B: autopilot'};
const SLOW_TODO = {...TODO, ...slowOnly()}; // whole-day statistics: npm run test:slow, or tools/par.js
const SEEDS = n => Array.from({length: n}, (_, i) => i + 1);

/** A state stepped (no inputs) to the given tick. */
function stepTo(seed, tick, scenario = CLASSIC) {
  const s = createState(seed, scenario);
  while (!s.over && s.tick < tick) step(s);
  return s;
}

test('S-4: par is deterministic per seed', TODO, () => {
  const a = runPar(3, CLASSIC, {untilTick: ticksAt(8)}), b = runPar(3, CLASSIC, {untilTick: ticksAt(8)});
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.origins, b.origins);
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(a.origins.length, a.log.length);
});

test('L-0: the pre-dispatch plan is deterministic, starts at the desk opening and obeys ramps and start times', TODO, () => {
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

test('S-4: information barrier: scrambling hidden state (future events, the regime, the series, the heat window) leaves par\'s log unchanged', TODO, () => {
  // Par runs on a state whose ext is replaced after the cut by another seed's; its input log
  // before the cut must be identical (nothing hidden after the cut was observable before it).
  const cutS = (10 - V.DAY_START_H) * 3600, cut = cutS * TPS;
  const plain = runPar(5, CLASSIC, {untilTick: cut});
  const donor = createState(6, CLASSIC);
  const s = createState(5, CLASSIC);
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
  b.ext.events = []; b.ext.regime = {cls: 'storm'};
  assert.deepEqual(decide(observe(a), createAutopilot()), decide(observe(b), createAutopilot()));
});

test('S-4 / D-9: pace: at most one discrete action per 3 real s of the reference playback, none in a watch; a par day <= 2 x 1.6 s', TODO, () => {
  const t0 = performance.now();
  const r = runPar(7, CLASSIC);
  const secs = (performance.now() - t0) / 1000;
  const conts = observe(r.state).contingencies;
  const acts = r.log.filter((x, i) => r.origins[i] !== 'plan');
  for (let i = 1; i < acts.length; i++) {
    const a = acts[i - 1].tick / TPS, b = acts[i].tick / TPS;
    assert.ok(refRealSeconds(a, b, conts) >= V.PAR_ACTION_GAP_REAL_S - 1e-9, 'actions at ' + a + ' and ' + b + ' s too close');
  }
  for (const x of r.log) {
    const sx = x.tick / TPS;
    assert.ok(!conts.some(c => sx >= c.startS && sx < c.watchEndS), 'input during the watch at ' + sx);
    assert.ok(x.tick >= V.PLAYER_START_TICK, 'par acted before 04:30');
  }
  // D-9: 365 par days in <= 10 min on one core needs <= 1.6 s a day; 2x margin for CI noise.
  assert.ok(secs <= 3.2, 'a par day took ' + secs.toFixed(2) + ' s');
});

test('D-2: the reference profile integrates to 245 +- 3 real s from 04:30 to 04:00; night hours are unwrapped', TODO, () => {
  assert.ok(Math.abs(refRealSeconds(V.PLAYER_START_S, V.DAY_S, []) - 245) <= 3);
  const night = refRealSeconds((21 - V.DAY_START_H) * 3600, V.DAY_S, []); // 21:00-04:00 at 2,100x
  assert.ok(Math.abs(night - 12) <= 0.1, 'night roll ' + night + ' real s');
  // A contingency adds the watch, the respond card and the RESPOND segment (D-5).
  const c = [{startS: 50000, watchEndS: 50030, backInBandS: 50060}];
  assert.ok(refRealSeconds(49000, 52000, c) > refRealSeconds(49000, 52000, []) + V.REF_WATCH_REAL_S);
});

test('K-13 / par rule 9: par restores a shed district once the permissive allows', TODO, () => {
  const s = createState(2, CLASSIC);
  while (!s.over && s.tick < ticksAt(4, 10)) step(s);
  step(s, [{type: 'directShed'}]);
  const id = s.city.districts.find(d => d.dark).id;
  const r = runPar(2, CLASSIC, {state: s, untilTick: ticksAt(6)});
  assert.equal(r.state.city.districts.find(d => d.id === id).dark, false, id + ' still dark at 06:00');
  assert.ok(r.origins.includes('rule9'));
});

test('S-11: commitAll starts every offline machine at 04:00 in one batch (no pace, before the desk opens)', TODO, () => {
  const r = runPar(3, CLASSIC, {proxy: 'commitAll', untilTick: ticksAt(4, 5)});
  const starts = r.log.filter(x => x.type === 'start');
  assert.deepEqual(starts.map(x => x.args.unit).sort(), ['gta1', 'gtb1', 'gtb2', 'gtc1', 'hydro3']);
  assert.ok(starts.every(x => x.tick === 0));
});

test('S-12: par sheds zero on >= 85% of 200 raw seeds; arms RERT on <= 25%', SLOW_TODO, () => {
  let clean = 0, rert = 0;
  for (const seed of SEEDS(200)) {
    const r = runPar(seed, CLASSIC);
    if (r.score.unservedMWh === 0 && !r.black) clean++;
    if (r.log.some(x => x.type === 'armRERT')) rert++;
  }
  assert.ok(clean >= 170, 'par clean on ' + clean + '/200');
  assert.ok(rert <= 50, 'par armed RERT on ' + rert + '/200');
});

test('S-12: par sheds zero on >= 75% of 100 forced-heatwave seeds', SLOW_TODO, () => {
  // Forced heat: seeds whose regime is heat (the 15% class), first 100 of them.
  const heatSeeds = [];
  for (let seed = 1; heatSeeds.length < 100; seed++) if (createState(seed, CLASSIC).ext.regime.cls === 'heat') heatSeeds.push(seed);
  const clean = heatSeeds.filter(seed => runPar(seed, CLASSIC).score.unservedMWh === 0).length;
  assert.ok(clean >= 75, 'par clean on ' + clean + '/100 heat seeds');
});

test('P-6: par\'s tie flow is not pinned at one limit all day on >= 50% of seeds (importing is a decision)', SLOW_TODO, () => {
  let varied = 0;
  for (const seed of SEEDS(40)) {
    const flows = new Set();
    runPar(seed, CLASSIC, {onStep: st => { if (st.tick % (300 * TPS) === 0) flows.add(Math.round(st.tie.flowMW)); }});
    const pinned = flows.size <= 1 || [...flows].every(f => f >= V.TIE_MAX_MW - 1);
    if (!pinned) varied++;
  }
  assert.ok(varied >= 20, varied + '/40');
});

test('S-11: "commit everything at 04:00" costs more than par on >= 70% of seeds', SLOW_TODO, () => {
  let dearer = 0;
  for (const seed of SEEDS(30)) {
    const par = runPar(seed, CLASSIC).summary.costDollars;
    const all = runPar(seed, CLASSIC, {proxy: 'commitAll'}).summary.costDollars;
    if (all > par) dearer++;
  }
  assert.ok(dearer >= 21, dearer + '/30');
});

test('L-0: AGC plus the pre-dispatch plan with no other input (planOnly) never ends the day black', SLOW_TODO, () => {
  for (const seed of SEEDS(SLOW ? 50 : 20)) assert.equal(runPar(seed, CLASSIC, {proxy: 'planOnly'}).black, false, 'seed ' + seed);
});

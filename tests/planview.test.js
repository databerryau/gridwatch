// app/planview.js (desk/README §7; SPEC L-1, L-4, L-5, L-6, L-9): the Live Stack's projection
// of the plan, earliest arrivals, the L-9 glow set and drop snapping. Before the sim agent's
// executor merges these run against real par days (tests/lib/vm-fixture.js) with hand-built
// plans in the §3.1 shape; stage C re-checks the projection against a stepped sim.
// Phase 2a (desk/README §19.5, §21.5; C-11): proj.rooftop / proj.past.rooftop and the projected
// spill (proj.surplusMW, proj.blue, blueRuns), by hand on a poked belly and against the cut the
// sim makes on a real mild weekend of the game's scenario (tests/lib/follow.js, no input).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import * as PV from '../app/planview.js';
import {dayVm} from './lib/vm-fixture.js';
import {tokenize, importSpecifiers} from './lib/js-tokens.js';

const DAYS = {};
async function day(key, o) {
  if (!DAYS[key]) DAYS[key] = dayVm(o);
  const {obs} = await DAYS[key];
  return structuredClone(obs); // each test edits its own copy
}
const morning = () => day('m', {seed: 7, untilH: 7.5});
const evening = () => day('e', {seed: 7, untilH: 18.5});
const tripped = () => day('t', {seed: 7, untilH: 18.5, trip: true});

const M = V.MACHINES;
const startToMin = m => m.t1S + V.AUTO_SYNC_S + m.t2S;

/** A plan in the desk/README §3.1 shape: every station held at its lever, plus `extra` edits. */
function planOf(obs, edit) {
  const plan = {madeAtS: obs.s, rev: 7,
    stations: V.STATION_IDS.map(id => ({id, man: false, doneS: -1, clampedMW: 0, keys: []})),
    tie: {doneS: -1, keys: []}, starts: [], stops: []};
  if (edit) edit(plan);
  for (const p of plan.stations) p.keys.sort((a, b) => a.atS - b.atS);
  plan.starts.sort((a, b) => a.atS - b.atS);
  obs.plan = plan;
  return obs;
}
const key = (plan, id, atS, mw) => plan.stations.find(p => p.id === id).keys.push({atS, mw});

/** Apply the inputs a drop sends the way the sim's executor contract stores them (§3.2). */
function applyInputs(obs, inputs) {
  for (const x of inputs) {
    if (x.type === 'planStart') obs.plan.starts.push({unit: x.unit, atS: x.atS});
    if (x.type === 'planKey') { const p = obs.plan.stations.find(q => q.id === x.station); p.keys = p.keys.filter(k => k.atS !== x.atS).concat([{atS: x.atS, mw: x.mw}]).sort((a, b) => a.atS - b.atS); }
  }
  obs.plan.starts.sort((a, b) => a.atS - b.atS);
}

/** L-4 accept: every planned segment satisfies |ΔMW|/Δt <= ramp (per machine; a breaker close / open is one sync block). */
function assertRampFeasible(obs, P, what) {
  const units = obs.units;
  for (let i = 0; i < units.length; i++) {
    const m = M[i], a = P.units[m.id];
    const block = V.SYNC_BLOCK_FRAC * m.ratingMW + 1e-6;
    let prev = units[i].sync ? units[i].schedMW - (units[i].mode === 'on' ? units[i].agcTrimMW : 0) : 0;
    let tPrev = P.s;
    for (let k = 0; k < P.n; k++) {
      const dt = P.times[k] - tPrev;
      const allow = m.rampMWs * dt + block + 1e-6;
      assert.ok(Math.abs(a[k] - prev) <= allow, what + ': ' + m.id + ' moves ' + (a[k] - prev).toFixed(1) + ' MW in ' + dt + ' s at column ' + k + ' (allow ' + allow.toFixed(1) + ')');
      prev = a[k]; tPrev = P.times[k];
    }
  }
}

/** L-4 accept: no machine that is off now produces before its earliest-start line. */
function assertEarliestLines(obs, P, what) {
  const lines = PV.earliestLines(obs);
  obs.units.forEach((u, i) => {
    if (u.sync) return;
    const breaker = lines[u.id] - M[i].t2S; // the breaker closes T2 before MIN
    for (let k = 0; k < P.n; k++) {
      if (P.times[k] < breaker - 1) assert.equal(P.units[u.id][k], 0, what + ': ' + u.id + ' output before its earliest-start line at column ' + k);
    }
  });
}

test('L-1: project() has 54 future and 6 past five-minute columns on the forecast grid', async () => {
  const obs = planOf(await evening());
  const P = PV.project(obs);
  assert.equal(P.n, 54);
  assert.equal(PV.N_FUTURE, 54);
  assert.equal(P.times.length, 54);
  assert.equal(P.pastTimes.length, 6);
  for (let k = 1; k < 54; k++) assert.equal(P.times[k] - P.times[k - 1], 300);
  assert.equal(P.times[0], obs.forecast.fromS + 300);
  assert.equal(P.pastTimes[5], obs.forecast.fromS);
  assert.equal(P.gap.length, 54);
  for (const L of P.layers) for (let k = 0; k < 54; k++) assert.ok(Number.isFinite(L.mw[k]) && L.mw[k] >= 0, L.id + ' at ' + k);
  // P-6 cost order (L-3): wind and solar first, then non-decreasing offers
  assert.deepEqual(P.layers.slice(0, 2).map(L => L.id), ['wind', 'solar']);
  for (let i = 3; i < P.layers.length; i++) assert.ok(P.layers[i].offer >= P.layers[i - 1].offer, P.layers.map(L => L.id + ':' + L.offer).join());
});

test('L-4: projections are ramp-feasible and no layer starts before its earliest-start line (starts, keys, stops)', async () => {
  // morning: GT·A, GT·B, GT·C and one hydro machine off; book starts by drops, plus coal and CCGT moves
  const m = await morning();
  planOf(m, plan => {
    key(plan, 'coal', m.s + 3600, 2000);
    key(plan, 'ccgt', m.s + 1800, 1300);
    key(plan, 'ccgt', m.s + 7200, 600);
  });
  for (const [st, dt, mw] of [['gta', 1800, 450], ['gtb', 2700, 800], ['gtc', 600, 150]]) {
    const r = PV.snapDrop(m, st, m.s + dt, mw);
    applyInputs(m, r.inputs || r.ghost.inputs);
  }
  // a start booked too early is refused by nobody here: the unit simply cannot be on before its line
  m.plan.starts.push({unit: 'hydro3', atS: m.s});
  const P1 = PV.project(m);
  assertRampFeasible(m, P1, 'morning');
  assertEarliestLines(m, P1, 'morning');
  // evening: every GT on; unload GT·A to zero (unload, T4, breaker open) and move hydro
  const e = await evening();
  // A planKey input of 0 MW leaves the key (lever to its floor) AND books the stops (the sim's
  // planKey; a 0-MW key alone is only the floor, sim/README.md §12 Phase 1a deviation 1).
  planOf(e, plan => {
    key(plan, 'gta', e.s + 900, 0); plan.stops.push({unit: 'gta1', atS: e.s + 900});
    key(plan, 'hydro', e.s + 1800, 300); key(plan, 'gtb', e.s + 3600, 400);
  });
  const P2 = PV.project(e);
  assertRampFeasible(e, P2, 'evening');
  const k0 = P2.times.findIndex(t => t >= e.s + 900 + M.find(x => x.id === 'gta1').t4S + 30);
  assert.equal(P2.stations.gta.mw[k0], 0, 'GT·A unloads to MIN by the key, then shuts down');
  assert.ok(P2.stations.gta.mw[P2.times.findIndex(t => t >= e.s + 600) - 1] >= 250 - 1e-6, 'GT·A still at MIN or above before its stop');
  // after a trip: the tripped machine stays off through its lockout
  const t = planOf(await tripped());
  const P3 = PV.project(t);
  assertRampFeasible(t, P3, 'trip');
  assertEarliestLines(t, P3, 'trip');
});

test('L-4 / L-6: an off unit dropped to a MW arrives by the key time (arrive-by rule, start booked as late as possible)', async () => {
  const m = planOf(await morning());
  const u = m.units.find(q => q.id === 'gta1');
  assert.equal(u.mode, 'off');
  const r = PV.snapDrop(m, 'gta', m.s + 3600, 450);
  assert.ok(!r.infeasible, JSON.stringify(r));
  assert.equal(r.inputs.length, 2);
  assert.deepEqual(r.inputs[1], {type: 'planKey', station: 'gta', atS: r.atS, mw: 450});
  const g = M.find(x => x.id === 'gta1');
  const onAt = r.inputs[0].atS + startToMin(g);
  assert.equal(onAt + Math.ceil((450 - g.minMW) / g.rampMWs), r.atS, 'on at MIN, then the climb lands on the key');
  applyInputs(m, r.inputs);
  const P = PV.project(m);
  const k = P.times.findIndex(t => t >= r.atS);
  assert.ok(Math.abs(P.stations.gta.mw[k] - 450) <= g.rampMWs * 10 + 1e-6, 'GT·A at ' + P.stations.gta.mw[k] + ' by ' + r.atS);
  assert.equal(P.stations.gta.mw[P.times.findIndex(t => t >= onAt - g.t2S) - 1], 0, 'dark before its breaker closes');
});

test('L-4: earliestArrival of an off unit is at least now + its start time; of an on station, the lead at its ramp', async () => {
  const m = planOf(await morning());
  for (const st of ['gta', 'gtb', 'gtc']) {
    const a = PV.earliestArrival(m, st, 1000);
    const first = M.find(x => x.station === st);
    assert.ok(a.atS >= m.s + startToMin(first), st + ' arrives ' + (a.atS - m.s) + ' s from now');
    assert.equal(a.needsStart, first.id);
  }
  const coal = m.stations.find(s => s.id === 'coal');
  const a = PV.earliestArrival(m, 'coal', coal.basePointMW + 90);
  const R = m.units.filter(u => u.station === 'coal' && u.mode === 'on').reduce((x, u) => x + u.rampMWMin / 60, 0);
  if (coal.basePointMW + 90 <= coal.maxMW) assert.equal(a.atS, m.s + Math.ceil(90 / R));
  // a tripped machine: lockout first, then its start
  const t = planOf(await tripped());
  const tu = t.units.find(u => u.mode === 'tripped');
  const i = t.units.indexOf(tu);
  assert.equal(PV.earliestLines(t)[tu.id], t.s + tu.timerS + startToMin(M[i]));
});

test('L-9: glowSet is exactly the controls whose earliest arrival is at or before the gap start', async () => {
  for (const obs of [planOf(await morning()), planOf(await evening()), planOf(await tripped())]) {
    const P = PV.project(obs);
    const gaps = PV.redRuns(P).concat([{atS: obs.s + 300}, {atS: obs.s + 900}, {atS: obs.s + 3 * 3600}]);
    for (const gap of gaps) {
      const got = PV.glowSet(obs, gap);
      // independent check for the stations through earliestArrival
      for (const st of V.STATION_IDS) {
        const lever = obs.stations.find(s => s.id === st).basePointMW;
        const a = PV.earliestArrival(obs, st, lever + PV.SNAP_MW);
        const id = a.needsStart ? 'guard-start-' + a.needsStart : PV.STATION_CONTROL[st];
        const can = Number.isFinite(a.atS) && a.mw > lever + 1e-6 && a.atS <= gap.atS;
        assert.equal(got.includes(id), can, st + ' for a gap at +' + (gap.atS - obs.s) + ' s (arrives +' + (a.atS - obs.s) + ')');
      }
      const exp = PV.glowCandidates(obs).filter(c => c.atS <= gap.atS).map(c => c.id).sort();
      assert.deepEqual(got, exp);
    }
  }
  // the gap a trip opens starts one column ahead, so the fast units light (K-16)
  const t = planOf(await tripped());
  const g = PV.firstGap(PV.project(t));
  assert.ok(g, 'a trip opens a red gap');
  assert.ok(PV.glowSet(t, g).length > 0, 'something can arrive for the respond card');
  assert.ok(!PV.glowSet(t, g).includes('key-rert'), 'the 20-min diesel cannot arrive in 5 min');
});

test('L-4: snapDrop lands on the 15-min / 50-MW grid and returns the earliest-arrival ghost when infeasible', async () => {
  const obs = planOf(await morning());
  let infeasible = 0, feasible = 0;
  for (const st of V.STATION_IDS) {
    for (const dt of [-600, 0, 130, 777, 1900, 5000, 11111]) {
      for (const mw of [0, 37, 260, 777, 1333, 9999]) {
        const r = PV.snapDrop(obs, st, obs.s + dt, mw);
        assert.equal(r.atS % PV.SNAP_S, 0, st + ' atS');
        assert.equal(r.mw % PV.SNAP_MW, 0, st + ' mw');
        assert.ok(r.atS >= obs.s);
        if (r.infeasible) {
          infeasible++;
          if (!r.ghost) continue;
          assert.ok(r.ghost.atS >= r.earliestS && r.ghost.atS % PV.SNAP_S === 0 && r.ghost.atS - r.earliestS < PV.SNAP_S, JSON.stringify(r));
          assert.ok(r.atS < r.earliestS);
          const last = r.ghost.inputs[r.ghost.inputs.length - 1];
          assert.deepEqual(last, {type: 'planKey', station: st, atS: r.ghost.atS, mw: r.mw});
        } else {
          feasible++;
          assert.ok(r.atS >= r.earliestS);
          assert.deepEqual(r.inputs[r.inputs.length - 1], {type: 'planKey', station: st, atS: r.atS, mw: r.mw});
          for (const x of r.inputs.slice(0, -1)) { assert.equal(x.type, 'planStart'); assert.ok(x.atS >= obs.s); }
        }
      }
    }
  }
  assert.ok(infeasible > 10 && feasible > 10, infeasible + ' / ' + feasible);
  // an off unit's ghost: START booked at sync time minus start time, never before the line
  const r = PV.snapStart(obs, 'gtb1', obs.s + 60);
  assert.ok(r.infeasible && r.ghost.onAtS >= r.earliestS && r.ghost.onAtS % PV.SNAP_S === 0);
  const ok = PV.snapStart(obs, 'gtb1', obs.s + 7200);
  assert.deepEqual(ok.inputs, [{type: 'planStart', unit: 'gtb1', atS: ok.onAtS - startToMin(M.find(x => x.id === 'gtb1'))}]);
});

test('L-5: gaps are red from 50 MW below P50 and amber from 50 MW below P90; past columns read the shell history', async () => {
  const obs = planOf(await tripped());
  const P = PV.project(obs, {hist: {demand: [{s: obs.s - 1000, mw: 7000}, {s: obs.s - 10, mw: 7600}], stations: {coal: [{s: obs.s - 200, mw: 2000}]}}});
  assert.equal(PV.GAP_MIN_MW, 50);
  for (let k = 0; k < P.n; k++) {
    const want = P.supply[k] < P.p50[k] - PV.GAP_MIN_MW ? 'red' : P.supply[k] < P.p90[k] - PV.GAP_MIN_MW ? 'amber' : '';
    assert.equal(P.gap[k], want);
  }
  assert.equal(P.gap[0], 'red', 'a trip at the peak opens a red gap at once');
  // both colours from GAP_MIN_MW: 10 MW under P90 is no gap, 60 under is amber; 10 MW under P50 is not red, 60 under is
  const fc = structuredClone(obs.forecast), under = [[-200, 10], [-200, 60], [10, 10], [60, 60]];
  for (let k = 0; k < P.n; k++) [fc.demandP50[k], fc.demandP90[k]] = under[k % 4].map(x => P.supply[k] + x);
  const Q = PV.project(Object.assign({}, obs, {forecast: fc}), {hist: {demand: [], stations: {}}});
  assert.deepEqual([...Q.supply], [...P.supply], 'the supply does not move with the forecast demand');
  assert.deepEqual(Q.gap, Array.from({length: P.n}, (_, k) => ['', 'amber', '', 'red'][k % 4]));
  assert.equal(P.past.demand[5], 7600);
  assert.equal(P.past.layers.coal[5], 2000);
  assert.ok(Number.isNaN(P.past.demand[0]));
});

test('stage C, L-6: the projection agrees with the sim\'s plan executor, 4.5 h ahead, to within the AGC band (no input, no trip)', async () => {
  // The game's system operator loads the 04:30 pre-dispatch; at 06:00 the stack projects; the
  // sim then runs 4.5 h with no input (seed 7 has no contingency before 11:47). AGC trims and
  // governors are not projected (desk/README §7), so each station may differ by its AGC band.
  const {createState, step, observe} = await import('../sim/step.js');
  const system = await import('../app/system.js');
  const {CLASSIC} = await import('../content/scenarios.js');
  const TPS = V.TICKS_PER_S, state = createState(7, CLASSIC), sys = system.createSystem();
  while (state.tick < 2 * 3600 * TPS) step(state, system.systemInputs(sys, state));
  const P = PV.project(observe(state));
  const band = {};
  for (const m of M) band[m.station] = (band[m.station] || 0) + m.agcBandMW;
  let worst = 0;
  for (let k = 0; k < P.n; k++) {
    while (state.tick < P.times[k] * TPS) step(state, []);
    const o = observe(state);
    assert.equal(o.contingencies.length, 0);
    for (const st of o.stations) {
      const d = Math.abs(P.stations[st.id].mw[k] - st.outMW);
      worst = Math.max(worst, d - band[st.id]);
      assert.ok(d <= band[st.id] + 1, st.id + ' at ' + o.clock.text + ': projected ' + P.stations[st.id].mw[k].toFixed(0) + ' MW, real ' +
        st.outMW.toFixed(0) + ' MW, AGC band ' + band[st.id].toFixed(0) + ' MW');
    }
  }
});

// ------------------------------------------------------------------ Phase 2a (desk/README §19.5, §21.5, C-11)

/**
 * A flat belly poked into a real evening: every unit at its lever, no keys, the forecast given.
 * P50 is 3,000 - 20k MW (the spill begins about column 13: the floor at 0 is in the fixture), or
 * o.p50(k) (a deeper belly, spilling from column 0, so no term can hide behind that floor).
 */
function bellyOf(obs, o = {}) {
  planOf(obs);
  const n = obs.forecast.demandP50.length, fc = obs.forecast;
  for (let k = 0; k < n; k++) {
    fc.demandP50[k] = o.p50 ? o.p50(k) : 3000 - 20 * k; fc.demandP10[k] = fc.demandP50[k] - 100; fc.demandP90[k] = fc.demandP50[k] + 100;
    fc.windMW[k] = 500; fc.solarMW[k] = 400; fc.exportLimitMW[k] = k < 20 ? 300 : 250;
  }
  obs.wind.limitPct = 80; obs.solar.limitPct = 100;
  Object.assign(obs.battery, {mode: 'idle', orderMW: 0, schedMW: 0, outMW: 0, agcTrimMW: 0});
  Object.assign(obs.rert, {armed: false, leadS: 0, outMW: 0, standingDown: false});
  Object.assign(obs.dr, {activeS: 0, mw: 0});
  Object.assign(obs.tie, {tripped: false, lockoutS: 0}, o.tie);
  if (o.edit) o.edit(obs);
  return obs;
}
const FLOOR_ALL = M.reduce((a, m) => a + m.minMW, 0); // every machine 'on' at 18:30 on seed 7: the floor blocks are every MIN
const room = k => (k < 20 ? 300 : 250);
/** C-11 by hand for the flat belly: floor + wind after its 80% LIMIT + solar - (P50 + export room). */
const bellyMW = (k, floor = FLOOR_ALL) => floor + 400 + 400 - (3000 - 20 * k) - room(k);
/** The deeper bellies (o.p50): the evening's spills 760 MW at column 0, the morning's (1,310 MW of floor) 310 MW. */
const DEEP = k => 2000 - 20 * k, DEEP_AM = k => 1500 - 10 * k;
const deepMW = (k, floor = FLOOR_ALL, p50 = DEEP) => floor + 400 + 400 - p50(k) - room(k);

test('C-11: proj.surplusMW is must-run + wind and solar after the LIMIT - (P50 + export room + ordered charge), floored at 0; blue is its own array', async () => {
  const e = bellyOf(await evening());
  assert.ok(e.units.every(u => u.mode === 'on'), 'the fixture: every machine on');
  const P = PV.project(e);
  for (let k = 0; k < P.n; k++) {
    assert.ok(Math.abs(P.surplusMW[k] - Math.max(0, bellyMW(k))) < 1e-6, 'column ' + k + ': ' + P.surplusMW[k] + ' vs ' + bellyMW(k));
    assert.equal(P.blue[k], P.surplusMW[k] > V.SURPLUS_MIN_MW ? 1 : 0);
    assert.ok(P.gap[k] === '' || P.gap[k] === 'red' || P.gap[k] === 'amber', 'blue is never a kind in proj.gap');
  }
  assert.equal(P.surplusMW[0], 0, 'floored at 0 where demand takes it all');
  const first = P.blue.indexOf(1);
  assert.ok(bellyMW(first) > V.SURPLUS_MIN_MW && bellyMW(first - 1) <= V.SURPLUS_MIN_MW && bellyMW(first - 1) > 0, 'a spill at or under SURPLUS_MIN_MW is not blue');
  assert.deepEqual(PV.blueRuns(P), [{atS: P.times[first], endS: P.times[P.n - 1], k0: first, k1: P.n - 1, mw: bellyMW(P.n - 1)}]);
  // the tie tripped: no export room until it is back (its public lockout), then the cap again
  const t = bellyOf(await evening(), {tie: {tripped: true, lockoutS: 3000}});
  const Pt = PV.project(t);
  for (let k = 0; k < Pt.n; k++) {
    if (Pt.times[k] < t.s + 3000 - 300) assert.ok(Math.abs(Pt.surplusMW[k] - Math.max(0, bellyMW(k) + room(k))) < 1e-6, 'tie out at column ' + k);
    if (Pt.times[k] > t.s + 3000 + 300) assert.ok(Math.abs(Pt.surplusMW[k] - Math.max(0, bellyMW(k))) < 1e-6, 'tie back at column ' + k);
  }
  // a CHARGE order is room for as long as the battery has room; AGC's trim on an idle battery is not.
  // In the deep belly (spilling from column 0) 200 MW into 425 MWh of room at 85% lasts 2.5 h = 30 columns:
  // the spill is 200 MW less in every one of them and whole again once the battery is full.
  const full = bellyOf(await evening(), {p50: DEEP});
  const Pf = PV.project(full);
  for (let k = 0; k < Pf.n; k++) assert.ok(deepMW(k) > 700 && Math.abs(Pf.surplusMW[k] - deepMW(k)) < 1e-6, 'the deep belly at column ' + k + ': ' + Pf.surplusMW[k]);
  const c = bellyOf(await evening(), {p50: DEEP, edit: o => Object.assign(o.battery, {mode: 'charge', orderMW: 200, socMWh: o.battery.capMWh - 200 * V.BATT_CHARGE_EFF * 2.5})});
  const Pc = PV.project(c);
  const charged = Array.from(Pc.charging).filter(v => Math.abs(v - 200) < 1e-6).length;
  assert.ok(charged >= 28 && charged <= 30 && Pc.charging[3] === 200 && Pc.charging[Pc.n - 1] === 0, 'charging 200 MW for 2.5 h, then full: ' + charged + ' columns');
  for (let k = 0; k < Pc.n; k++) assert.ok(Math.abs(Pc.surplusMW[k] - (deepMW(k) - Pc.charging[k])) < 1e-6, 'charge at column ' + k + ': ' + Pc.surplusMW[k]);
  assert.ok(Math.abs(Pc.surplusMW[3] - (deepMW(3) - 200)) < 1e-6 && Pc.surplusMW[3] > 500 && Pc.blue[3] === 1, 'the order takes 200 MW of the spill: ' + Pc.surplusMW[3]);
  assert.ok(Math.abs(Pc.surplusMW[Pc.n - 1] - deepMW(Pc.n - 1)) < 1e-6, 'the whole spill again once the battery is full');
  // a battery ordered to DISCHARGE and demand response called both add to the spill, MW for MW, for as
  // long as the projection has them running (the wave-2 merge: the sim's cut counts both)
  const dis = bellyOf(await evening(), {p50: DEEP, edit: o => Object.assign(o.battery, {mode: 'discharge', orderMW: 200, schedMW: 200, outMW: 200, socMWh: o.battery.capMWh})});
  const Pd = PV.project(dis), batt = Pd.layers.find(L => L.id === 'battery').mw;
  assert.ok(Math.abs(batt[0] - 200) < 1e-6 && Math.abs(batt[10] - 200) < 1e-6, 'the fixture: discharging 200 MW');
  for (let k = 0; k < Pd.n; k++) assert.ok(Math.abs(Pd.surplusMW[k] - (deepMW(k) + batt[k])) < 1e-6, 'discharge at column ' + k + ': ' + Pd.surplusMW[k]);
  const dr = bellyOf(await evening(), {p50: DEEP, edit: o => Object.assign(o.dr, {activeS: 1800, mw: V.DR_MW})});
  const Pdr = PV.project(dr), drMW = Pdr.layers.find(L => L.id === 'dr').mw;
  assert.ok(drMW[0] > 300 && drMW[Pdr.n - 1] === 0, 'the fixture: DR running for half an hour, then released');
  for (let k = 0; k < Pdr.n; k++) assert.ok(Math.abs(Pdr.surplusMW[k] - (deepMW(k) + drMW[k])) < 1e-6, 'DR at column ' + k + ': ' + Pdr.surplusMW[k]);
  // a charge bigger than the spill leaves none (floored at 0, never negative) and no blue: the flat belly
  // spills 20 MW at column 13 and 200 MW by column 20; an empty battery charging 200 MW takes all of it until then
  const big = bellyOf(await evening(), {edit: o => Object.assign(o.battery, {mode: 'charge', orderMW: 200, socMWh: 0})});
  const Pb = PV.project(big);
  for (let k = 0; k < Pb.n; k++) {
    assert.equal(Pb.charging[k], 200, 'charging at column ' + k);
    assert.ok(Math.abs(Pb.surplusMW[k] - Math.max(0, bellyMW(k) - 200)) < 1e-6 && Pb.surplusMW[k] >= 0, 'a charge over the spill at column ' + k + ': ' + Pb.surplusMW[k]);
  }
  assert.ok(bellyMW(16) > V.SURPLUS_MIN_MW && Pb.surplusMW[16] === 0 && Pb.blue[16] === 0 && P.blue[16] === 1, 'blue without the charge, not with it');
  assert.deepEqual([P.blue.indexOf(1), Pb.blue.indexOf(1)], [15, 23], 'the blue begins 200 MW later (60 MW at column 15; 270 MW at column 23, the export limit 50 MW lower from column 20)');
  // a charge that ends before the spill begins (the flat belly: 120 MWh of room is full by column 8) changes nothing
  const early = bellyOf(await evening(), {edit: o => Object.assign(o.battery, {mode: 'charge', orderMW: 200, socMWh: o.battery.capMWh - 120})});
  const Pe = PV.project(early);
  assert.ok(Math.abs(Pe.charging[3] - 200) < 1e-6 && Pe.charging[Pe.n - 1] === 0, 'charging 200 MW, then full: ' + Pe.charging[3] + ', ' + Pe.charging[Pe.n - 1]);
  for (let k = 0; k < Pe.n; k++) assert.ok(Math.abs(Pe.surplusMW[k] - Math.max(0, bellyMW(k) - Pe.charging[k])) < 1e-6, 'an early charge at column ' + k);
  assert.ok(Pe.blue[20] === 1 && Pe.surplusMW[3] === 0);
  // blue is ABOVE SURPLUS_MIN_MW: a column spilling exactly that much is not blue, before a run or after it
  const edge = bellyOf(await evening(), {p50: k => FLOOR_ALL + 800 - room(k) - (k === 4 ? V.SURPLUS_MIN_MW - 0.5 : k === 5 || k === 7 ? V.SURPLUS_MIN_MW : k === 6 ? V.SURPLUS_MIN_MW + 0.5 : 0)});
  const Pg = PV.project(edge);
  assert.deepEqual([Pg.surplusMW[4], Pg.surplusMW[5], Pg.surplusMW[6], Pg.surplusMW[7], Pg.surplusMW[8]], [V.SURPLUS_MIN_MW - 0.5, V.SURPLUS_MIN_MW, V.SURPLUS_MIN_MW + 0.5, V.SURPLUS_MIN_MW, 0]);
  assert.deepEqual([Pg.blue[4], Pg.blue[5], Pg.blue[6], Pg.blue[7], Pg.blue[8]], [0, 0, 1, 0, 0]);
  assert.deepEqual(PV.blueRuns(Pg), [{atS: Pg.times[6], endS: Pg.times[6], k0: 6, k1: 6, mw: V.SURPLUS_MIN_MW + 0.5}]);
  // a run that rises and falls: its mw is the largest spill in it, not the last
  const hump = bellyOf(await evening(), {p50: k => FLOOR_ALL + 800 - room(k) - (k >= 10 && k <= 14 ? [100, 300, 420, 180, 70][k - 10] : 0)});
  assert.deepEqual(PV.blueRuns(PV.project(hump)), [{atS: hump.forecast.fromS + 11 * 300, endS: hump.forecast.fromS + 15 * 300, k0: 10, k1: 14, mw: 420}]);
  const a = bellyOf(await evening(), {edit: o => Object.assign(o.battery, {schedMW: -150, outMW: -150, agcTrimMW: -150})});
  assert.deepEqual(Array.from(PV.project(a).surplusMW.slice(6)), Array.from(P.surplusMW.slice(6)), 'the trim is not counted as room');
  // reserve diesel on line is must-run (§25)
  const r = bellyOf(await evening(), {edit: o => Object.assign(o.rert, {armed: true, leadS: 0, outMW: V.RERT_MW})});
  const Pr = PV.project(r);
  for (let k = 0; k < Pr.n; k++) assert.ok(Math.abs(Pr.surplusMW[k] - Math.max(0, bellyMW(k) + V.RERT_MW)) < 1e-6, 'RERT at column ' + k);
});

test('C-11: a machine counts at MIN while on and at its projected MW while loading, unloading or shutting down', async () => {
  // a booked STOP (between two column ends): GT·A unloads to MIN, runs down its T4 slope and
  // opens; its floor block follows it
  const STOP_IN_S = 1000;
  const e = bellyOf(await evening(), {edit: o => { o.plan.stops.push({unit: 'gta1', atS: o.s + STOP_IN_S}); }});
  const g = M.find(x => x.id === 'gta1');
  const P = PV.project(e);
  let down = 0;
  for (let k = 0; k < P.n; k++) {
    const mine = P.times[k] < e.s + STOP_IN_S ? g.minMW : P.units.gta1[k];
    if (P.times[k] > e.s + STOP_IN_S && P.times[k] < e.s + STOP_IN_S + g.t4S + 600) assert.ok(mine <= P.units.gta1[Math.max(0, k - 1)] + 1e-6, 'falling');
    if (mine === 0) down++;
    assert.ok(Math.abs(P.surplusMW[k] - Math.max(0, bellyMW(k, FLOOR_ALL - g.minMW + mine))) < 1e-6, 'stopping at column ' + k + ': ' + P.surplusMW[k]);
  }
  assert.ok(down > 10, 'off the grid: its block is gone');
  // a booked START in the morning: nothing until the breaker closes, the T2 climb, then MIN however high the lever goes
  const m = bellyOf(await morning(), {edit: o => { o.plan.starts.push({unit: 'gtb1', atS: o.s}); key(o.plan, 'gtb', o.s + 9000, 350); }});
  const b = M.find(x => x.id === 'gtb1');
  const on = m.units.filter(u => u.mode === 'on');
  assert.equal(m.units.filter(u => u.mode !== 'on' && u.mode !== 'off').length, 0, 'the fixture: on or off');
  const floor0 = on.reduce((s, u) => s + u.minMW, 0);
  const Pm = PV.project(m);
  const seen = new Set();
  for (let k = 0; k < Pm.n; k++) {
    const out = Pm.units.gtb1[k], mine = Math.min(out, b.minMW);
    seen.add(out === 0 ? 'off' : out < b.minMW - 1e-6 ? 'loading' : out > b.minMW + 1 ? 'above' : 'min');
    assert.ok(Math.abs(Pm.surplusMW[k] - Math.max(0, bellyMW(k, floor0 + mine))) < 1e-6, 'starting at column ' + k + ': ' + Pm.surplusMW[k]);
  }
  assert.deepEqual([...seen].sort(), ['above', 'loading', 'min', 'off']);
  // The two fixtures above spill nothing in their first columns (the floor at 0 hides the block while
  // the machine is changing), so the same in the deep bellies, where every column spills.
  // A coal machine stopped: 25 columns of unloading at 3 MW a minute, far above its MIN, then 14 down
  // its T4 slope, below MIN; its block is its projected MW through both, and nothing once it is off.
  const coal = M.find(x => x.id === 'coal1');
  const ec = bellyOf(await evening(), {p50: DEEP, edit: o => { o.plan.stops.push({unit: 'coal1', atS: o.s + STOP_IN_S}); }});
  const Pc = PV.project(ec);
  const kinds = {on: 0, unloading: 0, shutdown: 0, off: 0};
  for (let k = 0; k < Pc.n; k++) {
    const out = Pc.units.coal1[k], before = Pc.times[k] < ec.s + STOP_IN_S;
    const mine = before ? coal.minMW : out;
    kinds[before ? 'on' : out > coal.minMW + 1 ? 'unloading' : out > 0 ? 'shutdown' : 'off']++;
    if (!before && out > coal.minMW + 1 && Pc.times[k - 1] > ec.s + STOP_IN_S) assert.ok(Math.abs(Pc.units.coal1[k - 1] - out - coal.rampMWs * 300) < 1e-6, 'unloading at its ramp (15 MW a column), column ' + k + ': ' + out);
    const want = deepMW(k, FLOOR_ALL - coal.minMW + mine);
    assert.ok(want > 500 && Math.abs(Pc.surplusMW[k] - want) < 1e-6, 'coal stopping at column ' + k + ': ' + Pc.surplusMW[k] + ' vs ' + want);
  }
  assert.ok(kinds.on >= 3 && kinds.unloading >= 20 && kinds.shutdown >= 10 && kinds.off >= 5, JSON.stringify(kinds));
  // GT·B 1 started in the deep morning belly, its breaker closing between two column ends: nothing while
  // it is starting or ready to synchronise (off the bars, though no longer 'off'), its T2 climb, then MIN
  const START_IN_S = 240;
  const mc = bellyOf(await morning(), {p50: DEEP_AM, edit: o => { o.plan.starts.push({unit: 'gtb1', atS: o.s + START_IN_S}); key(o.plan, 'gtb', o.s + 9000, 350); }});
  const Pq = PV.project(mc);
  const breakerS = mc.s + START_IN_S + b.t1S + V.AUTO_SYNC_S, onS = breakerS + b.t2S;
  const seenQ = {waiting: 0, loading: 0, min: 0, above: 0};
  for (let k = 0; k < Pq.n; k++) {
    const out = Pq.units.gtb1[k], t = Pq.times[k];
    const mine = t < breakerS ? 0 : t < onS ? out : b.minMW;
    if (t < breakerS) assert.equal(out, 0, 'no output before the breaker closes, column ' + k);
    if (t >= breakerS + 10 && t < onS - 10) assert.ok(out > 0 && out < b.minMW, 'the T2 climb at column ' + k + ': ' + out);
    seenQ[t < breakerS ? 'waiting' : t < onS ? 'loading' : out > b.minMW + 1 ? 'above' : 'min']++;
    const want = deepMW(k, floor0 + mine, DEEP_AM);
    assert.ok(want > 250 && Math.abs(Pq.surplusMW[k] - want) < 1e-6, 'GT·B starting at column ' + k + ': ' + Pq.surplusMW[k] + ' vs ' + want);
  }
  assert.ok(seenQ.waiting >= 2 && seenQ.loading >= 1 && seenQ.min >= 1 && seenQ.above >= 1, JSON.stringify(seenQ));
});

test('C-11: nothing is blue on the classic day (no rooftop, no belly), where the old floor-above-P10 rule lit columns for imports', async () => {
  for (const obs of [planOf(await morning()), planOf(await evening()), planOf(await tripped())]) {
    const P = PV.project(obs);
    assert.ok(P.surplusMW.every(v => v === 0) && P.blue.every(v => v === 0));
    assert.deepEqual(PV.blueRuns(P), []);
    assert.ok(P.rooftop.every(v => v === 0), 'no rooftop on CLASSIC');
    // a view of the day before Phase 2a (no rooftop column, no export limit in the forecast) still projects
    const old = structuredClone(obs);
    delete old.forecast.rooftopMW; delete old.forecast.exportLimitMW; delete old.rooftop;
    const Q = PV.project(old);
    assert.ok(Q.rooftop.every(v => v === 0) && Q.surplusMW.every(v => Number.isFinite(v)));
  }
});

let MILD = null;
/**
 * A real mild weekend at 11:00 with nobody at the desk (desk-weekend, seed 8): the belly is
 * opening. One run for the file; each caller gets its own copy of the state, the system
 * operator and the view.
 */
async function mildWeekend() {
  if (!MILD) {
    const {followDay} = await import('./lib/follow.js');
    const {observe} = await import('../sim/step.js');
    const {DESK_WEEKEND} = await import('../content/scenarios.js');
    const {st, sys} = followDay(8, DESK_WEEKEND, {follow: false, untilH: 11});
    MILD = {st: JSON.stringify(st), sys: JSON.stringify(sys), obs: observe(st)};
  }
  // (the state and the system operator as JSON copies: both are plain JSON, and the C-11 rows step
  // the state on, which a structuredClone'd state does about twice as slowly)
  return {st: JSON.parse(MILD.st), sys: JSON.parse(MILD.sys), obs: structuredClone(MILD.obs)};
}

test('L-2 / §19.5: proj.rooftop is the rooftop bite of the forecast and proj.past.rooftop that of the history, in both history forms', async () => {
  const {obs} = await mildWeekend();
  const from = obs.forecast.fromS;
  const P = PV.project(obs, {hist: {colFromS: from - 6 * 300, colS: 300, demand: [1, 2, 3, 4, 5, 6].map(v => v * 1000), rooftop: [10, 20, NaN, 40, 50, 60], stations: {}}});
  assert.deepEqual(Array.from(P.rooftop), Array.from(obs.forecast.rooftopMW));
  assert.ok(P.rooftop[0] > 2000, 'a mild 11:00: ' + P.rooftop[0]);
  // the forecast's own identity: underlying = operational + rooftop + the smelter's missing load
  for (let k = 0; k < P.n; k++) assert.ok(obs.forecast.underlyingP50[k] >= P.p50[k] + P.rooftop[k] - 1e-6);
  assert.deepEqual(Array.from(P.past.rooftop), [10, 20, NaN, 40, 50, 60]);
  assert.deepEqual(Array.from(P.past.demand), [1000, 2000, 3000, 4000, 5000, 6000]);
  const R = PV.project(obs, {hist: {demand: [{s: obs.s - 10, mw: 2300}], rooftop: [{s: obs.s - 700, mw: 2700}, {s: obs.s - 10, mw: 2800}], stations: {}}});
  assert.equal(R.past.rooftop[5], 2800);
  assert.ok(Number.isNaN(R.past.rooftop[0]));
  assert.equal(PV.project(obs).past.rooftop.length, PV.N_PAST, 'no history: NaN columns, the same length');
});

test('C-11 on a real mild weekend (no input, 11:00): the projected spill is the cut the sim then makes', async () => {
  // The belly opens about 11:00 on a mild weekend with nobody at the desk. Project, then run the
  // same day on for an hour with the system operator alone and take the automatic cut
  // (obs.wind.autoMW + obs.solar.autoMW) over the minute around each column's end.
  const {step, observe} = await import('../sim/step.js');
  const SYS = await import('../app/system.js');
  const TPS = V.TICKS_PER_S, NK = 12;
  const {st, sys, obs} = await mildWeekend();
  assert.deepEqual(obs.day, {temp: 'MILD', weekend: true});
  const P = PV.project(obs);
  const cut = new Float64Array(NK), wind = new Float64Array(NK), solar = new Float64Array(NK), lit = new Float64Array(NK), cnt = new Float64Array(NK);
  while (st.tick <= (P.times[NK - 1] + 30) * TPS) {
    step(st, SYS.systemInputs(sys, st));
    if (st.tick % TPS) continue;
    const s = st.tick / TPS, k = Math.round((s - P.fromS) / PV.COL_S) - 1;
    if (k < 0 || k >= NK || Math.abs(s - P.times[k]) > 30) continue;
    const o = observe(st);
    cut[k] += o.wind.autoMW + o.solar.autoMW; wind[k] += o.wind.availMW; solar[k] += o.solar.availMW; lit[k] += o.demand.litMW; cnt[k]++;
  }
  assert.equal(st.conts.length, 0, 'the fixture: no contingency inside the hour');
  for (let k = 0; k < NK; k++) { cut[k] /= cnt[k]; wind[k] /= cnt[k]; solar[k] /= cnt[k]; lit[k] /= cnt[k]; }
  assert.ok(Math.max(...cut) > 300 && Math.max(...P.surplusMW.subarray(0, NK)) > 300, 'the sim spills in this hour and the stack says so');
  // (1) The arithmetic: give the projection the wind, the sun and the demand that then happened
  // (in place of its forecast of them) and it is the sim's cut, column for column, for the hour.
  const told = structuredClone(obs);
  for (let k = 0; k < NK; k++) { told.forecast.windMW[k] = wind[k]; told.forecast.solarMW[k] = solar[k]; told.forecast.demandP50[k] = lit[k]; }
  const T = PV.project(told);
  for (let k = 0; k < NK; k++) assert.ok(Math.abs(T.surplusMW[k] - cut[k]) <= 2, '+' + (k + 1) * 5 + ' min: projected ' + T.surplusMW[k].toFixed(1) + ' MW, the sim cut ' + cut[k].toFixed(1) + ' MW');
  // (2) With its own forecast the difference is the forecast's error in wind, sun and demand:
  // within 200 MW a quarter of an hour ahead (measured on 6 mild weekend seeds at 10:30, 11:00,
  // 12:00 and 13:00, 72 columns: median 49 MW, 90% within 141 MW, worst 244 MW), and on this
  // seed the hour's spilled energy within a quarter.
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(P.surplusMW[k] - cut[k]) <= 200, '+' + (k + 1) * 5 + ' min: forecast ' + P.surplusMW[k].toFixed(0) + ' MW, the sim cut ' + cut[k].toFixed(0) + ' MW');
  assert.ok(P.blue[0] === 1 && cut[0] > V.SURPLUS_MIN_MW, 'blue now, and spilling five minutes later');
  const mwh = a => { let x = 0; for (let k = 0; k < NK; k++) x += a[k] / 12; return x; };
  assert.ok(Math.abs(mwh(P.surplusMW) - mwh(cut)) <= 0.25 * mwh(cut), 'the hour: forecast ' + mwh(P.surplusMW).toFixed(0) + ' MWh, spilled ' + mwh(cut).toFixed(0) + ' MWh');
});

// The C-6 spill arithmetic is written twice, with no shared function: the sim's cut (sim/grid.js
// surplusMW) and the projection's blue (app/planview.js proj.surplusMW, which also feeds STOP's
// free replacement and the battery line). The row above compares them with no input, where every
// term the player sets is zero; this one turns those terms on (the wave-2 merge, N-1: DR and a
// DISCHARGE order were missing from the projection, 350 and 200 MW low, and no test saw it).
// THE RULE: any new C-6 term (2b's hot-water soak, air-con cycling, ...) goes into sim/grid.js
// surplusMW, into app/planview.js proj.surplusMW, and into this row.
test('C-11 with the player\'s terms on (DR and a DISCHARGE order; a CHARGE order): the projected spill is still the cut the sim then makes', async () => {
  const {step, observe, applyInput} = await import('../sim/step.js');
  const SYS = await import('../app/system.js');
  const TPS = V.TICKS_PER_S, NK = 6, SETTLE_S = 60;
  const runs = [['DR and DISCHARGE 150', [{type: 'callDR'}, {type: 'battery', mode: 'discharge', mw: 150}]],
    ['CHARGE 150', [{type: 'battery', mode: 'charge', mw: 150}]]];
  for (const [what, inputs] of runs) {
    // The mild weekend at 11:00: the orders, then a minute (the system's next look re-dispatches
    // around them: commitSig), then the projection and the half hour the sim then plays. Measured:
    // within 0.4 MW in every column, the orders moving the projection by 500 and 150 MW.
    const {st, sys} = await mildWeekend();
    for (const x of inputs) assert.ok(applyInput(st, x, []).ok, what + ': ' + x.type + ' accepted');
    const settled = st.tick + SETTLE_S * TPS;
    while (st.tick < settled) step(st, SYS.systemInputs(sys, st));
    const obs = observe(st), P = PV.project(obs);
    const cut = new Float64Array(NK), wind = new Float64Array(NK), solar = new Float64Array(NK), lit = new Float64Array(NK), cnt = new Float64Array(NK);
    while (st.tick <= (P.times[NK - 1] + 30) * TPS) {
      step(st, SYS.systemInputs(sys, st));
      if (st.tick % TPS) continue;
      const s = st.tick / TPS, k = Math.round((s - P.fromS) / PV.COL_S) - 1;
      if (k < 0 || k >= NK || Math.abs(s - P.times[k]) > 30) continue;
      const o = observe(st);
      cut[k] += o.wind.autoMW + o.solar.autoMW; wind[k] += o.wind.availMW; solar[k] += o.solar.availMW; lit[k] += o.demand.litMW; cnt[k]++;
    }
    assert.equal(st.conts.length, 0, what + ': the fixture: no contingency inside the half hour');
    for (let k = 0; k < NK; k++) { cut[k] /= cnt[k]; wind[k] /= cnt[k]; solar[k] /= cnt[k]; lit[k] /= cnt[k]; }
    // the projection given the wind, the sun and the lit demand that then happened (as in the row above)
    const told = structuredClone(obs);
    for (let k = 0; k < NK; k++) { told.forecast.windMW[k] = wind[k]; told.forecast.solarMW[k] = solar[k]; told.forecast.demandP50[k] = lit[k]; }
    const T = PV.project(told);
    for (let k = 0; k < NK; k++) assert.ok(Math.abs(T.surplusMW[k] - cut[k]) <= 2, what + ', +' + (k + 1) * 5 + ' min: projected ' + T.surplusMW[k].toFixed(1) + ' MW, the sim cut ' + cut[k].toFixed(1) + ' MW');
    // ... and the terms are live: the same projection without the orders differs by about what they are
    const none = structuredClone(told);
    Object.assign(none.battery, {mode: 'idle', orderMW: 0, schedMW: 0, outMW: 0, agcTrimMW: 0});
    Object.assign(none.dr, {mw: 0, activeS: 0});
    const N0 = PV.project(none), moved = Math.max(...T.surplusMW.map((v, k) => Math.abs(v - N0.surplusMW[k])));
    assert.ok(Math.min(...cut) > V.SURPLUS_MIN_MW && moved >= 140, what + ': the sim spills through the half hour (' + Math.min(...cut).toFixed(0) + ' MW at least) and the orders move the projection by up to ' + moved.toFixed(0) + ' MW');
  }
});

test('planview imports only sim/params.js and uses no Math.random', () => {
  const src = readFileSync(new URL('../app/planview.js', import.meta.url), 'utf8');
  assert.deepEqual(importSpecifiers(tokenize(src)), ['../sim/params.js']);
  assert.ok(!/Math\.random/.test(src));
});

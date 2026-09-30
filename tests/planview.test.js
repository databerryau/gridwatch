// app/planview.js (desk/README §7; SPEC L-1, L-4, L-5, L-6, L-9): the Live Stack's projection
// of the plan, earliest arrivals, the L-9 glow set and drop snapping. Before the sim agent's
// executor merges these run against real par days (tests/lib/vm-fixture.js) with hand-built
// plans in the §3.1 shape; stage C re-checks the projection against a stepped sim.
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
  planOf(e, plan => { key(plan, 'gta', e.s + 900, 0); key(plan, 'hydro', e.s + 1800, 300); key(plan, 'gtb', e.s + 3600, 400); });
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

test('L-5: gaps are red below P50 and amber below P90; past columns read the shell history', async () => {
  const obs = planOf(await tripped());
  const P = PV.project(obs, {hist: {demand: [{s: obs.s - 1000, mw: 7000}, {s: obs.s - 10, mw: 7600}], stations: {coal: [{s: obs.s - 200, mw: 2000}]}}});
  for (let k = 0; k < P.n; k++) {
    const want = P.supply[k] < P.p50[k] - 0.5 ? 'red' : P.supply[k] < P.p90[k] - 0.5 ? 'amber' : '';
    assert.equal(P.gap[k], want);
  }
  assert.equal(P.gap[0], 'red', 'a trip at the peak opens a red gap at once');
  assert.equal(P.past.demand[5], 7600);
  assert.equal(P.past.layers.coal[5], 2000);
  assert.ok(Number.isNaN(P.past.demand[0]));
});

test('planview imports only sim/params.js and uses no Math.random', () => {
  const src = readFileSync(new URL('../app/planview.js', import.meta.url), 'utf8');
  assert.deepEqual(importSpecifiers(tokenize(src)), ['../sim/params.js']);
  assert.ok(!/Math\.random/.test(src));
});

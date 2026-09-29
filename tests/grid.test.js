// Stage B owner "grid": sim/grid.js acceptance (H-1, H-2, H-4, H-10, H-11, K-2, K-3, K-6, K-7,
// K-12 auto-sync, K-13 permissive, S-11). Todo until grid.js is implemented.
// These tests run grid seconds with a physics stand-in (outputs follow schedules and the
// frequency is forced), so they do not need physics.js or market.js.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as grid from '../sim/grid.js';
import {sampleSecond} from '../sim/weather.js';
import {unitIndex, largestContingency, setBasePoint} from '../sim/fleet.js';
import {uniform, STREAM} from '../sim/rng.js';
import {V} from '../sim/params.js';
import {opening, commit, TPS} from './lib/sim-helpers.js';

const TODO = {todo: 'stage B: grid'};

/** n grid seconds of grid logic; physics replaced by "output = schedule" at frequency fHz. */
function seconds(s, n, fHz = V.F0_HZ) {
  const out = [];
  for (let i = 0; i < n; i++) {
    s.last.fMeanHz = s.last.fMinHz = s.last.fMaxHz = fHz;
    s.phys.fHz = fHz;
    sampleSecond(s);
    grid.unitsSecond(s, out);
    grid.agcSecond(s, out);
    grid.dispatchSecond(s, out);
    grid.fosSecond(s, out);
    for (const u of s.units) u.outMW = u.sync ? u.schedMW : 0;
    s.battery.outMW = s.battery.schedMW;
    s.tick += TPS;
  }
  return out;
}
const unit = (s, id) => s.units[unitIndex(id)];

test('H-1 / K-3: STOP unloads at the ramp to MIN, then T4 to <=5%, then the breaker opens; no step > ramp', TODO, () => {
  const s = opening(3);
  const u = unit(s, 'coal1'), m = V.MACHINES[unitIndex('coal1')];
  assert.equal(grid.applyCommand(s, {type: 'stop', unit: 'coal1'}, []), '');
  assert.equal(u.mode, 'unloading');
  let prev = u.schedMW, maxStep = 0, lastStep = 0, t = 0;
  const others = s.units.filter(x => x.station === 'coal' && x !== u).map(x => x.schedMW);
  while (u.mode !== 'off' && t < 5 * 3600) {
    seconds(s, 1);
    t++;
    if (u.mode === 'off') lastStep = prev; else maxStep = Math.max(maxStep, prev - u.schedMW);
    prev = u.schedMW;
  }
  assert.equal(u.mode, 'off');
  assert.equal(u.sync, false);
  assert.ok(maxStep <= m.rampMWs + 1e-9, 'unloading step ' + maxStep);
  assert.ok(lastStep <= m.breakerOpenMW + m.rampMWs + 1e-9, 'breaker step ' + lastStep);
  const expect = (500 - m.minMW) / m.rampMWs + m.t4S;
  assert.ok(Math.abs(t - expect) <= 120, 'stop took ' + t + ' s, expected ~' + expect);
  // The station's other machines did not chase the stopped one.
  s.units.filter(x => x.station === 'coal' && x !== u).forEach((x, i) => assert.ok(Math.abs(x.schedMW - others[i]) < 1, x.id));
});

test('H-1: a stop can be aborted while unloading; a stopping unit offers no headroom', TODO, () => {
  const s = opening(3);
  grid.applyCommand(s, {type: 'stop', unit: 'ccgt1'}, []);
  seconds(s, 60);
  const sec = grid.security(s, {previewNadirHz: 50});
  const u = unit(s, 'ccgt1');
  assert.equal(u.mode, 'unloading');
  assert.equal(grid.applyCommand(s, {type: 'abortStop', unit: 'ccgt1'}, []), '');
  assert.equal(u.mode, 'on');
  assert.ok(sec.r5MW >= 0);
});

test('S-11: minimum up and down times refuse STOP and START with the reason', TODO, () => {
  const s = opening(4);
  assert.equal(grid.applyCommand(s, {type: 'start', unit: 'gta1'}, []), '');
  seconds(s, V.MACHINES[unitIndex('gta1')].t1S + V.AUTO_SYNC_S + V.MACHINES[unitIndex('gta1')].t2S + 5);
  assert.equal(unit(s, 'gta1').mode, 'on');
  assert.match(grid.applyCommand(s, {type: 'stop', unit: 'gta1'}, []), /minimum up/);
  seconds(s, 3600);
  assert.equal(grid.applyCommand(s, {type: 'stop', unit: 'gta1'}, []), '');
  seconds(s, 600);
  assert.equal(unit(s, 'gta1').mode, 'off');
  assert.match(grid.applyCommand(s, {type: 'start', unit: 'gta1'}, []), /minimum down/);
});

test('K-12 / F-13: START -> T1 -> auto-sync after 4 grid-min -> <=5% block -> T2 to MIN -> on; start cost charged', TODO, () => {
  const s = opening(5);
  const i = unitIndex('gta1'), m = V.MACHINES[i], u = s.units[i];
  assert.equal(grid.applyCommand(s, {type: 'start', unit: 'gta1'}, []), '');
  assert.equal(u.mode, 'starting');
  assert.equal(s.acc.startCost, m.startCost);
  seconds(s, m.t1S);
  assert.equal(u.mode, 'ready');
  assert.equal(u.sync, false, 'no inertia before the breaker closes');
  const ek = s.phys.ekMWs;
  const out = seconds(s, V.AUTO_SYNC_S);
  assert.equal(u.mode, 'loading');
  assert.ok(u.schedMW <= m.syncBlockMW + m.rampMWs + 1e-9);
  assert.equal(s.phys.ekMWs, ek + m.ekMWs, 'H-3: inertia counts from the breaker close');
  assert.ok(out.some(e => e.kind === 'breaker' && e.unit === 'gta1' && e.closed));
  seconds(s, m.t2S + 1);
  assert.equal(u.mode, 'on');
  assert.ok(Math.abs(u.schedMW - m.minMW) <= m.rampMWs + 1e-9);
});

test('K-12: HAND mode has no auto-synchroniser; syncClose closes a ready unit', TODO, () => {
  const s = opening(5);
  s.control.mode = 'HAND';
  grid.applyCommand(s, {type: 'start', unit: 'gtc1'}, []);
  seconds(s, V.MACHINES[unitIndex('gtc1')].t1S + V.AUTO_SYNC_S + 60);
  assert.equal(unit(s, 'gtc1').mode, 'ready');
  assert.equal(grid.applyCommand(s, {type: 'syncClose', unit: 'gtc1'}, []), '');
  assert.equal(unit(s, 'gtc1').sync, true);
});

test('H-4: one reserve function: R5, L and the level from the H-4 definitions', TODO, () => {
  const s = opening(6);
  seconds(s, 1);
  let r5 = 0;
  for (const u of s.units) {
    if (u.mode !== 'on') continue;
    const m = V.MACHINES[u.k];
    r5 += Math.min(u.availMW - u.outMW, m.rampMWs * V.R5_WINDOW_MIN * 60);
  }
  r5 += Math.min(V.BATT_MW - s.battery.outMW, s.battery.socMWh / V.BATT_R5_SUSTAIN_H);
  r5 += Math.min(V.TIE_MAX_MW - s.tie.flowMW, V.TIE_RAMP_MW_MIN * V.R5_WINDOW_MIN);
  const sec = grid.security(s, {previewNadirHz: 49.8});
  assert.ok(Math.abs(sec.r5MW - r5) < 1e-6, sec.r5MW + ' vs ' + r5);
  const L = largestContingency(s);
  assert.equal(sec.lMW, L.mw);
  assert.equal(sec.lId, L.id);
  const want = r5 < L.mw ? 'SHORT' : r5 < V.SECURE_RATIO * L.mw ? 'TIGHT' : 'SECURE';
  assert.equal(sec.level, want);
  assert.equal(grid.security(s, {previewNadirHz: 49.4}).level, want === 'SECURE' ? 'TIGHT' : want, 'H-4: SECURE also needs the preview');
});

test('K-2: AGC trims inside the bands, in proportion to them; HAND mode trims nothing; AGC never starts or stops units', TODO, () => {
  const s = opening(7);
  const modes = s.units.map(u => u.mode).join();
  seconds(s, 4 * V.AGC_CYCLE_S, 49.95);
  const on = s.units.filter(u => u.mode === 'on');
  assert.ok(on.some(u => u.agcTrimMW > 0), 'AGC did not raise output at 49.95 Hz');
  for (const u of on) assert.ok(Math.abs(u.agcTrimMW) <= V.MACHINES[u.k].agcBandMW + 1e-9, u.id + ' outside its band');
  const hyd = on.find(u => u.station === 'hydro'), coal = on.find(u => u.station === 'coal');
  if (hyd.agcTrimMW < V.MACHINES[hyd.k].agcBandMW && coal.agcTrimMW < V.MACHINES[coal.k].agcBandMW) {
    const r = (hyd.agcTrimMW / V.MACHINES[hyd.k].agcBandMW) / (coal.agcTrimMW / V.MACHINES[coal.k].agcBandMW);
    assert.ok(Math.abs(r - 1) < 0.05, 'participation not proportional to band: ' + r);
  }
  assert.equal(s.units.map(u => u.mode).join(), modes);
  s.control.mode = 'HAND';
  seconds(s, 2 * V.AGC_CYCLE_S, 49.95);
  assert.ok(s.units.every(u => u.agcTrimMW === 0));
});

test('H-10: a charge order on a full battery shows FULL-HOLD and never silently re-engages', TODO, () => {
  const s = opening(8);
  s.battery.socMWh = V.BATT_MWH;
  assert.equal(grid.applyCommand(s, {type: 'battery', mode: 'charge', mw: 200}, []), '');
  seconds(s, 5);
  assert.equal(s.battery.fullHold, true);
  assert.ok(s.battery.schedMW >= 0);
  s.battery.socMWh = V.BATT_MWH - 100;
  seconds(s, 5);
  assert.equal(s.battery.fullHold, true, 'must not re-engage by itself');
  grid.applyCommand(s, {type: 'battery', mode: 'charge', mw: 200}, []);
  seconds(s, 30);
  assert.equal(s.battery.fullHold, false);
  assert.ok(s.battery.schedMW < 0);
});

test('K-5: guard MW are unavailable to orders: |order| <= BATT_MW - guardMW', TODO, () => {
  const s = opening(8);
  grid.applyCommand(s, {type: 'guard', mw: 300}, []);
  grid.applyCommand(s, {type: 'battery', mode: 'discharge', mw: 500}, []);
  seconds(s, 60);
  assert.ok(s.battery.schedMW <= V.BATT_MW - 300 + 1e-9);
});

test('H-11: directed shedding after >1 min below 49.5 Hz, one district per grid-minute in rotation order; stops on recovery', TODO, () => {
  const s = opening(9);
  seconds(s, V.DIRECTED_BELOW_CONTAIN_S + 1, 49.4);
  const rot = s.city.districts.filter(d => d.rot >= 0).sort((a, b) => a.rot - b.rot);
  assert.equal(s.city.districts.filter(d => d.dark).map(d => d.id).join(), rot[0].id);
  seconds(s, 2 * V.DIRECTED_INTERVAL_S, 49.4);
  assert.equal(s.city.districts.filter(d => d.dark).length, 3);
  assert.ok(s.city.districts.filter(d => d.dark).every(d => d.shedBy === 'directed'));
  seconds(s, 5 * V.DIRECTED_INTERVAL_S, 49.9);
  assert.equal(s.city.districts.filter(d => d.dark).length, 3, 'stops once frequency recovers; no automatic restore');
});

test('H-11: directed shedding when still below 49.85 Hz when the 5-min countdown ends', TODO, () => {
  const s = opening(9);
  seconds(s, V.FOS_RECOVER_S - 2, 49.8);
  assert.equal(s.city.shedFrac, 0);
  seconds(s, 4, 49.8);
  assert.ok(s.city.shedFrac > 0);
});

test('K-13: restore permissive needs f >= 49.9, R5 >= 1.2 x cold-load MW and 5 min since the last restore', TODO, () => {
  const s = opening(10);
  seconds(s, V.DIRECTED_BELOW_CONTAIN_S + 1, 49.4);
  const d = s.city.districts.findIndex(x => x.dark);
  assert.match(grid.restorePermissive(s, d), /\S/, 'no permissive at 49.4 Hz');
  assert.equal(grid.restorePermissive(s, s.city.districts.findIndex(x => !x.dark)), 'district is lit');
  seconds(s, 10, 50);
  assert.equal(grid.restorePermissive(s, d), '');
  const out = [];
  assert.equal(grid.applyCommand(s, {type: 'restore', district: s.city.districts[d].id}, out), '');
  assert.equal(s.city.districts[d].dark, false);
  assert.ok(out.some(e => e.kind === 'restore' && e.district === s.city.districts[d].id));
  assert.equal(s.city.lastRestoreS, Math.floor(s.tick / TPS));
  // Dark for ~71 s (< 10 min): no cold-load pickup, so no surge.
  assert.equal(s.city.districts[d].surgeMW, 0);
  // A second district, then the interval rule.
  grid.applyCommand(s, {type: 'directShed'}, []);
  const d2 = s.city.districts.findIndex(x => x.dark);
  assert.match(grid.restorePermissive(s, d2), /\S/, '5 min since the last restore');
  seconds(s, V.RESTORE_INTERVAL_S, 50);
  assert.equal(grid.restorePermissive(s, d2), '');
});

test('K-13: a district dark > 10 min comes back with a 1.5x cold-load surge that decays over 10 min', TODO, () => {
  const s = opening(10);
  grid.applyCommand(s, {type: 'directShed'}, []);
  const d = s.city.districts.findIndex(x => x.dark);
  seconds(s, V.COLD_LOAD_AFTER_S + 60, 50);
  const base = s.env.demandMW * s.city.districts[d].share;
  assert.equal(grid.applyCommand(s, {type: 'restore', district: s.city.districts[d].id}, []), '');
  assert.ok(Math.abs(s.city.districts[d].surgeMW - base * (V.COLD_LOAD_FACTOR - 1)) < 1e-6);
  seconds(s, 1, 50);
  assert.ok(s.city.coldLoadMW > 0.9 * base * (V.COLD_LOAD_FACTOR - 1));
  seconds(s, V.COLD_LOAD_DECAY_S, 50);
  assert.equal(s.city.coldLoadMW, 0);
});

test('K-6 / F-13: tie ramps at 100 MW/min, export capped at 300 MW 09:00-16:00; a trip zeroes it', TODO, () => {
  const s = opening(11);
  grid.applyCommand(s, {type: 'tie', mw: -800}, []);
  seconds(s, 60);
  assert.ok(Math.abs(s.tie.flowMW - (250 - V.TIE_RAMP_MW_MIN)) < 1e-6, 'flow after 1 min ' + s.tie.flowMW);
  s.tick = ((12 - V.DAY_START_H) * 3600) * TPS;
  seconds(s, 20 * 60);
  assert.equal(s.tie.flowMW, -V.TIE_EXPORT_CAP_MW);
});

test('K-7: RERT arrives 20 grid-min after arming and ramps; DR: 350 MW for 60 min, 3 calls', TODO, () => {
  const s = opening(12);
  assert.equal(grid.applyCommand(s, {type: 'armRERT'}, []), '');
  seconds(s, V.RERT_LEAD_S - 1);
  assert.equal(s.rert.outMW, 0);
  seconds(s, 5 * 60);
  assert.equal(s.rert.outMW, V.RERT_MW);
  assert.equal(s.rert.armedEver, true);
  for (let k = 0; k < V.DR_CALLS; k++) {
    assert.equal(grid.applyCommand(s, {type: 'callDR'}, []), '');
    seconds(s, 2);
    assert.equal(s.dr.mw, V.DR_MW);
    seconds(s, V.DR_DURATION_S);
    assert.equal(s.dr.mw, 0);
  }
  assert.notEqual(grid.applyCommand(s, {type: 'callDR'}, []), '');
});

test('H-2: an overheat trip hits the hot unit at the first play-stream draw below the risk after arming; the log names it', TODO, () => {
  // Most hot runs never trip, so "same seed, same outcome" alone proves nothing. Pick a seed
  // whose play stream fires (uniform(seed, PLAY, tick, k) < HOT_TRIP_PER_H / 3600 at a grid
  // second's tick) inside the window, clear of the +-5 s arming ambiguity, and require the
  // trip at exactly that second.
  const k = unitIndex('coal1'), p = V.HOT_TRIP_PER_H / V.S_PER_H, windowS = 4 * 3600;
  const fires = (seed, i) => uniform(seed, STREAM.PLAY, i * TPS, k) < p;
  let seed = 13, at = -1;
  for (; seed < 600 && at < 0; seed++) {
    let first = -1;
    for (let i = V.HOT_ARM_S - 5; i < V.HOT_ARM_S + windowS && first < 0; i++) if (fires(seed, i)) first = i;
    if (first >= V.HOT_ARM_S + 5) at = first;
  }
  seed--;
  assert.ok(at > 0, 'no seed with a hot trip inside the window');
  const run = () => {
    // One coal machine held at full output (above 96% from the first second); every other unit well below it.
    const s = commit(opening(seed), {coal1: 640, ccgt1: 400, ccgt2: 400, hydro1: 200, hydro2: 200});
    setBasePoint(s, k, V.STATIONS.coal.ratingMW);
    let tripAt = -1, named = false;
    for (let i = 0; i < V.HOT_ARM_S + windowS && tripAt < 0; i++) {
      for (const e of seconds(s, 1)) {
        if (e.kind === 'breaker' && e.why === 'trip') { assert.equal(e.unit, 'coal1', 'H-2: only the hot unit trips'); tripAt = i; }
        if (e.kind === 'log' && e.code === 'UNIT_TRIP' && e.msg.includes(V.MACHINES[k].name)) named = true;
      }
    }
    return {tripAt, named};
  };
  const r = run();
  assert.equal(r.tripAt, at, 'seed ' + seed + ': trip second');
  assert.ok(r.named, 'the log names the unit');
  assert.deepEqual(run(), r, 'same seed and ticks, same outcome');
});

test('K-1: units carry the base points; a joining machine enters at MIN and nobody else moves; basePoint shares equally', TODO, () => {
  const s = opening(3);
  const lever = id => s.stations.find(st => st.id === id).basePointMW;
  const h1 = unit(s, 'hydro1').basePointMW, h2 = unit(s, 'hydro2').basePointMW;
  assert.equal(grid.applyCommand(s, {type: 'start', unit: 'hydro3'}, []), '');
  const m = V.MACHINES[unitIndex('hydro3')];
  seconds(s, m.t1S + V.AUTO_SYNC_S + m.t2S + 5);
  assert.equal(unit(s, 'hydro3').mode, 'on');
  assert.equal(unit(s, 'hydro3').basePointMW, m.minMW);
  assert.equal(unit(s, 'hydro1').basePointMW, h1, 'hydro1 moved when hydro3 joined');
  assert.equal(unit(s, 'hydro2').basePointMW, h2, 'hydro2 moved when hydro3 joined');
  assert.equal(lever('hydro'), h1 + h2 + m.minMW);
  // A basePoint input gives every 'on' machine an equal share, clamped to [MIN, avail], and
  // rewrites cmd.mw to the lever actually applied (step logs cmd after applyCommand).
  const cmd = {type: 'basePoint', station: 'coal', mw: 1800};
  assert.equal(grid.applyCommand(s, cmd, []), '');
  for (const u of s.units.filter(x => x.station === 'coal')) assert.equal(u.basePointMW, 450, u.id);
  assert.equal(lever('coal'), 1800);
  assert.equal(cmd.mw, 1800);
  const big = {type: 'basePoint', station: 'coal', mw: 99999};
  assert.equal(grid.applyCommand(s, big, []), '');
  assert.equal(big.mw, 4 * 650);
  assert.equal(lever('coal'), 4 * 650);
  const none = {type: 'basePoint', station: 'gtb', mw: 300};
  assert.equal(grid.applyCommand(s, none, []), '');
  assert.equal(none.mw, 0, 'no gtb machine is on');
  // STOP removes exactly the stopping machine's share.
  assert.equal(grid.applyCommand(s, {type: 'stop', unit: 'coal1'}, []), '');
  assert.equal(lever('coal'), 3 * 650);
});

test('curtail: limitPct is an output LIMIT (100 = no curtailment) applied at the next grid second', TODO, () => {
  const s = opening(4);
  assert.equal(grid.applyCommand(s, {type: 'curtail', kind: 'wind', limitPct: 50}, []), '');
  seconds(s, 1);
  assert.ok(Math.abs(s.ren.windMW - s.env.windAvailMW * 0.5) < 1e-9);
  assert.ok(Math.abs(s.ren.solarMW - s.env.solarAvailMW) < 1e-9, 'solar untouched at 100%');
});

test('K-7: DIRECT SHED sheds exactly one district, the next lit one in rotation order', TODO, () => {
  const s = opening(9);
  const out = [];
  assert.equal(grid.applyCommand(s, {type: 'directShed'}, out), '');
  const dark = s.city.districts.filter(d => d.dark);
  assert.deepEqual(dark.map(d => [d.rot, d.shedBy]), [[0, 'directed']]);
  assert.equal(out.filter(e => e.kind === 'shed').length, 1);
  assert.equal(grid.applyCommand(s, {type: 'directShed'}, []), '');
  assert.deepEqual(s.city.districts.filter(d => d.dark).map(d => d.rot).sort(), [0, 1]);
});

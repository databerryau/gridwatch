// Stage B owner "grid": sim/grid.js acceptance (H-1, H-2, H-4, H-10, H-11, K-2, K-3, K-6, K-7,
// K-12 auto-sync, K-13 permissive, S-11), plus the grid owner's own checks at the end.
// These tests run grid seconds with a physics stand-in (outputs follow schedules and the
// frequency is forced), so they do not need physics.js or market.js.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as grid from '../sim/grid.js';
import {sampleSecond} from '../sim/weather.js';
import {unitIndex, largestContingency, setBasePoint, tripUnit, setOfgsStage} from '../sim/fleet.js';
import {uniform, STREAM} from '../sim/rng.js';
import {V} from '../sim/params.js';
import {opening, commit, TPS} from './lib/sim-helpers.js';

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
/** DIRECT SHED from a SHORT gauge (A-3: the key works only while SHORT or SHEDDING; test poke of the level). */
function directShed(s, out) {
  if (s.sec.level !== 'SHEDDING') s.sec.level = 'SHORT';
  return grid.applyCommand(s, {type: 'directShed'}, out);
}
/** Put a 'ready' unit's needle so that a close now is judged (80 ms later) at angleDeg with slip slipHz (test poke). */
function needle(s, id, slipHz, angleDeg) {
  const u = unit(s, id);
  u.slipHz = u.slipToHz = slipHz;
  u.slipAtTick = s.tick;
  u.phaseAtDeg = angleDeg - V.DEG_PER_TURN * slipHz * V.SYNC_BREAKER_TICKS * V.PHYS_DT;
  return u;
}

test('H-1 / K-3: STOP unloads at the ramp to MIN, then T4 to <=5%, then the breaker opens; no step > ramp', () => {
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

test('H-1: a stop can be aborted while unloading; a stopping unit offers no headroom', () => {
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

test('S-11: minimum up and down times refuse STOP and START with the reason', () => {
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

test('K-12 / F-13: START -> T1 -> auto-sync after 4 grid-min -> <=5% block -> T2 to MIN -> on; start cost charged', () => {
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

test('K-12: HAND mode has no auto-synchroniser; syncClose closes a ready unit', () => {
  const s = opening(5);
  s.control.mode = 'HAND';
  grid.applyCommand(s, {type: 'start', unit: 'gtc1'}, []);
  seconds(s, V.MACHINES[unitIndex('gtc1')].t1S + V.AUTO_SYNC_S + 60);
  assert.equal(unit(s, 'gtc1').mode, 'ready');
  needle(s, 'gtc1', 0.2, 3);
  assert.equal(grid.applyCommand(s, {type: 'syncClose', unit: 'gtc1', bypass: false}, []), '');
  assert.equal(unit(s, 'gtc1').sync, true);
});

test('K-7 / A-3: DIRECT SHED is refused unless the gauge reads SHORT or SHEDDING', () => {
  const s = opening(9);
  for (const lv of ['SECURE', 'TIGHT']) {
    s.sec.level = lv;
    assert.match(grid.applyCommand(s, {type: 'directShed'}, []), /shortfall/);
  }
  assert.equal(s.city.shedFrac, 0);
  s.sec.level = 'SHORT';
  assert.equal(grid.applyCommand(s, {type: 'directShed'}, []), '');
  s.sec.level = 'SHEDDING';
  assert.equal(grid.applyCommand(s, {type: 'directShed'}, []), '');
  assert.equal(s.city.districts.filter(d => d.dark).length, 2);
});

test('H-4: one reserve function: R5, L and the level from the H-4 definitions', () => {
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
  // H-8: the preview must clear 49.5 Hz by PREVIEW_MARGIN_HZ (what the frozen-schedule preview cannot see).
  const edge = V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ;
  assert.equal(grid.security(s, {previewNadirHz: edge - 0.001}).level, want === 'SECURE' ? 'TIGHT' : want);
  assert.equal(grid.security(s, {previewNadirHz: edge}).level, want);
  // A cached preview is trusted less as it ages (PREVIEW_AGE_MARGIN_HZ_S per grid second).
  const aged = edge + 30 * V.PREVIEW_AGE_MARGIN_HZ_S;
  assert.equal(grid.security(s, {previewNadirHz: aged - 0.001, previewAgeS: 30}).level, want === 'SECURE' ? 'TIGHT' : want);
  assert.equal(grid.security(s, {previewNadirHz: aged, previewAgeS: 30}).level, want);
});

test('K-2: AGC trims inside the bands, in proportion to them; HAND mode trims nothing; AGC never starts or stops units', () => {
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

test('H-10: a charge order on a full battery shows FULL-HOLD and never silently re-engages', () => {
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

test('K-5: guard MW are unavailable to orders: |order| <= BATT_MW - guardMW', () => {
  const s = opening(8);
  grid.applyCommand(s, {type: 'guard', mw: 300}, []);
  grid.applyCommand(s, {type: 'battery', mode: 'discharge', mw: 500}, []);
  seconds(s, 60);
  assert.ok(s.battery.schedMW <= V.BATT_MW - 300 + 1e-9);
});

test('H-11: directed shedding after >1 min below 49.5 Hz, one district per grid-minute in rotation order; stops on recovery', () => {
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

test('H-11: directed shedding when still below 49.85 Hz when the 5-min countdown ends', () => {
  const s = opening(9);
  seconds(s, V.FOS_RECOVER_S - 2, 49.8);
  assert.equal(s.city.shedFrac, 0);
  seconds(s, 4, 49.8);
  assert.ok(s.city.shedFrac > 0);
});

test('K-13: restore permissive: f >= 49.9 and 5 min since the last restore; the restore input also needs the RESTORE PREVIEW', () => {
  const s = opening(10);
  seconds(s, V.DIRECTED_BELOW_CONTAIN_S + 1, 49.4);
  const d = s.city.districts.findIndex(x => x.dark);
  assert.match(grid.restorePermissive(s, d), /frequency below/, 'no permissive at 49.4 Hz');
  assert.equal(grid.restorePermissive(s, s.city.districts.findIndex(x => !x.dark)), 'district is lit');
  seconds(s, 10, 50);
  assert.equal(grid.restorePermissive(s, d), '');
  assert.equal(grid.restorePermissive(s, d, {preview: true}), '', 'a ~200-MW district on the opening fleet previews above 49.55 Hz');
  const out = [];
  assert.equal(grid.applyCommand(s, {type: 'restore', district: s.city.districts[d].id}, out), '');
  assert.equal(s.city.districts[d].dark, false);
  assert.ok(out.some(e => e.kind === 'restore' && e.district === s.city.districts[d].id));
  assert.equal(s.city.lastRestoreS, Math.floor(s.tick / TPS));
  // Dark for ~71 s (< 10 min): no cold-load pickup, so no surge.
  assert.equal(s.city.districts[d].surgeMW, 0);
  // A second district, then the interval rule.
  directShed(s, []);
  const d2 = s.city.districts.findIndex(x => x.dark);
  assert.match(grid.restorePermissive(s, d2), /wait/, '5 min since the last restore');
  seconds(s, V.RESTORE_INTERVAL_S, 50);
  assert.equal(grid.restorePermissive(s, d2), '');
});

test('K-13: the restore input refuses a district whose RESTORE PREVIEW dips below 49.5 Hz + margin (no restore -> UFLS loop)', () => {
  // A weak island (test poke): one coal and one hydro machine (4.4 GW.s), the tie and a large
  // non-synchronous share, no battery energy, a district dark for > 10 min (cold load x1.5).
  // The lamp's conditions hold, but the preview of picking it up is too deep.
  const s = commit(opening(10), {coal1: 600, hydro1: 150}, {tieMW: 800, windMW: 2000, battery: {socMWh: 0, guardMW: 0, mode: 'idle', orderMW: 0}});
  directShed(s, []);
  const d = s.city.districts.findIndex(x => x.dark);
  s.tick += (V.COLD_LOAD_AFTER_S + 60) * TPS; // dark long enough for cold-load pickup
  s.last.fMeanHz = V.F0_HZ;
  assert.equal(grid.restorePermissive(s, d), '', 'the lamp (frequency, interval) is lit');
  const why = grid.restorePermissive(s, d, {preview: true});
  assert.match(why, /restore preview/);
  const before = JSON.stringify(s);
  assert.match(grid.applyCommand(s, {type: 'restore', district: s.city.districts[d].id}, []), /restore preview/);
  assert.equal(JSON.stringify(s), before, 'a refused restore (and its preview) changes nothing');
});

test('K-13: a district dark > 10 min comes back with a 1.5x cold-load surge that decays over 10 min', () => {
  const s = opening(10);
  directShed(s, []);
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

test('K-6 / F-13: tie ramps at 100 MW/min, export capped at 300 MW 09:00-16:00; a trip zeroes it', () => {
  const s = opening(11);
  grid.applyCommand(s, {type: 'tie', mw: -800}, []);
  seconds(s, 60);
  assert.ok(Math.abs(s.tie.flowMW - (250 - V.TIE_RAMP_MW_MIN)) < 1e-6, 'flow after 1 min ' + s.tie.flowMW);
  s.tick = ((12 - V.DAY_START_H) * 3600) * TPS;
  seconds(s, 20 * 60);
  assert.equal(s.tie.flowMW, -V.TIE_EXPORT_CAP_MW);
});

test('K-7: RERT arrives 20 grid-min after arming and ramps; DR: 350 MW for 60 min (ramped on and off), 3 calls', () => {
  const s = opening(12);
  assert.equal(grid.applyCommand(s, {type: 'armRERT'}, []), '');
  seconds(s, V.RERT_LEAD_S - 1);
  assert.equal(s.rert.outMW, 0);
  seconds(s, 5 * 60);
  assert.equal(s.rert.outMW, V.RERT_MW);
  assert.equal(s.rert.armedEver, true);
  // DR sheds and returns at DR_RAMP_MW_MIN (integration): never a 350-MW load step.
  const rampS = Math.ceil(V.DR_MW / (V.DR_RAMP_MW_MIN / 60));
  for (let k = 0; k < V.DR_CALLS; k++) {
    assert.equal(grid.applyCommand(s, {type: 'callDR'}, []), '');
    seconds(s, 1);
    assert.ok(s.dr.mw > 0 && s.dr.mw <= V.DR_RAMP_MW_MIN / 60 + 1e-9, 'first second ' + s.dr.mw);
    seconds(s, rampS);
    assert.equal(s.dr.mw, V.DR_MW);
    seconds(s, V.DR_DURATION_S - rampS); // the call ends after DR_DURATION_S grid seconds
    assert.ok(s.dr.mw < V.DR_MW && s.dr.mw >= V.DR_MW - V.DR_RAMP_MW_MIN / 60 - 1e-9, 'returning at the ramp ' + s.dr.mw);
    seconds(s, rampS);
    assert.equal(s.dr.mw, 0);
  }
  assert.notEqual(grid.applyCommand(s, {type: 'callDR'}, []), '');
});

test('H-2: an overheat trip hits the hot unit at the first play-stream draw below the risk after arming; the log names it', () => {
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

test('K-1: units carry the base points; a joining machine enters at MIN and nobody else moves; basePoint shares equally', () => {
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

test('curtail: limitPct is an output LIMIT (100 = no curtailment) reached at the curtailment ramp, never as a step', () => {
  const s = opening(4);
  const step = V.CURTAIL_RAMP_FRAC_MIN * V.WIND_MW / 60;
  assert.ok(s.env.windAvailMW * 0.5 > 10 * step, 'enough wind to see the ramp');
  assert.equal(grid.applyCommand(s, {type: 'curtail', kind: 'wind', limitPct: 50}, []), '');
  seconds(s, 1);
  assert.ok(Math.abs(s.ren.windMW - (s.env.windAvailMW - step)) < 1e-9, 'one ramp step: ' + s.ren.windMW);
  seconds(s, 300);
  assert.ok(Math.abs(s.ren.windMW - s.env.windAvailMW * 0.5) < 1e-9, 'the LIMIT within 5 min');
  assert.ok(Math.abs(s.ren.solarMW - s.env.solarAvailMW) < 1e-9, 'solar untouched at 100%');
  assert.equal(grid.applyCommand(s, {type: 'curtail', kind: 'wind', limitPct: 100}, []), '');
  const before = s.ren.windMW;
  seconds(s, 1);
  assert.ok(s.ren.windMW - before <= step + 1, 'releasing the LIMIT ramps too: ' + (s.ren.windMW - before));
  seconds(s, 300);
  assert.equal(s.ren.windMW, s.env.windAvailMW, 'back to all of it');
});

test('K-7: DIRECT SHED sheds exactly one district, the next lit one in rotation order', () => {
  const s = opening(9);
  const out = [];
  assert.equal(directShed(s, out), '');
  const dark = s.city.districts.filter(d => d.dark);
  assert.deepEqual(dark.map(d => [d.rot, d.shedBy]), [[0, 'directed']]);
  assert.equal(out.filter(e => e.kind === 'shed').length, 1);
  assert.equal(directShed(s, []), '');
  assert.deepEqual(s.city.districts.filter(d => d.dark).map(d => d.rot).sort(), [0, 1]);
});

// ------------------------------------------------------------------ grid owner's own checks

const clone = x => JSON.parse(JSON.stringify(x));
const hasNegZero = x => (typeof x === 'number' ? Object.is(x, -0)
  : x !== null && typeof x === 'object' ? Object.values(x).some(hasNegZero) : false);

test('H-1: a stop from loading goes straight to the T4 ramp; abortStop in shutdown climbs the T2 slope back to MIN, then on', () => {
  const s = opening(5);
  const i = unitIndex('gta1'), m = V.MACHINES[i], u = s.units[i];
  grid.applyCommand(s, {type: 'start', unit: 'gta1'}, []);
  seconds(s, m.t1S + V.AUTO_SYNC_S + 30);
  assert.equal(u.mode, 'loading');
  u.upSinceS = -V.DAY_S; // test poke: minimum up time met
  const at = u.schedMW;
  assert.equal(grid.applyCommand(s, {type: 'stop', unit: 'gta1'}, []), '');
  seconds(s, 1);
  assert.equal(u.mode, 'shutdown', 'below MIN already: no unloading phase');
  assert.ok(u.schedMW < at);
  assert.equal(grid.applyCommand(s, {type: 'abortStop', unit: 'gta1'}, []), '');
  assert.equal(u.mode, 'loading');
  let prev = u.schedMW, t = 0;
  while (u.mode === 'loading' && t++ < m.t2S + 5) {
    seconds(s, 1);
    assert.ok(u.schedMW - prev <= m.rampMWs + 1e-9, 'T2 slope');
    prev = u.schedMW;
  }
  assert.equal(u.mode, 'on');
  assert.equal(u.basePointMW, m.minMW);
  assert.equal(u.sync, true, 'the breaker never opened');
});

test('K-12: stop cancels a starting or ready unit; refusals name the reason and change nothing', () => {
  const s = opening(6);
  grid.applyCommand(s, {type: 'start', unit: 'gtc1'}, []);
  assert.equal(grid.applyCommand(s, {type: 'stop', unit: 'gtc1'}, []), '');
  assert.equal(unit(s, 'gtc1').mode, 'off');
  assert.equal(unit(s, 'gtc1').sync, false);
  const before = JSON.stringify(s);
  const refusals = [
    [{type: 'syncClose', unit: 'gtc1'}, /synchronise/], [{type: 'abortStop', unit: 'coal1'}, /not stopping/],
    [{type: 'start', unit: 'coal1'}, /unit is on/], [{type: 'standDownRERT'}, /not armed/],
    [{type: 'restore', district: s.city.districts[0].id}, /lit/], [{type: 'stop', unit: 'gta1'}, /unit is off/],
  ];
  for (const [cmd, re] of refusals) assert.match(grid.applyCommand(s, cmd, []), re, cmd.type);
  assert.equal(JSON.stringify(s), before, 'a refused command changes nothing');
  grid.applyCommand(s, {type: 'armRERT'}, []);
  assert.match(grid.applyCommand(s, {type: 'armRERT'}, []), /already armed/);
  grid.applyCommand(s, {type: 'callDR'}, []);
  assert.match(grid.applyCommand(s, {type: 'callDR'}, []), /already active/);
  const cmd = {type: 'battery', mode: 'discharge', mw: 900};
  assert.equal(grid.applyCommand(s, cmd, []), '');
  assert.equal(cmd.mw, V.BATT_MW, 'the logged order is the applied one');
});

test('heat derate: thermal availMW falls 7% while heat is active, base points re-clamp, hydro is untouched; it recovers after', () => {
  const s = commit(opening(3), {coal1: 650, coal2: 500, ccgt1: 400, hydro1: 200});
  s.ext.heat = {announceS: 0, onsetS: 0, endS: 10}; // test poke: a heatwave from 04:00:00 to 04:00:10
  seconds(s, 1);
  const derated = 650 * (1 - V.HEAT_THERMAL_DERATE);
  assert.equal(unit(s, 'coal1').availMW, derated);
  assert.equal(unit(s, 'coal1').basePointMW, derated);
  assert.equal(unit(s, 'ccgt1').availMW, derated);
  assert.equal(unit(s, 'hydro1').availMW, V.STATIONS.hydro.ratingMW);
  assert.ok(unit(s, 'coal1').schedMW > derated - 1, 'output falls at the ramp, never as a step');
  seconds(s, 20);
  assert.equal(unit(s, 'coal1').availMW, 650);
});

test('lockouts: a tripped machine is released to off after its lockout; the tie comes back and ramps to its setpoint', () => {
  const s = opening(4);
  tripUnit(s, unitIndex('ccgt2'), 'test', 90, []);
  s.tie.tripped = true; s.tie.lockoutS = 60; s.tie.flowMW = 0; // as fleet.tripTie leaves it
  seconds(s, 59);
  assert.equal(unit(s, 'ccgt2').mode, 'tripped');
  assert.equal(s.tie.flowMW, 0);
  const ev = seconds(s, 2);
  assert.equal(s.tie.tripped, false);
  assert.ok(ev.some(e => e.kind === 'breaker' && e.unit === 'tie' && e.closed));
  assert.ok(s.tie.flowMW > 0 && s.tie.flowMW <= 2 * V.TIE_RAMP_MW_MIN / V.S_PER_MIN + 1e-9, 'ramps from 0');
  seconds(s, 30);
  assert.equal(unit(s, 'ccgt2').mode, 'off');
  // Owner decision D1: S-11 minimum down time follows a planned stop only; after a protection
  // trip the lockout is the only hold, then the unit may hot-start at once.
  assert.equal(grid.applyCommand(s, {type: 'start', unit: 'ccgt2'}, []), '', 'no minimum down time after a trip (D1)');
});

test('S-11 / D1: minimum down time after a planned stop, not after a protection trip; a tripped unit waits its lockout', () => {
  const s = opening(4);
  const i = unitIndex('coal1');
  tripUnit(s, i, 'test', 120, []);
  assert.match(grid.applyCommand(s, {type: 'start', unit: 'coal1'}, []), /tripped/, 'locked out');
  seconds(s, 121);
  assert.equal(unit(s, 'coal1').mode, 'off');
  assert.equal(unit(s, 'coal1').downWhy, 'trip');
  assert.equal(grid.applyCommand(s, {type: 'start', unit: 'coal1'}, []), '', 'hot start right after the lockout');
  // A planned stop of another machine still holds it off for its minimum down time.
  const j = unitIndex('coal2');
  unit(s, 'coal2').upSinceS = -V.DAY_S; // test poke: minimum up time met
  assert.equal(grid.applyCommand(s, {type: 'stop', unit: 'coal2'}, []), '');
  seconds(s, 3 * 3600); // unload 500 -> 240 at 3 MW/min, then T4 (70 min)
  assert.equal(unit(s, 'coal2').mode, 'off');
  assert.equal(unit(s, 'coal2').downWhy, 'stop');
  assert.match(grid.applyCommand(s, {type: 'start', unit: 'coal2'}, []), /minimum down/);
  assert.ok(s.units[j].downSinceS > s.units[i].downSinceS);
});

test('hydro water: warnings once each; at HYDRO_STOP_MWH the station unloads, and no machine starts or aborts the stop', () => {
  const s = opening(7);
  s.hydro.storageMWh = V.HYDRO_ALLOCATION_MWH * 0.25;
  let ev = seconds(s, 3);
  assert.equal(ev.filter(e => e.code === 'HYDRO_WATER').length, 1);
  s.hydro.storageMWh = V.HYDRO_STOP_MWH;
  ev = seconds(s, 1);
  assert.equal(ev.filter(e => e.code === 'HYDRO_WATER').length, 1, 'the 10% warning, once');
  assert.ok(ev.some(e => e.code === 'HYDRO_EMPTY'));
  for (const id of ['hydro1', 'hydro2']) assert.equal(unit(s, id).mode, 'unloading', id);
  assert.equal(s.stations.find(st => st.id === 'hydro').basePointMW, 0);
  assert.match(grid.applyCommand(s, {type: 'start', unit: 'hydro3'}, []), /water/);
  assert.match(grid.applyCommand(s, {type: 'abortStop', unit: 'hydro1'}, []), /water/);
  const m = V.MACHINES[unitIndex('hydro1')];
  seconds(s, Math.ceil(m.ratingMW / m.rampMWs) + 2);
  assert.equal(unit(s, 'hydro1').mode, 'off', 'unloaded at its ramp, then the breaker opened');
  assert.equal(seconds(s, 5).filter(e => e.code === 'HYDRO_EMPTY').length, 0, 'said once');
});

test('K-7: RERT stands down at its ramp, then disarms; stood down before it arrives, it simply cancels', () => {
  const s = opening(12);
  grid.applyCommand(s, {type: 'armRERT'}, []);
  seconds(s, 60);
  assert.equal(grid.applyCommand(s, {type: 'standDownRERT'}, []), '');
  assert.deepEqual([s.rert.armed, s.rert.leadS, s.rert.outMW, s.rert.armedEver], [false, 0, 0, true]);
  grid.applyCommand(s, {type: 'armRERT'}, []);
  seconds(s, V.RERT_LEAD_S + 5 * 60);
  assert.equal(s.rert.outMW, V.RERT_MW);
  assert.equal(grid.applyCommand(s, {type: 'standDownRERT'}, []), '');
  assert.match(grid.applyCommand(s, {type: 'standDownRERT'}, []), /already standing down/);
  seconds(s, 60);
  assert.ok(Math.abs(s.rert.outMW - (V.RERT_MW - V.RERT_RAMP_MW_MIN)) < 1e-6, 'ramps out at its rate');
  seconds(s, 3 * 60);
  assert.deepEqual([s.rert.armed, s.rert.standingDown, s.rert.outMW], [false, false, 0]);
});

test('H-7: tripped wind reconnects one OFGS stage at a time, the last to trip first, after 10 min back in band', () => {
  const s = opening(2);
  for (let k = 0; k < 3; k++) setOfgsStage(s, k, true);
  seconds(s, V.OFGS_RECONNECT_S - 1, 50.3);
  assert.equal(s.ofgs.okS, 0, 'not counting while outside the band');
  seconds(s, V.OFGS_RECONNECT_S - 1, 50);
  assert.deepEqual(s.ofgs.tripped, [true, true, true, false]);
  seconds(s, 1, 50);
  assert.deepEqual(s.ofgs.tripped, [true, true, false, false]);
  assert.equal(s.ofgs.trippedFrac, 2 * V.OFGS_STAGE_FRAC);
  seconds(s, V.OFGS_RECONNECT_GAP_S - 1, 50);
  assert.deepEqual(s.ofgs.tripped, [true, true, false, false]);
  seconds(s, 1, 50);
  assert.deepEqual(s.ofgs.tripped, [true, false, false, false]);
  seconds(s, V.OFGS_RECONNECT_GAP_S, 50);
  assert.deepEqual(s.ofgs.tripped, [false, false, false, false]);
  assert.equal(s.ofgs.okS, 0);
});

test('K-2: at the band limit AGC reports the unmet ACE and counts seconds; the overload gate caps the raise band (no AGC-made hot units)', () => {
  const s = commit(opening(7), {coal1: 620, ccgt1: 400, hydro1: 200});
  seconds(s, 40 * V.AGC_CYCLE_S, 49.8);
  const c1 = unit(s, 'coal1');
  assert.ok(Math.abs(c1.agcTrimMW - (V.HOT_LOADING_FRAC * c1.availMW - c1.basePointMW)) < 1e-9, 'coal1 trim stops at the gate');
  assert.ok(c1.schedMW <= V.HOT_LOADING_FRAC * c1.availMW + 1e-9);
  assert.equal(c1.hotS, 0);
  assert.ok(s.agc.atLimitS > 10, 'at the limit for ' + s.agc.atLimitS + ' s');
  assert.ok(Math.abs(s.agc.unmetMW - V.AGC_BIAS_MW_PER_HZ * (V.F0_HZ - 49.8)) < 1e-6, 'unmet = ACE');
  seconds(s, V.AGC_CYCLE_S, 50.05);
  assert.equal(s.agc.atLimitS, 0);
  assert.equal(s.agc.unmetMW, 0);
});

test('battery: near empty the discharge schedule tapers to what the ramp can still stop, so an empty battery drops <= 2 s of ramp', () => {
  const s = opening(8);
  s.battery.socMWh = 3;
  grid.applyCommand(s, {type: 'battery', mode: 'discharge', mw: 500}, []);
  let last = 0;
  for (let t = 0; t < 3600 && s.battery.socMWh > 0; t++) {
    seconds(s, 1);
    last = s.battery.schedMW;
    s.battery.socMWh = Math.max(0, s.battery.socMWh - Math.max(0, last) / V.S_PER_H); // stand-in energy integration
  }
  assert.equal(s.battery.socMWh, 0);
  assert.ok(last <= 2 * V.BATT_DISPATCH_RAMP_MW_S, 'schedule when it emptied: ' + last);
  seconds(s, 3);
  assert.equal(s.battery.schedMW, 0);
  assert.ok(s.battery.agcTrimMW <= 0, 'no raise band when empty');
});

test('K-15 / H-11: backInBandTick is the first tick of the first completed second after the trip inside the normal band', () => {
  const s = opening(9);
  tripUnit(s, unitIndex('coal1'), 'test', 3600, []);
  const c = s.conts[s.contIdx];
  seconds(s, 1, 50); // at this second's start, the completed second is the one before the trip
  assert.equal(c.backInBandTick, -1);
  seconds(s, 5, 49.7);
  assert.equal(c.backInBandTick, -1);
  const at = s.tick;
  seconds(s, 2, 49.9);
  // The stand-in's `last` at a call describes the completed second before it (as in step()).
  assert.equal(c.backInBandTick, at - TPS);
});

test('H-11 rotation: a restored district goes to the back of the rotation; restores relight and re-arm a UFLS stage', () => {
  const s = opening(10);
  directShed(s, []);
  const first = s.city.districts.find(d => d.dark);
  seconds(s, 2, 50);
  assert.equal(grid.applyCommand(s, {type: 'restore', district: first.id}, []), '');
  directShed(s, []);
  assert.equal(s.city.districts.find(d => d.dark).rot, 1, 'not the district just restored');
  // UFLS stage 1 operated (physics does this through fleet.operateUfls; poked here).
  const st1 = s.city.districts.filter(d => d.uflsStage === 1);
  for (const d of st1) { d.dark = true; d.shedBy = 'ufls'; d.darkSinceS = 0; s.city.shedFrac += d.share; }
  s.ufls.operated[0] = true;
  for (const d of st1) {
    s.city.lastRestoreS = -V.DAY_S; // test poke: the 5-min interval is tested elsewhere
    assert.equal(grid.applyCommand(s, {type: 'restore', district: d.id}, []), '');
  }
  assert.equal(s.ufls.operated[0], false, 're-armed once both districts are lit');
});

test('F-4 / K-2: under AGC and base point moves, no on-line unit schedule moves faster than its ramp; state stays plain JSON', () => {
  const s = opening(11);
  let x = 12345;
  const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  const prev = s.units.map(u => u.schedMW);
  for (let t = 0; t < 1800; t++) {
    if (t % 97 === 0) grid.applyCommand(s, {type: 'basePoint', station: ['coal', 'ccgt', 'hydro'][t % 3], mw: r() * 2600}, []);
    if (t === 300) grid.applyCommand(s, {type: 'guard', mw: 200}, []);
    if (t === 400) grid.applyCommand(s, {type: 'battery', mode: 'charge', mw: 300}, []);
    seconds(s, 1, 50 + (r() - 0.5) * 0.3);
    s.units.forEach((u, i) => {
      if (u.mode === 'on') assert.ok(Math.abs(u.schedMW - prev[i]) <= V.MACHINES[i].rampMWs + 1e-9, u.id + ' moved ' + (u.schedMW - prev[i]));
      prev[i] = u.schedMW;
    });
    assert.ok(Math.abs(s.battery.schedMW) <= V.BATT_MW - s.battery.guardMW + V.BATT_DISPATCH_RAMP_MW_S + 1e-9);
  }
  assert.equal(hasNegZero(s), false, 'no -0 in state');
  assert.equal(JSON.stringify(clone(s)), JSON.stringify(s));
});

test('H-4 / K-10: securitySecond re-runs the preview only when dirty, when L changes or moves > tolerance, when f moves > tolerance, or after PREVIEW_REFRESH_S', () => {
  const s = opening(3);
  const sec = s.sec, tick = () => { seconds(s, 1); grid.securitySecond(s, []); };
  tick();
  assert.equal(sec.dirty, false);
  const at = sec.previewAtS;
  assert.equal(at, Math.floor(s.tick / TPS));
  assert.equal(sec.previewLId, largestContingency(s).id);
  assert.ok(sec.previewNadirHz > 45 && sec.previewNadirHz <= 50);
  tick(); tick();
  assert.equal(sec.previewAtS, at, 'cached');
  sec.dirty = true; // as applyInput does
  tick();
  assert.equal(sec.previewAtS, at + 3);
  for (let k = 0; k < V.PREVIEW_REFRESH_S - 1; k++) tick();
  assert.equal(sec.previewAtS, at + 3);
  tick();
  assert.equal(sec.previewAtS, at + 3 + V.PREVIEW_REFRESH_S, 'refreshed after PREVIEW_REFRESH_S');
  s.units[unitIndex(sec.previewLId)].outMW += V.PREVIEW_L_TOL_MW + 1; // L moves beyond the tolerance
  grid.securitySecond(s, []);
  assert.equal(sec.previewAtS, Math.floor(s.tick / TPS), 'L moved beyond the tolerance');
  const lv = grid.security(s, {previewNadirHz: sec.previewNadirHz});
  assert.equal(sec.level, lv.level);
  assert.equal(sec.r5MW, lv.r5MW);
  // The frequency moving more than PREVIEW_F_TOL_HZ from the preview's starting frequency (an
  // excursion, or its end) re-runs it too: the preview starts from the present frequency.
  tick(); // L back at its value: re-run at 50 Hz
  const at2 = sec.previewAtS, fTol = V.PREVIEW_F_TOL_HZ;
  assert.equal(sec.previewFHz, V.F0_HZ);
  seconds(s, 1, V.F0_HZ + fTol / 2);
  grid.securitySecond(s, []);
  assert.equal(sec.previewAtS, at2, 'frequency inside the tolerance: cached');
  seconds(s, 1, V.F0_HZ - 2 * fTol);
  grid.securitySecond(s, []);
  assert.equal(sec.previewAtS, at2 + 2, 'frequency moved beyond the tolerance');
  assert.equal(sec.previewFHz, V.F0_HZ - 2 * fTol);
});

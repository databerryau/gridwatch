// Stage B owner "physics": sim/physics.js acceptance (H-8, H-6, H-7, H-10, K-5, K-10, F-4).
// Every test is `todo` until physics.js is implemented; remove the todo option as each passes.
// These tests drive physics only (schedules frozen, no grid seconds) through tests/lib/sim-helpers.js.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewTrip} from '../sim/physics.js';
import {hashState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {opening, commit, runPhysics, trip, clone, balance} from './lib/sim-helpers.js';

const TODO = {todo: 'stage B: physics'};
const F0 = V.F0_HZ, DT = V.PHYS_DT;

test('H-8: initial RoCoF (df/dt over the first 20-ms tick) is within 1% of dP f0 / (2 Ek)', TODO, () => {
  const s = opening(1);
  const lost = trip(s, 'coal1');
  const ek = s.phys.ekMWs;
  const f0 = s.phys.fHz;
  runPhysics(s, 1);
  const rocof = (s.phys.fHz - f0) / DT;
  const want = -lost * F0 / (2 * ek);
  assert.ok(Math.abs(rocof - want) <= 0.01 * Math.abs(want), 'rocof ' + rocof + ' want ' + want);
  assert.equal(s.conts.length, 1, 'a >50 MW trip opens a contingency record');
});

test('F-4: halving inertia doubles the initial RoCoF within 1% (rocof x Ek is invariant)', TODO, () => {
  const a = opening(2);
  const b = commit(opening(2), {coal1: 500, coal2: 500, ccgt1: 260, hydro1: 300, hydro2: 300});
  const r = [];
  for (const s of [a, b]) {
    trip(s, 'coal1');
    const ek = s.phys.ekMWs, f0 = s.phys.fHz;
    runPhysics(s, 1);
    r.push({rocof: (s.phys.fHz - f0) / DT, ek});
  }
  const ratio = (r[1].rocof / r[0].rocof) / (r[0].ek / r[1].ek);
  assert.ok(Math.abs(ratio - 1) <= 0.01, 'ratio ' + ratio);
});

test('H-8: for a -650 MW trip, raising Ek from ~8 to ~25 GW.s raises the nadir by >= 0.2 Hz', TODO, () => {
  const low = commit(opening(3), {coal1: 650, ccgt1: 420, hydro1: 150, hydro2: 150});
  const high = commit(opening(3), {coal1: 650, coal2: 450, coal3: 450, coal4: 450, ccgt1: 420, ccgt2: 420, gta1: 300, gtb1: 250,
    gtb2: 250, hydro1: 150, hydro2: 150, hydro3: 150});
  assert.ok(low.phys.ekMWs < 9000 && high.phys.ekMWs > 25000, low.phys.ekMWs + ' / ' + high.phys.ekMWs);
  const nl = previewTrip(low, {kind: 'unit', id: 'coal1'}).nadirHz;
  const nh = previewTrip(high, {kind: 'unit', id: 'coal1'}).nadirHz;
  assert.ok(nh - nl >= 0.2, 'nadir ' + nl.toFixed(3) + ' -> ' + nh.toFixed(3));
});

test('K-10: the TRIP PREVIEW matches the actual nadir within +-0.02 Hz in the same state; preview is pure', TODO, () => {
  const s = opening(4);
  const before = hashState(s), snap = JSON.stringify(s);
  const p = previewTrip(s, {kind: 'unit', id: 'coal1'});
  assert.equal(hashState(s), before, 'previewTrip wrote to state');
  assert.equal(JSON.stringify(s), snap);
  previewTrip(opening(9), {kind: 'link', id: 'tie'}); // a different call in between must not leak through the scratch
  assert.deepEqual(previewTrip(s, {kind: 'unit', id: 'coal1'}), p, 'deterministic');
  trip(s, 'coal1');
  const run = runPhysics(s, V.PREVIEW_HORIZON_S * V.TICKS_PER_S);
  assert.ok(Math.abs(run.minHz - p.nadirHz) <= 0.02, 'actual ' + run.minHz + ' preview ' + p.nadirHz);
  for (const k of ['inertiaMW', 'batteryMW', 'guardMW', 'governorsMW', 'loadReliefMW', 'uflsMW']) assert.equal(typeof p.caught[k], 'number', k);
});

test('K-15 / README §5: caught.* are changes since the tick before the trip and sum to the MW lost (preview and record agree)', TODO, () => {
  const s = opening(4); // balanced at 50 Hz: the tripped unit's governor was at 0
  const p = previewTrip(s, {kind: 'unit', id: 'coal2'});
  const sum = c => c.inertiaMW + c.batteryMW + c.guardMW + c.governorsMW + c.loadReliefMW + c.uflsMW;
  assert.ok(Math.abs(sum(p.caught) - p.lostMW) <= 1, 'preview caught ' + sum(p.caught) + ' vs lost ' + p.lostMW);
  trip(s, 'coal2');
  runPhysics(s, V.WATCH_S * V.TICKS_PER_S);
  const rec = s.conts[s.contIdx];
  assert.ok(Math.abs(sum(rec.caught) - rec.lostMW) <= 1, 'record caught ' + sum(rec.caught) + ' vs lost ' + rec.lostMW);
  assert.ok(Math.abs(rec.extremeHz - p.nadirHz) <= 0.02);
  assert.ok(rec.caught.governorsMW > 0 && rec.caught.batteryMW > 0 && rec.caught.loadReliefMW > 0);
});

test('H-8: battery SoC limits: no discharge at 0 MWh and no charge when full; the imbalance identity still holds', TODO, () => {
  const empty = opening(14);
  empty.battery.mode = 'discharge'; empty.battery.orderMW = 200; empty.battery.schedMW = 200; empty.battery.socMWh = 0;
  const full = opening(14);
  full.battery.mode = 'charge'; full.battery.orderMW = 200; full.battery.schedMW = -200; full.battery.socMWh = V.BATT_MWH;
  for (const s of [empty, full]) {
    runPhysics(s, 10);
    const p = s.phys, b = s.battery;
    assert.ok(b.socMWh >= 0 && b.socMWh <= V.BATT_MWH, 'soc ' + b.socMWh);
    assert.ok(s === empty ? b.outMW <= 1e-9 : b.outMW >= -1e-9, 'out ' + b.outMW);
    const borrowed = p.inertiaMW + p.govTotalMW + b.pfrMW + b.ffrMW + p.loadReliefMW;
    assert.ok(Math.abs(p.schedSupplyMW - p.servedMW + borrowed) <= 1, 'identity ' + (p.schedSupplyMW - p.servedMW + borrowed));
  }
});

test('H-8 / K-10: a 10-s engine run costs <= 5 ms; one physics tick <= ~0.5 us (a day in a few seconds)', TODO, () => {
  const s = opening(5);
  let t = performance.now();
  for (let i = 0; i < 20; i++) previewTrip(s, {kind: 'unit', id: 'coal1'});
  const perPreview = (performance.now() - t) / 20;
  assert.ok(perPreview <= 5, 'previewTrip ' + perPreview.toFixed(2) + ' ms');
  const n = 500000;
  t = performance.now();
  runPhysics(s, n);
  const us = (performance.now() - t) * 1000 / n;
  // Budget 0.5 us; the assertion is loose so a slow CI box does not flake.
  assert.ok(us <= 2, 'physics.tick ' + us.toFixed(3) + ' us');
});

test('H-6: no shedding above 49.0 Hz; stage 1 sheds its two districts 0.30 +- 0.02 s after crossing', TODO, () => {
  const s = opening(6);
  runPhysics(s, 2 * V.TICKS_PER_S, x => { x.phys.fHz = 49.001; });
  assert.ok(s.ufls.operated.every(o => !o), 'shed above 49.0 Hz');
  assert.equal(s.city.shedFrac, 0);
  let at = -1;
  runPhysics(s, V.TICKS_PER_S, (x, k) => { x.phys.fHz = 48.95; if (at < 0 && x.ufls.operated[0]) at = k; });
  assert.ok(at >= 0, 'stage 1 never operated');
  // `at` = ticks from the first tick below 49.0 Hz to the first onTick that sees the stage
  // operated, i.e. the crossing-to-shed time in ticks (H-6: 0.30 +- 0.02 s, one tick = 0.02 s).
  assert.ok(Math.abs(at * DT - V.UFLS_DELAY_S) <= 0.02 + 1e-9, 'delay ' + at * DT);
  assert.ok(!s.ufls.operated[1], 'stage 2 (48.875 Hz) must not operate at 48.95 Hz');
  assert.equal(s.city.districts.filter(d => d.dark).map(d => d.shedBy).join(), 'ufls,ufls');
});

test('H-6: there is no automatic restore', TODO, () => {
  const s = opening(7);
  runPhysics(s, V.TICKS_PER_S, x => { x.phys.fHz = 48.95; });
  const dark = s.city.shedFrac;
  assert.ok(dark > 0);
  runPhysics(s, 60 * V.TICKS_PER_S, x => { x.phys.fHz = 50.05; });
  assert.equal(s.city.shedFrac, dark);
});

test('H-7: graded collapse: black at <=47 Hz at once, after 2 s in 47.0-47.5, after 20 s in 47.5-48.0; never above 48', TODO, () => {
  const hold = (hz, seconds) => {
    const s = opening(8);
    let blackAt = -1;
    runPhysics(s, Math.round(seconds * V.TICKS_PER_S), (x, k) => { x.phys.fHz = hz; if (blackAt < 0 && x.black) blackAt = k; });
    return {s, t: s.black ? s.tick * DT : -1};
  };
  assert.ok(hold(46.99, 0.1).s.black);
  assert.ok(hold(52.0, 0.1).s.black);
  const a = hold(47.2, 3);
  assert.ok(a.s.black && a.t >= 2 - 0.05 && a.t <= 2 + 0.05, '47.2 Hz black at ' + a.t);
  assert.ok(!hold(47.7, 19.9).s.black, '47.7 Hz for 19.9 s must survive');
  assert.ok(hold(47.7, 20.1).s.black, '47.7 Hz for 20.1 s is black');
  assert.ok(!hold(48.1, 60).s.black);
  assert.ok(!hold(51.9, 60).s.black);
});

test('H-7: over-frequency sheds wind in OFGS stages between 51.0 and 52.0 Hz', TODO, () => {
  const s = opening(9);
  runPhysics(s, V.TICKS_PER_S, x => { x.phys.fHz = 51.1; });
  assert.equal(s.ofgs.trippedFrac, V.OFGS_STAGE_FRAC);
  runPhysics(s, V.TICKS_PER_S, x => { x.phys.fHz = 51.6; });
  assert.equal(s.ofgs.trippedFrac, 3 * V.OFGS_STAGE_FRAC);
});

test('H-10 / K-5: a standing charge order never worsens the nadir; a full battery on CHARGE responds within 5% of idle', TODO, () => {
  const idle = opening(10);
  // Charging: the suspension at 49.85 Hz releases the charge MW, so it may do BETTER than
  // idle; H-10 only requires that it is not worse (one-sided).
  const charging = clone(idle);
  charging.battery.mode = 'charge'; charging.battery.orderMW = 300; charging.battery.schedMW = -300; balance(charging);
  const pi = previewTrip(idle, {kind: 'unit', id: 'coal1'});
  const pc = previewTrip(charging, {kind: 'unit', id: 'coal1'});
  assert.ok(pc.nadirHz >= pi.nadirHz - 0.01, 'nadir idle ' + pi.nadirHz + ' charging ' + pc.nadirHz);
  // Full: the grid holds a charge order on a full battery at 0 MW (FULL-HOLD), so its
  // schedule is 0, exactly like idle; only the SoC differs.
  const full = clone(idle);
  full.battery.mode = 'charge'; full.battery.orderMW = 300; full.battery.schedMW = 0; full.battery.fullHold = true;
  full.battery.socMWh = V.BATT_MWH; balance(full);
  const pf = previewTrip(full, {kind: 'unit', id: 'coal1'});
  assert.ok(Math.abs(pf.caught.batteryMW - pi.caught.batteryMW) <= 0.05 * Math.abs(pi.caught.batteryMW),
    'full ' + pf.caught.batteryMW + ' idle ' + pi.caught.batteryMW);
});

test('H-8 / K-5: GUARD fires below the trigger, delivers in full within 1 s, sustains 10 min; guard MW raise the nadir', TODO, () => {
  const s = opening(11);
  s.battery.guardMW = 300;
  runPhysics(s, 1, x => { x.phys.fHz = V.GUARD_TRIGGER_HZ - 0.01; });
  assert.ok(s.battery.ffrFiredTick >= 0, 'guard did not fire');
  runPhysics(s, V.TICKS_PER_S, x => { x.phys.fHz = 49.7; });
  assert.ok(Math.abs(s.battery.ffrMW - 300) < 1e-6, 'guard ' + s.battery.ffrMW + ' MW after 1 s');
  const g0 = previewTrip(opening(11), {kind: 'unit', id: 'coal1'}, {guardMW: 0}).nadirHz;
  const g5 = previewTrip(opening(11), {kind: 'unit', id: 'coal1'}, {guardMW: 500}).nadirHz;
  assert.ok(g5 > g0, 'guard 500 MW nadir ' + g5 + ' vs none ' + g0);
});

test('K-5 / H-8: with guard 0 a 650-MW evening trip breaks containment; some guard <= 500 MW contains it', TODO, () => {
  // "Today's inertia" in the evening: coal x4 + CCGT x2 + GT-A + hydro x3, ~19 GW.s (re-measure; §4.6).
  // The battery is DISCHARGING into the peak (par rule 6), so without a guard it has little
  // headroom left for PFR; an idle battery's 500 MW of PFR would make the guard moot.
  const s = commit(opening(12), {coal1: 650, coal2: 600, coal3: 600, coal4: 600, ccgt1: 600, ccgt2: 600, gta1: 450,
    hydro1: 280, hydro2: 280, hydro3: 280}, {tieMW: 400, battery: {mode: 'discharge', orderMW: 400, schedMW: 400}});
  const at = g => previewTrip(s, {kind: 'unit', id: 'coal1'}, {guardMW: g}).nadirHz;
  assert.ok(at(0) < V.CONTAIN_LO_HZ, 'guard 0 nadir ' + at(0));
  const passing = [];
  for (let g = V.GUARD_STEP_MW; g <= V.BATT_MW; g += V.GUARD_STEP_MW) if (at(g) >= V.CONTAIN_LO_HZ) passing.push(g);
  assert.ok(passing.length > 0, 'no guard <= 500 MW contains the trip');
});

test('K-5: previewTrip opts.guardMW clamps the battery schedule to +-(BATT_MW - guard) and starts balanced', TODO, () => {
  const units = {coal1: 600, coal2: 600, ccgt1: 500, hydro1: 250};
  // (a) discharging 400 MW; guard 500 clamps the schedule to 0 and the 400 MW count as
  // re-dispatched elsewhere. (b) the same fleet with the battery idle and 400 MW less demand.
  const a = commit(opening(12), units, {battery: {mode: 'discharge', orderMW: 400, schedMW: 400}});
  const b = commit(opening(12), units);
  b.env.demandMW = a.env.demandMW - 400;
  const pa = previewTrip(a, {kind: 'unit', id: 'coal1'}, {guardMW: 500});
  const pb = previewTrip(b, {kind: 'unit', id: 'coal1'}, {guardMW: 500});
  assert.ok(Math.abs(pa.nadirHz - pb.nadirHz) <= 0.005, 'clamped ' + pa.nadirHz + ' vs idle ' + pb.nadirHz + ' (unbalanced start?)');
});

test('K-11: phys readouts: RoCoF over the 500-ms FOS window; imbalance bar segments sum to the swing imbalance within 1 MW', TODO, () => {
  const s = opening(13);
  trip(s, 'coal1');
  runPhysics(s, 40);
  const hist = s.phys.fHist, L = V.FHIST_LEN, w = Math.round(V.ROCOF_WINDOW_S / DT);
  const now = hist[(s.tick - 1) % L], then = hist[(s.tick - 1 - w) % L];
  assert.ok(Math.abs(s.phys.rocofHzS - (now - then) / V.ROCOF_WINDOW_S) < 1e-9);
  // README "phys readouts": (scheduled supply - served load) + borrowed = 0, where borrowed =
  // inertia + governors + battery PFR + guard FFR + load relief (K-11 imbalance bar).
  const p = s.phys;
  const borrowed = p.inertiaMW + p.govTotalMW + s.battery.pfrMW + s.battery.ffrMW + p.loadReliefMW;
  assert.ok(Math.abs(p.schedSupplyMW - p.servedMW + borrowed) <= 1, 'bar does not sum: ' + (p.schedSupplyMW - p.servedMW + borrowed));
  assert.ok(Math.abs(p.imbalanceMW - (p.supplyMW - p.loadMW)) < 1e-6);
  assert.ok(Math.abs(p.inertiaMW + p.imbalanceMW) < 1e-6);
});

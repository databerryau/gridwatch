// Stage B owner "physics": sim/physics.js acceptance (H-8, H-6, H-7, H-10, K-5, K-10, F-4).
// Stage A's acceptance tests come first (all passing, todo removed); the physics owner's
// own tests for the contract's finer points follow them.
// These tests drive physics only (schedules frozen, no grid seconds) through tests/lib/sim-helpers.js.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewTrip, tick} from '../sim/physics.js';
import {hashState} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {opening, commit, runPhysics, trip, clone, balance} from './lib/sim-helpers.js';
import {yardstickNs, budgetUnits} from './lib/speed.js';

const F0 = V.F0_HZ, DT = V.PHYS_DT;

test('H-8: initial RoCoF (df/dt over the first 20-ms tick) is within 1% of dP f0 / (2 Ek)', () => {
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

test('F-4: halving inertia doubles the initial RoCoF within 1% (rocof x Ek is invariant)', () => {
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

test('H-8: for a -650 MW trip, raising Ek from ~8 to ~25 GW.s raises the nadir by >= 0.2 Hz', () => {
  const low = commit(opening(3), {coal1: 650, ccgt1: 420, hydro1: 150, hydro2: 150});
  const high = commit(opening(3), {coal1: 650, coal2: 450, coal3: 450, coal4: 450, ccgt1: 420, ccgt2: 420, gta1: 300, gtb1: 250,
    gtb2: 250, hydro1: 150, hydro2: 150, hydro3: 150});
  assert.ok(low.phys.ekMWs < 9000 && high.phys.ekMWs > 25000, low.phys.ekMWs + ' / ' + high.phys.ekMWs);
  const nl = previewTrip(low, {kind: 'unit', id: 'coal1'}).nadirHz;
  const nh = previewTrip(high, {kind: 'unit', id: 'coal1'}).nadirHz;
  assert.ok(nh - nl >= 0.2, 'nadir ' + nl.toFixed(3) + ' -> ' + nh.toFixed(3));
});

test('K-10: the TRIP PREVIEW matches the actual nadir within +-0.02 Hz in the same state; preview is pure', () => {
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

test('K-15 / README §5: caught.* are changes since the tick before the trip and sum to the MW lost (preview and record agree)', () => {
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

test('H-8: battery SoC limits: no discharge at 0 MWh and no charge when full; the imbalance identity still holds', () => {
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

test('H-8 / K-10: a 10-s engine run costs <= 5 ms; one physics tick <= 0.3 us on the owner\'s laptop (README §10), timed against a CPU yardstick', () => {
  const s = opening(5);
  let t = performance.now();
  for (let i = 0; i < 20; i++) previewTrip(s, {kind: 'unit', id: 'coal1'});
  const perPreview = (performance.now() - t) / 20;
  assert.ok(perPreview <= 5, 'previewTrip ' + perPreview.toFixed(2) + ' ms');
  // The tick budget (~0.3 us on the owner's laptop, README §10) in units of a yardstick that
  // shares no code with the sim, measured in this process (tests/lib/speed.js): a slow box is
  // not a failure, a slower tick is. The fastest of 5 runs of 100,000 ticks (review fix: the
  // old absolute bound was 2 us, ~10x the measured cost, so a 3x slower physics passed; 400
  // extra float operations per tick, ~3.7x the tick, now fail at ~6.5 units). Measured on the
  // owner's laptop: ~2 units against 4.3.
  const yard = yardstickNs();
  let best = Infinity;
  for (let k = 0; k < 5; k++) {
    t = performance.now();
    runPhysics(s, 100000);
    best = Math.min(best, (performance.now() - t) * 1e6 / 100000);
  }
  const limit = budgetUnits(300);
  assert.ok(best / yard <= limit, 'physics.tick ' + best.toFixed(0) + ' ns = ' + (best / yard).toFixed(2) + ' yardstick units, budget ' + limit.toFixed(2));
});

test('H-6: no shedding above 49.0 Hz; stage 1 sheds its two districts 0.30 +- 0.02 s after crossing', () => {
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

test('H-6: there is no automatic restore', () => {
  const s = opening(7);
  runPhysics(s, V.TICKS_PER_S, x => { x.phys.fHz = 48.95; });
  const dark = s.city.shedFrac;
  assert.ok(dark > 0);
  runPhysics(s, 60 * V.TICKS_PER_S, x => { x.phys.fHz = 50.05; });
  assert.equal(s.city.shedFrac, dark);
});

test('H-7: graded collapse: black at <=47 Hz at once, after 2 s in 47.0-47.5, after 20 s in 47.5-48.0; never above 48', () => {
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

test('H-7: over-frequency sheds wind in OFGS stages between 51.0 and 52.0 Hz', () => {
  const s = opening(9);
  runPhysics(s, V.TICKS_PER_S, x => { x.phys.fHz = 51.1; });
  assert.equal(s.ofgs.trippedFrac, V.OFGS_STAGE_FRAC);
  runPhysics(s, V.TICKS_PER_S, x => { x.phys.fHz = 51.6; });
  assert.equal(s.ofgs.trippedFrac, 3 * V.OFGS_STAGE_FRAC);
});

test('H-10 / K-5: a standing charge order never worsens the nadir; a full battery on CHARGE responds within 5% of idle', () => {
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

test('H-8 / K-5: GUARD fires below the trigger, delivers in full within 1 s, sustains 10 min; guard MW raise the nadir', () => {
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

test('K-5 / H-8: with guard 0 a 650-MW evening trip breaks containment; some guard <= 500 MW contains it', () => {
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

test('K-5: previewTrip opts.guardMW clamps the battery schedule to +-(BATT_MW - guard) and starts balanced', () => {
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

test('K-11: phys readouts: RoCoF over the 500-ms FOS window; imbalance bar segments sum to the swing imbalance within 1 MW', () => {
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

// ------------------------------------------------------------------ the physics owner's own tests

const unit = (s, id) => s.units[fleet.unitIndex(id)];
const hold = hz => x => { x.phys.fHz = hz; };
const effSched = b => b.outMW - b.pfrMW - b.ffrMW;
const caughtSum = c => c.inertiaMW + c.batteryMW + c.guardMW + c.governorsMW + c.loadReliefMW + c.uflsMW;

/** Every leaf of a plain JSON value; fails on -0 or a non-finite number (README §2 rule 4). */
function assertPlain(x, path = 'state') {
  if (typeof x === 'number') {
    assert.ok(Number.isFinite(x), path + ' is ' + x);
    assert.ok(!Object.is(x, -0), path + ' is -0');
  } else if (Array.isArray(x)) x.forEach((y, i) => assertPlain(y, path + '[' + i + ']'));
  else if (x !== null && typeof x === 'object') for (const k of Object.keys(x)) assertPlain(x[k], path + '.' + k);
}

test('H-8 governors: deadband, 5% droop on the deadband-reduced error, +-12% cap, headroom both ways, lag; others decay', () => {
  const s = opening(20);
  const c1 = unit(s, 'coal1'), c2 = unit(s, 'coal2'), c3 = unit(s, 'coal3'), c4 = unit(s, 'coal4');
  c2.schedMW = 620; // 30 MW of headroom up
  c4.mode = 'unloading'; c4.govMW = 40; // a sync unit that is not 'on' only decays
  const coal = V.MACHINES[c1.k];
  runPhysics(s, 60 * V.TICKS_PER_S, hold(49.8)); // 12 lag constants
  const want = (0.2 - V.GOV_DEADBAND_HZ) * coal.ratingMW / (V.GOV_DROOP * F0);
  assert.ok(Math.abs(c1.govMW - want) < 1e-3, 'droop: ' + c1.govMW + ' want ' + want);
  assert.ok(Math.abs(c2.govMW - 30) < 1e-3, 'headroom up: ' + c2.govMW);
  assert.ok(Math.abs(c4.govMW) < 1e-3, 'not on: decays to 0');
  assert.equal(c1.outMW, c1.schedMW + c1.govMW);
  runPhysics(s, 60 * V.TICKS_PER_S, hold(49.05));
  assert.ok(Math.abs(c1.govMW - coal.govCapMW) < 1e-3, 'cap: ' + c1.govMW);
  c3.schedMW = coal.minMW + 10; // 10 MW of headroom down
  runPhysics(s, 60 * V.TICKS_PER_S, hold(50.6));
  assert.ok(Math.abs(c1.govMW + coal.govCapMW) < 1e-2, 'symmetric cap down (H-7): ' + c1.govMW);
  assert.ok(Math.abs(c3.govMW + 10) < 1e-3, 'headroom down to MIN: ' + c3.govMW);
  runPhysics(s, 60 * V.TICKS_PER_S, hold(F0 - V.GOV_DEADBAND_HZ + 0.001));
  assert.ok(Math.abs(c1.govMW) < 1e-3, 'inside the deadband: ' + c1.govMW);
  // a heat-derated unit still scheduled above its available MW: no raise, but it still lowers
  c1.availMW = coal.ratingMW * (1 - V.HEAT_THERMAL_DERATE); c1.schedMW = 640;
  runPhysics(s, 60 * V.TICKS_PER_S, hold(49.8));
  assert.ok(Math.abs(c1.govMW) < 1e-3, 'no headroom up: ' + c1.govMW);
  runPhysics(s, 60 * V.TICKS_PER_S, hold(50.2));
  assert.ok(Math.abs(c1.govMW + want) < 1e-3, 'still lowers on over-frequency: ' + c1.govMW);
});

test('H-8 governors: dead time from the fHist ring (coal 0.5 s: no response for 25 ticks, then the lag)', () => {
  const s = opening(21);
  const c1 = unit(s, 'coal1'), dead = V.MACHINES[c1.k].govDeadTicks;
  let firstMove = -1;
  runPhysics(s, 2 * dead, (x, k) => { x.phys.fHz = 49.5; if (firstMove < 0 && c1.govMW !== 0) firstMove = k; });
  // the tick that first reads the delayed 49.5 Hz is `dead`; onTick sees its result one tick later
  assert.equal(firstMove, dead + 1);
});

test('H-8 battery PFR: deadband, full output 0.85 Hz beyond it, both directions; charging on a PFR swing stores x efficiency', () => {
  const s = opening(22);
  const b = s.battery;
  runPhysics(s, 5 * V.TICKS_PER_S, hold(49.5));
  const want = (0.5 - V.BATT_PFR_DEADBAND_HZ) / V.BATT_PFR_FULL_HZ * V.BATT_MW;
  assert.ok(Math.abs(b.pfrMW - want) < 1e-6, 'pfr ' + b.pfrMW + ' want ' + want);
  runPhysics(s, 5 * V.TICKS_PER_S, hold(48.9));
  assert.ok(Math.abs(b.pfrMW - V.BATT_MW) < 1e-6, 'full output');
  const soc0 = b.socMWh;
  runPhysics(s, 5 * V.TICKS_PER_S, hold(50.5));
  assert.ok(Math.abs(b.pfrMW + want) < 1e-6, 'symmetric: ' + b.pfrMW);
  assert.ok(b.socMWh > soc0, 'charging on over-frequency');
  const x = clone(s);
  runPhysics(x, 1, hold(50.5));
  assert.ok(Math.abs((x.battery.socMWh - b.socMWh) - want * V.BATT_CHARGE_EFF * DT / V.S_PER_H) < 1e-9, 'charge x efficiency');
});

test('H-10: charging is suspended below 49.85 Hz, re-engages in proportion up to 49.90 Hz (no step), and has hysteresis', () => {
  const s = opening(23);
  s.battery.schedMW = -300; balance(s);
  runPhysics(s, 5, hold(49.8));
  assert.equal(s.battery.ufSuspend, true);
  assert.ok(Math.abs(effSched(s.battery)) < 1e-9, 'suspended: ' + effSched(s.battery));
  runPhysics(s, 5, hold(49.875));
  assert.equal(s.battery.ufSuspend, true, 'still suspended inside the band');
  const band = V.UF_RESUME_LINEAR ? -300 * (49.875 - V.UF_SUSPEND_HZ) / (V.UF_RESUME_HZ - V.UF_SUSPEND_HZ) : 0;
  assert.ok(Math.abs(effSched(s.battery) - band) < 1e-6, 're-engaging: ' + effSched(s.battery) + ' want ' + band);
  runPhysics(s, 5, hold(49.95));
  assert.equal(s.battery.ufSuspend, false);
  assert.ok(Math.abs(effSched(s.battery) + 300) < 1e-9);
  runPhysics(s, 5, hold(49.87));
  assert.equal(s.battery.ufSuspend, false, 'hysteresis: 49.87 Hz does not suspend a running charge');
  assert.ok(Math.abs(effSched(s.battery) + 300) < 1e-9);
});

test('K-5 GUARD: fires below the trigger, full in 1 s, held 10 min, ramps off over 60 s, re-arms at 49.85 Hz; the ring never steps it', () => {
  const s = opening(24);
  const b = s.battery;
  b.guardMW = 200;
  runPhysics(s, 1, hold(V.GUARD_TRIGGER_HZ - 0.001));
  assert.equal(b.ffrFiredTick, 0);
  runPhysics(s, V.GUARD_SUSTAIN_S * V.TICKS_PER_S - 1, hold(49.95)); // sustained even back in band
  assert.equal(b.ffrMW, 200, 'held to the end of the sustain');
  runPhysics(s, V.GUARD_RAMP_OFF_S * V.TICKS_PER_S / 2, hold(49.95));
  assert.ok(Math.abs(b.ffrMW - 100) < 1e-6, 'half way down the ramp-off: ' + b.ffrMW);
  runPhysics(s, V.GUARD_RAMP_OFF_S * V.TICKS_PER_S / 2, hold(49.95));
  assert.equal(b.ffrMW, 0);
  assert.equal(b.ffrFiredTick, -1, 're-armed');
  // turning the ring down while the guard delivers withdraws at BATT_MW / GUARD_WITHDRAW_S
  b.guardMW = 300;
  runPhysics(s, 2 * V.TICKS_PER_S, hold(49.7));
  assert.equal(b.ffrMW, 300);
  b.guardMW = 0;
  runPhysics(s, 1, hold(49.7));
  assert.ok(Math.abs(b.ffrMW - (300 - V.BATT_MW / V.GUARD_WITHDRAW_S * DT)) < 1e-9, 'no step: ' + b.ffrMW);
});

test('H-6: a UFLS timer resets when f recovers above its threshold before 0.3 s; the ufls record carries the MW', () => {
  const s = opening(25);
  const n = Math.round(V.UFLS_DELAY_S / DT);
  const before = runPhysics(s, n - 1, hold(48.99));
  runPhysics(s, 1, hold(49.01));
  runPhysics(s, n - 1, hold(48.99));
  assert.ok(!s.ufls.operated[0], 'the timer did not reset');
  assert.equal(before.out.length, 0);
  const r = runPhysics(s, 1, hold(48.99));
  assert.ok(s.ufls.operated[0]);
  const rec = r.out.find(e => e.kind === 'ufls');
  assert.ok(rec && rec.stage === 1 && rec.districts.length === 2 && rec.cue === 'clack');
  assert.ok(Math.abs(rec.mw - s.env.demandMW * s.city.shedFrac) < 1e-9, 'mw ' + rec.mw);
  assert.equal(s.phys.shedMW, s.env.demandMW * s.city.shedFrac);
});

test('H-7: the 20-s collapse timer counts all time below 48 Hz (a dip into 47-47.5 does not reset it); ofgs records', () => {
  const s = opening(26);
  runPhysics(s, Math.round(18.5 * V.TICKS_PER_S), hold(47.7));
  runPhysics(s, V.TICKS_PER_S, hold(47.3));
  assert.ok(!s.black, '1 s below 47.5 Hz is survivable');
  const r = runPhysics(s, Math.round(0.6 * V.TICKS_PER_S), hold(47.7));
  assert.ok(s.black, '20.1 s below 48 Hz in all');
  assert.deepEqual(r.out.filter(e => e.kind === 'black').map(e => e.why), ['under']);
  const o = opening(27);
  const w = o.ren.windMW;
  const q = runPhysics(o, V.TICKS_PER_S, hold(51.3));
  assert.deepEqual(q.out.filter(e => e.kind === 'ofgs').map(e => [e.stage, e.mw]), [[1, w * V.OFGS_STAGE_FRAC], [2, w * V.OFGS_STAGE_FRAC]]);
  runPhysics(o, 1, hold(51.3));
  const windIn = o.phys.schedSupplyMW - (o.units.reduce((a, u) => a + (u.sync ? u.schedMW : 0), 0) + o.tie.flowMW + o.ren.solarMW +
    effSched(o.battery) + o.rert.outMW);
  assert.ok(Math.abs(windIn - w * (1 - 2 * V.OFGS_STAGE_FRAC)) < 1e-6, 'wind after OFGS in the supply: ' + windIn);
});

test('H-7: losing every synchronous machine is black at once (why inertia)', () => {
  const s = opening(28);
  s.units.forEach((u, i) => { if (u.sync) fleet.tripUnit(s, i, 'test', 60, []); });
  assert.equal(s.phys.ekMWs, 0);
  const r = runPhysics(s, 5);
  assert.ok(s.black);
  assert.deepEqual(r.out.filter(e => e.kind === 'black').map(e => e.why), ['inertia']);
});

test("acc and hydro water: per-tick accumulators (MW x s); f stats from each tick's start frequency", () => {
  const s = opening(29);
  s.battery.schedMW = 120; balance(s);
  trip(s, 'coal3');
  const unitMWs = s.units.map(() => 0), fs = [];
  let batt = 0, served = 0, hydroMWh = 0;
  const h0 = s.hydro.storageMWh;
  for (let k = 0; k < V.TICKS_PER_S; k++) {
    fs.push(s.phys.fHz);
    tick(s, []); s.tick++;
    s.units.forEach((u, i) => { unitMWs[i] += u.outMW * DT; if (u.station === 'hydro') hydroMWh += u.outMW * DT / V.S_PER_H; });
    batt += s.battery.outMW * DT; served += s.phys.loadMW * DT;
  }
  const a = s.acc;
  assert.equal(a.ticks, V.TICKS_PER_S);
  assert.equal(a.fMaxHz, Math.max(...fs));
  assert.equal(a.fMinHz, Math.min(...fs));
  assert.ok(Math.abs(a.fSumHz - fs.reduce((x, y) => x + y, 0)) < 1e-9);
  unitMWs.forEach((v, i) => assert.ok(Math.abs(a.unitMWs[i] - v) < 1e-9, s.units[i].id));
  assert.ok(Math.abs(a.battOutMWs - batt) < 1e-9 && batt > 0, 'signed net battery MWs');
  assert.ok(Math.abs(a.battAbsMWs - Math.abs(batt)) < 1e-9 && a.battChargeMWs === 0);
  assert.ok(Math.abs(a.servedMWs - served) < 1e-9);
  assert.ok(Math.abs(h0 - s.hydro.storageMWh - hydroMWh) < 1e-9, 'hydro water');
});

test('F-2 / F-7: physics resumes bit-identically from a JSON snapshot mid-watch; state stays plain JSON (no -0)', () => {
  const s = opening(30);
  s.battery.guardMW = 150; s.battery.schedMW = -200; balance(s);
  trip(s, 'coal1');
  runPhysics(s, 120);
  const c = clone(s);
  runPhysics(s, 1500); runPhysics(c, 1500);
  assert.equal(JSON.stringify(c), JSON.stringify(s));
  assert.equal(hashState(c), hashState(s));
  assertPlain(s);
  const o = opening(31);
  runPhysics(o, 3 * V.TICKS_PER_S, hold(51.2)); // over-frequency, OFGS, charging PFR
  runPhysics(o, 3 * V.TICKS_PER_S, hold(50));
  assertPlain(o);
});

test('K-10 / K-13: previewTrip targets: load loss shows the peak, a district restore its cold load; absent targets lose 0', () => {
  const s = opening(32);
  const load = previewTrip(s, {kind: 'load', id: 'smelter', mw: 256});
  assert.equal(load.lostMW, -256);
  assert.ok(load.nadirHz > F0, 'peak ' + load.nadirHz);
  const x = clone(s);
  x.env.demandMW -= 256;
  assert.ok(Math.abs(runPhysics(x, V.PREVIEW_HORIZON_S * V.TICKS_PER_S).maxHz - load.nadirHz) <= 0.02);
  // a dark UFLS district, balanced: restoring it adds its cold-load MW (x1.5 after 10 min)
  const d = opening(33);
  const k = d.city.districts.findIndex(z => z.uflsStage === 1);
  fleet.operateUfls(d, 0);
  d.tick += (V.COLD_LOAD_AFTER_S + 1) * V.TICKS_PER_S;
  d.env.demandMW = (d.env.demandMW - d.dr.mw) / (1 - d.city.shedFrac) + d.dr.mw;
  runPhysics(d, 1); // readouts of a real tick (the preview's caught baseline)
  const cold = fleet.districtColdLoadMW(d, k);
  const snap = JSON.stringify(d);
  const p = previewTrip(d, {kind: 'district', id: d.city.districts[k].id});
  assert.equal(JSON.stringify(d), snap, 'pure');
  assert.equal(p.lostMW, cold);
  assert.ok(cold > d.env.demandMW * d.city.districts[k].share * 1.4);
  assert.ok(p.nadirHz < F0);
  assert.ok(Math.abs(caughtSum(p.caught) - p.lostMW) <= 1, 'caught ' + caughtSum(p.caught) + ' vs ' + p.lostMW);
  assert.equal(previewTrip(s, {kind: 'unit', id: 'gta1'}).lostMW, 0, 'an offline unit');
  const t = clone(s); fleet.tripTie(t, 'test', 60, []);
  assert.equal(previewTrip(t, {kind: 'link', id: 'tie'}).lostMW, 0, 'a tripped link');
  assert.equal(previewTrip(s, {kind: 'none', id: ''}).lostMW, 0, 'fleet.largestContingency kind none');
  assert.throws(() => previewTrip(s, {kind: 'unit', id: 'coal1'}, {guardMW: 600}));
  assert.throws(() => previewTrip(s, {kind: 'meteor', id: 'x'}));
  assert.throws(() => previewTrip(s, {kind: 'unit', id: 'coal9'}));
});

test('K-10: the preview does not stop early when the battery could run dry inside the horizon', () => {
  const s = commit(opening(34), {coal1: 640, coal2: 600, ccgt1: 400, hydro1: 200}, {battery: {schedMW: 20, guardMW: 400, socMWh: 1}});
  const p = previewTrip(s, {kind: 'unit', id: 'coal1'});
  trip(s, 'coal1');
  const run = runPhysics(s, V.PREVIEW_HORIZON_S * V.TICKS_PER_S);
  assert.ok(Math.abs(run.minHz - p.nadirHz) <= 0.02, 'actual ' + run.minHz + ' preview ' + p.nadirHz);
});

test('K-15: at a UFLS-arrested nadir, caught counts the shed that turned it (the record and the preview agree)', () => {
  const s = commit(opening(3), {coal1: 650, ccgt1: 420, hydro1: 150, hydro2: 150});
  const p = previewTrip(s, {kind: 'unit', id: 'coal1'});
  assert.ok(p.uflsStages > 0 && p.caught.uflsMW > 0, 'ufls ' + p.uflsStages + ' / ' + p.caught.uflsMW);
  assert.ok(Math.abs(p.caught.inertiaMW) < 0.1 * p.lostMW, 'inertia at the nadir is small: ' + p.caught.inertiaMW);
  trip(s, 'coal1');
  runPhysics(s, V.WATCH_S * V.TICKS_PER_S);
  const rec = s.conts[s.contIdx];
  assert.equal(rec.extremeHz, p.nadirHz);
  assert.deepEqual(rec.caught, p.caught);
  assert.equal(rec.contained, false);
  assert.ok(rec.uflsStages >= p.uflsStages);
  assert.ok(Math.abs(caughtSum(rec.caught) - rec.lostMW) <= 1);
  assert.ok(Math.abs(rec.rocofHzS - (-p.lostMW * F0 / (2 * rec.ekAfterMWs))) < 1e-6 * Math.abs(rec.rocofHzS));
});

// Stage A: sim/fleet.js keeps the shared invariants (README §11 "fleet.js"): station levers
// are the sum of their 'on' machines' base points (K-1), relays and districts stay
// consistent (H-6, H-7, K-13), and contingency records carry the pre-trip readouts (K-15).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fleet from '../sim/fleet.js';
import {createState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';

const lever = (s, id) => s.stations.find(st => st.id === id).basePointMW;
const idx = fleet.unitIndex;

test('K-1: a station lever is the sum of its on machines; setBasePoint clamps to [MIN, avail] and refreshes it', () => {
  const s = createState(1, CLASSIC);
  assert.equal(lever(s, 'coal'), 2000);
  assert.equal(fleet.setBasePoint(s, idx('coal1'), 9999), 650);
  assert.equal(fleet.setBasePoint(s, idx('coal2'), 10), V.STATIONS.coal.minMW);
  assert.equal(lever(s, 'coal'), 650 + 240 + 500 + 500);
  assert.equal(s.units[idx('coal3')].basePointMW, 500, 'other machines untouched');
  assert.equal(fleet.setBasePoint(s, idx('gta1'), 300), 0, 'a unit that is not on has no base point');
  assert.deepEqual(fleet.stationRange(s, 'coal'), {onCount: 4, minMW: 4 * 240, maxMW: 4 * 650});
  assert.deepEqual(fleet.stationRange(s, 'gtb'), {onCount: 0, minMW: 0, maxMW: 0});
  s.units[idx('coal4')].mode = 'unloading';
  assert.equal(fleet.refreshLever(s, 'coal'), 650 + 240 + 500, 'only on machines count');
});

test('H-9 / K-1: a trip removes exactly the machine\'s share of the lever and opens a record with pre-trip readouts', () => {
  const s = createState(2, CLASSIC);
  s.phys.govTotalMW = 12; s.phys.loadReliefMW = 3; s.battery.outMW = 40; s.battery.ffrMW = 15;
  const out = [];
  const lost = fleet.tripUnit(s, idx('ccgt1'), 'test', 600, out);
  assert.equal(lost, 260);
  assert.equal(lever(s, 'ccgt'), 260);
  assert.equal(s.units[idx('ccgt2')].basePointMW, 260);
  assert.equal(s.conts.length, 1);
  assert.deepEqual(s.conts[0].pre, {inertiaMW: 0, batteryMW: 25, guardMW: 15, governorsMW: 12, loadReliefMW: 3, uflsMW: 0, inverterMW: 0});
  assert.deepEqual(Object.keys(s.conts[0].caught), Object.keys(s.conts[0].pre), 'caught has the same keys, inverterMW last (Phase 2a)');
  assert.ok(out.some(e => e.kind === 'contingency' && e.id === 'ccgt1'));
});

test('H-6: operateUfls darkens exactly the stage\'s two districts; rearmUfls only once both are lit', () => {
  const s = createState(3, CLASSIC);
  const ids = fleet.operateUfls(s, 0);
  assert.equal(ids.length, 2);
  assert.ok(s.ufls.operated[0]);
  const dark = s.city.districts.filter(d => d.dark);
  assert.deepEqual(dark.map(d => d.id).sort(), [...ids].sort());
  assert.ok(dark.every(d => d.shedBy === 'ufls' && d.uflsStage === 1));
  assert.ok(Math.abs(s.city.shedFrac - dark[0].share - dark[1].share) < 1e-12);
  const d0 = s.city.districts.findIndex(d => d.id === ids[0]), d1 = s.city.districts.findIndex(d => d.id === ids[1]);
  fleet.setDistrictDark(s, d0, false, null);
  assert.equal(fleet.rearmUfls(s, 0), false, 'one district still dark');
  fleet.setDistrictDark(s, d1, false, null);
  assert.equal(fleet.rearmUfls(s, 0), true);
  assert.equal(s.ufls.operated[0], false);
  assert.equal(s.city.shedFrac, 0);
});

test('H-7: setOfgsStage keeps trippedFrac = tripped stages x OFGS_STAGE_FRAC', () => {
  const s = createState(3, CLASSIC);
  fleet.setOfgsStage(s, 0, true); fleet.setOfgsStage(s, 2, true);
  assert.equal(s.ofgs.trippedFrac, 2 * V.OFGS_STAGE_FRAC);
  fleet.setOfgsStage(s, 0, false);
  assert.equal(s.ofgs.trippedFrac, V.OFGS_STAGE_FRAC);
});

test('K-13: district cold-load MW is demand x share, x1.5 once dark for more than 10 grid-minutes', () => {
  const s = createState(4, CLASSIC);
  const d = s.city.districts.findIndex(x => x.rot === 0), share = s.city.districts[d].share;
  assert.equal(fleet.districtColdLoadMW(s, d), s.env.demandMW * share);
  s.tick = 100 * V.TICKS_PER_S;
  fleet.setDistrictDark(s, d, true, 'directed');
  s.tick += V.COLD_LOAD_AFTER_S * V.TICKS_PER_S;
  assert.equal(fleet.districtColdLoadMW(s, d), s.env.demandMW * share, 'exactly 10 min: no pickup yet');
  s.tick += V.TICKS_PER_S;
  assert.equal(fleet.districtColdLoadMW(s, d), s.env.demandMW * share * V.COLD_LOAD_FACTOR);
});

test('acc: newAcc / resetAcc give zeroed accumulators of the fixed shape', () => {
  const a = fleet.newAcc();
  assert.equal(a.unitMWs.length, V.MACHINES.length);
  a.unitMWs[3] = 9; a.ticks = 50; a.shedMWs = 4; a.startCost = 8000; a.fMinHz = 49.1;
  const same = fleet.resetAcc(a);
  assert.equal(same, a, 'in place');
  assert.deepEqual(a, fleet.newAcc());
});

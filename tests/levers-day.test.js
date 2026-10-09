// U-2, U-3, U-6, Q-50 (desk/README.md §31.3.4, §31.5, §31.9.2): the city levers in the sim, part 2:
// the flex on the grid. I1 (P-1 with flex), I2 (unserved on G0), I3 (a dark district's flex share
// stops; the restore and UFLS records carry it), I3b (previews leave no trace), I5 (the forecast
// columns), cost.flex on lit relief only, the night fall, a soak shrinking the dispatch's cut on a
// mild noon and clearing an MSL1 notice at the next check, and nothing allocated per tick.
// States are poked (blocks pushed into state.levers.blocks, the clock set, env sampled) or come
// from ONE par morning shared by the tests that need a balanced grid (CLAUDE.md budget).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getHeapSpaceStatistics} from 'node:v8';
import {createState, step, applyInput, observe, hashState} from '../sim/step.js';
import {sampleSecond, flexAt} from '../sim/weather.js';
import {runPar} from '../sim/autopilot.js';
import * as fleet from '../sim/fleet.js';
import * as grid from '../sim/grid.js';
import * as market from '../sim/market.js';
import * as physics from '../sim/physics.js';
import {V} from '../sim/params.js';
import {DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {commit, supplyMW, clone} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S, DT = V.PHYS_DT, F0 = V.F0_HZ;
const at = (h, m = 0) => (h - V.DAY_START_H) * 3600 + m * 60;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a + ' vs ' + b + ' (+-' + tol + ')');
const soak = (suburb, atS, effMW) => ({suburb, lever: 'soak', atS, endS: atS + V.SOAK_S, effMW, cost: 0});
const air = (suburb, atS, effMW) => ({suburb, lever: 'aircon', atS, endS: atS + V.AIRCON_S, effMW, cost: V.PATIENCE_AIRCON});
const SUBS = DESK.city.suburbs.map(x => x.id);
const idxOf = (s, id) => s.city.districts.findIndex(d => d.id === id);
const share = (s, id) => { const d = s.city.districts[idxOf(s, id)]; return s.env.flexSubMW[d.sub] * d.roofFrac; }; // a district's flex share
const caughtSum = c => c.inertiaMW + c.batteryMW + c.guardMW + c.governorsMW + c.loadReliefMW + c.uflsMW + c.inverterMW;

/** DESK seed 2 (HOT) at hh:mm with `blocks` pushed (sorted) and env sampled: a test poke. */
function poked(blocks, h, m = 0, seed = 2) {
  const s = createState(seed, DESK);
  for (const b of blocks) s.levers.blocks.push(b);
  s.levers.blocks.sort((a, b) => a.atS - b.atS || SUBS.indexOf(a.suburb) - SUBS.indexOf(b.suburb));
  s.tick = at(h, m) * TPS;
  sampleSecond(s);
  fleet.refreshRoof(s);
  return s;
}

/** Poke env.demandMW so the present schedules balance at 50 Hz, dark districts, rooftop and flex included (README §5 phys). */
function rebalance(s) {
  const e = s.env, c = s.city;
  const g0 = (supplyMW(s) + s.dr.mw - c.coldLoadMW + (e.rooftopMW - c.roofOffMW) - (e.flexMW - c.flexDarkMW)) / (1 - c.shedFrac);
  e.demandMW = g0 - e.rooftopMW + e.flexMW;
  s.phys.fHz = F0;
  s.phys.fHist.fill(F0);
  return s;
}

/** n grid seconds by hand in step()'s order WITHOUT weather.sampleSecond (the poked env holds). */
function seconds(s, n) {
  const out = [];
  for (let i = 0; i < n && !s.black; i++) {
    if (s.acc.ticks > 0) market.settleSecond(s, out);
    grid.unitsSecond(s, out); grid.agcSecond(s, out); grid.dispatchSecond(s, out); grid.fosSecond(s, out);
    grid.securitySecond(s, out); market.priceSecond(s, out);
    for (let k = 0; k < TPS && !s.black; k++) { physics.tick(s, out); s.tick++; }
  }
  return out;
}

// A sunny 12:30 on a HOT day with a soak core in three suburbs and (poked) an air-con core in Tallowood.
const NOON = [soak('HAZ', at(10, 30), 140), soak('RED', at(10), 110), soak('SAL', at(10, 15), 60), air('TAL', at(12), 15)];

test('I1 / I5: env.demandMW = underlyingMW + flexMW - rooftopMW - smelterGap every second; flexMW, flexSubMW and reliefSubMW are flexAt; the forecast columns carry the booked flex at fromS + (k + 1) stepS', () => {
  const blocks = [soak('HAZ', at(10, 30), 140), soak('SOL', at(10), 60), air('TAL', at(19, 30), 13.5), air('HAR', at(17), 40)];
  const s = poked(blocks, 4, 30), B = s.levers.blocks, e = s.env;
  let seen = 0;
  for (let sec = at(9); sec < V.DAY_S; sec += 97) {
    s.tick = sec * TPS;
    sampleSecond(s);
    assert.ok(Object.is(e.demandMW, e.underlyingMW + e.flexMW - e.rooftopMW - (V.SMELTER_MW - s.smelter.loadMW)), 'P-1 at ' + sec);
    assert.ok(Object.is(e.flexMW, flexAt(B, sec)));
    SUBS.forEach((id, j) => {
      assert.ok(Object.is(e.flexSubMW[j], flexAt(B, sec, id)), id);
      assert.ok(Object.is(e.reliefSubMW[j], 0 - flexAt(B, sec, id, 'core', 'aircon')) && e.reliefSubMW[j] >= 0 && !Object.is(e.reliefSubMW[j], -0), id + ' relief');
    });
    if (e.flexMW !== 0) seen++;
  }
  assert.ok(seen > 300, 'flex flowed on ' + seen + ' samples');
  s.tick = at(20) * TPS;
  sampleSecond(s);
  near(e.reliefSubMW[4], 13.5, 1e-9, 'TAL relieved in full at 20:00');
  near(e.flexSubMW[3], flexAt(B, at(20), 'HAR', 'snapback'), 1e-9, 'HAR\'s snapback is over by 20:00');
  assert.equal(e.flexSubMW[3], 0);
  const o = observe(s, {dayAhead: true});
  assert.equal(o.demand.flexMW, e.flexMW);
  assert.equal(o.demand.nowMW, o.demand.underlyingMW + o.demand.flexMW - o.demand.rooftopMW - (V.SMELTER_MW - o.smelter.loadMW));
  for (const t of [at(9), at(17)]) {
    s.tick = t * TPS;
    sampleSecond(s);
    const q = observe(s, {dayAhead: true});
    for (const fc of [q.forecast, q.dayAhead]) {
      assert.ok(fc.flexMW.some(x => x !== 0));
      fc.flexMW.forEach((x, k) => {
        assert.equal(x, flexAt(B, fc.fromS + (k + 1) * fc.stepS), 'column ' + k);
        near(fc.underlyingP50[k] + x - fc.rooftopMW[k], fc.demandP50[k], 1e-9, 'P50 carries the flex, underlying does not');
      });
    }
  }
});

test('I2 / I3: a dark district\'s flex share stops (city.flexDarkMW) and is never unserved; lit demand, the cold load and the relay MW carry it', () => {
  const s = poked(NOON, 12, 30);
  commit(s, {coal1: 500, coal2: 500, coal3: 500, coal4: 500, ccgt1: 400}, {tieMW: -300});
  rebalance(s);
  seconds(s, 2);
  const e = s.env, c = s.city, served0 = s.phys.servedMW;
  assert.ok(e.flexMW > 290 && e.reliefSubMW[4] === 15, 'soaks and a cycle under way: ' + e.flexMW);
  // HAZ1 goes dark: its 28 MW of soak stops with its customers' load; nothing of it is unserved.
  const d = idxOf(s, 'HAZ1'), dist = c.districts[d], g0 = fleet.baseLoadMW(s);
  const net = fleet.districtColdLoadMW(s, d);
  near(net, g0 * dist.share + 28 - e.roofSubMW[dist.sub] * dist.roofFrac, 1e-9, 'a lit district\'s net load carries its flex share');
  fleet.setDistrictDark(s, d, true, 'directed');
  assert.equal(c.flexDarkMW, 28);
  physics.tick(s, []); s.tick++;
  near(served0 - s.phys.servedMW, net, 1e-6, 'served falls by its net load, flex share included');
  // Every district of each suburb: lit demand is the lit districts' net load plus env.flexMW - flexDarkMW.
  for (const id of ['TAL3', 'SOL3']) fleet.setDistrictDark(s, idxOf(s, id), true, 'directed');
  const sec = Math.floor(s.tick / TPS);
  let lit = 0, fd = 0;
  for (const x of c.districts) {
    const fs = e.flexSubMW[x.sub] * x.roofFrac;
    if (x.dark) fd += fs;
    else lit += g0 * x.share + fs - e.roofSubMW[x.sub] * x.roofFrac * (x.reconnectS < 0 || sec >= x.reconnectS + V.ROOF_RAMP_S ? 1 : 0);
  }
  near(c.flexDarkMW, fd, 1e-9);
  near(c.flexDarkMW, 28 + share(s, 'TAL3') + share(s, 'SOL3'), 1e-9, 'TAL3\'s relief share is negative');
  near(fleet.litDemandMW(s), lit, 1e-6, 'lit demand');
  const acc0 = s.acc.unservedMWs;
  physics.tick(s, []); s.tick++;
  assert.ok(Object.is(s.acc.unservedMWs, acc0 + fleet.baseLoadMW(s) * c.shedFrac * DT), 'S-1: unserved is G0 x shedFrac');
  near(s.phys.shedMW, g0 * c.shedFrac + c.flexDarkMW - c.roofDarkMW, 1e-9, 'the relay MW: net load and flex share');
  near(observe(s).demand.unservedMW, g0 * c.shedFrac, 1e-9);
  // Dark districts' cold load carries the flex share too, and observe shows the same number.
  const o = observe(s);
  for (const id of ['HAZ1', 'TAL3']) {
    const x = c.districts[idxOf(s, id)];
    near(fleet.districtColdLoadMW(s, idxOf(s, id)), g0 * x.share + share(s, id), 1e-9, id);
    assert.equal(o.districts[idxOf(s, id)].coldLoadMW, fleet.districtColdLoadMW(s, idxOf(s, id)));
  }
});

test('I3: the restore picks up the whole cold load, flex share included (the surge is the cold factor alone); a UFLS record adds the stage\'s flex share; the night fall follows the booked energy, also for a district dark through the soak', () => {
  const s = poked(NOON, 12, 30);
  commit(s, {coal1: 500, coal2: 500, coal3: 500, coal4: 500, ccgt1: 400}, {tieMW: -300});
  const d = idxOf(s, 'HAZ4'), dist = s.city.districts[d];
  fleet.setDistrictDark(s, d, true, 'directed');
  s.tick += (V.COLD_LOAD_AFTER_S + 60) * TPS;
  rebalance(s);
  seconds(s, 2);
  const g0 = fleet.baseLoadMW(s), cold = g0 * dist.share * V.COLD_LOAD_FACTOR + 28;
  near(fleet.districtColdLoadMW(s, d), cold, 1e-9, 'its cold load: the cold factor on its customers, plus its 28-MW soak share');
  const p = physics.previewTrip(s, {kind: 'district', id: 'HAZ4'});
  near(p.lostMW, cold, 1e-9, 'the restore preview\'s pickup');
  near(caughtSum(p.caught), p.lostMW, 1, 'caught sums to it');
  assert.equal(grid.restorePermissive(s, d), '');
  const served0 = s.phys.servedMW, out = [];
  assert.equal(grid.applyCommand(s, {type: 'restore', district: 'HAZ4'}, out), '');
  near(out.find(r => r.kind === 'restore').mw, cold, 1e-9, 'the restore record');
  near(dist.surgeMW, g0 * dist.share * (V.COLD_LOAD_FACTOR - 1), 1e-9, 'the surge: the cold factor alone');
  seconds(s, 1);
  near(s.phys.servedMW - served0, cold, 1, 'the grid sees the whole pickup');
  // UFLS stage 1 (RED1, SAL1): its record is the stage's net load with its flex shares, the fall of servedMW.
  const fd0 = s.city.flexDarkMW, sv = s.phys.servedMW, recs = [];
  for (let k = 0; k < 20 && !recs.length; k++) {
    s.phys.fHz = 48.95;
    physics.tick(s, recs);
    s.tick++;
  }
  const u = recs.find(r => r.kind === 'ufls');
  assert.ok(u && u.stage === 1, 'stage 1 operated');
  near(s.city.flexDarkMW - fd0, share(s, 'RED1') + share(s, 'SAL1'), 1e-9);
  near(u.mw, sv - s.phys.servedMW, 1e-6, 'the record is the fall of servedMW');
  near(u.mw - (fleet.baseLoadMW(s) * (s.city.districts[idxOf(s, 'RED1')].share + s.city.districts[idxOf(s, 'SAL1')].share)),
    110 / 7 + 60 / 6 - (s.env.roofSubMW[2] / 7 + s.env.roofSubMW[5] / 6), 1e-6, 'RED1 and SAL1 carry 110/7 and 60/6 MW of soak');
  // The night fall: HAZ1 dark from 10:00 to 15:00 (through its soak), relit; at 23:00 Hazelton's heating
  // falls by the BOOKED energy (simplified: districts dark during the soak are ignored, P10).
  const n = poked([soak('HAZ', at(10, 30), 140)], 10);
  fleet.setDistrictDark(n, idxOf(n, 'HAZ1'), true, 'directed');
  n.tick = at(12) * TPS; sampleSecond(n); fleet.refreshRoof(n);
  assert.deepEqual([n.env.flexSubMW[1], n.city.flexDarkMW], [140, 28], 'its share stops while dark');
  n.tick = at(15) * TPS; fleet.setDistrictDark(n, idxOf(n, 'HAZ1'), false, null);
  n.tick = at(23) * TPS; sampleSecond(n); fleet.refreshRoof(n);
  const D = 140 * (V.SOAK_S - V.FLEX_RAMP_S) / (V.SOAK_NIGHT_TO_S - V.SOAK_NIGHT_FROM_S - V.FLEX_RAMP_S);
  near(n.env.flexSubMW[1], -D, 1e-9, 'the whole booked energy comes off the night');
  assert.equal(n.city.flexDarkMW, 0);
  fleet.setDistrictDark(n, idxOf(n, 'HAZ2'), true, 'directed');
  near(n.city.flexDarkMW, -D / 5, 1e-9, 'a district dark at night stops its share of the fall too');
});

test('I3b: with a soak core and an air-con core under way and a district of each suburb dark (one relit and waiting), every preview kind, a preview that operates UFLS and the restore permissive leave the state exactly as it was', () => {
  const s = poked(NOON, 12, 30);
  commit(s, {coal1: 500, coal2: 500, coal3: 500, coal4: 500, ccgt1: 400}, {tieMW: -300, battery: {socMWh: V.BATT_MWH / 2}});
  for (const id of ['SOL3', 'HAZ4', 'RED5', 'HAR3', 'TAL3', 'SAL4']) fleet.setDistrictDark(s, idxOf(s, id), true, 'directed');
  s.tick += 90 * TPS;
  fleet.setDistrictDark(s, idxOf(s, 'SAL4'), false, null); // relit: its rooftop is waiting
  s.tick += 3 * TPS;
  rebalance(s);
  seconds(s, 1);
  assert.ok(s.city.flexDarkMW > 40 && s.env.reliefSubMW[4] === 15 && s.city.districts[idxOf(s, 'SAL4')].reconnectS > 0, 'the state');
  const before = hashState(s), snap = JSON.stringify(s);
  const kinds = [[{kind: 'unit', id: 'coal1'}], [{kind: 'link', id: 'tie'}], [{kind: 'load', id: 'smelter', mw: V.SMELTER_MW}],
    [{kind: 'district', id: 'HAZ4'}], [{kind: 'district', id: 'TAL3'}], [{kind: 'none', id: ''}], [{kind: 'unit', id: 'ccgt1'}, {guardMW: 200}],
    [{kind: 'district', id: 'HAZ4'}, {guardMW: 300}]];
  for (const [target, opts] of kinds) {
    const p = physics.previewTrip(s, target, opts);
    assert.equal(hashState(s), before, target.kind + ' ' + target.id + ': previewTrip wrote to state');
    assert.equal(JSON.stringify(s), snap, target.kind + ' ' + target.id);
    // caught sums to the MW lost, less a tripped unit's own governor output before the trip (README §5 conts)
    const gov = target.kind === 'unit' ? s.units[fleet.unitIndex(target.id)].govMW : 0;
    near(caughtSum(p.caught), p.lostMW - gov, 1, target.kind + ' ' + target.id + ': caught sums to the MW lost');
  }
  for (const id of ['HAZ4', 'TAL3']) {
    s.city.lastRestoreS = -V.DAY_S;
    const h = hashState(s);
    grid.restorePermissive(s, idxOf(s, id), {preview: true});
    assert.equal(hashState(s), h, id + ': the restore permissive\'s preview');
  }
  // A preview that operates UFLS darkens districts through fleet (and flexDarkMW with them): restored too.
  const weak = commit(clone(s), {coal1: 650, coal2: 650}, {tieMW: 0});
  rebalance(weak);
  const h = hashState(weak), j = JSON.stringify(weak);
  const p = physics.previewTrip(weak, {kind: 'unit', id: 'coal1'});
  assert.ok(p.uflsStages > 0, 'the weak island sheds in the preview');
  assert.equal(hashState(weak), h);
  assert.equal(JSON.stringify(weak), j);
});

test('U-6 / §31.3.12: cost.flex pays AIRCON_PRICE per MWh of relief delivered on the lit districts only; the soak and the pre-cool and snapback are not paid', () => {
  const s = poked([air('TAL', at(19, 30), 13.5), air('HAR', at(19, 30), 40), soak('HAZ', at(10, 30), 140)], 19, 45);
  fleet.setDistrictDark(s, idxOf(s, 'TAL3'), true, 'directed');
  fleet.setDistrictDark(s, idxOf(s, 'HAR3'), true, 'directed');
  const settle = () => { const c0 = s.score.cost.flex; s.acc.ticks = TPS; market.settleSecond(s, []); return s.score.cost.flex - c0; };
  near(settle(), (13.5 * 4 / 5 + 40 * 3 / 4) / 3600 * V.AIRCON_PRICE, 1e-12, 'one second of relief, lit share only');
  s.tick = at(19, 15) * TPS; sampleSecond(s);
  assert.ok(s.env.flexMW > 0, 'pre-cool is load');
  assert.equal(settle(), 0, 'pre-cool is not paid');
  s.tick = at(12) * TPS; sampleSecond(s);
  assert.equal(settle(), 0, 'the soak is not paid (SOAK_PRICE 0)');
  assert.ok(V.DR_PRICE > V.AIRCON_PRICE && V.AIRCON_PRICE > V.SOAK_PRICE, 'Q-55 ladder');
});

// ONE par morning on a mild weekend (DESK_WEEKEND seed 8, 10:30), shared by the tests below as JSON copies.
let MORNING = null;
const morning = () => {
  if (!MORNING) MORNING = JSON.stringify(runPar(8, DESK_WEEKEND, {untilTick: at(10, 30) * TPS + 1}).state);
  return JSON.parse(MORNING);
};
const go = (s, t, each) => { while (!s.over && s.tick < t) { const ev = step(s); if (each) each(s, ev); } return s; };

test('§28 blue row / Q-50: soaks booked at 10:35 on a mild weekend shrink the dispatch\'s cut at noon (wind.autoMW + solar.autoMW) by their MW; P-1 holds each grid second', () => {
  const a = morning(), b = morning();
  assert.deepEqual(a.day, {temp: 'MILD', weekend: true});
  for (const id of ['HAZ', 'RED', 'TAL']) assert.equal(applyInput(b, {type: 'flex', suburb: id, lever: 'soak', atS: at(10, 35)}).reason, '', id);
  go(a, at(12) * TPS);
  let worst = 0;
  go(b, at(12) * TPS, s => {
    if (s.tick % TPS !== 1) return;
    const e = s.env;
    worst = Math.max(worst, Math.abs(e.demandMW - (e.underlyingMW + e.flexMW - e.rooftopMW - (V.SMELTER_MW - s.smelter.loadMW))));
  });
  assert.equal(worst, 0, 'P-1 with flex, through step()');
  const cut = s => { const o = observe(s); return o.wind.autoMW + o.solar.autoMW; };
  assert.ok(cut(a) > 500, 'the cut without a soak: ' + cut(a).toFixed(0));
  assert.equal(b.env.flexMW, 340);
  near(cut(a) - cut(b), 340, 5, 'the soaks take 340 MW of the spill');
  assert.ok(!a.black && !b.black && a.conts.length === 0 && b.conts.length === 0);
});

test('P-4 / P11: a tie outage raises an MSL1 notice; two soaks raise the forecast minimum by their MW, and the notice clears at the next 5-minute check, not before', () => {
  const s = morning(), recs = [];
  const msl = (st, ev) => { for (const e of ev) if (e.kind === 'log' && /^MSL/.test(e.code)) recs.push(e); };
  fleet.tripTie(s, 'test', 3 * 3600, recs);
  go(s, (Math.floor(s.tick / TPS / V.MSL_CHECK_S) + 1) * V.MSL_CHECK_S * TPS + 1, msl);
  assert.deepEqual(recs.filter(e => e.code).map(e => e.code), ['LINK_TRIP', 'MSL1'], 'the notice at the next check');
  go(s, s.conts[s.contIdx].watchEndTick, msl); // the desk is locked through the watch
  const min = o => Math.min(...o.forecast.demandP50);
  const o0 = observe(s), t = Math.ceil(o0.s / V.FC_STEP_S) * V.FC_STEP_S;
  assert.equal(o0.msl.level, 1);
  for (const id of ['HAZ', 'SOL']) assert.equal(applyInput(s, {type: 'flex', suburb: id, lever: 'soak', atS: t}).reason, '', id);
  const o1 = observe(s);
  near(min(o1) - min(o0), 200, 1e-6, 'the forecast minimum rises by 140 + 60 MW');
  assert.ok(min(o1) > V.MSL1_MW + V.MSL_TIE_OUT_MW + V.MSL_CLEAR_MW, 'enough to clear (tie out: MSL1 is 1,900 MW)');
  recs.length = 0;
  go(s, s.tick + TPS, msl);
  assert.equal(s.msl.level, 1, 'not the next frame');
  go(s, (Math.floor(s.tick / TPS / V.MSL_CHECK_S) + 1) * V.MSL_CHECK_S * TPS + 1, msl);
  assert.deepEqual(recs.map(e => e.code), ['MSL_CLEAR']);
  assert.equal(s.msl.level, 0);
});

test('README §2 rule 6 (2b): physics.tick allocates nothing with flex flowing and a district dark; flexAt allocates nothing', () => {
  const s = poked(NOON, 12, 30);
  commit(s, {coal1: 500, coal2: 500, coal3: 500, coal4: 500, ccgt1: 400}, {tieMW: -300});
  fleet.setDistrictDark(s, idxOf(s, 'HAZ4'), true, 'directed');
  rebalance(s);
  const used = () => getHeapSpaceStatistics().find(x => x.space_name === 'new_space').space_used_size;
  const out = [], B = s.levers.blocks, sink = new Float64Array(1);
  const ticks = n => { for (let k = 0; k < n; k++) { physics.tick(s, out); s.tick++; } };
  const calls = n => { let x = 0; for (let k = 0; k < n; k++) x += flexAt(B, at(12, 30) + k, k & 1 ? '' : 'TAL', '', ''); sink[0] = x; };
  // The median chunk is judged (a source allocation shows in every chunk at >= 16 B; the probe itself
  // costs a few B a call over 2,000), as tests/belly.test.js does.
  for (const [what, pass] of [['physics.tick', ticks], ['flexAt', calls]]) {
    pass(20000); // warm
    const per = [];
    for (let c = 0; c < 20; c++) {
      const a = used();
      pass(2000);
      const d = used() - a;
      if (d >= 0) per.push(d / 2000);
    }
    per.sort((p, q) => p - q);
    assert.ok(per.length >= 10 && per[per.length >> 1] < 8, what + ' allocates ' + per[per.length >> 1] + ' B a call (median)');
  }
  assert.equal(out.length, 0);
  assert.ok(s.city.flexDarkMW === 28 && s.env.flexMW > 290);
});

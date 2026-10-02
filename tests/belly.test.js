// Phase 2a wave 1, owner "grid": the belly in sim/fleet.js, sim/physics.js, sim/grid.js and
// sim/market.js (desk/README.md §21.2): P-12 / C-8 (UFLS and restore on net load, unserved energy on
// the underlying load, inverters reconnecting), C-6 (the dispatch curtails wind and utility solar in
// a surplus) and C-7 (the inverters' over-frequency response).
//
// These tests drive the grid second BY HAND in step.js's order (settleSecond, unitsSecond,
// agcSecond, dispatchSecond, fosSecond, securitySecond, priceSecond, then 50 physics ticks),
// WITHOUT weather.sampleSecond and never through step(), so the poked env (demandMW, rooftopMW,
// roofSubMW, windAvailMW, solarAvailMW, exportLimitMW) holds (desk/README.md §20). A poke of
// roofSubMW keeps rooftopMW equal to its sum and is followed by fleet.refreshRoof.
//
// The C-7 cases need REN_PFR_ON and ROOF_FW_ON (V is frozen, so one run has one setting): they
// are skipped while the flags are off (the grid job's first commit) and run once they are on.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getHeapSpaceStatistics} from 'node:v8';
import * as grid from '../sim/grid.js';
import * as market from '../sim/market.js';
import * as physics from '../sim/physics.js';
import * as fleet from '../sim/fleet.js';
import {createState, hashState} from '../sim/step.js';
import {tableLinear} from '../sim/weather.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK} from '../content/scenarios.js';
import {commit, supplyMW, ticksAt, clone, TPS} from './lib/sim-helpers.js';

const F0 = V.F0_HZ, DT = V.PHYS_DT;
const C7 = V.REN_PFR_ON && V.ROOF_FW_ON;
const needsC7 = () => ({skip: C7 ? false : 'REN_PFR_ON / ROOF_FW_ON are off (the flags-off commit)'});
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b + ' (+-' + tol + ')');

// The game's rooftop (DESK: 5,000 MW, clear-sky factor 0.70, the P-2 shape), poked onto a classic
// state: with every suburb clear, suburb j gives capacity x share[j] x clearFactor x shape(h).
const ROOF = DESK.rooftop;
const roofAt = h => ROOF.share.map(sh => ROOF.capacityMW * sh * ROOF.clearFactor * tableLinear(ROOF.shapePm, h) / V.PER_MILLE);
const NO_ROOF = ROOF.share.map(() => 0);

// The belly's minimum fleet: four coal and two CCGT machines at MIN (1,310 MW of must-run), and
// the same fleet on a stale plan, 300 MW above MIN.
const AT_MIN = {coal1: 240, coal2: 240, coal3: 240, coal4: 240, ccgt1: 175, ccgt2: 175};
const MUST_RUN_MW = 1310, NOON_WIND_MW = 400, NOON_SOLAR_MW = 700;

/**
 * A poked noon (test pokes only): hour h (default 12:30), `units` on line at the given MW (default
 * the fleet at MIN), 400 MW of wind and 700 MW of utility solar available, the tie at tieMW (default
 * the 300-MW midday export cap), the battery as given (default idle and FULL), rooftop as roofSubMW
 * (default none), balanced at 50 Hz by setting env.demandMW (the OPERATIONAL demand: 2,110 MW for
 * the defaults).
 */
function noon(o = {}) {
  const s = createState(o.seed || 1, CLASSIC);
  const h = o.h === undefined ? 12.5 : o.h, env = s.env;
  s.tick = ticksAt(h);
  env.s = s.tick / TPS; env.h = h;
  env.exportLimitMW = V.TIE_EXPORT_CAP_MW;
  env.windAvailMW = o.windMW === undefined ? NOON_WIND_MW : o.windMW;
  env.solarAvailMW = o.solarMW === undefined ? NOON_SOLAR_MW : o.solarMW;
  s.ren.windMW = env.windAvailMW; s.ren.solarMW = env.solarAvailMW;
  pokeRoof(s, o.roofSubMW || NO_ROOF);
  Object.assign(s.battery, {mode: 'idle', orderMW: 0, schedMW: 0, outMW: 0, agcTrimMW: 0, socMWh: V.BATT_MWH}, o.battery);
  if (o.mode) s.control.mode = o.mode;
  commit(s, o.units || AT_MIN, {tieMW: o.tieMW === undefined ? -V.TIE_EXPORT_CAP_MW : o.tieMW});
  s.last.fMeanHz = s.last.fMinHz = s.last.fMaxHz = F0;
  return s;
}

/** Poke the rooftop: per-suburb MW (as if every inverter were connected), their sum, then the roof refresh. */
function pokeRoof(s, roofSubMW) {
  let sum = 0;
  for (let j = 0; j < roofSubMW.length; j++) { s.env.roofSubMW[j] = roofSubMW[j]; sum += roofSubMW[j]; }
  s.env.rooftopMW = sum;
  fleet.refreshRoof(s);
}

/** Poke the operational demand that balances the present schedules at 50 Hz, dark districts and rooftop included. */
function rebalance(s) {
  const env = s.env, city = s.city;
  env.demandMW = (supplyMW(s) + s.dr.mw - city.coldLoadMW + (env.rooftopMW - city.roofOffMW)) / (1 - city.shedFrac) - env.rooftopMW;
  s.phys.fHz = F0;
  s.phys.fHist.fill(F0);
  return s;
}

/**
 * n grid seconds by hand in step.js's order, without weather.sampleSecond (the poked env holds).
 * before(s, i, out) runs first in each second (demand ramps, trips, orders); eachTick(s) after
 * every physics tick. Returns the extremes of frequency over every tick, the largest |AGC
 * request| and automatic cut seen at a second's end, the seconds AGC had an unmet lowering
 * request, the K-11 identity's worst residual and the event records.
 */
function run(s, n, before, eachTick) {
  const out = [];
  let fMin = Infinity, fMax = -Infinity, reqMax = 0, cutMax = 0, residual = 0, limitS = 0;
  for (let i = 0; i < n && !s.black; i++) {
    if (s.acc.ticks > 0) market.settleSecond(s, out);
    if (before) before(s, i, out);
    grid.unitsSecond(s, out);
    grid.agcSecond(s, out);
    grid.dispatchSecond(s, out);
    grid.fosSecond(s, out);
    grid.securitySecond(s, out);
    market.priceSecond(s, out);
    for (let k = 0; k < TPS && !s.black; k++) {
      physics.tick(s, out);
      s.tick++;
      const f = s.phys.fHz;
      if (f < fMin) fMin = f;
      if (f > fMax) fMax = f;
      residual = Math.max(residual, Math.abs(identity(s)));
      if (eachTick) eachTick(s);
    }
    reqMax = Math.max(reqMax, Math.abs(s.agc.requestMW));
    cutMax = Math.max(cutMax, autoMW(s));
    if (s.agc.unmetMW < 0) limitS++;
  }
  return {out, fMin, fMax, reqMax, cutMax, residual, limitS, ofgs: out.filter(e => e.kind === 'ofgs').length, ufls: out.filter(e => e.kind === 'ufls')};
}

/** `ticks` physics ticks with the frequency held at hz before each one (schedules frozen, no grid seconds). */
function hold(s, ticks, hz) {
  const out = [];
  for (let k = 0; k < ticks; k++) { s.phys.fHz = hz; physics.tick(s, out); s.tick++; }
  return out;
}

/** The K-11 identity's left side (desk/README.md §19.2): 0 within rounding on every tick. */
function identity(s) {
  const p = s.phys, b = s.battery;
  return (p.schedSupplyMW - p.servedMW) + p.inertiaMW + p.govTotalMW + b.pfrMW + b.ffrMW + p.loadReliefMW - p.renPfrMW - p.roofPfrMW;
}

const autoMW = s => s.ren.windAutoMW + s.ren.solarAutoMW;
const caughtSum = c => c.inertiaMW + c.batteryMW + c.guardMW + c.governorsMW + c.loadReliefMW + c.uflsMW + c.inverterMW;
const district = (s, id) => s.city.districts.findIndex(d => d.id === id);
const totalMW = s => s.env.demandMW + s.env.rooftopMW; // G, the total before rooftop
/** A district's net load, computed here from the scenario's arithmetic (not through the sim's function). */
const netMW = (s, id) => { const d = s.city.districts[district(s, id)]; return totalMW(s) * d.share - s.env.roofSubMW[d.sub] * d.roofFrac; };
/** Operational demand moving toward `to` at `rate` MW per grid second (a before() for run). */
const ramp = (rate, to) => s => { s.env.demandMW = rate < 0 ? Math.max(to, s.env.demandMW + rate) : Math.min(to, s.env.demandMW + rate); };
const aboveMinMW = s => s.units.reduce((a, u) => a + (u.sync ? u.schedMW - V.MACHINES[u.k].minMW : 0), 0);
const inBand = r => r.fMin >= V.NORMAL_LO_HZ && r.fMax <= V.NORMAL_HI_HZ;
const hz = r => r.fMin.toFixed(3) + '..' + r.fMax.toFixed(3) + ' Hz';

// The contract's arithmetic written out here, never through the sim's own functions, so a test
// that compares the two fails when a term goes missing (desk/README.md §18 C-6, §19.2).
/** A district's rooftop off fraction at grid second sec: dark 1; nothing pending 0; waiting 1; then the ramp. */
const offFrac = (d, sec) => (d.dark ? 1 : d.reconnectS < 0 ? 0 : sec < d.reconnectS ? 1 : Math.max(0, 1 - (sec - d.reconnectS) / V.ROOF_RAMP_S));
/** Lit operational demand: every lit district's underlying load less the rooftop it has connected now. */
function litMW(s) {
  const sec = Math.floor(s.tick / TPS);
  let sum = 0;
  for (const d of s.city.districts) if (!d.dark) sum += totalMW(s) * d.share - s.env.roofSubMW[d.sub] * d.roofFrac * (1 - offFrac(d, sec));
  return sum;
}
/**
 * The C-6 surplus: must-run (MIN of every unit 'on', the present output of any other synchronised
 * unit, reserve diesel on line) + wind after the LIMIT and OFGS + solar after the LIMIT - (lit
 * operational demand + cold load - DR - tie flow). For a battery with no order (idle or full).
 */
function surplusWant(s) {
  let floor = s.rert.outMW;
  for (const u of s.units) if (u.mode === 'on') floor += V.MACHINES[u.k].minMW; else if (u.sync) floor += u.schedMW;
  const ren = (s.env.windAvailMW - s.ren.windCurtMW) * (1 - s.ofgs.trippedFrac) + (s.env.solarAvailMW - s.ren.solarCurtMW);
  return floor + ren - (litMW(s) + s.city.coldLoadMW - s.dr.mw - s.tie.flowMW);
}
/** The automatic cut as output MW: wind's part is stored before OFGS. */
const cutOutMW = s => s.ren.windAutoMW * (1 - s.ofgs.trippedFrac) + s.ren.solarAutoMW;
/** The belly fleet x MW above MIN in total, spread evenly over its six units. */
const aboveMin = x => Object.fromEntries(Object.entries(AT_MIN).map(([id, mw]) => [id, mw + x / 6]));

/** The curtailing state of the C-6 accept: the 2,110-MW noon after demand has fallen to 1,600 MW (510 MW held back). */
function curtailing(o) {
  const s = noon(o);
  run(s, 2040 + 60, ramp(-0.25, 1600));
  return s;
}

/** Every leaf of a plain JSON value; fails on -0 or a non-finite number (sim/README.md §2 rule 4). */
function assertPlain(x, path = 'state') {
  if (typeof x === 'number') {
    assert.ok(Number.isFinite(x), path + ' is ' + x);
    assert.ok(!Object.is(x, -0), path + ' is -0');
  } else if (Array.isArray(x)) x.forEach((y, i) => assertPlain(y, path + '[' + i + ']'));
  else if (x !== null && typeof x === 'object') for (const k of Object.keys(x)) assertPlain(x[k], path + '.' + k);
}

// ------------------------------------------------------------------ C-1: the classic day is the anchor

test('C-1: with rooftop zero every §19.2 formula is the pre-2a expression, bit for bit', () => {
  let x = 20261002;
  const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); // a private LCG, never the sim's streams
  const s = noon();
  for (let n = 0; n < 2000; n++) {
    // test pokes: any demand, dark share, cold-load surge, DR and frequency (above the first UFLS stage)
    s.env.demandMW = 1500 + 7000 * r();
    s.city.shedFrac = r() < 0.3 ? 0 : 0.6 * r();
    s.city.coldLoadMW = r() < 0.5 ? 0 : 400 * r();
    s.dr.mw = r() < 0.5 ? 0 : V.DR_MW * r();
    s.phys.fHz = 49.5 + r();
    physics.tick(s, []); s.tick++;
    const d = s.env.demandMW, sf = s.city.shedFrac;
    assert.ok(Object.is(s.phys.shedMW, d * sf + 0), 'shedMW');
    assert.ok(Object.is(s.phys.servedMW, d * (1 - sf) + s.city.coldLoadMW - s.dr.mw + 0), 'servedMW');
    assert.ok(Object.is(fleet.litDemandMW(s), d * (1 - sf)), 'litDemandMW');
    assert.ok(Object.is(s.acc.unservedMWs, s.acc.shedMWs), 'the unserved and the relay MW x s are the same number');
  }
  assert.deepEqual([s.city.roofDarkMW, s.city.roofOffMW, s.ren.windAutoMW, s.ren.solarAutoMW], [0, 0, 0, 0]);
  if (!C7) assert.deepEqual([s.acc.spillMWs, s.phys.renPfrMW, s.phys.roofPfrMW, s.phys.roofHoldFrac], [0, 0, 0, 0], 'the C-7 code is gated by its flags');
});

// ------------------------------------------------------------------ P-12 / C-8: net-load blocks, unserved energy, reconnection

test('P-12 / C-8: fleet.setDistrictDark and refreshRoof keep roofDarkMW, roofOffMW and reconnectS: dark, the 60-s wait, the 6-min ramp', () => {
  const s = noon({roofSubMW: roofAt(12.5)});
  const city = s.city, d = district(s, 'SOL3'), dist = city.districts[d], e = district(s, 'RED5');
  const mine = s.env.roofSubMW[dist.sub] * dist.roofFrac, other = s.env.roofSubMW[city.districts[e].sub] * city.districts[e].roofFrac;
  near(mine, 1250 * 0.7 * 0.99 / 5, 1e-9, 'a Solstice Rise district holds a fifth of its suburb\'s rooftop');
  assert.deepEqual([city.roofDarkMW, city.roofOffMW, dist.reconnectS], [0, 0, -1]);
  assert.equal(fleet.litDemandMW(s), totalMW(s) - s.env.rooftopMW, 'nothing dark: the lit demand is the operational demand');
  fleet.setDistrictDark(s, d, true, 'directed');
  fleet.setDistrictDark(s, e, true, 'directed');
  near(city.roofDarkMW, mine + other, 1e-9, 'dark rooftop');
  near(city.roofOffMW, mine + other, 1e-9, 'off rooftop');
  assert.equal(dist.reconnectS, -1, 'dark: nothing pending');
  near(fleet.litDemandMW(s), totalMW(s) * (1 - city.shedFrac) - (s.env.rooftopMW - mine - other), 1e-9, 'the lit demand loses the dark rooftop too');
  // Relight one: its inverters wait ROOF_RECONNECT_S, then ramp back over ROOF_RAMP_S.
  s.tick += 100 * TPS;
  const at = s.tick / TPS;
  fleet.setDistrictDark(s, d, false, null);
  assert.equal(dist.reconnectS, at + V.ROOF_RECONNECT_S);
  near(city.roofDarkMW, other, 1e-9, 'only the other district is dark');
  near(city.roofOffMW, mine + other, 1e-9, 'relit, but its rooftop is still off');
  const underlying = totalMW(s) * dist.share;
  near(fleet.districtColdLoadMW(s, d), underlying, 1e-9, 'relit and waiting: its net load is its whole underlying load');
  s.tick += V.ROOF_RECONNECT_S * TPS; fleet.refreshRoof(s);
  near(city.roofOffMW, mine + other, 1e-9, 'the ramp starts at reconnectS');
  s.tick += V.ROOF_RAMP_S / 2 * TPS; fleet.refreshRoof(s);
  near(city.roofOffMW, mine / 2 + other, 1e-9, 'half way up the ramp');
  assert.equal(dist.reconnectS, at + V.ROOF_RECONNECT_S, 'still ramping');
  near(fleet.districtColdLoadMW(s, d), underlying - mine / 2, 1e-9, 'half way up: a relay or DIRECT SHED would take off its load less HALF its rooftop');
  near(fleet.litDemandMW(s), litMW(s), 1e-6, 'and the lit demand agrees, district by district');
  // Shed again while it is still reconnecting: nothing is pending any more and all of it is off.
  const again = clone(s);
  fleet.setDistrictDark(again, d, true, 'ufls');
  assert.equal(again.city.districts[d].reconnectS, -1, 'dark: reconnectS is cleared');
  near(again.city.roofOffMW, mine + other, 1e-9);
  near(again.city.roofDarkMW, mine + other, 1e-9);
  s.tick += V.ROOF_RAMP_S / 2 * TPS; fleet.refreshRoof(s);
  near(city.roofOffMW, other, 1e-9, 'all of it back');
  assert.equal(dist.reconnectS, -1, 'the refresh resets reconnectS when the ramp has finished');
  near(fleet.districtColdLoadMW(s, d), underlying - mine, 1e-9, 'reconnected: its net load');
  // No rooftop (the classic day): both sums stay exactly 0 whatever is dark.
  const c = noon();
  fleet.setDistrictDark(c, d, true, 'directed');
  assert.deepEqual([c.city.roofDarkMW, c.city.roofOffMW], [0, 0]);
  assert.equal(fleet.litDemandMW(c), c.env.demandMW * (1 - c.city.shedFrac));
});

test('P-12: a UFLS stage sheds the NET load of its two districts: less at a sunny 12:30 than at 19:00; unserved energy is their underlying load (C-8)', () => {
  const stage1 = CLASSIC.city.uflsStages[0];
  const shed = (h, operationalMW) => {
    const s = noon({h, roofSubMW: roofAt(h)});
    s.env.demandMW = operationalMW; // test poke: the frequency is held, so the balance does not matter
    const want = stage1.reduce((a, id) => a + netMW(s, id), 0);
    const underlying = stage1.reduce((a, id) => a + totalMW(s) * s.city.districts[district(s, id)].share, 0);
    const out = hold(s, TPS, V.UFLS_FIRST_HZ - 0.05);
    const recs = out.filter(x => x.kind === 'ufls');
    assert.deepEqual(recs.map(x => x.stage), [1], 'stage 1 only');
    assert.deepEqual(recs[0].districts, stage1);
    near(recs[0].mw, want, 1, 'the record\'s MW is the stage\'s net load');
    near(s.phys.shedMW, want, 1, 'and so is phys.shedMW (the relay MW)');
    near(s.city.roofDarkMW, underlying - want, 1e-6, 'the difference is the rooftop that went with the feeders');
    return {s, mw: recs[0].mw, underlying};
  };
  const midday = shed(12.5, 2400), evening = shed(19, 6000);
  assert.ok(midday.mw < evening.mw, 'stage 1 at 12:30 ' + midday.mw.toFixed(0) + ' MW, at 19:00 ' + evening.mw.toFixed(0) + ' MW');
  assert.ok(midday.mw < 0.5 * midday.underlying, 'at noon the block sheds under half of what its customers draw: ' + midday.mw.toFixed(0) + ' of ' + midday.underlying.toFixed(0));
  // S-1 (C-8): the unserved energy of that second is the dark customers' own load, not the relay MW.
  const s = midday.s, a = s.acc;
  near(a.unservedMWs / a.shedMWs, midday.underlying / midday.mw, 1e-9, 'unserved : relay MW x s');
  const darkS = a.unservedMWs / midday.underlying;
  near(darkS, (TPS - Math.round(V.UFLS_DELAY_S / DT) + 1) * DT, 1e-9, 'dark from the tick the stage operated');
  market.settleSecond(s, []);
  near(s.score.unservedMWh, midday.underlying * darkS / V.S_PER_H, 1e-9, 'score.unservedMWh');
  near(s.score.uflsMWh, s.score.unservedMWh, 1e-12, 'all of it UFLS');
  near(s.last.shedMW, midday.mw * darkS, 1e-6, 'last.shedMW stays the relay MW (the mean over the second)');
});

test('P-12: a stage that sheds a district still reconnecting nets only the rooftop it had connected: the ufls record is the load the relays took off', () => {
  const stage1 = CLASSIC.city.uflsStages[0];
  const s = noon({roofSubMW: roofAt(12.5)});
  s.env.demandMW = 2400; // test poke: the frequency is held, so the balance does not matter
  const d = district(s, stage1[0]), dist = s.city.districts[d];
  const mine = s.env.roofSubMW[dist.sub] * dist.roofFrac;
  // Shed and relit by hand (the stage itself has not operated); a third of the way up its ramp.
  fleet.setDistrictDark(s, d, true, 'directed');
  s.tick += 30 * TPS;
  fleet.setDistrictDark(s, d, false, null);
  s.tick += (V.ROOF_RECONNECT_S + V.ROOF_RAMP_S / 3) * TPS;
  fleet.refreshRoof(s);
  near(s.city.roofOffMW, mine * 2 / 3, 1e-9, 'two thirds of its rooftop are still off');
  hold(s, 1, F0);
  const served0 = s.phys.servedMW;
  const want = stage1.reduce((a, id) => a + netMW(s, id), 0) + mine * 2 / 3; // netMW nets a district's WHOLE rooftop
  const recs = hold(s, TPS, V.UFLS_FIRST_HZ - 0.05).filter(x => x.kind === 'ufls');
  assert.deepEqual(recs.map(x => x.stage), [1]);
  near(recs[0].mw, want, 1e-6, 'the record nets the rooftop that was connected, as a `shed` record does');
  near(served0 - s.phys.servedMW, recs[0].mw, 1e-6, 'and it is exactly the load the grid lost');
  assert.ok(mine > 90, 'the case bites: ' + mine.toFixed(0) + ' MW of rooftop on that district');
  // Labelled (sim/README.md §7): phys.shedMW keeps §19.2's formula (the dark districts' net load
  // with ALL their rooftop), so here it is below the record by the rooftop that was still off.
  near(s.phys.shedMW, recs[0].mw - mine * 2 / 3, 1e-6, 'phys.shedMW (§19.2)');
});

test('P-9 / P-12: the price clears on the lit OPERATIONAL demand: rooftop behind a dark district is not demand the stack must meet', () => {
  const s = noon({roofSubMW: roofAt(12.5)});
  const d = district(s, 'SOL3'), dist = s.city.districts[d];
  fleet.setDistrictDark(s, d, true, 'ufls'); // by a relay: no administered cap (that is for directed shedding)
  const mine = s.env.roofSubMW[dist.sub] * dist.roofFrac, roof = s.env.rooftopMW;
  // The floor blocks and the available wind and solar offer 2,410 MW at or below the renewable
  // offer; the tie exports 300 MW. Poke the operational demand so the lit demand is 30 MW more
  // than they cover: the first coal range block sets the price.
  const cheap = MUST_RUN_MW + NOON_WIND_MW + NOON_SOLAR_MW, litWant = cheap - V.TIE_EXPORT_CAP_MW + 30;
  s.env.demandMW = (litWant + roof - mine) / (1 - dist.share) - roof;
  near(litMW(s), litWant, 1e-6, 'the poke');
  near(fleet.litDemandMW(s), litWant, 1e-6, 'fleet.litDemandMW');
  assert.ok(s.env.demandMW * (1 - s.city.shedFrac) < litWant - 60, 'the pre-2a expression would be over 60 MW lower (the dark district\'s rooftop is off)');
  const p = market.clearPrice(s);
  assert.equal(p.marginalId, 'coal1', 'a coal range block is marginal');
  assert.ok(p.mwh >= V.MACHINES[fleet.unitIndex('coal1')].offer, 'price $' + p.mwh);
  s.env.demandMW -= 60; // now 30 MW inside what wind and solar offer
  const q = market.clearPrice(s);
  assert.ok(q.marginalId === 'wind' || q.marginalId === 'solar', 'the renewable offer is marginal: ' + q.marginalId);
  assert.ok(q.mwh < p.mwh);
});

test('P-12: Solstice Rise at noon is net negative: DIRECT SHED of it takes off about nothing, and LIGHTS ON still counts its customers', () => {
  const s = noon({roofSubMW: roofAt(12.5)});
  const d = district(s, 'SOL3'), share = s.city.districts[d].share;
  const net = netMW(s, 'SOL3');
  assert.ok(net < 0 && net > -30, 'net load of SOL3 at the 2,110-MW noon: ' + net.toFixed(1) + ' MW');
  near(fleet.districtColdLoadMW(s, d), net, 1e-9, 'a lit district\'s cold-load MW is its net load now');
  s.sec.level = 'SHORT'; // test poke (A-3): the key needs a shortfall
  const out = [];
  assert.equal(grid.applyCommand(s, {type: 'directShed'}, out), '');
  const rec = out.find(e => e.kind === 'shed');
  assert.equal(rec.district, 'SOL3', 'the first rotation district');
  near(rec.mw, net, 1e-9, 'the shed record carries the net MW');
  const underlying = totalMW(s) * share;
  near(fleet.districtColdLoadMW(s, d), underlying, 1e-9, 'dark: the undelayed underlying pickup, no rooftop netted off');
  hold(s, TPS, F0);
  near(s.phys.shedMW, net, 1e-9, 'relay MW');
  near(s.acc.unservedMWs, underlying, 1e-9, 'one second of its customers\' load is unserved');
  assert.ok(s.acc.unservedMWs > 150, 'LIGHTS ON does not improve because the sun is out');
});

test('P-12 / K-13: the restore preview and the restore pick up the undelayed underlying load; the rooftop waits 60 s and ramps over 6 min', () => {
  const s = noon({roofSubMW: roofAt(12.5)});
  const d = district(s, 'SOL3'), dist = s.city.districts[d];
  fleet.setDistrictDark(s, d, true, 'directed');
  s.tick += (V.COLD_LOAD_AFTER_S + 60) * TPS; // dark long enough for cold-load pickup
  rebalance(s);
  run(s, 2); // readouts, R5 and the last second's frequency for the permissive
  const roofMine = s.env.roofSubMW[dist.sub] * dist.roofFrac, cold = totalMW(s) * dist.share * V.COLD_LOAD_FACTOR;
  assert.ok(cold > 240 && cold > roofMine, 'the pickup is ' + cold.toFixed(0) + ' MW although the district\'s net load would be near zero');
  const p = physics.previewTrip(s, {kind: 'district', id: 'SOL3'});
  near(p.lostMW, cold, 1e-9, 'the restore preview includes the undelayed load');
  near(caughtSum(p.caught), p.lostMW, 1, 'caught still sums to the MW picked up');
  assert.ok(p.nadirHz < F0);
  const served0 = s.phys.servedMW;
  const out = [];
  assert.equal(grid.applyCommand(s, {type: 'restore', district: 'SOL3'}, out), '');
  const at = s.tick / TPS;
  near(out.find(e => e.kind === 'restore').mw, cold, 1e-9, 'the restore record');
  assert.equal(dist.reconnectS, at + V.ROOF_RECONNECT_S);
  near(dist.surgeMW, cold * (1 - 1 / V.COLD_LOAD_FACTOR), 1e-9, 'the surge is the pickup beyond its underlying share');
  run(s, 1);
  near(s.phys.servedMW - served0, cold, 1, 'the grid sees the full pickup at once');
  near(s.city.roofOffMW, roofMine, 1e-9, 'its rooftop is still off');
  run(s, V.ROOF_RECONNECT_S + V.ROOF_RAMP_S / 2 - 1);
  near(s.city.roofOffMW, roofMine / 2, 1, 'half of it back half way up the ramp');
  run(s, V.ROOF_RAMP_S / 2 + 1);
  assert.deepEqual([s.city.roofOffMW, s.city.roofDarkMW, dist.reconnectS], [0, 0, -1], 'reconnected');
});

test('K-10 / P-12: every preview kind leaves the state exactly as it was with a Solstice Rise district dark and rooftop on (hashState, JSON)', () => {
  const s = noon({roofSubMW: roofAt(12.5), battery: {socMWh: V.BATT_MWH / 2}});
  fleet.setDistrictDark(s, district(s, 'SOL3'), true, 'directed');
  fleet.setDistrictDark(s, district(s, 'SOL1'), true, 'ufls');
  s.tick += 90 * TPS;
  fleet.setDistrictDark(s, district(s, 'SOL1'), false, null); // relit and waiting: a reconnectS is pending
  s.tick += 3 * TPS;
  rebalance(s);
  s.phys.roofHoldFrac = 0.01; // test poke: a small held rooftop back-off (C-7)
  run(s, 1);
  const before = hashState(s), snap = JSON.stringify(s);
  const kinds = [[{kind: 'unit', id: 'coal1'}], [{kind: 'link', id: 'tie'}], [{kind: 'load', id: 'smelter', mw: V.SMELTER_MW}],
    [{kind: 'district', id: 'SOL3'}], [{kind: 'none', id: ''}], [{kind: 'unit', id: 'ccgt1'}, {guardMW: 200}],
    [{kind: 'district', id: 'SOL3'}, {guardMW: 300}]];
  for (const [target, opts] of kinds) {
    const p = physics.previewTrip(s, target, opts);
    assert.equal(hashState(s), before, target.kind + ': previewTrip wrote to state');
    assert.equal(JSON.stringify(s), snap, target.kind);
    assert.deepEqual(physics.previewTrip(s, target, opts), p, target.kind + ': deterministic');
    near(caughtSum(p.caught), p.lostMW, 1, target.kind + ': caught sums to the MW lost');
  }
  // A stage operating inside a preview darkens districts (fleet.setDistrictDark): restored too.
  const weak = commit(clone(s), {coal1: 650, coal2: 650}, {tieMW: 0});
  rebalance(weak);
  const h = hashState(weak);
  const p = physics.previewTrip(weak, {kind: 'unit', id: 'coal1'});
  assert.ok(p.uflsStages > 0, 'the weak island sheds in the preview');
  assert.equal(hashState(weak), h);
});

test('K-11 / C-8: the imbalance identity holds on every tick with rooftop, a dark district, a reconnecting one and a load loss', () => {
  const s = noon({roofSubMW: roofAt(12.5), battery: {socMWh: V.BATT_MWH / 2}});
  fleet.setDistrictDark(s, district(s, 'TAL3'), true, 'directed');
  fleet.setDistrictDark(s, district(s, 'HAR3'), true, 'directed');
  s.tick += 30 * TPS;
  fleet.setDistrictDark(s, district(s, 'HAR3'), false, null);
  rebalance(s);
  // The §19.2 readouts on a tick with a dark district and a reconnecting one, against the
  // scenario's arithmetic: the relay MW are the dark district's net load; the served load is every
  // lit district's load less the rooftop it has connected (the relit one has none yet).
  hold(s, 1, F0);
  const dark = s.city.districts[district(s, 'TAL3')];
  near(s.phys.shedMW, totalMW(s) * dark.share - s.env.roofSubMW[dark.sub] * dark.roofFrac, 1e-9, 'phys.shedMW');
  near(s.phys.servedMW, litMW(s) + s.city.coldLoadMW - s.dr.mw, 1e-6, 'phys.servedMW');
  assert.ok(s.city.roofOffMW - s.city.roofDarkMW > 20 && s.city.roofDarkMW > 100, 'both cases bite: ' + s.city.roofOffMW.toFixed(0) + ' MW off, ' + s.city.roofDarkMW.toFixed(0) + ' MW of it dark');
  assert.ok(Math.abs(s.phys.servedMW - s.env.demandMW * (1 - s.city.shedFrac)) > 20, 'the pre-2a expression is a different number');
  let responded = false;
  const r = run(s, 120, (x, i) => { if (i === 20) x.env.demandMW -= V.SMELTER_MW; }, x => { if (x.phys.renPfrMW > 0 || x.phys.roofPfrMW > 0) responded = true; });
  assert.ok(r.fMax > F0 + 0.1, 'the load loss shows: ' + hz(r));
  assert.ok(r.residual < 1e-6, 'identity residual ' + r.residual);
  assert.equal(responded, C7, 'the inverters respond exactly when the C-7 flags are on');
});

test('H-7 (rebuilt on net-load blocks): the desk-lab midday trip on a mild 12:30 with rooftop: the relays darken over twice the customers per MW shed', t => {
  // The H-7 desk-lab case (tools/baseline-v4.js: two coal machines at 650 MW are the only spinning
  // plant, 6.5 GW.s; coal1 trips; physics only for 60 s; "no battery" holds its energy at empty
  // below 50 Hz and full above) moved to the poked mild noon: operational demand 2,400 MW, 3,465 MW
  // of rooftop behind it, 700 MW of utility solar and 400 MW of wind, no tie flow. A result, not
  // a target: the numbers are printed (and are in the grid job's report); the asserts are the
  // mechanism only.
  const midday = (noBattery, roofSubMW) => {
    const s = noon({units: {coal1: 650, coal2: 650}, tieMW: 0, roofSubMW, battery: {socMWh: V.BATT_MWH / 2}});
    const t0 = s.tick, out = [];
    const lost = fleet.tripUnit(s, fleet.unitIndex('coal1'), 'test', 3600, out);
    let fMin = Infinity, fMax = -Infinity;
    for (let k = 0; k < 60 * TPS && !s.black; k++) {
      if (noBattery) s.battery.socMWh = s.phys.fHz < F0 ? 0 : V.BATT_MWH;
      physics.tick(s, out); s.tick++;
      fMin = Math.min(fMin, s.phys.fHz); fMax = Math.max(fMax, s.phys.fHz);
    }
    const ufls = out.filter(e => e.kind === 'ufls');
    const blackAt = s.black ? (s.tick - t0) * DT : -1, fEnd = s.phys.fHz;
    // one more tick for the rates the accumulators take (S-1: unserved; the relay MW)
    const unserved0 = s.acc.unservedMWs, relay0 = s.acc.shedMWs;
    physics.tick(s, out); s.tick++;
    return {s, lost, fMin, fMax, stages: ufls.length, relayMW: ufls.reduce((a, e) => a + e.mw, 0), darkMW: totalMW(s) * s.city.shedFrac,
      unservedRateMW: (s.acc.unservedMWs - unserved0) / DT, relayRateMW: (s.acc.shedMWs - relay0) / DT,
      ofgs: s.ofgs.tripped.filter(Boolean).length, blackAt, fEnd};
  };
  const say = m => 'nadir ' + m.fMin.toFixed(3) + ' Hz, UFLS ' + m.stages + ' stages (' + Math.round(m.relayMW) + ' MW net shed for ' + Math.round(m.lost) +
    ' MW lost; ' + Math.round(m.darkMW) + ' MW of customers dark), peak ' + m.fMax.toFixed(3) + ' Hz, OFGS ' + m.ofgs + ', ' +
    (m.blackAt >= 0 ? 'BLACK at ' + m.blackAt.toFixed(2) + ' s' : 'not black, ' + m.fEnd.toFixed(3) + ' Hz after 60 s');
  const a = midday(true, roofAt(12.5)), b = midday(false, roofAt(12.5)), c = midday(true, NO_ROOF), d = midday(false, NO_ROOF);
  t.diagnostic('H-7 midday, mild 12:30, operational 2,400 MW, rooftop 3,465 MW, flags ' + (C7 ? 'on' : 'off'));
  t.diagnostic('  no battery:   ' + say(a));
  t.diagnostic('  with battery: ' + say(b));
  t.diagnostic('  the same supply with no rooftop, no battery:   ' + say(c));
  t.diagnostic('  the same supply with no rooftop, with battery: ' + say(d));
  near(a.s.env.demandMW, 2400, 1e-9, 'operational demand');
  assert.ok(netMW(noon({roofSubMW: roofAt(12.5), units: {coal1: 650, coal2: 650}, tieMW: 0}), 'SOL1') < 0, 'Solstice Rise is net negative at that noon');
  // P-12 / C-8, on the sim's own outputs: the stages' records add up to the relay MW, which is the
  // dark districts' net load (the scenario's arithmetic); the relay MW x s and the unserved energy
  // accrue at those two different rates.
  for (const m of [a, b, c, d]) {
    const netDark = m.s.city.districts.reduce((sum, x) => sum + (x.dark ? netMW(m.s, x.id) : 0), 0);
    near(m.relayMW, netDark, 1e-6, 'the ufls records add up to the dark districts\' net load');
    near(m.s.phys.shedMW, netDark, 1e-6, 'phys.shedMW');
    near(m.relayRateMW, netDark, 1e-6, 'acc.shedMWs accrues at the relay MW');
    near(m.unservedRateMW, m.darkMW, 1e-6, 'acc.unservedMWs accrues at the customers dark');
  }
  for (const m of [a, b]) assert.ok(m.darkMW > 2 * m.relayMW, 'with rooftop the customers dark are over twice the MW shed: ' + say(m));
  for (const m of [c, d]) near(m.darkMW, m.relayMW, 1e-6, 'with no rooftop they are the same MW');
  assert.ok(Math.abs(a.relayMW - c.relayMW) > 50 && a.stages === c.stages, 'the same eight stages are a different MW with rooftop behind them: ' + Math.round(a.relayMW) + ' vs ' + Math.round(c.relayMW));
  assert.equal(a.stages, V.UFLS_STAGES, 'no battery: every stage operates');
  assert.ok(b.stages >= d.stages && b.darkMW > 2 * d.darkMW, 'with the battery: as many stages, over twice the customers dark');
  if (C7) assert.equal(a.blackAt, -1, 'C-7: the over-shed no longer overshoots to 52 Hz');
});

// ------------------------------------------------------------------ C-6: automatic curtailment

test('C-6: demand falling under the must-run fleet with the battery full: the dispatch spills wind and solar, frequency stays in the normal band', () => {
  const s = noon();
  near(s.env.demandMW, MUST_RUN_MW + NOON_WIND_MW + NOON_SOLAR_MW - V.TIE_EXPORT_CAP_MW, 1e-9, 'a 2,110-MW operational noon');
  // Demand falls 0.25 MW/s to 1,600 MW (34 min), then holds for 5 min: a 510-MW surplus.
  // (On the stage A sim this run went black at 52 Hz.)
  const r = run(s, 2040 + 300, ramp(-0.25, 1600));
  assert.equal(s.black, false, 'black at ' + s.phys.fHz + ' Hz');
  assert.ok(inBand(r), 'frequency ' + hz(r));
  assert.equal(r.ofgs, 0, 'no OFGS stage');
  near(autoMW(s), 510, 10, 'held back of a 510-MW surplus');
  near(s.ren.windAutoMW / s.ren.solarAutoMW, NOON_WIND_MW / NOON_SOLAR_MW, 1e-6, 'pro rata by present output');
  assert.equal(s.price.mwh, V.RENEWABLE_OFFER, 'P-9: the belly\'s price is the renewable offer');
  assert.equal(s.battery.socMWh, V.BATT_MWH);
  assert.ok(aboveMinMW(s) < 1e-6, 'no unit left MIN');
  const spilled = s.score.spillMWh;
  assert.ok(spilled > 100, 'spilled energy is counted: ' + spilled.toFixed(1) + ' MWh');
  run(s, 60);
  near(s.score.spillMWh - spilled, 510 * 60 / V.S_PER_H, 1, 'and keeps growing at the cut');
  // P-5: the stack still offers AVAILABLE wind and solar, so curtailing never moves the price.
  const stack = market.buildStack(s);
  near(stack.find(b => b.id === 'wind').mw + stack.find(b => b.id === 'solar').mw, NOON_WIND_MW + NOON_SOLAR_MW, 1e-9, 'available MW in the stack');
});

test('C-6: released as the surplus goes: both automatic MW are back at 0 before any unit leaves MIN', () => {
  const s = curtailing();
  near(autoMW(s), 510, 10, 'curtailing');
  let zeroAt = -1, leftAt = -1, cutWhenLeft = -1;
  const r = run(s, 3600, (x, i) => {
    if (zeroAt < 0 && autoMW(x) === 0) zeroAt = i;
    if (leftAt < 0 && aboveMinMW(x) > 1e-6) { leftAt = i; cutWhenLeft = autoMW(x); }
    ramp(0.25, 2400)(x);
  });
  assert.ok(zeroAt > 0, 'the cut never reached 0');
  assert.ok(Math.abs(zeroAt - 510 / 0.25) <= 5, 'the cut is gone when demand is back at 2,110 MW: second ' + zeroAt);
  assert.ok(leftAt > zeroAt, 'a unit left MIN at second ' + leftAt + ', the cut reached 0 at second ' + zeroAt);
  assert.equal(cutWhenLeft, 0);
  assert.deepEqual([s.ren.windAutoMW, s.ren.solarAutoMW], [0, 0]);
  assert.ok(aboveMinMW(s) + s.battery.schedMW > 250, 'beyond 2,110 MW the units and AGC carry the load');
  assert.ok(inBand(r) && r.ofgs === 0, 'frequency ' + hz(r));
});

test('C-6: an idle battery does not fill by itself in a 500-MW surplus; a CHARGE 300 order takes 300 MW off the cut', () => {
  const s = noon({battery: {socMWh: V.BATT_MWH / 2}});
  const a = run(s, 2000, ramp(-0.25, 1610));  // the surplus builds to 500 MW
  const b = run(s, 1800);                     // and stands for 30 grid-min
  assert.ok(s.battery.socMWh - V.BATT_MWH / 2 < 20, 'state of charge rose ' + (s.battery.socMWh - V.BATT_MWH / 2).toFixed(2) + ' MWh');
  assert.ok(Math.max(a.reqMax, b.reqMax) < V.PAR_REBASE_MW, 'AGC carried ' + Math.max(a.reqMax, b.reqMax).toFixed(1) + ' MW at most');
  near(autoMW(s), 500, 50, 'the cut is the surplus');
  assert.ok(inBand(a) && inBand(b), 'frequency ' + hz(a) + ', ' + hz(b));
  // The player's order: the battery takes 300 MW, the dispatch spills 300 MW less.
  assert.equal(grid.applyCommand(s, {type: 'battery', mode: 'charge', mw: 300}, []), '');
  const c = run(s, 600);
  near(autoMW(s), 200, 10, 'the cut with a CHARGE 300 order');
  near(s.battery.outMW, -300, 10, 'the battery charges on its order');
  assert.ok(inBand(c), 'frequency ' + hz(c));
  // A step into the surplus (no ramp): AGC and the battery help for a minute, then give it back.
  const st = noon({battery: {socMWh: V.BATT_MWH / 2}});
  st.env.demandMW -= 500;
  const e = run(st, 1800);
  assert.ok(st.battery.socMWh - V.BATT_MWH / 2 < 20, 'after a 500-MW step: ' + (st.battery.socMWh - V.BATT_MWH / 2).toFixed(2) + ' MWh');
  near(autoMW(st), 500, 50, 'the cut after the step');
  assert.equal(e.ofgs, 0);
});

test('C-6: the same noon with the tie at 0 MW never reaches 51 Hz: curtailment simply does more', () => {
  const s = noon();
  assert.equal(grid.applyCommand(s, {type: 'tie', mw: 0}, []), ''); // the export ramps off; the sim never moves the tie itself
  const r = run(s, 2040 + 300, ramp(-0.25, 1600));
  assert.equal(s.tie.flowMW, 0);
  assert.ok(r.fMax < 51 && r.ofgs === 0 && !s.black, 'frequency ' + hz(r));
  assert.ok(inBand(r), 'in fact it stays in the normal band: ' + hz(r));
  near(autoMW(s), 810, 10, 'held back with no export');
  assert.equal(s.price.mwh, V.RENEWABLE_OFFER);
  // More surplus than there is wind and solar: every MW of it is held back, and no more.
  const deep = run(s, 1400, ramp(-0.25, 1300));
  near(autoMW(s), NOON_WIND_MW + NOON_SOLAR_MW, 1e-6, 'the cut is clamped to what is available');
  assert.deepEqual([s.ren.windMW, s.ren.solarMW], [0, 0]);
  assert.ok(deep.fMax > F0 + 0.01, 'beyond that the frequency rises (MSL3: units at minimum exceed demand): ' + hz(deep));
  assert.equal(s.price.mwh, V.PRICE_FLOOR, 'and the minimum-load blocks set the floor price');
});

test('C-6: a stale plan (base points 300 MW above MIN at that noon, AGC on) stays under 50.5 Hz; once the dispatch is spilling AGC takes the units to MIN first', () => {
  const stale = s => {
    assert.equal(grid.applyCommand(s, {type: 'basePoint', station: 'coal', mw: 4 * 290}, []), '');
    assert.equal(grid.applyCommand(s, {type: 'basePoint', station: 'ccgt', mw: 2 * 225}, []), '');
    return s;
  };
  // At the 2,110-MW noon itself there is no surplus by the floor blocks: the units' AGC bands
  // lower 230 of the 300 MW and governors (and the inverters' droop) hold the other 70 at a
  // slightly raised frequency, with AGC at its limit. Nothing is spilled for the plan's sake.
  const s = stale(noon());
  const r = run(s, 1800);
  assert.ok(r.fMax < V.CONTAIN_HI_HZ && r.ofgs === 0 && !s.black, 'frequency ' + hz(r));
  const lowerBandMW = 4 * V.CLASSES.coal.agcBandFrac * V.STATIONS.coal.ratingMW + 2 * 50; // coal's bands and the CCGTs' 50 MW above MIN
  near(s.agc.requestMW, -lowerBandMW, 1e-6, 'AGC at its lowering limit');
  assert.ok(r.limitS > 600 && s.agc.atLimitS > 0, 'and it says so (AGC LIMIT): unmet for ' + r.limitS + ' s');
  // The grid job's reported deviation from §21.2 (which reads as an unconditional sum): AGC's
  // unmet request is added to the cut only in a surplus by the floor blocks. Stage C decides.
  assert.equal(r.cutMax, 0, 'no surplus, no cut');
  near(aboveMinMW(s), 300 - lowerBandMW, 1, 'the units sit 70 MW above MIN, on their governors');
  // With demand falling into the belly on that plan the dispatch starts spilling, and AGC may then
  // lower every unit as far as its MIN: the plan is brought to the floor the feed-forward cut
  // assumes, no more than the surplus is spilled, and AGC LIMIT clears.
  const u = stale(noon());
  const v = run(u, 2040 + 600, ramp(-0.25, 1600));
  assert.ok(inBand(v) && v.ofgs === 0 && !u.black, 'frequency ' + hz(v));
  near(autoMW(u), 510, 1, 'the cut is the surplus, and no more');
  assert.ok(aboveMinMW(u) < 1, 'every unit is at MIN: ' + aboveMinMW(u).toFixed(1) + ' MW above');
  near(u.agc.requestMW, -300, 1, 'AGC carries the stale 300 MW (par\'s rule 7 sees it)');
  assert.deepEqual([u.agc.unmetMW, u.agc.atLimitS], [0, 0], 'AGC LIMIT is clear');
  near(u.phys.fHz, F0, 0.005, 'and the frequency is back at 50 Hz');
  assert.equal(u.battery.socMWh, V.BATT_MWH);
  // A battery with room is not used for it: the units take the whole request.
  const w = stale(noon({battery: {socMWh: V.BATT_MWH / 2}}));
  const x = run(w, 2040 + 600, ramp(-0.25, 1600)), y = run(w, 1800);
  assert.ok(inBand(x) && inBand(y) && x.limitS === 0, 'frequency ' + hz(x) + ', ' + hz(y));
  near(autoMW(w), 510, 1, 'the cut with a battery that has room');
  assert.ok(aboveMinMW(w) < 1, 'every unit is at MIN');
  assert.ok(Math.abs(w.battery.socMWh - V.BATT_MWH / 2) < 5, 'state of charge moved ' + (w.battery.socMWh - V.BATT_MWH / 2).toFixed(2) + ' MWh');
});

test('C-6: one AGC cycle: while the dispatch is spilling a lowering request goes to the units, each as far as its MIN, and only the rest to the battery; otherwise pro rata within the bands', () => {
  const plan = aboveMin(300); // each of the six units 50 MW above its MIN
  const coalBand = V.CLASSES.coal.agcBandFrac * V.STATIONS.coal.ratingMW, ccgtBand = 50; // 32.5 MW; the CCGTs' 65-MW band reaches MIN first
  const cycle = (spill, fMeanHz, requestMW, battery) => {
    const s = noon({units: plan, battery: {socMWh: V.BATT_MWH / 2, ...battery}});
    s.ren.solarAutoMW = spill ? 10 : 0; // test pokes: the dispatch is spilling (or not), last second's mean frequency, AGC's integral so far
    s.last.fMeanHz = fMeanHz;
    s.agc.requestMW = requestMW;
    grid.agcSecond(s, []);
    return s;
  };
  const trims = s => ['coal1', 'coal4', 'ccgt1', 'ccgt2'].map(id => s.units[fleet.unitIndex(id)].agcTrimMW);
  const step = hzAbove => V.AGC_KI_PER_S * V.AGC_CYCLE_S * -V.AGC_BIAS_MW_PER_HZ * hzAbove; // the integral's step for that error
  // Not spilling (K-2, K-5 as before): pro rata over the units' bands and the battery's 500 MW.
  const a = cycle(false, 50.05, -200), reqA = -200 + step(0.05), bandsA = 4 * coalBand + 2 * ccgtBand + V.BATT_MW;
  near(a.agc.requestMW, reqA, 1e-9);
  trims(a).forEach((t, i) => near(t, (i < 2 ? coalBand : ccgtBand) * reqA / bandsA, 1e-9, 'pro rata, unit ' + i));
  near(a.battery.agcTrimMW, V.BATT_MW * reqA / bandsA, 1e-9, 'the battery takes its share: ' + a.battery.agcTrimMW.toFixed(1) + ' MW');
  // Spilling: the same request goes to the units alone, pro rata by their room above MIN.
  const b = cycle(true, 50.05, -200);
  near(b.agc.requestMW, reqA, 1e-9, 'the same request');
  trims(b).forEach(t => near(t, reqA / 6, 1e-9, 'each unit a sixth'));
  assert.equal(b.battery.agcTrimMW, 0, 'the battery is not used while a unit has room above MIN');
  // More than the units can take: they go to MIN (beyond their regulating band) and the battery takes the rest.
  const c = cycle(true, 50.05, -400), reqC = -400 + step(0.05);
  trims(c).forEach(t => near(t, -50, 1e-9, 'to MIN'));
  near(c.battery.agcTrimMW, reqC + 300, 1e-9, 'the rest');
  assert.equal(c.agc.unmetMW, 0);
  // Battery full: the request stops at the units' room and the rest is unmet (dispatchSecond spills it).
  const d = cycle(true, 50.2, -290, {socMWh: V.BATT_MWH});
  near(d.agc.requestMW, -300, 1e-9, 'clipped at the units\' room above MIN');
  near(d.agc.unmetMW, -V.AGC_BIAS_MW_PER_HZ * 0.2, 1e-6, 'unmet: the ACE');
  assert.equal(d.battery.agcTrimMW, 0);
  trims(d).forEach(t => near(t, -50, 1e-9));
  // Every unit at MIN already and spilling: only the battery's band is left (the contract's order:
  // "after the units' and the battery's bands"), so in a deep belly AGC does charge an idle battery.
  const e = noon({battery: {socMWh: V.BATT_MWH / 2}});
  e.ren.windAutoMW = 10; e.last.fMeanHz = 50.05; e.agc.requestMW = -100;
  grid.agcSecond(e, []);
  near(e.battery.agcTrimMW, -100 + step(0.05), 1e-9, 'the battery\'s band');
  assert.ok(e.units.every(z => z.agcTrimMW === 0));
  // A raising request is shared pro rata as before, spilling or not.
  const up = [cycle(false, 49.9, 0), cycle(true, 49.9, 0)];
  assert.deepEqual(trims(up[1]), trims(up[0]));
  assert.equal(up[1].battery.agcTrimMW, up[0].battery.agcTrimMW);
  assert.ok(up[0].battery.agcTrimMW > 0 && trims(up[0]).every(t => t > 0));
});

test('C-6: AGC\'s unmet lowering request in the cut: the ACE of the second just completed while AGC is at its lowering limit, in a surplus only', () => {
  const s = curtailing(); // 510 MW held back, six units at MIN, battery full: AGC has no lowering band left
  near(autoMW(s), 510, 1e-6);
  const dispatch = (unmetMW, fMeanHz, n) => {
    const x = clone(s);
    x.agc.unmetMW = unmetMW; x.last.fMeanHz = fMeanHz; // test pokes: AGC's last cycle, the second just completed
    for (let k = 0; k < n; k++) grid.dispatchSecond(x, []);
    return autoMW(x);
  };
  const bias = V.AGC_BIAS_MW_PER_HZ, perS = V.CURTAIL_RAMP_FRAC_MIN * (V.WIND_MW + V.SOLAR_MW) / 60;
  near(dispatch(0, 50.05, 30), 510, 1e-6, 'AGC not at its limit: the feed-forward cut alone');
  near(dispatch(-40, 50.05, 30), 510 + bias * 0.05, 1e-6, 'at its limit, 0.05 Hz high: 40 MW more is spilled');
  const one = dispatch(-40, 50.05, 1) - 510;
  assert.ok(one > 1 && one <= perS + 1e-9, 'moving at the curtailment ramp: ' + one.toFixed(2) + ' MW in the first second');
  near(dispatch(-40, 50.1, 30), 510 + bias * 0.1, 1e-6, 'it follows the frequency of the second just completed, not the ACE AGC held');
  near(dispatch(-40, F0, 30), 510, 1e-6, 'and is gone as soon as the frequency is back, though AGC\'s next cycle has not run');
  near(dispatch(-40, F0 + V.AGC_DEADBAND_HZ / 2, 30), 510, 1e-6, 'nothing inside AGC\'s deadband');
  near(dispatch(40, 49.95, 30), 510, 1e-6, 'a raising limit spills nothing');
  // Outside a surplus by the floor blocks the term is not used (the reported deviation, as above).
  const dry = noon();
  dry.agc.unmetMW = -40; dry.last.fMeanHz = 50.05;
  for (let k = 0; k < 30; k++) grid.dispatchSecond(dry, []);
  assert.equal(autoMW(dry), 0);
});

test('C-6: an idle battery does not fill in a standing surplus while the plan sits above MIN (60 to 600 MW, or one machine): the units come down first', () => {
  const plans = [['60 MW over six units', aboveMin(60)], ['150 MW', aboveMin(150)], ['300 MW', aboveMin(300)], ['600 MW', aboveMin(600)],
    ['100 MW on one coal machine', {...AT_MIN, coal1: AT_MIN.coal1 + 100}]];
  for (const [tag, units] of plans) {
    const s = noon({units, battery: {socMWh: V.BATT_MWH / 2}}); // balanced on that plan, above the 2,110-MW noon
    // Demand falls to 1,610 MW: a 500-MW surplus by the floor blocks; ten minutes to settle, then 30 grid-min.
    run(s, Math.ceil((s.env.demandMW - 1610) / 0.25) + 600, ramp(-0.25, 1610));
    const soc0 = s.battery.socMWh;
    const r = run(s, 1800);
    assert.ok(s.battery.socMWh - soc0 < 2, tag + ': state of charge rose ' + (s.battery.socMWh - soc0).toFixed(2) + ' MWh in 30 min');
    assert.ok(aboveMinMW(s) < 5, tag + ': units ' + aboveMinMW(s).toFixed(1) + ' MW above MIN');
    near(autoMW(s), 500, 5, tag + ': the cut is the surplus');
    assert.ok(inBand(r), tag + ': frequency ' + hz(r));
  }
});

test('C-6: every term of the surplus moves the cut: a dark district and a reconnecting one, the cold-load surge, DR, a unit loading, reserve diesel, OFGS', () => {
  const base = curtailing({roofSubMW: roofAt(12.5)});
  near(cutOutMW(base), 510, 10, 'the curtailing state');
  near(cutOutMW(base), surplusWant(base), 1, 'the cut is the surplus, by the contract\'s arithmetic');
  /** n more seconds; the cut must then equal the surplus and the last 20 s lie in the normal band. */
  const settle = (s, n, tag) => {
    run(s, n - 20);
    const r = run(s, 20);
    near(cutOutMW(s), surplusWant(s), 2, tag + ': the cut against the surplus');
    assert.ok(inBand(r) && r.ofgs === 0 && r.ufls.length === 0, tag + ': frequency ' + hz(r));
    return s;
  };
  // (1) A district dark (its net load is gone: more surplus) and one relit and still waiting (its
  // rooftop is off: more lit demand, less surplus); then the same half way up its ramp.
  const a = clone(base);
  const sol = district(a, 'SOL4'), solRoof = a.env.roofSubMW[a.city.districts[sol].sub] * a.city.districts[sol].roofFrac;
  const hazNet = netMW(a, 'HAZ4');
  fleet.setDistrictDark(a, sol, true, 'ufls');
  run(a, 5);
  fleet.setDistrictDark(a, sol, false, null);
  fleet.setDistrictDark(a, district(a, 'HAZ4'), true, 'ufls');
  settle(a, 50, 'HAZ4 dark, SOL4 waiting');
  near(cutOutMW(a), 510 + hazNet - solRoof, 5, 'the dark district\'s net load more, the waiting district\'s rooftop less');
  assert.ok(hazNet > 80 && solRoof > 150, 'both bite: ' + hazNet.toFixed(0) + ' and ' + solRoof.toFixed(0) + ' MW');
  assert.equal(a.price.mwh, V.RENEWABLE_OFFER, 'P-9: still the renewable offer');
  settle(a, 15 + V.ROOF_RAMP_S / 2, 'SOL4 half way up its ramp');
  near(cutOutMW(a), 510 + hazNet - solRoof / 2, 5, 'half of its rooftop back');
  // (2) A restore after ten minutes dark: the cold-load surge is demand too.
  const b = clone(base), red = district(b, 'RED5');
  fleet.setDistrictDark(b, red, true, 'ufls');
  b.tick += (V.COLD_LOAD_AFTER_S + 60) * TPS; // test poke: dark long enough for cold-load pickup
  settle(b, 120, 'RED5 dark');
  assert.equal(grid.applyCommand(b, {type: 'restore', district: 'RED5'}, []), '');
  const picked = run(b, 40);
  assert.ok(picked.ufls.length === 0 && picked.fMin > V.CONTAIN_LO_HZ, 'the pickup: ' + hz(picked));
  assert.ok(b.city.coldLoadMW > 50, 'a surge of ' + b.city.coldLoadMW.toFixed(0) + ' MW is decaying');
  settle(b, 20, 'RED5 restored, surge decaying, its rooftop waiting');
  // (3) A DR call: 350 MW of load gone at its ramp.
  const c = clone(base);
  assert.equal(grid.applyCommand(c, {type: 'callDR'}, []), '');
  const dr = run(c, Math.ceil(V.DR_MW / (V.DR_RAMP_MW_MIN / 60)) + 10);
  assert.ok(inBand(dr), 'DR ramping in: ' + hz(dr));
  near(c.dr.mw, V.DR_MW, 1e-9);
  settle(c, 20, 'DR delivered');
  near(cutOutMW(c), 510 + V.DR_MW, 10, 'the cut with 350 MW of DR');
  // (4) A machine loading to MIN is must-run at its present output (H-1), then at its MIN.
  const d = clone(base), gt = fleet.unitIndex('gta1'), m = V.MACHINES[gt];
  Object.assign(d.units[gt], {mode: 'loading', schedMW: m.syncBlockMW, outMW: m.syncBlockMW}); // test poke: its breaker just closed
  fleet.setSync(d, gt, true);
  settle(d, 60, 'gta1 loading');
  assert.equal(d.units[gt].mode, 'loading');
  assert.ok(d.units[gt].schedMW > 100 && d.units[gt].schedMW < m.minMW, 'at ' + d.units[gt].schedMW.toFixed(0) + ' MW on its way to MIN');
  near(cutOutMW(d), 510 + d.units[gt].schedMW, 10, 'its present output is spilled too');
  settle(d, 120, 'gta1 on at MIN');
  assert.equal(d.units[gt].mode, 'on');
  near(cutOutMW(d), 510 + m.minMW, 10);
  // (5) OFGS stages tripped: the cut is shared over the wind still connected, and still equals the surplus.
  const e = clone(base);
  fleet.setOfgsStage(e, 0, true);
  settle(e, 120, 'one OFGS stage');
  near(cutOutMW(e), 510 - NOON_WIND_MW * V.OFGS_STAGE_FRAC, 10, 'a quarter of the wind is disconnected, not spilled');
  fleet.setOfgsStage(e, 1, true);
  settle(e, 120, 'two OFGS stages');
  near(cutOutMW(e), 510 - 2 * NOON_WIND_MW * V.OFGS_STAGE_FRAC, 10);
  near(e.ren.windAutoMW / e.ren.solarAutoMW, NOON_WIND_MW / NOON_SOLAR_MW, 1e-6, 'pro rata by present output (each plant the same fraction)');
  // (6) Reserve diesel on line is must-run too (out of the market, but as real).
  const g = clone(base);
  Object.assign(g.rert, {armed: true, armedEver: true, leadS: 0}); // test poke: armed, and its lead time over
  const diesel = run(g, Math.ceil(V.RERT_MW / (V.RERT_RAMP_MW_MIN / 60)) + 10);
  assert.ok(inBand(diesel), 'diesel loading: ' + hz(diesel));
  near(g.rert.outMW, V.RERT_MW, 1e-9);
  settle(g, 20, 'reserve diesel on line');
  near(cutOutMW(g), 510 + V.RERT_MW, 10);
});

test('C-6 in HAND: the feed-forward cut needs no AGC; levers held above MIN are the player\'s to lower', () => {
  const s = noon({mode: 'HAND'});
  const r = run(s, 2040 + 300, ramp(-0.25, 1600));
  assert.ok(inBand(r) && r.ofgs === 0, 'levers at MIN: frequency ' + hz(r));
  near(autoMW(s), 510, 10, 'held back in HAND');
  assert.equal(s.agc.requestMW, 0);
  // Levers 300 MW above MIN: the cut covers the surplus by the floor blocks only; the 300 MW are
  // carried by the governors (and the inverters' droop) at a raised frequency until a lever moves.
  const u = noon({mode: 'HAND', units: {coal1: 290, coal2: 290, coal3: 290, coal4: 290, ccgt1: 225, ccgt2: 225}});
  const v = run(u, 2040 + 300, ramp(-0.25, 1900));
  near(autoMW(u), 210, 1e-6, 'the feed-forward cut only');
  assert.ok(v.fMax < V.CONTAIN_HI_HZ && v.fMax > F0 + 0.05 && v.ofgs === 0, 'frequency ' + hz(v));
  for (const st of ['coal', 'ccgt']) grid.applyCommand(u, {type: 'basePoint', station: st, mw: 0}, []);
  const w = run(u, 1200);
  near(u.phys.fHz, F0, 0.02, 'back at 50 Hz once the levers are at their floor');
  assert.ok(w.fMin > V.NORMAL_LO_HZ);
});

test('C-6: a cloud over a curtailed solar farm comes out of what is held back first; OFGS and the manual LIMIT keep their MW', () => {
  const s = curtailing();
  const held = s.ren.solarAutoMW, outMW = s.ren.solarMW;
  s.env.solarAvailMW -= 200; // test poke: 200 MW of availability gone in one second, less than is held back
  const r = run(s, 1);
  near(s.ren.solarMW, outMW, V.CURTAIL_RAMP_FRAC_MIN * V.SOLAR_MW / 60 + 1e-9, 'output held within one ramp step (was ' + outMW.toFixed(1) + ' MW)');
  assert.ok(s.ren.solarAutoMW < held - 190);
  assert.ok(inBand(r));
  const q = run(s, 300);
  assert.ok(inBand(q), 'frequency ' + hz(q));
  near(autoMW(s), 310, 1, 'the cut settles at the smaller surplus');
  // And the other way (the cap is on output): MW the weather gives back to a plant that is held
  // back are held back too, so the sun coming out or a gust is not a step of supply.
  const z = clone(s), solarOut = z.ren.solarMW, windOut = z.ren.windMW;
  z.env.solarAvailMW += 350; z.env.windAvailMW += 300; // test pokes: back in one second
  const back = run(z, 1);
  near(z.ren.solarMW, solarOut, V.CURTAIL_RAMP_FRAC_MIN * V.SOLAR_MW / 60 + 1e-9, 'solar output held within one ramp step');
  near(z.ren.windMW, windOut, V.CURTAIL_RAMP_FRAC_MIN * V.WIND_MW / 60 + 1e-9, 'wind output held within one ramp step');
  const after = run(z, 300);
  assert.ok(inBand(back) && inBand(after) && after.ofgs === 0, 'frequency ' + hz(back) + ', ' + hz(after));
  near(autoMW(z), 310 + 650, 1, 'all 650 MW of it joins the cut');
  // The manual LIMIT stacks under the automatic cut: output = available - LIMIT's MW - automatic MW.
  assert.equal(grid.applyCommand(s, {type: 'curtail', kind: 'wind', limitPct: 50}, []), '');
  const m = run(s, 600);
  near(s.ren.windCurtMW, NOON_WIND_MW / 2, 1e-6, 'the LIMIT\'s MW');
  near(s.ren.windCurtMW + autoMW(s), 310, 1, 'the two together are the surplus');
  near(s.ren.windMW, NOON_WIND_MW - s.ren.windCurtMW - s.ren.windAutoMW, 1e-9);
  assert.ok(inBand(m), 'frequency ' + hz(m));
  // Spill counts both, wind net of OFGS (tripped wind is disconnected, not spilled).
  fleet.setOfgsStage(s, 0, true);
  run(s, 30);
  const before = s.score.spillMWh, backedOffMWs = s.acc.spillMWs; // the droop's part of the second just run (C-7), if any
  const want = (s.ren.windCurtMW + s.ren.windAutoMW) * (1 - V.OFGS_STAGE_FRAC) + s.ren.solarCurtMW + s.ren.solarAutoMW;
  run(s, 1); // settles the second just run
  near((s.score.spillMWh - before) * V.S_PER_H, want + backedOffMWs, 1e-6, 'one second\'s spill in MW x s');
  assert.ok(want > NOON_WIND_MW / 2 * (1 - V.OFGS_STAGE_FRAC), 'the LIMIT\'s MW of connected wind and the automatic cut');
});

test('F-2 / F-7: the belly state stays plain JSON (no -0, nothing non-finite) and resumes bit-identically from a snapshot', () => {
  const s = curtailing({roofSubMW: roofAt(12.5), battery: {socMWh: V.BATT_MWH / 2}});
  fleet.setDistrictDark(s, district(s, 'SOL3'), true, 'directed');
  run(s, 30, (x, i) => { if (i === 5) x.env.demandMW -= V.SMELTER_MW; }); // an over-frequency excursion while curtailing
  fleet.setDistrictDark(s, district(s, 'SOL3'), false, null);                // and a district reconnecting
  const c = clone(s);
  run(s, 200); run(c, 200);
  assert.equal(JSON.stringify(c), JSON.stringify(s));
  assert.equal(hashState(c), hashState(s));
  assertPlain(s);
  assert.ok(autoMW(s) > 500 && s.city.roofOffMW > 0, 'the snapshot was taken mid-belly');
});

// ------------------------------------------------------------------ C-7: the inverters' over-frequency response

test('C-7: readouts at a held frequency: wind and solar droop on rating, capped by output; rooftop linear from 50.25 Hz, held, released under 50.15 Hz', needsC7(), () => {
  const s = noon({roofSubMW: roofAt(12.5)});
  const roofOn = s.env.rooftopMW, rating = V.WIND_MW + V.SOLAR_MW;
  hold(s, 5, F0 + V.GOV_DEADBAND_HZ / 2);
  assert.deepEqual([s.phys.renPfrMW, s.phys.roofPfrMW, s.phys.roofHoldFrac], [0, 0, 0], 'nothing inside the deadband');
  hold(s, 1, 50.215);
  near(s.phys.renPfrMW, 0.2 / (V.GOV_DROOP * F0) * rating, 1e-6, '5% droop on 2,600 MW of rating: 208 MW at 0.2 Hz past the deadband');
  assert.equal(s.phys.roofPfrMW, 0, 'rooftop waits for 50.25 Hz');
  near(s.phys.supplyMW, s.phys.schedSupplyMW + s.phys.govTotalMW + s.battery.pfrMW + s.battery.ffrMW - s.phys.renPfrMW, 1e-9, 'supplyMW');
  hold(s, 1, 50.6);
  near(s.phys.roofHoldFrac, (50.6 - V.ROOF_FW_START_HZ) / (V.ROOF_FW_ZERO_HZ - V.ROOF_FW_START_HZ), 1e-12, 'linear between 50.25 and 52 Hz');
  near(s.phys.roofPfrMW, roofOn * 0.2, 1e-6, 'a fifth of the rooftop backs off at 50.6 Hz');
  near(s.phys.loadMW, s.phys.servedMW - s.phys.loadReliefMW + s.phys.roofPfrMW, 1e-9, 'the grid sees it as load');
  near(s.phys.renPfrMW, (0.6 - V.GOV_DEADBAND_HZ) / (V.GOV_DROOP * F0) * rating, 1e-6);
  assert.ok(Math.abs(identity(s)) < 1e-6, 'identity ' + identity(s));
  hold(s, TPS, 50.2);
  near(s.phys.roofHoldFrac, 0.2, 1e-12, 'held at the lowest output reached while f is between 50.15 and 50.25 Hz');
  hold(s, 36 * TPS, 50.1);
  near(s.phys.roofHoldFrac, 0.2 - 36 / V.ROOF_RAMP_S, 1e-9, 'released at 1 / ROOF_RAMP_S a second under 50.15 Hz');
  hold(s, 40 * TPS, 50.1);
  assert.deepEqual([s.phys.roofHoldFrac, s.phys.roofPfrMW], [0, 0], 'all of it back');
  hold(s, 1, 52.5);
  assert.equal(s.phys.roofHoldFrac, 1, 'zero output from 52 Hz');
  // Capped by present output, and wind tripped by OFGS has no rating left to back off.
  const t = noon({windMW: 100, solarMW: 60});
  hold(t, 1, 50.415);
  near(t.phys.renPfrMW, 160, 1e-9, 'capped at the 160 MW they put out');
  const o = noon();
  fleet.setOfgsStage(o, 0, true); fleet.setOfgsStage(o, 1, true);
  hold(o, 1, 50.215);
  near(o.phys.renPfrMW, 0.2 / (V.GOV_DROOP * F0) * (V.WIND_MW * 0.5 + V.SOLAR_MW), 1e-6, 'half the wind rating is tripped');
  // A dark district's rooftop is off already: only what is connected can back off.
  const d = noon({roofSubMW: roofAt(12.5)});
  fleet.setDistrictDark(d, district(d, 'SOL3'), true, 'directed');
  hold(d, 1, 50.6);
  near(d.phys.roofPfrMW, (d.env.rooftopMW - d.city.roofOffMW) * 0.2, 1e-6);
  // Rooftop that backs off is energy the grid serves: acc.servedMWs is of loadMW (-> score.servedMWh).
  const e = noon({roofSubMW: roofAt(12.5)});
  hold(e, 1, 50.6);
  near(e.acc.servedMWs, e.phys.loadMW * DT, 1e-9, 'acc.servedMWs');
  assert.ok(e.phys.loadMW > e.phys.servedMW + 500, 'loadMW ' + e.phys.loadMW.toFixed(0) + ' against servedMW ' + e.phys.servedMW.toFixed(0));
});

test('C-7: the wind and solar backed off is spilled energy: off genMWh, onto score.spillMWh', needsC7(), () => {
  const a = noon(), b = noon();
  hold(a, TPS, F0);
  hold(b, TPS, 50.215); // 208 MW backed off for one second
  near(b.acc.spillMWs, 208, 1e-6, 'acc.spillMWs');
  assert.equal(a.acc.spillMWs, 0);
  market.settleSecond(a, []); market.settleSecond(b, []);
  near(b.score.spillMWh, 208 / V.S_PER_H, 1e-9, 'score.spillMWh');
  near(a.score.genMWh - b.score.genMWh, 208 / V.S_PER_H, 1e-9, 'and it was not generated (units at MIN and a full battery do not move)');
  assert.equal(a.score.spillMWh, 0);
  assert.equal(b.acc.spillMWs, 0, 'acc is zeroed');
});

test('C-7: from the curtailing state a 256-MW load loss and a tie trip at 300 MW export each peak at or under 50.5 Hz with no OFGS stage (droop alone, and with rooftop)', needsC7(), t => {
  for (const roofSubMW of [NO_ROOF, roofAt(12.5)]) {
    const tag = roofSubMW === NO_ROOF ? 'env.rooftopMW 0' : 'rooftop poked';
    const base = curtailing({roofSubMW});
    near(autoMW(base), 510, 10, 'curtailing');
    const load = clone(base);
    const a = run(load, 600, (x, i) => { if (i === 0) x.env.demandMW -= V.SMELTER_MW; });
    t.diagnostic('C-7 ' + tag + ': 256-MW load loss ' + hz(a) + ', OFGS ' + a.ofgs);
    assert.ok(a.fMax <= V.CONTAIN_HI_HZ && a.ofgs === 0 && !load.black, tag + ': load loss ' + hz(a));
    near(autoMW(load), 510 + V.SMELTER_MW, 10, 'then the feed-forward cut takes it over');
    near(load.phys.fHz, F0, 0.05, 'and the frequency is back');
    const link = clone(base);
    const b = run(link, 600, (x, i, out) => { if (i === 0) assert.equal(fleet.tripTie(x, 'test', 3600, out), -V.TIE_EXPORT_CAP_MW); });
    t.diagnostic('C-7 ' + tag + ': tie trip at 300 MW export ' + hz(b) + ', OFGS ' + b.ofgs);
    assert.ok(b.fMax <= V.CONTAIN_HI_HZ && b.ofgs === 0 && !link.black, tag + ': tie trip ' + hz(b));
    const rec = link.conts[link.contIdx];
    assert.equal(rec.lostMW, -V.TIE_EXPORT_CAP_MW);
    assert.equal(rec.contained, true);
    assert.ok(rec.caught.inverterMW < -200, 'the inverters caught most of it: ' + rec.caught.inverterMW.toFixed(0) + ' MW');
    assert.ok(a.residual < 1e-6 && b.residual < 1e-6, 'K-11 identity');
  }
});

test('C-7 / K-15: caught.inverterMW keeps caught summing to the MW lost: the preview and the record agree on a load loss', needsC7(), () => {
  const s = curtailing({roofSubMW: roofAt(12.5)});
  const p = physics.previewTrip(s, {kind: 'load', id: 'smelter', mw: V.SMELTER_MW});
  assert.equal(p.lostMW, -V.SMELTER_MW);
  near(caughtSum(p.caught), p.lostMW, 1, 'preview caught');
  assert.ok(p.caught.inverterMW < -200 && p.nadirHz <= V.CONTAIN_HI_HZ, 'the droop catches it: ' + p.caught.inverterMW.toFixed(0) + ' MW, peak ' + p.nadirHz.toFixed(3));
  // The record, with schedules frozen as in the preview (physics only): the potline trips.
  const out = [];
  fleet.tripSmelter(s, 3600, out);
  s.env.demandMW -= V.SMELTER_MW; // weather.sampleSecond does this in step(); here it is poked
  let fMax = -Infinity;
  for (let k = 0; k < V.PREVIEW_HORIZON_S * TPS; k++) { physics.tick(s, out); s.tick++; fMax = Math.max(fMax, s.phys.fHz); }
  const rec = s.conts[s.contIdx];
  near(caughtSum(rec.caught), rec.lostMW, 1, 'record caught');
  near(rec.extremeHz, p.nadirHz, 0.02, 'K-10: the preview matches');
  assert.deepEqual(Object.keys(rec.caught), ['inertiaMW', 'batteryMW', 'guardMW', 'governorsMW', 'loadReliefMW', 'uflsMW', 'inverterMW']);
});

test('C-7: a stale plan as a step, a HAND desk with levers too high, and the deep belly all stay under 50.5 Hz', needsC7(), () => {
  // A 510-MW step down on a plan 300 MW above MIN, battery full: a 210-MW surplus by the floor blocks.
  const s = noon({units: aboveMin(300)});
  s.env.demandMW -= 510;
  const r = run(s, 600);
  assert.ok(r.fMax <= V.CONTAIN_HI_HZ && r.ofgs === 0, 'stale plan, step: ' + hz(r));
  // AGC asks the units for all 300 MW within a few cycles, but coal comes down at 3 MW a minute a
  // machine: until they arrive its request is unmet, and that is spilled on top of the surplus.
  assert.ok(r.limitS > 300 && r.cutMax > 210 + 30, 'AGC\'s unmet lowering request was spilled: unmet for ' + r.limitS + ' s, cut up to ' + r.cutMax.toFixed(1) + ' MW');
  const q = run(s, 3000);
  assert.ok(q.fMax <= V.NORMAL_HI_HZ && q.fMin >= V.NORMAL_LO_HZ && q.ofgs === 0, 'then: ' + hz(q));
  near(autoMW(s), 210, 1, 'with the units at MIN only the surplus is spilled');
  assert.ok(aboveMinMW(s) < 1, 'units ' + aboveMinMW(s).toFixed(1) + ' MW above MIN');
  assert.equal(s.agc.unmetMW, 0, 'AGC LIMIT is clear');
  near(s.phys.fHz, F0, 0.005);
  // HAND, levers 300 MW above MIN: parked inside the normal band by the droop.
  const u = noon({mode: 'HAND', units: aboveMin(300)});
  const v = run(u, 2040 + 300, ramp(-0.25, 1900));
  assert.ok(v.fMax < V.NORMAL_HI_HZ, 'HAND: ' + hz(v));
  assert.ok(u.phys.renPfrMW > 50, 'the droop spills ' + u.phys.renPfrMW.toFixed(0) + ' MW until a lever moves');
  // Must-run above demand with every MW of wind and solar already held back: the roofs back off.
  const d = noon({tieMW: 0, roofSubMW: roofAt(12.5)});
  const w = run(d, 4 * 3600, ramp(-0.25, 1100));
  assert.ok(w.fMax <= V.CONTAIN_HI_HZ && !d.black && w.ofgs === 0, 'deep belly: ' + hz(w));
  assert.ok(d.phys.roofPfrMW > 100, 'rooftop backed off ' + d.phys.roofPfrMW.toFixed(0) + ' MW');
});

test('C-6 / C-7: a plan far above MIN with no surplus by the floor blocks (AGC on, battery full) cannot push the grid to an OFGS stage: 600 MW stays in the normal band, 1,000 MW under 50.5 Hz', needsC7(), t => {
  // The contract's purpose clause ("so a stale plan cannot push the grid to 52 Hz") outside a floor
  // surplus, where AGC's unmet request is NOT spilled (the grid job's reported deviation): the
  // governors and the inverters' droop carry what AGC's bands cannot. Upper bounds only: a
  // stronger AGC term at stage C can only lower these.
  for (const [x, limitHz] of [[600, V.NORMAL_HI_HZ], [1000, V.CONTAIN_HI_HZ], [1500, V.OFGS_STAGES_HZ[0]]]) {
    const s = noon({units: aboveMin(x)}); // balanced on that plan: operational demand 2,110 + x
    // Demand falls until the floor blocks are 50 MW short of a surplus, then stands for 30 grid-min.
    const r = run(s, (x - 50) / 0.25 + 1800, ramp(-0.25, 2160));
    t.diagnostic('plan ' + x + ' MW above MIN, no floor surplus: ' + hz(r) + ', parked at ' + s.phys.fHz.toFixed(3) + ' Hz, AGC unmet ' + s.agc.unmetMW.toFixed(0) +
      ' MW, governors ' + s.phys.govTotalMW.toFixed(0) + ' MW, droop ' + s.phys.renPfrMW.toFixed(0) + ' MW, cut ' + autoMW(s).toFixed(0) + ' MW');
    assert.ok(r.fMax <= limitHz && r.ofgs === 0 && !s.black, x + ' MW above MIN: ' + hz(r) + ' against ' + limitHz + ' Hz');
  }
});

test('README §2 rule 6: physics.tick allocates nothing on the belly\'s paths: rooftop, a dark and a reconnecting district, the droop, the rooftop hold and its release', () => {
  const s = curtailing({roofSubMW: roofAt(12.5), battery: {socMWh: V.BATT_MWH / 2}});
  fleet.setDistrictDark(s, district(s, 'SOL3'), true, 'directed');
  fleet.setDistrictDark(s, district(s, 'RED5'), true, 'directed');
  s.tick += 30 * TPS;
  fleet.setDistrictDark(s, district(s, 'RED5'), false, null); // relit: its rooftop is waiting
  assert.ok(s.city.roofDarkMW > 100 && s.city.roofOffMW > s.city.roofDarkMW + 50 && autoMW(s) > 400, 'the belly state');
  // One pass holds the frequency at each step for n ticks (schedules frozen), so every C-7 branch
  // runs: inside the deadband, the droop alone, the droop capped by output, the rooftop backing
  // off, held, and released.
  const HZ = [50, 50.1, 50.2, 50.4, 50.6, 50.2, 50.1, 50], out = [];
  let heldMax = 0;
  const pass = n => {
    for (let j = 0; j < HZ.length; j++) for (let k = 0; k < n; k++) {
      s.phys.fHz = HZ[j]; physics.tick(s, out); s.tick++;
      if (s.phys.roofHoldFrac > heldMax) heldMax = s.phys.roofHoldFrac;
    }
  };
  for (let c = 0; c < 4; c++) pass(2500); // warm: every branch far past the optimiser's thresholds
  if (C7) assert.ok(heldMax > 0.19 && s.phys.roofHoldFrac === 0 && s.acc.spillMWs > 0, 'the response ran: backed off, held and released');
  const used = () => getHeapSpaceStatistics().find(x => x.space_name === 'new_space').space_used_size;
  const perTick = [], CHUNK = 8 * 250;
  for (let c = 0; c < 40; c++) {
    const a = used();
    pass(250);
    const d = used() - a;
    if (d >= 0) perTick.push(d / CHUNK); // d < 0: a scavenge ran inside the chunk, nothing to read
  }
  assert.equal(out.length, 0, 'no relay operated');
  assert.ok(perTick.length >= 20, perTick.length + ' chunks without a scavenge');
  perTick.sort((x, y) => x - y);
  // A source allocation shows in every chunk (>= 16 B a tick); the engine re-tiering after a new
  // branch shows in one or two. So the median is judged, and the worst chunk is reported.
  const median = perTick[perTick.length >> 1], worst = perTick[perTick.length - 1];
  assert.ok(median < 8, 'physics.tick allocates ' + median.toFixed(1) + ' B per tick (median; worst chunk ' + worst.toFixed(1) + ')');
});

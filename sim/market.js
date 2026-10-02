// sim/market.js: merit-order price and the operator scorecard
// (spec P-5, P-6, P-7, P-8, P-11, H-5, H-12, S-1, S-2, S-3).
//
// STAGE B owner: "market + events". Contract: sim/README.md, section "market.js".
// scoreSummary() is implemented in stage A because observe() needs it; keep its output shape.
//
// Abstractions (SPEC §8.2 "Cost-based offers; scarcity adder" and "CUSTOMER COST is the
// resource cost of serving"):
//   - offers are cost-based (P-6), never strategic bids; the scarcity adder (P-7) stands in
//     for generators re-bidding when supply is tight, and is labelled as an abstraction;
//   - the price is a single-node, per-second merit-order price with no network, no
//     co-optimised FCAS and no 5-minute averaging (the real NEM settles every 5 minutes);
//   - RERT is priced "as if absent" (P-8; intervention pricing is unverified, §8.3);
//   - CUSTOMER COST is what a central planner pays for the resources (fuel, no-load,
//     starts, net imports, wear, DR, RERT), never the market bill and never anything
//     multiplied by unserved energy (H-12).

import {V} from './params.js';
import {startBlock, resetAcc, litDemandMW} from './fleet.js';
import {tableLinear} from './weather.js';

const M = V.MACHINES, NU = M.length;
const TPS = V.TICKS_PER_S, S_PER_H = V.S_PER_H, F0 = V.F0_HZ, EPS = V.MW_EPS;
const PRICE_FLOOR = V.PRICE_FLOOR, PRICE_CAP = V.PRICE_CAP;
const MIN_LOAD_OFFER = V.MIN_LOAD_OFFER, RENEWABLE_OFFER = V.RENEWABLE_OFFER;
const START_WITHIN_S = V.STACK_START_WITHIN_S, AUTO_SYNC_S = V.AUTO_SYNC_S;
const FREE_X = V.SCARCITY_FREE_X, AT_ONE = V.SCARCITY_AT_ONE, QUAD = V.SCARCITY_QUAD;
const WATER_TABLE = V.HYDRO_WATER_VALUE, ALLOCATION_MWH = V.HYDRO_ALLOCATION_MWH, HYDRO_STOP_MWH = V.HYDRO_STOP_MWH;
const DR_MW = V.DR_MW, DR_PRICE = V.DR_PRICE;
const NORMAL_LO = V.NORMAL_LO_HZ, NORMAL_HI = V.NORMAL_HI_HZ;
const SPARK_BLOCK_S = V.SPARK_BLOCK_S, SPARK_LAST = V.SPARK_BLOCKS - 1;

// S-2 variable cost per MWh by machine: the P-6 offer for thermal plant (cost-based offers
// ARE the fuel cost), HYDRO_VAR_COST for hydro (the water value is an offer, not a cost).
const RUN_COST = M.map(m => (m.thermal ? m.offer : V.HYDRO_VAR_COST));

// ------------------------------------------------------------------ the offer stack (P-5, P-6)

// Module scratch, reused every grid second so priceSecond allocates nothing after warm-up:
// `pool` holds block objects, `order` the indices of the first `count` of them in the
// stack's total order. buildStack() returns fresh copies; nothing here is ever in state.
const pool = [];
const order = [];
let count = 0;

// Every block id, ranked in string order once at load, so the hot sort compares numbers.
const IDS = V.MACHINE_IDS.concat(['wind', 'solar', 'dr']).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const RANK = M.map(m => IDS.indexOf(m.id));
const WIND_RANK = IDS.indexOf('wind'), SOLAR_RANK = IDS.indexOf('solar'), DR_RANK = IDS.indexOf('dr');

function put(id, rank, kind, offer, mw) {
  if (!(mw > EPS)) return;
  let b = pool[count];
  if (b === undefined) { b = {id: '', kind: '', offer: 0, mw: 0, rank: 0}; pool.push(b); }
  b.id = id; b.kind = kind; b.offer = offer; b.mw = mw + 0; b.rank = rank;
  count++;
}

// README §2 rule 9: a TOTAL order (offer, then id, then MW), so the result never depends
// on the sort algorithm. Two blocks of one unit never share an offer (min-load vs range).
function before(a, b) {
  if (a.offer !== b.offer) return a.offer < b.offer;
  if (a.rank !== b.rank) return a.rank < b.rank;
  return a.mw < b.mw;
}

// Insertion sort of ~20 blocks: no allocation, no dependence on engine sort details.
function sortStack() {
  for (let i = 0; i < count; i++) order[i] = i;
  for (let i = 1; i < count; i++) {
    const x = order[i];
    let j = i - 1;
    while (j >= 0 && before(pool[x], pool[order[j]])) { order[j + 1] = order[j]; j--; }
    order[j + 1] = x;
  }
}

/**
 * Fill the module scratch with this second's stack (membership per the README contract)
 * and sort it. Returns the number of blocks.
 */
function fillStack(state) {
  count = 0;
  const units = state.units, hydro = state.hydro;
  // Blocks go in near merit order (floor blocks, renewables, then priced ranges), so the
  // insertion sort below does little work; the sort alone decides the final order.
  for (let i = 0; i < NU; i++) {
    const u = units[i], m = M[i], mode = u.mode;
    // P-6: a running thermal unit's minimum-load block at the floor ("would rather pay
    // than shut down").
    if (mode === 'on') { if (m.thermal) put(u.id, RANK[i], m.cls, MIN_LOAD_OFFER, m.minMW); }
    // H-1: loading / unloading / shutdown units offer their present output only (no
    // headroom), as price-takers.
    else if (mode === 'loading' || mode === 'unloading' || mode === 'shutdown') put(u.id, RANK[i], m.cls, MIN_LOAD_OFFER, u.schedMW);
  }
  // P-5 "available wind and solar": what the weather gives (wind net of over-frequency
  // generation shedding, which disconnects it), NOT the dispatched MW after the player's
  // LIMIT. Semi-scheduled plant offers its availability; curtailment is economic (the price is
  // at or below its offer, P-9) or an operator direction, priced "as if absent" like RERT (P-8),
  // so a LIMIT never raises the price (review fix: curtailing noon solar used to remove 1.2 GW
  // of -$20 blocks and move the price to the next thermal block, or to the cap).
  put('wind', WIND_RANK, 'wind', RENEWABLE_OFFER, state.env.windAvailMW * (1 - state.ofgs.trippedFrac));
  put('solar', SOLAR_RANK, 'solar', RENEWABLE_OFFER, state.env.solarAvailMW);
  const wet = hydro.storageMWh > HYDRO_STOP_MWH;
  const water = waterValue(hydro.storageMWh / ALLOCATION_MWH);
  for (let i = 0; i < NU; i++) {
    const u = units[i], m = M[i], mode = u.mode;
    const offer = m.thermal ? m.offer : water;
    if (mode === 'on') {
      // The rest of the available range at the cost-based offer; hydro all of it at its
      // water value. Out of water (the stop level, where grid unloads the station) hydro
      // cannot offer energy it does not have: only what it still produces (extension).
      if (m.thermal) put(u.id, RANK[i], m.cls, offer, u.availMW - m.minMW);
      else put(u.id, RANK[i], m.cls, offer, wet ? u.availMW : u.schedMW);
    } else if (mode === 'starting' || mode === 'ready') {
      const toMinS = u.timerS + (mode === 'starting' ? AUTO_SYNC_S : 0) + m.t2S;
      if (toMinS <= START_WITHIN_S) put(u.id, RANK[i], m.cls, offer, u.availMW);
    } else if (mode === 'off') {
      // P-5 "offline units able to start within 10 min" (T1 + T2; the auto-sync wait is
      // not counted, since a manual close can beat it) that are free to start now.
      if (m.t1S + m.t2S <= START_WITHIN_S && startBlock(state, i) === '') put(u.id, RANK[i], m.cls, offer, u.availMW);
    }
    // tripped: nothing to offer during the lockout
  }
  // In-market industrial DR (P-5): offered while calls remain; while a call is active it is
  // being dispatched, so its delivered MW stay in the stack at its offer (a dispatched
  // demand-response block is priced like a generator; contract extension, see
  // CONTRACT NOTES in the stage B report).
  const dr = state.dr;
  if (dr.activeS > 0) put('dr', DR_RANK, 'dr', DR_PRICE, dr.mw);
  else if (dr.callsLeft > 0) put('dr', DR_RANK, 'dr', DR_PRICE, DR_MW);
  sortStack();
  return count;
}

/**
 * P-5 merit-order stack, cheapest first, in a TOTAL order: offer, then id (gtb1 before
 * gtb2), so ties never depend on sort stability. Blocks:
 *   units in mode 'on': thermal minimum-load block (minMW) at MIN_LOAD_OFFER plus the range
 *     minMW..availMW at the unit's offer; hydro the range 0..availMW at waterValue(storage)
 *     (only its present output once storage is at the stop level);
 *   units loading / unloading / shutdown (H-1: present output only, no headroom): one block
 *     of their present schedMW at MIN_LOAD_OFFER;
 *   units starting / ready: their whole range at their offer only if their remaining time
 *     to MIN (rest of T1 + rest of the auto-sync wait + T2) <= STACK_START_WITHIN_S;
 *   units off with fleet.startBlock '' and t1S + t2S <= STACK_START_WITHIN_S (P-5 "able to
 *     start within 10 min"; the auto-sync wait is not counted): whole range at their offer;
 *   AVAILABLE wind env.windAvailMW x (1 - ofgs.trippedFrac) and solar env.solarAvailMW at
 *     RENEWABLE_OFFER (P-5; a curtailment LIMIT does not take them out of the stack);
 *   industrial DR (DR_MW) at DR_PRICE while calls remain and none is active; an active
 *     call's delivered dr.mw at DR_PRICE.
 * Never RERT (P-8: priced as if absent). Used by the price and, from Phase 1a, the Live
 * Stack (one function, P-5 accept). ids are machine ids, 'wind', 'solar', 'dr'; kind is
 * the technology ('coal', 'ccgt', 'ocgt', 'hydro', 'wind', 'solar', 'dr'). Blocks of 0 MW
 * are left out.
 * @returns {Array<{id:string, kind:string, offer:number, mw:number}>}
 */
export function buildStack(state) {
  const n = fillStack(state);
  const out = new Array(n);
  for (let j = 0; j < n; j++) {
    const b = pool[order[j]];
    out[j] = {id: b.id, kind: b.kind, offer: b.offer, mw: b.mw};
  }
  return out;
}

/** True while AEMO-ordered load shedding is in force: a district dark by directed shedding (FOS or DIRECT SHED). */
function directedShedding(city) {
  const ds = city.districts;
  for (let d = 0; d < ds.length; d++) if (ds[d].dark && ds[d].shedBy === 'directed') return true;
  return false;
}

// Clear this second's price into `p` ({mwh, marginalId, adder, exhausted, x}).
function clearInto(state, p) {
  const n = fillStack(state);
  // P-5: market demand is the LIT (metered) demand, the cold-load surge of restored districts
  // included, net of the SCHEDULED tie and battery flows (H-5: imports are supply). Load shed
  // and still dark is not dispatched for (NEM dispatch targets metered demand; par's reflow
  // does the same). RERT MW are not subtracted (P-8: as if absent); DR is a stack block.
  // Phase 2a (P-12): the lit demand is OPERATIONAL, net of the rooftop PV still connected
  // (fleet.litDemandMW; with rooftop zero it is env.demandMW x (1 - shedFrac) exactly). In the
  // belly the floor blocks and the renewables' offers cover it, so the price is their offer or
  // the floor (P-9); the automatic cut (C-6) leaves the stack alone (available MW, P-5).
  const city = state.city;
  const demand = litDemandMW(state) + city.coldLoadMW - state.tie.flowMW - state.battery.schedMW;
  const sec = state.sec;
  const x = sec.lMW > 0 ? sec.r5MW / sec.lMW : FREE_X;
  const adder = scarcityAdder(x);
  let k = -1, cum = 0;
  for (let j = 0; j < n; j++) {
    cum += pool[order[j]].mw;
    if (cum >= demand - EPS) { k = j; break; }
  }
  const exhausted = k < 0 && demand > EPS;
  let mwh = PRICE_FLOOR, id = '';
  if (k >= 0) {
    const b = pool[order[k]];
    mwh = clampPrice(b.offer + adder);
    id = b.id;
  }
  // P-8: the cap when the stack cannot cover the lit demand, and while AEMO-ordered load
  // shedding is in force (a directed district dark: the spot price is then set to the cap,
  // §8.1). Districts shed by UFLS (automatic protection) and waiting to be restored do not
  // set it: the stack clears on the lit demand (review fix: the cap used to hold for hours
  // after UFLS on a healthy grid). Administered: no block sets it, so marginalId is ''.
  if (exhausted || directedShedding(city)) { mwh = PRICE_CAP; id = ''; }
  p.mwh = mwh + 0;
  p.marginalId = id;
  p.adder = adder + 0;
  p.exhausted = exhausted;
  p.x = x + 0;
  return p;
}

/**
 * P-5..P-8 price for the current second. Market demand = the lit operational demand
 * fleet.litDemandMW(state) (Phase 2a: G x (1 - city.shedFrac) less the rooftop PV connected, G =
 * env.demandMW + env.rooftopMW; env.demandMW x (1 - city.shedFrac) with no rooftop) +
 * city.coldLoadMW, minus tie.flowMW and battery.schedMW (the scheduled
 * flows, P-5; RERT MW are NOT subtracted, P-8). Price = offer of the block where the running
 * total first covers market demand, plus scarcityAdder(sec.r5MW / sec.lMW) (x =
 * SCARCITY_FREE_X when lMW is 0), clamped by clampPrice; the cap when the stack is exhausted
 * or while directed load shedding is in force (a district dark with shedBy 'directed').
 * marginalId is the price-setting block's id, or '' when the price is administered (the
 * cap) or no block exists (market demand <= 0 with an empty stack: the floor).
 * @returns {{mwh:number, marginalId:string, adder:number, exhausted:boolean, x:number}}
 */
export function clearPrice(state) {
  return clearInto(state, {mwh: 0, marginalId: '', adder: 0, exhausted: false, x: 0});
}

/**
 * P-7 scarcity adder, a pure function of x = R5 / L: 0 for x >= SCARCITY_FREE_X; linear from
 * 0 to SCARCITY_AT_ONE between SCARCITY_FREE_X and 1; SCARCITY_AT_ONE + SCARCITY_QUAD (1 - x)^2
 * below 1. (x = 0.5 -> 1475; 1 -> 300; 1.1 -> 180; 1.25 -> 0; 2 -> 0.) x below 0 counts as 0.
 * Labelled "generators re-bidding when supply is tight (abstraction)".
 * @param {number} x
 * @returns {number} $/MWh
 */
export function scarcityAdder(x) {
  if (x >= FREE_X) return 0;
  if (x >= 1) return AT_ONE * (FREE_X - x) / (FREE_X - 1);
  const d = 1 - Math.max(0, x);
  return AT_ONE + QUAD * d * d;
}

/** P-8: clamp to [PRICE_FLOOR, PRICE_CAP]. */
export function clampPrice(p) {
  return Math.min(PRICE_CAP, Math.max(PRICE_FLOOR, p));
}

/**
 * P-6 hydro water value at a storage fraction (0..1): HYDRO_WATER_VALUE, linear ($130 at
 * full storage, rising as storage falls; clamped at both ends of the table).
 */
export function waterValue(storageFrac) {
  return tableLinear(WATER_TABLE, storageFrac);
}

/** Write state.price = clearPrice(state), in place. Called by step() last in each grid second. */
export function priceSecond(state, out) { // eslint-disable-line no-unused-vars
  clearInto(state, state.price);
}

/**
 * Fold the last second's accumulators (state.acc, written by physics every tick) into
 * state.score, write the completed second's summary to state.last ({fMeanHz, fMinHz,
 * fMaxHz, servedMW, shedMW}: AGC and FOS read it), then fleet.resetAcc(state.acc). Called
 * by step() at the start of every grid second after the first, and once more when the day
 * ends (black or 04:00), when acc may hold fewer than 50 ticks (use acc.ticks, never 50).
 * S-1: unserved = integral of the dark customers' UNDERLYING load (acc.unservedMWs: UFLS +
 * directed + restore task; Phase 2a, C-8: G x shedFrac, not the relay MW acc.shedMWs, which is
 * net of their rooftop and stays the source of last.shedMW; equal with no rooftop), split
 * into uflsMWh / directedMWh / taskMWh by the dark districts' shedBy. S-2: fuel (offer x
 * MWh; hydro HYDRO_VAR_COST), no-load (sync units), starts (acc.startCost), tie (import x
 * neighbour price, export credited), battery wear, DR, RERT; never unserved x price (H-12).
 * S-3: CO2 t from generation in the region, and genMWh, that generation (units, wind after
 * OFGS, solar, RERT; intensity = co2t / genMWh, AEMO's CDEII convention: imports count in
 * neither term, and shedding alone barely moves it). Also minHz, maxHz, outsideNormalS,
 * spark[] (worst |f - F0| per SPARK_BLOCK_S block),
 * marketBill (info only). Tie, wind (x (1 - ofgs.trippedFrac)), solar, RERT and DR MW are
 * constant within a second, so they are integrated here as MW x acc.ticks x PHYS_DT.
 * Phase 2a: spillMWh (C-6, C-7) adds the second's curtailment, (windCurtMW + windAutoMW) x
 * (1 - ofgs.trippedFrac) + solarCurtMW + solarAutoMW, and the wind and solar backed off by
 * their over-frequency response (acc.spillMWs, per tick), which also comes off genMWh. Spilled
 * energy is counted, never charged for.
 * Reads: acc, units, ren, ofgs.trippedFrac, tie, env.neighbourPrice, rert, dr, price, city.
 * Writes: score.*, last.*, acc (reset).
 *
 * Runs before events and the grid update of the new second, so env, tie, rert, dr and
 * price still describe the second being settled. Emits nothing.
 */
export function settleSecond(state, out) { // eslint-disable-line no-unused-vars
  const acc = state.acc, ticks = acc.ticks;
  if (ticks > 0) {
    const sc = state.score, cost = sc.cost, last = state.last, units = state.units;
    const secs = ticks / TPS, h = secs / S_PER_H;

    // S-1: LIGHTS ON. Unserved energy in MWh only; it never meets a price (H-12). Phase 2a
    // (C-8): it is the dark customers' UNDERLYING load (acc.unservedMWs), not the relay MW
    // (acc.shedMWs: net of their rooftop, near zero at a sunny noon), so LIGHTS ON does not
    // depend on the sun. With no rooftop the two are equal.
    const unservedMWh = acc.unservedMWs / S_PER_H;
    if (unservedMWh > 0) splitShed(state, sc, unservedMWh);
    sc.unservedMWh += unservedMWh;
    const servedMWh = acc.servedMWs / S_PER_H;
    sc.servedMWh += servedMWh;

    // S-2: CUSTOMER COST (resource cost) and S-3: CARBON (generation in the region).
    let fuel = 0, noLoad = 0, co2 = 0, starts = 0;
    for (let i = 0; i < NU; i++) {
      const mwh = acc.unitMWs[i] / S_PER_H, m = M[i];
      fuel += mwh * RUN_COST[i];
      co2 += mwh * m.co2;
      if (units[i].sync) noLoad += m.noLoadPerS * secs;
      starts += units[i].starts;
    }
    const rertMWh = state.rert.outMW * h;
    // S-3's denominator: generation in the region (units, wind after OFGS, solar, diesel), as
    // AEMO's CDEII divides emissions by generation. Imports carry the neighbour's emissions and
    // count in neither term; the battery stores energy counted when it was generated (review
    // fix: per MWh SERVED, importing lowered the graded intensity with no change in the mix).
    // Phase 2a (C-7): wind and solar are integrated as scheduled (constant in the second); what
    // their over-frequency response backed off inside it (acc.spillMWs, per tick) was not
    // generated: it comes off the generation and is spilled energy.
    const ren = state.ren, connected = 1 - state.ofgs.trippedFrac;
    const backedOffMWh = acc.spillMWs / S_PER_H;
    let gen = rertMWh + (ren.windMW * connected + ren.solarMW) * h;
    for (let i = 0; i < NU; i++) gen += acc.unitMWs[i] / S_PER_H;
    sc.genMWh += gen - backedOffMWh;
    // Spilled energy (C-6): what the manual LIMIT and the dispatch's automatic cut held back this
    // second (wind net of OFGS: tripped wind is disconnected, not spilled), plus the back-off.
    // Counted and shown, never charged for (S-2: its cost is the fuel burned later).
    sc.spillMWh += backedOffMWh + ((ren.windCurtMW + ren.windAutoMW) * connected + ren.solarCurtMW + ren.solarAutoMW) * h;
    cost.fuel += fuel;
    cost.noLoad += noLoad;
    cost.starts += acc.startCost;
    cost.tie += state.tie.flowMW * h * state.env.neighbourPrice; // imports cost, exports credit (P-6 price-taking)
    cost.battWear += acc.battAbsMWs / S_PER_H * V.BATT_WEAR_PER_MWH;
    cost.dr += state.dr.mw * h * DR_PRICE;
    cost.rert += rertMWh * V.RERT_COST;
    // cost.flex: city-flexibility payments arrive with U-6 (Phase 2).
    sc.co2t += co2 + rertMWh * V.RERT_CO2;
    sc.marketBill += state.price.mwh * servedMWh; // information only (S-2): never in CUSTOMER COST
    sc.starts = starts;

    // The completed second's summary (AGC, FOS and the restore permissive read it).
    const fMean = acc.fSumHz / ticks;
    last.fMeanHz = fMean + 0;
    last.fMinHz = acc.fMinHz + 0;
    last.fMaxHz = acc.fMaxHz + 0;
    last.servedMW = acc.servedMWs / secs + 0;
    last.shedMW = acc.shedMWs / secs + 0;

    // Frequency record: extremes, time outside the normal band (on the second's mean, as
    // FOS reads it) and the Y-4 sparkline of the worst deviation per 2-h block.
    if (acc.fMinHz < sc.minHz) sc.minHz = acc.fMinHz;
    if (acc.fMaxHz > sc.maxHz) sc.maxHz = acc.fMaxHz;
    if (fMean < NORMAL_LO || fMean > NORMAL_HI) sc.outsideNormalS += secs;
    const sDone = Math.floor((state.tick - 1) / TPS); // the second being settled
    const blk = Math.min(SPARK_LAST, Math.max(0, Math.floor(sDone / SPARK_BLOCK_S)));
    const worst = Math.max(acc.fMaxHz - F0, F0 - acc.fMinHz);
    if (worst > sc.spark[blk]) sc.spark[blk] = worst;
  }
  resetAcc(acc);
}

// Split one second's shed energy by why the dark districts are dark (end-of-second
// shares; UFLS acts mid-second, so the split is exact only in total). If nothing is dark
// at the end of the second (a restore input landed mid-second), the energy is booked as
// UFLS: the category is unknowable then, and the total is what S-1 scores.
function splitShed(state, sc, shedMWh) {
  let total = 0, ufls = 0, directed = 0, task = 0;
  const ds = state.city.districts;
  for (let d = 0; d < ds.length; d++) {
    const x = ds[d];
    if (!x.dark) continue;
    total += x.share;
    if (x.shedBy === 'directed') directed += x.share;
    else if (x.shedBy === 'task') task += x.share;
    else ufls += x.share;
  }
  if (total > 0) {
    sc.uflsMWh += shedMWh * (ufls / total);
    sc.directedMWh += shedMWh * (directed / total);
    sc.taskMWh += shedMWh * (task / total);
  } else {
    sc.uflsMWh += shedMWh;
  }
}

/**
 * Derived scorecard numbers (S-1..S-3) from state.score. Implemented in stage A; S-3's
 * intensity is per MWh GENERATED in the region (score.genMWh; review fix, was per MWh served).
 * @returns {{lightsMWh:number, costDollars:number, centsPerKWh:number, co2t:number, co2tPerMWh:number, servedMWh:number}}
 */
export function scoreSummary(score) {
  const c = score.cost;
  const costDollars = c.fuel + c.noLoad + c.starts + c.tie + c.battWear + c.dr + c.rert + c.flex;
  const servedKWh = score.servedMWh * V.KWH_PER_MWH;
  return {
    lightsMWh: score.unservedMWh,
    costDollars,
    centsPerKWh: servedKWh > 0 ? costDollars * V.CENTS_PER_DOLLAR / servedKWh : 0,
    co2t: score.co2t,
    co2tPerMWh: score.genMWh > 0 ? score.co2t / score.genMWh : 0,
    servedMWh: score.servedMWh,
  };
}

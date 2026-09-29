// sim/market.js: merit-order price and the operator scorecard
// (spec P-5, P-6, P-7, P-8, P-11, H-12, S-1, S-2, S-3).
//
// STAGE B owner: "market + events". Contract: sim/README.md, section "market.js".
// scoreSummary() is implemented in stage A because observe() needs it; keep its output shape.

import {V} from './params.js';

/**
 * P-5 merit-order stack, cheapest first, in a TOTAL order: offer, then id (gtb1 before
 * gtb2), so ties never depend on sort stability. Blocks:
 *   units in mode 'on': thermal minimum-load block (minMW) at MIN_LOAD_OFFER plus the range
 *     minMW..availMW at the unit's offer; hydro the range 0..availMW at waterValue(storage);
 *   units loading / unloading / shutdown (H-1: present output only, no headroom): one block
 *     of their present schedMW at MIN_LOAD_OFFER;
 *   units starting / ready: their whole range at their offer only if their remaining time
 *     to MIN (rest of T1 + rest of the auto-sync wait + T2) <= STACK_START_WITHIN_S;
 *   units off with fleet.startBlock '' and t1S + t2S <= STACK_START_WITHIN_S (P-5 "able to
 *     start within 10 min"; the auto-sync wait is not counted): whole range at their offer;
 *   wind ren.windMW x (1 - ofgs.trippedFrac) and solar ren.solarMW at RENEWABLE_OFFER;
 *   industrial DR (DR_MW) at DR_PRICE while calls remain and none is active.
 * Never RERT (P-8: priced as if absent). Used by the price and, from Phase 1a, the Live
 * Stack (one function, P-5 accept). ids are machine ids, 'wind', 'solar', 'dr'.
 * @returns {Array<{id:string, kind:string, offer:number, mw:number}>}
 */
export function buildStack(state) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: market)');
}

/**
 * P-5..P-8 price for the current second. Market demand = env.demandMW - tie.flowMW -
 * battery.schedMW (the scheduled flows, P-5; RERT MW are NOT subtracted, P-8). Price =
 * offer of the block where the running total first covers market demand, plus
 * scarcityAdder(sec.r5MW / sec.lMW) (x = SCARCITY_FREE_X when lMW is 0), clamped by
 * clampPrice; the cap when the stack is exhausted or load is being shed (city.shedFrac > 0).
 * @returns {{mwh:number, marginalId:string, adder:number, exhausted:boolean, x:number}}
 */
export function clearPrice(state) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: market)');
}

/**
 * P-7 scarcity adder, a pure function of x = R5 / L: 0 for x >= SCARCITY_FREE_X; linear from
 * 0 to SCARCITY_AT_ONE between SCARCITY_FREE_X and 1; SCARCITY_AT_ONE + SCARCITY_QUAD (1 - x)^2
 * below 1. (x = 0.5 -> 1475; 1 -> 300; 1.1 -> 180; 1.25 -> 0; 2 -> 0.)
 * @param {number} x
 * @returns {number} $/MWh
 */
export function scarcityAdder(x) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: market)');
}

/** P-8: clamp to [PRICE_FLOOR, PRICE_CAP]. */
export function clampPrice(p) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: market)');
}

/** P-6 hydro water value at a storage fraction (0..1): HYDRO_WATER_VALUE, linear. */
export function waterValue(storageFrac) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: market)');
}

/** Write state.price = clearPrice(state). Called by step() last in each grid second. */
export function priceSecond(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: market)');
}

/**
 * Fold the last second's accumulators (state.acc, written by physics every tick) into
 * state.score, write the completed second's summary to state.last ({fMeanHz, fMinHz,
 * fMaxHz, servedMW, shedMW}: AGC and FOS read it), then fleet.resetAcc(state.acc). Called
 * by step() at the start of every grid second after the first, and once more when the day
 * ends (black or 04:00), when acc may hold fewer than 50 ticks (use acc.ticks, never 50).
 * S-1: unserved = integral of shed MW (acc.shedMWs: UFLS + directed + restore task), split
 * into uflsMWh / directedMWh / taskMWh by the dark districts' shedBy. S-2: fuel (offer x
 * MWh; hydro HYDRO_VAR_COST), no-load (sync units), starts (acc.startCost), tie (import x
 * neighbour price, export credited), battery wear, DR, RERT; never unserved x price (H-12).
 * S-3: CO2 t from generation (intensity = co2t / servedMWh, so shedding alone barely moves
 * it). Also minHz, maxHz, outsideNormalS, spark[] (worst |f - F0| per SPARK_BLOCK_S block),
 * marketBill (info only). Tie, wind (x (1 - ofgs.trippedFrac)), solar, RERT and DR MW are
 * constant within a second, so they are integrated here as MW x acc.ticks x PHYS_DT.
 */
export function settleSecond(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: market)');
}

/**
 * Derived scorecard numbers (S-1..S-3) from state.score. Implemented in stage A.
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
    co2tPerMWh: score.servedMWh > 0 ? score.co2t / score.servedMWh : 0,
    servedMWh: score.servedMWh,
  };
}

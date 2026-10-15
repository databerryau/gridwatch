// app/score.js: the ALL-IN score (Q-48, desk/README.md §30.7), pure: SUPPLY + VCR × MWh dark + VER
// × intensity × MWh asked for (SAIDI, SAIFI, MAIFI never added in); SCORE = 1000 × par's ÷ yours.

import {V} from '../sim/params.js';

/**
 * S-5 (Q-98): [letter, the most your ALL-IN may exceed par's, in MWh-equivalents (the gap ÷ VCR)], best first: the same
 * added mistake earns the same letter on any day, whatever par's total. F is a black grid.
 */
export const LETTERS = Object.freeze([['A', 10], ['B', 150], ['C', 600], ['D', Infinity]].map(l => Object.freeze(l)));
/** The card's one line on the letter (S-5). */
export const LETTER_RULE = 'Letter: how far behind par, in MWh dark at VCR: A within 10, B within 150, C within 600, D beyond; F if the grid goes black.';

/** X-45: dark energy under this is a moment's dip (a few kWh), not an outage: the OUTAGES row is $0. */
export const OUTAGE_MIN_MWH = 0.05;

/** A day's ALL-IN (dollars, MWh, tonnes) from obs.score or a par row; households: the scenario's. */
export function allIn(sc, households) {
  const lightsMWh = sc.lightsMWh || 0, askedMWh = (sc.servedMWh || 0) + lightsMWh;
  const co2tPerMWh = sc.co2tPerMWh > 0 ? sc.co2tPerMWh : 0;   // 0 while nothing was generated
  const co2tPriced = co2tPerMWh * askedMWh;                   // imports and dark load at your own mix
  const supply = sc.costDollars || 0, outage = lightsMWh < OUTAGE_MIN_MWH ? 0 : V.VCR * lightsMWh, carbon = V.VER * co2tPriced, total = supply + outage + carbon;
  return {supply, outage, carbon, total, askedMWh, co2tPriced,
    cents: askedMWh > 0 ? total * V.CENTS_PER_DOLLAR / (askedMWh * V.KWH_PER_MWH) : 0,   // c per kWh asked for
    perHousehold: households > 0 ? total / households : 0,
    // copied for the face
    unservedMWh: sc.unservedMWh === undefined ? lightsMWh : sc.unservedMWh, co2t: sc.co2t || 0, co2tPerMWh,
    supplyCents: sc.centsPerKWh || 0, saidiMin: sc.saidiMin || 0, saifi: sc.saifi || 0, maifi: sc.maifi || 0};
}

/** {points, letter, star, gapMWh} of `you` against `par` (allIn's); null with no par (or no total) to compare. gapMWh: (yours - par's) ÷ VCR. */
export function grade(you, par, black) {
  if (black) return {points: 0, letter: 'F', star: false};
  if (!par || !(par.total > 0) || !you || !(you.total > 0)) return null;
  const points = Math.round(1000 * par.total / you.total), gapMWh = (you.total - par.total) / V.VCR;
  return {points, letter: LETTERS.find(l => gapMWh <= l[1])[0], star: points >= 1000, gapMWh};
}

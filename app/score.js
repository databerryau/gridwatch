// app/score.js: the ALL-IN score (Q-48, desk/README.md §30.7), pure: SUPPLY + VCR × MWh dark + VER
// × intensity × MWh asked for (SAIDI, SAIFI, MAIFI never added in); SCORE = 1000 × par's ÷ yours.

import {V} from '../sim/params.js';

/**
 * S-5 (Q-98): [letter, the most your ALL-IN may exceed par's, in MWh-equivalents (the gap ÷ VCR)], best first: the same
 * added mistake earns the same letter on any day, whatever par's total. F is a black grid.
 */
export const LETTERS = Object.freeze([['A', 10], ['B', 150], ['C', 600], ['D', Infinity]].map(l => Object.freeze(l)));
/**
 * W7 (Q-118): the rank beside each letter, everywhere the letter shows. 'A★' is an A at STAR_POINTS or more (the ★): Marg's
 * own chair. F, a black grid, is the crew that restarts it.
 */
/**
 * W8 (Q-128): the ★, MARG'S CHAIR, needs this many points: a clear win over par, not par itself. Measured once (2026-10-21,
 * the coach-following player of tools/follow.mjs on 96 dailies over the whole calendar, graded on the stored par): at 1000 it
 * sat in the chair on 56% of them, at 1040 on 13% (weekdays 13%, Saturdays 16%).
 */
export const STAR_POINTS = 1040;
export const RANKS = Object.freeze({D: 'TRAINEE', C: 'SHIFT OPERATOR', B: 'SENIOR OPERATOR', A: 'SHIFT SUPERVISOR', 'A★': 'MARG\'S CHAIR', F: 'BLACK START CREW'});
/** The card's one line on the letter (S-5), each letter with its rank as the SCORE line shows it (Q-118). */
export const LETTER_RULE = 'Letter: how far behind par, in MWh dark at VCR: A ★ ' + RANKS['A★'] + ' at ' + STAR_POINTS + ' points or more, ' +
  LETTERS.map(([l, mwh]) => l + ' ' + RANKS[l] + (mwh < Infinity ? ' within ' + mwh : ' beyond')).join(', ') + '; F ' + RANKS.F + ' if the grid goes black.';
/** Q-118: a grade's rank (grade's {letter, star}, or a history entry's), '' with no letter. */
export const rankOf = g => (g && g.letter ? RANKS[g.letter === 'A' && g.star ? 'A★' : g.letter] || '' : '');
/** Q-118: the letter, its ★ and its rank, as every face shows them: 'A ★ MARG\'S CHAIR', 'C SHIFT OPERATOR', 'F BLACK START CREW'. */
export const letterText = g => (g && g.letter ? g.letter + (g.star ? ' ★' : '') + (rankOf(g) ? ' ' + rankOf(g) : '') : '');

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

/** S-7: the MWh par shed (UFLS and directed) on a score or a par row: over OUTAGE_MIN_MWH, the day is a Hard day. */
export const parShedMWh = sc => (sc ? (sc.uflsMWh || 0) + (sc.directedMWh || 0) : 0);
/** S-7: a Hard day's points are capped here (yours could fall below par's outage-free total by more than it). */
export const HARD_MAX_POINTS = 2000;

/**
 * {points, letter, star, gapMWh, hardMWh} of `you` against `par` (allIn's); null with no par (or no total) to compare.
 * gapMWh: (yours - par's) ÷ VCR. S-7: `shedMWh`, the MWh par itself shed (parShedMWh): on a Hard day (over
 * OUTAGE_MIN_MWH) the points compare par's outage-free part, its total less VCR × shedMWh, with yours less the same,
 * so a par that sheds does not make a win trivial; the letter (the gap) is unchanged. hardMWh: that MWh, on a Hard day only.
 */
export function grade(you, par, black, shedMWh = 0) {
  if (black) return {points: 0, letter: 'F', star: false};
  if (!par || !(par.total > 0) || !you || !(you.total > 0)) return null;
  const hard = shedMWh >= OUTAGE_MIN_MWH ? shedMWh : 0, off = V.VCR * hard, p = par.total - off, y = you.total - off;
  const points = hard ? Math.min(HARD_MAX_POINTS, Math.round(1000 * p / Math.max(y, p * 1000 / HARD_MAX_POINTS))) : Math.round(1000 * par.total / you.total);
  const gapMWh = (you.total - par.total) / V.VCR;
  const g = {points, letter: LETTERS.find(l => gapMWh <= l[1])[0], star: points >= STAR_POINTS, gapMWh};
  return hard ? Object.assign(g, {hardMWh: hard}) : g;
}
export const BUILD = '2026-10-22';   // W6 (F-9): app/build.js's, copied; app/boot.js compares

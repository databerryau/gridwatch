// app/marg.js: O-6, Marg, the supervisor's voice. DOM-free.
//
// 31 years on the desk; dry; never blames. At most MARG_WORDS words a line, and every line carries a live
// number or a decision. She speaks at fixed beats only (app/game.js margBeat):
//   take      the briefing's beat, at TAKE THE DESK: the day's peak and when
//   act2      midday (sim/clock.js actAt 2): the low the rooftops make, and what the battery is for
//   act3      the evening (actAt 3): the peak again, and what is too slow for it now
//   watch     the first watch's settle (a first shift only): where frequency stopped and what caught it
//   handover  21:00, the night shift takes the desk: "I've got the night. Your day is scored at four."
//   verdict   the end card's closing line: the score, its letter and rank (W7, Q-118), then the share card's closing line
//             (W6, Y-7: content/closing.js)
//   ask:<id>  a first shift's first ask for a control (O-3: its plate lifts), one line a control
//   first:<k> W7 (Q-124, in place of O-4's concept cards and O-5's "why?"): the first time this browser's player meets a
//             negative price, coal held at its minimum while solar spills, or the relays shedding (MARG_FIRSTS): what it
//             means, once (app/game.js keeps it in the seen memory); never in a watch, nor once the night shift has the desk,
//             nor while the tray is full of warnings (it would go straight to the LOG): it waits for room, still true
// A day holds at most MARG_FIRST lines on a first shift and MARG_LATER on later days; a beat speaks once. A first-time
// line keeps room for the fixed beats still to come (beatsAhead): on a later day that leaves it one line, and one that
// cannot speak waits for another day.

import {RANKS, rankOf} from './score.js';
import {V} from '../sim/params.js';
import {priceText} from '../render/format.js';
import {NIGHT_S} from '../sim/clock.js';

/** O-6: words in a line; lines in a first shift's day, and in a later day's. */
export const MARG_WORDS = 20, MARG_FIRST = 25, MARG_LATER = 6;
/** The tray's sender for her lines. */
export const MARG_FROM = 'MARG, SUPERVISOR';
/** O-6: the fixed handover line. */
export const HANDOVER = 'I\'ve got the night. Your day is scored at four.';

/** A day's memory: whether it is a first shift, and what she has said. */
export function createMarg(first) { return {first: !!first, said: [], beats: {}}; }

/**
 * Say `text` at `key`'s beat, once a day, within the day's limit less `reserve` lines (kept for beats still to come): the
 * line ({key, text, atS, target}), or null.
 */
export function margSay(m, key, text, atS, target = 'gauge-n1', reserve = 0) {
  if (!text || m.beats[key] || m.said.length + reserve >= (m.first ? MARG_FIRST : MARG_LATER)) return null;
  m.beats[key] = true;
  const w = String(text).trim().split(/\s+/), line = {key, text: w.slice(0, MARG_WORDS).join(' '), atS, target};
  m.said.push(line);
  return line;
}

/**
 * W7 (Q-124): the fixed beats still to come today, which a first-time line leaves room for: act2 and act3 before their act
 * (`act`, sim/clock.js actAt's), the handover and the verdict until said, and on a first shift the first watch's settle.
 */
export function beatsAhead(m, act, watched) {
  const b = m.beats;
  return (act < 2 && !b.act2 ? 1 : 0) + (act < 3 && !b.act3 ? 1 : 0) + (b.handover ? 0 : 1) + (b.verdict ? 0 : 1) + (m.first && !watched && !b.watch ? 1 : 0);
}

/** W7 (Q-124): the first-time lines' keys, in the order they are said when more than one is new: the relays (just now) first. */
export const MARG_FIRSTS = Object.freeze(['relays', 'price', 'coal']);
/** Q-124: a coal unit this close to its minimum load (MW) is at it (its schedule is clamped there). */
export const AT_MIN_MW = 0.5;
const coalAtMin = u => u.mode === 'on' && V.MACHINES[u.k].station === 'coal' && u.schedMW <= V.MACHINES[u.k].minMW + AT_MIN_MW;
/**
 * Q-124: the first-time things true now, in MARG_FIRSTS' order: the relays (UFLS) have shed a district today (the verdict's
 * memory `mem`, app/verdict.js: its spells, so the line may wait for the tray and still be true); a price below zero as the
 * Live Stack shows it (to the dollar); utility solar spilled over SURPLUS_MIN_MW (MIN GEN's floor) while a coal unit sits at
 * its minimum (the sim's state `st`). Cheap: the game asks it every frame, and tests/lib/play.js between frames.
 */
export function firstsNow(st, mem) {
  const out = [];
  if (mem && mem.spells.some(x => x.by === 'ufls')) out.push('relays');
  if (Math.round(st.price.mwh) < 0) out.push('price');
  if (st.env.solarAvailMW - st.ren.solarMW > V.SURPLUS_MIN_MW && st.units.some(coalAtMin)) out.push('coal');
  return out;
}

const mw = x => (Math.round(x / 100) * 100).toLocaleString('en-AU');
const hm = s => { const h = Math.floor(s / 3600 + 4) % 24, mi = Math.floor((s % 3600) / 60); return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); };
// the forecast's highest (or lowest) P50 from `fromS`: {mw, atS}
function extreme(fc, fromS, low) {
  let best = null;
  if (!fc || !fc.n) return null;
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS, v = fc.demandP50[k];
    if (t < fromS) continue;
    if (!best || (low ? v < best.mw : v > best.mw)) best = {mw: v, atS: t};
  }
  return best;
}

/** O-6: her words for each beat, from what the desk shows (obs, the day-ahead forecast `fc`). */
export const MARG_LINES = Object.freeze({
  take: (obs, fc) => { const p = extreme(fc, obs.s); return p ? 'Morning. Peak about ' + mw(p.mw) + ' MW at ' + hm(p.atS) + '. Commit early: starts take time.' : ''; },
  act2: (obs, fc) => { const l = extreme(fc, obs.s, true); return l ? 'Rooftops take midday down to about ' + mw(l.mw) + ' MW. Spill is cheap: charge the battery then.' : ''; },
  act3: (obs, fc) => { const p = extreme(fc, obs.s); return p ? 'Evening: about ' + mw(p.mw) + ' MW by ' + hm(p.atS) + '. Anything slower than a gas turbine is late now.' : ''; },
  watch: c => (c.lostMW < 0 ? 'Peaked at ' + c.extremeHz.toFixed(2) + ' Hz: solar and wind backed off. A trip can push frequency up, too.'
    : 'Stopped at ' + c.extremeHz.toFixed(2) + ' Hz. Spin, battery, governors: that is the order. Your job is before it.'),
  handover: () => HANDOVER,
  // (W6, Y-7: `closing` is the share card's closing line, so the card quotes her; with no grade, par could not finish.
  // W7, Q-118: the rank beside the letter; at A ★ the player has outplayed her coach's line and sits in her chair)
  verdict: (g, closing) => (g ? g.points + ' points, ' + g.letter + (g.star ? ' ★' : '') + (rankOf(g) ? ': ' + rankOf(g) : '') + '. ' +
    (rankOf(g) === RANKS['A★'] ? 'Don\'t get comfortable. ' : '') +
    (closing || (g.letter === 'A' ? 'Clean shift. Same again tomorrow.' : 'Read the moment, then take tomorrow\'s.'))
    : closing ? 'No score today. ' + closing : ''),
  // O-3: a first shift's first ask for a control
  ask: id => ASK[id] || '',
  // W7 (Q-124): the first-time lines (firstsNow says when). The price as the Live Stack shows it; generators at a price
  // below zero pay to be dispatched (the NEM's floor is -$1,000).
  price: obs => 'Price below zero: ' + priceText(obs.price.mwh) + '/MWh. More power than the city can use, so generators pay to run. Store what you can.',
  // coal at its minimum stable load: below it the boiler's flame is unstable; stopped now, the unit would shut down (T4), sit
  // out its minimum down time and start again (to its breaker's close): past the evening's peak (the day-ahead `fc`'s, else
  // 21:00), or that many whole hours
  coal: (obs, fc) => {
    const u = obs.units.find(x => x.cls === 'coal' && x.mode === 'on' && x.schedMW <= x.minMW + AT_MIN_MW), m = u && V.MACHINES.find(q => q.id === u.id);
    if (!m) return '';
    const backS = obs.s + m.t4S + m.minDownS + u.startToMinS - m.t2S, p = extreme(fc, obs.s), spill = obs.solar.availMW - obs.solar.outMW;
    return 'Coal\'s at its minimum: lower, it won\'t burn steady. Solar spills ' + (Math.round(spill / 10) * 10).toLocaleString('en-AU') + ' MW. Stopped, coal\'s out ' +
      (backS > (p ? p.atS : NIGHT_S) ? 'past the evening.' : Math.floor((backS - obs.s) / 3600) + ' hours.');
  },
  // the relays (UFLS): the districts they have shed today (the verdict's memory `mem`: its spells)
  relays: (obs, fc, mem) => {
    const n = mem ? new Set(mem.spells.filter(x => x.by === 'ufls').map(x => x.id)).size : 0;
    return n ? 'The relays shed ' + n + (n === 1 ? ' district' : ' districts') + ' on their own: frequency fell below ' + V.UFLS_FIRST_HZ + ' Hz. Last net before a blackout.' : '';
  },
});
/** Q-124: where each first-time line's SHOW ME points. */
export const FIRST_TARGET = Object.freeze({price: 'stack', coal: 'stack', relays: 'bay-restore'});
// (the controls a first shift's plates cover, each with its one line; O-3)
const ASK = {
  start: 'START is yours. A gas turbine takes minutes; coal takes hours. The line counts it down.',
  stop: 'Stopping saves fuel, but a stopped unit takes its start time to come back.',
  guard: 'The GUARD holds battery MW back for a trip. It fires in under a second.',
  battery: 'The battery buys minutes, not hours. Charge it when power is cheap.',
  tie: 'The tie imports from next door. It can trip too: count it as a unit.',
  restore: 'Close one feeder at a time, five minutes apart. Cold load comes back heavier.',
  dr: 'Demand response: industry stops for an hour. Dear, and only a few a day.',
  rert: 'The diesel is the last card: twenty minutes here, and the dearest MW you buy.',
  shed: 'Shedding a district holds frequency. Better that than the relays doing it for you.',
  city: 'The suburbs can soak or delay load. They remember being asked too often.',
};

// app/marg.js: O-6, Marg, the supervisor's voice. DOM-free.
//
// 31 years on the desk; dry; never blames. At most MARG_WORDS words a line, and every line carries a live
// number or a decision. She speaks at fixed beats only (app/game.js margBeat):
//   take      the briefing's beat, at TAKE THE DESK: the day's peak and when
//   act2      midday (sim/clock.js actAt 2): the low the rooftops make, and what the battery is for
//   act3      the evening (actAt 3): the peak again, and what is too slow for it now
//   watch     the first watch's settle (a first shift only): where frequency stopped and what caught it
//   handover  21:00, the night shift takes the desk: "I've got the night. Your day is scored at four."
//   verdict   the end card's closing line: the score, then the share card's closing line (W6, Y-7: content/closing.js)
//   ask:<id>  a first shift's first ask for a control (O-3: its plate lifts), one line a control
// A day holds at most MARG_FIRST lines on a first shift and MARG_LATER on later days; a beat speaks once.

/** O-6: words in a line; lines in a first shift's day, and in a later day's. */
export const MARG_WORDS = 20, MARG_FIRST = 25, MARG_LATER = 6;
/** The tray's sender for her lines. */
export const MARG_FROM = 'MARG, SUPERVISOR';
/** O-6: the fixed handover line. */
export const HANDOVER = 'I\'ve got the night. Your day is scored at four.';

/** A day's memory: whether it is a first shift, and what she has said. */
export function createMarg(first) { return {first: !!first, said: [], beats: {}}; }

/** Say `text` at `key`'s beat, once a day, within the day's limit: the line ({key, text, atS, target}), or null. */
export function margSay(m, key, text, atS, target = 'gauge-n1') {
  if (!text || m.beats[key] || m.said.length >= (m.first ? MARG_FIRST : MARG_LATER)) return null;
  m.beats[key] = true;
  const w = String(text).trim().split(/\s+/), line = {key, text: w.slice(0, MARG_WORDS).join(' '), atS, target};
  m.said.push(line);
  return line;
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
  // (W6, Y-7: `closing` is the share card's closing line, so the card quotes her; with no grade, par could not finish)
  verdict: (g, closing) => (g ? g.points + ' points, ' + g.letter + '. ' + (closing || (g.letter === 'A' ? 'Clean shift. Same again tomorrow.' : 'Read the moment, then take tomorrow\'s.'))
    : closing ? 'No score today. ' + closing : ''),
  // O-3: a first shift's first ask for a control
  ask: id => ASK[id] || '',
});
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

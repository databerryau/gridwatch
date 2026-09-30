// app/director.js: chooses the playback rate (spec F-5, K-15, D-6). The sim never does.
//
// Phase 0.2 modes (F-5 table, the parts that exist before Phase 1):
//   CRUISE  a flat 120x (the D-2 profile arrives in Phase 2)
//   DEBUG   the bench's speed selector (0.25x, 1x, 60x, 240x, 2100x) for feeling the physics
//   WATCH   K-15 full schedule over the first WATCH_S grid-seconds after a contingency:
//           0-3 s at 0.15x, 3-10 s at 1x, 10-30 s at 10x; the desk is locked (the sim
//           refuses inputs, K-15). SKIP plays the rest of that watch at the cruise speed.
//   PAUSE   Space; a hidden tab (F-5); the day's end.
// FAST, RESPOND and FOCUS come with the desk (Phase 1).
//
// Pure and DOM-free (Node tests use it). rate() is asked between every two ticks, so it
// reads only a few fields that observe() also exposes (tick, over, black, inWatch and the
// latest contingency's startTick / watchEndTick) straight from state, without allocating.

import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;

/** F-5: before Phase 2 CRUISE is a flat 120x. */
export const FLAT_RATE = 120;
/** Debug speeds offered by the bench (grid seconds per real second); 2100x is D-2's fastest. */
export const DEBUG_RATES = Object.freeze([0.25, 1, 60, FLAT_RATE, 240, 2100]);
/** K-15 full version: [fromS, toS) of the watch at `rate`; the grid clock advances exactly WATCH_S. */
export const WATCH_SCHEDULE = Object.freeze([
  Object.freeze({fromS: 0, toS: 3, rate: 0.15}),
  Object.freeze({fromS: 3, toS: 10, rate: 1}),
  Object.freeze({fromS: 10, toS: V.WATCH_S, rate: 10}),
]);

/** Real seconds the full watch takes (29 s for 0.15x/1x/10x over 3/7/20 grid-s). */
export function watchRealS(schedule = WATCH_SCHEDULE) {
  return schedule.reduce((a, seg) => a + (seg.toS - seg.fromS) / seg.rate, 0);
}

/** Rate of the watch schedule `elapsedTicks` after the contingency's first tick. */
export function watchRate(elapsedTicks, schedule = WATCH_SCHEDULE) {
  const s = elapsedTicks / TPS;
  for (const seg of schedule) if (s < seg.toS) return seg.rate;
  return schedule[schedule.length - 1].rate;
}

/**
 * @param {{speed?:number, paused?:boolean}} [opts]
 * @returns {object} director: {speed, paused, hidden, skipN}
 */
export function createDirector(opts) {
  const o = opts || {};
  return {speed: o.speed === undefined ? FLAT_RATE : o.speed, paused: o.paused === undefined ? true : o.paused,
    hidden: false, skipN: -1};
}

// The latest contingency record while its watch runs, else null (the sim's inWatch).
function watching(state) {
  if (state.contIdx < 0) return null;
  const c = state.conts[state.contIdx];
  return state.tick < c.watchEndTick ? c : null;
}

/** The rate right now (grid seconds per real second). Cheap: called between every two ticks. */
export function rateOf(d, state) {
  if (state.over || d.paused || d.hidden) return 0;
  const c = watching(state);
  if (c !== null && c.n !== d.skipN) return watchRate(state.tick - c.startTick);
  return d.speed;
}

/**
 * The rate that should have governed the tick just run (state.tick - 1), knowing what that
 * tick revealed: a contingency opened during it makes it the watch's first tick (the loop
 * re-charges it; app/loop.js rateLast). Otherwise the same as the rate before it.
 */
export function rateOfLastTick(d, state) {
  if (d.paused || d.hidden || state.contIdx < 0) return d.paused || d.hidden ? 0 : d.speed;
  const c = state.conts[state.contIdx], t = state.tick - 1;
  if (t >= c.startTick && t < c.watchEndTick && c.n !== d.skipN) return watchRate(t - c.startTick);
  return d.speed;
}

/**
 * What the rate badge shows (F-5: the rate is always visible).
 * @returns {{mode:'OVER'|'HIDDEN'|'PAUSE'|'WATCH'|'CRUISE'|'DEBUG', rate:number, watchS:number, locked:boolean}}
 *   watchS: grid seconds since the contingency (-1 outside a watch); locked: desk locked (K-15).
 */
export function modeOf(d, state) {
  const c = watching(state);
  const watchS = c ? (state.tick - c.startTick) / TPS : -1;
  const locked = c !== null;
  const rate = rateOf(d, state);
  if (state.over) return {mode: 'OVER', rate, watchS, locked};
  if (d.hidden) return {mode: 'HIDDEN', rate, watchS, locked};
  if (d.paused) return {mode: 'PAUSE', rate, watchS, locked};
  if (c && c.n !== d.skipN) return {mode: 'WATCH', rate, watchS, locked};
  return {mode: d.speed === FLAT_RATE ? 'CRUISE' : 'DEBUG', rate, watchS, locked};
}

/** Space. */
export function togglePause(d) {
  d.paused = !d.paused;
  return d.paused;
}

/** Debug speed selector; any positive rate up to the fastest debug rate. */
export function setSpeed(d, rate) {
  if (!(rate > 0) || rate > DEBUG_RATES[DEBUG_RATES.length - 1]) throw new Error('setSpeed: bad rate ' + rate);
  d.speed = rate;
}

/** SKIP: play the rest of the current watch at the chosen speed (viewing never changes the outcome, K-15). */
export function skipWatch(d, state) {
  const c = watching(state);
  if (c) d.skipN = c.n;
  return c !== null;
}

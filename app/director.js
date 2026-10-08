// app/director.js: chooses the playback rate (spec F-5, K-15, K-16, D-6). The sim never does.
//
// Modes (desk/README.md §2), precedence OVER > HIDDEN > ALARMS > PAUSE > WATCH > RESPOND-CARD >
// FOCUS > RESPOND > FAST > CRUISE:
//   CRUISE        a flat 120x (the D-2 profile arrives in Phase 2)
//   FAST          3 x CRUISE while F is held; it ends on F up, a new P1/P2 alarm, a watch, the
//                 respond card, RESPOND or FOCUS (the game calls endFast / the frame clears it)
//   WATCH         K-15 over the first WATCH_S grid-seconds after a contingency: full 0.15x / 1x /
//                 10x over 0-3 / 3-10 / 10-30 s, compact 0.5x / 2x / 20x. The desk is locked (the
//                 sim refuses inputs). SKIP plays the rest of that watch at CRUISE.
//   RESPOND-CARD  rate 0 from the watch's end until the card is dismissed (Enter or any desk
//                 input): the only hold on the clock besides PAUSE (K-16)
//   RESPOND       30x from the card's dismissal until frequency is back in 49.85-50.15 Hz
//                 (contingency.backInBandTick >= 0) or 5 grid-min after the card, then CRUISE
//   FOCUS         1x while a synchroscope is open (sim scope.unit !== '') or for 2 grid-s after
//                 a restore input (the breaker being closed, K-13)
//   PAUSE         Space; a hidden tab (HIDDEN); the day's end (OVER)
//   ALARMS        rate 0 while the alarm panel holds the clock (d.held, Q-46); d.paused is untouched
//   DEBUG         the bench's speed selector (bench.html only): any speed other than CRUISE
//
// A director made with {game: true} runs every mode above; without it (the bench) it is the
// Phase 0.2 director: CRUISE/DEBUG, the full watch, PAUSE, and nothing that holds the clock.
//
// Watch version (K-15): full the first time ever and on anything new (the first UFLS operation
// seen, the first HIGH RoCoF); otherwise compact. The version is chosen on the watch's first
// tick (a first HIGH RoCoF is known then: the record's rocofHzS) and upgraded to full for the
// rest of the watch when a first-ever UFLS operation happens during it: the relays deserve the
// slow motion (decision: most fun within realism, OD-17). `d.seen` ({watch, ufls, rocof}) is
// the memory the game loads from and saves to localStorage (gridwatch:v4:seen, C-8: optional).
// Esc skips only once a full watch has been seen (game mode; the bench always may).
//
// Viewing never changes the outcome (C-7): the director only picks the rate. Pure and DOM-free
// (Node tests use it). rate() is asked between every two ticks, so it reads a few fields
// straight from state without allocating.

import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;

/** F-5: before Phase 2 CRUISE is a flat 120x. */
export const FLAT_RATE = 120;
/** FAST is this multiple of CRUISE while F is held (desk/README.md §2). */
export const FAST_FACTOR = 3;
/** RESPOND's rate after the card (D-5 / §4.1). */
export const RESPOND_RATE = 30;
/** RESPOND ends at the latest this many grid seconds after the card opened. */
export const RESPOND_MAX_S = 5 * V.S_PER_MIN;
/** FOCUS: the synchroscope and a restore close play at 1x. */
export const FOCUS_RATE = 1;
/** FOCUS after a restore input lasts this many grid seconds. */
export const RESTORE_FOCUS_S = 2;
/** Debug speeds offered by the bench (grid seconds per real second); 2100x is D-2's fastest. */
export const DEBUG_RATES = Object.freeze([0.25, 1, 60, FLAT_RATE, 240, 2100]);

const segs = rates => Object.freeze([
  Object.freeze({fromS: 0, toS: 3, rate: rates[0]}),
  Object.freeze({fromS: 3, toS: 10, rate: rates[1]}),
  Object.freeze({fromS: 10, toS: V.WATCH_S, rate: rates[2]}),
]);
/** K-15 full version: [fromS, toS) of the watch at `rate`; the grid clock advances exactly WATCH_S. */
export const WATCH_SCHEDULE = segs([0.15, 1, 10]);
/** K-15 compact version (~11 real s): the same segments at 0.5x / 2x / 20x. */
export const WATCH_SCHEDULE_COMPACT = segs([0.5, 2, 20]);
/** Schedules by version name. */
export const WATCH_SCHEDULES = Object.freeze({full: WATCH_SCHEDULE, compact: WATCH_SCHEDULE_COMPACT});
/** A contingency with |RoCoF| above this (Hz/s) is a HIGH RoCoF (K-8 tile, K-15 "anything new"). */
export const HIGH_ROCOF_HZ_S = 1;

/** Real seconds a watch takes (29 s full, 10.5 s compact). */
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
 * @param {{speed?:number, paused?:boolean, game?:boolean, seen?:{watch?:boolean, ufls?:boolean, rocof?:boolean}}} [opts]
 * @returns {object} director (plain object)
 */
export function createDirector(opts) {
  const o = opts || {};
  return {
    speed: o.speed === undefined ? FLAT_RATE : o.speed,
    paused: o.paused === undefined ? true : o.paused,
    hidden: false,
    held: false,               // the alarm panel holds the clock (ALARMS)
    skipN: -1,                // contingency n whose watch is being skipped
    game: !!o.game,            // FAST / RESPOND-CARD / RESPOND / FOCUS and the compact watch
    fast: false, fastN: -1,    // F held; the contingency count when it was pressed (a new one ends it)
    seen: Object.assign({watch: false, ufls: false, rocof: false}, o.seen || {}),
    versionN: -1, version: 'full', upgraded: false, // the watch version chosen for contingency versionN
    cardDoneN: -1,             // latest contingency n whose respond card was dismissed
    cardAtTick: -1,            // tick the latest card was dismissed (RESPOND runs from it)
    focusUntilTick: -1,        // FOCUS after a restore input until this tick
    seenDirty: false,          // seen changed: the game saves it
  };
}

// The latest contingency record while its watch runs, else null (the sim's inWatch).
function watching(state) {
  if (state.contIdx < 0) return null;
  const c = state.conts[state.contIdx];
  return state.tick < c.watchEndTick ? c : null;
}

// Choose (once) and upgrade the watch version for contingency c. Mutates only the director.
function versionFor(d, c) {
  if (!d.game) return 'full';
  if (d.versionN !== c.n) {
    d.versionN = c.n;
    d.upgraded = false;
    const newRocof = !d.seen.rocof && Math.abs(c.rocofHzS) > HIGH_ROCOF_HZ_S;
    d.version = !d.seen.watch || newRocof ? 'full' : 'compact';
  }
  if (d.version === 'compact' && !d.seen.ufls && c.uflsStages > 0) { d.version = 'full'; d.upgraded = true; }
  return d.version;
}

/** The watch schedule for contingency c (full or compact). */
export function scheduleFor(d, c) {
  return WATCH_SCHEDULES[versionFor(d, c)];
}

// Game-mode state checks (all cheap).
function cardOpen(d, state) {
  if (!d.game || state.contIdx < 0) return false;
  const c = state.conts[state.contIdx];
  return state.tick >= c.watchEndTick && c.n !== d.cardDoneN;
}
function responding(d, state) {
  if (!d.game || state.contIdx < 0) return false;
  const c = state.conts[state.contIdx];
  if (c.n !== d.cardDoneN) return false;
  return c.backInBandTick < 0 && state.tick < c.watchEndTick + RESPOND_MAX_S * TPS;
}
function focusing(d, state) {
  if (!d.game) return false;
  const sc = state.scope;
  return (sc !== undefined && sc !== null && sc.unit !== '' && sc.unit !== undefined) || state.tick < d.focusUntilTick;
}
function contCount(state) {
  return state.contIdx < 0 ? 0 : state.conts[state.contIdx].n + 1;
}
function fastNow(d, state) {
  return d.game && d.fast && d.fastN === contCount(state);
}

/** The rate right now (grid seconds per real second). Cheap: called between every two ticks. */
export function rateOf(d, state) {
  if (state.over || d.paused || d.hidden || d.held) return 0;
  const c = watching(state);
  if (c !== null) {
    if (c.n !== d.skipN) return watchRate(state.tick - c.startTick, scheduleFor(d, c));
    return d.speed;
  }
  if (!d.game) return d.speed;
  if (cardOpen(d, state)) return 0;
  if (focusing(d, state)) return FOCUS_RATE;
  if (responding(d, state)) return RESPOND_RATE;
  if (fastNow(d, state)) return FAST_FACTOR * d.speed;
  return d.speed;
}

/**
 * The rate that should have governed the tick just run (state.tick - 1), knowing what that
 * tick revealed: a contingency opened during it makes it the watch's first tick (the loop
 * re-charges it; app/loop.js rateLast), and a first UFLS operation upgrades a compact watch.
 * Bench: otherwise the same as the rate before it (d.speed). Game: otherwise 0, which the loop
 * reads as "charged correctly" (it re-charges only for a positive rate that differs).
 */
export function rateOfLastTick(d, state) {
  if (d.paused || d.hidden || d.held) return 0;
  if (state.contIdx >= 0) {
    const c = state.conts[state.contIdx], t = state.tick - 1;
    if (t >= c.startTick && t < c.watchEndTick && c.n !== d.skipN) return watchRate(t - c.startTick, scheduleFor(d, c));
  }
  return d.game ? 0 : d.speed;
}

/**
 * What the rate badge shows (F-5: the rate is always visible).
 * @returns {{mode:'OVER'|'HIDDEN'|'ALARMS'|'PAUSE'|'WATCH'|'RESPOND-CARD'|'FOCUS'|'RESPOND'|'FAST'|'CRUISE'|'DEBUG',
 *   rate:number, watchS:number, locked:boolean, watchVersion:'full'|'compact'|null}}
 *   watchS: grid seconds since the contingency (-1 outside a watch); locked: desk locked (K-15);
 *   watchVersion: the version of the watch in progress (null outside one or while skipped).
 */
export function modeOf(d, state) {
  const c = watching(state);
  const watchS = c ? (state.tick - c.startTick) / TPS : -1;
  const locked = c !== null;
  const rate = rateOf(d, state);
  const watchVersion = c && c.n !== d.skipN ? versionFor(d, c) : null;
  // canSkip: Esc would skip this watch now (in the game, only once a full watch has been seen)
  const canSkip = !!c && c.n !== d.skipN && (!d.game || !!d.seen.watch);
  const r = mode => ({mode, rate, watchS, locked, watchVersion, canSkip});
  if (state.over) return r('OVER');
  if (d.hidden) return r('HIDDEN');
  if (d.held) return r('ALARMS');
  if (d.paused) return r('PAUSE');
  if (c && c.n !== d.skipN) return r('WATCH');
  if (!d.game) return r(d.speed === FLAT_RATE ? 'CRUISE' : 'DEBUG');
  if (c) return r('CRUISE'); // a skipped watch plays at CRUISE
  if (cardOpen(d, state)) return r('RESPOND-CARD');
  if (focusing(d, state)) return r('FOCUS');
  if (responding(d, state)) return r('RESPOND');
  if (fastNow(d, state)) return r('FAST');
  return r(d.speed === FLAT_RATE ? 'CRUISE' : 'DEBUG');
}

/**
 * Once per frame (game): FAST ends when a watch, the card, RESPOND, FOCUS or ALARMS is on; a watch
 * that has ended marks what it showed as seen. Returns true when `d.seen` changed (save it).
 */
export function directorFrame(d, state) {
  const m = modeOf(d, state).mode;
  if (m === 'WATCH' || m === 'RESPOND-CARD' || m === 'RESPOND' || m === 'FOCUS' || m === 'ALARMS') d.fast = false;
  let changed = false;
  if (state.contIdx >= 0) {
    const c = state.conts[state.contIdx];
    if (state.tick >= c.watchEndTick && d.versionN === c.n) {
      const shown = c.n !== d.skipN || d.version === 'full';
      if (d.version === 'full' && c.n !== d.skipN && !d.seen.watch) { d.seen.watch = true; changed = true; }
      if (shown && c.uflsStages > 0 && !d.seen.ufls) { d.seen.ufls = true; changed = true; }
      if (shown && Math.abs(c.rocofHzS) > HIGH_ROCOF_HZ_S && !d.seen.rocof) { d.seen.rocof = true; changed = true; }
    }
  }
  if (changed) d.seenDirty = true;
  return changed;
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

/** F held (on) or released (off). Pressing it during a watch, the card, FOCUS or ALARMS does nothing. */
export function setFast(d, state, on) {
  if (!d.game) return false;
  if (!on) { d.fast = false; return false; }
  const m = modeOf(d, state).mode;
  if (m === 'WATCH' || m === 'RESPOND-CARD' || m === 'RESPOND' || m === 'FOCUS' || m === 'ALARMS') return false;
  d.fast = true;
  d.fastN = contCount(state);
  return true;
}

/** A new P1/P2 alarm ends FAST (desk/README.md §2). */
export function endFast(d) {
  d.fast = false;
}

/**
 * SKIP (Esc): play the rest of the current watch at CRUISE (viewing never changes the
 * outcome, K-15). In the game, only once a full watch has been seen. Returns true if skipped.
 */
export function skipWatch(d, state) {
  const c = watching(state);
  if (!c) return false;
  if (d.game && !d.seen.watch) return false;
  d.skipN = c.n;
  return true;
}

/** True while the respond card holds the clock (K-16). */
export function respondCardOpen(d, state) {
  return cardOpen(d, state);
}

/** Dismiss the respond card (Enter, or any desk input): RESPOND starts. Returns true if it was open. */
export function dismissCard(d, state) {
  if (!cardOpen(d, state)) return false;
  d.cardDoneN = state.conts[state.contIdx].n;
  d.cardAtTick = state.tick;
  return true;
}

/** A restore input was accepted: FOCUS (1x) for RESTORE_FOCUS_S grid seconds. */
export function focusRestore(d, state) {
  d.focusUntilTick = state.tick + RESTORE_FOCUS_S * TPS;
}

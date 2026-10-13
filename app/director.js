// app/director.js: chooses the playback rate (spec F-5, K-15, K-16, D-6). The sim never does.
// Contract: desk/README.md §32.12 app/director.js.

import {V} from '../sim/params.js';
import {SEGMENTS, NIGHT_S, segmentAt, actAt, targetRate, rateAt} from '../sim/clock.js';
import {restoreAllowedS} from '../sim/market.js';

const TPS = V.TICKS_PER_S, NIGHT_T = NIGHT_S * TPS;

/** The bench's CRUISE: a flat 120x (the game plays the D-2 profile, sim/clock.js; Q-63). */
export const FLAT_RATE = 120;
/** FAST is this multiple of CRUISE while F is held (desk/README.md §2). */
export const FAST_FACTOR = 3;
/** RESPOND's rate after the card (D-5 / §4.1). */
export const RESPOND_RATE = 30;
/** K-12 (§32.12 OFFER): an untaken scope offer plays at this rate, so its AUTO_SYNC_S lasts 8 real s. */
export const OFFER_RATE = 30;
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
    seen: Object.assign({watch: false, ufls: false, rocof: false, restore: false}, o.seen || {}),
    versionN: -1, version: 'full', upgraded: false, // the watch version chosen for contingency versionN
    cardDoneN: -1,             // latest contingency n whose respond card was dismissed
    cardAtTick: -1,            // tick the latest card was dismissed (RESPOND runs from it)
    focusUntilTick: -1,        // FOCUS after a restore input until this tick
    offers: {},                // OFFER: {an offered unit's index: the tick its window ends}
    seenDirty: false,          // seen changed: the game saves it
  };
}

// Q-73: the latest contingency record, unless it fell in a night scenario's roll
function latest(state) {
  const c = state.contIdx < 0 ? null : state.conts[state.contIdx];
  return c && !(state.scn.night && c.startTick >= NIGHT_T) ? c : null;
}
// Q-73: the night shift has the desk (the sim's flag, obs.nightShift: the lock and the views read the same)
const night = state => !!state.control.nightShift;
/** Q-64: the clock is HAND's (the sim tags handFlown on stepping 04:30; the held desk at 04:30 is HAND's already). */
export const handAt = state => !!state.control.handFlown || (state.control.mode === 'HAND' && state.tick >= V.PLAYER_START_TICK);
// The latest contingency record while its watch runs, else null (the sim's inWatch).
function watching(state) {
  const c = latest(state);
  return c && state.tick < c.watchEndTick ? c : null;
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
  const c = d.game && !night(state) && latest(state);
  return !!c && state.tick >= c.watchEndTick && c.n !== d.cardDoneN;
}
function responding(d, state) {
  const c = d.game && !night(state) && latest(state);
  return !!c && c.n === d.cardDoneN && c.backInBandTick < 0 && state.tick < c.watchEndTick + RESPOND_MAX_S * TPS;
}
function focusing(d, state) {
  if (!d.game) return false;
  const sc = state.scope;
  return (sc !== undefined && sc !== null && sc.unit !== '' && sc.unit !== undefined) || state.tick < d.focusUntilTick;
}
// Q-70: RESTORE's rate in a task feeder's window, else 0
function restoring(d, state) {
  const ds = state.city.districts, s = state.tick / TPS;
  if (!d.game || s >= NIGHT_S) return 0;
  for (let i = 0; i < ds.length; i++) {
    if (ds[i].clearS < 0 || !ds[i].dark || ds[i].shedBy !== 'task') continue;
    const a = restoreAllowedS(ds, i);
    if (s >= a && s < a + V.RESTORE_PACE_MAX_S) return d.seen.restore ? V.RESTORE_PACE_RATE : V.RESTORE_FIRST_RATE;
  }
  return 0;
}
// K-12: any offered unit still at full speed, each for at most AUTO_SYNC_S from its own offer (a window
// ends when its unit leaves full speed); none once the night shift has the desk (Q-73)
function offering(d, state) {
  if (!d.game || night(state)) return false;
  let on = false;
  for (const i in d.offers) if (state.tick < d.offers[i] && state.units[i].mode === 'ready') on = true; else delete d.offers[i];
  return on;
}
/** The game offers unit `id` (app/game.js updateOffers): OFFER while it or another offered unit waits, up to AUTO_SYNC_S each. */
export function offerPace(d, state, id) {
  const i = state.units.findIndex(u => u.id === id);
  if (i >= 0) d.offers[i] = state.tick + V.AUTO_SYNC_S * TPS;
}
function contCount(state) {
  return state.contIdx < 0 ? 0 : state.conts[state.contIdx].n + 1;
}
function fastNow(d, state) {
  return d.game && d.fast && d.fastN === contCount(state);
}
// CRUISE: the D-2 profile (Q-62, Q-64); between two eases its flat stretch is kept (d.flat), the bench's flat speed
const ease =(k, hand) => { const a = targetRate(SEGMENTS[k - 1].a, hand), b = targetRate(SEGMENTS[k].a, hand); return V.CLOCK_EASE_REAL_S * a * b / (a + b); };
function cruise(d, state) {
  if (!d.game) return d.speed;
  const s = state.tick / TPS, hand = handAt(state), f = d.flat;
  if (f && f.hand === hand && s >= f.lo && s < f.hi) return f.rate;
  const j = segmentAt(s), lo = j ? SEGMENTS[j].a + ease(j, hand) : -Infinity, hi = j < SEGMENTS.length - 1 ? SEGMENTS[j].b - ease(j + 1, hand) : Infinity;
  if (s < lo || s >= hi) return rateAt(s, hand);
  d.flat = {hand, lo, hi, rate: targetRate(s, hand)};
  return d.flat.rate;
}

/** The rate right now (grid seconds per real second). Cheap: called between every two ticks. */
export function rateOf(d, state) {
  if (state.over || d.paused || d.hidden || d.held) return 0;
  const c = watching(state);
  if (c !== null) {
    if (c.n !== d.skipN) return watchRate(state.tick - c.startTick, scheduleFor(d, c));
    return cruise(d, state);
  }
  if (!d.game) return d.speed;
  if (cardOpen(d, state)) return 0;
  if (focusing(d, state)) return FOCUS_RATE;
  const r = restoring(d, state);
  if (r) return r;
  if (responding(d, state)) return RESPOND_RATE;
  if (offering(d, state)) return OFFER_RATE;
  return (fastNow(d, state) && !night(state) ? FAST_FACTOR : 1) * cruise(d, state);
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
  const c = latest(state), t = state.tick - 1;
  if (c && t >= c.startTick && t < c.watchEndTick && c.n !== d.skipN) return watchRate(t - c.startTick, scheduleFor(d, c));
  return d.game ? 0 : d.speed;
}

/**
 * What the rate badge shows (F-5: the rate is always visible).
 * @returns {{mode:'OVER'|'HIDDEN'|'ALARMS'|'PAUSE'|'WATCH'|'RESPOND-CARD'|'FOCUS'|'RESTORE'|'RESPOND'|'OFFER'|'NIGHT'|'FAST'|'CRUISE'|'DEBUG',
 *   rate:number, watchS:number, locked:boolean, watchVersion:'full'|'compact'|null}} (+ canSkip, below; segment, act, night: §32.4.8)
 *   rate: rateOf's, but the segment's target in CRUISE, NIGHT and FAST (Q-63);
 *   watchS: grid seconds since the contingency (-1 outside a watch); locked: desk locked (K-15);
 *   watchVersion: the version of the watch in progress (null outside one or while skipped).
 */
export function modeOf(d, state) {
  const c = watching(state);
  const watchS = c ? (state.tick - c.startTick) / TPS : -1;
  const locked = c !== null;
  let rate = rateOf(d, state);
  const watchVersion = c && c.n !== d.skipN ? versionFor(d, c) : null;
  // canSkip: Esc would skip this watch now (in the game, only once a full watch has been seen)
  const canSkip = !!c && c.n !== d.skipN && (!d.game || !!d.seen.watch);
  // the face (segment, act, target) at f: on a night scenario the NIGHT ROLL starts with the night shift (Q-73's one test)
  const s = state.tick / TPS, g = d.game, n = night(state), f = !n && state.scn.night && s >= NIGHT_S ? NIGHT_S - 1 / TPS : s;
  const r = mode => ({mode, rate, watchS, locked, watchVersion, canSkip, segment: g ? SEGMENTS[segmentAt(f)].name : '', act: g ? actAt(f) : 0, night: n});
  const t = (mode, k = 1) => { rate = k * targetRate(f, handAt(state)); return r(mode); };
  if (state.over) return r('OVER');
  if (d.hidden) return r('HIDDEN');
  if (d.held) return r('ALARMS');
  if (d.paused) return r('PAUSE');
  if (c && c.n !== d.skipN) return r('WATCH');
  if (!g) return r(d.speed === FLAT_RATE ? 'CRUISE' : 'DEBUG');
  if (c) return t('CRUISE'); // a skipped watch plays at CRUISE
  if (cardOpen(d, state)) return r('RESPOND-CARD');
  if (focusing(d, state)) return r('FOCUS');
  if (restoring(d, state)) return r('RESTORE');
  if (responding(d, state)) return r('RESPOND');
  if (offering(d, state)) return r('OFFER');
  if (n) return t('NIGHT');
  return fastNow(d, state) ? t('FAST', FAST_FACTOR) : t('CRUISE');
}

// FAST is refused in these, and ends when one comes (Q-63)
const NO_FAST = /^(WATCH|RESPOND-CARD|RESPOND|FOCUS|ALARMS|RESTORE|OFFER|NIGHT)$/;

/**
 * Once per frame (game): FAST ends in a NO_FAST mode; a watch that has ended marks what it
 * showed as seen. Returns true when `d.seen` changed (save it).
 */
export function directorFrame(d, state) {
  if (NO_FAST.test(modeOf(d, state).mode)) d.fast = false;
  let changed = false;
  const c = latest(state);
  if (c) {
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

/** F held (on) or released (off). Pressing it in a NO_FAST mode does nothing. */
export function setFast(d, state, on) {
  if (!d.game) return false;
  if (!on) { d.fast = false; return false; }
  if (NO_FAST.test(modeOf(d, state).mode)) return false;
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

/** A restore input was accepted: FOCUS (1x) for RESTORE_FOCUS_S grid s; true when it set seen.restore (Q-70: save it). */
export function focusRestore(d, state, id) {
  d.focusUntilTick = state.tick + RESTORE_FOCUS_S * TPS;
  const x = id && state.city.districts.find(y => y.id === id);
  if (!x || x.clearS < 0 || d.seen.restore) return false;
  return d.seenDirty = d.seen.restore = true;
}

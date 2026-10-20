// app/director.js: chooses the playback rate (spec F-5, K-15, K-16, D-6). The sim never does.
//
// Modes (desk/README.md §2), precedence OVER > HIDDEN > ALARMS > PAUSE > WATCH > RESPOND-CARD >
// FEEDER-CARD > FOCUS > RESPOND > OFFER > NIGHT > FAST > CRUISE (§32.4.8; OFFER: wave 2's fix pass;
// FEEDER-CARD: Q-91, in RESTORE's place):
//   CRUISE        the D-2 profile (slice 2c, Q-62/Q-63): sim/clock.js rateAt(s, hand), eased over 2 real
//                 s at each interior boundary, halved from 04:30 to 21:00 when the day is HAND's
//                 (handAt: state.control.handFlown, or the mode HAND from PLAYER_START_TICK, so the
//                 held 04:30 desk, before the sim tags handFlown, is HAND's too; Q-64). The line's
//                 cadence and reading lead (app/game.js) read handAt too. Between two eases rateAt is
//                 flat, so the director keeps that stretch
//                 (d.flat: its ends are each boundary +- the ease's half-width, EASE r1 r2 / (r1 + r2),
//                 the formula sim/clock.js uses) and asks rateAt only inside an ease: rateOf runs
//                 between every two ticks, 1,750 times a frame at 2,100x.
//   FAST          3 x CRUISE while F is held. Refused (setFast) and ended (directorFrame) in WATCH,
//                 the cards, RESPOND, FOCUS, ALARMS, OFFER and NIGHT (NO_FAST); it also ends on F up,
//                 a new contingency, a new P1/P2 alarm, a new ask (app/game.js newAsk) and every new
//                 tray card that rings (app/game.js handleRecords: a 'ring2' from T.trayRecords; MSL1
//                 and the other information cards do not ring), so FAST never runs past a warning
//   WATCH         K-15 over the first WATCH_S grid-seconds after a contingency: full 0.15x / 1x /
//                 10x over 0-3 / 3-10 / 10-30 s, compact 0.5x / 2x / 20x. The desk is locked (the
//                 sim refuses inputs). SKIP plays the rest of that watch at CRUISE.
//   RESPOND-CARD  rate 0 from the watch's end until the card is dismissed (Enter or any desk
//                 input): a hold on the clock (K-16), as PAUSE and the feeder card
//   FEEDER-CARD   Q-91 (the owner's call, in place of Q-70's RESTORE pace): rate 0 at each task
//                 feeder's allowed second (sim/market.js restoreAllowedS, the one rule: the later of
//                 its clearS and the last restore + RESTORE_INTERVAL_S), from the tick after that
//                 second's own (whose step hands the feeder back: feederClear, the tray's NETWORK
//                 card, so the card never shows before it), while it is dark with shedBy
//                 'task' and before 21:00, after any watch and the respond card (it waits for both:
//                 feederOn), the earliest allowed first. It holds until the feeder is restored (it is
//                 no longer dark), or the card is answered (answerFeeder): Esc goes on (app/game.js
//                 ui 'goOn': d.fc[id] = Infinity, never held again), any other desk input dismisses
//                 it for that allowed second (d.fc[id] = it; app/game.js sendInput and redispatch,
//                 with the card shown at the press), so a later restore that moves its allowed second
//                 holds it again. The restore of its own feeder keeps it when refused (the reason
//                 stays on the card: app/game.js feederWhy). feederCard(d, state) names the feeder
//                 whose card is due; it ignores PAUSE, ALARMS and a hidden tab (the page shows the
//                 card only in FEEDER-CARD, and app/game.js shownFeeder answers only a card shown).
//                 The dark task feeders' [i, clearS, allowed second] are kept on the director (d.rw,
//                 windows) per input-log length (only a logged restore relights a district) and
//                 checked against each feeder's dark, shedBy and clearS; a state with no log is read
//                 afresh (stage C: rateOf asks it between every two ticks). tests/lib/play.js
//                 feederDue reads from the sim's state alone whether a card may hold, and
//                 feederHeldAt whether one holds at this tick, for D-2's E.
//   RESPOND       30x from the card's dismissal until frequency is back in 49.85-50.15 Hz
//                 (contingency.backInBandTick >= 0) or 5 grid-min after the card, then the profile
//   FOCUS         1x while a synchroscope is open (sim scope.unit !== '') or after the player's restore
//                 input (the breaker being closed, K-13; focusRestore) until frequency is back in the
//                 normal band (V.NORMAL_LO_HZ-NORMAL_HI_HZ for a whole grid second, as a contingency's
//                 backInBandTick reads it), at least RESTORE_FOCUS_S (2 grid-s) and at most
//                 RESTORE_FOCUS_MAX_S (6 grid-s), so the cold-load dip's recovery is seen, not only its
//                 fall (W7, Q-115). The end is found tick by tick from the sim's frequency in app/game.js
//                 tickOnce (restoreFocusTick: so a resume's replay finds the same one), which then puts
//                 one caption in the tray (restoreCaption). A trip during it ends it, with no caption
//                 (the watch tells that story). A slower clock, never a hold (Q-101). Only the player's
//                 own restore input: D-27's queued closes, the night shift's and par's never focus.
//   OFFER         K-12 (wave 2's fix pass, an owner-delegated call for the integrator to number):
//                 OFFER_RATE 30x from the frame the game offers a unit (app/game.js updateOffers ->
//                 offerPace) while it waits at full speed, for at most AUTO_SYNC_S (240 grid-s, so 8
//                 real s; at 540x the offer lived 0.44 real s), no FAST. Badge "SYNC 30×". Taking it
//                 opens the scope (FOCUS, above); the breaker closing (by hand or auto-sync) ends it.
//                 On HAND days only (W7, Q-115: app/game.js offerWhy); on an AGC day nothing is offered,
//                 and START on a unit at full speed still opens its scope (FOCUS).
//                 Each offered unit keeps its own window (d.offers: unit index -> the tick it ends;
//                 a window ends when its unit leaves full speed), so two offers at once (a 'respond'
//                 and a 'tight') play OFFER until the last of them ends. None once the night shift
//                 has the desk (an offer made before 21:00 included): NIGHT plays, as the lock
//                 refuses the SYNC. tests/lib/play.js clockReport counts OFFER the same way.
//   NIGHT         Q-73, once the night shift has the desk: the sim's state.control.nightShift
//                 (obs.nightShift, set on stepping 21:00:00 on a night scenario). The game's lock and
//                 the views read the same flag. The profile (2,100x, eased into from PEAK EASING's
//                 300x), no FAST. A contingency that starts from NIGHT_S is logged only (latest()
//                 leaves it out), and from the flip no card or RESPOND plays for any contingency (one
//                 begun just before 21:00 included: its watch ends, nothing asks), so the roll is
//                 never held. At tick NIGHT_S x TPS itself, before the sim steps 21:00:00, the face
//                 (segment, act, target) still reads PEAK EASING, as the lock is still open:
//                 tests/lib/play.js to('21:00') lands there, to('21:00:01') after the flip. (The
//                 view's night is obs.nightShift.)
//   PAUSE         Space; a hidden tab (HIDDEN); the day's end (OVER)
//   ALARMS        rate 0 while the alarm panel holds the clock (d.held, Q-46); d.paused is untouched
//   DEBUG         the bench's speed selector (bench.html only): any speed other than CRUISE
//
// modeOf also returns segment (the D-2 segment's name, Q-78), act (sim/clock.js actAt: 0 before
// 04:30, 1-3, 4 the night roll) and night (the sim's flag); its `rate` is rateOf's except in CRUISE, NIGHT and FAST,
// where it is the segment's target (x3 in FAST): the badge never shows a number counting through an
// ease (Q-63), and the loop reads rateOf.
//
// A director made with {game: true} runs every mode above; without it (the bench) it is the
// Phase 0.2 director: a flat CRUISE (FLAT_RATE 120x) or DEBUG, the full watch, PAUSE, and nothing that
// holds the clock; its segment is '' and its act 0.
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
/** FOCUS after a restore input lasts at least this many grid seconds (a close that hardly dips is still seen). */
export const RESTORE_FOCUS_S = 2;
/**
 * W7 (Q-115): ... and at most this many, if frequency is not back in the normal band by then. Measured (the play driver,
 * 1x from each close at a card, 2026-10-07 and 10-14 to 10-31): the morning's hand-backs were back in band 0.9-5.0 grid s
 * after the close (11 of 11 within 5.0), their nadir at 1.0-1.9 s; the evening's closes after a shed, 0.2-17 s (36% within
 * 6, 76% within 10), their nadir within 4.8 s on all but 2 of 76. A close at a card comes on the tick after a grid second's
 * own, so a crossing by 5.0 s has its whole second in band by 6: six seconds shows every measured morning recovery whole and the
 * fall and turn of nearly every evening one. Played through (a line-following player, 2026-10-22 to 10-24 to 21:00): 7
 * FOCUSes of 3.0-6.0 grid s, two of them evening closes ended at the cap, out of band; the 2 s it was is the floor.
 * So on a shed evening the recovery is mostly told, not shown: its fall and turn play at 1x, and the caption says
 * "still out of band after 6 s" (true: the slow crawl back is the short spare's). By design (W7 review): a cap of 10, tried
 * once on 2026-10-23 (Enter at every card, 9 restores, 8 of them after 17:00), showed 4 more of the 7 capped closes cross
 * back into band (at 6.0-8.8 s; 6 of 9 in all, and 3 still out at 10), for 73 grid s of FOCUS against 49: 24 more real s
 * of 1x in the evening's 150x, the day's busiest stretch, mostly frequency creeping up from 49.68-49.85 Hz.
 */
export const RESTORE_FOCUS_MAX_S = 6;
/** Debug speeds offered by the bench (grid seconds per real second); 2100x is D-2's fastest. */
export const DEBUG_RATES = Object.freeze([0.25, 1, 60, FLAT_RATE, 240, 2100]);

const segs = rates => Object.freeze([
  Object.freeze({fromS: 0, toS: 3, rate: rates[0]}),
  Object.freeze({fromS: 3, toS: 10, rate: rates[1]}),
  Object.freeze({fromS: 10, toS: V.WATCH_S, rate: rates[2]}),
]);
/**
 * K-15 full version: [fromS, toS) of the watch at `rate`; the grid clock advances exactly WATCH_S. Its 0.15x
 * part ends SLOW_AFTER_S after the extreme, between SLOW_MIN_S and its toS (K-15 amended, Q-97; watchRate).
 */
export const WATCH_SCHEDULE = segs([0.15, 1, 10]);
/** K-15 (Q-97): the full watch's slow part runs at least this long, and ends this long after the extreme (grid s). */
export const SLOW_MIN_S = 2, SLOW_AFTER_S = 0.5;
/** K-15 (Q-97): the full watch plays for the first fall that loses at least this many MW. */
export const FULL_WATCH_MW = 300;
/** K-15 compact version (~11 real s): the same segments at 0.5x / 2x / 20x. */
export const WATCH_SCHEDULE_COMPACT = segs([0.5, 2, 20]);
/** Schedules by version name. */
export const WATCH_SCHEDULES = Object.freeze({full: WATCH_SCHEDULE, compact: WATCH_SCHEDULE_COMPACT});
/** A contingency with |RoCoF| above this (Hz/s) is a HIGH RoCoF (K-8 tile, K-15 "anything new"). */
export const HIGH_ROCOF_HZ_S = 1;

/**
 * Real seconds a watch takes (compact 10.5 s; full 29 s with the slow part to T+3 s, 22.3 s when it ends at
 * T+2 s): `slowToS`, where the full watch's slow part ended (default its longest, the segment's toS).
 */
export function watchRealS(schedule = WATCH_SCHEDULE, slowToS = schedule[0].toS) {
  const cut = schedule === WATCH_SCHEDULE ? Math.min(schedule[0].toS, Math.max(SLOW_MIN_S, slowToS)) : schedule[0].toS;
  return schedule.reduce((a, seg, i) => a + (i === 0 ? cut - seg.fromS : i === 1 ? seg.toS - cut : seg.toS - seg.fromS) / seg.rate, 0);
}

/**
 * Rate of the watch schedule `elapsedTicks` after the contingency's first tick. `c` (the record, optional):
 * the full watch's slow part ends SLOW_AFTER_S after its extreme (once frequency has turned back for that
 * long), from SLOW_MIN_S. Pacing only: the ticks run are the same.
 */
export function watchRate(elapsedTicks, schedule = WATCH_SCHEDULE, c = null) {
  const s = elapsedTicks / TPS;
  if (c && schedule === WATCH_SCHEDULE && s >= SLOW_MIN_S && s < schedule[0].toS && c.extremeTick >= c.startTick &&
    c.startTick + elapsedTicks - c.extremeTick > SLOW_AFTER_S * TPS) return schedule[1].rate;
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
    rfs: [],                   // W7 (Q-115): each restore's FOCUS {tick, mw, district, out, back, end, quiet} (rf: the latest)
    offers: {},                // OFFER: {an offered unit's index: the tick its window ends}
    rw: null,                  // the dark task feeders' allowed seconds (windows)
    fc: {},                    // FEEDER-CARD: {district id: the allowed second its card was answered at; Infinity once left dark}
    fq: {},                    // D-27: {district id: true} queued by a RESTORE at the card: it closes itself at its allowed second
    pv: null,                  // D-27: this grid second's restore checks {s, n, ok: {district index: accepted}}
    shedW: null,               // K-15 (Q-97): the first directed shed's compact watch {startTick, text}, or null
    accepts: o.accepts || null, // D-27: (state, i) => would a restore of district i be accepted now (app/game.js passes the sim's)
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
    // K-15 (Q-97): the first real fall this browser has seen (FULL_WATCH_MW lost or more), or a new RoCoF
    // record; a rise plays compact (its own strip). A first UFLS upgrades below.
    const record = Math.abs(c.rocofHzS) > HIGH_ROCOF_HZ_S && Math.abs(c.rocofHzS) > (d.seen.rocofMax || 0);
    d.version = (!d.seen.watch && c.lostMW >= FULL_WATCH_MW) || record ? 'full' : 'compact';
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
/**
 * D-26 (Q-95): a dark district the cards hold for: a task feeder (Q-91), or one shed by the relays (UFLS) or the
 * city desk (directed). Shed districts share a card: the relays' by stage, the city desk's together.
 */
export const carded = x => x.dark && (x.shedBy === 'task' ? x.clearS >= 0 : x.shedBy === 'ufls' || x.shedBy === 'directed');
/** D-26: a carded district's card ('' for a task feeder: its own) and its place among cards due at the same second. */
export const cardGroup = x => (x.shedBy === 'ufls' ? 'stage ' + x.uflsStage : x.shedBy === 'directed' ? 'directed' : '');
const rankOf = x => (x.shedBy === 'ufls' ? x.uflsStage : x.shedBy === 'directed' ? 99 : 0);
// The carded districts' [i, clearS, allowed second, rank], flat, kept per log length (§32.12 FEEDER-CARD)
function windows(d, state) {
  const ds = state.city.districts, n = state.log ? state.log.length : -1, w = d.rw;
  let ok = !!w && n >= 0 && w.ds === ds && w.len === ds.length && w.n === n && w.k === darkKey(ds);
  for (let j = 0; ok && j < w.at.length; j += 4) { const x = ds[w.at[j]]; ok = carded(x) && x.clearS === w.at[j + 1]; }
  if (ok) return w.at;
  const at = [];
  for (let i = 0; i < ds.length; i++) if (carded(ds[i])) at.push(i, ds[i].clearS, restoreAllowedS(ds, i), rankOf(ds[i]));
  d.rw = {ds, len: ds.length, n, at, k: darkKey(ds)};
  return at;
}
// (the relays and the city desk shed with no log entry: a count of the dark districts tells the cache)
function darkKey(ds) { let k = 0; for (let i = 0; i < ds.length; i++) if (ds[i].dark) k++; return k; }
// Q-91: the district index whose feeder card is due (from the tick after its allowed second's, so that
// second's step has handed the feeder back first, until it is restored or answered at that second;
// never once left by Esc, nor from 21:00), the earliest allowed first; else -1
function feederDue(d, state) {
  const t = state.tick;
  if (!d.game || t >= NIGHT_S * TPS || night(state)) return -1;
  const at = windows(d, state), ds = state.city.districts;
  let best = -1, bestA = Infinity, bestR = Infinity;
  for (let j = 0; j < at.length; j += 4) {
    const a = at[j + 2], r = at[j + 3], id = ds[at[j]].id, done = d.fc[id];
    if (!(t > a * TPS) || done === a || done === Infinity || d.fq[id] || !(a < bestA || (a === bestA && r < bestR))) continue;
    // D-27: a card holds only at a second its restore would be accepted (the permissive and its preview, as R's);
    // D-26: one that would be refused waits without holding up the cards behind it
    if (accepts(d, state, at[j])) { best = at[j]; bestA = a; bestR = r; }
  }
  return best;
}
// D-27: would a restore of district i be accepted now? Kept per district for the grid second (and the log's length)
function accepts(d, state, i) {
  if (!d.accepts) return true;
  const s = Math.floor(state.tick / TPS), n = state.log ? state.log.length : -1;
  if (!d.pv || d.pv.s !== s || d.pv.n !== n) d.pv = {s, n, ok: {}};
  const m = d.pv.ok;
  if (!(i in m)) m[i] = !!d.accepts(state, i);
  return m[i];
}
// the card shows: due, past any watch and the respond card (it waits for them)
const feederOn = (d, state) => (watching(state) || cardOpen(d, state) ? -1 : feederDue(d, state));
// K-12: any offered unit still at full speed, each for at most AUTO_SYNC_S from its own offer (a window
// ends when its unit leaves full speed); none once the night shift has the desk (Q-73)
function offering(d, state) {
  if (!d.game || night(state)) return false;
  let on = false;
  for (const i in d.offers) if (state.tick < d.offers[i] && state.units[i].mode === 'ready') on = true; else delete d.offers[i];
  return on;
}
/**
 * The game offers unit `id` (app/game.js updateOffers): OFFER while it or another offered unit waits, up to AUTO_SYNC_S each.
 * `atTick`: the tick it was offered (W7: an F-7 resume puts back the windows of the offers it saved).
 */
export function offerPace(d, state, id, atTick = state.tick) {
  const i = state.units.findIndex(u => u.id === id);
  if (i >= 0) d.offers[i] = atTick + V.AUTO_SYNC_S * TPS;
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
    if (c.n !== d.skipN) return watchRate(state.tick - c.startTick, scheduleFor(d, c), c);
    return cruise(d, state);
  }
  if (!d.game) return d.speed;
  if (shedWatching(d, state)) return watchRate(state.tick - d.shedW.startTick, WATCH_SCHEDULE_COMPACT);
  if (cardOpen(d, state) || feederDue(d, state) >= 0) return 0;
  if (focusing(d, state)) return FOCUS_RATE;
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
  if (c && t >= c.startTick && t < c.watchEndTick && c.n !== d.skipN) return watchRate(t - c.startTick, scheduleFor(d, c), c);
  return d.game ? 0 : d.speed;
}

/**
 * What the rate badge shows (F-5: the rate is always visible).
 * @returns {{mode:'OVER'|'HIDDEN'|'ALARMS'|'PAUSE'|'WATCH'|'RESPOND-CARD'|'FEEDER-CARD'|'FOCUS'|'RESPOND'|'OFFER'|'NIGHT'|'FAST'|'CRUISE'|'DEBUG',
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
  if (shedWatching(d, state)) return Object.assign(r('SHED-WATCH'), {watchS: (state.tick - d.shedW.startTick) / TPS, watchVersion: 'compact'});
  if (cardOpen(d, state)) return r('RESPOND-CARD');
  if (feederDue(d, state) >= 0) return r('FEEDER-CARD');
  if (focusing(d, state)) return r('FOCUS');
  if (responding(d, state)) return r('RESPOND');
  if (offering(d, state)) return r('OFFER');
  if (n) return t('NIGHT');
  return fastNow(d, state) ? t('FAST', FAST_FACTOR) : t('CRUISE');
}

// FAST is refused in these, and ends when one comes (Q-63)
const NO_FAST = /^(WATCH|SHED-WATCH|RESPOND-CARD|FEEDER-CARD|RESPOND|FOCUS|ALARMS|OFFER|NIGHT)$/;

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
      if (d.version === 'full' && c.n !== d.skipN && !d.seen.watch && c.lostMW >= FULL_WATCH_MW) { d.seen.watch = true; changed = true; }
      if (shown && c.uflsStages > 0 && !d.seen.ufls) { d.seen.ufls = true; changed = true; }
      if (shown && Math.abs(c.rocofHzS) > HIGH_ROCOF_HZ_S && !d.seen.rocof) { d.seen.rocof = true; changed = true; }
      if (shown && Math.abs(c.rocofHzS) > (d.seen.rocofMax || 0)) { d.seen.rocofMax = Math.abs(c.rocofHzS); changed = true; } // (K-15: the record)
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
// K-15 (Q-97): the first directed shed's compact watch is playing (WATCH_S grid s from its shed; not a contingency's)
const shedWatching = (d, state) => !!d.shedW && state.tick < d.shedW.startTick + V.WATCH_S * TPS && !watching(state);

/**
 * K-15 (Q-97): the first directed shed outside a contingency this browser has seen plays a compact watch, its
 * `text` the caption ("You are 800 MW short: the city desk sheds SOL3, 168 MW, to hold frequency."). The desk
 * stays the player's. Not in a watch, a card or RESPOND, nor once the night shift has the desk. True if it starts.
 */
export function startShedWatch(d, state, text) {
  if (!d.game || d.seen.shed || night(state) || watching(state) || cardOpen(d, state) || responding(d, state)) return false;
  d.shedW = {startTick: state.tick, text};
  d.seen.shed = true; d.seenDirty = true;
  return true;
}
/** The shed watch's caption while it plays, else ''. */
export const shedWatchText = (d, state) => (shedWatching(d, state) ? d.shedW.text : '');

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

/**
 * The player's restore input was accepted (app/game.js sendInput): FOCUS (1x) from now until frequency is back in the
 * normal band, at least RESTORE_FOCUS_S and at most RESTORE_FOCUS_MAX_S grid s; restoreFocusTick finds the end. `mw`: the
 * district's cold-load pickup (the sim's restore record: fleet.districtColdLoadMW at the close), for the caption.
 */
export function focusRestore(d, state, mw = 0, district = '') {
  d.focusUntilTick = state.tick + RESTORE_FOCUS_MAX_S * TPS;
  d.rfs.push({tick: state.tick, mw, district, out: false, back: -1, end: -1, quiet: false});
}

const inBand = hz => hz >= V.NORMAL_LO_HZ && hz <= V.NORMAL_HI_HZ;
/**
 * W7 (Q-115): once a tick, after its step (app/game.js tickOnce: the page's loop, the play driver's jumps and a resume's
 * replay alike, so the end never depends on how often the rate is asked). The latest restore's FOCUS ends, from
 * RESTORE_FOCUS_S on, once frequency is back in the normal band as the sim reads it for a contingency (grid.js
 * backInBandTick): the last whole grid second in band (state.last.fMinHz and fMaxHz), and the tick's own frequency too;
 * so at speed the dial, which then shows each second's mean, reads in band from the first frame. Else it ends at
 * RESTORE_FOCUS_MAX_S. A contingency begun since the close ends it at once and quietly (no caption). Its record keeps
 * whether frequency left the band at any tick (`out`) and the tick it last came back (`back`, -1 while out: the crossing,
 * which the caption counts to). Returns the record when it ends with a caption due, else null.
 */
export function restoreFocusTick(d, state) {
  const rf = d.rfs.length ? d.rfs[d.rfs.length - 1] : null;
  if (!rf || rf.end >= 0 || state.tick <= rf.tick) return null;
  const t = state.tick, c = state.contIdx < 0 ? null : state.conts[state.contIdx];
  if (c && c.startTick > rf.tick) { rf.end = t; rf.quiet = true; d.focusUntilTick = Math.min(d.focusUntilTick, t); return null; }
  const ok = inBand(state.phys.fHz), last = state.last;
  if (!ok) { rf.out = true; rf.back = -1; } else if (rf.out && rf.back < 0) rf.back = t;
  // (from RESTORE_FOCUS_S on, the second state.last holds began at or after the close)
  const held = ok && last.fMinHz >= V.NORMAL_LO_HZ && last.fMaxHz <= V.NORMAL_HI_HZ;
  if (t < rf.tick + (held ? RESTORE_FOCUS_S : RESTORE_FOCUS_MAX_S) * TPS) return null;
  rf.end = t;
  d.focusUntilTick = t;
  return rf;
}

/**
 * W7 (Q-115): the one caption for a restore's FOCUS that has ended (restoreFocusTick's record), the seconds measured from
 * the close as it happened: "Cold load picked up: 243 MW, back in band in 4 s." / "..., still out of band after 6 s." /
 * "..., frequency stayed in band."
 */
export function restoreCaption(rf) {
  const s = ((rf.back >= 0 ? rf.back : rf.end) - rf.tick) / TPS, secs = s < 1 ? 'under a second' : Math.round(s) + ' s';
  return 'Cold load picked up: ' + Math.round(rf.mw).toLocaleString('en-AU') + ' MW, ' +
    (rf.back >= 0 ? 'back in band in ' + secs : rf.out ? 'still out of band after ' + secs : 'frequency stayed in band') + '.';
}

/**
 * Q-91: the district id of the feeder card due ('' when none is due past the watch and the respond
 * card). It ignores PAUSE, ALARMS and a hidden tab: the page shows the card only in FEEDER-CARD
 * (buildVm's vm.feeder), and app/game.js answers only the card shown (shownFeeder).
 */
export function feederCard(d, state) {
  const i = state.over ? -1 : feederOn(d, state);
  return i < 0 ? '' : state.city.districts[i].id;
}

/**
 * Q-91: answer the feeder card of district `id` while it is the one shown (feederCard's): Esc goes
 * on (`leave`: never held again), any other desk input dismisses it for this allowed second (a later
 * one, after another restore, holds again). The restore of its own feeder ends it by relighting it.
 * Returns true if that card was shown.
 */
/**
 * D-27: a RESTORE at the card queues `mates` (queueMates, read before the restore): each closes itself at its
 * allowed second (app/game.js closeQueued) instead of holding again.
 */
export function queueFeeders(d, mates) {
  for (const x of mates) d.fq[x.id] = true;
}
/** D-27, D-26: the dark districts a RESTORE of `id` at its card queues: the morning's other task feeders, or the rest of its card's group. */
export function queueMates(d, ds, id) {
  const me = ds.find(x => x.id === id), g = me ? cardGroup(me) : '';
  return ds.filter(x => x.id !== id && carded(x) && d.fc[x.id] !== Infinity && (g ? cardGroup(x) === g : x.shedBy === 'task'));
}

/** D-27: the queued feeders, by district id (app/game.js closes them; a refused close leaves the queue for a card). */
export const queuedFeeders = d => Object.keys(d.fq);
export function unqueueFeeder(d, id) { delete d.fq[id]; }

export function answerFeeder(d, state, id, leave) {
  if (!id || feederCard(d, state) !== id) return false;
  const at = d.rw.at, ds = state.city.districts, me = ds.find(x => x.id === id), g = me ? cardGroup(me) : '';
  // (D-26: a shed card answers for its whole group)
  for (let j = 0; j < at.length; j += 4) { const x = ds[at[j]]; if (x.id === id || (g && cardGroup(x) === g)) d.fc[x.id] = leave ? Infinity : at[j + 2]; }
  return true;
}
export const BUILD = '2026-10-20';   // W6 (F-9): app/build.js's, copied; app/boot.js compares

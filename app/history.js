// app/history.js: W6's official runs, history and streaks (Y-2 as amended by Q-99, Y-3), DOM-free; app/game.js stores it.
//
// Under HISTORY_KEY: {v: 1, days: {YYYYMMDD: entry}, pruned}, one entry per date, at most HISTORY_MAX but for a streak
// longer than that (the oldest dates go first; `pruned` counts the finished runs that went).
// An entry is the date's OFFICIAL run: {n, v (SIM_VERSION), dnf, firstShift, hand, points, letter, star, perfect, lowHz,
// darkMWh}. A run's status (statusOf), fixed when the day is reset or the desk is taken:
//   first     the browser's first shift, on today's daily: practice unless the player claims it at the end ("COUNT THIS ONE")
//   official  today's daily with no entry yet: it becomes the official run at OFFICIAL_S (09:00), when an entry marked
//             dnf is written, so closing the tab after 09:00 leaves a DNF; the day's end fills the entry in
//   practice  anything else: a past date, a seed off the calendar, or today's daily once its official run is in
// STREAK counts consecutive dates with a finished official run, to today (or to yesterday while today is not yet in);
// BEST counts the consecutive dates with the ★ (app/score.js STAR_POINTS; W8, Q-128) among them, the same way.

import {V} from '../sim/params.js';

export const HISTORY_KEY = 'gridwatch:v4:history';
/** Y-3: dates kept. */
export const HISTORY_MAX = 400;
/** Q-99: a run becomes the date's official run when the grid clock passes 09:00. */
export const OFFICIAL_S = (9 - V.DAY_START_H) * V.S_PER_H;

/** A stored history, cleaned: entries keyed by a valid YYYYMMDD, each an object; `pruned`: finished runs no longer kept. */
export function readHistory(raw) {
  const days = {};
  let pruned = 0;
  if (raw && typeof raw === 'object' && raw.v === 1 && raw.days && typeof raw.days === 'object') {
    for (const [k, e] of Object.entries(raw.days)) if (/^\d{8}$/.test(k) && e && typeof e === 'object') days[k] = e;
    if (Number.isInteger(raw.pruned) && raw.pruned > 0) pruned = raw.pruned;
  }
  return {v: 1, days, pruned};
}

/**
 * The history as stored: the newest HISTORY_MAX dates, and every date of the run of consecutive dates that ends at the
 * newest (so a streak is never cut short by the cap). Finished runs that go are counted in `pruned` ("dailies played").
 */
export function prune(h) {
  const keys = Object.keys(h.days).sort();
  let start = keys.length - 1;   // (the first date of the consecutive run that ends at the newest)
  while (start > 0 && prevYmd(+keys[start]) === +keys[start - 1]) start--;
  for (const k of keys.slice(0, Math.min(Math.max(0, keys.length - HISTORY_MAX), start))) {
    if (finished(h.days[k])) h.pruned = (h.pruned || 0) + 1;
    delete h.days[k];
  }
  return h;
}

/** A Date's local calendar date as YYYYMMDD (Y-1: the daily follows the player's local date). */
export const localYmd = d => d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate();

/**
 * Y-2 (Q-99): a run's status: {status: 'first' | 'official' | 'practice', why}, why one of 'first', 'today', 'done' (today's
 * official run is in), 'past' (another date's daily), 'seed' (not a daily), 'nodaily' (F-8: today is past the dailies'
 * calendar: "No daily today").
 * @param {{ymd:number|null, today:number, firstShift:boolean, noDaily:boolean}} o ymd: the date of the daily played (app/game.js
 *   dailyYmd); noDaily: today is past the calendar's end (app/game.js noDaily)
 */
export function statusOf(h, o) {
  if (o.off) return {status: 'practice', why: 'off'};   // (storage blocked: nothing can count)
  if (!o.ymd) return {status: 'practice', why: 'seed'};
  if (o.ymd !== o.today) return {status: 'practice', why: o.ymd > o.today ? 'future' : 'past'};
  if (o.noDaily) return {status: 'practice', why: 'nodaily'};
  if (h.days[o.ymd]) return {status: 'practice', why: 'done'};
  return o.firstShift ? {status: 'first', why: 'first'} : {status: 'official', why: 'today'};
}

/** Write (or overwrite) a date's official entry. */
export function record(h, ymd, entry) {
  h.days[ymd] = Object.assign({}, h.days[ymd] || {}, entry);
  return prune(h);
}

// The previous calendar date of a YYYYMMDD (UTC arithmetic: no daylight-saving gaps).
function prevYmd(ymd) {
  const t = new Date(Date.UTC(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100 - 1));
  return t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}
// Consecutive dates ending at `today` (or the day before, while today has no entry) whose entry passes `ok`.
function run(h, today, ok) {
  let d = h.days[today] ? today : prevYmd(today), n = 0;
  while (ok(h.days[d])) { n++; d = prevYmd(d); }
  return n;
}
const finished = e => !!e && !e.dnf;

/** Y-3: {streak, best, played}: STREAK (finished official runs on consecutive dates), BEST (★ on consecutive dates), played (finished dates). */
export function streaks(h, today) {
  return {streak: run(h, today, finished), best: run(h, today, e => finished(e) && !!e.star),
    played: Object.values(h.days).filter(finished).length + (h.pruned || 0)};
}
export const BUILD = '2026-10-20';   // W6 (F-9): app/build.js's, copied; app/boot.js compares

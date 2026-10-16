// app/shelf.js: W6, Y-2's practice shelf, DOM-free: what can be played besides today's daily, all of it practice.
//   Past dailies: the SHELF_PAST dates before today, back to puzzle #1, each with this browser's official result.
//   Hard days (S-7): days no plan keeps every light on. The first is SA 2016 (D-29: content/anniversaries.js SA2016, its
//   own scenario and seed; it took the number 1 on 2026-10-17, and the others moved up one). Then the seeds the daily gate
//   rejected (content/dailies.js: a date listed with attempt k had its attempts 0..k-1 rejected), one a date, attempt 0,
//   numbered by date (a new list renumbers them anyway: the address and a saved run keep the seed, not the number). Each
//   was played by par once on 2026-10-16 (v4-core-2d.0): par shed 116-1,741 MWh on every one (SPEC §5 W6). A Hard day is
//   never a daily; its card is graded on par's outage-free part (S-7) and is named "Hard day n".
// app/shell.js draws the shelf and plays a pick in the page (C-3), with the address kept in step (?date= or ?seed=).

import {DAILIES} from '../content/dailies.js';
import {SA2016} from '../content/anniversaries.js';
import {puzzleNumber, shortDate, LAUNCH_YMD} from './share.js';

/** Y-2: past dailies on the shelf. */
export const SHELF_PAST = 14;

// YYYYMMDD arithmetic in UTC days (no daylight-saving gaps)
const utc = ymd => Date.UTC(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100);
const ymdOfUtc = t => { const d = new Date(t); return d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
/** 'YYYY-MM-DD' for ?date=. */
export const isoOf = ymd => String(ymd).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3');

/** Y-2: the past dailies, newest first: {ymd, n, label, entry} (entry: this browser's official run of that date, or null). */
export function pastDailies(today, history, max = SHELF_PAST) {
  const out = [];
  for (let t = utc(today) - 864e5; out.length < max && t >= utc(LAUNCH_YMD); t -= 864e5) {
    const ymd = ymdOfUtc(t);
    out.push({ymd, n: puzzleNumber(ymd), label: shortDate(ymd), entry: (history && history.days[ymd]) || null});
  }
  return out;
}

/** S-7: the Hard days, SA 2016 first (D-29), then the gate's in date order: {n, seed, weekend}. */
export function hardDays(list = DAILIES) {
  const gate = Object.keys(list.attempts).map(Number).filter(ymd => list.attempts[ymd] > 0).sort((a, b) => a - b);
  return [SA2016.seed, ...gate].map((seed, i) => ({n: i + 1, seed, weekend: new Date(utc(seed % 1e8)).getUTCDay() % 6 === 0}));
}

/** S-7: a seed's Hard-day number, or 0. */
export function hardDayOf(seed, list = DAILIES) {
  const h = hardDays(list).find(x => x.seed === seed >>> 0);
  return h ? h.n : 0;
}

/** A past daily's result in a few characters: '1002 A ★', 'DNF', '' (not played). */
export function resultText(e) {
  if (!e) return '';
  if (e.dnf) return 'DNF';
  return e.letter ? (e.points != null ? e.points + ' ' : '') + e.letter + (e.star ? ' ★' : '') : 'played';
}

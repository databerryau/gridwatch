// tools/calendar-left.mjs (F-8): how many days of dailies are left after today (content/dailies.js's `to`), printed by the
// GitHub Action (F-10) on every push. Below CALENDAR_WARN_DAYS it prints a GitHub warning annotation, so the daily never runs
// out silently: then run tools/daily-gen.js and tools/ladder.mjs. It only reports: it always exits 0.
//
//   node tools/calendar-left.mjs [YYYY-MM-DD]   (default: today, UTC)
import {fileURLToPath} from 'node:url';
import {DAILIES} from '../content/dailies.js';

/** F-8: the Action warns when fewer days than this are left. */
export const CALENDAR_WARN_DAYS = 60;
const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

/** Days of dailies after `today` (YYYY-MM-DD): 0 on the last one, negative once the calendar has run out. */
export const daysLeft = (today, to = DAILIES.to) => Math.round((utc(to) - utc(today)) / 864e5);

/** The Action's line(s) for `today`. */
export function report(today, to = DAILIES.to) {
  const n = daysLeft(today, to), line = n + ' days of dailies left after ' + today + ' (the calendar ends ' + to + ').';
  return n < CALENDAR_WARN_DAYS ? line + '\n::warning title=Dailies running out::' + line + ' Run node tools/daily-gen.js, then node tools/ladder.mjs -j 6.' : line;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) console.log(report(process.argv[2] || new Date().toISOString().slice(0, 10)));

// app/week.js: W6, D-28 (Q-103; Q-109: on the end card, not the briefing): THE WEEK AHEAD, the next seven dailies' day types,
// read from each date's seed alone (sim/weather.js prerollRegime: the regime is drawn before anything else). It is an outlook,
// as a 7-day forecast is: that day's briefing says the same word (a HEATWAVE this afternoon; a storm or low wind "likely
// later", warned hours before it comes, on the day: Q-110), and nothing else of a day's events is said. A reason to come back
// tomorrow. DOM-free.
import {prerollRegime} from '../sim/weather.js';
import {dailyFor} from '../content/dailies.js';
import {SCENARIOS} from '../content/scenarios.js';

/** D-28: the days the end card shows. */
export const WEEK_DAYS = 7;
/** D-28: the line's note (its title): what the words are and what they leave out. */
export const WEEK_NOTE = 'The coming dailies\' outlook, as a forecast gives it: that day\'s briefing says it again; a storm or a wind drought ' +
  'is warned, with its time, hours before it comes.';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const utc = ymd => Date.UTC(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100);

/** A regime in a word: HEATWAVE, storm, low wind (a wind drought: the stack's LOW WIND, wind toward 12% of capacity), hot, mild. */
export function dayWord(regime) {
  if (regime.cls === 'heat') return 'HEATWAVE';
  if (regime.cls === 'storm') return 'storm';
  if (regime.cls === 'drought') return 'low wind';
  return regime.temp === 'MILD' ? 'mild' : 'hot';
}

/** D-28: a day's word from its seed (the regime drawn first): the week ahead's, and the day's own briefing's (app/shell.js dayPlan). */
export const outlookWord = (seed, scn) => dayWord(prerollRegime(seed, scn));

/**
 * D-28: the dailies after `today` (YYYYMMDD): [{ymd, day ('Sat'), word}], from the listed seed of each date. Only this build's
 * gate-checked dailies (stamp: app/game.js dailyStamp): it stops at the calendar's end, and shows none with a stale list (the
 * seeds may change when the dailies are made again).
 */
export function weekAhead(today, stamp, n = WEEK_DAYS) {
  const out = [];
  for (let k = 1; k <= n && Number.isInteger(today); k++) {
    const x = new Date(utc(today) + k * 864e5), ymd = x.getUTCFullYear() * 1e4 + (x.getUTCMonth() + 1) * 100 + x.getUTCDate();
    const d = dailyFor(ymd, stamp), scn = SCENARIOS[d.scenarioId];
    if (!d.gated || !scn) break;
    out.push({ymd, day: WEEKDAYS[x.getUTCDay()], word: outlookWord(d.seed, scn)});
  }
  return out;
}

/** The end card's line: 'Sat mild · Sun storm · Mon HEATWAVE · …', each day held to its word (no-break spaces: a line breaks at a ·). */
export const weekText = w => w.map(x => (x.day + ' ' + x.word).replace(/ /g, ' ')).join(' · ');

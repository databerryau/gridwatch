// content/dailies.js: the gate-checked dailies (D-9, Q-75): exceptions only. desk/README.md §32.4.8.
export const DAILIES = {v: 'v4-core-2d.0|2010181300|1748646610|3131276438', from: '2026-10-12', to: '2027-12-31', attempts: {
  20261023: 2, 20261026: 7, 20261127: 8, 20261207: 2, 20261216: 7, 20261217: 32, 20270125: 3, 20270128: 4,
  20270411: 5, 20270418: 3, 20270615: 13, 20270627: 2, 20270726: 2, 20270825: 1, 20270913: 7, 20270930: 25,
  20271012: 1, 20271023: 39, 20271116: 4, 20271220: 5,
}};

export const seedOf = (ymd, k = 0) => ymd + k * 1e8;
export const ymdOf = seed => (seed >>> 0) % 1e8;
const ymdIn = d => typeof d === 'number' ? d : d instanceof Date ? d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate()
  : /^\d{4}-\d\d-\d\d$/.test(d) ? +d.replace(/-/g, '') : NaN;
const dayOf = ymd => {
  const y = Math.floor(ymd / 1e4), m = Math.floor(ymd / 100) % 100, d = ymd % 100, t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null;
};

/**
 * Q-127 (light seasons, Q-122): from this date a daily plays its month (content/seasons.js), '<desk id>-<key>'; before it, and
 * in February (the late-summer day itself), the desk's own day. The dates before it keep the day they were gated on.
 */
export const SEASONS_FROM = 20270401;
export const MONTH_KEYS = Object.freeze(['', 'jan', '', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);

export function scenarioIdOf(ymd) {
  const t = dayOf(ymd), id = t && t.getUTCDay() % 6 === 0 ? 'desk-weekend' : 'desk', key = t && ymd >= SEASONS_FROM && MONTH_KEYS[t.getUTCMonth() + 1];
  return key ? id + '-' + key : id;
}

/**
 * W6 (D-29): the anniversary dailies' dates, each with its key: there the daily plays the variant '<scenarioIdOf>-<key>'
 * (content/anniversaries.js holds the account and the overrides; content/scenarios.js makes the variant). Kept here, so this
 * module imports nothing (tools/daily-gen.js rewrites it; tests/dailies.test.js imports the rewritten text on its own).
 */
export const ANNIVERSARY_KEYS = Object.freeze({20261214: 'loyyang', 20270125: 'vic2019', 20270130: 'melb2009', 20270131: 'heywood2020',
  20270213: 'towers', 20270525: 'callide', 20270615: 'suspend2022', 20270825: 'qni2018'});

/** The scenario a date's day plays, on every attempt: scenarioIdOf's, or on an anniversary its variant (D-29). */
export function dailyScenarioIdOf(ymd) {
  return scenarioIdOf(ymd) + (Object.hasOwn(ANNIVERSARY_KEYS, ymd) ? '-' + ANNIVERSARY_KEYS[ymd] : '');
}

export function dailyFor(date, stamp) {
  const L = DAILIES, ymd = ymdIn(date), on = !!dayOf(ymd) && ymd >= ymdIn(L.from) && ymd <= ymdIn(L.to);
  return {seed: seedOf(ymd, on ? L.attempts[ymd] || 0 : 0), scenarioId: dailyScenarioIdOf(ymd), gated: on && L.v === stamp, ymd};
}

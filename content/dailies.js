// content/dailies.js: the gate-checked dailies (D-9, Q-75): exceptions only. desk/README.md §32.4.8.
export const DAILIES = {v: 'v4-core-2d.0|2010181300|1748646610', from: '2026-10-12', to: '2027-12-31', attempts: {
  20261023: 2, 20261026: 7, 20261127: 8, 20261207: 2, 20261216: 7, 20261217: 32, 20270128: 4, 20270507: 7,
  20270512: 25, 20270514: 18, 20270517: 8, 20270704: 4, 20270728: 3, 20270806: 2, 20270924: 8, 20270927: 5,
  20271112: 1, 20271123: 8, 20271213: 12, 20271216: 3, 20271229: 4, 20271230: 21, 20271231: 17,
}};

export const seedOf = (ymd, k = 0) => ymd + k * 1e8;
export const ymdOf = seed => (seed >>> 0) % 1e8;
const ymdIn = d => typeof d === 'number' ? d : d instanceof Date ? d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate()
  : /^\d{4}-\d\d-\d\d$/.test(d) ? +d.replace(/-/g, '') : NaN;
const dayOf = ymd => {
  const y = Math.floor(ymd / 1e4), m = Math.floor(ymd / 100) % 100, d = ymd % 100, t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null;
};

export function scenarioIdOf(ymd) {
  const t = dayOf(ymd);
  return t && t.getUTCDay() % 6 === 0 ? 'desk-weekend' : 'desk';
}

/**
 * W6 (D-29): the anniversary dailies' dates, each with its key: there the daily plays the variant '<scenarioIdOf>-<key>'
 * (content/anniversaries.js holds the account and the overrides; content/scenarios.js makes the variant). Kept here, so this
 * module imports nothing (tools/daily-gen.js rewrites it; tests/dailies.test.js imports the rewritten text on its own).
 */
export const ANNIVERSARY_KEYS = Object.freeze({20261214: 'loyyang', 20270213: 'towers', 20270525: 'callide'});

/** The scenario a date's day plays, on every attempt: scenarioIdOf's, or on an anniversary its variant (D-29). */
export function dailyScenarioIdOf(ymd) {
  return scenarioIdOf(ymd) + (Object.hasOwn(ANNIVERSARY_KEYS, ymd) ? '-' + ANNIVERSARY_KEYS[ymd] : '');
}

export function dailyFor(date, stamp) {
  const L = DAILIES, ymd = ymdIn(date), on = !!dayOf(ymd) && ymd >= ymdIn(L.from) && ymd <= ymdIn(L.to);
  return {seed: seedOf(ymd, on ? L.attempts[ymd] || 0 : 0), scenarioId: dailyScenarioIdOf(ymd), gated: on && L.v === stamp, ymd};
}

// content/dailies.js: the gate-checked dailies (D-9, Q-75): exceptions only. desk/README.md §32.4.8.
// v: the build stamp the list was gated under (tools/daily-gen.js writes it); from, to: 'YYYY-MM-DD'.
export const DAILIES = {v: '', from: '', to: '', attempts: {}};

export const seedOf = (ymd, k = 0) => ymd + k * 1e8;
export const ymdOf = seed => (seed >>> 0) % 1e8;
const ymdIn = d => typeof d === 'number' ? d : d instanceof Date ? d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate()
  : /^\d{4}-\d\d-\d\d$/.test(d) ? +d.replace(/-/g, '') : NaN;

/** 'desk-weekend' on a valid Saturday or Sunday date, else 'desk': the one date-to-scenario mapping. */
export function scenarioIdOf(ymd) {
  const y = Math.floor(ymd / 1e4), m = Math.floor(ymd / 100) % 100, d = ymd % 100, t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && t.getUTCDay() % 6 === 0 ? 'desk-weekend' : 'desk';
}

/** A date's daily (a local Date, 'YYYY-MM-DD' or YYYYMMDD): its listed attempt inside [from, to], else attempt 0; gated only under this build's stamp. */
export function dailyFor(date, stamp) {
  const L = DAILIES, ymd = ymdIn(date), on = ymd >= ymdIn(L.from) && ymd <= ymdIn(L.to);
  return {seed: seedOf(ymd, on ? L.attempts[ymd] || 0 : 0), scenarioId: scenarioIdOf(ymd), gated: on && L.v === stamp, ymd};
}

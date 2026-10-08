// app/par.js: par (the autopilot on the same day) run in the page a slice a frame, for the ALL-IN
// score (Q-48, desk/README.md §30.7). Stage A stub: done at once, no score; W4 fills the runner.

/** Grid seconds between the series' marks (04:00, 04:05, … the next 04:00: 289 marks). */
export const PAR_MARK_S = 300;

/** opts.storage: {read(key), write(key, value)}, app/game.js's wrapped storage (C-8). */
export function createParRunner(seed, scenario, opts) {
  return {step(maxTicks) { return true; }, done: true, score: null, series: [], at(s) { return null; }, progress: 1, black: false};
}

/** A series' row at grid second s, linear between its marks; null past its last mark (at(s); a finished par's too). */
export function seriesAt(series, s) {
  const x = Math.max(0, s) / PAR_MARK_S, k = Math.floor(x), f = x - k, a = series[k], b = series[k + 1], row = {};
  if (!a || (f > 0 && !b)) return null;
  for (const key in a) row[key] = f > 0 ? a[key] + (b[key] - a[key]) * f : a[key];
  return row;
}

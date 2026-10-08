// app/par.js: par (the autopilot on the same day) run in the page a slice a frame, for the ALL-IN
// score (Q-48, desk/README.md §30.7). Stage A stub: done at once, no score; W4 fills the runner.

/** opts.storage: {read(key), write(key, value)}, app/game.js's wrapped storage (C-8). */
export function createParRunner(seed, scenario, opts) {
  return {step(maxTicks) { return true; }, done: true, score: null, series: [], at(s) { return null; }, progress: 1, black: false};
}

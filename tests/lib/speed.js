// A CPU yardstick for the performance budgets (D-9, H-8 / README §10) that shares no code with
// the sim (review fix): a budget test that times the engine against the engine itself (par
// against planOnly) cannot fail when the whole engine slows down, and an absolute wall-clock
// bound either flakes on a slow CI box or has to be so loose that it proves nothing. So a
// budget is stated in yardstick units: the yardstick's ns per iteration is measured in the
// same process, just before the timed work, and the budget (a time on the owner's laptop,
// where D-9 is defined) is divided by OWNER_YARD_NS, the yardstick measured there.
//
// Added in the review-fix pass (README §1 lists tests/lib/ as frozen after stage A; this is a
// new file, not an edit of the stage A helpers).

/** The yardstick on the owner's laptop (Node 24.18, 2026-09-30): min of 7 runs, ns per iteration. */
export const OWNER_YARD_NS = 70;

// Governor-like float updates over 14 small objects and a 32-entry history ring: the same kind
// of work as physics.tick (field loads and stores, multiplies, clamps, a masked ring index),
// written independently of it. Returns a value the caller keeps, so nothing is optimised away.
function yard(n) {
  const us = [];
  for (let i = 0; i < 14; i++) us.push({sched: 100 + 30 * i, gov: 0, out: 0, gain: 200 + i, alpha: 0.004 + i * 1e-4, cap: 60, avail: 700});
  const hist = new Float64Array(32).fill(50);
  let f = 49.97, acc = 0;
  for (let t = 0; t < n; t++) {
    const e = hist[(t - 25) & 31] - 50;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const u = us[i];
      let tgt = e > 0.015 ? (0.015 - e) * u.gain : e < -0.015 ? (-0.015 - e) * u.gain : 0;
      if (tgt > u.cap) tgt = u.cap; else if (tgt < -u.cap) tgt = -u.cap;
      const up = u.avail - u.sched;
      if (tgt > up) tgt = up;
      u.gov += (tgt - u.gov) * u.alpha;
      u.out = u.sched + u.gov;
      sum += u.out;
    }
    f += (sum - 6720 - 13) * 1e-7;
    if (f > 50.2) f = 49.8;
    hist[t & 31] = f;
    acc += f;
  }
  return acc;
}

let keep = 0;

/**
 * The yardstick on this machine now: ns per iteration, the fastest of `runs` runs of
 * `n` iterations (the fastest run is the least disturbed by other processes, so a loaded
 * machine makes the yardstick slower, never the budget tighter).
 */
export function yardstickNs(runs = 7, n = 400000) {
  let best = Infinity;
  for (let k = 0; k < runs; k++) {
    const t0 = performance.now();
    keep += yard(n);
    const ns = (performance.now() - t0) * 1e6 / n;
    if (ns < best) best = ns;
  }
  return best;
}

/** The yardstick's running result (read it so nothing is optimised away). */
export const yardstickSink = () => keep;

/**
 * A clock for timed work: the main thread's CPU time where Node has it (>= 23.9:
 * process.threadCpuUsage, which other processes and GC helper threads do not inflate), else
 * wall time. Returns a function that gives the seconds since it was made.
 */
export function workClock() {
  if (typeof process.threadCpuUsage === 'function') {
    const c0 = process.threadCpuUsage();
    return () => { const c = process.threadCpuUsage(c0); return (c.user + c.system) / 1e6; };
  }
  const t0 = performance.now();
  return () => (performance.now() - t0) / 1000;
}

/** A budget of `ns` nanoseconds on the owner's laptop, in yardstick units. */
export const budgetUnits = ns => ns / OWNER_YARD_NS;

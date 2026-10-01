// app/perf.js: the F-11 `?perf` overlay's numbers: frame ms p50 / p95, sim ms, draw ms per
// module, ticks per frame, each p95 marked OK or OVER against the F-11 budget. The model is
// pure (rings of samples); renderPerf writes it into an element.

/** Frames kept for the percentiles. */
export const PERF_WINDOW = 240;

/**
 * F-11 accept: p95 frame time <= 8 ms, of which the sim is <= 1 ms at up to 150x and <= 3 ms
 * above it (2,100x is the fastest rate, D-2). drawP95Ms: the per-module targets the contract
 * names (desk/README.md §7: the Live Stack <= 4 ms; §14.3: the map <= 2 ms); modules without
 * one are shown unmarked.
 */
export const BUDGET = Object.freeze({frameP95Ms: 8, simP95Ms: 1, simFastP95Ms: 3, simFastAboveRate: 150,
  drawP95Ms: Object.freeze({map: 2, stack: 4})});

/** The sim's p95 budget (ms) at a playback rate (grid seconds per real second). */
export function simBudgetMs(rate) {
  return rate > BUDGET.simFastAboveRate ? BUDGET.simFastP95Ms : BUDGET.simP95Ms;
}

export function createPerf() {
  return {n: 0, head: 0, frame: new Float64Array(PERF_WINDOW), sim: new Float64Array(PERF_WINDOW),
    ticks: new Float64Array(PERF_WINDOW), rate: new Float64Array(PERF_WINDOW), draw: {}, last: {frameMs: 0, simMs: 0, ticks: 0}};
}

/**
 * Record one frame.
 * @param {object} p from createPerf
 * @param {{frameMs:number, simMs:number, ticks:number, rate?:number, draw:Object<string, number>}} f
 *   rate: the playback rate of the frame (the sim budget depends on it); draw: ms per module
 */
export function perfFrame(p, f) {
  const i = p.head;
  p.frame[i] = f.frameMs; p.sim[i] = f.simMs; p.ticks[i] = f.ticks; p.rate[i] = Number.isFinite(f.rate) ? f.rate : 0;
  for (const k of Object.keys(f.draw || {})) {
    if (!p.draw[k]) p.draw[k] = new Float64Array(PERF_WINDOW);
    p.draw[k][i] = f.draw[k];
  }
  p.head = (i + 1) % PERF_WINDOW;
  if (p.n < PERF_WINDOW) p.n++;
  p.last = f;
}

/** The q-quantile (0..1) of the first n entries of a ring. */
export function quantile(arr, n, q) {
  if (n <= 0) return 0;
  const a = Array.from(arr.subarray ? arr.subarray(0, n) : arr.slice(0, n)).sort((x, y) => x - y);
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1));
  return a[idx];
}

/**
 * {frames, frameP50, frameP95, simP50, simP95, ticksP50, rateMax, draw: {module: {p50, p95}},
 * budget: {frameMs, simMs}, over: {frame, sim, draw: {module: bool}}} over the window. The sim
 * budget is the one for the fastest rate in the window (a window that saw FAST or 2,100x is
 * judged at 3 ms).
 */
export function perfStats(p) {
  const draw = {}, overDraw = {};
  for (const k of Object.keys(p.draw)) {
    draw[k] = {p50: quantile(p.draw[k], p.n, 0.5), p95: quantile(p.draw[k], p.n, 0.95)};
    if (BUDGET.drawP95Ms[k] !== undefined) overDraw[k] = draw[k].p95 > BUDGET.drawP95Ms[k];
  }
  let rateMax = 0;
  for (let i = 0; i < p.n; i++) if (p.rate[i] > rateMax) rateMax = p.rate[i];
  const st = {frames: p.n, frameP50: quantile(p.frame, p.n, 0.5), frameP95: quantile(p.frame, p.n, 0.95),
    simP50: quantile(p.sim, p.n, 0.5), simP95: quantile(p.sim, p.n, 0.95), ticksP50: quantile(p.ticks, p.n, 0.5), rateMax, draw};
  st.budget = {frameMs: BUDGET.frameP95Ms, simMs: simBudgetMs(rateMax)};
  st.over = {frame: st.frameP95 > st.budget.frameMs, sim: st.simP95 > st.budget.simMs, draw: overDraw};
  return st;
}

/** The overlay's text lines: each budgeted p95 ends in 'OK' or 'OVER' and its budget. */
export function perfLines(st) {
  const f = x => x.toFixed(2);
  const mark = (over, ms) => '  ' + (over ? 'OVER' : 'OK') + ' (budget ' + ms + ' ms)';
  const lines = ['frame ms p50 ' + f(st.frameP50) + ' · p95 ' + f(st.frameP95) + (st.over ? mark(st.over.frame, st.budget.frameMs) : ''),
    'sim ms p50 ' + f(st.simP50) + ' · p95 ' + f(st.simP95) +
      (st.over ? mark(st.over.sim, st.budget.simMs) + ' at ' + (st.rateMax > BUDGET.simFastAboveRate ? '>' : '≤') + BUDGET.simFastAboveRate + '×' : ''),
    'ticks/frame p50 ' + Math.round(st.ticksP50)];
  for (const k of Object.keys(st.draw)) {
    lines.push('draw ' + k + ' p50 ' + f(st.draw[k].p50) + ' · p95 ' + f(st.draw[k].p95) +
      (st.over && st.over.draw[k] !== undefined ? mark(st.over.draw[k], BUDGET.drawP95Ms[k]) : ''));
  }
  return lines;
}

/** Write the overlay (every ~0.5 s is plenty). */
export function renderPerf(el, p) {
  if (!el) return;
  el.textContent = perfLines(perfStats(p)).join('\n');
}

// app/perf.js: the F-11 `?perf` overlay's numbers: frame ms p50 / p95, sim ms, draw ms per
// module, ticks per frame. The model is pure (rings of samples); renderPerf writes it into an
// element. The budget itself (F-11) is Phase 1b; 1a shows the numbers.

/** Frames kept for the percentiles. */
export const PERF_WINDOW = 240;

export function createPerf() {
  return {n: 0, head: 0, frame: new Float64Array(PERF_WINDOW), sim: new Float64Array(PERF_WINDOW),
    ticks: new Float64Array(PERF_WINDOW), draw: {}, last: {frameMs: 0, simMs: 0, ticks: 0}};
}

/**
 * Record one frame.
 * @param {object} p from createPerf
 * @param {{frameMs:number, simMs:number, ticks:number, draw:Object<string, number>}} f draw: ms per module
 */
export function perfFrame(p, f) {
  const i = p.head;
  p.frame[i] = f.frameMs; p.sim[i] = f.simMs; p.ticks[i] = f.ticks;
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

/** {frameP50, frameP95, simP50, simP95, ticksP50, draw: {module: p95}} over the window. */
export function perfStats(p) {
  const draw = {};
  for (const k of Object.keys(p.draw)) draw[k] = {p50: quantile(p.draw[k], p.n, 0.5), p95: quantile(p.draw[k], p.n, 0.95)};
  return {frames: p.n, frameP50: quantile(p.frame, p.n, 0.5), frameP95: quantile(p.frame, p.n, 0.95),
    simP50: quantile(p.sim, p.n, 0.5), simP95: quantile(p.sim, p.n, 0.95), ticksP50: quantile(p.ticks, p.n, 0.5), draw};
}

/** The overlay's text lines. */
export function perfLines(st) {
  const f = x => x.toFixed(2);
  const lines = ['frame ms p50 ' + f(st.frameP50) + ' · p95 ' + f(st.frameP95), 'sim ms p50 ' + f(st.simP50) + ' · p95 ' + f(st.simP95),
    'ticks/frame p50 ' + Math.round(st.ticksP50)];
  for (const k of Object.keys(st.draw)) lines.push('draw ' + k + ' p50 ' + f(st.draw[k].p50) + ' · p95 ' + f(st.draw[k].p95));
  return lines;
}

/** Write the overlay (every ~0.5 s is plenty). */
export function renderPerf(el, p) {
  if (!el) return;
  el.textContent = perfLines(perfStats(p)).join('\n');
}

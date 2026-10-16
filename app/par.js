// app/par.js: par (the autopilot on the same day) run in the page a slice a frame, for the ALL-IN
// score (Q-48, desk/README.md §30.7): AP.runPar resumes from our state and memo. W3: a finished par keeps
// its input log (p.log, for D-21 and a later D-22) and, a grid minute each, its lowest and highest
// frequency and its spare in 5 min at the minute's end (p.minutes, flat [lowHz, highHz, r5MW, ...]: the
// verdict's moment, D-21, compares the player's minute with par's).

import {V, SIM_VERSION} from '../sim/params.js';
import * as AP from '../sim/autopilot.js';

/** Grid seconds between the series' marks (04:00, 04:05, … the next 04:00: 289 marks). */
export const PAR_MARK_S = 300;
export const PAR_CHUNK_TICKS = 500;   // the fewest a step plays
export const PAR_KEY = 'gridwatch:v4:par';

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const MARK = PAR_MARK_S * V.TICKS_PER_S, KEYS = ['costDollars', 'lightsMWh', 'servedMWh', 'co2tPerMWh', 'saidiMin', 'saifi', 'maifi', 'uflsMWh', 'directedMWh'];

/**
 * opts.storage: {read(key), write(key, value)}, app/game.js's wrapped storage (C-8).
 * step(maxTicks, budgetMs): plays up to maxTicks (at least PAR_CHUNK_TICKS) in chunks of PAR_CHUNK_TICKS, and
 * stops after the chunk that passes budgetMs of real time (X-46: a frame's par stays near its budget).
 */
export function createParRunner(seed, scenario, opts) {
  const storage = opts && opts.storage, id = scenario.id, row = sc => Object.fromEntries(KEYS.map(k => [k, sc[k]]));
  seed >>>= 0;
  let state = null, memo = null;
  const minutes = [], MIN = V.S_PER_MIN * V.TICKS_PER_S;
  let lo = Infinity, hi = -Infinity;
  const onStep = st => {
    const f = st.phys.fHz;
    if (f < lo) lo = f;
    if (f > hi) hi = f;
    if (st.tick % MIN === 0) { minutes.push(round3(lo), round3(hi), Math.round(st.sec.r5MW)); lo = Infinity; hi = -Infinity; }
  };
  const run = untilTick => AP.runPar(seed, scenario, {state, memo, untilTick, hashEveryS: V.DAY_S + 1, onStep});
  const p = {done: false, score: null, series: [], progress: 0, black: false, log: null, minutes,
    step(maxTicks, budgetMs = Infinity) {
      const t0 = clock();
      try {
        if (!state && !p.done) { const r = run(0); state = r.state; memo = r.memo; p.series.push(row(r.score)); }
        for (let left = Math.max(PAR_CHUNK_TICKS, maxTicks || 0), n = 0; left > 0 && !p.done && (n++ === 0 || clock() - t0 < budgetMs);) {
          const t = state.tick, r = run(Math.min(t + Math.min(left, PAR_CHUNK_TICKS), (Math.floor(t / MARK) + 1) * MARK, V.DAY_TICKS));
          left -= state.tick - t;
          if (state.tick % MARK === 0) p.series.push(row(r.score));
          if (state.over) {
            Object.assign(p, {done: true, score: r.score, black: state.black, log: state.log.map(x => ({tick: x.tick, type: x.type, args: Object.assign({}, x.args)}))});
            if (storage) storage.write(PAR_KEY, {v: SIM_VERSION, seed, scenarioId: id, score: r.score, series: p.series, black: state.black, log: p.log, minutes});
          }
        }
      } catch (e) {
        p.done = true;   // no par today; the day plays on
      }
      if (p.done) state = memo = null;
      p.progress = state ? state.tick / V.DAY_TICKS : 1;
      return p.done;
    },
    at(s) { return seriesAt(p.series, s); }};
  const k = storage && storage.read(PAR_KEY);
  if (k && k.v === SIM_VERSION && k.seed === seed && k.scenarioId === id && k.score instanceof Object && k.series instanceof Array) {
    Object.assign(p, {done: true, score: k.score, series: k.series, black: !!k.black, progress: 1, log: k.log || null, minutes: k.minutes || []});
  }
  return p;
}

const round3 = x => Math.round(x * 1000) / 1000;

/** W3: par's minute holding grid second s from p.minutes: {lowHz, highHz, r5MW}, or null before it was played. */
export function parMinute(p, s) {
  const k = Math.floor(s / V.S_PER_MIN) * 3, m = p && p.minutes;
  return m && k + 2 < m.length ? {lowHz: m[k], highHz: m[k + 1], r5MW: m[k + 2]} : null;
}

/** A series' row at grid second s, linear between its marks; null past its last mark (at(s); a finished par's too). */
export function seriesAt(series, s) {
  const x = Math.max(0, s) / PAR_MARK_S, k = Math.floor(x), f = x - k, a = series[k], b = series[k + 1], row = {};
  if (!a || (f > 0 && !b)) return null;
  for (const key in a) row[key] = f > 0 ? a[key] + (b[key] - a[key]) * f : a[key];
  return row;
}

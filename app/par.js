// app/par.js: par (the autopilot on the same day) run in the page a slice a frame, for the ALL-IN
// score (Q-48, desk/README.md §30.7): AP.runPar resumes from our state and memo.

import {V, SIM_VERSION} from '../sim/params.js';
import * as AP from '../sim/autopilot.js';

/** Grid seconds between the series' marks (04:00, 04:05, … the next 04:00: 289 marks). */
export const PAR_MARK_S = 300;
export const PAR_CHUNK_TICKS = 500;   // the fewest a step plays
export const PAR_KEY = 'gridwatch:v4:par';

const MARK = PAR_MARK_S * V.TICKS_PER_S, KEYS = ['costDollars', 'lightsMWh', 'servedMWh', 'co2tPerMWh', 'saidiMin', 'saifi', 'maifi'];

/** opts.storage: {read(key), write(key, value)}, app/game.js's wrapped storage (C-8). */
export function createParRunner(seed, scenario, opts) {
  const storage = opts && opts.storage, id = scenario.id, row = sc => Object.fromEntries(KEYS.map(k => [k, sc[k]]));
  seed >>>= 0;
  let state = null, memo = null;
  const run = untilTick => AP.runPar(seed, scenario, {state, memo, untilTick, hashEveryS: V.DAY_S + 1});
  const p = {done: false, score: null, series: [], progress: 0, black: false,
    step(maxTicks) {
      try {
        if (!state && !p.done) { const r = run(0); state = r.state; memo = r.memo; p.series.push(row(r.score)); }
        for (let left = Math.max(PAR_CHUNK_TICKS, maxTicks || 0); left > 0 && !p.done;) {
          const t = state.tick, r = run(Math.min(t + left, (Math.floor(t / MARK) + 1) * MARK, V.DAY_TICKS));
          left -= state.tick - t;
          if (state.tick % MARK === 0) p.series.push(row(r.score));
          if (state.over) {
            Object.assign(p, {done: true, score: r.score, black: state.black});
            if (storage) storage.write(PAR_KEY, {v: SIM_VERSION, seed, scenarioId: id, score: r.score, series: p.series, black: state.black});
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
    Object.assign(p, {done: true, score: k.score, series: k.series, black: !!k.black, progress: 1});
  }
  return p;
}

/** A series' row at grid second s, linear between its marks; null past its last mark (at(s); a finished par's too). */
export function seriesAt(series, s) {
  const x = Math.max(0, s) / PAR_MARK_S, k = Math.floor(x), f = x - k, a = series[k], b = series[k + 1], row = {};
  if (!a || (f > 0 && !b)) return null;
  for (const key in a) row[key] = f > 0 ? a[key] + (b[key] - a[key]) * f : a[key];
  return row;
}

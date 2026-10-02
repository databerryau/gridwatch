// app/record.js: what the bench's strip charts plot. DOM-free.
//
// The sim keeps no history, so the bench records it as it plays:
//   * every tick: frequency (for the live chart at slow speeds and the per-second envelope);
//   * every grid second: min / max / mean frequency (the last 10 minutes);
//   * every grid minute: an observe() snapshot's numbers (the 24-h charts);
//   * during each contingency's watch: per-tick frequency and who caught the loss.
// Per tick it reads only values observe() also exposes (f.hz = phys.fHz; the balance
// readouts; sec's preview), straight from state because observe() allocates (README §10).
// It never writes state. Typed arrays: this is presentation, not sim state.

import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S, S_PER_MIN = V.S_PER_MIN, DAY_S = V.DAY_S;
/** Tick-resolution history kept for the live chart (grid seconds). */
export const TICK_WINDOW_S = 60;
/** Per-second history kept (grid seconds): the "last few minutes" chart. */
export const SEC_WINDOW_S = 600;
/** F-4: above this rate (grid seconds per real second) the needle shows a 1-s average. */
export const NEEDLE_AVG_ABOVE_X = 10;
/** Minutes in a sim day (04:00 to 04:00). */
export const DAY_MIN = DAY_S / S_PER_MIN;
/**
 * Ticks traced after each contingency: the watch (WATCH_S) and as long again. A trace holds
 * f[i] = the frequency at the START of tick startTick + i (f[0] = fStartHz), as the sim's
 * contingency record judges it, and caught[key][i] = that tick's readouts minus the pre-trip
 * ones (so conts[].caught equals caught[key][extremeTick - startTick]). len counts valid f;
 * caught is valid below len - 1.
 */
export const TRACE_TICKS = 2 * V.WATCH_S * TPS;
/** The watch's catch sources, in physical order (K-15, J-25), as keys of conts[].caught. */
export const CAUGHT_KEYS = Object.freeze(['inertiaMW', 'batteryMW', 'guardMW', 'governorsMW', 'loadReliefMW', 'uflsMW', 'inverterMW']);
/** Minute fields recorded from observe() (see commitMinute). */
export const MINUTE_FIELDS = Object.freeze(['fMin', 'fMax', 'fMean', 'demand', 'served', 'shed', 'supply', 'renew',
  'price', 'level', 'r5', 'L', 'battery', 'tie']);
export const LEVELS = Object.freeze(['SECURE', 'TIGHT', 'SHORT', 'SHEDDING']);
const MAX_TRACES = 40;

const nanArray = n => new Float64Array(n).fill(NaN);

export function createRecorder() {
  const minute = {};
  for (const k of MINUTE_FIELDS) minute[k] = nanArray(DAY_MIN);
  const tickN = TICK_WINDOW_S * TPS;
  return {
    tickF: new Float64Array(tickN), tickN, tickHead: 0, tickCount: 0, lastTick: 0, // ring of f per tick (end of tick)
    prevF: V.F0_HZ, curF: V.F0_HZ,                                                  // for render interpolation
    lastMeanF: V.F0_HZ,          // mean frequency of the last completed grid second (F-4's needle above 10x)
    sec: {min: nanArray(SEC_WINDOW_S), max: nanArray(SEC_WINDOW_S), mean: nanArray(SEC_WINDOW_S), s: new Float64Array(SEC_WINDOW_S).fill(-1)},
    acc: {min: Infinity, max: -Infinity, sum: 0, n: 0},         // this second so far
    macc: {min: Infinity, max: -Infinity, sum: 0, n: 0},        // this minute so far
    minute, lastMinute: -1,
    traces: [],                  // one per contingency (see startTrace)
    preview: {cur: null},        // sec's TRIP PREVIEW as the current grid second's update left it
  };
}

// The TRIP PREVIEW the security update left this second (observe().sec fields). The nadir
// is for losing previewLId (a cached preview may predate a change of L).
function previewNow(state) {
  const sec = state.sec;
  return {nadirHz: sec.previewNadirHz, lId: sec.previewLId, lMW: sec.previewLMW, lKind: sec.lKind, level: sec.level,
    atS: sec.previewAtS};
}

/**
 * Open a trace for the contingency that just started. Call it as soon as the contingency
 * exists (after the step() that returned the 'contingency' record, or after a debug trip)
 * and BEFORE onTick for that step: onTick refreshes the remembered preview once the new
 * second's security update has run, and by then the update has already re-run for the next
 * L. So `preview` here is still the TRIP PREVIEW the desk showed for the loss before it
 * happened (K-10: the prediction beside the actual nadir); lId says which loss it predicted.
 */
export function startTrace(r, state) {
  const c = state.conts[state.contIdx];
  const tr = {
    n: c.n, startTick: c.startTick, cause: c.cause, id: c.id, lostMW: c.lostMW, fStartHz: c.fStartHz,
    pre: Object.assign({}, c.pre),
    f: new Float64Array(TRACE_TICKS + 1).fill(NaN),
    caught: {}, len: 1,
    preview: r.preview.cur,
  };
  for (const k of CAUGHT_KEYS) tr.caught[k] = new Float64Array(TRACE_TICKS).fill(NaN);
  tr.f[0] = c.fStartHz;
  r.traces.push(tr);
  if (r.traces.length > MAX_TRACES) r.traces.shift();
  return tr;
}

/**
 * After every step. Returns true when a grid minute just completed (the caller then passes
 * an observe() snapshot to commitMinute).
 */
export function onTick(r, state) {
  const t = state.tick, f = state.phys.fHz;
  r.prevF = r.curF; r.curF = f; r.lastTick = t;
  r.tickF[r.tickHead] = f;
  r.tickHead = (r.tickHead + 1) % r.tickN;
  if (r.tickCount < r.tickN) r.tickCount++;
  const a = r.acc;
  if (f < a.min) a.min = f;
  if (f > a.max) a.max = f;
  a.sum += f; a.n++;
  // Contingency traces (only the latest can still be filling: watches never overlap a new one's start).
  if (r.traces.length) {
    const tr = r.traces[r.traces.length - 1];
    const k = t - tr.startTick;
    if (k >= 1 && k <= TRACE_TICKS) {
      // The tick just run is startTick + k - 1: its readouts; f now is the start of the next.
      tr.f[k] = f;
      const ph = state.phys, b = state.battery, p = tr.pre, i = k - 1;
      tr.caught.inertiaMW[i] = ph.inertiaMW - p.inertiaMW;
      tr.caught.batteryMW[i] = b.outMW - b.ffrMW - p.batteryMW;
      tr.caught.guardMW[i] = b.ffrMW - p.guardMW;
      tr.caught.governorsMW[i] = ph.govTotalMW - p.governorsMW;
      tr.caught.loadReliefMW[i] = ph.loadReliefMW - p.loadReliefMW;
      tr.caught.uflsMW[i] = ph.shedMW - p.uflsMW;
      // Phase 2a (desk/README.md §19.2): the inverters' over-frequency back-off, as the sim's record counts it.
      tr.caught.inverterMW[i] = 0 - ((ph.renPfrMW || 0) + (ph.roofPfrMW || 0)) - (p.inverterMW || 0);
      tr.len = k + 1;
    }
  }
  if (t % TPS === 1) r.preview.cur = previewNow(state); // this second's security update has run
  if (t % TPS !== 0 && !state.over) return false;
  // A grid second completed (or the day ended mid-second).
  const s = Math.ceil(t / TPS) - 1, j = ((s % SEC_WINDOW_S) + SEC_WINDOW_S) % SEC_WINDOW_S;
  if (a.n > 0) {
    r.sec.min[j] = a.min; r.sec.max[j] = a.max; r.sec.mean[j] = a.sum / a.n; r.sec.s[j] = s;
    r.lastMeanF = a.sum / a.n;
    const m = r.macc;
    if (a.min < m.min) m.min = a.min;
    if (a.max > m.max) m.max = a.max;
    m.sum += a.sum; m.n += a.n;
  }
  a.min = Infinity; a.max = -Infinity; a.sum = 0; a.n = 0;
  return t % (TPS * S_PER_MIN) === 0 || state.over;
}

/**
 * Fold the minute that just ended: frequency from the ticks, the rest from obs (an
 * observe() snapshot taken at the minute's end).
 */
export function commitMinute(r, obs) {
  const m = Math.min(DAY_MIN - 1, Math.max(0, Math.ceil(obs.tick / (TPS * S_PER_MIN)) - 1));
  const x = r.minute, a = r.macc;
  if (a.n > 0) { x.fMin[m] = a.min; x.fMax[m] = a.max; x.fMean[m] = a.sum / a.n; }
  x.demand[m] = obs.demand.nowMW;
  x.served[m] = obs.demand.servedMW;
  x.shed[m] = obs.demand.shedMW;
  x.supply[m] = obs.balance.supplyMW;
  x.renew[m] = obs.wind.outMW + obs.solar.outMW;
  x.price[m] = obs.price.mwh;
  x.level[m] = LEVELS.indexOf(obs.sec.level);
  x.r5[m] = obs.sec.r5MW;
  x.L[m] = obs.sec.lMW;
  x.battery[m] = obs.battery.outMW;
  x.tie[m] = obs.tie.flowMW;
  r.lastMinute = m;
  a.min = Infinity; a.max = -Infinity; a.sum = 0; a.n = 0;
}

/**
 * The frequency the needle shows (F-4): interpolated between the last two ticks at rates up to
 * 10x (and while paused), the 1-s average of the last completed grid second above 10x, where
 * CRUISE hides the seconds-scale wobble (review fix: the bench showed the instantaneous value).
 */
export function needleF(r, rate, alpha) {
  return rate > NEEDLE_AVG_ABOVE_X ? r.lastMeanF : interpolatedF(r, alpha);
}

/** Frequency interpolated between the last two ticks (F-5: render interpolates between ticks). */
export function interpolatedF(r, alpha) {
  return r.prevF + (r.curF - r.prevF) * alpha;
}

/** The last `n` per-tick frequencies, oldest first (n <= what is recorded). */
export function recentTicks(r, n) {
  const k = Math.min(n, r.tickCount), out = new Float64Array(k);
  for (let i = 0; i < k; i++) out[i] = r.tickF[(r.tickHead - k + i + r.tickN) % r.tickN];
  return out;
}

/** Per-second rows for grid seconds [fromS, toS), NaN where not recorded. */
export function secondsWindow(r, fromS, toS) {
  const n = Math.max(0, toS - fromS), min = new Float64Array(n), max = new Float64Array(n), mean = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = fromS + i, j = ((s % SEC_WINDOW_S) + SEC_WINDOW_S) % SEC_WINDOW_S;
    const ok = s >= 0 && r.sec.s[j] === s;
    min[i] = ok ? r.sec.min[j] : NaN; max[i] = ok ? r.sec.max[j] : NaN; mean[i] = ok ? r.sec.mean[j] : NaN;
  }
  return {min, max, mean};
}

/** The trace of contingency n, or the latest, or null. */
export function traceOf(r, n) {
  if (!r.traces.length) return null;
  if (n === undefined) return r.traces[r.traces.length - 1];
  return r.traces.find(t => t.n === n) || null;
}

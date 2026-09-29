// sim/weather.js: the external world's weather and demand (spec F-3, P-6, S-4).
//
// Stage A (implemented, frozen API): the weather regime and the pre-rolled ext series,
// table readers, and sampleSecond(), which sets state.env for each grid second.
// Stage B owner "market + events": forecast() (S-4 drift toward announced regime, L-2 band).
//
// Pure functions only. No transcendental Math functions (risk 5): tables are
// interpolated with arithmetic, and noise comes from rng.normal (exact arithmetic).

import {V} from './params.js';
import {STREAM, uniform, normal, quantise} from './rng.js';

const TPS = V.TICKS_PER_S, S_PER_H = V.S_PER_H, S_PER_MIN = V.S_PER_MIN, DAY_H = V.DAY_H;
const STEP = V.SERIES_STEP_S, LEN = V.SERIES_LEN, PM = V.PER_MILLE;

// ------------------------------------------------------------------ clock and tables

/** Hour of day (0 <= h < 24) at grid second s. */
export function hourOfDay(scn, s) {
  return (scn.clock.startH + s / S_PER_H) % DAY_H;
}

/** Grid second of an hour of day h (h >= 24 is the next morning). Not rounded. */
export function secondOfHour(scn, h) {
  return (h - scn.clock.startH) * S_PER_H;
}

function segment(t, x) {
  let i = 0;
  while (i < t.length - 2 && t[i + 1][0] <= x) i++;
  return i;
}

/** Linear interpolation in a [[x, y], ...] table sorted by x; clamps at both ends. */
export function tableLinear(t, x) {
  if (x <= t[0][0]) return t[0][1];
  if (x >= t[t.length - 1][0]) return t[t.length - 1][1];
  const i = segment(t, x), a = t[i], b = t[i + 1];
  return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
}

/** Smoothstep interpolation (3u^2 - 2u^3) in a sorted [[x, y], ...] table; clamps at both ends. */
export function tableSmooth(t, x) {
  if (x <= t[0][0]) return t[0][1];
  if (x >= t[t.length - 1][0]) return t[t.length - 1][1];
  const i = segment(t, x), a = t[i], b = t[i + 1];
  const u = (x - a[0]) / (b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * u * u * (1 + 2 * (1 - u));
}

/** Underlying demand shape at hour h, before heat, noise and the smelter (MW). */
export function demandBaseMW(scn, h) {
  return tableSmooth(scn.demand.baseMW, h);
}

/** Clear-sky utility solar at hour h (MW, before clearness and curtailment). */
export function clearSkySolarMW(scn, h) {
  return tableLinear(scn.solar.clearSkyMW, h);
}

/** Neighbour region price at hour h ($/MWh, P-6). */
export function neighbourPrice(scn, h) {
  return tableLinear(scn.tie.neighbourPrice, h);
}

/** Tie export limit at hour h (MW, positive number; F-13 midday cap). */
export function exportLimitMW(h) {
  const w = V.TIE_EXPORT_CAP_H;
  return h >= w[0] && h < w[1] ? V.TIE_EXPORT_CAP_MW : V.TIE_MAX_MW;
}

/**
 * Heat demand multiplier at grid second s for a heat window {onsetS, endS} (or null):
 * ramps in over HEAT_RAMP_S before onset and out over HEAT_RAMP_S after the end
 * (legacy heatMod, L428-434).
 */
export function heatMultAt(heat, s) {
  if (!heat) return 1;
  const r = V.HEAT_RAMP_S;
  const rise = Math.min(1, Math.max(0, (s - (heat.onsetS - r)) / r));
  const fall = Math.min(1, Math.max(0, (heat.endS + r - s) / r));
  return 1 + V.HEAT_DEMAND_UPLIFT * Math.min(rise, fall);
}

// ------------------------------------------------------------------ pre-roll (stage A)

/**
 * The day's weather class, from one ext draw: 'heat' | 'storm' | 'calm'.
 * Hidden from the player until announced (never in observe()).
 */
export function prerollRegime(seed, scn) {
  const u = uniform(seed, STREAM.EXT_REGIME, 0);
  const w = scn.weather;
  const cls = u < w.heatShare ? 'heat' : u < w.heatShare + w.stormShare ? 'storm' : 'calm';
  return {cls};
}

// Mean-reverting series at 1-min spacing. `changes` is a time-sorted list of
// {atS, mu, atLeast} applied to the samples at or after atS (legacy sets S.windMu /
// S.cloudMu when an event fires; last write wins).
function ouSeries(seed, stream, cfg, changes) {
  const out = new Array(LEN);
  let x = cfg.startFrac, mu = cfg.mu, next = 0;
  out[0] = quantise(x * PM, 1);
  for (let k = 1; k < LEN; k++) {
    const s = k * STEP;
    while (next < changes.length && changes[next].atS <= s) {
      const c = changes[next++];
      mu = c.atLeast ? Math.max(mu, c.mu) : c.mu;
    }
    x += (mu - x) * cfg.revertPerMin + cfg.sigmaPerMin * normal(seed, stream, k);
    x = Math.min(cfg.max, Math.max(cfg.min, x));
    out[k] = quantise(x * PM, 1);
  }
  return out;
}

/**
 * Pre-roll the ext series (F-3), quantised, at SERIES_STEP_S spacing (SERIES_LEN samples
 * from 04:00 to 04:00): demand noise (integer MW), wind fraction and utility-solar
 * clearness (integer per-mille). Event-driven shifts of the wind and cloud means (storm,
 * drought, cloud front, heat) come from the pre-rolled `events` (ext too), so the series
 * never depend on play.
 */
export function prerollSeries(seed, scn, regime, events) {
  const windChanges = [], cloudChanges = [];
  for (const e of events) {
    if (e.args.windMu !== undefined) windChanges.push({atS: e.atS, mu: e.args.windMu, atLeast: false});
    if (e.args.clearMu !== undefined) cloudChanges.push({atS: e.atS, mu: e.args.clearMu, atLeast: false});
    if (e.args.clearMuAtLeast !== undefined) cloudChanges.push({atS: e.atS, mu: e.args.clearMuAtLeast, atLeast: true});
  }
  const d = scn.demand.noise;
  const noise = new Array(LEN);
  let x = d.startMW;
  noise[0] = quantise(x, 1);
  for (let k = 1; k < LEN; k++) {
    x = x * (1 - d.revertPerMin) + d.sigmaMW * normal(seed, STREAM.EXT_DEMAND, k);
    noise[k] = quantise(x, 1);
  }
  return {
    stepS: STEP,
    demandNoiseMW: noise,
    windPm: ouSeries(seed, STREAM.EXT_WIND, scn.wind, windChanges),
    clearPm: ouSeries(seed, STREAM.EXT_CLOUD, scn.cloud, cloudChanges),
  };
}

/** Per-second demand wobble (ext stream, integer MW). Evaluated on the fly: it is a pure function of (seed, s). */
export function fineNoiseMW(seed, s) {
  return quantise(V.FINE_NOISE_MW * normal(seed, STREAM.EXT_FINE, s), 1);
}

function seriesAt(arr, s) {
  const k = Math.min(LEN - 1, Math.floor(s / STEP));
  const k1 = Math.min(LEN - 1, k + 1);
  const fr = (s - k * STEP) / STEP;
  return arr[k] + (arr[k1] - arr[k]) * fr;
}

/**
 * Set state.env for the current grid second (called by step() at every second boundary,
 * after events.applyDue, so a smelter trip shows in demand in the same second).
 * Reads: tick, seed, scn, ext, smelter.loadMW. Writes: env.* only.
 */
export function sampleSecond(state) {
  const s = Math.floor(state.tick / TPS);
  const scn = state.scn, ext = state.ext, env = state.env;
  const h = hourOfDay(scn, s);
  const heatMult = heatMultAt(ext.heat, s);
  env.s = s;
  env.h = h;
  env.heatActive = ext.heat !== null && s >= ext.heat.onsetS && s < ext.heat.endS;
  env.heatMult = heatMult;
  env.underlyingMW = demandBaseMW(scn, h) * heatMult + seriesAt(ext.series.demandNoiseMW, s) + fineNoiseMW(state.seed, s);
  env.demandMW = env.underlyingMW - (V.SMELTER_MW - state.smelter.loadMW);
  env.windFrac = seriesAt(ext.series.windPm, s) / PM;
  env.windAvailMW = V.WIND_MW * env.windFrac;
  env.clearness = seriesAt(ext.series.clearPm, s) / PM;
  env.solarAvailMW = clearSkySolarMW(scn, h) * env.clearness;
  env.tempC = tableLinear(scn.temperatureC.table, h) + (env.heatActive ? V.HEAT_TEMP_UPLIFT_C : 0);
  env.neighbourPrice = neighbourPrice(scn, h);
  env.exportLimitMW = exportLimitMW(h);
}

// ------------------------------------------------------------------ forecast (stage B: events)

function announced(state, kind) {
  for (let i = state.news.length - 1; i >= 0; i--) if (state.news[i].kind === kind) return state.news[i];
  return null;
}

/**
 * Forecast for the player and par (S-4, L-1, L-2). Uses ONLY public information: the
 * scenario's climatology (demand shape, clear-sky sun, mean wind and clearness), the
 * present state (state.env) and announcements already made (state.news). Never reads
 * state.ext.
 *
 * Returns {fromS, stepS, n, demandP50[], demandP10[], demandP90[], windMW[], solarMW[],
 * neighbourPrice[], exportLimitMW[]}, column k (0-based) at grid second fromS + (k + 1) *
 * stepS. The last two are the public daily shapes (P-6, F-13), exact, for the tie's merit
 * order in the L-0 plan. horizonS may run to the end of the sim day (observe's dayAhead).
 *
 * STAGE A MINIMAL VERSION (safe stub). Stage B "market + events" refines it: wind and solar drift
 * toward the ANNOUNCED regime (storm surge then cut-out, drought, cloud-front window),
 * and the L-2 acceptance (80 +- 5% of realised demand inside P10-P90) is met.
 */
export function forecast(state, horizonS, stepS) {
  const scn = state.scn, env = state.env;
  const n = Math.floor(horizonS / stepS);
  const heatNews = announced(state, 'heat');
  const heat = heatNews ? {onsetS: heatNews.fromS, endS: heatNews.toS} : null;
  const dev0 = env.demandMW - demandBaseMW(scn, env.h) * heatMultAt(heat, env.s);
  // Per-column decay factors (no Math.pow: repeated multiplication).
  let dDecay = 1;
  for (let m = 0; m < stepS / S_PER_MIN; m++) dDecay *= 1 - scn.demand.noise.revertPerMin;
  const drift = Math.max(0, 1 - stepS / V.FC_DRIFT_TAU_S);
  const windTarget = V.WIND_MW * scn.wind.mu, clearTarget = scn.cloud.mu;
  const out = {fromS: env.s, stepS, n, demandP50: [], demandP10: [], demandP90: [], windMW: [], solarMW: [],
    neighbourPrice: [], exportLimitMW: []};
  let dev = dev0, wind = env.windAvailMW, clear = env.clearness;
  for (let k = 0; k < n; k++) {
    const s = env.s + (k + 1) * stepS, h = hourOfDay(scn, s), lead = (k + 1) * stepS;
    dev *= dDecay;
    wind = windTarget + (wind - windTarget) * drift;
    clear = clearTarget + (clear - clearTarget) * drift;
    const p50 = demandBaseMW(scn, h) * heatMultAt(heat, s) + dev;
    const w = Math.min(1, Math.max(0, (lead - V.FC_STEP_S) / (V.FC_SIGMA_FAR_S - V.FC_STEP_S)));
    const sigma = V.FC_SIGMA_NEAR + (V.FC_SIGMA_FAR - V.FC_SIGMA_NEAR) * w;
    out.demandP50.push(p50);
    out.demandP10.push(p50 * (1 - V.Z_P90 * sigma));
    out.demandP90.push(p50 * (1 + V.Z_P90 * sigma));
    out.windMW.push(wind);
    out.solarMW.push(clearSkySolarMW(scn, h) * clear);
    out.neighbourPrice.push(neighbourPrice(scn, h));
    out.exportLimitMW.push(exportLimitMW(h));
  }
  return out;
}

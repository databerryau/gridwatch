// sim/weather.js: the external world's weather and demand (spec F-3, P-6, S-4).
// Contract: sim/README.md §11 weather.js.

import {V} from './params.js';
import {STREAM, uniform, normal, quantise} from './rng.js';
import * as dayplan from './dayplan.js';

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

// The table row i (0 <= i <= length - 2) that starts the segment holding x: the largest i
// with t[i][0] <= x (the callers have already clamped x inside the table). Binary search
// (integration: the linear scan was ~0.1 s of a day in sampleSecond and forecast); the
// result is the same row the scan found, for any sorted table.
function segment(t, x) {
  let lo = 0, hi = t.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid][0] <= x) lo = mid; else hi = mid - 1;
  }
  return lo;
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

/**
 * The 0..1 ramp of a heat window {onsetS, endS} (or null: 0) at grid second s: the same rise
 * and fall as heatMultAt, which keeps its own expression (the classic day is bit-identical).
 * The rooftop heat derate follows it (P-2; desk/README.md C-3): a derate from sunrise would
 * leak a heatwave that has not been announced.
 */
export function heatRampAt(heat, s) {
  if (!heat) return 0;
  const r = V.HEAT_RAMP_S;
  const rise = Math.min(1, Math.max(0, (s - (heat.onsetS - r)) / r));
  const fall = Math.min(1, Math.max(0, (heat.endS + r - s) / r));
  return Math.min(rise, fall);
}

/**
 * P-3 underlying demand shape at hour h, before the heat uplift, the noise and the smelter
 * (MW; desk/README.md C-3). `day` is the public state.day {temp, weekend}: a MILD day is the
 * hot day with its cooling load removed, cooling = COOLING_MAX_MW x clamp((T - COOLING_BASE_C)
 * / COOLING_SPAN_C) with T from the scenario's (hot-day) temperature table; a weekend
 * multiplies any type by WEEKEND_DEMAND_FACTOR. A HOT weekday is demandBaseMW(scn, h) exactly.
 */
export function underlyingBaseMW(scn, day, h) {
  let mw = demandBaseMW(scn, h);
  if (day.temp === 'MILD') {
    const t = tableLinear(scn.temperatureC.table, h);
    mw -= V.COOLING_MAX_MW * Math.min(1, Math.max(0, (t - V.COOLING_BASE_C) / V.COOLING_SPAN_C));
  }
  return day.weekend ? mw * V.WEEKEND_DEMAND_FACTOR : mw;
}

/**
 * P-2 clear-sky rooftop PV of the whole city at hour h (MW): capacityMW x clearFactor x the
 * shapePm table (integer per-mille of the 13:00 peak, linear between its 15-min points; C-4),
 * before the suburbs' shares, their cloud and the heat derate. 0 outside the sun hours and on
 * a scenario with no rooftop.
 */
export function rooftopClearSkyMW(scn, h) {
  const r = scn.rooftop;
  return r.capacityMW * r.clearFactor * tableLinear(r.shapePm, h) / PM;
}

/** Q-65's one climatology: the dayplan block, else derived from scn.events (sim/README.md §11 weather.js, 2c). */
export function climate(scn) {
  const e = scn.events || {}, d = scn.dayplan, heat = e.heat && {clearMu: e.heat.clearMu};
  if (d) {
    const {arriveMu, cutoutAfterMin, cutoutMu, passAfterMin, passMu} = d.act3.storm;
    const {frontMu, clearAfterMin, clearMu, frontRampMin, clearRampMin} = d.act2.front;
    return {storm: {arriveMu, cutoutAfterMin, cutoutMu, passAfterMin, passMu},
      cloud: {frontMu, clearAfterMin, clearMu, frontRampMin, clearRampMin}, drought: {mu: d.act3.drought.mu}, heat};
  }
  const s = e.storm, c = e.cloud, m = h => (h - s.arriveH) * S_PER_H / S_PER_MIN; // a missing block is undefined
  return {storm: s && {arriveMu: s.arriveMu, cutoutAfterMin: s.cutoutWindowH.map(m), cutoutMu: s.cutoutMu, passAfterMin: m(s.passH),
    passMu: s.passMu}, cloud: c && {frontMu: c.frontMu, clearAfterMin: c.clearAfterMin, clearMu: c.clearMu, frontRampMin: 0,
    clearRampMin: 0}, drought: e.drought && {mu: e.drought.mu}, heat};
}

// ------------------------------------------------------------------ pre-roll (stage A)

/**
 * The day's weather class, from one ext draw: 'heat' | 'storm' | 'calm', and (Phase 2a, P-3;
 * desk/README.md C-2) its temperature type from a second draw on the same stream (a = 1):
 * 'HEATWAVE' iff cls is 'heat', else 'MILD' with probability mildShare / (1 - heatShare) (so
 * mildShare is a share of ALL days), else 'HOT'. With mildShare 0 (or absent) no day is MILD.
 * Hidden from the player until announced (never in observe()): createState reads temp once, to
 * set the public state.day (a heatwave day reads 'HOT' there); nothing else reads it.
 */
export function prerollRegime(seed, scn) {
  if (scn.dayplan) return dayplan.prerollRegime(seed, scn); // 2c (Q-65): the plan's own draw
  const u = uniform(seed, STREAM.EXT_REGIME, 0);
  const w = scn.weather;
  const cls = u < w.heatShare ? 'heat' : u < w.heatShare + w.stormShare ? 'storm' : 'calm';
  const mild = uniform(seed, STREAM.EXT_REGIME, 1) < (w.mildShare || 0) / (1 - w.heatShare);
  return {cls, temp: cls === 'heat' ? 'HEATWAVE' : mild ? 'MILD' : 'HOT'};
}

// The 1-min mean-reverting series, quantised: revertSeries with b = 0 (the stage-A draws and arithmetic).
const ouSeries = (seed, stream, cfg, changes, fronts, lag) => revertSeries(seed, stream, 0, LEN, STEP, cfg.startFrac, cfg.mu,
  cfg.revertPerMin, cfg.sigmaPerMin, cfg.min, cfg.max, changes, fronts, lag).map(x => quantise(x * PM, 1));

/**
 * Pre-roll the ext series (F-3), quantised, at SERIES_STEP_S spacing (SERIES_LEN samples
 * from 04:00 to 04:00): demand noise (integer MW), wind fraction and utility-solar
 * clearness (integer per-mille). Event-driven shifts of the wind and cloud means (storm,
 * drought, cloud front, heat) come from the pre-rolled `events` (ext too), so the series
 * never depend on play. A front over the suburbs sets the precinct's sky (Q-79), not its mean.
 */
export function prerollSeries(seed, scn, regime, events) {
  const windChanges = [], cloudChanges = [];
  for (const e of events) {
    if (e.args.windMu !== undefined) windChanges.push({atS: e.atS, mu: e.args.windMu, atLeast: false});
    if (e.args.clearMu !== undefined && !e.args.suburbs) cloudChanges.push({atS: e.atS, mu: e.args.clearMu, atLeast: false});
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
    clearPm: ouSeries(seed, STREAM.EXT_CLOUD, scn.cloud, cloudChanges, frontsOf(scn, events),
      (scn.rooftop.precinctLagMin || 0) * S_PER_MIN),
  };
}

// The step-and-length-generic mean-reverting series (Phase 2a): `len` samples at `stepS` spacing
// from `start`, reverting to `mu` (moved by `changes`) by `revert` of the gap per step, with
// `sigma` of noise per step from normal(seed, stream, sample, b), kept inside [lo, hi]. Raw values,
// not quantised. `fronts` (frontsOf) `lag` s behind: Q-79's fold (sim/README.md §11 weather.js).
function revertSeries(seed, stream, b, len, stepS, start, mu, revert, sigma, lo, hi, changes, fronts = NO_CHANGES, lag = 0) {
  const out = new Array(len);
  let x = start, m = mu, next = 0, x0 = 0;
  out[0] = x;
  for (let k = 1; k < len; k++) {
    const s = k * stepS, t = s - lag;
    while (next < changes.length && changes[next].atS <= s) {
      const c = changes[next++];
      m = c.atLeast ? Math.max(m, c.mu) : c.mu;
    }
    const f = fronts.find(f => t >= f.a && t - stepS < f.c + f.outS);
    if (f) {
      if (t - stepS < f.a) x0 = x; // the sky the front finds
      x = t < f.c ? x0 + (f.mu - x0) * Math.min(1, (t - f.a) / f.inS) : f.mu + (f.cMu - f.mu) * Math.min(1, (t - f.c) / f.outS);
    } else {
      x += (m - x) * revert + sigma * normal(seed, stream, k, b);
      x = Math.min(hi, Math.max(lo, x));
    }
    out[k] = x;
  }
  return out;
}

const NO_CHANGES = Object.freeze([]);

// Q-79: the cloudOnset records with suburbs: true, as revertSeries folds them.
function frontsOf(scn, events) {
  const fr = events.filter(e => e.type === 'cloudOnset' && e.args.suburbs);
  if (!fr.length) return NO_CHANGES;
  const c = climate(scn).cloud, inS = Math.max(1, c.frontRampMin * S_PER_MIN), outS = Math.max(1, c.clearRampMin * S_PER_MIN);
  return fr.map(({id, atS, args: {clearS, clearMu}}) => {
    if (!(Number.isFinite(clearS) && Number.isFinite(clearMu))) throw new Error('frontsOf: ' + id + ' needs args.clearS and clearMu');
    return {a: atS, c: clearS, mu: clearMu, cMu: c.clearMu, inS, outS};
  });
}

/**
 * Pre-roll the rooftop skies (P-2; desk/README.md C-5): ext.rooftop = {stepS, clearPm}, one
 * clearness series per suburb (scn.city.suburbs order) as integer per-mille at the scenario's
 * rooftop.cloud.stepS spacing (289 samples from 04:00 to 04:00 at 300 s), or null when the
 * scenario has no rooftop (capacityMW 0). Each suburb's series is ONE shared regional sky
 * (EXT_ROOFTOP with b = the number of suburbs: slow, reverting to cloud.mu inside [min, max])
 * PLUS a small local term of its own (b = the suburb's index; zero mean), stored already
 * combined and kept inside [min, max]. A heatwave's clear skies (the heatOnset event's
 * clearMuAtLeast) raise the regional mean as they do over the solar precinct. A front over the
 * suburbs (Q-79) sets each suburb's regional sky, frontLagMin behind its onset; the legacy front
 * stays over the precinct. Like every ext series it never depends on play.
 */
export function prerollRooftop(seed, scn, events) {
  const roof = scn.rooftop;
  if (!roof || !(roof.capacityMW > 0)) return null;
  const c = roof.cloud, subs = scn.city.suburbs, nSub = subs.length, len = Math.floor(V.DAY_S / c.stepS) + 1;
  const changes = [], fr = frontsOf(scn, events);
  for (const e of events) {
    if (e.args.clearMuAtLeast !== undefined) changes.push({atS: e.atS, mu: e.args.clearMuAtLeast, atLeast: true});
  }
  const regional = (fronts, lag) => revertSeries(seed, STREAM.EXT_ROOFTOP, nSub, len, c.stepS, c.startFrac, c.mu,
    c.regional.revertPerStep, c.regional.sigmaPerStep, c.min, c.max, changes, fronts, lag);
  const sky = regional(), span = c.max - c.min, clearPm = [];
  for (let j = 0; j < nSub; j++) {
    const local = revertSeries(seed, STREAM.EXT_ROOFTOP, j, len, c.stepS, 0, 0,
      c.local.revertPerStep, c.local.sigmaPerStep, -span, span, NO_CHANGES);
    const reg = fr.length ? regional(fr, subs[j].frontLagMin * S_PER_MIN) : sky;
    clearPm.push(local.map((x, k) => quantise(Math.min(c.max, Math.max(c.min, reg[k] + x)) * PM, 1)));
  }
  return {stepS: c.stepS, clearPm};
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

// seriesAt for a series at any spacing (the rooftop skies: ext.rooftop.stepS).
function seriesAtStep(arr, s, stepS) {
  const last = arr.length - 1;
  const k = Math.min(last, Math.floor(s / stepS));
  const k1 = Math.min(last, k + 1);
  return arr[k] + (arr[k1] - arr[k]) * (s - k * stepS) / stepS;
}

/**
 * Set state.env for the current grid second (called by step() at every second boundary,
 * after events.applyDue, so a smelter trip shows in demand in the same second).
 *
 * Phase 2a (desk/README.md §19.2, §21.1):
 *   P-3  underlyingMW = underlyingBaseMW(scn, state.day, h) x heat uplift + noise + wobble
 *        (MILD and the weekend from the public state.day; the heat from ext.heat);
 *   P-2  roofSubMW[j] = capacityMW x share[j] x clearFactor x shape(h) x (1 - cloudBite x
 *        (1 - k_j)) x (1 - (1 - heatFactor) x r(s)), with k_j = roofClearFrac[j] read from
 *        ext.rooftop and r(s) = heatRampAt(ext.heat, s); rooftopMW is their sum, as if every
 *        inverter were connected (fleet.refreshRoof keeps what is off with dark districts);
 *   P-1  demandMW = underlyingMW + flexMW - rooftopMW - (SMELTER_MW - smelter.loadMW), every
 *        grid second (2b: flex, sim/README.md §5 env). THE operational total every consumer reads.
 * With no rooftop (ext.rooftop null: capacityMW 0) rooftopMW is 0, roofSubMW zeros and
 * roofClearFrac ones, and on a HOT weekday every value is bit-identical to the classic day's.
 * Reads: tick, seed, scn, ext, day, smelter.loadMW, levers.blocks. Writes: env.* only (the
 * per-suburb arrays in place: no allocation).
 */
export function sampleSecond(state) {
  const s = Math.floor(state.tick / TPS);
  const scn = state.scn, ext = state.ext, env = state.env, day = state.day;
  const h = hourOfDay(scn, s);
  const heatMult = heatMultAt(ext.heat, s);
  env.s = s;
  env.h = h;
  env.heatActive = ext.heat !== null && s >= ext.heat.onsetS && s < ext.heat.endS;
  env.heatMult = heatMult;
  env.underlyingMW = underlyingBaseMW(scn, day, h) * heatMult + seriesAt(ext.series.demandNoiseMW, s) + fineNoiseMW(state.seed, s);
  // Rooftop PV (P-2), suburb by suburb, as if every inverter were connected.
  const roof = scn.rooftop, sky = ext.rooftop, sub = env.roofSubMW, clr = env.roofClearFrac;
  let rooftopMW = 0;
  if (sky === null) {
    for (let j = 0; j < sub.length; j++) { sub[j] = 0; clr[j] = 1; }
  } else {
    const clearSky = rooftopClearSkyMW(scn, h) * (1 - (1 - roof.heatFactor) * heatRampAt(ext.heat, s));
    for (let j = 0; j < sub.length; j++) {
      const k = seriesAtStep(sky.clearPm[j], s, sky.stepS) / PM;
      clr[j] = k;
      sub[j] = clearSky * roof.share[j] * (1 - roof.cloudBite * (1 - k));
      rooftopMW += sub[j];
    }
  }
  env.rooftopMW = rooftopMW;
  // 2b: flex as if lit, per suburb and the relief (= flexAt), in one pass
  const B = state.levers.blocks, fs = env.flexSubMW, rs = env.reliefSubMW, subs = scn.city.suburbs;
  let fl = 0;
  for (let j = 0; j < fs.length; j++) fs[j] = rs[j] = 0;
  for (let i = 0; i < B.length; i++) {
    const b = B[i], v = blockMW(b, s, '');
    let j = 0;
    while (subs[j].id !== b.suburb) j++;
    fl += v; fs[j] += v;
    if (b.lever === 'aircon') rs[j] -= blockMW(b, s, 'core');
  }
  env.flexMW = fl;
  env.demandMW = env.underlyingMW + fl - rooftopMW - (V.SMELTER_MW - state.smelter.loadMW); // the P-1 identity
  env.windFrac = seriesAt(ext.series.windPm, s) / PM;
  env.windAvailMW = V.WIND_MW * env.windFrac;
  env.clearness = seriesAt(ext.series.clearPm, s) / PM;
  env.solarAvailMW = clearSkySolarMW(scn, h) * env.clearness;
  // A MILD day shows its own, display-only temperatures (C-3); the cooling load reads the hot-day table.
  const temps = scn.temperatureC;
  env.tempC = tableLinear(day.temp === 'MILD' && temps.mildTable ? temps.mildTable : temps.table, h) +
    (env.heatActive ? V.HEAT_TEMP_UPLIFT_C : 0);
  env.neighbourPrice = neighbourPrice(scn, h);
  env.exportLimitMW = exportLimitMW(h);
}

// ------------------------------------------------------------------ city flex (2b; sim/README.md §5 levers)

const R = V.FLEX_RAMP_S, NF = V.SOAK_NIGHT_FROM_S, NT = V.SOAK_NIGHT_TO_S, AC = V.AIRCON_S;
const SOAK_K = ['core', 'night'], AC_K = ['precool', 'core', 'snapback'];
const NIGHT_X = (V.SOAK_S - R) / (NT - NF - R), PRE_X = V.PRECOOL_FRAC * (AC - R) / (V.PRECOOL_S - R);
const SNAP_X = 2 * V.SNAPBACK_FRAC * (AC - R) / V.SNAPBACK_S;
const PT = [0, 0, 0, 0, 0]; // scratch: knot times t0..t3, MW

// Part j of a block into PT; its kind, or '' past the last.
function part(lever, atS, m, j) {
  const soak = lever === 'soak', k = (soak ? SOAK_K : AC_K)[j];
  if (!k) return '';
  let a = atS, d = atS + AC, v = 0 - m;
  if (soak) { if (j) { a = NF; d = NT; v = 0 - m * NIGHT_X; } else { d = atS + V.SOAK_S; v = m; } }
  else if (!j) { a = atS - V.PRECOOL_S; d = atS; v = m * PRE_X; }
  else if (j === 2) { a = atS + AC; d = a + V.SNAPBACK_S; v = m * SNAP_X; }
  PT[0] = a; PT[1] = a + R; PT[2] = k === 'snapback' ? a + R : d - R; PT[3] = d; PT[4] = v;
  return k;
}

function partMW(s) {
  if (s <= PT[0] || s >= PT[3]) return 0;
  return PT[4] * (s < PT[1] ? (s - PT[0]) / (PT[1] - PT[0]) : s <= PT[2] ? 1 : (PT[3] - s) / (PT[3] - PT[2]));
}

/** A block's parts as {kind, knots: [[s, mw], ...]}, on the 300-s lattice (U-3). */
export function flexParts(b, effMW) {
  const out = [];
  for (let j = 0, k; (k = part(b.lever, b.atS, effMW, j)); j++) {
    const kn = [[PT[0], 0], [PT[1], PT[4]], [PT[2], PT[4]], [PT[3], 0]];
    if (PT[2] === PT[1]) kn.splice(2, 1);
    out.push({kind: k, knots: kn});
  }
  return out;
}

function blockMW(b, s, kind) {
  let mw = 0;
  if (b.lever === 'soak' ? (s <= b.atS || s >= b.endS) && (s <= NF || s >= NT) : s <= b.atS - V.PRECOOL_S || s >= b.endS + V.SNAPBACK_S) return mw;
  for (let j = 0, k; (k = part(b.lever, b.atS, b.effMW, j)); j++) if (!kind || k === kind) mw += partMW(s);
  return mw;
}

/** Flex MW at s of `blocks` in their order; '' filters nothing. Allocates nothing. */
export function flexAt(blocks, s, suburb = '', kind = '', lever = '') {
  let mw = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if ((!suburb || b.suburb === suburb) && (!lever || b.lever === lever)) mw += blockMW(b, s, kind);
  }
  return mw;
}

// ------------------------------------------------------------------ forecast (stage B: events)

function announced(state, kind) {
  for (let i = state.news.length - 1; i >= 0; i--) if (state.news[i].kind === kind) return state.news[i];
  return null;
}

// A forecast "plan" is a time-sorted list of changes to a mean-reverting series' target
// mean, built from announcements and the scenario's public event climatology only; it
// mirrors how prerollSeries applies the (hidden) events. Record {atS, op, mu, endS, k}:
//   op 'set'     the mean is mu from atS on;
//   op 'atLeast' the mean is max(mean, mu) from atS on (heat: clear skies);
//   op 'blend'   an event known only to fall somewhere in [atS, endS) (the storm's cut-out,
//                the cloud front's clearing): the EXPECTED mean moves linearly from the mean
//                in force to mu across the window.
function sortPlan(plan) {
  plan.forEach((c, k) => { c.k = k; });
  return plan.sort((a, b) => a.atS - b.atS || a.k - b.k); // total order (README §2 rule 9)
}

function muAt(base, plan, t) {
  let mu = base;
  for (let i = 0; i < plan.length; i++) {
    const c = plan[i];
    if (c.atS > t) break;
    if (c.op === 'set') mu = c.mu;
    else if (c.op === 'atLeast') mu = Math.max(mu, c.mu);
    else mu += (c.mu - mu) * Math.min(1, (t - c.atS) / Math.max(1, c.endS - c.atS));
  }
  return mu;
}

// The plans read only the news and `cl` = climate(scn). Wind: an announced storm surges at its arrival,
// cuts out somewhere in its cut-out window and settles when it passes (at the news's toS if any); a drought.
function windPlan(state, cl) {
  const plan = [], x = cl.storm, storm = announced(state, 'storm'), drought = announced(state, 'drought');
  if (storm && x) {
    const at = m => storm.fromS + Math.round(m * S_PER_MIN);
    plan.push({atS: storm.fromS, op: 'set', mu: x.arriveMu, endS: 0});
    plan.push({atS: at(x.cutoutAfterMin[0]), op: 'blend', mu: x.cutoutMu, endS: at(x.cutoutAfterMin[1])});
    plan.push({atS: storm.toS ?? at(x.passAfterMin), op: 'set', mu: x.passMu, endS: 0});
  }
  if (drought && cl.drought) plan.push({atS: drought.fromS, op: 'set', mu: cl.drought.mu, endS: 0});
  return sortPlan(plan);
}

// An announced heatwave clears the skies from its onset.
const heatPlan = (heatNews, cl) => heatNews && cl.heat ? [{atS: heatNews.fromS, op: 'atLeast', mu: cl.heat.clearMu, endS: 0}] : [];

// Utility solar: the heat; a legacy cloud front from its onset, clearing in its window (a dayplan day's front: forecast's fk).
function clearPlan(state, heatNews, cl) {
  const plan = heatPlan(heatNews, cl), cloud = announced(state, 'cloud'), x = cl.cloud;
  if (cloud && x && !state.scn.dayplan) {
    plan.push({atS: cloud.fromS, op: 'set', mu: x.frontMu, endS: 0});
    plan.push({atS: cloud.fromS + x.clearAfterMin[0] * S_PER_MIN, op: 'blend', mu: x.clearMu,
      endS: cloud.fromS + x.clearAfterMin[1] * S_PER_MIN});
  }
  return sortPlan(plan);
}

// One step of the rooftop cloud process as the forecast sees it (or the part f of one), on
// o = {k, vR, vL, dR, dL}: the weighted clearness k moves toward the mean in force, mu, at the
// regional sky's revert rate; the error variances of the regional sky and of a local term (vR,
// vL) grow as in prerollRooftop's own recursion; dR and dL are what is left of a present
// regional or local deviation.
function skyStep(o, cloud, mu, f) {
  const reg = cloud.regional, loc = cloud.local;
  const aR = 1 - reg.revertPerStep * f, aL = 1 - loc.revertPerStep * f;
  o.k += (mu - o.k) * reg.revertPerStep * f;
  o.dR *= aR;
  o.dL *= aL;
  o.vR = o.vR * aR * aR + reg.sigmaPerStep * reg.sigmaPerStep * f;
  o.vL = o.vL * aL * aL + loc.sigmaPerStep * loc.sigmaPerStep * f;
}

// The areas under a 0-to-1 ramp of width R, and under its square, up to x.
const rampArea = (x, R) => x <= 0 ? 0 : x < R ? x * x / (2 * R) : x - R / 2;
const rampSq = (x, R) => x <= 0 ? 0 : x < R ? x * x * x / (3 * R * R) : x - 2 * R / 3;

// The smelter's expected load at second t: out until its announced return (smelter.returnS,
// set by events at the trip: what the potline's owner tells the operator), then back at
// SMELTER_RETURN_MW_MIN (the same arithmetic as events.applyDue). Persistence otherwise.
function smelterLoadAt(sm, pending, t) {
  if (!sm.returning && !(pending && t >= sm.returnS)) return sm.loadMW;
  return Math.min(V.SMELTER_MW, Math.max(sm.loadMW, V.SMELTER_RETURN_MW_MIN / S_PER_MIN * (t - sm.returnS + 1)));
}

/**
 * Forecast for the player and par (S-4, L-1, L-2), from public information only: never state.ext.
 * Its doc (the shape, the method, the band): sim/README.md §11 weather.js, "forecast()".
 */
export function forecast(state, horizonS, stepS) {
  const scn = state.scn, env = state.env, s0 = env.s, day = state.day;
  const n = Math.max(0, Math.floor(horizonS / stepS));
  const heatNews = announced(state, 'heat'), cl = climate(scn);
  const heat = heatNews ? {onsetS: heatNews.fromS, endS: heatNews.toS} : null;
  const wPlan = windPlan(state, cl), cPlan = clearPlan(state, heatNews, cl);
  const noise = scn.demand.noise, windMu = scn.wind.mu, clearMu = scn.cloud.mu;
  const sig2 = noise.sigmaMW * noise.sigmaMW, fine2 = V.FINE_NOISE_MW * V.FINE_NOISE_MW;
  const sm = state.smelter, blocks = state.levers.blocks;
  const smPending = !sm.returning && sm.returnS > s0 && sm.loadMW < V.SMELTER_MW - V.MW_EPS;
  const out = {fromS: s0, stepS, n, demandP50: [], demandP10: [], demandP90: [], windMW: [], solarMW: [],
    neighbourPrice: [], exportLimitMW: [], underlyingP50: [], rooftopMW: [], flexMW: []};
  let dev = env.underlyingMW - underlyingBaseMW(scn, day, env.h) * heatMultAt(heat, s0);
  let wind = env.windFrac, clear = env.clearness, varOU = 0, decay = 1, t = s0;
  // Rooftop (P-2, C-5): the suburbs' capacity-weighted clearness now, and the cloud process.
  const roof = scn.rooftop, hasRoof = roof.capacityMW > 0;
  const sky = {k: 1, vR: 0, vL: 0, dR: 1, dL: 1}, part = {k: 1, vR: 0, vL: 0, dR: 1, dL: 1};
  let cloud = null, rPlan = null, shareSum = 0, share2 = 0, locStat2 = 0, tc = s0, k0 = 0, front = null, fsd = 0;
  // Q-79: place a's expected sky at s under the front, r its sky without it; its sd in fsd (sim/README.md §11 weather.js)
  const fk = (a, r, s) => {
    const f = front, y = s - a, a0 = Math.max(a, s0), w = Math.max(1, f.c1 - f.c0), c1 = f.c0 + w;
    const g = Math.min(1, Math.max(0, (s - a0) / Math.max(1, a + f.inS - a0)));
    const p = (rampArea(y - f.c0, f.R) - rampArea(y - c1, f.R)) / w;
    fsd = (f.cMu - f.mu) * Math.sqrt(Math.max(0, (rampSq(y - f.c0, f.R) - rampSq(y - c1, f.R)) / w - p * p));
    return (1 - p) * (r + (f.mu - r) * g) + p * f.cMu;
  };
  if (hasRoof) {
    cloud = roof.cloud;
    rPlan = sortPlan(heatPlan(heatNews, cl)); // the suburbs' regional sky reverts to cloud.mu
    sky.k = 0;
    for (let j = 0; j < roof.share.length; j++) {
      shareSum += roof.share[j];
      share2 += roof.share[j] * roof.share[j];
      sky.k += roof.share[j] * env.roofClearFrac[j];
    }
    k0 = sky.k /= shareSum;
    share2 /= shareSum * shareSum;
    const aL = 1 - cloud.local.revertPerStep;
    locStat2 = cloud.local.sigmaPerStep * cloud.local.sigmaPerStep / (1 - aL * aL); // the local term's stationary variance
    const news = scn.dayplan && announced(state, 'cloud'), x = cl.cloud, subs = scn.city.suburbs, nS = subs.length;
    if (news && x) { // a front over the suburbs; its clear window narrowed by what the places' skies show now
      const f = front = {on: news.fromS, c0: x.clearAfterMin[0] * S_PER_MIN, c1: x.clearAfterMin[1] * S_PER_MIN,
        R: x.clearRampMin * S_PER_MIN, inS: x.frontRampMin * S_PER_MIN, mu: x.frontMu, cMu: x.clearMu};
      const d = 3 * Math.sqrt(locStat2) / (f.cMu - f.mu);
      let lo = f.c0, c = Infinity;
      for (let j = 0; j <= nS; j++) {
        const y = s0 - f.on - (j < nS ? subs[j].frontLagMin : roof.precinctLagMin) * S_PER_MIN;
        const q = ((j < nS ? env.roofClearFrac[j] : env.clearness) - f.mu) / (f.cMu - f.mu);
        if (y < Math.max(f.c0, f.inS) || y >= f.c1 + f.R) continue;
        if (q < d) lo = Math.max(lo, y - f.R * d); else c = Math.min(c, y - f.R * Math.min(1, q));
      }
      f.c0 = Math.min(f.c1, c < Infinity ? Math.max(f.c0, c) : lo);
      if (c < Infinity) f.c1 = f.c0;
    }
  }
  const aP = front && front.on + roof.precinctLagMin * S_PER_MIN; // the solar precinct's onset
  for (let k = 0; k < n; k++) {
    const s = s0 + (k + 1) * stepS;
    while (t < s) {
      const dt = Math.min(S_PER_MIN, s - t);
      t += dt;
      const a = 1 - noise.revertPerMin * dt / S_PER_MIN;
      dev *= a;
      decay *= a;
      varOU = varOU * a * a + sig2 * dt / S_PER_MIN;
      const g = dt / V.FC_DRIFT_TAU_S;
      wind += (muAt(windMu, wPlan, t) - wind) * g;
      clear += (muAt(clearMu, cPlan, t) - clear) * g;
    }
    const h = hourOfDay(scn, s);
    const under = underlyingBaseMW(scn, day, h) * heatMultAt(heat, s) + dev; // before rooftop and the smelter
    let roofMW = 0, roofVar = 0;
    if (hasRoof) {
      // The skies move in whole steps of their own from now (cloud.stepS); a column inside a
      // step takes that part of it in proportion, so the result does not depend on stepS.
      while (tc + cloud.stepS <= s) {
        tc += cloud.stepS;
        skyStep(sky, cloud, muAt(cloud.mu, rPlan, tc), 1);
      }
      part.k = sky.k; part.vR = sky.vR; part.vL = sky.vL; part.dR = sky.dR; part.dL = sky.dL;
      if (s > tc) skyStep(part, cloud, muAt(cloud.mu, rPlan, s), (s - tc) / cloud.stepS);
      const clearSky = rooftopClearSkyMW(scn, h) * shareSum * (1 - (1 - roof.heatFactor) * heatRampAt(heat, s));
      const perK = clearSky * roof.cloudBite, lag = part.dR - part.dL; // perK: MW of rooftop per unit of weighted clearness
      let kw = part.k, sd = 0;
      for (let j = 0; front && j < roof.share.length; j++) { // Q-79: each suburb under the front
        const a = front.on + scn.city.suburbs[j].frontLagMin * S_PER_MIN;
        if (s0 >= a + front.c1 + front.R) continue; // surely clear: the regional forecast from the present
        const r = part.k + (env.roofClearFrac[j] - k0) * part.dR, w = roof.share[j] / shareSum;
        kw += w * (fk(a, r, s) - r);
        sd += w * fsd;
      }
      roofMW = clearSky * (1 - roof.cloudBite * (1 - kw));
      roofVar = perK * perK * (part.vR + share2 * (part.vL + locStat2 * lag * lag) + sd * sd);
    }
    const fl = flexAt(blocks, s);
    const p50 = under + fl - roofMW - (V.SMELTER_MW - smelterLoadAt(sm, smPending, s));
    const band = V.Z_P90 * Math.sqrt(varOU + fine2 * (1 + decay * decay) + roofVar);
    out.demandP50.push(p50);
    out.demandP10.push(p50 - band);
    out.demandP90.push(p50 + band);
    out.windMW.push(V.WIND_MW * wind);
    out.solarMW.push(clearSkySolarMW(scn, h) * (front && s0 < aP + front.c1 + front.R ? fk(aP, clear, s) : clear));
    out.neighbourPrice.push(neighbourPrice(scn, h));
    out.exportLimitMW.push(exportLimitMW(h));
    out.underlyingP50.push(under);
    out.rooftopMW.push(roofMW);
    out.flexMW.push(fl);
  }
  return out;
}

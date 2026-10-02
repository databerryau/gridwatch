// sim/weather.js: the external world's weather and demand (spec F-3, P-6, S-4).
//
// Stage A (implemented, frozen API): the weather regime and the pre-rolled ext series,
// table readers, and sampleSecond(), which sets state.env for each grid second.
// Stage B owner "market + events": forecast() (S-4 drift toward announced regime, L-2 band).
// Phase 2a owner "world" (desk/README.md §21.1): rooftop PV behind the meter (P-1, P-2), the
// day types (P-3: MILD days and weekends, from the public state.day), the per-suburb rooftop
// skies (prerollRooftop, C-5) and the forecast's rooftop and underlying columns. On a scenario
// with no rooftop and no MILD days (the classic day, C-1) every value is bit-identical to before.
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
  const u = uniform(seed, STREAM.EXT_REGIME, 0);
  const w = scn.weather;
  const cls = u < w.heatShare ? 'heat' : u < w.heatShare + w.stormShare ? 'storm' : 'calm';
  const mild = uniform(seed, STREAM.EXT_REGIME, 1) < (w.mildShare || 0) / (1 - w.heatShare);
  return {cls, temp: cls === 'heat' ? 'HEATWAVE' : mild ? 'MILD' : 'HOT'};
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

// The step-and-length-generic copy of ouSeries (Phase 2a; ouSeries itself stays as it is, with
// the classic day's series): `len` samples at `stepS` spacing from `start`, reverting to `mu`
// (moved by `changes`, as in ouSeries) by `revert` of the gap per step, with `sigma` of noise
// per step from normal(seed, stream, sample, b), kept inside [lo, hi]. Raw values, not quantised.
function revertSeries(seed, stream, b, len, stepS, start, mu, revert, sigma, lo, hi, changes) {
  const out = new Array(len);
  let x = start, m = mu, next = 0;
  out[0] = x;
  for (let k = 1; k < len; k++) {
    const s = k * stepS;
    while (next < changes.length && changes[next].atS <= s) {
      const c = changes[next++];
      m = c.atLeast ? Math.max(m, c.mu) : c.mu;
    }
    x += (m - x) * revert + sigma * normal(seed, stream, k, b);
    x = Math.min(hi, Math.max(lo, x));
    out[k] = x;
  }
  return out;
}

const NO_CHANGES = Object.freeze([]);

/**
 * Pre-roll the rooftop skies (P-2; desk/README.md C-5): ext.rooftop = {stepS, clearPm}, one
 * clearness series per suburb (scn.city.suburbs order) as integer per-mille at the scenario's
 * rooftop.cloud.stepS spacing (289 samples from 04:00 to 04:00 at 300 s), or null when the
 * scenario has no rooftop (capacityMW 0). Each suburb's series is ONE shared regional sky
 * (EXT_ROOFTOP with b = the number of suburbs: slow, reverting to cloud.mu inside [min, max])
 * PLUS a small local term of its own (b = the suburb's index; zero mean), stored already
 * combined and kept inside [min, max]. A heatwave's clear skies (the heatOnset event's
 * clearMuAtLeast) raise the regional mean as they do over the solar precinct; the 2a cloud
 * front does not cross the suburbs (it stays over the solar precinct, as its notice says,
 * until D-8 gives fronts a proper lead). Like every ext series it never depends on play.
 */
export function prerollRooftop(seed, scn, events) {
  const roof = scn.rooftop;
  if (!roof || !(roof.capacityMW > 0)) return null;
  const c = roof.cloud, nSub = scn.city.suburbs.length, len = Math.floor(V.DAY_S / c.stepS) + 1;
  const changes = [];
  for (const e of events) {
    if (e.args.clearMuAtLeast !== undefined) changes.push({atS: e.atS, mu: e.args.clearMuAtLeast, atLeast: true});
  }
  const sky = revertSeries(seed, STREAM.EXT_ROOFTOP, nSub, len, c.stepS, c.startFrac, c.mu,
    c.regional.revertPerStep, c.regional.sigmaPerStep, c.min, c.max, changes);
  const span = c.max - c.min, clearPm = [];
  for (let j = 0; j < nSub; j++) {
    const local = revertSeries(seed, STREAM.EXT_ROOFTOP, j, len, c.stepS, 0, 0,
      c.local.revertPerStep, c.local.sigmaPerStep, -span, span, NO_CHANGES);
    clearPm.push(local.map((x, k) => quantise(Math.min(c.max, Math.max(c.min, sky[k] + x)) * PM, 1)));
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
 *   P-1  demandMW = underlyingMW - rooftopMW - (SMELTER_MW - smelter.loadMW), every grid
 *        second (flex = 0 in 2a). demandMW stays THE operational total every consumer reads.
 * With no rooftop (ext.rooftop null: capacityMW 0) rooftopMW is 0, roofSubMW zeros and
 * roofClearFrac ones, and on a HOT weekday every value is bit-identical to the classic day's.
 * Reads: tick, seed, scn, ext, day, smelter.loadMW. Writes: env.* only (env.roofSubMW and
 * env.roofClearFrac in place: no allocation).
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
  env.demandMW = env.underlyingMW - rooftopMW - (V.SMELTER_MW - state.smelter.loadMW); // the P-1 identity
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

// Wind: an announced storm surges at its arrival, cuts out somewhere in the scenario's
// cut-out window (times taken relative to the announced arrival) and settles when it
// passes; an announced drought holds the drought mean from its onset.
function windPlan(state) {
  const ev = state.scn.events || {}, plan = [];
  const storm = announced(state, 'storm'), drought = announced(state, 'drought');
  if (storm && ev.storm) {
    const x = ev.storm, at = h => storm.fromS + Math.round((h - x.arriveH) * S_PER_H);
    plan.push({atS: storm.fromS, op: 'set', mu: x.arriveMu, endS: 0});
    plan.push({atS: at(x.cutoutWindowH[0]), op: 'blend', mu: x.cutoutMu, endS: at(x.cutoutWindowH[1])});
    plan.push({atS: at(x.passH), op: 'set', mu: x.passMu, endS: 0});
  }
  if (drought && ev.drought) plan.push({atS: drought.fromS, op: 'set', mu: ev.drought.mu, endS: 0});
  return sortPlan(plan);
}

// Utility-solar clearness: an announced heatwave clears the skies from its onset; an
// announced cloud front darkens them from its onset and clears somewhere in the scenario's
// clear-after window.
function clearPlan(state, heatNews) {
  const ev = state.scn.events || {}, plan = [];
  if (heatNews && ev.heat) plan.push({atS: heatNews.fromS, op: 'atLeast', mu: ev.heat.clearMu, endS: 0});
  const cloud = announced(state, 'cloud');
  if (cloud && ev.cloud) {
    const x = ev.cloud;
    plan.push({atS: cloud.fromS, op: 'set', mu: x.frontMu, endS: 0});
    plan.push({atS: cloud.fromS + x.clearAfterMin[0] * S_PER_MIN, op: 'blend', mu: x.clearMu,
      endS: cloud.fromS + x.clearAfterMin[1] * S_PER_MIN});
  }
  return sortPlan(plan);
}

// Rooftop clearness (C-5): the suburbs' shared regional sky reverts to the scenario's mean; an
// announced heatwave clears it from its onset, as prerollRooftop does with the hidden event. No
// cloud front crosses the suburbs in 2a, so the cloud news is not in this plan.
function roofPlan(state, heatNews) {
  const ev = state.scn.events || {}, plan = [];
  if (heatNews && ev.heat) plan.push({atS: heatNews.fromS, op: 'atLeast', mu: ev.heat.clearMu, endS: 0});
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

// The smelter's expected load at second t: out until its announced return (smelter.returnS,
// set by events at the trip: what the potline's owner tells the operator), then back at
// SMELTER_RETURN_MW_MIN (the same arithmetic as events.applyDue). Persistence otherwise.
function smelterLoadAt(sm, pending, t) {
  if (!sm.returning && !(pending && t >= sm.returnS)) return sm.loadMW;
  return Math.min(V.SMELTER_MW, Math.max(sm.loadMW, V.SMELTER_RETURN_MW_MIN / S_PER_MIN * (t - sm.returnS + 1)));
}

/**
 * Forecast for the player and par (S-4, L-1, L-2). Uses ONLY public information: the
 * scenario's climatology (demand shape and noise process, clear-sky sun, mean wind and
 * clearness, the rooftop curve and its cloud process, the event menu's public timings), the
 * public kind of day (state.day: MILD or HOT, weekend), the present state (state.env, and
 * the smelter's present load and announced return) and announcements already made
 * (state.news). Never reads state.ext.
 *
 * Returns {fromS, stepS, n, demandP50[], demandP10[], demandP90[], windMW[], solarMW[],
 * neighbourPrice[], exportLimitMW[], underlyingP50[], rooftopMW[]}, column k (0-based) at grid
 * second fromS + (k + 1) * stepS. neighbourPrice and exportLimitMW are the public daily shapes
 * (P-6, F-13), exact, for the tie's merit order in the L-0 plan. Phase 2a (desk/README.md §19.3):
 * demandP50 / P10 / P90 are OPERATIONAL demand (P-1); underlyingP50 = demandP50 + rooftopMW +
 * the smelter's expected missing load at that column; rooftopMW is the rooftop forecast as if
 * every inverter were connected, after the heat derate (0 in every column on a scenario with
 * no rooftop). horizonS may run to the end of the sim day (observe's dayAhead).
 *
 * Integrated minute by minute (so the result does not depend on stepS):
 *   underlying P50 = underlyingBaseMW(day, h) x announced heat multiplier + the present
 *     deviation decaying at the scenario's noise revert rate;
 *   rooftop = the P-2 curve at the suburbs' capacity-weighted clearness (the rooftop factor is
 *     affine in k, so one weighted value is exact), drifting from its present value toward the
 *     scenario's mean (an announced heatwave's clear skies from its onset) at the regional
 *     sky's revert rate, x the heat derate inside the ANNOUNCED heat window;
 *   demand P50 = underlying P50 - rooftop - the smelter's expected missing load;
 *   P10 / P90 = P50 -+ Z_P90 x sd(lead), where sd is the forecast error of the scenario's
 *     own demand-noise process (an OU series: var grows as sigma^2 (1 - a^2L) / (1 - a^2)
 *     with a = 1 - revertPerMin) plus the per-second wobble (FINE_NOISE_MW, at the target
 *     and carried from the origin) plus the rooftop's (below). sd is 0 at lead 0 (L-2). This
 *     replaces the stage A band P50 x (1 -+ Z sigma(lead)) with FC_SIGMA_NEAR..FAR, which
 *     is not calibrated to the sim's truth (see the stage B report, CONTRACT NOTES);
 *   wind and clearness drift from the present toward the climatological mean, or toward
 *     the announced regime (storm surge then cut-out risk; drought; cloud front inside its
 *     warned window; heat's clear skies), with time constant FC_DRIFT_TAU_S.
 * The rooftop part of the band is the forecast error of the C-5 cloud process itself, in MW at
 * that hour's sun: the regional sky's variance grown over the lead, plus the suburbs' local
 * terms (independent, so weighted by the sum of squared shares): their own growth, and the
 * part of the present deviation that was local and fades faster than the forecast assumes
 * ((regional decay - local decay)^2 x their stationary variance).
 * Unannounced events (a heatwave before its 10:30 warning, trips, the smelter's trip) are
 * not in it: that is the forecast's honest error.
 */
export function forecast(state, horizonS, stepS) {
  const scn = state.scn, env = state.env, s0 = env.s, day = state.day;
  const n = Math.max(0, Math.floor(horizonS / stepS));
  const heatNews = announced(state, 'heat');
  const heat = heatNews ? {onsetS: heatNews.fromS, endS: heatNews.toS} : null;
  const wPlan = windPlan(state), cPlan = clearPlan(state, heatNews);
  const noise = scn.demand.noise, windMu = scn.wind.mu, clearMu = scn.cloud.mu;
  const sig2 = noise.sigmaMW * noise.sigmaMW, fine2 = V.FINE_NOISE_MW * V.FINE_NOISE_MW;
  const sm = state.smelter;
  const smPending = !sm.returning && sm.returnS > s0 && sm.loadMW < V.SMELTER_MW - V.MW_EPS;
  const out = {fromS: s0, stepS, n, demandP50: [], demandP10: [], demandP90: [], windMW: [], solarMW: [],
    neighbourPrice: [], exportLimitMW: [], underlyingP50: [], rooftopMW: []};
  let dev = env.underlyingMW - underlyingBaseMW(scn, day, env.h) * heatMultAt(heat, s0);
  let wind = env.windFrac, clear = env.clearness, varOU = 0, decay = 1, t = s0;
  // Rooftop (P-2, C-5): the suburbs' capacity-weighted clearness now, and the cloud process.
  const roof = scn.rooftop, hasRoof = roof.capacityMW > 0;
  const sky = {k: 1, vR: 0, vL: 0, dR: 1, dL: 1}, part = {k: 1, vR: 0, vL: 0, dR: 1, dL: 1};
  let cloud = null, rPlan = null, shareSum = 0, share2 = 0, locStat2 = 0, tc = s0;
  if (hasRoof) {
    cloud = roof.cloud;
    rPlan = roofPlan(state, heatNews);
    sky.k = 0;
    for (let j = 0; j < roof.share.length; j++) {
      shareSum += roof.share[j];
      share2 += roof.share[j] * roof.share[j];
      sky.k += roof.share[j] * env.roofClearFrac[j];
    }
    sky.k /= shareSum;
    share2 /= shareSum * shareSum;
    const aL = 1 - cloud.local.revertPerStep;
    locStat2 = cloud.local.sigmaPerStep * cloud.local.sigmaPerStep / (1 - aL * aL); // the local term's stationary variance
  }
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
      roofMW = clearSky * (1 - roof.cloudBite * (1 - part.k));
      roofVar = perK * perK * (part.vR + share2 * (part.vL + locStat2 * lag * lag));
    }
    const p50 = under - roofMW - (V.SMELTER_MW - smelterLoadAt(sm, smPending, s));
    const band = V.Z_P90 * Math.sqrt(varOU + fine2 * (1 + decay * decay) + roofVar);
    out.demandP50.push(p50);
    out.demandP10.push(p50 - band);
    out.demandP90.push(p50 + band);
    out.windMW.push(V.WIND_MW * wind);
    out.solarMW.push(clearSkySolarMW(scn, h) * clear);
    out.neighbourPrice.push(neighbourPrice(scn, h));
    out.exportLimitMW.push(exportLimitMW(h));
    out.underlyingP50.push(under);
    out.rooftopMW.push(roofMW);
  }
  return out;
}

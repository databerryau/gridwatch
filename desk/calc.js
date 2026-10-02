// desk/calc.js: the numbers the desk derives from the view model (desk/README.md §6). Pure
// functions of observe() values and sim/params.js constants: no DOM, no state, no engine. Each is
// unit-tested in tests/desk.test.js.

import {V} from '../sim/params.js';

const S_PER_H = V.S_PER_H;
const fin = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- K-4 hydro gate wheel

/**
 * Seconds of water left at a constant gate: (storage - HYDRO_STOP_MWH) / gate. Below
 * HYDRO_STOP_MWH the station unloads (sim), so that is "empty" for the desk. Infinity at a
 * closed gate.
 */
export function waterLastsS(storageMWh, gateMW) {
  const usable = fin(storageMWh) - V.HYDRO_STOP_MWH;
  if (usable <= 0) return 0;
  if (!(gateMW > 0)) return Infinity;
  return usable / gateMW * S_PER_H;
}

/** Grid second at which the water runs out at this gate (Infinity if never). */
export function waterLastsUntilS(nowS, storageMWh, gateMW) {
  return fin(nowS) + waterLastsS(storageMWh, gateMW);
}

/**
 * End of the forecast peak (grid s) from obs.forecast: the end of the last 5-min column at or
 * after the highest P50 column that is still within 3% of it. When the highest column is the
 * last one (demand still climbing at the horizon) the peak is taken to run to the horizon.
 * -1 without a forecast.
 */
export const PEAK_WITHIN_FRAC = 0.03;
export function peakEndS(forecast) {
  if (!forecast || !Array.isArray(forecast.demandP50) || !forecast.demandP50.length) return -1;
  const p = forecast.demandP50, n = p.length;
  let iMax = 0;
  for (let i = 1; i < n; i++) if (p[i] > p[iMax]) iMax = i;
  let end = iMax;
  while (end + 1 < n && p[end + 1] >= p[iMax] * (1 - PEAK_WITHIN_FRAC)) end++;
  return fin(forecast.fromS) + (end + 1) * fin(forecast.stepS, V.FC_STEP_S);
}

/**
 * K-4 red arc: the lowest gate MW that empties the dam before the forecast peak ends; gate
 * settings above it are red. null when no gate setting does (peak passed, or no forecast).
 */
export function redArcFromMW(nowS, storageMWh, forecast) {
  const end = peakEndS(forecast);
  const dur = end - fin(nowS);
  if (end < 0 || dur <= 0) return null;
  const usable = fin(storageMWh) - V.HYDRO_STOP_MWH;
  if (usable <= 0) return 0;
  return usable * S_PER_H / dur;
}

// ---------------------------------------------------------------- K-1 levers

/** The machine rows (V.MACHINES order, as obs.units) of one station. */
export function stationUnits(obs, sid) {
  const st = V.STATIONS[sid];
  return obs.units.slice(st.first, st.first + st.count);
}

/**
 * A lever's scale and marks. Travel is 0..nameplate (total of all machines) so the scale never
 * moves when a machine joins; minMW/maxMW are the committed machines' (obs.stations); the spring
 * gate sits at HOT_LOADING_FRAC of the committed available MW (H-2); detents at MIN and 25/50/75%
 * of the committed MW (only those at or above MIN).
 */
export function leverScale(obs, sid) {
  const st = obs.stations.find(x => x.id === sid) || {minMW: 0, maxMW: 0, onCount: 0};
  const totalMW = V.STATIONS[sid].totalMW;
  const minMW = fin(st.minMW), maxMW = fin(st.maxMW);
  const gateMW = Math.floor(V.HOT_LOADING_FRAC * maxMW);
  const detents = [];
  if (maxMW > 0) {
    detents.push(minMW);
    for (const f of [0.25, 0.5, 0.75]) if (f * maxMW > minMW + 1) detents.push(Math.round(f * maxMW));
    detents.push(gateMW, Math.round(maxMW));
  }
  return {totalMW, minMW, maxMW, gateMW, detents, onCount: st.onCount | 0};
}

/** Next detent above (dir > 0) or below (dir < 0) v, or v when there is none. */
export function nextDetent(v, detents, dir) {
  if (dir > 0) { for (const d of detents) if (d > v + 0.5) return d; return v; }
  for (let i = detents.length - 1; i >= 0; i--) if (detents[i] < v - 0.5) return detents[i];
  return v;
}

/** The station's ramp now (MW/min): its machines in mode 'on' or 'loading'. */
export function stationRampMWMin(obs, sid) {
  let r = 0;
  for (const u of stationUnits(obs, sid)) if (u.mode === 'on' || u.mode === 'loading') r += fin(u.rampMWMin);
  return r;
}

/** K-1 ramp cone: how far output can move in 10 grid-minutes, from the output now. */
export const CONE_MIN = 10;
export function rampCone(obs, sid) {
  const st = obs.stations.find(x => x.id === sid);
  const out = fin(st && st.outMW);
  const r = stationRampMWMin(obs, sid) * CONE_MIN;
  if (!st || !(st.onCount > 0)) return {loMW: out, hiMW: out, rampMWMin: 0};
  return {loMW: clamp(out - r, Math.min(fin(st.minMW), out), Math.max(fin(st.maxMW), out)),
    hiMW: clamp(out + r, Math.min(fin(st.minMW), out), Math.max(fin(st.maxMW), out)), rampMWMin: r / CONE_MIN};
}

/** K-2 AGC band of a station (MW either side of the base point): its 'on' machines' bands; 0 in HAND. */
export function agcBandMW(obs, sid) {
  if (obs.mode === 'HAND') return 0;
  const st = V.STATIONS[sid];
  let b = 0;
  for (let k = st.first; k < st.first + st.count; k++) if (obs.units[k] && obs.units[k].mode === 'on') b += V.MACHINES[k].agcBandMW;
  return b;
}

// ---------------------------------------------------------------- K-11 imbalance bar

/**
 * K-11 segments from obs.balance. The scheduled gap (scheduled supply - served demand) plus what
 * automatic response adds (governors, battery PFR + GUARD, load relief) is the swing-equation
 * imbalance (supply - load); inertia supplies exactly the rest (inertiaMW = -imbalance), so the
 * BORROWED stack (inertia, battery, governors, load relief) covers the scheduled gap. SHED is the
 * demand shed (already outside servedMW), shown beside the bar.
 * Phase 2a (desk/README.md §19.2, C-7): the inverters' over-frequency back-off (balance.renPfrMW +
 * roofPfrMW, both >= 0) comes off the sum, as it does in the sim's identity; keys that are
 * missing (older fixtures) count as 0. The view job gives it its own segment.
 */
export function imbalanceSegments(b) {
  const schedMW = fin(b.schedSupplyMW) - fin(b.servedMW);
  const governorsMW = fin(b.governorsMW), batteryMW = fin(b.batteryPfrMW) + fin(b.guardMW), loadReliefMW = fin(b.loadReliefMW);
  const inertiaMW = fin(b.inertiaMW);
  const inverterMW = fin(b.renPfrMW) + fin(b.roofPfrMW);
  return {schedMW, governorsMW, batteryMW, loadReliefMW, inertiaMW, shedMW: fin(b.shedMW),
    imbalanceMW: fin(b.imbalanceMW), sumMW: schedMW + governorsMW + batteryMW + loadReliefMW - inverterMW,
    borrowedMW: governorsMW + batteryMW + loadReliefMW + inertiaMW - inverterMW};
}

// ---------------------------------------------------------------- K-12 synchroscope

/** Wrap degrees into (-180, 180]. */
export function wrapDeg(d) {
  let x = fin(d) % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
}

/**
 * The scope needle between frames: the observed phase advanced at the slip for dtS grid seconds
 * (+ slip = machine fast = clockwise). 0 deg = 12 o'clock, in phase.
 */
export function scopeAngle(phaseDeg, slipHz, dtS) {
  return wrapDeg(fin(phaseDeg) + 360 * fin(slipHz) * fin(dtS));
}

/** K-12 zone of an angle: 'clean' within SYNC_CLEAN_DEG (10), 'rough' to SYNC_ROUGH_DEG (20), else 'blocked'. */
export function scopeZone(angleDeg) {
  const a = Math.abs(wrapDeg(angleDeg));
  const clean = V.SYNC_CLEAN_DEG ?? 10, rough = V.SYNC_ROUGH_DEG ?? 20;
  return a <= clean ? 'clean' : a <= rough ? 'rough' : 'blocked';
}

/** Seconds per needle turn at a slip (Infinity at zero slip). */
export const turnS = slipHz => (Math.abs(fin(slipHz)) > 1e-9 ? 1 / Math.abs(slipHz) : Infinity);

// ---------------------------------------------------------------- K-13 restore

/**
 * K-13 cold-load MW of a dark district: demand x share, x COLD_LOAD_FACTOR once dark for more
 * than COLD_LOAD_AFTER_S (the same rule as fleet.districtColdLoadMW, which obs.coldLoadMW
 * carries). coldInS: grid seconds until the factor applies (0 once it does).
 */
export function coldLoad(d, nowS, demandMW) {
  const darkFor = d.dark ? fin(nowS) - fin(d.darkSinceS) : 0;
  const cold = d.dark && darkFor > V.COLD_LOAD_AFTER_S;
  const factor = cold ? V.COLD_LOAD_FACTOR : 1;
  return {mw: fin(demandMW) * fin(d.share) * factor, factor, coldInS: d.dark && !cold ? Math.max(0, V.COLD_LOAD_AFTER_S - darkFor) : 0};
}

// ---------------------------------------------------------------- rotary geometry

/** Angle of a pointer about a centre, degrees clockwise from 12 o'clock, in (-180, 180]. */
export function pointerAngle(cx, cy, x, y) {
  const a = Math.atan2(x - cx, cy - y) * 180 / Math.PI;
  return wrapDeg(a);
}

/** Value on a knob whose SWEEP-degree travel is centred on 12 o'clock. */
export const KNOB_SWEEP = 270;
export function knobValue(angleDeg, min, max, sweep = KNOB_SWEEP) {
  const f = clamp((wrapDeg(angleDeg) + sweep / 2) / sweep, 0, 1);
  return min + f * (max - min);
}
export function knobAngle(v, min, max, sweep = KNOB_SWEEP) {
  const f = max > min ? clamp((fin(v) - min) / (max - min), 0, 1) : 0.5;
  return -sweep / 2 + f * sweep;
}

/** K-5 GUARD ring: pointer angle -> MW snapped to the 50-MW detents in 0..500. */
export const GUARD_MAX_MW = 500;
export function guardFromAngle(angleDeg) {
  const step = V.GUARD_STEP_MW;
  return clamp(Math.round(knobValue(angleDeg, 0, GUARD_MAX_MW) / step) * step, 0, GUARD_MAX_MW);
}

/** K-6 tie knob detents; a drag snaps to one within TIE_SNAP_MW. */
export const TIE_DETENTS = Object.freeze([-800, -500, -250, 0, 250, 500, 800]);
export const TIE_SNAP_MW = 20;
export function tieSnap(mwv) {
  const v = clamp(Math.round(fin(mwv)), -V.TIE_MAX_MW, V.TIE_MAX_MW);
  for (const d of TIE_DETENTS) if (Math.abs(v - d) <= TIE_SNAP_MW) return d;
  return v;
}

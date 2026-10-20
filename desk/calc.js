// desk/calc.js: the numbers the desk derives from the view model (desk/README.md §6). Pure
// functions of observe() values and sim/params.js constants: no DOM, no state, no engine. Each is
// unit-tested in tests/desk.test.js or tests/balance.test.js.

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
 * roofPfrMW, both >= 0: wind, utility solar and rooftop solar lowering their output) is its own
 * segment, inverterMW = -(renPfrMW + roofPfrMW), so it is <= 0 and stacks left of zero; it is in
 * the sum and in BORROWED as it is in the sim's identity. Keys that are missing (older fixtures)
 * count as 0. shedMW is the relay MW (net load: <= 0 when a district that was feeding back is
 * dark); the dial's SHED mark reads obs.demand.unservedMW instead (the customers' load).
 * With `bat` (obs.battery, §29) the battery is its change from schedule, as the respond card
 * counts it: a charge suspended for a trip (H-10) moves from the gap to the battery.
 */
export function imbalanceSegments(b, bat) {
  const susMW = bat ? fin(bat.outMW) - fin(b.batteryPfrMW) - fin(b.guardMW) - fin(bat.schedMW) : 0;
  const schedMW = fin(b.schedSupplyMW) - fin(b.servedMW) - susMW;
  const governorsMW = fin(b.governorsMW), batteryMW = fin(b.batteryPfrMW) + fin(b.guardMW) + susMW, loadReliefMW = fin(b.loadReliefMW);
  const inertiaMW = fin(b.inertiaMW);
  const inverterMW = 0 - (fin(b.renPfrMW) + fin(b.roofPfrMW));
  return {schedMW, governorsMW, batteryMW, loadReliefMW, inertiaMW, inverterMW, shedMW: fin(b.shedMW),
    imbalanceMW: fin(b.imbalanceMW), sumMW: schedMW + governorsMW + batteryMW + loadReliefMW + inverterMW,
    borrowedMW: governorsMW + batteryMW + loadReliefMW + inertiaMW + inverterMW};
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
 * K-13 cold load of a district row of obs.districts. mw is the sim's own number
 * (obs.districts[].coldLoadMW = fleet.districtColdLoadMW: a dark district's underlying pickup,
 * its rooftop still off, x COLD_LOAD_FACTOR once it has been dark for COLD_LOAD_AFTER_S; a lit
 * one's net load now, which is negative while it feeds back): the desk keeps no second copy of
 * that rule (Phase 2a). factor and coldInS only say when the factor applies, for the countdown
 * on the feeder row: coldInS is the grid seconds until it does (0 once it does, or when lit).
 */
export function coldLoad(d, nowS) {
  const darkFor = d.dark ? fin(nowS) - fin(d.darkSinceS) : 0;
  const cold = d.dark && darkFor > V.COLD_LOAD_AFTER_S;
  return {mw: fin(d.coldLoadMW), factor: cold ? V.COLD_LOAD_FACTOR : 1, coldInS: d.dark && !cold ? Math.max(0, V.COLD_LOAD_AFTER_S - darkFor) : 0};
}

/**
 * K-7: the district DIRECT SHED (and automatic directed shedding) will take next, as
 * sim/grid.js shedNextRotation picks it (desk/README.md §25 M-2): among the lit rotation
 * districts (rot >= 0) whose net load is above zero, the one restored longest ago (never shed
 * first), ties by rotation index; when none of them has load to give, the same choice among all
 * the lit rotation districts. null when no lit rotation district is left.
 * @param {Array} districts obs.districts
 */
export function nextShed(districts) {
  let best = null, any = null;
  const before = (x, y) => !y || fin(x.restoredAtS, -1) < fin(y.restoredAtS, -1) || (fin(x.restoredAtS, -1) === fin(y.restoredAtS, -1) && x.rot < y.rot);
  for (const x of districts || []) {
    if (!(x.rot >= 0) || x.dark) continue;
    if (before(x, any)) any = x;
    if (x.coldLoadMW > 0 && before(x, best)) best = x;
  }
  return best || any;
}

// ---------------------------------------------------------------- W7 Q2: TRIP SHEDS

/**
 * TRIP SHEDS, the desk's fifth N-1 word (the sim keeps its four: SECURE, TIGHT, SHORT, SHEDDING).
 * True when the sim's level is TIGHT and its TRIP PREVIEW of the biggest risk (sec.previewNadirHz,
 * the lower of the unit's and the tie's) falls below the first UFLS stage: the spare is there, but
 * too slow to stop the relays. SHORT and SHEDDING keep their own words. The gauge, the respond card
 * and the N-1 tile (app/alarms.js) all read it here.
 * @param {{level:string, lKind:string, previewNadirHz:number}} sec obs.sec or state.sec
 */
export function tripSheds(sec) {
  return !!sec && sec.level === 'TIGHT' && sec.lKind !== 'none' && fin(sec.previewNadirHz, V.F0_HZ) < V.UFLS_FIRST_HZ;
}

/**
 * The least real time between two changes of the desk's word between TIGHT and TRIP SHEDS (W7 Q2
 * review). At the 49.0 Hz edge the sim's cached preview is re-run every few grid seconds and lands
 * either side, by up to about 0.13 Hz (2026-10-14: 49.05-49.13 Hz straight after 48.98), so a word
 * read off it flips within a few frames at 150-540x; an Hz band does not hold it. So the hold is
 * time, whatever the preview says: TRIP SHEDS stays until the preview has not said it for this long,
 * and a TIGHT after it stays this long before TRIP SHEDS may come back. Real ms, because flicker is
 * seen in real time: 1.5 s is 3.75 grid-min at 150x (the peak) and 13.5 at 540x (before 06:00).
 */
export const SHEDS_MIN_MS = 1500;

/**
 * The N-1 word the desk shows: the sim's level, or TRIP SHEDS (desk/calc.js tripSheds) with a
 * minimum time on and off. While the sim says TIGHT: TRIP SHEDS shows when the preview says it
 * (at once, unless TRIP SHEDS left less than SHEDS_MIN_MS real ms ago: then when that TIGHT has
 * shown SHEDS_MIN_MS, if the preview still says it), and stays until the preview has not said it
 * for SHEDS_MIN_MS real ms. SECURE, SHORT and SHEDDING are the sim's verdicts: they show at once
 * and end a hold, as a day started again (obs.tick going back) does. mem ({}) keeps the hold; the
 * gauge and the live region (app/shell.js liveFrame) each keep one.
 * @param {object} mem
 * @param {{tick:number, sec:object}} obs
 * @param {number} nowMs the frame's real ms
 * @returns {string} 'SECURE' | 'TIGHT' | 'TRIP SHEDS' | 'SHORT' | 'SHEDDING'
 */
export function n1Word(mem, obs, nowMs) {
  const sec = obs.sec, tick = fin(obs.tick);
  if (tick < fin(mem.tick, -1)) mem.shown = '';
  mem.tick = tick;
  if (sec.level !== 'TIGHT' || sec.lKind === 'none') return (mem.shown = sec.level);
  const raw = tripSheds(sec);
  if (raw) mem.lastMs = nowMs;
  const want = raw || (mem.shown === 'TRIP SHEDS' && nowMs - fin(mem.lastMs, -Infinity) < SHEDS_MIN_MS) ? 'TRIP SHEDS' : 'TIGHT';
  // a TIGHT that TRIP SHEDS left keeps SHEDS_MIN_MS before the word may come back
  const dwell = mem.shown === 'TIGHT' && mem.afterSheds && nowMs - mem.atMs < SHEDS_MIN_MS;
  if (want !== mem.shown && !(want === 'TRIP SHEDS' && dwell)) {
    mem.afterSheds = mem.shown === 'TRIP SHEDS';
    mem.shown = want;
    mem.atMs = nowMs;
  }
  return mem.shown;
}

/**
 * The districts the relays would shed if frequency fell to nadirHz: the lit districts of every
 * UFLS stage whose threshold (V.UFLS_FIRST_HZ, then V.UFLS_STEP_HZ apart) is above it. A stage
 * that has operated is spent until all its districts are back (sim/fleet.js rearmUfls), so a
 * stage with a district dark for UFLS counts none. An estimate: the preview's nadir is the
 * fall with the relays acting, and a relay needs V.UFLS_DELAY_S below its threshold to trip.
 * @param {Array} districts obs.districts
 * @param {number} nadirHz
 * @returns {number}
 */
export function shedDistricts(districts, nadirHz) {
  let n = 0;
  for (let k = 0; k < V.UFLS_STAGES; k++) {
    if (!(fin(nadirHz, V.F0_HZ) < V.UFLS_FIRST_HZ - k * V.UFLS_STEP_HZ)) break;
    const stage = (districts || []).filter(d => d.uflsStage === k + 1);
    if (stage.some(d => d.dark && d.shedBy === 'ufls')) continue;
    n += stage.filter(d => !d.dark).length;
  }
  return n;
}

/**
 * What TRIP SHEDS would cost, from the sim's preview (obs.sec.previewNadirHz) and the districts:
 * 'would fall to 48.99 Hz: the relays would shed 2 districts'. Below 49.0 Hz the figure is rounded
 * down (as the gauge's preview figure), so it never reads as the threshold itself. A word still
 * held (n1Word) over a preview back at or above 49.0 Hz says so: 'above the relays now'.
 * @param {{sec:object, districts:Array}} obs
 */
export function shedsLine(obs) {
  const hz = fin(obs.sec.previewNadirHz, V.F0_HZ), at = x => 'would fall to ' + x.toFixed(2) + ' Hz: ';
  if (!(hz < V.UFLS_FIRST_HZ)) return at(hz) + 'above the relays now';
  const n = shedDistricts(obs.districts, hz);
  return at(Math.floor(hz * 100) / 100) + (n ? 'the relays would shed ' + n + ' district' + (n > 1 ? 's' : '') : 'below the relays, with none left to shed');
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

/** K-6 tie knob detents; a drag snaps to one within TIE_SNAP_MW, never past the import limit. */
export const TIE_DETENTS = Object.freeze([-800, -500, -250, 0, 250, 500, 800]);
export const TIE_SNAP_MW = 20;
export function tieSnap(mwv, limitMW = V.TIE_MAX_MW) {
  const v = clamp(Math.round(fin(mwv)), -V.TIE_MAX_MW, limitMW);
  for (const d of TIE_DETENTS) if (d <= limitMW && Math.abs(v - d) <= TIE_SNAP_MW) return d;
  return v;
}

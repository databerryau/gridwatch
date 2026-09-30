// app/alarms.js: the K-8 annunciator model (Phase 1a basics) and the K-21 priority of each tile.
// Pure and DOM-free; desk/annunciator.js draws `alarmsView()` (vm.alarms).
//
// Twelve tiles (4 x 3; MSL arrives in Phase 2 with P-4). Each has one priority and a target
// control id (a click or Enter focuses it). Analogue tiles have separate set and clear
// thresholds (K-8), event tiles are set by what happened (a contingency, a UFLS stage, news).
//
// States (ISA-18.1 basics): normal -> alarm (new: flashes fast, sounds by priority) -> ACK ->
// ackd (steady) -> condition clears -> normal. An alarm that clears before ACK is 'cleared'
// (flashes slowly) until ACK returns it to normal. SILENCE stops the sound only.
//
// Sound (K-21): P1 a two-tone horn, repeated every HORN_REPEAT_S real s while sounding and
// unacknowledged; P2 one chime; P3 tiles are silent here (their tray card makes the soft
// tick). One sound per update at most (the highest priority). No tile sounds again within
// RESOUND_HOLDOFF_S real s. During the watch sounds are held; any still unacknowledged sound
// once when the watch ends. `a.audible` counts the alarm sounds started (not horn repeats):
// K-8's accept, "the competent proxy triggers <= 8 audible alarms per daily".
//
// Inputs: updateAlarms(a, x, ctx) reads a small snapshot `x` built by alarmInput(obs) in the
// game, or alarmInputFromState(state) in headless runs (tests; they must agree). Frequency
// extremes between two updates come from sampleTick() (called after every tick): a frame at
// 120x spans ~100 ticks, and a dip below 49.85 Hz inside it must still set UNDER FREQ.

import {V} from '../sim/params.js';
import {hourOfDay} from '../sim/weather.js';

const TPS = V.TICKS_PER_S;

// K-8 thresholds (the operating standard's normal band, V.NORMAL_LO_HZ / HI; clear 0.05 Hz inside).
export const UNDER_SET_HZ = V.NORMAL_LO_HZ, UNDER_CLEAR_HZ = V.NORMAL_LO_HZ + 0.05;
export const OVER_SET_HZ = V.NORMAL_HI_HZ, OVER_CLEAR_HZ = V.NORMAL_HI_HZ - 0.05;
/**
 * N-1 INSECURE sets after N1_SET_S grid-s not SECURE and clears only after N1_CLEAR_S grid-s
 * SECURE: the operator has 30 minutes to return the system to a secure state (NER 4.2.6), and
 * the tile stays in until it has held for such a window. Measured on the competent proxy
 * (seeds 1, 3, 5, 8): a 10-s clear chimed 9-14 times a day as TIGHT came and went; this
 * clear gives 4-6 audible alarms a day (K-8 accept: <= 8).
 */
export const N1_SET_S = 10, N1_CLEAR_S = 1800;
/** HIGH RoCoF: |df/dt| over the FOS 500-ms window above this (Hz/s) sets; below CLEAR clears. */
export const ROCOF_SET_HZ_S = 1, ROCOF_CLEAR_HZ_S = 0.5;
/** AGC LIMIT: AGC at its limit for more than this many REAL seconds (K-2). */
export const AGC_LIMIT_REAL_S = 5;
/** STORAGE LOW: hydro below 30% of its allocation or the battery below 10%; clears at 35% / 20%. */
export const HYDRO_LOW = 0.30, HYDRO_OK = 0.35, BATT_LOW = 0.10, BATT_OK = 0.20;
/** PEAK: inside 17:00-20:00 (hours of day) and not SECURE (with the N-1 hold). */
export const PEAK_H = Object.freeze([17, 20]);
/** WEATHER stays set this long after the news if it names no end (grid-s). */
export const WEATHER_HOLD_S = 3600;
/** Real seconds: no tile sounds twice within this (K-8). */
export const RESOUND_HOLDOFF_S = 30;
/** Real seconds between horn repeats while a P1 alarm sounds unacknowledged (K-21). */
export const HORN_REPEAT_S = 4;

/**
 * The tiles, in annunciator order (4 columns x 3 rows). prio: K-21. target: the control id a
 * click focuses (desk/README.md §5); a trip tile retargets to the tripped unit's lever.
 */
export const TILES = Object.freeze([
  {id: 'underFreq', label: 'UNDER FREQ', prio: 'P1', target: 'dial-freq'},
  {id: 'overFreq', label: 'OVER FREQ', prio: 'P1', target: 'dial-freq'},
  {id: 'n1', label: 'N-1 INSECURE', prio: 'P2', target: 'gauge-n1'},
  {id: 'rocof', label: 'HIGH RoCoF', prio: 'P2', target: 'dial-freq'},
  {id: 'unitTrip', label: 'UNIT TRIP', prio: 'P1', target: 'stack'},
  {id: 'linkTrip', label: 'LINK TRIP', prio: 'P1', target: 'knob-tie'},
  {id: 'ufls', label: 'UFLS OPERATED', prio: 'P1', target: 'bay-restore'},
  {id: 'agcLimit', label: 'AGC LIMIT', prio: 'P2', target: 'bar-imbalance'},
  {id: 'storageLow', label: 'STORAGE LOW', prio: 'P2', target: 'wheel-hydro'},
  {id: 'minGen', label: 'MIN GEN', prio: 'P2', target: 'stack'},
  {id: 'weather', label: 'WEATHER', prio: 'P3', target: 'tray'},
  {id: 'peak', label: 'PEAK', prio: 'P1', target: 'gauge-n1'},
].map(t => Object.freeze(t)));

const PRIO_RANK = {P1: 3, P2: 2, P3: 1};
/** Glyphs per state (K-22: status is never colour-only). */
export const GLYPH = Object.freeze({normal: '·', alarm: '!', ackd: '■', cleared: '○'});

/** A new annunciator. */
export function createAlarms() {
  const tiles = {};
  for (const t of TILES) {
    tiles[t.id] = {id: t.id, state: 'normal', cond: false, target: t.target, lastSoundMs: -Infinity, held: false, setAtS: -1};
  }
  return {
    tiles,
    sounding: false, soundPrio: '', lastHornMs: -Infinity,
    audible: 0,                   // alarm sounds started (K-8 accept)
    sounds: [],                   // every sound started, {atS, prio, tiles} (tests, debrief)
    // trackers
    samp: {fMin: Infinity, fMax: -Infinity, rocofMax: 0, n: 0},
    notSecureSinceS: -1, secureSinceS: 0, agcRealS: 0,
    contSeen: 0, uflsSeen: 0, newsSeen: 0,
    eventUntilS: {unitTrip: -1, linkTrip: -1, ufls: -1, weather: -1},
    prevInWatch: false,
    lastS: -1,
  };
}

/** After every tick (cheap, reads state directly): extremes since the last update. */
export function sampleTick(a, state) {
  const sp = a.samp, f = state.phys.fHz, r = Math.abs(state.phys.rocofHzS);
  if (f < sp.fMin) sp.fMin = f;
  if (f > sp.fMax) sp.fMax = f;
  if (r > sp.rocofMax) sp.rocofMax = r;
  sp.n++;
}

/** The alarm snapshot from observe() (the game, once per frame). */
export function alarmInput(obs) {
  const c = obs.contingency;
  const last = obs.news.length ? obs.news[obs.news.length - 1] : null;
  return {
    s: obs.s, h: obs.clock.h, fHz: obs.f.hz, rocof: Math.abs(obs.f.rocofHzS), level: obs.sec.level,
    agcAtLimitS: obs.agc.atLimitS, hydroFrac: obs.hydro.frac, battFrac: obs.battery.socMWh / obs.battery.capMWh,
    inWatch: obs.inWatch,
    contCount: obs.contingencies.length,
    cont: c ? {n: c.n, cause: c.cause, id: c.id, uflsStages: c.uflsStages, watchEndS: Math.floor(c.watchEndTick / TPS)} : null,
    newsCount: obs.news.length, news: last ? {atS: last.atS, fromS: last.fromS, toS: last.toS, kind: last.kind} : null,
  };
}

/** The same snapshot straight from state (headless runs; tests check it equals alarmInput(observe(state))). */
export function alarmInputFromState(state) {
  const s = Math.floor(state.tick / TPS);
  const c = state.contIdx >= 0 ? state.conts[state.contIdx] : null;
  const n = state.news.length, last = n ? state.news[n - 1] : null;
  const h = hourOfDay(state.scn, s);
  return {
    s, h, fHz: state.phys.fHz, rocof: Math.abs(state.phys.rocofHzS), level: state.sec.level,
    agcAtLimitS: state.agc.atLimitS, hydroFrac: state.hydro.storageMWh / V.HYDRO_ALLOCATION_MWH,
    battFrac: state.battery.socMWh / V.BATT_MWH,
    inWatch: c !== null && state.tick < c.watchEndTick,
    contCount: state.conts.length,
    cont: c ? {n: c.n, cause: c.cause, id: c.id, uflsStages: c.uflsStages, watchEndS: Math.floor(c.watchEndTick / TPS)} : null,
    newsCount: n, news: last ? {atS: last.atS, fromS: last.fromS, toS: last.toS, kind: last.kind} : null,
  };
}

// Set/clear with hysteresis: returns the new condition.
const hyst = (was, setNow, clearNow) => (was ? !clearNow : setNow);

/**
 * One annunciator update (once per frame in the game).
 * @param {object} a from createAlarms
 * @param {object} x alarmInput(obs) or alarmInputFromState(state)
 * @param {{nowMs:number, realDtS:number, stationOf?:function(string):string}} ctx
 *   nowMs: a real-time clock (ms) for the re-sound hold-off and horn repeats; realDtS: real
 *   seconds since the last update (AGC LIMIT's 5 real s); stationOf(unitId): station id (targets).
 * @returns {{cues:string[], newAlarm:boolean}} cues: 'horn' | 'chime' to play now; newAlarm:
 *   a P1/P2 tile went into alarm (ends FAST).
 */
export function updateAlarms(a, x, ctx) {
  const sp = a.samp, T = a.tiles, s = x.s;
  const fMin = sp.n ? Math.min(sp.fMin, x.fHz) : x.fHz, fMax = sp.n ? Math.max(sp.fMax, x.fHz) : x.fHz;
  const rocof = Math.max(sp.rocofMax, x.rocof);
  sp.fMin = Infinity; sp.fMax = -Infinity; sp.rocofMax = 0; sp.n = 0;

  // Events since the last update.
  if (x.contCount > a.contSeen) {
    a.contSeen = x.contCount;
    const c = x.cont;
    if (c && c.cause === 'unit') {
      a.eventUntilS.unitTrip = c.watchEndS;
      const st = ctx.stationOf ? ctx.stationOf(c.id) : '';
      T.unitTrip.target = st ? (st === 'hydro' ? 'wheel-hydro' : 'lever-' + st) : 'stack';
    } else if (c && c.cause === 'link') {
      a.eventUntilS.linkTrip = c.watchEndS;
    }
  }
  if (x.cont && x.cont.uflsStages > 0 && (x.cont.n + 1) * 100 + x.cont.uflsStages > a.uflsSeen) {
    a.uflsSeen = (x.cont.n + 1) * 100 + x.cont.uflsStages;
    a.eventUntilS.ufls = Math.max(s, x.cont.watchEndS);
  }
  if (x.newsCount > a.newsSeen) {
    a.newsSeen = x.newsCount;
    const nw = x.news;
    a.eventUntilS.weather = nw.toS !== null && nw.toS !== undefined ? nw.toS : Math.max(nw.fromS, nw.atS) + WEATHER_HOLD_S;
  }

  // N-1 hold timers (grid seconds).
  const secure = x.level === 'SECURE';
  if (secure) { if (a.secureSinceS < 0) a.secureSinceS = s; a.notSecureSinceS = -1; }
  else { if (a.notSecureSinceS < 0) a.notSecureSinceS = s; a.secureSinceS = -1; }
  const insecureLong = !secure && s - a.notSecureSinceS >= N1_SET_S;
  const secureLong = secure && s - a.secureSinceS >= N1_CLEAR_S;
  a.agcRealS = x.agcAtLimitS > 0 ? a.agcRealS + Math.max(0, ctx.realDtS || 0) : 0;

  const cond = {
    underFreq: hyst(T.underFreq.cond, fMin < UNDER_SET_HZ, fMin > UNDER_CLEAR_HZ),
    overFreq: hyst(T.overFreq.cond, fMax > OVER_SET_HZ, fMax < OVER_CLEAR_HZ),
    n1: hyst(T.n1.cond, insecureLong, secureLong),
    rocof: hyst(T.rocof.cond, rocof > ROCOF_SET_HZ_S, rocof < ROCOF_CLEAR_HZ_S),
    unitTrip: s < a.eventUntilS.unitTrip,
    linkTrip: s < a.eventUntilS.linkTrip,
    ufls: s < a.eventUntilS.ufls,
    agcLimit: a.agcRealS > AGC_LIMIT_REAL_S,
    storageLow: hyst(T.storageLow.cond, x.hydroFrac < HYDRO_LOW || x.battFrac < BATT_LOW, x.hydroFrac >= HYDRO_OK && x.battFrac >= BATT_OK),
    minGen: false, // Phase 2 (P-4): no minimum-generation state before rooftop PV
    weather: s < a.eventUntilS.weather,
    peak: x.h >= PEAK_H[0] && x.h < PEAK_H[1] && hyst(T.peak.cond, insecureLong, secureLong),
  };
  T.storageLow.target = x.hydroFrac < HYDRO_LOW || (T.storageLow.cond && x.battFrac >= BATT_OK) ? 'wheel-hydro' : 'dial-battery';

  // Transitions.
  const fresh = [];
  for (const t of TILES) {
    const k = T[t.id], on = cond[t.id];
    if (on && !k.cond) {
      if (k.state !== 'alarm') { k.state = 'alarm'; k.setAtS = s; fresh.push(t); }
    } else if (!on && k.cond) {
      if (k.state === 'alarm') k.state = 'cleared';
      else if (k.state === 'ackd') k.state = 'normal';
    }
    k.cond = on;
  }

  // Sound.
  const cues = [];
  const now = ctx.nowMs;
  let newAlarm = false;
  const candidates = [];
  for (const t of fresh) {
    if (t.prio === 'P3') continue;
    newAlarm = true;
    if (x.inWatch) { T[t.id].held = true; continue; }
    if (now - T[t.id].lastSoundMs < RESOUND_HOLDOFF_S * 1000) continue;
    candidates.push(t);
  }
  if (a.prevInWatch && !x.inWatch) {
    // The watch ended: tiles still unacknowledged sound once.
    for (const t of TILES) {
      const k = T[t.id];
      if (k.held) { k.held = false; if (k.state === 'alarm' || k.state === 'cleared') candidates.push(t); }
    }
  }
  a.prevInWatch = x.inWatch;
  if (candidates.length) {
    let best = candidates[0];
    for (const t of candidates) if (PRIO_RANK[t.prio] > PRIO_RANK[best.prio]) best = t;
    for (const t of candidates) T[t.id].lastSoundMs = now;
    cues.push(best.prio === 'P1' ? 'horn' : 'chime');
    a.audible++;
    a.sounds.push({atS: s, prio: best.prio, tiles: candidates.map(t => t.id)});
    if (best.prio === 'P1' || !a.sounding) { a.sounding = true; a.soundPrio = best.prio; a.lastHornMs = now; }
  } else if (a.sounding && a.soundPrio === 'P1' && !x.inWatch && now - a.lastHornMs >= HORN_REPEAT_S * 1000) {
    const stillP1 = TILES.some(t => t.prio === 'P1' && T[t.id].state === 'alarm');
    if (stillP1) { cues.push('horn'); a.lastHornMs = now; } else { a.sounding = false; a.soundPrio = ''; }
  }
  if (a.sounding && a.soundPrio === 'P2') { a.sounding = false; a.soundPrio = ''; } // a chime sounds once
  a.lastS = s;
  return {cues, newAlarm};
}

/** ACK: flashing alarms turn steady; cleared ones go dark; the sound stops. */
export function ackAll(a) {
  for (const t of TILES) ackTile(a, t.id);
  a.sounding = false; a.soundPrio = '';
}

/** ACK one tile. */
export function ackTile(a, id) {
  const k = a.tiles[id];
  if (!k) return false;
  if (k.state === 'alarm') k.state = k.cond ? 'ackd' : 'normal';
  else if (k.state === 'cleared') k.state = 'normal';
  k.held = false;
  if (!TILES.some(t => a.tiles[t.id].state === 'alarm' && t.prio !== 'P3')) { a.sounding = false; a.soundPrio = ''; }
  return true;
}

/** SILENCE: stops the sound only (tiles keep flashing). */
export function silence(a) {
  a.sounding = false;
  a.soundPrio = '';
}

/**
 * vm.alarms (desk/README.md §5).
 * @returns {{tiles:Array<{id, label, prio, state, flash:'fast'|'slow'|null, glyph, target}>, sounding:boolean, unacked:number}}
 */
export function alarmsView(a) {
  let unacked = 0;
  const tiles = TILES.map(t => {
    const k = a.tiles[t.id];
    if (k.state === 'alarm' || k.state === 'cleared') unacked++;
    return {id: t.id, label: t.label, prio: t.prio, state: k.state,
      flash: k.state === 'alarm' ? 'fast' : k.state === 'cleared' ? 'slow' : null, glyph: GLYPH[k.state], target: k.target};
  });
  return {tiles, sounding: a.sounding, unacked};
}


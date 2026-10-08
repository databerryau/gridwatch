// app/alarms.js: the K-8 annunciator model and the K-21 priority of each tile (Phase 1b:
// desk/README.md §11 B-1, B-2, B-3). Pure and DOM-free; desk/annunciator.js draws
// `alarmsView()` (vm.alarms).
//
// Twelve tiles (4 x 3). Phase 2a (desk/README.md C-9): MIN GEN is real (the dispatch is spilling
// wind and sun now); the MSL levels are tray cards (app/tray.js), not a thirteenth tile. Each has one BASE priority and a
// target control id (a click or Enter focuses it). Analogue tiles have separate set and clear
// thresholds (K-8), event tiles are set by what happened (a contingency, a UFLS stage, news).
//
// Escalation (B-1): UNDER FREQ and OVER FREQ are P2 tiles (`escalates: true`). While the
// frequency is outside the containment band (49.5-50.5 Hz) the tile is escalated: the view
// gives it `prio: 'P1'` and `escalated: true`, and it sounds the horn. An acknowledged tile
// that escalates flashes again (it is worse news than the one acknowledged).
//
// States (ISA-18.1 sequence R, ring-back, visual only; B-2): normal -> alarm (new: flashes
// fast, sounds by priority) -> ACK -> ackd (steady) -> condition clears -> normal (dark). An
// alarm that clears before ACK is 'cleared' (flashes slowly, the ring-back) until ACK returns
// it to normal. SILENCE stops the sound only. The flash rates are the desk's (2.5 / 0.8 Hz).
//
// Sound (K-21, B-3). A SOUNDING is one alarm sound started: the horn (the highest effective
// priority among the tiles that start it is P1) or one chime (P2); P3 tiles are silent here
// (their tray card makes the soft tick). One sounding per update at most. `a.audible` counts
// soundings (K-8's accept: "the competent proxy triggers <= 8 audible alarms per daily").
// RE-SOUNDS are the same alarm heard again and count in `a.repeats`, never in `a.audible`:
//   * the horn every HORN_REPEAT_S real s while a P1 alarm is unacknowledged and not silenced;
//   * one chime P2_REPEAT_S real s after a P2 tile sounded, if it is still unacknowledged
//     (and not silenced, and no horn is going);
//   * the horn starting on a tile that escalates inside its own hold-off (below).
// No tile starts a NEW sounding within RESOUND_HOLDOFF_S real s of its last one (K-8 accept):
// an alarm that sets again inside that window flashes at once and is held; if it is still
// unacknowledged when the window ends it sounds then. During the watch every sound is held
// the same way; tiles still unacknowledged sound once when the watch ends. So with the alarm
// panel open (ctx.hold, Q-46).
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
export const AGC_LIMIT_REAL_S = V.AGC_LIMIT_ALARM_REAL_S;
/** STORAGE LOW: hydro below 30% of its allocation or the battery below 10%; clears at 35% / 20%. */
export const HYDRO_LOW = 0.30, HYDRO_OK = 0.35, BATT_LOW = 0.10, BATT_OK = 0.20;
/** PEAK: inside 17:00-20:00 (hours of day) and not SECURE (with the N-1 hold). */
export const PEAK_H = Object.freeze([17, 20]);
/**
 * MIN GEN (Phase 2a, desk/README.md §21.4): sets when the dispatch has been holding back more than
 * MINGEN_SET_MW of wind and utility solar for MINGEN_SET_S grid-s (spillMW: obs.wind.autoMW +
 * obs.solar.autoMW, exactly 0 outside a floor surplus), and clears only after it has been under
 * MINGEN_CLEAR_MW for MINGEN_CLEAR_S grid-s (the N-1 tile's clear window: a cloud over the belly
 * must not chime the tile again; K-8 allows 8 audible alarms a day).
 */
export const MINGEN_SET_MW = V.SURPLUS_MIN_MW, MINGEN_SET_S = 60, MINGEN_CLEAR_MW = 10, MINGEN_CLEAR_S = 1800;
/** WEATHER stays set this long after the news if it names no end (grid-s). */
export const WEATHER_HOLD_S = 3600;
/** Real seconds: no tile sounds twice within this (K-8). */
export const RESOUND_HOLDOFF_S = 30;
/** Real seconds between horn repeats while a P1 alarm sounds unacknowledged (K-21). */
export const HORN_REPEAT_S = 4;
/** Real seconds after a P2 chime before its single repeat, if still unacknowledged (K-21, B-3). */
export const P2_REPEAT_S = 60;
/**
 * B-1: a tile with `escalates` is escalated while the frequency is outside the containment
 * band (FOS Table A.3); it steps back down ESC_HYST_HZ inside the band so it cannot chatter.
 */
export const ESC_LO_HZ = V.CONTAIN_LO_HZ, ESC_HI_HZ = V.CONTAIN_HI_HZ, ESC_HYST_HZ = 0.05;

/**
 * The tiles, in annunciator order (4 columns x 3 rows). prio: the K-21 BASE priority (one per
 * tile); escalates: B-1 (the view's `prio` is the effective one). target: the control id a
 * click focuses (desk/README.md §5); a trip tile retargets to the tripped unit's lever.
 */
export const TILES = Object.freeze([
  {id: 'underFreq', label: 'UNDER FREQ', prio: 'P2', escalates: true, target: 'dial-freq'},
  {id: 'overFreq', label: 'OVER FREQ', prio: 'P2', escalates: true, target: 'dial-freq'},
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
].map(t => Object.freeze(Object.assign({escalates: false}, t))));

const PRIO_RANK = {P1: 3, P2: 2, P3: 1};
/** Glyphs per state (K-22: status is never colour-only; B-2: ◇ marks the ring-back without its flash). */
export const GLYPH = Object.freeze({normal: '·', alarm: '!', ackd: '■', cleared: '◇'});
// The effective priority (B-1): P1 while escalated, else the tile's base priority.
const prioOf = (a, t) => (t.escalates && a.tiles[t.id].esc ? 'P1' : t.prio);

/** A new annunciator. */
export function createAlarms() {
  const tiles = {};
  for (const t of TILES) {
    // esc: escalated now (B-1); held: its sound waits (the watch, or its own hold-off);
    // repeatAtMs: when its single P2 repeat is due (Infinity: none).
    tiles[t.id] = {id: t.id, state: 'normal', cond: false, esc: false, target: t.target, lastSoundMs: -Infinity, held: false, setAtS: -1,
      repeatAtMs: Infinity};
  }
  return {
    tiles,
    sounding: false, soundPrio: '', lastHornMs: -Infinity,
    audible: 0,                   // soundings started (K-8 accept)
    repeats: 0,                   // re-sounds: horn repeats, the P2 repeat, an escalation inside the hold-off (B-3)
    sounds: [],                   // every sounding, {atS, atMs, prio, tiles} (tests, debrief)
    // trackers
    samp: {fMin: Infinity, fMax: -Infinity, rocofMax: 0, n: 0},
    notSecureSinceS: -1, secureSinceS: 0, agcRealS: 0,
    spillSinceS: -1, drySinceS: -1,   // MIN GEN: since when spillMW has been above the set level / under the clear level
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

/**
 * The alarm snapshot from observe() (the game, once per frame). Escalation (B-1) reads the same
 * frequency as the UNDER / OVER tiles: `fHz` here plus the extremes sampleTick() kept.
 */
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
    // Phase 2a (C-9): MW of wind and utility solar the dispatch is holding back now (MIN GEN)
    spillMW: obs.wind.autoMW + obs.solar.autoMW,
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
    spillMW: state.ren.windAutoMW + state.ren.solarAutoMW,
  };
}

// Set/clear with hysteresis: returns the new condition.
const hyst = (was, setNow, clearNow) => (was ? !clearNow : setNow);

/**
 * One annunciator update (once per frame in the game).
 * @param {object} a from createAlarms
 * @param {object} x alarmInput(obs) or alarmInputFromState(state)
 * @param {{nowMs:number, realDtS:number, stationOf?:function(string):string, hold?:boolean}} ctx
 *   nowMs: a real-time clock (ms) for the re-sound hold-off and horn repeats; realDtS: real
 *   seconds since the last update (AGC LIMIT's 5 real s); stationOf(unitId): station id (targets);
 *   hold: the alarm panel is open (sounds wait, as in the watch).
 * @returns {{cues:string[], newAlarm:boolean}} cues: 'horn' | 'chime' to play now (a sounding
 *   or a re-sound); newAlarm: a P1/P2 tile went into alarm or escalated (ends FAST).
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
  // MIN GEN timers (grid seconds; a snapshot without spillMW, e.g. a CLASSIC fixture, never spills).
  const spill = x.spillMW > 0 ? x.spillMW : 0;
  if (spill > MINGEN_SET_MW) { if (a.spillSinceS < 0) a.spillSinceS = s; } else a.spillSinceS = -1;
  if (spill < MINGEN_CLEAR_MW) { if (a.drySinceS < 0) a.drySinceS = s; } else a.drySinceS = -1;
  const spilling = a.spillSinceS >= 0 && s - a.spillSinceS >= MINGEN_SET_S;
  const dry = a.drySinceS >= 0 && s - a.drySinceS >= MINGEN_CLEAR_S;

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
    minGen: hyst(T.minGen.cond, spilling, dry),
    weather: s < a.eventUntilS.weather,
    peak: x.h >= PEAK_H[0] && x.h < PEAK_H[1] && hyst(T.peak.cond, insecureLong, secureLong),
  };
  T.storageLow.target = x.hydroFrac < HYDRO_LOW || (T.storageLow.cond && x.battFrac >= BATT_OK) ? 'wheel-hydro' : 'dial-battery';

  // B-1: escalated while the tile's condition holds and the frequency is outside containment.
  const esc = {
    underFreq: cond.underFreq && hyst(T.underFreq.esc, fMin < ESC_LO_HZ, fMin > ESC_LO_HZ + ESC_HYST_HZ),
    overFreq: cond.overFreq && hyst(T.overFreq.esc, fMax > ESC_HI_HZ, fMax < ESC_HI_HZ - ESC_HYST_HZ),
  };

  // Transitions.
  const fresh = [], raised = [];
  for (const t of TILES) {
    const k = T[t.id], on = cond[t.id], e = t.escalates && !!esc[t.id];
    if (on && !k.cond) {
      if (k.state !== 'alarm') { k.state = 'alarm'; k.setAtS = s; fresh.push(t); }
    } else if (!on && k.cond) {
      if (k.state === 'alarm') k.state = 'cleared';
      else if (k.state === 'ackd') k.state = 'normal';
    } else if (on && e && !k.esc) {
      // An alarm already standing got worse: it flashes again if it had been acknowledged.
      k.state = 'alarm';
      raised.push(t);
    }
    k.cond = on;
    k.esc = e;
  }

  // Sound.
  const cues = [];
  const now = ctx.nowMs, holdMs = RESOUND_HOLDOFF_S * 1000;
  const unacked = k => k.state === 'alarm' || k.state === 'cleared';
  const quiet = x.inWatch || !!ctx.hold;
  let newAlarm = false, hornNow = false;
  const candidates = [];
  for (const t of fresh) {
    if (t.prio === 'P3') continue;
    newAlarm = true;
    // Held: by the watch (or the panel), or by the tile's own hold-off (it sounds when that ends, below).
    if (quiet || now - T[t.id].lastSoundMs < holdMs) { T[t.id].held = true; continue; }
    candidates.push(t);
  }
  for (const t of raised) {
    const k = T[t.id];
    newAlarm = true;
    if (k.held) continue;
    if (quiet) k.held = true;
    else if (now - k.lastSoundMs < holdMs) hornNow = true; // the same sounding, now a horn (a re-sound, B-3)
    else candidates.push(t);
  }
  if (!quiet) {
    // The watch ended (or the panel closed), or a hold-off ran out: held tiles still unacknowledged sound once.
    for (const t of TILES) {
      const k = T[t.id];
      if (!k.held || candidates.includes(t)) continue;
      if (!unacked(k)) { k.held = false; continue; }
      if (now - k.lastSoundMs < holdMs) continue;
      candidates.push(t);
    }
  }
  a.prevInWatch = x.inWatch;
  const hornTile = () => TILES.some(t => prioOf(a, t) === 'P1' && T[t.id].state === 'alarm');
  if (candidates.length) {
    let best = prioOf(a, candidates[0]);
    for (const t of candidates) if (PRIO_RANK[prioOf(a, t)] > PRIO_RANK[best]) best = prioOf(a, t);
    for (const t of candidates) {
      const k = T[t.id];
      k.lastSoundMs = now;
      k.held = false;
      k.repeatAtMs = prioOf(a, t) === 'P2' ? now + P2_REPEAT_S * 1000 : Infinity;
    }
    // One sound has just called the operator: repeats that were due are covered by it.
    for (const t of TILES) if (T[t.id].repeatAtMs <= now) T[t.id].repeatAtMs = Infinity;
    cues.push(best === 'P1' ? 'horn' : 'chime');
    a.audible++;
    a.sounds.push({atS: s, atMs: now, prio: best, tiles: candidates.map(t => t.id)});
    if (best === 'P1') { a.sounding = true; a.soundPrio = 'P1'; a.lastHornMs = now; }
  } else if (hornNow) {
    cues.push('horn');
    a.repeats++;
    a.sounding = true; a.soundPrio = 'P1'; a.lastHornMs = now;
  } else if (a.sounding && !quiet && now - a.lastHornMs >= HORN_REPEAT_S * 1000) {
    // K-21: the horn again every 4 real s until SILENCE or ACK, while a P1 alarm still flashes.
    if (hornTile()) { cues.push('horn'); a.repeats++; a.lastHornMs = now; } else { a.sounding = false; a.soundPrio = ''; }
  } else if (!a.sounding && !quiet) {
    // B-3: the single P2 repeat, 60 real s after the chime, if the tile is still unacknowledged.
    let due = false;
    for (const t of TILES) {
      const k = T[t.id];
      if (k.repeatAtMs > now) continue;
      k.repeatAtMs = Infinity;
      if (unacked(k)) due = true;
    }
    if (due) { cues.push('chime'); a.repeats++; }
  }
  a.lastS = s;
  return {cues, newAlarm};
}

/** ACK: flashing alarms turn steady; cleared ones go dark; the sound stops (no repeat follows). */
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
  k.repeatAtMs = Infinity;
  if (!TILES.some(t => a.tiles[t.id].state === 'alarm' && prioOf(a, t) === 'P1')) { a.sounding = false; a.soundPrio = ''; }
  return true;
}

/** SILENCE: stops the sound only (tiles keep flashing): the horn, and any P2 repeat still to come. */
export function silence(a) {
  a.sounding = false;
  a.soundPrio = '';
  for (const t of TILES) a.tiles[t.id].repeatAtMs = Infinity;
}

/**
 * vm.alarms (desk/README.md §5, §14.2). A tile's `prio` is the EFFECTIVE priority (B-1: P1
 * while escalated), `basePrio` the one in TILES, `escalated` true while they differ; `setAtS` the
 * grid second it last went into alarm (-1: not today).
 * @returns {{tiles:Array<{id, label, prio, basePrio, escalated:boolean, state, flash:'fast'|'slow'|null, glyph, target, setAtS}>,
 *   sounding:boolean, unacked:number}}
 */
export function alarmsView(a) {
  let unacked = 0;
  const tiles = TILES.map(t => {
    const k = a.tiles[t.id];
    if (k.state === 'alarm' || k.state === 'cleared') unacked++;
    const prio = prioOf(a, t);
    return {id: t.id, label: t.label, prio, basePrio: t.prio, escalated: prio !== t.prio, state: k.state,
      flash: k.state === 'alarm' ? 'fast' : k.state === 'cleared' ? 'slow' : null, glyph: GLYPH[k.state], target: k.target, setAtS: k.setAtS};
  });
  return {tiles, sounding: a.sounding, unacked};
}

/**
 * The tile the alarm panel opens on when none is named (Q-46, §30.3.3), from alarmsView(), the
 * pick ({id, untilMs}) and the page's ms: a live pick; else the unacknowledged tile with the
 * highest effective priority, newest setAtS first; else the newest acknowledged; else UNDER FREQ.
 */
export function defaultSel(view, pick, nowMs) {
  if (pick && pick.id && nowMs < pick.untilMs) return pick.id;
  const best = (list, rank) => list.sort((p, q) => rank(q) - rank(p) || q.setAtS - p.setAtS)[0];
  const unacked = view.tiles.filter(t => t.state === 'alarm' || t.state === 'cleared');
  const t = unacked.length ? best(unacked, x => PRIO_RANK[x.prio]) : best(view.tiles.filter(x => x.state === 'ackd'), () => 0);
  return t ? t.id : 'underFreq';
}


// sim/grid.js: the 1-second grid update and every player command's semantics
// (spec F-2, F-13, H-1, H-2, H-4, H-10, H-11, K-1, K-2, K-3, K-5..K-7, K-12/K-13 stubs, S-11).
//
// STAGE B owner: "grid". Contract: sim/README.md, section "grid.js".
// step() calls, at every grid-second boundary and in this order:
//   unitsSecond -> agcSecond -> dispatchSecond -> fosSecond -> securitySecond
// (after market.settleSecond, events.applyDue and weather.sampleSecond; before market.priceSecond).
// Trips, breakers, districts, relays and base points go through sim/fleet.js, which keeps
// the invariants listed at the top of that file.
//
// Division of labour inside the second: unitsSecond owns timers and mode transitions
// (start profile, auto-sync, stop profile, lockouts, heat derate, hot trips, water, tie
// lockout, RERT lead, OFGS reconnect, FULL-HOLD); dispatchSecond owns every MW that moves
// (schedules at ramps and along the T2/T4 profiles, battery, tie, renewables, RERT, DR). The
// profiles' transitions are driven by schedMW reaching MIN or the breaker-open level, so
// timerS is a countdown for display (and the market's stack) that never gates the physics.
//
// Choices this file makes where the contract is loose (see the final report, CONTRACT NOTES):
//   * Sync block = min(SYNC_BLOCK_FRAC x rating, MIN) and breaker-open level =
//     min(BREAKER_OPEN_FRAC x rating, MIN): hydro (MIN 0) closes at 0 MW and is 'on' at once,
//     and unloads to 0 before its breaker opens (params t4Min note).
//   * Battery schedule near empty or full tapers to what the dispatch ramp can still bring
//     to zero with the energy left (P <= sqrt(2 x ramp x energy)): an energy management
//     limit, so an empty battery never drops its whole schedule in one tick. Affects only
//     the last few MWh.
//   * Directed shedding (player and FOS) takes the lit rotation district that was restored
//     longest ago (never shed first), ties by rotation index: true rotation, so a district
//     just restored is not the next one shed. On a fresh day that is the lowest rot.
//   * The tie's export cap limits the target; the flow reaches a lower cap at the tie ramp
//     (as a dispatch interval would), never as a step.

import {V} from './params.js';
import * as fleet from './fleet.js';
import {previewTrip} from './physics.js';
import {STREAM, uniform} from './rng.js';

// ------------------------------------------------------------------ constants (hoisted)

const TPS = V.TICKS_PER_S, F0 = V.F0_HZ, M = V.MACHINES, N = M.length, EPS = V.MW_EPS;
const S_PER_MIN = V.S_PER_MIN, S_PER_H = V.S_PER_H, PCT = V.PCT;

const AUTO_SYNC_S = V.AUTO_SYNC_S;
const HOT_FRAC = V.HOT_LOADING_FRAC, HOT_ARM_S = V.HOT_ARM_S, HOT_LOCKOUT_S = V.HOT_TRIP_LOCKOUT_S;
const HOT_P_PER_S = V.HOT_TRIP_PER_H / S_PER_H;
const HOT_CAUSE = 'ran above ' + Math.round(HOT_FRAC * PCT) + '% too long';
const DERATE_KEEP = 1 - V.HEAT_THERMAL_DERATE;

const AGC_CYCLE_S = V.AGC_CYCLE_S, AGC_BIAS = V.AGC_BIAS_MW_PER_HZ, AGC_KI = V.AGC_KI_PER_S, AGC_DB = V.AGC_DEADBAND_HZ;

const BATT_MW = V.BATT_MW, BATT_MWH = V.BATT_MWH, BATT_RAMP = V.BATT_DISPATCH_RAMP_MW_S;
const BATT_EFF = V.BATT_CHARGE_EFF, BATT_FULL_EPS = V.BATT_FULL_EPS_MWH, BATT_SUSTAIN_H = V.BATT_R5_SUSTAIN_H;

const TIE_MAX = V.TIE_MAX_MW, TIE_STEP = V.TIE_RAMP_MW_MIN / S_PER_MIN;
const TIE_R5_MW = V.TIE_RAMP_MW_MIN * V.R5_WINDOW_MIN;
const R5_WINDOW_S = V.R5_WINDOW_MIN * S_PER_MIN;

const RERT_MW = V.RERT_MW, RERT_LEAD_S = V.RERT_LEAD_S, RERT_STEP = V.RERT_RAMP_MW_MIN / S_PER_MIN;
const DR_MW = V.DR_MW, DR_DURATION_S = V.DR_DURATION_S, DR_STEP = V.DR_RAMP_MW_MIN / S_PER_MIN;
const WIND_CURT_STEP = V.CURTAIL_RAMP_FRAC_MIN * V.WIND_MW / S_PER_MIN, SOLAR_CURT_STEP = V.CURTAIL_RAMP_FRAC_MIN * V.SOLAR_MW / S_PER_MIN;

const HYDRO = V.STATIONS.hydro, HYDRO_ALLOC = V.HYDRO_ALLOCATION_MWH, HYDRO_WARN = V.HYDRO_WARN_FRACS;
const HYDRO_STOP_MWH = V.HYDRO_STOP_MWH;

const OFGS_RECONNECT_S = V.OFGS_RECONNECT_S, OFGS_GAP_S = V.OFGS_RECONNECT_GAP_S;

const NORMAL_LO = V.NORMAL_LO_HZ, NORMAL_HI = V.NORMAL_HI_HZ, CONTAIN_LO = V.CONTAIN_LO_HZ;
const FOS_RECOVER_S = V.FOS_RECOVER_S, DIRECTED_BELOW_S = V.DIRECTED_BELOW_CONTAIN_S, DIRECTED_EVERY_S = V.DIRECTED_INTERVAL_S;

const SECURE_RATIO = V.SECURE_RATIO, SEC_RATIO_MAX = V.SEC_RATIO_MAX;
// H-4 SECURE preview condition: 49.5 Hz plus the preview margin (params PREVIEW_MARGIN_HZ: the
// preview freezes demand and schedules; the live nadir can sit up to ~0.1 Hz below it).
const SECURE_NADIR = V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ, AGE_MARGIN = V.PREVIEW_AGE_MARGIN_HZ_S;
const PREVIEW_REFRESH_S = V.PREVIEW_REFRESH_S, PREVIEW_L_TOL = V.PREVIEW_L_TOL_MW, PREVIEW_F_TOL = V.PREVIEW_F_TOL_HZ;

const RESTORE_MIN_HZ = V.RESTORE_MIN_HZ, RESTORE_INTERVAL_S = V.RESTORE_INTERVAL_S;
const RESTORE_NADIR = V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ; // K-13 restore preview: the H-4 line plus the fresh-preview margin
const COLD_DECAY_S = V.COLD_LOAD_DECAY_S;

// Per-machine profile constants (F-13 start/stop profile, H-1, K-12, H-4).
const MC = M.map(m => {
  const blockMW = Math.min(m.syncBlockMW, m.minMW);  // picked up at the breaker close
  const openMW = Math.min(m.breakerOpenMW, m.minMW); // the breaker opens at or below this
  return {
    blockMW, openMW,
    loadRate: m.t2S > 0 ? (m.minMW - blockMW) / m.t2S : 0,  // T2 slope, MW per grid s (0: straight to 'on')
    shutRate: m.t4S > 0 ? (m.minMW - openMW) / m.t4S : 0,   // T4 slope (0: open at MIN)
    r5CapMW: m.rampMWs * R5_WINDOW_S,                         // H-4: ramp x 5 min
  };
});

// AGC scratch (overwritten on every cycle before use; never carries anything between calls).
const UP = new Array(N).fill(0), DN = new Array(N).fill(0);

const SEV = {SECURE: 'good', TIGHT: 'warn', SHORT: 'crit', SHEDDING: 'crit'};

// ------------------------------------------------------------------ small helpers

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** x moved toward target by at most step (exactly target once within reach). */
function toward(x, target, step) {
  const d = target - x;
  return (d > step ? x + step : d < -step ? x - step : target) + 0;
}

const secondOf = state => Math.floor(state.tick / TPS);

/** Curtailed MW this second: toward avail x (1 - LIMIT) at the ramp, never more than avail. */
function curtailedMW(curtMW, availMW, limitPct, step) {
  const c = toward(curtMW, availMW * (PCT - limitPct) / PCT, step);
  return (c > availMW ? availMW : c < 0 ? 0 : c) + 0;
}

function log(state, out, sev, code, msg) {
  out.push({tick: state.tick, kind: 'log', sev, code, msg});
}

const nameOf = i => M[i].name;
const minutes = s => Math.ceil(s / S_PER_MIN);

/** The battery's signed order (+ discharge, - charge) within +-lim; the charge part is 0 in FULL-HOLD (H-10). */
function battOrderMW(b, lim) {
  const o = b.mode === 'discharge' ? b.orderMW : b.mode === 'charge' && !b.fullHold ? -b.orderMW : 0;
  return clamp(o, -lim, lim) + 0;
}

// Energy-management taper (see header): the largest discharge / charge schedule P the
// dispatch ramp r can still bring back to zero, in whole grid seconds, with the energy E
// (MW s) left: P + (P - r) + ... + r = P (P + r) / (2 r) <= E, so
// P = sqrt((r/2)^2 + 2 r E) - r/2. Held to it, the schedule steps down by exactly r per
// second and reaches 0 as the battery empties (or fills).
const HALF_RAMP = BATT_RAMP / 2;
const taperMW = eMWs => Math.sqrt(HALF_RAMP * HALF_RAMP + 2 * BATT_RAMP * Math.max(0, eMWs)) - HALF_RAMP;
const dischargeCapMW = b => taperMW(b.socMWh * S_PER_H);
const chargeCapMW = b => taperMW((BATT_MWH - b.socMWh) * S_PER_H / BATT_EFF);

// ------------------------------------------------------------------ unit transitions

/** Breaker close (K-12 auto-sync or the syncClose stub): the <=5% block, then T2 to MIN. */
function closeBreaker(state, i, out) {
  const u = state.units[i], c = MC[i];
  fleet.setSync(state, i, true);
  u.schedMW = c.blockMW;
  out.push({tick: state.tick, kind: 'breaker', unit: u.id, closed: true, why: 'sync', cue: 'breaker'});
  if (c.loadRate > 0) {
    u.mode = 'loading';
    u.timerS = M[i].t2S;
    log(state, out, 'info', 'UNIT_SYNC', nameOf(i) + ' synchronised: loading to minimum over ' + minutes(M[i].t2S) + ' min.');
  } else {
    goOn(state, i, out);
  }
}

/** The unit reaches MIN: mode 'on', base point MIN (K-1: the station's other machines keep theirs). */
function goOn(state, i, out) {
  const u = state.units[i], m = M[i];
  u.mode = 'on';
  u.timerS = 0;
  u.schedMW = m.minMW;
  u.agcTrimMW = 0;
  fleet.setBasePoint(state, i, m.minMW);
  state.sec.dirty = true; // its governor and headroom now count (H-4 preview)
  log(state, out, 'good', 'UNIT_ON', nameOf(i) + ' on line at minimum (' + Math.round(m.minMW) + ' MW).');
}

/** H-1: the stop profile starts: base point 0 (the lever drops by exactly its share). */
function beginUnload(state, i) {
  const u = state.units[i];
  u.mode = 'unloading';
  u.agcTrimMW = 0;
  fleet.setBasePoint(state, i, 0);
}

/** Breaker opens at <= 5% of rating (H-1, K-3). */
function openBreaker(state, i, out) {
  const u = state.units[i];
  u.mode = 'off';
  u.timerS = 0;
  u.schedMW = 0;
  u.agcTrimMW = 0;
  u.hotS = 0;
  fleet.setSync(state, i, false);
  out.push({tick: state.tick, kind: 'breaker', unit: u.id, closed: false, why: 'stop', cue: 'breaker'});
  log(state, out, 'info', 'UNIT_OFF', nameOf(i) + ': breaker open, unit off line.');
}

// Display countdowns for the profiles (the transitions themselves follow schedMW).
function unloadTimerS(u, i) {
  const m = M[i], c = MC[i];
  const toMin = u.schedMW > m.minMW ? Math.ceil((u.schedMW - m.minMW) / m.rampMWs - EPS) : 0;
  return toMin + (c.shutRate > 0 ? Math.ceil((Math.min(u.schedMW, m.minMW) - c.openMW) / c.shutRate - EPS) : 0);
}

function stepUnit(state, i, out) {
  const u = state.units[i], m = M[i], c = MC[i];
  switch (u.mode) {
    case 'starting':
      u.timerS = Math.max(0, u.timerS - 1);
      if (u.timerS <= 0) {
        u.mode = 'ready';
        const auto = state.control.mode === 'AGC';
        u.timerS = auto ? AUTO_SYNC_S : 0;
        log(state, out, 'info', 'UNIT_READY', nameOf(i) + ' at full speed: ' +
          (auto ? 'auto-sync in ' + minutes(AUTO_SYNC_S) + ' min (or SYNC now).' : 'ready to synchronise (HAND: manual SYNC).'));
      }
      break;
    case 'ready':
      // K-12: the auto-synchroniser runs in AGC mode only; HAND has none (manual syncClose).
      if (state.control.mode === 'AGC') {
        u.timerS = Math.max(0, u.timerS - 1);
        if (u.timerS <= 0) closeBreaker(state, i, out);
      }
      break;
    case 'loading':
      if (u.schedMW >= m.minMW - EPS) goOn(state, i, out);
      else u.timerS = Math.ceil((m.minMW - u.schedMW) / c.loadRate - EPS);
      break;
    case 'unloading':
      if (u.schedMW <= m.minMW + EPS) {
        if (c.shutRate > 0 && u.schedMW > c.openMW + EPS) {
          u.mode = 'shutdown';
          u.timerS = Math.ceil((u.schedMW - c.openMW) / c.shutRate - EPS);
        } else {
          openBreaker(state, i, out);
        }
      } else {
        u.timerS = unloadTimerS(u, i);
      }
      break;
    case 'shutdown':
      if (u.schedMW <= c.openMW + EPS) openBreaker(state, i, out);
      else u.timerS = Math.ceil((u.schedMW - c.openMW) / c.shutRate - EPS);
      break;
    case 'tripped':
      u.timerS = Math.max(0, u.timerS - 1);
      if (u.timerS <= 0) {
        u.mode = 'off';
        log(state, out, 'good', 'UNIT_RELEASED', nameOf(i) + ' released from protection lockout: available to start.');
      }
      break;
    default: // 'on', 'off'
      break;
  }
  // H-2: a hot unit trips itself. The draw is on the play stream at this grid second's tick
  // for this unit, once per grid second, only after HOT_ARM_S hot.
  if (u.sync) {
    u.hotS = u.outMW > HOT_FRAC * u.availMW ? u.hotS + 1 : 0;
    if (u.hotS > HOT_ARM_S && uniform(state.seed, STREAM.PLAY, state.tick, i) < HOT_P_PER_S) {
      fleet.tripUnit(state, i, HOT_CAUSE, HOT_LOCKOUT_S, out);
    }
  } else {
    u.hotS = 0;
  }
}

// ------------------------------------------------------------------ applyCommand

/** District index by id, or -1. */
function districtIndex(state, id) {
  const ds = state.city.districts;
  for (let d = 0; d < ds.length; d++) if (ds[d].id === id) return d;
  return -1;
}

/**
 * Directed shedding (H-11 automatic and the K-7 DIRECT SHED key): darken the lit rotation
 * district restored longest ago (never shed first; ties by rotation index). Returns the
 * district index, or -1 if no lit rotation district remains.
 */
function shedNextRotation(state, out) {
  const ds = state.city.districts;
  let best = -1;
  for (let d = 0; d < ds.length; d++) {
    const x = ds[d];
    if (x.rot < 0 || x.dark) continue;
    if (best < 0) { best = d; continue; }
    const y = ds[best];
    if (x.restoredAtS < y.restoredAtS || (x.restoredAtS === y.restoredAtS && x.rot < y.rot)) best = d;
  }
  if (best < 0) return -1;
  const mw = fleet.districtColdLoadMW(state, best);
  fleet.setDistrictDark(state, best, true, 'directed');
  out.push({tick: state.tick, kind: 'shed', district: ds[best].id, why: 'directed', mw, cue: 'clack'});
  return best;
}

/**
 * Semantic validation and effect of one player command (step.applyInput has already
 * checked its shape and the watch lock, and passes a canonical copy `cmd` = {type, ...args}
 * with -0 folded). Returns '' when applied, else the reason it was refused (nothing
 * changed). applyCommand MAY rewrite cmd's numeric args to the value actually applied
 * (step logs cmd after this returns), and must not touch its other fields. Command types:
 * basePoint, start, stop, abortStop, syncClose, battery, guard, tie, curtail, callDR,
 * armRERT, standDownRERT, restore, directShed ('mode' is step's). See README §6. Key rules:
 *   basePoint {station, mw}: accepted always. Every 'on' machine of the station gets an
 *     equal share, fleet.setBasePoint(state, i, mw / onCount) (machines of one station have
 *     identical [minMW, availMW], so the clamp is exact), and cmd.mw is rewritten to the
 *     resulting lever (fleet.stationRange: clamp(mw, minMW, maxMW); 0 if none is 'on').
 *   start: fleet.startBlock must be ''; mode 'starting', timerS = t1S, starts++,
 *     acc.startCost += startCost.
 *   stop: fleet.stopBlock must be ''; 'on'/'loading' -> 'unloading' with basePointMW 0 (via
 *     fleet.setBasePoint, so the lever drops by exactly its share); 'starting'/'ready' -> 'off'.
 *   abortStop: 'unloading' -> 'on' with basePointMW = schedMW (nothing jumps); 'shutdown'
 *     (or unloading still below MIN) -> 'loading' (T2 slope from its present output up to
 *     MIN). Refused for hydro with no water.
 *   syncClose: mode 'ready' -> breaker closes now (K-12 stub: always clean).
 *   battery {mode, mw}: orderMW = mw (cmd.mw rewritten to min(mw, BATT_MW)), mode set,
 *     fullHold = false. guard {mw}: guardMW.
 *   tie {mw}: setMW (clamped to the export cap only at use). curtail {kind, limitPct}:
 *     ren.windLimitPct / solarLimitPct (output LIMIT, 100 = no curtailment).
 *   callDR: calls left and none active. armRERT: not armed. standDownRERT: armed and not
 *     already standing down (before it arrives it simply cancels).
 *   restore {district}: restorePermissive(state, d, {preview: true}) must be '' (the K-13
 *     restore preview runs here, on the input only); fleet.setDistrictDark(..., false);
 *     district.surgeMW = coldLoad - its present share of demand (>= 0); city.lastRestoreS =
 *     s; fleet.rearmUfls for its stage; emit {kind:'restore', district, mw: coldLoad}.
 *   directShed: darken the next lit rotation district ('directed'), emit 'shed'.
 * @param {object} state
 * @param {{type:string}} cmd
 * @param {Array<object>} out
 * @returns {string}
 */
export function applyCommand(state, cmd, out) {
  const s = secondOf(state);
  switch (cmd.type) {
    case 'basePoint': {
      const row = V.STATIONS[cmd.station];
      const r = fleet.stationRange(state, cmd.station);
      if (r.onCount > 0) {
        for (let i = row.first; i < row.first + row.count; i++) {
          if (state.units[i].mode === 'on') fleet.setBasePoint(state, i, cmd.mw / r.onCount);
        }
      }
      cmd.mw = fleet.refreshLever(state, cmd.station) + 0;
      return '';
    }
    case 'start': {
      const i = fleet.unitIndex(cmd.unit), u = state.units[i], m = M[i];
      const why = fleet.startBlock(state, i);
      if (why) return why;
      u.mode = 'starting';
      u.timerS = m.t1S;
      u.schedMW = 0;
      u.agcTrimMW = 0;
      u.starts += 1;
      state.acc.startCost += m.startCost;
      log(state, out, 'info', 'UNIT_START', 'START ' + m.name + ': running up, full speed in ' + minutes(m.t1S) + ' min.');
      return '';
    }
    case 'stop': {
      const i = fleet.unitIndex(cmd.unit), u = state.units[i];
      const why = fleet.stopBlock(state, i);
      if (why) return why;
      if (u.mode === 'starting' || u.mode === 'ready') {
        u.mode = 'off';
        u.timerS = 0;
        log(state, out, 'info', 'UNIT_CANCEL', nameOf(i) + ': start cancelled.');
      } else {
        beginUnload(state, i);
        u.timerS = unloadTimerS(u, i);
        log(state, out, 'info', 'UNIT_STOP', 'STOP ' + nameOf(i) + ': unloading to minimum, then the shutdown ramp; the breaker opens at <=5%.');
      }
      return '';
    }
    case 'abortStop': {
      const i = fleet.unitIndex(cmd.unit), u = state.units[i], m = M[i], c = MC[i];
      if (u.mode !== 'unloading' && u.mode !== 'shutdown') return 'unit is not stopping';
      if (m.station === 'hydro' && state.hydro.storageMWh <= HYDRO_STOP_MWH) return 'no water';
      if (u.mode === 'unloading' && u.schedMW >= m.minMW - EPS) {
        u.mode = 'on';
        u.timerS = 0;
        fleet.setBasePoint(state, i, u.schedMW);
      } else if (c.loadRate > 0) { // shutdown, or stopped while still loading (below MIN)
        u.mode = 'loading';
        u.timerS = Math.ceil((m.minMW - u.schedMW) / c.loadRate - EPS);
      } else {
        goOn(state, i, out);
      }
      log(state, out, 'info', 'UNIT_ABORT_STOP', nameOf(i) + ': stop aborted.');
      return '';
    }
    case 'syncClose': {
      const i = fleet.unitIndex(cmd.unit);
      if (state.units[i].mode !== 'ready') return 'unit is not at full speed waiting to synchronise';
      closeBreaker(state, i, out);
      return '';
    }
    case 'battery': {
      const b = state.battery;
      cmd.mw = Math.min(cmd.mw, BATT_MW) + 0;
      b.mode = cmd.mode;
      b.orderMW = cmd.mw;
      b.fullHold = false;
      return '';
    }
    case 'guard':
      state.battery.guardMW = cmd.mw;
      return '';
    case 'tie':
      state.tie.setMW = cmd.mw;
      return '';
    case 'curtail':
      if (cmd.kind === 'wind') state.ren.windLimitPct = cmd.limitPct;
      else state.ren.solarLimitPct = cmd.limitPct;
      return '';
    case 'callDR': {
      const dr = state.dr;
      if (dr.callsLeft <= 0) return 'no demand response calls left today';
      if (dr.activeS > 0) return 'demand response is already active';
      dr.activeS = DR_DURATION_S;
      dr.callsLeft -= 1;
      log(state, out, 'warn', 'DR_CALL', 'INDUSTRIAL DR called: ' + DR_MW + ' MW for ' + minutes(DR_DURATION_S) + ' min (' +
        dr.callsLeft + ' calls left).');
      return '';
    }
    case 'armRERT': {
      const r = state.rert;
      if (r.armed) return 'reserve diesel is already armed';
      r.armed = true;
      r.standingDown = false;
      r.leadS = RERT_LEAD_S;
      r.armedEver = true;
      out.push({tick: state.tick, kind: 'log', sev: 'crit', code: 'RERT_ARMED', cue: 'warn',
        msg: 'GLASS BROKEN: reserve diesel armed. ' + RERT_MW + ' MW on line in ' + minutes(RERT_LEAD_S) +
          ' min, out of market at $' + V.RERT_COST + '/MWh.'});
      return '';
    }
    case 'standDownRERT': {
      const r = state.rert;
      if (!r.armed) return 'reserve diesel is not armed';
      if (r.standingDown) return 'reserve diesel is already standing down';
      if (r.leadS > 0 || r.outMW <= 0) {
        r.armed = false;
        r.leadS = 0;
        r.outMW = 0;
        log(state, out, 'info', 'RERT_CANCEL', 'Reserve diesel stood down before it arrived.');
      } else {
        r.standingDown = true;
        log(state, out, 'info', 'RERT_STANDDOWN', 'Reserve diesel standing down.');
      }
      return '';
    }
    case 'restore': {
      const d = districtIndex(state, cmd.district);
      const why = restorePermissive(state, d, RESTORE_WITH_PREVIEW);
      if (why) return why;
      const dist = state.city.districts[d];
      const coldMW = fleet.districtColdLoadMW(state, d);
      const surge = Math.max(0, coldMW - state.env.demandMW * dist.share) + 0;
      fleet.setDistrictDark(state, d, false, null);
      dist.surgeMW = surge;
      state.city.lastRestoreS = s;
      if (dist.uflsStage > 0) fleet.rearmUfls(state, dist.uflsStage - 1);
      refreshColdLoad(state, s);
      out.push({tick: state.tick, kind: 'restore', district: dist.id, mw: coldMW});
      log(state, out, 'good', 'RESTORE', 'District ' + dist.id + ' restored: ' + Math.round(coldMW) + ' MW picked up.');
      return '';
    }
    case 'directShed': {
      const d = shedNextRotation(state, out);
      if (d < 0) return 'no lit district left in the rotation';
      log(state, out, 'crit', 'DIRECT_SHED', 'DIRECT SHED: district ' + state.city.districts[d].id + ' off supply.');
      return '';
    }
    default:
      return 'unknown command';
  }
}

// ------------------------------------------------------------------ unitsSecond

/**
 * Unit state machines and timers, once per grid second (H-1, H-2, K-12 auto-sync, S-11):
 * starting -> ready (T1) -> loading (auto-sync after AUTO_SYNC_S in AGC mode; breaker closes
 * via fleet.setSync with the <=5% block) -> on (when the T2 profile reaches MIN; basePointMW =
 * minMW via fleet.setBasePoint, so the station's other machines keep theirs); unloading ->
 * shutdown (at MIN) -> off (when the T4 profile reaches the breaker-open level); tripped ->
 * off (lockout). Heat derate (availMW; 'on' base points re-clamped with fleet.setBasePoint),
 * overheat trips from the play stream (fleet.tripUnit), hydro stop at HYDRO_STOP_MWH and
 * storage warnings, tie lockout, RERT lead, OFGS reconnect (fleet.setOfgsStage, one stage per
 * OFGS_RECONNECT_GAP_S after OFGS_RECONNECT_S back in band), battery FULL-HOLD (H-10).
 * acc.startCost is NOT here (charged in applyCommand).
 */
export function unitsSecond(state, out) {
  const units = state.units, heat = state.env.heatActive;
  for (let i = 0; i < N; i++) {
    const u = units[i], m = M[i];
    const avail = heat && m.thermal ? m.ratingMW * DERATE_KEEP : m.ratingMW;
    if (avail !== u.availMW) {
      u.availMW = avail;
      if (u.mode === 'on' && u.basePointMW > avail) fleet.setBasePoint(state, i, u.basePointMW);
    }
    stepUnit(state, i, out);
  }

  // Hydro water (P-6, legacy L477-479): warnings, then the station unloads before the water is gone.
  const hy = state.hydro;
  for (let j = 0; j < HYDRO_WARN.length; j++) {
    if (!hy.warned[j] && hy.storageMWh <= HYDRO_WARN[j] * HYDRO_ALLOC) {
      hy.warned[j] = true;
      log(state, out, j === 0 ? 'warn' : 'crit', 'HYDRO_WATER', HYDRO.name.toUpperCase() + ': ' + Math.round(HYDRO_WARN[j] * PCT) +
        '% of the daily water allocation left.' + (j === 0 ? ' Budget it.' : ' The station will be unloaded before it runs dry.'));
    }
  }
  if (hy.storageMWh <= HYDRO_STOP_MWH) {
    let forced = false;
    for (let i = HYDRO.first; i < HYDRO.first + HYDRO.count; i++) {
      const u = units[i];
      if (u.mode === 'on' || u.mode === 'loading') { beginUnload(state, i); u.timerS = unloadTimerS(u, i); forced = true; }
      else if (u.mode === 'starting' || u.mode === 'ready') { u.mode = 'off'; u.timerS = 0; forced = true; }
    }
    if (forced) {
      log(state, out, 'crit', 'HYDRO_EMPTY', HYDRO.name.toUpperCase() + ': water allocation exhausted. Machines unloading; no restart today.');
    }
  }

  // Tie lockout (K-6).
  const t = state.tie;
  if (t.tripped) {
    t.lockoutS = Math.max(0, t.lockoutS - 1);
    if (t.lockoutS <= 0) {
      t.tripped = false;
      state.sec.dirty = true;
      out.push({tick: state.tick, kind: 'breaker', unit: 'tie', closed: true, why: 'sync', cue: 'breaker'});
      log(state, out, 'good', 'LINK_BACK', 'Interconnector back in service: flow ramps to its setpoint.');
    }
  }

  // RERT lead time (K-7).
  const r = state.rert;
  if (r.armed && r.leadS > 0) {
    r.leadS -= 1;
    if (r.leadS <= 0) log(state, out, 'warn', 'RERT_ONLINE', 'Reserve diesel on line: loading to ' + RERT_MW + ' MW.');
  }

  // OFGS reconnect (H-7): after OFGS_RECONNECT_S in the normal band, one stage per gap.
  const o = state.ofgs;
  let top = -1;
  for (let k = 0; k < o.tripped.length; k++) if (o.tripped[k]) top = k;
  if (top < 0) {
    o.okS = 0;
  } else {
    const f = state.last.fMeanHz;
    o.okS = f >= NORMAL_LO && f <= NORMAL_HI ? o.okS + 1 : 0;
    if (o.okS >= OFGS_RECONNECT_S) {
      fleet.setOfgsStage(state, top, false);
      o.okS = o.trippedFrac > 0 ? OFGS_RECONNECT_S - OFGS_GAP_S : 0;
      log(state, out, 'info', 'OFGS_RECONNECT', 'Wind OFGS stage ' + (top + 1) + ' reconnected.');
    }
  }

  // FULL-HOLD (H-10): a charge order on a full battery pauses and never silently re-engages;
  // only a new battery input clears it (applyCommand).
  const b = state.battery;
  if (!b.fullHold && b.mode === 'charge' && b.orderMW > 0 && b.socMWh >= BATT_MWH - BATT_FULL_EPS) {
    b.fullHold = true;
    log(state, out, 'warn', 'FULL_HOLD', 'BATTERY: CHARGE ORDER - paused (full). Give a new order to resume.');
  }
}

// ------------------------------------------------------------------ agcSecond

/** One AGC cycle: integral on ACE, shared over the participants in proportion to their bands. */
function agcCycle(state) {
  const agc = state.agc, units = state.units, b = state.battery;
  const dev = state.last.fMeanHz - F0;
  const ace = dev <= AGC_DB && dev >= -AGC_DB ? 0 : -AGC_BIAS * dev + 0;
  agc.aceMW = ace;
  // Bands: +-agcBandMW for 'on' units, kept inside [minMW, HOT_LOADING_FRAC x availMW]
  // around the base point: the overload gate is the unit's high regulating limit, so AGC
  // never pushes a unit into the H-2 hot zone (only a lever past the gate does, K-1).
  let upSum = 0, dnSum = 0;
  for (let i = 0; i < N; i++) {
    const u = units[i];
    if (u.mode !== 'on') { UP[i] = 0; DN[i] = 0; continue; }
    const band = M[i].agcBandMW;
    UP[i] = Math.max(0, Math.min(band, HOT_FRAC * u.availMW - u.basePointMW));
    DN[i] = Math.max(0, Math.min(band, u.basePointMW - M[i].minMW));
    upSum += UP[i];
    dnSum += DN[i];
  }
  // Battery: +-(BATT_MW - guardMW) around its order (K-5: guard MW are never AGC's), within
  // the SoC taper; no lowering band while under-frequency suspends charging (H-10).
  const lim = Math.max(0, BATT_MW - b.guardMW);
  const order = battOrderMW(b, lim);
  const bUp = Math.max(0, Math.min(lim, dischargeCapMW(b)) - order);
  const bDn = b.ufSuspend ? 0 : Math.max(0, Math.min(lim, chargeCapMW(b)) + order);
  upSum += bUp;
  dnSum += bDn;
  const raw = agc.requestMW + AGC_KI * AGC_CYCLE_S * ace;
  const req = clamp(raw, -dnSum, upSum) + 0;
  const atLimit = (raw > upSum + EPS && ace > 0) || (raw < -dnSum - EPS && ace < 0);
  agc.requestMW = req;
  agc.unmetMW = atLimit ? ace : 0;
  const share = req >= 0 ? (upSum > 0 ? req / upSum : 0) : (dnSum > 0 ? req / dnSum : 0);
  for (let i = 0; i < N; i++) units[i].agcTrimMW = (req >= 0 ? UP[i] : DN[i]) * share + 0;
  b.agcTrimMW = (req >= 0 ? bUp : bDn) * share + 0;
}

/**
 * AGC (K-2, L-8): every AGC_CYCLE_S in AGC mode, ACE = -AGC_BIAS_MW_PER_HZ * (state.last.fMeanHz
 * - F0) (0 within AGC_DEADBAND_HZ; positive = more generation needed); request +=
 * AGC_KI_PER_S * AGC_CYCLE_S * ACE, clipped to the sum of bands; share it over participants
 * in proportion to their band (units in mode 'on': +-agcBandMW, kept within [minMW,
 * HOT_LOADING_FRAC x availMW] around the base point, so AGC never makes a unit run hot;
 * battery: +-(BATT_MW - guardMW) around its order, within SoC).
 * Writes units[].agcTrimMW, battery.agcTrimMW, agc.*. agc.unmetMW is the ACE the clipped
 * request could not cover (0 when inside the bands); agc.atLimitS counts consecutive grid
 * seconds at the limit (the app lights AGC LIMIT after 5 REAL s). In HAND mode every trim is
 * 0 (ACE is still shown). AGC never starts or stops a unit and never moves a base point.
 */
export function agcSecond(state, out) { // eslint-disable-line no-unused-vars
  const s = secondOf(state), agc = state.agc;
  if (state.control.mode !== 'AGC') {
    for (let i = 0; i < N; i++) state.units[i].agcTrimMW = 0;
    state.battery.agcTrimMW = 0;
    const dev = state.last.fMeanHz - F0;
    agc.aceMW = dev <= AGC_DB && dev >= -AGC_DB ? 0 : -AGC_BIAS * dev + 0;
    agc.requestMW = 0;
    agc.unmetMW = 0;
    agc.atLimitS = 0;
    agc.nextCycleS = s;
    return;
  }
  if (s >= agc.nextCycleS) {
    agc.nextCycleS = s + AGC_CYCLE_S;
    agcCycle(state);
  }
  agc.atLimitS = agc.unmetMW !== 0 ? agc.atLimitS + 1 : 0;
}

// ------------------------------------------------------------------ dispatchSecond

/**
 * Dispatch movement for the coming second (all constant within the second):
 *   units in mode 'on': schedMW moves toward clamp(basePointMW + agcTrimMW, minMW, availMW)
 *     at rampMWs; loading climbs the T2 slope to MIN, unloading falls at the ramp to MIN,
 *     shutdown falls the T4 slope to the breaker-open level; units off line schedule 0.
 *   battery: target = clamp(signed order + agcTrimMW, -(BATT_MW - guardMW), BATT_MW - guardMW)
 *     (+ discharge, - charge; charge part 0 while fullHold), tapered near empty / full;
 *     schedMW moves toward it at BATT_DISPATCH_RAMP_MW_S (K-5: guard MW are never available
 *     to orders or AGC).
 *   tie: flowMW toward clamp(setMW, -env.exportLimitMW, TIE_MAX_MW) at TIE_RAMP_MW_MIN / 60
 *     per second (0 while tripped).
 *   ren: windMW = env.windAvailMW x windLimitPct / 100; solarMW likewise (physics applies
 *     OFGS to wind). rert.outMW ramps at RERT_RAMP_MW_MIN once the lead is over (and out when
 *     standing down, then disarms); dr.mw = DR_MW for DR_DURATION_S from the call.
 */
export function dispatchSecond(state, out) {
  const units = state.units, env = state.env;
  for (let i = 0; i < N; i++) {
    const u = units[i], m = M[i], c = MC[i];
    switch (u.mode) {
      case 'on':
        u.schedMW = toward(u.schedMW, clamp(u.basePointMW + u.agcTrimMW, m.minMW, u.availMW), m.rampMWs);
        break;
      case 'loading':
        u.schedMW = Math.min(m.minMW, u.schedMW + c.loadRate) + 0;
        break;
      case 'unloading':
        if (u.schedMW > m.minMW) u.schedMW = Math.max(m.minMW, u.schedMW - m.rampMWs) + 0;
        break;
      case 'shutdown':
        u.schedMW = Math.max(c.openMW, u.schedMW - c.shutRate) + 0;
        break;
      default:
        u.schedMW = 0;
    }
  }

  const b = state.battery;
  const lim = Math.max(0, BATT_MW - b.guardMW);
  const target = clamp(battOrderMW(b, lim) + b.agcTrimMW, -Math.min(lim, chargeCapMW(b)), Math.min(lim, dischargeCapMW(b)));
  b.schedMW = toward(b.schedMW, target, BATT_RAMP);

  const t = state.tie;
  t.flowMW = t.tripped ? 0 : toward(t.flowMW, clamp(t.setMW, -env.exportLimitMW, TIE_MAX), TIE_STEP);

  // Renewables: the curtailed MW (available minus the LIMIT) move at the curtailment ramp
  // (integration, CURTAIL_RAMP_FRAC_MIN); the weather passes straight through.
  const ren = state.ren;
  ren.windCurtMW = curtailedMW(ren.windCurtMW, env.windAvailMW, ren.windLimitPct, WIND_CURT_STEP);
  ren.windMW = env.windAvailMW - ren.windCurtMW + 0;
  ren.solarCurtMW = curtailedMW(ren.solarCurtMW, env.solarAvailMW, ren.solarLimitPct, SOLAR_CURT_STEP);
  ren.solarMW = env.solarAvailMW - ren.solarCurtMW + 0;

  const r = state.rert;
  if (r.standingDown) {
    r.outMW = toward(r.outMW, 0, RERT_STEP);
    if (r.outMW <= 0) {
      r.armed = false;
      r.standingDown = false;
      r.leadS = 0;
      log(state, out, 'info', 'RERT_OFF', 'Reserve diesel off line.');
    }
  } else if (r.armed && r.leadS <= 0) {
    r.outMW = toward(r.outMW, RERT_MW, RERT_STEP);
  } else {
    r.outMW = 0;
  }

  // DR sheds and returns at DR_RAMP_MW_MIN (integration): never a 350-MW load step.
  const dr = state.dr;
  dr.mw = toward(dr.mw, dr.activeS > 0 ? DR_MW : 0, DR_STEP);
  if (dr.activeS > 0) {
    dr.activeS -= 1;
    if (dr.activeS === 0) log(state, out, 'info', 'DR_END', 'Industrial DR call ended: load returning.');
  }
}

// ------------------------------------------------------------------ fosSecond

/** K-13 cold-load surge: city.coldLoadMW = sum of the lit districts' decaying surges. */
function refreshColdLoad(state, s) {
  const ds = state.city.districts;
  let sum = 0;
  for (let d = 0; d < ds.length; d++) {
    const x = ds[d];
    if (x.surgeMW <= 0) continue;
    const left = x.dark ? 0 : 1 - (s - x.restoredAtS) / COLD_DECAY_S;
    if (left <= 0) { x.surgeMW = 0; continue; }
    sum += x.surgeMW * Math.min(1, left);
  }
  state.city.coldLoadMW = sum + 0;
}

/**
 * Frequency operating standard (H-11), on state.last.fMeanHz: fos.outsideS, fos.belowContainS,
 * fos.countdownS; directed shedding (one district per DIRECTED_INTERVAL_S in rotation order,
 * fleet.setDistrictDark(..., 'directed'), a 'shed' record) when the 5-min countdown ends below
 * NORMAL_LO_HZ or f < CONTAIN_LO_HZ for > DIRECTED_BELOW_CONTAIN_S; it stops when frequency
 * RECOVERS, defined as last.fMeanHz >= NORMAL_LO_HZ. Nothing is ever restored automatically
 * (H-6). Also: the cold-load surge (K-13) city.coldLoadMW = sum over lit districts of surgeMW
 * x max(0, 1 - (s - restoredAtS) / COLD_LOAD_DECAY_S) (surgeMW set to 0 once decayed), and the
 * active contingency's backInBandTick: the first tick of the first completed second after
 * the trip whose fMinHz and fMaxHz both lie inside the normal band.
 */
export function fosSecond(state, out) {
  const s = secondOf(state), fos = state.fos, last = state.last, f = last.fMeanHz;
  const outside = f < NORMAL_LO || f > NORMAL_HI;
  fos.outsideS = outside ? fos.outsideS + 1 : 0;
  fos.countdownS = outside ? Math.max(0, FOS_RECOVER_S - fos.outsideS) : FOS_RECOVER_S;
  fos.belowContainS = f < CONTAIN_LO ? fos.belowContainS + 1 : 0;

  if (fos.directed) {
    if (f >= NORMAL_LO) {
      fos.directed = false;
      log(state, out, 'good', 'DIRECTED_END', 'Frequency recovered: directed shedding stops. Restore districts when the permissive allows.');
    } else if (s >= fos.nextShedS) {
      shedNextRotation(state, out);
      fos.nextShedS = s + DIRECTED_EVERY_S;
    }
  } else {
    const countdownEnded = fos.outsideS >= FOS_RECOVER_S && f < NORMAL_LO;
    const belowTooLong = fos.belowContainS > DIRECTED_BELOW_S;
    if (countdownEnded || belowTooLong) {
      fos.directed = true;
      fos.nextShedS = s + DIRECTED_EVERY_S;
      log(state, out, 'crit', 'DIRECTED_SHED', 'DIRECTED SHEDDING: ' + (belowTooLong
        ? 'frequency below ' + CONTAIN_LO + ' Hz for over ' + minutes(DIRECTED_BELOW_S) + ' min'
        : 'not back in the normal band within ' + minutes(FOS_RECOVER_S) + ' min') + '. One district per minute until it recovers.');
      shedNextRotation(state, out);
    }
  }

  refreshColdLoad(state, s);

  if (state.contIdx >= 0) {
    const c = state.conts[state.contIdx];
    const prevStart = (s - 1) * TPS;
    if (c.backInBandTick < 0 && prevStart >= c.startTick && last.fMinHz >= NORMAL_LO && last.fMaxHz <= NORMAL_HI) {
      c.backInBandTick = prevStart;
    }
  }
}

// ------------------------------------------------------------------ security (H-4)

/** TRIP PREVIEW nadir for losing L (H-4 SECURE condition, K-10). */
function previewNadir(state, L) {
  if (L.kind === 'unit') return previewTrip(state, {kind: 'unit', id: L.id}).nadirHz;
  if (L.kind === 'link') return previewTrip(state, {kind: 'link', id: 'tie'}).nadirHz;
  return F0;
}

/**
 * Refresh state.sec from security(state). The preview (physics.previewTrip for losing L)
 * is re-run when ANY of: sec.dirty (set by every accepted input, fleet.setSync, trips);
 * L's id differs from sec.previewLId; |L MW - sec.previewLMW| > PREVIEW_L_TOL_MW; the
 * frequency has moved more than PREVIEW_F_TOL_HZ from sec.previewFHz (the preview starts from
 * the present frequency and governor state: one cached during an excursion overstates the
 * nadir once frequency has come back); or PREVIEW_REFRESH_S have passed since sec.previewAtS.
 * On a re-run it sets previewNadirHz, previewAtS = s, previewLId, previewLMW, previewFHz and
 * clears dirty; otherwise the cached nadir is reused (security(state, {previewNadirHz})).
 * Emits a log line when the level changes.
 */
export function securitySecond(state, out) {
  const s = secondOf(state), sec = state.sec;
  const L = fleet.largestContingency(state);
  const f = state.phys.fHz;
  if (sec.dirty || sec.previewAtS < 0 || L.id !== sec.previewLId || Math.abs(L.mw - sec.previewLMW) > PREVIEW_L_TOL ||
      Math.abs(f - sec.previewFHz) > PREVIEW_F_TOL || s - sec.previewAtS >= PREVIEW_REFRESH_S) {
    sec.previewNadirHz = previewNadir(state, L);
    sec.previewAtS = s;
    sec.previewLId = L.id;
    sec.previewLMW = L.mw;
    sec.previewFHz = f;
    sec.dirty = false;
  }
  const r = security(state, {previewNadirHz: sec.previewNadirHz, previewAgeS: s - sec.previewAtS});
  const before = sec.level;
  sec.r5MW = r.r5MW;
  sec.lMW = r.lMW;
  sec.lKind = r.lKind;
  sec.lId = r.lId;
  sec.ratio = r.ratio;
  sec.level = r.level;
  if (r.level !== before) {
    log(state, out, SEV[r.level], 'SECURITY', 'SECURITY ' + r.level + ': spare in 5 min ' + Math.round(r.r5MW) + ' MW, biggest risk ' +
      (r.lKind === 'none' ? 'none' : r.lId + ' ' + Math.round(r.lMW) + ' MW') + ', trip preview ' + r.previewNadirHz.toFixed(2) + ' Hz.');
  }
}

/**
 * THE reserve function (H-4): feeds the gauge, the alarm, the price adder (P-7), the restore
 * permissive (K-13), par and the debrief. Pure.
 *   R5 = sum over units in mode 'on' of min(availMW - outMW, rampMWs * R5_WINDOW_MIN * 60)
 *        (loading, unloading and shutdown units offer no headroom, H-1)
 *      + battery min(BATT_MW - outMW, socMWh / BATT_R5_SUSTAIN_H)
 *      + tie (not tripped) min(TIE_MAX_MW - flowMW, TIE_RAMP_MW_MIN * R5_WINDOW_MIN)
 *      (each term floored at 0: a unit above its derated capacity has no headroom, not less)
 *   L  = fleet.largestContingency(state)
 *   ratio = R5 / L, capped at SEC_RATIO_MAX (finite when L is 0)
 *   level: 'SHEDDING' if city.shedFrac > 0; 'SHORT' if R5 < L; 'TIGHT' if R5 < SECURE_RATIO*L
 *          or previewNadirHz < SECURE_NADIR_HZ + PREVIEW_MARGIN_HZ; else 'SECURE' (the margin
 *          covers what the frozen-schedule preview cannot see: H-8 containment, tuning pass),
 *          plus PREVIEW_AGE_MARGIN_HZ_S x opts.previewAgeS for a cached preview.
 * @param {object} state
 * @param {{previewNadirHz?:number, previewAgeS?:number}} [opts] reuse a cached preview instead of running
 *   physics.previewTrip; previewAgeS: its age in grid seconds (0 if omitted)
 * @returns {{r5MW:number, lMW:number, lKind:string, lId:string, ratio:number, previewNadirHz:number, level:string}}
 */
export function security(state, opts) {
  const units = state.units;
  let r5 = 0;
  for (let i = 0; i < N; i++) {
    const u = units[i];
    if (u.mode !== 'on') continue;
    const h = Math.min(u.availMW - u.outMW, MC[i].r5CapMW);
    if (h > 0) r5 += h;
  }
  const b = state.battery;
  const hb = Math.min(BATT_MW - b.outMW, b.socMWh / BATT_SUSTAIN_H);
  if (hb > 0) r5 += hb;
  const t = state.tie;
  if (!t.tripped) {
    const ht = Math.min(TIE_MAX - t.flowMW, TIE_R5_MW);
    if (ht > 0) r5 += ht;
  }
  r5 += 0;
  const L = fleet.largestContingency(state);
  const cached = opts && typeof opts.previewNadirHz === 'number';
  const nadir = cached ? opts.previewNadirHz : previewNadir(state, L);
  const needHz = SECURE_NADIR + (cached && opts.previewAgeS > 0 ? AGE_MARGIN * opts.previewAgeS : 0);
  const ratio = L.mw > 0 ? Math.min(SEC_RATIO_MAX, r5 / L.mw) : SEC_RATIO_MAX;
  const level = state.city.shedFrac > 0 ? 'SHEDDING'
    : r5 < L.mw ? 'SHORT'
      : r5 < SECURE_RATIO * L.mw || nadir < needHz ? 'TIGHT' : 'SECURE';
  return {r5MW: r5, lMW: L.mw, lKind: L.kind, lId: L.id, ratio, previewNadirHz: nadir, level};
}

// ------------------------------------------------------------------ restore permissive (K-13)

const RESTORE_WITH_PREVIEW = Object.freeze({preview: true});

/**
 * K-13 restore permissive for district index d. Returns fleet.DISTRICT_LIT if the district
 * is not dark; '' if last.fMeanHz >= RESTORE_MIN_HZ and RESTORE_INTERVAL_S have passed since
 * city.lastRestoreS and, with opts.preview, the RESTORE PREVIEW (physics.previewTrip kind
 * 'district': the district's cold-load MW picked up now, on the same engine as the TRIP
 * PREVIEW) keeps the nadir at or above SECURE_NADIR_HZ + PREVIEW_MARGIN_HZ; else the first
 * failing reason. The preview replaced the stage A rule R5 >= 1.2 x cold load (tuning pass):
 * R5 is 5-minute headroom, not primary response, and passed restores whose surge set off UFLS
 * again (restore -> UFLS -> restore). It runs on the restore input only (applyCommand), never
 * per district in observe() (which calls this without opts, so restoreBlock is the lamp's
 * frequency and interval conditions; the desk shows the preview on selection, K-13). Pure.
 * @param {object} state
 * @param {number} d district index
 * @param {{preview?:boolean}} [opts]
 * @returns {string}
 */
export function restorePermissive(state, d, opts) {
  const dist = state.city.districts[d];
  if (!dist) return 'unknown district';
  if (!dist.dark) return fleet.DISTRICT_LIT;
  if (state.last.fMeanHz < RESTORE_MIN_HZ) return 'frequency below ' + RESTORE_MIN_HZ + ' Hz';
  const since = secondOf(state) - state.city.lastRestoreS;
  if (since < RESTORE_INTERVAL_S) return 'wait ' + minutes(RESTORE_INTERVAL_S - since) + ' min after the last restore';
  if (opts && opts.preview) {
    const p = previewTrip(state, {kind: 'district', id: dist.id});
    if (p.nadirHz < RESTORE_NADIR) {
      return 'restore preview ' + p.nadirHz.toFixed(2) + ' Hz for ' + Math.round(p.lostMW) + ' MW, below ' + RESTORE_NADIR.toFixed(2) + ' Hz';
    }
  }
  return '';
}

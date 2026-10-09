// sim/grid.js: the 1-second grid update and every player command's semantics
// (spec F-2, F-13, H-1, H-2, H-4, H-10, H-11, K-1, K-2, K-3, K-5..K-7, K-12/K-13 stubs, S-11).
// Contract: sim/README.md §11 grid.js.

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

/** Breaker close (K-12: auto-sync or a syncClose that the relay allows): the <=5% block, then T2 to MIN. */
function closeBreaker(state, i, out) {
  const u = state.units[i], c = MC[i];
  fleet.setSync(state, i, true);
  u.schedMW = c.blockMW;
  u.autoTick = -1;
  if (state.scope.unit === u.id) state.scope.unit = ''; // the unit leaves the scope (FOCUS ends)
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
        seedSlip(state, i);
        log(state, out, 'info', 'UNIT_READY', nameOf(i) + ' at full speed: ' +
          (auto ? 'auto-sync in ' + minutes(AUTO_SYNC_S) + ' min (or SYNC now).' : 'ready to synchronise (HAND: manual SYNC).'));
      }
      break;
    case 'ready':
      // K-12: the auto-synchroniser runs in AGC mode only (HAND has none: manual syncClose), and
      // waits while the unit is on the synchroscope (A-4: the player has it).
      if (state.control.mode === 'AGC' && state.scope.unit !== u.id) {
        u.timerS = Math.max(0, u.timerS - 1);
        if (u.timerS <= 0) {
          closeBreaker(state, i, out);
          out.push({tick: state.tick, kind: 'sync', unit: u.id, result: 'auto', angleDeg: 0, slipHz: V.SYNC_AUTO_SLIP_HZ});
        }
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
  // Phase 2a (the wave-1 merge's decision): a district that is feeding back at a sunny noon is
  // passed over, as an operator would pass over a feeder in reverse flow: shedding it takes
  // generation off (measured: SOL3 at -33 MW tipped a 4-MW shortfall into UFLS). When no lit
  // rotation district has load to give, the old rule stands. UFLS blocks stay static (C-8).
  let best = -1, any = -1;
  for (let d = 0; d < ds.length; d++) {
    const x = ds[d];
    if (x.rot < 0 || x.dark) continue;
    const y = any < 0 ? null : ds[any];
    if (!y || x.restoredAtS < y.restoredAtS || (x.restoredAtS === y.restoredAtS && x.rot < y.rot)) any = d;
    if (!(fleet.districtColdLoadMW(state, d) > 0)) continue;
    const z = best < 0 ? null : ds[best];
    if (!z || x.restoredAtS < z.restoredAtS || (x.restoredAtS === z.restoredAtS && x.rot < z.rot)) best = d;
  }
  if (best < 0) best = any;
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
 * armRERT, standDownRERT, restore, directShed, and (Phase 1a) planKey, planDel, planStart,
 * planStop, planUnbook, planRejoin, planLoad, scope, syncTrim, syncAuto ('mode' is step's).
 * See README §6 (it has the Phase 1a rules; the plan section below has the details). Key rules:
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
 *   syncClose: mode 'ready' -> the K-12 outcome table (syncClose() below).
 *   battery {mode, mw}: orderMW = mw (cmd.mw rewritten to min(mw, BATT_MW)), mode set,
 *     fullHold = false. guard {mw}: guardMW.
 *   tie {mw}: setMW (clamped to the export cap only at use) and the tie's plan key (Phase 1a). curtail {kind, limitPct}:
 *     ren.windLimitPct / solarLimitPct (output LIMIT, 100 = no curtailment).
 *   callDR: calls left and none active. armRERT: not armed. standDownRERT: armed and not
 *     already standing down (before it arrives it simply cancels).
 *   restore {district}: restorePermissive(state, d, {preview: true}) must be '' (the K-13
 *     restore preview runs here, on the input only); fleet.setDistrictDark(..., false);
 *     district.surgeMW = coldLoad - its present share of the total before rooftop (>= 0; P-12:
 *     coldLoad is the undelayed underlying pickup, the district's rooftop waits ROOF_RECONNECT_S
 *     and then ramps back over ROOF_RAMP_S); city.lastRestoreS = s; fleet.rearmUfls for its
 *     stage; emit {kind:'restore', district, mw: coldLoad}.
 *   directShed: only while sec.level is SHORT or SHEDDING (A-3); darken the next lit rotation
 *     district ('directed'), emit 'shed'.
 * @param {object} state
 * @param {{type:string}} cmd
 * @param {Array<object>} out
 * @returns {string}
 */
export function applyCommand(state, cmd, out) {
  const s = secondOf(state);
  switch (cmd.type) {
    case 'basePoint': {
      const j = SIDX[cmd.station], before = state.stations[j].basePointMW;
      stationNow(state, j);
      cmd.mw = setLever(state, cmd.station, cmd.mw);
      const ps = state.plan.stations[j];
      if (state.control.mode === 'AGC') {
        if (NOW.onCount > 0) leverKey(state, ps, s, cmd.mw, NOW.rampMWs > 0 ? Math.abs(cmd.mw - before) / NOW.rampMWs : 0, NOW.onCount);
      } else {
        ps.man = true; // HAND (K-2, L-6): a grabbed lever leaves the plan until P rejoins it
      }
      state.plan.rev += 1;
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
    case 'syncClose': return syncClose(state, cmd, out);
    case 'scope': {
      if (cmd.unit === '') { state.scope.unit = ''; return ''; }
      if (state.units[fleet.unitIndex(cmd.unit)].mode !== 'ready') return NOT_READY;
      state.scope.unit = cmd.unit;
      return '';
    }
    case 'syncTrim': {
      const i = fleet.unitIndex(cmd.unit), u = state.units[i];
      if (u.mode !== 'ready') return NOT_READY;
      if (state.scope.unit !== u.id) return 'open the synchroscope on ' + nameOf(i) + ' first';
      reAnchor(u, state.tick);
      u.slipToHz = clamp(u.slipToHz + cmd.dHz, -SLIP_LIMIT, SLIP_LIMIT) + 0;
      if (u.autoTick >= 0) { u.autoTick = -1; refreshAutoTick(state); } // the player took the speed knob back
      return '';
    }
    case 'syncAuto': {
      const i = fleet.unitIndex(cmd.unit), u = state.units[i];
      if (u.mode !== 'ready') return NOT_READY;
      if (state.control.mode !== 'AGC') return 'HAND: there is no auto-synchroniser (close by hand)';
      armAutoSync(state, i);
      return '';
    }
    case 'planKey': return planKey(state, cmd, s, out);
    case 'planDel': return planDel(state, cmd, s);
    case 'planStart': return planStart(state, cmd, s);
    case 'planStop': return planStop(state, cmd, s);
    case 'planUnbook': return planUnbook(state, cmd);
    case 'planRejoin': return planRejoin(state, cmd, s);
    case 'planLoad': return planLoad(state, cmd, s);
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
    case 'tie': {
      const before = state.tie.setMW;
      state.tie.setMW = cmd.mw;
      // The tie's plan like a lever's (§3.2), in both modes: HAND concerns the units, the tie is a
      // DC setpoint either way, so a tie move always writes its arrive-by key.
      leverKey(state, state.plan.tie, s, cmd.mw, Math.abs(cmd.mw - before) / TIE_STEP, 0);
      state.plan.rev += 1;
      return '';
    }
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
      // the surge is the pickup beyond its underlying share (P-12: its rooftop is still off, fleet.setDistrictDark)
      const surge = Math.max(0, coldMW - (state.env.demandMW + state.env.rooftopMW) * dist.share) + 0;
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
      // K-7 / A-3: the key is for a shortfall: R5 below L now (SHORT, the LOR2-like state) or shedding already.
      const lv = state.sec.level;
      if (lv !== 'SHORT' && lv !== 'SHEDDING') return 'DIRECT SHED is for a shortfall: the gauge reads ' + lv + ' (it needs SHORT or SHEDDING)';
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
    // K-12: a rough close's one-second swing ends; a slow close trips on reverse power.
    if (u.kickMW !== 0 && state.tick >= u.kickEndTick) { u.schedMW = Math.max(0, u.schedMW - u.kickMW) + 0; u.kickMW = 0; }
    if (u.revTripS > 0) {
      u.revTripS -= 1;
      if (u.revTripS === 0 && u.sync) { reverseTrip(state, i, out); continue; }
    }
    stepUnit(state, i, out);
  }
  const sc = state.scope;
  if (sc.unit !== '' && units[fleet.unitIndex(sc.unit)].mode !== 'ready') sc.unit = ''; // the scoped unit left 'ready'

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

/**
 * One AGC cycle: integral on ACE, shared over the participants in proportion to their bands.
 * C-6 (Phase 2a): while the dispatch is spilling wind or solar (ren.windAutoMW or solarAutoMW > 0)
 * a LOWERING request goes to the units first, each as far as its MIN (thermal energy is out of
 * merit while renewables are spilled: NEMDE would dispatch it down to its minimum-load block), and
 * only what they cannot take goes to the battery's band. So a plan that sits above MIN in a surplus
 * is lowered to the floor the feed-forward cut assumes, and an idle battery does not fill while a
 * unit still has room above MIN. On a day that never spills (the classic day) this is the pre-2a
 * cycle exactly.
 */
function agcCycle(state) {
  const agc = state.agc, units = state.units, b = state.battery;
  const dev = state.last.fMeanHz - F0;
  const ace = dev <= AGC_DB && dev >= -AGC_DB ? 0 : -AGC_BIAS * dev + 0;
  agc.aceMW = ace;
  const spilling = state.ren.windAutoMW > 0 || state.ren.solarAutoMW > 0;
  // Bands: +-agcBandMW for 'on' units, kept inside [minMW, HOT_LOADING_FRAC x availMW]
  // around the base point: the overload gate is the unit's high regulating limit, so AGC
  // never pushes a unit into the H-2 hot zone (only a lever past the gate does, K-1). While
  // the dispatch is spilling, the lowering band is the whole way down to MIN (C-6).
  let upSum = 0, dnSum = 0;
  for (let i = 0; i < N; i++) {
    const u = units[i];
    if (u.mode !== 'on') { UP[i] = 0; DN[i] = 0; continue; }
    const band = M[i].agcBandMW, room = u.basePointMW - M[i].minMW;
    UP[i] = Math.max(0, Math.min(band, HOT_FRAC * u.availMW - u.basePointMW));
    DN[i] = Math.max(0, spilling ? room : Math.min(band, room));
    upSum += UP[i];
    dnSum += DN[i];
  }
  const unitDn = dnSum;
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
  if (spilling && req < 0) {
    // C-6: the units first (pro rata by their room above MIN), the battery only for the rest.
    const toUnits = req < -unitDn ? -unitDn : req;
    const unitShare = unitDn > 0 ? toUnits / unitDn : 0;
    for (let i = 0; i < N; i++) units[i].agcTrimMW = DN[i] * unitShare + 0;
    b.agcTrimMW = Math.max(-bDn, Math.min(0, req - toUnits)) + 0;
    return;
  }
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
 * C-6 (Phase 2a): while the dispatch is spilling wind or solar (ren.windAutoMW or solarAutoMW >
 * 0) a lowering request goes to the units first, each as far as its MIN (beyond its regulating
 * band), and only the rest to the battery's band (agcCycle); a raising request, and every request
 * on a second with nothing spilled, is shared pro rata within the bands as before. While
 * agc.unmetMW is NEGATIVE (the lowering bands of the units and the battery are spent and the
 * frequency is still high) dispatchSecond spills that request as wind and solar, in a surplus.
 * Reads (Phase 2a, besides README §11): ren.{windAutoMW, solarAutoMW}.
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

// ------------------------------------------------------------------ automatic curtailment (C-6)
//
// Phase 2a (desk/README.md §18 C-6): in the belly the must-run fleet, wind and utility solar can
// exceed what the city, the tie and the battery take. The dispatch then holds wind and solar
// back by itself, as NEMDE dispatches semi-scheduled plant down through the semi-dispatch cap:
// feed-forward from the second's own numbers (so it needs no AGC and works in HAND), plus, in
// a surplus, AGC's unmet lowering request (what the units' and the battery's bands could not
// carry while the frequency is still high), so a stale plan cannot push the grid to 52 Hz. It
// never moves the tie (the plan's) or the battery (the player's). The feed-forward cut assumes
// every unit at its floor, so while it is spilling AGC brings the units there before it uses the
// battery (agcCycle): an idle battery does not fill while a unit has room above MIN. Once every
// unit is at MIN and every MW of wind and solar is held back (must-run above demand: MSL3), AGC's
// lowering band on the battery is all that is left and it does charge it (the contract's order:
// "after the units' and the battery's bands"; measured 210 MW in a 210-MW deep belly).
// Labelled in SPEC §8.2 "The dispatch spills wind and solar automatically, pro rata."

/** Wind (after the manual LIMIT and OFGS) and utility solar (after the manual LIMIT) this second, before the automatic cut. */
function renOutMW(state) {
  const env = state.env, ren = state.ren;
  return (env.windAvailMW - ren.windCurtMW) * (1 - state.ofgs.trippedFrac) + (env.solarAvailMW - ren.solarCurtMW);
}

/**
 * The feed-forward surplus (C-6), MW: must-run + wind and utility solar (renOutMW) - what takes
 * it. Must-run is the price stack's floor blocks (MIN of every unit 'on': 0 for hydro; the
 * present output of a unit loading, unloading or shutting down, H-1) plus reserve diesel on
 * line (out of market, but as real). What takes it is the market demand with the tie and the
 * battery order as they are: lit operational demand + cold load - DR - tie flow - the battery's
 * scheduled output on its ORDER (battOnOrderMW). Positive: that much must be spilled even with
 * every unit at its floor.
 */
function surplusMW(state) {
  const units = state.units, city = state.city;
  let floor = state.rert.outMW;
  for (let i = 0; i < N; i++) {
    const u = units[i];
    if (u.mode === 'on') floor += M[i].minMW; else if (u.sync) floor += u.schedMW;
  }
  return floor + renOutMW(state) - (fleet.litDemandMW(state) + city.coldLoadMW - state.dr.mw - state.tie.flowMW - battOnOrderMW(state.battery));
}

/**
 * The battery's scheduled output without AGC's trim (C-6): schedMW - agcTrimMW, kept between the
 * schedule and where the order alone would take it (exact while either the order or the trim is
 * steady). The feed-forward counts the player's order only: if it counted the trim too, a trim
 * AGC once gave the battery would be matched by less curtailment and never come back, and an
 * idle battery would fill by itself with the plan at MIN (charging at a negative price is the
 * player's decision).
 */
function battOnOrderMW(b) {
  const lim = Math.max(0, BATT_MW - b.guardMW);
  const onOrder = clamp(battOrderMW(b, lim), -Math.min(lim, chargeCapMW(b)), Math.min(lim, dischargeCapMW(b)));
  const s = b.schedMW;
  return clamp(s - b.agcTrimMW, Math.min(onOrder, s), Math.max(onOrder, s));
}

/**
 * AGC's unmet lowering request (C-6), MW >= 0: while agc.unmetMW is negative (at AGC's last cycle
 * every lowering band of the units and the battery was spent and the frequency was still high),
 * the ACE of the second just completed, AGC_BIAS_MW_PER_HZ x (last.fMeanHz - F0) beyond AGC's
 * deadband. It is read every second, not held for the 4-s AGC cycle: held, the term overshoots
 * inside the governors' deadband, where nothing else damps it, and hunts against AGC's own
 * raise (measured with the six units at MIN and the battery charging on its whole inverter, so
 * AGC has no lowering band: a 12-s cycle of 49.970-50.022 Hz held, 49.994-50.014 Hz read every
 * second; it is smaller, not gone: agc.unmetMW still flickers negative there for about a third
 * of the seconds, 4 s at a time). It goes away as the frequency comes back,
 * and AGC LIMIT stays lit meanwhile: the plan is stale, or the units AGC has asked to come down
 * are still ramping. 0 in HAND (no AGC).
 * dispatchSecond adds it to the cut only while there is a surplus by the floor blocks: outside
 * one, AGC at its lowering limit means the plan holds units above what is needed, they have
 * governor room, and the remedy is the plan, not spilling wind while gas runs above minimum
 * (measured on classic par days, added unconditionally: seed 17 spilled wind for 908 s around
 * midnight with thirteen units 1,400 MW above their minimums).
 */
function agcSpillMW(state) {
  if (!(state.agc.unmetMW < 0)) return 0;
  const dev = state.last.fMeanHz - F0;
  return dev > AGC_DB ? AGC_BIAS * dev : 0;
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
 *   ren: windCurtMW moves toward env.windAvailMW x (100 - windLimitPct) / 100 at the curtailment
 *     ramp, solarCurtMW likewise (the manual LIMIT). rert.outMW ramps at RERT_RAMP_MW_MIN once
 *     the lead is over (and out when standing down, then disarms); dr.mw = DR_MW for
 *     DR_DURATION_S from the call.
 *   automatic curtailment (C-6, Phase 2a; last, on this second's schedules): while surplusMW > 0
 *     the cut = min(wind after the LIMIT and OFGS + solar after the LIMIT, surplusMW + AGC's
 *     unmet lowering request), else 0; windAutoMW and solarAutoMW move toward their pro-rata
 *     share of it (by present output) at CURTAIL_RAMP_FRAC_MIN, and back to 0 as the surplus
 *     goes; then windMW = available - windCurtMW - windAutoMW, solarMW likewise (physics applies
 *     OFGS to wind).
 *     surplusMW = must-run (the stack's floor blocks, and reserve diesel on line) + that wind and
 *     solar - (lit operational demand + cold load - DR - tie flow - the battery's schedule). The
 *     tie and the battery are never moved to make room. Works in HAND (the feed-forward term
 *     needs no AGC; levers held above MIN are the player's to lower). While a cut is active it
 *     is a cap on OUTPUT: a change of availability lands on the held MW first, either way.
 * Reads (Phase 2a, besides README §11): env.rooftopMW, city.{roofOffMW, coldLoadMW}, agc.unmetMW,
 * last.fMeanHz, ofgs.trippedFrac. Writes: ren.{windAutoMW, solarAutoMW} (and windMW, solarMW
 * after the cut).
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

  // Renewables, the manual LIMIT: the curtailed MW (available minus the LIMIT) move at the
  // curtailment ramp (integration, CURTAIL_RAMP_FRAC_MIN); the weather passes straight through.
  // ren.windMW and ren.solarMW are set at the end, after the automatic cut (C-6).
  const ren = state.ren;
  ren.windCurtMW = curtailedMW(ren.windCurtMW, env.windAvailMW, ren.windLimitPct, WIND_CURT_STEP);
  ren.solarCurtMW = curtailedMW(ren.solarCurtMW, env.solarAvailMW, ren.solarLimitPct, SOLAR_CURT_STEP);

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

  // C-6, last, on this second's schedules: in a surplus the cut is the feed-forward surplus plus
  // AGC's unmet lowering request, never more than is generating; shared pro rata by present
  // output (wind after OFGS; windAutoMW itself is stored before OFGS, as windCurtMW is), each
  // part moving at the manual LIMIT's ramp and never above what its LIMIT leaves. With no
  // surplus both go to 0 (and stay exactly 0 on a day that never has one).
  // The cut is a cap on output, as the semi-dispatch cap is, in both directions (heldMW): MW the
  // weather takes away from a plant that is held back come out of what is held back first (a
  // cloud over a curtailed solar farm is not a loss of supply), and MW the weather gives it are
  // held back too until the cut releases them at its ramp (a gust is not a step of supply).
  const windLeft = env.windAvailMW - ren.windCurtMW, solarLeft = env.solarAvailMW - ren.solarCurtMW;
  const connected = 1 - state.ofgs.trippedFrac, renOut = windLeft * connected + solarLeft;
  const surplus = surplusMW(state);
  const cut = surplus > 0 ? Math.min(renOut, surplus + agcSpillMW(state)) : 0;
  const cutFrac = cut > 0 ? cut / renOut : 0;
  ren.windAutoMW = clamp(toward(heldMW(ren.windAutoMW, windLeft, ren.windMW), connected > 0 ? windLeft * cutFrac : 0, WIND_CURT_STEP), 0, windLeft) + 0;
  ren.solarAutoMW = clamp(toward(heldMW(ren.solarAutoMW, solarLeft, ren.solarMW), solarLeft * cutFrac, SOLAR_CURT_STEP), 0, solarLeft) + 0;
  ren.windMW = windLeft - ren.windAutoMW + 0;
  ren.solarMW = solarLeft - ren.solarAutoMW + 0;
}

/**
 * MW held back by the automatic cut when `leftMW` is available now (after the manual LIMIT) and
 * the plant put out `outMW` last second: while a cut is active the plant's OUTPUT is what is held
 * (the cap is on output), so a change of availability lands on the held MW, in either direction,
 * and the cut then moves from there at its ramp. 0 when no cut is active.
 */
function heldMW(autoMW, leftMW, outMW) {
  return autoMW > 0 ? clamp(leftMW - outMW, 0, leftMW) : 0;
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
 * x max(0, 1 - (s - restoredAtS) / COLD_LOAD_DECAY_S) (surgeMW set to 0 once decayed), the
 * rooftop off with dark or reconnecting districts (P-12, Phase 2a: fleet.refreshRoof, on this
 * second's env.roofSubMW) and the active contingency's backInBandTick: the first tick of the
 * first completed second after the trip whose fMinHz and fMaxHz both lie inside the normal band.
 * A `shed` record's mw is the district's NET load (fleet.districtColdLoadMW of a lit district).
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
  fleet.refreshRoof(state); // P-12 (Phase 2a): the rooftop off with dark or reconnecting districts, on this second's env

  if (state.contIdx >= 0) {
    const c = state.conts[state.contIdx];
    const prevStart = (s - 1) * TPS;
    if (c.backInBandTick < 0 && prevStart >= c.startTick && last.fMinHz >= NORMAL_LO && last.fMaxHz <= NORMAL_HI) {
      c.backInBandTick = prevStart;
    }
  }
}

// ------------------------------------------------------------------ security (H-4)

// The two credible contingencies (H-4, A-2): the largest synchronised machine by output (ties to
// the lower index, as fleet.largestContingency) and the tie import. Scratch, overwritten per call.
// pvLinkMW: the import the link preview needs to run for. A link trip of no more MW than the
// largest unit is never deeper than that unit's trip (it removes no inertia and no governor;
// measured in the Phase 1a sim pass: deeper in 0 of 3,578 par-day states), so with
// N1_PREVIEW_ALL the link is previewed only while it imports more than the largest unit
// outputs, and previewLinkHz otherwise carries the unit's nadir as its bound.
// headMW: the primary response the fleet holds now (Σ over 'on' units of governor headroom up to
// the governor cap, plus the battery charge an under-frequency would suspend, H-10): a cached
// preview is re-run when it moved more than PREVIEW_L_TOL_MW (Phase 1a; see securitySecond).
const CR = {unitId: '', unitMW: 0, linkMW: 0, pvLinkMW: 0, headMW: 0};
function credible(state) {
  let id = '', mw = 0;
  const units = state.units;
  for (let i = 0; i < N; i++) { const u = units[i]; if (u.sync && u.outMW > mw) { id = u.id; mw = u.outMW; } }
  const t = state.tie;
  CR.unitId = id; CR.unitMW = mw; CR.linkMW = !t.tripped && t.flowMW > 0 ? t.flowMW : 0;
  CR.pvLinkMW = CR.linkMW > 0 && (id === '' || CR.linkMW > mw) ? CR.linkMW : 0;
  let head = 0;
  for (let i = 0; i < N; i++) {
    const u = units[i];
    if (u.mode === 'on') head += Math.min(M[i].govCapMW, Math.max(0, u.availMW - u.schedMW));
  }
  const b = state.battery.schedMW;
  CR.headMW = head + (b < 0 ? -b : 0);
}

const previewUnit = (state, id) => previewTrip(state, {kind: 'unit', id}).nadirHz;
const previewLink = state => previewTrip(state, {kind: 'link', id: 'tie'}).nadirHz;

/**
 * Refresh state.sec from security(state). The previews (physics.previewTrip) are re-run when ANY
 * of: sec.dirty (set by every accepted input, fleet.setSync, trips, the plan executor); the
 * previewed contingency changed (N1_PREVIEW_ALL: the largest unit's id, or either contingency's
 * MW moved more than PREVIEW_L_TOL_MW; otherwise L's id or MW, as before A-2); the frequency has
 * moved more than PREVIEW_F_TOL_HZ from sec.previewFHz (the preview starts from the present
 * frequency and governor state); or PREVIEW_REFRESH_S have passed since sec.previewAtS. With
 * N1_PREVIEW_ALL (A-2) both credible contingencies are previewed: the largest unit and the tie
 * import (when importing); sec.previewUnitHz / previewLinkHz hold them (49.5 Hz and up is
 * contained) and previewNadirHz, lKind, lId, previewLId and previewLMW name the worse one (ties to
 * the unit). Otherwise the cached nadirs are reused (security(state, {previewUnitHz,
 * previewLinkHz, previewAgeS})). Emits a log line when the level changes.
 */
export function securitySecond(state, out) {
  const s = secondOf(state), sec = state.sec;
  const L = fleet.largestContingency(state);
  credible(state);
  const f = state.phys.fHz;
  const moved = N1_ALL
    ? CR.unitId !== sec.pvUnitId || Math.abs(CR.unitMW - sec.pvUnitMW) > PREVIEW_L_TOL || Math.abs(CR.pvLinkMW - sec.pvLinkMW) > PREVIEW_L_TOL
    : L.id !== sec.previewLId || Math.abs(L.mw - sec.previewLMW) > PREVIEW_L_TOL;
  if (sec.dirty || sec.previewAtS < 0 || moved || Math.abs(CR.headMW - sec.pvHeadMW) > PREVIEW_L_TOL || Math.abs(f - sec.previewFHz) > PREVIEW_F_TOL || s - sec.previewAtS >= PREVIEW_REFRESH_S) {
    const unitId = CR.unitId, unitMW = CR.unitMW, linkMW = CR.linkMW, pvLink = CR.pvLinkMW;
    sec.previewUnitHz = unitId !== '' && (N1_ALL || L.kind === 'unit') ? previewUnit(state, unitId) : F0;
    sec.previewLinkHz = N1_ALL ? (pvLink > 0 ? previewLink(state) : linkMW > 0 ? sec.previewUnitHz : F0)
      : linkMW > 0 && L.kind === 'link' ? previewLink(state) : F0;
    sec.pvUnitId = unitId; sec.pvUnitMW = unitMW; sec.pvLinkMW = pvLink; sec.pvHeadMW = CR.headMW;
    sec.previewAtS = s;
    sec.previewFHz = f;
    sec.dirty = false;
    const r0 = security(state, {previewUnitHz: sec.previewUnitHz, previewLinkHz: sec.previewLinkHz});
    sec.previewLId = N1_ALL ? r0.lId : L.id;
    sec.previewLMW = N1_ALL ? r0.riskMW : L.mw;
  }
  const r = security(state, {previewUnitHz: sec.previewUnitHz, previewLinkHz: sec.previewLinkHz, previewAgeS: s - sec.previewAtS});
  const before = sec.level;
  sec.r5MW = r.r5MW;
  sec.lMW = r.lMW;
  sec.lKind = r.lKind;
  sec.lId = r.lId;
  sec.ratio = r.ratio;
  sec.previewNadirHz = r.previewNadirHz;
  sec.level = r.level;
  if (r.level !== before) {
    log(state, out, SEV[r.level], 'SECURITY', 'SECURITY ' + r.level + ': spare in 5 min ' + Math.round(r.r5MW) + ' MW, biggest risk ' +
      (r.lKind === 'none' ? 'none' : r.lId + ' ' + Math.round(r.riskMW) + ' MW') + ', trip preview ' + r.previewNadirHz.toFixed(2) + ' Hz.');
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
 *   L  = fleet.largestContingency(state): lMW is the larger MW (the R5 test, ratio, the P-7 x)
 *   ratio = R5 / L, capped at SEC_RATIO_MAX (finite when L is 0)
 *   previews (A-2, N1_PREVIEW_ALL): the largest unit (previewUnitHz) and the tie import
 *          (previewLinkHz, when importing); lKind / lId / previewNadirHz / riskMW name the worse
 *          one, ties to the unit ("BIGGEST RISK", K-10). Without N1_PREVIEW_ALL: L's preview only.
 *   level: 'SHEDDING' if city.shedFrac > 0; 'SHORT' if R5 < L; 'TIGHT' if R5 < SECURE_RATIO*L
 *          or previewNadirHz < SECURE_NADIR_HZ + PREVIEW_MARGIN_HZ (with N1_PREVIEW_ALL: either
 *          preview); else 'SECURE' (the margin covers what the frozen-schedule preview cannot see:
 *          H-8 containment, tuning pass), plus PREVIEW_AGE_MARGIN_HZ_S x opts.previewAgeS for a
 *          cached preview.
 * @param {object} state
 * @param {{previewUnitHz?:number, previewLinkHz?:number, previewNadirHz?:number, previewAgeS?:number}} [opts]
 *   reuse cached previews instead of running physics.previewTrip (previewNadirHz alone: one value
 *   for both, and L by MW is named, the Phase 0.2 form); previewAgeS: their age in grid seconds
 * @returns {{r5MW:number, lMW:number, lKind:string, lId:string, riskMW:number, ratio:number, previewNadirHz:number,
 *   previewUnitHz:number, previewLinkHz:number, level:string}}
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
  credible(state);
  const unitId = CR.unitId, unitMW = CR.unitMW, linkMW = CR.linkMW;
  let unitHz, linkHz, legacy = false;
  if (opts && typeof opts.previewUnitHz === 'number') {
    unitHz = opts.previewUnitHz; linkHz = opts.previewLinkHz;
  } else if (opts && typeof opts.previewNadirHz === 'number') {
    unitHz = linkHz = opts.previewNadirHz; legacy = true;
  } else {
    unitHz = unitId !== '' && (N1_ALL || L.kind === 'unit') ? previewUnit(state, unitId) : F0;
    linkHz = N1_ALL ? (CR.pvLinkMW > 0 ? previewLink(state) : linkMW > 0 ? unitHz : F0)
      : linkMW > 0 && L.kind === 'link' ? previewLink(state) : F0;
  }
  let kind = L.kind, id = L.id, riskMW = L.mw, nadir;
  if (N1_ALL && !legacy) {
    if (unitId !== '' && (linkMW <= 0 || unitHz <= linkHz)) { kind = 'unit'; id = unitId; riskMW = unitMW; nadir = unitHz; }
    else if (linkMW > 0) { kind = 'link'; id = 'tie'; riskMW = linkMW; nadir = linkHz; }
    else { kind = 'none'; id = ''; riskMW = 0; nadir = F0; }
  } else {
    nadir = L.kind === 'unit' ? unitHz : L.kind === 'link' ? linkHz : F0;
  }
  const cached = opts && (typeof opts.previewUnitHz === 'number' || legacy);
  const needHz = SECURE_NADIR + (cached && opts.previewAgeS > 0 ? AGE_MARGIN * opts.previewAgeS : 0);
  const ratio = L.mw > 0 ? Math.min(SEC_RATIO_MAX, r5 / L.mw) : SEC_RATIO_MAX;
  const level = state.city.shedFrac > 0 ? 'SHEDDING'
    : r5 < L.mw ? 'SHORT'
      : r5 < SECURE_RATIO * L.mw || nadir < needHz ? 'TIGHT' : 'SECURE';
  return {r5MW: r5, lMW: L.mw, lKind: kind, lId: id, riskMW, ratio, previewNadirHz: nadir, previewUnitHz: unitHz, previewLinkHz: linkHz, level};
}

// ------------------------------------------------------------------ the plan (Phase 1a: L-0, L-4, L-6, K-2)
//
// state.plan (desk/README.md §3.1, sim/README.md §5): per station arrive-by keyframes {atS, mw}
// (the lever should ARRIVE at mw by atS), the tie's keys, and booked STARTs and STOPs. The
// executor (planSecond) runs each grid second right after events.applyDue. A key applies once
// (doneS = its atS), through the basePoint path (equal shares, clamped to the station's range),
// at the last second from which the station's ramp still reaches it by atS, or at once when
// atS has passed (only the latest past key). Private per station: clampOn (the on-line count
// when the last key applied) and lastMW (that key's MW), for the one re-apply after a clamp.
//
// A key of 0 MW is "the lever to its floor" (Σ MIN; hydro: gates shut). The STOP that makes a
// layer dragged to 0 end is an explicit booking in plan.stops (planKey books it), so a hydro wheel
// turned to 0 never stops the machines, and the Live Stack draws stops from plan.stops.

const SIDS = V.STATION_IDS, NS = SIDS.length, ROWS = SIDS.map(id => V.STATIONS[id]);
const SIDX = {};
for (let j = 0; j < NS; j++) SIDX[SIDS[j]] = j;
const PLAN_KEEP_S = V.PLAN_HISTORY_S, DAY_S = V.DAY_S;

/** An empty plan (createState). */
export function newPlan() {
  return {madeAtS: -1, rev: 0,
    stations: SIDS.map(id => ({id, man: false, doneS: -1, clampedMW: 0, keys: [], clampOn: 0, lastMW: 0})),
    tie: {doneS: -1, keys: []}, starts: [], stops: []};
}

// Station j now (scratch, overwritten per call): machines 'on', their summed ramp, MIN and available MW.
const NOW = {onCount: 0, rampMWs: 0, minMW: 0, maxMW: 0};
function stationNow(state, j) {
  const row = ROWS[j], units = state.units;
  let n = 0, r = 0, mn = 0, mx = 0;
  for (let i = row.first; i < row.first + row.count; i++) {
    const u = units[i];
    if (u.mode !== 'on') continue;
    n++; r += M[i].rampMWs; mn += M[i].minMW; mx += u.availMW;
  }
  NOW.onCount = n; NOW.rampMWs = r; NOW.minMW = mn; NOW.maxMW = mx;
}

/**
 * The basePoint path: every 'on' machine of the station gets an equal share (fleet.setBasePoint
 * clamps each to [minMW, availMW], so the lever is clamp(mw, Σmin, Σavail)); 0 if none is on.
 * Returns the lever applied.
 */
function setLever(state, id, mw) {
  const row = V.STATIONS[id];
  let n = 0;
  for (let i = row.first; i < row.first + row.count; i++) if (state.units[i].mode === 'on') n++;
  if (n > 0) for (let i = row.first; i < row.first + row.count; i++) if (state.units[i].mode === 'on') fleet.setBasePoint(state, i, mw / n);
  return fleet.refreshLever(state, id) + 0;
}

/** Insert key into sorted keys (replacing one at the same atS). */
function insertKey(keys, key) {
  let k = 0;
  while (k < keys.length && keys[k].atS < key.atS) k++;
  if (k < keys.length && keys[k].atS === key.atS) keys[k] = key; else keys.splice(k, 0, key);
}

/** After inserting a key at a: if it lies at or before the last applied key, the executor must consider it. */
function reopenAt(ps, a) {
  if (ps.doneS < a) return;
  let last = -1;
  for (const k of ps.keys) if (k.atS < a) last = k.atS;
  ps.doneS = last >= 0 ? last : a - 1;
}

/**
 * A lever (or tie) move writes the plan (§3.2; L-6 "exactly one keyframe, at the earliest
 * ramp-feasible time"): keys from now to the arrival, and the move in flight (keys up to the last
 * applied one), are dropped; {arrival, mw} is inserted and counts as applied. Later keys stay.
 */
function leverKey(state, ps, s, mw, leadS, onCount) {
  const arrival = s + Math.max(0, Math.ceil(leadS - EPS));
  const kept = [];
  for (const k of ps.keys) if (k.atS < s || (k.atS > arrival && k.atS > ps.doneS)) kept.push(k);
  insertKey(kept, {atS: arrival, mw});
  ps.keys = kept;
  ps.doneS = arrival;
  if (onCount > 0) { ps.clampedMW = 0; ps.lastMW = mw; ps.clampOn = onCount; }
}

/** Run the bookings of list (sorted by atS) due at s through the input path; a refused one is dropped with a PLAN log line. */
function runBookings(state, list, type, s, out) {
  while (list.length !== 0 && list[0].atS <= s) {
    const b = list.shift();
    const why = applyCommand(state, {type, unit: b.unit}, out);
    if (why) log(state, out, 'warn', 'PLAN', 'PLAN: ' + type.toUpperCase() + ' ' + nameOf(fleet.unitIndex(b.unit)) + ' dropped: ' + why + '.');
  }
  state.sec.dirty = true;
}

/** The executor for station j (not MAN). Returns true if it changed the plan's bookkeeping. */
function stationPlanSecond(state, j, ps, s) {
  const keys = ps.keys;
  let k = 0;
  while (k < keys.length && keys[k].atS <= ps.doneS) k++;
  const reapply = ps.clampedMW > 0;
  if (k === keys.length && !reapply) return false;
  stationNow(state, j);
  const id = SIDS[j];
  let changed = false;
  if (reapply && NOW.onCount > ps.clampOn) { // a machine joined since the key was clamped: once more
    const applied = setLever(state, id, ps.lastMW);
    ps.clampedMW = Math.max(0, ps.lastMW - applied) + 0;
    ps.clampOn = NOW.onCount;
    state.sec.dirty = true;
    changed = true;
  }
  if (k === keys.length) return changed;
  let key = keys[k];
  let due = key.atS <= s;
  if (!due && NOW.onCount > 0 && NOW.rampMWs > 0) {
    const target = clamp(key.mw, NOW.minMW, NOW.maxMW);
    due = s + Math.abs(target - state.stations[j].basePointMW) / NOW.rampMWs >= key.atS;
  }
  if (!due) return changed;
  while (k + 1 < keys.length && keys[k + 1].atS <= s) key = keys[++k]; // only the latest past key
  const applied = setLever(state, id, key.mw);
  ps.doneS = key.atS;
  ps.clampedMW = Math.max(0, key.mw - applied) + 0;
  ps.clampOn = NOW.onCount;
  ps.lastMW = key.mw;
  state.sec.dirty = true;
  return true;
}

function tiePlanSecond(state, s) {
  const tp = state.plan.tie, keys = tp.keys, t = state.tie;
  let k = 0;
  while (k < keys.length && keys[k].atS <= tp.doneS) k++;
  if (k === keys.length) return false;
  let key = keys[k];
  if (!(key.atS <= s || s + Math.abs(key.mw - t.setMW) / TIE_STEP >= key.atS)) return false;
  while (k + 1 < keys.length && keys[k + 1].atS <= s) key = keys[++k];
  t.setMW = key.mw;
  tp.doneS = key.atS;
  state.sec.dirty = true;
  return true;
}

/**
 * The plan's executor, once per grid second right after events.applyDue (desk/README.md §3.1):
 * booked STOPs, then STARTs, due now (through the input path; a refused one is dropped with a
 * `log` record, code 'PLAN'); keys older than PLAN_HISTORY_S dropped; each station not MAN
 * (HAND) applies its next arrive-by key when due, and re-applies a clamped key once more when a
 * machine joined; the tie's keys set tie.setMW the same way at TIE_RAMP_MW_MIN. plan.rev += 1
 * when anything changed.
 */
export function planSecond(state, out) {
  const P = state.plan, s = secondOf(state);
  let changed = false;
  if (P.stops.length !== 0 && P.stops[0].atS <= s) { runBookings(state, P.stops, 'stop', s, out); changed = true; }
  if (P.starts.length !== 0 && P.starts[0].atS <= s) { runBookings(state, P.starts, 'start', s, out); changed = true; }
  const old = s - PLAN_KEEP_S;
  for (let j = 0; j < NS; j++) {
    const ps = P.stations[j];
    if (ps.keys.length !== 0 && ps.keys[0].atS < old) { while (ps.keys.length !== 0 && ps.keys[0].atS < old) ps.keys.shift(); changed = true; }
    if (!ps.man && stationPlanSecond(state, j, ps, s)) changed = true;
  }
  const tk = P.tie.keys;
  if (tk.length !== 0 && tk[0].atS < old) { while (tk.length !== 0 && tk[0].atS < old) tk.shift(); changed = true; }
  if (tiePlanSecond(state, s)) changed = true;
  if (changed) P.rev += 1;
}

// ---- projections for plan edits (inputs only; they may allocate)

const bookingOf = (list, unit) => { for (const b of list) if (b.unit === unit) return b; return null; };

/** Seconds from START to MIN for machine i now (auto-sync counted in AGC mode only; HAND closes by hand). */
const startToMinS = (state, i) => M[i].t1S + (state.control.mode === 'AGC' ? AUTO_SYNC_S : 0) + M[i].t2S;

/** The grid second machine i is (or will be) 'on', from its mode and its booked start; -1 if not coming. */
function onAtS(state, i, s) {
  const u = state.units[i], m = M[i], auto = state.control.mode === 'AGC';
  switch (u.mode) {
    case 'on': return s;
    case 'loading': return s + u.timerS;
    case 'ready': return s + (auto && state.scope.unit !== u.id ? u.timerS : 0) + m.t2S;
    case 'starting': return s + u.timerS + (auto ? AUTO_SYNC_S : 0) + m.t2S;
    default: {
      const b = bookingOf(state.plan.starts, u.id);
      return b ? b.atS + startToMinS(state, i) : -1;
    }
  }
}

/** The earliest grid second >= s machine i (off or tripped) could START, or -1 (no water). */
function startFreeAt(state, i, s) {
  const u = state.units[i], m = M[i];
  if (m.station === 'hydro' && state.hydro.storageMWh <= HYDRO_STOP_MWH) return -1;
  if (u.mode === 'tripped') return s + u.timerS;
  if (u.mode !== 'off') return -1;
  return u.downWhy !== 'trip' ? Math.max(s, u.downSinceS + m.minDownS) : s;
}

/** Station j's machines on by grid second t (their MIN, rating and ramp summed), with `extra` a start booked but not yet stored. */
function project(state, j, t, s, extra) {
  const row = ROWS[j], on = [];
  let minMW = 0, maxMW = 0, rampMWs = 0;
  for (let i = row.first; i < row.first + row.count; i++) {
    const id = M[i].id;
    const at = extra !== null && extra.unit === id ? extra.atS + startToMinS(state, i) : onAtS(state, i, s);
    if (at < 0 || at > t) continue;
    const st = bookingOf(state.plan.stops, id);
    if (st !== null && st.atS <= t) continue;
    on.push({i, at});
    minMW += M[i].minMW; maxMW += M[i].ratingMW; rampMWs += M[i].rampMWs;
  }
  return {n: on.length, minMW, maxMW, rampMWs, on};
}

/** Put booking b in list (sorted by atS, then unit), replacing the unit's earlier booking there. */
function book(list, b) {
  for (let k = 0; k < list.length; k++) if (list[k].unit === b.unit) { list.splice(k, 1); break; }
  let k = 0;
  while (k < list.length && (list[k].atS < b.atS || (list[k].atS === b.atS && list[k].unit < b.unit))) k++;
  list.splice(k, 0, b);
}

const stationName = id => V.STATIONS[id].name;

/**
 * planKey {station, atS, mw} (§3.2; L-4, L-6): insert or replace the key at atS, rewritten to
 * what can happen: atS up to the earliest time the station's ramp reaches mw from the previous
 * key (or from the lever now), counting machines joining at MIN on the way; mw into [Σmin,
 * Σrating] of the machines on or booked on by then. With none on or booked and mw > 0 the first
 * machine free to start is booked so that it reaches MIN at its start time and climbs to mw by
 * atS (atS moves later if that start is past). mw 0: the lever to MIN by atS, then a STOP of every
 * machine on by then, booked at atS.
 */
function planKey(state, cmd, s, out) { // eslint-disable-line no-unused-vars
  const id = cmd.station, j = SIDX[id], ps = state.plan.stations[j], row = ROWS[j];
  let a = cmd.atS;
  if (a < s) return 'that time has passed';
  // The rewrite is a fixed point in a (it only moves later), and every choice in it (booking a
  // start, the previous key, the machines on) is made from the current a, so the logged
  // (rewritten) key rewrites to itself on replay (F-6: canonical logs).
  let extra = null, pj = null, target = 0, done = false;
  for (let it = 0; it < ps.keys.length + row.count + NS && !done; it++) {
    extra = null;
    pj = project(state, j, a, s, null);
    if (pj.n === 0) {
      if (!(cmd.mw > 0)) return 'no ' + stationName(id) + ' machine is on or booked by then';
      let pick = -1, free = 0;
      for (let i = row.first; i < row.first + row.count; i++) { // (a later booked START is moved earlier)
        const f = startFreeAt(state, i, s);
        if (f >= 0) { pick = i; free = f; break; }
      }
      if (pick < 0) return 'no ' + stationName(id) + ' machine can start';
      const m = M[pick];
      const climb = Math.max(0, Math.ceil((clamp(cmd.mw, m.minMW, m.ratingMW) - m.minMW) / m.rampMWs - EPS));
      const lead = startToMinS(state, pick) + climb;
      const at = Math.max(a - lead, free);
      a = at + lead;
      extra = {unit: m.id, atS: at};
      pj = project(state, j, a, s, extra);
    }
    target = cmd.mw > 0 ? clamp(cmd.mw, pj.minMW, pj.maxMW) : pj.minMW;
    let tp = s, mp = state.stations[j].basePointMW;
    for (const k of ps.keys) if (k.atS >= s && k.atS < a) { tp = k.atS; mp = k.mw; }
    let base = mp, tB = tp;
    for (const o of pj.on) if (o.at > tp) { base += M[o.i].minMW; if (o.at > tB) tB = o.at; }
    const need = pj.rampMWs > 0 ? tB + Math.max(0, Math.ceil(Math.abs(target - base) / pj.rampMWs - EPS)) : tB;
    if (need <= a) done = true; else a = need;
  }
  if (!done) return 'no time the ramp can reach it';
  if (a > DAY_S) return 'that cannot happen before the day ends';
  const mw = cmd.mw > 0 ? target + 0 : 0;
  insertKey(ps.keys, {atS: a, mw});
  reopenAt(ps, a);
  if (extra !== null) book(state.plan.starts, extra);
  if (mw === 0) for (const o of pj.on) book(state.plan.stops, {unit: M[o.i].id, atS: a});
  cmd.atS = a;
  cmd.mw = mw;
  state.plan.rev += 1;
  return '';
}

/** planDel {station, atS}: remove the key at exactly atS (and any STOP of the station booked at that second). */
function planDel(state, cmd, s) {
  if (cmd.atS < s) return 'that keyframe is in the past';
  const ps = state.plan.stations[SIDX[cmd.station]];
  const k = ps.keys.findIndex(x => x.atS === cmd.atS);
  if (k < 0) return 'no keyframe there';
  ps.keys.splice(k, 1);
  const P = state.plan;
  P.stops = P.stops.filter(b => !(b.atS === cmd.atS && M[fleet.unitIndex(b.unit)].station === cmd.station));
  P.rev += 1;
  return '';
}

/** planStart {unit, atS}: book a START (replacing the unit's booking); the unit must be free to start by atS. */
function planStart(state, cmd, s) {
  if (cmd.atS < s) return 'that time has passed';
  const i = fleet.unitIndex(cmd.unit), u = state.units[i];
  if (u.mode !== 'off' && u.mode !== 'tripped') return 'unit is ' + u.mode;
  const free = startFreeAt(state, i, s);
  if (free < 0) return 'no water';
  if (free > cmd.atS) return (fleet.startBlock(state, i) || 'unit is ' + u.mode) + ' (free to start ' + minutes(free - s) + ' min from now)';
  book(state.plan.starts, {unit: cmd.unit, atS: cmd.atS});
  state.plan.rev += 1;
  return '';
}

/** planStop {unit, atS}: book a STOP (replacing the unit's booking); the unit must be committed or booked to start before atS. */
function planStop(state, cmd, s) {
  if (cmd.atS < s) return 'that time has passed';
  const u = state.units[fleet.unitIndex(cmd.unit)];
  const b = bookingOf(state.plan.starts, cmd.unit);
  const committed = u.mode === 'on' || u.mode === 'loading' || u.mode === 'starting' || u.mode === 'ready';
  if (!committed && !(b !== null && b.atS < cmd.atS)) return 'unit is ' + u.mode;
  book(state.plan.stops, {unit: cmd.unit, atS: cmd.atS});
  state.plan.rev += 1;
  return '';
}

/** planUnbook {unit}: remove the unit's booked START and STOP. */
function planUnbook(state, cmd) {
  const P = state.plan;
  const n = P.starts.length + P.stops.length;
  P.starts = P.starts.filter(b => b.unit !== cmd.unit);
  P.stops = P.stops.filter(b => b.unit !== cmd.unit);
  if (P.starts.length + P.stops.length === n) return 'nothing is booked for ' + nameOf(fleet.unitIndex(cmd.unit));
  P.rev += 1;
  return '';
}

/** planRejoin {station, keep} (HAND, L-6): the lever follows the plan again; keep re-anchors it at the present lever. */
function planRejoin(state, cmd, s) {
  if (state.control.mode !== 'HAND') return 'AGC levers always follow the plan (rejoin is for HAND)';
  const j = SIDX[cmd.station], ps = state.plan.stations[j];
  if (!ps.man) return 'the lever is following the plan';
  ps.man = false;
  if (cmd.keep) {
    const lever = state.stations[j].basePointMW;
    ps.keys = ps.keys.filter(k => k.atS <= ps.doneS || k.atS > s);
    insertKey(ps.keys, {atS: s, mw: lever});
    stationNow(state, j);
    ps.doneS = s; ps.clampedMW = 0; ps.lastMW = lever; ps.clampOn = NOW.onCount;
  }
  state.plan.rev += 1;
  return '';
}

/**
 * planLoad {fromS, stations, tie, starts, stops}: replace every plan entry with atS >= fromS by
 * the lists given (step.js has checked their shape and order); MAN flags clear; madeAtS = now. A
 * key the executor had already applied at or after fromS is superseded (doneS moves back).
 */
function planLoad(state, cmd, s) {
  const from = cmd.fromS;
  if (from < s) return 'fromS is in the past';
  const late = list => list.some(e => (typeof e[0] === 'number' ? e[0] : e[1]) < from);
  for (const id of SIDS) if (late(cmd.stations[id])) return 'every entry must be at or after fromS';
  if (late(cmd.tie) || late(cmd.starts) || late(cmd.stops)) return 'every entry must be at or after fromS';
  const P = state.plan;
  for (let j = 0; j < NS; j++) {
    const ps = P.stations[j];
    ps.keys = ps.keys.filter(k => k.atS < from).concat(cmd.stations[SIDS[j]].map(e => ({atS: e[0], mw: e[1]})));
    if (ps.doneS >= from) ps.doneS = from - 1;
    ps.man = false;
  }
  P.tie.keys = P.tie.keys.filter(k => k.atS < from).concat(cmd.tie.map(e => ({atS: e[0], mw: e[1]})));
  if (P.tie.doneS >= from) P.tie.doneS = from - 1;
  P.starts = P.starts.filter(b => b.atS < from).concat(cmd.starts.map(e => ({unit: e[0], atS: e[1]})));
  P.stops = P.stops.filter(b => b.atS < from).concat(cmd.stops.map(e => ({unit: e[0], atS: e[1]})));
  P.madeAtS = s;
  P.rev += 1;
  return '';
}

// ------------------------------------------------------------------ K-12 synchroscope (Phase 1a)
//
// A unit reaching full speed ('ready') gets a slip from the PLAY stream (magnitude SYNC_SLIP_MIN..
// MAX_HZ, either sign) and a phase angle; slip = machine - grid (+ = machine fast = needle
// clockwise). The slip is piecewise linear (a trim moves it to its new target over SYNC_TRIM_S),
// so the angle is its exact integral (syncAt): no per-tick state, no transcendental Math.

const DT = V.PHYS_DT, DEG = V.DEG_PER_TURN, HALF_TURN = DEG / 2;
const TRIM_S = V.SYNC_TRIM_S, TRIM_TICKS = Math.round(TRIM_S * TPS);
const SLIP_MIN = V.SYNC_SLIP_MIN_HZ, SLIP_MAX = V.SYNC_SLIP_MAX_HZ, SLIP_LIMIT = V.SYNC_SLIP_LIMIT_HZ;
const BREAKER_TICKS = V.SYNC_BREAKER_TICKS, CLEAN_DEG = V.SYNC_CLEAN_DEG, ROUGH_DEG = V.SYNC_ROUGH_DEG;
const BLOCK_SLIP = V.SYNC_BLOCK_SLIP_HZ, REV_TRIP_S = V.SYNC_REVERSE_TRIP_S, BYPASS_LOCKOUT_S = V.SYNC_BYPASS_LOCKOUT_S;
const AUTO_SLIP = V.SYNC_AUTO_SLIP_HZ, ROUGH_MW = V.SYNC_ROUGH_MW;
const N1_ALL = V.N1_PREVIEW_ALL;

/** The sync-check relay's refusal (step.js adds the 'buzz' cue to the input record). */
export const SYNC_BLOCKED = 'blocked by sync-check relay';
/** Refusal reasons that carry a sound cue on the input record. */
export const REFUSAL_CUES = Object.freeze({[SYNC_BLOCKED]: 'buzz'});
const NOT_READY = 'unit is not at full speed waiting to synchronise';

/** An angle in degrees wrapped to [-180, 180). */
const wrapDeg = x => x - DEG * Math.floor((x + HALF_TURN) / DEG) + 0;

/**
 * Slip (Hz, + = machine fast) and phase angle (degrees, -180..180, 0 = in phase) of unit u's
 * machine against the grid at `tick`: exact for the piecewise-linear slip. Pure.
 * @returns {{slipHz:number, phaseDeg:number}}
 */
export function syncAt(u, tick) {
  const dt = (tick - u.slipAtTick) * DT, s0 = u.slipHz, s1 = u.slipToHz;
  let slip, turns;
  if (dt <= 0) { slip = s0; turns = 0; }
  else if (dt < TRIM_S) { const a = (s1 - s0) / TRIM_S; slip = s0 + a * dt; turns = s0 * dt + a * dt * dt / 2; }
  else { slip = s1; turns = (s0 + s1) / 2 * TRIM_S + s1 * (dt - TRIM_S); }
  return {slipHz: slip + 0, phaseDeg: wrapDeg(u.phaseAtDeg + DEG * turns)};
}

/** Restart the slip ramp from where it is now (before a new target). */
function reAnchor(u, tick) {
  const a = syncAt(u, tick);
  u.slipHz = a.slipHz;
  u.phaseAtDeg = a.phaseDeg;
  u.slipAtTick = tick;
}

/** K-12: the slip and angle a machine reaches full speed with (PLAY stream: player-dependent timing). */
function seedSlip(state, i) {
  const u = state.units[i], t = state.tick, seed = state.seed;
  const mag = SLIP_MIN + (SLIP_MAX - SLIP_MIN) * uniform(seed, STREAM.PLAY, t, i, 1);
  const sign = uniform(seed, STREAM.PLAY, t, i, 2) < 1 / 2 ? -1 : 1;
  u.slipHz = sign * mag + 0;
  u.slipToHz = u.slipHz;
  u.phaseAtDeg = uniform(seed, STREAM.PLAY, t, i, 1 + 2) * DEG - HALF_TURN + 0;
  u.slipAtTick = t;
  u.autoTick = -1;
}

/** scope.nextAutoTick = the earliest pending syncAuto close (units no longer 'ready' drop theirs). */
function refreshAutoTick(state) {
  let next = -1;
  for (const u of state.units) {
    if (u.autoTick < 0) continue;
    if (u.mode !== 'ready' || u.autoTick < state.tick) { u.autoTick = -1; continue; }
    if (next < 0 || u.autoTick < next) next = u.autoTick;
  }
  state.scope.nextAutoTick = next;
}

/** K-12 AUTO: trim the slip to +SYNC_AUTO_SLIP_HZ and close on the next pass through 0 degrees (the command 80 ms before it). */
function armAutoSync(state, i) {
  const u = state.units[i], t = state.tick;
  reAnchor(u, t);
  u.slipToHz = AUTO_SLIP;
  const t1 = t + TRIM_TICKS;
  const a1 = syncAt(u, t1).phaseDeg;
  const d = a1 <= 0 ? -a1 : DEG - a1; // degrees to the next pass through 0, needle clockwise
  u.autoTick = t1 + Math.max(0, Math.ceil(d / (DEG * AUTO_SLIP * DT) - EPS)) - BREAKER_TICKS;
  refreshAutoTick(state);
}

/** step(): the tick a syncAuto close is due (scope.nextAutoTick). Always clean. */
export function syncTick(state, out) {
  const t = state.tick;
  for (let i = 0; i < N; i++) {
    const u = state.units[i];
    if (u.autoTick !== t) continue;
    u.autoTick = -1;
    if (u.mode !== 'ready') continue;
    const a = syncAt(u, t + BREAKER_TICKS);
    closeBreaker(state, i, out);
    out.push({tick: t, kind: 'sync', unit: u.id, result: 'auto', angleDeg: a.phaseDeg, slipHz: a.slipHz});
  }
  refreshAutoTick(state);
}

/**
 * syncClose {unit, bypass}: the K-12 outcome table, judged at the angle and slip SYNC_BREAKER_TICKS
 * (80 ms) after the command. Blocked (|slip| > SYNC_BLOCK_SLIP_HZ or |angle| > SYNC_ROUGH_DEG):
 * refused (the relay's buzz), unless HAND and bypass: closes, then trips at once with
 * SYNC_BYPASS_LOCKOUT_S. Machine slow (slip < 0): closes, then a reverse-power trip after
 * SYNC_REVERSE_TRIP_S back to 'ready' with a new slip, no lockout. Machine fast (slip >= 0):
 * within SYNC_CLEAN_DEG clean (the <=5% block, then T2), else rough (the block plus a one-second
 * SYNC_ROUGH_MW swing; shaft stress logged). The breaker record is the close's; a `sync` record
 * {unit, result, angleDeg, slipHz, cue} says how it went.
 */
function syncClose(state, cmd, out) {
  const i = fleet.unitIndex(cmd.unit), u = state.units[i], t = state.tick;
  if (u.mode !== 'ready') return NOT_READY;
  const a = syncAt(u, t + BREAKER_TICKS), th = Math.abs(a.phaseDeg), sg = a.slipHz;
  const rec = result => ({tick: t, kind: 'sync', unit: u.id, result, angleDeg: a.phaseDeg, slipHz: sg,
    cue: result === 'clean' ? 'breaker' : 'growl'});
  if (Math.abs(sg) > BLOCK_SLIP || th > ROUGH_DEG) {
    if (!(cmd.bypass && state.control.mode === 'HAND')) return SYNC_BLOCKED;
    closeBreaker(state, i, out);
    out.push(rec('bypass'));
    fleet.tripUnit(state, i, 'closed out of phase with the sync-check bypassed', BYPASS_LOCKOUT_S, out);
    return '';
  }
  closeBreaker(state, i, out);
  if (sg < 0) {
    u.schedMW = 0; // the machine is slow: it motors instead of picking up its block
    u.revTripS = REV_TRIP_S;
    out.push(rec('reverse'));
    log(state, out, 'warn', 'SYNC_REVERSE', nameOf(i) + ' closed slow (needle anticlockwise): reverse power, protection trips it in ' +
      REV_TRIP_S + ' s. Back to full speed, no lockout.');
  } else if (th > CLEAN_DEG) {
    u.schedMW += ROUGH_MW;
    u.kickMW = ROUGH_MW;
    u.kickEndTick = t + TPS;
    out.push(rec('rough'));
    log(state, out, 'warn', 'SYNC_ROUGH', nameOf(i) + ' closed ' + Math.round(th) + ' degrees out: rough close, shaft stress logged.');
  } else {
    out.push(rec('clean'));
  }
  return '';
}

/** The reverse-power protection opens a slow-closed machine: back to 'ready' with a new slip, no lockout. */
function reverseTrip(state, i, out) {
  const u = state.units[i];
  u.mode = 'ready';
  u.schedMW = 0; u.agcTrimMW = 0; u.hotS = 0; u.revTripS = 0; u.kickMW = 0;
  fleet.setBasePoint(state, i, 0); // not 'on': 0, and the lever loses it if it had reached 'on' (hydro)
  fleet.setSync(state, i, false, 'trip');
  u.timerS = state.control.mode === 'AGC' ? AUTO_SYNC_S : 0;
  seedSlip(state, i);
  out.push({tick: state.tick, kind: 'breaker', unit: u.id, closed: false, why: 'trip', cue: 'breaker'});
  log(state, out, 'warn', 'SYNC_REVERSE_TRIP', nameOf(i) + ': reverse-power trip. Back at full speed, ready to synchronise again.');
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
  // Stage C: the minutes as well as the seconds. The preview checks the pickup's first seconds;
  // the load must also be carried after them, so R5 (5-minute headroom, H-4) must cover the
  // district's cold-load MW. Without it a restore that passed the preview sank frequency over
  // the next minute into a deeper UFLS stage (seed 20260930: restore, UFLS, restore... until all
  // eight stages had operated and the next fall went black at 20:50).
  const cold = fleet.districtColdLoadMW(state, d);
  if (state.sec.r5MW < cold) return 'not enough reserve to carry it: ' + Math.round(state.sec.r5MW) + ' MW spare in 5 min for ' + Math.round(cold) + ' MW';
  if (opts && opts.preview) {
    const p = previewTrip(state, {kind: 'district', id: dist.id});
    if (p.nadirHz < RESTORE_NADIR) {
      return 'restore preview ' + p.nadirHz.toFixed(2) + ' Hz for ' + Math.round(p.lostMW) + ' MW, below ' + RESTORE_NADIR.toFixed(2) + ' Hz';
    }
  }
  return '';
}

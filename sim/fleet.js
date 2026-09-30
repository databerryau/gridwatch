// sim/fleet.js: equipment construction and the shared equipment actions (spec F-13, H-3,
// H-9, H-4 "L", K-15 contingency records).
//
// Stage A owns this file (implemented). Every module that trips, syncs, sheds, moves a
// relay or sets a base point calls these functions instead of writing the fields itself,
// so the invariants below hold (any module may call them; see sim/README.md §11):
//   - phys.ekMWs === sum of V.MACHINES[k].ekMWs over units with sync === true (H-3)
//   - stations[st].basePointMW === sum of units[].basePointMW over that station's machines
//     in mode 'on'; every other unit has basePointMW 0 (K-1: units carry the base points)
//   - city.shedFrac === sum of district.share over dark districts
//   - ufls.operated[k] is true iff stage k's districts were shed by UFLS and not re-armed
//   - ofgs.trippedFrac === (number of tripped OFGS stages) x OFGS_STAGE_FRAC
//   - a contingency record is opened for every trip larger than EVENT_THRESHOLD_MW (K-15)
//   - sec.dirty is set whenever the commitment or L may have changed

import {V} from './params.js';

const TPS = V.TICKS_PER_S, M = V.MACHINES, MW_EPS = V.MW_EPS;

/** Whole grid seconds elapsed (0 = 04:00:00). */
export function gridSecond(state) {
  return Math.floor(state.tick / TPS);
}

/** Unit index for a machine id ('coal1'), or -1. Order is V.MACHINES order. */
export function unitIndex(id) {
  return V.MACHINE_IDS.indexOf(id);
}

// ------------------------------------------------------------------ construction

/** Per-machine dynamic state from the scenario's commitment (see README "State shape"). */
export function buildUnits(scn) {
  const c = scn.commitment;
  return M.map(m => {
    const mw = c.units[m.id];
    const on = mw !== undefined;
    return {
      id: m.id, station: m.station, k: m.k,
      mode: on ? 'on' : 'off', sync: on, timerS: 0,
      upSinceS: c.sinceS, downSinceS: c.sinceS, downWhy: 'stop',
      basePointMW: on ? mw : 0, agcTrimMW: 0, schedMW: on ? mw : 0,
      govMW: 0, outMW: on ? mw : 0,
      availMW: m.ratingMW, hotS: 0, starts: 0,
      // K-12 synchroscope (grid; Phase 1a): the slip is piecewise linear from slipHz at
      // slipAtTick toward slipToHz over SYNC_TRIM_S, the phase angle phaseAtDeg at slipAtTick;
      // grid.syncAt() gives both at any tick (analytic, no per-tick integration). autoTick: the
      // tick the auto-synchroniser (syncAuto) closes the breaker, -1 none; revTripS: grid seconds
      // to a reverse-power trip after a slow close (0 none); kickMW until kickEndTick: a rough
      // close's one-second MW swing.
      slipHz: 0, slipToHz: 0, slipAtTick: 0, phaseAtDeg: 0, autoTick: -1, revTripS: 0, kickMW: 0, kickEndTick: 0,
    };
  });
}

/** Station levers: base point = sum of the 'on' machines' base points (K-1). */
export function buildStations(units) {
  return V.STATION_IDS.map(id => ({
    id, basePointMW: units.filter(u => u.station === id && u.mode === 'on').reduce((a, u) => a + u.basePointMW, 0),
  }));
}

/** Districts from the scenario's suburbs (U-1), UFLS stages (H-6) and rotation (H-11). */
export function buildCity(scn) {
  const c = scn.city;
  const total = c.suburbs.reduce((a, s) => a + s.households, 0);
  const districts = [];
  for (const sub of c.suburbs) {
    for (let j = 1; j <= sub.districts; j++) {
      const id = sub.id + j;
      const stage = c.uflsStages.findIndex(pair => pair.includes(id));
      districts.push({
        id, suburb: sub.id, share: sub.households / total / sub.districts,
        uflsStage: stage + 1, rot: c.rotation.indexOf(id),
        dark: false, shedBy: null, darkSinceS: -1, restoredAtS: -1, surgeMW: 0,
      });
    }
  }
  return {districts, shedFrac: 0, coldLoadMW: 0, lastRestoreS: -V.DAY_S};
}

/** A fresh per-second accumulator (README §5 "acc"). */
export function newAcc() {
  return resetAcc({unitMWs: new Array(M.length).fill(0), battOutMWs: 0, battChargeMWs: 0, battAbsMWs: 0, shedMWs: 0,
    servedMWs: 0, loadReliefMWs: 0, fMinHz: 0, fMaxHz: 0, fSumHz: 0, ticks: 0, startCost: 0});
}

/**
 * Zero every accumulator in place (market.settleSecond calls this after folding a second).
 * fMinHz/fMaxHz are set to F0 only as placeholders: physics overwrites both with f on the
 * first tick of a second (when acc.ticks === 0), so they never leak across seconds.
 */
export function resetAcc(acc) {
  for (let i = 0; i < acc.unitMWs.length; i++) acc.unitMWs[i] = 0;
  acc.battOutMWs = 0; acc.battChargeMWs = 0; acc.battAbsMWs = 0; acc.shedMWs = 0; acc.servedMWs = 0;
  acc.loadReliefMWs = 0; acc.fMinHz = V.F0_HZ; acc.fMaxHz = V.F0_HZ; acc.fSumHz = 0; acc.ticks = 0; acc.startCost = 0;
  return acc;
}

// ------------------------------------------------------------------ station levers (K-1, H-1)

/**
 * Recompute stations[stationId].basePointMW as the sum of its 'on' machines' base points.
 * Call after changing any unit's basePointMW or mode. Returns the new lever MW.
 */
export function refreshLever(state, stationId) {
  const row = V.STATIONS[stationId]; // machines row.first .. row.first + row.count - 1
  let sum = 0;
  for (let i = row.first; i < row.first + row.count; i++) {
    const u = state.units[i];
    if (u.mode === 'on') sum += u.basePointMW;
  }
  for (const st of state.stations) if (st.id === stationId) st.basePointMW = sum;
  return sum;
}

/**
 * The range a station lever can take now: its 'on' machines' summed [minMW, availMW].
 * @returns {{onCount:number, minMW:number, maxMW:number}}
 */
export function stationRange(state, stationId) {
  const row = V.STATIONS[stationId];
  let onCount = 0, minMW = 0, maxMW = 0;
  for (let i = row.first; i < row.first + row.count; i++) {
    const u = state.units[i];
    if (u.mode !== 'on') continue;
    onCount++; minMW += M[i].minMW; maxMW += u.availMW;
  }
  return {onCount, minMW, maxMW};
}

/**
 * Set unit i's base point (clamped to [minMW, availMW]; 0 unless the unit is 'on') and
 * refresh its station lever. Returns the base point set.
 */
export function setBasePoint(state, i, mw) {
  const u = state.units[i];
  u.basePointMW = u.mode === 'on' ? Math.min(u.availMW, Math.max(M[i].minMW, mw)) + 0 : 0;
  refreshLever(state, u.station);
  return u.basePointMW;
}

// ------------------------------------------------------------------ inertia and L

/** Stored rotational energy of synchronised machines, MW*s (H-8 Ek = sum H*S). */
export function ekMWs(state) {
  let e = 0;
  for (const u of state.units) if (u.sync) e += M[u.k].ekMWs;
  return e;
}

/**
 * Close or open unit i's breaker, keeping phys.ekMWs and sec.dirty consistent. `why` on an
 * open: 'trip' for a protection trip (tripUnit), anything else is a planned stop. S-11's
 * minimum down time runs only after a planned stop (owner decision D1; see startBlock).
 */
export function setSync(state, i, closed, why) {
  const u = state.units[i];
  if (u.sync === closed) return;
  u.sync = closed;
  if (closed) u.upSinceS = gridSecond(state);
  else { u.downSinceS = gridSecond(state); u.downWhy = why === 'trip' ? 'trip' : 'stop'; }
  state.phys.ekMWs = ekMWs(state);
  state.sec.dirty = true;
}

/**
 * H-4 L: the largest credible contingency right now: the output of the largest
 * synchronised machine, or the tie import, whichever is larger.
 * @returns {{kind:'unit'|'link'|'none', id:string, mw:number}}
 */
export function largestContingency(state) {
  let kind = 'none', id = '', mw = 0;
  for (const u of state.units) if (u.sync && u.outMW > mw) { kind = 'unit'; id = u.id; mw = u.outMW; }
  const t = state.tie;
  if (!t.tripped && t.flowMW > mw) { kind = 'link'; id = 'tie'; mw = t.flowMW; }
  return {kind, id, mw};
}

// ------------------------------------------------------------------ command rules (S-11, H-1)

/**
 * '' if unit i may START now, else the reason (shown on the desk and used by grid.applyCommand).
 * S-11 minimum down time applies to planned decommitment only (owner decision D1, 2026-09-30):
 * after a protection trip the unit is held for its lockout (mode 'tripped'), then may start
 * at once (a hot start, T1 + T2).
 */
export function startBlock(state, i) {
  const u = state.units[i], m = M[i];
  if (u.mode !== 'off') return 'unit is ' + u.mode;
  const down = gridSecond(state) - u.downSinceS;
  if (u.downWhy !== 'trip' && down < m.minDownS) return 'minimum down time: ' + Math.ceil((m.minDownS - down) / V.S_PER_MIN) + ' min left';
  if (m.station === 'hydro' && state.hydro.storageMWh <= V.HYDRO_STOP_MWH) return 'no water';
  return '';
}

/** '' if unit i may STOP now (a starting or ready unit just cancels), else the reason. */
export function stopBlock(state, i) {
  const u = state.units[i], m = M[i];
  if (u.mode === 'starting' || u.mode === 'ready') return '';
  if (u.mode !== 'on' && u.mode !== 'loading') return 'unit is ' + u.mode;
  const up = gridSecond(state) - u.upSinceS;
  if (up < m.minUpS) return 'minimum up time: ' + Math.ceil((m.minUpS - up) / V.S_PER_MIN) + ' min left';
  return '';
}

// ------------------------------------------------------------------ contingencies (K-15, H-9)

/**
 * The imbalance-bar readouts of the last physics tick, i.e. just before a trip. The
 * contingency's `caught` values (and previewTrip's) are the change from these (README §5
 * "conts[]"): batteryMW = PFR plus the charge suspension (battery.outMW - battery.ffrMW),
 * guardMW = battery.ffrMW, uflsMW = phys.shedMW.
 */
export function preTrip(state) {
  const p = state.phys, b = state.battery;
  return {inertiaMW: p.inertiaMW, batteryMW: b.outMW - b.ffrMW, guardMW: b.ffrMW, governorsMW: p.govTotalMW,
    loadReliefMW: p.loadReliefMW, uflsMW: p.shedMW};
}

/**
 * Open a contingency record (state.conts) and emit the 'contingency' event. lostMW > 0 is
 * supply lost (frequency falls); lostMW < 0 is load lost (frequency rises). Physics fills
 * in the trace fields during the watch; grid fills backInBandTick.
 */
export function startContingency(state, cause, id, lostMW, ekBeforeMWs, out) {
  const tick = state.tick;
  const rec = {
    n: state.conts.length + 1, startTick: tick, cause, id, lostMW,
    fStartHz: state.phys.fHz, ekBeforeMWs, ekAfterMWs: state.phys.ekMWs,
    rocofHzS: 0, extremeHz: state.phys.fHz, extremeTick: tick,
    pre: preTrip(state),
    caught: {inertiaMW: 0, batteryMW: 0, guardMW: 0, governorsMW: 0, loadReliefMW: 0, uflsMW: 0},
    uflsStages: 0, contained: true, backInBandTick: -1,
    watchEndTick: tick + V.WATCH_S * TPS, secureByTick: tick + V.SECURE_AGAIN_S * TPS,
  };
  state.conts.push(rec);
  state.contIdx = state.conts.length - 1;
  out.push({tick, kind: 'contingency', cause, id, lostMW, fHz: state.phys.fHz,
    ekBeforeGWs: ekBeforeMWs / V.MW_PER_GW, ekAfterGWs: state.phys.ekMWs / V.MW_PER_GW, cue: 'horn'});
}

/**
 * Trip synchronised unit i (H-2, H-3, H-9): breaker opens at once, output and inertia
 * go, protection lockout starts. The station lever drops by the machine's share so the
 * station's other machines do not chase it. Returns the MW lost (its output this tick).
 */
export function tripUnit(state, i, cause, lockoutS, out) {
  const u = state.units[i], m = M[i];
  if (!u.sync) return 0;
  const lost = u.outMW, ekBefore = state.phys.ekMWs;
  u.mode = 'tripped'; u.timerS = lockoutS;
  u.basePointMW = 0; u.agcTrimMW = 0; u.schedMW = 0; u.govMW = 0; u.outMW = 0; u.hotS = 0;
  refreshLever(state, u.station);
  setSync(state, i, false, 'trip');
  const tick = state.tick;
  out.push({tick, kind: 'breaker', unit: u.id, closed: false, why: 'trip', cue: 'breaker'});
  out.push({tick, kind: 'log', sev: 'crit', code: 'UNIT_TRIP', cue: 'horn',
    msg: 'UNIT TRIP: ' + m.name + ' (' + cause + '): ' + Math.round(lost) + ' MW lost. Protection lockout ' +
      Math.round(lockoutS / V.S_PER_MIN) + ' min.'});
  if (lost > V.EVENT_THRESHOLD_MW) startContingency(state, 'unit', u.id, lost, ekBefore, out);
  return lost;
}

/** Trip the DC tie (K-6): flow to zero at once, lockout starts. Returns the signed MW lost (import > 0). */
export function tripTie(state, cause, lockoutS, out) {
  const t = state.tie;
  if (t.tripped) return 0;
  const lost = t.flowMW;
  t.tripped = true; t.lockoutS = lockoutS; t.flowMW = 0;
  state.sec.dirty = true;
  const tick = state.tick;
  out.push({tick, kind: 'breaker', unit: 'tie', closed: false, why: 'trip', cue: 'breaker'});
  out.push({tick, kind: 'log', sev: 'crit', code: 'LINK_TRIP', cue: 'horn',
    msg: 'LINK TRIP (' + cause + '): tie flow of ' + Math.round(lost) + ' MW lost. Out of service ' +
      Math.round(lockoutS / V.S_PER_MIN) + ' min.'});
  if (Math.abs(lost) > V.EVENT_THRESHOLD_MW) startContingency(state, 'link', 'tie', lost, state.phys.ekMWs, out);
  return lost;
}

/** Trip the smelter potline (a load contingency: frequency rises). Returns -MW of load lost. */
export function tripSmelter(state, offS, out) {
  const sm = state.smelter;
  const lostLoad = sm.loadMW;
  if (lostLoad <= MW_EPS) return 0;
  sm.loadMW = 0; sm.offS = offS; sm.returning = false;
  const tick = state.tick;
  out.push({tick, kind: 'log', sev: 'crit', code: 'SMELTER_TRIP', cue: 'horn',
    msg: 'SMELTER POTLINE TRIP: ' + Math.round(lostLoad) + ' MW of load lost. Over-frequency risk.'});
  if (lostLoad > V.EVENT_THRESHOLD_MW) startContingency(state, 'load', 'smelter', -lostLoad, state.phys.ekMWs, out);
  return -lostLoad;
}

// ------------------------------------------------------------------ districts (H-6, H-11, K-13)

/**
 * Darken or relight district d. why: 'ufls' | 'directed' | 'task' (Phase 2 restore task).
 * Keeps city.shedFrac exact. Returns the district's share of demand (0 if unchanged).
 * Callers emit their own event records.
 */
export function setDistrictDark(state, d, dark, why) {
  const city = state.city, dist = city.districts[d];
  if (dist.dark === dark) return 0;
  const s = gridSecond(state);
  dist.dark = dark;
  if (dark) { dist.shedBy = why; dist.darkSinceS = s; } else { dist.shedBy = null; dist.restoredAtS = s; }
  let f = 0;
  for (const x of city.districts) if (x.dark) f += x.share;
  city.shedFrac = f;
  return dist.share;
}

/** grid.restorePermissive's reason for a district that is not dark (observe() uses it too). */
export const DISTRICT_LIT = 'district is lit';

/**
 * K-13 cold-load MW of district d: what it would draw if closed now. env.demandMW x share,
 * x COLD_LOAD_FACTOR if it has been dark longer than COLD_LOAD_AFTER_S. For a lit district,
 * its present share of demand. Used by the restore permissive, observe() and the restore
 * surge, so all three agree.
 */
export function districtColdLoadMW(state, d) {
  const dist = state.city.districts[d];
  const base = state.env.demandMW * dist.share;
  const cold = dist.dark && gridSecond(state) - dist.darkSinceS > V.COLD_LOAD_AFTER_S;
  return cold ? base * V.COLD_LOAD_FACTOR : base;
}

// ------------------------------------------------------------------ relays (H-6, H-7)

/**
 * UFLS stage k (0-based) operates: both its districts go dark ('ufls'), the stage is marked
 * operated and its timer cleared. Returns the district ids shed (the caller, physics,
 * emits the {kind:'ufls'} record with the MW).
 */
export function operateUfls(state, k) {
  const ids = [];
  const ds = state.city.districts;
  for (let d = 0; d < ds.length; d++) {
    if (ds[d].uflsStage !== k + 1) continue;
    if (!ds[d].dark) setDistrictDark(state, d, true, 'ufls');
    ids.push(ds[d].id);
  }
  state.ufls.operated[k] = true;
  state.ufls.timerS[k] = 0;
  return ids;
}

/** Re-arm UFLS stage k once both its districts are lit again (grid, after restores). Returns true if re-armed. */
export function rearmUfls(state, k) {
  if (!state.ufls.operated[k]) return false;
  for (const d of state.city.districts) if (d.uflsStage === k + 1 && d.dark) return false;
  state.ufls.operated[k] = false;
  state.ufls.timerS[k] = 0;
  return true;
}

/** Trip (physics) or reconnect (grid) OFGS stage k, keeping ofgs.trippedFrac exact. */
export function setOfgsStage(state, k, tripped) {
  const o = state.ofgs;
  o.tripped[k] = tripped;
  o.timerS[k] = 0;
  let n = 0;
  for (let j = 0; j < o.tripped.length; j++) if (o.tripped[j]) n++;
  o.trippedFrac = n * V.OFGS_STAGE_FRAC;
}

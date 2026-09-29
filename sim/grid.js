// sim/grid.js: the 1-second grid update and every player command's semantics
// (spec F-2, F-13, H-1, H-2, H-4, H-10, H-11, K-1, K-2, K-3, K-5..K-7, K-12/K-13 stubs, S-11).
//
// STAGE B owner: "grid". Contract: sim/README.md, section "grid.js".
// step() calls, at every grid-second boundary and in this order:
//   unitsSecond -> agcSecond -> dispatchSecond -> fosSecond -> securitySecond
// (after market.settleSecond, events.applyDue and weather.sampleSecond; before market.priceSecond).
// Trips, breakers, districts, relays and base points go through sim/fleet.js, which keeps
// the invariants listed at the top of that file.

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
 *     -> 'loading' (T2 profile from its present output up to MIN).
 *   battery {mode, mw}: orderMW = mw, mode set, fullHold = false. guard {mw}: guardMW.
 *   tie {mw}: setMW (clamped to the export cap only at use). curtail {kind, limitPct}:
 *     ren.windLimitPct / solarLimitPct (output LIMIT, 100 = no curtailment).
 *   restore {district}: restorePermissive must be ''; fleet.setDistrictDark(..., false);
 *     district.surgeMW = coldLoad - its present share of demand (>= 0); city.lastRestoreS =
 *     s; fleet.rearmUfls for its stage; emit {kind:'restore', district, mw: coldLoad}.
 *   directShed: darken the lit rotation district with the lowest rot ('directed'), emit 'shed'.
 * @param {object} state
 * @param {{type:string}} cmd
 * @param {Array<object>} out
 * @returns {string}
 */
export function applyCommand(state, cmd, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

/**
 * Unit state machines and timers, once per grid second (H-1, H-2, K-12 auto-sync, S-11):
 * starting -> ready (T1) -> loading (auto-sync after AUTO_SYNC_S in AGC mode; breaker closes
 * via fleet.setSync with a SYNC_BLOCK_FRAC block) -> on (after T2; basePointMW = minMW via
 * fleet.setBasePoint, so the station's other machines keep theirs); unloading -> shutdown
 * (at MIN) -> off (after T4; the breaker opens at <= BREAKER_OPEN_FRAC); tripped -> off
 * (lockout). Heat derate (availMW; 'on' base points re-clamped with fleet.setBasePoint),
 * overheat trips from the play stream (fleet.tripUnit), hydro stop at HYDRO_STOP_MWH and
 * storage warnings, tie lockout, RERT lead/ramp, DR timer, OFGS reconnect
 * (fleet.setOfgsStage after OFGS_RECONNECT_S back in band), battery FULL-HOLD (H-10).
 * acc.startCost is NOT here (charged in applyCommand).
 */
export function unitsSecond(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

/**
 * AGC (K-2, L-8): every AGC_CYCLE_S in AGC mode, ACE = -AGC_BIAS_MW_PER_HZ * (state.last.fMeanHz
 * - F0) (0 within AGC_DEADBAND_HZ); request += AGC_KI_PER_S * AGC_CYCLE_S * ACE, clipped to
 * the sum of bands; share it over participants in proportion to their band (units in mode
 * 'on': +-agcBandMW, kept within [minMW, availMW] around the base point; battery:
 * +-(BATT_MW - guardMW), within SoC). Writes units[].agcTrimMW, battery.agcTrimMW, agc.*
 * (agc.atLimitS counts grid seconds the request exceeded all bands; agc.unmetMW). In HAND
 * mode every trim is 0. AGC never starts or stops a unit and never moves a base point.
 */
export function agcSecond(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

/**
 * Dispatch movement for the coming second (all constant within the second):
 *   units in mode 'on': schedMW moves toward clamp(basePointMW + agcTrimMW, minMW, availMW)
 *     at rampMWs; loading / unloading / shutdown follow their T2 / ramp / T4 profiles.
 *   battery: target = clamp(signed order + agcTrimMW, -(BATT_MW - guardMW), BATT_MW - guardMW)
 *     (+ discharge, - charge; charge part 0 while fullHold); schedMW moves toward it at
 *     BATT_DISPATCH_RAMP_MW_S (K-5: guard MW are never available to orders or AGC).
 *   tie: flowMW toward clamp(setMW, -env.exportLimitMW, TIE_MAX_MW) at TIE_RAMP_MW_MIN / 60
 *     per second (0 while tripped).
 *   ren: windMW = env.windAvailMW x windLimitPct / 100; solarMW likewise (physics applies
 *     OFGS to wind). rert.outMW and dr.mw.
 */
export function dispatchSecond(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

/**
 * Frequency operating standard (H-11), on state.last.fMeanHz: fos.outsideS, fos.belowContainS,
 * fos.countdownS; directed shedding (one district per DIRECTED_INTERVAL_S in city rotation
 * order, fleet.setDistrictDark(..., 'directed'), a 'shed' record) when the 5-min countdown
 * ends below NORMAL_LO_HZ or f < CONTAIN_LO_HZ for > DIRECTED_BELOW_CONTAIN_S; it stops when
 * frequency RECOVERS, defined as last.fMeanHz >= NORMAL_LO_HZ. Nothing is ever restored
 * automatically (H-6). Also: the cold-load surge (K-13) city.coldLoadMW = sum over districts
 * of surgeMW x max(0, 1 - (s - restoredAtS) / COLD_LOAD_DECAY_S) (surgeMW set to 0 once
 * decayed), and the active contingency's backInBandTick (first second with last.fMinHz and
 * last.fMaxHz inside the normal band).
 */
export function fosSecond(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

/**
 * Refresh state.sec from security(state). The preview (physics.previewTrip for losing L)
 * is re-run when ANY of: sec.dirty (set by every accepted input, fleet.setSync, trips);
 * L's id differs from sec.previewLId; |L MW - sec.previewLMW| > PREVIEW_L_TOL_MW; or
 * PREVIEW_REFRESH_S have passed since sec.previewAtS. On a re-run it sets previewNadirHz,
 * previewAtS = s, previewLId, previewLMW and clears dirty; otherwise the cached nadir is
 * reused (security(state, {previewNadirHz})). Emits a log line when the level changes.
 */
export function securitySecond(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

/**
 * THE reserve function (H-4): feeds the gauge, the alarm, the price adder (P-7), the restore
 * permissive (K-13), par and the debrief. Pure.
 *   R5 = sum over units in mode 'on' of min(availMW - outMW, rampMWs * R5_WINDOW_MIN * 60)
 *        (loading, unloading and shutdown units offer no headroom, H-1)
 *      + battery min(BATT_MW - outMW, socMWh / BATT_R5_SUSTAIN_H)
 *      + tie (not tripped) min(TIE_MAX_MW - flowMW, TIE_RAMP_MW_MIN * R5_WINDOW_MIN)
 *   L  = fleet.largestContingency(state)
 *   level: 'SHEDDING' if city.shedFrac > 0; 'SHORT' if R5 < L; 'TIGHT' if R5 < SECURE_RATIO*L
 *          or previewNadirHz < SECURE_NADIR_HZ; else 'SECURE'.
 * @param {object} state
 * @param {{previewNadirHz?:number}} [opts] reuse a cached preview instead of running physics.previewTrip
 * @returns {{r5MW:number, lMW:number, lKind:string, lId:string, ratio:number, previewNadirHz:number, level:string}}
 */
export function security(state, opts) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

/**
 * K-13 restore permissive for district index d. Returns fleet.DISTRICT_LIT if the district
 * is not dark; '' if last.fMeanHz >= RESTORE_MIN_HZ, R5 >= RESTORE_R5_RATIO x
 * fleet.districtColdLoadMW(state, d) (R5 from security(state, {previewNadirHz:
 * sec.previewNadirHz}), never a new preview) and RESTORE_INTERVAL_S have passed since
 * city.lastRestoreS; else the first failing reason. Pure (observe() calls it per dark
 * district). Phase 0.2: permissive + cold load only; the procedure bay, FOCUS playback and
 * the restore preview are Phase 1a.
 */
export function restorePermissive(state, d) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: grid)');
}

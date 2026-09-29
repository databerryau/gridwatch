// sim/physics.js: the one frequency engine (spec H-8, H-6, H-7, H-10, F-4, K-10, K-15).
//
// STAGE B owner: "physics". Contract: sim/README.md, section "physics.js".
// Used by live play (tick), the TRIP PREVIEW and SECURE check (previewTrip), the watch,
// restore previews (K-13, Phase 1a), par and tests. There is no second engine.
//
// Rules for this file:
//   - tick() allocates nothing and calls no transcendental Math function (risk 5).
//   - Constants come from V (sim/params.js); hoist them to module scope.
//   - Per-machine constants are in V.MACHINES[k] (govDeadTicks, govAlpha, govCapMW,
//     govGainMWperHz, ekMWs, ...).
//   - previewTrip() never writes to `state` and never clones it (a JSON clone alone costs
//     ~0.26 ms). It uses ONE module-level scratch object, built once, whose fields are
//     overwritten on every call from the physics-read fields of state (README §11), so its
//     result depends only on its inputs.
//   - Relays go through fleet.operateUfls / fleet.setOfgsStage; districts through fleet.

/**
 * Advance the physics by one tick (PHYS_DT = 20 ms of grid time). Order inside the tick:
 *   1. read f = phys.fHz; push it into phys.fHist[tick % FHIST_LEN]; rocofHzS over ROCOF_WINDOW_S
 *   2. battery under-frequency charge suspension (H-10) with UF_SUSPEND_HZ / UF_RESUME_HZ hysteresis
 *   3. governors of units with mode 'on' (deadband, droop, cap, headroom, dead time via fHist,
 *      first-order lag); other synchronised units decay their govMW to 0 with the same lag
 *   4. battery: effSched = schedMW, but 0 when (ufSuspend and schedMW < 0), when discharging
 *      (schedMW > 0) at socMWh <= 0, or when charging (schedMW < 0) at socMWh >= BATT_MWH.
 *      PFR (deadband, full output BATT_PFR_FULL_HZ beyond it, dead time + lag) and the GUARD
 *      FFR layer (trigger, 1-s delivery, sustain, ramp-off, re-arm); total capped at
 *      +-BATT_MW and by SoC (no discharge at 0, no charge when full), trimming PFR first,
 *      then the guard, so outMW === effSched + pfrMW + ffrMW exactly. Integrate socMWh
 *      (charge x BATT_CHARGE_EFF) and clamp it to [0, BATT_MWH]. acc.battChargeMWs etc.
 *   5. unit outputs outMW = schedMW + govMW; integrate hydro.storageMWh (clamped at 0)
 *   6. UFLS relays (H-6): per stage timer while f < threshold (reset if f recovers first); at
 *      UFLS_DELAY_S call fleet.operateUfls(state, k) and emit {kind:'ufls', stage, districts,
 *      mw, cue:'clack'}; OFGS stages (H-7) via fleet.setOfgsStage(state, k, true)
 *   7. load: served = env.demandMW * (1 - city.shedFrac) + city.coldLoadMW - dr.mw;
 *      load relief = served * LOAD_RELIEF * (F0 - f) / F0   (positive when f < F0: load falls)
 *      loadMW = served - load relief
 *   8. imbalance dP = supply - loadMW; df = F0 * dP * PHYS_DT / (2 * phys.ekMWs); clamp f to
 *      [F_CLAMP_LO_HZ, F_CLAMP_HI_HZ]; if ekMWs is 0 the grid is black ('inertia')
 *   9. collapse (H-7): black at <= BLACK_LO_HZ or >= BLACK_HI_HZ, or after the COLLAPSE_BANDS
 *      hold times; on black set state.black = true and emit {kind:'black'}
 *  10. readouts phys.* (imbalance bar, K-11; the README §5 identity holds every tick),
 *      contingency trace (state.conts[contIdx] while tick < watchEndTick: rocofHzS of the
 *      first tick, extreme, caught = readouts at the extreme minus rec.pre, uflsStages,
 *      contained), per-second accumulators state.acc.* (when acc.ticks === 0 set
 *      acc.fMinHz = acc.fMaxHz = f first).
 * @param {object} state
 * @param {Array<object>} out event records
 */
export function tick(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: physics)');
}

/**
 * TRIP PREVIEW (K-10, H-4 SECURE, K-5 guard ring, K-13 restore preview). Runs the tick
 * engine on the module scratch, loaded from state, with schedules, demand and renewables
 * frozen (no grid seconds), after removing `target`, for up to PREVIEW_HORIZON_S (stopping
 * early once the nadir has passed and frequency has risen for ROCOF_WINDOW_S). Pure: never
 * writes to `state`.
 *
 * opts.guardMW overrides the battery guard (K-5: the ring moves the needle live). The
 * override also clamps the scheduled battery output to +-(BATT_MW - guardMW), and the MW
 * that clamp removes are added back to the scratch's other scheduled supply (as if AGC had
 * moved them to the units), so the preview starts balanced.
 *
 * @param {object} state
 * @param {{kind:'unit'|'link'|'load'|'district', id:string, mw?:number}} target
 *   'unit' trips that machine; 'link' trips the tie; 'load' removes mw of load (mw > 0);
 *   'district' closes that dark district with its cold-load MW (restore preview, K-13).
 * @param {{guardMW?:number}} [opts]
 * @returns {{nadirHz:number, nadirS:number, lostMW:number, uflsStages:number, black:boolean,
 *   caught:{inertiaMW:number, batteryMW:number, guardMW:number, governorsMW:number, loadReliefMW:number, uflsMW:number}}}
 *   caught = each source's MW at the nadir MINUS its value before the trip (the state's
 *   readouts, fleet.preTrip): batteryMW is PFR plus the charge suspension
 *   (outMW - ffrMW), guardMW the FFR layer, uflsMW the load shed. With frozen schedules
 *   their sum is lostMW minus the tripped unit's pre-trip govMW (0 at 50 Hz). For target
 *   'load' or 'district', nadirHz is the extreme (the PEAK for 'load').
 */
export function previewTrip(state, target, opts) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: physics)');
}

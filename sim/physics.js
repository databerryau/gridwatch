// sim/physics.js: the one frequency engine (spec H-8, H-6, H-7, H-10, F-4, K-10, K-15).
//
// STAGE B owner: "physics". Contract: sim/README.md, section "physics.js".
// Used by live play (tick), the TRIP PREVIEW and SECURE check (previewTrip), the watch,
// restore previews (K-13, Phase 1a), par and tests. There is no second engine: tick() and
// previewTrip() both run advance() below, on state (the preview between a save and an exact
// restore).
//
// Rules for this file:
//   - tick() allocates nothing and calls no transcendental Math function (risk 5). Event
//     records (ufls, ofgs, black) are the only objects it creates, and they are rare.
//   - Constants come from V (sim/params.js), hoisted to module scope below.
//   - Per-machine constants are in V.MACHINES[k] (govDeadTicks, govAlpha, govCapMW,
//     govGainMWperHz, ekMWs, ...), copied into flat module arrays.
//   - previewTrip() leaves `state` exactly as it found it and never clones it (a JSON clone
//     alone costs ~0.26 ms): it saves every field the engine can write into ONE module-level
//     backup built once, runs on state, and restores them in a finally (integration: running
//     on a separate scratch object made the tick engine polymorphic, ~90 ns per live tick).
//     Its result depends only on its inputs.
//   - Relays go through fleet.operateUfls / fleet.setOfgsStage; districts through fleet.
//
// Modelling choices inside the README contract (each is labelled in params.js):
//   - Relay and collapse timers count whole ticks (timer = n x PHYS_DT), so 0.30 s is exactly
//     15 ticks and no float drift moves a relay by a tick.
//   - Collapse bands (H-7) count time BELOW each band's upper edge (47.5 Hz for 2 s, 48.0 Hz
//     for 20 s), as generator under-frequency protection does ("f < X for t"); a dip from the
//     47.5-48 band into the 47-47.5 band keeps the 20-s timer running instead of resetting it.
//     Instant black uses both the tick's start and end frequency.
//   - GUARD (K-5): the FFR layer follows a target (guardMW while sustained, a linear ramp-off
//     after GUARD_SUSTAIN_S, 0 when spent) at guardMW / GUARD_DELIVERY_S upward and at
//     BATT_MW / GUARD_WITHDRAW_S downward, so it is full exactly GUARD_DELIVERY_S after the
//     trigger and turning the ring down mid-sustain never steps the output (params
//     GUARD_WITHDRAW_S). The guard reads the live ring (battery.guardMW).
//   - H-10 re-engagement: while ufSuspend, charging comes back in proportion between
//     UF_SUSPEND_HZ and UF_RESUME_HZ (params UF_RESUME_LINEAR), so the release is not undone
//     by a step at 49.90 Hz.
//   - PFR anti-windup: battery.pfrMW is the lag state AFTER the inverter / SoC trim.
//   - acc.fMinHz/fMaxHz/fSumHz use the frequency at the START of each tick (the same f the
//     tick's readouts and relays use, and the one pushed into fHist). acc.battOutMWs is the
//     signed net output (+ discharge), acc.battChargeMWs the charge drawn (>= 0) and
//     acc.battAbsMWs the throughput |out|, all in MW x s.
//   - A contingency record's extremeHz is judged on each traced tick's START frequency (the
//     value phys.fHz showed after the previous step), extremeTick is that tick, and caught =
//     that tick's readouts minus pre, so a UFLS stage operating at the extreme is counted.

import {V} from './params.js';
import * as fleet from './fleet.js';

// ------------------------------------------------------------------ constants (hoisted)

const DT = V.PHYS_DT, F0 = V.F0_HZ, L = V.FHIST_LEN, TPS = V.TICKS_PER_S;
const DT_H = DT / V.S_PER_H;
const M = V.MACHINES, NU = M.length;
const ROCOF_S = V.ROCOF_WINDOW_S, ROCOF_TICKS = Math.round(ROCOF_S / DT);
const LOAD_RELIEF = V.LOAD_RELIEF;
const F_LO = V.F_CLAMP_LO_HZ, F_HI = V.F_CLAMP_HI_HZ;
const BLACK_LO = V.BLACK_LO_HZ, BLACK_HI = V.BLACK_HI_HZ;
const CONTAIN_LO = V.CONTAIN_LO_HZ, CONTAIN_HI = V.CONTAIN_HI_HZ;

// governors (H-8)
const GOV_DB = V.GOV_DEADBAND_HZ;
const GOV_DEAD = [], GOV_ALPHA = [], GOV_GAIN = [], GOV_CAP = [], MIN_MW = [], IS_HYDRO = [];
for (const m of M) {
  GOV_DEAD.push(m.govDeadTicks); GOV_ALPHA.push(m.govAlpha); GOV_GAIN.push(m.govGainMWperHz);
  GOV_CAP.push(m.govCapMW); MIN_MW.push(m.minMW); IS_HYDRO.push(m.station === 'hydro');
}

// battery (H-8 two layers, H-10, K-5)
const BATT_MW = V.BATT_MW, BATT_MWH = V.BATT_MWH, CHARGE_EFF = V.BATT_CHARGE_EFF;
const B_DB = V.BATT_PFR_DEADBAND_HZ, B_FULL = V.BATT_PFR_FULL_HZ;
const B_DEAD = Math.round(V.BATT_PFR_DEAD_S / DT), B_ALPHA = DT / V.BATT_PFR_LAG_S;
const G_TRIG = V.GUARD_TRIGGER_HZ, G_REARM = V.GUARD_REARM_HZ;
const G_UP_TICKS = Math.round(V.GUARD_DELIVERY_S / DT);
const G_SUSTAIN = Math.round(V.GUARD_SUSTAIN_S / DT), G_OFF = Math.round(V.GUARD_RAMP_OFF_S / DT);
const G_END = G_SUSTAIN + G_OFF;
const G_DOWN = BATT_MW / V.GUARD_WITHDRAW_S * DT;
const UF_SUS = V.UF_SUSPEND_HZ, UF_RES = V.UF_RESUME_HZ, UF_BAND = UF_RES - UF_SUS, UF_LINEAR = V.UF_RESUME_LINEAR;
// SoC power taper (integration): near empty (full) the total battery output (schedule + PFR
// + guard) is limited to sqrt(2 r E), the most that can still be brought to 0 at the dispatch
// ramp r with the energy E (MW s) left, so reaching 0 or BATT_MWH never steps the output (a
// BMS derates power near its SoC limits; the grid's schedule taper, grid.js, is the same rule
// in whole seconds and never binds tighter). Without it PFR, which the schedule taper cannot
// see, filled a battery charging ~250 MW and the charge stepped off at 100% (a self-made
// over-frequency event that blacked out a doNothing night). Checked only inside the band.
const TAPER_2R = 2 * V.BATT_DISPATCH_RAMP_MW_S, V_S_PER_H = V.S_PER_H;
const TAPER_E_MWS = BATT_MW * BATT_MW / TAPER_2R; // sqrt(2 r E) >= BATT_MW beyond this energy
const TAPER_LO_MWH = TAPER_E_MWS / V.S_PER_H, TAPER_HI_MWH = BATT_MWH - TAPER_E_MWS * CHARGE_EFF / V.S_PER_H;

// relays and collapse (H-6, H-7)
const NUF = V.UFLS_STAGES, UFLS_TICKS = Math.round(V.UFLS_DELAY_S / DT), UFLS_HZ = [];
for (let k = 0; k < NUF; k++) UFLS_HZ.push(V.UFLS_FIRST_HZ - k * V.UFLS_STEP_HZ);
const UFLS_TOP = UFLS_HZ[0];
const OFGS_HZ = V.OFGS_STAGES_HZ, NOF = OFGS_HZ.length, OFGS_TICKS = Math.round(V.OFGS_DELAY_S / DT);
const OFGS_FRAC = V.OFGS_STAGE_FRAC, OFGS_BOTTOM = Math.min(...OFGS_HZ);
const NB = V.COLLAPSE_BANDS.length, BAND_HI = [], BAND_TICKS = [];
for (const b of V.COLLAPSE_BANDS) { BAND_HI.push(b.hiHz); BAND_TICKS.push(Math.round(b.holdS / DT)); }

// preview (K-10)
const HORIZON_TICKS = Math.round(V.PREVIEW_HORIZON_S * TPS);

// The fHist ring must cover every dead time and the RoCoF window (README §5 phys), and its
// length is a power of two so the index is a mask (cheaper than %; (t - d) & MASK is also
// right for t < d).
const MASK = L - 1;
if ((L & MASK) !== 0) throw new Error('physics: FHIST_LEN must be a power of two');
for (const d of [...GOV_DEAD, B_DEAD, ROCOF_TICKS]) {
  if (!(d >= 0 && d < L)) throw new Error('physics: a dead time or the RoCoF window does not fit FHIST_LEN');
}

// ------------------------------------------------------------------ the engine

// Effective battery schedule (README §11 physics step 4, H-10): 0 when charging on a full
// battery or discharging an empty one; charging suspended while ufSuspend (re-engaging in
// proportion between UF_SUSPEND_HZ and UF_RESUME_HZ when UF_RESUME_LINEAR).
function effSchedMW(b, f) {
  const sched = b.schedMW;
  if (sched < 0) {
    if (b.socMWh >= BATT_MWH) return 0;
    if (b.ufSuspend) return UF_LINEAR && f > UF_SUS ? sched * (f - UF_SUS) / UF_BAND : 0;
  } else if (sched > 0 && b.socMWh <= 0) return 0;
  return sched;
}

// Contingency trace (K-15): first-tick RoCoF, the extreme and what caught it. The extreme is
// judged on the tick's START frequency f, so caught is the breakdown of the tick that sits
// at the extreme (including a UFLS stage that operates at it, which is what turned it).
function trace(rec, t, f, fn, imb, bOut, ffr, govSum, relief, shed, stagesNow) {
  if (t === rec.startTick) rec.rocofHzS = (fn - f) / DT + 0;
  rec.uflsStages += stagesNow;
  if (rec.lostMW >= 0 ? f < rec.extremeHz : f > rec.extremeHz) {
    rec.extremeHz = f;
    rec.extremeTick = t;
    rec.contained = f >= CONTAIN_LO && f <= CONTAIN_HI;
    const c = rec.caught, p = rec.pre;
    c.inertiaMW = (0 - imb) - p.inertiaMW + 0;
    c.batteryMW = (bOut - ffr) - p.batteryMW + 0;
    c.guardMW = ffr - p.guardMW + 0;
    c.governorsMW = govSum - p.governorsMW + 0;
    c.loadReliefMW = relief - p.loadReliefMW + 0;
    c.uflsMW = shed - p.uflsMW + 0;
  }
}

// The frequency a trace ends on (black, or the end of a preview) is judged too.
function traceLast(rec, tEnd, fEnd) {
  if (rec.lostMW >= 0 ? fEnd < rec.extremeHz : fEnd > rec.extremeHz) {
    rec.extremeHz = fEnd;
    rec.extremeTick = tEnd;
    rec.contained = fEnd >= CONTAIN_LO && fEnd <= CONTAIN_HI;
  }
}

/**
 * One 20-ms tick on S, which is the sim state or the preview scratch (same field names).
 * emit: push event records to out (false for the preview).
 */
function advance(S, out, emit) {
  const ph = S.phys, hist = ph.fHist, t = S.tick;
  const f = ph.fHz;

  // 1. history and the FOS RoCoF (K-11: change over the last 500 ms)
  hist[t & MASK] = f; // = t % FHIST_LEN (a power of two; checked at load)
  ph.rocofHzS = (f - hist[(t - ROCOF_TICKS) & MASK]) / ROCOF_S + 0;
  const fPrev = hist[(t - 1) & MASK];

  // 2. H-10 charge suspension, hysteresis, at physics speed
  const b = S.battery;
  if (f < UF_SUS) b.ufSuspend = true; else if (f > UF_RES) b.ufSuspend = false;

  // 3 + 5. governors, unit outputs, hydro water
  const units = S.units, acc = S.acc, unitMWs = acc.unitMWs;
  let schedSum = 0, govSum = 0, outSum = 0, hydroOut = 0;
  for (let i = 0; i < NU; i++) {
    const u = units[i];
    if (!u.sync) {
      if (u.outMW !== 0 || u.govMW !== 0) { u.outMW = 0; u.govMW = 0; }
      continue;
    }
    let g = u.govMW;
    if (u.mode === 'on') {
      const e = hist[(t - GOV_DEAD[i]) & MASK] - F0;
      let tgt = 0;
      if (e > GOV_DB) tgt = (GOV_DB - e) * GOV_GAIN[i];
      else if (e < -GOV_DB) tgt = (-GOV_DB - e) * GOV_GAIN[i];
      const cap = GOV_CAP[i];
      if (tgt > cap) tgt = cap; else if (tgt < -cap) tgt = -cap;
      // headroom: up to avail, down to MIN (none left if the schedule is already past either)
      const sched = u.schedMW, up = u.availMW - sched, dn = sched - MIN_MW[i];
      const ub = up > 0 ? up : 0, lb = dn > 0 ? -dn : 0;
      if (tgt > ub) tgt = ub; else if (tgt < lb) tgt = lb;
      g += (tgt - g) * GOV_ALPHA[i];
    } else {
      g -= g * GOV_ALPHA[i];
    }
    g += 0;
    u.govMW = g;
    const o = u.schedMW + g;
    u.outMW = o;
    unitMWs[i] += o * DT;
    schedSum += u.schedMW; govSum += g; outSum += o;
    if (IS_HYDRO[i]) hydroOut += o;
  }
  if (hydroOut > 0) {
    const h = S.hydro.storageMWh - hydroOut * DT_H;
    S.hydro.storageMWh = h > 0 ? h : 0;
  }

  // 4. battery: effective schedule + PFR layer + GUARD layer, trimmed, SoC
  let eff = effSchedMW(b, f);
  const soc = b.socMWh;
  const eb = hist[(t - B_DEAD) & MASK] - F0;
  let x = 0;
  if (eb > B_DB) x = (eb - B_DB) / B_FULL; else if (eb < -B_DB) x = (eb + B_DB) / B_FULL;
  if (x > 1) x = 1; else if (x < -1) x = -1;
  let pfr = b.pfrMW;
  pfr += (0 - x * BATT_MW - pfr) * B_ALPHA;

  let fired = b.ffrFiredTick;
  if (fired < 0 && b.guardMW > 0 && f < G_TRIG) { fired = t; b.ffrFiredTick = t; }
  let ftgt = 0, spent = false;
  if (fired >= 0) {
    const e = t - fired;
    if (e < G_SUSTAIN) ftgt = b.guardMW;
    else if (e < G_END - 1) ftgt = b.guardMW * (G_END - 1 - e) / G_OFF;
    else spent = true; // ramp-off done: 0 from its last tick
  }
  let ffr = b.ffrMW;
  if (ffr < ftgt) { ffr += b.guardMW / G_UP_TICKS; if (ffr > ftgt) ffr = ftgt; }
  else if (ffr > ftgt) { ffr -= G_DOWN; if (ffr < ftgt) ffr = ftgt; }
  if (spent && ffr <= 0 && f >= G_REARM) b.ffrFiredTick = -1;

  // inverter rating and SoC (with the SoC power taper): trim PFR first, then the guard, then
  // the schedule itself (README §11 step 4)
  let hi = BATT_MW, lo = -BATT_MW;
  if (soc < TAPER_LO_MWH) hi = soc <= 0 ? 0 : Math.min(BATT_MW, Math.sqrt(TAPER_2R * soc * V_S_PER_H));
  else if (soc > TAPER_HI_MWH) lo = soc >= BATT_MWH ? 0 : 0 - Math.min(BATT_MW, Math.sqrt(TAPER_2R * (BATT_MWH - soc) * V_S_PER_H / CHARGE_EFF));
  if (eff + pfr + ffr > hi) {
    if (pfr > 0) { pfr = hi - eff - ffr; if (pfr < 0) pfr = 0; }
    if (eff + pfr + ffr > hi) { ffr = hi - eff - pfr; if (ffr < 0) ffr = 0; }
    if (eff + pfr + ffr > hi) eff = hi - pfr - ffr;
  } else if (eff + pfr + ffr < lo) {
    if (pfr < 0) { pfr = lo - eff - ffr; if (pfr > 0) pfr = 0; }
    if (eff + pfr + ffr < lo) eff = lo - pfr - ffr;
  }
  eff += 0; pfr += 0; ffr += 0;
  b.pfrMW = pfr; b.ffrMW = ffr;
  const bOut = eff + pfr + ffr + 0;
  b.outMW = bOut;
  let s2 = soc;
  if (bOut > 0) s2 -= bOut * DT_H; else if (bOut < 0) s2 -= bOut * CHARGE_EFF * DT_H;
  b.socMWh = s2 < 0 ? 0 : s2 > BATT_MWH ? BATT_MWH : s2 + 0;
  acc.battOutMWs += bOut * DT;
  if (bOut < 0) { acc.battChargeMWs -= bOut * DT; acc.battAbsMWs -= bOut * DT; } else acc.battAbsMWs += bOut * DT;

  // 6. relays on the measured frequency: UFLS (H-6), OFGS (H-7). One comparison when idle:
  // a timer only runs while f is past the first threshold, so if neither this tick's nor
  // the last tick's frequency is, every timer is already 0.
  let stagesNow = 0;
  if (f < UFLS_TOP || fPrev < UFLS_TOP) {
    const uf = S.ufls, timer = uf.timerS, operated = uf.operated;
    for (let k = 0; k < NUF; k++) {
      if (operated[k]) continue;
      if (f < UFLS_HZ[k]) {
        const n = Math.round(timer[k] / DT) + 1;
        if (n >= UFLS_TICKS) {
          const before = S.city.shedFrac;
          const ids = fleet.operateUfls(S, k);
          stagesNow++;
          if (emit) out.push({tick: t, kind: 'ufls', stage: k + 1, districts: ids, mw: S.env.demandMW * (S.city.shedFrac - before) + 0, cue: 'clack'});
        } else timer[k] = n * DT;
      } else if (timer[k] !== 0) timer[k] = 0;
    }
  }
  if (f > OFGS_BOTTOM || fPrev > OFGS_BOTTOM) {
    const of = S.ofgs, timer = of.timerS, tripped = of.tripped;
    for (let k = 0; k < NOF; k++) {
      if (tripped[k]) continue;
      if (f > OFGS_HZ[k]) {
        const n = Math.round(timer[k] / DT) + 1;
        if (n >= OFGS_TICKS) {
          const mw = S.ren.windMW * OFGS_FRAC + 0;
          fleet.setOfgsStage(S, k, true);
          if (emit) out.push({tick: t, kind: 'ofgs', stage: k + 1, mw});
        } else timer[k] = n * DT;
      } else if (timer[k] !== 0) timer[k] = 0;
    }
  }

  // 7. load (README §5 phys): served, shed, load relief (positive when f < F0: load falls)
  const demand = S.env.demandMW, shedFrac = S.city.shedFrac;
  const shed = demand * shedFrac + 0;
  const served = demand * (1 - shedFrac) + S.city.coldLoadMW - S.dr.mw + 0;
  const relief = served * LOAD_RELIEF * (F0 - f) / F0 + 0;
  const load = served - relief;

  // 8. swing equation: df/dt = F0 dP / (2 Ek)
  const other = S.tie.flowMW + S.ren.windMW * (1 - S.ofgs.trippedFrac) + S.ren.solarMW + S.rert.outMW;
  const schedSupply = schedSum + other + eff + 0;
  const supply = outSum + other + bOut + 0;
  const imb = supply - load + 0;
  const ek = ph.ekMWs;
  let fn = f, why = '';
  if (ek <= 0) why = 'inertia';
  else {
    fn = f + F0 * imb * DT / (2 * ek);
    if (fn < F_LO) fn = F_LO; else if (fn > F_HI) fn = F_HI;
  }

  // 9. collapse (H-7): extreme limits at once; graded bands on time below their edges
  if (why === '') {
    if (fn <= BLACK_LO || f <= BLACK_LO) why = 'under';
    else if (fn >= BLACK_HI || f >= BLACK_HI) why = 'over';
    else {
      const band = S.collapse.bandS;
      for (let j = 0; j < NB; j++) {
        if (fn < BAND_HI[j]) {
          const n = Math.round(band[j] / DT) + 1;
          band[j] = n * DT;
          if (n >= BAND_TICKS[j]) why = 'under';
        } else if (band[j] !== 0) band[j] = 0;
      }
    }
  }
  ph.fHz = fn;
  if (why !== '') {
    S.black = true;
    if (emit) out.push({tick: t, kind: 'black', fHz: fn, why});
  }

  // 10. readouts (the K-11 identity holds by construction), trace, accumulators
  ph.schedSupplyMW = schedSupply; ph.supplyMW = supply; ph.servedMW = served; ph.loadReliefMW = relief;
  ph.loadMW = load; ph.imbalanceMW = imb; ph.inertiaMW = 0 - imb; ph.govTotalMW = govSum; ph.shedMW = shed;

  const ci = S.contIdx;
  if (ci >= 0) {
    const rec = S.conts[ci];
    if (t < rec.watchEndTick) {
      trace(rec, t, f, fn, imb, bOut, ffr, govSum, relief, shed, stagesNow);
      if (why !== '') traceLast(rec, t + 1, fn);
    }
  }

  if (acc.ticks === 0) { acc.fMinHz = f; acc.fMaxHz = f; }
  else if (f < acc.fMinHz) acc.fMinHz = f;
  else if (f > acc.fMaxHz) acc.fMaxHz = f;
  acc.fSumHz += f;
  acc.ticks += 1;
  acc.shedMWs += shed * DT;
  acc.servedMWs += load * DT;
  acc.loadReliefMWs += relief * DT;
}

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
 * (Steps 3-5 run in the order units, then battery; the result is the same, as neither
 * reads the other.) See the header of this file for the modelling choices.
 * @param {object} state
 * @param {Array<object>} out event records
 */
export function tick(state, out) {
  advance(state, out, true);
}

// ------------------------------------------------------------------ TRIP PREVIEW (K-10)
//
// The preview runs advance() on the STATE ITSELF, after saving every field the engine (and
// the preview's own target / guard override) can write into ONE module-level backup built
// once, and restores them bit-exactly before returning (in a finally). So it still never
// clones state, never allocates per call and leaves state exactly as it found it (tested by
// hash and by interleaving), and advance() only ever sees state-shaped objects: a separate
// scratch object made every field access in the tick engine polymorphic, which cost ~90 ns
// per live tick (~0.4 s a day; integration measured 130 vs 220 ns).

const zeros = n => new Array(n).fill(0);
const falses = n => new Array(n).fill(false);
const newCaught = () => ({inertiaMW: 0, batteryMW: 0, guardMW: 0, governorsMW: 0, loadReliefMW: 0, uflsMW: 0});

// The backup: state's names, every field advance() or previewTrip() may write.
const BK = {
  tick: 0, black: false, contIdx: -1, conts: null,
  phys: {fHz: F0, fHist: new Array(L).fill(F0), rocofHzS: 0, ekMWs: 0, schedSupplyMW: 0, supplyMW: 0, servedMW: 0,
    loadMW: 0, imbalanceMW: 0, inertiaMW: 0, govTotalMW: 0, loadReliefMW: 0, shedMW: 0},
  units: M.map(() => ({mode: 'off', sync: false, schedMW: 0, govMW: 0, outMW: 0})),
  battery: {schedMW: 0, guardMW: 0, pfrMW: 0, ffrMW: 0, ffrFiredTick: -1, outMW: 0, socMWh: 0, ufSuspend: false},
  tieFlowMW: 0, demandMW: 0,
  districts: [], shedFrac: 0, coldLoadMW: 0,
  uflsTimerS: zeros(NUF), uflsOperated: falses(NUF),
  ofgsTimerS: zeros(NOF), ofgsTripped: falses(NOF), ofgsTrippedFrac: 0,
  bandS: zeros(NB), storageMWh: 0,
  acc: fleet.newAcc(),
};

// The preview's own contingency record (traced by advance() while it runs): swapped in as
// state.conts = [SREC], contIdx 0, for the run. Same keys, same order as fleet.startContingency.
const SREC = {n: 0, startTick: 0, cause: 'unit', id: '', lostMW: 0, fStartHz: F0, ekBeforeMWs: 0, ekAfterMWs: 0, rocofHzS: 0,
  extremeHz: F0, extremeTick: 0, pre: newCaught(), caught: newCaught(), uflsStages: 0, contained: true,
  backInBandTick: -1, watchEndTick: 0, secureByTick: 0};
const SCONTS = [SREC];

function copyAcc(from, to) {
  for (let i = 0; i < NU; i++) to.unitMWs[i] = from.unitMWs[i];
  to.battOutMWs = from.battOutMWs; to.battChargeMWs = from.battChargeMWs; to.battAbsMWs = from.battAbsMWs;
  to.shedMWs = from.shedMWs; to.servedMWs = from.servedMWs; to.loadReliefMWs = from.loadReliefMWs;
  to.fMinHz = from.fMinHz; to.fMaxHz = from.fMaxHz; to.fSumHz = from.fSumHz; to.ticks = from.ticks;
  to.startCost = from.startCost;
}

function save(state) {
  BK.tick = state.tick; BK.black = state.black; BK.contIdx = state.contIdx; BK.conts = state.conts;
  const p = state.phys, q = BK.phys;
  q.fHz = p.fHz; q.rocofHzS = p.rocofHzS; q.ekMWs = p.ekMWs; q.schedSupplyMW = p.schedSupplyMW; q.supplyMW = p.supplyMW;
  q.servedMW = p.servedMW; q.loadMW = p.loadMW; q.imbalanceMW = p.imbalanceMW; q.inertiaMW = p.inertiaMW;
  q.govTotalMW = p.govTotalMW; q.loadReliefMW = p.loadReliefMW; q.shedMW = p.shedMW;
  for (let i = 0; i < L; i++) q.fHist[i] = p.fHist[i];
  for (let i = 0; i < NU; i++) {
    const u = state.units[i], v = BK.units[i];
    v.mode = u.mode; v.sync = u.sync; v.schedMW = u.schedMW; v.govMW = u.govMW; v.outMW = u.outMW;
  }
  const b = state.battery, c = BK.battery;
  c.schedMW = b.schedMW; c.guardMW = b.guardMW; c.pfrMW = b.pfrMW; c.ffrMW = b.ffrMW; c.ffrFiredTick = b.ffrFiredTick;
  c.outMW = b.outMW; c.socMWh = b.socMWh; c.ufSuspend = b.ufSuspend;
  BK.tieFlowMW = state.tie.flowMW; BK.demandMW = state.env.demandMW;
  const ds = state.city.districts, sd = BK.districts;
  while (sd.length < ds.length) sd.push({dark: false, shedBy: null, darkSinceS: -1, restoredAtS: -1});
  for (let d = 0; d < ds.length; d++) {
    const a = ds[d], z = sd[d];
    z.dark = a.dark; z.shedBy = a.shedBy; z.darkSinceS = a.darkSinceS; z.restoredAtS = a.restoredAtS;
  }
  BK.shedFrac = state.city.shedFrac; BK.coldLoadMW = state.city.coldLoadMW;
  for (let k = 0; k < NUF; k++) { BK.uflsTimerS[k] = state.ufls.timerS[k]; BK.uflsOperated[k] = state.ufls.operated[k]; }
  for (let k = 0; k < NOF; k++) { BK.ofgsTimerS[k] = state.ofgs.timerS[k]; BK.ofgsTripped[k] = state.ofgs.tripped[k]; }
  BK.ofgsTrippedFrac = state.ofgs.trippedFrac;
  for (let j = 0; j < NB; j++) BK.bandS[j] = state.collapse.bandS[j];
  BK.storageMWh = state.hydro.storageMWh;
  copyAcc(state.acc, BK.acc);
}

function restore(state) {
  state.tick = BK.tick; state.black = BK.black; state.contIdx = BK.contIdx; state.conts = BK.conts;
  BK.conts = null;
  const p = state.phys, q = BK.phys;
  p.fHz = q.fHz; p.rocofHzS = q.rocofHzS; p.ekMWs = q.ekMWs; p.schedSupplyMW = q.schedSupplyMW; p.supplyMW = q.supplyMW;
  p.servedMW = q.servedMW; p.loadMW = q.loadMW; p.imbalanceMW = q.imbalanceMW; p.inertiaMW = q.inertiaMW;
  p.govTotalMW = q.govTotalMW; p.loadReliefMW = q.loadReliefMW; p.shedMW = q.shedMW;
  for (let i = 0; i < L; i++) p.fHist[i] = q.fHist[i];
  for (let i = 0; i < NU; i++) {
    const u = state.units[i], v = BK.units[i];
    u.mode = v.mode; u.sync = v.sync; u.schedMW = v.schedMW; u.govMW = v.govMW; u.outMW = v.outMW;
  }
  const b = state.battery, c = BK.battery;
  b.schedMW = c.schedMW; b.guardMW = c.guardMW; b.pfrMW = c.pfrMW; b.ffrMW = c.ffrMW; b.ffrFiredTick = c.ffrFiredTick;
  b.outMW = c.outMW; b.socMWh = c.socMWh; b.ufSuspend = c.ufSuspend;
  state.tie.flowMW = BK.tieFlowMW; state.env.demandMW = BK.demandMW;
  const ds = state.city.districts, sd = BK.districts;
  for (let d = 0; d < ds.length; d++) {
    const a = ds[d], z = sd[d];
    a.dark = z.dark; a.shedBy = z.shedBy; a.darkSinceS = z.darkSinceS; a.restoredAtS = z.restoredAtS;
  }
  state.city.shedFrac = BK.shedFrac; state.city.coldLoadMW = BK.coldLoadMW;
  for (let k = 0; k < NUF; k++) { state.ufls.timerS[k] = BK.uflsTimerS[k]; state.ufls.operated[k] = BK.uflsOperated[k]; }
  for (let k = 0; k < NOF; k++) { state.ofgs.timerS[k] = BK.ofgsTimerS[k]; state.ofgs.tripped[k] = BK.ofgsTripped[k]; }
  state.ofgs.trippedFrac = BK.ofgsTrippedFrac;
  for (let j = 0; j < NB; j++) state.collapse.bandS[j] = BK.bandS[j];
  state.hydro.storageMWh = BK.storageMWh;
  copyAcc(BK.acc, state.acc);
}

/**
 * TRIP PREVIEW (K-10, H-4 SECURE, K-5 guard ring, K-13 restore preview). Runs the tick
 * engine with schedules, demand and renewables frozen (no grid seconds), after removing
 * `target`, for up to PREVIEW_HORIZON_S (stopping early once the nadir has passed and
 * frequency has risen for ROCOF_WINDOW_S). Pure as seen from outside: it runs on state
 * itself between a save and an exact restore (see above), so state is unchanged on return.
 *
 * opts.guardMW overrides the battery guard (K-5: the ring moves the needle live). The
 * override also clamps the scheduled battery output to +-(BATT_MW - guardMW), and the MW
 * that clamp removes (in effective terms: after the SoC and H-10 rules) are covered by the
 * other scheduled supply (as if AGC had moved them to the units), so the preview starts
 * balanced. The run carries them as a net-demand offset (env.demandMW - moved), which is
 * what tests/physics.test.js "K-5: previewTrip opts.guardMW clamps..." specifies (the same
 * fleet, battery idle, 400 MW less demand, within 0.005 Hz); it differs from a supply offset
 * only in the load-relief base (0.5% x moved per 1% of frequency). The same MW come off
 * pre.batteryMW, so caught stays a change and still sums to lostMW.
 *
 * @param {object} state
 * @param {{kind:'unit'|'link'|'load'|'district'|'none', id:string, mw?:number}} target
 *   'unit' trips that machine; 'link' trips the tie; 'load' removes mw of load (mw > 0);
 *   'district' closes that dark district with its cold-load MW (restore preview, K-13);
 *   'none' (as fleet.largestContingency returns with nothing online) removes nothing.
 * @param {{guardMW?:number}} [opts]
 * @returns {{nadirHz:number, nadirS:number, lostMW:number, uflsStages:number, black:boolean,
 *   caught:{inertiaMW:number, batteryMW:number, guardMW:number, governorsMW:number, loadReliefMW:number, uflsMW:number}}}
 *   caught = each source's MW at the nadir MINUS its value before the trip (the state's
 *   readouts, fleet.preTrip): batteryMW is PFR plus the charge suspension
 *   (outMW - ffrMW), guardMW the FFR layer, uflsMW the load shed. With frozen schedules
 *   their sum is lostMW minus the tripped unit's pre-trip govMW (0 at 50 Hz). For target
 *   'load' or 'district', nadirHz is the extreme (the PEAK for 'load'); for 'district' the
 *   relit district's share of demand is part of the event, so pre.uflsMW leaves it out and
 *   caught still sums to lostMW (its cold-load MW). nadirS is the time
 *   from the trip to the extreme. A target that is not there (a unit off the bars, a
 *   tripped link, a lit district) loses 0 MW and shows the state's own trajectory.
 */
export function previewTrip(state, target, opts) {
  // Validate everything before touching state.
  const kind = target.kind;
  let ui = -1, di = -1;
  if (kind === 'unit') {
    ui = fleet.unitIndex(target.id);
    if (ui < 0) throw new Error('previewTrip: unknown unit ' + target.id);
  } else if (kind === 'district') {
    const ds = state.city.districts;
    for (let d = 0; d < ds.length; d++) if (ds[d].id === target.id) { di = d; break; }
    if (di < 0) throw new Error('previewTrip: unknown district ' + target.id);
  } else if (kind !== 'link' && kind !== 'load' && kind !== 'none') { // 'none': fleet.largestContingency with nothing online
    throw new Error('previewTrip: unknown target kind ' + kind);
  }
  const guard = opts && opts.guardMW !== undefined;
  if (guard && !(opts.guardMW >= 0 && opts.guardMW <= BATT_MW)) throw new Error('previewTrip: opts.guardMW must be within 0..BATT_MW');

  save(state);
  try {
    return run(state, kind, ui, di, target, guard ? opts.guardMW : -1);
  } finally {
    restore(state);
  }
}

// The preview proper, on state (restored by the caller). guardMW < 0: no override.
function run(state, kind, ui, di, target, guardMW) {
  const b = state.battery;
  let lost = 0;
  // A district restore first: its cold load is on the true demand (before the guard offset).
  if (kind === 'district') {
    const dist = state.city.districts[di];
    if (dist.dark) {
      lost = fleet.districtColdLoadMW(state, di);
      fleet.setDistrictDark(state, di, false, null);
      const surge = lost - state.env.demandMW * dist.share;
      if (surge > 0) state.city.coldLoadMW += surge;
      if (dist.uflsStage > 0) fleet.rearmUfls(state, dist.uflsStage - 1);
    }
  }
  let moved = 0;
  if (guardMW >= 0) {
    const cap = BATT_MW - guardMW, f = state.phys.fHz;
    const eff0 = effSchedMW(b, f);
    b.guardMW = guardMW;
    if (b.schedMW > cap) b.schedMW = cap; else if (b.schedMW < -cap) b.schedMW = -cap;
    moved = eff0 - effSchedMW(b, f);
    state.env.demandMW -= moved; // net demand: the MW other scheduled supply now covers (see JSDoc)
  }

  if (kind === 'unit') {
    const u = state.units[ui];
    if (u.sync) {
      lost = u.outMW;
      u.mode = 'tripped'; u.sync = false; u.schedMW = 0; u.govMW = 0; u.outMW = 0;
      state.phys.ekMWs = fleet.ekMWs(state);
    }
  } else if (kind === 'link') {
    if (!state.tie.tripped) { lost = state.tie.flowMW; state.tie.flowMW = 0; }
  } else if (kind === 'load') {
    lost = 0 - target.mw;
    state.env.demandMW -= target.mw;
  }

  // The preview's contingency record: pre = the state's readouts before the trip
  // (fleet.preTrip, from the backup), less the MW the guard override moved off the battery.
  const t0 = state.tick, f0 = state.phys.fHz, p = BK.phys, bb = BK.battery, pre = SREC.pre, cg = SREC.caught;
  SREC.startTick = t0; SREC.lostMW = lost + 0; SREC.fStartHz = f0; SREC.rocofHzS = 0;
  SREC.extremeHz = f0; SREC.extremeTick = t0; SREC.uflsStages = 0; SREC.contained = true;
  SREC.watchEndTick = t0 + HORIZON_TICKS;
  pre.inertiaMW = p.inertiaMW; pre.batteryMW = bb.outMW - bb.ffrMW - moved;
  pre.guardMW = bb.ffrMW; pre.governorsMW = p.govTotalMW; pre.loadReliefMW = p.loadReliefMW;
  // a restored district's MW are the event (lostMW), not a UFLS response: shed baseline without it
  pre.uflsMW = p.shedMW - BK.demandMW * (BK.shedFrac - state.city.shedFrac);
  cg.inertiaMW = 0; cg.batteryMW = 0; cg.guardMW = 0; cg.governorsMW = 0; cg.loadReliefMW = 0; cg.uflsMW = 0;
  state.conts = SCONTS; state.contIdx = 0;
  fleet.resetAcc(state.acc);

  // Early stop (README §10): once the extreme has passed and f has recovered for
  // ROCOF_WINDOW_S. Nothing in frozen-schedule physics can then make a deeper extreme
  // inside the horizon, except the battery running dry (its output would step off) or,
  // with UF_RESUME_LINEAR false, charging stepping back on; in those cases run on.
  const falls = lost >= 0;
  for (let n = 1; n <= HORIZON_TICKS; n++) {
    advance(state, null, false);
    state.tick += 1;
    if (state.black) break;
    const fn = state.phys.fHz;
    if (SREC.extremeTick > t0 && state.tick - SREC.extremeTick >= ROCOF_TICKS &&
        (falls ? fn > SREC.extremeHz : fn < SREC.extremeHz) &&
        b.socMWh > BATT_MW * (HORIZON_TICKS - n) * DT_H &&
        (UF_LINEAR || !b.ufSuspend || b.schedMW >= 0)) break;
  }
  traceLast(SREC, state.tick, state.phys.fHz);
  return {nadirHz: SREC.extremeHz, nadirS: (SREC.extremeTick - t0) * DT, lostMW: lost + 0, uflsStages: SREC.uflsStages,
    black: state.black,
    caught: {inertiaMW: cg.inertiaMW, batteryMW: cg.batteryMW, guardMW: cg.guardMW, governorsMW: cg.governorsMW,
      loadReliefMW: cg.loadReliefMW, uflsMW: cg.uflsMW}};
}

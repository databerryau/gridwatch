// sim/autopilot.js: the L-0 pre-dispatch plan, PAR (the fixed reference dispatcher) and the
// player proxies (spec L-0, S-4, S-11, S-12, P-6, O-3 "Marg runs covered controls", §6).
//
// STAGE B owner: "autopilot" (also tools/par.js). Contract: sim/README.md, "autopilot.js".
// Information barrier (S-4): everything here reads ONLY observe(state) output. It must not
// import sim/events.js, sim/weather.js or content/, and must never see state, state.ext or
// the seed (tests/sim-lint.test.js). It may import sim/params.js (public constants) and
// sim/step.js (runPar is the harness around decide()). runPar alone touches state: it
// steps it, reads tick / over / log, asks step.inWatch(state) when to decide, and feeds
// inputs through step.applyInput so it knows which were accepted (origins[]).
//
// Inputs par makes come in three kinds, told apart by runPar's `origins`:
//   'plan'   the L-0 plan: ONE planLoad input at 04:30 (Phase 1a: the plan lives in state and
//            the grid's executor moves the levers, the tie and the booked starts and stops,
//            K-2, L-6), and planOnly's re-flows of it. The system's schedule, not a discrete
//            action, so it is NOT paced.
//   'replan' par's own re-dispatch after an action (below), also a planLoad from that moment.
//            NOT paced either: the re-plan is part of the action it follows (SPEC S-4, §8.2
//            "Par re-plans after every action"), and the player has the same RE-DISPATCH
//            (replan(): app/system.js in the game, decision A-1; app/assist.js on the bench).
//   'ruleN'  a discrete action from S-4 rule N (1..9), paced: at most one per
//            PAR_ACTION_GAP_REAL_S of the reference playback (refRealSeconds). Rule 7's action
//            is itself a planLoad (its re-dispatch).
// planLoads wait in memo.outbox until planUpdates() returns them (runPar and the assist send
// them right after decide()'s action).
//
// How par edits its plan (SPEC S-4 and §8.2):
//   * Every discrete action AMENDS the plan (a RE-PLAN): after it, par re-dispatches its
//     keyframes for every lever and the tie from now to 04:00 over the commitment it now
//     has (present modes, pending plan starts, its own starts), with the latest forecast
//     (obs.forecast, 4.5 h) and the day-ahead forecast beyond it, and sends it as a planLoad
//     (origin 'replan'). It is not an extra discrete action; the
//     review measured what it is worth (without any re-plan par's clean days fell from 89
//     to 42 of 100), which is why the player gets the same RE-PLAN.
//   * Par starts from the L-0 plan without its stops (makePlan): it decommits by rule 4 only.
//   * Rule 7 (extension): "keep units at or below PAR_MAX_LOADING unless that would shed
//     load" is applied by that re-dispatch; rule 7 itself fires when a unit's base point
//     is above the limit, when AGC carries more than PAR_REBASE_MW, or when the plan misses
//     the forecast for the coming column by more than PAR_REBASE_MW (a red or blue gap on
//     the Live Stack, L-5). Its input is the amended plan (a planLoad), when it moves a lever
//     in the first column and the plan over the next hour by enough.
//   * Rule 2 (v4 form): H-4 checks N-1 twice, in minutes (R5 >= L) and in seconds (TRIP
//     PREVIEW nadir). S-4's rule 2 names only the minutes half; v4 physics trips UFLS on
//     an uncovered 650-800 MW loss (the integration report measured 48.7-49.2 Hz), so par
//     also acts on the preview: it raises the GUARD (contingency FFR, as AEMO enables
//     contingency raise FCAS for the largest risk), then starts a peaker. When anything is
//     short now it releases the GUARD at once (the battery is then worth more to AGC).
//   * Par's plan never exports for profit (a price-taking export at the evening peak
//     would spend the reserve), and caps the tie import at the largest unit's planned
//     output so the tie is not the unique largest contingency (as AEMO constrains flows),
//     unless the P50 would otherwise be short ("unless that would shed load"). Rules 1 and
//     2 read "maximum import" as that secure maximum.
//   * Rule 1 acts on supply trips (unit, link). A load trip (the smelter) raises
//     frequency, and starting a peaker would be wrong.
//   * Rule 5 reads "hold water" as the rules lab's controller did: keep PAR_WATER_KEEP_MWH
//     in storage until PAR_WATER_HOLD_UNTIL_H (hydro runs at its water value above that
//     line), then a keep line falling linearly to a small reserve at PAR_WATER_EMPTY_BY_H.
//     A shortfall may use kept water down to the reserve, never to HYDRO_STOP_MWH (where
//     the grid unloads the station at its ramp). Rule 5's action starts every hydro machine
//     for the release.
//   * Rule 6's discharge compares the ENERGY price (price minus the P-7 scarcity adder)
//     with the plan's marginal offer; outside the discharge window par recharges a battery
//     AGC has drawn below PAR_BATT_RESERVE_FRAC (extension: primary response overnight).
//     A discharge order past the window's end or at the reserve is ended right after rule 1
//     (rule6End, review fix: battery orders never expire, and in rule order the end waited
//     behind rules 2-5 while the night's pace allowed one action per ~105 grid-min).
//   * Rule 2 raises the GUARD only as far as the battery's energy sustains it for
//     GUARD_SUSTAIN_S (review fix); otherwise its action is the next peaker.
//   * Rule 8 (tuning pass) makes reserve diesel an emergency: an adequacy walk over the
//     forecast counts firm capacity honestly (units and the tie at their real limits, and an
//     energy-limited pool of water, DR call-hours and battery energy above its reserve), arms
//     only on a shortfall the diesel can still reach with its 20-min lead (or earlier when the
//     shortfall is energy-driven and arming now saves the pool), calls DR on a present
//     shortfall hydro and the battery cannot carry (saving calls for the peak), and stands the
//     diesel down when the walk without it is clean. Rule 4 asks the stand-down first (the
//     dearest resource). See rule8().
//   * Rule 1, when no peaker is left to start after a supply trip and units, tie and diesel
//     cannot carry present net demand, calls DR (the next fast block) at once: at the evening
//     profile's pace the next action came ~7.5 grid-min later, after FOS directed shedding.
//   * Rule 9 (extension, README §12) restores only a district whose cold load is at most
//     L and whose estimated dip (the TRIP PREVIEW scaled by coldLoad / L) holds the K-13
//     restore preview's line (SECURE_NADIR_HZ + PREVIEW_MARGIN_HZ), so the restore input,
//     which runs the real restore preview, is seldom refused. Phase 2a: the cap at L is lifted
//     while the dispatch is spilling at least the district's pickup (in the belly L is a machine
//     at its floor, smaller than any pickup); the estimate still decides.
//   * planOnly re-dispatches the L-0 plan for the lit load while districts are dark
//     (reflowLit), as NEM dispatch targets metered demand (L-0: never black with no input).
// The S-4 pace applies to every discrete action; at the reference playback's night roll
// (2,100x) that is one action per ~105 grid-minutes, so restores after a late shed are slow.
//
// Phase 2a, the belly (SPEC S-14 rules 2-4, P-12; desk/README.md C-12, §21.3, §25):
//   * LIT OPERATIONAL DEMAND. With rooftop PV a dark district takes its roofs off with its
//     feeder (P-12), so what is left is not a proportional slice of the operational demand. The
//     dispatch (context), the lit-load re-flow, the adequacy walk and rule 4's evening read the
//     present from obs.demand.litMW and a forecast column as (P50 + rooftop) x (1 - dark
//     customers) - rooftop x (1 - dark rooftop) (litMW; darkShare; the dark rooftop share is by
//     nameplate). With no rooftop this is the old P50 x (1 - shed).
//   * S-14 rule 2 joins rule 6 as a union with its window: par charges whenever the price is at
//     or below $0 or the dispatch is spilling more than SURPLUS_MIN_MW (obs.wind.autoMW +
//     obs.solar.autoMW; C-6), while the battery has room below PAR_BATT_CHARGE_TO. The order is
//     the present charge order plus what is still being spilled (the sim's cut is net of the
//     order), within PAR_BATT_CHARGE_MAX_MW: free power, never fuel. An order that takes the
//     whole spill leaves nothing spilled and a positive price, so it is HELD while the surplus
//     still feeds it, less what it would be buying instead: thermal output above the floors,
//     hydro, and the tie above its export limit (boughtMW). The price alone starts no order
//     outside the window (with nothing spilled there is no free power to take); it keeps one
//     going. On the classic day the price never reaches $0 and nothing is spilled, so the rule
//     cannot fire there.
//   * S-14 rule 3 as reworded (C-12): export to the cap, charge, and the dispatch curtails the
//     rest. Nothing for par to send: its plan already takes every unit to its floor and the tie
//     to the export limit in a surplus (clearColumn), and the sim holds back wind and solar.
//   * S-14 rule 4 joins rule 4: once no gas unit is committed, ONE coal machine is stopped only
//     if MSL2 is forecast for PAR_COAL_MSL2_H or more AND the evening holds N-1 without it until
//     it could be back at minimum load (T4, the minimum down time from breaker open to the next
//     START, then T1, auto-sync and T2: a 10:00 stop is back at 21:14). Expected never to fire on
//     real days (MSL2 for 3 h does not occur); measured, not tuned (tools/par.js prints the count).
//   * A battery order is counted in the dispatch only for the energy behind it (batteryOrder): a
//     discharge until PAR_BATT_RESERVE_FRAC, a charge until full, at most the inverter less the
//     GUARD. That is how replan() reads the PLAYER's order, and how par reads its own: a charge
//     until PAR_BATT_CHARGE_TO, a discharge until the reserve and no later than 22:00. Par's night
//     recharge (ordered after the charge window) is therefore in its plan; before, it was not.
//   * Rule 7 reads AGC's request net of what the dispatch is lowering in a surplus: while wind or
//     solar is being spilled AGC takes the units down to MIN beyond their regulating bands (C-6),
//     which is the dispatch at work and not a plan gone stale; and a surplus the plan already
//     shows (its negative gap) is not a miss of the forecast.

import {V} from './params.js';
import {createState, step, observe, hashState, applyInput, inWatch} from './step.js';

// ------------------------------------------------------------------ constants (hoisted)

const TPS = V.TICKS_PER_S, DAY_S = V.DAY_S, DAY_TICKS = V.DAY_TICKS;
const S_PER_H = V.S_PER_H, S_PER_MIN = V.S_PER_MIN, DAY_START_H = V.DAY_START_H;
const START_S = V.PLAYER_START_S, STEP_S = V.FC_STEP_S, EPS = V.MW_EPS;
const NEVER = DAY_S + DAY_S; // "no stop planned" (a local sentinel; never stored)
const COL_H = STEP_S / S_PER_H;

const M = V.MACHINES, NU = M.length, SIDS = V.STATION_IDS, NS = SIDS.length;
const STA = SIDS.map(id => V.STATIONS[id]);
const ST_OF = M.map(m => SIDS.indexOf(m.station));
const HYDRO = SIDS.indexOf('hydro');
const RAMP_COL = M.map(m => m.rampMWs * STEP_S);
// A station that cannot cross its range within two columns is pre-ramped (look-ahead envelope).
const SLOW = STA.map(st => 2 * st.rampMWMin / S_PER_MIN * STEP_S < st.ratingMW - st.minMW);
// Peaker: a machine that reaches MIN within the P-5 start window (T1 + T2, auto-sync not counted).
const PEAKER = M.map(m => m.t1S + m.t2S <= V.STACK_START_WITHIN_S);
const MERIT = M.map(m => m.k).sort((a, b) => M[a].offer - M[b].offer || a - b);
const MERIT_DESC = MERIT.slice().reverse();

const TIE_MAX = V.TIE_MAX_MW, TIE_COL = V.TIE_RAMP_MW_MIN / S_PER_MIN * STEP_S;
const BATT_MW = V.BATT_MW, BATT_MWH = V.BATT_MWH, BATT_EFF = V.BATT_CHARGE_EFF, SUSTAIN_H = V.BATT_R5_SUSTAIN_H;
const AUTO_SYNC_S = V.AUTO_SYNC_S, DERATE_KEEP = 1 - V.HEAT_THERMAL_DERATE, HEAT_UP = V.HEAT_DEMAND_UPLIFT;
const HYDRO_ALLOC = V.HYDRO_ALLOCATION_MWH, HYDRO_STOP = V.HYDRO_STOP_MWH, WV = V.HYDRO_WATER_VALUE;
const RERT_MW = V.RERT_MW, DR_MW = V.DR_MW, FLOOR_OFFER = V.MIN_LOAD_OFFER;
const R5_MIN = V.R5_WINDOW_MIN;

const PLAN_LOADING = V.PLAN_MAX_LOADING; // L-0: just under the H-2 hot gate
const PAR_LOADING = V.PAR_MAX_LOADING, HOT_GATE = V.HOT_LOADING_FRAC;
const KEYFRAME_MIN = V.PLAN_KEYFRAME_MIN_MW, REFLOW_S = V.PLAN_REFLOW_S;

const GAP_REAL_S = V.PAR_ACTION_GAP_REAL_S, COMPETENT_GAP_REAL_S = V.PROXY_COMPETENT_GAP_REAL_S;
const DECIDE_EVERY_S = V.PAR_DECIDE_EVERY_S;
const TIGHT = V.PAR_TIGHT_RATIO, COMMIT_MARGIN = V.PAR_COMMIT_MARGIN_MW, COMMIT_LEAD_S = V.PAR_COMMIT_LEAD_MIN * S_PER_MIN;
const DECOMMIT_ON_S = V.PAR_DECOMMIT_MIN_ON_MIN * S_PER_MIN, DECOMMIT_CLEAR_S = V.PAR_DECOMMIT_CLEAR_MIN * S_PER_MIN;
const DECOMMIT_EXTRA = V.PAR_DECOMMIT_EXTRA_MW;
const secOfH = h => (h - DAY_START_H) * S_PER_H; // unwrapped hours to grid seconds
const WATER_HOLD_S = secOfH(V.PAR_WATER_HOLD_UNTIL_H), WATER_EMPTY_S = secOfH(V.PAR_WATER_EMPTY_BY_H);
const WATER_FLOOR = HYDRO_STOP + V.PAR_WATER_RESERVE_MWH, WATER_KEEP = V.PAR_WATER_KEEP_MWH;
/** Rule 5's keep line: water par holds back at grid second t (only a shortfall reaches below it). */
function keepMWh(t) {
  if (t < WATER_HOLD_S) return WATER_KEEP;
  if (t >= WATER_EMPTY_S) return WATER_FLOOR;
  return WATER_KEEP + (WATER_FLOOR - WATER_KEEP) * (t - WATER_HOLD_S) / (WATER_EMPTY_S - WATER_HOLD_S);
}
const CHARGE_FROM_S = secOfH(V.PAR_BATT_CHARGE_H[0]), CHARGE_TO_S = secOfH(V.PAR_BATT_CHARGE_H[1]);
const DIS_FROM_S = secOfH(V.PAR_BATT_DISCHARGE_H[0]), DIS_TO_S = secOfH(V.PAR_BATT_DISCHARGE_H[1]);
const CHARGE_TO_MWH = V.PAR_BATT_CHARGE_TO * BATT_MWH, BATT_RESERVE_MWH = V.PAR_BATT_RESERVE_FRAC * BATT_MWH;
const CHARGE_MAX = V.PAR_BATT_CHARGE_MAX_MW, ORDER_TOL = V.PAR_BATT_ORDER_TOL_MW;
const REBASE = V.PAR_REBASE_MW, REBASE_COLS = S_PER_H / STEP_S;
const NADIR_MIN = V.PAR_NADIR_MIN_HZ, NADIR_RELAX = V.PAR_NADIR_RELAX_HZ;
const GUARD_STEP = V.PAR_GUARD_STEP_MW, GUARD_MAX = V.PAR_GUARD_MAX_MW, GUARD_SUSTAIN_H = V.GUARD_SUSTAIN_S / S_PER_H;
const RERT_LOOK_S = V.PAR_RERT_LOOKAHEAD_MIN * S_PER_MIN, RERT_MARGIN = V.PAR_RERT_MARGIN_MW;
const RERT_STANDDOWN_S = V.PAR_RERT_STANDDOWN_MIN * S_PER_MIN, DR_MARGIN = V.PAR_DR_MARGIN_MW;
const NORMAL_LO = V.NORMAL_LO_HZ, RESTORE_MIN_HZ = V.RESTORE_MIN_HZ, SECURE_AGAIN_S = V.SECURE_AGAIN_S;
const RESTORE_NADIR = V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ; // the K-13 restore preview's line (grid.restorePermissive)
// Phase 2a (S-14; desk/README.md C-12).
const SURPLUS_MIN = V.SURPLUS_MIN_MW, MSL2_MW = V.MSL2_MW, MSL_TIE_OUT = V.MSL_TIE_OUT_MW;
const COAL_MSL2_S = V.PAR_COAL_MSL2_H * S_PER_H, COAL_STOPS_DAY = V.PAR_COAL_STOPS_DAY;
const WATER_RELEASE_H = (WATER_EMPTY_S - WATER_HOLD_S) / S_PER_H;

// ------------------------------------------------------------------ proxies

// Rules each proxy runs (S-4 order) and its pace (README autopilot, "Proxies").
const ALL_RULES = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6', 'rule7', 'rule8', 'rule9'];
const PROXIES = {
  par: {rules: ALL_RULES, gapS: GAP_REAL_S, plan: true, stops: false},
  planOnly: {rules: [], gapS: GAP_REAL_S, plan: true, stops: true, reflow: true},
  doNothing: {rules: [], gapS: GAP_REAL_S, plan: false, stops: false},
  lean: {rules: ['rule1', 'rule2', 'rule7', 'rule8', 'rule9'], gapS: GAP_REAL_S, plan: true, stops: true},
  competent: {rules: ALL_RULES, gapS: COMPETENT_GAP_REAL_S, plan: true, stops: false},
  commitAll: {rules: ALL_RULES.filter(r => r !== 'rule4'), gapS: GAP_REAL_S, plan: true, stops: false},
  fuzz: {rules: [], gapS: GAP_REAL_S, plan: false, stops: false},
};
export const PROXY_NAMES = Object.freeze(Object.keys(PROXIES));

// ------------------------------------------------------------------ small helpers

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** P-6 water value at a storage fraction (HYDRO_WATER_VALUE, linear; clamped at both ends). */
function waterValue(frac) {
  if (frac <= WV[0][0]) return WV[0][1];
  for (let j = 1; j < WV.length; j++) {
    if (frac <= WV[j][0]) {
      const a = WV[j - 1], b = WV[j];
      return a[1] + (b[1] - a[1]) * (frac - a[0]) / (b[0] - a[0]);
    }
  }
  return WV[WV.length - 1][1];
}

function latestNews(obs, kind) {
  for (let i = obs.news.length - 1; i >= 0; i--) if (obs.news[i].kind === kind) return obs.news[i];
  return null;
}

/** Grid second at which unit u (observe row, index i) is (or will be) 'on', or -1 if it is not coming. */
function onFromNow(u, i, now, auto) {
  switch (u.mode) {
    case 'on': return now;
    case 'loading': return now + u.timerS;
    case 'ready': return now + (auto ? u.timerS : 0) + M[i].t2S;
    case 'starting': return now + u.timerS + AUTO_SYNC_S + M[i].t2S;
    default: return -1;
  }
}

const committedMode = mode => mode === 'on' || mode === 'loading' || mode === 'starting' || mode === 'ready';
const hydroWet = obs => obs.hydro.storageMWh > HYDRO_STOP + EPS;

/**
 * The dark part of the city (obs only): `shed`, the dark districts' share of the customers, and
 * `roof`, their share of the rooftop PV (a district holds an equal part of its suburb's nameplate;
 * 0 on a scenario with no rooftop). Phase 2a (P-12): the roofs go off with their feeder.
 */
function darkShare(obs) {
  const D = {shed: 0, roof: 0};
  const roofs = obs.rooftop;
  for (const d of obs.districts) {
    if (!d.dark) continue;
    D.shed += d.share;
    if (!roofs || !(roofs.capMW > 0)) continue;
    let inSuburb = 0, capMW = 0;
    for (const x of obs.districts) if (x.suburb === d.suburb) inSuburb++;
    for (const sub of roofs.suburbs) if (sub.id === d.suburb) capMW = sub.capMW;
    D.roof += capMW / inSuburb / roofs.capMW;
  }
  return D;
}

/**
 * Lit operational demand of a forecast column (P-12; the sim's fleet.litDemandMW on the
 * forecast): the lit customers draw (P50 + rooftop) x (1 - shed) and the rooftop still connected
 * comes off it. Not P50 x (1 - shed): a dark district's roofs are off with it. With rooftop zero
 * it is P50 x (1 - shed) exactly (the classic day).
 */
const litMW = (p50, roofMW, D) => (p50 + roofMW) * (1 - D.shed) - roofMW * (1 - D.roof);
/** A forecast's rooftop column (zeros on an observation made before Phase 2a). */
const roofColumn = fc => fc.rooftopMW || fc.demandP50.map(() => 0);
/** A forecast's columns as lit operational demand (litMW over its P50 and its rooftop column). */
function litColumns(fc, D) {
  const roof = roofColumn(fc);
  return fc.demandP50.map((p50, j) => litMW(p50, roof[j], D));
}
/**
 * Plan column k (at grid second t) as lit operational demand from the plan's DAY-AHEAD columns,
 * for the hours beyond the 4.5-h forecast. A heatwave announced after the plan was made lifts the
 * underlying demand (P50 + rooftop) by HEAT_DEMAND_UPLIFT inside its window; the roofs' own heat
 * derate is left out (the autopilot cannot read the scenario's factor).
 */
function litDayAhead(P, k, t, heat, D) {
  const roof = P.fc.roof ? P.fc.roof[k] : 0;
  const late = heat !== null && heat.atS > P.madeAtS && t >= heat.fromS && t < heat.toS;
  return litMW((P.fc.p50[k] + roof) * (late ? 1 + HEAT_UP : 1) - roof, roof, D);
}

// ------------------------------------------------------------------ reference playback (D-2, D-5)

const PROF = V.REF_PROFILE.map(p => ({a: secOfH(p.fromH), b: secOfH(p.toH), rate: p.rate}));
const PROF_FIRST = PROF[0], PROF_LAST = PROF[PROF.length - 1];
const WATCH_REAL = V.REF_WATCH_REAL_S, CARD_REAL = V.REF_RESPOND_CARD_S;
const RESPOND_RATE = V.RESPOND_RATE, RESPOND_MAX = V.RESPOND_MAX_S;

/** Real seconds for grid seconds [a, b) at the D-2 profile alone (first / last rate outside it). */
function profileReal(a, b) {
  if (!(b > a)) return 0;
  let r = 0;
  if (a < PROF_FIRST.a) r += (Math.min(b, PROF_FIRST.a) - a) / PROF_FIRST.rate;
  for (const p of PROF) {
    const lo = Math.max(a, p.a), hi = Math.min(b, p.b);
    if (hi > lo) r += (hi - lo) / p.rate;
  }
  if (b > PROF_LAST.b) r += (b - Math.max(a, PROF_LAST.b)) / PROF_LAST.rate;
  return r;
}

/** Grid seconds until the proxy of `memo` may act again after an action now: its S-4 gap at the D-2 profile's present rate. */
function paceS(now, memo) {
  let rate = PROF_LAST.rate;
  for (let j = PROF.length - 1; j >= 0; j--) if (now < PROF[j].b) rate = PROF[j].rate;
  return PROXIES[memo.proxy].gapS * rate;
}

/** End of a contingency's RESPOND segment at RESPOND_RATE (D-5). */
function respondEnd(c) {
  const max = c.watchEndS + RESPOND_MAX;
  return c.backInBandS < 0 || c.backInBandS > max ? max : Math.max(c.watchEndS, c.backInBandS);
}

/**
 * Reference real seconds for grid seconds [fromS, toS) under the D-2 profile (REF_PROFILE;
 * its hours are UNWRAPPED: h = DAY_START_H + s / 3600, up to 28). Each contingency
 * replaces the profile over its own grid seconds (D-5, the parts inside [fromS, toS)):
 * the watch [startS, watchEndS) costs REF_WATCH_REAL_S in all (pro rata if cut), the
 * respond card REF_RESPOND_CARD_S at watchEndS, then RESPOND runs at RESPOND_RATE from
 * watchEndS until backInBandS (or for RESPOND_MAX_S if it is -1 or later). Before
 * PLAYER_START_H the rate is that of the profile's first segment. Pure; used for the S-4
 * pace rule and by tests. Overlapping contingencies: a watch wins over a RESPOND segment,
 * and each card counts once.
 * @param {number} fromS
 * @param {number} toS
 * @param {Array<{startS:number, watchEndS:number, backInBandS:number}>} conts obs.contingencies
 * @returns {number}
 */
export function refRealSeconds(fromS, toS, conts) {
  if (!(toS > fromS)) return 0;
  const cs = conts || [];
  if (cs.length === 0) return profileReal(fromS, toS);
  const pts = [fromS, toS];
  let r = 0;
  for (const c of cs) {
    const ends = [c.startS, c.watchEndS, respondEnd(c)];
    for (const x of ends) if (x > fromS && x < toS) pts.push(x);
    if (c.watchEndS >= fromS && c.watchEndS < toS) r += CARD_REAL;
  }
  pts.sort((x, y) => x - y);
  for (let j = 1; j < pts.length; j++) {
    const a = pts[j - 1], b = pts[j];
    if (!(b > a)) continue;
    const mid = (a + b) / 2;
    let watchRate = -1, respond = false;
    for (const c of cs) {
      if (mid >= c.startS && mid < c.watchEndS) {
        const w = WATCH_REAL / (c.watchEndS - c.startS);
        if (w > watchRate) watchRate = w;
      } else if (mid >= c.watchEndS && mid < respondEnd(c)) {
        respond = true;
      }
    }
    r += watchRate >= 0 ? (b - a) * watchRate : respond ? (b - a) / RESPOND_RATE : profileReal(a, b);
  }
  return r;
}

// Contingencies as par may count them at decision time: a RESPOND segment still open
// (backInBandS -1) is cut at the present second. The true end is later, and RESPOND costs
// more real time per grid second than any profile segment, so the pace par computes is
// never more than the pace the finished day shows (tests re-check it with the final list).
function paceConts(obs) {
  return obs.contingencies.map(c => ({startS: c.startS, watchEndS: c.watchEndS,
    backInBandS: c.backInBandS >= 0 ? c.backInBandS : Math.max(c.watchEndS, obs.s)}));
}

// ------------------------------------------------------------------ the plan (L-0)

/**
 * An empty plan on the 5-min grid from madeAtS: column k is for time t0 + k x STEP_S, the last at
 * 04:00. This is the dispatcher's working copy (its diagnostic columns: the day-ahead forecast,
 * the planned levers, tie, marginal offer and gap per column); what the grid executes is the plan
 * in state, sent as planLoad inputs (Phase 1a).
 */
function newPlan(madeAtS) {
  const n = Math.max(0, Math.floor((DAY_S - madeAtS) / STEP_S));
  const z = () => new Array(n).fill(0);
  return {madeAtS, t0: madeAtS + STEP_S, stepS: STEP_S, n,
    fc: {p50: z(), wind: z(), solar: z(), price: z(), expLim: z(), roof: z()},
    lever: SIDS.map(() => z()), tie: z(), marg: z(), gap: z(), amended: 0};
}

const colTime = (P, k) => P.t0 + k * STEP_S;

/** A copy of plan P that an amendment may rewrite (fc is read-only there, so it is shared until adopted). */
function copyPlan(P) {
  return Object.assign({}, P, {lever: P.lever.map(a => a.slice()), tie: P.tie.slice(), marg: P.marg.slice(), gap: P.gap.slice(), fc: P.fc});
}
/** First plan column arriving after grid second s. */
const colAfter = (P, s) => Math.max(0, Math.floor((s - P.madeAtS) / STEP_S));

/** Value of a forecast series at lead (s): the present at lead 0, then linear between columns; null beyond it. */
function fcAt(arr, present, fcn, lead) {
  if (fcn <= 0) return null;
  const j = lead / STEP_S - 1;
  if (j <= 0) return present + (arr[0] - present) * clamp(lead / STEP_S, 0, 1);
  if (j > fcn - 1) return null;
  const a = Math.floor(j), f = j - a;
  return a >= fcn - 1 ? arr[fcn - 1] : arr[a] + (arr[a + 1] - arr[a]) * f;
}

/**
 * Everything a dispatch needs about the next columns [k0, n): unit on/off times, the MW
 * the stations and the tie must cover, prices and limits. par = par's rules apply
 * (battery, RERT, DR, a unit still loading, the no-export and tie caps, rule 5, PAR_MAX_LOADING).
 */
function context(obs, P, k0, par, memo, keepStops) {
  const n = P.n, now = obs.s, auto = obs.mode === 'AGC';
  const heat = latestNews(obs, 'heat');
  const cx = {par, k0, n, now, heat,
    on: new Array(NU).fill(-1), off: new Array(NU).fill(-1), avail: obs.units.map(u => u.availMW),
    cover: new Array(n).fill(0), price: new Array(n).fill(0), expLim: new Array(n).fill(0), tieCap: new Array(n).fill(0),
    x0: new Array(NS).fill(0), c0: new Array(NS).fill(0), tie0: obs.tie.flowMW, storage0: obs.hydro.storageMWh,
    loading: par ? PAR_LOADING : PLAN_LOADING,
    holdS: par && memo ? memo.tieHoldS : -1, holdMW: par && memo ? memo.tieHoldMW : 0,
    starts: [], stops: []};
  for (let i = 0; i < NU; i++) {
    const u = obs.units[i];
    cx.on[i] = onFromNow(u, i, now, auto);
    cx.off[i] = cx.on[i] < 0 ? -1 : NEVER;
    if (u.mode === 'on') { cx.x0[ST_OF[i]] += u.schedMW; cx.c0[ST_OF[i]]++; }
  }
  // The commitment booked in the plan in state (obs.plan): pending STARTs (the L-0 commitment,
  // or the player's) always count, and pending STOPs when the plan keeps its stops (the L-0 plan,
  // a re-flow of it, the player's RE-DISPATCH; par decommits by rule 4 only). They are carried
  // into the planLoad the re-dispatch sends, which replaces every entry from now on.
  for (const e of obs.plan.starts) {
    const i = V.MACHINE_IDS.indexOf(e.unit);
    if (e.atS >= now && cx.on[i] < 0 && (obs.units[i].mode === 'off' || obs.units[i].mode === 'tripped')) {
      cx.on[i] = e.atS + obs.units[i].startToMinS; cx.off[i] = NEVER;
      cx.starts.push({unit: e.unit, atS: e.atS});
    }
  }
  if (keepStops) {
    for (const e of obs.plan.stops) {
      const i = V.MACHINE_IDS.indexOf(e.unit);
      if (e.atS >= now && cx.on[i] >= 0) { cx.off[i] = Math.min(cx.off[i], e.atS); cx.stops.push({unit: e.unit, atS: e.atS}); }
    }
  }
  // The dispatch is for the LIT operational demand (Phase 2a, P-12): the present is the sim's own
  // obs.demand.litMW (each suburb's sky as it is, relit roofs still waiting or ramping), a forecast
  // column goes through litMW() (the dark districts' roofs are off with them), and a plan column
  // inside the first forecast step lies between the two (fcAt), as for every other series.
  const D = darkShare(obs);
  // Load the forecast does not carry (the cold-load surge of restored districts, K-13), fading
  // out over COLD_LOAD_DECAY_S as it does in the grid.
  const coldNow = par ? Math.max(0, obs.balance.servedMW + obs.dr.mw - obs.demand.litMW) : 0;
  const ofgs = obs.wind.ofgsTrippedFrac, fc = obs.forecast, fn = fc.n, fcLit = litColumns(fc, D);
  // The battery's order counts for the energy behind it (batteryOrder): wind and solar the
  // dispatch is holding back are NOT netted off: the forecast and the present here are what is
  // AVAILABLE (obs.wind.availMW), so a curtailed present never reads as a low forecast.
  const order = par ? batteryOrder(obs, memo) : NO_ORDER;
  const tieBack = obs.tie.tripped ? now + obs.tie.lockoutS : now;
  const rert = obs.rert, dr = obs.dr;
  // A unit still loading (breaker closed, on its T2 slope to MIN) is no station's until it is on
  // at cx.on[i], but its output is real: the sim's cut counts it as must-run (grid.js surplusMW)
  // and so does the stack's floor (app/planview.js). Par's dispatch, and the game's (replan), count
  // it along its slope until then, so a plan never imports what that unit is already supplying
  // while the sim spills the same MW (final review of Phase 2a: 256 MWh imported while spilling
  // on desk-weekend seed 20261017 as coal 4 came back in the belly).
  const loading = [];
  if (par) for (let i = 0; i < NU; i++) if (obs.units[i].mode === 'loading') loading.push(i);
  for (let k = k0; k < n; k++) {
    const t = colTime(P, k), lead = t - now;
    let lit = fcAt(fcLit, obs.demand.litMW, fn, lead);
    let wind = fcAt(fc.windMW, obs.wind.availMW, fn, lead);
    let solar = fcAt(fc.solarMW, obs.solar.availMW, fn, lead);
    let price = fcAt(fc.neighbourPrice, obs.tie.neighbourPrice, fn, lead);
    let expLim = fcAt(fc.exportLimitMW, obs.tie.exportLimitMW, fn, lead);
    if (lit === null) { // beyond the 4.5-h forecast: the day-ahead values (litDayAhead: with an announced heatwave)
      lit = litDayAhead(P, k, t, heat, D);
      wind = P.fc.wind[k]; solar = P.fc.solar[k]; price = P.fc.price[k]; expLim = P.fc.expLim[k];
    }
    let other = 0;
    if (par) {
      if (t < order.endS) other += order.mw;
      if (rert.armed && !rert.standingDown) other += lead >= rert.leadS ? RERT_MW : rert.outMW;
      if (dr.activeS > 0 && lead < dr.activeS) other += DR_MW;
      other -= coldNow * Math.max(0, 1 - lead / V.COLD_LOAD_DECAY_S);
      for (const i of loading) {
        const u = obs.units[i];
        if (t < cx.on[i] && t < cx.off[i]) other += u.schedMW + (M[i].minMW - u.schedMW) * clamp(lead / Math.max(1, cx.on[i] - now), 0, 1);
      }
    }
    cx.cover[k] = lit - wind * (1 - ofgs) - solar - other;
    cx.price[k] = price;
    cx.expLim[k] = expLim;
    cx.tieCap[k] = t < tieBack ? 0 : TIE_MAX;
  }
  return cx;
}

const NO_ORDER = Object.freeze({mw: 0, endS: -1});

/**
 * The battery's order as the dispatch counts it: {mw (+ discharge, - charge), endS}. Phase 2a
 * (desk/README.md §21.3): an order counts only for the energy behind it, a discharge until
 * PAR_BATT_RESERVE_FRAC and a charge until full, at most the inverter less the GUARD. So the
 * player's order (replan() runs on a memory with no rule 6) re-flows the plan and never shows as
 * supply the battery cannot give. Par's own orders (a memory that runs rule 6) are read the same
 * way, with the ends rule 6 gives them: a charge until PAR_BATT_CHARGE_TO, a discharge until the
 * reserve and no later than the end of the discharge window (rule6End). A window order is sized
 * to end with its window, so it still does unless AGC has moved the battery since; a belly charge
 * (S-14 rule 2) ends at 97%; and the night's recharge, ordered after 15:30, is in the plan for as
 * long as it runs (it used to end "at 15:30", already past: AGC carried the whole order, 260 to
 * 500 MW for hours on desk seed 1, and rule 7's re-dispatch could not see why).
 */
function batteryOrder(obs, memo) {
  const b = obs.battery, now = obs.s;
  const mw = b.mode === 'discharge' ? b.orderMW : b.mode === 'charge' && !b.fullHold ? -b.orderMW : 0;
  const pars = memo !== null && PROXIES[memo.proxy].rules.includes('rule6');
  const lim = Math.max(0, b.ratedMW - b.guardMW), x = clamp(mw, -lim, lim);
  if (x > EPS) {
    const endS = now + Math.max(0, b.socMWh - BATT_RESERVE_MWH) / x * S_PER_H;
    return {mw: x, endS: pars && now < DIS_TO_S ? Math.min(endS, DIS_TO_S) : endS};
  }
  if (x < -EPS) return {mw: x, endS: now + Math.max(0, (pars ? CHARGE_TO_MWH : BATT_MWH) - b.socMWh) / (-x * BATT_EFF) * S_PER_H};
  return NO_ORDER;
}

const heatAt = (cx, t) => cx.heat !== null && t >= cx.heat.fromS && t < cx.heat.toS;

/** Machine i's available MW at column time t (heat derate for thermal plant inside an announced heatwave). */
function availAt(cx, i, t) {
  const m = M[i];
  if (t <= cx.now + STEP_S) return cx.avail[i];
  return m.thermal && heatAt(cx, t) ? m.ratingMW * DERATE_KEEP : m.ratingMW;
}

const isOn = (cx, i, t) => cx.on[i] >= 0 && cx.on[i] <= t && t < cx.off[i];

/**
 * L-0 commitment: while some column's cover exceeds committed capacity (x the plan's
 * loading limit) plus the tie's full import, commit the cheapest machine that can be on
 * by then (else the one on soonest), one column ahead so it can climb, and keep it on
 * through the shortfall (gaps shorter than its minimum down time plus start time are
 * bridged) and for at least its minimum up time. Deterministic (merit order, then index).
 */
function commitPlan(obs, P, cx) {
  const n = P.n, now = obs.s;
  const capAt = new Array(n).fill(0);
  const refresh = () => {
    for (let k = cx.k0; k < n; k++) {
      const t = colTime(P, k);
      let c = cx.tieCap[k];
      for (let i = 0; i < NU; i++) if (isOn(cx, i, t)) c += cx.loading * availAt(cx, i, t);
      capAt[k] = c;
    }
  };
  refresh();
  for (let pass = 0; pass < NU; pass++) {
    let k1 = -1;
    for (let k = cx.k0; k < n; k++) if (cx.cover[k] > capAt[k] + EPS) { k1 = k; break; }
    if (k1 < 0) return;
    const t1 = colTime(P, k1);
    let best = -1, bestOn = NEVER;
    for (const i of MERIT) {
      if (isOn(cx, i, t1)) continue;
      const u = obs.units[i], m = M[i];
      let earliest;
      if (cx.on[i] >= 0) {
        if (cx.on[i] > t1) continue;          // already planned later than this: cannot be earlier
        earliest = t1;                         // planned before and stopped: keep it on instead
      } else {
        if (u.mode !== 'off' && u.mode !== 'tripped') continue;
        if (m.station === 'hydro' && !hydroWet(obs)) continue;
        // D1: a tripped unit waits out its lockout only; minimum down time follows a planned
        // stop, and startBlock says whether it still binds.
        const wait = u.mode === 'tripped' ? u.timerS : u.startBlock === '' ? 0 : Math.max(0, m.minDownS - u.downForS);
        earliest = now + wait + u.startToMinS;
      }
      if (earliest <= t1) { best = i; bestOn = earliest; break; }
      if (earliest < bestOn) { best = i; bestOn = earliest; }
    }
    if (best < 0) return;
    // Needed from k1 until the shortfall (without it) ends; short gaps are bridged.
    const bridgeS = M[best].minDownS + obs.units[best].startToMinS;
    let m1 = k1;
    for (let k = k1 + 1; k < n; k++) {
      if (cx.cover[k] > capAt[k] + EPS) m1 = k;
      else if (colTime(P, k) - colTime(P, m1) > bridgeS) break;
    }
    if (cx.on[best] >= 0) {
      cx.off[best] = Math.max(cx.off[best], colTime(P, m1) + STEP_S);
      for (const e of cx.stops) if (e.unit === M[best].id) e.atS = cx.off[best];
    } else {
      const onAt = Math.max(bestOn, t1 - STEP_S);
      cx.on[best] = onAt;
      cx.off[best] = Math.max(colTime(P, m1) + STEP_S, onAt + M[best].minUpS);
      cx.starts.push({unit: M[best].id, atS: onAt - obs.units[best].startToMinS});
      cx.stops.push({unit: M[best].id, atS: cx.off[best]});
    }
    refresh();
  }
}

// Scratch for one column's clearing (module level, reused; never in state or memo).
const LO = new Array(NS).fill(0), HI = new Array(NS).fill(0), OF = new Array(NS).fill(0), X = new Array(NS).fill(0);
const ORD = SIDS.map((_, j) => j);
const CLR = {tie: 0, gap: 0};

function sortOrd() {
  for (let a = 1; a < NS; a++) {
    const x = ORD[a];
    let b = a - 1;
    while (b >= 0 && (OF[ORD[b]] > OF[x] || (OF[ORD[b]] === OF[x] && ORD[b] > x))) { ORD[b + 1] = ORD[b]; b--; }
    ORD[b + 1] = x;
  }
}

/**
 * Clear one column: stations within [LO, HI] at offers OF, the tie a price-taking block
 * at price p within [tlo, thi] (imports when p is below the marginal offer, exports when
 * above; noExport: exports only to absorb must-run surplus). need = MW the stations and the
 * tie supply. Writes X, CLR.tie and CLR.gap (> 0 short, < 0 surplus).
 */
function clearColumn(need, tlo, thi, p, noExport) {
  sortOrd();
  let rest = need;
  for (let j = 0; j < NS; j++) { X[j] = LO[j]; rest -= LO[j]; }
  for (const j of ORD) if (OF[j] < p) { X[j] = HI[j]; rest -= HI[j] - LO[j]; }
  let tie = rest, gap = 0;
  if (tie > thi) {
    tie = thi;
    rest -= thi;
    for (const j of ORD) {
      if (OF[j] < p || rest <= EPS) continue;
      const add = Math.min(HI[j] - X[j], rest);
      X[j] += add; rest -= add;
    }
    gap = Math.max(0, rest);
  } else {
    const floor = noExport ? Math.max(tlo, Math.min(0, thi)) : tlo;
    if (tie < floor) {
      let excess = floor - tie;
      tie = floor;
      for (let a = NS - 1; a >= 0 && excess > EPS; a--) {
        const j = ORD[a];
        if (OF[j] >= p) continue;
        const cut = Math.min(X[j] - LO[j], excess);
        X[j] -= cut; excess -= cut;
      }
      if (excess > EPS && tie > tlo) { const d = Math.min(excess, tie - tlo); tie -= d; excess -= d; }
      gap = -Math.max(0, excess);
    }
  }
  CLR.tie = tie;
  CLR.gap = gap;
}

/** The marginal offer of the cleared column: the tie's price if it sits inside its window, else the dearest block moved off its floor. */
function marginalOffer(tlo, thi, p) {
  if (CLR.tie > tlo + EPS && CLR.tie < thi - EPS) return p;
  let m = FLOOR_OFFER;
  for (let j = 0; j < NS; j++) if (X[j] > LO[j] + EPS && OF[j] > m) m = OF[j];
  return m;
}

/**
 * Merit-order dispatch of plan columns [k0, n) (L-0 and par's amendments), in three stages:
 * 1. desired: each column cleared alone (station ranges at the loading limit, the tie
 *    price-taking at the neighbour's price);
 * 2. slow stations (coal, CCGT) follow the upper envelope of their desire reachable at
 *    their ramp (pre-ramping ahead of need, K-1/L-4 "arrive-by");
 * 3. forward in time with ramp windows: slow stations at the envelope, the fast ones and
 *    the tie clear the rest in merit order; any gap left lets slow stations flex, then par
 *    runs units up to their full available MW and the tie to 800 ("unless that would shed
 *    load"); a surplus backs slow stations down.
 * Hydro runs at its water value at the planned storage, down to HYDRO_STOP_MWH (L-0) or to
 * rule 5's keep line (par; a shortfall reaches below it). Units are loaded to the plan's
 * limit (L-0: HOT_LOADING_FRAC; par: PAR_MAX_LOADING, and HOT_LOADING_FRAC in a
 * shortfall, never into the H-2 hot zone). Fills P.lever, P.tie, P.marg, P.gap for columns
 * k0..n-1.
 */
function dispatchPlan(P, cx) {
  const n = P.n, k0 = cx.k0, par = cx.par;
  if (k0 >= n) return;
  const cnt = SIDS.map(() => new Array(n).fill(0)), minS = SIDS.map(() => new Array(n).fill(0));
  const capS = SIDS.map(() => new Array(n).fill(0)), fullS = SIDS.map(() => new Array(n).fill(0));
  const rampS = SIDS.map(() => new Array(n).fill(0)), bigS = new Array(n).fill(0);
  for (let k = k0; k < n; k++) {
    const t = colTime(P, k);
    for (let i = 0; i < NU; i++) {
      if (!isOn(cx, i, t)) continue;
      const st = ST_OF[i], a = availAt(cx, i, t);
      cnt[st][k]++; minS[st][k] += M[i].minMW; capS[st][k] += cx.loading * a; fullS[st][k] += HOT_GATE * a; rampS[st][k] += RAMP_COL[i];
      if (cx.loading * a > bigS[k]) bigS[k] = cx.loading * a;
    }
  }
  // Stage 1: desired dispatch, column by column (static ranges; planned storage for hydro's offer).
  const des = SIDS.map(() => new Array(n).fill(0));
  let store = cx.storage0;
  for (let k = k0; k < n; k++) {
    const t = colTime(P, k);
    for (let j = 0; j < NS; j++) { LO[j] = STA[j].cls === 'hydro' ? 0 : minS[j][k]; HI[j] = capS[j][k]; OF[j] = STA[j].offer; }
    hydroBounds(cx, t, store);
    const thi = tieHi(cx, k, t, cx.tieCap[k], bigS[k]);
    clearColumn(cx.cover[k], -cx.expLim[k], thi, cx.price[k], par);
    for (let j = 0; j < NS; j++) des[j][k] = X[j];
    store -= X[HYDRO] * COL_H;
  }
  // Stage 2: look-ahead envelope for the slow stations.
  for (let j = 0; j < NS; j++) {
    if (!SLOW[j]) continue;
    for (let k = n - 2; k >= k0; k--) des[j][k] = Math.min(capS[j][k], Math.max(des[j][k], des[j][k + 1] - rampS[j][k + 1]));
  }
  // Stage 3: forward with ramp windows.
  const prev = cx.x0.slice(), prevCnt = cx.c0.slice();
  const wLo = new Array(NS).fill(0), wHi = new Array(NS).fill(0), wFull = new Array(NS).fill(0);
  let prevTie = cx.tie0;
  store = cx.storage0;
  for (let k = k0; k < n; k++) {
    const t = colTime(P, k);
    for (let j = 0; j < NS; j++) {
      const c = cnt[j][k];
      let base = prev[j];
      if (c > prevCnt[j]) base += (c - prevCnt[j]) * STA[j].minMW;
      else if (c < prevCnt[j]) base = prevCnt[j] > 0 ? base * c / prevCnt[j] : 0;
      if (c === 0) { wLo[j] = 0; wHi[j] = 0; wFull[j] = 0; continue; }
      const lo0 = STA[j].cls === 'hydro' ? 0 : minS[j][k];
      wLo[j] = Math.max(lo0, base - rampS[j][k]);
      wHi[j] = Math.max(wLo[j], Math.min(capS[j][k], base + rampS[j][k]));
      wFull[j] = Math.max(wHi[j], Math.min(fullS[j][k], base + rampS[j][k]));
      if (wLo[j] > wHi[j]) wLo[j] = wHi[j];
    }
    const tieCap = cx.tieCap[k];
    let tlo = Math.max(-cx.expLim[k], prevTie - TIE_COL), thiAll = Math.min(tieCap, prevTie + TIE_COL);
    if (tlo > thiAll) tlo = thiAll;
    let thi = Math.max(tlo, Math.min(thiAll, tieHi(cx, k, t, tieCap, bigS[k])));
    if (cx.holdS > t) { const h = clamp(cx.holdMW, tlo, thiAll); tlo = h; thi = h; thiAll = h; }
    // Pass A: slow stations at their envelope, fast stations and the tie clear the rest.
    for (let j = 0; j < NS; j++) {
      OF[j] = STA[j].offer;
      if (SLOW[j]) { const x = clamp(des[j][k], wLo[j], wHi[j]); LO[j] = x; HI[j] = x; } else { LO[j] = wLo[j]; HI[j] = wHi[j]; }
    }
    hydroBounds(cx, t, store);
    clearColumn(cx.cover[k], tlo, thi, cx.price[k], par);
    let tie = CLR.tie, gap = CLR.gap;
    const marg = marginalOffer(tlo, thi, cx.price[k]);
    if (gap > EPS) { // flex: slow stations up, then (par) the reserve the limits held back
      gap = raise(gap, wHi, true);
      if (par && gap > EPS) { // par: the tie past its secure cap, the kept water, then units up to the hot gate
        if (thiAll > tie) { const d = Math.min(gap, thiAll - tie); tie += d; gap -= d; }
        const hy = Math.max(X[HYDRO], Math.min(wHi[HYDRO], waterMW(store)));
        if (gap > EPS && hy > X[HYDRO]) { const d = Math.min(gap, hy - X[HYDRO]); X[HYDRO] += d; gap -= d; }
        wFull[HYDRO] = Math.max(X[HYDRO], Math.min(wFull[HYDRO], waterMW(store)));
        gap = raise(gap, wFull, false);
      }
    } else if (gap < -EPS) { // surplus: slow stations down (dearest first)
      let sur = -gap;
      for (let a = NS - 1; a >= 0 && sur > EPS; a--) {
        const j = ORD[a];
        if (!SLOW[j]) continue;
        const cut = Math.min(X[j] - wLo[j], sur);
        X[j] -= cut; sur -= cut;
      }
      gap = -sur;
    }
    for (let j = 0; j < NS; j++) { P.lever[j][k] = X[j] + 0; prev[j] = X[j]; prevCnt[j] = cnt[j][k]; }
    P.tie[k] = tie + 0;
    P.marg[k] = marg;
    P.gap[k] = gap + 0;
    prevTie = tie;
    store -= X[HYDRO] * COL_H;
  }
}

/** Raise stations in merit order toward hi (slowOnly: only the slow ones). Returns the gap left. */
function raise(gap, hi, slowOnly) {
  for (const j of ORD) {
    if (gap <= EPS) break;
    if (slowOnly && !SLOW[j]) continue;
    const d = Math.min(gap, hi[j] - X[j]);
    if (d > 0) { X[j] += d; gap -= d; }
  }
  return gap;
}

// Water a shortfall may still use in a column: down to par's reserve, never to HYDRO_STOP_MWH,
// where the grid unloads the whole station at its ramp (a self-made loss of up to 950 MW;
// par's runs saw it trip UFLS at 21:28 on an empty battery).
const waterMW = store => Math.max(0, store - WATER_FLOOR) / COL_H;

/**
 * Hydro's bounds and offer in the column clearing: its water value at the planned storage,
 * and the water it may use: down to HYDRO_STOP_MWH (L-0), or down to rule 5's keep line
 * (par; the flex pass of a shortfall reaches below it).
 */
function hydroBounds(cx, t, store) {
  const j = HYDRO;
  const usable = Math.max(0, store - (cx.par ? keepMWh(t) : HYDRO_STOP)) / COL_H;
  OF[j] = waterValue(store / HYDRO_ALLOC);
  HI[j] = Math.max(LO[j], Math.min(HI[j], usable));
}

/** The tie's upper bound for the clearing: par caps it at the largest unit's planned output (the tie is then not the largest risk). */
function tieHi(cx, k, t, tieCap, big) {
  if (!cx.par) return tieCap;
  return Math.min(tieCap, Math.max(big, 0));
}

/**
 * The planLoad input for columns [k0, n) of P (Phase 1a: the plan lives in state). Keys are
 * ARRIVE-BY: atS is the column's time, the lever is to be at mw by then (the grid's executor starts
 * the move as late as the station's ramp allows). A station gets a key where it has machines on
 * and its lever moves at least PLAN_KEYFRAME_MIN_MW, or its machine count changes (the first
 * column too for the L-0 plan: `first`); MW are whole MW (the ramp check allows 1 MW). Bookings:
 * the pending and new STARTs, and the STOPs when keepStops. Every list is sorted.
 */
function buildLoad(P, cx, obs, keepStops, first) {
  const now = obs.s, k0 = cx.k0;
  const stations = {};
  for (let j = 0; j < NS; j++) {
    const keys = [];
    let last = obs.stations[j].basePointMW, lastCnt = obs.stations[j].onCount, need = first;
    for (let k = k0; k < P.n; k++) {
      const t = colTime(P, k);
      let c = 0;
      for (let i = STA[j].first; i < STA[j].first + STA[j].count; i++) if (isOn(cx, i, t)) c++;
      if (c === 0) { lastCnt = 0; continue; }
      const mw = P.lever[j][k];
      if (need || c !== lastCnt || Math.abs(mw - last) >= KEYFRAME_MIN) {
        keys.push([t, Math.round(mw) + 0]);
        last = mw; lastCnt = c; need = false;
      }
    }
    stations[SIDS[j]] = keys;
  }
  const tie = [];
  let lastTie = obs.tie.setMW, needTie = first;
  for (let k = k0; k < P.n; k++) {
    const mw = clamp(P.tie[k], -TIE_MAX, TIE_MAX);
    if (needTie || Math.abs(mw - lastTie) >= KEYFRAME_MIN) {
      tie.push([colTime(P, k), Math.round(mw) + 0]);
      lastTie = mw; needTie = false;
    }
  }
  const books = list => {
    const seen = new Set();
    return list.filter(e => e.atS >= now && e.atS < DAY_S).sort(byAtThenUnit)
      .filter(e => (seen.has(e.unit) ? false : (seen.add(e.unit), true))).map(e => [e.unit, e.atS]);
  };
  return {type: 'planLoad', fromS: now, stations, tie, starts: books(cx.starts), stops: keepStops ? books(cx.stops) : []};
}

function byAtThenUnit(a, b) {
  return a.atS - b.atS || (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0);
}

/**
 * L-0 pre-dispatch: a merit-order schedule for the P50 forecast, computed ONCE at
 * PLAYER_START_H from observe(state, {dayAhead: true}) (obs.dayAhead covers to 04:00).
 * Pure and deterministic (L-0 accept: identical for the same seed and SIM_VERSION).
 * For each FC_STEP_S column: net demand = dayAhead.demandP50 - windMW - solarMW; the stack
 * is the P-6 offers (thermal minimum-load blocks first, then coal 26, CCGT 74, GTs 148-156,
 * hydro at its water value) plus the tie as a price-taking block: import up to TIE_MAX_MW
 * when neighbourPrice[k] is below the marginal offer, export up to exportLimitMW[k] when it
 * is above (that merit rule is what keeps the tie off a single limit, P-6). Commitments obey
 * start times (startToMinS from 'off'), ramps (rampMWMin), minimum up/down times (V.MACHINES)
 * and the units' present modes; base points are split per station. Units are loaded up to
 * HOT_LOADING_FRAC (their high regulating limit, where AGC's band stops). The plan
 * deliberately ignores N-1, warned hazards, drift after 04:30 and the noon minimum-
 * generation problem. The battery is left to rule 6 (the plan schedules it idle).
 * @param {object} obs observe(state, {dayAhead: true}) at (or after) PLAYER_START_H
 * @returns {object} the dispatcher's plan P: its grid (madeAtS, t0, stepS, n), the day-ahead
 *   columns (fc), the planned levers, tie, marginal offer and gap per column, and `load`: the
 *   plan as a planLoad input {type:'planLoad', fromS, stations: {id: [[atS, mw], ...]}, tie:
 *   [[atS, mw], ...], starts: [[unit, atS], ...], stops: [[unit, atS], ...]} (Phase 1a), every
 *   list sorted by atS (bookings then by unit); keys arrive-by at the column times, at most one per
 *   station and column, every step ramp-feasible from the previous one (within 1 MW: whole MW).
 */
export function preDispatch(obs) {
  const fc = obs.dayAhead || obs.forecast;
  const P = newPlan(obs.s);
  const last = Math.max(0, fc.n - 1), roof = roofColumn(fc);
  for (let k = 0; k < P.n; k++) {
    const j = Math.min(k, last);
    P.fc.p50[k] = fc.demandP50[j]; P.fc.wind[k] = fc.windMW[j]; P.fc.solar[k] = fc.solarMW[j];
    P.fc.price[k] = fc.neighbourPrice[j]; P.fc.expLim[k] = fc.exportLimitMW[j]; P.fc.roof[k] = roof[j];
  }
  // The day-ahead columns fall exactly on the plan grid: use them as the forecast here.
  const dayObs = Object.assign({}, obs, {forecast: fc});
  const cx = context(dayObs, P, 0, false, null, true);
  commitPlan(obs, P, cx);
  dispatchPlan(P, cx);
  P.load = buildLoad(P, cx, obs, true, true);
  return P;
}

/**
 * Par's amendment (a RE-PLAN): re-dispatch plan P from now to 04:00 over the present commitment
 * and the plan's pending bookings, with the latest forecast. Returns the planLoad input that puts
 * it in state (from now on; par drops pending STOPs: it decommits by rule 4 only, keepStops false).
 */
function amend(obs, memo, P, keepStops) {
  const k0 = colAfter(P, obs.s);
  const ks = keepStops === undefined ? PROXIES[memo.proxy].stops : keepStops;
  const cx = context(obs, P, k0, true, memo, ks);
  dispatchPlan(P, cx);
  P.amended += 1;
  return buildLoad(P, cx, obs, ks, false);
}

/**
 * RE-PLAN / RE-DISPATCH for the player (app/assist.js ASSIST PLAN on the bench, app/system.js's
 * RE-DISPATCH key in the game, decision A-1): the re-dispatch par makes after each of its actions
 * (amend), from now to 04:00 over the commitment the player has now (units on and coming, and the
 * STARTs and STOPs booked in the plan, which it keeps). Returns the planLoad input, or null when
 * there is no plan yet (before 04:30) or the day is over. Not an action (SPEC S-4, §8.2).
 * @param {object} obs observe(state) (the forecast is enough; dayAhead is not needed)
 * @param {object} memo the assist's or the system's autopilot memo
 * @returns {object|null}
 */
export function replan(obs, memo) {
  if (!memo.plan || obs.over || obs.s < START_S) return null;
  return amend(obs, memo, memo.plan, true);
}

// ------------------------------------------------------------------ memo and plan updates

/**
 * Fresh par memory (plain JSON, so a resumed day resumes par too: a JSON copy of a state and
 * of this memo, passed back to runPar as opts.state and opts.memo, plays the same day as the
 * run they were taken from): the proxy, the dispatcher's plan (null until PLAYER_START_H), the
 * planLoad inputs waiting to be sent (outbox: {input, tag}, empty between decisions), the last
 * action's tick, and the harness's decision cadence (nextS, the next decision's grid second;
 * afterWatch, decide at the first second after a watch), which runPar, the bench's assist and
 * app/system.js keep here rather than in their own locals.
 * @param {{proxy?:'par'|'planOnly'|'doNothing'|'lean'|'competent'|'commitAll'|'fuzz'}} [opts]
 * @returns {object} memo
 */
export function createAutopilot(opts) {
  const proxy = opts && opts.proxy ? opts.proxy : 'par';
  if (!Object.hasOwn(PROXIES, proxy)) throw new Error('createAutopilot: unknown proxy ' + proxy);
  return {proxy, plan: null, outbox: [], lastActTick: -1, lastOrigin: '', actions: 0,
    amendDue: false, seenConts: 0, trip: null, tieHoldS: -1, tieHoldMW: 0, secureTieMW: 0, guardHoldS: -1, rebaseQuietS: -1,
    water: 'hold', rertSinceS: -1, planShed: 0, reflowS: -1, nextS: -1, afterWatch: false, belly: false, coalStops: 0};
}

/** Make the day's plan from a day-ahead observation; its planLoad (origin 'plan') waits in the outbox. */
function makePlan(obs, memo) {
  const P = preDispatch(obs);
  const load = P.load;
  delete P.load;
  if (!PROXIES[memo.proxy].stops) load.stops = []; // par starts from the plan without its stops (S-4)
  memo.plan = P;
  memo.outbox.push({input: load, tag: 'plan'});
}

/**
 * The plan inputs due at this decision (Phase 1a: planLoad inputs, which put the plan in state;
 * the grid's executor then moves the levers, the tie and the bookings, K-2 / L-6): at the first
 * decision from PLAYER_START_H the L-0 plan (made here if decide() has not made it: from
 * obs.dayAhead, so pass observe(state, {dayAhead: true}) until memo.plan exists); par's
 * re-plans after its actions (queued by decide()); and, for planOnly (and app/system.js), the
 * re-flow for the lit load while districts are dark (reflowLit). Not paced (not discrete
 * actions). Returns [] during a watch (obs.inWatch) or before PLAYER_START_H.
 * @param {object} obs observe(state)
 * @param {object} memo from createAutopilot
 * @param {string[]} [tags] receives one origin per returned input: 'plan' for the L-0 plan and
 *   its re-flow, 'replan' for a re-dispatch after an action
 * @param {{periodic?:boolean}} [opts] periodic: false skips the PLAN_REFLOW_S re-flow (a re-flow
 *   when the dark share moves still runs); app/system.js passes it while the player owns the plan
 * @returns {Array<object>}
 */
export function planUpdates(obs, memo, tags, opts) {
  if (obs.over || obs.inWatch || obs.s < START_S) return [];
  const proxy = PROXIES[memo.proxy];
  if (!memo.plan && proxy.plan && obs.dayAhead) makePlan(obs, memo);
  const out = [];
  for (const x of memo.outbox) { out.push(x.input); if (tags) tags.push(x.tag); }
  memo.outbox = [];
  if (proxy.reflow && memo.plan) {
    const load = reflowLit(obs, memo, !(opts && opts.periodic === false));
    if (load) { out.push(load); if (tags) tags.push('plan'); }
  }
  return out;
}

/**
 * L-0 execution for a proxy that never amends its plan (planOnly, and the game's system operator,
 * app/system.js): when the dark share of the city moves by half a district or more since the plan
 * last saw it, the plan's levers and tie are re-dispatched from now to 04:00 for the LIT load (the
 * L-0 rules: merit order, the plan's booked starts and stops, no N-1), as a planLoad. This is the
 * NEM's 5-minute dispatch, which targets metered demand, standing under the once-a-day
 * pre-dispatch: shed load is not dispatched for. While any district is dark it re-flows every
 * PLAN_REFLOW_S too (AEMO's pre-dispatch cadence; `periodic`), with the latest forecast: a
 * half-dark night otherwise ran on the 04:30 day-ahead wind. Without it a plan written for the
 * whole city kept serving a half-dark one overnight: the battery filled and frequency rose to
 * 52 Hz (black 'over') on 19/100 raw seeds (tuning pass). Returns the planLoad or null.
 */
function reflowLit(obs, memo, periodic) {
  let shed = 0;
  for (const d of obs.districts) if (d.dark) shed += d.share;
  const moved = Math.abs(shed - memo.planShed) >= V.DISTRICT_SHARE / 2;
  if (!moved && !(periodic && shed > 0 && obs.s - memo.reflowS >= REFLOW_S)) return null;
  memo.planShed = shed;
  memo.reflowS = obs.s;
  const P = memo.plan, k0 = colAfter(P, obs.s);
  const cx = context(obs, P, k0, false, null, true);
  dispatchPlan(P, cx);
  P.amended += 1;
  return buildLoad(P, cx, obs, true, false);
}

// ------------------------------------------------------------------ decide (S-4 rules)

/** What the rules share, computed once per decision from obs (and the plan). */
function situation(obs, memo) {
  const fc = obs.forecast, now = obs.s;
  let capCommitted = 0, hydroCap = 0, big = 0;
  for (let i = 0; i < NU; i++) {
    const u = obs.units[i];
    if (!committedMode(u.mode)) continue;
    if (M[i].station === 'hydro') hydroCap += u.availMW; else capCommitted += u.availMW;
    if (PAR_LOADING * u.availMW > big) big = PAR_LOADING * u.availMW;
  }
  // Hydro counts for the water it may use this hour (rule 5's keep line).
  capCommitted += Math.min(hydroCap, Math.max(0, obs.hydro.storageMWh - keepMWh(now)));
  memo.secureTieMW = big;
  const b = obs.battery;
  const battMW = Math.max(0, Math.min(b.ratedMW, b.socMWh / SUSTAIN_H));
  // Net demand the fleet must cover in forecast column k: P50 - wind - solar - the tie's planned import.
  const net = new Array(fc.n);
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    net[k] = fc.demandP50[k] - fc.windMW[k] - fc.solarMW[k] - tieImportAt(obs, memo, t);
  }
  return {now, fc, capCommitted, battMW, net};
}

/** The tie's planned import at grid second t, counted at most up to its secure cap (0 while tripped). */
function tieImportAt(obs, memo, t) {
  if (obs.tie.tripped && t < obs.s + obs.tie.lockoutS) return 0;
  const P = memo.plan;
  let mw = memo.tieHoldS > t ? memo.tieHoldMW : P && P.n > 0 ? P.tie[Math.min(P.n - 1, colAfter(P, t - STEP_S))] : obs.tie.setMW;
  if (memo.secureTieMW > 0) mw = Math.min(mw, memo.secureTieMW);
  return Math.max(0, mw);
}

/** The largest synchronised unit's output now (the tie at or below it is not the largest risk). */
function largestUnitMW(obs) {
  let big = 0;
  for (const u of obs.units) if (u.sync && u.outMW > big) big = u.outMW;
  return big;
}

/** Largest forecast net demand over leads (0, horizonS]. */
function peakNet(C, horizonS) {
  let mx = -NEVER;
  for (let k = 0; k < C.net.length; k++) {
    if ((k + 1) * C.fc.stepS > horizonS && k > 0) break;
    if (C.net[k] > mx) mx = C.net[k];
  }
  return mx;
}

/** Cheapest machine that is off and free to start (peakersOnly: P-5 fast starters), or -1. */
function nextStart(obs, peakersOnly) {
  for (const i of MERIT) {
    if (peakersOnly && !PEAKER[i]) continue;
    const u = obs.units[i];
    if (u.mode === 'off' && u.startBlock === '') return i;
  }
  return -1;
}

const startInput = i => ({type: 'start', unit: M[i].id});

// Rule 1: after any supply trip, start the next peaker and set the tie to maximum import,
// held there until the trip's RESPOND window ends, then back to the plan. v4 form: the
// maximum SECURE import, at most the largest unit's output (an 800-MW tie at 20 GW.s
// previews near 48.4 Hz); par's plan still imports more if the P50 would be short. With no
// peaker left to start, DR is the next fast block (tuning pass, see the file header).
function rule1(obs, memo) {
  const tr = memo.trip;
  if (tr === null) return null;
  if (obs.s >= tr.untilS) { memo.trip = null; return null; }
  if (tr.start) {
    tr.start = false;
    const i = nextStart(obs, true);
    if (i >= 0) return startInput(i);
    // No peaker left to start: the next fast block is industrial DR (350 MW in 3.5 min), when
    // units, tie and diesel cannot carry the present net demand (the FOS clock is running).
    if (obs.dr.activeS <= 0 && obs.dr.callsLeft > 0 && presentGap(walk(adequacySetup(obs), RERT_AS_ARMED)) + DR_MARGIN > 0) return {type: 'callDR'};
  }
  if (tr.tie) {
    tr.tie = false;
    const mw = Math.floor(Math.min(TIE_MAX, largestUnitMW(obs)));
    if (!obs.tie.tripped && obs.tie.setMW < mw - KEYFRAME_MIN) {
      memo.tieHoldS = tr.untilS; memo.tieHoldMW = mw;
      return {type: 'tie', mw};
    }
  }
  return null;
}

// Rule 2 (v4 form): N-1 in seconds (the TRIP PREVIEW for losing L; GUARD up, then a peaker
// for inertia and headroom) and in minutes (R5 >= PAR_TIGHT_RATIO x L: the next peaker,
// then the tie toward import up to its secure cap). The GUARD steps down again once the
// preview is comfortably above PAR_NADIR_RELAX_HZ.
function rule2(obs, memo) {
  const sec = obs.sec, b = obs.battery;
  // Short now (AGC out of band, or frequency sagging): the battery is worth more to AGC
  // than as held-back FFR, so the GUARD is released at once and not raised.
  // It is raised again only after SECURE_AGAIN_S, while nothing is short (no flapping).
  const shortNow = obs.agc.unmetMW > 0 || obs.f.hz < NORMAL_LO || obs.fos.outsideS > 0;
  if (shortNow) memo.guardHoldS = obs.s + SECURE_AGAIN_S;
  if (shortNow && b.guardMW > 0) return {type: 'guard', mw: 0};
  const P = memo.plan;
  const gapNow = P && P.n > 0 ? P.gap[Math.min(P.n - 1, colAfter(P, obs.s))] : 0;
  const calm = !shortNow && obs.s >= memo.guardHoldS && gapNow <= 0 && sec.r5MW >= sec.lMW;
  const lowNadir = sec.lKind !== 'none' && sec.previewNadirHz < NADIR_MIN;
  // The GUARD delivers only what the battery can sustain for GUARD_SUSTAIN_S: on a nearly
  // empty battery raising it buys nothing, and the action goes to a peaker instead (review
  // fix: par stacked 300-400 MW of GUARD on a 0-MWh battery while the night's pace allowed
  // one action per ~105 grid-min).
  const sustains = mw => b.socMWh >= mw * GUARD_SUSTAIN_H;
  if (lowNadir && calm && b.guardMW + GUARD_STEP <= GUARD_MAX && sustains(b.guardMW + GUARD_STEP)) return {type: 'guard', mw: b.guardMW + GUARD_STEP};
  const shortR5 = sec.lMW > 0 && sec.r5MW < TIGHT * sec.lMW;
  if (lowNadir || shortR5) {
    const i = nextStart(obs, true);
    if (i >= 0) return startInput(i);
  }
  if (shortR5) {
    const mw = Math.floor(Math.min(TIE_MAX, largestUnitMW(obs)));
    if (!obs.tie.tripped && obs.tie.setMW < mw - KEYFRAME_MIN) {
      memo.tieHoldS = obs.s + SECURE_AGAIN_S; memo.tieHoldMW = mw;
      return {type: 'tie', mw};
    }
  }
  if (b.guardMW > 0 && !shortR5 && sec.previewNadirHz > NADIR_RELAX) return {type: 'guard', mw: Math.max(0, b.guardMW - GUARD_STEP)};
  return null;
}

// Rule 3: commit a unit when forecast net demand over (its start time + PAR_COMMIT_LEAD_MIN),
// plus PAR_COMMIT_MARGIN_MW, exceeds committed capacity plus half the battery.
function rule3(obs, memo, C) {
  for (const i of MERIT) {
    const u = obs.units[i];
    if (u.mode !== 'off' || u.startBlock !== '') continue;
    const mx = peakNet(C, u.startToMinS + COMMIT_LEAD_S);
    if (mx + COMMIT_MARGIN > C.capCommitted + C.battMW / 2) return startInput(i);
  }
  return null;
}

// Rule 4: decommit (dearest first) only after PAR_DECOMMIT_MIN_ON_MIN on, when not needed
// for PAR_DECOMMIT_CLEAR_MIN and N-1 still holds without it. Coal and hydro are not
// cycled (coal's 8-h minimum times; hydro costs nothing to keep spinning).
function rule4(obs, memo, C) {
  if (rertStandDown(obs, memo)) return {type: 'standDownRERT'}; // the dearest resource first (rule 8's test)
  const mx = peakNet(C, DECOMMIT_CLEAR_S);
  for (const i of MERIT_DESC) {
    const u = obs.units[i], m = M[i];
    if (u.mode !== 'on' || u.stopBlock !== '' || u.upForS < DECOMMIT_ON_S) continue;
    if (m.cls === 'coal' || m.cls === 'hydro') continue;
    if (mx + COMMIT_MARGIN + DECOMMIT_EXTRA + u.availMW >= C.capCommitted + C.battMW / 2) continue;
    if (!n1Without(obs, u)) continue;
    return {type: 'stop', unit: u.id};
  }
  return coalStop(obs, memo);
}

/** N-1 in minutes still holds with unit u (an observe row) stopped: R5 without its headroom against L without it. */
function n1Without(obs, u) {
  const r5Without = obs.sec.r5MW - Math.max(0, Math.min(u.availMW - u.outMW, u.rampMWMin * R5_MIN));
  const lWithout = obs.sec.lId === u.id ? secondLargest(obs, u.id) : obs.sec.lMW;
  return r5Without >= TIGHT * lWithout;
}

// Rule 4, the coal branch (S-14 rule 4, Phase 2a; desk/README.md C-12): decommit ONE coal
// machine only if MSL2 is forecast for PAR_COAL_MSL2_H or more AND the evening holds N-1
// without it. Gas goes first (the loop above): while any CCGT or GT is still committed the
// dearer plant is what is in the way, and if it is needed, so is the coal. The machine is gone
// for the evening by the code's timing: unload to MIN, T4, the minimum down time (from breaker
// open to the next START order), then its start: a 10:00 stop is back at MIN at 21:14.
// Expected never to fire on the game's days (MSL2 for three hours does not occur there).
function coalStop(obs, memo) {
  const stopped = memo.coalStops || 0; // (a memo saved before Phase 2a has no count)
  if (!memo.plan || stopped >= COAL_STOPS_DAY) return null;
  for (let i = 0; i < NU; i++) if (M[i].thermal && M[i].cls !== 'coal' && committedMode(obs.units[i].mode)) return null;
  if (msl2S(obs) < COAL_MSL2_S) return null;
  for (const i of MERIT_DESC) {
    const u = obs.units[i], m = M[i];
    if (m.cls !== 'coal' || u.mode !== 'on' || u.stopBlock !== '' || u.upForS < DECOMMIT_ON_S) continue;
    if (!n1Without(obs, u)) continue;
    const backS = obs.s + Math.max(0, u.outMW - m.minMW) / m.rampMWs + m.t4S + m.minDownS + u.startToMinS;
    if (!eveningHolds(obs, memo, i, backS)) continue;
    memo.coalStops = stopped + 1;
    return {type: 'stop', unit: u.id};
  }
  return null;
}

/**
 * Grid seconds of the 4.5-h forecast at or below MSL2 (P-4, C-9): a column counts when its P50
 * is at or below MSL2_MW, raised by MSL_TIE_OUT_MW in a column that falls before the tie's
 * return (M-1: per column), as the sim's own MSL notice counts it.
 */
function msl2S(obs) {
  const fc = obs.forecast, tieBack = obs.tie.tripped ? obs.s + obs.tie.lockoutS : obs.s;
  let s = 0;
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    if (fc.demandP50[k] <= MSL2_MW + (t < tieBack ? MSL_TIE_OUT : 0)) s += fc.stepS;
  }
  return s;
}

/**
 * Does the evening hold N-1 without machine `without`, in every plan column from now until it
 * could be back at minimum load (backS)? Firm supply as par counts it elsewhere: every other
 * machine that is on, coming, or free to start by then, at PAR_MAX_LOADING x its available MW
 * (derated in an announced heatwave); hydro at the rate rule 5's release sustains; the tie at
 * its secure import (the largest unit, 0 while tripped). N-1: that supply less its largest
 * single loss covers the lit net demand (the 4.5-h forecast, the day-ahead beyond it) plus
 * PAR_COMMIT_MARGIN_MW. The battery, DR and the diesel are the reserve and are not counted.
 */
function eveningHolds(obs, memo, without, backS) {
  const P = memo.plan, A = adequacySetup(obs), fc = obs.forecast;
  const water = Math.max(0, obs.hydro.storageMWh - WATER_FLOOR) / WATER_RELEASE_H;
  for (let k = colAfter(P, obs.s); k < P.n; k++) {
    const t = colTime(P, k), lead = t - obs.s;
    if (t > backS) break;
    let lit = fcAt(A.lit, obs.demand.litMW, fc.n, lead), wind = fcAt(fc.windMW, obs.wind.availMW, fc.n, lead);
    let solar = fcAt(fc.solarMW, obs.solar.availMW, fc.n, lead);
    if (lit === null) { lit = litDayAhead(P, k, t, A.heat, A.dark); wind = P.fc.wind[k]; solar = P.fc.solar[k]; }
    let thermal = 0, hydro = 0, big = 0;
    for (let j = 0; j < NU; j++) {
      if (j === without || A.onAt[j] < 0 || A.onAt[j] > t) continue;
      const m = M[j], hot = A.heat !== null && t >= A.heat.fromS && t < A.heat.toS;
      const mw = PAR_LOADING * (t <= A.now + STEP_S ? obs.units[j].availMW : m.thermal && hot ? m.ratingMW * DERATE_KEEP : m.ratingMW);
      if (m.station === 'hydro') hydro += mw; else thermal += mw;
      if (mw > big) big = mw;
    }
    const tie = t < A.tieBack ? 0 : Math.min(TIE_MAX, big);
    const firm = thermal + Math.min(hydro, water) + tie - Math.max(big, tie);
    if (lit - wind - solar + COMMIT_MARGIN > firm) return false;
  }
  return true;
}

function secondLargest(obs, id) {
  let big = obs.tie.tripped ? 0 : Math.max(0, obs.tie.flowMW);
  for (const u of obs.units) if (u.sync && u.id !== id && u.outMW > big) big = u.outMW;
  return big;
}

// Rule 5: hold water until PAR_WATER_HOLD_UNTIL_H, then release it linearly to
// PAR_WATER_EMPTY_BY_H. Par's dispatch carries it (the keep line, see keepMWh); this
// action gets the release under way: every hydro machine on line for the evening.
function rule5(obs, memo) {
  if (memo.water !== 'hold' || obs.s < WATER_HOLD_S || obs.s >= WATER_EMPTY_S) return null;
  if (hydroWet(obs)) {
    for (let i = STA[HYDRO].first; i < STA[HYDRO].first + STA[HYDRO].count; i++) {
      const u = obs.units[i];
      if (u.mode === 'off' && u.startBlock === '') return startInput(i);
    }
  }
  memo.water = 'release';
  return null;
}

// Rule 6: charge the battery to PAR_BATT_CHARGE_TO during PAR_BATT_CHARGE_H; discharge by
// merit order (when the price is above the plan's marginal offer) during PAR_BATT_DISCHARGE_H.
// Extension: outside the discharge window, a battery AGC has drawn below its reserve
// (PAR_BATT_RESERVE_FRAC) is charged back to it while nothing is short, so the night is not
// run without primary response (H-8).
function rule6(obs, memo) {
  const b = obs.battery, now = obs.s;
  const lim = Math.max(0, b.ratedMW - b.guardMW);
  let mode = 'idle', mw = 0, belly = false;
  const room = b.socMWh < CHARGE_TO_MWH - ORDER_TOL * COL_H;
  // S-14 rule 2 (Phase 2a, C-12), a union with the window below: the price is at or below $0 or
  // the dispatch is spilling (C-6), and the battery has room. The order is the charge already
  // ordered plus what is still being spilled (the sim's cut is net of the order): free power.
  // Once it takes the whole spill the price is no longer negative and nothing is spilled, so a
  // belly order is HELD while the surplus still feeds it, and comes down by what it would be
  // buying instead (boughtMW: the thermal units above their floor, hydro, the tie above its
  // export limit) when it does not. Without the hold the order flapped between the spill and the
  // window's rate at every decision (desk seed 1, six orders in 90 min).
  const spillMW = obs.wind.autoMW + obs.solar.autoMW;
  const ordered = b.mode === 'charge' && !b.fullHold ? b.orderMW : 0;
  let freeMW = ordered + spillMW;
  if (memo.belly && ordered > 0 && !(spillMW > 0)) freeMW -= boughtMW(obs);
  if (room && (obs.price.mwh <= 0 || spillMW > SURPLUS_MIN || (memo.belly && ordered > 0 && freeMW > SURPLUS_MIN))) {
    // Never less than the window's own rate, at most PAR_BATT_CHARGE_MAX_MW, and no more than
    // reaches PAR_BATT_CHARGE_TO by par's next possible action (its pace, not the 5-min column).
    const inWindow = now >= CHARGE_FROM_S && now < CHARGE_TO_S, toFullMW = (CHARGE_TO_MWH - b.socMWh) / BATT_EFF;
    const windowMW = inWindow ? toFullMW / Math.max(COL_H, (CHARGE_TO_S - now) / S_PER_H) : 0;
    mw = Math.min(lim, CHARGE_MAX, toFullMW / Math.max(COL_H, paceS(now, memo) / S_PER_H), Math.max(windowMW, freeMW));
    mode = mw > EPS ? 'charge' : 'idle';
    belly = mode === 'charge' && mw > windowMW + EPS; // above the window's own rate: an order for the surplus
  } else if (now >= CHARGE_FROM_S && now < CHARGE_TO_S && room) {
    const hours = Math.max(COL_H, (CHARGE_TO_S - now) / S_PER_H);
    mw = Math.min(lim, CHARGE_MAX, (CHARGE_TO_MWH - b.socMWh) / BATT_EFF / hours);
    mode = mw > EPS ? 'charge' : 'idle';
  } else if (now >= DIS_FROM_S && now < DIS_TO_S && b.socMWh > BATT_RESERVE_MWH) {
    const P = memo.plan;
    const marg = P && P.n > 0 ? P.marg[Math.min(P.n - 1, colAfter(P, now))] : 0;
    // Merit order on ENERGY: the price without the P-7 scarcity adder (the adder is there
    // whenever R5 < 1.25 L, and the battery's headroom IS that reserve). Once started, the
    // discharge runs to the window's end.
    if (b.mode === 'discharge' || obs.price.mwh - obs.price.adder > marg + EPS) {
      const hours = Math.max(COL_H, (DIS_TO_S - now) / S_PER_H);
      mw = Math.min(lim, (b.socMWh - BATT_RESERVE_MWH) / hours);
      mode = mw > EPS ? 'discharge' : 'idle';
    }
  } else if ((now < DIS_FROM_S || now >= DIS_TO_S) && b.socMWh < BATT_RESERVE_MWH) {
    const short = obs.agc.unmetMW > 0 || obs.f.hz < NORMAL_LO || obs.fos.outsideS > 0;
    if (!short) {
      mw = Math.min(lim, CHARGE_MAX, (BATT_RESERVE_MWH - b.socMWh) / BATT_EFF / COL_H);
      mode = mw > EPS ? 'charge' : 'idle';
    }
  }
  if (mode === 'idle') mw = 0;
  const want = mode === 'discharge' ? mw : -mw;
  const have = b.mode === 'discharge' ? b.orderMW : b.mode === 'charge' && !b.fullHold ? -b.orderMW : 0;
  memo.belly = belly; // the order in place is (still) a belly order, or the window's again: also when nothing is re-ordered
  if (Math.abs(want - have) <= ORDER_TOL) return null;
  return {type: 'battery', mode, mw: Math.floor(mw)};
}

/**
 * MW on the grid now that are NOT surplus (S-14 rule 2's hold): what the thermal units carry above
 * their floor, what hydro generates, and what the tie carries above its export limit (an import,
 * or an export short of the limit; nothing while it is tripped). A charge order fed by any of it
 * is buying fuel, water or the neighbour's power, not soaking up what would be spilled.
 */
function boughtMW(obs) {
  let mw = obs.tie.tripped ? 0 : Math.max(0, obs.tie.flowMW + obs.tie.exportLimitMW);
  for (let i = 0; i < NU; i++) {
    const u = obs.units[i];
    if (u.mode === 'on') mw += Math.max(0, u.outMW - (M[i].thermal ? u.minMW : 0));
  }
  return mw;
}

// Rule 6's own window (extension, review fix): a battery order never expires by itself, so a
// discharge order still running after 22:00, or at or below PAR_BATT_RESERVE_FRAC, is ended
// (rule 6's action: idle, or the night's recharge to the reserve) BEFORE rules 2-5 are asked.
// In rule order it came after them, and at the night roll's pace (one action per ~105
// grid-min) the 16:30 order ran all night on 71 of 80 seeds and emptied the battery on 46: no
// primary response from it overnight (seed 30: UFLS on a 23:44 coal trip).
function rule6End(obs, memo) {
  const b = obs.battery, now = obs.s;
  if (b.mode !== 'discharge' || b.orderMW <= EPS) return null;
  if (now >= DIS_FROM_S && now < DIS_TO_S && b.socMWh > BATT_RESERVE_MWH) return null;
  return rule6(obs, memo);
}

// Rule 7 (with its extension): keep units at or below PAR_MAX_LOADING unless that would
// shed load, and keep the plan on the forecast (re-dispatch when AGC or the plan is off by
// more than PAR_REBASE_MW). Returns a marker; decide() amends and picks the lever to move.
// Phase 2a (desk/README.md §25): in a surplus the sim is curtailing and AGC is told to take the
// units down to MIN, beyond their regulating bands (C-6), so |agc.requestMW| can be the units'
// whole room above MIN for as long as the belly lasts. That part is the dispatch at work, not
// drift: rule 7 reads the request net of it (what is left is the battery's share). And a surplus
// the plan itself shows for the coming column (its negative gap: units at their floor, the tie
// at the export limit, the rest spilled) is not a miss of the forecast.
function rule7(obs, memo, C) {
  const P = memo.plan;
  if (!P) return null;
  let trigger = Math.abs(agcCarriedMW(obs)) > REBASE;
  for (const u of obs.units) if (u.mode === 'on' && u.basePointMW > PAR_LOADING * u.availMW + KEYFRAME_MIN) trigger = true;
  if (!trigger) {
    const k = colAfter(P, obs.s);
    if (k < P.n) {
      let supply = P.tie[k];
      for (let j = 0; j < NS; j++) supply += P.lever[j][k];
      const t = colTime(P, k), lead = t - obs.s, fc = obs.forecast;
      const p50 = fcAt(fc.demandP50, obs.demand.nowMW, fc.n, lead), w = fcAt(fc.windMW, obs.wind.availMW, fc.n, lead);
      const so = fcAt(fc.solarMW, obs.solar.availMW, fc.n, lead);
      if (p50 !== null && Math.abs(p50 - w - so - supply - Math.min(0, P.gap[k])) > REBASE) trigger = true;
    }
  }
  return trigger ? {amendThen: 'lever'} : null;
}

/** AGC's request as rule 7 reads it: while the dispatch is spilling (C-6), net of what it is lowering the units by. */
function agcCarriedMW(obs) {
  let mw = obs.agc.requestMW;
  if (mw < 0 && obs.wind.autoMW + obs.solar.autoMW > 0) {
    for (const u of obs.units) if (u.agcTrimMW < 0) mw -= u.agcTrimMW; // (only units that are on carry a trim)
  }
  return mw;
}

// Rule 8: reserve diesel is an emergency (§9 Q-2, tuning pass): armed on a projected shortfall
// of firm capacity counted honestly, stood down when not needed; DR on a present shortfall.
//
// The ADEQUACY WALK (adequacySetup + walk) goes forward from now (the present, then each
// 5-min forecast column) and finds the MW left uncovered in each step:
//   * firm, with no energy limit: thermal units at the hot gate x their available MW (derated
//     inside an announced heatwave): committed ones from when they reach MIN, off ones free to
//     start from now + T1 + auto-sync + T2, tripped ones from the end of their lockout + the
//     same (D1); the tie at its real import limit (0 while tripped, then climbing at its
//     ramp); the diesel from its lead (as armed, as if armed now, or never);
//   * the energy-limited pool, spent forward in time: hydro (its machines' MW while water is
//     left above rule 5's floor), DR (DR_MW while call-hours are left) and the battery (its
//     rating, for the energy above PAR_BATT_RESERVE_FRAC, which stays for primary response).
//     The pool's power is the sum of the three while each has energy; water is spent first,
//     then DR's hours, then the battery.
// A step is short when net demand (P50 - wind - solar, lit districts only) + PAR_RERT_MARGIN_MW
// exceeds the firm supply plus the pool's power, or the pool runs dry. The margin is on power
// only (S-4: "within 100 MW of firm capacity"); the pool is charged the energy actually used.
//
// Decisions (in this order, one action per decision):
//   DR     when units, tie and diesel cannot carry present net demand + PAR_DR_MARGIN_MW AND
//          either hydro and the battery cannot carry it either (a power shortfall), or the walk
//          runs dry later and a call can be spared from the hours the peak needs DR's power;
//          also while frequency sags with AGC at its limit or UFLS left districts dark.
//          (Saving DR for the top of the evening: calls spent in the afternoon left the peak
//          without them.)
//   arm    when a step at a lead the diesel can still reach (RERT_LEAD_S .. PAR_RERT_LOOKAHEAD_MIN)
//          is short; or, energy-driven, when a later step is short, arming just in time would
//          still leave energy uncovered, and arming now (the diesel replacing water, DR and
//          battery energy from its lead) leaves less. A shortfall that ends before the lead
//          (e.g. the tie coming back in 6 min) never arms it: the diesel could not help.
//   stand down  after PAR_RERT_STANDDOWN_MIN armed, nothing sagging, and the walk WITHOUT the
//          diesel finds no short step in the whole horizon (also asked first by rule 4).
// The battery used to be left out of firm capacity (it is the contingency reserve), and the
// tie counted only up to the largest unit: par then armed on 68% of raw days and every heat
// day. Measured with this walk: 23.5% of 200 raw seeds, par zero-unserved 89.5% (tuning pass).

/** Once per decision: the dark share and the forecast as lit demand, when each machine can be on, the tie's return, the pool's energy. */
function adequacySetup(obs) {
  const now = obs.s, auto = obs.mode === 'AGC', b = obs.battery, dr = obs.dr;
  const dark = darkShare(obs);
  const wet = hydroWet(obs);
  const onAt = new Array(NU).fill(-1);
  for (let i = 0; i < NU; i++) {
    const u = obs.units[i];
    if (M[i].station === 'hydro' && !wet) continue;
    if (committedMode(u.mode)) onAt[i] = onFromNow(u, i, now, auto);
    else if (u.mode === 'off' && u.startBlock === '') onAt[i] = now + u.startToMinS;
    else if (u.mode === 'tripped') onAt[i] = now + u.timerS + u.startToMinS;
  }
  return {obs, now, dark, lit: litColumns(obs.forecast, dark), onAt, heat: latestNews(obs, 'heat'), tieBack: obs.tie.tripped ? now + obs.tie.lockoutS : now,
    hydroE: Math.max(0, obs.hydro.storageMWh - WATER_FLOOR), drE: DR_MW * (dr.callsLeft + Math.max(0, dr.activeS) / S_PER_H),
    battE: Math.max(0, b.socMWh - BATT_RESERVE_MWH), battP: b.ratedMW};
}

/** Thermal and hydro MW (at the hot gate) on at grid second t. */
function unitsAt(A, t) {
  let th = 0, hy = 0;
  for (let i = 0; i < NU; i++) {
    if (A.onAt[i] < 0 || A.onAt[i] > t) continue;
    const m = M[i], hot = A.heat !== null && t >= A.heat.fromS && t < A.heat.toS;
    const avail = t <= A.now + STEP_S ? A.obs.units[i].availMW : m.thermal && hot ? m.ratingMW * DERATE_KEEP : m.ratingMW;
    if (m.station === 'hydro') hy += HOT_GATE * avail; else th += HOT_GATE * avail;
  }
  return {th, hy};
}

const RERT_AS_ARMED = -1, RERT_NEVER = -2;

/**
 * The walk: {un, need} per step [present, column 0, column 1, ...]; need = net demand + margin
 * beyond the firm supply, un = what the pool leaves uncovered. rertLead >= 0: the diesel counts
 * from that lead as if armed now; RERT_AS_ARMED: from its lead if armed; RERT_NEVER: never.
 */
function walk(A, rertLead) {
  const obs = A.obs, fc = obs.forecast, rert = obs.rert, now = A.now;
  const n = fc.n + 1, un = new Array(n).fill(0), need = new Array(n).fill(0);
  let hydroE = A.hydroE, drE = A.drE, battE = A.battE;
  // Net demand is for the lit districts (Phase 2a, P-12: obs.demand.litMW now, litMW() ahead), less
  // the wind and solar there is: what the dispatch holds back in a surplus (C-6) is not a shortage.
  const windNow = obs.wind.outMW + obs.wind.autoMW * (1 - obs.wind.ofgsTrippedFrac), solarNow = obs.solar.outMW + obs.solar.autoMW;
  for (let k = 0; k < n; k++) {
    const lead = k * fc.stepS, t = now + lead, h = k === 0 ? 0 : fc.stepS / S_PER_H;
    const net = k === 0 ? obs.demand.litMW - windNow - solarNow
      : A.lit[k - 1] - fc.windMW[k - 1] - fc.solarMW[k - 1];
    const U = unitsAt(A, t);
    let firm = U.th + (t < A.tieBack ? 0 : Math.min(TIE_MAX, TIE_COL / STEP_S * (t - A.tieBack) + (obs.tie.tripped ? 0 : TIE_MAX)));
    if (rertLead === RERT_AS_ARMED && rert.armed && !rert.standingDown) firm += lead >= rert.leadS ? RERT_MW : rert.outMW;
    else if (rertLead >= 0 && lead >= rertLead) firm += RERT_MW;
    const d = net + RERT_MARGIN - firm;
    need[k] = d;
    if (d <= 0) continue;
    const pH = hydroE > EPS ? U.hy : 0, pD = drE > EPS ? DR_MW : 0, pB = battE > EPS ? A.battP : 0;
    un[k] = Math.max(0, d - (pH + pD + pB));
    if (h > 0) { // spend the pool (without the margin): water first, then DR's hours, then the battery
      let rest = Math.max(0, Math.min(d - RERT_MARGIN, pH + pD + pB)) * h;
      const xh = Math.min(rest, hydroE, pH * h); hydroE -= xh; rest -= xh;
      const xd = Math.min(rest, drE, pD * h); drE -= xd; rest -= xd;
      const xb = Math.min(rest, battE); battE -= xb; rest -= xb;
      if (rest > EPS) un[k] += rest / h;
    }
  }
  return {un, need};
}

/** First short step in [fromK, toK], or -1. */
function shortAt(W, fromK, toK) {
  for (let k = fromK; k <= toK && k < W.un.length; k++) if (W.un[k] > EPS) return k;
  return -1;
}
const uncoveredMWh = (W, h) => W.un.reduce((a, x, k) => a + (k === 0 ? 0 : x * h), 0);
/** Present net demand beyond units, tie and diesel (MW; > 0: short without the pool). */
const presentGap = W => W.need[0] - RERT_MARGIN;

function rule8(obs, memo) {
  const rert = obs.rert, dr = obs.dr, now = obs.s, fc = obs.forecast, h = fc.stepS / S_PER_H;
  const A = adequacySetup(obs);
  const W0 = walk(A, RERT_AS_ARMED);
  const kLead = Math.ceil(V.RERT_LEAD_S / fc.stepS), kLook = Math.floor(RERT_LOOK_S / fc.stepS);
  const sagging = (obs.agc.unmetMW > 0 && obs.f.hz < NORMAL_LO) || obs.districts.some(d => d.dark && d.shedBy === 'ufls');
  if (dr.activeS <= 0 && dr.callsLeft > 0) {
    let call = sagging;
    const gap = presentGap(W0) + DR_MARGIN;
    if (!call && gap > 0) {
      const powerShort = gap > (A.hydroE > EPS ? unitsAt(A, now).hy : 0) + A.battP;
      let hoursPower = 0; // hours ahead whose need exceeds hydro + battery power: DR must be on then
      for (let k = 1; k < W0.need.length; k++) if (W0.need[k] > unitsAt(A, now + k * fc.stepS).hy + A.battP) hoursPower += h;
      call = powerShort || (shortAt(W0, 1, W0.un.length - 1) >= 0 && dr.callsLeft - 1 >= Math.ceil(hoursPower - EPS));
    }
    if (call) return {type: 'callDR'};
  }
  if (!rert.armed) {
    let arm = shortAt(W0, kLead, kLook) >= 0;
    if (!arm) {
      const k1 = shortAt(W0, kLook + 1, W0.un.length - 1);
      if (k1 >= 0) {
        const late = uncoveredMWh(walk(A, (k1 - kLook + kLead) * fc.stepS), h), early = uncoveredMWh(walk(A, kLead * fc.stepS), h);
        arm = late > EPS && early < late - EPS;
      }
    }
    if (arm) { memo.rertSinceS = now; return {type: 'armRERT'}; }
  }
  if (rertStandDown(obs, memo, A)) return {type: 'standDownRERT'};
  return null;
}

/**
 * The diesel is stood down once it has run PAR_RERT_STANDDOWN_MIN, nothing is sagging, and
 * the adequacy walk without it finds nothing uncovered in the whole horizon. Rule 4 asks this
 * first (decommit the dearest resource first: $16,000/MWh against a GT's $4,000/h no-load;
 * at the night roll's pace rule 4's unit stops otherwise kept a stood-by diesel running all
 * night), rule 8 again.
 */
function rertStandDown(obs, memo, A0) {
  const rert = obs.rert;
  if (!rert.armed || rert.standingDown || memo.rertSinceS < 0 || obs.s - memo.rertSinceS < RERT_STANDDOWN_S) return false;
  if ((obs.agc.unmetMW > 0 && obs.f.hz < NORMAL_LO) || obs.districts.some(d => d.dark && d.shedBy === 'ufls')) return false;
  return shortAt(walk(A0 || adequacySetup(obs), RERT_NEVER), 0, obs.forecast.n) < 0;
}

// Rule 9 (extension, README §12): restore one dark district the K-13 permissive allows,
// lowest UFLS stage first, then rotation order. Par also checks the seconds: a restore is a
// load step no larger than L, so the TRIP PREVIEW for L, scaled by coldLoad / L, estimates
// its dip; par restores only when that estimate holds the K-13 restore preview's line
// (SECURE_NADIR_HZ + PREVIEW_MARGIN_HZ; the restore input runs the real restore preview and
// refuses below it, so a looser estimate only spends par's pace on refused inputs: 32 refused
// of 77 tried over 200 raw seeds at 49.2 Hz, 2 of 37 at this line).
function rule9(obs) {
  const sec = obs.sec;
  if (obs.f.hz < RESTORE_MIN_HZ || sec.lMW <= 0) return null;
  const F0 = V.F0_HZ, drop = Math.max(0, F0 - sec.previewNadirHz);
  const spillMW = obs.wind.autoMW + obs.solar.autoMW;
  let best = null;
  for (const d of obs.districts) {
    if (!d.dark || d.restoreBlock !== '') continue;
    // No larger than L, except in the belly (Phase 2a): there L is a machine at its floor (240 MW)
    // and a dark district's pickup is its underlying load with its roofs off (250-290 MW), so the
    // cap refused every district for hours while the dispatch spilled four times the pickup. When
    // what is being spilled covers the pickup, the scaled estimate below decides alone.
    if (d.coldLoadMW > sec.lMW && !(spillMW >= d.coldLoadMW)) continue;
    if (F0 - drop * d.coldLoadMW / sec.lMW < RESTORE_NADIR) continue;
    if (best === null) { best = d; continue; }
    const sd = d.uflsStage > 0 ? d.uflsStage : NEVER, sb = best.uflsStage > 0 ? best.uflsStage : NEVER;
    if (sd < sb || (sd === sb && d.rot < best.rot) || (sd === sb && d.rot === best.rot && d.id < best.id)) best = d;
  }
  return best ? {type: 'restore', district: best.id} : null;
}

const RULE_FNS = {rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8, rule9, rule6end: rule6End};
const NEEDS_SITUATION = new Set(['rule3', 'rule4']);
// The order decide() asks the rules in: S-4's, with rule 6's window end right after rule 1
// for the proxies that run rule 6 (its origin is 'rule6').
const RULE_ORDER = Object.fromEntries(Object.entries(PROXIES).map(([k, p]) => [k,
  p.rules.includes('rule6') ? p.rules.flatMap(r => (r === 'rule1' ? ['rule1', 'rule6end'] : [r])) : p.rules]));
const originOf = r => (r === 'rule6end' ? 'rule6' : r);

/**
 * Rule 7, whose action IS an amendment: re-dispatch a copy of the plan now; worth an action
 * only if it moves some lever at least PLAN_KEYFRAME_MIN_MW in the first column (from where the
 * lever is now) and the plan by at least PAR_REBASE_MW over the next hour. Then the copy becomes
 * the plan and its planLoad is the action (Phase 1a: the executor moves the levers); else null.
 */
function amendNow(obs, memo, want) { // eslint-disable-line no-unused-vars
  if (obs.s < memo.rebaseQuietS) return null;
  const P = copyPlan(memo.plan);
  const load = amend(obs, memo, P);
  const k0 = colAfter(P, obs.s);
  let lever = false;
  for (let j = 0; j < NS && k0 < P.n; j++) {
    const keys = load.stations[SIDS[j]];
    if (keys.length && keys[0][0] === colTime(P, k0) && Math.abs(keys[0][1] - obs.stations[j].basePointMW) >= KEYFRAME_MIN) lever = true;
  }
  if (!lever) { memo.rebaseQuietS = obs.s + STEP_S; return null; }
  // Worth an action only if the amendment really moves the plan over the next hour.
  let moved = 0;
  for (let k = k0; k < Math.min(P.n, k0 + REBASE_COLS); k++) {
    let d = Math.abs(P.tie[k] - memo.plan.tie[k]);
    for (let j = 0; j < NS; j++) d += Math.abs(P.lever[j][k] - memo.plan.lever[j][k]);
    if (d > moved) moved = d;
  }
  if (moved < REBASE) { memo.rebaseQuietS = obs.s + STEP_S; return null; }
  memo.plan = P;
  return load;
}

/**
 * One discrete decision. Returns at most ONE input (S-4 pace: at most one discrete action
 * per PAR_ACTION_GAP_REAL_S of refRealSeconds since the previous one, counting the watch
 * and respond time of contingencies in between, from obs.contingencies), and none during a
 * watch (obs.inWatch) or before PLAYER_START_H. Rules, in order (S-4), the first that
 * wants an action wins:
 *   1 after any trip: start the next peaker and set the tie to maximum import
 *   2 if R5 < PAR_TIGHT_RATIO x L: move the tie toward import and start the next peaker
 *     (v4 form: also the seconds half of N-1, see the file header)
 *   3 commit a unit when forecast net demand over (its start time + PAR_COMMIT_LEAD_MIN),
 *     plus PAR_COMMIT_MARGIN_MW, exceeds committed capacity plus half the battery
 *   4 decommit only after PAR_DECOMMIT_MIN_ON_MIN on, when not needed for
 *     PAR_DECOMMIT_CLEAR_MIN and N-1 still holds
 *   5 hold water until PAR_WATER_HOLD_UNTIL_H, then release linearly to PAR_WATER_EMPTY_BY_H
 *   6 charge the battery to PAR_BATT_CHARGE_TO during PAR_BATT_CHARGE_H; discharge by merit
 *     order (when obs.price.mwh exceeds the plan's marginal offer) during PAR_BATT_DISCHARGE_H
 *   7 keep units at or below PAR_MAX_LOADING unless that would shed load (and re-dispatch
 *     the plan when it has drifted off the forecast, see the file header)
 *   8 pre-arm RERT when the projected PAR_RERT_LOOKAHEAD_MIN shortfall is within
 *     PAR_RERT_MARGIN_MW of firm capacity; call DR on a present shortfall
 *   9 (extension, README §12: S-4 has no restore rule and H-6 forbids automatic restore)
 *     restore one dark district whose obs.districts[].restoreBlock is '': the lowest UFLS
 *     stage first, then rotation order (rot). The K-13 permissive holds all the thresholds.
 * Rule 6's window end (a discharge order past 22:00 or at the reserve) is asked right after
 * rule 1 (rule6End, see the file header).
 * Every action amends memo.plan (a re-dispatch from now, see the file header). AGC stays
 * on; par never takes the synchroscope (its starts auto-sync, K-12). Proxies change this
 * function as listed in runPar.
 * @param {object} obs observe(state)
 * @param {object} memo from createAutopilot; decide may update it
 * @returns {Array<{type:string}>} zero or one input; memo.lastOrigin names its rule ('rule1'..'rule9')
 */
export function decide(obs, memo) {
  memo.lastOrigin = '';
  const proxy = PROXIES[memo.proxy];
  if (obs.over || obs.inWatch || obs.s < START_S || proxy.rules.length === 0) return [];
  if (!memo.plan && proxy.plan && obs.dayAhead) makePlan(obs, memo);
  // New supply contingencies arm rule 1 (seen even while the pace holds par back).
  const cs = obs.contingencies;
  for (; memo.seenConts < cs.length; memo.seenConts++) {
    const c = cs[memo.seenConts];
    if (c.lostMW > 0) memo.trip = {n: c.n, start: true, tie: true, untilS: c.startS + SECURE_AGAIN_S};
  }
  // The plan re-flows at the first decision after an action, once obs shows its effect
  // (the unit starting, the new order, the relit district...). Not an action itself: its
  // planLoad waits in the outbox (planUpdates sends it, origin 'replan').
  if (memo.amendDue && memo.plan) memo.outbox.push({input: amend(obs, memo, memo.plan), tag: 'replan'});
  memo.amendDue = false;
  if (memo.lastActTick >= 0 && refRealSeconds(memo.lastActTick / TPS, obs.tick / TPS, paceConts(obs)) < proxy.gapS) return [];
  let C = null;
  for (const r of RULE_ORDER[memo.proxy]) {
    if (NEEDS_SITUATION.has(r) && C === null) C = situation(obs, memo);
    const want = RULE_FNS[r](obs, memo, C);
    if (!want) continue;
    let input = want;
    if (want.amendThen) {
      input = memo.plan ? amendNow(obs, memo, want) : null;
      if (!input) continue;
    } else if (want.type === 'tie' && memo.plan) {
      // Rules 1 and 2 hold the tie (memo.tieHoldS): the hold goes into the plan's tie keys at once,
      // or the plan's next tie key would pull the setpoint back before the next decision.
      memo.outbox.push({input: amend(obs, memo, memo.plan), tag: 'replan'});
    } else {
      memo.amendDue = true;
    }
    memo.lastActTick = obs.tick;
    memo.lastOrigin = originOf(r);
    memo.actions += 1;
    return [input];
  }
  return [];
}

// ------------------------------------------------------------------ fuzz proxy (F-3)

// A private integer hash of the seed (MurmurHash3 fmix32 on its own salt): the fuzzer
// never touches the sim's random streams.
function fmix(h) {
  h ^= h >>> V.RNG_FMIX_S1;
  h = Math.imul(h, V.RNG_FMIX_M1) >>> 0;
  h ^= h >>> V.RNG_FMIX_S2;
  h = Math.imul(h, V.RNG_FMIX_M2) >>> 0;
  h ^= h >>> V.RNG_FMIX_S1;
  return h >>> 0;
}
const fuzzU = (seed, a, b) => fmix(fmix(fmix((seed ^ V.PAR_FUZZ_SALT) >>> 0) ^ a) ^ b) / V.RNG_U32;

const FUZZ_TYPES = ['basePoint', 'start', 'stop', 'abortStop', 'syncClose', 'battery', 'guard', 'tie', 'curtail', 'callDR',
  'armRERT', 'standDownRERT', 'restore', 'directShed', 'planKey', 'planStart', 'planStop', 'planUnbook', 'scope', 'syncTrim', 'syncAuto'];
const BATT_MODES = ['charge', 'idle', 'discharge'], CURTAIL_KINDS = ['wind', 'solar'];
const FUZZ_DRAWS = ['go', 'type', 'a', 'b'];

/** At most one random input (valid shape; the sim may still refuse it) for this decision minute. */
function fuzzInput(seed, obs) {
  const minute = Math.floor(obs.s / S_PER_MIN);
  const d = FUZZ_DRAWS.map((_, j) => fuzzU(seed, minute, j)); // [go, type, first arg, second arg]
  if (d[0] >= V.PAR_FUZZ_P) return [];
  const pick = (list, x) => list[Math.min(list.length - 1, Math.floor(x * list.length))];
  const type = pick(FUZZ_TYPES, d[1]), a = d[2], b = d[3];
  switch (type) {
    case 'basePoint': { const st = pick(SIDS, a); return [{type, station: st, mw: Math.floor(b * V.STATIONS[st].totalMW)}]; }
    case 'start': case 'stop': case 'abortStop': case 'syncClose': return [{type, unit: pick(V.MACHINE_IDS, a)}];
    case 'battery': return [{type, mode: pick(BATT_MODES, a), mw: Math.floor(b * BATT_MW)}];
    case 'guard': return [{type, mw: Math.floor(a * (BATT_MW / V.GUARD_STEP_MW + 1)) * V.GUARD_STEP_MW}];
    case 'tie': return [{type, mw: Math.floor((a * 2 - 1) * TIE_MAX)}];
    case 'curtail': return [{type, kind: pick(CURTAIL_KINDS, a), limitPct: Math.floor(b * V.PCT)}];
    case 'restore': return [{type, district: pick(obs.districts, a).id}];
    case 'planKey': { const st = pick(SIDS, a); return [{type, station: st, atS: obs.s + Math.floor(b * S_PER_H), mw: Math.floor(b * V.STATIONS[st].totalMW)}]; }
    case 'planStart': case 'planStop': return [{type, unit: pick(V.MACHINE_IDS, a), atS: obs.s + Math.floor(b * S_PER_H)}];
    case 'planUnbook': case 'scope': case 'syncAuto': return [{type, unit: pick(V.MACHINE_IDS, a)}];
    case 'syncTrim': return [{type, unit: pick(V.MACHINE_IDS, a), dHz: b < 1 / 2 ? -V.SYNC_TRIM_HZ : V.SYNC_TRIM_HZ}];
    default: return [{type}];
  }
}

// ------------------------------------------------------------------ runPar (the harness)

const DAY_AHEAD = Object.freeze({dayAhead: true});

/**
 * Run a day headless with the given proxy (default 'par') from createState(seed, scenario),
 * or from opts.state (any tick; tests use it for the information barrier and for injected
 * inputs). From PLAYER_START_H (or at once if already past it), and then every
 * PAR_DECIDE_EVERY_S grid seconds and at the first second after each watch, it applies
 * decide(obs, memo) (origin = its rule) and planUpdates(obs, memo) (origin 'plan' or 'replan').
 * observe() is called only at those seconds (it allocates). Decisions fall on the first
 * tick of a grid second after its update has run (tick % 50 === 1): par then sees that
 * second's fresh security and price, and an input can never land in the second a
 * pre-rolled trip starts (the watch would have begun one tick earlier and locked the desk).
 * Proxies (opts.proxy):
 *   'par'       plan + rules 1-9 at PAR_ACTION_GAP_REAL_S
 *   'planOnly'  the plan and nothing else (L-0 accept: AGC + pre-dispatch, no input)
 *   'doNothing' no input at all, not even the plan (F-3)
 *   'lean'      plan + reaction only: rules 1, 2, 7, 8, 9 (no forward planning; S-5, S-12)
 *   'competent' plan + rules 1-9 at PROXY_COMPETENT_GAP_REAL_S (a good human; H-1, F-3, K-8)
 *   'commitAll' S-11: at 04:00 (tick 0, bypassing the pace and the 04:30 start) START every
 *               machine that is off, then par with rule 4 disabled (never decommits)
 *   'fuzz'      random valid inputs from a PRIVATE hash of the seed (never the sim's streams)
 * planOnly and lean keep the L-0 plan's stops; par, competent and commitAll drop them
 * (they decommit by rule 4 only, or never).
 * @param {number} seed
 * @param {object} scenario content/scenarios.js object
 * @param {{proxy?:string, untilTick?:number, hashEveryS?:number, state?:object, memo?:object,
 *   onStep?:function(object):void}} [opts]
 *   hashEveryS: record hashState every that many grid seconds (default 3600, F-2).
 *   memo: continue with this autopilot memory (a JSON copy of an earlier run's `memo`, with
 *   its `state` as opts.state: the resumed day is the day the first run would have played;
 *   the proxy is the memo's). Without it par starts a fresh memory (and plans at once if
 *   past 04:30).
 *   onStep(state): called after EVERY step (tests sample frequency, SECURE states or UFLS
 *   through it; it must not modify state).
 * @returns {{score:object, summary:object, log:Array<object>, origins:string[], hashes:number[],
 *   black:boolean, plan:object|null, state:object, memo:object}}
 *   origins[i] is 'plan' (the L-0 plan), 'replan' (par's re-dispatched schedule after an
 *   action, see the file header), 'rule1'..'rule9', or the proxy name for log[i] ('external'
 *   for records already in opts.state's log).
 */
export function runPar(seed, scenario, opts) {
  const o = opts || {};
  if (o.memo && o.proxy && o.proxy !== o.memo.proxy) throw new Error('runPar: opts.proxy ' + o.proxy + ' but the memo is ' + o.memo.proxy);
  const proxy = o.memo ? o.memo.proxy : o.proxy || 'par';
  if (!Object.hasOwn(PROXIES, proxy)) throw new Error('runPar: unknown proxy ' + proxy);
  const P = PROXIES[proxy];
  const state = o.state || createState(seed, scenario);
  const until = o.untilTick === undefined ? DAY_TICKS : o.untilTick;
  const hashEvery = (o.hashEveryS === undefined ? S_PER_H : o.hashEveryS) * TPS;
  const onStep = o.onStep || null;
  const memo = o.memo || createAutopilot({proxy});
  const origins = new Array(state.log.length).fill('external');
  const hashes = [];
  const sink = [], tags = [];
  const feed = (inputs, origin, byInput) => {
    for (let j = 0; j < inputs.length; j++) {
      sink.length = 0;
      if (applyInput(state, inputs[j], sink).ok) origins.push(byInput ? byInput[j] : origin);
    }
  };
  if (proxy === 'commitAll' && !state.over && !o.memo) {
    const starts = [];
    for (const u of state.units) if (u.mode === 'off') starts.push({type: 'start', unit: u.id});
    feed(starts, proxy);
  }
  const acts = P.rules.length > 0, usesPlan = P.plan, fuzz = proxy === 'fuzz';
  const active = acts || usesPlan || fuzz;
  while (!state.over && state.tick < until) {
    const t = state.tick;
    if (active && t % TPS === 1 && t > V.PLAYER_START_TICK) {
      if (inWatch(state)) {
        memo.afterWatch = true;
      } else {
        const s = (t - 1) / TPS;
        if (memo.afterWatch || s >= memo.nextS) {
          memo.afterWatch = false;
          memo.nextS = s + DECIDE_EVERY_S;
          const obs = observe(state, usesPlan && memo.plan === null ? DAY_AHEAD : undefined);
          if (usesPlan && memo.plan === null) makePlan(obs, memo);
          if (fuzz) feed(fuzzInput(seed, obs), proxy);
          if (acts) {
            const d = decide(obs, memo);
            if (d.length) feed(d, memo.lastOrigin);
          }
          if (usesPlan) {
            tags.length = 0;
            feed(planUpdates(obs, memo, tags), 'plan', tags);
          }
        }
      }
    }
    step(state);
    if (onStep !== null) onStep(state);
    if (state.tick % hashEvery === 0) hashes.push(hashState(state));
  }
  const end = observe(state);
  const sc = end.score;
  return {
    score: sc,
    summary: {lightsMWh: sc.lightsMWh, costDollars: sc.costDollars, centsPerKWh: sc.centsPerKWh, co2t: sc.co2t,
      co2tPerMWh: sc.co2tPerMWh, servedMWh: sc.servedMWh},
    log: state.log, origins, hashes, black: state.black, plan: memo.plan, state, memo,
  };
}

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
// Inputs par makes come in two kinds, told apart by runPar's `origins`:
//   'plan'   the L-0 plan being executed (base points, starts, stops, tie setpoints at
//            their planned times). This stands in for "levers follow the plan" (K-2, L-6):
//            it is the system's schedule, not a discrete action, so it is NOT paced.
//   'ruleN'  a discrete action from S-4 rule N (1..9), paced: at most one per
//            PAR_ACTION_GAP_REAL_S of the reference playback (refRealSeconds).
// Phase 1a moves the plan into state (a `plan` input and field, L-4/L-6); then plan inputs
// disappear from the log.
//
// How par edits its plan (0.2 form; README §12 "autopilot"):
//   * Every discrete action AMENDS the plan: after it, par re-dispatches its keyframes
//     from now to 04:00 over the commitment it now has (present modes, pending plan
//     starts, its own starts), with the latest forecast (obs.forecast, 4.5 h) and the
//     day-ahead forecast beyond it. The amended keyframes are issued as 'plan' inputs as
//     they fall due, like L-4's "later keyframes stay" re-flow. This is how the Live
//     Stack absorbs a new layer; it is not an extra discrete action.
//   * Rule 7 (extension): "keep units at or below PAR_MAX_LOADING unless that would shed
//     load" is applied by that re-dispatch; rule 7 itself fires when a unit's base point
//     is above the limit, when AGC carries more than PAR_REBASE_MW, or when the plan misses
//     the forecast for the coming column by more than PAR_REBASE_MW (a red or blue gap on
//     the Live Stack, L-5). Its input is the largest lever move of the amended plan.
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
//   * Rule 8's firm capacity leaves the battery out (it is the contingency reserve; an
//     evening run on its energy leaves the next trip to UFLS) and counts the tie up to its
//     secure maximum; DR counts while calls are left. See rule8().
//   * Rule 9 (extension, README §12) restores only a district whose cold load is at most
//     L and whose estimated dip (the TRIP PREVIEW scaled by coldLoad / L) holds
//     PAR_NADIR_MIN_HZ, on top of the K-13 permissive.
// The S-4 pace applies to every discrete action; at the reference playback's night roll
// (2,100x) that is one action per ~105 grid-minutes, so restores after a late shed are slow.

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
const KEYFRAME_MIN = V.PLAN_KEYFRAME_MIN_MW;

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
const GUARD_STEP = V.PAR_GUARD_STEP_MW, GUARD_MAX = V.PAR_GUARD_MAX_MW;
const RERT_LOOK_S = V.PAR_RERT_LOOKAHEAD_MIN * S_PER_MIN, RERT_MARGIN = V.PAR_RERT_MARGIN_MW;
const RERT_STANDDOWN_S = V.PAR_RERT_STANDDOWN_MIN * S_PER_MIN, DR_MARGIN = V.PAR_DR_MARGIN_MW;
const NORMAL_LO = V.NORMAL_LO_HZ, RESTORE_MIN_HZ = V.RESTORE_MIN_HZ, SECURE_AGAIN_S = V.SECURE_AGAIN_S;

// ------------------------------------------------------------------ proxies

// Rules each proxy runs (S-4 order) and its pace (README autopilot, "Proxies").
const ALL_RULES = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6', 'rule7', 'rule8', 'rule9'];
const PROXIES = {
  par: {rules: ALL_RULES, gapS: GAP_REAL_S, plan: true, stops: false},
  planOnly: {rules: [], gapS: GAP_REAL_S, plan: true, stops: true},
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

/** An empty plan on the 5-min grid from madeAtS: column k arrives at t0 + k x STEP_S, the last at 04:00. */
function newPlan(madeAtS) {
  const n = Math.max(0, Math.floor((DAY_S - madeAtS) / STEP_S));
  const z = () => new Array(n).fill(0);
  return {madeAtS, t0: madeAtS + STEP_S, stepS: STEP_S, n,
    fc: {p50: z(), wind: z(), solar: z(), price: z(), expLim: z()},
    lever: SIDS.map(() => z()), tie: z(), marg: z(), gap: z(),
    starts: [], stops: [], basePoints: [], ties: [], queue: [], amended: 0};
}

const colTime = (P, k) => P.t0 + k * STEP_S;

/** A copy of plan P that an amendment may rewrite (fc and the L-0 lists are read-only there, so they are shared until adopted). */
function copyPlan(P) {
  return Object.assign({}, P, {lever: P.lever.map(a => a.slice()), tie: P.tie.slice(), marg: P.marg.slice(), gap: P.gap.slice(),
    queue: P.queue.slice(), fc: P.fc, starts: P.starts, stops: P.stops, basePoints: P.basePoints, ties: P.ties});
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
 * (battery, RERT, DR, the no-export and tie caps, rule 5, PAR_MAX_LOADING).
 */
function context(obs, P, k0, par, memo) {
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
  // Starts the plan still has pending (par keeps them: they are the L-0 commitment).
  if (par) {
    for (const e of P.starts) {
      const i = V.MACHINE_IDS.indexOf(e.unit);
      if (e.atS > now && cx.on[i] < 0 && obs.units[i].mode === 'off') {
        cx.on[i] = e.atS + obs.units[i].startToMinS; cx.off[i] = NEVER;
        cx.starts.push({unit: e.unit, atS: e.atS});
      }
    }
  }
  let shed = 0;
  for (const d of obs.districts) if (d.dark) shed += d.share;
  // Load the forecast does not carry (the cold-load surge of restored districts, K-13), fading
  // out over COLD_LOAD_DECAY_S as it does in the grid.
  const coldNow = par ? Math.max(0, obs.balance.servedMW + obs.dr.mw - obs.demand.nowMW * (1 - shed)) : 0;
  const ofgs = obs.wind.ofgsTrippedFrac, fc = obs.forecast, fn = fc.n;
  const b = obs.battery;
  const order = b.mode === 'discharge' ? b.orderMW : b.mode === 'charge' && !b.fullHold ? -b.orderMW : 0;
  const orderEnd = order > 0 ? DIS_TO_S : order < 0 ? CHARGE_TO_S : now;
  const tieBack = obs.tie.tripped ? now + obs.tie.lockoutS : now;
  const rert = obs.rert, dr = obs.dr;
  const heatLate = heat && heat.atS > P.madeAtS; // announced after the day-ahead forecast was made
  for (let k = k0; k < n; k++) {
    const t = colTime(P, k), lead = t - now;
    let p50 = fcAt(fc.demandP50, obs.demand.nowMW, fn, lead);
    let wind = fcAt(fc.windMW, obs.wind.availMW, fn, lead);
    let solar = fcAt(fc.solarMW, obs.solar.availMW, fn, lead);
    let price = fcAt(fc.neighbourPrice, obs.tie.neighbourPrice, fn, lead);
    let expLim = fcAt(fc.exportLimitMW, obs.tie.exportLimitMW, fn, lead);
    if (p50 === null) { // beyond the 4.5-h forecast: the day-ahead values, with an announced heatwave
      p50 = P.fc.p50[k] * (heatLate && t >= heat.fromS && t < heat.toS ? 1 + HEAT_UP : 1);
      wind = P.fc.wind[k]; solar = P.fc.solar[k]; price = P.fc.price[k]; expLim = P.fc.expLim[k];
    }
    let other = 0;
    if (par) {
      if (t < orderEnd) other += order;
      if (rert.armed && !rert.standingDown) other += lead >= rert.leadS ? RERT_MW : rert.outMW;
      if (dr.activeS > 0 && lead < dr.activeS) other += DR_MW;
      other -= coldNow * Math.max(0, 1 - lead / V.COLD_LOAD_DECAY_S);
    }
    cx.cover[k] = p50 * (1 - shed) - wind * (1 - ofgs) - solar - other;
    cx.price[k] = price;
    cx.expLim[k] = expLim;
    cx.tieCap[k] = t < tieBack ? 0 : TIE_MAX;
  }
  return cx;
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
        const lock = u.mode === 'tripped' ? u.timerS : 0;
        const wait = Math.max(0, m.minDownS - u.downForS, lock);
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

/** Keyframe inputs for columns [k0, n) of P, written into the public lists and the queue. */
function writeKeyframes(P, cx, obs, keepStops, publicLists) {
  const now = obs.s, k0 = cx.k0, q = [];
  const bps = [], ties = [];
  for (let j = 0; j < NS; j++) {
    let last = obs.stations[j].basePointMW, lastCnt = obs.stations[j].onCount, first = publicLists;
    for (let k = k0; k < P.n; k++) {
      const t = colTime(P, k);
      let c = 0;
      for (let i = STA[j].first; i < STA[j].first + STA[j].count; i++) if (isOn(cx, i, t)) c++;
      if (c === 0) { lastCnt = 0; continue; }
      const mw = P.lever[j][k];
      if (first || c !== lastCnt || Math.abs(mw - last) >= KEYFRAME_MIN) {
        bps.push({station: SIDS[j], atS: Math.max(now, t - STEP_S), mw});
        last = mw; lastCnt = c; first = false;
      }
    }
  }
  let lastTie = obs.tie.setMW, firstTie = publicLists;
  for (let k = k0; k < P.n; k++) {
    const mw = clamp(P.tie[k], -TIE_MAX, TIE_MAX);
    if (firstTie || Math.abs(mw - lastTie) >= KEYFRAME_MIN) {
      ties.push({atS: Math.max(now, colTime(P, k) - STEP_S), mw: mw + 0});
      lastTie = mw; firstTie = false;
    }
  }
  if (publicLists) {
    P.starts = cx.starts.slice().sort(byAtThenUnit);
    P.stops = cx.stops.filter(e => e.atS < DAY_S).sort(byAtThenUnit);
    P.basePoints = bps.slice().sort((a, b) => a.atS - b.atS || SIDS.indexOf(a.station) - SIDS.indexOf(b.station));
    P.ties = ties.slice();
  }
  for (const e of P.starts) if (e.atS >= now) q.push({atS: e.atS, o: KIND_ORDER.start, id: e.unit, input: {type: 'start', unit: e.unit}});
  if (keepStops) for (const e of P.stops) if (e.atS >= now) q.push({atS: e.atS, o: KIND_ORDER.stop, id: e.unit, input: {type: 'stop', unit: e.unit}});
  for (const e of bps) q.push({atS: e.atS, o: KIND_ORDER.basePoint, id: e.station, input: {type: 'basePoint', station: e.station, mw: e.mw}});
  for (const e of ties) q.push({atS: e.atS, o: KIND_ORDER.tie, id: '', input: {type: 'tie', mw: e.mw}});
  q.sort((a, b) => a.atS - b.atS || a.o - b.o || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  P.queue = q;
}

// Queue order within one second: stops, starts, base points, the tie (a stopping machine
// leaves its station lever before the new base point is split over the machines still on).
const KIND_ORDER = Object.fromEntries(['stop', 'start', 'basePoint', 'tie'].map((k, j) => [k, j]));

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
 * @returns {{madeAtS:number, starts:Array<{unit:string, atS:number}>, stops:Array<{unit:string, atS:number}>,
 *   basePoints:Array<{station:string, atS:number, mw:number}>, ties:Array<{atS:number, mw:number}>}}
 *   every list sorted by atS, then by id; at most one basePoint per station and one tie
 *   setpoint per FC_STEP_S column; every step ramp-feasible from the previous one. The
 *   plan also carries its grid (t0, n), the day-ahead columns (fc), the planned levers,
 *   tie, marginal offer and gap per column, and the queue of inputs still to issue.
 */
export function preDispatch(obs) {
  const fc = obs.dayAhead || obs.forecast;
  const P = newPlan(obs.s);
  const last = Math.max(0, fc.n - 1);
  for (let k = 0; k < P.n; k++) {
    const j = Math.min(k, last);
    P.fc.p50[k] = fc.demandP50[j]; P.fc.wind[k] = fc.windMW[j]; P.fc.solar[k] = fc.solarMW[j];
    P.fc.price[k] = fc.neighbourPrice[j]; P.fc.expLim[k] = fc.exportLimitMW[j];
  }
  // The day-ahead columns fall exactly on the plan grid: use them as the forecast here.
  const dayObs = Object.assign({}, obs, {forecast: fc});
  const cx = context(dayObs, P, 0, false, null);
  commitPlan(obs, P, cx);
  dispatchPlan(P, cx);
  writeKeyframes(P, cx, obs, true, true);
  return P;
}

/**
 * Par's amendment: re-dispatch plan P from now to 04:00 over par's present commitment and
 * pending plan starts, with the latest forecast. Rewrites the queue (par drops the L-0
 * stops: it decommits by rule 4 only). Returns P.
 */
function amend(obs, memo, P) {
  const k0 = colAfter(P, obs.s);
  const cx = context(obs, P, k0, true, memo);
  dispatchPlan(P, cx);
  writeKeyframes(P, cx, obs, PROXIES[memo.proxy].stops, false);
  P.amended += 1;
  return P;
}

// ------------------------------------------------------------------ memo and plan inputs

/**
 * Fresh par memory (plain JSON, so a resumed day resumes par too): the proxy, the plan
 * (null until PLAYER_START_H), the plan cursor, and the last action's tick.
 * @param {{proxy?:'par'|'planOnly'|'doNothing'|'lean'|'competent'|'commitAll'|'fuzz'}} [opts]
 * @returns {object} memo
 */
export function createAutopilot(opts) {
  const proxy = opts && opts.proxy ? opts.proxy : 'par';
  if (!Object.hasOwn(PROXIES, proxy)) throw new Error('createAutopilot: unknown proxy ' + proxy);
  return {proxy, plan: null, planNext: 0, planTieMW: null, lastActTick: -1, lastOrigin: '', actions: 0, amendDue: false,
    seenConts: 0, trip: null, tieHoldS: -1, tieHoldMW: 0, secureTieMW: 0, guardHoldS: -1, rebaseQuietS: -1, water: 'hold', rertSinceS: -1};
}

/** Make the day's plan from a day-ahead observation (runPar does this at PLAYER_START_H). */
function makePlan(obs, memo) {
  memo.plan = preDispatch(obs);
  memo.planNext = 0;
  if (!PROXIES[memo.proxy].stops) memo.plan.queue = memo.plan.queue.filter(e => e.input.type !== 'stop');
}

/**
 * The plan's inputs that are due: every plan entry with atS <= obs.s not yet issued
 * (memo.planNext cursor), as inputs ({type:'start'|'stop'|'basePoint'|'tie', ...}), in plan
 * order. Returns [] during a watch (obs.inWatch) or before PLAYER_START_H; entries that fell
 * due meanwhile are issued at the first call after. An entry the sim refuses is dropped
 * (the next keyframe corrects it). Not paced (see the file header). While rule 1 or 2
 * holds the tie, the plan's tie entries wait; when the hold ends, the plan's current tie
 * setpoint is issued again.
 * @param {object} obs observe(state)
 * @param {object} memo from createAutopilot (holds the plan once made)
 * @returns {Array<{type:string}>}
 */
export function planInputs(obs, memo) {
  if (!memo.plan || obs.over || obs.inWatch || obs.s < START_S) return [];
  const q = memo.plan.queue, out = [];
  const held = memo.tieHoldS > obs.s;
  while (memo.planNext < q.length && q[memo.planNext].atS <= obs.s) {
    const e = q[memo.planNext++];
    if (e.input.type === 'tie') {
      memo.planTieMW = e.input.mw;
      if (held) continue;
    }
    out.push(Object.assign({}, e.input));
  }
  if (memo.tieHoldS >= 0 && !held) {
    memo.tieHoldS = -1;
    if (memo.planTieMW !== null && !obs.tie.tripped) out.push({type: 'tie', mw: memo.planTieMW});
  }
  return out;
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
// previews near 48.4 Hz); par's plan still imports more if the P50 would be short.
function rule1(obs, memo) {
  const tr = memo.trip;
  if (tr === null) return null;
  if (obs.s >= tr.untilS) { memo.trip = null; return null; }
  if (tr.start) {
    tr.start = false;
    const i = nextStart(obs, true);
    if (i >= 0) return startInput(i);
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
  if (lowNadir && calm && b.guardMW + GUARD_STEP <= GUARD_MAX) return {type: 'guard', mw: b.guardMW + GUARD_STEP};
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
  const mx = peakNet(C, DECOMMIT_CLEAR_S);
  for (const i of MERIT_DESC) {
    const u = obs.units[i], m = M[i];
    if (u.mode !== 'on' || u.stopBlock !== '' || u.upForS < DECOMMIT_ON_S) continue;
    if (m.cls === 'coal' || m.cls === 'hydro') continue;
    if (mx + COMMIT_MARGIN + DECOMMIT_EXTRA + u.availMW >= C.capCommitted + C.battMW / 2) continue;
    const r5Without = obs.sec.r5MW - Math.max(0, Math.min(u.availMW - u.outMW, u.rampMWMin * R5_MIN));
    const lWithout = obs.sec.lId === u.id ? secondLargest(obs, u.id) : obs.sec.lMW;
    if (r5Without < TIGHT * lWithout) continue;
    return {type: 'stop', unit: u.id};
  }
  return null;
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
  let mode = 'idle', mw = 0;
  if (now >= CHARGE_FROM_S && now < CHARGE_TO_S && b.socMWh < CHARGE_TO_MWH - ORDER_TOL * COL_H) {
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
  if (Math.abs(want - have) <= ORDER_TOL) return null;
  return {type: 'battery', mode, mw: Math.floor(mw)};
}

// Rule 7 (with its extension): keep units at or below PAR_MAX_LOADING unless that would
// shed load, and keep the plan on the forecast (re-dispatch when AGC or the plan is off by
// more than PAR_REBASE_MW). Returns a marker; decide() amends and picks the lever to move.
function rule7(obs, memo, C) {
  const P = memo.plan;
  if (!P) return null;
  let trigger = Math.abs(obs.agc.requestMW) > REBASE;
  for (const u of obs.units) if (u.mode === 'on' && u.basePointMW > PAR_LOADING * u.availMW + KEYFRAME_MIN) trigger = true;
  if (!trigger) {
    const k = colAfter(P, obs.s);
    if (k < P.n) {
      let supply = P.tie[k];
      for (let j = 0; j < NS; j++) supply += P.lever[j][k];
      const t = colTime(P, k), lead = t - obs.s, fc = obs.forecast;
      const p50 = fcAt(fc.demandP50, obs.demand.nowMW, fc.n, lead), w = fcAt(fc.windMW, obs.wind.availMW, fc.n, lead);
      const so = fcAt(fc.solarMW, obs.solar.availMW, fc.n, lead);
      if (p50 !== null && Math.abs(p50 - w - so - supply) > REBASE) trigger = true;
    }
  }
  return trigger ? {amendThen: 'lever'} : null;
}

// Rule 8: pre-arm reserve diesel when the projected PAR_RERT_LOOKAHEAD_MIN shortfall is
// within PAR_RERT_MARGIN_MW of firm capacity; call DR on a present shortfall; stand the
// diesel down once it has not been needed for a while. Firm capacity: committed units up to
// the hot gate (hydro while it has water), the tie's full import (0 while tripped), the
// diesel once armed, DR while active or while a call is left (it can be called in minutes).
// The battery is NOT counted: it is the contingency reserve (primary response, H-8); an
// evening carried on the battery's energy leaves the next trip uncovered (the integration
// pass and par's own runs saw UFLS at the peak on an emptied battery).
function rule8(obs, memo) {
  const rert = obs.rert, dr = obs.dr, now = obs.s;
  let units = 0;
  for (let i = 0; i < NU; i++) {
    const u = obs.units[i];
    if (committedMode(u.mode) && !(M[i].station === 'hydro' && !hydroWet(obs))) units += HOT_GATE * u.availMW;
  }
  const tieBack = obs.tie.tripped ? now + obs.tie.lockoutS : now;
  const drCan = dr.activeS <= 0 && dr.callsLeft > 0;
  const fc = obs.forecast;
  let shed = 0;
  for (const d of obs.districts) if (d.dark) shed += d.share;
  // The tie counts up to its secure cap (the largest unit): importing more makes it the
  // largest risk (an 800-MW loss previews near 48.4-48.9 Hz at the peak).
  let big = 0;
  for (let i = 0; i < NU; i++) if (committedMode(obs.units[i].mode)) big = Math.max(big, PAR_LOADING * obs.units[i].availMW);
  const tieFirm = Math.min(TIE_MAX, big);
  // DR counts while a call is running or can still be made (a new call follows the last).
  const drFirm = lead => (dr.activeS > lead || dr.callsLeft > 0 ? DR_MW : 0);
  const firmAt = (t, lead) => units + (t >= tieBack ? tieFirm : 0) + (rert.armed && !rert.standingDown ? RERT_MW : 0) + drFirm(lead);
  const netNow = obs.demand.nowMW * (1 - shed) - obs.wind.outMW - obs.solar.outMW;
  const shortNow = netNow - firmAt(now, 0);
  let shortAhead = shortNow;
  for (let k = 0; k < fc.n && (k + 1) * fc.stepS <= RERT_LOOK_S; k++) {
    const lead = (k + 1) * fc.stepS;
    shortAhead = Math.max(shortAhead, fc.demandP50[k] * (1 - shed) - fc.windMW[k] - fc.solarMW[k] - firmAt(now + lead, lead));
  }
  if (!rert.armed && shortAhead + RERT_MARGIN > 0) { memo.rertSinceS = now; return {type: 'armRERT'}; }
  const sagging = (obs.agc.unmetMW > 0 && obs.f.hz < NORMAL_LO) || obs.districts.some(d => d.dark && d.shedBy === 'ufls');
  if (drCan && (shortNow + DR_MW + DR_MARGIN > 0 || sagging)) return {type: 'callDR'}; // short without DR's own MW
  if (rert.armed && !rert.standingDown && memo.rertSinceS >= 0 && now - memo.rertSinceS >= RERT_STANDDOWN_S && !sagging &&
      shortAhead + RERT_MARGIN + RERT_MW < 0) return {type: 'standDownRERT'};
  return null;
}

// Rule 9 (extension, README §12): restore one dark district the K-13 permissive allows,
// lowest UFLS stage first, then rotation order. Par also checks the seconds: a restore is a
// load step no larger than L, so the TRIP PREVIEW for L, scaled by coldLoad / L, estimates
// its dip; par restores only when that estimate holds PAR_NADIR_MIN_HZ (the integration
// pass saw an unchecked 293-MW restore on an empty battery set off UFLS again).
function rule9(obs) {
  const sec = obs.sec;
  if (obs.f.hz < RESTORE_MIN_HZ || sec.lMW <= 0) return null;
  const F0 = V.F0_HZ, drop = Math.max(0, F0 - sec.previewNadirHz);
  let best = null;
  for (const d of obs.districts) {
    if (!d.dark || d.restoreBlock !== '' || d.coldLoadMW > sec.lMW) continue;
    if (F0 - drop * d.coldLoadMW / sec.lMW < NADIR_MIN) continue;
    if (best === null) { best = d; continue; }
    const sd = d.uflsStage > 0 ? d.uflsStage : NEVER, sb = best.uflsStage > 0 ? best.uflsStage : NEVER;
    if (sd < sb || (sd === sb && d.rot < best.rot) || (sd === sb && d.rot === best.rot && d.id < best.id)) best = d;
  }
  return best ? {type: 'restore', district: best.id} : null;
}

const RULE_FNS = {rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8, rule9};
const NEEDS_SITUATION = new Set(['rule3', 'rule4']);

/**
 * Rule 7, whose action IS an amendment: re-dispatch a copy of the plan now and return its
 * largest first-column lever move, taken out of the amended queue; the copy becomes the
 * plan only if there is such a move (else null).
 */
function amendNow(obs, memo, want) {
  if (obs.s < memo.rebaseQuietS) return null;
  const P = amend(obs, memo, copyPlan(memo.plan));
  let pick = -1, best = KEYFRAME_MIN;
  for (let e = 0; e < P.queue.length; e++) {
    const x = P.queue[e];
    if (x.atS > obs.s) break;
    if (x.input.type !== 'basePoint') continue;
    const d = Math.abs(x.input.mw - obs.stations[SIDS.indexOf(x.input.station)].basePointMW);
    if (d >= best) { best = d; pick = e; }
  }
  if (pick < 0) { memo.rebaseQuietS = obs.s + STEP_S; return null; }
  // Worth an action only if the amendment really moves the plan over the next hour.
  const k0 = colAfter(P, obs.s);
  let moved = 0;
  for (let k = k0; k < Math.min(P.n, k0 + REBASE_COLS); k++) {
    let d = Math.abs(P.tie[k] - memo.plan.tie[k]);
    for (let j = 0; j < NS; j++) d += Math.abs(P.lever[j][k] - memo.plan.lever[j][k]);
    if (d > moved) moved = d;
  }
  if (moved < REBASE) { memo.rebaseQuietS = obs.s + STEP_S; return null; }
  const input = P.queue[pick].input;
  P.queue.splice(pick, 1);
  memo.plan = P;
  memo.planNext = 0;
  return input;
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
  // (the unit starting, the new order, the relit district...). Not an action itself.
  if (memo.amendDue && memo.plan) { amend(obs, memo, memo.plan); memo.planNext = 0; }
  memo.amendDue = false;
  if (memo.lastActTick >= 0 && refRealSeconds(memo.lastActTick / TPS, obs.tick / TPS, paceConts(obs)) < proxy.gapS) return [];
  let C = null;
  for (const r of proxy.rules) {
    if (NEEDS_SITUATION.has(r) && C === null) C = situation(obs, memo);
    const want = RULE_FNS[r](obs, memo, C);
    if (!want) continue;
    let input = want;
    if (want.amendThen) {
      input = memo.plan ? amendNow(obs, memo, want) : null;
      if (!input) continue;
    } else {
      memo.amendDue = true;
    }
    memo.lastActTick = obs.tick;
    memo.lastOrigin = r;
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
  'armRERT', 'standDownRERT', 'restore', 'directShed'];
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
 * decide(obs, memo) (origin = its rule) and planInputs(obs, memo) (origin 'plan').
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
 * @param {{proxy?:string, untilTick?:number, hashEveryS?:number, state?:object,
 *   onStep?:function(object):void}} [opts]
 *   hashEveryS: record hashState every that many grid seconds (default 3600, F-2).
 *   onStep(state): called after EVERY step (tests sample frequency, SECURE states or UFLS
 *   through it; it must not modify state).
 * @returns {{score:object, summary:object, log:Array<object>, origins:string[], hashes:number[],
 *   black:boolean, plan:object|null, state:object, memo:object}}
 *   origins[i] is 'plan', 'rule1'..'rule9', or the proxy name for log[i] ('external' for
 *   records already in opts.state's log).
 */
export function runPar(seed, scenario, opts) {
  const o = opts || {};
  const proxy = o.proxy || 'par';
  if (!Object.hasOwn(PROXIES, proxy)) throw new Error('runPar: unknown proxy ' + proxy);
  const P = PROXIES[proxy];
  const state = o.state || createState(seed, scenario);
  const until = o.untilTick === undefined ? DAY_TICKS : o.untilTick;
  const hashEvery = (o.hashEveryS === undefined ? S_PER_H : o.hashEveryS) * TPS;
  const onStep = o.onStep || null;
  const memo = createAutopilot({proxy});
  const origins = new Array(state.log.length).fill('external');
  const hashes = [];
  const sink = [];
  const feed = (inputs, origin) => {
    for (const x of inputs) {
      sink.length = 0;
      if (applyInput(state, x, sink).ok) origins.push(origin);
    }
  };
  if (proxy === 'commitAll' && !state.over) {
    const starts = [];
    for (const u of state.units) if (u.mode === 'off') starts.push({type: 'start', unit: u.id});
    feed(starts, proxy);
  }
  const acts = P.rules.length > 0, usesPlan = P.plan, fuzz = proxy === 'fuzz';
  const active = acts || usesPlan || fuzz;
  let nextS = -1, afterWatch = false;
  while (!state.over && state.tick < until) {
    const t = state.tick;
    if (active && t % TPS === 1 && t > V.PLAYER_START_TICK) {
      if (inWatch(state)) {
        afterWatch = true;
      } else {
        const s = (t - 1) / TPS;
        if (afterWatch || s >= nextS) {
          afterWatch = false;
          nextS = s + DECIDE_EVERY_S;
          const obs = observe(state, usesPlan && memo.plan === null ? DAY_AHEAD : undefined);
          if (usesPlan && memo.plan === null) makePlan(obs, memo);
          if (fuzz) feed(fuzzInput(seed, obs), proxy);
          if (acts) {
            const d = decide(obs, memo);
            if (d.length) feed(d, memo.lastOrigin);
          }
          if (usesPlan) feed(planInputs(obs, memo), 'plan');
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

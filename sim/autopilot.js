// sim/autopilot.js: the L-0 pre-dispatch plan, PAR (the fixed reference dispatcher) and the
// player proxies (spec L-0, S-4, S-11, S-12, P-6, O-3 "Marg runs covered controls", §6).
//
// STAGE B owner: "autopilot" (also tools/par.js). Contract: sim/README.md, "autopilot.js".
// Information barrier (S-4): everything here reads ONLY observe(state) output. It must not
// import sim/events.js, sim/weather.js or content/, and must never see state, state.ext or
// the seed (tests/sim-lint.test.js). It may import sim/params.js (public constants) and
// sim/step.js (runPar is the harness around decide()).
//
// Inputs par makes come in two kinds, told apart by runPar's `origins`:
//   'plan'   the L-0 plan being executed (base points, starts, stops, tie setpoints at
//            their planned times). This stands in for "levers follow the plan" (K-2, L-6):
//            it is the system's schedule, not a discrete action, so it is NOT paced.
//   'ruleN'  a discrete action from S-4 rule N (1..9), paced: at most one per
//            PAR_ACTION_GAP_REAL_S of the reference playback (refRealSeconds).
// Phase 1a moves the plan into state (a `plan` input and field, L-4/L-6); then plan inputs
// disappear from the log.

/**
 * L-0 pre-dispatch: a merit-order schedule for the P50 forecast, computed ONCE at
 * PLAYER_START_H from observe(state, {dayAhead: true}) (obs.dayAhead covers to 04:00).
 * Pure and deterministic (L-0 accept: identical for the same seed and SIM_VERSION).
 * For each FC_STEP_S column: net demand = dayAhead.demandP50 - windMW - solarMW; the stack
 * is the P-6 offers (thermal minimum-load blocks first, then coal 26, CCGT 74, GTs 148-156,
 * hydro 130) plus the tie as a price-taking block: import up to TIE_MAX_MW when
 * neighbourPrice[k] is below the marginal offer, export up to exportLimitMW[k] when it is
 * above (that merit rule is what keeps par's tie off a single limit, P-6). Commitments obey
 * start times (startToMinS from 'off'), ramps (rampMWMin), minimum up/down times (V.MACHINES)
 * and the units' present modes; base points are split per station. The plan deliberately
 * ignores N-1, warned hazards, drift after 04:30 and the noon minimum-generation problem.
 * The battery is left to rule 6 (the plan schedules it idle).
 * @param {object} obs observe(state, {dayAhead: true}) at (or after) PLAYER_START_H
 * @returns {{madeAtS:number, starts:Array<{unit:string, atS:number}>, stops:Array<{unit:string, atS:number}>,
 *   basePoints:Array<{station:string, atS:number, mw:number}>, ties:Array<{atS:number, mw:number}>}}
 *   every list sorted by atS, then by id; at most one basePoint per station and one tie
 *   setpoint per FC_STEP_S column; every step ramp-feasible from the previous one.
 */
export function preDispatch(obs) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: autopilot)');
}

/**
 * The plan's inputs that are due: every plan entry with atS <= obs.s not yet issued
 * (memo.planNext cursor), as inputs ({type:'start'|'stop'|'basePoint'|'tie', ...}), in plan
 * order. Returns [] during a watch (obs.inWatch) or before PLAYER_START_H; entries that fell
 * due meanwhile are issued at the first call after. An entry the sim refuses is dropped
 * (the next keyframe corrects it). Not paced (see the file header).
 * @param {object} obs observe(state)
 * @param {object} memo from createAutopilot (holds the plan once made)
 * @returns {Array<{type:string}>}
 */
export function planInputs(obs, memo) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: autopilot)');
}

/**
 * Fresh par memory (plain JSON, so a resumed day resumes par too): the proxy, the plan
 * (null until PLAYER_START_H), the plan cursor, and the last action's grid second.
 * @param {{proxy?:'par'|'planOnly'|'doNothing'|'lean'|'competent'|'commitAll'|'fuzz'}} [opts]
 * @returns {object} memo
 */
export function createAutopilot(opts) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: autopilot)');
}

/**
 * One discrete decision. Returns at most ONE input (S-4 pace: at most one discrete action
 * per PAR_ACTION_GAP_REAL_S of refRealSeconds since the previous one, counting the watch
 * and respond time of contingencies in between, from obs.contingencies), and none during a
 * watch (obs.inWatch) or before PLAYER_START_H. Rules, in order (S-4), the first that
 * wants an action wins:
 *   1 after any trip: start the next peaker and set the tie to maximum import
 *   2 if R5 < PAR_TIGHT_RATIO x L: move the tie toward import and start the next peaker
 *   3 commit a unit when forecast net demand over (its start time + PAR_COMMIT_LEAD_MIN),
 *     plus PAR_COMMIT_MARGIN_MW, exceeds committed capacity plus half the battery
 *   4 decommit only after PAR_DECOMMIT_MIN_ON_MIN on, when not needed for
 *     PAR_DECOMMIT_CLEAR_MIN and N-1 still holds
 *   5 hold water until PAR_WATER_HOLD_UNTIL_H, then release linearly to PAR_WATER_EMPTY_BY_H
 *   6 charge the battery to PAR_BATT_CHARGE_TO during PAR_BATT_CHARGE_H; discharge by merit
 *     order (when obs.price.mwh exceeds the plan's marginal offer) during PAR_BATT_DISCHARGE_H
 *   7 keep units at or below PAR_MAX_LOADING unless that would shed load
 *   8 pre-arm RERT when the projected PAR_RERT_LOOKAHEAD_MIN shortfall is within
 *     PAR_RERT_MARGIN_MW of firm capacity; call DR on a present shortfall
 *   9 (extension, README §12: S-4 has no restore rule and H-6 forbids automatic restore)
 *     restore one dark district whose obs.districts[].restoreBlock is '': the lowest UFLS
 *     stage first, then rotation order (rot). The K-13 permissive holds all the thresholds.
 * Rules 1-2 and 7-9 may amend memo.plan (e.g. the tie after rule 1 returns to the plan
 * after the trip's RESPOND window). AGC stays on; par never takes the synchroscope (its
 * starts auto-sync, K-12). Proxies change this function as listed in runPar.
 * @param {object} obs observe(state)
 * @param {object} memo from createAutopilot; decide may update it
 * @returns {Array<{type:string}>} zero or one input; memo.lastOrigin names its rule ('rule1'..'rule9')
 */
export function decide(obs, memo) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: autopilot)');
}

/**
 * Reference real seconds for grid seconds [fromS, toS) under the D-2 profile (REF_PROFILE;
 * its hours are UNWRAPPED: h = DAY_START_H + s / 3600, up to 28). Each contingency
 * replaces the profile over its own grid seconds (D-5, the parts inside [fromS, toS)):
 * the watch [startS, watchEndS) costs REF_WATCH_REAL_S in all (pro rata if cut), the
 * respond card REF_RESPOND_CARD_S at watchEndS, then RESPOND runs at RESPOND_RATE from
 * watchEndS until backInBandS (or for RESPOND_MAX_S if it is -1 or later). Before
 * PLAYER_START_H the rate is that of the profile's first segment. Pure; used for the S-4
 * pace rule and by tests.
 * @param {number} fromS
 * @param {number} toS
 * @param {Array<{startS:number, watchEndS:number, backInBandS:number}>} conts obs.contingencies
 * @returns {number}
 */
export function refRealSeconds(fromS, toS, conts) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: autopilot)');
}

/**
 * Run a day headless with the given proxy (default 'par') from createState(seed, scenario),
 * or from opts.state (any tick; tests use it for the information barrier and for injected
 * inputs). From PLAYER_START_H (or at once if already past it), and then every
 * PAR_DECIDE_EVERY_S grid seconds and at the first second after each watch, it applies
 * planInputs(obs, memo) (origin 'plan') and decide(obs, memo) (origin = its rule).
 * observe() is called only at those seconds (it allocates). Proxies (opts.proxy):
 *   'par'       plan + rules 1-9 at PAR_ACTION_GAP_REAL_S
 *   'planOnly'  the plan and nothing else (L-0 accept: AGC + pre-dispatch, no input)
 *   'doNothing' no input at all, not even the plan (F-3)
 *   'lean'      plan + reaction only: rules 1, 2, 7, 8, 9 (no forward planning; S-5, S-12)
 *   'competent' plan + rules 1-9 at PROXY_COMPETENT_GAP_REAL_S (a good human; H-1, F-3, K-8)
 *   'commitAll' S-11: at 04:00 (tick 0, bypassing the pace and the 04:30 start) START every
 *               machine that is off, then par with rule 4 disabled (never decommits)
 *   'fuzz'      random valid inputs from a PRIVATE hash of the seed (never the sim's streams)
 * @param {number} seed
 * @param {object} scenario content/scenarios.js object
 * @param {{proxy?:string, untilTick?:number, hashEveryS?:number, state?:object,
 *   onStep?:function(object):void}} [opts]
 *   hashEveryS: record hashState every that many grid seconds (default 3600, F-2).
 *   onStep(state): called after EVERY step (tests sample frequency, SECURE states or UFLS
 *   through it; it must not modify state).
 * @returns {{score:object, summary:object, log:Array<object>, origins:string[], hashes:number[],
 *   black:boolean, plan:object|null, state:object}}
 *   origins[i] is 'plan', 'rule1'..'rule9', or the proxy name for log[i].
 */
export function runPar(seed, scenario, opts) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: autopilot)');
}

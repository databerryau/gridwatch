// sim/step.js: the sim's public API (spec F-2, F-3, F-4, F-6, C-6, C-7).
//
//   createState(seed, scenario) -> state      plain JSON, ext timeline pre-rolled
//   step(state, inputs)         -> events[]   one 20-ms physics tick; every 50th tick
//                                             also runs the 1-s grid update first
//   applyInput(state, input, out)             validate + apply + log one input
//   observe(state, opts)        -> obs        the player's view (desk, map, autopilot)
//   hashState(state)            -> u32        fingerprint of all state except scn and ext
//   replay(seed, scenario, log) -> state      F-6 headless replay (throws on divergence)
//
// Stage A wrote this file and it works as far as its callees do; stage B owner
// "integration" keeps it. The order of calls in step() is part of the contract
// (sim/README.md §3): change it only through the README. The observe() shape is frozen
// (README §8, tests/state.test.js); hashState needs no edits when state grows.

import {V, SIM_VERSION} from './params.js';
import * as weather from './weather.js';
import * as events from './events.js';
import * as fleet from './fleet.js';
import * as physics from './physics.js';
import * as grid from './grid.js';
import * as market from './market.js';
import {hash32} from './rng.js';

export {SIM_VERSION};

const TPS = V.TICKS_PER_S, DAY_TICKS = V.DAY_TICKS, DAY_S = V.DAY_S, F0 = V.F0_HZ;
const S_PER_H = V.S_PER_H, S_PER_MIN = V.S_PER_MIN, MSL_CHECK_S = V.MSL_CHECK_S;
const EMPTY = Object.freeze([]);
const buf = []; // step()'s event buffer, reused; step returns a copy only when non-empty

const zeros = n => new Array(n).fill(0);
const ones = n => new Array(n).fill(1);
const falses = n => new Array(n).fill(false);
const clone = x => JSON.parse(JSON.stringify(x));

// A deep plain copy of scenario data without its source annotations (content/scenarios.js).
const SOURCE_KEYS = new Set(['src', 'note', 'simplified', 'unverified']);
function scenarioData(x) {
  if (Array.isArray(x)) return x.map(scenarioData);
  if (x !== null && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) if (!SOURCE_KEYS.has(k)) o[k] = scenarioData(x[k]);
    return o;
  }
  return x;
}

// ------------------------------------------------------------------ createState

function freshScore() {
  return {servedMWh: 0, unservedMWh: 0, uflsMWh: 0, directedMWh: 0, taskMWh: 0,
    cost: {fuel: 0, noLoad: 0, starts: 0, tie: 0, battWear: 0, dr: 0, rert: 0, flex: 0},
    co2t: 0, genMWh: 0, marketBill: 0, minHz: F0, maxHz: F0, outsideNormalS: 0, spark: zeros(V.SPARK_BLOCKS), starts: 0,
    spillMWh: 0, // Phase 2a (desk/README.md §19.2): wind and solar energy held back or backed off; counted, never charged for
    saidiMin: 0, saifi: 0, maifi: 0}; // Q-48
}

// The opening second is balanced with the online hydro machines (within their range),
// as the legacy baseline did (tools/baseline.js); AGC takes over from the first second.
function balanceOpening(state) {
  const env = state.env, ren = state.ren;
  ren.windCurtMW = env.windAvailMW * (V.PCT - ren.windLimitPct) / V.PCT + 0;
  ren.solarCurtMW = env.solarAvailMW * (V.PCT - ren.solarLimitPct) / V.PCT + 0;
  ren.windMW = env.windAvailMW - ren.windCurtMW + 0;
  ren.solarMW = env.solarAvailMW - ren.solarCurtMW + 0;
  let other = state.tie.flowMW + ren.windMW + ren.solarMW + state.battery.outMW;
  const hyd = [];
  for (const u of state.units) {
    if (!u.sync) continue;
    if (u.station === 'hydro') hyd.push(u); else other += u.outMW;
  }
  if (!hyd.length) return;
  const m = V.MACHINES[hyd[0].k];
  const each = Math.min(m.ratingMW, Math.max(m.minMW, (env.demandMW - other) / hyd.length));
  for (const u of hyd) { u.basePointMW = each; u.schedMW = each; u.outMW = each; }
  fleet.refreshLever(state, 'hydro');
}

/**
 * A new day. Pure and deterministic in (seed, scenario): pre-rolls the whole ext
 * timeline (regime, events, series) and returns a plain JSON-serialisable object.
 * @param {number} seed u32 (other numbers are reduced with >>> 0)
 * @param {object} scenario e.g. CLASSIC from content/scenarios.js
 */
export function createState(seed, scenario) {
  if (!scenario || typeof scenario !== 'object') throw new Error('createState(seed, scenario): scenario object required');
  seed = seed >>> 0;
  const scn = scenarioData(scenario);
  const regime = weather.prerollRegime(seed, scn);
  const evs = events.prerollEvents(seed, scn, regime);
  const series = weather.prerollSeries(seed, scn, regime, evs);
  const ha = evs.find(e => e.type === 'heatAnnounce');
  const c = scn.commitment;
  const units = fleet.buildUnits(scn);
  const nSub = scn.city.suburbs.length;
  const state = {
    v: SIM_VERSION, seed, scenarioId: scn.id, tick: 0, over: false, black: false,
    scn, scnHash: canonicalHash(scn),
    // ext.rooftop: the per-suburb clearness series (P-2, C-5), null when the scenario has no rooftop.
    ext: {regime, events: evs, series, rooftop: weather.prerollRooftop(seed, scn, evs),
      heat: ha ? {announceS: ha.atS, onsetS: ha.args.onsetS, endS: ha.args.endS} : null},
    evNext: 0,
    // Phase 2a (desk/README.md §19.2, C-2): the public kind of day. The hidden ext.regime.temp is
    // read here once and nowhere else; a heatwave day reads 'HOT' (its heat is announced at 10:30).
    day: {temp: regime.temp === 'MILD' ? 'MILD' : 'HOT', weekend: !!(scn.day && scn.day.weekend)},
    env: {s: 0, h: 0, demandMW: 0, underlyingMW: 0, windAvailMW: 0, solarAvailMW: 0, windFrac: 0, clearness: 0,
      heatActive: false, heatMult: 1, tempC: 0, neighbourPrice: 0, exportLimitMW: 0,
      rooftopMW: 0, roofSubMW: zeros(nSub), roofClearFrac: ones(nSub), // Phase 2a: as if every inverter were connected
      flexMW: 0, flexSubMW: zeros(nSub), reliefSubMW: zeros(nSub)}, // 2b: city flex, as if lit
    msl: {level: 0, minMW: 0, atS: -1, sinceS: -1}, // P-4 (Phase 2a, C-9): events.mslSecond, every MSL_CHECK_S; never written with no rooftop
    control: {mode: c.mode, modeLocked: false},
    stations: fleet.buildStations(units),
    units,
    battery: {mode: c.battery.mode, orderMW: c.battery.mw, guardMW: c.battery.guardMW, schedMW: 0, agcTrimMW: 0,
      pfrMW: 0, ffrMW: 0, ffrFiredTick: -1, outMW: 0, socMWh: c.battery.socMWh, fullHold: false, ufSuspend: false},
    tie: {setMW: c.tieMW, flowMW: c.tieMW, tripped: false, lockoutS: 0},
    ren: {windLimitPct: c.windLimitPct, solarLimitPct: c.solarLimitPct, windMW: 0, solarMW: 0,
      windCurtMW: 0, solarCurtMW: 0, // curtailed MW (grid: they move at CURTAIL_RAMP_FRAC_MIN)
      windAutoMW: 0, solarAutoMW: 0}, // Phase 2a (C-6): MW held back by the dispatch, on top of the manual LIMIT
    hydro: {storageMWh: V.HYDRO_ALLOCATION_MWH, warned: falses(V.HYDRO_WARN_FRACS.length)},
    rert: {armed: false, leadS: 0, outMW: 0, standingDown: false, armedEver: false},
    dr: {callsLeft: V.DR_CALLS, activeS: 0, mw: 0},
    smelter: {loadMW: V.SMELTER_MW, offS: 0, returning: false, returnS: 0}, // returnS: events (return ramp start)
    city: fleet.buildCity(scn),
    ufls: {timerS: zeros(V.UFLS_STAGES), operated: falses(V.UFLS_STAGES)},
    ofgs: {timerS: zeros(V.OFGS_STAGES_HZ.length), tripped: falses(V.OFGS_STAGES_HZ.length), trippedFrac: 0, okS: 0},
    collapse: {bandS: zeros(V.COLLAPSE_BANDS.length)},
    phys: {fHz: F0, fHist: new Array(V.FHIST_LEN).fill(F0), rocofHzS: 0, ekMWs: 0, schedSupplyMW: 0, supplyMW: 0,
      servedMW: 0, loadMW: 0, imbalanceMW: 0, inertiaMW: 0, govTotalMW: 0, loadReliefMW: 0, shedMW: 0,
      renPfrMW: 0, roofPfrMW: 0, roofHoldFrac: 0}, // Phase 2a (C-7): the inverters' over-frequency back-off (MW >= 0) and its hold
    agc: {nextCycleS: 0, requestMW: 0, unmetMW: 0, atLimitS: 0, aceMW: 0},
    fos: {outsideS: 0, belowContainS: 0, countdownS: V.FOS_RECOVER_S, directed: false, nextShedS: 0},
    sec: {r5MW: 0, lMW: 0, lKind: 'none', lId: '', ratio: 0, previewNadirHz: F0, previewAtS: -1, previewLId: '',
      previewLMW: 0, previewFHz: F0, dirty: true, level: 'SECURE',
      // A-2 (Phase 1a): the cached previews of both credible contingencies; pv*: what they previewed (private)
      previewUnitHz: F0, previewLinkHz: F0, pvUnitId: '', pvUnitMW: 0, pvLinkMW: 0, pvHeadMW: 0},
    price: {mwh: 0, marginalId: '', adder: 0, exhausted: false, x: 0},
    acc: fleet.newAcc(),
    last: {fMeanHz: F0, fMinHz: F0, fMaxHz: F0, servedMW: 0, shedMW: 0},
    score: freshScore(),
    conts: [], contIdx: -1, news: [], log: [],
    plan: grid.newPlan(),                // L-0, L-4, L-6 (Phase 1a): keyframes and bookings; grid.planSecond executes them
    scope: {unit: '', nextAutoTick: -1}, // K-12: the unit on the synchroscope ('' none); the next syncAuto close tick
    levers: {rev: 0, patience: scn.levers ? scn.levers.suburbs.map(x => x.patience) : [], blocks: []}, // 2b (U-2, U-4)
  };
  state.phys.ekMWs = fleet.ekMWs(state);
  weather.sampleSecond(state);
  balanceOpening(state);
  return state;
}

// ------------------------------------------------------------------ step

// The 1-s grid update, at the start of every grid second (tick % 50 === 0).
function gridSecond(state, out) {
  if (state.tick > 0) market.settleSecond(state, out); // the second that just ended
  events.applyDue(state, out);                          // ext events due now (trips, weather, news)
  grid.planSecond(state, out);                          // the plan: booked stops, starts, keyframes, tie keys (Phase 1a)
  weather.sampleSecond(state);                          // env for this second
  if (state.env.s % MSL_CHECK_S === 0) {                // P-4 (Phase 2a): the MSL level, from one forecast per check
    events.mslSecond(state, weather.forecast(state, V.FC_HORIZON_S, V.FC_STEP_S), out);
  }
  grid.unitsSecond(state, out);                         // state machines, timers, hot trips
  grid.agcSecond(state, out);                           // AGC trims (every AGC_CYCLE_S)
  grid.dispatchSecond(state, out);                      // ramps, battery, tie, renewables, RERT, DR
  grid.fosSecond(state, out);                           // FOS timers, directed shedding, cold load
  grid.securitySecond(state, out);                      // R5, L, level (cached preview)
  market.priceSecond(state, out);                       // merit-order price
}

function finish(state, out) {
  market.settleSecond(state, out);
  state.over = true;
  out.push({tick: state.tick, kind: 'dayEnd', black: state.black});
}

/**
 * Advance one physics tick (20 ms of grid time). Inputs are applied first, then (on a
 * second boundary) the grid update, then physics. Returns event records (a shared frozen
 * empty array when there are none). No-op once state.over.
 * @param {object} state
 * @param {Array<{type:string}>} [inputs]
 * @returns {ReadonlyArray<object>}
 */
export function step(state, inputs = EMPTY) {
  if (state.over) return EMPTY;
  if (buf.length !== 0) buf.length = 0; // (the length store is a runtime call: skip it on the common empty tick)
  for (let i = 0; i < inputs.length; i++) applyInput(state, inputs[i], buf);
  if (state.tick % TPS === 0) gridSecond(state, buf);
  if (state.tick === state.scope.nextAutoTick) grid.syncTick(state, buf); // K-12 AUTO: the breaker closes on its tick
  physics.tick(state, buf);
  state.tick += 1;
  if (state.black || state.tick >= DAY_TICKS) finish(state, buf);
  return buf.length ? buf.slice() : EMPTY;
}

// ------------------------------------------------------------------ inputs (F-6)

// Argument kinds; each input type lists exactly its arguments (extra keys are refused,
// so logs stay canonical).
const SHAPES = {
  basePoint: {station: 'station', mw: 'mw'},
  start: {unit: 'unit'},
  stop: {unit: 'unit'},
  abortStop: {unit: 'unit'},
  syncClose: {unit: 'unit', bypass: 'bool'},
  battery: {mode: ['charge', 'idle', 'discharge'], mw: 'mw'},
  guard: {mw: 'guard'},
  tie: {mw: 'tie'},
  curtail: {kind: ['wind', 'solar'], limitPct: 'pct'},
  callDR: {},
  armRERT: {},
  standDownRERT: {},
  mode: {agc: 'bool'},
  restore: {district: 'district'},
  directShed: {},
  // Phase 1a (desk/README.md §3.2): the plan in state, the synchroscope.
  planKey: {station: 'station', atS: 'second', mw: 'mw'},
  planDel: {station: 'station', atS: 'second'},
  planStart: {unit: 'unit', atS: 'second'},
  planStop: {unit: 'unit', atS: 'second'},
  planUnbook: {unit: 'unit'},
  planRejoin: {station: 'station', keep: 'bool'},
  planLoad: {fromS: 'second', stations: 'planStations', tie: 'planTie', starts: 'planBook', stops: 'planBook'},
  scope: {unit: 'unitOrNone'},
  syncTrim: {unit: 'unit', dHz: 'trim'},
  syncAuto: {unit: 'unit'},
  // 2b: the city levers
  flex: {suburb: 'suburb', lever: ['soak', 'aircon'], atS: 'second'},
  flexDel: {suburb: 'suburb', lever: ['soak', 'aircon'], atS: 'second'},
};
export const INPUT_TYPES = Object.freeze(Object.keys(SHAPES));
// Arguments a caller may leave out; the canonical copy (and so the log) always carries them.
const DEFAULTS = {syncClose: {bypass: false}};

const finite = v => typeof v === 'number' && Number.isFinite(v);
const isSecond = v => Number.isInteger(v) && v >= 0 && v <= DAY_S;
const MAX_KEYS = V.PLAN_MAX_KEYS;

/** '' if v is an array of at most PLAN_MAX_KEYS [atS, mw] pairs, atS strictly increasing, mw valid. */
function keyListProblem(v, mwOk, mwWhat) {
  if (!Array.isArray(v)) return 'must be an array of [atS, mw] pairs';
  if (v.length > MAX_KEYS) return 'more than ' + MAX_KEYS + ' entries';
  for (let k = 0; k < v.length; k++) {
    const e = v[k];
    if (!Array.isArray(e) || e.length !== 2) return 'entry ' + k + ' must be [atS, mw]';
    if (!isSecond(e[0])) return 'entry ' + k + ': atS must be a whole grid second 0..' + DAY_S;
    if (!mwOk(e[1])) return 'entry ' + k + ': mw ' + mwWhat;
    if (k > 0 && e[0] <= v[k - 1][0]) return 'entries must be sorted by atS, one per second';
  }
  return '';
}

function argProblem(state, kind, v) {
  if (Array.isArray(kind)) return kind.includes(v) ? '' : 'must be one of ' + kind.join('|');
  switch (kind) {
    case 'station': return V.STATION_IDS.includes(v) ? '' : 'unknown station';
    case 'unit': return V.MACHINE_IDS.includes(v) ? '' : 'unknown unit';
    case 'unitOrNone': return v === '' || V.MACHINE_IDS.includes(v) ? '' : 'unknown unit (\'\' closes the scope)';
    case 'district': return state.city.districts.some(d => d.id === v) ? '' : 'unknown district';
    case 'suburb': return state.scn.city.suburbs.some(x => x.id === v) ? '' : 'unknown suburb';
    case 'mw': return finite(v) && v >= 0 ? '' : 'must be a finite MW >= 0';
    case 'guard': return finite(v) && v >= 0 && v <= V.BATT_MW && v % V.GUARD_STEP_MW === 0 ? ''
      : 'must be 0..' + V.BATT_MW + ' MW in ' + V.GUARD_STEP_MW + '-MW steps';
    case 'tie': return finite(v) && Math.abs(v) <= V.TIE_MAX_MW ? '' : 'must be within +-' + V.TIE_MAX_MW + ' MW';
    case 'pct': return finite(v) && v >= 0 && v <= V.PCT ? '' : 'must be 0..100';
    case 'bool': return typeof v === 'boolean' ? '' : 'must be true or false';
    case 'second': return isSecond(v) ? '' : 'must be a whole grid second 0..' + DAY_S;
    case 'trim': return v === V.SYNC_TRIM_HZ || v === -V.SYNC_TRIM_HZ ? '' : 'must be +-' + V.SYNC_TRIM_HZ + ' Hz';
    case 'planStations': {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'must be an object {station: [[atS, mw], ...]}';
      for (const k of Object.keys(v)) {
        if (!V.STATION_IDS.includes(k)) return 'unknown station ' + k;
        const p = keyListProblem(v[k], x => finite(x) && x >= 0, 'must be a finite MW >= 0');
        if (p) return k + ': ' + p;
      }
      return '';
    }
    case 'planTie': return keyListProblem(v, x => finite(x) && Math.abs(x) <= V.TIE_MAX_MW, 'must be within +-' + V.TIE_MAX_MW + ' MW');
    case 'planBook': {
      if (!Array.isArray(v)) return 'must be an array of [unit, atS] pairs';
      if (v.length > MAX_KEYS) return 'more than ' + MAX_KEYS + ' entries';
      const seen = new Set();
      for (let k = 0; k < v.length; k++) {
        const e = v[k];
        if (!Array.isArray(e) || e.length !== 2) return 'entry ' + k + ' must be [unit, atS]';
        if (!V.MACHINE_IDS.includes(e[0])) return 'entry ' + k + ': unknown unit';
        if (!isSecond(e[1])) return 'entry ' + k + ': atS must be a whole grid second 0..' + DAY_S;
        if (seen.has(e[0])) return 'entry ' + k + ': one booking per unit';
        seen.add(e[0]);
        if (k > 0 && (e[1] < v[k - 1][1] || (e[1] === v[k - 1][1] && e[0] < v[k - 1][0]))) return 'entries must be sorted by atS, then unit';
      }
      return '';
    }
    default: return 'bad argument kind';
  }
}

/** The canonical copy of one validated argument: numbers with -0 folded, plan lists rebuilt (never the caller's arrays). */
function canonArg(kind, v) {
  switch (kind) {
    case 'planStations': {
      const o = {};
      for (const id of V.STATION_IDS) o[id] = Object.hasOwn(v, id) ? v[id].map(e => [e[0] + 0, e[1] + 0]) : [];
      return o;
    }
    case 'planTie': return v.map(e => [e[0] + 0, e[1] + 0]);
    case 'planBook': return v.map(e => [e[0], e[1] + 0]);
    default: return typeof v === 'number' ? v + 0 : v;
  }
}

/** A plain copy of an applied argument for the log record (the log never shares arrays with cmd or state). */
const logArg = v => (typeof v === 'number' ? v + 0 : v !== null && typeof v === 'object' ? clone(v) : v);

/** True during the watch (K-15): the first WATCH_S after the latest contingency. */
export function inWatch(state) {
  return state.contIdx >= 0 && state.tick < state.conts[state.contIdx].watchEndTick;
}

/**
 * Validate and apply one input at the current tick; log it if accepted (F-6).
 * 1. Shape (known type, exactly its args, each valid); 2. day over / watch lock (K-15);
 * 3. canonical copy {type, ...args} with -0 folded to 0; 'mode' is applied here (D-7: only
 * before PLAYER_START_H and before any other input), everything else by
 * grid.applyCommand(state, cmd, out), which may normalise cmd's NUMERIC args to what it
 * applied (e.g. a basePoint clamped to the station's range); 4. accepted -> sec.dirty,
 * modeLocked (non-mode), and the log record {tick, type, args} from cmd AFTER grid ran,
 * so the log holds what was applied. A refused input changes nothing, is not logged, and
 * pushes {kind:'input', ok:false, type, reason} to out.
 * @returns {{ok:boolean, reason:string}}
 */
export function applyInput(state, input, out = []) {
  const type = input !== null && typeof input === 'object' && typeof input.type === 'string' ? input.type : null;
  const reject = reason => {
    const rec = {tick: state.tick, kind: 'input', ok: false, type, reason};
    const cue = grid.REFUSAL_CUES[reason];
    if (cue) rec.cue = cue; // K-12: the sync-check relay's buzz
    out.push(rec);
    return {ok: false, reason};
  };
  if (input === null || typeof input !== 'object') return reject('input must be an object');
  if (type === null || !Object.hasOwn(SHAPES, type)) return reject('unknown input type');
  const shape = SHAPES[type], defs = Object.hasOwn(DEFAULTS, type) ? DEFAULTS[type] : null;
  for (const k of Object.keys(input)) if (k !== 'type' && !Object.hasOwn(shape, k)) return reject('unexpected argument ' + k);
  const argOf = k => (input[k] === undefined && defs !== null && Object.hasOwn(defs, k) ? defs[k] : input[k]);
  for (const k of Object.keys(shape)) {
    const p = argProblem(state, shape[k], argOf(k));
    if (p) return reject(k + ' ' + p);
  }
  if (state.over) return reject('the day is over');
  if (inWatch(state)) return reject('desk locked during the watch');   // K-15
  const cmd = {type};
  for (const k of Object.keys(shape)) cmd[k] = canonArg(shape[k], argOf(k));
  if (type === 'mode') {
    if (state.tick >= V.PLAYER_START_TICK) return reject('AGC/HAND is chosen at the briefing, before 04:30 (D-7)');
    if (state.control.modeLocked) return reject('AGC/HAND is locked for the day (D-7)');
    state.control.mode = cmd.agc ? 'AGC' : 'HAND';
  } else {
    const r = grid.applyCommand(state, cmd, out);
    if (r) return reject(r);
    state.control.modeLocked = true;
  }
  state.sec.dirty = true;
  const args = {};
  for (const k of Object.keys(shape)) args[k] = logArg(cmd[k]);
  state.log.push({tick: state.tick, type, args});
  return {ok: true, reason: ''};
}

// ------------------------------------------------------------------ observe (S-4 barrier)

const pad2 = n => String(n).padStart(2, '0');

// observe() copies these keys explicitly, so a private field a module adds to its state
// object never leaks into the player's view and never changes the frozen shape.
const SEC_KEYS = ['r5MW', 'lMW', 'lKind', 'lId', 'ratio', 'previewNadirHz', 'previewAtS', 'previewLId', 'previewLMW', 'dirty', 'level',
  'previewUnitHz', 'previewLinkHz'];
const PLAN_STATION_KEYS = ['id', 'man', 'doneS', 'clampedMW'];

/** observe().plan: the plan in state by explicit keys (the executor's private fields stay out). */
function planView(P) {
  const keys = ks => ks.map(k => ({atS: k.atS, mw: k.mw}));
  const books = bs => bs.map(b => ({unit: b.unit, atS: b.atS}));
  return {madeAtS: P.madeAtS, rev: P.rev,
    stations: P.stations.map(ps => Object.assign(pick(ps, PLAN_STATION_KEYS), {keys: keys(ps.keys)})),
    tie: {doneS: P.tie.doneS, keys: keys(P.tie.keys)},
    starts: books(P.starts), stops: books(P.stops)};
}
const FOS_KEYS = ['outsideS', 'belowContainS', 'countdownS', 'directed', 'nextShedS'];
const AGC_KEYS = ['nextCycleS', 'requestMW', 'unmetMW', 'atLimitS', 'aceMW'];
const PRICE_KEYS = ['mwh', 'marginalId', 'adder', 'exhausted', 'x'];
const SCORE_KEYS = ['servedMWh', 'unservedMWh', 'uflsMWh', 'directedMWh', 'taskMWh', 'cost', 'co2t', 'genMWh', 'marketBill', 'minHz',
  'maxHz', 'outsideNormalS', 'spark', 'starts', 'spillMWh', 'saidiMin', 'saifi', 'maifi'];
const COST_KEYS = ['fuel', 'noLoad', 'starts', 'tie', 'battWear', 'dr', 'rert', 'flex'];
const CAUGHT_KEYS = ['inertiaMW', 'batteryMW', 'guardMW', 'governorsMW', 'loadReliefMW', 'uflsMW', 'inverterMW'];
const MSL_KEYS = ['level', 'minMW', 'atS', 'sinceS'];
const CONT_KEYS = ['n', 'startTick', 'cause', 'id', 'lostMW', 'fStartHz', 'ekBeforeMWs', 'ekAfterMWs', 'rocofHzS', 'extremeHz',
  'extremeTick', 'pre', 'caught', 'uflsStages', 'contained', 'backInBandTick', 'watchEndTick', 'secureByTick'];

// A copy of o with exactly `keys` (values deep-copied as plain JSON).
function pick(o, keys) {
  const r = {};
  for (const k of keys) {
    const v = o[k];
    r[k] = v !== null && typeof v === 'object' ? clone(v) : v;
  }
  return r;
}

function contingencyView(c) {
  const r = pick(c, CONT_KEYS);
  r.pre = pick(c.pre, CAUGHT_KEYS);
  r.caught = pick(c.caught, CAUGHT_KEYS);
  return r;
}

function scoreView(score) {
  const r = pick(score, SCORE_KEYS);
  r.cost = pick(score.cost, COST_KEYS);
  return Object.assign(r, market.scoreSummary(score));
}

// Clock from integer seconds (floating hours would show 04:00 at 04:01:00).
function clockOf(scn, s) {
  const sod = (Math.round(scn.clock.startH * S_PER_H) + s) % DAY_S;
  const hh = Math.floor(sod / S_PER_H), mm = Math.floor((sod % S_PER_H) / S_PER_MIN), ss = sod % S_PER_MIN;
  return {h: weather.hourOfDay(scn, s), hh, mm, ss, text: pad2(hh) + ':' + pad2(mm)};
}

/**
 * The player's view: everything the desk, map, Live Stack and autopilot may read, and
 * nothing else. Never includes state.ext, the seed, the weather regime, future events,
 * event ids or state.evNext. Every value is a fresh copy (mutating obs never touches
 * state). The shape is frozen (README §8; tests/state.test.js checks the key lists).
 * @param {object} state
 * @param {{dayAhead?:boolean}} [opts] dayAhead: also build obs.dayAhead, the forecast to the
 *   end of the sim day (L-0 pre-dispatch). Otherwise obs.dayAhead is null.
 */
export function observe(state, opts) {
  const s = Math.floor(state.tick / TPS), env = state.env, ph = state.phys, b = state.battery, t = state.tie;
  const cont = state.contIdx >= 0 ? state.conts[state.contIdx] : null;
  const windOut = state.ren.windMW * (1 - state.ofgs.trippedFrac);
  // Phase 2a (desk/README.md §19.2, §19.3): G is the total before rooftop; roof the scenario's block.
  const city = state.city, roof = state.scn.rooftop, totalMW = fleet.baseLoadMW(state);
  return {
    v: state.v, scenarioId: state.scenarioId, tick: state.tick, s, clock: clockOf(state.scn, s),
    over: state.over, black: state.black, mode: state.control.mode,
    modeLocked: state.control.modeLocked || state.tick >= V.PLAYER_START_TICK,
    inWatch: inWatch(state),
    inRespond: cont !== null && state.tick < cont.secureByTick,
    f: {hz: ph.fHz, devHz: ph.fHz - F0, rocofHzS: ph.rocofHzS, ekGWs: ph.ekMWs / V.MW_PER_GW},
    balance: {schedSupplyMW: ph.schedSupplyMW, supplyMW: ph.supplyMW, servedMW: ph.servedMW, loadMW: ph.loadMW,
      imbalanceMW: ph.imbalanceMW, inertiaMW: ph.inertiaMW,
      governorsMW: ph.govTotalMW, batteryPfrMW: b.pfrMW, guardMW: b.ffrMW, loadReliefMW: ph.loadReliefMW, shedMW: ph.shedMW,
      renPfrMW: ph.renPfrMW, roofPfrMW: ph.roofPfrMW},
    demand: {nowMW: env.demandMW, servedMW: ph.servedMW, shedMW: ph.shedMW, heatActive: env.heatActive, tempC: env.tempC,
      underlyingMW: env.underlyingMW, rooftopMW: env.rooftopMW, litMW: fleet.litDemandMW(state),
      unservedMW: totalMW * city.shedFrac, flexMW: env.flexMW},
    units: state.units.map(u => {
      const m = V.MACHINES[u.k];
      const r = {id: u.id, station: u.station, name: m.name, cls: m.cls, mode: u.mode, sync: u.sync, timerS: u.timerS,
        outMW: u.outMW, schedMW: u.schedMW, basePointMW: u.basePointMW, agcTrimMW: u.agcTrimMW, govMW: u.govMW,
        availMW: u.availMW, minMW: m.minMW, ratingMW: m.ratingMW, rampMWMin: m.rampMWs * S_PER_MIN, offer: m.offer,
        startToMinS: m.t1S + V.AUTO_SYNC_S + m.t2S, hotS: u.hotS, starts: u.starts,
        upForS: s - u.upSinceS, downForS: s - u.downSinceS,
        startBlock: fleet.startBlock(state, u.k), stopBlock: fleet.stopBlock(state, u.k),
        slipHz: 0, phaseDeg: 0};
      if (u.mode === 'ready') { const a = grid.syncAt(u, state.tick); r.slipHz = a.slipHz; r.phaseDeg = a.phaseDeg; }
      return r;
    }),
    stations: state.stations.map(st => {
      const r = fleet.stationRange(state, st.id);
      return {id: st.id, name: V.STATIONS[st.id].name, basePointMW: st.basePointMW, onCount: r.onCount,
        minMW: r.minMW, maxMW: r.maxMW, outMW: state.units.reduce((a, u) => a + (u.station === st.id ? u.outMW : 0), 0)};
    }),
    battery: {mode: b.mode, orderMW: b.orderMW, guardMW: b.guardMW, schedMW: b.schedMW, agcTrimMW: b.agcTrimMW,
      pfrMW: b.pfrMW, ffrMW: b.ffrMW, guardFired: b.ffrFiredTick >= 0, outMW: b.outMW, socMWh: b.socMWh,
      capMWh: V.BATT_MWH, ratedMW: V.BATT_MW, fullHold: b.fullHold, ufSuspend: b.ufSuspend},
    tie: {setMW: t.setMW, flowMW: t.flowMW, tripped: t.tripped, lockoutS: t.lockoutS, importLimitMW: V.TIE_MAX_MW,
      exportLimitMW: env.exportLimitMW, neighbourPrice: env.neighbourPrice},
    wind: {availMW: env.windAvailMW, outMW: windOut, limitPct: state.ren.windLimitPct, ofgsTrippedFrac: state.ofgs.trippedFrac,
      autoMW: state.ren.windAutoMW},
    solar: {availMW: env.solarAvailMW, outMW: state.ren.solarMW, limitPct: state.ren.solarLimitPct, autoMW: state.ren.solarAutoMW},
    sky: {clearness: env.clearness, windFrac: env.windFrac},
    hydro: {storageMWh: state.hydro.storageMWh, allocationMWh: V.HYDRO_ALLOCATION_MWH,
      frac: state.hydro.storageMWh / V.HYDRO_ALLOCATION_MWH},
    dr: {callsLeft: state.dr.callsLeft, activeS: state.dr.activeS, mw: state.dr.mw},
    rert: {armed: state.rert.armed, leadS: state.rert.leadS, outMW: state.rert.outMW, standingDown: state.rert.standingDown,
      armedEver: state.rert.armedEver},
    smelter: {loadMW: state.smelter.loadMW, returning: state.smelter.returning},
    sec: pick(state.sec, SEC_KEYS), fos: pick(state.fos, FOS_KEYS), agc: pick(state.agc, AGC_KEYS),
    price: pick(state.price, PRICE_KEYS), score: scoreView(state.score),
    districts: state.city.districts.map((d, i) => ({id: d.id, suburb: d.suburb, share: d.share, uflsStage: d.uflsStage,
      rot: d.rot, dark: d.dark, shedBy: d.shedBy, darkSinceS: d.darkSinceS, restoredAtS: d.restoredAtS,
      coldLoadMW: fleet.districtColdLoadMW(state, i),
      restoreBlock: d.dark ? grid.restorePermissive(state, i) : fleet.DISTRICT_LIT, reconnectS: d.reconnectS})),
    news: state.news.map(n => ({atS: n.atS, kind: n.kind, fromS: n.fromS, toS: n.toS, text: n.text})),
    contingency: cont ? contingencyView(cont) : null,
    contingencies: state.conts.map(c => ({n: c.n, startS: Math.floor(c.startTick / TPS), cause: c.cause, id: c.id,
      lostMW: c.lostMW, watchEndS: Math.floor(c.watchEndTick / TPS),
      backInBandS: c.backInBandTick < 0 ? -1 : Math.floor(c.backInBandTick / TPS)})),
    forecast: weather.forecast(state, V.FC_HORIZON_S, V.FC_STEP_S),
    dayAhead: opts && opts.dayAhead ? weather.forecast(state, DAY_S - s, V.FC_STEP_S) : null,
    plan: planView(state.plan),
    scope: {unit: state.scope.unit, open: state.scope.unit !== ''},
    // Phase 2a (desk/README.md §19.3). rooftop: availMW as if every inverter were connected, offMW
    // off with dark or reconnecting districts, mw generating now, capMW nameplate; one row per
    // suburb in scn.city.suburbs order, also at capacity 0.
    rooftop: {mw: env.rooftopMW - city.roofOffMW - ph.roofPfrMW, availMW: env.rooftopMW, capMW: roof.capacityMW,
      offMW: city.roofOffMW,
      suburbs: state.scn.city.suburbs.map((sub, j) => ({id: sub.id, mw: env.roofSubMW[j], capMW: roof.capacityMW * roof.share[j],
        clearness: env.roofClearFrac[j]}))},
    msl: pick(state.msl, MSL_KEYS),
    day: {temp: state.day.temp, weekend: state.day.weekend},
    levers: leversView(state),
  };
}

// observe().levers (README §8)
function leversView(state) {
  const L = state.levers, sl = state.scn.levers;
  return {rev: L.rev, offered: sl ? sl.menu[state.day.temp].slice() : [],
    suburbs: sl ? sl.suburbs.map((x, j) => ({id: x.id, patience: L.patience[j],
      soak: grid.leverView(state, j, 'soak'), aircon: grid.leverView(state, j, 'aircon')})) : [],
    blocks: L.blocks.map(b => ({suburb: b.suburb, lever: b.lever, atS: b.atS, endS: b.endS, effMW: b.effMW, cost: b.cost,
      del: grid.flexDelBlock(state, b), parts: weather.flexParts(b, b.effMW)}))};
}

// ------------------------------------------------------------------ hashState (F-2)

const W = Uint32Array.BYTES_PER_ELEMENT;
const dv = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));
const FNV_PRIME = V.RNG_FNV_PRIME, AVALANCHE_S = V.RNG_FMIX_S1;
let hacc = 0;
// FNV-style word mixing plus an xor-shift per word (review fix): multiplying by an odd prime
// only carries a difference upward, so without the shift a difference confined to the high
// bits (a sign flip is bit 31 of a double's high word) never reached the low bits and any two
// sign flips cancelled (100% of pairs of createState(1)'s nonzero leaves collided).
const mixWord = w => { const h = Math.imul(hacc ^ (w >>> 0), FNV_PRIME); hacc = (h ^ (h >>> AVALANCHE_S)) >>> 0; };
function fnv(str) {
  let h = V.RNG_FNV_OFFSET;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), V.RNG_FNV_PRIME) >>> 0;
  return h;
}
// Type tags, so 0, false, null, '' and [] all hash differently.
const TAG = {};
for (const name of ['null', 'false', 'true', 'number', 'string', 'array', 'object']) TAG[name] = fnv('tag:' + name);

function mixValue(x, key) {
  if (x === null) { mixWord(TAG.null); return; }
  switch (typeof x) {
    case 'boolean': mixWord(x ? TAG.true : TAG.false); return;
    case 'number':
      if (!Number.isFinite(x)) throw new Error('hashState: non-finite number at ' + key + ' (state must be plain JSON)');
      mixWord(TAG.number);
      dv.setFloat64(0, x === 0 ? 0 : x, true); // -0 folds to 0 (JSON drops the sign)
      mixWord(dv.getUint32(0, true)); mixWord(dv.getUint32(W, true));
      return;
    case 'string': mixWord(TAG.string); mixWord(x.length); mixWord(fnv(x)); return;
    case 'object':
      if (Array.isArray(x)) {
        mixWord(TAG.array); mixWord(x.length);
        for (let i = 0; i < x.length; i++) mixValue(x[i], key);
        return;
      }
      mixObject(x, null);
      return;
    default: throw new Error('hashState: ' + typeof x + ' at ' + key + ' (state must be plain JSON)');
  }
}

// Keys in sorted (UTF-16 code unit) order, so key insertion order never matters.
function mixObject(o, skip) {
  const keys = Object.keys(o).sort();
  mixWord(TAG.object); mixWord(keys.length);
  for (const k of keys) {
    if (skip !== null && skip.has(k)) continue;
    mixWord(fnv(k));
    mixValue(o[k], k);
  }
}

/** u32 hash of any plain JSON value in canonical form (sorted keys, exact float bits). */
export function canonicalHash(x) {
  hacc = V.RNG_FNV_OFFSET;
  mixValue(x, '(root)');
  return hash32(hacc, 0, 0);
}

const HASH_SKIP = new Set(['scn', 'ext']);

// JSON.stringify replacer for hashState's copy: leaves scn and ext out of the copy and throws
// on what JSON would silently change (NaN and Infinity become null, undefined disappears).
function jsonOnly(key, value) {
  if (this !== null && this.scnHash !== undefined && HASH_SKIP.has(key)) return undefined; // state's own scn / ext
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new Error('hashState: non-finite number at ' + key + ' (state must be plain JSON)');
      return value;
    case 'string': case 'boolean': case 'object': return value;
    default: throw new Error('hashState: ' + typeof value + ' at ' + key + ' (state must be plain JSON)');
  }
}

/**
 * 32-bit fingerprint of EVERY field of state except scn and ext (README §9): a
 * type-tagged walk with sorted keys, array lengths and exact IEEE bits (-0 folded to 0).
 * scn and ext are functions of (seed, scenario, SIM_VERSION), all of which are hashed:
 * seed and v directly, the scenario via state.scnHash (tuning a scenario without bumping
 * SIM_VERSION still changes the hash). Throws on a non-JSON value (NaN, Infinity,
 * undefined, a function). Costs ~0.3-0.5 ms: call it per grid-hour, never per tick.
 *
 * It walks a JSON copy, never the live objects (review fix, README §10): a JS walk that
 * reads the live state's numeric leaves through generic keyed loads made every later
 * physics.tick allocate ~130-180 B (0 B without it), about 25-40% of a par day. A JSON
 * round trip is exact for plain-JSON state (README §2 rule 4), so walking the copy gives the
 * hash walking the state itself would give.
 */
export function hashState(state) {
  const copy = JSON.parse(JSON.stringify(state, jsonOnly));
  hacc = V.RNG_FNV_OFFSET;
  mixObject(copy, HASH_SKIP);
  return hash32(hacc, 0, 0);
}

// ------------------------------------------------------------------ replay (F-6)

/**
 * Re-run a day from its seed, scenario and input log ({tick, type, args} records, sorted
 * by tick). Stops at opts.untilTick (default: end of day) or when the day is over.
 * Throws if the log diverges: a record refused on replay, or records the replayed day
 * never reached before it ended (both mean the log belongs to another seed, scenario or
 * SIM_VERSION). Records at or after untilTick are simply not replayed.
 * @returns {object} the final state (its own log equals the replayed records)
 */
export function replay(seed, scenario, log, opts = {}) {
  const state = createState(seed, scenario);
  const until = opts.untilTick === undefined ? DAY_TICKS : opts.untilTick;
  const batch = [];
  let j = 0;
  while (!state.over && state.tick < until) {
    batch.length = 0;
    while (j < log.length && log[j].tick <= state.tick) {
      if (log[j].tick < state.tick) throw new Error('replay: log is not sorted by tick at record ' + j);
      batch.push(Object.assign({type: log[j].type}, log[j].args));
      j++;
    }
    const before = state.log.length, tick = state.tick;
    step(state, batch);
    if (state.log.length - before !== batch.length) {
      throw new Error('replay: a record at tick ' + tick + ' was refused; the log does not match this seed, scenario and ' + SIM_VERSION);
    }
  }
  if (j < log.length && log[j].tick < until) {
    throw new Error('replay: ' + (log.length - j) + ' record(s) from tick ' + log[j].tick + ' never reached; the day ended at tick ' + state.tick);
  }
  return state;
}

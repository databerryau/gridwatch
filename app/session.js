// app/session.js: one bench session, DOM-free: the sim state, the director, the loop's
// pacer, the recorder and the assist, and the only places that step the sim.
//
// boot.js wires it to the page; tests/loop.test.js drives it headless with fake frame
// times. Everything the page does to the sim goes through here:
//   * frame(sess, dtS)   one animation frame of play (loop.runFrame + director.rateOf);
//   * sendInput(sess, x) a desk input, applied at once between two ticks through
//                        step.applyInput: exactly what step(state, [x]) would do at this tick,
//                        so the log replays (F-6). Never called inside step();
//   * requestDebugTrip   DEBUG ONLY: trips the largest online machine at the next grid second
//                        (the bench's "watch H-8" button). It pokes state through fleet.tripUnit,
//                        outside the input log, so the session no longer replays (flagged).

import {V} from '../sim/params.js';
import {createState, step, observe, applyInput, hashState, SIM_VERSION} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {restorePermissive} from '../sim/grid.js';
import {createPacer, runFrame} from './loop.js';
import {createDirector, rateOf, rateOfLastTick} from './director.js';
import {createRecorder, onTick, commitMinute, startTrace} from './record.js';
import {createAssist, assistInputs, replanNow} from './assist.js';

const TPS = V.TICKS_PER_S;
/** Bench records kept for the event log (newest last). */
export const MAX_RECORDS = 400;

/**
 * @param {{seed:number, scenario:object, assist?:'off'|'plan'|'par', speed?:number, paused?:boolean,
 *   cap?:number, budgetMs?:number}} o
 */
export function createSession(o) {
  const state = createState(o.seed, o.scenario);
  const sess = {
    seed: state.seed, scenario: o.scenario, state,
    director: createDirector({speed: o.speed, paused: o.paused}),
    pacer: createPacer({cap: o.cap, budgetMs: o.budgetMs}),
    rec: createRecorder(),
    assist: createAssist(o.assist || 'off'),
    records: [],          // bench event log: step() records plus refusals and bench notes
    recordSeq: 0,         // total records ever pushed (the page appends only new ones)
    pendingTrip: false, poked: false,
    hashes: [],           // hashState at every grid hour (F-2), for the end-of-day line
    restoreCache: null,   // {s, by}: restoreChecks() for grid second s
  };
  return sess;
}

function pushRecords(sess, recs) {
  for (const r of recs) {
    sess.records.push(r);
    sess.recordSeq++;
  }
  if (sess.records.length > MAX_RECORDS) sess.records.splice(0, sess.records.length - MAX_RECORDS);
}

/** A bench line in the event log (not a sim record; bench: true). */
export function note(sess, sev, code, msg) {
  pushRecords(sess, [{tick: sess.state.tick, kind: 'log', sev, code, msg, bench: true}]);
}

// The largest online machine by output (ties to the lower index): the pre-rolled
// 'largest' trip's rule (README §4, events.applyDue).
function largestUnit(state) {
  let best = -1;
  for (let i = 0; i < state.units.length; i++) {
    const u = state.units[i];
    if (u.sync && (best < 0 || u.outMW > state.units[best].outMW)) best = i;
  }
  return best;
}

function debugTrip(sess) {
  sess.pendingTrip = false;
  const state = sess.state, i = largestUnit(state);
  if (i < 0) { note(sess, 'warn', 'DEBUG_TRIP', 'DEBUG: no machine online to trip.'); return; }
  const out = [];
  // Lockout: the protection lockout the sim uses for an overheat trip (legacy 90-150 min).
  fleet.tripUnit(state, i, 'DEBUG: tripped from the bench', V.HOT_TRIP_LOCKOUT_S, out);
  sess.poked = true;
  note(sess, 'warn', 'DEBUG_TRIP', 'DEBUG: tripped ' + state.units[i].id + ' from the bench. This session\'s log no longer replays.');
  afterRecords(sess, out);
}

function afterRecords(sess, recs) {
  for (const r of recs) if (r.kind === 'contingency') startTrace(sess.rec, sess.state);
  pushRecords(sess, recs);
}

/** Run exactly one tick (the loop's tick callback). */
export function tickOnce(sess) {
  const state = sess.state;
  if (state.over) return;
  if (sess.pendingTrip && state.tick % TPS === 0) debugTrip(sess);
  const inputs = assistInputs(sess.assist, state);
  if (sess.assist.error) { note(sess, 'crit', 'ASSIST', sess.assist.error); sess.assist.error = ''; }
  const recs = step(state, inputs);
  if (recs.length) {
    // The assist's own refusals are expected (a plan keyframe the sim clamps or refuses is
    // simply dropped, as in runPar): tag them so the log can show them quietly.
    if (inputs.length) for (const r of recs) if (r.kind === 'input') r.by = 'assist';
    afterRecords(sess, recs);
  }
  if (onTick(sess.rec, state)) commitMinute(sess.rec, observe(state));
  if (state.tick % (TPS * V.S_PER_H) === 0) sess.hashes.push(hashState(state));
}

/**
 * One animation frame (F-5). `now` is a ms clock for the frame budget (omit for none).
 * @returns {number} ticks run
 */
export function frame(sess, dtS, now) {
  const d = sess.director, state = sess.state;
  return runFrame(sess.pacer, dtS, {
    rate: () => rateOf(d, state),
    rateLast: () => rateOfLastTick(d, state),
    tick: () => tickOnce(sess),
    done: () => state.over,
    now,
  });
}

/** A desk input, applied now (between ticks). Refusals go to the event log. */
export function sendInput(sess, input) {
  const out = [];
  const r = applyInput(sess.state, input, out);
  if (out.length) afterRecords(sess, out);
  return r;
}

/** DEBUG: trip the largest online machine at the start of the next grid second. */
export function requestDebugTrip(sess) {
  if (sess.state.over) return false;
  sess.pendingTrip = true;
  return true;
}

/**
 * RE-PLAN (ASSIST PLAN): re-dispatch the plan from now to 04:00 over the units the sim has now,
 * as par does after each of its actions (SPEC S-4, §8.2). Notes the outcome in the event log.
 */
export function replan(sess) {
  const why = replanNow(sess.assist, sess.state);
  if (why === '') note(sess, 'info', 'REPLAN', 'RE-PLAN: the plan is re-dispatched from now to 04:00 over the units you have now.');
  else note(sess, 'warn', 'REPLAN', 'RE-PLAN: ' + why + '.');
  return why;
}

/**
 * K-13 on the bench: for each dark district whose lamp is lit (observe()'s restoreBlock is
 * ''), the answer of the RESTORE PREVIEW the restore input would run (grid.restorePermissive
 * with {preview: true}: '' or the refusal), so the RESTORE button is enabled only when the
 * input would be accepted (review fix: the lamp alone let the button offer restores the input
 * then refused). The preview restores state exactly (pure); cached per grid second.
 * @param {object} sess
 * @param {object} obs observe(sess.state)
 * @returns {Object<string, string>} district id -> '' or why the restore would be refused
 */
export function restoreChecks(sess, obs) {
  const s = Math.floor(sess.state.tick / TPS);
  if (sess.restoreCache !== null && sess.restoreCache.s === s) return sess.restoreCache.by;
  const by = {};
  for (let d = 0; d < obs.districts.length; d++) {
    const x = obs.districts[d];
    if (x.dark && x.restoreBlock === '' && !sess.state.over) by[x.id] = restorePermissive(sess.state, d, {preview: true});
  }
  sess.restoreCache = {s, by};
  return by;
}

/** Change the assist (a fresh autopilot memory: a plan made from now on). */
export function setAssist(sess, kind) {
  sess.assist = createAssist(kind);
}

/**
 * Run headless (no frames) until `tick` or the day's end, e.g. the 04:00-04:30 briefing
 * the app runs before the desk opens (README §3). Every tick is recorded as in play.
 */
export function runTo(sess, tick) {
  const state = sess.state;
  while (!state.over && state.tick < tick) tickOnce(sess);
}

/** The session's replay file (F-6): seed + SIM_VERSION + scenario id + input log. */
export function sessionLog(sess) {
  return {v: SIM_VERSION, seed: sess.seed, scenarioId: sess.state.scenarioId, poked: sess.poked,
    log: sess.state.log.map(r => ({tick: r.tick, type: r.type, args: Object.assign({}, r.args)}))};
}

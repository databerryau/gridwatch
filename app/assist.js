// app/assist.js: the bench's ASSIST selector. It lets par's code drive the levers so the
// owner can watch a whole day and take over at any time (Exit Phase 0: "next.html plays a
// whole day through the bench").
//
//   OFF   every input is yours.
//   PLAN  the L-0 pre-dispatch plan (autopilot.preDispatch, made once from the day-ahead
//         forecast) issues its starts, stops, base points and tie setpoints when due: the
//         'planOnly' proxy. Your own inputs still land; the plan does not know about them
//         until you press RE-PLAN (replanNow): the re-dispatch par makes after each of its
//         actions, from now to 04:00 over the commitment you now have (SPEC S-4, §8.2).
//   PAR   the plan plus par's S-4 rules at par's pace (the 'par' proxy).
//
// It runs the same harness steps as autopilot.runPar, so a bench day with PAR and no
// other input is par's day: decisions on the first tick of a grid second (tick % 50 === 1)
// after 04:30, every PAR_DECIDE_EVERY_S and at the first second after each watch, reading
// observe() only (S-4). The cadence (nextS, afterWatch) lives in the autopilot memo, as in
// runPar, so a JSON copy of the assist resumes the same day. Its inputs go through step() like a player's and land in the log,
// so replay() reproduces the session (F-6).
//
// DOM-free. If the autopilot throws (it is being tuned), the assist switches itself OFF
// and reports the error instead of stopping the bench.

import {V} from '../sim/params.js';
import {observe, inWatch} from '../sim/step.js';
import * as AP from '../sim/autopilot.js';

const TPS = V.TICKS_PER_S, START_TICK = V.PLAYER_START_TICK, EVERY_S = V.PAR_DECIDE_EVERY_S;
const EMPTY = Object.freeze([]);
const DAY_AHEAD = Object.freeze({dayAhead: true});

export const ASSIST_KINDS = Object.freeze(['off', 'plan', 'par']);
const PROXY = {plan: 'planOnly', par: 'par'};

/**
 * @param {'off'|'plan'|'par'} kind
 * @returns {object} assist state (plain object)
 */
export function createAssist(kind) {
  if (!ASSIST_KINDS.includes(kind)) throw new Error('createAssist: unknown kind ' + kind);
  return {kind, memo: kind === 'off' ? null : AP.createAutopilot({proxy: PROXY[kind]}), error: '', issued: 0, lastOrigin: ''};
}

/**
 * Inputs the assist wants applied before this tick's step (usually none). Call once per
 * tick, before step(state, inputs), never inside it.
 * @param {object} a from createAssist
 * @param {object} state
 * @returns {ReadonlyArray<object>}
 */
export function assistInputs(a, state) {
  const t = state.tick;
  if (a.kind === 'off' || state.over || t % TPS !== 1 || t <= START_TICK) return EMPTY;
  const memo = a.memo;
  if (inWatch(state)) { memo.afterWatch = true; return EMPTY; }
  const s = (t - 1) / TPS;
  if (!memo.afterWatch && s < memo.nextS) return EMPTY;
  memo.afterWatch = false;
  memo.nextS = s + EVERY_S;
  try {
    const obs = observe(state, memo.plan === null ? DAY_AHEAD : undefined);
    if (memo.plan === null) {
      // As runPar's makePlan: the plan once, from the day-ahead forecast. 'par' drops the
      // plan's stops (it decommits by rule 4 only); decide() makes its plan itself.
      if (a.kind === 'plan') { memo.plan = AP.preDispatch(obs); memo.planNext = 0; }
    }
    const out = [];
    if (a.kind === 'par') {
      const d = AP.decide(obs, memo);
      for (const x of d) out.push(x);
      if (d.length) a.lastOrigin = memo.lastOrigin;
    }
    for (const x of AP.planInputs(obs, memo)) out.push(x);
    a.issued += out.length;
    return out.length ? out : EMPTY;
  } catch (e) {
    a.error = 'assist ' + a.kind + ' stopped: ' + (e && e.message ? e.message : String(e));
    a.kind = 'off';
    a.memo = null;
    return EMPTY;
  }
}

/**
 * RE-PLAN (ASSIST PLAN only): re-dispatch the plan from now to 04:00 over the commitment the
 * sim now has, as par does after each of its actions (autopilot.replan). Its keyframes are
 * issued as they fall due, like the plan's. Returns '' or why nothing happened.
 * @param {object} a from createAssist
 * @param {object} state
 * @returns {string}
 */
export function replanNow(a, state) {
  if (a.kind !== 'plan' || !a.memo) return 'RE-PLAN needs ASSIST PLAN';
  if (inWatch(state)) return 'not during the watch';
  try {
    return AP.replan(observe(state), a.memo) ? '' : 'the plan is made at 04:30';
  } catch (e) {
    return 'RE-PLAN failed: ' + (e && e.message ? e.message : String(e));
  }
}

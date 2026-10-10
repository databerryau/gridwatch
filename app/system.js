// app/system.js: the game's system operator (desk/README.md §3.4; SPEC L-0, A-1). DOM-free.
//
// The player is the control-room operator; this is the market and dispatch system around them,
// which in the NEM runs whether anyone touches the desk or not:
//   * 04:30 PRE-DISPATCH (L-0): the merit-order plan for the P50 forecast (autopilot.preDispatch,
//     made once from the day-ahead forecast), loaded into the sim's plan as a planLoad input, stops
//     included. The stack never starts empty; the levers follow it (K-2, L-6).
//   * RE-FLOW FOR THE LIT LOAD (L-0): while districts are dark, dispatch targets metered demand:
//     the plan is re-dispatched for the lit load whenever the dark share moves, and every
//     PLAN_REFLOW_S while any district stays dark (AEMO's pre-dispatch cadence), so a day with no
//     input is never black. The periodic re-flow waits while the player owns the plan: once they
//     have edited it (a lever or tie move, a plan edit) since the system's last planLoad, their
//     edits win until they press RE-DISPATCH (which hands it back) or the dark share moves again.
//   * RE-DISPATCH (A-1): redispatch() re-runs the pre-dispatch from now to 04:00 over the
//     commitment the player has now (par's amend: units on and coming, the booked starts and
//     stops kept), and every lever glides to the new plan.
//
// Two modes (createSystem({commit})):
//   'system'  the Phase 1a behaviour above: the 04:30 plan commits units too (its booked STARTs
//             and STOPs). The bench and the planOnly proxy use it.
//   'player'  the game (SPEC §9.1 Q-18): COMMITMENT IS THE PLAYER'S. The system never books a
//             start or a stop. At 04:30 it dispatches only what is running; from then it
//             re-dispatches the committed units (the same planLoad RE-DISPATCH sends) whenever the
//             commitment changes (a start, a stop, a booking, a unit synchronised or tripped; from
//             Phase 2a also the battery's order or GUARD, from 2b a city lever booked or
//             cancelled (obs.levers.rev): commitSig) and
//             every DISPATCH_S (5 grid-minutes, as NEMDE does) for the newer forecast. Which units run, and when, is the
//             player's plan; a day with no input runs short. A lever, tie or plan-key edit by hand
//             still takes the levers over until RE-DISPATCH.
//             The belly (Phase 2a, desk/README.md §21.3): the dispatch is for the lit operational
//             demand against the wind and solar AVAILABLE; in a surplus it takes every unit to its
//             floor and the tie to the export limit, and the sim's own cut spills the rest (C-6). A
//             battery order counts for the energy behind it (autopilot batteryOrder).
// Everything it does is a sim input (planLoad), logged, so replay() reproduces a game day (F-6).
// It runs on the autopilot's 'planOnly' memory and runPar's cadence: a game day with no player
// input is the planOnly proxy's day, hash for hash (tests/system.test.js).

import {V} from '../sim/params.js';
import {observe, inWatch} from '../sim/step.js';
import * as AP from '../sim/autopilot.js';

const TPS = V.TICKS_PER_S, START_TICK = V.PLAYER_START_TICK, EVERY_S = V.PAR_DECIDE_EVERY_S;
const EMPTY = Object.freeze([]);
const DAY_AHEAD = Object.freeze({dayAhead: true});
/** Input types by which the player takes the plan over (the periodic re-flow then waits). */
const EDITS = new Set(['basePoint', 'tie', 'planKey', 'planDel', 'planStart', 'planStop', 'planUnbook', 'planRejoin', 'planLoad']);
/** 'player' mode: hand edits of the levers take them over; commitment inputs are the plan itself. */
const HAND_EDITS = new Set(['basePoint', 'tie', 'planKey', 'planDel', 'planRejoin']);
/** 'player' mode: the dispatch of committed units refreshes this often (NEMDE's 5-minute dispatch). */
export const DISPATCH_S = 300;

/**
 * A fresh system operator (plain JSON: a JSON copy resumes it, like the autopilot memo).
 * @returns {{memo:object, loadTick:number, logIdx:number, edited:boolean, loads:number}}
 */
export function createSystem(opts) {
  return {memo: AP.createAutopilot({proxy: 'planOnly'}), loadTick: -1, logIdx: 0, edited: false, loads: 0,
    commit: opts && opts.commit === 'player' ? 'player' : 'system', sig: '', dispatchS: -1};
}

// 'player' mode: what the dispatch is made over. It changes when a unit starts, synchronises,
// stops or trips, a start or stop is booked or unbooked, the dark share of the city moves, or
// (Phase 2a, desk/README.md §21.3) the battery's order or GUARD changes: the battery is the
// player's, and an order the dispatch has not seen is a shortfall or a surplus on the stack until
// the next 5-minute dispatch (the review measured "Short 400 MW ... call DR" for two grid-minutes
// after a CHARGE 350). FULL-HOLD is in it too: a charge order paused on a full battery is no
// longer a load. The dispatch counts the order for the energy behind it (autopilot batteryOrder).
// From 2b also a city lever booked or cancelled (obs.levers.rev): flex is demand the plan carries.
export function commitSig(obs) {
  let s = '';
  for (const u of obs.units) s += u.mode === 'on' || u.mode === 'loading' ? '1' : u.mode === 'off' || u.mode === 'tripped' ? '0' : '2';
  for (const e of obs.plan.starts) s += '+' + e.unit + e.atS;
  for (const e of obs.plan.stops) s += '-' + e.unit + e.atS;
  let dark = 0;
  for (const d of obs.districts) if (d.dark) dark++;
  const b = obs.battery;
  return s + '|' + dark + (obs.tie.tripped ? 'T' : '') + '|' + b.mode + b.orderMW + (b.fullHold ? 'F' : '') + 'g' + b.guardMW + 'L' + obs.levers.rev;
}

function playerInputs(sys, state, s) {
  const memo = sys.memo;
  const first = memo.plan === null;
  const obs = observe(state, first ? DAY_AHEAD : undefined);
  if (first) {
    // The day-ahead columns the dispatch falls back on beyond the 4.5-h forecast. Its own
    // commitment (P.load's starts and stops) is never sent: that is the player's to make.
    const P = AP.preDispatch(obs);
    delete P.load;
    memo.plan = P;
  }
  const sig = commitSig(obs);
  if (!first && (sys.edited || (sig === sys.sig && s - sys.dispatchS < DISPATCH_S))) return EMPTY;
  const input = AP.replan(obs, memo);
  if (!input) return EMPTY;
  sys.sig = sig; sys.dispatchS = s;
  loaded(sys, state, 1);
  return [input];
}

// Has the player edited the plan since the system's last planLoad (at loadTick)? Scans the new
// log records once each.
function scanEdits(sys, state) {
  const log = state.log;
  for (let i = sys.logIdx; i < log.length; i++) {
    const r = log[i];
    if (!(sys.commit === 'player' ? HAND_EDITS : EDITS).has(r.type) || r.tick < sys.loadTick) continue;
    if (r.type === 'planLoad' && r.tick === sys.loadTick) continue; // the system's own
    sys.edited = true;
  }
  sys.logIdx = log.length;
}

/**
 * Are the levers held by hand right now? The same scan as the system's own, made at once: the
 * system looks only every PAR_DECIDE_EVERY_S (and not at all while the clock is held), so a lever
 * or plan key moved a moment ago would otherwise not count yet, and the re-dispatch that follows a
 * START or a battery order (app/game.js) would load the system's plan over it. Scanning early
 * changes nothing else: every path that clears `edited` (loaded) scans first.
 * @param {object} sys from createSystem
 * @param {object} state
 * @returns {boolean} sys.edited, fresh
 */
export function heldByHand(sys, state) {
  scanEdits(sys, state);
  return sys.edited;
}

function loaded(sys, state, n) {
  if (n === 0) return;
  sys.loadTick = state.tick;
  sys.edited = false;
  sys.loads += n;
}

/**
 * The system's inputs for this tick (usually none): at the first tick of a grid second
 * (tick % 50 === 1) after 04:30, every PAR_DECIDE_EVERY_S and at the first second after each
 * watch, the 04:30 pre-dispatch planLoad and the lit-load re-flows (see the file header). Call
 * once per tick before step(state, inputs), never inside it; apply what it returns (through
 * step or applyInput) at this tick.
 * @param {object} sys from createSystem
 * @param {object} state
 * @returns {ReadonlyArray<object>}
 */
export function systemInputs(sys, state) {
  const t = state.tick;
  if (state.over || t % TPS !== 1 || t <= START_TICK) return EMPTY;
  const memo = sys.memo;
  if (inWatch(state)) { memo.afterWatch = true; return EMPTY; }
  const s = (t - 1) / TPS;
  if (!memo.afterWatch && s < memo.nextS) return EMPTY;
  memo.afterWatch = false;
  memo.nextS = s + EVERY_S;
  scanEdits(sys, state);
  if (sys.commit === 'player') return playerInputs(sys, state, s);
  const obs = observe(state, memo.plan === null ? DAY_AHEAD : undefined);
  const out = AP.planUpdates(obs, memo, null, {periodic: !sys.edited});
  loaded(sys, state, out.length);
  return out.length ? out : EMPTY;
}

/**
 * RE-DISPATCH (A-1): the planLoad that re-runs the pre-dispatch from now to 04:00 over the
 * commitment the player has now, or the reason it is refused. The caller applies the input
 * (actions.input); from then the plan is the system's again (the periodic re-flow resumes).
 * @param {object} sys from createSystem
 * @param {object} state
 * @returns {{input:object|null, reason:string}}
 */
export function redispatch(sys, state) {
  if (state.over) return {input: null, reason: 'the day is over'};
  if (inWatch(state)) return {input: null, reason: 'not during the watch'};
  if (sys.memo.plan === null || state.tick < START_TICK) return {input: null, reason: 'no plan before 04:30'};
  const input = AP.replan(observe(state), sys.memo);
  if (!input) return {input: null, reason: 'no plan before 04:30'};
  scanEdits(sys, state);
  loaded(sys, state, 1);
  if (sys.commit === 'player') { sys.sig = ''; sys.dispatchS = Math.floor(state.tick / TPS); }
  return {input, reason: ''};
}

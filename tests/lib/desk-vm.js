// tests/lib/desk-vm.js: view models from a REAL day on the game's scenarios (DESK,
// DESK_WEEKEND), for the Phase 2a UI tests (desk/README.md §19.5). tests/lib/vm-fixture.js builds
// its fixtures from CLASSIC, which has no rooftop PV, no mild days and no spill; this one runs
// the hint-following player (tests/lib/follow.js) on the day the game plays.
//
//   const {vm, obs, state} = deskDayVm({seed: 1, untilH: 12.5});              // a MILD weekday at 12:30
//   const w = deskDayVm({seed: 5, untilH: 12.5, scenario: DESK_WEEKEND});     // a mild weekend noon
//
// Day types by seed (desk/README.md C-2): MILD 1, 5, 8, 13; HOT 2, 3, 7, 11; HEATWAVE 4.

import {observe} from '../../sim/step.js';
import {DESK} from '../../content/scenarios.js';
import * as PV from '../../app/planview.js';
import {objective} from '../../app/objective.js';
import {baseVm} from './vm-fixture.js';
import {followDay} from './follow.js';

/**
 * @param {{seed?:number, untilH?:number, scenario?:object, follow?:boolean}} [o] follow: false
 *   gives the no-input day (more surplus at noon, a shortfall in the evening).
 * @returns {{state:object, obs:object, vm:object, said:Array}} vm carries the objective line
 *   as the game would show it (vm.objective) and vm.consider null.
 */
export function deskDayVm(o = {}) {
  const {st, sys, said} = followDay(o.seed ?? 1, o.scenario || DESK, {untilH: o.untilH ?? 12.5, follow: o.follow});
  const obs = observe(st, {dayAhead: true});
  let line = null;
  try { line = objective(obs, {edited: sys.edited, planview: PV, dayAhead: obs.dayAhead}); } catch { line = null; }
  const vm = baseVm(observe(st), {objective: line, consider: null, commit: 'player', phase: 'play'});
  return {state: st, obs: vm.obs, vm, said};
}

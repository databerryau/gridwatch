// tests/lib/follow.js: the hint-following player (SPEC §9.1 Q-18; desk/README.md §19.5).
//
// A day in 'player' mode in which the only inputs are the ones the standing objective
// (app/objective.js) proposes: once a grid minute it reads the line and, if the line carries an
// action, applies it. The game never sends these actions; this player does, to prove that
// someone who does only what the line says gets through the day, and to measure what the line's
// advice is worth. tests/objective.test.js and tools/follow.mjs both use it, so they measure
// the same player.
//
// Like the game (app/game.js sendInput), an accepted commitment or battery input is followed
// at once by a re-dispatch while the levers are not held by hand, so the next line is read off
// a plan that already knows about it.

import {createState, step, observe, applyInput} from '../../sim/step.js';
import {V} from '../../sim/params.js';
import * as SYS from '../../app/system.js';
import * as PV from '../../app/planview.js';
import {objective as standingObjective} from '../../app/objective.js';

const TPS = V.TICKS_PER_S;
const tickAt = h => Math.round((h - V.DAY_START_H) * V.S_PER_H * TPS);
/** Inputs after which the game re-dispatches in the same call. */
export const REDISPATCH_AFTER = new Set(['start', 'stop', 'abortStop', 'battery', 'guard']);

/**
 * @param {number} seed
 * @param {object} scenario e.g. DESK or DESK_WEEKEND
 * @param {{follow?:boolean, untilH?:number, objective?:function, onMinute?:function(object, object):void}} [o]
 *   follow: false = a day with no input at all; untilH: stop at this hour of the unwrapped day
 *   (4..28); objective: a replacement for app/objective.js's (e.g. with a branch switched off);
 *   onMinute(state, obs): called once a grid minute before the line is read (measurements).
 * @returns {{st:object, sys:object, said:Array<{s:number, kind:string, level:string, text:string, action:object, accepted:boolean}>, score:object}}
 */
export function followDay(seed, scenario, o = {}) {
  const follow = o.follow !== false, line = o.objective || standingObjective;
  const st = createState(seed, scenario), sys = SYS.createSystem({commit: 'player'});
  const said = [];
  const end = o.untilH === undefined ? Infinity : tickAt(o.untilH);
  const redispatch = () => { const r = SYS.redispatch(sys, st); if (r && r.input) applyInput(st, r.input, []); };
  while (!st.over && st.tick < end) {
    // (a day with no input and no hook reads nothing: observe() is pure, so the day is the same)
    if ((follow || o.onMinute) && st.tick > V.PLAYER_START_TICK && st.tick % (V.S_PER_MIN * TPS) === 2) {
      const obs = observe(st, {dayAhead: true});
      if (o.onMinute) o.onMinute(st, obs);
      if (follow && !obs.inWatch) {
        // (held by hand as the game reads it: app/system.js heldByHand, a fresh scan of the log)
        const x = line(obs, {edited: SYS.heldByHand(sys, st), planview: PV, dayAhead: obs.dayAhead});
        if (x && x.action) {
          let accepted = true;
          if (x.action.redispatch) redispatch();
          else {
            accepted = applyInput(st, x.action, []).ok;
            if (accepted && REDISPATCH_AFTER.has(x.action.type) && !SYS.heldByHand(sys, st)) redispatch();
          }
          said.push({s: obs.s, kind: x.kind, level: x.level, text: x.text, action: x.action, accepted});
        }
      }
    }
    step(st, SYS.systemInputs(sys, st));
  }
  return {st, sys, said, score: observe(st).score};
}

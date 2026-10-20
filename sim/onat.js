// sim/onat.js: W7 (Q6; decisions/2026-10-16-open-questions.md §6, option B): one answer to "when is this unit on". Pure: it reads
// a unit row (state.units' or an observe() row: mode, timerS, startBlock, downForS, outUntilS), its machine (V.MACHINES) and the
// control mode, never state, so sim/autopilot.js may import it (S-4's barrier: this file imports params.js only;
// tests/sim-lint.test.js). Its readers, which cannot disagree any more (in HAND at 04:30 on the 2026-10-14 daily the line said
// CCGT 2 was 45 minutes from the grid and the Live Stack 49):
//   sim/step.js observe        each unit's startToMinS
//   sim/grid.js                the plan's executor: when a committed or booked unit is on (onAtS)
//   sim/autopilot.js           par, the proxies and the system's dispatch: when a committed unit is on (context, the adequacy
//                              walk), when an off unit could be (the commitment search)
//   app/objective.js           the line: when a unit is on, when a start made now reaches the grid
//   app/planview.js            the Live Stack: the earliest-start lines and ghosts, its projection's sync wait
//   render/livestack.js        the Live Stack's booked START marks
// Four copies keep rules of their own, named where they are: sim/grid.js startFreeAt (the executor knows why a unit is down, from
// state, which no observe() row says), sim/autopilot.js adequacySetup (rule 8's walk counts an off unit only free to start now
// or back from an outage, with no minimum down time: unifying it would move par's day), sim/autopilot.js onFromNow and stopRuns
// (the system's dispatch counts a starting unit as AGC does, the auto-sync wait included, in HAND too: unifying it would move
// every HAND day where the player starts a unit, under the same SIM_VERSION; tests/hand-guard.test.js) and sim/market.js's offer
// stack (P-5: "able to start within 10 min" counts the auto-sync wait for a starting unit in HAND too; unifying it would move
// HAND prices).
//
// What is short ahead stays three checks, each named for what it checks (they differ on purpose: a margin, a loading, the tie):
//   the line's check        app/objective.js capacityGap: the plan's capacity against the forecast plus a margin, from these
//                           on-times: what to ask the player to do
//   the Live Stack's check  app/planview.js project: the plan in state stepped forward as the executor will play it: the red gap
//   par's checks            sim/autopilot.js situation (rule 3's commitment), walk (rule 8's adequacy, rule 1's DR) and eveningHolds (rule 4's
//                           stop): what par does
import {V} from './params.js';

/** The auto-synchroniser's wait from full speed to the breaker: AUTO_SYNC_S in AGC (the default mode); none in HAND, where the player SYNCs (X-43). */
export const syncWaitS = mode => (mode === 'HAND' ? 0 : V.AUTO_SYNC_S);

/** Seconds from a START to minimum load for machine m: T1 to full speed, the auto-synchroniser's wait (AGC only), T2. */
export const startToMinS = (m, mode) => m.t1S + syncWaitS(mode) + m.t2S;

/**
 * Seconds from now until unit u is 'on' at minimum load, or -1 when it is not on its way (off, tripped, unloading, shutdown).
 *   on        0
 *   loading   the T2 slope left (timerS)
 *   ready     at full speed: in AGC what is left of the auto-synchroniser's wait (timerS), unless `scoped` (the unit is on the
 *             player's synchroscope, which the synchroniser waits for, A-4: their close is counted as now); in HAND none (the line
 *             asks for the SYNC now); then T2
 *   starting  T1 left (timerS), the auto-synchroniser's wait (AGC only), T2
 * @param {{mode:string, timerS:number}} u  @param {object} m V.MACHINES row  @param {string} mode 'HAND', else AGC
 * @param {boolean} [scoped] u is on the synchroscope
 */
export function onInS(u, m, mode, scoped = false) {
  switch (u.mode) {
    case 'on': return 0;
    case 'loading': return u.timerS;
    case 'ready': return (mode !== 'HAND' && !scoped ? u.timerS : 0) + m.t2S;
    case 'starting': return u.timerS + syncWaitS(mode) + m.t2S;
    default: return -1;
  }
}

/**
 * The earliest grid second >= s an off or tripped unit (an observe() row) could START, or -1 when it cannot today: a tripped
 * unit after its lockout (timerS); an off unit after its minimum down time when its start is blocked (startBlock; an outage hides
 * a minimum down time, so it is counted under one too, §31.8) and not before its return from an outage (outUntilS, Q-68); never
 * without water ('no water'). Unloading, in shutdown or committed: -1 (it must stop first, or it is coming already: onInS).
 */
export function startFromS(u, m, s) {
  if (u.mode === 'tripped') return Math.max(s + u.timerS, u.outUntilS ?? -1);
  if (u.mode !== 'off') return -1;
  const b = u.startBlock || '';
  if (/water/.test(b)) return -1;
  const wait = b !== '' && u.downForS >= 0 ? Math.max(0, m.minDownS - u.downForS) : 0;
  return Math.max(s + wait, u.outUntilS ?? -1);
}

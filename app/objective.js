// app/objective.js: the desk's standing objective (SPEC §9.1 Q-18; Phase 2a: desk/README.md
// C-10, §21.4). Pure and DOM-free.
//
// In the game the commitment is the player's: which units run, and when. The dispatch of the
// units they have committed is automatic (app/system.js). This module reads what the player
// can (observe() and the plan view) and says, in one line, what the desk needs next: nothing;
// a unit to start, by when, and how long it takes; a unit to stop, what that saves and when to
// bring it back; the battery to charge or discharge; the levers handed back; a feeder to close.
// It never acts. Every decision it names has a lead time, and it says by when.
//
// The look-ahead is a CAPACITY check, not the plan's own red columns: for each forecast column,
// what the committed fleet could give (machines on, starting or booked by then, at the plan's
// loading; hydro for the water it has; the tie; the wind and sun forecast) against the forecast
// demand plus a margin. The plan's red columns move with every 5-minute dispatch; whether
// enough plant is committed does not. Three margins (MW above the P50 forecast):
//   MARGIN_MW         the forecast's own error: under it the desk is short of a safe margin
//   COMMIT_MARGIN_MW  what the evening needs to ride through one trip: under it a unit is asked for
//                     (the trip's part counts the water at any hour: a trip is what the gorge is kept for)
//   MARGIN_MW + the largest single loss   what must remain before a unit may be stopped, with the
//                     water held until 15:30 as for any plan (§21.4 STOP condition 1)
// so a unit the line asked for is never one it then asks to stop. What the desk can really give
// (every unit at its limits from where it is, the water, the tie at its limit; capacityGap real)
// says whether it is short NOW.
//
//   objective(obs, {edited, planview, proj?, dayAhead?, leadS?, held?}) -> {level, kind, text, targets, action, startBy, short, long} | null
//     (null from obs.nightShift: the night roll has no line, Q-73)
//     level   'ok' | 'plan' (act later, or worth doing) | 'act' (act now) | 'crit' (short already)
//     kind    which line it is (desk/README.md §19.5): 'watch' | 'held' | 'short' | 'commit' | 'restore' |
//             'spare' | 'stop' | 'battery' | 'city' | 'quiet'
//     targets control ids to light (desk/README.md §5)
//     action  the sim input (or {redispatch: true}, or SOAK THE CITY's {type: 'soakCity', ...}: inputsOf)
//             that answers it now, or null. The game never
//             sends it: the hint-following player (tests/lib/follow.js) does, to prove that a
//             player who does only what this line says gets through the day and does it well.
//     short   the capacity shortfall the line is about {atS, endS, mw}, or the first one in the
//             4.5-h window, or null
//     long    the spill ahead {atS, endS, mw} or null (planview's first blue run)
//     saving  (STOP lines) the dollars the line quotes
//
// Branch order (§21.4; 2b §31.9.8; 2c): watch, held, short-now, commit-now, shortAhead, air-con,
// restore, spare, pickup (2c), stop, battery, soak, commit-later, quiet; at a hand-back with its
// lamp lit, restore first (2c, below). A line that asks for nothing yet (a
// start more than ACT_WITHIN_S away, a feeder that cannot close yet, spare that nothing can add,
// the reserve diesel on its way) gives way to a lower branch that has something to do now; among
// lines that ask for something, the order above decides; then a critical line; then a city line not
// yet due (level 'plan': it carries its action, so a player may book ahead, but a booking hours away
// never hides a feeder to close, a GUARD to raise or a battery order; once due, 'act', it keeps its
// place in the order); then the first that has something to say. Between commit-now and restore
// sits the shortfall no start can reach (shortAhead): what every committed MW cannot give within
// the hour is the battery's to carry, and demand response's when it is more than the battery
// holds; the reserve diesel only beyond both.
//
// The city levers (2b, Q-59, §31.9.8): kind 'city', targets ['suburb-<ID>'], the action the full
// flex input {type: 'flex', suburb, lever, atS} with atS from aimFlex (sim/autopilot.js) over the
// day-ahead (or the 4.5-h forecast; -1 is "not now": no line), kept at the shown line's atS while
// aimFlex is within one 5-minute step of it (`stick`, `cityAim`; ctx.held, the game passes
// game.objective; the forecast starts at obs.s, off the lattice, so its extreme column slides and
// aimFlex alone flips between two marks every few grid minutes: 2b final review S1; tests/lib/follow.js
// and the tools pass none), startBy the booking's deadline
// (the soak's atS, the air-con's pre-cool start), level 'act' once that is within ACT_WITHIN_S
// (+ leadS), else 'plan'. Eligibility only through observe().levers' block (a suburb is free when
// its lever's block is ''). An air-con line names one suburb; the next is named once the forecast
// carries the booking. The soak is the city's, in one booking (Q1, W7).
//   soak (after battery: a battery order due now shows first; before commit-later), aimed once:
//   every free suburb has no soak of its own, so aimFlex gives them all the same atS. When either
//     (a) an MSL notice stands with its low ahead (obs.msl.level >= 1, atS > now), and some
//         column of the 4.5-h forecast in 10:00-15:00 is still at or under MSL1_MW + MSL_CLEAR_MW,
//         raised by MSL_TIE_OUT_MW in a column before the tie's return as sim/events.js raises it
//         (the notice is re-checked only every MSL_CHECK_S, so a soak booked since would not clear
//         it until then: without this, a player who books at once would be asked again a
//         minute until the next check); the low it quotes is that column, the one nearest its threshold;
//     (b) else, spill the battery will not take: the projection's spill plus the present charge
//         order per column, the battery modelled as battery() charges it (up to min(ratedMW -
//         guardMW, PAR_BATT_CHARGE_MAX_MW) a column, from the earliest blue column, its present
//         order in every column, until (capMWh - socMWh) / BATT_CHARGE_EFF is used); the largest
//         excess inside the aimed block's span (atS, atS + SOAK_S) above SURPLUS_MIN_MW. Spill outside the
//         span is not the soak's to take (on a MILD 06:30 aimed at 11:00, spill at 10:00-10:55
//         gives no line; the line comes once the projection reaches the span).
//     it asks for every free suburb at once (Q1: one ripple-control signal moves a distributor's controlled
//     hot water; the one-suburb-a-line asks it replaced were six identical free presses within 14 grid
//     minutes on 2026-10-14): action {type: 'soakCity', lever: 'soak', atS, suburbs: [ids, most MW first]},
//     the sim inputs inputsOf() names (app/game.js soakCity books them, one press); targets every free
//     suburb (H opens the first's card, whose SOAK THE CITY row takes the focus). With one suburb free,
//     the plain flex input for it, by name.
//     Text: "MSL1: demand falls to about 1,550 MW at 12:40. Book the city's HOT WATER SOAK,
//     10:35–14:35 (480 MW): it lifts the low; tonight's heating falls by as much." or "The
//     battery cannot take all of noon's spill. Book … : tanks take the rest; tonight's heating
//     falls by as much." ("the HOT WATER SOAK in the other 4 suburbs" once some are booked; "a HOT
//     WATER SOAK in Old Hazelton" for the last; Q-52: the night's heating falls by the booked energy.)
//   air-con (right after shortAhead) only when lookAhead names no unit (a start beats air-con),
//     shortAhead's soon does not hold, and for a run of the real gap (capacityGap real, over the
//     day-ahead) at or after the suburb's fromS (each run in turn: a smaller, earlier one does not
//     hide the evening's): no gap column in the aimed pre-cool [atS - PRECOOL_S, atS], the run's
//     largest column inside the core [atS, atS + AIRCON_S], and the run more than the battery holds
//     (its largest column above ratedMW, or its MWh above the charge over the reserve, where before
//     15:30 (PAR_BATT_CHARGE_H) the charge counts at least PAR_BATT_CHARGE_TO: battery() fills it by
//     then on any day with an evening gap): where demand response would be called (Q-59 "before DR";
//     air-con is $400/MWh against DR's $1,400). The free suburb with the most relief MW that passes.
//     Text: "From about 18:30 committed units fall short. Book an AIR-CON CYCLE in Redgum Flats,
//     18:30–20:00 (45 MW): pre-cool from 17:30; 40% of the relief comes back after." ("committed":
//     a unit that is off but cannot reach the gap may exist; the 40% is of the relieved energy.)
// Every city line fits LINE_MAX_CHARS with Tallowood Heights and the widest figures
// (tests/objective-levers.test.js).
//
// (The GUARD line asks once for the most the battery can hold for a trip, PAR_GUARD_MAX_MW: a step
// is worth less the higher the ring already is. Measured at 04:31 on the 11 seeds of both day
// scenarios: the first 100 MW 0.025 to 0.104 Hz on the trip preview, then 0.021 to 0.062, 0.014 to
// 0.041, 0.011 to 0.030. A line sized on a step's worth asked twice: 300 MW, then 400.)
// (After a trip the fired GUARD gives its whole ring for GUARD_SUSTAIN_S; a belly trip is smaller
// than the ring, so while it is still giving and frequency is above the normal band the line turns it
// down to 0 (par's rule 2 does the same), raises no ring while it is fired, holds the battery
// branch's charge orders out of the MW it gave up, and raises it back once it has re-armed, within
// the hour of the trip. Measured on desk-weekend seed 20261017, coal 1 at minimum, 240 MW, tripping
// at 14:08:40 under a 400-MW GUARD: 478 s above 50.15 Hz in the next 900 s before, 49 s after.)
// (Both moved here from the file in 2b, Q-49.)
//
// The line says what is true (the wave-3 review): a shortfall is in the present tense only when the
// desk at its limits (the real check) is short in the next minutes, otherwise it is what the hour
// lacks against a safe margin; "Enough plant is committed" only with no column short of a trip's
// worth of spare by THIN_MW; a STOP's saving says it rests on nothing tripping before the unit is
// back; a unit on its way off counts down its ramp and the T4 slope until its breaker opens.
//
// The line is pure, so "never thrash" is kept by state, not by a clock: a STOP is not proposed
// while another unit is on its way down or has been down under STOP_GAP_S; a battery order is
// proposed only from idle (or to raise a charge by what is still being spilled, or to end one at
// the reserve or at the window's end), with bands between the levels that start and end it, and
// none in the quarter hour before the evening's own order. (The shortfall branches raise a
// discharge as an evening gap grows: each order is sized for the gap 20 min ahead.)
//
//   consequence(obs, target, {planview, dayAhead, proj?}) -> {target, text, level} | null
//     what a guarded press would do, said before it is made (C-10): target is
//     'guard-start-<unit>' or 'guard-stop-<unit>'; level 'ok' (starting) | 'plan' | 'crit'.
//     A STOP that opens no shortfall, of a unit at its floor, says what it saves (stopQuote, the line's own; Q4, W7).
//   guardConsequence(obs, fromMW, toMW, preview) -> {target: 'ring-guard', text, level} | null
//     the GUARD ring turned down, priced on both sides (Q4, W7): the gas and carbon the freed MW
//     could replace by the evening's end, against what the largest loss would then shed at the VCR.
//   stopQuote(obs, u, day, proj, planview, endS?) -> {need, backS, saving}: a STOP's quote; the
//     saving counts the carbon the ALL-IN score charges (Q10, W7: stopSaving).
//
//   steady(held, next, s, hand?) -> {line, seenS, sinceS}
//     the line as the desk shows it: a line whose deadline or figure moves with each forecast while
//     what it asks for and its other words stay the same is kept as it was said, and a quiet line
//     for STEADY_QUIET_S against another quiet line (the game holds `held`; the objective itself
//     stays pure, and the action a line carries is never held back or changed). hand: the clock
//     is HAND's (app/director.js handAt), for spanAt. Its figures (masked) are the numbers, times
//     and dollars, and since stage C the part of the day a time falls in ("for the afternoon" and
//     "for the evening" near 17:00 are the shortfall's time moving, and alternated look to look).
//     The game's 4-s dwell (app/game.js holdLine) holds a line's words and glow but never an action
//     the fresh line no longer carries (heldLine: another unit or control, or none, drops it).
//
// The day (slice 2c, desk/README.md §32.8.1):
//   - A heatwave is news from 04:00 (Q-80): the look-ahead derates its window from the news;
//     Q-38's HOT-morning worst case is retired (a HOT day with no heat news has none coming).
//   - The night roll (Q-73): from obs.nightShift there is no line (objective() returns null; the
//     shell hides the box and the night strip replaces it, and steady() keeps no day text over
//     it). A shortfall from 21:00 on a night scenario is the night shift's: the commit look-ahead,
//     "Next" and the quiet line's thin and real checks look only at runs that begin before 21:00.
//   - The spans (Q-63): NOW_S, ACT_WITHIN_S and the STEADY spans were tuned at TUNED_RATE (the
//     flat 120x); each means its real seconds there, as the D-2 profile plays them from where it
//     starts (spanAt: cut at a night scenario's 21:00, but never under the span itself, so near
//     21:00 the floor can run a few grid-minutes past it). The act window is one stretch of real
//     seconds (actWithin: the game's reading lead, then ACT_WITHIN_S from where it ends; 18 real
//     s). An instant resource, the battery's order and the demand response call, is asked when the
//     gap opens within instS = max(ACT_WITHIN_S + NOW_S of grid time, NOW_S of the profile): its
//     energy is grid time (an order made earlier is charge the peak will not have), but never
//     less than NOW_S's real seconds to press it; "be ready" until then. The reserve diesel is armed
//     within ACT_WITHIN_S of the profile before its 20 min (no reading lead: it costs by the
//     minute), never past PAR_RERT_STANDDOWN_MIN ahead (spare()'s stand-down look-ahead, so the two
//     never chase each other); "arm it by" is 20 min before the shortfall the line names. The
//     battery's late charging band stays grid time (a band, not a reaction).
//   - Act I's constraints (Q-68): the tie's import limit per column until its limitUntilS; a booked
//     start due at a unit's return; a unit out for maintenance planned from its return, or from the
//     end of a minimum down time that outlasts it (stage C: sim/fleet.js startBlock names only the
//     outage while it lasts, so startable reads downForS; app/planview.js's earliest line does too) (startable
//     with later: "Start CCGT 2 at 07:45, when it is back", never an ask or a lit START before it;
//     its START press says "out for maintenance until 07:45"); the reserve diesel's line comes
//     before it only when it is back too late for the diesel's shortfall. A capacity ask (commit,
//     short now, the spare+commit start, "Next", the battery's, the quiet line's) names what binds
//     (why): "(CCGT 2 out until 07:45; the tie limited to 450 MW until 11:00)", when it fits; a unit
//     is named only when started now it would be in time (its outage is the reason).
//   - The restore task (Q-68, Q-69): the look-ahead takes a feeder under repair off the demand
//     until its clearS (sim/dark.js, as app/planview.js and the dispatch do: the announced return).
//     From PICKUP_AHEAD_S before a hand-back, with no feeder yet the desk's, "SAL4's feeder is back
//     at 06:45: hold 250 MW of spare for its pickup" (its cold load now, with the forecast's
//     underlying demand then, to the 10 MW: a few MW of drift moves it 10 MW, never a 50-MW step;
//     the spare gauge lit, never the bay, whose tab glows with Q-91's feeder card at the hand-back; a passive line
//     after spare()'s own, before "Next"). The feeders under repair are named beside the count; R's feeder first (one handed
//     back, the latest first, as desk/bay.js picks); at a hand-back with its lamp lit the restore
//     ask comes before every other branch unless the real check is short within instS (the hand-back
//     is the feeder's moment: Q-91's card holds the clock for it). spare()'s pickup counts a held feeder only once its return is within
//     the act window (at real sizes a pickup, 200-300 MW, is under the trip's share, 1.05 L).
//   - On a night scenario a STOP saves until the night shift would stop the unit (stopHorizonS:
//     21:00, or PAR_DECOMMIT_MIN_ON_MIN on), and a restart from 21:00 is the night shift's (no
//     start priced, no "Start it again by").

import {V} from '../sim/params.js';
import {SCENARIOS} from '../content/scenarios.js';
import {clockText, priceText} from '../render/format.js';
import {unitLabel} from '../desk/util.js';
import {imbalanceSegments} from '../desk/calc.js';
import {aimFlex} from '../sim/autopilot.js';
import {gridAfter, NIGHT_S} from '../sim/clock.js';
import {darkShareAt, litMW} from '../sim/dark.js';

/** The objective line and the consequence line are one line each: at most this many characters (§21.4). */
export const LINE_MAX_CHARS = 170;
/** The flat CRUISE (x) the grid spans below were tuned at: each means its real seconds there (spanAt). */
export const TUNED_RATE = 120;
/** A start is "now" when its latest moment is within this many grid seconds (at TUNED_RATE; spanAt). */
export const ACT_WITHIN_S = 600;
/** Capacity under the forecast plus this (MW) is a shortfall: the forecast's own error at an hour or two. */
export const MARGIN_MW = 150;
/**
 * A unit is asked for when capacity is under the forecast plus this (MW): enough to lose the
 * largest unit (about 620 MW at the plan's loading) and still be within what the battery and one
 * gas turbine can make up. Par's rule 3 keeps 700 MW over full ratings and half the battery,
 * which is about 600 MW in this check's terms; set by measuring followed days against par (tools/follow.mjs).
 */
export const COMMIT_MARGIN_MW = 650;
/** A shortfall ahead smaller than this is not worth a unit (MW). */
export const SHORT_MIN_MW = 100;
/** The plan short by this much within NOW_S is an emergency (MW, grid seconds at TUNED_RATE; spanAt). */
export const CRIT_MW = 300, NOW_S = 300;
/**
 * Hydro counts for the MW its water can hold for the evening: from PAR_WATER_HOLD_UNTIL_H (or now,
 * once past it) to PAR_WATER_EMPTY_BY_H, at most this long (h) and at least HYDRO_SUSTAIN_MIN_H.
 */
export const HYDRO_SUSTAIN_H = 5, HYDRO_SUSTAIN_MIN_H = 1;
/** A STOP is worth saying from this saving ($); below it the wear of a start is not worth it. */
export const STOP_MIN_SAVING = 10000;
/** A unit is "at its floor" within this of its minimum (MW). */
export const STOP_FLOOR_MW = 20;
/** No second STOP while a unit is unloading or has been down for less than this (grid seconds). */
export const STOP_GAP_S = 1800;
/** A stopped unit must not be needed for this long after it could be back (grid seconds). */
export const STOP_CLEAR_S = 3600;
/** The smallest battery order worth making (MW), and the band between starting and ending one (share of capacity). */
export const BATT_MIN_MW = 50, BATT_BAND = 0.05;
/** A discharge is ordered only with this many hours of it above the reserve; a discharge for a shortfall ahead is sized in steps of this (MW). */
export const BATT_MIN_H = 1 / 6, BATT_AHEAD_STEP_MW = 100;
/** An evening discharge this far (MW) above what the evening still needs is eased. */
export const BATT_EASE_MW = 200;
/** The reserve diesel is stood down when this share of the battery's and demand response's energy would carry what is left. */
export const RERT_STANDDOWN_FRAC = 0.5;
// (The GUARD's measurements: desk/README.md §31.8 app/objective.js.)
/** The look-ahead counts what a unit can reach within this long of a column (grid seconds); see capacityGap. */
export const RAMP_HEAD_S = 1800;
/** A task feeder's pickup is said this long before its hand-back (grid seconds; Q-68). */
export const PICKUP_AHEAD_S = 3600;

const M = V.MACHINES, LOADING = V.PLAN_MAX_LOADING, TIE_FIRM_MW = V.STATIONS.coal.ratingMW;
const COMMIT_TRIP_MW = COMMIT_MARGIN_MW - MARGIN_MW; // the part of the commit margin that is for a trip (tripGap)
const S_PER_H = V.S_PER_H, S_PER_MIN = V.S_PER_MIN, DAY_S = V.DAY_S, AUTO = V.AUTO_SYNC_S;
const HYDRO_LAST = 1e6;
const secOfH = h => (h - V.DAY_START_H) * S_PER_H;
const HOLD_UNTIL_S = secOfH(V.PAR_WATER_HOLD_UNTIL_H), EMPTY_BY_S = secOfH(V.PAR_WATER_EMPTY_BY_H);
const CHARGE_FROM_S = secOfH(V.PAR_BATT_CHARGE_H[0]), CHARGE_BY_S = secOfH(V.PAR_BATT_CHARGE_H[1]);
const DIS_FROM_S = secOfH(V.PAR_BATT_DISCHARGE_H[0]), DIS_TO_S = secOfH(V.PAR_BATT_DISCHARGE_H[1]);
const CHARGE_TO_MWH = V.PAR_BATT_CHARGE_TO * V.BATT_MWH, RESERVE_MWH = V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH;
const DERATE_KEEP = 1 - V.HEAT_THERMAL_DERATE;
const GUARD_SUSTAIN_H = V.GUARD_SUSTAIN_S / S_PER_H;
const SECURE_HZ = V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ;
const GAS = new Set(['ccgt', 'ocgt']);

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const commas = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const mwText = x => commas(Math.max(10, Math.round(x / 10) * 10)) + ' MW';
const usdText = x => '$' + commas(Math.max(1000, Math.round(x / 1000) * 1000));
const minText = s => { const m = Math.max(1, Math.round(s / S_PER_MIN)); return m >= 90 ? (m / 60).toFixed(1).replace('.0', '') + ' h' : m + ' min'; };
// '1 h 10', '49 min': a duration as a clock would say it (the consequence line).
const spanText = s => { const m = Math.max(1, Math.round(s / S_PER_MIN)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''); };
const at = s => clockText(s, false);
// A deadline or a time ahead is said on the 5-minute mark at or before it, so it stands still
// while the forecast's columns slide by a minute at a time.
const QUARTER_S = 900, AHEAD_MARK_S = 600, FIGURE_MW = 50, FC_MARK_S = V.FC_STEP_S;
const figure = x => mwText(Math.round(x / FIGURE_MW) * FIGURE_MW);
const mark = s => Math.floor(s / V.FC_STEP_S) * V.FC_STEP_S;
const atMark = s => at(mark(s));
// A clock time that may fall after the day's end (04:00): '05:14 tomorrow'.
const atDay = s => at(s) + (s >= DAY_S ? ' tomorrow' : '');
const unitName = unitLabel; // the desk's: 'CCGT 2', 'GT·A'
const pctText = b => Math.round(100 * b.socMWh / b.capMWh) + '%';
const partOfDay = s => { const h = (V.DAY_START_H + s / S_PER_H) % V.DAY_H; return h >= 4 && h < 12 ? 'the morning' : h < 17 ? 'the afternoon' : h < 22 ? 'the evening' : 'tonight'; };

// ------------------------------------------------------------------ the clock (Q-63)

// The clock is HAND's (app/director.js handAt); a night scenario (Q-73).
const handOf = obs => !!obs.handFlown || (obs.mode === 'HAND' && obs.s >= V.PLAYER_START_S);
const nightOf = obs => { const scn = SCENARIOS[obs.scenarioId]; return !!(scn && scn.night); };

/** A span tuned at TUNED_RATE (grid s): the grid time the profile plays in its real seconds from s, cut at endS, but never under the span itself (§31.8). */
export function spanAt(s, gridS, hand, endS = Infinity) {
  return Math.max(gridS, Math.min(gridAfter(s, gridS / TUNED_RATE, hand), endS) - s);
}
/** The act window at s (grid s): the reading lead, then ACT_WITHIN_S from where it ends: one stretch of real seconds (Q-63). */
export const actWithin = (s, leadS, hand, endS) => leadS + spanAt(s + leadS, ACT_WITHIN_S, hand, endS);

// ------------------------------------------------------------------ the capacity look-ahead

const heatNews = obs => { for (let i = obs.news.length - 1; i >= 0; i--) if (obs.news[i].kind === 'heat') return obs.news[i]; return null; };
// The tie's import limit at grid second t: a derate holds until its limitUntilS (Q-68).
const tieLimitAt = (tie, t) => (tie.limitUntilS >= 0 && t >= tie.limitUntilS ? V.TIE_MAX_MW : tie.importLimitMW);
// When a booked start of unit u is due: not before its return from an outage (sim/grid.js startDueS).
const dueS = (u, atS) => Math.max(atS, u.outUntilS);
// A START refused for an outage (sim/fleet.js startBlock: 'on outage until HH:MM').
const OUT_RE = /^on outage until /;
// A feeder under repair (Q-69: the network's until its clearS; sim/fleet.js refreshHeld).
const heldAt = (d, s) => d.dark && d.shedBy === 'task' && d.clearS > s;
// t => the dark shares (sim/dark.js) of the feeders under repair at obs.s that are still held at t, or
// null: off the load until their announced return, as app/planview.js and the dispatch count it (Q-69)
function heldShare(obs) {
  const held = obs.districts.filter(d => heldAt(d, obs.s)), memo = [];
  return t => {
    const n = held.filter(d => t < d.clearS).length; // (the sets are nested: their size names them)
    return n ? memo[n] || (memo[n] = darkShareAt({...obs, districts: obs.districts.map(d => ({...d, dark: heldAt(d, obs.s) && t < d.clearS}))}, t)) : null;
  };
}

// The auto-synchroniser's wait: none in HAND, where the player SYNCs at full speed (X-43).
const syncOf = obs => obs.mode === 'HAND' ? 0 : AUTO;

// Seconds from now until unit u (an observe row) is at minimum load, by its mode; -1: not coming.
// In HAND a unit at full speed is SYNCed now (the line asks for it), as the plan executor counts it.
function onInS(u, m, obs) {
  switch (u.mode) {
    case 'on': return 0;
    case 'loading': return u.timerS;
    case 'ready': return (syncOf(obs) ? u.timerS : 0) + m.t2S;
    case 'starting': return u.timerS + syncOf(obs) + m.t2S;
    default: return -1;
  }
}

/**
 * MW a unit on its way off still gives d grid seconds from now (H-1): down its ramp to minimum
 * load, then the T4 slope to the breaker. A unit in 'shutdown' is on that slope already (timerS
 * to the breaker). A coal machine stopped from 560 MW is still on the grid three hours later.
 */
function leavingMW(u, m, d) {
  if (u.mode === 'shutdown') return Math.max(0, u.outMW * (1 - d / Math.max(1, u.timerS)));
  const unloadS = Math.max(0, u.outMW - u.minMW) / m.rampMWs;
  if (d < unloadS) return u.outMW - m.rampMWs * d;
  return Math.max(0, Math.min(u.outMW, u.minMW) * (1 - (d - unloadS) / Math.max(1, m.t4S)));
}

/**
 * Capacity against the forecast, per column: gap[k] = demand + margin - capacity (MW; > 0 is
 * short). Pure; reads obs only.
 * @param {object} obs observe(state)
 * @param {object} fc a forecast-shaped object (obs.forecast or obs.dayAhead)
 * @param {{marginMW?:number, without?:string, leaving?:string, rert?:boolean, plus?:{unit:string, atS:number}, real?:boolean, water?:boolean}} [o]
 *   without: a unit id counted as stopped; leaving: a unit id counted as stopped NOW, on its way
 *   down its ramp and the T4 slope (what a STOP press does; a unit already unloading or in
 *   shutdown is always counted so); rert: false leaves the reserve diesel out; plus: a unit
 *   counted as started at atS. real: what the desk
 *   can really give, not what it is wise to plan on: no margin unless one is given, hydro before
 *   HOLD_UNTIL too, the tie at its import limit (the dispatch goes there when it is short) and
 *   every unit only as far as its ramp takes it from where it is now. water: true counts hydro
 *   before HOLD_UNTIL too (tripGap). The heat derate is the announced heatwave's (news from 04:00,
 *   Q-80); the tie's limit holds until its limitUntilS; a booked start waits for a unit's outage;
 *   a feeder under repair is off the demand until its clearS (Q-69).
 * @returns {{gap:Float64Array, n:number, fromS:number, stepS:number}}
 */
export function capacityGap(obs, fc, o = {}) {
  const s = obs.s, n = fc.n, gap = new Float64Array(n), real = !!o.real;
  const margin = o.marginMW === undefined ? (real ? 0 : MARGIN_MW) : o.marginMW;
  // Planning counts what a unit could reach within half an hour of the column (a trip is made up
  // over minutes, and the N-1 gauge watches those); the real check counts the ramp from now.
  const headS = real ? 0 : RAMP_HEAD_S;
  const starts = new Map(obs.plan.starts.map(e => [e.unit, e.atS])), stops = new Map(obs.plan.stops.map(e => [e.unit, e.atS]));
  // the water above the reserve, spread over what is left of the evening (the dispatch releases it to
  // PAR_WATER_EMPTY_BY_H); the reserve sits above HYDRO_STOP_MWH, where the station unloads, as par
  // and the plan view count it
  const water = Math.max(0, obs.hydro.storageMWh - V.HYDRO_STOP_MWH - V.PAR_WATER_RESERVE_MWH) / clamp((EMPTY_BY_S - Math.max(s, HOLD_UNTIL_S)) / S_PER_H, HYDRO_SUSTAIN_MIN_H, HYDRO_SUSTAIN_H);
  const news = heatNews(obs), heldOf = heldShare(obs);
  // when each unit is at minimum load, the MW it climbs from there, and when it leaves
  const onS = new Float64Array(obs.units.length), offS = new Float64Array(obs.units.length), fromMW = new Float64Array(obs.units.length);
  // units on their way off (unloading, in shutdown, or the one a STOP press would send): their own path down
  const going = obs.units.map(u => u.mode === 'unloading' || u.mode === 'shutdown' || (o.leaving === u.id && (u.mode === 'on' || u.mode === 'loading')));
  obs.units.forEach((u, i) => {
    const d = onInS(u, M[i], obs);
    onS[i] = d >= 0 ? s + d : u.mode === 'off' && starts.has(u.id) ? dueS(u, starts.get(u.id)) + u.startToMinS : Infinity;
    if (o.plus && o.plus.unit === u.id && !Number.isFinite(onS[i])) onS[i] = o.plus.atS + u.startToMinS;
    offS[i] = stops.has(u.id) ? stops.get(u.id) : Infinity;
    if (o.without === u.id || o.leaving === u.id || going[i]) onS[i] = Infinity;
    fromMW[i] = u.mode === 'on' ? Math.max(u.outMW, u.minMW) : u.minMW;
  });
  const rert = obs.rert, useRert = o.rert !== false && rert.armed && !rert.standingDown;
  for (let k = 0; k < n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    const hot = news && t >= news.fromS && t < news.toS;
    let thermal = 0, hydro = 0;
    for (let i = 0; i < obs.units.length; i++) {
      const u = obs.units[i];
      if (going[i] && o.without !== u.id) {
        const mw = leavingMW(u, M[i], t - s);
        if (u.station === 'hydro') hydro += mw; else thermal += mw;
        continue;
      }
      if (t < onS[i] || t >= offS[i]) continue;
      // The present rating for the coming column; after it the nameplate, derated inside a heat window (S-10).
      const avail = t <= s + fc.stepS ? u.availMW : hot && M[i].thermal ? u.ratingMW * DERATE_KEEP : u.ratingMW;
      // No more than its ramp allows from where it is (a coal machine takes two hours from minimum to full).
      const reach = fromMW[i] + M[i].rampMWs * (t - onS[i] + headS);
      if (u.station === 'hydro') hydro += Math.min(avail, reach); else thermal += Math.min(avail * LOADING, reach);
    }
    const lim = tieLimitAt(obs.tie, t), tie = obs.tie.tripped && t < s + obs.tie.lockoutS ? 0 : real ? lim : Math.min(lim, TIE_FIRM_MW);
    // The dispatch keeps the water for the evening (it runs hydro before HOLD_UNTIL only above
    // its keep line, which a morning uses up), so hydro is firm capacity from then on only.
    const cap = thermal + (t >= HOLD_UNTIL_S || real || o.water ? Math.min(hydro, water) : 0) + tie + fc.windMW[k] + fc.solarMW[k] +
      (useRert ? (t >= s + rert.leadS ? V.RERT_MW : rert.outMW) : 0);
    const D = heldOf(t);
    gap[k] = (D ? litMW(fc.demandP50[k], fc.rooftopMW ? fc.rooftopMW[k] : 0, D) : fc.demandP50[k]) + margin - cap;
  }
  return {gap, n, fromS: fc.fromS, stepS: fc.stepS};
}

/**
 * The look-ahead with a trip in it, per column (the shape of capacityGap): short when capacity is
 * under the forecast plus MARGIN_MW with the water held for the evening, as the dispatch holds it,
 * or under the forecast plus MARGIN_MW + tripMW with the water counted at any hour: a trip is what
 * the gorge is kept for (par's rule 3 counts it the same way).
 */
export function tripGap(obs, fc, tripMW, o = {}) {
  const G = capacityGap(obs, fc, Object.assign({}, o, {marginMW: MARGIN_MW}));
  const T = capacityGap(obs, fc, Object.assign({}, o, {marginMW: MARGIN_MW + tripMW, water: true}));
  for (let k = 0; k < G.n; k++) if (T.gap[k] > G.gap[k]) G.gap[k] = T.gap[k];
  return G;
}

// The first run of short columns at or after fromS (and starting before untilS) whose largest
// shortfall is at least SHORT_MIN_MW, or null.
function firstRun(G, fromS = -Infinity, untilS = Infinity) {
  let run = null;
  for (let k = 0; k < G.n; k++) {
    const t = G.fromS + (k + 1) * G.stepS;
    if (t < fromS) continue;
    const short = G.gap[k];
    if (short > 0 && (run || t < untilS)) {
      // crossS: where the gap crosses zero between this column and the one before (for what the line says)
      if (!run) run = {atS: t, endS: t, mw: short, crossS: k > 0 && G.gap[k - 1] <= 0 && t - G.stepS >= fromS ? t - G.stepS * short / (short - G.gap[k - 1]) : t};
      else { run.endS = t; if (short > run.mw) run.mw = short; }
    } else if (run) {
      if (run.mw >= SHORT_MIN_MW) return run;
      run = null;
    }
  }
  return run && run.mw >= SHORT_MIN_MW ? run : null;
}

/**
 * The first run of forecast columns where the committed fleet's capacity is under the forecast
 * demand plus MARGIN_MW, or null. Pure; reads obs only.
 * @param {object} obs observe(state)
 * @param {object} [fc] any forecast-shaped object (obs.forecast by default; obs.dayAhead for the whole day)
 * @param {object} [o] capacityGap's options (marginMW, without, leaving, rert, plus, real, water)
 * @returns {{atS:number, endS:number, mw:number}|null} atS: the first short column's time; mw:
 *   the largest shortfall in the run (margin included)
 */
export function capacityShort(obs, fc = obs.forecast, o) {
  const run = firstRun(capacityGap(obs, fc, o));
  return run ? {atS: run.atS, endS: run.endS, mw: run.mw} : null;
}

// Machines that could be started, cheapest first (the merit order), with the lead each needs.
// Hydro goes last: another machine adds MW, not water.
// lead: START to minimum load; climb: from there to the plan's loading at its ramp (two hours for
// a coal machine); plan: the lead a start is planned with, the climb counted beyond the half hour
// the look-ahead already allows (RAMP_HEAD_S), so the unit is at full load when it is needed.
// later: units out for maintenance too, each from its return or a minimum down time ending later (Q-68, §31.8); the others from now.
function startable(obs, later = false) {
  const booked = new Set(obs.plan.starts.map(e => e.unit));
  return obs.units.filter(u => u.mode === 'off' && (u.startBlock === '' || (later && OUT_RE.test(u.startBlock))) && !booked.has(u.id)).map(u => {
    const climb = Math.max(0, u.ratingMW * (u.station === 'hydro' ? 1 : LOADING) - u.minMW) / (u.rampMWMin / S_PER_MIN);
    const downS = u.startBlock !== '' && u.downForS >= 0 ? obs.s - u.downForS + M.find(m => m.id === u.id).minDownS : -1;
    return {unit: u.id, id: 'guard-start-' + u.id, lead: u.startToMinS, climb, plan: u.startToMinS + Math.max(0, climb - RAMP_HEAD_S),
      offer: u.station === 'hydro' ? HYDRO_LAST : u.offer, cls: u.cls, fromS: Math.max(obs.s, u.outUntilS, downS)};
  }).sort((a, b) => a.offer - b.offer || a.lead - b.lead);
}
// When a start of c made as soon as it may be reaches minimum load.
const arrival = c => c.fromS + c.lead;

// "49 min to reach the grid"; for a machine with a long climb, "2.1 h to reach the grid and 2.1 h more to full load".
const leadText = c => minText(c.lead) + ' to reach the grid' + (c.plan > c.lead ? ' and ' + minText(c.climb) + ' more to full load' : '');

/** The largest single loss of supply once `without` is gone (MW): the firm tie import, or the largest committed machine at the plan's loading. */
export function largestLoss(obs, without) {
  let big = obs.tie.tripped ? 0 : TIE_FIRM_MW;
  obs.units.forEach((u, i) => { if (u.id !== without && onInS(u, M[i], obs) >= 0 && u.availMW * LOADING > big) big = u.availMW * LOADING; });
  return big;
}

// ------------------------------------------------------------------ what a stop saves

// The cost ($/h) of supplying x MW from the flexible blocks [{mw, offer, co2}], in their merit order (cheapest
// offer first, as the dispatch takes them), each MW at its offer plus its carbon (t/MWh) at the VER the score
// charges (Q10, W7: the line counts a STOP's saving as the ALL-IN score does); what the blocks cannot give is
// charged at the last block's (the stop check keeps that from happening).
function stackCost(blocks, x) {
  let cost = 0, left = x, last = 0;
  for (const b of blocks) {
    if (left <= 0) break;
    const take = Math.min(left, b.mw), allIn = b.offer + V.VER * b.co2;
    cost += take * allIn; left -= take; last = allIn;
  }
  return cost + Math.max(0, left) * last;
}

/**
 * What stopping unit u now saves, in dollars, if it stays off until backS (the second it is
 * started again; Infinity: not again today) (§21.4 condition 4). For each idle column: its minimum
 * MW x (its offer + its carbon at the VER - the cost of the energy that replaces it, with that
 * energy's carbon) + its no-load; less one start when it comes back today. Carbon is the score's
 * (Q10, W7; app/score.js ALL-IN: tonnes at the VER): each machine's own t/MWh, hydro none, and an
 * import at the region's present intensity (the score charges imports at your own mix). The
 * replacement is free, and carbon-free, in columns where power would be spilled (the plan
 * view's surplusMW inside the 4.5-h window; the same arithmetic on the day-ahead beyond it),
 * otherwise it comes from the cheapest committed sources with room: the merit order of the other
 * machines above their minimums, hydro at its water value (the plan view's waterValue, P-6) and
 * the tie at the neighbour's price. planview: app/planview.js (ctx.planview). It ends at
 * stopHorizonS, with no start priced from there (a night scenario's night shift, Q-73).
 */
export function stopSaving(obs, u, backS, fc, proj, planview) {
  const s = obs.s, m = M.find(x => x.id === u.id), h = fc.stepS / S_PER_H, endS = stopHorizonS(obs, u), again = backS < endS;
  const unloadS = Math.max(0, u.outMW - u.minMW) / m.rampMWs;
  // off line from half-way down the T4 slope until half-way up the T2 slope of its return
  const offS = s + unloadS + m.t4S / 2, onS = again ? Math.min(endS, backS + m.t1S + syncOf(obs) + m.t2S / 2) : endS;
  const wv = planview.waterValue(obs.hydro.frac), mix = obs.score && obs.score.co2tPerMWh > 0 ? obs.score.co2tPerMWh : 0;
  let saving = 0;
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    if (t <= offS || t > onS) continue;
    let floor = 0, big = 0;
    const blocks = [];
    obs.units.forEach((x, i) => {
      if (x.id === u.id || onInS(x, M[i], obs) < 0 || t < s + onInS(x, M[i], obs)) return;
      const top = x.ratingMW * LOADING;
      if (x.station === 'hydro') { blocks.push({mw: x.ratingMW, offer: wv, co2: 0}); return; }
      floor += x.minMW;
      if (top > big) big = top;
      blocks.push({mw: Math.max(0, top - x.minMW), offer: x.offer, co2: M[i].co2});
    });
    const tripped = obs.tie.tripped && t < s + obs.tie.lockoutS;
    const exp = tripped ? 0 : fc.exportLimitMW[k];
    // the tie as a price-taking block from full export to its secure import (the largest unit)
    if (!tripped) blocks.push({mw: exp + Math.min(tieLimitAt(obs.tie, t), big), offer: fc.neighbourPrice[k], co2: mix});
    blocks.sort((a, b) => a.offer - b.offer);
    // MW the flexible blocks must give, with the unit off and with it at its minimum
    const net = fc.demandP50[k] - fc.windMW[k] - fc.solarMW[k] - (floor - exp);
    const inProj = proj && k < proj.n && Math.abs(proj.times[k] - t) < 1;
    const replace = inProj && proj.surplusMW[k] > 0 ? 0 : stackCost(blocks, Math.max(0, net)) - stackCost(blocks, Math.max(0, net - u.minMW));
    saving += (u.minMW * (u.offer + V.VER * m.co2) + m.noLoadPerS * S_PER_H - replace) * h;
  }
  return saving - (again ? m.startCost : 0);
}

/** The last second a STOP of unit u saves for: 04:00; on a night scenario the night shift's stop (21:00, or PAR_DECOMMIT_MIN_ON_MIN on). */
export function stopHorizonS(obs, u) {
  return nightOf(obs) ? Math.max(NIGHT_S, obs.s - u.upForS + V.PAR_DECOMMIT_MIN_ON_MIN * S_PER_MIN) : DAY_S;
}

// ------------------------------------------------------------------ the line

const NONE = {level: 'ok', kind: 'quiet', text: '', targets: [], action: null, startBy: -1, short: null, long: null};

// What the watch is about, from the contingency record (cause 'unit', 'link' or 'load'; the tray card says the same).
function tripped(c) {
  if (c && c.cause === 'link') return 'The tie line has tripped.';
  if (c && c.cause === 'load') return 'A smelter potline has tripped: ' + mwText(Math.abs(c.lostMW)) + ' of load gone.';
  return c && c.cause === 'unit' && c.id ? unitName(c.id) + ' has tripped.' : 'A unit has tripped.';
}

/**
 * @param {object} obs observe(state)
 * @param {{edited?:boolean, planview:object, proj?:object, dayAhead?:object|null, leadS?:number, held?:object}} ctx edited: the
 *   player holds levers by hand (app/system.js sys.edited); planview: app/planview.js; proj: its
 *   project(obs) if the caller already has it; dayAhead: observe(state, {dayAhead: true}).dayAhead,
 *   the forecast to 04:00 (without it the line looks 4.5 h ahead only); leadS: grid seconds more
 *   to a START's ACT_WITHIN_S (the game's reading time; default 0); held: the shown line (S1)
 * @returns {object|null} the line; null in the night roll (Q-73: the night shift has the desk, and the night strip replaces the line)
 */
export function objective(obs, ctx) {
  const PV = ctx.planview;
  if (obs.nightShift) return null;
  if (obs.over) return Object.assign({}, NONE);
  if (obs.inWatch) return Object.assign({}, NONE, {level: 'act', kind: 'watch', text: tripped(obs.contingency) + ' The desk is locked while the grid catches itself: watch.'});
  const s = obs.s;
  const proj = ctx.proj || PV.project(obs);
  const day = ctx.dayAhead || obs.forecast;
  const reds = PV.redRuns(proj);
  const long = (PV.blueRuns ? PV.blueRuns(proj)[0] : null) || null;
  // (NOW_S and ACT_WITHIN_S as the profile plays them here, Q-63, cut at a night scenario's 21:00;
  // instS: an instant resource's window, ACT_WITHIN_S + NOW_S of grid time but never under nowS, §31.8)
  const hand = handOf(obs), endS = nightOf(obs) ? NIGHT_S : Infinity, nowS = spanAt(s, NOW_S, hand, endS), actS = spanAt(s, ACT_WITHIN_S, hand, endS);
  const X = {obs, s, proj, day, long, thin: capacityShort(obs), edited: !!ctx.edited, PV, nowS, actS, instS: Math.max(ACT_WITHIN_S + NOW_S, nowS),
    act: actWithin(s, ctx.leadS || 0, hand, endS), endS, held: ctx.held || null,
    coach: ctx.coach !== false};   // O-8 (Q-92): false, problem mode
  // the plan's largest deficit in the columns within nowS (never a later column of the same red run)
  X.redNowMW = 0;
  for (let k = 0; k < proj.n && proj.times[k] - s <= nowS; k++) if (proj.gap[k] === 'red' && proj.deficit[k] > X.redNowMW) X.redNowMW = proj.deficit[k];
  const line = (o, extra) => Object.assign({level: 'ok', kind: 'quiet', text: '', targets: [], action: null, startBy: -1, short: X.thin, long}, o, extra);

  // 1. The levers are held by hand and the plan is short: hand them back.
  const red = reds.find(r => r.atS - s <= nowS && X.redNowMW >= CRIT_MW) || null;
  const heldRed = ctx.edited ? red || reds.find(r => r.mw >= SHORT_MIN_MW) || null : null;
  if (heldRed) {
    const now = heldRed.atS - s <= nowS;
    return line({level: 'crit', kind: 'held', text: 'With levers held by hand the plan is ' + mwText(now ? Math.max(X.redNowMW, SHORT_MIN_MW) : heldRed.mw) + ' below demand' +
      (now ? ' now' : ' from ' + at(heldRed.atS)) + '. RE-DISPATCH (N) hands every lever back to the plan.', targets: ['btn-redispatch'], action: {redispatch: true}, startBy: s});
  }

  // 2. Short right now: the fast answers.
  const now = shortNow(X, line);
  if (now) return now;

  // 2b. X-43: in HAND nothing closes a breaker for the player: a machine at full speed waits for its SYNC.
  const sync = syncNow(X, line);
  if (sync) return sync;

  // 3-9. The first branch with something to do now; else the first critical one (the reserve diesel
  // on its way: said, but never in place of what the battery can do meanwhile); else the first with
  // something to say. A city line not yet due comes after both. At a hand-back with its lamp lit the
  // feeder comes first (Q-91's card holds the clock for it) unless the desk is really short within instS.
  const back = obs.districts.some(d => d.dark && d.shedBy === 'task' && !(d.clearS > s) && d.restoreBlock === '') && !(realShort(X).soonMW >= BATT_MIN_MW);
  let passive = null, crit = null, ask = null;
  for (const branch of [...(back ? [restore] : []), commitNow, shortAhead, aircon, restore, spare, pickupAhead, stop, battery, soak, commitLater]) {
    const x = branch(X, line);
    if (!x) continue;
    if ((x.action || x.problem) && (x.kind !== 'city' || x.level === 'act')) return x;   // (O-8: a problem to act on now counts, though it names nothing)
    if (x.action) ask = ask || x; else if (x.level === 'crit') crit = crit || x; else passive = passive || x;
  }
  // 10. Quiet.
  return crit || ask || passive || quiet(X, line, !!ctx.dayAhead);
}

/** Demand within this of the present counts as no higher (MW): the line says "about N MW" to the 100. */
const PEAK_SAME_MW = 100;

// 10. Nothing to do now: what the committed plant covers, and what is next on the horizon
// (rounded, so the line stands still between dispatches). "Enough plant is committed" only when
// the commit check has no short column at all (a thin run under SHORT_MIN_MW is said as thin spare,
// so the line does not flip from "enough" to "start one now" with nothing changed); and with every
// unit that can run committed, what the evening still lacks is said plainly, with what carries it.
function quiet(X, line, dayAhead) {
  const obs = X.obs, day = X.day, p50 = day.demandP50;
  let peakK = 0;
  for (let k = 1; k < day.n; k++) if (p50[k] > p50[peakK]) peakK = k;
  const ref = Math.max(obs.demand.nowMW, day.n ? p50[0] : 0);
  const peakAt = day.n ? at(Math.round((day.fromS + (peakK + 1) * day.stepS) / QUARTER_S) * QUARTER_S) : '';
  const higher = day.n > 0 && p50[peakK] > ref + PEAK_SAME_MW;
  const rising = !dayAhead && peakK === day.n - 1 && higher;
  const peak = rising ? 'Demand is still climbing.' : higher ? 'Highest demand ahead: about ' + commas(Math.round(p50[peakK] / 100) * 100) + ' MW at ' + peakAt + '.'
    : 'No higher demand is ahead today.';
  // the commit check's thin band: a trip's worth of spare missing by THIN_MW or more somewhere ahead,
  // but by less than SHORT_MIN_MW (a unit is asked for from there); from 21:00 on a night scenario the night shift's
  const G = tripGap(obs, day, COMMIT_TRIP_MW);
  let thinS = -1;
  for (let k = 0; k < G.n && thinS < 0; k++) { const t = G.fromS + (k + 1) * G.stepS; if (t < X.endS && G.gap[k] >= THIN_MW) thinS = t; }
  if (thinS < 0) return line({text: 'Enough plant is committed for ' + (dayAhead ? 'the rest of the day. ' : 'the next 4½ hours. ') + peak});
  const fits = t => (t.length + 1 + peak.length <= LINE_MAX_CHARS ? t + ' ' + peak : t);
  if (startable(obs, true).length) {
    return line({text: fits('Committed plant covers the forecast, but with little spare for a trip' + (thinS - X.s > S_PER_H ? ' from about ' + at(Math.ceil(thinS / QUARTER_S) * QUARTER_S) : '') + '.')});
  }
  // Every unit that can run is committed: what they cannot give, even at their limits, is the
  // battery's and demand response's to carry (the reserve diesel's only beyond both).
  const all = obs.units.every(u => u.mode !== 'off' && u.mode !== 'tripped') ? 'Every unit is committed. ' : 'Every unit that can run is committed. ';
  const R = capacityGap(obs, day, {real: true});
  const run = firstRun(R, -Infinity, X.endS);
  if (run) {
    const mw = figure(hourOf(R, run)), fromS = Math.max(X.s, run.crossS);
    return line({text: fitWhy(why(X, fromS, null), r => all + 'From about ' + atMark(fromS) + ' demand is about ' + mw + ' more than they can give' + r + ': ' +
      (beyondReserves(obs, R, run) ? 'more than the battery and demand response can carry.' : 'the battery, then demand response, carry it.'))});
  }
  return line({text: fits(all + 'If demand outruns them, the battery and demand response carry the rest: this line will say when.')});
}

/** The quiet line's thin band (MW short of a trip's worth of spare): from here to SHORT_MIN_MW it says so. */
export const THIN_MW = 50;

// The commitment look-ahead, once per line: the gap at the commit margin over the day, and the
// unit to start for its first shortfall that a start can still reach (§21.4, the start cascade:
// never a second start for a shortfall the first cannot reach either). A shortfall from 21:00 on a
// night scenario is the night shift's (Q-73): the desk is locked by then.
function lookAhead(X) {
  if (X.ahead !== undefined) return X.ahead;
  const obs = X.obs, s = X.s;
  const G = tripGap(obs, X.day, COMMIT_TRIP_MW);
  const first = firstRun(G, -Infinity, X.endS);
  X.ahead = null;
  if (!first) return null;
  const all = startable(obs, true);
  const fastest = all.reduce((a, c) => (!a || arrival(c) < arrival(a) ? c : a), null);
  // the first shortfall a start made now (or at a return) could still be on for
  const reach = fastest ? firstRun(G, arrival(fastest), X.endS) : null;
  let c = null, inTime = [];
  if (reach) {
    inTime = all.filter(x => arrival(x) <= reach.atS);
    c = inTime[0] || fastest;
  }
  const T = capacityGap(obs, X.day, {marginMW: MARGIN_MW});
  X.ahead = {first, reach, unit: c, inTime, startBy: c ? Math.max(c.fromS, reach.atS - c.plan) : -1, thin: thinOf(T, reach || first), none: !all.some(x => x.fromS <= s)};
  return X.ahead;
}

/**
 * O-8 (Q-92), problem mode (X.coach false: from the second shift, or COACH OFF): a line names a unit to start only
 * when exactly one can still arrive in time; with two or more it states the problem and lights every one of them
 * (their START guards: the desk's station words glow), and carries no action of its own. null: coach as before.
 */
function problemPick(X, cands) {
  const ready = cands.filter(x => x.fromS <= X.s);
  return X.coach || ready.length < 2 ? null : {ids: ready.map(x => x.id), text: ready.length + ' units can still make it in time: the lit STARTs.'};
}

// Q-68's constraints on a shortfall from fromS: ' (CCGT 2 out until 07:45; the tie limited to 450 MW until 11:00)' or '' (§31.8).
// A unit is named only when its outage is what keeps it from the shortfall (started now, it would be in time).
function why(X, fromS, c) {
  const obs = X.obs, tie = obs.tie, out = [];
  const o = startable(obs, true).find(x => x.fromS > X.s && X.s + x.lead <= fromS && arrival(x) > fromS && (!c || x.offer < c.offer));
  if (o) out.push(unitName(o.unit) + ' out until ' + at(o.fromS));
  if (!tie.tripped && tie.limitUntilS > fromS && tie.importLimitMW < V.TIE_MAX_MW) out.push('the tie limited to ' + tie.importLimitMW + ' MW until ' + at(tie.limitUntilS));
  return out.length ? ' (' + out.join('; ') + ')' : '';
}
// f(reason): a line's text with why()'s clause in it, or without it when that would not fit on one line.
const fitWhy = (reason, f) => { const t = f(reason); return reason && t.length > LINE_MAX_CHARS ? f('') : t; };

// Is a run of the commit check short of the forecast itself (T: capacityGap at MARGIN_MW), or only
// of the spare one trip needs? {mw: the largest shortfall of the forecast in the run's first hour
// (the figure a line gives is for the hour the unit is asked for, not the evening's peak hours
// later), first: the one in its first column, real: the line says it as a shortfall}
function thinOf(T, run) {
  let mw = 0, at0 = 0;
  for (let k = 0; k < T.n; k++) {
    const t = T.fromS + (k + 1) * T.stepS;
    if (t < run.atS || t > Math.min(run.endS, run.atS + S_PER_H)) continue;
    if (t === run.atS) at0 = T.gap[k];
    if (T.gap[k] > mw) mw = T.gap[k];
  }
  mw = Math.round(mw / FIGURE_MW) * FIGURE_MW;
  return {mw, first: at0, real: at0 > 0 && mw >= SHORT_MIN_MW};
}

// When a run of the commit check begins, as the commit line and the START hover both say it: a
// shortfall on the 5-minute mark at or before it; a trip's worth of spare missing "from about" the
// quarter hour at or AFTER it (it moves with every forecast; and a deadline, always on the mark at
// or before need - lead, then never reads as the very minute of the need).
const needAt = (thin, crossS) => (thin.real ? atMark(crossS) : at(Math.ceil(crossS / QUARTER_S) * QUARTER_S));

// The head of a commit line: short of the forecast and its margin ("You will be 380 MW short from
// 06:10."), or only of the spare one trip needs ("From about 17:10 one trip would leave you short.":
// no figure, it moves with every forecast; the deadline is what matters). The figure is the
// planning check's (the forecast plus MARGIN_MW, the water kept for the evening): a shortfall that
// begins now is said in the present tense only when the desk, every unit and the water at their
// limits, really cannot cover demand in the next minutes; otherwise it is what the coming hour
// lacks against a safe margin (the grid is not short now, and frequency says so). reason: why()'s.
function shortHead(X, fromS, thin, reason = '') {
  const s = X.s, nowish = fromS - s <= X.nowS;
  if (thin.real && !nowish) return 'You will be ' + mwText(thin.mw) + ' short from ' + needAt(thin, fromS) + reason + '. ';
  if (thin.real) {
    const R = realShort(X);
    return R.nowMW >= BATT_MIN_MW ? 'Your units are ' + figure(R.nowMW) + ' below demand now' + reason + '. ' : 'Within the hour you will be up to ' + mwText(thin.mw) + ' short of a safe margin' + reason + '. ';
  }
  if (!nowish) return 'From about ' + needAt(thin, fromS) + ' one trip would leave you short' + reason + '. ';
  return (recentTrip(X.obs) ? 'Another' : 'One') + ' trip now would leave you short' + reason + '. ';
}

// A contingency began within the last quarter of an hour: the desk is still catching it.
function recentTrip(obs) {
  const last = obs.contingencies.length ? obs.contingencies[obs.contingencies.length - 1] : null;
  return !!last && obs.s - last.startS < QUARTER_S;
}

// What carries a gap no start can reach: the battery if it is discharging or has charge to give
// (never one that is charging: it is adding to the load), else the spare on the grid.
function carries(obs) {
  const b = obs.battery;
  if (b.mode === 'discharge' && b.orderMW > 0) return 'the battery carries the gap';
  if (b.mode === 'charge' && !b.fullHold && b.orderMW > 0) return 'the spare on the grid carries the gap';
  return b.socMWh > RESERVE_MWH ? 'the battery and the spare on the grid carry the gap' : 'the spare on the grid carries the gap';
}

// The first second before untilS at which the desk, every unit and the water at their limits, cannot
// cover the forecast (the real check, net of demand response running), or -1.
function realBefore(X, untilS) {
  const R = realShort(X).R, obs = X.obs;
  for (let k = 0; k < R.n; k++) {
    const t = R.fromS + (k + 1) * R.stepS;
    if (t >= untilS) break;
    if (R.gap[k] - (obs.dr.activeS >= t - X.s ? V.DR_MW : 0) >= BATT_MIN_MW) return t;
  }
  return -1;
}

// A unit already on its way (starting, ready or booked), the first to arrive: {name, atS} or null.
function arriving(obs) {
  let best = null;
  const booked = new Map(obs.plan.starts.map(e => [e.unit, e.atS]));
  obs.units.forEach((u, i) => {
    const d = onInS(u, M[i], obs);
    const t = u.mode === 'starting' || u.mode === 'ready' ? obs.s + d : u.mode === 'off' && booked.has(u.id) ? dueS(u, booked.get(u.id)) + u.startToMinS : -1;
    if (t >= 0 && (!best || t < best.atS)) best = {name: unitName(u.id), atS: t};
  });
  return best;
}

// What the desk cannot give even at its limits (capacityGap real), once per line, net of the
// demand response already called (while its hour lasts); <= 0 is spare (instS, nowS: X's, within the hour):
//   soonMW   the largest such shortfall in the next instS: what the battery must carry now (its energy
//            is grid time: an order made earlier is charge the peak will not have)
//   aheadMW  the largest in the nowS after that: an order is sized for it, so the gap does not outgrow it
//            within minutes of the order (an evening ramp adds 100 MW of gap in five)
//   halfMW   the largest in the next half hour (an order is eased only against that)
//   hourMW   the largest within the hour, and hourAtS when it begins (-1: not within the hour)
//   untilS   when the shortfall that begins within the hour ends (-1: none; the window's end if it outlasts it)
//   nowMW    the largest in the columns within nowS, net also of the battery's present discharge order
//   peakMW, mwh   its largest value and its energy over the 4.5-h window
function realShort(X) {
  if (X.real !== undefined) return X.real;
  const obs = X.obs, b = obs.battery, R = capacityGap(obs, obs.forecast, {real: true}), h = R.stepS / S_PER_H;
  const have = b.mode === 'discharge' ? Math.min(b.orderMW, Math.max(0, b.ratedMW - b.guardMW)) : 0;
  let nowMW = -Infinity, soonMW = -Infinity, aheadMW = -Infinity, halfMW = -Infinity, hourMW = -Infinity, peakMW = -Infinity, hourAtS = -1, untilS = -1, open = false, mwh = 0, last = 0;
  for (let k = 0; k < R.n; k++) {
    const lead = R.fromS + (k + 1) * R.stepS - X.s;
    const g = R.gap[k] - (obs.dr.activeS >= lead ? V.DR_MW : 0);
    if (g > 0) mwh += g * h;
    if (g > peakMW) peakMW = g;
    if (lead <= S_PER_H) {
      if (g > hourMW) hourMW = g;
      // (where the gap crosses zero, between this column and the one before)
      if (hourAtS < 0 && g > 0) hourAtS = X.s + lead - (k > 0 && last <= 0 ? R.stepS * g / (g - last) : 0);
      if (lead <= X.instS && g > soonMW) soonMW = g;
      if (lead <= X.instS + X.nowS && g > aheadMW) aheadMW = g;
      if (lead <= S_PER_H / 2 && g > halfMW) halfMW = g;
      if (lead <= X.nowS && g - have > nowMW) nowMW = g - have;
    }
    if (hourAtS >= 0 && untilS < 0) open = true;
    if (open) { if (g > 0) untilS = X.s + lead; else open = false; }
    last = g;
  }
  X.real = {R, nowMW, soonMW, aheadMW, halfMW, hourMW, hourAtS, untilS, peakMW, mwh};
  return X.real;
}

// The battery order that carries x MW with room to spare: the next BATT_AHEAD_STEP_MW step at least BATT_MIN_MW above it.
const carryMW = (b, x) => Math.min(b.ratedMW, Math.ceil((x + BATT_MIN_MW) / BATT_AHEAD_STEP_MW) * BATT_AHEAD_STEP_MW);

// A battery order of `mw` needs that much of the inverter free of the GUARD: the ring setting that
// leaves it room (a GUARD detent), or -1 when the ring is already low enough.
function guardFor(b, mw) {
  const room = Math.floor(Math.max(0, b.ratedMW - mw) / V.GUARD_STEP_MW) * V.GUARD_STEP_MW;
  return b.guardMW > room ? room : -1;
}

// 2. Short right now.
function shortNow(X, line) {
  const obs = X.obs, s = X.s, b = obs.battery;
  const shedding = obs.sec.level === 'SHEDDING' || obs.sec.level === 'SHORT';
  // The plan red within NOW_S is an emergency only if the committed plant cannot close it: the
  // real capacity check (no margin; ramps, water and the tie's limit counted; the battery's order
  // and demand response as they stand) is short there too. (The plan's first column is often red
  // while units are still climbing to a keyframe: 307 MW on a hot evening ramp with 1,400 MW of
  // committed capacity to spare, and frequency at 50.00 Hz.) Or the grid shows it: frequency under
  // the normal band with AGC out of room.
  const sagging = obs.agc.unmetMW > 0 && obs.f.hz < V.NORMAL_LO_HZ;
  const R = realShort(X);
  const planShort = X.redNowMW >= CRIT_MW && R.nowMW > -SHORT_MIN_MW;
  const capShort = shedding && R.nowMW >= SHORT_MIN_MW;
  // X-44: no emergency while the BALANCE bar reads BALANCED (what the battery already gives through
  // AGC carries the plan's red): frequency is held, and a reserve short or a dark district has its own
  // line. The bar shows a 1-s average and AGC hunts under it, so the line reads the gap now against
  // the least shortfall it would name (SHORT_MIN_MW), not the bar's word thresholds.
  if (imbalanceSegments(obs.balance, b).schedMW > -SHORT_MIN_MW && obs.f.hz >= V.NORMAL_LO_HZ) return null;
  if (!planShort && !sagging && !capShort) return null;
  const mw = Math.max(planShort ? X.redNowMW : 0, sagging ? obs.agc.unmetMW : 0, R.nowMW, SHORT_MIN_MW);
  const fast = [];
  // The battery first: it is there in seconds and costs only its wear. Sized to the deficit, from
  // the charge above its reserve; MW held back as GUARD are worth more as power while the desk is
  // short (par's rule 2), so the ring comes down first when the order needs the room.
  // (X-44: never less than it is already giving, its GUARD and droop included)
  const have = Math.max(b.mode === 'discharge' ? b.orderMW : 0, b.outMW > 0 ? b.outMW : 0);
  const want = Math.min(b.ratedMW, Math.ceil((have + mw) / V.GUARD_STEP_MW) * V.GUARD_STEP_MW);
  if (b.socMWh - RESERVE_MWH > want * BATT_MIN_H && want >= have + BATT_MIN_MW) {
    // what the GUARD leaves first (one move, and it is there at once); the ring only when that is used up
    const lim = Math.max(0, b.ratedMW - b.guardMW), now = Math.min(want, Math.floor(lim / V.GUARD_STEP_MW) * V.GUARD_STEP_MW);
    if (now >= have + BATT_MIN_MW) fast.push({id: 'dial-battery', say: 'discharge the battery at ' + mwText(now), action: {type: 'battery', mode: 'discharge', mw: now}});
    else {
      // the ring comes down once for what the hour lacks, not a step for each minute's deficit
      const ring = guardFor(b, Math.max(want, R.hourMW > 0 ? carryMW(b, R.hourMW) : 0));
      fast.push({id: 'ring-guard', say: 'turn the battery GUARD down to ' + ring + ' MW and discharge it', action: {type: 'guard', mw: ring}});
    }
  }
  // One start, for the part of the shortfall it can still reach (lookAhead); never a second for the same gap.
  const A = lookAhead(X);
  if (A && A.unit && A.unit.fromS <= s && A.startBy - s <= X.act) {
    const pick = problemPick(X, A.inTime);   // O-8: in problem mode the lit units, none named
    if (pick) for (const id of pick.ids) fast.push({id, say: id === pick.ids[0] ? 'start one of the ' + pick.ids.length + ' lit units' : '', action: null});
    else fast.push({id: A.unit.id, say: 'start ' + unitName(A.unit.unit) + ' (' + minText(A.unit.lead) + ')', action: {type: 'start', unit: A.unit.unit}});
  }
  // Demand response when neither can answer: a call is dear and there are few.
  if (!fast.length && obs.dr.callsLeft > 0 && !(obs.dr.activeS > 0)) fast.push({id: 'btn-dr', say: 'call demand response (hold D): industry cuts ' + mwText(V.DR_MW) + ' for ' + spanText(V.DR_DURATION_S), action: {type: 'callDR'}});
  // (not "short": the BALANCE bar's word)
  const a = fast.length ? null : arriving(obs);
  let text = fitWhy(why(X, s, null), r => 'The plan is ' + figure(mw) + ' below demand now' + r + (fast.length ? ': ' + fast.map(f => f.say).filter(Boolean).join(', or ') + '.'
    : '. ' + (a ? a.name + ' arrives at ' + at(a.atS) + '; until then ' + carries(obs) + '.' : 'Everything that can help is already on its way.')));
  if (fast.length && fast[0].id === 'dial-battery' && text.length <= 145) text += ' It answers in seconds.';
  return line({level: 'crit', kind: 'short', text, targets: fast.map(f => f.id), action: fast.length ? fast[0].action : null, startBy: s});
}

// 3. Not enough plant committed within the 4.5-h window: the cheapest unit that still makes it.
function commitNow(X, line) {
  const A = lookAhead(X), obs = X.obs, s = X.s;
  if (!A) return null;
  // (every unit that can start now committed: the reserve diesel's line first, unless one back from
  // maintenance arrives for its shortfall; once that is booked the diesel's line follows if still needed)
  const diesel = A.none && A.first.atS - s <= V.FC_HORIZON_S ? reserveDiesel(X, line, A.unit) : null;
  if (diesel || !A.unit) return diesel;
  if (A.reach.atS - s > V.FC_HORIZON_S) return null; // commit-later's
  const c = A.unit, back = c.fromS > s, act = A.startBy - s <= X.act && !back, name = unitName(c.unit);
  // a shortfall that begins before any start can arrive: say what carries it meanwhile, and only
  // a gap the desk really has (the real check), never the margin's
  const late = A.first.atS < A.reach.atS && A.first.endS >= A.reach.atS - X.day.stepS;
  const arriveS = arrival(c), gapS = act ? realBefore(X, arriveS) : -1, fromS = late ? A.first.crossS : A.reach.crossS, reason = why(X, fromS, c);
  const tgt = {level: act ? 'act' : 'plan', kind: 'commit', targets: back ? [] : [c.id], action: act ? {type: 'start', unit: c.unit} : null, startBy: Math.max(s, A.startBy), short: pub(A.reach)};
  const pick = !back ? problemPick(X, A.inTime) : null;   // O-8: the problem, the units lit
  if (pick) return line(Object.assign(tgt, {targets: pick.ids, action: null, problem: act, text: fitWhy(reason, r => shortHead(X, fromS, A.thin, r) + pick.text)}));
  if (late && act && arriveS - A.first.crossS >= RAMP_HEAD_S) {
    // a slow machine for a shortfall it cannot reach (a coal unit for the evening): when it
    // arrives, and what holds the desk until then
    return line(Object.assign(tgt, {text: fitWhy(reason, r => 'Start ' + name + ' now: it reaches the grid at ' + at(arriveS) + ', too late for ' + atMark(A.first.crossS) + r + '. Until then, ' +
      (gapS >= 0 ? 'what the plant cannot give is the battery\'s to carry.' : 'the plant covers the forecast with less spare than it should have.'))}));
  }
  const by = A.reach.crossS - c.plan, when = act ? ' now' : back && mark(by) <= c.fromS ? ' at ' + at(c.fromS) + ', when it is back' : ' by ' + atMark(by);
  return line(Object.assign(tgt, {text: fitWhy(reason, r => shortHead(X, fromS, A.thin, r) + 'Start ' + name + when + ': it takes ' + leadText(c) +
    (gapS >= 0 && c.plan === c.lead ? '; until then ' + carries(obs) : '') + '.')}));
}

// Every unit is committed. What the desk then cannot give even at its limits is the battery's
// and demand response's to carry (shortAhead says so); the reserve diesel only for what is
// beyond them, and only for a shortfall its 20 minutes can still reach.
function reserveDiesel(X, line, back) {
  const obs = X.obs, s = X.s, R = capacityGap(obs, X.day, {real: true});
  const late = firstRun(R, s + V.RERT_LEAD_S, s + V.FC_HORIZON_S);
  if (!late || !beyondReserves(obs, R, late) || (back && arrival(back) <= late.atS)) return null;
  const head = 'You will be ' + figure(hourOf(R, late)) + ' short from ' + atMark(late.crossS) + ', more than the battery and demand response can carry. ';
  if (obs.rert.armed) return line({level: 'crit', kind: 'commit', text: head + (obs.rert.standingDown ? 'The reserve diesel is standing down: it can be armed again once it is off.' : 'The reserve diesel is on its way.'), startBy: s, short: pub(late)});
  // (ACT_WITHIN_S of the profile before its 20 min, no reading lead: it costs by the minute; never past
  // spare()'s stand-down look-ahead, so the two never chase each other)
  const arm = late.atS - s < Math.min(V.RERT_LEAD_S + X.actS, V.PAR_RERT_STANDDOWN_MIN * S_PER_MIN);
  return line({level: 'crit', kind: 'commit', text: head + 'The reserve diesel (hold E) takes 20 min and costs dearly' + (arm ? '.' : ': arm it by ' + atMark(late.crossS - V.RERT_LEAD_S) + '.'),
    targets: ['key-rert'], action: arm ? {type: 'armRERT'} : null, startBy: s, short: pub(late)});
}

// 3b. Every committed MW, the tie at its limit and the water cannot cover the forecast within the
// hour, and no start can reach it: the battery carries it, and demand response what is more than
// the battery holds. (The part of "short" that can still be seen coming: C-10's "discharge when
// the plan is short".) The line says so ahead; the order itself is for the last quarter of an hour
// (energy discharged before the gap is energy the peak will not have), sized to what the plant
// cannot give then, in BATT_AHEAD_STEP_MW steps, and raised only when the gap outgrows it. The
// GUARD comes down once, all the way. While the order covers the gap the line says that the
// battery is carrying it and until when (never "enough plant is committed" over a discharge that
// is all that keeps the lights on).
function shortAhead(X, line) {
  const obs = X.obs, s = X.s, b = obs.battery, R = realShort(X), A = lookAhead(X);
  // a unit can still be started for it: commit-now's (not one back from maintenance only after the gap opens, Q-68)
  if (A && A.unit && !(A.unit.fromS > s && arrival(A.unit) > R.hourAtS)) return null;
  if (!(R.hourMW >= BATT_MIN_MW)) return null;
  const above = b.socMWh - RESERVE_MWH, soon = R.soonMW >= BATT_MIN_MW, have = b.mode === 'discharge' ? b.orderMW : 0;
  const drFree = obs.dr.callsLeft > 0 && !(obs.dr.activeS > 0);
  const fromAt = at(Math.floor(R.hourAtS / AHEAD_MARK_S) * AHEAD_MARK_S), reason = why(X, R.hourAtS, null);
  // While the battery is discharging and no larger order is due yet: one line, the same words
  // whether the gap is open now or later in the hour, so the desk can keep it (never "demand is
  // covered" and "more than ... can give" in turn, never "be ready to discharge" while it is).
  const carrying = () => line({level: 'plan', kind: 'battery', targets: ['dial-battery'], text: fitWhy(reason, r => 'From about ' + fromAt + ' to about ' + at(Math.ceil(R.untilS / AHEAD_MARK_S) * AHEAD_MARK_S) +
    ' demand is more than every committed unit can give' + r + '. The battery is carrying it: leave it discharging.')});
  // ahead: what is coming and what will carry it (no MW: the figure moves with every forecast)
  const ready = more => line({level: 'plan', kind: 'commit', text: fitWhy(reason, r => 'From about ' + fromAt + ' demand is more than every committed unit can give' + r + '. ' +
    (more ? 'The battery and demand response carry it: be ready to call demand response (hold D) then.' : 'The battery carries it: be ready to discharge it then.')),
  targets: more ? ['btn-dr', 'dial-battery'] : ['dial-battery'], startBy: R.hourAtS - X.instS});
  if (!soon) return have > 0 ? carrying() : ready(drFree && (R.mwh > above || R.hourMW > b.ratedMW));
  const head = r => 'Demand is ' + figure(R.soonMW) + ' more than every committed unit can give' + r;
  // More than the battery holds, in MW or in MWh: demand response shares it, called as the gap opens
  // (before the battery's order, not minutes after it; a call is an hour of DR_MW: not spent on a gap
  // that stays under half of that while the battery can still carry it). Judged on the next quarter of
  // an hour; when a battery order is due now, on the NOW_S after that too (aheadMW, as the order is
  // sized), so the call is not made minutes after the order. The call, as the order, waits for instS (§31.8).
  const gapMW = carryMW(b, R.soonMW) > have ? R.aheadMW : R.soonMW;
  const longer = R.mwh > above && gapMW >= V.DR_MW / 2, wider = gapMW > b.ratedMW, empty = !(above > gapMW * BATT_MIN_H);
  if (drFree && (longer || wider || empty)) {
    return line({level: 'act', kind: 'short', text: fitWhy(reason, r => head(r) + ', ' + (wider ? 'more than the battery can give' : empty ? 'and the battery is nearly empty' : 'for longer than the battery lasts') +
      '. Call demand response (hold D): industry cuts ' + mwText(V.DR_MW) + ' for ' + spanText(V.DR_DURATION_S) + '.'), targets: ['btn-dr'], action: {type: 'callDR'}, startBy: s});
  }
  const mw = carryMW(b, R.aheadMW);
  if (carryMW(b, R.soonMW) <= have) return carrying();
  if (!(above > R.soonMW * BATT_MIN_H)) return null;
  // the whole inverter for the evening's gap: the ring comes down once, all the way (as par's rule 2 gives it up)
  if (guardFor(b, mw) >= 0) {
    return line({level: 'act', kind: 'short', text: fitWhy(reason, r => head(r) + '. The battery carries it: turn its GUARD down to 0 MW, then discharge it.'), targets: ['ring-guard', 'dial-battery'],
      action: {type: 'guard', mw: 0}, startBy: s});
  }
  return line({level: 'act', kind: 'short', text: fitWhy(reason, r => head(r) + '. Discharge the battery at ' + mwText(mw) + '.'), targets: ['dial-battery'], action: {type: 'battery', mode: 'discharge', mw}, startBy: s});
}

// S1: an aim within a step of keep (in L's window) stays keep (fc starts off the lattice)
export const stick = (a, keep, L) => (a >= 0 && keep >= L.fromS && keep <= L.toS && Math.abs(a - keep) <= V.FC_STEP_S ? keep : a);
// line o's atS for this lever (a soak: any suburb's, the city's too), else -1
export const cityAim = (o, lever, id) => { const a = o && o.kind === 'city' && o.action; return a && a.lever === lever && (lever === 'soak' || a.suburb === id) ? a.atS : -1; };

// A city line (Q-59; §31.8).
function city(X, line, x, lever, atS, head, tail) {
  const soak = lever === 'soak', by = soak ? atS : atS - V.PRECOOL_S, lv = X.obs.levers;
  return line({level: by - X.s <= X.act ? 'act' : 'plan', kind: 'city', targets: ['suburb-' + x.id], action: {type: 'flex', suburb: x.id, lever, atS}, startBy: by,
    text: head + (soak ? 'Book a HOT WATER SOAK in ' : 'Book an AIR-CON CYCLE in ') + (SCENARIOS[X.obs.scenarioId] || SCENARIOS.classic).city.suburbs[lv.suburbs.indexOf(x)].name + ', ' + at(atS) + '–' +
      at(atS + (soak ? V.SOAK_S : V.AIRCON_S)) + ' (' + Math.round(x[lever].mw) + ' MW): ' + tail});
}

// Free suburbs, the most MW first.
const freeFor = (lv, lever) => lv.suburbs.filter(x => x[lever].block === '').sort((a, c) => c[lever].mw - a[lever].mw);

// 3c. AIR-CON CYCLE (§31.8).
function aircon(X, line) {
  const A = lookAhead(X), b = X.obs.battery, lv = X.obs.levers, free = freeFor(lv, 'aircon');
  if (!free.length || (A && A.unit) || realShort(X).soonMW >= BATT_MIN_MW) return null;
  const R = capacityGap(X.obs, X.day, {real: true}), h = R.stepS / S_PER_H;
  const held = (X.s < CHARGE_BY_S ? Math.max(b.socMWh, CHARGE_TO_MWH) : b.socMWh) - RESERVE_MWH;
  for (const x of free) {
    const atS = stick(aimFlex(X.day, lv, x.id, 'aircon'), cityAim(X.held, 'aircon', x.id), x.aircon);
    for (let run, from = atS < 0 ? Infinity : x.aircon.fromS; (run = firstRun(R, from)); from = run.endS + R.stepS) {
      let pre = 0, topS = 0, mwh = 0;
      for (let k = 0; k < R.n; k++) {
        const t = R.fromS + (k + 1) * R.stepS, g = R.gap[k];
        if (t >= atS - V.PRECOOL_S && t <= atS && g > 0) pre = 1;
        if (t >= run.atS && t <= run.endS) { mwh += g * h; if (g === run.mw && !topS) topS = t; }
      }
      if (!pre && topS >= atS && topS <= atS + V.AIRCON_S && (run.mw > b.ratedMW || mwh > held)) {
        return city(X, line, x, 'aircon', atS, 'From about ' + atMark(run.crossS) + ' committed units fall short. ',
          'pre-cool from ' + at(atS - V.PRECOOL_S) + '; ' + Math.round(100 * V.SNAPBACK_FRAC) + '% of the relief comes back after.');
      }
    }
  }
  return null;
}

// A run as the line carries it (the public shape of capacityShort).
const pub = run => ({atS: run.atS, endS: run.endS, mw: run.mw});

// The largest gap in the first hour of a run: the figure a line gives (not the evening's peak hours later).
function hourOf(G, run) {
  let mw = 0;
  for (let k = 0; k < G.n; k++) {
    const t = G.fromS + (k + 1) * G.stepS;
    if (t >= run.atS && t <= Math.min(run.endS, run.atS + S_PER_H) && G.gap[k] > mw) mw = G.gap[k];
  }
  return mw;
}

// Is a shortfall (a run of the real gap R) beyond what demand response (its calls left, and the
// one running) and the battery (its whole inverter: the GUARD comes down when the desk is short;
// its charge above the reserve) can carry, in MW or in MWh? PAR_RERT_MARGIN_MW of margin, as par's
// rule 8. Demand response first, while it has hours: the use of the two that lasts longest. frac:
// the share of their energy counted (the diesel is armed against all of it and stood down only
// when half would do: the band that keeps the two from chasing each other).
function beyondReserves(obs, R, run, frac = 1) {
  const b = obs.battery, h = R.stepS / S_PER_H;
  let battE = frac * Math.max(0, b.socMWh - RESERVE_MWH), drE = frac * V.DR_MW * (obs.dr.callsLeft * V.DR_DURATION_S + Math.max(0, obs.dr.activeS)) / S_PER_H;
  for (let k = 0; k < R.n; k++) {
    const t = R.fromS + (k + 1) * R.stepS;
    if (t < run.atS || t > run.endS) continue;
    const need = R.gap[k] + V.PAR_RERT_MARGIN_MW;
    if (need <= 0) continue;
    const fromDr = Math.min(need, drE > 0 ? V.DR_MW : 0), fromBatt = Math.min(need - fromDr, battE > 0 ? b.ratedMW : 0);
    if (fromBatt + fromDr < need - 1) return true;
    battE -= fromBatt * h; drE -= fromDr * h;
  }
  return false;
}

// What a feeder under repair picks up at its return (MW): its cold load now, with the forecast's underlying demand then.
function pickupMW(X, d) {
  const fc = X.day, now = X.obs.demand.underlyingMW, k = clamp(Math.ceil((d.clearS - fc.fromS) / fc.stepS) - 1, 0, fc.n - 1);
  return d.coldLoadMW * (fc.n && fc.underlyingP50 && now > 0 ? fc.underlyingP50[k] / now : 1);
}
// 4. Dark districts, once supply is in hand: the line speaks when one is the desk's (a task feeder
// before its clearS is the network's, Q-69) and counts every dark one, as the bay and the map do.
function restore(X, line) {
  const obs = X.obs, all = obs.districts.filter(d => d.dark), held = all.filter(d => heldAt(d, X.s)), dark = all.filter(d => !heldAt(d, X.s));
  if (!dark.length) return null;
  const n = all.length + (all.length === 1 ? ' district is' : ' districts are') + ' dark' +
    (held.length ? ' (' + held.map(d => d.id).join(', ') + ' under repair until ' + held.map(d => at(d.clearS)).join(', ') + ')' : '');
  // (desk/bay.js R's choice: a feeder handed back first, the latest first; Q-91's card holds the clock for it)
  const lit = dark.filter(d => d.restoreBlock === ''), ok = lit.filter(d => d.shedBy === 'task').sort((a, b) => b.clearS - a.clearS)[0] || lit[0];
  if (ok) return line({level: 'act', kind: 'restore', text: n + ' and the permissive lamp is lit. Close a feeder: R, then Enter.', targets: ['bay-restore'], action: {type: 'restore', district: ok.id}, startBy: X.s});
  return line({level: 'plan', kind: 'restore', text: n + '. A feeder closes once frequency is steady and there is spare reserve to carry it.', targets: ['bay-restore', 'gauge-n1']});
}

// 2b. HAND (X-43): a machine at full speed with no synchroscope open asks for its SYNC, at once (the
// plan and every "on by" time count it as made now).
function syncNow(X, line) {
  const obs = X.obs;
  if (obs.mode !== 'HAND' || obs.scope && obs.scope.open) return null;
  const u = obs.units.find(x => x.mode === 'ready');
  if (!u) return null;
  return line({level: 'act', kind: 'sync', text: unitName(u.id) + ' is at full speed. HAND has no auto-sync: press its START to open the synchroscope, then SYNC.',
    targets: ['guard-start-' + u.id, 'bay-sync'], action: {type: 'scope', unit: u.id}, startBy: X.s});
}

// A contingency began within the last `spanS` grid seconds (X-43: "after the trip" needs one).
const tripWithin = (obs, spanS) => obs.contingencies.some(c => obs.s - c.startS < spanS);

/** The fired GUARD's line while frequency is high ("after the trip" only when there was one, X-43). */
export const guardStillText = obs => 'Frequency is high: the battery GUARD is still giving its ' + mwText(obs.battery.ffrMW) +
  (tripWithin(obs, S_PER_H) ? ' after the trip' : ' since frequency fell') + '. Turn it down to 0 MW; it can go back up once the GUARD has re-armed.';

// 5. Enough power, not enough spare: the GUARD for the first second, a fast machine for the minutes
// (par's rule 2, sim/autopilot.js). And the reserve diesel stood down once the desk holds without it.
function spare(X, line) {
  const obs = X.obs, s = X.s, sec = obs.sec, b = obs.battery, r = obs.rert;
  // After a trip the fired GUARD gives its whole ring for GUARD_SUSTAIN_S whatever the frequency
  // does. A belly trip is smaller than the ring (a coal machine at minimum is 240 MW), so the
  // frequency overshoots and stays above the normal band: the ring comes down (par's rule 2 gives
  // it up the same way), and is not raised again while the fired GUARD is still sustaining (a ring
  // raised then delivers again at once).
  if (b.guardFired && b.guardMW > 0 && b.ffrMW > 0 && obs.f.hz > V.NORMAL_HI_HZ) {
    return line({level: 'act', kind: 'spare', text: guardStillText(obs), targets: ['ring-guard'], action: {type: 'guard', mw: 0}, startBy: s});
  }
  if (r.armed && !r.standingDown) {
    // Clean without it for PAR_RERT_STANDDOWN_MIN ahead (nothing in that time that the battery and
    // demand response could not carry): at $16,000 a MWh it goes first.
    const until = s + V.PAR_RERT_STANDDOWN_MIN * S_PER_MIN;
    const R = capacityGap(obs, X.day, {real: true, rert: false});
    const run = firstRun(R, -Infinity, until);
    if (!(run && beyondReserves(obs, R, run, RERT_STANDDOWN_FRAC)) && X.redNowMW < SHORT_MIN_MW && sec.level !== 'SHEDDING') {
      return line({level: 'act', kind: 'spare', text: 'The desk holds without the reserve diesel for the next ' + V.PAR_RERT_STANDDOWN_MIN + ' min. Stand it down (hold E): it costs ' +
        usdText(V.RERT_MW * V.RERT_COST / S_PER_MIN) + ' a minute.', targets: ['key-rert'], action: {type: 'standDownRERT'}, startBy: s});
    }
  }
  // The GUARD at its most: as far as the battery can sustain it, and never into MW an order is using
  // (the ring takes from what the dial may ask for). Never while the plant is short within the hour
  // (the MW are wanted as power), nor while the GUARD is fired (a ring raised during its sustain
  // delivers at once), nor on a stale preview (sec.dirty: an input since it was made; with the clock
  // held it stays stale until Space).
  const guardTo = () => {
    if (sec.lKind === 'none' || sec.dirty || b.guardFired || !(realShort(X).hourMW < BATT_MIN_MW)) return -1;
    const order = b.mode === 'idle' || b.fullHold ? 0 : b.orderMW;
    let mw = V.PAR_GUARD_MAX_MW;
    while (mw > b.guardMW && (b.socMWh < mw * GUARD_SUSTAIN_H || mw > b.ratedMW - order)) mw -= V.PAR_GUARD_STEP_MW;
    return mw > b.guardMW ? mw : -1;
  };
  // Back up once it has re-armed, within the hour of a loss of supply that took the ring to 0 (the
  // release above): the next trip should find it, not wait for the gauge to go insecure first.
  const last = obs.contingencies.length ? obs.contingencies[obs.contingencies.length - 1] : null;
  if (b.guardMW === 0 && last && last.cause !== 'load' && s - last.startS < S_PER_H) {
    const mw = guardTo();
    if (mw > 0) {
      return line({level: 'plan', kind: 'spare', text: 'After the trip the battery GUARD is at 0 MW. Raise it to ' + mw + ' MW: it catches the fall in the first second if anything else trips.',
        targets: ['ring-guard'], action: {type: 'guard', mw}, startBy: s});
    }
  }
  if (sec.level === 'SECURE') return null;
  // With districts dark, also what the smallest picks up: a feeder under repair at its return, once that is within the act window.
  let pickup = Infinity;
  for (const d of obs.districts) if (d.dark && !(heldAt(d, s) && d.clearS - s > X.act)) pickup = Math.min(pickup, heldAt(d, s) ? pickupMW(X, d) : d.coldLoadMW);
  if (!(pickup < Infinity)) pickup = 0;
  const what = sec.lKind === 'link' ? 'the tie line' : 'your biggest unit';
  // Seconds: the trip preview dips under the secure line. The GUARD is the answer, as far as the
  // battery can sustain it: one line, for the most it can hold (each step is worth less than the one
  // before, so a line sized on one step's worth asks again a minute later).
  if (sec.previewNadirHz < SECURE_HZ) {
    const mw = guardTo();
    if (mw > 0) {
      return line({level: 'act', kind: 'spare', text: 'If ' + what + ' tripped now, frequency would fall to ' + sec.previewNadirHz.toFixed(2) + ' Hz: too low to be secure. Raise the battery GUARD to ' + mw +
        ' MW: it catches the fall in the first second.', targets: ['gauge-n1', 'ring-guard'], action: {type: 'guard', mw}, startBy: s});
    }
  }
  // Minutes (par's rule 2): spare in 5 minutes under PAR_TIGHT_RATIO x the biggest risk, or a preview
  // under PAR_NADIR_MIN_HZ with the GUARD already up: a fast machine (hydro spins for free; then the
  // cheapest gas turbine that restores it); or under the pickup (above).
  const needMW = Math.max(V.PAR_TIGHT_RATIO * sec.lMW, pickup) - sec.r5MW;
  if (!(needMW > 0) && !(sec.lKind !== 'none' && sec.previewNadirHz < V.PAR_NADIR_MIN_HZ)) return null;
  // (one at a time: not while a machine is within a quarter of an hour of the grid)
  const coming = obs.units.some((u, i) => { const d = u.mode === 'loading' ? u.timerS : onInS(u, M[i], obs); return d > 0 && d <= QUARTER_S; });
  if (!coming) {
    const fastOnes = startable(obs).filter(c => c.lead <= V.STACK_START_WITHIN_S + syncOf(obs)).map(c => {
      const u = obs.units.find(x => x.id === c.unit);
      return Object.assign(c, {offer: u.offer, headMW: Math.min(u.availMW - u.minMW, u.rampMWMin * V.R5_WINDOW_MIN)});
    }).sort((a, c) => a.offer - c.offer || a.lead - c.lead);
    const c = fastOnes.find(x => x.headMW >= needMW) || fastOnes[0];
    const enough = fastOnes.filter(x => x.headMW >= needMW), pick = c ? problemPick(X, enough.length ? enough : fastOnes) : null;
    if (pick) {   // O-8: the problem, the fast units lit
      return line({level: 'act', kind: 'spare', text: 'Demand is covered, but if ' + what + ' tripped the rest could not make it up in time. ' + pick.text,
        targets: ['gauge-n1', ...pick.ids], action: null, problem: true, startBy: s});
    }
    if (c) {
      const free = c.cls === 'hydro', A = lookAhead(X);
      // the unit the commit line was about to ask for anyway: both reasons in one line, so "now" and
      // "by 17:45" for the same machine do not take turns
      if (A && A.unit && A.unit.unit === c.unit && A.reach.atS - s <= V.FC_HORIZON_S) {
        return line({level: 'act', kind: 'spare', text: fitWhy(why(X, A.reach.crossS, c), r => 'Start ' + unitName(c.unit) + ' now (' + minText(c.lead) + '): spare is short already, and ' +
          (A.thin.real ? 'you will be ' + mwText(A.thin.mw) + ' short from ' + needAt(A.thin, A.reach.crossS) : 'from about ' + needAt(A.thin, A.reach.crossS) + ' one trip would leave you short') + r + '.'),
        targets: ['gauge-n1', c.id], action: {type: 'start', unit: c.unit}, startBy: s});
      }
      return line({level: 'act', kind: 'spare', text: 'Demand is covered, but if ' + what + ' tripped the rest could not make it up in time. Start ' + unitName(c.unit) + ' (' + minText(c.lead) + ')' +
        (free ? ': it spins for free and adds spare.' : ' for the spare.'), targets: ['gauge-n1', c.id], action: {type: 'start', unit: c.unit}, startBy: s});
    }
  }
  const a = coming ? arriving(obs) : null;
  // (with the battery discharging into a gap, demand is covered because it is)
  const covered = b.mode === 'discharge' && b.orderMW > 0 ? 'With the battery discharging, demand is covered' : 'Demand is covered';
  return line({level: 'plan', kind: 'spare', text: covered + ', but losing ' + what + ' would not be caught' + (a ? ' until ' + a.name + ' arrives at ' + at(a.atS) + '.' : '. Nothing more can add spare now.'),
    targets: ['gauge-n1', 'ring-guard']});
}

// 5b. Within PICKUP_AHEAD_S of a hand-back, no feeder yet the desk's: the spare to hold for its cold
// load at its return (pickupMW, to the 10 MW: a few MW of drift moves it 10 MW, never a 50-MW step). Said after spare()'s own line, before commitLater's "Next";
// the spare gauge glows, never the bay, whose tab glows with Q-91's feeder card at the hand-back (§31.8).
function pickupAhead(X, line) {
  const all = X.obs.districts.filter(d => d.dark);
  if (all.some(d => !heldAt(d, X.s))) return null;
  const d = all.reduce((a, x) => (!a || x.clearS < a.clearS ? x : a), null);
  if (!d || d.clearS - X.s > PICKUP_AHEAD_S) return null;
  return line({level: 'plan', kind: 'restore', text: d.id + '\'s feeder is back at ' + at(d.clearS) + ': hold ' + mwText(pickupMW(X, d)) + ' of spare for its pickup.', targets: ['gauge-n1'], startBy: d.clearS});
}

/** The dearest committed gas unit (§21.4): CCGT or GT, on, coming or booked; ties: the highest index. Never coal, never hydro. */
export function stopCandidate(obs) {
  const booked = new Set(obs.plan.starts.map(e => e.unit));
  let best = null;
  obs.units.forEach((u, i) => {
    if (!GAS.has(u.cls)) return;
    if (onInS(u, M[i], obs) < 0 && !(u.mode === 'off' && booked.has(u.id))) return;
    if (!best || u.offer >= best.offer) best = u;
  });
  return best;
}

// 6. A gas unit that is not needed for long enough to be worth stopping (§21.4).
function stop(X, line) {
  const obs = X.obs, s = X.s, u = stopCandidate(obs);
  if (!u || u.mode !== 'on' || u.stopBlock !== '') return null;
  const m = M.find(x => x.id === u.id), sec = obs.sec;
  // one at a time: nothing on its way down, nothing stopped in the last STOP_GAP_S
  if (obs.units.some(x => x.mode === 'unloading' || x.mode === 'shutdown' || (x.mode === 'off' && x.downForS >= 0 && x.downForS < STOP_GAP_S))) return null;
  // (3) at its floor
  if (u.outMW > u.minMW + STOP_FLOOR_MW) return null;
  // (2) the desk stays SECURE without its 5-minute headroom
  const head = Math.max(0, Math.min(u.availMW - u.outMW, u.rampMWMin * V.R5_WINDOW_MIN));
  if (sec.level !== 'SECURE' || sec.r5MW - head < V.SECURE_RATIO * sec.lMW) return null;
  // (1) not needed until it could be back, and an hour more: capacityShort without it, the margin
  // MARGIN_MW + the largest remaining single loss, and the water held for the evening until
  // PAR_WATER_HOLD_UNTIL_H as the look-ahead holds it (the dispatch keeps it; a trip in the morning
  // with the unit off is made up by starts, not by the evening's water). Heat is news from 04:00 (Q-80).
  const unloadS = Math.max(0, u.outMW - u.minMW) / m.rampMWs;
  const W = unloadS + m.t4S + m.minDownS + u.startToMinS + STOP_CLEAR_S;
  const n1 = {marginMW: MARGIN_MW + largestLoss(obs, u.id), without: u.id};
  if (firstRun(capacityGap(obs, X.day, n1), -Infinity, s + W)) return null;
  const {need, saving} = stopQuote(obs, u, X.day, X.proj, X.PV, X.endS);
  // (4) worth it; at MSL2 and MSL3 the unit at minimum is in the way and the saving is not the point
  const msl = obs.msl && obs.msl.level >= 2;
  if (!msl && saving < STOP_MIN_SAVING) return null;
  const name = unitName(u.id);
  const until = need ? 'is not needed until ' + atMark(need.crossS) : 'is not needed again today';
  const again = need ? ' Start it again by ' + atMark(Math.max(s + unloadS + m.t4S + m.minDownS, need.crossS - u.startToMinS)) + '.' : '';
  // (a gas turbine was likely started for spare: condition 2 is why it can go now). A saving with a
  // restart in it rests on the day going as forecast: a trip while the unit is off is made up with
  // dearer starts (measured on hot days: a stop quoted at $36,000 realised -$52,000 and -$90,000).
  const spareOk = u.cls === 'ocgt' ? 'Spare holds without it now: ' : '';
  const text = msl ? 'Demand is falling under what the running units must make. Stop ' + name + ': it ' + until + '.' + again
    : spareOk + name + ' ' + until + '. Stop it: saves about ' + usdText(saving) + ', carbon included' + (need ? ', if nothing trips before then' : '') + '.' + again;
  return line({level: msl ? 'act' : 'plan', kind: 'stop', text, targets: ['guard-stop-' + u.id], action: {type: 'stop', unit: u.id}, startBy: s, saving});
}

/**
 * A STOP's quote, as the line and its "? IF PRESSED" both say it (§21.4 condition 4; Q4, W7): need, the first shortfall at
 * the commit margin without unit u (when the line will ask for it back; from endS, a night scenario's 21:00, the night
 * shift's: none), backS, the second it is started again for it (Infinity: not today), and saving, stopSaving's dollars.
 */
export function stopQuote(obs, u, day, proj, PV, endS = Infinity) {
  const m = M.find(x => x.id === u.id), unloadS = Math.max(0, u.outMW - u.minMW) / m.rampMWs;
  let need = firstRun(tripGap(obs, day, COMMIT_TRIP_MW, {without: u.id}));
  let backS = need ? Math.max(obs.s + unloadS + m.t4S + m.minDownS, need.atS - u.startToMinS) : Infinity;
  if (backS >= endS) { need = null; backS = Infinity; }
  return {need, backS, saving: stopSaving(obs, u, backS, day, proj, PV)};
}

// 7. The battery (§21.4): charge on what would be spilled or at a price of $0 or less; charge before
// the evening when the evening needs it; discharge in the evening when gas sets the price; idle at
// the reserve. An order is made from idle and then only raised (a charge by what is still spilled,
// or when it has fallen behind its hour), eased once when it is far above what the evening needs,
// and ended at the reserve, when full, or when its reason is gone: bands between the levels that
// start and end it, never a clock. It works inside what the GUARD leaves (the ring is the spare
// branch's, and shortAhead's).
function battery(X, line) {
  const obs = X.obs, s = X.s, b = obs.battery, proj = X.proj;
  const lim = Math.max(0, b.ratedMW - b.guardMW), step = V.GUARD_STEP_MW;
  const charging = b.mode === 'charge' && !b.fullHold && b.orderMW > 0, discharging = b.mode === 'discharge' && b.orderMW > 0;
  const evening = s >= DIS_FROM_S && s < DIS_TO_S, above = b.socMWh - RESERVE_MWH;
  const say = (text, action) => line({level: 'plan', kind: 'battery', text, targets: ['dial-battery'], action, startBy: s});
  const idle = text => say(text, {type: 'battery', mode: 'idle', mw: 0});
  // What the plant cannot give, every committed MW and the tie at their limits, within the hour
  // and in the next quarter of an hour (shortAhead orders the discharge for that); and the rate
  // that lasts the evening.
  const needMW = realShort(X).hourMW;
  const spreadMW = evening ? above / (Math.max(V.FC_STEP_S, DIS_TO_S - s) / S_PER_H) : 0;

  if (discharging) {
    // IDLE again at the reserve; outside the evening, once the plant covers demand without it.
    if (above <= 0) return idle('The battery is down to ' + pctText(b) + '. Set it to idle: the rest is for the first seconds after a trip.');
    if (!evening && needMW < -SHORT_MIN_MW) {
      return idle(s >= DIS_TO_S ? 'The evening is over. Set the battery to idle: what is left is for the first seconds after a trip.'
        : 'The gap is closed. Set the battery to idle and keep its charge for the evening.');
    }
    // In the evening an order far above what the plant needs from it now is eased (to a step
    // above that need, so a small rise does not ask for it back), so the charge lasts the peak.
    // (not when the reserve would end it within a quarter of an hour anyway: one order, not two)
    const want = carryMW(b, Math.max(realShort(X).halfMW, spreadMW, 0) + BATT_AHEAD_STEP_MW);
    if (evening && b.orderMW >= want + BATT_EASE_MW && above / want > QUARTER_S / S_PER_H) {
      return say('The battery is giving more than the desk needs from it. Ease it to ' + mwText(want) + ', so its charge lasts the peak.', {type: 'battery', mode: 'discharge', mw: want});
    }
    return null;
  }
  const have = charging ? Math.min(b.orderMW, lim) : 0;
  if (charging && needMW + have > 0) {
    // the plant cannot carry the charge as well: it waits
    return idle('The running units cannot carry the charge as well as demand. Set the battery to idle.');
  }

  if (!evening) {
    // CHARGE on what is, or is about to be, spilled, or at a price of $0 or less: free power.
    const spillNow = obs.wind.autoMW + obs.solar.autoMW;
    let spillAhead = 0;
    for (let k = 0; k < proj.n && proj.times[k] - s <= X.nowS; k++) if (proj.surplusMW[k] > spillAhead) spillAhead = proj.surplusMW[k];
    // from idle, not within 1% of full (a band: a full battery AGC has nibbled is not ordered again)
    const room = b.socMWh < b.capMWh * (charging ? 1 : 1 - BATT_BAND / 5) - V.BATT_FULL_EPS_MWH;
    const spilled = spillNow > V.SURPLUS_MIN_MW || spillAhead > V.SURPLUS_MIN_MW, cheap = obs.price.mwh <= 0;
    // (not while the GUARD is fired: the MW its ring gave up after the trip are the GUARD's again
    // once it re-arms, and a charge made in them is raised minute after minute on a cut that lags)
    if (room && !b.guardFired && (spilled || (cheap && !charging))) {
      // the order already made plus what is still being spilled (the cut is net of the order); at a
      // price of $0 or less with nothing spilled, what the GUARD leaves and the plant can carry
      const free = spilled ? have + Math.max(spillNow, charging ? 0 : spillAhead) : plantSpareMW(X);
      const mw = Math.floor(Math.min(lim, V.PAR_BATT_CHARGE_MAX_MW, free) / step) * step;
      if (mw >= have + step) {
        return say(spilled ? 'Power is being spilled' + (cheap ? ' and the price is ' + priceText(obs.price.mwh) : '') + '. Charge the battery at ' + mwText(mw) +
          ': it takes what would be wasted, and tonight that is worth gas prices.'
          : 'The price is ' + priceText(obs.price.mwh) + '. Charge the battery at ' + mwText(mw) + ': power costs nothing now and is worth gas prices tonight.', {type: 'battery', mode: 'charge', mw});
      }
    }
    // CHARGE before the evening when the evening needs it (an N-1 look at the evening without the
    // battery): to be full by 15:30; until a quarter of an hour before the evening, topped up from
    // 1% under full (AGC draws on a full battery while the units' own bands are thin). An order that
    // has fallen behind is raised. Not within a quarter of an hour of a trip: the desk is catching
    // it, and an order made then is one the next minutes take back. (None in the last quarter of an
    // hour before the evening: the evening's own order follows within QUARTER_S.)
    const calm = !recentTrip(obs);
    const late = s >= CHARGE_BY_S - ACT_WITHIN_S; // (a band in grid time, not a reaction: not spanAt's)
    if (calm && s >= CHARGE_FROM_S && s < DIS_FROM_S - QUARTER_S && (charging || b.socMWh < (late ? b.capMWh * (1 - BATT_BAND / 5) : CHARGE_TO_MWH)) && room && eveningNeeds(X)) {
      const by = late ? DIS_FROM_S : CHARGE_BY_S;
      const hours = Math.max(V.FC_STEP_S, by - s) / S_PER_H;
      let mw = Math.min(lim, V.PAR_BATT_CHARGE_MAX_MW, Math.max(BATT_MIN_MW, (b.capMWh - b.socMWh) / V.BATT_CHARGE_EFF / hours));
      mw = Math.floor(Math.min(mw, plantSpareMW(X)) / 10) * 10;
      if (mw >= have + BATT_MIN_MW && X.redNowMW < SHORT_MIN_MW) {
        return say(charging ? 'The battery is at ' + pctText(b) + ', behind the rate that fills it by ' + at(by) + '. Charge it at ' + mwText(mw) + ': tonight\'s peak will want it.'
          : 'The battery is at ' + pctText(b) + '. Charge it at ' + mwText(mw) + ' now, to be full by ' + at(by) + ': tonight\'s peak will want it.', {type: 'battery', mode: 'charge', mw});
      }
    }
    if (charging) {
      // the overnight charge ends at the reserve (nothing tonight is worth more than coal's price)
      if (s >= DIS_TO_S && above >= 0 && !(spillNow > V.SURPLUS_MIN_MW) && obs.price.mwh > 0) return idle('The battery is back at ' + pctText(b) + '. Set it to idle.');
      return null;
    }
    // Overnight: a battery under its reserve is charged back to it while nothing is short, so the
    // first seconds after a trip are covered (par's rule 6).
    if (s >= DIS_TO_S && above < -BATT_BAND * b.capMWh && needMW < -SHORT_MIN_MW - V.PAR_BATT_CHARGE_MAX_MW) {
      const mw = Math.floor(Math.min(lim, V.PAR_BATT_CHARGE_MAX_MW) / step) * step;
      if (mw >= BATT_MIN_MW) return say('The battery is down to ' + pctText(b) + '. Charge it back to ' + Math.round(100 * V.PAR_BATT_RESERVE_FRAC) + '% at ' + mwText(mw) + ': it is the first to answer a trip.', {type: 'battery', mode: 'charge', mw});
    }
    return null;
  }

  // DISCHARGE in the evening while gas sets the price, down to the reserve (from a charge still
  // running, too: one order, never idle first).
  const gas = gasSetsPrice(obs), price = '$' + Math.round(obs.price.mwh - obs.price.adder), keep = Math.round(100 * V.PAR_BATT_RESERVE_FRAC) + '%';
  if (above > BATT_BAND * b.capMWh && gas) {
    const mw = Math.floor(Math.min(lim, spreadMW) / 10) * 10;
    if (mw >= BATT_MIN_MW) {
      return say('Gas is setting the price (' + price + '). Discharge the battery at ' + mwText(mw) + (mw < spreadMW - 10 ? ', all the GUARD leaves free, down to ' + keep + ': the rest is kept for a trip.'
        : ': it lasts to ' + at(DIS_TO_S) + ' and keeps ' + keep + ' for a trip.'), {type: 'battery', mode: 'discharge', mw});
    }
  }
  // A charge still running into the evening tops the battery up while coal sets the price (it holds
  // at full); once gas sets it, the charge would be buying gas, and it ends.
  if (charging && gas) return idle('Gas is setting the price (' + price + '). Set the battery to idle: charging now buys gas.');
  return null;
}

// What the committed plant can carry on top of demand in the coming hour (MW): the planning check's
// smallest spare. A charge order is never more than this.
function plantSpareMW(X) {
  const G = capacityGap(X.obs, X.obs.forecast, {marginMW: MARGIN_MW});
  let spareMW = Infinity;
  for (let k = 0; k < G.n && (k + 1) * G.stepS <= S_PER_H; k++) spareMW = Math.min(spareMW, -G.gap[k]);
  return spareMW;
}

// Does the evening need the battery? It does when, without it, the committed plant could not lose
// its largest unit at some time in the evening window and still cover the forecast.
function eveningNeeds(X) {
  const obs = X.obs;
  const G = capacityGap(obs, X.day, {marginMW: MARGIN_MW + largestLoss(obs, '')});
  for (let k = 0; k < G.n; k++) {
    const t = G.fromS + (k + 1) * G.stepS;
    if (t >= DIS_FROM_S && t < DIS_TO_S && G.gap[k] > 0) return true;
  }
  return false;
}

// A gas unit (or something dearer: water, demand response) is the marginal offer, the scarcity adder left out.
function gasSetsPrice(obs) {
  const u = obs.units.find(x => x.id === obs.price.marginalId);
  if (u) return GAS.has(u.cls) || u.station === 'hydro';
  return obs.price.mwh - obs.price.adder >= V.STATIONS.ccgt.offer;
}

// 7b. HOT WATER SOAK (§31.8): free suburbs aim alike.
function soak(X, line) {
  const obs = X.obs, b = obs.battery, P = X.proj, d = obs.forecast.demandP50, free = freeFor(obs.levers, 'soak'), h = FC_MARK_S / S_PER_H;
  const atS = free.length ? stick(aimFlex(X.day, obs.levers, free[0].id, 'soak'), cityAim(X.held, 'soak'), free[0].soak) : -1, back = obs.tie.tripped ? X.s + obs.tie.lockoutS : -1;
  if (atS < 0) return null;
  const top = Math.min(b.ratedMW - b.guardMW, V.PAR_BATT_CHARGE_MAX_MW);
  let lo = -1, m = Infinity, ex = 0, room = (b.capMWh - b.socMWh) / V.BATT_CHARGE_EFF;
  for (let k = 0; k < P.n; k++) {
    const t = P.times[k], sp = P.surplusMW[k], c = P.charging[k], take = Math.max(0, Math.min(sp > V.SURPLUS_MIN_MW ? Math.max(top, c) : c, sp + c, room / h));
    const u = d[k] - (t <= back ? V.MSL_TIE_OUT_MW : 0);
    room -= take * h;
    if (t > atS && t < atS + V.SOAK_S) ex = Math.max(ex, sp + c - take);
    if (t >= V.SOAK_FROM_S && t <= V.SOAK_TO_S && u < m) { lo = k; m = u; }
  }
  const msl = obs.msl.level > 0 && obs.msl.atS > X.s && m <= V.MSL1_MW + V.MSL_CLEAR_MW;
  if (!msl && !(ex > V.SURPLUS_MIN_MW)) return null;
  const head = msl ? 'MSL' + obs.msl.level + ': demand falls to about ' + figure(d[lo]) + ' at ' + atMark(P.times[lo]) + '. ' : 'The battery cannot take all of noon\'s spill. ';
  const tail = (msl ? 'it lifts the low' : 'tanks take the rest') + '; tonight\'s heating falls by as much.';
  if (free.length === 1) return city(X, line, free[0], 'soak', atS, head, tail);
  // Q1 (W7): the city's, one booking for every free suburb (a distributor's ripple control: one signal)
  const lv = obs.levers, mw = Math.round(free.reduce((a, x) => a + x.soak.mw, 0));
  const who = free.length === lv.suburbs.length ? 'the city\'s HOT WATER SOAK' : 'the HOT WATER SOAK in the other ' + free.length + ' suburbs';
  const say = t => head + 'Book ' + who + ', ' + at(atS) + '–' + at(atS + V.SOAK_S) + ' (' + commas(mw) + ' MW): ' + t;
  const text = say(tail).length <= LINE_MAX_CHARS ? say(tail) : say(tail.slice(0, tail.indexOf(';')) + '.');
  return line({level: atS - X.s <= X.act ? 'act' : 'plan', kind: 'city', targets: free.map(x => 'suburb-' + x.id), startBy: atS, text,
    action: {type: 'soakCity', lever: 'soak', atS, suburbs: free.map(x => x.id)}});
}

/** Q1 (W7): the sim inputs a line's action stands for: SOAK THE CITY's one flex input per suburb it names; any other action, itself. */
export const inputsOf = a => (a && a.type === 'soakCity' ? a.suburbs.map(suburb => ({type: 'flex', suburb, lever: 'soak', atS: a.atS})) : [a]);

// 8. A shortfall beyond the 4.5-h window: what to start next, and by when.
function commitLater(X, line) {
  const A = lookAhead(X);
  if (!A || !A.unit) return null;
  const c = A.unit;
  // (until then nothing is short, margin included: the hours with nothing to do are said to be so)
  const tail = A.first.atS - X.s > V.FC_HORIZON_S && leadText(c).length < 30 ? '; until then the plant you have covers the forecast' : '';
  // (a unit out for maintenance: from its return, Q-68)
  const by = A.reach.crossS - c.plan, when = c.fromS > X.s && mark(by) <= c.fromS ? ' at ' + at(c.fromS) + ', when it is back,' : ' by ' + atMark(by);
  const pick = problemPick(X, A.inTime);   // O-8: the problem, the units lit
  if (pick) {
    return line({level: 'plan', kind: 'commit', text: fitWhy(why(X, A.reach.crossS, c), r => 'Next: ' + partOfDay(A.reach.atS) + ' will be short' + r + '. ' + pick.text),
      targets: pick.ids, startBy: A.startBy, short: pub(A.reach)});
  }
  return line({level: 'plan', kind: 'commit', text: fitWhy(why(X, A.reach.crossS, c), r => 'Next: start ' + unitName(c.unit) + when + ' for ' + partOfDay(A.reach.atS) + r + '. It takes ' + leadText(c) + tail + '.'),
    targets: c.fromS > X.s ? [] : [c.id], startBy: A.startBy, short: pub(A.reach)});
}

// ------------------------------------------------------------------ what a press would do (C-10)

/**
 * What a guarded press would do, before it is made (desk/README.md §19.5, C-10). Covers START,
 * STOP, CANCEL START and a press that would be refused (its reason); a unit on its way says where
 * it is (starting: level 'ok'); a press that would do nothing returns null.
 * Every time is computed from the unit's own times (V.MACHINES; C-12: minimum down time runs from
 * breaker open to the next START).
 * @param {object} obs observe(state)
 * @param {string|null} target 'guard-start-<unit>' | 'guard-stop-<unit>'
 * @param {{dayAhead?:object|null, planview?:object, proj?:object}} [ctx]
 * A STOP that opens a shortfall says what the press itself costs: the MW that would be missing
 * that are not missing already (the evening's units not yet started are the objective's to ask
 * for, not this press's doing). A STOP that opens none says what it saves, the line's own quote
 * (stopQuote, carbon included), and that it rests on nothing tripping first (Q4, W7; ctx.proj:
 * the line's projection, else planview.project(obs)); only from the unit's floor (STOP_FLOOR_MW),
 * where the quote holds. The GUARD ring's price: guardConsequence.
 * @returns {{target:string, text:string, level:'ok'|'plan'|'crit'}|null} level 'crit' when the press
 *   opens a shortfall the unit cannot be back for
 */
export function consequence(obs, target, ctx = {}) {
  const hit = /^guard-(start|stop)-(.+)$/.exec(target || '');
  if (!hit || obs.over || obs.inWatch) return null;
  const u = obs.units.find(x => x.id === hit[2]);
  if (!u) return null;
  const m = M.find(x => x.id === u.id), s = obs.s, name = unitName(u.id), day = ctx.dayAhead || obs.forecast;
  const out = (text, level = 'plan') => ({target, text, level}), nowS = spanAt(s, NOW_S, handOf(obs), nightOf(obs) ? NIGHT_S : Infinity);
  const reason = why => why.replace(/^unit is /, 'the unit is ').replace(OUT_RE, 'out for maintenance until ').replace(/: (\d+) min left$/, (x, n) => ', ' + spanText(n * S_PER_MIN) + ' left');
  const syncS = syncOf(obs), onGrid = u.minMW > 0 ? 'at minimum load' : 'on the grid';
  if (hit[1] === 'start') {
    if (u.mode === 'starting') return out(name + ' is starting: full speed at ' + atDay(s + u.timerS) + (syncS ? ', ' + onGrid + ' by ' + atDay(s + u.timerS + syncS + m.t2S) : '; then SYNC it by hand') + '.', 'ok');
    if (u.mode === 'ready') return out(name + ' is at full speed: a press opens the synchroscope (the clock runs at 1×)' + (syncS ? '; auto-sync closes its breaker at ' + atDay(s + u.timerS) : '') + '.');
    if (u.mode === 'tripped') return out('START ' + name + ' is blocked: it tripped and is locked out for another ' + spanText(u.timerS) + '.');
    if (u.mode !== 'off') return null; // (the line stays up as the pointer crosses the bank)
    if (u.startBlock !== '') return out('START ' + name + ' is blocked: ' + reason(u.startBlock) + '.');
    const onAt = s + u.startToMinS;
    const head = 'START ' + name + ': ' + (u.minMW > 0 ? 'at minimum load (' + commas(Math.round(u.minMW)) + ' MW)' : 'on the grid') + ' by ' + atDay(onAt) + ', ' + spanText(u.startToMinS) + ' from now' +
      (m.minUpS > 0 ? ', and it must then run ' + spanText(m.minUpS) : '') + '. ';
    const G = tripGap(obs, day, COMMIT_TRIP_MW), P = tripGap(obs, day, COMMIT_TRIP_MW, {plus: {unit: u.id, atS: s}});
    const before = firstRun(G), after = firstRun(P), T = capacityGap(obs, day, {marginMW: MARGIN_MW});
    // (each time as the objective line says it: needAt)
    const from = run => needAt(thinOf(T, run), run.crossS);
    // too late for a shortfall that is over before the unit arrives: then the next one is what it is
    // for (the objective line names that one)
    const next = before && before.atS < onAt && before.endS < onAt ? firstRun(G, onAt) : null;
    const nextAfter = next ? firstRun(P, onAt) : null;
    const helps = run => (!nextAfter || nextAfter.atS > run.atS ? 'it covers the one from ' : 'it helps with the one from ') + from(run) + '.';
    // (one line: past midnight "tomorrow" lengthens the head, so the two gaps are said shortly)
    const both = run => (head.length + 30 + helps(run).length <= LINE_MAX_CHARS ? 'Too late for the gap from ' + from(before) + '; ' + helps(run) : 'Too late for ' + from(before) + '; it is for ' + from(run) + '.');
    const tail = !before ? 'Nothing ahead needs it yet.' : next ? both(next)
      : before.atS < onAt ? 'It is too late for ' + from(before) + (before.endS < onAt ? ', and nothing after needs it.' : ', but it helps from ' + at(onAt) + '.')
        : !after || after.atS > before.atS ? 'It covers the shortfall from ' + from(before) + '.' : 'It helps with the shortfall from ' + from(before) + '.';
    return out(head + tail);
  }
  // the STOP guard
  if (u.mode === 'unloading' || u.mode === 'shutdown') {
    return out(name + ' is stopping: ' + (u.station === 'hydro' && obs.hydro.storageMWh <= V.HYDRO_STOP_MWH ? 'its water is spent, so it cannot be kept on.' : 'one press ABORTs the stop and keeps it on.'));
  }
  if (u.mode === 'tripped') return out(name + ' is tripped: nothing to stop.');
  if (u.mode === 'off') return null;
  const cancel = u.mode === 'starting' || u.mode === 'ready';
  if (!cancel && u.stopBlock !== '') return out('STOP ' + name + ' is blocked: ' + reason(u.stopBlock) + '.');
  // when it leaves the grid, and the earliest it could be back at minimum load
  const unloadS = cancel ? 0 : Math.max(0, u.outMW - u.minMW) / m.rampMWs;
  const openS = cancel ? s : s + unloadS + m.t4S;
  const backS = cancel ? s + u.startToMinS : openS + m.minDownS + u.startToMinS;
  const head = cancel ? 'CANCEL START ' + name + ': it goes cold; a new start takes ' + minText(u.startToMinS) + '.'
    : 'STOP ' + name + ': off the grid in ' + spanText(openS - s) + ', and not back ' + (u.minMW > 0 ? 'at minimum load' : 'on the grid') + ' before ' + atDay(backS) + '.';
  // The unit counted on its way down its ramp and the T4 slope (a coal machine stopped at 560 MW is
  // still on the grid hours later), and gone from the breaker; a cancelled start never arrives.
  const lv = cancel ? {without: u.id} : {leaving: u.id};
  const G0 = capacityGap(obs, day, {marginMW: MARGIN_MW}), G1 = capacityGap(obs, day, Object.assign({marginMW: MARGIN_MW}, lv));
  const short = firstRun(G1);
  if (short && short.crossS < backS) {
    // what the press opens before the unit could be back, beyond what is short already (the
    // shortfalls the objective line already asks units for)
    let mw = 0, already = false;
    for (let k = 0; k < G1.n; k++) {
      const t = G1.fromS + (k + 1) * G1.stepS;
      if (t < short.atS || t > Math.min(short.endS, backS)) continue;
      if (G0.gap[k] > 0) already = true;
      if (G1.gap[k] - Math.max(0, G0.gap[k]) > mw) mw = G1.gap[k] - Math.max(0, G0.gap[k]);
    }
    if (mw >= BATT_MIN_MW) {
      const now = short.atS - s <= nowS, from = now ? 'At once' : 'From ' + atMark(short.crossS);
      return out(head + (already ? ' ' + from + ' you would need ' + mwText(mw) + ' more than the line asks for.'
        : now ? ' You would be ' + mwText(mw) + ' short at once.' : ' ' + cap(partOfDay(short.atS)) + ' would be ' + mwText(mw) + ' short from ' + atMark(short.crossS) + '.'), 'crit');
    }
  }
  const trip = firstRun(tripGap(obs, day, COMMIT_TRIP_MW, lv));
  if (trip && trip.crossS < backS) return out(head + (trip.atS - s <= nowS ? ' One trip would then leave you short.' : ' From ' + atMark(trip.crossS) + ' one trip would then leave you short.'), 'crit');
  // Q4 (W7): a STOP that opens no shortfall says what it saves, the line's own quote (stopQuote: carbon included, Q10),
  // and on what it rests; where the line is too long, "needed again from" goes first, then the price. Only from the
  // unit's floor, as the line's STOP (condition 3): the quote prices its minimum MW, and above it the MW it gives over
  // that would be replaced too, by dearer machines the quote does not count (review: a CCGT at 612 MW quoted at
  // $72,000 saved cost $16,000)
  const PV = ctx.planview, floor = u.outMW <= u.minMW + STOP_FLOOR_MW;
  const q = cancel || !floor || u.station === 'hydro' || !PV || !PV.waterValue ? null : stopQuote(obs, u, day, ctx.proj || (PV.project ? PV.project(obs) : null), PV, nightOf(obs) ? NIGHT_S : Infinity);
  const price = !q ? '' : q.saving >= 1000 ? ' Saves about ' + usdText(q.saving) + ', carbon included' + (q.need ? ', if nothing trips first.' : '.') : ' Running on costs no more, carbon included.';
  const fit = (...ts) => ts.find(t => t.length <= LINE_MAX_CHARS) || ts[ts.length - 1];
  // the latest START that is back in time: no sooner than minimum down time allows after a stop (C-12:
  // from breaker open); a cancelled start never closed the breaker, so it may start again at once
  if (trip) {
    const againS = Math.max(cancel ? s : openS + m.minDownS, trip.crossS - u.startToMinS), by = againS - s < FC_MARK_S ? 'again at once.' : 'by ' + atMark(againS) + '.';
    const from = ' It is needed again from ' + atMark(trip.crossS) + ': start it ' + by;
    return out(fit(head + price + from, head + price + ' Start it ' + (by[0] === 'a' ? by : 'again ' + by), head + from));
  }
  return out(fit(head + price + ' Nothing ahead needs it today.', head + ' Nothing ahead needs it today.'));
}

/**
 * Q4 (W7): the GUARD ring turned down from fromMW to toMW, priced on both sides in the "? IF PRESSED" line (C-10). Both
 * are estimates, and the line says so ("up to about", "would"):
 *   gained: the MWh the battery could give by the evening window's end (PAR_BATT_DISCHARGE_H; on a night scenario 21:00,
 *     where the night shift's own rules take the GUARD) through the inverter
 *     MW the GUARD no longer holds, from now or 16:30, whichever is later; its charge above the reserve is the limit
 *     (before 15:30 the charge the battery line fills it to, as aircon() counts it). Valued as the score values gas it
 *     replaces: the marginal offer while gas sets the price (else the CCGT's, tonight's gas), plus that unit's carbon at the VER.
 *   risked: preview(mw), the TRIP PREVIEW of the largest loss at that GUARD ({nadirHz, caught: {uflsMW}}: app/game.js
 *     previewTrip): the MW the relays would shed at toMW (against fromMW's), at the VCR the score charges, per 10 minutes dark;
 *     with none more, where it would bottom and whether that is still secure (SECURE_HZ, the N-1 gauge's line).
 * @param {object} obs observe(state)
 * @param {number} fromMW the GUARD when the turn began
 * @param {number} toMW where the ring is now
 * @param {function(number):object|null} preview
 * @returns {{target:'ring-guard', text:string, level:'plan'|'crit'}|null} null unless turned down
 */
export function guardConsequence(obs, fromMW, toMW, preview) {
  if (!(toMW < fromMW) || obs.over || obs.inWatch) return null;
  // (the evening window's end, or the night shift's 21:00 on a night scenario: its own rules set the GUARD from then)
  const endS = nightOf(obs) ? Math.min(DIS_TO_S, NIGHT_S) : DIS_TO_S;
  const b = obs.battery, s = obs.s, sec = obs.sec, h = Math.max(0, endS - Math.max(s, DIS_FROM_S)) / S_PER_H;
  const held = Math.max(0, (s < CHARGE_BY_S ? Math.max(b.socMWh, CHARGE_TO_MWH) : b.socMWh) - RESERVE_MWH);
  const give = mw => Math.min(held, Math.max(0, b.ratedMW - mw) * h), mwh = give(toMW) - give(fromMW);
  const mu = gasSetsPrice(obs) ? obs.units.find(x => x.id === obs.price.marginalId) : null, mm = mu && M.find(x => x.id === mu.id);
  const perMWh = mm ? obs.price.mwh - obs.price.adder + V.VER * mm.co2 : V.STATIONS.ccgt.offer + V.VER * V.STATIONS.ccgt.co2;
  const head = 'GUARD ' + fromMW + ' → ' + toMW + ' MW: ' + (mwh >= 1 ? 'the battery could replace up to about ' + usdText(mwh * perMWh) + ' more gas and carbon by ' + at(endS) + '.'
    : 'no more energy by ' + at(endS) + ': the battery\'s charge runs out first either way.');
  const p1 = sec.lKind === 'none' ? null : preview(toMW), p0 = p1 ? preview(fromMW) : null;
  if (!p1 || !Number.isFinite(p1.nadirHz)) return {target: 'ring-guard', text: head, level: 'plan'};
  const who = sec.lKind === 'link' ? 'A tie trip' : 'A ' + unitName(sec.lId) + ' trip', shed = Math.max(0, p1.caught ? p1.caught.uflsMW : 0), was = Math.max(0, p0 && p0.caught ? p0.caught.uflsMW : 0);
  // (no more shed: where it would bottom, and whether that is still secure, the N-1 gauge's word: SECURE_HZ, as spare() reads the preview)
  if (shed < BATT_MIN_MW / 5 || shed <= was) {
    return {target: 'ring-guard', level: 'plan', text: head + ' ' + who + ' would bottom at about ' + p1.nadirHz.toFixed(2) + ' Hz: ' +
      (was >= BATT_MIN_MW / 5 ? 'it sheds no more.' : p1.nadirHz >= SECURE_HZ ? 'still secure.' : 'no relays, but not secure.')};
  }
  const cost = shed * V.VCR / 6, big = cost >= 1e6 ? '$' + (cost / 1e6).toFixed(1) + 'M' : usdText(cost);
  const tail = ' would then shed about ' + mwText(shed) + (was >= BATT_MIN_MW / 5 ? ' (' + mwText(was) + ' now)' : '');
  const fit = [head + ' ' + who + tail + ': ' + big + ' per 10 minutes dark.', head + ' ' + who + tail + ', ' + big + ' per 10 min dark.'];
  return {target: 'ring-guard', level: 'crit', text: fit.find(t => t.length <= LINE_MAX_CHARS) || fit[1]};
}

const cap = t => (t === 'tonight' ? 'Tonight' : t === 'the evening' ? 'Tonight\'s peak' : t.charAt(0).toUpperCase() + t.slice(1));

// ------------------------------------------------------------------ the line as it is shown

/**
 * A waiting line stands for STEADY_HOLD_S after it was last the fresh reading (grid seconds); a
 * deadline within STEADY_S of the one shown is the same deadline (each at TUNED_RATE; spanAt).
 */
export const STEADY_HOLD_S = 900, STEADY_S = 300;
/** A quiet line is shown for at least this long against another quiet line (grid seconds at TUNED_RATE; spanAt). */
export const STEADY_QUIET_S = 300;

// A line's words with every number, clock time and dollar figure masked ('49.41 Hz', '16:10', '$43,000', '5,889 MW'), and the part of the day.
export const masked = t => t.replace(/[$−-]?\d[\d,.:]*/g, '#').replace(/\b(?:[Tt]he (?:morning|afternoon|evening)|[Tt]onight(?:'s peak)?)\b/g, '#');

/**
 * The line as the desk shows it. The forecast's columns slide a minute at a time, so a waiting
 * line's deadline or figure can flip between two 5-minute marks ("by 05:15", "by 05:20"), or
 * between two shortfalls an hour apart when the first is near the size worth naming. A line that
 * asks for something the player has not done yet moves too ("would fall to 49.38 Hz", "49.33 Hz").
 * A line that changes every half minute reads as noise, so the desk keeps what it said: a line of
 * the same kind and level, for the same controls, with the same action and the same words but for
 * its figures and times as the one shown
 * replaces its text only when the one shown has not been the fresh reading for STEADY_HOLD_S or,
 * for a waiting line, when its deadline is earlier by more than STEADY_S or the deadline shown is
 * within ACT_WITHIN_S. A critical line, a different action and any change of kind are shown at
 * once, and the action is always the fresh line's. A quiet line (nothing to do, no deadline) is
 * shown for at least STEADY_QUIET_S against another quiet line: its band edges ("enough plant",
 * "little spare for a trip"; the peak ahead or not) are crossed back and forth by the forecast's
 * noise, a minute at a time. Each span is the real time it was tuned for, as the D-2 profile plays
 * it from where it starts (spanAt; Q-63). Pure: the caller keeps the result.
 * @param {{line:object, seenS:number, sinceS?:number}|null} held the last result
 * @param {object} next objective(obs, ctx) now
 * @param {number} s obs.s
 * @param {boolean} [hand] the clock is HAND's (app/director.js handAt)
 * @returns {{line:object, seenS:number, sinceS:number}} line: what to show (next, or next with the
 *   held text and startBy); seenS: when the shown text was last the fresh reading; sinceS: since
 *   when the shown text has been shown
 */
export function steady(held, next, s, hand = false) {
  const a = held && held.line, span = (from, gridS) => spanAt(from, gridS, hand);
  if (!a || !next) return {line: next, seenS: s, sinceS: s};
  const since = held.sinceS === undefined || held.sinceS > s ? held.seenS : held.sinceS;
  const fresh = {line: next, seenS: s, sinceS: next.text === a.text ? since : s};
  const keep = (extra = {}) => ({line: Object.assign({}, next, {text: a.text}, extra), seenS: held.seenS, sinceS: since});
  if (next.kind === 'quiet' && a.kind === 'quiet' && !next.action && next.level === a.level && next.text !== a.text && s >= since && s - since < span(since, STEADY_QUIET_S)) return keep();
  if (next.kind !== a.kind || next.level !== a.level || next.level === 'crit') return fresh;
  if (JSON.stringify(next.action) !== JSON.stringify(a.action)) return fresh;
  if (next.text === a.text || next.targets.join() !== a.targets.join()) return fresh;
  // only a figure or a time may differ: other words are other news (another risk, a real shortfall
  // where there was only a deadline), shown at once
  if (masked(next.text) !== masked(a.text)) return fresh;
  if (s < held.seenS || s - held.seenS >= span(held.seenS, STEADY_HOLD_S)) return fresh;
  if (next.action) return keep();
  if (a.startBy >= 0 && (next.startBy < a.startBy - span(next.startBy, STEADY_S) || a.startBy - s <= span(s, ACT_WITHIN_S))) return fresh;
  return keep({startBy: a.startBy});
}

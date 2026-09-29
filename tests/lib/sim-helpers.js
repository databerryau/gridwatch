// Test doubles and builders for the v4 sim. Tests may poke state directly; sim code may not.
//
// FROZEN after stage A (sim/README.md §1): stage B agents work in parallel, so none of them
// edits this file. Put new helpers in your own test file; integration may move shared
// ones here afterwards.
import {createState} from '../../sim/step.js';
import * as fleet from '../../sim/fleet.js';
import * as physics from '../../sim/physics.js';
import {V} from '../../sim/params.js';
import {CLASSIC} from '../../content/scenarios.js';

export const TPS = V.TICKS_PER_S;

// F-10 wants the whole `node --test` run under 60 s. Multi-seed statistics that need many
// whole days (S-12 over 200 seeds, H-8 over 1,000 states, F-2 over 100 days) run in full only
// with GRIDWATCH_SLOW=1 (`npm run test:slow`, and tools/par.js); the default run skips them
// or uses a small sample. slowOnly() only decides skip / run: a slow test that is still
// pending adds the owner's TODO too, as {...TODO, ...slowOnly()}, and the owner removes TODO
// when it passes, so with GRIDWATCH_SLOW=1 a real failure shows as a failure.
export const SLOW = process.env.GRIDWATCH_SLOW === '1';
export const slowOnly = () => ({skip: SLOW ? false : 'slow: set GRIDWATCH_SLOW=1 (npm run test:slow)'});
export const secondsToTicks = s => Math.round(s * TPS);
export const ticksAt = (h, m = 0) => ((h - V.DAY_START_H) * 3600 + m * 60) * TPS;

/** Total scheduled supply the physics will see at 50 Hz (units, tie, renewables, battery, RERT). */
export function supplyMW(s) {
  return s.units.reduce((a, u) => a + (u.sync ? u.schedMW : 0), 0) + s.tie.flowMW + s.ren.windMW + s.ren.solarMW +
    s.battery.schedMW + s.rert.outMW;
}

/** Make the current second exactly balanced at 50 Hz by setting env.demandMW (a test-only lever). */
export function balance(s) {
  s.env.demandMW = supplyMW(s) + s.dr.mw;
  s.phys.fHz = V.F0_HZ;
  s.phys.fHist.fill(V.F0_HZ);
  return s;
}

/**
 * A state with exactly the given machines online at the given MW (everything else off),
 * balanced at 50 Hz. Example: commit(createState(1, CLASSIC), {coal1: 650, ccgt1: 400}).
 * opts: tieMW, windMW, battery (fields assigned onto state.battery before balancing).
 */
export function commit(s, mwById, opts = {}) {
  s.units.forEach((u, i) => {
    const mw = mwById[u.id];
    const on = mw !== undefined;
    u.mode = on ? 'on' : 'off';
    u.basePointMW = u.schedMW = u.outMW = on ? mw : 0;
    u.govMW = 0; u.agcTrimMW = 0;
    if (u.sync !== on) fleet.setSync(s, i, on);
  });
  for (const id of V.STATION_IDS) fleet.refreshLever(s, id);
  if (opts.tieMW !== undefined) s.tie.flowMW = s.tie.setMW = opts.tieMW;
  if (opts.windMW !== undefined) s.ren.windMW = opts.windMW;
  if (opts.battery) Object.assign(s.battery, opts.battery);
  return balance(s);
}

/** A fresh balanced opening state (04:00 commitment). */
export function opening(seed = 1) {
  return balance(createState(seed, CLASSIC));
}

/**
 * The classic day with no weather events and no optional events (heat, storm, cloud front,
 * smelter, drought, link trip, extra trip all off), as a new scenario object with its own
 * id. The guaranteed big trip is still pre-rolled; remove it from state.ext.events with
 * withoutContingencies(). Its series have no event-driven shifts (K-2, L-8 tests).
 */
export function calmScenario() {
  const scn = JSON.parse(JSON.stringify(CLASSIC));
  scn.id = 'test-calm';
  scn.weather.heatShare = 0;
  scn.weather.stormShare = 0;
  for (const k of ['extraTrip', 'cloud', 'smelter', 'drought', 'linkTrip']) scn.events[k].p = 0;
  return scn;
}

/** Remove every pre-rolled contingency event (test poke; they do not shape the series). */
export function withoutContingencies(s) {
  s.ext.events = s.ext.events.filter(e => !e.contingency);
  return s;
}

/**
 * Inject an ext contingency at grid second atS (test poke through the public path: events
 * .applyDue trips it at that second boundary). kind 'unit' trips the largest online machine;
 * 'link' the tie. The event goes in time order at or after evNext.
 */
export function injectTrip(s, atS, kind = 'unit', lockoutS = 3600) {
  const e = kind === 'unit'
    ? {id: 'probe', atS, type: 'unitTrip', args: {rule: 'largest', lockoutS}, contingency: true, warned: false}
    : {id: 'probe', atS, type: 'linkTrip', args: {cause: 'probe', lockoutS}, contingency: true, warned: false};
  let i = s.evNext;
  while (i < s.ext.events.length && s.ext.events[i].atS <= atS) i++;
  s.ext.events.splice(i, 0, e);
  return s;
}

/**
 * Run physics only (schedules frozen, no grid seconds), `ticks` times. onTick(s, k) runs
 * before each tick (use it to force frequency); returns {out, minHz, maxHz, minTick}.
 */
export function runPhysics(s, ticks, onTick) {
  const out = [];
  let minHz = Infinity, maxHz = -Infinity, minTick = -1;
  for (let k = 0; k < ticks && !s.black; k++) {
    if (onTick) onTick(s, k);
    physics.tick(s, out);
    s.tick++;
    if (s.phys.fHz < minHz) { minHz = s.phys.fHz; minTick = k; }
    if (s.phys.fHz > maxHz) maxHz = s.phys.fHz;
  }
  return {out, minHz, maxHz, minTick};
}

/** Trip a machine now (test shortcut for a contingency). Returns MW lost. */
export function trip(s, unitId, out = []) {
  return fleet.tripUnit(s, fleet.unitIndex(unitId), 'test', 3600, out);
}

export const clone = x => JSON.parse(JSON.stringify(x));

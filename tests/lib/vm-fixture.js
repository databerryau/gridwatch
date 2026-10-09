// tests/lib/vm-fixture.js: view models (desk/README.md §5) for UI tests, built from a REAL
// sim day so shapes and magnitudes are honest. Stage B UI agents work before the sim agent's
// Phase 1a fields exist (obs.plan, obs.scope, units[].slipHz/phaseDeg, sec.previewUnitHz /
// previewLinkHz): `withPhase1aFields` adds them in the contract's shape when missing, so the
// same tests keep passing once the real fields arrive (they are then left untouched).
//
//   const {vm, obs, state} = await dayVm({seed: 7, untilH: 18.5});   // par runs the day to 18:30
//   const vm2 = baseVm(obs, {mode: {mode: 'WATCH', rate: 0.15, watchS: 1.2, locked: true}});

import {V} from '../../sim/params.js';

/** The contract's Phase 1a observe() additions, filled in only where the sim has not yet. */
export function withPhase1aFields(obs) {
  const o = obs;
  if (!o.plan) {
    // A plausible plan: each station's present lever held, then its base point +/- a ramp
    // step at +1 h and +3 h, as keys; no bookings.
    const s = o.s;
    o.plan = {
      madeAtS: V.PLAYER_START_S, rev: 1,
      stations: o.stations.map(st => ({
        id: st.id, man: false, doneS: -1, clampedMW: 0,
        keys: st.onCount > 0
          ? [{atS: s + 3600, mw: Math.min(st.maxMW, st.basePointMW + 100)}, {atS: s + 3 * 3600, mw: Math.max(st.minMW, st.basePointMW - 50)}]
          : [],
      })),
      tie: {doneS: -1, keys: [{atS: s + 1800, mw: o.tie.setMW}]},
      starts: [], stops: [],
    };
  }
  if (!o.scope) o.scope = {unit: '', open: false};
  for (const u of o.units) {
    if (!('slipHz' in u)) u.slipHz = u.mode === 'ready' ? 0.25 : 0;
    if (!('phaseDeg' in u)) u.phaseDeg = u.mode === 'ready' ? -40 : 0;
  }
  if (!('previewUnitHz' in o.sec)) o.sec.previewUnitHz = o.sec.previewNadirHz;
  if (!('previewLinkHz' in o.sec)) o.sec.previewLinkHz = o.tie.flowMW > 0 ? Math.min(50, o.sec.previewNadirHz + 0.1) : 50;
  return o;
}

/** A view model around `obs` with quiet defaults; `over` replaces top-level keys. */
export function baseVm(obs, over) {
  const vm = {
    obs: withPhase1aFields(obs),
    mode: {mode: 'CRUISE', rate: 120, watchS: -1, locked: false, watchVersion: null},
    frame: {nowMs: 1000, dtS: 1 / 60, alpha: 0},
    alarms: {tiles: [], sounding: false},
    tray: {cards: [], log: []},
    focus: null, hover: null, stackExpanded: false, previewOn: false, previewGuardMW: null,
    offers: [], respond: null, glow: new Set(),
    hist: {freq: [], stations: {}, demand: []},
    settings: {volume: 0.5, muted: true},
    suburb: null, dayAhead: null, // (desk/README.md §31.3.8)
  };
  return Object.assign(vm, over || {});
}

// The par days dayVm has run in this process, by seed, hour and proxy: the state at untilH
// before any trip, as JSON. Every dayVm call parses its own copy, so a test that runs (seed 7,
// 18:30) with and without the trip pays for the par day once. (A JSON copy, not structuredClone:
// the state is plain JSON (F-2), and a structuredClone'd state steps about twice as slowly in
// V8: 2.3 s against 1.2 s for DESK seed 8 from 08:00 to 21:00, measured 2026-10-07.)
const PAR_DAYS = new Map();

/**
 * Run a real day with par to `untilH` (hour of the unwrapped day, 4..28) and return its view.
 * The par day is run once per process for each (seed, untilH, proxy) and each call gets its
 * own copy of it, so callers may mutate what they get.
 * @param {{seed?:number, untilH?:number, proxy?:string, trip?:boolean}} [o] trip: trip the
 *   largest unit at untilH and return a view 2 grid-s into the watch (conts filled).
 */
export async function dayVm(o = {}) {
  const {createState, step, observe} = await import('../../sim/step.js');
  const AP = await import('../../sim/autopilot.js');
  const {CLASSIC} = await import('../../content/scenarios.js');
  const fleet = await import('../../sim/fleet.js');
  const seed = o.seed ?? 7, untilTick = Math.round(((o.untilH ?? 18.5) - V.DAY_START_H) * 3600 * V.TICKS_PER_S);
  const proxy = o.proxy || 'par', key = seed + '|' + untilTick + '|' + proxy;
  if (!PAR_DAYS.has(key)) {
    const day = createState(seed, CLASSIC);
    AP.runPar(seed, CLASSIC, {state: day, proxy, untilTick});
    PAR_DAYS.set(key, JSON.stringify(day));
  }
  const state = JSON.parse(PAR_DAYS.get(key));
  if (o.trip) {
    let best = -1;
    for (let i = 0; i < state.units.length; i++) if (state.units[i].sync && (best < 0 || state.units[i].outMW > state.units[best].outMW)) best = i;
    while (state.tick % V.TICKS_PER_S !== 0) step(state, []);
    fleet.tripUnit(state, best, 'test trip', V.HOT_TRIP_LOCKOUT_S, []);
    for (let k = 0; k < 2 * V.TICKS_PER_S; k++) step(state, []);
  }
  const obs = observe(state);
  return {state, obs, vm: baseVm(obs)};
}

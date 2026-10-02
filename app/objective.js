// app/objective.js: the desk's standing objective (SPEC §9.1 Q-18). Pure and DOM-free.
//
// In the game the commitment is the player's: which units run, and when. The dispatch of the
// units they have committed is automatic (app/system.js). This module reads what the player
// can (observe() and the plan view) and says, in one line, what the desk needs next: nothing;
// a unit to start, by when, and how long it takes; the levers handed back; a feeder to close.
// It never acts. It names the cheapest unit that still arrives in time and the latest moment
// to start it, so "the plan comes together" is something the player does on time.
//
// The look-ahead is a CAPACITY check, not the plan's own red columns: for each forecast column,
// what the committed fleet could give (machines on, starting or booked by then, at the plan's
// loading; hydro for the water it has; the tie; the wind and sun forecast) against the forecast
// demand plus a margin. The plan's red columns move with every 5-minute dispatch; whether
// enough plant is committed does not.
//
//   objective(obs, {edited, planview, proj?, dayAhead?}) -> {level, kind, text, targets, action, startBy, short, long}
//     level   'ok' | 'plan' (act later) | 'act' (act now) | 'crit' (short already)
//     kind    which line it is (desk/README.md §19.5): 'watch' | 'held' | 'short' | 'commit' | 'restore' |
//             'spare' | 'stop' | 'battery' | 'quiet'
//     targets control ids to light (desk/README.md §5)
//     action  the sim input (or {redispatch: true}) that answers it now, or null. The game never
//             sends it: the hint-following proxy in tests does, to prove that a player who does
//             only what this line says gets through the day (tests/objective.test.js).
//     short   the capacity shortfall ahead {atS, endS, mw} or null (the stack marks it)
//     long    the spill ahead {atS, endS, mw} or null (Phase 2a: planview's first blue run)

import {V} from '../sim/params.js';
import {clockText} from '../render/format.js';

/** A start is "now" when its latest moment is within this many grid seconds. */
export const ACT_WITHIN_S = 600;
/** Capacity must clear the forecast by this much (MW): the forecast's own error at an hour or two. */
export const MARGIN_MW = 150;
/** A shortfall ahead smaller than this is not worth a unit (MW). */
export const SHORT_MIN_MW = 100;
/** The plan short by this much within NOW_S is an emergency (MW, grid seconds). */
export const CRIT_MW = 300, NOW_S = 300;
/** Hydro counts for the MW its water can hold for this long (h): the evening peak. */
export const HYDRO_SUSTAIN_H = 5;

const M = V.MACHINES, LOADING = V.PLAN_MAX_LOADING, TIE_FIRM_MW = V.STATIONS.coal.ratingMW;
const HYDRO_LAST = 1e6;
const HOLD_UNTIL_S = (V.PAR_WATER_HOLD_UNTIL_H - V.DAY_START_H) * V.S_PER_H;
const mwText = x => Math.max(10, Math.round(x / 10) * 10) + ' MW';
const minText = s => { const m = Math.max(1, Math.round(s / 60)); return m >= 90 ? (m / 60).toFixed(1).replace('.0', '') + ' h' : m + ' min'; };
const at = s => clockText(s, false);
const unitName = id => { const m = M.find(x => x.id === id); return m ? m.name.toUpperCase() : id; };

/**
 * The first run of forecast columns where the committed fleet's capacity is under the forecast
 * demand plus MARGIN_MW, or null. Pure; reads obs only.
 * @param {object} obs observe(state)
 * @param {object} [fc] any forecast-shaped object (obs.forecast by default; obs.dayAhead for the whole day)
 * @returns {{atS:number, endS:number, mw:number}|null} atS: the first short column's time; mw:
 *   the largest shortfall in the run (margin included)
 */
export function capacityShort(obs, fc = obs.forecast) {
  const s = obs.s;
  const starts = new Map(obs.plan.starts.map(e => [e.unit, e.atS])), stops = new Map(obs.plan.stops.map(e => [e.unit, e.atS]));
  const water = Math.max(0, obs.hydro.storageMWh - V.PAR_WATER_RESERVE_MWH) / HYDRO_SUSTAIN_H;
  let run = null;
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    let thermal = 0, hydro = 0;
    for (const u of obs.units) {
      let on;
      if (u.mode === 'on' || u.mode === 'loading') on = true;
      else if (u.mode === 'starting' || u.mode === 'ready') on = t >= s + u.startToMinS; // at most its whole start from here
      else if (u.mode === 'off' && starts.has(u.id)) on = t >= starts.get(u.id) + u.startToMinS;
      else on = false;
      if (on && stops.has(u.id) && t >= stops.get(u.id)) on = false;
      if (!on) continue;
      if (u.station === 'hydro') hydro += u.availMW; else thermal += u.availMW * LOADING;
    }
    const tie = obs.tie.tripped && t < s + obs.tie.lockoutS ? 0 : Math.min(obs.tie.importLimitMW, TIE_FIRM_MW);
    // The dispatch keeps the water for the evening (it runs hydro before HOLD_UNTIL only above
    // its keep line, which a morning uses up), so hydro is firm capacity from then on only.
    const cap = thermal + (t >= HOLD_UNTIL_S ? Math.min(hydro, water) : 0) + tie + fc.windMW[k] + fc.solarMW[k] + (obs.rert.armed && !obs.rert.standingDown ? obs.rert.outMW : 0);
    const short = fc.demandP50[k] + MARGIN_MW - cap;
    if (short > 0) {
      if (!run) run = {atS: t, endS: t, mw: short};
      else { run.endS = t; if (short > run.mw) run.mw = short; }
    } else if (run) {
      if (run.mw >= SHORT_MIN_MW) return run;
      run = null;
    }
  }
  return run && run.mw >= SHORT_MIN_MW ? run : null;
}

// Machines that could be started, cheapest first (the merit order), with the lead each needs.
// Hydro goes last: another machine adds MW, not water.
function startable(obs, byS) {
  const booked = new Set(obs.plan.starts.map(e => e.unit));
  return obs.units.filter(u => u.mode === 'off' && u.startBlock === '' && !booked.has(u.id)).map(u => ({unit: u.id, id: 'guard-start-' + u.id,
    lead: u.startToMinS, offer: u.station === 'hydro' ? HYDRO_LAST : u.offer, startBy: byS - u.startToMinS}))
    .sort((a, b) => a.offer - b.offer || a.lead - b.lead);
}

/**
 * @param {object} obs observe(state)
 * @param {{edited?:boolean, planview:object, proj?:object}} ctx edited: the player holds levers
 *   by hand (app/system.js sys.edited); planview: app/planview.js; proj: its project(obs) if the
 *   caller already has it
 */
export function objective(obs, ctx) {
  const PV = ctx.planview;
  const none = {level: 'ok', kind: 'quiet', text: '', targets: [], action: null, startBy: -1, short: null, long: null};
  if (obs.over) return none;
  if (obs.inWatch) return Object.assign({}, none, {level: 'act', kind: 'watch', text: 'A unit has tripped. The desk is locked while the grid catches itself: watch.'});
  const s = obs.s;
  const proj = ctx.proj || PV.project(obs);
  const short = capacityShort(obs);
  const reds = PV.redRuns(proj);
  const long = (PV.blueRuns ? PV.blueRuns(proj)[0] : null) || null;
  const red = reds.find(r => r.atS - s <= NOW_S && r.mw >= CRIT_MW) || null;
  const dark = obs.districts.filter(d => d.dark);
  const shedding = obs.sec.level === 'SHEDDING' || obs.sec.level === 'SHORT';

  // 1. The levers are held by hand and the plan is short: hand them back.
  const heldRed = ctx.edited ? red || reds.find(r => r.mw >= SHORT_MIN_MW) || null : null;
  if (heldRed) {
    return {level: 'crit', kind: 'held', long, text: 'Short ' + mwText(heldRed.mw) + (heldRed.atS - s <= NOW_S ? ' now' : ' from ' + at(heldRed.atS)) +
      ' with levers held by hand. RE-DISPATCH (N) hands every lever back to the plan.', targets: ['btn-redispatch'], action: {redispatch: true}, startBy: s, short};
  }

  // 2. Short right now: the fast answers.
  if (red || (shedding && short && short.atS - s <= NOW_S)) {
    const mw = red ? red.mw : short.mw;
    const fast = [];
    if (obs.dr.callsLeft > 0 && !(obs.dr.activeS > 0)) fast.push({id: 'btn-dr', say: 'call industrial DR (hold D)', action: {type: 'callDR'}});
    const quick = startable(obs, s).sort((a, b) => a.lead - b.lead)[0] || null;
    if (quick) fast.push({id: quick.id, say: 'start ' + unitName(quick.unit) + ' (' + minText(quick.lead) + ')', action: {type: 'start', unit: quick.unit}});
    if (!fast.length && !obs.rert.armed) fast.push({id: 'key-rert', say: 'break the glass on the reserve diesel (hold E)', action: {type: 'armRERT'}});
    return {level: 'crit', kind: 'short', long, text: 'Short ' + mwText(mw) + ' now. ' + (fast.length ? 'Too late to plan for it: ' + fast.map(f => f.say).join(', or ') + '.'
      : 'Everything that can help is already on its way.'), targets: fast.map(f => f.id), action: fast.length ? fast[0].action : null, startBy: s, short};
  }

  // 3. Not enough plant committed for the hours ahead: the cheapest unit that still makes it.
  if (short) {
    const head = 'You will be ' + mwText(short.mw) + ' short from ' + at(short.atS) + '. ';
    const all = startable(obs, short.atS);
    const inTime = all.filter(c => c.startBy >= s);
    const c = inTime[0] || all.slice().sort((a, b) => a.lead - b.lead)[0];
    if (c) {
      const now = c.startBy - s <= ACT_WITHIN_S;
      return {level: now ? 'act' : 'plan', kind: 'commit', long, text: head + 'Start ' + unitName(c.unit) + (now ? ' now' : ' by ' + at(c.startBy)) + ': it takes ' + minText(c.lead) +
        ' to reach the grid.', targets: [c.id], action: now ? {type: 'start', unit: c.unit} : null, startBy: Math.max(s, c.startBy), short};
    }
    const rert = !obs.rert.armed;
    return {level: 'crit', kind: 'commit', long, text: head + 'Every unit is committed. ' + (rert ? 'The reserve diesel (hold E) takes 20 min and costs dearly.' : 'The reserve diesel is on its way.'),
      targets: rert ? ['key-rert'] : [], action: rert && short.atS - s <= V.RERT_LEAD_S + ACT_WITHIN_S ? {type: 'armRERT'} : null, startBy: s, short};
  }

  // 4. Dark districts, once supply is in hand.
  if (dark.length) {
    const n = dark.length + (dark.length === 1 ? ' district is' : ' districts are') + ' dark';
    const ok = dark.find(d => d.restoreBlock === '');
    if (ok) return {level: 'act', kind: 'restore', long, text: n + ' and the permissive lamp is lit. Close a feeder: R, then Enter.', targets: ['bay-restore'], action: {type: 'restore', district: ok.id}, startBy: s, short};
    return {level: 'plan', kind: 'restore', long, text: n + '. A feeder closes once frequency is steady and there is spare reserve to carry it.', targets: ['bay-restore', 'gauge-n1'], action: null, startBy: -1, short};
  }

  // 5. Enough power, not enough spare.
  if (obs.sec.level !== 'SECURE') {
    return {level: 'plan', kind: 'spare', long, text: 'Demand is covered, but losing ' + (obs.sec.lKind === 'link' ? 'the tie line' : 'your biggest unit') +
      ' would not be caught. Add spare: start a gas turbine, or raise the battery GUARD.', targets: ['gauge-n1', 'ring-guard'], action: null, startBy: -1, short};
  }

  // 6. Quiet: what is next on the horizon.
  let peakK = 0;
  for (let k = 1; k < proj.n; k++) if (proj.p50[k] > proj.p50[peakK]) peakK = k;
  const rising = peakK === proj.n - 1 && proj.p50[peakK] > proj.p50[0] + 100;
  return Object.assign({}, none, {long, text: 'Enough plant is committed for the next 4½ hours. ' + (rising ? 'Demand is still climbing: more will be needed.'
    : 'Highest demand ahead: ' + mwText(proj.p50[peakK]) + ' at ' + at(proj.times[peakK]) + '.')});
}

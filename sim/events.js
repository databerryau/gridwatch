// sim/events.js: the external event timeline (spec F-3, D-8; legacy menu L331-370).
//
// Stage A (implemented, frozen): prerollEvents() turns the scenario's event menu into a
// time-sorted list of ext events at createState. Nothing here ever depends on play.
// Stage B owner "market + events": applyDue(), which applies the events whose time has come.
//
// Event record (state.ext.events[i], plain JSON):
//   {id: 'e7', atS: 41520, type: 'unitTrip', args: {...}, contingency: true, warned: false}
// atS is the grid second (0 = 04:00). Contingency events (unitTrip, linkTrip, smelterTrip)
// trip exactly one element each: the largest credible contingency is <= 800 MW (F-13).

import {V} from './params.js';
import {STREAM, uniform, pickWith} from './rng.js';

const S_PER_H = V.S_PER_H, S_PER_MIN = V.S_PER_MIN;

// Menu slots index the EXT_EVENTS stream: each slot has its own counter space.
const SLOTS = ['bigTrip', 'extraTrip', 'heat', 'storm', 'cloud', 'smelter', 'drought', 'linkTrip', 'notices'];

// Tie-break for events in the same second: information first, contingencies last.
export const TYPE_ORDER = ['notice', 'heatAnnounce', 'heatOnset', 'heatEnd', 'stormWarn', 'stormArrive', 'windCutout',
  'stormPass', 'cloudWarn', 'cloudOnset', 'cloudClear', 'windDrought', 'smelterReturn', 'smelterTrip', 'linkTrip', 'unitTrip'];

export const CONTINGENCY_TYPES = Object.freeze(['unitTrip', 'linkTrip', 'smelterTrip']);

/**
 * Pre-roll the day's events from the scenario menu (legacy timing rules; see
 * content/scenarios.js). Deterministic in (seed, scn, regime).
 * @returns {Array<{id:string, atS:number, type:string, args:object, contingency:boolean, warned:boolean}>}
 */
export function prerollEvents(seed, scn, regime) {
  const m = scn.events, startH = scn.clock.startH;
  const list = [];
  const toS = h => Math.round((h - startH) * S_PER_H);
  const drawer = slot => {
    const a = SLOTS.indexOf(slot);
    let d = 0;
    return () => uniform(seed, STREAM.EXT_EVENTS, a, d++);
  };
  const within = (u, w) => Math.floor(toS(w[0]) + u * (toS(w[1]) - toS(w[0])));
  const minutes = (u, r) => Math.floor(r[0] + u * (r[1] - r[0])) * S_PER_MIN;
  const add = (atS, type, args, contingency = false, warned = false) =>
    list.push({id: '', atS, type, args, contingency, warned});

  // Guaranteed big-unit trip (L337): kept clear of a severe-weather evening.
  {
    const r = drawer('bigTrip'), b = m.bigTrip;
    const w = regime.cls === 'calm' ? b.calmWindowH : b.severeWindowH;
    add(within(r(), w), 'unitTrip', {rule: 'largest', lockoutS: minutes(r(), b.lockoutMin)}, true);
  }
  // A second trip on some days (L338): a pre-rolled station, its largest online machine.
  {
    const r = drawer('extraTrip'), x = m.extraTrip;
    if (r() < x.p) {
      const atS = within(r(), x.windowH);
      const station = pickWith(r(), x.stations);
      add(atS, 'unitTrip', {rule: 'station', station, lockoutS: minutes(r(), x.lockoutMin)}, true);
    }
  }
  // Heatwave (L339-344): announced, then active.
  if (regime.cls === 'heat') {
    const x = m.heat;
    const onsetS = toS(x.onsetH), endS = toS(x.endH);
    // Integer per-mille: ext args are quantised (F-3); 0.07 x 100 would be 7.000000000000001.
    add(toS(x.announceH), 'heatAnnounce', {onsetS, endS, upliftPm: Math.round(V.HEAT_DEMAND_UPLIFT * V.PER_MILLE),
      deratePm: Math.round(V.HEAT_THERMAL_DERATE * V.PER_MILLE)}, false, true);
    add(onsetS, 'heatOnset', {clearMuAtLeast: x.clearMu}, false, true);
    add(endS, 'heatEnd', {}, false, true);
  }
  // Evening storm (L345-351).
  if (regime.cls === 'storm') {
    const r = drawer('storm'), x = m.storm;
    const arriveS = toS(x.arriveH);
    add(toS(x.warnH), 'stormWarn', {arriveS}, false, true);
    add(arriveS, 'stormArrive', {windMu: x.arriveMu}, false, true);
    add(within(r(), x.cutoutWindowH), 'windCutout', {windMu: x.cutoutMu}, false, true);
    const linkAtS = within(r(), x.linkTripWindowH), linkLockS = minutes(r(), x.linkLockoutMin);
    if (r() < x.linkTripP) add(linkAtS, 'linkTrip', {cause: 'storm', lockoutS: linkLockS}, true);
    add(toS(x.passH), 'stormPass', {windMu: x.passMu}, false, true);
  }
  // Cloud front over the solar precinct (L353-358).
  {
    const r = drawer('cloud'), x = m.cloud;
    if (r() < x.p) {
      const warnS = within(r(), x.warnWindowH);
      const onsetS = warnS + x.leadMin * S_PER_MIN;
      const clearS = onsetS + minutes(r(), x.clearAfterMin);
      add(warnS, 'cloudWarn', {onsetS}, false, true);
      add(onsetS, 'cloudOnset', {clearMu: x.frontMu}, false, true);
      add(clearS, 'cloudClear', {clearMu: x.clearMu}, false, true);
    }
  }
  // Smelter potline trip (L359-361), then its return.
  {
    const r = drawer('smelter'), x = m.smelter;
    if (r() < x.p) {
      const atS = within(r(), x.windowH), offS = x.offMin * S_PER_MIN;
      add(atS, 'smelterTrip', {offS}, true);
      add(atS + offS, 'smelterReturn', {});
    }
  }
  // Evening wind drought (L363-365): unwarned, announced at onset.
  {
    const r = drawer('drought'), x = m.drought;
    if (r() < x.p) add(within(r(), x.windowH), 'windDrought', {windMu: x.mu});
  }
  // Interconnector fault trip (L367).
  {
    const r = drawer('linkTrip'), x = m.linkTrip;
    if (r() < x.p) {
      const atS = within(r(), x.windowH);
      add(atS, 'linkTrip', {cause: 'fault', lockoutS: minutes(r(), x.lockoutMin)}, true);
    }
  }
  // Information lines (L368-370).
  for (const n of m.notices.list) add(toS(n.atH), 'notice', {code: n.code});

  // Two contingencies never share a second (that would be a non-credible double trip):
  // a later one moves one second on, repeatedly, until all differ.
  // Total order (README §2 rule 9): time, then type, then menu slot order (the insertion
  // index `k`, fixed before the first sort), so the result never depends on sort stability.
  list.forEach((e, k) => { e.k = k; });
  const order = e => TYPE_ORDER.indexOf(e.type);
  const sortAll = () => list.sort((a, b) => a.atS - b.atS || order(a) - order(b) || a.k - b.k);
  sortAll();
  for (let moved = true; moved;) {
    moved = false;
    const seen = new Set();
    for (const e of list) {
      if (!e.contingency) continue;
      if (seen.has(e.atS)) { e.atS += 1; moved = true; } else seen.add(e.atS);
    }
    if (moved) sortAll();
  }
  list.forEach((e, i) => { e.id = 'e' + (i + 1); delete e.k; });
  return list;
}

/**
 * STAGE B (owner: market + events). Apply every ext event with atS <= the current grid second,
 * in list order, starting at state.evNext; advance state.evNext. Called by step() at each
 * second boundary, before weather.sampleSecond().
 *
 * Effects (see sim/README.md, "events.js"). A news record is {atS, kind, fromS, toS, text}
 * and nothing else: never the event's id or list index (S-4: that would reveal how many
 * silent events came before).
 *   notice                 -> log line (info)
 *   heatAnnounce           -> news {kind:'heat', fromS: onsetS, toS: endS}, log warn, cue 'warn'
 *                             (args upliftPm / deratePm are integer per-mille)
 *   heatOnset / heatEnd    -> log; (derate and demand are read from ext.heat by grid/weather)
 *   stormWarn              -> news {kind:'storm', fromS: arriveS, toS: null}
 *   stormArrive/windCutout/stormPass, cloudOnset/cloudClear -> log only (the series carry the physics)
 *   cloudWarn              -> news {kind:'cloud', fromS: onsetS, toS: null}
 *   windDrought            -> news {kind:'drought', fromS: atS, toS: null}, log warn
 *   unitTrip               -> fleet.tripUnit on the rule's target (largest online machine by
 *                             output, or the station's largest online machine; none -> no-op).
 *                             Ties on output go to the lower V.MACHINES index (total order).
 *   linkTrip               -> fleet.tripTie(state, cause, lockoutS, out) (no-op if already tripped)
 *   smelterTrip            -> fleet.tripSmelter(state, offS, out)
 *   smelterReturn          -> state.smelter.returning = true
 * Also ramps state.smelter.loadMW back at SMELTER_RETURN_MW_MIN while returning.
 * @param {object} state
 * @param {Array<object>} out event records (sim/README.md "Event records")
 */
export function applyDue(state, out) { // eslint-disable-line no-unused-vars
  throw new Error('not implemented (stage B: events)');
}

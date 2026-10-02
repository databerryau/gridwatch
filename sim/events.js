// sim/events.js: the external event timeline (spec F-3, D-8; legacy menu L331-370).
//
// Stage A (implemented, frozen): prerollEvents() turns the scenario's event menu into a
// time-sorted list of ext events at createState. Nothing here ever depends on play.
// Stage B owner "market + events": applyDue(), which applies the events whose time has come.
// Phase 2a owner "world" (desk/README.md §21.1): mslSecond(), the P-4 Minimum System Load
// notices (C-9), from the forecast step() passes in.
//
// Event record (state.ext.events[i], plain JSON):
//   {id: 'e7', atS: 41520, type: 'unitTrip', args: {...}, contingency: true, warned: false}
// atS is the grid second (0 = 04:00). Contingency events (unitTrip, linkTrip, smelterTrip)
// trip exactly one element each: the largest credible contingency is <= 800 MW (F-13).

import {V} from './params.js';
import {STREAM, uniform, pickWith} from './rng.js';
import {gridSecond, tripUnit, tripTie, tripSmelter} from './fleet.js';

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
 *
 * Stage B notes. Information events push a log line (warned ones also an {kind:'announce',
 * news, cue:'warn'} record); trips log through fleet, and a trip with no target (nothing
 * of that station online, the link already out) is silent. Texts state only what the sim will
 * really do (the scenario's own numbers: uplift, derate, times, the storm's cut-out window),
 * never a hidden outcome (whether the link will trip, when the cloud clears). The smelter's
 * return ramp is time-based: loadMW = SMELTER_RETURN_MW_MIN / 60 x (s - returnS + 1), capped
 * at SMELTER_MW and never lowered; identical to "+rate every second" when called every
 * second, and still right when a caller jumps seconds. smelter.returnS (a private field) is
 * the second the return starts: set at the trip (trip second + offS, what the potline's
 * owner tells the operator) and again when smelterReturn applies; weather.forecast reads it.
 * @param {object} state
 * @param {Array<object>} out event records (sim/README.md "Event records")
 */
export function applyDue(state, out) {
  const s = gridSecond(state), evs = state.ext.events;
  while (state.evNext < evs.length && evs[state.evNext].atS <= s) {
    applyEvent(state, evs[state.evNext], out);
    state.evNext += 1;
  }
  const sm = state.smelter;
  if (sm.returning) {
    sm.loadMW = Math.min(SMELTER_MW, Math.max(sm.loadMW, RETURN_MW_S * (s - sm.returnS + 1))) + 0;
    if (sm.loadMW >= SMELTER_MW) {
      sm.returning = false;
      log(out, state.tick, 'good', 'SMELTER_BACK', 'Smelter potline back at full load (' + SMELTER_MW + ' MW).');
    }
  }
}

// ------------------------------------------------------------------ applyDue helpers (stage B)

const DAY_S = V.DAY_S, PM_PER_PCT = V.PER_MILLE / V.PCT;
const SMELTER_MW = V.SMELTER_MW, RETURN_MW_S = V.SMELTER_RETURN_MW_MIN / S_PER_MIN, EPS = V.MW_EPS;
// fleet.tripUnit writes 'UNIT TRIP: <name> (<cause>): <true MW> MW lost' (H-9). The sim has
// no failure-mode model, so the cause says only what happened.
const TRIP_CAUSE = 'protection trip';

// roofMsg (Phase 2a): the wording on a scenario with rooftop PV, where the sun leaving the roofs
// is most of the evening climb in demand on the grid (P-1).
const NOTICE = {
  MORNING_RAMP: {sev: 'info', msg: 'Morning ramp beginning: demand climbs steeply until mid-morning as the city wakes.'},
  DUCK: {sev: 'warn', msg: 'DUCK CURVE: utility solar is fading into the evening peak and net demand is climbing fast. ' +
    'Commit plant now if the plan is short.',
    roofMsg: 'DUCK CURVE: the sun is leaving the rooftops and the solar farm as the evening peak builds, and demand on the grid ' +
    'is climbing fast. Commit plant now if the plan is short.'},
  TROUGH: {sev: 'info', msg: 'Demand falling toward the overnight trough. Mind thermal minimum-load limits.'},
};

function log(out, tick, sev, code, msg) {
  out.push({tick, kind: 'log', sev, code, msg});
}

const pad2 = n => String(n).padStart(2, '0');

/** Clock text 'HH:MM' of grid second s (integer arithmetic, as observe's clock). */
function hhmm(scn, s) {
  const sod = ((Math.round(scn.clock.startH * S_PER_H) + Math.round(s)) % DAY_S + DAY_S) % DAY_S;
  return pad2(Math.floor(sod / S_PER_H)) + ':' + pad2(Math.floor((sod % S_PER_H) / S_PER_MIN));
}

/** A fraction as a percentage with at most one decimal (0.065 -> '6.5', 0.32 -> '32'). */
const pct = frac => String(Math.round(frac * V.PER_MILLE) / PM_PER_PCT);

function latestNews(state, kind) {
  for (let i = state.news.length - 1; i >= 0; i--) if (state.news[i].kind === kind) return state.news[i];
  return null;
}

function heatText(scn, a) {
  const r = V.HEAT_RAMP_S;
  return 'WEATHER BUREAU: extreme heat ' + hhmm(scn, a.onsetS) + '-' + hhmm(scn, a.endS) + '. Demand up to +' +
    a.upliftPm / PM_PER_PCT + '% (building from ' + hhmm(scn, a.onsetS - r) + ', easing by ' + hhmm(scn, a.endS + r) +
    '); coal and gas capacity -' + a.deratePm / PM_PER_PCT + '% from ' + hhmm(scn, a.onsetS) + ' to ' +
    hhmm(scn, a.endS) + '; clear skies.';
}

function stormText(scn, a) {
  const x = scn.events && scn.events.storm;
  let t = 'WEATHER BUREAU: storm front approaching from the west, arriving about ' + hhmm(scn, a.arriveS) +
    '. Wind output will surge, then fall away as turbines cut out in the gale';
  if (!x) return t + '. Interconnector faults are possible while it lasts.';
  // The scenario's storm timings, relative to this storm's arrival (public climatology).
  const at = h => a.arriveS + Math.round((h - x.arriveH) * S_PER_H);
  return t + ' (expected ' + hhmm(scn, at(x.cutoutWindowH[0])) + '-' + hhmm(scn, at(x.cutoutWindowH[1])) +
    '). Interconnector faults are possible until the front passes, about ' + hhmm(scn, at(x.passH)) + '.';
}

function cloudText(scn, a) {
  const x = scn.events && scn.events.cloud;
  const t = 'SATELLITE: cloud band moving over the solar precinct, overhead from about ' + hhmm(scn, a.onsetS) + '.';
  if (!x) return t;
  return t + ' Utility solar down to about ' + pct(x.frontMu) + '% of clear-sky for ' + x.clearAfterMin[0] + '-' +
    x.clearAfterMin[1] + ' min.';
}

function announce(state, out, e, kind, fromS, toS, text, code) {
  state.news.push({atS: e.atS, kind, fromS, toS, text});
  out.push({tick: state.tick, kind: 'announce', news: {atS: e.atS, kind, fromS, toS, text}, cue: 'warn'});
  log(out, state.tick, 'warn', code, text);
}

// F-3 trip targets are rules, not dice: the synchronised machine with the largest output
// (rule 'largest'), or that station's (rule 'station'); ties to the lower index; -1 = none.
function tripTarget(state, a) {
  const units = state.units;
  let best = -1, mw = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.sync || (a.rule === 'station' && u.station !== a.station)) continue;
    if (best < 0 || u.outMW > mw) { best = i; mw = u.outMW; }
  }
  return best;
}

function applyEvent(state, e, out) {
  const a = e.args, scn = state.scn, tick = state.tick;
  switch (e.type) {
    case 'notice': {
      const n = Object.hasOwn(NOTICE, a.code) ? NOTICE[a.code] : {sev: 'info', msg: 'Notice: ' + a.code};
      log(out, tick, n.sev, a.code, n.roofMsg && scn.rooftop.capacityMW > 0 ? n.roofMsg : n.msg);
      return;
    }
    case 'heatAnnounce':
      announce(state, out, e, 'heat', a.onsetS, a.endS, heatText(scn, a), 'HEAT_WARNING');
      return;
    case 'heatOnset': {
      const n = latestNews(state, 'heat');
      log(out, tick, 'crit', 'HEAT_ONSET', 'HEATWAVE CONDITIONS: coal and gas capacity -' + pct(V.HEAT_THERMAL_DERATE) + '%' +
        (n && n.toS !== null ? ' until ' + hhmm(scn, n.toS) : '') + ', demand up ' + pct(V.HEAT_DEMAND_UPLIFT) + '%, skies clear.');
      return;
    }
    case 'heatEnd':
      log(out, tick, 'good', 'HEAT_END', 'Heat easing: thermal derates removed; demand eases back over the next ' +
        Math.round(V.HEAT_RAMP_S / S_PER_MIN) + ' min.');
      return;
    case 'stormWarn':
      announce(state, out, e, 'storm', a.arriveS, null, stormText(scn, a), 'STORM_WARNING');
      return;
    case 'stormArrive':
      log(out, tick, 'crit', 'STORM_ARRIVE', 'STORM ARRIVAL: wind farms heading for storm output (about ' + pct(a.windMu) +
        '% of capacity).');
      return;
    case 'windCutout':
      log(out, tick, 'crit', 'WIND_CUTOUT', 'WIND CUT-OUT: turbines past their survival wind speed are shutting down; ' +
        'wind output falling toward about ' + pct(a.windMu) + '% of capacity.');
      return;
    case 'stormPass':
      log(out, tick, 'info', 'STORM_PASS', 'Storm front passed; wind settling toward about ' + pct(a.windMu) + '% of capacity.');
      return;
    case 'cloudWarn':
      announce(state, out, e, 'cloud', a.onsetS, null, cloudText(scn, a), 'CLOUD_WARNING');
      return;
    case 'cloudOnset':
      log(out, tick, 'info', 'CLOUD_ONSET', 'Cloud front overhead: utility solar falling toward about ' + pct(a.clearMu) +
        '% of clear-sky.');
      return;
    case 'cloudClear':
      log(out, tick, 'info', 'CLOUD_CLEAR', 'Skies clearing over the solar precinct.');
      return;
    case 'windDrought':
      announce(state, out, e, 'drought', e.atS, null, 'WIND DROUGHT: a high-pressure ridge has settled in. ' +
        'Wind resource falling toward about ' + pct(a.windMu) + '% of capacity.', 'WIND_DROUGHT');
      return;
    case 'unitTrip': {
      const i = tripTarget(state, a);
      if (i >= 0) tripUnit(state, i, TRIP_CAUSE, a.lockoutS, out);
      return;
    }
    case 'linkTrip':
      tripTie(state, a.cause, a.lockoutS, out);
      return;
    case 'smelterTrip':
      if (tripSmelter(state, a.offS, out) !== 0) state.smelter.returnS = e.atS + a.offS;
      return;
    case 'smelterReturn': {
      const sm = state.smelter;
      if (sm.loadMW >= SMELTER_MW - EPS) return; // nothing to bring back
      sm.returning = true;
      sm.returnS = e.atS;
      log(out, tick, 'info', 'SMELTER_RETURN', 'Smelter potline reconnecting: its ' + SMELTER_MW + ' MW return at ' +
        V.SMELTER_RETURN_MW_MIN + ' MW/min.');
      return;
    }
    default:
      return;
  }
}

// ------------------------------------------------------------------ MSL notices (P-4; Phase 2a, desk/README.md C-9)

const MSL_MW = [V.MSL1_MW, V.MSL2_MW, V.MSL3_MW]; // level 1, 2, 3: descending
const MSL_SEV = ['good', 'info', 'warn', 'crit']; // by the level reached (0 = the clear)
const MSL_SAYS = ['.', ': two load trips above the security floor.', ': one load trip above the security floor.',
  ': the security floor.']; // how each message ends, by the level reached

/** Whole MW as text with a thousands comma (1540 -> '1,540'); no locale (README §2 rule 1). */
const mwText = mw => String(Math.round(mw) + 0).replace(/\B(?=(\d{3})+$)/g, ',');

/**
 * P-4 Minimum System Load notices (desk/README.md C-9, §19.3, §21.1). step() calls this right
 * after weather.sampleSecond on every MSL_CHECK_S-th grid second with the forecast for that
 * second, fc = weather.forecast(state, FC_HORIZON_S, FC_STEP_S), so events.js imports nothing new.
 *
 * The tested quantity is the minimum forecast operational demand: the least of demand now
 * (env.demandMW) and fc.demandP50 over the 4.5-h window. A level is REACHED when it is at or
 * below that level's threshold (MSL1_MW / MSL2_MW / MSL3_MW, each raised by MSL_TIE_OUT_MW
 * while the tie is tripped: no export sink) and LEFT only once it is more than MSL_CLEAR_MW
 * above it (hysteresis: a notice does not chatter, K-8). msl.minMW and msl.atS (the grid second
 * of that minimum; now when the present is the minimum) are refreshed at every check; msl.level
 * and msl.sinceS (the grid second of the last change of level) move only on a change, and every
 * change pushes one record {tick, kind: 'log', sev, code, msg, level, minMW, atS}: code
 * 'MSL' + level or 'MSL_CLEAR' at 0, sev info / warn / crit for levels 1 / 2 / 3 and good for
 * the clear, minMW rounded to 1 MW, msg complete on its own in at most 25 words. Never a news
 * item (news is weather). On a scenario with no rooftop it returns at once: state.msl keeps its
 * createState value.
 * Reads: scn.rooftop.capacityMW, scn.clock, env.{s, demandMW}, tie.tripped, msl, tick, fc.
 * Writes: msl.*.
 * @param {object} state
 * @param {{fromS:number, stepS:number, n:number, demandP50:number[]}} fc
 * @param {Array<object>} out event records (sim/README.md "Event records")
 */
export function mslSecond(state, fc, out) {
  if (!(state.scn.rooftop.capacityMW > 0)) return;
  const env = state.env, msl = state.msl;
  let minMW = env.demandMW, atS = env.s;
  for (let k = 0; k < fc.n; k++) {
    if (fc.demandP50[k] < minMW) { minMW = fc.demandP50[k]; atS = fc.fromS + (k + 1) * fc.stepS; }
  }
  const lift = state.tie.tripped ? V.MSL_TIE_OUT_MW : 0;
  let level = 0;
  for (let i = 0; i < MSL_MW.length; i++) {
    const at = MSL_MW[i] + lift;
    if (minMW <= at || (i < msl.level && minMW <= at + V.MSL_CLEAR_MW)) level = i + 1;
  }
  msl.minMW = minMW + 0;
  msl.atS = atS;
  if (level === msl.level) return;
  msl.level = level;
  msl.sinceS = env.s;
  // The message names the level's own threshold as it stands (a level held by the hysteresis is
  // up to MSL_CLEAR_MW above it), so it is true on a rise, on a fall and on the clear.
  const name = 'MSL' + Math.max(1, level);
  const msg = (level === 0 ? 'MSL notice cancelled' : name + ' notice') + ': lowest forecast demand ' + mwText(minMW) +
    ' MW at ' + hhmm(state.scn, atS) + '. ' + name + ' is ' + mwText(MSL_MW[Math.max(1, level) - 1] + lift) + ' MW' +
    (lift > 0 ? ' (tie out)' : '') + MSL_SAYS[level];
  out.push({tick: state.tick, kind: 'log', sev: MSL_SEV[level], code: level === 0 ? 'MSL_CLEAR' : 'MSL' + level, msg,
    level, minMW: Math.round(minMW) + 0, atS});
}

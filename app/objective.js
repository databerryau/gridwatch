// app/objective.js: the desk's standing objective (SPEC §9.1 Q-18; Phase 2a: desk/README.md
// C-10, §21.4). Pure and DOM-free.
// Contract: desk/README.md §31.8 app/objective.js.

import {V} from '../sim/params.js';
import {SCENARIOS} from '../content/scenarios.js';
import {clockText, priceText} from '../render/format.js';
import {unitLabel} from '../desk/util.js';

/** The objective line and the consequence line are one line each: at most this many characters (§21.4). */
export const LINE_MAX_CHARS = 170;
/** A start is "now" when its latest moment is within this many grid seconds. */
export const ACT_WITHIN_S = 600;
/** Capacity under the forecast plus this (MW) is a shortfall: the forecast's own error at an hour or two. */
export const MARGIN_MW = 150;
/**
 * A unit is asked for when capacity is under the forecast plus this (MW): enough to lose the
 * largest unit (about 620 MW at the plan's loading) and still be within what the battery and one
 * gas turbine can make up. Par's rule 3 keeps 700 MW over full ratings and half the battery,
 * which is about 600 MW in this check's terms; measured in tests/objective.test.js (slow).
 */
export const COMMIT_MARGIN_MW = 650;
/** A shortfall ahead smaller than this is not worth a unit (MW). */
export const SHORT_MIN_MW = 100;
/** The plan short by this much within NOW_S is an emergency (MW, grid seconds). */
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
/** The look-ahead counts what a unit can reach within this long of a column (grid seconds); see capacityGap. */
export const RAMP_HEAD_S = 1800;

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

// ------------------------------------------------------------------ the capacity look-ahead

const heatNews = obs => { for (let i = obs.news.length - 1; i >= 0; i--) if (obs.news[i].kind === 'heat') return obs.news[i]; return null; };

/**
 * The public worst case for a HOT morning (§21.4): while the day reads HOT and no heatwave has
 * been announced, one still may be, mid-morning. Its window and sizes are the scenario's event
 * menu and the params (never state.ext): {fromS, toS, roofLoss} or null once the announcement
 * hour has passed, on a MILD day, or when a heatwave is already in the forecast.
 */
export function heatWorstCase(obs) {
  if (!obs.day || obs.day.temp !== 'HOT' || heatNews(obs)) return null;
  const scn = SCENARIOS[obs.scenarioId];
  const h = scn && scn.events && scn.events.heat;
  if (!h) return null;
  const toS = x => (x - scn.clock.startH) * S_PER_H;
  if (obs.s >= toS(h.announceH)) return null;
  return {fromS: toS(h.onsetH), toS: toS(h.endH), roofLoss: scn.rooftop ? 1 - scn.rooftop.heatFactor : 0};
}

// The 0..1 ramp of a heat window at grid second t (in over the hour before onset, out over the hour after).
const heatRamp = (w, t) => clamp(Math.min((t - (w.fromS - V.HEAT_RAMP_S)) / V.HEAT_RAMP_S, (w.toS + V.HEAT_RAMP_S - t) / V.HEAT_RAMP_S), 0, 1);

// Seconds from now until unit u (an observe row) is at minimum load, by its mode; -1: not coming.
function onInS(u, m) {
  switch (u.mode) {
    case 'on': return 0;
    case 'loading': return u.timerS;
    case 'ready': return u.timerS + m.t2S;
    case 'starting': return u.timerS + AUTO + m.t2S;
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
 * @param {{marginMW?:number, without?:string, leaving?:string, rert?:boolean, heat?:object|null, plus?:{unit:string, atS:number}, real?:boolean, water?:boolean}} [o]
 *   without: a unit id counted as stopped; leaving: a unit id counted as stopped NOW, on its way
 *   down its ramp and the T4 slope (what a STOP press does; a unit already unloading or in
 *   shutdown is always counted so); rert: false leaves the reserve diesel out; heat: a
 *   heatWorstCase() window to apply; plus: a unit counted as started at atS. real: what the desk
 *   can really give, not what it is wise to plan on: no margin unless one is given, hydro before
 *   HOLD_UNTIL too, the tie at its import limit (the dispatch goes there when it is short) and
 *   every unit only as far as its ramp takes it from where it is now. water: true counts hydro
 *   before HOLD_UNTIL too (tripGap).
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
  const news = heatNews(obs), worst = o.heat || null;
  // when each unit is at minimum load, the MW it climbs from there, and when it leaves
  const onS = new Float64Array(obs.units.length), offS = new Float64Array(obs.units.length), fromMW = new Float64Array(obs.units.length);
  // units on their way off (unloading, in shutdown, or the one a STOP press would send): their own path down
  const going = obs.units.map(u => u.mode === 'unloading' || u.mode === 'shutdown' || (o.leaving === u.id && (u.mode === 'on' || u.mode === 'loading')));
  obs.units.forEach((u, i) => {
    const d = onInS(u, M[i]);
    onS[i] = d >= 0 ? s + d : u.mode === 'off' && starts.has(u.id) ? starts.get(u.id) + u.startToMinS : Infinity;
    if (o.plus && o.plus.unit === u.id && !Number.isFinite(onS[i])) onS[i] = o.plus.atS + u.startToMinS;
    offS[i] = stops.has(u.id) ? stops.get(u.id) : Infinity;
    if (o.without === u.id || o.leaving === u.id || going[i]) onS[i] = Infinity;
    fromMW[i] = u.mode === 'on' ? Math.max(u.outMW, u.minMW) : u.minMW;
  });
  const rert = obs.rert, useRert = o.rert !== false && rert.armed && !rert.standingDown;
  for (let k = 0; k < n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    const hot = (news && t >= news.fromS && t < news.toS) || (worst && t >= worst.fromS && t < worst.toS);
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
    const tie = obs.tie.tripped && t < s + obs.tie.lockoutS ? 0 : real ? obs.tie.importLimitMW : Math.min(obs.tie.importLimitMW, TIE_FIRM_MW);
    // The dispatch keeps the water for the evening (it runs hydro before HOLD_UNTIL only above
    // its keep line, which a morning uses up), so hydro is firm capacity from then on only.
    const cap = thermal + (t >= HOLD_UNTIL_S || real || o.water ? Math.min(hydro, water) : 0) + tie + fc.windMW[k] + fc.solarMW[k] +
      (useRert ? (t >= s + rert.leadS ? V.RERT_MW : rert.outMW) : 0);
    let demand = fc.demandP50[k];
    if (worst) {
      const r = heatRamp(worst, t);
      // an unannounced heatwave: the uplift on the underlying load, and hot roofs give less
      if (r > 0) demand += r * (V.HEAT_DEMAND_UPLIFT * (fc.underlyingP50 ? fc.underlyingP50[k] : fc.demandP50[k]) + worst.roofLoss * (fc.rooftopMW ? fc.rooftopMW[k] : 0));
    }
    gap[k] = demand + margin - cap;
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
 * @param {object} [o] capacityGap's options (marginMW, without, rert, heat, plus)
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
function startable(obs) {
  const booked = new Set(obs.plan.starts.map(e => e.unit));
  return obs.units.filter(u => u.mode === 'off' && u.startBlock === '' && !booked.has(u.id)).map(u => {
    const climb = Math.max(0, u.ratingMW * (u.station === 'hydro' ? 1 : LOADING) - u.minMW) / (u.rampMWMin / S_PER_MIN);
    return {unit: u.id, id: 'guard-start-' + u.id, lead: u.startToMinS, climb, plan: u.startToMinS + Math.max(0, climb - RAMP_HEAD_S),
      offer: u.station === 'hydro' ? HYDRO_LAST : u.offer, cls: u.cls};
  }).sort((a, b) => a.offer - b.offer || a.lead - b.lead);
}

// "49 min to reach the grid"; for a machine with a long climb, "2.1 h to reach the grid and 2.1 h more to full load".
const leadText = c => minText(c.lead) + ' to reach the grid' + (c.plan > c.lead ? ' and ' + minText(c.climb) + ' more to full load' : '');

/** The largest single loss of supply once `without` is gone (MW): the firm tie import, or the largest committed machine at the plan's loading. */
export function largestLoss(obs, without) {
  let big = obs.tie.tripped ? 0 : TIE_FIRM_MW;
  obs.units.forEach((u, i) => { if (u.id !== without && onInS(u, M[i]) >= 0 && u.availMW * LOADING > big) big = u.availMW * LOADING; });
  return big;
}

// ------------------------------------------------------------------ what a stop saves

// The cost ($/h) of supplying x MW from the flexible blocks [{mw, offer}], cheapest first; what
// the blocks cannot give is charged at the last block's offer (the stop check keeps that from happening).
function stackCost(blocks, x) {
  let cost = 0, left = x, last = 0;
  for (const b of blocks) {
    if (left <= 0) break;
    const take = Math.min(left, b.mw);
    cost += take * b.offer; left -= take; last = b.offer;
  }
  return cost + Math.max(0, left) * last;
}

/**
 * What stopping unit u now saves, in dollars, if it stays off until backS (the second it is
 * started again; Infinity: not again today) (§21.4 condition 4). For each idle column: its minimum
 * MW x (its offer - the cost of the energy that replaces it) + its no-load; less one start when it
 * comes back today. The replacement is free in columns where power would be spilled (the plan
 * view's surplusMW inside the 4.5-h window; the same arithmetic on the day-ahead beyond it),
 * otherwise it comes from the cheapest committed sources with room: the merit order of the other
 * machines above their minimums, hydro at its water value (the plan view's waterValue, P-6) and
 * the tie at the neighbour's price. planview: app/planview.js (ctx.planview).
 */
export function stopSaving(obs, u, backS, fc, proj, planview) {
  const s = obs.s, m = M.find(x => x.id === u.id), h = fc.stepS / S_PER_H;
  const unloadS = Math.max(0, u.outMW - u.minMW) / m.rampMWs;
  // off line from half-way down the T4 slope until half-way up the T2 slope of its return
  const offS = s + unloadS + m.t4S / 2, onS = Number.isFinite(backS) ? backS + m.t1S + AUTO + m.t2S / 2 : DAY_S;
  const wv = planview.waterValue(obs.hydro.frac);
  let saving = 0;
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS;
    if (t <= offS || t > onS) continue;
    let floor = 0, big = 0;
    const blocks = [];
    obs.units.forEach((x, i) => {
      if (x.id === u.id || onInS(x, M[i]) < 0 || t < s + onInS(x, M[i])) return;
      const top = x.ratingMW * LOADING;
      if (x.station === 'hydro') { blocks.push({mw: x.ratingMW, offer: wv}); return; }
      floor += x.minMW;
      if (top > big) big = top;
      blocks.push({mw: Math.max(0, top - x.minMW), offer: x.offer});
    });
    const tripped = obs.tie.tripped && t < s + obs.tie.lockoutS;
    const exp = tripped ? 0 : fc.exportLimitMW[k];
    // the tie as a price-taking block from full export to its secure import (the largest unit)
    if (!tripped) blocks.push({mw: exp + Math.min(obs.tie.importLimitMW, big), offer: fc.neighbourPrice[k]});
    blocks.sort((a, b) => a.offer - b.offer);
    // MW the flexible blocks must give, with the unit off and with it at its minimum
    const net = fc.demandP50[k] - fc.windMW[k] - fc.solarMW[k] - (floor - exp);
    const inProj = proj && k < proj.n && Math.abs(proj.times[k] - t) < 1;
    const replace = inProj && proj.surplusMW[k] > 0 ? 0 : stackCost(blocks, Math.max(0, net)) - stackCost(blocks, Math.max(0, net - u.minMW));
    saving += (u.minMW * u.offer + m.noLoadPerS * S_PER_H - replace) * h;
  }
  return saving - (Number.isFinite(backS) ? m.startCost : 0);
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
 * @param {{edited?:boolean, planview:object, proj?:object, dayAhead?:object|null, leadS?:number}} ctx edited: the
 *   player holds levers by hand (app/system.js sys.edited); planview: app/planview.js; proj: its
 *   project(obs) if the caller already has it; dayAhead: observe(state, {dayAhead: true}).dayAhead,
 *   the forecast to 04:00 (without it the line looks 4.5 h ahead only); leadS: grid seconds more
 *   to a START's ACT_WITHIN_S (the game's reading time; default 0)
 */
export function objective(obs, ctx) {
  const PV = ctx.planview;
  if (obs.over) return Object.assign({}, NONE);
  if (obs.inWatch) return Object.assign({}, NONE, {level: 'act', kind: 'watch', text: tripped(obs.contingency) + ' The desk is locked while the grid catches itself: watch.'});
  const s = obs.s;
  const proj = ctx.proj || PV.project(obs);
  const day = ctx.dayAhead || obs.forecast;
  const reds = PV.redRuns(proj);
  const long = (PV.blueRuns ? PV.blueRuns(proj)[0] : null) || null;
  const X = {obs, s, proj, day, long, thin: capacityShort(obs), edited: !!ctx.edited, PV, act: ACT_WITHIN_S + (ctx.leadS || 0)};
  // the plan's largest deficit in the columns within NOW_S (never a later column of the same red run)
  X.redNowMW = 0;
  for (let k = 0; k < proj.n && proj.times[k] - s <= NOW_S; k++) if (proj.gap[k] === 'red' && proj.deficit[k] > X.redNowMW) X.redNowMW = proj.deficit[k];
  const line = (o, extra) => Object.assign({level: 'ok', kind: 'quiet', text: '', targets: [], action: null, startBy: -1, short: X.thin, long}, o, extra);

  // 1. The levers are held by hand and the plan is short: hand them back.
  const red = reds.find(r => r.atS - s <= NOW_S && X.redNowMW >= CRIT_MW) || null;
  const heldRed = ctx.edited ? red || reds.find(r => r.mw >= SHORT_MIN_MW) || null : null;
  if (heldRed) {
    const now = heldRed.atS - s <= NOW_S;
    return line({level: 'crit', kind: 'held', text: 'With levers held by hand the plan is ' + mwText(now ? Math.max(X.redNowMW, SHORT_MIN_MW) : heldRed.mw) + ' below demand' +
      (now ? ' now' : ' from ' + at(heldRed.atS)) + '. RE-DISPATCH (N) hands every lever back to the plan.', targets: ['btn-redispatch'], action: {redispatch: true}, startBy: s});
  }

  // 2. Short right now: the fast answers.
  const now = shortNow(X, line);
  if (now) return now;

  // 3-9. The first branch with something to do now; else the first critical one (the reserve diesel
  // on its way: said, but never in place of what the battery can do meanwhile); else the first with
  // something to say.
  let passive = null, crit = null;
  for (const branch of [commitNow, shortAhead, restore, spare, stop, battery, commitLater]) {
    const x = branch(X, line);
    if (!x) continue;
    if (x.action) return x;
    if (x.level === 'crit') { if (!crit) crit = x; } else if (!passive) passive = x;
  }
  if (crit || passive) return crit || passive;

  // 10. Quiet.
  return quiet(X, line, !!ctx.dayAhead);
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
  // but by less than SHORT_MIN_MW (a unit is asked for from there)
  const G = tripGap(obs, day, COMMIT_TRIP_MW);
  let thinS = -1;
  for (let k = 0; k < G.n && thinS < 0; k++) if (G.gap[k] >= THIN_MW) thinS = G.fromS + (k + 1) * G.stepS;
  if (thinS < 0) return line({text: 'Enough plant is committed for ' + (dayAhead ? 'the rest of the day. ' : 'the next 4½ hours. ') + peak});
  const fits = t => (t.length + 1 + peak.length <= LINE_MAX_CHARS ? t + ' ' + peak : t);
  if (startable(obs).length) {
    return line({text: fits('Committed plant covers the forecast, but with little spare for a trip' + (thinS - X.s > S_PER_H ? ' from about ' + at(Math.ceil(thinS / QUARTER_S) * QUARTER_S) : '') + '.')});
  }
  // Every unit that can run is committed: what they cannot give, even at their limits, is the
  // battery's and demand response's to carry (the reserve diesel's only beyond both).
  const all = obs.units.every(u => u.mode !== 'off' && u.mode !== 'tripped') ? 'Every unit is committed. ' : 'Every unit that can run is committed. ';
  const R = capacityGap(obs, day, {real: true});
  const run = firstRun(R);
  if (run) {
    const mw = figure(hourOf(R, run));
    return line({text: all + 'From about ' + atMark(Math.max(X.s, run.crossS)) + ' demand is about ' + mw + ' more than they can give: ' +
      (beyondReserves(obs, R, run) ? 'more than the battery and demand response can carry.' : 'the battery, then demand response, carry it.')});
  }
  return line({text: fits(all + 'If demand outruns them, the battery and demand response carry the rest: this line will say when.')});
}

/** The quiet line's thin band (MW short of a trip's worth of spare): from here to SHORT_MIN_MW it says so. */
export const THIN_MW = 50;

// The commitment look-ahead, once per line: the gap at the commit margin over the day, and the
// unit to start for its first shortfall that a start can still reach (§21.4, the start cascade:
// never a second start for a shortfall the first cannot reach either).
function lookAhead(X) {
  if (X.ahead !== undefined) return X.ahead;
  const obs = X.obs, s = X.s;
  const G = tripGap(obs, X.day, COMMIT_TRIP_MW);
  const first = firstRun(G);
  X.ahead = null;
  if (!first) return null;
  const all = startable(obs);
  const fastest = all.reduce((a, c) => (!a || c.lead < a.lead ? c : a), null);
  // the first shortfall a start made now could still be on for
  const reach = fastest ? firstRun(G, s + fastest.lead) : null;
  let c = null;
  if (reach) {
    const inTime = all.filter(x => s + x.lead <= reach.atS);
    c = inTime[0] || fastest;
  }
  const T = capacityGap(obs, X.day, {marginMW: MARGIN_MW});
  X.ahead = {first, reach, unit: c, startBy: c ? Math.max(s, reach.atS - c.plan) : -1, thin: thinOf(T, reach || first), none: all.length === 0};
  return X.ahead;
}

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
// lacks against a safe margin (the grid is not short now, and frequency says so).
function shortHead(X, fromS, thin) {
  const s = X.s, nowish = fromS - s <= NOW_S;
  if (thin.real && !nowish) return 'You will be ' + mwText(thin.mw) + ' short from ' + needAt(thin, fromS) + '. ';
  if (thin.real) {
    const R = realShort(X);
    return R.nowMW >= BATT_MIN_MW ? 'Your units are ' + figure(R.nowMW) + ' below demand now. ' : 'Within the hour you will be up to ' + mwText(thin.mw) + ' short of a safe margin. ';
  }
  if (!nowish) return 'From about ' + needAt(thin, fromS) + ' one trip would leave you short. ';
  return (recentTrip(X.obs) ? 'Another' : 'One') + ' trip now would leave you short. ';
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
    const d = onInS(u, M[i]);
    const t = u.mode === 'starting' || u.mode === 'ready' ? obs.s + d : u.mode === 'off' && booked.has(u.id) ? booked.get(u.id) + u.startToMinS : -1;
    if (t >= 0 && (!best || t < best.atS)) best = {name: unitName(u.id), atS: t};
  });
  return best;
}

// What the desk cannot give even at its limits (capacityGap real), once per line, net of the
// demand response already called (while its hour lasts); <= 0 is spare:
//   soonMW   the largest such shortfall in the next ACT_WITHIN_S + NOW_S: what the battery must carry now
//   aheadMW  the largest in the NOW_S after that: an order is sized for it, so the gap does not outgrow it
//            within minutes of the order (an evening ramp adds 100 MW of gap in five)
//   halfMW   the largest in the next half hour (an order is eased only against that)
//   hourMW   the largest within the hour, and hourAtS when it begins (-1: not within the hour)
//   untilS   when the shortfall that begins within the hour ends (-1: none; the window's end if it outlasts it)
//   nowMW    the largest in the columns within NOW_S, net also of the battery's present discharge order
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
      if (lead <= ACT_WITHIN_S + NOW_S && g > soonMW) soonMW = g;
      if (lead <= ACT_WITHIN_S + 2 * NOW_S && g > aheadMW) aheadMW = g;
      if (lead <= S_PER_H / 2 && g > halfMW) halfMW = g;
      if (lead <= NOW_S && g - have > nowMW) nowMW = g - have;
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
  if (!planShort && !sagging && !capShort) return null;
  const mw = Math.max(planShort ? X.redNowMW : 0, sagging ? obs.agc.unmetMW : 0, R.nowMW, SHORT_MIN_MW);
  const fast = [];
  // The battery first: it is there in seconds and costs only its wear. Sized to the deficit, from
  // the charge above its reserve; MW held back as GUARD are worth more as power while the desk is
  // short (par's rule 2), so the ring comes down first when the order needs the room.
  const have = b.mode === 'discharge' ? b.orderMW : 0;
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
  if (A && A.unit && A.startBy - s <= X.act) {
    fast.push({id: A.unit.id, say: 'start ' + unitName(A.unit.unit) + ' (' + minText(A.unit.lead) + ')', action: {type: 'start', unit: A.unit.unit}});
  }
  // Demand response when neither can answer: a call is dear and there are few.
  if (!fast.length && obs.dr.callsLeft > 0 && !(obs.dr.activeS > 0)) fast.push({id: 'btn-dr', say: 'call demand response (hold D): industry cuts ' + mwText(V.DR_MW) + ' for ' + spanText(V.DR_DURATION_S), action: {type: 'callDR'}});
  // (not "short": the BALANCE bar's word)
  let text = 'The plan is ' + figure(mw) + ' below demand now';
  if (fast.length) {
    text += ': ' + fast.map(f => f.say).join(', or ') + '.';
    if (fast[0].id === 'dial-battery' && text.length <= 145) text += ' It answers in seconds.';
  } else {
    const a = arriving(obs);
    text += '. ' + (a ? a.name + ' arrives at ' + at(a.atS) + '; until then ' + carries(obs) + '.' : 'Everything that can help is already on its way.');
  }
  return line({level: 'crit', kind: 'short', text, targets: fast.map(f => f.id), action: fast.length ? fast[0].action : null, startBy: s});
}

// 3. Not enough plant committed within the 4.5-h window: the cheapest unit that still makes it.
function commitNow(X, line) {
  const A = lookAhead(X), obs = X.obs, s = X.s;
  if (!A) return null;
  if (A.unit) {
    if (A.reach.atS - s > V.FC_HORIZON_S) return null; // commit-later's
    const c = A.unit, act = A.startBy - s <= X.act, name = unitName(c.unit);
    // a shortfall that begins before any start can arrive: say what carries it meanwhile, and only
    // a gap the desk really has (the real check), never the margin's
    const late = A.first.atS < A.reach.atS && A.first.endS >= A.reach.atS - X.day.stepS;
    const arriveS = s + c.lead, gapS = act ? realBefore(X, arriveS) : -1;
    const tgt = {level: act ? 'act' : 'plan', kind: 'commit', targets: [c.id], action: act ? {type: 'start', unit: c.unit} : null, startBy: Math.max(s, A.startBy), short: pub(A.reach)};
    if (late && act && arriveS - A.first.crossS >= RAMP_HEAD_S) {
      // a slow machine for a shortfall it cannot reach (a coal unit for the evening): when it
      // arrives, and what holds the desk until then
      return line(Object.assign(tgt, {text: 'Start ' + name + ' now: it reaches the grid at ' + at(arriveS) + ', too late for ' + atMark(A.first.crossS) + '. Until then, ' +
        (gapS >= 0 ? 'what the plant cannot give is the battery\'s to carry.' : 'the plant covers the forecast with less spare than it should have.')}));
    }
    const head = shortHead(X, late ? A.first.crossS : A.reach.crossS, A.thin);
    return line(Object.assign(tgt, {text: head + 'Start ' + name + (act ? ' now' : ' by ' + atMark(A.reach.crossS - c.plan)) + ': it takes ' + leadText(c) +
      (gapS >= 0 && c.plan === c.lead ? '; until then ' + carries(obs) : '') + '.'}));
  }
  if (!A.none || A.first.atS - s > V.FC_HORIZON_S) return null;
  // Every unit is committed. What the desk then cannot give even at its limits is the battery's
  // and demand response's to carry (shortAhead says so); the reserve diesel only for what is
  // beyond them, and only for a shortfall its 20 minutes can still reach.
  const R = capacityGap(obs, X.day, {real: true});
  const late = firstRun(R, s + V.RERT_LEAD_S, s + V.FC_HORIZON_S);
  if (!late || !beyondReserves(obs, R, late)) return null;
  const head = 'You will be ' + figure(hourOf(R, late)) + ' short from ' + atMark(late.crossS) + ', more than the battery and demand response can carry. ';
  if (obs.rert.armed) return line({level: 'crit', kind: 'commit', text: head + (obs.rert.standingDown ? 'The reserve diesel is standing down: it can be armed again once it is off.' : 'The reserve diesel is on its way.'), startBy: s, short: pub(late)});
  const arm = late.atS - s <= V.RERT_LEAD_S + ACT_WITHIN_S; // (not X.act: spare()'s 45 min)
  return line({level: 'crit', kind: 'commit', text: head + 'The reserve diesel (hold E) takes 20 min and costs dearly' + (arm ? '.' : ': arm it by ' + atMark(late.atS - V.RERT_LEAD_S) + '.'),
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
  if (A && A.unit) return null; // a unit can still be started for it: commit-now's
  if (!(R.hourMW >= BATT_MIN_MW)) return null;
  const above = b.socMWh - RESERVE_MWH, soon = R.soonMW >= BATT_MIN_MW, have = b.mode === 'discharge' ? b.orderMW : 0;
  const drFree = obs.dr.callsLeft > 0 && !(obs.dr.activeS > 0);
  const fromAt = at(Math.floor(R.hourAtS / AHEAD_MARK_S) * AHEAD_MARK_S);
  // While the battery is discharging and no larger order is due yet: one line, the same words
  // whether the gap is open now or later in the hour, so the desk can keep it (never "demand is
  // covered" and "more than ... can give" in turn, never "be ready to discharge" while it is).
  const carrying = () => line({level: 'plan', kind: 'battery', targets: ['dial-battery'], text: 'From about ' + fromAt + ' to about ' + at(Math.ceil(R.untilS / AHEAD_MARK_S) * AHEAD_MARK_S) +
    ' demand is more than every committed unit can give. The battery is carrying it: leave it discharging.'});
  if (!soon) {
    // ahead: what is coming and what will carry it (no MW: the figure moves with every forecast)
    if (have > 0) return carrying();
    const more = drFree && (R.mwh > above || R.hourMW > b.ratedMW);
    const what = more ? 'The battery and demand response carry it: be ready to call demand response (hold D) then.' : 'The battery carries it: be ready to discharge it then.';
    return line({level: 'plan', kind: 'commit', text: 'From about ' + fromAt + ' demand is more than every committed unit can give. ' + what,
      targets: more ? ['btn-dr', 'dial-battery'] : ['dial-battery'], startBy: R.hourAtS - ACT_WITHIN_S});
  }
  const head = 'Demand is ' + figure(R.soonMW) + ' more than every committed unit can give';
  // More than the battery holds, in MW or in MWh: demand response shares it, called as the gap opens
  // (before the battery's order, not minutes after it; a call is an hour of DR_MW: not spent on a gap
  // that stays under half of that while the battery can still carry it). Judged on the next quarter of
  // an hour; when a battery order is due now, on the NOW_S after that too (aheadMW, as the order is
  // sized), so the call is not made minutes after the order.
  const gapMW = carryMW(b, R.soonMW) > have ? R.aheadMW : R.soonMW;
  const longer = R.mwh > above && gapMW >= V.DR_MW / 2, wider = gapMW > b.ratedMW, empty = !(above > gapMW * BATT_MIN_H);
  if (drFree && (longer || wider || empty)) {
    return line({level: 'act', kind: 'short', text: head + ', ' + (wider ? 'more than the battery can give' : empty ? 'and the battery is nearly empty' : 'for longer than the battery lasts') +
      '. Call demand response (hold D): industry cuts ' + mwText(V.DR_MW) + ' for ' + spanText(V.DR_DURATION_S) + '.', targets: ['btn-dr'], action: {type: 'callDR'}, startBy: s});
  }
  const mw = carryMW(b, R.aheadMW);
  if (carryMW(b, R.soonMW) <= have) return carrying();
  if (!(above > R.soonMW * BATT_MIN_H)) return null;
  // the whole inverter for the evening's gap: the ring comes down once, all the way (as par's rule 2 gives it up)
  if (guardFor(b, mw) >= 0) {
    return line({level: 'act', kind: 'short', text: head + '. The battery carries it: turn its GUARD down to 0 MW, then discharge it.', targets: ['ring-guard', 'dial-battery'],
      action: {type: 'guard', mw: 0}, startBy: s});
  }
  return line({level: 'act', kind: 'short', text: head + '. Discharge the battery at ' + mwText(mw) + '.', targets: ['dial-battery'], action: {type: 'battery', mode: 'discharge', mw}, startBy: s});
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

// 4. Dark districts, once supply is in hand.
function restore(X, line) {
  const obs = X.obs, dark = obs.districts.filter(d => d.dark);
  if (!dark.length) return null;
  const n = dark.length + (dark.length === 1 ? ' district is' : ' districts are') + ' dark';
  const ok = dark.find(d => d.restoreBlock === '');
  if (ok) return line({level: 'act', kind: 'restore', text: n + ' and the permissive lamp is lit. Close a feeder: R, then Enter.', targets: ['bay-restore'], action: {type: 'restore', district: ok.id}, startBy: X.s});
  return line({level: 'plan', kind: 'restore', text: n + '. A feeder closes once frequency is steady and there is spare reserve to carry it.', targets: ['bay-restore', 'gauge-n1']});
}

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
    return line({level: 'act', kind: 'spare', text: 'Frequency is high: the battery GUARD is still giving its ' + mwText(b.ffrMW) + ' after the trip. Turn it down to 0 MW; ' +
      'it can go back up once the GUARD has re-armed.', targets: ['ring-guard'], action: {type: 'guard', mw: 0}, startBy: s});
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
  // cheapest gas turbine that restores it). With districts dark, also what the smallest of them picks up.
  const dark = obs.districts.filter(d => d.dark);
  const pickup = dark.length ? Math.min(...dark.map(d => d.coldLoadMW)) : 0;
  const needMW = Math.max(V.PAR_TIGHT_RATIO * sec.lMW, pickup) - sec.r5MW;
  if (!(needMW > 0) && !(sec.lKind !== 'none' && sec.previewNadirHz < V.PAR_NADIR_MIN_HZ)) return null;
  // (one at a time: not while a machine is within a quarter of an hour of the grid)
  const coming = obs.units.some((u, i) => { const d = u.mode === 'loading' ? u.timerS : onInS(u, M[i]); return d > 0 && d <= QUARTER_S; });
  if (!coming) {
    const fastOnes = startable(obs).filter(c => c.lead <= V.STACK_START_WITHIN_S + AUTO).map(c => {
      const u = obs.units.find(x => x.id === c.unit);
      return Object.assign(c, {offer: u.offer, headMW: Math.min(u.availMW - u.minMW, u.rampMWMin * V.R5_WINDOW_MIN)});
    }).sort((a, c) => a.offer - c.offer || a.lead - c.lead);
    const c = fastOnes.find(x => x.headMW >= needMW) || fastOnes[0];
    if (c) {
      const free = c.cls === 'hydro', A = lookAhead(X);
      // the unit the commit line was about to ask for anyway: both reasons in one line, so "now" and
      // "by 17:45" for the same machine do not take turns
      if (A && A.unit && A.unit.unit === c.unit && A.reach.atS - s <= V.FC_HORIZON_S) {
        return line({level: 'act', kind: 'spare', text: 'Start ' + unitName(c.unit) + ' now (' + minText(c.lead) + '): spare is short already, and ' +
          (A.thin.real ? 'you will be ' + mwText(A.thin.mw) + ' short from ' + needAt(A.thin, A.reach.crossS) + '.' : 'from about ' + needAt(A.thin, A.reach.crossS) + ' one trip would leave you short.'),
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

/** The dearest committed gas unit (§21.4): CCGT or GT, on, coming or booked; ties: the highest index. Never coal, never hydro. */
export function stopCandidate(obs) {
  const booked = new Set(obs.plan.starts.map(e => e.unit));
  let best = null;
  obs.units.forEach((u, i) => {
    if (!GAS.has(u.cls)) return;
    if (onInS(u, M[i]) < 0 && !(u.mode === 'off' && booked.has(u.id))) return;
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
  // with the unit off is made up by starts, not by the evening's water). On a HOT morning with no
  // heatwave announced, also with the heat's uplift and derate applied to its window.
  const unloadS = Math.max(0, u.outMW - u.minMW) / m.rampMWs;
  const W = unloadS + m.t4S + m.minDownS + u.startToMinS + STOP_CLEAR_S;
  const n1 = {marginMW: MARGIN_MW + largestLoss(obs, u.id), without: u.id};
  if (firstRun(capacityGap(obs, X.day, n1), -Infinity, s + W)) return null;
  const worst = heatWorstCase(obs);
  if (worst && firstRun(capacityGap(obs, X.day, Object.assign({heat: worst}, n1)), -Infinity, s + W)) return null;
  // when the line will ask for it back: the first shortfall at the commit margin without it
  const need = firstRun(tripGap(obs, X.day, COMMIT_TRIP_MW, {without: u.id}));
  const backS = need ? Math.max(s + unloadS + m.t4S + m.minDownS, need.atS - u.startToMinS) : Infinity;
  const saving = stopSaving(obs, u, backS, X.day, X.proj, X.PV);
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
    : spareOk + name + ' ' + until + '. Stop it: saves about ' + usdText(saving) + (need ? ' if nothing trips before then' : '') + '.' + again;
  return line({level: msl ? 'act' : 'plan', kind: 'stop', text, targets: ['guard-stop-' + u.id], action: {type: 'stop', unit: u.id}, startBy: s, saving});
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
    for (let k = 0; k < proj.n && proj.times[k] - s <= NOW_S; k++) if (proj.surplusMW[k] > spillAhead) spillAhead = proj.surplusMW[k];
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
    const late = s >= CHARGE_BY_S - ACT_WITHIN_S;
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

// 8. A shortfall beyond the 4.5-h window: what to start next, and by when.
function commitLater(X, line) {
  const A = lookAhead(X);
  if (!A || !A.unit) return null;
  const c = A.unit;
  // (until then nothing is short, margin included: the hours with nothing to do are said to be so)
  const tail = A.first.atS - X.s > V.FC_HORIZON_S && leadText(c).length < 30 ? '; until then the plant you have covers the forecast' : '';
  return line({level: 'plan', kind: 'commit', text: 'Next: start ' + unitName(c.unit) + ' by ' + atMark(A.reach.crossS - c.plan) + ' for ' + partOfDay(A.reach.atS) + '. It takes ' + leadText(c) + tail + '.',
    targets: [c.id], startBy: A.startBy, short: pub(A.reach)});
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
 * @param {{dayAhead?:object|null, planview?:object}} [ctx]
 * A STOP that opens a shortfall says what the press itself costs: the MW that would be missing
 * that are not missing already (the evening's units not yet started are the objective's to ask
 * for, not this press's doing).
 * @returns {{target:string, text:string, level:'ok'|'plan'|'crit'}|null} level 'crit' when the press
 *   opens a shortfall the unit cannot be back for
 */
export function consequence(obs, target, ctx = {}) {
  const hit = /^guard-(start|stop)-(.+)$/.exec(target || '');
  if (!hit || obs.over || obs.inWatch) return null;
  const u = obs.units.find(x => x.id === hit[2]);
  if (!u) return null;
  const m = M.find(x => x.id === u.id), s = obs.s, name = unitName(u.id), day = ctx.dayAhead || obs.forecast;
  const out = (text, level = 'plan') => ({target, text, level});
  const reason = why => why.replace(/^unit is /, 'the unit is ').replace(/: (\d+) min left$/, (x, n) => ', ' + spanText(n * S_PER_MIN) + ' left');
  const syncS = obs.mode === 'AGC' ? AUTO : 0, onGrid = u.minMW > 0 ? 'at minimum load' : 'on the grid';
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
      const now = short.atS - s <= NOW_S, from = now ? 'At once' : 'From ' + atMark(short.crossS);
      return out(head + (already ? ' ' + from + ' you would need ' + mwText(mw) + ' more than the line asks for.'
        : now ? ' You would be ' + mwText(mw) + ' short at once.' : ' ' + cap(partOfDay(short.atS)) + ' would be ' + mwText(mw) + ' short from ' + atMark(short.crossS) + '.'), 'crit');
    }
  }
  const trip = firstRun(tripGap(obs, day, COMMIT_TRIP_MW, lv));
  if (trip && trip.crossS < backS) return out(head + (trip.atS - s <= NOW_S ? ' One trip would then leave you short.' : ' From ' + atMark(trip.crossS) + ' one trip would then leave you short.'), 'crit');
  // the latest START that is back in time: no sooner than minimum down time allows after a stop (C-12:
  // from breaker open); a cancelled start never closed the breaker, so it may start again at once
  if (trip) {
    const againS = Math.max(cancel ? s : openS + m.minDownS, trip.crossS - u.startToMinS);
    return out(head + ' It is needed again from ' + atMark(trip.crossS) + ': start it ' + (againS - s < FC_MARK_S ? 'again at once.' : 'by ' + atMark(againS) + '.'));
  }
  return out(head + ' Nothing ahead needs it today.');
}

const cap = t => (t === 'tonight' ? 'Tonight' : t === 'the evening' ? 'Tonight\'s peak' : t.charAt(0).toUpperCase() + t.slice(1));

// ------------------------------------------------------------------ the line as it is shown

/**
 * A waiting line stands for STEADY_HOLD_S after it was last the fresh reading (grid seconds); a
 * deadline within STEADY_S of the one shown is the same deadline.
 */
export const STEADY_HOLD_S = 900, STEADY_S = 300;
/** A quiet line is shown for at least this long against another quiet line (grid seconds). */
export const STEADY_QUIET_S = 300;

// A line's words with every number, clock time and dollar figure masked ('49.41 Hz', '16:10', '$43,000', '5,889 MW').
export const masked = t => t.replace(/[$−-]?\d[\d,.:]*/g, '#');

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
 * noise, a minute at a time. Pure: the caller keeps the result.
 * @param {{line:object, seenS:number, sinceS?:number}|null} held the last result
 * @param {object} next objective(obs, ctx) now
 * @param {number} s obs.s
 * @returns {{line:object, seenS:number, sinceS:number}} line: what to show (next, or next with the
 *   held text and startBy); seenS: when the shown text was last the fresh reading; sinceS: since
 *   when the shown text has been shown
 */
export function steady(held, next, s) {
  const a = held && held.line;
  if (!a || !next) return {line: next, seenS: s, sinceS: s};
  const since = held.sinceS === undefined || held.sinceS > s ? held.seenS : held.sinceS;
  const fresh = {line: next, seenS: s, sinceS: next.text === a.text ? since : s};
  const keep = (extra = {}) => ({line: Object.assign({}, next, {text: a.text}, extra), seenS: held.seenS, sinceS: since});
  if (next.kind === 'quiet' && a.kind === 'quiet' && !next.action && next.level === a.level && next.text !== a.text && s >= since && s - since < STEADY_QUIET_S) return keep();
  if (next.kind !== a.kind || next.level !== a.level || next.level === 'crit') return fresh;
  if (JSON.stringify(next.action) !== JSON.stringify(a.action)) return fresh;
  if (next.text === a.text || next.targets.join() !== a.targets.join()) return fresh;
  // only a figure or a time may differ: other words are other news (another risk, a real shortfall
  // where there was only a deadline), shown at once
  if (masked(next.text) !== masked(a.text)) return fresh;
  if (s < held.seenS || s - held.seenS >= STEADY_HOLD_S) return fresh;
  if (next.action) return keep();
  if (a.startBy >= 0 && (next.startBy < a.startBy - STEADY_S || a.startBy - s <= ACT_WITHIN_S)) return fresh;
  return keep({startBy: a.startBy});
}

// app/verdict.js: the end of the day in words (SPEC §5 W3: D-20, D-21, L-10, P-1, H-11), DOM-free.
//
// The sim keeps no history, so the game records what the verdict needs as it plays: once a grid second
// (app/game.js tickOnce -> verdictSecond) the second's lowest and highest frequency (from the recorder),
// each district's dark spell with its cause and its MWh (task feeders from their hand-back: before it the
// outage is the network's, Q-69), and once a grid minute the spare in 5 min and the biggest risk, the
// security level, the player's dark spells open, the underlying and operational demand and the MWh spilled so far,
// and (W7, Q-119) the GUARD, the machines synchronised and the tie flow, as app/par.js keeps par's.
// For D-24's cards, `seen` keeps what the player's day saw that the sim keeps no record of: a shed by the city
// desk, the tie out, the reserve diesel called, a heatwave or a wind drought begun (its news); never the night shift's.
//
// verdictView(end, mem, ctx) then builds, for the end card (app/endcard.js):
//   lights / cost / carbon   D-20's three rows in words against par. The lights row names each dark
//                            spell by cause and time ("HAR4 from 06:55, relit by the night shift at 22:20");
//                            the MWh per cause are the sim's own (score.taskMWh, directedMWh, uflsMWh), split
//                            over the spells by what each was measured to lose.
//   moment                   D-21: the first shed; else the trip with the largest frequency deviation; else the
//                            minute of the thinnest N-1 margin. Its time, a ±3-minute trace (per-second lowest
//                            and highest), what caught it with YOUR GUARD named, the nadir with no GUARD (a
//                            guard-0 twin of the pre-trip preview: createTwin replays the day to the tick before
//                            the trip, then physics.previewTrip(..., {guardMW: 0}); with no GUARD set, the card
//                            says the fall was that case) and par's lowest Hz and spare at the same minute.
//                            W7 (Q-119): then what par did that you didn't (parLines): up to three facts in par's
//                            favour for this kind of moment, and par's GUARD tried on your trip by the same twin.
//   strip                    L-10: a column an hour, 'r' short (a district of yours dark), 'b' spill (wind or solar
//                            held back), 'g' neither. Read from the minutes alone, never from the plan.
//   demand, trips            P-1: the underlying and operational curves; H-11: after each trip, whether
//                            frequency was back in the normal band within 5 minutes.
// cleanRamp: L-10's chime, the frame the evening peak passes with no red minute in the 60 before it.

import {V} from '../sim/params.js';
import {createState, step} from '../sim/step.js';
import {previewTrip} from '../sim/physics.js';
import {districtColdLoadMW} from '../sim/fleet.js';
import {flexAt} from '../sim/weather.js';
import {SEC_WINDOW_S, LEVELS} from './record.js';
import {unitsOn} from './par.js';
import {clockText, mw} from '../render/format.js';
import {unitLabel} from '../desk/util.js';
import {CARDS} from '../content/cards.js';
import {NIGHT_GUARD} from './watch.js';

const TPS = V.TICKS_PER_S, DAY_S = V.DAY_S, MIN = V.S_PER_MIN, DAY_MIN = DAY_S / MIN, HOUR_MIN = V.S_PER_H / MIN;
/** D-21: the moment's trace spans this many grid seconds either side. */
export const MOMENT_SPAN_S = 180;
/** H-11: frequency back in the normal band within this many grid seconds of a trip. */
export const BACK_IN_S = 5 * MIN;
/** L-10: an hour with more spilled than this (MWh) is a blue column. */
export const SPILL_COL_MWH = 1;
/** L-10: the peak has passed once operational demand is this share of the evening's highest. */
export const PEAK_PASSED = 0.95;
const at = s => clockText(s, false);
const nan = n => new Float32Array(n).fill(NaN);

/** The verdict's memory for one day (app/game.js keeps it as game.verdict). */
export function createVerdictMem() {
  return {fLo: nan(DAY_S), fHi: nan(DAY_S),
    r5: nan(DAY_MIN), L: nan(DAY_MIN), level: new Int8Array(DAY_MIN).fill(-1), shed: nan(DAY_MIN),
    under: nan(DAY_MIN), oper: nan(DAY_MIN), spill: nan(DAY_MIN), price: nan(DAY_MIN),
    guard: nan(DAY_MIN), on: new Int32Array(DAY_MIN).fill(-1), tie: nan(DAY_MIN),   // (W7, Q-119: as app/par.js keeps par's)
    open: {}, spells: [], peakMW: 0, chimed: false, seen: {}};
}

/**
 * Once a grid second, after the step that completed it (the second just ended is floor(tick / TPS) - 1).
 * rec: the game's recorder (app/record.js), for the second's lowest and highest frequency.
 * @returns {string} 'ramp' when L-10's clean-ramp chime is due, else ''
 */
export function verdictSecond(mem, state, rec) {
  const s = Math.floor(state.tick / TPS) - 1;
  if (s < 0 || s >= DAY_S) return '';
  const j = s % SEC_WINDOW_S;
  if (rec && rec.sec.s[j] === s) { mem.fLo[s] = rec.sec.min[j]; mem.fHi[s] = rec.sec.max[j]; }
  const ds = state.city.districts;
  for (let i = 0; i < ds.length; i++) {
    const x = ds[i], open = mem.open[x.id], dark = x.dark && (x.shedBy !== 'task' || s >= x.clearS);
    if (open && (!dark || open.by !== x.shedBy)) {
      open.to = s; open.night = !!state.control.nightShift; delete mem.open[x.id];
    }
    if (!dark) continue;
    let sp = mem.open[x.id];
    if (!sp) {
      sp = mem.open[x.id] = {id: x.id, by: x.shedBy, stage: x.uflsStage, from: s, to: -1, mwh: 0, night: false}; mem.spells.push(sp);
      if (x.shedBy === 'directed' && !state.control.nightShift) mem.seen.directed = true; // (D-24)
    }
    sp.mwh += districtColdLoadMW(state, i) / V.COLD_LOAD_FACTOR / V.S_PER_H;
  }
  if ((s + 1) % MIN) return '';
  const m = (s + 1) / MIN - 1, env = state.env;
  mem.r5[m] = state.sec.r5MW; mem.L[m] = state.sec.lMW; mem.level[m] = LEVELS.indexOf(state.sec.level);
  mem.shed[m] = Object.keys(mem.open).length; // (the player's dark spells: a feeder under repair is the network's)
  mem.under[m] = env.underlyingMW; mem.oper[m] = env.demandMW; mem.spill[m] = state.score.spillMWh; mem.price[m] = state.price.mwh;
  mem.guard[m] = state.battery.guardMW; mem.on[m] = unitsOn(state); mem.tie[m] = state.tie.flowMW;
  if (!state.control.nightShift) seenMinute(mem.seen, state, s);
  return cleanRampAt(mem, m) ? 'ramp' : '';
}

/**
 * D-24: once a grid minute of the player's day, what the sim keeps no record of: the tie out (a trip at no flow makes
 * no contingency), the reserve diesel armed (armedEver: an arm stood down within the minute too), and a heatwave or a
 * wind drought begun (its news, from its onset).
 */
function seenMinute(seen, state, s) {
  if (state.tie.tripped) seen.tie = true;
  if (state.rert.armedEver) seen.rert = true;
  for (const n of state.news) if ((n.kind === 'heat' || n.kind === 'drought') && n.fromS <= s) seen[n.kind] = true;
}

/** L-10: minute m's chime: the evening peak (from 14:00) has passed, before 21:00, and none of the 60 minutes before was red. Once a day. */
export function cleanRampAt(mem, m) {
  const h = m / HOUR_MIN + V.DAY_START_H;
  if (mem.chimed || h < 14 || h >= 21) return false;
  if (mem.oper[m] > mem.peakMW) mem.peakMW = mem.oper[m];
  if (h < 16 || !(mem.oper[m] < PEAK_PASSED * mem.peakMW)) return false;
  mem.chimed = true;
  for (let k = Math.max(0, m - HOUR_MIN + 1); k <= m; k++) if (red(mem, k)) return false;
  return true;
}
const red = (mem, k) => mem.shed[k] > 0;

/** L-10: a column an hour from 04:00: 'r' short (a district of yours dark), 'b' spill, 'g' neither, '' not played. */
export function strip(mem) {
  const out = [];
  for (let h = 0; h < DAY_MIN / HOUR_MIN; h++) {
    let c = '', r = false;
    for (let k = h * HOUR_MIN; k < (h + 1) * HOUR_MIN; k++) if (Number.isFinite(mem.oper[k])) { c = 'g'; if (red(mem, k)) r = true; }
    if (c && !r) {
      const a = h ? mem.spill[h * HOUR_MIN - 1] : 0, b = lastOf(mem.spill, h * HOUR_MIN, (h + 1) * HOUR_MIN);
      if (b - (Number.isFinite(a) ? a : 0) > SPILL_COL_MWH) c = 'b';
    }
    out.push(r ? 'r' : c);
  }
  return out;
}
function lastOf(a, from, to) { let v = NaN; for (let k = from; k < to; k++) if (Number.isFinite(a[k])) v = a[k]; return v; }

// ------------------------------------------------------------------ D-20: lights, cost, carbon

const CAUSES = [
  ['task', 'taskMWh', 'Feeders you went on past'],
  ['directed', 'directedMWh', 'Shed by the city desk'],
  ['ufls', 'uflsMWh', 'Shed by the relays'],
];
const LIST_MAX = 3;

/** One dark spell in words: "HAR4 from 06:55, relit by the night shift at 22:20" or "SOL3 18:30–20:07". */
export function spellText(sp, nightAware = true) {
  if (sp.to < 0) return sp.id + ' from ' + at(sp.from) + ', still dark at 04:00';
  if (sp.by === 'task' || (nightAware && sp.night)) return sp.id + ' from ' + at(sp.from) + ', relit' + (sp.night ? ' by the night shift' : '') + ' at ' + at(sp.to);
  return sp.id + ' ' + at(sp.from) + '–' + at(sp.to);
}

/**
 * D-20's lights row: by cause, each with its spells and the sim's MWh for that cause.
 * @returns {{text:string, parts:Array<{cause:string, label:string, mwh:number, spells:string[]}>}}
 */
export function lightsRow(mem, score, parScore) {
  const parts = [];
  for (const [cause, key, label] of CAUSES) {
    const mwh = score[key] || 0, sp = mem.spells.filter(x => x.by === cause);
    if (!(mwh >= 0.05) && !sp.length) continue;
    const list = sp.slice(0, LIST_MAX).map(x => spellText(x)), more = sp.length - list.length;
    if (more > 0) list.push(more + ' more');
    parts.push({cause, label, mwh, spells: list});
  }
  const parMWh = parScore ? (parScore.lightsMWh || 0) : null;
  const par = parMWh === null ? '' : parMWh < 0.05 ? ' Par kept every light on.' : ' Par: ' + mw(parMWh, parMWh < 10 ? 1 : 0) + ' MWh dark.';
  const text = parts.length ? parts.map(p => p.label + ': ' + p.spells.join('; ') + ' (' + mw(p.mwh, p.mwh < 10 ? 1 : 0) + ' MWh).').join(' ') + par
    : 'Every light you were given stayed on.' + par;
  return {text, parts};
}

/** D-20's cost row: c/kWh served against par's. */
export function costRow(you, par) {
  const y = you.supplyCents, p = par && par.supplyCents;
  if (!(p > 0)) return y.toFixed(1) + ' c/kWh served.';
  const d = y - p;
  return y.toFixed(1) + ' c/kWh served, par ' + p.toFixed(1) + (Math.abs(d) < 0.05 ? ': the same.' : d > 0 ? ': dearer by ' + d.toFixed(1) + '.' : ': cheaper by ' + (-d).toFixed(1) + '.');
}

/** D-20's carbon row: t/MWh against par's ("±0: nothing you did moved it today" when it did not move). */
export function carbonRow(you, par) {
  const y = you.co2tPerMWh, p = par && par.co2tPerMWh;
  if (!(p > 0)) return y.toFixed(2) + ' t/MWh.';
  const d = y - p;
  if (Math.abs(d) < 0.005) return y.toFixed(2) + ' t/MWh, par ' + p.toFixed(2) + ': ±0: nothing you did moved it today.';
  return y.toFixed(2) + ' t/MWh, par ' + p.toFixed(2) + (d > 0 ? ': dirtier by ' : ': cleaner by ') + Math.abs(d).toFixed(2) + '.';
}

// ------------------------------------------------------------------ D-21: the moment

const causeName = c => (c.cause === 'link' ? 'The tie line' : c.cause === 'load' ? 'A smelter potline' : unitLabel(c.id));
const CATCH = [['inertiaMW', 'spin'], ['guardMW', 'YOUR GUARD'], ['batteryMW', 'the battery'], ['governorsMW', 'governors'],
  ['loadReliefMW', 'load relief'], ['uflsMW', 'the relays'], ['inverterMW', 'solar and wind backing off']];

/**
 * What caught a trip, in words, YOUR GUARD named: "spin 680 MW, YOUR GUARD 400 MW, governors 210 MW" (D-29: nightGuard, a GUARD
 * the night shift handed over and the player had not set by the trip, is named as theirs).
 */
export function caughtText(c, nightGuard = false) {
  const sign = c.lostMW >= 0 ? 1 : -1, out = [];
  for (const [k, name] of CATCH) {
    const v = sign * (c.caught[k] || 0);
    if (v >= 5) out.push((k === 'guardMW' && nightGuard ? NIGHT_GUARD : name) + ' ' + mw(v) + ' MW');
  }
  return out.join(', ');
}

/**
 * D-21: the moment: {kind: 'shed'|'trip'|'margin', s, cont (a trip's record), text: [lines], numbers: {...}, trace;
 * pending: true while the no-GUARD twin computes (Y-6: SAVE IMAGE waits for it)}. A relay cut is a trip's when a fall
 * began at most MOMENT_SPAN_S before it (in the moment's trace), else the relays' own. conts: the player's contingencies
 * (state.conts before a night scenario's 21:00). o: {parMinute(s) (app/par.js), twin (createTwin's), guardMW (the GUARD
 * set at the moment's trip), nightGuard (it was the night shift's then, D-29), nightS (sheds from it are not candidates)}.
 */
export function moment(mem, conts, o = {}) {
  const nightS = o.nightS === undefined ? Infinity : o.nightS; // (Q-73: the night shift's sheds are not the player's)
  const shed = mem.spells.filter(x => (x.by === 'ufls' || x.by === 'directed') && x.from < nightS).sort((a, b) => a.from - b.from)[0];
  let m = null;
  if (shed) {
    // (W6 Y-6 review: a fall just before it; a trip hours earlier, or a rise, did not fire the relays)
    const c = shed.by === 'ufls' ? [...conts].reverse().find(x => x.startTick <= (shed.from + 1) * TPS && x.startTick >= (shed.from - MOMENT_SPAN_S) * TPS && x.lostMW > 0) : null;
    m = {kind: 'shed', s: c ? Math.floor(c.startTick / TPS) : shed.from, cont: c || null, spell: shed};
  } else {
    let best = null;
    for (const c of conts) if (!best || Math.abs(c.extremeHz - V.F0_HZ) > Math.abs(best.extremeHz - V.F0_HZ)) best = c;
    if (best) m = {kind: 'trip', s: Math.floor(best.startTick / TPS), cont: best};
  }
  if (!m) {
    let k = -1;
    for (let i = 0; i < DAY_MIN; i++) if (Number.isFinite(mem.r5[i]) && mem.L[i] > 0 && (k < 0 || mem.r5[i] - mem.L[i] < mem.r5[k] - mem.L[k])) k = i;
    if (k < 0) return null;
    m = {kind: 'margin', s: k * MIN, minute: k};
  }
  const s = m.s, from = Math.max(0, s - MOMENT_SPAN_S), to = Math.min(DAY_S, s + MOMENT_SPAN_S);
  let lo = Infinity, hi = -Infinity;
  for (let t = Math.max(0, s - 2); t < Math.min(DAY_S, s + MOMENT_SPAN_S); t++) { if (mem.fLo[t] < lo) lo = mem.fLo[t]; if (mem.fHi[t] > hi) hi = mem.fHi[t]; }
  const c = m.cont, rise = !!c && c.lostMW < 0, ext = c ? c.extremeHz : lo;
  const pm = o.parMinute ? o.parMinute(s) : null;
  const par = pm ? 'Par at ' + at(s) + ': ' + (rise ? 'highest ' + pm.highHz.toFixed(2) : 'lowest ' + pm.lowHz.toFixed(2)) + ' Hz, ' + mw(pm.r5MW) + ' MW spare in 5 min.' : '';
  const n = {extremeHz: Number.isFinite(ext) ? ext : null, parHz: pm ? (rise ? pm.highHz : pm.lowHz) : null, parR5MW: pm ? pm.r5MW : null};
  const text = [];
  if (m.kind === 'margin') {
    const k = m.minute;
    n.r5MW = mem.r5[k]; n.riskMW = mem.L[k];
    text.push(at(s) + ': your thinnest margin. ' + mw(mem.r5[k]) + ' MW spare in 5 min for a ' + mw(mem.L[k]) + ' MW risk.');
  } else if (c) {
    text.push(at(s) + ': ' + causeName(c) + ' tripped (' + mw(Math.abs(c.lostMW)) + ' MW' + (rise ? ' of load' : '') + '). Frequency ' +
      (rise ? 'rose to ' : 'fell to ') + c.extremeHz.toFixed(2) + ' Hz' + (c.uflsStages ? ' and the relays shed ' + c.uflsStages + ' stage' + (c.uflsStages > 1 ? 's' : '') : '') + '.');
    const caught = caughtText(c, o.nightGuard);
    if (caught) text.push('Caught by ' + caught + '.');
    // the nadir with no GUARD: the twin's; with none set at the trip, the day already was the no-GUARD case
    const ng = o.twin && Number.isFinite(o.twin.nadirHz) ? o.twin.nadirHz : NaN;
    if (!rise && o.guardMW === 0) text.push('Your GUARD was at 0 MW: this was the fall with no GUARD.');
    else if (!rise && Number.isFinite(ng)) { n.noGuardHz = ng; text.push('With no GUARD (' + mw(o.guardMW || 0) + ' MW held back): ' + ng.toFixed(2) + ' Hz.'); }
    else if (!rise && o.twin && !o.twin.done) { m.pending = true; text.push('With no GUARD: computing…'); }
  } else {
    const sp = m.spell;
    text.push(at(s) + (sp.by === 'ufls' ? ': the relays shed ' : ': the city desk shed ') + sp.id + ' to hold frequency. Lowest ' + (Number.isFinite(lo) ? lo.toFixed(2) : '-') + ' Hz.');
  }
  if (par) text.push(par);
  // W7 (Q-119): what par did that you didn't, under par's line (par finished: its minute is known)
  if (pm && o.parHad) {
    const d = parLines(m, mem, o);
    if (d.pending) m.parPending = true;
    if (Number.isFinite(d.tryHz)) n.parGuardHz = d.tryHz;
    m.parLines = d.lines;
    text.push(...d.lines);
  }
  const trace = {fromS: from, toS: to, s, lo: mem.fLo.slice(from, to), hi: mem.fHi.slice(from, to)};
  return Object.assign(m, {text, numbers: n, trace});
}

// ------------------------------------------------------------------ W7 (Q-119): what par did that you didn't

/** Q-119: a difference smaller than this many MW is not one (a GUARD step; the tie; a trip's size). */
export const DIFF_MW = 50;
/** Q-119: par's running plant must be this many rated MW above yours before its machines are a difference. */
export const DIFF_PLANT_MW = 100;
/** Q-119: par's air-con cycles must take this many MW more off demand than yours to be a difference. */
export const DIFF_FLEX_MW = 20;
/** Q-119: at most this many lines. */
export const DIFF_MAX = 3;
/** Q-119: a fall no deeper than par's (par's lowest within this of yours, or below it) leaves par's machines unsaid. */
const DEEPER_HZ = 0.005;

const RATED = V.MACHINES.map(x => x.ratingMW);
const plantMW = on => { let s = 0; for (let i = 0; i < RATED.length; i++) if (on & (1 << i)) s += RATED[i]; return s; };
const unitNames = on => V.MACHINES.filter((x, i) => on & (1 << i)).map(x => unitLabel(x.id));
const andList = xs => (xs.length < 2 ? xs.join('') : xs.length <= 3 ? xs.slice(0, -1).join(', ') + ' and ' + xs.at(-1)
  : xs.slice(0, 3).join(', ') + ' and ' + (xs.length - 3) + ' more');
const aircon = (blocks, s) => (blocks ? Math.max(0, -flexAt(blocks, s, '', '', 'aircon')) : NaN);   // (MW off demand: the core's)
const tieText = x => (x >= 0.5 ? 'importing ' + mw(x) + ' MW' : x <= -0.5 ? 'exporting ' + mw(-x) + ' MW' : 'not importing');
const tripName = t => (t.cause === 'link' ? 'the tie line' : t.cause === 'load' ? 'a smelter potline' : unitLabel(t.id));
/** Q-119 review: a trip's MW in the game's words, never a minus sign: the tie's flow and which way (a tie exporting when it tripped was a rise), a potline's load. */
const tripSize = (cause, x) => (cause === 'link' ? tieText(x) : mw(Math.abs(x)) + ' MW' + (x < 0 ? ' of load' : ''));
const stages = k => k + ' stage' + (k > 1 ? 's' : '');
/** Q-119 review: how long a GUARD that fired delivers its MW (sim/physics.js: sustained, then ramped off). */
const GUARD_LIVE_S = V.GUARD_SUSTAIN_S + V.GUARD_RAMP_OFF_S;
/**
 * Q-119 review: your GUARD was holding its MW back from the battery's dispatch at grid second s (a shed's start): it had
 * not fired in the GUARD_LIVE_S before (frequency at or above GUARD_TRIGGER_HZ each second of them, to s). One that fired
 * then was delivering them; one that fired earlier is spent and holds them back again. The relays cut below 49 Hz, so
 * frequency crossed the trigger on its way down: the GUARD had fired, and a GUARD par let go is never said for them.
 */
const guardHeld = (mem, s) => { for (let t = Math.max(0, s - GUARD_LIVE_S); t <= s && t < DAY_S; t++) if (mem.fLo[t] < V.GUARD_TRIGGER_HZ) return false; return true; };
/** Q-119: the grid minute (0: 04:00-04:01) both sides are read at for moment m: the one before its trip or shed began, or the thinnest margin's own. */
export const diffMinute = m => (m.kind === 'margin' ? m.minute : Math.floor(m.s / MIN) - 1);
/** Q-119: a preview of a trip in words: "49.31 Hz, no relays". */
const previewText = r => (r.black ? 'the grid would go black' : r.nadirHz.toFixed(2) + ' Hz' + (r.uflsStages ? ', and the relays would shed ' + stages(r.uflsStages) : ', no relays'));

/**
 * W7 (Q-119): what par did that you didn't, at the moment m (moment()'s): at most DIFF_MAX facts, each in par's favour
 * for this kind of moment. Facts, never a cause ("because"), never blame. Each side is read at the same instant: the
 * end of the minute before a trip or a shed began (diffMinute; the minute itself for the thinnest margin).
 *   A fall (a trip that fell, or the relays just after one), in this order (what catches a fall in its seconds first):
 *     par's trip, when it was another machine, none, or the same one 50 MW or more heavier or lighter: par's numbers
 *       above are its own trip's, and the twin tries par's GUARD on yours (first: it says what the rest compare); a
 *       trip's MW in the game's words (tripSize: the tie importing or exporting, a potline's load), never a minus sign;
 *     par's GUARD, DIFF_MW or more above yours, with par's GUARD tried on your trip (o.parTry: the twin's preview,
 *       "computing…" until it is in);
 *     par's machines running that yours were not, when par's rated plant running was DIFF_PLANT_MW above yours; not
 *       when the fall went no deeper than par's (par's lowest over the trip's minute and the next).
 *   A shed with no trip before it (the city desk's, or the relays' on frequency alone), the most MW first: par's
 *     machines (their rated MW over yours); par importing DIFF_MW more over the tie; par's air-con cycles taking
 *     DIFF_FLEX_MW more off demand; par's GUARD DIFF_MW or more below yours (a GUARD holds the battery's power back from
 *     the energy it would supply), only while yours held it back at the shed (guardHeld: not fired, or spent; never for
 *     the relays, whose fall fired it).
 *   The thinnest margin, only when par's spare in 5 min was DIFF_MW more: par's machines and its air-con cycles, the
 *     most MW first.
 *   A rise: none. The soak is not compared: before 21:00 it only adds load (at noon), never helps a short minute.
 * o: moment()'s, with parHad(k) (app/par.js parHad), parTrips (par's [{tick, cause, id, mw}], null for a par kept
 * before W7), parBlocks and blocks (par's and your city bookings), parTry(guardMW): undefined (not asked), null
 * (computing) or the twin's preview {nadirHz (NaN: it failed), uflsStages, black}.
 * @returns {{lines: string[], pending: boolean (par's GUARD on your trip still computing), tryHz: number}}
 */
export function parLines(m, mem, o) {
  const out = {lines: [], pending: false, tryHz: NaN}, c = m.cont, fall = !!c && c.lostMW > 0;
  if ((c && !fall) || !o.parHad) return out;
  const k = diffMinute(m), p = o.parHad(k);
  if (!p || !(mem.on[k] >= 0)) return out;
  const you = {guardMW: fall && Number.isFinite(o.guardMW) ? o.guardMW : mem.guard[k], on: mem.on[k], tieMW: mem.tie[k]}, endS = (k + 1) * MIN;
  const facts = [], fact = (w, text) => facts.push([w, text]);
  const plant = () => {
    const d = plantMW(p.on) - plantMW(you.on), extra = p.on & ~you.on;
    if (d >= DIFF_PLANT_MW && extra) fact(d, 'Par had ' + andList(unitNames(extra)) + ' running; you didn\'t.');
  };
  const cycles = () => {
    const a = aircon(o.parBlocks, endS), b = aircon(o.blocks, endS);
    if (a - b >= DIFF_FLEX_MW) fact(a - b, 'Par\'s air-con cycles were taking ' + mw(a) + ' MW off demand; ' + (b >= 0.5 ? 'yours ' + mw(b) + ' MW.' : 'you had none running.'));
  };
  const guardLine = () => 'Par had a GUARD of ' + mw(p.guardMW) + ' MW; yours was ' + mw(you.guardMW) + '.';
  if (fall) {
    const pt = o.parTrips ? o.parTrips.find(t => Math.abs(t.tick - c.startTick) <= TPS) : undefined, mine = tripName(c);
    if (o.parTrips && !pt) fact(Infinity, 'Par had no trip over ' + mw(V.EVENT_THRESHOLD_MW) + ' MW at ' + at(m.s) + '.');
    else if (pt && (pt.cause !== c.cause || pt.id !== c.id)) fact(Infinity, 'Par\'s trip took ' + tripName(pt) + ' (' + tripSize(pt.cause, pt.mw) + '); yours took ' + mine + ' (' + tripSize(c.cause, c.lostMW) + ').');
    else if (pt && Math.abs(pt.mw - c.lostMW) >= DIFF_MW) {
      fact(Infinity, 'Par\'s ' + mine.replace(/^the /, '') + (c.cause === 'link' ? ' was ' + tieText(pt.mw) + ' when it tripped; yours was ' + tieText(c.lostMW) + '.'
        : ' was at ' + mw(pt.mw) + ' MW when it tripped; yours was at ' + mw(c.lostMW) + '.'));
    }
    const g = p.guardMW - you.guardMW, lows = [o.parMinute && o.parMinute(m.s), o.parMinute && o.parMinute(m.s + MIN)].filter(Boolean).map(x => x.lowHz);
    const deeper = !lows.length || Math.min(...lows) > c.extremeHz + DEEPER_HZ;   // (yours went deeper than par's)
    if (g >= DIFF_MW) {
      const r = o.parTry ? o.parTry(p.guardMW) : undefined, head = 'Par had a GUARD of ' + mw(p.guardMW) + ' MW. With it on your trip: ';
      if (r === null) { out.pending = true; fact(g, head + 'computing…'); }
      else if (r && Number.isFinite(r.nadirHz)) { out.tryHz = r.nadirHz; fact(g, head + previewText(r) + '.'); }
      else if (deeper) fact(g, guardLine());
    }
    if (deeper) plant();
  } else if (m.kind === 'shed') {
    plant();
    const t = p.tieMW - you.tieMW;
    if (t >= DIFF_MW) fact(t, 'Par was ' + tieText(p.tieMW) + ' over the tie; you were ' + tieText(you.tieMW) + '.');
    cycles();
    if (you.guardMW - p.guardMW >= DIFF_MW && guardHeld(mem, m.s)) fact(you.guardMW - p.guardMW, guardLine());
    facts.sort((a, b) => b[0] - a[0]);   // (each is MW par could serve load with that you could not: the most first)
  } else {
    const pm = o.parMinute && o.parMinute(m.s);
    if (pm && pm.r5MW - mem.r5[k] >= DIFF_MW) { plant(); cycles(); }
    facts.sort((a, b) => b[0] - a[0]);
  }
  out.lines = facts.slice(0, DIFF_MAX).map(x => x[1]);
  return out;
}

// ------------------------------------------------------------------ the no-GUARD twin (D-21)

/**
 * A twin of the pre-trip preview: replays seed / scenario / log (the game's) to `startTick` (the tick the trip
 * happened in, its inputs not yet applied) a chunk at a time, then previews the same loss with each GUARD in
 * `guards` (D-21: 0, the fall with no GUARD; W7, Q-119: par's GUARD at that minute). It keeps the replayed state, so a
 * GUARD asked for later (want) is one more preview on it, at once.
 * step(maxTicks, budgetMs): plays up to maxTicks, stopping after the 1,000-tick chunk that passes budgetMs of real
 * time; done, then nadirHz (the GUARD-0 preview's, NaN if not asked or the replay failed) and tried(g): undefined if g
 * was not asked, null while computing, else {nadirHz (NaN if it failed), uflsStages, black}. rev counts the previews made.
 */
export function createTwin(seed, scenario, log, cont, guards = [0]) {
  const st = createState(seed >>> 0, scenario), batch = [], until = cont.startTick, want = [...guards], tries = new Map();
  const target = cont.cause === 'link' ? {kind: 'link', id: 'tie'} : cont.cause === 'load' ? {kind: 'load', id: cont.id, mw: -cont.lostMW} : {kind: 'unit', id: cont.id};
  const FAILED = Object.freeze({nadirHz: NaN, uflsStages: 0, black: false});
  let j = 0, failed = false;
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const preview = g => {
    if (tries.has(g)) return;
    let r = FAILED;
    if (!failed) try { const x = previewTrip(st, target, {guardMW: g}); r = {nadirHz: x.nadirHz, uflsStages: x.uflsStages, black: x.black}; } catch (e) { r = FAILED; }
    tries.set(g, r); t.rev++;
    if (g === 0) t.nadirHz = r.nadirHz;
  };
  const t = {done: false, nadirHz: NaN, progress: 0, rev: 0,
    step(maxTicks, budgetMs = Infinity) {
      const t0 = clock();
      try {
        for (let n = 0; n < maxTicks && !t.done && (n % 1000 || n === 0 || clock() - t0 < budgetMs); n++) {
          if (st.tick >= until || st.over) {
            t.done = true;
            for (const g of want) preview(g);
            break;
          }
          batch.length = 0;
          while (j < log.length && log[j].tick <= st.tick) { batch.push(Object.assign({type: log[j].type}, log[j].args)); j++; }
          step(st, batch);
        }
      } catch (e) { t.done = true; failed = true; t.nadirHz = NaN; t.rev++; }
      t.progress = t.done ? 1 : st.tick / Math.max(1, until);
      return t.done;
    },
    /** Asks for the preview with GUARD g too: made with the others, or at once on the kept state when the replay is done. */
    want(g) {
      if (!want.includes(g)) want.push(g);
      if (t.done) preview(g);
    },
    tried(g) { return !want.includes(g) ? undefined : !t.done ? null : tries.get(g) || FAILED; }};
  return t;
}

// ------------------------------------------------------------------ P-1, H-11

/** P-1: the day's underlying and operational demand: {under, oper} per minute, and their peaks and the midday low. */
export function demandLine(mem) {
  let up = 0, upAt = 0, op = 0, opAt = 0, low = Infinity, lowAt = 0;
  for (let k = 0; k < DAY_MIN; k++) {
    if (mem.under[k] > up) { up = mem.under[k]; upAt = k; }
    if (mem.oper[k] > op) { op = mem.oper[k]; opAt = k; }
    const h = k / HOUR_MIN + V.DAY_START_H;
    if (h >= 9 && h < 16 && mem.oper[k] < low) { low = mem.oper[k]; lowAt = k; }
  }
  if (!(op > 0)) return {text: '', under: mem.under, oper: mem.oper};
  const gap = Number.isFinite(low) ? mem.under[lowAt] - low : 0;
  return {under: mem.under, oper: mem.oper,
    text: 'Demand: the city\'s own load peaked at ' + mw(up) + ' MW at ' + at(upAt * MIN) + '; what the grid had to serve peaked at ' + mw(op) + ' MW at ' +
      at(opAt * MIN) + (gap >= 50 ? ', and rooftop solar hid ' + mw(gap) + ' MW of it at ' + at(lowAt * MIN) : '') + '.'};
}

/** H-11: after each trip, was frequency back in 49.85–50.15 Hz within 5 minutes? */
export function tripsLine(conts) {
  const out = [];
  for (const c of conts) {
    const back = c.backInBandTick >= 0 ? (c.backInBandTick - c.startTick) / TPS : -1;
    const mmss = x => Math.floor(x / 60) + ':' + String(Math.round(x % 60)).padStart(2, '0');
    out.push(at(Math.floor(c.startTick / TPS)) + ' ' + causeName(c) + ': ' + (back < 0 ? 'not back in band' : back <= BACK_IN_S ? 'back in band in ' + mmss(back) + ' ✓' : 'back in band only after ' + mmss(back)));
  }
  return out.length ? 'After each trip (the operator asks: back in ' + V.NORMAL_LO_HZ + '–' + V.NORMAL_HI_HZ + ' Hz within 5:00): ' + out.join('; ') + '.' : 'No trips today.';
}

// ------------------------------------------------------------------ D-24: "This really happened"

/** D-24: the minutes below $0 that make the negative-price card, and the MWh spilled that make the backstop's. */
export const NEGATIVE_MIN = 30, BACKSTOP_MWH = 200;

/**
 * D-24: at most one card, by trigger, in content/cards.js's order: the rarest and most dramatic first. The grid went
 * black; the relays shed; the city desk shed; the tie line tripped; the reserve diesel was called; a heatwave set in;
 * the wind dropped away (a drought); the battery (its GUARD or its PFR) caught 50 MW or more of a trip; wind and solar
 * were held back (BACKSTOP_MWH); the price was below $0 for NEGATIVE_MIN minutes. The day's own cards come before the
 * battery's, which fires on nearly every trip (a month of dailies, 2026-10-17: par's card was the battery's on 27 of
 * 30). null when none fired. conts: the player's contingencies.
 */
export function historyCard(mem, conts, black) {
  const seen = mem.seen;
  const fired = {
    black: !!black,
    ufls: conts.some(c => c.uflsStages > 0) || mem.spells.some(x => x.by === 'ufls'),
    directed: !!seen.directed,
    islanded: !!seen.tie,
    rert: !!seen.rert,
    heat: !!seen.heat,
    drought: !!seen.drought,
    battery: conts.some(c => c.lostMW > 0 && (c.caught.guardMW || 0) + (c.caught.batteryMW || 0) >= 50),
    backstop: lastOf(mem.spill, 0, DAY_MIN) >= BACKSTOP_MWH,
    negative: mem.price.reduce((a, p) => a + (p < 0 ? 1 : 0), 0) >= NEGATIVE_MIN,
  };
  return CARDS.find(c => fired[c.id]) || null;
}

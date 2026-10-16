// app/verdict.js: the end of the day in words (SPEC §5 W3: D-20, D-21, L-10, P-1, H-11), DOM-free.
//
// The sim keeps no history, so the game records what the verdict needs as it plays: once a grid second
// (app/game.js tickOnce -> verdictSecond) the second's lowest and highest frequency (from the recorder),
// each district's dark spell with its cause and its MWh (task feeders from their hand-back: before it the
// outage is the network's, Q-69), and once a grid minute the spare in 5 min and the biggest risk, the
// security level, the player's dark spells open, the underlying and operational demand and the MWh spilled so far.
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
//   strip                    L-10: a column an hour, 'r' short (a district of yours dark), 'b' spill (wind or solar
//                            held back), 'g' neither. Read from the minutes alone, never from the plan.
//   demand, trips            P-1: the underlying and operational curves; H-11: after each trip, whether
//                            frequency was back in the normal band within 5 minutes.
// cleanRamp: L-10's chime, the frame the evening peak passes with no red minute in the 60 before it.

import {V} from '../sim/params.js';
import {createState, step} from '../sim/step.js';
import {previewTrip} from '../sim/physics.js';
import {districtColdLoadMW} from '../sim/fleet.js';
import {SEC_WINDOW_S, LEVELS} from './record.js';
import {clockText, mw} from '../render/format.js';
import {unitLabel} from '../desk/util.js';
import {CARDS} from '../content/cards.js';

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
    open: {}, spells: [], peakMW: 0, chimed: false};
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
    if (!sp) { sp = mem.open[x.id] = {id: x.id, by: x.shedBy, stage: x.uflsStage, from: s, to: -1, mwh: 0, night: false}; mem.spells.push(sp); }
    sp.mwh += districtColdLoadMW(state, i) / V.COLD_LOAD_FACTOR / V.S_PER_H;
  }
  if ((s + 1) % MIN) return '';
  const m = (s + 1) / MIN - 1, env = state.env;
  mem.r5[m] = state.sec.r5MW; mem.L[m] = state.sec.lMW; mem.level[m] = LEVELS.indexOf(state.sec.level);
  mem.shed[m] = Object.keys(mem.open).length; // (the player's dark spells: a feeder under repair is the network's)
  mem.under[m] = env.underlyingMW; mem.oper[m] = env.demandMW; mem.spill[m] = state.score.spillMWh; mem.price[m] = state.price.mwh;
  return cleanRampAt(mem, m) ? 'ramp' : '';
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

/** What caught a trip, in words, YOUR GUARD named: "spin 680 MW, YOUR GUARD 400 MW, governors 210 MW". */
export function caughtText(c) {
  const sign = c.lostMW >= 0 ? 1 : -1, out = [];
  for (const [k, name] of CATCH) { const v = sign * (c.caught[k] || 0); if (v >= 5) out.push(name + ' ' + mw(v) + ' MW'); }
  return out.join(', ');
}

/**
 * D-21: the moment: {kind: 'shed'|'trip'|'margin', s, cont (a trip's record), text: [lines], numbers: {...}, trace;
 * pending: true while the no-GUARD twin computes (Y-6: SAVE IMAGE waits for it)}. A relay cut is a trip's when a fall
 * began at most MOMENT_SPAN_S before it (in the moment's trace), else the relays' own. conts: the player's contingencies
 * (state.conts before a night scenario's 21:00). o: {parMinute(s) (app/par.js), twin (createTwin's), guardMW (the GUARD
 * set at the moment's trip), nightS (sheds from it are not candidates)}.
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
    const caught = caughtText(c);
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
  const trace = {fromS: from, toS: to, s, lo: mem.fLo.slice(from, to), hi: mem.fHi.slice(from, to)};
  return Object.assign(m, {text, numbers: n, trace});
}

// ------------------------------------------------------------------ the no-GUARD twin (D-21)

/**
 * A guard-0 twin of the pre-trip preview: replays seed / scenario / log (the game's) to `startTick` (the tick
 * the trip happened in, its inputs not yet applied) a chunk at a time, then previews the same loss with no GUARD.
 * step(maxTicks, budgetMs): plays up to maxTicks, stopping after the 1,000-tick chunk that passes budgetMs of real
 * time; done, then nadirHz (NaN if the replay failed).
 */
export function createTwin(seed, scenario, log, cont) {
  const st = createState(seed >>> 0, scenario), batch = [], until = cont.startTick;
  let j = 0;
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t = {done: false, nadirHz: NaN, progress: 0, step(maxTicks, budgetMs = Infinity) {
    const t0 = clock();
    try {
      for (let n = 0; n < maxTicks && !t.done && (n % 1000 || n === 0 || clock() - t0 < budgetMs); n++) {
        if (st.tick >= until || st.over) {
          const target = cont.cause === 'link' ? {kind: 'link', id: 'tie'} : cont.cause === 'load' ? {kind: 'load', id: cont.id, mw: -cont.lostMW} : {kind: 'unit', id: cont.id};
          t.nadirHz = previewTrip(st, target, {guardMW: 0}).nadirHz;
          t.done = true;
          break;
        }
        batch.length = 0;
        while (j < log.length && log[j].tick <= st.tick) { batch.push(Object.assign({type: log[j].type}, log[j].args)); j++; }
        step(st, batch);
      }
    } catch (e) { t.done = true; t.nadirHz = NaN; }
    t.progress = t.done ? 1 : st.tick / Math.max(1, until);
    return t.done;
  }};
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
 * D-24: at most one card, by trigger, the most dramatic first: the grid went black; the relays shed; the battery
 * (its GUARD or its PFR) caught 50 MW or more of a trip; wind and solar were held back (BACKSTOP_MWH); the price
 * was below $0 for NEGATIVE_MIN minutes. null when none fired. conts: the player's contingencies.
 */
export function historyCard(mem, conts, black) {
  const fired = {
    black: !!black,
    ufls: conts.some(c => c.uflsStages > 0) || mem.spells.some(x => x.by === 'ufls'),
    battery: conts.some(c => c.lostMW > 0 && (c.caught.guardMW || 0) + (c.caught.batteryMW || 0) >= 50),
    backstop: lastOf(mem.spill, 0, DAY_MIN) >= BACKSTOP_MWH,
    negative: mem.price.reduce((a, p) => a + (p < 0 ? 1 : 0), 0) >= NEGATIVE_MIN,
  };
  return CARDS.find(c => fired[c.id]) || null;
}

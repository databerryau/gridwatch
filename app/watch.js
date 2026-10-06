// app/watch.js: the K-15 watch's beat model and the K-16 respond card model. Pure, DOM-free.
//
// The watch plays five beats in the physical order (J-25): inertia -> battery -> governors ->
// UFLS -> settle. Which beat is live is read from the contingency's TRACE (app/record.js: the
// frequency and what each source had caught at every tick), never from a script, so the
// caption always says what the physics is doing:
//   inertia    stored spin carries the hole (its catch exceeds the battery's and the governors')
//   battery    the battery (its droop plus the GUARD's fast frequency response) catches more
//              than inertia; "YOUR GUARD: N MW" when the ring holds some back
//   governors  governor response overtakes the battery, until the fall stops and 10 s pass
//   ufls       from the first relay operation (only below 49.0 Hz) for 2 grid-s
//   settle     from 10 grid-s: droop parks frequency below 50 Hz
// The beat index never goes back (a subsequence of the order above, K-15).
//
// Phase 2a (desk/README.md §19.2, §21.4; C-7): a contingency can be a loss of LOAD (the smelter's
// potline), and wind, utility solar and rooftop solar answer over-frequency. So the beats read
// the trace by the event's sign (a rise is caught by the same sources working the other way),
// the inverters' catch (caught.inverterMW) counts with the governors' beat, and the captions
// and the card say it in words for both signs: negative = "solar and wind backed off N MW" (a
// rise caught), positive = "gave back N MW" (they were backed off before a loss of supply).
// A trace or record from before Phase 2a has no inverterMW: it reads as 0.
//
// The respond card (K-16) is <= 4 lines, with no buttons: the nadir against the standard, the
// MW each source caught (the record's caught at the extreme, which is the trace value at the
// nadir), the problem in plain words (the H-4 level, R5 - L if short, the 30:00 countdown from
// secureByTick, dark districts), and "Enter (or a click) to take the desk".

import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;
export const BEATS = Object.freeze(['inertia', 'battery', 'governors', 'ufls', 'settle']);
/** The settle beat starts this many grid-s after the trip (K-15: 10-30 s). */
export const SETTLE_S = 10;
/** The UFLS beat lasts this long after a relay operates, unless settle starts first. */
export const UFLS_BEAT_S = 2;

const f3 = x => x.toFixed(3);
const mw = x => String(Math.round(x));
/** The inverters' catch is named from this many MW (below it the caption stays the classic one). */
export const INVERTER_NAME_MW = 5;

/**
 * Captions, <= 15 words each (K-15, full version).
 * @param {string} beat
 * @param {{guardMW:number, nadirHz?:number, rise?:boolean, inverterMW?:number}} ctx rise: the event
 *   is a loss of load (frequency rises); inverterMW: the trace's caught.inverterMW now (negative =
 *   backed off, positive = gave back). Both are optional: without them the captions are the
 *   loss-of-supply ones.
 */
export function caption(beat, ctx) {
  const inv = ctx.inverterMW || 0, at = ctx.nadirHz > 0 ? f3(ctx.nadirHz) + ' Hz' : '';
  if (ctx.rise) {
    switch (beat) {
      case 'inertia': return 'Load is lost. Stored spin in every turbine soaks it up. Frequency rises.';
      case 'battery': return 'The battery takes power within a second, from its own droop.';
      case 'governors': return inv <= -INVERTER_NAME_MW
        ? 'Solar and wind back off ' + mw(-inv) + ' MW; governors close.' + (at ? ' The rise stops at ' + at + '.' : '')
        : 'Governors close the valves.' + (at ? ' The rise stops at ' + at + '.' : ' The rise slows.');
      case 'ufls': return 'Below 49.0 Hz: relays shed districts to save the rest.';
      case 'settle': return 'Droop parks frequency above 50. Restoring fifty is AGC\'s job, and yours.';
      default: return '';
    }
  }
  switch (beat) {
    case 'inertia': return 'Stored spin in every turbine takes the hit. Frequency falls.';
    case 'battery': return ctx.guardMW > 0 ? 'YOUR GUARD: ' + mw(ctx.guardMW) + ' MW. The battery answers within a second.'
      : 'The battery answers from its own droop. No guard held back.';
    case 'governors':
      if (inv >= INVERTER_NAME_MW) return 'Governors open the valves; solar and wind give back ' + mw(inv) + ' MW.' + (at ? ' Nadir ' + at + '.' : '');
      return at ? 'Governors open the valves. The fall stops at ' + at + '.' : 'Governors open the steam and gas valves. The fall slows.';
    case 'ufls': return 'Below 49.0 Hz: relays shed districts to save the rest.';
    case 'settle': return 'Droop parks frequency below 50. Restoring fifty is AGC\'s job, and yours.';
    default: return '';
  }
}

/** True when the trace is a loss of load: the contingency record says so, else the trace's own first second. */
export function isRise(tr, c) {
  if (c && typeof c.lostMW === 'number') return c.lostMW < 0;
  if (!tr || !tr.f || !(tr.len > 1)) return false;
  return tr.f[Math.min(tr.len - 1, TPS)] > tr.f[0];
}

const inverterAt = (tr, i) => (tr.caught.inverterMW ? tr.caught.inverterMW[i] || 0 : 0);

// The beat the trace shows at tick offset k (before the monotonic rule). `sg` is +1 for a loss of
// supply and -1 for a loss of load, so each source's catch is read as a magnitude in the
// direction that helps; the inverters' catch counts with the governors (both are droop).
function rawBeat(tr, k, uflsK, sg = 1) {
  if (k >= SETTLE_S * TPS) return 4;
  if (uflsK >= 0 && k >= uflsK && k < uflsK + UFLS_BEAT_S * TPS) return 3;
  const i = Math.max(0, Math.min(k, tr.len - 2));
  const c = tr.caught;
  const inertia = sg * c.inertiaMW[i], batt = sg * (c.batteryMW[i] + c.guardMW[i]);
  const gov = sg * c.governorsMW[i] + Math.max(0, sg * inverterAt(tr, i));
  if (!(inertia >= 0) && !(batt >= 0)) return 0;
  if (gov > batt && gov > 0 && k > 0) return 2;
  if (batt > inertia && batt > 0) return 1;
  return 0;
}

// First tick offset at which UFLS had shed load (caught.uflsMW > 0), or -1.
function firstUfls(tr, upTo) {
  const u = tr.caught.uflsMW, n = Math.min(upTo, tr.len - 1);
  for (let i = 0; i < n; i++) if (u[i] > 0.5) return i;
  return -1;
}

/**
 * The beat sequence over a trace up to tick offset `upTo` (tests and the debrief).
 * @param {object} tr
 * @param {number} [upTo]
 * @param {object} [c] the contingency record (its lostMW gives the sign; else the trace does)
 * @returns {Array<{k:number, beat:string}>} each beat change (the first entry at k = 0)
 */
export function beatTimeline(tr, upTo = V.WATCH_S * TPS, c) {
  const out = [];
  const uflsK = firstUfls(tr, upTo), sg = isRise(tr, c) ? -1 : 1;
  let cur = -1;
  for (let k = 0; k < Math.min(upTo, V.WATCH_S * TPS); k++) {
    const b = Math.max(cur, rawBeat(tr, k, uflsK, sg));
    if (b !== cur) { out.push({k, beat: BEATS[b]}); cur = b; }
  }
  return out;
}

/**
 * What the watch overlay shows now (vm.watch).
 * @param {object} w a watch memory from createWatch() (keeps the beat monotonic)
 * @param {object} tr the contingency's trace (app/record.js)
 * @param {object} c the contingency record (state or observe())
 * @param {number} tick now
 * @param {{rate:number, version:string, guardMW:number}} m
 * @returns {{n:number, tS:number, beat:string, beatIndex:number, caption:string, stopwatch:string,
 *   nadirHz:number, rate:number, version:string, guardMW:number, cause:string, id:string, lostMW:number,
 *   rise:boolean, inverterMW:number}} nadirHz is the extreme (a peak when rise); inverterMW the
 *   trace's caught.inverterMW now
 */
export function watchView(w, tr, c, tick, m) {
  if (w.n !== c.n) { w.n = c.n; w.beat = 0; w.uflsK = -1; }
  const k = tick - c.startTick, rise = isRise(tr, c);
  if (w.uflsK < 0) w.uflsK = firstUfls(tr, k);
  const b = Math.max(w.beat, rawBeat(tr, k, w.uflsK, rise ? -1 : 1));
  w.beat = b;
  // The nadir (the peak of a rise) is known once frequency has turned back.
  let nadir = 0;
  if (c.extremeTick >= c.startTick && tick - c.extremeTick > TPS / 2) nadir = c.extremeHz;
  const tS = k / TPS, inverterMW = inverterAt(tr, Math.max(0, Math.min(k, tr.len - 2)));
  return {n: c.n, tS, beat: BEATS[b], beatIndex: b, caption: caption(BEATS[b], {guardMW: m.guardMW, nadirHz: nadir, rise, inverterMW}),
    stopwatch: stopwatch(tS, m.rate), nadirHz: nadir, rate: m.rate, version: m.version, guardMW: m.guardMW,
    cause: c.cause, id: c.id, lostMW: c.lostMW, rise, inverterMW};
}

export function createWatch() {
  return {n: -1, beat: 0, uflsK: -1};
}

/** 'T+0.00 s ×0.15' (K-15: the stopwatch replaces the clock). */
export function stopwatch(tS, rate) {
  const r = rate >= 1 ? String(Math.round(rate)) : String(Math.round(rate * 100) / 100);
  return 'T+' + tS.toFixed(2) + ' s ×' + r;
}

const mmss = s => { const t = Math.max(0, Math.round(s)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

/**
 * The K-16 respond card.
 * @param {object} obs observe() at the card (the watch's end)
 * @param {object} c the contingency record (obs.contingency)
 * @param {{glow?:Set<string>|string[]}} [o]
 * The "Caught by" line names each source with the MW it caught as a magnitude, in the words of the
 * event's sign: after a loss of supply the battery and the governors gave N MW; after a loss of
 * load the battery took N MW and the governors backed off N MW. The inverters (Phase 2a, C-7) are
 * "solar and wind backed off N MW" when caught.inverterMW is negative and "solar and wind gave
 * back N MW" when it is positive (they were backed off before a loss of supply).
 * @returns {{n:number, lines:string[], numbers:{nadirHz:number, contained:boolean, caught:object, shortMW:number,
 *   secureInS:number, darkCount:number, darkMW:number, level:string}, glow:string[]}} numbers.caught
 *   keeps the record's signs (and gains inverterMW)
 */
export function respondCard(obs, c, o) {
  const lo = V.CONTAIN_LO_HZ, hi = V.CONTAIN_HI_HZ;
  const nadir = c.extremeHz;
  const contained = nadir >= lo && nadir <= hi;
  const caught = c.caught;
  const battery = caught.batteryMW + caught.guardMW;
  // Inertia comes first and carries the whole hole at the start, but at the extreme (where
  // df/dt = 0) its catch is about zero, so it is named without a number (§4.1's card), as the
  // BALANCE bar names it: spin.
  const falls = c.lostMW >= 0, inverter = caught.inverterMW || 0;
  const parts = (falls
    ? [['battery', battery], ['governors', caught.governorsMW], ['load relief', caught.loadReliefMW], ['UFLS', caught.uflsMW]]
    : [['battery took', 0 - battery], ['governors backed off', 0 - caught.governorsMW], ['load picked up', 0 - caught.loadReliefMW],
      ['UFLS', caught.uflsMW]]).filter(p => Math.abs(p[1]) >= 1);
  if (Math.abs(inverter) >= 1) {
    const part = [inverter < 0 ? 'solar and wind backed off' : 'solar and wind gave back', Math.abs(inverter)];
    // in physical order: the inverters' droop acts with the governors', ahead of them when it caught more
    const g = parts.findIndex(p => p[0].startsWith('governors'));
    if (g < 0) parts.push(part);
    else parts.splice(Math.abs(inverter) > Math.abs(parts[g][1]) ? g : g + 1, 0, part);
  }
  const line1 = (falls ? 'NADIR ' : 'PEAK ') + f3(nadir) + ' Hz: ' + (contained ? 'contained within ' : 'OUTSIDE ') +
    lo.toFixed(1) + '–' + hi.toFixed(1) + ' Hz ' + (contained ? '✓' : '✗') + '. Back to ' + V.NORMAL_LO_HZ.toFixed(2) + '–' +
    V.NORMAL_HI_HZ.toFixed(2) + ' Hz within ' + mmss(V.FOS_RECOVER_S) + '.';
  const line2 = 'Caught by: ' + ['spin', ...parts.map(p => p[0] + ' ' + mw(p[1]) + ' MW')].join(' → ') + '.';
  const sec = obs.sec, short = Math.max(0, sec.lMW - sec.r5MW);
  const secureInS = Math.max(0, (c.secureByTick - obs.tick) / TPS);
  const dark = obs.districts.filter(d => d.dark);
  const darkMW = dark.reduce((a, d) => a + d.coldLoadMW, 0);
  let problem;
  if (sec.level === 'SECURE') problem = 'N-1 SECURE: the fleet can take the next trip.';
  else if (sec.level === 'SHORT' || short > 0) problem = 'N-1 INSECURE: ' + mw(short) + ' MW short, ' + mmss(secureInS) + '.';
  else if (sec.level === 'TIGHT') problem = 'N-1 TIGHT: secure it within ' + mmss(secureInS) + '.';
  else problem = 'SHEDDING: ' + dark.length + ' districts dark.';
  if (dark.length && sec.level !== 'SHEDDING') problem += ' ' + dark.length + ' district' + (dark.length > 1 ? 's' : '') + ' dark (' + mw(darkMW) + ' MW).';
  else if (dark.length) problem = problem.replace(/\.$/, ' (' + mw(darkMW) + ' MW). Restore when the lamp lights.');
  const glow = new Set(o && o.glow ? o.glow : []);
  if (dark.length) glow.add('bay-restore');
  return {
    n: c.n,
    lines: [line1, line2, problem, 'Enter (or a click) to take the desk.'],
    numbers: {nadirHz: nadir, contained, caught: {inertiaMW: caught.inertiaMW, batteryMW: battery, governorsMW: caught.governorsMW,
      loadReliefMW: caught.loadReliefMW, uflsMW: caught.uflsMW, inverterMW: inverter}, shortMW: short, secureInS, darkCount: dark.length, darkMW,
    level: sec.level},
    glow: [...glow],
  };
}

/**
 * The glow set without the Live Stack's planview (fallback until app/planview.js is wired):
 * the START guard of each machine that is off, startable, and can reach MIN before the secure
 * deadline, the battery dial when the guard is below its maximum, and the tie knob when it
 * has import headroom. planview.glowSet replaces it when present (L-9).
 */
export function fallbackGlow(obs, c) {
  const out = [];
  const left = (c.secureByTick - obs.tick) / TPS;
  for (const u of obs.units) if (u.mode === 'off' && u.startBlock === '' && u.startToMinS <= left) out.push('guard-start-' + u.id);
  if (obs.battery.guardMW < V.BATT_MW) out.push('dial-battery');
  if (!obs.tie.tripped && obs.tie.setMW < V.TIE_MAX_MW) out.push('knob-tie');
  return out;
}

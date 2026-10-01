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
// The respond card (K-16) is <= 4 lines, with no buttons: the nadir against the standard, the
// MW each source caught (the record's caught at the extreme, which is the trace value at the
// nadir), the problem in plain words (the H-4 level, R5 - L if short, the 30:00 countdown from
// secureByTick, dark districts), and "Enter to take the desk".

import {V} from '../sim/params.js';

const TPS = V.TICKS_PER_S;
export const BEATS = Object.freeze(['inertia', 'battery', 'governors', 'ufls', 'settle']);
/** The settle beat starts this many grid-s after the trip (K-15: 10-30 s). */
export const SETTLE_S = 10;
/** The UFLS beat lasts this long after a relay operates, unless settle starts first. */
export const UFLS_BEAT_S = 2;

const f3 = x => x.toFixed(3);
const mw = x => String(Math.round(x));

/** Captions, <= 15 words each (K-15, full version). */
export function caption(beat, ctx) {
  switch (beat) {
    case 'inertia': return 'Stored spin in every turbine takes the hit. Frequency falls.';
    case 'battery': return ctx.guardMW > 0 ? 'YOUR GUARD: ' + mw(ctx.guardMW) + ' MW. The battery answers within a second.'
      : 'The battery answers from its own droop. No guard held back.';
    case 'governors': return ctx.nadirHz > 0 ? 'Governors open the valves. The fall stops at ' + f3(ctx.nadirHz) + ' Hz.'
      : 'Governors open the steam and gas valves. The fall slows.';
    case 'ufls': return 'Below 49.0 Hz: relays shed districts to save the rest.';
    case 'settle': return 'Droop parks frequency below 50. Restoring fifty is AGC\'s job, and yours.';
    default: return '';
  }
}

// The beat the trace shows at tick offset k (before the monotonic rule).
function rawBeat(tr, k, uflsK) {
  if (k >= SETTLE_S * TPS) return 4;
  if (uflsK >= 0 && k >= uflsK && k < uflsK + UFLS_BEAT_S * TPS) return 3;
  const i = Math.max(0, Math.min(k, tr.len - 2));
  const c = tr.caught;
  const inertia = c.inertiaMW[i], batt = c.batteryMW[i] + c.guardMW[i], gov = c.governorsMW[i];
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
 * @returns {Array<{k:number, beat:string}>} each beat change (the first entry at k = 0)
 */
export function beatTimeline(tr, upTo = V.WATCH_S * TPS) {
  const out = [];
  const uflsK = firstUfls(tr, upTo);
  let cur = -1;
  for (let k = 0; k < Math.min(upTo, V.WATCH_S * TPS); k++) {
    const b = Math.max(cur, rawBeat(tr, k, uflsK));
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
 *   nadirHz:number, rate:number, version:string, guardMW:number, cause:string, id:string, lostMW:number}}
 */
export function watchView(w, tr, c, tick, m) {
  if (w.n !== c.n) { w.n = c.n; w.beat = 0; w.uflsK = -1; }
  const k = tick - c.startTick;
  if (w.uflsK < 0) w.uflsK = firstUfls(tr, k);
  const b = Math.max(w.beat, rawBeat(tr, k, w.uflsK));
  w.beat = b;
  // The nadir is known once frequency has turned back up.
  let nadir = 0;
  if (c.extremeTick >= c.startTick && tick - c.extremeTick > TPS / 2) nadir = c.extremeHz;
  const tS = k / TPS;
  return {n: c.n, tS, beat: BEATS[b], beatIndex: b, caption: caption(BEATS[b], {guardMW: m.guardMW, nadirHz: nadir}),
    stopwatch: stopwatch(tS, m.rate), nadirHz: nadir, rate: m.rate, version: m.version, guardMW: m.guardMW,
    cause: c.cause, id: c.id, lostMW: c.lostMW};
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
 * @returns {{n:number, lines:string[], numbers:{nadirHz:number, contained:boolean, caught:object, shortMW:number,
 *   secureInS:number, darkCount:number, darkMW:number, level:string}, glow:string[]}}
 */
export function respondCard(obs, c, o) {
  const lo = V.CONTAIN_LO_HZ, hi = V.CONTAIN_HI_HZ;
  const nadir = c.extremeHz;
  const contained = nadir >= lo && nadir <= hi;
  const caught = c.caught;
  const battery = caught.batteryMW + caught.guardMW;
  // Inertia comes first and carries the whole hole at the start, but at the extreme (where
  // df/dt = 0) its catch is about zero, so it is named without a number (§4.1's card).
  const parts = [['battery', battery], ['governors', caught.governorsMW], ['load relief', caught.loadReliefMW],
    ['UFLS', caught.uflsMW]].filter(p => Math.abs(p[1]) >= 1);
  const falls = c.lostMW >= 0;
  const line1 = (falls ? 'NADIR ' : 'PEAK ') + f3(nadir) + ' Hz: ' + (contained ? 'contained within ' : 'OUTSIDE ') +
    lo.toFixed(1) + '–' + hi.toFixed(1) + ' Hz ' + (contained ? '✓' : '✗') + '. Back to ' + V.NORMAL_LO_HZ.toFixed(2) + '–' +
    V.NORMAL_HI_HZ.toFixed(2) + ' Hz within ' + mmss(V.FOS_RECOVER_S) + '.';
  const line2 = 'Caught by: ' + ['inertia', ...parts.map(p => p[0] + ' ' + mw(p[1]) + ' MW')].join(' → ') + '.';
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
    lines: [line1, line2, problem, 'Enter to take the desk.'],
    numbers: {nadirHz: nadir, contained, caught: {inertiaMW: caught.inertiaMW, batteryMW: battery, governorsMW: caught.governorsMW,
      loadReliefMW: caught.loadReliefMW, uflsMW: caught.uflsMW}, shortMW: short, secureInS, darkCount: dark.length, darkMW,
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

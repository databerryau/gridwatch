// app/loop.js: the frame loop (spec F-5, X-26).
//
// Each animation frame adds min(frameDt, MAX_FRAME_DT_S) x rate grid-seconds to an
// accumulator (kept in ticks) and runs whole 20-ms ticks, up to a per-frame cap and a time
// budget. The rules this file guarantees (tests/loop.test.js):
//   * every tick is run exactly once, in order: nothing here skips or repeats a tick, and
//     the sim never sees the frame rate (the same input log at any rate or display refresh
//     gives the same state at the same tick; F-4, D-6);
//   * a lagging frame (cap or budget hit) slows play: the time it could not run is dropped,
//     never the ticks, so play resumes at its rate from the next frame instead of spiralling;
//   * when the rate changes between two ticks (a contingency opens the watch, a watch
//     segment ends), the time still owed is converted to the new rate at once, so the
//     watch's 0.15x segment starts at once, not a frame later. A contingency is known only
//     after the tick that opened it (a pre-rolled trip happens inside step()), so that tick
//     was charged at the old rate; rateLast() lets the loop re-charge it at the watch rate
//     (the accumulator may then owe time, i.e. go below 0, and the next tick waits for it),
//     so the watch lasts its full real time from its first tick;
//   * draw never runs inside step(): runFrame only steps; the caller draws after it returns.
//
// Pure: runFrame takes callbacks and a pacer object, so Node tests drive it with fake
// frame times. Only startRaf() touches the browser, and only when called.

import {V} from '../sim/params.js';

/** Grid seconds per tick (20 ms, V.PHYS_DT). */
export const TICK_S = V.PHYS_DT;
/** F-5: a frame never adds more than this much real time (a stall or a hidden tab). */
export const MAX_FRAME_DT_S = 0.1;
/** The fastest rate the director offers (debug); sets the per-frame tick cap. */
export const MAX_RATE = 2100;
/** Per-frame cap: the fastest rate at the longest frame, so it binds only when frames stall. */
export const TICK_CAP = Math.ceil(MAX_FRAME_DT_S * MAX_RATE / TICK_S);
/** Real-time budget for stepping in one frame (ms); past it the frame lags (slows play). */
export const FRAME_BUDGET_MS = 12;

// Float slack when comparing the accumulator with whole ticks (1/60 s x 120 / 0.02 s is
// 99.99999999999999 in binary floating point, and must still count as 100 ticks).
const EPS = 1e-9;
const BUDGET_CHECK_EVERY = 16; // ticks between clock reads when a budget is set

/**
 * A pacer holds the loop's only state: the accumulator (ticks owed, fractional) and counters
 * for the rate badge. Plain object; one per session.
 * @param {{cap?:number, budgetMs?:number}} [opts]
 */
export function createPacer(opts) {
  const o = opts || {};
  return {
    acc: 0,              // ticks owed (fractional); < 0 only while a re-charged watch tick is being paid
    rate: 0,             // the rate the accumulator is expressed at (grid-s per real-s)
    cap: o.cap === undefined ? TICK_CAP : o.cap,
    budgetMs: o.budgetMs === undefined ? FRAME_BUDGET_MS : o.budgetMs,
    frames: 0, ticks: 0,       // totals
    lagFrames: 0,              // frames that hit the cap or the budget
    lostTicks: 0,              // ticks' worth of time dropped by lagging frames (play slowed)
    lastTicks: 0, lagging: false,
    alpha: 0,                  // fraction of the next tick already elapsed (render interpolation)
    realS: 0, gridS: 0,        // for the effective-rate readout (decayed sums)
  };
}

/** min(frameDt, MAX_FRAME_DT_S), and 0 for a negative or non-finite dt. */
export function clampDt(frameDtS) {
  return Number.isFinite(frameDtS) && frameDtS > 0 ? Math.min(frameDtS, MAX_FRAME_DT_S) : 0;
}

// Re-express the ticks owed at `from` as ticks owed at `to` (the same real time left).
function rescale(p, to) {
  p.acc = p.rate > 0 && to > 0 ? p.acc * to / p.rate : 0;
  p.rate = to;
}

/**
 * Run one animation frame of play.
 * @param {object} p pacer from createPacer
 * @param {number} frameDtS real seconds since the previous frame
 * @param {{rate: function():number, tick: function():void, done?: function():boolean,
 *   now?: function():number, rateLast?: function():number}} h
 *   rate(): grid seconds per real second right now (0 = paused); asked before the frame and
 *     after every tick, so a rate change takes effect between two ticks.
 *   rateLast(): the rate that should have governed the tick just run, in hindsight (the
 *     watch's rate for the tick that opened it); omit when it is always rate().
 *   tick(): run exactly one sim tick (step + recording). Never draws.
 *   done(): true once the day is over (the loop stops and owes nothing).
 *   now(): a millisecond clock for the frame budget (omit in tests for no budget).
 * @returns {number} ticks run this frame
 */
export function runFrame(p, frameDtS, h) {
  const dt = clampDt(frameDtS);
  let rate = h.rate();
  if (rate !== p.rate) rescale(p, rate);
  p.acc += dt * rate / TICK_S;
  const now = h.now || null, t0 = now ? now() : 0;
  let n = 0, lagging = false;
  while (p.acc >= 1 - EPS) {
    if (h.done && h.done()) { p.acc = 0; break; }
    if (n >= p.cap || (now && n % BUDGET_CHECK_EVERY === 0 && n > 0 && now() - t0 > p.budgetMs)) { lagging = true; break; }
    h.tick();
    n++;
    p.acc -= 1;
    if (p.acc < 0 && p.acc > -EPS) p.acc = 0;
    if (h.rateLast) {
      const rl = h.rateLast();
      // Refund the tick at the rate it was charged, re-charge it at the rate it belongs to.
      if (rl !== rate && rl > 0 && rate > 0) { p.acc = (p.acc + 1) * rl / rate - 1; rate = rl; p.rate = rl; }
    }
    const r = h.rate();
    if (r !== rate) { rescale(p, r); rate = r; }
  }
  if (lagging) {
    // Drop the time, keep the tick grid: owe at most the fraction of one tick.
    const whole = Math.max(0, Math.floor(p.acc + EPS));
    p.lostTicks += whole;
    p.acc = Math.max(0, p.acc - whole);
    p.lagFrames++;
  }
  p.lagging = lagging;
  p.frames++;
  p.ticks += n;
  p.lastTicks = n;
  p.alpha = Math.min(1, Math.max(0, p.acc));
  // Effective rate over roughly the last two seconds (exponential decay by real time); the
  // badge shows it when frames lag. Coarse at slow rates, where ticks are frames apart.
  const keep = Math.max(0, 1 - dt / 2);
  p.realS = p.realS * keep + dt;
  p.gridS = p.gridS * keep + n * TICK_S;
  return n;
}

/** Grid seconds actually played per real second lately (differs from the rate when lagging). */
export function effectiveRate(p) {
  return p.realS > 0 ? p.gridS / p.realS : 0;
}

/**
 * Browser driver: calls frame(dtS) from requestAnimationFrame. A hidden tab pauses (F-5):
 * onHidden(true/false) tells the director, and the first frame after a return has dt 0 so
 * no time is owed for the time away. Returns stop().
 * @param {function(number):void} frame
 * @param {function(boolean):void} [onHidden]
 */
export function startRaf(frame, onHidden) {
  const doc = globalThis.document, raf = globalThis.requestAnimationFrame;
  let last = -1, stopped = false;
  const onVis = () => {
    last = -1;
    if (onHidden) onHidden(doc.visibilityState === 'hidden');
  };
  if (doc) doc.addEventListener('visibilitychange', onVis);
  const loop = ts => {
    if (stopped) return;
    const dt = last < 0 ? 0 : (ts - last) / 1000;
    last = ts;
    frame(dt);
    raf(loop);
  };
  raf(loop);
  return () => { stopped = true; if (doc) doc.removeEventListener('visibilitychange', onVis); };
}

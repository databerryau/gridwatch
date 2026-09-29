// sim/rng.js: counter-based random numbers (spec F-3). Pure: no state, no Math.random.
//
// Every draw is a function of (seed, stream, a, b, c): the same counters always give the
// same number, in any order, in any JS engine. Only 32-bit integer operations, one
// division by 2^32 and additions are used, so results are bit-identical across engines
// (risk 5). Streams:
//   ext.*  the external world, pre-rolled at createState (weather, demand noise, events);
//          never depends on play (C-6).
//   play   player-dependent outcomes: hash(seed, 'play', tick, unitIndex, draw).
//   fx     cosmetic randomness lives in render/ and audio/ only (Math.random allowed there).
//
// Stage A owns this file; it is frozen. Changing it changes every daily (bump SIM_VERSION).

import {V} from './params.js';

const GOLDEN = V.RNG_GOLDEN, M1 = V.RNG_FMIX_M1, M2 = V.RNG_FMIX_M2;
const S1 = V.RNG_FMIX_S1, S2 = V.RNG_FMIX_S2;
const FNV_OFFSET = V.RNG_FNV_OFFSET, FNV_PRIME = V.RNG_FNV_PRIME;
const U32 = V.RNG_U32, TERMS = V.RNG_NORMAL_TERMS, SALT = V.RNG_NORMAL_SALT;

/** MurmurHash3 fmix32: a bijective 32-bit avalanche mix. */
function fmix(h) {
  h ^= h >>> S1;
  h = Math.imul(h, M1);
  h ^= h >>> S2;
  h = Math.imul(h, M2);
  h ^= h >>> S1;
  return h >>> 0;
}

/** FNV-1a hash of a stream name to a u32 stream id. */
export function streamId(name) {
  let h = FNV_OFFSET;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), FNV_PRIME) >>> 0;
  return fmix(h);
}

/** Stream ids. Add new ext streams here (never re-use a name for a different purpose). */
export const STREAM = Object.freeze({
  EXT_REGIME: streamId('ext.regime'),    // weather class of the day
  EXT_EVENTS: streamId('ext.events'),    // event times, targets, lockouts (index = menu slot, b = draw)
  EXT_DEMAND: streamId('ext.demand'),    // demand noise, 1-min samples (index = sample)
  EXT_WIND: streamId('ext.wind'),        // wind fraction, 1-min samples
  EXT_CLOUD: streamId('ext.cloud'),      // utility-solar clearness, 1-min samples
  EXT_FINE: streamId('ext.fine'),        // per-second demand wobble (index = grid second)
  EXT_ROOFTOP: streamId('ext.rooftop'),  // Phase 2 hook: per-suburb clearness (b = suburb index)
  PLAY: streamId('play'),                // player-dependent draws (index = tick, b = unit index, c = draw)
});

/**
 * u32 hash of (seed, stream, a, b, c). All arguments are integers in [0, 2^32);
 * a is usually a sample index, second or tick; b and c are sub-indices.
 */
export function hash32(seed, stream, a, b = 0, c = 0) {
  let h = fmix((seed + GOLDEN) >>> 0);
  h = fmix((h ^ stream) >>> 0);
  h = fmix((h + (a >>> 0)) >>> 0);
  h = fmix((h ^ Math.imul((b >>> 0) + 1, GOLDEN)) >>> 0);
  h = fmix((h + Math.imul((c >>> 0) + 1, M1)) >>> 0);
  return h;
}

/** Uniform in [0, 1). */
export function uniform(seed, stream, a, b = 0, c = 0) {
  return hash32(seed, stream, a, b, c) / U32;
}

/**
 * Standard normal (Irwin-Hall: sum of 12 uniforms minus 6). Mean 0, variance 1, range
 * +-6. Uses c * 12 ... c * 12 + 11 on a salted stream, so it never collides with uniform().
 */
export function normal(seed, stream, a, b = 0, c = 0) {
  const s = (stream ^ SALT) >>> 0;
  let sum = 0;
  for (let j = 0; j < TERMS; j++) sum += uniform(seed, s, a, b, c * TERMS + j);
  return sum - TERMS / 2;
}

/**
 * Pick one of `items` using a uniform u in [0, 1). With `weightOf`, items are weighted;
 * otherwise uniform. Pure: pass u = uniform(...) for a seeded pick.
 */
export function pickWith(u, items, weightOf) {
  if (!items.length) return undefined;
  if (!weightOf) return items[Math.min(items.length - 1, Math.floor(u * items.length))];
  let total = 0;
  for (const it of items) total += weightOf(it);
  let x = u * total;
  for (const it of items) {
    x -= weightOf(it);
    if (x < 0) return it;
  }
  return items[items.length - 1];
}

/** Seeded pick: pickWith(uniform(seed, stream, a, b, c), items, weightOf). */
export function pick(seed, stream, a, b, c, items, weightOf) {
  return pickWith(uniform(seed, stream, a, b, c), items, weightOf);
}

/**
 * Round x to the nearest multiple of step (Math.round: halves go up). Never returns -0,
 * because JSON drops the sign of zero and a resumed state must hash like the original.
 */
export function quantise(x, step) {
  return Math.round(x / step) * step + 0;
}

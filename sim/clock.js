// sim/clock.js: the one clock, grid seconds against real seconds (desk/README.md §32, Q-62).
//
// The one clock: grid seconds against real seconds. Pure, imports `params.js` only (linted). Sim
// seconds: 0 = 04:00, `DAY_S` = 04:00 next day.
//
// - `SEGMENTS` (frozen `{a, b, rate, name}` from `V.REF_PROFILE` and `V.CLOCK_SEGMENT_NAMES`, the one
//   table), `NIGHT_S` (21:00 = 61,200, the last segment's start), `ACT_S` ([04:30, 09:00, 14:30,
//   21:00, 04:00] = [1800, 18000, 37800, 61200, 86400]), `PEAK` ([a, b] of the segment named PEAK,
//   16:30-20:00).
// - `actAt(s)`: 0 before 04:30, then 1, 2, 3, and 4 for the night roll. `segmentAt(s)`: the index
//   into `SEGMENTS` (0 before 04:30, the last from `NIGHT_S`). `targetRate(s, hand)`: the segment's
//   rate, x `HAND_RATE_FACTOR` before `NIGHT_S` when `hand` (the badge's number).
// - `rateAt(s, hand)`: the player's rate. At each of the seven interior boundaries the **pace**
//   (1 / rate) runs linearly from 1 / r1 to 1 / r2 across a grid window W = 2 x
//   `CLOCK_EASE_REAL_S` x r1 x r2 / (r1 + r2) centred on the boundary: the ease lasts exactly
//   2 real s and keeps the integral over the whole window, so the AGC day from 04:30 is still
//   245.000 s (HAND 478 s). A span with one end inside a window differs from the step profile (at
//   the mode's own speeds: halved before 21:00 in HAND) by at most that window's peak, `EASE` x
//   |r1 - r2| / (4 (r1 + r2)), reached at the boundary: 0.375 s at 21:00 in AGC (0.433 s in HAND),
//   at most 0.167 s at the other six. With both ends in windows it differs by up to two peaks
//   together: 0.542 s in AGC (06:00 and 21:00; HAND 0.600 s). All inside the leads' 1-s margin
//   (Q-71). Elsewhere it is `targetRate`; before 04:30 the first segment's, after 04:00 the last's.
// - `realBetween(a, b, hand)`: the integral of 1 / `rateAt` over [a, b), in closed form (a table of
//   linear-pace pieces with cumulative real seconds); `gridAfter(s, realS, hand)` its exact inverse
//   (the quadratic of a linear pace, solved in the stable form).
// - `stepReal(a, b)`: autopilot's `profileReal`, moved bit for bit (no HAND, no ease): par's pace,
//   and the measure the D-8 leads and the spacing rules use. `stepAfter(s, realS)` is the earliest g
//   >= s with `stepReal(s, g) >= realS`, `gridBefore(s, realS)` the latest g <= s with `stepReal(g,
//   s) >= realS`, both exact against `stepReal`'s own floating point: a guess from the same table,
//   then a halving search from `CLOCK_SEARCH_S` (1e-6 grid s) to the least (or greatest) float that
//   passes (NaN in, NaN out). So `ceil(stepAfter / 60) x
//   60` and `floor(gridBefore / 60) x 60` are the earliest and the latest whole minutes that pass,
//   with no tolerance (the plan's warning and spacing draws, Q-71 and Q-72).
// - `hhmm(s)`: 'HH:MM' of sim second s, the one formatter for the sim's 2c texts (events' new
//   notices, fleet's outage reason).
//
// Every mode change of the rate director (watch, card, RESPOND, RESTORE, FOCUS, PAUSE, FAST,
// ALARMS) is instant: the ease is only between profile segments. From wave 2 the director, the D-8
// leads, the objective's reading lead, the tray's card life and the stack's cadence read this
// module. `tests/clock.test.js` checks it with no state stepped. `app/director.js` keeps the flat
// stretch between two eases instead of asking `rateAt` every tick, with the ease's half-width
// computed as here (`CLOCK_EASE_REAL_S` r1 r2 / (r1 + r2)): a change to the ease's shape changes both
// (`tests/clock-director.test.js` plays the day through it against `realBetween`).

import {V} from './params.js';

const S_PER_H = V.S_PER_H, DAY_S = V.DAY_S, HAND = V.HAND_RATE_FACTOR, EASE = V.CLOCK_EASE_REAL_S;
const secOfH = h => (h - V.DAY_START_H) * S_PER_H;

export const SEGMENTS = Object.freeze(V.REF_PROFILE.map((p, j) =>
  Object.freeze({a: secOfH(p.fromH), b: secOfH(p.toH), rate: p.rate, name: V.CLOCK_SEGMENT_NAMES[j]})));
const N = SEGMENTS.length, FIRST = SEGMENTS[0], LAST = SEGMENTS[N - 1];
export const NIGHT_S = LAST.a;
export const ACT_S = Object.freeze([FIRST.a, SEGMENTS[2].a, SEGMENTS[4].a, NIGHT_S, DAY_S]);
const PK = SEGMENTS.find(x => x.name === 'PEAK');
export const PEAK = Object.freeze([PK.a, PK.b]);

export function actAt(s) {
  let k = 0;
  while (k < ACT_S.length - 1 && s >= ACT_S[k]) k++;
  return k;
}

export function segmentAt(s) {
  let j = 0;
  while (j < N - 1 && s >= SEGMENTS[j + 1].a) j++;
  return j;
}

export function targetRate(s, hand) {
  return SEGMENTS[segmentAt(s)].rate * (hand && s < NIGHT_S ? HAND : 1);
}

// Pace (1 / rate) on [X[k], X[k+1]) runs linearly from A[k] to B[k]; C[k]: real s from X[0] to X[k].
function table(X, A, B) {
  const C = [0];
  for (let k = 0; k < A.length; k++) C.push(C[k] + (X[k + 1] - X[k]) * (A[k] + B[k]) / 2);
  return {X, A, B, C};
}

function eased(hand) {
  const X = [], A = [], B = [];
  for (let j = 1; j < N; j++) {
    const r1 = targetRate(SEGMENTS[j - 1].a, hand), r2 = targetRate(SEGMENTS[j].a, hand), w = EASE * r1 * r2 / (r1 + r2);
    if (j > 1) { A.push(1 / r1); B.push(1 / r1); }
    X.push(SEGMENTS[j].a - w, SEGMENTS[j].a + w);
    A.push(1 / r1); B.push(1 / r2);
  }
  return table(X, A, B);
}
const T_AGC = eased(false), T_HAND = eased(true);
const STEPS = SEGMENTS.map(x => 1 / x.rate), T_STEP = table(SEGMENTS.map(x => x.a).concat(LAST.b), STEPS, STEPS);

function realAt(T, x) {
  const {X, A, B, C} = T, n = X.length - 1;
  if (x <= X[0]) return (x - X[0]) * A[0];
  if (x >= X[n]) return C[n] + (x - X[n]) * B[n - 1];
  let k = 0;
  while (x >= X[k + 1]) k++;
  const d = x - X[k];
  return C[k] + d * (A[k] + (B[k] - A[k]) * d / (X[k + 1] - X[k]) / 2);
}

function gridAt(T, y) {
  const {X, A, B, C} = T, n = X.length - 1;
  if (y <= 0) return X[0] + y / A[0];
  if (y >= C[n]) return X[n] + (y - C[n]) / B[n - 1];
  let k = 0;
  while (y >= C[k + 1]) k++;
  const r = y - C[k], m = (B[k] - A[k]) / (X[k + 1] - X[k]);
  return X[k] + 2 * r / (A[k] + Math.sqrt(A[k] * A[k] + 2 * m * r));
}

export function rateAt(s, hand) {
  const {X, A, B} = hand ? T_HAND : T_AGC;
  for (let k = 0; k < A.length; k++) {
    if (A[k] !== B[k] && s >= X[k] && s < X[k + 1]) return 1 / (A[k] + (B[k] - A[k]) * (s - X[k]) / (X[k + 1] - X[k]));
  }
  return targetRate(s, hand);
}

// autopilot's profileReal, moved bit-identically: par's pace (no HAND, no ease)
export function stepReal(a, b) {
  if (!(b > a)) return 0;
  let r = 0;
  if (a < FIRST.a) r += (Math.min(b, FIRST.a) - a) / FIRST.rate;
  for (const p of SEGMENTS) {
    const lo = Math.max(a, p.a), hi = Math.min(b, p.b);
    if (hi > lo) r += (hi - lo) / p.rate;
  }
  if (b > LAST.b) r += (b - Math.max(a, LAST.b)) / LAST.rate;
  return r;
}

// The least float g with ok(g), ok monotone, from a guess within CLOCK_SEARCH_S (exact)
function least(g, ok) {
  let e = V.CLOCK_SEARCH_S;
  for (; !ok(g) && g === g; e += e) g += e;
  for (; g - e < g; e /= 2) if (ok(g - e)) g -= e;
  return g;
}
export const stepAfter = (s, realS) =>
  least(Math.max(s, gridAt(T_STEP, realAt(T_STEP, s) + realS)), g => g >= s && stepReal(s, g) >= realS);
export const gridBefore = (s, realS) =>
  -least(-Math.min(s, gridAt(T_STEP, realAt(T_STEP, s) - realS)), g => -g <= s && stepReal(-g, s) >= realS);
export function realBetween(a, b, hand) {
  const T = hand ? T_HAND : T_AGC;
  return b > a ? realAt(T, b) - realAt(T, a) : 0;
}
export const gridAfter = (s, realS, hand) => { const T = hand ? T_HAND : T_AGC; return gridAt(T, realAt(T, s) + realS); };

const pad = n => String(n).padStart(2, '0');
export function hhmm(s) {
  const d = ((V.DAY_START_H * S_PER_H + Math.round(s)) % DAY_S + DAY_S) % DAY_S;
  return pad(Math.floor(d / S_PER_H)) + ':' + pad(Math.floor(d % S_PER_H / V.S_PER_MIN));
}

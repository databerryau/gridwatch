// sim/clock.js: the one clock, grid seconds against real seconds (desk/README.md §32, Q-62).
// Contract: sim/README.md §11 clock.js.

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

export const stepAfter = (s, realS) => gridAt(T_STEP, realAt(T_STEP, s) + realS);
export const gridBefore = (s, realS) => gridAt(T_STEP, realAt(T_STEP, s) - realS);
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

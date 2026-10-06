// F-3: counter-based random streams. Deterministic, independent, uniform; frozen values.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash32, uniform, normal, pick, pickWith, quantise, streamId, STREAM} from '../sim/rng.js';
import {prerollRegime} from '../sim/weather.js';
import {createState} from '../sim/step.js';
import {DESK} from '../content/scenarios.js';

const N = 50000;

function corr(xs, ys) {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}
const series = (f, n = N) => Array.from({length: n}, (_, i) => f(i));

test('frozen: hash values and stream ids never change (changing them changes every daily)', () => {
  assert.deepEqual([hash32(0, 0, 0), hash32(1, 0, 0), hash32(1, STREAM.PLAY, 12345, 7, 1), hash32(4294967295, STREAM.EXT_WIND, 1440, 0, 0)],
    [1645074574, 1742775628, 3737155626, 2250391129]);
  assert.deepEqual({...STREAM}, {EXT_REGIME: 2161427110, EXT_EVENTS: 1868303352, EXT_DEMAND: 3084338249, EXT_WIND: 415615546,
    EXT_CLOUD: 883057304, EXT_FINE: 3752415739, EXT_ROOFTOP: 1249761138, PLAY: 3730791262});
  assert.equal(uniform(7, STREAM.EXT_DEMAND, 3), 0.003984150709584355);
  assert.equal(normal(7, STREAM.EXT_DEMAND, 3), 0.8902797317132354);
});

test('determinism: same counters, same number; u32 range; every counter matters', () => {
  for (let i = 0; i < 1000; i++) {
    const h = hash32(42, STREAM.EXT_WIND, i, i % 3, i % 5);
    assert.equal(h, hash32(42, STREAM.EXT_WIND, i, i % 3, i % 5));
    assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32);
  }
  const base = hash32(9, STREAM.PLAY, 100, 4, 2);
  for (const other of [hash32(10, STREAM.PLAY, 100, 4, 2), hash32(9, STREAM.EXT_FINE, 100, 4, 2), hash32(9, STREAM.PLAY, 101, 4, 2),
    hash32(9, STREAM.PLAY, 100, 5, 2), hash32(9, STREAM.PLAY, 100, 4, 3)]) assert.notEqual(other, base);
  assert.equal(new Set(Object.values(STREAM)).size, Object.keys(STREAM).length, 'stream ids are distinct');
  assert.equal(streamId('play'), STREAM.PLAY);
});

test('uniformity: mean, chi-square over 20 bins, range', () => {
  const xs = series(i => uniform(123, STREAM.EXT_DEMAND, i));
  const bins = new Array(20).fill(0);
  let mean = 0;
  for (const x of xs) { assert.ok(x >= 0 && x < 1); bins[Math.floor(x * 20)]++; mean += x / N; }
  assert.ok(Math.abs(mean - 0.5) < 0.01, 'mean ' + mean);
  const e = N / 20;
  const chi2 = bins.reduce((a, o) => a + (o - e) ** 2 / e, 0);
  assert.ok(chi2 < 43.8, 'chi-square ' + chi2.toFixed(1) + ' (df 19, p = 0.001 critical 43.8)');
});

test('independence: across streams, seeds, sub-indices and neighbouring indices', () => {
  const a = series(i => uniform(5, STREAM.EXT_WIND, i));
  const pairs = {
    'other stream': series(i => uniform(5, STREAM.EXT_CLOUD, i)),
    'next seed': series(i => uniform(6, STREAM.EXT_WIND, i)),
    'sub-index b': series(i => uniform(5, STREAM.EXT_WIND, i, 1)),
    'sub-index c': series(i => uniform(5, STREAM.EXT_WIND, i, 0, 1)),
    'lag 1': series(i => uniform(5, STREAM.EXT_WIND, i + 1)),
    'normal lane': series(i => normal(5, STREAM.EXT_WIND, i)),
  };
  for (const [name, b] of Object.entries(pairs)) {
    const r = corr(a, b);
    assert.ok(Math.abs(r) < 0.03, name + ': r = ' + r.toFixed(4));
  }
});

test('normal(): exact-arithmetic Irwin-Hall, mean 0, variance 1, tails', () => {
  const zs = series(i => normal(77, STREAM.EXT_DEMAND, i));
  let m = 0, v = 0, tail = 0;
  for (const z of zs) { m += z / N; assert.ok(Math.abs(z) <= 6); }
  for (const z of zs) { v += (z - m) ** 2 / N; if (Math.abs(z) > 1.96) tail++; }
  assert.ok(Math.abs(m) < 0.02, 'mean ' + m);
  assert.ok(Math.abs(v - 1) < 0.03, 'variance ' + v);
  assert.ok(Math.abs(tail / N - 0.05) < 0.006, 'P(|z| > 1.96) = ' + tail / N);
});

test('pick and quantise', () => {
  const items = ['a', 'b', 'c'];
  const counts = {a: 0, b: 0, c: 0};
  for (let i = 0; i < 30000; i++) counts[pick(3, STREAM.EXT_EVENTS, i, 0, 0, items, x => (x === 'c' ? 2 : 1))]++;
  assert.ok(Math.abs(counts.c / 30000 - 0.5) < 0.015 && Math.abs(counts.a / 30000 - 0.25) < 0.015, JSON.stringify(counts));
  assert.equal(pickWith(0, items), 'a');
  assert.equal(pickWith(0.9999999, items), 'c');
  assert.equal(pickWith(0.5, []), undefined);
  assert.equal(quantise(1.24, 0.5), 1);
  assert.equal(quantise(1.26, 0.5), 1.5);
  assert.ok(Object.is(quantise(-0.2, 1), 0), 'quantise never returns -0 (JSON would lose the sign)');
});

// ------------------------------------------------------------------ Phase 2a "world" (desk/README.md C-2, C-5)
// The belly draws on two streams that already existed: a second counter of EXT_REGIME for the
// day type, and EXT_ROOFTOP for the rooftop skies. No stream was added (the frozen list above).

test('F-3 (Phase 2a): the day type is a second draw on EXT_REGIME (a = 1), independent of the weather class draw (a = 0); frozen', () => {
  const r = corr(series(i => uniform(i + 1, STREAM.EXT_REGIME, 0)), series(i => uniform(i + 1, STREAM.EXT_REGIME, 1)));
  assert.ok(Math.abs(r) < 0.03, 'class against day type over seeds: r = ' + r.toFixed(4));
  assert.equal(uniform(7, STREAM.EXT_REGIME, 1), 0.7705025149043649);
  // The seeds the tests and the Q-18 play pin (desk/README.md §21.4): changing the draw changes every daily.
  const scn = JSON.parse(JSON.stringify(DESK));
  const temps = {1: 'MILD', 2: 'HOT', 3: 'HOT', 4: 'HEATWAVE', 5: 'MILD', 7: 'HOT', 8: 'MILD', 9: 'MILD', 11: 'HOT', 13: 'MILD',
    20260930: 'HOT', 20261001: 'MILD', 20261003: 'HOT', 20261004: 'MILD'};
  for (const [seed, temp] of Object.entries(temps)) assert.equal(prerollRegime(Number(seed), scn).temp, temp, 'seed ' + seed);
  // MILD iff the draw is under mildShare / (1 - heatShare), on a day that is not a heatwave.
  for (let seed = 1; seed <= 500; seed++) {
    const g = prerollRegime(seed, scn), mild = uniform(seed, STREAM.EXT_REGIME, 1) < scn.weather.mildShare / (1 - scn.weather.heatShare);
    assert.equal(g.temp, g.cls === 'heat' ? 'HEATWAVE' : mild ? 'MILD' : 'HOT', 'seed ' + seed);
  }
});

test('F-3 (Phase 2a): the rooftop skies are EXT_ROOFTOP draws only: a = the 5-min sample, b = the suburb, b = 6 the shared sky; lanes independent; frozen', () => {
  assert.equal(normal(7, STREAM.EXT_ROOFTOP, 3, 6), -0.7425813628360629);
  assert.equal(normal(7, STREAM.EXT_ROOFTOP, 3, 0), -2.110627892659977);
  assert.deepEqual(createState(7, DESK).ext.rooftop.clearPm.map(row => row.slice(0, 4)),
    [[950, 935, 927, 877], [950, 947, 953, 965], [950, 967, 960, 965], [950, 953, 970, 976], [950, 926, 963, 964], [950, 933, 970, 961]]);
  const sky = series(i => normal(5, STREAM.EXT_ROOFTOP, i, 6));
  for (let b = 0; b < 6; b++) {
    const r = corr(sky, series(i => normal(5, STREAM.EXT_ROOFTOP, i, b)));
    assert.ok(Math.abs(r) < 0.03, 'the shared sky against suburb ' + b + ': r = ' + r.toFixed(4));
  }
  assert.ok(Math.abs(corr(series(i => normal(5, STREAM.EXT_ROOFTOP, i, 0)), series(i => normal(5, STREAM.EXT_ROOFTOP, i, 1)))) < 0.03);
  // The pre-roll, rebuilt from the stream (desk/README.md C-5): a calm day and a heatwave (seed 4:
  // its clear skies lift the shared sky's mean to at least 0.98 from the 13:30 onset).
  for (const seed of [1, 4]) {
    const s = createState(seed, DESK), c = s.scn.rooftop.cloud, n = s.scn.city.suburbs.length, len = 86400 / c.stepS + 1;
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const shared = [c.startFrac];
    for (let k = 1, x = c.startFrac, mu = c.mu; k < len; k++) {
      if (s.ext.heat && s.ext.heat.onsetS <= k * c.stepS) mu = Math.max(mu, s.scn.events.heat.clearMu);
      x = clamp(x + (mu - x) * c.regional.revertPerStep + c.regional.sigmaPerStep * normal(seed, STREAM.EXT_ROOFTOP, k, n), c.min, c.max);
      shared.push(x);
    }
    const want = [];
    for (let j = 0; j < n; j++) {
      const row = [quantise(clamp(shared[0], c.min, c.max) * 1000, 1)];
      for (let k = 1, x = 0; k < len; k++) {
        x = x * (1 - c.local.revertPerStep) + c.local.sigmaPerStep * normal(seed, STREAM.EXT_ROOFTOP, k, j);
        row.push(quantise(clamp(shared[k] + x, c.min, c.max) * 1000, 1));
      }
      want.push(row);
    }
    assert.equal(s.ext.heat !== null, seed === 4);
    assert.deepEqual(s.ext.rooftop, {stepS: c.stepS, clearPm: want}, 'seed ' + seed);
  }
});

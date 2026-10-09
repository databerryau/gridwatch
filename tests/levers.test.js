// U-2, U-3, U-4, U-6 (desk/README.md §31): the city levers in the sim. Shapes of a block
// (flexParts / flexAt, §31.3.5), the aim (aimFlex, §31.3.10). Pure functions on poked data: no
// whole days (CLAUDE.md budget).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flexParts, flexAt} from '../sim/weather.js';
import {aimFlex} from '../sim/autopilot.js';
import {V} from '../sim/params.js';

const R = V.FLEX_RAMP_S, STEP = V.FC_STEP_S;
const at = (h, m = 0) => (h - V.DAY_START_H) * 3600 + m * 60; // grid second of hh:mm (h unwrapped)

// The integral of knots [[s, mw], ...] (trapezoids: exact for piecewise-linear parts).
const area = kn => kn.slice(1).reduce((a, p, i) => a + (p[1] + kn[i][1]) / 2 * (p[0] - kn[i][0]), 0);
const soakB = (suburb, atS, effMW) => ({suburb, lever: 'soak', atS, endS: atS + V.SOAK_S, effMW, cost: 0});
const airB = (suburb, atS, effMW, cost = V.PATIENCE_AIRCON) => ({suburb, lever: 'aircon', atS, endS: atS + V.AIRCON_S, effMW, cost});

test('U-3: flexParts: a soak is a core (+) and a night fall (-) of the same energy; every knot on the 300-s lattice; parts start and end at 0', () => {
  const b = soakB('HAZ', at(10, 30), 140), p = flexParts(b, 140), E = 140 * (V.SOAK_S - R);
  assert.deepEqual(p.map(x => x.kind), ['core', 'night']);
  assert.deepEqual(p[0].knots, [[at(10, 30), 0], [at(10, 45), 140], [at(14, 15), 140], [at(14, 30), 0]]);
  const D = E / (V.SOAK_NIGHT_TO_S - V.SOAK_NIGHT_FROM_S - R);
  assert.deepEqual(p[1].knots, [[at(22), 0], [at(22, 15), -D], [at(27, 45), -D], [at(28), 0]]);
  assert.equal(at(28), V.DAY_S, 'the night fall ends at 04:00, inside the sim day');
  assert.ok(Math.abs(area(p[0].knots) - E) < 1e-6 && Math.abs(area(p[1].knots) + E) < 1e-6, 'U-3: the night falls by the soaked energy');
});

test('U-3: flexParts: an air-con cycle is pre-cool (+50%) in the hour before, relief (-) for 1.5 h, a front-loaded snapback (+40%) over 1.5 h after', () => {
  const t = at(19, 30), b = airB('TAL', t, 13.5), p = flexParts(b, 13.5), Er = 13.5 * (V.AIRCON_S - R);
  assert.deepEqual(p.map(x => x.kind), ['precool', 'core', 'snapback']);
  assert.deepEqual(p[0].knots.map(k => k[0]), [at(18, 30), at(18, 45), at(19, 15), t]);
  assert.deepEqual(p[1].knots, [[t, 0], [at(19, 45), -13.5], [at(20, 45), -13.5], [at(21), 0]]);
  assert.deepEqual(p[2].knots.map(k => k[0]), [at(21), at(21, 15), at(22, 30)], 'the snapback peaks after one ramp, then falls linearly');
  assert.ok(Math.abs(area(p[0].knots) - V.PRECOOL_FRAC * Er) < 1e-9);
  assert.ok(Math.abs(area(p[1].knots) + Er) < 1e-9);
  assert.ok(Math.abs(area(p[2].knots) - V.SNAPBACK_FRAC * Er) < 1e-9);
  for (const x of [...p, ...flexParts(soakB('SOL', at(11), 60), 60)]) {
    assert.ok(x.knots.every(k => k[0] % STEP === 0), x.kind + ': on the lattice');
    assert.equal(x.knots[0][1], 0); assert.equal(x.knots[x.knots.length - 1][1], 0);
  }
  assert.deepEqual(flexParts(b, 27).map(x => x.knots[1][1] / 2), p.map(x => x.knots[1][1]), 'effMW scales every part');
});

test('U-3 / I6: flexAt is the parts\' knots interpolated, summed in block order and filtered by suburb, kind and lever; each part integrates to its energy (per second and on 5-min columns)', () => {
  const blocks = [soakB('HAZ', at(10, 30), 140), soakB('TAL', at(11), 90), airB('TAL', at(17), 13.5), airB('HAR', at(19, 30), 40)];
  const interp = (kn, s) => {
    if (s <= kn[0][0] || s >= kn[kn.length - 1][0]) return 0;
    let i = 1; while (kn[i][0] < s) i++;
    return kn[i - 1][1] + (kn[i][1] - kn[i - 1][1]) * (s - kn[i - 1][0]) / (kn[i][0] - kn[i - 1][0]);
  };
  for (let s = 0; s <= V.DAY_S + 3600; s += 137) {
    let all = 0, tal = 0, core = 0, relief = 0;
    for (const b of blocks) for (const p of flexParts(b, b.effMW)) {
      const v = interp(p.knots, s);
      all += v;
      if (b.suburb === 'TAL') tal += v;
      if (p.kind === 'core') core += v;
      if (p.kind === 'core' && b.lever === 'aircon') relief += v;
    }
    assert.ok(Math.abs(flexAt(blocks, s) - all) < 1e-9, 's ' + s);
    assert.ok(Math.abs(flexAt(blocks, s, 'TAL') - tal) < 1e-9);
    assert.ok(Math.abs(flexAt(blocks, s, '', 'core') - core) < 1e-9);
    assert.ok(Math.abs(flexAt(blocks, s, '', 'core', 'aircon') - relief) < 1e-9);
  }
  assert.equal(flexAt([], at(12)), 0);
  assert.equal(flexAt(blocks, V.DAY_S + 1), 0, 'nothing past 04:00');
  // I6: each part's integral within 1% of its energy, on the sim's seconds and on the 5-min columns.
  for (const b of blocks) for (const p of flexParts(b, b.effMW)) {
    const E = area(p.knots), lo = p.knots[0][0], hi = p.knots[p.knots.length - 1][0];
    let perS = 0, cols = 0;
    for (let s = lo; s < hi; s++) perS += flexAt([b], s, '', p.kind);
    for (let s = lo; s < hi; s += STEP) cols += flexAt([b], s, '', p.kind) * STEP;
    assert.ok(Math.abs(perS - E) <= Math.abs(E) * 0.01 && Math.abs(cols - E) <= Math.abs(E) * 0.01, b.suburb + ' ' + p.kind);
  }
});

// A synthetic forecast: n columns from fromS, demandP50 = f(column time).
const fcOf = (fromS, n, f) => {
  const fc = {fromS, stepS: STEP, n, demandP50: []};
  for (let k = 0; k < n; k++) fc.demandP50.push(f(fromS + (k + 1) * STEP));
  return fc;
};
const LV = (id, lever, over = {}) => {
  const open = lever === 'soak' ? {mw: 140, cost: 0, fromS: V.SOAK_FROM_S, toS: V.SOAK_TO_S - V.SOAK_S, block: ''}
    : {mw: 15, cost: V.PATIENCE_AIRCON, fromS: V.AIRCON_FROM_S, toS: V.AIRCON_TO_S - V.AIRCON_S, block: ''};
  return {id, patience: 90, soak: Object.assign({}, open, lever === 'soak' ? over : {}), aircon: Object.assign({}, open, lever === 'aircon' ? over : {})};
};
const lvOf = (rows, blocks = []) => ({rev: 0, offered: ['soak', 'aircon'], suburbs: rows,
  blocks: blocks.map(b => Object.assign({}, b, {del: '', parts: flexParts(b, b.effMW)}))});

test('§31.3.10 aimFlex: the soak centres its 4-h core on the lowest column in 10:00-15:00, rounded to the lattice and clamped to [fromS, toS]', () => {
  const vee = t => 2000 + Math.abs(t - at(12, 7)) / 10; // lowest at 12:07 (between columns: 12:05 and 12:10 are equal-ish)
  const fc = fcOf(at(9), 120, vee); // 09:05 .. 19:00
  const lv = lvOf([LV('HAZ', 'soak')]);
  assert.equal(aimFlex(fc, lv, 'HAZ', 'soak'), at(10, 5), 'centred on 12:05: 10:05');
  // Lower columns outside the window are not searched.
  const fc2 = fcOf(at(9), 120, t => (t < at(10) || t > at(15) ? 0 : vee(t)));
  assert.equal(aimFlex(fc2, lv, 'HAZ', 'soak'), at(10, 5));
  // Centred later than the last start: clamped to toS (11:00); earlier than fromS: clamped to 10:00.
  assert.equal(aimFlex(fcOf(at(9), 120, t => Math.abs(t - at(14, 30))), lv, 'HAZ', 'soak'), V.SOAK_TO_S - V.SOAK_S);
  assert.equal(aimFlex(fcOf(at(9), 120, t => Math.abs(t - at(10))), lv, 'HAZ', 'soak'), V.SOAK_FROM_S);
  // A narrower open range (later in the morning) clamps the same way.
  assert.equal(aimFlex(fc, lvOf([LV('HAZ', 'soak', {fromS: at(10, 40)})]), 'HAZ', 'soak'), at(10, 40));
});

test('§31.3.10 aimFlex: air-con centres its 1.5-h relief on the highest column in 15:00-21:00; -1 when blocked, when no column is in the window, or when the extreme is the last column with the window running past it', () => {
  const hill = t => 7000 - Math.abs(t - at(19, 30)) / 10;
  const lv = lvOf([LV('TAL', 'aircon')]);
  assert.equal(aimFlex(fcOf(at(15), 72, hill), lv, 'TAL', 'aircon'), at(18, 45), 'relief 18:45-20:15 around the 19:30 peak');
  assert.equal(aimFlex(fcOf(at(15), 72, hill), lvOf([LV('TAL', 'aircon', {block: 'locked', fromS: -1, toS: -1})]), 'TAL', 'aircon'), -1);
  assert.equal(aimFlex(fcOf(at(15), 72, hill), lv, 'XYZ', 'aircon'), -1, 'no such suburb');
  assert.equal(aimFlex(fcOf(at(5), 54, hill), lv, 'TAL', 'aircon'), -1, '05:00-09:30: no column in the window');
  // The forecast ends at 18:00 while the window runs to 21:00 and demand is still rising: not yet in view.
  const rising = fcOf(at(13, 30), 54, t => 5000 + t / 100);
  assert.equal(rising.fromS + rising.n * STEP, at(18));
  assert.equal(aimFlex(rising, lv, 'TAL', 'aircon'), -1);
  // The window's own end inside the forecast: its last column may be the extreme.
  const late = fcOf(at(17), 54, t => 5000 + t / 100);
  assert.equal(aimFlex(late, lv, 'TAL', 'aircon'), V.AIRCON_TO_S - V.AIRCON_S, 'the peak at 21:00: centred 20:15, clamped to 19:30');
});

test('§31.3.10 aimFlex: the line is demandP50 less this suburb\'s own blocks of this lever: another suburb\'s booked flex counts, so a second suburb aims at the peak that is left', () => {
  const base = t => 7000 - Math.abs(t - at(19, 30)) / 100; // a broad evening peak
  const har = airB('HAR', at(18, 45), 40);
  // The forecast already carries HAR's cycle (Q-50): relief on the peak, snapback after it.
  const withHar = t => base(t) + flexAt([har], t);
  const fc = fcOf(at(15), 72, withHar);
  const rows = [LV('HAR', 'aircon'), LV('TAL', 'aircon')];
  const lv = lvOf(rows, [har]);
  const own = aimFlex(fcOf(at(15), 72, base), lvOf(rows), 'HAR', 'aircon');
  assert.equal(aimFlex(fc, lv, 'HAR', 'aircon'), own, 'HAR re-aims on the line without its own block');
  const second = aimFlex(fc, lv, 'TAL', 'aircon');
  assert.notEqual(second, own, 'TAL sees the peak HAR left');
  let k = -1, hi = -Infinity;
  for (let j = 0; j < fc.n; j++) { const t = fc.fromS + (j + 1) * STEP; if (t >= V.AIRCON_FROM_S && t <= V.AIRCON_TO_S && fc.demandP50[j] > hi) { hi = fc.demandP50[j]; k = j; } }
  const want = Math.round((fc.fromS + (k + 1) * STEP - V.AIRCON_S / 2) / STEP) * STEP;
  assert.equal(second, Math.min(V.AIRCON_TO_S - V.AIRCON_S, Math.max(V.AIRCON_FROM_S, want)));
  // Another lever's blocks of the same suburb are not subtracted.
  const soak = soakB('HAR', at(10), 20);
  assert.equal(aimFlex(fc, lvOf(rows, [har, soak]), 'HAR', 'aircon'), own);
});

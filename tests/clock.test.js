// sim/clock.js and sim/dark.js (desk/README.md §32.4.1, §32.4.2; Q-62): the one clock, exact and
// pure, and the dark share moved out of autopilot.js. Pure arithmetic: no state is stepped.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../sim/clock.js';
import {darkShareAt, litMW} from '../sim/dark.js';
import {V} from '../sim/params.js';
import {createState, observe} from '../sim/step.js';
import {setDistrictDark} from '../sim/fleet.js';
import {DESK} from '../content/scenarios.js';

const START = V.PLAYER_START_S, DAY = V.DAY_S;
const rng = (x => () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32)(12345);

// autopilot.js's profileReal as it was before the move (desk/README §32.4.1: bit-identical).
const secOfH = h => (h - V.DAY_START_H) * V.S_PER_H;
const PROF = V.REF_PROFILE.map(p => ({a: secOfH(p.fromH), b: secOfH(p.toH), rate: p.rate}));
function profileReal(a, b) {
  if (!(b > a)) return 0;
  let r = 0;
  const F = PROF[0], L = PROF[PROF.length - 1];
  if (a < F.a) r += (Math.min(b, F.a) - a) / F.rate;
  for (const p of PROF) { const lo = Math.max(a, p.a), hi = Math.min(b, p.b); if (hi > lo) r += (hi - lo) / p.rate; }
  if (b > L.b) r += (b - Math.max(a, L.b)) / L.rate;
  return r;
}

test('the profile as data: segments, acts, the peak, the night', () => {
  assert.deepEqual(C.SEGMENTS.map(x => x.name), V.CLOCK_SEGMENT_NAMES);
  assert.deepEqual(C.SEGMENTS.map(x => [x.a, x.b, x.rate]), PROF.map(p => [p.a, p.b, p.rate]));
  assert.ok(Object.isFrozen(C.SEGMENTS) && Object.isFrozen(C.SEGMENTS[0]));
  assert.equal(C.NIGHT_S, 61200);
  assert.deepEqual(C.ACT_S, [1800, 18000, 37800, 61200, 86400]);
  assert.deepEqual(C.PEAK, [45000, 57600]);
  assert.deepEqual([0, 1799, 1800, 17999, 18000, 37799, 37800, 61199, 61200, 86400, 90000].map(C.actAt), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  assert.deepEqual([0, 1800, 7199, 7200, 45000, 61199, 61200, 99999].map(C.segmentAt), [0, 0, 0, 1, 5, 6, 7, 7]);
  assert.deepEqual([C.targetRate(0, false), C.targetRate(45000, true), C.targetRate(61199, true), C.targetRate(61200, true)], [540, 75, 150, 2100]);
  assert.deepEqual([0, 61200, 86399, 86400, -60, 1800.4].map(C.hhmm), ['04:00', '21:00', '03:59', '04:00', '03:59', '04:30']);
});

test('stepReal is autopilot\'s profileReal, bit for bit: 245 s from 04:30 and 1,000 random spans', () => {
  assert.equal(C.stepReal(START, DAY), 245);
  for (let k = 0; k < 1000; k++) {
    const a = Math.floor(rng() * (DAY + 7200)) - 3600, b = a + Math.floor(rng() * DAY);
    assert.equal(C.stepReal(a, b), profileReal(a, b), a + '..' + b);
  }
  assert.equal(C.stepReal(5, 5), 0);
});

test('Q-62: the eased day is 245.000 s (AGC) and 478 s (HAND); each ease lasts 2.000 real s; the night <= 12.5 s', () => {
  assert.ok(Math.abs(C.realBetween(START, DAY, false) - 245) < 1e-9, C.realBetween(START, DAY, false));
  assert.ok(Math.abs(C.realBetween(START, DAY, true) - 478) < 1e-6, C.realBetween(START, DAY, true));
  for (const hand of [false, true]) {
    for (let j = 1; j < C.SEGMENTS.length; j++) {
      const at = C.SEGMENTS[j].a, r1 = C.targetRate(at - 1, hand), r2 = C.targetRate(at, hand);
      const w = V.CLOCK_EASE_REAL_S * r1 * r2 / (r1 + r2);
      assert.ok(Math.abs(C.realBetween(at - w, at + w, hand) - 2) < 1e-9, 'boundary ' + j + (hand ? ' HAND' : ''));
      assert.equal(C.rateAt(at - w - 1, hand), r1);
      assert.equal(C.rateAt(at + w, hand), r2);
      const mid = C.rateAt(at, hand);
      assert.ok(mid > Math.min(r1, r2) && mid < Math.max(r1, r2), 'eased at the boundary: ' + mid);
    }
    assert.ok(C.realBetween(C.NIGHT_S, DAY, hand) <= 12.5, 'the night ' + C.realBetween(C.NIGHT_S, DAY, hand));
  }
  assert.equal(C.rateAt(0, false), 540, 'before 04:30, the first segment\'s');
  assert.equal(C.rateAt(DAY + 999, true), 2100, 'after 04:00, the last\'s');
});

test('Q-62: a span cut inside a window is within 0.375 s of the step profile; rateAt is continuous', () => {
  let worst = 0;
  for (let s = START; s <= DAY; s += 7) worst = Math.max(worst, Math.abs(C.realBetween(START, s, false) - C.stepReal(START, s)));
  assert.ok(worst <= 0.375 + 1e-9 && worst > 0.3, 'worst ' + worst);
  for (const hand of [false, true]) { // the steepest ease (21:00 in HAND) moves 2% in a grid second; the smallest step 20%
    let prev = C.rateAt(0, hand);
    for (let s = 1; s <= DAY; s++) {
      const r = C.rateAt(s, hand);
      assert.ok(Math.abs(r - prev) / prev < 0.03, s + ': ' + prev + ' -> ' + r);
      prev = r;
    }
  }
});

test('the inverses: gridAfter undoes realBetween, stepAfter and gridBefore undo stepReal (1e-6)', () => {
  for (let k = 0; k < 500; k++) {
    const s = Math.floor(rng() * DAY), t = s + rng() * (DAY - s), hand = k % 2 === 1, r = rng() * 120;
    assert.ok(Math.abs(C.gridAfter(s, C.realBetween(s, t, hand), hand) - t) < 1e-6, s + '..' + t);
    const g = C.stepAfter(s, r);
    assert.ok(g >= s && C.stepReal(s, g) >= r - 1e-6 && Math.abs(C.stepReal(s, g) - r) < 1e-6, 'stepAfter ' + s + ' ' + r);
    const b = C.gridBefore(t, r);
    assert.ok(b <= t && Math.abs(C.stepReal(b, t) - r) < 1e-6, 'gridBefore ' + t + ' ' + r);
  }
  assert.ok(Math.abs(C.gridAfter(START, 245, false) - DAY) < 1e-6);
});

test('dark.js: darkShareAt and litMW are autopilot\'s darkShare and litMW (a dark district, then the forecast as lit demand)', () => {
  const s = createState(8, DESK);
  s.tick = 7 * 3600 * V.TICKS_PER_S;
  const d = s.city.districts.findIndex(x => x.id === 'SAL4');
  setDistrictDark(s, d, true, 'directed');
  const o = observe(s), D = darkShareAt(o, o.s);
  const sal = o.rooftop.suburbs.find(x => x.id === 'SAL');
  assert.equal(D.shed, o.districts[d].share);
  assert.equal(D.roof, sal.capMW / 6 / o.rooftop.capMW);
  assert.equal(litMW(4000, 1000, D), (4000 + 1000) * (1 - D.shed) - 1000 * (1 - D.roof));
  assert.deepEqual(darkShareAt(observe(createState(8, DESK)), 0), {shed: 0, roof: 0});
});

// tests/watch.test.js: the K-15 watch's beats in physical order (X-39), on the review's real evening trips.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../app/watch.js';
import {traceOf} from '../app/record.js';
import {openGame} from './lib/play.js';


// The real page, played as tools/play.mjs plays it (Enter at each card), to the first trip from `hhmm`, and its trace.
function tripFrom(seed, hhmm) {
  const p = openGame({seed}), c = p.tripFrom(hhmm);
  return {c, tr: traceOf(p.game.rec, c.n)};
}

// The battery's and the governors' (with the inverters' give-back) catch at the extreme, as magnitudes.
function atExtreme(tr, c) {
  const i = Math.min(c.extremeTick - c.startTick, tr.len - 2), k = tr.caught, sg = c.lostMW >= 0 ? 1 : -1;
  return {batt: sg * (k.batteryMW[i] + k.guardMW[i]), gov: sg * k.governorsMW[i] + Math.max(0, sg * (k.inverterMW ? k.inverterMW[i] : 0))};
}

function assertOrder(tr, c) {
  const tl = W.beatTimeline(tr, undefined, c), names = tl.map(b => b.beat), why = tl.map(b => b.beat + '@' + b.k).join(' ');
  const idx = names.map(b => W.BEATS.indexOf(b));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), why);
  const {batt, gov} = atExtreme(tr, c);
  if (batt > gov && batt >= W.BEAT_SHARE * Math.abs(tr.caught.inertiaMW[0])) {
    assert.ok(names.includes('battery'), 'the battery caught ' + Math.round(batt) + ' MW to the governors\' ' + Math.round(gov) + ': ' + why);
    const g = names.indexOf('governors');
    assert.ok(g < 0 || g > names.indexOf('battery'), why);
  }
  return names;
}

test('X-39: 2026-10-16 18:49, the battery lights before the governors (no inverter MW lights GOVERNORS at T+0.02 s)', () => {
  const {c, tr} = tripFrom(20261016, '18:40');
  const names = assertOrder(tr, c);
  assert.equal(names[1], 'battery', names.join(' '));
});

test('X-39: 2026-10-17 17:49, the battery\'s 386 MW gets its beat', () => {
  const {c, tr} = tripFrom(20261017, '17:40');
  assert.ok(atExtreme(tr, c).batt > 300);
  const names = assertOrder(tr, c);
  assert.equal(names[1], 'battery', names.join(' '));
});

test('X-39, synthetic: a few MW of inverter release in the first tick light nothing; governors overtaking the battery light after it', () => {
  const n = 1500, z = () => new Float64Array(n);
  const tr = {len: n + 1, caught: {inertiaMW: z().fill(600), batteryMW: z(), guardMW: z(), governorsMW: z(), loadReliefMW: z(), uflsMW: z(), inverterMW: z().fill(8)}};
  for (let i = 10; i < n; i++) tr.caught.batteryMW[i] = Math.min(300, 10 * i);
  for (let i = 0; i < n; i++) tr.caught.governorsMW[i] = i;
  const tl = W.beatTimeline(tr);
  assert.deepEqual(tl.map(b => b.beat), ['inertia', 'battery', 'governors', 'settle']);
  assert.ok(tl[1].k >= 10 && tl[2].k > 250, tl.map(b => b.beat + '@' + b.k).join(' '));
});


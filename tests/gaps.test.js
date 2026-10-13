// D-10 (Q-76) and the Q-77 SYNC measure, pure (tools/day-measure.mjs; desk/README.md §32.7.1): no
// day is played here. Moments are grid seconds; real seconds are the step profile's (clock.stepReal).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gaps, parMoments, directorMoments, syncMatters, D10} from '../tools/day-measure.mjs';
import {stepReal, stepAfter, ACT_S} from '../sim/clock.js';
import {V} from '../sim/params.js';

const S_AT = (h, m = 0) => (h - V.DAY_START_H) * 3600 + m * 60;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg + ': ' + a + ' vs ' + b);

test('Q-76: gaps() merges moments within 3 real s of an opportunity\'s first moment, on the step profile, and measures every gap 05:30-21:00 with both ends', () => {
  assert.deepEqual([D10.fromS, D10.toS, D10.mergeRealS, D10.maxGapRealS], [S_AT(5, 30), ACT_S[3], 3, 40]);
  const none = gaps([]);
  assert.deepEqual(none.opps, []);
  assert.equal(none.gaps.length, 1);
  near(none.worst.realS, stepReal(S_AT(5, 30), S_AT(21)), 'no moment: one gap, the whole window');
  // 12:00 and the moments just under and at 3 real s after it (12:00 runs at 270x: 3 real s = 810 grid s)
  const t0 = S_AT(12), t3 = stepAfter(t0, 3);
  const g = gaps([t0 + 1, t3 - 1, t0, t3, S_AT(4, 45), S_AT(21), S_AT(23)]);
  assert.deepEqual(g.opps, [t0, t3], 'before 05:30, at or after 21:00: not counted; within 3 real s: one opportunity');
  assert.equal(g.gaps.length, 3);
  near(g.gaps[0].realS, stepReal(S_AT(5, 30), t0), 'from 05:30');
  near(g.gaps[1].realS, 3, 'between the two');
  near(g.gaps[2].realS, stepReal(t3, S_AT(21)), 'to 21:00');
  assert.equal(g.worst, g.gaps[2], 'the longest in real seconds (12:00-21:00 holds the evening\'s slow segments)');
  // anchored at the opportunity's first moment, not chained: three moments 2 real s apart are two opportunities
  const a = S_AT(12), b = stepAfter(a, 2), c = stepAfter(b, 2);
  assert.deepEqual(gaps([a, b, c]).opps, [a, c]);
  // across a profile boundary (09:00) the real seconds are the step profile's
  const x = S_AT(8, 30), y = S_AT(9, 30);
  near(gaps([x, y]).gaps[1].realS, stepReal(x, y), 'stepReal across a segment edge');
});

test('Q-76: per-act counts by clock.ACT_S (Act I from 05:30), and the D-10 verdict reads the worst gap', () => {
  const g = gaps([S_AT(6), S_AT(8, 30), S_AT(9, 30), S_AT(14), S_AT(15), S_AT(20, 30)]);
  assert.deepEqual(g.perAct, [2, 2, 2]);
  assert.deepEqual(gaps([S_AT(8, 59), S_AT(9)]).perAct, [1, 0, 0], 'a minute apart at 09:00 is one opportunity (0.2 real s), in the act of its first moment');
  // a day with a moment every 30 real s passes D-10's 40 s; the same day missing one does not
  const ms = [];
  for (let s = S_AT(5, 30); s < S_AT(21); s = stepAfter(s, 30)) ms.push(s);
  assert.ok(ms.length > 5 && gaps(ms).worst.realS <= D10.maxGapRealS);
  assert.ok(gaps(ms.filter((_, i) => i !== 3)).worst.realS > D10.maxGapRealS);
});

test('Q-76: par\'s decisions are its discrete inputs of the listed types, a battery MODE change and rule 1\'s tie; GUARD steps, re-sizes and re-dispatches are not', () => {
  const at = s => s * V.TICKS_PER_S + 1, log = [], origins = [];
  const add = (s, type, args, o) => { log.push({tick: at(s), type, args}); origins.push(o); };
  add(100, 'planLoad', {}, 'plan');
  add(200, 'start', {unit: 'gta1'}, 'rule3');
  add(300, 'planLoad', {}, 'replan');
  add(400, 'guard', {mw: 100}, 'rule2');
  add(500, 'battery', {mode: 'charge', mw: 200}, 'rule6');
  add(600, 'battery', {mode: 'charge', mw: 250}, 'rule6');      // a re-size
  add(700, 'battery', {mode: 'idle', mw: 0}, 'rule6');
  add(800, 'tie', {mw: 600}, 'rule1');
  add(900, 'tie', {mw: 600}, 'rule2');
  add(1000, 'planLoad', {}, 'rule7');
  add(1100, 'restore', {district: 'SAL1'}, 'rule9');
  add(1200, 'battery', {mode: 'discharge', mw: 100}, 'external');  // the player's: not par's, but it moves the mode
  add(1300, 'battery', {mode: 'discharge', mw: 80}, 'rule6');
  for (const [t, o] of [['stop', 'rule4'], ['flex', 'rule6'], ['callDR', 'rule8'], ['armRERT', 'rule8'], ['standDownRERT', 'rule4']]) add(1400, t, {}, o);
  assert.deepEqual(parMoments(log, origins), [200, 500, 700, 800, 1100, 1400, 1400, 1400, 1400, 1400]);
  assert.deepEqual(parMoments(log.slice(4, 5), origins.slice(4, 5), 'charge'), [], 'from the opening battery mode');
});

test('Q-76: the director\'s moments: each trip and its card, news issued in play (not the briefing\'s), MSL changes, the feeder clearances, a return and the tie limit\'s end', () => {
  const T = V.TICKS_PER_S;
  const st0 = {city: {districts: [{clearS: -1}, {clearS: 9000}, {clearS: 9900}]}, units: [{outUntilS: -1}, {outUntilS: 12600}], tie: {limitUntilS: 21600}};
  const end = {conts: [{startTick: 30000 * T + 7, watchEndTick: 30040 * T}], news: [{atS: 0}, {atS: 0}, {atS: 41000}]};
  assert.deepEqual(directorMoments(st0, end, [36000, 39000]).sort((a, b) => a - b), [9000, 9900, 12600, 21600, 30000, 30040, 36000, 39000, 41000]);
  assert.deepEqual(directorMoments({city: {districts: []}, units: [], tie: {limitUntilS: -1}}, {conts: [], news: []}, []), [], 'classic\'s neutral opening');
});

test('Q-77: a SYNC matters when a red or amber column in [close, close + AUTO_SYNC_S] is covered by what the clean close gains over the auto-synchroniser\'s', () => {
  const m = V.MACHINES.find(x => x.id === 'gtc1'), block = Math.min(m.syncBlockMW, m.minMW);
  const close = 50000, auto = close + V.AUTO_SYNC_S - 10;
  const proj = (gap, need) => ({times: [close - 300, close + 120, close + 600], gap: ['', gap, ''], supply: [0, 1000, 0], p50: [0, 1000 + need, 0], p90: [0, 1000 + need, 0]});
  const gain = Math.min(m.minMW, block + (m.minMW - block) * 120 / m.t2S); // the auto close has delivered nothing by close + 120
  assert.deepEqual(syncMatters(proj('red', gain - 1), m, close, auto), {matters: true, weaker: true});
  assert.deepEqual(syncMatters(proj('amber', gain - 1), m, close, auto), {matters: true, weaker: true});
  assert.deepEqual(syncMatters(proj('red', gain + 1), m, close, auto), {matters: false, weaker: true}, 'the gap is larger than the gain: the weaker count only');
  assert.deepEqual(syncMatters(proj('', 0), m, close, auto), {matters: false, weaker: false});
  // a column after the window does not count; neither does one the auto close would have reached too
  const late = {times: [close + V.AUTO_SYNC_S + 300], gap: ['red'], supply: [0], p50: [1], p90: [1]};
  assert.deepEqual(syncMatters(late, m, close, auto), {matters: false, weaker: false});
  assert.equal(syncMatters(proj('red', 1), m, close, close).matters, false, 'no gain over a close at the same second');
});

// D-9 / Q-75 (desk/README.md §32.4.8, §32.5.3): the dailies. content/dailies.js ships exceptions
// only, {v, from, to, attempts}: attempt k of a date is its YYYYMMDD seed + k·10⁸, the scenario
// comes from the date, and a day is gate-checked only under the build stamp the list was made with.
// Pure: no day is played here (tools/daily-gen.js runs the gate).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAILIES, seedOf, ymdOf, scenarioIdOf, dailyFor} from '../content/dailies.js';
import {DESK, DESK_WEEKEND} from '../content/scenarios.js';
import * as G from '../app/game.js';

const empty = !DAILIES.from;
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
// dailyFor reads the shipped list: these rows put a list in its place for one call and put the shipped one back.
const withList = (list, f) => { const keep = {...DAILIES}; Object.assign(DAILIES, list); try { return f(); } finally { Object.assign(DAILIES, keep); } };
const EMPTY = {v: '', from: '', to: '', attempts: {}};

test('Q-75: attempt k of a date is YYYYMMDD + k·10⁸ (k <= 42); the date, and so the scenario, survive every attempt', () => {
  assert.equal(G.scenarioForSeed(seedOf(20261003, 1)), DESK_WEEKEND, 'a Saturday, attempt 1');
  assert.equal(G.scenarioForSeed(seedOf(20261003, 42)), DESK_WEEKEND, 'a Saturday, attempt 42');
  assert.equal(G.scenarioForSeed(seedOf(20261005, 42)), DESK, 'a Monday, attempt 42');
  for (const d of [20261003, 20261012, 20261231, 20270228]) {
    for (let k = 0; k <= 42; k++) {
      assert.equal(ymdOf(seedOf(d, k)), d, d + ' attempt ' + k);
      assert.equal(seedOf(d, k) >>> 0, seedOf(d, k), 'a 32-bit seed');
    }
  }
  assert.equal(seedOf(20261003), 20261003, 'attempt 0 is the date itself: today\'s links and every 2026100x test keep their day');
  // the one date-to-scenario mapping (C-2's rule, read through the date)
  for (const [d, id] of [[20261002, 'desk'], [20261003, 'desk-weekend'], [20261004, 'desk-weekend'], [7, 'desk'], [20261332, 'desk'], [20260229, 'desk'], [20280229, 'desk'], [20280226, 'desk-weekend']]) {
    assert.equal(scenarioIdOf(d), id, String(d));
  }
});

test('Q-75: dailyFor on the empty list plays attempt 0, not gated; a list plays its attempt, gated only under its own stamp and inside [from, to]', () => {
  assert.deepEqual(withList(EMPTY, () => dailyFor('2026-10-03', 'any')), {seed: 20261003, scenarioId: 'desk-weekend', gated: false, ymd: 20261003});
  assert.deepEqual(withList(EMPTY, () => dailyFor(new Date(2026, 9, 12, 23, 59), 'any')), {seed: 20261012, scenarioId: 'desk', gated: false, ymd: 20261012}, 'a local Date');
  const list = {v: 'stamp', from: '2026-10-12', to: '2027-10-11', attempts: {20261013: 3}};
  assert.deepEqual(withList(list, () => dailyFor('2026-10-13', 'stamp')), {seed: seedOf(20261013, 3), scenarioId: 'desk', gated: true, ymd: 20261013}, 'a listed attempt');
  assert.deepEqual(withList(list, () => dailyFor('2026-10-14', 'stamp')), {seed: 20261014, scenarioId: 'desk', gated: true, ymd: 20261014}, 'attempt 0 passed: not listed');
  assert.deepEqual(withList(list, () => dailyFor('2026-10-13', 'newer')), {seed: seedOf(20261013, 3), scenarioId: 'desk', gated: false, ymd: 20261013}, 'a stale stamp plays the listed attempt, not gated');
  assert.deepEqual(withList(list, () => dailyFor('2026-10-11', 'stamp')), {seed: 20261011, scenarioId: 'desk-weekend', gated: false, ymd: 20261011}, 'before from: attempt 0');
  assert.equal(withList(list, () => dailyFor('2027-10-12', 'stamp')).gated, false, 'after to');
  assert.equal(withList(list, () => dailyFor('2027-10-11', 'stamp')).gated, true, 'to is inside');
  if (empty) assert.deepEqual(dailyFor('2026-10-13', G.dailyStamp()), {seed: 20261013, scenarioId: 'desk', gated: false, ymd: 20261013}, 'the shipped list is empty');
});

test('Q-75: the page\'s day (G.dailyFrom): ?seed=N (gated only as its date\'s listed attempt), ?date=YYYY-MM-DD, else today\'s daily', () => {
  const today = new Date(2026, 9, 12);
  assert.deepEqual(G.dailyFrom('?seed=7', today), {seed: 7, scenarioId: 'desk', ymd: 7, gated: false}, 'a raw seed that is no date');
  const sat = G.dailyFrom('?seed=' + seedOf(20261003, 2), today);
  assert.deepEqual([sat.seed, sat.scenarioId, sat.ymd], [seedOf(20261003, 2), 'desk-weekend', 20261003]);
  assert.equal(sat.gated, false, 'not the listed attempt (the list is empty or says otherwise)');
  const d = dailyFor('2026-10-04', G.dailyStamp());
  assert.deepEqual(G.dailyFrom('?date=2026-10-04', today), d);
  assert.equal(G.dailyFrom('?seed=' + d.seed, today).gated, d.gated, 'the listed attempt by its seed is as gated as by its date');
  withList({v: G.dailyStamp(), from: '2026-10-12', to: '2027-10-11', attempts: {20261013: 3}}, () => { // a list gated under this build
    assert.deepEqual(G.dailyFrom('?date=2026-10-13', today), {seed: seedOf(20261013, 3), scenarioId: 'desk', gated: true, ymd: 20261013});
    assert.deepEqual(G.dailyFrom('?seed=' + seedOf(20261013, 3), today), {seed: seedOf(20261013, 3), scenarioId: 'desk', ymd: 20261013, gated: true}, 'the listed attempt by its seed');
    assert.equal(G.dailyFrom('?seed=20261013', today).gated, false, 'a rejected attempt 0 is never gated');
    assert.equal(G.dailyFrom('?seed=20261014', today).gated, true, 'attempt 0 of a date with no exception');
    assert.equal(G.dailyFrom('', today).seed, 20261012, 'today: no exception');
    // inside [from, to] as a number but no calendar date: nobody gated it
    for (const q of ['?seed=20261099', '?seed=20261300', '?date=2026-11-31', '?date=2027-02-30', '?date=2026-13-01']) assert.equal(G.dailyFrom(q, today).gated, false, q);
    assert.deepEqual(dailyFor('2026-11-31', G.dailyStamp()), {seed: 20261131, scenarioId: 'desk', gated: false, ymd: 20261131});
  });
  assert.deepEqual(G.dailyFrom('', today), dailyFor(today, G.dailyStamp()), 'no query: today\'s');
  assert.deepEqual(G.dailyFrom('?date=tomorrow', today), dailyFor(today, G.dailyStamp()), 'a bad date: today\'s');
  assert.deepEqual(G.dailyFrom('?seed=', today), dailyFor(today, G.dailyStamp()), 'an empty seed: today\'s');
  assert.match(G.dailyStamp(), /^v4-core-[^|]+\|\d+\|\d+$/, 'SIM_VERSION and the two desk scenarios\' hashes');
  // the game carries its daily; a game made from a bare seed (tests, the bench) has none
  const g = G.createGame({daily: G.dailyFrom('?seed=20261003', today), scenario: G.scenarioForSeed, storage: null});
  assert.deepEqual([g.seed, g.scenario, g.daily.ymd], [20261003, DESK_WEEKEND, 20261003]);
  assert.equal(G.createGame({seed: 5, storage: null}).daily, null);
});

test('Q-75: the shipped list is {v, from, to, attempts}, stamped with this build and a year long (skipped while empty: stage C generates it)', {skip: empty && 'the list is empty until stage C'}, () => {
  assert.deepEqual(Object.keys(DAILIES), ['v', 'from', 'to', 'attempts']);
  assert.equal(DAILIES.v, G.dailyStamp(), 'a sim or desk-scenario change re-checks the dates: run tools/daily-gen.js');
  assert.ok(days(DAILIES.from, DAILIES.to) >= 365, DAILIES.from + ' to ' + DAILIES.to);
  for (const [d, k] of Object.entries(DAILIES.attempts)) {
    assert.ok(Number.isInteger(k) && k >= 1 && k <= 42, d + ': attempt ' + k);
    assert.ok(dailyFor(Number(d), DAILIES.v).gated, d + ' inside [from, to]');
  }
});

test('Q-75: the shipped list\'s shape (always)', () => {
  assert.deepEqual(Object.keys(DAILIES), ['v', 'from', 'to', 'attempts']);
  assert.ok(typeof DAILIES.v === 'string' && typeof DAILIES.from === 'string' && typeof DAILIES.to === 'string');
  assert.equal(DAILIES.v === '', empty, 'a stamp exactly when the list has a range');
});

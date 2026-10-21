// D-9 / Q-75 (desk/README.md §32.4.8, §32.5.3): the dailies. content/dailies.js ships exceptions
// only, {v, from, to, attempts}: attempt k of a date is its YYYYMMDD seed + k·10⁸, the scenario
// comes from the date, and a day is gate-checked only under the build stamp the list was made with.
// Pure: no day is played here (tools/daily-gen.js runs the gate).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAILIES, seedOf, ymdOf, scenarioIdOf, dailyFor, SEASONS_FROM} from '../content/dailies.js';
import {DESK, DESK_WEEKEND, SEASON_SCENARIOS, SCENARIOS} from '../content/scenarios.js';
import * as G from '../app/game.js';
import * as St from '../sim/step.js';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createState} from '../sim/step.js';
import {isClean} from '../sim/market.js';
import {V} from '../sim/params.js';
import {restampAdvice} from '../tools/verify.mjs';

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
  assert.match(G.dailyStamp(), /^v4-core-[^|]+\|\d+\|\d+\|\d+$/, 'SIM_VERSION, the two desk scenarios\' hashes and the season months\' (Q-127)');
  // the game carries its daily; a game made from a bare seed (tests, the bench) has none
  const g = G.createGame({daily: G.dailyFrom('?seed=20261003', today), scenario: G.scenarioForSeed, storage: null});
  assert.deepEqual([g.seed, g.scenario, g.daily.ymd], [20261003, DESK_WEEKEND, 20261003]);
  assert.equal(G.createGame({seed: 5, storage: null}).daily, null);
});

test('Q-75: the shipped list is {v, from, to, attempts}, stamped with this build and a year long (skipped while empty: stage C generates it)', {skip: empty && 'the list is empty until stage C'}, () => {
  assert.deepEqual(Object.keys(DAILIES), ['v', 'from', 'to', 'attempts']);
  assert.equal(DAILIES.v, G.dailyStamp(), 'a sim or desk-scenario change re-checks the dates: ' + restampAdvice(DAILIES.from, DAILIES.to));
  assert.ok(days(DAILIES.from, DAILIES.to) >= 365, DAILIES.from + ' to ' + DAILIES.to);
  for (const [d, k] of Object.entries(DAILIES.attempts)) {
    assert.ok(Number.isInteger(k) && k >= 1 && k <= 42, d + ': attempt ' + k);
    assert.ok(dailyFor(Number(d), DAILIES.v).gated, d + ' inside [from, to]');
  }
});

// Q-75's stamp hashes what the sim hashes (createState's scnHash: the data without its src/note prose).
test('Q-75: the stamp is SIM_VERSION and the scenario hashes the sim records (Q-127: and the season months\' in one)', () => {
  assert.equal(G.dailyStamp(), [St.SIM_VERSION, St.createState(1, DESK).scnHash, St.createState(1, DESK_WEEKEND).scnHash,
    St.scenarioHash(Object.values(SEASON_SCENARIOS))].join('|'));
});

// Q-127 (light seasons): a date plays its month from SEASONS_FROM; before it, and in February, the late-summer desk.
test('Q-127: a date from SEASONS_FROM plays its month\'s scenario, weekday or weekend; February and every earlier date the desk\'s own', () => {
  assert.equal(SEASONS_FROM, 20270401);
  for (const [d, id] of [[20270331, 'desk'], [20270401, 'desk-apr'], [20270403, 'desk-weekend-apr'], [20270615, 'desk-jun'],
    [20271225, 'desk-weekend-dec'], [20280215, 'desk'], [20280108, 'desk-weekend-jan'], [20261225, 'desk'], [20270116, 'desk-weekend']]) {
    assert.equal(scenarioIdOf(d), id, String(d));
    assert.ok(SCENARIOS[id], id + ' is listed');
  }
  assert.equal(G.scenarioForSeed(seedOf(20270525, 3)).id, 'desk-may-callide', 'an anniversary in a season month: its month\'s variant');
  for (const s of Object.values(SEASON_SCENARIOS)) {
    assert.ok(s.season && ['hot', 'warm', 'cold'].includes(s.season.word), s.id);
    assert.equal(s.levers.menu.HOT.includes('aircon'), s.season.word !== 'cold', s.id + ': no air-con lever on a cold day');
    if (s.season.word !== 'hot') assert.equal(s.weather.heatShare, 0, s.id + ': no heatwave out of season');
    assert.ok(s.sun.riseH < 12 && s.sun.setH > 16 && s.demand.mildBaseMW.length === 49, s.id);
  }
});

// tools/daily-gen.js (wave 2, par): its pure parts. No day is played here.
const DG = createRequire(import.meta.url)('../tools/daily-gen.js');

test('Q-75 / D-9: the gate is the bound AND isClean: a task feeder\'s lag never rejects a date; UFLS, directed shedding, black or a short minute do', () => {
  const sc = o => Object.assign({uflsMWh: 0, directedMWh: 0, taskMWh: 12, taskLateMWh: 3, heldMWh: 700}, o);
  assert.equal(DG.gate({shortMin: 0, score: sc(), black: false}, isClean), true, 'par\'s own restore lag (task and late MWh) passes');
  assert.equal(DG.gate({shortMin: 0, score: sc({uflsMWh: 0.01}), black: false}, isClean), false);
  assert.equal(DG.gate({shortMin: 0, score: sc({directedMWh: 5}), black: false}, isClean), false);
  assert.equal(DG.gate({shortMin: 0, score: sc(), black: true}, isClean), false);
  assert.equal(DG.gate({shortMin: 1, score: sc(), black: false}, isClean), false, 'one minute below the bound');
  assert.equal(DG.CAP, 40);
});

test('D-9 (1): the optimistic bound counts every machine not tripped and not on outage, the tie at its limit, the battery, diesel, DR, wind and solar, and air-con at rated MW in its window on a day that offers it; against demand before booked flex', () => {
  const s = createState(20261008, DESK); // MILD: no air-con; CCGT 2 on outage until 06:45
  const fixed = V.BATT_MW + V.RERT_MW + V.DR_MW + s.env.windAvailMW + s.env.solarAvailMW;
  const units = x => x.units.reduce((a, u) => a + (u.mode === 'tripped' || u.outUntilS > x.tick / V.TICKS_PER_S ? 0 : u.availMW), 0);
  assert.ok(s.units.some(u => u.outUntilS > 0), 'the fixture has a late return');
  assert.deepEqual(DG.bound(s, V), {boundMW: fixed + s.tie.limitMW + units(s), demandMW: s.env.demandMW - s.env.flexMW});
  const t = JSON.parse(JSON.stringify(s));
  Object.assign(t.tie, {tripped: true}); t.units[0].mode = 'tripped'; t.env.flexMW = 140;
  assert.deepEqual(DG.bound(t, V), {boundMW: fixed + units(t), demandMW: t.env.demandMW - 140});
  // a HOT day offers air-con: its rated MW inside the window only
  const hot = createState(20261013, DESK), rated = DESK.levers.suburbs.reduce((a, x) => a + x.airconMW, 0);
  assert.equal(hot.day.temp, 'HOT');
  const at = (x, s0) => Object.assign(JSON.parse(JSON.stringify(x)), {tick: s0 * V.TICKS_PER_S});
  assert.equal(DG.bound(at(hot, V.AIRCON_FROM_S), V).boundMW - DG.bound(at(hot, V.AIRCON_FROM_S - 1), V).boundMW, rated);
  assert.equal(DG.bound(at(hot, V.AIRCON_TO_S), V).boundMW, DG.bound(at(hot, V.AIRCON_FROM_S - 1), V).boundMW);
});

test('Q-75: daily-gen writes exceptions only, stamped with this build: the written module reads back as the list, gated under G.dailyStamp()', async () => {
  const rows = [{ymd: 20261012, k: 0}, {ymd: 20261014, k: 3}, {ymd: 20261013, k: 1}];
  const L = DG.listOf(rows, '2026-10-12', '2027-10-11', G.dailyStamp());
  assert.deepEqual(L, {v: G.dailyStamp(), from: '2026-10-12', to: '2027-10-11', attempts: {20261013: 1, 20261014: 3}});
  const src = readFileSync(new URL('../content/dailies.js', import.meta.url), 'utf8');
  for (const list of [L, EMPTY, Object.assign({}, L, {attempts: Object.fromEntries(Array.from({length: 20}, (_, i) => [20261020 + i, 1 + i % 5]))})]) {
    const text = DG.writeList(src, list);
    assert.equal(text.split('\n').slice(1).join('\n').replace(/^export const DAILIES[\s\S]*?\};\n/m, ''), src.split('\n').slice(1).join('\n').replace(/^export const DAILIES[\s\S]*?\};\n/m, ''), 'the rest of the file is kept');
    const mod = await import('data:text/javascript,' + encodeURIComponent(text));
    assert.deepEqual(mod.DAILIES, list);
    assert.deepEqual(Object.keys(mod.DAILIES), ['v', 'from', 'to', 'attempts']);
    if (list.from) assert.deepEqual(mod.dailyFor('2026-10-14', G.dailyStamp()), {seed: seedOf(20261014, list.attempts[20261014] || 0), scenarioId: 'desk', gated: true, ymd: 20261014});
  }
});

test('Q-75: the shipped list\'s shape (always)', () => {
  assert.deepEqual(Object.keys(DAILIES), ['v', 'from', 'to', 'attempts']);
  assert.ok(typeof DAILIES.v === 'string' && typeof DAILIES.from === 'string' && typeof DAILIES.to === 'string');
  assert.equal(DAILIES.v === '', empty, 'a stamp exactly when the list has a range');
});

// W6, F-8 (risk 5): the stored par. A listed daily is graded the moment the day ends against par's ALL-IN stored for its date
// (content/ladder.js: tools/ladder.mjs runs the same AP.runPar the page re-runs, under this build's stamp; tests/score.test.js
// shows the page's slices play the one run's day), so the grade is the same in every browser; the page's own par fills THE
// NUMBERS and the debrief, and a total of its that differs (another engine's arithmetic) is said there, never graded. Off the
// calendar, on a Hard day or with a stale list the page's par grades, as before. And past the calendar's end today's date is
// "No daily today", practice; the Action warns when fewer than 60 days of dailies are left.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../app/game.js';
import * as HI from '../app/history.js';
import {grade} from '../app/score.js';
import {V} from '../sim/params.js';
import {parDriftText} from '../app/endcard.js';
import {NO_DAILY} from '../app/shell.js';
import {LADDER} from '../content/ladder.js';
import {DAILIES} from '../content/dailies.js';
import {daysLeft, report, CALENDAR_WARN_DAYS} from '../tools/calendar-left.mjs';
import {openGame} from './lib/play.js';

// The page's par as a stub: its score (a total far from the stored one), or still computing
const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
const COMPUTING = {step: () => false, done: false, score: null, series: [], at: () => null, progress: 0.4, black: false};
const local = ymd => new Date(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100);
const ymdOf = s => +s.replace(/-/g, '');
// A localStorage stand-in, a shift already finished (D-7): this run is not a first shift
function store() {
  const mem = new Map([[G.SEEN_KEY, JSON.stringify({shifts: 1})]]);
  return {mem, getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
}
const endDay = p => { p.game.state.over = true; p.frames(2); return p.game.end; };

test('F-8: a listed daily\'s stored par is its row\'s total and shed; none off the calendar, on a Hard day or with a stale list', () => {
  const p = openGame({seed: 20261016, run: false, take: false});
  assert.deepEqual(G.storedPar(p.game), {total: LADDER.rows[20261016][0], shedMWh: LADDER.rows[20261016][1]});
  assert.equal(G.storedPar(p.game, Object.assign({}, LADDER, {v: 'another build'})), null, 'a stale list');
  assert.equal(G.storedPar(openGame({seed: 7, run: false, take: false}).game), null, 'a seed off the calendar');
  // 20261023's listed daily is attempt 2: attempt 0 is a Hard day (S-7), not that date's daily
  assert.equal(DAILIES.attempts[20261023], 2);
  assert.equal(G.storedPar(openGame({seed: 20261023, run: false, take: false}).game), null, 'a Hard day');
  assert.equal(G.storedPar(openGame({seed: 20261023 + 2e8, run: false, take: false}).game).total, LADDER.rows[20261023][0], 'its listed seed');
});

test('F-8: the grade is made at the day\'s end from the stored par, before the page\'s par is done, and history keeps it at once', () => {
  const s = store(), p = openGame({seed: 20261016, run: false, par: COMPUTING, storage: s, date: local(20261016)});
  G.runTo(p.game, (HI.OFFICIAL_S + 60) * V.TICKS_PER_S);   // (an official run counts from 09:00)
  const end = endDay(p), want = grade(end.allIn, {total: LADDER.rows[20261016][0]}, false, 0);
  assert.equal(p.game.par.done, false, 'the page\'s par is still computing');
  assert.ok(want && Number.isInteger(want.points));
  assert.deepEqual(end.grade, want);
  assert.match(p.$('end-score').textContent, new RegExp('^SCORE ' + want.points + ' · ' + want.letter));
  const e = JSON.parse(s.mem.get(HI.HISTORY_KEY)).days[20261016];
  assert.deepEqual([e.points, e.letter], [want.points, want.letter], 'the official run is recorded with its grade');
  assert.deepEqual(p.h.mods.errors, []);
});

test('F-8: when the page\'s own par arrives it fills THE NUMBERS; a total off the stored one is said there and never changes the grade', () => {
  const p = openGame({seed: 20261016, run: false, par: PAR, date: local(20261016)}), end = endDay(p);
  assert.ok(end.parAllIn, 'the page\'s par is in');
  assert.deepEqual(end.grade, grade(end.allIn, {total: LADDER.rows[20261016][0]}, false, 0), 'graded on the stored par');
  assert.equal(end.parDrift, Math.round(end.parAllIn.total) - LADDER.rows[20261016][0]);
  assert.ok(Math.abs(end.parDrift) >= 1);
  assert.equal(p.$('end-drift').textContent, parDriftText(end.parDrift));
  assert.match(parDriftText(-1234), /^This browser worked par out −\$1,234 from the stored par\. Your score uses the stored one/);
  // off the calendar the page's par grades, and nothing is said
  const q = openGame({seed: 7, run: false, par: PAR}), qe = endDay(q);
  assert.deepEqual([qe.stored, qe.parDrift, q.$('end-drift')], [null, 0, null]);
  assert.deepEqual(qe.grade, grade(qe.allIn, qe.parAllIn, false, 0));
});

test('F-8: past the calendar\'s end today\'s date has no daily: "No daily today", practice, nothing counts', () => {
  assert.deepEqual(HI.statusOf({days: {}}, {ymd: 20271012, today: 20271012, firstShift: false, ungated: true}), {status: 'practice', why: 'nodaily'});
  assert.deepEqual(HI.statusOf({days: {}}, {ymd: 20261016, today: 20261016, firstShift: false, ungated: false}), {status: 'official', why: 'today'});
  const after = ymdOf(DAILIES.to) + 1, s = store(), p = openGame({seed: after, run: false, par: PAR, storage: s, date: local(after)});
  assert.equal(p.game.daily.gated, false);
  assert.equal(p.$('briefing-title').textContent, NO_DAILY);
  assert.deepEqual([G.runView(p.game).status, G.runView(p.game).why], ['practice', 'nodaily']);
  endDay(p);
  assert.equal(p.$('end-run').textContent, 'PRACTICE: no daily today, so nothing counts.');
  assert.equal(s.mem.get(HI.HISTORY_KEY), undefined, 'nothing recorded');
  assert.deepEqual(p.h.mods.errors, []);
});

test('F-8: the Action reports the days of dailies left, and warns below 60', () => {
  assert.equal(CALENDAR_WARN_DAYS, 60);
  assert.equal(daysLeft('2027-10-01', '2027-10-11'), 10);
  assert.equal(daysLeft('2027-10-12', '2027-10-11'), -1);
  assert.doesNotMatch(report('2026-10-16', '2027-10-11'), /::warning/);
  assert.match(report('2027-09-01', '2027-10-11'), /^40 days of dailies left after 2027-09-01 .*\n::warning title=Dailies running out::40 days/);
  assert.ok(daysLeft('2026-10-16') >= CALENDAR_WARN_DAYS, 'the shipped calendar has room');
});

// W6: official runs, history and streaks (app/history.js; Y-2 as amended by Q-99, Y-3). Pure checks of the status rule,
// the stored shape and the streaks; then on the page (tests/lib/play.js with a storage stand-in and a fixed today): the
// first shift is practice until claimed, a later run of today becomes official at 09:00 (a DNF until the day ends), a
// second run of the date is PRACTICE, the end card shows the streaks, and with storage blocked the game plays and says
// "history off".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as HI from '../app/history.js';

const hist = days => HI.readHistory({v: 1, days});
const fin = (o = {}) => Object.assign({dnf: false, star: false, points: 980, letter: 'A'}, o);

test('Y-2 (Q-99): the first shift on today\'s daily is practice unless claimed; a later one is official; a past date, a seed or a second run is practice', () => {
  const h = hist({});
  assert.deepEqual(HI.statusOf(h, {ymd: 20261016, today: 20261016, firstShift: true}), {status: 'first', why: 'first'});
  assert.deepEqual(HI.statusOf(h, {ymd: 20261016, today: 20261016, firstShift: false}), {status: 'official', why: 'today'});
  assert.deepEqual(HI.statusOf(h, {ymd: 20261015, today: 20261016, firstShift: false}), {status: 'practice', why: 'past'});
  assert.deepEqual(HI.statusOf(h, {ymd: null, today: 20261016, firstShift: false}), {status: 'practice', why: 'seed'});
  HI.record(h, 20261016, {dnf: true});
  assert.deepEqual(HI.statusOf(h, {ymd: 20261016, today: 20261016, firstShift: false}), {status: 'practice', why: 'done'}, 'a DNF is the date\'s run');
  assert.equal(HI.OFFICIAL_S, 5 * 3600, '09:00 is five grid hours after 04:00');
});

test('Y-3: a stored history is cleaned, and keeps at most 400 dates, the newest', () => {
  assert.deepEqual(HI.readHistory(null), {v: 1, days: {}, pruned: 0});
  assert.deepEqual(HI.readHistory({v: 2, days: {20261016: {}}}), {v: 1, days: {}, pruned: 0}, 'another schema version is not read');
  assert.deepEqual(Object.keys(HI.readHistory({v: 1, days: {20261016: fin(), x: fin(), 20261017: 5}}).days), ['20261016']);
  const ymd = k => { const t = new Date(Date.UTC(2026, 9, 12 + k)); return t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(); };
  // every other day for 410 days: the ten oldest go, and still count as played
  const h = hist({});
  for (let k = 0; k < 410; k++) HI.record(h, ymd(2 * k), fin());
  const keys = Object.keys(h.days).sort();
  assert.equal(keys.length, HI.HISTORY_MAX);
  assert.equal(keys[0], String(ymd(20)), 'the ten oldest dates went');
  assert.equal(HI.streaks(h, ymd(818)).played, 410, 'the dates that went still count as played');
  assert.equal(HI.readHistory(JSON.parse(JSON.stringify(h))).pruned, 10, 'kept in storage');
  assert.ok(JSON.stringify(h).length < 200 * 1024 / 2, 'F-7: well under 200 KB after 400 dailies');
  // a 450-day streak is never cut short by the cap
  const s = hist({});
  for (let k = 0; k < 450; k++) HI.record(s, ymd(k), fin({star: true}));
  assert.deepEqual(HI.streaks(s, ymd(449)), {streak: 450, best: 450, played: 450});
});

test('Y-3: STREAK counts finished official dates in a row to today (or yesterday); BEST the ★ dates in a row; a DNF or a gap breaks both', () => {
  const h = hist({20261012: fin({star: true}), 20261013: fin({star: true}), 20261014: fin(), 20261015: fin({star: true})});
  assert.deepEqual(HI.streaks(h, 20261015), {streak: 4, best: 1, played: 4});
  assert.deepEqual(HI.streaks(h, 20261016), {streak: 4, best: 1, played: 4}, 'today not yet played: the streak stands');
  assert.deepEqual(HI.streaks(h, 20261017), {streak: 0, best: 0, played: 4}, 'a missed date breaks it');
  HI.record(h, 20261016, {dnf: true});
  assert.deepEqual(HI.streaks(h, 20261016), {streak: 0, best: 0, played: 4}, 'a DNF breaks it');
  HI.record(h, 20261016, fin({star: true}));
  assert.deepEqual(HI.streaks(h, 20261016), {streak: 5, best: 2, played: 5});
  // across the end of a month and a year
  const y = hist({20261230: fin(), 20261231: fin(), 20270101: fin()});
  assert.equal(HI.streaks(y, 20270101).streak, 3);
  assert.equal(HI.localYmd(new Date(2026, 9, 16, 23, 59)), 20261016, 'the local calendar date');
});

// ------------------------------------------------------------------ on the page

import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import {V} from '../sim/params.js';

const TODAY = new Date(2026, 9, 16), PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
// A localStorage stand-in (the same Map across games: a closed tab reopened), or one that refuses every write
function store(init = {}) {
  const mem = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {mem, getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
}
const blocked = () => ({getItem: () => null, setItem() { throw new Error('QuotaExceededError'); }, removeItem() {}});
const stored = s => JSON.parse(s.mem.get(HI.HISTORY_KEY) || 'null');
const endDay = p => { p.game.state.over = true; p.frames(2); };
const past9 = p => G.runTo(p.game, (HI.OFFICIAL_S + 60) * V.TICKS_PER_S);

test('Y-2 on the page: a first shift is practice until COUNT THIS ONE; then it is today\'s official run, and a replay is PRACTICE', () => {
  const s = store(), p = openGame({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY});
  assert.equal(p.$('briefing-title').textContent, 'Daily #5 · FIRST SHIFT');
  past9(p);
  assert.equal(stored(s), null, 'a first shift writes nothing at 09:00');
  endDay(p);
  assert.equal(p.$('end-run').textContent, 'FIRST SHIFT: practice, unless you count it. COUNT THIS ONE');
  assert.ok(p.game.end.share.tags.includes('PRACTICE'), 'not counted (yet): practice');
  p.click('btn-claim');
  p.frames(2);
  assert.ok(!p.game.end.share.tags.includes('PRACTICE'), 'counted: the card is rebuilt without PRACTICE');
  const e = stored(s).days[20261016];
  assert.equal(e.dnf, false);
  assert.equal(e.firstShift, true);
  assert.ok(Number.isInteger(e.points) && /^[A-DF]$/.test(e.letter), JSON.stringify(e));
  assert.equal(p.$('end-run').textContent, 'OFFICIAL: your first shift counts as daily #5.');
  assert.match(p.$('end-streak').textContent, /^STREAK 1 · ★ STREAK [01] · 1 daily played$/);
  assert.equal(p.$('btn-claim'), null);
  // PLAY THIS DAY AGAIN: practice beside the official run
  p.click('btn-again');
  assert.equal(p.$('briefing-title').textContent, 'Daily #5 · PRACTICE');
  p.key('Enter');
  endDay(p);
  assert.equal(p.$('end-run').textContent, 'PRACTICE: today\'s official run is in (' + e.points + ' ' + e.letter + ').');
  assert.ok(p.game.end.share.tags.includes('PRACTICE'));
  assert.deepEqual(stored(s).days[20261016], e, 'practice never changes the official entry');
  assert.deepEqual(p.h.mods.errors, []);
});

test('Y-2 on the page: a later shift is official from 09:00 (a DNF if the tab closes); reopened, the date is PRACTICE; finished, the streak counts it', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}, [HI.HISTORY_KEY]: {v: 1, days: {20261015: {dnf: false, star: true, points: 1001, letter: 'A'}}}});
  const p = openGame({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY});
  assert.equal(p.$('briefing-title').textContent, 'Daily #5 · OFFICIAL');
  G.runTo(p.game, (HI.OFFICIAL_S - 60) * V.TICKS_PER_S);
  assert.equal(stored(s).days[20261016], undefined, 'not before 09:00');
  past9(p);
  assert.equal(stored(s).days[20261016].dnf, true, 'from 09:00 the date has its run, a DNF until the day ends');
  // the tab closed and reopened: today is practice, and says why
  const q = openGame({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY});
  assert.equal(q.$('briefing-title').textContent, 'Daily #5 · PRACTICE');
  endDay(q);
  assert.equal(q.$('end-run').textContent, 'PRACTICE: today\'s official run is in (it did not finish).');
  // the first tab plays on to the end: the entry is finished, and the streak runs from yesterday
  endDay(p);
  const e = stored(s).days[20261016];
  assert.equal(e.dnf, false);
  assert.equal(p.$('end-run').textContent, 'OFFICIAL: daily #5, today\'s run that counts.');
  assert.equal(p.$('end-streak').textContent, 'STREAK 2 · ★ STREAK ' + (e.star ? 2 : 0) + ' · 2 dailies played', 'yesterday was a ★');
  assert.ok(!p.game.end.share.tags.includes('PRACTICE'));
});

test('Y-2: a past date and a seed off the calendar are practice; Y-3: with storage blocked the game plays and says "history off"', () => {
  const p = openGame({seed: 20261014, run: false, par: PAR, storage: store({[G.SEEN_KEY]: {shifts: 1}}), date: TODAY});
  assert.equal(p.$('briefing-title').textContent, 'Daily #3 · PRACTICE');
  endDay(p);
  assert.equal(p.$('end-run').textContent, 'PRACTICE: a past daily. Only today\'s counts.');
  const b = openGame({seed: 20261016, run: false, par: PAR, storage: blocked(), date: TODAY});
  past9(b);
  endDay(b);
  assert.equal(b.game.historyOn, false);
  assert.equal(b.$('end-streak').textContent, 'History off: this browser keeps no storage, so there is no streak.');
  assert.ok(b.game.end.share && b.game.end.verdict, 'the day plays to its verdict and card');
  assert.deepEqual(b.h.mods.errors, []);
});

test('Y-2 (review): two tabs on today\'s daily: the first past 09:00 takes the date; the other turns practice and never overwrites it', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 2}});
  const a = openGame({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY}), b = openGame({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY});
  assert.equal(a.$('briefing-title').textContent, 'Daily #5 · OFFICIAL');
  assert.equal(b.$('briefing-title').textContent, 'Daily #5 · OFFICIAL');
  past9(b);
  endDay(b);
  const e = stored(s).days[20261016];
  assert.equal(e.dnf, false);
  past9(a);
  endDay(a);
  assert.deepEqual(stored(s).days[20261016], e, 'the later tab wrote nothing');
  assert.equal(a.game.run.status, 'practice');
  assert.match(a.$('end-run').textContent, /^PRACTICE: today's official run is in/);
  assert.ok(a.game.end.share.tags.includes('PRACTICE'));
  // storage blocked: practice, said so, and no claim
  const c = openGame({seed: 20261016, run: false, par: PAR, storage: blocked(), date: TODAY});
  assert.equal(c.$('briefing-title').textContent, 'Daily #5 · PRACTICE');
  endDay(c);
  assert.equal(c.$('btn-claim'), null);
  assert.equal(c.$('end-run').textContent, 'PRACTICE: history is off in this browser, so nothing counts.');
});

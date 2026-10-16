// W6, Y-2: the practice shelf (app/shelf.js, drawn by app/shell.js). The Hard days are the seeds the daily gate rejected,
// one a date, numbered by date; the past dailies run back from yesterday to #1 with this browser's results. On the page:
// MORE DAYS on the end card opens the shelf; a past daily plays in the page as practice; TODAY brings back today's daily as
// the official run; a Hard day is named, never "not gate-checked", and its card says "Hard day n".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as SF from '../app/shelf.js';
import * as G from '../app/game.js';
import {DAILIES, dailyFor} from '../content/dailies.js';
import {NOT_GATED} from '../app/shell.js';
import {openGame} from './lib/play.js';

const TODAY = new Date(2026, 9, 16);
const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
function store(init = {}) {
  const mem = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {mem, getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
}
const button = (p, text) => p.$('shelf-card').querySelectorAll('button').find(b => b.textContent === text || b.textContent.startsWith(text));

test('S-7, Y-2: the Hard days are attempt 0 of each date the gate rejected, numbered by date', () => {
  const h = SF.hardDays();
  const rejected = Object.keys(DAILIES.attempts).filter(k => DAILIES.attempts[k] > 0);
  assert.equal(h.length, rejected.length);
  assert.deepEqual(h.slice(0, 2), [{n: 1, seed: 20261023, weekend: false}, {n: 2, seed: 20261026, weekend: false}]);
  for (const x of h) assert.notEqual(dailyFor(x.seed).seed, x.seed, x.seed + ' is not its date\'s daily');
  assert.equal(SF.hardDayOf(20261023), 1);
  assert.equal(SF.hardDayOf(20261016), 0);
});

test('Y-2: the past dailies run back from yesterday to #1, each with this browser\'s official result', () => {
  const past = SF.pastDailies(20261016, {days: {20261015: {dnf: false, points: 1002, letter: 'A', star: true}, 20261013: {dnf: true}}});
  assert.deepEqual(past.map(d => d.n + ' ' + d.label + ' ' + SF.resultText(d.entry)), ['4 Thu 15 Oct 1002 A ★', '3 Wed 14 Oct ', '2 Tue 13 Oct DNF', '1 Mon 12 Oct ']);
  assert.equal(SF.pastDailies(20261230, null).length, SF.SHELF_PAST);
  assert.equal(SF.isoOf(20261015), '2026-10-15');
});

test('Y-2 on the page: MORE DAYS opens the shelf; a past daily plays in the page as practice; TODAY brings the official run back', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = openGame({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY});
  p.game.state.over = true;
  p.frames(2);
  p.click('btn-shelf');
  assert.equal(p.$('shelf-card').hidden, false);
  assert.equal(p.$('shelf-today'), null, 'today\'s daily is on the desk already');
  assert.equal(p.$('shelf-card').querySelectorAll('button').filter(b => /^Hard day \d+$/.test(b.textContent)).length, SF.hardDays().length);
  button(p, '#4 Thu 15 Oct · not played').click();
  p.frame();
  assert.equal(p.game.seed, dailyFor(20261015).seed);
  assert.equal(p.$('briefing-title').textContent, 'Daily #4 · PRACTICE');
  assert.equal(p.$('end-card').hidden, true);
  assert.equal(p.$('shelf-card').hidden, true);
  // a practice day's briefing has the shelf too; TODAY is on it now
  assert.equal(p.$('btn-shelf-brief').hidden, false);
  p.click('btn-shelf-brief');
  p.click('shelf-today');
  assert.equal(p.$('briefing-title').textContent, 'Daily #5 · OFFICIAL');
  assert.equal(p.$('btn-shelf-brief').hidden, true, 'today\'s official briefing keeps its one click');
  assert.deepEqual(p.h.mods.errors, []);
});

test('S-7 on the page: a Hard day is named, never "not gate-checked", and its card says so', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = openGame({seed: 20261016, run: false, par: PAR, storage: s, date: TODAY});
  p.game.state.over = true;
  p.frames(2);
  p.click('btn-shelf');
  button(p, 'Hard day 1').click();
  p.frame();
  assert.equal(p.game.seed, 20261023);
  assert.equal(p.$('briefing-title').textContent, 'Hard day 1 · PRACTICE');
  assert.ok(!p.$('briefing-watch').textContent.includes(NOT_GATED));
  p.key('Enter');
  p.game.state.over = true;
  p.frames(2);
  assert.match(p.game.end.share.lines[0], /^GRIDWATCH · Hard day 1 · /);
  assert.equal(p.$('end-run').textContent, 'PRACTICE: Hard day 1. No plan keeps every light on: you are graded on the rest.');
  assert.equal(p.$('end-gate'), null, 'no "not gate-checked" on the card either');
});

// ------------------------------------------------------------------ the review's findings

import {installGlobals} from './lib/dom.js';
import {RESUME_LOST} from '../app/shell.js';

test('Y-2 (review): the shelf holds the keyboard (Enter never takes the day underneath, Esc closes it); no switch partway through a day', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}}), p = openGame({seed: 20261014, run: false, take: false, par: PAR, storage: s, date: TODAY});
  assert.equal(p.$('btn-shelf-brief').hidden, false, 'a past daily\'s briefing offers the shelf');
  p.click('btn-shelf-brief');
  p.key('Enter');
  assert.equal(p.game.phase, 'briefing', 'Enter with the shelf open does not take the desk');
  p.key('Escape');
  assert.equal(p.$('shelf-card').hidden, true);
  p.click('btn-take');
  assert.equal(p.game.phase, 'play');
  assert.equal(G.switchDay(p.game, G.dailyFrom('?date=2026-10-15')), false, 'never partway through a day');
});

test('Y-2 (review): TODAY leaves the bare address; a first visit by a link has no MORE DAYS; the shelf reads today\'s date; a lost save is said', () => {
  const s = store({[G.SEEN_KEY]: {shifts: 3}, [G.RESUME_KEY + ':practice']: {v: 2, sim: 'v4-core-0.0', seed: dailyFor(20261015).seed, tick: 99, acts: [], run: {}}});
  const p = openGame({seed: 20261014, run: false, take: false, par: PAR, storage: s, date: TODAY});
  // the date moves on while the tab is open: the shelf's TODAY is the new date's
  p.game.todayOf = () => 20261017;
  p.click('btn-shelf-brief');
  assert.equal(p.$('shelf-today').textContent, 'TODAY: DAILY #6');
  p.game.todayOf = () => 20261016;
  p.click('btn-shelf-brief');
  let addr = '';
  const restore = installGlobals({location: {href: 'https://databerryau.github.io/gridwatch/next.html?debug&date=2026-10-14'}, history: {replaceState: (a, b, u) => { addr = u; }}});
  try {
    p.click('shelf-today');
    assert.equal(addr, '/gridwatch/next.html?debug=', 'today\'s daily is the bare address');
    assert.equal(p.$('btn-shelf-brief').hidden, true, 'today\'s official briefing keeps its one click');
    p.click('btn-take');
    p.game.state.over = true;
    p.frames(2);
    p.click('btn-shelf');
    button(p, '#4 Thu 15 Oct').click();
    assert.equal(addr, '/gridwatch/next.html?debug=&date=2026-10-15');
  } finally { restore(); }
  assert.equal(p.$('toast').textContent, RESUME_LOST, 'a save from another build is dropped, said so');
  // a first visit by a past daily's link: one click (no MORE DAYS)
  const f = openGame({seed: 20261014, run: false, take: false, par: PAR, storage: store(), date: TODAY});
  assert.equal(f.$('briefing-title').textContent, 'Daily #3 · PRACTICE');
  assert.equal(f.$('btn-shelf-brief').hidden, true);
});

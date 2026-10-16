// W6, Y-11: the ladder. content/ladder.js (tools/ladder.mjs) holds, for every daily, the points of GRIDWATCH's own players
// (did nothing, lean, competent) against par; it carries the build stamp the dailies do, so a sim or desk-scenario change
// that leaves it stale cannot merge (as tests/dailies.test.js does for the dailies). The end card shows the ladder lowest
// first, YOU in your place; not off the calendar, nor on a Hard day, nor with a stale list.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LADDER} from '../content/ladder.js';
import {DAILIES} from '../content/dailies.js';
import * as G from '../app/game.js';
import {openGame} from './lib/play.js';

const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

test('Y-11: the ladder is current (the build\'s stamp) and covers every daily, three players a date', () => {
  assert.equal(LADDER.v, G.dailyStamp(), 'content/ladder.js is stale: run node tools/ladder.mjs -j 6 (after tools/daily-gen.js)');
  const from = +DAILIES.from.replace(/-/g, ''), to = +DAILIES.to.replace(/-/g, ''), keys = Object.keys(LADDER.points).map(Number).sort((a, b) => a - b);
  assert.equal(keys[0], from);
  assert.equal(keys[keys.length - 1], to);
  for (const k of keys) {
    const r = LADDER.points[k];
    assert.ok(Array.isArray(r) && r.length === 3 && r.every(x => x === null || (Number.isInteger(x) && x >= 0)), k + ': ' + JSON.stringify(r));
  }
  // the players are in the order their names say, over the year
  const col = i => keys.map(k => LADDER.points[k][i]).filter(x => x !== null);
  assert.ok(median(col(0)) < median(col(1)) && median(col(1)) < median(col(2)), 'did nothing < lean < competent: ' + [0, 1, 2].map(i => median(col(i))));
});

test('Y-11: the ladder puts YOU in your place among the players and par; none off the calendar or with a stale list', () => {
  const p = openGame({seed: 20261016, run: false, take: false});
  const list = {v: G.dailyStamp(), points: {20261016: [25, 929, 1109]}};
  assert.deepEqual(G.ladderFor(p.game, {points: 975}, list), [['did nothing', 25], ['lean', 929], ['YOU', 975, true], ['par', 1000], ['competent', 1109]]);
  assert.deepEqual(G.ladderFor(p.game, {points: 1000}, list).map(r => r[0]), ['did nothing', 'lean', 'par', 'YOU', 'competent'], 'a tie with par: par first');
  assert.equal(G.ladderFor(p.game, {points: 975}, Object.assign({}, list, {v: 'old'})), null, 'a stale list: no ladder');
  assert.equal(G.ladderFor(p.game, null, list), null, 'no grade yet: no ladder');
  const off = openGame({seed: 7, scenario: 'desk', run: false, take: false});
  assert.equal(G.ladderFor(off.game, {points: 975}, list), null, 'off the calendar');
});

test('Y-11 on the page: the end card shows today\'s ladder under the score, YOU in bold', () => {
  const p = openGame({seed: 20261016, run: false, par: PAR});
  p.game.state.over = true;
  p.frames(2);
  const row = p.$('end-ladder');
  assert.ok(row, 'the ladder row');
  assert.match(row.textContent, /^On today's ladder: .*YOU \d+.* \(GRIDWATCH's own scripted players\)$/);
  assert.equal(row.querySelector('b').textContent, 'YOU ' + p.game.end.grade.points);
  assert.deepEqual(p.h.mods.errors, []);
});

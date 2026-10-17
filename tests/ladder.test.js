// W6, Y-11 (Q-108): the ladder. content/ladder.js (tools/ladder.mjs) holds, for every daily, par's ALL-IN and that of GRIDWATCH's
// own players (did nothing, the lean and competent scripts); the page grades them as it grades the player. The list carries the
// dailies' build stamp, so a sim or desk-scenario change that leaves it stale cannot merge, and the first daily's no-input day
// is replayed here to 14:00 against the list's check, for changes to the page's dispatch that leave the stamp alone (an
// anniversary's row, made from a variant the stamp does not hash, is held to it in tests/anniversary.test.js). The end
// card shows did nothing, the better script as "a scripted shift", par and YOU, lowest first; not off the calendar, nor with a
// stale list.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LADDER} from '../content/ladder.js';
import {DAILIES} from '../content/dailies.js';
import * as G from '../app/game.js';
import {grade} from '../app/score.js';
import {nothingCheck, ladderText} from '../tools/ladder.mjs';
import {openGame} from './lib/play.js';

const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};
const ymdOf = s => +s.replace(/-/g, '');
const days = (a, b) => Math.round((Date.UTC(Math.floor(b / 1e4), Math.floor(b / 100) % 100 - 1, b % 100) - Date.UTC(Math.floor(a / 1e4), Math.floor(a / 100) % 100 - 1, a % 100)) / 864e5) + 1;
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

test('Y-11: the ladder is current (the build\'s stamp) and has a row for every daily', () => {
  assert.equal(LADDER.v, G.dailyStamp(), 'content/ladder.js is stale: run node tools/ladder.mjs -j 6 (after tools/daily-gen.js)');
  const from = ymdOf(DAILIES.from), to = ymdOf(DAILIES.to), keys = Object.keys(LADDER.rows).map(Number).sort((a, b) => a - b);
  assert.equal(keys.length, days(from, to), 'one row a date, none missing');
  assert.deepEqual([keys[0], keys[keys.length - 1]], [from, to]);
  for (const k of keys) {
    const r = LADDER.rows[k];
    assert.ok(r === null || (r.length === 5 && r.every(x => Number.isFinite(x)) && r[0] > 0), k + ': ' + JSON.stringify(r));
  }
  // graded as the page does, did nothing sits well below the scripted shift over the year
  const pts = (r, i) => (r[i] < 0 ? 0 : grade({total: r[i]}, {total: r[0]}, false, r[1]).points);
  const rows = keys.map(k => LADDER.rows[k]).filter(Boolean);
  assert.ok(median(rows.map(r => pts(r, 2))) < 100 && median(rows.map(r => Math.max(pts(r, 3), pts(r, 4)))) > 900);
  assert.equal(ladderText(LADDER), readFileSync(new URL('../content/ladder.js', import.meta.url), 'utf8'), 'tools/ladder.mjs writes the list back as it reads');
});

test('Y-11: the first daily\'s no-input day, replayed on the page\'s path to 14:00, is the stored one (the dispatch has not moved under the stamp)', async () => {
  assert.equal(LADDER.check.ymd, ymdOf(DAILIES.from));
  assert.deepEqual(await nothingCheck(LADDER.check.ymd), LADDER.check, 'the page\'s no-input day changed: run node tools/ladder.mjs -j 6');
});

test('Y-11 (Q-108): did nothing, the better script as "a scripted shift", par and YOU in their places; none off the calendar or with a stale list', () => {
  const p = openGame({seed: 20261016, run: false, take: false});
  const list = {v: G.dailyStamp(), rows: {20261016: [14749198, 0, 598379919, 15870588, 13295257]}};
  assert.deepEqual(G.ladderFor(p.game, {points: 975}, list), [['did nothing', 25], ['YOU', 975, true], ['par', 1000], ['a scripted shift', 1109]]);
  // a script that collapses (the competent one at 109) never shows: the better one does
  const collapse = {v: list.v, rows: {20261016: [14749198, 0, 598379919, 15127383, 135314000]}};
  assert.deepEqual(G.ladderFor(p.game, {points: 990}, collapse).map(r => r.join(' ')), ['did nothing 25', 'a scripted shift 975', 'YOU 990 true', 'par 1000']);
  assert.deepEqual(G.ladderFor(p.game, {points: 1000}, list).map(r => r[0]), ['did nothing', 'par', 'YOU', 'a scripted shift'], 'a tie with par: par first');
  assert.equal(G.ladderFor(p.game, {points: 975}, Object.assign({}, list, {v: 'old'})), null, 'a stale list: no ladder');
  assert.equal(G.ladderFor(p.game, null, list), null, 'no grade yet: no ladder');
  assert.equal(G.ladderFor(openGame({seed: 7, scenario: 'desk', run: false, take: false}).game, {points: 975}, list), null, 'off the calendar');
});

test('Y-11 on the page: the end card shows today\'s ladder under the score, YOU in bold', () => {
  const p = openGame({seed: 20261016, run: false, par: PAR});
  p.game.state.over = true;
  p.frames(2);
  const row = p.$('end-ladder');
  assert.ok(row, 'the ladder row');
  assert.match(row.textContent, /^On today's ladder: .*did nothing \d+.*a scripted shift \d+.*YOU \d+.* \(GRIDWATCH's own scripted players\)$/);
  assert.equal(row.querySelector('b').textContent, 'YOU ' + p.game.end.grade.points);
  assert.deepEqual(p.h.mods.errors, []);
});

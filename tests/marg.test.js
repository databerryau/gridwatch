// O-6: Marg, the supervisor's voice (app/marg.js). Each line at most 20 words, carrying a live number or a decision;
// at most 25 lines on a first shift and 6 on later days, each beat once. On the page her first line is a tray card at
// TAKE THE DESK and her closing line is on the end card.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarg, margSay, MARG_LINES, MARG_WORDS, MARG_FIRST, MARG_LATER, HANDOVER} from '../app/marg.js';
import {openGame} from './lib/play.js';

const fc = {fromS: 0, stepS: 900, n: 96, demandP50: Array.from({length: 96}, (_, k) => 4000 + 2500 * Math.exp(-(((k - 60) / 8) ** 2)) - 1500 * Math.exp(-(((k - 32) / 6) ** 2)))};
const obs = s => ({s});
const words = t => t.trim().split(/\s+/).length;

test('O-6: every line is at most 20 words and carries a live number or a decision', () => {
  const lines = [MARG_LINES.take(obs(1800), fc), MARG_LINES.act2(obs(5 * 3600), fc), MARG_LINES.act3(obs(10 * 3600), fc),
    MARG_LINES.watch({lostMW: 500, extremeHz: 49.31}), MARG_LINES.watch({lostMW: -300, extremeHz: 50.2}), MARG_LINES.handover(),
    MARG_LINES.verdict({points: 1002, letter: 'A'}), MARG_LINES.verdict({points: 640, letter: 'C'}),
    ...['start', 'stop', 'guard', 'battery', 'tie', 'restore', 'dr', 'rert', 'shed', 'city'].map(MARG_LINES.ask)];
  for (const t of lines) {
    assert.ok(t && words(t) <= MARG_WORDS, words(t) + ' words: ' + t);
    assert.ok(/\d/.test(t) || /\b(START|STOP|charge|Close|stops|Commit|holds|imports|buy|Shedding|soak|job|four)\b/i.test(t), 'a number or a decision: ' + t);
  }
  assert.equal(MARG_LINES.handover(), HANDOVER);
  assert.match(MARG_LINES.take(obs(1800), fc), /^Morning\. Peak about [\d,]+ MW at \d\d:\d\d\./);
});

test('O-6: a first shift holds at most 25 lines and a later day 6; each beat speaks once; a longer line is cut at 20 words', () => {
  for (const [first, max] of [[true, MARG_FIRST], [false, MARG_LATER]]) {
    const m = createMarg(first);
    assert.ok(margSay(m, 'take', 'one', 0));
    assert.equal(margSay(m, 'take', 'again', 1), null, 'a beat once');
    for (let i = 0; i < 40; i++) margSay(m, 'ask:' + i, 'a line ' + i, i);
    assert.equal(m.said.length, max);
  }
  const m = createMarg(true), long = margSay(m, 'x', Array.from({length: 30}, (_, i) => 'w' + i).join(' '), 0);
  assert.equal(words(long.text), MARG_WORDS);
  assert.equal(margSay(m, 'y', '', 0), null, 'nothing to say says nothing');
});

test('O-6 on the page: her first line is a tray card at TAKE THE DESK; the day over, her closing line is on the end card', () => {
  const p = openGame({seed: 20261014, run: false, par: {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56}, series: []}});
  assert.match(p.look({controls: false}), /^TRAY .*i MARG, SUPERVISOR 04:30 Morning\. Peak about [\d,]+ MW at \d\d:\d\d\. Commit early: starts take time\. SHOW ME/m);
  p.game.state.over = true;
  p.frames(2);
  assert.match(p.look({controls: false}), /^END .* MARG \d+ points, [A-DF]\. /m);
  assert.deepEqual(p.h.mods.errors, []);
});

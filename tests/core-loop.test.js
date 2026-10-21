// W10 (the core-loop pass): the end card says why the letter, in money, with what the next letter up needs; and the play
// driver's follow() plays the coach-following stranger (tools/play.mjs follow).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whyText} from '../app/endcard.js';
import {LETTERS, RANKS, STAR_POINTS} from '../app/score.js';
import {V} from '../sim/params.js';
import {openGame} from './lib/play.js';

test('W10: why this letter, in dollars at VCR: the gap to par, and what the next letter up allows; PERFECT in plain words', () => {
  const A = LETTERS[0][1] * V.VCR;
  assert.equal(A, 300000, 'an A allows $300,000 (10 MWh at VCR)');
  assert.equal(whyText({letter: 'B', gapMWh: 10.4}, false), 'B: par ran the day for $312,000 less. A needs you within $300,000.');
  assert.equal(whyText({letter: 'C', gapMWh: 200}, false), 'C: par ran the day for $6.0M less. B needs you within $4.5M.');
  assert.equal(whyText({letter: 'A', gapMWh: 3}, false), 'A: within $90,000 of par (an A allows $300,000). ' + RANKS['A★'] + ' needs ' + STAR_POINTS + ' points.');
  assert.equal(whyText({letter: 'A', gapMWh: -2}, false), 'A: you ran the day $60,000 cheaper than par. ' + RANKS['A★'] + ' needs ' + STAR_POINTS + ' points.');
  assert.match(whyText({letter: 'A', star: true, gapMWh: -15}, false), /^A ★ MARG'S CHAIR: you ran the day \$450,000 cheaper than par/);
  assert.equal(whyText({letter: 'F'}, false), 'F: the grid went black.');
  assert.match(whyText({letter: 'B', gapMWh: 12}, true), / PERFECT: every light of yours stayed on, and every repaired street came back on time\.$/,
    'a PERFECT day beside a B says what PERFECT means, so the two do not read as a contradiction');
  assert.equal(whyText(null, true), '');
});

test('W10: follow() does what the coach says: the 04:30 GUARD ask is pressed, the morning short is started', () => {
  const p = openGame({seed: 20261022}), f = p.follow('05:00');
  assert.ok(f.acts.length >= 2, JSON.stringify(f.acts));
  assert.match(f.acts[0].text, /Raise the battery GUARD to \d+ MW/);
  assert.ok(p.game.state.battery.guardMW > 0, 'the GUARD the line asked for is set');
  assert.ok(f.acts.some(a => /Start GT·A now/.test(a.text)), 'and the start it asked for');
});

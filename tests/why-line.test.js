// W10's why line at the letters' edges (the review of 2026-11-13, C8): a gap behind par is rounded up, so it never reads as
// the next letter's own limit; par's own replay is "level with par", never "$1,000 cheaper".
import test from 'node:test';
import assert from 'node:assert/strict';
import {whyText} from '../app/endcard.js';
import {V} from '../sim/params.js';

const why = (letter, usd) => whyText({letter, gapMWh: usd / V.VCR, star: false}, false);

test('C8: the why line never contradicts its letter at the edges', () => {
  assert.equal(why('B', 300400), 'B: par ran the day for $301,000 less. A needs you within $300,000.');
  assert.equal(why('C', 4.51e6), 'C: par ran the day for $4.6M less. B needs you within $4.5M.');
  assert.match(why('A', 0), /^A: level with par\. /);
  assert.match(why('A', -120), /^A: level with par\. /);
  assert.equal(why('B', 312000), 'B: par ran the day for $312,000 less. A needs you within $300,000.', 'W10\'s example unchanged');
});

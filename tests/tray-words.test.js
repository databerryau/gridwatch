// K-9 (the review of 2026-11-13, S5): a tray card fits MAX_WORDS as written, never cut mid-sentence. SECURITY SHORT and an
// MSL3 notice had been cut ("…trip preview…", "…until rooftop solar…"); the tests counted the words after the cut.
import test from 'node:test';
import assert from 'node:assert/strict';
import {securityShort, words, MAX_WORDS} from '../app/tray.js';

const count = s => s.trim().split(/\s+/).length;

test('SECURITY SHORT in words: the unit by name, the spare, the Hz, within the card\'s words', () => {
  const t = securityShort('SECURITY SHORT: spare in 5 min 310 MW, biggest risk coal1 544 MW, trip preview 49.28 Hz.');
  assert.match(t, /^Not enough spare\. If COAL 1 \(544 MW\) tripped now, only 310 MW could replace it within 5 min\. Frequency would fall to 49\.28 Hz\.$/);
  assert.ok(count(t) <= MAX_WORDS, count(t) + ' words');
  assert.equal(words(t), t, 'never cut');
  const tie = securityShort('SECURITY SHORT: spare in 5 min 1210 MW, biggest risk tie 1500 MW, trip preview 48.90 Hz.');
  assert.ok(tie.includes('If the tie (1500 MW)') && count(tie) <= MAX_WORDS, tie);
  const none = securityShort('SECURITY SHORT: spare in 5 min 0 MW, biggest risk none, trip preview 50.00 Hz.');
  assert.ok(count(none) <= MAX_WORDS && !/undefined/.test(none), none);
});

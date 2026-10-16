// tests/urgent.test.js: URGENT after a trip counts what the battery already carries (X-44).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';

// The review's competent run on 2026-10-14 (REVIEW-2026-10-14-reports/agency.md §7), to after the 19:19 trip. (W6, the test
// budget: between its presses the sim alone (tests/lib/play.js skipTo), each card on the way answered with Enter as the
// page's player did: HAR4's at 06:55 (RESTORE), the 12:19 trip's; then the page from 19:10, to the 19:19 trip's card.)
function competent() {
  const p = openGame({seed: 20261014}), start = id => { p.click('guard-start-' + id); p.click('guard-start-' + id); };
  const skip = when => { for (let i = 0; i < 4; i++) { if (!p.skipTo(when).why.startsWith('held')) return; p.key('Enter'); } };
  start('ccgt2'); p.send({type: 'guard', mw: 400});
  skip('07:00'); start('hydro3');
  skip('17:00'); start('gta1');
  skip('18:00'); start('gtc1');
  skip('19:10'); p.until('card', {line: 'near'}); p.key('Enter');
  return p;
}

test('X-44: on the 2026-10-14 competent run the line leaves URGENT once BALANCE reads BALANCED, and never asks the battery for less than it gives', () => {
  const p = competent();
  p.to('19:25');
  const level = () => p.$('objective-level').textContent, word = p.$('bar-imbalance').querySelector('.dk-imb-text'), balance = () => word.textContent;
  const text = p.$('objective-text').textContent, gives = p.game.state.battery.outMW, ask = /discharge the battery at (\d+) MW/.exec(text);
  assert.ok(!ask || +ask[1] >= gives, 'asks ' + (ask && ask[1]) + ' MW while it gives ' + Math.round(gives) + ': ' + text);
  p.to('19:55', {line: 'near'});
  // Sampled, not streamed (CLAUDE.md): every 0.25 real s a jump and one drawn frame, the bar and the line read on it;
  // 8 samples (2 real s) after BALANCED the line is no longer URGENT. It was URGENT before (the case).
  let balancedAt = -1, urgent = false;
  for (let i = 0; i < 80; i++) {
    p.realJump(0.25);
    if (balancedAt < 0) urgent ||= /URGENT/.test(level());
    if (balancedAt < 0 && /BALANCED/.test(balance())) balancedAt = i;
    if (balancedAt >= 0 && i - balancedAt >= 8) {
      assert.ok(urgent, 'the case: URGENT before BALANCE read BALANCED');
      assert.doesNotMatch(level(), /URGENT/, p.clock() + ' ' + balance());
      return;
    }
  }
  assert.fail('BALANCE never read BALANCED by ' + p.clock());
});

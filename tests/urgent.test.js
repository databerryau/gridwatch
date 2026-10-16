// tests/urgent.test.js: URGENT after a trip counts what the battery already carries (X-44).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';

// The review's competent run on 2026-10-14 (REVIEW-2026-10-14-reports/agency.md §7), to after the 19:19 trip.
function competent() {
  const p = openGame({seed: 20261014}), start = id => { p.click('guard-start-' + id); p.click('guard-start-' + id); };
  start('ccgt2'); p.send({type: 'guard', mw: 400}); p.until('card', {line: 'near'}); p.key('Enter');
  p.to('07:00', {stop: [], line: 'near'}); start('hydro3'); p.until('card', {line: 'near'}); p.key('Enter');
  p.to('17:00', {stop: [], line: 'near'}); p.key('Enter'); p.to('17:00', {stop: [], line: 'near'}); start('gta1');
  p.to('18:00', {stop: [], line: 'near'}); start('gtc1'); p.until('card', {line: 'near'}); p.key('Enter');
  return p;
}

test('X-44: on the 2026-10-14 competent run the line leaves URGENT once BALANCE reads BALANCED, and never asks the battery for less than it gives', () => {
  const p = competent();
  p.to('19:25');
  const level = () => p.$('objective-level').textContent, word = p.$('bar-imbalance').querySelector('.dk-imb-text'), balance = () => word.textContent;
  const text = p.$('objective-text').textContent, gives = p.game.state.battery.outMW, ask = /discharge the battery at (\d+) MW/.exec(text);
  assert.ok(!ask || +ask[1] >= gives, 'asks ' + (ask && ask[1]) + ' MW while it gives ' + Math.round(gives) + ': ' + text);
  p.to('19:55', {line: 'near'});
  let balancedAt = -1;
  for (let i = 0; i < 80; i++) {
    p.real(0.25);
    if (balancedAt < 0 && /BALANCED/.test(balance())) balancedAt = i;
    if (balancedAt >= 0 && i - balancedAt >= 8) { assert.doesNotMatch(level(), /URGENT/, p.clock() + ' ' + balance()); return; }
  }
  assert.fail('BALANCE never read BALANCED by ' + p.clock());
});

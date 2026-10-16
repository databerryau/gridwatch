// tests/briefing60.test.js: D-3, a 60-word briefing: the goal, the day and Watch for, what is real, the date; one click
// to take the desk; the score's rule and the keys behind the header "?", HOW TO PLAY first.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {watchFor, dayText, dayPlan, dateText} from '../app/shell.js';
import * as G from '../app/game.js';
import {createState, observe} from '../sim/step.js';
import {openGame} from './lib/play.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const words = s => s.trim().split(/\s+/).filter(Boolean).length;
const textOf = id => new RegExp('<p id="' + id + '"[^>]*>([^<]*)</p>').exec(NEXT)[1];

// Q-110 (the owner, 2026-10-16: the cap "doesn't matter really"): a storm or low-wind day's line says so ("Storms likely
// later."), which takes 10 of the 365 dailies to 61-62 words. The cap here is a guard against unnoticed growth, not D-3's 60.
const MOST_WORDS = 65;

test('D-3 (Q-110): the briefing is 65 words or fewer on every date of two months (the day and Watch for 30 or fewer); a gated daily', () => {
  const fixed = words(textOf('briefing-goal')) + words(textOf('briefing-real'));
  assert.equal(textOf('briefing-goal'), 'Keep the lights on: start power stations before the city needs them. The line above the desk says what\'s next.');
  let most = 0, at = 0;
  for (let k = 0; k < 61; k++) {
    const t = new Date(Date.UTC(2026, 9, 16 + k)), seed = t.getUTCFullYear() * 1e4 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
    const st = createState(seed, G.scenarioForSeed(seed)), obs = observe(st), b = watchFor(obs, st.scn.commitment.battery.guardMW);
    const day = dayText(st.day, dayPlan(st, obs)) + (b.length ? ' Watch for: ' + b.join('; ') + '.' : '');
    assert.ok(words(day) <= 30, seed + ': ' + day);
    const n = fixed + words(day) + words(dateText(seed));
    if (n > most) { most = n; at = seed; }
  }
  assert.ok(most <= MOST_WORDS, most + ' words on ' + at);
});

test('D-3: one required click (TAKE THE DESK); the date in place of the seed; the header "?" opens HOW TO PLAY first, WHAT IS SIMPLIFIED second', () => {
  const p = openGame({seed: 20261016, take: false});
  const card = p.$('briefing-card'), need = card.querySelectorAll('button').filter(b => !b.hidden);
  assert.deepEqual(need.map(b => b.id), ['btn-agc', 'btn-take'], 'AGC is the default already: TAKE THE DESK is the one click');
  assert.equal(p.$('briefing-date').textContent, 'Friday 16 October 2026');
  assert.equal(dateText(7), 'Seed 7');
  p.click('btn-take');
  assert.equal(card.hidden, true);
  p.click('btn-help');
  const drawer = p.$('drawer');
  assert.equal(drawer.hidden, false);
  const heads = drawer.querySelectorAll('h2').map(h => h.textContent);
  assert.deepEqual(heads, ['How to play', 'What GRIDWATCH simplifies, and why']);
  assert.match(p.$('how-score').textContent, /^Keep the lights on, cheaply and cleanly\. Your score is one total/);
  assert.match(p.$('how-keys').textContent, /Keys: 1–5 pick a lever/);
});

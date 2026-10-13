// Q-81 (desk/README.md §32.8.2): the briefing's "Watch for" gives one brief per news item announced at
// 04:00, composed from its kind and the public obs (heat 'heatwave 13:20–19:50', tie 'tie import ≤ 500 MW
// until 10:00', outage 'CCGT 2 out until 07:45', network 'RED5, RED6 feeders back 06:45, 07:05'), each
// <= 8 words and <= 30 in all (D-3); a daily outside the gate-checked list says so (Q-75). Q-80: the day's
// line reads the heat from the 04:00 news. D-7 / Q-64: the header's HAND chip, amber with its word.
//
// Headless (CLAUDE.md): the shell alone on next.html (no desk, map or stack), booted at 04:00; the chip's
// states are set on the state (the sim's own flags), never played to.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bootGame, watchFor, watchForText, NOT_GATED, dayText, HAND_CHIP} from '../app/shell.js';
import * as G from '../app/game.js';
import {createState, observe} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import {clockText} from '../render/format.js';
import {makeDocument} from './lib/dom.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const words = s => s.trim().split(/\s+/).length;
const hm = s => clockText(s, false);

/** The shell alone on next.html, a date's seed through the page's own daily and scenario (Q-75). */
function boot(seed) {
  const doc = makeDocument(NEXT);
  const h = bootGame(doc, {search: '?seed=' + seed, scenario: G.scenarioForSeed, storage: null, audioWin: {}, raf: false, now: () => 0});
  h.frame(1 / 60);
  return {doc, h, game: h.game, $: id => doc.getElementById(id)};
}
/** The "Watch for" briefs on the card, in order. */
const briefsOn = b => /^Watch for: (.*?)\. /.exec(b.$('briefing-watch').textContent)[1].split('; ');

test('Q-81: a heat + tie derate + feeder date (20261005): Watch for names all three, from the news and the public obs, in <= 30 words', () => {
  const b = boot(20261005), obs = observe(b.game.state), at0 = obs.news.filter(n => n.atS === 0), of = k => at0.find(n => n.kind === k);
  assert.deepEqual(at0.map(n => n.kind).sort(), ['heat', 'network', 'tie'], 'the date\'s 04:00 news');
  const feeders = obs.districts.filter(d => d.clearS >= 0).sort((a, c) => a.clearS - c.clearS);
  const want = {
    heat: 'heatwave ' + hm(of('heat').fromS) + '–' + hm(of('heat').toS),
    tie: 'tie import ≤ ' + obs.tie.importLimitMW + ' MW until ' + hm(of('tie').toS),
    network: feeders.map(d => d.id).join(', ') + ' feeders back ' + feeders.map(d => hm(d.clearS)).join(', '),
  };
  const briefs = briefsOn(b);
  assert.deepEqual(briefs, at0.map(n => want[n.kind]), 'one brief per item, in the news order');
  assert.deepEqual(briefs, ['heatwave 13:20–19:50', 'RED5, RED6 feeders back 06:45, 07:05', 'tie import ≤ 500 MW until 10:00'], 'the date\'s own words');
  for (const x of briefs) assert.ok(words(x) <= 8, x);
  assert.ok(words('Watch for: ' + briefs.join('; ')) <= 30);
  // a bare seed is not that date's listed daily (the shipped list is empty until stage C): it says so, before play
  assert.equal(b.game.daily.gated, false);
  assert.ok(b.$('briefing-watch').textContent.includes(NOT_GATED), b.$('briefing-watch').textContent);
  // Q-80: the heat is news at 04:00, so the day's line can say it
  assert.equal(b.$('briefing-day').textContent, 'Today: a hot weekday, with a heatwave this afternoon (Watch for, below).');
  assert.deepEqual(b.h.mods.errors, []);
});

test('Q-81: a late return names the unit as the desk does (weekday CCGT 2, weekend coal 4); a gated daily has no label; classic has no 04:00 news', () => {
  const day = observe(createState(20261007, G.scenarioForSeed(20261007)));
  assert.deepEqual(watchFor(day), ['heatwave 14:05–20:00', 'RED7, RED5 feeders back 06:45, 07:15', 'CCGT 2 out until 07:45']);
  const weekend = observe(createState(20261011, G.scenarioForSeed(20261011)));
  assert.deepEqual(watchFor(weekend), ['TAL3, TAL5 feeders back 06:30, 07:35', 'COAL 4 out until 11:30']);
  assert.equal(watchForText(weekend, true), 'Watch for: TAL3, TAL5 feeders back 06:30, 07:35; COAL 4 out until 11:30. ', 'gated: no label');
  assert.equal(watchForText(weekend, null), watchForText(weekend, true), 'null (not a daily): no label either');
  assert.ok(watchForText(weekend, false).endsWith(NOT_GATED + ' '));
  const classic = observe(createState(4, CLASSIC));
  assert.deepEqual([watchFor(classic), watchForText(classic, null)], [[], ''], 'nothing announced at 04:00, nothing to watch for');
  // one feeder alone, and two on one clearance (2e's first shift): the brief reads in the singular, one time
  const one = {news: [{atS: 0, kind: 'network', fromS: 9000, toS: 9000}], districts: [{id: 'SAL3', clearS: 9000}, {id: 'SAL4', clearS: -1}]};
  const same = {news: one.news, districts: [{id: 'SAL3', clearS: 9000}, {id: 'SAL4', clearS: 9000}]};
  assert.deepEqual([watchFor(one), watchFor(same)], [['SAL3 feeder back 06:30'], ['SAL3, SAL4 feeders back 06:30']]);
});

test('Q-80: the day\'s line reads the 04:00 news on a planned day, and keeps the mid-morning words on the classic day', () => {
  const hot = {temp: 'HOT', weekend: false};
  assert.equal(dayText(hot, {heat: false}), 'Today: a hot weekday. No heatwave is forecast.');
  assert.equal(dayText(hot, {heat: true}), 'Today: a hot weekday, with a heatwave this afternoon (Watch for, below).');
  assert.equal(dayText(hot, null), 'Today: a hot weekday. A heatwave warning, if one comes, comes mid-morning.', 'classic: announced at 10:30');
  assert.match(dayText({temp: 'HOT', weekend: true}, {heat: false}), /^Today: a hot weekend\. No heatwave is forecast\. Demand is lower at the weekend/);
  const b = boot(20261011);
  assert.match(b.$('briefing-day').textContent, /^Today: a mild weekend\. /);
});

test('D-7 / Q-64: the header\'s HAND chip: HAND (amber, with the word) from obs.mode until the night shift, then HAND-FLOWN · NIGHT SHIFT ON AGC from obs.handFlown; none on an AGC day', () => {
  const b = boot(20261005), chip = b.$('chip-hand'), st = b.game.state, frame = () => b.h.frame(1 / 60);
  const look = () => [chip.hidden, chip.textContent, chip.className, chip.title];
  assert.equal(chip.hidden, true, 'AGC: no chip');
  b.$('btn-hand').click();
  frame();
  assert.equal(st.control.mode, 'HAND', 'the card\'s HAND is the sim\'s mode (Q-64)');
  assert.deepEqual(look(), [false, 'HAND', 'chip day', HAND_CHIP.day[1]]);
  assert.match(NEXT, /#chip-hand \{ color: var\(--amber\); border-color: var\(--amber\);/, 'amber');
  // an inline "?" beside it, as every header readout
  assert.ok(b.doc.querySelector('button.q[data-anchor="chip-hand"]'), 'its "?"');
  st.control.handFlown = true; st.control.nightShift = true; st.control.mode = 'AGC'; // (the sim's flip at 21:00: AGC on, the tag kept)
  frame();
  assert.deepEqual(look(), [false, 'HAND-FLOWN · NIGHT SHIFT ON AGC', 'chip night', HAND_CHIP.night[1]]);
  st.control.handFlown = false;
  frame();
  assert.equal(chip.hidden, true, 'an AGC day after the flip: no chip');
  assert.deepEqual(b.h.mods.errors, []);
});

// Q-81 (desk/README.md §32.8.2): the briefing's "Watch for" gives one brief per news item announced at
// 04:00, composed from its kind and the public obs (heat 'heatwave 13:20–19:50', tie 'tie import ≤ 500 MW
// until 10:00', outage 'CCGT 2 out until 07:45', network 'RED5, RED6 feeders back 06:45, 07:05'), each
// <= 8 words and <= 30 in all (D-3); a daily outside the gate-checked list says so (Q-75). Q-80: the day's
// line reads the heat from the 04:00 news. D-7 / Q-64: the header's HAND chip, amber with its word. And
// the shell's other 2c faces (§32.11's hand-offs): the badge's RESTORE, OFFER and NIGHT looks, each with its
// word; the live region on a new D-2 segment (with the act's words on a new act); a toast that lives
// max(3 s, 0.3 s a word); the end card fetched when the night shift takes the desk (Q-73).
//
// Headless (CLAUDE.md): the shell alone on next.html (no desk, map or stack), booted at 04:00; the chip's
// states are set on the state (the sim's own flags), never played to.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bootGame, watchFor, watchForText, NOT_GATED, dayText, HAND_CHIP, createLive, liveFrame, LIVE_GAP_MS, TOAST_MS, TOAST_WORD_MS} from '../app/shell.js';
import * as G from '../app/game.js';
import * as endCard from '../app/endcard.js';
import {createState, observe} from '../sim/step.js';
import {NIGHT_S} from '../sim/clock.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {clockText, badgeText, NIGHT_LOCK} from '../render/format.js';
import {makeDocument} from './lib/dom.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const words = s => s.trim().split(/\s+/).length;
const hm = s => clockText(s, false);

/** The shell alone on next.html, a date's seed through the page's own daily and scenario (Q-75); `clock.t` is its page time. */
function boot(seed, clock = {t: 0}) {
  const doc = makeDocument(NEXT);
  const h = bootGame(doc, {search: '?seed=' + seed, scenario: G.scenarioForSeed, storage: null, audioWin: {}, raf: false, now: () => clock.t});
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

test('§32.11: the badge has a look for RESTORE, OFFER and NIGHT, each with its word (K-22: never colour alone)', () => {
  for (const m of ['RESTORE', 'OFFER', 'NIGHT']) assert.match(NEXT, new RegExp('#rate-badge\\.' + m + '[ ,][^{]*\\{'), m + ' has a look');
  assert.deepEqual([badgeText({mode: 'RESTORE', rate: 30}), badgeText({mode: 'OFFER', rate: 30}), badgeText({mode: 'NIGHT', rate: 2100, segment: 'NIGHT ROLL'})],
    ['RESTORE 30×', 'SYNC 30×', 'NIGHT ROLL 2,100×'], 'and its word');
  assert.match(readFileSync(new URL('../app/shell.js', import.meta.url), 'utf8'), /badge\.className = m\.mode;/, 'the class is the mode');
});

test('K-23 (§32.11): the live region names a new D-2 segment, the act\'s words first on a new act, the segment before a badge that lacks it', () => {
  const mk = (mode, segment, act, rate, night = false) => ({obs: {tick: 100, f: {hz: 50}, sec: {level: 'SECURE'}},
    mode: {mode, rate, watchS: -1, segment, act, night}, alarms: {tiles: []}, tray: {cards: []}});
  const L = createLive();
  let t = 0;
  const say = v => liveFrame(L, v, t += LIVE_GAP_MS);
  assert.equal(say(mk('CRUISE', 'MIDDAY SOLAR', 2, 300)), null, 'the first frame only takes note');
  assert.equal(say(mk('CRUISE', 'MIDDAY SOLAR', 2, 300)), null, 'nothing new');
  assert.equal(say(mk('CRUISE', 'EVENING RAMP', 3, 240)), 'Act III, neck and peak: the sun sets as demand peaks. EVENING RAMP 240×');
  assert.equal(say(mk('CRUISE', 'PEAK', 3, 150)), 'PEAK 150×');
  assert.equal(say(mk('FAST', 'PEAK', 3, 450)), 'FAST 450×', 'a mode alone: its badge');
  assert.equal(say(mk('FAST', 'PEAK EASING', 3, 900)), 'PEAK EASING, FAST 900×');
  assert.equal(say(mk('WATCH', 'PEAK EASING', 3, 0.15)), 'WATCH');
  assert.equal(say(mk('WATCH', 'PEAK EASING', 3, 1)), null, 'the watch is said once');
  assert.equal(say(mk('NIGHT', 'NIGHT ROLL', 4, 2100, true)), 'The night roll: the night shift runs the grid to 04:00. NIGHT ROLL 2,100×');
});

test('§32.11: a toast lives max(3 s, 0.3 s a word): the briefing\'s answer and the night lock\'s stay up long enough to read', () => {
  const clock = {t: 1000}, b = boot(20261005, clock), toast = b.$('toast');
  const shownAt = ms => { clock.t = ms; b.h.frame(1 / 60); return !toast.hidden; };
  const life = () => Math.max(TOAST_MS, TOAST_WORD_MS * toast.textContent.split(/\s+/).length);
  b.h.actions.ui({do: 'pause'});   // the briefing's answer to Space (blue)
  assert.equal(toast.textContent, 'Take the desk first: Enter. Then Space runs the clock.');
  let ms = life();
  assert.equal(ms, 3000, '10 words: the 3-s floor');
  assert.deepEqual([shownAt(1000 + ms - 50), shownAt(1000 + ms + 50)], [true, false]);
  b.$('btn-take').click();
  b.game.director.paused = true; b.game.state.control.nightShift = true;   // (the night shift's desk, the clock held)
  clock.t = 10000;
  b.h.actions.input({type: 'tie', mw: 0});
  assert.deepEqual([toast.className, toast.textContent], ['info', NIGHT_LOCK]);
  ms = life();
  assert.ok(ms === 300 * NIGHT_LOCK.split(' ').length && ms > 6000, ms + ' ms: 0.3 s a word');
  assert.deepEqual([shownAt(10000 + ms - 50), shownAt(10000 + ms + 50)], [true, false]);
  assert.deepEqual(b.h.mods.errors, []);
});

test('Q-73: the end card is fetched when the night shift takes the desk (hidden), so 04:00 shows it on its first frame; a classic night fetches nothing early', async () => {
  const boot2 = (seed, scenario) => {
    let loads = 0;
    const doc = makeDocument(NEXT), h = bootGame(doc, {search: '?seed=' + seed, scenario, storage: null, audioWin: {}, raf: false, now: () => 0,
      endCard: () => { loads++; return Promise.resolve(endCard); }});
    doc.getElementById('btn-take').click();
    h.game.director.paused = true;   // (the clock held: the frames below run no tick)
    h.frame(1 / 60);
    return {h, st: h.game.state, $: id => doc.getElementById(id), loads: () => loads};
  };
  const b = boot2(20261005, G.scenarioForSeed);
  assert.equal(b.loads(), 0, 'nothing before 21:00');
  b.st.control.nightShift = true;   // (the sim's flag from 21:00)
  b.h.frame(1 / 60);
  await new Promise(r => setTimeout(r, 0));   // (the page's import() is asynchronous)
  b.h.frame(1 / 60);
  assert.deepEqual([b.loads(), b.$('end-card').hidden], [1, true], 'fetched at the flip, still hidden');
  b.st.over = true;
  b.h.frame(1 / 60);
  assert.deepEqual([b.loads(), b.$('end-card').hidden, b.$('end-card').firstElementChild.textContent], [1, false, 'Day over: 04:00.'], 'shown on the frame the day ends');
  const c = boot2(4, CLASSIC);
  c.st.tick = (NIGHT_S + 3600) * V.TICKS_PER_S;   // (22:00 on a day with no night shift)
  c.h.frame(1 / 60);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(c.loads(), 0, 'classic: no night shift, no early fetch');
  assert.deepEqual([b.h.mods.errors, c.h.mods.errors], [[], []]);
});

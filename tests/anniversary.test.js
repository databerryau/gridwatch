// W6, D-29 (Q-103): the anniversary dailies. On 14 Dec (Loy Yang A3, 2017), 13 Feb (the Moorabool towers, 2024) and 25 May
// (Callide C, 2021) the daily plays a variant of its date's desk scenario, shaped by the incident through the event director's
// plan (sim/dayplan.js, dayplan.incident), gated by D-9 like any daily, with an account as the briefing's first box. The desk
// scenarios (and so dailyStamp and every other date's daily) are untouched; each variant is held to the hash its date was gated
// under (content/anniversaries.js GATED). Pre-roll and the page's briefing and end card only: no day is stepped through.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as G from '../app/game.js';
import * as SH from '../app/share.js';
import {weekAhead, outlookWord} from '../app/week.js';
import {dayText, dayPlan} from '../app/shell.js';
import {createState, observe, scenarioHash} from '../sim/step.js';
import {preroll, prerollRegime} from '../sim/dayplan.js';
import {V} from '../sim/params.js';
import {ANNIVERSARIES, GATED, anniversaryOf} from '../content/anniversaries.js';
import {DAILIES, ANNIVERSARY_KEYS, dailyFor, seedOf, scenarioIdOf, dailyScenarioIdOf} from '../content/dailies.js';
import {SCENARIOS, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {openGame} from './lib/play.js';

const DG = createRequire(import.meta.url)('../tools/daily-gen.js');
const STAMP = G.dailyStamp(), DAYS = [20261214, 20270213, 20270525];
const ymdIn = s => +s.replace(/-/g, ''), local = ymd => new Date(Math.floor(ymd / 1e4), Math.floor(ymd / 100) % 100 - 1, ymd % 100, 8);
const words = s => s.trim().split(/\s+/).filter(Boolean).length;
const toS = h => Math.round((h - V.DAY_START_H) * V.S_PER_H);
// A date's listed daily: its seed, its scenario (the variant) and its state at 04:00
const daily = ymd => { const d = dailyFor(ymd, STAMP), scn = G.scenarioForSeed(d.seed); return {d, scn, st: createState(d.seed, scn)}; };
const PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};

test('D-29: three dates in the calendar, each the variant of its desk scenario on every attempt; the dates around them are the desk\'s', () => {
  assert.deepEqual(Object.keys(ANNIVERSARIES).map(Number), DAYS);
  assert.deepEqual(Object.keys(ANNIVERSARY_KEYS).map(Number), DAYS, 'content/dailies.js keys the same dates');
  for (const ymd of DAYS) {
    assert.ok(ymd >= ymdIn(DAILIES.from) && ymd <= ymdIn(DAILIES.to), ymd + ' inside the dailies\' calendar');
    const base = SCENARIOS[scenarioIdOf(ymd)], v = SCENARIOS[dailyScenarioIdOf(ymd)];
    assert.equal(v.id, base.id + '-' + ANNIVERSARY_KEYS[ymd]);
    assert.ok(v.dayplan.incident, ymd + ': the variant carries its incident');
    for (const k of [0, 1, 11, 40]) assert.equal(G.scenarioForSeed(seedOf(ymd, k)), v, ymd + ' attempt ' + k);
    assert.equal(dailyFor(ymd, STAMP).scenarioId, v.id, 'the daily names it (the week ahead reads it)');
    // the overrides shape the day; the city, its rooftop and the fleet's units are the desk's own
    assert.equal(v.city, base.city);
    assert.equal(v.rooftop, base.rooftop);
    assert.deepEqual(v.commitment.units, base.commitment.units);
    for (const x of [ymd - 1, ymd + 1]) assert.equal(G.scenarioForSeed(x), SCENARIOS[scenarioIdOf(x)], x + ': no anniversary');
  }
  assert.equal(DESK.dayplan.incident, undefined, 'no desk scenario has an incident: no other day\'s plan changes');
  assert.equal(DESK_WEEKEND.dayplan.incident, undefined);
  assert.equal(DAILIES.v, STAMP, 'the stamp hashes the desk scenarios only: every daily stays gated');
});

test('D-29: each variant is the one its date was gated under (GATED: the variant\'s scenarioHash, this build\'s stamp)', () => {
  assert.equal(GATED.v, STAMP, 'gated under another build: run tools/daily-gen.js --dates');
  assert.deepEqual(Object.keys(GATED.hashes).map(Number), DAYS);
  for (const ymd of DAYS) {
    assert.equal(scenarioHash(SCENARIOS[dailyScenarioIdOf(ymd)]), GATED.hashes[ymd],
      ymd + ': the variant changed since its date was gated: run tools/daily-gen.js --dates ' + ymd + ', then tools/ladder.mjs for it');
  }
  // tools/daily-gen.js writes the line back as it reads
  const src = readFileSync(new URL('../content/anniversaries.js', import.meta.url), 'utf8'), g = {v: 'stamp', hashes: {20261214: 5, 20270213: 7}};
  const text = DG.writeGated(src, g);
  assert.equal(text.replace(/^export const GATED = .*$/m, ''), src.replace(/^export const GATED = .*$/m, ''), 'the rest of the file is kept');
  assert.match(text, /^export const GATED = \{v: 'stamp', hashes: \{20261214: 5, 20270213: 7\}\};$/m);
});

test('D-29: each gated daily holds its incident, unwarned, as designed; an attempt without it is no anniversary to the gate', () => {
  const kinds = st => st.ext.events.filter(e => e.act === 2 && e.contingency).map(e => e.type);
  // Loy Yang A3: a hot, settled weekday; the largest machine trips before dawn, the battery's GUARD armed since 04:00
  let {d, st} = daily(20261214), inc = st.ext.events.filter(e => e.incident);
  assert.ok(d.gated);
  assert.deepEqual([st.ext.regime.temp, st.ext.regime.cls], ['HOT', 'calm']);
  assert.deepEqual(inc.map(e => [e.act, e.type, e.args.rule, e.warned]), [[1, 'unitTrip', 'largest', false]]);
  assert.ok(inc[0].atS >= toS(5.25) && inc[0].atS <= toS(6) && inc[0].atS < toS(st.scn.sun.riseH), 'before dawn');
  assert.equal(st.battery.guardMW, 200);
  assert.deepEqual(kinds(st), [], 'the belly\'s crisis is a front: no trip keeps the dawn trip 90 real s away');
  assert.equal(DG.hasIncident(st), true);
  // The Moorabool towers: a hot Saturday with a storm; while it blows, the tie is limited to 400 MW and the largest machine trips
  ({d, st} = daily(20270213));
  inc = st.ext.events.filter(e => e.incident);
  const at = st.ext.events.find(e => e.type === 'stormArrive').atS, pass = st.ext.events.find(e => e.type === 'stormPass').atS;
  assert.ok(d.gated && st.day.weekend);
  assert.deepEqual([st.ext.regime.temp, st.ext.regime.cls], ['HOT', 'storm']);
  assert.deepEqual(inc.map(e => [e.type, e.args]), [['tieDerate', {limitMW: 400, untilS: V.DAY_S}], ['unitTrip', {rule: 'largest', lockoutS: inc[1].args.lockoutS}]]);
  assert.ok(inc[0].atS === inc[1].atS && inc[0].atS > at && inc[0].atS < pass && inc.every(e => !e.warned), 'together, in the storm');
  assert.ok(!st.ext.events.some(e => e.type === 'linkTrip'), 'the towers stand for the storm\'s link trip');
  assert.deepEqual(kinds(st), []);
  // Callide C: a mild weekday; the evening's trip of the largest machine takes the next largest with it five minutes later
  ({d, st} = daily(20270525));
  const trips = st.ext.events.filter(e => e.act === 3 && e.type === 'unitTrip');
  assert.ok(d.gated);
  assert.deepEqual([st.ext.regime.temp, st.ext.regime.cls], ['MILD', 'calm']);
  assert.deepEqual(trips.map(e => [!!e.incident, e.args.rule, e.warned]), [[false, 'largest', false], [true, 'largest', false]]);
  assert.equal(trips[1].atS - trips[0].atS, 300);
  // the gate's check: a variant's plan without its incident is not played
  const bare = Object.assign({}, st, {ext: Object.assign({}, st.ext, {events: st.ext.events.filter(e => !e.incident)})});
  assert.equal(DG.hasIncident(bare), false);
  assert.equal(DG.hasIncident(createState(20261215, DESK)), true, 'any other day');
});

test('D-29: the incident draws from its own slot: the rest of the plan is the date\'s own (the late return aside: it keeps one action from it)', () => {
  const rest = evs => evs.filter(e => !e.incident && e.type !== 'unitOutage' && e.type !== 'unitReturn').map(e => [e.atS, e.type, JSON.stringify(e.args)]);
  for (const ymd of DAYS) {
    const {d, scn} = daily(ymd), regime = prerollRegime(d.seed, scn), none = Object.assign({}, scn, {dayplan: Object.assign({}, scn.dayplan, {incident: undefined})});
    assert.deepEqual(rest(preroll(d.seed, scn, regime)), rest(preroll(d.seed, none, regime)), String(ymd));
  }
});

test('D-29: the briefing: ON THIS DAY and the sourced account (60 words at most) as its first box; the title names the day; TAKE THE DESK is still the one click', () => {
  for (const ymd of DAYS) {
    const a = anniversaryOf(ymd), p = openGame({seed: daily(ymd).d.seed, run: false, take: false, date: local(ymd)});
    const card = p.$('briefing-card'), acc = p.$('briefing-account'), src = p.$('briefing-account-source');
    assert.equal(card.firstElementChild, acc, 'the first box');
    assert.equal(acc.hidden, false);
    assert.equal(p.$('briefing-account-text').textContent, a.account);
    assert.match(acc.textContent, /^ON THIS DAY/);
    assert.ok(words(acc.textContent) <= 60, ymd + ': ' + words(acc.textContent) + ' words');
    assert.equal(src.textContent, 'Source: ' + a.sourceName);
    assert.match(src.href, a.sourceName === 'AEMO' ? /^https:\/\/(www\.)?aemo\.com\.au\/.+\.pdf$/ : /^https:\/\/wattclarity\.com\.au\//);
    assert.equal(p.$('briefing-title').textContent, 'Daily #' + SH.puzzleNumber(ymd) + ' · ' + a.name + ', ' + a.year + ' · PRACTICE', 'no storage: history off');
    assert.deepEqual(card.querySelectorAll('button').filter(b => !b.hidden).map(b => b.id), ['btn-agc', 'btn-take']);
  }
  const p = openGame({seed: 20261215, run: false, take: false, date: local(20261215)});
  assert.equal(p.$('briefing-account').hidden, true, 'a plain daily has none');
  assert.equal(p.$('briefing-title').textContent, 'Daily #65 · PRACTICE');
});

test('D-29: the week ahead and the briefing say the variant\'s day (the towers: storm, where the desk scenario draws low wind)', () => {
  const w = weekAhead(20261210, STAMP).concat(weekAhead(20270210, STAMP), weekAhead(20270520, STAMP)), word = ymd => w.find(x => x.ymd === ymd).word;
  assert.deepEqual(DAYS.map(word), ['hot', 'storm', 'mild']);
  const {d, scn, st} = daily(20270213);
  assert.equal(outlookWord(d.seed, scn), 'storm');
  assert.equal(outlookWord(d.seed, DESK_WEEKEND), 'low wind', 'the desk scenario would draw another day: the variant is the one passed');
  assert.equal(dayText(st.day, dayPlan(st, observe(st))), 'Today: a hot weekend, one coal unit off, no heatwave forecast. Storms likely later.');
});

test('D-29: the share card carries ANNIVERSARY (the lint allows it), first of the tags; a plain daily\'s does not', () => {
  const p = openGame({seed: daily(20270525).d.seed, run: false, par: PAR, date: local(20270525)});
  p.game.state.over = true;
  p.frames(2);
  const s = p.game.end.share;
  assert.match(s.lines[0], /^GRIDWATCH #226 · Tue 25 May · \d+ [A-F]( ★)?( · PERFECT)? · ANNIVERSARY · FIRST SHIFT · PRACTICE$/);
  assert.deepEqual(SH.lintCard(s.text), []);
  assert.equal(G.anniversaryFor(G.createGame({seed: 20270525, scenario: DESK, storage: null})), null, 'the date on another scenario is no anniversary');
  assert.equal(G.anniversaryFor(G.createGame({seed: 20261016, scenario: G.scenarioForSeed, storage: null})), null);
});

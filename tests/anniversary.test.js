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
import {LADDER} from '../content/ladder.js';
import {TEXT} from '../content/text.js';
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

test('D-29: each anniversary\'s ladder row (F-8\'s stored par) is held to the seed and variant it was made from; a row made from another is not used', () => {
  // the stamp hashes the desk scenarios only: a variant changed and re-gated leaves LADDER.v current, so its row says what it was made from
  assert.deepEqual(LADDER.anniv, Object.fromEntries(DAYS.map(ymd => [ymd, {seed: dailyFor(ymd, STAMP).seed, hash: GATED.hashes[ymd]}])),
    'a date re-gated since its ladder row was made: run tools/ladder.mjs --from D --to D for it');
  for (const ymd of DAYS) {
    const game = G.createGame({daily: dailyFor(ymd, STAMP), scenario: G.scenarioForSeed, storage: null, par: false}), row = LADDER.rows[ymd];
    assert.deepEqual(G.storedPar(game), {total: row[0], shedMWh: row[1]});
    for (const made of [{seed: game.seed, hash: GATED.hashes[ymd] + 1}, {seed: game.seed + 1e8, hash: GATED.hashes[ymd]}, undefined]) {
      const stale = Object.assign({}, LADDER, {anniv: Object.assign({}, LADDER.anniv, {[ymd]: made})});
      assert.equal(G.storedPar(game, stale), null, ymd + ', a row made from ' + JSON.stringify(made) + ': the page\'s own par grades');
      assert.equal(G.ladderFor(game, {points: 900}, stale), null, 'and no ladder');
    }
  }
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

test('D-29: the help behind the tray\'s "?" says where each anniversary breaks the designed day\'s rules (Event-dense day; Warning leads)', () => {
  const ours = id => TEXT.abstractions.find(e => e.id === id).ours, dense = ours('event-dense-day');
  // the rules, then the exceptions (the plans above hold them: before 09:00; a third unwarned trip 5 grid-minutes on; an unannounced limit)
  assert.ok(dense.includes('At most two unwarned trips a day, none before 09:00 or from 21:00, at least 90 real s and 60 grid-minutes apart. ' +
    'The anniversary dailies keep their real incident instead: 14 Dec (Loy Yang A3, 2017), the largest unit trips between 05:15 and 06:00; ' +
    '13 Feb (Moorabool towers, 2024), in the storm the tie is limited to 400 MW, unannounced, as the largest unit trips; ' +
    '25 May (Callide C, 2021), Act III\'s unwarned trip takes the next largest unit with it 5 grid-minutes later.'), dense);
  assert.ok(ours('warning-leads').includes('announced at 04:00, before the clock runs. On 13 Feb (Moorabool towers, 2024), the storm limits ' +
    'the tie with no notice (Event-dense day). Trips are never warned.'), ours('warning-leads'));
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
    assert.equal(p.$('briefing-account-echo').textContent, a.echo, 'what of it today\'s desk echoes');
    // Loy Yang's GUARD comes armed from the night shift: Watch for says so (no other day hands one over)
    assert.equal(p.$('briefing-watch').textContent.includes('; the night shift\'s battery GUARD at 200 MW.'), ymd === 20261214, p.$('briefing-watch').textContent);
    assert.match(acc.textContent, /^ON THIS DAY/);
    // (counted from the parts: the stand-in DOM's textContent runs the boxes' words together, "DAYOn")
    const box = words(['ON THIS DAY', a.account, a.echo, src.textContent].join(' '));
    assert.ok(words(a.account) <= 60 && box <= 65, ymd + ': the account ' + words(a.account) + ' words, the box ' + box);
    assert.equal(src.textContent, 'Source: ' + a.sourceName);
    assert.match(src.href, a.sourceName === 'AEMO' ? /^https:\/\/(www\.)?aemo\.com\.au\/.+\.pdf$/ : /^https:\/\/wattclarity\.com\.au\//);
    assert.equal(p.$('briefing-title').textContent, 'Daily #' + SH.puzzleNumber(ymd) + ' · ' + a.name + ', ' + a.year + ' · PRACTICE', 'no storage: history off');
    assert.deepEqual(card.querySelectorAll('button').filter(b => !b.hidden).map(b => b.id), ['btn-agc', 'btn-take']);
  }
  const p = openGame({seed: 20261215, run: false, take: false, date: local(20261215)});
  assert.equal(p.$('briefing-account').hidden, true, 'a plain daily has none');
  assert.equal(p.$('briefing-title').textContent, 'Daily #65 · PRACTICE');
  assert.doesNotMatch(p.$('briefing-watch').textContent, /GUARD/);
});

test('D-29: Loy Yang\'s dawn trip: the battery catches most of it (the echo: "not the catch"); the GUARD is named the night shift\'s until the player sets the ring', () => {
  assert.match(anniversaryOf(20261214).echo, /not the catch/);
  const seed = daily(20261214).d.seed, battery = ({vm}) => !!vm.watch && vm.watch.beat === 'battery';
  // as handed over: the watch, the respond card and the moment name the night shift's GUARD, never YOURS
  let p = openGame({seed, date: local(20261214)});
  p.until('trip');
  p.until(battery, {vm: true, max: '+5m'});
  assert.equal(p.$('beat-caption').textContent, 'THE NIGHT SHIFT\'S GUARD: 200 MW. The battery answers within a second.');
  p.until('card');
  const c = p.game.state.conts[0];
  assert.ok(c.caught.batteryMW + c.caught.guardMW > c.lostMW / 2, 'the battery catches most of the trip, as 2017\'s could not');
  assert.match(p.$('respond-card').textContent, /Caught by: spin → battery \d+ MW \(the night shift's GUARD 200\) → governors/);
  p.game.state.over = true;
  p.frames(2);
  assert.match(p.game.end.verdict.moment.text.join(' '), /Caught by .*the night shift's GUARD 200 MW, the battery/);
  assert.doesNotMatch([p.game.end.verdict.moment.text.join(' '), p.$('respond-card').textContent].join(' '), /your GUARD/i);
  // set by the player (the ring turned up a step): it is YOUR GUARD from then
  p = openGame({seed, date: local(20261214)});
  p.send({type: 'guard', mw: 300});
  p.until('trip');
  p.until(battery, {vm: true, max: '+5m'});
  assert.equal(p.$('beat-caption').textContent, 'YOUR GUARD: 300 MW. The battery answers within a second.');
  p.until('card');
  assert.match(p.$('respond-card').textContent, /\(your GUARD 300\)/);
  p.game.state.over = true;
  p.frames(2);
  assert.match(p.game.end.verdict.moment.text.join(' '), /Caught by .*YOUR GUARD 300 MW, the battery/);
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

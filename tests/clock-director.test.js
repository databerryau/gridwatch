// Slice 2c's clock on the page's side (desk/README.md §32.7.2; Q-62-Q-64, Q-73, Q-78, Q-91): the
// rate director plays the D-2 profile (sim/clock.js), a feeder card at each hand-back, OFFER while a
// scope offer waits, NIGHT from the night shift, FAST refused and released, the badge, the line's
// cadence and reading lead, the briefing's AGC/HAND as the sim's mode, the two locks (one blue
// answer), and D-6's and D-4's accepts on a 2-h slice of a desk day with the system, the planview
// and the view model. The whole-day profile runs on a fake state (only what the director reads):
// app/loop.js runFrame and rateOf, no sim.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {hashState} from '../sim/step.js';
import {realBetween, rateAt, gridAfter, NIGHT_S} from '../sim/clock.js';
import {SCENARIOS} from '../content/scenarios.js';
import * as D from '../app/director.js';
import * as G from '../app/game.js';
import * as T from '../app/tray.js';
import * as system from '../app/system.js';
import * as planview from '../app/planview.js';
import {createPacer, runFrame} from '../app/loop.js';
import {badgeText, badgeTitle, BADGE_HELP} from '../render/format.js';
import {injectTrip} from './lib/sim-helpers.js';
import {openGame, dueSpans} from './lib/play.js';

const TPS = V.TICKS_PER_S, START = V.PLAYER_START_S, H = 3600, NIGHT_T = NIGHT_S * TPS;
const CLEARS = [9900, 11700]; // 06:45 and 07:15: two hand-backs on the morning ramp (270x)

// A fake state: only what the director reads.
const fake = (o = {}) => ({tick: (o.s ?? START) * TPS, over: false, contIdx: -1, conts: [], scope: {unit: ''}, units: o.units || [],
  control: {handFlown: !!o.hand, mode: o.hand ? 'HAND' : 'AGC', nightShift: !!o.nightShift}, scn: {night: o.night ?? true},
  city: {districts: (o.clears || []).map((c, i) => ({id: 'T' + i, clearS: c, dark: true, shedBy: 'task', restoredAtS: -1}))}});
const director = seen => D.createDirector({game: true, paused: false, seen});
const trip = (st, n = 0) => { st.conts.push({n, startTick: st.tick, watchEndTick: st.tick + V.WATCH_S * TPS, backInBandTick: -1, rocofHzS: -0.3, uflsStages: 0}); st.contIdx = st.conts.length - 1; };
const mode = (d, st) => D.modeOf(d, st).mode;
const lines = (look, re) => look.split('\n').filter(l => re.test(l));

// From st's tick to `end` (default 04:00) through the page's loop at `hz` frames a real second: the real
// seconds it took (the last frame may run past the end: within one frame). `each()` before every frame (a card's answer).
function day(st, d, hz, each, end = V.DAY_TICKS) {
  const p = createPacer(), h = {rate: () => D.rateOf(d, st), tick: () => { st.tick++; }};
  let frames = 0;
  while (st.tick < end) { if (each) each(); runFrame(p, 1 / hz, h); frames++; }
  return frames / hz;
}

test('Q-62, Q-63: CRUISE plays the D-2 profile: 04:30 to 04:00 takes 245 real s at 60 and at 144 Hz, the night roll included; HAND 478', () => {
  for (const hz of [60, 144]) {
    const r = day(fake(), director(), hz);
    assert.ok(Math.abs(r - 245) <= 3 && Math.abs(r - realBetween(START, V.DAY_S)) < 0.05, hz + ' Hz: ' + r.toFixed(3) + ' real s');
  }
  const hand = day(fake({hand: true}), director(), 60);
  assert.ok(Math.abs(hand - 478) <= 3 && Math.abs(hand - realBetween(START, V.DAY_S, true)) < 0.05, 'HAND: ' + hand.toFixed(3) + ' real s');
});

test('Q-91: a hand-back holds the clock (FEEDER-CARD, rate 0, no FAST) until its feeder is restored, Esc or another input; after a watch and its card; none from 21:00; each card held 3 real s adds just that to the profile', () => {
  // 06:40 to 07:20 through the page's loop: each card held 180 frames (3 real s at 60 Hz), then answered as another input does
  let held = 0;
  const a = CLEARS[0] - 300, b = CLEARS[1] + 300, st0 = fake({clears: CLEARS, s: a}), d0 = director();
  const r = day(st0, d0, 60, () => { const id = D.feederCard(d0, st0); if (id && ++held % 180 === 0) D.answerFeeder(d0, st0, id, false); }, b * TPS);
  assert.ok(held === 360 && Math.abs(r - realBetween(a, b) - 6) < 0.05, held + ' held frames: ' + r.toFixed(3) + ' real s');
  // the card, second by second
  const st = fake({clears: CLEARS, s: CLEARS[0] - 1}), d = director(), at = s => { st.tick = s * TPS; return D.modeOf(d, st); };
  assert.equal(at(CLEARS[0] - 1).mode, 'CRUISE');
  assert.deepEqual([at(CLEARS[0]).mode, D.rateOf(d, st), badgeText(D.modeOf(d, st)), D.feederCard(d, st)], ['FEEDER-CARD', 0, 'HELD 0× · R restore · Esc on', 'T0']);
  assert.equal(D.setFast(d, st, true), false, 'no FAST at the card');
  st.scope.unit = 'gta1';
  assert.equal(mode(d, st), 'FEEDER-CARD', 'it holds over FOCUS, as the respond card');
  st.scope.unit = '';
  assert.equal(at(CLEARS[0] + 600).mode, 'FEEDER-CARD', 'a hold, not a pace: still there 10 grid-min on (no frame runs it)');
  // restored: gone, FOCUS for the breaker
  Object.assign(st.city.districts[0], {dark: false, restoredAtS: CLEARS[0] + 1});
  D.focusRestore(d, st);
  assert.deepEqual([mode(d, st), D.feederCard(d, st), D.answerFeeder(d, st, 'T0', true)], ['FOCUS', '', false]);
  // T1 back 07:15: Esc leaves it for good, even when a restore moves its allowed second (07:16:00 + 5 min)
  assert.deepEqual([at(CLEARS[1]).mode, D.feederCard(d, st)], ['FEEDER-CARD', 'T1']);
  assert.equal(D.answerFeeder(d, st, 'T1', true), true);
  assert.equal(mode(d, st), 'CRUISE');
  st.city.districts.push({id: 'X', clearS: -1, dark: false, shedBy: '', restoredAtS: CLEARS[1] + 60});
  assert.equal(at(CLEARS[1] + 360).mode, 'CRUISE', 'left by Esc: not held again');
  // answered by another input, it holds again at a later allowed second (a restore moved it)
  const e = director(), s2 = fake({clears: [CLEARS[0]], s: CLEARS[0]});
  assert.equal(D.answerFeeder(e, s2, 'T0', false), true);
  assert.equal(mode(e, s2), 'CRUISE');
  s2.city.districts.push({id: 'X', clearS: -1, dark: false, shedBy: '', restoredAtS: CLEARS[0] + 60});
  s2.tick = (CLEARS[0] + 359) * TPS;
  assert.equal(mode(e, s2), 'CRUISE');
  s2.tick += TPS;
  assert.deepEqual([mode(e, s2), D.feederCard(e, s2)], ['FEEDER-CARD', 'T0'], 'its new allowed second (X closed + 5 min)');
  // queued: a trip whose watch covers the allowed second; then the respond card; then the feeder card
  const q = fake({clears: [CLEARS[0]], s: CLEARS[0] - 10}), f = director({watch: true});
  trip(q);
  q.tick = (CLEARS[0] + 5) * TPS;
  assert.deepEqual([mode(f, q), D.feederCard(f, q)], ['WATCH', '']);
  q.tick = q.conts[0].watchEndTick;
  assert.deepEqual([mode(f, q), D.feederCard(f, q), D.answerFeeder(f, q, 'T0', false)], ['RESPOND-CARD', '', false]);
  D.dismissCard(f, q);
  assert.deepEqual([mode(f, q), D.feederCard(f, q)], ['FEEDER-CARD', 'T0'], 'after the respond card');
  // none from 21:00
  const n = fake({clears: [NIGHT_S + 60], s: NIGHT_S + 60});
  n.control.nightShift = true;
  assert.deepEqual([mode(director(), n), D.feederCard(director(), n)], ['NIGHT', '']);
});

test('Q-91: tests/lib/play.js dueSpans holds every feeder card the director shows, one per feeder per allowed second, re-armed by a later restore of any district (the second feeder closed first)', () => {
  // T0 back 06:45 and never closed; T1 back 07:15 and closed at 07:16:00.4; a UFLS district X closed at 07:40:00.2;
  // each card answered by another input the moment it shows
  const st = fake({clears: CLEARS, s: START}), d = director(), ds = st.city.districts;
  ds.push({id: 'X', clearS: -1, dark: true, shedBy: 'ufls', restoredAtS: -1});
  const rs = [{t: CLEARS[1] + 60.4, id: 'T1'}, {t: 3 * H + 40 * 60 + 0.2, id: 'X'}];
  const spans = dueSpans(ds, rs), shown = [];
  for (let k = 0, t = START * TPS; t < 5 * H * TPS; t += 10) {                          // every 0.2 grid-s
    for (; k < rs.length && rs[k].t * TPS <= t; k++) Object.assign(ds.find(x => x.id === rs[k].id), {dark: false, restoredAtS: Math.floor(rs[k].t)});
    st.tick = t;
    const id = D.feederCard(d, st);
    if (id) { shown.push([id, t / TPS]); D.answerFeeder(d, st, id, false); }
  }
  assert.deepEqual(shown, [['T0', CLEARS[0]], ['T1', CLEARS[1]], ['T0', CLEARS[1] + 60 + 300], ['T0', 3 * H + 45 * 60]]);
  for (const [id, s] of shown) assert.ok(spans.some(x => x.id === id && s >= x.a && s <= x.b), id + ' at ' + s + ' is due');
  assert.deepEqual(spans.map(x => [x.id, x.a, x.b]), [
    ['T0', CLEARS[0], CLEARS[1] + 60.4],                                // 06:45, to T1's restore
    ['T0', CLEARS[1] + 60 + 300, 3 * H + 40 * 60 + 0.2],                // re-armed by T1's restore: 07:21, to X's
    ['T0', 3 * H + 45 * 60, Infinity],                                  // and by X's: 07:45
    ['T1', CLEARS[1], CLEARS[1] + 60.4]]);                              // T1's own, to its restore
});

test('Q-63: FAST is 3 x the profile, refused in WATCH, the cards, RESPOND, FOCUS, ALARMS, OFFER and NIGHT; a ringing tray card ends it (MSL2 does, MSL1 does not)', () => {
  const s = 7 * H, st = fake({s}), d = director({watch: true});           // 11:00, MIDDAY SOLAR
  assert.equal(D.setFast(d, st, true), true);
  assert.deepEqual([mode(d, st), D.modeOf(d, st).rate, D.rateOf(d, st)], ['FAST', 900, 3 * rateAt(s)]);
  const refused = (name, poke) => {
    const x = fake({s}), e = director({watch: true});
    poke(x, e);
    assert.equal(mode(e, x), name);
    assert.equal(D.setFast(e, x, true), false, 'refused in ' + name);
  };
  refused('ALARMS', (x, e) => { e.held = true; });
  refused('FOCUS', x => { x.scope.unit = 'gta1'; });
  refused('WATCH', x => trip(x));
  refused('RESPOND-CARD', x => { trip(x); x.tick = x.conts[0].watchEndTick; });
  refused('RESPOND', (x, e) => { trip(x); x.tick = x.conts[0].watchEndTick; D.dismissCard(e, x); });
  refused('FEEDER-CARD', x => { x.city.districts.push({id: 'T', clearS: s, dark: true, shedBy: 'task', restoredAtS: -1}); });
  refused('OFFER', (x, e) => { x.units.push({id: 'gta1', mode: 'ready'}); D.offerPace(e, x, 'gta1'); });
  refused('NIGHT', x => { x.tick = (NIGHT_S + H) * TPS; x.control.nightShift = true; });
  // FAST held when a feeder card comes: it ends there
  const r = fake({s: CLEARS[0] - 1, clears: CLEARS}), e = director();
  D.setFast(e, r, true);
  r.tick += TPS;
  D.directorFrame(e, r);
  assert.equal(e.fast, false);
  // the game: a card that rings ends FAST (G.handleRecords, the records a step returns); an information card does not
  const game = G.createGame({seed: 3, storage: null});
  G.takeDesk(game);
  const msl = level => ({tick: game.state.tick, kind: 'log', sev: level > 1 ? 'warn' : 'info', code: 'MSL' + level, msg: 'MSL' + level + ' notice',
    level, minMW: 2500, atS: Math.floor(game.state.tick / TPS) + H});
  assert.equal(G.ui(game, {do: 'fast', on: true}), '');
  G.handleRecords(game, [msl(1)], '');
  assert.equal(mode(game.director, game.state), 'FAST', 'MSL1 is information');
  G.handleRecords(game, [msl(2)], '');
  assert.equal(mode(game.director, game.state), 'CRUISE', 'MSL2 rings: FAST released');
});

test('K-12, Q-78: a scope offer plays OFFER (SYNC 30×) while its unit waits at full speed, so its 4 grid-min last 8 real s; the tally (G.tallyOffer): one offer per contingency, tight and peak share one', () => {
  const g = G.createGame({seed: 20261002, scenario: SCENARIOS.desk, storage: null});
  G.takeDesk(g);
  g.director.paused = false;
  assert.equal(G.sendInput(g, {type: 'start', unit: 'gta1'}), '');
  const u = g.state.units.find(x => x.id === 'gta1');
  while (u.mode !== 'ready') G.tickOnce(g);
  const vm = G.buildVm(g, {nowMs: 1000, dtS: 1 / 60});
  const m = D.modeOf(g.director, g.state);
  assert.deepEqual([vm.offers, m.mode, D.rateOf(g.director, g.state), badgeText(m)], [[{unit: 'gta1', why: 'tight'}], 'OFFER', 30, 'SYNC 30×']);
  assert.equal(V.AUTO_SYNC_S / D.OFFER_RATE, 8);
  assert.equal(G.ui(g, {do: 'fast', on: true}), 'not now', 'no FAST past an offer');
  g.state.scope.unit = 'gta1';
  assert.equal(mode(g.director, g.state), 'FOCUS', 'taken: the scope plays 1x');
  g.state.scope.unit = '';
  const end = g.state.tick + V.AUTO_SYNC_S * TPS;
  while (u.mode === 'ready' && g.state.tick < end) G.tickOnce(g);
  assert.deepEqual([u.mode, mode(g.director, g.state)], ['loading', 'CRUISE'], 'auto-sync closed it: the profile again');
  // the rule (pure): two contingencies give two 'respond' offers; 'tight' then 'peak' one; MAX_OFFERS in all
  const tally = {n: 0, extra: 0, contN: -1}, obs = (n, level = 'TIGHT', s = 10 * H) => ({s, inRespond: n >= 0, contingency: {n}, sec: {level}});
  const take = o => { const why = G.offerWhy(o, tally); if (why) G.tallyOffer(tally, why, o); return why; };
  assert.deepEqual([take(obs(0)), take(obs(0)), take(obs(-1, 'SECURE', 13 * H)), take(obs(1))], ['respond', 'tight', '', 'respond']);
  assert.deepEqual([tally, take(obs(2))], [{n: 3, extra: 1, contN: 1}, '']);
  // two offers at once (a 'respond', then a 'tight' a minute later): the later one taken first, OFFER plays on for the earlier one to its own end
  const two = fake({s: 10 * H, units: [{id: 'gta1', mode: 'ready'}, {id: 'gtb1', mode: 'ready'}]}), e = director({watch: true});
  D.offerPace(e, two, 'gta1'); two.tick += 60 * TPS; D.offerPace(e, two, 'gtb1');
  two.units[1].mode = 'loading';
  assert.deepEqual([mode(e, two), D.rateOf(e, two)], ['OFFER', 30], 'GT·B 1 closed: GT·A still waits');
  two.tick += (V.AUTO_SYNC_S - 60) * TPS;
  assert.equal(mode(e, two), 'CRUISE', 'GT·A\'s own window has passed');
});

test('Q-73: NIGHT with the night shift on a night scenario: the profile eased in, no FAST, and no watch, card or RESPOND from it (one begun before 21:00 included); classic keeps its watch', () => {
  const st = fake({s: NIGHT_S - 1}), d = director({watch: true});
  assert.deepEqual([mode(d, st), badgeText(D.modeOf(d, st))], ['CRUISE', 'PEAK EASING 300×']);
  assert.ok(D.rateOf(d, st) > 300 && D.rateOf(d, st) < 2100, 'eased into: ' + D.rateOf(d, st));
  st.tick = NIGHT_T;                                                     // 21:00:00 before the sim steps it: the evening's face
  assert.deepEqual([mode(d, st), badgeText(D.modeOf(d, st)), D.modeOf(d, st).night], ['CRUISE', 'PEAK EASING 300×', false]);
  st.control.nightShift = true;                                          // (the sim's flag, stepping 21:00:00)
  assert.deepEqual([mode(d, st), badgeText(D.modeOf(d, st)), badgeTitle(D.modeOf(d, st))],
    ['NIGHT', 'NIGHT ROLL 2,100×', 'The night roll: the night shift runs the grid to 04:00. ' + BADGE_HELP]);
  st.tick = (NIGHT_S + H) * TPS;
  trip(st);
  const m = D.modeOf(d, st);
  assert.deepEqual([m.mode, m.rate, D.rateOf(d, st), m.locked, m.night], ['NIGHT', 2100, 2100, false, true]);
  st.tick = st.conts[0].watchEndTick + 1;
  assert.deepEqual([mode(d, st), D.respondCardOpen(d, st), D.dismissCard(d, st)], ['NIGHT', false, false], 'no card');
  // a trip 10 grid-s before 21:00: its watch plays, then no card; a card dismissed at 20:58: no RESPOND after the handover
  const late = fake({s: NIGHT_S - 10}), e = director({watch: true});
  trip(late);
  assert.equal(mode(e, late), 'WATCH');
  late.tick = late.conts[0].watchEndTick; late.control.nightShift = true;
  assert.deepEqual([mode(e, late), D.respondCardOpen(e, late)], ['NIGHT', false]);
  const resp = fake({s: NIGHT_S - 150}), f = director({watch: true});
  trip(resp); resp.tick = resp.conts[0].watchEndTick; D.dismissCard(f, resp);
  assert.equal(mode(f, resp), 'RESPOND');
  resp.tick = NIGHT_T + TPS; resp.control.nightShift = true;
  assert.equal(mode(f, resp), 'NIGHT');
  // an offer at 20:59 (its window runs to 21:03): NIGHT from the flip, never SYNC 30x under the lock
  const off = fake({s: NIGHT_S - 60, units: [{id: 'gta1', mode: 'ready'}]}), o = director({watch: true});
  D.offerPace(o, off, 'gta1');
  assert.equal(mode(o, off), 'OFFER');
  off.tick = NIGHT_T + 30 * TPS; off.control.nightShift = true;
  assert.deepEqual([mode(o, off), badgeText(D.modeOf(o, off)), D.rateOf(o, off) > 300], ['NIGHT', 'NIGHT ROLL 2,100×', true]);
  const classic = fake({s: NIGHT_S + H, night: false});
  trip(classic);
  assert.equal(mode(d, classic), 'WATCH', 'classic (night: false) keeps its watch');
  assert.equal(badgeTitle(D.modeOf(d, fake({s: NIGHT_S + 2 * H, night: false}))), 'The night roll: the clock runs on to 04:00. ' + BADGE_HELP, 'classic: no night shift');
});

test('Q-73 on the page: the sim\'s night flip is the one test (badge, mode, lock, obs, the line); a locked press answers once, in blue, with the lock\'s words; F says why', () => {
  const p = openGame({seed: 20261002});
  const st = p.game.state;
  st.evNext = st.ext.events.length; st.tick = NIGHT_T - TPS;             // the day between jumped (the flip reads only the tick)
  while (G.ui(p.game, {do: 'goOn'}) === '');                             // (its feeders' cards, Q-91: gone on from, as the day would have)
  p.to('21:00', {stop: []});
  assert.equal(st.tick, NIGHT_T, 'to(\'21:00\') stops before the sim steps 21:00:00');
  assert.deepEqual([p.mode(), st.control.nightShift, lines(p.look(), /^CLOCK/)[0].split(' | ')[1]], ['CRUISE', false, 'PEAK EASING 300×']);
  assert.equal(G.redispatch(p.game) === G.NIGHT_LOCK, false, 'the desk is still the player\'s');
  p.to('21:00:01', {stop: []});
  assert.deepEqual([p.mode(), st.control.nightShift, lines(p.look(), /^CLOCK/)[0].split(' | ')[1]], ['NIGHT', true, 'NIGHT ROLL 2,100×']);
  assert.match(p.$('rate-badge').title, /^The night roll: the night shift runs the grid to 04:00\. /);
  assert.match(p.pressKey('f', {}, {after: 1 / 60}).during, /^TOAST blue FAST waits: the night shift runs the roll to 04:00$/m);
  // the lock answers in blue with its own words (the shell's toast here; desk's own night note, the same words, once it merges), never in red
  const lock = new RegExp('^(TOAST blue|NOTE blue [^\\n]*?:) ' + G.NIGHT_LOCK.replace(/[.:]/g, '\\$&') + '$', 'm');
  const blue = (look, what) => { assert.match(look, lock, what); assert.doesNotMatch(look, /^NOTE RED/m, what + ': one answer, no red note beside the control'); };
  // (2c shell fix pass: under the hand the night strip stays, saying the lock's words; no line, so none promises what the lock refuses)
  const line = /^LINE /m, strip = 'NIGHT ☾ NIGHT SHIFT ' + G.NIGHT_LOCK + ' ';
  p.click('guard-start-gta1');
  assert.deepEqual([line.test(p.look()), lines(p.look(), /^NIGHT /)[0].startsWith(strip), p.h.vm().armed], [false, true, null], 'no cover to confirm under the lock');
  const s = p.press('guard-start-gta1', {after: 1 / 60});
  blue(s.during, 'START');
  assert.doesNotMatch(s.during, line, 'no line promises what the lock refuses');
  blue(p.press('btn-redispatch', {after: 1 / 60}).during, 'RE-DISPATCH');
  assert.deepEqual([G.sendInput(p.game, {type: 'tie', mw: 100}), G.redispatch(p.game)], [G.NIGHT_LOCK, G.NIGHT_LOCK]);
  // the night shift's own inputs are logged (Q-73: replay holds); none of the player's refused presses is
  assert.ok(!st.log.some(r => (r.type === 'start' && r.args.unit === 'gta1') || (r.type === 'tie' && r.args.mw === 100)), 'no START or tie of the player is logged');
  for (const cmd of [{do: 'pause'}, {do: 'pause'}, {do: 'ack'}, {do: 'volume', volume: 0.5}, {do: 'drawer'}, {do: 'drawer'}]) assert.equal(G.ui(p.game, cmd), '', cmd.do);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-63, Q-78: the badge names the segment and its target, never an ease\'s figure (HAND halved), the act in its title; the line\'s cadence and reading lead follow the profile', () => {
  const st = fake({s: 2 * H}), d = director();                           // 06:00: easing 540x -> 270x
  assert.ok(Math.abs(D.rateOf(d, st) - 360) < 1e-6, 'the loop runs the ease: ' + D.rateOf(d, st));
  assert.deepEqual([D.modeOf(d, st).rate, badgeText(D.modeOf(d, st)), badgeTitle(D.modeOf(d, st))],
    [270, 'MORNING RAMP 270×', 'Act I, the morning ramp: the city wakes and demand climbs. ' + BADGE_HELP]);
  const peak = fake({s: 14 * H, hand: true});                             // 18:00 in HAND
  assert.deepEqual([badgeText(D.modeOf(d, peak)), D.modeOf(d, peak).act], ['PEAK 75×', 3]);
  assert.equal(badgeTitle(D.modeOf(d, fake({s: 6 * H}))), 'Act II, the belly: rooftop solar floods in. ' + BADGE_HELP);
  assert.equal(badgeTitle(D.modeOf(d, fake({s: 0}))), BADGE_HELP, 'the briefing: no act');
  // objectiveDue: max(30 grid-s, 0.4 real s of the profile); 'news' when the watch, a card, RESPOND, NIGHT or OVER comes or goes
  const g = (s, hand = false) => ({objectiveS: s, objectiveMode: 'CRUISE', state: fake({s, hand})});
  assert.deepEqual([G.objectiveDue(g(START), START + 215, 'CRUISE'), G.objectiveDue(g(START), START + 216, 'CRUISE')], [false, true], '540x: 216 grid-s');
  assert.deepEqual([G.objectiveDue(g(14 * H), 14 * H + 59, 'CRUISE'), G.objectiveDue(g(14 * H), 14 * H + 60, 'CRUISE')], [false, true], '150x: 60');
  assert.equal(G.objectiveDue(g(14 * H, true), 14 * H + 30, 'CRUISE'), true, 'HAND 75x: the 30-s floor');
  for (const m of ['FEEDER-CARD', 'NIGHT', 'RESPOND', 'WATCH']) assert.equal(G.objectiveDue(g(START), START + 1, m), 'news', m);
  assert.equal(G.objectiveDue(g(START), START + 1, 'PAUSE'), false, 'Space is not news');
  // the reading lead (ctx.leadS): 13 real s of the profile; on a night scenario never past the handover
  for (const [s, hand] of [[START, false], [START, true], [7 * H, false], [14 * H, true]]) {
    const lead = G.readingLeadS(s, hand, true);
    assert.ok(lead === gridAfter(s, G.LINE_REACT_S, hand) - s && Math.abs(realBetween(s, s + lead, hand) - 13) < 1e-6, s + ' ' + hand);
  }
  assert.deepEqual([G.readingLeadS(NIGHT_S - 600, false, true), G.readingLeadS(NIGHT_S - 600, false, false) > 600], [600, true], '20:50: the night is the night shift\'s');
});

test('Q-64: in the briefing AGC/HAND is the sim\'s mode: the desk\'s key and the card\'s buttons set it, the card draws it, any other sim input (a desk control, RE-DISPATCH, the stack) answers once in blue; the held 04:30 desk is HAND\'s; a new day reads AGC', () => {
  const p = openGame({take: false});
  p.frame();
  const on = id => new RegExp(id + ' "[^"]*" \\[[^\\]]*on');
  const v = p.press('key-agc', {after: 1 / 60});                        // the desk's AGC/HAND key (V focuses it; Enter here takes the desk)
  assert.equal(p.game.state.control.mode, 'HAND');
  assert.match(v.after, on('btn-hand'));
  assert.doesNotMatch(v.after, on('btn-agc'));
  p.click('btn-hand');
  assert.equal(p.game.state.log.length, 1, 'the button already on logs nothing');
  p.click('guard-start-gta1');                                           // the cover up; the second press is the START
  for (const s of [p.press('guard-start-gta1', {after: 1 / 60}), p.press('btn-redispatch', {after: 1 / 60})]) {
    assert.match(s.during, /^TOAST blue Take the desk first: Enter\.$/m);
    assert.doesNotMatch(s.during, /^NOTE RED/m, 'one answer: no red note beside the control');
  }
  const stack = p.$('stack'), msg = [...p.doc.body.walk()].find(e => e.classList.contains('livestack-msg'));
  for (const k of ['1', 'ArrowUp', 'ArrowRight', 'Enter']) stack.dispatch('keydown', {key: k});
  p.frame();
  assert.match(p.look(), /^TOAST blue Take the desk first: Enter\.$/m);
  assert.doesNotMatch(msg.textContent, /Refused/, 'the stack draws no red refusal for it');
  assert.deepEqual(p.game.state.log.map(r => r.type), ['mode'], 'only the mode is logged');
  p.key('Enter');                                                        // TAKE THE DESK: held at 04:30, before the sim steps it
  const st = p.game.state, run = Object.assign({}, p.game.director, {paused: false});
  assert.deepEqual([st.control.handFlown, D.handAt(st), D.rateOf(run, st), D.modeOf(run, st).rate], [false, true, 270, 270], 'the held desk is HAND\'s');
  assert.equal(G.objectiveDue({objectiveS: START, objectiveMode: 'CRUISE', state: st}, START + 108, 'CRUISE'), true, '270x: 108 grid-s');
  assert.match(p.$('rate-badge').title, /^Act I, the morning ramp: /);
  p.key(' ');
  assert.deepEqual([st.control.mode, st.control.handFlown, p.mode()], ['HAND', true, 'CRUISE']);
  assert.match(p.look({controls: false}), /^CLOCK 04:3\d:\d\d \| PRE-DAWN 270× /m, 'HAND halves the profile');
  // a feeder card and OFFER answer F with why (a hand-back moved to now; an offer)
  const x = p.game.state.city.districts.find(q => q.clearS >= 0), clearS = x.clearS;
  x.clearS = Math.floor(p.game.state.tick / TPS);
  assert.match(p.pressKey('f', {}, {after: 1 / 60}).during, /^TOAST blue FAST waits: a repaired feeder holds the clock: R or Enter restores it, Esc goes on$/m);
  x.clearS = clearS;                                                     // (HAND has no auto-synchroniser: the answer is true in both modes)
  assert.equal(p.send({type: 'start', unit: 'gta1'}), '');
  p.until('mode', {max: '+15m'});
  assert.equal(p.mode(), 'OFFER');
  assert.match(p.pressKey('f', {}, {after: 1 / 60}).during, /^TOAST blue FAST waits: a unit is at full speed: O opens its synchroscope \(30× for at most 8 s\)$/m);
  G.resetDay(p.game);
  p.frame();
  assert.match(p.look(), on('btn-agc'), 'a new day: the card reads AGC');
  p.click('btn-hand'); p.click('btn-agc');
  assert.match(p.look(), on('btn-agc'));
  p.key('Enter'); p.key(' ');
  assert.deepEqual([p.game.state.control.mode, p.game.state.control.handFlown], ['AGC', false], 'HAND then AGC: an AGC day, never tagged');
  assert.deepEqual(p.game.state.log.map(r => r.type).slice(0, 2), ['mode', 'mode']);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-81: TAKE THE DESK makes the briefing\'s tray cards with one ring', {skip: T.trayBriefing ? false : 'desk\'s T.trayBriefing lands at the wave-2 merge'}, () => {
  const g = G.createGame({seed: 20261002, scenario: SCENARIOS.desk, storage: null});
  G.takeDesk(g);
  assert.ok(g.tray.cards.length >= 1, g.tray.cards.length + ' cards');
  assert.equal(g.cues.filter(c => c === 'ring2').length, 1);
});

// ------------------------------------------------------------------ D-6 and D-4 on a slice (07:15-08:50)

// Desk 2026-10-02 from 07:15 to 08:50 (§32.2's 2-h slice, cut for the file's 6 s) with the page's
// system (commit 'player') and planview: HAZ4's and HAZ5's feeders handed back at 07:30 and 08:00,
// a cloud warning at 08:25 and a trip injected at 08:40, with the player's inputs through the game's
// actions at fixed ticks (the battery's is followed by the system's re-dispatch). Every frame of a
// played slice builds the view model (the objective, its heldByHand scan, the offers, the alarms);
// the reference runs the ticks alone, with no frame and no view model.
const SEED = 20261002, FROM = 3 * H + 900, TRIP = 4 * H + 2400, NEAR = (TRIP + 600) * TPS, UNTIL = NEAR;
const MID = (TRIP - 300) * TPS;                                         // D-4's stretch: 08:35 to 08:50
const INPUTS = [[(FROM + 300) * TPS, {type: 'guard', mw: 150}], [(12600 + 30) * TPS + 7, {type: 'restore', district: 'HAZ4'}],
  [(4 * H + 20) * TPS + 3, {type: 'restore', district: 'HAZ5'}], [(4 * H + 300) * TPS + 13, {type: 'battery', mode: 'discharge', mw: 100}],
  [(TRIP + 500) * TPS, {type: 'tie', mw: 300}]];
let base = null, mid = null, ref = null;
const BACK = {watch: true, rocof: true, ufls: true};                    // a returning player's compact watch
const mem = () => { const m = new Map(); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m}; };

// A game on the slice from a copy of `from` ({state, sys}): the inputs, and the hashes at NEAR and UNTIL, by beforeTick.
function slice(seen = {}, from = base) {
  const out = {hash: '', near: '', accepted: 0};
  let act = null;
  const game = G.createGame({seed: SEED, scenario: SCENARIOS.desk, storage: mem(), system, planview, commit: 'player', beforeTick: g => {
    const t = g.state.tick;
    for (const [at, x] of INPUTS) if (t === at && act.input(x) === '') out.accepted++;
    if (t === MID && !mid) mid = {state: structuredClone(g.state), sys: structuredClone(g.sys)};
    if (t === NEAR) out.near = hashState(g.state);
    if (t === UNTIL) out.hash = hashState(g.state);
  }});
  act = G.makeActions(game);
  Object.assign(game.director.seen, seen);
  game.state = structuredClone(from.state); game.sys = structuredClone(from.sys);
  G.takeDesk(game);
  out.game = game;
  return out;
}
// Frames until `end`, each followed by the page's view model: `each(game, i)` before each frame; a RESPOND card is dismissed at once,
// and a feeder card (Q-91) gone on from with Esc once shown (the log stays the slice's: its restores come from INPUTS).
function frames(o, dtS, each, end = UNTIL) {
  const game = o.game;
  let nowMs = 1000;
  o.feeders = [];
  for (let i = 0; game.state.tick <= end; i++) {
    assert.ok(i < 2e4, 'the slice plays out');
    if (each) each(game, i);
    G.frame(game, dtS);
    const vm = G.buildVm(game, {nowMs: nowMs += dtS * 1000, dtS});
    if (D.respondCardOpen(game.director, game.state)) G.ui(game, {do: 'dismissRespond'});
    if (vm.feeder && G.ui(game, {do: 'goOn'}) === '') o.feeders.push(vm.feeder.id);
  }
  return o;
}

// The reference: the slice's ticks alone (G.runTo), no frame and no view model.
before(() => {
  const g = G.createGame({seed: SEED, scenario: SCENARIOS.desk, storage: null, system, planview, commit: 'player'});
  G.takeDesk(g);
  injectTrip(g.state, TRIP);
  G.runTo(g, FROM * TPS);
  base = {state: structuredClone(g.state), sys: structuredClone(g.sys)};
  ref = slice();
  G.runTo(ref.game, UNTIL + 1);
});

test('D-6 (1 of 2): one input log ticked alone and played with F held gives one hashState (a slice holding two hand-backs, a warning, a trip and the system\'s re-dispatch)', () => {
  const st = ref.game.state, inSlice = r => r.tick >= FROM * TPS && r.tick <= UNTIL;
  assert.ok(st.conts.length === 1 && st.news.some(n => n.kind === 'cloud' && n.atS > FROM) && ref.accepted === INPUTS.length, 'the slice holds them all');
  assert.ok(st.log.some(r => r.type === 'restore') && st.log.filter(r => r.type === 'planLoad' && inSlice(r)).length >= 1 && ref.hash, 'the system re-dispatched in it');
  // F held (pressed again whenever something released it), the watch played, the card dismissed at once
  let fastFrames = 0;
  const fast = frames(slice(BACK), 1 / 60, g => { if (D.modeOf(g.director, g.state).mode === 'CRUISE') G.ui(g, {do: 'fast', on: true}); if (D.modeOf(g.director, g.state).mode === 'FAST') fastFrames++; });
  assert.ok(fastFrames > 100, fastFrames + ' frames at FAST');
  assert.ok(fast.game.objective && fast.game.sys, 'the line and the system ran');
  assert.deepEqual([fast.hash, fast.accepted], [ref.hash, INPUTS.length]);
  assert.deepEqual(fast.feeders, ['HAZ4', 'HAZ5'], 'each hand-back held the clock on its card');
});

test('D-6 (2 of 2): the same log with 50 seeded random pauses gives the same hashState', () => {
  let seed = 7, left = 50, until = -1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pauses = frames(slice(BACK), 1 / 60, (g, i) => {
    if (until === i) G.ui(g, {do: 'pause'});
    else if (until < i && left > 0 && rnd() < 0.05 && !g.director.paused) { G.ui(g, {do: 'pause'}); left--; until = i + 1 + Math.floor(rnd() * 30); }
  });
  assert.equal(left, 0, 'all 50 pauses taken');
  assert.deepEqual([pauses.hash, pauses.accepted], [ref.hash, INPUTS.length]);
});

test('D-4: the trip\'s watch advances the grid clock by 0.50 min, and the outcome is the same whether it is viewed or skipped (the profile around it)', () => {
  const c = ref.game.state.conts[0];
  assert.equal((c.watchEndTick - c.startTick) / TPS / 60, 0.5);
  const viewed = frames(slice(BACK, mid), 1 / 60, null, NEAR);
  let skips = 0;
  const skipped = frames(slice(BACK, mid), 1 / 60, g => { if (D.modeOf(g.director, g.state).mode === 'WATCH' && G.ui(g, {do: 'skipWatch'}) === '') skips++; }, NEAR);
  assert.equal(skips, 1, 'Esc skipped the one watch');
  assert.deepEqual([viewed.near, skipped.near], [ref.near, ref.near]);
});

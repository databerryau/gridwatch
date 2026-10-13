// Slice 2c stage C, the app's fix pass (desk/README.md §32.10; the integrator's hand-offs): the feeder cards'
// allowed seconds kept per input-log length (app/director.js), the night's READY card (app/tray.js), the night
// lock's words (render/format.js), the HAND chip in tests/lib/play.js look(), a held line's action
// (app/game.js heldLine), the part of the day as a figure in steady() (app/objective.js masked), a unit
// whose minimum down time outlasts its outage (app/objective.js startable, app/planview.js), vm.offers
// after the night flip (app/game.js), and tools/follow.mjs's one-by-one STOP counterfactual. Pure calls,
// 04:00/04:30 states and two boots of the page: each test well under a second.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import {NIGHT_S} from '../sim/clock.js';
import {DESK} from '../content/scenarios.js';
import {TEXT} from '../content/text.js';
import * as D from '../app/director.js';
import * as T from '../app/tray.js';
import * as G from '../app/game.js';
import * as O from '../app/objective.js';
import * as SYS from '../app/system.js';
import * as PV from '../app/planview.js';
import {NIGHT_LOCK} from '../render/format.js';
import {NIGHT_NOTE} from '../desk/desk.js';
import {clockText} from '../render/format.js';
import {openGame} from './lib/play.js';
import {replaying} from '../tools/follow.mjs';

const TPS = V.TICKS_PER_S, START = V.PLAYER_START_S;
const secOf = (h, m = 0) => (h - V.DAY_START_H) * V.S_PER_H + m * 60;
const at = s => clockText(s, false);

// ------------------------------------------------------------------ 1. the feeder cards' allowed seconds, kept

// A state with only what the director reads, with or without an input log.
const fake = (log, s = START) => ({tick: s * TPS, over: false, contIdx: -1, conts: [], scope: {unit: ''}, units: [], log,
  control: {handFlown: false, mode: 'AGC', nightShift: false}, scn: {night: true},
  city: {districts: [{id: 'T0', clearS: 9900, dark: true, shedBy: 'task', restoredAtS: -1}, {id: 'T1', clearS: 11700, dark: true, shedBy: 'task', restoredAtS: -1},
    {id: 'X', clearS: -1, dark: true, shedBy: 'ufls', restoredAtS: -1}]}});

test('Q-91 (stage C): the feeders\' allowed seconds are kept on the director per input-log length and hold exactly as read afresh, a logged restore of any district re-arming them; a poked clearS is seen at once', () => {
  const kept = fake([]), fresh = fake(undefined), dk = D.createDirector({game: true, paused: false}), df = D.createDirector({game: true, paused: false});
  // T1 closed at 07:16:00.4, the UFLS district X at 07:40:00.2 (each a logged input on the kept state); each card answered by another input
  const rs = [{t: 11760.4, id: 'T1'}, {t: 3 * 3600 + 40 * 60 + 0.2, id: 'X'}];
  let k = 0, cards = 0, logs = new Set();
  for (let t = START * TPS; t < 5 * 3600 * TPS; t += 10) {
    for (; k < rs.length && rs[k].t * TPS <= t; k++) {
      for (const st of [kept, fresh]) Object.assign(st.city.districts.find(x => x.id === rs[k].id), {dark: false, shedBy: null, restoredAtS: Math.floor(rs[k].t)});
      kept.log.push({tick: t, type: 'restore', args: {district: rs[k].id}});
    }
    kept.tick = fresh.tick = t;
    const m = D.modeOf(dk, kept).mode, id = D.feederCard(dk, kept);
    assert.deepEqual([m, id], [D.modeOf(df, fresh).mode, D.feederCard(df, fresh)], 'at ' + (t / TPS) + ' grid s');
    if (m === 'FEEDER-CARD') { cards++; D.answerFeeder(dk, kept, id, false); D.answerFeeder(df, fresh, id, false); }
    logs.add(dk.rw.n);
  }
  assert.ok(cards === 4 && dk.rw.ds === kept.city.districts && df.rw.n === -1, 'kept for the logged state, read afresh for the other: ' + cards + ' cards');
  assert.deepEqual([...logs], [0, 1, 2], 'one set of windows per log length');
  // a hand-back moved to now on the kept state (a test's poke, no input): the card at once
  const st = fake([], secOf(5)), d = D.createDirector({game: true, paused: false});
  assert.equal(D.modeOf(d, st).mode, 'CRUISE');
  st.city.districts[0].clearS = secOf(5);
  assert.deepEqual([D.modeOf(d, st).mode, D.rateOf(d, st), D.feederCard(d, st)], ['FEEDER-CARD', 0, 'T0']);
});

// ------------------------------------------------------------------ 3. the night's READY card

test('Q-73 (stage C): once the night is set, a unit the night shift brings to full speed is its own to close: the READY card offers no SYNC and goes to the lever; before it, TO THE SCOPE', () => {
  const name = V.MACHINES.find(m => m.id === 'gtb1').name, tick = (NIGHT_S + 180) * TPS;
  const ready = {tick, kind: 'log', sev: 'info', code: 'UNIT_READY', msg: name + ' at full speed: auto-sync in ' + Math.ceil(V.AUTO_SYNC_S / 60) + ' min (or SYNC now).'};
  const day = T.cardOf(ready);
  assert.deepEqual([day.text, day.button], [name + ' at full speed: auto-sync at 21:07 (or SYNC now).', {label: 'TO THE SCOPE', target: 'bay-sync'}]);
  const tr = T.createTray();
  T.trayRecords(tr, [{tick: NIGHT_S * TPS, kind: 'log', sev: 'info', code: 'NIGHT_SHIFT', msg: 'The night shift has the desk: AGC on until 04:00.'}]);
  assert.deepEqual(T.trayRecords(tr, [ready]), [], 'quiet at night');
  const card = tr.cards.at(-1);
  assert.deepEqual([card.text, card.button], [name + ' at full speed: auto-sync at 21:07.', {label: 'TO THE LEVER', target: 'lever-gtb'}]);
});

// ------------------------------------------------------------------ 4. the night lock's words

test('Q-73 (stage C): the night lock says what the night shift does (it runs the grid to 04:00, starting and standing down units and calling demand response as par would), one sentence for the toast, the desk\'s note and the strip', () => {
  assert.equal(NIGHT_NOTE, NIGHT_LOCK);
  assert.equal(G.NIGHT_LOCK, NIGHT_LOCK);
  assert.match(NIGHT_LOCK, /^The night shift has the desk to 04:00: it starts and stands down units and calls demand response as par would\.$/);
  assert.equal(NIGHT_LOCK.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length, 1, 'one sentence');
  assert.ok(NIGHT_LOCK.length <= 110, 'one line in the strip at 1280 px: ' + NIGHT_LOCK.length);
  // the "?" entry says the same of the night shift
  const row = TEXT.abstractions.find(x => x.id === 'night-shift');
  assert.match(row.ours, /start the units the night needs and stand down those it does not/);
  assert.match(row.ours, /call demand response/);
});

// ------------------------------------------------------------------ 6. the HAND chip in look()

test('D-7 (stage C): tests/lib/play.js look() reads the HAND chip on the CLOCK line, after the other chips; none on an AGC day', () => {
  const hand = openGame({seed: 20261008, agc: false});
  const line = hand.look({controls: false}).split('\n')[0];
  assert.match(line, /^CLOCK 04:30:\d\d \| PRE-DAWN 270× \| .* \| HAND$/, line);
  assert.equal(hand.$('chip-hand').hidden, false);
  const agc = openGame({seed: 20261008});
  assert.doesNotMatch(agc.look({controls: false}).split('\n')[0], /HAND/);
});

// ------------------------------------------------------------------ 8. a held line keeps its words, not a stale action

test('Q-18 (stage C): the dwell holds a line\'s words and glow, never an action the fresh line no longer carries: another unit, another control or none drops it; a new size or time of the same ask keeps it', () => {
  const start = (unit, text = 'Start GT·A now: it takes 6 min.') => ({kind: 'commit', level: 'act', text, targets: ['guard-start-' + unit], action: {type: 'start', unit}});
  const shown = start('gta1');
  const other = G.heldLine(shown, start('gtc1', 'Start GT·C 1 now: it takes 6 min.'));
  assert.deepEqual([other.text, other.targets, other.action], [shown.text, shown.targets, null], 'another unit');
  assert.equal(G.heldLine(shown, Object.assign(start('gta1'), {action: null, level: 'plan'})).action, null, 'no action');
  assert.equal(G.heldLine(shown, {kind: 'spare', level: 'act', text: 'GUARD', targets: [], action: {type: 'guard', mw: 300}}).action, null, 'another control');
  assert.equal(G.heldLine(shown, null).action, null, 'nothing');
  assert.equal(G.heldLine(shown, start('gta1', 'Start GT·A now: it takes 6 min to reach the grid.')), shown, 'the same ask');
  const guard = {kind: 'spare', level: 'act', text: 'Raise the battery GUARD to 400 MW.', targets: ['ring-guard'], action: {type: 'guard', mw: 400}};
  assert.equal(G.heldLine(guard, Object.assign({}, guard, {action: {type: 'guard', mw: 300}})), guard, 'the same control at another size');
  const soak = {kind: 'city', level: 'plan', text: 'Book HAZ\'s soak at 10:15.', targets: ['suburb-HAZ'], action: {type: 'flex', suburb: 'HAZ', lever: 'soak', atS: secOf(10, 15)}};
  assert.equal(G.heldLine(soak, Object.assign({}, soak, {action: Object.assign({}, soak.action, {atS: secOf(10, 20)})})), soak, 'the same aim at another time (cityAim reads the held one)');
  assert.equal(G.heldLine(soak, Object.assign({}, soak, {action: Object.assign({}, soak.action, {suburb: 'RED'})})).action, null, 'another suburb');
  const quiet = {kind: 'quiet', level: 'ok', text: 'Enough.', targets: [], action: null};
  assert.equal(G.heldLine(quiet, shown), quiet, 'nothing to drop');
});

// ------------------------------------------------------------------ 9. the part of the day is a figure

test('Q-18 (stage C): "for the afternoon" and "for the evening" near 17:00 are the shortfall\'s time moving, so steady() keeps the line shown, look to look', () => {
  assert.equal(O.masked('Next: start CCGT 2 by 16:10 for the afternoon. It takes 49 min.'), O.masked('Next: start CCGT 2 by 16:15 for the evening. It takes 49 min.'));
  assert.equal(O.masked('Tonight\'s peak would be 300 MW short from 18:10.'), O.masked('The afternoon would be 250 MW short from 16:55.'));
  assert.notEqual(O.masked('Next: start CCGT 2 by 16:10 for the afternoon.'), O.masked('Next: start GT·A by 16:10 for the afternoon.'), 'another unit is news');
  const next = (by, part, startBy) => ({kind: 'commit', level: 'plan', text: 'Next: start CCGT 2 by ' + by + ' for ' + part + '. It takes 49 min to reach the grid.', targets: ['guard-start-ccgt2'], action: null, startBy});
  const a = next('16:10', 'the afternoon', secOf(16, 10)), b = next('16:15', 'the evening', secOf(16, 15));
  let held = O.steady(null, a, secOf(14));
  const shown = [];
  for (let k = 1; k <= 12; k++) { held = O.steady(held, k % 2 ? b : a, secOf(14) + 60 * k); shown.push(held.line.text); }
  assert.deepEqual([...new Set(shown)], [a.text], 'the line shown never alternates');
});

// ------------------------------------------------------------------ 11. an outage with another block behind it

test('Q-68 (stage C): a unit out for maintenance is planned from the end of its binding block: its return, or a minimum down time that ends later (the sim names only the outage); the line and the stack\'s earliest start alike', () => {
  // DESK 20261007 at 04:30: CCGT 2 out until 07:45 (Act I), as tests/objective-day.test.js's late-return test
  const st = createState(20261007, DESK), sys = SYS.createSystem({commit: 'player'});
  while (st.tick < START * TPS) step(st, SYS.systemInputs(sys, st));
  const obs = observe(st, {dayAhead: true});
  obs.sec.previewNadirHz = 49.95; // (the GUARD ask aside)
  const cc = obs.units.find(u => u.id === 'ccgt2'), back = cc.outUntilS, m = V.MACHINES.find(x => x.id === 'ccgt2');
  assert.ok(/^on outage until/.test(cc.startBlock) && cc.downForS > m.minDownS, cc.startBlock);
  // a shortfall CCGT 2 reaches cheaply only from fromS (objective-day's shape): "Start CCGT 2 at fromS, when it is back"
  const G0 = O.tripGap(obs, obs.dayAhead, O.COMMIT_MARGIN_MW - O.MARGIN_MW);
  const ask = (o, fromS) => {
    const from = fromS + cc.startToMinS + 300;
    for (let j = 0; j < o.dayAhead.n; j++) { const t = o.dayAhead.fromS + (j + 1) * o.dayAhead.stepS; o.dayAhead.demandP50[j] += (t >= from && t < from + 3600 ? 600 : -1500) - G0.gap[j]; }
    const x = O.objective(o, {edited: false, planview: PV, dayAhead: o.dayAhead});
    assert.deepEqual([x.kind, x.action], ['commit', null], x.text);
    return x.text;
  };
  const poked = f => { const o = structuredClone(obs); f(o.units.find(u => u.id === 'ccgt2')); return o; };
  assert.match(ask(structuredClone(obs), back), new RegExp('Start CCGT 2 at ' + at(back) + ', when it is back: '), 'the outage binds');
  assert.equal(PV.earliestLines(obs).ccgt2, back + cc.startToMinS);
  // out only until 06:00, but stopped at 04:30: its minimum down time (3 h) binds to 07:30, behind the outage the sim names
  const early = poked(u => Object.assign(u, {outUntilS: secOf(6), startBlock: 'on outage until 06:00', downForS: 0}));
  assert.match(ask(early, secOf(7, 30)), /Start CCGT 2 at 07:30, when it is back: /);
  assert.equal(PV.earliestLines(early).ccgt2, secOf(7, 30) + cc.startToMinS, 'the stack\'s earliest line');
});

// ------------------------------------------------------------------ 12. no offer after the flip

test('K-12, Q-78 (stage C): an offer made before 21:00 leaves vm.offers (and the bay\'s cyan SYNC glow) when the night shift takes the desk', () => {
  const game = G.createGame({seed: 20261008, scenario: DESK, system: SYS, planview: PV, commit: 'player', storage: null});
  game.phase = 'play';
  const u = game.state.units.find(x => x.id === 'gta1');
  Object.assign(u, {mode: 'ready', timerS: 100});
  game.offered.gta1 = {why: 'peak', taken: false, tick: game.state.tick};
  let vm = G.buildVm(game, {nowMs: 1});
  assert.deepEqual([vm.offers, vm.glow.has('bay-sync')], [[{unit: 'gta1', why: 'peak'}], true], 'by day');
  game.state.control.nightShift = true;
  vm = G.buildVm(game, {nowMs: 2});
  assert.deepEqual([vm.offers, vm.glow.has('bay-sync')], [[], false], 'from the flip');
});

// ------------------------------------------------------------------ the STOP quotes' counterfactual

test('§21.4 f (stage C): tools/follow.mjs replaying() is the quote\'s own counterfactual: every other followed action at its minute, only this STOP and the unit\'s next START left out', () => {
  const said = [{s: 100, kind: 'commit', level: 'act', text: 'a', action: {type: 'start', unit: 'gta1'}, accepted: true},
    {s: 200, kind: 'stop', level: 'plan', text: 'b', action: {type: 'stop', unit: 'ccgt2'}, accepted: true},
    {s: 260, kind: 'stop', level: 'plan', text: 'c', action: {type: 'stop', unit: 'gta1'}, accepted: true},
    {s: 300, kind: 'commit', level: 'act', text: 'd', action: {type: 'start', unit: 'ccgt2'}, accepted: true},
    {s: 400, kind: 'battery', level: 'plan', text: 'e', action: {type: 'battery', mode: 'charge', mw: 50}, accepted: true}];
  const line = replaying(said, said[1], 300);
  assert.deepEqual([100, 150, 200, 260, 300, 400].map(s => { const x = line({s}); return x && x.text; }), ['a', null, null, 'c', null, 'e']);
  assert.deepEqual(line({s: 260}).action, {type: 'stop', unit: 'gta1'}, 'a later STOP of another unit is still followed (the queue)');
});

// The line above the desk and what answers a press (the owner's first-play reports, 2b-0): the line
// holds still long enough to be read (holdLine, LINE_DWELL_MS), names units as the desk labels them,
// says ARMED / UNDER WAY through the ui {do: 'armed'} seam (vm.armed), and the tray logs every
// START, STOP, CANCEL and ABORT the station takes. vm.held is the seam the desk's RE-DISPATCH lamp
// reads. Pure functions and headless games at 04:00 only: each test runs in about 50 ms or less (the
// first to build a game's line pays the warm-up), but FAST's, which takes the desk and runs to 04:38.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, observe, applyInput} from '../sim/step.js';
import {DESK} from '../content/scenarios.js';
import * as G from '../app/game.js';
import * as T from '../app/tray.js';
import * as SYS from '../app/system.js';
import * as PVW from '../app/planview.js';
import {consequence} from '../app/objective.js';
import {unitLabel} from '../desk/util.js';

const TPS = V.TICKS_PER_S;
const game04 = (o = {}) => G.createGame(Object.assign({seed: 7, scenario: DESK, system: SYS, planview: PVW, commit: 'player', storage: null}, o));

// ------------------------------------------------------------------ the line holds still (Q-18)

test('Q-18: holdLine keeps a shown line LINE_DWELL_MS of real time, and gives way at once to a critical or watch line, a line of a higher level that asks for something, an input or a change of mode that is news, or the same text', () => {
  assert.equal(G.LINE_DWELL_MS, 4000);
  const a = {kind: 'commit', level: 'act', text: 'Start CCGT 2 now: it takes 49 min to reach the grid.', targets: ['guard-start-ccgt2'], action: {type: 'start', unit: 'ccgt2'}};
  const b = {kind: 'spare', level: 'act', text: 'Raise the battery GUARD to 400 MW.', targets: ['ring-guard'], action: {type: 'guard', mw: 400}};
  const t = 10000;
  assert.equal(G.holdLine(a, b, t + 3900, t, false), true, 'held at 3.9 s');
  assert.equal(G.holdLine(a, b, t + 4000, t, false), false, 'replaced at 4.0 s');
  assert.equal(G.holdLine(a, Object.assign({}, b, {level: 'crit'}), t + 100, t, false), false, 'a critical line');
  assert.equal(G.holdLine(a, Object.assign({}, b, {kind: 'watch'}), t + 100, t, false), false, 'the watch');
  assert.equal(G.holdLine(a, b, t + 100, t, true), false, 'an input accepted, or a change of mode that is news');
  assert.equal(G.holdLine(a, b, 0, 0, false), false, 'a clock that does not advance (headless callers)');
  assert.equal(G.holdLine(a, Object.assign({}, a, {targets: []}), t + 100, t, false), false, 'the same text: the fresh line\'s action and targets');
  assert.equal(G.holdLine(null, b, t + 100, t, false), false, 'nothing shown');
  assert.equal(G.holdLine(a, null, t + 100, t, false), false, 'nothing to show');
  // an ask over a line that asks for less: at once (a 'Start now' waits behind no plan or quiet line)
  const plan = {kind: 'commit', level: 'plan', text: 'Start CCGT 2 by 05:01: it takes 49 min to reach the grid.', targets: ['guard-start-ccgt2'], action: null};
  const quiet = {kind: 'quiet', level: 'ok', text: 'Enough plant is committed for the rest of the day.', targets: [], action: null};
  assert.equal(G.holdLine(plan, a, t + 100, t, false), false, 'ACT NOW over a PLAN line');
  assert.equal(G.holdLine(quiet, a, t + 100, t, false), false, 'ACT NOW over a quiet line');
  assert.equal(G.holdLine(quiet, Object.assign({}, plan, {action: {type: 'battery', mode: 'charge', mw: 100}}), t + 100, t, false), false, 'an order over a quiet line');
  assert.equal(G.holdLine(quiet, plan, t + 100, t, false), true, 'a higher level that asks for nothing yet waits');
  assert.equal(G.holdLine(a, plan, t + 100, t, false), true, 'a lower level waits');
});

test('Q-18 in the game: the shown line, its glow with it, stays until LINE_DWELL_MS have passed; the same text again does not restart it', () => {
  const game = game04();
  game.phase = 'play'; // the desk at 04:00 with the clock held (what is shown is all this test reads)
  const fresh = G.buildVm(game, {nowMs: 1000}).objective;
  assert.ok(fresh && fresh.text, 'a line');
  assert.equal(game.lineMs, 1000);
  // a line that went up at 1 s, and the line's next look (the 30-grid-s cadence: objectiveS)
  const shown = Object.assign({}, fresh, {text: 'An older line.', targets: ['knob-tie']});
  const look = (nowMs, o = shown) => { game.objective = o; game.objectiveS = -1e9; return G.buildVm(game, {nowMs}); };
  let vm = look(1000 + G.LINE_DWELL_MS - 100);
  assert.equal(vm.objective, shown, 'held');
  assert.ok(vm.glow.has('knob-tie'), 'with its glow');
  assert.equal(game.objectiveHeld.line.text, fresh.text, 'steady() still reads the fresh line underneath');
  vm = look(1000 + G.LINE_DWELL_MS);
  assert.equal(vm.objective.text, fresh.text, 'replaced once the dwell is over');
  assert.equal(game.lineMs, 1000 + G.LINE_DWELL_MS);
  // the same text again at a look 2 s on is not a new line: the dwell still runs from when it went up
  // (the shown line then stands in for whatever is up; the next look differs from it)
  const up = game.lineMs;
  look(up + 2000, vm.objective);
  assert.equal(game.lineMs, up, 'the same text keeps its time');
  assert.equal(look(up + G.LINE_DWELL_MS).objective.text, fresh.text, 'held to 4 s after it went up, and no longer');
});

test('Q-18 in the game: an accepted input, or a mode change that is news (the watch, the card, RESPOND), shows the fresh line at once; Space does not (pause and run keep it)', () => {
  const game = game04();
  game.phase = 'play';
  const fresh = G.buildVm(game, {nowMs: 1000}).objective;
  const shown = Object.assign({}, fresh, {text: 'An older line.', targets: ['knob-tie']});
  const look = nowMs => { game.objective = shown; game.objectiveS = -1e9; return G.buildVm(game, {nowMs}); };
  // an accepted input: at once (a refused one is not news)
  game.lineMs = 20000;
  assert.notEqual(G.sendInput(game, {type: 'tie', mw: 99999}), '');
  assert.equal(look(20100).objective, shown, 'a refused input holds nothing up');
  game.objective = shown;
  assert.equal(G.sendInput(game, {type: 'guard', mw: 100}), '');
  let vm = G.buildVm(game, {nowMs: 20200});
  assert.ok(vm.objective !== shown && vm.objective === game.objectiveHeld.line, 'an accepted input: ' + vm.objective.text);
  assert.equal(game.lineMs, 20200);
  // Space: the shown line stays through the pause and the run, and is not even looked at again
  game.objective = shown; game.lineMs = 30000;
  const s0 = game.objectiveS;
  assert.equal(G.ui(game, {do: 'pause'}), '');
  vm = G.buildVm(game, {nowMs: 30100});
  assert.equal(vm.mode.mode, 'CRUISE');
  assert.equal(vm.objective, shown, 'run: the line shown stays');
  assert.equal(game.objectiveS, s0, 'no new look');
  assert.equal(G.ui(game, {do: 'pause'}), '');
  vm = G.buildVm(game, {nowMs: 30200 + G.LINE_DWELL_MS});
  assert.equal(vm.mode.mode, 'PAUSE');
  assert.equal(vm.objective, shown, 'pause: the line shown stays, past the dwell too');
  // out of RESPOND (the mode at the last look): news, at once, though the line shown went up 0.1 s ago
  game.objectiveMode = 'RESPOND'; game.lineMs = 30200 + G.LINE_DWELL_MS;
  vm = G.buildVm(game, {nowMs: 30300 + G.LINE_DWELL_MS});
  assert.ok(vm.objective !== shown && vm.objective === game.objectiveHeld.line, 'the end of RESPOND');
  assert.equal(game.objectiveMode, 'PAUSE');
});

test('Q-18 at FAST: a new ask to act (newAsk) ends FAST and is shown at once, so the first "Start CCGT 2 now" leaves its CRUISE reading time (at least 8 real s)', () => {
  const guard = {kind: 'spare', level: 'act', text: 'Raise the battery GUARD to 400 MW.', action: {type: 'guard', mw: 400}};
  const start = {kind: 'commit', level: 'act', text: 'Start CCGT 2 now.', action: {type: 'start', unit: 'ccgt2'}};
  assert.equal(G.newAsk(guard, start), true);
  assert.equal(G.newAsk(null, Object.assign({}, start, {level: 'crit'})), true, 'a critical one, over nothing');
  assert.equal(G.newAsk(start, Object.assign({}, start, {text: 'Start CCGT 2 now: it takes 49 min.'})), false, 'the same ask in other words');
  assert.equal(G.newAsk(guard, Object.assign({}, start, {level: 'plan'})), false, 'an order at PLAN (a STOP for its saving, a charge)');
  assert.equal(G.newAsk(guard, Object.assign({}, start, {action: null})), false, 'nothing to do yet');
  assert.equal(G.newAsk(guard, null), false);
  const game = game04({seed: 20261007});
  G.takeDesk(game); // 04:30, the clock running
  // F held from 04:30 (pressed again whenever something else ended it) until a start is asked
  let nowMs = 1, vm = G.buildVm(game, {nowMs}), was = null, up = 0, ask = null;
  for (let n = 0; !ask && n < 200; n++) {
    if (vm.mode.mode === 'CRUISE') G.ui(game, {do: 'fast', on: true});
    was = vm.objective; up = game.lineMs;
    nowMs += 100; G.frame(game, 0.1, () => nowMs); vm = G.buildVm(game, {nowMs});
    const o = vm.objective;
    if (o && o.action && o.action.type === 'start' && / now/.test(o.text)) ask = o;
  }
  assert.ok(ask, 'a start asked by 05:00');
  assert.equal(vm.mode.mode, 'FAST', 'asked while at FAST');
  assert.ok(was && was.action && was.action.type !== 'start' && nowMs - up < G.LINE_DWELL_MS, 'over another ask up for ' + (nowMs - up) + ' ms, at once');
  const next = G.buildVm(game, {nowMs: nowMs + 16}).mode;
  assert.equal(next.mode, 'CRUISE');
  const realS = (ask.startBy - vm.obs.s) / next.rate;
  assert.ok(realS >= 8, 'the deadline ' + realS.toFixed(1) + ' real s away');
  // the same ask again does not end FAST a second time (the player may skip on)
  assert.equal(G.ui(game, {do: 'fast', on: true}), '');
  game.objectiveS = -1e9;
  assert.equal(G.buildVm(game, {nowMs: nowMs + 32}).objective.action.type, 'start');
  assert.equal(G.buildVm(game, {nowMs: nowMs + 48}).mode.mode, 'FAST');
  // at CRUISE another ask waits out the dwell, as any line does
  G.ui(game, {do: 'fast', on: false});
  const other = Object.assign({}, ask, {text: 'Another ask.', action: {type: 'tie', mw: 0}});
  game.objective = other; game.lineMs = nowMs + 48; game.objectiveS = -1e9;
  assert.equal(G.buildVm(game, {nowMs: nowMs + 64}).objective, other);
  assert.equal(game.objectiveHeld.line.action.type, 'start');
});

// ------------------------------------------------------------------ one name per control (C-4)

test('C-4: the line names every unit as the desk labels it (CCGT 2, COAL 4, HYDRO 3, GT·A); the place names stay the map\'s and the tray\'s', () => {
  const obs = observe(createState(7, DESK));
  for (const m of V.MACHINES) {
    const u = obs.units.find(x => x.id === m.id), was = u.mode;
    u.mode = 'tripped';
    assert.equal(consequence(obs, 'guard-stop-' + m.id).text, unitLabel(m.id) + ' is tripped: nothing to stop.');
    u.mode = was;
  }
  assert.deepEqual(['ccgt2', 'coal4', 'hydro3', 'gta1', 'gtb1'].map(unitLabel), ['CCGT 2', 'COAL 4', 'HYDRO 3', 'GT·A', 'GT·B 1']);
  assert.match(T.cardOf({tick: 1, kind: 'contingency', cause: 'unit', id: 'ccgt2', lostMW: 300}).text, /^Riverton CCGT 2 tripped/);
});

// ------------------------------------------------------------------ the tray logs every command (C-12, K-9)

test('K-9: every START, STOP, CANCEL and ABORT the station takes is a STATION card at once (an information tick), with a jump to its lever or the HYDRO wheel; each one, even with the clock held', () => {
  const st = createState(7, DESK), out = [];
  for (const x of [{type: 'start', unit: 'ccgt2'}, {type: 'stop', unit: 'ccgt2'}, {type: 'start', unit: 'gta1'}, {type: 'stop', unit: 'coal1'},
    {type: 'stop', unit: 'hydro1'}, {type: 'abortStop', unit: 'hydro1'}]) assert.equal(applyInput(st, x, out).ok, true, JSON.stringify(x));
  assert.deepEqual(out.map(r => r.code), ['UNIT_START', 'UNIT_CANCEL', 'UNIT_START', 'UNIT_STOP', 'UNIT_STOP', 'UNIT_ABORT_STOP']);
  const cards = out.map(T.cardOf);
  for (const [i, c] of cards.entries()) {
    assert.deepEqual([c.from, c.sev, c.button.label], [T.SENDERS.station, 'info', 'TO THE LEVER']);
    if (out[i].code !== 'UNIT_START') assert.equal(c.text, out[i].msg, 'the station\'s own words');
    assert.ok(c.text.split(/\s+/).length <= T.MAX_WORDS, c.text);
  }
  assert.deepEqual(cards.map(c => c.button.target), ['lever-ccgt', 'lever-ccgt', 'lever-gta', 'lever-coal', 'wheel-hydro', 'wheel-hydro']);
  // C-12: when it is at full speed as a clock time, as the line says it ('full speed at 04:35')
  assert.match(out[0].msg, /^START Riverton CCGT 2: running up, full speed in 35 min\.$/);
  assert.equal(cards[0].text, 'START Riverton CCGT 2: running up, full speed at 04:35.');
  assert.equal(cards[2].text, 'START GT·A: running up, full speed at 04:06.');
  assert.equal(T.cardOf({tick: 610 * TPS, kind: 'log', sev: 'info', code: 'UNIT_READY', msg: 'GT·A at full speed: auto-sync in 4 min (or SYNC now).'}).text,
    'GT·A at full speed: auto-sync at 04:14 (or SYNC now).');
  const tr = T.createTray();
  assert.deepEqual(T.trayRecords(tr, out.slice(0, 1)), ['tick'], 'information: a tick, never a ring');
  // START, CANCEL, START of one unit at one tick (the clock held): three cards, the last the START
  T.trayRecords(tr, out.slice(1, 2));
  T.trayRecords(tr, out.slice(0, 1));
  assert.deepEqual(T.trayView(tr).cards.map(c => c.text.split(':')[0]), ['START Riverton CCGT 2', 'Riverton CCGT 2', 'START Riverton CCGT 2']);
  assert.equal(T.cardOf({tick: 1, kind: 'log', sev: 'info', code: 'UNIT_START', msg: 'START Somewhere: running up.'}).button.target, 'stack', 'a unit it cannot name');
});

test('K-9: a full tray sends its oldest card from before to the LOG, information before warnings; every card new in the call is shown (a warning gives way to any newer card)', () => {
  const tr = T.createTray();
  const start = (s, name) => ({tick: s * TPS, kind: 'log', sev: 'info', code: 'UNIT_START', msg: 'START ' + name + ': running up, full speed in 9 min.'});
  const trip = (s, id) => ({tick: s * TPS, kind: 'contingency', cause: 'unit', id, lostMW: 300});
  const shown = () => T.trayView(tr).cards.map(c => c.text.split(':')[0]);
  T.trayRecords(tr, [trip(100, 'coal1'), start(101, 'GT·A'), trip(102, 'coal2'), start(103, 'GT·B 1')]);
  assert.deepEqual(shown(), ['Mt Hazel coal 1 tripped', 'Mt Hazel coal 2 tripped', 'START GT·B 1']);
  assert.deepEqual(T.trayView(tr).log.map(c => c.text.split(':')[0]), ['START GT·A']);
  T.trayRecords(tr, [trip(104, 'coal3')]);
  assert.deepEqual(shown(), ['Mt Hazel coal 1 tripped', 'Mt Hazel coal 2 tripped', 'Mt Hazel coal 3 tripped']);
  T.trayRecords(tr, [trip(105, 'coal4')]);
  assert.deepEqual(shown(), ['Mt Hazel coal 2 tripped', 'Mt Hazel coal 3 tripped', 'Mt Hazel coal 4 tripped'], 'with no information card, the oldest');
  assert.equal(T.trayView(tr).log.length, 3);
  // three warnings up, and the player starts a unit to recover: its card shows, the oldest warning goes
  assert.deepEqual(T.trayRecords(tr, [start(106, 'GT·C 1')]), ['tick']);
  assert.deepEqual(shown(), ['Mt Hazel coal 3 tripped', 'Mt Hazel coal 4 tripped', 'START GT·C 1']);
  assert.equal(T.trayView(tr).log.at(-1).text.split(':')[0], 'Mt Hazel coal 2 tripped');
  // two new cards in one call (a START and another unit at full speed): both show
  const ready = (s, name) => ({tick: s * TPS, kind: 'log', sev: 'info', code: 'UNIT_READY', msg: name + ' at full speed: auto-sync in 4 min (or SYNC now).'});
  assert.deepEqual(T.trayRecords(tr, [start(107, 'GT·C 2'), ready(107, 'GT·A')]), ['tick', 'tick']);
  assert.deepEqual(shown(), ['Mt Hazel coal 4 tripped', 'START GT·C 2', 'GT·A at full speed']);
  assert.deepEqual(T.trayView(tr).log.slice(-2).map(c => c.text.split(':')[0]), ['START GT·C 1', 'Mt Hazel coal 3 tripped']);
  // more new cards than the tray holds: the older ones first, then the oldest new
  T.trayRecords(tr, [1, 2, 3, 4].map(i => start(108, 'GT·B ' + i)));
  assert.deepEqual(shown(), ['START GT·B 2', 'START GT·B 3', 'START GT·B 4']);
});

// ------------------------------------------------------------------ the seams: vm.armed, vm.held

test('C-2 seam: ui {do: \'armed\'} names the guard whose cover is up (vm.armed); it drops only for that guard, and on a new day', () => {
  const game = game04();
  assert.equal(G.buildVm(game, {nowMs: 0}).armed, null);
  assert.equal(G.ui(game, {do: 'armed', target: 'guard-start-ccgt2', on: true}), '');
  assert.equal(G.buildVm(game, {nowMs: 16}).armed, 'guard-start-ccgt2');
  assert.equal(G.ui(game, {do: 'armed', target: 'guard-stop-gta1', on: false}), '');
  assert.equal(game.ui.armed, 'guard-start-ccgt2', 'another cover dropping changes nothing');
  assert.equal(G.ui(game, {do: 'armed', target: 'guard-stop-coal1', on: true}), '');
  assert.equal(game.ui.armed, 'guard-stop-coal1', 'the cover last lifted');
  assert.equal(G.ui(game, {do: 'armed', target: 'guard-stop-coal1', on: false}), '');
  assert.equal(G.buildVm(game, {nowMs: 32}).armed, null);
  G.ui(game, {do: 'armed', target: 'guard-start-gta1', on: true});
  G.resetDay(game);
  assert.equal(G.buildVm(game, {nowMs: 48}).armed, null, 'a new day');
  G.ui(game, {do: 'armed', on: true});
  assert.equal(G.buildVm(game, {nowMs: 64}).armed, null, 'no guard named: null, never undefined');
});

test('C-2: while a guard\'s cover is up, what the press would do holds still as it read when the cover went up; it is read again when its level or words change (a verdict, the unit\'s mode) or the cover drops', () => {
  const game = game04();
  game.phase = 'play';
  const look = () => G.buildVm(game, {nowMs: 1 + game.state.tick}).consider;
  G.ui(game, {do: 'consider', target: 'guard-start-ccgt2'});
  assert.equal(G.ui(game, {do: 'armed', target: 'guard-start-ccgt2', on: true}), '');
  const c0 = look();
  assert.match(c0.text, /^START CCGT 2: at minimum load \(175 MW\) by 04:49, /);
  // a grid minute on (two of the line's looks): the press would now be at minimum load a minute later
  G.runTo(game, game.state.tick + 60 * TPS);
  assert.deepEqual(look(), c0, 'held while the cover is up');
  G.ui(game, {do: 'armed', target: 'guard-start-ccgt2', on: false});
  const by0450 = /^START CCGT 2: at minimum load \(175 MW\) by 04:50, /;
  assert.match(look().text, by0450, 'the cover down: read afresh');
  // the cover up again: held while its level and words (all but the figures) read the same, for its own guard
  G.ui(game, {do: 'armed', target: 'guard-start-ccgt2', on: true});
  for (const x of [{text: c0.text.replace(/\.$/, ', too late.')}, {level: 'crit'}, {target: 'guard-start-ccgt1'}]) {
    game.consider = Object.assign({}, c0, x); game.considerDirty = true;
    assert.match(look().text, by0450, JSON.stringify(x));
  }
  // and the unit started under it: what it is doing now
  assert.equal(G.sendInput(game, {type: 'start', unit: 'ccgt2'}), '');
  assert.equal(look().level, 'ok', 'starting: ' + game.consider.text);
});

test('C-2 seam: vm.held is true once a lever is moved by hand in player mode (app/system.js heldByHand), and never with the system\'s commitment', () => {
  const game = game04();
  assert.equal(G.buildVm(game, {nowMs: 0}).held, false);
  assert.equal(G.sendInput(game, {type: 'basePoint', station: 'coal', mw: 1500}), '');
  assert.equal(G.buildVm(game, {nowMs: 16}).held, true, 'at once, not at the system\'s next look');
  G.resetDay(game);
  assert.equal(G.buildVm(game, {nowMs: 32}).held, false, 'a new day');
  const sys = game04({commit: 'system'});
  assert.equal(G.sendInput(sys, {type: 'basePoint', station: 'coal', mw: 1500}), '');
  assert.equal(G.buildVm(sys, {nowMs: 0}).held, false);
  const bare = game04({system: null});
  assert.equal(G.buildVm(bare, {nowMs: 0}).held, false, 'no system operator: nothing to hold');
});

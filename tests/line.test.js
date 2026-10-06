// The line above the desk and what answers a press (the owner's first-play reports, 2b-0): the line
// holds still long enough to be read (holdLine, LINE_DWELL_MS), names units as the desk labels them,
// says ARMED / UNDER WAY through the ui {do: 'armed'} seam (vm.armed), and the tray logs every
// START, STOP, CANCEL and ABORT the station takes. vm.held is the seam the desk's RE-DISPATCH lamp
// reads. Pure functions and headless games at 04:00 only: each test runs in a few ms.
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

test('Q-18: holdLine keeps a shown line LINE_DWELL_MS of real time, and gives way at once to a critical or watch line, an input or a change of mode, or the same text', () => {
  assert.equal(G.LINE_DWELL_MS, 4000);
  const a = {kind: 'commit', level: 'act', text: 'Start CCGT 2 now: it takes 49 min to reach the grid.', targets: ['guard-start-ccgt2']};
  const b = {kind: 'spare', level: 'act', text: 'Raise the battery GUARD to 400 MW.', targets: ['ring-guard']};
  const t = 10000;
  assert.equal(G.holdLine(a, b, t + 3900, t, false), true, 'held at 3.9 s');
  assert.equal(G.holdLine(a, b, t + 4000, t, false), false, 'replaced at 4.0 s');
  assert.equal(G.holdLine(a, Object.assign({}, b, {level: 'crit'}), t + 100, t, false), false, 'a critical line');
  assert.equal(G.holdLine(a, Object.assign({}, b, {kind: 'watch'}), t + 100, t, false), false, 'the watch');
  assert.equal(G.holdLine(a, b, t + 100, t, true), false, 'an input accepted, or the mode changed');
  assert.equal(G.holdLine(a, b, 0, 0, false), false, 'a clock that does not advance (headless callers)');
  assert.equal(G.holdLine(a, Object.assign({}, a, {targets: []}), t + 100, t, false), false, 'the same text: the fresh line\'s action and targets');
  assert.equal(G.holdLine(null, b, t + 100, t, false), false, 'nothing shown');
  assert.equal(G.holdLine(a, null, t + 100, t, false), false, 'nothing to show');
});

test('Q-18 in the game: the shown line, its glow with it, stays until LINE_DWELL_MS have passed; an accepted input or a change of mode shows the fresh one at once', () => {
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
  // an accepted input: at once (a refused one is not news)
  game.objective = shown; game.lineMs = 20000;
  assert.notEqual(G.sendInput(game, {type: 'tie', mw: 99999}), '');
  assert.equal(look(20100).objective, shown, 'a refused input holds nothing up');
  game.objective = shown;
  assert.equal(G.sendInput(game, {type: 'guard', mw: 100}), '');
  vm = G.buildVm(game, {nowMs: 20200});
  assert.ok(vm.objective !== shown && vm.objective === game.objectiveHeld.line, 'an accepted input: ' + vm.objective.text);
  assert.equal(game.lineMs, 20200);
  // a change of mode (Space): at once
  game.lineMs = 30000;
  assert.equal(G.ui(game, {do: 'pause'}), '');
  vm = look(30100);
  assert.ok(vm.objective !== shown && vm.objective === game.objectiveHeld.line, 'the clock running');
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

test('K-9: every START, STOP, CANCEL and ABORT the station takes is a STATION card at once (an information tick), with a jump to its lever or the HYDRO wheel', () => {
  const st = createState(7, DESK), out = [];
  for (const x of [{type: 'start', unit: 'ccgt2'}, {type: 'stop', unit: 'ccgt2'}, {type: 'start', unit: 'gta1'}, {type: 'stop', unit: 'coal1'},
    {type: 'stop', unit: 'hydro1'}, {type: 'abortStop', unit: 'hydro1'}]) assert.equal(applyInput(st, x, out).ok, true, JSON.stringify(x));
  assert.deepEqual(out.map(r => r.code), ['UNIT_START', 'UNIT_CANCEL', 'UNIT_START', 'UNIT_STOP', 'UNIT_STOP', 'UNIT_ABORT_STOP']);
  const cards = out.map(T.cardOf);
  for (const [i, c] of cards.entries()) {
    assert.deepEqual([c.from, c.sev, c.text, c.button.label], [T.SENDERS.station, 'info', out[i].msg, 'TO THE LEVER']);
    assert.ok(c.text.split(/\s+/).length <= T.MAX_WORDS, c.text);
  }
  assert.deepEqual(cards.map(c => c.button.target), ['lever-ccgt', 'lever-ccgt', 'lever-gta', 'lever-coal', 'wheel-hydro', 'wheel-hydro']);
  assert.match(cards[0].text, /^START Riverton CCGT 2: running up, full speed in \d+ min\.$/);
  assert.equal(new Set(cards.map(c => c.key)).size, cards.length, 'one card each');
  const tr = T.createTray();
  assert.deepEqual(T.trayRecords(tr, out.slice(0, 1)), ['tick'], 'information: a tick, never a ring');
  assert.equal(T.cardOf({tick: 1, kind: 'log', sev: 'info', code: 'UNIT_START', msg: 'START Somewhere: running up.'}).button.target, 'stack', 'a unit it cannot name');
});

test('K-9: a full tray sends its oldest information card to the LOG before any warning', () => {
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

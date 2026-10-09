// Phase 2a seams (desk/README.md §19.5): the small shared pieces the par, app and view jobs
// meet at. Each is pinned here so a job that changes one sees it fail in its own worktree.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {DESK, DESK_WEEKEND, SCENARIOS} from '../content/scenarios.js';
import {priceText} from '../render/format.js';
import * as PV from '../app/planview.js';
import * as G from '../app/game.js';
import * as SYS from '../app/system.js';
import {objective, capacityShort} from '../app/objective.js';
import {followDay} from './lib/follow.js';
import {deskDayVm} from './lib/desk-vm.js';
import {createState, observe} from '../sim/step.js';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {createLiveStack} from '../render/livestack.js';
import {UI} from '../render/mapdata.js';
import * as A from '../app/alarms.js';

test('§19.5 priceText: the sign goes before the dollar (U+2212), thousands separated', () => {
  assert.equal(priceText(74.2), '$74');
  assert.equal(priceText(-20), '−$20');
  assert.equal(priceText(-1000), '−$1,000');
  assert.equal(priceText(23200), '$23,200');
  assert.equal(priceText(-0.2), '$0');
  assert.equal(priceText(NaN), '-');
});

test('C-2 scenarioForSeed: a seed that reads as a Saturday or Sunday plays desk-weekend, anything else desk', () => {
  assert.equal(G.scenarioForSeed(20261003), DESK_WEEKEND); // Saturday
  assert.equal(G.scenarioForSeed(20261004), DESK_WEEKEND); // Sunday
  assert.equal(G.scenarioForSeed(20261001), DESK);         // Thursday
  assert.equal(G.scenarioForSeed(20261002), DESK);         // Friday
  assert.equal(G.scenarioForSeed(7), DESK);
  assert.equal(G.scenarioForSeed(20261341), DESK, 'not a date');
  assert.equal(G.scenarioForSeed(20260230), DESK, '30 February is not a date');
  assert.equal(SCENARIOS['desk-weekend'], DESK_WEEKEND);
});

test('C-2: a game given a scenario function asks it again at every reset', () => {
  const game = G.createGame({seed: 20261003, scenario: G.scenarioForSeed, system: SYS, planview: PV, commit: 'player'});
  assert.equal(game.state.scenarioId, 'desk-weekend');
  G.resetDay(game, 20261001);
  assert.equal(game.state.scenarioId, 'desk');
  assert.equal(game.state.day.weekend, false);
});

test('C-11 blueRuns: runs of projected spill above SURPLUS_MIN_MW, in the shape of redRuns', () => {
  const n = 8, times = Float64Array.from({length: n}, (_, k) => 300 * (k + 1));
  const sp = Float64Array.from([0, 40, 120, 300, 60, 0, 51, 0]);
  const runs = PV.blueRuns({n, times, surplusMW: sp});
  assert.deepEqual(runs, [{atS: 900, endS: 1500, k0: 2, k1: 4, mw: 300}, {atS: 2100, endS: 2100, k0: 6, k1: 6, mw: 51}]);
  assert.ok(V.SURPLUS_MIN_MW >= 50);
  assert.deepEqual(PV.blueRuns({n, times}), [], 'a projection without the array has no blue');
});

test('§19.5 the objective line carries kind and long; capacityShort takes any forecast', () => {
  const {vm, obs} = deskDayVm({seed: 7, untilH: 5});
  const KINDS = ['watch', 'held', 'short', 'commit', 'restore', 'spare', 'stop', 'battery', 'city', 'quiet'];
  assert.ok(KINDS.includes(vm.objective.kind), vm.objective.kind);
  assert.ok('long' in vm.objective);
  const proj = PV.project(obs);
  assert.equal(proj.rooftop.length, proj.n);
  assert.equal(proj.surplusMW.length, proj.n);
  assert.equal(proj.past.rooftop.length, proj.past.demand.length);
  const wide = capacityShort(obs, obs.forecast);
  assert.deepEqual(wide, capacityShort(obs));
  const line = objective(obs, {edited: false, planview: PV, dayAhead: null});
  assert.equal(typeof line.text, 'string');
});

test('C-10 consider: a presentation command that names a guard, or clears it', () => {
  const game = G.createGame({seed: 7, scenario: DESK, system: SYS, planview: PV, commit: 'player'});
  assert.equal(G.ui(game, {do: 'consider', target: 'guard-stop-ccgt1'}), '');
  assert.equal(game.ui.consider, 'guard-stop-ccgt1');
  assert.equal(G.ui(game, {do: 'consider', target: 'lever-coal'}), '');
  assert.equal(game.ui.consider, null, 'only guards are considered');
  G.ui(game, {do: 'consider', target: 'guard-start-gta1'});
  G.resetDay(game);
  assert.equal(game.ui.consider, null, 'a new day forgets it');
  const vm = G.buildVm(game, {nowMs: 0, dtS: 0});
  assert.ok('consider' in vm);
  assert.ok(Array.isArray(vm.hist.rooftop) && vm.hist.rooftop.length === vm.hist.demand.length);
});

test('P-9 x C-9: the stack\'s word SPILL is MIN GEN\'s spill now, not the price alone; a negative price keeps its own colour either way', () => {
  const doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  const stack = createLiveStack(doc, root, {input: () => '', ui: () => ''});
  stack.el.clientWidth = 336; stack.el.clientHeight = 164;
  const ctx = stack.el.querySelector('canvas').getContext('2d'), said = [];
  ctx.fillText = text => { said.push({text: String(text), fill: ctx.fillStyle}); };
  const price = () => said.filter(t => /MWh$/.test(t.text));
  const obs = observe(createState(1, DESK_WEEKEND));
  Object.assign(obs.price, {mwh: -20});
  // the renewables' offer sets a negative price with nothing cut: no SPILL (MIN GEN, blue and the cut all say no)
  Object.assign(obs.wind, {autoMW: 0}); Object.assign(obs.solar, {autoMW: 0});
  stack.update(baseVm(obs));
  assert.deepEqual(price(), [{text: '−$20/MWh', fill: UI.blue}]);
  assert.equal(stack.debug.stats.price.spill, false);
  // the dispatch cutting more than SURPLUS_MIN_MW at the same price: SPILL, drawn at once
  said.length = 0;
  const draws = stack.debug.stats.draws;
  const spill = structuredClone(obs);
  Object.assign(spill.wind, {autoMW: 30}); Object.assign(spill.solar, {autoMW: V.SURPLUS_MIN_MW - 20});
  assert.ok(A.alarmInput(spill).spillMW > V.SURPLUS_MIN_MW, 'MIN GEN\'s input');
  stack.update(baseVm(spill));
  assert.equal(stack.debug.stats.draws, draws + 1);
  assert.deepEqual(price(), [{text: 'SPILL −$20/MWh', fill: UI.blue}]);
  assert.equal(stack.debug.stats.price.spill, true);
  // at SURPLUS_MIN_MW or under, nothing is said to be spilled
  said.length = 0;
  Object.assign(spill.solar, {autoMW: V.SURPLUS_MIN_MW - 30});
  stack.update(baseVm(spill));
  assert.deepEqual(price(), [{text: '−$20/MWh', fill: UI.blue}]);
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('tests/lib/follow.js: the hint-following player acts only on the line, and the no-input player never acts', () => {
  const a = followDay(7, DESK, {untilH: 7});
  assert.ok(a.said.length >= 1, 'the line asked for something before 07:00');
  for (const x of a.said) assert.ok(x.action && typeof x.text === 'string' && x.kind);
  const types = new Set(a.st.log.map(r => r.type));
  for (const t of types) assert.ok(t === 'planLoad' || a.said.some(x => x.action.type === t), 'an input the line never proposed: ' + t);
  const b = followDay(7, DESK, {untilH: 7, follow: false});
  assert.deepEqual(b.said, []);
  assert.ok(b.st.log.every(r => r.type === 'planLoad'));
});

// tests/header-truth.test.js: the header and the end card say what is true (X-45).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {lightsChip} from '../render/format.js';
import {shedWord} from '../desk/dial.js';
import {allIn, OUTAGE_MIN_MWH} from '../app/score.js';
import * as G from '../app/game.js';
import * as system from '../app/system.js';
import * as planview from '../app/planview.js';

const district = (id, o) => Object.assign({id, dark: false, shedBy: '', clearS: -1, coldLoadMW: 0}, o);

test('X-45: LIGHTS ON names the player\'s dark districts and their MW; 100% while none is; a feeder under repair is the network\'s', () => {
  const s = 54000;
  assert.equal(lightsChip({s, districts: [district('RED1'), district('SAL1')]}), '100%');
  assert.equal(lightsChip({s, districts: [district('RED1', {dark: true, shedBy: 'ufls', coldLoadMW: 233}), district('SAL1', {dark: true, shedBy: 'directed', coldLoadMW: 251})]}), '2 DARK · 480 MW');
  const held = district('HAR4', {dark: true, shedBy: 'task', clearS: s + 600, coldLoadMW: 240});
  assert.equal(lightsChip({s, districts: [held]}), '100%', 'under repair: not yet the player\'s');
  assert.equal(lightsChip({s, districts: [Object.assign({}, held, {clearS: s - 1})]}), '1 DARK · 240 MW', 'handed back');
  assert.equal(lightsChip({s, districts: Array.from({length: 9}, (_, i) => district('D' + i, {dark: true, shedBy: 'ufls', coldLoadMW: 239}))}), '9 DARK · 2,150 MW');
});

test('X-45: the BALANCE mark says DARK at a hand-back (nothing was shed) and SHED when relays or the city desk shed', () => {
  assert.equal(shedWord({districts: [district('HAR4', {dark: true, shedBy: 'task'})]}), 'DARK');
  assert.equal(shedWord({districts: [district('HAR4', {dark: true, shedBy: 'task'}), district('RED1', {dark: true, shedBy: 'ufls'})]}), 'SHED');
  assert.equal(shedWord({districts: [district('SOL3', {dark: true, shedBy: 'directed'})]}), 'SHED');
});

test('X-45: OUTAGES under 0.05 MWh are $0 (a moment\'s dip), from 0.05 MWh at VCR', () => {
  assert.equal(allIn({servedMWh: 1e5, lightsMWh: 0.0018, costDollars: 1e6}, 1).outage, 0);
  assert.equal(allIn({servedMWh: 1e5, lightsMWh: OUTAGE_MIN_MWH, costDollars: 1e6}, 1).outage, V.VCR * OUTAGE_MIN_MWH);
});

test('X-45: the end card counts the player\'s accepted inputs only (a RE-DISPATCH as one; never the system\'s re-dispatch after them)', () => {
  const game = G.createGame({seed: 20261014, scenario: G.scenarioForSeed, storage: null, commit: 'player', system, planview});
  G.takeDesk(game);
  const a = G.makeActions(game), log0 = game.state.log.length;
  assert.equal(a.input({type: 'start', unit: 'ccgt2'}), '');
  assert.notEqual(a.input({type: 'start', unit: 'nope'}), '', 'refused');
  assert.equal(a.input({type: 'guard', mw: 100}), '');
  assert.equal(game.playerInputs, 2);
  G.runTo(game, game.state.tick + 600 * V.TICKS_PER_S);
  assert.equal(game.playerInputs, 2, 'the system\'s 5-minute dispatches are not the player\'s');
});

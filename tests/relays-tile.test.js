// Q-113 (the review of 2026-11-13, G3): RELAYS SHED lights while districts the relays shed are dark and not yet restored,
// also when the relays operate with no trip's watch (a desk run short until frequency sags: the daily of 7 Oct 2026 with
// no input, its first stage at 17:06:55). Before, the tile read only a contingency's watch and stayed dark.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../app/game.js';
import * as system from '../app/system.js';
import * as planview from '../app/planview.js';
import {V} from '../sim/params.js';

test('G3: relays shed outside a watch light RELAYS SHED until the districts are restored', () => {
  const game = G.createGame({seed: 20261007, scenario: G.scenarioForSeed, system, planview, commit: 'player', storage: null});
  G.takeDesk(game); game.director.paused = false;
  G.runTo(game, Math.round((17 + 10 / 60 - 4) * 3600) * V.TICKS_PER_S);
  const st = game.state, c = st.contIdx >= 0 ? st.conts[st.contIdx] : null;
  const dark = st.city.districts.filter(d => d.dark && d.shedBy === 'ufls').length;
  assert.ok(dark > 0, 'the relays have shed by 17:10');
  assert.ok(!c || st.tick >= c.watchEndTick, 'and no trip\'s watch is running');
  const tile = G.buildVm(game, {nowMs: 1000, dtS: 1 / 60}).alarms.tiles.find(x => x.id === 'ufls');
  assert.notEqual(tile.state, 'normal', 'RELAYS SHED is lit (' + tile.state + ')');
});

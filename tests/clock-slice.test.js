// Slice 2c's clock on the page's side (desk/README.md §32.7.2): D-6's and D-4's accepts on a 2-h slice of a desk
// day with the system, the planview and the view model. One input log gives one hashState ticked alone, played
// with F held and with 50 seeded random pauses; a trip's watch advances the grid clock by 0.5 min, and the outcome
// is the same viewed or skipped. (W6, the test budget: these were tests/clock-director.test.js's, 8 s in one file
// with the director's own; tools/d6.mjs plays the whole day.)
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {hashState} from '../sim/step.js';
import {SCENARIOS} from '../content/scenarios.js';
import * as D from '../app/director.js';
import * as G from '../app/game.js';
import * as system from '../app/system.js';
import * as planview from '../app/planview.js';
import {injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S, H = 3600;

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
// `leave`: each feeder card is left at once, as frames() leaves it (the reference has no frames to show one, and a
// restore at a card would queue the other feeder, D-27).
function slice(seen = {}, from = base, leave = false) {
  const out = {hash: '', near: '', accepted: 0};
  let act = null;
  const game = G.createGame({seed: SEED, scenario: SCENARIOS.desk, storage: mem(), system, planview, commit: 'player', beforeTick: g => {
    const t = g.state.tick;
    if (leave && D.feederCard(g.director, g.state)) G.ui(g, {do: 'goOn'});
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
  ref = slice({}, base, true);
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
  assert.deepEqual(fast.feeders, ['HAZ4', 'HAZ5', 'RED1'], 'each hand-back held the clock on its card, and the trip\'s relay stage (D-26) on its own');
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

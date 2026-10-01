// Stage C (desk/README.md §9): the greybox game end to end. next.html booted through
// app/shell.js with every REAL module (desk, map, Live Stack, system operator, plan view) in the
// stand-in DOM, driven by fake frames and a scripted player that only uses `actions`:
//  - default suite: 04:00-09:00 with desk, stack and RE-DISPATCH inputs, replayed headless to
//    the same hashState (F-6); then a trip walked through WATCH -> RESPOND-CARD -> RESPOND;
//  - slow suite: whole days to 04:00 with a player that restores districts (K-13).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument, installGlobals} from './lib/dom.js';
import {slowOnly} from './lib/sim-helpers.js';
import {bootGame} from '../app/shell.js';
import {createDesk} from '../desk/desk.js';
import {createMap} from '../render/map.js';
import {createLiveStack} from '../render/livestack.js';
import * as system from '../app/system.js';
import * as planview from '../app/planview.js';
import * as fleet from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {replay, hashState} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const TPS = V.TICKS_PER_S;
const tickAt = h => Math.round((h - V.DAY_START_H) * 3600 * TPS);

function boot(seed) {
  const doc = makeDocument(NEXT);
  let t = 1000;
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: () => 'blob:x', revokeObjectURL() {}}), Blob: class {}});
  const h = bootGame(doc, {createDesk, createMap, createLiveStack, system, planview, search: '?seed=' + seed, storage: null,
    audioWin: {}, raf: false, now: () => t});
  restore();
  const $ = id => doc.getElementById(id);
  // Frames of 0.1 real s (F-5's longest counted frame): 12 grid-s each at CRUISE.
  const frame = (dtS = 0.1) => { t += dtS * 1000; h.frame(dtS); };
  const refusals = [];
  const send = x => { const r = h.actions.input(x); if (r) refusals.push(x.type + ': ' + r); return r; };
  const take = agc => { $(agc ? 'btn-agc' : 'btn-hand').click(); doc.dispatch('keydown', {key: 'Enter'}); frame(); };
  return {doc, $, h, frame, send, refusals, take, st: () => h.game.state};
}

/** Dismiss any respond card and restore one permitted district per call (the restore bay's rule). */
function respondAndRestore(g) {
  const vm = g.h.vm();
  if (vm.mode.mode === 'RESPOND-CARD') g.h.actions.ui({do: 'dismissRespond'});
  if (vm.mode.locked) return;
  for (const d of vm.obs.districts) {
    if (d.dark && d.restoreBlock === '' && g.h.actions.restorePreview(d.id) === '') { g.send({type: 'restore', district: d.id}); return; }
  }
}

test('greybox day, 04:00-09:00: desk, Live Stack and RE-DISPATCH inputs through the real modules; the log replays (F-6)', () => {
  const g = boot(7);
  g.take(true);
  assert.equal(g.st().control.mode, 'AGC');
  assert.ok(g.st().tick >= V.PLAYER_START_TICK, 'the briefing ran headless to 04:30');
  assert.ok(g.st().plan.madeAtS >= 0, 'the 04:30 pre-dispatch is in state (L-0)');
  const did = new Set();
  while (g.st().tick < tickAt(9)) {
    g.frame();
    const vm = g.h.vm(), o = vm.obs;
    if (!did.has('lever') && o.s >= 3 * 3600) { // 07:00: the CCGT lever up 100 MW (K-1 / L-6)
      did.add('lever');
      const st = o.stations.find(x => x.id === 'ccgt');
      if (st.onCount > 0) assert.equal(g.send({type: 'basePoint', station: 'ccgt', mw: Math.min(st.maxMW, st.basePointMW + 100)}), '');
    }
    if (!did.has('stack') && o.s >= 3.5 * 3600) { // 07:30: a Live Stack drop for GT·A by +1 h (L-4)
      did.add('stack');
      const drop = planview.snapDrop(o, 'gta', o.s + 3600, 300);
      const inputs = drop.infeasible ? drop.ghost.inputs : drop.inputs;
      assert.ok(inputs && inputs.length >= 1, 'the drop is a planKey (and its starts)');
      for (const x of inputs) assert.equal(g.send(x), '', JSON.stringify(x));
    }
    if (!did.has('guard') && o.s >= 4 * 3600) { did.add('guard'); assert.equal(g.send({type: 'guard', mw: 200}), ''); }
    if (!did.has('redispatch') && o.s >= 4.25 * 3600) { did.add('redispatch'); assert.equal(g.h.actions.redispatch(), ''); }
    respondAndRestore(g);
  }
  assert.deepEqual([...did].sort(), ['guard', 'lever', 'redispatch', 'stack']);
  assert.deepEqual(g.refusals, []);
  assert.deepEqual(g.doc.canvasStats.bad, [], 'no NaN or Infinity reached a canvas');
  assert.ok(g.doc.canvasStats.calls > 10000, 'map, stack, dial and scope drew');
  const types = new Set(g.st().log.map(r => r.type));
  for (const k of ['planLoad', 'basePoint', 'planKey', 'guard']) assert.ok(types.has(k), 'logged ' + k);
  // F-6: seed + SIM_VERSION + log reproduce the session exactly.
  const r = replay(g.st().seed, CLASSIC, g.st().log, {untilTick: g.st().tick});
  assert.equal(hashState(r), hashState(g.st()));
});

test('greybox trip: WATCH locks the desk, the RESPOND card holds the clock and lights controls, then RESPOND and CRUISE (K-15, K-16)', () => {
  const g = boot(11);
  g.take(true);
  while (g.st().tick < tickAt(6)) { g.frame(); respondAndRestore(g); }
  assert.equal(g.st().conts.length, 0, 'no contingency before the test trip');
  // Trip the largest online machine at the next grid second (as the bench's DEBUG trip does).
  while (g.st().tick % TPS !== 0) g.frame(0.001);
  let big = -1;
  for (let i = 0; i < g.st().units.length; i++) if (g.st().units[i].sync && (big < 0 || g.st().units[i].outMW > g.st().units[big].outMW)) big = i;
  fleet.tripUnit(g.st(), big, 'test trip', V.HOT_TRIP_LOCKOUT_S, []);
  g.frame(1 / 60);
  let vm = g.h.vm();
  assert.equal(vm.mode.mode, 'WATCH');
  assert.equal(vm.mode.locked, true);
  assert.equal(vm.mode.watchVersion, 'full', 'the first watch ever is the full version');
  assert.notEqual(g.send({type: 'guard', mw: 100}), '', 'no input during the watch (K-15)');
  let n = 0;
  while (g.h.vm().mode.mode === 'WATCH' && n++ < 2000) g.frame(1 / 30);
  vm = g.h.vm();
  assert.equal(vm.mode.mode, 'RESPOND-CARD');
  assert.ok(vm.respond && vm.respond.lines.length <= 4, 'a card of at most 4 lines');
  assert.ok(vm.glow.size > 0, 'the card lights the controls that could answer it (L-9)');
  const tick = g.st().tick;
  for (let i = 0; i < 30; i++) g.frame();
  assert.equal(g.st().tick, tick, 'the card holds the clock');
  g.h.actions.ui({do: 'dismissRespond'});
  g.frame();
  // RESPOND (30x) runs until frequency is back in 49.85-50.15 Hz (D-5); a trip contained and
  // already back in band goes straight to CRUISE.
  const m = g.h.vm().mode;
  if (m.mode === 'RESPOND') assert.equal(m.rate, 30);
  else assert.ok(g.h.vm().obs.contingency.backInBandTick >= 0, 'CRUISE only once back in band, not ' + m.mode);
  n = 0;
  while (g.h.vm().mode.mode === 'RESPOND' && n++ < 5000) g.frame();
  assert.equal(g.h.vm().mode.mode, 'CRUISE');
  assert.deepEqual(g.doc.canvasStats.bad, []);
});

test('greybox whole days to 04:00 with a restoring player: never black, the end card shows, the log replays (slow)', {...slowOnly()}, () => {
  for (const seed of [7, 11, 20260930]) {
    const g = boot(seed);
    g.take(true);
    let frames = 0;
    while (!g.st().over && frames++ < 20000) { g.frame(); respondAndRestore(g); }
    assert.ok(g.st().over, 'seed ' + seed + ' reached 04:00');
    assert.equal(g.st().black, false, 'seed ' + seed);
    assert.equal(g.$('end-card').hidden, false);
    assert.deepEqual(g.doc.canvasStats.bad, []);
    const r = replay(g.st().seed, CLASSIC, g.st().log);
    assert.equal(hashState(r), hashState(g.st()), 'seed ' + seed + ' replays');
  }
});

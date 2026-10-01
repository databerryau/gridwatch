// F-5 / K-15 / K-16: the game director's modes, precedence and rates (app/director.js), and
// the game session's clock rules (app/game.js): the respond card holds the clock, any desk
// input dismisses it, the watch version (full / compact, with storage blocked too, C-8), and
// rate invariance (F-4): the same inputs at different modes give the same hashState.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, hashState} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import * as D from '../app/director.js';
import * as G from '../app/game.js';
import {injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;

// A state stepped to the first tick of a contingency injected at grid second atS.
function tripState(seed = 3, atS = V.PLAYER_START_S + 300) {
  const s = createState(seed, CLASSIC);
  injectTrip(s, atS);
  while (s.contIdx < 0) step(s);
  return s;
}

test('K-15: full and compact schedules; compact is ~11 real s, full ~29; both advance exactly WATCH_S', () => {
  assert.ok(Math.abs(D.watchRealS(D.WATCH_SCHEDULE) - 29) < 1e-9);
  assert.ok(Math.abs(D.watchRealS(D.WATCH_SCHEDULE_COMPACT) - 10.5) < 1e-9);
  for (const sch of [D.WATCH_SCHEDULE, D.WATCH_SCHEDULE_COMPACT]) assert.equal(sch[sch.length - 1].toS, V.WATCH_S);
  assert.deepEqual(D.WATCH_SCHEDULE_COMPACT.map(x => x.rate), [0.5, 2, 20]);
  assert.equal(D.watchRate(0, D.WATCH_SCHEDULE_COMPACT), 0.5);
  assert.equal(D.watchRate(3 * TPS, D.WATCH_SCHEDULE_COMPACT), 2);
  assert.equal(D.watchRate(10 * TPS, D.WATCH_SCHEDULE_COMPACT), 20);
});

test('the bench director is unchanged: no card, no RESPOND, the full watch, DEBUG speeds', () => {
  const s = tripState();
  const d = D.createDirector({paused: false, speed: 240});
  assert.equal(D.modeOf(d, s).mode, 'WATCH');
  assert.equal(D.rateOf(d, s), 0.15);
  while (s.tick < s.conts[0].watchEndTick) step(s);
  assert.equal(D.modeOf(d, s).mode, 'DEBUG');
  assert.equal(D.rateOf(d, s), 240, 'no card on the bench');
  step(s);
  assert.equal(D.rateOfLastTick(d, s), 240, 'the bench re-charges nothing outside a watch');
});

test('F-5: precedence PAUSE > WATCH > RESPOND-CARD > FOCUS > RESPOND > FAST > CRUISE, with each mode\'s rate', () => {
  const s = createState(3, CLASSIC);
  for (let i = 0; i < 10; i++) step(s);
  const d = D.createDirector({game: true, paused: false, seen: {watch: true}});
  assert.deepEqual([D.modeOf(d, s).mode, D.rateOf(d, s)], ['CRUISE', D.FLAT_RATE]);
  assert.equal(D.setFast(d, s, true), true);
  assert.deepEqual([D.modeOf(d, s).mode, D.rateOf(d, s)], ['FAST', D.FAST_FACTOR * D.FLAT_RATE]);
  D.focusRestore(d, s);
  assert.deepEqual([D.modeOf(d, s).mode, D.rateOf(d, s)], ['FOCUS', 1], 'a restore close plays at 1x');
  for (let i = 0; i < D.RESTORE_FOCUS_S * TPS; i++) step(s);
  assert.equal(D.modeOf(d, s).mode, 'FAST', 'FOCUS lasts 2 grid-s');
  s.scope = {unit: 'gta1', open: true}; // the sim's Phase 1a field (test poke)
  assert.deepEqual([D.modeOf(d, s).mode, D.rateOf(d, s)], ['FOCUS', 1], 'an open synchroscope plays at 1x');
  s.scope = {unit: '', open: false};
  D.setFast(d, s, false);
  assert.equal(D.modeOf(d, s).mode, 'CRUISE', 'F up');
  d.paused = true;
  assert.deepEqual([D.modeOf(d, s).mode, D.rateOf(d, s)], ['PAUSE', 0]);
  d.paused = false; d.hidden = true;
  assert.deepEqual([D.modeOf(d, s).mode, D.rateOf(d, s)], ['HIDDEN', 0]);
  d.hidden = false;

  // A contingency: WATCH beats FAST and FOCUS; PAUSE beats WATCH.
  const t = tripState();
  const e = D.createDirector({game: true, paused: false, seen: {watch: true}});
  e.fast = true; e.fastN = 0;
  t.scope = {unit: 'gta1', open: true};
  assert.equal(D.modeOf(e, t).mode, 'WATCH');
  assert.equal(D.modeOf(e, t).watchVersion, 'compact');
  assert.equal(D.rateOf(e, t), 0.5);
  e.paused = true;
  assert.equal(D.modeOf(e, t).mode, 'PAUSE');
  assert.equal(D.rateOf(e, t), 0);
  e.paused = false;
  t.scope = {unit: '', open: false};
  // The watch ends: the card holds the clock (rate 0), above FOCUS and FAST.
  while (t.tick < t.conts[0].watchEndTick) step(t);
  e.focusUntilTick = t.tick + 100;
  assert.deepEqual([D.modeOf(e, t).mode, D.rateOf(e, t)], ['RESPOND-CARD', 0]);
  assert.equal(D.respondCardOpen(e, t), true);
  e.focusUntilTick = -1;
  assert.equal(D.dismissCard(e, t), true);
  assert.equal(D.dismissCard(e, t), false, 'once');
  const c = t.conts[0];
  if (c.backInBandTick < 0) {
    assert.deepEqual([D.modeOf(e, t).mode, D.rateOf(e, t)], ['RESPOND', D.RESPOND_RATE]);
    assert.equal(D.setFast(e, t, true), false, 'F does nothing during RESPOND');
    c.backInBandTick = t.tick; // back in band (test poke)
  }
  assert.equal(D.modeOf(e, t).mode, 'CRUISE', 'RESPOND ends when frequency is back in band');
  c.backInBandTick = -1;
  const until = c.watchEndTick + D.RESPOND_MAX_S * TPS;
  assert.equal(D.modeOf(e, t).mode, 'RESPOND');
  while (t.tick < until) step(t);
  if (t.conts[0].backInBandTick < 0) assert.equal(D.modeOf(e, t).mode, 'CRUISE', 'RESPOND ends 5 grid-min after the card');
  assert.notEqual(D.modeOf(e, t).mode, 'FAST', 'F pressed before this contingency does not outlive it');
});

test('FAST ends on a new contingency and on a new P1/P2 alarm (endFast)', () => {
  const s = createState(3, CLASSIC);
  injectTrip(s, 120);
  step(s);
  const d = D.createDirector({game: true, paused: false, seen: {watch: true}});
  D.setFast(d, s, true);
  assert.equal(D.modeOf(d, s).mode, 'FAST');
  D.endFast(d);
  assert.equal(D.modeOf(d, s).mode, 'CRUISE');
  D.setFast(d, s, true);
  while (s.contIdx < 0) step(s);
  while (s.tick < s.conts[0].watchEndTick) step(s);
  D.dismissCard(d, s);
  s.conts[0].backInBandTick = s.tick;
  assert.notEqual(D.modeOf(d, s).mode, 'FAST', 'the contingency ended FAST');
});

test('K-15: full the first time ever, compact after; full again on a first HIGH RoCoF or a first UFLS; Esc only after a full one', () => {
  const s = tripState();
  const fresh = D.createDirector({game: true, paused: false});
  assert.equal(D.modeOf(fresh, s).watchVersion, 'full');
  assert.equal(D.rateOf(fresh, s), 0.15);
  assert.equal(D.skipWatch(fresh, s), false, 'no skipping the first full watch');
  const seen = D.createDirector({game: true, paused: false, seen: {watch: true, ufls: true, rocof: true}});
  assert.equal(D.modeOf(seen, s).watchVersion, 'compact');
  assert.equal(D.skipWatch(seen, s), true);
  assert.equal(D.modeOf(seen, s).mode, 'CRUISE', 'skipped: the rest at CRUISE');
  assert.equal(D.modeOf(seen, s).locked, true, 'skipping never unlocks the desk');
  // A first HIGH RoCoF is known on the first tick: full.
  const r = tripState();
  r.conts[0].rocofHzS = -1.4;
  const d1 = D.createDirector({game: true, paused: false, seen: {watch: true}});
  assert.equal(D.modeOf(d1, r).watchVersion, 'full');
  // A first UFLS operation during a compact watch upgrades the rest of it.
  const u = tripState();
  const d2 = D.createDirector({game: true, paused: false, seen: {watch: true, rocof: true}});
  assert.equal(D.modeOf(d2, u).watchVersion, 'compact');
  u.conts[0].uflsStages = 1;
  assert.equal(D.modeOf(d2, u).watchVersion, 'full');
  assert.equal(D.rateOf(d2, u), 0.15);
  // The watch's end marks what it showed as seen.
  while (u.tick < u.conts[0].watchEndTick) step(u);
  assert.equal(D.directorFrame(d2, u), true);
  assert.equal(d2.seen.ufls, true);
  // The first full watch sets seen.watch.
  while (s.tick < s.conts[0].watchEndTick) step(s);
  D.directorFrame(fresh, s);
  assert.equal(fresh.seen.watch, true);
});

// ------------------------------------------------------------------ the game session

// Storage stand-ins (C-8).
function memStorage() {
  const m = new Map();
  return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m};
}
const blocked = {getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }};

function playWatch(game, hz = 60) {
  // Frames until the card opens; returns {real, versions}.
  const versions = new Set();
  let real = 0, n = 0;
  while (!D.respondCardOpen(game.director, game.state) && n++ < hz * 120) {
    G.frame(game, 1 / hz);
    real += 1 / hz;
    const m = D.modeOf(game.director, game.state);
    if (m.watchVersion) versions.add(m.watchVersion);
  }
  return {real, versions: [...versions]};
}

test('K-16: the respond card holds the clock until Enter or any desk input; C-8: the watch version with storage blocked', () => {
  for (const storage of [blocked, null, memStorage()]) {
    const game = G.createGame({seed: 3, storage});
    G.takeDesk(game);
    injectTrip(game.state, Math.floor(game.state.tick / TPS) + 60);
    const w1 = playWatch(game);
    assert.deepEqual(w1.versions, ['full'], 'the first watch is full');
    assert.equal(D.respondCardOpen(game.director, game.state), true);
    const held = game.state.tick;
    for (let i = 0; i < 120; i++) G.frame(game, 1 / 60);
    assert.equal(game.state.tick, held, 'the clock does not advance while the card is open');
    const vm = G.buildVm(game, {nowMs: 0, dtS: 1 / 60});
    assert.equal(vm.mode.mode, 'RESPOND-CARD');
    assert.equal(vm.mode.rate, 0);
    assert.ok(vm.respond && vm.respond.lines.length <= 4);
    // Any desk input dismisses it (even one the sim refuses).
    G.sendInput(game, {type: 'tie', mw: 0});
    assert.equal(D.respondCardOpen(game.director, game.state), false);
    G.frame(game, 1 / 60);
    assert.ok(game.state.tick > held, 'the clock runs again');
    // The second watch is compact (the memory survives in the session even with storage blocked;
    // a first UFLS or HIGH RoCoF in it would upgrade it, so mark those seen).
    game.director.seen.ufls = game.director.seen.rocof = true;
    injectTrip(game.state, Math.floor(game.state.tick / TPS) + 1200);
    while (game.state.contIdx < 1) G.frame(game, 1 / 60);
    const w2 = playWatch(game);
    assert.deepEqual(w2.versions, ['compact'], 'the second watch is compact');
    assert.ok(Math.abs(w2.real - D.watchRealS(D.WATCH_SCHEDULE_COMPACT)) < 0.2, 'compact watch ' + w2.real + ' real s');
    assert.equal(G.ui(game, {do: 'dismissRespond'}), '', 'Enter dismisses');
    if (storage && storage.map) assert.ok(JSON.parse(storage.map.get(G.SEEN_KEY)).watch, 'seen saved');
  }
});

test('F-4 / C-7: the same inputs give the same hashState whatever the modes (FAST, pause, skip, card held long)', () => {
  const inputs = [[V.PLAYER_START_TICK + 777, {type: 'tie', mw: 300}], [V.PLAYER_START_TICK + 5001, {type: 'guard', mw: 150}],
    [V.PLAYER_START_TICK + 30000, {type: 'battery', mode: 'discharge', mw: 100}]];
  const until = V.PLAYER_START_TICK + 45 * 60 * TPS;
  const run = style => {
    let hash = 0;
    const game = G.createGame({seed: 5, storage: null, beforeTick: g => {
      for (const [t, x] of inputs) if (g.state.tick === t) assert.equal(G.sendInput(g, x), '');
      if (g.state.tick === until) hash = hashState(g.state); // frames overshoot differently at each rate
    }});
    G.takeDesk(game);
    injectTrip(game.state, V.PLAYER_START_S + 900);
    let i = 0;
    while (game.state.tick < until) {
      i++;
      if (style === 'fast' && i % 50 === 1) G.ui(game, {do: 'fast', on: true});
      if (style === 'pausey' && i % 97 === 0) G.ui(game, {do: 'pause'});
      if (style === 'skip') G.ui(game, {do: 'skipWatch'});
      G.frame(game, style === 'slowframes' ? 1 / 144 : 1 / 60);
      if (D.respondCardOpen(game.director, game.state) && (style !== 'holdcard' || i % 400 === 0)) G.ui(game, {do: 'dismissRespond'});
      if (style === 'pausey' && game.director.paused && i % 97 === 3) G.ui(game, {do: 'pause'});
      if (game.director.paused && game.phase === 'play' && i % 97 > 3) G.ui(game, {do: 'pause'});
    }
    G.runTo(game, until + 1);
    return {hash, log: game.state.log.length};
  };
  const ref = run('cruise');
  assert.equal(ref.log, 3);
  for (const style of ['fast', 'pausey', 'skip', 'holdcard', 'slowframes']) assert.deepEqual(run(style), ref, style);
});

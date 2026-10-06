// Stage C (desk/README.md §9): the greybox game end to end. next.html booted through
// app/shell.js with every REAL module (desk, map, Live Stack, system operator, plan view) in the
// stand-in DOM, driven by fake frames and a scripted player that only uses `actions`:
// 04:00-09:00 with desk, stack and RE-DISPATCH inputs, replayed headless to the same hashState
// (F-6); then a trip walked through WATCH -> RESPOND-CARD -> RESPOND; then K-23's keyboard day.
//
// Frames are sampled, not streamed: a day asks for few decisions (SPEC D-10), so between the
// moments a test looks at, the sim jumps headless (app/game.js runTo; viewing never changes the
// outcome, C-7) and the page draws one frame at each moment: before an input, the frame that
// carries it, and after. Frame-by-frame stepping is kept only where the pacing is what is
// checked (the card holding the clock, a held key); the watch's own pacing frame by frame is
// next.test.js's "K-15 / K-16 through the shell" and loop.test.js's "K-15 via the bench".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument, installGlobals} from './lib/dom.js';
import {bootGame, ARMED_WORD, UNDER_WAY_WORD} from '../app/shell.js';
import {runTo} from '../app/game.js';
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
  // The sim headless to `tick` (no frame drawn), then one frame of dt 0: the page draws that
  // moment and h.vm() reads it, with no tick run.
  const jump = tick => { runTo(h.game, tick); frame(0); };
  return {doc, $, h, frame, jump, send, refusals, take, st: () => h.game.state};
}

/** A watch the sim is in: run it out headless to its end (the card opens on the next frame). */
function watchOut(g) {
  const st = g.st();
  if (g.h.vm().mode.mode === 'WATCH') g.jump(st.conts[st.contIdx].watchEndTick);
}

/** The sim to the next whole grid second (where the bench's DEBUG trip lands), headless. */
const toWholeSecond = g => runTo(g.h.game, Math.ceil(g.st().tick / TPS) * TPS);

/** Trip the largest online machine (as the bench's DEBUG trip does). */
function tripBiggest(g) {
  let big = -1;
  for (let i = 0; i < g.st().units.length; i++) if (g.st().units[i].sync && (big < 0 || g.st().units[i].outMW > g.st().units[big].outMW)) big = i;
  fleet.tripUnit(g.st(), big, 'test trip', V.HOT_TRIP_LOCKOUT_S, []);
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
  // Each input at its moment: the sim jumps there headless, the page draws it (the frame before),
  // a card or a dark district is answered as the player would, the input goes in off that frame's
  // vm, and a 0.1-s frame carries it (the next moment's frame is the one after).
  const at = (h, name, act) => {
    g.jump(tickAt(h));
    watchOut(g);
    respondAndRestore(g);
    act(g.h.vm().obs);
    did.add(name);
    const t0 = g.st().tick;
    g.frame();
    assert.equal(g.st().tick - t0, 12 * TPS, name + ': a 0.1-s frame at CRUISE runs 12 grid s (the page runs the clock)');
  };
  at(7, 'lever', o => { // 07:00: the CCGT lever up 100 MW (K-1 / L-6)
    const st = o.stations.find(x => x.id === 'ccgt');
    if (st.onCount > 0) assert.equal(g.send({type: 'basePoint', station: 'ccgt', mw: Math.min(st.maxMW, st.basePointMW + 100)}), '');
  });
  at(7.5, 'stack', o => { // 07:30: a Live Stack drop for GT·A by +1 h (L-4)
    const drop = planview.snapDrop(o, 'gta', o.s + 3600, 300);
    const inputs = drop.infeasible ? drop.ghost.inputs : drop.inputs;
    assert.ok(inputs && inputs.length >= 1, 'the drop is a planKey (and its starts)');
    for (const x of inputs) assert.equal(g.send(x), '', JSON.stringify(x));
  });
  at(8, 'guard', () => assert.equal(g.send({type: 'guard', mw: 200}), ''));
  at(8.25, 'redispatch', () => assert.equal(g.h.actions.redispatch(), ''));
  g.jump(tickAt(9));
  watchOut(g);
  respondAndRestore(g);
  g.frame();
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
  g.jump(tickAt(6));
  assert.equal(g.st().conts.length, 0, 'no contingency before the test trip');
  // Trip the largest online machine at the next grid second (as the bench's DEBUG trip does).
  toWholeSecond(g);
  tripBiggest(g);
  g.frame(1 / 60);
  let vm = g.h.vm();
  assert.equal(vm.mode.mode, 'WATCH');
  assert.equal(vm.mode.locked, true);
  assert.equal(vm.mode.watchVersion, 'full', 'the first watch ever is the full version');
  assert.notEqual(g.send({type: 'guard', mw: 100}), '', 'no input during the watch (K-15)');
  // Samples of the watch: midway (15 grid s in) and one tick before its end, the desk still locked;
  // then the frame that plays its last tick opens the card.
  const c = g.st().conts[g.st().contIdx];
  for (const tick of [c.startTick + 15 * TPS, c.watchEndTick - 1]) {
    g.jump(tick);
    vm = g.h.vm();
    assert.equal(vm.mode.mode, 'WATCH', 'still the watch at ' + vm.mode.watchS + ' grid s');
    assert.equal(vm.mode.locked, true);
    assert.notEqual(g.send({type: 'guard', mw: 100}), '', 'no input during the watch (K-15)');
  }
  g.frame(1 / 30);
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
  // RESPOND lasts at most 5 grid min: sampled every 30 grid s.
  for (let n = 0; g.h.vm().mode.mode === 'RESPOND' && n < 20; n++) g.jump(g.st().tick + 30 * TPS);
  assert.equal(g.h.vm().mode.mode, 'CRUISE');
  assert.deepEqual(g.doc.canvasStats.bad, []);
});

// ---------------------------------------------------------------- Phase 1b: K-23, the keyboard-only day

test('K-23: a player sending only keyboard events runs the desk, the stack, the bay and the cards; the log replays', () => {
  const g = boot(7);
  const doc = g.doc;
  // Only these two reach the game: a keydown and a keyup on the document's focused element.
  const down = (key, extra) => doc.dispatch('keydown', Object.assign({key}, extra));
  const up = (key, extra) => doc.dispatch('keyup', Object.assign({key}, extra));
  const tap = (key, extra) => { down(key, extra); up(key, extra); g.frame(1 / 60); };
  const hold = (key, s) => { down(key); for (let t = 0; t < s; t += 0.05) g.frame(0.05); up(key); g.frame(1 / 60); };
  const types = () => g.st().log.map(r => r.type);
  const count = t => types().filter(x => x === t).length;
  // Play on to `tick`: the sim jumps there headless (the injected trip and the jumps are not
  // inputs); the frame drawn there answers a card by Enter, as the player would.
  const playTo = tick => {
    g.jump(tick);
    watchOut(g);
    if (g.h.vm().mode.mode === 'RESPOND-CARD') tap('Enter');
  };

  g.$('btn-agc').click();           // the default; the briefing's own buttons are native <button>s
  down('Enter'); up('Enter'); g.frame();
  assert.equal(g.h.game.phase, 'play', 'Enter takes the desk');
  playTo(tickAt(5));

  // 2: the CCGT lever, three steps up (K-1).
  tap('2');
  assert.equal(doc.activeElement.id, 'lever-ccgt');
  let n = count('basePoint');
  for (let i = 0; i < 3; i++) tap('ArrowUp');
  assert.ok(count('basePoint') > n, 'the lever moved by arrows');
  // 3: GT·A, S S starts its machine (K-3: never on one press).
  tap('3');
  tap('s');
  assert.equal(count('start'), 0, 'one S does nothing');
  tap('s');
  assert.equal(count('start'), 1, 'S S starts GT·A');
  // 7: the battery to DISCHARGE and up; G: the GUARD ring; 8: the tie.
  tap('7'); tap('ArrowRight'); tap('ArrowUp');
  assert.ok(count('battery') >= 1, 'battery order by keys');
  tap('g');
  assert.equal(doc.activeElement.id, 'ring-guard');
  tap('ArrowRight'); tap('ArrowRight');
  assert.ok(count('guard') >= 1, 'GUARD ring by keys');
  tap('8'); tap('ArrowUp');
  assert.ok(count('tie') >= 1, 'tie knob by keys');
  // 6: the hydro wheel.
  n = count('basePoint');
  tap('6'); tap('ArrowRight');
  assert.ok(count('basePoint') > n, 'hydro wheel by keys');
  // N: RE-DISPATCH.
  n = count('planLoad');
  tap('n');
  assert.equal(count('planLoad'), n + 1, 'RE-DISPATCH by key');
  // L: the Live Stack; 2 selects the CCGT layer, arrows move one snap step, Enter drops (L-4).
  tap('l');
  n = count('planKey');
  assert.equal(doc.activeElement.id, 'stack');
  tap('2'); tap('ArrowRight'); tap('ArrowRight'); tap('ArrowUp'); tap('Enter'); tap('Enter');
  assert.ok(count('planKey') > n, 'a Live Stack keyframe dropped by keys');
  // D held 0.6 s: industrial DR (never on a tap).
  tap('d');
  assert.equal(count('callDR'), 0);
  hold('d', 0.8);
  assert.equal(count('callDR'), 1, 'DR by a held key');
  // A, Shift+A, T, M, ?, comma, Space: presentation keys do not throw and do not log inputs.
  n = g.st().log.length;
  tap('a'); tap('A', {shiftKey: true}); tap('t'); tap('t'); tap('m'); tap(','); tap('Escape'); tap(' ');
  assert.equal(g.h.vm().mode.mode, 'PAUSE');
  tap(' ');
  assert.equal(g.h.vm().mode.mode, 'CRUISE', 'Space again resumes the clock');
  assert.equal(g.st().log.length, n, 'presentation keys are not sim inputs');

  // GT·A reaches full speed: O opens its scope (FOCUS, 1x), U closes it cleanly (K-12). Its
  // start is sampled every 30 grid s (it then waits AUTO_SYNC_S, 240 s, at full speed).
  const gta1 = () => g.h.vm().obs.units.find(u => u.id === 'gta1');
  let frames = 0;
  while (gta1().mode !== 'ready' && frames++ < 200) g.jump(g.st().tick + 30 * TPS);
  assert.ok(frames < 200, 'gta1 came to speed');
  tap('o');
  assert.equal(g.st().scope.unit, 'gta1', 'O opens the scope');
  tap('u');
  // The breaker closes on the next pass through 0 degrees: sampled every grid second.
  frames = 0;
  while (gta1().mode === 'ready' && frames++ < 120) g.jump(g.st().tick + TPS);
  assert.ok(gta1().sync, 'U synchronised it');

  // F-6: every key above became a logged input or nothing (the injected trip below is not an input).
  const r = replay(g.st().seed, CLASSIC, g.st().log, {untilTick: g.st().tick});
  assert.equal(hashState(r), hashState(g.st()), 'the keyboard day replays (F-6)');

  // A trip: the watch, then Enter dismisses the respond card (K-16); R reaches the restore bay.
  toWholeSecond(g);
  tripBiggest(g);
  g.frame(1 / 60);
  assert.equal(g.h.vm().mode.mode, 'WATCH');
  watchOut(g);
  assert.equal(g.h.vm().mode.mode, 'RESPOND-CARD');
  tap('Enter');
  assert.notEqual(g.h.vm().mode.mode, 'RESPOND-CARD', 'Enter takes the desk back');
  tap('r');
  const dark = g.h.vm().obs.districts.filter(d => d.dark);
  if (dark.length) {
    // Restore one district by keys once its lamp and preview allow it (sampled every 12 grid s,
    // a CRUISE frame's worth).
    frames = 0;
    n = count('restore');
    while (count('restore') === n && frames++ < 400) {
      g.jump(g.st().tick + 12 * TPS);
      watchOut(g);
      if (g.h.vm().mode.mode === 'RESPOND-CARD') { tap('Enter'); continue; }
      const d = g.h.vm().obs.districts.find(x => x.dark && x.restoreBlock === '' && g.h.actions.restorePreview(x.id) === '');
      if (d) { tap('r'); tap('Enter'); }
    }
    assert.ok(count('restore') > n, 'a district restored by R and Enter');
  }
  // An hour more of play, drawn every 15 grid min.
  const from = g.st().tick, end = Math.min(tickAt(24), from + 3600 * TPS);
  for (let k = 1; k <= 4; k++) playTo(from + Math.round(k * (end - from) / 4));

  assert.deepEqual(g.h.mods.errors, []);
  assert.deepEqual(doc.canvasStats.bad, []);
});

// ---------------------------------------------------------------- SPEC §9.1 Q-18: the page as boot.js boots it

test('Q-18, the real page: the clock is held at 04:30, the objective names a unit, starting it by keys clears the line; a slow double click starts one too; the tray says so', async () => {
  const {DESK} = await import('../content/scenarios.js');
  const doc = makeDocument(NEXT);
  let t = 1000;
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: () => 'blob:x', revokeObjectURL() {}}), Blob: class {}});
  const h = bootGame(doc, {createDesk, createMap, createLiveStack, system, planview, scenario: DESK, commit: 'player', startPaused: true,
    search: '?seed=7', storage: null, audioWin: {}, raf: false, now: () => t});
  restore();
  const $ = id => doc.getElementById(id);
  const frame = (dtS = 0.1) => { t += dtS * 1000; h.frame(dtS); };
  const tap = (key, extra) => { doc.dispatch('keydown', Object.assign({key}, extra)); doc.dispatch('keyup', Object.assign({key}, extra)); frame(1 / 60); };
  $('btn-take').click();
  frame();
  assert.equal(h.vm().mode.mode, 'PAUSE', 'the desk opens with the clock held');
  assert.equal($('objective').hidden, false);
  assert.match($('objective-text').textContent, /press Space to run/);
  const tick0 = h.game.state.tick;
  for (let i = 0; i < 20; i++) frame();
  assert.equal(h.game.state.tick, tick0);
  tap(' ');
  // Run until the line asks for the CCGT now, doing nothing else.
  let n = 0;
  while (!(h.vm().objective && h.vm().objective.level === 'act' && /CCGT 2 now/.test(h.vm().objective.text)) && n++ < 4000) frame();
  assert.ok(n < 4000, 'the objective asked for CCGT 2: ' + $('objective-text').textContent);
  assert.ok(h.vm().glow.has('guard-start-ccgt2'), 'and its START guard is lit');
  assert.equal($('objective').className, 'act');
  assert.match($('objective-level').textContent, /ACT NOW/);
  // asked early enough to read and answer at this rate (LINE_REACT_S): its deadline is real seconds away
  const ask = h.vm().objective;
  assert.ok((ask.startBy - h.vm().obs.s) / h.vm().mode.rate >= 10, 'the deadline ' + ((ask.startBy - h.vm().obs.s) / h.vm().mode.rate).toFixed(1) + ' real s away');
  tap('2'); tap('s');
  // C-10: the guard is lifted (armed), and before the second press the line says what it would do
  frame();
  assert.equal($('objective-level').textContent, ARMED_WORD);
  const armed = $('objective-text').textContent;
  assert.match(armed, /^Press again to confirm\. START CCGT 2: at minimum load \(175 MW\) by 0\d:\d\d, 49 min from now, and it must then run 4 h\. It covers the shortfall from 0\d:\d\d\.$/);
  assert.equal($('objective').className, 'act consider');
  // what the player is reading to confirm holds still while the clock runs on under it
  const clock = $('clock-text').textContent;
  for (let i = 0; i < 15; i++) frame();
  assert.notEqual($('clock-text').textContent, clock);
  assert.equal($('objective-text').textContent, armed, 'held as it read when the cover went up');
  tap('s');
  const log = h.game.state.log, at = log.findIndex(r => r.type === 'start' && r.args.unit === 'ccgt2');
  assert.equal(log.filter(r => r.type === 'start' && r.args.unit === 'ccgt2').length, 1, '2, S, S started it');
  // §21.4: the re-dispatch follows in the same call, so the next line is read off a plan that knows about the start
  assert.deepEqual([log[at + 1].type, log[at + 1].tick], ['planLoad', log[at].tick]);
  // the tray says so at once, as an event list does: the station's own words, and a jump to the lever
  const started = h.vm().tray.cards.find(c => /^START Riverton CCGT 2: running up, full speed at \d\d:\d\d\.$/.test(c.text));
  assert.deepEqual(started && [started.from, started.sev, started.button.label, started.button.target], ['STATION', 'info', 'TO THE LEVER', 'lever-ccgt']);
  assert.match($('tray').textContent, /START Riverton CCGT 2: running up/);
  for (let i = 0; i < 30; i++) frame();
  assert.doesNotMatch($('objective-text').textContent, /CCGT 2/, 'the line moves on');
  // By mouse, with the clock held (Space): a click arms GT·B 1's START, and a second click 3 s later
  // still commits; with the pointer still on the guard the line says the unit is under way.
  tap(' ');
  assert.equal(h.vm().mode.mode, 'PAUSE');
  const gtb = $('guard-start-gtb1');
  const click = () => { gtb.dispatch('pointerdown'); gtb.dispatch('pointerup'); gtb.click(); frame(1 / 60); };
  gtb.dispatch('pointerenter');
  click();
  assert.equal($('objective-level').textContent, ARMED_WORD);
  frame(3);
  click();
  assert.equal(log.filter(r => r.type === 'start' && r.args.unit === 'gtb1').length, 1, 'a second click 3 s after the first started it');
  assert.equal($('objective-level').textContent, UNDER_WAY_WORD);
  assert.match($('objective-text').textContent, /^GT·B 1 is starting: full speed at \d\d:\d\d, at minimum load by \d\d:\d\d\.$/);
  assert.ok(h.vm().tray.cards.some(c => /^START GT·B 1: running up/.test(c.text) && c.button.target === 'lever-gtb'), 'and its card is up');
  gtb.dispatch('pointerleave');
  tap(' ');
  // An alarm tile says what it means when pressed; ACK with nothing flashing says so.
  $('tile-n1').click();
  assert.match($('annunciator').textContent, /N-1 INSECURE: losing your biggest unit/);
  // A map click selects the plant's control.
  assert.deepEqual(h.mods.errors, []);
  const r = replay(7, DESK, h.game.state.log, {untilTick: h.game.state.tick});
  assert.equal(hashState(r), hashState(h.game.state));
});

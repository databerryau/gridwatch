// The alarm panel's hold on the clock (SPEC §9.1 Q-46, desk/README.md §30.3.12), on the real page
// headless (tests/lib/play.js): W, EXPLAIN or a tile opens the panel and holds the clock (mode
// ALARMS); closing it returns to exactly the run state before; Space closes it and runs; GO TO
// leaves an ordinary pause and the focus on its target; a key pressed outside the panel closes it
// as GO TO first; the watch and the RESPOND card wait for it, as with Space; Esc closes the
// top-most thing first (Q-47). The panel is presentation: the day's hash never sees it. Last,
// the stage-A skeleton of the ALL-IN score (Q-48): par stepped a slice a frame, in every mode.
// Sampled, not streamed: the sim jumps between moments and a frame is drawn around each press.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';
import {V} from '../sim/params.js';
import {hashState} from '../sim/step.js';
import * as G from '../app/game.js';
import * as S from '../app/score.js';

const TPS = V.TICKS_PER_S;
const held = p => ({mode: p.mode(), open: p.game.ui.alarmsOpen, paused: p.game.director.paused, held: p.game.director.held});

test('Q-46: W holds the clock and closing returns to exactly CRUISE or PAUSE; the badge, PLAY, FAST and the look say so', () => {
  const p = openGame({seed: 20261007});
  assert.equal(p.mode(), 'CRUISE');
  p.key('w');
  assert.deepEqual(held(p), {mode: 'ALARMS', open: true, paused: false, held: true});
  const tick = p.game.state.tick;
  p.real(1);
  assert.equal(p.game.state.tick, tick, 'the clock is held');
  const l = p.look();
  assert.match(l, /^CLOCK \S+ \| HELD 0× · Esc \|/m);
  assert.match(l, /^ALARMS open: UNDER FREQ$/m, 'the stub default: no pick, no W3 order yet');
  assert.match(l, /btn-pause "PLAY"/);
  assert.equal(p.$('rate-badge').className, 'ALARMS');
  assert.equal(p.doc.activeElement.id, 'btn-alarms-close', 'the panel took the focus on the frame it first showed');
  // F is refused while held, in blue, and says why
  p.keyDown('f'); p.frame(); p.keyUp('f'); p.frame();
  assert.match(p.look(), /^TOAST blue FAST waits: the alarm panel holds the clock: Esc closes it$/m);
  assert.equal(p.mode(), 'ALARMS');
  // W again (inside the panel: the fallback's W) closes it: CRUISE, the clock runs
  p.key('w');
  assert.deepEqual(held(p), {mode: 'CRUISE', open: false, paused: false, held: false});
  assert.equal(p.$('alarm-panel').hidden, true);
  assert.ok(p.game.state.tick > tick, 'running again');
  // From PAUSE: open, then Esc closes it and the player's own pause is still there
  p.key(' ');
  p.key('w');
  assert.deepEqual(held(p), {mode: 'ALARMS', open: true, paused: true, held: true});
  p.key('Escape');
  assert.deepEqual(held(p), {mode: 'PAUSE', open: false, paused: true, held: false});
  // the stub's ✕ CLOSE also closes it, and hands the focus back to what had it
  p.$('btn-mute').focus();
  p.key('w');
  assert.equal(p.doc.activeElement.id, 'btn-alarms-close');
  p.click('btn-alarms-close');
  assert.deepEqual(held(p), {mode: 'PAUSE', open: false, paused: true, held: false});
  assert.equal(p.doc.activeElement.id, 'btn-mute', 'the focus went back to the opener');
});

test('Q-46: Space closes the panel and runs the clock, from PAUSE as from CRUISE', () => {
  const p = openGame({seed: 20261007});
  p.key(' ');
  assert.equal(p.mode(), 'PAUSE');
  p.key('w');
  const tick = p.game.state.tick;
  p.key(' ');
  assert.deepEqual(held(p), {mode: 'CRUISE', open: false, paused: false, held: false});
  assert.ok(p.game.state.tick > tick);
  assert.equal(p.$('alarm-panel').hidden, true);
  // the pause button does the same
  p.key('w');
  p.click('btn-pause');
  assert.deepEqual(held(p), {mode: 'CRUISE', open: false, paused: false, held: false});
});

test('Q-46: GO TO leaves the clock paused and focuses its target (also when vm.focus names it); a focus command while open is GO TO', () => {
  const p = openGame({seed: 20261007});
  p.key('1');
  assert.equal(p.vm().focus, 'lever-coal');
  p.key('w');
  assert.equal(p.doc.activeElement.id, 'btn-alarms-close');
  assert.equal(p.h.actions.ui({do: 'alarmsGoto', target: 'lever-coal'}), '');
  assert.equal(p.doc.activeElement.id, 'lever-coal', 'focused again, though vm.focus already named it');
  p.frame();
  assert.deepEqual(held(p), {mode: 'PAUSE', open: false, paused: true, held: false});
  assert.equal(p.$('alarm-panel').hidden, true);
  assert.match(p.look(), /Clock held: press Space to run/, 'the hold became an ordinary pause, with its note');
  // a click elsewhere that focuses a control (a map suburb, a tray button) while the panel is open
  p.key(' ');
  p.key('w');
  p.h.actions.ui({do: 'focus', target: 'bay-restore'});
  p.frame();
  assert.deepEqual(held(p), {mode: 'PAUSE', open: false, paused: true, held: false});
  assert.equal(p.vm().focus, 'bay-restore');
  // the selection, and a tile pressed while closed (W opens on it for its note's life, then not)
  assert.equal(p.h.actions.ui({do: 'alarmsSel', id: 'nope'}), 'no such tile');
  assert.equal(p.h.actions.ui({do: 'alarmsPick', id: 'peak'}), '');
  p.key('w');
  assert.equal(p.vm().alarmsSel, 'peak');
  assert.equal(p.h.actions.ui({do: 'alarmsSel', id: 'n1'}), '');
  p.frame();
  assert.equal(p.vm().alarmsSel, 'n1');
  assert.match(p.look(), /^ALARMS open: N-1 INSECURE$/m);
  p.key('w');
  assert.equal(p.vm().alarmsSel, null, 'nothing selected while closed');
  p.real(G.ALARMS_PICK_MS / 1000 + 0.5, 0.5); // (paused: half-second frames are enough)
  p.key('w');
  assert.notEqual(p.vm().alarmsSel, 'peak', 'the pick lapsed with its note');
});

test('Q-46: a held watch keeps its tick and resumes there; the RESPOND card hides while the panel is open and returns on close', () => {
  const p = openGame({seed: 20261007});
  injectTrip(p.game.state, Math.floor(p.game.state.tick / TPS) + 60);
  assert.equal(p.until('trip', {max: '+10m'}).why, 'trip');
  p.real(1);
  assert.equal(p.mode(), 'WATCH');
  const tick = p.game.state.tick, watchS = p.vm().mode.watchS;
  p.key('w');
  assert.equal(p.mode(), 'ALARMS');
  assert.equal(p.vm().mode.locked, true, 'the desk stays locked: it is still the watch');
  assert.equal(p.vm().watch, null, 'the watch vignette waits, as with Space');
  p.real(0.5);
  assert.equal(p.game.state.tick, tick, 'held at the same tick');
  p.key('w');
  assert.equal(p.mode(), 'WATCH');
  assert.ok(p.vm().mode.watchS >= watchS && p.vm().mode.watchS < watchS + 1, 'the watch goes on from where it was');
  // the card
  assert.equal(p.until('card').why, 'card');
  assert.match(p.look(), /^CARD /m);
  p.key('w');
  assert.equal(p.mode(), 'ALARMS');
  assert.doesNotMatch(p.look(), /^CARD /m, 'the card hides while the panel is open');
  p.key('Escape');
  assert.equal(p.mode(), 'RESPOND-CARD');
  assert.match(p.look(), /^CARD /m, 'and returns on close');
  // GO TO while the card waits: the card holds the clock itself, so no pause is added
  p.key('w');
  p.h.actions.ui({do: 'alarmsGoto', target: 'lever-gta'});
  p.frame();
  assert.equal(p.game.director.paused, false);
  assert.equal(p.mode(), 'RESPOND-CARD');
});

test('Q-46: in the briefing W opens without holding; TAKE THE DESK carries the hold', () => {
  const p = openGame({seed: 20261007, take: false});
  p.frame();
  assert.equal(p.game.phase, 'briefing');
  p.key('w');
  assert.deepEqual(held(p), {mode: 'PAUSE', open: true, paused: true, held: false});
  assert.equal(p.$('alarm-panel').hidden, false);
  // Space closes it in every phase; in the briefing it then answers in blue (the clock waits for TAKE THE DESK)
  p.key(' ');
  assert.equal(p.game.ui.alarmsOpen, false);
  assert.match(p.look(), /^TOAST blue Take the desk first/m);
  p.key('w');
  p.click('btn-take');
  assert.equal(p.game.phase, 'play');
  assert.deepEqual(held(p), {mode: 'ALARMS', open: true, paused: true, held: true});
  const tick = p.game.state.tick;
  p.real(0.5);
  assert.equal(p.game.state.tick, tick);
  // Space closes it and runs, as in play
  p.key(' ');
  assert.deepEqual(held(p), {mode: 'CRUISE', open: false, paused: false, held: false});
});

test('Q-47: with the map focused and the drawer open, one Esc closes the drawer and the map keeps its focus and hover', () => {
  const p = openGame({seed: 20261007});
  p.h.actions.ui({do: 'focus', target: 'map'});
  p.frame();
  const map = p.doc.activeElement;
  assert.ok(p.$('map').contains(map) && map !== p.$('map'), 'the map\'s own canvas has the focus');
  p.key('ArrowRight');
  const hover = p.vm().hover;
  assert.ok(hover, 'the map\'s keys hover a plant');
  p.key('?');
  assert.equal(p.$('drawer').hidden, false);
  assert.ok(p.$('drawer').querySelectorAll('article').length > 10, 'the texts are in');
  p.key('Escape');
  assert.equal(p.$('drawer').hidden, true, 'Esc closed the drawer');
  // (booleans, not the elements: a failing message would print the whole stand-in DOM)
  assert.ok(p.doc.activeElement === map, 'the map never saw that Esc (it would have blurred itself)');
  assert.equal(p.vm().hover, hover);
  p.key('Escape');
  assert.ok(p.doc.activeElement !== map, 'with nothing open, Esc is the map\'s');
});

test('Q-46: with the panel open, 1 then S S closes it, pauses, and the START is sent; a key outside the panel closes it first', () => {
  const p = openGame({seed: 20261004}); // a weekend: one coal unit is off
  p.key('w');
  assert.equal(p.doc.activeElement.id, 'btn-alarms-close');
  const n = p.game.state.log.length;
  p.key('1');
  assert.deepEqual(held(p), {mode: 'PAUSE', open: false, paused: true, held: false});
  assert.equal(p.doc.activeElement.id, 'lever-coal');
  p.key('s'); p.key('s');
  assert.deepEqual(p.game.state.log.slice(n).filter(r => r.type === 'start').map(r => r.args.unit), ['coal4']);
  // the focus outside the panel: the key closes it as GO TO before anything else sees it
  p.key(' ');
  p.key('w');
  p.$('btn-mute').focus();
  p.key('t');
  assert.deepEqual(held(p), {mode: 'PAUSE', open: false, paused: true, held: false});
  assert.equal(p.vm().previewOn, true, 'and the key still did its own thing');
  // the harmless keys outside it (ACK, HORN OFF and the Shift on its way) and its own keys inside it do not close it
  p.key('w');
  p.$('btn-mute').focus();
  p.key('Shift', {shiftKey: true});
  p.key('A', {shiftKey: true});
  p.key('a');
  assert.deepEqual(held(p), {mode: 'ALARMS', open: true, paused: true, held: true});
  p.$('btn-alarms-close').focus();
  for (const k of ['ArrowDown', 'Home', 'End', 'Tab', 'Enter']) p.key(k);
  assert.deepEqual(held(p), {mode: 'ALARMS', open: true, paused: true, held: true});
});

test('Q-46: the panel is presentation only: the day with it used has the same hash and log as without, and replays to it', () => {
  const a = openGame({seed: 20261007}), b = openGame({seed: 20261007});
  for (const p of [a, b]) { p.to('04:40', {stop: []}); p.key(' '); }
  a.key('w'); a.h.actions.ui({do: 'alarmsSel', id: 'n1'}); a.real(1); a.key('Escape');
  a.key('w'); a.h.actions.ui({do: 'alarmsGoto', target: 'dial-battery'}); a.frame();
  assert.equal(a.game.state.tick, b.game.state.tick);
  for (const p of [a, b]) { assert.equal(p.send({type: 'guard', mw: 300}), ''); p.key(' '); p.to('05:30', {stop: []}); }
  assert.equal(a.game.state.tick, b.game.state.tick);
  assert.deepEqual(G.gameLog(a.game), G.gameLog(b.game), 'the same inputs at the same ticks, and no panel in the log');
  assert.equal(hashState(a.game.state), hashState(b.game.state));
  assert.equal(hashState(G.replayGame(G.gameLog(a.game), a.game.scenario, a.game.state.tick)), hashState(a.game.state));
});

test('Q-48 skeleton: par is stepped once a frame from TAKE THE DESK in every mode (more once the day is over); game.end carries the ALL-IN', () => {
  const calls = [];
  const runner = {done: false, score: null, series: [], progress: 0, black: false, at: () => null, step(n) { calls.push(n); return false; }};
  const p = openGame({seed: 20261007, take: false, par: runner});
  assert.ok(p.game.par === runner, 'a runner passed in is the game\'s');
  p.frame();
  assert.deepEqual(calls, [], 'not in the briefing');
  p.click('btn-take');
  p.key('w');
  p.key('Escape');
  assert.deepEqual(calls, [3000, 3000, 3000], 'PAUSE, ALARMS, PAUSE: one slice a frame');
  p.game.state.over = true;
  p.frame();
  assert.equal(calls.at(-1), 6000, 'a bigger slice once the day is over');
  runner.done = true;
  p.frame();
  assert.equal(calls.length, 4, 'nothing once par is done');
  // the end: the player's ALL-IN now; par's and the grade arrive with par (W4)
  const e = p.game.end, sc = e.score;
  assert.deepEqual([e.parAllIn, e.grade], [null, null]);
  assert.equal(e.allIn.supply, sc.costDollars);
  assert.equal(e.allIn.outage, V.VCR * sc.lightsMWh);
  assert.ok(Math.abs(e.allIn.carbon - V.VER * sc.co2tPerMWh * (sc.servedMWh + sc.lightsMWh)) < 1e-6);
  assert.equal(e.allIn.perHousehold, e.allIn.total / 1.9e6);
  assert.deepEqual(S.grade(e.allIn, e.allIn, false), {points: 1000, letter: 'A', star: true}, 'par\'s own day scores 1000');
  assert.equal(S.grade(e.allIn, null, false), null);
  // a black day is an F at once, without par; par is off by default
  const g = G.createGame({seed: 20261007, scenario: G.scenarioForSeed});
  assert.equal(g.par, null);
  G.takeDesk(g);
  g.state.over = true; g.state.black = true;
  G.buildVm(g, {nowMs: 0});
  assert.deepEqual(g.end.grade, {points: 0, letter: 'F', star: false});
});

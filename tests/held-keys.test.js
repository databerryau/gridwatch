// K-3 on the real page (the review of 2026-11-13, K1-K4 and G4): a held key's auto-repeat, a double-click and a key
// that reaches the shell's fallback never commit a guard, and on an AGC day an arrow never hand-sets a lever.
// The stand-in DOM sends no auto-repeat of its own, so each repeat is sent here as a browser sends it (repeat: true).
import test from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';

const sent = (p, type) => p.game.state.log.filter(r => r.type === type).length;
/** a key held for n auto-repeats (about 30 a second, a frame between each), then released */
function held(p, k, n = 12) {
  p.keyDown(k).frame();
  for (let i = 0; i < n; i++) { p.keyDown(k, {repeat: true}); p.frame(); }
  p.keyUp(k).frame();
}

test('K-3: X or S held on a focused lever commits nothing; two separate presses still do', () => {
  const p = openGame({seed: 20261014, run: false});
  p.key('1');
  held(p, 'x');
  assert.equal(sent(p, 'stop'), 0, 'X held on COAL: the auto-repeat is not the guard\'s second press');
  p.key('5');
  held(p, 's');
  assert.equal(sent(p, 'start'), 0, 'S held on GT·C');
  p.real(2.5);   // (the cover drops)
  p.key('5'); p.key('s'); p.key('s');
  assert.equal(sent(p, 'start'), 1, 'S, then S again: one START');
});

test('K-3: with focus on another desk control, S and X still go through the lever\'s guard, and an arrow moves nothing on an AGC day', () => {
  const p = openGame({seed: 20261014, run: false});
  p.key('1');
  p.click('btn-preview');   // DOM focus leaves the lever; vm.focus still names it
  held(p, 'x');
  assert.equal(sent(p, 'stop'), 0, 'no unguarded STOP from the shell\'s fallback');
  for (const k of ['ArrowDown', 'PageDown', 'ArrowUp']) p.key(k);
  assert.equal(sent(p, 'basePoint'), 0, 'K-24: the levers are readouts on an AGC day');
  assert.equal(p.game.system && p.game.system.edited ? p.game.system.edited.size || 0 : 0, 0, 'the dispatch is not held');
});

test('K-3: a double-click is one press of a guard; a click after it commits', () => {
  const p = openGame({seed: 20261014, run: false});
  assert.equal(p.$('station-start-coal').textContent, 'START', 'HOW TO PLAY names the button an AGC desk shows ("click START beside its lever")');
  const b = p.$('station-stop-coal');
  b.dispatch('click', {detail: 1}); p.frame();
  b.dispatch('click', {detail: 2}); p.frame();
  assert.equal(sent(p, 'stop'), 0, 'the double-click\'s second click is not STOP');
  b.dispatch('click', {detail: 1}); p.frame();
  assert.equal(sent(p, 'stop'), 1, 'a separate click on the lifted cover commits');
});

test('a click on a knob changes nothing (it focuses it); a trackpad swipe of small scroll events is one step, not twelve', () => {
  const p = openGame({seed: 20261014, run: false});
  const n0 = p.game.state.log.length;
  for (const id of ['knob-tie', 'dial-battery', 'ring-guard']) {
    p.pointer(id, 'pointerdown', 0, 20); p.pointer(id, 'pointerup', 0, 20); p.frame();
  }
  p.real(0.5);
  assert.deepEqual(p.game.state.log.slice(n0).map(r => r.type), [], 'a click left of centre sent nothing');
  const g0 = p.game.state.battery.guardMW;
  for (let i = 0; i < 12; i++) { p.pointer('ring-guard', 'wheel', 0, 0, {deltaY: -4}); p.frame(); }
  p.real(0.5);
  assert.ok(p.game.state.battery.guardMW - g0 <= 100, 'twelve 4-px scrolls: ' + g0 + ' → ' + p.game.state.battery.guardMW + ' MW');
});

test('HOW TO PLAY holds the clock while it is open, and closing it runs the clock again; a clock the player paused stays paused', () => {
  const p = openGame({seed: 20261014});
  assert.equal(p.game.director.paused, false);
  p.click('btn-help');
  assert.equal(p.game.director.paused, true, 'the drawer holds the clock');
  const t0 = p.game.state.tick;
  p.real(1);
  assert.equal(p.game.state.tick, t0, 'no grid time passes while it is open');
  p.click('btn-drawer-close');
  assert.equal(p.game.director.paused, false, 'closing runs it again');
  p.key(' ');
  p.click('btn-help'); p.click('btn-drawer-close');
  assert.equal(p.game.director.paused, true, 'paused by the player before: still paused');
});

test('in the briefing, Enter on a focused header button is that button\'s; a held Enter takes nothing', () => {
  const p = openGame({seed: 20261014, take: false});
  assert.equal(p.game.phase, 'briefing');
  p.$('btn-help').focus();
  p.key('Enter');
  assert.equal(p.game.phase, 'briefing', 'Enter on "?" did not take the desk');
  p.$('btn-help').blur && p.$('btn-help').blur();
  p.keyDown('Enter', {repeat: true}); p.frame();
  assert.equal(p.game.phase, 'briefing', 'a repeat is not a press');
  p.key('Enter');
  assert.equal(p.game.phase, 'play', 'Enter on the card takes the desk');
});

test('K-7: a key-up lost to Alt+Tab lets go of every held key: no reserve diesel armed by itself, no FAST left on', () => {
  const p = openGame({seed: 20261014});
  p.keyDown('f'); p.real(0.2);
  assert.equal(p.game.director.fast, true, 'F held: FAST');
  p.keyDown('e'); p.real(0.2);
  p.h.letGo();   // (the window's blur: the stand-in DOM has no window, so the test calls what the shell's listener calls)
  p.real(1.2);
  assert.equal(p.game.director.fast, false, 'FAST ended with the focus');
  assert.equal(sent(p, 'armRERT'), 0, 'E was held 0.2 s when the focus went: nothing armed');
});

test('a held Space toggles the clock once', () => {
  const p = openGame({seed: 20261014, run: false});
  assert.equal(p.game.director.paused, true);
  held(p, ' ', 7);   // (an odd count of repeats: toggled on each, the clock would end paused again)
  assert.equal(p.game.director.paused, false, 'Space held: the clock runs, and stays running');
});

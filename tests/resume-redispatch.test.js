// F-7 (the review of 2026-11-13, G1): a tie move, then RE-DISPATCH while paused, then the tab closes. The live page draws a
// frame between the two presses (its buildVm scans the tie move into the plan); the resume's replay makes both in one go.
// RE-DISPATCH scans the player's edits itself, so the two plan alike and the shift resumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {hashState} from '../sim/step.js';

const store = () => { const m = new Map(); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };

test('G1: tie, then RE-DISPATCH while paused: live play and the resume\'s replay plan alike, and the shift resumes', () => {
  const seed = 20261007, s = store();
  const a = openGame({seed, storage: s});
  a.to('10:00', {stop: []});
  a.key(' ');   // pause
  const mw = Math.max(-300, Math.min(300, Math.round(a.game.state.tie.setMW) + 150));
  a.h.actions.input({type: 'tie', mw});
  a.frame();    // a frame between two presses made by hand
  a.h.actions.redispatch();
  a.frame();
  const b = openGame({seed});
  b.to('10:00', {stop: []});
  b.key(' ');
  b.h.actions.input({type: 'tie', mw});
  b.h.actions.redispatch();   // no frame between (as the replay makes them)
  assert.equal(b.game.state.tick, a.game.state.tick);
  assert.equal(hashState(b.game.state), hashState(a.game.state), 'the same plan, frame or none');
  const c = openGame({seed, storage: s, resume: true, run: false});
  assert.equal(c.game.state.tick, a.game.state.tick, 'resumed at the saved tick, not a fresh day');
  assert.equal(hashState(c.game.state), hashState(a.game.state));
});

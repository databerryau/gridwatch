// L-1 (the review of 2026-11-13, V2): another day picked in a briefing (the shelf: an in-page reset at the same grid
// second) is another projection. The Live Stack's cache had no day in its key and kept the old day's skyline.
import test from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import * as PV from '../app/planview.js';

test('V2: after an in-page reset to another day the Live Stack shows the new day\'s forecast', () => {
  const g = openGame({seed: 20261007, take: false, par: false});
  g.frames(3);
  const stack = g.h.mods.stack;
  G.resetDay(g.game, 20261008);
  g.frames(20);   // (the stack redraws at most STACK_MAX_HZ a second at rest)
  const fresh = PV.project(g.vm().obs), shown = stack.debug.proj;
  let diff = 0;
  for (let k = 0; k < fresh.n; k++) diff = Math.max(diff, Math.abs(fresh.p50[k] - shown.p50[k]));
  assert.ok(diff < 1, 'the stack\'s P50 is the new day\'s (off by ' + Math.round(diff) + ' MW)');
});

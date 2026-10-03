// app/boot.js: starts the greybox game (next.html, Phase 1a). The page's one module script.
// It imports the stage B modules by their contract paths (desk/README.md §1) and hands them to
// app/shell.js, which mounts them, draws the overlays and runs the frame loop. The Phase 0.2
// bench's boot is app/bench-boot.js (bench.html).
//
// URL query: ?seed=N (default: today's date as YYYYMMDD) &perf (the F-11 overlay) &debug.

import {createDesk} from '../desk/desk.js';
import {createLiveStack} from '../render/livestack.js';
import {createMap} from '../render/map.js';
import * as system from './system.js';
import * as planview from './planview.js';
import {bootGame} from './shell.js';
import {scenarioForSeed} from './game.js';

export const handle = bootGame(globalThis.document, {createDesk, createLiveStack, createMap, system, planview,
  // SPEC §9.1 Q-18: the commitment is the player's, on the lean-overnight day, and the desk opens with
  // the clock held. Phase 2a (desk/README.md C-2): a seed that reads as a Saturday or Sunday plays
  // the weekend day ('desk-weekend'), any other seed the weekday ('desk').
  scenario: scenarioForSeed, commit: 'player', startPaused: true});

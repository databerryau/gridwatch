// app/boot.js: starts the greybox game (next.html, Phase 1a). The page's one module script.
// It imports the stage B modules by their contract paths (desk/README.md §1) and hands them to
// app/shell.js, which mounts them, draws the overlays and runs the frame loop. The Phase 0.2
// bench's boot is app/bench-boot.js (bench.html).
// W6 (F-9): only if the page's files are one release (app/build.js gate: else "GRIDWATCH was updated — refresh to
// continue"); then it watches the live site's build (watchLive). With no document (a test reading CARRIED), nothing.
//
// URL query: ?seed=N or ?date=YYYY-MM-DD (default: today's daily, content/dailies.js, Q-75) &perf (the F-11 overlay) &debug.

import {createDesk} from '../desk/desk.js';
import {createLiveStack} from '../render/livestack.js';
import {createMap} from '../render/map.js';
import * as system from './system.js';
import * as planview from './planview.js';
import {bootGame} from './shell.js';
import {scenarioForSeed} from './game.js';
import {gate, watchLive} from './build.js';
// F-9: the carriers, read whole (a file from before F-9 has no BUILD, and still links)
import * as params from '../sim/params.js';
import * as step from '../sim/step.js';
import * as score from './score.js';
import * as history from './history.js';
import * as director from './director.js';
import * as desk from '../desk/desk.js';
import * as livestack from '../render/livestack.js';
import * as closing from '../content/closing.js';

/**
 * F-9: the modules that keep a copy of app/build.js's BUILD, by path, where a mix breaks the game: the rules and the sim
 * (one day by two), the grade and the history (a run graded or stored wrongly), the director, the desk and the Live
 * Stack, the share card's lines. At most 8.
 */
export const CARRIED = Object.freeze({'sim/params.js': params, 'sim/step.js': step, 'app/score.js': score, 'app/history.js': history,
  'app/director.js': director, 'desk/desk.js': desk, 'render/livestack.js': livestack, 'content/closing.js': closing});

export const handle = globalThis.document ? gate(globalThis, CARRIED, () => bootGame(globalThis.document, {createDesk, createLiveStack, createMap, system, planview,
  // SPEC §9.1 Q-18: the commitment is the player's, on the lean-overnight day, and the desk opens with
  // the clock held. Phase 2a (desk/README.md C-2): a seed that reads as a Saturday or Sunday plays
  // the weekend day ('desk-weekend'), any other seed the weekday ('desk').
  // Q-48: par runs beside the day. Q-44: no `text` or `alarmPanel`: they load on first use.
  scenario: scenarioForSeed, commit: 'player', startPaused: true, par: true})) : null;
if (handle) watchLive(globalThis);

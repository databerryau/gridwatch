// app/boot.js: starts the greybox game (index.html; next.html from Phase 1a until W7, SPEC Q-126). The page's one module script.
// It imports the stage B modules by their contract paths (desk/README.md §1) and hands them to
// app/shell.js, which mounts them, draws the overlays and runs the frame loop. The Phase 0.2
// bench's boot is app/bench-boot.js (bench.html).
// W6 (F-9): only if the page's files are one release (app/build.js gate: else "GRIDWATCH was updated — refresh to
// continue"); the modules loaded on demand come through app/build.js late, the end card at boot (early); then it
// watches the live site's build (watchLive). With no document (a test reading CARRIED), nothing.
//
// URL query: ?seed=N or ?date=YYYY-MM-DD (default: today's daily, content/dailies.js, Q-75) &perf (the F-11 overlay) &debug.

import {createDesk} from '../desk/desk.js';
import {createLiveStack} from '../render/livestack.js';
import {createMap} from '../render/map.js';
import * as system from './system.js';
import * as planview from './planview.js';
import {bootGame} from './shell.js';
import {scenarioForSeed} from './game.js';
import {gate, late, early, watchLive} from './build.js';
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

/** Q-44: the modules app/shell.js takes on demand, each its import() (app/build.js LATE has them and what they bring). */
export const LOAD = Object.freeze({text: () => import('../content/text.js'), alarmPanel: () => import('./alarmpanel.js'),
  suburbCard: () => import('./suburbcard.js'), endCard: () => import('./endcard.js'), perf: () => import('./perf.js')});

/** The page's boot on `win`: the game's handle, or null when `carried` is not one release (gate). `load`: LOAD. */
export function boot(win, carried = CARRIED, load = LOAD) {
  const h = gate(win, carried, () => bootGame(win.document, {createDesk, createLiveStack, createMap, system, planview,
    // SPEC §9.1 Q-18: the commitment is the player's, on the lean-overnight day, and the desk opens with the clock held.
    // Phase 2a (desk/README.md C-2): a seed that reads as a Saturday or Sunday plays the weekend day ('desk-weekend'),
    // any other seed the weekday ('desk'). Q-48: par runs beside the day.
    scenario: scenarioForSeed, commit: 'player', startPaused: true, par: true,
    // Q-44: the rest load on first use, through late: one from another release that cannot link says so (F-9 review).
    // The end card and its charts load now (early), with the files above, not at 21:00: every day that ends needs them,
    // and one that cannot link stops this game before it is played, as the gate does.
    text: late(win, load.text), alarmPanel: late(win, load.alarmPanel), suburbCard: late(win, load.suburbCard), perf: late(win, load.perf),
    endCard: early(win, load.endCard, () => h)}));
  if (h) watchLive(win);
  return h;
}

export const handle = globalThis.document ? boot(globalThis) : null;

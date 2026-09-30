// app/boot.js: starts the greybox game (next.html, Phase 1a). The page's one module script.
// It imports the stage B modules by their contract paths (desk/README.md §1) and hands them to
// app/shell.js, which mounts them, draws the overlays and runs the frame loop. The Phase 0.2
// bench's boot is app/bench-boot.js (bench.html).
//
// URL query: ?seed=N (default: today's date as YYYYMMDD) &perf (the F-11 overlay).

import {createDesk} from '../desk/desk.js';
import {createLiveStack} from '../render/livestack.js';
import {createMap} from '../render/map.js';
import * as system from './system.js';
import * as planview from './planview.js';
import {bootGame} from './shell.js';

export const handle = bootGame(globalThis.document, {createDesk, createLiveStack, createMap, system, planview});

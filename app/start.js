// app/start.js: next.html's one module script (W6, Y-8). Below the desk's floor or on a touch-only device it shows the
// landing page (app/landing.js) and never loads the game; otherwise it loads the game (app/boot.js), at once.
// ?play skips the landing page (a small window with a mouse can also press PLAY ANYWAY on it).

import {needsLanding, showLanding} from './landing.js';

/** 'landing' or 'game'; load() imports the game. */
export function start(win, load = () => import('./boot.js')) {
  if (needsLanding(win) && !/[?&]play\b/.test(String(win.location && win.location.search))) {
    showLanding(win.document, win, load);
    return 'landing';
  }
  load();
  return 'game';
}

if (globalThis.document && globalThis.location) start(globalThis);

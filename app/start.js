// app/start.js: next.html's one module script (W6, Y-8). Below the desk's floor or on a touch-only device it shows the
// landing page (app/landing.js) and never loads the game; otherwise it loads the game (app/boot.js), at once.
// ?play skips the landing page (a small window with a mouse can also press PLAY ANYWAY on it).
// ?selftest (W6, risk 5) shows the golden-run check (app/selftest.js) in place of the game, on any screen, before the landing check.

import {needsLanding, showLanding} from './landing.js';

/** 'selftest', 'landing' or 'game'; load() imports the game, selftest() the check. */
export function start(win, load = () => import('./boot.js'), selftest = () => import('./selftest.js')) {
  const search = String(win.location && win.location.search);
  if (/[?&]selftest\b/.test(search)) {
    selftest().then(m => m.showSelftest(win.document, win), e => { win.document.body.textContent = 'The selftest did not load: ' + (e && e.message || e); });
    return 'selftest';
  }
  if (needsLanding(win) && !/[?&]play\b/.test(search)) {
    showLanding(win.document, win, load);
    return 'landing';
  }
  load();
  return 'game';
}

if (globalThis.document && globalThis.location) start(globalThis);

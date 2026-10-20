// app/start.js: the game page's one module script (index.html; next.html until W7's switch-over, Q-126) (W6, Y-8). Below the
// desk's floor or on a touch-only device it shows the landing page (app/landing.js) and never loads the game; otherwise it
// loads the game (app/boot.js), at once.
// ?play skips the landing page. On a computer whose window is what is small, the landing page offers PLAY ANYWAY (and FULL
// SCREEN in Chrome and Edge), and loads the game itself once the window holds the desk (it listens for resize until then).
// ?selftest (W6, risk 5) shows the golden-run check (app/selftest.js) in place of the game, on any screen, before the landing check.

import {needsLanding, showLanding} from './landing.js';
import {loadFailed} from './build.js';

/** W7 (Q-126): next.html's count of hops back to the root (its loop guard while the old root is still cached); cleared here. */
export const HOP_KEY = 'gridwatch:hop';

/** 'selftest', 'landing' or 'game'; load() imports the game, selftest() the check. */
export function start(win, load = () => import('./boot.js'), selftest = () => import('./selftest.js')) {
  try { win.sessionStorage.removeItem(HOP_KEY); } catch { /* (no session storage: next.html never counted) */ }
  const search = String(win.location && win.location.search);
  if (/[?&]selftest\b/.test(search)) {
    selftest().then(m => m.showSelftest(win.document, win), e => { win.document.body.textContent = 'The selftest did not load: ' + (e && e.message || e); });
    return 'selftest';
  }
  // W6 (F-9): a load that fails (files from two releases that cannot link, after a deploy) says so, not a blank page
  const play = () => { try { Promise.resolve(load()).catch(e => loadFailed(win, e)); } catch (e) { loadFailed(win, e); } };
  if (needsLanding(win) && !/[?&]play\b/.test(search)) {
    showLanding(win.document, win, play);
    return 'landing';
  }
  play();
  return 'game';
}

if (globalThis.document && globalThis.location) start(globalThis);

// app/build.js: W6, F-9, version coherence. Pages caches each file for 10 minutes, so after a deploy a browser can hold
// files from two releases: a mix that fails to start, or plays one day by two sets of rules.
// BUILD names the release (its date; '.2' for a second that day), bumped by hand at release, never by an ordinary commit:
// here, in version.json (the live build) and in the eight carriers' copies (app/boot.js CARRIED; copies, as a page loads
// this file once and re-exports of it would always agree). tests/version.test.js fails until all of them agree.
// At boot a carrier from another release stops the game (gate); a mix that cannot even link fails app/start.js's load
// (loadFailed). While it plays, a live build that moved on gets a quiet note (watchLive). Never a reload (C-3): the
// player refreshes, and first this page's files are fetched again past the cache (refetch), so the refresh loads one
// release. (A cached app/start.js can meet a newer copy of this file: keep the name loadFailed.)

export const BUILD = '2026-10-16';
/** The live build, beside next.html: {"build": BUILD}. */
export const VERSION_FILE = 'version.json';
/** At most one live check per this many ms (a tab flicked back and forth asks once). */
export const CHECK_MS = 60e3;
export const UPDATED = 'GRIDWATCH was updated — refresh to continue';
export const UPDATED_WHY = 'Part of the old version was still in your browser.';
export const NOT_LOADED = 'GRIDWATCH could not load — refresh to try again';
export const LATER = 'GRIDWATCH was updated: refresh before your next shift.';

const CSS = '#updated{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px 16px;' +
  'background:#0d1117;color:#c9d1d9;font:16px/1.5 system-ui,sans-serif;text-align:center}' +
  '#updated h1{font:700 22px/1.3 ui-monospace,monospace;color:#f0f6fc;margin:0 0 8px}#updated p{margin:0;color:#8b949e;font-size:14px}' +
  // (the note: the map's top right, under the header's buttons and under every card and panel)
  '#build-note{position:fixed;z-index:5;top:calc(var(--hdr,32px) + 6px);right:8px;display:flex;align-items:center;gap:4px;' +
  'padding:0 2px 0 10px;border:1px solid #58a6ff;border-radius:12px;background:#0d2238;color:#c9d1d9;font:11px ui-monospace,monospace}' +
  '#build-note button{border:0;background:none;padding:0 6px;color:#8b949e}';

// An element maker for `doc`, once the CSS is in its head
function styled(doc) {
  const el = (tag, text, parent) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (parent) parent.appendChild(n); return n; };
  if (doc.head && !doc.getElementById('build-css')) el('style', CSS, doc.head).id = 'build-css';
  return el;
}

// The page's message in place of the game, once; `why` (its title) says what told it so
function banner(win, title, line, why) {
  try {
    const doc = win.document;
    if (doc.getElementById('updated')) return;
    const el = styled(doc), root = el('div', '', doc.body), box = el('div', '', root);
    root.id = 'updated';
    root.setAttribute('role', 'alert');
    root.title = why;
    el('h1', title, box);
    el('p', line, box);
  } catch { /* (no page to draw on) */ }
}

// The page and every file of this site it has loaded, fetched again past the cache. The modules it runs are loaded
// already, so nothing in it changes; the player's refresh then finds one release.
function refetch(win) {
  try {
    const here = new URL(String(win.location.href)), urls = new Set([here.origin + here.pathname + here.search]);
    for (const e of win.performance.getEntriesByType('resource')) {
      const u = new URL(e.name);
      if (u.origin === here.origin && !u.pathname.endsWith('/' + VERSION_FILE)) urls.add(u.origin + u.pathname + u.search);
    }
    for (const u of urls) Promise.resolve().then(() => win.fetch(u, {cache: 'reload'})).catch(() => {});
  } catch { /* (no list: the refresh may take two) */ }
}

/** Boot: start() when every carrier ({path: module}) is this release; else UPDATED over the page, and null (no game). */
export function gate(win, carried, start) {
  const odd = Object.keys(carried).filter(p => !carried[p] || carried[p].BUILD !== BUILD);
  if (!odd.length) return start();
  banner(win, UPDATED, UPDATED_WHY, 'Not release ' + BUILD + ': ' + odd.join(', '));
  refetch(win);
  return null;
}

/** app/start.js: the game failed to load. A SyntaxError is a mix that cannot link (a missing export); else, in its words. */
export function loadFailed(win, e) {
  const mix = !!e && e.name === 'SyntaxError', words = String((e && e.message) || e);
  banner(win, mix ? UPDATED : NOT_LOADED, mix ? UPDATED_WHY : words, words);
  refetch(win);
}

// The live site's BUILD, past the cache, or null: a check that fails says nothing
async function liveBuild(win) {
  try {
    const r = await win.fetch(VERSION_FILE, {cache: 'no-store'});
    const j = r && r.ok ? await r.json() : null;
    return j && typeof j.build === 'string' && j.build ? j.build : null;
  } catch {
    return null;
  }
}

// LATER, once, with ✕ to put it away: no pause, no key, no focus
function note(win) {
  try {
    const doc = win.document;
    if (doc.getElementById('build-note')) return;
    const el = styled(doc), n = el('div', '', doc.body);
    n.id = 'build-note';
    n.setAttribute('role', 'status');
    el('span', LATER, n);
    const x = el('button', '✕', n);
    x.title = 'Hide this note';
    x.setAttribute('aria-label', x.title);
    x.addEventListener('click', () => n.remove());
  } catch { /* (no page to draw on) */ }
}

/** While the page plays: now, and when the tab comes back (at most once per CHECK_MS), until a live build that moved on is told. */
export function watchLive(win, now = () => Date.now()) {
  let last = -Infinity, told = false;
  const check = async () => {
    if (told || now() - last < CHECK_MS) return;
    last = now();
    const live = await liveBuild(win);
    if (!live || live === BUILD) return;
    told = true;
    note(win);
    refetch(win);
  };
  const doc = win.document;
  try { doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') check(); }); } catch { /* (the first check only) */ }
  check();
}

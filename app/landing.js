// app/landing.js: W6, Y-8: the page a shared link opens on a phone, or in a window too small for the desk. The game needs a
// keyboard, a mouse and a screen of at least DESK_W x DESK_H (C-9), and a shared link is mostly opened on a phone; so below
// that viewport, or with a touch-only pointer, next.html shows this instead of the desk, and the game is never loaded
// (app/start.js). On a phone it says what GRIDWATCH is, shows the link preview (og.png), and offers COPY LINK, to send it to
// a computer. On a computer (a pointer that can aim, a screen bigger than a phone's) it is the window that is small, not the
// device: a 1920x1080 laptop at 150% is 1280x720, and its maximised browser about 1280x587. Then it says how far the window
// falls short, offers FULL SCREEN when the screen holds the desk, and PLAY ANYWAY, and starts the game by itself as soon as
// the window holds the desk (full screen, F11, zooming out or a bigger window). Self-contained (no game module), so a phone
// downloads only this.

/** C-9: the desk's floor (CSS px). */
export const DESK_W = 1280, DESK_H = 600;
export const PITCH = 'Keep a city\'s lights on for one day: start power stations before the city needs them, and catch the trips. A new daily every day, about six minutes.';
export const NEEDS = 'GRIDWATCH is played on a computer: a keyboard, a mouse and a screen at least ' + DESK_W + ' by ' + DESK_H + '. Send yourself the link:';

const CSS = '#landing{position:fixed;inset:0;overflow:auto;z-index:100;background:#0d1117;color:#c9d1d9;font:16px/1.5 system-ui,sans-serif;padding:24px 16px}' +
  '#landing .in{max-width:560px;margin:0 auto}#landing h1{font:700 28px/1.2 ui-monospace,monospace;letter-spacing:2px;color:#e6edf3;margin:8px 0 12px}' +
  '#landing img{display:block;width:100%;height:auto;border:1px solid #30363d;border-radius:6px;margin:16px 0}' +
  '#landing button{font:700 15px system-ui,sans-serif;padding:10px 18px;margin:4px 8px 4px 0;border-radius:6px;border:1px solid #58a6ff;background:#161b22;color:#e6edf3;cursor:pointer}' +
  '#landing .dim{color:#8b949e;font-size:14px}#landing .size{color:#d29922;font-weight:600}#landing #landing-full{background:#1f6feb;border-color:#1f6feb}' +
  'body.landing>*:not(#landing){display:none!important}' +
  // (the desk's floor, min-width 1280px on the body, would keep a phone's page 1280 wide)
  'html:has(body.landing),body.landing{display:block!important;min-width:0!important;min-height:0!important;width:auto!important;height:auto!important;overflow:auto!important}';

const media = (win, q) => { try { return typeof win.matchMedia === 'function' && !!win.matchMedia(q).matches; } catch { return false; } };
/** A pointer that can aim (a mouse or a trackpad), anywhere on the device. */
export const finePointer = win => media(win, '(any-pointer: fine)');
// The viewport the desk would get: the window's, or the screen's (a phone widens its window to the desk's own min-width
// before this runs). On a computer the window's alone: zooming out widens it past a small screen (Chrome keeps the screen's
// size as it was).
function viewport(win) {
  const sc = onComputer(win) ? {} : win.screen || {};
  return {w: Math.min(win.innerWidth, sc.width > 0 ? sc.width : Infinity), h: Math.min(win.innerHeight, sc.height > 0 ? sc.height : Infinity)};
}
/** Y-8: the landing page, not the desk: a viewport below the floor, or only a touch pointer. */
export function needsLanding(win) {
  const touchOnly = media(win, '(pointer: coarse)') && !finePointer(win), {w, h} = viewport(win);
  return touchOnly || !(w >= DESK_W) || !(h >= DESK_H);
}
/**
 * A computer, whose window is what is small: a pointer that can aim, and a screen whose short side is not a phone's (a
 * phone with a stylus may have the pointer). The phone's page would tell someone at a computer to go to a computer.
 */
export function onComputer(win) {
  const sc = win.screen || {};
  return finePointer(win) && !(Math.min(sc.width, sc.height) < DESK_H);
}
/** The small window's line: how far it falls short of the desk. */
export function shortOf(w, h) {
  const miss = [w < DESK_W && DESK_W - w + ' px too narrow', h < DESK_H && DESK_H - h + ' px too short'].filter(Boolean);
  return 'This window is ' + w + ' by ' + h + ': ' + miss.join(' and ') + ' for the desk (' + DESK_W + ' by ' + DESK_H + ').';
}
// The keys for full screen and zooming out, on a Mac or elsewhere
const keysOf = win => (/Mac/.test(String(win.navigator && win.navigator.platform)) ?
  {full: 'Control, Command and F', zoom: 'Command and minus'} : {full: 'F11', zoom: 'Ctrl and minus'});

// Y-5's copy, kept here so the landing page loads nothing else: the clipboard, else a hidden textarea
async function copy(win, text) {
  try { const c = win.navigator && win.navigator.clipboard; if (c && typeof c.writeText === 'function') { await c.writeText(text); return true; } } catch { /* (the fallback) */ }
  try {
    const doc = win.document, ta = doc.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    doc.body.appendChild(ta); ta.select();
    const ok = typeof doc.execCommand === 'function' && doc.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

/**
 * Show the landing page in `doc`: the phone's, or on a computer the small window's. play(): load the game (PLAY ANYWAY,
 * offered only with a pointer that can aim; on a computer also once the window holds the desk).
 * @returns {Element} #landing
 */
export function showLanding(doc, win, play) {
  const el = (tag, text, parent, cls) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };
  if (doc.head) { const st = el('style', CSS, doc.head); st.id = 'landing-css'; }
  const root = el('div', '', doc.body), box = el('div', '', root, 'in');
  root.id = 'landing';
  root.setAttribute('role', 'main');
  el('h1', 'GRIDWATCH', box);
  el('p', PITCH, box);
  const listen = typeof win.addEventListener === 'function';
  let size = null;
  const go = () => {
    if (listen) win.removeEventListener('resize', fits);
    root.remove(); if (doc.body.classList) doc.body.classList.remove('landing'); play();
  };
  // (on a computer: a window that grows to the floor, by full screen, F11, a zoom or a drag, starts the game)
  function fits() {
    if (!needsLanding(win)) return go();
    const {w, h} = viewport(win);
    size.textContent = shortOf(w, h);
  }
  const playAnyway = () => {
    const b = el('button', 'PLAY ANYWAY', box);
    b.id = 'landing-play';
    b.title = 'The desk needs ' + DESK_W + ' by ' + DESK_H + ': parts of it may not fit this window';
    b.addEventListener('click', go);
  };
  if (onComputer(win)) {
    const {w, h} = viewport(win), keys = keysOf(win), sc = win.screen || {}, page = doc.documentElement;
    size = el('p', shortOf(w, h), box, 'size');
    size.id = 'landing-size';
    // full screen helps only when the screen holds the desk; on a smaller screen, zooming out still fits it
    const enter = page && (page.requestFullscreen || page.webkitRequestFullscreen), screenFits = sc.width >= DESK_W && sc.height >= DESK_H;
    const full = screenFits && typeof enter === 'function' && doc.fullscreenEnabled !== false, zoom = 'zoom out (' + keys.zoom + ')';
    el('p', 'The game starts by itself once the desk fits: ' + (full ? 'press FULL SCREEN (or ' + keys.full + '), or ' + zoom + '.' :
      screenFits ? 'press ' + keys.full + ' for full screen, or ' + zoom + '.' : zoom + ' until it does.'), box).id = 'landing-how';
    const said = el('p', '', null, 'dim');
    said.id = 'landing-said';
    said.setAttribute('aria-live', 'polite');
    if (full) {
      const b = el('button', 'FULL SCREEN', box);
      b.id = 'landing-full';
      b.title = 'The same as ' + keys.full;
      b.addEventListener('click', () => {
        let asked;
        try { asked = Promise.resolve(enter.call(page)); } catch (e) { asked = Promise.reject(e); }
        asked.then(() => {
          // Esc stays the game's (it closes a card, skips the watch): with the keyboard locked, Chrome and Edge leave full
          // screen on a held Esc instead
          const kb = win.navigator && win.navigator.keyboard;
          if (kb && typeof kb.lock === 'function') kb.lock(['Escape']).catch(() => {});
        }, () => { said.textContent = 'Full screen was blocked: press ' + keys.full + '.'; });
      });
    }
    playAnyway();
    box.appendChild(said);
    if (listen) win.addEventListener('resize', fits);
  } else {
    const img = el('img', '', box);
    img.src = 'og.png'; img.alt = 'GRIDWATCH: a frequency trace falling and caught, under the title';
    el('p', NEEDS, box);
    const link = el('button', 'COPY LINK', box), said = el('p', '', box, 'dim');
    link.id = 'landing-copy';
    said.id = 'landing-said';
    said.setAttribute('aria-live', 'polite');
    link.addEventListener('click', () => copy(win, String(win.location.href)).then(ok => {
      said.textContent = ok ? 'Copied: paste it into a message to yourself.' : 'Copy was blocked: the link is ' + win.location.href;
      if (ok) link.textContent = 'COPIED';
    }));
    if (finePointer(win)) playAnyway();
  }
  if (doc.body.classList) doc.body.classList.add('landing');
  return root;
}

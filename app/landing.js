// app/landing.js: W6, Y-8: the page a shared link opens on a phone. The game needs a keyboard, a mouse and a screen of at
// least DESK_W x DESK_H (C-9), and a shared link is mostly opened on a phone; so below that viewport, or with a touch-only
// pointer, next.html shows this instead of the desk, and the game is never loaded (app/start.js). It says what GRIDWATCH is,
// shows the link preview (og.png), and offers COPY LINK, to send it to a computer; a small window with a mouse also gets
// PLAY ANYWAY. Self-contained (no game module), so a phone downloads only this.

/** C-9: the desk's floor (CSS px). */
export const DESK_W = 1280, DESK_H = 600;
export const PITCH = 'Keep a city\'s lights on for one day: start power stations before the city needs them, and catch the trips. A new daily every day, about six minutes.';
export const NEEDS = 'GRIDWATCH is played on a computer: a keyboard, a mouse and a screen at least ' + DESK_W + ' by ' + DESK_H + '. Send yourself the link:';

const CSS = '#landing{position:fixed;inset:0;overflow:auto;z-index:100;background:#0d1117;color:#c9d1d9;font:16px/1.5 system-ui,sans-serif;padding:24px 16px}' +
  '#landing .in{max-width:560px;margin:0 auto}#landing h1{font:700 28px/1.2 ui-monospace,monospace;letter-spacing:2px;color:#e6edf3;margin:8px 0 12px}' +
  '#landing img{display:block;width:100%;height:auto;border:1px solid #30363d;border-radius:6px;margin:16px 0}' +
  '#landing button{font:700 15px system-ui,sans-serif;padding:10px 18px;margin:4px 8px 4px 0;border-radius:6px;border:1px solid #58a6ff;background:#161b22;color:#e6edf3;cursor:pointer}' +
  '#landing .dim{color:#8b949e;font-size:14px}body.landing>*:not(#landing){display:none!important}';

const media = (win, q) => { try { return typeof win.matchMedia === 'function' && !!win.matchMedia(q).matches; } catch { return false; } };
/** A pointer that can aim (a mouse or a trackpad), anywhere on the device. */
export const finePointer = win => media(win, '(any-pointer: fine)');
/** Y-8: the landing page, not the desk: a viewport below the floor, or only a touch pointer. */
export function needsLanding(win) {
  const touchOnly = media(win, '(pointer: coarse)') && !finePointer(win);
  return touchOnly || !(win.innerWidth >= DESK_W) || !(win.innerHeight >= DESK_H);
}

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
 * Show the landing page in `doc`. play(): load the game (PLAY ANYWAY, offered only with a pointer that can aim).
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
  if (finePointer(win)) {
    const go = el('button', 'PLAY ANYWAY', box);
    go.id = 'landing-play';
    go.title = 'The desk needs ' + DESK_W + ' by ' + DESK_H + ': parts of it may not fit this window';
    go.addEventListener('click', () => { root.remove(); if (doc.body.classList) doc.body.classList.remove('landing'); play(); });
  }
  if (doc.body.classList) doc.body.classList.add('landing');
  return root;
}

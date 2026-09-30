// app/input.js: the bench's keyboard (F-5 PAUSE on Space; K-15 Esc skips the watch; debug
// speeds on 1-6). keyAction() is pure (tests); bindKeys() attaches it to a document.
// Desk inputs themselves (levers, START, ...) are sim inputs and go through
// app/session.js sendInput, never from here directly.

import {DEBUG_RATES} from './director.js';

/**
 * The bench action for a key, or null.
 * @param {{key:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean}} ev
 * @returns {{do:'pause'}|{do:'skipWatch'}|{do:'speed', rate:number}|{do:'help'}|null}
 */
export function keyAction(ev) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;
  if (ev.key === ' ' || ev.key === 'Spacebar') return {do: 'pause'};
  if (ev.key === 'Escape') return {do: 'skipWatch'};
  if (ev.key === '?') return {do: 'help'};
  const n = ev.key.length === 1 ? ev.key.charCodeAt(0) - '1'.charCodeAt(0) : -1;
  if (n >= 0 && n < DEBUG_RATES.length) return {do: 'speed', rate: DEBUG_RATES[n]};
  return null;
}

/**
 * Listen for bench keys on `doc`; keys typed into a text or number field are left alone.
 * @param {Document} doc
 * @param {function(object):void} handle receives keyAction()'s result
 */
export function bindKeys(doc, handle) {
  doc.addEventListener('keydown', ev => {
    const t = ev.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' && t.type !== 'range' || tag === 'textarea' || tag === 'select') return;
    const a = keyAction(ev);
    if (!a) return;
    ev.preventDefault();
    // Space must not also press the button that has focus (it would on keyup).
    if (a.do === 'pause' && doc.activeElement && doc.activeElement !== doc.body && doc.activeElement.blur) doc.activeElement.blur();
    handle(a);
  });
}

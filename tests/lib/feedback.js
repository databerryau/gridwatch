// tests/lib/feedback.js: "every press answers" (SPEC Q-41), the helpers of tests/feedback.test.js and
// tests/feedback-watch.test.js (W6, the test budget: one file was 7-8 s alone; the watch's game is a file of its
// own). A press is press() / pressKey() (or the same three looks around a pointer gesture or a hold): a look
// before, on the press frame and a little after; answers() asserts (a) the press changed what the player sees
// and (b) no NOTE or TOAST that is help shows RED, and marks its control of the INVENTORY pressed. Each file
// checks its own part of the inventory (WATCH_PART, and the rest), so the two together press all of it.
import assert from 'node:assert/strict';
import {diffLooks} from './play.js';
import {PLANTS, SUBURBS} from '../../render/mapdata.js';
import * as D from '../../app/director.js';
import {badgeText} from '../../render/format.js';

/** The 65-control inventory (but the four tests/feedback.test.js lists at its top). */
export const INVENTORY = Object.freeze([
  'brief-agc', 'brief-hand', 'brief-take', 'key-enter-briefing', 'hdr-pause', 'hdr-rate-badge', 'key-space', 'key-f-fast',
  'hdr-mute', 'hdr-settings', 'set-volumes', 'set-rm', 'set-fxlow', 'set-crt', 'hdr-help', 'q-badges', 'guard-start', 'guard-stop',
  'lever-track', 'man-lamp', 'hydro-wheel', 'battery-dial', 'guard-ring', 'tie-knob', 'key-agc-desk', 'btn-redispatch', 'key-rert',
  'btn-dr', 'key-shed', 'bay-tabs', 'scope-ready', 'sync-trim', 'sync-close', 'sync-auto', 'sync-bypass', 'sync-exit', 'restore-close',
  'btn-preview', 'q-desk', 'btn-ack', 'btn-silence', 'tiles', 'tray-card-btn', 'btn-log', 'respond-card', 'key-esc', 'stack-expand',
  'stack-drag-key-edge', 'stack-ghost-start', 'stack-hover', 'stack-keys', 'map-click', 'map-keys', 'key-tab', 'keys-focus',
  'keys-ss-xx-p', 'keys-scope', 'keys-holds', 'keys-misc', 'end-download', 'end-again']);
/** The controls only tests/feedback-watch.test.js reaches (the watch, the card, the shortage, the day over); the rest are tests/feedback.test.js's. */
export const WATCH_PART = Object.freeze(['respond-card', 'key-shed', 'restore-close', 'end-download', 'end-again', 'brief-take']);
const covered = new Set();   // (the inventory pressed so far, in this process)
/** The controls of `part` no press has answered for yet (in this file's process). */
export const unpressed = part => part.filter(k => !covered.has(k));

export const A = 1 / 60;               // real s after a press: one frame (CLAUDE.md: sample, don't stream)

/** Hide the notes and the toast a press left, so the next press's answer is new in the diff. */
export function quiet(p) {
  for (const n of p.doc.querySelectorAll('.dk-note')) n.hidden = true;
  const t = p.$('toast');
  if (t) t.hidden = true;
}
/** What a press showed: before -> the press frame, and before -> after. */
export const shown = r => diffLooks(r.before, r.during) + '\n' + r.diff;
/** (b) help is never red: a red note is a '✕' refusal, a red toast 'Refused:' or 'RE-DISPATCH:'. */
export function noRedHelp(r, what) {
  for (const l of (r.during + '\n' + r.after).split('\n')) {
    if (l.startsWith('NOTE RED ')) assert.match(l, /: ✕ /, what + ': help in red: ' + l);
    if (l.startsWith('TOAST RED ')) assert.match(l, /^TOAST RED (Refused|RE-DISPATCH): /, what + ': help in red: ' + l);
  }
}
/**
 * (a) and (b). `want`: a RegExp the press's diff must match, a function of the sample that must be
 * true (a named element changed), or null (the diff is not empty).
 */
export function answers(r, want, what, key) {
  const s = shown(r);
  if (want instanceof RegExp) assert.match(s, want, what + ' did not answer as expected; it showed:\n' + s);
  else if (typeof want === 'function') assert.ok(want(r), what + ' did not answer; it showed:\n' + s);
  else assert.ok(s.trim(), what + ': a silent press');
  noRedHelp(r, what);
  if (key) covered.add(key);
  return r;
}
// A check on a note, a toast, an overlay or the rate needs no CTRL lines (a cheaper look: the file's time budget).
export const lite = want => (want instanceof RegExp && /^\^(NOTE|TOAST|SETTINGS|DRAWER|POPOVER|BRIEFING|END)|×/.test(want.source) ? {controls: false} : undefined);
export const click = (p, x, want, key, what = x) => { quiet(p); return answers(p.press(x, {after: A, look: lite(want)}), want, what, key); };
export const tap = (p, k, want, key, extra = {}, what = (extra.shiftKey ? 'Shift+' : '') + k) => {
  quiet(p);
  return answers(p.pressKey(k, extra, {after: A, look: lite(want)}), want, what, key);
};
/** A gesture the driver's press() does not make (a hold, a pointer drag, a canvas click), sampled the same way. */
export function act(p, fn, want, key, what, wait = A) {
  quiet(p);
  const o = lite(want), before = p.look(o);
  fn();
  const during = p.look(o);
  p.real(wait);
  const after = p.look(o);
  return answers({before, during, after, diff: diffLooks(before, after)}, want, what, key);
}
export const down = (p, id) => () => { p.pointer(id, 'pointerdown'); p.pointer(id, 'pointerup'); p.frame(); };
export const HOLD = 0.62;              // a hold commits after 0.6 s
export const focused = p => { const a = p.doc.activeElement; return a ? a.id || a.className : ''; };
export const lock = /^NOTE blue [^\n]*: desk locked while the grid catches itself: watch this one$/m;
// The badge the page shows once `f` has changed a copy of the director, in mode `mode`: the rate read, never a 120× literal (slice 2c's profile).
export const badge = (p, mode, f) => { const d = Object.assign({}, p.game.director); f(d, p.game.state); const m = D.modeOf(d, p.game.state); assert.equal(m.mode, mode); return new RegExp(badgeText(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); };

// The Live Stack's canvas: a point in canvas px -> the page's clientX/Y (the stand-in rect).
export function stackAt(p) {
  const st = p.h.mods.stack, cv = st.el.querySelector('canvas'), G = st.debug.geom, r = cv.getBoundingClientRect();
  return {st, cv, G, xy: (x, y) => [r.left + x * r.width / G.W, r.top + y * r.height / G.H]};
}
export function stackHit(p, kind, ok = () => true) {
  const {st, G} = stackAt(p), vm = p.vm();
  for (let x = G.x(vm.obs.s) + 4; x < G.x1; x += 3) for (let y = G.y1; y < G.y0; y += 2) {
    const h = st.debug.hitTest(x, y);
    if (h && h.kind === kind && ok(h)) return {x, y, h};
  }
  return null;
}
export const stackMsg = p => p.h.mods.stack.el.querySelector('.livestack-msg');
export function stackClick(p, x, y) {
  const {cv, xy} = stackAt(p), [cx, cy] = xy(x, y);
  cv.dispatch('pointerdown', {clientX: cx, clientY: cy});
  cv.dispatch('pointerup', {clientX: cx, clientY: cy});
  p.frame();
}
/** The stack's message after `fn`: blue help matching `re`. */
export function stackSays(p, fn, re, key, what) {
  const m = stackMsg(p);
  m.textContent = '';
  act(p, fn, () => re.test(m.textContent) && m.classList.contains('info'), key, what + ' (stack says "' + m.textContent + '")');
}
// The map's canvas: a map (base) point -> clientX/Y.
export function mapClick(p, id) {
  const map = p.h.mods.map, cv = map.el.querySelector('canvas'), L = map.debug.layout, r = cv.getBoundingClientRect();
  const cw = map.el.clientWidth || r.width, ch = map.el.clientHeight || r.height;
  const b = id === 'ground' ? [150, 185, 0, 0] : (PLANTS.find(q => q.id === id) || SUBURBS.find(s => 'sub:' + s.id === id)).box;
  const x = b[0] + b[2] / 2, y = b[1] + b[3] / 2;
  cv.dispatch('click', {clientX: r.left + (L.dx + x * L.scale) * r.width / cw, clientY: r.top + (L.dy + (y - L.srcY) * L.scale) * r.height / ch});
  p.frame();
}
export const mapLabel = p => p.h.mods.map.el.getAttribute('aria-label') || '';

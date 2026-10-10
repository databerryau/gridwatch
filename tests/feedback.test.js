// "Every press answers" (SPEC Q-41; the owner's first playtest, 2026-10-06): a control's face says
// what it does, EVERY press gives visible feedback, and help is NEVER red. Red is only a refusal
// from the grid (the desk's '✕ <reason>' notes, the shell's 'Refused: ...' / 'RE-DISPATCH: ...'
// toasts); blue is help, guidance and status.
//
// Headless and sampled (tests/lib/play.js, CLAUDE.md): each press is press() / pressKey() (or the
// same three looks around a pointer gesture or a hold): a look before, on the press frame and a
// little after. For every control of the 65-control inventory it asserts (a) the press changed what
// the player sees (the looks' diff, or a named element: the Live Stack's message, the map's label,
// the focus) and (b) no NOTE or TOAST that is help shows RED.
//
// States, by test (three games, each test going on from the one before it): the briefing (its game
// then takes a HAND day); the quiet desk at 04:30 (clock held: nothing moves but the press); the desk
// running (FAST, a unit READY: the scope, the tray); the watch (seed 20261007, COAL 1 at 11:37:31,
// the first full watch: the desk is locked); the RESPOND card; the shortage (15:40, SHORT: DIRECT
// SHED, RESTORE); the day over (set by state: playing on to 04:00 costs ~2 s more); the HAND day.
// The file keeps to CLAUDE.md's budget (<= 6 s alone, a test <= 2.5 s): one frame after a press, and
// a look without the CTRL lines where the check is a note, a toast, an overlay or the rate.
//
// NOT PRESSED HERE (no press to answer, or out of reach in the file's 6 s):
//   hdr-readouts, objective-line, toast: readouts, not controls (their "?" badges are pressed);
//   hdr-pause in the briefing and at DAY OVER: a disabled button (Space and the rate badge answer there);
//   stack-pending: the dashed earliest-arrival ghost lives 6 real s after an infeasible drop; reaching
//     one needs a drop the ramps cannot make, found by search (tests/livestack.test.js covers it).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame, diffLooks} from './lib/play.js';
import {PLANTS, SUBURBS} from '../render/mapdata.js';

const A = 1 / 60;               // real s after a press: one frame (CLAUDE.md: sample, don't stream)
const covered = new Set();

/** Hide the notes and the toast a press left, so the next press's answer is new in the diff. */
function quiet(p) {
  for (const n of p.doc.querySelectorAll('.dk-note')) n.hidden = true;
  const t = p.$('toast');
  if (t) t.hidden = true;
}
/** What a press showed: before -> the press frame, and before -> after. */
const shown = r => diffLooks(r.before, r.during) + '\n' + r.diff;
/** (b) help is never red: a red note is a '✕' refusal, a red toast 'Refused:' or 'RE-DISPATCH:'. */
function noRedHelp(r, what) {
  for (const l of (r.during + '\n' + r.after).split('\n')) {
    if (l.startsWith('NOTE RED ')) assert.match(l, /: ✕ /, what + ': help in red: ' + l);
    if (l.startsWith('TOAST RED ')) assert.match(l, /^TOAST RED (Refused|RE-DISPATCH): /, what + ': help in red: ' + l);
  }
}
/**
 * (a) and (b). `want`: a RegExp the press's diff must match, a function of the sample that must be
 * true (a named element changed), or null (the diff is not empty).
 */
function answers(r, want, what, key) {
  const s = shown(r);
  if (want instanceof RegExp) assert.match(s, want, what + ' did not answer as expected; it showed:\n' + s);
  else if (typeof want === 'function') assert.ok(want(r), what + ' did not answer; it showed:\n' + s);
  else assert.ok(s.trim(), what + ': a silent press');
  noRedHelp(r, what);
  if (key) covered.add(key);
  return r;
}
// A check on a note, a toast, an overlay or the rate needs no CTRL lines (a cheaper look: the file's time budget).
const lite = want => (want instanceof RegExp && /^\^(NOTE|TOAST|SETTINGS|DRAWER|POPOVER|BRIEFING|END)|×/.test(want.source) ? {controls: false} : undefined);
const click = (p, x, want, key, what = x) => { quiet(p); return answers(p.press(x, {after: A, look: lite(want)}), want, what, key); };
const tap = (p, k, want, key, extra = {}, what = (extra.shiftKey ? 'Shift+' : '') + k) => {
  quiet(p);
  return answers(p.pressKey(k, extra, {after: A, look: lite(want)}), want, what, key);
};
/** A gesture the driver's press() does not make (a hold, a pointer drag, a canvas click), sampled the same way. */
function act(p, fn, want, key, what, wait = A) {
  quiet(p);
  const o = lite(want), before = p.look(o);
  fn();
  const during = p.look(o);
  p.real(wait);
  const after = p.look(o);
  return answers({before, during, after, diff: diffLooks(before, after)}, want, what, key);
}
const down = (p, id) => () => { p.pointer(id, 'pointerdown'); p.pointer(id, 'pointerup'); p.frame(); };
const HOLD = 0.62;              // a hold commits after 0.6 s
const focused = p => { const a = p.doc.activeElement; return a ? a.id || a.className : ''; };
const lock = /^NOTE blue [^\n]*: desk locked while the grid catches itself: watch this one$/m;

// The Live Stack's canvas: a point in canvas px -> the page's clientX/Y (the stand-in rect).
function stackAt(p) {
  const st = p.h.mods.stack, cv = st.el.querySelector('canvas'), G = st.debug.geom, r = cv.getBoundingClientRect();
  return {st, cv, G, xy: (x, y) => [r.left + x * r.width / G.W, r.top + y * r.height / G.H]};
}
function stackHit(p, kind, ok = () => true) {
  const {st, G} = stackAt(p), vm = p.vm();
  for (let x = G.x(vm.obs.s) + 4; x < G.x1; x += 3) for (let y = G.y1; y < G.y0; y += 2) {
    const h = st.debug.hitTest(x, y);
    if (h && h.kind === kind && ok(h)) return {x, y, h};
  }
  return null;
}
const stackMsg = p => p.h.mods.stack.el.querySelector('.livestack-msg');
function stackClick(p, x, y) {
  const {cv, xy} = stackAt(p), [cx, cy] = xy(x, y);
  cv.dispatch('pointerdown', {clientX: cx, clientY: cy});
  cv.dispatch('pointerup', {clientX: cx, clientY: cy});
  p.frame();
}
/** The stack's message after `fn`: blue help matching `re`. */
function stackSays(p, fn, re, key, what) {
  const m = stackMsg(p);
  m.textContent = '';
  act(p, fn, () => re.test(m.textContent) && m.classList.contains('info'), key, what + ' (stack says "' + m.textContent + '")');
}
// The map's canvas: a map (base) point -> clientX/Y.
function mapClick(p, id) {
  const map = p.h.mods.map, cv = map.el.querySelector('canvas'), L = map.debug.layout, r = cv.getBoundingClientRect();
  const cw = map.el.clientWidth || r.width, ch = map.el.clientHeight || r.height;
  const b = id === 'ground' ? [150, 185, 0, 0] : (PLANTS.find(q => q.id === id) || SUBURBS.find(s => 'sub:' + s.id === id)).box;
  const x = b[0] + b[2] / 2, y = b[1] + b[3] / 2;
  cv.dispatch('click', {clientX: r.left + (L.dx + x * L.scale) * r.width / cw, clientY: r.top + (L.dy + (y - L.srcY) * L.scale) * r.height / ch});
  p.frame();
}
const mapLabel = p => p.h.mods.map.el.getAttribute('aria-label') || '';

// ---------------------------------------------------------------- the briefing

const H = {};
test('every press answers: the briefing (AGC/HAND, Space, the rate badge, F, Tab, Enter: a HAND day)', () => {
  const p = H.p = openGame({take: false});
  click(p, 'btn-hand', /btn-hand "[^"]*" \[[^\]]*on/, 'brief-hand');
  click(p, 'btn-agc', /btn-agc "[^"]*" \[[^\]]*on/, 'brief-agc');
  click(p, 'btn-hand', /btn-hand "[^"]*" \[[^\]]*on/, 'brief-hand');
  const TAKE = /^TOAST blue Take the desk first: Enter\. Then Space runs the clock\.$/m;
  tap(p, ' ', TAKE, 'key-space');
  click(p, 'rate-badge', TAKE, 'hdr-rate-badge');
  tap(p, 'f', TAKE, 'key-f-fast');
  const t = tap(p, 'Tab', () => /citymap/.test(focused(p)), 'key-tab');
  assert.ok(t);
  tap(p, 'Enter', r => !/^BRIEFING /m.test(r.after) && /^CLOCK 04:30/m.test(r.after) && /key-agc "H HAND"/.test(r.after), 'key-enter-briefing');
  assert.deepEqual(p.h.mods.errors, []);
});

// ---------------------------------------------------------------- the quiet desk (04:30, clock held)

const B = {};
test('every press answers: the quiet desk, header and help (clock held at 04:30)', () => {
  const p = B.p = openGame({run: false});
  click(p, 'btn-pause', /CRUISE 120×/, 'hdr-pause');
  click(p, 'rate-badge', /PAUSE 0×/, 'hdr-rate-badge');
  tap(p, ' ', /CRUISE 120×/, 'key-space');
  tap(p, ' ', /PAUSE 0×/, 'key-space');
  tap(p, 'f', /^TOAST blue FAST needs the clock running: Space$/m, 'key-f-fast');
  click(p, 'btn-mute', /btn-mute "SOUND OFF"/, 'hdr-mute');
  tap(p, 'M', /btn-mute "SOUND ON"/, 'keys-misc', {shiftKey: true});
  // settings
  click(p, 'btn-settings', /^SETTINGS open$/m, 'hdr-settings');
  for (const id of ['set-volume', 'set-alarms']) {
    act(p, () => { const e = p.$(id); e.value = '40'; e.dispatch('input'); p.frame(); }, new RegExp(id + ' "40"'), 'set-volumes', id);
  }
  const check = (id, on) => () => { const e = p.$(id); e.checked = on; e.dispatch('change'); p.frame(); };
  act(p, check('set-rm', true), /set-rm "[^"]*" \[[^\]]*on/, 'set-rm', 'REDUCED MOTION on');
  check('set-rm', false)();
  act(p, check('set-fxlow', true), /set-fxlow "[^"]*" \[[^\]]*on/, 'set-fxlow', 'REDUCED EFFECTS on');
  act(p, () => { p.$('set-crt').parentElement.click(); p.frame(); }, /^TOAST blue CRT is off while REDUCED EFFECTS is on$/m, 'set-crt', 'the greyed CRT row');
  act(p, check('set-fxlow', false), /set-crt "[^"]*"(?! \[[^\]]*disabled)/, 'set-fxlow', 'REDUCED EFFECTS off');
  const crtOn = p.$('set-crt').checked;
  act(p, check('set-crt', !crtOn), r => r.diff.trim(), 'set-crt', 'CRT ' + (crtOn ? 'off' : 'on'));
  check('set-crt', crtOn)();
  tap(p, 'Escape', r => !/^SETTINGS open$/m.test(r.after) && /btn-settings "[^"]*" \[[^\]]*focus/.test(r.after), 'key-esc');
  tap(p, ',', /^SETTINGS open$/m, 'keys-misc');
  tap(p, ',', r => !/^SETTINGS open$/m.test(r.after), 'keys-misc');
  // the "?" drawer and its badges
  click(p, 'btn-help', /^DRAWER open$/m, 'hdr-help');
  click(p, p.doc.querySelector('button.q[data-anchor="lever-coal"]'), /^POPOVER /m, 'q-badges', 'q:lever-coal');
  tap(p, 'Escape', r => !/^POPOVER /m.test(r.after) || !/^DRAWER open$/m.test(r.after), 'key-esc');
  tap(p, 'Escape', r => !/^DRAWER open$/m.test(r.after) && !/^POPOVER /m.test(r.after), 'key-esc');
  tap(p, '?', /^DRAWER open$/m, 'keys-misc');
  tap(p, '?', r => !/^DRAWER open$/m.test(r.after), 'keys-misc');
  click(p, p.doc.querySelector('button.q[data-anchor="clock"]'), /^POPOVER /m, 'q-badges', 'q:clock');
  tap(p, 'Escape', r => !/^POPOVER /m.test(r.after), 'key-esc');
  // trip preview and the desk's "?"
  click(p, 'btn-preview', /btn-preview "T PREVIEW ●"/, 'btn-preview');
  tap(p, 't', r => /btn-preview "T PREVIEW"/.test(r.after), 'keys-misc');
  for (const id of ['q-gauge', 'q-imb']) click(p, id, /^NOTE blue /m, 'q-desk');
  // the annunciator
  click(p, 'btn-ack', null, 'btn-ack');
  click(p, 'btn-ack', /^NOTE blue /m, 'btn-ack', 'ACK, nothing to acknowledge');
  click(p, 'btn-silence', /^NOTE blue annunciator: Nothing sounding: HORN OFF stops the horn, ACK marks alarms seen\.$/m, 'btn-silence');
  tap(p, 'A',/^NOTE blue annunciator: Nothing sounding/m, 'keys-misc', {shiftKey: true});
  click(p, 'tile-n1', /^NOTE blue /m, 'tiles');
  // the AGC/HAND key and the bay's tabs
  click(p, 'key-agc', /^NOTE blue [^\n]*AGC\/HAND is set at the briefing: locked for the day$/m, 'key-agc-desk');
  click(p, 'bay-restore', /bay-restore "[^"]*" \[[^\]]*selected/, 'bay-tabs');
  click(p, 'bay-sync', /bay-sync "[^"]*" \[[^\]]*selected/, 'bay-tabs');
  assert.deepEqual(p.h.mods.errors, []);
});

test('every press answers: the quiet desk, levers, guards, rotaries, emergency, sync bay, stack, map, focus keys', () => {
  const p = B.p;
  assert.match(p.look({controls: false}), /PAUSE 0×/);
  // the guards: help in blue, a lift, a commit, a press in the rest after it
  click(p, 'guard-start-coal1', /^NOTE blue [^\n]*COAL 1 ON: its lever sets the MW$/m, 'guard-start');
  click(p, 'guard-stop-gtb2', /^NOTE blue [^\n]*GT·B 2 OFF: nothing to stop$/m, 'guard-stop');
  click(p, 'guard-start-gta1', /guard-start-gta1 "START\?" \[[^\]]*ARMED/, 'guard-start');
  click(p, 'guard-start-gta1', null, 'guard-start', 'GT·A START commit');
  click(p, 'guard-start-gta1', /^NOTE blue [^\n]*GT·A START sent/m, 'guard-start', 'a press in the rest after a commit');
  click(p, 'guard-stop-hydro2', /guard-stop-hydro2 "STOP\?" \[[^\]]*ARMED/, 'guard-stop');
  // the levers (AGC): focus, a move, RE-DISPATCH, a drag on an idle lever, S S, P
  tap(p, '2', /lever-ccgt "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowUp', /lever-ccgt "[^"]*"=\d+/, 'lever-track');
  tap(p, 'n', /btn-redispatch "⟳ RE-DISPATCH"/, 'keys-misc');
  click(p, 'btn-redispatch', null, 'btn-redispatch');
  act(p, () => { p.pointer('lever-gtc', 'pointerdown', 20, 18); p.pointer('lever-gtc', 'pointermove', 20, 16); p.pointer('lever-gtc', 'pointerup', 20, 16); p.frame(); },
    null, 'lever-track', 'a drag on the idle GT·C lever');
  tap(p, '4', /lever-gtb "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 's', /guard-start-gtb1 "START\?"/, 'keys-ss-xx-p');
  tap(p, 's', null, 'keys-ss-xx-p', {}, 'S S');
  tap(p, 'p', /^NOTE blue [^\n]*AGC: /m, 'keys-ss-xx-p');
  // the rotaries
  const slot = id => p.$(id).parent.parent;
  const read = id => slot(id).textContent;
  tap(p, '6', /wheel-hydro "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowRight', /wheel-hydro "[^"]*"=\d+/, 'hydro-wheel', {shiftKey: true});
  tap(p, 'x', /"STOP\?"/, 'keys-ss-xx-p');
  tap(p, '7', /dial-battery "[^"]*"=-?\d+ \[[^\]]*focus/, 'keys-focus');
  let was = read('dial-battery');
  act(p, () => p.key('ArrowUp'), () => read('dial-battery') !== was, 'battery-dial', '↑ on the dial in IDLE');
  tap(p, 'g', /ring-guard "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowUp', /ring-guard "[^"]*"=\d+/, 'guard-ring');
  tap(p, '8', /knob-tie "[^"]*"=-?\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowUp', /knob-tie "[^"]*"=-?\d+/, 'tie-knob');
  // the emergency keys: a press lifts a cover; a short press says to hold; a hold commits
  act(p, down(p, 'key-rert'), /key-rert "▶ HOLD: ARM DIESEL/, 'key-rert', 'BREAK GLASS');
  act(p, down(p, 'key-rert'), /^NOTE blue [^\n]*hold 0\.6 s to commit, or hold E$/m, 'key-rert', 'a short press on the diesel');
  act(p, () => p.hold('e', HOLD), /key-rert "◔ DIESEL/, 'keys-holds', 'E held');
  act(p, down(p, 'btn-dr'), /^NOTE blue [^\n]*hold 0\.6 s to commit, or hold D$/m, 'btn-dr', 'a short press on DR');
  tap(p, 'k', /^NOTE blue [^\n]*DIRECT SHED appears when N-1 reads SHORT or SHEDDING$/m, 'keys-focus');
  // the sync bay with no scope open (no unit at full speed yet)
  // (GT·A runs up from the START above: the bay names it, and when it reaches full speed)
  const NONE = /^NOTE blue [^\n]*GT·A runs up: full speed in \d+:\d\d, then O$/m;
  click(p, 'sync-raise', NONE, 'sync-trim');
  click(p, 'sync-close', NONE, 'sync-close');
  click(p, 'sync-auto', NONE, 'sync-auto');
  click(p, 'sync-exit', /^NOTE blue [^\n]*no scope open$/m, 'sync-exit');
  for (const k of ['[', 'c', 'o']) tap(p, k, NONE, 'keys-scope');
  tap(p, 'b', /^NOTE blue [^\n]*BYPASS is HAND only: trim with \[ \], or U for AUTO$/m, 'keys-scope');
  // the Live Stack: expand, L, a click on a ghost and on a layer edge, its keys, a hover
  const expand = p.doc.querySelector('.livestack-expand');
  click(p, expand, /stack>button "L" \[[^\]]*pressed/, 'stack-expand', 'L (expand)');
  click(p, expand, r => !/stack>button "L" \[[^\]]*pressed/.test(r.after), 'stack-expand', 'L (back)');
  const gh = stackHit(p, 'ghost');
  assert.ok(gh, 'an off unit\'s ghost on the stack');
  stackSays(p, () => stackClick(p, gh.x, gh.y), /^Drag right to book .+'s START$/, 'stack-ghost-start', 'a click on a ghost');
  const edge = stackHit(p, 'edge');
  stackSays(p, () => stackClick(p, edge.x, edge.y), /^Drag to plan .+'s MW: right for later, up for more$/, 'stack-drag-key-edge', 'a click on a layer edge');
  const tip = p.h.mods.stack.el.querySelector('.livestack-tip');
  act(p, () => { const {cv, xy} = stackAt(p), [cx, cy] = xy(gh.x, gh.y); cv.dispatch('pointermove', {clientX: cx, clientY: cy}); p.frame(); },
    () => tip && !tip.hidden && /is off: earliest/.test(tip.textContent), 'stack-hover', 'a hover on a ghost');
  tap(p, 'l', () => focused(p) === 'stack', 'stack-keys');
  stackSays(p, () => p.key('ArrowUp'), /^Pick a station first: 1-6$/, 'stack-keys', '↑ with nothing picked');
  stackSays(p, () => p.key('1'), /^COAL: ←\/→ time, ↑\/↓ MW, Enter plans it$/, 'stack-keys', '1');
  assert.ok(p.h.mods.stack.debug.sel, 'COAL picked');
  tap(p, 'Escape', () => !p.h.mods.stack.debug.sel, 'stack-keys', {}, 'Esc on the stack (the pick, drawn on the canvas, goes)');
  // the map: a plant focuses its control; a suburb opens its card (Q-56); wind, solar, the ground answer with a label
  act(p, () => mapClick(p, 'ccgt'), /lever-ccgt "[^"]*"=\d+ \[[^\]]*focus/, 'map-click', 'a click on RIVERTON CCGT');
  act(p, () => mapClick(p, 'sub:RED'), () => p.game.ui.suburb === 'RED', 'map-click', 'a click on sub:RED (its card)'); p.key('h'); // (H closes it: Esc below is the map's)
  for (const [id, re] of [['wind', /the wind sets it, not the desk/], ['solar', /the sun sets it, not the desk/], ['ground', /Click a plant for its control, a suburb for its card/]]) {
    act(p, () => mapClick(p, id), () => re.test(mapLabel(p)), 'map-click', 'a click on ' + id);
  }
  const citymap = p.h.mods.map.el;
  citymap.focus();
  was = mapLabel(p);
  act(p, () => p.key('ArrowRight'), () => mapLabel(p) !== was, 'map-keys', '→ on the map');
  act(p, () => p.key('Escape'), () => focused(p) !== citymap.className && !/citymap/.test(focused(p)), 'map-keys', 'Esc on the map');
  // the focus keys
  tap(p, '3', /lever-gta "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'r', () => /restore/.test(focused(p)) || /bay-restore "[^"]*" \[[^\]]*selected/.test(p.look()), 'keys-focus');
  tap(p, 'm', () => /tray|dk-card|btn-log/.test(focused(p) + p.game.ui.focus), 'keys-focus');
  tap(p, 'm', null, 'keys-focus', {}, 'M again');
  tap(p, 'l', null, 'keys-focus');
  tap(p, 'l', null, 'keys-focus', {}, 'L again');
  assert.deepEqual(p.h.mods.errors, []);
});

test('every press answers: the desk running (FAST, a READY unit and its scope, the tray, STOP)', () => {
  const p = B.p;
  tap(p, ' ', /CRUISE 120×/, 'key-space');
  act(p, () => { p.keyDown('f'); p.frame(); }, /FAST 360×/, 'key-f-fast', 'F held');
  act(p, () => { p.keyUp('f'); p.frame(); }, /CRUISE 120×/, 'key-f-fast', 'F up');
  const ready = () => p.game.state.units.find(u => u.id === 'gta1').mode === 'ready';
  const r = p.until(() => ready(), {max: '+20m'});
  assert.ok(ready(), 'GT·A at full speed: ' + r.why + ' ' + r.at);
  p.click('bay-sync');
  click(p, 'scope-gta1', /FOCUS 1×/, 'scope-ready');
  tap(p, 'f', /^TOAST blue FAST waits: the clock runs 1× while you SYNC or RESTORE$/m, 'key-f-fast');
  const slip = () => p.doc.querySelector('.dk-slip').textContent;
  let was = slip();
  // (a trim moves the slip over a few tenths of a real second: the scope's line shows it)
  act(p, () => p.click('sync-raise'), () => slip() !== was, 'sync-trim', '+ ] with a scope open', 0.15);
  was = slip();
  act(p, () => p.click('sync-lower'), () => slip() !== was, 'sync-trim', '[ − with a scope open', 0.15);
  click(p, 'sync-exit', r => !/FOCUS 1×/.test(r.after.split('\n')[0]), 'sync-exit');
  tap(p, 'o', /FOCUS 1×/, 'keys-scope');
  was = slip();
  act(p, () => p.key(']'), () => slip() !== was, 'keys-scope', ']', 0.15);
  click(p, 'sync-auto', null, 'sync-auto');
  tap(p, 'c', null, 'keys-scope');
  // the tray: a card's button takes the focus to its control; LOG
  if (p.$('btn-log').getAttribute('aria-pressed') === 'true') p.click('btn-log');   // (M again opened the LOG)
  const shownEl = e => { for (let n = e; n && n.tagName; n = n.parent) if (n.hidden) return false; return true; };
  const card = p.doc.querySelectorAll('button.dk-card-btn').find(shownEl);
  assert.ok(card, 'a card in the tray');
  const target = card.dataset.target;
  click(p, card, () => p.game.ui.focus === target, 'tray-card-btn', 'a tray card\'s button');
  click(p, 'btn-log', /btn-log "LOG ▾" \[[^\]]*pressed/, 'btn-log');
  click(p, 'btn-log', r => /btn-log "LOG"/.test(r.after), 'btn-log');
  // STOP, then ABORT
  click(p, 'guard-stop-coal3', null, 'guard-stop', 'COAL 3 STOP lift');
  click(p, 'guard-stop-coal3', null, 'guard-stop', 'COAL 3 STOP');
  assert.deepEqual(p.h.mods.errors, []);
});

// ---------------------------------------------------------------- the watch, the card, the shortage, the day over

const W = {};
test('every press answers: the watch (the first full one: the desk answers with the lock note)', () => {
  const p = W.p = openGame();
  const r = p.until('trip', {max: '13:00', line: 'near'});
  assert.equal(r.why, 'trip');
  assert.equal(p.mode(), 'WATCH');
  click(p, 'guard-start-gtc2', lock, 'guard-start');
  tap(p, '1', /lever-coal "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowUp', lock, 'lever-track');
  tap(p, 's', lock, 'keys-ss-xx-p');
  tap(p, '6', null, 'keys-focus');
  tap(p, 'ArrowUp', lock, 'hydro-wheel');
  click(p, 'key-agc', lock, 'key-agc-desk');
  click(p, 'btn-redispatch', lock, 'btn-redispatch');
  tap(p, 'n', lock, 'keys-misc');
  act(p, down(p, 'key-rert'), lock, 'key-rert', 'BREAK GLASS in the watch');
  act(p, down(p, 'btn-dr'), lock, 'btn-dr', 'DR in the watch');
  act(p, () => { p.keyDown('d'); p.frame(); p.keyUp('d'); }, lock, 'keys-holds', 'D in the watch');
  tap(p, 'k', lock, 'keys-focus');
  click(p, 'sync-raise', lock, 'sync-trim');
  for (const k of ['o', 'b']) tap(p, k, lock, 'keys-scope');
  const gh = stackHit(p, 'ghost');
  if (gh) stackSays(p, () => stackClick(p, gh.x, gh.y), /^Read-only during the watch: watch this one$/, 'stack-ghost-start', 'the stack in the watch');
  tap(p, 'Escape', /^TOAST blue The first watch plays through: Esc skips from the next trip$/m, 'key-esc');
  tap(p, 'f', /^TOAST blue FAST waits: the watch plays the trip in slow motion$/m, 'key-f-fast');
  // the annunciator works in the watch
  click(p, 'btn-silence', null, 'btn-silence');
  click(p, 'btn-ack', null, 'btn-ack');
  assert.equal(p.mode(), 'WATCH', 'all of it inside the watch');
  assert.deepEqual(p.h.mods.errors, []);
});

test('every press answers: the RESPOND card, then RESPOND', () => {
  const p = W.p;
  const r = p.until('card', {max: '+30m'});
  assert.equal(r.why, 'card');
  tap(p, 'f', /^TOAST blue FAST waits: read the card, then Enter$/m, 'key-f-fast');
  click(p, 'respond-card', r2 => !/^CARD /m.test(r2.after), 'respond-card');
  if (p.mode() === 'RESPOND') tap(p, 'f', /^TOAST blue FAST waits: RESPOND runs 30× until frequency is back in band$/m, 'key-f-fast');
  assert.deepEqual(p.h.mods.errors, []);
});

test('every press answers: the shortage (15:40 SHORT: DIRECT SHED, RESTORE, a dark suburb)', () => {
  const p = W.p;
  for (let i = 0; i < 4; i++) { const r = p.to('15:40', {stop: [], line: 'near'}); if (r.why !== 'held:RESPOND-CARD') break; p.key('Enter'); }
  assert.ok(!p.$('key-shed').hidden, 'DIRECT SHED shown: ' + p.look({controls: false}).split('\n').find(l => l.startsWith('N-1')));
  tap(p, 'k', /key-shed "[^"]*" \[[^\]]*focus/, 'keys-focus');
  act(p, down(p, 'key-shed'), /key-shed "▶ HOLD: SHED/, 'key-shed', 'DIRECT SHED (cover)');
  act(p, down(p, 'key-shed'), /^NOTE blue [^\n]*hold 0\.6 s to commit$/m, 'key-shed', 'a short press on DIRECT SHED');
  // the keyboard's guarded double: the cover lifted under 2 s ago, Enter on the focused key commits
  tap(p, 'Enter', /bay-restore "✕\d RESTORE"/, 'key-shed', {}, 'Enter on DIRECT SHED');
  tap(p, 'r', /bay-restore "[^"]*" \[[^\]]*selected/, 'keys-focus');
  click(p, 'bay-restore', /bay-restore "[^"]*" \[[^\]]*focus/, 'bay-tabs');
  const row = [...p.doc.querySelectorAll('button')].find(b => /^restore-/.test(b.id) && b.id !== 'restore-list' && !b.hidden);
  assert.ok(row, 'a dark district on the RESTORE list');
  click(p, row, null, 'restore-close', 'CLOSE ' + row.id);
  const dark = p.vm().obs.districts.find(d => d.dark);
  if (dark) act(p, () => mapClick(p, 'sub:' + dark.suburb), () => p.game.ui.focus === 'bay-restore' && p.game.ui.suburb === dark.suburb, 'map-click', 'a click on a dark suburb (RESTORE, and its card)');
  assert.deepEqual(p.h.mods.errors, []);
});

test('every press answers: the day over (desk, header, DOWNLOAD, PLAY THIS DAY AGAIN, TAKE THE DESK)', () => {
  const p = W.p;
  // The day's end, by state (as tests/keys.test.js does): playing on to 04:00 is ~2 s more headless.
  p.game.state.over = true;
  p.frames(2);
  assert.match(p.look({controls: false}), /^END Day over: 04:00\./m);
  const OVER = /^TOAST blue Day over: PLAY THIS DAY AGAIN for another go$/m, DESK = /^NOTE blue [^\n]*the day is over: PLAY THIS DAY AGAIN is on the card$/m;
  tap(p, ' ', OVER, 'key-space');
  click(p, 'rate-badge', OVER, 'hdr-rate-badge');
  tap(p, 'f', OVER, 'key-f-fast');
  click(p, 'guard-start-gtc2', DESK, 'guard-start');
  tap(p, 'n', DESK, 'keys-misc');
  tap(p, '1', null, 'keys-focus');
  tap(p, 's', DESK, 'keys-ss-xx-p');
  tap(p, 'ArrowUp', DESK, 'lever-track');
  tap(p, 'o', DESK, 'keys-scope');
  click(p, 'btn-save-log', /^TOAST blue Saved to your downloads: gridwatch-.+-seed-20261007\.json$/m, 'end-download');
  click(p, 'btn-again', /^BRIEFING /m, 'end-again');
  click(p, 'btn-take', r => !/^BRIEFING /m.test(r.after), 'brief-take');
  assert.deepEqual(p.h.mods.errors, []);
});

// ---------------------------------------------------------------- a HAND day

test('every press answers: a HAND day (the MAN lamp, P / Shift+P, BYPASS, a drag on an idle lever)', () => {
  const p = H.p;   // the briefing's game: HAND taken with Enter, the clock held at 04:30
  click(p, 'man-ccgt', /^NOTE blue [^\n]*CCGT follows the plan: M lights once you move it$/m, 'man-lamp');
  tap(p, '2', null, 'keys-focus');
  tap(p, 'ArrowUp', /man-ccgt "M"/, 'lever-track');
  click(p, 'man-ccgt', /^NOTE blue [^\n]*double-click or P: RESUME PLAN · Shift\+P: KEEP$/m, 'man-lamp');
  act(p, () => { p.$('man-ccgt').dispatch('dblclick'); p.frame(); }, /man-ccgt "P"/, 'man-lamp', 'a double-click on M');
  p.key('2');
  tap(p, 'ArrowUp', /man-ccgt "M"/, 'lever-track');
  tap(p, 'p', /man-ccgt "P"/, 'keys-ss-xx-p');
  tap(p, 'ArrowUp', /man-ccgt "M"/, 'lever-track');
  tap(p, 'P', /^NOTE blue [^\n]*CCGT KEEP: the plan goes on from here$/m, 'keys-ss-xx-p', {shiftKey: true});
  click(p, 'sync-bypass', /sync-bypass "● BYPASS"/, 'sync-bypass');
  tap(p, 'b', r => /sync-bypass "BYPASS"/.test(r.after), 'sync-bypass');
  act(p, () => { p.pointer('lever-gtc', 'pointerdown', 20, 18); p.pointer('lever-gtc', 'pointermove', 20, 16); p.pointer('lever-gtc', 'pointerup', 20, 16); p.frame(); },
    /^NOTE blue [^\n]*no machine on: START one first \(S S\)$/m, 'lever-track', 'a drag on the idle GT·C lever in HAND');
  assert.deepEqual(p.h.mods.errors, []);
});

// ---------------------------------------------------------------- the inventory, all of it

test('every control of the inventory was pressed (but the four listed at the top)', () => {
  const ALL = ['brief-agc', 'brief-hand', 'brief-take', 'key-enter-briefing', 'hdr-pause', 'hdr-rate-badge', 'key-space', 'key-f-fast',
    'hdr-mute', 'hdr-settings', 'set-volumes', 'set-rm', 'set-fxlow', 'set-crt', 'hdr-help', 'q-badges', 'guard-start', 'guard-stop',
    'lever-track', 'man-lamp', 'hydro-wheel', 'battery-dial', 'guard-ring', 'tie-knob', 'key-agc-desk', 'btn-redispatch', 'key-rert',
    'btn-dr', 'key-shed', 'bay-tabs', 'scope-ready', 'sync-trim', 'sync-close', 'sync-auto', 'sync-bypass', 'sync-exit', 'restore-close',
    'btn-preview', 'q-desk', 'btn-ack', 'btn-silence', 'tiles', 'tray-card-btn', 'btn-log', 'respond-card', 'key-esc', 'stack-expand',
    'stack-drag-key-edge', 'stack-ghost-start', 'stack-hover', 'stack-keys', 'map-click', 'map-keys', 'key-tab', 'keys-focus',
    'keys-ss-xx-p', 'keys-scope', 'keys-holds', 'keys-misc', 'end-download', 'end-again'];
  assert.deepEqual(ALL.filter(k => !covered.has(k)), []);
});

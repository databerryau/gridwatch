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
// States, by test (two games, each test going on from the one before it): the briefing (its game
// then takes a HAND day); the quiet desk at 04:30 (clock held: nothing moves but the press); the desk
// running (FAST, a unit READY: the scope, the tray); the HAND day. The third game, the watch, the
// RESPOND card, the shortage and the day over, is tests/feedback-watch.test.js's (W6, the test budget:
// the three were 7-8 s in one file); the helpers are tests/lib/feedback.js's, and each file checks its
// part of the inventory. Both keep to CLAUDE.md's budget (<= 6 s alone, a test <= 2.5 s): one frame
// after a press, and a look without the CTRL lines where the check is a note, a toast, an overlay or the rate.
//
// NOT PRESSED HERE (no press to answer, or out of reach in the file's 6 s):
//   hdr-readouts, objective-line, toast: readouts, not controls (their "?" badges are pressed);
//   hdr-pause in the briefing and at DAY OVER: a disabled button (Space and the rate badge answer there);
//   stack-pending: the dashed earliest-arrival ghost lives 6 real s after an infeasible drop; reaching
//     one needs a drop the ramps cannot make, found by search (tests/livestack.test.js covers it).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as D from '../app/director.js';
import {INVENTORY, WATCH_PART, unpressed, click, tap, act, down, HOLD, focused, badge, stackAt, stackHit, stackClick, stackSays, mapClick, mapLabel} from './lib/feedback.js';

// ---------------------------------------------------------------- the briefing

const H = {};
test('every press answers: the briefing (AGC/HAND, Space, the rate badge, F, Tab, Enter: a HAND day)', () => {
  const p = H.p = openGame({take: false, shifts: 1});
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
  click(p, 'btn-pause', badge(p, 'CRUISE', d => { d.paused = false; }), 'hdr-pause');
  click(p, 'rate-badge', /PAUSE 0×/, 'hdr-rate-badge');
  tap(p, ' ', badge(p, 'CRUISE', d => { d.paused = false; }), 'key-space');
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
  // the station's START / STOP words (K-24, an AGC day): help in blue, a lift, a commit, a press in the rest after it
  click(p, 'station-start-coal', /^NOTE blue [^\n]*COAL: nothing to start \(/m, 'guard-start');
  click(p, 'station-stop-gtb', /^NOTE blue [^\n]*GT·B: nothing to stop \(none running\)$/m, 'guard-stop');
  click(p, 'station-start-gta', /station-start-gta "START\?" \[[^\]]*ARMED/, 'guard-start');
  click(p, 'station-start-gta', null, 'guard-start', 'GT·A START commit');
  click(p, 'station-start-gta', /^NOTE blue [^\n]*GT·A START sent/m, 'guard-start', 'a press in the rest after a commit');
  click(p, 'station-stop-hydro', /station-stop-hydro "STOP\?" \[[^\]]*ARMED/, 'guard-stop');
  // the levers (AGC, K-24): readouts, a key and a drag answer in blue; N says the dispatch re-plans by itself; S S, P
  tap(p, '2', /lever-ccgt "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowUp', /^NOTE blue [^\n]*The dispatch sets the MW; START and STOP are yours\.$/m, 'lever-track');
  tap(p, 'n', /^NOTE blue [^\n]*AGC: the dispatch re-plans by itself \(RE-DISPATCH is HAND's\)$/m, 'keys-misc');
  act(p, () => { p.pointer('lever-gtc', 'pointerdown', 20, 18); p.pointer('lever-gtc', 'pointermove', 20, 16); p.pointer('lever-gtc', 'pointerup', 20, 16); p.frame(); },
    /^NOTE blue [^\n]*The dispatch sets the MW; START and STOP are yours\.$/m, 'lever-track', 'a drag on the idle GT·C lever');
  tap(p, '4', /lever-gtb "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 's', /station-start-gtb "START\?"/, 'keys-ss-xx-p');
  tap(p, 's', null, 'keys-ss-xx-p', {}, 'S S');
  tap(p, 'p', /^NOTE blue [^\n]*AGC: /m, 'keys-ss-xx-p');
  // the rotaries
  const slot = id => p.$(id).parent.parent;
  const read = id => slot(id).textContent;
  tap(p, '6', /wheel-hydro "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowRight', /^NOTE blue [^\n]*The dispatch sets the MW; START and STOP are yours\.$/m, 'hydro-wheel', {shiftKey: true});
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
  // (K-24: on an AGC day the stack is the dispatch's readout: a click says so)
  stackSays(p, () => stackClick(p, gh.x, gh.y), /^The dispatch sets the MW; START and STOP are yours\.$/, 'stack-ghost-start', 'a click on a ghost');
  const edge = stackHit(p, 'edge');
  stackSays(p, () => stackClick(p, edge.x, edge.y), /^The dispatch sets the MW; START and STOP are yours\.$/, 'stack-drag-key-edge', 'a click on a layer edge');
  const tip = p.h.mods.stack.el.querySelector('.livestack-tip');
  act(p, () => { const {cv, xy} = stackAt(p), [cx, cy] = xy(gh.x, gh.y); cv.dispatch('pointermove', {clientX: cx, clientY: cy}); p.frame(); },
    () => tip && !tip.hidden && /is off: earliest/.test(tip.textContent), 'stack-hover', 'a hover on a ghost');
  tap(p, 'l', () => focused(p) === 'stack', 'stack-keys');
  stackSays(p, () => p.key('ArrowUp'), /^The dispatch sets the MW; START and STOP are yours\.$/, 'stack-keys', '↑ on an AGC day');
  stackSays(p, () => p.key('1'), /^The dispatch sets the MW; START and STOP are yours\.$/, 'stack-keys', '1 on an AGC day');
  tap(p, 'Escape', () => !p.h.mods.stack.debug.sel, 'stack-keys', {}, 'Esc on the stack');
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
  tap(p, ' ', badge(p, 'CRUISE', d => { d.paused = false; }), 'key-space');
  act(p, () => { p.keyDown('f'); p.frame(); }, badge(p, 'FAST', (d, s) => D.setFast(d, s, true)), 'key-f-fast', 'F held');
  act(p, () => { p.keyUp('f'); p.frame(); }, badge(p, 'CRUISE', d => { d.fast = false; }), 'key-f-fast', 'F up');
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
  click(p, 'station-stop-coal', null, 'guard-stop', 'COAL STOP lift');
  click(p, 'station-stop-coal', null, 'guard-stop', 'COAL STOP');
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
  click(p, 'btn-redispatch', null, 'btn-redispatch');   // (K-24: RE-DISPATCH is HAND's)
  p.click('bay-sync');   // (20261007's two held task feeders put the bay's own view on RESTORE at 04:30: desk/bay.js, wave-2 desk)
  click(p, 'sync-bypass', /sync-bypass "● BYPASS"/, 'sync-bypass');
  tap(p, 'b', r => /sync-bypass "BYPASS"/.test(r.after), 'sync-bypass');
  act(p, () => { p.pointer('lever-gtc', 'pointerdown', 20, 18); p.pointer('lever-gtc', 'pointermove', 20, 16); p.pointer('lever-gtc', 'pointerup', 20, 16); p.frame(); },
    /^NOTE blue [^\n]*no machine on: START one first \(S S\)$/m, 'lever-track', 'a drag on the idle GT·C lever in HAND');
  assert.deepEqual(p.h.mods.errors, []);
});

// ---------------------------------------------------------------- the inventory, all of it

test('every control of this file\'s part of the inventory was pressed (the watch\'s part is tests/feedback-watch.test.js\'s)', () => {
  assert.deepEqual(unpressed(INVENTORY.filter(k => !WATCH_PART.includes(k))), []);
});

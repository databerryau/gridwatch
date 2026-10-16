// "Every press answers" (SPEC Q-41) in the watch's game: tests/feedback.test.js's header says what is
// asserted and how (a press sampled before, on the press frame and a little after; help never red); this
// is its third game, a file of its own (W6, the test budget), with the helpers of tests/lib/feedback.js.
//
// States, by test (one game, each test going on from the one before it): the watch (seed 20261007's legacy
// desk, COAL 1 at 11:37:31, the first full watch: the desk is locked); the RESPOND card; the shortage
// (15:40, SHORT: DIRECT SHED, RESTORE); the day over (set by state: playing on to 04:00 costs ~2 s more).
// The quiet hours between are the sim alone (tests/lib/play.js skipTo: no press and no card on them).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {legacyDesk} from './lib/sim-helpers.js';
import {WATCH_PART, unpressed, click, tap, act, down, lock, stackHit, stackClick, stackSays, mapClick} from './lib/feedback.js';

const W = {};
test('every press answers: the watch (the first full one: the desk answers with the lock note)', () => {
  const p = W.p = openGame({scenario: legacyDesk()}); // (today's desk events: the dayplan, slice 2c, moves them)
  p.skipTo('11:30');   // (W6, the test budget: the quiet morning as the sim alone, tests/lib/play.js skipTo: no press and no card on it)
  const r = p.until('trip', {max: '13:00', line: 'near'});
  assert.equal(r.why, 'trip');
  assert.equal(p.mode(), 'WATCH');
  click(p, 'station-start-gtc', lock, 'guard-start');
  tap(p, '1', /lever-coal "[^"]*"=\d+ \[[^\]]*focus/, 'keys-focus');
  tap(p, 'ArrowUp', lock, 'lever-track');
  tap(p, 's', lock, 'keys-ss-xx-p');
  tap(p, '6', null, 'keys-focus');
  tap(p, 'ArrowUp', lock, 'hydro-wheel');
  click(p, 'key-agc', lock, 'key-agc-desk');
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
  p.skipTo('15:15');   // (W6: the afternoon too; the page's own jump from 15:15 computes the line's last 20 min, as before)
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
  click(p, 'station-start-gtc', DESK, 'guard-start');
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

test('every control of this file\'s part of the inventory was pressed', () => {
  assert.deepEqual(unpressed(WATCH_PART), []);
});

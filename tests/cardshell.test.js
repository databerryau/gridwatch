// The suburb card's shell (SPEC §9.1 Q-56; desk/README.md §31.3.8, §31.4 step 4, §31.9.1, §31.9.3): how
// app/game.js, app/shell.js and app/keys.js open, close, hide and focus the card, with stage A's stub
// (app/suburbcard.js; wave 2 fills it: only the name's start and btn-suburb-close are read from it). Headless
// through tests/lib/play.js: sampled frames, no day walked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import * as G from '../app/game.js';
import * as K from '../app/keys.js';
import {bootGame, layoutSizes} from '../app/shell.js';
import {controlName} from '../app/alarmpanel.js';
import {makeDocument} from './lib/dom.js';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const CITY = DESK.city.suburbs.map(s => s.id); // SOL HAZ RED HAR TAL SAL
const card = p => p.$('suburb-card');
const inCard = p => card(p).contains(p.doc.activeElement);
const toast = p => (p.$('toast').hidden ? '' : (p.$('toast').classList.contains('info') ? 'blue ' : 'RED ') + p.$('toast').textContent);

test('§31.9.1: #suburb-card is a hidden dialog left of the map, z 11 under the respond card, not a .card, 8 px over #planbar', () => {
  const tag = /<div id="suburb-card"([^>]*)><\/div>/.exec(NEXT);
  assert.ok(tag, 'next.html has the container');
  assert.match(tag[1], /role="dialog"/);
  assert.match(tag[1], /\bhidden\b/);
  assert.doesNotMatch(tag[1], /class=/, 'not class card: placeQs would put "?" inside it');
  const rule = /#suburb-card \{([^}]*)\}/.exec(NEXT)[1];
  for (const d of ['position: fixed', 'z-index: 11', 'left: 32px', 'top: calc(var(--hdr) + 8px)', 'width: 400px', 'overflow-y: auto']) assert.ok(rule.includes(d), d);
  assert.match(/\.card \{[^}]*\}/.exec(NEXT)[0], /z-index: 12/, 'the respond card stays above it');
  // max-height down to 8 px above #planbar (its --planbar-h, so a two-row line is never under the card): 194 px at the 1280x600 floor
  const m = /max-height: calc\(100vh - var\(--desk-h\) - var\(--hdr\) - (\d+)px\)/.exec(rule);
  const L = layoutSizes(1280, 600), bar = Number(/--planbar-h: (\d+)px/.exec(NEXT)[1]);
  assert.equal(Number(m[1]), bar + 16, 'the plan bar and the 8-px gaps above and below the card');
  assert.equal(600 - L.desk - L.header - Number(m[1]), 194);
  // H: its own key, never on repeat (K-23)
  assert.deepEqual(K.keyDown(K.createKeys(), {key: 'h'}, null, 0), {ui: {do: 'suburb'}});
  assert.deepEqual(K.keyDown(K.createKeys(), {key: 'H', shiftKey: true}, null, 0), {ui: {do: 'suburb'}});
  assert.equal(K.keyDown(K.createKeys(), {key: 'h', repeat: true}, null, 0), null);
  // GO TO names (app/alarmpanel.js)
  assert.equal(controlName('suburb-card'), 'SUBURBS');
  assert.equal(controlName('suburb-HAZ'), 'Old Hazelton');
  assert.equal(controlName('suburb-TAL'), 'Tallowood Heights');
});

test('§31.4 step 4 / §31.9.1: H opens (focus in) and H closes (focus back); a held H does not toggle; no key in the card reaches the lever behind it (arrows, PgUp/PgDn, S S, X X, P); a map press opens or switches, never closes; Esc and ✕ close', () => {
  const p = openGame({seed: 20261007});
  assert.equal(p.vm().suburb, null);
  assert.equal(card(p).hidden, true);
  p.key('1');
  const lever = p.doc.activeElement;
  assert.equal(lever.id, 'lever-coal');
  // H: no line names a suburb and none is hovered: the first in city order
  p.key('h');
  assert.equal(p.vm().suburb, CITY[0]);
  assert.equal(card(p).hidden, false);
  assert.match(card(p).textContent, /^SOLSTICE RISE/);
  assert.ok(inCard(p), 'H moved the focus into the card');
  // a held H repeats keydowns: none toggles
  for (let i = 0; i < 3; i++) p.keyDown('h', {repeat: true});
  p.keyUp('h');
  p.frame();
  assert.equal(p.vm().suburb, CITY[0], 'a held H does not toggle');
  // the card's keys are its own: with the card focused, no key reaches the lever vm.focus still names (arrows, PgUp/PgDn, S S, X X, P)
  const log = p.game.state.log.length;
  for (const k of ['ArrowDown', 'PageDown', 'PageUp', 's', 's', 'x', 'x', 'p', 'S', 'S']) p.key(k);
  p.key('ArrowUp', {shiftKey: true});
  p.key('P', {shiftKey: true});
  assert.equal(p.game.state.log.length, log, 'no input sent');
  assert.equal(p.vm().focus, 'lever-coal');
  assert.ok(inCard(p));
  // a second H closes it and the focus goes back to its opener
  p.key('h');
  assert.equal(p.vm().suburb, null);
  assert.equal(card(p).hidden, true);
  assert.equal(p.doc.activeElement, lever, 'the focus is back on the lever');
  // a map press ({do: 'suburb', id}) opens; the same press again keeps it open (F10); another switches
  assert.equal(p.h.actions.ui({do: 'suburb', id: 'HAZ'}), '');
  p.frame();
  assert.equal(p.vm().suburb, 'HAZ');
  assert.equal(p.h.actions.ui({do: 'suburb', id: 'HAZ'}), '');
  p.frame();
  assert.equal(p.vm().suburb, 'HAZ', 'a double click never closes what it opened');
  p.key('1');
  p.h.actions.ui({do: 'suburb', id: 'RED'});
  p.frame();
  assert.match(card(p).textContent, /^REDGUM FLATS/);
  assert.ok(inCard(p), 'a switch takes the focus too');
  // Esc closes it (Q-47)
  p.key('Escape');
  assert.equal(p.vm().suburb, null);
  assert.equal(p.doc.activeElement, lever);
  // ✕ closes it ({do: 'suburb', id: null}); an unknown id answers in blue and changes nothing
  p.key('h');
  assert.equal(p.vm().suburb, 'RED', 'H opens the last opened');
  p.click('btn-suburb-close');
  assert.equal(p.vm().suburb, null);
  assert.equal(p.h.actions.ui({do: 'suburb', id: 'XYZ'}), 'no such suburb');
  p.frame();
  assert.equal(toast(p), 'blue no such suburb');
  assert.equal(p.vm().suburb, null);
  assert.deepEqual(p.h.mods.errors, []);
});

test('§31.9.1: H\'s pick (the line\'s suburb, the hovered, the last, the first); focus suburb-<ID> and suburb-card; alarmsGoto (no suburb id becomes vm.focus); the alarm panel closes first, also for the real H; Esc order; only the dark-suburb click leaves the focus on RESTORE; vm.suburb and vm.dayAhead; resetDay', () => {
  const p = openGame({seed: 20261007});
  const vm = p.vm();
  assert.ok('suburb' in vm && 'dayAhead' in vm);
  assert.ok(p.game.dayAhead && vm.dayAhead === p.game.dayAhead && vm.dayAhead.demandP50.length > 200, 'vm.dayAhead is the line\'s forecast to 04:00');
  // focus suburb-<ID> opens that card; focus suburb-card never closes it and keeps its suburb
  assert.equal(p.h.actions.ui({do: 'focus', target: 'suburb-HAZ'}), '');
  p.frame();
  assert.equal(p.vm().suburb, 'HAZ');
  assert.ok(inCard(p));
  assert.equal(p.vm().focus, null, 'a suburb id never becomes vm.focus (it would outlive the card)');
  p.key('1');
  p.h.actions.ui({do: 'focus', target: 'suburb-card'});
  p.frame();
  assert.equal(p.vm().suburb, 'HAZ');
  assert.ok(inCard(p), 'focus suburb-card moves the focus into the open card');
  p.key('Escape');
  // closed: focus suburb-card opens the last opened
  p.h.actions.ui({do: 'focus', target: 'suburb-card'});
  assert.equal(p.vm().suburb, null, '(the vm follows on the next frame)');
  p.frame();
  assert.equal(p.vm().suburb, 'HAZ');
  p.h.actions.ui({do: 'suburb', id: null});
  // the hovered suburb beats the last; the line's suburb beats the hovered
  p.h.actions.ui({do: 'hover', target: 'suburb-TAL'});
  p.key('h');
  assert.equal(p.vm().suburb, 'TAL');
  p.key('h');
  p.game.objective = {level: 'plan', kind: 'city', text: 'a city line', targets: ['dial-battery', 'suburb-SAL'], action: null};
  p.key('h');
  assert.equal(p.vm().suburb, 'SAL');
  p.key('h');
  p.game.objective = null;
  p.h.actions.ui({do: 'hover', target: null});
  // the alarm panel open: {do: 'suburb'} closes it as GO TO does (the clock held), then opens the card
  p.key('w');
  assert.equal(p.vm().alarmsOpen, true);
  p.h.actions.ui({do: 'suburb'});
  p.frame();
  assert.deepEqual([p.vm().alarmsOpen, p.vm().mode.mode, p.vm().suburb], [false, 'PAUSE', 'SAL']);
  // the real H with the panel and the card both open: the panel closes, the card stays and takes the focus
  p.key('w');
  assert.deepEqual([p.vm().alarmsOpen, inCard(p)], [true, false]);
  p.key('h');
  assert.deepEqual([p.vm().alarmsOpen, p.vm().mode.mode, p.vm().suburb, card(p).hidden], [false, 'PAUSE', 'SAL', false]);
  assert.ok(inCard(p), 'H moved the focus into the card');
  p.h.actions.ui({do: 'suburb', id: null});
  // GO TO suburb-HAZ from the panel: closed and paused as today, then the card; its opener (in the panel) is gone, so the map gets the focus back
  p.key('w');
  p.h.actions.ui({do: 'alarmsGoto', target: 'suburb-HAZ'});
  p.frame();
  assert.deepEqual([p.vm().alarmsOpen, p.vm().mode.mode, p.vm().suburb], [false, 'PAUSE', 'HAZ']);
  assert.ok(inCard(p));
  p.key('h');
  assert.equal(p.vm().suburb, null);
  assert.ok(p.$('map').contains(p.doc.activeElement), 'the opener is hidden: the map');
  // Esc order: SETTINGS (and the drawer) above the card, the card above a desk note
  p.key('h');
  p.key(',');
  assert.equal(p.vm().settingsOpen, true);
  p.key('Escape');
  assert.deepEqual([p.vm().settingsOpen, p.vm().suburb], [false, 'HAZ']);
  p.key('?');
  p.key('Escape');
  assert.deepEqual([p.vm().drawer, p.vm().suburb], [false, 'HAZ']);
  assert.equal(p.h.closeTop(), true);
  assert.equal(p.game.ui.suburb, null, 'then the card');
  // the dark-suburb click (the map: the RESTORE focus, then the card): RESTORE keeps the focus
  p.h.actions.ui({do: 'focus', target: 'bay-restore'});
  p.h.actions.ui({do: 'suburb', id: 'RED'});
  p.frame();
  assert.equal(p.vm().suburb, 'RED');
  assert.ok(p.$('bay-restore').contains(p.doc.activeElement), 'the focus stays on RESTORE');
  p.key('Escape');
  assert.equal(p.vm().suburb, null);
  assert.ok(p.$('bay-restore').contains(p.doc.activeElement), 'and stays there when the card closes');
  // only that click: H from the RESTORE tab moves the focus into the card, and a second H gives it back
  p.key('h');
  assert.equal(p.vm().suburb, 'RED');
  assert.ok(inCard(p), 'H from RESTORE takes the focus');
  p.key('h');
  assert.ok(p.$('bay-restore').contains(p.doc.activeElement));
  // a new day forgets the card and the last opened
  p.key('h');
  G.resetDay(p.game);
  assert.deepEqual([p.game.ui.suburb, p.game.ui.suburbLast], [null, null]);
});

test('§31.9.3: the watch hides the card (vm.suburb kept) and closeTop passes over it, so Esc skips the watch; H and {do: suburb} answer in blue and change nothing, the alarm panel included; it shows again when the lock ends', () => {
  const seen = {getItem: k => (k === G.SEEN_KEY ? JSON.stringify({watch: true}) : null), setItem() {}};
  const p = openGame({seed: 20261007, storage: seen});
  p.h.actions.ui({do: 'suburb', id: 'HAZ'});
  p.frame();
  assert.ok(inCard(p));
  injectTrip(p.game.state, Math.floor(p.game.state.tick / TPS) + 60);
  assert.equal(p.until('trip', {max: '+10m'}).why, 'trip');
  assert.deepEqual([p.vm().mode.mode, p.vm().mode.locked], ['WATCH', true]);
  assert.equal(card(p).hidden, true, 'hidden through the watch');
  assert.equal(p.vm().suburb, 'HAZ', 'vm.suburb kept');
  assert.equal(inCard(p), false, 'the focus left in the hidden card is let go');
  // H and the map's press answer in blue and change nothing (vm.focus included)
  const s = p.pressKey('h'), focus = p.vm().focus;
  assert.match(s.during, /^TOAST blue The suburb card is back after the watch$/m);
  assert.equal(p.h.actions.ui({do: 'suburb', id: 'RED'}), 'The suburb card is back after the watch');
  assert.equal(p.h.actions.ui({do: 'focus', target: 'suburb-SAL'}), 'The suburb card is back after the watch');
  p.frame();
  assert.deepEqual([p.vm().suburb, p.vm().focus], ['HAZ', focus]);
  // with the alarm panel open as well: H and {do: 'suburb'} leave it open and the clock held
  p.key('w');
  p.key('h');
  p.h.actions.ui({do: 'suburb'});
  p.frame();
  assert.deepEqual([p.vm().alarmsOpen, p.vm().mode.mode, p.vm().suburb], [true, 'ALARMS', 'HAZ']);
  p.key('w');
  assert.equal(p.vm().mode.mode, 'WATCH');
  // paused: still hidden
  p.key(' ');
  assert.deepEqual([p.vm().mode.mode, card(p).hidden], ['PAUSE', true]);
  p.key(' ');
  // Esc passes over the hidden card: it skips the watch (seen before), and the card stays hidden while the trip is still locked
  assert.equal(p.vm().mode.canSkip, true);
  assert.equal(p.h.closeTop(), false);
  p.key('Escape');
  assert.equal(p.vm().suburb, 'HAZ');
  assert.equal(p.vm().mode.mode, 'CRUISE', 'skipped');
  assert.equal(p.vm().mode.locked, true);
  assert.equal(card(p).hidden, true);
  // the lock ends: the card is back, without taking the focus again
  assert.equal(p.until('card', {max: '+10m'}).why, 'card');
  assert.equal(p.vm().mode.locked, false);
  assert.equal(card(p).hidden, false);
  assert.match(card(p).textContent, /^OLD HAZELTON/);
  assert.equal(inCard(p), false);
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-44: the card loads on demand ("Loading…" until it arrives); a failed load says so', async () => {
  const boot = loader => {
    let t = 1000;
    const doc = makeDocument(NEXT);
    const h = bootGame(doc, {search: '?seed=7', storage: null, audioWin: {}, raf: false, now: () => t, scenario: DESK, suburbCard: loader});
    return {h, box: doc.getElementById('suburb-card'), frame: () => { t += 17; h.frame(1 / 60); }};
  };
  let arrive;
  const mod = await import('../app/suburbcard.js');
  const a = boot(() => new Promise(r => { arrive = r; }));
  a.h.actions.ui({do: 'suburb', id: 'HAZ'});
  a.frame();
  assert.equal(a.box.hidden, false);
  assert.equal(a.box.textContent, 'Loading…');
  await new Promise(r => setTimeout(r, 0));
  a.frame();
  assert.equal(a.box.textContent, 'Loading…', 'until it arrives');
  arrive(mod);
  await new Promise(r => setTimeout(r, 0));
  a.frame();
  assert.match(a.box.textContent, /^OLD HAZELTON/);
  const b = boot(() => Promise.reject(new Error('offline')));
  b.h.actions.ui({do: 'suburb'});
  b.frame();
  await new Promise(r => setTimeout(r, 0));
  b.frame();
  assert.match(b.box.textContent, /^The suburb card could not be loaded\. Esc or H closes it\.$/);
  assert.deepEqual(b.h.mods.errors, ['suburb card: offline']);
});

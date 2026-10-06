// K-22 settings (desk/README.md §13.1, B-4, B-7) and the cue queue (§13.2, B-6): the model in
// app/game.js, then the SETTINGS popover, the body classes and the CRT overlay through the shell
// in the stand-in DOM.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import {hashState} from '../sim/step.js';
import {makeDocument, installGlobals} from './lib/dom.js';
import {injectTrip} from './lib/sim-helpers.js';
import * as G from '../app/game.js';
import {bootGame, CRT_OFF} from '../app/shell.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const TPS = V.TICKS_PER_S;

/** A localStorage stand-in. */
function memStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }};
}

function boot(over = {}, query = '?seed=7') {
  const doc = makeDocument(NEXT);
  const seen = {desk: []};
  const createDesk = (d, root) => {
    for (const id of ['lever-coal', 'stack-slot']) { const e = d.createElement('div'); e.id = id; e.tabIndex = 0; root.appendChild(e); }
    return {el: root, update(vm) { seen.desk.push(vm); }};
  };
  let t = 1000;
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: () => 'blob:x', revokeObjectURL() {}}), Blob: class {}});
  const h = bootGame(doc, Object.assign({createDesk, search: query, storage: null, audioWin: {}, raf: false, now: () => t, matchMedia: null}, over));
  restore();
  const frames = (n, dtS = 1 / 60) => { for (let i = 0; i < n; i++) { t += dtS * 1000; h.frame(dtS); } };
  const $ = id => doc.getElementById(id);
  return {doc, $, h, seen, frames, key: (k, extra) => doc.dispatch('keydown', Object.assign({key: k}, extra))};
}

test('§13.1 model: vm.settings has the contract shape and defaults; set validates; mute toggles', () => {
  const game = G.createGame({seed: 7, storage: null});
  const st = G.buildVm(game, {nowMs: 0}).settings;
  assert.deepEqual(st, {volume: 0.8, hum: 1, fx: 1, alarms: 1, muted: false, reducedMotion: false, reducedEffects: false, crt: true});
  for (const key of ['volume', 'hum', 'fx', 'alarms']) {
    assert.equal(G.ui(game, {do: 'set', key, value: 0.25}), '');
    assert.equal(G.buildVm(game, {nowMs: 1}).settings[key], 0.25);
    for (const bad of [-0.1, 1.5, NaN, '0.5', null, undefined]) assert.notEqual(G.ui(game, {do: 'set', key, value: bad}), '', key + ' ' + bad);
    assert.equal(game.settings[key], 0.25, 'a bad value changes nothing');
  }
  assert.equal(G.ui(game, {do: 'set', key: 'nope', value: 1}), 'unknown setting');
  assert.equal(G.ui(game, {do: 'mute'}), '');
  assert.equal(G.buildVm(game, {nowMs: 2}).settings.muted, true);
  G.ui(game, {do: 'mute'});
  assert.equal(game.settings.muted, false);
  // B-4: the CRT overlay is on by default and off whenever REDUCED EFFECTS is on (the choice is kept).
  G.ui(game, {do: 'set', key: 'reducedEffects', value: true});
  let v = G.buildVm(game, {nowMs: 3}).settings;
  assert.deepEqual([v.reducedEffects, v.crt, game.settings.crt], [true, false, true]);
  G.ui(game, {do: 'set', key: 'reducedEffects', value: false});
  assert.equal(G.buildVm(game, {nowMs: 4}).settings.crt, true);
  G.ui(game, {do: 'set', key: 'crt', value: false});
  assert.equal(G.buildVm(game, {nowMs: 5}).settings.crt, false);
  // The popover (B-7): open / close / toggle, in the vm.
  assert.equal(G.buildVm(game, {nowMs: 6}).settingsOpen, false);
  G.ui(game, {do: 'settings'});
  assert.equal(G.buildVm(game, {nowMs: 7}).settingsOpen, true);
  G.ui(game, {do: 'settings', on: true});
  assert.equal(game.ui.settingsOpen, true);
  G.ui(game, {do: 'settings'});
  assert.equal(G.buildVm(game, {nowMs: 8}).settingsOpen, false);
});

test('§13.1 reduced motion: the stored choice, else the system (prefers-reduced-motion); stored as true | false | null', () => {
  let sys = true;
  const storage = memStorage();
  const game = G.createGame({seed: 7, storage, reducedMotion: () => sys});
  assert.equal(G.settingsView(game).reducedMotion, true, 'no choice: follow the system');
  sys = false;
  assert.equal(G.settingsView(game).reducedMotion, false, 'and keep following it');
  assert.equal(game.settings.reducedMotion, null);
  G.ui(game, {do: 'set', key: 'reducedMotion', value: true});
  assert.equal(G.settingsView(game).reducedMotion, true, 'the choice wins over the system');
  assert.equal(JSON.parse(storage.m.get(G.SETTINGS_KEY)).reducedMotion, true);
  sys = true;
  G.ui(game, {do: 'set', key: 'reducedMotion', value: false});
  assert.equal(G.settingsView(game).reducedMotion, false);
  G.ui(game, {do: 'set', key: 'reducedMotion', value: null});
  assert.equal(JSON.parse(storage.m.get(G.SETTINGS_KEY)).reducedMotion, null);
  assert.equal(G.settingsView(game).reducedMotion, true, 'null: the system again');
  assert.equal(G.settingsView(G.createGame({seed: 7, storage: null})).reducedMotion, false, 'no system answer: off');
  assert.equal(G.settingsView(G.createGame({seed: 7, storage: null, reducedMotion: () => { throw new Error('x'); }})).reducedMotion, false);
});

test('K-22 / C-8: settings persist under gridwatch:v4:settings as the choices only; a blocked or corrupt store never stops the game', () => {
  assert.equal(G.SETTINGS_KEY, 'gridwatch:v4:settings');
  const storage = memStorage();
  const a = G.createGame({seed: 7, storage, reducedMotion: true});
  assert.equal(storage.m.has(G.SETTINGS_KEY), false, 'nothing is written until a choice is made');
  G.ui(a, {do: 'set', key: 'hum', value: 0.4});
  G.ui(a, {do: 'set', key: 'reducedEffects', value: true});
  G.ui(a, {do: 'mute'});
  const stored = JSON.parse(storage.m.get(G.SETTINGS_KEY));
  assert.deepEqual(stored, {volume: 0.8, hum: 0.4, fx: 1, alarms: 1, muted: true, reducedMotion: null, reducedEffects: true, crt: true},
    'the choices, not the resolved view (reducedMotion stays null, crt stays the choice)');
  const b = G.createGame({seed: 7, storage});
  assert.deepEqual(G.settingsView(b), {volume: 0.8, hum: 0.4, fx: 1, alarms: 1, muted: true, reducedMotion: false, reducedEffects: true, crt: false});
  // A 1a store ({volume, muted}) and rubbish load as far as they are valid.
  const old = G.createGame({seed: 7, storage: memStorage({[G.SETTINGS_KEY]: '{"volume":0.3,"muted":true}'})});
  assert.deepEqual([old.settings.volume, old.settings.muted, old.settings.hum, old.settings.crt], [0.3, true, 1, true]);
  for (const junk of ['not json', '[]', '7', '{"volume":9,"hum":"loud","crt":"yes","reducedMotion":"maybe","extra":1}']) {
    const g = G.createGame({seed: 7, storage: memStorage({[G.SETTINGS_KEY]: junk})});
    assert.deepEqual(g.settings, Object.assign({}, G.SETTINGS_DEFAULT), junk);
  }
  const blocked = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  const c = G.createGame({seed: 7, storage: blocked});
  assert.equal(G.ui(c, {do: 'set', key: 'fx', value: 0.5}), '', 'the choice still applies for this visit');
  assert.equal(G.settingsView(c).fx, 0.5);
  assert.equal(G.ui(c, {do: 'mute'}), '');
});

test('B-6 / §13.2: ui({do: "cue"}) queues into vm.cues for one frame; it is never a sim input', () => {
  const game = G.createGame({seed: 7, storage: null});
  G.takeDesk(game);
  G.buildVm(game, {nowMs: 0});
  const hash = hashState(game.state), logN = game.state.log.length;
  assert.equal(G.ui(game, {do: 'cue', name: 'detent'}), '');
  assert.equal(G.ui(game, {do: 'cue', name: 'clack', pan: -0.5}), '');
  assert.equal(G.ui(game, {do: 'cue', name: 'ratchet', pan: 0.25, gain: 0.5, delayS: 0.09, junk: 1}), '');
  assert.equal(G.ui(game, {do: 'cue', name: 'made-up-name'}), '', 'unknown names pass through (the audio ignores them)');
  assert.notEqual(G.ui(game, {do: 'cue'}), '');
  assert.notEqual(G.ui(game, {do: 'cue', name: 7}), '');
  const vm = G.buildVm(game, {nowMs: 16});
  assert.deepEqual(vm.cues, ['detent', {name: 'clack', pan: -0.5}, {name: 'ratchet', pan: 0.25, gain: 0.5, delayS: 0.09}, 'made-up-name']);
  assert.deepEqual(G.buildVm(game, {nowMs: 32}).cues, [], 'a cue is handed over once');
  assert.equal(hashState(game.state), hash, 'presentation only');
  assert.equal(game.state.log.length, logN, 'the input log stays clean (F-6)');
  // A runaway emitter cannot flood a frame.
  for (let i = 0; i < 500; i++) G.ui(game, {do: 'cue', name: 'ratchet'});
  assert.equal(G.buildVm(game, {nowMs: 48}).cues.length, G.MAX_CUES);
  // Records, alarms and the tray feed the same queue: every entry is a name or {name, ...}.
  injectTrip(game.state, Math.floor(game.state.tick / TPS) + 5);
  const all = [];
  for (let i = 0; i < 400; i++) {
    G.runTo(game, game.state.tick + 6 * TPS);
    all.push(...G.buildVm(game, {nowMs: 100 + i * 500, dtS: 0.5}).cues);
  }
  assert.ok(all.length >= 2, 'the trip made sounds: ' + JSON.stringify(all));
  for (const c of all) assert.ok(typeof c === 'string' ? c.length > 0 : typeof c.name === 'string' && c.name.length > 0, JSON.stringify(c));
  const names = all.map(c => (typeof c === 'string' ? c : c.name));
  assert.ok(names.includes('ring2'), 'the tray\'s warning ring');
  assert.ok(names.includes('horn') || names.includes('chime'), 'the annunciator');
});

test('B-7: the SETTINGS popover opens from its header button and `,`, never pauses, and its sliders and switches set vm.settings', () => {
  const storage = memStorage();
  const {$, doc, h, frames, key} = boot({storage});
  $('btn-take').click();
  frames(2);
  const ids = ['set-volume', 'set-hum', 'set-fx', 'set-alarms'];
  for (const id of ids) assert.equal($(id).type, 'range', '#' + id + ' is <input type=range>');
  for (const id of ['set-rm', 'set-fxlow', 'set-crt']) assert.equal($(id).type, 'checkbox', '#' + id);
  assert.match($('settings').textContent, /REDUCED MOTION[\s\S]*REDUCED EFFECTS[\s\S]*CRT/);
  assert.equal($('settings').hidden, true);
  assert.equal($('btn-settings').getAttribute('aria-expanded'), 'false');
  $('btn-settings').click();
  frames(1);
  assert.equal($('settings').hidden, false);
  assert.equal($('btn-settings').getAttribute('aria-expanded'), 'true');
  assert.equal(h.vm().settingsOpen, true);
  assert.equal(doc.activeElement, $('set-volume'), 'the keyboard lands on the first slider');
  assert.equal($('set-volume').value, '80');
  assert.equal($('set-crt').checked, true);
  // Never pauses the game.
  const tick = h.game.state.tick;
  frames(30);
  assert.ok(h.game.state.tick > tick, 'the clock keeps running behind the popover');
  assert.match($('rate-text').textContent, /^CRUISE/);
  // Sliders.
  const slide = (id, v) => { $(id).value = String(v); $(id).dispatch('input'); frames(1); };
  slide('set-volume', 35); slide('set-hum', 0); slide('set-fx', 60); slide('set-alarms', 100);
  const st = h.vm().settings;
  assert.deepEqual([st.volume, st.hum, st.fx, st.alarms], [0.35, 0, 0.6, 1]);
  // Keys typed in the popover are the popover's: an arrow on a slider never reaches the desk or the key map.
  h.actions.ui({do: 'focus', target: 'lever-coal'});
  $('set-hum').focus();
  const logN = h.game.state.log.length;
  key('ArrowUp'); key('1'); key(' '); key('a');
  frames(1);
  assert.equal(h.game.state.log.length, logN, 'no lever moved');
  assert.match($('rate-text').textContent, /^CRUISE/, 'Space did not pause');
  assert.equal(doc.activeElement, $('set-hum'));
  // Switches -> body classes (§13.1).
  const flip = (id, on) => { $(id).checked = on; $(id).dispatch('change'); frames(1); };
  assert.deepEqual(['rm', 'fxlow', 'crt'].map(c => doc.body.classList.contains(c)), [false, false, true], 'CRT on by default (B-4)');
  flip('set-rm', true);
  assert.equal(h.vm().settings.reducedMotion, true);
  assert.ok(doc.body.classList.contains('rm'), 'body.rm');
  flip('set-fxlow', true);
  assert.deepEqual(['rm', 'fxlow', 'crt'].map(c => doc.body.classList.contains(c)), [true, true, false], 'reduced effects: no CRT overlay');
  assert.equal($('set-crt').checked, false);
  assert.equal($('set-crt').disabled, true);
  flip('set-fxlow', false);
  assert.ok(doc.body.classList.contains('crt'));
  flip('set-crt', false);
  assert.ok(!doc.body.classList.contains('crt'));
  assert.equal(h.vm().settings.crt, false);
  // Shift+M mutes (the header button says so).
  $('lever-coal').focus();
  key('M', {shiftKey: true});
  frames(1);
  assert.equal(h.vm().settings.muted, true);
  assert.equal($('btn-mute').textContent, 'SOUND OFF');
  assert.equal($('btn-mute').getAttribute('aria-pressed'), 'true');
  // Esc closes the popover first; `,` opens it again; a click elsewhere closes it.
  key('Escape');
  frames(1);
  assert.equal($('settings').hidden, true);
  key(',');
  frames(1);
  assert.equal($('settings').hidden, false);
  key(',');
  frames(1);
  assert.equal($('settings').hidden, true, '`,` again (typed on a slider) closes it');
  assert.equal(doc.activeElement, $('btn-settings'), 'focus returns to the button');
  key(',');
  doc.body.dispatch('click');
  frames(1);
  assert.equal($('settings').hidden, true);
  // Persisted: a second visit starts with the same choices, classes set before the first frame.
  const again = boot({storage});
  assert.deepEqual(G.settingsView(again.h.game), {volume: 0.35, hum: 0, fx: 0.6, alarms: 1, muted: true, reducedMotion: true, reducedEffects: false,
    crt: false});
  assert.deepEqual(['rm', 'fxlow', 'crt'].map(c => again.doc.body.classList.contains(c)), [true, false, false]);
  assert.equal(again.$('set-volume').value, '35');
  assert.equal(again.$('set-rm').checked, true);
});

test('K-22: reduced motion defaults from prefers-reduced-motion through deps.matchMedia; the choice overrides it', () => {
  const asked = [];
  const mq = {matches: true};
  const {$, doc, h, frames} = boot({matchMedia: q => { asked.push(q); return mq; }});
  assert.deepEqual(asked, ['(prefers-reduced-motion: reduce)']);
  assert.ok(doc.body.classList.contains('rm'), 'body.rm before the first frame');
  frames(1);
  assert.equal(h.vm().settings.reducedMotion, true);
  assert.equal($('set-rm').checked, true);
  mq.matches = false; // the system setting changes mid-visit
  frames(1);
  assert.equal(h.vm().settings.reducedMotion, false);
  assert.ok(!doc.body.classList.contains('rm'));
  mq.matches = true;
  $('set-rm').checked = false;
  $('set-rm').dispatch('change');
  frames(1);
  assert.equal(h.vm().settings.reducedMotion, false, 'the player\'s choice wins');
  // No matchMedia at all (old browsers, Node), or one that throws: off, and the page still boots.
  assert.equal(boot({matchMedia: null}).doc.body.classList.contains('rm'), false);
  assert.equal(boot({matchMedia: () => { throw new Error('no'); }}).doc.body.classList.contains('rm'), false);
  assert.equal(boot({matchMedia: undefined}).doc.body.classList.contains('rm'), false, 'default: globalThis.matchMedia when present');
});

test('B-4 / Q-41: while REDUCED EFFECTS is on the CRT switch is disabled and greyed, its row says why on hover, and a click on it answers in a blue toast', () => {
  const {$, frames} = boot();
  assert.match(NEXT, /#settings label\.off \{ opacity: 0\.4; \}/, 'the greyed row');
  // A browser drops a click aimed at a disabled input (it neither fires nor bubbles), so the greyed
  // square lets clicks through to its row, whose listener answers.
  assert.match(NEXT, /#settings label\.off input \{ pointer-events: none; \}/, 'a click on the greyed square reaches the row');
  $('btn-take').click();
  $('btn-settings').click();
  frames(1);
  const crt = $('set-crt'), row = crt.parentElement;
  const flip = on => { $('set-fxlow').checked = on; $('set-fxlow').dispatch('change'); frames(1); };
  const clickRow = () => { $('toast').hidden = true; row.dispatch('click'); frames(1); return $('toast').hidden ? null : [$('toast').className, $('toast').textContent]; };
  assert.deepEqual([crt.disabled, row.classList.contains('off'), row.title], [false, false, '']);
  flip(true);
  assert.deepEqual([crt.checked, crt.disabled, row.classList.contains('off'), row.title], [false, true, true, CRT_OFF]);
  assert.equal(CRT_OFF, 'CRT is off while REDUCED EFFECTS is on');
  assert.deepEqual(clickRow(), ['info', CRT_OFF]);
  flip(false);
  assert.deepEqual([crt.checked, crt.disabled, row.classList.contains('off'), row.title], [true, false, false, '']);
  assert.equal(clickRow(), null, 'an enabled switch just switches');
  // Stored on: greyed from the first frame of a later visit.
  const again = boot({storage: memStorage({'gridwatch:v4:settings': JSON.stringify({reducedEffects: true})})});
  assert.deepEqual([again.$('set-crt').disabled, again.$('set-crt').parentElement.classList.contains('off')], [true, true]);
});

test('B-4: the CRT overlay is CSS over #map only: 2-px scanlines, opacity <= 0.06, no animation, no pointer events', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(NEXT)[1];
  const rule = /body\.crt #map::before \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'body.crt #map::before');
  const body = rule[1];
  assert.match(body, /pointer-events: none/);
  const op = Number(/opacity: ([\d.]+)/.exec(body)[1]);
  assert.ok(op > 0 && op <= 0.06, 'opacity ' + op);
  assert.match(body, /repeating-linear-gradient\(to bottom, #000 0, #000 1px, transparent 1px, transparent 2px\)/, 'a fixed 2-px period');
  assert.ok(!/animation|transition/.test(body), 'no flicker, no animation');
  assert.equal([...css.matchAll(/body\.crt/g)].length, 1, 'the overlay is the only thing the crt class does');
  assert.ok(!/@keyframes/.test(css), 'the shell animates nothing');
  // Settings controls meet the 24-px target size.
  assert.match(css, /#settings input\[type=range\] \{[^}]*height: 24px/);
  assert.match(css, /#settings input\[type=checkbox\] \{[^}]*width: 24px; height: 24px/);
});

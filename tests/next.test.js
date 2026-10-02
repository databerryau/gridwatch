// The greybox game page (next.html, app/shell.js, app/game.js, app/watch.js, app/keys.js,
// app/perf.js) without a browser: static rules (C-1, C-2, K-17, K-18), then the shell booted in
// the stand-in DOM (tests/lib/dom.js) with stand-in desk / map / stack / system modules that
// use only `actions` and `vm` as desk/README.md §4-§5 state them. The real modules arrive in
// stage C; the boot of app/boot.js with them is marked todo until then.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {V} from '../sim/params.js';
import {hashState, observe} from '../sim/step.js';
import {CLASSIC, DESK} from '../content/scenarios.js';
import {makeDocument, installGlobals} from './lib/dom.js';
import {injectTrip} from './lib/sim-helpers.js';
import * as G from '../app/game.js';
import * as W from '../app/watch.js';
import * as K from '../app/keys.js';
import * as PF from '../app/perf.js';
import * as D from '../app/director.js';
import {bootGame, layoutSizes, createLive, liveFrame, bandOf, LIVE_GAP_MS, objectiveWord, CONSIDER_WORD, dayText} from '../app/shell.js';
import {traceOf, createRecorder, commitMinute, MINUTE_FIELDS, CAUGHT_KEYS} from '../app/record.js';
import * as SYS from '../app/system.js';
import * as PVW from '../app/planview.js';
import {REDISPATCH_AFTER as FOLLOWER_REDISPATCH_AFTER} from './lib/follow.js';
import {TEXT} from '../content/text.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TPS = V.TICKS_PER_S;
const NEXT = readFileSync(join(ROOT, 'next.html'), 'utf8');
const BENCH = readFileSync(join(ROOT, 'bench.html'), 'utf8');

// ------------------------------------------------------------------ static

test('C-2 / C-1: both pages start with the charset meta, load one ES module each, and name no other origin', () => {
  for (const [name, html, entry] of [['next.html', NEXT, 'app/boot.js'], ['bench.html', BENCH, 'app/bench-boot.js']]) {
    assert.match(html, /^<!doctype html>\s*<meta charset="utf-8">/i, name);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1].trim());
    assert.deepEqual(scripts, ['type="module" src="' + entry + '"'], name);
    for (const m of html.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
      assert.ok(!/^(?:[a-z]+:)?\/\//i.test(m[1]) && !/^https?:/i.test(m[1]), name + ' loads ' + m[1]);
    }
    assert.ok(!/@import|url\(\s*['"]?https?:/i.test(html), name + ': no remote CSS');
  }
  assert.match(NEXT, /<link rel="stylesheet" href="desk\/desk.css">/, 'next.html links the desk styles');
});

test('K-18: none of the removed elements\' ids remain in next.html', () => {
  const removed = ['selP', 'strip', 'hPnl', 'hPrice', 'hRes', 'hIn', 'cvD', 'cvF', 'cvG', 'cvM', 'mkt', 'mPrice', 'log', 'logP', 'crt', 'dock',
    // the bench's charts and panels (A-5: they stay on bench.html)
    'c-live', 'c-fday', 'c-demand', 'c-price', 'freq-live-wrap', 'freq-day-wrap', 'demand-chart', 'price-chart', 'event-log', 'log-list',
    'stations-panel', 'security-panel', 'news-panel', 'cont-panel', 'scorecard', 'fos-panel', 'speed', 'assist-select'];
  const ids = [...NEXT.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  for (const id of removed) assert.ok(!ids.includes(id), 'next.html still has #' + id);
  for (const id of ['clock', 'rate-badge', 'chip-lights', 'chip-cost', 'chip-co2', 'btn-pause', 'btn-help', 'map', 'desk', 'respond-card',
    'watch-vignette', 'stopwatch', 'end-card', 'drawer', 'perf', 'stack-overlay', 'briefing-card',
    // Phase 1b (desk/README.md §14.4): the settings popover and the live region
    'btn-settings', 'settings', 'set-volume', 'set-hum', 'set-fx', 'set-alarms', 'set-rm', 'set-fxlow', 'set-crt', 'aria-live', 'btn-mute']) {
    assert.ok(ids.includes(id), '#' + id);
  }
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('K-17: header 32 px, desk max(300, half the rest), map the rest; the CSS says the same', () => {
  assert.deepEqual(layoutSizes(1280, 600), {header: 32, desk: 300, map: 268});
  assert.deepEqual(layoutSizes(1280, 720), {header: 32, desk: 344, map: 344});
  assert.deepEqual(layoutSizes(1920, 1080), {header: 40, desk: 520, map: 520});
  assert.ok(layoutSizes(1280, 600).map >= 260, 'the map is >= 260 px at the floor');
  assert.match(NEXT, /grid-template-rows: var\(--hdr\) minmax\(0, 1fr\) max\(300px, calc\(\(100vh - var\(--hdr\)\) \/ 2\)\)/);
  assert.match(NEXT, /--hdr: 32px/);
  assert.match(NEXT, /@media \(min-width: 1600px\) \{ :root \{ --hdr: 40px; \} \}/);
  assert.match(NEXT, /min-width: 1280px/);
});

test('C-3 / C-8: no location.reload anywhere; every localStorage access in the shell is wrapped', () => {
  const files = [];
  const walk = d => { for (const n of readdirSync(join(ROOT, d))) { const p = join(d, n); if (statSync(join(ROOT, p)).isDirectory()) walk(p); else if (n.endsWith('.js')) files.push(p); } };
  for (const d of ['app', 'render', 'audio', 'content']) walk(d);
  for (const f of files) assert.ok(!/location\.reload/.test(readFileSync(join(ROOT, f), 'utf8')), f);
  const shell = readFileSync(join(ROOT, 'app/shell.js'), 'utf8') + readFileSync(join(ROOT, 'app/game.js'), 'utf8');
  for (const m of shell.matchAll(/\.(?:getItem|setItem)\(|globalThis\.localStorage/g)) {
    const before = shell.slice(Math.max(0, m.index - 200), m.index);
    assert.ok(/try \{/.test(before), 'unwrapped storage access near ' + relative(ROOT, 'app') + ': ' + shell.slice(m.index - 40, m.index + 20));
  }
});

// ------------------------------------------------------------------ stand-in modules (contract shapes only)

const VM_KEYS = ['obs', 'mode', 'frame', 'alarms', 'tray', 'focus', 'hover', 'stackExpanded', 'previewOn', 'previewGuardMW', 'offers',
  'respond', 'glow', 'hist', 'settings', 'settingsOpen', 'cues'];

function stubModules() {
  const seen = {map: [], desk: [], stack: []};
  const mk = (name, build) => (doc, root, actions) => {
    const el = doc.createElement('div');
    el.id = name + '-el';
    root.appendChild(el);
    if (build) build(doc, root, el);
    seen[name + 'Actions'] = actions;
    return {el, update(vm) { seen[name].push(vm); }};
  };
  const createDesk = mk('desk', (doc, root) => {
    for (const id of ['lever-coal', 'wheel-hydro', 'bay-sync', 'bay-restore', 'btn-redispatch', 'gauge-n1', 'dial-freq', 'annunciator', 'tray',
      'key-agc', 'knob-tie', 'key-shed', 'btn-dr', 'stack-slot']) {
      const e = doc.createElement('div');
      e.id = id;
      e.tabIndex = 0;
      root.appendChild(e);
    }
  });
  return {seen, createDesk, createMap: mk('map'), createLiveStack: mk('stack')};
}

function stubSystem() {
  const log = {created: 0, inputs: 0, redispatch: 0};
  return {
    log,
    createSystem() { log.created++; return {n: 0}; },
    systemInputs(sys, state) { log.inputs++; return []; },
    redispatch(sys, state) {
      log.redispatch++;
      if (state.tick < V.PLAYER_START_TICK) return 'no plan before 04:30';
      if (state.contIdx >= 0 && state.tick < state.conts[state.contIdx].watchEndTick) return 'not during the watch';
      return {type: 'tie', mw: 100}; // stands in for the planLoad (a logged input either way)
    },
  };
}

function boot(query = '?seed=7&perf', over = {}) {
  const doc = makeDocument(NEXT);
  const mods = stubModules(), system = stubSystem();
  let t = 1000;
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: () => 'blob:x', revokeObjectURL() {}}), Blob: class {}});
  const h = bootGame(doc, Object.assign({createDesk: mods.createDesk, createMap: mods.createMap, createLiveStack: mods.createLiveStack,
    system, search: query, storage: null, audioWin: {}, raf: false, now: () => t}, over));
  restore();
  const frames = (n, dtS = 1 / 60) => { for (let i = 0; i < n; i++) { t += dtS * 1000; h.frame(dtS); } };
  const key = (k, extra) => doc.dispatch('keydown', Object.assign({key: k}, extra));
  const keyUp = (k, extra) => doc.dispatch('keyup', Object.assign({key: k}, extra));
  return {doc, $: id => doc.getElementById(id), h, mods, system, frames, key, keyUp, advance: ms => { t += ms; }};
}

test('the shell boots: briefing (AGC/HAND, TAKE THE DESK), the modules mounted with the §4 actions, the §5 vm every frame', () => {
  const {$, h, mods, system, frames, key} = boot();
  assert.equal(system.log.created, 1);
  frames(2);
  assert.equal($('briefing-card').hidden, false, 'the briefing card at 04:00');
  assert.match($('rate-text').textContent, /PAUSE/);
  assert.equal(h.game.state.tick, 0, 'paused behind the briefing');
  for (const name of ['map', 'desk', 'stack']) {
    const a = mods.seen[name + 'Actions'];
    assert.deepEqual(Object.keys(a).sort(), ['input', 'previewTrip', 'redispatch', 'restorePreview', 'ui'], name);
    assert.ok(mods.seen[name].length >= 2, name + ' updated each frame');
  }
  assert.equal(mods.seen.stack.length, mods.seen.desk.length);
  assert.ok($('stack-slot').contains($('stack-el')), 'the Live Stack mounts in the desk\'s #stack-slot');
  const vm = h.vm();
  for (const k of VM_KEYS) assert.ok(k in vm, 'vm.' + k);
  assert.deepEqual(Object.keys(vm.mode).sort(), ['locked', 'mode', 'rate', 'watchS', 'watchVersion']);
  assert.ok(vm.glow instanceof Set);
  assert.equal(vm.alarms.tiles.length, 12);
  assert.equal(vm.hist.freq.length, G.HIST_FREQ_S);
  assert.deepEqual(Object.keys(vm.hist.stations), [...V.STATION_IDS, 'wind', 'solar', 'tie', 'battery', 'rert', 'dr']);
  assert.equal(mods.seen.desk.at(-1), mods.seen.map.at(-1), 'every module reads the same vm');
  assert.equal(h.actions.redispatch(), 'no plan before 04:30');
  // HAND, then TAKE THE DESK (Enter works too): 04:00-04:30 runs headless, then CRUISE.
  $('btn-hand').click();
  key('Enter');
  frames(1);
  assert.equal($('briefing-card').hidden, true);
  assert.equal(h.game.state.control.mode, 'HAND');
  assert.ok(h.game.state.tick >= V.PLAYER_START_TICK);
  assert.ok(system.log.inputs >= V.PLAYER_START_TICK, 'the system operator is asked every tick');
  frames(30);
  assert.match($('rate-text').textContent, /^CRUISE 120×$/);
  assert.match($('clock-text').textContent, /^04:3\d$/);
  assert.equal($('chip-lights-v').textContent, '100%');
  assert.match($('chip-cost-v').textContent, /^\d+\.\d$/);
  assert.match($('chip-co2-v').textContent, /^\d\.\d\d$/);
  // Actions: a refused input comes back as its reason (and a toast); an accepted one as ''.
  assert.equal(h.actions.input({type: 'tie', mw: 150}), '');
  assert.match(h.actions.input({type: 'tie', mw: 5000}), /within/);
  assert.equal($('toast').hidden, false);
  assert.equal(h.actions.redispatch(), '', 'RE-DISPATCH goes through app/system.js');
  const p = h.actions.previewTrip({kind: 'unit'});
  assert.ok(p.nadirHz > 45 && p.nadirHz < 50.5 && typeof p.caught.governorsMW === 'number');
  assert.equal(h.actions.previewTrip({kind: 'unit'}), p, 'cached within the grid second');
  const g = h.actions.previewTrip({kind: 'unit', guardMW: 300});
  assert.ok(g.nadirHz >= p.nadirHz - 1e-9, 'more guard never lowers the preview');
  assert.equal(h.actions.restorePreview(h.game.state.city.districts[0].id), 'district is lit');
  // ?perf
  frames(40);
  assert.equal($('perf').hidden, false);
  assert.match($('perf').textContent, /frame ms p50 [\d.]+ · p95[\s\S]*draw desk/);
});

test('K-23 keys: Space, 1-8, A / Shift+A, T, L (twice), F hold, ?, Esc; typing in a field is ignored; a consumed key is left alone', () => {
  const {$, doc, h, frames, key, keyUp} = boot('?seed=7');
  $('btn-take').click();
  frames(2);
  key(' ');
  frames(1);
  assert.match($('rate-text').textContent, /PAUSE/);
  key(' ');
  key('1');
  frames(1);
  assert.equal(h.vm().focus, 'lever-coal');
  assert.equal(doc.activeElement, $('lever-coal'), 'the control gets keyboard focus');
  key('8');
  frames(1);
  assert.equal(h.vm().focus, 'knob-tie');
  key('t');
  frames(1);
  assert.equal(h.vm().previewOn, true);
  key('l');
  frames(1);
  key('l');
  frames(1);
  assert.equal(h.vm().stackExpanded, true, 'L focuses the stack, L again expands it (L-4)');
  assert.ok($('stack-overlay').contains($('stack-el')) && !$('stack-overlay').hidden, 'the stack moves over the map');
  key('l');
  frames(1);
  assert.ok($('stack-slot').contains($('stack-el')) && $('stack-overlay').hidden, 'and back into its slot');
  key('f');
  frames(1);
  assert.match($('rate-text').textContent, /^FAST 360×$/);
  keyUp('f');
  frames(1);
  assert.match($('rate-text').textContent, /^CRUISE/);
  key('?');
  frames(1);
  assert.equal($('drawer').hidden, false);
  assert.equal($('drawer').querySelectorAll('article').length, TEXT.abstractions.length, 'the drawer lists every abstraction');
  key('Escape');
  frames(1);
  assert.equal($('drawer').hidden, true, 'Esc closes the drawer first');
  // A key a focused control consumed is left alone.
  const before = h.vm().stackExpanded;
  doc.dispatch('keydown', {key: 'l', defaultPrevented: true});
  frames(1);
  assert.equal(h.vm().stackExpanded, before);
  // Typing in a text field.
  const input = doc.createElement('input');
  input.type = 'text';
  doc.body.appendChild(input);
  input.focus();
  doc.dispatch('keydown', {key: ' '});
  frames(1);
  assert.match($('rate-text').textContent, /^CRUISE/);
});

test('K-23 key map (pure): S S / X X guarded, arrows and detents on the focused lever, the scope keys, D / E holds', () => {
  const game = G.createGame({seed: 7, storage: null});
  G.takeDesk(game);
  const vm = G.buildVm(game, {nowMs: 0});
  vm.focus = 'lever-coal';
  const k = K.createKeys();
  const coal = vm.obs.stations.find(s => s.id === 'coal');
  assert.deepEqual(K.keyDown(k, {key: 'ArrowUp'}, vm, 0), {input: {type: 'basePoint', station: 'coal', mw: Math.round(coal.basePointMW + 10)}});
  assert.deepEqual(K.keyDown(k, {key: 'ArrowDown', shiftKey: true}, vm, 10).input.mw, Math.round(coal.basePointMW - 1));
  const pg = K.keyDown(k, {key: 'PageUp'}, vm, 20).input.mw;
  assert.ok(pg > coal.basePointMW && pg <= coal.maxMW);
  assert.equal(K.keyDown(k, {key: 's'}, vm, 1000), null, 'one S does nothing (K-3)');
  const off = vm.obs.units.find(u => u.station === 'coal' && u.mode === 'off' && u.startBlock === '');
  const ss = K.keyDown(k, {key: 's'}, vm, 1500);
  if (off) assert.deepEqual(ss, {input: {type: 'start', unit: off.id}});
  assert.equal(K.keyDown(k, {key: 's'}, vm, 1600), null, 'a third S starts over');
  assert.equal(K.keyDown(k, {key: 'x'}, vm, 5000), null);
  assert.equal(K.keyDown(k, {key: 'x'}, vm, 8000), null, 'too slow: more than 2 s apart');
  const on = vm.obs.units.filter(u => u.station === 'coal' && u.mode === 'on' && u.stopBlock === '').at(-1);
  const xx = K.keyDown(k, {key: 'x'}, vm, 8500);
  assert.deepEqual(xx, on ? {input: {type: 'stop', unit: on.id}} : null);
  // The scope keys need an open scope (the sim's Phase 1a obs.scope).
  assert.equal(K.keyDown(k, {key: ']'}, vm, 0), null);
  const vs = Object.assign({}, vm, {obs: Object.assign({}, vm.obs, {scope: {unit: 'gta1', open: true}})});
  assert.deepEqual(K.keyDown(k, {key: ']'}, vs, 0), {input: {type: 'syncTrim', unit: 'gta1', dHz: 0.05}});
  assert.deepEqual(K.keyDown(k, {key: '['}, vs, 0), {input: {type: 'syncTrim', unit: 'gta1', dHz: -0.05}});
  assert.deepEqual(K.keyDown(k, {key: 'c'}, vs, 0), {input: {type: 'syncClose', unit: 'gta1', bypass: false}});
  assert.deepEqual(K.keyDown(k, {key: 'u'}, vs, 0), {input: {type: 'syncAuto', unit: 'gta1'}});
  assert.deepEqual(K.keyDown(k, {key: 'r'}, vm, 0), {ui: {do: 'focus', target: 'bay-restore'}});
  assert.deepEqual(K.keyDown(k, {key: 'A', shiftKey: true}, vm, 0), {ui: {do: 'silence'}});
  assert.deepEqual(K.keyDown(k, {key: 'a'}, vm, 0), {ui: {do: 'ack'}});
  assert.deepEqual(K.keyDown(k, {key: 'm'}, vm, 0), {ui: {do: 'tray'}});
  assert.equal(K.keyDown(k, {key: 'p'}, vm, 0), null, 'P rejoins only in HAND');
  assert.equal(K.keyDown(k, {key: '1', ctrlKey: true}, vm, 0), null);
  assert.equal(K.keyDown(k, {key: 'Enter'}, vm, 0), null, 'Enter without a card is the focused control\'s');
  // Holds: D and E fire once after 0.6 s, never on a tap.
  const kh = K.createKeys();
  K.keyDown(kh, {key: 'd'}, vm, 0);
  assert.deepEqual(K.poll(kh, 500), []);
  K.keyUp(kh, {key: 'd'});
  assert.deepEqual(K.poll(kh, 700), [], 'a tap never calls DR');
  K.keyDown(kh, {key: 'e'}, vm, 1000);
  K.keyDown(kh, {key: 'e', repeat: true}, vm, 1300);
  assert.deepEqual(K.poll(kh, 1600), [{input: {type: 'armRERT'}}]);
  assert.deepEqual(K.poll(kh, 2000), [], 'once');
  assert.equal(K.FOCUS_KEYS.length, 8);
});

test('K-15 / K-16 through the shell: vignette and stopwatch, beats in physical order, the card (no buttons) with the trace\'s numbers, Enter', () => {
  const {$, doc, h, frames, key} = boot('?seed=3');
  $('btn-take').click();
  frames(1);
  const game = h.game;
  injectTrip(game.state, Math.floor(game.state.tick / TPS) + 120);
  const beats = [];
  let n = 0;
  while (!game.respond && n++ < 60 * 60) {
    frames(1);
    const w = h.vm().watch;
    if (w) {
      assert.equal($('watch-vignette').hidden, false);
      assert.ok(doc.body.classList.contains('watch'));
      assert.match($('stopwatch').textContent, /^T\+\d+\.\d\d s ×(0\.15|1|10)$/);
      assert.match($('rate-text').textContent, /^WATCH T\+/);
      if (beats.at(-1) !== w.beat) beats.push(w.beat);
      assert.ok(w.caption.split(/\s+/).length <= 15, w.caption);
    }
  }
  assert.ok(beats.length >= 3, beats.join());
  const order = beats.map(b => W.BEATS.indexOf(b));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'beats in physical order: ' + beats.join(' → '));
  assert.equal(beats[0], 'inertia');
  assert.equal(beats.at(-1), 'settle');
  // The card: <= 4 lines, no buttons, the trace's numbers.
  frames(1);
  const card = $('respond-card');
  assert.equal(card.hidden, false);
  assert.equal(card.querySelectorAll('button').length, 0, 'the card offers no action (K-16)');
  const lines = card.querySelectorAll('p').map(p => p.textContent);
  assert.ok(lines.length <= 4);
  const c = game.state.conts.at(-1), tr = traceOf(game.rec, c.n);
  let mn = Infinity, j = -1;
  for (let k = 0; k < V.WATCH_S * TPS; k++) if (tr.f[k] < mn) { mn = tr.f[k]; j = k; }
  assert.ok(lines[0].includes(mn.toFixed(3) + ' Hz'), lines[0] + ' vs trace nadir ' + mn);
  const at = k => Math.round(tr.caught[k][j]); // caught[k][extremeTick - startTick] is the record's caught (app/record.js)
  const batt = Math.round(tr.caught.batteryMW[j] + tr.caught.guardMW[j]);
  if (Math.abs(batt) >= 1) assert.ok(lines[1].includes('battery ' + batt + ' MW'), lines[1] + ' vs ' + batt);
  if (Math.abs(at('governorsMW')) >= 1) assert.ok(lines[1].includes('governors ' + at('governorsMW') + ' MW'), lines[1]);
  assert.match(lines[2], /N-1|SHEDDING/);
  assert.match(lines[3], /Enter/);
  assert.equal(h.vm().mode.mode, 'RESPOND-CARD');
  const held = game.state.tick;
  frames(120);
  assert.equal(game.state.tick, held, 'the card holds the clock');
  assert.ok(h.vm().glow.size > 0, 'the controls that could answer light up');
  for (const id of h.vm().respond.glow) assert.match(id, /^(guard-start-[a-z]+\d|dial-battery|knob-tie|bay-restore|lever-[a-z]+|wheel-hydro)$/);
  key('Enter');
  frames(1);
  assert.equal(card.hidden, true);
  assert.ok(game.state.tick > held);
  assert.match($('rate-text').textContent, /^(RESPOND 30×|CRUISE 120×)$/);
});

test('K-9 via the shell: a tray button only focuses (the sim never changes)', () => {
  const {h, frames, $} = boot('?seed=3');
  $('btn-take').click();
  injectTrip(h.game.state, Math.floor(h.game.state.tick / TPS) + 30);
  while (!h.game.respond) frames(1);
  h.actions.ui({do: 'dismissRespond'});
  frames(1);
  const cards = h.vm().tray.cards;
  assert.ok(cards.length >= 1, 'the trip made a card');
  const hash = hashState(h.game.state), logN = h.game.state.log.length;
  for (const c of cards) {
    assert.equal(h.actions.ui({do: 'focus', target: c.button.target}), '');
    frames(0);
    assert.equal(h.game.ui.focus, c.button.target);
  }
  assert.equal(hashState(h.game.state), hash, 'no tray button changes a setpoint, a schedule or a unit state');
  assert.equal(h.game.state.log.length, logN);
});

test('H-14 via the shell: a "?" beside each game anchor on the page opens its text; the drawer lists all', () => {
  const {$, doc, frames} = boot('?seed=7');
  frames(1);
  const qs = doc.querySelectorAll('button.q');
  const anchors = new Set(qs.map(q => q.dataset.anchor));
  for (const id of ['rate-badge', 'clock', 'chip-cost', 'chip-co2', 'btn-mute', 'lever-coal', 'bay-sync', 'btn-redispatch']) {
    assert.ok(anchors.has(id), 'a "?" beside #' + id);
  }
  const q = qs.find(x => x.dataset.anchor === 'bay-sync');
  q.click();
  assert.equal($('popover').hidden, false);
  assert.match($('popover').textContent, /Real world: .*GRIDWATCH: .*Why: /s);
  doc.body.dispatch('click');
  assert.equal($('popover').hidden, true);
  $('btn-help').click();
  frames(1);
  assert.equal($('drawer').querySelectorAll('article').length, TEXT.abstractions.length);
});

test('F-6 / C-3 via the shell: the day ends with the end card; its replay log reproduces the day; PLAY AGAIN resets in place', () => {
  const {$, h, frames} = boot('?seed=11', {storage: {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }}});
  $('btn-take').click();
  frames(3);
  assert.equal(h.actions.input({type: 'guard', mw: 200}), '');
  G.runTo(h.game, V.PLAYER_START_TICK + 40 * 60 * TPS);
  assert.equal(h.actions.input({type: 'tie', mw: -100}), '');
  G.runTo(h.game, V.PLAYER_START_TICK + 90 * 60 * TPS + 7);
  // F-6: the replay file reproduces the day so far (stage C adds the whole-day run, §9).
  const file = JSON.parse(JSON.stringify(G.gameLog(h.game)));
  assert.equal(file.seed, 11);
  assert.equal(file.log.length, 2);
  const again = G.replayGame(file, CLASSIC, h.game.state.tick);
  assert.equal(hashState(again), hashState(h.game.state));
  assert.deepEqual(observe(again).score, observe(h.game.state).score);
  // The day's end (a test poke instead of 20 more grid-hours: the end card reads only obs).
  h.game.state.over = true;
  frames(2);
  assert.equal($('end-card').hidden, false);
  assert.match($('end-card').textContent, /Day over|went black/);
  assert.match($('end-card').textContent, /LIGHTS ON .*COST .*CO₂/s);
  assert.match($('rate-text').textContent, /DAY OVER/);
  $('btn-save-log').click();
  $('btn-again').click();
  frames(1);
  assert.equal(h.game.state.tick, 0, 'a fresh day in the same page');
  assert.equal($('end-card').hidden, true);
  assert.equal($('briefing-card').hidden, false);
});

test('K-12 offers (A-4): offered only while RESPOND, TIGHT or worse, or the evening peak; at most 3 a day', () => {
  const game = G.createGame({seed: 7, storage: null});
  G.takeDesk(game);
  const vm0 = G.buildVm(game, {nowMs: 0});
  assert.deepEqual(vm0.offers, []);
  // Poke units to 'ready' (test only) and a TIGHT level.
  const ready = game.state.units.filter(u => u.mode === 'off').slice(0, 5);
  for (const u of ready) u.mode = 'ready';
  game.state.sec.level = 'SECURE';
  const quiet = G.buildVm(game, {nowMs: 1});
  if (quiet.obs.clock.h < 17 || quiet.obs.clock.h >= 20) assert.deepEqual(quiet.offers, [], 'routine starts sync quietly');
  game.state.sec.level = 'TIGHT';
  const v = G.buildVm(game, {nowMs: 2});
  assert.equal(v.offers.length, G.MAX_OFFERS, 'never more than 3 a day');
  assert.ok(v.offers.every(o => o.why === 'tight'));
  assert.ok(v.glow.has('bay-sync'), 'the SYNC key glows');
  assert.equal(G.ui(game, {do: 'offerTaken', unit: v.offers[0].unit}), '');
  assert.equal(G.ui(game, {do: 'offerTaken', unit: 'coal1'}), 'not offered');
});

test('the watch model on a real trip trace: beats in physical order; captions <= 15 words; the stopwatch', () => {
  const game = G.createGame({seed: 2, storage: null});
  G.takeDesk(game);
  injectTrip(game.state, V.PLAYER_START_S + 600);
  G.runTo(game, V.PLAYER_START_TICK + 600 * TPS + 45 * TPS);
  const c = game.state.conts[0], tr = traceOf(game.rec, c.n);
  const tl = W.beatTimeline(tr);
  const idx = tl.map(b => W.BEATS.indexOf(b.beat));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), tl.map(b => b.beat + '@' + b.k).join(' '));
  assert.equal(tl[0].beat, 'inertia');
  assert.equal(tl.at(-1).beat, 'settle');
  assert.equal(tl.at(-1).k, W.SETTLE_S * TPS);
  if (c.uflsStages === 0) assert.ok(!tl.some(b => b.beat === 'ufls'), 'no UFLS beat unless a relay operated');
  for (const b of W.BEATS) for (const g of [0, 300]) assert.ok(W.caption(b, {guardMW: g, nadirHz: 49.612}).split(/\s+/).length <= 15, b);
  assert.equal(W.caption('battery', {guardMW: 300}).startsWith('YOUR GUARD: 300 MW'), true);
  assert.equal(W.stopwatch(0, 0.15), 'T+0.00 s ×0.15');
  assert.equal(W.stopwatch(12.345, 10), 'T+12.35 s ×10');
  // A UFLS trace (synthetic: a relay at 1.2 s) puts the UFLS beat after the ones before it.
  const fake = {len: 1501, caught: {inertiaMW: new Float64Array(1500).fill(10), batteryMW: new Float64Array(1500).fill(50),
    guardMW: new Float64Array(1500), governorsMW: new Float64Array(1500), loadReliefMW: new Float64Array(1500), uflsMW: new Float64Array(1500)}};
  for (let i = 60; i < 1500; i++) fake.caught.uflsMW[i] = 400;
  for (let i = 200; i < 1500; i++) fake.caught.governorsMW[i] = 80;
  const seq = W.beatTimeline(fake).map(b => W.BEATS.indexOf(b.beat));
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b));
  assert.ok(W.beatTimeline(fake).some(b => b.beat === 'ufls'));
});

test('K-16 model: every number on the card equals the record (and so the trace)', () => {
  const game = G.createGame({seed: 4, storage: null});
  G.takeDesk(game);
  injectTrip(game.state, V.PLAYER_START_S + 900);
  G.runTo(game, V.PLAYER_START_TICK + 900 * TPS + V.WATCH_S * TPS + 5);
  const obs = observe(game.state), c = obs.contingency;
  const card = W.respondCard(obs, c, {glow: ['dial-battery']});
  assert.ok(card.lines.length <= 4);
  assert.equal(card.numbers.nadirHz, c.extremeHz);
  assert.ok(card.lines[0].includes(c.extremeHz.toFixed(3)));
  assert.equal(card.numbers.caught.governorsMW, c.caught.governorsMW);
  assert.equal(card.numbers.caught.batteryMW, c.caught.batteryMW + c.caught.guardMW);
  assert.equal(card.numbers.contained, c.extremeHz >= V.CONTAIN_LO_HZ && c.extremeHz <= V.CONTAIN_HI_HZ);
  assert.equal(card.numbers.secureInS, (c.secureByTick - obs.tick) / TPS);
  assert.ok(card.glow.includes('dial-battery'));
  const fb = W.fallbackGlow(obs, c);
  for (const id of fb) assert.match(id, /^(guard-start-[a-z]+\d|dial-battery|knob-tie)$/);
});

// ------------------------------------------------------------------ Phase 2a wave 3 (desk/README.md §21.4): the app's side of the belly

// A potline trip at grid second atS, through the public path (as tests/lib/sim-helpers.js injectTrip does for a unit).
function injectPotlineTrip(s, atS) {
  const e = {id: 'probe', atS, type: 'smelterTrip', args: {offS: 3600}, contingency: true, warned: false};
  let i = s.evNext;
  while (i < s.ext.events.length && s.ext.events[i].atS <= atS) i++;
  s.ext.events.splice(i, 0, e);
}

test('K-15 / K-16, a loss of load: the beats read the rise, the caption and the card name what the inverters caught (both signs)', () => {
  // captions, <= 15 words, for both signs and with or without the nadir
  for (const rise of [false, true]) for (const inverterMW of [0, -253, 40]) for (const nadirHz of [0, 50.312]) for (const b of W.BEATS) {
    const t = W.caption(b, {guardMW: 300, nadirHz, rise, inverterMW});
    assert.ok(t.length > 0 && t.split(/\s+/).length <= 15, b + ': ' + t);
  }
  assert.equal(W.caption('governors', {guardMW: 0, nadirHz: 50.312, rise: true, inverterMW: -253}), 'Solar and wind back off 253 MW; governors close. The rise stops at 50.312 Hz.');
  assert.equal(W.caption('governors', {guardMW: 0, nadirHz: 0, rise: true, inverterMW: 0}), 'Governors close the valves. The rise slows.');
  assert.equal(W.caption('governors', {guardMW: 0, nadirHz: 49.41, rise: false, inverterMW: 40}), 'Governors open the valves; solar and wind give back 40 MW. Nadir 49.410 Hz.');
  assert.equal(W.caption('governors', {guardMW: 0, nadirHz: 49.612}), 'Governors open the valves. The fall stops at 49.612 Hz.', 'without the new keys: the Phase 1 caption');
  assert.match(W.caption('inertia', {guardMW: 0, rise: true}), /Frequency rises\.$/);
  assert.match(W.caption('settle', {guardMW: 0, rise: true}), /above 50/);
  // a real potline trip before sunrise: wind is the inverter plant running, and it backs off
  const game = G.createGame({seed: 7, scenario: DESK, storage: null});
  G.takeDesk(game);
  injectPotlineTrip(game.state, V.PLAYER_START_S + 600);
  G.runTo(game, V.PLAYER_START_TICK + 600 * TPS + V.WATCH_S * TPS + 5);
  const c = game.state.conts[0], tr = traceOf(game.rec, c.n);
  assert.equal(c.cause, 'load');
  assert.ok(c.lostMW < -200 && c.extremeHz > V.F0_HZ, 'frequency rose: ' + c.extremeHz.toFixed(3));
  assert.ok(c.caught.inverterMW < -V.EVENT_THRESHOLD_MW, 'the inverters caught ' + c.caught.inverterMW.toFixed(0) + ' MW of ' + c.lostMW.toFixed(0));
  assert.deepEqual(Object.keys(tr.caught), [...CAUGHT_KEYS]);
  assert.equal(W.isRise(tr, c), true);
  assert.equal(W.isRise(tr), true, 'read off the trace alone');
  const tl = W.beatTimeline(tr, undefined, c), idx = tl.map(b => W.BEATS.indexOf(b.beat));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), tl.map(b => b.beat + '@' + b.k).join(' '));
  assert.equal(tl[0].beat, 'inertia');
  assert.ok(tl.some(b => b.beat === 'governors'), 'the droop beat is reached on a rise too: ' + tl.map(b => b.beat).join(' '));
  assert.equal(tl.at(-1).beat, 'settle');
  // the watch view at the droop beat names the inverters' MW from the trace
  const gk = tl.find(b => b.beat === 'governors').k + TPS;
  const v = W.watchView(W.createWatch(), tr, c, c.startTick + gk, {rate: 0.15, version: 'full', guardMW: 0});
  assert.equal(v.rise, true);
  assert.equal(v.beat, 'governors');
  assert.equal(v.inverterMW, tr.caught.inverterMW[gk]);
  assert.match(v.caption, /^Solar and wind back off \d+ MW; governors close\./);
  // the card: PEAK, and every source in the words of the event's sign, with the record's MW
  const obs = observe(game.state), card = W.respondCard(obs, obs.contingency);
  assert.match(card.lines[0], /^PEAK 50\.\d{3} Hz: contained within /);
  assert.ok(card.lines[1].includes('solar and wind backed off ' + Math.round(-c.caught.inverterMW) + ' MW'), card.lines[1]);
  assert.doesNotMatch(card.lines[1], /-\d/, 'no negative MW on the card: ' + card.lines[1]);
  assert.equal(card.numbers.caught.inverterMW, c.caught.inverterMW);
  assert.ok(card.lines.length <= 4);
  // the other sign (synthetic): inverters that were backed off give it back after a loss of supply
  const fall = Object.assign({}, obs.contingency, {lostMW: 600, extremeHz: 49.41,
    caught: {inertiaMW: 0, batteryMW: 100, guardMW: 20, governorsMW: 300, loadReliefMW: 30, uflsMW: 0, inverterMW: 40}});
  assert.equal(W.respondCard(obs, fall).lines[1], 'Caught by: inertia → battery 120 MW → governors 300 MW → solar and wind gave back 40 MW → load relief 30 MW.');
  // a record from before Phase 2a (no inverterMW) still makes a card
  const old = Object.assign({}, fall, {caught: {inertiaMW: 0, batteryMW: 100, guardMW: 20, governorsMW: 300, loadReliefMW: 30, uflsMW: 0}});
  assert.equal(W.respondCard(obs, old).lines[1], 'Caught by: inertia → battery 120 MW → governors 300 MW → load relief 30 MW.');
  // app/record.js: the minutes carry the load before rooftop and the rooftop bite
  assert.deepEqual(MINUTE_FIELDS.slice(-2), ['underlying', 'rooftop']);
  const rec = createRecorder(), noon = structuredClone(obs);
  assert.ok(Number.isNaN(rec.minute.underlying[0]) && Number.isNaN(rec.minute.rooftop[0]), 'empty until a minute is committed');
  Object.assign(noon.demand, {nowMW: 3600, underlyingMW: 6000, rooftopMW: 2400});
  commitMinute(rec, noon);
  const k = Math.ceil(noon.tick / (TPS * V.S_PER_MIN)) - 1;
  assert.deepEqual([rec.minute.demand[k], rec.minute.underlying[k], rec.minute.rooftop[k]], [3600, 6000, 2400]);
  delete noon.demand.underlyingMW; delete noon.demand.rooftopMW;
  commitMinute(rec, noon);
  assert.deepEqual([rec.minute.underlying[k], rec.minute.rooftop[k]], [3600, 0], 'an observation from before Phase 2a: all of it underlying');
});

test('Q-18 / K-22: the word beside the objective is by level, and by kind where the level\'s word would mislead (a STOP or BATTERY line never reads SHORT)', () => {
  assert.equal(objectiveWord({kind: 'quiet', level: 'ok'}), '✓ STEADY');
  assert.equal(objectiveWord({kind: 'commit', level: 'plan'}), '◷ PLAN');
  assert.equal(objectiveWord({kind: 'commit', level: 'act'}), '▶ ACT NOW');
  assert.equal(objectiveWord({kind: 'commit', level: 'crit'}), '‼ SHORT');
  assert.equal(objectiveWord({kind: 'short', level: 'crit'}), '‼ SHORT');
  assert.equal(objectiveWord({kind: 'held', level: 'crit'}), '‼ SHORT');
  assert.equal(objectiveWord({kind: 'stop', level: 'plan'}), '◇ SAVING');
  assert.equal(objectiveWord({kind: 'battery', level: 'plan'}), '◇ BATTERY');
  assert.equal(objectiveWord({kind: 'spare', level: 'plan'}), '◷ SPARE');
  assert.equal(objectiveWord({kind: 'restore', level: 'plan'}), '◷ DARK');
  assert.equal(objectiveWord({kind: 'watch', level: 'act'}), '◉ WATCH');
  for (const kind of ['stop', 'battery', 'spare', 'restore', 'watch']) for (const level of ['ok', 'plan', 'act', 'crit']) {
    const w = objectiveWord({kind, level});
    assert.ok(w.length > 2 && !/SHORT/.test(w), kind + ' ' + level + ': ' + w);
    assert.match(w, /^\S [A-Z ]+$/, 'a glyph and a word, never colour alone: ' + w);
  }
  assert.equal(objectiveWord(null), '');
  assert.equal(CONSIDER_WORD, '? IF PRESSED');
});

test('C-10 via the shell: while a guard is under the player\'s hand the line says what the press would do, as "? IF PRESSED" with its level\'s class', () => {
  const {$, h, frames} = boot('?seed=7', {system: SYS, planview: PVW, scenario: DESK, commit: 'player', startPaused: true});
  $('btn-take').click();
  frames(2);
  assert.equal(h.vm().mode.mode, 'PAUSE');
  assert.equal($('objective').hidden, false);
  const o = h.vm().objective;
  assert.equal($('objective-level').textContent, objectiveWord(o));
  assert.equal($('objective').className, o.level);
  assert.equal(h.vm().consider, null);
  // STOP on a coal machine at 04:30: the line says what it would cost, before the press
  assert.equal(h.actions.ui({do: 'consider', target: 'guard-stop-coal1'}), '');
  frames(1);
  const c = h.vm().consider;
  assert.deepEqual(Object.keys(c), ['target', 'text', 'level']);
  assert.equal(c.target, 'guard-stop-coal1');
  assert.match(c.text, /^STOP MT HAZEL COAL 1: off the grid in \d h \d\d, and not back at minimum load before \d\d:\d\d\./);
  assert.equal(c.level, 'crit');
  assert.equal($('objective-level').textContent, CONSIDER_WORD);
  assert.equal($('objective-text').textContent, c.text);
  assert.equal($('objective').className, 'crit consider');
  assert.equal(h.vm().objective.text, o.text, 'the objective itself is unchanged underneath');
  // START on the CCGT: a plan-level line
  h.actions.ui({do: 'consider', target: 'guard-start-ccgt2'});
  frames(1);
  assert.match($('objective-text').textContent, /^START RIVERTON CCGT 2: at minimum load \(175 MW\) by 05:19, 49 min from now, and it must then run 4 h\. /);
  assert.equal($('objective').className, 'plan consider');
  // a press that does nothing says so; a target that is not a guard, or none, gives the objective back
  h.actions.ui({do: 'consider', target: 'guard-start-coal1'});
  frames(1);
  assert.equal($('objective-text').textContent, 'START MT HAZEL COAL 1 does nothing: the unit is on.');
  for (const target of ['dial-battery', null]) {
    h.actions.ui({do: 'consider', target: 'guard-stop-coal1'});
    frames(1);
    assert.equal($('objective-level').textContent, CONSIDER_WORD);
    h.actions.ui({do: 'consider', target});
    frames(1);
    assert.equal(h.vm().consider, null);
    assert.equal($('objective-level').textContent, objectiveWord(h.vm().objective));
    assert.equal($('objective').className, h.vm().objective.level);
  }
  // with the system's commitment (not the player's) there is no line and no consequence
  const sysGame = boot('?seed=7', {system: SYS, planview: PVW, scenario: DESK});
  sysGame.$('btn-take').click();
  sysGame.frames(2);
  sysGame.h.actions.ui({do: 'consider', target: 'guard-stop-coal1'});
  sysGame.frames(1);
  assert.equal(sysGame.h.vm().consider, null);
  assert.equal(sysGame.$('objective').hidden, true);
});

test('§21.4: in player mode an accepted start, stop, abortStop, battery or guard input is followed by the system\'s re-dispatch in the same call', () => {
  assert.deepEqual([...G.REDISPATCH_AFTER].sort(), [...FOLLOWER_REDISPATCH_AFTER].sort(), 'the game and the test player (tests/lib/follow.js) in step');
  assert.deepEqual([...G.REDISPATCH_AFTER].sort(), ['abortStop', 'battery', 'guard', 'start', 'stop']);
  const {$, h, system, frames} = boot('?seed=7', {commit: 'player'});
  $('btn-take').click();
  frames(3);
  const log = h.game.state.log;
  let n = system.log.redispatch;
  assert.equal(h.actions.input({type: 'guard', mw: 200}), '');
  assert.equal(system.log.redispatch, n + 1, 'a guard input re-dispatches');
  assert.deepEqual(log.slice(-2).map(r => r.type), ['guard', 'tie'], 'the system\'s input is logged right behind it (the stand-in\'s planLoad)');
  assert.equal(log.at(-1).tick, log.at(-2).tick, 'in the same call');
  n = system.log.redispatch;
  assert.equal(h.actions.input({type: 'battery', mode: 'charge', mw: 100}), '');
  assert.equal(h.actions.input({type: 'start', unit: 'gta1'}), '');
  assert.equal(system.log.redispatch, n + 2);
  // not after an input that commits nothing; not after a refused one
  n = system.log.redispatch;
  assert.equal(h.actions.input({type: 'tie', mw: 150}), '');
  assert.notEqual(h.actions.input({type: 'start', unit: 'coal1'}), '', 'refused: the unit is on');
  assert.equal(system.log.redispatch, n);
  // not while the levers are held by hand: the plan is the player's until RE-DISPATCH
  h.game.sys.edited = true;
  assert.equal(h.actions.input({type: 'guard', mw: 300}), '');
  assert.equal(system.log.redispatch, n);
  // and never when the commitment is the system's
  const b = boot('?seed=7');
  b.$('btn-take').click();
  b.frames(3);
  const n2 = b.system.log.redispatch;
  assert.equal(b.h.actions.input({type: 'guard', mw: 200}), '');
  assert.equal(b.system.log.redispatch, n2);
});

test('C-2 at boot: a seed that reads as a Saturday or Sunday plays desk-weekend; the briefing says the day\'s type and weekday or weekend', () => {
  assert.equal(G.scenarioForSeed(20261002).id, 'desk', 'a Friday');
  assert.equal(G.scenarioForSeed(20261003).id, 'desk-weekend', 'a Saturday');
  assert.equal(G.scenarioForSeed(20261004).id, 'desk-weekend', 'a Sunday');
  assert.equal(G.scenarioForSeed(7).id, 'desk', 'not a date');
  assert.equal(G.scenarioForSeed(20261332).id, 'desk', 'not a valid date');
  assert.match(readFileSync(join(ROOT, 'app/boot.js'), 'utf8'), /scenario: scenarioForSeed/, 'the real page passes the function');
  // dayText: plain words from the public obs.day only
  assert.equal(dayText({temp: 'HOT', weekend: false}), 'Today: a hot weekday. A heatwave warning, if one comes, comes mid-morning.');
  assert.equal(dayText({temp: 'MILD', weekend: false}), 'Today: a mild weekday. Rooftop solar will hollow out the middle of the day; the evening still climbs.');
  assert.match(dayText({temp: 'MILD', weekend: true}), /^Today: a mild weekend\. .* one coal unit has been off since Friday night\.$/);
  assert.match(dayText({temp: 'HOT', weekend: true}), /^Today: a hot weekend\. A heatwave warning, if one comes, comes mid-morning\. /);
  assert.equal(dayText(undefined), '');
  // a Sunday seed through the shell
  const w = boot('?seed=20261004', {scenario: G.scenarioForSeed});
  w.frames(2);
  assert.equal(w.h.game.scenario.id, 'desk-weekend');
  assert.deepEqual(w.h.game.state.day, {temp: 'MILD', weekend: true});
  assert.equal(w.h.game.state.units.find(u => u.id === 'coal4').mode, 'off', 'coal 4 off since Friday night');
  assert.equal(w.$('briefing-day').textContent, dayText({temp: 'MILD', weekend: true}));
  // a weekday seed, and a hot one
  const d = boot('?seed=7', {scenario: G.scenarioForSeed});
  d.frames(2);
  assert.equal(d.h.game.scenario.id, 'desk');
  assert.equal(d.$('briefing-day').textContent, 'Today: a hot weekday. A heatwave warning, if one comes, comes mid-morning.');
  // PLAY AGAIN asks the function again (the same seed: the same scenario)
  G.resetDay(w.h.game);
  assert.equal(w.h.game.scenario.id, 'desk-weekend');
});

test('the game shows the line through steady(): a line the player has not acted on is kept as it was said, not re-worded every half minute', () => {
  const {$, h, frames, key} = boot('?seed=7', {system: SYS, planview: PVW, scenario: DESK, commit: 'player'});
  $('btn-take').click();
  frames(2);
  const game = h.game;
  // run a quarter of an hour of the morning, reading the vm as the shell does
  const seen = [];
  for (let i = 0; i < 400; i++) {
    frames(1, 1 / 30);
    const o = h.vm().objective;
    if (o && (!seen.length || seen.at(-1).text !== o.text)) seen.push({s: game.state.env.s, text: o.text, action: o.action, level: o.level});
  }
  assert.ok(game.objectiveHeld && game.objectiveHeld.line === game.objective, 'vm.objective is the held line');
  const mins = Math.round((game.state.env.s - V.PLAYER_START_S) / 60);
  assert.ok(mins >= 20, mins + ' grid-min played');
  assert.ok(seen.length >= 1 && seen.length <= 2 + Math.ceil(mins / 15) * 2, 'a calm line: ' + seen.length + ' texts in ' + mins + ' grid-min:\n' + seen.map(x => x.text).join('\n'));
  for (const x of seen) assert.ok(x.text.length <= 170);
  // the GUARD line stood with its first figure while the preview's hundredths moved under it
  assert.match(seen[0].text, /^If your biggest unit tripped now, frequency would fall to 49\.\d\d Hz\. Raise the battery GUARD to \d+ MW/);
  assert.deepEqual(h.vm().objective.action, game.objectiveHeld.line.action);
});

test('render/format: the header\'s chips and the rate badge (mode and rate always shown, F-5)', async () => {
  const F = await import('../render/format.js');
  assert.equal(F.lightsText({servedMWh: 1000, lightsMWh: 0}), '100%');
  assert.equal(F.lightsText({servedMWh: 9996, lightsMWh: 4}), '99.9%', 'never rounded up to 100%');
  assert.equal(F.lightsText({servedMWh: 0, lightsMWh: 0}), '100%');
  assert.equal(F.centsText({servedMWh: 10, centsPerKWh: 8.44}), '8.4');
  assert.equal(F.centsText({servedMWh: 0, centsPerKWh: 0}), '-');
  assert.equal(F.co2Text({co2tPerMWh: 0.613}), '0.61');
  assert.equal(F.badgeText({mode: 'CRUISE', rate: 120, watchS: -1}), 'CRUISE 120×');
  assert.equal(F.badgeText({mode: 'FAST', rate: 360, watchS: -1}), 'FAST 360×');
  assert.equal(F.badgeText({mode: 'WATCH', rate: 0.15, watchS: 1.234}), 'WATCH T+1.23 s ×0.15');
  assert.equal(F.badgeText({mode: 'RESPOND-CARD', rate: 0, watchS: -1}), 'HELD 0× · Enter');
  assert.equal(F.badgeText({mode: 'RESPOND', rate: 30, watchS: -1}), 'RESPOND 30×');
  assert.equal(F.badgeText({mode: 'FOCUS', rate: 1, watchS: -1}), 'FOCUS 1×');
  assert.equal(F.badgeText({mode: 'PAUSE', rate: 0, watchS: -1}), 'PAUSE 0×');
  assert.equal(F.badgeText({mode: 'OVER', rate: 0, watchS: -1}), 'DAY OVER');
});

test('F-11 ?perf: percentiles over the window', () => {
  const p = PF.createPerf();
  for (let i = 1; i <= 100; i++) PF.perfFrame(p, {frameMs: i, simMs: i / 2, ticks: 100, draw: {desk: 1, map: 2}});
  const s = PF.perfStats(p);
  assert.equal(s.frameP50, 50);
  assert.equal(s.frameP95, 95);
  assert.equal(s.draw.map.p95, 2);
  assert.match(PF.perfLines(s).join('\n'), /frame ms p50 50\.00 · p95 95\.00/);
});

test('F-11 budget: frame p95 <= 8 ms, sim p95 <= 1 ms up to 150x and <= 3 ms above; each line says OK or OVER', () => {
  assert.equal(PF.BUDGET.frameP95Ms, 8);
  assert.equal(PF.BUDGET.simP95Ms, 1);
  assert.equal(PF.simBudgetMs(120), 1);
  assert.equal(PF.simBudgetMs(150), 1, 'at 150x the budget is still 1 ms');
  assert.equal(PF.simBudgetMs(360), 3);
  assert.equal(PF.simBudgetMs(2100), 3);
  const run = (frameMs, simMs, rate, draw) => {
    const p = PF.createPerf();
    for (let i = 0; i < 60; i++) PF.perfFrame(p, {frameMs, simMs, ticks: 100, rate, draw});
    const st = PF.perfStats(p);
    return {st, lines: PF.perfLines(st)};
  };
  let r = run(5, 0.6, 120, {map: 1.5, desk: 1, stack: 3});
  assert.deepEqual([r.st.over.frame, r.st.over.sim, r.st.budget.simMs], [false, false, 1]);
  assert.match(r.lines[0], /^frame ms p50 5\.00 · p95 5\.00 {2}OK \(budget 8 ms\)$/);
  assert.match(r.lines[1], /^sim ms p50 0\.60 · p95 0\.60 {2}OK \(budget 1 ms\) at ≤150×$/);
  assert.match(r.lines.find(l => l.startsWith('draw map')), /OK \(budget 2 ms\)$/);
  assert.match(r.lines.find(l => l.startsWith('draw stack')), /OK \(budget 4 ms\)$/);
  assert.ok(!/OK|OVER/.test(r.lines.find(l => l.startsWith('draw desk'))), 'no budget is named for the desk: unmarked');
  r = run(9, 2, 120, {map: 2.5});
  assert.deepEqual([r.st.over.frame, r.st.over.sim, r.st.over.draw.map], [true, true, true]);
  assert.match(r.lines[0], /OVER \(budget 8 ms\)$/);
  assert.match(r.lines[1], /OVER \(budget 1 ms\) at ≤150×$/);
  r = run(7, 2, 2100, {});
  assert.deepEqual([r.st.over.sim, r.st.budget.simMs, r.st.rateMax], [false, 3, 2100], '2 ms of sim is inside the 3-ms budget at 2,100x');
  assert.match(r.lines[1], /OK \(budget 3 ms\) at >150×$/);
  // A paused window (rate 0) is judged at the 1-ms budget; a frame without a rate counts as 0.
  const p = PF.createPerf();
  PF.perfFrame(p, {frameMs: 1, simMs: 0.1, ticks: 0, draw: {}});
  assert.equal(PF.perfStats(p).budget.simMs, 1);
});

test('F-11: the ?perf overlay shows the budget marks; ?debug exposes the boot handle as globalThis.gridwatch, and only then', () => {
  assert.equal('gridwatch' in globalThis, false);
  const plain = boot('?seed=7&perf');
  assert.equal('gridwatch' in globalThis, false, 'no ?debug: no global');
  plain.$('btn-take').click();
  plain.frames(45);
  assert.match(plain.$('perf').textContent, /frame ms p50 [\d.]+ · p95 [\d.]+ {2}(OK|OVER) \(budget 8 ms\)\nsim ms p50 [\d.]+ · p95 [\d.]+ {2}(OK|OVER) \(budget 1 ms\) at ≤150×/);
  try {
    const dbg = boot('?seed=7&debug');
    assert.equal(globalThis.gridwatch, dbg.h, 'the handle bootGame returned');
    assert.equal(typeof globalThis.gridwatch.frame, 'function');
    assert.equal(dbg.$('perf').hidden, true, '?debug alone shows no overlay');
  } finally {
    delete globalThis.gridwatch;
  }
});

test('§13.1 / §13.2 in the vm: settings in the contract shape, settingsOpen, cues', () => {
  const {h, frames} = boot('?seed=7');
  frames(1);
  const vm = h.vm();
  assert.deepEqual(Object.keys(vm.settings).sort(), ['alarms', 'crt', 'fx', 'hum', 'muted', 'reducedEffects', 'reducedMotion', 'volume']);
  assert.equal(vm.settingsOpen, false);
  assert.ok(Array.isArray(vm.cues));
  for (const t of vm.alarms.tiles) assert.deepEqual(Object.keys(t).sort(), ['basePrio', 'escalated', 'flash', 'glyph', 'id', 'label', 'prio', 'state', 'target']);
  assert.equal(h.actions.ui({do: 'cue', name: 'button'}), '');
  frames(1);
  assert.deepEqual(h.vm().cues, ['button'], 'a desk gesture\'s cue reaches the frame\'s vm (B-6)');
});

// ------------------------------------------------------------------ the live region (K-23, §13.3)

test('K-23 live region (model): mode, frequency band, N-1 word, a new alarm, a tray warning; one message per 2 real s, newest alarm wins', () => {
  const tiles = over => ['underFreq', 'n1', 'ufls'].map(id => Object.assign({id, label: id.toUpperCase(), prio: 'P2', escalated: false, state: 'normal'}, over && over[id]));
  const mk = (o = {}) => ({obs: {tick: o.tick || 100, f: {hz: o.hz === undefined ? 50 : o.hz}, sec: {level: o.level || 'SECURE'}},
    mode: {mode: o.mode || 'CRUISE', rate: o.mode === 'PAUSE' ? 0 : 120, watchS: -1}, alarms: {tiles: tiles(o.tiles)}, tray: {cards: o.cards || []}});
  const L = createLive();
  assert.equal(liveFrame(L, mk(), 0), null, 'the first frame only takes note');
  assert.equal(liveFrame(L, mk(), 5000), null, 'nothing changed: nothing said');
  assert.equal(liveFrame(L, mk({mode: 'PAUSE'}), 6000), 'PAUSE 0×');
  assert.equal(liveFrame(L, mk({mode: 'CRUISE'}), 6500), null, 'at most one message per ' + LIVE_GAP_MS + ' ms');
  assert.equal(liveFrame(L, mk(), 8000), 'CRUISE 120×', 'the rest waits its turn');
  // The frequency band: normal / outside normal / outside containment (K-11's bands).
  assert.equal(bandOf(50), 'normal');
  assert.equal(bandOf(49.84), 'outside');
  assert.equal(bandOf(50.16), 'outside');
  assert.equal(bandOf(49.49), 'containment');
  assert.equal(bandOf(50.51), 'containment');
  assert.equal(liveFrame(L, mk({hz: 49.8}), 11000), 'Frequency outside the normal band, 49.80 Hz');
  assert.equal(liveFrame(L, mk({hz: 49.4}), 14000), 'Frequency outside the containment band, 49.40 Hz');
  assert.equal(liveFrame(L, mk({hz: 49.8}), 14100), null);
  assert.equal(liveFrame(L, mk({hz: 49.4}), 14200), null);
  assert.equal(liveFrame(L, mk({hz: 49.4}), 17000), null, 'a band that flapped back to what was said has nothing to say');
  assert.equal(liveFrame(L, mk({hz: 50}), 20000), 'Frequency back in the normal band, 50.00 Hz');
  assert.equal(liveFrame(L, mk({level: 'TIGHT'}), 23000), 'N-1 TIGHT');
  // Alarms: the newest wins the alarm slot, and an alarm is said before anything else waiting.
  const t0 = 30000;
  assert.equal(liveFrame(L, mk({level: 'TIGHT', tiles: {n1: {state: 'alarm'}}}), t0), 'Alarm: N1, P2');
  assert.equal(liveFrame(L, mk({level: 'SHORT', mode: 'FAST', tiles: {n1: {state: 'alarm'}, underFreq: {state: 'alarm'}}}), t0 + 100), null);
  assert.equal(liveFrame(L, mk({level: 'SHORT', mode: 'FAST', tiles: {n1: {state: 'alarm'}, underFreq: {state: 'alarm'}, ufls: {state: 'alarm', prio: 'P1'}}}), t0 + 200), null);
  const now = {level: 'SHORT', mode: 'FAST', tiles: {n1: {state: 'ackd'}, underFreq: {state: 'alarm'}, ufls: {state: 'alarm', prio: 'P1'}}};
  assert.equal(liveFrame(L, mk(now), t0 + 2000), 'Alarm: UFLS, P1', 'the newest alarm, not the one before it');
  assert.equal(liveFrame(L, mk(now), t0 + 4000), 'N-1 SHORT');
  assert.equal(liveFrame(L, mk(now), t0 + 6000), 'FAST 120×');
  assert.equal(liveFrame(L, mk(now), t0 + 8000), null);
  // Escalation (B-1) is announced; ACK and clearing are not alarms.
  now.tiles.underFreq = {state: 'alarm', prio: 'P1', escalated: true};
  assert.equal(liveFrame(L, mk(now), t0 + 10000), 'Alarm escalated: UNDERFREQ, P1');
  now.tiles.underFreq = {state: 'cleared'};
  now.tiles.ufls = {state: 'ackd', prio: 'P1'};
  assert.equal(liveFrame(L, mk(now), t0 + 13000), null);
  // The tray: warnings only, once each.
  const cards = [{id: 'card1', sev: 'info', from: 'STATION', text: 'GT·A at full speed.'}, {id: 'card2', sev: 'warn', from: 'WEATHER BUREAU', text: 'Storm from 15:00.'}];
  assert.equal(liveFrame(L, mk(Object.assign({}, now, {cards})), t0 + 16000), 'WEATHER BUREAU: Storm from 15:00.');
  assert.equal(liveFrame(L, mk(Object.assign({}, now, {cards})), t0 + 19000), null);
  // A new day on the same page (the tick goes back): take note again, say nothing.
  assert.equal(liveFrame(L, mk({tick: 1, mode: 'PAUSE', cards: [{id: 'card1', sev: 'warn', from: 'X', text: 'y'}]}), t0 + 30000), null);
  assert.equal(liveFrame(L, mk({tick: 2, mode: 'CRUISE'}), t0 + 33000), 'CRUISE 120×');
});

test('K-23 live region (shell): #aria-live is a polite status region that mirrors the mode and a new alarm', () => {
  const {$, h, frames, key, advance} = boot('?seed=7');
  assert.equal($('aria-live').getAttribute('aria-live'), 'polite');
  assert.equal($('aria-live').getAttribute('role'), 'status');
  assert.equal(h.live.primed, false);
  frames(1);
  $('btn-take').click();
  frames(2);
  advance(2500);
  frames(1);
  assert.equal($('aria-live').textContent, 'CRUISE 120×', 'the mode change after the briefing');
  key(' ');
  frames(1);
  assert.equal($('aria-live').textContent, 'CRUISE 120×', 'inside 2 real s: not yet');
  advance(2500);
  frames(1);
  assert.equal($('aria-live').textContent, 'PAUSE 0×');
  key(' ');
  // A new alarm's label (test poke: storage low).
  h.game.state.hydro.storageMWh = 0.2 * V.HYDRO_ALLOCATION_MWH;
  advance(2500);
  frames(2);
  assert.equal($('aria-live').textContent, 'Alarm: STORAGE LOW, P2');
  // The header's own controls say what they are and which key reaches them.
  for (const [id, keys] of [['btn-pause', 'Space'], ['btn-mute', 'Shift+M'], ['btn-settings', ','], ['btn-help', '?']]) {
    assert.equal($(id).getAttribute('aria-keyshortcuts'), keys, '#' + id);
  }
  assert.equal($('stopwatch').getAttribute('aria-hidden'), 'true', 'the stopwatch changes every frame: not for a live region');
  assert.equal($('rate-badge').getAttribute('role'), null, 'the badge is mirrored by #aria-live, not announced every frame');
});

test('app/boot.js boots next.html with the real stage B modules', async () => {
  for (const f of ['desk/desk.js', 'render/livestack.js', 'render/map.js', 'app/system.js', 'app/planview.js']) {
    assert.ok(existsSync(join(ROOT, f)), f + ' is not merged yet');
  }
  const doc = makeDocument(NEXT);
  let raf = null;
  const restore = installGlobals({document: doc, location: {search: '?seed=7'}, requestAnimationFrame: cb => { raf = cb; return 1; },
    devicePixelRatio: 1, localStorage: null});
  try {
    const mod = await import(pathToFileURL(join(ROOT, 'app/boot.js')).href);
    assert.ok(mod.handle && mod.handle.game);
    let t = 0;
    for (let i = 0; i < 5; i++) { t += 16.7; const cb = raf; raf = null; cb(t); }
    assert.deepEqual(doc.canvasStats.bad, []);
    assert.ok(doc.getElementById('stack-slot'), 'the desk made #stack-slot');
    // Every game anchor of H-14 is on the page once the desk, stack and map are mounted.
    const {TEXT} = await import('../content/text.js');
    for (const e of TEXT.abstractions) if (e.game !== 'drawer') assert.ok(doc.getElementById(e.game), '#' + e.game);
  } finally {
    restore();
  }
});

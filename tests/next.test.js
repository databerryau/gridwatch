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
import {CLASSIC} from '../content/scenarios.js';
import {makeDocument, installGlobals} from './lib/dom.js';
import {injectTrip} from './lib/sim-helpers.js';
import * as G from '../app/game.js';
import * as W from '../app/watch.js';
import * as K from '../app/keys.js';
import * as PF from '../app/perf.js';
import * as D from '../app/director.js';
import {bootGame, layoutSizes} from '../app/shell.js';
import {traceOf} from '../app/record.js';
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
    'watch-vignette', 'stopwatch', 'end-card', 'drawer', 'perf', 'stack-overlay', 'briefing-card']) assert.ok(ids.includes(id), '#' + id);
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
  'respond', 'glow', 'hist', 'settings'];

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
  assert.deepEqual(Object.keys(vm.hist.stations), [...V.STATION_IDS]);
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
  const qs = $('q-layer').querySelectorAll('button');
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

test('app/boot.js boots next.html with the real stage B modules', {todo: 'needs stage B merge (desk/desk.js, render/livestack.js, render/map.js, app/system.js, app/planview.js)'}, async () => {
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

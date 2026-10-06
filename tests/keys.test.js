// K-23 key routing (desk/README.md §13.3): the shell's one document listener. Order: (1) text
// fields, consumed keys and browser shortcuts are left alone; (2) the desk's key(ev); (3) the
// Live Stack's and the map's; (4) the app/keys.js fallback. The same key never acts twice, and
// the D / E holds are the desk's while a desk with key() is mounted. First with stand-in
// modules (the order itself), then with the real desk (no double action).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import {makeDocument, installGlobals} from './lib/dom.js';
import * as K from '../app/keys.js';
import {bootGame} from '../app/shell.js';
import {createDesk} from '../desk/desk.js';
import * as system from '../app/system.js';
import * as planview from '../app/planview.js';
import * as fleet from '../sim/fleet.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const TPS = V.TICKS_PER_S;

/** Stand-in modules whose key(ev) logs the call and takes the keys listed in `takes[name]`. */
function standIns(takes, opts = {}) {
  const calls = [];
  const mk = name => (doc, root) => {
    const el = doc.createElement('div');
    el.id = name + '-el';
    root.appendChild(el);
    if (name === 'desk') for (const id of ['lever-coal', 'lever-ccgt', 'stack-slot']) { const e = doc.createElement('div'); e.id = id; e.tabIndex = 0; root.appendChild(e); }
    const mod = {el, update() {}};
    if (!(opts.noKey || []).includes(name)) {
      mod.key = ev => {
        calls.push(name + ':' + ev.type + ':' + ev.key);
        if ((opts.throws || []).includes(name)) throw new Error(name + ' broke');
        const t = (takes[name] || []).includes(ev.key);
        if (t && opts.onTake) opts.onTake(name, ev, doc);
        return t ? true : opts.truthy ? 1 : false;
      };
    }
    return mod;
  };
  return {calls, createDesk: mk('desk'), createLiveStack: mk('stack'), createMap: mk('map')};
}

function boot(deps, query = '?seed=7') {
  const doc = makeDocument(NEXT);
  let t = 1000;
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: () => 'blob:x', revokeObjectURL() {}}), Blob: class {}});
  const h = bootGame(doc, Object.assign({search: query, storage: null, audioWin: {}, raf: false, now: () => t, matchMedia: null}, deps));
  restore();
  const $ = id => doc.getElementById(id);
  const frames = (n, dtS = 1 / 60) => { for (let i = 0; i < n; i++) { t += dtS * 1000; h.frame(dtS); } };
  const key = (k, extra) => doc.dispatch('keydown', Object.assign({key: k}, extra));
  const keyUp = (k, extra) => doc.dispatch('keyup', Object.assign({key: k}, extra));
  $('btn-take').click();
  frames(2);
  return {doc, $, h, frames, key, keyUp, logOf: type => h.game.state.log.filter(r => r.type === type).length};
}

test('§13.3 order: the desk first, then the stack, then the map, then the fallback; the first to take a key stops it', () => {
  const m = standIns({desk: ['g'], stack: ['k'], map: ['ArrowRight', 't']});
  const {h, frames, key, keyUp} = boot(m);
  // The desk takes G: nobody else hears it.
  let ev = key('g');
  assert.deepEqual(m.calls.splice(0), ['desk:keydown:g']);
  assert.equal(ev.defaultPrevented, true, 'a key a module used is preventDefault-ed');
  // The stack takes K after the desk declined.
  ev = key('k');
  assert.deepEqual(m.calls.splice(0), ['desk:keydown:k', 'stack:keydown:k']);
  assert.equal(ev.defaultPrevented, true);
  // The map is last in the chain. T is also a fallback key (TRIP PREVIEW): the map took it, so it does NOT toggle.
  key('ArrowRight');
  assert.deepEqual(m.calls.splice(0), ['desk:keydown:ArrowRight', 'stack:keydown:ArrowRight', 'map:keydown:ArrowRight']);
  key('t');
  frames(1);
  assert.equal(h.vm().previewOn, false, 'the same key never acts twice');
  m.calls.splice(0);
  // Nobody takes A: the fallback acts (ACK), once, and prevents the default.
  h.game.alarms.tiles.storageLow.state = 'alarm';
  ev = key('a');
  assert.deepEqual(m.calls.splice(0), ['desk:keydown:a', 'stack:keydown:a', 'map:keydown:a']);
  assert.equal(ev.defaultPrevented, true);
  assert.notEqual(h.game.alarms.tiles.storageLow.state, 'alarm', 'A acknowledged');
  // A key nobody wants is left to the browser.
  ev = key('z');
  assert.equal(ev.defaultPrevented, false);
  m.calls.splice(0);
  // keyup runs the same chain (holds end on it), then the fallback (F up ends FAST).
  key('f');
  frames(1);
  assert.equal(h.vm().mode.mode, 'FAST');
  m.calls.splice(0);
  keyUp('f');
  assert.deepEqual(m.calls.splice(0), ['desk:keyup:f', 'stack:keyup:f', 'map:keyup:f']);
  frames(1);
  assert.equal(h.vm().mode.mode, 'CRUISE');
  keyUp('g');
  assert.deepEqual(m.calls.splice(0), ['desk:keyup:g'], 'a keyup the desk takes stops there too');
});

test('§13.3 step 1: consumed keys, text fields and browser shortcuts reach no module and no fallback', () => {
  const m = standIns({desk: ['c', '1']});
  const {doc, h, frames, key} = boot(m);
  doc.dispatch('keydown', {key: 'c', defaultPrevented: true});
  assert.deepEqual(m.calls, [], 'a focused control already used it');
  // Ctrl+C is the browser's copy, never CLOSE THE BREAKER; the same for Meta and Alt.
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
    const ev = key('c', {[mod]: true});
    assert.equal(ev.defaultPrevented, false);
  }
  assert.deepEqual(m.calls, []);
  for (const [tag, type] of [['input', 'text'], ['input', 'number'], ['textarea', ''], ['select', '']]) {
    const field = doc.createElement(tag);
    field.type = type;
    doc.body.appendChild(field);
    field.focus();
    key('1'); key(' '); key('c');
    frames(1);
    assert.deepEqual(m.calls, [], tag + ' ' + type);
    assert.match(h.vm().mode.mode, /CRUISE/, 'typing a space does not pause');
    field.remove();
  }
  assert.equal(K.typing({tagName: 'INPUT', type: 'range'}), false, 'a slider is not a text field');
  assert.equal(K.typing({tagName: 'DIV', isContentEditable: true}), true);
  // Shift is not a browser shortcut: Shift+A still reaches the chain and the fallback (SILENCE).
  doc.body.focus();
  doc.activeElement = doc.body;
  key('A', {shiftKey: true});
  assert.deepEqual(m.calls, ['desk:keydown:A', 'stack:keydown:A', 'map:keydown:A']);
});

test('§13.3: modules without key() are skipped; only `true` takes a key; a module that throws lets the key fall through', () => {
  // No key() anywhere: the 1a behaviour, the fallback does everything.
  const none = standIns({}, {noKey: ['desk', 'stack', 'map']});
  const a = boot(none);
  a.key('t');
  a.frames(1);
  assert.equal(a.h.vm().previewOn, true);
  assert.equal(a.h.keys.deskHolds, false, 'no desk key(): the fallback keeps the D / E holds');
  // A truthy non-true return is not "handled" (§14.2: key(ev) returns true exactly when it acted).
  const loose = standIns({}, {truthy: true});
  const b = boot(loose);
  b.key('t');
  b.frames(1);
  assert.equal(b.h.vm().previewOn, true);
  assert.deepEqual(loose.calls, ['desk:keydown:t', 'stack:keydown:t', 'map:keydown:t']);
  // A broken module must not swallow the keyboard.
  const broken = standIns({stack: ['t']}, {throws: ['desk']});
  const c = boot(broken);
  c.key('t');
  c.frames(1);
  assert.deepEqual(broken.calls, ['desk:keydown:t', 'stack:keydown:t'], 'the stack still got it');
  assert.equal(c.h.vm().previewOn, false);
  assert.ok(c.h.mods.errors.some(e => /key: desk broke/.test(e)));
});

test('§13.3: D and E holds are the desk\'s when a desk with key() is mounted; `,` opens settings; Enter on the briefing stops there', () => {
  const m = standIns({});
  const {h, frames, key, keyUp, logOf, $} = boot(m);
  assert.equal(h.keys.deskHolds, true);
  // The desk declined D and E (say it is locked): the fallback must not fire them behind its back.
  key('d'); key('e');
  frames(60, 1 / 60);
  assert.equal(logOf('callDR') + logOf('armRERT'), 0, 'no hold fired from app/keys.js');
  keyUp('d'); keyUp('e');
  assert.ok(m.calls.includes('desk:keyup:d') && m.calls.includes('desk:keyup:e'), 'the desk hears the release');
  // Without a desk key(): the fallback holds work as in 1a.
  const bare = boot(standIns({}, {noKey: ['desk']}));
  bare.key('d');
  bare.frames(30, 1 / 60);
  assert.equal(bare.logOf('callDR'), 0, 'not before 0.6 s');
  bare.frames(10, 1 / 60);
  assert.equal(bare.logOf('callDR'), 1);
  bare.frames(60, 1 / 60);
  assert.equal(bare.logOf('callDR'), 1, 'once');
  // `,` (B-7).
  key(',');
  frames(1);
  assert.equal($('settings').hidden, false);
  assert.equal(h.vm().settingsOpen, true);
  key('Escape');
  frames(1);
  assert.equal(h.vm().settingsOpen, false);
  // Enter on the briefing card takes the desk and goes no further.
  const doc = makeDocument(NEXT);
  const s2 = standIns({desk: ['Enter']});
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: () => 'blob:x', revokeObjectURL() {}}), Blob: class {}});
  const h2 = bootGame(doc, Object.assign({search: '?seed=7', storage: null, audioWin: {}, raf: false, now: () => 0, matchMedia: null}, s2));
  restore();
  h2.frame(1 / 60);
  const ev = doc.dispatch('keydown', {key: 'Enter'});
  assert.equal(h2.game.phase, 'play');
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(s2.calls, [], 'the briefing\'s Enter is the shell\'s');
});

test('§13.3: after a module moves the keyboard focus, vm.focus follows it', () => {
  const m = standIns({desk: ['2']}, {onTake: (name, ev, doc) => doc.getElementById('lever-ccgt').focus()});
  const {h, frames, key, $, doc} = boot(m);
  h.actions.ui({do: 'focus', target: 'lever-coal'});
  frames(1);
  assert.equal(h.vm().focus, 'lever-coal');
  key('2');
  frames(1);
  assert.equal(doc.activeElement, $('lever-ccgt'));
  assert.equal(h.vm().focus, 'lever-ccgt', 'so the fallback never moves the lever that lost focus');
});

// ------------------------------------------------------------------ the real desk

function bootReal(seed = 7) {
  const g = boot({createDesk, system, planview}, '?seed=' + seed);
  // Past 04:30 with the plan loaded; frames of 0.1 real s.
  g.frames(20, 0.1);
  return g;
}

test('the real desk: 1-8 focus through desk.key and vm.focus follows; an arrow on the focused lever moves it exactly once', () => {
  const {doc, $, h, frames, key, keyUp, logOf} = bootReal();
  assert.equal(typeof h.mods.desk.key, 'function');
  assert.equal(h.keys.deskHolds, true);
  for (const [k, id] of [['1', 'lever-coal'], ['3', 'lever-gta'], ['6', 'wheel-hydro'], ['7', 'dial-battery'], ['8', 'knob-tie'], ['2', 'lever-ccgt']]) {
    const ev = key(k);
    assert.equal(ev.defaultPrevented, true, k);
    frames(1);
    assert.equal(doc.activeElement, $(id), k + ' focuses #' + id);
    assert.equal(h.vm().focus, id, 'vm.focus follows ' + k);
  }
  // A running lever with room above it. ArrowUp: the lever's own handler takes it
  // (preventDefault) and the fallback, which also knows ↑ for the focused lever, must stay
  // out: one basePoint, +10 MW.
  const levers = ['coal', 'ccgt', 'gta', 'gtb', 'gtc'];
  const sid = levers.find(id => { const s = h.vm().obs.stations.find(x => x.id === id); return s.onCount > 0 && s.basePointMW + 20 <= s.maxMW; });
  assert.ok(sid, 'a running lever with headroom');
  const st = () => h.vm().obs.stations.find(s => s.id === sid);
  key(String(levers.indexOf(sid) + 1));
  frames(1);
  assert.equal(h.vm().focus, 'lever-' + sid);
  const n = logOf('basePoint'), was = st().basePointMW;
  const ev = key('ArrowUp');
  keyUp('ArrowUp');
  frames(1);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(logOf('basePoint'), n + 1, 'exactly one input for one key press');
  assert.ok(Math.abs(st().basePointMW - (was + 10)) <= 1, 'moved 10 MW, not 20: ' + was + ' -> ' + st().basePointMW);
  assert.deepEqual(h.mods.errors, []);
});

test('the real desk: S S starts one machine once; D and E holds act once (the fallback never repeats them)', () => {
  const {h, frames, key, keyUp, logOf} = bootReal();
  // GT·A at 04:30 is off and startable on the classic day.
  key('3');
  frames(1);
  const off = h.vm().obs.units.filter(u => u.station === 'gta' && u.mode === 'off' && u.startBlock === '');
  assert.ok(off.length > 0, 'a GT·A machine to start');
  const n = logOf('start');
  key('s'); keyUp('s');
  frames(2, 0.05);
  assert.equal(logOf('start'), n, 'one S only lifts the guard (K-3)');
  key('s'); keyUp('s');
  frames(2, 0.05);
  assert.equal(logOf('start'), n + 1, 'S S: exactly one start');
  key('s'); keyUp('s'); key('s'); keyUp('s');
  frames(2, 0.05);
  assert.ok(logOf('start') <= n + 2, 'a second S S is at most one more start');
  // D held 0.6 s: industrial DR, once. Released early: nothing.
  const dr = logOf('callDR');
  key('d');
  frames(3, 0.1);
  keyUp('d');
  frames(10, 0.1);
  assert.equal(logOf('callDR'), dr, 'a tap never calls DR');
  key('d');
  frames(3, 0.1);
  key('d', {repeat: true});
  frames(6, 0.1);
  keyUp('d');
  frames(10, 0.1);
  assert.equal(logOf('callDR'), dr + 1, 'held: exactly one call, not one from the desk and one from the key map');
  // E held: the reserve diesel key, once.
  const rert = logOf('armRERT');
  key('e');
  frames(10, 0.1);
  keyUp('e');
  frames(10, 0.1);
  assert.equal(logOf('armRERT'), rert + 1);
  assert.deepEqual(h.mods.errors, []);
  assert.ok(h.game.state.tick > V.PLAYER_START_TICK + TPS);
});

// ---- Q-41: every press answers; help is blue, red is only the grid's refusal
/** The visible note a host carries itself (not one of its children's). */
const noteOf = host => host.children.find(c => c.classList && c.classList.contains('dk-note') && !c.hidden);
const visibleNotes = doc => doc.querySelectorAll('.dk-note').filter(n => !n.hidden && n.textContent);

test('Q-41 the watch: every desk key and button answers with the blue lock note; nothing is sent, nothing falls through', () => {
  const {doc, $, h, frames, key, keyUp} = bootReal();
  const st = h.game.state;
  const big = st.units.reduce((b, u, i) => (u.sync && (b < 0 || u.outMW > st.units[b].outMW) ? i : b), -1);
  fleet.tripUnit(st, big, 'test trip', V.HOT_TRIP_LOCKOUT_S, []);
  frames(2);
  assert.equal(h.vm().mode.locked, true, 'the watch');
  assert.equal(h.vm().mode.canSkip, false, 'a first-time player\'s first watch plays through');
  const LOCK = 'desk locked while the grid catches itself: watch this one';
  const n0 = st.log.length;
  const bay = $('bay-sync').parentElement.parentElement, keys = $('btn-redispatch').parentElement, emerg = $('key-rert').parentElement;
  const tap = k => () => { key(k); keyUp(k); };
  function answers(what, host, act) {
    for (const n of doc.querySelectorAll('.dk-note')) n.textContent = '';
    act();
    const n = noteOf(host);
    assert.equal(n && n.textContent, LOCK, what);
    assert.ok(n.classList.contains('info'), what + ': blue, help (Q-41)');
  }
  answers('N', keys, tap('n'));
  answers('RE-DISPATCH', keys, () => $('btn-redispatch').click());
  answers('the AGC/HAND key', keys, () => $('key-agc').click());
  for (const k of ['o', '[', ']', 'c', 'u', 'b', 'r']) answers(k.toUpperCase(), bay, tap(k));
  answers('+ ]', bay, () => $('sync-raise').click());
  answers('D', $('btn-dr'), tap('d'));
  answers('E', $('key-rert'), tap('e'));
  answers('K', $('key-shed').hidden ? emerg : $('key-shed'), tap('k'));
  key('1');
  answers('S on a lever', $('lever-coal').closest('.dk-lever-slot'), tap('s'));
  frames(1);
  assert.equal(st.log.length, n0, 'nothing reached the sim');
  assert.equal($('toast').hidden, true, 'and no fallback refusal toast');
  assert.deepEqual(visibleNotes(doc).filter(n => !n.classList.contains('info')).map(n => n.textContent), [], 'no red');
  assert.deepEqual(h.mods.errors, []);
});

test('Q-41 help is blue: no scope, no unit, B in AGC, K with DIRECT SHED hidden, a short DR press, DR on', () => {
  const {doc, $, h, frames, key, keyUp} = bootReal();
  const bay = $('bay-sync').parentElement.parentElement, emerg = $('key-rert').parentElement;
  const said = (host, act) => {
    for (const n of doc.querySelectorAll('.dk-note')) n.textContent = '';
    act();
    const n = noteOf(host);
    assert.ok(n && n.classList.contains('info'), (n ? n.textContent : 'no note') + ': blue');
    return n.textContent;
  };
  const tap = k => () => { key(k); keyUp(k); };
  assert.equal(h.vm().obs.units.filter(u => u.mode === 'ready').length, 0, '04:32: no unit at full speed');
  const NO_UNIT = 'no unit at full speed: START one on the lever bank';
  assert.equal(said(bay, () => $('sync-raise').click()), NO_UNIT);
  assert.equal(said(bay, tap('c')), NO_UNIT);
  assert.equal(said(bay, tap('o')), NO_UNIT);
  assert.equal(said(bay, () => $('sync-exit').click()), 'no scope open');
  assert.equal(said(bay, tap('b')), 'BYPASS is HAND only: trim with [ ], or U for AUTO');
  assert.equal($('key-shed').hidden, true);
  assert.equal(said(emerg, tap('k')), 'DIRECT SHED appears when N-1 reads SHORT or SHEDDING');
  const dr = $('btn-dr');
  assert.equal(said(dr, () => { dr.dispatch('pointerdown'); dr.dispatch('pointerup'); }), 'hold 0.6 s to commit, or hold D');
  key('d'); frames(7, 0.1); keyUp('d'); frames(1);
  assert.ok(h.vm().obs.dr.activeS > 0, 'D held: DR on');
  assert.match(said(dr, () => { dr.dispatch('pointerdown'); dr.dispatch('pointerup'); }), /^DR is on: \d+:\d\d left$/);
  assert.deepEqual(visibleNotes(doc).filter(n => !n.classList.contains('info')).map(n => n.textContent), [], 'no red');
});

test('Q-41 true words: the press after S S names the unit running up; spent DR with the diesel armed gives no E hint; the day over is not a watch', () => {
  const {doc, $, h, frames, key, keyUp} = bootReal();
  const st = h.game.state;
  const bay = $('bay-sync').parentElement.parentElement, keys = $('btn-redispatch').parentElement, dr = $('btn-dr');
  const said = (host, act) => {
    for (const n of doc.querySelectorAll('.dk-note')) n.textContent = '';
    act();
    const n = noteOf(host);
    assert.ok(n && n.classList.contains('info'), (n ? n.textContent : 'no note') + ': blue');
    return n.textContent;
  };
  const tap = k => () => { key(k); keyUp(k); };
  // S S on GT·A: it runs up. [ ] O C are the presses a player reaches for next: they name it, not "START one".
  key('3'); frames(1);
  key('s'); keyUp('s'); frames(2, 0.05); key('s'); keyUp('s'); frames(2, 0.05);
  assert.ok(h.vm().obs.units.some(u => u.mode === 'starting'), 'S S: a machine runs up');
  assert.equal(h.vm().obs.units.filter(u => u.mode === 'ready').length, 0);
  for (const [what, act] of [[']', tap(']')], ['O', tap('o')], ['C', tap('c')], ['[ −', () => $('sync-lower').click()]]) {
    assert.match(said(bay, act), /^GT·A( \d)? runs up: full speed in \d+:\d\d, then O$/, what);
  }
  // No DR calls left: the diesel hint only while the diesel is not armed (armed, holding E stands it down).
  st.dr.callsLeft = 0;
  frames(1);
  const press = () => { dr.dispatch('pointerdown'); dr.dispatch('pointerup'); };
  assert.equal(said(dr, press), 'no DR calls left today: try reserve diesel (E)');
  key('e'); frames(10, 0.1); keyUp('e'); frames(2, 0.1);
  assert.equal(h.vm().obs.rert.armed, true, 'E held: the diesel armed');
  assert.equal(said(dr, press), 'no DR calls left today');
  // The day over: locked, but no watch. Every press says so, in blue, and nothing reaches the sim.
  st.over = true;
  frames(2);
  assert.equal(h.vm().mode.locked, false, 'no watch');
  const OVER = 'the day is over: PLAY THIS DAY AGAIN is on the card';
  const n0 = st.log.length;
  assert.equal(said(keys, tap('n')), OVER, 'N');
  for (const k of ['o', ']', 'c', 'b', 'r']) assert.equal(said(bay, tap(k)), OVER, k.toUpperCase());
  assert.equal(said(dr, tap('d')), OVER, 'D');
  assert.equal(said($('key-rert'), tap('e')), OVER, 'E');
  assert.equal(said(keys, () => $('key-agc').click()), OVER, 'the AGC/HAND key');
  key('1');
  assert.equal(said($('lever-coal').closest('.dk-lever-slot'), tap('s')), OVER, 'S on a lever');
  frames(1);
  assert.equal(st.log.length, n0, 'nothing reached the sim');
  assert.ok(!doc.querySelectorAll('.dk-note').some(n => !n.hidden && /watch/.test(n.textContent)), 'no watch words');
  assert.deepEqual(h.mods.errors, []);
});

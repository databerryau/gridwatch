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

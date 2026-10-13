// D-1's accept (desk/README.md §32.8.2, §32.2: the suburb card is part of the map): "no screen between the
// briefing and the verdict accepts dispatch input except the desk and the map". Every control that sends a
// sim input lives under the desk (the Live Stack is in it, or over the map while expanded), the map or the
// suburb card; the briefing sends only `mode` inputs (the card's AGC/HAND, the desk's AGC key, Q-64).
//
// Two halves. The source: the modules of next.html (its first visit and the on-demand ones, found from its
// import() calls) that call actions.input( or actions.redispatch( are exactly the desk's, the stack's, the
// suburb card's and the shell's, and the shell's are the briefing's mode and the keys' runner (which carries
// a desk control's key). The page, headless (tests/lib/play.js), sampled: the briefing and then the quiet desk at 04:30,
// every visible control clicked twice (a guard's lift and its confirm), the sends seen at the page's
// actions and each laid at the control that made it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openGame} from './lib/play.js';
import {tokenize} from './lib/js-tokens.js';
import {firstVisit, moduleClosure} from '../tools/perf.mjs';
import * as G from '../app/game.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The page's on-demand modules, from its code: every import('…') reached from `first` (repo paths), and what each brings statically. */
function onDemand(first) {
  const seen = new Set(first), out = [], queue = [...first];
  while (queue.length) {
    const f = queue.shift(), t = tokenize(readFileSync(ROOT + f, 'utf8'));
    for (let k = 0; k + 2 < t.length; k++) {
      if (t[k].text !== 'import' || t[k + 1].text !== '(' || t[k + 2].type !== 'str') continue;
      const m = posix.join(posix.dirname(f), t[k + 2].text.slice(1, -1));
      for (const g of [m, ...moduleClosure(m).map(x => x.path)]) if (!seen.has(g)) { seen.add(g); out.push(g); queue.push(g); }
    }
  }
  return out;
}
// The regions D-1 allows, by the root each module is mounted on (app/shell.js bootGame).
const REGIONS = ['desk', 'stack-overlay', 'map', 'suburb-card'];

/** Each call `actions.input(` / `actions.redispatch(` in a source: {line, what, arg: its first four tokens, to the call's ')'}. */
function sendsIn(src) {
  const t = tokenize(src), out = [];
  for (let k = 0; k + 3 < t.length; k++) {
    if (t[k].text === 'actions' && t[k + 1].text === '.' && /^(input|redispatch)$/.test(t[k + 2].text) && t[k + 3].text === '(') {
      const a = t.slice(k + 4, k + 8), end = a.findIndex(x => x.text === ')');
      out.push({line: t[k].line, what: t[k + 2].text, arg: (end < 0 ? a : a.slice(0, end + 1)).map(x => x.text).join(' ')});
    }
  }
  return out;
}

test('D-1, the source: only the desk, the stack, the suburb card and the shell call the page\'s actions; the shell sends the briefing\'s mode and the keys\' inputs', () => {
  const first = firstVisit('next.html').map(f => f.path).filter(p => p.endsWith('.js')), later = onDemand(first), files = [...first, ...later];
  // (the on-demand list is the page's own, so a module 2d or 2e loads later is audited too)
  for (const m of ['app/endcard.js', 'app/suburbcard.js', 'content/text.js']) assert.ok(later.includes(m), m + ' is found on demand: ' + later);
  const by = {}, views = /^(desk|render|audio|content)\/|^app\/(shell|boot|keys|suburbcard|alarmpanel|endcard|watch|tray)\.js$/;
  for (const f of files) {
    const src = readFileSync(ROOT + f, 'utf8'), s = sendsIn(src);
    if (s.length) by[f] = s;
    // (no view reaches the sim around them: app/game.js's sendInput is the one door, the system operator's inputs are its own)
    if (views.test(f)) assert.ok(!tokenize(src).some(x => x.type === 'ident' && /^(sendInput|applyInput)$/.test(x.text)), f + ' reaches the sim around the page\'s actions');
  }
  assert.deepEqual(Object.keys(by).sort(), ['app/shell.js', 'app/suburbcard.js', 'desk/desk.js', 'desk/emergency.js', 'render/livestack.js']);
  // the shell's own: the briefing card's AGC/HAND (a mode input), the keys' runner (desk/README §13.3: a key acts on a desk control)
  // and a feeder card's R or Enter (Q-91: the restore of the feeder it names)
  assert.deepEqual(by['app/shell.js'].map(x => x.what + ': ' + x.arg), ['input: { type : \'mode\'', 'input: a . input )', 'redispatch: )', 'input: { type : \'restore\'']);
  // and where the others are mounted: the desk at #desk, the stack in the desk's slot (#stack-overlay while expanded), the map at #map, the card at #suburb-card
  const shell = readFileSync(ROOT + 'app/shell.js', 'utf8');
  for (const m of [/mount\('map', o\.createMap, \$\('map'\)\)/, /mount\('desk', o\.createDesk, \$\('desk'\)/, /mount\('stack', o\.createLiveStack, slot\)/,
    /\$\('suburb-card'\)/, /ov\.appendChild\(mods\.stack\.el\)/]) assert.match(shell, m);
});

// ---------------------------------------------------------------- the page

const CONTROL_ROLES = new Set(['slider', 'tab', 'radio', 'switch', 'option', 'button', 'checkbox']);
const hidden = e => { for (let n = e; n && n.tagName; n = n.parent) if (n.hidden) return true; return false; };
/** The controls the player can press now, as tests/lib/play.js lists them (the "?" layer only with the drawer). */
function controls(p) {
  const layer = p.$('q-layer'), qOn = p.doc.body.classList.contains('q-on');
  return [...p.doc.body.walk()].filter(e => (e.tagName === 'BUTTON' || e.tagName === 'INPUT' || CONTROL_ROLES.has(e.getAttribute('role'))) &&
    !hidden(e) && (qOn || !layer.contains(e)));
}
const regionOf = (p, e) => REGIONS.find(id => p.$(id) && p.$(id).contains(e)) || '';
const name = e => e.id || (e.dataset.anchor ? 'q:' + e.dataset.anchor : e.tagName + '.' + e.className);

/** The page's actions, watched: every sim input and RE-DISPATCH, with the control being pressed (and its region, as pressed) and the answer. */
function watch(p) {
  const a = p.h.actions, input = a.input, redispatch = a.redispatch, sent = [];
  const w = {at: null, region: '', sent};
  a.input = x => { const r = input(x); sent.push({type: x.type, r, at: w.at, region: w.region}); return r; };
  a.redispatch = () => { const r = redispatch(); sent.push({type: 'redispatch', r, at: w.at, region: w.region}); return r; };
  return w;
}
/**
 * Press every control twice (a guard lifts, then confirms), then close whatever it opened (`open`: or
 * re-open the overlay the controls are in, before each); one frame each.
 */
function pressAll(p, w, list, open) {
  for (const x of list) {
    if (open) open();
    const e = (x.id && p.$(x.id)) || x;   // (a view that rebuilt its rows has a new element by the same id)
    if (!e.isConnected || hidden(e)) continue;   // (gone, or closed by an earlier press)
    w.at = e; w.region = regionOf(p, e);
    p.click(e, {frame: false});
    if (!hidden(e)) p.click(e, {frame: false});
    if (!open) while (p.h.closeTop()) { /* the popover, settings, drawer, alarm panel or card it opened */ }
    p.frame();
    w.at = null;
  }
}

test('D-1 on the page: the briefing sends only mode inputs; from 04:30 every control that sends lives under the desk, the stack, the map or the suburb card', () => {
  const p = openGame({seed: 20261007, take: false}), st = p.game.state, w = watch(p);
  // the briefing: every control but TAKE THE DESK, and the desk's keys
  p.frame();
  pressAll(p, w, controls(p).filter(e => e.id !== 'btn-take'));
  for (const k of ['h', '1', 's', 's', 'x', 'x', 'n', 'd', '[', 'c', 'p', 'h']) p.key(k);
  const brief = w.sent.splice(0);
  assert.ok(brief.some(s => s.type === 'mode' && s.r === '') && brief.some(s => s.type !== 'mode'), 'the briefing was pressed: ' + JSON.stringify(brief.map(s => s.type)));
  for (const s of brief) assert.equal(s.r, s.type === 'mode' ? '' : G.BRIEF_LOCK, s.type + ' in the briefing');
  assert.ok(st.log.length > 0 && st.log.every(x => x.type === 'mode'), 'the sim heard only mode inputs: ' + st.log.map(x => x.type));
  // 04:30, the clock held: every control of the page, then a suburb's card
  p.click('btn-take');
  pressAll(p, w, controls(p));
  const card = () => { if (p.game.ui.suburb !== 'HAZ') p.suburb('HAZ'); };
  card();
  pressAll(p, w, controls(p).filter(e => p.$('suburb-card').contains(e)), card);
  const from = new Set(), stray = [];
  for (const s of w.sent) { if (s.region) from.add(s.region); else stray.push(s.type + ' from ' + (s.at ? name(s.at) : 'no control')); }
  assert.deepEqual(stray, [], 'sim inputs from outside the desk, the stack, the map and the suburb card');
  assert.deepEqual([...from].sort(), ['desk', 'suburb-card'], 'the audit pressed controls that send (the stack\'s canvas is the source half\'s)');
  assert.ok(w.sent.some(s => s.r === '' && s.type === 'start') && w.sent.some(s => s.type === 'flex'), 'START and a suburb\'s lever reached the sim: ' + [...new Set(w.sent.map(s => s.type))]);
  assert.deepEqual(p.h.mods.errors, []);
});

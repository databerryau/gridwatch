// F-1 / F-5 / Exit Phase 0: the bench page (bench.html + app/bench-boot.js + render/bench.js; it was
// next.html until Phase 1a, desk/README.md A-5) without a browser.
//  - static: charset first, one ES-module entry, zero requests to other origins, relative
//    imports only, no Math.random outside render/ and audio/ (F-3);
//  - live: bench.html's body is loaded into a small stand-in DOM (below; enough for the bench,
//    not a browser) and app/bench-boot.js runs against it, driven by fake animation frames. The
//    static rules cover every page module (app/, render/, content/, desk/, audio/).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tokenize, importSpecifiers} from './lib/js-tokens.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = f => relative(ROOT, f).replace(/\\/g, '/');
const HTML = readFileSync(join(ROOT, 'bench.html'), 'utf8');

function jsUnder(dir) {
  const d = join(ROOT, dir), out = [];
  let names = [];
  try { names = readdirSync(d); } catch { return out; }
  for (const n of names) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) out.push(...jsUnder(join(dir, n)));
    else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}
const PAGE_JS = [...jsUnder('app'), ...jsUnder('render'), ...jsUnder('content'), ...jsUnder('desk'), ...jsUnder('audio')];

// ------------------------------------------------------------------ static

test('F-1: bench.html starts with the charset meta and loads app/bench-boot.js as its one ES module', () => {
  assert.match(HTML, /^<!doctype html>\s*<meta charset="utf-8">/i);
  const scripts = [...HTML.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
  assert.deepEqual(scripts.map(s => s.trim()), ['type="module" src="app/bench-boot.js"']);
});

test('F-1: zero requests to other origins: no absolute URLs in bench.html, relative .js imports only', () => {
  for (const m of HTML.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
    assert.ok(!/^(?:[a-z]+:)?\/\//i.test(m[1]) && !/^https?:/i.test(m[1]), 'bench.html loads ' + m[1]);
  }
  assert.ok(!/@import|url\(\s*['"]?https?:/i.test(HTML), 'no remote CSS');
  assert.ok(PAGE_JS.length >= 8, PAGE_JS.map(rel).join());
  for (const f of PAGE_JS) {
    const src = readFileSync(f, 'utf8');
    for (const s of importSpecifiers(tokenize(src))) assert.match(s, /^\.\.?\/[\w./-]+\.js$/, rel(f) + ' imports ' + s);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(src), rel(f) + ' makes a request');
    assert.ok(!/https?:\/\//.test(src.replace(/\/\/.*$/gm, '')), rel(f) + ' names an absolute URL in code');
  }
});

test('F-3: Math.random appears only under render/ and audio/ (fx); app/, desk/ and content/ are deterministic', () => {
  for (const f of [...jsUnder('app'), ...jsUnder('content'), ...jsUnder('desk')]) {
    const toks = tokenize(readFileSync(f, 'utf8'));
    toks.forEach((t, k) => {
      if (t.type === 'ident' && t.text === 'Math' && toks[k + 2] && toks[k + 2].text === 'random') assert.fail(rel(f) + ':' + t.line + ' Math.random');
    });
  }
});

test('the bench modules the tests drive import in Node without a DOM', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const m of ['app/loop.js', 'app/director.js', 'app/session.js', 'app/record.js', 'app/assist.js', 'app/input.js',
    'render/format.js', 'render/charts.js', 'render/bench.js', 'content/text.js']) {
    await import(pathToFileURL(join(ROOT, m)).href);
  }
});

test('render/format and chart axes: clock, numbers, records, price scale', async () => {
  const F = await import('../render/format.js');
  const C = await import('../render/charts.js');
  assert.equal(F.clockText(0), '04:00:00');
  assert.equal(F.clockText(20 * 3600 + 61), '00:01:01');
  assert.equal(F.mw(1234.6), '1,235');
  assert.equal(F.mw(-2500), '-2,500');
  assert.equal(F.rateText(0.15), '0.15×');
  assert.equal(F.rateText(2100), '2,100×');
  assert.equal(F.mmss(299.6), '5:00');
  assert.equal(F.describeRecord({kind: 'announce'}), null);
  assert.match(F.describeRecord({kind: 'ufls', stage: 2, districts: ['HAZ1', 'TAL1'], mw: 410}).text, /stage 2.*HAZ1, TAL1.*410 MW/);
  assert.equal(C.priceScale(0), 0);
  assert.ok(C.priceScale(100) > C.priceScale(10) && C.priceScale(-10) === -C.priceScale(10));
  const [lo, hi] = C.freqRange(49.9, 50.05);
  assert.ok(lo <= 49.8 && hi >= 50.2);
  const [lo2] = C.freqRange(48.3, 50.1);
  assert.ok(lo2 <= 48.25 && lo2 >= 46.5);
  // The watch chart's stretched time axis: monotonic, and 0-3 s gets the most width.
  let prev = -1;
  for (let s = 0; s <= 60; s += 0.25) { const a = C.watchAxis(s); assert.ok(a > prev, 'monotonic at ' + s); prev = a; }
  assert.equal(C.watchAxis(60), 1);
  assert.ok(C.watchAxis(3) > 0.4, 'the slow-motion part of the watch is most of the chart');
  const d = C.decimate(Float64Array.from([1, 5, NaN, 2, 8, 3]), 3);
  assert.deepEqual([...d.min], [1, 2, 3]);
  assert.deepEqual([...d.max], [5, 2, 8]);
});

// ------------------------------------------------------------------ a stand-in DOM

const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);

class ClassList {
  constructor(e) { this.e = e; }
  list() { return this.e.className.split(/\s+/).filter(Boolean); }
  add(...c) { const a = this.list(); for (const x of c) if (!a.includes(x)) a.push(x); this.e.className = a.join(' '); }
  remove(...c) { this.e.className = this.list().filter(x => !c.includes(x)).join(' '); }
  contains(c) { return this.list().includes(c); }
  toggle(c, force) {
    const want = force === undefined ? !this.contains(c) : !!force;
    if (want) this.add(c); else this.remove(c);
    return want;
  }
}

// A 2D context that accepts every call and rejects NaN/Infinity coordinates (a drawing bug).
function context2d(stats) {
  const target = {measureText: s => ({width: String(s).length * 6})};
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        stats.calls++;
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) stats.bad.push(String(k) + '(' + args.join(',') + ')');
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class TextNode {
  constructor(s) { this.textContent = String(s); this.parent = null; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
}

class Elem {
  constructor(doc, tag) {
    Object.assign(this, {ownerDocument: doc, tagName: tag.toUpperCase(), children: [], parent: null, className: '', dataset: {},
      style: {}, own: '', listeners: {}, hidden: false, disabled: false, value: '', type: '', title: '', id: '', scrollTop: 0,
      width: 300, height: 150, href: '', download: ''});
    this.classList = new ClassList(this);
  }
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this.own; }
  set textContent(s) { for (const c of this.children) c.parent = null; this.children = []; this.own = String(s); }
  get childElementCount() { return this.children.filter(c => c instanceof Elem).length; }
  get firstElementChild() { return this.children.find(c => c instanceof Elem) || null; }
  get clientWidth() { return 400; }
  get clientHeight() { return 120; }
  get scrollHeight() { return 200; }
  get offsetHeight() { return 100; }
  appendChild(c) {
    if (c.parent) c.remove();
    if (this.own && !this.children.length) { this.children.push(new TextNode(this.own)); this.own = ''; }
    c.parent = this;
    this.children.push(c);
    return c;
  }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? new TextNode(c) : c); }
  before(c) { const p = this.parent; if (c.parent) c.remove(); c.parent = p; p.children.splice(p.children.indexOf(this), 0, c); }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(g => g !== f); }
  dispatch(type, extra) {
    const ev = Object.assign({type, target: this, stopped: false, preventDefault() {}, stopPropagation() { this.stopped = true; }}, extra);
    for (let n = this; n && !ev.stopped; n = n.parent) for (const f of n.listeners[type] || []) f(ev);
    if (!ev.stopped) for (const f of this.ownerDocument.listeners[type] || []) f(ev);
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  getContext() { return this.ctx || (this.ctx = context2d(this.ownerDocument.canvasStats)); }
  getBoundingClientRect() { return {left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20}; }
  *walk() { for (const c of this.children) if (c instanceof Elem) { yield c; yield* c.walk(); } }
  matches(sel) {
    if (sel[0] === '#') return this.id === sel.slice(1);
    if (sel[0] === '.') return this.classList.contains(sel.slice(1));
    return this.tagName === sel.toUpperCase();
  }
  querySelector(sel) { for (const e of this.walk()) if (e.matches(sel)) return e; return null; }
  querySelectorAll(sel) { return [...this.walk()].filter(e => e.matches(sel)); }
}

/** A document holding bench.html's <body>, parsed by a strict little tag reader. */
function makeDocument(html) {
  const doc = {listeners: {}, visibilityState: 'visible', canvasStats: {calls: 0, bad: []}};
  doc.createElement = t => new Elem(doc, t);
  doc.createTextNode = s => new TextNode(s);
  doc.addEventListener = (t, f) => { (doc.listeners[t] ||= []).push(f); };
  doc.removeEventListener = (t, f) => { doc.listeners[t] = (doc.listeners[t] || []).filter(g => g !== f); };
  doc.documentElement = new Elem(doc, 'html');
  doc.body = doc.documentElement.appendChild(new Elem(doc, 'body'));
  doc.getElementById = id => { for (const e of doc.documentElement.walk()) if (e.id === id) return e; return null; };
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const body = src.slice(src.indexOf('<body>') + '<body>'.length, src.lastIndexOf('</body>'));
  const stack = [doc.body];
  for (const m of body.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g)) {
    const top = stack[stack.length - 1];
    if (m[3] !== undefined) { if (m[3].trim()) top.appendChild(new TextNode(m[3])); continue; }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      const open = stack.pop();
      if (open.tagName.toLowerCase() !== tag) throw new Error('bench.html: </' + tag + '> closes <' + open.tagName.toLowerCase() + '>');
      continue;
    }
    const e = new Elem(doc, tag);
    for (const [, k, v = ''] of m[2].matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) {
      if (k === 'id') e.id = v;
      else if (k === 'class') e.className = v;
      else if (k.startsWith('data-')) e.dataset[k.slice(5)] = v;
      else if (k === 'hidden') e.hidden = true;
      else if (['type', 'min', 'max', 'step', 'title', 'value'].includes(k)) e[k] = v;
    }
    top.appendChild(e);
    if (!VOID.has(tag)) stack.push(e);
  }
  if (stack.length !== 1) throw new Error('bench.html: unclosed ' + stack.slice(1).map(e => e.tagName).join(', '));
  return doc;
}

/** Boot the bench against the stand-in DOM; returns helpers. One boot per process (bench-boot.js is a module). */
let booted = null;
async function bootBench(query) {
  if (booted) return booted;
  const doc = makeDocument(HTML);
  let raf = null, t = 0;
  const saved = {};
  const globals = {document: doc, location: {search: query}, devicePixelRatio: 1, requestAnimationFrame: cb => { raf = cb; return 1; }};
  for (const k of Object.keys(globals)) { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); globalThis[k] = globals[k]; }
  URL.createObjectURL = () => 'blob:bench';
  URL.revokeObjectURL = () => {};
  await import(pathToFileURL(join(ROOT, 'app/bench-boot.js')).href);
  // bench-boot.js captured the document and requestAnimationFrame at start; put the globals back.
  for (const k of Object.keys(globals)) {
    if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k];
  }
  const $ = id => doc.getElementById(id);
  const frames = (n, dtMs = 1000 / 60) => { for (let i = 0; i < n; i++) { t += dtMs; const cb = raf; raf = null; cb(t); } };
  booted = {doc, $, frames, all: () => [...doc.documentElement.walk()]};
  return booted;
}

test('the bench boots on bench.html, draws, answers "?" and takes desk input through the sim', async () => {
  const {doc, $, frames, all} = await bootBench('?seed=7&speed=240');
  frames(2);
  assert.equal($('clock-text').textContent, '04:00:00', 'the briefing starts paused at 04:00');
  assert.match($('rate-text').textContent, /PAUSE/);
  const {TEXT} = await import('../content/text.js');
  const helps = all().filter(e => e.className === 'q');
  assert.equal(helps.length, TEXT.abstractions.filter(e => e.ui !== 'drawer').length, 'one "?" per bench anchor');
  const titles = helps.map(h => h.title);
  for (const e of TEXT.abstractions.filter(e => e.ui !== 'drawer')) {
    assert.ok(titles.some(t => t.startsWith(e.row.replace(/\.$/, '') + ' (')), 'tooltip cut short for "' + e.row + '"');
  }
  helps[0].click();
  assert.equal($('popover').hidden, false);
  assert.match($('popover').textContent, /Real world: .*GRIDWATCH: .*Why: /);
  doc.body.dispatch('click');
  assert.equal($('popover').hidden, true, 'a click elsewhere closes it');
  $('btn-help').click();
  assert.equal($('drawer').querySelectorAll('article').length, TEXT.abstractions.length, 'the drawer lists every abstraction');
  $('btn-help').click();
  // AGC/HAND at the briefing, then play.
  const hand = $('agc-mode').querySelectorAll('button').find(b => b.dataset.agc === '0');
  hand.click();
  frames(1);
  assert.ok(hand.classList.contains('on'), 'HAND chosen');
  $('btn-play').click();
  frames(60);
  assert.match($('rate-text').textContent, /DEBUG 240×/);
  assert.notEqual($('clock-text').textContent, '04:00:00', 'the clock runs');
  // Guarded START: one click arms, the second commits (K-3).
  const gtaStart = $('station-gta').querySelectorAll('button')[0];
  assert.equal(gtaStart.textContent, 'START');
  gtaStart.click();
  assert.equal(gtaStart.textContent, 'SURE?');
  gtaStart.click();
  frames(1);
  assert.match($('station-gta').textContent, /T1/, 'GT·A is starting');
  // A lever: moving the slider sends a base point on release.
  const coal = $('station-coal').querySelector('input');
  coal.value = '2200';
  coal.dispatch('input');
  coal.dispatch('change');
  frames(1);
  assert.match($('station-coal').textContent, /base 2,200/);
  // HAND locks at 04:30; skip there, the AGC buttons disable.
  $('btn-desk').click();
  frames(2);
  assert.ok(hand.disabled, 'AGC/HAND locked');
  assert.ok(doc.canvasStats.calls > 1000, 'charts drew');
  assert.deepEqual(doc.canvasStats.bad, [], 'no NaN or Infinity reached the canvas');
  assert.ok($('log-list').childElementCount >= 3, 'the event log shows records');
});

test('the bench plays the debug trip as a watch: locked desk, trace chart, contingency card', async () => {
  const {doc, $, frames} = await bootBench('?seed=7&speed=240');
  const trip = $('btn-trip');
  trip.click();
  trip.click();
  let sawWatch = false;
  for (let i = 0; i < 60 * 40 && !sawWatch; i++) { frames(1); sawWatch = /WATCH T\+/.test($('rate-text').textContent); }
  assert.ok(sawWatch, 'the watch plays');
  assert.ok(doc.body.classList.contains('watch'), 'desk locked (vignette)');
  frames(60 * 3); // three real seconds of slow motion
  $('btn-skip').click(); // then the rest of the watch at the chosen speed (K-15 skip)
  frames(30);
  assert.doesNotMatch($('rate-text').textContent, /WATCH/);
  assert.match($('cont-card').textContent, /#\d+ unit .*nadir 4\d\.\d{3} Hz/);
  assert.match($('log-list').textContent, /DEBUG: tripped/);
  assert.deepEqual(doc.canvasStats.bad, []);
});

// The end card (render/bench.js showEnd), drawn straight onto a second copy of bench.html: no whole
// day needed. The wiring in app/bench-boot.js from state.over to showEnd is not reached here.
test('the bench end card: Day over or the blackout time, the scorecard lines, SAVE LOG and CLOSE', async () => {
  const {createBench} = await import('../render/bench.js');
  const {createState, observe} = await import('../sim/step.js');
  const {CLASSIC} = await import('../content/scenarios.js');
  const doc = makeDocument(HTML), noop = () => {};
  let saved = 0;
  const b = createBench(doc, {input: () => '', togglePause: noop, setSpeed: noop, skipWatch: noop, setAgc: noop, setAssist: noop,
    skipToDesk: noop, newDay: noop, debugTrip: noop, saveLog: () => { saved++; }, replan: noop});
  const st = createState(7, CLASSIC), end = doc.getElementById('end-card');
  assert.equal(end.hidden, true, 'no end card before the day ends');
  b.showEnd(observe(st), ['hashState 0x00000000 · seed 7']);
  assert.equal(end.hidden, false);
  assert.match(end.textContent, /^Day over.*LIGHTS ON: .*CUSTOMER COST: .*CARBON: .*Frequency .*Contingencies .*hashState 0x/s);
  assert.doesNotMatch(end.textContent, /NaN|undefined/);
  const btn = label => end.querySelectorAll('button').find(x => x.textContent === label);
  btn('SAVE LOG').click();
  assert.equal(saved, 1, 'SAVE LOG saves the log');
  st.black = true;
  b.showEnd(observe(st), []);
  assert.match(end.textContent, /^The grid went black at 04:00/);
  assert.equal(end.querySelectorAll('button').length, 2, 'a redraw replaces the card, it does not stack');
  btn('CLOSE').click();
  assert.equal(end.hidden, true, 'CLOSE hides the card');
});

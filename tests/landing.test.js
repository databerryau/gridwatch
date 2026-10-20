// W6, Y-8: the shared link on a phone, and its preview. A phone-sized viewport or a touch-only pointer gets the landing
// page and never loads the game; a desk-sized one with a mouse loads the game at once; a small window on a computer is told
// how far it falls short, gets PLAY ANYWAY (and FULL SCREEN where Esc can stay the game's), and loads the game once it
// grows; a tablet with a pen or a trackpad keeps the phone's page. COPY LINK copies the address. Every page carries og: tags
// with an absolute image on the canonical host (C-4), og.png is a 1200x630 PNG, and the favicon is not the empty one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {makeDocument} from './lib/dom.js';
import {needsLanding, DESK_W, DESK_H, NEEDS} from '../app/landing.js';
import {start} from '../app/start.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
// A stand-in window: its viewport and screen, which pointers it has (coarse: the main one is a finger), the page's scale
// (a mobile browser's shrink to fit), its address and clipboard, and who listens to it
function win(w, h, {coarse = false, fine = true, scale, search = '', clip = null, screen} = {}) {
  const q = {'(pointer: coarse)': coarse, '(any-pointer: fine)': fine}, on = {resize: []};
  return {innerWidth: w, innerHeight: h, screen, matchMedia: s => ({matches: !!q[s]}), location: {href: 'https://databerryau.github.io/gridwatch/' + search, search},
    navigator: {clipboard: clip}, document: makeDocument(read('index.html')), on, ...(scale ? {visualViewport: {scale}} : {}),
    addEventListener: (t, f) => (on[t] ||= []).push(f), removeEventListener: (t, f) => { on[t] = (on[t] || []).filter(g => g !== f); }};
}
// Chrome and Edge: the keyboard can be locked, so Esc stays the page's in full screen
const chrome = (x, locked = () => {}) => { x.navigator.keyboard = {lock: async keys => { locked(keys); }}; return x; };
// The window becomes w x h (a drag, F11, full screen or a zoom), and the browser says so
function resize(x, w, h) {
  x.innerWidth = w; x.innerHeight = h;
  for (const f of x.on.resize.slice()) f({type: 'resize'});
}
// 1920x1080 at 150% (common on work laptops) is a 1280x720 screen; maximised, less the taskbar and the browser's tabs and
// address bar, the window is about 1280x587
const LAPTOP = {width: 1280, height: 720};
const tick = () => new Promise(r => setImmediate(r));
// Which of these ids are on the page (asserted as ids: a failure that printed an element would print the whole page)
const present = (doc, ...ids) => ids.filter(id => doc.getElementById(id));

test('Y-8: below the desk\'s floor or touch-only, the landing page; a desk-sized screen with a mouse, the game', () => {
  assert.equal(needsLanding(win(390, 844, {coarse: true, fine: false})), true, 'a phone');
  assert.equal(needsLanding(win(1366, 1024, {coarse: true, fine: false})), true, 'a big tablet, touch only');
  assert.equal(needsLanding(win(1200, 800)), true, 'a small window');
  assert.equal(needsLanding(win(DESK_W, DESK_H)), false);
  assert.equal(needsLanding(win(1366, 625)), false, 'a 1366x768 laptop after its browser chrome');
  assert.equal(needsLanding(win(1920, 1080, {coarse: true, fine: true})), false, 'a touch laptop with a trackpad');
  // a phone whose window the desk's own min-width has widened to 1280 (measured in the browser pane): its screen says
  assert.equal(needsLanding(Object.assign(win(1280, 2770, {coarse: false, fine: false}), {screen: {width: 375, height: 812}})), true);
  assert.equal(needsLanding(Object.assign(win(1280, 720), {screen: {width: 1920, height: 1080}})), false);
  assert.equal(needsLanding(win(1280, 587, {screen: LAPTOP})), true, 'a maximised browser on the 150% laptop');
  // a computer zoomed out to 80% past its 1093x614 screen (1366x768 at 125%): Chrome keeps the screen's size as it was
  assert.equal(needsLanding(win(1366, 601, {screen: {width: 1093, height: 614}})), false);
});

test('Y-8: at 390x844 the landing page shows and the game is not loaded; COPY LINK copies the address', async () => {
  let loads = 0, copied = '';
  const w = win(390, 844, {coarse: true, fine: false, clip: {writeText: async t => { copied = t; }}});
  assert.equal(start(w, () => { loads++; }), 'landing');
  assert.equal(loads, 0, 'the desk never loads');
  const doc = w.document, land = doc.getElementById('landing');
  assert.ok(land && /GRIDWATCH/.test(land.textContent));
  assert.equal(land.querySelector('img').src, 'og.png');
  assert.equal(doc.getElementById('landing-play'), null, 'no PLAY ANYWAY on a touch-only phone');
  assert.ok(land.textContent.includes(NEEDS), 'the phone\'s words');
  assert.deepEqual(present(doc, 'landing-size', 'landing-full', 'landing-how'), [], 'not the small window\'s');
  assert.deepEqual(w.on.resize, [], 'a phone\'s window never grows to the desk');
  doc.getElementById('landing-copy').click();
  await new Promise(r => setImmediate(r));
  assert.equal(copied, 'https://databerryau.github.io/gridwatch/');
  assert.match(doc.getElementById('landing-said').textContent, /^Copied/);
});

test('Y-8: a desk-sized screen loads the game at once; a small window with a mouse gets PLAY ANYWAY; ?play skips the landing', () => {
  let loads = 0;
  assert.equal(start(win(1280, 720), () => { loads++; }), 'game');
  assert.equal(loads, 1);
  const w = win(1100, 700);
  assert.equal(start(w, () => { loads++; }), 'landing');
  w.document.getElementById('landing-play').click();
  assert.equal(loads, 2);
  assert.deepEqual(present(w.document, 'landing'), []);
  assert.equal(start(win(390, 844, {coarse: true, fine: false, search: '?play'}), () => { loads++; }), 'game');
});

test('Y-8: a 1280x587 window on a computer says how far it falls short, not the phone\'s words; growing it loads the game', () => {
  let loads = 0;
  const w = win(1280, 587, {screen: LAPTOP});
  assert.equal(start(w, () => { loads++; }), 'landing');
  const doc = w.document, land = doc.getElementById('landing'), size = () => doc.getElementById('landing-size').textContent;
  assert.equal(size(), 'This window is 1280 by 587: 13 px too short for the desk (1280 by 600).');
  assert.ok(!land.textContent.includes('played on a computer'), 'not "GRIDWATCH is played on a computer" to someone at one');
  assert.deepEqual([present(doc, 'landing-copy', 'landing-play'), !!land.querySelector('img')], [['landing-play'], false],
    'PLAY ANYWAY; no COPY LINK, no picture: it fits a short window');
  assert.equal(doc.getElementById('landing-how').textContent, 'The game starts by itself once the desk fits: press F11 for full screen, or zoom out (Ctrl and minus).');
  // the line counts down as the window grows; the game loads once it holds the desk (Ctrl and minus: 90%), and only once
  resize(w, 1280, 595);
  assert.equal(size(), 'This window is 1280 by 595: 5 px too short for the desk (1280 by 600).');
  assert.equal(loads, 0);
  resize(w, 1422, 652);
  assert.equal(loads, 1);
  assert.deepEqual(present(doc, 'landing'), []);
  assert.equal(doc.body.classList.contains('landing'), false);
  assert.deepEqual(w.on.resize, [], 'it stops listening');
  resize(w, 1280, 587);
  assert.equal(loads, 1, 'a game that is up stays up');
  // PLAY ANYWAY stops listening too
  const p = win(1100, 700, {screen: LAPTOP});
  start(p, () => { loads++; });
  p.document.getElementById('landing-play').click();
  resize(p, 1280, 720);
  assert.equal(loads, 2);
});

test('Y-8: FULL SCREEN on a screen that holds the desk loads the game into it, Esc kept for the game; blocked, it says F11', async () => {
  let loads = 0, locked = null;
  const w = chrome(win(1280, 587, {screen: LAPTOP}), keys => { locked = keys; });
  w.document.documentElement.requestFullscreen = async () => { resize(w, 1280, 720); };
  start(w, () => { loads++; });
  assert.match(w.document.getElementById('landing-how').textContent, /: press FULL SCREEN \(or F11\), or zoom out \(Ctrl and minus\)\.$/);
  w.document.getElementById('landing-full').click();
  await tick();
  assert.equal(loads, 1);
  assert.deepEqual(locked, ['Escape'], 'Esc closes the game\'s cards; a held Esc leaves full screen');
  // Firefox and Safari cannot lock the keyboard: their Esc would leave the page's full screen, not reach the game, and leave
  // the desk short for the rest of the day; the browser's own full screen leaves Esc to the page
  for (const [platform, how] of [['Win32', 'press F11 for full screen, or zoom out (Ctrl and minus).'],
    ['MacIntel', 'press Control, Command and F for full screen, or zoom out (Command and minus).']]) {
    const f = win(1280, 587, {screen: LAPTOP});
    f.navigator.platform = platform;
    f.document.documentElement.requestFullscreen = async () => { resize(f, 1280, 720); };
    start(f, () => { loads++; });
    assert.deepEqual(present(f.document, 'landing-full', 'landing-play'), ['landing-play'], platform);
    assert.equal(f.document.getElementById('landing-how').textContent, 'The game starts by itself once the desk fits: ' + how);
  }
  // blocked (a page in a frame, a browser's setting), on a Mac
  const b = chrome(win(1280, 587, {screen: LAPTOP}));
  b.navigator.platform = 'MacIntel';
  b.document.documentElement.requestFullscreen = () => Promise.reject(new Error('denied'));
  start(b, () => { loads++; });
  assert.match(b.document.getElementById('landing-how').textContent, /\(or Control, Command and F\), or zoom out \(Command and minus\)/);
  b.document.getElementById('landing-full').click();
  await tick();
  assert.equal(b.document.getElementById('landing-said').textContent, 'Full screen was blocked: press Control, Command and F.');
  assert.equal(loads, 1);
  // a screen smaller than the desk (1366x768 at 125%): full screen would not hold it, so only zooming out is offered
  const s = chrome(win(1093, 481, {screen: {width: 1093, height: 614}}));
  s.document.documentElement.requestFullscreen = async () => {};
  start(s, () => { loads++; });
  assert.deepEqual(present(s.document, 'landing-full'), []);
  assert.equal(s.document.getElementById('landing-size').textContent, 'This window is 1093 by 481: 187 px too narrow and 119 px too short for the desk (1280 by 600).');
  assert.match(s.document.getElementById('landing-how').textContent, /: zoom out \(Ctrl and minus\) until it does\.$/);
  resize(s, 1366, 601);
  assert.equal(loads, 2);
});

test('Y-8: a phone keeps the phone\'s page (a stylus phone too); ?play and ?selftest skip the small window\'s', () => {
  let loads = 0;
  const pen = win(412, 915, {coarse: true, fine: true, screen: {width: 412, height: 915}});
  assert.equal(start(pen, () => { loads++; }), 'landing');
  assert.ok(pen.document.getElementById('landing').textContent.includes(NEEDS));
  assert.deepEqual(present(pen.document, 'landing-copy', 'landing-play', 'landing-size'), ['landing-copy', 'landing-play']);
  assert.deepEqual(pen.on.resize, []);
  assert.equal(start(win(1280, 587, {screen: LAPTOP, search: '?play'}), () => { loads++; }), 'game');
  assert.equal(loads, 1);
  const t = win(1280, 587, {screen: LAPTOP, search: '?selftest'});
  assert.equal(start(t, () => { loads++; }, async () => ({showSelftest() {}})), 'selftest');
  assert.deepEqual([loads, present(t.document, 'landing'), t.on.resize], [1, [], []]);
});

test('Y-8: a tablet with a pen or a trackpad is not a computer: widened to the desk or not, it keeps the phone\'s page', () => {
  let loads = 0;
  const phonePage = (x, said) => {
    assert.equal(start(x, () => { loads++; }), 'landing', said);
    assert.ok(x.document.getElementById('landing').textContent.includes(NEEDS), said + ': the phone\'s words');
    assert.deepEqual(present(x.document, 'landing-copy', 'landing-play', 'landing-size', 'landing-how'), ['landing-copy', 'landing-play'], said);
    assert.deepEqual(x.on.resize, [], said);
  };
  // a Galaxy Tab S with its pen, in portrait: the pen is a pointer that can aim, the finger the main one; the desk's
  // min-width widens its window to 1280, as a phone's
  phonePage(win(1280, 2048, {coarse: true, fine: true, screen: {width: 800, height: 1280}}), 'Galaxy Tab S, widened');
  phonePage(win(800, 1170, {coarse: true, fine: true, screen: {width: 800, height: 1280}}), 'Galaxy Tab S, not widened: not told to press Ctrl and minus');
  phonePage(win(1280, 1841, {coarse: true, fine: true, screen: {width: 820, height: 1180}}), 'an iPad with a trackpad');
  // a browser that calls the pen its main pointer still shrinks the widened page to fit it: 800 of 1280
  phonePage(win(1280, 2048, {fine: true, scale: 0.625, screen: {width: 800, height: 1280}}), 'a page shrunk to fit');
  assert.equal(loads, 0);
  // in landscape the tablet holds the desk; a computer zoomed out past its screen keeps a scale of 1
  assert.equal(start(win(1280, 690, {coarse: true, fine: true, screen: {width: 1280, height: 800}}), () => { loads++; }), 'game');
  assert.equal(start(win(1366, 601, {scale: 1, screen: {width: 1093, height: 614}}), () => { loads++; }), 'game');
  assert.equal(loads, 2);
});

test('Y-8: every page carries og: tags (an absolute og.png on the canonical host) and a favicon; og.png is 1200x630', () => {
  for (const page of ['index.html', 'next.html']) {
    const html = read(page), meta = p => (html.match(new RegExp('<meta property="' + p + '" content="([^"]*)"')) || [])[1];
    assert.ok(meta('og:title'), page + ' og:title');
    assert.ok(meta('og:description') && meta('og:description').length > 40, page + ' og:description');
    assert.equal(meta('og:image'), 'https://databerryau.github.io/gridwatch/og.png', page);
    assert.equal(meta('og:url'), 'https://databerryau.github.io/gridwatch/', page);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, page);
    const icon = (html.match(/<link rel="icon" href="([^"]*)"/) || [])[1];
    assert.ok(icon && icon !== 'data:,', page + ' has a favicon');
  }
  const png = readFileSync(join(ROOT, 'og.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.ok(existsSync(join(ROOT, 'tools/og-image.mjs')), 'og.png is made by tools/og-image.mjs');
});

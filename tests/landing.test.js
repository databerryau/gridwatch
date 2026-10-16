// W6, Y-8: the shared link on a phone, and its preview. A phone-sized viewport or a touch-only pointer gets the landing
// page and never loads the game; a desk-sized one with a mouse loads the game at once; a small window with a mouse gets
// PLAY ANYWAY. COPY LINK copies the address. Every page carries og: tags with an absolute image on the canonical host
// (C-4), og.png is a 1200x630 PNG, and the favicon is not the empty one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {makeDocument} from './lib/dom.js';
import {needsLanding, DESK_W, DESK_H} from '../app/landing.js';
import {start} from '../app/start.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
// A stand-in window: its viewport, which pointers it has, its address and clipboard
function win(w, h, {coarse = false, fine = true, search = '', clip = null} = {}) {
  const q = {'(pointer: coarse)': coarse, '(any-pointer: fine)': fine};
  return {innerWidth: w, innerHeight: h, matchMedia: s => ({matches: !!q[s]}), location: {href: 'https://databerryau.github.io/gridwatch/' + search, search},
    navigator: {clipboard: clip}, document: makeDocument(read('next.html'))};
}

test('Y-8: below the desk\'s floor or touch-only, the landing page; a desk-sized screen with a mouse, the game', () => {
  assert.equal(needsLanding(win(390, 844, {coarse: true, fine: false})), true, 'a phone');
  assert.equal(needsLanding(win(1366, 1024, {coarse: true, fine: false})), true, 'a big tablet, touch only');
  assert.equal(needsLanding(win(1200, 800)), true, 'a small window');
  assert.equal(needsLanding(win(DESK_W, DESK_H)), false);
  assert.equal(needsLanding(win(1366, 625)), false, 'a 1366x768 laptop after its browser chrome');
  assert.equal(needsLanding(win(1920, 1080, {coarse: true, fine: true})), false, 'a touch laptop with a trackpad');
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
  assert.equal(w.document.getElementById('landing'), null);
  assert.equal(start(win(390, 844, {coarse: true, fine: false, search: '?play'}), () => { loads++; }), 'game');
});

test('Y-8: every page carries og: tags (an absolute og.png on the canonical host) and a favicon; og.png is 1200x630', () => {
  for (const page of ['next.html', 'index.html']) {
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

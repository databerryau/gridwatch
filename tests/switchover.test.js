// W7 (SPEC Q-126, F-14): the switch-over. The game is the site's root (index.html); next.html, its address from Phase 1,
// sends old links there with the rest of the address, and cannot bounce with an old root still in a browser's cache (Pages
// keeps a file 10 minutes): after two hops in a tab it goes to index.html by name, and after four it stops on its own words.
// The game clears the count when it starts.
// classic.html carries a banner to the root.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {start, HOP_KEY} from '../app/start.js';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

/** next.html's inline script run against a stand-in location, session storage and page; the addresses it went to, its link. */
function hopper(store) {
  const body = read('next.html').match(/<script>([\s\S]*?)<\/script>/)[1], went = [];
  const location = {search: '?date=2026-10-20', hash: '#top', replace: u => went.push(u)};
  const link = {href: './'}, document = {getElementById: id => (id === 'moved' ? link : null)};
  const run = () => new Function('location', 'sessionStorage', 'document', body)(location, store, document);
  return {went, run, link};
}

test('Q-126: index.html is the game (its one module script is app/start.js) and next.html loads no game code', () => {
  assert.match(read('index.html'), /<script type="module" src="app\/start\.js"><\/script>/);
  const next = read('next.html');
  assert.doesNotMatch(next, /<script[^>]*\bsrc=|<link rel="stylesheet"/, 'next.html is only the redirect: no script file, no styles');
  assert.match(next, /<noscript><meta http-equiv="refresh" content="0; url=index.html"><\/noscript>/, 'with no script: index.html by name');
  assert.match(next, /<link rel="canonical" href="https:\/\/databerryau\.github\.io\/gridwatch\/">/);
});

test('Q-126: next.html sends a link to the root with its address, and after two hops in a tab (an old root cached) to index.html by name', () => {
  const kept = new Map(), store = {getItem: k => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v)};
  const h = hopper(store);
  h.run(); h.run(); h.run();
  assert.deepEqual(h.went, ['./?date=2026-10-20#top', './?date=2026-10-20#top', 'index.html?date=2026-10-20#top']);
  assert.equal(kept.get(HOP_KEY), '3', 'the count it keeps is the key the game clears');
  // the game started: the count is gone, so the next old link goes to the root again
  start({sessionStorage: {removeItem: k => kept.delete(k)}, location: {search: '?selftest'}, document: {}}, () => null,
    () => Promise.resolve({showSelftest() {}}));
  assert.equal(kept.has(HOP_KEY), false);
  h.run();
  assert.equal(h.went[3], './?date=2026-10-20#top');
});

test('Q-126: with index.html the old root too (both cached) next.html stops after four hops, on its own words, its link keeping the address', () => {
  const kept = new Map(), store = {getItem: k => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v)};
  const h = hopper(store);
  for (let i = 0; i < 6; i++) h.run();
  assert.deepEqual(h.went, ['./?date=2026-10-20#top', './?date=2026-10-20#top', 'index.html?date=2026-10-20#top', 'index.html?date=2026-10-20#top']);
  assert.equal(h.link.href, './?date=2026-10-20#top');
  assert.match(read('next.html'), /<p>GRIDWATCH has moved to <a id="moved" href="\.\/">[\s\S]*<\/p>\s*<script>/, 'the words and the link are on the page before its script');
});

test('Q-126: with session storage blocked next.html goes to index.html at once (it cannot count hops), and the game starts anyway', () => {
  const blocked = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }};
  const h = hopper(blocked);
  h.run();
  assert.deepEqual(h.went, ['index.html?date=2026-10-20#top']);
  assert.equal(start({sessionStorage: blocked, location: {search: '?selftest'}, document: {}}, () => null, () => Promise.resolve({showSelftest() {}})), 'selftest');
});

test('Q-126: classic.html says what it is and links the root; its script, which tools/harness.js loads, is unchanged by the banner', () => {
  const html = read('classic.html'), banner = html.match(/<p id="classic-banner"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(banner, 'the banner');
  assert.match(banner[1], /the original GRIDWATCH \(v2\)/);
  assert.match(banner[1], /<a href="\.\/"[^>]*>databerryau\.github\.io\/gridwatch<\/a>/);
  assert.ok(html.indexOf('id="classic-banner"') < html.indexOf('<script'), 'outside the script');
});

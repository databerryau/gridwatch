// W6, F-9: version coherence. Pages caches each file for 10 minutes, so after a deploy a browser can hold files from two
// releases. Eight modules keep a copy of app/build.js's BUILD (app/boot.js CARRIED), and version.json is the live one: a
// release bump that misses a copy fails here. A forced mismatch shows "GRIDWATCH was updated — refresh to continue" in
// place of the game, and never throws or reloads; a load that cannot link says so too (app/start.js). While the page
// plays, a live build that moved on shows a quiet note once, and a check that fails says nothing. Every case is a
// stand-in window; the last test boots the real page.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join, relative, sep} from 'node:path';
import {makeDocument, installGlobals} from './lib/dom.js';
import {jsFiles} from './lib/js-tokens.js';
import {BUILD, VERSION_FILE, CHECK_MS, UPDATED, UPDATED_WHY, NOT_LOADED, LATER, gate, watchLive} from '../app/build.js';
import {start} from '../app/start.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const rel = p => relative(ROOT, p).split(sep).join('/');
const NEXT = read('next.html');
const SITE = 'https://databerryau.github.io/gridwatch/';
const settle = () => new Promise(r => setImmediate(r));
const answer = body => () => Promise.resolve({ok: true, json: async () => body});

// A stand-in window on the live site: a desk-sized screen with a mouse, the files this page loaded (`entries`), a fetch
// that records [url, cache] and answers with `fetch` (default: offline), and a reload that only counts.
function win({fetch = null, entries = []} = {}) {
  const w = {document: makeDocument(NEXT), innerWidth: 1280, innerHeight: 720, matchMedia: q => ({matches: q === '(any-pointer: fine)'}),
    performance: {getEntriesByType: t => (t === 'resource' ? entries.map(name => ({name})) : [])}, calls: [], reloads: 0};
  w.location = {href: SITE + 'next.html?date=2026-10-16#top', search: '?date=2026-10-16', reload: () => { w.reloads++; }};
  w.fetch = (u, o) => { w.calls.push([String(u), o && o.cache]); return fetch ? fetch(u, o) : Promise.reject(new TypeError('Failed to fetch')); };
  return w;
}

test('F-9: the eight carriers keep app/build.js\'s BUILD, version.json says the same, and no other module keeps or re-exports one (a release bump cannot miss a copy)', async () => {
  const {CARRIED, handle} = await import('../app/boot.js');   // (no document: it boots nothing)
  assert.equal(handle, null);
  const paths = Object.keys(CARRIED);
  assert.ok(paths.length >= 5 && paths.length <= 8, paths.length + ' carriers');
  assert.deepEqual([...new Set(paths.map(p => p.split('/')[0]))].sort(), ['app', 'content', 'desk', 'render', 'sim'], 'one in every layer');
  for (const p of paths) {
    assert.equal(CARRIED[p], await import('../' + p), 'CARRIED[\'' + p + '\'] is ' + p);
    assert.equal(CARRIED[p].BUILD, BUILD, p + ' keeps release ' + CARRIED[p].BUILD + ': bump it with app/build.js');
  }
  // every copy in the game's source is a carrier's (or app/build.js's own); none is a re-export, which would always agree
  // (a page loads app/build.js once)
  const copies = {};
  for (const dir of ['app', 'sim', 'desk', 'render', 'content', 'audio']) {
    for (const f of jsFiles(join(ROOT, dir))) {
      const src = readFileSync(f, 'utf8'), m = /^export const BUILD = '([^']*)';/m.exec(src);
      assert.doesNotMatch(src, /export\s*\{[^}]*\bBUILD\b[^}]*\}\s*from/, rel(f) + ' re-exports BUILD');
      if (m) copies[rel(f)] = m[1];
    }
  }
  assert.deepEqual(Object.keys(copies).sort(), [...paths, 'app/build.js'].sort(), 'the copies are the carriers\'');
  for (const [f, b] of Object.entries(copies)) assert.equal(b, BUILD, f);
  assert.match(BUILD, /^\d{4}-\d\d-\d\d(\.\d+)?$/, 'the release\'s date, .2 for a second that day');
  assert.equal(JSON.parse(read(VERSION_FILE)).build, BUILD, 'version.json is the live build: bump it with app/build.js');
});

test('F-9 accept: a forced mismatch shows "GRIDWATCH was updated — refresh to continue" in place of the game, with no throw and no reload', async () => {
  const {CARRIED} = await import('../app/boot.js');
  // the page loaded these: the refresh it asks for must load one release, so each of this site's is fetched again past the cache
  const entries = [SITE + 'app/start.js', SITE + 'sim/step.js', SITE + 'desk/desk.css', SITE + VERSION_FILE, 'https://example.org/x.js'];
  for (const [why, odd] of [['a carrier from another release', {BUILD: '2026-10-01'}], ['a carrier from before F-9 (no BUILD)', {}]]) {
    const w = win({entries});
    let started = 0;
    const h = gate(w, Object.assign({}, CARRIED, {'sim/step.js': odd}), () => { started++; return {}; });
    assert.equal(h, null, why);
    assert.equal(started, 0, why + ': the game never starts');
    const b = w.document.getElementById('updated');
    assert.equal(b.querySelector('h1').textContent, 'GRIDWATCH was updated — refresh to continue', why);
    assert.equal(b.querySelector('p').textContent, UPDATED_WHY);
    assert.equal(b.getAttribute('role'), 'alert');
    assert.match(b.title, /sim\/step\.js/, 'its title names the file');
    assert.ok(w.document.getElementById('build-css'), 'it brings its own style (next.html has none for it)');
    gate(w, Object.assign({}, CARRIED, {'sim/step.js': odd}), () => {});
    assert.equal(w.document.querySelectorAll('#updated').length, 1, 'once');
    await settle();
    assert.deepEqual(w.calls.slice(0, 4), [[SITE + 'next.html?date=2026-10-16', 'reload'], [SITE + 'app/start.js', 'reload'], [SITE + 'sim/step.js', 'reload'],
      [SITE + 'desk/desk.css', 'reload']], 'the page and its files, not version.json or another site\'s');
    assert.equal(w.reloads, 0, 'the player refreshes (C-3)');
  }
  // one release: the game starts, and nothing is drawn or fetched
  const w = win();
  assert.equal(gate(w, CARRIED, () => 'the game'), 'the game');
  await settle();
  assert.deepEqual([w.document.getElementById('updated'), w.calls], [null, []]);
});

test('F-9: a game whose files cannot link (or load) says so on the page, not a blank one; never a throw or a reload', async () => {
  const link = new SyntaxError('The requested module \'./game.js\' does not provide an export named \'storedPar\'');
  const w = win();
  assert.equal(start(w, () => Promise.reject(link)), 'game');
  await settle();
  const $ = (x, id) => x.document.getElementById(id);
  assert.equal($(w, 'updated').querySelector('h1').textContent, UPDATED, 'a mix that cannot link is an update');
  assert.equal($(w, 'updated').title, link.message);
  // the network, or a fault: it could not load, in the error's words
  const net = win();
  start(net, () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: ' + SITE + 'app/boot.js')));
  await settle();
  assert.equal($(net, 'updated').querySelector('h1').textContent, NOT_LOADED);
  assert.match($(net, 'updated').querySelector('p').textContent, /^Failed to fetch dynamically imported module/);
  const sync = win();
  assert.doesNotThrow(() => start(sync, () => { throw new Error('boom'); }));
  assert.equal($(sync, 'updated').querySelector('p').textContent, 'boom');
  // PLAY ANYWAY on the landing page loads the same way
  const small = Object.assign(win(), {innerWidth: 1100});
  assert.equal(start(small, () => Promise.reject(link)), 'landing');
  $(small, 'landing-play').click();
  await settle();
  assert.equal($(small, 'updated').querySelector('h1').textContent, UPDATED);
  for (const x of [w, net, sync, small]) assert.equal(x.reloads, 0);
  // a load that works draws nothing
  const ok = win();
  start(ok, () => Promise.resolve({}));
  await settle();
  assert.equal($(ok, 'updated'), null);
});

test('F-9: while it plays, a live build that moved on shows a quiet note, once; a check that fails or agrees says nothing', async () => {
  for (const [why, fetch] of [['offline', null], ['a 404', () => Promise.resolve({ok: false, status: 404})],
    ['not JSON', () => Promise.resolve({ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token <'))})],
    ['no build', answer({})], ['this build', answer({build: BUILD})]]) {
    const w = win({fetch});
    watchLive(w);
    await settle();
    assert.deepEqual(w.calls, [[VERSION_FILE, 'no-store']], why + ': one check, past the cache');
    assert.equal(w.document.getElementById('build-note'), null, why + ' says nothing');
  }
  // at most one check a minute, and only when the tab comes back
  let t = 0, live = BUILD;
  const w = win({fetch: () => answer({build: live})(), entries: [SITE + 'app/boot.js']}), doc = w.document;
  const focus = doc.activeElement;
  watchLive(w, () => t);
  const back = async state => { doc.visibilityState = state; doc.dispatch('visibilitychange'); await settle(); };
  await back('visible');
  t += CHECK_MS - 1;
  await back('visible');
  assert.equal(w.calls.length, 1, 'within a minute of the last');
  t += 1;
  await back('hidden');
  assert.equal(w.calls.length, 1, 'a tab going away asks nothing');
  live = '2026-10-20';
  await back('visible');
  assert.deepEqual(w.calls[1], [VERSION_FILE, 'no-store']);
  // the site moved on: the note, quietly, and the files fetched again for the refresh
  const n = doc.getElementById('build-note');
  assert.equal(n.querySelector('span').textContent, LATER);
  assert.equal(n.getAttribute('role'), 'status', 'polite, never an alert');
  assert.equal(doc.activeElement, focus, 'it takes no focus');
  assert.deepEqual(w.calls.slice(2), [[SITE + 'next.html?date=2026-10-16', 'reload'], [SITE + 'app/boot.js', 'reload']]);
  t += CHECK_MS;
  await back('visible');
  assert.equal(w.calls.length, 4, 'told once: no more checks');
  n.querySelector('button').click();
  assert.equal(doc.getElementById('build-note'), null, '✕ puts it away');
  assert.equal(w.reloads, 0);
});

test('F-9: the real page boots on one release, and told the live site moved on, shows the note and plays on', async () => {
  const doc = makeDocument(NEXT), calls = [];
  let raf = null;
  const restore = installGlobals({document: doc, location: {search: '?seed=7', href: SITE + 'next.html?seed=7'}, requestAnimationFrame: cb => { raf = cb; return 1; },
    devicePixelRatio: 1, localStorage: null, fetch: (u, o) => { calls.push([String(u), o && o.cache]); return answer({build: BUILD + '.2'})(); }});
  try {
    const {handle} = await import(pathToFileURL(join(ROOT, 'app/boot.js')).href + '?f9');   // (a second boot.js: this one boots)
    assert.ok(handle && handle.game, 'the game started');
    await settle();
    assert.deepEqual(calls[0], [VERSION_FILE, 'no-store'], 'it asked at boot');
    assert.equal(doc.getElementById('build-note').querySelector('span').textContent, LATER);
    assert.equal(doc.getElementById('updated'), null);
    doc.getElementById('btn-take').click();
    let t = 0;
    for (let i = 0; i < 3; i++) { t += 16.7; const cb = raf; raf = null; cb(t); }
    assert.equal(handle.game.phase, 'play', 'the desk is taken as ever');
    assert.deepEqual(handle.mods.errors, []);
  } finally {
    restore();
  }
});

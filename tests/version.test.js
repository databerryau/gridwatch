// W6, F-9: version coherence. Pages caches each file for 10 minutes, so after a deploy a browser can hold files from two
// releases. Eight modules keep a copy of app/build.js's BUILD (app/boot.js CARRIED), and version.json is the live one: a
// release bump that misses a copy fails here. A forced mismatch shows "GRIDWATCH was updated — refresh to continue" in
// place of the game, and never throws or reloads; a load that cannot link says so too (app/start.js). While the page
// plays, a live build that moved on shows a quiet note once, and a check that fails says nothing. F-9 review: the page
// boots through the gate (app/boot.js boot), the modules it loads on demand (app/build.js LATE) are fetched again with the
// rest, one of them that cannot link says so (the end card at boot, stopping the game), and the note sits clear of the
// map's labels. Every case is a stand-in window but the two that boot the real page.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join, relative, sep} from 'node:path';
import {makeDocument, installGlobals} from './lib/dom.js';
import {jsFiles, tokenize} from './lib/js-tokens.js';
import {firstVisit, moduleClosure} from '../tools/perf.mjs';
import {BUILD, VERSION_FILE, CHECK_MS, UPDATED, UPDATED_WHY, NOT_LOADED, LATER, LATE, gate, late, early, watchLive} from '../app/build.js';
import {start} from '../app/start.js';
import {scaleFor, PLANTS, SUBURBS} from '../render/mapdata.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const rel = p => relative(ROOT, p).split(sep).join('/');
const NEXT = read('next.html');
const SITE = 'https://databerryau.github.io/gridwatch/';
const settle = () => new Promise(r => setImmediate(r));
const answer = body => () => Promise.resolve({ok: true, json: async () => body});
// LATE's URLs as app/build.js makes them (in the page, the site's; here, the repo's files)
const lateUrls = () => LATE.map(p => pathToFileURL(join(ROOT, p)).href);
const LINK = new SyntaxError('The requested module \'./week.js\' does not provide an export named \'weekLine\'');

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
  assert.deepEqual(w.calls.slice(2, 4), [[SITE + 'next.html?date=2026-10-16', 'reload'], [SITE + 'app/boot.js', 'reload']]);
  assert.deepEqual(w.calls.slice(4), lateUrls().map(u => [u, 'reload']), 'and every module the page loads on demand, loaded yet or not');
  t += CHECK_MS;
  await back('visible');
  assert.equal(w.calls.length, 4 + LATE.length, 'told once: no more checks');
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

test('F-9 review: app/boot.js boots through the gate: a carrier from another release shows UPDATED and starts no game, loads no end card, asks no live build', async () => {
  const {boot, CARRIED, LOAD} = await import('../app/boot.js');
  const w = win({entries: [SITE + 'app/boot.js']}), loads = [];
  const load = Object.fromEntries(Object.keys(LOAD).map(k => [k, () => { loads.push(k); return Promise.resolve({}); }]));
  assert.equal(boot(w, Object.assign({}, CARRIED, {'app/score.js': {BUILD: '2026-10-01'}}), load), null, 'no game');
  await settle();
  const b = w.document.getElementById('updated');
  assert.equal(b && b.querySelector('h1').textContent, UPDATED, 'the page that ships says so');
  assert.match(b.title, /app\/score\.js/);
  assert.equal(w.document.getElementById('stack-slot'), null, 'no desk was mounted');
  assert.deepEqual(loads, []);
  assert.ok(!w.calls.some(c => c[0] === VERSION_FILE), 'no live check');
  assert.equal(w.reloads, 0);
});

test('F-9 review: LATE is every module the page loads on demand, and app/boot.js hands app/shell.js each through late (a refresh refetches them with the rest)', async () => {
  const first = new Set(firstVisit('next.html').map(f => f.path)), found = new Set(), seen = new Set();
  for (const dir of ['app', 'desk', 'render', 'content', 'audio']) {
    for (const f of jsFiles(join(ROOT, dir))) {
      const toks = tokenize(readFileSync(f, 'utf8'));
      toks.forEach((t, k) => {
        if (t.type !== 'ident' || t.text !== 'import' || !toks[k + 1] || toks[k + 1].text !== '(' || !toks[k + 2] || toks[k + 2].type !== 'str') return;
        const target = rel(join(dirname(f), toks[k + 2].text.slice(1, -1)));
        if (seen.has(target)) return;
        seen.add(target);
        for (const m of moduleClosure(target)) if (!first.has(m.path)) found.add(m.path);   // (and what it brings)
      });
    }
  }
  assert.deepEqual([...LATE].sort(), [...found].sort(), 'app/build.js LATE');
  // every module app/shell.js takes on demand comes from app/boot.js's LOAD, so through late (the end card through early)
  const {LOAD} = await import('../app/boot.js');
  assert.deepEqual([...new Set([...read('app/shell.js').matchAll(/\blazy\(o\.(\w+),/g)].map(m => m[1]))].sort(), Object.keys(LOAD).sort(), 'LOAD');
  const src = read('app/boot.js');
  for (const k of Object.keys(LOAD)) assert.match(src, new RegExp('\\b' + k + ': (late|early)\\(win, load\\.' + k + '\\b'), k + ' through late');
});

test('F-9 review: a module loaded on demand that cannot link (another release\'s) says UPDATED and fetches the files again; the network says nothing', async () => {
  // on first use (the help, the alarm panel, the suburb card): UPDATED in the note while the game plays on; the shell gets the
  // error and says what could not be loaded
  const w = win();
  await assert.rejects(late(w, () => Promise.reject(LINK))(), LINK);
  const n = w.document.getElementById('build-note');
  assert.equal(n.querySelector('span').textContent, UPDATED);
  assert.equal(w.document.getElementById('updated'), null, 'no game stopped');
  await settle();
  assert.equal(w.calls[0][0], SITE + 'next.html?date=2026-10-16');
  assert.deepEqual(w.calls.slice(1).map(c => c[0]), lateUrls(), 'the page, then every module loaded on demand, past the cache');
  watchLive(Object.assign(w, {fetch: answer({build: '2026-10-20'})}));
  await settle();
  assert.equal(n.querySelector('span').textContent, UPDATED, 'a later LATER never softens it');
  // the network, or a module that loads: nothing drawn or fetched
  const off = win(), net = new TypeError('Failed to fetch dynamically imported module');
  await assert.rejects(late(off, () => Promise.reject(net))(), net);
  const M = {createEndCard() {}};
  assert.equal(await late(off, () => Promise.resolve(M))(), M);
  await settle();
  assert.deepEqual([off.document.getElementById('build-note'), off.calls], [null, []]);
  // early: it loads at once, once; after the network failed it, the day's end asks again
  let k = 0;
  const e = early(win(), () => { k++; return Promise.resolve(M); }, () => null);
  assert.equal(k, 0, '(a microtask on: after the boot)');
  await settle();
  assert.equal(k, 1, 'at boot');
  assert.deepEqual([await e(), await e(), k], [M, M, 1]);
  let j = 0;
  const again = early(win(), () => (j++ ? Promise.resolve(M) : Promise.reject(net)), () => assert.fail('the network stops no game'));
  await settle();
  assert.deepEqual([await again(), j], [M, 2]);
});

test('F-9 review: the real page loads its end card at boot, and one from another release stops the game there, under UPDATED', async () => {
  const doc = makeDocument(NEXT);
  let raf = null, asked = 0;
  const restore = installGlobals({document: doc, location: {search: '?seed=7', href: SITE + 'next.html?seed=7'}, requestAnimationFrame: cb => { raf = cb; return 1; },
    devicePixelRatio: 1, localStorage: null, fetch: () => answer({build: BUILD})()});
  try {
    const {boot, LOAD} = await import('../app/boot.js');
    const h = boot(globalThis, undefined, Object.assign({}, LOAD, {endCard: () => { asked++; return Promise.reject(LINK); }}));
    assert.ok(h && h.game, 'the game started');
    assert.equal(doc.getElementById('updated'), null);
    await settle();
    assert.equal(asked, 1, 'at boot, not at 21:00');
    const b = doc.getElementById('updated');
    assert.equal(b && b.querySelector('h1').textContent, UPDATED, 'before the day is played');
    assert.equal(b.title, LINK.message);
    assert.equal(doc.activeElement, b, 'it takes the focus');
    // the game under it is stopped: no frame, no key (Enter would take the desk)
    const cb = raf;
    raf = null;
    if (cb) cb(16.7);
    assert.equal(raf, null, 'the frame loop stopped');
    doc.dispatch('keydown', {key: 'Enter'});
    assert.equal(h.game.phase, 'briefing');
    assert.equal(doc.getElementById('build-note'), null, 'the banner, not the note');
  } finally {
    restore();
  }
});

test('F-9 review: the note is one line at the top centre of the map, clear of every plant\'s and suburb\'s label (an alarm\'s too) at every desk size', async () => {
  const w = win({fetch: answer({build: '2026-10-20'})});
  watchLive(w);
  await settle();
  assert.ok(w.document.getElementById('build-note'));
  const css = w.document.getElementById('build-css').textContent;
  const rule = sel => { const m = new RegExp(sel + '\\{([^}]*)\\}').exec(css); assert.ok(m, sel); return m[1]; };
  const note = rule('#build-note'), x = rule('#build-note button');
  // its height: one line, unless the ✕ keeps next.html's button height
  assert.match(NEXT, /button \{[^}]*min-height: 24px/);
  const h = Math.max(+(/font:[^;]*\/(\d+)px/.exec(note) || [0, 20])[1], /min-height:0\b/.test(x) ? 0 : 24) + 2;
  assert.ok(h <= 18, 'one line: ' + h + ' px');
  // its width: its longer words in 11 px monospace (at most 0.62 em a character), the ✕ and the padding
  const width = (Math.max(LATER.length, UPDATED.length) + 1) * 11 * 0.62 + 30;
  const top = +/top:calc\(var\(--hdr,32px\) \+ (\d+)px\)/.exec(note)[1], right = /(?:^|;)right:(\d+)px/.exec(note);
  const centred = /left:50%/.test(note) && /translateX\(-50%\)/.test(note);
  assert.ok(centred || right, 'placed');
  for (const W of [1280, 1366, 1440, 1536, 1600, 1680, 1920, 2560]) {
    for (const H of [600, 608, 625, 656, 680, 720, 768, 800, 900, 1080, 1440]) {
      // next.html: the header, the map (the rest) and the desk, max(300 px, half of what is below the header)
      const hdr = W >= 1600 ? 40 : 32, L = scaleFor(W, H - hdr - Math.max(300, (H - hdr) / 2));
      const x0 = centred ? W / 2 - width / 2 : W - +right[1] - width, box = [x0, hdr + top, x0 + width, hdr + top + h];
      // render/map.js draws a label 14 px tall, its bottom at max(16, the box's top), its middle over the box, inside the map
      for (const [name, b, text] of [...PLANTS.map(p => [p.label, p.box, p.label]), ...SUBURBS.map(s => [s.name, s.box, s.name.toUpperCase() + ': 4 DARK (2 BACK 14:05, 14:20)'])]) {
        const lw = (text.length + 2) * 7 + 20, mid = Math.max(lw / 2, Math.min(W - lw / 2, L.dx + (b[0] + b[2] / 2) * L.scale));
        const y = hdr + Math.max(16, L.dy + (b[1] - L.srcY) * L.scale), lab = [mid - lw / 2, y - 14, mid + lw / 2, y];
        assert.ok(lab[2] <= box[0] || box[2] <= lab[0] || lab[3] <= box[1] || box[3] <= lab[1], W + 'x' + H + ': the note hides ' + name + '\'s label');
      }
    }
  }
});

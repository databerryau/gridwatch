// The "?" rule (SPEC Q-47, desk/README.md §30.5): the press that opened a help closes it, nothing
// a "?" opens covers that "?", and every help shows how to close it. Three kinds of "?": the
// shell's badges (inline in the header and the cards, floating over the desk, the stack and the
// map while the drawer is open) open #popover; #btn-help opens the drawer; the desk's own "?"
// (q-dial, q-imb, q-gauge) and the annunciator's tiles show a note on their panel. Esc closes
// the top-most first (the shell's closeTop, then the desk's closeHelp).
//
// Headless (CLAUDE.md): the shell alone on next.html for the badges and the drawer (the stand-in
// DOM has no layout: the tests set the rects and sizes that matter), a desk alone with a clock
// the test moves for the notes, and one sampled game (tests/lib/play.js) for Esc in play.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {openGame} from './lib/play.js';
import {bootGame, popoverPlace, layoutSizes} from '../app/shell.js';
import {createDesk} from '../desk/desk.js';
import {createState, observe} from '../sim/step.js';
import {CLASSIC} from '../content/scenarios.js';
import {TEXT} from '../content/text.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');

// The shell alone (the header's badges, and #map's floating one); `prep(doc)` runs before the
// first frame. frame(): one frame 0.6 s on (the badges are placed every 0.5 s).
function boot(prep) {
  const doc = makeDocument(NEXT), clock = {t: 0};
  if (prep) prep(doc);
  const h = bootGame(doc, {search: '?seed=7', storage: null, audioWin: {}, raf: false, now: () => clock.t, text: {TEXT}});
  const frame = () => { clock.t += 600; h.frame(1 / 60); };
  frame();
  const key = k => doc.dispatch('keydown', {key: k});
  return {doc, h, frame, key, $: id => doc.getElementById(id), q: id => doc.querySelectorAll('button.q').find(x => x.dataset.anchor === id)};
}
const open = e => [e.getAttribute('aria-expanded'), e.classList.contains('on')];

test('Q-47: a header "?" opens its popover and the same press closes it; another "?" swaps; aria-expanded and the .on look follow; the ✕ closes; a "?" closes SETTINGS like any outside click', () => {
  const {h, $, q} = boot();
  const clock = q('clock'), cost = q('chip-cost');
  assert.ok(clock.classList.contains('inline') && $('hdr').contains(clock), 'inline in the header');
  assert.equal(clock.getAttribute('aria-controls'), 'popover');
  assert.deepEqual(open(clock), ['false', false]);
  clock.click();
  assert.equal($('popover').hidden, false);
  assert.deepEqual(open(clock), ['true', true]);
  clock.click();
  assert.equal($('popover').hidden, true, 'the press that opened it closes it');
  assert.deepEqual(open(clock), ['false', false]);
  clock.click();
  cost.click();
  assert.equal($('popover').hidden, false, 'another "?" swaps to its own text');
  assert.match($('popover').textContent, /^CUSTOMER COST is the resource cost of serving/);
  assert.deepEqual([open(clock), open(cost)], [['false', false], ['true', true]]);
  assert.equal($('btn-pop-close').getAttribute('aria-label'), 'Close');
  $('btn-pop-close').click();
  assert.equal($('popover').hidden, true, 'its ✕ closes it');
  assert.deepEqual(open(cost), ['false', false]);
  h.actions.ui({do: 'settings', on: true});
  cost.click();
  assert.equal(h.game.ui.settingsOpen, false, 'no stopPropagation: the "?" click closed SETTINGS');
  assert.equal($('popover').hidden, false);
});

test('Q-47: the popover opens below its "?" when it fits, else on the roomier side, scrolling there; never over its "?", always 8 px inside the viewport', () => {
  const r = (left, top) => ({left, top, right: left + 24, bottom: top + 24});
  assert.deepEqual(popoverPlace(r(500, 4), 400, 200, 1280, 720), {left: 300, top: 32, bottom: null, maxHeight: 680}, 'fits below');
  assert.deepEqual(popoverPlace(r(500, 600), 400, 300, 1280, 720), {left: 300, top: null, bottom: 124, maxHeight: 588}, 'above, 4 px over its "?"');
  assert.deepEqual(popoverPlace(r(500, 200), 400, 900, 1280, 720), {left: 300, top: 228, bottom: null, maxHeight: 484}, 'fits neither: below, the roomier');
  assert.equal(popoverPlace(r(20, 4), 400, 100, 1280, 720).left, 8, 'clamped at the left edge');
  assert.equal(popoverPlace(r(1250, 4), 400, 100, 1280, 720).left, 872, 'and at the right');
  for (let top = 0; top <= 576; top += 16) {
    for (const h of [40, 260, 900]) {
      const a = r(600, top), p = popoverPlace(a, 400, h, 1280, 600), tall = Math.min(h, p.maxHeight);
      const y0 = p.top !== null ? p.top : 600 - p.bottom - tall, y1 = y0 + tall;
      assert.ok(y1 <= a.top || y0 >= a.bottom, 'over its "?" at ' + top + ', ' + h);
      assert.ok(y0 >= 8 && y1 <= 592 && p.maxHeight > 0, 'outside the viewport at ' + top + ', ' + h);
      if (h === 40) assert.equal(p.top !== null, 600 - a.bottom - 12 >= h || 600 - a.bottom >= a.top, 'below whenever it fits');
    }
  }
  // through the shell: the "?"'s rect, the popover's own height and the viewport
  const {doc, $, q} = boot();
  Object.assign(doc.documentElement, {clientWidth: 1280, clientHeight: 600});
  const mute = q('btn-mute'), s = $('popover').style;
  mute.rect = {left: 1100, top: 4, width: 24, height: 24};
  $('popover').clientHeight = 900;
  mute.click();
  assert.deepEqual([s.left, s.top, s.bottom, s.maxHeight], ['872px', '32px', 'auto', '560px']);
  mute.click();
  mute.rect = {left: 1100, top: 500, width: 24, height: 24};
  mute.click();
  assert.deepEqual([s.top, s.bottom, s.maxHeight], ['auto', '104px', '488px'], 'flipped above its "?"');
});

test('Q-47: the drawer has a CLOSE and takes the focus, gives it back, ignores outside clicks; ? says it is open; under 300 px an index of closed <details>; a floating "?" under it moves left and its popover goes with it', () => {
  const {doc, $, q, frame, key} = boot();
  const help = $('btn-help'), d = $('drawer');
  assert.deepEqual(['aria-haspopup', 'aria-controls', 'aria-expanded'].map(k => help.getAttribute(k)), ['dialog', 'drawer', 'false']);
  $('map').rect = {left: 0, top: 32, width: 1280, height: 330};
  d.rect = {left: 810, top: 32, width: 470, height: 270};
  frame();
  const mq = q('map');
  assert.equal(mq.style.left, '1254px', 'a floating "?" on its element\'s top-right corner');
  help.click();
  assert.equal(d.hidden, false);
  assert.deepEqual(open(help), ['true', true]);
  assert.equal(doc.activeElement.id, 'btn-drawer-close', 'the focus moves to CLOSE');
  assert.equal($('btn-drawer-close').title, 'Close (? or Esc)');
  assert.equal(mq.style.left, '2px', 'under the open drawer: its element\'s top-left');
  const dets = d.querySelectorAll('details');
  assert.equal(dets.length, TEXT.abstractions.length);
  assert.ok(dets.every(x => !x.open), 'the stand-in drawer is 120 px tall: every article a closed <details>');
  assert.deepEqual([dets[0].children[0].tagName, dets[0].children[0].textContent], ['SUMMARY', TEXT.abstractions[0].row]);
  mq.click();
  doc.body.dispatch('click');
  assert.equal(d.hidden, false, 'an outside click does not close the drawer');
  mq.click();
  assert.equal($('popover').hidden, false);
  $('btn-drawer-close').click();
  assert.equal(d.hidden, true);
  assert.equal($('popover').hidden, true, 'the popover of a badge that went with the drawer');
  assert.deepEqual(open(help), ['false', false]);
  assert.equal(doc.activeElement.id, 'btn-help', 'the focus comes back to the "?" (the page had it)');
  // a tall drawer shows every article; ? and Esc open and close it, the focus back where it was
  d.clientHeight = 400;
  $('btn-mute').focus();
  key('?');
  assert.ok(d.querySelectorAll('details').every(x => x.open), 'from 300 px: open');
  assert.equal(doc.activeElement.id, 'btn-drawer-close');
  key('Escape');
  assert.equal(d.hidden, true);
  assert.equal(doc.activeElement.id, 'btn-mute');
});

test('Q-47: an inline "?" in a card shows only while its element does, and goes back after it when the card is rebuilt', () => {
  const {doc, $, q, frame} = boot(doc => doc.getElementById('briefing-card').appendChild(doc.getElementById('chip-co2')));
  const card = $('briefing-card'), co2 = q('chip-co2');
  assert.ok(co2.classList.contains('inline') && card.children.indexOf(co2) === card.children.indexOf($('chip-co2')) + 1, 'right after its element');
  $('chip-co2').hidden = true;
  frame();
  assert.equal(co2.hidden, true, 'hidden with its element');
  $('chip-co2').hidden = false;
  frame();
  assert.equal(co2.hidden, false);
  const fresh = doc.createElement('span');
  fresh.id = 'chip-co2';
  card.replaceChildren(fresh);
  assert.equal(co2.isConnected, false);
  frame();
  assert.ok(card.children[0] === fresh && card.children[1] === co2, 're-inserted after the rebuilt element');
});

// A desk alone, its clock the vm's frame time.
function deskAlone() {
  const doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  const desk = createDesk(doc, root, {input: () => '', ui() {}, redispatch: () => '', previewTrip: () => null, restorePreview: () => ''});
  const vm = baseVm(observe(createState(7, CLASSIC)));
  const at = ms => desk.update(Object.assign({}, vm, {frame: {nowMs: ms, dtS: 1 / 60, alpha: 0}}));
  at(1000);
  const $ = id => doc.getElementById(id);
  return {desk, at, $, shows: host => { const n = $(host).querySelector('.dk-note'); return !!n && !n.hidden; }};
}
const HOSTS = {'q-dial': 'dial-freq', 'q-imb': 'bar-imbalance', 'q-gauge': 'gauge-n1'};
const face = q => [q.textContent, ...open(q)];

test('Q-47: a desk "?" shows its note and the same press hides it; it reads ✕ with the .on look meanwhile; aria-expanded follows, on expiry too; a "?" note stays 0.3 s a word; desk.closeHelp hides the newest', () => {
  const {desk, at, $, shows} = deskAlone();
  for (const [id, host] of Object.entries(HOSTS)) {
    const q = $(id);
    assert.deepEqual(face(q), ['?', 'false', false], id);
    q.click();
    assert.ok(shows(host));
    assert.deepEqual(face(q), ['✕', 'true', true], id + ' while its note shows');
    q.click();
    assert.ok(!shows(host), id + ': the second press hides it');
    assert.deepEqual(face(q), ['?', 'false', false]);
  }
  // 0.3 s a word: the balance bar's ~70 words stay 21 s, not the 8 s its press asks for
  const q = $('q-imb'), words = q.title.split(' ').length;
  assert.ok(words * 300 > 8000);
  at(10000);
  q.click();
  at(18100);
  assert.ok(shows('bar-imbalance'), 'still up after 8 s');
  at(10000 + words * 300 + 100);
  assert.ok(!shows('bar-imbalance'), 'gone after 0.3 s a word');
  assert.deepEqual(face(q), ['?', 'false', false], 'and its "?" says so');
  // hidden from outside (a test's quiet()): its "?" follows on the next frame, and the next press shows it again
  $('q-dial').click();
  $('dial-freq').querySelector('.dk-note').hidden = true;
  at(40000);
  assert.deepEqual(face($('q-dial')), ['?', 'false', false]);
  $('q-dial').click();
  assert.ok(shows('dial-freq'), 'a press after that shows it');
  // Esc (closeHelp): the newest first, then the next; false when none shows
  $('q-gauge').click();
  assert.equal(desk.closeHelp(), true);
  assert.deepEqual([shows('gauge-n1'), shows('dial-freq')], [false, true], 'the newest first');
  assert.equal(desk.closeHelp(), true);
  assert.equal(shows('dial-freq'), false);
  assert.equal($('q-dial').textContent, '?');
  assert.equal(desk.closeHelp(), false, 'none left');
});

test('Q-47 in play (sampled): a tile\'s second press hides its note; a header "?" closes on its second press, and neither reads as a silent press; Esc closes popover, SETTINGS, drawer, alarm panel, then the desk note', () => {
  const p = openGame({seed: 20261007});
  const lite = {after: 1 / 60, look: {controls: false}};
  let r = p.press('tile-n1', {after: 1 / 60});
  assert.match(r.after, /^NOTE blue annunciator: N-1 INSECURE/m);
  assert.match(r.after, /tile-n1 "[^"]*" \[open/, 'the driver reads the tile as open');
  r = p.press('tile-n1', {after: 1 / 60});
  assert.doesNotMatch(r.after, /^NOTE blue annunciator: N-1/m, 'the second press hides it');
  assert.match(r.diff, /tile-n1 "[^"]*"(?! \[open)/, 'and that is no silent press');
  assert.match(r.after, /^ALARMS open: N-1 INSECURE/m, 'and opens the alarm panel at that tile (§30.4)');
  p.key('w');
  p.click('tile-n1');
  p.click('tile-rocof');
  assert.deepEqual(['tile-n1', 'tile-rocof'].map(id => p.$(id).getAttribute('aria-expanded')), ['false', 'true'], 'another tile\'s note takes the note\'s place');
  p.click('tile-rocof');
  p.key('w');
  const clock = p.doc.querySelector('button.q[data-anchor="clock"]');
  p.press(clock, lite);
  r = p.press(clock, {after: 1 / 60});
  assert.doesNotMatch(r.after, /^POPOVER /m);
  assert.match(r.diff, /q:clock "\?"/, 'its close shows in the look');
  // five helps open at once, top-most last: the desk's "?" note, W, ? (drawer), a floating "?", `,`
  p.click('q-gauge');
  p.key('w');
  p.click('btn-help');
  p.click(p.doc.querySelector('button.q[data-anchor="lever-coal"]'));
  p.key(',');
  const want = [/^POPOVER /m, /^SETTINGS open$/m, /^DRAWER open$/m, /^ALARMS open: /m, /^NOTE blue gauge-n1: /m];
  for (const re of want) assert.match(p.look({controls: false}), re);
  for (let i = 0; i < want.length; i++) {
    r = p.pressKey('Escape', {}, lite);
    assert.doesNotMatch(r.after, want[i], 'Esc ' + (i + 1) + ' closes ' + want[i]);
    for (const re of want.slice(i + 1)) assert.match(r.after, re, 'Esc ' + (i + 1) + ' leaves ' + re);
  }
  assert.equal(p.$('q-gauge').textContent, '?');
  assert.equal(p.h.closeTop(), false, 'nothing left: the next Esc goes on to the map, the stack or the watch');
  assert.deepEqual(p.h.mods.errors, []);
});

test('Q-47 CSS: the drawer runs from under the header to 9 px above the plan bar; CLOSE and the popover\'s ✕ stay in view; an open "?" looks pressed; a desk "?" stays over its note', () => {
  assert.match(NEXT, /#drawer \{ position: fixed; z-index: 15; top: var\(--hdr\); bottom: calc\(var\(--desk-h\) \+ var\(--planbar-h\) \+ 9px\); right: 0; width: min\(470px, 40vw\);/);
  assert.match(NEXT, /--planbar-h: 58px;/);
  assert.match(NEXT, /#drawer \.top \{ position: sticky; top: 0;/);
  assert.match(NEXT, /#popover \{[^}]*overflow-y: auto;/);
  assert.match(NEXT, /#popover \.x \{ float: right; position: sticky; top: 0;/);
  assert.match(NEXT, /#popover \.x::before \{ content: '✕'; \}/);
  assert.match(NEXT, /\.q\.on \{ background: #1f6feb55; border-color: var\(--blue\); color: var\(--bright\); \}/);
  assert.match(NEXT, /\.dk-q\.on \{ z-index: 6; \}/);
  assert.match(NEXT, /body:not\(\.q-on\) #q-layer \{ display: none; \}/);
  // its height (K-17 sizes): an index at 1280 × 600 and 1280 × 720, every article open at 1920 × 1080
  const tall = (w, h) => { const s = layoutSizes(w, h); return h - s.header - s.desk - 58 - 9; };
  assert.deepEqual([tall(1280, 600), tall(1280, 720), tall(1920, 1080)], [201, 277, 453]);
});

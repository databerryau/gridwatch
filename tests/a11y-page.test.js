// The page's accessibility (K-22, K-23; the 2026-10-17 audit's page items), headless (CLAUDE.md): the colours that carry
// words read at 4.5:1 (WCAG 1.4.3), computed from next.html's tokens; the briefing's AGC/HAND is a radio group the keyboard
// can pick from (WCAG 2.1.1), and Enter anywhere else still takes the desk (D-3).
//
// The stand-in DOM (tests/lib/dom.js) runs no browser default: a key on a focused button never clicks it here, so a key the
// page used is one it preventDefault-ed (a browser then fires no click either), and its effect is the page's own.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {openGame} from './lib/play.js';
import {bootGame} from '../app/shell.js';
import * as G from '../app/game.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
const TODAY = new Date(2026, 9, 16), PAR = {score: {costDollars: 4e6, lightsMWh: 0, servedMWh: 1e5, co2tPerMWh: 0.56, centsPerKWh: 4}, series: []};

/** A localStorage stand-in holding `init` (each value as JSON). */
function store(init = {}) {
  const mem = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
}
/** The shell alone on next.html at the briefing (no desk, map or stack); shifts: the shifts this browser has finished (D-7: HAND from 1). */
function briefing(shifts = 2) {
  const doc = makeDocument(NEXT), clock = {t: 1000};
  const h = bootGame(doc, {search: '?seed=20261007', scenario: G.scenarioForSeed, storage: shifts ? store({[G.SEEN_KEY]: {shifts}}) : null,
    audioWin: {}, raf: false, now: () => clock.t});
  h.frame(1 / 60);
  const $ = id => doc.getElementById(id);
  /** A key down and up on the focused element, then a frame; returns the keydown event. */
  const key = k => { const ev = doc.dispatch('keydown', {key: k}); doc.dispatch('keyup', {key: k}); clock.t += 17; h.frame(1 / 60); return ev; };
  return {doc, h, game: h.game, $, key, clock, focus: () => doc.activeElement.id || doc.activeElement.tagName};
}

// ------------------------------------------------------------------ contrast (K-22, WCAG 1.4.3)

/** next.html's :root tokens: {name: '#rrggbb'}. */
const TOKENS = Object.fromEntries([.../:root \{([^}]*)\}/.exec(NEXT)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2]]));
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** WCAG's contrast ratio of two #rrggbb colours. */
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('K-22: every colour next.html sets on words reads at 4.5:1 or more on each panel (--faint too); the URGENT badge\'s white on red as well', () => {
  const used = new Set([...NEXT.matchAll(/[^-]color:\s*var\(--([\w-]+)\)/g)].map(m => m[1]));
  assert.ok(used.has('faint') && used.has('dim') && used.has('red'), [...used].join(' '));
  for (const name of used) {
    for (const bg of ['bg', 'panel', 'panel2']) {
      const r = ratio(TOKENS[name], TOKENS[bg]);
      assert.ok(r >= 4.5, '--' + name + ' ' + TOKENS[name] + ' on --' + bg + ': ' + r.toFixed(2) + ':1');
    }
  }
  assert.equal(TOKENS['faint-line'], '#6e7781', 'a border keeps the old grey');
  assert.match(NEXT, /#rate-badge\.ALARMS \{[^}]*border-color: var\(--faint-line\)/);
  assert.doesNotMatch(NEXT, /(border|background)[\w-]*:[^;]*var\(--faint\)/, 'no border or fill on --faint: it is the words\' grey');
  const [, badge] = /#objective\.crit b \{[^}]*background: (#[0-9a-f]{6});/.exec(NEXT);
  assert.ok(ratio(TOKENS.bright, badge) >= 4.5, '‼ URGENT: ' + ratio(TOKENS.bright, badge).toFixed(2) + ':1');
});

// ------------------------------------------------------------------ the briefing's radios (K-23, WCAG 2.1.1)

test('K-23: AGC/HAND is a radio group with one Tab stop: the arrows move the pick and the focus; Enter or Space picks the one not picked, the desk not taken', () => {
  const b = briefing(), mode = () => b.game.state.control.mode, tabs = () => ['btn-agc', 'btn-hand'].map(id => b.$(id).getAttribute('tabindex'));
  assert.equal(b.$('btn-hand').hidden, false, 'a returning player: HAND is offered (D-7)');
  const group = b.$('btn-agc').parentElement;
  assert.deepEqual([group.getAttribute('role'), group.getAttribute('aria-label'), group.querySelectorAll('button').map(x => x.id)],
    ['radiogroup', 'Regulation', ['btn-agc', 'btn-hand']], 'the group holds the two radios only (not TAKE THE DESK)');
  assert.deepEqual(tabs(), ['0', '-1'], 'the picked radio is the group\'s one Tab stop');
  b.$('btn-agc').focus();
  let ev = b.key('ArrowRight');
  assert.deepEqual([mode(), b.focus(), b.$('btn-hand').getAttribute('aria-checked'), tabs(), b.game.phase], ['HAND', 'btn-hand', 'true', ['-1', '0'], 'briefing']);
  assert.equal(ev.defaultPrevented, true, 'the arrow is the radios\', never the desk\'s');
  b.key('ArrowLeft');
  assert.deepEqual([mode(), b.focus(), tabs()], ['AGC', 'btn-agc', ['0', '-1']]);
  b.key('ArrowUp');
  assert.deepEqual([mode(), b.focus()], ['HAND', 'btn-hand'], 'the arrows wrap');
  b.key('ArrowDown');
  assert.equal(mode(), 'AGC');
  // the audit's case: Enter on a focused HAND (not picked) picks HAND and leaves the briefing up
  b.$('btn-hand').focus();
  ev = b.key('Enter');
  assert.deepEqual([mode(), b.game.phase, b.$('briefing-card').hidden, b.focus()], ['HAND', 'briefing', false, 'btn-hand']);
  assert.equal(ev.defaultPrevented, true, 'so a browser fires no click on top');
  // Space on the one not picked picks it too: no pause answer, the focus kept
  b.$('btn-agc').focus();
  ev = b.key(' ');
  assert.deepEqual([mode(), b.focus(), ev.defaultPrevented, b.$('toast').hidden], ['AGC', 'btn-agc', true, true]);
  // on the one picked, Space answers as on the rest of the card (Q-41), and Enter takes the desk, as a native radio submits its
  // form (D-3: a mouse player's click on HAND focuses it, then Enter)
  ev = b.key(' ');
  assert.deepEqual([b.$('toast').className, b.$('toast').textContent, b.game.phase], ['info', 'Take the desk first: Enter. Then Space runs the clock.', 'briefing']);
  b.$('btn-agc').focus();   // (that Space let the focus go, as everywhere)
  b.key('ArrowRight');
  assert.equal(b.focus(), 'btn-hand');
  b.key('Enter');
  assert.deepEqual([b.game.phase, mode()], ['play', 'HAND'], 'the one required press, in the mode picked');
  assert.deepEqual(b.h.mods.errors, []);
});

test('K-23: a first visit\'s briefing has AGC alone (D-7): the arrows stay on it, and Enter on TAKE THE DESK takes the desk', () => {
  const b = briefing(0);
  assert.equal(b.$('btn-hand').hidden, true);
  b.$('btn-agc').focus();
  b.key('ArrowRight');
  assert.deepEqual([b.game.state.control.mode, b.focus(), b.game.phase], ['AGC', 'btn-agc', 'briefing']);
  b.$('btn-take').focus();
  b.key('Enter');
  assert.equal(b.game.phase, 'play');
});

// ------------------------------------------------------------------ the end card and the shelf take the focus (K-23)

/** A returning player's daily (20261016) on its day, its end card up (test poke: the day over; par given). */
function dayOver() {
  const p = openGame({seed: 20261016, run: false, par: PAR, storage: store({[G.SEEN_KEY]: {shifts: 3}}), date: TODAY});
  p.$('lever-coal').focus();   // (a desk control had the keys when the day ended)
  p.game.state.over = true;
  p.frames(2);
  return p;
}
// (ids and words, never elements: a failing assert on two stand-in elements inspects the whole document)
const focusOf = p => p.doc.activeElement.id || p.doc.activeElement.tagName;

test('K-23: the end card takes the focus on its h2 (which names the dialog); the shelf opens on its first day and gives the focus back to MORE DAYS', () => {
  const p = dayOver(), card = p.$('end-card'), h2 = card.querySelector('h2');
  assert.equal(card.hidden, false);
  assert.equal(focusOf(p), 'end-title', 'the h2, not the lever (70 Tab stops before the card)');
  assert.deepEqual([h2.id, h2.getAttribute('tabindex'), card.getAttribute('aria-labelledby'), h2.textContent], ['end-title', '-1', 'end-title', 'Day over: 04:00.']);
  p.$('btn-again').focus();
  p.frames(3);
  assert.equal(focusOf(p), 'btn-again', 'once: later frames leave the focus where the player puts it');
  // MORE DAYS: the shelf opens on its first day (today's daily is on the desk: the newest past one); Esc and CLOSE give it back
  p.click('btn-shelf');
  assert.equal(p.$('shelf-card').hidden, false);
  assert.ok(p.$('shelf-card').contains(p.doc.activeElement), focusOf(p));
  assert.match(p.doc.activeElement.textContent, /^#4 Thu 15 Oct/);
  p.key('Escape');
  assert.deepEqual([p.$('shelf-card').hidden, focusOf(p)], [true, 'btn-shelf'], 'Esc: back on MORE DAYS');
  p.click('btn-shelf');
  p.click('shelf-close');
  assert.deepEqual([p.$('shelf-card').hidden, focusOf(p)], [true, 'btn-shelf'], 'CLOSE: back on MORE DAYS, not lost with the hidden CLOSE');
  // PLAY THIS DAY AGAIN hides the button pressed: the new briefing's TAKE THE DESK has the focus
  p.click('btn-again');
  assert.deepEqual([p.game.phase, focusOf(p)], ['briefing', 'btn-take']);
  assert.deepEqual(p.h.mods.errors, []);
});

test('K-23: a shelf pick lands on its briefing\'s TAKE THE DESK; the briefing\'s MORE DAYS gets the focus back from the shelf', () => {
  const p = dayOver();
  p.click('btn-shelf');
  p.click(p.$('shelf-card').querySelector('button'));   // #4, a past daily: practice
  assert.deepEqual([p.$('briefing-title').textContent, focusOf(p)], ['Daily #4 · PRACTICE', 'btn-take']);
  p.click('btn-shelf-brief');
  assert.equal(focusOf(p), 'shelf-today', 'TODAY first: another day is on the desk');
  p.key('Escape');
  assert.deepEqual([p.$('shelf-card').hidden, focusOf(p), p.game.phase], [true, 'btn-shelf-brief', 'briefing'], 'Esc never takes the desk');
  // a new day's end card takes the focus again
  p.$('btn-take').focus();
  p.key('Enter');
  assert.equal(p.game.phase, 'play');
  p.game.state.over = true;
  p.frames(2);
  assert.equal(focusOf(p), 'end-title');
  assert.deepEqual(p.h.mods.errors, []);
});

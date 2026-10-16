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
import {bootGame} from '../app/shell.js';
import * as G from '../app/game.js';

const NEXT = readFileSync(new URL('../next.html', import.meta.url), 'utf8');

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

test('K-23: AGC/HAND is a radio group with one Tab stop: the arrows move the pick and the focus, Enter or Space picks, and neither takes the desk', () => {
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
  // the audit's case: Enter on a focused HAND picks HAND and leaves the briefing up
  b.$('btn-hand').focus();
  ev = b.key('Enter');
  assert.deepEqual([mode(), b.game.phase, b.$('briefing-card').hidden, b.focus()], ['HAND', 'briefing', false, 'btn-hand']);
  assert.equal(ev.defaultPrevented, true, 'so a browser fires no click on top');
  // Enter again on the radio already picked: it answers in blue (Q-41), and still never takes the desk
  b.key('Enter');
  assert.deepEqual([b.game.phase, b.$('toast').className, b.$('toast').textContent], ['briefing', 'info', 'HAND is on. TAKE THE DESK starts the day.']);
  // Space on a radio picks it: no pause answer, the focus kept (the fallback map's Space blurs and answers "Take the desk first")
  b.$('btn-agc').focus();
  ev = b.key(' ');
  assert.deepEqual([mode(), b.focus(), ev.defaultPrevented], ['AGC', 'btn-agc', true]);
  assert.notEqual(b.$('toast').textContent, 'Take the desk first: Enter. Then Space runs the clock.');
  // D-3: Enter anywhere else takes the desk, in the mode picked
  b.key('ArrowRight');
  b.doc.activeElement.blur();
  b.key('Enter');
  assert.deepEqual([b.game.phase, mode()], ['play', 'HAND'], 'the one required press');
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

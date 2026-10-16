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
import {injectTrip} from './lib/sim-helpers.js';
import {bootGame, createLive, liveFrame, lineWords, respondWords, LIVE_GAP_MS} from '../app/shell.js';
import * as G from '../app/game.js';
import {V} from '../sim/params.js';
import {TEXT} from '../content/text.js';

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

// ------------------------------------------------------------------ the live region (K-23): the line, the RESPOND card, the score

// A vm as liveFrame reads it, in play: a line {level, kind, text, targets} (null: none), and what else shows
const vmOf = (o = {}) => ({phase: 'play', obs: {tick: 100, over: false, nightShift: false, f: {hz: 50}, sec: {level: 'SECURE'}},
  mode: {mode: o.mode || 'CRUISE', rate: 300, watchS: -1}, alarms: {tiles: []}, tray: {cards: []}, objective: o.line === undefined ? null : o.line,
  respond: o.respond || null, feeder: null, consider: o.consider || null, end: o.end || null});
const LINE = (level, kind, text, target = 'lever-gta') => ({level, kind, text, targets: target ? [target] : []});

test('K-23: the live region says what the line asks when its level, kind or first control changes: never its figures, the consider text, nor a flip back', () => {
  const L = createLive();
  let t = 0;
  const say = (o, dt = LIVE_GAP_MS) => liveFrame(L, vmOf(o), t += dt);
  const plan = LINE('plan', 'commit', 'Start GT·A by 17:40 for the evening peak. It takes ten minutes to reach the grid.');
  assert.equal(say({line: plan}), null, 'the first frame only takes note');
  assert.equal(say({line: LINE('act', 'commit', 'Start GT·A now: the evening peak needs 120 MW more by 17:50. It takes ten minutes to reach the grid.')}),
    'ACT NOW: Start GT·A now: the evening peak needs 120 MW more by 17:50.', 'a new level: its word (no glyph) and its lead sentence');
  assert.equal(say({line: LINE('act', 'commit', 'Start GT·A now: 120 MW short by 17:50. It takes ten minutes.')}), null, 'new figures, the same ask: nothing');
  assert.equal(say({line: LINE('act', 'commit', 'Start GT·A now: 130 MW short by 17:55.'), consider: {target: 'guard-start-gta1', text: 'Pressed: GT·A would…', level: 'ok'}}),
    null, 'C-10\'s consider text is the line\'s place on the screen, never said');
  assert.equal(say({line: LINE('plan', 'battery', 'The battery is at 74%. Charge it at 70 MW now, to be full by 15:30: tonight\'s peak will want it.', 'dial-battery')}),
    'BATTERY: The battery is at 74%. Charge it at 70 MW now, to be full by 15:30: tonight\'s peak will want it.', 'a short first sentence takes the next (LEAD words)');
  // the audit's 11:10-11:58 flip: BATTERY and ACT NOW inside one gap say nothing new
  const act = LINE('act', 'spare', 'If your biggest unit tripped now, frequency would fall to 49.07 Hz: too low to be secure.', 'gauge-n1');
  assert.equal(say({line: act}, 100), null, 'inside the gap');
  assert.equal(say({line: LINE('plan', 'battery', 'The battery is at 75%. Charge it at 70 MW now.', 'dial-battery')}, 100), null);
  assert.equal(say({line: LINE('plan', 'battery', 'The battery is at 75%. Charge it at 70 MW now.', 'dial-battery')}), null, 'back to what was said: nothing waits');
  // hidden at the RESPOND card: the card is said first, and the line coming back as it was is not said again
  const card = {n: 1, lines: ['NADIR 49.62 Hz: contained within 49.5–50.5 Hz ✓. FOS asks: back in 49.85–50.15 Hz within 5:00.', 'Caught by: spin → battery 200 MW.',
    'N-1 SHORT: 120 MW short: cover it within 4:30.', 'Enter (or a click) to take the desk.']};
  assert.equal(say({line: act, respond: card, mode: 'RESPOND-CARD'}),
    'NADIR 49.62 Hz: contained within 49.5–50.5 Hz ✓. N-1 SHORT: 120 MW short: cover it within 4:30. Enter (or a click) to take the desk.', 'the card before the badge');
  assert.equal(say({line: act, respond: card, mode: 'RESPOND-CARD'}), 'HELD 0× · Enter', 'then the badge; the card once');
  assert.equal(say({line: LINE('plan', 'battery', 'The battery is at 75%. Charge it at 70 MW now.', 'dial-battery')}), 'CRUISE 300×');
  assert.equal(say({line: LINE('plan', 'battery', 'The battery is at 75%. Charge it at 70 MW now.', 'dial-battery')}), null, 'the line back as it was said');
  // the day's end: the end card's h2 takes the focus and says DAY OVER: the badge's is not said
  assert.equal(say({line: null, mode: 'OVER', end: {}}), null);
  assert.equal(lineWords(LINE('crit', 'short', 'Start GT·B now: the city is 60 MW short of what it uses. Nothing else is fast enough.')),
    'URGENT: Start GT·B now: the city is 60 MW short of what it uses.');
});

test('K-23 on the page: #objective is no live region; the RESPOND card is said through #aria-live, first, within LIVE_GAP_MS', () => {
  const p = openGame({seed: 20261007});
  const obj = p.$('objective');
  assert.deepEqual([obj.getAttribute('role'), obj.getAttribute('aria-live')], [null, null], 'the line rewrites itself several times a minute');
  injectTrip(p.game.state, Math.floor(p.game.state.tick / V.TICKS_PER_S) + 60);
  assert.equal(p.until('trip', {max: '+10m'}).why, 'trip');
  assert.equal(p.until('card', {max: '+10m'}).why, 'card');
  const want = respondWords(p.vm().respond), live = () => p.$('aria-live').textContent;
  let at = live() === want ? 0 : -1;
  for (let k = 1; k <= 3 && at < 0; k++) { p.real(LIVE_GAP_MS / 1000 / 2, 0.5); if (live() === want) at = k; }   // (the card holds the clock: half-second frames)
  assert.ok(at >= 0, 'said within ' + LIVE_GAP_MS + ' ms: ' + live());
  assert.match(want, /^(NADIR|PEAK) \d+\.\d+ Hz: .*\. N-1 \w+.*Enter \(or a click\) to take the desk/);
  assert.deepEqual(p.h.mods.errors, []);
});

test('K-23: the end card\'s score is said once its h2 has the focus (the live region\'s card slot); its "?" by key opens with the focus in it', () => {
  const p = dayOver();
  p.real(LIVE_GAP_MS / 1000 + 0.5, 0.5);
  assert.equal(p.$('aria-live').textContent, p.$('end-score').textContent);
  assert.match(p.$('end-score').textContent, /^SCORE \d+ · [A-F]/);
  // the card's "?" gives the shell no event to read: the input that came last decides (a key here; the mouse: tests/help.test.js)
  p.$('q-reliability').focus();
  p.doc.dispatch('keydown', {key: 'Enter'});
  p.$('q-reliability').click();
  assert.deepEqual([p.$('popover').hidden, focusOf(p)], [false, 'pop-body']);
  p.key('Escape');
  assert.deepEqual([p.$('popover').hidden, focusOf(p)], [true, 'q-reliability']);
  p.$('q-reliability').dispatch('pointerdown');
  p.$('q-reliability').click();
  assert.deepEqual([p.$('popover').hidden, focusOf(p)], [false, 'q-reliability'], 'by the mouse, the focus stays');
});

// ------------------------------------------------------------------ the toast and the "?" popover (K-23)

test('K-23: a blue answer is said politely and a red refusal at once (two hidden regions); the box itself is not read twice', () => {
  const b = briefing(), polite = b.$('toast-polite'), alert = b.$('toast-alert');
  assert.deepEqual([b.$('toast').getAttribute('role'), b.$('toast').getAttribute('aria-hidden')], [null, 'true']);
  assert.deepEqual([polite.getAttribute('role'), polite.getAttribute('aria-live'), alert.getAttribute('role'), polite.className], ['status', 'polite', 'alert', 'sr']);
  b.doc.activeElement.blur();
  b.key(' ');   // the briefing's answer to Space (blue)
  assert.deepEqual([b.$('toast').className, polite.textContent, alert.textContent], ['info', 'Take the desk first: Enter. Then Space runs the clock.', '']);
  b.key(' ');
  assert.equal(polite.textContent, 'Take the desk first: Enter. Then Space runs the clock.' + String.fromCharCode(0xa0), 'the same words again are new to the region (a no-break space)');
  b.$('btn-take').click();
  b.h.actions.input({type: 'start', unit: 'nope'});   // a refusal: red
  assert.deepEqual([b.$('toast').className, polite.textContent], ['', '']);
  assert.match(alert.textContent, /^Refused: /);
  b.clock.t += 60000;
  b.h.frame(1 / 60);
  assert.deepEqual([b.$('toast').hidden, alert.textContent], [true, ''], 'gone with the box');
});

test('K-23: the "?" popover is named by its first heading; a "?" pressed by key puts the focus in it, and Esc or ✕ gives it back', () => {
  const doc = makeDocument(NEXT), clock = {t: 0};
  const h = bootGame(doc, {search: '?seed=7', storage: null, audioWin: {}, raf: false, now: () => clock.t, text: {TEXT}});
  const frame = () => { clock.t += 600; h.frame(1 / 60); };
  frame();
  const $ = id => doc.getElementById(id), q = doc.querySelectorAll('button.q').find(x => x.dataset.anchor === 'chip-cost'), pop = $('popover');
  const at = () => doc.activeElement.id || doc.activeElement.className;
  // the mouse: the popover opens beside its "?", the focus stays (a sighted player's view is unchanged)
  q.focus();
  q.dispatch('pointerdown');
  q.dispatch('click', {detail: 1});
  assert.deepEqual([pop.hidden, at()], [false, 'q inline on']);
  assert.equal(pop.getAttribute('aria-labelledby'), 'pop-title');
  assert.equal($('pop-title').textContent, $('pop-body').querySelector('h4').textContent, 'its name: the first heading');
  assert.match($('pop-title').textContent, /^CUSTOMER COST/);
  q.dispatch('click', {detail: 1});
  assert.equal(pop.hidden, true);
  // a key (a browser's click from Enter has detail 0): the focus goes to its text; Esc closes it and gives the focus back
  doc.dispatch('keydown', {key: 'Enter'});
  q.dispatch('click', {detail: 0});
  assert.deepEqual([pop.hidden, at()], [false, 'pop-body']);
  doc.dispatch('keydown', {key: 'Escape'});
  assert.deepEqual([pop.hidden, at()], [true, 'q inline']);
  q.dispatch('click', {detail: 0});
  $('btn-pop-close').focus();
  $('btn-pop-close').click();
  assert.deepEqual([pop.hidden, at()], [true, 'q inline'], '✕: back on the "?"');
  assert.deepEqual(h.mods.errors, []);
});

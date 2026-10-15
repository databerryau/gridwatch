// D-27 (amends Q-91) on the page: one card for the morning hand-backs. Headless and sampled (CLAUDE.md,
// tests/lib/play.js): DESK 20261007, whose 04:00 brings two feeders under repair (RED7 back 06:45, RED5 07:15),
// a returning player's storage (a compact watch).
//   A: a trip injected 10 grid-s before RED7's hand-back: the watch, then the RESPOND card; no feeder card holds
//      while R would be refused (frequency after the trip): the clock runs, the bay glows; the card holds once
//      the lamp lights, names both feeders, and R restores RED7 and queues RED5, which closes itself.
//   B: the card holds from the tick after 06:45:00's own, "RESTORE RED7 now; RED5 at 07:15"; Esc restores, like
//      Enter; RED5 closes itself at 07:15 with no second card; D-2's RESTORE term counts the one hold.
//   C: LEAVE RED7 DARK, priced: RED7 stays dark and is never held again; RED5's own card at 07:15 (it was never
//      queued), and the card's RESTORE (the mouse) closes it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';
import * as G from '../app/game.js';
import * as grid from '../sim/grid.js';

const SEED = 20261007, A = 1 / 60, TPS = 50;
const back = () => { const m = new Map([[G.SEEN_KEY, JSON.stringify({watch: true})]]); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))}; };
const dark = (p, id) => p.game.state.city.districts.find(d => d.id === id).dark;
const restores = p => p.game.state.log.filter(x => x.type === 'restore').map(x => x.args.district);
const restoredAt = (p, id) => (p.game.state.log.find(x => x.type === 'restore' && x.args.district === id) || {tick: -1}).tick;
const idx = (p, id) => p.game.state.city.districts.findIndex(d => d.id === id);
const at = (h, m) => ((h - 4) * 3600 + m * 60) * TPS;
/** The card, whole: what, the morning's plan, the keys (and a refusal's or the lamp's line, when there is one). */
const CARD = (id, place, plan, why = '') => new RegExp('^FEEDER ' + id + '\'s feeder in ' + place + ' is repaired: about \\d+0 MW with its cold load\\. ' +
  plan + ' R, Enter or Esc: restore' + why + '$', 'm');
/** The owner's rule: red only for a refusal (a '✕' note, a 'Refused:' toast). */
const noRed = (look, what) => { for (const l of look.split('\n')) if (/^(NOTE|TOAST) RED /.test(l)) assert.match(l, /: ✕ |^TOAST RED Refused: /, what + ': ' + l); };

test('A: after a trip no card holds while R would be refused (the clock runs, the bay glows); it holds once the lamp lights, names both feeders, and one R closes RED7 and queues RED5', () => {
  const p = openGame({seed: SEED, storage: back()});
  injectTrip(p.game.state, 2 * 3600 + 44 * 60 + 50);                         // 06:44:50
  assert.deepEqual([p.until('trip', {max: '07:00', line: 'near'}).at, p.mode()], ['06:44:50', 'WATCH']);
  assert.deepEqual([p.until('card', {max: '07:00', line: 'near'}).at, p.mode()], ['06:45:20', 'RESPOND-CARD'], 'the respond card first');
  const i = idx(p, 'RED7'), accepted = () => grid.restorePermissive(p.game.state, i, {preview: true}) === '';
  // R refused on the frame the RESPOND card goes (test poke: frequency still low after the trip): no card, the bay glows
  const f = p.game.state.last.fMeanHz;
  p.game.state.last.fMeanHz = 49.5;
  assert.equal(accepted(), false);
  assert.equal(G.shownFeeder(p.game), '', 'no card holds while R would be refused');
  p.game.state.last.fMeanHz = f;
  const e = p.pressKey('Enter', {}, {after: A});
  // from there to the card: it holds only at a tick R would be accepted
  if (!/^FEEDER /m.test(e.after)) {
    assert.ok(p.vm().glow.has('bay-restore'), 'the bay glows');
    p.until(({game}) => G.shownFeeder(game) !== '', {max: '07:10'});
  }
  assert.equal(G.shownFeeder(p.game), 'RED7', 'the card, once the lamp lit');
  assert.ok(accepted(), 'R is accepted at the card');
  assert.match(p.look(), CARD('RED7', 'Redgum Flats', 'RESTORE RED7 now; RED5 at \\d\\d:\\d\\d \\(it closes itself\\)\\.'));
  p.real(1);   // (a key within FEEDER_ARM_MS of the Enter that closed the RESPOND card is swallowed)
  p.key('r');
  assert.deepEqual(restores(p), ['RED7']);
  assert.equal(p.until('card', {max: '08:00', line: 'near'}).why, 'target', 'no second card: RED5 closed itself');
  assert.deepEqual([restores(p), dark(p, 'RED5')], [['RED7', 'RED5'], false]);
  assert.deepEqual(p.h.mods.errors, []);
});

test('B: the card holds once the network has handed RED7 back and names RED5 at 07:15; Esc restores like Enter; RED5 closes itself at 07:15 with no second card; one hold', () => {
  const p = openGame({seed: SEED, storage: back()});
  assert.deepEqual([p.until('card', {max: '07:00', line: 'near'}).at, p.mode()], ['06:45:00', 'FEEDER-CARD']);
  const t = p.game.state.tick;
  assert.equal(t, 9900 * TPS + 1, 'held from the tick after 06:45:00\'s own, whose step hands RED7 back');
  const look = p.look();
  assert.match(look, CARD('RED7', 'Redgum Flats', 'RESTORE RED7 now; RED5 at 07:15 \\(it closes itself\\)\\.'));
  assert.match(look, / \| HELD 0× · R restore \| /);
  assert.match(look, /feeder-restore "RESTORE RED7"/, 'the mouse\'s RESTORE');
  assert.match(look, /feeder-leave "LEAVE RED7 DARK \(about \$\d+M an hour at VCR\)"/, 'and its LEAVE, priced');
  p.real(1);
  const esc = p.pressKey('Escape', {}, {after: A});
  assert.deepEqual([restores(p), dark(p, 'RED7'), restoredAt(p, 'RED7')], [['RED7'], false, t], 'Esc restored RED7 at the held tick');
  assert.doesNotMatch(esc.during, /^FEEDER /m, 'the card goes with it');
  noRed(esc.during + '\n' + esc.after, 'Esc');
  assert.equal(p.until('card', {max: '08:00', line: 'near'}).why, 'target', 'RED5 never brings a card');
  assert.deepEqual([restores(p), dark(p, 'RED5')], [['RED7', 'RED5'], false]);
  assert.ok(restoredAt(p, 'RED5') > at(7, 15) && restoredAt(p, 'RED5') <= at(7, 15) + 2, 'RED5 closed on the tick after 07:15:00');
  const hold = p.clockReport().parts.RESTORE;
  assert.equal(hold.n, 1, 'one morning hold: ' + JSON.stringify(hold));
  assert.deepEqual(p.h.mods.errors, []);
});

test('C: LEAVE RED7 DARK leaves it dark, never held again; RED5 brings its own card at 07:15, and the card\'s RESTORE closes it', () => {
  const p = openGame({seed: SEED, storage: back()});
  assert.equal(p.until('card', {max: '07:00', line: 'near'}).at, '06:45:00');
  const lv = p.press('feeder-leave', {after: A});
  assert.doesNotMatch(lv.during, /^FEEDER /m);
  assert.ok(dark(p, 'RED7') && p.mode() !== 'FEEDER-CARD', 'left: RED7 dark');
  assert.deepEqual([p.until('card', {max: '07:20', line: 'near'}).at, p.game.feeder.id], ['07:15:00', 'RED5']);
  assert.match(p.look(), CARD('RED5', 'Redgum Flats', 'RESTORE RED5 now\\.'), 'RED7 was left: not queued');
  const rs = p.press('feeder-restore', {after: A});
  assert.deepEqual([restores(p), dark(p, 'RED5')], [['RED5'], false]);
  assert.doesNotMatch(rs.after, /^FEEDER /m);
  assert.equal(p.until('card', {max: '08:00', line: 'near'}).why, 'target', 'RED7 is never held again');
  assert.equal(dark(p, 'RED7'), true, 'the bay and the line still ask for it');
  assert.deepEqual(p.h.mods.errors, []);
});

test('the card\'s face: blue (the refusal alone red, the lamp amber), over the map, off the stack when it is out (next.html)', () => {
  const css = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
  assert.match(css, /#feeder-card \{ top: calc\(var\(--hdr\) \+ 60px\); width: 560px; border-color: var\(--blue\);/);
  assert.match(css, /body\.stack-out #feeder-card \{ top: auto; bottom: 8px; left: 8px; transform: none; \}/);
  assert.match(css, /#feeder-card p\.hint \{[^}]*color: var\(--blue\)/);
  assert.match(css, /#feeder-card button \{[^}]*border-color: var\(--blue\); color: var\(--blue\)/);
  assert.match(css, /#feeder-card p\.why\.lamp \{ color: var\(--amber\);/);
  assert.deepEqual(css.match(/#feeder-card[^{]*\{[^}]*var\(--red\)/g), ['#feeder-card p.why { color: var(--red)'], 'red only for the refusal');
});

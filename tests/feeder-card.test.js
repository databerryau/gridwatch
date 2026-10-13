// Q-91 on the page (desk/README.md §32.1, the owner's call): a hand-back holds the clock on a feeder card
// (FEEDER-CARD). Headless and sampled (CLAUDE.md, tests/lib/play.js): DESK 20261007, whose 04:00 brings two
// feeders under repair (RED7 back 06:45, RED5 07:15), a returning player's storage (a compact watch).
//   A: a trip injected 10 grid-s before RED7's hand-back: the watch, then the RESPOND card, then the feeder
//      card (it waits for both). The clock holds; R is refused (frequency still low after the trip): the
//      reason in red, on the toast and the card, and the card stays. Esc goes on: RED7 stays dark, and no
//      card holds for it again, even once RED5's restore has moved its allowed second.
//   B: R at RED7's card restores it and the clock runs; at RED5's a click goes to the RESTORE bay and the
//      card stays; the bay's CLOSE restores RED5 (the mouse).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';
import * as G from '../app/game.js';

const SEED = 20261007, A = 1 / 60;
const back = () => { const m = new Map([[G.SEEN_KEY, JSON.stringify({watch: true})]]); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))}; };
const line = (look, head) => look.split('\n').find(l => l.startsWith(head)) || '';
const dark = (p, id) => p.game.state.city.districts.find(d => d.id === id).dark;
const restores = p => p.game.state.log.filter(x => x.type === 'restore').map(x => x.args.district);
/** The card, whole: what, the keys, what going on means (and a refusal's line, when there is one). */
const CARD = (id, place, why = '') => new RegExp('^FEEDER ' + id + '\'s feeder in ' + place + ' is repaired: about \\d+0 MW with its cold load\\. ' +
  'R or Enter: restore it now · Esc: go on Gone on, it stays dark and is yours: the RESTORE bay still has it\\.' + why + '$', 'm');
/** The owner's rule: red only for a refusal (a '✕' note, a 'Refused:' toast). */
const noRed = (look, what) => { for (const l of look.split('\n')) if (/^(NOTE|TOAST) RED /.test(l)) assert.match(l, /: ✕ |^TOAST RED Refused: /, what + ': ' + l); };

test('A: a watch queues the feeder card behind its RESPOND card; the clock holds; a refused R answers with its reason and the card stays; Esc goes on and RED7 is never held again', () => {
  const p = openGame({seed: SEED, storage: back()});
  injectTrip(p.game.state, 2 * 3600 + 44 * 60 + 50);                         // 06:44:50
  assert.deepEqual([p.until('trip', {max: '07:00', line: 'near'}).at, p.mode()], ['06:44:50', 'WATCH']);
  assert.deepEqual([p.until('card', {max: '07:00', line: 'near'}).at, p.mode()], ['06:45:20', 'RESPOND-CARD'], 'the respond card first');
  assert.doesNotMatch(p.look(), /^FEEDER /m, 'the feeder card waits');
  const e = p.pressKey('Enter', {}, {after: A});
  assert.match(e.during, CARD('RED7', 'Redgum Flats'), 'Enter takes the desk, and the feeder card holds it at once');
  assert.match(line(e.during, 'CLOCK '), / \| HELD 0× · R restore · Esc on \| /);
  const t = p.game.state.tick;
  p.real(2);
  assert.deepEqual([p.game.state.tick, p.mode(), G.ui(p.game, {do: 'fast', on: true})], [t, 'FEEDER-CARD', 'not now'], 'held: no tick in 2 real s, no FAST');
  // R: the permissive refuses (frequency after the trip); its reason, in red, on the toast and the card, which stays
  const no = p.pressKey('r', {}, {after: A});
  assert.match(no.during, /^TOAST RED Refused: frequency below [\d.]+ Hz$/m);
  assert.match(no.after, CARD('RED7', 'Redgum Flats', ' ✕ Refused: frequency below [\\d.]+ Hz\\. Esc goes on\\.'));
  assert.deepEqual([p.mode(), p.game.state.tick, restores(p)], ['FEEDER-CARD', t, []], 'the card stays, the clock held');
  noRed(no.during + '\n' + no.after, 'R refused');
  // Esc: gone on, RED7 dark, the clock runs
  const esc = p.pressKey('Escape', {}, {after: A});
  assert.doesNotMatch(esc.during, /^FEEDER /m);
  assert.ok(dark(p, 'RED7') && p.game.state.tick > t && p.mode() !== 'FEEDER-CARD', 'gone on: ' + p.mode());
  // RED5's card at 07:15 (not RED7's); R restores RED5, which moves RED7's allowed second to 07:20: still no card for it
  assert.deepEqual([p.until('card', {max: '07:20', line: 'near'}).at, p.game.feeder.id], ['07:15:00', 'RED5']);
  p.key('r');
  assert.deepEqual(restores(p), ['RED5']);
  assert.equal(p.until('card', {max: '07:40', line: 'near'}).why, 'target', 'RED7 was gone on from: never held again');
  assert.equal(dark(p, 'RED7'), true, 'the bay and the line still ask for it');
  assert.deepEqual(p.h.mods.errors, []);
});

test('B: R at the card restores the feeder it names and the clock runs; a click on the card goes to the RESTORE bay (the card stays), whose CLOSE restores it', () => {
  const p = openGame({seed: SEED, storage: back()});
  assert.deepEqual([p.until('card', {max: '07:00', line: 'near'}).at, p.mode()], ['06:45:00', 'FEEDER-CARD']);
  const t = p.game.state.tick, r = p.pressKey('r');
  assert.deepEqual([restores(p), dark(p, 'RED7')], [['RED7'], false], 'R restored the feeder the card names');
  assert.doesNotMatch(r.during, /^FEEDER /m, 'the card goes with it');
  assert.ok(p.game.state.tick > t && p.mode() !== 'FEEDER-CARD', 'the clock runs: ' + p.mode());
  noRed(r.during + '\n' + r.after, 'R');
  // RED5 at 07:15: a click on the card, to the RESTORE bay; the card stays
  assert.deepEqual([p.until('card', {max: '07:20', line: 'near'}).at, p.game.feeder.id], ['07:15:00', 'RED5']);
  const k = p.press('feeder-card', {after: A});
  assert.match(k.after, /^CTRL .*bay-restore "[^"]*RESTORE" \[[^\]]*focus/m, 'the bay\'s RESTORE has the keys');
  assert.match(k.after, CARD('RED5', 'Redgum Flats'));
  assert.doesNotMatch(k.after, /^LINE /m, 'the card is the one instruction while it holds (the line waits, as at the respond card)');
  assert.equal(p.mode(), 'FEEDER-CARD');
  // the bay's CLOSE on RED5 (the mouse): restored, the card gone, the line back
  p.click('restore-RED5');
  assert.deepEqual([restores(p), dark(p, 'RED5'), p.mode() === 'FEEDER-CARD'], [['RED7', 'RED5'], false, false]);
  assert.doesNotMatch(p.look(), /^FEEDER /m);
  assert.match(p.look(), /^LINE /m);
  assert.deepEqual(p.h.mods.errors, []);
});

test('the card\'s face: blue (the refusal alone red), over the map, off the stack when it is out (next.html)', () => {
  const css = readFileSync(new URL('../next.html', import.meta.url), 'utf8');
  assert.match(css, /#feeder-card \{ top: calc\(var\(--hdr\) \+ 60px\); width: 560px; border-color: var\(--blue\);/);
  assert.match(css, /body\.stack-out #feeder-card \{ top: auto; bottom: 8px; left: 8px; transform: none; \}/);
  assert.match(css, /#feeder-card p\.hint \{[^}]*color: var\(--blue\)/);
  assert.deepEqual(css.match(/#feeder-card[^{]*\{[^}]*var\(--red\)/g), ['#feeder-card p.why { color: var(--red)'], 'red only for the refusal');
});

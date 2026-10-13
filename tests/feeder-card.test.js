// Q-91 on the page (desk/README.md §32.1, the owner's call): a hand-back holds the clock on a feeder card
// (FEEDER-CARD). Headless and sampled (CLAUDE.md, tests/lib/play.js): DESK 20261007, whose 04:00 brings two
// feeders under repair (RED7 back 06:45, RED5 07:15), a returning player's storage (a compact watch).
//   A: a trip injected 10 grid-s before RED7's hand-back: the watch, then the RESPOND card, then the feeder
//      card (it waits for both). The clock holds; the card says in amber why R would be refused now, and an
//      urgent line stays up under it; a doubled or held Enter never restores; R is refused (frequency still
//      low after the trip): the reason in red, on the toast and the card, and the card stays. Esc goes on:
//      RED7 stays dark, and no card holds for it again, even once RED5's restore has moved its allowed second.
//   B: the card holds from the tick after 06:45:00's own, so the network's tray card is up as it shows; R at
//      it restores RED7 (its tray card goes to the LOG) and the clock runs; at RED5's a click goes to RED5's
//      CLOSE, whose Enter is the bay's.
//   C: the mouse and the bay: GO ON; the bay follows the next card; Enter on another feeder's CLOSE restores
//      that one and puts the card off; a desk input under PAUSE leaves the hidden card; the card's RESTORE;
//      D-2's RESTORE term counts the hold and never a pause after it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';
import * as G from '../app/game.js';

const SEED = 20261007, A = 1 / 60, TPS = 50;
const back = () => { const m = new Map([[G.SEEN_KEY, JSON.stringify({watch: true})]]); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))}; };
const line = (look, head) => look.split('\n').find(l => l.startsWith(head)) || '';
const dark = (p, id) => p.game.state.city.districts.find(d => d.id === id).dark;
const restores = p => p.game.state.log.filter(x => x.type === 'restore').map(x => x.args.district);
/** The card, whole: what, the keys, what going on means (and a refusal's or the lamp's line, when there is one). */
const CARD = (id, place, why = '') => new RegExp('^FEEDER ' + id + '\'s feeder in ' + place + ' is repaired: about \\d+0 MW with its cold load\\. ' +
  'R or Enter: restore it now · Esc: go on Gone on, it stays dark and is yours: the RESTORE bay still has it\\.' + why + '$', 'm');
const LAMP = ' Not yet: frequency below [\\d.]+ Hz\\. Esc goes on; the RESTORE bay closes it once its lamp lights\\.';
/** The owner's rule: red only for a refusal (a '✕' note, a 'Refused:' toast). */
const noRed = (look, what) => { for (const l of look.split('\n')) if (/^(NOTE|TOAST) RED /.test(l)) assert.match(l, /: ✕ |^TOAST RED Refused: /, what + ': ' + l); };

test('A: a watch queues the feeder card behind its RESPOND card; the clock holds; the card warns before R is refused, and the refusal stays on it; a doubled or held Enter never restores; Esc goes on and RED7 is never held again', () => {
  const p = openGame({seed: SEED, storage: back()});
  injectTrip(p.game.state, 2 * 3600 + 44 * 60 + 50);                         // 06:44:50
  assert.deepEqual([p.until('trip', {max: '07:00', line: 'near'}).at, p.mode()], ['06:44:50', 'WATCH']);
  assert.deepEqual([p.until('card', {max: '07:00', line: 'near'}).at, p.mode()], ['06:45:20', 'RESPOND-CARD'], 'the respond card first');
  assert.doesNotMatch(p.look(), /^FEEDER /m, 'the feeder card waits');
  const e = p.pressKey('Enter', {}, {after: A});
  assert.match(e.during, CARD('RED7', 'Redgum Flats', LAMP), 'Enter takes the desk, and the feeder card holds it at once, saying (amber) why R is refused now');
  assert.match(line(e.during, 'CLOCK '), / \| HELD 0× · R restore · Esc on \| /);
  assert.match(e.during, /^LINE ‼ URGENT /m, 'an urgent line stays up under the card');
  assert.match(e.during, /feeder-restore "RESTORE RED7" · feeder-go-on "GO ON"/, 'the mouse\'s two answers');
  // a doubled Enter (within FEEDER_ARM_MS of the one that closed the RESPOND card) answers in blue and sends nothing
  const dbl = p.pressKey('Enter', {}, {after: A});
  assert.match(dbl.during, /^TOAST blue A repaired feeder holds the clock: read its card, then R or Enter restores it$/m);
  assert.deepEqual([p.game.feederWhy, restores(p), p.mode()], [null, [], 'FEEDER-CARD'], 'no restore was sent');
  const t = p.game.state.tick;
  p.real(2);
  assert.deepEqual([p.game.state.tick, p.mode(), G.ui(p.game, {do: 'fast', on: true})], [t, 'FEEDER-CARD', 'not now'], 'held: no tick in 2 real s, no FAST');
  // a held key's auto-repeat is never a press (K-3): nothing sent, so nothing refused
  p.key('Enter', {repeat: true});
  p.key('r', {repeat: true});
  assert.deepEqual([p.game.feederWhy, restores(p), p.mode()], [null, [], 'FEEDER-CARD'], 'no restore was sent');
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

test('B: the card holds once the network has handed the feeder back (its tray card up); R restores the feeder it names and that tray card goes to the LOG; a click on the card goes to its CLOSE, whose Enter is the bay\'s', () => {
  const p = openGame({seed: SEED, storage: back()});
  assert.deepEqual([p.until('card', {max: '07:00', line: 'near'}).at, p.mode()], ['06:45:00', 'FEEDER-CARD']);
  const t = p.game.state.tick, r = p.pressKey('r');
  assert.equal(t, 9900 * TPS + 1, 'held from the tick after 06:45:00\'s own, whose step hands RED7 back');
  assert.match(r.before, /^TRAY .*NETWORK 06:45 RED7 feeder repaired and handed back: close its breaker \(R or Enter at its card, or from the RESTORE bay\)\./m);
  assert.deepEqual([restores(p), dark(p, 'RED7'), p.game.state.log.find(x => x.type === 'restore').tick], [['RED7'], false, t], 'R restored the feeder the card names, at the held tick');
  assert.doesNotMatch(r.after, /RED7 feeder repaired/, 'closed: never left on the tray as an instruction');
  assert.doesNotMatch(r.during, /^FEEDER /m, 'the card goes with it');
  assert.ok(p.game.state.tick > t && p.mode() !== 'FEEDER-CARD', 'the clock runs: ' + p.mode());
  noRed(r.during + '\n' + r.after, 'R');
  // RED5 at 07:15: a click on the card goes to RED5's CLOSE; the card stays
  assert.deepEqual([p.until('card', {max: '07:20', line: 'near'}).at, p.game.feeder.id], ['07:15:00', 'RED5']);
  const k = p.press('feeder-card', {after: A});
  assert.match(k.after, /^CTRL .*restore-RED5 "CLOSE" \[[^\]]*focus/m, 'RED5\'s CLOSE has the keys');
  assert.match(k.after, CARD('RED5', 'Redgum Flats'));
  assert.doesNotMatch(k.after, /^LINE /m, 'the card is the one instruction while it holds (the line waits, as at the respond card)');
  assert.equal(p.mode(), 'FEEDER-CARD');
  // Enter there is the bay's CLOSE: restored, the card gone, the line back
  p.key('Enter');
  assert.deepEqual([restores(p), dark(p, 'RED5'), p.mode() === 'FEEDER-CARD'], [['RED7', 'RED5'], false, false]);
  assert.doesNotMatch(p.look(), /^FEEDER /m);
  assert.match(p.look(), /^LINE /m);
  assert.deepEqual(p.h.mods.errors, []);
});

test('C: GO ON goes on; the bay follows the next card; Enter on another feeder\'s CLOSE restores that one and puts the card off; under PAUSE a desk input leaves the card; the card\'s RESTORE; D-2 counts the hold, never a pause after it', () => {
  const p = openGame({seed: SEED, storage: back()});
  assert.equal(p.until('card', {max: '07:00', line: 'near'}).at, '06:45:00');
  p.real(1);
  const go = p.press('feeder-go-on', {after: A});
  assert.doesNotMatch(go.during, /^FEEDER /m);
  assert.ok(dark(p, 'RED7') && p.mode() !== 'FEEDER-CARD', 'GO ON: gone on, RED7 dark');
  const hold = p.clockReport().parts.RESTORE;
  assert.ok(hold.n === 1 && Math.abs(hold.realS - 1) < 0.1, 'one hold of about 1 real s: ' + JSON.stringify(hold));
  p.key(' '); p.real(3); p.key(' ');
  assert.deepEqual(p.clockReport().parts.RESTORE, hold, 'a pause after GO ON is not the card\'s');
  // RED5 at 07:15: the bay's choice follows the card (RED7 had been its choice since 06:45)
  assert.deepEqual([p.until('card', {max: '07:20', line: 'near'}).at, p.game.feeder.id], ['07:15:00', 'RED5']);
  assert.match(p.look(), /^CTRL .*restore-list>div "▸ RED5 · REPAIRED/m);
  // Enter on RED7's CLOSE is the bay's: RED7 closes, and RED5's card goes until its new allowed second (07:20)
  p.$('restore-RED7').focus();
  p.key('Enter');
  assert.deepEqual([restores(p), dark(p, 'RED5'), p.mode() === 'FEEDER-CARD'], [['RED7'], true, false]);
  assert.equal(p.until('card', {max: '07:30', line: 'near'}).at, '07:20:00', 'RED5 again, 5 min after RED7\'s restore');
  // under PAUSE the card is hidden, and a desk input made there leaves it
  p.key(' ');
  assert.deepEqual([p.mode(), /^FEEDER /m.test(p.look())], ['PAUSE', false]);
  p.send({type: 'start', unit: 'ccgt2'});
  p.key(' ');
  assert.deepEqual([p.mode(), p.game.feeder && p.game.feeder.id], ['FEEDER-CARD', 'RED5'], 'the card is still there');
  // the card's RESTORE (the mouse)
  const rs = p.press('feeder-restore', {after: A});
  assert.deepEqual([restores(p), dark(p, 'RED5')], [['RED7', 'RED5'], false]);
  assert.doesNotMatch(rs.after, /^FEEDER /m);
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

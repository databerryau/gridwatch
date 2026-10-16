// "Every press answers" (SPEC Q-41, Q-42) for the presses slice 2c adds (desk/README.md §32.8.2): the
// briefing's (HAND and AGC with the header's chip, the "?" beside Watch for, TAKE THE DESK), at 04:30 RESTORE
// on a feeder still under repair and START on the unit back late from maintenance, and Enter at a RESPOND card
// with the keys on the RESTORE rows. A press answers when what the player sees changes; help is never red (a red
// note is a '✕' refusal, a red toast 'Refused:'), and a refusal says its reason. (The night roll's F and locked
// press are tests/night-strip.test.js's, on the night that file plays anyway.)
//
// Headless and sampled (CLAUDE.md, tests/lib/play.js): one game on DESK 20261007, whose 04:00 brings both
// the feeders under repair (RED7 06:45, RED5 07:15) and the late return (CCGT 2 until 07:45), with a
// returning player's storage; each press is press()/pressKey() (a look before, on the press frame and one
// frame after). Then RED7 left dark at its feeder card (LEAVE, D-27), RED5 closed at its own (R, Q-91), and
// Enter at the day's first RESPOND card (the 09:46 link trip), the keys still on the RESTORE rows and RED7's close
// accepted there (K-16: Enter closes the card, never RED7's breaker). The jumps are in a before() hook; the hours
// to the card are skipped (tests/lib/play.js skipTo, W6: the test budget, with the night roll's presses moved to
// tests/night-strip.test.js).
import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {openGame, diffLooks} from './lib/play.js';
import * as G from '../app/game.js';
import {HAND_CHIP} from '../app/shell.js';
import {preroll, prerollRegime} from '../sim/dayplan.js';
import {restorePermissive} from '../sim/grid.js';

const SEED = 20261007, A = 1 / 60;
const mem = new Map([[G.SEEN_KEY, JSON.stringify({watch: true, shifts: 1})]]);
const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v))};

/** Hide the notes and the toast a press left, so the next press's answer is new in the diff. */
function quiet(p) {
  for (const n of p.doc.querySelectorAll('.dk-note')) n.hidden = true;
  const t = p.$('toast');
  if (t) t.hidden = true;
}
/** (a) the press changed what the player sees (`want`: a RegExp the diff matches, or a function of the sample); (b) no help in red. */
function answers(p, x, want, what, key = false) {
  quiet(p);
  const r = key ? p.pressKey(x, {}, {after: A}) : p.press(x, {after: A}), shown = diffLooks(r.before, r.during) + '\n' + r.diff;
  if (want instanceof RegExp) assert.match(shown, want, what + ' did not answer as expected; it showed:\n' + shown);
  else assert.ok(want(r), what + ' did not answer; it showed:\n' + shown);
  for (const l of (r.during + '\n' + r.after).split('\n')) {
    if (l.startsWith('NOTE RED ')) assert.match(l, /: ✕ /, what + ': help in red: ' + l);
    if (l.startsWith('TOAST RED ')) assert.match(l, /^TOAST RED (Refused|RE-DISPATCH): /, what + ': help in red: ' + l);
  }
  return r;
}

const S = {};
test('the date: its pre-roll has both the task feeders and the late return (dayplan.preroll, no frames)', () => {
  const scn = G.scenarioForSeed(SEED), at0 = preroll(SEED, scn, prerollRegime(SEED, scn)).filter(e => e.atS === 0);
  assert.deepEqual(at0.map(e => e.type).sort(), ['feederOut', 'heatAnnounce', 'unitOutage']);
  assert.deepEqual([at0.find(e => e.type === 'unitOutage').args.unit, at0.find(e => e.type === 'feederOut').args.districts], ['ccgt2', ['RED7', 'RED5']]);
});

test('every new press answers: the briefing (HAND and the header\'s chip, the "?" beside Watch for, AGC, TAKE THE DESK)', () => {
  const p = S.p = openGame({seed: SEED, take: false, storage}), chip = p.$('chip-hand');
  answers(p, 'btn-hand', /btn-hand "HAND" \[on/, 'HAND');
  assert.deepEqual([chip.hidden, chip.textContent, chip.className, chip.title], [false, 'HAND', 'chip day', HAND_CHIP.day[1]], 'the header says HAND, in amber');
  const q = p.doc.querySelector('button.q[data-anchor="briefing-watch"]');
  answers(p, q, /^POPOVER Act I's constraints are announced at 04:00\. Real world: /m, 'the "?" beside Watch for');
  answers(p, q, r => /^POPOVER /m.test(r.before) && !/^POPOVER /m.test(r.after), 'the same "?" again (it closes)');
  answers(p, 'btn-agc', /btn-agc "AGC" \[on/, 'AGC');
  assert.equal(chip.hidden, true, 'AGC: no chip');
  const r = answers(p, 'btn-take', x => !/^BRIEFING /m.test(x.after) && /^CLOCK 04:30/m.test(x.after), 'TAKE THE DESK');
  assert.match(r.before, /^BRIEFING .* Watch for: heatwave 14:05–20:00; RED7, RED5 feeders back 06:45, 07:15; CCGT 2 out until 07:45\. /m);
  assert.deepEqual(p.h.mods.errors, []);
});

test('every new press answers: at 04:30, RESTORE on a feeder under repair and START on the unit back late (each says why, the sim untouched)', () => {
  const p = S.p, st = p.game.state;
  p.click('bay-restore');
  answers(p, 'restore-RED7', /^NOTE RED [^\n]*: ✕ feeder under repair until 06:45$/m, 'CLOSE on RED7, under repair');
  for (const n of [1, 2]) answers(p, 'guard-start-ccgt2', /^NOTE blue [^\n]*: CCGT 2 OFF: on outage until 07:45$/m, 'START CCGT 2 (press ' + n + ')');
  assert.ok(!st.log.some(x => x.type === 'restore' || x.type === 'start'), 'nothing reached the sim');
  assert.deepEqual(p.h.mods.errors, []);
});

describe('the first RESPOND card', () => {
  const restores = () => S.p.game.state.log.filter(x => x.type === 'restore').map(x => x.args.district);
  before(() => {
    const p = S.p;
    p.key(' ');   // the clock runs (the desk opens held at 04:30)
    S.held = p.to('06:45:01', {stop: [], line: 'near'}).why;   // RED7's hand-back holds the clock on its card (Q-91)
    p.click('feeder-leave');   // D-27: LEAVE RED7 DARK (so RED5 is not queued behind it)
    S.red5 = p.until('card', {max: '21:00', line: 'near'}).at;   // RED5's own card
    p.key('r');   // R, as its card says: RED5 restored
    S.restored = restores();
    p.key('r');   // the bay's R: the keys on the RESTORE rows, RED7 waiting there
    S.card = p.skipTo('21:00');   // the day's first trip's RESPOND card (09:46:30), RED7 still open
  });

  test('K-16: Enter at a RESPOND card closes it, though the keys are still on the RESTORE rows (it never closes a breaker as well)', () => {
    const p = S.p;
    assert.deepEqual([S.held, S.restored, S.red5, S.card.why, S.card.at, p.mode()],
      ['held:FEEDER-CARD', ['RED5'], '07:15:00', 'held:RESPOND-CARD', '09:46:30', 'RESPOND-CARD']);
    assert.equal(p.doc.activeElement && p.doc.activeElement.id, 'restore-list', 'the keys are on the RESTORE rows, RED7 waiting there');
    const st = p.game.state;
    assert.equal(restorePermissive(st, st.city.districts.findIndex(x => x.id === 'RED7'), {preview: true}), '', 'a close of RED7 would be accepted here (or the check below proves nothing)');
    answers(p, 'Enter', x => /^CARD /m.test(x.before) && !/^CARD /m.test(x.after), 'Enter at the card', true);
    assert.deepEqual(restores(), ['RED5'], 'Enter closed the card and nothing else');
    assert.deepEqual(p.h.mods.errors, []);
  });
});

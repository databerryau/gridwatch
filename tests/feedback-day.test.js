// "Every press answers" (SPEC Q-41, Q-42) for the presses slice 2c adds (desk/README.md §32.8.2): the
// briefing's (HAND and AGC with the header's chip, the "?" beside Watch for, TAKE THE DESK), at 04:30 RESTORE
// on a feeder still under repair and START on the unit back late from maintenance, and in the night roll F
// and a locked press. A press answers when what the player sees changes; help is never red (a red note is
// a '✕' refusal, a red toast 'Refused:'), and a refusal says its reason.
//
// Headless and sampled (CLAUDE.md, tests/lib/play.js): one game on DESK 20261007, whose 04:00 brings both
// the feeders under repair (RED7 06:45, RED5 07:15) and the late return (CCGT 2 until 07:45), with a
// returning player's storage; each press is press()/pressKey() (a look before, on the press frame and one
// frame after); the night is one jump to 21:00:01 by tests/feedback.test.js's card loop, in its own before().
import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {openGame, diffLooks} from './lib/play.js';
import * as G from '../app/game.js';
import {HAND_CHIP} from '../app/shell.js';
import {NIGHT_LOCK} from '../render/format.js';
import {preroll, prerollRegime} from '../sim/dayplan.js';

const SEED = 20261007, A = 1 / 60;
const mem = new Map([[G.SEEN_KEY, JSON.stringify({watch: true, restore: true})]]);
const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v))};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

describe('the night roll', () => {
  before(() => {
    const p = S.p;
    p.key(' ');   // the clock runs (the desk opens held at 04:30)
    for (let i = 0; i < 8; i++) { const r = p.to('21:00:01', {stop: [], line: 'near'}); if (r.why !== 'held:RESPOND-CARD') break; p.key('Enter'); }
    assert.equal(p.clock(), '21:00:01');
  });

  test('every new press answers: F and a locked press in the night roll, in blue, with the lock\'s words', () => {
    const p = S.p;
    answers(p, 'f', /^TOAST blue FAST waits: the night shift runs the roll to 04:00$/m, 'F at night', true);
    const lock = new RegExp('^(TOAST blue|NOTE blue [^\\n]*?:) ' + esc(NIGHT_LOCK) + '$', 'm');
    answers(p, 'guard-start-gta1', lock, 'START at night');
    answers(p, 'btn-redispatch', lock, 'RE-DISPATCH at night');
    assert.ok(!p.game.state.log.some(x => x.type === 'start' && x.args.unit === 'gta1'), 'refused, not logged');
    assert.deepEqual(p.h.mods.errors, []);
  });
});

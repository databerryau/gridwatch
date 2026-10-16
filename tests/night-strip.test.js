// D-11's accept on the page (desk/README.md §32.8.2, Q-73), sampled: no drawn roll. One game, a returning
// player's (a compact watch), no input but Enter on each RESPOND card and LEAVE on each shed card, the day to 20:30
// skipped (the sim alone), then jumped to 21:00:01 (to('21:00') lands before the sim's flip). Then the looks: at
// 21:00 the plan bar is the night strip (the lock's words over the day's totals), it stays with a guard
// under the pointer, and the badge reads NIGHT ROLL; F and a locked press answer in blue; at 01:00 every figure
// has counted up (OUTAGES too: the districts the day shed are dark until the night shift relights them) and the
// city's windows have gone dark; the night ends at 04:00 by itself (never a card or a hold) within 15 real s of
// 21:00, and the END line is there at once. Par is a finished stand-in, so the strip shows SCORE. (The end card's
// fetch at 21:00 and the strip's redraw cadence are tests/briefing.test.js's, on the shell alone.) Nearly all of
// the file's time is the sim's day and night (a date with no task feeders, so no feeder card holds the jump, Q-91;
// app/director.js keeps the feeders' allowed seconds per input-log length since stage C).
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {openGame, diffLooks} from './lib/play.js';
import * as G from '../app/game.js';
import {NIGHT_LOCK} from '../render/format.js';
import {PAR_MARK_S} from '../app/par.js';
import {V} from '../sim/params.js';

const SEED = 20261202;   // no task feeders (no feeder cards: the cheapest day to jump); two trips, their cards answered by the loop
const mem = new Map([[G.SEEN_KEY, JSON.stringify({watch: true})]]);
const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v))};
// par: its running totals at its 5-minute marks (app/par.js), a steady day's
const row = s => ({costDollars: 50 * s, servedMWh: 1.4 * s, lightsMWh: 0, co2tPerMWh: 0.6, saidiMin: 0, saifi: 0, maifi: 0});
const series = Array.from({length: V.DAY_S / PAR_MARK_S + 1}, (_, k) => row(k * PAR_MARK_S));

const S = {};
const lines = (look, head) => look.split('\n').filter(l => l.startsWith(head));
/** The strip's figures: {SUPPLY, OUTAGES, CARBON, ALL-IN} in $M and SCORE. */
function figures(look) {
  const [night] = lines(look, 'NIGHT ');
  assert.ok(night, 'the night strip shows:\n' + look);
  const f = {};
  for (const m of night.matchAll(/(SUPPLY|OUTAGES|CARBON|ALL-IN) \$(\d+\.\d)M/g)) f[m[1]] = Number(m[2]);
  f.SCORE = Number(/ · SCORE (\d+) \(par 1000\)$/.exec(night)[1]);
  return f;
}
const windows = p => Object.values(p.h.mods.map.debug.districts).reduce((a, d) => a + d.windows, 0);

before(() => {
  const p = S.p = openGame({seed: SEED, storage, par: {score: series.at(-1), series}});
  // (D-26: each shed stage's card is gone on from, LEAVE, so the night still starts dark. W6, the test budget: to 20:30
  // as the sim alone, tests/lib/play.js skipTo, stopping at each card for that answer; then the page's own jump, so the
  // map's districts and the tray have the evening's real seconds behind them at 21:00)
  const day = go => {
    for (let i = 0; i < 40; i++) {
      const r = go();
      if (r.why === 'held:RESPOND-CARD') p.key('Enter'); else if (r.why === 'held:FEEDER-CARD') p.click('feeder-leave'); else return;
    }
  };
  day(() => p.skipTo('20:30'));
  day(() => p.to('21:00:01', {stop: [], line: 'near'}));
  S.t21 = p.now;
});

test('Q-73 at 21:00: the plan bar is the night strip (the lock\'s words, the day\'s totals and SCORE against par), the badge NIGHT ROLL', () => {
  const p = S.p, look = S.look21 = p.look({controls: false});
  assert.equal(p.clock(), '21:00:01');
  assert.equal(lines(look, 'CLOCK')[0].split(' | ')[1], 'NIGHT ROLL 2,100×');
  assert.deepEqual(lines(look, 'LINE '), [], 'the standing line gives way to the strip');
  const [night] = lines(look, 'NIGHT ');
  assert.ok(night.startsWith('NIGHT ☾ NIGHT SHIFT ' + NIGHT_LOCK + ' SUPPLY $'), night);
  const f = S.f21 = figures(look);
  assert.ok(f.SUPPLY > 0 && f.CARBON > 0 && f.SCORE > 0, JSON.stringify(f));
  assert.ok(Math.abs(f['ALL-IN'] - (f.SUPPLY + f.OUTAGES + f.CARBON)) <= 0.15, 'ALL-IN is the three parts: ' + JSON.stringify(f));
  // nothing to press: no control in it, and a group with its name (ARIA names no plain div)
  assert.equal(p.$('night-strip').querySelectorAll('button').length, 0);
  assert.deepEqual([p.$('night-strip').getAttribute('role'), p.$('night-strip').getAttribute('aria-label')], ['group', "The night shift: your day's totals so far"]);
  assert.equal(p.$('end-card').hidden, true);
  S.w21 = windows(p);
  // the day's shed districts, never relit, are still dark (the night shift relights them): OUTAGES has something to count
  S.dark21 = p.game.state.city.districts.filter(d => d.dark).map(d => d.id);
  assert.ok(S.dark21.length > 0, 'dark at 21:00');
  // a guard under the pointer: its press would answer with the lock's note, so the strip stays and no line takes its place
  p.hover('guard-start-gta1');
  const hov = p.look({controls: false});
  assert.deepEqual([lines(hov, 'LINE '), lines(hov, 'NIGHT ').length], [[], 1], 'the strip stays under the pointer:\n' + hov);
  p.hover(null);
  assert.deepEqual(p.h.mods.errors, []);
});

// "Every press answers" (Q-41, desk/README.md §32.8.2) in the night roll: F and a locked press, in blue, with the lock's
// words (moved here from tests/feedback-day.test.js, whose day now ends in the morning: this file plays the night anyway).
// Each is press()/pressKey() with one frame after; the notes and the toast a press left are hidden first.
test('every new press answers: F and a locked press in the night roll, in blue, with the lock\'s words', () => {
  const p = S.p, esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const answers = (x, want, what, key = false) => {
    for (const n of p.doc.querySelectorAll('.dk-note')) n.hidden = true;
    p.$('toast').hidden = true;
    const r = key ? p.pressKey(x, {}, {after: 1 / 60}) : p.press(x, {after: 1 / 60}), shown = diffLooks(r.before, r.during) + '\n' + r.diff;
    assert.match(shown, want, what + ' did not answer as expected; it showed:\n' + shown);
    for (const l of (r.during + '\n' + r.after).split('\n')) {
      if (l.startsWith('NOTE RED ')) assert.match(l, /: ✕ /, what + ': help in red: ' + l);
      if (l.startsWith('TOAST RED ')) assert.match(l, /^TOAST RED (Refused|RE-DISPATCH): /, what + ': help in red: ' + l);
    }
  };
  answers('f', /^TOAST blue FAST waits: the night shift runs the roll to 04:00$/m, 'F at night', true);
  const lock = new RegExp('^(TOAST blue|NOTE blue [^\\n]*?:) ' + esc(NIGHT_LOCK) + '$', 'm');
  answers('guard-start-gta1', lock, 'START at night');
  answers('n', lock, 'RE-DISPATCH (N) at night', true); // (K-24: the key itself is HAND's)
  assert.ok(!p.game.state.log.some(x => x.type === 'start' && x.args.unit === 'gta1'), 'refused, not logged');
  p.hover(null);
  assert.deepEqual(p.h.mods.errors, []);
});

test('D-11 (Q-73): at 01:00 every figure has counted up and the windows are dark; the night ends at 04:00 by itself within 15 real s, the END line at once', () => {
  const p = S.p;
  const r = p.to('01:00', {stop: ['card']});
  assert.equal(r.why, 'target', 'no card in the night');
  const f = figures(p.look({controls: false}));
  for (const k of ['SUPPLY', 'OUTAGES', 'CARBON', 'ALL-IN']) assert.ok(f[k] > S.f21[k], k + ' counts up: ' + S.f21[k] + ' -> ' + f[k]);
  assert.ok(f.SCORE > 0, JSON.stringify(f));
  const w = windows(p);
  assert.ok(w < S.w21 / 3, 'the windows go dark: ' + S.w21 + ' at 21:00, ' + w + ' at 01:00');
  const end = p.until('card');   // (its guard is the day's end: the jump says 'over' on the tick the day is over)
  assert.ok(p.game.state.over && end.why === 'over', 'the roll asks for nothing, no card and no hold: ' + end.why + ' at ' + end.at);
  assert.ok(p.now - S.t21 <= 15000, (p.now - S.t21) + ' real ms from 21:00');
  const look = p.look({controls: false});
  assert.match(look, /^END Day over: 04:00\. /m, 'the end card at once');
  assert.deepEqual(lines(look, 'NIGHT '), [], 'the strip gives way to the card');
  assert.deepEqual(p.h.mods.errors, []);
});

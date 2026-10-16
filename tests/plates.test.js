// O-3 (Q-101): a first shift's cover plates, without an autopilot; O-1: I'VE DONE THIS BEFORE. On a first shift every
// control the line has not yet asked for sits under a plate (a press answers in blue and sends nothing); the line's
// first ask for a control lifts its plate, with Marg's line for it, never during a watch; covering changes no sim input.
// The first shift's header button turns the coach and the plates off, for good. DESK 2026-10-14, headless.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import {injectTrip} from './lib/sim-helpers.js';
import * as G from '../app/game.js';
import {PLATE_NOTE} from '../desk/desk.js';
import {hashState} from '../sim/step.js';
import {V} from '../sim/params.js';

const memStore = () => { const m = new Map(); return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };

test('O-3: at 04:30 the line\'s first ask (a START) lifts the START plate with Marg\'s line; a covered control answers in blue and sends nothing', () => {
  const p = openGame({seed: 20261014, run: false, plates: true});
  assert.ok(!p.game.plates.has('start'), 'START asked at once: lifted');
  for (const g of ['guard', 'battery', 'tie', 'restore', 'dr', 'rert', 'shed']) assert.ok(p.game.plates.has(g), g + ' covered');
  assert.ok(p.game.marg.said.some(l => l.key === 'ask:start' && /^START is yours/.test(l.text)));
  const n = p.game.state.log.length, s = p.press('dial-battery', {after: 1 / 60});
  assert.match(s.during, new RegExp('^NOTE blue [^\\n]*: ' + PLATE_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'));
  p.key('7'); p.key('ArrowRight'); p.key('d');
  assert.equal(p.game.state.log.length, n, 'nothing sent');
  assert.deepEqual(p.h.mods.errors, []);
});

test('O-3: a plate never lifts during a watch; covering changes no sim input (the same day\'s hash with and without plates)', () => {
  const p = openGame({seed: 20261014, plates: true});
  injectTrip(p.game.state, 2 * 3600);   // 06:00 (before the 06:55 hand-back's card)
  assert.equal(p.until('trip', {max: '06:30', line: 'near'}).why, 'trip');
  assert.equal(p.mode(), 'WATCH');
  p.game.objective = Object.assign({}, p.game.objective, {targets: ['ring-guard', 'knob-tie']});
  p.frame();
  assert.ok(p.game.plates.has('guard') && p.game.plates.has('tie'), 'not in the watch');
  // the same inputs on a first shift (plates) and a returning player's (none): one hash
  const runs = [{}, {shifts: 1}].map(o => {
    const g = openGame(Object.assign({seed: 20261014, run: false, plates: true}, o));
    G.sendInput(g.game, {type: 'start', unit: 'ccgt2'});
    G.runTo(g.game, V.PLAYER_START_TICK + 3 * 3600 * V.TICKS_PER_S);
    return {hash: hashState(g.game.state), plates: g.game.plates.size};
  });
  assert.ok(runs[0].plates > 0 && runs[1].plates === 0);
  assert.equal(runs[0].hash, runs[1].hash);
});

test('O-1: I\'VE DONE THIS BEFORE is there on a first shift; it turns the coach and every plate off, for good', () => {
  const storage = memStore(), p = openGame({seed: 20261014, run: false, storage, plates: true});
  assert.equal(p.$('btn-done-before').hidden, false);
  p.click('btn-done-before');
  assert.deepEqual([p.game.plates.size, G.coachOn(p.game), p.$('btn-done-before').hidden], [0, false, true]);
  const st = JSON.parse(storage.m.get(G.SETTINGS_KEY));
  assert.deepEqual([st.coach, st.plates], [false, false]);
  const q = openGame({seed: 20261014, run: false, storage, plates: true});
  assert.deepEqual([q.game.plates.size, G.coachOn(q.game), q.$('btn-done-before').hidden], [0, false, true], 'remembered');
  assert.equal(openGame({seed: 20261014, run: false, shifts: 1, plates: true}).$('btn-done-before').hidden, true, 'not on a later shift');
});

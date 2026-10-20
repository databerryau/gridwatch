// W7 (Q-124 review): an F-7 resume's replay is silent for Marg too. A returning player's day on DESK-WEEKEND 20261017: act2
// at 09:00, the first price below zero said at 10:48, and coal held at its minimum while solar spills from 10:58, which waits
// (a later day has one lesson). The tab saves at 11:06. A new page replays the day a slice a frame, as the shell does (each
// slice of RESUME_BUDGET_MS, then buildVm): the replay's fresh day has room, and coal is true in its later slices, but she
// says nothing there and nothing is kept as seen; her day comes back from the save. The original run jumps headless
// (G.runTo) with a frame at each beat, so the file stays inside the test budget.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {openGame} from './lib/play.js';
import * as G from '../app/game.js';
import {firstsNow, MARG_FROM} from '../app/marg.js';
import {V} from '../sim/params.js';

const SEED = 20261017, TPS = V.TICKS_PER_S, AT = (h, m) => Math.round(((h - 4) * 3600 + m * 60) * TPS);
const mem = new Map([[G.SEEN_KEY, JSON.stringify({shifts: 3})]]);
const storage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
const seenMarg = () => (JSON.parse(mem.get(G.SEEN_KEY) || '{}').marg || {});
const S = {};

before(() => {
  const p = openGame({seed: SEED, storage, run: false});
  assert.equal(p.game.marg.first, false, 'a later day');
  for (const [h, m] of [[8, 55], [9, 2], [10, 48], [11, 6]]) { G.runTo(p.game, AT(h, m)); p.frame(); }
  assert.deepEqual(p.game.marg.said.map(l => l.key), ['take', 'act2', 'first:price']);
  assert.ok(firstsNow(p.game.state, p.game.verdict).includes('coal'), 'coal at its minimum, solar spilling');
  assert.deepEqual(G.margFirsts(p.game, 'CRUISE'), [], 'coal waits: the day\'s one lesson is said');
  assert.deepEqual(seenMarg(), {price: true});
  assert.ok(G.saveResume(p.game), 'the hidden tab saves');
  S.said = p.game.marg.said.map(l => l.key + '@' + l.atS);
  S.tick = p.game.state.tick;
});

test('Q-124 review: a resume\'s replay, a slice a frame with the view model between, says no first-time line and keeps none as seen', () => {
  const q = openGame({seed: SEED, storage, run: false, take: false});
  assert.match(q.$('btn-take').textContent, /^RESUME AT 11:06$/);
  assert.ok(G.resumeBegin(q.game));
  // the shell's frame: resumeStep for its budget, then buildVm. A clock that moves 1 ms each time it is read makes a slice
  // (budget + 1) x 256 ticks after the replayed TAKE THE DESK's half hour, the same on any machine: one to about 10:50,
  // then about 2 grid minutes each
  let ms = 0, slices = 0, coal = 0;
  const now = () => ms++;
  while (q.game.replay && slices < 200) {
    G.resumeStep(q.game, Math.max(23, Math.floor((AT(10, 50) - Math.max(q.game.state.tick, V.PLAYER_START_TICK)) / 256) - 1), now);
    slices++;
    if (!q.game.replay) break;
    if (firstsNow(q.game.state, q.game.verdict).includes('coal')) {
      coal++;
      assert.deepEqual(G.margFirsts(q.game, 'CRUISE'), [], 'nothing to say in a replay');
    }
    G.buildVm(q.game, {nowMs: slices * 16, dtS: 1 / 60});
  }
  assert.equal(q.game.replay, null);
  assert.equal(q.game.resumeFailed, '', 'resumed');
  assert.equal(q.game.state.tick, S.tick);
  assert.ok(coal >= 1, 'the replay passed through coal\'s moment with the view model drawn (' + slices + ' slices)');
  // her day is the save's; of hers on the tray and in the LOG only TAKE THE DESK's line (the replayed press says it, at
  // 04:30 as before), and the browser's memory as it was
  assert.deepEqual(q.game.marg.said.map(l => l.key + '@' + l.atS), S.said);
  assert.deepEqual([...q.game.tray.cards, ...q.game.tray.log].filter(c => c.from === MARG_FROM).map(c => c.text), [q.game.marg.said[0].text]);
  assert.deepEqual(seenMarg(), {price: true}, 'coal not kept as met');
  assert.deepEqual(q.game.director.seen.marg, {price: true});
  // the desk again: coal still waits for another day
  assert.deepEqual(G.margFirsts(q.game, 'CRUISE'), []);
});

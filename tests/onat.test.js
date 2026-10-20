// W7 (Q6): one answer to "when is this unit on" (sim/onat.js), read by the plan's executor, observe(), par, the line and the
// Live Stack. Its rules on hand-made rows; then the moment the brief found them disagreeing: HAND at 04:30 on the 2026-10-14
// daily, where the line said CCGT 2 was 45 minutes from the grid and the Live Stack's ghost 49 (it counted the auto-synchroniser
// HAND does not have). One page opened at 04:30 (tests/lib/play.js), no day played.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {observe} from '../sim/step.js';
import {syncWaitS, startToMinS, onInS, startFromS} from '../sim/onat.js';
import * as PV from '../app/planview.js';
import {clockText} from '../render/format.js';
import {openGame} from './lib/play.js';

const CCGT2 = V.MACHINES.find(m => m.id === 'ccgt2'), AUTO = V.AUTO_SYNC_S;
const MIN = 60;

test('Q6: START to minimum load is T1, the auto-synchroniser\'s wait in AGC only, and T2; a unit on its way by its mode', () => {
  assert.deepEqual([syncWaitS('AGC'), syncWaitS('HAND'), syncWaitS(undefined)], [AUTO, 0, AUTO], 'AGC is the default mode');
  assert.deepEqual([startToMinS(CCGT2, 'AGC'), startToMinS(CCGT2, 'HAND')], [CCGT2.t1S + AUTO + CCGT2.t2S, CCGT2.t1S + CCGT2.t2S]);
  assert.equal(startToMinS(CCGT2, 'HAND'), 45 * MIN, 'CCGT 2: 45 min in HAND (49 in AGC)');
  const row = (mode, timerS = 100) => ({mode, timerS});
  for (const mode of ['AGC', 'HAND']) {
    assert.equal(onInS(row('on'), CCGT2, mode), 0);
    assert.equal(onInS(row('loading'), CCGT2, mode), 100, 'the T2 slope left');
    assert.equal(onInS(row('starting'), CCGT2, mode), 100 + syncWaitS(mode) + CCGT2.t2S, 'T1 left, the sync wait, T2');
    for (const m of ['off', 'tripped', 'unloading', 'shutdown']) assert.equal(onInS(row(m), CCGT2, mode), -1, m + ': not on its way');
  }
  assert.equal(onInS(row('ready'), CCGT2, 'AGC'), 100 + CCGT2.t2S, 'AGC: what is left of the auto-sync');
  assert.equal(onInS(row('ready'), CCGT2, 'AGC', true), CCGT2.t2S, 'on the synchroscope: the player\'s close, now');
  assert.equal(onInS(row('ready', 0), CCGT2, 'HAND'), CCGT2.t2S, 'HAND: the SYNC now');
});

test('Q6: when an off or tripped unit could START: its lockout, a minimum down time under a block, its return from an outage; never without water', () => {
  const off = o => Object.assign({mode: 'off', timerS: 0, startBlock: '', downForS: 86400, outUntilS: -1}, o);
  assert.equal(startFromS(off(), CCGT2, 1000), 1000, 'free: now');
  assert.equal(startFromS(off({startBlock: 'minimum down time: 30 min left', downForS: CCGT2.minDownS - 1800}), CCGT2, 1000), 2800);
  assert.equal(startFromS(off({startBlock: 'on outage until 07:45', outUntilS: 13500}), CCGT2, 1000), 13500, 'its return');
  assert.equal(startFromS(off({startBlock: 'on outage until 05:00', outUntilS: 3600, downForS: CCGT2.minDownS - 9000}), CCGT2, 1000), 10000,
    'an outage hides a minimum down time (§31.8): the later of the two');
  assert.equal(startFromS(off({startBlock: 'no water'}), CCGT2, 1000), -1);
  assert.equal(startFromS({mode: 'tripped', timerS: 900, outUntilS: -1}, CCGT2, 1000), 1900, 'the lockout');
  for (const m of ['on', 'loading', 'starting', 'ready', 'unloading', 'shutdown']) assert.equal(startFromS(off({mode: m}), CCGT2, 1000), -1, m);
});

test('Q6: HAND at 04:30 on the 2026-10-14 daily: the line, the Live Stack\'s ghost and its layer all count CCGT 2 at 45 minutes', () => {
  // the brief's moment (node tools/play.mjs 20261014 --hand look): a first shift's page, HAND at the briefing, the clock at 04:30
  const p = openGame({seed: 20261014, agc: false, storage: null}), obs = observe(p.game.state), stack = p.h.mods.stack;
  assert.deepEqual([p.clock().slice(0, 5), obs.mode], ['04:30', 'HAND']);
  const line = p.look().split('\n').find(l => l.startsWith('LINE ')) || '';
  const m = /Start CCGT 2 now: it takes (\d+) min to reach the grid\./.exec(line);
  assert.ok(m, line);
  assert.equal(Number(m[1]) * MIN, obs.units.find(u => u.id === 'ccgt2').startToMinS, 'the line reads observe()\'s startToMinS');
  assert.equal(Number(m[1]), 45);
  // the Live Stack: CCGT 2's ghost sits at its earliest-start line, 45 minutes on from the stack's now
  const gh = stack.debug.ghosts.find(g => g.unit === 'ccgt2');
  assert.ok(gh, 'CCGT 2 is off: its ghost');
  assert.equal(gh.atS - stack.debug.proj.s, 45 * MIN, 'the ghost: ' + clockText(gh.atS, false));
  assert.equal(PV.layerFacts(obs, 'ccgt').startMin, 45, 'the CCGT layer\'s tip: start 45 min');
  // and its tip, as a pointer resting on the ghost reads it
  const G = stack.debug.geom, cv = stack.el.querySelector('canvas');
  let at = null;
  for (let x = G.x(gh.atS) - 20; x < G.x1 && !at; x += 1) for (let y = G.y1; y < G.y0 && !at; y += 0.5) { const h = stack.debug.hitTest(x, y, true); if (h && h.kind === 'ghost' && h.unit === 'ccgt2') at = {x, y}; }
  assert.ok(at, 'a point on the ghost');
  const r = cv.getBoundingClientRect();
  cv.dispatch('pointermove', {clientX: r.left + at.x * r.width / stack.el.clientWidth, clientY: r.top + at.y * r.height / stack.el.clientHeight});
  assert.match(stack.el.querySelector('.livestack-tip').textContent, new RegExp('^CCGT 2 is off: earliest on ' + clockText(stack.debug.proj.s + 45 * MIN, false) + '\\n'));
  assert.deepEqual(p.h.mods.errors, []);
});

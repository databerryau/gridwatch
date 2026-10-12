// Act I's warned constraints in the grid (desk/README.md §32.6.2, Q-68): the tie import limit and a late
// return from maintenance. Records put on a neutral desk day with tests/lib/inject.js (legacyDesk).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe} from '../sim/step.js';
import {security} from '../sim/grid.js';
import {largestContingency, unitIndex} from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {stateWith} from './lib/inject.js';
import {legacyDesk, clone, TPS} from './lib/sim-helpers.js';

const SEED = 20261007, LIMIT = 450, END = 1200; // the derate: 450 MW until 04:20
const run = (s, S, each) => { while (s.tick < S * TPS) { step(s); if (each && s.tick % TPS === 1) each(s); } return s; };
/** R5's tie term (H-4): R5 less R5 with the tie out. */
const tieR5 = s => { const t = clone(s); t.tie.tripped = true; return security(s, {previewNadirHz: V.F0_HZ}).r5MW - security(t, {previewNadirHz: V.F0_HZ}).r5MW; };

test('Q-68: a tie derate caps imports at the limit, R5\'s tie headroom and L follow it, and its end restores 800 MW', () => {
  const s = stateWith(SEED, legacyDesk(), [{atS: 0, type: 'tieDerate', args: {limitMW: LIMIT, untilS: END}},
    {atS: END, type: 'tieDerateEnd', args: {}}]);
  const free = createState(SEED, legacyDesk());
  assert.equal(s.tie.limitMW, LIMIT);
  assert.equal(observe(s).tie.importLimitMW, LIMIT);
  for (const x of [s, free]) assert.ok(applyInput(x, {type: 'tie', mw: V.TIE_MAX_MW}).ok);
  run(s, 60); run(free, 60);
  assert.equal(s.tie.flowMW, free.tie.flowMW, 'the same ramp below the limit');
  assert.ok(Math.abs(tieR5(s) - Math.min(LIMIT - s.tie.flowMW, V.TIE_RAMP_MW_MIN * V.R5_WINDOW_MIN)) < 1e-9);
  assert.ok(tieR5(free) - tieR5(s) > 300, 'headroom to the limit, not to 800 MW');
  let top = 0;
  run(s, END - 1, x => { top = Math.max(top, x.tie.flowMW); });
  run(free, END - 1);
  assert.equal(top, LIMIT);
  assert.equal(s.tie.flowMW, LIMIT);
  assert.ok(tieR5(s) < 1e-9);
  const L = x => security(x, {previewNadirHz: V.F0_HZ}).lMW;
  assert.equal(L(s), Math.max(LIMIT, ...s.units.filter(u => u.sync).map(u => u.outMW)));
  assert.equal(L(s), largestContingency(s).mw);
  assert.equal(free.tie.flowMW, V.TIE_MAX_MW);
  assert.equal(L(free), V.TIE_MAX_MW);
  assert.ok(s.sec.lMW < free.sec.lMW);
  const out = [];
  while (s.tick <= END * TPS) out.push(...step(s));
  assert.ok(out.some(r => r.code === 'TIE_LIMIT_END'));
  assert.equal(s.tie.limitMW, V.TIE_MAX_MW);
  assert.equal(s.tie.limitUntilS, -1);
  run(s, END + 180);
  assert.ok(s.tie.flowMW > LIMIT + 200, 'imports ramp past the old limit');
});

// CCGT 2 is off at 04:00 on desk: on outage until 05:00, a START booked for 04:30 by planLoad, gta1 for 04:40.
const OUT = 3600, BOOK = 1800, GTA = 2400;
const outage = () => stateWith(SEED, legacyDesk(), [{atS: 0, type: 'unitOutage', args: {unit: 'ccgt2', untilS: OUT}},
  {atS: OUT, type: 'unitReturn', args: {unit: 'ccgt2'}}]);
const c2 = s => s.units[unitIndex('ccgt2')];
const C2 = V.MACHINES[unitIndex('ccgt2')], TO_MIN = C2.t1S + V.AUTO_SYNC_S + C2.t2S;

test('Q-68: START and planStart before the return are refused with the reason; planStart at the return is booked', () => {
  const s = outage();
  assert.equal(c2(s).outUntilS, OUT);
  assert.equal(observe(s).units[unitIndex('ccgt2')].startBlock, 'on outage until 05:00');
  assert.deepEqual(applyInput(s, {type: 'start', unit: 'ccgt2'}), {ok: false, reason: 'on outage until 05:00'});
  assert.deepEqual(applyInput(s, {type: 'planStart', unit: 'ccgt2', atS: BOOK}),
    {ok: false, reason: 'on outage until 05:00 (free to start 60 min from now)'});
  assert.ok(applyInput(s, {type: 'planStart', unit: 'ccgt2', atS: OUT}).ok);
  assert.deepEqual(s.plan.starts, [{unit: 'ccgt2', atS: OUT}]);
});

test('Q-68: a planLoad START before the return waits without blocking later bookings, starts at the return and reaches MIN at the return + startToMin (onAtS)', () => {
  const s = outage();
  assert.ok(applyInput(s, {type: 'planLoad', fromS: 0, stations: {}, tie: [], starts: [['ccgt2', BOOK], ['gta1', GTA]], stops: []}).ok);
  // onAtS: a CCGT key needing both machines lands when CCGT 2 can be at MIN, after its return
  const k = clone(s), lever = k.stations.find(x => x.id === 'ccgt').basePointMW, two = C2.ratingMW + C2.minMW;
  const ramp = 2 * C2.rampMWs, need = OUT + TO_MIN + Math.ceil((two - lever - C2.minMW) / ramp);
  assert.ok(applyInput(k, {type: 'planKey', station: 'ccgt', atS: OUT + TO_MIN, mw: two}).ok);
  assert.deepEqual(k.log.at(-1).args, {station: 'ccgt', atS: need, mw: two});
  assert.ok(applyInput(k, {type: 'planKey', station: 'ccgt', atS: OUT + TO_MIN - 60, mw: two}).ok);
  assert.equal(k.log.at(-1).args.mw, C2.ratingMW, 'before CCGT 2 can be at MIN only CCGT 1 counts');
  run(s, OUT, x => {
    const t = (x.tick - 1) / TPS;
    assert.equal(c2(x).mode, 'off');
    if (t >= BOOK) assert.deepEqual(x.plan.starts[0], {unit: 'ccgt2', atS: BOOK}, 'the booking waits');
    if (t === GTA) assert.equal(x.units[unitIndex('gta1')].mode, 'starting', 'a later booking is not blocked');
  });
  const out = [];
  while (s.tick <= OUT * TPS) out.push(...step(s));
  assert.equal(out.filter(r => r.code === 'PLAN').length, 0, 'nothing dropped');
  assert.ok(out.some(r => r.code === 'UNIT_AVAILABLE') && out.some(r => r.code === 'UNIT_START'));
  assert.equal(c2(s).mode, 'starting');
  assert.deepEqual(s.plan.starts, []);
  run(s, OUT + TO_MIN - 1);
  assert.notEqual(c2(s).mode, 'on');
  run(s, OUT + TO_MIN + 1);
  assert.equal(c2(s).mode, 'on');
  assert.equal(c2(s).schedMW, C2.minMW);
});

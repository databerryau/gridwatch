// Act I's warned constraints in the grid (desk/README.md §32.6.2, Q-68): the tie import limit and a late
// return from maintenance. Records put on a neutral desk day with tests/lib/inject.js (legacyDesk).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe} from '../sim/step.js';
import {security} from '../sim/grid.js';
import {largestContingency, unitIndex} from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {preDispatch} from '../sim/autopilot.js';
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

test('Q-68: the plan\'s tie keys lead from the import the dispatch runs to (setMW capped at the limit), so a lower key under a derate lands on time', () => {
  const s = stateWith(SEED, legacyDesk(), [{atS: 0, type: 'tieDerate', args: {limitMW: LIMIT, untilS: 3600}},
    {atS: 3600, type: 'tieDerateEnd', args: {}}]);
  assert.ok(applyInput(s, {type: 'tie', mw: V.TIE_MAX_MW}).ok);
  run(s, 1300);
  assert.equal(s.tie.flowMW, LIMIT);
  const KEY = 1800, MW = 300, LEAD = (LIMIT - MW) / (V.TIE_RAMP_MW_MIN / 60); // 90 s from 450 MW, not 300 s from 800
  assert.ok(applyInput(s, {type: 'planLoad', fromS: 1300, stations: {}, tie: [[KEY, MW]], stops: [], starts: []}).ok);
  let set = -1;
  run(s, KEY + 1, x => {
    const t = (x.tick - 1) / TPS;
    if (set < 0 && x.tie.setMW === MW) set = t;
    if (t < KEY - LEAD) assert.equal(x.tie.flowMW, LIMIT, 'imports held at the limit until the lead');
    if (t === KEY - 1) assert.ok(Math.abs(x.tie.flowMW - MW) < 1e-9, 'at the key on time');
  });
  assert.equal(set, KEY - LEAD);
});

// CCGT 2 is off at 04:00 on desk: on outage until 07:30, a START booked for 06:00 by planLoad (the contract's case).
const hhS = (h, m = 0) => (h - V.DAY_START_H) * 3600 + m * 60;
const OUT = hhS(7, 30), BOOK = hhS(6), GTA = hhS(6, 5), RE = hhS(6, 10);
const outage = () => stateWith(SEED, legacyDesk(), [{atS: 0, type: 'unitOutage', args: {unit: 'ccgt2', untilS: OUT}},
  {atS: OUT, type: 'unitReturn', args: {unit: 'ccgt2'}}]);
const c2 = s => s.units[unitIndex('ccgt2')];
const C2 = V.MACHINES[unitIndex('ccgt2')], TO_MIN = C2.t1S + V.AUTO_SYNC_S + C2.t2S;

test('Q-68: START and planStart before the return are refused with the reason; planStart at the return is booked', () => {
  const s = outage();
  assert.equal(c2(s).outUntilS, OUT);
  assert.equal(observe(s).units[unitIndex('ccgt2')].startBlock, 'on outage until 07:30');
  assert.deepEqual(applyInput(s, {type: 'start', unit: 'ccgt2'}), {ok: false, reason: 'on outage until 07:30'});
  assert.deepEqual(applyInput(s, {type: 'planStart', unit: 'ccgt2', atS: BOOK}),
    {ok: false, reason: 'on outage until 07:30 (free to start ' + OUT / 60 + ' min from now)'});
  assert.ok(applyInput(s, {type: 'planStart', unit: 'ccgt2', atS: OUT}).ok);
  assert.deepEqual(s.plan.starts, [{unit: 'ccgt2', atS: OUT}]);
});

let par = null, base = null; // par's 04:30 plan; the outage day at 06:10 with it loaded and our bookings (CCGT 2 06:00, GT A1 06:05)
/** Run s to grid second S; CCGT 2 stays off and, from BOOK, its booking waits. Returns the records. */
function held(s, S) {
  const out = [];
  while (s.tick < S * TPS) {
    out.push(...step(s));
    if (s.tick % TPS !== 1) continue;
    const t = (s.tick - 1) / TPS;
    assert.equal(c2(s).mode, 'off');
    if (t >= BOOK) assert.deepEqual(s.plan.starts.find(b => b.unit === 'ccgt2'), {unit: 'ccgt2', atS: BOOK}, 'the booking waits');
    if (t === GTA) assert.equal(s.units[unitIndex('gta1')].mode, 'starting', 'a later booking is not blocked');
  }
  return out;
}
function at0610() {
  if (!base) {
    const s = outage();
    run(s, V.PLAYER_START_S);
    par = preDispatch(observe(s, {dayAhead: true})).load;
    assert.ok(applyInput(s, {...par, starts: [['ccgt2', BOOK], ['gta1', GTA]], stops: []}).ok);
    assert.equal(held(s, RE).filter(r => r.code === 'PLAN').length, 0);
    base = s;
  }
  return clone(base);
}
/** planLoad from RE: par's keys from then on, these starts. */
const reload = (s, starts) => applyInput(s, {...par, fromS: RE, starts, stops: [],
  stations: Object.fromEntries(Object.entries(par.stations).map(([id, ks]) => [id, ks.filter(k => k[0] >= RE)])),
  tie: par.tie.filter(k => k[0] >= RE)});

test('Q-68: a planLoad START at 06:00 with the outage until 07:30 waits without blocking a later booking, starts at the return with no PLAN record, and reaches MIN at the return + startToMin (onAtS)', () => {
  // onAtS: a CCGT key needing both machines lands when CCGT 2 can be at MIN, after its return
  const k = outage();
  assert.ok(applyInput(k, {type: 'planLoad', fromS: 0, stations: {}, tie: [], starts: [['ccgt2', BOOK]], stops: []}).ok);
  const lever = k.stations.find(x => x.id === 'ccgt').basePointMW, two = C2.ratingMW + C2.minMW;
  const need = OUT + TO_MIN + Math.ceil((two - lever - C2.minMW) / (2 * C2.rampMWs));
  assert.ok(applyInput(k, {type: 'planKey', station: 'ccgt', atS: OUT + TO_MIN, mw: two}).ok);
  assert.deepEqual(k.log.at(-1).args, {station: 'ccgt', atS: need, mw: two});
  assert.ok(applyInput(k, {type: 'planKey', station: 'ccgt', atS: OUT + TO_MIN - 60, mw: two}).ok);
  assert.equal(k.log.at(-1).args.mw, C2.ratingMW, 'before CCGT 2 can be at MIN only CCGT 1 counts');
  const s = at0610();
  const out = held(s, OUT);
  while (s.tick <= OUT * TPS) out.push(...step(s));
  assert.equal(out.filter(r => r.code === 'PLAN').length, 0, 'nothing dropped');
  assert.ok(out.some(r => r.code === 'UNIT_AVAILABLE') && out.some(r => r.code === 'UNIT_START'));
  assert.equal(c2(s).mode, 'starting');
  assert.equal(s.plan.starts.find(b => b.unit === 'ccgt2'), undefined);
  run(s, OUT + TO_MIN - 1);
  assert.notEqual(c2(s).mode, 'on');
  run(s, OUT + TO_MIN + 1);
  assert.equal(c2(s).mode, 'on');
  assert.equal(c2(s).schedMW, C2.minMW);
});

test('Q-68: a held START is due at the return: a reload replaces it (none: no start at 07:30; 07:45: one booking, run then), and a STOP before the return is refused', () => {
  const ccgt2 = s => s.plan.starts.filter(b => b.unit === 'ccgt2');
  const none = at0610();
  assert.ok(reload(none, []).ok);
  assert.deepEqual(ccgt2(none), []);
  const out = [];
  while (none.tick < (OUT + 60) * TPS) out.push(...step(none));
  assert.equal(c2(none).mode, 'off', 'no start at the return');
  assert.equal(out.filter(r => r.code === 'PLAN').length, 0);
  const later = at0610(), L = hhS(7, 45);
  assert.ok(reload(later, [['ccgt2', L]]).ok);
  assert.deepEqual(ccgt2(later), [{unit: 'ccgt2', atS: L}], 'one booking');
  const recs = [];
  while (later.tick <= L * TPS) {
    recs.push(...step(later));
    if (later.tick === (L - 1) * TPS + 1) assert.equal(c2(later).mode, 'off', 'not at the return');
  }
  assert.equal(c2(later).mode, 'starting');
  assert.equal(recs.filter(r => r.code === 'PLAN').length, 0, 'nothing dropped');
  const stop = at0610();
  assert.deepEqual(applyInput(stop, {type: 'planStop', unit: 'ccgt2', atS: hhS(7, 20)}), {ok: false, reason: 'unit is off'});
  assert.ok(applyInput(stop, {type: 'planStop', unit: 'ccgt2', atS: hhS(7, 40)}).ok);
});

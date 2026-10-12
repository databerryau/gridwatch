// Q-73, the night shift (desk/README.md §32.7.1): one played evening, the player's leftovers, the
// night from 21:00 run twice from the same state: (a) par carrying on (runPar swaps its memory for
// AP.nightMemo) and (b) a fresh player-mode system with no input (app/system.js swaps to the same
// memo). Built once in before(); the tests read what the runs recorded. Plus one no-input day.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {runPar} from '../sim/autopilot.js';
import {step, applyInput, hashState} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {NIGHT_S, hhmm} from '../sim/clock.js';
import {createSystem, systemInputs, redispatch} from '../app/system.js';
import {V} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import {ticksAt, TPS, clone} from './lib/sim-helpers.js';

// DESK 20261007, a heatwave: at 20:30 par runs all four coal machines, both CCGTs and all five GTs.
const SEED = 20261007, S_AT = (h, m = 0) => ticksAt(h, m) / TPS, STOP_AT = S_AT(22);
const GAS = /^(ccgt|gt)/, BAD = d => d.dark && (d.shedBy === 'ufls' || d.shedBy === 'directed');
let E = null;

before(() => {
  const r = runPar(SEED, DESK, {untilTick: ticksAt(20, 30) + 1});
  const st = r.state, on = st.units.filter(u => u.mode === 'on'), s2030 = clone(st);
  // The player's leftovers at 20:30: the diesel armed, a STOP booked for 22:00 on a CCGT par runs, a
  // discharge order and a 300-MW GUARD. Then nobody touches the desk until the night shift takes it.
  const left = [{type: 'armRERT'}, {type: 'planStop', unit: 'ccgt1', atS: STOP_AT}, {type: 'battery', mode: 'discharge', mw: 150}, {type: 'guard', mw: 300}];
  for (const x of left) assert.equal(applyInput(st, x).ok, true, JSON.stringify(x));
  while (st.tick < NIGHT_S * TPS + 1) step(st);
  assert.ok(r.memo.nextS <= NIGHT_S && !r.memo.night, 'par\'s first night decision is at 21:00:00, this tick');
  const s21 = clone(st), n0 = st.log.length, gas21 = on.filter(u => GAS.test(u.id)).map(u => u.id);
  // (a) par carries on; what the night does is sampled once a grid second.
  const bad = [], stop = {booked: false, ran: -1}, ccgt1 = st.units.findIndex(u => u.id === 'ccgt1');
  const a = runPar(SEED, DESK, {state: clone(s21), memo: clone(r.memo), onStep: s => {
    if (s.tick % TPS) return;
    for (const d of s.city.districts) if (BAD(d) && d.darkSinceS >= NIGHT_S && !bad.includes(d.id)) bad.push(d.id);
    if (s.tick === (STOP_AT - 1) * TPS) stop.booked = s.plan.stops.some(b => b.unit === 'ccgt1' && b.atS === STOP_AT);
    if (stop.ran < 0 && s.units[ccgt1].mode !== 'on') stop.ran = s.tick / TPS - 1;
  }});
  const night = a.log.slice(n0).map((x, i) => ({s: (x.tick - 1) / TPS, type: x.type, args: x.args, origin: a.origins[n0 + i]}));
  // (b) a fresh player-mode system on the same 21:00 state, no input.
  const b = clone(s21), sys = createSystem({commit: 'player'}), batches = [];
  while (!b.over) {
    const x = systemInputs(sys, b);
    if (x.length) batches.push({s: (b.tick - 1) / TPS, origin: sys.origin, n: x.length});
    step(b, x);
  }
  E = {r, a, b, sys, n0, night, batches, bad, stop, gas21, guard21: s21.battery.guardMW, s2030};
});

test('Q-73: the night shift swaps in at 21:00 and stands the evening down at its pace: the diesel first, then the gas units; nothing new sheds; the day ends at 04:00, not black', () => {
  const {a, night, bad, gas21} = E;
  assert.ok(a.memo.night && a.memo.proxy === 'night', 'runPar swapped par\'s memory for the night memo, in place');
  assert.equal(a.state.over && !a.black, true);
  assert.deepEqual(bad, [], 'no UFLS or directed district dark from 21:00');
  const acts = night.filter(x => /^rule[1-9]$/.test(x.origin));
  for (let i = 1; i < acts.length; i++) assert.ok(acts[i].s - acts[i - 1].s >= V.NIGHT_ACTION_S, 'one action per NIGHT_ACTION_S: ' + hhmm(acts[i - 1].s) + ', ' + hhmm(acts[i].s));
  // the RERT stood down within PAR_RERT_STANDDOWN_MIN of 21:00 plus one decision (rule 4 asks it first)
  const sd = night.find(x => x.type === 'standDownRERT');
  assert.ok(sd && sd.origin === 'rule4' && sd.s <= NIGHT_S + V.PAR_RERT_STANDDOWN_MIN * 60 + V.PAR_DECIDE_EVERY_S, 'stood down at ' + (sd && hhmm(sd.s)));
  // The gas units: three of the seven are stopped by rule 4 before 22:00 (21:15, 21:25, 21:43 measured),
  // the first by 21:30; every one had run PAR_DECOMMIT_MIN_ON_MIN. Par's day pace (3 real s at
  // 2,100x: one action per 105 grid-min) would have stopped one.
  const stops = night.filter(x => x.type === 'stop' && x.origin === 'rule4' && GAS.test(x.args.unit));
  assert.ok(stops.length >= 3 && stops[0].s <= S_AT(21, 30), 'rule 4 stops: ' + stops.map(x => x.args.unit + ' ' + hhmm(x.s)).join(', '));
  assert.ok(stops.filter(x => x.s < S_AT(22)).length >= 3);
  for (const x of stops.filter(x => x.s < S_AT(22))) assert.ok(gas21.includes(x.args.unit), x.args.unit + ' was on at 21:00');
});

test('Q-73: the player\'s leftovers: the booked STOP is kept and runs at 22:00; the GUARD left on is rule 2\'s from 21:00 (stepped down at its first chance)', () => {
  const {night, stop, guard21} = E;
  assert.equal(stop.booked, true, 'ccgt1\'s 22:00 STOP still booked at 21:59:59 (the night memo carries obs.plan.stops)');
  assert.equal(stop.ran, STOP_AT, 'and the plan ran it at 22:00: ' + hhmm(stop.ran));
  assert.equal(guard21, 300);
  const g = night.filter(x => x.type === 'guard');
  assert.ok(g.length && g[0].args.mw < guard21 && g[0].s <= S_AT(21, 30), 'the first GUARD move steps it down by 21:30: ' + (g[0] && hhmm(g[0].s) + ' ' + g[0].args.mw));
  for (const x of g) assert.ok(x.origin === 'rule2' && x.args.mw <= V.PAR_GUARD_MAX_MW, hhmm(x.s) + ' ' + x.origin + ' ' + x.args.mw);
});

test('Q-73: one night for par and for the player: from par\'s state before its first night decision, runPar carrying on and a fresh player-mode system with no input end at 04:00 with the same hash; every system input from 21:00 has origin night', () => {
  const {a, b, sys, n0, batches} = E;
  assert.ok(sys.night && sys.night.night, 'the system holds the night memo (sys.night)');
  assert.deepEqual(JSON.parse(JSON.stringify(sys.night)), sys.night, 'plain JSON');
  assert.ok(batches.length > 10);
  for (const x of batches) assert.equal(x.origin, 'night', hhmm(x.s));
  assert.deepEqual(b.log.slice(n0), a.log.slice(n0), 'the same inputs, tick for tick');
  assert.equal(hashState(b), hashState(a.state));
  assert.match(redispatch(sys, b).reason, /over/);
});

// (A whole no-input day costs about 2.7 s here: the spike ran it once, desk/README.md §32.11. This is
// its evening: the player-mode system alone from 20:30, with the evening's UFLS left dark.)
test('Q-73: a no-input evening in player mode: the dispatch runs until the night shift takes the desk at 21:00 (none after), the roll ends at 04:00, not black', () => {
  const s = clone(E.s2030), sys = createSystem({commit: 'player'}), late = [];
  for (const id of ['SAL1', 'TAL1', 'RED1']) fleet.setDistrictDark(s, s.city.districts.findIndex(d => d.id === id), true, 'ufls');
  let at21 = null;
  while (!s.over) {
    const x = systemInputs(sys, s);
    if (x.length && s.tick > NIGHT_S * TPS) late.push(sys.origin);
    if (s.tick === NIGHT_S * TPS + 1) at21 = {dispatchS: sys.dispatchS, sig: sys.sig, redispatch: redispatch(sys, s).reason};
    step(s, x);
  }
  assert.equal(s.black, false);
  assert.equal(s.tick, V.DAY_TICKS);
  assert.ok(at21.dispatchS > S_AT(20, 30) && at21.dispatchS < NIGHT_S, 'the player-mode dispatch ran in the evening: ' + hhmm(at21.dispatchS));
  assert.ok(late.length > 0 && late.every(o => o === 'night'));
  assert.deepEqual([sys.dispatchS, sys.sig], [at21.dispatchS, at21.sig], 'no player-mode dispatch from 21:00');
  assert.equal(at21.redispatch, 'the night shift has the desk');
});

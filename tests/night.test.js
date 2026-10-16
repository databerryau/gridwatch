// Q-73, the night shift (desk/README.md §32.7.1): one played evening, the player's leftovers, the
// night from 21:00 run twice from the same state: (a) par carrying on (runPar swaps its memory for
// AP.nightMemo) and (b) a fresh player-mode system with no input (app/system.js swaps to the same
// memo). Built once in before(); the tests read what the runs recorded. Plus one no-input evening.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, decide} from '../sim/autopilot.js';
import {step, applyInput, hashState, observe} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {NIGHT_S, hhmm} from '../sim/clock.js';
import {createSystem, systemInputs, redispatch, heldByHand} from '../app/system.js';
import {V} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import {ticksAt, TPS, clone} from './lib/sim-helpers.js';
import {injectEvent} from './lib/inject.js';

// DESK 20261008, a storm day (MILD), one of the spike's three: par's evening is clean at 20:30 (no UFLS
// or directed district dark), it runs both CCGTs, gta1 and gtb1, and it has not armed the diesel, so
// the leftovers below are the player's (each one asserted, so a sim change that moves the evening fails here).
const SEED = 20261008, S_AT = (h, m = 0) => ticksAt(h, m) / TPS, STOP_AT = S_AT(22), STOP_UNIT = 'ccgt1';
const GAS = /^(ccgt|gt)/, BAD = d => d.dark && (d.shedBy === 'ufls' || d.shedBy === 'directed');
let E = null;

before(() => {
  const r = runPar(SEED, DESK, {untilTick: ticksAt(20, 30) + 1});
  const st = r.state, s2030 = clone(st);
  assert.ok(!st.city.districts.some(BAD) && !st.rert.armed, 'the fixture: par\'s 20:30 is clean and the diesel is not armed');
  // The player's leftovers at 20:30: the diesel armed, a STOP booked for 22:00 on a CCGT par runs, a
  // discharge order and a 300-MW GUARD. Then nobody touches the desk until the night shift takes it.
  const left = [{type: 'armRERT'}, {type: 'planStop', unit: STOP_UNIT, atS: STOP_AT}, {type: 'battery', mode: 'discharge', mw: 150}, {type: 'guard', mw: 300}];
  for (const x of left) assert.equal(applyInput(st, x).ok, true, JSON.stringify(x));
  while (st.tick < NIGHT_S * TPS + 1) step(st);
  assert.ok(r.memo.nextS <= NIGHT_S && !r.memo.night, 'par\'s first night decision is at 21:00:00, this tick');
  const s21 = clone(st), n0 = st.log.length;
  // (a) par carries on. Sampled once a grid second; what each night input's decision saw (onStep runs
  // after the step that makes a decision's tick, so `snap` is that state) is kept by log index.
  const bad = [], stop = {booked: false, ran: -1}, ui = st.units.findIndex(u => u.id === STOP_UNIT), saw = [];
  let snap = null;
  const a = runPar(SEED, DESK, {state: clone(s21), memo: clone(r.memo), onStep: s => {
    while (saw.length < s.log.length) saw.push(snap && s.log[saw.length].tick === snap.tick ? snap : null);
    if (s.tick % TPS !== 1) return;
    snap = {tick: s.tick, nadir: s.sec.previewNadirHz, guard: s.battery.guardMW, soc: s.battery.socMWh, short: s.agc.unmetMW > 0 || s.phys.fHz < V.NORMAL_LO_HZ || s.fos.outsideS > 0,
      up: Object.fromEntries(s.units.map(u => [u.id, Math.floor(s.tick / TPS) - u.upSinceS]))};
    for (const d of s.city.districts) if (BAD(d) && d.darkSinceS >= NIGHT_S && !bad.includes(d.id)) bad.push(d.id);
    if (s.tick === (STOP_AT - 1) * TPS + 1) stop.booked = s.plan.stops.some(b => b.unit === STOP_UNIT && b.atS === STOP_AT);
    if (stop.ran < 0 && s.units[ui].mode !== 'on') stop.ran = (s.tick - 1) / TPS; // the second whose first tick ran it
  }});
  const night = a.log.slice(n0).map((x, i) => ({s: (x.tick - 1) / TPS, type: x.type, args: x.args, origin: a.origins[n0 + i], saw: saw[n0 + i]}));
  // (b) a fresh player-mode system on the same 21:00 state, no input.
  const b = clone(s21), sys = createSystem({commit: 'player'}), batches = [];
  while (!b.over) {
    const x = systemInputs(sys, b);
    if (x.length) batches.push({s: (b.tick - 1) / TPS, origin: sys.origin, n: x.length});
    step(b, x);
  }
  E = {r, a, b, sys, n0, night, batches, bad, stop, s21, s2030};
});

test('Q-73: the night shift swaps in at 21:00 and stands the evening down at its pace: the diesel first, then the gas units rule 4 frees while the trip preview leaves rule 2 an answer that is not a start (never the one a booked STOP takes, nothing started in the hour after); nothing new sheds; the day ends at 04:00, not black', () => {
  const {a, night, bad, s21} = E;
  assert.ok(a.memo.night && a.memo.proxy === 'night', 'runPar swapped par\'s memory for the night memo, in place');
  assert.equal(a.state.over && !a.black, true);
  assert.deepEqual(bad, [], 'no UFLS or directed district dark from 21:00');
  const acts = night.filter(x => /^rule[1-9]$/.test(x.origin));
  for (let i = 1; i < acts.length; i++) assert.ok(acts[i].s - acts[i - 1].s >= V.NIGHT_ACTION_S, 'one action per NIGHT_ACTION_S: ' + hhmm(acts[i - 1].s) + ', ' + hhmm(acts[i].s));
  // the RERT armed at 21:00 is stood down within PAR_RERT_STANDDOWN_MIN of 21:00 plus one decision (§32.7.1);
  // nightMemo seeds its clock, so it is rule 4's first night action (21:00 measured)
  assert.equal(s21.rert.armed, true);
  const sd = night.find(x => x.type === 'standDownRERT');
  assert.ok(sd && sd.origin === 'rule4' && sd.s <= NIGHT_S + V.PAR_RERT_STANDDOWN_MIN * 60 + V.PAR_DECIDE_EVERY_S, 'stood down at ' + (sd && hhmm(sd.s)));
  assert.equal(acts.find(x => x.origin === 'rule4'), sd);
  // Rule 4's gas stops (rule 4 frees a unit as the demand falls, so §32.7.1's "by the later of 21:10 and
  // 90 min on + 10" does not hold and goes back to the integrator). On this date: gtb1 by 22:30 (22:21
  // measured), then gta1 (03:16); ccgt2 runs to 04:00 (from 22:46 the GUARD is at 300-400, so its stop
  // would leave rule 2 only a start). Each of a unit that had run PAR_DECOMMIT_MIN_ON_MIN when its decision
  // looked, never the CCGT whose 22:00 STOP is booked, each decision saw a trip preview that left rule 2
  // an answer that is not a start, and nothing is started in the hour after a stop (the need tests count
  // the booked STOP from its time; without that, gtb1 is stopped at 21:29 and started again at 22:19).
  const stops = night.filter(x => x.type === 'stop' && x.origin === 'rule4' && GAS.test(x.args.unit));
  assert.deepEqual(stops.map(x => x.args.unit), ['gtb1', 'gta1'], stops.map(x => x.args.unit + ' ' + hhmm(x.s)).join(', '));
  assert.ok(stops[0].s <= S_AT(22, 30), 'gtb1 at ' + hhmm(stops[0].s));
  for (const x of stops) {
    const w = x.saw, why = x.args.unit + ' at ' + hhmm(x.s) + (w ? ', preview ' + w.nadir.toFixed(2) + ' Hz, GUARD ' + w.guard : '');
    assert.ok(w && w.up[x.args.unit] >= V.PAR_DECOMMIT_MIN_ON_MIN * 60, why);
    assert.ok(x.args.unit !== STOP_UNIT || x.s > STOP_AT);
    const room = w.guard + V.PAR_NIGHT_STOP_GUARD_MW;
    assert.ok(w.nadir > V.PAR_NADIR_RELAX_HZ || (w.nadir >= V.PAR_NADIR_MIN_HZ && room <= V.PAR_GUARD_MAX_MW &&
      w.soc * 3600 >= room * V.GUARD_SUSTAIN_S), why);
    const again = night.find(y => y.type === 'start' && y.s > x.s && y.s < x.s + 3600);
    assert.equal(again, undefined, x.args.unit + ' stopped ' + hhmm(x.s) + (again ? ', ' + again.args.unit + ' started ' + hhmm(again.s) + ' by ' + again.origin : ''));
  }
});

test('Q-73: a booked STOP the executor will drop counts for nothing: rule 4 stands gtb1 down as with no booking (a STOP its minimum up time blocks), and holds it while a STOP that runs takes ccgt2', () => {
  const k = E.night.findIndex(x => x.type === 'stop' && x.origin === 'rule4'), T = E.night[k].s * TPS + 1;
  const r = runPar(SEED, DESK, {state: clone(E.s21), memo: clone(E.r.memo), untilTick: T});
  // ccgt2 (on since the morning) with a STOP booked for an hour on, and its breaker closed upForMin ago
  const ask = upForMin => {
    const s = clone(r.state), i = s.units.findIndex(u => u.id === 'ccgt2'), now = Math.floor(s.tick / TPS);
    if (upForMin !== undefined) {
      s.units[i].upSinceS = now - upForMin * 60;
      assert.equal(applyInput(s, {type: 'planStop', unit: 'ccgt2', atS: now + 3600}).ok, true);
    }
    return decide(observe(s), clone(r.memo));
  };
  const minUp = V.MACHINES.find(m => m.id === 'ccgt2').minUpS / 60;
  assert.deepEqual(ask(), [{type: 'stop', unit: 'gtb1'}], 'the night\'s own decision at ' + hhmm(E.night[k].s));
  assert.deepEqual(ask(minUp - 90), [{type: 'stop', unit: 'gtb1'}], 'the STOP falls 30 min inside ccgt2\'s minimum up time');
  assert.deepEqual(ask(minUp), [], 'a STOP that runs: gtb1 is held');
});

test('Q-73: the player\'s leftovers: the booked STOP is kept and runs at 22:00; the GUARD left on is rule 2\'s from 21:00, moved only as the trip preview its decision saw asks', () => {
  const {night, stop, s21} = E;
  assert.equal(stop.booked, true, STOP_UNIT + '\'s 22:00 STOP still booked at 21:59:59 (the night memo carries obs.plan.stops)');
  assert.equal(stop.ran, STOP_AT, 'and the plan ran it at 22:00: ' + hhmm(stop.ran));
  assert.equal(s21.battery.guardMW, 300);
  // (§32.7.1's "stepped to 0 by 21:30" does not hold under rule 2 and goes back to the integrator: on
  // this date the preview with 300 MW on is below PAR_NADIR_MIN_HZ, and the night raises it to 400 at 21:06.)
  const g = night.filter(x => x.type === 'guard');
  assert.ok(g.length && g[0].s <= S_AT(21, 30), 'the night took the GUARD over: ' + (g[0] && hhmm(g[0].s) + ' ' + g[0].args.mw));
  let mw = s21.battery.guardMW;
  for (const x of g) {
    const why = hhmm(x.s) + ' ' + x.origin + ' ' + mw + ' -> ' + x.args.mw + ', preview ' + (x.saw && x.saw.nadir.toFixed(2)) + ' Hz';
    assert.ok(x.origin === 'rule2' && x.saw && x.args.mw <= V.PAR_GUARD_MAX_MW, why);
    if (x.args.mw > mw) assert.ok(x.args.mw === mw + V.PAR_GUARD_STEP_MW && x.saw.nadir < V.PAR_NADIR_MIN_HZ && !x.saw.short, 'up: ' + why);
    else if (!(x.args.mw === 0 && x.saw.short)) assert.ok(x.args.mw === mw - V.PAR_GUARD_STEP_MW && x.saw.nadir > V.PAR_NADIR_RELAX_HZ, 'down: ' + why);
    mw = x.args.mw;
  }
  assert.ok(g.some(x => x.args.mw > s21.battery.guardMW) && g.some(x => x.args.mw < s21.battery.guardMW), 'both ways on this date');
});

test('Q-73: one night for par and for the player: from par\'s state before its first night decision, runPar carrying on and a fresh player-mode system with no input end at 04:00 with the same hash; the night plan goes out at the swap; every system input from 21:00 has origin night', () => {
  const {a, b, sys, n0, night, batches} = E;
  assert.ok(sys.night && sys.night.night, 'the system holds the night memo (sys.night)');
  assert.deepEqual(JSON.parse(JSON.stringify(sys.night)), sys.night, 'plain JSON');
  assert.ok(batches.length > 10);
  for (const x of batches) assert.equal(x.origin, 'night', hhmm(x.s));
  assert.deepEqual(b.log.slice(n0), a.log.slice(n0), 'the same inputs, tick for tick');
  assert.equal(hashState(b), hashState(a.state));
  // the night memo's plan is re-dispatched at the swap (amendDue), the booked STOP in it
  const first = night.filter(x => x.s === NIGHT_S && x.type === 'planLoad');
  assert.ok(first.some(x => x.origin === 'replan' && x.args.stops.some(e => e[0] === STOP_UNIT && e[1] === STOP_AT)), JSON.stringify(first.map(x => x.origin)));
  assert.match(redispatch(sys, b).reason, /over/);
  // the night shift's tie inputs (rules 1 and 2) are not a hand edit: at night nothing is held by hand
  const tied = clone(b);
  tied.log.push({tick: tied.tick, type: 'tie', args: {mw: 300}});
  assert.equal(heldByHand(clone(sys), tied), false);
  tied.control.nightShift = false;
  // (K-24: by day on an AGC day the tie knob moves the tie and never holds the levers; on a HAND day it does)
  assert.equal(heldByHand(clone(sys), tied), false, 'AGC: the dispatch holds the tie there');
  tied.control.mode = 'HAND';
  assert.equal(heldByHand(clone(sys), tied), true, 'HAND: the same input is the player\'s hand on the tie');
});

test('Q-73: the night answers only the night\'s trips: a unit trip at 20:45 that par answered is not answered again at the swap (the night memo has seen the day\'s contingencies)', () => {
  const s = injectEvent(clone(E.s2030), {atS: S_AT(20, 45), type: 'unitTrip', args: {rule: 'largest', lockoutS: 3600}});
  // (its watch runs past 21:00, so the swap is at the first decision after it; the trip's window is open to 21:15)
  const r = runPar(SEED, DESK, {state: s, memo: clone(E.r.memo), untilTick: ticksAt(21, 10)});
  const by = (o, from, to) => r.log.filter((x, i) => r.origins[i] === o && x.tick > from * TPS && x.tick <= to * TPS);
  assert.ok(r.memo.night && r.state.conts.length > E.s2030.conts.length, 'the trip fell and the night memo took over');
  assert.ok(by('rule1', S_AT(20, 45), NIGHT_S).length > 0, 'par answered the trip by rule 1 before 21:00');
  assert.ok(by('replan', NIGHT_S, S_AT(21, 10)).length > 0, 'the night memo has decided');
  assert.deepEqual(by('rule1', NIGHT_S, S_AT(21, 10)), [], 'and it did not answer the trip again');
});

// (A whole no-input day costs about 3 s here; the spike ran it once, for §32.11's wave-2 record. This is
// its evening: the player-mode system alone from 20:30, with three districts left dark by UFLS.)
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

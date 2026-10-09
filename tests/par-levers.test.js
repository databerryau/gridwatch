// Agent "par" (2b wave 2; desk/README.md §31.6, §31.9.9, Q-58): S-14 rules 1 and 5 in par, the
// day-ahead line without flex (preDispatch, litDayAhead) and the system's commitSig. Poked
// observations of one par day (DESK seed 3, HOT: both levers offered), never a whole day.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, createAutopilot, decide, preDispatch, replan, aimFlex} from '../sim/autopilot.js';
import {createState, step, observe, applyInput} from '../sim/step.js';
import {createSystem, systemInputs, commitSig} from '../app/system.js';
import {V} from '../sim/params.js';
import {DESK, CLASSIC} from '../content/scenarios.js';
import {ticksAt, TPS, clone} from './lib/sim-helpers.js';

const S_AT = (h, m = 0) => ticksAt(h, m) / TPS;
const RULE = /^rule[1-9]$/;

// Par's day on DESK seed 3 at 09:30 and at 16:00 (run once; callers get JSON copies).
let DAY = null;
function parDay(h) {
  if (!DAY) {
    const a = runPar(3, DESK, {untilTick: ticksAt(9, 30) + 1});
    DAY = {9: clone({state: a.state, memo: a.memo})};
    const b = runPar(3, DESK, {state: clone(a.state), memo: clone(a.memo), untilTick: ticksAt(16) + 1});
    DAY[16] = clone({state: b.state, memo: b.memo});
  }
  return clone(DAY[h]);
}

/** An observation in which rules 1-7 want nothing: no trip, security comfortable, no unit to start or stop, the battery idle at its reserve, nothing spilled. */
function quiet(obs) {
  obs.contingencies = [];
  Object.assign(obs.sec, {r5MW: 2000, lMW: 600, lKind: 'unit', lId: 'coal1', previewNadirHz: 49.7});
  Object.assign(obs.agc, {unmetMW: 0, requestMW: 0}); obs.f.hz = 50; obs.fos.outsideS = 0;
  for (const u of obs.units) { if (u.mode === 'off') u.startBlock = 'minimum down time: 2 h left'; u.upForS = 0; }
  Object.assign(obs.battery, {mode: 'idle', orderMW: 0, guardMW: 0, fullHold: false, socMWh: V.PAR_BATT_RESERVE_FRAC * V.BATT_MWH});
  obs.wind.autoMW = 0; obs.solar.autoMW = 0; obs.price.mwh = 100;
  return obs;
}
const col = (fc, s) => Math.round((s - fc.fromS) / fc.stepS) - 1;
const flexOut = d => d.filter(x => x.type === 'flex');

// ---------------------------------------------------------------- S-14 rule 1: the soak (first in rule 6)

// 09:30, a poked forecast whose minimum is 12:30 (the soak window's columns run to 14:00).
function morning(poke = () => {}, proxy = 'par') {
  const obs = quiet(observe(parDay(9).state)), fc = obs.forecast;
  fc.demandP50 = fc.demandP50.map((x, k) => (k === col(fc, S_AT(12, 30)) ? 1500 : 2500));
  obs.msl = {level: 1, minMW: 1500, atS: S_AT(12, 30), sinceS: obs.s - 300};
  obs.battery.socMWh = V.PAR_BATT_CHARGE_TO * V.BATT_MWH; // full for the window: no order
  const memo = createAutopilot({proxy});
  poke(obs, memo);
  return {d: decide(obs, memo), memo, obs};
}

test('S-14 rule 1 (Q-58): on the MSL1 notice par soaks the free suburb with the most soak MW, centred on the forecast minimum; origin rule6; the sim accepts it', () => {
  let r = morning();
  assert.deepEqual(r.d, [{type: 'flex', suburb: 'HAZ', lever: 'soak', atS: S_AT(10, 30)}], 'HAZELTON 140 MW, 12:30 - 2 h');
  assert.equal(r.d[0].atS, aimFlex(r.obs.forecast, r.obs.levers, 'HAZ', 'soak'));
  assert.equal(r.memo.lastOrigin, 'rule6');
  assert.ok(RULE.test(r.memo.lastOrigin));
  assert.equal(applyInput(parDay(9).state, r.d[0]).ok, true);
  // One suburb per decision: HAZ booked, the next is RED (110 MW); eligibility only through `block`.
  r = morning(obs => { obs.levers.suburbs.find(x => x.id === 'HAZ').soak.block = 'one soak a day: already booked'; });
  assert.deepEqual(flexOut(r.d), [{type: 'flex', suburb: 'RED', lever: 'soak', atS: S_AT(10, 30)}]);
  r = morning(obs => { for (const x of obs.levers.suburbs) x.soak.block = 'too late: it would start in the past'; });
  assert.deepEqual(flexOut(r.d), []);
  // competent and commitAll plan ahead too; lean and planOnly never send flex.
  for (const p of ['competent', 'commitAll']) assert.deepEqual(flexOut(morning(() => {}, p).d).length, 1, p);
  for (const p of ['lean', 'planOnly']) assert.deepEqual(flexOut(morning(() => {}, p).d), [], p);
});

test('S-14 rule 1: not on spill alone, not without a notice ahead, not before the minimum is in view (aimFlex -1 waits), not against the pace, never in a watch', () => {
  // No notice (level 0), or a notice for the present second (a potline trip: a measured value).
  let r = morning(obs => { obs.msl.level = 0; });
  assert.deepEqual(r.d, []);
  r = morning(obs => { obs.msl.atS = obs.s; });
  assert.deepEqual(r.d, []);
  // Spill alone: the battery takes it (S-14 rule 2), no soak.
  r = morning(obs => { obs.msl.level = 0; obs.solar.autoMW = 400; obs.price.mwh = -20; obs.battery.socMWh = 500; });
  assert.equal(r.d.length, 1);
  assert.equal(r.d[0].type, 'battery');
  // The minimum on the forecast's last column while the window runs past it: wait (the battery's turn).
  r = morning(obs => { const fc = obs.forecast; fc.demandP50 = fc.demandP50.map((x, k) => (k === fc.n - 1 ? 1400 : 2500)); });
  assert.equal(r.obs.forecast.fromS + r.obs.forecast.n * r.obs.forecast.stepS, S_AT(14));
  assert.equal(aimFlex(r.obs.forecast, r.obs.levers, 'HAZ', 'soak'), -1);
  assert.deepEqual(r.d, []);
  // The pace (one action per 3 real s: 24 grid-min at 09:30) and the watch.
  r = morning((obs, memo) => { memo.lastActTick = obs.tick - 600 * TPS; });
  assert.deepEqual(r.d, []);
  r = morning(obs => { obs.inWatch = true; });
  assert.deepEqual(r.d, []);
});

test('S-14 rule 1 in par\'s own day: a notice in state books through runPar, origin rule6, and every discrete origin stays rule1-rule9', () => {
  const {state, memo} = parDay(9);
  Object.assign(state.msl, {level: 1, minMW: 1550, atS: S_AT(12, 30)}); // until the sim's next 5-minute check
  memo.lastActTick = -1;
  const n0 = state.log.length;
  const r = runPar(3, DESK, {state, memo, untilTick: state.tick + 120 * TPS});
  const mine = r.log.map((x, i) => [x, r.origins[i]]).slice(n0);
  const flex = mine.filter(([x]) => x.type === 'flex');
  assert.equal(flex.length, 1, JSON.stringify(mine.map(([x, o]) => o + ' ' + x.type)));
  assert.equal(flex[0][1], 'rule6');
  assert.equal(flex[0][0].args.suburb, 'HAZ');
  assert.equal(r.state.levers.blocks.length, 1);
  for (const [x, o] of mine) assert.ok(RULE.test(o) || o === 'plan' || o === 'replan', o + ' ' + x.type);
});

// ---------------------------------------------------------------- S-14 rule 5: air-con (rule 8, before armRERT)

// 16:00 (the forecast runs to 20:30): a flat 3,000 MW with a short evening the committed fleet
// cannot carry (19:00-19:30, highest at 19:15), and an empty pool: no water above rule 5's floor,
// no DR call left, the battery at its reserve. Only rule 8 has anything to say.
const BASE = 3000, SHORT = 20000;
function evening(poke = () => {}, proxy = 'par') {
  const obs = quiet(observe(parDay(16).state)), fc = obs.forecast;
  const bump = t => (t >= S_AT(19) && t <= S_AT(19, 30) ? SHORT + (t === S_AT(19, 15) ? 100 : 0) : 0);
  fc.demandP50 = fc.demandP50.map((x, k) => BASE + bump(fc.fromS + (k + 1) * fc.stepS));
  for (const key of ['windMW', 'solarMW', 'rooftopMW']) fc[key] = fc[key].map(() => 0);
  obs.hydro.storageMWh = V.HYDRO_STOP_MWH + V.PAR_WATER_RESERVE_MWH;
  Object.assign(obs.dr, {callsLeft: 0, activeS: 0, mw: 0});
  const memo = createAutopilot({proxy});
  poke(obs, memo);
  return {d: decide(obs, memo), memo, obs};
}
const shortAt = (obs, s, mw) => { const fc = obs.forecast; fc.demandP50[col(fc, s)] = BASE + mw; };

test('S-14 rule 5 (Q-58): a shortfall in the evening beyond the pre-cool hour cycles the free suburb with the most relief, centred on the peak; origin rule8; the sim accepts it', () => {
  let r = evening();
  assert.deepEqual(r.d, [{type: 'flex', suburb: 'RED', lever: 'aircon', atS: S_AT(18, 30)}], 'REDGUM 45 MW, relief 18:30-20:00 around 19:15');
  assert.equal(r.d[0].atS, aimFlex(r.obs.forecast, r.obs.levers, 'RED', 'aircon'));
  assert.equal(r.memo.lastOrigin, 'rule8');
  assert.equal(applyInput(parDay(16).state, r.d[0]).ok, true);
  // The most EFFECTIVE relief (patience scales it, U-4): RED at 30 MW yields to HAR's 40.
  r = evening(obs => { obs.levers.suburbs.find(x => x.id === 'RED').aircon.mw = 30; });
  assert.deepEqual(flexOut(r.d).map(x => x.suburb), ['HAR']);
  // Eligibility only through `block` (locked, overlapping, ...).
  r = evening(obs => { obs.levers.suburbs.find(x => x.id === 'RED').aircon.block = 'air-con locked: patience below 25'; });
  assert.deepEqual(flexOut(r.d).map(x => x.suburb), ['HAR']);
  r = evening(obs => { for (const x of obs.levers.suburbs) x.aircon.block = 'not offered today'; });
  assert.deepEqual(r.d, [], 'nothing to book: rule 8 goes on as before (the diesel is not armed for a shortfall 3 h away)');
  // competent and commitAll too; lean never sends flex.
  for (const p of ['competent', 'commitAll']) assert.equal(flexOut(evening(() => {}, p).d).length, 1, p);
  assert.deepEqual(flexOut(evening(() => {}, 'lean').d), []);
});

test('S-14 rule 5 books only when its relief lands on the first short step: not in the pre-cool hour, not after the relief, not within the pre-cool hour of now (DR\'s and RERT\'s), not before the peak is in view, not against the pace, never in a watch', () => {
  // A short step in the pre-cool hour (17:30-18:30) would be made worse: no booking.
  let r = evening(obs => shortAt(obs, S_AT(18), SHORT / 2));
  assert.deepEqual(flexOut(r.d), []);
  r = evening(obs => shortAt(obs, S_AT(18, 30), SHORT)); // the core's first knot is 0 MW
  assert.deepEqual(flexOut(r.d), []);
  // A short step after the relief ends (the peak covered by wind, the shortfall at 20:15): no booking.
  r = evening(obs => { const fc = obs.forecast; for (let t = S_AT(19); t <= S_AT(19, 30); t += 300) fc.windMW[col(fc, t)] = fc.demandP50[col(fc, t)]; shortAt(obs, S_AT(20, 15), SHORT - 1000); });
  assert.equal(aimFlex(r.obs.forecast, r.obs.levers, 'RED', 'aircon'), S_AT(18, 30));
  assert.deepEqual(flexOut(r.d), []);
  // A short step within the hour (16:20, the diesel's 20-minute lead): RERT is armed, as today.
  r = evening(obs => shortAt(obs, S_AT(16, 20), SHORT));
  assert.deepEqual(r.d, [{type: 'armRERT'}]);
  // The peak on the forecast's last column while the window runs to 21:00: aimFlex -1, wait.
  r = evening(obs => shortAt(obs, S_AT(20, 30), SHORT + 500));
  assert.equal(aimFlex(r.obs.forecast, r.obs.levers, 'RED', 'aircon'), -1);
  assert.deepEqual(flexOut(r.d), []);
  // The pace (7.5 grid-min at 16:30-20:00, 12 min before) and the watch.
  r = evening((obs, memo) => { memo.lastActTick = obs.tick - 300 * TPS; });
  assert.deepEqual(r.d, []);
  r = evening(obs => { obs.inWatch = true; });
  assert.deepEqual(r.d, []);
});

// ---------------------------------------------------------------- the day-ahead line and the system (§31.9.9, §31.3.11)

/** Column k's cover (what the stations and the tie must supply) after `replan` on obs with plan P. */
function covers(P, obs) {
  const memo = createAutopilot({proxy: 'planOnly'});
  memo.plan = clone(P);
  replan(obs, memo);
  const Q = memo.plan;
  return Q.tie.map((x, k) => x + Q.lever.reduce((a, c) => a + c[k], 0) + Q.gap[k]);
}
/** Booked flex at s from an observation's blocks (their knots, interpolated). */
function flexAtObs(obs, s) {
  let mw = 0;
  for (const b of obs.levers.blocks) for (const p of b.parts) {
    const kn = p.knots;
    for (let i = 1; i < kn.length; i++) if (s > kn[i - 1][0] && s <= kn[i][0]) mw += kn[i - 1][1] + (kn[i][1] - kn[i - 1][1]) * (s - kn[i - 1][0]) / (kn[i][0] - kn[i - 1][0]);
  }
  return mw;
}

test('§31.9.9: the plan stores the day-ahead line without flex and adds the booked flex beyond the 4.5-h forecast once; a late heatwave lifts the demand, never the flex', () => {
  const s = createState(2, DESK);
  while (s.tick < V.PLAYER_START_TICK) step(s);
  const before = preDispatch(observe(s, {dayAhead: true}));
  assert.equal(applyInput(s, {type: 'flex', suburb: 'HAZ', lever: 'soak', atS: S_AT(10, 30)}).ok, true);
  const da = observe(s, {dayAhead: true}), after = preDispatch(da);
  assert.ok(Math.abs(da.dayAhead.flexMW[col(da.dayAhead, S_AT(12))] - 140) < 1e-9, 'the day-ahead forecast carries the soak');
  for (let k = 0; k < after.n; k++) assert.ok(Math.abs(after.fc.p50[k] - before.fc.p50[k]) < 1e-6, 'P.fc.p50 is the line without flex, column ' + k);
  const obs = observe(s), fc = obs.forecast, beyond = s0 => s0 > fc.fromS + fc.n * fc.stepS;
  const bare = clone(obs);
  bare.levers.blocks = [];
  const cols = [S_AT(12), S_AT(14), S_AT(23), S_AT(26)].map(t => Math.round((t - before.madeAtS) / V.FC_STEP_S) - 1);
  const check = (o, b) => {
    const A = covers(before, o), B = covers(after, o), Z = covers(before, b);
    for (let k = 0; k < A.length; k++) if (beyond(before.t0 + k * V.FC_STEP_S)) assert.ok(Math.abs(A[k] - B[k]) < 1, 'column ' + k + ': ' + A[k] + ' vs ' + B[k]);
    for (const k of cols) {
      const t = before.t0 + k * V.FC_STEP_S;
      assert.ok(Math.abs(A[k] - Z[k] - flexAtObs(o, t)) < 1e-6, 'the flex once, unscaled, at column ' + k + ': ' + (A[k] - Z[k]));
    }
    return A;
  };
  const A = check(obs, bare);
  assert.ok(A[cols[0]] - covers(before, bare)[cols[0]] > 139 && flexAtObs(obs, S_AT(23)) < -90, 'the core at noon, the night fall at 23:00');
  // Its own first dispatch reads the forecast with the soak in it: once, not twice.
  const own = after.tie.map((x, k) => x + after.lever.reduce((a, c) => a + c[k], 0) + after.gap[k]);
  assert.ok(Math.abs(own[cols[0]] - A[cols[0]]) < 1);
  // A heatwave announced after both plans, over the core's afternoon and the night's first hour.
  const heat = {atS: obs.s + 60, kind: 'heat', fromS: S_AT(13, 30), toS: S_AT(23, 30), text: 'WEATHER BUREAU: extreme heat.'};
  for (const o of [obs, bare]) o.news.push(clone(heat));
  const H = check(obs, bare);
  assert.ok(H[cols[2]] - A[cols[2]] > 100, 'the heat lifts the 23:00 demand');
});

test('§31.3.11 commitSig gains obs.levers.rev: in player mode a soak booked at 05:00 re-flows the plan at the system\'s next look, with the soak in it', () => {
  const s = createState(2, DESK), sys = createSystem({commit: 'player'});
  while (s.tick < ticksAt(5)) step(s, systemInputs(sys, s));
  const loads = () => s.log.filter(r => r.type === 'planLoad').length;
  let n = loads();
  while (loads() === n) step(s, systemInputs(sys, s)); // just after a 5-minute dispatch
  const k = Math.round((S_AT(12) - sys.memo.plan.madeAtS) / V.FC_STEP_S) - 1;
  const cover = () => { const P = sys.memo.plan; return P.tie[k] + P.lever.reduce((a, c) => a + c[k], 0) + P.gap[k]; };
  const sig = commitSig(observe(s)), c0 = cover(), t0 = s.tick;
  n = loads();
  assert.equal(applyInput(s, {type: 'flex', suburb: 'HAZ', lever: 'soak', atS: S_AT(10, 30)}).ok, true);
  assert.notEqual(commitSig(observe(s)), sig);
  while (loads() === n) step(s, systemInputs(sys, s));
  assert.ok((s.tick - t0) / TPS <= V.PAR_DECIDE_EVERY_S + 1, 're-dispatched ' + (s.tick - t0) / TPS + ' s after the booking');
  assert.ok(Math.abs(cover() - c0 - 140) < 1, 'the soak is load in the plan at 12:00: +' + (cover() - c0).toFixed(1) + ' MW');
  // CLASSIC has no levers: rev stays 0.
  assert.equal(observe(createState(2, CLASSIC)).levers.rev, 0);
});

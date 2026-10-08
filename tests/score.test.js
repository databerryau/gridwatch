// The ALL-IN score's core (SPEC §9.1 Q-48, desk/README.md §30.7): the sim counts SAIDI, SAIFI and
// MAIFI per household (sim/market.js settleSecond, from the districts' darkSinceS and restoredAtS);
// app/score.js prices a day and grades it against par with the calibrated LETTERS; app/par.js runs
// par in the page a slice at a time, through AP.runPar, and keeps the finished day in storage.
// Sampled, not streamed: the counters are checked by settling chosen seconds, the runner over 4 h
// of par's day, and the end through a stored par (no test plays to 04:00).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as market from '../sim/market.js';
import * as fleet from '../sim/fleet.js';
import {createState, step, observe} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {V, SIM_VERSION} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import {allIn, grade, LETTERS} from '../app/score.js';
import {createParRunner, PAR_KEY, PAR_MARK_S, PAR_CHUNK_TICKS} from '../app/par.js';
import * as G from '../app/game.js';

const TPS = V.TICKS_PER_S, LINE = V.SUSTAINED_INTERRUPTION_S, MIN = V.S_PER_MIN;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), (msg || '') + ': ' + a + ' vs ' + b);

// ------------------------------------------------------------------ SAIDI, SAIFI, MAIFI (the sim)

/** Settle grid second t (a whole one) as step() does on the tick that ends it. */
function settle(s, t) {
  s.tick = (t + 1) * TPS; s.acc.ticks = TPS; s.acc.fSumHz = V.F0_HZ * TPS;
  market.settleSecond(s, []);
}

/**
 * One district dark from inside second `from` to `to`: relit inside second `to` (a restore at any
 * tick), or, with `edge`, by an input on the tick that starts `to`, which step() applies before
 * it settles second to - 1. Returns the score after `to + 1` and what it read just before.
 */
function interruption(from, to, edge) {
  const s = createState(1, DESK), d = 0, share = s.city.districts[d].share;
  s.tick = from * TPS + 7;
  fleet.setDistrictDark(s, d, true, 'ufls');
  let before = null;
  for (let t = from; t < to - 1; t++) { settle(s, t); if (t === from + LINE - 1) before = Object.assign({}, s.score); }
  if (edge) { s.tick = to * TPS; fleet.setDistrictDark(s, d, false); settle(s, to - 1); }
  else { settle(s, to - 1); s.tick = to * TPS + 7; fleet.setDistrictDark(s, d, false); }
  settle(s, to); settle(s, to + 1);
  return {sc: s.score, share, before};
}

test('Q-48: an interruption longer than 3 grid-min is sustained: SAIFI + its share, SAIDI + its share x every minute dark, counted when it passes the line', () => {
  for (const edge of [false, true]) {
    const {sc, share, before} = interruption(100, 100 + LINE + 1, edge);
    near(sc.saifi, share, 'SAIFI' + (edge ? ' (relit on the edge tick)' : ''));
    near(sc.saidiMin, share * (LINE + 1) / MIN, 'SAIDI');
    assert.equal(sc.maifi, 0, 'not momentary');
    assert.deepEqual([before.saifi, before.saidiMin], [0, 0], 'nothing until it has lasted longer than the line');
  }
  // a long one: every second dark counts
  const {sc, share} = interruption(4000, 4000 + 1800, false);
  near(sc.saidiMin, share * 30, 'half an hour dark: 30 minutes x its share');
  near(sc.saifi, share, 'one interruption');
});

test('Q-48: an interruption relit within 3 grid-min is momentary: MAIFI + its share, nothing in SAIDI or SAIFI', () => {
  for (const edge of [false, true]) {
    const {sc, share} = interruption(100, 100 + LINE, edge);
    near(sc.maifi, share, 'MAIFI' + (edge ? ' (relit on the edge tick)' : ''));
    assert.deepEqual([sc.saifi, sc.saidiMin], [0, 0]);
  }
});

test('Q-48: the counters run inside step(): a district dark 200 s from 04:00 is one sustained interruption, as the score shows it', () => {
  const s = createState(1, DESK), d = s.city.districts.findIndex(x => x.uflsStage === 1), share = s.city.districts[d].share;
  assert.deepEqual([s.score.saidiMin, s.score.saifi, s.score.maifi], [0, 0, 0]);
  for (let i = 0; i < 7; i++) step(s);
  fleet.setDistrictDark(s, d, true, 'ufls');
  while (s.tick <= 200 * TPS) step(s);   // the step on 04:03:20 settles second 199: 200 s dark
  const sc = observe(s).score;
  near(sc.saifi, share, 'SAIFI');
  near(sc.saidiMin, share * 200 / MIN, 'SAIDI');
  assert.equal(sc.maifi, 0);
  assert.ok(sc.lightsMWh > 0, 'and the energy it went without is LIGHTS ON\'s, as before');
});

// ------------------------------------------------------------------ app/score.js on the measured rows

// Measured on seed 20261008, DESK (`tools/par.js --seed 20261008 --scenario desk --proxy
// competent,lean,commitAll,doNothing --allin`, v4-core-2a.2): what allIn reads, as the score has it.
const ROWS = {
  par: {costDollars: 4331302.790936643, lightsMWh: 0, servedMWh: 100356.46867139546, co2tPerMWh: 0.5969995701308892},
  competent: {costDollars: 4413346.885405067, lightsMWh: 0, servedMWh: 100356.27917691825, co2tPerMWh: 0.6014290326192324},
  lean: {costDollars: 4817303.839077274, lightsMWh: 0, servedMWh: 100356.33459664446, co2tPerMWh: 0.6032397822604143},
  commitAll: {costDollars: 6335576.08541395, lightsMWh: 0, servedMWh: 100357.50961353871, co2tPerMWh: 0.6153457883354152},
  doNothing: {costDollars: 2264483.3816827103, lightsMWh: 26826.058864820767, servedMWh: 75041.31960953814, co2tPerMWh: 0.5629597076850276,
    saidiMin: 321.74907017754384, saifi: 0.53, maifi: 0},
};
// The calibration run's median day by par's ALL-IN (`tools/par.js --scenario desk,desk-weekend
// --seeds 1-100 -j 4 --proxy competent,lean,commitAll --allin`: DESK seed 55, $9.746M): LETTERS' b
// and c are par plus 150 and plus 600 MWh dark on it. a = 962 is par plus 10 MWh dark on the
// run's cheapest day (DESK_WEEKEND seed 77), so a 10-MWh shed on a par day is an A on every day.
const MEDIAN_PAR = {costDollars: 4852786.676900153, lightsMWh: 0, servedMWh: 99904.6868927244, co2tPerMWh: 0.6122275216890821};
/** par's day with `mwh` more dark (the city asked for the same energy: it comes off served). */
const parDark = (row, mwh) => Object.assign({}, row, {lightsMWh: row.lightsMWh + mwh, servedMWh: row.servedMWh - mwh});

test('Q-48: ALL-IN on seed 20261008: par $9.124M (supply 4.331 + carbon 4.793); competent 987, lean 945, commit-all 809, a 10-MWh shed 968, no input 11', () => {
  const par = allIn(ROWS.par, 1.9e6);
  assert.deepEqual([par.supply, par.outage, par.carbon, par.total].map(x => (x / 1e6).toFixed(3)), ['4.331', '0.000', '4.793', '9.124']);
  near(par.carbon, V.VER * ROWS.par.co2tPerMWh * ROWS.par.servedMWh, 'carbon: VER x intensity x MWh asked for');
  const pts = r => grade(allIn(r, 1.9e6), par, false);
  assert.deepEqual(['competent', 'lean', 'commitAll', 'doNothing'].map(k => pts(ROWS[k]).points), [987, 945, 809, 11]);
  assert.equal(pts(parDark(ROWS.par, 10)).points, 968);
  near(allIn(parDark(ROWS.par, 10), 0).total - par.total, 10 * V.VCR, 'a dark MWh costs VCR, and nothing else moves');
  assert.deepEqual(pts(ROWS.par), {points: 1000, letter: 'A', star: true});
  const nd = allIn(ROWS.doNothing, 1.9e6);
  assert.deepEqual([nd.saidiMin, nd.saifi, nd.maifi], [ROWS.doNothing.saidiMin, 0.53, 0], 'the reliability readouts are copied, never added in');
  near(nd.total, nd.supply + nd.outage + nd.carbon, 'ALL-IN');
});

test('Q-48 calibration: LETTERS (desk/README.md §30.7): on seed 20261008 a 10-MWh shed and competent are A, lean and commit-all B, no input D; b and c are par + 150 and + 600 MWh dark on the median day', () => {
  assert.deepEqual(LETTERS.map(l => l[0]), ['A', 'B', 'C', 'D']);
  assert.ok(LETTERS.every((l, i) => i === 0 || l[1] < LETTERS[i - 1][1]) && LETTERS[3][1] === -Infinity, 'best first, D catches the rest');
  const [a, b, c] = LETTERS.map(l => l[1]);
  const par = allIn(ROWS.par, 0), letter = r => grade(allIn(r, 0), par, false).letter;
  assert.deepEqual(['competent', 'lean', 'commitAll', 'doNothing'].map(k => letter(ROWS[k])), ['A', 'B', 'B', 'D']);
  assert.equal(letter(parDark(ROWS.par, 10)), 'A');
  const med = allIn(MEDIAN_PAR, 0), pts = mwh => grade(allIn(parDark(MEDIAN_PAR, mwh), 0), med, false).points;
  assert.deepEqual([pts(150), pts(600)], [b, c]);
  assert.ok(pts(10) >= a, 'a 10-MWh shed on the median day: ' + pts(10));
});

test('Q-48: grade: a black day is an F at once; no par, or nothing to compare, is no grade; star from 1000', () => {
  const par = allIn(ROWS.par, 0);
  assert.deepEqual(grade(allIn(ROWS.lean, 0), par, true), {points: 0, letter: 'F', star: false});
  assert.deepEqual(grade(allIn(ROWS.lean, 0), null, true), {points: 0, letter: 'F', star: false}, 'without par');
  assert.equal(grade(allIn(ROWS.lean, 0), null, false), null);
  assert.equal(grade(allIn(ROWS.lean, 0), allIn({}, 0), false), null, 'par with no total');
  const better = Object.assign({}, ROWS.par, {costDollars: ROWS.par.costDollars - 1e5});
  assert.deepEqual(grade(allIn(better, 0), par, false).star, true, 'beating par');
});

test('Q-48 / H-12: shedding is never cheaper than the reserves: VCR > the price cap > RERT\'s price > DR\'s price', () => {
  assert.ok(V.VCR > V.PRICE_CAP && V.PRICE_CAP > V.RERT_COST && V.RERT_COST > V.DR_PRICE, [V.VCR, V.PRICE_CAP, V.RERT_COST, V.DR_PRICE].join(' > '));
});

// ------------------------------------------------------------------ app/par.js: par in the page

const ROW_KEYS = ['costDollars', 'lightsMWh', 'servedMWh', 'co2tPerMWh', 'saidiMin', 'saifi', 'maifi'];
const rowOf = sc => Object.fromEntries(ROW_KEYS.map(k => [k, sc[k]]));
const memStore = () => { const box = {}; return {box, read: k => (k in box ? JSON.parse(box[k]) : null), write: (k, v) => { box[k] = JSON.stringify(v); }}; };

test('Q-48: a runner stepped to 08:00 in 500-tick slices plays the day one AP.runPar plays, and keeps par\'s score every 5 grid-min', () => {
  const seed = 20261008, until = 4 * V.S_PER_H * TPS, mark = PAR_MARK_S * TPS;
  const r = createParRunner(seed, DESK, {});
  assert.deepEqual([r.done, r.series.length, r.at(0)], [false, 0, null], 'nothing until the first step');
  for (let n = 0; n < until / PAR_CHUNK_TICKS; n++) assert.equal(r.step(PAR_CHUNK_TICKS), false);
  near(r.progress, until / V.DAY_TICKS, 'progress');
  const want = [];
  const one = runPar(seed, DESK, {untilTick: until, onStep: s => { if (s.tick % mark === 0) want.push(rowOf(observe(s).score)); }});
  want.unshift(rowOf(observe(createState(seed, DESK)).score));
  assert.equal(r.series.length, until / mark + 1, '04:00 to 08:00 in 5-minute marks');
  assert.deepEqual(r.series, want);
  assert.deepEqual(r.at(4 * V.S_PER_H), rowOf(one.score), 'par at 08:00 is the single run\'s score');
  assert.ok(one.score.costDollars > 0 && one.log.length > 0, 'par has played (the plan and its rules)');
  // at(s): linear between marks; null until par has passed the mark after s
  const s = 3 * V.S_PER_H + 100, a = r.series[s / PAR_MARK_S | 0], b = r.series[(s / PAR_MARK_S | 0) + 1];
  near(r.at(s).costDollars, a.costDollars + (b.costDollars - a.costDollars) / 3, 'a third of the way');
  assert.equal(r.at(4 * V.S_PER_H + 1), null);
  // a slice below the chunk still plays a whole chunk (each AP.runPar call ends with an observe())
  r.step(1);
  near(r.progress, (until + PAR_CHUNK_TICKS) / V.DAY_TICKS, 'one chunk more');
});

test('Q-48: a finished par is kept under gridwatch:v4:par and a runner for the same day, version and scenario starts finished; any other key is ignored', () => {
  // a day that goes black at once (nothing committed): par is over after one step, and is kept
  const scn = JSON.parse(JSON.stringify(DESK));
  scn.commitment.units = {}; scn.commitment.tieMW = 0;
  const st = memStore(), r = createParRunner(7, scn, {storage: st});
  assert.equal(r.step(3000), true);
  assert.deepEqual([r.done, r.black, r.progress, r.series.length], [true, true, 1, 1]);
  const kept = st.read(PAR_KEY);
  assert.deepEqual(Object.keys(kept), ['v', 'seed', 'scenarioId', 'score', 'series', 'black']);
  assert.deepEqual([kept.v, kept.seed, kept.scenarioId, kept.black], [SIM_VERSION, 7, 'desk', true]);
  assert.deepEqual(kept.score, r.score);
  assert.equal(r.step(3000), true, 'a finished runner plays nothing more');
  // the same day again: finished at once, nothing played
  const again = createParRunner(7, DESK, {storage: st});
  assert.deepEqual([again.done, again.black, again.progress, again.score, again.series], [true, true, 1, kept.score, kept.series]);
  // another seed, another version, another scenario, or a broken key: par runs
  const fresh = box => createParRunner(7, DESK, {storage: {read: () => box, write() {}}});
  for (const bad of [{seed: 8}, {v: 'v0'}, {scenarioId: 'classic'}, {series: null}, {score: 3}]) {
    assert.equal(fresh(Object.assign({}, kept, bad)).done, false, JSON.stringify(bad));
  }
  assert.equal(createParRunner(7, DESK, {storage: {read: () => null, write() {}}}).done, false);
});

test('Q-48: the page\'s par (createGame par: true) reads the kept day, keeps its runner on PLAY THIS DAY AGAIN, and grades the end from it', () => {
  const seed = 20261008, items = {};
  const storage = {getItem: k => (k in items ? items[k] : null), setItem: (k, v) => { items[k] = String(v); }};
  const series = [rowOf(Object.assign({saidiMin: 0, saifi: 0, maifi: 0}, ROWS.par))];
  storage.setItem(PAR_KEY, JSON.stringify({v: SIM_VERSION, seed, scenarioId: 'desk', score: ROWS.par, series, black: false}));
  const g = G.createGame({seed, scenario: DESK, par: true, storage});
  assert.deepEqual([g.par.done, g.par.score], [true, ROWS.par], 'finished at once');
  const runner = g.par;
  G.resetDay(g);
  assert.ok(g.par === runner, 'the same day keeps its runner');
  G.takeDesk(g);
  g.state.over = true;
  G.buildVm(g, {nowMs: 0});
  assert.deepEqual(g.end.grade, grade(g.end.allIn, allIn(ROWS.par, g.households), false));
});

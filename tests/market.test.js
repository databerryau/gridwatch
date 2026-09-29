// Stage B owner "market": sim/market.js acceptance (P-5..P-8, H-5, H-12, S-1..S-3).
// Todo until market.js is implemented (scoreSummary is stage A and tested for real).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as market from '../sim/market.js';
import {sampleSecond} from '../sim/weather.js';
import {createState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {opening, ticksAt, clone} from './lib/sim-helpers.js';

const TODO = {todo: 'stage B: market'};

test('P-7: the scarcity adder is a pure function of R5/L (x = 0.5, 1, 1.1, 1.25, 2)', TODO, () => {
  assert.equal(market.scarcityAdder(2), 0);
  assert.equal(market.scarcityAdder(1.25), 0);
  assert.ok(Math.abs(market.scarcityAdder(1.1) - 180) < 1e-9);
  assert.equal(market.scarcityAdder(1), 300);
  assert.ok(Math.abs(market.scarcityAdder(0.5) - 1475) < 1e-9);
  assert.ok(market.scarcityAdder(0) > market.scarcityAdder(0.5));
});

test('P-8: limits: clamp to -1,000..23,200; the cap when the stack is exhausted or load is shed', TODO, () => {
  assert.equal(market.clampPrice(-5000), V.PRICE_FLOOR);
  assert.equal(market.clampPrice(1e9), V.PRICE_CAP);
  assert.equal(market.clampPrice(100), 100);
  const s = opening(1);
  s.sec.r5MW = 5000; s.sec.lMW = 500;
  s.city.shedFrac = 0.03;
  assert.equal(market.clearPrice(s).mwh, V.PRICE_CAP);
  const t = opening(1);
  t.sec.r5MW = 5000; t.sec.lMW = 500;
  t.env.demandMW = 20000;
  const p = market.clearPrice(t);
  assert.equal(p.exhausted, true);
  assert.equal(p.mwh, V.PRICE_CAP);
});

test('P-5 / P-6: merit order at 04:00: min-load blocks at the floor, wind at -20, then coal sets $26', TODO, () => {
  const s = opening(1);
  s.sec.r5MW = 5000; s.sec.lMW = 500; // no scarcity adder
  const stack = market.buildStack(s);
  for (let i = 1; i < stack.length; i++) assert.ok(stack[i].offer >= stack[i - 1].offer, 'stack not sorted');
  assert.ok(stack.some(b => b.offer === V.MIN_LOAD_OFFER));
  assert.ok(stack.some(b => b.offer === V.RENEWABLE_OFFER));
  assert.ok(!stack.some(b => b.kind === 'rert'), 'P-8: RERT is out of market');
  const p = market.clearPrice(s);
  assert.equal(p.mwh, V.STATIONS.coal.offer);
  assert.ok(stack.some(b => b.id === p.marginalId), 'P-5: the price and the stack use the same blocks');
});

test('H-5: imports count as supply: stepping import 0 -> 400 -> 800 MW never raises the price (seed 12, 13:00)', TODO, () => {
  const s = createState(12, CLASSIC);
  s.tick = ticksAt(13);
  sampleSecond(s);
  s.sec.r5MW = 1000; s.sec.lMW = 650;
  let prev = Infinity;
  for (const mw of [0, 400, 800]) {
    s.tie.flowMW = mw;
    const p = market.clearPrice(s).mwh;
    assert.ok(p <= prev, 'import ' + mw + ' MW raised the price to ' + p);
    prev = p;
  }
});

test('P-6: hydro water value is $130 at full storage and rises as storage falls', TODO, () => {
  assert.equal(market.waterValue(1), 130);
  assert.ok(market.waterValue(0.5) > 130 && market.waterValue(0.1) > market.waterValue(0.5));
});

test('S-1 / H-12: unserved MWh is exactly the integral of shed MW, and never priced in the scorecard', TODO, () => {
  const a = opening(2), b = clone(a);
  for (const s of [a, b]) { s.tick = V.TICKS_PER_S; s.acc.ticks = V.TICKS_PER_S; s.acc.fSumHz = 50 * V.TICKS_PER_S; }
  b.acc.shedMWs = 360 * 1; // 360 MW for one second
  market.settleSecond(a, []);
  market.settleSecond(b, []);
  assert.ok(Math.abs(b.score.unservedMWh - a.score.unservedMWh - 0.1) < 1e-12, 'unserved ' + b.score.unservedMWh);
  assert.deepEqual(b.score.cost, a.score.cost, 'H-12: shedding must not add a cost');
  assert.equal(b.acc.shedMWs, 0, 'acc is zeroed');
  assert.equal(b.last.fMeanHz, 50);
});

test('S-2: customer cost = fuel + no-load + starts + tie + wear + DR + RERT (per second, from acc)', TODO, () => {
  const s = opening(3);
  s.tick = V.TICKS_PER_S; s.acc.ticks = V.TICKS_PER_S; s.acc.fSumHz = 50 * V.TICKS_PER_S;
  s.units.forEach((u, i) => { s.acc.unitMWs[i] = u.outMW * 1; });
  market.settleSecond(s, []);
  let fuel = 0, noLoad = 0;
  s.units.forEach(u => {
    const m = V.MACHINES[u.k];
    fuel += u.outMW / 3600 * (m.station === 'hydro' ? V.HYDRO_VAR_COST : m.offer);
    if (u.sync) noLoad += m.noLoadPerS;
  });
  assert.ok(Math.abs(s.score.cost.fuel - fuel) < 1e-6, 'fuel ' + s.score.cost.fuel + ' vs ' + fuel);
  assert.ok(Math.abs(s.score.cost.noLoad - noLoad) < 1e-6);
  assert.ok(Math.abs(s.score.cost.tie - s.tie.flowMW / 3600 * s.env.neighbourPrice) < 1e-6, 'import at the neighbour price');
});

test('P-5 / H-1: stack membership: stopping and loading units offer only present output; offline units only if <= 10 min to MIN', TODO, () => {
  const s = opening(1);
  s.sec.r5MW = 5000; s.sec.lMW = 500;
  const u = id => s.units.find(x => x.id === id);
  u('ccgt1').mode = 'unloading'; u('ccgt1').basePointMW = 0; u('ccgt1').schedMW = 230;
  u('coal4').mode = 'loading'; u('coal4').schedMW = 100;
  u('gtb1').mode = 'starting'; u('gtb1').timerS = 30; // 30 s of T1 + 240 s auto-sync + 120 s T2 < 600 s
  u('gtb2').mode = 'starting'; u('gtb2').timerS = V.MACHINES[V.MACHINE_IDS.indexOf('gtb2')].t1S; // 360 + 240 + 120 > 600 s
  u('gtc1').downSinceS = 0; // stopped at 04:00: its 30-min minimum down time blocks a start
  s.ofgs.trippedFrac = 0.5;
  const stack = market.buildStack(s);
  const mw = id => stack.filter(b => b.id === id).reduce((a, b) => a + b.mw, 0);
  const offers = id => stack.filter(b => b.id === id).map(b => b.offer);
  assert.equal(mw('ccgt1'), 230);
  assert.deepEqual(offers('ccgt1'), [V.MIN_LOAD_OFFER]);
  assert.equal(mw('coal4'), 100);
  assert.ok(mw('gtb1') > 0, 'a starting unit within 10 min of MIN is in the stack');
  assert.equal(mw('gtb2'), 0, 'a starting unit further than 10 min from MIN is not');
  assert.ok(mw('gta1') > 0, 'GT-A (off, T1 + T2 = 8 min, free to start) is in the stack');
  assert.equal(mw('gtc1'), 0, 'GT-C is off but its minimum down time blocks a start');
  assert.ok(Math.abs(mw('wind') - s.ren.windMW * 0.5) < 1e-9, 'wind net of OFGS');
});

test('P-5: the stack is in a total order (offer, then id): equal offers never depend on sort stability', TODO, () => {
  const s = opening(1);
  for (const id of ['gtb1', 'gtb2']) { const u = s.units.find(x => x.id === id); u.mode = 'on'; u.sync = true; u.schedMW = 300; u.outMW = 300; }
  const stack = market.buildStack(s);
  for (let i = 1; i < stack.length; i++) {
    const a = stack[i - 1], b = stack[i];
    assert.ok(a.offer < b.offer || (a.offer === b.offer && a.id <= b.id), a.id + ' before ' + b.id);
  }
});

test('S-3: shedding 100 MWh with no other change moves CO2 intensity by < 0.5%', TODO, () => {
  // Two ~1-h runs of the same fleet; the second sheds 100 MWh of load and every generator
  // produces proportionally less. Intensity is per MWh served, so it barely moves.
  const run = shedMW => {
    const s = opening(5);
    for (let k = 0; k < 3600; k++) {
      s.tick = (k + 1) * V.TICKS_PER_S;
      s.acc.ticks = V.TICKS_PER_S; s.acc.fSumHz = 50 * V.TICKS_PER_S; s.acc.fMinHz = 50; s.acc.fMaxHz = 50;
      const served = s.env.demandMW - shedMW, f = served / s.env.demandMW;
      s.units.forEach((u, i) => { s.acc.unitMWs[i] = u.outMW * f; });
      s.acc.servedMWs = served; s.acc.shedMWs = shedMW;
      market.settleSecond(s, []);
    }
    return s.score;
  };
  const a = run(0), b = run(100);
  assert.ok(Math.abs(b.unservedMWh - 100) < 1e-6);
  const ia = a.co2t / a.servedMWh, ib = b.co2t / b.servedMWh;
  assert.ok(Math.abs(ib / ia - 1) < 0.005, 'intensity ' + ia + ' -> ' + ib);
});

test('scoreSummary (stage A): cents per kWh served and t CO2 per MWh served', () => {
  const score = {servedMWh: 1000, unservedMWh: 5, co2t: 600,
    cost: {fuel: 50000, noLoad: 10000, starts: 8000, tie: 2000, battWear: 0, dr: 0, rert: 0, flex: 0}};
  const x = market.scoreSummary(score);
  assert.equal(x.costDollars, 70000);
  assert.equal(x.centsPerKWh, 7);
  assert.equal(x.co2tPerMWh, 0.6);
  assert.equal(x.lightsMWh, 5);
  assert.equal(market.scoreSummary({servedMWh: 0, unservedMWh: 0, co2t: 0, cost: score.cost}).centsPerKWh, 0);
});

// Stage B owner "market": sim/market.js acceptance (P-5..P-8, H-5, H-12, S-1..S-3).
// Implemented in stage B (scoreSummary is stage A).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as market from '../sim/market.js';
import {sampleSecond} from '../sim/weather.js';
import {createState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import * as fleet from '../sim/fleet.js';
import {opening, ticksAt, clone} from './lib/sim-helpers.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), (msg || '') + ' ' + a + ' vs ' + b);

test('P-7: the scarcity adder is a pure function of R5/L (x = 0.5, 1, 1.1, 1.25, 2)', () => {
  assert.equal(market.scarcityAdder(2), 0);
  assert.equal(market.scarcityAdder(1.25), 0);
  assert.ok(Math.abs(market.scarcityAdder(1.1) - 180) < 1e-9);
  assert.equal(market.scarcityAdder(1), 300);
  assert.ok(Math.abs(market.scarcityAdder(0.5) - 1475) < 1e-9);
  assert.ok(market.scarcityAdder(0) > market.scarcityAdder(0.5));
});

test('P-8: limits: clamp to -1,000..23,200; the cap when the stack is exhausted or directed shedding is in force', () => {
  assert.equal(market.clampPrice(-5000), V.PRICE_FLOOR);
  assert.equal(market.clampPrice(1e9), V.PRICE_CAP);
  assert.equal(market.clampPrice(100), 100);
  const s = opening(1);
  s.sec.r5MW = 5000; s.sec.lMW = 500;
  fleet.setDistrictDark(s, s.city.districts.findIndex(x => x.rot === 0), true, 'directed');
  assert.equal(market.clearPrice(s).mwh, V.PRICE_CAP);
  const t = opening(1);
  t.sec.r5MW = 5000; t.sec.lMW = 500;
  t.env.demandMW = 20000;
  const p = market.clearPrice(t);
  assert.equal(p.exhausted, true);
  assert.equal(p.mwh, V.PRICE_CAP);
});

test('P-5 / P-6: merit order at 04:00: min-load blocks at the floor, wind at -20, then coal sets $26', () => {
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

test('H-5: imports count as supply: stepping import 0 -> 400 -> 800 MW never raises the price (seed 12, 13:00)', () => {
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

test('P-6: hydro water value is $130 at full storage and rises as storage falls', () => {
  assert.equal(market.waterValue(1), 130);
  assert.ok(market.waterValue(0.5) > 130 && market.waterValue(0.1) > market.waterValue(0.5));
});

test('S-1 / H-12: unserved MWh is exactly the integral of shed MW, and never priced in the scorecard', () => {
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

test('S-2: customer cost = fuel + no-load + starts + tie + wear + DR + RERT (per second, from acc)', () => {
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

test('P-5 / H-1: stack membership: stopping and loading units offer only present output; offline units only if <= 10 min to MIN', () => {
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

test('P-5: the stack is in a total order (offer, then id): equal offers never depend on sort stability', () => {
  const s = opening(1);
  for (const id of ['gtb1', 'gtb2']) { const u = s.units.find(x => x.id === id); u.mode = 'on'; u.sync = true; u.schedMW = 300; u.outMW = 300; }
  const stack = market.buildStack(s);
  for (let i = 1; i < stack.length; i++) {
    const a = stack[i - 1], b = stack[i];
    assert.ok(a.offer < b.offer || (a.offer === b.offer && a.id <= b.id), a.id + ' before ' + b.id);
  }
});

test('S-3: shedding 100 MWh with no other change moves CO2 intensity by < 0.5%', () => {
  // Two ~1-h runs of the same fleet; the second sheds 100 MWh of load and every generator
  // produces proportionally less. Intensity is per MWh generated, so it barely moves.
  const run = shedMW => {
    const s = opening(5), w0 = s.ren.windMW, so0 = s.ren.solarMW;
    for (let k = 0; k < 3600; k++) {
      s.tick = (k + 1) * V.TICKS_PER_S;
      s.acc.ticks = V.TICKS_PER_S; s.acc.fSumHz = 50 * V.TICKS_PER_S; s.acc.fMinHz = 50; s.acc.fMaxHz = 50;
      const served = s.env.demandMW - shedMW, f = served / s.env.demandMW;
      s.units.forEach((u, i) => { s.acc.unitMWs[i] = u.outMW * f; });
      s.ren.windMW = w0 * f; s.ren.solarMW = so0 * f; // wind and solar are generators too
      s.acc.servedMWs = served; s.acc.shedMWs = shedMW;
      market.settleSecond(s, []);
    }
    return s.score;
  };
  const a = run(0), b = run(100);
  assert.ok(Math.abs(b.unservedMWh - 100) < 1e-6);
  const ia = market.scoreSummary(a).co2tPerMWh, ib = market.scoreSummary(b).co2tPerMWh;
  assert.ok(ia > 0 && Math.abs(ib / ia - 1) < 0.005, 'intensity ' + ia + ' -> ' + ib);
});

test('S-3: intensity is per MWh generated in the region: an import that displaces coal counts in neither term (review fix)', () => {
  // Per MWh served, 800 MW of import replacing 800 MW of coal lowered the graded intensity
  // just by enlarging the denominator. Per MWh generated (AEMO's CDEII), it moves only by the
  // change in the region's own mix.
  const run = importMW => {
    const s = opening(5);
    s.tie.flowMW = importMW;
    const coal = s.units.map((u, i) => (V.MACHINES[i].cls === 'coal' ? u.outMW : 0)), coalMW = coal.reduce((x, y) => x + y, 0);
    for (let k = 0; k < 600; k++) {
      s.tick = (k + 1) * V.TICKS_PER_S;
      s.acc.ticks = V.TICKS_PER_S; s.acc.fSumHz = 50 * V.TICKS_PER_S; s.acc.fMinHz = 50; s.acc.fMaxHz = 50;
      s.units.forEach((u, i) => { s.acc.unitMWs[i] = coal[i] > 0 ? coal[i] * (1 - importMW / coalMW) : u.outMW; });
      s.acc.servedMWs = s.env.demandMW;
      market.settleSecond(s, []);
    }
    return s.score;
  };
  const a = run(0), b = run(800);
  const sa = market.scoreSummary(a), sb = market.scoreSummary(b);
  near(a.servedMWh, b.servedMWh, 'the same energy served');
  near(a.genMWh - b.genMWh, 800 * 600 / 3600, 'the import is not regional generation');
  assert.ok(b.co2t < a.co2t, 'less coal burnt');
  near(sb.co2tPerMWh, b.co2t / b.genMWh);
  assert.ok(sb.co2tPerMWh < sa.co2tPerMWh, 'less coal in the region\'s mix');
  assert.ok(sb.co2tPerMWh > b.co2t / b.servedMWh, 'per MWh served would count the import as clean energy');
});

test('scoreSummary (stage A; S-3 per MWh generated since the review): cents per kWh served and t CO2 per MWh generated', () => {
  const score = {servedMWh: 1000, unservedMWh: 5, co2t: 600, genMWh: 1000,
    cost: {fuel: 50000, noLoad: 10000, starts: 8000, tie: 2000, battWear: 0, dr: 0, rert: 0, flex: 0}};
  const x = market.scoreSummary(score);
  assert.equal(x.costDollars, 70000);
  assert.equal(x.centsPerKWh, 7);
  assert.equal(x.co2tPerMWh, 0.6);
  assert.equal(x.lightsMWh, 5);
  assert.equal(market.scoreSummary({servedMWh: 0, unservedMWh: 0, co2t: 0, genMWh: 0, cost: score.cost}).centsPerKWh, 0);
  assert.equal(market.scoreSummary(Object.assign({}, score, {genMWh: 800})).co2tPerMWh, 0.75, 'imported MWh are not generation');
});

// ------------------------------------------------------------------ stage B extensions (market + events)

test('P-8: while directed shedding is in force the price is administered at the cap (no marginal block); market demand <= 0 clears at the floor', () => {
  const s = opening(1);
  s.sec.r5MW = 5000; s.sec.lMW = 500;
  const d = s.city.districts.findIndex(x => x.rot === 0);
  fleet.setDistrictDark(s, d, true, 'directed');
  const p = market.clearPrice(s);
  assert.equal(p.mwh, V.PRICE_CAP);
  assert.equal(p.marginalId, '');
  assert.equal(p.exhausted, false);
  fleet.setDistrictDark(s, d, false, null);
  s.env.demandMW = 0; // the tie import alone exceeds demand: the minimum-load blocks set the price
  assert.equal(market.clearPrice(s).mwh, V.PRICE_FLOOR);
});

test('P-5 / P-8: districts shed by UFLS and waiting to be restored do not hold the cap; the stack clears on the lit demand (review fix)', () => {
  // UFLS is automatic protection, not AEMO-ordered shedding (§8.1): the price is the stack's,
  // on the metered (lit) demand plus the cold-load surge of restored districts.
  const s = opening(1);
  s.sec.r5MW = 5000; s.sec.lMW = 500;
  s.env.demandMW += 1200; // past coal on the whole city
  const whole = market.clearPrice(s);
  for (let i = 0; i < s.city.districts.length; i++) {
    const st = s.city.districts[i].uflsStage;
    if (st === 1 || st === 2) fleet.setDistrictDark(s, i, true, 'ufls');
  }
  assert.ok(s.city.shedFrac > 0.1);
  const p = market.clearPrice(s);
  assert.notEqual(p.mwh, V.PRICE_CAP, 'UFLS districts alone do not set the cap');
  assert.ok(p.marginalId !== '' && p.mwh <= whole.mwh, 'the lit demand clears lower in the stack: ' + p.marginalId + ' $' + p.mwh);
  const lit = s.env.demandMW * (1 - s.city.shedFrac) - s.tie.flowMW - s.battery.schedMW;
  let cum = 0;
  for (const b of market.buildStack(s)) { cum += b.mw; if (cum >= lit - 1e-6) { assert.equal(b.id, p.marginalId); break; } }
  s.city.coldLoadMW = 900; // a restore's surge is metered load
  assert.ok(market.clearPrice(s).mwh >= p.mwh);
});

test('P-5: wind and solar are in the stack at their AVAILABLE MW: a curtailment LIMIT never raises the price (review fix)', () => {
  const s = createState(20, CLASSIC);
  s.tick = ticksAt(12);
  sampleSecond(s);
  s.sec.r5MW = 5000; s.sec.lMW = 500;
  s.ren.windMW = s.env.windAvailMW; s.ren.solarMW = s.env.solarAvailMW;
  const free = market.clearPrice(s);
  for (const limit of [0.5, 0]) {
    s.ren.solarMW = s.env.solarAvailMW * limit; s.ren.windMW = s.env.windAvailMW * limit; // curtailed output
    assert.deepEqual(market.clearPrice(s), free, 'LIMIT ' + limit * 100 + '% moved the price');
  }
  const solar = market.buildStack(s).find(b => b.id === 'solar');
  assert.ok(solar && Math.abs(solar.mw - s.env.solarAvailMW) < 1e-9, 'available solar is offered');
});

test('P-8: RERT sits outside the market: its MW are never a block and never lower the price', () => {
  const s = opening(4);
  s.sec.r5MW = 5000; s.sec.lMW = 500;
  s.env.demandMW += 900; // past coal and CCGT: hydro or a GT is marginal
  const a = market.clearPrice(s);
  s.rert.armed = true; s.rert.outMW = V.RERT_MW;
  assert.deepEqual(market.clearPrice(s), a);
  assert.ok(!market.buildStack(s).some(b => b.kind === 'rert' || b.id === 'rert'));
});

test('P-5: in-market DR is offered at its price while calls remain; an active call stays in the stack at its delivered MW', () => {
  const s = opening(1);
  const dr = () => market.buildStack(s).filter(b => b.id === 'dr');
  assert.deepEqual(dr(), [{id: 'dr', kind: 'dr', offer: V.DR_PRICE, mw: V.DR_MW}]);
  s.dr.activeS = 100; s.dr.mw = 200; s.dr.callsLeft = 0;
  assert.deepEqual(dr(), [{id: 'dr', kind: 'dr', offer: V.DR_PRICE, mw: 200}]);
  s.dr.activeS = 0; s.dr.mw = 0;
  assert.deepEqual(dr(), [], 'no calls left, none active');
});

test('P-6: hydro offers at its water value; at the stop level it offers only its present output', () => {
  const s = opening(1);
  const hydro = () => market.buildStack(s).filter(b => b.kind === 'hydro');
  const full = hydro();
  assert.ok(full.every(b => b.offer === market.waterValue(1)));
  assert.equal(full.reduce((a, b) => a + b.mw, 0), V.STATIONS.hydro.totalMW, 'two online machines plus the idle one (3-min start)');
  s.hydro.storageMWh = V.HYDRO_STOP_MWH;
  const dry = hydro();
  const present = s.units.filter(u => u.station === 'hydro' && u.mode === 'on').map(u => u.schedMW);
  assert.deepEqual(dry.map(b => b.mw), present, 'the idle machine has no water to start; the others only what they produce');
  assert.ok(dry[0].offer > market.waterValue(0.1));
});

test('priceSecond writes clearPrice into state.price in place; the adder follows R5 / L', () => {
  const s = opening(1);
  s.sec.r5MW = 700; s.sec.lMW = 650;
  const ref = s.price;
  market.priceSecond(s, []);
  assert.equal(s.price, ref, 'same object');
  assert.deepEqual(s.price, market.clearPrice(s));
  near(s.price.x, 700 / 650);
  near(s.price.adder, market.scarcityAdder(700 / 650));
  assert.ok(s.price.adder > 0);
});

test('S-2: exports credited, RERT and DR paid per MWh delivered, wear on throughput; a partial last second uses acc.ticks; the market bill stays out of CUSTOMER COST', () => {
  const s = opening(3);
  const ticks = 10, secs = ticks / V.TICKS_PER_S, h = secs / 3600;
  s.tick = 5 * V.TICKS_PER_S + ticks; // the day ended 10 ticks into a second
  Object.assign(s.acc, {ticks, fSumHz: 50 * ticks, fMinHz: 50, fMaxHz: 50, battAbsMWs: 100 * secs, servedMWs: 5000 * secs});
  s.tie.flowMW = -300; s.rert.outMW = 300; s.dr.mw = 350; s.price.mwh = 100;
  market.settleSecond(s, []);
  const sc = s.score, c = sc.cost;
  near(c.tie, -300 * h * s.env.neighbourPrice, 'export credited');
  near(c.rert, 300 * h * V.RERT_COST);
  near(c.dr, 350 * h * V.DR_PRICE);
  near(c.battWear, 100 * h * V.BATT_WEAR_PER_MWH);
  near(c.noLoad, s.units.reduce((a, u) => a + (u.sync ? V.MACHINES[u.k].noLoadPerS * secs : 0), 0));
  near(sc.co2t, 300 * h * V.RERT_CO2, 'unit outputs are 0 in acc here, so only the diesel emits');
  near(sc.marketBill, 100 * 5000 * h);
  near(sc.servedMWh, 5000 * h);
  near(s.last.servedMW, 5000);
  near(market.scoreSummary(sc).costDollars, c.fuel + c.noLoad + c.starts + c.tie + c.battWear + c.dr + c.rert + c.flex);
  assert.equal(s.acc.ticks, 0);
});

test('S-1 / Y-4: unserved splits by why districts are dark; the frequency record keeps extremes, time outside the band and the 2-h sparkline', () => {
  const s = opening(2);
  const d = s.city.districts;
  const iU = d.findIndex(x => x.uflsStage === 1), iD = d.findIndex(x => x.rot === 0);
  fleet.setDistrictDark(s, iU, true, 'ufls');
  fleet.setDistrictDark(s, iD, true, 'directed');
  s.tick = (3 * V.SPARK_BLOCK_S + 10) * V.TICKS_PER_S; // settling a second in block 3
  Object.assign(s.acc, {ticks: 50, fSumHz: 49.8 * 50, fMinHz: 49.7, fMaxHz: 49.9, shedMWs: 360});
  market.settleSecond(s, []);
  const sc = s.score;
  near(sc.unservedMWh, 0.1);
  near(sc.uflsMWh + sc.directedMWh + sc.taskMWh, sc.unservedMWh);
  near(sc.uflsMWh / sc.directedMWh, d[iU].share / d[iD].share);
  near(sc.spark[3], 0.3);
  assert.equal(sc.spark.filter(x => x > 0).length, 1);
  assert.equal(sc.outsideNormalS, 1);
  near(sc.minHz, 49.7);
  near(s.last.fMeanHz, 49.8);
});

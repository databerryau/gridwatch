// tests/lib/inject.js and the stage-A records it puts on a day (desk/README.md §32.4.4-§32.4.7,
// §32.5.2 steps 3 and 5): the new types' appliers and texts, the fleet / grid / market helpers, COVER's
// securedTick, the 04:30 HAND tag and the opening on lit demand. Each day is jumped a few grid
// minutes at most; the consequences in the grid (the gate, the clamp, the books) are wave 1's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, observe, applyInput, scenarioHash} from '../sim/step.js';
import {TYPE_ORDER} from '../sim/events.js';
import {litDemandMW, setDistrictDark} from '../sim/fleet.js';
import {isClean, isPerfect} from '../sim/market.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK} from '../content/scenarios.js';
import {injectEvent, stateWith} from './lib/inject.js';

const TPS = V.TICKS_PER_S;
/** Step s to grid second sec (exclusive of its own tick); the records step() returned on the way. */
function runTo(s, sec) {
  const out = [];
  while (s.tick < sec * TPS) out.push(...step(s));
  return out;
}
const supply = s => s.units.reduce((a, u) => a + u.outMW, 0) + s.tie.flowMW + s.ren.windMW + s.ren.solarMW + s.battery.outMW;
const dist = (s, id) => s.city.districts.find(d => d.id === id);

test('stateWith(seed, scn, []) is createState; every pre-rolled record carries act 0 and crisis false (legacy)', () => {
  for (const scn of [DESK, CLASSIC]) {
    const s = createState(7, scn);
    assert.deepEqual(stateWith(7, scn, []), s);
    assert.ok(s.ext.events.every(e => e.act === 0 && e.crisis === false), scn.id);
    assert.equal(scenarioHash(scn), s.scnHash);
  }
  assert.notEqual(scenarioHash(CLASSIC), scenarioHash(DESK));
});

test('injectEvent refuses a past second, an unknown type, a second heatAnnounce and one on a MILD day', () => {
  const s = createState(2, DESK); // HOT, no heat
  runTo(s, 2);
  assert.throws(() => injectEvent(s, {atS: 1, type: 'notice', args: {code: 'X'}}), /has run/);
  assert.throws(() => injectEvent(s, {atS: 5, type: 'nope', args: {}}), /unknown type/);
  injectEvent(s, {atS: 2, type: 'notice', args: {code: 'X'}});
  const heat = {atS: 60, type: 'heatAnnounce', args: {onsetS: 120, endS: 600, upliftPm: 65, deratePm: 70}};
  injectEvent(s, heat);
  assert.throws(() => injectEvent(s, heat), /second one/);
  assert.equal(createState(1, DESK).day.temp, 'MILD');
  assert.throws(() => injectEvent(createState(1, DESK), heat), /MILD/);
});

test('an injected cloudOnset leaves the sky unchanged before its atS and lowers it 30 min after', () => {
  const base = createState(3, CLASSIC), at = 6 * 3600;
  const s = stateWith(3, CLASSIC, [{atS: at, type: 'cloudOnset', args: {clearMu: 0.32}}]);
  const a = base.ext.series.clearPm, b = s.ext.series.clearPm, k = at / V.SERIES_STEP_S, k30 = k + 30;
  assert.deepEqual(b.slice(0, k), a.slice(0, k));
  assert.ok(b[k30] < a[k30] - 200, 'at +30 min: ' + b[k30] + ' against ' + a[k30] + ' per-mille');
});

test('an injected heatAnnounce gives the heat window\'s derate (ext.heat re-derived) and its news at 04:00', () => {
  const s = stateWith(2, DESK, [{atS: 0, type: 'heatAnnounce', args: {onsetS: 120, endS: 600, upliftPm: 65, deratePm: 70}}]);
  assert.deepEqual(s.ext.heat, {announceS: 0, onsetS: 120, endS: 600});
  assert.deepEqual(observe(s).news.map(n => [n.kind, n.fromS, n.toS]), [['heat', 120, 600]]);
  runTo(s, 119);
  assert.equal(s.units[0].availMW, V.MACHINES[0].ratingMW);
  runTo(s, 121);
  assert.ok(s.env.heatActive);
  assert.equal(s.units[0].availMW, V.MACHINES[0].ratingMW * (1 - V.HEAT_THERMAL_DERATE));
});

test('the Act I constraints: an atS-0 tieDerate at tick 0 is news with the limit set, and its end lifts it; a late return blocks the start, the booking and the plan until it ends', () => {
  const s = createState(2, DESK);
  assert.equal(applyInput(s, {type: 'planStart', unit: 'gta1', atS: 120}).ok, true, 'booked before the outage is known');
  injectEvent(s, {atS: 0, type: 'tieDerate', args: {limitMW: 450, untilS: 240}});
  injectEvent(s, {atS: 0, type: 'unitOutage', args: {unit: 'gta1', untilS: 300}});
  injectEvent(s, {atS: 240, type: 'tieDerateEnd', args: {}});
  injectEvent(s, {atS: 300, type: 'unitReturn', args: {unit: 'gta1'}});
  const o = observe(s), g = o.units.find(u => u.id === 'gta1');
  assert.deepEqual(o.news.map(n => [n.kind, n.fromS, n.toS, n.text]), [
    ['tie', 0, 240, 'Network outage: tie imports limited to 450 MW until 04:04.'],
    ['outage', 0, 300, 'Late return from maintenance: GT·A unavailable until 04:05.']]);
  assert.deepEqual([o.tie.importLimitMW, o.tie.limitUntilS], [450, 240]);
  assert.deepEqual([g.outUntilS, g.startBlock], [300, 'on outage until 04:05']);
  assert.match(applyInput(s, {type: 'planStart', unit: 'gta1', atS: 200}).reason, /^on outage until 04:05 \(free to start 5 min/);
  // onAtS: the booking at 120 is on at max(120, 300) + T1 + auto-sync + T2, so a key at 900 has no machine and books one after the return
  assert.equal(applyInput(s, {type: 'planKey', station: 'gta', atS: 900, mw: 300}).ok, true);
  const key = s.plan.stations.find(p => p.id === 'gta').keys[0];
  assert.ok(key.atS >= 300 + g.startToMinS, 'the key moved past the return: ' + key.atS);
  assert.deepEqual(s.plan.starts, [{unit: 'gta1', atS: 300}]);
  assert.ok(Math.abs(supply(s) - litDemandMW(s)) < 1);
  const out = runTo(s, 301);
  assert.deepEqual([s.tie.limitMW, s.tie.limitUntilS, s.units[V.MACHINE_IDS.indexOf('gta1')].outUntilS], [V.TIE_MAX_MW, -1, -1]);
  assert.deepEqual(out.filter(r => r.kind === 'log' && (r.code === 'TIE_LIMIT_END' || r.code === 'UNIT_AVAILABLE')).map(r => r.code),
    ['TIE_LIMIT_END', 'UNIT_AVAILABLE']);
  assert.throws(() => stateWith(2, DESK, [{atS: 0, type: 'unitOutage', args: {unit: 'coal1', untilS: 300}}]), /coal1 is on/);
});

test('the restore task\'s records: feederOut holds two districts dark for the network with its news; feederClear hands one back; the opening balances lit demand', () => {
  const s = stateWith(2, DESK, [{atS: 0, type: 'feederOut', args: {districts: ['SAL4', 'SAL5'], clearS: [120, 240]}},
    {atS: 120, type: 'feederClear', args: {district: 'SAL4'}}, {atS: 240, type: 'feederClear', args: {district: 'SAL5'}}]);
  const a = dist(s, 'SAL4'), b = dist(s, 'SAL5');
  assert.deepEqual([a.dark, a.shedBy, a.clearS, a.darkSinceS, b.clearS], [true, 'task', 120, 0, 240]);
  assert.equal(s.city.heldFrac, a.share + b.share);
  const o = observe(s);
  assert.deepEqual(o.news, [{atS: 0, kind: 'network', fromS: 120, toS: 240,
    text: 'Overnight faults: feeders SAL4 and SAL5 under repair, handed back at 04:02 and 04:04.'}]);
  assert.deepEqual(o.districts.filter(d => d.clearS >= 0).map(d => d.id), ['SAL4', 'SAL5']);
  assert.ok(litDemandMW(s) < s.env.demandMW - 100 && Math.abs(supply(s) - litDemandMW(s)) < 1, 'balanced on lit demand');
  const out = runTo(s, 121);
  assert.deepEqual(out.filter(r => r.code === 'FEEDER_CLEAR').map(r => [r.district, r.sev, r.msg]),
    [['SAL4', 'warn', 'SAL4 feeder repaired and handed back: close its breaker to relight it.']]);
  assert.equal(s.city.heldFrac, b.share);
  assert.ok(a.dark, 'handed back, still dark: the restore is the operator\'s');
});

test('the opening: what hydro cannot take above its floor comes off the online coal machines evenly, each at or above MIN', () => {
  const ten = DESK.city.rotation.slice(0, 10);
  const s = stateWith(2, DESK, [{atS: 0, type: 'feederOut', args: {districts: ten, clearS: ten.map(() => 3600)}}]);
  const coal = s.units.filter(u => u.station === 'coal'), hydro = s.units.filter(u => u.station === 'hydro' && u.sync);
  assert.ok(hydro.every(u => u.outMW === 0), 'hydro at its floor');
  assert.ok(coal.every(u => u.outMW === coal[0].outMW && u.outMW >= V.MACHINES[u.k].minMW && u.outMW < 540), 'coal ' + coal[0].outMW);
  assert.equal(s.stations.find(x => x.id === 'coal').basePointMW, 4 * coal[0].outMW);
  assert.ok(Math.abs(supply(s) - litDemandMW(s)) < 1);
});

test('the drought on a dayplan day: droughtWarn is the news (its mean as a per-mille), windDrought then logs only', () => {
  const s = stateWith(2, DESK, [{atS: 60, type: 'droughtWarn', args: {onsetS: 120, muPm: 120}},
    {atS: 120, type: 'windDrought', args: {windMu: 0.12}}]);
  const out = runTo(s, 121);
  assert.deepEqual(observe(s).news.map(n => [n.kind, n.fromS, n.toS, n.text]), [['drought', 120, null,
    'Wind drought from about 04:02: a high-pressure ridge settles in and wind falls toward about 12% of capacity.']]);
  assert.deepEqual(out.filter(r => r.code === 'WIND_DROUGHT').map(r => r.kind), ['log']);
  assert.equal(out.filter(r => r.kind === 'announce').length, 1);
  for (const scn of [CLASSIC, DESK]) { // with no warning (classic; desk's legacy menu at stage A) the onset is the news, as today
    const c = stateWith(2, scn, [{atS: 60, type: 'windDrought', args: {windMu: 0.12}}]);
    runTo(c, 61);
    assert.match(c.news[0].text, /^WIND DROUGHT: a high-pressure ridge has settled in\./, scn.id);
  }
});

test('Q-74 COVER: securedTick latches at the first tick past the watch with R5 >= L; a UFLS district blocks it, a task district does not', () => {
  const trip = {atS: 61, type: 'smelterTrip', args: {offS: 2700}};
  const s = stateWith(4, CLASSIC, [trip]);
  runTo(s, 100);
  const c = s.conts[0];
  assert.ok(s.sec.r5MW >= s.sec.lMW);
  assert.equal(c.securedTick, c.watchEndTick);
  const o = observe(s);
  assert.deepEqual([o.contingency.securedTick, o.contingencies[0].securedS], [c.watchEndTick, c.watchEndTick / TPS]);
  const u = stateWith(4, CLASSIC, [trip]), red1 = u.city.districts.findIndex(d => d.id === 'RED1');
  setDistrictDark(u, red1, true, 'ufls');
  runTo(u, 100);
  assert.equal(u.conts[0].securedTick, -1);
  assert.equal(observe(u).contingencies[0].securedS, -1);
  setDistrictDark(u, red1, false, null);
  runTo(u, 101);
  assert.equal(u.conts[0].securedTick, 100 * TPS);
  const t = stateWith(4, CLASSIC, [{atS: 0, type: 'feederOut', args: {districts: ['SAL4'], clearS: [3600]}}, trip]);
  runTo(t, 100);
  assert.equal(t.conts[0].securedTick, t.conts[0].watchEndTick);
});

test('the 04:30 HAND tag: set on the tick the day reaches PLAYER_START_TICK in HAND, never in AGC; observe carries it', () => {
  for (const agc of [false, true]) {
    const s = createState(1, CLASSIC);
    assert.equal(applyInput(s, {type: 'mode', agc}).ok, true);
    s.tick = V.PLAYER_START_TICK - 1; // (a jump: the tag reads only the tick and the mode)
    step(s);
    assert.equal(s.control.handFlown, false);
    step(s);
    assert.equal(s.control.handFlown, !agc);
    assert.deepEqual([observe(s).handFlown, observe(s).nightShift], [!agc, false]);
  }
});

test('isClean / isPerfect (Q-69), and the new types sit before smelterReturn with the old order kept', () => {
  const sc = {uflsMWh: 0, directedMWh: 0, taskLateMWh: 0};
  assert.deepEqual([isClean(sc, false), isPerfect(sc, false), isClean(sc, true)], [true, true, false]);
  assert.deepEqual([isClean({...sc, taskLateMWh: 3}, false), isPerfect({...sc, taskLateMWh: 3}, false)], [true, false]);
  assert.equal(isClean({...sc, directedMWh: 0.1}, false), false);
  assert.equal(isClean({...sc, uflsMWh: 0.1}, false), false);
  const NEW = ['feederOut', 'tieDerate', 'unitOutage', 'droughtWarn', 'feederClear', 'tieDerateEnd', 'unitReturn'];
  assert.deepEqual(TYPE_ORDER.filter(t => !NEW.includes(t)), ['notice', 'heatAnnounce', 'heatOnset', 'heatEnd', 'stormWarn',
    'stormArrive', 'windCutout', 'stormPass', 'cloudWarn', 'cloudOnset', 'cloudClear', 'windDrought', 'smelterReturn',
    'smelterTrip', 'linkTrip', 'unitTrip']);
  assert.deepEqual(TYPE_ORDER.slice(TYPE_ORDER.indexOf('smelterReturn') - NEW.length, TYPE_ORDER.indexOf('smelterReturn')), NEW);
});

// Stage B owner "events": sim/events.js applyDue() and sim/weather.js forecast() (F-3, S-4, L-2, H-9).
// The forecast information-barrier test is real now and must stay green.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDue} from '../sim/events.js';
import {forecast, sampleSecond} from '../sim/weather.js';
import {createState} from '../sim/step.js';
import {largestContingency} from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {TPS, clone, slowOnly} from './lib/sim-helpers.js';

const TODO = {todo: 'stage B: events'};

/** Advance to grid second s applying due events (no physics or grid logic). */
function goTo(state, s, out = []) {
  state.tick = s * TPS;
  applyDue(state, out);
  sampleSecond(state);
  return out;
}

function seedWith(pred) {
  for (let seed = 1; seed < 5000; seed++) {
    const s = createState(seed, CLASSIC);
    if (pred(s)) return s;
  }
  throw new Error('no seed found');
}

test('S-4: forecast() reads only public information (scrambling future events and the regime changes nothing)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createState(seed, CLASSIC);
    s.tick = 6 * 3600 * TPS; // 10:00
    sampleSecond(s);
    const a = forecast(s, V.FC_HORIZON_S, V.FC_STEP_S);
    const scrambled = clone(s);
    scrambled.ext.regime = {cls: s.ext.regime.cls === 'heat' ? 'calm' : 'heat'};
    for (const e of scrambled.ext.events) if (e.atS > s.env.s) { e.atS += 1234; e.type = 'unitTrip'; e.args = {rule: 'largest'}; }
    scrambled.ext.heat = null;
    for (const k of ['windPm', 'clearPm', 'demandNoiseMW']) {
      scrambled.ext.series[k] = scrambled.ext.series[k].map((x, j) => (j * 60 > s.env.s + 60 ? 40 : x));
    }
    assert.deepEqual(forecast(scrambled, V.FC_HORIZON_S, V.FC_STEP_S), a);
    assert.equal(a.n, 54);
    assert.equal(a.neighbourPrice.length, 54);
    assert.equal(a.exportLimitMW.length, 54);
    assert.ok(a.demandP10.every((x, k) => x <= a.demandP50[k] && a.demandP50[k] <= a.demandP90[k]));
  }
});

test('applyDue: every event is applied once, in order, at its second; evNext advances', TODO, () => {
  const s = createState(21, CLASSIC);
  const n = s.ext.events.length;
  for (let sec = 0; sec < V.DAY_S; sec += 60) goTo(s, sec);
  goTo(s, V.DAY_S - 1);
  assert.equal(s.evNext, n);
  const again = goTo(s, V.DAY_S - 1);
  assert.equal(again.length, 0, 'nothing applies twice');
});

test('H-9 / F-3: unitTrip "largest" trips the largest online machine by output and logs the MW actually lost', TODO, () => {
  const s = seedWith(x => x.ext.events.some(e => e.type === 'unitTrip' && e.args.rule === 'largest'));
  const e = s.ext.events.find(x => x.type === 'unitTrip' && x.args.rule === 'largest');
  goTo(s, e.atS - 1);
  s.units.find(u => u.id === 'coal2').outMW = 555; // make the target unambiguous
  const L = largestContingency(s);
  const out = goTo(s, e.atS);
  const c = out.find(x => x.kind === 'contingency');
  assert.ok(c, 'no contingency event');
  assert.equal(c.id, L.id);
  assert.ok(Math.abs(c.lostMW - L.mw) <= 1, 'logged ' + c.lostMW + ' lost ' + L.mw);
  assert.equal(s.units.find(u => u.id === L.id).mode, 'tripped');
});

test('F-3: a "station" trip hits that station\'s largest online machine, or nothing if none is online', TODO, () => {
  const s = seedWith(x => x.ext.events.some(e => e.args.rule === 'station' && e.args.station === 'gtc'));
  const e = s.ext.events.find(x => x.args.rule === 'station');
  goTo(s, e.atS - 1);
  const out = goTo(s, e.atS);
  assert.equal(out.filter(x => x.kind === 'contingency').length, 0, 'GT-C is off at that time: no trip');
});

test('warned events publish news at the warning time, never earlier (heat 10:30, storm 15:40, cloud 20 min ahead)', TODO, () => {
  const s = seedWith(x => x.ext.regime.cls === 'heat');
  const ann = s.ext.events.find(e => e.type === 'heatAnnounce');
  goTo(s, ann.atS - 1);
  assert.equal(s.news.filter(n => n.kind === 'heat').length, 0);
  goTo(s, ann.atS);
  const n = s.news.find(x => x.kind === 'heat');
  assert.ok(n && n.fromS === ann.args.onsetS && n.toS === ann.args.endS);
  // S-4: a news record never carries the event's id or list index (it would reveal how
  // many silent events came before it).
  assert.deepEqual(Object.keys(n), ['atS', 'kind', 'fromS', 'toS', 'text']);
});

test('smelter: trip removes 256 MW of load in one step (a load contingency), returns later at the ramp', TODO, () => {
  const s = seedWith(x => x.ext.events.some(e => e.type === 'smelterTrip'));
  const e = s.ext.events.find(x => x.type === 'smelterTrip');
  goTo(s, e.atS - 1);
  const before = s.env.demandMW;
  const out = goTo(s, e.atS);
  assert.ok(out.some(x => x.kind === 'contingency' && x.cause === 'load' && x.lostMW === -V.SMELTER_MW));
  assert.ok(before - s.env.demandMW > V.SMELTER_MW - 50);
  for (let t = e.atS; t < e.atS + e.args.offS + 30 * 60; t++) goTo(s, t);
  assert.equal(s.smelter.loadMW, V.SMELTER_MW);
});

test('L-2: realised demand falls inside P10-P90 in 80 +- 5% of 15-min intervals at 1-h and 4-h leads (100 seeds)', {...TODO, ...slowOnly()}, () => {
  for (const leadS of [3600, 4 * 3600]) {
    let inside = 0, total = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s = createState(seed, CLASSIC);
      for (let t = 3600; t + leadS < V.DAY_S - 3600; t += 900) {
        goTo(s, t);
        const fc = forecast(s, leadS, V.FC_STEP_S);
        const k = fc.n - 1;
        const probe = clone(s);
        goTo(probe, t + leadS);
        total++;
        if (probe.env.demandMW >= fc.demandP10[k] && probe.env.demandMW <= fc.demandP90[k]) inside++;
      }
    }
    assert.ok(Math.abs(inside / total - 0.8) <= 0.05, 'lead ' + leadS + ' s: ' + (inside / total).toFixed(3));
  }
});

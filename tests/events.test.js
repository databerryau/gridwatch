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

test('applyDue: every event is applied once, in order, at its second; evNext advances', () => {
  const s = createState(21, CLASSIC);
  const n = s.ext.events.length;
  for (let sec = 0; sec < V.DAY_S; sec += 60) goTo(s, sec);
  goTo(s, V.DAY_S - 1);
  assert.equal(s.evNext, n);
  const again = goTo(s, V.DAY_S - 1);
  assert.equal(again.length, 0, 'nothing applies twice');
});

test('H-9 / F-3: unitTrip "largest" trips the largest online machine by output and logs the MW actually lost', () => {
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

test('F-3: a "station" trip hits that station\'s largest online machine, or nothing if none is online', () => {
  const s = seedWith(x => x.ext.events.some(e => e.args.rule === 'station' && e.args.station === 'gtc'));
  const e = s.ext.events.find(x => x.args.rule === 'station');
  goTo(s, e.atS - 1);
  const out = goTo(s, e.atS);
  assert.equal(out.filter(x => x.kind === 'contingency').length, 0, 'GT-C is off at that time: no trip');
});

test('warned events publish news at the warning time, never earlier (heat 10:30, storm 15:40, cloud 20 min ahead)', () => {
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

test('smelter: trip removes 256 MW of load in one step (a load contingency), returns later at the ramp', () => {
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

test('L-2: realised demand falls inside P10-P90 in 80 +- 5% of 15-min intervals at 1-h and 4-h leads (100 seeds)', slowOnly(), () => {
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

// ------------------------------------------------------------------ stage B extensions (market + events)

const colAt = (fc, s) => Math.round((s - fc.fromS) / fc.stepS) - 1;

test('news: storm, cloud and drought warnings carry exactly five keys, and the announce record is a copy', () => {
  const want = {stormWarn: ['storm', e => e.args.arriveS], cloudWarn: ['cloud', e => e.args.onsetS], windDrought: ['drought', e => e.atS]};
  for (const [type, [kind, fromS]] of Object.entries(want)) {
    const s = seedWith(x => x.ext.events.some(e => e.type === type));
    const e = s.ext.events.find(x => x.type === type);
    goTo(s, e.atS - 1);
    assert.equal(s.news.filter(n => n.kind === kind).length, 0, kind + ' not before its time');
    const out = goTo(s, e.atS);
    const n = s.news.find(x => x.kind === kind);
    assert.deepEqual(Object.keys(n), ['atS', 'kind', 'fromS', 'toS', 'text']);
    assert.equal(n.atS, e.atS);
    assert.equal(n.fromS, fromS(e));
    assert.equal(n.toS, null);
    const a = out.find(x => x.kind === 'announce' && x.news.kind === kind);
    assert.deepEqual(a.news, n);
    assert.notEqual(a.news, n, 'the record holds a copy, never state');
    assert.equal(a.cue, 'warn');
  }
});

test('honest texts: the heat warning states the sim\'s own uplift, derate and times; fictional names only (H-15)', () => {
  const s = seedWith(x => x.ext.regime.cls === 'heat');
  const e = s.ext.events.find(x => x.type === 'heatAnnounce');
  const out = goTo(s, e.atS);
  const n = s.news.find(x => x.kind === 'heat');
  assert.match(n.text, /extreme heat 13:30-20:00/);
  assert.match(n.text, /\+6\.5%/);
  assert.match(n.text, /-7%/);
  assert.match(n.text, /building from 12:30, easing by 21:00/);
  for (const r of out) if (r.msg) assert.doesNotMatch(r.msg, /MERIDIAN|ALCOA|SNOWY|\bBOM\b/i);
  assert.doesNotMatch(n.text, /MERIDIAN|ALCOA|SNOWY|\bBOM\b/i);
});

test('smelter: the return time is known at the trip, and the ramp is a function of time (a caller that jumps seconds sees the same load)', () => {
  const s = seedWith(x => x.ext.events.some(e => e.type === 'smelterTrip'));
  const e = s.ext.events.find(x => x.type === 'smelterTrip');
  goTo(s, e.atS);
  assert.equal(s.smelter.returnS, e.atS + e.args.offS);
  const a = clone(s), b = clone(s);
  const probe = s.smelter.returnS + 300;
  for (let t = e.atS + 1; t <= probe; t++) goTo(a, t);
  goTo(b, probe);
  assert.equal(b.smelter.loadMW, a.smelter.loadMW);
  assert.ok(Math.abs(a.smelter.loadMW - V.SMELTER_RETURN_MW_MIN / 60 * 301) < 1e-9, 'load ' + a.smelter.loadMW);
  assert.equal(a.smelter.returning, true);
});

test('S-4 forecast: after a storm warning the wind forecast surges toward the storm, then falls in the cut-out window', () => {
  const s = seedWith(x => x.ext.regime.cls === 'storm');
  const w = s.ext.events.find(e => e.type === 'stormWarn');
  goTo(s, w.atS);
  const quiet = clone(s);
  quiet.news = quiet.news.filter(n => n.kind !== 'storm');
  const a = forecast(s, V.FC_HORIZON_S, V.FC_STEP_S), b = forecast(quiet, V.FC_HORIZON_S, V.FC_STEP_S);
  const st = CLASSIC.events.storm, arrive = w.args.arriveS;
  const k1 = colAt(a, arrive + 1800), k2 = colAt(a, arrive + Math.round((st.cutoutWindowH[1] - st.arriveH) * 3600) + 2700);
  assert.ok(a.windMW[k1] > b.windMW[k1] + 100, 'surge: ' + a.windMW[k1] + ' vs ' + b.windMW[k1]);
  assert.ok(a.windMW[k2] < b.windMW[k2] - 100, 'cut-out: ' + a.windMW[k2] + ' vs ' + b.windMW[k2]);
});

test('S-4 forecast: after a cloud warning the solar forecast dips inside the warned window', () => {
  const s = seedWith(x => x.ext.events.some(e => e.type === 'cloudWarn'));
  const w = s.ext.events.find(e => e.type === 'cloudWarn');
  goTo(s, w.atS);
  const quiet = clone(s);
  quiet.news = quiet.news.filter(n => n.kind !== 'cloud');
  const a = forecast(s, V.FC_HORIZON_S, V.FC_STEP_S), b = forecast(quiet, V.FC_HORIZON_S, V.FC_STEP_S);
  const k = colAt(a, w.args.onsetS + 2400);
  assert.ok(a.solarMW[k] < 0.8 * b.solarMW[k], a.solarMW[k] + ' vs ' + b.solarMW[k]);
  assert.ok(a.solarMW[k] > 0);
});

test('forecast: after a smelter trip P50 carries the missing load until the announced return, then the ramp back', () => {
  const s = seedWith(x => x.ext.events.some(e => e.type === 'smelterTrip'));
  const e = s.ext.events.find(x => x.type === 'smelterTrip');
  goTo(s, e.atS);
  const whole = clone(s);
  Object.assign(whole.smelter, {loadMW: V.SMELTER_MW, returning: false});
  const a = forecast(s, V.FC_HORIZON_S, V.FC_STEP_S), b = forecast(whole, V.FC_HORIZON_S, V.FC_STEP_S);
  const back = s.smelter.returnS, full = back + V.SMELTER_MW / V.SMELTER_RETURN_MW_MIN * 60;
  let before = 0, after = 0;
  for (let k = 0; k < a.n; k++) {
    const t = a.fromS + (k + 1) * a.stepS;
    if (t < back) { before++; assert.ok(Math.abs(b.demandP50[k] - a.demandP50[k] - V.SMELTER_MW) < 1e-6); }
    if (t > full) { after++; assert.ok(Math.abs(b.demandP50[k] - a.demandP50[k]) < 1e-6); }
  }
  assert.ok(before > 0 && after > 0);
});

test('L-2: the P10-P90 band widens with lead (no column at lead 0; an empty horizon gives empty columns)', () => {
  const s = createState(3, CLASSIC);
  goTo(s, 6 * 3600);
  const fc = forecast(s, 4 * 3600, 60);
  const w = fc.demandP90.map((x, k) => x - fc.demandP10[k]);
  for (let k = 1; k < w.length; k++) assert.ok(w[k] >= w[k - 1], 'band narrows at column ' + k);
  assert.ok(w[0] > 0 && w[0] < w[w.length - 1] / 2);
  assert.deepEqual(forecast(s, 0, V.FC_STEP_S).demandP50, []);
});

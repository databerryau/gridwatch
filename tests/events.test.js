// Stage B owner "events": sim/events.js applyDue() and sim/weather.js forecast() (F-3, S-4, L-2, H-9).
// The forecast information-barrier test is real now and must stay green.
// Phase 2a owner "world" (desk/README.md §21.1): the forecast with rooftop PV and day types, and
// events.mslSecond (P-4), on the game's days (DESK, DESK_WEEKEND); see the section at the end.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDue, mslSecond} from '../sim/events.js';
import {forecast, sampleSecond, underlyingBaseMW, rooftopClearSkyMW} from '../sim/weather.js';
import {createState, step} from '../sim/step.js';
import {largestContingency} from '../sim/fleet.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
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

// ------------------------------------------------------------------ Phase 2a "world" (desk/README.md §21.1)
// The forecast with rooftop PV and day types (P-1, P-2, P-3, L-2, S-4) and the MSL notices (P-4, C-9).

const H = 3600, secOf = (h, m = 0) => (h - V.DAY_START_H) * H + m * 60;
const FC = s => forecast(s, V.FC_HORIZON_S, V.FC_STEP_S);

test('S-4 (DESK): forecast() never reads the rooftop skies or the hidden day type: scrambling ext.rooftop, ext.regime.temp and the rest of ext changes nothing', () => {
  const temps = {1: 'MILD', 2: 'HOT', 4: 'HEATWAVE'};
  for (const scn of [DESK, DESK_WEEKEND]) {
    for (const seed of [1, 2, 4]) {
      const s = createState(seed, scn);
      assert.equal(s.ext.regime.temp, temps[seed], 'seed ' + seed);
      goTo(s, secOf(10)); // 10:00: seed 4's heatwave is not announced until 10:30
      assert.equal(s.news.filter(n => n.kind === 'heat').length, 0);
      const a = FC(s), day = forecast(s, V.DAY_S - s.env.s, V.FC_STEP_S);
      assert.ok(a.rooftopMW.every(x => x > 1000), 'a sunny window: the rooftop forecast is in play');
      const later = clone(s);
      goTo(later, secOf(11));
      for (const temp of ['MILD', 'HOT', 'HEATWAVE']) {
        const x = clone(s), r = x.ext.rooftop;
        x.ext.regime = {cls: s.ext.regime.cls === 'heat' ? 'calm' : 'heat', temp};
        r.clearPm = r.clearPm.map(row => row.map((v, i) => (i * r.stepS > s.env.s + r.stepS ? 150 : v)));
        for (const e of x.ext.events) if (e.atS > s.env.s) { e.atS += 1234; e.type = 'unitTrip'; e.args = {rule: 'largest'}; }
        x.ext.heat = null;
        for (const k of ['windPm', 'clearPm', 'demandNoiseMW']) {
          x.ext.series[k] = x.ext.series[k].map((v, j) => (j * 60 > s.env.s + 60 ? 40 : v));
        }
        assert.deepEqual(FC(x), a, scn.id + ' seed ' + seed + ' as ' + temp);
        assert.deepEqual(forecast(x, V.DAY_S - s.env.s, V.FC_STEP_S), day, 'dayAhead, ' + scn.id + ' seed ' + seed + ' as ' + temp);
        // The scramble is real: an hour on, the truth has lost a large part of its rooftop.
        goTo(x, secOf(11));
        assert.ok(x.env.rooftopMW < 0.6 * later.env.rooftopMW, x.env.rooftopMW + ' vs ' + later.env.rooftopMW);
        assert.equal(x.day.temp, s.day.temp, 'state.day was set once, at createState');
      }
    }
  }
});

test('P-1 forecast: demandP50 is operational; underlyingP50 = demandP50 + rooftopMW + the smelter\'s expected missing load, column by column', () => {
  const s = createState(8, DESK); // MILD; the potline trips at 12:23 for 45 min
  const e = s.ext.events.find(x => x.type === 'smelterTrip');
  goTo(s, e.atS);
  const fc = FC(s), back = s.smelter.returnS, full = back + V.SMELTER_MW / V.SMELTER_RETURN_MW_MIN * 60;
  let before = 0, after = 0;
  for (let k = 0; k < fc.n; k++) {
    const t = fc.fromS + (k + 1) * fc.stepS, gap = fc.underlyingP50[k] - fc.rooftopMW[k] - fc.demandP50[k];
    assert.ok(gap > -1e-9 && gap < V.SMELTER_MW + 1e-9, 'column ' + k);
    assert.ok(fc.rooftopMW[k] > 0 && fc.demandP10[k] < fc.demandP50[k] && fc.demandP50[k] < fc.demandP90[k]);
    if (t < back) { before++; assert.ok(Math.abs(gap - V.SMELTER_MW) < 1e-9); }
    if (t > full) { after++; assert.ok(Math.abs(gap) < 1e-9); }
  }
  assert.ok(before > 0 && after > 0);
  // One second ahead the forecast is the present (the band has barely opened).
  const near = forecast(s, 1, 1);
  assert.ok(Math.abs(near.rooftopMW[0] - s.env.rooftopMW) < 1, near.rooftopMW[0] + ' vs ' + s.env.rooftopMW);
  assert.ok(Math.abs(near.demandP50[0] - s.env.demandMW) < 2);
  assert.ok(near.demandP90[0] - near.demandP10[0] < 30);
});

test('P-3 forecast: underlying P50 is the day type\'s own shape (from the public state.day) + the present deviation decaying at the noise revert rate', () => {
  for (const [seed, scn] of [[1, DESK], [1, DESK_WEEKEND], [2, DESK], [2, DESK_WEEKEND]]) {
    const s = createState(seed, scn);
    goTo(s, secOf(9));
    const fc = FC(s), dev = s.env.underlyingMW - underlyingBaseMW(s.scn, s.day, s.env.h);
    for (const k of [0, 11, 35, 53]) {
      const lead = (k + 1) * fc.stepS, h = s.env.h + lead / H;
      const want = underlyingBaseMW(s.scn, s.day, h) + dev * (1 - s.scn.demand.noise.revertPerMin) ** (lead / 60);
      assert.ok(Math.abs(fc.underlyingP50[k] - want) < 1e-6, scn.id + ' seed ' + seed + ' column ' + k);
    }
  }
  // The weekend of the same seed: 0.92 of the shape, the same noise, the same roofs.
  const wd = createState(8, DESK), we = createState(8, DESK_WEEKEND);
  goTo(wd, secOf(9)); goTo(we, secOf(9));
  const a = FC(wd), b = FC(we);
  assert.deepEqual(b.rooftopMW, a.rooftopMW);
  for (let k = 0; k < a.n; k++) assert.ok(Math.abs(b.underlyingP50[k] - V.WEEKEND_DEMAND_FACTOR * a.underlyingP50[k]) < 0.08 * 400);
});

test('P-2 forecast: rooftop follows the capacity-weighted clearness now toward the scenario\'s mean; announced heat derates it inside its window only', () => {
  const s = createState(2, DESK), roof = s.scn.rooftop;
  goTo(s, secOf(8, 30));
  const fc = FC(s);
  let kNow = 0;
  roof.share.forEach((w, j) => { kNow += w * s.env.roofClearFrac[j]; });
  const kAt = k => (fc.rooftopMW[k] / rooftopClearSkyMW(s.scn, s.env.h + (k + 1) * fc.stepS / H) - 1) / roof.cloudBite + 1;
  const a = 1 - roof.cloud.regional.revertPerStep;
  for (const k of [0, 5, 23, 53]) { // FC_STEP_S is the cloud step: whole steps, exact
    const want = roof.cloud.mu + (kNow - roof.cloud.mu) * a ** (k + 1);
    assert.ok(Math.abs(kAt(k) - want) < 1e-9, 'column ' + k + ': ' + kAt(k) + ' vs ' + want);
  }
  const fine = forecast(s, H, 60); // one-minute columns: the skies still move in their own 5-min steps
  for (const k of [0, 5, 11]) assert.equal(fine.rooftopMW[(k + 1) * 5 - 1], fc.rooftopMW[k], 'the same whatever the column step');
  assert.ok(fine.rooftopMW[1] > fine.rooftopMW[0] && fine.rooftopMW[1] < fine.rooftopMW[4], 'and in between, in proportion');
  // Heat: seed 4 at its 10:30 warning, against the same state with the news withheld.
  const heat = createState(4, DESK);
  goTo(heat, secOf(10, 30));
  const quiet = clone(heat);
  quiet.news = quiet.news.filter(n => n.kind !== 'heat');
  const x = FC(heat), y = FC(quiet);
  const k12 = colAt(x, secOf(12, 30)), k14 = colAt(x, secOf(14, 30));
  assert.equal(x.rooftopMW[k12], y.rooftopMW[k12], 'no derate before the ramp');
  // Along the ramp (12:30-13:30) the derate is r(s) of the full 8%, as heatMultAt ramps the uplift;
  // the clear skies start at the onset, so until then the ratio is the derate alone.
  for (const [m, want] of [[45, 0.98], [60, 0.96], [75, 0.94]]) {
    const k = colAt(x, secOf(12, m));
    assert.ok(Math.abs(x.rooftopMW[k] / y.rooftopMW[k] - want) < 1e-12, '12:30 + ' + (m - 30) + ' min: ' + x.rooftopMW[k] / y.rooftopMW[k]);
    assert.ok(Math.abs(x.underlyingP50[k] / y.underlyingP50[k] - (1 + V.HEAT_DEMAND_UPLIFT * (m - 30) / 60)) < 0.002, 'the uplift on the same ramp');
  }
  const ratio = x.rooftopMW[k14] / y.rooftopMW[k14];
  assert.ok(ratio > 0.92 && ratio < 0.95, 'x 0.92 hot panels, a little back from the clear skies: ' + ratio);
  assert.ok(Math.abs(x.underlyingP50[k14] / y.underlyingP50[k14] - 1.065) < 0.002, 'and the +6.5% uplift on the underlying demand');
});

test('C-5 forecast: a cloud front is over the solar precinct only: its news moves the utility-solar forecast and nothing of the rooftop or demand forecast', () => {
  for (const seed of [7, 4]) { // 7: HOT, cloud warned 11:29; 4: a heatwave announced 10:30, cloud warned 10:32
    const s = createState(seed, DESK);
    const warn = s.ext.events.find(e => e.type === 'cloudWarn');
    assert.ok(warn.atS > secOf(9) && warn.atS < secOf(13), 'seed ' + seed + ': a front warned in the sunny morning');
    goTo(s, warn.atS + 60);
    assert.equal(s.news.filter(n => n.kind === 'cloud').length, 1);
    assert.equal(s.news.some(n => n.kind === 'heat'), seed === 4);
    const quiet = clone(s);
    quiet.news = quiet.news.filter(n => n.kind !== 'cloud');
    for (const horizon of [V.FC_HORIZON_S, V.DAY_S - s.env.s]) { // the 4.5-h forecast and dayAhead
      const a = forecast(s, horizon, V.FC_STEP_S), b = forecast(quiet, horizon, V.FC_STEP_S);
      assert.ok(a.rooftopMW[0] > 2000, 'the roofs are in play: ' + a.rooftopMW[0]);
      for (const key of ['rooftopMW', 'underlyingP50', 'demandP50', 'demandP10', 'demandP90', 'windMW']) {
        assert.deepEqual(a[key], b[key], 'seed ' + seed + ' ' + key);
      }
      assert.notDeepEqual(a.solarMW, b.solarMW, 'the front is in the utility-solar forecast');
      assert.ok(Math.max(...a.solarMW.map((x, k) => b.solarMW[k] - x)) > 200, 'by hundreds of MW');
    }
  }
});

test('L-2: the band carries the rooftop cloud process\'s own forecast error (regional sky + local terms), in MW at that hour\'s sun; none in the dark', () => {
  const s = createState(2, DESK), roof = s.scn.rooftop, c = roof.cloud;
  goTo(s, secOf(8, 30));
  const still = clone(s); // the same day with a sky that cannot move: the demand band alone
  still.scn.rooftop.cloud.regional.sigmaPerStep = 0;
  still.scn.rooftop.cloud.local.sigmaPerStep = 0;
  const a = FC(s), b = FC(still);
  assert.deepEqual(b.demandP50, a.demandP50);
  const half = (fc, k) => (fc.demandP90[k] - fc.demandP10[k]) / 2 / V.Z_P90;
  const aR = 1 - c.regional.revertPerStep, aL = 1 - c.local.revertPerStep;
  const share2 = roof.share.reduce((t, w) => t + w * w, 0);
  for (const k of [0, 11, 29, 53]) {
    const n = k + 1, h = s.env.h + n * a.stepS / H;
    const varK = c.regional.sigmaPerStep ** 2 * (1 - aR ** (2 * n)) / (1 - aR * aR) +
      share2 * c.local.sigmaPerStep ** 2 / (1 - aL * aL) * ((1 - aL ** (2 * n)) + (aR ** n - aL ** n) ** 2);
    const want = (rooftopClearSkyMW(s.scn, h) * roof.cloudBite) ** 2 * varK;
    const got = half(a, k) ** 2 - half(b, k) ** 2;
    assert.ok(Math.abs(got - want) < 1e-6 * want, 'column ' + k + ': ' + got + ' vs ' + want);
  }
  assert.ok(half(a, 47) > half(b, 47) + 40, 'at 12:30 the roofs widen the band: ' + half(a, 47) + ' vs ' + half(b, 47));
  // Before sunrise there is no rooftop to be wrong about.
  goTo(s, 0); goTo(still, 0);
  const n0 = FC(s), n1 = FC(still);
  for (let k = 0; k < 24; k++) assert.equal(n0.demandP90[k] - n0.demandP10[k], n1.demandP90[k] - n1.demandP10[k]);
});

test('L-2 (DESK): realised operational demand falls inside P10-P90 in 80 +- 5% of 15-min intervals at 1-h and 4-h leads (100 seeds)', slowOnly(), () => {
  for (const leadS of [3600, 4 * 3600]) {
    let inside = 0, total = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s = createState(seed, DESK);
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

// ---- P-4: MSL notices (C-9)

/** A forecast-shaped object whose lowest P50 is `min`, in its second column. */
const fcMin = (s, min) => ({fromS: s.env.s, stepS: 300, n: 3, demandP50: [5000, min, 5000]});
const words = msg => msg.trim().split(/\s+/).length;

test('P-4 / C-9: the MSL level is the forecast minimum against 1,600 / 1,300 / 1,000 MW: reached at or below, left 100 MW above; one record per change', () => {
  const s = createState(1, DESK_WEEKEND);
  goTo(s, secOf(9));
  const out = [], atS = s.env.s + 600;
  const check = min => { const n = out.length; mslSecond(s, fcMin(s, min), out); return out.slice(n); };
  assert.deepEqual(check(1601), []);
  assert.deepEqual(s.msl, {level: 0, minMW: 1601, atS, sinceS: -1}, 'the minimum and its time are kept at every check');
  const up = check(1600);
  assert.equal(up.length, 1);
  assert.deepEqual(Object.keys(up[0]), ['tick', 'kind', 'sev', 'code', 'msg', 'level', 'minMW', 'atS']);
  assert.deepEqual({...up[0], msg: ''}, {tick: s.tick, kind: 'log', sev: 'info', code: 'MSL1', msg: '', level: 1, minMW: 1600, atS});
  assert.equal(up[0].msg, 'MSL1 notice: lowest forecast demand 1,600 MW at 09:10. MSL1 is 1,600 MW: two load trips above the security floor.');
  assert.deepEqual(s.msl, {level: 1, minMW: 1600, atS, sinceS: s.env.s});
  assert.deepEqual(check(1699.6), [], 'held inside the hysteresis');
  assert.equal(s.msl.minMW, 1699.6);
  const two = check(1250.4);
  assert.deepEqual([two.length, two[0].code, two[0].sev, two[0].level, two[0].minMW], [1, 'MSL2', 'warn', 2, 1250]);
  assert.equal(s.msl.minMW, 1250.4, 'state keeps the forecast\'s value; the record rounds it to 1 MW');
  assert.deepEqual(check(1400), [], 'MSL2 held to 1,400 MW');
  const down = check(1401);
  assert.deepEqual([down.length, down[0].code, down[0].sev, down[0].level], [1, 'MSL1', 'info', 1], 'a fall is a change of level too');
  const three = check(950);
  assert.deepEqual([three.length, three[0].code, three[0].sev, three[0].level], [1, 'MSL3', 'crit', 3], 'two levels in one check: one record');
  assert.equal(three[0].msg, 'MSL3 notice: lowest forecast demand 950 MW at 09:10. MSL3 is 1,000 MW: the security floor.');
  assert.deepEqual(check(1100), []);
  const clear = check(1701);
  assert.deepEqual([clear.length, clear[0].code, clear[0].sev, clear[0].level, clear[0].minMW], [1, 'MSL_CLEAR', 'good', 0, 1701]);
  assert.equal(clear[0].msg, 'MSL notice cancelled: lowest forecast demand 1,701 MW at 09:10. MSL1 is 1,600 MW.');
  assert.deepEqual(s.msl, {level: 0, minMW: 1701, atS, sinceS: s.env.s});
  for (const r of out) {
    assert.ok(words(r.msg) <= 25, words(r.msg) + ' words: ' + r.msg);
    assert.doesNotMatch(r.msg, /undefined|NaN/);
  }
  assert.equal(s.news.length, 0, 'never a news item: news is weather');
});

test('P-4 / C-9: every threshold is 300 MW higher for the hours the tie is out; demand now counts as well as the forecast', () => {
  const s = createState(1, DESK_WEEKEND);
  goTo(s, secOf(9));
  const out = [];
  mslSecond(s, fcMin(s, 1850), out);
  assert.equal(s.msl.level, 0);
  // A tie that is back before the forecast minimum raises nothing there (the per-column rule).
  s.tie.tripped = true; s.tie.lockoutS = 60;
  mslSecond(s, fcMin(s, 1850), out);
  assert.equal(s.msl.level, 0, 'the tie returns at 09:01, the minimum is at 09:10');
  assert.equal(out.length, 0);
  s.tie.lockoutS = 3 * H; // still out at the minimum
  mslSecond(s, fcMin(s, 1850), out);
  assert.equal(s.msl.level, 1);
  assert.equal(out[0].msg, 'MSL1 notice: lowest forecast demand 1,850 MW at 09:10. MSL1 is 1,900 MW (tie out): two load trips above the security floor.');
  assert.ok(words(out[0].msg) <= 25);
  mslSecond(s, fcMin(s, 1590), out);
  assert.deepEqual([s.msl.level, out[1].code], [2, 'MSL2'], '1,590 MW is MSL2 with the tie out (at or below 1,600)');
  s.tie.tripped = false; s.tie.lockoutS = 0;
  mslSecond(s, fcMin(s, 1590), out);
  assert.deepEqual([s.msl.level, out[2].code], [1, 'MSL1'], 'and MSL1 again with the tie back');
  mslSecond(s, fcMin(s, 1850), out);
  assert.deepEqual([s.msl.level, out[3].code], [0, 'MSL_CLEAR']);
  // The present second is part of the test: a potline trip shows at once.
  s.env.demandMW = 1500;
  mslSecond(s, fcMin(s, 5000), out);
  assert.deepEqual(s.msl, {level: 1, minMW: 1500, atS: s.env.s, sinceS: s.env.s});
  assert.equal(out[4].atS, s.env.s);
  // A measured present value is never called a forecast (atS is the record's own second).
  assert.equal(out[4].msg, 'MSL1 notice: demand is at its lowest now, 1,500 MW. MSL1 is 1,600 MW: two load trips above the security floor.');
  s.tie.tripped = true; // the present counts as out while the tie is tripped, whatever its return
  s.env.demandMW = 1450;
  mslSecond(s, fcMin(s, 5000), out);
  assert.equal(out[5].msg, 'MSL2 notice: demand is at its lowest now, 1,450 MW. MSL2 is 1,600 MW (tie out): one load trip above the security floor.');
  s.tie.tripped = false;
  s.env.demandMW = 1800;
  mslSecond(s, fcMin(s, 5000), out);
  assert.equal(out[6].msg, 'MSL notice cancelled: demand is at its lowest now, 1,800 MW. MSL1 is 1,600 MW.');
  for (const r of out) {
    assert.ok(words(r.msg) <= 25, words(r.msg) + ' words: ' + r.msg);
    assert.equal(/ now, /.test(r.msg), r.atS === s.env.s, r.msg);
    assert.equal(/forecast demand .* at \d\d:\d\d\./.test(r.msg), r.atS !== s.env.s, r.msg);
  }
});

test('P-4 / C-9: msl.sinceS is the second of the last change of level, the clear included; minMW and atS move at every check', () => {
  const s = createState(1, DESK_WEEKEND), out = [];
  const t0 = secOf(9), check = min => { mslSecond(s, fcMin(s, min), out); return clone(s.msl); };
  goTo(s, t0);
  assert.deepEqual(check(1700), {level: 0, minMW: 1700, atS: t0 + 600, sinceS: -1}, 'no change yet today');
  goTo(s, t0 + 300);
  assert.deepEqual(check(1550), {level: 1, minMW: 1550, atS: t0 + 900, sinceS: t0 + 300}, 'the rise');
  goTo(s, t0 + 600);
  assert.deepEqual(check(1650), {level: 1, minMW: 1650, atS: t0 + 1200, sinceS: t0 + 300}, 'held: sinceS stays');
  goTo(s, t0 + 900);
  assert.deepEqual(check(1250), {level: 2, minMW: 1250, atS: t0 + 1500, sinceS: t0 + 900}, 'a further rise');
  goTo(s, t0 + 1200);
  assert.deepEqual(check(1500), {level: 1, minMW: 1500, atS: t0 + 1800, sinceS: t0 + 1200}, 'a fall');
  goTo(s, t0 + 1500);
  assert.deepEqual(check(1800), {level: 0, minMW: 1800, atS: t0 + 2100, sinceS: t0 + 1500}, 'the clear moves sinceS too');
  goTo(s, t0 + 1800);
  assert.deepEqual(check(1900), {level: 0, minMW: 1900, atS: t0 + 2400, sinceS: t0 + 1500}, 'and it stays at the clear\'s second');
  assert.deepEqual(out.map(r => [r.code, r.tick / TPS]), [['MSL1', t0 + 300], ['MSL2', t0 + 900], ['MSL1', t0 + 1200], ['MSL_CLEAR', t0 + 1500]]);
});

test('P-4 / C-9: the window is the whole 4.5 h: a minimum in the last of the 54 columns counts, at its own second', () => {
  const s = createState(1, DESK_WEEKEND); // MILD weekend: at 08:30 the belly (13:00) is the window's last column
  goTo(s, secOf(8, 30));
  const fc = FC(s), out = [];
  assert.equal(fc.n, 54);
  assert.equal(fc.n * fc.stepS, 4.5 * H);
  const last = fc.demandP50[53];
  assert.ok(fc.demandP50.slice(0, 53).every(x => x > last) && s.env.demandMW > last, 'the minimum is the last column');
  assert.ok(last > V.MSL1_MW && last <= V.MSL1_MW + V.MSL_TIE_OUT_MW, 'between MSL1 and MSL1 with the tie out: ' + last);
  mslSecond(s, fc, out);
  assert.deepEqual(s.msl, {level: 0, minMW: last, atS: secOf(13), sinceS: -1});
  // A synthetic forecast with only its 54th column low: the notice names that column's second.
  const flat = {fromS: s.env.s, stepS: fc.stepS, n: 54, demandP50: new Array(54).fill(5000)};
  flat.demandP50[53] = 1580;
  mslSecond(s, flat, out);
  assert.deepEqual(s.msl, {level: 1, minMW: 1580, atS: secOf(13), sinceS: s.env.s});
  assert.deepEqual(out.map(r => [r.code, r.minMW, r.atS]), [['MSL1', 1580, secOf(13)]]);
  assert.equal(out[0].msg, 'MSL1 notice: lowest forecast demand 1,580 MW at 13:00. MSL1 is 1,600 MW: two load trips above the security floor.');
});

test('P-4: late in the day the window runs past 04:00, as the forecast\'s columns do: msl.atS may be up to FC_HORIZON_S past DAY_S (level 0, no record)', () => {
  for (const scn of [DESK, DESK_WEEKEND]) {
    const s = createState(4, scn), out = [];
    let past = 0;
    for (let sec = secOf(22); sec < V.DAY_S; sec += V.MSL_CHECK_S) {
      goTo(s, sec);
      mslSecond(s, FC(s), out);
      assert.ok(s.msl.atS >= sec && s.msl.atS <= sec + V.FC_HORIZON_S, 'second ' + sec + ': atS ' + s.msl.atS);
      if (s.msl.atS > V.DAY_S) past++;
    }
    assert.ok(past > 0, 'documented (sim/README.md §5): tomorrow morning, on the same day type');
    assert.equal(s.msl.level, 0);
    assert.equal(out.filter(r => /^MSL/.test(r.code || '')).length, 0, 'never a notice at night');
  }
});

// (The window's length, the returned record and the place in the second are the three cases after this one.)
test('P-4: step() checks the MSL level on every MSL_CHECK_S-th grid second, with that second\'s forecast, and not between checks', () => {
  const s = createState(1, DESK_WEEKEND);
  step(s);
  const want = () => Math.min(s.env.demandMW, ...FC(s).demandP50);
  assert.equal(s.msl.minMW, want(), 'checked at 04:00:00');
  assert.ok(s.msl.atS >= 0 && s.msl.level === 0 && s.msl.sinceS === -1);
  const first = clone(s.msl);
  while (s.tick < V.MSL_CHECK_S * TPS) step(s);
  assert.deepEqual(s.msl, first, 'not between checks');
  step(s);
  assert.equal(s.env.s, V.MSL_CHECK_S);
  assert.equal(s.msl.minMW, want());
  assert.notEqual(s.msl.minMW, first.minMW);
});

/** The MSL records among step()'s returned events. */
const mslRecs = evs => evs.filter(r => r.kind === 'log' && /^MSL/.test(r.code));
const REC_KEYS = ['tick', 'kind', 'sev', 'code', 'msg', 'level', 'minMW', 'atS'];

test('P-4: step() hands mslSecond the 4.5-h forecast (FC_HORIZON_S): a minimum 4.5 h ahead is the one it keeps', () => {
  const s = createState(1, DESK_WEEKEND);
  s.tick = secOf(8, 30) * TPS; // a test poke: straight to 08:30, a check second, with the belly 4.5 h ahead
  const evs = step(s);
  const fc = FC(s);
  assert.equal(s.env.s, secOf(8, 30));
  assert.equal(s.msl.minMW, Math.min(s.env.demandMW, ...fc.demandP50));
  assert.equal(s.msl.atS, secOf(13), 'the last column: 13:00');
  assert.ok(s.msl.atS - s.env.s > 2 * H, 'a lead of ' + (s.msl.atS - s.env.s) / H + ' h');
  assert.ok(s.msl.minMW < Math.min(...fc.demandP50.slice(0, 24)) - 500, 'two hours of forecast would miss it by ' +
    (Math.min(...fc.demandP50.slice(0, 24)) - s.msl.minMW) + ' MW');
  assert.ok(s.msl.minMW < Math.min(...forecast(s, H, V.FC_STEP_S).demandP50) - 1000, 'and one hour by far more');
  assert.equal(s.msl.level, 0);
  assert.deepEqual(mslRecs(evs), [], 'no change of level, no record');
});

test('P-4: step() returns the §19.3 record on a change of level (a rise with the tie out, 4.5 h ahead; the clear)', () => {
  // The clear: a level left over from an earlier check, on a morning far above MSL1.
  const a = createState(1, DESK_WEEKEND);
  a.msl.level = 1;
  const cleared = mslRecs(step(a));
  assert.equal(cleared.length, 1);
  assert.deepEqual(Object.keys(cleared[0]), REC_KEYS);
  assert.deepEqual({...cleared[0], msg: ''}, {tick: 0, kind: 'log', sev: 'good', code: 'MSL_CLEAR', msg: '', level: 0,
    minMW: Math.round(a.msl.minMW), atS: a.msl.atS});
  assert.deepEqual(a.msl, {level: 0, minMW: a.env.demandMW, atS: 0, sinceS: 0}, 'at 04:00 demand only rises: the minimum is now');
  assert.match(cleared[0].msg, /^MSL notice cancelled: demand is at its lowest now, [\d,]+ MW\. MSL1 is 1,600 MW\.$/);
  // A tie due back at 11:30 raises no notice about 13:00.
  const c = createState(1, DESK_WEEKEND);
  c.tick = secOf(8, 30) * TPS;
  c.tie.tripped = true; c.tie.lockoutS = 3 * H;
  assert.deepEqual(mslRecs(step(c)), []);
  assert.equal(c.msl.level, 0);
  // The rise: 08:30 with the tie out past 13:00; the 13:00 minimum is under MSL1 + 300 MW.
  const b = createState(1, DESK_WEEKEND);
  b.tick = secOf(8, 30) * TPS;
  b.tie.tripped = true; b.tie.lockoutS = 5 * H;
  const evs = step(b), up = mslRecs(evs);
  assert.equal(up.length, 1);
  assert.deepEqual(Object.keys(up[0]), REC_KEYS);
  assert.deepEqual({...up[0], msg: ''}, {tick: secOf(8, 30) * TPS, kind: 'log', sev: 'info', code: 'MSL1', msg: '', level: 1,
    minMW: Math.round(b.msl.minMW), atS: secOf(13)});
  assert.match(up[0].msg, /^MSL1 notice: lowest forecast demand 1,8\d\d MW at 13:00\. MSL1 is 1,900 MW \(tie out\): two load trips above the security floor\.$/);
  assert.deepEqual(b.msl, {level: 1, minMW: Math.min(...FC(b).demandP50), atS: secOf(13), sinceS: secOf(8, 30)});
  assert.ok(up[0].atS - up[0].tick / TPS >= 2 * H, 'a notice with 4.5 h of lead');
  assert.equal(b.news.length, a.news.length, 'never a news item');
});

test('P-4: the check runs straight after the weather, before grid.unitsSecond counts the tie\'s lockout: the second the tie returns still tests with the tie out', () => {
  // A mild weekend at 13:00: demand NOW is between MSL1 (1,600) and MSL1 with the tie out (1,900).
  const s = createState(1, DESK_WEEKEND);
  s.tick = secOf(13) * TPS;
  s.tie.tripped = true; s.tie.lockoutS = 1; // back in service this very second (grid.unitsSecond, later in it)
  const evs = step(s);
  assert.ok(s.env.demandMW > V.MSL1_MW + V.MSL_CLEAR_MW && s.env.demandMW < V.MSL1_MW + V.MSL_TIE_OUT_MW, 'demand now ' + s.env.demandMW);
  assert.equal(s.tie.tripped, false, 'the tie came back in this second');
  const codes = evs.filter(r => r.kind === 'log').map(r => r.code);
  assert.ok(codes.includes('MSL1') && codes.includes('LINK_BACK'), codes.join(' '));
  assert.ok(codes.indexOf('MSL1') < codes.indexOf('LINK_BACK'), 'the notice comes before the tie is back: ' + codes.join(' '));
  assert.deepEqual([s.msl.level, s.msl.sinceS, s.msl.atS], [1, secOf(13), secOf(13)], 'tested with the tie still out: the present second is under 1,900 MW');
  // The next check sees the tie back: demand is clear of MSL1 (1,600) and of its hysteresis (1,700).
  s.tick = (secOf(13) + V.MSL_CHECK_S) * TPS;
  const next = mslRecs(step(s));
  assert.deepEqual(next.map(r => r.code), ['MSL_CLEAR']);
  assert.deepEqual([s.msl.level, s.msl.sinceS], [0, secOf(13) + V.MSL_CHECK_S]);
});

test('P-4: on a mild weekend a potline trip at noon brings MSL1 at the next check, as a log record; it is cancelled once the potline is back', () => {
  const s = createState(8, DESK_WEEKEND), out = []; // the potline trips at 12:23 for 45 min
  const trip = s.ext.events.find(e => e.type === 'smelterTrip').atS;
  for (let sec = 0; sec < secOf(15); sec++) {
    goTo(s, sec, out);
    if (sec % V.MSL_CHECK_S === 0) mslSecond(s, FC(s), out);
  }
  const recs = out.filter(r => typeof r.code === 'string' && r.code.startsWith('MSL'));
  assert.deepEqual(recs.map(r => r.code), ['MSL1', 'MSL_CLEAR']);
  const [up, clear] = recs;
  assert.ok(up.tick / TPS >= trip && up.tick / TPS < trip + V.MSL_CHECK_S, 'within one check of the trip');
  assert.ok(up.minMW <= V.MSL1_MW && up.minMW > V.MSL2_MW && up.level === 1 && up.kind === 'log');
  assert.ok(up.atS >= up.tick / TPS && up.atS <= up.tick / TPS + V.FC_HORIZON_S);
  assert.ok(clear.tick / TPS > trip + 45 * 60 && clear.minMW > V.MSL1_MW + V.MSL_CLEAR_MW);
  // The trip is the news: the minimum is the present second, and the message says so (not "forecast").
  assert.equal(up.atS, up.tick / TPS);
  assert.match(up.msg, /^MSL1 notice: demand is at its lowest now, 1,4\d\d MW\. MSL1 is 1,600 MW: two load trips above the security floor\.$/);
  assert.doesNotMatch(up.msg, /forecast/);
  assert.notEqual(clear.tick, up.tick);
  assert.equal(s.msl.sinceS, clear.tick / TPS, 'sinceS is the clear\'s second, not the rise\'s');
  assert.ok(!out.some(r => r.kind === 'announce' && /MSL/.test(r.news.text)));
});

test('the DUCK notice names the rooftops on a day with rooftop PV; the classic day keeps its wording', () => {
  const duck = scn => goTo(createState(3, scn), secOf(17, 15)).find(r => r.code === 'DUCK');
  const desk = duck(DESK), classic = duck(CLASSIC);
  assert.equal(desk.sev, 'warn');
  assert.match(desk.msg, /^DUCK CURVE: the sun is leaving the rooftops and the solar farm/);
  assert.match(desk.msg, /demand on the grid is climbing fast\. Commit plant now if the plan is short\.$/);
  assert.match(classic.msg, /^DUCK CURVE: utility solar is fading into the evening peak and net demand is climbing fast\./);
  assert.doesNotMatch(classic.msg, /rooftop/);
});

// Phase 2a owner "world" (desk/README.md §21.1): rooftop PV behind the meter and the day types.
// P-1 (operational = underlying - rooftop, every grid second), P-2 (the rooftop model: curve,
// shares, cloud bite, heat derate), P-3 (MILD days, weekends, the minima by day type), C-1 (the
// classic day has none of it), C-2 (the public state.day). The forecast's and MSL's cases are in
// tests/events.test.js; the pre-roll's shape, the state size and the S-4 barrier in tests/state.test.js.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDue, mslSecond} from '../sim/events.js';
import {sampleSecond, forecast, demandBaseMW, underlyingBaseMW, rooftopClearSkyMW, heatRampAt, heatMultAt,
  tableLinear, fineNoiseMW} from '../sim/weather.js';
import {createState, step, observe, hashState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {TPS, clone, slowOnly, withoutContingencies} from './lib/sim-helpers.js';

const H = 3600, secOf = (h, m = 0) => (h - V.DAY_START_H) * H + m * 60;
const NOON_S = secOf(13); // solar noon: the shape table's 1000 per-mille point (C-4)

/** Advance to grid second s applying due events (no physics or grid logic). */
function goTo(state, s, out = []) {
  state.tick = s * TPS;
  applyDue(state, out);
  sampleSecond(state);
  return out;
}

/** Every suburb's sky set to one clearness for the whole day (a test poke of ext). */
function skies(state, k) {
  for (const row of state.ext.rooftop.clearPm) row.fill(Math.round(k * 1000));
  return state;
}

const sum = a => a.reduce((x, y) => x + y, 0);

// The seeds these tests lean on, by day type (desk/README.md C-2). A change of the regime draw
// would fail here first, by name.
test('C-2: the pinned seeds keep their day types: 1 and 8 MILD, 2 and 7 HOT, 4 a heatwave', () => {
  const temp = seed => createState(seed, DESK).ext.regime.temp;
  assert.deepEqual([1, 8, 2, 7, 4].map(temp), ['MILD', 'MILD', 'HOT', 'HOT', 'HEATWAVE']);
});

test('P-2: clear-sky rooftop is 3,500 +- 50 MW at 13:00 with k = 1, <= 500 MW at 18:48, and 0 before sunrise and after sunset', () => {
  const s = skies(createState(2, DESK), 1); // a HOT day: no heat derate
  goTo(s, NOON_S);
  assert.ok(Math.abs(s.env.rooftopMW - 3500) <= 50, '13:00: ' + s.env.rooftopMW);
  assert.ok(Math.abs(s.env.rooftopMW - rooftopClearSkyMW(s.scn, 13)) < 1e-9, 'the shares add to the whole');
  goTo(s, secOf(12));
  assert.ok(Math.abs(s.env.rooftopMW - 3360) <= 5, '12:00: ' + s.env.rooftopMW + ' (the curve gives about 3,361)');
  goTo(s, secOf(18, 48));
  assert.ok(s.env.rooftopMW > 300 && s.env.rooftopMW <= 500, '18:48: ' + s.env.rooftopMW);
  for (const [h, m] of [[4, 0], [6, 10], [19, 50], [23, 0], [27, 59]]) { // the sun is up 06:12-19:48
    goTo(s, secOf(h, m));
    assert.equal(s.env.rooftopMW, 0, h + ':' + m);
    assert.ok(s.env.roofSubMW.every(x => Object.is(x, 0)), 'no -0 in state at ' + h + ':' + m);
  }
});

test('P-2: a front with k = 0.32 over every suburb leaves 52% of clear-sky rooftop output', () => {
  const clear = skies(createState(2, DESK), 1), dull = skies(createState(2, DESK), 0.32);
  for (const sec of [secOf(9), secOf(11, 30), NOON_S, secOf(16, 45)]) {
    goTo(clear, sec); goTo(dull, sec);
    assert.ok(Math.abs(dull.env.rooftopMW / clear.env.rooftopMW - 0.524) < 1e-9, 'second ' + sec);
    assert.ok(dull.env.roofClearFrac.every(k => k === 0.32));
  }
});

test('P-2: each suburb makes its share at its own clearness; rooftopMW is the sum; a district carries 1 / n of its suburb', () => {
  const s = createState(2, DESK), roof = s.scn.rooftop;
  const ks = [1, 0.9, 0.8, 0.7, 0.5, 0.15];
  s.ext.rooftop.clearPm.forEach((row, j) => row.fill(ks[j] * 1000));
  goTo(s, NOON_S);
  assert.deepEqual(s.env.roofClearFrac, ks);
  s.env.roofSubMW.forEach((mw, j) => {
    const want = 5000 * roof.share[j] * 0.70 * (1 - 0.7 * (1 - ks[j]));
    assert.ok(Math.abs(mw - want) < 1e-9, s.scn.city.suburbs[j].id + ': ' + mw + ' vs ' + want);
  });
  assert.ok(Math.abs(sum(s.env.roofSubMW) - s.env.rooftopMW) < 1e-9);
  // U-1: 1,250 / 450 / 1,000 / 250 / 1,150 / 900 MW of 5,000, SOL HAZ RED HAR TAL SAL.
  assert.deepEqual(roof.share.map(x => Math.round(x * roof.capacityMW)), [1250, 450, 1000, 250, 1150, 900]);
  assert.ok(Math.abs(sum(roof.share) - 1) < 1e-12);
  for (const sub of s.scn.city.suburbs.keys()) {
    const ds = s.city.districts.filter(d => d.sub === sub);
    assert.ok(Math.abs(sum(ds.map(d => d.roofFrac)) - 1) < 1e-12, 'suburb ' + sub);
  }
});

test('P-2 / C-3: the x 0.92 heat derate follows the heat window\'s ramp (truth from ext.heat), not the day', () => {
  const s = skies(createState(4, DESK), 1); // a heatwave: announced 10:30, 13:30-20:00
  assert.deepEqual([s.ext.heat.onsetS, s.ext.heat.endS], [secOf(13, 30), secOf(20)]);
  const at = sec => { goTo(s, sec); return s.env.rooftopMW / rooftopClearSkyMW(s.scn, s.env.h); };
  assert.ok(Math.abs(at(secOf(9)) - 1) < 1e-12, 'no derate in the morning: nothing to leak before the 10:30 warning');
  assert.ok(Math.abs(at(secOf(12, 30)) - 1) < 1e-12, 'none until the ramp starts');
  assert.ok(Math.abs(at(secOf(13)) - 0.96) < 1e-12, 'half the ramp, half the derate');
  assert.ok(Math.abs(at(secOf(13, 30)) - 0.92) < 1e-12);
  assert.ok(Math.abs(at(secOf(17)) - 0.92) < 1e-12);
  assert.equal(heatRampAt(null, 100), 0);
  for (const sec of [0, secOf(12, 45), secOf(15), secOf(20, 30), secOf(22)]) {
    assert.equal(heatMultAt(s.ext.heat, sec), 1 + V.HEAT_DEMAND_UPLIFT * heatRampAt(s.ext.heat, sec), 'one ramp for demand and roofs');
  }
});

test('P-1: demandMW = underlyingMW - rooftopMW - (SMELTER_MW - smelter.loadMW) on every second of a DESK day, through a smelter trip and its return', () => {
  const s = createState(8, DESK); // MILD; the potline trips at 12:23 and is back by 13:19
  assert.ok(s.ext.events.some(e => e.type === 'smelterTrip'));
  let bad = 0, worst = 0, off = 0, part = 0, peak = 0, minMW = Infinity;
  for (let sec = 0; sec < V.DAY_S; sec++) {
    goTo(s, sec);
    const e = s.env, gap = V.SMELTER_MW - s.smelter.loadMW;
    const err = Math.abs(e.demandMW - (e.underlyingMW - e.rooftopMW - gap));
    if (err > worst) worst = err;
    if (!(err < 1e-9) || !(Math.abs(sum(e.roofSubMW) - e.rooftopMW) < 1e-9) || !(e.rooftopMW >= 0) || !Number.isFinite(e.demandMW)) bad++;
    if (s.smelter.loadMW === 0) off++; else if (gap > 0) part++;
    peak = Math.max(peak, e.rooftopMW);
    minMW = Math.min(minMW, e.demandMW);
  }
  assert.equal(bad, 0, bad + ' seconds break the identity (worst ' + worst + ' MW)');
  assert.equal(off, 45 * 60, 'the potline was out for 45 min');
  assert.ok(part > 500, 'and came back on its ramp (' + part + ' s)');
  assert.ok(peak > 2500 && peak < 3500, 'rooftop peak ' + peak);
  assert.ok(minMW < 2585, 'a mild belly: ' + minMW + ' MW');
});

test('P-1: the identity holds each grid second through step() (04:00 to 06:45, past sunrise), and observe() exposes U, R and op', () => {
  const s = createState(1, DESK);
  let seconds = 0, bad = 0;
  while (!s.over && s.tick < secOf(6, 45) * TPS) {
    step(s);
    if ((s.tick - 1) % TPS !== 0) continue;
    seconds++;
    const e = s.env;
    if (!(Math.abs(e.demandMW - (e.underlyingMW - e.rooftopMW - (V.SMELTER_MW - s.smelter.loadMW))) < 1e-9)) bad++;
  }
  assert.equal(seconds, secOf(6, 45), 'the day ran to 06:45');
  assert.equal(bad, 0);
  const o = observe(s);
  assert.ok(o.demand.rooftopMW > 50, 'rooftop at 06:45: ' + o.demand.rooftopMW);
  assert.equal(o.demand.rooftopMW, s.env.rooftopMW);
  assert.equal(o.demand.underlyingMW, s.env.underlyingMW);
  assert.equal(o.demand.nowMW, o.demand.underlyingMW - o.demand.rooftopMW - (V.SMELTER_MW - o.smelter.loadMW));
});

test('P-3: a MILD day is the hot day less its cooling load; a weekend is x 0.92; a HOT weekday is the DEM curve itself', () => {
  const scn = createState(1, DESK).scn;
  const hot = {temp: 'HOT', weekend: false}, mild = {temp: 'MILD', weekend: false};
  for (let h = 0; h < 24; h += 0.25) {
    const T = tableLinear(scn.temperatureC.table, h);
    const cooling = 1400 * Math.min(1, Math.max(0, (T - 22) / 14));
    assert.equal(underlyingBaseMW(scn, hot, h), demandBaseMW(scn, h), 'HOT weekday at ' + h);
    assert.ok(Math.abs(underlyingBaseMW(scn, mild, h) - (demandBaseMW(scn, h) - cooling)) < 1e-9, 'MILD at ' + h);
    assert.ok(Math.abs(underlyingBaseMW(scn, {temp: 'HOT', weekend: true}, h) - 0.92 * demandBaseMW(scn, h)) < 1e-9);
    assert.ok(Math.abs(underlyingBaseMW(scn, {temp: 'MILD', weekend: true}, h) - 0.92 * (demandBaseMW(scn, h) - cooling)) < 1e-9);
  }
  // About 100 MW per degC above 22: none at 06:00 (22 degC), 1,000 MW at 12:00 (32 degC), all 1,400 at 17:00 (36 degC).
  const cool = h => demandBaseMW(scn, h) - underlyingBaseMW(scn, mild, h);
  assert.deepEqual([6, 12, 17].map(cool).map(Math.round), [0, 1000, 1400]);
});

test('P-3: env.underlyingMW is that shape x the heat uplift + the noise, from the public state.day (not from ext.regime)', () => {
  for (const [seed, scn] of [[1, DESK], [1, DESK_WEEKEND], [2, DESK], [2, DESK_WEEKEND], [4, DESK], [4, DESK_WEEKEND]]) {
    const s = createState(seed, scn);
    for (const sec of [secOf(5), secOf(9), NOON_S, secOf(14), secOf(18, 48), secOf(23)]) {
      goTo(s, sec);
      const k = sec / 60, noise = s.ext.series.demandNoiseMW[k] + fineNoiseMW(s.seed, sec); // whole minutes: no interpolation
      const want = underlyingBaseMW(s.scn, s.day, s.env.h) * heatMultAt(s.ext.heat, sec) + noise;
      assert.ok(Math.abs(s.env.underlyingMW - want) < 1e-9, scn.id + ' seed ' + seed + ' second ' + sec);
    }
    // The hidden regime is read once, by createState: changing it afterwards moves nothing.
    const a = JSON.stringify(s.env);
    for (const temp of ['MILD', 'HOT', 'HEATWAVE']) {
      s.ext.regime = {cls: 'calm', temp};
      sampleSecond(s);
      assert.equal(JSON.stringify(s.env), a);
    }
    delete s.ext.regime.temp; // and code tolerates it missing
    sampleSecond(s);
    assert.equal(JSON.stringify(s.env), a);
  }
});

test('C-2: state.day is public and set once: MILD or HOT (a heatwave reads HOT), weekend from the scenario', () => {
  assert.deepEqual(createState(1, DESK).day, {temp: 'MILD', weekend: false});
  assert.deepEqual(createState(2, DESK).day, {temp: 'HOT', weekend: false});
  assert.deepEqual(createState(4, DESK).day, {temp: 'HOT', weekend: false}, 'the heatwave is announced at 10:30, not at 04:00');
  assert.deepEqual(createState(1, DESK_WEEKEND).day, {temp: 'MILD', weekend: true});
  assert.deepEqual(observe(createState(1, DESK_WEEKEND)).day, {temp: 'MILD', weekend: true});
  // The weekend is the weekday's weather: same regime, events and skies; only the demand differs.
  const wd = createState(8, DESK), we = createState(8, DESK_WEEKEND);
  assert.deepEqual(we.ext, wd.ext);
  goTo(wd, NOON_S); goTo(we, NOON_S);
  assert.equal(we.env.rooftopMW, wd.env.rooftopMW);
  assert.ok(we.env.underlyingMW < 0.93 * wd.env.underlyingMW);
});

test('P-3: a MILD day shows its own temperatures (display only); a HOT day and a heatwave the hot table (+7 degC in the window)', () => {
  const mild = createState(1, DESK), hot = createState(2, DESK), heat = createState(4, DESK);
  for (const s of [mild, hot, heat]) goTo(s, secOf(15));
  assert.equal(mild.env.tempC, 25);
  assert.equal(hot.env.tempC, 35);
  assert.equal(heat.env.tempC, 35 + V.HEAT_TEMP_UPLIFT_C);
  goTo(heat, secOf(9));
  assert.equal(heat.env.tempC, 27, 'no heat before its window');
});

// C-3's noise-free minima (clearness 0.92 over every suburb, no demand noise, no trips; the
// per-second wobble of +-6 MW stays): HOT 3,442, HEATWAVE 3,442, MILD weekday 2,394, MILD weekend
// 1,938 MW, each inside P-3's band. The medians over real seeds are measured in the slow test below.
function belly(seed, scn, prep) {
  const s = withoutContingencies(createState(seed, scn));
  if (prep) prep(s);
  let minMW = Infinity, atS = -1;
  for (let sec = 0; sec < V.DAY_S; sec += 60) {
    goTo(s, sec);
    if (s.env.demandMW < minMW) { minMW = s.env.demandMW; atS = sec; }
  }
  return {minMW, atS, temp: s.ext.regime.temp};
}
const P3 = {HOT: 3400, HEATWAVE: 3450, MILD: 2350, MILD_WEEKEND: 1800};
const inBand = (mw, target) => Math.abs(mw - target) <= 0.1 * target;

test('P-3: the noise-free minimum operational demand is inside the band of every day type (C-3: 3,442 / 3,442 / 2,394 / 1,938 MW)', () => {
  const flat = s => { s.ext.series.demandNoiseMW.fill(0); skies(s, 0.92); };
  const cases = [[2, DESK, P3.HOT, 3442], [4, DESK, P3.HEATWAVE, 3442], [1, DESK, P3.MILD, 2394], [1, DESK_WEEKEND, P3.MILD_WEEKEND, 1938]];
  for (const [seed, scn, target, c3] of cases) {
    const b = belly(seed, scn, flat);
    assert.ok(inBand(b.minMW, target), scn.id + ' ' + b.temp + ': ' + b.minMW + ' MW against ' + target + ' +- 10%');
    assert.ok(Math.abs(b.minMW - c3) < 30, scn.id + ' ' + b.temp + ': ' + b.minMW + ' MW, C-3 says ' + c3);
    assert.ok(b.atS > secOf(11, 30) && b.atS < secOf(13, 45), 'the belly is at midday: second ' + b.atS);
  }
});

test('C-1: the classic day has no rooftop and no MILD days: env carries 0, zeros and ones, and equals the pre-2a formula bit for bit', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = createState(seed, CLASSIC);
    assert.equal(s.ext.rooftop, null);
    assert.deepEqual(s.day, {temp: 'HOT', weekend: false});
    assert.notEqual(s.ext.regime.temp, 'MILD');
    for (const sec of [0, secOf(9, 7), NOON_S + 30, secOf(18, 48), secOf(26)]) {
      goTo(s, sec);
      const e = s.env, k = Math.floor(sec / 60), fr = (sec - k * 60) / 60, a = s.ext.series.demandNoiseMW;
      assert.equal(e.rooftopMW, 0);
      assert.deepEqual(e.roofSubMW, [0, 0, 0, 0, 0, 0]);
      assert.deepEqual(e.roofClearFrac, [1, 1, 1, 1, 1, 1]);
      // The stage A expression, association order included.
      assert.equal(e.underlyingMW, demandBaseMW(s.scn, e.h) * heatMultAt(s.ext.heat, sec) + (a[k] + (a[k + 1] - a[k]) * fr) + fineNoiseMW(s.seed, sec));
      assert.equal(e.demandMW, e.underlyingMW - (V.SMELTER_MW - s.smelter.loadMW));
      assert.equal(e.tempC, tableLinear(s.scn.temperatureC.table, e.h) + (e.heatActive ? V.HEAT_TEMP_UPLIFT_C : 0));
    }
    const fc = forecast(s, V.FC_HORIZON_S, V.FC_STEP_S);
    assert.ok(fc.rooftopMW.every(x => x === 0));
    fc.underlyingP50.forEach((u, k) => assert.equal(fc.demandP50[k], u - 0 - (V.SMELTER_MW - s.smelter.loadMW)));
  }
});

test('C-1 / C-9: on the classic day state.msl never moves: through step() and when mslSecond is handed a forecast below MSL3', () => {
  const s = createState(3, CLASSIC), h0 = JSON.stringify(s.msl);
  for (let k = 0; k < (V.MSL_CHECK_S + 2) * TPS; k++) step(s);
  assert.equal(JSON.stringify(s.msl), h0);
  const out = [], before = hashState(s);
  mslSecond(s, {fromS: s.env.s, stepS: 300, n: 2, demandP50: [900, 800]}, out);
  assert.deepEqual(s.msl, {level: 0, minMW: 0, atS: -1, sinceS: -1});
  assert.equal(out.length, 0);
  assert.equal(hashState(s), before);
});

// ------------------------------------------------------------------ slow: the measured accepts

/** One day of weather and events only, with the MSL check on its cadence and the tie's lockout counted as grid.unitsSecond does. */
function bellyDay(seed, scn) {
  const s = createState(seed, scn), out = [];
  let minMW = Infinity, maxLevel = 0, floorAlone = false; // floorAlone: MSL3 reached with the tie in and the potline on
  for (let sec = 0; sec < V.DAY_S; sec++) {
    goTo(s, sec, out);
    if (sec % V.MSL_CHECK_S === 0) {
      const was = s.msl.level;
      mslSecond(s, forecast(s, V.FC_HORIZON_S, V.FC_STEP_S), out);
      if (s.msl.level === 3 && was < 3 && !s.tie.tripped && s.smelter.loadMW === V.SMELTER_MW) floorAlone = true;
    }
    maxLevel = Math.max(maxLevel, s.msl.level);
    const t = s.tie;
    if (t.tripped) { t.lockoutS = Math.max(0, t.lockoutS - 1); if (t.lockoutS <= 0) t.tripped = false; }
    minMW = Math.min(minMW, s.env.demandMW);
  }
  return {temp: s.ext.regime.temp, minMW, maxLevel, floorAlone};
}
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('P-3: median minimum operational demand over seeds 1-100 is within +-10% of 3,400 (HOT), 3,450 (HEATWAVE), 2,350 (MILD weekday), 1,800 (MILD weekend) MW', slowOnly(), () => {
  const mins = {HOT: [], HEATWAVE: [], MILD: [], MILD_WEEKEND: []};
  for (let seed = 1; seed <= 100; seed++) {
    const wd = bellyDay(seed, DESK);
    mins[wd.temp].push(wd.minMW);
    if (wd.temp === 'MILD') mins.MILD_WEEKEND.push(bellyDay(seed, DESK_WEEKEND).minMW);
  }
  for (const [k, target] of Object.entries(P3)) {
    assert.ok(mins[k].length >= 10, k + ': ' + mins[k].length + ' days');
    assert.ok(inBand(median(mins[k]), target), k + ': median ' + median(mins[k]) + ' MW of ' + mins[k].length + ' days against ' + target);
  }
});

test('P-4: on mild weekends MSL1 is reached on 10-30% of days and MSL2 on <= 10%; MSL3 only with the tie out or the potline off (seeds 1-200); no notice on a HOT weekday', slowOnly(), () => {
  let days = 0, l1 = 0, l2 = 0;
  for (let seed = 1; seed <= 200; seed++) {
    if (createState(seed, DESK_WEEKEND).ext.regime.temp !== 'MILD') {
      if (seed <= 40 && createState(seed, DESK).ext.regime.temp === 'HOT') assert.equal(bellyDay(seed, DESK).maxLevel, 0, 'HOT weekday, seed ' + seed);
      continue;
    }
    const d = bellyDay(seed, DESK_WEEKEND);
    days++;
    if (d.maxLevel >= 1) l1++;
    if (d.maxLevel >= 2) l2++;
    assert.equal(d.floorAlone, false, 'seed ' + seed + ': MSL3 without a contingency');
  }
  assert.ok(days >= 80, days + ' mild weekends');
  assert.ok(l1 / days >= 0.10 && l1 / days <= 0.30, 'MSL1 on ' + l1 + ' of ' + days);
  assert.ok(l2 / days <= 0.10, 'MSL2 on ' + l2 + ' of ' + days);
});

// Wave 1 "sky" (desk/README.md §32.6.3, Q-65, Q-79): the one climatology (weather.climate), fronts over
// the suburbs in the pre-roll, and the forecast that knows a warned front from its warning. Fronts are
// put on a desk seed with no weather records of its own (tests/lib/inject.js stateWith), so the test
// holds while the dayplan is neutral and after it is real.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDue} from '../sim/events.js';
import {forecast, sampleSecond, climate, rooftopClearSkyMW} from '../sim/weather.js';
import {createState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK} from '../content/scenarios.js';
import {stateWith} from './lib/inject.js';
import {TPS, clone} from './lib/sim-helpers.js';

const MIN = V.S_PER_MIN, PM = V.PER_MILLE, at = (h, m = 0) => (h - V.DAY_START_H) * V.S_PER_H + m * MIN;
const goTo = (s, t) => { s.tick = t * TPS; applyDue(s, []); sampleSecond(s); return s; };

/** The first seed whose day has no weather records of its own (no heat, storm or cloud). */
function quietSeed(scn) {
  for (let seed = 1; seed < 200; seed++) {
    if (!createState(seed, scn).ext.events.some(e => /^(heat|storm|cloud)/.test(e.type))) return seed;
  }
  throw new Error('no quiet seed');
}

/** A warned front over the suburbs from onS, clearing at clearS, as the plan rolls it (§32.4.6). */
function front(scn, onS, clearS, warnS = onS - 150 * MIN) {
  const x = climate(scn).cloud;
  return [{atS: warnS, type: 'cloudWarn', args: {onsetS: onS, frontPm: Math.round(x.frontMu * PM)}, warned: true},
    {atS: onS, type: 'cloudOnset', args: {clearMu: x.frontMu, suburbs: true, clearS}, warned: true},
    {atS: clearS, type: 'cloudClear', args: {clearMu: x.clearMu}, warned: true}];
}

const variant = (id, local, act2, act3) => ({...DESK, id, rooftop: {...DESK.rooftop, cloud: {...DESK.rooftop.cloud, local}},
  dayplan: {...DESK.dayplan, act2: {...DESK.dayplan.act2, front: {...DESK.dayplan.act2.front, ...act2}},
    act3: {...DESK.dayplan.act3, storm: {...DESK.dayplan.act3.storm, ...act3}}}});

test('climate: the dayplan block on a dayplan day; on classic derived from the legacy menu (minutes after the arrival or onset)', () => {
  const pick = (o, ks) => Object.fromEntries(ks.split(' ').map(k => [k, o[k]])), d = DESK.dayplan, e = CLASSIC.events;
  assert.deepEqual(climate(DESK), {storm: pick(d.act3.storm, 'arriveMu cutoutAfterMin cutoutMu passAfterMin passMu'),
    cloud: pick(d.act2.front, 'frontMu clearAfterMin clearMu frontRampMin clearRampMin'), drought: {mu: d.act3.drought.mu},
    heat: {clearMu: e.heat.clearMu}}); // the heat's clear sky stays in events.heat (§32.4.3)
  const c = climate(CLASSIC);
  assert.deepEqual([...c.storm.cutoutAfterMin, c.storm.passAfterMin].map(Math.round), [30, 90, 140]);
  assert.deepEqual({...c, storm: {...c.storm, cutoutAfterMin: 0, passAfterMin: 0}}, {
    storm: {arriveMu: e.storm.arriveMu, cutoutAfterMin: 0, cutoutMu: e.storm.cutoutMu, passAfterMin: 0, passMu: e.storm.passMu},
    cloud: {...pick(e.cloud, 'frontMu clearAfterMin clearMu'), frontRampMin: 0, clearRampMin: 0}, drought: {mu: e.drought.mu},
    heat: {clearMu: e.heat.clearMu}});
});

test('Q-79 pre-roll: each suburb reaches frontMu in city order within one sky step of its lag + ramp, holds it, then clears; the precinct 50 min behind', () => {
  const scn = variant('desk-front-still', {...DESK.rooftop.cloud.local, sigmaPerStep: 0}); // no local term: the shape itself
  const seed = quietSeed(scn), onS = at(11, 32), clearS = at(13, 12), x = climate(scn).cloud;
  const s = stateWith(seed, scn, front(scn, onS, clearS)), plain = createState(seed, scn);
  assert.notDeepEqual(s.ext.rooftop, plain.ext.rooftop, 'the front is in ext.rooftop');
  const step = s.ext.rooftop.stepS, fPm = Math.round(x.frontMu * PM), cPm = Math.round(x.clearMu * PM);
  let last = -1;
  scn.city.suburbs.forEach((sub, j) => {
    const row = s.ext.rooftop.clearPm[j], lag = sub.frontLagMin * MIN, held = onS + lag + x.frontRampMin * MIN;
    const k = row.indexOf(fPm), kc = row.indexOf(cPm, k);
    assert.ok(k * step >= held && k * step - held < step, sub.id + ' at frontMu from ' + k * step + ', due ' + held);
    assert.ok(k > last, sub.id + ' after the suburb west of it');
    last = k;
    for (let i = k; i * step < clearS + lag; i++) assert.equal(row[i], fPm, sub.id + ' held at step ' + i);
    const clear = clearS + lag + x.clearRampMin * MIN;
    assert.ok(kc * step >= clear && kc * step - clear < step, sub.id + ' clear at ' + kc * step + ', due ' + clear);
    for (let i = 0; i * step < onS + lag; i++) assert.equal(row[i], plain.ext.rooftop.clearPm[j][i], sub.id + ' untouched before');
  });
  const lagP = scn.rooftop.precinctLagMin * MIN, p = s.ext.series, k0 = (onS + lagP) / p.stepS;
  assert.deepEqual(p.clearPm.slice(0, k0), plain.ext.series.clearPm.slice(0, k0), 'the precinct: nothing before its lag');
  assert.equal(p.clearPm.indexOf(fPm), (onS + lagP + x.frontRampMin * MIN) / p.stepS, 'the precinct at frontMu after its ramp');
});

test('Q-79: rooftop MW at 13:00, after the last ramp, falls by capacity x share x clearFactor x shape x cloudBite x (sky before - frontMu), within 10%', () => {
  const seed = quietSeed(DESK), onS = at(11, 32), clearS = at(13, 12), t = at(13), x = climate(DESK).cloud;
  const s = goTo(stateWith(seed, DESK, front(DESK, onS, clearS)), t), plain = goTo(createState(seed, DESK), t);
  const roof = DESK.rooftop, before = plain.env.roofClearFrac;
  const want = rooftopClearSkyMW(DESK, 13) * roof.cloudBite * roof.share.reduce((a, w, j) => a + w * (before[j] - x.frontMu), 0);
  const drop = plain.env.rooftopMW - s.env.rooftopMW;
  assert.ok(want > 1000 && Math.abs(drop - want) <= 0.1 * want, 'drop ' + drop.toFixed(0) + ' MW, formula ' + want.toFixed(0));
});

test('Q-79 forecast: unwarned it is the plain day\'s (S-4); from the warning it carries the front; the band widens only over the clearing', () => {
  const seed = quietSeed(DESK), onS = at(11, 32), clearS = at(13, 12), warnS = onS - 150 * MIN, x = climate(DESK).cloud;
  const s = stateWith(seed, DESK, front(DESK, onS, clearS)), plain = createState(seed, DESK);
  goTo(s, warnS - MIN); goTo(plain, warnS - MIN);
  assert.deepEqual(forecast(s, V.DAY_S - s.env.s, V.FC_STEP_S), forecast(plain, V.DAY_S - s.env.s, V.FC_STEP_S), 'a hidden front leaks nothing');
  goTo(s, warnS + MIN);
  const quiet = clone(s);
  quiet.news = quiet.news.filter(n => n.kind !== 'cloud');
  const n = V.DAY_S - s.env.s, a = forecast(s, n, V.FC_STEP_S), b = forecast(quiet, n, V.FC_STEP_S);
  const col = t => Math.round((t - a.fromS) / a.stepS) - 1, held = onS + 55 * MIN; // every suburb under it, little clearing yet
  const truth = goTo(clone(s), a.fromS + (col(held) + 1) * a.stepS).env.rooftopMW;
  assert.ok(Math.abs(a.rooftopMW[col(held)] - truth) < 0.1 * truth, 'forecast ' + a.rooftopMW[col(held)] + ', realised ' + truth);
  assert.ok(b.rooftopMW[col(held)] - truth > 0.5 * truth, 'without the news it would not know');
  const band = f => f.demandP90.map((p, k) => p - f.demandP10[k]);
  const wa = band(a), wb = band(b), from = onS + x.clearAfterMin[0] * MIN;
  const to = onS + (DESK.city.suburbs.at(-1).frontLagMin + x.clearAfterMin[1] + x.clearRampMin) * MIN;
  let wider = 0;
  wa.forEach((w, k) => {
    const t = a.fromS + (k + 1) * a.stepS;
    if (t <= from || t >= to) assert.ok(Math.abs(w - wb[k]) < 1e-6, 'band unchanged at ' + t);
    else { assert.ok(w >= wb[k] - 1e-6, 'never narrower at ' + t); if (w > wb[k] + 100) wider++; }
  });
  assert.ok(wider >= 6, 'wider by > 100 MW over the clearing in ' + wider + ' columns');
});

test('one climatology: the forecast\'s mean under the front is the cloudOnset\'s frontMu and its storm windows are stormWarn\'s args, not scn.events', () => {
  // A variant whose dayplan disagrees with the legacy menu (frontMu 0.32, cut-out 30-90 min, pass 140): a
  // forecast that read the second copy fails here.
  const scn = variant('desk-front-alt', DESK.rooftop.cloud.local, {frontMu: 0.4, clearAfterMin: [100, 110]},
    {cutoutAfterMin: [35, 80], passAfterMin: 120});
  const seed = quietSeed(scn), onS = at(11), arr = at(16, 30), x = climate(scn), m = x.storm.cutoutAfterMin;
  const warn = {atS: at(15), type: 'stormWarn', warned: true,
    args: {arriveS: arr, cutoutFromS: arr + m[0] * MIN, cutoutToS: arr + m[1] * MIN, passS: arr + 100 * MIN}}; // a clipped pass
  const s = goTo(stateWith(seed, scn, [...front(scn, onS, onS + 105 * MIN), warn]), at(10));
  const roof = scn.rooftop, f = forecast(s, V.FC_HORIZON_S, V.FC_STEP_S);
  let n = 0;
  f.rooftopMW.forEach((mw, k) => {
    const t = f.fromS + (k + 1) * f.stepS;
    if (t < onS + 55 * MIN || t > onS + 100 * MIN) return; // every suburb held, none clearing
    const clearSky = rooftopClearSkyMW(scn, V.DAY_START_H + t / V.S_PER_H), kk = 1 - (1 - mw / clearSky) / roof.cloudBite;
    assert.ok(Math.abs(kk - 0.4) < 1e-9, 'mean ' + kk + ' at ' + t);
    n++;
  });
  assert.ok(n >= 8, n + ' held columns');
  goTo(s, at(15, 1));
  const w = forecast(s, V.FC_HORIZON_S, MIN), g = MIN / V.FC_DRIFT_TAU_S;
  const mu = t => { // the wind mean the forecast steered toward at column t (it moves wind by g of the gap a minute)
    const k = (t - w.fromS) / MIN - 1, prev = k ? w.windMW[k - 1] : s.env.windFrac * V.WIND_MW;
    return (prev + (w.windMW[k] - prev) / g) / V.WIND_MW;
  };
  const {cutoutFromS, cutoutToS, passS} = warn.args, near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, why + ': ' + a);
  near(mu(cutoutFromS), x.storm.arriveMu, 'the surge up to the cut-out window');
  assert.ok(mu(cutoutFromS + MIN) < x.storm.arriveMu - 0.01, 'the cut-out risk from cutoutFromS');
  assert.ok(mu(cutoutToS - MIN) > x.storm.cutoutMu + 0.01, 'still blending before cutoutToS');
  near(mu(cutoutToS), x.storm.cutoutMu, 'cut out by cutoutToS');
  near(mu(passS - MIN), x.storm.cutoutMu, 'until the pass');
  near(mu(passS), x.storm.passMu, 'the pass at the news\'s toS');
});

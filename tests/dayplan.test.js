// sim/dayplan.js, the event director (desk/README.md §32.6.1; Q-65-Q-68, Q-71, Q-72): pre-roll only,
// no state is stepped. 2,000 consecutive dates from 2026-01-01 (each with its date's scenario) and seeds
// 1-2,000 on desk, on scenario copies with the restore task live (p 0.85; desk ships it at 0 until
// the wave-1 merge). The measured shares and distributions are printed as test diagnostics.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preroll, prerollRegime} from '../sim/dayplan.js';
import {prerollRegime as weatherRegime} from '../sim/weather.js';
import {prerollEvents, applyDue} from '../sim/events.js';
import {stepReal, NIGHT_S} from '../sim/clock.js';
import {canonicalHash} from '../sim/step.js';
import {STREAM, uniform, pickWith} from '../sim/rng.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {scenarioIdOf} from '../content/dailies.js';

const H = h => Math.round((h - V.DAY_START_H) * 3600), MIN = 60, TPS = V.TICKS_PER_S;
const live = s => ({...s, dayplan: {...s.dayplan, act1: {...s.dayplan.act1, task: {...s.dayplan.act1.task, p: 0.85}}}});
const SCN = {desk: live(DESK), 'desk-weekend': live(DESK_WEEKEND)};
const day = (seed, scn) => { const regime = prerollRegime(seed, scn); return {seed, scn, regime, evs: preroll(seed, scn, regime)}; };

const DATES = [], SEEDS = [];
for (let k = 0, t = Date.UTC(2026, 0, 1); k < 2000; k++, t += 864e5) {
  const d = new Date(t), ymd = d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  DATES.push(day(ymd, SCN[scenarioIdOf(ymd)]));
}
for (let seed = 1; seed <= 2000; seed++) SEEDS.push(day(seed, SCN.desk));
const ALL = DATES.concat(SEEDS);
const share = (days, f) => days.filter(f).length / days.length;
const pct = x => (x * 100).toFixed(1) + '%';
const of = (d, type) => d.evs.filter(e => e.type === type);
const one = (d, type) => of(d, type)[0];

// A GT answers a warning: its start to MIN in AGC (Q-71: "the answering start + 2 grid-min")
const GT = V.MACHINES.find(m => m.station === 'gta'), ANSWER_S = GT.t1S + V.AUTO_SYNC_S + GT.t2S + 2 * MIN;
const WARNS = {stormWarn: ['arriveS', 'stormArrive'], cloudWarn: ['onsetS', 'cloudOnset'], droughtWarn: ['onsetS', 'windDrought']};
const ONSETS = ['heatOnset', 'stormArrive', 'windCutout', 'cloudOnset', 'windDrought'];
const near = (a, b) => (a < b ? stepReal(a, b) : stepReal(b, a));

/** Every D-8(c) / D-8(d) / window rule a pre-rolled day breaks, as text (empty: none). */
function violations(d) {
  const bad = [], why = s => bad.push(d.scn.id + ' ' + d.seed + ': ' + s), evs = d.evs;
  const trips = evs.filter(e => e.contingency), ons = evs.filter(e => ONSETS.includes(e.type)).map(e => e.atS);
  // Q-72 (D-8(c)), all five rules
  if (trips.length > 2) why(trips.length + ' unwarned contingencies');
  for (const t of trips) {
    if (t.warned) why(t.type + ' warned');
    if (t.atS < H(9)) why(t.type + ' before 09:00');
    if (t.atS >= NIGHT_S) why(t.type + ' from 21:00');
    for (const o of ons) if (near(t.atS, o) < V.ONSET_CLEAR_REAL_S) why(t.type + ' within 30 real s of an onset at ' + o);
  }
  for (let i = 0; i < trips.length; i++) for (let j = i + 1; j < trips.length; j++) {
    const a = trips[i].atS, b = trips[j].atS;
    if (stepReal(a, b) < V.SPACING_REAL_S || b - a < V.SPACING_GRID_S) why('trips at ' + a + ' and ' + b + ' too close');
  }
  // Q-71 (D-8(d)): the latest whole minute with 26 real s of lead, and more than a GT's start
  for (const [type, [key, onType]] of Object.entries(WARNS)) for (const w of of(d, type)) {
    const on = w.args[key];
    if (!(stepReal(w.atS, on) >= V.LEAD_REAL_S) || stepReal(w.atS + MIN, on) >= V.LEAD_REAL_S) why(type + ' lead not the latest minute of 26 real s');
    if (on - w.atS < ANSWER_S) why(type + ' lead under a GT start + 2 min');
    if (!of(d, onType).some(e => e.atS === on)) why(type + ' has no ' + onType + ' at its onset');
  }
  // nothing from 21:00; whole minutes; act and crisis on every record
  for (const e of evs) {
    if (e.atS >= NIGHT_S) why(e.type + ' from 21:00');
    if (e.atS % MIN) why(e.type + ' off the minute');
    if (!(e.type === 'notice' ? e.act === 0 && !e.crisis : [1, 2, 3].includes(e.act)) || typeof e.crisis !== 'boolean') why(e.type + ' act/crisis');
  }
  // D-8(e) and Q-66/Q-67 windows
  const x = d.scn.dayplan, inH = (s, w) => s >= H(w[0]) && s <= H(w[1]);
  for (const e of of(d, 'heatOnset')) {
    const ann = one(d, 'heatAnnounce');
    if (!inH(e.atS, x.act3.heat.onsetH) || e.atS % V.DAYPLAN_MARK_S || ann.atS !== 0 || ann.args.onsetS !== e.atS ||
      ann.args.endS !== Math.min(e.atS + 6.5 * 3600, H(20)) || one(d, 'heatEnd').atS !== ann.args.endS) why('heat timing');
  }
  for (const e of of(d, 'stormArrive')) {
    const w = one(d, 'stormWarn').args, co = one(d, 'windCutout').atS, pass = one(d, 'stormPass').atS;
    if (!inH(e.atS, x.act3.storm.arriveH) || co < e.atS + 30 * MIN || co > e.atS + 90 * MIN || pass !== Math.min(e.atS + 140 * MIN, H(20 + 50 / 60)) ||
      w.passS !== pass || w.cutoutFromS !== e.atS + 30 * MIN || w.cutoutToS !== e.atS + 90 * MIN || w.cutoutToS > pass) why('storm timing');
    for (const l of of(d, 'linkTrip').filter(e => e.act === 3)) if (stepReal(co, l.atS) < V.ONSET_CLEAR_REAL_S || l.atS >= pass) why('link trip timing');
  }
  for (const e of of(d, 'windDrought')) if (!inH(e.atS, x.act3.drought.onsetH)) why('drought timing');
  for (const e of of(d, 'cloudOnset')) {
    const der = one(d, 'tieDerate'), clr = one(d, 'cloudClear').atS;
    if (!inH(e.atS, x.act2.front.onsetH) || (der && e.atS < der.args.untilS + 30 * MIN)) why('front before 10:00 or the derate end + 30 min');
    if (clr < e.atS + 40 * MIN || clr > e.atS + 110 * MIN || e.args.clearS !== clr || e.args.suburbs !== true) why('front clear');
  }
  for (const t of trips) if (!inH(t.atS, t.act === 2 ? x.act2.windowH : t.type === 'linkTrip' ? [15.5, 21] : x.act3.trip.windowH)) why(t.type + ' window');
  return bad;
}

test('the day classes (D-8(a), Q-66): heat 15, storm 25, drought 20, calm 40 (+-2 points) on the dates and on the seeds', t => {
  for (const [name, days] of [['dates', DATES], ['seeds', SEEDS]]) {
    const got = {};
    for (const c of ['heat', 'storm', 'drought', 'calm']) {
      got[c] = share(days, d => d.regime.cls === c);
      assert.ok(Math.abs(got[c] - {heat: 0.15, storm: 0.25, drought: 0.20, calm: 0.40}[c]) <= 0.02, name + ' ' + c + ' ' + pct(got[c]));
    }
    t.diagnostic(name + ' classes: ' + Object.entries(got).map(([c, v]) => c + ' ' + pct(v)).join(', '));
  }
  // a = 0 and a = 1 as before (every pinned seed keeps its day type); a = 2 picks the overlay among non-heat days
  for (const d of SEEDS.slice(0, 300)) {
    const u = a => uniform(d.seed, STREAM.EXT_REGIME, a), w = d.scn.weather, heat = u(0) < w.heatShare;
    assert.equal(d.regime.temp, heat ? 'HEATWAVE' : u(1) < w.mildShare / (1 - w.heatShare) ? 'MILD' : 'HOT');
    assert.deepEqual(weatherRegime(d.seed, d.scn), d.regime, 'weather.prerollRegime delegates');
  }
});

test('Q-72 and Q-71: zero violations of the spacing, the leads, the windows, nothing from 21:00, act and crisis on every record', t => {
  const bad = ALL.flatMap(violations);
  assert.deepEqual(bad.slice(0, 10), [], bad.length + ' violations');
  const lead = {stormWarn: [], cloudWarn: [], droughtWarn: []};
  for (const d of ALL) for (const k of Object.keys(lead)) for (const w of of(d, k)) lead[k].push((w.args[WARNS[k][0]] - w.atS) / MIN);
  const range = a => [Math.min(...a), Math.max(...a)];
  t.diagnostic('leads (grid min): ' + Object.entries(lead).map(([k, a]) => k + ' ' + range(a).join('-')).join(', '));
  // Q-71's grid-time figures: cloud 130-175, storm 65-115, drought 65-123 grid-min
  for (const [k, [lo, hi]] of [['cloudWarn', [130, 175]], ['stormWarn', [65, 115]], ['droughtWarn', [65, 123]]]) {
    const [a, b] = range(lead[k]);
    assert.ok(a >= lo && b <= hi + 1, k + ' ' + a + '-' + b);
  }
});

test('Act I (Q-68): one constraint every date, its unit off at 04:00; the task on 85% with two rotation districts of one suburb', t => {
  for (const d of ALL) {
    const der = of(d, 'tieDerate'), out = of(d, 'unitOutage'), a1 = d.scn.dayplan.act1;
    assert.equal(der.length + out.length, 1, d.seed + ' one constraint');
    const c = der[0] || out[0], end = one(d, der.length ? 'tieDerateEnd' : 'unitReturn');
    assert.ok(c.atS === 0 && c.act === 1 && c.crisis && end.atS === c.args.untilS && end.act === 1);
    assert.equal(c.args.untilS % V.DAYPLAN_MARK_S, 0);
    if (der.length) {
      assert.ok(c.args.limitMW >= 400 && c.args.limitMW <= 550 && c.args.limitMW % 50 === 0 && c.args.untilS >= H(10) && c.args.untilS <= H(12));
    } else {
      assert.equal(c.args.unit, a1.late.unit);
      assert.equal(d.scn.commitment.units[c.args.unit], undefined, 'the outaged unit is off at 04:00');
      assert.ok(c.args.untilS >= H(a1.late.untilH[0]) && c.args.untilS <= H(a1.late.untilH[1]));
      assert.deepEqual(end.args, {unit: c.args.unit});
    }
    const f = of(d, 'feederOut');
    if (!f.length) continue;
    const {districts: ds, clearS: cs} = f[0].args, sub = ds.map(id => id.replace(/\d+$/, ''));
    assert.ok(f[0].atS === 0 && f[0].act === 1 && !f[0].crisis && ds.length === 2 && ds[0] !== ds[1] && sub[0] === sub[1]);
    assert.ok(ds.every(id => d.scn.city.rotation.includes(id)), 'rotation districts');
    assert.ok(cs[1] - cs[0] >= 15 * MIN && cs.every(s => s >= H(6.5) && s <= H(8) && s % V.DAYPLAN_MARK_S === 0), 'clearances ' + cs);
    assert.deepEqual(of(d, 'feederClear').map(e => [e.atS, e.args.district, e.act]), [[cs[0], ds[0], 1], [cs[1], ds[1], 1]]);
  }
  const task = share(ALL, d => of(d, 'feederOut').length > 0), derate = share(ALL, d => of(d, 'tieDerate').length > 0);
  assert.ok(Math.abs(task - 0.85) <= 0.02, 'task ' + pct(task));
  assert.ok(Math.abs(derate - 0.5) <= 0.03, 'derate ' + pct(derate));
  assert.ok(DATES.some(d => d.scn.id === 'desk-weekend' && of(d, 'unitOutage').some(e => e.args.unit === 'coal4')), 'the weekend\'s late return is coal 4');
  t.diagnostic('task ' + pct(task) + ', tie derate ' + pct(derate) + ' (late return the rest)');
});

test('Acts II and III (Q-66, Q-67): one crisis each; the trips spread over their windows; the storm\'s link trip realised share', t => {
  const mix = {heat: {}, other: {}}, a2 = {heat: [], other: []}, a3 = [], links = [];
  let fell = 0; // non-heat days whose drawn trip had no feasible minute: the front instead (Q-67)
  for (const d of ALL) {
    const cls = d.regime.cls, heat = cls === 'heat', k = heat ? 'heat' : 'other';
    const kinds = [of(d, 'cloudWarn').length && 'front', ...d.evs.filter(e => e.act === 2 && e.contingency)
      .map(e => ({unitTrip: 'unit', smelterTrip: 'smelter', linkTrip: 'tie'})[e.type])].filter(Boolean);
    assert.ok(kinds.length <= 1, d.seed + ' one belly crisis: ' + kinds);
    assert.ok(!(heat && kinds[0] === 'front'), 'no front under a heatwave');
    mix[k][kinds[0] || 'none'] = (mix[k][kinds[0] || 'none'] || 0) + 1;
    const m = d.scn.dayplan.act2.mix; // the drawn kind: Act II's slot is the fourth (sim/README §11 dayplan.js), its first draw
    if (kinds[0] === 'front' && pickWith(uniform(d.seed, STREAM.EXT_EVENTS, V.DAYPLAN_SLOT_BASE + 3, 0), Object.keys(m), x => m[x]) !== 'front') fell++;
    for (const e of d.evs.filter(x => x.act === 2 && x.contingency)) a2[k].push(e.atS);
    const evening = d.evs.filter(e => e.act === 3 && e.type === 'unitTrip');
    assert.equal(evening.length, cls === 'calm' || cls === 'drought' ? 1 : 0, d.seed + ' ' + cls + ' evening trip');
    a3.push(...evening.map(e => e.atS));
    assert.equal(of(d, 'heatAnnounce').length, +heat);
    assert.equal(of(d, 'stormWarn').length, +(cls === 'storm'));
    assert.equal(of(d, 'droughtWarn').length, +(cls === 'drought'));
    if (cls === 'storm') links.push(of(d, 'linkTrip').some(e => e.act === 3));
    for (const e of of(d, 'smelterTrip')) assert.ok(of(d, 'smelterReturn').some(r => r.atS === e.atS + e.args.offS));
  }
  const hist = (xs, from, to) => { const n = {}; for (let h = from; h < to; h++) n[h] = 0; for (const s of xs) n[Math.min(to - 1, Math.floor(s / 3600) + 4)]++; return n; };
  const shares = m => { const n = Object.values(m).reduce((a, b) => a + b, 0); return Object.entries(m).map(([k, v]) => k + ' ' + pct(v / n)).join(', '); };
  const med = xs => { const s = xs.slice().sort((p, q) => p - q), m = s[s.length >> 1] / 60 + 240; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const early = xs => pct(xs.filter(s => s < H(9.4)).length / xs.length);
  t.diagnostic('Act II mix, non-heat: ' + shares(mix.other) + ' (' + fell + ' of them the front for want of a feasible trip minute); heat: ' + shares(mix.heat) + ' (none: ' + (mix.heat.none || 0) + ')');
  t.diagnostic('Act II trips by hour, non-heat: ' + JSON.stringify(hist(a2.other, 9, 15)) + ', median ' + med(a2.other) + ', ' + early(a2.other) + ' before 09:24; heat days: ' +
    JSON.stringify(hist(a2.heat, 9, 15)) + ', median ' + med(a2.heat) + ', ' + early(a2.heat) + ' before 09:24');
  t.diagnostic('Act III evening trips by hour: ' + JSON.stringify(hist(a3, 17, 20)) + ', median ' + med(a3));
  const link = links.filter(Boolean).length / links.length;
  t.diagnostic('storm link trip realised on ' + pct(link) + ' of ' + links.length + ' storm days');
  // not degenerate: the joint draw does not push the belly's trips into 09:00-09:24
  for (const xs of [a2.other, a2.heat]) {
    assert.ok(xs.filter(s => s < H(9.4)).length / xs.length < 0.5, 'Act II trips crowd 09:00-09:24');
    assert.ok(Math.max(...xs) > H(11), 'some Act II trip after 11:00');
  }
  assert.ok(Object.values(hist(a2.other, 9, 15)).every(n => n > 0), 'every belly hour has a trip on some non-heat day');
  assert.ok(Object.values(hist(a3, 17, 20)).every(n => n > 0));
  assert.ok(link > 0.15 && link < 0.4, 'link trip share ' + pct(link));
  assert.ok(Math.abs(mix.other.front / ALL.filter(d => d.regime.cls !== 'heat').length - 0.4) < 0.1, 'the front about 40% of non-heat days');
});

test('the series-keys rule (§32.4.6): only the records that change the weather at their own second carry windMu, clearMu, clearMuAtLeast', () => {
  const carriers = {windMu: new Set(), clearMu: new Set(), clearMuAtLeast: new Set()};
  for (const d of ALL) {
    for (const e of d.evs) for (const k of Object.keys(carriers)) if (k in e.args) carriers[k].add(e.type);
    if (d.regime.cls === 'drought') {
      const w = one(d, 'droughtWarn');
      assert.deepEqual(d.evs.filter(e => 'windMu' in e.args).map(e => [e.type, e.atS]), [['windDrought', w.args.onsetS]]);
      assert.equal(w.args.muPm, Math.round(d.scn.dayplan.act3.drought.mu * 1000));
    }
    for (const w of of(d, 'cloudWarn')) assert.equal(one(d, 'cloudOnset').atS, w.args.onsetS);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(carriers).map(([k, v]) => [k, [...v].sort()])), {
    windMu: ['stormArrive', 'stormPass', 'windCutout', 'windDrought'], clearMu: ['cloudClear', 'cloudOnset'], clearMuAtLeast: ['heatOnset']});
});

/** The news text events.applyDue makes of one record (a bare state: the four weather appliers touch only news). */
function newsText(scn, e) {
  const st = {tick: e.atS * TPS, scn, ext: {events: [e]}, evNext: 0, news: [], smelter: {returning: false}};
  applyDue(st, []);
  return st.news[0].text;
}

test('the dayplan-day weather texts read their args only, <= 25 words, no sender; classic\'s pre-roll and texts unchanged', () => {
  const noEvents = {...DESK, events: null};
  for (const d of ALL.slice(0, 400)) for (const e of d.evs.filter(x => ['heatAnnounce', 'stormWarn', 'cloudWarn', 'droughtWarn'].includes(x.type))) {
    const text = newsText(d.scn, e);
    assert.ok(text.split(/\s+/).length <= 25 && !/^[A-Z ]+:/.test(text) && !/BUREAU|SATELLITE/.test(text), text);
    assert.equal(newsText(noEvents, e), text, 'args only: ' + text);
  }
  const wd = {atS: 50400, type: 'windDrought', args: {windMu: 0.12}};
  assert.equal(newsText(DESK, wd), 'Wind drought: a high-pressure ridge has settled in; wind falling toward about 12% of capacity.');
  // classic: the pre-roll of seeds 1-200 hashes as it did before the plan (recorded at the-day 8fb17f6), through the legacy path
  const all = [];
  for (let seed = 1; seed <= 200; seed++) {
    const r = weatherRegime(seed, CLASSIC), u = uniform(seed, STREAM.EXT_REGIME, 0), w = CLASSIC.weather;
    assert.equal(r.cls, u < w.heatShare ? 'heat' : u < w.heatShare + w.stormShare ? 'storm' : 'calm');
    all.push([r, prerollEvents(seed, CLASSIC, r)]);
  }
  assert.equal(CLASSIC.dayplan, null);
  assert.equal(canonicalHash(all), 1036444559);
  assert.deepEqual([
    {atS: 0, type: 'heatAnnounce', args: {onsetS: 34200, endS: 57600, upliftPm: 65, deratePm: 70}},
    {atS: 42000, type: 'stormWarn', args: {arriveS: 45600}},
    {atS: 20000, type: 'cloudWarn', args: {onsetS: 21200}}, wd].map(e => newsText(CLASSIC, e)), [
    'WEATHER BUREAU: extreme heat 13:30-20:00. Demand up to +6.5% (building from 12:30, easing by 21:00); coal and gas capacity -7% from 13:30 to 20:00; clear skies.',
    'WEATHER BUREAU: storm front approaching from the west, arriving about 16:40. Wind output will surge, then fall away as turbines cut out in the gale (expected 17:10-18:10). Interconnector faults are possible until the front passes, about 19:00.',
    'SATELLITE: cloud band moving over the solar precinct, overhead from about 09:53. Utility solar down to about 32% of clear-sky for 40-110 min.',
    'WIND DROUGHT: a high-pressure ridge has settled in. Wind resource falling toward about 12% of capacity.']);
});

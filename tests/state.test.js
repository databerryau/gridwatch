// F-2 / F-3 / S-10 / F-13: createState builds a plain JSON state with the whole ext
// timeline pre-rolled, deterministically per seed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getHeapSpaceStatistics} from 'node:v8';
import {createState, step, observe, hashState, canonicalHash} from '../sim/step.js';
import * as physics from '../sim/physics.js';
import {prerollRegime, prerollSeries, sampleSecond} from '../sim/weather.js';
import {prerollEvents, CONTINGENCY_TYPES} from '../sim/events.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';

const scn = JSON.parse(JSON.stringify(CLASSIC)); // plain copy, as createState stores it (src keys are ignored by the sim)

// Plain JSON only: null, booleans, finite numbers, strings, arrays, plain objects; no
// undefined, functions, typed arrays or shared references (a shared object would split in
// two after a JSON round trip, and the copies would drift apart).
function assertPlainJson(x, path = 'state', seen = new Set()) {
  if (x === null || typeof x === 'boolean' || typeof x === 'string') return;
  if (typeof x === 'number') { assert.ok(Number.isFinite(x), path + ' is not finite'); return; }
  assert.equal(typeof x, 'object', path + ' is a ' + typeof x);
  assert.ok(!seen.has(x), path + ' is a shared reference');
  seen.add(x);
  if (Array.isArray(x)) { x.forEach((y, i) => assertPlainJson(y, path + '[' + i + ']', seen)); return; }
  assert.equal(Object.getPrototypeOf(x), Object.prototype, path + ' is not a plain object');
  for (const [k, v] of Object.entries(x)) {
    assert.notEqual(v, undefined, path + '.' + k + ' is undefined');
    assertPlainJson(v, path + '.' + k, seen);
  }
}

test('F-2: createState returns a plain JSON-serialisable object that survives a round trip', () => {
  const s = createState(1, CLASSIC);
  assertPlainJson(s);
  const j = JSON.stringify(s);
  const back = JSON.parse(j);
  assert.equal(JSON.stringify(back), j);
  assert.equal(hashState(back), hashState(s), 'a resumed state hashes like the original');
  assert.ok(j.length < 64 * 1024, 'state is ' + j.length + ' bytes');
});

test('F-3: same seed gives the identical ext timeline and hash; different seeds differ', () => {
  const a = createState(7, CLASSIC), b = createState(7, CLASSIC);
  assert.deepEqual(a.ext, b.ext);
  assert.equal(hashState(a), hashState(b));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const exts = new Set();
  for (let seed = 1; seed <= 30; seed++) exts.add(JSON.stringify(createState(seed, CLASSIC).ext));
  assert.equal(exts.size, 30);
  assert.notEqual(hashState(createState(1, CLASSIC)), hashState(createState(2, CLASSIC)));
  // Seeds are u32: 2^32 + 5 is seed 5.
  assert.deepEqual(createState(2 ** 32 + 5, CLASSIC).ext, createState(5, CLASSIC).ext);
});

test('F-3: the ext pre-roll is a pure function of (seed, scenario): no hidden state between calls', () => {
  const first = JSON.stringify(createState(11, CLASSIC).ext);
  for (let seed = 100; seed < 110; seed++) createState(seed, CLASSIC);
  assert.equal(JSON.stringify(createState(11, CLASSIC).ext), first);
});

test('S-10: heatwaves on 15 +- 2% of 2,000 seeds; storms on 30 +- 2%; createState agrees', () => {
  const counts = {heat: 0, storm: 0, calm: 0};
  for (let seed = 1; seed <= 2000; seed++) counts[prerollRegime(seed, scn).cls]++;
  assert.ok(Math.abs(counts.heat / 2000 - 0.15) <= 0.02, 'heat share ' + counts.heat / 2000);
  assert.ok(Math.abs(counts.storm / 2000 - 0.30) <= 0.02, 'storm share ' + counts.storm / 2000);
  for (let seed = 1; seed <= 20; seed++) assert.deepEqual(createState(seed, CLASSIC).ext.regime, prerollRegime(seed, scn));
});

// The most MW any single contingency event could remove (F-13): one machine, the tie, or the potline.
function worstCaseMW(e) {
  if (e.type === 'linkTrip') return V.TIE_MAX_MW;
  if (e.type === 'smelterTrip') return V.SMELTER_MW;
  if (e.args.rule === 'station') return V.STATIONS[e.args.station].ratingMW;
  return Math.max(...V.MACHINES.map(m => m.ratingMW)); // 'largest': the largest machine online
}

test('F-13: the largest credible contingency is <= 800 MW on every seed; events are well formed', () => {
  let worst = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const regime = prerollRegime(seed, scn);
    const evs = prerollEvents(seed, scn, regime);
    const secs = new Set();
    let prev = -1;
    for (const e of evs) {
      assert.ok(Number.isInteger(e.atS) && e.atS >= 0 && e.atS < V.DAY_S, 'seed ' + seed + ' ' + e.id + ' at ' + e.atS);
      assert.ok(e.atS >= prev, 'sorted');
      prev = e.atS;
      assert.equal(e.contingency, CONTINGENCY_TYPES.includes(e.type), e.type);
      if (!e.contingency) continue;
      assert.ok(!secs.has(e.atS), 'seed ' + seed + ': two contingencies in one second');
      secs.add(e.atS);
      worst = Math.max(worst, worstCaseMW(e));
      assert.ok(e.args.lockoutS === undefined || e.args.lockoutS > 0);
    }
    assert.equal(new Set(evs.map(e => e.id)).size, evs.length);
    assert.equal(evs.filter(e => e.type === 'unitTrip' && e.args.rule === 'largest').length, 1, 'one guaranteed big trip');
    const heat = evs.filter(e => e.type.startsWith('heat'));
    assert.equal(heat.length, regime.cls === 'heat' ? 3 : 0);
    if (heat.length) assert.ok(heat[0].type === 'heatAnnounce' && heat[0].atS < heat[1].atS && heat[1].atS < heat[2].atS);
    assert.equal(evs.some(e => e.type === 'stormWarn'), regime.cls === 'storm');
  }
  assert.ok(worst <= 800, 'worst single contingency ' + worst + ' MW');
});

test('F-3: ext series are quantised integers in range, SERIES_LEN samples from 04:00 to 04:00', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const regime = prerollRegime(seed, scn), evs = prerollEvents(seed, scn, regime);
    const sr = prerollSeries(seed, scn, regime, evs);
    for (const k of ['demandNoiseMW', 'windPm', 'clearPm']) {
      assert.equal(sr[k].length, V.SERIES_LEN, k);
      assert.ok(sr[k].every(Number.isInteger), k + ' integers');
    }
    assert.ok(sr.windPm.every(x => x >= scn.wind.min * 1000 && x <= scn.wind.max * 1000));
    assert.ok(sr.clearPm.every(x => x >= scn.cloud.min * 1000 && x <= scn.cloud.max * 1000));
    assert.equal(sr.windPm[0], scn.wind.startFrac * 1000);
    assert.ok(Math.max(...sr.demandNoiseMW.map(Math.abs)) < 600);
  }
});

test('opening state: 04:00 commitment, balanced first second, inertia from synchronised machines', () => {
  const s = createState(3, CLASSIC);
  const online = s.units.filter(u => u.sync).map(u => u.id);
  assert.deepEqual(online, ['coal1', 'coal2', 'coal3', 'coal4', 'ccgt1', 'ccgt2', 'hydro1', 'hydro2']);
  const supply = s.units.reduce((a, u) => a + u.outMW, 0) + s.tie.flowMW + s.ren.windMW + s.ren.solarMW + s.battery.outMW;
  assert.ok(Math.abs(supply - s.env.demandMW) < 1, 'imbalance ' + (supply - s.env.demandMW));
  assert.equal(s.phys.ekMWs, 4 * 650 * 5 + 2 * 650 * 4.5 + 2 * 317 * 3.5);
  assert.equal(s.phys.fHz, 50);
  assert.equal(s.tie.flowMW, 250);
  assert.equal(s.battery.socMWh, 680);
  assert.equal(s.city.districts.length, 32);
  assert.ok(Math.abs(s.city.districts.reduce((a, d) => a + d.share, 0) - 1) < 1e-9);
  for (let k = 1; k <= V.UFLS_STAGES; k++) {
    const blk = s.city.districts.filter(d => d.uflsStage === k);
    assert.equal(blk.length, 2, 'stage ' + k);
    const share = blk[0].share + blk[1].share;
    assert.ok(Math.abs(share - V.UFLS_BLOCK_FRAC) < 0.006, 'stage ' + k + ' sheds ' + share);
  }
});

test('env is a pure function of ext (and the smelter): sampling any second twice gives the same values', () => {
  const s = createState(5, CLASSIC);
  s.tick = 13 * 3600 * V.TICKS_PER_S; // 17:00
  sampleSecond(s);
  const a = JSON.stringify(s.env);
  s.tick = 0; sampleSecond(s);
  s.tick = 13 * 3600 * V.TICKS_PER_S; sampleSecond(s);
  assert.equal(JSON.stringify(s.env), a);
  assert.ok(s.env.demandMW > 6500 && s.env.demandMW < 9000, 'demand at 17:00 ' + s.env.demandMW);
});

test('S-4: observe() hides the seed, the regime, the event list and event ids', () => {
  const s = createState(9, CLASSIC);
  s.news.push({atS: 10, kind: 'heat', fromS: 20, toS: 30, text: 'x', eventId: 'e3'}); // as a careless writer might
  const o = observe(s);
  const keys = new Set();
  (function walk(x) {
    if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { keys.add(k); walk(v); }
  })(o);
  for (const k of ['ext', 'seed', 'regime', 'events', 'evNext', 'series', 'scn', 'scnHash', 'eventId'])
    assert.ok(!keys.has(k), 'obs exposes ' + k);
  assert.equal(o.forecast.n, V.FC_HORIZON_S / V.FC_STEP_S);
  assert.equal(o.units.length, 14); // F-13 fleet after owner decision D2 (GT·C 2 x 300 MW)
  o.units[0].outMW = -1; o.score.cost.fuel = -1; o.sec.level = 'x'; o.districts[0].dark = true;
  assert.notEqual(s.units[0].outMW, -1, 'obs is a copy');
  assert.notEqual(s.score.cost.fuel, -1, 'obs is a copy');
  assert.notEqual(s.sec.level, 'x', 'obs is a copy');
  assert.equal(s.city.districts[0].dark, false, 'obs is a copy');
});

// The frozen observe() shape (README §8). Adding a key is a contract change: update the
// README and this list together. Stage B may add private state fields without touching it.
const OBS_SHAPE = {
  '': ['v', 'scenarioId', 'tick', 's', 'clock', 'over', 'black', 'mode', 'modeLocked', 'inWatch', 'inRespond', 'f',
    'balance', 'demand', 'units', 'stations', 'battery', 'tie', 'wind', 'solar', 'sky', 'hydro', 'dr', 'rert', 'smelter', 'sec',
    'fos', 'agc', 'price', 'score', 'districts', 'news', 'contingency', 'contingencies', 'forecast', 'dayAhead', 'plan', 'scope',
    'rooftop', 'msl', 'day'],
  clock: ['h', 'hh', 'mm', 'ss', 'text'],
  f: ['hz', 'devHz', 'rocofHzS', 'ekGWs'],
  balance: ['schedSupplyMW', 'supplyMW', 'servedMW', 'loadMW', 'imbalanceMW', 'inertiaMW', 'governorsMW', 'batteryPfrMW',
    'guardMW', 'loadReliefMW', 'shedMW', 'renPfrMW', 'roofPfrMW'],
  demand: ['nowMW', 'servedMW', 'shedMW', 'heatActive', 'tempC', 'underlyingMW', 'rooftopMW', 'litMW', 'unservedMW'],
  sky: ['clearness', 'windFrac'],
  'units[]': ['id', 'station', 'name', 'cls', 'mode', 'sync', 'timerS', 'outMW', 'schedMW', 'basePointMW', 'agcTrimMW',
    'govMW', 'availMW', 'minMW', 'ratingMW', 'rampMWMin', 'offer', 'startToMinS', 'hotS', 'starts', 'upForS', 'downForS',
    'startBlock', 'stopBlock', 'slipHz', 'phaseDeg'],
  'stations[]': ['id', 'name', 'basePointMW', 'onCount', 'minMW', 'maxMW', 'outMW'],
  battery: ['mode', 'orderMW', 'guardMW', 'schedMW', 'agcTrimMW', 'pfrMW', 'ffrMW', 'guardFired', 'outMW', 'socMWh', 'capMWh',
    'ratedMW', 'fullHold', 'ufSuspend'],
  tie: ['setMW', 'flowMW', 'tripped', 'lockoutS', 'importLimitMW', 'exportLimitMW', 'neighbourPrice'],
  wind: ['availMW', 'outMW', 'limitPct', 'ofgsTrippedFrac', 'autoMW'],
  solar: ['availMW', 'outMW', 'limitPct', 'autoMW'],
  hydro: ['storageMWh', 'allocationMWh', 'frac'],
  dr: ['callsLeft', 'activeS', 'mw'],
  rert: ['armed', 'leadS', 'outMW', 'standingDown', 'armedEver'],
  smelter: ['loadMW', 'returning'],
  sec: ['r5MW', 'lMW', 'lKind', 'lId', 'ratio', 'previewNadirHz', 'previewAtS', 'previewLId', 'previewLMW', 'dirty', 'level',
    'previewUnitHz', 'previewLinkHz'],
  fos: ['outsideS', 'belowContainS', 'countdownS', 'directed', 'nextShedS'],
  agc: ['nextCycleS', 'requestMW', 'unmetMW', 'atLimitS', 'aceMW'],
  price: ['mwh', 'marginalId', 'adder', 'exhausted', 'x'],
  score: ['servedMWh', 'unservedMWh', 'uflsMWh', 'directedMWh', 'taskMWh', 'cost', 'co2t', 'genMWh', 'marketBill', 'minHz', 'maxHz',
    'outsideNormalS', 'spark', 'starts', 'spillMWh', 'lightsMWh', 'costDollars', 'centsPerKWh', 'co2tPerMWh'],
  'score.cost': ['fuel', 'noLoad', 'starts', 'tie', 'battWear', 'dr', 'rert', 'flex'],
  'districts[]': ['id', 'suburb', 'share', 'uflsStage', 'rot', 'dark', 'shedBy', 'darkSinceS', 'restoredAtS', 'coldLoadMW',
    'restoreBlock', 'reconnectS'],
  'news[]': ['atS', 'kind', 'fromS', 'toS', 'text'],
  contingency: ['n', 'startTick', 'cause', 'id', 'lostMW', 'fStartHz', 'ekBeforeMWs', 'ekAfterMWs', 'rocofHzS', 'extremeHz',
    'extremeTick', 'pre', 'caught', 'uflsStages', 'contained', 'backInBandTick', 'watchEndTick', 'secureByTick'],
  'contingency.pre': ['inertiaMW', 'batteryMW', 'guardMW', 'governorsMW', 'loadReliefMW', 'uflsMW', 'inverterMW'],
  'contingency.caught': ['inertiaMW', 'batteryMW', 'guardMW', 'governorsMW', 'loadReliefMW', 'uflsMW', 'inverterMW'],
  'contingencies[]': ['n', 'startS', 'cause', 'id', 'lostMW', 'watchEndS', 'backInBandS'],
  forecast: ['fromS', 'stepS', 'n', 'demandP50', 'demandP10', 'demandP90', 'windMW', 'solarMW', 'neighbourPrice', 'exportLimitMW',
    'underlyingP50', 'rooftopMW'],
  // Phase 1a (desk/README.md §3): the plan in state and the synchroscope.
  plan: ['madeAtS', 'rev', 'stations', 'tie', 'starts', 'stops'],
  'plan.stations[]': ['id', 'man', 'doneS', 'clampedMW', 'keys'],
  'plan.stations[].keys[]': ['atS', 'mw'],
  'plan.tie': ['doneS', 'keys'],
  'plan.starts[]': ['unit', 'atS'],
  'plan.stops[]': ['unit', 'atS'],
  scope: ['unit', 'open'],
  // Phase 2a (desk/README.md §19.3): rooftop PV, MSL notices, the kind of day.
  rooftop: ['mw', 'availMW', 'capMW', 'offMW', 'suburbs'],
  'rooftop.suburbs[]': ['id', 'mw', 'capMW', 'clearness'],
  msl: ['level', 'minMW', 'atS', 'sinceS'],
  day: ['temp', 'weekend'],
};

test('README §8: the observe() shape is frozen (every key list, including dayAhead and a contingency)', async () => {
  const {tripUnit, unitIndex} = await import('../sim/fleet.js');
  const s = createState(9, CLASSIC);
  s.news.push({atS: 10, kind: 'heat', fromS: 20, toS: 30, text: 'x'});
  // A plan with a key, a tie key and both bookings (Phase 1a), so every list has an entry (before the trip's watch).
  const {applyInput} = await import('../sim/step.js');
  for (const x of [{type: 'planKey', station: 'coal', atS: 600, mw: 1500}, {type: 'tie', mw: 300},
    {type: 'planStart', unit: 'gta1', atS: 900}, {type: 'planStop', unit: 'ccgt2', atS: 7200}]) assert.equal(applyInput(s, x).ok, true, x.type);
  tripUnit(s, unitIndex('coal1'), 'test', 3600, []);
  const o = observe(s, {dayAhead: true});
  // 'a.b[].c': a path; a segment ending in [] takes the list's first entry.
  const at = path => path.split('.').reduce((x, k) => (k.endsWith('[]') ? x[k.slice(0, -2)][0] : x[k]), o);
  for (const [path, keys] of Object.entries(OBS_SHAPE)) {
    const obj = path === '' ? o : at(path);
    assert.deepEqual(Object.keys(obj), keys, 'obs.' + (path || '(top)'));
  }
  assert.deepEqual(Object.keys(o.dayAhead), OBS_SHAPE.forecast);
  assert.equal(o.dayAhead.fromS, o.forecast.fromS);
  assert.equal(o.dayAhead.n, Math.floor((V.DAY_S - o.s) / V.FC_STEP_S), 'dayAhead runs to 04:00');
  assert.equal(observe(s).dayAhead, null, 'dayAhead only on request');
  for (const k of ['forecast', 'dayAhead']) {
    const fc = o[k];
    for (const arr of OBS_SHAPE.forecast.slice(3)) assert.equal(fc[arr].length, fc.n, k + '.' + arr);
  }
});

test('observe().clock is exact at every minute of the day (integer seconds, not floating hours)', () => {
  const s = createState(1, CLASSIC);
  for (let sec = 0; sec < V.DAY_S; sec += 60) {
    s.tick = sec * V.TICKS_PER_S;
    const c = observe(s).clock;
    const hh = (V.DAY_START_H + Math.floor(sec / 3600)) % 24, mm = Math.floor(sec / 60) % 60;
    assert.deepEqual([c.hh, c.mm, c.ss], [hh, mm, 0], 'second ' + sec);
    assert.equal(c.text, String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'));
  }
  s.tick = (60 + 59) * V.TICKS_PER_S;
  assert.equal(observe(s).clock.text, '04:01');
  assert.equal(observe(s).clock.ss, 59);
});

test('D-7: obs.modeLocked is true from the desk opening (PLAYER_START_H) even with no input', () => {
  const s = createState(1, CLASSIC);
  assert.equal(observe(s).modeLocked, false);
  s.tick = V.PLAYER_START_TICK;
  assert.equal(observe(s).modeLocked, true);
});

// Every leaf of state outside scn and ext, as a path.
function leaves(x, path = [], out = []) {
  for (const k of Object.keys(x)) {
    if (path.length === 0 && (k === 'scn' || k === 'ext')) continue;
    const v = x[k];
    if (v !== null && typeof v === 'object') leaves(v, path.concat(k), out); else out.push(path.concat(k));
  }
  return out;
}

test('F-2: hashState covers every field of state except scn and ext; -0 hashes as 0; non-JSON values throw', () => {
  const s = createState(4, CLASSIC);
  s.conts.push({n: 1, nested: {a: [1, 2]}}); s.log.push({tick: 0, type: 'tie', args: {mw: 5}});
  const h0 = hashState(s);
  const paths = leaves(s);
  assert.ok(paths.length > 500, paths.length + ' leaves');
  for (const p of paths) {
    const parent = p.slice(0, -1).reduce((o, k) => o[k], s), k = p[p.length - 1], old = parent[k];
    parent[k] = old === null ? 0 : typeof old === 'number' ? old + 1 : typeof old === 'boolean' ? !old : old + 'x';
    assert.notEqual(hashState(s), h0, 'hashState ignores ' + p.join('.'));
    parent[k] = old;
  }
  assert.equal(hashState(s), h0);
  s.news.push({}); assert.notEqual(hashState(s), h0, 'array length'); s.news.pop();
  s.phys.extra = 0; assert.notEqual(hashState(s), h0, 'a new key'); delete s.phys.extra;
  s.ext.events = []; s.ext.regime = {cls: 'x'}; s.scn.name = 'changed';
  assert.equal(hashState(s), h0, 'scn and ext are not walked (they are functions of seed, scnHash and v)');
  s.tie.lockoutS = -0;
  assert.equal(hashState(s), h0, '-0 folds to 0');
  s.phys.fHz = NaN;
  assert.throws(() => hashState(s), /non-finite/);
  s.phys.fHz = undefined;
  assert.throws(() => hashState(s), /undefined/);
});

test('F-2: two changed leaves never cancel: sign flips and doublings of pairs of fields change the hash (review fix)', () => {
  // FNV word mixing alone kept a bit-31 difference in bit 31, so negating any two nonzero
  // numbers (a sign flip is bit 31 of a double's high word) gave the same hash: 43,071 of
  // 43,071 pairs of createState(1)'s leaves collided. The per-word xor-shift spreads it.
  const s = createState(1, CLASSIC), h0 = hashState(s);
  const paths = leaves(s).filter(p => { const v = p.reduce((o, k) => o[k], s); return typeof v === 'number' && v !== 0; });
  assert.ok(paths.length > 200, paths.length + ' nonzero numeric leaves');
  const at = p => [p.slice(0, -1).reduce((o, k) => o[k], s), p[p.length - 1]];
  let pairs = 0;
  for (let i = 0; i < paths.length; i += 3) {
    const j = (i * 37 + 11) % paths.length;
    if (j === i) continue;
    const [pa, ka] = at(paths[i]), [pb, kb] = at(paths[j]), a = pa[ka], b = pb[kb];
    for (const f of [x => -x, x => 2 * x]) {
      pa[ka] = f(a); pb[kb] = f(b);
      assert.notEqual(hashState(s), h0, paths[i].join('.') + ' and ' + paths[j].join('.') + ' changed together');
      pa[ka] = a; pb[kb] = b;
    }
    pairs++;
  }
  assert.equal(hashState(s), h0);
  assert.ok(pairs > 60, pairs + ' pairs');
});

test('README §2 rule 6: physics.tick allocates nothing, also after hourly hashState (the harness F-2 hash; review fix)', () => {
  // A JS walk that read the live state's numeric leaves once a grid-hour made every later
  // physics.tick allocate ~130-180 B (0 without it): hashState now walks a JSON copy.
  const s = createState(7, CLASSIC);
  const hour = V.S_PER_H * V.TICKS_PER_S;
  while (s.tick < 4 * hour + 1) { step(s); if (s.tick % hour === 0) hashState(s); } // the old walk showed it from the third hash
  const out = [], CHUNK = 2000;
  for (let k = 0; k < CHUNK; k++) physics.tick(s, out); // warm
  const used = () => getHeapSpaceStatistics().find(x => x.space_name === 'new_space').space_used_size;
  let valid = 0, worst = 0;
  for (let c = 0; c < 40; c++) {
    const a = used();
    for (let k = 0; k < CHUNK; k++) physics.tick(s, out);
    const d = used() - a;
    if (d < 0) continue; // a scavenge ran inside the chunk: nothing to read
    valid++;
    if (d / CHUNK > worst) worst = d / CHUNK;
  }
  assert.ok(valid >= 20, valid + ' chunks without a scavenge');
  assert.ok(worst < 8, 'physics.tick allocates ' + worst.toFixed(1) + ' B per tick');
});

test('F-2: a scenario variant hashes differently from the classic day (state.scnHash), and scnHash is canonical', () => {
  const variant = JSON.parse(JSON.stringify(CLASSIC));
  variant.name = 'Classic, renamed';
  const a = createState(4, CLASSIC), b = createState(4, variant);
  assert.notEqual(a.scnHash, b.scnHash);
  assert.notEqual(hashState(a), hashState(b));
  assert.equal(canonicalHash({x: 1, y: [2, 3]}), canonicalHash({y: [2, 3], x: 1}), 'key order does not matter');
  assert.notEqual(canonicalHash({x: 0}), canonicalHash({x: false}), 'types are tagged');
  assert.notEqual(canonicalHash([1, [2]]), canonicalHash([[1], 2]), 'nesting matters');
});

test('F-3: ext event arguments are quantised: every number has at most 3 exact decimals', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const e of createState(seed, CLASSIC).ext.events) {
      assert.ok(Number.isInteger(e.atS), e.id + ' atS');
      for (const [k, x] of Object.entries(e.args)) {
        if (typeof x === 'number') assert.equal(Number(x.toFixed(3)), x, 'seed ' + seed + ' ' + e.type + '.' + k + ' = ' + x);
      }
    }
  }
});

test('content: CLASSIC is deep-frozen (an in-place edit would leak into later createState calls)', () => {
  assert.ok(Object.isFrozen(CLASSIC) && Object.isFrozen(CLASSIC.commitment.units) && Object.isFrozen(CLASSIC.demand.baseMW[0]));
  assert.throws(() => { CLASSIC.commitment.tieMW = 1; }, TypeError);
});

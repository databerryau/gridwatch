// Stage B owner "integration": whole-sim acceptance through step() (F-2, F-3, F-4, F-6, F-7,
// D-6, D-7, H-1, K-2, K-10, K-15, S-1). H-8 containment from SECURE states is checked on par's
// seed-4 day by tests/baseline-v4.test.js (the golden row's probe columns) and measured over many
// par days by tools/baseline-v4.js (section 2), not here.
//
// Budget (F-10, README §10): each test runs one or two seeds for a few sim-hours, so the file
// takes about 5 s on its own; no whole days.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createState, step, applyInput, observe, hashState, replay, INPUT_TYPES} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {previewTrip} from '../sim/physics.js';
import {security} from '../sim/grid.js';
import {V} from '../sim/params.js';
import {CLASSIC, DESK, DESK_WEEKEND} from '../content/scenarios.js';
import {createPacer, runFrame} from '../app/loop.js';
import {tokenize, jsFiles} from './lib/js-tokens.js';
import {ticksAt, calmScenario, withoutContingencies, injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const EMPTY_INPUTS = [];

// ------------------------------------------------------------------ inputs: real now

test('F-6: the input vocabulary', () => {
  assert.deepEqual([...INPUT_TYPES].sort(), ['abortStop', 'armRERT', 'basePoint', 'battery', 'callDR', 'curtail', 'directShed',
    'guard', 'mode', 'restore', 'standDownRERT', 'start', 'stop', 'syncClose', 'tie',
    // Phase 1a (desk/README.md §3.2)
    'planKey', 'planDel', 'planStart', 'planStop', 'planUnbook', 'planRejoin', 'planLoad', 'scope', 'syncTrim', 'syncAuto'].sort());
});

test('F-6: planLoad\'s list arguments are checked for shape and order, and logged canonically (every station, fresh arrays)', () => {
  const s = createState(1, CLASSIC);
  const bad = [
    {fromS: 10, stations: [], tie: [], starts: [], stops: []},
    {fromS: 10, stations: {nuclear: []}, tie: [], starts: [], stops: []},
    {fromS: 10, stations: {coal: [[20, 100], [20, 200]]}, tie: [], starts: [], stops: []},
    {fromS: 10, stations: {coal: [[20.5, 100]]}, tie: [], starts: [], stops: []},
    {fromS: 10, stations: {coal: [[20, -1]]}, tie: [], starts: [], stops: []},
    {fromS: 10, stations: {}, tie: [[20, 900]], starts: [], stops: []},
    {fromS: 10, stations: {}, tie: [], starts: [['gta1', 30], ['gta1', 40]], stops: []},
    {fromS: 10, stations: {}, tie: [], starts: [['gtb1', 40], ['gta1', 30]], stops: []},
    {fromS: 10, stations: {}, tie: [], starts: [['coal9', 30]], stops: []},
    {fromS: 10, stations: {}, tie: [], starts: [], stops: [], extra: 1},
    {fromS: 10, stations: {coal: new Array(V.PLAN_MAX_KEYS + 1).fill(0).map((_, k) => [20 + k, 1])}, tie: [], starts: [], stops: []},
    {fromS: 10, stations: {coal: [[5, 100]]}, tie: [], starts: [], stops: []}, // before fromS (grid)
  ];
  for (const x of bad) assert.equal(applyInput(s, Object.assign({type: 'planLoad'}, x)).ok, false, JSON.stringify(x).slice(0, 80));
  assert.equal(s.log.length, 0);
  const arg = {type: 'planLoad', fromS: 10, stations: {gta: [[400, 300]]}, tie: [[600, -0]], starts: [['gta1', 20]], stops: []};
  assert.equal(applyInput(s, arg).ok, true);
  const a = s.log[0].args;
  assert.deepEqual(Object.keys(a.stations), V.STATION_IDS, 'every station, in order');
  assert.deepEqual(a.stations.gta, [[400, 300]]);
  assert.ok(Object.is(a.tie[0][1], 0), '-0 folded');
  arg.stations.gta[0][1] = 999; arg.starts.length = 0;
  assert.deepEqual(a.stations.gta, [[400, 300]], 'the log never shares the caller\'s arrays');
  assert.deepEqual(s.plan.starts, [{unit: 'gta1', atS: 20}]);
  assert.notEqual(s.plan.stations[2].keys[0], a.stations.gta[0]);
});

test('F-6: malformed inputs are refused before they touch state, and are not logged', () => {
  const s = createState(1, CLASSIC);
  const h = hashState(s);
  const bad = [null, 'start', {type: 'warp'}, {type: 'start'}, {type: 'start', unit: 'coal9'}, {type: 'start', unit: 'gta1', now: true},
    {type: 'guard', mw: 75}, {type: 'guard', mw: 550}, {type: 'tie', mw: 900}, {type: 'tie', mw: NaN},
    {type: 'curtail', kind: 'hydro', limitPct: 50}, {type: 'curtail', kind: 'wind', limitPct: 101},
    {type: 'curtail', kind: 'wind', pct: 50}, {type: 'battery', mode: 'charge', mw: -5}, {type: 'battery', mode: 'boost', mw: 5},
    {type: 'callDR', extra: 1}, {type: 'mode', agc: 'yes'}, {type: 'basePoint', station: 'nuclear', mw: 100},
    {type: 'restore', district: 'ZZZ9'}, {type: 'constructor'}, {type: 'toString'}, {type: '__proto__'}, {type: 'hasOwnProperty'},
    {type: 7}, {type: 'guard', mw: 100, toString: 1}];
  for (const input of bad) {
    const out = [];
    const r = applyInput(s, input, out);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.ok(r.reason.length > 0);
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, 'input');
    assert.equal(out[0].ok, false);
    assert.ok(out[0].type === null || typeof out[0].type === 'string', 'the record is plain JSON');
  }
  assert.equal(s.log.length, 0);
  assert.equal(hashState(s), h);
});

test('D-7: AGC/HAND is chosen at the briefing (before 04:30 and before any other input), then locked; logged as {tick, type, args}', () => {
  const s = createState(1, CLASSIC);
  assert.equal(applyInput(s, {type: 'mode', agc: false}).ok, true);
  assert.equal(s.control.mode, 'HAND');
  assert.equal(applyInput(s, {type: 'mode', agc: true}).ok, true);
  assert.equal(s.control.mode, 'AGC');
  assert.deepEqual(s.log, [{tick: 0, type: 'mode', args: {agc: false}}, {tick: 0, type: 'mode', args: {agc: true}}]);
  assert.equal(s.sec.dirty, true, 'an accepted input marks security dirty');
  s.tick = V.PLAYER_START_TICK - 1;
  assert.equal(applyInput(s, {type: 'mode', agc: false}).ok, true, 'still the briefing');
  s.tick = V.PLAYER_START_TICK;
  assert.match(applyInput(s, {type: 'mode', agc: true}).reason, /briefing/, 'the desk is open: too late');
  const t = createState(1, CLASSIC);
  t.control.modeLocked = true; // as after any other accepted input
  assert.match(applyInput(t, {type: 'mode', agc: false}).reason, /locked/);
});

test('K-15: every input is refused during the watch (the first 30 grid-s after a contingency)', () => {
  const s = createState(1, CLASSIC);
  s.conts.push({watchEndTick: 30 * TPS});
  s.contIdx = 0;
  assert.match(applyInput(s, {type: 'mode', agc: false}).reason, /watch/);
  s.tick = 30 * TPS;
  assert.equal(applyInput(s, {type: 'mode', agc: false}).ok, true);
});

test('H-12: nothing in sim/ multiplies unserved energy by a price or names VCR (the ALL-IN score prices it in app/score.js, Q-48)', () => {
  const bad = [];
  for (const f of jsFiles(fileURLToPath(new URL('../sim/', import.meta.url)))) {
    if (f.endsWith('params.js')) continue;
    const toks = tokenize(readFileSync(f, 'utf8'));
    toks.forEach((t, k) => {
      if (t.type !== 'ident') return;
      if (t.text === 'VCR') bad.push(f + ':' + t.line + ' uses VCR');
      if (/^unserved/.test(t.text) && ((toks[k - 1] && toks[k - 1].text === '*') || (toks[k + 1] && toks[k + 1].text === '*')))
        bad.push(f + ':' + t.line + ' multiplies ' + t.text);
    });
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ helpers for whole-sim runs

/**
 * Seeded fuzzer: random inputs of EVERY type at ANY tick from a private LCG (never the
 * sim's streams), plus a few inside each watch (they must be refused and change nothing).
 * watchS: extra contingency seconds (injected trips) whose watches get inputs too.
 */
function fuzzLog(seed, n, untilTick = V.DAY_TICKS, watchS = []) {
  let x = (seed * 2654435761) >>> 0;
  const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  const one = a => a[Math.floor(r() * a.length)];
  const s0 = createState(seed, CLASSIC);
  const districts = s0.city.districts.map(d => d.id);
  const make = {
    basePoint: () => ({station: one(V.STATION_IDS), mw: Math.floor(r() * 2700)}),
    start: () => ({unit: one(V.MACHINE_IDS)}),
    stop: () => ({unit: one(V.MACHINE_IDS)}),
    abortStop: () => ({unit: one(V.MACHINE_IDS)}),
    syncClose: () => (r() < 0.5 ? {unit: one(V.MACHINE_IDS)} : {unit: one(V.MACHINE_IDS), bypass: r() < 0.5}),
    battery: () => ({mode: one(['charge', 'idle', 'discharge']), mw: Math.floor(r() * 500)}),
    guard: () => ({mw: V.GUARD_STEP_MW * Math.floor(r() * 11)}),
    tie: () => ({mw: Math.floor(r() * 1601) - 800}),
    curtail: () => ({kind: one(['wind', 'solar']), limitPct: Math.floor(r() * 101)}),
    callDR: () => ({}), armRERT: () => ({}), standDownRERT: () => ({}), directShed: () => ({}),
    mode: () => ({agc: r() < 0.5}),
    restore: () => ({district: one(districts)}),
    // Phase 1a: the plan and the synchroscope (times from now-ish into the next hours; the
    // sim rewrites or refuses what cannot happen).
    planKey: () => ({station: one(V.STATION_IDS), atS: Math.floor(r() * 30000), mw: Math.floor(r() * 2700)}),
    planDel: () => ({station: one(V.STATION_IDS), atS: Math.floor(r() * 30000)}),
    planStart: () => ({unit: one(V.MACHINE_IDS), atS: Math.floor(r() * 30000)}),
    planStop: () => ({unit: one(V.MACHINE_IDS), atS: Math.floor(r() * 30000)}),
    planUnbook: () => ({unit: one(V.MACHINE_IDS)}),
    planRejoin: () => ({station: one(V.STATION_IDS), keep: r() < 0.5}),
    planLoad: () => {
      const from = Math.floor(r() * 20000), st = one(V.STATION_IDS);
      return {fromS: from, stations: {[st]: [[from + 300, Math.floor(r() * 1500)], [from + 900, Math.floor(r() * 1500)]]},
        tie: [[from + 600, Math.floor(r() * 1601) - 800]], starts: [[one(V.MACHINE_IDS), from + 60]], stops: []};
    },
    scope: () => ({unit: r() < 0.3 ? '' : one(V.MACHINE_IDS)}),
    syncTrim: () => ({unit: one(V.MACHINE_IDS), dHz: r() < 0.5 ? -V.SYNC_TRIM_HZ : V.SYNC_TRIM_HZ}),
    syncAuto: () => ({unit: one(V.MACHINE_IDS)}),
  };
  assert.deepEqual(Object.keys(make).sort(), [...INPUT_TYPES].sort(), 'the fuzzer covers every input type');
  const log = [];
  const add = tick => { const type = one(INPUT_TYPES); log.push({tick, type, args: make[type]()}); };
  for (let i = 0; i < n; i++) add(Math.floor(r() * untilTick));
  const conts = s0.ext.events.filter(e => e.contingency).map(e => e.atS).concat(watchS);
  for (const atS of conts) {
    if (atS * TPS >= untilTick) continue;
    for (let k = 0; k < 3; k++) add(atS * TPS + 1 + Math.floor(r() * (V.WATCH_S * TPS - 1)));
  }
  return log.sort((a, b) => a.tick - b.tick); // stable: equal ticks keep generation order
}

/** Step s up to untilTick feeding the log records whose tick has come; onStep after each step. */
function feed(s, log, untilTick, onStep) {
  let j = 0;
  while (j < log.length && log[j].tick < s.tick) j++;
  const batch = [];
  while (!s.over && s.tick < untilTick) {
    batch.length = 0;
    while (j < log.length && log[j].tick === s.tick) { batch.push({type: log[j].type, ...log[j].args}); j++; }
    step(s, batch);
    if (onStep) onStep(s);
  }
  return s;
}

/** A fresh day (optionally with a trip injected at tripAtS) fed a log; hashes every everyS. `scenario`: the classic day unless given. */
function play(seed, log, {untilTick = V.DAY_TICKS, everyS = 3600, tripAtS = -1, onStep, scenario = CLASSIC} = {}) {
  const s = createState(seed, scenario), hashes = [];
  if (tripAtS >= 0) injectTrip(s, tripAtS);
  feed(s, log, untilTick, st => {
    if (st.tick % (everyS * TPS) === 0) hashes.push(hashState(st));
    if (onStep) onStep(st);
  });
  return {s, hashes};
}

const TRIP_S = V.PLAYER_START_S + 60; // 04:31: an injected trip early in the day (budget)

// ------------------------------------------------------------------ whole sim

test('F-2: the same seed and input log give an identical hashState every sim-hour', () => {
  const until = ticksAt(6);
  for (const seed of [2]) { // one seed, the storm day (determinism needs one; F-2 / F-7 below plays seed 5)
    const log = fuzzLog(seed, 40, until, [TRIP_S]);
    const a = play(seed, log, {untilTick: until, tripAtS: TRIP_S}), b = play(seed, log, {untilTick: until, tripAtS: TRIP_S});
    assert.ok(a.hashes.length >= 2);
    assert.deepEqual(a.hashes, b.hashes, 'seed ' + seed);
    assert.equal(hashState(a.s), hashState(b.s));
  }
});

test('F-2 / F-7: a JSON round trip mid-day (inside a watch) resumes bit-identically: no hidden state outside state', () => {
  const until = ticksAt(5);
  const log = fuzzLog(5, 30, until, [TRIP_S]);
  const a = injectTrip(createState(5, CLASSIC), TRIP_S);
  feed(a, log, TRIP_S * TPS + 7 * TPS + 13); // mid-watch, mid-second
  const b = JSON.parse(JSON.stringify(a));
  feed(a, log, until);
  feed(b, log, until);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
  assert.equal(hashState(b), hashState(a));
});

test('F-2: no hidden module state: two seeds stepped interleaved, with observe/security/previewTrip calls, equal their solo runs', () => {
  const until = 120 * TPS;
  const mk = seed => injectTrip(createState(seed, CLASSIC), 60);
  const solo = seed => { const s = mk(seed); while (!s.over && s.tick < until) step(s); return JSON.stringify(s); };
  const a = mk(1), b = mk(2);
  while (!a.over && !b.over && a.tick < until) {
    step(a); step(b);
    if (a.tick % 7 === 0) {
      observe(b); observe(a, {dayAhead: true}); security(a);
      previewTrip(b, {kind: 'unit', id: 'coal2'}); previewTrip(a, {kind: 'link', id: 'tie'}, {guardMW: 300});
    }
  }
  assert.equal(JSON.stringify(a), solo(1));
  assert.equal(JSON.stringify(b), solo(2));
});

test('F-6: replay(seed, scenario, log) reproduces the scorecard and the final hash exactly; it throws on a foreign log', () => {
  const until = ticksAt(6);
  for (const seed of [1]) {
    const a = play(seed, fuzzLog(seed, 60, until), {untilTick: until}).s;
    assert.ok(a.log.length > 5, 'some fuzz inputs were accepted');
    const b = replay(seed, CLASSIC, a.log, {untilTick: until});
    assert.deepEqual(b.score, a.score);
    assert.deepEqual(b.log, a.log);
    assert.equal(hashState(b), hashState(a));
  }
  // A record the sim refuses on replay (restoring a district that is lit) means divergence.
  assert.throws(() => replay(1, CLASSIC, [{tick: 100, type: 'restore', args: {district: 'SOL3'}}], {untilTick: 200}), /refused/);
});

test('F-6: applyInput logs the canonical, applied args: -0 folded to 0, a basePoint clamped to the station range', () => {
  const s = createState(1, CLASSIC);
  assert.equal(applyInput(s, {type: 'tie', mw: -0}).ok, true);
  assert.ok(Object.is(s.log[0].args.mw, 0));
  assert.equal(applyInput(s, {type: 'basePoint', station: 'coal', mw: 99999}).ok, true);
  assert.deepEqual(s.log[1].args, {station: 'coal', mw: 4 * 650});
  assert.equal(s.stations.find(st => st.id === 'coal').basePointMW, 4 * 650, 'logged lever = delivered lever');
});

test('F-4 / D-6: rate invariance: one log played at 0.25x, 1x, 60x and 240x, and at 60x with pauses, gives an identical hash', () => {
  // Through the real loop (app/loop.js, F-5): each 60-Hz frame adds min(dt, 0.1) x rate grid-s
  // to the pacer's accumulator and runs whole ticks; inputs land on their logged ticks.
  // tests/loop.test.js covers the loop's own rules and a whole bench session.
  const until = ticksAt(4, 20), tripS = 300;
  const log = fuzzLog(4, 20, until, [tripS]);
  const runAt = (rate, pauseEvery = 0) => {
    const s = injectTrip(createState(4, CLASSIC), tripS), p = createPacer();
    let j = 0, frame = 0;
    const tick = () => {
      const batch = [];
      while (j < log.length && log[j].tick === s.tick) { batch.push({type: log[j].type, ...log[j].args}); j++; }
      step(s, batch);
    };
    while (!s.over && s.tick < until) {
      frame++;
      const r = pauseEvery && frame % pauseEvery < pauseEvery / 2 ? 0 : rate; // paused half the time
      runFrame(p, 1 / 60, {rate: () => (s.tick < until ? r : 0), tick, done: () => s.over || s.tick >= until});
    }
    return hashState(s);
  };
  const h = runAt(240);
  for (const rate of [60, 1, 0.25]) assert.equal(runAt(rate), h, rate + 'x');
  assert.equal(runAt(60, 97), h, '60x with pauses');
});

test('F-3: doNothing, competent, par and a fuzzer see identical demand, wind, solar and event timelines', () => {
  // One seed, the storm day (seed 2; the core test below takes the calm seed 1). Seed 2, because
  // to 05:30 on seed 1 par and competent play the same day (one input each, the same end hash),
  // so par's trace there would only be a copy of competent's (review fix).
  const until = ticksAt(5, 30);
  for (const seed of [2]) {
    const rows = [], ends = [];
    const row = st => [st.env.underlyingMW, st.env.demandMW, st.env.windAvailMW, st.env.solarAvailMW, st.evNext, st.news.length].join();
    const trace = run => { const out = []; ends.push(hashState(run(st => { if (st.tick % (60 * TPS) === 0) out.push(row(st)); }))); rows.push(out); };
    for (const proxy of ['doNothing', 'competent', 'par']) trace(onStep => runPar(seed, CLASSIC, {proxy, untilTick: until, onStep}).state);
    trace(onStep => play(seed, fuzzLog(seed, 50, until), {untilTick: until, onStep}).s);
    assert.equal(new Set(ends).size, ends.length, 'seed ' + seed + ': the policies must play differently');
    // A run that went black stops early; every pair must agree on their common prefix, and
    // at least one run must cover the whole window.
    const longest = rows.reduce((a, b) => (b.length > a.length ? b : a));
    assert.equal(longest.length, Math.floor(until / (60 * TPS)), 'seed ' + seed + ': every run ended early');
    for (const r of rows) assert.deepEqual(r, longest.slice(0, r.length), 'seed ' + seed);
  }
});

/**
 * A simple scripted operator (independent of sim/autopilot.js; it reads observe() only): the tie
 * to full import, the cheapest free machine started when the next hour's forecast net
 * demand exceeds 95% of what is committed, base points in merit order, and any dark
 * district the permissive allows restored. It need not be good: F-3 needs play that differs.
 */
function scriptedOperator(obs) {
  if (obs.inWatch || obs.tick < V.PLAYER_START_TICK) return [];
  const fc = obs.forecast, inputs = [], imp = V.TIE_MAX_MW;
  const dark = obs.districts.find(d => d.dark && d.restoreBlock === '');
  if (dark) inputs.push({type: 'restore', district: dark.id});
  if (!obs.tie.tripped && obs.tie.setMW !== imp) inputs.push({type: 'tie', mw: imp});
  const net = k => fc.demandP50[k] - fc.windMW[k] - fc.solarMW[k] - imp;
  const cap = obs.units.filter(u => u.mode !== 'off' && u.mode !== 'tripped').reduce((a, u) => a + 0.95 * u.availMW, 0);
  let peak = 0;
  for (let k = 0; k < 12; k++) peak = Math.max(peak, net(k));
  const free = obs.units.filter(u => u.mode === 'off' && u.startBlock === '').sort((a, b) => a.offer - b.offer || (a.id < b.id ? -1 : 1));
  if (free.length && peak > cap) inputs.push({type: 'start', unit: free[0].id});
  let rest = net(0);
  for (const st of obs.stations) rest -= st.minMW;
  for (const id of ['coal', 'ccgt', 'hydro', 'gta', 'gtb', 'gtc']) {
    const st = obs.stations.find(x => x.id === id);
    if (!st.onCount) continue;
    const add = Math.max(0, Math.min(0.95 * st.maxMW - st.minMW, rest));
    rest -= add;
    inputs.push({type: 'basePoint', station: id, mw: Math.round(st.minMW + add)});
  }
  return inputs;
}

/** A fresh day under a policy (obs -> inputs), asked every 5 grid-min (observe allocates). `scenario`: the classic day unless given. */
function runPolicy(seed, policy, untilTick, onStep, scenario = CLASSIC) {
  const s = createState(seed, scenario);
  let pending = [];
  while (!s.over && s.tick < untilTick) {
    step(s, pending);
    pending = s.tick % (300 * TPS) === 0 && !s.over ? policy(observe(s)) : [];
    if (onStep) onStep(s);
  }
  return s;
}

test('F-3 (core, without the autopilot): doNothing, a scripted operator and a fuzzer see identical demand, wind, solar and event timelines', () => {
  // One seed, the calm day (seed 1; the F-3 test above takes the storm seed 2).
  const until = ticksAt(6, 30);
  for (const seed of [1]) {
    const rows = [], ends = [];
    const row = st => [st.env.underlyingMW, st.env.demandMW, st.env.windAvailMW, st.env.solarAvailMW, st.env.heatActive, st.evNext,
      st.news.length, st.smelter.returnS].join();
    const trace = run => {
      const out = [];
      const s = run(st => { if (st.tick % (60 * TPS) === 0) out.push(row(st)); });
      rows.push(out);
      ends.push(hashState(s));
    };
    trace(onStep => play(seed, [], {untilTick: until, onStep}).s);                          // doNothing
    trace(onStep => runPolicy(seed, scriptedOperator, until, onStep));                      // a scripted operator
    trace(onStep => play(seed, fuzzLog(seed, 50, until), {untilTick: until, onStep}).s);    // a fuzzer
    assert.equal(new Set(ends).size, ends.length, 'seed ' + seed + ': the three policies must play differently');
    const longest = rows.reduce((a, b) => (b.length > a.length ? b : a));
    assert.equal(longest.length, Math.floor(until / (60 * TPS)), 'seed ' + seed + ': every run ended early');
    for (const r of rows) assert.deepEqual(r, longest.slice(0, r.length), 'seed ' + seed);
  }
});

test('F-3 (Phase 2a, the game\'s day): the same three policies see identical underlying demand, rooftop PV (suburb by suburb), operational demand and events on DESK and DESK_WEEKEND', () => {
  // 04:00 to 06:45: half an hour of sun (sunrise 06:12; budget, F-10). The no-input belly itself is
  // the grid job's and stage C's to carry through noon; the ext timelines do not depend on it.
  const until = ticksAt(6, 45);
  for (const [scenario, seeds] of [[DESK, [1]], [DESK_WEEKEND, [2]]]) {
    for (const seed of seeds) {
      const rows = [], ends = [];
      const row = st => [st.env.underlyingMW, st.env.rooftopMW, st.env.roofSubMW.join('/'), st.env.roofClearFrac.join('/'), st.env.demandMW,
        st.env.tempC, st.env.windAvailMW, st.env.solarAvailMW, st.env.heatActive, st.evNext, st.news.length, st.smelter.returnS,
        st.day.temp, st.day.weekend].join();
      const trace = run => {
        const out = [];
        const s = run(st => { if (st.tick % (60 * TPS) === 0) out.push(row(st)); });
        rows.push(out);
        ends.push(hashState(s));
        return s;
      };
      const quiet = trace(onStep => play(seed, [], {untilTick: until, onStep, scenario}).s);
      trace(onStep => runPolicy(seed, scriptedOperator, until, onStep, scenario));
      trace(onStep => play(seed, fuzzLog(seed, 50, until), {untilTick: until, onStep, scenario}).s);
      const tag = scenario.id + ' seed ' + seed;
      assert.equal(new Set(ends).size, ends.length, tag + ': the three policies must play differently');
      const longest = rows.reduce((a, b) => (b.length > a.length ? b : a));
      assert.equal(longest.length, Math.floor(until / (60 * TPS)), tag + ': every run ended early');
      for (const r of rows) assert.deepEqual(r, longest.slice(0, r.length), tag);
      if (!quiet.over) assert.ok(quiet.env.rooftopMW > 100, tag + ': the sun is on the roofs by 06:45 (' + quiet.env.rooftopMW + ' MW)');
    }
  }
});

test('K-15 through step(): inputs of every type during a watch are refused, never logged and change nothing; the lock lifts at watchEndTick', () => {
  const mk = () => injectTrip(withoutContingencies(createState(2, CLASSIC)), TRIP_S);
  const a = mk(), b = mk();
  while (a.tick <= TRIP_S * TPS) { step(a); step(b); }
  assert.equal(a.contIdx, 0, 'the injected trip opened a contingency');
  const endTick = a.conts[0].watchEndTick;
  assert.equal(endTick, TRIP_S * TPS + V.WATCH_S * TPS);
  const tries = [{type: 'basePoint', station: 'coal', mw: 1000}, {type: 'start', unit: 'gta1'}, {type: 'stop', unit: 'coal2'},
    {type: 'abortStop', unit: 'coal2'}, {type: 'syncClose', unit: 'gtc1'}, {type: 'battery', mode: 'discharge', mw: 300},
    {type: 'guard', mw: 300}, {type: 'tie', mw: 800}, {type: 'curtail', kind: 'solar', limitPct: 50}, {type: 'callDR'},
    {type: 'armRERT'}, {type: 'standDownRERT'}, {type: 'mode', agc: false}, {type: 'restore', district: 'SOL3'}, {type: 'directShed'},
    {type: 'planKey', station: 'gta', atS: TRIP_S + 900, mw: 400}, {type: 'planDel', station: 'coal', atS: TRIP_S + 600},
    {type: 'planStart', unit: 'gtb1', atS: TRIP_S + 600}, {type: 'planStop', unit: 'ccgt1', atS: TRIP_S + 7200},
    {type: 'planUnbook', unit: 'gtb1'}, {type: 'planRejoin', station: 'coal', keep: true},
    {type: 'planLoad', fromS: TRIP_S + 60, stations: {coal: [[TRIP_S + 600, 1800]]}, tie: [], starts: [], stops: []},
    {type: 'scope', unit: 'gtc1'}, {type: 'syncTrim', unit: 'gtc1', dHz: V.SYNC_TRIM_HZ}, {type: 'syncAuto', unit: 'gtc1'}];
  assert.deepEqual(tries.map(x => x.type).sort(), [...INPUT_TYPES].sort(), 'every input type is tried');
  let refused = 0;
  while (a.tick < endTick) {
    const ev = step(a, a.tick % 97 === 0 ? tries : EMPTY_INPUTS);
    step(b);
    for (const e of ev) if (e.kind === 'input') { assert.match(e.reason, /watch/); refused++; }
  }
  assert.ok(refused >= tries.length * 10, 'refused ' + refused);
  assert.equal(a.log.length, 0);
  assert.equal(hashState(a), hashState(b), 'refused inputs changed nothing');
  assert.equal(applyInput(a, {type: 'guard', mw: 300}).ok, true, 'the desk unlocks at watchEndTick');
});

test('F-4: after a trip, no unit\'s scheduled output rises faster than its ramp per grid second', () => {
  const s = injectTrip(createState(3, CLASSIC), TRIP_S);
  const prev = s.units.map(u => u.schedMW);
  let tripped = false;
  while (!s.over && s.tick < (TRIP_S + 600) * TPS) {
    if (step(s).some(e => e.kind === 'contingency')) tripped = true;
    if (s.tick % TPS !== 1) continue;
    s.units.forEach((u, i) => {
      if (u.mode === 'on') assert.ok(u.schedMW - prev[i] <= V.MACHINES[i].rampMWs + 1e-6, u.id + ' jumped ' + (u.schedMW - prev[i]));
      prev[i] = u.schedMW;
    });
  }
  assert.ok(tripped, 'the injected trip happened');
});

test('H-1 (a, c): STOP one coal machine at 04:10 with nobody responding: small steps, first UFLS >= 60 min later', () => {
  const s = createState(3, CLASSIC);
  const stopAt = ticksAt(4, 10);
  let prev = s.units[0].outMW, maxStep = 0, uflsAt = -1;
  while (!s.over && s.tick < ticksAt(7)) {
    const ev = step(s, s.tick === stopAt ? [{type: 'stop', unit: 'coal1'}] : undefined);
    maxStep = Math.max(maxStep, prev - s.units[0].outMW);
    prev = s.units[0].outMW;
    if (uflsAt < 0 && ev.some(e => e.kind === 'ufls')) uflsAt = s.tick;
  }
  const m = V.MACHINES[0];
  if (!s.black) assert.equal(s.units[0].mode, 'off', 'the stop completed (unload + T4) by 07:00');
  assert.ok(maxStep <= m.breakerOpenMW + m.rampMWs * V.PHYS_DT + 1, 'max step ' + maxStep);
  assert.ok(uflsAt < 0 || uflsAt - stopAt >= 60 * 60 * TPS, 'first UFLS ' + (uflsAt - stopAt) / TPS + ' s after the STOP');
});

test('H-1 (b): STOP one coal machine at 04:10 with the competent proxy responding: no UFLS and no blackout through 08:00', () => {
  const s = createState(3, CLASSIC);
  while (!s.over && s.tick < ticksAt(4, 10)) step(s);
  step(s, [{type: 'stop', unit: 'coal1'}]);
  let ufls = false;
  const r = runPar(3, CLASSIC, {proxy: 'competent', state: s, untilTick: ticksAt(8), onStep: st => {
    if (st.ufls.operated.some(Boolean)) ufls = true;
  }});
  assert.equal(ufls, false, 'UFLS operated');
  assert.equal(r.black, false);
});

test('K-2 / L-8: AGC on, the L-0 plan, no other input: >= 97% of ticks in 49.85-50.15 Hz on event-free days', () => {
  // Event-free: no optional events and no contingencies, so the series have no event-driven
  // shifts; the plan (planOnly) moves the base points and AGC trims around them.
  const scn = calmScenario();
  for (const seed of [1, 2]) {
    let inBand = 0, n = 0;
    runPar(seed, scn, {proxy: 'planOnly', state: withoutContingencies(createState(seed, scn)),
      untilTick: ticksAt(7), onStep: st => {
        if (st.tick <= V.PLAYER_START_TICK) return;
        n++;
        if (st.phys.fHz >= V.NORMAL_LO_HZ && st.phys.fHz <= V.NORMAL_HI_HZ) inBand++;
      }});
    assert.ok(n > 0 && inBand / n >= 0.97, 'seed ' + seed + ': ' + (100 * inBand / n).toFixed(1) + '% in band');
  }
});

test('K-10 through step(): a preview taken at a second boundary matches the real nadir within 0.02 Hz (AGC and ramps running)', () => {
  for (const seed of [4, 5]) {
    const s = withoutContingencies(createState(seed, CLASSIC));
    while (!s.over && s.tick < TRIP_S * TPS) step(s);
    // The injected 'largest' trip hits the largest online machine by output (lowest index on a tie).
    let big = null;
    for (const u of s.units) if (u.sync && (big === null || u.outMW > big.outMW)) big = u;
    const p = previewTrip(s, {kind: 'unit', id: big.id});
    injectTrip(s, TRIP_S);
    let minHz = Infinity;
    while (!s.over && s.tick < (TRIP_S + V.PREVIEW_HORIZON_S) * TPS) { step(s); minHz = Math.min(minHz, s.phys.fHz); }
    assert.equal(s.conts[s.contIdx].id, big.id);
    assert.ok(Math.abs(minHz - p.nadirHz) <= 0.02, 'seed ' + seed + ': real ' + minHz.toFixed(4) + ' preview ' + p.nadirHz.toFixed(4));
  }
  // A-2 (Phase 1a): the other credible contingency, the tie import, previews its real nadir too
  // (N-1 over both; the sim's sec.previewLinkHz is this preview).
  for (const seed of [4, 5]) {
    const s = withoutContingencies(createState(seed, CLASSIC));
    s.tie.setMW = 700; // test poke: a large import, reached at the tie ramp before the trip
    while (!s.over && s.tick < TRIP_S * TPS) step(s);
    assert.ok(s.tie.flowMW > 300, 'importing ' + s.tie.flowMW);
    const p = previewTrip(s, {kind: 'link', id: 'tie'});
    injectTrip(s, TRIP_S, 'link');
    let minHz = Infinity;
    while (!s.over && s.tick < (TRIP_S + V.PREVIEW_HORIZON_S) * TPS) { step(s); minHz = Math.min(minHz, s.phys.fHz); }
    assert.equal(s.conts[s.contIdx].cause, 'link');
    assert.ok(Math.abs(minHz - p.nadirHz) <= 0.02, 'seed ' + seed + ' link: real ' + minHz.toFixed(4) + ' preview ' + p.nadirHz.toFixed(4));
  }
});

test('S-1: observe().score.unservedMWh equals the integral of shed MW over settled seconds', () => {
  const s = createState(2, CLASSIC);
  const inputs = new Map([[ticksAt(4, 30), [{type: 'directShed'}]], [ticksAt(4, 31), [{type: 'directShed'}]],
    [ticksAt(4, 50), [{type: 'restore', district: 'SOL3'}]]]);
  const end = ticksAt(5, 30);
  let integral = 0;
  for (;;) {
    const x = inputs.get(s.tick);
    if (x && x[0].type === 'directShed') s.sec.level = 'SHORT'; // A-3: the key needs a shortfall (test poke of the gauge)
    step(s, x);
    if (s.over) { integral += s.phys.shedMW * V.PHYS_DT / 3600; break; } // finish() settled this tick too
    if (s.tick % TPS === 1 && s.tick > end) break; // the tick just run is in acc, not yet settled
    integral += s.phys.shedMW * V.PHYS_DT / 3600;
  }
  assert.ok(integral > 0, 'the test must shed something');
  assert.ok(Math.abs(observe(s).score.unservedMWh - integral) < 1e-6, observe(s).score.unservedMWh + ' vs ' + integral);
});

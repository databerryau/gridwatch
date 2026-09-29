// Stage B owner "integration": whole-sim acceptance through step() (F-2, F-3, F-4, F-6, F-7,
// D-6, D-7, H-1, H-8 containment, K-2, K-10, K-15, S-1). Input-vocabulary tests run now.
//
// Budget (F-10, README §10): the default run of this file steps ~8 M ticks (~5 s at the
// 1.6 s/day target). Whole days over many seeds run only with GRIDWATCH_SLOW=1.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createState, step, applyInput, observe, hashState, replay, INPUT_TYPES} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {previewTrip} from '../sim/physics.js';
import {security} from '../sim/grid.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {tokenize, jsFiles} from './lib/js-tokens.js';
import {ticksAt, SLOW, slowOnly, calmScenario, withoutContingencies, injectTrip, clone} from './lib/sim-helpers.js';

const TODO = {todo: 'stage B: integration (needs every sim module)'};
const TPS = V.TICKS_PER_S;
const SEEDS = n => Array.from({length: n}, (_, i) => i + 1);

// ------------------------------------------------------------------ inputs: real now

test('F-6: the input vocabulary', () => {
  assert.deepEqual([...INPUT_TYPES].sort(), ['abortStop', 'armRERT', 'basePoint', 'battery', 'callDR', 'curtail', 'directShed',
    'guard', 'mode', 'restore', 'standDownRERT', 'start', 'stop', 'syncClose', 'tie'].sort());
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

test('H-12: nothing in sim/ multiplies unserved energy by a price, and VCR is debrief-only', () => {
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
    syncClose: () => ({unit: one(V.MACHINE_IDS)}),
    battery: () => ({mode: one(['charge', 'idle', 'discharge']), mw: Math.floor(r() * 500)}),
    guard: () => ({mw: V.GUARD_STEP_MW * Math.floor(r() * 11)}),
    tie: () => ({mw: Math.floor(r() * 1601) - 800}),
    curtail: () => ({kind: one(['wind', 'solar']), limitPct: Math.floor(r() * 101)}),
    callDR: () => ({}), armRERT: () => ({}), standDownRERT: () => ({}), directShed: () => ({}),
    mode: () => ({agc: r() < 0.5}),
    restore: () => ({district: one(districts)}),
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

/** A fresh day (optionally with a trip injected at tripAtS) fed a log; hashes every everyS. */
function play(seed, log, {untilTick = V.DAY_TICKS, everyS = 3600, tripAtS = -1, onStep} = {}) {
  const s = createState(seed, CLASSIC), hashes = [];
  if (tripAtS >= 0) injectTrip(s, tripAtS);
  feed(s, log, untilTick, st => {
    if (st.tick % (everyS * TPS) === 0) hashes.push(hashState(st));
    if (onStep) onStep(st);
  });
  return {s, hashes};
}

const TRIP_S = V.PLAYER_START_S + 60; // 04:31: an injected trip early in the day (budget)

// ------------------------------------------------------------------ whole sim: todo

test('F-2: the same seed and input log give an identical hashState every sim-hour (100 whole days with GRIDWATCH_SLOW=1)', TODO, () => {
  const until = SLOW ? V.DAY_TICKS : ticksAt(6);
  for (const seed of SLOW ? SEEDS(100) : [1, 2]) {
    const log = fuzzLog(seed, 40, until, [TRIP_S]);
    const a = play(seed, log, {untilTick: until, tripAtS: TRIP_S}), b = play(seed, log, {untilTick: until, tripAtS: TRIP_S});
    assert.ok(a.hashes.length >= 2);
    assert.deepEqual(a.hashes, b.hashes, 'seed ' + seed);
    assert.equal(hashState(a.s), hashState(b.s));
  }
});

test('F-2 / F-7: a JSON round trip mid-day (inside a watch) resumes bit-identically: no hidden state outside state', TODO, () => {
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

test('F-2: no hidden module state: two seeds stepped interleaved, with observe/security/previewTrip calls, equal their solo runs', TODO, () => {
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

test('F-6: replay(seed, scenario, log) reproduces the scorecard and the final hash exactly; it throws on a foreign log', TODO, () => {
  const until = SLOW ? V.DAY_TICKS : ticksAt(6);
  for (const seed of SLOW ? [1, 2, 3] : [1]) {
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

test('F-6: applyInput logs the canonical, applied args: -0 folded to 0, a basePoint clamped to the station range', TODO, () => {
  const s = createState(1, CLASSIC);
  assert.equal(applyInput(s, {type: 'tie', mw: -0}).ok, true);
  assert.ok(Object.is(s.log[0].args.mw, 0));
  assert.equal(applyInput(s, {type: 'basePoint', station: 'coal', mw: 99999}).ok, true);
  assert.deepEqual(s.log[1].args, {station: 'coal', mw: 4 * 650});
  assert.equal(s.stations.find(st => st.id === 'coal').basePointMW, 4 * 650, 'logged lever = delivered lever');
});

test('F-4 / D-6: rate invariance: one log played at 0.25x, 1x, 60x and 240x, and at 60x with pauses, gives an identical hash', TODO, () => {
  // Stand-in for app/loop.js (F-5): each 60-Hz frame adds min(dt, 0.1) x rate grid-s to an
  // accumulator and runs whole ticks; inputs land on their logged ticks. Replace with the
  // real loop once app/loop.js exists.
  const until = ticksAt(4, 20), tripS = 300;
  const log = fuzzLog(4, 20, until, [tripS]);
  const runAt = (rate, pauseEvery = 0) => {
    const s = injectTrip(createState(4, CLASSIC), tripS);
    let acc = 0, j = 0, frame = 0;
    while (!s.over && s.tick < until) {
      frame++;
      const r = pauseEvery && frame % pauseEvery < pauseEvery / 2 ? 0 : rate; // paused half the time
      acc += Math.min(1 / 60, 0.1) * r;
      while (acc >= V.PHYS_DT && s.tick < until) {
        acc -= V.PHYS_DT;
        const batch = [];
        while (j < log.length && log[j].tick === s.tick) { batch.push({type: log[j].type, ...log[j].args}); j++; }
        step(s, batch);
      }
    }
    return hashState(s);
  };
  const h = runAt(240);
  for (const rate of [60, 1, 0.25]) assert.equal(runAt(rate), h, rate + 'x');
  assert.equal(runAt(60, 97), h, '60x with pauses');
});

test('F-3: doNothing, competent, par and a fuzzer see identical demand, wind, solar and event timelines', TODO, () => {
  const until = SLOW ? V.DAY_TICKS : ticksAt(5, 30);
  for (const seed of SLOW ? SEEDS(100) : [1, 2]) {
    const rows = [];
    const row = st => [st.env.underlyingMW, st.env.demandMW, st.env.windAvailMW, st.env.solarAvailMW, st.evNext, st.news.length].join();
    const trace = run => { const out = []; run(st => { if (st.tick % (60 * TPS) === 0) out.push(row(st)); }); rows.push(out); };
    for (const proxy of ['doNothing', 'competent', 'par']) trace(onStep => runPar(seed, CLASSIC, {proxy, untilTick: until, onStep}));
    trace(onStep => play(seed, fuzzLog(seed, 50, until), {untilTick: until, onStep}));
    // A run that went black stops early; every pair must agree on their common prefix, and
    // at least one run must cover the whole window.
    const longest = rows.reduce((a, b) => (b.length > a.length ? b : a));
    assert.equal(longest.length, Math.floor(until / (60 * TPS)), 'seed ' + seed + ': every run ended early');
    for (const r of rows) assert.deepEqual(r, longest.slice(0, r.length), 'seed ' + seed);
  }
});

test('F-4: after a trip, no unit\'s scheduled output rises faster than its ramp per grid second', TODO, () => {
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

test('H-1 (a, c): STOP one coal machine at 04:10 with nobody responding: small steps, first UFLS >= 60 min later', TODO, () => {
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

test('H-1 (b): STOP one coal machine at 04:10 with the competent proxy responding: no UFLS and no blackout through 08:00', TODO, () => {
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

test('K-2 / L-8: AGC on, the L-0 plan, no other input: >= 97% of ticks in 49.85-50.15 Hz on event-free days', TODO, () => {
  // Event-free: no optional events and no contingencies, so the series have no event-driven
  // shifts; the plan (planOnly) moves the base points and AGC trims around them.
  const scn = calmScenario();
  for (const seed of SLOW ? SEEDS(10) : [1, 2]) {
    let inBand = 0, n = 0;
    runPar(seed, scn, {proxy: 'planOnly', state: withoutContingencies(createState(seed, scn)),
      untilTick: SLOW ? V.DAY_TICKS : ticksAt(7), onStep: st => {
        if (st.tick <= V.PLAYER_START_TICK) return;
        n++;
        if (st.phys.fHz >= V.NORMAL_LO_HZ && st.phys.fHz <= V.NORMAL_HI_HZ) inBand++;
      }});
    assert.ok(n > 0 && inBand / n >= 0.97, 'seed ' + seed + ': ' + (100 * inBand / n).toFixed(1) + '% in band');
  }
});

test('K-10 through step(): a preview taken at a second boundary matches the real nadir within 0.02 Hz (AGC and ramps running)', TODO, () => {
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
});

test('H-8: containment: from 1,000 sampled SECURE states (fresh preview), losing L keeps the nadir >= 49.5 Hz', {...TODO, ...slowOnly()}, () => {
  // Sample par days: at most one state per 20 grid-minutes, only where the preview was
  // refreshed that very second (sec.previewAtS === s) and the level is SECURE. Each probe is
  // a JSON copy with its future contingencies removed and L tripped at the next second.
  const want = 1000, failures = [];
  let checked = 0;
  for (let seed = 1; checked < want && seed <= 80; seed++) {
    let nextS = V.PLAYER_START_S;
    runPar(seed, CLASSIC, {onStep: st => {
      if (checked >= want || st.tick % TPS !== 1) return;
      const sec = Math.floor(st.tick / TPS);
      if (sec < nextS || st.over || st.sec.level !== 'SECURE' || st.sec.previewAtS !== sec) return;
      nextS = sec + 1200;
      const probe = clone(st);
      probe.ext.events = probe.ext.events.filter((e, i) => i < probe.evNext || !e.contingency);
      injectTrip(probe, sec + 1, probe.sec.lKind === 'link' ? 'link' : 'unit');
      let minHz = Infinity;
      while (!probe.over && probe.tick < (sec + 1 + V.WATCH_S) * TPS) { step(probe); minHz = Math.min(minHz, probe.phys.fHz); }
      if (minHz < V.CONTAIN_LO_HZ) failures.push('seed ' + seed + ' s ' + sec + ': ' + minHz.toFixed(3));
      checked++;
    }});
  }
  assert.equal(checked, want, 'only ' + checked + ' SECURE states sampled');
  assert.deepEqual(failures, []);
});

test('S-1: observe().score.unservedMWh equals the integral of shed MW over settled seconds', TODO, () => {
  const s = createState(2, CLASSIC);
  const inputs = new Map([[ticksAt(4, 30), [{type: 'directShed'}]], [ticksAt(4, 31), [{type: 'directShed'}]],
    [ticksAt(4, 50), [{type: 'restore', district: 'SOL3'}]]]);
  const end = ticksAt(5, 30);
  let integral = 0;
  for (;;) {
    step(s, inputs.get(s.tick));
    if (s.over) { integral += s.phys.shedMW * V.PHYS_DT / 3600; break; } // finish() settled this tick too
    if (s.tick % TPS === 1 && s.tick > end) break; // the tick just run is in acc, not yet settled
    integral += s.phys.shedMW * V.PHYS_DT / 3600;
  }
  assert.ok(integral > 0, 'the test must shed something');
  assert.ok(Math.abs(observe(s).score.unservedMWh - integral) < 1e-6, observe(s).score.unservedMWh + ' vs ' + integral);
});

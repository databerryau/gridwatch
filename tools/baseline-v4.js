// GRIDWATCH v4 baseline: prints the SPEC.md §6 rows that are measurable on the v4 core
// (Exit Phase 0: "tools/baseline.js --v4 prints the §6 rows for the v4 core"; the legacy
// tools/baseline.js and its golden stay as they are, F-12). Not loaded by the game.
// CommonJS (tools/package.json); the ES-module sim is loaded with await import().
//
//   node tools/baseline-v4.js                 # the full report (golden: tools/baseline-v4.golden.md)
//   node tools/baseline-v4.js --quick         # section 1 plus par on seeds 1-2 (tests/baseline-v4.test.js)
//   node tools/baseline-v4.js --out FILE      # write the report to FILE (UTF-8) instead of stdout
//   npm run golden:v4                         # re-record the golden (an intentional behaviour change)
//
// Flags: --seeds A-B (raw par seeds, default 1-200) | --heat N (first N forced-heat seeds,
// default 100) | --graded N (lean, competent, planOnly and commitAll on seeds 1-N, graded
// against par: S-5, S-2's correlation, S-11; default 100) | --f3 N (doNothing and a fuzzer
// beside par on seeds 1-N, default 10) | -j/--workers N (default: logical CPUs - 1) | --quick.
//
// Sections: 1 = fixed probes (independent of the seed range), 2 = statistics over the seed
// range, 3 = one row per seed and proxy, 4 = build and machine-dependent lines. Everything
// except section 4 and the Build/Command lines is deterministic for a given build and flags;
// every section 3 row depends only on its seed, so a short run's rows equal the full run's.
// This is a measurement tool: it may read state.ext (the regime, the event list) and poke
// state copies (inject a trip, hold a frequency), as the tests do; par never sees either.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const {fork} = require('child_process');
const {pathToFileURL} = require('url');
const {grade} = require('./par.js');

const ROOT = path.join(__dirname, '..');
const load = rel => import(pathToFileURL(path.join(ROOT, rel)).href);

// Measurement choices (not model constants; the sim's own values come from V).
const HEAT_SHARE_SEEDS = 2000;       // S-10: "15 +- 2% of 2,000 dates"
const D8_SEEDS = 100;                // D-8 row: days with unwarned contingencies < 60 real s apart
const D8_GAP_REAL_S = 60;
const HOT_TRIPS_WANT = 100;          // H-2: n >= 100
const HOT_COOL_EVERY = 4;            // every 4th machine held cool (90%) as the control
const HOT_COOL_FRAC = 0.9;
const PROBE_EVERY_S = 900;           // H-8 containment probe: at most one SECURE state per 15 grid-min
const PROBE_RETRY_S = 60;            // re-check a candidate whose fresh preview was not SECURE after 1 grid-min
const RATES = [0.25, 1, 60, 240];    // F-4
const FRAME_S = 1 / 60;
const GRADED_PROXIES = ['lean', 'competent', 'planOnly', 'commitAll'];
const MIDDAY_SOLAR_MW = 1300;        // H-7 desk-lab midday case: utility solar at noon (of 1,400 MW)
const MIDDAY_WIND_MW = 900;
const MIDDAY_TIE_MW = 600;
const MIDDAY_RUN_S = 60;
const EVENING_H = 18.5;              // H-5 evening probe (the review's 18:30)
const F3_PROXIES = ['doNothing', 'fuzz'];

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const o = {seeds: [1, 200], heat: 100, graded: 100, f3: 10, workers: Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1),
    quick: false, out: null, worker: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--seeds') { const [x, y] = next().split('-').map(Number); o.seeds = [x, y === undefined ? x : y]; }
    else if (a === '--heat') o.heat = parseInt(next(), 10);
    else if (a === '--graded') o.graded = parseInt(next(), 10);
    else if (a === '--f3') o.f3 = parseInt(next(), 10);
    else if (a === '-j' || a === '--workers') o.workers = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--quick') Object.assign(o, {quick: true, seeds: [1, 2], heat: 0, graded: 0, f3: 0, workers: 1});
    else if (a === '--out') o.out = next();
    else if (a === '--worker') o.worker = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 21).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  if (!(o.seeds[0] >= 1 && o.seeds[1] >= o.seeds[0])) throw new Error('--seeds A-B with 1 <= A <= B');
  return o;
}

// ---------------------------------------------------------------- formatting
const fix = (x, d) => { const s = x.toFixed(d); return /^-0\.?0*$/.test(s) ? s.slice(1) : s; };
const commas = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const sfix = (x, d) => fix(x, d).replace(/^-/, '−');
/** x with d decimals and thousands separators (1234.5, 1 -> '1,234.5'). */
const num = (x, d) => { const [i, f] = sfix(x, d).split('.'); return commas(i) + (f ? '.' + f : ''); };
const days = n => n + (n === 1 ? ' day' : ' days');
const int = x => { const s = fix(x, 0); return s[0] === '-' ? '−' + commas(s.slice(1)) : commas(s); };
const usd = x => (x < 0 ? '−$' : '$') + commas(fix(Math.abs(x), 0));
const pct = (k, n) => (n ? fix(100 * k / n, 1) + '%' : '-');
const hex = h => '0x' + (h >>> 0).toString(16).padStart(8, '0');
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
/** Pearson correlation of two equal-length lists (NaN if either has no spread). */
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
const signed = (x, d) => (Number.isNaN(x) ? '-' : (x >= 0 ? '+' : '−') + fix(Math.abs(x), d));
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
/** 32-bit FNV-1a of a string (F-3 traces: one number per sampled minute). */
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// ---------------------------------------------------------------- the sim
async function sim() {
  const [step, params, scen, autopilot, physics, grid, market, weather, events, fleet, helpers, loop, assist] = await Promise.all([
    load('sim/step.js'), load('sim/params.js'), load('content/scenarios.js'), load('sim/autopilot.js'), load('sim/physics.js'),
    load('sim/grid.js'), load('sim/market.js'), load('sim/weather.js'), load('sim/events.js'), load('sim/fleet.js'),
    load('tests/lib/sim-helpers.js'), load('app/loop.js'), load('app/assist.js')]);
  return {step, V: params.V, SIM_VERSION: params.SIM_VERSION, CLASSIC: scen.CLASSIC, autopilot, physics, grid, market, weather, events,
    fleet, H: helpers, loop, assist};
}

const hhmm = (V, s) => {
  const m = Math.floor(s / V.S_PER_MIN) + V.DAY_START_H * V.S_PER_MIN;
  return String(Math.floor(m / V.S_PER_MIN) % V.DAY_H).padStart(2, '0') + ':' + String(m % V.S_PER_MIN).padStart(2, '0');
};

// One sampled minute for F-3: the external world as every player must see it.
const envRow = st => fnv([st.env.underlyingMW, st.env.demandMW, st.env.windAvailMW, st.env.solarAvailMW, st.env.heatActive, st.evNext,
  st.news.length, st.smelter.returnS].join());

// ---------------------------------------------------------------- one par day (section 3.1 / 3.2)
/**
 * Par's day, through par's own harness as the bench runs it (app/assist.js: the same steps as
 * autopilot.runPar; section 1 checks the two agree), so the step() records are seen: the
 * SECURITY alarm lines (H-4). Also samples SECURE states and probes each one
 * by tripping L in a copy (H-8 containment, as tests/integration.test.js), the price, the
 * battery's energy at the spot price (P-10) and the F-3 trace.
 */
function parDay(S, seed, o) {
  const {V} = S, {createState, step, observe, hashState} = S.step;
  const TPS = V.TICKS_PER_S, F0 = V.F0_HZ;
  const t0 = process.hrtime.bigint();
  const state = createState(seed, S.CLASSIC);
  const a = S.assist.createAssist('par');
  const noPreview = {previewNadirHz: F0};
  const T19 = (19 - V.DAY_START_H) * V.S_PER_H * TPS + 1; // just after the 19:00:00 grid update
  let alarm = state.sec.level, alarmDiff = 0, negS = 0, p19 = null;
  let chMWh = 0, chCost = 0, chOrderMWh = 0, chOrderCost = 0, disMWh = 0, rev = 0, shortMin = 0;
  let nextProbe = V.PLAYER_START_S, probes = 0, fails = 0, worst = Infinity, fresh = 0, live = 0;
  let otherN = 0, otherFails = 0, otherWorst = Infinity;
  // Legacy §3.2 optimistic bound, on the v4 fleet: every machine not in protection lockout at
  // its (heat-derated) availability, tie 800 MW unless tripped, battery, diesel and DR all at
  // once with no energy limit, plus the wind and solar available, against demand.
  const fixedMW = V.BATT_MW + V.RERT_MW + V.DR_MW;
  const trace = o.trace ? [] : null;
  while (!state.over) {
    const inputs = S.assist.assistInputs(a, state);
    if (a.error) throw new Error('seed ' + seed + ': ' + a.error);
    const recs = step(state, inputs);
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.kind === 'log' && r.code === 'SECURITY') alarm = r.msg.split(' ')[1].replace(':', '');
    }
    if (state.sec.level !== alarm) alarmDiff++;
    const t = state.tick;
    if (t === T19) p19 = state.price.mwh;
    if (t % TPS !== 0 || state.over) continue;
    // A completed second: acc holds all of it and state.price is its price.
    const p = state.price.mwh, acc = state.acc;
    const ch = acc.battChargeMWs / V.S_PER_H, dis = (acc.battOutMWs + acc.battChargeMWs) / V.S_PER_H;
    chMWh += ch; chCost += p * ch; disMWh += dis; rev += p * acc.battOutMWs / V.S_PER_H;
    if (state.battery.mode === 'charge') { chOrderMWh += ch; chOrderCost += p * ch; }
    if (p < 0) negS++;
    if (t % (V.S_PER_MIN * TPS) === 0) {
      if (trace) trace.push(envRow(state));
      const e = state.env;
      let bound = fixedMW + e.windAvailMW + e.solarAvailMW + (state.tie.tripped ? 0 : V.TIE_MAX_MW);
      for (const u of state.units) if (u.mode !== 'tripped') bound += u.availMW;
      if (bound < e.demandMW) shortMin++;
    }
    if (!o.probe) continue;
    const sec = t / TPS;
    if (sec < nextProbe || state.sec.lKind === 'none') continue;
    const isLive = state.sec.level === 'SECURE';
    const fr = isLive || S.grid.security(state, noPreview).level === 'SECURE' ? S.grid.security(state) : null;
    const isFresh = fr !== null && fr.level === 'SECURE';
    if (!isFresh && !isLive) { nextProbe = sec + PROBE_RETRY_S; continue; }
    nextProbe = sec + PROBE_EVERY_S;
    // Trip the L each SECURE judgement previewed: the fresh L, and the cached L the desk showed
    // (they differ only when a unit and the tie import are within a few MW, so L changed kind).
    const kinds = [];
    if (isFresh) kinds.push(fr.lKind);
    if (isLive && !kinds.includes(state.sec.lKind)) kinds.push(state.sec.lKind);
    let minHz = Infinity;
    for (const k of kinds) minHz = Math.min(minHz, probeTrip(S, state, sec, k));
    probes++;
    if (isFresh) fresh++;
    if (isLive) live++;
    if (minHz < V.CONTAIN_LO_HZ) fails++;
    if (minHz < worst) worst = minHz;
    // The other credible contingency, which H-4 does not preview: the largest unit when L is the
    // tie import, the tie import when L is a unit.
    const other = kinds[0] === 'link' ? 'unit' : !state.tie.tripped && state.tie.flowMW > V.EVENT_THRESHOLD_MW ? 'link' : null;
    if (other !== null && !kinds.includes(other)) {
      const m = probeTrip(S, state, sec, other);
      otherN++;
      if (m < V.CONTAIN_LO_HZ) otherFails++;
      if (m < otherWorst) otherWorst = m;
    }
  }
  const sc = observe(state).score;
  return {kind: 'par', seed, cls: state.ext.regime.cls, black: state.black, endS: Math.floor(state.tick / TPS),
    unservedMWh: sc.unservedMWh, uflsMWh: sc.uflsMWh, directedMWh: sc.directedMWh,
    rert: state.log.some(x => x.type === 'armRERT'), drCalls: state.log.filter(x => x.type === 'callDR').length,
    costDollars: sc.costDollars, centsPerKWh: sc.centsPerKWh, co2tPerMWh: sc.co2tPerMWh, trips: state.conts.length,
    p19, negH: negS / V.S_PER_H, chMWh, chCost, chOrderMWh, chOrderCost, disMWh, battPnl: rev, alarmDiff, shortMin,
    probes, fresh, live, fails, worst: probes ? worst : null, otherN, otherFails, otherWorst: otherN ? otherWorst : null,
    hash: hashState(state), trace,
    secs: Number(process.hrtime.bigint() - t0) / 1e9};
}

/** H-8 probe: a JSON copy of a state, its future contingencies removed, a unit ('unit': the largest online) or the tie ('link') tripped now; the nadir over the watch. */
function probeTrip(S, state, sec, kind) {
  const {V} = S, TPS = V.TICKS_PER_S;
  const p = JSON.parse(JSON.stringify(state));
  p.ext.events = p.ext.events.filter((e, i) => i < p.evNext || !e.contingency);
  S.H.injectTrip(p, sec, kind === 'link' ? 'link' : 'unit');
  let minHz = Infinity;
  while (!p.over && p.tick < (sec + V.WATCH_S) * TPS) { S.step.step(p); if (p.phys.fHz < minHz) minHz = p.phys.fHz; }
  return minHz;
}

// ---------------------------------------------------------------- other proxies (sections 3.3, 3.4)
function proxyDay(S, seed, proxy, withTrace) {
  const {V} = S, TPS = V.TICKS_PER_S;
  const t0 = process.hrtime.bigint();
  const trace = withTrace ? [] : null;
  const onStep = withTrace ? st => { if (st.tick % (V.S_PER_MIN * TPS) === 0 && !st.over) trace.push(envRow(st)); } : undefined;
  const r = S.autopilot.runPar(seed, S.CLASSIC, {proxy, onStep});
  return {kind: withTrace ? 'f3' : 'proxy', seed, proxy, black: r.black, unservedMWh: r.score.unservedMWh, costDollars: r.summary.costDollars,
    centsPerKWh: r.summary.centsPerKWh, rert: r.log.some(x => x.type === 'armRERT'), trace, secs: Number(process.hrtime.bigint() - t0) / 1e9};
}

// ---------------------------------------------------------------- section 1: fixed probes
function fixedProbes(S) {
  const {V, H} = S, {createState, step, hashState, applyInput, INPUT_TYPES} = S.step;
  const TPS = V.TICKS_PER_S, DT = V.PHYS_DT, GWS = V.MW_PER_GW;
  const rows = [];
  const add = (metric, target, measured, how) => rows.push({metric, target, measured, how});
  const gws = (mws, d = 1) => fix(mws / GWS, d) + ' GW·s';

  // S-10: heatwave share.
  {
    const scn = JSON.parse(JSON.stringify(S.CLASSIC)), c = {heat: 0, storm: 0, calm: 0};
    for (let seed = 1; seed <= HEAT_SHARE_SEEDS; seed++) c[S.weather.prerollRegime(seed, scn).cls]++;
    add('Heatwave share of days', '15 ± 2% of 2,000 dates', pct(c.heat, HEAT_SHARE_SEEDS) + ' (' + int(c.heat) + ' of ' + int(HEAT_SHARE_SEEDS) +
      '); storm ' + pct(c.storm, HEAT_SHARE_SEEDS), 'the regime pre-roll, seeds 1–' + int(HEAT_SHARE_SEEDS) + ' (S-10; D-8 moves it to dates)');
  }

  // H-8 / F-4: RoCoF and the nadir against inertia (the tests/physics.test.js states).
  {
    const rocof = s => { const lost = H.trip(s, 'coal1'), ek = s.phys.ekMWs, f0 = s.phys.fHz; H.runPhysics(s, 1);
      return {r: (s.phys.fHz - f0) / DT, ek, want: -lost * V.F0_HZ / (2 * ek)}; };
    const a = rocof(H.opening(2)), b = rocof(H.commit(H.opening(2), {coal1: 500, coal2: 500, ccgt1: 260, hydro1: 300, hydro2: 300}));
    const ratio = (b.r / a.r) / (a.ek / b.ek);
    const err = Math.max(Math.abs(a.r / a.want - 1), Math.abs(b.r / b.want - 1));
    add('Nadir response to inertia: RoCoF', 'halving Ek doubles RoCoF ± 1%', 'RoCoF × Ek constant to ' + fix(100 * Math.abs(ratio - 1), 3) + '% (' +
      gws(a.ek) + ': ' + sfix(a.r, 3) + ' Hz/s; ' + gws(b.ek) + ': ' + sfix(b.r, 3) + ' Hz/s); ΔP·f0/(2·Ek) matched to ' + fix(100 * err, 3) + '%',
    'coal1 trips from two balanced opening states, first 20-ms tick (H-8, F-4)');
    const low = H.commit(H.opening(3), {coal1: 650, ccgt1: 420, hydro1: 150, hydro2: 150});
    const high = H.commit(H.opening(3), {coal1: 650, coal2: 450, coal3: 450, coal4: 450, ccgt1: 420, ccgt2: 420, gta1: 300, gtb1: 250,
      gtb2: 250, hydro1: 150, hydro2: 150, hydro3: 150});
    const nl = S.physics.previewTrip(low, {kind: 'unit', id: 'coal1'}).nadirHz, nh = S.physics.previewTrip(high, {kind: 'unit', id: 'coal1'}).nadirHz;
    add('Nadir response to inertia: nadir', '8 → 25 GW·s raises the nadir ≥ 0.2 Hz', gws(low.phys.ekMWs) + ': ' + fix(nl, 3) + ' Hz; ' +
      gws(high.phys.ekMWs) + ': ' + fix(nh, 3) + ' Hz (+' + fix(nh - nl, 3) + ' Hz)', '−650 MW (coal1), TRIP PREVIEW on the physics engine (H-8)');
  }

  // H-3: inertia after a coal machine trips.
  {
    const s = H.opening(1), before = s.phys.ekMWs;
    H.trip(s, 'coal1');
    const m = V.MACHINES[S.fleet.unitIndex('coal1')];
    add('Inertia after a coal machine trips', 'falls by that machine\'s H·S', gws(before, 2) + ' → ' + gws(s.phys.ekMWs, 2) + ' (−' +
      gws(before - s.phys.ekMWs, 2) + '; H·S = ' + fix(m.H, 1) + ' s × ' + int(m.ratingMW) + ' MW = ' + gws(m.ekMWs, 2) + ')',
    'coal1 trips from the seed-1 opening state (H-3)');
  }

  // H-6: UFLS first stage and its delay (frequency held, as tests/physics.test.js).
  {
    const s = H.opening(6);
    H.runPhysics(s, 2 * TPS, x => { x.phys.fHz = V.UFLS_FIRST_HZ + 0.001; });
    const above = s.ufls.operated.some(Boolean);
    let at = -1;
    H.runPhysics(s, TPS, (x, k) => { x.phys.fHz = V.UFLS_FIRST_HZ - V.UFLS_STEP_HZ / 2.5; if (at < 0 && x.ufls.operated[0]) at = k; });
    add('UFLS first stage', '49.0 Hz; ~0.3 s from crossing to load off', (above ? 'SHED' : 'no shed') + ' at ' + fix(V.UFLS_FIRST_HZ + 0.001, 3) +
      ' Hz for 2 s; stage 1 at ' + fix(V.UFLS_FIRST_HZ - V.UFLS_STEP_HZ / 2.5, 2) + ' Hz after ' + fix(at * DT, 2) + ' s' +
      (s.ufls.operated[1] ? ', stage 2 too (WRONG)' : ', stage 2 not'), 'frequency held, seed-6 opening state (H-6)');
  }

  // H-7: graded collapse.
  {
    const hold = (hz, seconds) => {
      const s = H.opening(8);
      H.runPhysics(s, Math.round(seconds * TPS), x => { x.phys.fHz = hz; });
      return s.black ? fix(s.tick * DT, 2) + ' s' : 'not black after ' + fix(seconds, 0) + ' s';
    };
    add('Black rule', 'never above 47.5 Hz within 20 s', '48.1 Hz: ' + hold(48.1, 60) + '; 47.7 Hz: black at ' + hold(47.7, 25) + '; 47.2 Hz: black at ' +
      hold(47.2, 5) + '; 46.99 Hz: black at ' + hold(46.99, 1) + '; 51.9 Hz: ' + hold(51.9, 60) + '; 52.0 Hz: black at ' + hold(52, 1),
    'frequency held, seed-8 opening state (H-7)');
  }

  // H-7: the desk-lab midday case (6.6 GW·s, no battery, a −650 MW trip; the desk lab
  // over-shed past 52 Hz), re-run on the v4 engine (review fix: the Accept item had not been
  // re-run). Two coal machines at full output are the only spinning plant (6.5 GW·s); the rest
  // is noon solar, wind and the tie; coal1 trips; physics only (schedules frozen, no AGC or FOS)
  // for 60 s. v4 has no battery-off switch, so "no battery" holds its energy at empty while
  // frequency is below 50 Hz (it cannot raise) and full above it (it cannot absorb); the same
  // state with the battery in service (idle, half full, no GUARD) is the contrast.
  {
    const midday = noBattery => {
      const s = H.commit(H.opening(1), {coal1: 650, coal2: 650}, {windMW: MIDDAY_WIND_MW, tieMW: MIDDAY_TIE_MW,
        battery: {mode: 'idle', orderMW: 0, schedMW: 0, agcTrimMW: 0, guardMW: 0, socMWh: V.BATT_MWH / 2}});
      s.ren.solarMW = MIDDAY_SOLAR_MW;
      H.balance(s);
      const ek = s.phys.ekMWs, demand = s.env.demandMW, lost = H.trip(s, 'coal1');
      const hold = noBattery ? x => { x.battery.socMWh = x.phys.fHz < V.F0_HZ ? 0 : V.BATT_MWH; } : undefined;
      const r = H.runPhysics(s, MIDDAY_RUN_S * TPS, hold);
      const stages = s.ufls.operated.filter(Boolean).length, ofgs = s.ofgs.tripped.filter(Boolean).length;
      return {ek, demand, lost, r, stages, ofgs, shedMW: demand * s.city.shedFrac, black: s.black, at: s.tick * DT, endHz: s.phys.fHz};
    };
    const say = m => 'nadir ' + fix(m.r.minHz, 3) + ' Hz, UFLS ' + m.stages + ' stage' + (m.stages === 1 ? '' : 's') + ' (' + int(m.shedMW) + ' MW shed for ' +
      int(m.lost) + ' MW lost), peak ' + fix(m.r.maxHz, 3) + ' Hz, OFGS ' + m.ofgs + ' stage' + (m.ofgs === 1 ? '' : 's') + ', ' +
      (m.black ? 'BLACK at ' + fix(m.at, 2) + ' s' : 'not black, ' + fix(m.endHz, 3) + ' Hz after ' + MIDDAY_RUN_S + ' s');
    const a = midday(true), b = midday(false);
    add('Desk-lab midday case: ' + gws(a.ek) + ', no battery, −650 MW', 're-run and recorded in §8 (H-7)', 'no battery: ' + say(a) + '; with the battery (idle, ' +
      'half full, no GUARD): ' + say(b), 'coal1 of two coal machines at 650 MW, ' + int(MIDDAY_SOLAR_MW) + ' MW solar, ' + int(MIDDAY_WIND_MW) + ' MW wind, ' +
      int(MIDDAY_TIE_MW) + ' MW import, demand ' + int(a.demand) + ' MW; physics only (no AGC, FOS or restore) for ' + MIDDAY_RUN_S + ' s (H-7, §9.2 risk 10)');
  }

  // H-2: overheat trips hit the hot unit (grid seconds with outputs held, as tests/grid.test.js).
  {
    let n = 0, onHot = 0, cool = 0, seeds = 0, hotUnitHours = 0;
    const want = V.MACHINES.map(m => ({[m.id]: m.ratingMW}));
    for (let seed = 1; n < HOT_TRIPS_WANT; seed++) {
      seeds++;
      const s = H.commit(H.opening(seed), Object.assign({}, ...want));
      const isHot = s.units.map((u, i) => i % HOT_COOL_EVERY !== 1);
      const out = [];
      for (let k = 0; k < V.DAY_S; k++) {
        s.last.fMeanHz = s.last.fMinHz = s.last.fMaxHz = V.F0_HZ;
        s.phys.fHz = V.F0_HZ;
        S.weather.sampleSecond(s);
        out.length = 0;
        S.grid.unitsSecond(s, out);
        for (const e of out) {
          if (e.kind !== 'breaker' || e.why !== 'trip') continue;
          n++;
          if (isHot[S.fleet.unitIndex(e.unit)]) onHot++; else cool++;
        }
        for (let i = 0; i < s.units.length; i++) {
          const u = s.units[i];
          if (!u.sync) continue;
          u.outMW = u.schedMW = isHot[i] ? u.availMW : HOT_COOL_FRAC * u.availMW;
          if (isHot[i]) hotUnitHours += 1 / V.S_PER_H;
        }
        s.tick += TPS;
      }
    }
    add('Overheat trips hitting the hot unit', '100% (n ≥ 100)', onHot + ' of ' + n + ' (' + pct(onHot, n) + '); units held at ' +
      int(100 * HOT_COOL_FRAC) + '% tripped ' + cool + ' times; ' + fix(n / hotUnitHours * 100, 2) + '% per hot unit-hour',
    'every machine on, one in ' + HOT_COOL_EVERY + ' held at ' + int(100 * HOT_COOL_FRAC) + '% and the rest at full output; whole days ' +
      'of grid seconds with outputs held (the tests/grid.test.js stand-in for physics), seeds 1–' + seeds + ' (H-2)');
  }

  // H-1: STOP one coal machine at 04:10 on seed 3.
  {
    const s = createState(3, S.CLASSIC), stopAt = H.ticksAt(4, 10), stopInput = [{type: 'stop', unit: 'coal1'}];
    let prev = s.units[0].outMW, maxStep = 0, uflsAt = -1, offAt = -1;
    while (!s.over && (uflsAt < 0 || offAt < 0)) {
      const ev = step(s, s.tick === stopAt ? stopInput : undefined);
      const d = prev - s.units[0].outMW;
      if (d > maxStep) maxStep = d;
      prev = s.units[0].outMW;
      if (uflsAt < 0 && ev.some(e => e.kind === 'ufls')) uflsAt = s.tick;
      if (offAt < 0 && s.tick > stopAt && s.units[0].mode === 'off') offAt = s.tick;
    }
    const m = V.MACHINES[0], limit = m.breakerOpenMW + m.rampMWs * DT;
    add('STOP coal, seed 3, 04:10: largest step', 'no tick removes > 5% + one ramp step', fix(maxStep, 3) + ' MW in one tick (' +
      (maxStep <= limit + 1e-6 ? 'within' : 'ABOVE') + ' 5% + one ramp step = ' + fix(limit, 3) + ' MW); breaker open at ' + (offAt < 0 ? 'never' : hhmm(V, offAt / TPS)),
    'coal1 STOP, nobody responding (AGC on) (H-1 a)');
    add('STOP coal, seed 3, 04:10: nobody responds', 'first UFLS ≥ 60 min later', uflsAt < 0 ? 'no UFLS all day' + (s.black ? ', black' : '')
      : 'first UFLS at ' + hhmm(V, uflsAt / TPS) + ' (+' + fix((uflsAt - stopAt) / TPS / V.S_PER_MIN, 0) + ' min)', 'the same run (H-1 c)');
    const c = createState(3, S.CLASSIC);
    while (!c.over && c.tick < stopAt) step(c);
    step(c, stopInput);
    let ufls = false;
    const r = S.autopilot.runPar(3, S.CLASSIC, {proxy: 'competent', state: c, untilTick: H.ticksAt(8), onStep: st => {
      if (st.ufls.operated.some(Boolean)) ufls = true;
    }});
    add('STOP coal, seed 3, 04:10: competent responds', 'no UFLS through 08:00', (ufls ? 'UFLS' : 'no UFLS') + ', ' + (r.black ? 'black' : 'not black') +
      ' through 08:00', 'the competent proxy from the STOP (H-1 b)');
  }

  // H-5: stepping the import at 13:00 and at 18:30 on seed 12 (par's state; R5 and L
  // recomputed at each step). The energy price never rises; at the evening peak the P-7 adder
  // can, because the import uses the tie's 5-min headroom and can make the tie L (labelled in
  // §8.2 "Cost-based offers; scarcity adder"; the review found the 13:00-only probe hid it).
  {
    const probe = st => [0, 400, 800].map(mw => {
      const c = H.clone(st);
      c.tie.flowMW = c.tie.setMW = mw;
      const sec = S.grid.security(c);
      c.sec.r5MW = sec.r5MW; c.sec.lMW = sec.lMW;
      const p = S.market.clearPrice(c);
      return {mw, energy: p.mwh - p.adder, adder: p.adder, total: p.mwh, x: p.x, lKind: sec.lKind};
    });
    const rises = (at, k) => at.some((v, i) => i > 0 && v[k] > at[i - 1][k] + 1e-9);
    const say = at => 'energy ' + at.map(v => usd(v.energy)).join(' → ') + (rises(at, 'energy') ? ' (RISES)' : '') +
      '; with the P-7 adder ' + at.map(v => usd(v.total)).join(' → ') + (rises(at, 'total') ? ' (rises: R5/L ' + at.map(v => fix(v.x, 2)).join(' → ') +
      (at[at.length - 1].lKind === 'link' ? ', the tie becomes L' : '') + ')' : '');
    const r = S.autopilot.runPar(12, S.CLASSIC, {untilTick: H.ticksAt(13) + 1});
    add('Import 0 → 400 → 800 MW, seed 12, 13:00', 'never rises', say(probe(r.state)),
      'par\'s 13:00 state, tie flow stepped in copies, R5 and L recomputed (H-5, P-5, P-7)');
    // The same par day on to the evening peak (runPar resumes its memo), probed the same way.
    const e = S.autopilot.runPar(12, S.CLASSIC, {state: r.state, memo: r.memo, untilTick: Math.round((EVENING_H - V.DAY_START_H) * V.S_PER_H) * TPS + 1});
    add('Import 0 → 400 → 800 MW, seed 12, 18:30', 'energy never rises; the P-7 adder may (§8.2)', say(probe(e.state)),
      'the same par day at the evening peak, probed the same way (H-5, P-7)');
  }

  // F-4: rate invariance through app/loop.js.
  {
    const tripS = V.PLAYER_START_S + 60, until = H.ticksAt(5);
    const mk = () => H.injectTrip(createState(4, S.CLASSIC), tripS);
    const log = S.autopilot.runPar(4, S.CLASSIC, {state: mk(), untilTick: until}).log;
    const hashAt = rate => {
      const s = mk(), p = S.loop.createPacer();
      let j = 0;
      const tick = () => {
        const batch = [];
        while (j < log.length && log[j].tick === s.tick) { batch.push(Object.assign({type: log[j].type}, log[j].args)); j++; }
        step(s, batch);
      };
      while (!s.over && s.tick < until) S.loop.runFrame(p, FRAME_S, {rate: () => (s.tick < until ? rate : 0), tick, done: () => s.over || s.tick >= until});
      return hashState(s) + '/' + s.log.length;
    };
    const hs = RATES.map(hashAt);
    const same = hs.every(h => h === hs[0]);
    add('Rate invariance', 'identical hash at 0.25× / 1× / 60× / 240×', (same ? 'identical: ' + hex(Number(hs[0].split('/')[0])) : 'DIFFER: ' + hs.join(', ')) +
      ' (' + log.length + ' inputs replayed)', 'par\'s log, seed 4, 04:00–05:00 with a trip at 04:31, through app/loop.js at 60 frames/s (F-4, D-6)');
  }

  // K-15: inputs during the watch.
  {
    const s = H.injectTrip(createState(2, S.CLASSIC), V.PLAYER_START_S + 60);
    while (s.contIdx < 0) step(s);
    const tries = [{type: 'basePoint', station: 'coal', mw: 1000}, {type: 'start', unit: 'gta1'}, {type: 'stop', unit: 'coal2'},
      {type: 'abortStop', unit: 'coal2'}, {type: 'syncClose', unit: 'gtc1'}, {type: 'battery', mode: 'discharge', mw: 300},
      {type: 'guard', mw: 300}, {type: 'tie', mw: 800}, {type: 'curtail', kind: 'solar', limitPct: 50}, {type: 'callDR'},
      {type: 'armRERT'}, {type: 'standDownRERT'}, {type: 'mode', agc: false}, {type: 'restore', district: 'SOL3'}, {type: 'directShed'}];
    let tried = 0, accepted = 0;
    const end = s.conts[s.contIdx].watchEndTick;
    while (s.tick < end) {
      if (s.tick % TPS === 7) for (const x of tries) { tried++; if (applyInput(s, x).ok) accepted++; }
      step(s);
    }
    add('Player inputs accepted in the first 30 s after a trip', '0 (desk locked)', accepted + ' of ' + int(tried) + ' (every input type, ' +
      (INPUT_TYPES.length === tries.length ? 'all ' + tries.length : tries.length + ' of ' + INPUT_TYPES.length) + ' types, once a grid second)',
    'seed 2, a trip injected at 04:31 (K-15)');
  }

  // D-8: unwarned contingencies < 60 real s apart (the classic scenario's pre-roll, D-2 reference clock).
  {
    const scn = JSON.parse(JSON.stringify(S.CLASSIC));
    let days = 0;
    for (let seed = 1; seed <= D8_SEEDS; seed++) {
      const regime = S.weather.prerollRegime(seed, scn);
      const cs = S.events.prerollEvents(seed, scn, regime).filter(e => e.contingency && !e.warned).map(e => e.atS);
      if (cs.some((x, i) => i > 0 && S.autopilot.refRealSeconds(cs[i - 1], x, []) < D8_GAP_REAL_S)) days++;
    }
    add('Days with unwarned contingencies < 60 real s apart', '0% (D-8 director, Phase 2)', days + ' of ' + D8_SEEDS,
      'the classic scenario\'s pre-rolled trips, seeds 1–' + D8_SEEDS + ', gap on the D-2 reference clock without the watch');
  }

  // The par harness the section 3 rows use (app/assist.js) is autopilot.runPar.
  {
    const until = H.ticksAt(6);
    const ref = S.autopilot.runPar(1, S.CLASSIC, {untilTick: until});
    const s = createState(1, S.CLASSIC), a = S.assist.createAssist('par');
    while (!s.over && s.tick < until) step(s, S.assist.assistInputs(a, s));
    const same = hashState(s) === hashState(ref.state) && s.log.length === ref.log.length;
    add('Par harness check', 'the bench\'s ASSIST PAR is par', (same ? 'identical' : 'DIFFER') + ' at 06:00 on seed 1 (' + hex(hashState(ref.state)) + ', ' +
      ref.log.length + ' inputs)', 'app/assist.js loop vs autopilot.runPar (section 3 uses the former)');
  }
  return {kind: 'fixed', rows};
}

// ---------------------------------------------------------------- jobs
function runJob(S, job) {
  if (job.kind === 'fixed') return fixedProbes(S);
  if (job.kind === 'par') return parDay(S, job.seed, job);
  return proxyDay(S, job.seed, job.proxy, job.kind === 'f3');
}

function heatSeeds(S, n) {
  const scn = JSON.parse(JSON.stringify(S.CLASSIC)), out = [];
  for (let seed = 1; out.length < n; seed++) if (S.weather.prerollRegime(seed, scn).cls === 'heat') out.push(seed);
  return out;
}

function planJobs(S, o) {
  const jobs = [{kind: 'fixed'}];
  const raw = [];
  for (let s = o.seeds[0]; s <= o.seeds[1]; s++) raw.push(s);
  const heat = heatSeeds(S, o.heat);
  const parSeeds = new Set(raw);
  for (let s = 1; s <= o.graded; s++) parSeeds.add(s);
  for (let s = 1; s <= o.f3; s++) parSeeds.add(s);
  for (const s of heat) parSeeds.add(s);
  for (const seed of [...parSeeds].sort((a, b) => a - b)) jobs.push({kind: 'par', seed, probe: true, trace: seed <= o.f3});
  for (let seed = 1; seed <= o.graded; seed++) for (const proxy of GRADED_PROXIES) jobs.push({kind: 'proxy', seed, proxy});
  for (let seed = 1; seed <= o.f3; seed++) for (const proxy of F3_PROXIES) jobs.push({kind: 'f3', seed, proxy});
  return {jobs, raw, heat};
}

function runWorkers(o, jobs) {
  const n = Math.min(o.workers, jobs.length);
  const results = [];
  let next = 0;
  return Promise.all(Array.from({length: n}, () => new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker'], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
    let inFlight = 0;
    // Only the parent ends the conversation, once the worker has nothing in flight (the worker
    // then exits on its own), so nothing is ever sent down a closed channel.
    const feed = () => {
      if (next < jobs.length) { inFlight++; child.send({job: jobs[next++]}); }
      else if (inFlight === 0 && child.connected) child.disconnect();
    };
    child.on('message', m => {
      if (m.ready) { feed(); feed(); return; } // two in flight, so a worker never waits on the parent
      results.push(m.result);
      inFlight--;
      feed();
    });
    child.on('exit', code => (code === 0 && inFlight === 0 ? resolve() : reject(new Error('worker exited with ' + code + ', ' + inFlight + ' jobs unfinished'))));
  }))).then(() => results);
}

async function workerMain() {
  const S = await sim();
  process.on('message', m => { setImmediate(() => process.send({result: runJob(S, m.job)})); });
  process.send({ready: true});
}

// ---------------------------------------------------------------- report
function mdTable(head, rows) {
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')];
}

function sourceHash() {
  const h = crypto.createHash('sha1');
  for (const dir of ['sim', 'content']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(x => x.endsWith('.js')).sort()) {
      h.update(dir + '/' + f + '\0');
      h.update(fs.readFileSync(path.join(ROOT, dir, f), 'utf8').replace(/\r\n/g, '\n'));
    }
  }
  return h.digest('hex').slice(0, 10);
}

/** next.html plus every module it loads (static imports, followed from app/boot.js): bytes raw and gzipped. */
function transferSize() {
  const seen = new Set(), files = ['next.html'];
  const walk = rel => {
    if (seen.has(rel)) return;
    seen.add(rel);
    files.push(rel);
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) walk(path.posix.join(path.posix.dirname(rel), m[1]));
    for (const m of src.matchAll(/^\s*import\s+['"](\.[^'"]+)['"]/gm)) walk(path.posix.join(path.posix.dirname(rel), m[1]));
  };
  walk('app/boot.js');
  let raw = 0, gz = 0;
  for (const f of files) { const b = fs.readFileSync(path.join(ROOT, f)); raw += b.length; gz += zlib.gzipSync(b, {level: 9}).length; }
  return {n: files.length, raw, gz};
}

function report(S, o, plan, results, wallS) {
  const {V} = S;
  const out = [];
  const p = s => out.push(s);
  const fixed = results.find(r => r.kind === 'fixed');
  const parBy = new Map(results.filter(r => r.kind === 'par').map(r => [r.seed, r]));
  const proxyBy = new Map(results.filter(r => r.kind === 'proxy' || r.kind === 'f3').map(r => [r.proxy + ':' + r.seed, r]));
  const raw = plan.raw.map(s => parBy.get(s));
  const heat = plan.heat.map(s => parBy.get(s));
  const clean = r => r.unservedMWh === 0 && !r.black;
  const args = [];
  for (let i = 2; i < process.argv.length; i++) { if (process.argv[i] === '--out') i++; else args.push(process.argv[i]); }
  const cmd = ['node tools/baseline-v4.js', ...args].join(' ');

  p('# GRIDWATCH v4 core baseline');
  p('');
  p('Build: `' + S.SIM_VERSION + '`, scenario `' + S.CLASSIC.id + '`, sources of sim/ and content/ ' + sourceHash() + '. Command: `' + cmd + '`.');
  p('');
  p('The SPEC.md §6 rows that the v4 core can measure before the desk exists (Exit Phase 0). Par is `sim/autopilot.js` (S-4) on the ' +
    'classic scenario, v4 physics, no rooftop PV yet. Sections 1–3 are deterministic for a build and its flags; section 3 rows depend ' +
    'only on their seed (tests/baseline-v4.test.js re-runs a few and compares them with the golden). Section 4 varies by machine.');
  p('');

  p('## 1. Fixed probes (independent of the seed range)');
  p('');
  for (const l of mdTable(['§6 metric', 'Target', 'v4 core (measured)', 'How'], fixed.rows.map(r => [r.metric, r.target, r.measured, r.how]))) p(l);
  p('');

  p('## 2. Over the seed range');
  p('');
  const rows2 = [];
  const byCls = rs => ['calm', 'storm', 'heat'].map(c => { const g = rs.filter(r => r.cls === c); return c + ' ' + g.filter(clean).length + '/' + g.length; }).join(', ');
  rows2.push(['Par with zero unserved, raw seeds', '≥ 85% of 200', raw.filter(clean).length + ' of ' + raw.length + ' (' + pct(raw.filter(clean).length, raw.length) +
    '): ' + byCls(raw), 'seeds ' + o.seeds[0] + '–' + o.seeds[1] + ' (S-12)']);
  if (heat.length) rows2.push(['Par with zero unserved, forced heat', '≥ 75% of 100', heat.filter(clean).length + ' of ' + heat.length + ' (' +
    pct(heat.filter(clean).length, heat.length) + ')', 'the first ' + heat.length + ' heat seeds (S-12, S-14)']);
  const rertN = raw.filter(r => r.rert).length;
  rows2.push(['Par arms RERT', '≤ 25% (§9 Q-2)', rertN + ' of ' + raw.length + ' (' + pct(rertN, raw.length) + ')' + (heat.length ? '; forced heat ' +
    heat.filter(r => r.rert).length + ' of ' + heat.length : ''), 'raw seeds (S-12)']);
  const allPar = [...parBy.values()];
  const probes = allPar.reduce((a, r) => a + r.probes, 0), fails = allPar.reduce((a, r) => a + r.fails, 0);
  const fresh = allPar.reduce((a, r) => a + r.fresh, 0), live = allPar.reduce((a, r) => a + r.live, 0);
  const worst = Math.min(...allPar.filter(r => r.probes).map(r => r.worst));
  rows2.push(['Credible trip from a SECURE state (both H-4 conditions)', 'nadir ≥ 49.5 Hz in 1,000 of 1,000', int(probes - fails) + ' of ' + int(probes) +
    ' (' + int(fresh) + ' SECURE on a fresh preview, ' + int(live) + ' as the desk showed it); worst ' + (probes ? fix(worst, 3) : '-') + ' Hz',
  'par days (' + allPar.length + ' seeds), at most one state per ' + PROBE_EVERY_S / V.S_PER_MIN + ' grid-min; L tripped in a copy (H-8)']);
  const oN = allPar.reduce((a, r) => a + r.otherN, 0), oF = allPar.reduce((a, r) => a + r.otherFails, 0);
  const oW = Math.min(...allPar.filter(r => r.otherN).map(r => r.otherWorst));
  rows2.push(['The other credible contingency from the same SECURE states', '— (H-4 previews L only)', int(oN - oF) + ' of ' + int(oN) +
    ' hold 49.5 Hz; worst ' + (oN ? fix(oW, 3) : '-') + ' Hz', 'the largest unit when L is the tie import, the tie import (> 50 MW) when L is a unit; ' +
    'a unit trip also removes its inertia and governor, so it can be worse than a tie import of the same MW']);
  const alarmDiff = allPar.reduce((a, r) => a + r.alarmDiff, 0), ticks = allPar.reduce((a, r) => a + r.endS * V.TICKS_PER_S, 0);
  rows2.push(['Reserve gauge vs alarm disagreement', '0% of ticks', int(alarmDiff) + ' of ' + int(ticks) + ' ticks (' + pct(alarmDiff, ticks) + ')',
    'every tick of the par days: the desk\'s level vs the last SECURITY alarm line (H-4)']);
  const nonHeat = raw.filter(r => r.cls !== 'heat' && r.p19 !== null);
  const p19 = nonHeat.map(r => r.p19);
  rows2.push(['Median 19:00 price, non-heat days', '≤ $2,000, not at the cap', usd(median(p19)) + ' (' + days(p19.length) + '; at the cap on ' +
    p19.filter(x => x >= V.PRICE_CAP).length + ', above $2,000 on ' + p19.filter(x => x > 2000).length + ')', 'par, raw seeds (P-5–P-8)']);
  const ch = raw.reduce((a, r) => a + r.chMWh, 0), chCost = raw.reduce((a, r) => a + r.chCost, 0);
  const dis = raw.reduce((a, r) => a + r.disMWh, 0);
  const pnl = raw.map(r => r.battPnl);
  const dayCh = raw.filter(r => r.chMWh > 0).map(r => r.chCost / r.chMWh);
  const chO = raw.reduce((a, r) => a + r.chOrderMWh, 0), chOCost = raw.reduce((a, r) => a + r.chOrderCost, 0);
  rows2.push(['Battery average charge price', '≤ $100', usd(chCost / ch) + ' per MWh over all charging (median day ' + usd(median(dayCh)) + '); ' +
    usd(chOCost / chO) + ' while ordered to CHARGE (' + int(chO) + ' of ' + int(ch) + ' MWh charged; ' + int(dis) + ' MWh discharged)',
    'par, raw seeds, every second\'s battery energy at that second\'s price; the rest of the charging is AGC regulation and primary response (P-10)']);
  rows2.push(['Battery P&L', 'median > 0', 'median ' + usd(median(pnl)) + ' per day; > 0 on ' + pnl.filter(x => x > 0).length + ' of ' + pnl.length,
    'Σ price × output (P-10), par, raw seeds']);
  const negCalm = raw.filter(r => r.cls === 'calm').map(r => r.negH), negHeat = [...raw, ...heatOnlyOf(heat, o)].filter(r => r.cls === 'heat').map(r => r.negH);
  const med1 = xs => (xs.length ? fix(median(xs), 1) : '-');
  rows2.push(['Negative-price hours, mild / hot days', '2–6 h / ≤ 1 h (P-9, needs rooftop PV)', 'median ' + med1(negCalm) + ' h calm (' + days(negCalm.length) +
    ') / ' + med1(negHeat) + ' h heat (' + days(negHeat.length) + ')', 'par; no rooftop PV before Phase 2']);
  const shortBy = c => { const g = [...raw, ...heatOnlyOf(heat, o)].filter(r => c === 'all' || r.cls === c); return g.filter(r => r.shortMin > 0).length + '/' + g.length; };
  rows2.push(['Days short on the optimistic bound (1-min, all day)', '0 on published dailies (D-9)', 'calm ' + shortBy('calm') + ', storm ' + shortBy('storm') +
    ', heat ' + shortBy('heat') + '; median ' + med1(raw.filter(r => r.shortMin > 0).map(r => r.shortMin)) + ' short minutes on a short raw day',
  'along par\'s days (raw and forced-heat seeds): the §3.2 bound on the v4 fleet (every machine not in lockout at its derated availability, tie 800 MW ' +
    'unless tripped, battery 500, diesel 300 and DR 350 MW at once, wind and solar available)']);
  if (o.graded) {
    const gr = proxy => { const g = {A: 0, B: 0, C: 0, D: 0, F: 0}; for (let s = 1; s <= o.graded; s++) g[grade(proxyBy.get(proxy + ':' + s), parBy.get(s))]++; return g; };
    const gtxt = g => Object.entries(g).filter(([, v]) => v).map(([k, v]) => k + v).join(' ');
    const lean = gr('lean'), comp = gr('competent'), plan0 = gr('planOnly');
    rows2.push(['Lean proxy earns A (S-5)', '≤ 40% of dailies', lean.A + ' of ' + o.graded + ' (' + gtxt(lean) + ')', 'seeds 1–' + o.graded + ', graded against par (S-5, S-12)']);
    rows2.push(['Competent proxy earns A (S-5)', '≥ 70% of dailies', comp.A + ' of ' + o.graded + ' (' + gtxt(comp) + ')', 'raw seeds 1–' + o.graded + ', not gate-passed dailies']);
    const blk = [];
    for (let s = 1; s <= o.graded; s++) if (proxyBy.get('planOnly:' + s).black) blk.push(s);
    rows2.push(['No-input day (AGC + pre-dispatch)', 'never F; median C/D', 'black ' + blk.length + ' of ' + o.graded + '; ' + gtxt(plan0), 'planOnly, seeds 1–' + o.graded + ' (L-0)']);
    // S-11: commit everything at 04:00 against par, on the cost to serve.
    let dearer = 0;
    for (let s = 1; s <= o.graded; s++) if (proxyBy.get('commitAll:' + s).costDollars > parBy.get(s).costDollars) dearer++;
    rows2.push(['"Commit everything at 04:00" dearer than par (S-11)', '≥ 70% of seeds', dearer + ' of ' + o.graded + ' (' + pct(dearer, o.graded) + ')',
      'the commitAll proxy, seeds 1–' + o.graded + ', cost to serve in $ (S-11)']);
    // S-2's Accept: corr(Δunserved, Δcost) against par within ±0.15 across the player proxies
    // (review fix: it was never measured). Δ = proxy − par per seed; cost in ¢/kWh served.
    const deltas = proxies => {
      const du = [], dc = [];
      for (const x of proxies) for (let s = 1; s <= o.graded; s++) {
        const r = proxyBy.get(x + ':' + s), par = parBy.get(s);
        du.push(r.unservedMWh - par.unservedMWh); dc.push(r.centsPerKWh - par.centsPerKWh);
      }
      return pearson(du, dc);
    };
    const sets = [['lean'], ['competent'], ['planOnly'], ['commitAll'], ['lean', 'competent'], GRADED_PROXIES];
    const txt = sets.map(ps => (ps.length === GRADED_PROXIES.length ? 'all four' : ps.join(' + ')) + ' ' + signed(deltas(ps), 2)).join('; ');
    rows2.push(['CUSTOMER COST independent of LIGHTS ON (S-2)', 'corr(Δunserved, Δcost) within ±0.15 across the player proxies',
      txt + ' (open: the Accept names no proxy set; SPEC S-2)', 'seeds 1–' + o.graded + ', Δ = proxy − par per seed, cost in ¢/kWh served; Pearson r']);
  }
  if (o.f3) {
    let diverge = 0;
    for (let s = 1; s <= o.f3; s++) if (!f3Row(parBy, proxyBy, s).same) diverge++;
    rows2.push(['Same seed, different play: same weather', '0 of 100 diverge', diverge + ' of ' + o.f3 + ' diverge', 'par, doNothing and a fuzzer, every grid-minute: demand, wind, ' +
      'solar, heat, event and news timelines (F-3; 100 days in the slow integration test)']);
  }
  const cents = raw.map(r => r.centsPerKWh), co2 = raw.map(r => r.co2tPerMWh);
  rows2.push(['Par cost to serve', '—', fix(median(cents), 2) + ' / ' + fix(mean(cents), 2) + ' ¢/kWh (median / mean)' + (heat.length ? '; heat ' +
    fix(median(heat.map(r => r.centsPerKWh)), 2) + ' / ' + fix(mean(heat.map(r => r.centsPerKWh)), 2) : ''), 'raw seeds (S-2)']);
  rows2.push(['Par carbon intensity', '—', fix(median(co2), 3) + ' t/MWh (median)', 'raw seeds (S-3)']);
  rows2.push(['Par unserved energy', '—', num(mean(raw.map(r => r.unservedMWh)), 1) + ' MWh mean, ' + num(Math.max(...raw.map(r => r.unservedMWh)), 1) +
    ' max; black ' + raw.filter(r => r.black).length + '; DR calls ' + fix(mean(raw.map(r => r.drCalls)), 2) + ' a day', 'raw seeds (S-1)']);
  for (const l of mdTable(['§6 metric', 'Target', 'v4 core (measured)', 'How'], rows2)) p(l);
  p('');

  p('## 3. One row per seed');
  p('');
  p('Unserved, UFLS and directed energy in MWh; RERT = armed; DR = calls; ¢ = cost to serve per kWh; t = t CO2/MWh; 19:00 = price at 19:00:00 ($/MWh; - if black ' +
    'before); neg = hours at a negative price; charge = battery average charge price ($/MWh); P&L = battery Σ price × output ($); short = minutes below the optimistic bound; ' +
    'probes = SECURE states probed by tripping L / below 49.5 Hz / worst nadir (Hz); other = the same for the other credible contingency; alarm = ticks where the desk\'s level and the last SECURITY line differ; hash = hashState at the end of the day.');
  p('');
  p('### 3.1 Par, raw seeds');
  p('');
  const parRow = r => [r.seed, r.cls, (r.black ? 'BLACK ' + hhmm(V, r.endS) : ''), num(r.unservedMWh, 1), num(r.uflsMWh, 1), num(r.directedMWh, 1),
    r.rert ? 'yes' : '', r.drCalls, fix(r.centsPerKWh, 3), fix(r.co2tPerMWh, 3), r.trips, r.p19 === null ? '-' : int(r.p19), fix(r.negH, 1),
    r.chMWh > 0 ? int(r.chCost / r.chMWh) : '-', int(r.battPnl), r.shortMin, r.probes + ' / ' + r.fails + ' / ' + (r.worst === null ? '-' : fix(r.worst, 3)),
    r.otherN + ' / ' + r.otherFails + ' / ' + (r.otherWorst === null ? '-' : fix(r.otherWorst, 3)), r.alarmDiff, hex(r.hash)];
  const parHead = ['seed', 'class', 'black', 'unserved', 'UFLS', 'directed', 'RERT', 'DR', '¢', 't', 'trips', '19:00', 'neg', 'charge', 'P&L', 'short', 'probes', 'other', 'alarm', 'hash'];
  for (const l of mdTable(parHead, raw.map(parRow))) p(l);
  p('');
  const heatOnly = heatOnlyOf(heat, o);
  if (heatOnly.length) {
    p('### 3.2 Par, forced-heat seeds outside the raw range');
    p('');
    for (const l of mdTable(parHead, heatOnly.map(parRow))) p(l);
    p('');
  }
  const extra = [...parBy.values()].filter(r => (r.seed < o.seeds[0] || r.seed > o.seeds[1]) && !plan.heat.includes(r.seed)).sort((a, b) => a.seed - b.seed);
  if (extra.length) {
    p('### 3.2b Par, other seeds the proxies need');
    p('');
    for (const l of mdTable(parHead, extra.map(parRow))) p(l);
    p('');
  }
  if (o.graded) {
    p('### 3.3 Proxies graded against par (S-5)');
    p('');
    const cell = (r, par) => grade(r, par) + ' ' + (r.black ? 'BLACK' : num(r.unservedMWh, 1) + ' MWh') + ' ' + fix(r.centsPerKWh, 3) + '¢' + (r.rert ? ' RERT' : '');
    const rows3 = [];
    for (let s = 1; s <= o.graded; s++) {
      const par = parBy.get(s);
      rows3.push([s, num(par.unservedMWh, 1) + ' MWh ' + fix(par.centsPerKWh, 3) + '¢', ...GRADED_PROXIES.map(x => cell(proxyBy.get(x + ':' + s), par))]);
    }
    for (const l of mdTable(['seed', 'par', ...GRADED_PROXIES], rows3)) p(l);
    p('');
  }
  if (o.f3) {
    p('### 3.4 F-3: the same weather whatever the play');
    p('');
    const rows4 = [];
    for (let s = 1; s <= o.f3; s++) {
      const f = f3Row(parBy, proxyBy, s);
      rows4.push([s, f.lens.join(' / '), f.same ? 'yes' : 'NO', hex(f.hash)]);
    }
    for (const l of mdTable(['seed', 'minutes sampled: par / doNothing / fuzz', 'identical on the common prefix', 'trace hash'], rows4)) p(l);
    p('');
  }

  p('## 4. Build and machine (not compared)');
  p('');
  const secs = raw.map(r => r.secs);
  p('- Par day runtime (D-9 budget 1.6 s): median ' + fix(median(secs), 2) + ' s, max ' + fix(Math.max(...secs), 2) + ' s over ' + secs.length + ' raw seeds (' +
    (o.workers > 1 ? o.workers + ' worker processes sharing the machine' : 'one process') + '; includes the H-8 probes and per-tick checks).');
  const tr = transferSize();
  p('- First-visit transfer (F-11 target ≤ 400 KB compressed): next.html and the ' + (tr.n - 1) + ' modules it loads, ' + fix(tr.raw / 1024, 1) + ' KB raw, ' +
    fix(tr.gz / 1024, 1) + ' KB gzip -9 (per file, as a static host serves them).');
  p('- Wall time ' + fix(wallS, 0) + ' s. Node ' + process.version + ', ' + os.cpus().length + ' logical CPUs.');
  p('- Not measurable on the v4 core yet: frame rate (F-11, browser), audible alarms (K-8), session length and decision gaps (D-2, D-10), ' +
    'desk dispatch share (K-1), SYNC and RESTORE dates (K-12, D-8), minimum demand, MSL and the belly (P-1–P-4, rooftop PV), ' +
    'first click to action (O-2), the CO₂ tip (H-13, debrief), playtests.');
  return out.join('\n') + '\n';
}

/** Forced-heat par rows whose seed is outside the raw range (the others are raw rows already). */
const heatOnlyOf = (heat, o) => heat.filter(r => r.seed < o.seeds[0] || r.seed > o.seeds[1]);

function f3Row(parBy, proxyBy, s) {
  const traces = [parBy.get(s).trace, ...F3_PROXIES.map(x => proxyBy.get(x + ':' + s).trace)];
  const longest = traces.reduce((a, b) => (b.length > a.length ? b : a));
  const same = traces.every(t => t.every((x, i) => x === longest[i]));
  let h = 0x811c9dc5;
  for (const x of longest) { h ^= x; h = Math.imul(h, 0x01000193); }
  return {lens: traces.map(t => t.length), same, hash: h >>> 0};
}

// ---------------------------------------------------------------- main
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.worker) return workerMain();
  const S = await sim();
  const plan = planJobs(S, o);
  const t0 = Date.now();
  const results = o.workers > 1 ? await runWorkers(o, plan.jobs) : plan.jobs.map(j => runJob(S, j));
  const text = report(S, o, plan, results, (Date.now() - t0) / 1000);
  if (o.out) fs.writeFileSync(o.out, text, 'utf8');
  else process.stdout.write(text);
}

main().catch(e => { console.error(e); process.exit(1); });

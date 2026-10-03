// GRIDWATCH v4: print PAR (sim/autopilot.js, spec S-4) for any seed, with a summary table
// (Exit Phase 0 "tools/par.js prints par for any seed"; S-12 measurement). Not loaded by
// the game. CommonJS (tools/package.json); the ES-module sim is loaded with await import().
//
//   node tools/par.js                       # seeds 1-20, par, one process
//   node tools/par.js --seed 7              # one seed, with par's discrete actions listed
//   node tools/par.js --seeds 1-200 -j 8    # 200 raw seeds on 8 worker processes
//   node tools/par.js --heat 100 -j 8       # the first 100 forced-heatwave seeds (regime 'heat')
//   node tools/par.js --seeds 1-50 --proxy lean --grade   # lean graded against par (S-5)
//   node tools/par.js --seeds 1-30 --vs commitAll         # S-11: is the proxy dearer than par?
//   node tools/par.js --seeds 1-20 --json   # one JSON line per seed instead of the table
//   node tools/par.js --scenario desk --seeds 1-200 -j 8 --probe --quiet   # the game's day, by day type
//
// Flags: --seed N | --seeds A-B (default 1-20) | --heat N (first N heat seeds, or with --seeds A-B
// the heat seeds number A..B) | --proxy P (par, planOnly, doNothing, lean, competent,
// commitAll, fuzz) | --grade (grade the proxy against par on each seed, S-5) | --vs P (also run
// proxy P and count the seeds where it costs more than the main proxy, S-11) | -j/--workers N
// | --json | --quiet (summary only) | --scenario ID (classic, desk, desk-weekend) | --probe (H-8:
// trip both credible contingencies in a copy of each SECURE state, as tools/baseline-v4.js does)
// | --rows FILE (also write every row as a JSON line to FILE).
// The weather class and the day type shown are the seed's hidden regime: this is a measurement
// tool, and it reads state.ext for reporting only (par itself never sees it, S-4).
// Phase 2a (desk/README.md §21.3): each row also carries the day type (MILD / HOT / HEATWAVE, and
// the weekend), the minimum operational demand, the hours at a negative price, the MWh spilled
// (all of score.spillMWh, and the dispatch's automatic cut alone), the peak frequency, the
// highest MSL level and rule 4's coal stops; the summary groups them by day type.
'use strict';
const path = require('path');
const {fork} = require('child_process');
const {pathToFileURL} = require('url');

const ROOT = path.join(__dirname, '..');
const load = rel => import(pathToFileURL(path.join(ROOT, rel)).href);

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const o = {seeds: null, seed: null, heat: 0, proxy: 'par', grade: false, vs: null, workers: 1, json: false, quiet: false,
    scenario: 'classic', probe: false, rows: null, worker: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--seed') o.seed = parseInt(next(), 10);
    else if (a === '--seeds') { const [x, y] = next().split('-').map(Number); o.seeds = [x, y === undefined ? x : y]; }
    else if (a === '--heat') o.heat = parseInt(next(), 10);
    else if (a === '--proxy') o.proxy = next();
    else if (a === '--grade') o.grade = true;
    else if (a === '--vs') o.vs = next();
    else if (a === '-j' || a === '--workers') o.workers = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--json') o.json = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--scenario') o.scenario = next();
    else if (a === '--probe') o.probe = true;
    else if (a === '--rows') o.rows = next();
    else if (a === '--worker') o.worker = true;
    else if (a === '-h' || a === '--help') { const src = require('fs').readFileSync(__filename, 'utf8').split('\n'); console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  return o;
}

// ---------------------------------------------------------------- one seed
const hhmm = (V, tick) => {
  const x = V.DAY_START_H + tick / V.TICKS_PER_S / 3600;
  const h = Math.floor(x) % 24, m = Math.floor((x % 1) * 60 + 1e-9);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};

async function sim() {
  const [ap, step, params, scen, grid, helpers] = await Promise.all([load('sim/autopilot.js'), load('sim/step.js'), load('sim/params.js'),
    load('content/scenarios.js'), load('sim/grid.js'), load('tests/lib/sim-helpers.js')]);
  return {runPar: ap.runPar, createState: step.createState, step: step.step, V: params.V, getScenario: scen.getScenario,
    security: grid.security, injectTrip: helpers.injectTrip};
}

// H-8 containment probe (--probe), as tools/baseline-v4.js parDay measures it: at most one SECURE
// state per PROBE_EVERY_S; a candidate whose fresh preview is not SECURE is re-checked after PROBE_RETRY_S.
const PROBE_EVERY_S = 900, PROBE_RETRY_S = 60;

/** A JSON copy of the state, its future contingencies removed, the largest unit ('unit') or the tie ('link') tripped now: the nadir over the watch. */
function probeTrip(S, state, sec, kind) {
  const V = S.V, TPS = V.TICKS_PER_S;
  const p = JSON.parse(JSON.stringify(state));
  p.ext.events = p.ext.events.filter((e, i) => i < p.evNext || !e.contingency);
  S.injectTrip(p, sec, kind);
  let minHz = Infinity;
  while (!p.over && p.tick < (sec + V.WATCH_S) * TPS) { S.step(p); if (p.phys.fHz < minHz) minHz = p.phys.fHz; }
  return minHz;
}

/** The seed's day type: the hidden regime's temperature class (a heatwave day reads HOT in state.day), and the weekend. */
function dayType(st) {
  const temp = st.ext.regime.temp || (st.ext.regime.cls === 'heat' ? 'HEATWAVE' : st.day ? st.day.temp : 'HOT');
  return temp + (st.day && st.day.weekend ? ' weekend' : '');
}

/** Run one proxy on one seed; a plain summary row (and par's actions when asked; the H-8 probe when asked). */
function runOne(S, scenario, seed, proxy, withActions, probe) {
  const V = S.V, TPS = V.TICKS_PER_S;
  let firstShed = -1, minDemandMW = Infinity, minDemandTick = 0, negS = 0, autoMWs = 0, msl = 0;
  let nextProbe = V.PLAYER_START_S;
  const P = {n: 0, fails: 0, worst: Infinity, unitN: 0, unitFails: 0, unitWorst: Infinity, linkN: 0, linkFails: 0, linkWorst: Infinity,
    fresh: 0, live: 0, freshFails: 0, failed: []};
  const noPreview = {previewNadirHz: V.F0_HZ};
  const t0 = process.hrtime.bigint();
  const r = S.runPar(seed, scenario, {proxy, onStep: st => {
    const t = st.tick;
    if (firstShed < 0 && t % TPS === 1 && st.city.shedFrac > 0) firstShed = t;
    if (t % TPS !== 0 || st.over) return;
    // A completed grid second (as tools/baseline-v4.js samples it): state.price is its price.
    if (st.env.demandMW < minDemandMW) { minDemandMW = st.env.demandMW; minDemandTick = t; }
    if (st.price.mwh < 0) negS++;
    autoMWs += st.ren.windAutoMW * (1 - st.ofgs.trippedFrac) + st.ren.solarAutoMW;
    if (st.msl && st.msl.level > msl) msl = st.msl.level;
    if (!probe) return;
    const sec = t / TPS;
    if (sec < nextProbe || st.sec.lKind === 'none') return;
    const live = st.sec.level === 'SECURE';
    const fresh = live || S.security(st, noPreview).level === 'SECURE' ? S.security(st).level === 'SECURE' : false;
    if (!fresh && !live) { nextProbe = sec + PROBE_RETRY_S; return; }
    nextProbe = sec + PROBE_EVERY_S;
    const importing = !st.tie.tripped && st.tie.flowMW > V.EVENT_THRESHOLD_MW;
    const hz = {unit: probeTrip(S, st, sec, 'unit'), link: importing ? probeTrip(S, st, sec, 'link') : Infinity};
    const low = Math.min(hz.unit, hz.link);
    P.n++;
    if (fresh) P.fresh++;
    if (live) P.live++;
    if (low < V.CONTAIN_LO_HZ) {
      // A state the desk showed SECURE on a cached preview may no longer be SECURE on a fresh one.
      P.fails++;
      if (fresh) P.freshFails++;
      P.failed.push(hhmm(V, t) + ' ' + (hz.unit < V.CONTAIN_LO_HZ ? 'unit ' + hz.unit.toFixed(3) : 'link ' + hz.link.toFixed(3)) + ' Hz (' +
        (fresh ? 'SECURE on a fresh preview' : 'SECURE only on the cached preview') + ')');
    }
    if (low < P.worst) P.worst = low;
    for (const k of ['unit', 'link']) {
      if (hz[k] === Infinity) continue;
      P[k + 'N']++;
      if (hz[k] < V.CONTAIN_LO_HZ) P[k + 'Fails']++;
      if (hz[k] < P[k + 'Worst']) P[k + 'Worst'] = hz[k];
    }
  }});
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  const st = r.state, sc = r.score;
  const count = t => r.log.filter(x => x.type === t).length;
  const byRule = {};
  r.origins.forEach(o => { if (/^rule/.test(o)) byRule[o] = (byRule[o] || 0) + 1; });
  const fin = x => (Number.isFinite(x) ? x : null);
  const rule4Stops = r.log.filter((x, i) => x.type === 'stop' && r.origins[i] === 'rule4');
  const row = {
    seed, proxy, weather: st.ext.regime.cls, day: dayType(st), black: r.black, endsAt: hhmm(V, st.tick),
    unservedMWh: sc.unservedMWh, uflsMWh: sc.uflsMWh, directedMWh: sc.directedMWh, firstShed: firstShed < 0 ? '' : hhmm(V, firstShed),
    rert: count('armRERT') > 0, drCalls: count('callDR'), costDollars: r.summary.costDollars, centsPerKWh: r.summary.centsPerKWh,
    co2tPerMWh: r.summary.co2tPerMWh, trips: st.conts.length, starts: sc.starts, actions: r.memo.actions,
    planInputs: r.origins.filter(o => o === 'plan').length, replanInputs: r.origins.filter(o => o === 'replan').length, secs,
    // Phase 2a (desk/README.md §21.3). The automatic cut is the dispatch's own (C-6; wind after OFGS);
    // score.spillMWh also holds the manual LIMIT and the inverters' over-frequency back-off (C-7).
    minDemandMW: fin(minDemandMW), minDemandAt: hhmm(V, minDemandTick), negPriceH: negS / V.S_PER_H, spillMWh: sc.spillMWh || 0,
    autoSpillMWh: autoMWs / V.S_PER_H, maxHz: sc.maxHz, minHz: sc.minHz, msl, byRule,
    coalStops: rule4Stops.filter(x => /^coal/.test(x.args.unit)).length, gasStops: rule4Stops.filter(x => !/^coal/.test(x.args.unit)).length,
    charges: r.log.filter((x, i) => x.type === 'battery' && x.args.mode === 'charge' && r.origins[i] === 'rule6').length,
    battEndMWh: st.battery.socMWh,
  };
  if (probe) row.probe = Object.assign({}, P, {worst: fin(P.worst), unitWorst: fin(P.unitWorst), linkWorst: fin(P.linkWorst)});
  if (withActions) {
    row.actionsList = r.log.map((x, i) => [x, r.origins[i]]).filter(([, o]) => o !== 'plan' && o !== 'replan')
      .map(([x, o]) => hhmm(V, x.tick) + ' ' + o + ' ' + x.type + (x.type === 'planLoad' ? ' (re-dispatch from ' + hhmm(V, x.args.fromS * TPS) + ', ' +
        Object.values(x.args.stations).reduce((a, k) => a + k.length, 0) + ' keys)' : Object.keys(x.args).length ? ' ' + JSON.stringify(x.args) : ''));
    row.contingencies = st.conts.map(c => hhmm(V, c.startTick) + ' ' + c.cause + ' ' + c.id + ' ' + Math.round(c.lostMW) + ' MW, extreme ' +
      c.extremeHz.toFixed(3) + ' Hz' + (c.uflsStages ? ', UFLS ' + c.uflsStages : ''));
  }
  return row;
}

/** S-5 letter grade of `row` against par's row on the same seed (ΔU = player - par unserved). */
function grade(row, par) {
  if (row.black) return 'F';
  const du = row.unservedMWh - par.unservedMWh;
  if (du <= 10) return row.costDollars <= par.costDollars * 1.05 ? 'A' : 'B';
  if (du <= 150) return 'B';
  if (du <= 600) return 'C';
  return 'D';
}

// ---------------------------------------------------------------- seeds
async function seedList(S, o, scenario) {
  if (o.seed !== null) return [o.seed];
  const [a, b] = o.seeds || [1, o.heat || 20];
  if (!o.heat) return Array.from({length: b - a + 1}, (_, i) => a + i);
  const want = o.seeds ? b : o.heat, from = o.seeds ? a : 1, out = [];
  let k = 0;
  for (let seed = 1; out.length < want - from + 1; seed++) {
    if (S.createState(seed, scenario).ext.regime.cls !== 'heat') continue;
    k++;
    if (k >= from) out.push(seed);
  }
  return out;
}

// ---------------------------------------------------------------- workers
function runWorkers(o, seeds, jobs) {
  const n = Math.min(o.workers, seeds.length);
  const chunks = Array.from({length: n}, () => []);
  seeds.forEach((s, i) => chunks[i % n].push(s));
  const rows = [];
  return Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker'], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
    child.on('message', m => { if (m.row) rows.push(m.row); });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error('worker exited with ' + code))));
    child.send({scenario: o.scenario, seeds: chunk, jobs, probe: o.probe});
  }))).then(() => rows);
}

async function workerMain() {
  const S = await sim();
  process.on('message', m => {
    const scenario = S.getScenario(m.scenario);
    for (const seed of m.seeds) for (const j of m.jobs) process.send({row: runOne(S, scenario, seed, j.proxy, false, m.probe && j === m.jobs[0])});
    process.disconnect();
  });
}

// ---------------------------------------------------------------- report
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : '-');
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : '-');
const f3 = x => (Number.isFinite(x) ? x.toFixed(3) : '-');
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (k, n) => (n ? (100 * k / n).toFixed(1) + '%' : '-');

function table(rows, cols) {
  const w = cols.map(c => Math.max(c[0].length, ...rows.map(r => String(c[1](r)).length)));
  const line = vals => vals.map((v, i) => String(v).padStart(w[i])).join('  ');
  console.log(line(cols.map(c => c[0])));
  for (const r of rows) console.log(line(cols.map(c => c[1](r))));
}

function summary(title, rows) {
  const n = rows.length, isClean = r => r.unservedMWh === 0 && !r.black, clean = rows.filter(isClean).length;
  const byW = {};
  for (const r of rows) { const g = byW[r.weather] || (byW[r.weather] = {n: 0, clean: 0, rert: 0}); g.n++; if (isClean(r)) g.clean++; if (r.rert) g.rert++; }
  const black = rows.filter(r => r.black), rertN = rows.filter(r => r.rert).length, sum = k => rows.reduce((a, r) => a + r[k], 0);
  console.log('\n' + title);
  table([
    ['seeds', n], ['zero unserved (no UFLS, no directed shedding, not black)', clean + ' (' + pct(clean, n) + ')'],
    ['black', black.length + (black.length ? ': seeds ' + black.map(r => r.seed + ' (' + r.day + ', ' + r.endsAt + ')').join(', ') : '')],
    ['RERT armed', rertN + ' (' + pct(rertN, n) + ')'],
    ['DR calls (mean per day)', f2(mean(rows.map(r => r.drCalls)))], ['unserved MWh (mean / max)', f1(mean(rows.map(r => r.unservedMWh))) + ' / ' + f1(Math.max(...rows.map(r => r.unservedMWh)))],
    ['cost c/kWh (median / mean)', f3(median(rows.map(r => r.centsPerKWh))) + ' / ' + f3(mean(rows.map(r => r.centsPerKWh)))],
    ['carbon t/MWh (median)', f3(median(rows.map(r => r.co2tPerMWh)))],
    ['day runtime s (median / max)', f2(median(rows.map(r => r.secs))) + ' / ' + f2(Math.max(...rows.map(r => r.secs)))],
    ['by weather (clean / RERT of n)', Object.keys(byW).sort().map(k => k + ' ' + byW[k].clean + '/' + byW[k].rert + ' of ' + byW[k].n).join(', ')],
    ['rule 4 stops (coal / gas, all seeds)', sum('coalStops') + ' / ' + sum('gasStops') +
      (sum('coalStops') ? '; coal on seeds ' + rows.filter(r => r.coalStops).map(r => r.seed).join(', ') : '')],
    ['rule 6 charge orders (mean per day)', f2(mean(rows.map(r => r.charges)))],
    ['discrete actions (mean per day)', f1(mean(rows.map(r => r.actions))) + '; rule 7 ' + f1(mean(rows.map(r => r.byRule.rule7 || 0)))],
  ].map(([k, v]) => ({k, v})), [['measure', r => r.k], ['value', r => r.v]]);
  // Phase 2a: the belly by day type (P-3 minimum demand, P-9 negative-price hours, C-6 spill, C-7 peak, P-4 MSL).
  const types = [...new Set(rows.map(r => r.day))].sort();
  console.log('\nby day type');
  table(types.concat(types.length > 1 ? ['all'] : []).map(d => {
    const g = d === 'all' ? rows : rows.filter(r => r.day === d);
    const neg = g.map(r => r.negPriceH), hi = g.reduce((a, r) => (r.maxHz > a.maxHz ? r : a), g[0]), lo = g.reduce((a, r) => (r.minDemandMW < a.minDemandMW ? r : a), g[0]);
    const cleanN = g.filter(isClean).length, rertG = g.filter(r => r.rert).length;
    return {d, n: g.length, clean: cleanN + ' (' + pct(cleanN, g.length) + ')', black: g.filter(r => r.black).length, rert: rertG + ' (' + pct(rertG, g.length) + ')',
      minDem: f1(median(g.map(r => r.minDemandMW))) + ' / ' + f1(lo.minDemandMW) + ' (seed ' + lo.seed + ')',
      neg: f2(median(neg)) + ' / ' + f2(mean(neg)) + ' / ' + f2(Math.max(...neg)), negDays: g.filter(r => r.negPriceH > 0).length,
      spill: f1(mean(g.map(r => r.spillMWh))) + ' / ' + f1(mean(g.map(r => r.autoSpillMWh))) + ' / ' + f1(Math.max(...g.map(r => r.autoSpillMWh))),
      hz: f3(hi.maxHz) + ' (seed ' + hi.seed + ')', msl: [1, 2, 3].map(l => g.filter(r => r.msl === l).length).join(' / '),
      cost: f3(median(g.map(r => r.centsPerKWh)))};
  }), [['day type', r => r.d], ['n', r => r.n], ['clean', r => r.clean], ['black', r => r.black], ['RERT', r => r.rert],
    ['min operational demand MW (median / lowest)', r => r.minDem], ['price < $0, h (median / mean / max)', r => r.neg], ['days with any', r => r.negDays],
    ['spilled MWh (score mean / automatic cut mean / max)', r => r.spill], ['peak Hz', r => r.hz], ['days at MSL 1 / 2 / 3', r => r.msl], ['c/kWh (median)', r => r.cost]]);
  if (rows.some(r => r.probe)) {
    const tot = k => rows.reduce((a, r) => a + (r.probe ? r.probe[k] : 0), 0);
    const worst = k => { const xs = rows.filter(r => r.probe && r.probe[k] !== null).map(r => [r.probe[k], r.seed]).sort((a, b) => a[0] - b[0]); return xs.length ? f3(xs[0][0]) + ' Hz (seed ' + xs[0][1] + ')' : '-'; };
    const line = (what, k, fails, w) => ({what, v: (tot(k) - tot(fails)) + ' of ' + tot(k) + ' hold 49.5 Hz; worst ' + worst(w)});
    console.log('\nH-8: a credible trip from a SECURE state (at most one state per ' + PROBE_EVERY_S / 60 + ' grid-min, tripped in a copy)');
    table([line('either credible contingency', 'n', 'fails', 'worst'), line('losing the largest unit', 'unitN', 'unitFails', 'unitWorst'),
      line('losing the tie import (> 50 MW)', 'linkN', 'linkFails', 'linkWorst')], [['trip', r => r.what], ['nadir', r => r.v]]);
    console.log(tot('fresh') + ' of the ' + tot('n') + ' states were SECURE on a fresh preview (' + tot('freshFails') + ' of them below 49.5 Hz), ' + tot('live') + ' as the desk showed it');
    const bad = rows.filter(r => r.probe && r.probe.fails > 0);
    if (bad.length) console.log('states below 49.5 Hz: ' + bad.map(r => 'seed ' + r.seed + ' ' + r.probe.failed.join(', ')).join('; '));
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.worker) return workerMain();
  const S = await sim();
  const scenario = S.getScenario(o.scenario);
  const seeds = await seedList(S, o, scenario);
  const jobs = [{proxy: o.proxy}];
  if ((o.grade || o.vs) && o.proxy !== 'par') jobs.push({proxy: 'par'});
  if (o.vs && !jobs.some(j => j.proxy === o.vs)) jobs.push({proxy: o.vs});
  const t0 = Date.now();
  let rows;
  if (o.workers > 1 && seeds.length > 1) {
    rows = await runWorkers(o, seeds, jobs);
  } else {
    rows = [];
    for (const seed of seeds) for (const j of jobs) {
      const row = runOne(S, scenario, seed, j.proxy, seeds.length === 1 && !o.json, o.probe && j === jobs[0]);
      rows.push(row);
      if (o.json) console.log(JSON.stringify(row));
    }
  }
  if (o.rows) require('fs').writeFileSync(o.rows, rows.slice().sort((a, b) => a.seed - b.seed).map(r => JSON.stringify(r)).join('\n') + '\n');
  if (o.json && o.workers > 1) for (const r of rows.sort((a, b) => a.seed - b.seed)) console.log(JSON.stringify(r));
  if (o.json) return;
  const main = rows.filter(r => r.proxy === o.proxy).sort((a, b) => a.seed - b.seed);
  const parBy = new Map(rows.filter(r => r.proxy === 'par').map(r => [r.seed, r]));
  const vsBy = o.vs ? new Map(rows.filter(r => r.proxy === o.vs).map(r => [r.seed, r])) : null;
  if (o.grade) for (const r of main) r.grade = o.proxy === 'par' ? 'A' : grade(r, parBy.get(r.seed));
  if (!o.quiet) {
    console.log(`\n${o.proxy} on ${scenario.id}` + (o.heat ? ', forced-heatwave seeds' : '') + ` (SIM ${(await load('sim/params.js')).SIM_VERSION})`);
    const cols = [['seed', r => r.seed], ['weather', r => r.weather], ['day', r => r.day], ['black', r => (r.black ? 'BLACK ' + r.endsAt : '')],
      ['unservedMWh', r => f1(r.unservedMWh)], ['ufls', r => f1(r.uflsMWh)], ['directed', r => f1(r.directedMWh)], ['firstShed', r => r.firstShed],
      ['RERT', r => (r.rert ? 'yes' : '')], ['DR', r => r.drCalls], ['c/kWh', r => f3(r.centsPerKWh)], ['tCO2/MWh', r => f3(r.co2tPerMWh)],
      ['minDem', r => f1(r.minDemandMW) + ' ' + r.minDemandAt], ['neg h', r => f2(r.negPriceH)], ['spill', r => f1(r.spillMWh)], ['auto', r => f1(r.autoSpillMWh)],
      ['maxHz', r => f3(r.maxHz)], ['MSL', r => r.msl || ''], ['coalStop', r => r.coalStops || ''],
      ['trips', r => r.trips], ['actions', r => r.actions], ['s', r => f2(r.secs)]];
    if (o.grade) cols.push(['grade', r => r.grade]);
    if (vsBy) cols.push([o.vs + ' c/kWh', r => f3(vsBy.get(r.seed).centsPerKWh)]);
    table(main, cols);
    if (main.length === 1 && main[0].actionsList) {
      console.log('\ncontingencies:\n  ' + (main[0].contingencies.join('\n  ') || '(none)'));
      console.log('\ndiscrete actions (' + main[0].actionsList.length + '; the plan\'s ' + main[0].planInputs + ' planLoad input(s) and ' +
        main[0].replanInputs + ' re-plans (planLoad) are not listed):\n  ' + main[0].actionsList.join('\n  '));
    }
  }
  summary(`summary: ${o.proxy}, ${main.length} seeds` + (o.heat ? ' (forced heatwave)' : '') + `, wall ${((Date.now() - t0) / 1000).toFixed(0)} s`, main);
  if (o.grade) {
    const g = {A: 0, B: 0, C: 0, D: 0, F: 0};
    for (const r of main) g[r.grade]++;
    console.log('\nS-5 grades against par: ' + Object.entries(g).map(([k, v]) => k + ' ' + v + ' (' + pct(v, main.length) + ')').join(', '));
  }
  if (vsBy) {
    const dearer = main.filter(r => vsBy.get(r.seed).costDollars > r.costDollars).length;
    console.log(`\nS-11: ${o.vs} costs more than ${o.proxy} on ${dearer} of ${main.length} seeds (${pct(dearer, main.length)})`);
  }
}

// Run as a script (or as one of its own workers); tools/baseline-v4.js requires it for grade().
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {grade};

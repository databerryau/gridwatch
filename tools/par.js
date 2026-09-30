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
//
// Flags: --seed N | --seeds A-B (default 1-20) | --heat N (first N heat seeds, or with --seeds A-B
// the heat seeds number A..B) | --proxy P (par, planOnly, doNothing, lean, competent,
// commitAll, fuzz) | --grade (grade the proxy against par on each seed, S-5) | --vs P (also run
// proxy P and count the seeds where it costs more than the main proxy, S-11) | -j/--workers N
// | --json | --quiet (summary only) | --scenario ID.
// The weather class shown is the seed's hidden regime: this is a measurement tool, and it
// reads state.ext for reporting only (par itself never sees it, S-4).
'use strict';
const path = require('path');
const {fork} = require('child_process');
const {pathToFileURL} = require('url');

const ROOT = path.join(__dirname, '..');
const load = rel => import(pathToFileURL(path.join(ROOT, rel)).href);

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const o = {seeds: null, seed: null, heat: 0, proxy: 'par', grade: false, vs: null, workers: 1, json: false, quiet: false,
    scenario: 'classic', worker: false};
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
    else if (a === '--worker') o.worker = true;
    else if (a === '-h' || a === '--help') { console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(0, 22).join('\n')); process.exit(0); }
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
  const [ap, step, params, scen] = await Promise.all([load('sim/autopilot.js'), load('sim/step.js'), load('sim/params.js'),
    load('content/scenarios.js')]);
  return {runPar: ap.runPar, createState: step.createState, V: params.V, getScenario: scen.getScenario};
}

/** Run one proxy on one seed; a plain summary row (and par's actions when asked). */
function runOne(S, scenario, seed, proxy, withActions) {
  const V = S.V, TPS = V.TICKS_PER_S;
  let firstShed = -1;
  const t0 = process.hrtime.bigint();
  const r = S.runPar(seed, scenario, {proxy, onStep: st => {
    if (firstShed < 0 && st.tick % TPS === 1 && st.city.shedFrac > 0) firstShed = st.tick;
  }});
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  const st = r.state, sc = r.score;
  const count = t => r.log.filter(x => x.type === t).length;
  const row = {
    seed, proxy, weather: st.ext.regime.cls, black: r.black, endsAt: hhmm(V, st.tick),
    unservedMWh: sc.unservedMWh, uflsMWh: sc.uflsMWh, directedMWh: sc.directedMWh, firstShed: firstShed < 0 ? '' : hhmm(V, firstShed),
    rert: count('armRERT') > 0, drCalls: count('callDR'), costDollars: r.summary.costDollars, centsPerKWh: r.summary.centsPerKWh,
    co2tPerMWh: r.summary.co2tPerMWh, trips: st.conts.length, starts: sc.starts, actions: r.memo.actions,
    planInputs: r.origins.filter(o => o === 'plan').length, replanInputs: r.origins.filter(o => o === 'replan').length, secs,
  };
  if (withActions) {
    row.actionsList = r.log.map((x, i) => [x, r.origins[i]]).filter(([, o]) => o !== 'plan' && o !== 'replan')
      .map(([x, o]) => hhmm(V, x.tick) + ' ' + o + ' ' + x.type + (Object.keys(x.args).length ? ' ' + JSON.stringify(x.args) : ''));
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
    child.send({scenario: o.scenario, seeds: chunk, jobs});
  }))).then(() => rows);
}

async function workerMain() {
  const S = await sim();
  process.on('message', m => {
    const scenario = S.getScenario(m.scenario);
    for (const seed of m.seeds) for (const j of m.jobs) process.send({row: runOne(S, scenario, seed, j.proxy, false)});
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
  const n = rows.length, clean = rows.filter(r => r.unservedMWh === 0 && !r.black).length;
  const byW = {};
  for (const r of rows) { const g = byW[r.weather] || (byW[r.weather] = {n: 0, clean: 0, rert: 0}); g.n++; if (r.unservedMWh === 0 && !r.black) g.clean++; if (r.rert) g.rert++; }
  console.log('\n' + title);
  table([
    ['seeds', n], ['zero unserved (no UFLS, no directed shedding, not black)', clean + ' (' + pct(clean, n) + ')'],
    ['black', rows.filter(r => r.black).length], ['RERT armed', rows.filter(r => r.rert).length + ' (' + pct(rows.filter(r => r.rert).length, n) + ')'],
    ['DR calls (mean per day)', f2(mean(rows.map(r => r.drCalls)))], ['unserved MWh (mean / max)', f1(mean(rows.map(r => r.unservedMWh))) + ' / ' + f1(Math.max(...rows.map(r => r.unservedMWh)))],
    ['cost c/kWh (median / mean)', f3(median(rows.map(r => r.centsPerKWh))) + ' / ' + f3(mean(rows.map(r => r.centsPerKWh)))],
    ['carbon t/MWh (median)', f3(median(rows.map(r => r.co2tPerMWh)))],
    ['day runtime s (median / max)', f2(median(rows.map(r => r.secs))) + ' / ' + f2(Math.max(...rows.map(r => r.secs)))],
    ['by weather (clean / RERT of n)', Object.keys(byW).sort().map(k => k + ' ' + byW[k].clean + '/' + byW[k].rert + ' of ' + byW[k].n).join(', ')],
  ].map(([k, v]) => ({k, v})), [['measure', r => r.k], ['value', r => r.v]]);
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
      const row = runOne(S, scenario, seed, j.proxy, seeds.length === 1 && !o.json);
      rows.push(row);
      if (o.json) console.log(JSON.stringify(row));
    }
  }
  if (o.json && o.workers > 1) for (const r of rows.sort((a, b) => a.seed - b.seed)) console.log(JSON.stringify(r));
  if (o.json) return;
  const main = rows.filter(r => r.proxy === o.proxy).sort((a, b) => a.seed - b.seed);
  const parBy = new Map(rows.filter(r => r.proxy === 'par').map(r => [r.seed, r]));
  const vsBy = o.vs ? new Map(rows.filter(r => r.proxy === o.vs).map(r => [r.seed, r])) : null;
  if (o.grade) for (const r of main) r.grade = o.proxy === 'par' ? 'A' : grade(r, parBy.get(r.seed));
  if (!o.quiet) {
    console.log(`\n${o.proxy} on ${scenario.id}` + (o.heat ? ', forced-heatwave seeds' : '') + ` (SIM ${(await load('sim/params.js')).SIM_VERSION})`);
    const cols = [['seed', r => r.seed], ['weather', r => r.weather], ['black', r => (r.black ? 'BLACK ' + r.endsAt : '')],
      ['unservedMWh', r => f1(r.unservedMWh)], ['ufls', r => f1(r.uflsMWh)], ['directed', r => f1(r.directedMWh)], ['firstShed', r => r.firstShed],
      ['RERT', r => (r.rert ? 'yes' : '')], ['DR', r => r.drCalls], ['c/kWh', r => f3(r.centsPerKWh)], ['tCO2/MWh', r => f3(r.co2tPerMWh)],
      ['trips', r => r.trips], ['actions', r => r.actions], ['s', r => f2(r.secs)]];
    if (o.grade) cols.push(['grade', r => r.grade]);
    if (vsBy) cols.push([o.vs + ' c/kWh', r => f3(vsBy.get(r.seed).centsPerKWh)]);
    table(main, cols);
    if (main.length === 1 && main[0].actionsList) {
      console.log('\ncontingencies:\n  ' + (main[0].contingencies.join('\n  ') || '(none)'));
      console.log('\ndiscrete actions (' + main[0].actionsList.length + '; the plan\'s ' + main[0].planInputs + ' keyframe inputs and the ' +
        main[0].replanInputs + ' of par\'s re-plans are not listed):\n  ' + main[0].actionsList.join('\n  '));
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

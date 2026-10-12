// GRIDWATCH: the gate-checked dailies (SPEC D-9; desk/README.md Q-75, §32.7.1). Plays par on each
// date's candidates and writes content/dailies.js. Not loaded by the game. CommonJS
// (tools/package.json); the ES-module sim is loaded with await import().
//
//   node tools/daily-gen.js --from 2026-10-12 --days 365 -j 8   # gate 365 dates, write the list
//   node tools/daily-gen.js --from 2026-10-12 --days 2 --dry    # a smoke check: report, no write
//   node tools/daily-gen.js --check -j 8                        # re-gate the shipped list under this build
//
// Flags: --from YYYY-MM-DD | --days N (default 365) | -j/--workers N | --dry (no write) | --check |
// --pool FILE (the Hard-day pool, one JSON line per rejected seed) | --json (one JSON line per date).
//
// Candidates (Q-75): attempt k of a date is seedOf(YYYYMMDD, k) = YYYYMMDD + k x 10^8, on the
// scenario of the date (scenarioIdOf: Saturday and Sunday play desk-weekend). Attempt 0 is the
// date itself; a later attempt is played only when its class, the hidden regime's temp and cls
// (MILD|calm, HEATWAVE|heat, ...), is attempt 0's: the class is never stepped down. At most
// CAP + 1 attempts (k <= 40): a date with none passing is a LOUD failure and nothing is written.
// The gate runs along par's day (runPar, an onStep at every whole minute):
//   (1) the optimistic bound (SPEC §3.2: every machine not tripped and not on outage at its
//       available MW, the tie at its import limit unless tripped, the battery, the diesel and DR at
//       their ratings, the wind and solar available; plus the city's air-con at rated MW inside its
//       window on a day that offers it) is never below operational demand before booked flex; and
//   (2) market.isClean(score, black): no UFLS, no directed shedding, not black (a task feeder's
//       lag never rejects a date, Q-69).
// The list ships exceptions only, {v, from, to, attempts: {YYYYMMDD: k}}, with v the build stamp
// app/game.js dailyStamp() (SIM_VERSION and both desk scenarios' hashes): tests/dailies.test.js
// fails a list whose stamp is not the build's. Rejected seeds are the Hard-day pool (S-7), reported
// and never shipped. The report: the attempts histogram, the class shares (heat, storm, drought,
// calm; MILD/HOT), the pool, D-10 by class (tools/day-measure.mjs gaps() on each shipped day: the
// worst gap and the decisions per act) and the wall and single-core times.
'use strict';
const path = require('path');
const fs = require('fs');
const {fork} = require('child_process');
const {pathToFileURL} = require('url');

const ROOT = path.join(__dirname, '..'), LIST = path.join(ROOT, 'content', 'dailies.js');
const load = rel => import(pathToFileURL(path.join(ROOT, rel)).href);
const CAP = 40;

// ---------------------------------------------------------------- the gate (pure)

/** D-9 (1) at a state's present second: {boundMW, demandMW} (demand before booked flex). */
function bound(state, V) {
  const e = state.env, s = state.tick / V.TICKS_PER_S, lv = state.scn.levers;
  let mw = V.BATT_MW + V.RERT_MW + V.DR_MW + e.windAvailMW + e.solarAvailMW + (state.tie.tripped ? 0 : state.tie.limitMW);
  for (const u of state.units) if (u.mode !== 'tripped' && !(u.outUntilS > s)) mw += u.availMW;
  if (lv && lv.menu[state.day.temp].includes('aircon') && s >= V.AIRCON_FROM_S && s < V.AIRCON_TO_S) for (const x of lv.suburbs) mw += x.airconMW;
  return {boundMW: mw, demandMW: e.demandMW - e.flexMW};
}

/** D-9 on a played day {shortMin, score, black}: (1) and (2). */
const gate = (day, isClean) => day.shortMin === 0 && isClean(day.score, day.black);

/** The list to ship: exceptions only, keys in the shipped order. */
function listOf(rows, from, to, v) {
  const attempts = {};
  for (const r of rows.slice().sort((a, b) => a.ymd - b.ymd)) if (r.k > 0) attempts[r.ymd] = r.k;
  return {v, from, to, attempts};
}

/** content/dailies.js's DAILIES line for a list (the attempts eight to a line). */
function render(L) {
  const at = Object.entries(L.attempts).map(([d, k]) => d + ': ' + k), lines = [];
  for (let i = 0; i < at.length; i += 8) lines.push(at.slice(i, i + 8).join(', '));
  const body = lines.length > 1 ? '{\n  ' + lines.join(',\n  ') + ',\n}' : '{' + lines.join('') + '}';
  return 'export const DAILIES = {v: ' + JSON.stringify(L.v).replace(/"/g, '\'') + ', from: \'' + L.from + '\', to: \'' + L.to + '\', attempts: ' + body + '};';
}

/** The file with its DAILIES literal replaced (everything else kept). */
function writeList(src, L) {
  const re = /export const DAILIES = \{[\s\S]*?\};\n/;
  if (!re.test(src)) throw new Error('content/dailies.js: no DAILIES literal');
  return src.replace(re, render(L) + '\n');
}

// ---------------------------------------------------------------- one date

async function sim() {
  const [ap, step, params, scen, daily, market, dm] = await Promise.all(['sim/autopilot.js', 'sim/step.js', 'sim/params.js',
    'content/scenarios.js', 'content/dailies.js', 'sim/market.js', 'tools/day-measure.mjs'].map(load));
  return {runPar: ap.runPar, createState: step.createState, V: params.V, SIM_VERSION: params.SIM_VERSION, getScenario: scen.getScenario,
    seedOf: daily.seedOf, scenarioIdOf: daily.scenarioIdOf, DAILIES: daily.DAILIES, isClean: market.isClean, dm};
}

/** Par's day on one candidate, gated (and its D-10). */
function play(S, seed, scn) {
  const V = S.V, MIN_T = V.S_PER_MIN * V.TICKS_PER_S, st0 = S.createState(seed, scn), msl = S.dm.mslSampler();
  const open = JSON.parse(JSON.stringify(st0));
  let shortMin = 0, worstMW = Infinity;
  const r = S.runPar(seed, scn, {state: st0, hashEveryS: V.DAY_S + 1, onStep: st => {
    msl.onStep(st);
    if (st.tick % MIN_T !== 0 || st.over) return;
    const b = bound(st, V), m = b.boundMW - b.demandMW;
    if (m < 0) shortMin++;
    if (m < worstMW) worstMW = m;
  }});
  const day = {seed, shortMin, worstMW, score: r.score, black: r.black};
  day.pass = gate(day, S.isClean);
  day.d10 = S.dm.d10(seed, scn, {st0: open, r, msl: msl.at});
  return day;
}

const classOf = st => st.ext.regime.temp + '|' + st.ext.regime.cls;

/** Gate one date: the first passing attempt of its class, or k -1 at the cap. want: only that attempt (--check). */
function genDate(S, ymd, want) {
  const t0 = process.hrtime.bigint(), scn = S.getScenario(S.scenarioIdOf(ymd)), cls = classOf(S.createState(ymd, scn));
  const rejected = [];
  let played = 0, hit = null;
  for (let k = want === undefined ? 0 : want; k <= (want === undefined ? CAP : want); k++) {
    const seed = S.seedOf(ymd, k);
    if (k > 0 && classOf(S.createState(seed, scn)) !== cls) continue;
    const day = play(S, seed, scn);
    played++;
    if (day.pass) { hit = Object.assign(day, {k}); break; }
    rejected.push({ymd, k, seed, scenario: scn.id, cls, shortMin: day.shortMin, uflsMWh: day.score.uflsMWh, directedMWh: day.score.directedMWh, black: day.black});
  }
  return {ymd, scenario: scn.id, cls, k: hit ? hit.k : -1, played, rejected, d10: hit ? hit.d10 : null,
    secs: Number(process.hrtime.bigint() - t0) / 1e9};
}

// ---------------------------------------------------------------- the command line

function parseArgs(argv) {
  const o = {from: null, days: 365, workers: 1, dry: false, check: false, pool: null, json: false, worker: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--from') o.from = next();
    else if (a === '--days') o.days = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '-j' || a === '--workers') o.workers = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--dry') o.dry = true;
    else if (a === '--check') o.check = true;
    else if (a === '--pool') o.pool = next();
    else if (a === '--json') o.json = true;
    else if (a === '--worker') o.worker = true;
    else if (a === '-h' || a === '--help') { const src = fs.readFileSync(__filename, 'utf8').split('\n'); console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  if (!o.check && !o.from) throw new Error('--from YYYY-MM-DD is needed (or --check)');
  return o;
}

const iso = ymd => String(ymd).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3');
function dates(from, days) {
  const t = Date.parse(from + 'T00:00:00Z'), out = [];
  for (let k = 0; k < days; k++) { const d = new Date(t + k * 864e5); out.push(d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()); }
  return out;
}

function runWorkers(o, jobs) {
  const n = Math.min(o.workers, jobs.length), chunks = Array.from({length: n}, () => []), rows = [];
  jobs.forEach((j, i) => chunks[i % n].push(j));
  return Promise.all(chunks.map(c => new Promise((res, rej) => {
    const child = fork(__filename, ['--worker'], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
    child.on('message', m => rows.push(m.row));
    child.on('exit', code => (code === 0 ? res() : rej(new Error('worker exited with ' + code))));
    child.send({jobs: c});
  }))).then(() => rows);
}

const pct = (k, n) => (n ? (100 * k / n).toFixed(1) + '%' : '-');
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

function report(rows, S, wall) {
  const ok = rows.filter(r => r.k >= 0), n = rows.length, pool = rows.flatMap(r => r.rejected), D10 = S.dm.D10;
  console.log(`\ndaily-gen: ${n} dates (SIM ${S.SIM_VERSION}), wall ${wall.toFixed(0)} s, single-core ${rows.reduce((a, r) => a + r.secs, 0).toFixed(0)} s, par days played ${rows.reduce((a, r) => a + r.played, 0)}`);
  const hist = {};
  for (const r of rows) { const key = r.k < 0 ? 'cap' : 'k=' + r.k; hist[key] = (hist[key] || 0) + 1; }
  console.log('attempts (the shipped k): ' + Object.entries(hist).sort().map(([k, v]) => k + ' ' + v).join(', ') + '; attempt 0 passed on ' + pct(rows.filter(r => r.k === 0).length, n));
  const cls = c => rows.filter(r => r.cls.endsWith('|' + c)).length;
  console.log('classes: heat ' + pct(cls('heat'), n) + ', storm ' + pct(cls('storm'), n) + ', drought ' + pct(cls('drought'), n) + ', calm ' + pct(cls('calm'), n) +
    '; MILD ' + pct(rows.filter(r => r.cls.startsWith('MILD')).length, n) + ', HOT ' + pct(rows.filter(r => r.cls.startsWith('HOT')).length, n) +
    '; heat dates passing at attempt 0 ' + pct(rows.filter(r => r.k === 0 && r.cls.endsWith('|heat')).length, cls('heat')));
  console.log('Hard-day pool (rejected, never shipped): ' + pool.length + ' seeds' + (pool.length ? ', e.g. ' + pool.slice(0, 6).map(x => x.seed + ' (' + x.cls + (x.shortMin ? ', short ' + x.shortMin + ' min' : '') + (x.black ? ', black' : '') + ')').join(', ') : ''));
  for (const c of ['heat', 'storm', 'drought', 'calm']) {
    const g = ok.filter(r => r.cls.endsWith('|' + c) && r.d10);
    if (!g.length) continue;
    console.log('D-10 ' + c.padEnd(7) + ' n ' + String(g.length).padStart(3) + ': worst gap <= ' + D10.maxGapRealS + ' s on ' + pct(g.filter(r => r.d10.worstS <= D10.maxGapRealS).length, g.length) +
      ', median worst ' + median(g.map(r => r.d10.worstS)).toFixed(1) + ' s; opportunities per act (median) ' + [0, 1, 2].map(a => median(g.map(r => r.d10.perAct[a]))).join(' / '));
  }
  const cap = rows.filter(r => r.k < 0);
  if (cap.length) console.error('\n*** D-9 FAILED: no attempt of ' + cap.length + ' date(s) passed the gate within k <= ' + CAP + ': ' + cap.map(r => iso(r.ymd) + ' (' + r.cls + ')').join(', ') + ' ***');
  return {pool, cap};
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const S = await sim();
  if (o.worker) {
    process.on('message', m => { for (const j of m.jobs) process.send({row: genDate(S, j.ymd, j.k)}); process.disconnect(); });
    return;
  }
  const L = S.DAILIES;
  if (o.check && !L.from) throw new Error('--check: the shipped list is empty');
  const days = o.check ? Math.round((Date.parse(L.to) - Date.parse(L.from)) / 864e5) + 1 : o.days;
  const jobs = dates(o.check ? L.from : o.from, days).map(ymd => (o.check ? {ymd, k: L.attempts[ymd] || 0} : {ymd}));
  const t0 = Date.now();
  const rows = (o.workers > 1 && jobs.length > 1 ? await runWorkers(o, jobs) : jobs.map(j => genDate(S, j.ymd, j.k))).sort((a, b) => a.ymd - b.ymd);
  if (o.json) for (const r of rows) console.log(JSON.stringify(r));
  const {pool, cap} = report(rows, S, (Date.now() - t0) / 1000);
  if (o.pool) fs.writeFileSync(o.pool, pool.map(x => JSON.stringify(x)).join('\n') + (pool.length ? '\n' : ''));
  const stamp = (await load('app/game.js')).dailyStamp();
  if (o.check) {
    const stale = L.v !== stamp;
    console.log('\n--check: ' + rows.filter(r => r.k >= 0).length + ' of ' + rows.length + ' listed attempts pass under this build; the list\'s stamp ' + (stale ? 'is STALE (' + L.v + ' vs ' + stamp + ')' : 'is this build\'s'));
    if (cap.length || stale) process.exitCode = 1;
    return;
  }
  if (cap.length) { process.exitCode = 1; return; }
  const list = listOf(rows, iso(rows[0].ymd), iso(rows[rows.length - 1].ymd), stamp);
  if (o.dry) { console.log('\n--dry: content/dailies.js not written; it would hold ' + render(list)); return; }
  fs.writeFileSync(LIST, writeList(fs.readFileSync(LIST, 'utf8'), list));
  console.log('\nwrote content/dailies.js: ' + list.from + ' to ' + list.to + ', ' + Object.keys(list.attempts).length + ' exceptions, v ' + list.v);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {bound, gate, listOf, render, writeList, CAP};

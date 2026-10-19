// GRIDWATCH W7 Q10's count (decisions/2026-10-16-open-questions.md §10): how often does taking a coal unit off
// through the midday dip "until tomorrow" pay on the score's own ALL-IN (app/score.js: supply, plus carbon at the VER,
// plus any MWh dark at the VCR), against the line-follower's day? A count, not a test; run it once when the carbon
// price, the fleet or the line changes. Not loaded by the game. An ES module (.mjs: tools/package.json pins .js to CommonJS).
//
//   node tools/coal-off.mjs                      # 60 dailies spread over the calendar, one process
//   node tools/coal-off.mjs --n 60 -j 4          # the same on 4 worker processes
//   node tools/coal-off.mjs --dates 20261014,20261017 --at 9,10.5,12 --json
//
// Per date (its gate-checked seed and the date's scenario, as the page plays it): the follower's day (tests/lib/follow.js,
// the line's every action once a grid minute), then for each --at hour (default 9, 10.5, 12) the same follower with one
// coal unit stopped at the first minute from that hour at which one may stop (on, stopBlock '': the highest-numbered,
// stopCandidate's tie rule) and kept off for the rest of the day: the line is asked about an observation in which that
// unit's START is blocked, so it asks for whatever else covers the evening, as a player who took coal off until tomorrow
// would be asked. (A coal unit stopped at 09:00 cannot be back before about 18:00 anyway: T4, 8 h minimum down time, T1, T2.)
// A variant PAYS when its ALL-IN is below the follower's. The report: per date the follower's ALL-IN and each variant's
// difference (supply, carbon, outage), then how many dates have at least one paying variant, and the best by how much.

import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {followDay} from '../tests/lib/follow.js';
import {objective} from '../app/objective.js';
import {allIn} from '../app/score.js';
import {SCENARIOS} from '../content/scenarios.js';
import {DAILIES, seedOf, dailyScenarioIdOf} from '../content/dailies.js';
import {V, SIM_VERSION} from '../sim/params.js';

const FILE = fileURLToPath(import.meta.url);
const KEPT_OFF = 'kept off until tomorrow (tools/coal-off.mjs)';

function parseArgs(argv) {
  const o = {n: 60, dates: null, at: [9, 10.5, 12], workers: 1, json: false, worker: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--n') o.n = Number(next());
    else if (a === '--dates') o.dates = next().split(',').map(Number);
    else if (a === '--at') o.at = next().split(',').map(Number);
    else if (a === '-j' || a === '--workers') o.workers = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--json') o.json = true;
    else if (a === '--worker') o.worker = true;
    else if (a === '-h' || a === '--help') { const src = readFileSync(FILE, 'utf8').split('\n'); console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  return o;
}

// n dates spread evenly over the calendar (DAILIES.from..to), so every weekday and season the dailies hold is in it
function spread(n) {
  const d0 = new Date(DAILIES.from + 'T00:00:00Z'), d1 = new Date(DAILIES.to + 'T00:00:00Z');
  const days = Math.round((d1 - d0) / 864e5) + 1, out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getTime() + Math.floor(i * days / n) * 864e5);
    out.push(d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
  }
  return out;
}

const hm = s => String(Math.floor(s / 3600 + V.DAY_START_H) % 24).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0');

// The follower's line with one coal unit stopped from fromS (the first minute it may stop) and its START blocked after.
function coalOff(fromS) {
  let unit = null;
  const line = (obs, ctx) => {
    if (!unit && obs.s >= fromS && obs.s < fromS + 3 * V.S_PER_H) {
      const u = obs.units.filter(x => x.station === 'coal' && x.mode === 'on' && x.stopBlock === '').pop();
      if (u) { unit = u.id; line.stopped = {unit, s: obs.s}; return {kind: 'coaloff', level: 'plan', text: 'coal off', targets: [], action: {type: 'stop', unit}}; }
    }
    if (!unit) return objective(obs, ctx);
    const kept = Object.assign({}, obs, {units: obs.units.map(x => (x.id === unit && x.mode === 'off' ? Object.assign({}, x, {startBlock: KEPT_OFF}) : x))});
    const x = objective(kept, ctx);
    return x && x.action && x.action.unit === unit && (x.action.type === 'start' || x.action.type === 'abortStop') ? Object.assign({}, x, {action: null}) : x;
  };
  line.stopped = null;
  return line;
}

function dayOf(seed, scn, objectiveFn) {
  const d = followDay(seed, scn, objectiveFn ? {objective: objectiveFn} : {});
  const hh = scn.city.suburbs.reduce((a, x) => a + x.households, 0), a = allIn(d.score, hh);
  return {black: d.st.black, total: a.total, supply: a.supply, carbon: a.carbon, outage: a.outage, co2t: d.score.co2t};
}

/** One date: the follower's ALL-IN and, per --at hour, the coal-off variant's difference from it. */
export function dateRow(ymd, at) {
  const t0 = Date.now(), seed = seedOf(ymd, DAILIES.attempts[ymd] || 0), scn = SCENARIOS[dailyScenarioIdOf(ymd)];
  const base = dayOf(seed, scn);
  const variants = at.map(h => {
    const f = coalOff((h - V.DAY_START_H) * V.S_PER_H), v = dayOf(seed, scn, f);
    return f.stopped ? {at: h, unit: f.stopped.unit, stoppedAt: hm(f.stopped.s), black: v.black, d: v.total - base.total, dSupply: v.supply - base.supply,
      dCarbon: v.carbon - base.carbon, dOutage: v.outage - base.outage, dCo2t: v.co2t - base.co2t} : {at: h, unit: null};
  });
  return {ymd, seed, scenario: scn.id, base, variants, secs: (Date.now() - t0) / 1000};
}

function runWorkers(o, dates) {
  const n = Math.min(o.workers, dates.length), chunks = Array.from({length: n}, () => []), rows = [];
  dates.forEach((d, i) => chunks[i % n].push(d));
  return Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
    const child = fork(FILE, ['--worker'], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
    child.on('message', m => { if (m.row) rows.push(m.row); });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error('worker exited with ' + code))));
    child.send({at: o.at, dates: chunk});
  }))).then(() => rows);
}

const k$ = x => (x < 0 ? '-' : '+') + '$' + Math.round(Math.abs(x) / 1000) + 'k';

function report(o, rows, wallS) {
  console.log('Q10: coal off through the midday dip until tomorrow, against the line-follower (SIM ' + SIM_VERSION + '), ' + rows.length + ' dailies, stop from ' +
    o.at.map(h => hm((h - V.DAY_START_H) * V.S_PER_H)).join(' / ') + ', wall ' + wallS.toFixed(0) + ' s. ALL-IN = supply + carbon at $' + V.VER + '/t + outages at $' + V.VCR + '/MWh.');
  for (const r of rows) {
    console.log(r.ymd + ' ' + r.scenario.padEnd(18) + ' follower ' + (r.base.black ? 'BLACK' : '$' + (r.base.total / 1e6).toFixed(3) + 'M') + '  ' +
      r.variants.map(v => !v.unit ? hm((v.at - V.DAY_START_H) * V.S_PER_H) + ' no coal unit could stop' : v.stoppedAt + ' ' + v.unit + ' ' + k$(v.d) + ' (supply ' + k$(v.dSupply) +
        ', carbon ' + k$(v.dCarbon) + (v.dOutage ? ', outage ' + k$(v.dOutage) : '') + (v.black ? ', BLACK' : '') + ')').join('  '));
  }
  const tried = rows.filter(r => r.variants.some(v => v.unit)), pays = tried.filter(r => r.variants.some(v => v.unit && !v.black && v.d < 0));
  const best = rows.map(r => Math.min(...r.variants.filter(v => v.unit).map(v => v.d))).filter(Number.isFinite).sort((a, b) => a - b);
  const all = rows.flatMap(r => r.variants.filter(v => v.unit)), med = xs => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : NaN;
  console.log('\ndates with a coal unit to stop: ' + tried.length + ' of ' + rows.length + '; dates where some variant pays: ' + pays.length + ' (' + (100 * pays.length / Math.max(1, tried.length)).toFixed(1) + '%)' +
    (pays.length ? ': ' + pays.map(r => r.ymd).join(', ') : ''));
  console.log('variants: ' + all.length + ', paying ' + all.filter(v => !v.black && v.d < 0).length + '; median ALL-IN difference ' + k$(med(all.map(v => v.d))) + ' (supply ' + k$(med(all.map(v => v.dSupply))) +
    ', carbon ' + k$(med(all.map(v => v.dCarbon))) + '); best per date: median ' + k$(med(best)) + ', best ' + (best.length ? k$(best[0]) : '-') + ', worst ' + (best.length ? k$(best[best.length - 1]) : '-'));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.worker) {
    process.on('message', m => { for (const d of m.dates) process.send({row: dateRow(d, m.at)}); process.disconnect(); });
    return;
  }
  const dates = o.dates || spread(o.n), t0 = Date.now();
  const rows = o.workers > 1 && dates.length > 1 ? await runWorkers(o, dates) : dates.map(d => dateRow(d, o.at));
  rows.sort((a, b) => a.ymd - b.ymd);
  if (o.json) { for (const r of rows) console.log(JSON.stringify(r)); return; }
  report(o, rows, (Date.now() - t0) / 1000);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });

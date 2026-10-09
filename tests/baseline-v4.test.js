// Exit Phase 0 / F-12 for the v4 core: tools/baseline-v4.js prints the SPEC.md §6 rows the v4
// core can measure, and tools/baseline-v4.golden.md is its committed output. Every section 3 row
// depends only on its seed, so this file is a cheap regression guard on one of them: par's day on
// seed 4 (the heat day: RERT armed, load shed), run by the tool's own code (its parDay, in one of
// its own worker processes, the H-8 probes on) and compared cell for cell with section 3.1's row,
// all 22 columns. That includes H-8 containment from par's real SECURE states (the probes, unit,
// link and other columns: a credible trip from a SECURE state keeps the nadir >= 49.5 Hz), H-4's
// agreement of the desk's level with the last SECURITY line on every tick (alarm) and the
// end-of-day hashState. The whole report (section 1's fixed probes, the statistics over 200
// seeds) is the tool's: `npm run baseline:v4` prints it on demand. An intentional behaviour
// change re-records the golden (`npm run golden:v4`, about 5 min on 11 worker processes) in the
// same commit, with a one-line reason.
//
// The same day is also par's pace and runtime case (S-4 pace, D-9, moved here from
// tests/autopilot.test.js): runPar plays it in this process while the worker plays the probed
// copy beside it, so the file costs about one par day of wall time.
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {observe, hashState} from '../sim/step.js';
import {runPar, refRealSeconds} from '../sim/autopilot.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {TPS} from './lib/sim-helpers.js';
import {yardstickNs, workClock, budgetUnits} from './lib/speed.js';

const SEED = 4;
const RERECORD = 'if the change is intended, run `npm run golden:v4` and give the reason in the commit message';

/** Section 3.1's row for `seed` (par, raw seeds), as cells by column name. */
function goldenRow(seed) {
  const lines = readFileSync(new URL('../tools/baseline-v4.golden.md', import.meta.url), 'utf8').replace(/\r/g, '').split('\n');
  const from = lines.indexOf('### 3.1 Par, raw seeds');
  assert.ok(from >= 0, 'the golden has section 3.1');
  const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
  const head = cells(lines.find((l, i) => i > from && l.startsWith('| seed |')));
  const row = lines.find((l, i) => i > from && l.startsWith('| ' + seed + ' |'));
  assert.ok(row, 'the golden has a section 3.1 row for seed ' + seed);
  return Object.fromEntries(cells(row).map((c, i) => [head[i], c]));
}

// The tool's formats (tools/baseline-v4.js: fix, num, int, hex, hhmm and report()'s parRow).
const fix = (x, d) => { const s = x.toFixed(d); return /^-0\.?0*$/.test(s) ? s.slice(1) : s; };
const commas = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const num = (x, d) => { const [i, f] = fix(x, d).replace(/^-/, '−').split('.'); return commas(i) + (f ? '.' + f : ''); };
const int = x => { const s = fix(x, 0); return s[0] === '-' ? '−' + commas(s.slice(1)) : commas(s); };
const hex = h => '0x' + (h >>> 0).toString(16).padStart(8, '0');
const hhmm = s => {
  const m = Math.floor(s / V.S_PER_MIN) + V.DAY_START_H * V.S_PER_MIN;
  return String(Math.floor(m / V.S_PER_MIN) % V.DAY_H).padStart(2, '0') + ':' + String(m % V.S_PER_MIN).padStart(2, '0');
};
const triple = (n, fails, worst) => n + ' / ' + fails + ' / ' + (worst === null ? '-' : fix(worst, 3));
/** One parDay result as section 3.1's cells by column name. */
const parCells = r => ({seed: String(r.seed), class: r.cls, black: r.black ? 'BLACK ' + hhmm(r.endS) : '',
  unserved: num(r.unservedMWh, 1), UFLS: num(r.uflsMWh, 1), directed: num(r.directedMWh, 1), RERT: r.rert ? 'yes' : '', DR: String(r.drCalls),
  '¢': fix(r.centsPerKWh, 3), t: fix(r.co2tPerMWh, 3), trips: String(r.trips), '19:00': r.p19 === null ? '-' : int(r.p19), neg: fix(r.negH, 1),
  charge: r.chMWh > 0 ? int(r.chCost / r.chMWh) : '-', 'P&L': int(r.battPnl), short: String(r.shortMin),
  probes: triple(r.probes, r.fails, r.worst), unit: triple(r.unitN, r.unitFails, r.unitWorst), link: triple(r.linkN, r.linkFails, r.linkWorst),
  other: triple(r.otherN, r.otherFails, r.otherWorst), alarm: String(r.alarmDiff), hash: hex(r.hash)});

// Par's probed day on SEED by the tool's own worker (its --worker protocol: {ready}, then one
// {job} in and one {result} out; the parent ends the conversation). Started now, so it runs while
// this process plays the pace test's day; the job goes out as soon as the worker is ready.
const worker = fork(fileURLToPath(new URL('../tools/baseline-v4.js', import.meta.url)), ['--worker'],
  {cwd: fileURLToPath(new URL('..', import.meta.url)), execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
let stderr = '';
worker.stderr.on('data', d => { stderr += d; });
let jobSent, done = false;
const sent = new Promise(resolve => { jobSent = resolve; });
const parDay = new Promise((resolve, reject) => {
  worker.on('message', m => {
    if (m.ready) { worker.send({job: {kind: 'par', seed: SEED, probe: true}}); jobSent(); return; }
    if (m.result) { done = true; resolve(m.result); worker.disconnect(); }
  });
  worker.on('error', reject);
  worker.on('exit', code => { jobSent(); if (!done) reject(new Error('tools/baseline-v4.js --worker exited with ' + code + ' before its result\n' + stderr)); });
});
parDay.catch(() => {}); // awaited by the golden test; a run filtered to the pace test alone must not fail on it
after(() => { if (!done) worker.kill(); });

test('S-4 pace: at most one discrete action per 3 real s of the reference playback, none in a watch; D-9: a par day <= 2 x 1.6 s on the owner\'s laptop, timed against a CPU yardstick that shares no code with the sim', async () => {
  await sent; // the worker has its job, so its day runs beside this one
  const yard = yardstickNs();
  const clock = workClock();
  const r = runPar(SEED, CLASSIC);
  const secs = clock();
  const conts = observe(r.state).contingencies;
  // 'plan' is the L-0 plan; 'replan' is par's re-dispatched schedule after an action (the
  // RE-PLAN, part of the action it follows: SPEC S-4 and §8.2). Every other input is a
  // discrete action and is paced.
  const acts = r.log.filter((x, i) => r.origins[i] !== 'plan' && r.origins[i] !== 'replan');
  assert.ok(acts.length > 10 && acts.every((x, i) => /^rule[1-9]$/.test(r.origins[r.log.indexOf(x)])), 'discrete actions are rules');
  for (let i = 1; i < acts.length; i++) {
    const a = acts[i - 1].tick / TPS, b = acts[i].tick / TPS;
    assert.ok(refRealSeconds(a, b, conts) >= V.PAR_ACTION_GAP_REAL_S - 1e-9, 'actions at ' + a + ' and ' + b + ' s too close');
  }
  // A re-plan follows an action: none before par's first discrete action, and it only moves
  // levers and the tie or starts what the re-dispatch commits (par decommits by rule 4 only).
  const firstAct = r.origins.findIndex(o => /^rule/.test(o));
  const re = r.log.filter((x, i) => r.origins[i] === 'replan');
  assert.ok(re.length > 0 && r.origins.indexOf('replan') > firstAct, 'replan before any action');
  assert.ok(re.every(x => x.type === 'planLoad' && x.args.stops.length === 0), 'a re-plan is a planLoad and never stops a unit');
  assert.equal(r.log.filter((x, i) => r.origins[i] === 'plan').length, 1, 'one L-0 plan (a planLoad at 04:30)');
  for (const x of r.log) {
    const sx = x.tick / TPS;
    assert.ok(!conts.some(c => sx >= c.startS && sx < c.watchEndS), 'input during the watch at ' + sx);
    assert.ok(x.tick >= V.PLAYER_START_TICK, 'par acted before 04:30');
  }
  // D-9: 365 par days in <= 10 min on one core needs <= 1.6 s a day on the owner's laptop;
  // 2x margin. The day is timed on the main thread's CPU clock where Node has one (other
  // processes, the worker beside it and the parallel `node --test` run, do not inflate it) and
  // divided by a CPU yardstick measured just before it (tests/lib/speed.js), so a slower machine
  // is not a failure and a slower ENGINE is (review fix: the old fallback compared par with
  // planOnly, which share the engine, so a 4x slower physics still passed). Measured on the
  // owner's laptop after the review fixes: ~1.5-1.7 s, ~5 yardstick units per tick against 10.6.
  const limit = budgetUnits(2 * 1.6e9 / V.DAY_TICKS);
  const units = (x, y) => x * 1e9 / V.DAY_TICKS / y;
  let got = units(secs, yard);
  if (got > limit) { // one re-time before failing: the yardstick again, then par again (the faster of each)
    const y2 = Math.min(yard, yardstickNs()), c2 = workClock();
    runPar(SEED, CLASSIC);
    got = units(Math.min(secs, c2()), y2);
  }
  assert.ok(got <= limit, 'a par day costs ' + got.toFixed(2) + ' yardstick units per tick (' + secs.toFixed(2) + ' s here), budget ' +
    limit.toFixed(2) + ' (2 x 1.6 s on the owner\'s laptop)');
  assert.equal(hex(hashState(r.state)), goldenRow(SEED).hash, 'runPar plays the golden\'s day on seed ' + SEED + ': ' + RERECORD);
});

test('v4 baseline: par\'s day on seed 4, by the tool\'s own parDay, gives section 3.1\'s row of tools/baseline-v4.golden.md, all 22 columns (shed, cost, the battery, H-8 containment probes from SECURE states, H-4 alarm agreement, end-of-day hash)', {timeout: 120000}, async () => {
  const g = goldenRow(SEED), got = parCells(await parDay);
  assert.deepEqual(Object.keys(got).sort(), Object.keys(g).sort(), 'section 3.1\'s columns');
  const diff = Object.keys(g).filter(k => got[k] !== g[k]).map(k => k + ': ' + got[k] + ' (golden ' + g[k] + ')');
  assert.deepEqual(diff, [], 'seed ' + SEED + ', section 3.1 cells that differ from the golden: ' + RERECORD);
  // H-8 and H-4 on this day, whatever the golden says: every probe contained, the alarm agreed.
  for (const k of ['probes', 'unit', 'link', 'other']) assert.match(got[k], /^\d+ \/ 0 \/ /, k + ': a trip from a SECURE state fell below 49.5 Hz');
  assert.ok(Number(got.probes.split(' / ')[0]) > 0, 'the day has SECURE states to probe');
  assert.equal(got.alarm, '0', 'H-4: ticks where the desk\'s level and the last SECURITY line differ');
});

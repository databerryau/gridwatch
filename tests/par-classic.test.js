// Par's day on the classic scenario's seed 4 (the heat day: RERT armed, load shed), the v4 core's
// regression anchor, checked for what must hold on any build: S-4's pace, D-9's runtime, H-8's
// containment from par's real SECURE states (a credible trip from a SECURE state keeps the nadir
// >= 49.5 Hz) and H-4's agreement of the desk's level with the last SECURITY line on every tick.
// W7 (Q15): the day's numbers are no longer compared with tools/baseline-v4.golden.md here (that
// cost a golden re-record at every SIM_VERSION change): `npm run golden:v4 -- --check` compares
// them on demand. A sim change made without a SIM_VERSION change is caught in the suite by par's
// day on a daily against the selftest's golden hours (tests/par-guard.test.js), the no-input day
// to 14:00 (tests/ladder.test.js) and the selftest's cases (tests/selftest.test.js); and on every
// daily by the verify run (`npm run verify`, and CI's verify workflow on sim/ changes).
//
// runPar plays the day in this process (S-4, D-9) while the baseline tool's own parDay plays the
// probed copy (H-8, H-4) in one of its worker processes beside it, so the file costs about one par
// day of wall time; the two must be the same day. (W6, the test budget: the day is played and timed
// in a suite's before() hook.)
import {test, describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {observe, hashState} from '../sim/step.js';
import {runPar, refRealSeconds} from '../sim/autopilot.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {TPS} from './lib/sim-helpers.js';
import {yardstickNs, workClock, budgetUnits} from './lib/speed.js';

const SEED = 4;
let day = null; // runPar's state at the day's end (the suite's hook)

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
parDay.catch(() => {}); // awaited by the H-8 test; a run filtered to the pace test alone must not fail on it
after(() => { if (!done) worker.kill(); });

// par's day in this process, timed (D-9) on the main thread's CPU clock against the yardstick taken just before it
// (a suite, so that the hook's day is the suite's time, not the test's: CLAUDE.md's 2.5 s is for the test's checks)
describe('par\'s day on seed 4 in this process', () => {
  let yard, r, secs;
  before(async () => {
    await sent; // the worker has its job, so its day runs beside this one
    yard = yardstickNs();
    const clock = workClock();
    r = runPar(SEED, CLASSIC);
    secs = clock();
    day = r.state;
  });

  test('S-4 pace: at most one discrete action per 3 real s of the reference playback, none in a watch; D-9: a par day <= 2 x 1.6 s on the owner\'s laptop, timed against a CPU yardstick that shares no code with the sim', () => {
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
  });
});

test('H-8 and H-4 on par\'s day on seed 4, by the baseline tool\'s own parDay: every credible trip from a SECURE state holds 49.5 Hz, the desk\'s level always agrees with the last SECURITY line, and it is runPar\'s day', {timeout: 120000}, async () => {
  const r = await parDay;
  assert.ok(r.probes > 0, 'the day has SECURE states to probe');
  for (const k of ['', 'unit', 'link', 'other']) {
    const n = k ? r[k + 'N'] : r.probes, fails = k ? r[k + 'Fails'] : r.fails;
    assert.equal(fails, 0, (k || 'previewed') + ': ' + fails + ' of ' + n + ' trips from a SECURE state fell below 49.5 Hz');
  }
  assert.equal(r.alarmDiff, 0, 'H-4: ticks where the desk\'s level and the last SECURITY line differ');
  if (day) assert.equal(r.hash >>> 0, hashState(day) >>> 0, 'the tool\'s parDay (par\'s harness, as the bench runs it) and runPar play one day');
});

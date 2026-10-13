// Q-88 (desk/README.md §32.1): par and every proxy ask rule 9 (restore) FIRST from a task feeder's
// allowed second until it is closed or the RESTORE pace (RESTORE_PACE_MAX_S) ends, as a player
// following the glowing bay would; outside that window rule 9 keeps its place. And §32.10's 'slow'
// proxy (F-8): competent, but each task feeder is seen PROXY_SLOW_RESTORE_REAL_S real s of the
// reference playback after its allowed second. Classic has no task feeders, so it never opens the
// window (tests/baseline-v4.test.js holds classic's par bit for bit).
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, createAutopilot, decide, PROXY_NAMES} from '../sim/autopilot.js';
import {observe} from '../sim/step.js';
import {restoreAllowedS} from '../sim/market.js';
import {V} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import {ticksAt, TPS, clone} from './lib/sim-helpers.js';

const S_OF = (h, m = 0) => ticksAt(h, m) / TPS, PACE = V.RESTORE_PACE_MAX_S, LATE = V.PROXY_SLOW_RESTORE_REAL_S;
// DESK seed 4: HAR4 is handed back at 06:30 and HAR3 at 07:40 (Q-68). Before Q-88 par closed HAR3 at
// +24 grid-min (rules 1-8 took its pace first) and competent HAR4 at +42 grid-min.
const SEED = 4, UNTIL = ticksAt(8, 30) + 1;
const RUNS = {};

before(() => {
  for (const proxy of ['par', 'competent', 'slow']) RUNS[proxy] = runPar(SEED, DESK, {proxy, untilTick: UNTIL});
});

/** Each task feeder's close in run r: its second (the decision's), its allowed second then, and the rule that closed it. */
function closes(r) {
  const ds = r.state.city.districts;
  return ds.map((d, i) => [d, i]).filter(([d]) => d.clearS >= 0).map(([d, i]) => {
    const j = r.log.findIndex(x => x.type === 'restore' && x.args.district === d.id);
    return {id: d.id, clearS: d.clearS, s: j < 0 ? -1 : (r.log[j].tick - 1) / TPS, allowed: restoreAllowedS(ds, i), origin: j < 0 ? '' : r.origins[j]};
  });
}

test('Q-88: on a task date par and competent close each handed-back feeder inside its RESTORE pace (rule 9 first), so S-6\'s PERFECT pace holds', () => {
  for (const proxy of ['par', 'competent']) {
    const cs = closes(RUNS[proxy]);
    assert.deepEqual(cs.map(c => [c.id, c.clearS]), [['HAR3', S_OF(7, 40)], ['HAR4', S_OF(6, 30)]], 'the fixture\'s feeders');
    for (const c of cs) {
      assert.equal(c.origin, 'rule9', proxy + ' ' + c.id);
      assert.ok(c.s >= c.allowed && c.s < c.allowed + PACE, proxy + ' closed ' + c.id + ' at +' + (c.s - c.allowed) + ' s: inside the pace');
    }
    assert.equal(RUNS[proxy].state.score.taskLateMWh, 0, proxy + ': nothing late (S-6)');
  }
});

test('§32.10 slow proxy: competent with each task feeder closed only after the whole RESTORE pace (15 real s on par\'s playback), later than competent', () => {
  assert.ok(PROXY_NAMES.includes('slow'));
  const comp = closes(RUNS.competent), slow = closes(RUNS.slow);
  for (const c of slow) {
    const twin = comp.find(x => x.id === c.id);
    assert.ok(c.s >= c.allowed + PACE, 'slow closed ' + c.id + ' at +' + (c.s - c.allowed) + ' s');
    assert.ok(c.s > twin.s, c.id + ': slow ' + c.s + ' after competent ' + twin.s);
  }
  assert.ok(RUNS.slow.state.score.taskLateMWh > 0, 'the slow days are late (S-6)');
});

test('Q-88 in decide(): rule 9 first only inside the window [allowed, allowed + RESTORE_PACE_MAX_S); the slow proxy\'s window opens 15 real s later and stays open', () => {
  // The 08:30 observation with HAR4 put back dark at the gate (allowed at 06:30, no restore before it), no
  // contingency on record, and rule 1 armed by a fresh trip: rule 1 wants an action whenever it is asked.
  const st = clone(RUNS.par.state), a = S_OF(6, 30);
  const ask = (proxy, at, clearS = a) => {
    const obs = observe(st);
    Object.assign(obs, {s: at, tick: at * TPS + 1, contingencies: []});
    for (const d of obs.districts) d.restoredAtS = -1;
    Object.assign(obs.districts.find(d => d.id === 'HAR4'), {dark: true, shedBy: 'task', clearS, restoreBlock: ''});
    const memo = Object.assign(createAutopilot({proxy}), {trip: {n: 1, start: true, tie: true, untilS: at + 3600}});
    const d = decide(obs, memo);
    return [d.length ? d[0].type + (d[0].district ? ' ' + d[0].district : '') : '', memo.lastOrigin];
  };
  for (const proxy of ['par', 'competent', 'lean', 'commitAll']) {
    assert.deepEqual(ask(proxy, a), ['restore HAR4', 'rule9'], proxy + ' at the allowed second');
    assert.deepEqual(ask(proxy, a + PACE - 1), ['restore HAR4', 'rule9'], proxy + ' at its last second');
    assert.equal(ask(proxy, a + PACE)[1], 'rule1', proxy + ': the pace is over, rule 9 back in its place');
    assert.equal(ask(proxy, a + 100, -1)[1], 'rule1', proxy + ': no task feeder (classic\'s case), no window');
  }
  // slow: 15 real s = the pace's 10 at 30x, then 5 at the morning ramp's 270x (06:00-09:00)
  const seen = a + PACE + (LATE - PACE / V.RESTORE_PACE_RATE) * 270;
  assert.equal(ask('slow', a)[1], 'rule1', 'slow: not seen yet, rule 1 first');
  assert.equal(ask('slow', seen - 1)[1], 'rule1');
  assert.deepEqual(ask('slow', seen), ['restore HAR4', 'rule9'], 'slow: seen at ' + (seen - a) + ' grid-s');
  assert.deepEqual(ask('slow', seen + 2 * PACE), ['restore HAR4', 'rule9'], 'slow: open until it is closed');
});

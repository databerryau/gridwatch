// Q-88 (desk/README.md §32.1): par and every proxy ask rule 9 (restore) FIRST from a task feeder's
// allowed second until it is closed or RESTORE_PACE_MAX_S later (S-6's PERFECT pace), as a player
// at the feeder card would; outside that window rule 9 keeps its place. Q-91: the feeder card holds
// the clock at the allowed second, so par's reference playback counts a hold there (zero grid time,
// at least the proxy's own pace), and §32.10's 'slow' proxy holds each card PROXY_SLOW_RESTORE_REAL_S:
// its 15 real s pass on the held clock, so it equals competent by construction (a regression guard,
// not a measure). Classic has no task feeders, so it never opens the window
// (tests/baseline-v4.test.js holds classic's par bit for bit).
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {runPar, createAutopilot, decide, PROXY_NAMES} from '../sim/autopilot.js';
import {observe} from '../sim/step.js';
import {restoreAllowedS} from '../sim/market.js';
import {V} from '../sim/params.js';
import {DESK} from '../content/scenarios.js';
import {ticksAt, TPS, clone} from './lib/sim-helpers.js';

const S_OF = (h, m = 0) => ticksAt(h, m) / TPS, PACE = V.RESTORE_PACE_MAX_S;
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

test('Q-88, Q-91: on a task date par, competent and slow close each handed-back feeder inside its window (rule 9 first, the card holding the clock), so S-6\'s PERFECT pace holds', () => {
  for (const proxy of ['par', 'competent', 'slow']) {
    const cs = closes(RUNS[proxy]);
    assert.deepEqual(cs.map(c => [c.id, c.clearS]), [['HAR3', S_OF(7, 40)], ['HAR4', S_OF(6, 30)]], 'the fixture\'s feeders');
    for (const c of cs) {
      assert.equal(c.origin, 'rule9', proxy + ' ' + c.id);
      assert.ok(c.s >= c.allowed && c.s < c.allowed + PACE, proxy + ' closed ' + c.id + ' at +' + (c.s - c.allowed) + ' s: inside the window');
    }
    assert.equal(RUNS[proxy].state.score.taskLateMWh, 0, proxy + ': nothing late (S-6)');
  }
});

// (slow equals competent by construction: holdOf is at least each proxy's own gap, so a card never makes a proxy
// late. This is the guard on that; the page's hold itself is tests/feeder-card.test.js's.)
test('§32.10, Q-91: the slow proxy\'s 15 real s pass on the held clock: it closes each feeder when competent does (a regression guard)', () => {
  assert.ok(PROXY_NAMES.includes('slow'));
  const comp = closes(RUNS.competent), slow = closes(RUNS.slow);
  assert.deepEqual(slow.map(c => [c.id, c.s]), comp.map(c => [c.id, c.s]));
});

test('Q-88 in decide(): rule 9 first only inside the window [allowed, allowed + RESTORE_PACE_MAX_S), for every proxy; the card\'s hold covers the proxy\'s pace (Q-91)', () => {
  // The 08:30 observation with HAR4 put back dark at the gate (allowed at 06:30, no restore before it), no
  // contingency on record, and rule 1 armed by a fresh trip: rule 1 wants an action whenever it is asked.
  const st = clone(RUNS.par.state), a = S_OF(6, 30);
  const ask = (proxy, at, clearS = a, lastS = -1) => {
    const obs = observe(st);
    Object.assign(obs, {s: at, tick: at * TPS + 1, contingencies: []});
    for (const d of obs.districts) d.restoredAtS = -1;
    Object.assign(obs.districts.find(d => d.id === 'HAR4'), {dark: true, shedBy: 'task', clearS, restoreBlock: ''});
    const memo = Object.assign(createAutopilot({proxy}), {trip: {n: 1, start: true, tie: true, untilS: at + 3600}});
    if (lastS >= 0) memo.lastActTick = lastS * TPS + 1;
    const d = decide(obs, memo);
    return [d.length ? d[0].type + (d[0].district ? ' ' + d[0].district : '') : '', memo.lastOrigin];
  };
  for (const proxy of ['par', 'competent', 'slow', 'lean', 'commitAll']) {
    assert.deepEqual(ask(proxy, a), ['restore HAR4', 'rule9'], proxy + ' at the allowed second');
    assert.deepEqual(ask(proxy, a + PACE - 1), ['restore HAR4', 'rule9'], proxy + ' at its last second');
    assert.equal(ask(proxy, a + PACE)[1], 'rule1', proxy + ': the window is over, rule 9 back in its place');
    assert.equal(ask(proxy, a + 100, -1)[1], 'rule1', proxy + ': no task feeder (classic\'s case), no window');
  }
  // an action 10 grid-s before the card (0.04 real s at 270x): the pace holds until the card, whose hold covers it
  for (const proxy of ['par', 'competent', 'slow']) {
    assert.deepEqual(ask(proxy, a - 1, a, a - 10), ['', ''], proxy + ': paced before the card');
    assert.deepEqual(ask(proxy, a, a, a - 10), ['restore HAR4', 'rule9'], proxy + ': the card holds the clock while the player acts');
  }
});

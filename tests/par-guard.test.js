// W7 (Q15): par's own day has not moved under the stamp. A change to the sim's behaviour that leaves SIM_VERSION (and so the
// dailies' stamp) alone would grade every player against a stored par (content/ladder.js, F-8) that the page's par no longer
// plays. The classic golden used to catch it on the classic day; it is a tool now (`npm run golden:v4 -- --check`), so this
// file plays par's whole day on the selftest's first par case (a weekday heatwave daily, par's busiest kind of day) with
// sim/autopilot.js runPar, as tools/ladder.mjs and the verify do, and holds it to that case's golden values (content/selftest.js:
// the state's hash at every grid hour and at the end) and to the date's stored par (its ALL-IN total and shed MWh). Those are
// the values `npm run verify` checks before it restamps, so this guard needs no golden of its own. The day is played in a
// suite's before() hook (CLAUDE.md: a test's own checks <= 2.5 s). The no-input day (tests/ladder.test.js, to 14:00) and the
// selftest's scripted logs and early hours (tests/selftest.test.js) guard the rest; CI's verify workflow plays every daily.
import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {hashState} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import * as G from '../app/game.js';
import {allIn, parShedMWh} from '../app/score.js';
import {SELFTEST} from '../content/selftest.js';
import {LADDER} from '../content/ladder.js';
import {DAILIES} from '../content/dailies.js';
import {restampAdvice} from '../tools/verify.mjs';

const CASE = SELFTEST.cases.find(c => c.kind === 'par');
const clock = k => String((5 + k) % 24).padStart(2, '0') + ':00';
const MOVED = 'par\'s day moved under the stamp: a sim behaviour change needs a SIM_VERSION change (sim/params.js), then ' +
  restampAdvice(DAILIES.from, DAILIES.to) + ' (it refuses when par moved, as here)';

describe('par\'s day on the selftest\'s first par case, to its end', () => {
  let r, hh;
  before(() => {
    const scn = G.scenarioForSeed(CASE.seed);
    hh = scn.city.suburbs.reduce((a, s) => a + s.households, 0);
    r = runPar(CASE.seed, scn, {hashEveryS: V.S_PER_H});
  });

  test('Q15: every grid hour\'s hash and the end\'s are the selftest\'s golden values; the ALL-IN and the shed MWh are the stored par', () => {
    assert.equal(CASE.scenarioId, 'desk', 'a weekday');
    const got = r.hashes.map(h => h >>> 0), k = CASE.hashes.findIndex((h, i) => got[i] !== h);
    assert.equal(k, -1, k < 0 ? '' : 'the hash at ' + clock(k) + ' differs: ' + MOVED);
    assert.deepEqual([r.state.tick, got.length, hashState(r.state) >>> 0], [CASE.tick, CASE.hashes.length, CASE.hash], 'the day\'s end: ' + MOVED);
    const total = Math.round(allIn(r.score, hh).total), row = LADDER.rows[CASE.ymd];
    assert.deepEqual([total, Math.round(parShedMWh(r.score) * 1000) / 1000], [CASE.total, row[1]], 'par\'s ALL-IN and shed: ' + MOVED);
    assert.equal(row[0], CASE.total, 'the selftest\'s par is the ladder\'s (F-8)');
  });
});

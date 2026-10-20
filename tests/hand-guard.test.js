// W7 (Q6 review): a HAND day has not moved under the stamp. The guards of par's day (tests/par-guard.test.js), the no-input day
// (tests/ladder.test.js) and the verify (tools/verify.mjs) all play AGC days or no input at all, so a change to the system's
// dispatch that only a HAND day with the player's START reads passed them: W7 Q6 first counted a starting unit without the
// auto-synchroniser's wait there (sim/autopilot.js onFromNow), which moved such a day from 05:00 under the same SIM_VERSION, and
// a HAND shift the live build saved (F-7) then failed its replay on resume ("the replay did not match") instead of being dropped
// as another build's. This plays one, on the page's path (app/game.js with app/system.js, as the player's inputs go): the
// 2026-10-14 daily in HAND, CCGT 2 started at 04:30, closed by hand on the first clean pass of the synchroscope, to 09:00. Its
// state's hash at each grid hour is held to the one recorded (GOLDEN, made by main at c68399a), taken as tools/verify.mjs takes
// a golden's: with state.v set to the version it was recorded under (hashState covers SIM_VERSION), so a bump that moves no HAND
// day passes. The day is played in a before() hook (CLAUDE.md: a test's own checks <= 2.5 s).
import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {hashState, SIM_VERSION} from '../sim/step.js';
import {syncAt} from '../sim/grid.js';
import * as G from '../app/game.js';
import * as system from '../app/system.js';
import {dailyFor} from '../content/dailies.js';
import {hashBoth} from '../tools/verify.mjs';

const YMD = 20261014, UNIT = 'ccgt2', TPS = V.TICKS_PER_S, HOUR = V.S_PER_H * TPS;
// the state's hash at 05:00, 06:00, ..., 09:00 under v (recorded with this file's play by c68399a, v4-core-2d.0)
const GOLDEN = {v: 'v4-core-2d.0', hashes: [1823202445, 2854440133, 639635202, 1107903608, 3867977270]};
const clock = k => String(5 + k).padStart(2, '0') + ':00';

describe('a HAND day with the player\'s START, on the page\'s path, to 09:00', () => {
  const seen = {};
  let now = [], was = [];
  before(() => {
    const game = G.createGame({daily: dailyFor(YMD, G.dailyStamp()), scenario: G.scenarioForSeed, system, commit: 'player', startPaused: true,
      storage: null, par: false});
    const A = G.makeActions(game), u = () => game.state.units.find(x => x.id === UNIT);
    seen.mode = A.input({type: 'mode', agc: false});
    G.takeDesk(game);
    seen.at = game.state.tick;
    seen.start = A.input({type: 'start', unit: UNIT});
    // at full speed (T1: HAND has no auto-synchroniser), the player closes on the synchroscope's first clean pass
    G.runTo(game, seen.at + V.MACHINES.find(m => m.id === UNIT).t1S * TPS);
    seen.ready = u().mode;
    let t = game.state.tick;
    while (Math.abs(syncAt(u(), t + V.SYNC_BREAKER_TICKS).phaseDeg) > V.SYNC_CLEAN_DEG && t < game.state.tick + 60 * TPS) t++;
    G.runTo(game, t);
    seen.sync = A.input({type: 'syncClose', unit: UNIT});
    seen.closed = u().mode;
    for (let k = 0; k < GOLDEN.hashes.length; k++) {
      G.runTo(game, (k + 1) * HOUR);
      const [a, b] = hashBoth(hashState, game.state, GOLDEN.v);
      now.push(a); was.push(b);
    }
    seen.end = u().mode;
  });

  test('Q6 review: the START, a clean close and every grid hour\'s hash as recorded: the system\'s dispatch on a HAND day has not moved', () => {
    assert.deepEqual(seen, {mode: '', at: 1800 * TPS, start: '', ready: 'ready', sync: '', closed: 'loading', end: 'on'},
      'HAND at the briefing, START at 04:30, at full speed after T1, a clean close, on by 09:00');
    const k = GOLDEN.hashes.findIndex((h, i) => was[i] !== h);
    const moved = SIM_VERSION === GOLDEN.v
      ? 'a HAND day with a START moved under SIM_VERSION ' + SIM_VERSION + ': a HAND shift saved (F-7) by the live build would fail its ' +
        'replay. Keep the old rule (sim/onat.js names the copies that keep their own), or bump SIM_VERSION (sim/params.js), run `npm run verify`, ' +
        'and record this build\'s hashes here: {v: \'' + SIM_VERSION + '\', hashes: ' + JSON.stringify(now) + '}'
      : 'a HAND day with a START moved with the bump to ' + SIM_VERSION + ' (compared under ' + GOLDEN.v + '): saves of the older build are dropped ' +
        'as another build\'s, so if the change is meant, record this build\'s hashes here: {v: \'' + SIM_VERSION + '\', hashes: ' + JSON.stringify(now) + '}';
    assert.equal(k, -1, k < 0 ? '' : 'the hash at ' + clock(k) + ' differs: ' + moved);
  });
});

// F-5 loop and director, the bench session and its recorder (app/). Owner: bench builder.
// Everything here runs headless: app/loop.js, director.js, session.js, record.js and
// assist.js are DOM-free by design, so the invariants the browser relies on are tested in Node.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, hashState, replay, observe} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {CLASSIC} from '../content/scenarios.js';
import {createPacer, runFrame, clampDt, effectiveRate, TICK_CAP, MAX_FRAME_DT_S, MAX_RATE, TICK_S} from '../app/loop.js';
import {createDirector, rateOf, modeOf, watchRate, watchRealS, setSpeed, togglePause, skipWatch, FLAT_RATE, DEBUG_RATES,
  WATCH_SCHEDULE} from '../app/director.js';
import {createSession, frame, sendInput, requestDebugTrip, runTo, sessionLog, setAssist, replan, restoreChecks} from '../app/session.js';
import {restorePermissive} from '../sim/grid.js';
import {TRACE_TICKS, CAUGHT_KEYS, DAY_MIN, secondsWindow, recentTicks} from '../app/record.js';
import {keyAction} from '../app/input.js';

const TPS = V.TICKS_PER_S;
const at = (h, m = 0) => ((h - V.DAY_START_H) * 3600 + m * 60) * TPS;

/** A counting harness for runFrame: tick() counts, rate() is a function of the count. */
function counter(rateAt) {
  const h = {n: 0, rate: () => rateAt(h.n), tick: () => { h.n++; }};
  return h;
}

// ------------------------------------------------------------------ the accumulator (pure)

test('F-5: each frame adds min(dt, 0.1 s) x rate grid-seconds and runs whole ticks; totals match real time x rate', () => {
  for (const [hz, rate] of [[60, FLAT_RATE], [144, FLAT_RATE], [60, 0.25], [144, 1], [75, 240], [60, 2100]]) {
    const p = createPacer(), h = counter(() => rate);
    const frames = hz * 10; // 10 real seconds
    for (let i = 0; i < frames; i++) {
      const before = h.n, n = runFrame(p, 1 / hz, h);
      assert.equal(h.n - before, n, 'runFrame returns the ticks it ran');
      assert.ok(p.acc > -1e-9 && p.acc < 1 + 1e-9, 'owes less than one tick after a frame: ' + p.acc);
    }
    const want = 10 * rate / TICK_S;
    assert.ok(Math.abs(h.n - want) <= 1, hz + ' Hz at ' + rate + 'x: ' + h.n + ' ticks, want ' + want);
    assert.equal(p.lagFrames, 0);
    if (rate >= 60) assert.ok(Math.abs(effectiveRate(p) - rate) / rate < 0.02, 'effective rate ' + effectiveRate(p));
  }
});

test('F-5: a long frame counts at most 0.1 s; bad dt counts nothing', () => {
  assert.equal(clampDt(5), MAX_FRAME_DT_S);
  assert.equal(clampDt(-1), 0);
  assert.equal(clampDt(NaN), 0);
  assert.equal(clampDt(Infinity), 0);
  const p = createPacer(), h = counter(() => FLAT_RATE);
  assert.equal(runFrame(p, 3, h), Math.round(MAX_FRAME_DT_S * FLAT_RATE / TICK_S));
  assert.equal(runFrame(p, NaN, h), 0);
});

test('F-5: the per-frame cap covers the fastest debug rate at the longest frame, so only a stall binds it', () => {
  assert.equal(MAX_RATE, DEBUG_RATES[DEBUG_RATES.length - 1]);
  assert.ok(TICK_CAP >= MAX_FRAME_DT_S * MAX_RATE / TICK_S - 1e-9);
});

test('F-5: a lagging frame slows play and never drops or doubles a tick', () => {
  // Cap binds: 100 ticks due, 30 allowed. The other 70 ticks of TIME are dropped, never ticks:
  // the next frame owes only its own time.
  const p = createPacer({cap: 30}), h = counter(() => FLAT_RATE);
  assert.equal(runFrame(p, 1 / 60, h), 30);
  assert.ok(p.lagging && p.acc < 1, 'owes < 1 tick after lagging');
  assert.equal(p.lostTicks, 70);
  // Budget binds: a clock that moves 1 ms per read against a 5-ms budget.
  const q = createPacer({budgetMs: 5}), g = counter(() => 2100);
  let ms = 0;
  const n = runFrame(q, 1 / 60, Object.assign(g, {now: () => (ms += 1)}));
  assert.ok(n > 0 && n < 2100 / 60 / TICK_S, n + ' ticks');
  assert.ok(q.lagging && q.acc < 1);
  // Against the real sim: every step() runs once, in order (tick === steps taken).
  const s = createState(3, CLASSIC), r = createPacer({cap: 17});
  let steps = 0;
  for (let i = 0; i < 200; i++) runFrame(r, 1 / 30, {rate: () => 240, tick: () => { step(s); steps++; }});
  assert.equal(s.tick, steps);
  assert.equal(steps, 200 * 17);
});

test('F-5: pause owes nothing; a rate change mid-frame converts the time still owed to the new rate', () => {
  const p = createPacer(), h = counter(() => 0);
  for (let i = 0; i < 60; i++) runFrame(p, 1 / 60, h);
  assert.equal(h.n, 0);
  assert.equal(p.acc, 0);
  // 120x until tick 40, then 0.15x: the frame owes 100 ticks at 120x; after 40 the other 60
  // (= 0.01 real s) are worth 0.075 ticks at 0.15x, so the frame stops at 40.
  const q = createPacer(), g = counter(n => (n < 40 ? FLAT_RATE : 0.15));
  assert.equal(runFrame(q, 1 / 60, g), 40);
  assert.ok(Math.abs(q.acc - 60 * 0.15 / FLAT_RATE) < 1e-9, 'owed ' + q.acc);
  // ...and it keeps accruing at 0.15x: 0.15 x (1/60) / 0.02 = 0.125 ticks per frame.
  let k = 0;
  while (g.n === 40) { runFrame(q, 1 / 60, g); k++; }
  assert.equal(k, 8, 'first slow tick after 8 more frames at 60 Hz');
  // Hindsight: the 40th tick itself opened the watch (a trip inside step()), so it is
  // re-charged at 0.15x: the next tick waits for it (16 frames, not 8) and the watch keeps
  // its full real time from its first tick.
  const w = createPacer(), gw = counter(n => (n < 40 ? FLAT_RATE : 0.15));
  gw.rateLast = () => (gw.n < 40 ? FLAT_RATE : 0.15);
  assert.equal(runFrame(w, 1 / 60, gw), 40);
  assert.ok(w.acc < 0, 'owes time for the re-charged tick: ' + w.acc);
  let kw = 0;
  while (gw.n === 40) { runFrame(w, 1 / 60, gw); kw++; }
  assert.equal(kw, Math.ceil((1 + 1 - 61 * 0.15 / FLAT_RATE) / (0.15 / 60 / TICK_S) - 1e-9));
  assert.equal(kw, 16);
});

// ------------------------------------------------------------------ the director (pure)

test('K-15: the watch plays 0-3 s at 0.15x, 3-10 s at 1x, 10-30 s at 10x (~29 real s); PAUSE, hidden tab, skip', () => {
  assert.equal(watchRate(0), 0.15);
  assert.equal(watchRate(3 * TPS - 1), 0.15);
  assert.equal(watchRate(3 * TPS), 1);
  assert.equal(watchRate(10 * TPS - 1), 1);
  assert.equal(watchRate(10 * TPS), 10);
  assert.equal(watchRate(V.WATCH_S * TPS - 1), 10);
  assert.equal(WATCH_SCHEDULE[WATCH_SCHEDULE.length - 1].toS, V.WATCH_S);
  assert.ok(Math.abs(watchRealS() - 29) < 1e-9, 'full watch ' + watchRealS() + ' real s');
  const d = createDirector();
  assert.equal(d.speed, FLAT_RATE);
  const s = createState(1, CLASSIC);
  assert.equal(rateOf(d, s), 0, 'a session starts paused (the briefing)');
  assert.equal(modeOf(d, s).mode, 'PAUSE');
  togglePause(d);
  assert.equal(rateOf(d, s), FLAT_RATE);
  assert.equal(modeOf(d, s).mode, 'CRUISE');
  setSpeed(d, 0.25);
  assert.equal(modeOf(d, s).mode, 'DEBUG');
  assert.throws(() => setSpeed(d, 0));
  assert.throws(() => setSpeed(d, 99999));
  d.hidden = true;
  assert.equal(rateOf(d, s), 0, 'a hidden tab pauses');
  assert.equal(modeOf(d, s).mode, 'HIDDEN');
  d.hidden = false;
  assert.equal(skipWatch(d, s), false, 'no watch to skip');
});

test('input keys: Space pauses, Esc skips the watch, 1-6 pick the debug speeds; modified keys are ignored', () => {
  assert.deepEqual(keyAction({key: ' '}), {do: 'pause'});
  assert.deepEqual(keyAction({key: 'Escape'}), {do: 'skipWatch'});
  DEBUG_RATES.forEach((r, i) => assert.deepEqual(keyAction({key: String(i + 1)}), {do: 'speed', rate: r}));
  assert.equal(keyAction({key: String(DEBUG_RATES.length + 1)}), null);
  assert.equal(keyAction({key: ' ', ctrlKey: true}), null);
  assert.equal(keyAction({key: 'x'}), null);
});

// ------------------------------------------------------------------ the session: sim + loop + director

// Play a session with frames of 1/hz s until `untilTick` (whole frames; may overshoot).
function playFrames(sess, hz, untilTick) {
  let frames = 0;
  while (!sess.state.over && sess.state.tick < untilTick) { frame(sess, 1 / hz); frames++; }
  return frames;
}

test('F-5: a 60 Hz and a 144 Hz display reach the same state at the same grid time, through a watch', () => {
  const run = hz => {
    const sess = createSession({seed: 4, scenario: CLASSIC, assist: 'par', speed: 2100, paused: false});
    runTo(sess, at(4, 25) + 17);                         // the briefing, headless; then a desk input at an exact tick
    assert.equal(sendInput(sess, {type: 'guard', mw: 200}).ok, true);
    runTo(sess, at(4, 40) + 3);
    requestDebugTrip(sess);                               // lands at the next grid second in both runs
    const realAt = []; // grid tick after every 2 real seconds (a whole number of frames at both refresh rates)
    let frames = 0;
    while (sess.state.tick < at(5, 20)) {
      frame(sess, 1 / hz);
      if (++frames % (2 * hz) === 0) realAt.push(sess.state.tick);
    }
    const hourly = sess.hashes.slice();                   // hashState at 05:00, taken inside the loop
    return {hourly, realAt, cont: sess.state.conts.map(c => c.startTick), log: sess.state.log.length};
  };
  const a = run(60), b = run(144);
  assert.deepEqual(a.hourly, b.hourly, 'hashState at 05:00');
  assert.equal(a.hourly.length, 1);
  assert.equal(a.log, b.log);
  assert.deepEqual(a.cont, b.cont, 'the debug trip landed on the same tick');
  // The same real time reaches the same grid time (within a tick), in cruise and in the watch.
  assert.ok(a.realAt.length >= 12, a.realAt.length + ' samples');
  for (let i = 0; i < Math.min(a.realAt.length, b.realAt.length); i++) {
    assert.ok(Math.abs(a.realAt[i] - b.realAt[i]) <= 1, i + ': ' + a.realAt[i] + ' vs ' + b.realAt[i]);
  }
});

test('F-4 / D-6: one log played through the loop at 0.25x, 1x, 60x and 240x gives an identical hash', () => {
  const until = at(4, 2);
  const log = [];
  const hashAt = rate => {
    const s = createState(9, CLASSIC);
    const p = createPacer();
    let j = 0;
    const inputs = [{tick: 777, type: 'tie', mw: 400}, {tick: 2501, type: 'battery', mode: 'discharge', mw: 120},
      {tick: 4000, type: 'basePoint', station: 'coal', mw: 2100}];
    while (s.tick < until) {
      runFrame(p, 1 / 60, {rate: () => (s.tick < until ? rate : 0), tick: () => {
        const batch = [];
        while (j < inputs.length && inputs[j].tick === s.tick) { const {tick: _t, ...x} = inputs[j++]; batch.push(x); }
        step(s, batch);
      }});
    }
    log.push(s.log.length);
    return hashState(s);
  };
  const h = hashAt(240);
  for (const r of [60, 1, 0.25]) assert.equal(hashAt(r), h, r + 'x');
  assert.deepEqual(log, [3, 3, 3, 3]);
});

test('K-15 via the bench: a debug trip opens the watch; it lasts ~29 real s for exactly 30 grid-s; the desk is locked; skip', () => {
  const sess = createSession({seed: 2, scenario: CLASSIC, paused: false});
  runTo(sess, at(4, 45) + 11);
  requestDebugTrip(sess);
  let real = 0, start = -1, end = -1, startTick = -1, endTick = -1;
  for (let i = 0; i < 60 * 45; i++) {
    frame(sess, 1 / 60); real += 1 / 60;
    const m = modeOf(sess.director, sess.state);
    if (m.mode === 'WATCH' && start < 0) { start = real; startTick = sess.state.conts.at(-1).startTick; }
    if (start >= 0 && m.mode !== 'WATCH') { end = real; endTick = sess.state.tick; break; }
    if (m.mode === 'WATCH' && i % 97 === 0) {
      const r = sendInput(sess, {type: 'tie', mw: 0});
      assert.equal(r.ok, false, 'desk locked during the watch');
    }
  }
  assert.ok(start >= 0 && end > start, 'the watch played');
  assert.ok(Math.abs((end - start) - watchRealS()) < 0.1, 'watch took ' + (end - start) + ' real s');
  const c = sess.state.conts.at(-1);
  assert.equal(c.watchEndTick - c.startTick, V.WATCH_S * TPS);
  assert.ok(endTick >= c.watchEndTick && endTick - c.watchEndTick <= FLAT_RATE / 60 / TICK_S + 1, 'cruise resumes in the frame the watch ends');
  assert.equal(startTick % TPS, 0, 'the debug trip lands on a grid second');
  assert.equal(sess.poked, true, 'a debug trip marks the session as not replayable');
  // Skip: the next watch plays at the chosen speed instead.
  runTo(sess, sess.state.tick + 5 * 60 * TPS);
  requestDebugTrip(sess);
  frame(sess, 1 / 60);
  assert.equal(modeOf(sess.director, sess.state).mode, 'WATCH');
  assert.equal(skipWatch(sess.director, sess.state), true);
  assert.equal(modeOf(sess.director, sess.state).mode, 'CRUISE');
  assert.equal(modeOf(sess.director, sess.state).locked, true, 'skipping never unlocks the desk early');
});

test('the recorder: the trace matches the contingency record; minutes, seconds and ticks are recorded', () => {
  const sess = createSession({seed: 5, scenario: CLASSIC, paused: false});
  runTo(sess, at(4, 30) + 1234);
  requestDebugTrip(sess);
  runTo(sess, sess.state.tick + 70 * TPS);
  const c = sess.state.conts.at(-1), tr = sess.rec.traces.at(-1);
  assert.equal(tr.n, c.n);
  assert.equal(tr.len, TRACE_TICKS + 1);
  assert.equal(tr.f[0], c.fStartHz);
  let mn = Infinity, j = -1;
  for (let k = 0; k < V.WATCH_S * TPS; k++) if (tr.f[k] < mn) { mn = tr.f[k]; j = k; }
  assert.equal(mn, c.extremeHz, 'trace nadir = the record\'s extreme');
  assert.equal(j, c.extremeTick - c.startTick);
  for (const k of CAUGHT_KEYS) assert.ok(Math.abs(tr.caught[k][j] - c.caught[k]) < 1e-9, k);
  assert.ok(tr.preview && tr.preview.lId === c.id, 'the pre-trip TRIP PREVIEW predicted this loss');
  assert.ok(Math.abs(tr.preview.nadirHz - c.extremeHz) < 0.05, 'preview ' + tr.preview.nadirHz + ' vs ' + c.extremeHz);
  // Minutes: every completed minute so far has its numbers.
  const mins = Math.floor(sess.state.tick / (60 * TPS));
  const m = sess.rec.minute;
  assert.equal(m.demand.length, DAY_MIN);
  for (let i = 0; i < mins; i++) for (const f of ['fMin', 'fMax', 'fMean', 'demand', 'supply', 'price', 'level']) {
    assert.ok(Number.isFinite(m[f][i]), f + '[' + i + ']');
  }
  assert.ok(!Number.isFinite(m.demand[mins + 1]));
  const nowS = Math.floor(sess.state.tick / TPS);
  const w = secondsWindow(sess.rec, nowS - 600, nowS);
  assert.ok([...w.min].every(Number.isFinite) && [...w.min].every((x, i) => x <= w.mean[i] && w.mean[i] <= w.max[i]));
  const ticks = recentTicks(sess.rec, 3000);
  assert.equal(ticks.length, 3000);
  assert.equal(ticks[2999], sess.state.phys.fHz);
});

test('F-6: a bench session (desk inputs and ASSIST PLAN) replays headless to the same hash and scorecard', () => {
  const sess = createSession({seed: 11, scenario: CLASSIC, assist: 'plan', paused: false});
  assert.equal(sendInput(sess, {type: 'mode', agc: true}).ok, true);
  runTo(sess, at(5) + 333);
  assert.equal(sendInput(sess, {type: 'curtail', kind: 'solar', limitPct: 80}).ok, true);
  assert.equal(sendInput(sess, {type: 'mode', agc: false}).ok, false, 'AGC/HAND is locked after 04:30');
  for (let i = 0; i < 400; i++) frame(sess, 1 / 60);
  const file = JSON.parse(JSON.stringify(sessionLog(sess)));
  assert.equal(file.poked, false);
  assert.ok(file.log.length > 5, 'the plan issued inputs');
  const again = replay(file.seed, CLASSIC, file.log, {untilTick: sess.state.tick});
  assert.equal(hashState(again), hashState(sess.state));
  assert.deepEqual(observe(again).score, observe(sess.state).score);
});

test('ASSIST PAR and PLAN are par\'s own harness: a bench day with no other input equals runPar', () => {
  for (const [kind, proxy] of [['par', 'par'], ['plan', 'planOnly']]) {
    const until = at(5, 40);
    const sess = createSession({seed: 6, scenario: CLASSIC, assist: kind, paused: false});
    runTo(sess, at(4, 10));
    for (let i = 0; i < 300; i++) frame(sess, 1 / 60); // part of it through frames
    setSpeed(sess.director, 2100);
    while (sess.state.tick < until - 2000) frame(sess, 1 / 144);
    runTo(sess, until);
    const ref = runPar(6, CLASSIC, {proxy, untilTick: until});
    assert.equal(hashState(sess.state), hashState(ref.state), kind);
    assert.equal(sess.state.log.length, ref.log.length, kind + ' inputs');
  }
});

test('RE-PLAN (ASSIST PLAN): the player gets par\'s re-dispatch; the session still replays; the restore check is the input\'s own preview', () => {
  const sess = createSession({seed: 3, scenario: CLASSIC, assist: 'plan', paused: false});
  assert.notEqual(replan(sess), '', 'no plan before 04:30');
  runTo(sess, at(6));
  assert.equal(sendInput(sess, {type: 'start', unit: 'gta1'}).ok, true);
  runTo(sess, at(6, 20));
  const amended = sess.assist.memo.plan.amended;
  assert.equal(replan(sess), '');
  assert.equal(sess.assist.memo.plan.amended, amended + 1);
  assert.ok(sess.assist.memo.plan.queue.length > 0 && sess.assist.memo.plan.queue.every(e => e.re), 'the queue is the re-plan');
  assert.ok(sess.records.some(r => r.code === 'REPLAN' && r.sev === 'info'));
  const n = sess.state.log.length;
  runTo(sess, at(7, 30));
  assert.ok(sess.state.log.length > n, 'the re-planned keyframes are issued');
  const file = JSON.parse(JSON.stringify(sessionLog(sess)));
  assert.equal(hashState(replay(file.seed, CLASSIC, file.log, {untilTick: sess.state.tick})), hashState(sess.state));
  // RE-PLAN is ASSIST PLAN's: under PAR it does nothing (par re-plans itself).
  setAssist(sess, 'par');
  assert.notEqual(replan(sess), '');
  // K-13 on the bench: a lit lamp still asks the restore input's preview.
  const s2 = createSession({seed: 2, scenario: CLASSIC, assist: 'off', paused: false});
  runTo(s2, at(4, 10));
  assert.equal(sendInput(s2, {type: 'directShed'}).ok, true);
  runTo(s2, at(4, 20));
  const obs = observe(s2.state), checks = restoreChecks(s2, obs);
  const d = obs.districts.findIndex(x => x.dark);
  assert.equal(obs.districts[d].restoreBlock, '', 'the lamp is lit');
  assert.equal(checks[obs.districts[d].id], restorePermissive(s2.state, d, {preview: true}));
  assert.equal(Object.keys(checks).length, obs.districts.filter(x => x.dark && x.restoreBlock === '').length);
});

test('the assist switches itself off (and says so) if the autopilot throws; setAssist starts a fresh memory', () => {
  const sess = createSession({seed: 1, scenario: CLASSIC, assist: 'par', paused: false});
  runTo(sess, at(4, 31));
  sess.assist.memo = {proxy: 'nonsense'}; // corrupt it: decide() will throw
  runTo(sess, at(4, 33));
  assert.equal(sess.assist.kind, 'off');
  assert.ok(sess.records.some(r => r.code === 'ASSIST'), 'the bench logs why');
  setAssist(sess, 'plan');
  assert.equal(sess.assist.kind, 'plan');
  assert.equal(sess.assist.memo.plan, null);
});

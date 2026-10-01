// Phase 1a (sim agent): the K-12 synchroscope in the sim (desk/README.md §3.3; SPEC K-12).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe, hashState} from '../sim/step.js';
import {syncAt} from '../sim/grid.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {withoutContingencies} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S, DT = V.PHYS_DT, DEG = V.DEG_PER_TURN;
const idx = id => V.MACHINE_IDS.indexOf(id);

/** A day with unit `id` at full speed ('ready') at grid second ~2 (test poke: T1 cut short), in AGC or HAND. */
function ready(seed = 1, id = 'gtc1', hand = false) {
  const s = withoutContingencies(createState(seed, CLASSIC));
  if (hand) assert.equal(applyInput(s, {type: 'mode', agc: false}).ok, true);
  const u = s.units[idx(id)];
  u.mode = 'starting'; u.timerS = 1;
  while (u.mode !== 'ready') step(s);
  step(s); // one tick into the ready second
  return {s, u};
}
/** Poke the needle so that a close command now is judged (80 ms later) at angleDeg with slip slipHz. */
function needle(s, u, slipHz, angleDeg) {
  u.slipHz = u.slipToHz = slipHz;
  u.slipAtTick = s.tick;
  u.phaseAtDeg = angleDeg - DEG * slipHz * V.SYNC_BREAKER_TICKS * DT;
}
function close(s, id, bypass) {
  const out = [];
  const r = applyInput(s, bypass === undefined ? {type: 'syncClose', unit: id} : {type: 'syncClose', unit: id, bypass}, out);
  const rec = out.find(x => x.kind === 'sync');
  return {r, out, result: r.ok ? rec.result : 'blocked'};
}

test('K-12: a unit reaching full speed gets a seeded slip of 0.15-0.40 Hz either way and a phase angle; observe shows them', () => {
  const signs = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const {s, u} = ready(seed);
    const o = observe(s).units[idx('gtc1')];
    assert.ok(Math.abs(o.slipHz) >= V.SYNC_SLIP_MIN_HZ && Math.abs(o.slipHz) <= V.SYNC_SLIP_MAX_HZ, 'slip ' + o.slipHz);
    assert.ok(o.phaseDeg >= -DEG / 2 && o.phaseDeg < DEG / 2);
    assert.deepEqual([o.slipHz, o.phaseDeg], Object.values(syncAt(u, s.tick)));
    signs.add(Math.sign(o.slipHz));
    assert.equal(observe(s).units[idx('gta1')].slipHz, 0, '0 when not ready');
  }
  assert.deepEqual([...signs].sort(), [-1, 1]);
});

test('K-12: the angle is the exact integral of the piecewise-linear slip (analytic, matches tick-by-tick integration)', () => {
  const {s, u} = ready(3);
  applyInput(s, {type: 'scope', unit: 'gtc1'});
  const t0 = s.tick;
  let num = syncAt(u, t0).phaseDeg, slip = syncAt(u, t0).slipHz;
  assert.equal(applyInput(s, {type: 'syncTrim', unit: 'gtc1', dHz: V.SYNC_TRIM_HZ}).ok, true);
  const target = slip + V.SYNC_TRIM_HZ;
  for (let k = 1; k <= 200; k++) {
    const a = syncAt(u, t0 + k - 1).slipHz, b = syncAt(u, t0 + k).slipHz;
    num += DEG * (a + b) / 2 * DT; // trapezoid: exact for a linear slip within the tick
    const w = syncAt(u, t0 + k);
    const d = ((w.phaseDeg - num) % DEG + DEG + DEG / 2) % DEG - DEG / 2;
    assert.ok(Math.abs(d) < 1e-6, 'tick ' + k + ': ' + d);
  }
  const half = Math.round(V.SYNC_TRIM_S * TPS / 2);
  assert.ok(Math.abs(syncAt(u, t0 + half).slipHz - (slip + V.SYNC_TRIM_HZ * half / (V.SYNC_TRIM_S * TPS))) < 1e-9, 'linear through the trim');
  assert.ok(Math.abs(syncAt(u, t0 + V.SYNC_TRIM_S * TPS).slipHz - target) < 1e-9, 'there after SYNC_TRIM_S');
});

test('K-12: the outcome depends only on angle, direction and slip (the table), judged 80 ms after the close', () => {
  const cases = [[0.2, 5, 'clean'], [0.2, -8, 'clean'], [0.05, 0, 'clean'], [0.2, 15, 'rough'], [0.3, -19, 'rough'],
    [-0.2, 5, 'reverse'], [-0.3, -19, 'reverse'], [0.2, 25, 'blocked'], [-0.2, -40, 'blocked'], [0.6, 0, 'blocked'], [-0.6, 3, 'blocked']];
  for (const [slip, ang, want] of cases) {
    const seen = new Set();
    for (const [seed, id] of [[1, 'gtc1'], [7, 'gta1'], [12, 'gtb2'], [4, 'hydro3']]) {
      const {s, u} = ready(seed, id);
      needle(s, u, slip, ang);
      const c = close(s, id);
      seen.add(c.result);
      if (c.r.ok) {
        const rec = c.out.find(x => x.kind === 'sync');
        assert.ok(Math.abs(rec.angleDeg - ang) < 1e-9 && Math.abs(rec.slipHz - slip) < 1e-12, 'the record carries the judged angle and slip');
        assert.equal(rec.cue, want === 'clean' ? 'breaker' : 'growl');
        assert.ok(c.out.some(x => x.kind === 'breaker' && x.closed && x.unit === id));
      }
    }
    assert.deepEqual([...seen], [want], slip + ' Hz at ' + ang + ' deg');
  }
});

test('K-12: blocked by the sync-check relay (buzz), changing nothing; HAND + bypass closes, then trips with a 20-min lockout', () => {
  const {s, u} = ready(2);
  needle(s, u, 0.2, 30);
  const h = hashState(s);
  const out = [];
  const r = applyInput(s, {type: 'syncClose', unit: 'gtc1', bypass: true}, out);
  assert.equal(r.reason, 'blocked by sync-check relay', 'AGC has no bypass key');
  assert.equal(out[0].cue, 'buzz');
  assert.equal(hashState(s), h, 'a refused close changes nothing');
  const hnd = ready(2, 'gtc1', true);
  needle(hnd.s, hnd.u, 0.2, 30);
  assert.equal(close(hnd.s, 'gtc1', false).result, 'blocked');
  const c = close(hnd.s, 'gtc1', true);
  assert.equal(c.result, 'bypass');
  assert.equal(hnd.u.mode, 'tripped');
  assert.equal(hnd.u.timerS, V.SYNC_BYPASS_LOCKOUT_S);
  assert.ok(c.out.some(x => x.kind === 'breaker' && !x.closed && x.why === 'trip'));
});

test('K-12: a slow close (needle anticlockwise) trips on reverse power after 2 grid-s, back to ready with a new slip, no lockout', () => {
  const {s, u} = ready(5);
  needle(s, u, -0.2, 4);
  assert.equal(close(s, 'gtc1').result, 'reverse');
  assert.equal(u.sync, true);
  const t = s.tick, recs = [];
  while (s.tick < t + (V.SYNC_REVERSE_TRIP_S + 1) * TPS) for (const x of step(s)) recs.push(x);
  assert.equal(u.mode, 'ready');
  assert.equal(u.sync, false);
  assert.ok(recs.some(x => x.kind === 'breaker' && x.unit === 'gtc1' && !x.closed && x.why === 'trip'));
  assert.ok(Math.abs(syncAt(u, s.tick).slipHz) >= V.SYNC_SLIP_MIN_HZ, 'a new slip');
  assert.ok(u.timerS <= V.AUTO_SYNC_S && u.timerS >= V.AUTO_SYNC_S - 2, 'back in the auto-sync queue: ' + u.timerS);
});

test('K-12: a rough close picks up the block plus a one-second swing, then loads as a clean one', () => {
  const {s, u} = ready(6);
  needle(s, u, 0.25, 14);
  assert.equal(close(s, 'gtc1').result, 'rough');
  const m = V.MACHINES[idx('gtc1')];
  assert.equal(u.schedMW, Math.min(m.syncBlockMW, m.minMW) + V.SYNC_ROUGH_MW);
  const t = s.tick;
  while (s.tick < t + 2 * TPS) step(s);
  assert.ok(u.schedMW < Math.min(m.syncBlockMW, m.minMW) + 3 * m.rampMWs, 'the swing is gone: ' + u.schedMW);
  assert.equal(u.mode, 'loading');
});

test('K-12 AUTO: syncAuto trims to +0.10 Hz and closes on the next pass through 0 degrees; always clean', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const {s, u} = ready(seed);
    // Any slip in range, either way, any angle (the seeded one), trimmed first by a few presses.
    applyInput(s, {type: 'scope', unit: 'gtc1'});
    for (let k = 0; k < seed % 5; k++) applyInput(s, {type: 'syncTrim', unit: 'gtc1', dHz: seed % 2 ? V.SYNC_TRIM_HZ : -V.SYNC_TRIM_HZ});
    const t0 = s.tick;
    assert.equal(applyInput(s, {type: 'syncAuto', unit: 'gtc1'}).ok, true);
    assert.ok(s.scope.nextAutoTick > t0);
    let rec = null;
    while (!rec && s.tick < t0 + 20 * TPS) for (const x of step(s)) if (x.kind === 'sync') rec = x;
    assert.ok(rec, 'seed ' + seed + ': closed');
    assert.equal(rec.result, 'auto');
    assert.ok(Math.abs(rec.angleDeg) <= V.SYNC_CLEAN_DEG && rec.slipHz > 0, 'seed ' + seed + ': ' + rec.angleDeg + ' deg, ' + rec.slipHz + ' Hz');
    assert.ok(s.tick - t0 <= (V.SYNC_TRIM_S + 1 / V.SYNC_AUTO_SLIP_HZ) * TPS + 1, 'within the trim and one turn');
    assert.equal(u.sync, true);
    assert.equal(s.scope.unit, '', 'the unit left the scope');
    assert.equal(s.scope.nextAutoTick, -1);
  }
  const hnd = ready(1, 'gtc1', true);
  assert.match(applyInput(hnd.s, {type: 'syncAuto', unit: 'gtc1'}).reason, /HAND/);
});

test('K-12 / A-4: the background auto-synchroniser waits while the unit is on the scope; trims need the scope; the scope needs ready', () => {
  const {s, u} = ready(8);
  assert.match(applyInput(s, {type: 'syncTrim', unit: 'gtc1', dHz: V.SYNC_TRIM_HZ}).reason, /synchroscope/);
  assert.match(applyInput(s, {type: 'scope', unit: 'gtb1'}).reason, /not at full speed/);
  assert.equal(applyInput(s, {type: 'scope', unit: 'gtc1'}).ok, true);
  assert.deepEqual(observe(s).scope, {unit: 'gtc1', open: true});
  const timer = u.timerS;
  const t = s.tick;
  while (s.tick < t + (V.AUTO_SYNC_S + 30) * TPS) step(s);
  assert.equal(u.mode, 'ready', 'no auto-sync while on the scope');
  assert.equal(u.timerS, timer);
  assert.equal(applyInput(s, {type: 'scope', unit: ''}).ok, true);
  while (s.tick < t + (2 * V.AUTO_SYNC_S + 60) * TPS && u.mode === 'ready') step(s);
  assert.notEqual(u.mode, 'ready', 'auto-sync resumed once the scope closed');
});

test('F-2 / F-7: a JSON round trip with the scope open and a syncAuto pending resumes bit-identically', () => {
  const {s} = ready(9);
  applyInput(s, {type: 'scope', unit: 'gtc1'});
  applyInput(s, {type: 'syncTrim', unit: 'gtc1', dHz: -V.SYNC_TRIM_HZ});
  applyInput(s, {type: 'syncAuto', unit: 'gtc1'});
  for (let k = 0; k < 7; k++) step(s);
  const b = JSON.parse(JSON.stringify(s));
  const until = s.tick + 30 * TPS;
  while (s.tick < until) step(s);
  while (b.tick < until) step(b);
  assert.equal(JSON.stringify(b), JSON.stringify(s));
  assert.equal(s.units[idx('gtc1')].sync, true);
});

test('F-6: a log with every synchroscope input (scope, syncTrim, syncAuto, syncClose) replays to the same hash', () => {
  const s = withoutContingencies(createState(10, CLASSIC));
  while (s.tick < 60 * TPS + 1) step(s);
  for (const id of ['gtc1', 'gtc2']) assert.equal(applyInput(s, {type: 'start', unit: id}).ok, true);
  const t1 = s.tick + (V.MACHINES[idx('gtc1')].t1S + 2) * TPS;
  while (s.tick < t1) step(s);
  for (const x of [{type: 'scope', unit: 'gtc1'}, {type: 'syncTrim', unit: 'gtc1', dHz: V.SYNC_TRIM_HZ}, {type: 'syncAuto', unit: 'gtc2'}]) {
    assert.equal(applyInput(s, x).ok, true, x.type);
  }
  const u1 = s.units[idx('gtc1')];
  while (s.tick < t1 + 3 * TPS) step(s);
  // Close gtc1 by hand when its needle is inside the clean window, whatever the seed drew.
  let closed = false;
  for (let k = 0; k < 20 * TPS && !closed; k++) {
    if (Math.abs(syncAt(u1, s.tick + V.SYNC_BREAKER_TICKS).phaseDeg) <= V.SYNC_CLEAN_DEG) closed = applyInput(s, {type: 'syncClose', unit: 'gtc1'}).ok;
    step(s);
  }
  assert.ok(closed, 'gtc1 closed by hand');
  while (s.tick < t1 + 60 * TPS) step(s);
  assert.equal(s.units[idx('gtc2')].sync, true, 'gtc2 closed by AUTO');
  const types = new Set(s.log.map(r => r.type));
  for (const t of ['scope', 'syncTrim', 'syncAuto', 'syncClose']) assert.ok(types.has(t), t);
  assert.deepEqual(s.log.find(r => r.type === 'syncClose').args, {unit: 'gtc1', bypass: false}, 'the optional bypass is logged');
  const b = withoutContingencies(createState(10, CLASSIC));
  let j = 0;
  while (b.tick < s.tick) {
    const batch = [];
    while (j < s.log.length && s.log[j].tick === b.tick) { batch.push(Object.assign({type: s.log[j].type}, s.log[j].args)); j++; }
    step(b, batch);
  }
  assert.equal(hashState(b), hashState(s));
  assert.deepEqual(b.log, s.log);
});

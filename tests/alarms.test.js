// K-8 / K-21: the annunciator model (app/alarms.js) and K-9: the message tray model
// (app/tray.js). The competent proxy's day triggers <= 8 audible alarms (one seed, a daily).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V} from '../sim/params.js';
import {createState, step, observe} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {CLASSIC, DESK_WEEKEND} from '../content/scenarios.js';
import {followDay} from './lib/follow.js';
import * as A from '../app/alarms.js';
import * as T from '../app/tray.js';

const TPS = V.TICKS_PER_S;

/** desk/README.md §5's control ids. */
function contractIds() {
  const md = readFileSync(new URL('../desk/README.md', import.meta.url), 'utf8');
  const at = md.indexOf('Control and target ids');
  const block = md.slice(at, md.indexOf('\n\n', at)).replace(/`/g, ' ');
  return new Set(block.split(/\s+/).filter(x => /^[a-z][a-z0-9-]*$/.test(x)));
}

// A quiet snapshot; tests override fields.
const snap = over => Object.assign({s: 10000, h: 10, fHz: 50, rocof: 0, level: 'SECURE', agcAtLimitS: 0, hydroFrac: 0.8, battFrac: 0.5,
  inWatch: false, contCount: 0, cont: null, newsCount: 0, news: null}, over);
const tile = (a, id) => A.alarmsView(a).tiles.find(t => t.id === id);

test('K-21: every tile has exactly one base priority and a target control id; 12 tiles (4 x 3), each with a glyph per state', () => {
  const ids = contractIds();
  assert.equal(A.TILES.length, 12);
  const seen = new Set();
  for (const t of A.TILES) {
    assert.ok(['P1', 'P2', 'P3'].includes(t.prio), t.id + ' ' + t.prio);
    assert.equal(typeof t.escalates, 'boolean', t.id);
    assert.ok(ids.has(t.target), t.id + ' targets #' + t.target + ', not a §5 id');
    assert.ok(!seen.has(t.id));
    seen.add(t.id);
  }
  for (const label of ['UNDER FREQ', 'OVER FREQ', 'N-1 INSECURE', 'HIGH RoCoF', 'UNIT TRIP', 'LINK TRIP', 'UFLS OPERATED', 'AGC LIMIT',
    'STORAGE LOW', 'MIN GEN', 'WEATHER', 'PEAK']) assert.ok(A.TILES.some(t => t.label === label), label);
  // K-21 P1: UFLS, unit trip, N-1 insecure at the peak. Frequency outside 49.5-50.5 Hz is the
  // UNDER / OVER FREQ tiles ESCALATED (B-1): their base priority is P2, and only they escalate.
  for (const id of ['ufls', 'unitTrip', 'linkTrip', 'peak']) assert.equal(A.TILES.find(t => t.id === id).prio, 'P1', id);
  assert.deepEqual(A.TILES.filter(t => t.escalates).map(t => t.id), ['underFreq', 'overFreq']);
  for (const t of A.TILES.filter(x => x.escalates)) assert.equal(t.prio, 'P2', t.id);
  assert.equal(A.TILES.find(t => t.id === 'weather').prio, 'P3');
  const glyphs = new Set(Object.values(A.GLYPH));
  assert.equal(glyphs.size, 4, 'status is never colour-only (K-22)');
  assert.equal(A.GLYPH.cleared, '◇', 'B-2: the ring-back glyph');
  const v = A.alarmsView(A.createAlarms());
  for (const t of v.tiles) {
    assert.ok(t.glyph && t.target && t.label && t.prio);
    assert.equal(t.prio, t.basePrio, 'at rest the effective priority is the base one');
    assert.equal(t.escalated, false);
  }
});

test('B-1: UNDER / OVER FREQ chime at the normal band and escalate to the horn outside 49.5-50.5 Hz', () => {
  const a = A.createAlarms();
  let ms = 0, s = 10000;
  const up = f => A.updateAlarms(a, snap({fHz: f, s: s++}), {nowMs: (ms += 100), realDtS: 0.1});
  let r = up(49.84);
  assert.deepEqual(r.cues, ['chime'], 'P2 at the normal band');
  assert.deepEqual([tile(a, 'underFreq').prio, tile(a, 'underFreq').basePrio, tile(a, 'underFreq').escalated], ['P2', 'P2', false]);
  assert.equal(A.alarmsView(a).sounding, false, 'a chime is one sound');
  A.ackAll(a);
  assert.equal(tile(a, 'underFreq').state, 'ackd');
  r = up(49.49);
  assert.deepEqual([tile(a, 'underFreq').prio, tile(a, 'underFreq').escalated], ['P1', true]);
  assert.equal(tile(a, 'underFreq').state, 'alarm', 'an acknowledged alarm that escalates flashes again');
  assert.equal(r.newAlarm, true, 'an escalation ends FAST');
  assert.deepEqual(r.cues, ['horn'], 'the horn means real trouble');
  assert.equal(a.audible, 1, 'inside the tile\'s hold-off the horn is the same sounding, upgraded (B-3)');
  assert.equal(a.repeats, 1);
  assert.equal(A.alarmsView(a).sounding, true);
  ms += 4000;
  assert.deepEqual(up(49.45).cues, ['horn'], 'the horn repeats while escalated and unacknowledged');
  // Back inside containment (with hysteresis): P2 again, the horn stops.
  up(49.52);
  assert.equal(tile(a, 'underFreq').escalated, true, 'not yet: 0.05 Hz of hysteresis');
  up(49.56);
  assert.deepEqual([tile(a, 'underFreq').prio, tile(a, 'underFreq').escalated, tile(a, 'underFreq').state], ['P2', false, 'alarm']);
  ms += 4000;
  assert.deepEqual(up(49.6).cues, [], 'no horn once it is a warning again');
  assert.equal(A.alarmsView(a).sounding, false);
  // A dip straight through both limits inside one frame (sampleTick sees it) is a horn at once.
  const b = A.createAlarms(), st = createState(1, CLASSIC);
  st.phys.fHz = 49.3; A.sampleTick(b, st);
  st.phys.fHz = 49.9;
  r = A.updateAlarms(b, A.alarmInputFromState(st), {nowMs: 0, realDtS: 0.016});
  assert.deepEqual(r.cues, ['horn']);
  assert.equal(tile(b, 'underFreq').escalated, true);
  assert.equal(b.audible, 1);
  // OVER FREQ the same way; an escalation outside the hold-off is a new sounding.
  const c = A.createAlarms();
  assert.deepEqual(A.updateAlarms(c, snap({fHz: 50.2}), {nowMs: 0}).cues, ['chime']);
  assert.deepEqual(A.updateAlarms(c, snap({fHz: 50.6, s: 10001}), {nowMs: 31000}).cues, ['horn']);
  assert.equal(tile(c, 'overFreq').prio, 'P1');
  assert.equal(c.audible, 2);
  assert.equal(c.repeats, 0);
  // The other tiles never escalate.
  assert.equal(tile(c, 'underFreq').escalated, false);
});

test('B-3: a P2 chime repeats once, 60 real s later, only if still unacknowledged; SILENCE and ACK cancel it; repeats are not audible alarms', () => {
  const run = between => {
    const a = A.createAlarms(), cues = [];
    let s = 10000;
    const up = ms => { const r = A.updateAlarms(a, snap({s: s++, hydroFrac: 0.2}), {nowMs: ms, realDtS: 1}); cues.push(...r.cues.map(c => c + '@' + ms)); };
    up(0);
    if (between) between(a);
    for (let ms = 1000; ms <= 200000; ms += 1000) up(ms);
    return {a, cues};
  };
  let r = run(null);
  assert.deepEqual(r.cues, ['chime@0', 'chime@60000'], 'once, never a third time');
  assert.equal(r.a.audible, 1);
  assert.equal(r.a.repeats, 1);
  assert.deepEqual(run(a => A.ackAll(a)).cues, ['chime@0'], 'acknowledged: no repeat');
  assert.deepEqual(run(a => A.ackTile(a, 'storageLow')).cues, ['chime@0']);
  assert.deepEqual(run(a => A.silence(a)).cues, ['chime@0'], 'SILENCE stops the sound, the repeat too');
  // Horn repeats count as repeats as well.
  const h = A.createAlarms();
  A.updateAlarms(h, snap({fHz: 49.4}), {nowMs: 0});
  for (let ms = 1000; ms <= 12000; ms += 1000) A.updateAlarms(h, snap({fHz: 49.4, s: 10000 + ms / 1000}), {nowMs: ms});
  assert.equal(h.audible, 1);
  assert.equal(h.repeats, 3, 'the horn at 4, 8 and 12 s');
});

test('K-8 accept: across a scripted storm no tile starts a new sounding within 30 real s of its last; held alarms sound once after', () => {
  // A deterministic storm: frequency flapping through both limits, the security level
  // flapping, storage low on and off, a watch in the middle, ACK now and then.
  const a = A.createAlarms();
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let ms = 0, s = 10000, cues = 0;
  const cont = {n: 0, cause: 'unit', id: 'coal2', uflsStages: 1, watchEndS: 0};
  for (let i = 0; i < 6000; i++) {
    ms += 100 + Math.floor(rnd() * 400);
    s += 12;
    const inWatch = i >= 2000 && i < 2040;
    if (i === 2000) cont.watchEndS = s + 40 * 12;
    const f = [50, 49.8, 49.4, 49.95, 50.2, 50.7, 49.86][Math.floor(rnd() * 7)];
    const x = snap({s, fHz: f, rocof: rnd() < 0.1 ? 1.4 : 0.1, level: rnd() < 0.5 ? 'TIGHT' : 'SECURE', h: 18, hydroFrac: rnd() < 0.3 ? 0.2 : 0.5,
      agcAtLimitS: rnd() < 0.5 ? 10 : 0, inWatch, contCount: i >= 2000 ? 1 : 0, cont: i >= 2000 ? cont : null});
    const r = A.updateAlarms(a, x, {nowMs: ms, realDtS: 0.3, stationOf: () => 'coal'});
    cues += r.cues.length;
    if (inWatch) assert.deepEqual(r.cues, [], 'sounds are held during the watch');
    if (!inWatch && rnd() < 0.02) A.ackAll(a);
    if (rnd() < 0.01) A.silence(a);
  }
  assert.ok(a.sounds.length > 40, 'the storm sounded: ' + a.sounds.length);
  assert.equal(a.audible, a.sounds.length, 'audible counts soundings only');
  assert.equal(cues, a.audible + a.repeats, 'every cue is a sounding or a re-sound');
  assert.ok(a.repeats > 0);
  const last = {};
  for (const snd of a.sounds) {
    for (const id of snd.tiles) {
      if (id in last) assert.ok(snd.atMs - last[id] >= A.RESOUND_HOLDOFF_S * 1000, id + ' sounded twice ' + (snd.atMs - last[id]) + ' ms apart');
      last[id] = snd.atMs;
    }
  }
  assert.ok(a.sounds.some(x => x.tiles.includes('ufls')), 'the watch\'s held alarms sounded after it');
  // An alarm that sets again inside its hold-off flashes, is held, and sounds when the window ends.
  const b = A.createAlarms();
  A.updateAlarms(b, snap({hydroFrac: 0.2}), {nowMs: 0});
  A.updateAlarms(b, snap({hydroFrac: 0.5, s: 10001}), {nowMs: 1000});
  A.ackAll(b);
  let r = A.updateAlarms(b, snap({hydroFrac: 0.2, s: 10002}), {nowMs: 5000});
  assert.equal(tile(b, 'storageLow').state, 'alarm');
  assert.deepEqual(r.cues, []);
  assert.deepEqual(A.updateAlarms(b, snap({hydroFrac: 0.2, s: 10003}), {nowMs: 29000}).cues, []);
  assert.deepEqual(A.updateAlarms(b, snap({hydroFrac: 0.2, s: 10004}), {nowMs: 30000}).cues, ['chime'], 'when the 30 s end, if unacknowledged');
  assert.equal(b.audible, 2);
});

test('K-8: UNDER FREQ sets below 49.85 Hz and clears above 49.90 Hz (hysteresis); extremes inside a frame count', () => {
  const a = A.createAlarms();
  const up = (f, ms = 0) => A.updateAlarms(a, snap({fHz: f}), {nowMs: ms, realDtS: 0.016});
  up(49.86);
  assert.equal(tile(a, 'underFreq').state, 'normal');
  const r = up(49.84, 1000);
  assert.equal(tile(a, 'underFreq').state, 'alarm');
  assert.equal(tile(a, 'underFreq').flash, 'fast');
  assert.deepEqual(r.cues, ['chime'], 'P2 chime at the normal band (B-1)');
  assert.equal(r.newAlarm, true);
  up(49.88, 2000);
  assert.equal(tile(a, 'underFreq').state, 'alarm', 'still set between 49.85 and 49.90');
  up(49.91, 3000);
  assert.equal(tile(a, 'underFreq').state, 'cleared', 'cleared before ACK: slow flash');
  assert.equal(tile(a, 'underFreq').flash, 'slow');
  A.ackAll(a);
  assert.equal(tile(a, 'underFreq').state, 'normal');
  // A dip inside a frame (between two updates) still sets it: sampleTick sees every tick.
  const s = createState(1, CLASSIC);
  s.phys.fHz = 49.80; A.sampleTick(a, s);
  s.phys.fHz = 49.99;
  A.updateAlarms(a, A.alarmInputFromState(s), {nowMs: 60000, realDtS: 0.016});
  assert.equal(tile(a, 'underFreq').state, 'alarm');
  // OVER FREQ: > 50.15 sets, < 50.10 clears.
  const b = A.createAlarms();
  A.updateAlarms(b, snap({fHz: 50.16}), {nowMs: 0});
  assert.equal(tile(b, 'overFreq').state, 'alarm');
  A.ackAll(b);
  assert.equal(tile(b, 'overFreq').state, 'ackd', 'ACK turns the flash steady');
  assert.equal(tile(b, 'overFreq').flash, null);
  A.updateAlarms(b, snap({fHz: 50.12}), {nowMs: 100});
  assert.equal(tile(b, 'overFreq').state, 'ackd');
  A.updateAlarms(b, snap({fHz: 50.09}), {nowMs: 200});
  assert.equal(tile(b, 'overFreq').state, 'normal', 'an acknowledged alarm that clears goes dark');
});

test('K-8: SILENCE stops the sound only; the horn repeats every 4 s until then; no tile sounds twice within 30 s', () => {
  // 49.4 Hz: UNDER FREQ escalated (B-1), a P1 horn.
  const a = A.createAlarms();
  let r = A.updateAlarms(a, snap({fHz: 49.4}), {nowMs: 0});
  assert.deepEqual(r.cues, ['horn']);
  assert.equal(A.alarmsView(a).sounding, true);
  r = A.updateAlarms(a, snap({fHz: 49.4, s: 10001}), {nowMs: 2000});
  assert.deepEqual(r.cues, [], 'not yet');
  r = A.updateAlarms(a, snap({fHz: 49.4, s: 10002}), {nowMs: 4100});
  assert.deepEqual(r.cues, ['horn'], 'repeat after 4 real s');
  assert.equal(a.audible, 1, 'a repeat is not a new audible alarm');
  assert.equal(a.repeats, 1);
  A.silence(a);
  assert.equal(A.alarmsView(a).sounding, false);
  assert.equal(tile(a, 'underFreq').state, 'alarm', 'SILENCE leaves the tile flashing');
  r = A.updateAlarms(a, snap({fHz: 49.4, s: 10003}), {nowMs: 9000});
  assert.deepEqual(r.cues, [], 'silenced');
  // Clear, ACK, set again within 30 real s: flashes but does not sound.
  A.updateAlarms(a, snap({fHz: 49.95, s: 10004}), {nowMs: 10000});
  A.ackAll(a);
  r = A.updateAlarms(a, snap({fHz: 49.4, s: 10005}), {nowMs: 20000});
  assert.equal(tile(a, 'underFreq').state, 'alarm');
  assert.deepEqual(r.cues, [], 'no re-sound within 30 s');
  A.updateAlarms(a, snap({fHz: 49.95, s: 10006}), {nowMs: 21000});
  A.ackAll(a);
  r = A.updateAlarms(a, snap({fHz: 49.4, s: 10007}), {nowMs: 40000});
  assert.deepEqual(r.cues, ['horn'], 'sounds again after 30 s');
  // ACK one tile.
  assert.equal(A.ackTile(a, 'underFreq'), true);
  assert.equal(tile(a, 'underFreq').state, 'ackd');
  assert.equal(A.ackTile(a, 'nope'), false);
});

test('K-21: during the watch sounds are held; still unacknowledged, they sound once after it; P3 is silent; P2 chimes once', () => {
  const a = A.createAlarms();
  const cont = {n: 0, cause: 'unit', id: 'coal2', uflsStages: 0, watchEndS: 10030};
  let r = A.updateAlarms(a, snap({inWatch: true, contCount: 1, cont, fHz: 49.6, rocof: 1.3}), {nowMs: 0, stationOf: () => 'coal'});
  assert.deepEqual(r.cues, [], 'held in the watch');
  assert.equal(r.newAlarm, true);
  assert.equal(tile(a, 'unitTrip').state, 'alarm');
  assert.equal(tile(a, 'unitTrip').target, 'lever-coal', 'the trip tile points at the tripped unit\'s lever');
  r = A.updateAlarms(a, snap({s: 10031, inWatch: false, contCount: 1, cont, fHz: 49.8}), {nowMs: 29000});
  assert.deepEqual(r.cues, ['horn'], 'one sound after the watch');
  assert.equal(a.audible, 1);
  assert.deepEqual(a.sounds[0].tiles.sort(), ['rocof', 'underFreq', 'unitTrip'].sort());
  // Acknowledged during the watch: silent afterwards.
  const b = A.createAlarms();
  A.updateAlarms(b, snap({inWatch: true, contCount: 1, cont, fHz: 49.6}), {nowMs: 0});
  A.ackAll(b);
  r = A.updateAlarms(b, snap({s: 10031, inWatch: false, contCount: 1, cont, fHz: 49.8}), {nowMs: 29000});
  assert.deepEqual(r.cues, []);
  assert.equal(b.audible, 0);
  // WEATHER (P3) sets silently; STORAGE LOW (P2) chimes once and does not keep sounding.
  const c = A.createAlarms();
  r = A.updateAlarms(c, snap({newsCount: 1, news: {atS: 9000, fromS: 12000, toS: null, kind: 'storm'}}), {nowMs: 0});
  assert.equal(tile(c, 'weather').state, 'alarm');
  assert.deepEqual(r.cues, []);
  r = A.updateAlarms(c, snap({s: 10001, hydroFrac: 0.29}), {nowMs: 1000});
  assert.deepEqual(r.cues, ['chime']);
  assert.equal(A.alarmsView(c).sounding, false, 'a chime is one sound');
  assert.equal(tile(c, 'storageLow').target, 'wheel-hydro');
});

test('K-8: N-1 INSECURE after 10 grid-s not SECURE; it clears after a 30-min secure window; AGC LIMIT after 5 real s; PEAK', () => {
  const a = A.createAlarms();
  let s = 20000;
  const up = (level, h = 10, agc = 0, dt = 0.016) => A.updateAlarms(a, snap({s: s++, h, level, agcAtLimitS: agc}), {nowMs: s * 10, realDtS: dt});
  up('SECURE');
  for (let i = 0; i < A.N1_SET_S; i++) up('TIGHT');
  assert.equal(tile(a, 'n1').state, 'normal');
  up('TIGHT');
  assert.equal(tile(a, 'n1').state, 'alarm');
  A.ackAll(a);
  for (let i = 0; i < A.N1_CLEAR_S - 1; i++) { up('SECURE'); if (i === 100) up('TIGHT'); }
  assert.equal(tile(a, 'n1').state, 'ackd', 'a brief TIGHT restarts the secure window');
  for (let i = 0; i < 200; i++) up('SECURE');
  assert.equal(tile(a, 'n1').state, 'normal');
  // AGC LIMIT: real seconds, not grid seconds.
  for (let i = 0; i < 300; i++) up('SECURE', 10, i + 1, 0.016);
  assert.equal(tile(a, 'agcLimit').state, 'normal', '300 grid-s at 120x is 4.8 real s');
  for (let i = 0; i < 20; i++) up('SECURE', 10, 400 + i, 0.016);
  assert.equal(tile(a, 'agcLimit').state, 'alarm');
  // PEAK: 17:00-20:00 and not SECURE.
  const b = A.createAlarms();
  for (let i = 0; i < 12; i++) A.updateAlarms(b, snap({s: 50000 + i, h: 16.5, level: 'TIGHT'}), {nowMs: i});
  assert.equal(tile(b, 'peak').state, 'normal');
  A.updateAlarms(b, snap({s: 50020, h: 17.1, level: 'TIGHT'}), {nowMs: 100});
  assert.equal(tile(b, 'peak').state, 'alarm');
  assert.equal(tile(b, 'peak').prio, 'P1');
});

test('the alarm snapshot from observe() equals the one read straight from state', () => {
  const s = createState(4, CLASSIC);
  for (let i = 0; i < 3 * 60 * TPS + 17; i++) step(s);
  const a = A.alarmInput(observe(s)), b = A.alarmInputFromState(s);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const k of Object.keys(a)) {
    if (typeof a[k] === 'number') assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k + ' ' + a[k] + ' vs ' + b[k]);
    else assert.deepEqual(a[k], b[k], k);
  }
  assert.equal(a.spillMW, 0, 'the classic day never spills (no rooftop: C-1)');
});

// ------------------------------------------------------------------ MIN GEN (Phase 2a, desk/README.md C-9, §21.4)

test('MIN GEN: sets after 60 grid-s of more than 50 MW spilled, clears only after 1,800 grid-s under 10 MW; a snapshot without spillMW never sets it', () => {
  assert.deepEqual([A.MINGEN_SET_MW, A.MINGEN_SET_S, A.MINGEN_CLEAR_MW, A.MINGEN_CLEAR_S], [V.SURPLUS_MIN_MW, 60, 10, 1800]);
  const t = A.TILES.find(x => x.id === 'minGen');
  assert.deepEqual([t.prio, t.target], ['P2', 'stack']);
  const a = A.createAlarms();
  let s = 30000;
  const up = spillMW => A.updateAlarms(a, snap(spillMW === undefined ? {s: s++} : {s: s++, spillMW}), {nowMs: s * 10, realDtS: 0.016});
  for (let i = 0; i < 300; i++) up(undefined);
  assert.equal(tile(a, 'minGen').state, 'normal', 'a CLASSIC fixture has no spillMW');
  for (let i = 0; i < 300; i++) up(A.MINGEN_SET_MW);
  assert.equal(tile(a, 'minGen').state, 'normal', 'exactly 50 MW is not more than 50 MW');
  // above the level, but not for 60 s on end
  for (let i = 0; i < A.MINGEN_SET_S; i++) up(120);
  assert.equal(tile(a, 'minGen').state, 'normal');
  up(40);
  for (let i = 0; i < A.MINGEN_SET_S; i++) up(120);
  assert.equal(tile(a, 'minGen').state, 'normal', 'a dip under the level restarts the 60 s');
  const r = up(120);
  assert.equal(tile(a, 'minGen').state, 'alarm');
  assert.deepEqual(r.cues, ['chime'], 'P2: one chime');
  A.ackAll(a);
  // between the two levels it holds; under 10 MW it clears only after 1,800 s on end
  for (let i = 0; i < 3000; i++) up(30);
  assert.equal(tile(a, 'minGen').state, 'ackd', '30 MW is under the set level and over the clear level: held');
  for (let i = 0; i < A.MINGEN_CLEAR_S - 1; i++) { up(0); if (i === 900) up(15); }
  assert.equal(tile(a, 'minGen').state, 'ackd', 'a cloud passing: 15 MW for a second restarts the clear window');
  for (let i = 0; i < 1000; i++) up(0);
  assert.equal(tile(a, 'minGen').state, 'normal');
  // and it does not chime again for a cloud over the belly: spilling again within the clear window was never cleared
  // (the operator ACKs each sound, so B-3's one repeat of an unacknowledged chime is not counted)
  const b = A.createAlarms();
  let n = 0, s2 = 40000;
  const up2 = spillMW => { const x = A.updateAlarms(b, snap({s: s2++, spillMW}), {nowMs: s2 * 1000, realDtS: 1}); n += x.cues.length; if (x.cues.length) A.ackAll(b); };
  for (let k = 0; k < 6; k++) { for (let i = 0; i < 600; i++) up2(200); for (let i = 0; i < 600; i++) up2(0); }
  assert.equal(n, 1, 'six ten-minute clouds: one chime');
});

test('MIN GEN on a real belly: observe() and state give the same spillMW; the tile lights on a mild weekend noon and not before sunrise', () => {
  const a = A.createAlarms();
  let spillS = 0, setS = -1, checked = 0;
  const day = followDay(5, DESK_WEEKEND, {follow: false, untilH: 13, onMinute: (st, obs) => {
    const x = A.alarmInput(obs), y = A.alarmInputFromState(st);
    assert.deepEqual(Object.keys(x), Object.keys(y));
    assert.ok(Math.abs(x.spillMW - y.spillMW) < 1e-9, 'spillMW ' + x.spillMW + ' vs ' + y.spillMW);
    assert.equal(x.spillMW, obs.wind.autoMW + obs.solar.autoMW);
    checked++;
    if (x.spillMW > A.MINGEN_SET_MW) spillS += 60;
    A.updateAlarms(a, x, {nowMs: obs.s * 10, realDtS: 0.5});
    if (setS < 0 && tile(a, 'minGen').state !== 'normal') setS = obs.s;
    if (obs.s < (7 - V.DAY_START_H) * V.S_PER_H) assert.equal(tile(a, 'minGen').state, 'normal', 'before the sun is up nothing is spilled');
  }});
  assert.ok(checked > 400);
  assert.equal(day.st.black, false);
  assert.ok(spillS >= 1800, 'the do-nothing weekend spills for ' + spillS / 60 + ' min by 13:00 (both CCGTs at minimum under the belly)');
  assert.ok(setS > (8 - V.DAY_START_H) * V.S_PER_H && setS < (13 - V.DAY_START_H) * V.S_PER_H, 'MIN GEN set at ' + setS);
});

/** Count the competent proxy's audible alarms over a day; the operator ACKs 3 real s after each sound. */
function competentDay(seed) {
  const a = A.createAlarms();
  let realMs = 0, lastS = -1, ackAt = Infinity;
  const stationOf = id => id.replace(/\d+$/, '');
  runPar(seed, CLASSIC, {proxy: 'competent', onStep: st => {
    A.sampleTick(a, st);
    if (st.tick % TPS !== 0 || st.tick < V.PLAYER_START_TICK) return;
    const x = A.alarmInputFromState(st);
    // Real time: 120x at CRUISE, about 1x in the watch.
    realMs += (lastS < 0 ? 0 : x.s - lastS) * 1000 / (x.inWatch ? 1 : 120);
    lastS = x.s;
    const r = A.updateAlarms(a, x, {nowMs: realMs, realDtS: 1 / (x.inWatch ? 1 : 120), stationOf});
    if (r.cues.length || r.newAlarm) ackAt = Math.min(ackAt, realMs + 3000);
    if (realMs >= ackAt) { A.ackAll(a); ackAt = Infinity; }
  }});
  return a;
}

test('K-8 accept: the competent proxy triggers <= 8 audible alarms in a day', () => {
  // "Per daily": a daily is a seed that passes D-9's gate, so par must shed nothing on it; seed 1
  // is one. Seeds par cannot solve (practice "Hard days" at most) are not held to it (stage C:
  // seed 4, where par sheds 559 MWh, sounds 10). One whole day: the count is a day's.
  const seeds = [1];
  const counts = seeds.map(seed => {
    const a = competentDay(seed);
    assert.ok(a.audible <= 8, 'seed ' + seed + ': ' + a.audible + ' audible alarms ' + JSON.stringify(a.sounds));
    return a.audible;
  });
  assert.ok(counts.every(n => n >= 1), 'a day is not silent: ' + counts);
});

// ------------------------------------------------------------------ the tray (K-9)

const news = (atS, kind, fromS) => ({tick: atS * TPS, kind: 'announce', news: {atS, kind, fromS, toS: null, text: 'Storm warning: gusts ' +
  'above the survival speed of the wind farms are expected from the afternoon, with the front crossing the ranges before dusk ' +
  'and lingering until late evening over the coast.'}});

test('K-9: at most 3 cards; warning cards ring twice and never repeat; <= 25 words; the rest go to the LOG', () => {
  const tr = T.createTray();
  let cues = T.trayRecords(tr, [news(100, 'storm', 5000)]);
  assert.deepEqual(cues, ['ring2'], 'a warning rings twice');
  cues = T.trayRecords(tr, [news(100, 'storm', 5000)]);
  assert.deepEqual(cues, [], 'never repeats');
  assert.equal(tr.cards.length, 1);
  assert.ok(tr.cards[0].text.split(/\s+/).length <= T.MAX_WORDS + 0, tr.cards[0].text);
  assert.ok(tr.cards[0].text.endsWith('…'));
  T.trayRecords(tr, [{tick: 200 * TPS, kind: 'contingency', cause: 'unit', id: 'coal3', lostMW: 612},
    {tick: 201 * TPS, kind: 'ufls', stage: 1, districts: ['HAZ1', 'TAL1'], mw: 400},
    {tick: 202 * TPS, kind: 'log', sev: 'info', code: 'UNIT_READY', msg: 'GT·A at full speed: auto-sync in 4 min.'}]);
  const v = T.trayView(tr);
  assert.equal(v.cards.length, T.MAX_CARDS);
  assert.equal(v.log.length, 1);
  for (const c of [...v.cards, ...v.log]) {
    assert.ok(Object.values(T.SENDERS).includes(c.from), c.from);
    assert.deepEqual(Object.keys(c.button).sort(), ['label', 'target'], 'a button only focuses a control');
    assert.match(c.time, /^\d\d:\d\d$/);
  }
  assert.equal(v.cards.find(c => /tripped/.test(c.text)).button.target, 'lever-coal');
  T.trayFrame(tr, 202 + T.CARD_TTL_S + 1);
  assert.equal(T.trayView(tr).cards.length, 0, 'old cards go to the LOG');
  assert.equal(T.trayView(tr).log.length, 4);
  assert.equal(tr.rings, 3, 'three warnings rang');
});

test('K-9: every record kind that makes a warning card offers a one-click jump to a real control', () => {
  const ids = contractIds();
  const recs = [news(1, 'heat', 2), {tick: 5, kind: 'contingency', cause: 'link', id: 'tie', lostMW: 500},
    {tick: 6, kind: 'contingency', cause: 'load', id: 'smelter', lostMW: -256}, {tick: 7, kind: 'shed', district: 'RED2', why: 'directed', mw: 180},
    {tick: 8, kind: 'log', code: 'HYDRO_WATER', msg: 'GORGE: 30% of the day\'s water left.'},
    {tick: 9, kind: 'log', code: 'SECURITY', msg: 'SECURITY SHORT: spare in 5 min 400 MW, biggest risk coal1 650 MW, trip preview 49.40 Hz.'}];
  for (const r of recs) {
    const c = T.cardOf(r);
    assert.ok(c, r.kind);
    assert.ok(ids.has(c.button.target), r.kind + ' -> ' + c.button.target);
  }
  assert.equal(T.cardOf({tick: 1, kind: 'log', code: 'SECURITY', msg: 'SECURITY TIGHT: ...'}), null, 'TIGHT is the gauge\'s, not a card');
});

// ------------------------------------------------------------------ MSL notices (P-4; desk/README.md C-9, §21.4)

test('MSL cards: MARKET NOTICE, the forecast minimum and its time and the one thing this desk can do; <= 25 words; a focus-only button; never "below X"', () => {
  const ids = contractIds();
  const nowS = (9 - V.DAY_START_H) * V.S_PER_H, noonS = (12 + 40 / 60 - V.DAY_START_H) * V.S_PER_H;
  const rec = (level, atS, minMW = 1540.4) => ({tick: nowS * TPS, kind: 'log', sev: ['good', 'info', 'warn', 'crit'][level], code: level ? 'MSL' + level : 'MSL_CLEAR',
    msg: 'MSL' + Math.max(1, level) + ' notice: lowest forecast demand 1,540 MW at 12:40. MSL1 is 1,600 MW.', level, minMW, atS});
  const c1 = T.cardOf(rec(1, noonS)), c2 = T.cardOf(rec(2, noonS, 1262)), c3 = T.cardOf(rec(3, noonS, 980)), c0 = T.cardOf(rec(0, noonS, 1712));
  // (made from the record alone: nothing that depends on the desk at that moment, such as whether a
  // gas unit is running or the battery is already charging on the spill; the objective says that)
  assert.equal(c1.text, 'Lowest demand 1,540 MW at 12:40. Power spilled then can go into the battery: charge it on the spill.');
  assert.equal(c2.text, 'Lowest demand 1,262 MW at 12:40. Make room: charge the battery, and stop a gas unit if one is running.');
  assert.equal(c3.text, 'Lowest demand 980 MW at 12:40. Units at minimum make more than the city uses: stop one, or frequency climbs until rooftop solar cuts back.');
  assert.equal(c0.text, 'Low-demand notice cancelled: the lowest demand forecast is now 1,712 MW, at 12:40.');
  // MSL1 is information; MSL2 and MSL3 ring
  assert.deepEqual([c1.sev, c2.sev, c3.sev, c0.sev], ['info', 'warn', 'warn', 'info']);
  assert.deepEqual([c1.button.target, c2.button.target, c3.button.target, c0.button.target], ['dial-battery', 'stack', 'stack', 'stack']);
  for (const c of [c1, c2, c3, c0]) {
    assert.equal(c.from, T.SENDERS.market);
    assert.equal(c.from, 'MARKET NOTICE');
    assert.ok(c.text.split(/\s+/).length <= T.MAX_WORDS, c.text);
    assert.deepEqual(Object.keys(c.button).sort(), ['label', 'target'], 'a button only focuses a control');
    assert.ok(ids.has(c.button.target), c.button.target);
    assert.doesNotMatch(c.text, /below|soak|backstop|MSL\d/i, 'no threshold, no jargon, nothing this desk does not have: ' + c.text);
  }
  // the minimum is the present second (a potline trip, or demand rising as the level clears): a measured value, said as one
  const now = T.cardOf(rec(1, nowS));
  assert.equal(now.text, 'Demand is at its lowest now, 1,540 MW. Charge the battery if it has room.');
  // cancelled with the minimum at the present second: the forecast does not go lower (never "at its
  // lowest now" at a higher figure than an earlier card's)
  assert.equal(T.cardOf(rec(0, nowS, 1712)).text, 'Low-demand notice cancelled: demand is 1,712 MW now, and the forecast does not go lower.');
  // a minimum that is not at midday (the small hours of a mild night) does not say noon
  assert.equal(T.cardOf(rec(1, (27.5 - V.DAY_START_H) * V.S_PER_H)).text, 'Lowest demand 1,540 MW at 03:30. Power spilled then can go into the battery: charge it on the spill.');
  for (const c of [T.cardOf(rec(1, nowS)), T.cardOf(rec(0, nowS, 1712))]) assert.ok(c.text.split(/\s+/).length <= T.MAX_WORDS, c.text);
  // in the tray: one card per change of level, the warnings ring twice, and the keys differ
  const tr = T.createTray();
  assert.deepEqual(T.trayRecords(tr, [rec(1, noonS)]), ['tick'], 'MSL1 is information: a tick, no ring');
  assert.deepEqual(T.trayRecords(tr, [Object.assign(rec(2, noonS, 1262), {tick: (nowS + 300) * TPS})]), ['ring2']);
  assert.equal(T.trayView(tr).cards.length, 2);
});

test('MSL cards from a real belly: every MSL record the sim logs on a mild weekend makes a card with the minimum it names', () => {
  // DESK_WEEKEND seed 8: MSL1 at 12:25 (the minimum is then the present: 1,471 MW), cancelled at 13:20
  const st = createState(8, DESK_WEEKEND), recs = [];
  const until = (13.5 - V.DAY_START_H) * V.S_PER_H * TPS;
  while (st.tick < until) for (const r of step(st)) if (r.kind === 'log' && /^MSL/.test(r.code)) recs.push(r);
  assert.deepEqual(recs.map(r => r.code), ['MSL1', 'MSL_CLEAR'], 'a mild weekend raises an MSL1 notice by 13:30 and cancels it');
  assert.match(T.cardOf(recs[0]).text, /^(Lowest demand [\d,]+ MW at 1\d:\d\d\. Power spilled then can go into the battery: charge it on the spill\.|Demand is at its lowest now, [\d,]+ MW\. Charge the battery if it has room\.)$/);
  assert.match(T.cardOf(recs[1]).text, /^Low-demand notice cancelled: (demand is [\d,]+ MW now, and the forecast does not go lower|the lowest demand forecast is now [\d,]+ MW, at \d\d:\d\d)\.$/);
  for (const r of recs) {
    const c = T.cardOf(r);
    assert.ok(c, r.code);
    assert.equal(c.from, 'MARKET NOTICE');
    assert.ok(c.text.includes(Math.round(r.minMW).toLocaleString('en-US') + ' MW'), c.text + ' <- ' + r.msg);
    assert.ok(c.text.split(/\s+/).length <= T.MAX_WORDS, c.text);
  }
});

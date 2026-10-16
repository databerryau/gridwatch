// Stage B owner "integration", the grid's accepts through step() (moved from tests/integration.test.js: W6,
// the test budget): K-15 (every input refused in a watch, the lock lifting at watchEndTick), F-4 (no
// scheduled output faster than its ramp after a trip), H-1 (a coal machine stopped at 04:10, with nobody and
// with the competent proxy responding), K-2 / L-8 (AGC holds the band on event-free days), K-10 (a preview
// at a second boundary matches the real nadir) and S-1 (unserved energy is the integral of shed MW).
// Each runs one or two seeds for a few sim-hours; no whole days.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe, hashState, INPUT_TYPES} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {previewTrip} from '../sim/physics.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {ticksAt, calmScenario, withoutContingencies, injectTrip} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const EMPTY_INPUTS = [];
const TRIP_S = V.PLAYER_START_S + 60; // 04:31: an injected trip early in the day (budget)

test('K-15 through step(): inputs of every type during a watch are refused, never logged and change nothing; the lock lifts at watchEndTick', () => {
  const mk = () => injectTrip(withoutContingencies(createState(2, CLASSIC)), TRIP_S);
  const a = mk(), b = mk();
  while (a.tick <= TRIP_S * TPS) { step(a); step(b); }
  assert.equal(a.contIdx, 0, 'the injected trip opened a contingency');
  const endTick = a.conts[0].watchEndTick;
  assert.equal(endTick, TRIP_S * TPS + V.WATCH_S * TPS);
  const tries = [{type: 'basePoint', station: 'coal', mw: 1000}, {type: 'start', unit: 'gta1'}, {type: 'stop', unit: 'coal2'},
    {type: 'abortStop', unit: 'coal2'}, {type: 'syncClose', unit: 'gtc1'}, {type: 'battery', mode: 'discharge', mw: 300},
    {type: 'guard', mw: 300}, {type: 'tie', mw: 800}, {type: 'curtail', kind: 'solar', limitPct: 50}, {type: 'callDR'},
    {type: 'armRERT'}, {type: 'standDownRERT'}, {type: 'mode', agc: false}, {type: 'restore', district: 'SOL3'}, {type: 'directShed'},
    {type: 'planKey', station: 'gta', atS: TRIP_S + 900, mw: 400}, {type: 'planDel', station: 'coal', atS: TRIP_S + 600},
    {type: 'planStart', unit: 'gtb1', atS: TRIP_S + 600}, {type: 'planStop', unit: 'ccgt1', atS: TRIP_S + 7200},
    {type: 'planUnbook', unit: 'gtb1'}, {type: 'planRejoin', station: 'coal', keep: true},
    {type: 'planLoad', fromS: TRIP_S + 60, stations: {coal: [[TRIP_S + 600, 1800]]}, tie: [], starts: [], stops: []},
    {type: 'scope', unit: 'gtc1'}, {type: 'syncTrim', unit: 'gtc1', dHz: V.SYNC_TRIM_HZ}, {type: 'syncAuto', unit: 'gtc1'},
    {type: 'flex', suburb: 'HAZ', lever: 'soak', atS: 23400}, {type: 'flexDel', suburb: 'HAZ', lever: 'soak', atS: 23400}];
  assert.deepEqual(tries.map(x => x.type).sort(), [...INPUT_TYPES].sort(), 'every input type is tried');
  let refused = 0;
  while (a.tick < endTick) {
    const ev = step(a, a.tick % 97 === 0 ? tries : EMPTY_INPUTS);
    step(b);
    for (const e of ev) if (e.kind === 'input') { assert.match(e.reason, /watch/); refused++; }
  }
  assert.ok(refused >= tries.length * 10, 'refused ' + refused);
  assert.equal(a.log.length, 0);
  assert.equal(hashState(a), hashState(b), 'refused inputs changed nothing');
  assert.equal(applyInput(a, {type: 'guard', mw: 300}).ok, true, 'the desk unlocks at watchEndTick');
});

test('F-4: after a trip, no unit\'s scheduled output rises faster than its ramp per grid second', () => {
  const s = injectTrip(createState(3, CLASSIC), TRIP_S);
  const prev = s.units.map(u => u.schedMW);
  let tripped = false;
  while (!s.over && s.tick < (TRIP_S + 600) * TPS) {
    if (step(s).some(e => e.kind === 'contingency')) tripped = true;
    if (s.tick % TPS !== 1) continue;
    s.units.forEach((u, i) => {
      if (u.mode === 'on') assert.ok(u.schedMW - prev[i] <= V.MACHINES[i].rampMWs + 1e-6, u.id + ' jumped ' + (u.schedMW - prev[i]));
      prev[i] = u.schedMW;
    });
  }
  assert.ok(tripped, 'the injected trip happened');
});

test('H-1 (a, c): STOP one coal machine at 04:10 with nobody responding: small steps, first UFLS >= 60 min later', () => {
  const s = createState(3, CLASSIC);
  const stopAt = ticksAt(4, 10);
  let prev = s.units[0].outMW, maxStep = 0, uflsAt = -1;
  while (!s.over && s.tick < ticksAt(7)) {
    const ev = step(s, s.tick === stopAt ? [{type: 'stop', unit: 'coal1'}] : undefined);
    maxStep = Math.max(maxStep, prev - s.units[0].outMW);
    prev = s.units[0].outMW;
    if (uflsAt < 0 && ev.some(e => e.kind === 'ufls')) uflsAt = s.tick;
  }
  const m = V.MACHINES[0];
  if (!s.black) assert.equal(s.units[0].mode, 'off', 'the stop completed (unload + T4) by 07:00');
  assert.ok(maxStep <= m.breakerOpenMW + m.rampMWs * V.PHYS_DT + 1, 'max step ' + maxStep);
  assert.ok(uflsAt < 0 || uflsAt - stopAt >= 60 * 60 * TPS, 'first UFLS ' + (uflsAt - stopAt) / TPS + ' s after the STOP');
});

test('H-1 (b): STOP one coal machine at 04:10 with the competent proxy responding: no UFLS and no blackout through 08:00', () => {
  const s = createState(3, CLASSIC);
  while (!s.over && s.tick < ticksAt(4, 10)) step(s);
  step(s, [{type: 'stop', unit: 'coal1'}]);
  let ufls = false;
  const r = runPar(3, CLASSIC, {proxy: 'competent', state: s, untilTick: ticksAt(8), onStep: st => {
    if (st.ufls.operated.some(Boolean)) ufls = true;
  }});
  assert.equal(ufls, false, 'UFLS operated');
  assert.equal(r.black, false);
});

test('K-2 / L-8: AGC on, the L-0 plan, no other input: >= 97% of ticks in 49.85-50.15 Hz on event-free days', () => {
  // Event-free: no optional events and no contingencies, so the series have no event-driven
  // shifts; the plan (planOnly) moves the base points and AGC trims around them.
  const scn = calmScenario();
  for (const seed of [1, 2]) {
    let inBand = 0, n = 0;
    runPar(seed, scn, {proxy: 'planOnly', state: withoutContingencies(createState(seed, scn)),
      untilTick: ticksAt(7), onStep: st => {
        if (st.tick <= V.PLAYER_START_TICK) return;
        n++;
        if (st.phys.fHz >= V.NORMAL_LO_HZ && st.phys.fHz <= V.NORMAL_HI_HZ) inBand++;
      }});
    assert.ok(n > 0 && inBand / n >= 0.97, 'seed ' + seed + ': ' + (100 * inBand / n).toFixed(1) + '% in band');
  }
});

test('K-10 through step(): a preview taken at a second boundary matches the real nadir within 0.02 Hz (AGC and ramps running)', () => {
  for (const seed of [4, 5]) {
    const s = withoutContingencies(createState(seed, CLASSIC));
    while (!s.over && s.tick < TRIP_S * TPS) step(s);
    // The injected 'largest' trip hits the largest online machine by output (lowest index on a tie).
    let big = null;
    for (const u of s.units) if (u.sync && (big === null || u.outMW > big.outMW)) big = u;
    const p = previewTrip(s, {kind: 'unit', id: big.id});
    injectTrip(s, TRIP_S);
    let minHz = Infinity;
    while (!s.over && s.tick < (TRIP_S + V.PREVIEW_HORIZON_S) * TPS) { step(s); minHz = Math.min(minHz, s.phys.fHz); }
    assert.equal(s.conts[s.contIdx].id, big.id);
    assert.ok(Math.abs(minHz - p.nadirHz) <= 0.02, 'seed ' + seed + ': real ' + minHz.toFixed(4) + ' preview ' + p.nadirHz.toFixed(4));
  }
  // A-2 (Phase 1a): the other credible contingency, the tie import, previews its real nadir too
  // (N-1 over both; the sim's sec.previewLinkHz is this preview).
  for (const seed of [4, 5]) {
    const s = withoutContingencies(createState(seed, CLASSIC));
    s.tie.setMW = 700; // test poke: a large import, reached at the tie ramp before the trip
    while (!s.over && s.tick < TRIP_S * TPS) step(s);
    assert.ok(s.tie.flowMW > 300, 'importing ' + s.tie.flowMW);
    const p = previewTrip(s, {kind: 'link', id: 'tie'});
    injectTrip(s, TRIP_S, 'link');
    let minHz = Infinity;
    while (!s.over && s.tick < (TRIP_S + V.PREVIEW_HORIZON_S) * TPS) { step(s); minHz = Math.min(minHz, s.phys.fHz); }
    assert.equal(s.conts[s.contIdx].cause, 'link');
    assert.ok(Math.abs(minHz - p.nadirHz) <= 0.02, 'seed ' + seed + ' link: real ' + minHz.toFixed(4) + ' preview ' + p.nadirHz.toFixed(4));
  }
});

test('S-1: observe().score.unservedMWh equals the integral of shed MW over settled seconds', () => {
  const s = createState(2, CLASSIC);
  const inputs = new Map([[ticksAt(4, 30), [{type: 'directShed'}]], [ticksAt(4, 31), [{type: 'directShed'}]],
    [ticksAt(4, 50), [{type: 'restore', district: 'SOL3'}]]]);
  const end = ticksAt(5, 30);
  let integral = 0;
  for (;;) {
    const x = inputs.get(s.tick);
    if (x && x[0].type === 'directShed') s.sec.level = 'SHORT'; // A-3: the key needs a shortfall (test poke of the gauge)
    step(s, x);
    if (s.over) { integral += s.phys.shedMW * V.PHYS_DT / 3600; break; } // finish() settled this tick too
    if (s.tick % TPS === 1 && s.tick > end) break; // the tick just run is in acc, not yet settled
    integral += s.phys.shedMW * V.PHYS_DT / 3600;
  }
  assert.ok(integral > 0, 'the test must shed something');
  assert.ok(Math.abs(observe(s).score.unservedMWh - integral) < 1e-6, observe(s).score.unservedMWh + ' vs ' + integral);
});

// Phase 1a (sim agent): the plan in state and its executor (desk/README.md §3.1-3.2; SPEC L-0,
// L-4, L-6, K-2 HAND/MAN, F-6). Headless: the sim alone, no autopilot unless named.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState, step, applyInput, observe, hashState} from '../sim/step.js';
import {V} from '../sim/params.js';
import {CLASSIC} from '../content/scenarios.js';
import {withoutContingencies, clone} from './lib/sim-helpers.js';

const TPS = V.TICKS_PER_S;
const J = id => V.STATION_IDS.indexOf(id);
const rampOf = id => V.STATIONS[id].rampMWMin / V.S_PER_MIN; // per machine, MW/s
const sec = s => Math.floor(s.tick / TPS);

/** A fresh day (no pre-rolled trips: nothing opens a watch) stepped to grid second atS + 1 tick (after that second's update). */
function at(atS, seed = 1, hand = false) {
  const s = withoutContingencies(createState(seed, CLASSIC));
  if (hand) assert.equal(applyInput(s, {type: 'mode', agc: false}).ok, true);
  while (s.tick < atS * TPS + 1) step(s);
  return s;
}
function run(s, toS) { while (!s.over && s.tick < toS * TPS + 1) step(s); return s; }
function ok(s, x) { const out = []; const r = applyInput(s, x, out); assert.equal(r.ok, true, x.type + ': ' + r.reason); return s.log[s.log.length - 1].args; }
const lever = (s, id) => s.stations[J(id)].basePointMW;
const keysOf = (s, id) => s.plan.stations[J(id)].keys.map(k => [k.atS, k.mw]);

test('L-6 / K-2: in AGC a lever move writes exactly one keyframe, at the earliest ramp-feasible time; later keys stay', () => {
  const s = at(3600), S = sec(s), L0 = lever(s, 'coal');
  ok(s, {type: 'planKey', station: 'coal', atS: S + 7200, mw: L0 - 100});
  const later = keysOf(s, 'coal');
  assert.equal(later.length, 1);
  const a = ok(s, {type: 'basePoint', station: 'coal', mw: L0 + 150});
  assert.equal(a.mw, L0 + 150, 'the logged lever is the applied one');
  const ramp = 4 * rampOf('coal');
  const arrival = S + Math.ceil(150 / ramp - 1e-6);
  assert.deepEqual(keysOf(s, 'coal'), [[arrival, L0 + 150], later[0]], 'one new key; the later key stays');
  assert.equal(s.plan.stations[J('coal')].doneS, arrival, 'the lever move is the key being executed');
  // A second move before arrival replaces the move in flight (no stale drag keys), later keys still stay.
  const a2 = ok(s, {type: 'basePoint', station: 'coal', mw: L0 + 50});
  assert.deepEqual(keysOf(s, 'coal'), [[S + Math.ceil(100 / ramp - 1e-6), a2.mw], later[0]]);
  // The executor then leaves the lever alone until the later key's lead time.
  run(s, S + 3600);
  assert.equal(lever(s, 'coal'), L0 + 50);
});

test('L-0 / §3.1: arrive-by: the executor applies a key at the last second the station ramp still reaches it, once', () => {
  const s = at(3600), S = sec(s), L0 = lever(s, 'coal'), ramp = 4 * rampOf('coal');
  ok(s, {type: 'planKey', station: 'coal', atS: S + 1200, mw: L0 + 120});
  assert.deepEqual(keysOf(s, 'coal'), [[S + 1200, L0 + 120]], 'feasible as asked: not rewritten');
  const lead = 120 / ramp; // 600 s
  let movedAt = -1;
  while (s.tick < (S + 1300) * TPS) {
    step(s);
    if (movedAt < 0 && lever(s, 'coal') !== L0) movedAt = sec(s);
  }
  assert.equal(movedAt, S + 1200 - lead, 'applied when s + lead >= atS');
  assert.equal(lever(s, 'coal'), L0 + 120);
  const coal = s.units.filter(u => u.station === 'coal');
  assert.ok(Math.abs(coal.reduce((x, u) => x + u.schedMW - u.agcTrimMW, 0) - (L0 + 120)) < 1, 'output (less AGC) arrived by atS');
  assert.equal(s.plan.stations[J('coal')].doneS, S + 1200);
});

test('L-6 / K-2: HAND: a grabbed lever leaves the plan (MAN) and deletes no key; P rejoins (RESUME or KEEP)', () => {
  const s = at(3600, 1, true), S = sec(s), L0 = lever(s, 'coal');
  ok(s, {type: 'planKey', station: 'coal', atS: S + 1800, mw: L0 + 100});
  const keys = keysOf(s, 'coal');
  ok(s, {type: 'basePoint', station: 'coal', mw: L0 - 100});
  assert.equal(s.plan.stations[J('coal')].man, true, 'MAN lamp');
  assert.deepEqual(keysOf(s, 'coal'), keys, 'a manual input never deletes a keyframe (L-6)');
  run(s, S + 2000);
  assert.equal(lever(s, 'coal'), L0 - 100, 'the plan is suspended for this station');
  assert.equal(observe(s).plan.stations[J('coal')].man, true);
  // RESUME: the lever goes to the plan's value now (the latest past key).
  ok(s, {type: 'planRejoin', station: 'coal', keep: false});
  run(s, S + 2002);
  assert.equal(lever(s, 'coal'), L0 + 100);
  // KEEP: re-anchor at the present lever.
  ok(s, {type: 'basePoint', station: 'coal', mw: L0 + 30});
  ok(s, {type: 'planKey', station: 'coal', atS: S + 4000, mw: L0 + 200});
  ok(s, {type: 'planRejoin', station: 'coal', keep: true});
  const p = s.plan.stations[J('coal')];
  assert.equal(p.man, false);
  assert.ok(p.keys.some(k => k.atS === sec(s) && k.mw === L0 + 30), 'KEEP writes the present lever as a key now');
  assert.equal(p.doneS, sec(s));
  // AGC days have no MAN: rejoin is refused there.
  const g = at(3600);
  assert.match(applyInput(g, {type: 'planRejoin', station: 'coal', keep: false}).reason, /HAND/);
});

test('L-4: planKey rewrites to the earliest ramp-feasible time; every planned segment satisfies |dMW|/dt <= ramp', () => {
  const s = at(3600), S = sec(s), ramp = 4 * rampOf('coal');
  let x = 7;
  const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  let t = S;
  for (let k = 0; k < 12; k++) {
    t += 60 + Math.floor(r() * 900);
    const a = ok(s, {type: 'planKey', station: 'coal', atS: t, mw: 1000 + Math.floor(r() * 1600)});
    assert.ok(a.atS >= t, 'never earlier than asked');
    t = a.atS;
  }
  const pts = [[S, lever(s, 'coal')], ...keysOf(s, 'coal')];
  for (let k = 1; k < pts.length; k++) {
    assert.ok(Math.abs(pts[k][1] - pts[k - 1][1]) <= ramp * (pts[k][0] - pts[k - 1][0]) + 1e-6, 'segment ' + k + ' faster than the ramp');
    assert.ok(pts[k][1] >= 4 * V.STATIONS.coal.minMW && pts[k][1] <= 4 * V.STATIONS.coal.ratingMW, 'mw inside [Σmin, Σrating]');
  }
});

test('L-4 / L-6: an offline station\'s key books a START so it can arrive; no layer begins before its earliest start', () => {
  const s = at(3600), S = sec(s);
  const m = V.MACHINES.find(q => q.id === 'gtb1'), toMin = m.t1S + V.AUTO_SYNC_S + m.t2S;
  const climb = Math.ceil((300 - m.minMW) / m.rampMWs - 1e-6);
  const a = ok(s, {type: 'planKey', station: 'gtb', atS: S + 60, mw: 300});
  assert.equal(a.atS, S + toMin + climb, 'the earliest arrival: start now, MIN after the start time, then the climb');
  assert.deepEqual(s.plan.starts, [{unit: 'gtb1', atS: S}], 'START booked now (not in the past)');
  // Asked late enough, the start is booked so the unit arrives exactly by then.
  const b = ok(s, {type: 'planKey', station: 'gtc', atS: S + 3600, mw: 250});
  const c = V.MACHINES.find(q => q.id === 'gtc1');
  const bk = s.plan.starts.find(x => x.unit === 'gtc1');
  assert.equal(b.atS, S + 3600);
  assert.equal(bk.atS, S + 3600 - (c.t1S + V.AUTO_SYNC_S + c.t2S) - Math.ceil((250 - c.minMW) / c.rampMWs - 1e-6));
  run(s, a.atS + 5);
  assert.equal(s.units.find(u => u.id === 'gtb1').mode, 'on');
  assert.equal(lever(s, 'gtb'), 300, 'the clamped key was applied again when the machine joined');
});

test('L-4: a layer dragged to 0 unloads to MIN, then books a STOP of every machine at the key; planDel removes both', () => {
  const s = at(3600), S = sec(s), L = lever(s, 'ccgt');
  const a = ok(s, {type: 'planKey', station: 'ccgt', atS: S + 600, mw: 0});
  const need = S + Math.ceil((L - 2 * V.STATIONS.ccgt.minMW) / (2 * rampOf('ccgt')) - 1e-6);
  assert.equal(a.atS, Math.max(S + 600, need));
  assert.equal(a.mw, 0);
  assert.deepEqual(s.plan.stops.map(b => [b.unit, b.atS]), [['ccgt1', a.atS], ['ccgt2', a.atS]]);
  ok(s, {type: 'planDel', station: 'ccgt', atS: a.atS});
  assert.deepEqual(keysOf(s, 'ccgt'), []);
  assert.deepEqual(s.plan.stops, []);
  assert.match(applyInput(s, {type: 'planDel', station: 'ccgt', atS: a.atS}).reason, /no keyframe/);
  // Executed: the station unloads to MIN by the key and the stops go through the STOP path (H-1).
  const b = ok(s, {type: 'planKey', station: 'ccgt', atS: S + 600, mw: 0});
  run(s, b.atS + 2);
  assert.ok(s.units.filter(u => u.station === 'ccgt').every(u => u.mode === 'unloading' || u.mode === 'shutdown'));
});

test('§3.2 bookings: planStart / planStop / planUnbook; a booking refused when due is dropped with a PLAN log', () => {
  const s = at(3600), S = sec(s);
  ok(s, {type: 'planStart', unit: 'gta1', atS: S + 120});
  ok(s, {type: 'planStop', unit: 'gta1', atS: S + 180}); // booked to start before: accepted
  assert.match(applyInput(s, {type: 'planStart', unit: 'coal1', atS: S + 60}).reason, /unit is on/);
  assert.match(applyInput(s, {type: 'planStop', unit: 'gtc2', atS: S + 60}).reason, /unit is off/);
  assert.match(applyInput(s, {type: 'planStart', unit: 'gtb2', atS: S - 5}).reason, /passed/);
  ok(s, {type: 'planStart', unit: 'gtb2', atS: S + 300});
  ok(s, {type: 'planUnbook', unit: 'gtb2'});
  assert.match(applyInput(s, {type: 'planUnbook', unit: 'gtb2'}).reason, /nothing is booked/);
  ok(s, {type: 'planStart', unit: 'gtc1', atS: S + 100});
  ok(s, {type: 'start', unit: 'gtc1'}); // started by hand first: the booking will be refused
  const recs = [];
  while (s.tick < (S + 200) * TPS) for (const r of step(s)) recs.push(r);
  assert.equal(s.units.find(u => u.id === 'gta1').mode, 'off', 'started at 120, cancelled by the booked stop at 180');
  assert.ok(recs.some(r => r.kind === 'log' && r.code === 'UNIT_START' && /GT·A/.test(r.msg)));
  assert.ok(recs.some(r => r.kind === 'log' && r.code === 'PLAN' && /gtc1|GT·C 1/.test(r.msg)), 'the refused booking is logged');
  assert.deepEqual(s.plan.starts, []);
});

test('§3.2 planLoad replaces every entry from fromS (earlier ones stay), clears MAN, sets madeAtS; keys older than 30 min are dropped', () => {
  const s = at(3600, 2, true), S = sec(s);
  const k1 = ok(s, {type: 'planKey', station: 'coal', atS: S + 100, mw: 2100}).atS; // rewritten to the ramp (S + 500)
  ok(s, {type: 'planKey', station: 'coal', atS: S + 900, mw: 2200});
  ok(s, {type: 'planStart', unit: 'gta1', atS: S + 1200});
  ok(s, {type: 'basePoint', station: 'hydro', mw: 300}); // HAND: hydro MAN
  const rev = s.plan.rev;
  ok(s, {type: 'planLoad', fromS: S + 600, stations: {coal: [[S + 1500, 1900]], gtb: [[S + 3000, 300]]}, tie: [[S + 700, 400]],
    starts: [['gtb1', S + 2000]], stops: []});
  assert.ok(k1 < S + 600);
  assert.deepEqual(keysOf(s, 'coal'), [[k1, 2100], [S + 1500, 1900]]);
  assert.deepEqual(s.plan.starts, [{unit: 'gtb1', atS: S + 2000}], 'the gta1 booking at/after fromS was replaced');
  assert.equal(s.plan.stations[J('hydro')].man, false);
  assert.equal(s.plan.madeAtS, S);
  assert.ok(s.plan.rev > rev);
  assert.match(applyInput(s, {type: 'planLoad', fromS: S - 1, stations: {}, tie: [], starts: [], stops: []}).reason, /past/);
  run(s, k1 + V.PLAN_HISTORY_S + 2);
  assert.ok(keysOf(s, 'coal').every(k => k[0] >= sec(s) - V.PLAN_HISTORY_S), 'history pruned');
  assert.equal(s.tie.setMW, 400, 'the tie key was applied');
});

test('F-2 / F-7: a JSON round trip mid-plan resumes bit-identically; F-6: a log with every plan input replays to the same hash', () => {
  const s = at(3600, 3), S = sec(s);
  ok(s, {type: 'planKey', station: 'coal', atS: S + 900, mw: 1800});
  ok(s, {type: 'planKey', station: 'gtb', atS: S + 1500, mw: 700});
  ok(s, {type: 'planKey', station: 'ccgt', atS: S + 5400, mw: 0});
  ok(s, {type: 'planDel', station: 'ccgt', atS: s.plan.stations[J('ccgt')].keys[0].atS});
  ok(s, {type: 'planStart', unit: 'gta1', atS: S + 400});
  ok(s, {type: 'planStop', unit: 'gta1', atS: S + 5000});
  ok(s, {type: 'planStart', unit: 'gtc2', atS: S + 800});
  ok(s, {type: 'planUnbook', unit: 'gtc2'});
  ok(s, {type: 'tie', mw: 500});
  ok(s, {type: 'basePoint', station: 'hydro', mw: 350});
  ok(s, {type: 'planLoad', fromS: S + 3000, stations: {hydro: [[S + 3300, 200]]}, tie: [[S + 3600, 100]], starts: [], stops: [['gtb1', S + 6000]]});
  run(s, S + 700); // bookings and keys in flight
  const copy = JSON.parse(JSON.stringify(s));
  run(s, S + 7000); run(copy, S + 7000);
  assert.equal(JSON.stringify(copy), JSON.stringify(s));
  const types = new Set(s.log.map(r => r.type));
  for (const t of ['planKey', 'planDel', 'planStart', 'planStop', 'planUnbook', 'planLoad', 'tie', 'basePoint']) assert.ok(types.has(t), t);
  // replay() on the same day (its pre-rolled trips removed, as here): feed the log at its ticks.
  const b = withoutContingencies(createState(3, CLASSIC));
  let j = 0;
  while (b.tick < s.tick) {
    const batch = [];
    while (j < s.log.length && s.log[j].tick === b.tick) { batch.push(Object.assign({type: s.log[j].type}, s.log[j].args)); j++; }
    step(b, batch);
  }
  assert.equal(hashState(b), hashState(s), 'the logged (rewritten) args replay to the same state');
  assert.deepEqual(b.log, s.log);
});

test('observe().plan is a copy by explicit keys (no private executor fields)', () => {
  const s = at(3600);
  ok(s, {type: 'planKey', station: 'coal', atS: sec(s) + 900, mw: 1800});
  const o = observe(s);
  assert.deepEqual(Object.keys(o.plan.stations[0]), ['id', 'man', 'doneS', 'clampedMW', 'keys']);
  o.plan.stations[0].keys[0].mw = -1;
  assert.notEqual(s.plan.stations[0].keys[0].mw, -1);
  assert.deepEqual(clone(o.plan), o.plan);
});

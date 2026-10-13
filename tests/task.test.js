// The Act I restore task's accounting (desk/README.md §32.6.2, Q-69): a task feeder is the network's
// outage until its clearS and the operator's from it. Records put on a neutral desk day
// (tests/lib/inject.js on legacyDesk), the plan loaded at 04:30 as the system operator would.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {step, applyInput, observe, hashState} from '../sim/step.js';
import {previewTrip} from '../sim/physics.js';
import {restorePermissive} from '../sim/grid.js';
import {isClean, isPerfect} from '../sim/market.js';
import {baseLoadMW} from '../sim/fleet.js';
import {preDispatch} from '../sim/autopilot.js';
import {V} from '../sim/params.js';
import {stateWith} from './lib/inject.js';
import {legacyDesk, clone, commit, TPS} from './lib/sim-helpers.js';

const SEED = 20261007, A = 'TAL3', B = 'TAL4', CA = 9900, CB = 11100; // hand-backs 06:45 and 07:05
const PACE = V.RESTORE_PACE_MAX_S, GAP = V.RESTORE_INTERVAL_S;

/** The day at 04:30 with the plan loaded: TAL3 and TAL4 dark from 04:00, handed back at ca and cb. */
function day(ca, cb) {
  const s = stateWith(SEED, legacyDesk(), [{atS: 0, type: 'feederOut', args: {districts: [A, B], clearS: [ca, cb]}},
    {atS: ca, type: 'feederClear', args: {district: A}}, {atS: cb, type: 'feederClear', args: {district: B}}]);
  run(s, V.PLAYER_START_S);
  assert.ok(applyInput(s, preDispatch(observe(s, {dayAhead: true})).load).ok);
  return s;
}
/** Step to tick S x TPS + k; each(s, t) after grid second t's update. Never SHEDDING, never UFLS or directed MWh. */
function run(s, S, each, k = 0) {
  while (s.tick < S * TPS + k) {
    step(s);
    if (s.tick % TPS !== 1) continue;
    assert.notEqual(s.sec.level, 'SHEDDING');
    assert.ok(isClean(s.score, s.black));
    if (each) each(s, (s.tick - 1) / TPS);
  }
  return s;
}
const idx = (s, id) => s.city.districts.findIndex(d => d.id === id);
const share = (s, id) => s.city.districts[idx(s, id)].share;
const restore = (s, id) => applyInput(s, {type: 'restore', district: id});
let base = null; // the day at 06:44 (both feeders held), shared by the tests below
const at0644 = () => clone(base || (base = run(day(CA, CB), CA - 60)));

test('Q-69: a held task feeder is the network\'s outage: the gate, no unserved MWh, heldMWh, never SHEDDING, no DIRECT SHED', () => {
  const s = at0644(), o = observe(s);
  assert.equal(o.districts[idx(s, A)].restoreBlock, 'feeder under repair until 06:45');
  assert.equal(o.districts[idx(s, B)].restoreBlock, 'feeder under repair until 07:05');
  assert.deepEqual(restore(s, A), {ok: false, reason: 'feeder under repair until 06:45'});
  assert.ok(Math.abs(s.city.heldFrac - share(s, A) - share(s, B)) < 1e-12);
  const sc = s.score;
  assert.equal(sc.unservedMWh, 0);
  assert.equal(sc.taskMWh, 0);
  assert.equal(sc.saidiMin + sc.saifi + sc.maifi, 0);
  assert.ok(sc.heldMWh > 0);
  assert.ok(isPerfect(sc, s.black));
  assert.notEqual(o.sec.level, 'SHEDDING');
  assert.equal(o.demand.unservedMW, 0, 'the SHED mark on the dial: held is not unserved');
  const r = applyInput(s, {type: 'directShed'});
  assert.equal(r.ok, false);
  assert.match(r.reason, /^DIRECT SHED is for a shortfall/);
  // heldMWh is the held feeders' underlying load, second by second
  const t = clone(s), held = share(s, A) + share(s, B);
  let h0 = null, want = 0; // h0: heldMWh settled before the first sampled second
  run(t, CA - 1, x => { if (h0 === null) h0 = x.score.heldMWh; want += baseLoadMW(x) * held / V.S_PER_H; });
  step(t); // settles CA - 2, the last sampled second (still held)
  assert.ok(Math.abs(t.score.heldMWh - h0 - want) < 1e-9 * want);
  assert.equal(t.score.unservedMWh, 0);
});

test('Q-69: the hand-back drops heldFrac by its share; the next settled second books task MWh; task MWh, late MWh and SAIDI from clearS', () => {
  const s = at0644(), held = s.city.heldFrac, a = share(s, A), G = []; // G[k]: A's energy in second CA + k
  run(s, CA + 600, (x, t) => {
    if (t < CA) return;
    G.push(baseLoadMW(x) * a / V.S_PER_H);
    const sc = x.score;
    if (t === CA) { // FEEDER_CLEAR has run: A is the operator's, nothing booked yet
      assert.ok(Math.abs(x.city.heldFrac - (held - a)) < 1e-12);
      assert.equal(sc.taskMWh, 0);
      const o = observe(x);
      assert.equal(o.districts[idx(x, A)].restoreBlock, '');
      assert.ok(Math.abs(o.demand.unservedMW - baseLoadMW(x) * a) < 1e-9, 'A is unserved from its hand-back');
    }
    if (t === CA + 1) assert.ok(sc.taskMWh > 0 && Math.abs(sc.taskMWh - G[0]) < 0.01 * G[0]); // second CA settled
    if (t === CA + PACE) assert.equal(sc.taskLateMWh, 0, 'inside the pace');
    if (t === CA + PACE + 1) assert.ok(sc.taskLateMWh > 0, 'past the pace');
  });
  step(s); // settles CA + 599
  const sum = g => g.reduce((x, y) => x + y, 0), want = sum(G), late = sum(G.slice(PACE));
  assert.equal(G.length, 600);
  assert.ok(Math.abs(s.score.taskMWh - want) < 0.01 * want, s.score.taskMWh + ' vs ' + want);
  assert.ok(Math.abs(s.score.taskLateMWh - late) < 0.01 * late);
  assert.ok(Math.abs(s.score.unservedMWh - s.score.taskMWh) < 1e-9);
  // SAIDI and SAIFI count A from 06:45, not 04:00 (B is still held)
  assert.ok(Math.abs(s.score.saidiMin - a * 10) < 1e-9);
  assert.ok(Math.abs(s.score.saifi - a) < 1e-12);
  // never restored: clean, not perfect
  assert.ok(isClean(s.score, s.black));
  assert.ok(!isPerfect(s.score, s.black));
});

test('Q-69: feeders closed inside the pace (one mid-second, the last at a second boundary): clean, perfect, no momentary interruption', () => {
  const s = at0644();
  run(s, CA + 20, null, 17); // mid-second, B still held: the second's energy goes to the relit task feeder
  assert.ok(restore(s, A).ok);
  run(s, CB + 30);
  assert.ok(restore(s, B).ok);
  run(s, CB + 60);
  const sc = s.score;
  assert.ok(sc.taskMWh > 0);
  assert.equal(sc.uflsMWh + sc.directedMWh, 0);
  assert.equal(sc.taskLateMWh, 0);
  assert.equal(sc.maifi, 0);
  assert.equal(sc.saifi, 0);
  assert.ok(Math.abs(sc.unservedMWh - sc.taskMWh) < 1e-9);
  assert.ok(isPerfect(sc, s.black));
});

test('Q-69: two feeders on one clearance closed in time give no late MWh (the second may close RESTORE_INTERVAL_S after the first)', () => {
  const C = 3600; // one hand-back at 05:00 (an early one keeps the test short)
  const s = run(day(C, C), C + 10);
  assert.ok(restore(s, A).ok);
  assert.match(restore(s, B).reason, /^wait 5 min after the last restore/);
  run(s, C + 10 + GAP + 20); // B's allowed second is A's restore + RESTORE_INTERVAL_S, past C + PACE
  assert.equal(s.score.taskLateMWh, 0);
  assert.ok(restore(s, B).ok);
  run(s, C + 10 + GAP + 60);
  assert.equal(s.score.taskLateMWh, 0);
  assert.ok(s.score.taskMWh > 0);
  assert.ok(isPerfect(s.score, s.black));
});

test('preview neutrality: previews and the restore preview leave state exactly as found with one feeder held, one handed back, and UFLS inside 10 s', () => {
  const s = run(clone(at0644()), CB - 1, null, TPS - 5); // 5 ticks before B's hand-back; A handed back, dark
  commit(s, {coal1: 650, coal2: 650, hydro1: 300}, {battery: {socMWh: 0, guardMW: 0, mode: 'idle', orderMW: 0, schedMW: 0, outMW: 0}});
  s.last.fMeanHz = V.F0_HZ;
  s.sec.r5MW = 1e4; // past the permissive's reserve check, so the input's preview runs
  assert.ok(s.city.districts[idx(s, B)].dark && s.city.districts[idx(s, B)].clearS > Math.floor(s.tick / TPS));
  const json = JSON.stringify(s), h = hashState(s), heldFrac = s.city.heldFrac;
  assert.ok(heldFrac > 0);
  const same = what => assert.ok(JSON.stringify(s) === json && hashState(s) === h, what + ' moved state');
  const u = previewTrip(s, {kind: 'unit', id: 'coal1'});
  assert.ok(u.uflsStages > 0 && u.nadirS < 10, 'the unit preview operates UFLS within 10 s');
  same('unit');
  previewTrip(s, {kind: 'link', id: 'tie'});
  same('link');
  for (const id of [A, B]) { previewTrip(s, {kind: 'district', id}); same('district ' + id); }
  assert.equal(typeof restorePermissive(s, idx(s, A), {preview: true}), 'string');
  same('restore preview');
  assert.equal(restorePermissive(s, idx(s, B), {preview: true}), 'feeder under repair until 07:05');
  same('held');
});

test('Q-69 / S-6: the closing second is judged with the rest: a feeder closed past its allowed second + RESTORE_PACE_MAX_S books late MWh, at a boundary or mid-second, with the other feeder held or handed back and dark', () => {
  const close = (s0, tick) => { // restore A at tick, settle two seconds more: [late MWh > 0, perfect]
    const s = clone(s0);
    run(s, 0, null, tick);
    assert.ok(restore(s, A).ok);
    run(s, Math.floor(tick / TPS) + 3);
    return [s.score.taskLateMWh > 0, isPerfect(s.score, s.black)];
  };
  const due = (CA + PACE) * TPS; // A's allowed second (its clearS) + the pace: the first late second begins
  for (const [s0, other] of [[run(clone(at0644()), CA + PACE - 2), 'B held'], [run(day(CA, CA + 60), CA + PACE - 2), 'B handed back, dark']]) {
    assert.deepEqual(close(s0, due - TPS + 17), [false, true], other + ': mid-second, before it');
    assert.deepEqual(close(s0, due), [false, true], other + ': at the end of the pace exactly');
    assert.deepEqual(close(s0, due + TPS), [true, false], other + ': at the end of the first late second (dark through it)');
    // mid-second inside the first late second: a fraction of a second late. Booked when nothing else is dark at the
    // second's end; with another feeder dark then, restoredAtS cannot tell it from a close at its start (in time), so
    // it goes with that feeder: a sub-second tolerance, the player's way (sim/README.md §11 market.js)
    assert.deepEqual(close(s0, due + 17), other === 'B held' ? [true, false] : [false, true], other + ': mid-second, inside it');
  }
});

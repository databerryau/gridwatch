// tests/desk.test.js: the Phase 1a desk (desk/README.md §6): K-1, K-3-K-13, K-17 sizes. Built in
// the stand-in DOM (tests/lib/dom.js) from real par days (tests/lib/vm-fixture.js); inputs are
// recorded by a mock `actions`, never applied, so every check is about what the desk SENDS.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {dayVm, baseVm} from './lib/vm-fixture.js';
import {V} from '../sim/params.js';
import {createDesk, DESK_IDS, SLOT_IDS, LAYOUT} from '../desk/desk.js';
import * as C from '../desk/calc.js';
import {clockOf, unitLabel} from '../desk/util.js';
import {needleHz, dialAngle, barLayout} from '../desk/dial.js';
import {caughtText} from '../desk/gauge.js';
import {createState, step, observe} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {CLASSIC} from '../content/scenarios.js';
import * as fleet from '../sim/fleet.js';

const TPS = V.TICKS_PER_S;
const tickOf = h => Math.round((h - V.DAY_START_H) * 3600 * TPS);

// ---------------------------------------------------------------- fixtures (one par day, one trip)

const HOURS = [5, 9.5, 13, 18.5, 23];
const DAY = await (async () => {
  const state = createState(7, CLASSIC);
  const want = new Map(HOURS.map(h => [tickOf(h), h]));
  const out = {};
  runPar(7, CLASSIC, {state, untilTick: tickOf(HOURS[HOURS.length - 1]) + 1, hashEveryS: 86400,
    onStep: st => { const h = want.get(st.tick); if (h !== undefined) out[h] = observe(st); }});
  return {state, obs: out};
})();
const TRIP = await dayVm({untilH: 18.5, trip: true});
const clone = o => structuredClone(o);
const vmAt = (h, over) => baseVm(clone(DAY.obs[h]), over);
const EVE = 18.5;

function mockActions(o = {}) {
  const a = {
    inputs: [], uis: [], redis: 0, pv: [], rp: [],
    input(x) { a.inputs.push(x); return o.refuse ? o.refuse(x) || '' : ''; },
    ui(c) { a.uis.push(c); },
    redispatch() { a.redis++; return o.redisReason || ''; },
    previewTrip(p) {
      a.pv.push(p);
      return {nadirHz: 49.3 + (p.guardMW || 0) / 1000, caught: {inertiaMW: 120, batteryMW: 40, guardMW: p.guardMW || 0, governorsMW: 260, loadReliefMW: 12, uflsMW: 0}};
    },
    restorePreview(d) { a.rp.push(d); return o.restorePreview ? o.restorePreview(d) : ''; },
  };
  return a;
}

function mount(vm, actions = mockActions()) {
  const doc = makeDocument();
  const root = doc.createElement('div');
  root.id = 'desk';
  doc.body.appendChild(root);
  const desk = createDesk(doc, root, actions);
  desk.update(vm);
  const $ = id => doc.getElementById(id);
  return {doc, root, desk, actions, $};
}
const at = (vm, ms) => Object.assign({}, vm, {frame: {nowMs: ms, dtS: 1 / 60, alpha: 0.5}});
/** The same view one grid second later (a sent value is then read back from the vm). */
const later = vm => Object.assign({}, vm, {obs: Object.assign({}, vm.obs, {tick: vm.obs.tick + TPS})});
const deskText = d => d.el.textContent;
const inputsOf = (a, type) => a.inputs.filter(x => x.type === type);

// ---------------------------------------------------------------- pure helpers (calc.js)

test('water lasts until: (storage - HYDRO_STOP_MWH) / gate, and the sim drains storage at the gate', () => {
  assert.equal(C.waterLastsS(V.HYDRO_STOP_MWH + 1000, 500), 7200);
  assert.equal(C.waterLastsS(V.HYDRO_STOP_MWH + 1000, 0), Infinity);
  assert.equal(C.waterLastsS(V.HYDRO_STOP_MWH - 1, 300), 0);
  assert.equal(clockOf(C.waterLastsUntilS(14 * 3600, V.HYDRO_STOP_MWH + 900, 300)), '21:00');   // 18:00 + 3 h
  // K-4 accept, decomposed: the sim's storage falls by exactly ∫ hydro output dt, so at a
  // constant gate G the water reaches HYDRO_STOP_MWH after (S - stop) / G hours: the formula.
  // Checked over 20 grid-minutes of a real evening (drift < 0.02 MWh, i.e. < 1 s at 900 MW).
  const state = TRIP.state;   // the evening day after the trip; later tests read only TRIP.obs
  const hyd = V.STATIONS.hydro;
  const s0 = state.hydro.storageMWh;
  let mwh = 0;
  for (let k = 0; k < 20 * 60 * TPS; k++) {
    step(state);
    for (let i = hyd.first; i < hyd.first + hyd.count; i++) mwh += state.units[i].outMW * V.PHYS_DT / 3600;
  }
  assert.ok(Math.abs((s0 - state.hydro.storageMWh) - mwh) < 0.02, 'storage drop ' + (s0 - state.hydro.storageMWh) + ' vs ∫out ' + mwh);
  const meanMW = mwh / (20 / 60);
  // At that mean gate the predicted time to empty, from the two storages, differs by the 20 min run.
  const t0 = C.waterLastsS(s0, meanMW), t1 = C.waterLastsS(state.hydro.storageMWh, meanMW);
  assert.ok(Math.abs((t0 - t1) - 1200) <= 60, 'lasts-until drifts by ' + (t0 - t1 - 1200) + ' s');
});

test('peak end and the K-4 red arc come from obs.forecast', () => {
  const fc = {fromS: 1000, stepS: 300, demandP50: [1, 2, 5, 10, 10, 9.8, 5, 4]};
  assert.equal(C.peakEndS(fc), 1000 + 6 * 300);
  assert.equal(C.redArcFromMW(1000, V.HYDRO_STOP_MWH + 1000, fc), 1000 * 3600 / 1800);
  assert.equal(C.redArcFromMW(1000 + 1800, V.HYDRO_STOP_MWH + 1000, fc), null, 'peak over: no red arc');
  assert.equal(C.peakEndS({fromS: 0, stepS: 300, demandP50: [1, 2, 3]}), 900, 'still climbing: the horizon');
  assert.equal(C.peakEndS(null), -1);
  const o = DAY.obs[13];
  const red = C.redArcFromMW(o.s, o.hydro.storageMWh, o.forecast);
  assert.ok(red === null || red > 0);
  if (red !== null) {
    // A gate just above the red line empties the dam before the peak ends; just below does not.
    const end = C.peakEndS(o.forecast);
    assert.ok(C.waterLastsUntilS(o.s, o.hydro.storageMWh, red * 1.01) < end);
    assert.ok(C.waterLastsUntilS(o.s, o.hydro.storageMWh, red * 0.99) > end);
  }
});

test('lever scale, ramp cone and AGC band (K-1, K-2) from a real evening', () => {
  const o = DAY.obs[EVE];
  for (const sid of ['coal', 'ccgt', 'gta', 'gtb', 'gtc', 'hydro']) {
    const st = o.stations.find(x => x.id === sid), sc = C.leverScale(o, sid);
    assert.equal(sc.totalMW, V.STATIONS[sid].totalMW);
    assert.equal(sc.gateMW, Math.floor(V.HOT_LOADING_FRAC * st.maxMW));
    for (let i = 1; i < sc.detents.length; i++) assert.ok(sc.detents[i] >= sc.detents[i - 1], sid + ' detents sorted');
    const c = C.rampCone(o, sid);
    const r = C.stationRampMWMin(o, sid) * 10;
    assert.ok(c.hiMW - st.outMW <= r + 1e-9 && st.outMW - c.loMW <= r + 1e-9, sid + ' cone within 10 min of ramp');
    let band = 0;
    for (const u of C.stationUnits(o, sid)) if (u.mode === 'on') band += V.MACHINES.find(m => m.id === u.id).agcBandMW;
    assert.equal(C.agcBandMW(o, sid), band);
    assert.equal(C.agcBandMW(Object.assign({}, o, {mode: 'HAND'}), sid), 0);
  }
  assert.equal(C.nextDetent(1000, [720, 975, 1463, 1872, 1950], 1), 1463);
  assert.equal(C.nextDetent(1000, [720, 975, 1463, 1872, 1950], -1), 975);
  assert.equal(C.nextDetent(1950, [720, 975, 1463, 1872, 1950], 1), 1950);
});

test('K-11: the imbalance segments sum to the swing-equation imbalance within 1 MW', () => {
  const all = [...HOURS.map(h => DAY.obs[h]), TRIP.obs];
  for (const o of all) {
    const s = C.imbalanceSegments(o.balance);
    assert.ok(Math.abs(s.sumMW - o.balance.imbalanceMW) <= 1, o.clock.text + ': ' + s.sumMW + ' vs ' + o.balance.imbalanceMW);
    assert.ok(Math.abs(s.sumMW + s.inertiaMW) <= 1, 'inertia covers the rest');
    assert.ok(Math.abs(s.schedMW + s.borrowedMW) <= 1, 'the borrowed stack covers the scheduled gap');
    const lay = barLayout(s);
    const right = lay.segs.filter(x => x.mw > 0).reduce((a, x) => a + x.width, 0);
    const left = lay.segs.filter(x => x.mw < 0).reduce((a, x) => a + x.width, 0);
    assert.ok(Math.abs(right - left) <= 1 / lay.scale * 50 + 1e-9, 'the bar balances about zero');
    assert.ok(right <= 50 + 1e-9 && left <= 50 + 1e-9, 'fits the bar');
  }
  // In the watch the gap is big and the borrowed stack is doing the work.
  const w = C.imbalanceSegments(TRIP.obs.balance);
  assert.ok(w.schedMW < -300, 'the trip opened a scheduled gap: ' + w.schedMW);
});

test('K-12 scope angle interpolation and zones; K-13 cold load matches the sim', () => {
  assert.equal(C.scopeAngle(170, 0.25, 0.2), -172);
  assert.equal(C.scopeAngle(-40, -0.25, 1), -130);
  assert.equal(C.scopeAngle(10, 0, 5), 10);
  assert.equal(C.scopeZone(5), 'clean');
  assert.equal(C.scopeZone(-9.9), 'clean');
  assert.equal(C.scopeZone(15), 'rough');
  assert.equal(C.scopeZone(-25), 'blocked');
  assert.equal(C.turnS(0.25), 4);
  // Darken a district in a real state, step past the cold-load time: the desk's rule gives obs'.
  const state = createState(3, CLASSIC);
  for (let k = 0; k < 60 * TPS; k++) step(state);
  const d = state.city.districts.findIndex(x => x.rot >= 0);
  fleet.setDistrictDark(state, d, true, 'directed');
  for (const [secs, factor] of [[300, 1], [400, V.COLD_LOAD_FACTOR]]) {
    for (let k = 0; k < secs * TPS; k++) step(state);
    const o = observe(state), od = o.districts[d];
    const cl = C.coldLoad(od, o.s, o.demand.nowMW);
    assert.equal(cl.factor, factor);
    assert.ok(Math.abs(cl.mw - od.coldLoadMW) < 1e-6 * od.coldLoadMW + 1e-9, cl.mw + ' vs ' + od.coldLoadMW);
    if (factor === 1) assert.equal(cl.coldInS, V.COLD_LOAD_AFTER_S - (o.s - od.darkSinceS));
  }
});

test('rotary geometry: GUARD detents, knob mapping, tie detents; dial angle; text helpers', () => {
  for (let mwv = 0; mwv <= 500; mwv += 50) assert.equal(C.guardFromAngle(C.knobAngle(mwv, 0, 500)), mwv);
  assert.equal(C.guardFromAngle(C.knobAngle(312, 0, 500)), 300);
  assert.equal(C.guardFromAngle(-179), 0);
  assert.equal(C.guardFromAngle(170), 500);
  assert.equal(Math.round(C.knobValue(0, -800, 800)), 0);
  assert.equal(C.tieSnap(262), 250);
  assert.equal(C.tieSnap(300), 300);
  assert.equal(C.tieSnap(-790), -800);
  assert.equal(Math.round(C.pointerAngle(0, 0, 10, 0)), 90);
  assert.equal(Math.round(C.pointerAngle(0, 0, 0, -10)), 0);
  assert.equal(dialAngle(49), Math.PI);
  assert.equal(dialAngle(51), 2 * Math.PI);
  assert.equal(unitLabel('coal3'), 'COAL 3');
  assert.equal(unitLabel('gta1'), 'GT·A');
  assert.equal(unitLabel('tie'), 'TIE');
  assert.equal(clockOf(0), '04:00');
  assert.equal(clockOf(20 * 3600), '00:00');
  assert.equal(caughtText({inertiaMW: 100, governorsMW: 300, uflsMW: 0}), 'GOV 300 · SPIN 100');
  const vm = vmAt(EVE);
  assert.equal(needleHz(vm), vm.obs.f.hz);
  assert.equal(needleHz(Object.assign({}, vm, {hist: {freq: [49.9, 49.95]}})), 49.95, '1-s average above 10×');
  assert.equal(needleHz(Object.assign({}, vm, {mode: Object.assign({}, vm.mode, {rate: 1}), hist: {freq: [49.9]}})), vm.obs.f.hz);
});

// ---------------------------------------------------------------- the desk in the stand-in DOM

test('createDesk builds every §5 control id and each machine guard, with ARIA roles', () => {
  const {$, desk} = mount(vmAt(EVE));
  for (const id of DESK_IDS) assert.ok($(id), 'missing #' + id);
  for (const m of V.MACHINES) { assert.ok($('guard-start-' + m.id), m.id + ' start'); assert.ok($('guard-stop-' + m.id), m.id + ' stop'); }
  for (const id of [...SLOT_IDS, 'ring-guard']) {
    assert.equal($(id).getAttribute('role'), 'slider', id);
    assert.equal($(id).getAttribute('tabindex'), '0', id + ' focusable');
  }
  assert.equal($('key-agc').getAttribute('role'), 'switch');
  assert.equal(desk.slots.stack.id, 'stack-slot');
  for (const e of desk.el.querySelectorAll('button')) assert.ok(e.id || e.dataset.target || e.classList.contains('dk-tile') || e.classList.contains('dk-q'), 'button ids');
});

test('the desk updates from real view models without throwing, NaN text or NaN on a canvas', () => {
  const doc0 = makeDocument();
  const root = doc0.createElement('div');
  doc0.body.appendChild(root);
  const a = mockActions();
  const desk = createDesk(doc0, root, a);
  const vms = [];
  for (const h of HOURS) vms.push(vmAt(h));
  const hand = vmAt(EVE);
  hand.obs.mode = 'HAND';
  for (const p of hand.obs.plan.stations) p.man = p.id === 'coal';
  vms.push(hand);
  vms.push(baseVm(clone(TRIP.obs), {mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'full'}}));
  const dark = vmAt(EVE);
  dark.obs.districts.slice(0, 5).forEach((d, i) => { d.dark = true; d.shedBy = 'ufls'; d.darkSinceS = dark.obs.s - 300 * i; d.restoreBlock = i % 2 ? 'frequency below 49.9 Hz' : ''; });
  dark.obs.sec.level = 'SHEDDING';
  vms.push(dark);
  const busy = vmAt(13, {previewOn: true, previewGuardMW: 250, glow: new Set(['lever-gta', 'bay-restore', 'stack']), focus: 'wheel-hydro',
    offers: [{unit: 'gtc2', why: 'peak'}],
    alarms: {tiles: [{id: 'uf', label: 'UNDER FREQ', prio: 'P1', state: 'alarm', flash: 'fast', glyph: '▼', target: 'dial-freq'}], sounding: true},
    tray: {cards: [{id: 'c1', from: 'WEATHER', atS: 30000, text: 'Cloud band at 12:10', button: {label: 'HYDRO', target: 'wheel-hydro'}, sev: 'warn'}], log: []}});
  vms.push(busy);
  let t = 0;
  for (const vm of vms) {
    for (let f = 0; f < 3; f++) { t += 16; desk.update(at(vm, t)); }
    assert.deepEqual(doc0.canvasStats.bad, [], vm.obs.clock.text);
    assert.ok(!/NaN|undefined|Infinity|null/.test(deskText(desk)), 'bad text at ' + vm.obs.clock.text + ': ' +
      (deskText(desk).match(/.{0,30}(NaN|undefined|Infinity|null).{0,30}/) || [''])[0]);
  }
  assert.ok(doc0.canvasStats.calls > 100, 'the dial and scope drew');
  assert.equal(a.inputs.length, 0, 'updating never sends an input');
  // HAND is on the dial face (aria) and the key.
  desk.update(at(hand, t += 16));
  assert.match(doc0.getElementById('dial-freq').getAttribute('aria-label'), /HAND/);
  assert.match(doc0.getElementById('key-agc').textContent, /HAND/);
});

test('K-3: START and STOP guards never commit on one click; lift then press, or S S', () => {
  const vm = vmAt(EVE);
  const o = vm.obs;
  const k = o.units.findIndex(u => u.station === 'gtc');
  Object.assign(o.units[k], {mode: 'off', sync: false, startBlock: '', stopBlock: 'unit is off'});
  const on = o.units.findIndex(u => u.station === 'ccgt' && u.mode === 'on');
  o.units[on].stopBlock = '';
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const id = o.units[k].id;
  $('guard-start-' + id).click();
  assert.equal(a.inputs.length, 0, 'one click lifts the guard only');
  assert.match($('guard-start-' + id).textContent, /\?/);
  $('guard-start-' + id).click();
  assert.deepEqual(a.inputs, [{type: 'start', unit: id}]);
  // The lift expires after 2 s: a late second click only lifts again.
  a.inputs.length = 0;
  $('guard-start-' + id).click();
  desk.update(at(vm, 3500));
  $('guard-start-' + id).click();
  assert.equal(a.inputs.length, 0, 'expired lift does not commit');
  // STOP on a running CCGT machine.
  const sid = o.units[on].id;
  $('guard-stop-' + sid).click();
  assert.equal(a.inputs.length, 0);
  $('guard-stop-' + sid).click();
  assert.deepEqual(a.inputs, [{type: 'stop', unit: sid}]);
  // S S on the focused GT·C lever.
  a.inputs.length = 0;
  desk.update(at(vm, 9000));
  $('lever-gtc').focus();
  assert.equal(desk.key({type: 'keydown', key: 's', target: $('lever-gtc')}), true);
  assert.equal(a.inputs.length, 0);
  desk.key({type: 'keydown', key: 's', target: $('lever-gtc')});
  assert.deepEqual(a.inputs, [{type: 'start', unit: id}]);
  // X X on the focused CCGT lever stops its last stoppable machine.
  a.inputs.length = 0;
  $('lever-ccgt').focus();
  desk.key({type: 'keydown', key: 'x'});
  desk.key({type: 'keydown', key: 'x'});
  assert.equal(inputsOf(a, 'stop').length, 1);
  // ABORT while unloading is one press; a refused input shows on the control.
  const u2 = o.units.findIndex(u => u.station === 'gtb');
  Object.assign(o.units[u2], {mode: 'unloading'});
  const b = mount(at(vm, 1000), mockActions({refuse: () => 'minimum up time: 30 min left'}));
  b.$('guard-stop-' + o.units[u2].id).click();
  assert.deepEqual(b.actions.inputs, [{type: 'abortStop', unit: o.units[u2].id}]);
  assert.match(b.desk.el.textContent, /minimum up time/);
});

test('K-1: a lever drag sends exactly one basePoint on release; the 96% gate needs 12 px more', () => {
  const vm = vmAt(EVE);
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const coal = vm.obs.stations.find(s => s.id === 'coal');
  const track = $('lever-coal');
  track.rect = {left: 0, top: 0, width: 28, height: 260};     // 10 MW per px (2,600 MW nameplate)
  const yOf = mwv => 260 - mwv / 10;
  track.dispatch('pointerdown', {clientX: 14, clientY: yOf(1200)});
  track.dispatch('pointermove', {clientX: 14, clientY: yOf(1150)});
  track.dispatch('pointermove', {clientX: 14, clientY: yOf(1100)});
  assert.equal(a.inputs.length, 0, 'nothing sent while dragging within 250 ms');
  track.dispatch('pointerup', {clientX: 14, clientY: yOf(1100)});
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'coal', mw: 1100}]);
  // The handle shows the sent value until the next frame arrives.
  assert.equal(track.getAttribute('aria-valuenow'), '1100');
  // Gate at 96% of the committed MW: 8 px past it holds at the gate, 13 px crosses.
  const gate = Math.floor(0.96 * coal.maxMW);
  a.inputs.length = 0;
  track.dispatch('pointerdown', {clientX: 14, clientY: yOf(1100)});
  track.dispatch('pointermove', {clientX: 14, clientY: yOf(gate) - 8});
  track.dispatch('pointerup', {clientX: 14, clientY: yOf(gate) - 8});
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'coal', mw: gate}]);
  a.inputs.length = 0;
  track.dispatch('pointerdown', {clientX: 14, clientY: yOf(1100)});
  track.dispatch('pointermove', {clientX: 14, clientY: yOf(gate) - 13});
  track.dispatch('pointerup', {clientX: 14, clientY: yOf(gate) - 13});
  assert.equal(a.inputs.length, 1);
  assert.ok(a.inputs[0].mw > gate, 'crossed: ' + a.inputs[0].mw);
  // While dragging for longer, at most one input per 250 ms (the servo is felt), then the release.
  a.inputs.length = 0;
  desk.update(at(vm, 5000));
  track.dispatch('pointerdown', {clientX: 14, clientY: yOf(1000)});
  desk.update(at(vm, 5300));
  track.dispatch('pointermove', {clientX: 14, clientY: yOf(1050)});
  track.dispatch('pointermove', {clientX: 14, clientY: yOf(1060)});
  desk.update(at(vm, 5400));
  track.dispatch('pointermove', {clientX: 14, clientY: yOf(1070)});
  track.dispatch('pointerup', {clientX: 14, clientY: yOf(1080)});
  assert.deepEqual(a.inputs.map(x => x.mw), [1050, 1080]);
});

test('K-1 keys: ↑ stops at the gate, Shift+↑ crosses it, PgDn goes to the next detent', () => {
  const vm = vmAt(EVE);
  const coal = vm.obs.stations.find(s => s.id === 'coal');
  const gate = Math.floor(0.96 * coal.maxMW);
  coal.basePointMW = gate;
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const t = $('lever-coal');
  t.focus();
  t.dispatch('keydown', {key: 'ArrowUp'});
  t.dispatch('keyup', {key: 'ArrowUp'});
  assert.equal(a.inputs.length, 0, 'plain ↑ at the gate stays at the gate');
  t.dispatch('keydown', {key: 'ArrowUp', shiftKey: true});
  t.dispatch('keyup', {key: 'ArrowUp', shiftKey: true});
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'coal', mw: gate + 1}]);
  a.inputs.length = 0;
  desk.update(at(later(vm), 2000));
  t.dispatch('keydown', {key: 'PageDown'});
  t.dispatch('keyup', {key: 'PageDown'});
  const sc = C.leverScale(vm.obs, 'coal');
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'coal', mw: C.nextDetent(gate, sc.detents, -1)}]);
  a.inputs.length = 0;
  t.dispatch('keydown', {key: 'ArrowDown'});
  t.dispatch('keydown', {key: 'ArrowDown', shiftKey: true});
  t.dispatch('keyup', {key: 'ArrowDown'});
  // The handle keeps the sent detent until the vm reads it back, so keys continue from there.
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'coal', mw: C.nextDetent(gate, sc.detents, -1) - 11}], '-10 then -1, one input');
});

test('K-1 / L-6: an idle station\'s lever books its start through the plan (planKey)', () => {
  const vm = vmAt(EVE);
  const st = vm.obs.stations.find(s => s.id === 'gta');
  Object.assign(st, {onCount: 0, minMW: 0, maxMW: 0, basePointMW: 0, outMW: 0});
  const {$, actions: a} = mount(at(vm, 1000));
  const tr = $('lever-gta');
  tr.rect = {left: 0, top: 0, width: 28, height: 100};   // 5 MW per px (500 MW)
  tr.dispatch('pointerdown', {clientY: 40});
  tr.dispatch('pointerup', {clientY: 40});
  assert.deepEqual(a.inputs, [{type: 'planKey', station: 'gta', atS: vm.obs.s, mw: 300}]);
});

test('K-2 HAND: MAN lamp lit for a grabbed lever; double-click or P rejoins, Shift+P keeps', () => {
  const vm = vmAt(EVE);
  vm.obs.mode = 'HAND';
  vm.obs.plan.stations.find(p => p.id === 'coal').man = true;
  const {$, desk, actions: a} = mount(at(vm, 1000));
  assert.equal($('man-coal').hidden, false);
  assert.ok($('man-coal').classList.contains('lit'));
  assert.ok(!$('man-ccgt').classList.contains('lit'));
  $('man-coal').dispatch('dblclick');
  assert.deepEqual(a.inputs, [{type: 'planRejoin', station: 'coal', keep: false}]);
  $('lever-coal').focus();
  desk.key({type: 'keydown', key: 'P', shiftKey: true});
  assert.deepEqual(a.inputs[1], {type: 'planRejoin', station: 'coal', keep: true});
  // AGC: no MAN lamp at all.
  const b = mount(at(vmAt(EVE), 1000));
  assert.equal(b.$('man-coal').hidden, true);
});

test('K-5: the GUARD ring snaps to 50 MW, previews each detent live, sends guard on release', () => {
  const vm = vmAt(EVE);
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const ring = $('ring-guard');
  ring.rect = {left: 0, top: 0, width: 68, height: 68};
  const pt = mwv => { const d = C.knobAngle(mwv, 0, 500) * Math.PI / 180; return {clientX: 34 + 30 * Math.sin(d), clientY: 34 - 30 * Math.cos(d)}; };
  ring.dispatch('pointerdown', pt(312));
  ring.dispatch('pointermove', pt(330));
  ring.dispatch('pointermove', pt(462));
  ring.dispatch('pointerup', pt(462));
  const prev = a.uis.filter(u => u.do === 'previewGuard').map(u => u.mw);
  assert.deepEqual(prev, [300, 350, 450]);
  assert.deepEqual(a.inputs, [{type: 'guard', mw: 450}]);
  for (const x of a.inputs) assert.equal(x.mw % 50, 0);
  // The ghost lingers, then clears.
  desk.update(at(vm, 1500));
  assert.equal(a.uis.filter(u => u.do === 'previewGuard' && u.mw === null).length, 0);
  desk.update(at(later(vm), 3000));
  assert.equal(a.uis.filter(u => u.do === 'previewGuard' && u.mw === null).length, 1);
  // Keys: one detent per press; the preview runs through actions.previewTrip with the guard.
  a.inputs.length = 0;
  ring.focus();
  ring.dispatch('keydown', {key: 'ArrowUp'});
  ring.dispatch('keyup', {key: 'ArrowUp'});
  assert.deepEqual(a.inputs, [{type: 'guard', mw: vm.obs.battery.guardMW + 50}]);
  const pv = mount(at(vmAt(EVE, {previewGuardMW: 200}), 1000));
  assert.equal(pv.actions.pv.at(-1).guardMW, 200);
  assert.match(pv.$('gauge-n1').textContent, /GUARD 200/);
  assert.match(pv.$('gauge-n1').textContent, /GOV 260/);
});

test('battery dial and tie knob send battery / tie; keys step 10 MW', () => {
  const vm = vmAt(EVE);
  const {$, actions: a} = mount(at(vm, 1000));
  const d = $('dial-battery');
  d.focus();
  d.dispatch('keydown', {key: 'ArrowUp'});
  d.dispatch('keyup', {key: 'ArrowUp'});
  const b = vm.obs.battery, signed = (b.mode === 'charge' ? -1 : b.mode === 'discharge' ? 1 : 0) * b.orderMW;
  const nv = Math.round(signed + 10);
  assert.deepEqual(a.inputs, [{type: 'battery', mode: nv > 0 ? 'discharge' : nv < 0 ? 'charge' : 'idle', mw: Math.abs(nv)}]);
  a.inputs.length = 0;
  const k = $('knob-tie');
  k.focus();
  k.dispatch('keydown', {key: 'PageDown'});
  k.dispatch('keyup', {key: 'PageDown'});
  assert.deepEqual(a.inputs, [{type: 'tie', mw: C.nextDetent(vm.obs.tie.setMW, C.TIE_DETENTS, -1)}]);
  a.inputs.length = 0;
  const w = $('wheel-hydro');
  w.focus();
  w.dispatch('keydown', {key: 'ArrowLeft', shiftKey: true});
  w.dispatch('keyup', {key: 'ArrowLeft'});
  const hy = vm.obs.stations.find(s => s.id === 'hydro');
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'hydro', mw: Math.round(Math.max(hy.minMW, hy.basePointMW - 0.1 * V.STATIONS.hydro.totalMW))}]);
  assert.match($('wheel-hydro').getAttribute('aria-valuetext'), /water lasts/);
});

test('K-7: emergency controls never commit on a tap; a 0.6-s hold commits; DIRECT SHED only when SHORT', () => {
  const vm = vmAt(EVE);
  vm.obs.sec.level = 'TIGHT';
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const rert = $('key-rert'), dr = $('btn-dr');
  for (let i = 0; i < 5; i++) { rert.click(); dr.click(); }
  assert.equal(a.inputs.length, 0, 'clicks never commit');
  rert.dispatch('pointerdown'); rert.dispatch('pointerup');     // lifts the cover
  rert.dispatch('pointerdown'); rert.dispatch('pointerup');     // a tap under the lifted cover
  dr.dispatch('pointerdown'); dr.dispatch('pointerup');
  assert.equal(a.inputs.length, 0, 'taps never commit');
  assert.match(rert.textContent, /16,000/, 'cost and lead shown before committing');
  rert.dispatch('pointerdown');
  desk.update(at(vm, 1400));
  assert.equal(a.inputs.length, 0);
  desk.update(at(vm, 1700));
  assert.deepEqual(a.inputs, [{type: 'armRERT'}]);
  rert.dispatch('pointerup');
  assert.equal(a.inputs.length, 1, 'fires once');
  // D held 0.6 s calls DR; released early it does not.
  a.inputs.length = 0;
  desk.key({type: 'keydown', key: 'd'});
  desk.update(at(vm, 2000));
  desk.key({type: 'keyup', key: 'd'});
  assert.equal(a.inputs.length, 0);
  desk.key({type: 'keydown', key: 'd'});
  desk.update(at(vm, 2700));
  assert.deepEqual(a.inputs, [{type: 'callDR'}]);
  desk.key({type: 'keyup', key: 'd'});
  // E held lifts the cover and arms.
  a.inputs.length = 0;
  desk.key({type: 'keydown', key: 'e'});
  desk.update(at(vm, 3400));
  assert.deepEqual(a.inputs, [{type: 'armRERT'}]);
  // DIRECT SHED is hidden unless SHORT / SHEDDING (A-3).
  assert.equal($('key-shed').hidden, true);
  for (const lv of ['SHORT', 'SHEDDING']) {
    const v2 = vmAt(EVE);
    v2.obs.sec.level = lv;
    const m = mount(at(v2, 1000));
    const sh = m.$('key-shed');
    assert.equal(sh.hidden, false, lv);
    sh.dispatch('pointerdown'); sh.dispatch('pointerup');
    sh.dispatch('pointerdown');
    m.desk.update(at(v2, 1300));
    assert.equal(m.actions.inputs.length, 0);
    m.desk.update(at(v2, 1700));
    assert.deepEqual(m.actions.inputs, [{type: 'directShed'}]);
  }
  // RE-DISPATCH calls actions.redispatch and shows a refusal.
  const r = mount(at(vmAt(EVE), 1000), mockActions({redisReason: 'no plan before 04:30'}));
  r.$('btn-redispatch').click();
  assert.equal(r.actions.redis, 1);
  assert.match(r.desk.el.textContent, /no plan before 04:30/);
});

test('K-9: tray shows at most 3 cards and its buttons only focus (never an input)', () => {
  const cards = [];
  for (let i = 0; i < 5; i++) cards.push({id: 'c' + i, from: 'STATION', atS: 50000 + i, text: 'Card ' + i, button: {label: 'GO', target: SLOT_IDS[i]}, sev: i ? 'info' : 'warn'});
  const vm = vmAt(EVE, {tray: {cards, log: [{atS: 100, from: 'X', text: 'old'}]}});
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const tray = $('tray');
  const btns = tray.querySelectorAll('.dk-card-btn');
  assert.equal(tray.querySelectorAll('.dk-card').length, 3);
  for (const b of btns) b.click();
  assert.equal(a.inputs.length, 0, 'no tray button changes a setpoint, a schedule or a unit state');
  assert.deepEqual(a.uis.map(u => u.do), ['focus', 'focus', 'focus']);
  assert.deepEqual(a.uis.map(u => u.target), SLOT_IDS.slice(0, 3));
  $('btn-log').click();
  desk.update(at(vm, 1100));
  assert.match(tray.textContent, /old/);
  // The focus lands on the control when vm.focus names it.
  desk.update(at(Object.assign({}, vm, {focus: 'knob-tie'}), 1200));
  assert.equal(desk.el.ownerDocument.activeElement.id, 'knob-tie');
});

test('K-8: an annunciator tile focuses its target; ACK and SILENCE work, even in the watch', () => {
  const tiles = ['UNDER FREQ', 'N-1 INSECURE', 'UNIT TRIP'].map((l, i) => ({id: 't' + i, label: l, prio: 'P' + (i + 1), state: i ? 'ackd' : 'alarm',
    flash: i ? null : 'fast', glyph: '◆', target: ['dial-freq', 'gauge-n1', 'bay-sync'][i]}));
  const vm = baseVm(clone(TRIP.obs), {mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'compact'},
    alarms: {tiles, sounding: true}});
  const {$, actions: a} = mount(at(vm, 1000));
  $('tile-t1').click();
  assert.deepEqual(a.uis.at(-1), {do: 'focus', target: 'gauge-n1'});
  assert.ok($('tile-t0').classList.contains('flash-fast'));
  assert.match($('tile-t0').textContent, /◆/, 'a glyph as well as colour');
  $('btn-ack').click();
  $('btn-silence').click();
  assert.deepEqual(a.uis.slice(-2), [{do: 'ack'}, {do: 'silence'}]);
  assert.equal($('annunciator').querySelectorAll('.dk-tile').length, 12);
});

test('K-15: during the watch the desk is locked (only ACK / SILENCE act)', () => {
  const vm = baseVm(clone(TRIP.obs), {mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'full'}});
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const t = $('lever-coal');
  t.rect = {left: 0, top: 0, width: 28, height: 260};
  t.dispatch('pointerdown', {clientY: 100}); t.dispatch('pointerup', {clientY: 100});
  t.focus(); t.dispatch('keydown', {key: 'ArrowUp'}); t.dispatch('keyup', {key: 'ArrowUp'});
  for (const m of V.MACHINES) { $('guard-start-' + m.id).click(); $('guard-start-' + m.id).click(); $('guard-stop-' + m.id).click(); $('guard-stop-' + m.id).click(); }
  $('key-rert').dispatch('pointerdown'); $('key-rert').dispatch('pointerdown');
  desk.key({type: 'keydown', key: 'd'});
  desk.update(at(vm, 3000));
  $('btn-redispatch').click();
  $('ring-guard').dispatch('keydown', {key: 'ArrowUp'}); $('ring-guard').dispatch('keyup', {key: 'ArrowUp'});
  for (const k of ['s', 'x', '[', ']', 'c', 'u']) desk.key({type: 'keydown', key: k});
  assert.equal(a.inputs.length, 0);
  assert.equal(a.redis, 0);
  assert.ok(desk.el.classList.contains('dk-locked'));
  $('btn-ack').click();
  assert.deepEqual(a.uis.at(-1), {do: 'ack'});
  // The nadir pin and the vm's watch readouts still draw without NaN.
  assert.deepEqual(desk.el.ownerDocument.canvasStats.bad, []);
});

test('K-12: the scope sends syncTrim / syncClose / syncAuto, and AUTO after 8 real seconds', () => {
  const vm = vmAt(EVE, {offers: [{unit: 'gtc2', why: 'the peak'}]});
  const u = vm.obs.units.find(x => x.id === 'gtc2');
  Object.assign(u, {mode: 'ready', sync: false, outMW: 0, slipHz: 0.25, phaseDeg: -40, timerS: 200});
  // Scope closed: the ready unit is listed and lit; opening sends `scope` and takes the offer.
  const c = mount(at(vm, 0));
  assert.ok(c.$('scope-gtc2').classList.contains('offered'));
  c.$('scope-gtc2').click();
  assert.deepEqual(c.actions.inputs, [{type: 'scope', unit: 'gtc2'}]);
  assert.deepEqual(c.actions.uis.filter(x => x.do === 'offerTaken'), [{do: 'offerTaken', unit: 'gtc2'}]);
  // Scope open.
  vm.obs.scope = {unit: 'gtc2', open: true};
  const {$, desk, actions: a} = mount(at(vm, 0));
  for (const k of ['[', ']', 'c', 'u']) desk.key({type: 'keydown', key: k});
  assert.deepEqual(a.inputs, [{type: 'syncTrim', unit: 'gtc2', dHz: -0.05}, {type: 'syncTrim', unit: 'gtc2', dHz: 0.05},
    {type: 'syncClose', unit: 'gtc2', bypass: false}, {type: 'syncAuto', unit: 'gtc2'}]);
  $('sync-close').click();
  assert.deepEqual(a.inputs.at(-1), {type: 'syncClose', unit: 'gtc2', bypass: false});
  assert.match($('bay-sync').parentElement.parentElement.textContent, /15–30 s per turn/);
  // AUTO after 8 real s with no close (a fresh desk, nothing pressed).
  const b = mount(at(vm, 0));
  b.desk.update(at(vm, 7000));
  assert.equal(inputsOf(b.actions, 'syncAuto').length, 0);
  b.desk.update(at(vm, 8100));
  assert.deepEqual(b.actions.inputs, [{type: 'syncAuto', unit: 'gtc2'}]);
  b.desk.update(at(vm, 9000));
  b.desk.update(at(vm, 20000));
  assert.equal(inputsOf(b.actions, 'syncAuto').length, 1, 'once');
  assert.deepEqual(b.doc.canvasStats.bad, []);
  // Paused time does not count toward the 8 s.
  const paused = Object.assign({}, vm, {mode: {mode: 'PAUSE', rate: 0, watchS: -1, locked: false, watchVersion: null}});
  const p = mount(at(vm, 0));
  p.desk.update(at(vm, 5000));
  p.desk.update(at(paused, 20000));
  assert.equal(inputsOf(p.actions, 'syncAuto').length, 0);
  p.desk.update(at(vm, 23500));
  assert.equal(inputsOf(p.actions, 'syncAuto').length, 1);
  // HAND: the bypass key rides on syncClose.
  const h = clone(vm.obs);
  h.mode = 'HAND';
  const hm = mount(at(baseVm(h), 0));
  hm.$('sync-bypass').click();
  hm.desk.key({type: 'keydown', key: 'c'});
  assert.deepEqual(hm.actions.inputs, [{type: 'syncClose', unit: 'gtc2', bypass: true}]);
});

test('K-13: a feeder breaker is enabled only when restoreBlock is \'\' and the restore preview is \'\'', () => {
  const vm = vmAt(EVE);
  const ds = vm.obs.districts;
  const set = (i, block, since) => Object.assign(ds[i], {dark: true, shedBy: 'ufls', darkSinceS: vm.obs.s - since, restoreBlock: block});
  set(0, '', 900); set(1, 'frequency below 49.9 Hz', 100); set(2, '', 100);
  const a = mockActions({restorePreview: d => (d === ds[2].id ? 'preview nadir 49.41 Hz' : '')});
  const {$, desk} = mount(at(vm, 1000), a);
  desk.focus('bay-restore');
  desk.update(at(vm, 1016));
  assert.equal($('restore-' + ds[0].id).disabled, false);
  assert.equal($('restore-' + ds[1].id).disabled, true, 'lamp blocks');
  assert.equal($('restore-' + ds[2].id).disabled, true, 'preview blocks');
  assert.ok(!a.rp.includes(ds[1].id), 'no preview while the lamp is out');
  assert.match($('bay-restore').parentElement.parentElement.textContent, /PERMISSIVE/);
  assert.match(desk.el.textContent, /×1\.5/, 'cold load shown after 10 min dark');
  $('restore-' + ds[2].id).click();
  assert.equal(a.inputs.length, 0);
  $('restore-' + ds[0].id).click();
  assert.deepEqual(a.inputs, [{type: 'restore', district: ds[0].id}]);
  // Keys: → selects, Enter closes the selected (only when allowed).
  a.inputs.length = 0;
  const list = $('restore-list');
  list.dispatch('keydown', {key: 'ArrowLeft'});   // wraps to the last (blocked)
  list.dispatch('keydown', {key: 'Enter'});
  assert.equal(a.inputs.length, 0);
  list.dispatch('keydown', {key: 'ArrowRight'});   // back to the first
  list.dispatch('keydown', {key: 'Enter'});
  assert.deepEqual(a.inputs, [{type: 'restore', district: ds[0].id}]);
  // R opens the restore bay.
  const m = mount(at(vm, 1000));
  assert.equal(m.desk.key({type: 'keydown', key: 'r'}), true);
});

test('keys 1-8 focus COAL…TIE; the trip preview gauge reads plain words', () => {
  const {$, desk, doc} = mount(at(vmAt(EVE), 1000));
  SLOT_IDS.forEach((id, i) => { desk.key({type: 'keydown', key: String(i + 1)}); assert.equal(doc.activeElement.id, id); });
  const g = $('gauge-n1').textContent;
  assert.match(g, /SPARE IN 5 MIN/);
  assert.match(g, /RISK: /);
  assert.match(g, /SECURE|TIGHT|SHORT|SHEDDING/);
});

// ---------------------------------------------------------------- K-17 layout at the floor

test('K-17: the desk fills 1280×300 in the 232/424/336/256 columns and every control is >= 24×24 px', () => {
  const css = readFileSync(new URL('../desk/desk.css', import.meta.url), 'utf8');
  const cols = /grid-template-columns:\s*(\d+)fr\s+(\d+)fr\s+(\d+)fr\s+(\d+)fr/.exec(css).slice(1).map(Number);
  assert.deepEqual(cols, LAYOUT.columns);
  assert.equal(LAYOUT.columns.reduce((a, b) => a + b) + 3 * LAYOUT.gutter + 2 * LAYOUT.pad, LAYOUT.width);
  assert.match(css, /column-gap:\s*8px/);
  assert.match(css, /padding:\s*0 4px/);
  LAYOUT.panels.forEach((p, i) => {
    assert.equal(p.reduce((a, b) => a + b) + (p.length - 1) * LAYOUT.gutter, LAYOUT.height, 'column ' + (i + 1));
    p.forEach((h, j) => {
      const m = new RegExp('\\.dk-c' + (i + 1) + 'abc'[j] + '\\s*\\{\\s*flex:\\s*(\\d+)').exec(css);
      assert.ok(m, 'panel .dk-c' + (i + 1) + 'abc'[j]);
      assert.equal(Number(m[1]), h);
    });
  });
  // Declared sizes of every control class (px; calc(N * var(--u)) is N px at the floor).
  const rule = sel => {
    const re = new RegExp('(^|[,}\\s])' + sel.replace(/\./g, '\\.') + '(?=[\\s,{])[^{]*\\{([^}]*)\\}', 'g');
    let body = '', m;
    while ((m = re.exec(css))) body += m[2] + ';';
    return body;
  };
  const px = (body, prop) => {
    const m = new RegExp('(^|;|\\s)' + prop + ':\\s*(?:calc\\((\\d+(?:\\.\\d+)?) \\* var\\(--u\\)\\)|(\\d+(?:\\.\\d+)?)px)').exec(body);
    return m ? Number(m[2] ?? m[3]) : null;
  };
  const size = sel => {
    const b = rule(sel);
    const w = Math.max(px(b, 'width') ?? 0, px(b, 'min-width') ?? 0), h = Math.max(px(b, 'height') ?? 0, px(b, 'min-height') ?? 0);
    return [w, h];
  };
  const SIZED = ['.dk-btn', '.dk-q', '.dk-guard', '.dk-man', '.dk-track', '.dk-wheel', '.dk-ring', '.dk-bdial', '.dk-tknob', '.dk-key',
    '.dk-tab', '.dk-tile', '.dk-hold', '.dk-feeder-brk', '.dk-ready-btn', '.dk-card-btn', '.dk-ack', '.dk-silence'];
  for (const s of SIZED) { const [w, h] = size(s); assert.ok(w >= 24 && h >= 24, s + ' declares ' + w + '×' + h); }
  // Every interactive element the desk builds carries one of those classes.
  const {desk} = mount(at(vmAt(EVE, {alarms: {tiles: [{id: 'a', label: 'A', state: 'alarm', target: 'dial-freq'}], sounding: false},
    tray: {cards: [{id: 'c', from: 'X', atS: 1, text: 't', button: {label: 'GO', target: 'tray'}}], log: []}}), 1000));
  for (const e of desk.el.walk()) {
    const role = e.getAttribute('role');
    const interactive = e.tagName === 'BUTTON' || ['slider', 'switch', 'tab', 'button'].includes(role);
    if (!interactive || e.classList.contains('empty')) continue;
    assert.ok(SIZED.some(s => e.classList.contains(s.slice(1))), 'unsized control ' + (e.id || e.className));
  }
  // The floor's own arithmetic: panels hold their controls (px at 1280×300, 4 px of padding + border).
  const inner = h => h - 8;
  const lever = (LAYOUT.columns[1] - 8 - 4 * 4) / 5;
  assert.ok(lever >= 28 + 2 + 50, 'a lever slot holds the 28-px track and a 24+2+24 guard pair: ' + lever);
  assert.ok(inner(LAYOUT.panels[1][0]) - 24 - 12 >= 4 * 24 + 3 * 2, 'lever body holds COAL\'s four machines');
  assert.ok(inner(LAYOUT.panels[1][1]) >= 12 + 68 + 12, 'rotary row holds the battery ring');
  assert.ok(inner(LAYOUT.panels[1][1]) >= 3 * 24 + 2 * 2, 'hydro machines beside the wheel');
  assert.ok(inner(LAYOUT.panels[2][1]) >= 24 + 2 + 72 + 2 + 17, 'bay: tabs, scope row, label');
  assert.ok(inner(LAYOUT.panels[3][0]) >= 3 * 24 + 2 * 2, 'annunciator: 3 rows of tiles');
  assert.ok(inner(LAYOUT.panels[3][1]) >= 20 + 3 * 24 + 2 * 2 + 2, 'tray: head and 3 cards');
  assert.ok(inner(LAYOUT.panels[3][2]) >= 24, 'emergency keys');
  assert.ok((LAYOUT.columns[3] - 8 - 44 - 3 - 3 * 2) / 4 >= 24, 'annunciator tiles wide enough');
});

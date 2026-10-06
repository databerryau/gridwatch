// tests/desk.test.js: the Phase 1a desk (desk/README.md §6): K-1, K-3-K-13, K-17 sizes; and its
// Phase 1b polish (§13-§14.2): K-8 view, K-20 cues, K-22 (no colour-only status, reduced motion),
// K-23 (every control by keyboard alone, roles and value text). Built in
// the stand-in DOM (tests/lib/dom.js) from real par days (tests/lib/vm-fixture.js); inputs are
// recorded by a mock `actions`, never applied, so every check is about what the desk SENDS.
// Phase 2a (desk/README.md §19.5, §21.5, §25), on a real mild weekend noon of the game's scenario
// (tests/lib/follow.js): guards that light and say which one is being considered (C-10), the
// K-11 bar's inverter segment and its SHED mark on unserved load, the cold load read from
// obs.districts[], DIRECT SHED naming the district the sim sheds (M-2).
// After the owner's playtest (the last section): a START that visibly arms and forgives a slow
// second click (K-3), the GUARD lamp and ring (K-5), the held-by-hand lamp, notes that are help
// rather than refusals, and readouts in words.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {V} from '../sim/params.js';
import {createDesk, makeConsider, roughSyncUnit, DESK_IDS, DESK_KEYS, SLOT_IDS, LAYOUT, CONSIDER_HOLD_MS, PRESS_FOCUS_MS} from '../desk/desk.js';
import * as C from '../desk/calc.js';
import {clockOf, unitLabel, feelOf, slowAttr, makeGuards, MODE_GLYPH, CLASS_GLYPH, PAN, GUARD_MS, GUARD_CLICK_MS, COMMIT_LOCK_MS,
  LEVER_STATIONS} from '../desk/util.js';
import {needleHz, dialAngle, barLayout, barScale, shedMarkMW} from '../desk/dial.js';
import {shedText} from '../desk/emergency.js';
import {caughtText, createGauge, SECURE_LINE_HZ} from '../desk/gauge.js';
import {tieWords} from '../desk/rotary.js';
import {createState, step, observe, applyInput} from '../sim/step.js';
import {security} from '../sim/grid.js';
import {runPar} from '../sim/autopilot.js';
import {CLASSIC, DESK_WEEKEND} from '../content/scenarios.js';
import {followDay} from './lib/follow.js';
import * as fleet from '../sim/fleet.js';

const TPS = V.TICKS_PER_S;
const tickOf = h => Math.round((h - V.DAY_START_H) * 3600 * TPS);

// ---------------------------------------------------------------- fixtures (one par day, one trip)

const HOURS = [5, 9.5, 13, 18.5, 23];
let EVE_STATE = null; // the par day at 18:30, cloned on the way (what dayVm({untilH: 18.5}) runs to)
const DAY = await (async () => {
  const state = createState(7, CLASSIC);
  const want = new Map(HOURS.map(h => [tickOf(h), h]));
  const out = {};
  runPar(7, CLASSIC, {state, untilTick: tickOf(HOURS[HOURS.length - 1]) + 1, hashEveryS: 86400,
    onStep: st => {
      const h = want.get(st.tick);
      if (h !== undefined) out[h] = observe(st);
      if (h === 18.5) EVE_STATE = structuredClone(st);
    }});
  return {state, obs: out};
})();
// The trip fixture, as tests/lib/vm-fixture.js dayVm({untilH: 18.5, trip: true}) makes it (the same
// hashState), from the day above instead of a second par run: the largest unit trips at 18:30 and
// the view is 2 grid-s into the watch.
const TRIP = (() => {
  const state = EVE_STATE;
  let best = -1;
  for (let i = 0; i < state.units.length; i++) if (state.units[i].sync && (best < 0 || state.units[i].outMW > state.units[best].outMW)) best = i;
  while (state.tick % TPS !== 0) step(state, []);
  fleet.tripUnit(state, best, 'test trip', V.HOT_TRIP_LOCKOUT_S, []);
  for (let k = 0; k < 2 * TPS; k++) step(state, []);
  const obs = observe(state);
  return {state, obs, vm: baseVm(obs)};
})();
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
/** The K-20 cue names the desk emitted, and everything else it told the UI. */
const cuesOf = a => a.uis.filter(u => u.do === 'cue').map(u => u.name);
const uiOf = a => a.uis.filter(u => u.do !== 'cue');
/**
 * A key the way the shell delivers it (§13.3): to the focused element first (it bubbles); if no
 * control there consumed it (preventDefault), to desk.key. Returns true when either acted.
 */
function press(m, key, extra) {
  const ev = m.doc.dispatch('keydown', Object.assign({key}, extra));
  return ev.defaultPrevented || m.desk.key(ev);
}
function release(m, key, extra) {
  const ev = m.doc.dispatch('keyup', Object.assign({key}, extra));
  return ev.defaultPrevented || m.desk.key(ev);
}
const tap = (m, key, extra) => { const r = press(m, key, extra); release(m, key, extra); return r; };
const slotOf = ($, sid) => $('lever-' + sid).parentElement.parentElement;

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
  // Phase 2a (C-7): the inverters' back-off is a segment of its own, never above zero
  assert.deepEqual(barLayout(w).segs.map(x => x.letter), ['GAP', 'I', 'B', 'G', 'R', 'V']);
  for (const o of all) assert.equal(C.imbalanceSegments(o.balance).inverterMW, 0 - (o.balance.renPfrMW + o.balance.roofPfrMW));
  // a view from before Phase 2a (no renPfrMW / roofPfrMW): the segment is zero and nothing is NaN
  const old = clone(TRIP.obs.balance);
  delete old.renPfrMW; delete old.roofPfrMW;
  const os = C.imbalanceSegments(old);
  assert.equal(os.inverterMW, 0);
  assert.ok(barLayout(os).segs.every(x => Number.isFinite(x.left) && Number.isFinite(x.width)));
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
    // Phase 2a: the MW is the sim's own (obs.districts[].coldLoadMW), not a second copy of its
    // rule; with no rooftop (this scenario) it is still demand x share x the factor.
    const cl = C.coldLoad(od, o.s);
    assert.equal(cl.factor, factor);
    assert.equal(cl.mw, od.coldLoadMW);
    assert.ok(Math.abs(cl.mw - o.demand.nowMW * od.share * factor) < 1e-6 * od.coldLoadMW + 1e-9, cl.mw + ' vs demand x share x ' + factor);
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
  desk.update(at(hand, t += 1100));   // the dial's text alternative changes at most once per real second
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
  // A click's lift expires after 5 s: a later second click only lifts again (past the 1-s lock after the commit above).
  a.inputs.length = 0;
  desk.update(at(vm, 2000));
  $('guard-start-' + id).click();
  desk.update(at(vm, 2000 + GUARD_CLICK_MS + 100));
  $('guard-start-' + id).click();
  assert.equal(a.inputs.length, 0, 'expired lift does not commit');
  // STOP on a running CCGT machine.
  const sid = o.units[on].id;
  $('guard-stop-' + sid).click();
  assert.equal(a.inputs.length, 0);
  $('guard-stop-' + sid).click();
  assert.deepEqual(a.inputs, [{type: 'stop', unit: sid}]);
  // S S on the focused GT·C lever (after the click lift above has dropped).
  a.inputs.length = 0;
  desk.update(at(vm, 14000));
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

test('battery dial and tie knob send battery / tie; the hydro wheel steps 1% / 10%', () => {
  const vm = vmAt(EVE);
  Object.assign(vm.obs.battery, {mode: 'discharge', orderMW: 120, guardMW: 100});
  const {$, actions: a} = mount(at(vm, 1000));
  const d = $('dial-battery');
  d.focus();
  d.dispatch('keydown', {key: 'ArrowUp'});
  d.dispatch('keyup', {key: 'ArrowUp'});
  assert.deepEqual(a.inputs, [{type: 'battery', mode: 'discharge', mw: 170}], '↑ is +50 MW of the present mode (§13.3)');
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
  assert.deepEqual(uiOf(a).map(u => u.do), ['focus', 'focus', 'focus']);
  assert.deepEqual(uiOf(a).map(u => u.target), SLOT_IDS.slice(0, 3));
  assert.deepEqual(cuesOf(a), ['button', 'button', 'button']);
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
  assert.deepEqual(uiOf(a).slice(-2), [{do: 'ack'}, {do: 'silence'}]);
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

// ---------------------------------------------------------------- Phase 1b: K-23 by keyboard alone

test('K-23 levers by keys alone: 1-5 focus, ↑↓ move, S S starts, X X stops; each gesture has its cue', () => {
  const vm = vmAt(EVE);
  const o = vm.obs;
  const k = o.units.findIndex(u => u.station === 'gtc');
  Object.assign(o.units[k], {mode: 'off', sync: false, startBlock: '', stopBlock: 'unit is off'});
  const on = o.units.findLastIndex(u => u.station === 'ccgt' && u.mode === 'on');   // X X takes the last stoppable machine
  o.units[on].stopBlock = '';
  const coal = o.stations.find(s => s.id === 'coal');
  coal.basePointMW = Math.round((coal.minMW + Math.floor(0.96 * coal.maxMW)) / 2);   // room either way, below the gate
  const m = mount(at(vm, 1000));
  const {$, doc, actions: a} = m;
  assert.equal(tap(m, '1'), true);
  assert.equal(doc.activeElement.id, 'lever-coal');
  assert.deepEqual(a.uis.at(-1), {do: 'hover', target: 'lever-coal'}, 'focus cross-highlights like the pointer does');
  assert.equal(tap(m, 'ArrowDown'), true);
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'coal', mw: coal.basePointMW - 10}]);
  assert.deepEqual(cuesOf(a), [feelOf(coal.basePointMW, coal.basePointMW - 10, C.leverScale(o, 'coal').detents, Math.floor(0.96 * coal.maxMW))]);
  assert.equal(a.uis.find(u => u.do === 'cue').pan, PAN.coal);
  // S S on GT·C (key 5): the first S lifts the guard (cover), the second starts (button).
  a.inputs.length = 0; a.uis.length = 0;
  tap(m, '5');
  assert.equal(doc.activeElement.id, 'lever-gtc');
  assert.equal(tap(m, 's'), true);
  assert.equal(a.inputs.length, 0);
  assert.deepEqual(cuesOf(a), ['cover']);
  assert.equal($('guard-start-' + o.units[k].id).getAttribute('aria-pressed'), 'true');
  assert.equal(tap(m, 's'), true);
  assert.deepEqual(a.inputs, [{type: 'start', unit: o.units[k].id}]);
  assert.deepEqual(cuesOf(a), ['cover', 'button']);
  // X X on CCGT (key 2).
  a.inputs.length = 0; a.uis.length = 0;
  tap(m, '2');
  tap(m, 'x');
  assert.equal(a.inputs.length, 0);
  tap(m, 'x');
  assert.deepEqual(a.inputs, [{type: 'stop', unit: o.units[on].id}]);
  assert.deepEqual(cuesOf(a), ['cover', 'button']);
  // For 1 s after that commit the unit's guards ignore a press; after it, a guard lifted by X and not used
  // drops after 2 s, with its click.
  a.uis.length = 0;
  tap(m, 'x');
  assert.deepEqual(cuesOf(a), []);
  m.desk.update(at(vm, 1000 + COMMIT_LOCK_MS));
  tap(m, 'x');
  m.desk.update(at(vm, 1000 + COMMIT_LOCK_MS + GUARD_MS + 1));
  assert.deepEqual(cuesOf(a), ['cover', 'cover']);
  assert.equal(inputsOf(a, 'stop').length, 1);
  // Tab to a machine's own guard, then Enter twice: the same guarded press; a held Enter never repeats it.
  const b = mount(at(vm, 1000));
  b.$('guard-start-' + o.units[k].id).focus();
  assert.equal(press(b, 'Enter'), true);
  assert.equal(press(b, 'Enter', {repeat: true}), true, 'auto-repeat is swallowed');
  assert.equal(b.actions.inputs.length, 0, 'a held Enter is one press: the guard only lifts');
  release(b, 'Enter');
  tap(b, 'Enter');
  assert.deepEqual(b.actions.inputs, [{type: 'start', unit: o.units[k].id}]);
  // Keys that are not the desk's, or carry Ctrl/Alt/Meta, or are typed into a field: not acted on.
  for (const key of ['q', 'z', 't', 'm', 'l', 'Tab', 'Escape', ' ', '?', '9', '0']) assert.equal(b.desk.key({type: 'keydown', key}), false, key);
  assert.equal(b.desk.key({type: 'keydown', key: 'c', ctrlKey: true}), false);
  assert.equal(b.desk.key({type: 'keydown', key: '1', target: {tagName: 'INPUT'}}), false);
  assert.equal(b.desk.key({type: 'keyup', key: '1'}), false);
});

test('K-23 hydro wheel, battery dial, GUARD ring and tie knob by keys alone (the §13.3 table)', () => {
  const vm = vmAt(EVE);
  const o = vm.obs;
  const hy = o.stations.find(s => s.id === 'hydro');
  hy.basePointMW = Math.round((hy.minMW + hy.maxMW) / 2);
  const hk = V.STATIONS.hydro.first;
  Object.assign(o.units[hk], {mode: 'off', sync: false, startBlock: '', stopBlock: 'unit is off'});
  Object.assign(o.battery, {mode: 'idle', orderMW: 0, guardMW: 100});
  o.tie.setMW = 200;
  const m = mount(at(vm, 1000));
  const {$, doc, desk, actions: a} = m;
  // 6: the wheel. → is 1% of nameplate; the gate thunks when the new setting is taken. S S starts a machine.
  tap(m, '6');
  assert.equal(doc.activeElement.id, 'wheel-hydro');
  tap(m, 'ArrowRight');
  assert.deepEqual(a.inputs, [{type: 'basePoint', station: 'hydro', mw: Math.round(hy.basePointMW + 0.01 * V.STATIONS.hydro.totalMW)}]);
  assert.deepEqual(cuesOf(a), ['ratchet', 'gate']);
  tap(m, 's'); tap(m, 's');
  assert.deepEqual(a.inputs.at(-1), {type: 'start', unit: o.units[hk].id});
  // 7: the battery. →: IDLE to DISCHARGE at 50 MW; ↑ +50, Shift+↑ +10, Ctrl+↑ +1; ←: back to IDLE, then CHARGE.
  a.inputs.length = 0; a.uis.length = 0;
  tap(m, '7');
  assert.equal(doc.activeElement.id, 'dial-battery');
  tap(m, 'ArrowRight');
  assert.deepEqual(a.inputs, [{type: 'battery', mode: 'discharge', mw: 50}]);
  assert.deepEqual(cuesOf(a), ['ratchet']);
  Object.assign(o.battery, {mode: 'discharge', orderMW: 50});
  desk.update(at(later(vm), 2000));
  a.inputs.length = 0;
  press(m, 'ArrowUp'); press(m, 'ArrowUp', {shiftKey: true}); press(m, 'ArrowUp', {ctrlKey: true}); release(m, 'ArrowUp');
  assert.deepEqual(a.inputs, [{type: 'battery', mode: 'discharge', mw: 111}], '+50, +10, +1 in one input');
  Object.assign(o.battery, {orderMW: 111});
  desk.update(at(later(later(vm)), 3000));
  a.inputs.length = 0; a.uis.length = 0;
  tap(m, 'ArrowLeft');
  assert.deepEqual(a.inputs, [{type: 'battery', mode: 'idle', mw: 0}]);
  assert.deepEqual(cuesOf(a), ['detent'], 'IDLE is the dial\'s detent');
  Object.assign(o.battery, {mode: 'idle', orderMW: 0});
  desk.update(at(later(later(later(vm))), 4000));
  a.inputs.length = 0;
  tap(m, 'ArrowDown');   // in IDLE ↑/↓ set the magnitude the mode keys will order: no input yet
  assert.equal(a.inputs.length, 0);
  assert.match($('dial-battery').getAttribute('aria-valuetext'), /idle, mode keys order 61 MW/);
  tap(m, 'ArrowLeft');
  assert.deepEqual(a.inputs, [{type: 'battery', mode: 'charge', mw: 61}]);
  // G: the GUARD ring; one 50-MW detent per press, previewed live.
  a.inputs.length = 0; a.uis.length = 0;
  assert.equal(tap(m, 'g'), true);
  assert.equal(doc.activeElement.id, 'ring-guard');
  tap(m, 'ArrowRight');
  assert.deepEqual(a.inputs, [{type: 'guard', mw: 150}]);
  assert.deepEqual(cuesOf(a), ['detent']);
  assert.deepEqual(uiOf(a).filter(u => u.do === 'previewGuard'), [{do: 'previewGuard', mw: 150}]);
  // 8: the tie. ↑ 50 MW (a detent at 250), Shift 10, Ctrl 1, PgUp to the next detent.
  a.inputs.length = 0; a.uis.length = 0;
  tap(m, '8');
  assert.equal(doc.activeElement.id, 'knob-tie');
  tap(m, 'ArrowUp');
  assert.deepEqual(a.inputs, [{type: 'tie', mw: 250}]);
  assert.deepEqual(cuesOf(a), ['detent']);
  o.tie.setMW = 250;
  desk.update(at(Object.assign({}, vm, {obs: Object.assign({}, o, {tick: o.tick + 5 * TPS})}), 5000));
  a.inputs.length = 0; a.uis.length = 0;
  press(m, 'ArrowLeft', {shiftKey: true}); press(m, 'ArrowLeft', {ctrlKey: true}); release(m, 'ArrowLeft');
  assert.deepEqual(a.inputs, [{type: 'tie', mw: 239}]);
  assert.deepEqual(cuesOf(a), ['ratchet'], 'one ratchet per 50 ms from one control');
  // The arrows were the controls' own (preventDefault): the desk's map never saw them twice.
  assert.equal(desk.key({type: 'keydown', key: 'ArrowUp'}), false);
});

test('K-23 emergency row and keys by keyboard: E and D holds, K + Enter Enter sheds, N re-dispatches, V the mode key', () => {
  const vm = vmAt(EVE);
  vm.obs.sec.level = 'SHORT';
  vm.obs.modeLocked = false;
  const m = mount(at(vm, 1000));
  const {$, doc, desk, actions: a} = m;
  // E held 0.6 s: the cover lifts, the key turns.
  assert.equal(press(m, 'e'), true);
  assert.equal(press(m, 'e', {repeat: true}), true);
  desk.update(at(vm, 1300));
  assert.equal(a.inputs.length, 0);
  desk.update(at(vm, 1700));
  assert.deepEqual(a.inputs, [{type: 'armRERT'}]);
  assert.deepEqual(cuesOf(a), ['cover', 'key', 'cover'], 'cover up, key, cover down');
  release(m, 'e');
  // D tapped does nothing; held, it calls DR.
  a.inputs.length = 0; a.uis.length = 0;
  tap(m, 'd');
  assert.equal(a.inputs.length, 0);
  press(m, 'd');
  desk.update(at(vm, 2400));
  assert.deepEqual(a.inputs, [{type: 'callDR'}]);
  assert.deepEqual(cuesOf(a), ['button']);
  release(m, 'd');
  // K reaches DIRECT SHED; Enter lifts, Enter within 2 s commits; one Enter alone never does.
  a.inputs.length = 0; a.uis.length = 0;
  assert.equal(tap(m, 'k'), true);
  assert.equal(doc.activeElement.id, 'key-shed');
  assert.equal(tap(m, 'Enter'), true);
  assert.equal(a.inputs.length, 0, 'the first Enter only lifts the cover');
  assert.deepEqual(cuesOf(a), []);            // the cover's click comes with the frame that shows it lifted
  desk.update(at(vm, 3000));
  assert.deepEqual(cuesOf(a), ['cover']);
  assert.match($('key-shed').getAttribute('aria-label'), /cover lifted/);
  tap(m, 'Enter');
  assert.deepEqual(a.inputs, [{type: 'directShed'}]);
  assert.deepEqual(cuesOf(a), ['cover', 'key']);
  a.inputs.length = 0;
  desk.update(at(vm, 4000));
  tap(m, 'Enter');                             // lifts again
  desk.update(at(vm, 6500));
  tap(m, 'Enter');                             // 2.5 s later: too late for the double, and a tap is not a hold
  assert.equal(a.inputs.length, 0);
  // Not SHORT: the key is hidden and K does nothing.
  const tight = vmAt(EVE);
  tight.obs.sec.level = 'TIGHT';
  const t = mount(at(tight, 1000));
  assert.equal(tap(t, 'k'), false);
  // N presses RE-DISPATCH; so does focus + Enter.
  a.uis.length = 0;
  assert.equal(tap(m, 'n'), true);
  assert.equal(a.redis, 1);
  assert.deepEqual(cuesOf(a), ['button']);
  $('btn-redispatch').focus();
  tap(m, 'Enter');
  assert.equal(a.redis, 2);
  // V reaches the AGC/HAND key; Enter turns it while the mode is not locked.
  a.inputs.length = 0; a.uis.length = 0;
  assert.equal(tap(m, 'v'), true);
  assert.equal(doc.activeElement.id, 'key-agc');
  tap(m, 'Enter');
  assert.deepEqual(a.inputs, [{type: 'mode', agc: false}]);
  assert.deepEqual(cuesOf(a), ['key']);
  assert.deepEqual(DESK_KEYS, {g: 'ring-guard', v: 'key-agc', k: 'key-shed', n: 'btn-redispatch', o: 'bay-sync', b: 'sync-bypass'});
  for (const [key, id] of Object.entries(DESK_KEYS)) assert.equal($(id).getAttribute('aria-keyshortcuts'), key.toUpperCase(), id);
});

test('K-23 procedure bay by keyboard: O opens a scope, [ ] C U work it, R ←→ Enter restores', () => {
  const vm = vmAt(EVE, {offers: [{unit: 'gtc2', why: 'the peak'}]});
  for (const id of ['gtb1', 'gtc2']) Object.assign(vm.obs.units.find(x => x.id === id), {mode: 'ready', sync: false, outMW: 0, slipHz: 0.25, phaseDeg: -40, timerS: 200});
  const c = mount(at(vm, 0));
  assert.equal(tap(c, 'o'), true);
  assert.deepEqual(c.actions.inputs, [{type: 'scope', unit: 'gtc2'}], 'the offered unit first');
  assert.deepEqual(uiOf(c.actions).filter(u => u.do === 'offerTaken'), [{do: 'offerTaken', unit: 'gtc2'}]);
  assert.deepEqual(cuesOf(c.actions), ['button']);
  // Enter on a unit's bay button opens that one.
  c.actions.inputs.length = 0;
  c.$('scope-gtb1').focus();
  tap(c, 'Enter');
  assert.deepEqual(c.actions.inputs, [{type: 'scope', unit: 'gtb1'}]);
  // Scope open: trim, close, auto; O closes the scope.
  vm.obs.scope = {unit: 'gtc2', open: true};
  const m = mount(at(vm, 0));
  for (const key of ['[', ']', 'c', 'u', 'o']) assert.equal(tap(m, key), true, key);
  assert.deepEqual(m.actions.inputs, [{type: 'syncTrim', unit: 'gtc2', dHz: -0.05}, {type: 'syncTrim', unit: 'gtc2', dHz: 0.05},
    {type: 'syncClose', unit: 'gtc2', bypass: false}, {type: 'syncAuto', unit: 'gtc2'}, {type: 'scope', unit: ''}]);
  assert.deepEqual(cuesOf(m.actions), ['button', 'button', 'button', 'button'], 'the close itself sounds from the sim record');
  assert.equal(tap(m, 'b'), false, 'the bypass key is HAND only');
  // HAND: B turns the bypass key, shown as text as well as colour.
  const h = clone(vm.obs);
  h.mode = 'HAND';
  const hm = mount(at(baseVm(h), 0));
  assert.equal(tap(hm, 'b'), true);
  assert.match(hm.$('sync-bypass').textContent, /●/);
  assert.equal(hm.$('sync-bypass').getAttribute('aria-checked'), 'true');
  tap(hm, 'c');
  assert.deepEqual(hm.actions.inputs, [{type: 'syncClose', unit: 'gtc2', bypass: true}]);
  assert.deepEqual(cuesOf(hm.actions), ['key']);
  // RESTORE: R, → to the next district, Enter closes it.
  const rv = vmAt(EVE);
  const ds = rv.obs.districts;
  for (const i of [0, 1, 2]) Object.assign(ds[i], {dark: true, shedBy: 'ufls', darkSinceS: rv.obs.s - 100, restoreBlock: i === 2 ? 'frequency below 49.9 Hz' : ''});
  const r = mount(at(rv, 1000));
  assert.equal(tap(r, 'r'), true);
  assert.equal(r.doc.activeElement.id, 'restore-list');
  r.desk.update(at(rv, 1016));
  tap(r, 'ArrowRight');
  tap(r, 'Enter');
  assert.deepEqual(r.actions.inputs, [{type: 'restore', district: ds[1].id}]);
  // The chosen row is marked without colour, and a blocked one says why on the face (not only in a tooltip).
  tap(r, 'ArrowRight');
  const rows = r.$('restore-list').querySelectorAll('.dk-feeder');
  assert.deepEqual(rows.map(x => /▸/.test(x.textContent)), [false, false, true]);
  assert.match(r.$('bay-restore').parentElement.parentElement.textContent, /frequency below 49\.9 Hz/);
  tap(r, 'Enter');
  assert.equal(r.actions.inputs.length, 1, 'a blocked breaker does not close');
  // Enter on a row's own CLOSE button closes that row.
  r.$('restore-' + ds[0].id).focus();
  tap(r, 'Enter');
  assert.deepEqual(r.actions.inputs.at(-1), {type: 'restore', district: ds[0].id});
});

test('K-23 annunciator and tray by keyboard: A, Shift+A, tiles and cards with Enter; never during the RESPOND card', () => {
  const tiles = [{id: 'uf', label: 'UNDER FREQ', prio: 'P2', state: 'alarm', flash: 'fast', glyph: '◆', target: 'dial-freq'}];
  const cards = [0, 1].map(i => ({id: 'c' + i, from: 'STATION', atS: 50000 + i, text: 'Card ' + i, button: {label: 'GO', target: SLOT_IDS[i]}, sev: 'warn'}));
  const vm = baseVm(clone(TRIP.obs), {mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'compact'},
    alarms: {tiles, sounding: true}, tray: {cards, log: []}});
  const m = mount(at(vm, 1000));
  const {$, doc, desk, actions: a} = m;
  assert.equal(tap(m, 'a'), true);
  assert.equal(tap(m, 'A', {shiftKey: true}), true);
  assert.deepEqual(uiOf(a), [{do: 'ack'}, {do: 'silence'}], 'ACK and SILENCE work in the watch');
  assert.deepEqual(cuesOf(a), ['button', 'button']);
  a.uis.length = 0;
  $('tile-uf').focus();
  assert.equal(tap(m, 'Enter'), true);
  assert.deepEqual(uiOf(a), [{do: 'focus', target: 'dial-freq'}]);
  // The tray (M is the shell's: it sets vm.focus = 'tray'): focus lands on the first card's button.
  const open = mount(at(vmAt(EVE, {tray: {cards, log: []}}), 1000));
  open.desk.update(at(vmAt(EVE, {tray: {cards, log: []}, focus: 'tray'}), 1016));
  assert.equal(open.doc.activeElement.dataset.target, SLOT_IDS[0]);
  assert.equal(tap(open, 'ArrowDown'), true);
  assert.equal(open.doc.activeElement.dataset.target, SLOT_IDS[1]);
  tap(open, 'Enter');
  assert.deepEqual(uiOf(open.actions).at(-1), {do: 'focus', target: SLOT_IDS[1]});
  tap(open, 'ArrowDown');
  assert.equal(open.doc.activeElement.id, 'btn-log');
  tap(open, 'Enter');
  open.desk.update(at(vmAt(EVE, {tray: {cards, log: []}, focus: 'tray'}), 1032));
  assert.match(open.$('btn-log').textContent, /▾/);
  assert.equal(open.$('btn-log').getAttribute('aria-pressed'), 'true');
  // While the RESPOND card is up, Enter is the card's (the shell dismisses it), not a desk button's.
  const rc = mount(at(vmAt(EVE, {respond: {lines: ['x'], glow: []}}), 1000));
  rc.$('btn-redispatch').focus();
  assert.equal(tap(rc, 'Enter'), false);
  assert.equal(rc.actions.redis, 0);
  assert.equal(doc.activeElement.id, 'tile-uf');
  assert.equal(desk.el.contains(doc.activeElement), true);
});

// ---------------------------------------------------------------- Phase 1b: K-20 cues, K-12 shake

test('K-20: a lever drag cues detent / gate / ratchet on real changes only; the plan moving a lever cues servo', () => {
  const vm = vmAt(EVE);
  const o = vm.obs;
  const coal = o.stations.find(s => s.id === 'coal');
  const sc = C.leverScale(o, 'coal'), gate = sc.gateMW;
  const below = sc.detents.filter(d => d < gate).at(-1);
  coal.basePointMW = Math.round((below + gate) / 2 / 10) * 10;
  const m = mount(at(vm, 1000));
  const {$, desk, actions: a} = m;
  const track = $('lever-coal');
  track.rect = {left: 0, top: 0, width: 28, height: 260};
  const yOf = mwv => 260 - mwv / 10;
  track.dispatch('pointerdown', {clientY: yOf(coal.basePointMW)});
  track.dispatch('pointermove', {clientY: yOf(coal.basePointMW)});
  assert.deepEqual(cuesOf(a), [], 'a pointer that does not move the handle is silent');
  track.dispatch('pointermove', {clientY: yOf(coal.basePointMW - 10)});
  assert.deepEqual(cuesOf(a), ['ratchet']);
  track.dispatch('pointermove', {clientY: yOf(below - 20)});
  assert.deepEqual(cuesOf(a), ['ratchet', 'detent']);
  track.dispatch('pointermove', {clientY: yOf(gate) - 13});
  assert.deepEqual(cuesOf(a), ['ratchet', 'detent', 'gate'], 'through the 96% gate');
  track.dispatch('pointerup', {clientY: yOf(gate) - 13});
  assert.equal(a.inputs.length, 1);
  for (const u of a.uis.filter(x => x.do === 'cue')) assert.equal(u.pan, PAN.coal);
  // The plan moves COAL and GT·A (no hand on them): one servo each, and none for a lever that did not move.
  a.uis.length = 0;
  desk.update(at(later(vm), 3000));
  assert.deepEqual(cuesOf(a), [], 'nothing moved');
  const moved = clone(later(vm).obs);
  moved.tick += TPS;
  moved.stations.find(s => s.id === 'coal').basePointMW += 60;
  moved.stations.find(s => s.id === 'ccgt').basePointMW -= 40;
  desk.update(at(baseVm(moved), 4000));
  assert.deepEqual(a.uis.filter(u => u.do === 'cue'), [{do: 'cue', name: 'servo', pan: PAN.coal}, {do: 'cue', name: 'servo', pan: PAN.ccgt}]);
  // A hand move is not a servo: the vm reading back the value just sent stays silent.
  a.uis.length = 0;
  $('lever-ccgt').focus();
  tap(m, 'ArrowDown');
  const sent = a.inputs.at(-1).mw;
  const back = clone(moved);
  back.tick += TPS;
  back.stations.find(s => s.id === 'ccgt').basePointMW = sent;
  desk.update(at(baseVm(back), 4100));
  desk.update(at(baseVm(back), 4200));
  assert.ok(!cuesOf(a).includes('servo'), 'no servo within 0.5 s of the hand: ' + cuesOf(a));
  assert.equal(a.inputs.filter(x => x.type === 'cue').length, 0, 'a cue is presentation, never a sim input');
  // feelOf, the rule itself.
  assert.equal(feelOf(100, 100, [50], 200), '');
  assert.equal(feelOf(100, 110, [50, 150], 200), 'ratchet');
  assert.equal(feelOf(100, 150, [50, 150], 200), 'detent');
  assert.equal(feelOf(160, 150, [50, 150], 200), 'detent', 'dropping into a detent thumps, from either side');
  assert.equal(feelOf(150, 160, [50, 150], 200), 'ratchet', 'leaving one does not');
  assert.equal(feelOf(160, 140, [50, 150], 200), 'detent');
  assert.equal(feelOf(200, 201, [50, 150, 200], 200), 'gate');
  assert.equal(feelOf(210, 190, [50, 150, 200], 200), 'gate');
});

test('K-12 / K-22: a rough close shakes that unit\'s lever for 0.6 s; never under reduced motion', () => {
  const open = vmAt(EVE);
  Object.assign(open.obs.units.find(x => x.id === 'gtc2'), {mode: 'ready', sync: false, outMW: 0, slipHz: 0.25, phaseDeg: 12, timerS: 200});
  open.obs.scope = {unit: 'gtc2', open: true};
  const closed = (slipWas, mode, cues) => {
    const v = vmAt(EVE, {cues});
    Object.assign(v.obs.units.find(x => x.id === 'gtc2'), {mode, slipHz: 0, phaseDeg: 0});
    v.obs.tick += TPS;
    return v;
  };
  const run = (settings, mode, cues, slip = 0.25) => {
    const o1 = clone(open.obs);
    o1.units.find(x => x.id === 'gtc2').slipHz = slip;
    const m = mount(at(baseVm(o1, {settings}), 1000));
    m.desk.update(at(Object.assign(closed(slip, mode, cues), {settings}), 1016));
    return m;
  };
  const m = run({volume: 1, muted: false}, 'loading', ['breaker', {name: 'growl'}]);
  assert.ok(slotOf(m.$, 'gtc').classList.contains('shake'), 'GT·C shakes');
  assert.ok(!slotOf(m.$, 'gtb').classList.contains('shake'), 'only that station');
  m.desk.update(at(closed(0.25, 'loading', []), 1500));
  assert.ok(slotOf(m.$, 'gtc').classList.contains('shake'), 'still within 0.6 s');
  m.desk.update(at(closed(0.25, 'loading', []), 1700));
  assert.ok(!slotOf(m.$, 'gtc').classList.contains('shake'), 'over after 0.6 s');
  // Not rough: a clean close (no growl), a reverse close (slip < 0), a bypass close (tripped).
  assert.ok(!slotOf(run({}, 'loading', ['breaker']).$, 'gtc').classList.contains('shake'));
  assert.ok(!slotOf(run({}, 'loading', ['growl'], -0.25).$, 'gtc').classList.contains('shake'));
  assert.ok(!slotOf(run({}, 'tripped', ['growl']).$, 'gtc').classList.contains('shake'));
  assert.equal(roughSyncUnit(closed(0.25, 'loading', ['growl']), {unit: 'gtc2', slipHz: 0.25}), 'gtc2');
  assert.equal(roughSyncUnit(closed(0.25, 'loading', ['growl']), null), '');
  // Reduced motion (vm.settings.reducedMotion; undefined = off): no shake, and the desk says so to its CSS.
  const rm = run({reducedMotion: true}, 'loading', ['growl']);
  assert.ok(!slotOf(rm.$, 'gtc').classList.contains('shake'));
  assert.ok(rm.desk.el.classList.contains('dk-rm'));
  assert.ok(!m.desk.el.classList.contains('dk-rm'));
  const noSettings = mount(at(Object.assign(vmAt(EVE), {settings: undefined}), 1000));
  assert.ok(!noSettings.desk.el.classList.contains('dk-rm'));
});

// ---------------------------------------------------------------- Phase 1b: K-8 view, K-22

const CSS = readFileSync(new URL('../desk/desk.css', import.meta.url), 'utf8');

test('K-8 view (B-2): 2.5 Hz / 0.8 Hz flashes, 1 Hz / steady under reduced motion, nothing above 3 Hz', () => {
  const secs = sel => {
    const m = new RegExp(sel.replace(/[.\s]/g, x => (x === '.' ? '\\.' : '\\s+')) + '\\s*\\{[^}]*?animation(?:-duration)?:\\s*(?:[\\w-]+\\s+)?([\\d.]+)s').exec(CSS);
    return m ? Number(m[1]) : null;
  };
  assert.equal(1 / secs('.dk-tile.flash-fast'), 2.5);
  assert.equal(1 / secs('.dk-tile.flash-slow'), 0.8);
  // Reduced motion, all three routes: body.rm (the shell), .dk-rm (the desk's own class), the media query.
  assert.match(CSS, /body\.rm \.dk-tile\.flash-fast, \.dk-rm \.dk-tile\.flash-fast \{ animation-duration: 1s; \}/);
  assert.match(CSS, /body\.rm \.dk-tile\.flash-slow, \.dk-rm \.dk-tile\.flash-slow \{ animation: none; \}/);
  assert.match(CSS, /body\.rm \.dk-handle, \.dk-rm \.dk-handle \{ transition: none; \}/);
  const media = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)[1];
  assert.match(media, /\.dk-tile\.flash-fast \{ animation-duration: 1s; \}/);
  assert.match(media, /\.dk-tile\.flash-slow \{ animation: none; \}/);
  assert.match(media, /\.dk-handle \{ transition: none; \}/);
  assert.match(media, /\.shake[^{]*\{ animation: none; \}/);
  assert.match(CSS, /body\.rm \.dk \.shake[^{]*\{ animation: none; \}/);
  // No repeating animation anywhere in the desk's CSS cycles faster than 3 Hz.
  for (const m of CSS.matchAll(/animation:\s*[\w-]+\s+([\d.]+)s[^;]*infinite/g)) assert.ok(1 / Number(m[1]) <= 3, m[0]);
});

test('K-8 / K-22: each tile state, and an escalated tile, is distinct without colour or flash', () => {
  const states = ['normal', 'alarm', 'ackd', 'cleared'];
  const GLYPH = {normal: '', alarm: '◆', ackd: '■', cleared: '◇'};   // what app/alarms.js sends
  const tiles = states.map((s, i) => ({id: 't' + i, label: 'TILE', prio: 'P2', state: s, glyph: GLYPH[s], target: 'dial-freq',
    flash: s === 'alarm' ? 'fast' : s === 'cleared' ? 'slow' : null}));
  tiles.push({id: 'esc', label: 'TILE', prio: 'P1', state: 'alarm', glyph: '◆', flash: 'fast', escalated: true, target: 'dial-freq'});
  tiles.push({id: 'noglyph', label: 'TILE', prio: 'P3', state: 'cleared', flash: 'slow', target: 'dial-freq'});
  const {$} = mount(at(vmAt(EVE, {alarms: {tiles, sounding: false}}), 1000));
  const texts = [...states.map((s, i) => $('tile-t' + i).textContent), $('tile-esc').textContent];
  assert.equal(new Set(texts).size, texts.length, 'five different faces: ' + texts.join(' | '));
  const labels = [...states.map((s, i) => $('tile-t' + i).getAttribute('aria-label')), $('tile-esc').getAttribute('aria-label')];
  assert.equal(new Set(labels).size, labels.length);
  assert.match($('tile-esc').textContent, /‼/);
  assert.ok($('tile-esc').classList.contains('esc'));
  assert.match($('tile-esc').getAttribute('aria-label'), /escalated/);
  assert.ok(!$('tile-t1').classList.contains('esc'), 'the same alarm, not escalated');
  assert.match(CSS, /\.dk-tile\.esc \{ border-style: double;/);
  assert.match($('tile-noglyph').textContent, /◇/, 'a tile without a glyph still gets its state\'s');
  assert.ok($('tile-t3').classList.contains('flash-slow') && $('tile-t1').classList.contains('flash-fast'));
  assert.match($('btn-ack').textContent, /◆/, 'ACK shows there is something to acknowledge');
});

test('K-22: lamps, levels, bars and previews say their state in text or pattern, not colour alone', () => {
  // Machine lamps: one glyph per state.
  assert.equal(new Set(Object.values(MODE_GLYPH)).size, Object.keys(MODE_GLYPH).length);
  const vm = vmAt(EVE);
  const o = vm.obs;
  const coal = o.units.filter(u => u.station === 'coal');
  const modes = Object.keys(MODE_GLYPH);
  const seen = new Set();
  for (let i = 0; i < modes.length; i += coal.length) {
    coal.forEach((u, j) => { if (modes[i + j]) u.mode = modes[i + j]; });
    const {$} = mount(at(vm, 1000));
    coal.forEach((u, j) => {
      if (!modes[i + j]) return;
      const b = $('guard-start-' + u.id);
      assert.ok(b.textContent.startsWith(MODE_GLYPH[u.mode]), u.mode + ': ' + b.textContent);
      assert.match(b.getAttribute('aria-label'), new RegExp(u.mode.toUpperCase()));
      seen.add(b.textContent[0]);
    });
  }
  assert.equal(seen.size, modes.length);
  // The N-1 level word and the SPARE bar: a glyph per state; the fills differ by pattern (CSS).
  const faces = new Map();
  for (const [level, r5, l] of [['SECURE', 900, 600], ['TIGHT', 650, 600], ['SHORT', 400, 600], ['SHEDDING', 100, 600]]) {
    const v = vmAt(EVE);
    Object.assign(v.obs.sec, {level, r5MW: r5, lMW: l});
    const {$} = mount(at(v, 1000));
    const g = $('gauge-n1');
    faces.set(level, g.querySelector('.dk-level').textContent + '|' + g.querySelector('.dk-gbar-val').textContent.replace(/\d/g, ''));
    assert.equal(g.querySelector('.dk-gbar').classList.contains('short'), r5 < l, level);
  }
  assert.deepEqual([...faces.values()], ['✓ SECURE|✓', '! TIGHT|!', '✕ SHORT|✕', '✕✕ SHEDDING|✕']);
  assert.match(CSS, /\.dk-gbar \+ \.dk-gbar \.dk-gbar-fill \{ background: repeating-linear-gradient\(135deg/, 'RISK is hatched');
  assert.match(CSS, /\.dk-gbar\.short \.dk-gbar-fill \{ background: repeating-linear-gradient\(45deg/, 'a short SPARE is cross-hatched');
  // TRIP PREVIEW colours carry ✓ ! ✕; the latch says it is on.
  const pv = hz => { const v = vmAt(EVE); v.obs.sec.previewNadirHz = hz; return mount(at(v, 1000)).$('gauge-n1').querySelector('.dk-ptext').textContent; };
  assert.deepEqual([49.7, 49.3, 48.9].map(hz => pv(hz)[0]), [CLASS_GLYPH.good, CLASS_GLYPH.warn, CLASS_GLYPH.crit]);
  const on = mount(at(vmAt(EVE, {previewOn: true}), 1000));
  assert.match(on.$('btn-preview').textContent, /●/);
  assert.equal(on.$('btn-preview').getAttribute('aria-pressed'), 'true');
  // The frequency readout and CHANGE: a mark outside the band / above the RoCoF limit.
  const f = (hz, rocof) => { const v = vmAt(EVE); v.obs.f.hz = hz; v.obs.f.rocofHzS = rocof; v.mode.rate = 1; return mount(at(v, 1000)).$('dial-freq').textContent; };
  assert.match(f(49.7, 0), /^! 49\.700/);
  assert.match(f(49.3, -1.4), /^✕ 49\.300 Hz✕ CHANGE/);
  assert.match(f(50, 0), /^50\.000 HzCHANGE/);
  // Lamps: the link, the lever above its gate, the tabs.
  const t = vmAt(EVE);
  Object.assign(t.obs.tie, {tripped: true, lockoutS: 600});
  assert.match(mount(at(t, 1000)).$('knob-tie').parentElement.parentElement.textContent, /✕ TRIP/);
  assert.match(mount(at(vm, 1000)).$('knob-tie').parentElement.parentElement.textContent, /● LINK/);
  const hot = vmAt(EVE);
  const st = hot.obs.stations.find(s => s.id === 'ccgt');
  st.basePointMW = st.maxMW;
  assert.match(slotOf(mount(at(hot, 1000)).$, 'ccgt').textContent, /! >96%/);
  assert.match(CSS, /\.dk-tab\[aria-selected="true"\] \{[^}]*border-bottom-width: 3px/);
  assert.match(CSS, /\.dk-mach\.hot \.dk-start \{[^}]*border-style: dashed/);
});

test('K-23: roles, value text and shortcuts on every control; canvases have a text alternative, at most one change per real second', () => {
  const vm = vmAt(EVE, {offers: [{unit: 'gtc2', why: 'the peak'}],
    alarms: {tiles: [{id: 'a', label: 'A', state: 'alarm', glyph: '◆', target: 'dial-freq'}], sounding: false},
    tray: {cards: [{id: 'c', from: 'X', atS: 1, text: 't', button: {label: 'GO', target: 'tray'}}], log: []}});
  Object.assign(vm.obs.units.find(x => x.id === 'gtc2'), {mode: 'ready', sync: false, outMW: 0, slipHz: 0.25, phaseDeg: -40, timerS: 200});
  vm.obs.scope = {unit: 'gtc2', open: true};
  vm.obs.sec.level = 'SHORT';
  vm.mode.rate = 1;
  const {$, desk} = mount(at(vm, 1000));
  const KEYS = {'lever-coal': '1', 'lever-ccgt': '2', 'lever-gta': '3', 'lever-gtb': '4', 'lever-gtc': '5', 'wheel-hydro': '6', 'dial-battery': '7',
    'knob-tie': '8', 'ring-guard': 'G', 'key-rert': 'E', 'btn-dr': 'D', 'key-shed': 'K', 'btn-redispatch': 'N', 'key-agc': 'V', 'bay-sync': 'O',
    'bay-restore': 'R', 'sync-lower': '[', 'sync-raise': ']', 'sync-close': 'C', 'sync-auto': 'U', 'sync-bypass': 'B', 'btn-ack': 'A',
    'btn-silence': 'Shift+A', 'tray': 'M', 'btn-preview': 'T'};
  for (const [id, k] of Object.entries(KEYS)) assert.equal($(id).getAttribute('aria-keyshortcuts'), k, id);
  for (const id of [...SLOT_IDS, 'ring-guard']) {
    const e = $(id);
    assert.equal(e.getAttribute('role'), 'slider', id);
    for (const k of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow']) assert.ok(Number.isFinite(Number(e.getAttribute(k))), id + ' ' + k);
    assert.ok(Number(e.getAttribute('aria-valuemin')) <= Number(e.getAttribute('aria-valuenow')) && Number(e.getAttribute('aria-valuenow')) <= Number(e.getAttribute('aria-valuemax')), id);
    assert.match(e.getAttribute('aria-valuetext'), /MW/, id);
    assert.ok(e.getAttribute('aria-label'), id);
  }
  assert.match($('lever-coal').getAttribute('aria-valuetext'), /^COAL base point \d+ MW, output \d+ MW/);
  assert.match($('lever-coal').getAttribute('aria-valuetext'), /plan \d+ MW by \d\d:\d\d/, 'the plan ghost\'s tooltip is in the value text too');
  // Every button has a name; guards and latches say their state.
  for (const e of desk.el.querySelectorAll('button')) {
    if (e.classList.contains('empty')) continue;
    assert.ok((e.getAttribute('aria-label') || e.textContent).trim().length > 0, 'unnamed button ' + (e.id || e.className));
  }
  for (const m of V.MACHINES) for (const g of ['guard-start-', 'guard-stop-']) assert.equal($(g + m.id).getAttribute('aria-pressed'), 'false', g + m.id);
  assert.equal($('key-agc').getAttribute('role'), 'switch');
  assert.ok(['true', 'false'].includes($('key-agc').getAttribute('aria-checked')));
  assert.ok(['true', 'false'].includes($('key-rert').getAttribute('aria-pressed')));
  assert.equal($('tile-a').tagName, 'BUTTON');
  assert.equal($('scope-gtc2').tagName, 'BUTTON');
  // Canvases: only the dial and the synchroscope, each role=img with a label.
  const canvases = desk.el.querySelectorAll('canvas');
  assert.deepEqual(canvases.map(c => c.id).sort(), ['dial-canvas', 'scope-canvas']);
  for (const c of canvases) { assert.equal(c.getAttribute('role'), 'img'); assert.ok(!c.hasAttribute('aria-hidden')); }
  assert.match($('dial-canvas').getAttribute('aria-label'), /^Frequency \d\d\.\d\d\d hertz, in the normal band/);
  assert.match($('scope-canvas').getAttribute('aria-label'), /GT·C 2: slip plus 0\.25 hertz, needle turning clockwise.*one turn every 4\.0 seconds/);
  // At most one change per real second, however often the numbers move.
  const seen = new Set([$('dial-canvas').getAttribute('aria-label')]), scope = new Set([$('scope-canvas').getAttribute('aria-label')]);
  for (let i = 1; i <= 180; i++) {   // 3 real seconds of 60-Hz frames
    const v = clone(vm);
    v.obs.f.hz = 50 + 0.001 * (i % 40);
    v.obs.units.find(x => x.id === 'gtc2').slipHz = 0.25 - 0.001 * i;
    desk.update(at(baseVm(v.obs, {mode: vm.mode}), 1000 + i * 1000 / 60));
    seen.add($('dial-canvas').getAttribute('aria-label'));
    scope.add($('scope-canvas').getAttribute('aria-label'));
    assert.equal($('dial-freq').getAttribute('aria-label'), $('dial-canvas').getAttribute('aria-label'));
  }
  assert.ok(seen.size >= 3 && seen.size <= 4, 'dial alternative changed ' + (seen.size - 1) + ' times in 3 s');
  assert.ok(scope.size >= 3 && scope.size <= 4, 'scope alternative changed ' + (scope.size - 1) + ' times in 3 s');
  // slowAttr itself.
  let now = 0;
  const set = slowAttr(() => now), e = $('dial-canvas');
  set(e, 'data-x', 'a'); now = 500; set(e, 'data-x', 'b');
  assert.equal(e.getAttribute('data-x'), 'a');
  now = 1000; set(e, 'data-x', 'c');
  assert.equal(e.getAttribute('data-x'), 'c');
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

// ---------------------------------------------------------------- Phase 2a: the belly on the desk (§19.5, §21.5, §25)

let NOON = null;
/**
 * A real mild weekend at 12:30 on the game's scenario with nobody at the desk (desk-weekend,
 * seed 1): the roofs near their peak, Solstice Rise feeding back, the dispatch spilling. Each
 * caller gets its own copy of the state.
 */
function noonState() {
  NOON ||= followDay(1, DESK_WEEKEND, {follow: false, untilH: 12.5}).st;
  return structuredClone(NOON);
}
const considers = a => a.uis.filter(u => u.do === 'consider').map(u => u.target);
/**
 * A mouse click as a browser delivers it (the stand-in's click() alone moves no focus): the
 * pointer goes down, the button takes the focus (the old element blurs first), the pointer comes
 * up, then the click.
 */
function mouseClick(doc, e) {
  e.dispatch('pointerdown');
  const prev = doc.activeElement;
  if (prev !== e) { if (prev && prev !== doc.body) prev.blur(); e.focus(); }
  e.dispatch('pointerup');
  e.click();
}
/** Tab or Shift+Tab as a browser delivers it: the old element blurs, then the new one takes the focus. */
function tabTo(doc, e) {
  const prev = doc.activeElement;
  if (prev && prev !== doc.body && prev !== e) prev.blur();
  e.focus();
}
/** A fixture for the consider tests: GT·C 1 off and startable (gs), a CCGT on and stoppable (gx). */
function considerDesk(pickLast) {
  const vm = vmAt(EVE);
  const o = vm.obs;
  const k = o.units.findIndex(u => u.station === 'gtc');
  Object.assign(o.units[k], {mode: 'off', sync: false, startBlock: '', stopBlock: 'unit is off'});
  const ons = o.units.filter(u => u.station === 'ccgt' && u.mode === 'on'), on = pickLast ? ons[ons.length - 1] : ons[0];
  on.stopBlock = '';
  const m = mount(at(vm, 1000));
  let ms = 1000;
  /** Draw a frame at desk time t (ms); with no argument, 16 ms on. */
  const to = t => { ms = t === undefined ? ms + 16 : t; m.desk.update(at(vm, ms)); return ms; };
  return Object.assign(m, {vm, o, to, now: () => ms, a: m.actions, gs: 'guard-start-' + o.units[k].id, gx: 'guard-stop-' + on.id, unit: o.units[k].id});
}

test('C-10: a START / STOP guard lights when its id is in vm.glow, and says so without colour', () => {
  const vm = vmAt(EVE, {glow: new Set(['guard-stop-ccgt2', 'guard-start-hydro3', 'lever-gta'])});
  const {$} = mount(at(vm, 1000));
  for (const m of V.MACHINES) for (const g of ['guard-start-', 'guard-stop-']) {
    const want = g + m.id === 'guard-stop-ccgt2' || g + m.id === 'guard-start-hydro3';
    assert.equal($(g + m.id).classList.contains('glow'), want, g + m.id);
    assert.equal(/the objective points here/.test($(g + m.id).getAttribute('aria-label')), want, g + m.id + ' label');
  }
  assert.match(CSS, /\.dk \.glow, \.dk \.dk-focus \{ box-shadow:/, 'the glow every desk control shares');
  // no glow set at all (older shells): nothing lit, no throw
  const bare = vmAt(EVE);
  delete bare.glow;
  assert.equal(mount(at(bare, 1000)).$('guard-stop-ccgt2').classList.contains('glow'), false);
});

test('C-10 consider: the desk names the guard being considered: lifted, then focused, then hovered; null when none; only on a change', () => {
  const {$, desk, a, vm, to, gs, gx, unit} = considerDesk(false);
  const other = 'guard-stop-coal1';
  assert.deepEqual(considers(a), [], 'nothing is considered at rest, and nothing is sent');
  // hover: named at once; its end is resolved by the next frame
  $(gx).dispatch('pointerenter');
  $(gx).dispatch('pointerenter');
  assert.deepEqual(considers(a), [gx]);
  $(gx).dispatch('pointerleave');
  assert.deepEqual(considers(a), [gx], 'not before the frame');
  to();
  assert.deepEqual(considers(a), [gx, null]);
  // focus (the keyboard's: no pointer went down on it) beats hover
  $(gx).dispatch('pointerenter');
  $(other).focus();
  assert.equal(considers(a).at(-1), other);
  $(gs).dispatch('pointerenter');   // hovering another guard while one is focused changes nothing
  $(gs).dispatch('pointerleave');
  to();
  assert.deepEqual(considers(a).slice(-2), [gx, other]);
  // a lifted guard beats both
  a.inputs.length = 0;
  // its cover drops unused after 5 s (lifted by the pointer: no hold): back to the focused guard
  const liftedAt = to();
  $(gs).click();
  assert.equal(a.inputs.length, 0);
  assert.equal(considers(a).at(-1), gs);
  to(liftedAt + GUARD_CLICK_MS - 1);
  assert.equal(considers(a).at(-1), gs);
  to(liftedAt + GUARD_CLICK_MS + 1);
  assert.equal(considers(a).at(-1), other);
  // a commit counts as a drop
  $(gs).click();
  assert.equal(considers(a).at(-1), gs);
  $(gs).click();
  assert.deepEqual(a.inputs, [{type: 'start', unit}]);
  assert.equal(considers(a).at(-1), other);
  $(other).blur();
  to();
  assert.equal(considers(a).at(-1), null);
  // a window that is not the active one sends no focus events: the desk also reads the focused guard each frame
  const doc = $(gx).ownerDocument;
  doc.activeElement = $(gx);
  to(6600);
  assert.equal(considers(a).at(-1), gx);
  doc.activeElement = $('lever-coal');
  to(6700);
  assert.equal(considers(a).at(-1), null, 'a lever is not a guard');
  // sent only when the resolved target changes: no two the same in a row, over all of the above and idle frames
  const n = considers(a).length;
  for (let t = 7000; t < 12000; t += 16) desk.update(at(vm, t));
  const all = considers(a);
  assert.equal(all.length, n, 'idle frames send nothing');
  for (let i = 1; i < all.length; i++) assert.notEqual(all[i], all[i - 1]);
  assert.ok(a.uis.filter(u => u.do === 'consider').every(u => Object.keys(u).join() === 'do,target'));
});

test('C-10 consider by keys: a guard lifted by S or X is held 6 s after its cover drops; S S commits and clears it at once', () => {
  const m = considerDesk(true);
  const {$, a, to, gs, gx, unit} = m;
  assert.equal(CONSIDER_HOLD_MS, 6000);
  // 2 X: the lever has the focus, not the guard, and nothing is hovered
  tap(m, '2');
  tap(m, 'x');
  assert.equal(a.inputs.length, 0);
  assert.deepEqual(considers(a), [gx]);
  assert.equal(m.doc.activeElement.id, 'lever-ccgt');
  // the cover drops after 2 s (K-3 is unchanged: a late second X only lifts again) ...
  to(1000 + GUARD_MS + 1);
  assert.equal($(gx).getAttribute('aria-pressed'), 'false');
  // ... and the guard is still the considered one for 6 s more
  to(1000 + GUARD_MS + CONSIDER_HOLD_MS - 1);
  assert.deepEqual(considers(a), [gx]);
  // hovering another guard meanwhile does not take it; lifting another does
  $(gs).dispatch('pointerenter');
  assert.deepEqual(considers(a), [gx]);
  to(1000 + GUARD_MS + CONSIDER_HOLD_MS + 1);
  assert.deepEqual(considers(a), [gx, gs], 'the hold is over: the hovered guard');
  $(gs).dispatch('pointerleave');
  to();
  assert.equal(considers(a).at(-1), null);
  // S S on GT·C: lifted, then committed within 2 s: the hold never starts
  a.uis.length = 0;
  to(20000);
  tap(m, '5');
  tap(m, 's');
  assert.deepEqual(considers(a), [gs]);
  to(20500);
  tap(m, 's');
  assert.deepEqual(a.inputs, [{type: 'start', unit}]);
  assert.deepEqual(considers(a), [gs, null], 'a commit counts as a drop');
  for (let t = 20600; t < 30000; t += 100) to(t);
  assert.deepEqual(considers(a), [gs, null]);
  // a second key lift while one is held: the lifted one wins, then ITS hold runs
  a.uis.length = 0;
  to(40000);
  tap(m, '2'); tap(m, 'x');                 // lift the CCGT stop by key at 40.0 s
  to(43000);                                // dropped at 42.0 s; held to 48.0 s
  $('lever-coal').focus(); tap(m, 'x');     // lift a coal stop by key at 43.0 s
  const coalX = considers(a).at(-1);
  assert.match(coalX, /^guard-stop-coal\d$/);
  to(47000);                                // coal dropped at 45.0 s, held to 51.0 s: the later hold wins
  assert.equal(considers(a).at(-1), coalX);
  to(50900);
  assert.equal(considers(a).at(-1), coalX);
  to(51100);
  assert.equal(considers(a).at(-1), null);
  // the rule itself, off the desk (a guard losing the focus or the pointer is resolved by the next tick)
  let now = 0;
  const guards = makeGuards(() => now), said = [];
  const c = makeConsider(() => now, guards, t => said.push(t));
  c.hover('a', true); c.focus('b', true);
  guards.press('c', () => {}); c.lift('c', true);
  now = 1000; guards.press('c', () => {}); c.commit('c');
  now = 20000; c.tick(); c.focus('b', false);
  assert.deepEqual(said, ['a', 'b', 'c', 'b']);
  c.tick(); c.hover('a', false); c.tick();
  assert.deepEqual(said, ['a', 'b', 'c', 'b', 'a', null]);
  assert.equal(c.target, null);
});

test('C-10 consider by keys: S alone is held like X; a key lift, a drop, then X X ends at once; a guard focused after a key lift outranks its hold', () => {
  // 5 S, left to drop: the START guard is held for 6 s after its cover drops, with the focus still on the lever
  const m = considerDesk(true);
  const {$, a, to, gs, gx} = m;
  tap(m, '5');
  tap(m, 's');
  assert.equal(a.inputs.length, 0);
  assert.deepEqual(considers(a), [gs]);
  assert.equal(m.doc.activeElement.id, 'lever-gtc');
  to(1000 + GUARD_MS + 1);
  assert.equal($(gs).getAttribute('aria-pressed'), 'false', 'the cover is down');
  assert.deepEqual(considers(a), [gs]);
  to(1000 + GUARD_MS + CONSIDER_HOLD_MS - 1);
  assert.deepEqual(considers(a), [gs], 'a START lifted by S is held as a STOP lifted by X is');
  to(1000 + GUARD_MS + CONSIDER_HOLD_MS + 1);
  assert.deepEqual(considers(a), [gs, null]);
  // 2 X, the cover drops (the hold runs), then X X: the commit clears the target at once and the old hold does not come back
  a.uis.length = 0; a.inputs.length = 0;
  to(20000);
  tap(m, '2'); tap(m, 'x');                 // lifted at 20.0 s
  to(23000);                                // dropped at 22.0 s, held to 28.0 s
  assert.deepEqual(considers(a), [gx]);
  tap(m, 'x');                              // lifted again at 23.0 s
  to(23500);
  tap(m, 'x');                              // committed
  assert.deepEqual(a.inputs, [{type: 'stop', unit: gx.replace('guard-stop-', '')}]);
  assert.deepEqual(considers(a), [gx, null]);
  for (let t = 23600; t < 33000; t += 200) to(t);
  assert.deepEqual(considers(a), [gx, null], 'no hold after a commit');
  // a guard that takes the keyboard's focus after the key lift outranks the hold ...
  const n = considerDesk(true);
  tap(n, '1'); tap(n, 'x');                 // a coal STOP lifted by key at 1.0 s
  const held = considers(n.a).at(-1);
  assert.match(held, /^guard-stop-coal\d$/);
  n.to(1000 + GUARD_MS + 100);              // its cover is down; the hold has 5.9 s to run
  assert.deepEqual(considers(n.a), [held]);
  const next = held === 'guard-stop-coal1' ? 'guard-stop-coal2' : 'guard-stop-coal1';
  tabTo(n.doc, n.$(next));
  assert.deepEqual(considers(n.a), [held, next], 'the focus is on another guard: that one, at once');
  n.to(1000 + GUARD_MS + CONSIDER_HOLD_MS + 500);
  assert.deepEqual(considers(n.a), [held, next]);
  // ... also when it took the focus while the cover was still up
  const q = considerDesk(true);
  tap(q, '1'); tap(q, 'x');
  const heldQ = considers(q.a).at(-1), nextQ = heldQ === 'guard-stop-coal1' ? 'guard-stop-coal2' : 'guard-stop-coal1';
  q.to(1500);
  tabTo(q.doc, q.$(nextQ));
  assert.deepEqual(considers(q.a), [heldQ], 'a lifted guard still wins');
  q.to(1000 + GUARD_MS + 1);
  assert.deepEqual(considers(q.a), [heldQ, nextQ], 'the cover dropped: the focused guard, not the hold');
  // ... but a guard that had the focus before the key lift does not: the lift is the later act
  const r = considerDesk(true);
  tabTo(r.doc, r.$('guard-start-coal1'));   // in the COAL slot, so X reaches the station
  assert.deepEqual(considers(r.a), ['guard-start-coal1']);
  r.to(1500);
  tap(r, 'x');
  const heldR = considers(r.a).at(-1);
  assert.match(heldR, /^guard-stop-coal\d$/);
  r.to(1500 + GUARD_MS + 100);
  assert.deepEqual(considers(r.a), ['guard-start-coal1', heldR], 'held over the older focus');
  r.to(1500 + GUARD_MS + CONSIDER_HOLD_MS + 1);
  assert.deepEqual(considers(r.a), ['guard-start-coal1', heldR, 'guard-start-coal1']);
});

test('C-10 consider with a mouse: the focus a click leaves on a guard is not the keyboard\'s, so the target clears when the pointer leaves, the cover drops or the press commits', () => {
  // a browser focuses a button on a click and leaves it document.activeElement after the pointer has gone
  const m = considerDesk(false);
  const {$, a, doc, to, gs, gx, unit} = m;
  // one click (a lift), the pointer moves away, the cover drops
  $(gx).dispatch('pointerenter');
  mouseClick(doc, $(gx));
  assert.equal(doc.activeElement, $(gx), 'the fixture: the click left the focus on the guard');
  assert.deepEqual(considers(a), [gx]);
  $(gx).dispatch('pointerleave');
  to();
  assert.deepEqual(considers(a), [gx], 'lifted: still the one');
  to(1000 + GUARD_CLICK_MS + 100);
  assert.equal($(gx).getAttribute('aria-pressed'), 'false');
  assert.deepEqual(considers(a), [gx, null], 'the pointer has gone and the cover is down');
  for (let t = 7000; t < 64000; t += 500) to(t);
  assert.equal(doc.activeElement, $(gx));
  assert.deepEqual(considers(a), [gx, null], 'a minute later, the guard still focused by that click');
  // the hover of another guard is not hidden behind that focus
  $('guard-stop-coal4').dispatch('pointerenter');
  assert.deepEqual(considers(a), [gx, null, 'guard-stop-coal4']);
  $('guard-stop-coal4').dispatch('pointerleave');
  to();
  assert.equal(considers(a).at(-1), null);
  // two clicks (a commit): the input goes, the target clears when the pointer leaves and stays clear
  a.uis.length = 0; a.inputs.length = 0;
  to(70000);
  $(gs).dispatch('pointerenter');
  mouseClick(doc, $(gs));
  to(70300);
  mouseClick(doc, $(gs));
  assert.deepEqual(a.inputs, [{type: 'start', unit}]);
  assert.deepEqual(considers(a), [gs], 'committed with the pointer still on it: hovered');
  $(gs).dispatch('pointerleave');
  to();
  assert.deepEqual(considers(a), [gs, null]);
  for (let t = 71000; t < 131000; t += 500) to(t);
  assert.equal(doc.activeElement, $(gs));
  assert.deepEqual(considers(a), [gs, null], 'a minute after a mouse START the objective line is the objective again');
  // the window goes away and comes back (a blur event, then a focus event, the guard the document's focused element throughout): still the pointer's
  $(gs).dispatch('blur');
  for (let i = 0; i < 5; i++) to();
  $(gs).dispatch('focus');
  for (let i = 0; i < 5; i++) to();
  assert.deepEqual(considers(a), [gs, null]);
  // a guard the keyboard had focused, then clicked: the pointer has it from the press on
  const k = considerDesk(false);
  tabTo(k.doc, k.$(k.gx));
  assert.deepEqual(considers(k.a), [k.gx]);
  k.$(k.gx).dispatch('pointerenter');
  mouseClick(k.doc, k.$(k.gx));
  k.$(k.gx).dispatch('pointerleave');
  k.to(1000 + GUARD_CLICK_MS + 100);
  assert.deepEqual(considers(k.a), [k.gx, null]);
  // ... and it is the keyboard's again once the keyboard uses it: Enter on the guard lifts it, and after the drop it stays
  press(k, 'Enter'); release(k, 'Enter');
  assert.equal(k.$(k.gx).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(considers(k.a), [k.gx, null, k.gx]);
  k.to(1000 + 2 * GUARD_CLICK_MS + 300);
  assert.equal(k.$(k.gx).getAttribute('aria-pressed'), 'false');
  for (let t = 12000; t < 26000; t += 500) k.to(t);
  assert.deepEqual(considers(k.a), [k.gx, null, k.gx], 'focused by the keyboard: considered until the focus moves');
  // ... or comes back to it: Tab away and Shift+Tab back
  const b = considerDesk(false);
  mouseClick(b.doc, b.$(b.gx));
  b.to(1000 + GUARD_CLICK_MS + 100);
  assert.deepEqual(considers(b.a), [b.gx, null]);
  tabTo(b.doc, b.$('lever-coal'));
  b.to();
  tabTo(b.doc, b.$(b.gx));
  assert.deepEqual(considers(b.a), [b.gx, null, b.gx]);
  // a touch: the pointer comes up and leaves before the compatibility mouse events focus the button
  const t = considerDesk(false);
  const g = t.$(t.gx);
  g.dispatch('pointerenter'); g.dispatch('pointerdown'); t.to(1400); g.dispatch('pointerup'); g.dispatch('pointerleave');
  g.focus(); g.click();
  t.to(1400 + GUARD_CLICK_MS + 100);
  assert.equal(t.doc.activeElement, g);
  assert.deepEqual(considers(t.a), [t.gx, null], 'a tap is a pointer press too');
  // a press that never became a focus (a browser that does not focus buttons on a click; the pointer dragged off):
  // the keyboard reaching that guard later is the keyboard's
  const s = considerDesk(false);
  s.$(s.gx).dispatch('pointerdown'); s.$(s.gx).dispatch('pointerup');
  s.to(1000 + PRESS_FOCUS_MS + 100);
  tabTo(s.doc, s.$(s.gx));
  assert.deepEqual(considers(s.a), [s.gx]);
  // the rule itself, off the desk
  let now = 0;
  const said = [], c = makeConsider(() => now, makeGuards(() => now), x => said.push(x));
  c.press('a'); c.focus('a', true); c.up('a'); c.focusIs('a'); c.tick();
  assert.deepEqual(said, [], 'pressed, focused by the press: not considered');
  c.keyboard('a'); c.focusIs('a'); c.tick();
  assert.deepEqual(said, ['a']);
  c.focus('a', false); c.focusIs(null); c.tick();
  assert.deepEqual(said, ['a', null]);
});

test('C-10 consider: one change of target is one message: Tab between guards, the pointer crossing, a window that loses the focus; a new day says the target again', () => {
  const m = considerDesk(false);
  const {$, a, doc, to, gs, gx, vm} = m;
  // Tab from one guard to the next: blur, then focus, and no null between
  tabTo(doc, $(gs));
  tabTo(doc, $(gx));
  to();
  assert.deepEqual(considers(a), [gs, gx]);
  tabTo(doc, $('lever-coal'));
  to();
  assert.deepEqual(considers(a), [gs, gx, null]);
  // the pointer crossing from a machine's START to its STOP
  $(gs).dispatch('pointerenter'); $(gs).dispatch('pointerleave'); $(gx).dispatch('pointerenter');
  to();
  $(gx).dispatch('pointerleave');
  to();
  assert.deepEqual(considers(a), [gs, gx, null, gs, gx, null]);
  // the window stops being the active one: the guard gets a blur event and stays the document's focused element.
  // It keeps the target (it is the focused guard again the moment the window is back), and nothing is sent.
  a.uis.length = 0;
  tabTo(doc, $(gx));
  to();
  $(gx).dispatch('blur');
  for (let i = 0; i < 10; i++) to();
  assert.equal(doc.activeElement, $(gx));
  assert.deepEqual(considers(a), [gx]);
  // a new day: the shell cleared its copy (app/game.js resetDay), so the desk says the present target again, once
  const day2 = Object.assign({}, vm, {obs: Object.assign({}, vm.obs, {tick: 0})});
  m.desk.update(at(day2, m.now() + 16));
  m.desk.update(at(day2, m.now() + 32));
  assert.deepEqual(considers(a), [gx, gx]);
  // with nothing considered a new day sends nothing (never an initial null)
  const e = considerDesk(false);
  e.desk.update(at(Object.assign({}, e.vm, {obs: Object.assign({}, e.vm.obs, {tick: 0})}), 2000));
  assert.deepEqual(considers(e.a), []);
});

test('K-11 on a real over-frequency (2a): with the potline off at a mild noon the inverters back off, the bar still balances and names them', () => {
  const st = noonState();
  while (st.tick % TPS !== 0) step(st);
  fleet.tripSmelter(st, 2700, []);
  for (let k = 0; k < 2 * TPS; k++) step(st);
  const o = observe(st), b = o.balance;
  assert.ok(o.f.hz > 50.05, 'a 256-MW load loss: ' + o.f.hz.toFixed(3) + ' Hz');
  assert.ok(b.renPfrMW + b.roofPfrMW > 50, 'wind and solar are backing off: ' + (b.renPfrMW + b.roofPfrMW).toFixed(0) + ' MW');
  const seg = C.imbalanceSegments(b);
  assert.equal(seg.inverterMW, 0 - (b.renPfrMW + b.roofPfrMW));
  assert.ok(Math.abs(seg.sumMW - b.imbalanceMW) <= 1 && Math.abs(seg.sumMW + seg.inertiaMW) <= 1 && Math.abs(seg.schedMW + seg.borrowedMW) <= 1);
  const lay = barLayout(seg), inv = lay.segs.find(x => x.k === 'inverterMW');
  const right = lay.segs.filter(x => x.mw > 0).reduce((a, x) => a + x.width, 0), left = lay.segs.filter(x => x.mw < 0).reduce((a, x) => a + x.width, 0);
  assert.ok(Math.abs(right - left) <= 1 / lay.scale * 50 + 1e-9, 'the bar balances about zero: ' + right + ' / ' + left);
  assert.ok(inv.width > 0 && inv.left < 50 && inv.letter === 'V', 'the inverters stack left of zero');
  assert.equal(barScale(seg), lay.scale);
  // the roofs' half (renPfrMW + roofPfrMW): the tie tripping at its 300-MW export in the same second takes the
  // frequency past 50.25 Hz, where rooftop inverters start to back off (AS/NZS 4777.2) and hold what they reached
  const st2 = noonState();
  while (st2.tick % TPS !== 0) step(st2);
  fleet.tripSmelter(st2, 2700, []);
  fleet.tripTie(st2, 'test', 2700, []);
  for (let k = 0; k < 2 * TPS; k++) step(st2);
  const o2 = observe(st2), b2 = o2.balance, seg2 = C.imbalanceSegments(b2);
  assert.ok(o2.f.hz > V.ROOF_FW_START_HZ, 'a load loss and the export lost together: ' + o2.f.hz.toFixed(3) + ' Hz');
  assert.ok(b2.roofPfrMW > 20 && b2.renPfrMW > 50, 'the roofs back off ' + b2.roofPfrMW.toFixed(0) + ' MW, wind and the solar farm ' + b2.renPfrMW.toFixed(0) + ' MW');
  assert.equal(seg2.inverterMW, 0 - (b2.renPfrMW + b2.roofPfrMW));
  assert.ok(Math.abs(seg2.sumMW - b2.imbalanceMW) < 1e-6 && Math.abs(seg2.sumMW + seg2.inertiaMW) < 1e-6 && Math.abs(seg2.schedMW + seg2.borrowedMW) < 1e-6,
    'the identity closes only with both halves: ' + (seg2.sumMW - b2.imbalanceMW) + ', ' + (seg2.sumMW + seg2.inertiaMW) + ', ' + (seg2.schedMW + seg2.borrowedMW));
  const lay2 = barLayout(seg2), inv2 = lay2.segs.find(x => x.k === 'inverterMW');
  assert.ok(Math.abs(inv2.width - (b2.renPfrMW + b2.roofPfrMW) / lay2.scale * 50) < 1e-9, 'the segment is as wide as both');
  const right2 = lay2.segs.filter(x => x.mw > 0).reduce((a, x) => a + x.width, 0), left2 = lay2.segs.filter(x => x.mw < 0).reduce((a, x) => a + x.width, 0);
  assert.ok(Math.abs(right2 - left2) < 1e-6, 'the bar balances about zero: ' + right2 + ' / ' + left2);
  const el2 = mount(at(baseVm(o2), 1000)).$('bar-imbalance').querySelector('.dk-seg-inv');
  assert.equal(el2.getAttribute('title'), 'solar and wind −' + Math.round(b2.renPfrMW + b2.roofPfrMW) + ' MW');
  // on the desk: its own segment, lettered, patterned and titled; in the text alternative
  const {$} = mount(at(baseVm(o), 1000));
  const el = $('bar-imbalance').querySelector('.dk-seg-inv');
  assert.equal(el.textContent, 'V');
  assert.equal(el.classList.contains('neg'), true);
  assert.match(el.getAttribute('title'), /^solar and wind −\d+ MW$/);
  assert.match($('bar-imbalance').getAttribute('aria-label'), /wind and solar backing off −\d+ MW/);
  assert.match(CSS, /\.dk-seg-inv \{ background: repeating-linear-gradient\(90deg/, 'upright bars: told from the four diagonal fills by pattern');
  // with no back-off they say nothing
  const calm = vmAt(13);
  Object.assign(calm.obs.balance, {renPfrMW: 0, roofPfrMW: 0});
  assert.ok(!/backing off/.test(mount(at(calm, 1000)).$('bar-imbalance').getAttribute('aria-label')));
  // caught: the word for the inverters' part of a preview
  assert.equal(caughtText({inertiaMW: 100, governorsMW: 300, inverterMW: 119, uflsMW: 0}), 'GOV 300 · INVERTERS 119 · SPIN 100');
  assert.equal(caughtText({inertiaMW: 100, inverterMW: -253}), 'SPIN 100', 'a loss of load is not what TRIP PREVIEW previews');
});

test('P-12 on the dial (2a): the SHED mark shows the dark customers\' load (unservedMW), not the relay MW, which is zero or less with a net exporter dark', () => {
  const st = noonState();
  while (st.tick % TPS !== 0) step(st);
  const lit = observe(st);
  const sol = lit.districts.filter(d => d.suburb === 'SOL' && d.coldLoadMW < 0);
  assert.ok(sol.length >= 1, 'Solstice Rise is feeding back at this noon: ' + lit.districts.filter(d => d.suburb === 'SOL').map(d => d.coldLoadMW.toFixed(0)).join(', '));
  assert.equal(shedMarkMW(lit), 0);
  assert.equal(mount(at(baseVm(lit), 1000)).$('bar-imbalance').querySelector('.dk-imb-shed').hidden, true);
  fleet.setDistrictDark(st, st.city.districts.findIndex(d => d.id === sol[0].id), true, 'directed');
  for (let k = 0; k < 2 * TPS; k++) step(st);
  const o = observe(st);
  assert.ok(o.balance.shedMW <= 0 && o.demand.shedMW <= 0, 'the relays took off a net exporter: ' + o.balance.shedMW.toFixed(1) + ' MW');
  assert.ok(o.demand.unservedMW > 100, 'its customers are dark: ' + o.demand.unservedMW.toFixed(0) + ' MW');
  assert.equal(shedMarkMW(o), o.demand.unservedMW);
  const {$} = mount(at(baseVm(o), 1000));
  const mark = $('bar-imbalance').querySelector('.dk-imb-shed');
  assert.equal(mark.hidden, false);
  assert.equal(mark.textContent, '✕ SHED ' + Math.round(o.demand.unservedMW) + ' MW');
  assert.match($('bar-imbalance').getAttribute('aria-label'), new RegExp('; shed ' + Math.round(o.demand.unservedMW) + ' MW$'));
  // the bar tolerates the negative relay MW: its scale and its segments are what they were without it
  const seg = C.imbalanceSegments(o.balance), flat = Object.assign({}, seg, {shedMW: 0});
  assert.ok(seg.shedMW <= 0);
  assert.deepEqual(barLayout(seg), barLayout(flat));
  assert.ok(barLayout(seg).segs.every(x => x.width >= 0 && x.left >= 0 && x.left + x.width <= 100 + 1e-9));
  const deep = Object.assign({}, seg, {shedMW: -5000});   // far more than the segments: still no room asked for it
  assert.equal(barScale(deep), barScale(flat));
  assert.deepEqual(barLayout(deep), barLayout(flat));
  assert.ok(barScale(Object.assign({}, seg, {shedMW: 5000})) > barScale(flat), 'a positive one still sets the scale');
  // the feeder row reads the sim's pickup (the underlying load x 1 or 1.5), far above the district's share of operational demand
  const od = o.districts.find(d => d.id === sol[0].id), cl = C.coldLoad(od, o.s);
  assert.equal(cl.mw, od.coldLoadMW);
  assert.ok(cl.mw > o.demand.nowMW * od.share + 50, 'pickup ' + cl.mw.toFixed(0) + ' MW against ' + (o.demand.nowMW * od.share).toFixed(0) + ' MW of operational demand');
  // ... on its feeder row and on its breaker's label, the same number
  const bayM = mount(at(baseVm(o), 1000));
  bayM.desk.focus('bay-restore');
  bayM.desk.update(at(baseVm(o), 1016));
  const brk = bayM.$('restore-' + od.id);
  assert.match(brk.parentElement.querySelector('.dk-feeder-mw').textContent, new RegExp('^' + Math.round(od.coldLoadMW) + ' MW ×' + V.COLD_LOAD_FACTOR + ' in \\d+:\\d\\d$'));
  assert.ok(brk.getAttribute('aria-label').includes('(' + Math.round(od.coldLoadMW) + ' MW cold load)'), brk.getAttribute('aria-label'));
  // a view from before Phase 2a (no unservedMW): the relay MW, never below zero
  const old = clone(o);
  delete old.demand.unservedMW;
  assert.equal(shedMarkMW(old), 0);
  old.balance.shedMW = 180;
  assert.equal(shedMarkMW(old), 180);
});

test('K-7 / M-2: DIRECT SHED names the district the sim will shed and its load; "about 0 MW" when it has none to give', () => {
  // the rule against the sim: at a mild noon, each press takes the district the desk named
  const st = noonState();
  while (st.tick % TPS !== 0) step(st);
  st.sec.level = 'SHORT';   // A-3: the key works only in a shortfall (test poke of the gauge)
  let passed = 0;
  for (let n = 0; n < 6; n++) {
    const o = observe(st), want = C.nextShed(o.districts);
    const rot = o.districts.filter(d => d.rot >= 0 && !d.dark);
    const oldRule = rot.slice().sort((x, y) => x.restoredAtS - y.restoredAtS || x.rot - y.rot)[0];
    if (oldRule.id !== want.id) { passed++; assert.ok(oldRule.coldLoadMW <= 0 && want.coldLoadMW > 0, 'passed over ' + oldRule.id + ' at ' + oldRule.coldLoadMW.toFixed(0) + ' MW'); }
    const out = [];
    assert.equal(applyInput(st, {type: 'directShed'}, out).ok, true);
    const rec = out.find(r => r.kind === 'shed');
    assert.equal(rec.district, want.id, 'press ' + (n + 1));
    assert.ok(Math.abs(rec.mw - want.coldLoadMW) < 1e-9);
    assert.deepEqual(shedText(o), {id: want.id, text: want.id + ', about ' + Math.round(want.coldLoadMW) + ' MW'});
  }
  assert.ok(passed >= 1, 'a district feeding back was passed over at least once');
  // on the key: the district and its MW, in the face and in the label
  const o = observe(st);
  const {$} = mount(at(baseVm(o), 1000));
  const next = C.nextShed(o.districts);
  assert.equal($('key-shed').hidden, false);
  assert.match($('key-shed').textContent, new RegExp(next.id + ', about ' + Math.round(next.coldLoadMW) + ' MW'));
  assert.match($('key-shed').getAttribute('aria-label'), new RegExp('sheds district ' + next.id + ', about \\d+ MW, the next in rotation'));
  // lifting the cover says the same before anything is committed
  const liveOf = d => d.el.querySelector('.dk-live').textContent;
  const lit = mount(at(baseVm(o), 1000));
  lit.$('key-shed').dispatch('pointerdown'); lit.$('key-shed').dispatch('pointerup');
  assert.equal(liveOf(lit.desk), 'DIRECT SHED cover lifted: sheds ' + next.id + ', about ' + Math.round(next.coldLoadMW) + ' MW. Hold to commit.');
  assert.equal(lit.actions.inputs.length, 0);
  // none of the lit rotation districts has load to give: the old order, and "about 0 MW"
  const zero = clone(o);
  for (const d of zero.districts) if (d.rot >= 0 && !d.dark) d.coldLoadMW = -5 - d.rot;
  const first = zero.districts.filter(d => d.rot >= 0 && !d.dark).sort((x, y) => x.restoredAtS - y.restoredAtS || x.rot - y.rot)[0];
  assert.equal(C.nextShed(zero.districts).id, first.id);
  assert.deepEqual(shedText(zero), {id: first.id, text: first.id + ', about 0 MW'});
  first.coldLoadMW = 0.3;
  assert.deepEqual(shedText(zero), {id: first.id, text: first.id + ', about 0 MW'}, 'under half a megawatt is about 0 too');
  assert.match(mount(at(baseVm(zero), 1000)).$('key-shed').textContent, /about 0 MW/);
  // nothing left in the rotation
  const none = clone(o);
  for (const d of none.districts) if (d.rot >= 0) d.dark = true;
  assert.equal(C.nextShed(none.districts), null);
  assert.deepEqual(shedText(none), {id: '', text: 'no lit district left in the rotation'});
  const dark = mount(at(baseVm(none), 1000));
  assert.match(dark.$('key-shed').getAttribute('aria-label'), /sheds nothing: no lit district left in the rotation/);
  assert.equal(dark.$('key-shed').querySelector('.dk-hold-sub').textContent, 'no lit district left in the rotation');
  dark.$('key-shed').dispatch('pointerdown'); dark.$('key-shed').dispatch('pointerup');
  assert.equal(liveOf(dark.desk), 'DIRECT SHED cover lifted: sheds nothing, no lit district left in the rotation. Hold to commit.');
  assert.equal(C.nextShed(undefined), null);
  // ties by rotation index, the longest restored first, UFLS-only districts never
  const ds = [{id: 'A', rot: 3, dark: false, restoredAtS: -1, coldLoadMW: 90}, {id: 'B', rot: 1, dark: false, restoredAtS: 500, coldLoadMW: 90},
    {id: 'C', rot: 2, dark: false, restoredAtS: -1, coldLoadMW: 90}, {id: 'D', rot: -1, dark: false, restoredAtS: -1, coldLoadMW: 90}, {id: 'E', rot: 0, dark: true, restoredAtS: -1, coldLoadMW: 90}];
  assert.equal(C.nextShed(ds).id, 'C');
});

// ---------------------------------------------------------------- after the owner's playtest: guards you can see, words on the controls

/** GT·C 1 off and startable, CCGT 1 on and stoppable, at EVE (the vm is the caller's to change). */
function playVm(over) {
  const vm = vmAt(EVE, over);
  Object.assign(vm.obs.units.find(u => u.id === 'gtc1'), {mode: 'off', sync: false, startBlock: '', stopBlock: 'unit is off'});
  Object.assign(vm.obs.units.find(u => u.id === 'ccgt1'), {mode: 'on', sync: true, stopBlock: ''});
  return vm;
}
const armedOf = a => a.uis.filter(u => u.do === 'armed');
const liveText = d => d.el.querySelector('.dk-live').textContent;

test('K-3 (playtest): a press on a guard keeps its cover up 5 s; S S keeps 2 s', () => {
  assert.deepEqual([GUARD_MS, GUARD_CLICK_MS, COMMIT_LOCK_MS], [2000, 5000, 1000]);
  let now = 0, n = 0;
  const g = makeGuards(() => now), commit = () => n++;
  assert.equal(g.press('a', commit, GUARD_CLICK_MS), 'lift');
  now = 4900;
  assert.equal(g.press('a', commit, GUARD_CLICK_MS), 'commit', 'a second press 4.9 s later commits');
  assert.equal(n, 1);
  now = 10000; g.press('a', commit, GUARD_CLICK_MS);
  now = 15100;
  assert.equal(g.lifted('a'), false);
  assert.equal(g.press('a', commit, GUARD_CLICK_MS), 'lift', '5.1 s later: lifts again');
  assert.equal(n, 1);
  // the default window is the keys' 2 s
  now = 20000; g.press('b', commit);
  now = 22100;
  assert.equal(g.press('b', commit), 'lift');
  now = 23900;
  assert.equal(g.press('b', commit), 'commit');
  assert.equal(n, 2);
});

test('K-3 (playtest): one click arms START where it shows and tells the shell; a click 3 s later starts; one click alone never does', () => {
  const vm = playVm();
  const gs = 'guard-start-gtc1', {$, desk, actions: a} = mount(at(vm, 1000));
  $(gs).click();
  assert.equal(a.inputs.length, 0, 'one click sends nothing');
  assert.equal($(gs).textContent, 'START?');
  assert.ok($(gs).classList.contains('lifted') && !$(gs).classList.contains('key'), 'lifted, with the 5-s bar');
  assert.ok($(gs).parentElement.classList.contains('armed'), 'its row is armed (desk.css gives the lifted guard the row)');
  assert.match($(gs).getAttribute('aria-label'), /START armed, press again to start/);
  assert.equal(liveText(desk), 'GT·C 1 START armed: press again within 5 s');
  assert.deepEqual(armedOf(a), [{do: 'armed', target: gs, on: true}]);
  // 3 s on the desk clock: still armed; the second click starts it, and the shell hears the cover drop once
  desk.update(at(vm, 4000));
  assert.equal($(gs).getAttribute('aria-pressed'), 'true');
  $(gs).click();
  assert.deepEqual(a.inputs, [{type: 'start', unit: 'gtc1'}]);
  assert.deepEqual(armedOf(a), [{do: 'armed', target: gs, on: true}, {do: 'armed', target: gs, on: false}]);
  assert.equal(liveText(desk), 'GT·C 1 START sent');
  desk.update(at(vm, 4016));
  assert.equal(armedOf(a).length, 2);
  // a third click inside 1 s does nothing at all (the unit is still OFF in this mock: it would arm again)
  desk.update(at(vm, 4500));
  $(gs).click();
  assert.equal(a.inputs.length, 1);
  assert.equal(armedOf(a).length, 2);
  assert.notEqual($(gs).textContent, 'START?');
  // one click alone: the cover drops after 5 s, nothing is sent, and the shell is told
  const b = mount(at(vm, 1000));
  b.$(gs).click();
  b.desk.update(at(vm, 1000 + GUARD_CLICK_MS - 100));
  assert.equal(b.$(gs).textContent, 'START?');
  b.desk.update(at(vm, 1000 + GUARD_CLICK_MS + 100));
  assert.equal(b.actions.inputs.length, 0);
  assert.equal(b.$(gs).textContent, MODE_GLYPH.off + '1');
  assert.ok(!b.$(gs).parentElement.classList.contains('armed'));
  assert.deepEqual(armedOf(b.actions).map(u => u.on), [true, false]);
  // S S keeps its 2 s (and its 2-s bar): S, then S 2.1 s later, only arms again
  const c = mount(at(vm, 1000));
  tap(c, '5'); tap(c, 's');
  assert.ok(c.$(gs).classList.contains('key'));
  c.desk.update(at(vm, 3100));
  tap(c, 's');
  assert.equal(c.actions.inputs.length, 0);
});

test('K-3 (playtest): STOP? on a running unit; a third click inside 1 s of the stop is no ABORT; a cover whose action has gone drops', () => {
  const vm = playVm();
  const gx = 'guard-stop-ccgt1', {$, desk, actions: a} = mount(at(vm, 1000));
  $(gx).click();
  assert.equal($(gx).textContent, 'STOP?');
  desk.update(at(vm, 3000));
  $(gx).click();
  assert.deepEqual(a.inputs, [{type: 'stop', unit: 'ccgt1'}]);
  vm.obs.units.find(u => u.id === 'ccgt1').mode = 'unloading';   // the stop under way: STOP is now a one-press ABORT
  desk.update(at(vm, 3200));
  assert.equal($(gx).textContent, '↺');
  $(gx).click();
  assert.equal(a.inputs.length, 1, 'no ABORT within 1 s of the stop');
  desk.update(at(vm, 3000 + COMMIT_LOCK_MS));
  $(gx).click();
  assert.deepEqual(a.inputs.at(-1), {type: 'abortStop', unit: 'ccgt1'}, 'after it, ABORT is one press');
  assert.equal(liveText(desk), 'CCGT 1 ABORT sent');
  // the ABORT locks the unit's guards for 1 s too: the unit back on, a click inside it does not arm STOP?
  vm.obs.units.find(u => u.id === 'ccgt1').mode = 'on';
  desk.update(at(vm, 4000 + COMMIT_LOCK_MS / 2));
  $(gx).click();
  assert.equal($(gx).textContent, '■');
  assert.equal(a.inputs.length, 2);
  desk.update(at(vm, 4000 + COMMIT_LOCK_MS));
  $(gx).click();
  assert.equal($(gx).textContent, 'STOP?');
  // a refused input locks nothing: the next click arms again at once
  const nope = mount(at(playVm(), 1000), mockActions({refuse: x => (x.type === 'start' ? 'no fuel' : '')}));
  nope.$('guard-start-gtc1').click(); nope.$('guard-start-gtc1').click();
  assert.deepEqual(nope.actions.inputs, [{type: 'start', unit: 'gtc1'}]);
  nope.$('guard-start-gtc1').click();
  assert.equal(nope.$('guard-start-gtc1').textContent, 'START?');
  // armed, then the unit moves on by itself (here the plan starts it): the cover drops and the shell is told
  const v2 = playVm(), m = mount(at(v2, 1000));
  m.$('guard-start-gtc1').click();
  v2.obs.units.find(u => u.id === 'gtc1').mode = 'starting';
  m.desk.update(at(v2, 1100));
  assert.equal(m.$('guard-start-gtc1').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(armedOf(m.actions).map(u => u.on), [true, false]);
  m.$('guard-start-gtc1').click();
  assert.equal(m.actions.inputs.length, 0, 'a press now explains (starting) and sends nothing');
});

/**
 * Whether desk.css (or [hidden]) stops element e being drawn, as a browser would see it: a browser blurs a
 * focused element that stops being rendered, and the stand-in DOM draws nothing. Selectors: compounds of a
 * tag or *, .class, :not(.class) and [hidden], joined by ' ' or ' > '; any other selector does not match.
 */
function cssHides(e, css = CSS) {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^{}]*\}/g).filter(r => /display:\s*none/.test(r));
  const compound = (n, c) => {
    const tag = /^(\*|[a-z]+)/.exec(c);
    if (tag && tag[1] !== '*' && n.tagName !== tag[1].toUpperCase()) return false;
    const rest = tag ? c.slice(tag[1].length) : c, parts = rest.match(/:not\(\.[\w-]+\)|\.[\w-]+|\[hidden\]|[:[].*/g) || [];
    return parts.join('') === rest && parts.every(p => p.startsWith(':not(') ? !n.classList.contains(p.slice(6, -1)) :
      p.startsWith('.') ? n.classList.contains(p.slice(1)) : p === '[hidden]' ? n.hidden : false);
  };
  const sel = (n, parts, i) => n && n.classList && compound(n, parts[i]) && (i === 0 ||
    (parts[i - 1] === '>' ? sel(n.parentElement, parts, i - 2) : (() => { for (let p = n.parentElement; p; p = p.parentElement) if (sel(p, parts, i - 1)) return true; return false; })()));
  for (let n = e; n; n = n.parentElement) {
    if (n.hidden) return true;
    for (const r of rules) for (const s of r.slice(0, r.indexOf('{')).split(',')) { const p = s.trim().split(/\s+/); if (sel(n, p, p.length - 1)) return true; }
  }
  return false;
}

test('K-3 (playtest): an armed guard takes its row; the row\'s other guard folds away but stays drawn and focused, so S S and X X from it commit', () => {
  const vm = playVm();
  Object.assign(vm.obs.units.find(u => u.id === 'ccgt2'), {mode: 'off', sync: false, startBlock: 'minimum down time: 9 min left', stopBlock: 'unit is off'});
  const m = mount(at(vm, 1000));
  const frame = t => { m.desk.update(at(vm, t)); const f = m.doc.activeElement; if (f && cssHides(f)) f.blur(); };
  assert.ok(cssHides(m.$('ring-guard').parentElement.parentElement.querySelector('.dk-full')), 'the helper sees [hidden]');
  // the focus on GT·C 1's STOP (nothing to stop): S arms its START, which takes the row
  m.$('guard-stop-gtc1').focus();
  tap(m, 's');
  frame(1100);
  assert.equal(m.$('guard-start-gtc1').textContent, 'START?');
  assert.ok(!cssHides(m.$('guard-stop-gtc1')), 'the folded guard is still drawn');
  assert.equal(m.doc.activeElement.id, 'guard-stop-gtc1', 'and keeps the focus');
  assert.ok(cssHides(m.$('guard-stop-gtc1'), '.dk-mach.armed > .dk-guard:not(.lifted) { display: none; }'), 'the helper sees a rule that would hide it');
  tap(m, 's');
  assert.deepEqual(m.actions.inputs, [{type: 'start', unit: 'gtc1'}]);
  // the focus on a running CCGT 1's START: X arms its STOP, which takes the row; X again stops it
  m.$('guard-start-ccgt1').focus();
  frame(3000);
  tap(m, 'x');
  frame(3100);
  assert.equal(m.$('guard-stop-ccgt1').textContent, 'STOP?');
  assert.equal(m.doc.activeElement.id, 'guard-start-ccgt1');
  tap(m, 'x');
  assert.deepEqual(m.actions.inputs.at(-1), {type: 'stop', unit: 'ccgt1'});
});

test('K-3 (playtest, last round): the folded guard leaves the Tab order, and Enter or a click on it presses its row\'s armed guard', () => {
  const vm = playVm();
  Object.assign(vm.obs.units.find(u => u.id === 'coal1'), {mode: 'ready', sync: false, timerS: 192});
  const m = mount(at(vm, 1000)), $ = m.$, tab = id => $(id).getAttribute('tabindex');
  const refusals = () => m.desk.el.querySelectorAll('.dk-note').filter(n => !n.hidden && !n.classList.contains('info')).map(n => n.textContent);
  // S from GT·C 1's STOP (nothing to stop) arms its START: the STOP folds out of the Tab order (Tab from START? goes
  // on to the next row, not to a guard with no width) but keeps the focus, so S S still commits from it
  assert.deepEqual([tab('guard-start-gtc1'), tab('guard-stop-gtc1')], ['0', '0']);
  $('guard-stop-gtc1').focus();
  tap(m, 's');
  assert.equal($('guard-start-gtc1').textContent, 'START?');
  assert.deepEqual([tab('guard-start-gtc1'), tab('guard-stop-gtc1')], ['0', '-1']);
  assert.equal(m.doc.activeElement.id, 'guard-stop-gtc1');
  // Enter on it starts the unit: it presses the START? the row shows, not the hidden STOP (a red 'nothing to stop')
  assert.equal(tap(m, 'Enter'), true);
  assert.deepEqual(m.actions.inputs, [{type: 'start', unit: 'gtc1'}]);
  assert.deepEqual(refusals(), []);
  m.desk.update(at(vm, 1100));
  assert.deepEqual([tab('guard-start-gtc1'), tab('guard-stop-gtc1')], ['0', '0'], 'the cover is down: both in the Tab order again');
  // CANCEL? armed on a READY unit: Enter on its folded START cancels the start; it does not open the synchroscope
  $('guard-stop-coal1').click();
  assert.equal($('guard-stop-coal1').textContent, 'CANCEL?');
  assert.equal(tab('guard-start-coal1'), '-1');
  $('guard-start-coal1').focus();
  tap(m, 'Enter');
  assert.deepEqual(m.actions.inputs.at(-1), {type: 'stop', unit: 'coal1'});
  assert.equal(inputsOf(m.actions, 'scope').length, 0);
  // any other activation of the folded guard (Space on a focused button, a screen reader's click) is the same press
  $('guard-stop-ccgt1').click();
  assert.equal($('guard-stop-ccgt1').textContent, 'STOP?');
  $('guard-start-ccgt1').click();
  assert.deepEqual(m.actions.inputs.at(-1), {type: 'stop', unit: 'ccgt1'});
  assert.deepEqual(refusals(), []);
});

test('K-3 (playtest, last round): a hydro unit unloaded because its water is spent offers no ABORT, and says why', () => {
  const vm = playVm();
  Object.assign(vm.obs.units.find(u => u.id === 'hydro1'), {mode: 'unloading', sync: true});
  vm.obs.hydro.storageMWh = V.HYDRO_STOP_MWH;   // the sim's abortStop refuses at or below it: 'no water'
  const {$, actions: a} = mount(at(vm, 1000)), gx = $('guard-stop-hydro1');
  const dry = 'HYDRO 1 UNLOADING: no water to keep it on';
  assert.equal(gx.textContent, '·', 'no ↺');
  assert.equal(gx.getAttribute('title'), dry);
  assert.equal(gx.getAttribute('aria-label'), 'HYDRO 1: no stop, no water to keep it on');
  assert.equal(gx.getAttribute('aria-disabled'), 'true');
  gx.click();
  assert.equal(a.inputs.length, 0);
  assert.equal(gx.parentElement.querySelector('.dk-note').textContent, dry);
  // shut down and dry: the same; with water above the line, the one-press ABORT as before
  Object.assign(vm.obs.units.find(u => u.id === 'hydro1'), {mode: 'shutdown'});
  vm.obs.hydro.storageMWh = 0;
  assert.equal(mount(at(vm, 1000)).$('guard-stop-hydro1').getAttribute('title'), 'HYDRO 1 SHUTDOWN: no water to keep it on');
  vm.obs.hydro.storageMWh = V.HYDRO_STOP_MWH + 1;
  const w = mount(at(vm, 1000)), wx = w.$('guard-stop-hydro1');
  assert.equal(wx.textContent, '↺');
  assert.equal(wx.getAttribute('title'), 'ABORT: one click puts HYDRO 1 back on');
  wx.click();
  assert.deepEqual(w.actions.inputs, [{type: 'abortStop', unit: 'hydro1'}]);
});

test('K-3 (playtest): one cover is up at a time, and a new day drops the cover and the commit lock', () => {
  const vm = playVm();
  Object.assign(vm.obs.units.find(u => u.id === 'gtc2'), {mode: 'off', sync: false, startBlock: '', stopBlock: 'unit is off'});
  const g1 = 'guard-start-gtc1', g2 = 'guard-start-gtc2', {$, desk, actions: a} = mount(at(vm, 1000));
  // select-before-operate holds one selection: arming GT·C 2 drops GT·C 1's cover (drawn, and told to the shell, by the
  // next frame), so the shell's one armed id is always the cover that is up
  $(g1).click();
  desk.update(at(vm, 2000));
  $(g2).click();
  desk.update(at(vm, 2016));
  assert.equal($(g2).textContent, 'START?');
  assert.notEqual($(g1).textContent, 'START?');
  assert.ok(!$(g1).parentElement.classList.contains('armed'));
  assert.deepEqual(armedOf(a).map(u => u.target + ':' + u.on), [g1 + ':true', g2 + ':true', g1 + ':false']);
  // a click on GT·C 1 now arms it again (and drops GT·C 2): it never commits a cover that was dropped
  desk.update(at(vm, 2500));
  $(g1).click();
  desk.update(at(vm, 2516));
  assert.equal(a.inputs.length, 0);
  assert.equal($(g1).textContent, 'START?');
  assert.notEqual($(g2).textContent, 'START?');
  assert.deepEqual(armedOf(a).slice(-2).map(u => u.target + ':' + u.on), [g1 + ':true', g2 + ':false']);
  // a new day (obs.tick back to 0): the cover goes down and the shell is told
  const day2 = playVm();
  day2.obs.tick = 0;
  desk.update(at(day2, 3000));
  assert.notEqual($(g1).textContent, 'START?');
  assert.deepEqual(armedOf(a).at(-1), {do: 'armed', target: g1, on: false});
  $(g1).click();
  assert.equal(a.inputs.length, 0, 'one click on the new day only arms');
  // ... and a commit just before the day ends does not lock the new day's first press
  const b = mount(at(vm, 1000));
  b.$(g1).click(); b.$(g1).click();
  assert.deepEqual(b.actions.inputs, [{type: 'start', unit: 'gtc1'}]);
  b.desk.update(at(day2, 1200));
  b.$(g1).click();
  assert.equal(b.$(g1).textContent, 'START?', 'the lock went with the day');
});

test('K-3 / K-23 (playtest): each guard\'s tooltip says how to press it, each lever head shows its key, and the CSS draws the armed face', () => {
  const vm = playVm();
  const set = (id, o) => Object.assign(vm.obs.units.find(u => u.id === id), o);
  set('ccgt2', {mode: 'off', sync: false, startBlock: '', stopBlock: 'unit is off'});
  set('gtc2', {mode: 'off', sync: false, startBlock: 'minimum down time: 29 min left'});
  set('gtb1', {mode: 'starting', sync: false, timerS: 300});
  set('gtb2', {mode: 'unloading', sync: true});
  set('hydro1', {mode: 'off', sync: false, startBlock: ''});
  set('gta1', {mode: 'on', sync: true, stopBlock: 'minimum up time: 30 min left'});
  set('coal1', {mode: 'ready', sync: false, timerS: 192});
  const {$} = mount(at(vm, 1000));
  const title = id => $(id).getAttribute('title'), aria = id => $(id).getAttribute('aria-label');
  assert.equal(title('guard-start-ccgt2'), 'START CCGT 2: click, then click START? to confirm (keys: 2, S S)');
  assert.equal(title('guard-start-hydro1'), 'START HYDRO 1: click, then click START? to confirm (keys: 6, S S)');
  assert.equal(title('guard-stop-ccgt1'), 'STOP CCGT 1: click, then click again to confirm (keys: 2, X X)');
  assert.equal(title('guard-stop-gtb1'), 'CANCEL START GT·B 1: click, then click again to confirm (keys: 4, X X)');
  assert.equal(title('guard-stop-gtb2'), 'ABORT: one click puts GT·B 2 back on');
  assert.equal(title('guard-start-gtc2'), 'GT·C 2 OFF: minimum down time: 29 min left');
  assert.equal(title('guard-stop-gtc2'), 'GT·C 2: nothing to stop');
  assert.match($('guard-start-ccgt2').getAttribute('aria-label'), /START \(guarded: press twice within 5 s, or S S within 2 s\)/);
  // held on by its minimum up time: the reason is STOP's (title, label, a press), never START's
  assert.equal(title('guard-stop-gta1'), 'GT·A ON: minimum up time: 30 min left');
  assert.equal(aria('guard-stop-gta1'), 'GT·A: no stop, minimum up time: 30 min left');
  assert.equal(title('guard-start-gta1'), 'GT·A ON');
  assert.doesNotMatch(aria('guard-start-gta1'), /minimum up time/);
  $('guard-stop-gta1').click();
  assert.equal($('guard-stop-gta1').parentElement.querySelector('.dk-note').textContent, 'GT·A ON: minimum up time: 30 min left');
  // one wording for a start under way: its state once, then when it reaches full speed
  assert.equal(title('guard-start-gtb1'), 'GT·B 1 STARTING: full speed in 5:00');
  assert.equal(aria('guard-start-gtb1'), 'GT·B 1 STARTING: full speed in 5:00');
  assert.equal($('guard-start-gtb1').parentElement.getAttribute('title'), 'GT·B 1 · STARTING · full speed in 5:00');
  // READY: AGC auto-syncs it; in HAND the player closes it
  assert.equal(title('guard-start-coal1'), 'SYNC COAL 1: open the synchroscope (auto-sync in 3:12)');
  vm.obs.mode = 'HAND';
  assert.equal(mount(at(vm, 1000)).$('guard-start-coal1').getAttribute('title'), 'SYNC COAL 1: open the synchroscope (HAND: you close it)');
  LEVER_STATIONS.forEach((sid, i) => assert.equal(slotOf($, sid).querySelector('.dk-kcap').textContent, String(i + 1), sid));
  assert.equal(slotOf($, 'ccgt').querySelector('.dk-lever-foot').title, 'SET (white): where the lever is ▸ OUT (orange): what CCGT makes now, MW');
  // the armed face: amber across its row (the other guard folds to no width, still drawn: the next test), a bar that
  // drains (5 s; 2 s by key), held still under reduced motion. '.dk ' outranks next.html's button:hover border.
  assert.match(CSS, /\.dk \.dk-guard\.lifted \{ flex: 1 1 auto; position: relative; background: #d2992244; border-color: var\(--dk-amber\);/);
  assert.match(CSS, /\.dk-mach\.armed \{ gap: 0; \}/);
  assert.match(CSS, /\.dk \.dk-mach\.armed > \.dk-guard:not\(\.lifted\) \{ width: 0; min-width: 0; border-width: 0; overflow: hidden; \}/);
  assert.match(CSS, /\.dk-mach\.armed:has\(> :focus-visible\) > \.lifted \{ outline: 2px solid var\(--dk-blue\);/, 'the folded guard\'s focus shows on the row');
  assert.match(CSS, /\.dk-guard\.lifted::after \{[^}]*animation: dk-drain 5s linear forwards; \}/);
  assert.match(CSS, /\.dk-guard\.lifted\.key::after \{ animation-duration: 2s; \}/);
  assert.match(CSS, /@keyframes dk-drain \{ from \{ width: 100%; \} to \{ width: 0; \} \}/);
  assert.match(CSS, /body\.rm \.dk-guard\.lifted::after, \.dk-rm \.dk-guard\.lifted::after \{ animation: none; \}/);
  assert.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)[1], /\.dk-guard\.lifted::after \{ animation: none; \}/);
  // a startable START is not drawn faint; the watch's lock shows on the cursor
  assert.match(CSS, /\.dk-mach\.m-off \.dk-start:not\(\.live\) \{ color: var\(--dk-faint\); \}/);
  assert.match(CSS, /\.dk-guard\.live \{ border-color: var\(--dk-dim\); color: var\(--dk-bright\); \}/);
  assert.match(CSS, /\.dk-locked \.dk-guard \{ cursor: not-allowed; \}/);
});

test('K-5 (playtest): the battery lamp says GUARD, and the objective lights the GUARD ring itself, not the whole battery', () => {
  const lamp = (guardMW, guardFired) => {
    const v = vmAt(EVE);
    Object.assign(v.obs.battery, {guardMW, guardFired, ffrMW: 390});
    return mount(at(v, 1000)).$('ring-guard').parentElement.parentElement.querySelector('.dk-ffr').textContent;
  };
  assert.deepEqual([lamp(0, false), lamp(400, false), lamp(400, true)], ['○ GUARD 0', '⚡ GUARD 400', '⚡ FIRED 390']);
  const ring = mount(at(vmAt(EVE, {glow: new Set(['ring-guard'])}), 1000)).$('ring-guard');
  assert.equal(ring.title, 'GUARD: drag around the outer ring (or G, then ↑ ↓), 50 MW a step');
  assert.ok(ring.classList.contains('glow'));
  assert.ok(!ring.parentElement.parentElement.classList.contains('glow'));
  const dial = mount(at(vmAt(EVE, {glow: new Set(['dial-battery'])}), 1000)).$('ring-guard');
  assert.ok(!dial.classList.contains('glow'));
  assert.ok(dial.parentElement.parentElement.classList.contains('glow'));
});

test('A-1 / L-6 (playtest): RE-DISPATCH lights while the levers are held by hand, with one note; an idle lever drag says it booked a start', () => {
  const {$, desk} = mount(at(vmAt(EVE, {held: true}), 1000));
  const r = $('btn-redispatch'), keys = r.parentElement;
  assert.ok(r.classList.contains('lit'));
  assert.match(r.textContent, /HELD/, 'not by colour alone');
  assert.equal(r.getAttribute('title'), 'HELD BY HAND: you moved a lever, the HYDRO wheel or the TIE knob, so the dispatch stopped ' +
    'moving the levers. Press to hand them back.');
  assert.match(r.getAttribute('aria-label'), /^HELD BY HAND: RE-DISPATCH: /, 'a screen reader hears it too');
  assert.match(CSS, /\.dk \.dk-redispatch\.lit \{ border-color: var\(--dk-amber\);/, 'amber under the pointer too (beats button:hover)');
  const shown = () => keys.querySelectorAll('.dk-note').filter(n => !n.hidden);
  assert.equal(shown().length, 1);
  assert.ok(shown()[0].classList.contains('info'));
  assert.equal(shown()[0].textContent, 'held by hand: RE-DISPATCH (N) hands the levers back');
  // said once, the frame it starts: still held, the live region is not written again and the note goes after its 6 s
  desk.el.querySelector('.dk-live').textContent = '';
  desk.update(at(vmAt(EVE, {held: true}), 2000));
  assert.equal(liveText(desk), '');
  desk.update(at(vmAt(EVE, {held: true}), 1000 + 6000 + 100));
  assert.equal(shown().length, 0);
  desk.update(at(vmAt(EVE), 8000));
  assert.ok(!r.classList.contains('lit'));
  assert.doesNotMatch(r.textContent, /HELD/);
  assert.equal(r.getAttribute('title'), 'Re-plan every lever and the tie from now');
  assert.match(r.getAttribute('aria-label'), /^RE-DISPATCH: /);
  const plain = mount(at(vmAt(EVE), 1000));
  assert.ok(!plain.$('btn-redispatch').classList.contains('lit'));
  assert.equal(plain.$('btn-redispatch').parentElement.querySelectorAll('.dk-note').length, 0);
  // the idle-lever drag (K-1 / L-6) sends planKey and says so on the lever
  const vm = vmAt(EVE);
  Object.assign(vm.obs.stations.find(s => s.id === 'gta'), {onCount: 0, minMW: 0, maxMW: 0, basePointMW: 0, outMW: 0});
  const m = mount(at(vm, 1000));
  const tr = m.$('lever-gta');
  tr.rect = {left: 0, top: 0, width: 28, height: 100};
  tr.dispatch('pointerdown', {clientY: 40});
  tr.dispatch('pointerup', {clientY: 40});
  assert.deepEqual(m.actions.inputs, [{type: 'planKey', station: 'gta', atS: vm.obs.s, mw: 300}]);
  const note = slotOf(m.$, 'gta').querySelector('.dk-note.info');
  assert.equal(note && note.textContent, 'START booked now: GT·A, 300 MW');
  // the plan books one machine between its MIN and its rating (sim planKey): a low drag books GT·A's 250 MW
  tr.dispatch('pointerdown', {clientY: 80});
  tr.dispatch('pointerup', {clientY: 80});
  assert.equal(m.actions.inputs.at(-1).mw, 100);
  assert.equal(note.textContent, 'START booked now: GT·A, ' + V.MACHINES.find(x => x.id === 'gta1').minMW + ' MW');
  // ... and a drag above one machine's rating books that rating: 700 MW on an idle GT·B (2 × 400) is one 400-MW start
  const vb = vmAt(EVE);
  Object.assign(vb.obs.stations.find(s => s.id === 'gtb'), {onCount: 0, minMW: 0, maxMW: 0, basePointMW: 0, outMW: 0});
  const mb = mount(at(vb, 1000)), tb = mb.$('lever-gtb');
  tb.rect = {left: 0, top: 0, width: 28, height: 100};
  tb.dispatch('pointerdown', {clientY: 12.5});
  tb.dispatch('pointerup', {clientY: 12.5});
  assert.deepEqual(mb.actions.inputs, [{type: 'planKey', station: 'gtb', atS: vb.obs.s, mw: 700}]);
  assert.equal(slotOf(mb.$, 'gtb').querySelector('.dk-note.info').textContent, 'START booked now: GT·B, 400 MW');
});

test('K-22 / S-7 (playtest): help is drawn as help; a refused press says why where it was made, by key, in the watch and on the AGC key', () => {
  const {$, actions: a} = mount(at(playVm(), 1000));
  $('q-gauge').click();
  assert.ok($('gauge-n1').querySelector('.dk-note').classList.contains('info'), 'the gauge\'s ? is help');
  assert.match(CSS, /\.dk-note\.info \{ background: #0d2238; border-color: var\(--dk-blue\);/);
  // Q-41: a '·' STOP with nothing to stop is help (blue, naming the unit); only the grid's own refusal keeps the red style
  $('guard-stop-gtc1').click();
  const nothing = $('guard-stop-gtc1').parentElement.querySelector('.dk-note');
  assert.equal(nothing.textContent, 'GT·C 1 OFF: nothing to stop');
  assert.ok(nothing.classList.contains('info'));
  assert.equal(a.inputs.length, 0);
  const rf = mount(at(playVm(), 1000), mockActions({refuse: () => 'no gas'}));
  rf.$('guard-start-gtc1').click(); rf.$('guard-start-gtc1').click();
  const refusal = rf.$('guard-start-gtc1').parentElement.querySelector('.dk-note');
  assert.equal(refusal.textContent, '✕ no gas');
  assert.ok(!refusal.classList.contains('info'));
  // S with nothing to start on the focused station: what each unit is doing, said on the lever as help (it may be
  // the S after an S S); the key is still not the desk's
  const coal = playVm();
  for (const u of coal.obs.units) if (u.station === 'coal') Object.assign(u, {mode: 'on', sync: true, stopBlock: ''});
  const m = mount(at(coal, 1000));
  tap(m, '1');
  assert.equal(tap(m, 's'), false);
  const coalNote = slotOf(m.$, 'coal').querySelector('.dk-note');
  assert.equal(coalNote.textContent, 'nothing to start: all running');
  assert.ok(coalNote.classList.contains('info'));
  assert.equal(m.actions.inputs.length, 0);
  // the list is long: it stays 5 s, not the 2.5 s of a refusal
  m.desk.update(at(coal, 1000 + 4900));
  assert.ok(!coalNote.hidden, 'still shown at 4.9 s');
  m.desk.update(at(coal, 1000 + 5100));
  assert.ok(coalNote.hidden);
  // a READY unit is not 'nothing to start': O or its START opens the synchroscope
  const rdy = playVm();
  Object.assign(rdy.obs.units.find(u => u.id === 'gtc1'), {mode: 'ready', sync: false, timerS: 192});
  Object.assign(rdy.obs.units.find(u => u.id === 'gtc2'), {mode: 'on', sync: true, stopBlock: ''});
  const r = mount(at(rdy, 1000));
  tap(r, '5');
  assert.equal(tap(r, 's'), false);
  assert.equal(slotOf(r.$, 'gtc').querySelector('.dk-note').textContent, 'nothing to start: all running');
  Object.assign(rdy.obs.units.find(u => u.id === 'gtc2'), {mode: 'starting', sync: false, timerS: 300});
  r.desk.update(at(rdy, 1100));
  tap(r, 's');
  assert.equal(slotOf(r.$, 'gtc').querySelector('.dk-note').textContent, 'nothing to start: GT·C 2 STARTING: full speed in 5:00');
  assert.equal(r.actions.inputs.length, 0);
  // S S starts GT·C 1, and the third S finds it under way and GT·C 2 held off: it names them, in blue
  const gt = playVm();
  Object.assign(gt.obs.units.find(u => u.id === 'gtc2'), {mode: 'off', sync: false, startBlock: 'minimum down time: 29 min left'});
  const g = mount(at(gt, 1000));
  tap(g, '5'); tap(g, 's'); tap(g, 's');
  assert.deepEqual(g.actions.inputs, [{type: 'start', unit: 'gtc1'}]);
  Object.assign(gt.obs.units.find(u => u.id === 'gtc1'), {mode: 'starting', timerS: 300});
  g.desk.update(at(gt, 1300));
  assert.equal(tap(g, 's'), false);
  const third = slotOf(g.$, 'gtc').querySelector('.dk-note');
  assert.equal(third.textContent, 'nothing to start: GT·C 1 STARTING: full speed in 5:00, GT·C 2 OFF: minimum down time: 29 min left');
  assert.ok(third.classList.contains('info'), 'not a red refusal');
  assert.doesNotMatch(third.textContent, /tooltip/);
  // a note on a lever is as wide as it needs (up to 220 px, so two lines, not seven in the 80-px slot); GT·B's and
  // GT·C's open leftwards, inside the lever bank (checked in a browser at 1280)
  assert.match(CSS, /\.dk-lever-slot \.dk-note \{ width: max-content; \}\n\.dk-lever-slot:nth-child\(n\+4\) \.dk-note \{ left: auto; right: 2px; \}/);
  // X with nothing to stop: the unit held on by its minimum up time says so
  Object.assign(gt.obs.units.find(u => u.id === 'gta1'), {mode: 'on', sync: true, stopBlock: 'minimum up time: 30 min left'});
  g.desk.update(at(gt, 3000));
  tap(g, '3');
  assert.equal(tap(g, 'x'), false);
  assert.equal(slotOf(g.$, 'gta').querySelector('.dk-note').textContent, 'nothing to stop: GT·A ON: minimum up time: 30 min left');
  assert.equal(g.actions.inputs.length, 1);
  // the watch: a press on a guard says the desk is locked (help: blue, ctx.lockNote), and sends nothing
  const w = mount(at(baseVm(clone(TRIP.obs), {mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'full', canSkip: true}}), 1000));
  w.$('guard-start-gtc1').click();
  assert.equal(w.$('guard-start-gtc1').parentElement.querySelector('.dk-note.info').textContent, 'desk locked while the grid catches itself (Esc skips)');
  assert.equal(w.actions.inputs.length, 0);
  // the AGC key, locked for the day: its note is on the CONTROL column and survives the next frame
  const v = vmAt(EVE);
  v.obs.modeLocked = true;
  const k = mount(at(v, 1000));
  k.$('key-agc').click();
  k.desk.update(at(v, 1016));
  const note = k.$('key-agc').parentElement.querySelector('.dk-note');
  assert.ok(note && !note.hidden && note.classList.contains('info'));
  assert.equal(note.textContent, 'AGC/HAND is set at the briefing: locked for the day');
  // a real width, opening leftwards over the tie (at width auto it would wrap to the 72-px column and cover RE-DISPATCH)
  assert.match(CSS, /\.dk-keys > \.dk-note \{ left: auto; right: 0; width: max-content; max-width: 260px; \}/);
  assert.equal(k.$('key-agc').textContent, 'A AGC');
  assert.equal(k.actions.inputs.length, 0);
});

test('K-4 to K-6, K-9, K-12 (playtest): the readouts say what they are in words', () => {
  const vm = vmAt(EVE, {tray: {cards: [{id: 'c', from: 'GT·B', atS: 30000, text: 'GT·B 2 at full speed: auto-sync in 4 min; close by hand to save time', sev: 'info'}], log: []}});
  const o = vm.obs;
  Object.assign(o.battery, {mode: 'idle', orderMW: 0, outMW: -28});
  Object.assign(o.tie, {setMW: 250, flowMW: 248.4, tripped: false});
  Object.assign(o.stations.find(s => s.id === 'hydro'), {outMW: 38});
  Object.assign(o.hydro, {frac: 0.98, storageMWh: 7334});
  for (const u of o.units) if (u.mode === 'ready') u.mode = 'off';
  o.scope = {unit: ''};
  const {$} = mount(at(vm, 1000));
  const batt = $('ring-guard').parentElement.parentElement, tie = $('knob-tie').parentElement.parentElement;
  assert.equal(batt.querySelector('.dk-rot-read').textContent, '■ IDLE · OUT −28');
  assert.match(batt.querySelector('.dk-rot-read').title, /^Your order \(CHG \/ IDLE \/ DIS\), then OUT: /);
  const dis = vmAt(EVE);
  Object.assign(dis.obs.battery, {mode: 'discharge', orderMW: 200, outMW: 200, guardMW: 0, fullHold: true});
  const db = mount(at(dis, 1000)).$('ring-guard').parentElement.parentElement;
  assert.equal(db.querySelector('.dk-rot-read').textContent, '▲ DIS 200 · OUT 200', 'no + on what it gives');
  // FULL–HOLD sits under the order it holds: the title row keeps one lamp, so it stays inside the battery's column
  const full = db.querySelector('.dk-full');
  assert.equal(full.textContent, 'F FULL–HOLD');
  assert.ok(!full.hidden);
  assert.equal(db.children.at(-1), full);
  assert.equal(db.querySelector('.dk-rot-title').querySelectorAll('.dk-lamp').length, 1);
  assert.equal(tie.querySelector('.dk-tie-set').textContent, 'SET IMP 250');
  assert.equal(tie.querySelector('.dk-tie-flow').textContent, 'FLOW IMP 248');
  assert.equal(tie.querySelector('.dk-link').textContent, '● LINK OK');
  assert.deepEqual([250, -300, 0.3, -0.4].map(tieWords), ['IMP 250', 'EXP 300', '0', '0']);
  const store = $('wheel-hydro').parentElement.parentElement.querySelector('.dk-store');
  assert.equal(store.textContent, 'OUT 38 MW · 98%');
  assert.equal(store.getAttribute('title'), 'Output now, and the reservoir: 7334 MWh');
  // the SYNC bay with nothing ready says what it is for, and where starting happens
  assert.equal($('scope-canvas').parentElement.querySelector('.dk-slip').textContent, 'No unit ready');
  assert.equal($('bay-sync').parentElement.parentElement.querySelector('.dk-empty').textContent,
    'START a unit on the lever bank: at full speed it waits here, and AGC closes its breaker itself in 4 min.');
  // a tray card shows one line: the whole of it on hover
  const card = $('tray').querySelector('.dk-card-text');
  assert.equal(card.title, card.textContent);
});

test('K-10 (playtest): the TRIP PREVIEW ticks only where the sim says SECURE; below that line, contained, it says what it needs', () => {
  // age: grid seconds from the sim's cached preview (sec.previewAtS) to the second it last judged. securitySecond
  // runs in the step that starts a grid second, so at obs.tick (ticks done) that is floor((tick - 1) / TPS).
  const judged = tick => Math.floor((tick - 1) / TPS);
  const m = mount(at(vmAt(EVE), 1000)), g = m.$('gauge-n1'), ptext = g.querySelector('.dk-ptext');
  const pv = (hz, age = 0, over) => {
    const v = vmAt(EVE, over);
    Object.assign(v.obs.sec, {previewNadirHz: hz, lKind: 'unit', previewAtS: judged(v.obs.tick) - age});
    m.desk.update(at(v, 1000));
    return ptext;
  };
  assert.equal(SECURE_LINE_HZ, V.SECURE_NADIR_HZ + V.PREVIEW_MARGIN_HZ);
  const low = pv(49.533);
  assert.equal(low.textContent, '! 49.53<49.55 Hz');
  assert.ok(low.classList.contains('warn'));
  assert.equal(pv(49.549).textContent, '! 49.54<49.55 Hz', 'rounded down: never reads as the line itself');
  assert.match(g.getAttribute('aria-label'), /Trip preview 49.54 Hz, under the SECURE line, 49.55./, 'the label rounds as the face does');
  const ok = pv(49.6);
  assert.match(ok.textContent, /^✓ 49.60 Hz · U/);
  assert.ok(ok.classList.contains('good'));
  assert.match(pv(49.3).textContent, /^! 49.30 Hz · U/, 'below 49.5: amber as before, with nothing it needs');
  // a cached preview must clear the line by PREVIEW_AGE_MARGIN_HZ_S more per grid second of its age, as SECURE does
  assert.equal(pv(49.558, 10).textContent, '! 49.55<49.56 Hz');
  assert.match(pv(49.56, 10).textContent, /^✓ 49.56 Hz · U/);
  // the line it names is rounded up, so an odd thousandth never prints the line as its own figure ('49.55<49.55')
  assert.equal(pv(49.551, 2).textContent, '! 49.55<49.56 Hz');
  // the tooltip's green line is the aged one too
  assert.match(pv(49.6, 10).getAttribute('title'), /Green ≥ 49\.56, amber/);
  assert.match(pv(49.6, 0).getAttribute('title'), /Green ≥ 49\.55, amber/);
  // the live preview (T, the ring turning) is run now: no age margin, however old the cached one is
  assert.equal(pv(49.0, 30, {previewGuardMW: 250}).textContent, '✓ 49.55 Hz @ GUARD 250');
  // the sim's own verdict: with R5 plenty (DAY.state), the preview alone decides SECURE / TIGHT, and the tick agrees,
  // both at the tick that starts a grid second (not judged yet) and one tick into it
  // (the gauge on its own here, over one vm, to keep the sweep fast)
  const doc = makeDocument(), solo = createGauge({doc, note() {}, cue() {}, ui() {}}, doc.body), v = vmAt(EVE), sec = v.obs.sec;
  const tick0 = v.obs.tick, face = () => solo.el.querySelector('.dk-ptext').textContent;
  assert.equal(tick0 % TPS, 0, 'the fixture sits on a second\'s first tick');
  for (const tick of [tick0, tick0 + 1]) for (const age of [0, 5, 10, 30, 60]) for (let hz = 49.5; hz < 49.62; hz += 0.003) {
    const level = security(DAY.state, {previewUnitHz: hz, previewLinkHz: hz, previewAgeS: age}).level;
    assert.ok(level === 'SECURE' || level === 'TIGHT');
    v.obs.tick = tick;
    Object.assign(sec, {previewNadirHz: hz, lKind: 'unit', previewAtS: judged(tick) - age, level});
    solo.update(v, null);
    assert.equal(face()[0] === CLASS_GLYPH.good, level === 'SECURE', hz.toFixed(3) + ' Hz, ' + age + ' s old at tick ' + tick + ': ' + level);
  }
  // at a second's first tick obs.s has moved on but the level is still the last second's: the face uses that second's
  // age (9 s here), never one tick stricter than SECURE; a tick later the sim has judged 10 s and the face follows
  const judgedAs = age => security(DAY.state, {previewUnitHz: 49.5595, previewLinkHz: 49.5595, previewAgeS: age}).level;
  assert.deepEqual([judgedAs(9), judgedAs(10)], ['SECURE', 'TIGHT']);
  v.obs.tick = tick0;
  Object.assign(sec, {previewNadirHz: 49.5595, lKind: 'unit', previewAtS: v.obs.s - 10, level: 'SECURE'});
  solo.update(v, null);
  assert.match(face(), /^✓ 49.56 Hz · U/);
  v.obs.tick = tick0 + 1;
  Object.assign(sec, {level: 'TIGHT'});
  solo.update(v, null);
  assert.equal(face(), '! 49.55<49.56 Hz');
  // the line fits the 1280 floor: 155 px beside 'T PREVIEW ●' is 29 characters of 9-px mono (checked in a browser).
  // The longest form, the ring turning (the mock's preview: 49.3 Hz + guard / 1000), keeps its GUARD figure.
  const turning = pv(49.3, 0, {previewGuardMW: 235}).textContent;
  assert.equal(turning, '! 49.53<49.55 Hz @ GUARD 235');
  assert.ok(turning.length <= 28);
});

// ---------------------------------------------------------------- every press answers (SPEC Q-41): help is blue, red only for the grid's refusal

/** The note a press left on `host` (its own, not a child control's): 'blue …' (help), 'RED …' (a refusal) or ''. */
const noteOn = host => {
  const n = host.children.find(c => c.classList && c.classList.contains('dk-note'));
  return n && !n.hidden ? (n.classList.contains('info') ? 'blue ' : 'RED ') + n.textContent : '';
};

test('Q-41: a guard with nothing to do says in blue what the unit is doing and what to press instead', () => {
  const vm = playVm();
  const set = (id, x) => Object.assign(vm.obs.units.find(u => u.id === id), x);
  set('gtc2', {mode: 'off', sync: false, startBlock: 'minimum down time: 29 min left'});
  set('gtb1', {mode: 'starting', sync: false, timerS: 300});
  set('gtb2', {mode: 'unloading', sync: true});
  set('gta1', {mode: 'tripped', sync: false, timerS: 90});
  set('hydro1', {mode: 'on', sync: true, stopBlock: ''});
  const {$, actions: a} = mount(at(vm, 1000));
  const startOf = id => { $('guard-start-' + id).click(); return noteOn($('guard-start-' + id).parentElement); };
  assert.equal(startOf('ccgt1'), 'blue CCGT 1 ON: its lever sets the MW');
  assert.equal(startOf('hydro1'), 'blue HYDRO 1 ON: the wheel sets the MW');
  assert.equal(startOf('gtb1'), 'blue GT·B 1 STARTING: full speed in 5:00');
  assert.equal(startOf('gtb2'), 'blue GT·B 2 UNLOADING: ↺ puts it back on');
  assert.equal(startOf('gta1'), 'blue GT·A TRIPPED: locked out 1:30, then START');
  assert.equal(startOf('gtc2'), 'blue GT·C 2 OFF: minimum down time: 29 min left');
  $('guard-stop-gtc1').click();
  assert.equal(noteOn($('guard-stop-gtc1').parentElement), 'blue GT·C 1 OFF: nothing to stop');
  assert.equal(a.inputs.length, 0);
});

test('Q-41: P and the MAN lamp answer in blue (a RESUME says so); an idle lever in HAND and a dry hydro wheel say what they need', () => {
  // AGC: P on a focused lever (no MAN lamp in AGC); held by hand, it points at RE-DISPATCH
  for (const [held, text] of [[false, 'AGC: levers follow the plan already'], [true, 'AGC: RE-DISPATCH (N) hands the levers back']]) {
    const g = mount(at(vmAt(EVE, {held}), 1000));
    tap(g, '2'); tap(g, 'p');
    assert.equal(noteOn(slotOf(g.$, 'ccgt')), 'blue ' + text);
    assert.equal(g.actions.inputs.length, 0);
  }
  // HAND: COAL off the plan (M), CCGT on it (P), GT·A with no machine on
  const vm = vmAt(EVE);
  vm.obs.mode = 'HAND';
  vm.obs.plan.stations.find(p => p.id === 'coal').man = true;
  Object.assign(vm.obs.stations.find(s => s.id === 'gta'), {onCount: 0, minMW: 0, maxMW: 0, basePointMW: 0, outMW: 0});
  const {$, actions: a} = mount(at(vm, 1000));
  $('man-ccgt').click();
  assert.equal(noteOn(slotOf($, 'ccgt')), 'blue CCGT follows the plan: M lights once you move it');
  $('man-coal').click();
  assert.equal(noteOn(slotOf($, 'coal')), 'blue double-click or P: RESUME PLAN · Shift+P: KEEP');
  $('man-coal').dispatch('dblclick');
  assert.deepEqual(a.inputs, [{type: 'planRejoin', station: 'coal', keep: false}]);
  assert.equal(noteOn(slotOf($, 'coal')), 'blue COAL back on the plan');
  const tr = $('lever-gta');
  tr.rect = {left: 0, top: 0, width: 28, height: 100};
  tr.dispatch('pointerdown', {clientY: 40});
  tr.dispatch('pointerup', {clientY: 40});
  assert.equal(noteOn(slotOf($, 'gta')), 'blue no machine on: START one first (S S)');
  assert.equal(a.inputs.length, 1);
  // the hydro wheel with no machine on: a turn, a key or a scroll says so (the key stops at the wheel)
  const hv = vmAt(EVE);
  Object.assign(hv.obs.stations.find(s => s.id === 'hydro'), {onCount: 0, minMW: 0, maxMW: 0, basePointMW: 0, outMW: 0});
  const w = mount(at(hv, 1000)), box = w.$('wheel-hydro').closest('.dk-rot');
  tap(w, '6');
  assert.equal(tap(w, 'ArrowRight'), true);
  assert.equal(noteOn(box), 'blue no hydro machine on: START one (S S)');
  w.desk.update(at(hv, 4000));
  w.$('wheel-hydro').dispatch('wheel', {deltaY: -1});
  assert.equal(noteOn(box), 'blue no hydro machine on: START one (S S)');
  assert.equal(w.actions.inputs.length, 0);
});

test('Q-41: in the watch every lever, guard, MAN lamp and rotary press or key answers with the lock note (blue); nothing is sent and the key goes no further', () => {
  const lockVm = canSkip => {
    const v = baseVm(clone(TRIP.obs), {mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'full', canSkip}});
    v.obs.mode = 'HAND';
    return v;
  };
  const LOCK = 'blue desk locked while the grid catches itself: watch this one';
  const m = mount(at(lockVm(false), 1000)), {$} = m;
  const rot = id => $(id).closest('.dk-rot'), lever = slotOf($, 'ccgt');
  let t = 1000;
  const fresh = () => { t += 3000; m.desk.update(at(lockVm(false), t)); };   // the last note has gone (NOTE_MS)
  for (const [id, host] of [['guard-start-gtc1', $('guard-start-gtc1').parentElement], ['guard-stop-ccgt1', $('guard-stop-ccgt1').parentElement], ['man-ccgt', lever]]) {
    fresh(); $(id).click();
    assert.equal(noteOn(host), LOCK, id);
  }
  fresh(); $('man-ccgt').dispatch('dblclick');
  assert.equal(noteOn(lever), LOCK, 'MAN double-click');
  for (const [id, host] of [['lever-ccgt', lever], ['wheel-hydro', rot('wheel-hydro')], ['dial-battery', rot('dial-battery')], ['ring-guard', rot('ring-guard')], ['knob-tie', rot('knob-tie')]]) {
    fresh(); $(id).dispatch('pointerdown', {clientX: 0, clientY: 0});
    assert.equal(noteOn(host), LOCK, id + ' pointer');
    if (id === 'lever-ccgt') continue;
    fresh(); $(id).dispatch('wheel', {deltaY: -1});
    assert.equal(noteOn(host), LOCK, id + ' scroll');
  }
  // keys on each focused control: taken at the control (the fallback map would only be refused: a red toast)
  for (const [k, host, keys] of [['2', lever, ['ArrowUp', 'PageDown', 'Home', 's', 'x', 'p']], ['6', rot('wheel-hydro'), ['ArrowRight', 's']],
    ['7', rot('dial-battery'), ['ArrowLeft', 'ArrowUp']], ['g', rot('ring-guard'), ['End']], ['8', rot('knob-tie'), ['ArrowDown']]]) {
    tap(m, k);
    for (const key of keys) {
      fresh();
      assert.equal(tap(m, key), true, k + ' ' + key);
      assert.equal(noteOn(host), LOCK, k + ' ' + key);
    }
  }
  assert.equal(m.actions.inputs.length, 0);
  // Esc and Space are not the controls': they go on to the shell
  fresh();
  assert.equal(tap(m, 'Escape'), false);
  assert.equal(tap(m, ' '), false);
  assert.equal(noteOn(rot('knob-tie')), '');
  // a watch Esc can skip says so
  const s = mount(at(lockVm(true), 1000));
  s.$('lever-gta').dispatch('pointerdown', {clientY: 0});
  assert.equal(noteOn(slotOf(s.$, 'gta')), 'blue desk locked while the grid catches itself (Esc skips)');
});

test('Q-41: a guard press in the 1-s rest after a commit says in blue that the order went', () => {
  const vm = playVm();
  const {$, desk, actions: a} = mount(at(vm, 1000));
  const box = $('guard-start-gtc1').parentElement;
  $('guard-start-gtc1').click(); $('guard-start-gtc1').click();
  assert.deepEqual(a.inputs, [{type: 'start', unit: 'gtc1'}]);
  Object.assign(vm.obs.units.find(u => u.id === 'gtc1'), {mode: 'starting', timerS: 300});
  desk.update(at(vm, 1500));
  $('guard-start-gtc1').click();
  assert.equal(noteOn(box), 'blue GT·C 1 START sent: full speed in 5:00');
  desk.update(at(vm, 1600));
  box.children.find(c => c.classList.contains('dk-note')).hidden = true;
  $('guard-stop-gtc1').click();   // its other guard rests too
  assert.equal(noteOn(box), 'blue GT·C 1 START sent: full speed in 5:00');
  assert.equal(a.inputs.length, 1);
  // after the rest the guard acts again: CANCEL? arms
  desk.update(at(vm, 1000 + COMMIT_LOCK_MS + 1));
  $('guard-stop-gtc1').click();
  assert.equal($('guard-stop-gtc1').textContent, 'CANCEL?');
  // the ABORT a third click used to swallow (STOP sent, the unit unloading) says so too
  const v2 = playVm(), s = mount(at(v2, 1000)), gx = 'guard-stop-ccgt1';
  s.$(gx).click(); s.$(gx).click();
  v2.obs.units.find(u => u.id === 'ccgt1').mode = 'unloading';
  s.desk.update(at(v2, 1200));
  s.$(gx).click();
  assert.equal(noteOn(s.$(gx).parentElement), 'blue CCGT 1 STOP sent');
  assert.equal(s.actions.inputs.length, 1);
});

test('§13.3 / Q-41: in IDLE the battery dial in hand shows on its face the MW the next ←/→ orders, which ↑/↓ set', () => {
  const vm = vmAt(EVE);
  Object.assign(vm.obs.battery, {mode: 'idle', orderMW: 0, outMW: -28, guardMW: 0});
  const m = mount(at(vm, 1000)), {$, desk, actions: a} = m;
  const read = () => $('dial-battery').closest('.dk-rot').querySelector('.dk-rot-read').textContent;
  assert.equal(read(), '■ IDLE · OUT −28', 'not in hand: as before');
  tap(m, '7');
  desk.update(at(vm, 1016));
  assert.equal(read(), '■ IDLE ◀▶ 50 · OUT −28');
  tap(m, 'ArrowUp');
  assert.equal(read(), '■ IDLE ◀▶ 100 · OUT −28');
  tap(m, 'ArrowDown', {shiftKey: true});
  assert.equal(read(), '■ IDLE ◀▶ 90 · OUT −28');
  assert.equal(a.inputs.length, 0, '↑/↓ in IDLE order nothing');
  tap(m, 'ArrowRight');
  assert.deepEqual(inputsOf(a, 'battery'), [{type: 'battery', mode: 'discharge', mw: 90}]);
  assert.match(read(), /^▲ DIS 90 · OUT/);
});

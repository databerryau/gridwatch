// render/livestack.js (desk/README §7; SPEC L-1..L-9, K-18) in the stand-in DOM with view
// models from a real par day: fixed axis and 54 columns, the red gap in the first frame after
// a trip, drags and the keyboard route sending exactly what planview.snapDrop predicts, the
// earliest-arrival ghost, the L-9 hover glow, read-only in the watch, no NaN on the canvas,
// 24-px hit areas and the render budget.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import * as PV from '../app/planview.js';
import {makeDocument} from './lib/dom.js';
import {dayVm, baseVm} from './lib/vm-fixture.js';
import {yardstickNs, OWNER_YARD_NS} from './lib/speed.js';
import {createLiveStack, AXIS_MAX_MW, HIT_PX} from '../render/livestack.js';

const DAYS = {};
async function vmOf(key, o, over) {
  if (!DAYS[key]) DAYS[key] = dayVm(o);
  const {obs} = await DAYS[key];
  const c = structuredClone(obs);
  // a hand-built plan in the desk/README §3.1 shape (stable once the sim's own plan merges)
  c.plan = {madeAtS: c.s, rev: 3, stations: V.STATION_IDS.map(id => ({id, man: false, doneS: -1, clampedMW: 0, keys: []})),
    tie: {doneS: -1, keys: []}, starts: [], stops: []};
  const st = id => c.plan.stations.find(p => p.id === id);
  const lever = id => c.stations.find(s => s.id === id).basePointMW;
  for (const id of ['coal', 'ccgt', 'hydro']) if (lever(id) > 0) st(id).keys.push({atS: c.s + 2700, mw: lever(id)});
  return baseVm(c, over);
}
const morning = over => vmOf('m', {seed: 7, untilH: 7.5}, over);
const tripVm = over => vmOf('t', {seed: 7, untilH: 18.5, trip: true}, over);

function mount(w = 336, h = 164) {
  const doc = makeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const sent = [], ui = [];
  const actions = {input: x => { sent.push(x); return ''; }, ui: c => { ui.push(c); }};
  const stack = createLiveStack(doc, root, actions);
  stack.el.clientWidth = w; stack.el.clientHeight = h;
  const cv = stack.el.querySelector('canvas');
  cv.rect = {left: 0, top: 0, width: w, height: h};
  return {doc, stack, sent, ui, cv};
}
const at = (cv, type, x, y) => cv.dispatch(type, {clientX: x, clientY: y});

test('L-1: 54 future columns and a fixed 0-9,000 MW axis that never rescales', async () => {
  const {stack} = mount();
  const a = await morning();
  stack.update(a);
  const g1 = stack.debug.geom;
  assert.equal(stack.debug.proj.n, 54);
  assert.equal(Math.round((g1.x1 - g1.x0) / g1.colW), 60, '6 past + 54 future columns across the plot');
  const b = await tripVm();
  stack.update(b);
  const g2 = stack.debug.geom;
  for (const g of [g1, g2]) { assert.equal(g.y(0), g.y0); assert.equal(g.y(AXIS_MAX_MW), g.y1); }
  assert.equal(g1.y(4500), g2.y(4500));
  assert.equal(stack.el.id, 'stack');
});

test('L-5: after a trip, red appears in the first rendered frame', async () => {
  const {stack, doc} = mount();
  stack.update(await tripVm({mode: {mode: 'WATCH', rate: 0.15, watchS: 0.1, locked: true, watchVersion: 'full'}}));
  assert.equal(stack.debug.stats.draws, 1);
  assert.equal(stack.debug.proj.gap[0], 'red');
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('L-4: a drag on the stack sends exactly the planKey snapDrop predicted (moving a key also deletes the old one)', async () => {
  const {stack, sent, cv} = mount();
  const vm = await morning();
  stack.update(vm);
  const h = stack.debug.handles.find(q => q.kind === 'key' && q.station === 'ccgt');
  assert.ok(h, 'CCGT key handle drawn');
  at(cv, 'pointerdown', h.x, h.y);
  at(cv, 'pointermove', h.x + 25, h.y - 6);
  at(cv, 'pointerup', h.x + 25, h.y - 6);
  const d = stack.debug.lastDrop;
  assert.ok(d && !d.infeasible, JSON.stringify(d));
  const again = PV.snapDrop(vm.obs, 'ccgt', d.raw.atS, d.raw.mw);
  assert.deepEqual(again.inputs, d.inputs);
  assert.deepEqual(sent, [{type: 'planDel', station: 'ccgt', atS: h.atS}, ...again.inputs]);
  assert.equal(sent[sent.length - 1].type, 'planKey');
  assert.equal(sent[sent.length - 1].atS % 900, 0);
  assert.equal(sent[sent.length - 1].mw % 50, 0);
  // a new key from a layer's top edge
  sent.length = 0;
  stack.update(vm);
  const G = stack.debug.geom, P = stack.debug.proj;
  const k = 30, x = G.x(P.times[k]) - 1;
  const li = P.layers.findIndex(L => L.id === 'coal');
  let base = 0;
  for (let i = 0; i < li; i++) base += P.layers[i].mw[k];
  const y = G.y(base + P.layers[li].mw[k]);
  assert.equal(stack.debug.hitTest(x, y).kind, 'edge');
  at(cv, 'pointerdown', x, y);
  at(cv, 'pointermove', x + 4, y - 3);
  at(cv, 'pointerup', x + 4, y - 3);
  const d2 = stack.debug.lastDrop;
  assert.deepEqual(sent, PV.snapDrop(vm.obs, d2.station, d2.raw.atS, d2.raw.mw).inputs);
});

test('L-4: an infeasible drop shows the earliest-arrival ghost, is not sent, and Enter takes the ghost', async () => {
  const {stack, sent, cv} = mount();
  const vm = await morning();
  stack.update(vm);
  const gh = stack.debug.ghosts.find(g => g.station === 'gtb');
  assert.ok(gh, 'GT·B off: its ghost sits at its earliest-start line');
  assert.ok(gh.atS >= vm.obs.s + 720);
  // grab GT·B's ghost and drop its START before the line
  at(cv, 'pointerdown', gh.x + 2, gh.y + gh.h / 2);
  at(cv, 'pointermove', stack.debug.geom.x(vm.obs.s) + 1, gh.y + gh.h / 2);
  at(cv, 'pointerup', stack.debug.geom.x(vm.obs.s) + 1, gh.y + gh.h / 2);
  assert.equal(sent.length, 0, 'not accepted silently');
  assert.ok(stack.debug.pending && stack.debug.pending.result.infeasible);
  assert.match(stack.debug.message, /earliest/);
  stack.el.focus();
  stack.el.dispatch('keydown', {key: 'Enter'});
  const g = stack.debug.lastDrop;
  assert.deepEqual(sent, g.ghost.inputs);
  assert.equal(sent[0].type, 'planStart');
  assert.ok(sent[0].atS + 720 >= gh.atS - 1, 'START booked no earlier than the line allows');
});

test('L-4: keyboard route: a number selects a layer, arrows move one snap step, Enter drops', async () => {
  const {stack, sent} = mount();
  const vm = await morning();
  stack.update(vm);
  stack.el.focus();
  const key = k => stack.el.dispatch('keydown', {key: k});
  key('2'); // CCGT
  const s0 = structuredClone(stack.debug.sel);
  assert.equal(s0.station, 'ccgt');
  key('ArrowRight'); key('ArrowRight'); key('ArrowUp'); key('ArrowDown'); key('ArrowDown');
  const s1 = stack.debug.sel;
  assert.equal(s1.atS, s0.atS + 1800);
  assert.equal(s1.mw, s0.mw - 50);
  key('Enter');
  assert.deepEqual(sent, PV.snapDrop(vm.obs, 'ccgt', s0.atS + 1800, s0.mw - 50).inputs);
  // a station with nothing on selects its off-unit ghost; Enter books its START
  sent.length = 0;
  key('4'); // GT·B
  assert.equal(stack.debug.sel.mode, 'ghost');
  key('ArrowRight');
  key('Enter');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'planStart');
});

test('L-9: hovering a red gap lights exactly glowSet (sent to the shell for the desk)', async () => {
  const {stack, ui, cv} = mount(1248, 420);
  const vm = await tripVm();
  stack.update(vm);
  const G = stack.debug.geom, P = stack.debug.proj;
  const k = P.gap.indexOf('red');
  at(cv, 'pointermove', (G.x(P.times[k]) + G.x(P.times[k] - 300)) / 2, (G.y(P.p50[k]) + G.y(P.supply[k])) / 2);
  const cmd = ui.filter(c => c.do === 'hover').pop();
  assert.equal(cmd.target, 'stack');
  const gap = PV.gapAt(P, k);
  assert.deepEqual(cmd.glow, PV.glowSet(vm.obs, gap));
  assert.equal(cmd.gap.atS, gap.atS);
  // hovering a layer names its control (G-2 cross-highlight) and shows MW, ramp, start and cost (L-3)
  const li = P.layers.findIndex(L => L.id === 'gtb');
  let base = 0;
  for (let i = 0; i < li; i++) base += P.layers[i].mw[10];
  at(cv, 'pointermove', G.x(P.times[10]) - 2, G.y(base + P.layers[li].mw[10] / 2));
  assert.deepEqual(ui[ui.length - 1], {do: 'hover', target: 'lever-gtb'});
  const tip = stack.el.querySelector('.livestack-tip');
  assert.ok(!tip.hidden);
  assert.match(tip.textContent, /MW[\s\S]*ramp[\s\S]*start[\s\S]*cost[\s\S]*price now \$/);
});

test('L-7: read-only during the watch (no input from pointer or keys) and the tripped layer tears', async () => {
  const {stack, sent, cv, doc} = mount();
  const vm = await tripVm({mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'full'}});
  stack.update(vm);
  const h = stack.debug.handles[0];
  at(cv, 'pointerdown', h.x, h.y); at(cv, 'pointermove', h.x + 30, h.y - 30); at(cv, 'pointerup', h.x + 30, h.y - 30);
  stack.el.dispatch('keydown', {key: '1'}); stack.el.dispatch('keydown', {key: 'ArrowUp'}); stack.el.dispatch('keydown', {key: 'Enter'});
  assert.deepEqual(sent, []);
  assert.match(stack.debug.message, /Read-only/);
  const tripped = V.MACHINES.find(m => m.id === vm.obs.contingency.id).station;
  assert.equal(stack.debug.stats.tear, tripped, 'the tripped layer tears');
  stack.update(await tripVm());
  assert.equal(stack.debug.stats.tear, null, 'no tear outside the watch');
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('L-4: every handle has a 24x24 hit area at the 1280x600 floor, and L / the corner button expand the stack', async () => {
  const {stack, ui} = mount();
  stack.update(await morning());
  assert.ok(stack.debug.handles.length >= 3);
  for (const h of stack.debug.handles) {
    for (const [dx, dy] of [[HIT_PX / 2 - 0.5, 0], [0, HIT_PX / 2 - 0.5], [-(HIT_PX / 2 - 0.5), -(HIT_PX / 2 - 0.5)]]) {
      const hit = stack.debug.hitTest(h.x + dx, h.y + dy);
      assert.ok(hit && (hit.kind === 'key' || hit.kind === 'start'), 'handle reachable ' + dx + ',' + dy);
    }
  }
  const btn = stack.el.querySelector('button');
  btn.click();
  assert.deepEqual(ui.pop(), {do: 'stackExpand', on: true});
  stack.el.dispatch('keydown', {key: 'l'});
  assert.deepEqual(ui.pop(), {do: 'stackExpand', on: true});
  const vm = await morning({stackExpanded: true});
  stack.el.clientWidth = 1248; stack.el.clientHeight = 420;
  stack.update(vm);
  assert.ok(stack.el.classList.contains('expanded'));
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  assert.ok(stack.debug.geom.big);
});

test('no NaN reaches the canvas, with history, odd forecasts and an empty plan', async () => {
  const {stack, doc} = mount();
  const vm = await morning();
  vm.hist = {demand: [{s: vm.obs.s - 1500, mw: 6000}, {s: vm.obs.s - 900, mw: NaN}, {s: vm.obs.s, mw: 6100}],
    stations: {coal: [{s: vm.obs.s - 400, mw: 2400}], tie: [{s: vm.obs.s - 100, mw: -200}], wind: []}};
  stack.update(vm);
  const empty = await morning();
  delete empty.obs.plan;
  stack.update(empty);
  const zero = await morning();
  zero.obs.forecast.demandP90 = zero.obs.forecast.demandP50.slice();
  stack.update(zero);
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('L-1: render <= 4 ms at 1280 px (stand-in canvas: the JS cost), projection cached between plan changes', async () => {
  const {stack} = mount();
  const vm = await morning();
  // The budget is 4 ms on the owner's laptop, stated in yardstick units (tests/lib/speed.js), so a
  // loaded machine (node --test runs files in parallel) loosens it instead of flaking. Best of
  // three runs of 120 frames after a warm-up; a plan change every 30 frames forces a recompute.
  const scale = Math.max(1, yardstickNs(5) / OWNER_YARD_NS);
  let best = Infinity, f = 0;
  for (let run = 0; run < 3 && best > 4 * scale; run++) {
    const ms = [];
    for (let i = 0; i < 150; i++, f++) {
      vm.frame = {nowMs: 1000 + f * 16, dtS: 1 / 60, alpha: 0};
      if (i % 30 === 0) vm.obs.plan.rev++;
      stack.update(vm);
      if (i >= 30) ms.push(stack.debug.drawMs);
    }
    ms.sort((a, b) => a - b);
    best = Math.min(best, ms[Math.floor(ms.length * 0.95)]);
  }
  assert.ok(best <= 4 * scale, 'p95 ' + best.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms here)');
  assert.ok(stack.debug.stats.recomputes <= 20, stack.debug.stats.recomputes + ' recomputes');
});

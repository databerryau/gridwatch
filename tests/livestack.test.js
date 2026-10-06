// render/livestack.js (desk/README §7; SPEC L-1..L-9, K-18) in the stand-in DOM with view
// models from a real par day: fixed axis and 54 columns, the red gap in the first frame after
// a trip, drags and the keyboard route sending exactly what planview.snapDrop predicts, the
// earliest-arrival ghost, the L-9 hover glow, read-only in the watch, no NaN on the canvas,
// 24-px hit areas and the render budget.
// Phase 2a (desk/README §21.5), on a real mild weekend of the game's scenario
// (tests/lib/desk-vm.js): the rooftop silhouette and its hatch (L-2), the blue SURPLUS columns
// (C-11, K-22), the signed price with SPILL (P-9), the text alternative's new clauses (K-23),
// the redraw key and the budget with all of it drawn.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import * as PV from '../app/planview.js';
import {makeDocument} from './lib/dom.js';
import {dayVm, baseVm} from './lib/vm-fixture.js';
import {deskDayVm} from './lib/desk-vm.js';
import {DESK_WEEKEND} from '../content/scenarios.js';
import {UI, COLOURS} from '../render/mapdata.js';
import {clockText} from '../render/format.js';
import {yardstickNs, OWNER_YARD_NS} from './lib/speed.js';
import {createLiveStack, AXIS_MAX_MW, HIT_PX, GAP_MARK, SURPLUS_MIN_PX, gapRuns, stackSummary} from '../render/livestack.js';

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
// the largest unit tripped at the same 07:30 (dayVm runs that par day once for both: the trip
// leaves a red gap from the first column, and GT·B is still off, so L-9 hovers the CCGT's layer)
const tripVm = over => vmOf('t', {seed: 7, untilH: 7.5, trip: true}, over);

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
  const li = P.layers.findIndex(L => L.id === 'ccgt');
  let base = 0;
  for (let i = 0; i < li; i++) base += P.layers[i].mw[10];
  at(cv, 'pointermove', G.x(P.times[10]) - 2, G.y(base + P.layers[li].mw[10] / 2));
  assert.deepEqual(ui[ui.length - 1], {do: 'hover', target: 'lever-ccgt'});
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

test('K-22: red and amber gaps differ by hatch direction and glyph, not only by colour', async () => {
  // the marks are distinct in every non-colour respect
  const kinds = Object.keys(GAP_MARK);
  assert.deepEqual(kinds, ['red', 'amber', 'blue']);
  for (const f of ['hatch', 'glyph', 'word']) assert.equal(new Set(kinds.map(k => GAP_MARK[k][f])).size, 3, f);
  // runs (pure): one per stretch of one kind, with its worst shortfall
  const proj = {n: 8, gap: ['', 'red', 'red', 'amber', '', 'amber', 'amber', 'red'], p50: [5, 5, 6, 5, 5, 5, 5, 9].map(v => v * 1000),
    p90: [5.5, 5.5, 6.5, 5.5, 5.5, 5.5, 5.6, 9.5].map(v => v * 1000), supply: [6000, 4800, 5500, 5300, 6000, 5400, 5200, 8000]};
  assert.deepEqual(gapRuns(proj), [{kind: 'red', k0: 1, k1: 2, mw: 500}, {kind: 'amber', k0: 3, k1: 3, mw: 200}, {kind: 'amber', k0: 5, k1: 6, mw: 400}, {kind: 'red', k0: 7, k1: 7, mw: 1000}]);
  // drawn: a trip gives a red run; widening the likely range gives amber ones too
  const {stack, doc} = mount();
  const vm = await tripVm();
  stack.update(vm);
  assert.ok(stack.debug.stats.gapMarks.includes('red:back:!'), stack.debug.stats.gapMarks.join());
  const calm = await morning();
  // An unchanged stack is not redrawn (F-11), so a draw is measured on the first frame of each state.
  const quiet = doc.canvasStats.calls;
  stack.update(calm);
  const perFrame = doc.canvasStats.calls - quiet;
  const idle = doc.canvasStats.calls, skips = stack.debug.stats.skips;
  stack.update(calm);
  assert.equal(doc.canvasStats.calls, idle, 'the same frame again draws nothing');
  assert.equal(stack.debug.stats.skips, skips + 1);
  const wide = await morning();
  wide.obs.forecast.demandP50 = wide.obs.forecast.demandP50.map(v => v * 0.5);
  wide.obs.forecast.demandP90 = wide.obs.forecast.demandP90.map(v => v * 2);
  wide.obs.plan.rev++;
  const c0 = doc.canvasStats.calls;
  stack.update(wide);
  const marks = stack.debug.stats.gapMarks;
  assert.ok(marks.includes('amber:forward:~'), marks.join());
  assert.equal(marks.length, gapRuns(stack.debug.proj).length, 'one glyph per run');
  assert.ok(doc.canvasStats.calls - c0 > perFrame, 'the pattern and the glyphs are drawn');
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('K-23: the stack canvas has a text alternative (role img, aria-label), refreshed at most once per real second; keys stay on its own element', async () => {
  const {stack, cv, sent} = mount();
  const vm = await morning();
  vm.frame.nowMs = 10000;
  stack.update(vm);
  assert.equal(cv.getAttribute('role'), 'img');
  const a = cv.getAttribute('aria-label');
  assert.match(a, /^Live Stack at \d\d:\d\d: the plan for the next 4\.5 hours\. Planned supply [\d,]+ MW against a forecast of [\d,]+ MW/);
  assert.equal(a, stackSummary(stack.debug.proj, vm.obs, false));
  // a trip changes the picture; the label follows within a second, not every frame
  const trip = await tripVm({mode: {mode: 'WATCH', rate: 0.15, watchS: 0.5, locked: true, watchVersion: 'full'}});
  trip.frame.nowMs = 10500;
  stack.update(trip);
  assert.equal(cv.getAttribute('aria-label'), a, 'not yet');
  trip.frame.nowMs = 11000;
  stack.update(trip);
  const b = cv.getAttribute('aria-label');
  assert.match(b, /SHORT \d\d:\d\d to \d\d:\d\d, up to [\d,]+ MW below the forecast\./);
  assert.match(b, /Read-only during the watch\./);
  let sets = 0;
  const set = cv.setAttribute.bind(cv);
  cv.setAttribute = (k, v) => { if (k === 'aria-label') sets++; set(k, v); };
  for (let i = 0; i < 180; i++) { trip.frame.nowMs = 11016 + i * 16; trip.obs.s += 1; stack.update(trip); } // 3 real s, the clock moving
  assert.ok(sets <= 3, sets + ' label writes in 3 s');
  // the words name each kind, so the summary never leans on colour
  assert.match(stackSummary({n: 2, gap: ['amber', ''], p50: [5000, 5000], p90: [5600, 5600], supply: [5200, 6000], times: [300, 600]}, {s: 0}, false), /TIGHT .* below the top of the likely range\./);
  assert.match(stackSummary({n: 1, gap: [''], p50: [5000], p90: [5600], supply: [6000], times: [300]}, {s: 0}, false), /No gaps\./);
  // §13.3: the stack handles its own keys on its element and stops them, so it exposes no key() for the shell to forward
  assert.equal(stack.key, undefined);
  const ok = await morning();
  stack.update(ok);
  stack.el.focus();
  const ev = stack.el.dispatch('keydown', {key: '2'});
  assert.ok(ev.defaultPrevented && ev.stopped, 'handled once, on the element');
  assert.equal(sent.length, 0);
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
      // The frame's cost is the update's: an unchanged stack is not redrawn (F-11), so drawMs
      // alone would only ever hold the last full draw.
      const t0 = performance.now();
      stack.update(vm);
      if (i >= 30) ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    best = Math.min(best, ms[Math.floor(ms.length * 0.95)]);
  }
  assert.ok(best <= 4 * scale, 'p95 ' + best.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms here)');
  assert.ok(stack.debug.stats.recomputes <= 20, stack.debug.stats.recomputes + ' recomputes');
});

// ------------------------------------------------------------------ Phase 2a: the belly (desk/README §21.5)

let BELLY = null;
/**
 * A real mild weekend at 12:30 with nobody at the desk (desk-weekend, seed 1): rooftop near its
 * peak, the dispatch spilling, the price negative, the evening short. Six past columns in
 * app/game.js's form (column means), the rooftop among them.
 */
function bellyVm(over) {
  BELLY ||= deskDayVm({seed: 1, untilH: 12.5, scenario: DESK_WEEKEND, follow: false}).obs;
  const c = structuredClone(BELLY), from = c.forecast.fromS;
  const hist = {colFromS: from - 6 * 300, colS: 300, freq: [], demand: [2150, 2120, 2090, 2060, 2030, 2000], rooftop: [3050, 3080, 3110, 3140, 3170, 3200],
    stations: {coal: [720, 720, 720, 720, 720, 720], wind: [500, 500, 500, 500, 500, 500], tie: [-300, -300, -300, -300, -300, -300]}};
  return baseVm(c, Object.assign({hist}, over));
}

/** Record every fillText on a canvas from now on: [{text, fill}]. */
function spyText(cv) {
  const ctx = cv.getContext('2d'), seen = [];
  ctx.fillText = text => { seen.push({text: String(text), fill: ctx.fillStyle}); };
  return seen;
}

/**
 * Record what reaches a canvas from now on, in order (the counters in debug.stats say what the
 * code meant to draw; this is what it drew): every fill, stroke and clip with the path it was
 * given ([['M', x, y] | ['L', x, y] | ['R', x, y, w, h] | ['Z']]) and the style in force, every
 * fillRect and fillText. The stand-in context still counts the calls and rejects NaN.
 */
function spyCanvas(cv) {
  const ctx = cv.getContext('2d'), log = [];
  let path = [];
  ctx.beginPath = () => { path = []; };
  ctx.moveTo = (x, y) => { path.push(['M', x, y]); };
  ctx.lineTo = (x, y) => { path.push(['L', x, y]); };
  ctx.rect = (x, y, w, h) => { path.push(['R', x, y, w, h]); };
  ctx.closePath = () => { path.push(['Z']); };
  ctx.stroke = () => { log.push({op: 'stroke', style: ctx.strokeStyle, path: path.slice()}); };
  ctx.fill = () => { log.push({op: 'fill', style: ctx.fillStyle, path: path.slice()}); };
  ctx.clip = () => { log.push({op: 'clip', path: path.slice()}); };
  ctx.fillRect = (x, y, w, h) => { log.push({op: 'fillRect', style: ctx.fillStyle, x, y, w, h}); };
  ctx.fillText = (text, x, y) => { log.push({op: 'fillText', style: ctx.fillStyle, text: String(text), x, y}); };
  return log;
}
/** '#f1d35c' -> 'rgba(241,211,92,': the start of any translucent form of a palette colour. */
const rgbaOf = hex => 'rgba(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',') + ',';
const alphaOf = style => Number(/,([\d.]+)\)$/.exec(style)[1]);
const near = (a, b) => Math.abs(a - b) < 1e-6;
/** x of the left and right edge of future column k as the stack draws it (the first one starts at the now line). */
const colX = (G, P, s, k) => [k === 0 ? G.x(s) : G.x(P.times[k - 1]), G.x(P.times[k])];

test('L-2 (2a): the silhouette and the hatched rooftop bite sit above the skyline, past columns included; ROOFTOP in the big layout; nothing at night or on CLASSIC', async () => {
  const {stack, doc, cv} = mount();
  const vm = bellyVm();
  assert.deepEqual(vm.obs.day, {temp: 'MILD', weekend: true});
  const log = spyCanvas(cv);
  stack.update(vm);
  const P = stack.debug.proj, R = stack.debug.stats.rooftop;
  const clips = log.filter(e => e.op === 'clip').length, text = log.filter(e => e.op === 'fillText');
  assert.ok(P.rooftop[0] > 2500, 'a mild noon: ' + P.rooftop[0]);
  assert.deepEqual({future: R.future, past: R.past, word: R.word}, {future: true, past: 6, word: false});
  assert.equal(R.mw, Math.max(...P.rooftop));
  assert.equal(clips, 1, 'one clip for the whole bite');
  assert.ok(!text.some(t => t.text === 'ROOFTOP'), 'no word at the floor');
  // What reached the canvas. (1) The bite, as the clip: one rectangle per past column from the
  // history's demand up to demand + rooftop, then the polygon between the skyline (P50) and the
  // silhouette (P50 + rooftop) over the 54 columns ahead.
  {
    const G = stack.debug.geom, n = P.n;
    const ci = log.findIndex(e => e.op === 'clip'), bite = log[ci].path;
    const rects = bite.filter(c => c[0] === 'R');
    assert.equal(rects.length, 6, 'the six past columns');
    rects.forEach((c, p) => {
      const d = vm.hist.demand[p], r = vm.hist.rooftop[p], x0 = G.x(P.pastTimes[p] - 300);
      assert.ok(near(c[1], x0) && near(c[2], G.y(d + r)) && near(c[3], G.x(P.pastTimes[p]) - x0) && near(c[4], G.y(d) - G.y(d + r)), 'past column ' + p + ': ' + c);
      assert.ok(c[4] > 30, 'about 3,100 MW of rooftop is ' + c[4].toFixed(1) + ' px tall');
    });
    const poly = bite.filter(c => c[0] === 'M' || c[0] === 'L');
    assert.equal(poly.length, 2 * n + 2);
    assert.ok(poly[0][0] === 'M' && near(poly[0][1], G.x(vm.obs.s)) && near(poly[0][2], G.y(P.p50[0] + P.rooftop[0])), 'it starts on the now line');
    const skyline = log.findLast(e => e.op === 'stroke' && e.style === UI.skyline && e.path.length === n + 1);
    assert.ok(skyline, 'the P50 skyline is drawn');
    for (let k = 0; k < n; k++) {
      const top = poly[1 + k], bottom = poly[2 * n - k];
      assert.ok(near(top[1], G.x(P.times[k])) && near(top[2], G.y(P.p50[k] + P.rooftop[k])), 'the top edge at column ' + k);
      assert.ok(near(bottom[1], G.x(P.times[k])) && near(bottom[2], G.y(P.p50[k])), 'the bottom edge at column ' + k);
      assert.ok(near(bottom[2], skyline.path[k + 1][2]), 'the bite stands on the skyline');
      if (P.rooftop[k] > 1) assert.ok(top[2] < bottom[2], 'above the skyline at column ' + k + ' (y grows downward)');
    }
    assert.ok(near(poly[2 * n + 1][1], G.x(vm.obs.s)) && near(poly[2 * n + 1][2], G.y(P.p50[0])));
    // (2) the hatch, inside that clip: sun-yellow "\\\" lines 9 px apart, from one side of the bite to the other
    const hatch = log[ci + 1];
    assert.equal(hatch.op, 'stroke');
    assert.ok(hatch.style.startsWith(rgbaOf(COLOURS.solar)) && alphaOf(hatch.style) > 0.2 && alphaOf(hatch.style) < 0.6, 'sun-yellow, and light: ' + hatch.style);
    assert.equal(hatch.path.length % 2, 0);
    const xa = G.x(P.pastTimes[0] - 300), xb = G.x(P.times[n - 1]);
    assert.ok(hatch.path.length / 2 >= (xb - xa) / 9, hatch.path.length / 2 + ' lines over ' + (xb - xa).toFixed(0) + ' px');
    for (let i = 0; i < hatch.path.length; i += 2) {
      const a = hatch.path[i], b = hatch.path[i + 1];
      assert.ok(a[0] === 'M' && b[0] === 'L' && b[1] - a[1] > 30 && near(b[1] - a[1], b[2] - a[2]), 'a line down to the right: ' + a + ' -> ' + b);
      if (i) assert.ok(near(a[1] - hatch.path[i - 2][1], 9), 'sparse: 9 px apart');
    }
    assert.ok(hatch.path[0][1] <= xa && hatch.path[hatch.path.length - 1][1] >= xb - 9, 'from the first past column to the last column ahead');
    // (3) the silhouette, drawn after the clip is gone: a faint line, stepped over the past columns, then the top edge of the bite
    const sil = log[ci + 2];
    assert.equal(sil.op, 'stroke');
    assert.ok(sil.style.startsWith(rgbaOf(UI.skyline)) && alphaOf(sil.style) <= 0.6, 'the skyline\'s colour, fainter: ' + sil.style);
    assert.equal(sil.path.length, 2 * 6 + 1 + n);
    for (let p = 0; p < 6; p++) {
      const a = sil.path[2 * p], b = sil.path[2 * p + 1], y = G.y(vm.hist.demand[p] + vm.hist.rooftop[p]);
      assert.ok(a[0] === 'M' && b[0] === 'L' && near(a[1], G.x(P.pastTimes[p] - 300)) && near(b[1], G.x(P.pastTimes[p])) && near(a[2], y) && near(b[2], y), 'past step ' + p);
      assert.ok(y < G.y(vm.hist.demand[p]), 'above the past skyline');
    }
    assert.deepEqual(sil.path.slice(12), poly.slice(0, n + 1), 'ahead: the top edge of the bite, point for point');
  }
  // the same view without rooftop draws less: the hatch and the silhouette are real strokes
  const bare = bellyVm({hist: undefined});
  bare.obs.forecast.rooftopMW = bare.obs.forecast.rooftopMW.map(() => 0);
  const a = mount(), b = mount();
  a.stack.update(bellyVm({hist: undefined}));
  b.stack.update(bare);
  assert.ok(a.doc.canvasStats.calls > b.doc.canvasStats.calls + 100, a.doc.canvasStats.calls + ' calls with the bite, ' + b.doc.canvasStats.calls + ' without');
  assert.deepEqual(b.stack.debug.stats.rooftop, {mw: 0, future: false, past: 0, word: false});
  assert.equal(a.stack.debug.stats.rooftop.past, 0, 'no history: no past bite');
  // the big layout says the word, in the sun's colour, inside the bite
  const big = mount(1248, 420);
  const words = spyText(big.cv);
  big.stack.update(bellyVm({stackExpanded: true}));
  assert.equal(big.stack.debug.stats.rooftop.word, true);
  assert.deepEqual(words.filter(t => t.text === 'ROOFTOP'), [{text: 'ROOFTOP', fill: COLOURS.solar}]);
  // a hover in the bite says what it is (K-23: the same is in the text alternative)
  const G = big.stack.debug.geom, Q = big.stack.debug.proj, k = 40;
  assert.ok(Q.rooftop[k] > 1000 && !Q.blue[k]);
  at(big.cv, 'pointermove', G.x(Q.times[k]) - 2, G.y(Q.p50[k] + Q.rooftop[k] * 0.8));
  const tip = big.stack.el.querySelector('.livestack-tip');
  assert.ok(!tip.hidden);
  assert.match(tip.textContent, /^ROOFTOP SOLAR [\d,]+ MW at \d\d:\d\d\n/);
  assert.equal(big.stack.debug.hitTest(G.x(Q.times[k]) - 2, G.y(Q.p50[k] + Q.rooftop[k] * 0.8)).kind, 'empty', 'a press there grabs nothing');
  // night, and the scenario with no rooftop: nothing of it is drawn
  const night = bellyVm();
  night.obs.forecast.rooftopMW = night.obs.forecast.rooftopMW.map(() => 0);
  night.hist.rooftop = night.hist.rooftop.map(() => 0);
  const n = mount();
  n.stack.update(night);
  assert.deepEqual(n.stack.debug.stats.rooftop, {mw: 0, future: false, past: 0, word: false});
  const c = mount();
  c.stack.update(await morning());
  assert.deepEqual(c.stack.debug.stats.rooftop, {mw: 0, future: false, past: 0, word: false});
  for (const m of [doc, a.doc, b.doc, big.doc, n.doc, c.doc]) assert.deepEqual(m.canvasStats.bad, []);
});

test('C-11 / K-22: blue SURPLUS columns carry bars, a glyph and the word, never colour alone; a minimum height; the hover line; never a gap kind', async () => {
  const {stack, cv, ui, sent, doc} = mount();
  const log = spyCanvas(cv);
  const vm = bellyVm();
  stack.update(vm);
  const text = log.filter(e => e.op === 'fillText').map(e => ({text: e.text, fill: e.style}));
  const P = stack.debug.proj, S = stack.debug.stats.surplus, runs = PV.blueRuns(P);
  assert.equal(runs.length, 1);
  assert.ok(runs[0].mw > 400 && runs[0].k1 - runs[0].k0 >= 12, JSON.stringify(runs));
  assert.equal(S.cols, P.blue.reduce((x, v) => x + v, 0));
  assert.ok(S.minPx >= SURPLUS_MIN_PX);
  // blue is its own thing: no gap column is 'blue', and its run is marked beside the red and amber ones
  assert.ok(P.gap.every(g => g === '' || g === 'red' || g === 'amber'));
  const gaps = gapRuns(P), marks = stack.debug.stats.gapMarks;
  // the fixture: the evening is short of P90; it is within a few MW of P50, drift that is no red gap (L-5: GAP_MIN_MW)
  assert.ok(gaps.some(r => r.kind === 'amber') && !gaps.some(r => r.kind === 'red'), 'the fixture: the evening is amber');
  assert.equal(marks.length, gaps.length + runs.length, 'one mark per run');
  assert.deepEqual(marks.filter(m => m.startsWith('blue')), ['blue:bars:+']);
  assert.equal(S.word, 1);
  assert.ok(text.some(t => t.text === GAP_MARK.blue.glyph + ' ' + GAP_MARK.blue.word), 'the word is drawn on a wide run: ' + text.map(t => t.text).join('|'));
  // What reached the canvas. (1) Every blue column is filled in blue, from its MW above the demand
  // line (P50 + exports + charging) down to that line, across its own five minutes.
  const G = stack.debug.geom, k = 6;
  const cols = [];
  for (let q = 0; q < P.n; q++) if (P.blue[q]) cols.push(q);
  const edges = q => {
    const [x0, x1] = colX(G, P, vm.obs.s, q), yb = G.y(P.p50[q] + P.exports[q] + P.charging[q]);
    return {x0, x1, yb, yt: Math.min(G.y(P.p50[q] + P.exports[q] + P.charging[q] + P.surplusMW[q]), yb - SURPLUS_MIN_PX)};
  };
  const blueFills = l => l.filter(e => e.op === 'fillRect' && typeof e.style === 'string' && e.style.startsWith(rgbaOf(UI.blue)));
  const fills = blueFills(log);
  assert.equal(fills.length, cols.length, 'one blue rectangle per blue column');
  cols.forEach((q, i) => {
    const e = edges(q), f = fills[i];
    assert.ok(near(f.x, e.x0) && near(f.w, e.x1 - e.x0) && near(f.y, e.yt) && near(f.h, e.yb - e.yt), 'column ' + q + ': ' + JSON.stringify(f) + ' against ' + JSON.stringify(e));
    assert.ok(f.w > 3 && f.h >= SURPLUS_MIN_PX);
  });
  assert.ok(P.exports[k] > 100 && near(fills[cols.indexOf(k)].y + fills[cols.indexOf(k)].h, G.y(P.p50[k] + P.exports[k])), 'the fixture: the tie is exporting, and the blue stands above that');
  // (2) ... and barred, never colour alone: the very next stroke is upright lines on a 3-px grid, inside
  // those columns, each from the column's top to the demand line
  const bars = log[log.indexOf(fills[fills.length - 1]) + 1];
  assert.equal(bars.op, 'stroke');
  assert.ok(!bars.style.startsWith(rgbaOf(UI.blue)), 'not in the fill\'s colour: ' + bars.style);
  let wantBars = 0;
  for (const q of cols) { const e = edges(q); for (let bx = Math.ceil(e.x0 / 3) * 3 + 0.5; bx < e.x1; bx += 3) wantBars++; }
  assert.equal(bars.path.length, 2 * wantBars, 'a bar on every third pixel of every blue column');
  assert.ok(wantBars >= cols.length, 'at least one a column');
  for (let i = 0; i < bars.path.length; i += 2) {
    const m = bars.path[i], l = bars.path[i + 1];
    assert.ok(m[0] === 'M' && l[0] === 'L' && m[1] === l[1] && near((m[1] - 0.5) % 3, 0), 'upright, on the grid: ' + m + ' -> ' + l);
    const q = cols.find(c => m[1] >= edges(c).x0 && m[1] < edges(c).x1);
    assert.ok(q !== undefined && near(m[2], edges(q).yt) && near(l[2], edges(q).yb), 'inside a blue column, top to base: ' + m + ' -> ' + l);
  }
  // the hover line, inside a column: what will be spilled and the two things that save it
  const base = P.p50[k] + P.exports[k] + P.charging[k];
  const x = (G.x(P.times[k]) + G.x(P.times[k] - 300)) / 2, y = (G.y(base) + Math.min(G.y(base + P.surplusMW[k]), G.y(base) - SURPLUS_MIN_PX)) / 2;
  at(cv, 'pointermove', x, y);
  // the hovered run is drawn brighter on the next frame, and as it was once the pointer has gone
  const rest = alphaOf(fills[0].style);
  log.length = 0;
  stack.update(vm);
  assert.equal(blueFills(log).length, cols.length, 'a hover redraws the stack');
  assert.ok(blueFills(log).every(f => alphaOf(f.style) > rest), 'brighter under the pointer');
  const tip = stack.el.querySelector('.livestack-tip');
  assert.ok(!tip.hidden);
  assert.equal(tip.textContent, 'SURPLUS at ' + clockText(P.times[k], false) + '\n' +
    Math.round(P.surplusMW[k]).toLocaleString('en-AU') + ' MW will be spilled: stop a unit, or charge the battery');
  assert.match(tip.textContent, /\n\d+ MW will be spilled: stop a unit, or charge the battery$/);
  assert.ok(parseFloat(tip.style.left) + tip.textContent.split('\n')[1].length * 5 <= G.W, 'the line stays inside the box');
  assert.deepEqual(ui[ui.length - 1], {do: 'hover', target: null});
  // a press in the same place never grabs the blue (it takes the handle or the edge under it, or nothing)
  assert.notEqual(stack.debug.hitTest(x, y).kind, 'surplus');
  assert.equal(stack.debug.hitTest(x, y, true).kind, 'surplus');
  at(cv, 'pointerleave', 0, 0);
  log.length = 0;
  stack.update(vm);
  assert.ok(blueFills(log).length === cols.length && blueFills(log).every(f => alphaOf(f.style) === rest), 'at rest again');
  // a small spill is still seen: 60 MW is under 1 px of this axis and is drawn SURPLUS_MIN_PX tall, the glyph alone over a narrow run
  const small = bellyVm();
  const fc = small.obs.forecast, lift = runs[0].mw - 60;
  for (const key of ['demandP50', 'demandP10', 'demandP90']) fc[key] = fc[key].map(v => v + lift);
  const m2 = mount();
  const log2 = spyCanvas(m2.cv);
  m2.stack.update(small);
  const t2 = log2.filter(e => e.op === 'fillText');
  assert.ok(blueFills(log2).length >= 1 && blueFills(log2).every(f => near(f.h, SURPLUS_MIN_PX)), 'every blue rectangle of the small spill is ' + SURPLUS_MIN_PX + ' px tall');
  const P2 = m2.stack.debug.proj, S2 = m2.stack.debug.stats.surplus;
  assert.ok(S2.cols >= 1 && S2.cols < 12 && Math.max(...P2.surplusMW) <= 60 + 1e-6, S2.cols + ' columns up to ' + Math.max(...P2.surplusMW));
  assert.equal(S2.minPx, SURPLUS_MIN_PX);
  assert.ok((G.y(0) - G.y(60)) < 1, 'unseen without the minimum');
  assert.equal(S2.word, 0);
  assert.ok(t2.some(t => t.text === GAP_MARK.blue.glyph) && !t2.some(t => t.text.includes(GAP_MARK.blue.word)));
  // no surplus, nothing blue (the classic day)
  const c = mount();
  c.stack.update(await morning());
  assert.deepEqual(c.stack.debug.stats.surplus, {cols: 0, minPx: 0, word: 0});
  assert.equal(sent.length, 0);
  for (const m of [doc, m2.doc, c.doc]) assert.deepEqual(m.canvasStats.bad, []);
});

test('P-9: the price goes through priceText; a negative price is in its own colour with the word SPILL; a price change redraws the stack', async () => {
  const {stack, cv} = mount();
  const text = spyText(cv);
  const vm = bellyVm();
  assert.equal(vm.obs.price.mwh, -20, 'the fixture: wind and solar are setting the price');
  stack.update(vm);
  assert.deepEqual(stack.debug.stats.price, {text: 'SPILL \u2212$20/MWh', spill: true});
  assert.deepEqual(text.filter(t => /MWh$/.test(t.text)), [{text: 'SPILL \u2212$20/MWh', fill: UI.blue}]);
  // an unchanged frame is skipped; the price alone changing is drawn at once
  const d0 = stack.debug.stats.draws;
  stack.update(vm);
  assert.equal(stack.debug.stats.draws, d0);
  text.length = 0;
  vm.obs.price.mwh = 26.4;
  stack.update(vm);
  assert.equal(stack.debug.stats.draws, d0 + 1);
  assert.deepEqual(text.filter(t => /MWh$/.test(t.text)), [{text: '$26/MWh', fill: UI.text}]);
  text.length = 0;
  vm.obs.price.mwh = 1400;
  stack.update(vm);
  assert.deepEqual(text.filter(t => /MWh$/.test(t.text)), [{text: '$1,400/MWh', fill: UI.amber}]);
  // a layer's tooltip prices its offer the same way (wind and solar bid below zero)
  const G = stack.debug.geom, P = stack.debug.proj;
  at(cv, 'pointermove', G.x(P.times[30]) - 2, G.y(P.layers[0].mw[30] / 2));
  assert.match(stack.el.querySelector('.livestack-tip').textContent, /cost \u2212\$20\/MWh\nprice now \$1,400\/MWh$/);
  // no price at all (an older view): no text, no throw
  const bare = bellyVm();
  delete bare.obs.price;
  const m = mount();
  m.stack.update(bare);
  assert.deepEqual(m.stack.debug.stats.price, {text: '', spill: false});
});

test('K-23 (2a): the text alternative says the surplus runs and the rooftop, after its present sentences', async () => {
  const {stack, cv} = mount();
  const vm = bellyVm();
  stack.update(vm);
  const P = stack.debug.proj, a = cv.getAttribute('aria-label');
  assert.equal(a, stackSummary(P, vm.obs, false));
  assert.match(a, /^Live Stack at \d\d:\d\d: the plan for the next 4\.5 hours\. Planned supply [\d,]+ MW against a forecast of [\d,]+ MW/);
  assert.match(a, / SURPLUS \d\d:\d\d to \d\d:\d\d, up to [\d,]+ MW will be spilled\. Rooftop solar meets [\d,]+ MW of demand now, [\d,]+ MW by \d\d:\d\d\.$/);
  const run = PV.blueRuns(P)[0];
  assert.ok(a.includes('up to ' + Math.round(run.mw).toLocaleString('en-AU') + ' MW will be spilled.'));
  assert.ok(a.includes('Rooftop solar meets ' + Math.round(P.rooftop[0]).toLocaleString('en-AU') + ' MW of demand now'));
  // after everything it said before: the gaps, and the watch's sentence
  const locked = stackSummary(P, vm.obs, true);
  const last = Math.max(locked.lastIndexOf('below the forecast.'), locked.lastIndexOf('below the top of the likely range.'), locked.indexOf('Read-only during the watch.'));
  assert.ok(last > 0 && locked.indexOf('SURPLUS') > last && locked.indexOf('Rooftop solar') > locked.indexOf('SURPLUS'), locked);
  // the sentences themselves, on a made-up projection: the first two surplus runs (each from the start of
  // its first column to the end of its last, with its largest MW), never a third; the rooftop now and at the far end
  const times = Float64Array.from({length: 8}, (_, q) => 28800 + 300 * (q + 1));   // 12:05 ... 12:40
  const made = {n: 8, times, gap: new Array(8).fill(''), p50: new Array(8).fill(3000), p90: new Array(8).fill(3200), supply: new Array(8).fill(3300),
    surplusMW: Float64Array.from([0, 120, 300, 60, 0, 51, 0, 80]), rooftop: Float64Array.from([3000, 2900, 2800, 2700, 2600, 2500, 2400, 1234.4])};
  assert.equal(clockText(28800, false), '12:00');
  assert.equal(stackSummary(made, {s: 28800}, false), 'Live Stack at 12:00: the plan for the next 4.5 hours. Planned supply 3,300 MW against a forecast of 3,000 MW; ' +
    '3,300 against 3,000 MW by 12:40. No gaps. SURPLUS 12:05 to 12:20, up to 300 MW will be spilled. SURPLUS 12:25 to 12:30, up to 51 MW will be spilled. ' +
    'Rooftop solar meets 3,000 MW of demand now, 1,234 MW by 12:40.');
  made.rooftop = Float64Array.from([0, 0, 0, 0, 0, 0, 0, 0]);
  assert.match(stackSummary(made, {s: 28800}, false), /up to 51 MW will be spilled\.$/, 'no rooftop, no rooftop sentence');
  made.rooftop = Float64Array.from([0, 0, 0, 0, 0, 0, 0, 800]);
  assert.match(stackSummary(made, {s: 28800}, false), / Rooftop solar meets 0 MW of demand now, 800 MW by 12:40\.$/, 'before sunrise, with the sun coming');
  // the classic day says neither, word for word as before
  const calm = await morning();
  const m = mount();
  m.stack.update(calm);
  const c = m.cv.getAttribute('aria-label');
  assert.ok(!/SURPLUS|Rooftop/.test(c), c);
  assert.match(c, /(below the forecast|below the top of the likely range|No gaps)\.$/);
});

test('F-11 / §21.5: what the belly adds is in the redraw key; the projection tolerates the new keys missing', async () => {
  const {stack, doc} = mount();
  const vm = bellyVm();
  stack.update(vm);
  const st = stack.debug.stats, d0 = st.draws;
  for (let i = 0; i < 5; i++) stack.update(vm);
  assert.equal(st.draws, d0, 'at rest the belly costs no redraw');
  assert.equal(st.skips, 5);
  // the past rooftop moves with the now line: a new history is on the next 15-grid-s step
  vm.hist.rooftop = vm.hist.rooftop.map((v, i) => (i < 3 ? NaN : v));
  vm.obs.s += 15;
  stack.update(vm);
  assert.equal(st.draws, d0 + 1);
  assert.equal(st.rooftop.past, 3);
  // the forecast rooftop and the surplus come with the projection: a new plan revision redraws them
  vm.obs.forecast.rooftopMW = vm.obs.forecast.rooftopMW.map(v => v / 2);
  vm.obs.forecast.demandP50 = vm.obs.forecast.demandP50.map(v => v + 5000);
  vm.obs.plan.rev++;
  stack.update(vm);
  assert.equal(st.draws, d0 + 2);
  assert.ok(Math.abs(st.rooftop.mw - Math.max(...BELLY.forecast.rooftopMW) / 2) < 1e-6);
  assert.equal(st.surplus.cols, 0, 'demand took the surplus');
  // views from before Phase 2a: no rooftop in the forecast or the view, no export limit, a history without rooftop
  const old = bellyVm();
  delete old.obs.forecast.rooftopMW; delete old.obs.forecast.exportLimitMW; delete old.obs.forecast.underlyingP50; delete old.obs.rooftop; delete old.obs.msl; delete old.obs.day;
  delete old.hist.rooftop;
  const m = mount();
  m.stack.update(old);
  assert.deepEqual(m.stack.debug.stats.rooftop, {mw: 0, future: false, past: 0, word: false});
  assert.deepEqual([...doc.canvasStats.bad, ...m.doc.canvasStats.bad], []);
});

/**
 * The p95 of a frame's cost over a fixed sequence of frames, with the machine's noise taken out:
 * the sequence is run `reps` times after a warm-up pass and each frame keeps its fastest time.
 * Another process taking the CPU (node --test runs every file at once) or a collection lands on
 * different frames each pass; the work a frame does is the same every pass. So this is the
 * stack's own p95, where a single pass's p95 on a loaded machine is the scheduler's.
 */
function quietP95(frames, frame, reps = 4) {
  const best = new Float64Array(frames).fill(Infinity);
  for (let r = 0; r <= reps; r++) {
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      frame(i);
      const dt = performance.now() - t0;
      if (r > 0 && dt < best[i]) best[i] = dt;
    }
  }
  return Array.from(best).sort((x, y) => x - y)[Math.floor(frames * 0.95)];
}

test('L-1 (2a): render <= 4 ms with the belly drawn (rooftop bite, past columns, blue surplus), floor and expanded', async t => {
  // The same measure as the L-1 test above (p95 of the update over 120 frames, a plan change every
  // 30), on the real mild noon; then the p95 with the clock moving, as in play; then the p95 of
  // the frame that recomputes and redraws everything. The budget is in yardstick units, as above;
  // when a measure is over it the yardstick is read again, in case the machine got busier since
  // the first reading (the budget only ever follows the machine, never the stack).
  let scale = Math.max(1, yardstickNs(5) / OWNER_YARD_NS);
  const over = ms => {
    if (ms <= 4 * scale) return false;
    scale = Math.max(scale, yardstickNs(5) / OWNER_YARD_NS);
    return ms > 4 * scale;
  };
  for (const [w, h] of [[336, 164], [1248, 420]]) {
    const {stack} = mount(w, h);
    const vm = bellyVm({stackExpanded: w > 600});
    const st = stack.debug.stats;
    let best = Infinity, f = 0;
    for (let run = 0; run < 3 && best > 4 * scale; run++) {
      const ms = [];
      for (let i = 0; i < 150; i++, f++) {
        vm.frame = {nowMs: 1000 + f * 16, dtS: 1 / 60, alpha: 0};
        if (i % 30 === 0) vm.obs.plan.rev++;
        const t0 = performance.now();
        stack.update(vm);
        if (i >= 30) ms.push(performance.now() - t0);
      }
      ms.sort((x, y) => x - y);
      best = Math.min(best, ms[Math.floor(ms.length * 0.95)]);
    }
    assert.ok(st.rooftop.future && st.surplus.cols > 0, 'the belly was drawn');
    assert.ok(!over(best), w + ' px: p95 ' + best.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms here)');
    // With the clock frozen, as above, 4 frames of 120 draw and that p95 is a skipped frame. In
    // play the clock moves: the now line steps every 15 grid-s (a redraw) and the projection is
    // recomputed every 30. 2 grid-s a frame is the 120x day at 60 fps; at 6 grid-s a frame (fast
    // forward) two frames in five redraw and one in five recomputes, so the p95 IS such a frame.
    const s0 = vm.obs.s, N = 150;
    const said = [];
    for (const stepS of [2, 6]) {
      let d0 = 0, r0 = 0;
      const p95 = quietP95(N, i => {
        if (i === 0) { d0 = st.draws; r0 = st.recomputes; }
        vm.frame = {nowMs: 1000 + f++ * 16, dtS: 1 / 60, alpha: 0};
        vm.obs.s = s0 + i * stepS;
        stack.update(vm);
      });
      const draws = st.draws - d0, recomputes = st.recomputes - r0;
      assert.ok(draws >= N * stepS / 15 - 1 && draws <= N * stepS / 15 + 2 && recomputes >= N * stepS / 30 - 1, stepS + ' grid-s a frame: ' + draws + ' redraws and ' + recomputes + ' recomputes in ' + N + ' frames');
      if (stepS === 6) assert.ok(recomputes > 0.05 * N, 'more than one frame in twenty recomputes and redraws: the p95 frame is one of them');
      assert.ok(!over(p95), w + ' px, the clock moving ' + stepS + ' grid-s a frame: p95 ' + p95.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms here)');
      said.push(stepS + ' grid-s a frame ' + p95.toFixed(2) + ' ms');
    }
    vm.obs.s = s0;
    // and every frame recomputing and redrawing everything (a plan edited every frame)
    const d1 = st.draws, r1 = st.recomputes;
    const full = quietP95(40, () => {
      vm.frame = {nowMs: 1000 + f++ * 16, dtS: 1 / 60, alpha: 0};
      vm.obs.plan.rev++;
      stack.update(vm);
    });
    assert.deepEqual([st.draws - d1, st.recomputes - r1], [200, 200], 'every one of these frames recomputed and redrew');
    assert.ok(!over(full), w + ' px: a full recompute and redraw, p95 ' + full.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms here)');
    t.diagnostic(w + ' px, p95 of update: clock frozen ' + best.toFixed(3) + ' ms, ' + said.join(', ') + ', every frame a full redraw ' + full.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms at yardstick x' + scale.toFixed(2) + ')');
  }
});

test('Q-41: a click with no drag on a ghost, a booked start or an edge says what to drag, in blue; a refusal is red; the watch lock is blue and true about Esc', async () => {
  const {stack, cv, doc} = mount(1248, 420);
  const vm = await morning();
  const msg = stack.el.querySelector('.livestack-msg');
  const blue = re => { assert.match(msg.textContent, re); assert.ok(msg.classList.contains('info'), msg.className); assert.equal(msg.style.color, UI.blue); };
  const click = (x, y) => { at(cv, 'pointerdown', x, y); at(cv, 'pointerup', x, y); };
  const hit = kind => { const G = stack.debug.geom; for (let x = G.x(vm.obs.s) + 4; x < G.x1; x += 3) for (let y = G.y1; y < G.y0; y += 2) { const h = stack.debug.hitTest(x, y); if (h && h.kind === kind) return {x, y, h}; } };
  stack.update(vm);
  const gh = hit('ghost');
  assert.ok(gh, 'an off unit\'s ghost');
  const name = {gtb: 'GT·B', gtc: 'GT·C', gta: 'GT·A', ccgt: 'CCGT', coal: 'COAL', hydro: 'HYDRO'}[gh.h.station] + ' ' + gh.h.unit.replace(/\D/g, '');
  click(gh.x, gh.y);
  blue(new RegExp('^Drag right to book ' + name + "'s START$"));
  const e = hit('edge');
  click(e.x, e.y);
  blue(/^Drag to plan [A-Z·]+'s MW: right for later, up for more$/);
  vm.obs.plan.starts.push({unit: gh.h.unit, atS: vm.obs.s + 3600});
  vm.obs.plan.rev++;
  stack.update(vm);
  const s = stack.debug.handles.find(q => q.kind === 'start');
  click(s.x, s.y);
  blue(new RegExp('^Drag ' + name + "'s START sideways to move it, below the axis to unbook$"));
  // a refusal from the sim stays red
  const r = createLiveStack(doc, doc.body, {input: () => 'no room', ui() {}}), rcv = r.el.querySelector('canvas'), rmsg = r.el.querySelector('.livestack-msg');
  r.el.clientWidth = 1248; r.el.clientHeight = 420; rcv.rect = cv.rect;
  r.update(vm);
  const k = r.debug.handles.find(q => q.kind === 'key' && q.station === 'ccgt');
  at(rcv, 'pointerdown', k.x, k.y); at(rcv, 'pointermove', k.x + 25, k.y - 6); at(rcv, 'pointerup', k.x + 25, k.y - 6);
  assert.match(rmsg.textContent, /^Refused: .*no room/);
  assert.ok(rmsg.classList.contains('no'));
  assert.equal(rmsg.style.color, UI.red);
  // the watch: blue, and Esc is promised only when it would skip
  for (const canSkip of [false, true]) {
    stack.update(await tripVm({mode: {mode: 'WATCH', rate: 0.15, watchS: 2, locked: true, watchVersion: 'full', canSkip}}));
    click(gh.x, gh.y);
    blue(canSkip ? /^Read-only during the watch \(Esc skips\)$/ : /^Read-only during the watch: watch this one$/);
  }
});

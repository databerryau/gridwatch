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

test('L-2 (2a): the silhouette and the hatched rooftop bite sit above the skyline, past columns included; ROOFTOP in the big layout; nothing at night or on CLASSIC', async () => {
  const {stack, doc, cv} = mount();
  const vm = bellyVm();
  assert.deepEqual(vm.obs.day, {temp: 'MILD', weekend: true});
  let clips = 0;
  cv.getContext('2d').clip = () => { clips++; };
  const text = spyText(cv);
  stack.update(vm);
  const P = stack.debug.proj, R = stack.debug.stats.rooftop;
  assert.ok(P.rooftop[0] > 2500, 'a mild noon: ' + P.rooftop[0]);
  assert.deepEqual({future: R.future, past: R.past, word: R.word}, {future: true, past: 6, word: false});
  assert.equal(R.mw, Math.max(...P.rooftop));
  assert.equal(clips, 1, 'one clip for the whole bite');
  assert.ok(!text.some(t => t.text === 'ROOFTOP'), 'no word at the floor');
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
  const text = spyText(cv);
  const vm = bellyVm();
  stack.update(vm);
  const P = stack.debug.proj, S = stack.debug.stats.surplus, runs = PV.blueRuns(P);
  assert.equal(runs.length, 1);
  assert.ok(runs[0].mw > 400 && runs[0].k1 - runs[0].k0 >= 12, JSON.stringify(runs));
  assert.equal(S.cols, P.blue.reduce((x, v) => x + v, 0));
  assert.ok(S.minPx >= SURPLUS_MIN_PX);
  // blue is its own thing: no gap column is 'blue', and its run is marked beside the red and amber ones
  assert.ok(P.gap.every(g => g === '' || g === 'red' || g === 'amber'));
  const gaps = gapRuns(P), marks = stack.debug.stats.gapMarks;
  assert.ok(gaps.some(r => r.kind === 'red') && gaps.some(r => r.kind === 'amber'), 'the fixture: the evening is short');
  assert.equal(marks.length, gaps.length + runs.length, 'one mark per run');
  assert.deepEqual(marks.filter(m => m.startsWith('blue')), ['blue:bars:+']);
  assert.equal(S.word, 1);
  assert.ok(text.some(t => t.text === GAP_MARK.blue.glyph + ' ' + GAP_MARK.blue.word), 'the word is drawn on a wide run: ' + text.map(t => t.text).join('|'));
  // the hover line, inside a column: what will be spilled and the two things that save it
  const G = stack.debug.geom, k = 6;
  const base = P.p50[k] + P.exports[k] + P.charging[k];
  const x = (G.x(P.times[k]) + G.x(P.times[k] - 300)) / 2, y = (G.y(base) + Math.min(G.y(base + P.surplusMW[k]), G.y(base) - SURPLUS_MIN_PX)) / 2;
  at(cv, 'pointermove', x, y);
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
  // a small spill is still seen: 60 MW is under 1 px of this axis and is drawn SURPLUS_MIN_PX tall, the glyph alone over a narrow run
  const small = bellyVm();
  const fc = small.obs.forecast, lift = runs[0].mw - 60;
  for (const key of ['demandP50', 'demandP10', 'demandP90']) fc[key] = fc[key].map(v => v + lift);
  const m2 = mount();
  const t2 = spyText(m2.cv);
  m2.stack.update(small);
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

test('L-1 (2a): render <= 4 ms with the belly drawn (rooftop bite, past columns, blue surplus), floor and expanded', async () => {
  // The same measure as the L-1 test above (p95 of the update over 120 frames, a plan change every
  // 30), on the real mild noon; then the frame that recomputes and redraws everything, as the
  // median of 30 of them (one slow frame under a loaded machine is not the stack's cost).
  const scale = Math.max(1, yardstickNs(5) / OWNER_YARD_NS);
  for (const [w, h] of [[336, 164], [1248, 420]]) {
    const {stack} = mount(w, h);
    const vm = bellyVm({stackExpanded: w > 600});
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
    assert.ok(stack.debug.stats.rooftop.future && stack.debug.stats.surplus.cols > 0, 'the belly was drawn');
    assert.ok(best <= 4 * scale, w + ' px: p95 ' + best.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms here)');
    let full = Infinity;
    for (let run = 0; run < 3 && full > 4 * scale; run++) {
      const ms = [], d0 = stack.debug.stats.draws;
      for (let i = 0; i < 30; i++, f++) {
        vm.frame = {nowMs: 1000 + f * 16, dtS: 1 / 60, alpha: 0};
        vm.obs.plan.rev++;
        const t0 = performance.now();
        stack.update(vm);
        ms.push(performance.now() - t0);
      }
      assert.equal(stack.debug.stats.draws, d0 + 30, 'every one of these frames recomputed and redrew');
      ms.sort((x, y) => x - y);
      full = Math.min(full, ms[15]);
    }
    assert.ok(full <= 4 * scale, w + ' px: a full recompute and redraw takes ' + full.toFixed(2) + ' ms (budget ' + (4 * scale).toFixed(2) + ' ms here)');
  }
});

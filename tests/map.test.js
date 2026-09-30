// render/map.js + render/mapdata.js (desk/README §7; SPEC G-1, G-2 basics, G-5; X-37, X-38):
// integer scale with terrain to the frame edges at the three layouts, no building off the
// terrain, dark districts block by block, the tripped plant, rotors in the watch, <= 3 labels
// at rest, hover to the desk, no NaN.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {dayVm, baseVm} from './lib/vm-fixture.js';
import {tokenize, importSpecifiers} from './lib/js-tokens.js';
import * as D from '../render/mapdata.js';
import {createMap, mapLabels, MAX_REST_LABELS} from '../render/map.js';

let DAY = null;
async function vmOf(over, trip = false) {
  const key = trip ? 't' : 'e';
  DAY ||= {};
  if (!DAY[key]) DAY[key] = dayVm({seed: 7, untilH: 18.5, trip});
  const {obs} = await DAY[key];
  return baseVm(structuredClone(obs), over);
}

function mount(w, h) {
  const doc = makeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const ui = [];
  const map = createMap(doc, root, {ui: c => ui.push(c)});
  map.el.clientWidth = w; map.el.clientHeight = h;
  map.el.querySelector('canvas').rect = {left: 0, top: 0, width: w, height: h};
  return {doc, map, ui, cv: map.el.querySelector('canvas')};
}

// The map areas of the 1280x600 floor, a 1280x720 and a 1920x1080 viewport (SPEC §4.2 / K-17).
const AREAS = [[1280, 268], [1280, 344], [1920, 520]];

test('G-1: integer scale at 1280x600, 1280x720 and 1920x1080, terrain to the frame edges, never sky under the ground', async () => {
  for (const [w, h] of AREAS) {
    const L = D.scaleFor(w, h);
    assert.ok(Number.isInteger(L.scale) && L.scale >= 2, w + 'x' + h + ' scale ' + L.scale);
    assert.equal(L.drawW, w, 'base spans the full width');
    assert.equal(L.dx, 0);
    assert.ok(L.dy <= 0 && L.dy + L.drawH >= h, 'base covers the full height: no letterbox needed');
    assert.equal(L.srcY + L.shownH, D.BASE_H, 'bottom-anchored: the ground reaches the bottom edge');
    assert.ok(L.srcY <= D.SAFE.y, 'the floor-safe rows are all shown');
    const {map, doc} = mount(w, h);
    map.update(await vmOf());
    assert.equal(map.debug.scale, L.scale);
    assert.deepEqual(doc.canvasStats.bad, []);
  }
  // any other size letterboxes: sky only above the horizon row, ground below
  const L = D.scaleFor(1366, 700);
  assert.ok(Number.isInteger(L.scale));
  const horizon = L.dy + (D.HORIZON_Y - L.srcY) * L.scale;
  assert.ok(horizon < L.dy + L.drawH && horizon >= 0);
});

test('G-1 / X-37 / X-38: every building box lies inside the terrain and inside the rows every layout shows', async () => {
  const vm = await vmOf();
  assert.equal(vm.obs.districts.length, 32);
  const boxes = D.buildingBoxes(vm.obs.districts);
  const T = D.TERRAIN, S = D.SAFE;
  assert.ok(boxes.filter(b => b.kind === 'district').length >= 32 * 3);
  for (const id of ['coal', 'ccgt', 'gta', 'gtb', 'gtc', 'hydro', 'battery', 'tie', 'wind', 'solar']) assert.ok(boxes.some(b => b.id === id), id + ' has a building');
  for (const b of boxes) {
    assert.ok(b.fx >= T.x && b.fy >= T.y && b.fx + b.fw <= T.x + T.w && b.fy + b.fh <= T.y + T.h, 'footprint off the terrain: ' + JSON.stringify(b));
    assert.ok(b.x >= S.x && b.y >= S.y && b.x + b.w <= S.x + S.w && b.y + b.h <= S.y + S.h, 'building outside the shown rows: ' + JSON.stringify(b));
  }
  // six suburbs by name, and every district placed in its own suburb's box
  assert.deepEqual(D.SUBURBS.map(s => s.name), ['Old Hazelton', 'Harbourside', 'Tallowood Heights', 'Solstice Rise', 'Redgum Flats', 'Saltbush Bay']);
  for (const blk of D.districtBlocks(vm.obs.districts)) {
    const [x, y, w, h] = D.SUBURBS.find(s => s.id === blk.suburb).box;
    for (const b of blk.buildings) assert.ok(b.x - b.d >= x - 1e-9 && b.x + b.w <= x + w + 1e-9 && b.y <= y + h + 1e-9, blk.id);
  }
  // coal has four machines, the CCGT two, and so on (one anchor per machine)
  for (const [id, n] of [['coal', 4], ['ccgt', 2], ['gta', 1], ['gtb', 2], ['gtc', 2], ['hydro', 3]]) assert.equal(D.PLANTS.find(p => p.id === id).machines.length, n);
  // the tie line runs to the map edge
  assert.equal(D.PLANTS.find(p => p.id === 'tie').line[0][0], 0);
});

test('G-5: a shed district goes dark block by block, draws differently from a lit one, and relights on restore', async () => {
  const {map} = mount(1280, 268);
  const vm = await vmOf();
  vm.frame.nowMs = 1000;
  map.update(vm);
  const lit = structuredClone(map.debug.districts.SAL1);
  assert.equal(lit.dark, false);
  vm.obs.districts.find(d => d.id === 'SAL1').dark = true;
  vm.frame.nowMs = 1100;
  map.update(vm);
  const mid = map.debug.districts.SAL1;
  assert.ok(mid.darkBlocks >= 1 && mid.darkBlocks < mid.blocks, 'block by block: ' + mid.darkBlocks + '/' + mid.blocks);
  vm.frame.nowMs = 1900; // well inside the 1-s "identifiable" accept
  map.update(vm);
  const dark = map.debug.districts.SAL1;
  assert.equal(dark.darkBlocks, dark.blocks);
  assert.equal(dark.windows, 0);
  assert.notEqual(dark.roof, lit.roof);
  assert.equal(map.debug.districts.SAL2.dark, false);
  assert.notEqual(dark.roof, map.debug.districts.SAL2.roof, 'a dark district draws differently from its lit neighbour');
  vm.obs.districts.find(d => d.id === 'SAL1').dark = false;
  vm.frame.nowMs = 2000;
  map.update(vm);
  assert.ok(map.debug.districts.SAL1.darkBlocks > 0, 'relights block by block too');
  vm.frame.nowMs = 3000;
  map.update(vm);
  assert.equal(map.debug.districts.SAL1.darkBlocks, 0);
  assert.equal(map.debug.districts.SAL1.roof, lit.roof);
});

test('G-5: a tripped machine is labelled and its rotor spins down; rotors slow in the watch', async () => {
  const {map} = mount(1280, 268);
  const vm = await vmOf({}, true);
  const u = vm.obs.units.find(q => q.mode === 'tripped');
  assert.ok(u);
  for (let i = 0; i < 60; i++) { vm.frame.nowMs = 1000 + i * 50; map.update(vm); }
  assert.ok(map.debug.rotorSpeed(u.id) < 0.1, 'spun down: ' + map.debug.rotorSpeed(u.id));
  assert.ok(map.debug.labels.some(l => /TRIPPED/.test(l.text)));
  const on = vm.obs.units.find(q => q.mode === 'on' && q.station === 'ccgt');
  const cruise = map.debug.rotorSpeed(on.id), windC = map.debug.rotorSpeed('wT0');
  vm.mode = {mode: 'WATCH', rate: 0.15, watchS: 3, locked: true, watchVersion: 'full'};
  vm.obs.f = 49.6;
  for (let i = 0; i < 60; i++) { vm.frame.nowMs = 5000 + i * 50; map.update(vm); }
  assert.ok(map.debug.rotorSpeed(on.id) < cruise * 0.5, 'machine rotor slows in the watch');
  assert.ok(map.debug.rotorSpeed('wT0') < windC * 0.5, 'wind rotor slows in the watch');
});

test('G-2 basics: at most 3 labels at rest (hover or alarm only), none on a quiet grid', async () => {
  const quiet = await vmOf();
  for (const u of quiet.obs.units) if (u.mode === 'tripped') u.mode = 'off';
  assert.deepEqual(mapLabels(quiet, null), []);
  const busy = await vmOf({alarms: {tiles: [{id: 'x', label: 'AGC', prio: 2, state: 'alarm', target: 'lever-gtb'}, {id: 'y', label: 'S', prio: 3, state: 'alarm', target: 'wheel-hydro'}], sounding: true}}, true);
  for (const d of busy.obs.districts) if (/1$/.test(d.id)) d.dark = true;
  const rest = mapLabels(busy, null);
  assert.equal(rest.length, MAX_REST_LABELS);
  const {map} = mount(1280, 268);
  map.update(busy);
  assert.ok(map.debug.labels.length <= MAX_REST_LABELS);
  // hovering adds the hovered plant's label first
  const hov = mapLabels(busy, 'solar');
  assert.equal(hov[0].text, 'SUNPLAIN SOLAR');
});

test('G-2 basics: hovering a plant sends its control id; vm.hover rings it', async () => {
  const {map, ui, cv} = mount(1280, 268);
  const vm = await vmOf();
  map.update(vm);
  const L = map.debug.layout;
  const toScreen = (x, y) => [L.dx + x * L.scale, L.dy + (y - L.srcY) * L.scale];
  for (const [id, target] of [['coal', 'lever-coal'], ['gtb', 'lever-gtb'], ['hydro', 'wheel-hydro'], ['battery', 'dial-battery'], ['tie', 'knob-tie']]) {
    const p = D.PLANTS.find(q => q.id === id);
    const [x, y] = toScreen(p.box[0] + p.box[2] / 2, p.box[1] + p.box[3] / 2);
    cv.dispatch('pointermove', {clientX: x, clientY: y});
    assert.deepEqual(ui[ui.length - 1], {do: 'hover', target}, id);
  }
  cv.dispatch('pointerleave', {});
  assert.deepEqual(ui[ui.length - 1], {do: 'hover', target: null});
  vm.hover = 'lever-ccgt';
  map.update(vm);
  assert.ok(map.debug.labels.some(l => l.id === 'ccgt'));
});

test('render/map*.js import only sim/params.js and their own render modules', () => {
  for (const f of ['map.js', 'mapdata.js', 'livestack.js']) {
    const src = readFileSync(new URL('../render/' + f, import.meta.url), 'utf8');
    for (const s of importSpecifiers(tokenize(src))) assert.ok(['../sim/params.js', './mapdata.js', './format.js', '../app/planview.js'].includes(s), f + ' imports ' + s);
  }
});

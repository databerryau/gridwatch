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
import {createMap, mapLabels, mapSummary, mapKeyOrder, skyState, weatherOf, MAX_REST_LABELS} from '../render/map.js';

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
  vm.obs.f.hz = 49.6;
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

// ------------------------------------------------------------------ Phase 1b (desk/README §14.3)

/** A quiet midday view with the weather set by hand: {h, clear, wind, heat, stormAgoS, rm}. */
async function wxVm(o = {}) {
  const vm = await vmOf({settings: {reducedMotion: !!o.rm}});
  const obs = vm.obs;
  obs.clock.h = o.h ?? 12;
  obs.sky = {clearness: o.clear ?? 0.95, windFrac: o.wind ?? 0.5};
  obs.wind.outMW = 1200 * (o.windOut ?? obs.sky.windFrac);
  obs.demand.heatActive = !!o.heat;
  obs.news = o.stormAgoS === undefined ? [] : [{atS: obs.s - o.stormAgoS - 3600, kind: 'storm', fromS: obs.s - o.stormAgoS, toS: null, text: ''}];
  for (const u of obs.units) if (u.mode === 'tripped') u.mode = 'off';
  return vm;
}

test('G-3: skyState is night, dawn, day, sunset, dusk by the hour, and 18:48 is sunset', () => {
  assert.equal(skyState(18.8), 'sunset');
  assert.equal(skyState(18 + 48 / 60), 'sunset');
  for (const [h, want] of [[0, 'night'], [3, 'night'], [5, 'night'], [6, 'dawn'], [7, 'dawn'], [8, 'day'], [12, 'day'], [17.5, 'day'], [18, 'sunset'], [19, 'sunset'],
    [19.3, 'dusk'], [20, 'night'], [23.9, 'night'], [24, 'night'], [28, 'night'], [36, 'day']]) assert.equal(skyState(h), want, 'h=' + h);
  // each state is one stretch of the day, in order
  const seq = [];
  for (let h = 0; h < 24; h += 0.05) { const s = skyState(h); if (seq[seq.length - 1] !== s) seq.push(s); }
  assert.deepEqual(seq, ['night', 'dawn', 'day', 'sunset', 'dusk', 'night']);
});

test('G-3: the sun crosses the sky east to west, sits on the western horizon at sunset, and the light is cached in buckets', async () => {
  const {map, doc} = mount(1280, 268);
  const at = async h => { const vm = await wxVm({h}); map.update(vm); return {...map.debug.fx}; };
  const am = await at(8), noon = await at(12.5), pm = await at(17), set = await at(18.8), night = await at(23);
  assert.ok(am.sunUp && noon.sunUp && pm.sunUp && set.sunUp && !night.sunUp);
  assert.ok(am.sunX > noon.sunX && noon.sunX > pm.sunX && pm.sunX > set.sunX, 'east (right) to west (left)');
  assert.ok(noon.sunY < am.sunY && noon.sunY < pm.sunY, 'highest at midday');
  assert.ok(set.sunX < 60 && set.sunY <= D.HORIZON_Y && set.sunY >= D.SAFE.y, 'on the western horizon, inside the rows the floor shows');
  assert.equal(set.sky, 'sunset');
  assert.ok(D.HORIZON_Y - D.SAFE.y >= 10, 'the 1280x600 floor still shows a strip of sky');
  // a still scene costs no layer redraws; an hour of daylight costs none either
  const vm = await wxVm({h: 11});
  map.update(vm);
  const r0 = {...map.debug.rebuilds};
  for (let i = 0; i < 120; i++) { vm.frame.nowMs = 2000 + i * 16; vm.obs.clock.h = 11 + i / 480; map.update(vm); }
  assert.deepEqual(map.debug.rebuilds, r0, 'static layers are cached');
  // dusk moves in buckets, not every frame
  for (let i = 0; i < 120; i++) { vm.frame.nowMs = 4000 + i * 16; vm.obs.clock.h = 18 + i / 120; map.update(vm); }
  assert.ok(map.debug.rebuilds.terrain - r0.terrain <= 12, map.debug.rebuilds.terrain - r0.terrain + ' terrain redraws over an hour of dusk');
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('G-4: weatherOf reads heat, storm, cloud and wind from observe() only', async () => {
  const calm = weatherOf((await wxVm()).obs);
  assert.deepEqual(calm, {heat: false, storm: 0, cloud: 0, windy: calm.windy, cutOut: false});
  assert.ok(calm.windy > 0 && calm.windy < 1);
  assert.equal(weatherOf((await wxVm({heat: true})).obs).heat, true);
  // cloud: 1 - clearness, in daylight only
  const c1 = weatherOf((await wxVm({clear: 0.6})).obs).cloud, c2 = weatherOf((await wxVm({clear: 0.32})).obs).cloud;
  assert.ok(c1 > 0 && c2 > c1 && c2 <= 1);
  assert.equal(weatherOf((await wxVm({clear: 0.32, h: 23})).obs).cloud, 0);
  // storm: only once it has arrived, stronger with the wind, held through the cut-out, gone after it passes
  const warned = await wxVm({stormAgoS: -1800, wind: 0.9});
  assert.equal(weatherOf(warned.obs).storm, 0, 'warned but not here yet');
  const lo = weatherOf((await wxVm({stormAgoS: 2400, wind: 0.5})).obs).storm, hi = weatherOf((await wxVm({stormAgoS: 2400, wind: 0.95})).obs).storm;
  assert.ok(lo > 0.5 && hi > lo && hi <= 1, lo + ' ' + hi);
  const cut = weatherOf((await wxVm({stormAgoS: 4000, wind: 0.18})).obs);
  assert.ok(cut.storm > 0.5 && cut.cutOut, 'cut-out: the storm is overhead and the wind output has collapsed');
  assert.equal(weatherOf((await wxVm({stormAgoS: 2400, wind: 0.95})).obs).cutOut, false);
  const fading = weatherOf((await wxVm({stormAgoS: 8400 + 900, wind: 0.5})).obs).storm;
  assert.ok(fading > 0 && fading < lo);
  assert.equal(weatherOf((await wxVm({stormAgoS: 8400 + 1800 + 1, wind: 0.5})).obs).storm, 0);
  // tolerant of an obs without sky (old saves, hand-built views)
  const bare = await wxVm(); delete bare.obs.sky; delete bare.obs.news;
  assert.deepEqual(weatherOf(bare.obs), {heat: false, storm: 0, cloud: 0, windy: weatherOf(bare.obs).windy, cutOut: false});
});

test('G-4: each weather state changes what is drawn (one frame, no text)', async () => {
  const frameOf = async o => {
    const {map, doc} = mount(1280, 268);
    const vm = await wxVm(o);
    map.update(vm);
    const first = doc.canvasStats.calls;
    vm.frame.nowMs += 16;
    map.update(vm);
    assert.deepEqual(doc.canvasStats.bad, [], JSON.stringify(o));
    return {fx: {...map.debug.fx}, calls: doc.canvasStats.calls - first, labels: map.debug.labels.length};
  };
  const clear = await frameOf({}), heat = await frameOf({heat: true}), storm = await frameOf({stormAgoS: 2400, wind: 0.9}),
    cut = await frameOf({stormAgoS: 4000, wind: 0.18, windOut: 0.05}), cloud = await frameOf({clear: 0.32});
  // clear: none of the weather marks
  assert.deepEqual([clear.fx.haze, clear.fx.shimmer, clear.fx.rain, clear.fx.sheets, clear.fx.shadows, clear.fx.feathered], [false, 0, 0, 0, 0, false]);
  // heat: haze band and shimmer, nothing else
  assert.ok(heat.fx.haze && heat.fx.shimmer > 0);
  assert.deepEqual([heat.fx.rain, heat.fx.shadows], [0, 0]);
  // storm: layered cloud, rain streaks and sheets; no cloud-front shadows; turbines feathered only at cut-out
  assert.ok(storm.fx.rain >= 100 && storm.fx.sheets >= 3 && storm.fx.clouds >= 20, JSON.stringify(storm.fx));
  assert.equal(storm.fx.shadows, 0);
  assert.equal(storm.fx.feathered, false);
  assert.equal(cut.fx.feathered, true);
  assert.ok(cut.fx.rain > 0);
  // cloud front: shadows over the ground and more cloud than a clear day, no rain
  assert.ok(cloud.fx.shadows >= 4 && cloud.fx.clouds > clear.fx.clouds);
  assert.equal(cloud.fx.rain, 0);
  // and the frame itself differs: every state makes a different number of canvas calls
  const calls = [clear, heat, storm, cloud].map(f => f.calls);
  assert.equal(new Set(calls).size, 4, 'draw-call counts ' + calls.join(', '));
  assert.ok(storm.calls > clear.calls + 100, 'a storm is the busiest frame');
  for (const f of [clear, heat, storm, cut, cloud]) assert.equal(f.labels, 0, 'weather is never a label');
});

test('G-2: every technology has its silhouette parts, and the tie marches off the west edge', () => {
  const kinds = id => D.PLANT_PARTS[id].map(p => p.k + (p.c ? ':' + p.c : ''));
  const count = (id, k) => kinds(id).filter(q => q === k).length;
  // coal: hyperbolic cooling towers, tall banded stacks, a coal pile
  assert.ok(count('coal', 'tower') >= 2 && count('coal', 'stack') >= 2 && count('coal', 'pile') === 1);
  const tallest = id => Math.max(...D.PLANT_PARTS[id].filter(p => p.k === 'stack').map(p => p.h));
  assert.ok(D.PLANT_PARTS.coal.filter(p => p.k === 'stack').every(p => p.band));
  // CCGT: two boxy HRSGs with stubby stacks (much shorter than coal's)
  assert.equal(count('ccgt', 'box:hrsg'), 2);
  assert.equal(count('ccgt', 'stack'), 2);
  assert.ok(tallest('ccgt') * 2 < tallest('coal'));
  // GTs: one small shed and one stack per machine
  for (const id of ['gta', 'gtb', 'gtc']) {
    const n = D.PLANTS.find(p => p.id === id).machines.length;
    assert.equal(count(id, 'box:shed'), n, id);
    assert.equal(count(id, 'stack'), n, id);
    const hrsg = D.PLANT_PARTS.ccgt.find(p => p.c === 'hrsg');
    for (const p of D.PLANT_PARTS[id]) if (p.k === 'box') assert.ok(p.h < hrsg.h && p.w * p.d <= hrsg.w * hrsg.d, 'a GT shed is smaller than an HRSG');
  }
  // hydro: a dam wall, a spillway, penstocks, and the lake behind (above) the dam
  assert.equal(count('hydro', 'dam'), 1);
  assert.equal(count('hydro', 'spill'), 1);
  assert.ok(count('hydro', 'pipe') >= 2);
  const dam = D.PLANT_PARTS.hydro.find(p => p.k === 'dam');
  assert.ok(D.LAKE.every(([x, y]) => y <= dam.y + 2) && D.LAKE.some(([x]) => x > dam.x && x < dam.x + dam.w));
  // battery: rows of white containers
  assert.ok(count('battery', 'box:white') >= 6);
  assert.ok(new Set(D.PLANT_PARTS.battery.map(p => p.y)).size >= 2, 'rows');
  // tie: at least three tall lattice pylons, in a line, the wire running to x = 0
  const py = D.PLANT_PARTS.tie.filter(p => p.k === 'pylon'), trunk = 11;
  assert.ok(py.length >= 3 && py.every(p => p.h > trunk * 1.5));
  assert.ok(py.every((p, i) => !i || p.x > py[i - 1].x) && py[0].x <= 16);
  assert.equal(D.PLANTS.find(p => p.id === 'tie').line[0][0], 0);
  // wind and solar: turbines on the ridge, panel rows on the plain
  assert.ok(D.WIND_TURBINES.length >= 6 && D.SOLAR_ROWS.length >= 5);
  // every part has finite bounds and a kind the map draws
  for (const [id, parts] of Object.entries(D.PLANT_PARTS)) for (const p of parts) {
    assert.ok(['box', 'tower', 'stack', 'pile', 'belt', 'dam', 'spill', 'pipe', 'pylon'].includes(p.k), id + ' ' + p.k);
    const b = D.partBounds(p);
    for (const k of ['x', 'y', 'w', 'h', 'fx', 'fy', 'fw', 'fh']) assert.ok(Number.isFinite(b[k]), id + ' ' + p.k + ' ' + k);
  }
  // each machine's anchor (rotor, strobe, ✕) sits inside its plant's hover box
  for (const p of D.PLANTS) for (const m of p.machines) assert.ok(m.x >= p.box[0] && m.x <= p.box[0] + p.box[2] && m.y >= p.box[1] && m.y <= p.box[1] + p.box[3], m.unit);
  // hover boxes do not hide one another's centres (the first box hit wins)
  for (const p of D.PLANTS) {
    const cx = p.box[0] + p.box[2] / 2, cy = p.box[1] + p.box[3] / 2;
    const hit = D.PLANTS.find(q => cx >= q.box[0] && cx <= q.box[0] + q.box[2] && cy >= q.box[1] && cy <= q.box[1] + q.box[3]);
    assert.equal(hit.id, p.id);
  }
});

test('K-23: the map is focusable; arrows cycle the plants then the suburbs with the same hover, Esc leaves, and nothing acts twice', async () => {
  const {map, ui, doc} = mount(1280, 268);
  const vm = await wxVm();
  map.update(vm);
  assert.equal(map.el.getAttribute('tabindex'), '0');
  assert.ok(map.el.getAttribute('aria-keyshortcuts').includes('ArrowRight'));
  const ev = (key, over) => Object.assign({type: 'keydown', key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}}, over);
  // not focused: the map leaves the keys alone
  assert.equal(map.key(ev('ArrowRight')), false);
  assert.equal(ui.length, 0);
  map.el.focus();
  const order = mapKeyOrder();
  assert.deepEqual(order, D.PLANTS.map(p => p.id).concat(D.SUBURBS.map(s => 'sub:' + s.id)));
  // forwarded by the shell (§13.3): returns true exactly when it acted
  for (let i = 0; i < order.length; i++) {
    assert.equal(map.key(ev('ArrowRight')), true);
    assert.equal(map.debug.hoverId, order[i]);
    const p = D.PLANTS.find(q => q.id === order[i]);
    if (p && p.target) assert.deepEqual(ui[ui.length - 1], {do: 'hover', target: p.target}, order[i]);
    vm.frame.nowMs += 16;
    map.update(vm);
    assert.equal(map.debug.labels.length, 1, 'the label shows');
    assert.equal(map.debug.labels[0].id, order[i]);
  }
  assert.equal(ui[ui.length - 1].target, null, 'a suburb has no lever: the hover target clears');
  assert.equal(map.key(ev('ArrowRight')), true);
  assert.equal(map.debug.hoverId, order[0], 'wraps');
  assert.equal(map.key(ev('ArrowLeft')), true);
  assert.equal(map.debug.hoverId, order[order.length - 1]);
  assert.equal(map.key(ev('Home')), true);
  assert.equal(map.debug.hoverId, 'coal');
  // keys that are not the map's, key-ups and handled events are left alone
  for (const e of [ev('a'), ev('ArrowUp'), ev('1'), ev('ArrowRight', {type: 'keyup'}), ev('ArrowRight', {defaultPrevented: true}), ev('ArrowRight', {ctrlKey: true})]) assert.equal(map.key(e), false);
  assert.equal(map.debug.hoverId, 'coal');
  // a real key event on the focused map is handled once: its own listener acts and stops it
  const before = ui.length;
  const sent = doc.dispatch('keydown', {key: 'ArrowRight'});
  assert.equal(map.debug.hoverId, 'ccgt');
  assert.equal(ui.length, before + 1);
  assert.ok(sent.defaultPrevented && sent.stopped);
  assert.equal(map.key(sent), false, 'the shell forwarding the same event does not act again');
  // the text alternative names where the keyboard is, at most once per real second
  vm.frame.nowMs += 16; map.update(vm);
  assert.match(map.el.getAttribute('aria-label'), /RIVERTON CCGT/);
  // Esc leaves: the hover clears and the focus goes
  assert.equal(map.key(ev('Escape')), true);
  assert.equal(map.debug.hoverId, null);
  assert.deepEqual(ui[ui.length - 1], {do: 'hover', target: null});
  assert.notEqual(doc.activeElement, map.el);
  assert.equal(map.key(ev('Escape')), false);
});

test('K-23: the map has a text alternative, refreshed at most once per real second', async () => {
  const {map} = mount(1280, 268);
  const vm = await vmOf({}, true);
  vm.obs.clock.h = 18.8;
  vm.frame.nowMs = 5000;
  map.update(vm);
  const a = map.el.getAttribute('aria-label');
  assert.match(a, /sunset/);
  assert.match(a, /Tripped: /);
  for (const d of vm.obs.districts) if (d.suburb === 'SAL') d.dark = true;
  vm.frame.nowMs = 5900;
  map.update(vm);
  assert.equal(map.el.getAttribute('aria-label'), a, 'not yet');
  vm.frame.nowMs = 6000;
  map.update(vm);
  assert.match(map.el.getAttribute('aria-label'), /Districts dark: Saltbush Bay 6/);
  assert.equal(mapSummary(vm, 'sub:HAZ').includes('On Old Hazelton'), true);
});

test('G-5 / K-22: a tripped machine carries a ✕ and a strobe for the whole lockout; dark districts are hatched; the battery shows an arrow', async () => {
  const {map, doc} = mount(1280, 268);
  const vm = await vmOf({}, true);
  const tripped = vm.obs.units.filter(u => u.mode === 'tripped').length;
  assert.ok(tripped >= 1);
  let on = 0, off = 0;
  for (let i = 0; i < 125; i++) { // 2 real s
    vm.frame.nowMs = 10000 + i * 16;
    map.update(vm);
    assert.equal(map.debug.fx.cross, tripped, 'the ✕ is steady: it never blinks off');
    if (map.debug.fx.strobe) on++; else off++;
  }
  assert.ok(on > 30 && off > 30, 'the strobe flashes: ' + on + '/' + off);
  assert.equal(map.debug.fx.hatch, 0);
  // the tie too
  vm.obs.tie.tripped = true;
  vm.frame.nowMs += 16; map.update(vm);
  assert.equal(map.debug.fx.cross, tripped + 1);
  // dark districts: a hatched outline each, from the first frame
  for (const d of vm.obs.districts) if (d.suburb === 'RED') d.dark = true;
  vm.frame.nowMs += 16; map.update(vm);
  assert.equal(map.debug.fx.hatch, vm.obs.districts.filter(d => d.dark).length);
  assert.ok(map.debug.fx.hatch >= 5);
  // repaired and restored: the marks go
  for (const u of vm.obs.units) if (u.mode === 'tripped') u.mode = 'off';
  vm.obs.tie.tripped = false;
  for (const d of vm.obs.districts) d.dark = false;
  vm.frame.nowMs += 16; map.update(vm);
  assert.deepEqual([map.debug.fx.cross, map.debug.fx.hatch], [0, 0]);
  // battery: discharging and charging differ by shape, not only by lamp colour
  const arrow = mw => { vm.obs.battery.outMW = mw; vm.frame.nowMs += 16; map.update(vm); return map.debug.fx.battery; };
  assert.deepEqual([arrow(120), arrow(-120), arrow(0)], ['up', 'down', '']);
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('B-5: the watch spotlight eases in over 0.6 s on the tripped plant (or the tie), and goes after the watch', async () => {
  const {map} = mount(1280, 268);
  const vm = await vmOf({}, true);
  const u = vm.obs.units.find(q => q.mode === 'tripped');
  vm.frame.nowMs = 1000;
  map.update(vm);
  assert.equal(map.debug.fx.spot, 0, 'no spotlight outside the watch');
  vm.mode = {mode: 'WATCH', rate: 0.15, watchS: 0.1, locked: true, watchVersion: 'full'};
  const seen = [];
  for (const t of [1016, 1200, 1400, 1616, 1700, 3000]) { vm.frame.nowMs = t; map.update(vm); seen.push(map.debug.fx.spot); }
  assert.equal(seen[0], 0);
  assert.ok(seen[1] > 0 && seen[1] < seen[2] && seen[2] < 1, 'easing: ' + seen.join(', '));
  assert.deepEqual(seen.slice(3), [1, 1, 1], 'full after 0.6 s');
  const p = D.PLANTS.find(q => q.id === u.station), mc = p.machines.find(m => m.unit === u.id);
  assert.ok(Math.abs(map.debug.fx.spotX - mc.x) < 1 && Math.abs(map.debug.fx.spotY - mc.y) < 12, 'centred on the tripped machine');
  // integer scale holds in the watch: a spotlight, not a zoom (G-1)
  assert.equal(map.debug.scale, 2);
  vm.mode = {mode: 'CRUISE', rate: 120, watchS: -1, locked: false, watchVersion: null};
  vm.frame.nowMs = 3100; map.update(vm);
  vm.frame.nowMs = 3250; map.update(vm);
  assert.ok(map.debug.fx.spot > 0 && map.debug.fx.spot < 1, 'fades out');
  vm.frame.nowMs = 3500; map.update(vm);
  assert.equal(map.debug.fx.spot, 0);
  // a link trip points at the tie pylons
  const {map: m2} = mount(1280, 268);
  const link = await wxVm();
  link.obs.tie.tripped = true;
  link.obs.contingency = {cause: 'link', id: 'tie', lostMW: 400};
  link.mode = {mode: 'WATCH', rate: 0.15, watchS: 1, locked: true, watchVersion: 'full'};
  link.frame.nowMs = 1000; m2.update(link);
  link.frame.nowMs = 2000; m2.update(link);
  assert.equal(m2.debug.fx.spot, 1);
  const tie = D.PLANTS.find(q => q.id === 'tie').box;
  assert.ok(m2.debug.fx.spotX >= tie[0] && m2.debug.fx.spotX <= tie[0] + tie[2]);
});

test('K-22 reduced motion: rain, cloud shadows and shimmer are drawn static, the strobe is <= 1 Hz, the spotlight does not ease, no lightning', async () => {
  const run = async (o, frames = 40) => {
    const {map, doc} = mount(1280, 268);
    const vm = await wxVm(o);
    const seen = [];
    for (let i = 0; i < frames; i++) { vm.frame.nowMs = 20000 + i * 250; map.update(vm); seen.push({...map.debug.fx}); }
    assert.deepEqual(doc.canvasStats.bad, []);
    return seen;
  };
  // moving by default
  const moving = await run({clear: 0.32});
  assert.ok(new Set(moving.map(f => f.shadowX)).size > 10, 'cloud shadows drift');
  assert.ok(new Set(moving.map(f => f.phase)).size > 10);
  // static under reduced motion, and still drawn
  for (const o of [{clear: 0.32, rm: true}, {stormAgoS: 2400, wind: 0.9, rm: true}, {heat: true, rm: true}]) {
    const still = await run(o);
    assert.deepEqual([...new Set(still.map(f => f.phase))], [0], 'the animation clock is frozen');
    assert.equal(new Set(still.map(f => f.shadowX)).size, 1);
    assert.ok(still.every(f => !f.bolt), 'no lightning');
    const f = still[0];
    assert.ok(o.heat ? f.shimmer > 0 && f.haze : o.clear ? f.shadows > 0 : f.rain > 0 && f.sheets > 0, 'the weather still reads');
  }
  // the tripped strobe: 1 Hz by default, 0.5 Hz (<= 1 Hz) under reduced motion; the ✕ stays
  for (const [rm, maxHz] of [[false, 1], [true, 0.5]]) {
    const {map} = mount(1280, 268);
    const vm = await vmOf({settings: {reducedMotion: rm}}, true);
    let flips = 0, last = null;
    for (let t = 0; t < 4000; t += 20) { vm.frame.nowMs = 50000 + t; map.update(vm); if (last !== null && map.debug.fx.strobe !== last) flips++; last = map.debug.fx.strobe; assert.ok(map.debug.fx.cross >= 1); }
    assert.ok(flips / 2 / 4 <= maxHz + 0.01 && flips >= 2, rm + ': ' + flips / 8 + ' Hz');
  }
  // the spotlight appears at once
  const {map} = mount(1280, 268);
  const vm = await vmOf({settings: {reducedMotion: true}, mode: {mode: 'WATCH', rate: 0.15, watchS: 0.1, locked: true, watchVersion: 'full'}}, true);
  vm.frame.nowMs = 1000; map.update(vm);
  assert.equal(map.debug.fx.spot, 1);
  vm.mode = {mode: 'CRUISE', rate: 120, watchS: -1, locked: false, watchVersion: null};
  vm.frame.nowMs = 1016; map.update(vm);
  assert.equal(map.debug.fx.spot, 0);
  // vm.settings may be absent (older shells): treated as motion on, no throw
  const {map: m3} = mount(1280, 268);
  const bare = await wxVm({stormAgoS: 2400, wind: 0.9});
  delete bare.settings;
  m3.update(bare);
  assert.ok(m3.debug.fx.rain > 0);
});

test('G-5: rotors follow the frequency (obs.f.hz) and slow further in the watch', async () => {
  const settle = async (hz, watch) => {
    const {map} = mount(1280, 268);
    const vm = await wxVm();
    vm.obs.f.hz = hz;
    if (watch) vm.mode = {mode: 'WATCH', rate: 0.15, watchS: 3, locked: true, watchVersion: 'full'};
    for (let i = 0; i < 80; i++) { vm.frame.nowMs = 1000 + i * 50; map.update(vm); }
    return map.debug.rotorSpeed(vm.obs.units.find(u => u.sync).id);
  };
  const at50 = await settle(50), low = await settle(49.5), watch = await settle(50, true);
  assert.ok(Math.abs(at50 - 1) < 0.02, 'full speed at 50 Hz: ' + at50);
  assert.ok(low < at50 - 0.3, 'a low frequency slows the rotors: ' + low);
  assert.ok(watch < at50 * 0.5);
});

test('G-1 performance shape: a frame allocates no layers and does no per-block search (stand-in canvas: the JS cost)', async () => {
  const {map} = mount(1280, 268);
  const vm = await wxVm({stormAgoS: 2400, wind: 0.9});
  for (const d of vm.obs.districts) if (d.suburb === 'RED') d.dark = true;
  for (let i = 0; i < 60; i++) { vm.frame.nowMs = 1000 + i * 16; map.update(vm); }
  const r0 = {...map.debug.rebuilds};
  // obs.districts.find must not run per block per frame: count calls on a frozen list
  let finds = 0;
  const ds = vm.obs.districts;
  ds.find = function (f) { finds++; return Array.prototype.find.call(this, f); };
  const ms = [];
  for (let i = 0; i < 200; i++) { vm.frame.nowMs = 2000 + i * 16; map.update(vm); ms.push(map.debug.drawMs); }
  assert.equal(finds, 0, 'no obs.districts.find in the frame loop');
  assert.deepEqual(map.debug.rebuilds, r0, 'a steady storm redraws no cached layer');
  ms.sort((a, b) => a - b);
  assert.ok(ms[Math.floor(ms.length * 0.95)] < 8, 'p95 ' + ms[Math.floor(ms.length * 0.95)].toFixed(2) + ' ms on the stand-in canvas');
});

test('render/map*.js import only sim/params.js and their own render modules', () => {
  for (const f of ['map.js', 'mapdata.js', 'livestack.js']) {
    const src = readFileSync(new URL('../render/' + f, import.meta.url), 'utf8');
    for (const s of importSpecifiers(tokenize(src))) assert.ok(['../sim/params.js', './mapdata.js', './format.js', '../app/planview.js'].includes(s), f + ' imports ' + s);
  }
});

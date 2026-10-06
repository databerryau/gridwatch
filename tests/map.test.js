// render/map.js + render/mapdata.js (desk/README §7; SPEC G-1, G-2 basics, G-5; X-37, X-38):
// integer scale with terrain to the frame edges at the three layouts, no building off the
// terrain, dark districts block by block, the tripped plant, rotors in the watch, <= 3 labels
// at rest, hover to the desk, no NaN.
// Phase 2a (desk/README §21.5; G-3): rooftop panels in proportion to each suburb's rooftop MW,
// the per-suburb glint on a real mild noon of the game's scenario (tests/lib/desk-vm.js), dark
// and reconnecting districts, the sun down at the scenario's 19:48, night windows by underlying
// demand, the text alternative's rooftop MW, a plant lit for a STOP guard.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {dayVm, baseVm} from './lib/vm-fixture.js';
import {deskDayVm} from './lib/desk-vm.js';
import {V} from '../sim/params.js';
import {step, observe, createState} from '../sim/step.js';
import * as fleet from '../sim/fleet.js';
import {DESK_WEEKEND} from '../content/scenarios.js';
import {tokenize, importSpecifiers} from './lib/js-tokens.js';
import * as D from '../render/mapdata.js';
import {createMap, mapLabels, mapSummary, mapKeyOrder, mapPinText, skyState, weatherOf, MAX_REST_LABELS} from '../render/map.js';

// One par run to 18:30 (seed 7) for both views: the trip view is that evening cloned, its largest
// unit tripped and 2 grid-s run, as dayVm({seed: 7, untilH: 18.5, trip: true}) makes it (the same
// hashState) without a second par run.
let DAY = null;
async function vmOf(over, trip = false) {
  DAY ||= (async () => {
    const eve = await dayVm({seed: 7, untilH: 18.5});
    const st = structuredClone(eve.state);
    let best = -1;
    for (let i = 0; i < st.units.length; i++) if (st.units[i].sync && (best < 0 || st.units[i].outMW > st.units[best].outMW)) best = i;
    while (st.tick % V.TICKS_PER_S !== 0) step(st, []);
    fleet.tripUnit(st, best, 'test trip', V.HOT_TRIP_LOCKOUT_S, []);
    for (let k = 0; k < 2 * V.TICKS_PER_S; k++) step(st, []);
    return {e: eve.obs, t: observe(st)};
  })();
  const obs = (await DAY)[trip ? 't' : 'e'];
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
  // Cruise is measured at 50 Hz. The fixture is 2 s into a trip (49.5 Hz, wherever that seed's
  // day puts it): measured there, cruise was already slowed by the frequency and "half of
  // cruise" sat within 1% of the watch speed, so 8 mHz of drift in the sim flipped the test.
  vm.obs.f.hz = 50;
  for (let i = 0; i < 60; i++) { vm.frame.nowMs = 1000 + i * 50; map.update(vm); }
  assert.ok(map.debug.rotorSpeed(u.id) < 0.1, 'spun down: ' + map.debug.rotorSpeed(u.id));
  assert.ok(map.debug.labels.some(l => /TRIPPED/.test(l.text)));
  const on = vm.obs.units.find(q => q.mode === 'on' && q.station === 'ccgt');
  const cruise = map.debug.rotorSpeed(on.id), windC = map.debug.rotorSpeed('wT0');
  assert.ok(Math.abs(cruise - 1) < 0.03, 'full speed at 50 Hz: ' + cruise);
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

// ------------------------------------------------------------------ Phase 2a: rooftop PV (desk/README §21.5; G-3)

let NOON = null;
/** A real mild weekend at 12:30 on the game's scenario, nobody at the desk: every suburb's roofs near their peak. */
function noonVm(over) {
  NOON ||= deskDayVm({seed: 5, untilH: 12.5, scenario: DESK_WEEKEND, follow: false}).obs;
  return baseVm(structuredClone(NOON), over);
}

/**
 * A map whose offscreen frame canvas (the one the scene and the glint are drawn on) is watched:
 * counts of beginPath, fill and rect on it since the last reset, and each rect's place.
 */
function mountWatched(w = 1280, h = 268) {
  const doc = makeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const made = [], create = doc.createElement;
  doc.createElement = t => { const e = create(t); if (t === 'canvas') made.push(e); return e; };
  const map = createMap(doc, root, {ui: () => {}});
  map.el.clientWidth = w; map.el.clientHeight = h;
  const frame = made[1].getContext('2d'); // made[0] is the screen canvas, then frame, sky, terrain, city, two cloud strips
  const seen = {paths: 0, fills: 0, rects: [], reset() { this.paths = 0; this.fills = 0; this.rects.length = 0; }};
  frame.beginPath = () => { seen.paths++; };
  frame.fill = () => { seen.fills++; };
  frame.rect = (x, y, rw) => { seen.rects.push(x + ',' + y + ',' + rw); };
  // the cached city layer: the panels painted on it at its last rebuild (it is cleared first), as 'x,y,w,h'
  // and the front-bottom corner of each building in the order it is painted (a cuboid's left and right face both start there)
  const city = made[4].getContext('2d'), pv = [], fronts = [];
  let last = null;
  city.clearRect = () => { pv.length = 0; fronts.length = 0; last = null; };
  city.fillRect = (x, y, rw, rh) => { if (city.fillStyle === D.ROOF_PV.colour) pv.push(x + ',' + y + ',' + rw + ',' + rh); };
  city.moveTo = (x, y) => { if (last && last.x === x && last.y === y) fronts.push(last); last = {x, y}; };
  return {doc, map, seen, pv, fronts};
}

/** Is point (X, Y) inside the polygon pts ([[x, y], ...])? (Crossing number; the test's own, not the map's.) */
function inPoly(pts, X, Y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > Y) !== (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Is (X, Y) on the outline itself? */
function onEdge(pts, X, Y) {
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    const cross = (xj - xi) * (Y - yi) - (yj - yi) * (X - xi), dot = (X - xi) * (X - xj) + (Y - yi) * (Y - yj);
    if (Math.abs(cross) < 1e-9 && dot <= 1e-9) return true;
  }
  return false;
}
/** The outline the map's three cuboid faces cover, for a building {x, y, w, d, h} (front-bottom corner at x, y). */
const outline = b => [[b.x, b.y], [b.x + b.w, b.y - b.w / 2], [b.x + b.w, b.y - b.w / 2 - b.h], [b.x + b.w - b.d, b.y - (b.w + b.d) / 2 - b.h],
  [b.x - b.d, b.y - b.d / 2 - b.h], [b.x - b.d, b.y - b.d / 2]];

test('G-3 (2a): panels on every suburb\'s roofs in proportion to its rooftop MW, each inside its roof, the same every day', () => {
  const vm = noonVm();
  const rs = vm.obs.rooftop.suburbs, cap = Object.fromEntries(rs.map(r => [r.id, r.capMW]));
  assert.deepEqual(rs.map(r => r.id + ' ' + r.capMW), ['SOL 1250', 'HAZ 450', 'RED 1000', 'HAR 250', 'TAL 1150', 'SAL 900']);
  const blocks = D.districtBlocks(vm.obs.districts), panels = D.roofPanels(blocks, cap);
  assert.deepEqual(D.roofPanels(blocks, cap), panels, 'layout only: no randomness');
  const perRoof = new Map();
  for (const sb of D.SUBURBS) {
    const mine = panels.filter(q => q.suburb === sb.id), roofs = blocks.filter(b => b.suburb === sb.id).reduce((a, b) => a + b.buildings.length, 0);
    assert.equal(mine.length, Math.round(cap[sb.id] / D.ROOF_PV.mwPerPanel), sb.id + ': one panel per ' + D.ROOF_PV.mwPerPanel + ' MW');
    assert.ok(mine.length >= 1 && mine.length <= roofs * D.ROOF_PV.maxPerRoof, sb.id + ': ' + mine.length + ' panels on ' + roofs + ' roofs');
    assert.ok(Math.abs(mine.length / panels.length - cap[sb.id] / 5000) < 0.01, sb.id + ' share');
  }
  for (const q of panels) {
    const blk = blocks[q.blk], b = blk.buildings[q.b], key = blk.id + ':' + q.b;
    assert.equal(blk.id, q.id);
    perRoof.set(key, (perRoof.get(key) || 0) + 1);
    // inside the roof's top face rows and the building's drawn width
    const box = D.cuboidBounds(b.x, b.y, b.w, b.d, b.h);
    assert.ok(q.x >= box.x && q.x + q.w <= box.x + box.w && q.y >= box.y && q.y + 1 <= b.y - b.h, 'panel off its roof: ' + JSON.stringify(q) + ' on ' + JSON.stringify(b));
    assert.ok(q.ph >= 0 && q.ph < 1 && (q.k === 0 || q.k === 1));
  }
  assert.ok(Math.max(...perRoof.values()) <= D.ROOF_PV.maxPerRoof);
  // no panel lies behind a building drawn after its own (the map paints every building back to front, by y then
  // x, and the glint is drawn over the finished city: a hidden panel would glint on the nearer building's wall)
  const order = [];
  blocks.forEach((blk, bi) => blk.buildings.forEach((b, i) => order.push({b, key: bi + ':' + i})));
  order.sort((p, q) => p.b.y - q.b.y || p.b.x - q.b.x);
  let checked = 0;
  for (const q of panels) {
    const mine = order.findIndex(c => c.key === q.blk + ':' + q.b);
    for (let n = mine + 1; n < order.length; n++) {
      for (let i = 0; i < q.w; i++, checked++) assert.ok(!inPoly(outline(order[n].b), q.x + i + 0.5, q.y + 0.5), 'panel ' + JSON.stringify(q) + ' is behind ' + JSON.stringify(order[n].b));
    }
    for (let i = 0; i < q.w; i++) assert.ok(inPoly(outline(blocks[q.blk].buildings[q.b]), q.x + i + 0.5, q.y + 0.5), 'and it is on its own building: ' + JSON.stringify(q));
  }
  assert.ok(checked > 10000);
  // mapdata's own test of "covered" (cuboidCovers) is that outline, edge included, for every pixel around 40 buildings
  let inN = 0, outN = 0;
  for (const b of order.filter((c, i) => i % 4 === 0).map(c => c.b)) {
    const bb = D.cuboidBounds(b.x, b.y, b.w, b.d, b.h);
    for (let px = Math.floor(bb.x) - 1; px <= bb.x + bb.w + 1; px++) for (let py = Math.floor(bb.y) - 1; py <= bb.y + bb.h + 1; py++) {
      const want = inPoly(outline(b), px + 0.5, py + 0.5) || onEdge(outline(b), px + 0.5, py + 0.5);
      assert.equal(D.cuboidCovers(b, px, py), want, 'cuboidCovers at ' + px + ',' + py + ' of ' + JSON.stringify(b));
      if (want) inN++; else outN++;
    }
  }
  assert.ok(inN > 1000 && outN > 1000, inN + ' / ' + outN);
  assert.ok(D.backToFront({x: 5, y: 10}, {x: 1, y: 11}) < 0 && D.backToFront({x: 5, y: 10}, {x: 6, y: 10}) < 0 && D.backToFront({x: 5, y: 10}, {x: 5, y: 10}) === 0);
  // a low roof behind a tower: both of its places are covered, so the tower's two are dealt first; the low
  // roof's are used only when the suburb's capacity asks for more panels than there are clear places
  const pair = [{id: 'SOL1', suburb: 'SOL', style: 'estate', cell: [90, 80, 30, 30], buildings: [{x: 100, y: 100, w: 5, d: 4, h: 3, win: 1}, {x: 101, y: 104, w: 6, d: 5, h: 12, win: 4}]}];
  const on = mw => D.roofPanels(pair, {SOL: mw}).map(q => q.b + ':' + q.k);
  assert.deepEqual(on(25), ['1:0']);
  assert.deepEqual(on(50), ['1:0', '1:1'], 'the second panel goes on the tower again, not behind it');
  assert.deepEqual(on(75), ['1:0', '1:1', '0:0']);
  assert.deepEqual(on(100), ['1:0', '1:1', '0:0', '0:1'], 'the count comes first');
  assert.deepEqual(on(500), ['1:0', '1:1', '0:0', '0:1'], 'never more than two on a roof');
  for (const q of D.roofPanels(pair, {SOL: 100}).filter(q => q.b === 0)) assert.ok(inPoly(outline(pair[0].buildings[1]), q.x + 0.5, q.y + 0.5), 'the fixture: behind the tower');
  // the denser suburbs fill every roof before any roof gets a second panel
  assert.ok([...perRoof].filter(([k]) => k.startsWith('HAR')).every(([, n]) => n === 1), 'Harbourside: half its roofs, one each');
  assert.equal(new Set([...perRoof.keys()].filter(k => k.startsWith('SOL'))).size, 30, 'Solstice Rise: every roof');
  // no rooftop (the CLASSIC scenario, or a view without the key): no panels
  assert.deepEqual(D.roofPanels(blocks, Object.fromEntries(rs.map(r => [r.id, 0]))), []);
  assert.deepEqual(D.roofPanels(blocks, undefined), []);
  assert.ok(D.ROOF_PV.glintHz <= 3 && D.ROOF_PV.glintDuty > 0 && D.ROOF_PV.glintDuty < 1, 'nothing flashes above 3 Hz (K-22)');
});

test('G-3 (2a): every panel is painted on the cached city layer, on lit buildings only; none on the classic day', async () => {
  const {map, pv, fronts} = mountWatched();
  const vm = noonVm({settings: {reducedMotion: true}});
  const cap = Object.fromEntries(vm.obs.rooftop.suburbs.map(r => [r.id, r.capMW]));
  const blocks = D.districtBlocks(vm.obs.districts), panels = D.roofPanels(blocks, cap);
  const strip = q => q.x + ',' + q.y + ',' + q.w + ',1';
  const sorted = a => a.slice().sort();
  vm.frame.nowMs = 1000; map.update(vm);
  assert.equal(map.debug.rebuilds.city, 1);
  assert.equal(pv.length, 200);
  assert.deepEqual(sorted(pv), sorted(panels.map(strip)), 'each panel of the layout, as a strip one base pixel tall, in the panels\' colour');
  // the buildings are painted back to front in the order the layout assumes when it keeps panels out from behind nearer ones
  const corners = blocks.flatMap(blk => blk.buildings.map(b => ({x: b.x, y: b.y}))).sort(D.backToFront);
  assert.equal(corners.length, 177);
  assert.deepEqual(fronts, corners);
  // a steady noon: the layer is not painted again
  for (let i = 0; i < 30; i++) { vm.frame.nowMs += 16; map.update(vm); }
  assert.equal(map.debug.rebuilds.city, 1);
  // a district goes dark, building by building (G-5): its panels go with its roofs, the others stay
  const dark = vm.obs.districts.find(d => d.suburb === 'SOL'), mine = panels.filter(q => q.id === dark.id);
  assert.ok(mine.length >= 4 && mine.length < 20, dark.id + ' has ' + mine.length + ' panels');
  dark.dark = true;
  vm.frame.nowMs += 16; map.update(vm);
  const first = pv.length;
  assert.ok(first < 200 && first > 200 - mine.length, 'the first building is out: ' + first);
  vm.frame.nowMs += 5000; map.update(vm);
  assert.equal(map.debug.districts[dark.id].darkBlocks, map.debug.districts[dark.id].blocks);
  assert.deepEqual(sorted(pv), sorted(panels.filter(q => q.id !== dark.id).map(strip)), 'no panel is painted on a dark roof');
  // relit: they come back with the roofs
  dark.dark = false;
  vm.frame.nowMs += 5000; map.update(vm);
  vm.frame.nowMs += 5000; map.update(vm);
  assert.deepEqual(sorted(pv), sorted(panels.map(strip)));
  // a scenario without rooftop, and a view without the key: the same city, no panels
  const m0 = mountWatched(), classic = await vmOf();
  assert.equal(classic.obs.rooftop.capMW, 0);
  classic.obs.clock.h = 12.5; classic.frame.nowMs = 1000; m0.map.update(classic);
  assert.ok(m0.map.debug.rebuilds.city >= 1);
  assert.deepEqual(m0.pv, []);
  const m1 = mountWatched(), none = noonVm();
  delete none.obs.rooftop;
  none.frame.nowMs = 1000; m1.map.update(none);
  assert.deepEqual(m1.pv, []);
});

test('G-3 (2a): a storm dims the glint with the light (60% at its height), as cloud over the suburbs already does through their output', async () => {
  const alphaAt = o => {
    const {map} = mountWatched();
    const vm = noonVm({settings: {reducedMotion: true}});
    if (o) { vm.obs.news = [{atS: vm.obs.s - o.agoS - 3600, kind: 'storm', fromS: vm.obs.s - o.agoS, toS: null, text: ''}]; vm.obs.sky.windFrac = o.wind; }
    vm.frame.nowMs = 1000; map.update(vm);
    return {alpha: Array.from(map.debug.roof.alpha), storm: map.debug.fx.storm, on: Array.from(map.debug.roof.on)};
  };
  const clear = alphaAt(null), full = alphaAt({agoS: 2400, wind: 1}), building = alphaAt({agoS: 450, wind: 1});
  assert.equal(clear.storm, 0);
  assert.equal(full.storm, 1);
  assert.ok(Math.abs(building.storm - 0.65) < 1e-9, 'half way through the 15 minutes it takes to build: ' + building.storm);
  clear.alpha.forEach((a, j) => {
    assert.ok(a > 0.5, 'a clear noon: ' + a);
    assert.ok(Math.abs(full.alpha[j] - a * 0.4) < 1e-6, 'overhead: ' + full.alpha[j] + ' of ' + a);
    assert.ok(Math.abs(building.alpha[j] - a * (1 - 0.6 * 0.65)) < 1e-6, 'building: ' + building.alpha[j] + ' of ' + a);
  });
  assert.deepEqual(full.on, clear.on, 'the same panels catch what light there is');
});

test('G-3 (2a): the glint is one path and one fill per suburb, as bright as its output over its capacity and as the light; none at night; no cached layer is rebuilt for it', () => {
  const {map, seen, doc} = mountWatched();
  const vm = noonVm({settings: {reducedMotion: true}});
  vm.frame.nowMs = 1000; map.update(vm);
  const roof = map.debug.roof, order = D.SUBURBS.map(sb => vm.obs.rooftop.suburbs.find(r => r.id === sb.id));
  assert.deepEqual(roof.panels, D.SUBURBS.map(sb => Math.round(order[D.SUBURBS.indexOf(sb)].capMW / D.ROOF_PV.mwPerPanel)));
  order.forEach((r, j) => {
    assert.ok(r.mw / r.capMW > 0.4, r.id + ' near its peak: ' + r.mw / r.capMW);
    assert.ok(Math.abs(roof.alpha[j] - Math.min(1, D.ROOF_PV.glintGain * r.mw / r.capMW)) < 1e-6, r.id + ' alpha ' + roof.alpha[j]);
    assert.ok(roof.on[j] >= 1 && roof.on[j] < roof.panels[j], r.id + ': ' + roof.on[j] + ' of ' + roof.panels[j] + ' panels catch the sun at once');
  });
  // against the same frame with no rooftop in the view: six more paths, six more fills, one rect per glinting panel
  seen.reset(); vm.frame.nowMs += 16; map.update(vm);
  const withRoof = {paths: seen.paths, fills: seen.fills, rects: seen.rects.length};
  assert.equal(withRoof.rects, map.debug.fx.glint);
  assert.equal(map.debug.fx.glint, roof.on.reduce((a, b) => a + b, 0));
  const none = noonVm({settings: {reducedMotion: true}});
  delete none.obs.rooftop;
  const m0 = mountWatched();
  none.frame.nowMs = 1000; m0.map.update(none);
  m0.seen.reset(); none.frame.nowMs += 16; m0.map.update(none);
  assert.deepEqual([withRoof.paths - m0.seen.paths, withRoof.fills - m0.seen.fills, m0.seen.rects.length], [D.SUBURBS.length, D.SUBURBS.length, 0], 'one path and one fill per suburb');
  assert.equal(m0.map.debug.fx.glint, 0);
  // cloud over one suburb dims that suburb alone
  const j = D.SUBURBS.findIndex(sb => sb.id === 'TAL'), a0 = roof.alpha[j], others = Array.from(roof.alpha);
  vm.obs.rooftop.suburbs.find(r => r.id === 'TAL').mw /= 2;
  vm.frame.nowMs += 16; map.update(vm);
  assert.ok(Math.abs(roof.alpha[j] - a0 / 2) < 1e-6, 'half the output, half the glint');
  others.forEach((a, i) => { if (i !== j) assert.equal(roof.alpha[i], a); });
  // graded by the light: half at 18:48 (the sky in sunset), gone when the light is, which is
  // the scenario's sunset (19:48, the end of the P-2 curve), whatever the view says the roofs make
  const sol = D.SUBURBS.findIndex(sb => sb.id === 'SOL'), aNoon = roof.alpha[sol];
  vm.obs.clock.h = 18.8; vm.frame.nowMs += 16; map.update(vm);
  assert.ok(Math.abs(roof.alpha[sol] - aNoon / 2) < 1e-6, 'the same output in half the light: ' + roof.alpha[sol] + ' of ' + aNoon);
  for (const h of [19.8, 21, 3]) {
    vm.obs.clock.h = h; vm.frame.nowMs += 16; map.update(vm);
    assert.deepEqual([Array.from(roof.alpha), Array.from(roof.on), map.debug.fx.glint], [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 0], 'h = ' + h);
  }
  assert.equal(DESK_WEEKEND.sun.setH, 19.8);
  // mid-day: output, cloud and the clock move; nothing cached is redrawn and nothing is searched
  vm.obs.clock.h = 11; vm.frame.nowMs += 16; map.update(vm);
  const r0 = {...map.debug.rebuilds};
  assert.equal(r0.roof, 1, 'the panels were laid out once');
  let calls = 0;
  for (const k of ['find', 'findIndex', 'filter', 'map']) vm.obs.rooftop.suburbs[k] = function (f) { calls++; return Array.prototype[k].call(this, f); };
  for (let i = 0; i < 120; i++) {
    vm.frame.nowMs += 16; vm.obs.clock.h = 11 + i / 480; vm.obs.s += 2;
    for (const r of vm.obs.rooftop.suburbs) r.mw *= 0.999;
    map.update(vm);
  }
  assert.deepEqual(map.debug.rebuilds, r0, 'no cached-layer rebuild at mid-day');
  assert.equal(calls, 0, 'no search of obs.rooftop.suburbs in the frame loop');
  assert.deepEqual([...doc.canvasStats.bad, ...m0.doc.canvasStats.bad], []);
});

test('P-12 / G-3: a dark district\'s panels do not glint; a relit one waits for its inverters (reconnectS), then joins as they ramp', () => {
  const {map, seen} = mountWatched();
  const vm = noonVm({settings: {reducedMotion: true}}); // a still pattern: the same panels every frame
  const frame = () => { seen.reset(); vm.frame.nowMs += 16; map.update(vm); return new Set(seen.rects); };
  vm.frame.nowMs = 1000; map.update(vm);
  const all = frame(), j = D.SUBURBS.findIndex(sb => sb.id === 'SAL'), lit = map.debug.roof.on[j];
  const sal = vm.obs.districts.filter(d => d.suburb === 'SAL'), di = vm.obs.districts.indexOf(sal[0]);
  assert.ok(sal.length === 6 && lit >= 6);
  // one district dark: only its panels stop
  sal[0].dark = true;
  const one = frame();
  assert.ok(one.size < all.size && [...one].every(r => all.has(r)), 'a subset: ' + one.size + ' of ' + all.size);
  assert.equal(map.debug.roof.conn[di], 0);
  const lost = all.size - one.size;
  assert.ok(lost >= 1 && map.debug.roof.on[j] === lit - lost);
  // relit: 60 s of waiting (ROOF_RECONNECT_S), nothing yet
  sal[0].dark = false; sal[0].reconnectS = vm.obs.s + 30;
  assert.deepEqual(frame(), one, 'waiting to reconnect');
  // ramping: a share of them, growing with the ramp; all of them when it ends and when reconnectS is back at -1
  const sizes = [];
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    sal[0].reconnectS = vm.obs.s - frac * V.ROOF_RAMP_S;
    sizes.push(frame().size);
    assert.ok(Math.abs(map.debug.roof.conn[di] - frac) < 1e-6);
  }
  assert.ok(sizes[0] >= one.size && sizes[0] <= sizes[1] && sizes[1] <= sizes[2] && sizes[2] <= sizes[3] && sizes[3] === all.size, sizes.join(' <= ') + ' of ' + all.size);
  assert.ok(sizes[1] < all.size || lost < 2, 'half way up the ramp not every panel is back');
  sal[0].reconnectS = -1;
  assert.deepEqual(frame(), all);
  // the whole suburb dark: its path is empty (its alpha is its sky, not its connection)
  for (const d of sal) d.dark = true;
  frame();
  assert.equal(map.debug.roof.on[j], 0);
  // a view from before Phase 2a (no reconnectS on a district) counts as connected
  for (const d of vm.obs.districts) { d.dark = false; delete d.reconnectS; }
  assert.deepEqual(frame(), all);
});

test('K-22 reduced motion: the rooftop glint is a still pattern; in motion each panel catches the sun at 0.4 Hz', () => {
  const run = rm => {
    const {map, seen} = mountWatched();
    const vm = noonVm({settings: {reducedMotion: rm}});
    const frames = [];
    for (let i = 0; i < 24; i++) { seen.reset(); vm.frame.nowMs = 30000 + i * 250; map.update(vm); frames.push(seen.rects.slice().sort().join(' ')); }
    return {frames, panels: map.debug.roof.panels.reduce((a, b) => a + b, 0)};
  };
  const still = run(true), moving = run(false);
  assert.equal(new Set(still.frames).size, 1, 'static under reduced motion');
  assert.ok(still.frames[0].length > 0, 'and still drawn');
  assert.equal(new Set(moving.frames).size, 10, 'moving otherwise: a different set of panels each quarter second of the cycle');
  // one cycle is 1 / glintHz = 2.5 s = 10 of these frames: the pattern repeats, and a panel is lit glintDuty of the time
  assert.equal(moving.frames[0], moving.frames[10]);
  const lit = moving.frames.slice(0, 10).reduce((a, f) => a + f.split(' ').length, 0) / 10;
  assert.ok(Math.abs(lit / moving.panels - D.ROOF_PV.glintDuty) < 0.08, (lit / moving.panels).toFixed(2) + ' of the panels at a time');
});

test('K-23 (2a): the map\'s text alternative says the rooftop MW; G-3: night windows follow underlying demand', async () => {
  const vm = noonVm();
  const mw = Math.round(vm.obs.rooftop.mw / 50) * 50;
  assert.ok(mw > 2500);
  assert.match(mapSummary(vm, null), new RegExp('Rooftop solar about ' + mw.toLocaleString('en-AU') + ' MW\\. '));
  vm.obs.rooftop.offMW = 149; vm.obs.rooftop.mw -= 149;
  assert.match(mapSummary(vm, null), /Rooftop solar about [\d,]+ MW, 150 MW off with dark districts\./);
  vm.obs.rooftop.mw = 0; vm.obs.rooftop.offMW = 0;
  assert.ok(!/Rooftop/.test(mapSummary(vm, null)), 'nothing to say at night');
  const classic = await vmOf();
  assert.equal(classic.obs.rooftop.capMW, 0);
  assert.ok(!/Rooftop/.test(mapSummary(classic, null)), 'nor on a scenario without rooftop');
  delete classic.obs.rooftop;
  assert.ok(!/Rooftop/.test(mapSummary(classic, null)));
  // windows: the same operational demand, more of the city awake behind it
  const windows = (underlying, now) => {
    const {map} = mount(1280, 268);
    const v = noonVm();
    v.obs.clock.h = 22; v.obs.demand.nowMW = now;
    if (underlying === undefined) delete v.obs.demand.underlyingMW; else v.obs.demand.underlyingMW = underlying;
    map.update(v);
    return Object.values(map.debug.districts).reduce((a, d) => a + d.windows, 0);
  };
  const low = windows(3000, 5000), high = windows(7500, 5000);
  assert.ok(low > 0 && high > low * 1.5, 'windows ' + low + ' at 3,000 MW, ' + high + ' at 7,500 MW underlying');
  assert.equal(windows(undefined, 7500), high, 'a view without underlyingMW falls back on demand.nowMW');
  // by day the windows are not drawn, so the underlying demand moving redraws nothing
  const {map} = mount(1280, 268);
  const day = noonVm();
  map.update(day);
  const r0 = {...map.debug.rebuilds};
  for (let i = 0; i < 20; i++) { day.frame.nowMs += 16; day.obs.demand.underlyingMW += 200; map.update(day); }
  assert.deepEqual(map.debug.rebuilds, r0);
});

test('L-9 / C-10: a plant lights for guard-stop-<unit> as for guard-start-<unit>, and for its lever', async () => {
  const {map} = mount(1280, 268);
  const rings = glow => { const vm = noonVm({glow: new Set(glow)}); map.update(vm); return map.debug.fx.rings; };
  assert.equal(rings([]), 0);
  assert.equal(rings(['guard-start-ccgt2']), 1);
  assert.equal(rings(['guard-stop-ccgt2']), 1, 'a STOP hint lights its plant');
  assert.equal(rings(['guard-stop-ccgt1', 'guard-stop-ccgt2', 'lever-ccgt']), 1, 'one ring per plant');
  assert.equal(rings(['guard-stop-hydro3', 'guard-stop-gta1']), 2);
  assert.equal(rings(['lever-coal', 'dial-battery', 'key-rert', 'stack']), 2, 'targets that are not on the map light nothing');
  for (const m of V.MACHINES) assert.equal(rings(['guard-stop-' + m.id]), 1, m.id);
});

test('Q-41: every click on the map answers: a plant its control, a dark suburb the RESTORE bay, the rest a blue label for 4 s', async () => {
  const {map, ui, cv} = mount(1280, 268);
  const vm = baseVm(observe(createState(5, DESK_WEEKEND))); // 04:00, cheap: no day run
  for (const d of vm.obs.districts) d.dark = d.suburb === 'SAL';
  vm.obs.rooftop.suburbs.find(s => s.id === 'RED').mw = 120;
  map.update(vm);
  const L = map.debug.layout;
  const click = (x, y) => cv.dispatch('click', {clientX: L.dx + x * L.scale, clientY: L.dy + (y - L.srcY) * L.scale});
  const at = id => { const b = (D.PLANTS.find(q => q.id === id) || D.SUBURBS.find(s => 'sub:' + s.id === id)).box; click(b[0] + b[2] / 2, b[1] + b[3] / 2); };
  const shown = () => { vm.frame.nowMs += 16; map.update(vm); return map.debug.labels.filter(l => l.kind === 'info').map(l => l.text); };
  at('ccgt');
  assert.deepEqual(ui.pop(), {do: 'focus', target: 'lever-ccgt'}, 'a plant still focuses its control');
  assert.deepEqual(shown(), []);
  at('sub:SAL');
  assert.deepEqual(ui.pop(), {do: 'focus', target: 'bay-restore'}, 'a dark suburb: to the RESTORE bay');
  assert.deepEqual(shown(), []);
  const n = ui.length;
  at('wind');
  assert.deepEqual(shown(), [mapPinText(vm.obs, 'wind')]);
  assert.match(shown()[0], /^GALE RIDGE WIND [\d,]+ MW: the wind sets it, not the desk$/);
  assert.match(map.el.getAttribute('aria-label'), /GALE RIDGE WIND .* sets it/, 'said to a screen reader too');
  at('solar');
  assert.match(shown()[0], /^SUNPLAIN SOLAR [\d,]+ MW: the sun sets it, not the desk$/);
  at('sub:RED');
  const draws = vm.obs.districts.filter(d => d.suburb === 'RED').reduce((a, d) => a + d.coldLoadMW, 0);
  assert.deepEqual(shown(), [mapPinText(vm.obs, 'sub:RED')]);
  assert.match(shown()[0], /^REDGUM FLATS draws [\d,]+ MW; roofs make 120 MW$/);
  assert.equal(Number(/draws ([\d,]+)/.exec(shown()[0])[1].replace(/,/g, '')), Math.round(draws), 'what its feeders carry, as the RESTORE bay counts it');
  assert.equal(map.debug.pick(150, 185), null, 'open ground');
  click(150, 185);
  assert.deepEqual(shown(), ['Click a plant for its control, a suburb for its load']);
  assert.equal(ui.length, n, 'wind, solar, a lit suburb and the ground send nothing (no control over them)');
  vm.frame.nowMs += 4000;
  assert.deepEqual(shown(), [], 'the label goes after 4 s');
  // the pin never pushes a grid alarm off the map: two suburbs dark, wind pinned, COAL hovered
  for (const d of vm.obs.districts) d.dark = d.suburb === 'SAL' || d.suburb === 'RED';
  const ls = mapLabels(vm, 'coal', 'wind');
  assert.deepEqual(ls.map(l => l.kind), ['info', 'hover', 'alarm', 'alarm']);
  assert.deepEqual(ls.filter(l => l.kind === 'alarm').map(l => l.text.replace(/\d+/, 'N')), ['REDGUM FLATS: N DARK', 'SALTBUSH BAY: N DARK']);
});

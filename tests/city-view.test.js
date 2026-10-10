// The city levers on the map and the Live Stack (desk/README.md §31.6 view, §31.9.10; SPEC U-3,
// Q-56, Q-57). The map: a suburb's click and Enter open its card (a dark one through the RESTORE
// bay; Enter not in the briefing), its hover names it, the overlay rings the open card's suburb and
// a glowing one and tags a booked suburb with its lever and patience, per frame, not in the watch.
// The stack: a band >= 4 px along the skyline over each booked core in one pattern with its code,
// the other parts dashed, the redraw on a booking while paused, the hover (each part named, after
// the handles and the gaps) and the text alternative naming each block it shows.
// States are reached at 04:30 by booking or by pushing blocks (§31.9.12), never by a day run.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V} from '../sim/params.js';
import {createState, step, applyInput, observe} from '../sim/step.js';
import {DESK} from '../content/scenarios.js';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import * as D from '../render/mapdata.js';
import {createMap, mapSummary, suburbTag} from '../render/map.js';
import {createLiveStack, stackSummary, blockText, SURPLUS_MIN_PX} from '../render/livestack.js';

const at = (h, m = 0) => (h - V.DAY_START_H) * 3600 + m * 60; // grid second of hh:mm
const BAND = 'rgba(230,237,243,0.6)';

// The state at 04:30 (the levers open), by seed: DESK 1 is a MILD weekday, 2 a HOT one.
const AT0430 = {};
function at0430(seed) {
  AT0430[seed] ||= (() => { const st = createState(seed, DESK); while (st.tick < V.PLAYER_START_TICK) step(st, []); return JSON.stringify(st); })();
  return JSON.parse(AT0430[seed]);
}
const book = (st, suburb, lever, atS) => { const r = applyInput(st, {type: 'flex', suburb, lever, atS}, []); assert.ok(r.ok, suburb + ' ' + lever + ': ' + r.reason); };
/** Push a block as the sim stores it (sorted, rev + 1): a time the window refuses, to see it inside the stack's 4.5 h. */
function poke(st, suburb, lever, atS, effMW, cost = lever === 'soak' ? 0 : V.PATIENCE_AIRCON) {
  st.levers.blocks.push({suburb, lever, atS, endS: atS + (lever === 'soak' ? V.SOAK_S : V.AIRCON_S), effMW, cost});
  st.levers.blocks.sort((a, b) => a.atS - b.atS);
  st.levers.rev++;
}

function mountStack(w = 336, h = 164) {
  const doc = makeDocument(), root = doc.createElement('div'), ui = [];
  doc.body.appendChild(root);
  const stack = createLiveStack(doc, root, {input: () => '', ui: c => { ui.push(c); }});
  stack.el.clientWidth = w; stack.el.clientHeight = h;
  const cv = stack.el.querySelector('canvas');
  cv.rect = {left: 0, top: 0, width: w, height: h};
  return {doc, stack, ui, cv};
}

function mountMap(w = 1280, h = 268) {
  const doc = makeDocument(), root = doc.createElement('div'), ui = [];
  doc.body.appendChild(root);
  const map = createMap(doc, root, {ui: c => ui.push(c)});
  map.el.clientWidth = w; map.el.clientHeight = h;
  const cv = map.el.querySelector('canvas');
  cv.rect = {left: 0, top: 0, width: w, height: h};
  return {doc, map, ui, cv};
}

/** Record fillRect, strokeRect and fillText on a canvas from now on, and the dashed strokes' segments. */
function spy(cv) {
  const ctx = cv.getContext('2d'), log = {rects: [], frames: [], texts: [], dashed: []};
  let dash = [], seg = [];
  ctx.setLineDash = d => { dash = d; };
  ctx.beginPath = () => { seg = []; };
  ctx.moveTo = (x, y) => { seg.push([x, y]); };
  ctx.lineTo = (x, y) => { if (seg.length) seg[seg.length - 1].push(x, y); };
  ctx.stroke = () => { if (dash.length) log.dashed.push(...seg); };
  ctx.fillRect = (x, y, w, h) => { log.rects.push({style: ctx.fillStyle, x, y, w, h}); };
  ctx.strokeRect = (x, y, w, h) => { log.frames.push({style: ctx.strokeStyle, x, y, w, h}); };
  ctx.fillText = (text, x, y) => { log.texts.push(String(text)); };
  return log;
}

test('Q-57 / §31.3.11: a soak booked while paused redraws the stack; each core is a band >= 4 px along the skyline at the floor, one pattern for every suburb; the text names each block', () => {
  const st = at0430(1);
  assert.deepEqual(st.day, {temp: 'MILD', weekend: false});
  const {stack, cv, doc} = mountStack();
  const vm = baseVm(observe(st));
  stack.update(vm);
  const S = stack.debug.stats, d0 = S.draws;
  stack.update(vm);
  assert.equal(S.draws, d0, 'at rest: no redraw');
  // the clock held (paused): a real booking at 04:30 for 10:30 is the only change, and it redraws
  book(st, 'HAZ', 'soak', at(10, 30));
  const paused = baseVm(observe(st), {frame: vm.frame});
  assert.equal(paused.obs.s, vm.obs.s);
  stack.update(paused);
  assert.equal(S.draws, d0 + 1, 'obs.levers.rev is in the redraw key');
  assert.equal(stack.debug.flex.length, 0, '10:30 is beyond the 4.5 h ahead: nothing drawn yet');
  // two soaks under way inside the window (pushed: 05:30 is outside the soak window), RED then SOL
  poke(st, 'RED', 'soak', at(5, 30), 110);
  poke(st, 'SOL', 'soak', at(5, 45), 60);
  const obs = observe(st);
  const log = spy(cv);
  stack.update(baseVm(obs, {frame: vm.frame}));
  const P = stack.debug.proj, G = stack.debug.geom, F = stack.debug.flex;
  assert.ok(Math.max(...obs.forecast.flexMW) > 169, 'the skyline carries both (Q-50): ' + Math.max(...obs.forecast.flexMW));
  const cores = F.filter(r => r.core);
  assert.deepEqual([...new Set(cores.map(r => r.b.suburb))], ['RED', 'SOL']);
  for (const r of cores) {
    assert.ok(r.h >= SURPLUS_MIN_PX && SURPLUS_MIN_PX >= 4, r.b.suburb + ': ' + r.h + ' px (110 MW is under 2 px of the axis at the floor)');
    assert.ok(P.times[r.k] > r.b.atS && P.times[r.k] < r.b.endS, 'over its core only');
  }
  // along the skyline, load below it; where both run, SOL's band stacks under RED's
  for (const r of cores.filter(q => q.b.suburb === 'RED')) assert.ok(Math.abs(r.y - G.y(P.p50[r.k])) < 1e-9, 'RED hangs from the skyline');
  const k = cores.find(r => r.b.suburb === 'SOL' && cores.some(q => q.b.suburb === 'RED' && q.k === r.k)).k;
  const [red, sol] = ['RED', 'SOL'].map(id => cores.find(r => r.b.suburb === id && r.k === k));
  assert.ok(Math.abs(sol.y - (red.y + red.h)) < 1e-9, 'stacked, not overdrawn');
  // drawn: the same fill for both (no suburb colours) and rows (K-22: a pattern of its own); each band's code once, at the floor too (K-22)
  const bands = log.rects.filter(r => r.style === BAND);
  assert.equal(bands.length, cores.length);
  assert.ok(bands.every(r => r.h >= 4));
  assert.deepEqual(log.texts.filter(t => t === 'RED' || t === 'SOL' || t === 'HAZ').sort(), ['RED', 'SOL']);
  // the text alternative names each block the picture shows (K-23): not HAZ's 10:30, beyond the 4.5 h
  const said = stackSummary(P, obs, false);
  for (const b of obs.levers.blocks) assert.equal(said.includes('Booked: ' + blockText(b) + '.'), b.suburb !== 'HAZ', b.suburb + ': ' + said);
  assert.match(said, / Booked: HOT WATER SOAK Redgum Flats 110 MW 05:30 to 09:30\./);
  assert.ok(!said.includes('Old Hazelton'), said);
  const later = structuredClone(obs);
  later.s += 15; // the next redraw, a real second on (the label is refreshed at most once a second)
  stack.update(baseVm(later, {frame: {nowMs: vm.frame.nowMs + 1500, dtS: 1 / 60, alpha: 0}}));
  assert.equal(cv.getAttribute('aria-label'), stackSummary(stack.debug.proj, later, false));
  assert.ok(cv.getAttribute('aria-label').includes('Booked: HOT WATER SOAK Solstice Rise 60 MW 05:45 to 09:45.'));
  assert.deepEqual(doc.canvasStats.bad, []);
});

test('Q-57: air-con: the relief band above the skyline, pre-cool and snapback dashed below it, the night fall dashed above; codes in both layouts; the hover names the block and its part, rings its suburb, and yields to a red gap', () => {
  const st = at0430(2);
  assert.equal(st.day.temp, 'HOT');
  poke(st, 'TAL', 'aircon', at(6), 13.5);   // pre-cool 05:00, relief 06:00-07:30, snapback to 09:00
  poke(st, 'HAZ', 'soak', at(5), 140);
  const obs = observe(st);
  // the soak's night fall, moved into the window (22:00 is beyond 4.5 h at 04:30): the view draws parts as the sim gives them
  const night = obs.levers.blocks.find(b => b.lever === 'soak').parts.find(p => p.kind === 'night');
  night.knots = night.knots.map(([s, mw]) => [s - at(22) + at(7), mw]);
  for (const [w, h] of [[336, 164], [1248, 420]]) {
    const {stack, cv, ui, doc} = mountStack(w, h);
    const log = spy(cv);
    stack.update(baseVm(structuredClone(obs), {stackExpanded: w > 600}));
    const P = stack.debug.proj, G = stack.debug.geom, F = stack.debug.flex;
    const relief = F.filter(r => r.b.suburb === 'TAL' && r.core), below = F.filter(r => r.b.suburb === 'TAL' && !r.core), fall = F.filter(r => r.b.suburb === 'HAZ' && !r.core);
    assert.ok(relief.length >= 17, w + ': the 1.5-h relief, column by column: ' + relief.length);
    for (const r of relief) assert.ok(r.h >= 4 && r.y + r.h <= G.y(P.p50[r.k]) + 1e-9, 'above the skyline (a dent)');
    assert.ok(below.length > 20, 'pre-cool and snapback: ' + below.length);
    assert.ok(below.every(r => r.o > 0 && r.y >= G.y(P.p50[r.k]) - 1e-9), 'below the skyline (added load)');
    assert.ok(below.some(r => P.times[r.k] < at(6)) && below.some(r => P.times[r.k] > at(7, 30)), 'before and after the relief');
    assert.ok(fall.length > 0 && fall.every(r => r.o === 0 && r.y + r.h <= G.y(P.p50[r.k]) + 1e-9), 'the night fall above the skyline');
    // every ghost is dashed, on its outer edge
    for (const r of [...below, ...fall]) assert.ok(log.dashed.some(s => s[0] === r.x && s[1] === r.y + r.o && s[2] === r.x + r.w), 'dashed at ' + P.times[r.k]);
    assert.equal(F.filter(r => !r.core).length, below.length + fall.length);
    // the code: once per band, in both layouts
    const codes = log.texts.filter(t => t === 'TAL' || t === 'HAZ');
    assert.deepEqual(codes.sort(), ['HAZ', 'TAL']);
    // the hover: a relief column names the block, rings TAL on the map (L-9) and never grabs (no drag in 2b)
    // (its top: the morning is SHORT under it, and the red gap's hover reaches 2 px over the skyline)
    const r = relief[Math.floor(relief.length / 2)], x = r.x + r.w / 2, y = r.y + 1;
    assert.equal(P.gap[r.k], 'red');
    cv.dispatch('pointermove', {clientX: x, clientY: y});
    const tip = stack.el.querySelector('.livestack-tip');
    assert.equal(tip.textContent, blockText(obs.levers.blocks.find(b => b.suburb === 'TAL')));
    assert.match(tip.textContent, /^AIR-CON CYCLE Tallowood Heights 14 MW 06:00 to 07:30$/);
    assert.deepEqual(ui[ui.length - 1], {do: 'hover', target: 'suburb-TAL'});
    assert.notEqual((stack.debug.hitTest(x, y) || {}).kind, 'flex', 'a press never takes a band');
    // a ghost's hover names its part under the block (U-2's rebound) where no handle or gap claims the point (V-9; the
    // HOT morning is SHORT nearly throughout at 04:30, so at the floor, a column of each part that hovers as its block)
    if (w < 600) for (const [rows, re] of [[below.filter(q => P.times[q.k] < at(6)), /^AIR-CON CYCLE Tallowood Heights 14 MW 06:00 to 07:30\nPRE-COOL: /],
      [below.filter(q => P.times[q.k] > at(7, 30)), /^AIR-CON CYCLE Tallowood Heights 14 MW 06:00 to 07:30\nSNAPBACK: load returning after it$/],
      [fall, /^HOT WATER SOAK Old Hazelton 140 MW 05:00 to 09:00\nNIGHT HEATING: /]]) {
      const q = rows.find(c => stack.debug.hitTest(c.x + c.w / 2, c.y + c.h / 2, true).kind === 'flex');
      assert.ok(q, re.source);
      cv.dispatch('pointermove', {clientX: q.x + q.w / 2, clientY: q.y + q.h / 2});
      assert.match(tip.textContent, re);
    }
    assert.deepEqual(doc.canvasStats.bad, []);
  }
  // V-9: a red SHORT column under the snapback still hovers as the gap (its L-9 glow), as a press takes it
  const short = structuredClone(obs), fc = short.forecast;
  for (let k = 0; k < fc.demandP50.length; k++) if (fc.fromS + (k + 1) * fc.stepS > at(7, 45) && fc.fromS + (k + 1) * fc.stepS < at(8, 45)) fc.demandP50[k] += 2500;
  const {stack, cv} = mountStack();
  stack.update(baseVm(short));
  const P = stack.debug.proj, q = stack.debug.flex.find(r => r.part === 'snapback' && P.gap[r.k] === 'red');
  assert.ok(q, 'a red column under the snapback');
  assert.equal(stack.debug.hitTest(q.x + q.w / 2, q.y + q.h / 2, true).kind, 'gap');
  cv.dispatch('pointermove', {clientX: q.x + q.w / 2, clientY: q.y + q.h / 2});
  assert.match(stack.el.querySelector('.livestack-tip').textContent, /^SHORT /);
});

test('Q-56: the map routes a suburb\'s click and Enter to its card (a dark one through the RESTORE bay, Q-42); its hover names suburb-<ID>; Enter on a plant is its click; RESPOND and the briefing keep Enter', () => {
  const {map, ui, cv} = mountMap();
  const vm = baseVm(observe(createState(1, DESK)));   // 04:00: no day run
  vm.obs.districts.find(d => d.suburb === 'SOL').dark = true;
  map.update(vm);
  const L = map.debug.layout;
  const xy = id => { const b = D.SUBURBS.find(s => s.id === id).box; return {clientX: L.dx + (b[0] + b[2] / 2) * L.scale, clientY: L.dy + (b[1] + b[3] / 2 - L.srcY) * L.scale}; };
  cv.dispatch('click', xy('HAZ'));
  assert.deepEqual(ui.splice(0), [{do: 'suburb', id: 'HAZ'}], 'a lit suburb: its card');
  assert.ok(vm.obs.districts.some(d => d.dark && d.suburb === 'SOL'));
  cv.dispatch('click', xy('SOL'));
  assert.deepEqual(ui.splice(0), [{do: 'focus', target: 'bay-restore'}, {do: 'suburb', id: 'SOL'}], 'a dark one: RESTORE first, then the card');
  cv.dispatch('pointermove', xy('TAL'));
  assert.deepEqual(ui.splice(0), [{do: 'hover', target: 'suburb-TAL'}]);
  cv.dispatch('pointerleave', {});
  assert.deepEqual(ui.splice(0), [{do: 'hover', target: null}]);
  // the keyboard: Enter presses what the arrows reached as a click does (Q-42: never silent)
  assert.match(map.el.getAttribute('aria-keyshortcuts'), /\bEnter\b/);
  map.el.focus();
  const key = k => map.key({type: 'keydown', key: k});
  assert.equal(key('Home'), true);
  ui.splice(0);
  assert.equal(key('Enter'), true);
  assert.deepEqual(ui.splice(0), [{do: 'focus', target: 'lever-coal'}], 'a plant: its control');
  while (map.debug.hoverId !== 'wind') key('ArrowRight');
  ui.splice(0);
  assert.equal(key('Enter'), true);
  assert.equal(map.debug.pin.id, 'wind', 'wind: its label');
  assert.deepEqual(ui, []);
  while (map.debug.hoverId !== 'sub:SOL') key('ArrowRight');
  assert.equal(mapSummary(vm, 'sub:SOL').endsWith('On Solstice Rise: Enter opens its card.'), true);
  ui.splice(0);
  assert.equal(key('Enter'), true);
  assert.deepEqual(ui.splice(0), [{do: 'focus', target: 'bay-restore'}, {do: 'suburb', id: 'SOL'}]);
  key('ArrowRight');
  ui.splice(0);
  key('Enter');
  assert.deepEqual(ui.splice(0), [{do: 'suburb', id: 'RED'}]);
  // the RESPOND card keeps Enter, and so does the briefing (Enter takes the desk)
  map.update(baseVm(vm.obs, {respond: {cause: 'unit'}}));
  assert.equal(key('Enter'), false);
  map.update(baseVm(vm.obs, {phase: 'briefing'}));
  assert.equal(key('Enter'), false);
  assert.deepEqual(ui, []);
});

test('Q-57 / §31.9.10: the map rings the open card\'s suburb and a glowing one, tags a booked suburb with its lever and patience (after an air-con booking, or locked), per frame, not in the watch: no cached layer rebuilds', () => {
  const st = at0430(2);
  book(st, 'SOL', 'soak', at(10));
  book(st, 'HAZ', 'aircon', at(19));
  book(st, 'TAL', 'aircon', at(15));
  book(st, 'TAL', 'aircon', at(17, 30));
  book(st, 'HAR', 'soak', at(10, 30));
  book(st, 'HAR', 'aircon', at(16));
  applyInput(st, {type: 'flexDel', suburb: 'HAR', lever: 'aircon', atS: at(16)}, []);   // booked and cancelled: patience back
  const obs = observe(st), lv = obs.levers, tag = id => suburbTag(lv, id, obs.s);
  assert.equal(tag('SOL'), 'SOAK 10:00', 'a soak: the mark, no patience');
  assert.equal(tag('HAZ'), 'AIR 19:00 ☺ 80', 'patience after its first air-con booking');
  assert.equal(tag('TAL'), 'AIR 15:00 ☹ 15 LOCKED', 'Q-54: 40 - 10 - 15, under 25');
  assert.equal(tag('HAR'), 'SOAK 10:30', 'cancelled: no air-con booked, patience 50 not shown');
  assert.ok(mapSummary(baseVm(obs), 'sub:TAL').endsWith(' On Tallowood Heights AIR 15:00 ☹ 15 LOCKED: Enter opens its card.'), 'K-23: the hovered suburb\'s mark in words');
  assert.equal(tag('RED'), '');
  assert.equal(suburbTag(lv, 'TAL', at(21)), '☹ 15 LOCKED', 'the blocks over: the patience stays');
  assert.equal(suburbTag(lv, 'SOL', at(14)), '', 'its soak over');
  assert.equal(suburbTag({suburbs: [], blocks: []}, 'HAZ', 0), '', 'CLASSIC');
  const {map, cv} = mountMap();
  const vm = baseVm(obs);
  map.update(vm);
  const r0 = {...map.debug.rebuilds}, log = spy(cv), L = map.debug.layout;
  const frame = over => { log.frames.length = 0; log.texts.length = 0; vm.frame.nowMs += 16; Object.assign(vm, over); map.update(vm); };
  frame({suburb: 'RED'});
  const b = D.SUBURBS.find(s => s.id === 'RED').box;
  assert.deepEqual(log.frames.filter(f => f.style === D.UI.blue).map(f => [f.x, f.y]), [[L.dx + b[0] * L.scale - 3, L.dy + (b[1] - L.srcY) * L.scale - 3]], 'the open card\'s suburb');
  const tags = ['SOAK 10:00', 'AIR 19:00 ☺ 80', 'AIR 15:00 ☹ 15 LOCKED', 'SOAK 10:30'];
  for (const t of tags) assert.ok(log.texts.includes(t), t + ' in ' + log.texts);
  frame({suburb: 'RED', mode: {mode: 'WATCH', rate: 0.15, watchS: 1, locked: true}});
  assert.equal(log.frames.filter(f => f.style === D.UI.blue).length, 0, 'hidden with the card in the watch');
  assert.deepEqual(log.texts.filter(t => tags.includes(t)), [], 'and the tags (the spotlight dims all but the cause)');
  frame({suburb: null, mode: {mode: 'CRUISE', rate: 120, watchS: -1, locked: false}, glow: new Set(['suburb-SAL', 'suburb-HAZ'])});
  assert.equal(map.debug.fx.rings, 2, 'a glowing suburb rings (the objective names it)');
  // a new booking shows on the next frame, from the overlay alone
  book(st, 'RED', 'aircon', at(18));
  vm.obs = observe(st);
  frame({glow: new Set()});
  assert.ok(log.texts.includes('AIR 18:00 ☺ 50'), log.texts.join('|'));
  assert.deepEqual(map.debug.rebuilds, r0, 'no cached layer redrawn');
});

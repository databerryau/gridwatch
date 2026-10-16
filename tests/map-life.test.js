// W6 map life and weather (SPEC G-4 beyond a tint, U-8; render/map.js "W6, map life"). What the
// map draws follows observe() alone: a warned storm's wall, its band crossing and its rain; each
// suburb's own sky under a front (Q-79); turbines stopped in a cut-out; a dark district's windows
// and streetlights out; every active lever on its suburb; nothing from the pre-rolled weather; and
// reduced motion holds what moves, keeping the look. Real DESK days are jumped to a moment (their
// due news published and their skies sampled, as step() does each second; no grid is stepped);
// other views are set by hand.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDocument} from './lib/dom.js';
import {baseVm} from './lib/vm-fixture.js';
import {tokenize, importSpecifiers} from './lib/js-tokens.js';
import {V} from '../sim/params.js';
import {createState, observe} from '../sim/step.js';
import * as events from '../sim/events.js';
import * as weather from '../sim/weather.js';
import {DESK} from '../content/scenarios.js';
import * as D from '../render/mapdata.js';
import {createMap, mapSummary, stormBandOf, suburbCloud, trafficAt, weatherOf} from '../render/map.js';

const at = (h, m = 0) => Math.round((h - V.DAY_START_H) * 3600 + m * 60); // the grid second of hh:mm
const J = id => D.SUBURBS.findIndex(sb => sb.id === id);
const C = D.LIFE_COLOURS;

/** A DESK day's state at 04:00 (DESK 1: MILD, a cloud front over the suburbs; 2: HOT; 9: a storm). */
const day = seed => createState(seed, DESK);
/** Jump a day to grid second s (forward only): its due news published and its skies sampled. */
function jump(st, s) { st.tick = s * V.TICKS_PER_S; events.applyDue(st, []); weather.sampleSecond(st); return st; }
/** A view set by hand: DESK 2's 04:00 view at hh:mm, with its sky and its news replaced. */
function viewAt(h, o = {}) {
  const obs = observe(day(o.seed ?? 2));
  obs.clock.h = h; obs.s = at(h);
  obs.sky = {clearness: o.clear ?? 0.95, windFrac: o.wind ?? 0.5};
  obs.wind.outMW = V.WIND_MW * (o.windOut ?? obs.sky.windFrac);
  obs.news = o.news || [];
  return baseVm(obs, {settings: {reducedMotion: !!o.rm}});
}
const storm = (s, agoS, o = {}) => ({atS: s - agoS - 7200, kind: 'storm', fromS: s - agoS, toS: o.toS ?? null, text: ''});

/** The water's glints, the storm's slate by day (its wall and shelf; pale while lightning lights the wall) and its lit crown, a suburb's shade. */
const GLINT = 'rgba(255,248,220,', SLATE = ['rgb(70,76,94)', 'rgb(206,212,236)'], RIM = 'rgb(168,174,190)', SHADE = 'rgba(10,16,30,';

/**
 * A map at 1280x720's map area (or w x h). Per frame: `marks`, its small marks in the life's colours and the water's glints
 * ('colour x,y,w,h'); `fills`, every path it fills ({c: colour, a: alpha, x0, y0, x1, y1}: the path's box, base px).
 */
function mount(w = 1280, h = 344) {
  const doc = makeDocument(), root = doc.createElement('div');
  doc.body.appendChild(root);
  const made = [], create = doc.createElement;
  doc.createElement = t => { const e = create(t); if (t === 'canvas') made.push(e); return e; };
  const map = createMap(doc, root, {ui: () => {}});
  map.el.clientWidth = w; map.el.clientHeight = h;
  const ours = new Set([...C.cars, C.head, C.tail, C.steam, C.fanBody, C.fanBlade]), g = made[1].getContext('2d'), marks = [], fills = [];
  g.fillRect = (x, y, w, h) => { if (ours.has(g.fillStyle) || String(g.fillStyle).startsWith(GLINT)) marks.push(g.fillStyle + ' ' + x + ',' + y + ',' + w + ',' + h); };
  let box = null;
  const grow = (x0, y0, x1, y1) => { box = box ? [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)] : [x0, y0, x1, y1]; };
  g.beginPath = () => { box = null; };
  g.moveTo = g.lineTo = (x, y) => grow(x, y, x, y);
  g.rect = (x, y, w, h) => grow(x, y, x + w, y + h);
  g.ellipse = (x, y, rx, ry) => grow(x - rx, y - ry, x + rx, y + ry);
  g.arc = (x, y, r) => grow(x - r, y - r, x + r, y + r);
  g.fill = () => { if (box) fills.push({c: g.fillStyle, a: g.globalAlpha ?? 1, x0: box[0], y0: box[1], x1: box[2], y1: box[3]}); };
  let nowMs = 1000;
  /** n frames dtMs apart; the fx (copied), the marks and the fills of each. */
  const frames = (vm, n = 1, dtMs = 100) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      marks.length = 0; fills.length = 0; nowMs += dtMs; vm.frame.nowMs = nowMs; map.update(vm);
      out.push({...map.debug.fx, shade: Array.from(map.debug.fx.shade), fanRate: Array.from(map.debug.fx.fanRate), marks: marks.slice(), fills: fills.slice()});
    }
    return out;
  };
  return {doc, map, frames, last: vm => frames(vm, 12)[11]};
}
/** The storm's slate in the sky strip (its wall, its shelf and the shelf's ceiling) at alpha a or more. */
const slate = (f, a = 0.5) => f.fills.filter(q => SLATE.includes(q.c) && q.y0 < D.HORIZON_Y && q.a >= a);
/** How far east that slate reaches (base px; -Infinity: none). */
const slateEast = f => Math.max(...slate(f).map(q => q.x1));

test('W6 (G-4): a storm draws from its warning: its wall rises in the west the hour before the warned arrival, its rain band crosses west to east, its rain moves off east after the warned pass', () => {
  const st = day(9), w = st.ext.events.find(e => e.type === 'stormWarn');
  assert.ok(w, 'DESK 9 is a storm day');
  const {arriveS, passS} = w.args, m = mount();
  const see = s => { const vm = baseVm(observe(jump(st, s))); return {vm, band: stormBandOf(vm.obs), fx: m.last(vm), text: mapSummary(vm, null)}; };
  const warned = see(arriveS - 1800);
  assert.deepEqual(warned.band, {near: 0.5, lead: -1, trail: -1}, 'warned, half an hour out');
  assert.deepEqual([warned.fx.near, warned.fx.rain, warned.fx.bandX, warned.fx.shelfX], [0.5, 0, -1, -1], 'the wall, no rain yet, no shelf');
  assert.match(warned.text, /^City map, day, a storm in the west\./);
  // the band's leading edge a third, then two thirds, of the way across (base px from x = -30 to 670): rain only behind it,
  // the shelf cloud on the edge
  const third = see(arriveS + 300), twoThirds = see(arriveS + 600), over = see(arriveS + 2400);
  assert.ok(Math.abs(third.fx.bandX - (700 / 3 - 30)) < 1e-6 && Math.abs(twoThirds.fx.bandX - (1400 / 3 - 30)) < 1e-6, third.fx.bandX + ' ' + twoThirds.fx.bandX);
  assert.deepEqual([third.fx.shelfX, twoThirds.fx.shelfX], [third.fx.bandX, twoThirds.fx.bandX], 'the shelf rides the edge');
  assert.ok(third.fx.bandA > twoThirds.fx.bandA && twoThirds.fx.bandA > 0, 'dark behind the edge, less so as the storm builds over the rest');
  assert.ok(third.fx.rain > 0 && third.fx.rain < twoThirds.fx.rain && twoThirds.fx.rain < over.fx.rain, [third, twoThirds, over].map(q => q.fx.rain).join(' < '));
  assert.deepEqual([third.fx.near, twoThirds.fx.near], [1, 0], 'the risen wall stands under the shelf until its ceiling has covered it');
  // overhead: no edge, no shelf, rain over the whole map, as before W6
  assert.deepEqual([over.fx.bandX, over.fx.shelfX, over.fx.near], [-1, -1, 0]);
  assert.equal(over.fx.rain, Math.round(40 + 110 * weatherOf(over.vm.obs).storm));
  // from the warned pass (the news' toS) the rain moves off east as it fades
  const clearing = see(passS + 900), gone = see(passS + 1801);
  assert.ok(Math.abs(clearing.band.trail - 0.5) < 1e-9 && clearing.fx.rain > 0 && clearing.fx.rain < over.fx.rain);
  assert.deepEqual([gone.band, gone.fx.rain, weatherOf(gone.vm.obs).storm], [{near: 0, lead: -1, trail: -1}, 0, 0]);
  // the warned pass is the news' own: a storm warned to pass an hour after it arrives is gone 30 min after that
  const s = at(17), short = {s, news: [storm(s, 3600 + 1801, {toS: s - 1801})]};
  assert.deepEqual([weatherOf({...short}).storm, stormBandOf(short).lead], [0, -1]);
  short.news[0].toS = null; // the classic day's warning names no pass: 2 h 20 min
  assert.ok(weatherOf(short).storm > 0.5);
  assert.deepEqual(m.doc.canvasStats.bad, []);
});

test('W6 (G-4): the storm never leaves the sky at its warned arrival: the wall hands over to the shelf, and the shelf fades into the storm\'s sky as it reaches the east', () => {
  const st = day(9), {arriveS} = st.ext.events.find(e => e.type === 'stormWarn').args, m = mount();
  const see = s => { const vm = baseVm(observe(jump(st, s))); return {fx: m.last(vm), text: mapSummary(vm, null)}; };
  // the risen wall reaches about 225 px east (fx.near 1 a second before the arrival); from the arrival its slate stands
  // until the shelf's ceiling, sweeping in from the west, has covered it: the slate never steps back west
  const ts = [-1, 1, 30, 60, 120, 200, 300, 400, 450, 500, 600, 800], seen = ts.map(e => see(arriveS + e));
  const east = seen.map(q => slateEast(q.fx));
  assert.ok(seen[0].fx.near > 0.99 && east[0] > 220, 'the wall at full height: ' + seen[0].fx.near + ', ' + east[0]);
  assert.ok(east.every((x, i) => !i || x >= east[i - 1] - 1), 'the slate\'s east edge by second after the arrival: ' + ts.map((e, i) => e + ' s ' + Math.round(east[i])).join(', '));
  assert.ok(seen[1].fx.shelfX < 0 && seen[1].fx.near === 1, 'the shelf has only just come in from the west, under the wall');
  // and the text keeps the storm: on the horizon, then here
  assert.match(seen[0].text, /^City map, day, a storm in the west\./);
  for (const q of seen.slice(1, 4)) assert.match(q.text, /^City map, day, storm\./);
  // the crossing's last eighth: the shelf and its ceiling fade with the band, so the last frame before the edge
  // reaches the east (lead 1, 900 s) is all but clear of slate and the next has none: no sky-wide step
  const late = see(arriveS + 895), done = see(arriveS + 900);
  const alpha = f => Math.max(0, ...slate(f, 0).map(q => q.a));
  assert.ok(late.fx.shelfX > 600 && alpha(late.fx) > 0 && alpha(late.fx) <= 0.05, 'the shelf at ' + late.fx.shelfX + ', alpha ' + alpha(late.fx));
  assert.deepEqual([done.fx.shelfX, slate(done.fx, 0).length], [-1, 0]);
});

test('W6 (G-4): the storm wall fits the rows the map area shows: at the 1280x600 floor its towers, anvil and crown are on screen; at 1280x720 it stands at full height', () => {
  const {arriveS} = day(9).ext.events.find(e => e.type === 'stormWarn').args;
  const wallAt = (w, h) => {
    const m = mount(w, h), f = m.last(baseVm(observe(jump(day(9), arriveS - 60))));
    const wall = f.fills.filter(q => (SLATE.includes(q.c) || q.c === RIM) && q.y0 < D.HORIZON_Y);
    return {top: Math.min(...wall.map(q => q.y0)), srcY: m.map.debug.layout.srcY, near: f.near, n: wall.length};
  };
  for (const [w, h] of [[1280, 268], [1920, 454]]) { // the floor (rows from 42), a maximised 1920x1080 browser (rows from 24)
    const q = wallAt(w, h);
    assert.ok(q.near > 0.95 && q.n >= 2 && q.top >= q.srcY - 1e-9, w + 'x' + h + ': the wall\'s top ' + q.top + ', first row shown ' + q.srcY);
  }
  const full = wallAt(1280, 344);
  assert.ok(full.srcY <= 4 && full.top < 20, '1280x720: the wall\'s top at ' + full.top);
});

test('W6 (G-4, Q-79): a front over the suburbs shades each by its own sky, west to east, and clears the same way; never at night or under a storm', () => {
  const st = day(1), cw = st.ext.events.find(e => e.type === 'cloudWarn'), on = cw.args.onsetS, m = mount();
  assert.equal(cw.args.frontPm, 320, 'DESK 1 has a front over the suburbs (Q-79)');
  const see = dMin => { const vm = baseVm(observe(jump(st, on + dMin * 60))); const fx = m.last(vm); return {vm, fx, sh: id => fx.shade[J(id)]}; };
  const before = see(-10);
  assert.deepEqual([before.fx.shade, before.fx.blobs], [[0, 0, 0, 0, 0, 0], 0], 'warned, not here yet: the future sky is not drawn');
  const west = see(15);
  assert.ok(west.sh('SOL') > 0.9 && west.sh('HAZ') > 0.8, 'SOL and HAZ first');
  for (const id of ['RED', 'HAR', 'TAL', 'SAL']) assert.equal(west.sh(id), 0, id);
  assert.ok(west.fx.blobs > 0, 'drifting shadows over them');
  assert.match(mapSummary(west.vm, null), /^City map, day, cloud over Old Hazelton and Solstice Rise\./);
  // the glint dims where the shade is (both read the suburb's own sky)
  const glint = id => m.map.debug.roof.alpha[J(id)];
  assert.ok(glint('SOL') < glint('SAL') * 0.7, 'SOL ' + glint('SOL') + ', SAL ' + glint('SAL'));
  const middle = see(35);
  assert.ok(middle.sh('RED') > 0.9 && middle.sh('HAR') > 0.6 && middle.sh('TAL') === 0 && middle.sh('SAL') === 0, middle.fx.shade.join(' '));
  const all = see(58);
  assert.ok(all.fx.shade.every(v => v > 0.9), all.fx.shade.join(' '));
  assert.ok(all.fx.blobs > west.fx.blobs, 'more of the city under the shadows');
  assert.match(mapSummary(all.vm, null), /cloud over the city\./);
  const clearing = see(120);
  assert.ok(clearing.sh('SOL') === 0 && clearing.sh('HAZ') === 0 && clearing.sh('SAL') > 0.9, 'it clears west to east: ' + clearing.fx.shade.join(' '));
  // daylight only, and the storm's own look stands over it
  const night = viewAt(22), stormy = viewAt(17.5, {news: [storm(at(17.5), 2400)]});
  for (const vm of [night, stormy]) { for (const q of vm.obs.rooftop.suburbs) q.clearness = 0.3; assert.deepEqual(m.last(vm).shade, [0, 0, 0, 0, 0, 0]); }
  assert.equal(suburbCloud(night.obs, 'SOL'), 0);
  assert.equal(suburbCloud(stormy.obs, 'SOL'), 1, 'the suburb\'s sky is cloud; the map draws the storm instead');
  assert.deepEqual(m.doc.canvasStats.bad, []);
});

test('W6 (G-4, U-8): the turbines turn with the wind, each at its own speed, stop in a cut-out, and carry red lamps at night', () => {
  const m = mount(), s = at(17.5);
  const windy = viewAt(17.5, {wind: 0.9, news: [storm(s, 2400)]});
  m.frames(windy, 60, 50);
  const speeds = D.WIND_TURBINES.map((_, i) => m.map.debug.rotorSpeed('wT' + i));
  assert.ok(speeds.every(v => v > 0.5) && new Set(speeds.map(v => v.toFixed(3))).size === speeds.length, 'turning, not in step: ' + speeds.map(v => v.toFixed(2)).join(' '));
  // the cut-out: the storm overhead and the wind output collapsed (weatherOf)
  const cut = viewAt(17.5, {wind: 0.18, windOut: 0.03, news: [storm(s, 4000)]});
  const f = m.frames(cut, 60, 100).at(-1); // 6 s: the rotors spin down over about 1.5 s
  assert.ok(f.feathered && weatherOf(cut.obs).cutOut);
  for (let i = 0; i < D.WIND_TURBINES.length; i++) assert.ok(m.map.debug.rotorSpeed('wT' + i) < 0.05, 'turbine ' + i + ' stopped');
  // at night the nacelles' lamps blink with the stacks' (steady under reduced motion); none by day
  const night = m.frames(viewAt(22), 12, 250).map(q => q.navLamps);
  assert.ok(night.includes(D.WIND_TURBINES.length) && night.includes(0), night.join(' '));
  assert.deepEqual([...new Set(m.frames(viewAt(22, {rm: true}), 12, 250).map(q => q.navLamps))], [D.WIND_TURBINES.length]);
  assert.equal(m.last(viewAt(12)).navLamps, 0);
});

test('W6 (G-3, U-8): a dark district loses its windows and its streetlights, at night and in a storm\'s gloom by day, and gets them back relit; a road by no district stays lit', () => {
  const m = mount(), vm = viewAt(22), d = () => m.map.debug.districts;
  m.frames(vm, 3);
  const ids = Object.keys(d()), lamped = ids.filter(id => d()[id].lamps > 0 && d()[id].windows > 0);
  assert.ok(lamped.length >= 12, lamped.length + ' districts with lit lamps of their own: ' + lamped.join(' '));
  const owners = new Set(Array.from(m.map.debug.life.lampBlk).filter(b => b >= 0).map(b => m.map.debug.blocks[b].suburb));
  assert.deepEqual([...owners].sort(), D.SUBURBS.map(sb => sb.id).sort(), 'every suburb has streetlights of its own (DESK 2 opens with HAR3 and HAR4 held dark: theirs are out)');
  const id = lamped[0], other = lamped.find(q => q.slice(0, 3) !== id.slice(0, 3)), before = {...d()[other]};
  vm.obs.districts.find(q => q.id === id).dark = true;
  m.frames(vm, 12); // 1.2 s: every block has gone (G-5's 90 ms each)
  assert.deepEqual([d()[id].windows, d()[id].lamps], [0, 0], id + ' dark');
  assert.deepEqual([d()[other].windows, d()[other].lamps], [before.windows, before.lamps], other + ' unchanged');
  vm.obs.districts.find(q => q.id === id).dark = false;
  m.frames(vm, 12);
  assert.ok(d()[id].windows > 0 && d()[id].lamps > 0, 'relit');
  // a storm's gloom by day lights windows and streets; a clear afternoon lights neither
  const gloomy = viewAt(15.5, {news: [storm(at(15.5), 2400)]});
  gloomy.obs.districts.find(q => q.id === id).dark = true;
  const g = m.last(gloomy);
  assert.ok(g.gloom > 0.3 && g.lamps > 0 && d()[other].windows > 0 && d()[other].lamps > 0, 'gloom ' + g.gloom);
  assert.deepEqual([d()[id].windows, d()[id].lamps], [0, 0], 'and not in the dark district');
  const clear = m.last(viewAt(15.5));
  assert.deepEqual([clear.gloom, clear.lamps, Object.values(d()).reduce((a, q) => a + q.windows, 0)], [0, 0, 0]);
  // every district dark: only the lamps on roads by no district are lit
  const black = viewAt(22);
  for (const q of black.obs.districts) q.dark = true;
  m.frames(black, 12);
  const roadOnly = Array.from(m.map.debug.life.lampBlk).filter(b => b < 0).length;
  assert.ok(roadOnly > 0 && m.map.debug.fx.lamps === roadOnly, m.map.debug.fx.lamps + ' of ' + roadOnly);
  assert.deepEqual(m.doc.canvasStats.bad, []);
});

test('W6 (U-8): every active lever shows on its suburb: a soak steams, an AIR-CON CYCLE\'s relief slows the fans (pre-cool and snapback speed them), a dark roof is still; no fans on a MILD day', () => {
  const m = mount(), vm = viewAt(15);
  assert.equal(vm.obs.day.temp, 'HOT', 'DESK 2 is a HOT day');
  vm.obs.demand.tempC = 36;
  const blk = (suburb, lever, a, b) => ({suburb, lever, atS: a, endS: b, effMW: 60, cost: 0});
  vm.obs.levers.blocks = [blk('SOL', 'soak', at(13), at(17)), blk('HAR', 'soak', at(10), at(14)), blk('TAL', 'aircon', at(14, 30), at(16)),
    blk('RED', 'aircon', at(15, 30), at(17)), blk('HAZ', 'aircon', at(13), at(14, 30))];
  const f = m.last(vm), life = m.map.debug.life;
  assert.equal(f.steam, life.vents[J('SOL')].length, 'SOL soaks now; HAR\'s soak is over');
  assert.ok(f.steam >= 3 && f.marks.some(q => q.startsWith(C.steam)));
  const base = 1.4; // FAN_HZ at 36 °C
  const want = {HAZ: base * 1.4, HAR: base, TAL: base * 0.15, SOL: base, RED: base * 1.4, SAL: base}; // HAZ: its snapback; RED: pre-cooling; TAL: the relief
  D.SUBURBS.forEach((sb, j) => assert.ok(Math.abs(f.fanRate[j] - want[sb.id]) < 1e-6, sb.id + ' ' + f.fanRate[j]));
  assert.ok(Math.max(...f.fanRate) <= 2, 'K-22: no fan blade faster than 2 Hz');
  assert.equal(f.fans, 18);
  // over 2 s a relieved suburb's blade barely moves; a hard-running one's goes round (each suburb's first condenser:
  // its blade is the blade mark inside the condenser's 2 x 2 square)
  const on = (k, colour, u) => { const [x, y] = k.split(' ')[1].split(',').map(Number); return k.startsWith(colour + ' ') && x >= u.x - 1 && x <= u.x + 1 && y >= u.y - 1 && y <= u.y; };
  const moves = j => {
    const u = life.fans[j][0], seen = m.frames(vm, 20, 100).map(q => q.marks.find(k => on(k, C.fanBlade, u)));
    assert.ok(seen.every(Boolean), 'the blade is drawn every frame');
    return seen.filter((k, i) => i && k !== seen[i - 1]).length;
  };
  const tal = moves(J('TAL')), red = moves(J('RED'));
  assert.ok(tal <= 2 && red >= 10, 'blade steps in 2 s: TAL ' + tal + ', RED ' + red);
  // a dark roof's heater and fan are off: no steam; its condenser dim (not the lit one's grey), no blade
  for (const q of vm.obs.districts) if (q.suburb === 'SOL') q.dark = true;
  const dark = m.last(vm), sol = life.fans[J('SOL')];
  assert.equal(dark.steam, 0);
  assert.ok(sol.length > 0 && dark.fans === 18 && !dark.marks.some(k => sol.some(u => on(k, C.fanBlade, u) || on(k, C.fanBody, u))), 'SOL\'s condensers are still');
  // a hot evening keeps them running after dark (dimmed with the roofs: never the day's grey), so a cycle booked for the
  // 19:30 peak shows its relief (19:30-21:00) and its snapback (to 22:30)
  const eve = viewAt(20);
  eve.obs.demand.tempC = 32;
  eve.obs.levers.blocks = [blk('RED', 'aircon', at(19, 30), at(21))];
  const relief = m.last(eve);
  eve.obs.clock.h = 21.5; eve.obs.s = at(21.5); eve.obs.demand.tempC = 29.6;
  const snap = m.last(eve), hz = tC => 1.4 * (tC - 22) / 14;
  for (const [f, tC, k] of [[relief, 32, 0.15], [snap, 29.6, 1.4]]) {
    assert.equal(f.fans, 18, 'the condensers at ' + tC + ' °C after dark');
    D.SUBURBS.forEach((sb, j) => assert.ok(Math.abs(f.fanRate[j] - hz(tC) * (sb.id === 'RED' ? k : 1)) < 1e-6, sb.id + ' ' + f.fanRate[j]));
    assert.ok(!f.marks.some(q => q.startsWith(C.fanBody + ' ') || q.startsWith(C.fanBlade + ' ')), 'not lit as by day');
  }
  // a MILD day, or a HOT one under 26 °C: no condensers running
  vm.obs.day.temp = 'MILD';
  assert.deepEqual([m.last(vm).fans, m.last(vm).fanRate.every(v => v === 0)], [0, true]);
  vm.obs.day.temp = 'HOT'; vm.obs.demand.tempC = 24;
  assert.equal(m.last(vm).fans, 0);
});

test('W6: nothing is drawn from hidden state: the map imports no sim state or weather, and a storm pre-rolled but not yet warned draws nothing', () => {
  const src = readFileSync(new URL('../render/map.js', import.meta.url), 'utf8'), toks = tokenize(src);
  assert.deepEqual(importSpecifiers(toks).sort(), ['../sim/params.js', './format.js', './mapdata.js']);
  assert.ok(!toks.some(t => t.type === 'ident' && ['ext', 'events', 'series', 'regime'].includes(t.text)), 'no reading of the pre-rolled day');
  // DESK 9 half an hour before its storm: with the warning held back (the storm still in the hidden pre-roll), no wall, no
  // band, no rain, no word; the same moment with the warning published as the sim publishes it draws the wall
  const s = day(9).ext.events.find(e => e.type === 'stormWarn').args.arriveS - 1800;
  const hidden = day(9);
  hidden.ext.events = hidden.ext.events.filter(e => e.type !== 'stormWarn');
  assert.ok(hidden.ext.events.some(e => e.type === 'stormArrive' && e.atS === s + 1800), 'the storm is in the pre-roll');
  const m = mount(), quiet = baseVm(observe(jump(hidden, s))), told = baseVm(observe(jump(day(9), s)));
  const a = m.last(quiet), b = m.last(told);
  assert.deepEqual([a.near, a.bandX, a.rain, a.sheets], [0, -1, 0, 0]);
  assert.doesNotMatch(mapSummary(quiet, null), /storm/);
  assert.equal(b.near, 0.5);
  assert.match(mapSummary(told, null), /a storm in the west/);
});

test('W6 / K-22: reduced motion holds the cars, the steam, the fans, the glints and the drifting shade, and the storm does not sweep; the look stays. In the watch life slows', () => {
  const lively = rm => {
    const vm = viewAt(17.5, {rm});
    vm.obs.demand.tempC = 36;
    vm.obs.levers.blocks = [{suburb: 'SOL', lever: 'soak', atS: at(16), endS: at(19), effMW: 60, cost: 0}];
    for (const q of vm.obs.rooftop.suburbs) if (q.id === 'SOL' || q.id === 'HAZ') q.clearness = 0.3;
    return vm;
  };
  const run = rm => mount().frames(lively(rm), 16, 250);
  const still = run(true), moving = run(false);
  // the look: the small marks (cars, steam, fans, the glints on the water) and where the shade's shadows are
  const look = q => q.marks.join(' ') + ' | ' + q.fills.filter(f => String(f.c).startsWith(SHADE)).map(f => f.x0.toFixed(2) + ',' + f.y0.toFixed(2)).join(' ');
  assert.deepEqual([...new Set(still.map(look))].length, 1, 'held');
  assert.ok(still[0].marks.length > 30 && still[0].cars > 0 && still[0].steam > 0 && still[0].fans > 0 && still[0].glitter > 0 && still[0].blobs > 0, 'and still drawn');
  assert.ok(still[0].marks.some(q => q.startsWith(GLINT)), 'the glints among the marks held');
  assert.deepEqual([...new Set(still.map(q => q.life))], [0]);
  assert.ok(new Set(moving.map(q => q.marks.join(' '))).size >= 15, 'moving otherwise');
  const drift = q => q.fills.filter(f => String(f.c).startsWith(SHADE)).map(f => f.x0).join(' ');
  assert.ok(new Set(moving.map(drift)).size >= 8, 'and the shadows drift');
  // the storm: under reduced motion no band or shelf crosses (the whole map takes it at once), and no lightning flickers in its wall
  const s = at(17), pass = o => mount().frames(viewAt(17, {wind: 0.9, news: [storm(s, 300)], ...o}), 2).at(-1);
  const rmPass = pass({rm: true}), mvPass = pass({});
  assert.deepEqual([rmPass.bandX, rmPass.shelfX, rmPass.rain > 0], [-1, -1, true]);
  assert.ok(mvPass.bandX > 0 && mvPass.shelfX === mvPass.bandX);
  const flashes = rm => mount().frames(viewAt(17, {news: [storm(s, -900)], rm}), 240, 250).filter(q => q.flash).length;
  assert.equal(flashes(true), 0);
  assert.ok(flashes(false) >= 1, 'about one in six seconds otherwise');
  // the watch: the life clock runs at 0.15 (the rotors slow there too)
  const w = mount(), vm = lively(false);
  const t0 = w.frames(vm, 2, 100).at(-1).life;
  vm.mode = {mode: 'WATCH', rate: 0.15, watchS: 1, locked: true, watchVersion: 'full'};
  const t1 = w.frames(vm, 10, 100).at(-1).life;
  assert.ok(Math.abs(t1 - t0 - 0.15) < 1e-6, (t1 - t0).toFixed(4) + ' life s in 1 real s');
});

test('W6 (U-8): the cars follow the hour (peaks at 08:00 and 17:30, headlights after dark); the life never sits in a plant\'s hit box', () => {
  assert.deepEqual([8, 17.5, 3, 12].map(trafficAt), [1, 1, 0.1, 0.55]);
  const m = mount(), cars = h => m.last(viewAt(h));
  const rush = cars(8), small = cars(3);
  assert.ok(rush.cars > 2 * small.cars && small.cars > 0, rush.cars + ' at 08:00, ' + small.cars + ' at 03:00');
  assert.ok(small.marks.some(q => q.startsWith(C.head)) && small.marks.some(q => q.startsWith(C.tail)) && !small.marks.some(q => C.cars.some(c => q.startsWith(c + ' '))), 'lights in the dark');
  assert.ok(!rush.marks.some(q => q.startsWith(C.head)) && rush.marks.some(q => C.cars.some(c => q.startsWith(c + ' '))), 'paint by day');
  // nothing the map must show is covered: no lane, streetlight, vent or condenser inside a plant's box, and the boxes still pick
  const inPlant = (x, y) => D.PLANTS.find(p => x >= p.box[0] && x <= p.box[0] + p.box[2] && y >= p.box[1] && y <= p.box[1] + p.box[3]);
  for (const [x1, y1, x2, y2] of D.LANES) for (let k = 0; k <= 1; k += 0.05) assert.ok(!inPlant(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k), 'lane ' + [x1, y1, x2, y2]);
  const life = m.map.debug.life;
  for (let i = 0; i < life.lampX.length; i++) assert.ok(!inPlant(life.lampX[i], life.lampY[i]), 'lamp ' + life.lampX[i] + ',' + life.lampY[i]);
  for (const u of life.vents.flat().concat(life.fans.flat())) assert.ok(!inPlant(u.x, u.y), 'roof ' + u.x + ',' + u.y);
  for (const p of D.PLANTS) assert.equal(m.map.debug.pick(p.box[0] + p.box[2] / 2, p.box[1] + p.box[3] / 2), p.id);
});

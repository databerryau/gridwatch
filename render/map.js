// render/map.js: the living isometric city map (desk/README.md §7, §14.3; SPEC G-1..G-5).
// One screen canvas; the scene is drawn on a fixed BASE_W x BASE_H offscreen canvas and
// blitted at an integer scale (render/mapdata.js scaleFor), letterboxed with the ground and
// sky colours, never sky under the ground. Reads the view model only (vm.obs, vm.mode,
// vm.hover, vm.glow, vm.alarms, vm.settings.reducedMotion). Math.random is cosmetic only (F-3).
//
//   const map = createMap(document, root, actions);   // root: the #map box
//   map.update(vm);                                   // every frame
//   map.key(ev);                                      // the shell forwards keys (§13.3); true when it acted
//
// What it shows
//   G-2  one silhouette per technology (shapes are data in mapdata.js PLANT_PARTS): coal =
//        hyperbolic cooling towers, banded stacks, a coal pile; CCGT = two boxy HRSGs with
//        stubby stacks; GTs = a shed and one stack each; hydro = a dam wall, a spillway and
//        penstocks; battery = rows of white containers; tie = tall lattice pylons marching off
//        the west edge; wind turbines on the ridge; solar rows on the plain. Labels on hover,
//        focus or alarm only (<= 3 at rest). Hovering a plant sends actions.ui({do: 'hover',
//        target}); vm.hover rings the plant back.
//   G-3  skyState(h): night, dawn, day, sunset (18:48), dusk; a sun disc crossing east to
//        west; long warm light and long shadows at sunset; lit windows at night, as many as
//        the city is using (underlying demand). Rooftop PV
//        (Phase 2a): panels on every suburb's roofs in proportion to its rooftop MW (the city
//        layer, cached) and a glint on them each frame: per suburb, as bright as its output
//        over its capacity (cloud dims it) and as the light; never on a dark district, on a
//        relit one only as its inverters ramp back; a static pattern under reduced motion.
//   G-4  weatherOf(obs): heat = haze on the horizon + a bleached warm palette + shimmer;
//        storm = two layers of dark cloud, slanted rain and rain sheets, a darker ground,
//        turbines feathered at cut-out; cloud front = grey cloud and soft shadows drifting
//        over the suburbs. All three are drawn static under reduced motion.
//   G-5  a shed district goes dark block by block (90 ms each) and gets a hatched outline; a
//        tripped machine smokes, strobes red and carries a ✕ for its whole lockout; rotors slow
//        in the watch; the watch spotlight (B-5) dims everything but the cause.
//
// Keys (map focused; tabindex 0): ←/→ cycle the plants then the suburbs (sets the hover and
// shows the label), Home the first, Esc leaves.
//
// Cost: the sky, the terrain (with the plants), the city (with its rooftop panels) and the
// cloud strips are cached on their own canvases and redrawn only when the light bucket, the
// weather bucket or a district's dark blocks change; a frame is a few blits plus the moving
// parts. The glint is one path and one fill per suburb from typed arrays laid out once.

import {V} from '../sim/params.js';
import {BASE_W, BASE_H, HORIZON_Y, COLOURS, UI, SUBURBS, SUBSTATIONS, TRUNKS, PLANTS, PLANT_PARTS, WIND_TURBINES, TURBINE_H,
  SOLAR_ROWS, SOLAR_ROW_W, RIDGE, LAKE, RIVER, BAY, ROADS, FIELDS, TREES, ROOF_PV, districtBlocks, roofPanels, backToFront, hash01, scaleFor} from './mapdata.js';
import {mw as fmtMW} from './format.js';

export const MAX_REST_LABELS = 3;
const BLOCK_MS = 90;          // G-5: one block goes dark (or relights) every 90 ms
const STROBE_MS = 500;        // half period: 1 Hz
const STROBE_RM_MS = 1000;    // reduced motion: 0.5 Hz (§13.5: <= 1 Hz)
const SPOT_MS = 600;          // B-5: the watch spotlight eases in over 0.6 s
const SPOT_R = 44;            // its radius, base px
// The sun (G-3). These are the middle of the two-hour ease of the light at each end of the
// day: the sky is in sunset at 18:48 (G-3 accept), in dusk through the evening neck, and the
// light is gone at 19:48, which is the scenario's own sunset (content/scenarios.js sun.setH
// 19.8) and the end of the P-2 rooftop curve. The disc is drawn against that light: it meets
// the horizon at 18:48 and is gone by 19:12, an hour before the scenario's geometric sunset.
// Phase 2a looked at moving the disc to 19:48 and left it (desk/README.md §21.5): the stars
// come out from about 19:00, so a disc on the horizon until 19:48 sits under them, and moving
// the whole light an hour later takes dusk off the evening neck (G-3). What follows the sun
// here follows the light, not the disc: the rooftop glint is under one alpha step by 19:05.
const SUNRISE_H = 6.3, SUNSET_H = 18.8;
/** Rooftop MW in the text alternative, to this step (it is re-read at most once a second, K-23). */
const ROOF_SAY_MW = 50;
const LABEL_FONT = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
const TAU = Math.PI * 2;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const hour = h => ((h % 24) + 24) % 24;

/** 0 at night, 1 at midday, easing through dawn and dusk (hour of day). */
export function sunAmount(h) {
  if (h < SUNRISE_H - 1 || h > SUNSET_H + 1) return 0;
  if (h < SUNRISE_H + 1) return (h - (SUNRISE_H - 1)) / 2;
  if (h > SUNSET_H - 1) return (SUNSET_H + 1 - h) / 2;
  return 1;
}

/**
 * G-3: the sky state at hour h (pure). 18:48 (h = 18.8) is 'sunset'.
 * @param {number} h hour of day
 * @returns {'night'|'dawn'|'day'|'sunset'|'dusk'}
 */
export function skyState(h) {
  h = hour(h);
  if (h < 5.3 || h >= 19.8) return 'night';
  if (h < 7.3) return 'dawn';
  if (h < 17.8) return 'day';
  if (h < 19.1) return 'sunset';
  return 'dusk';
}

// A storm, from its announced arrival (news.fromS): it builds over 15 min, sits overhead for
// the scenario's public window (arrival 16:40 to the pass at 19:00 = 2 h 20 min; the cut-out
// falls inside it, when windFrac collapses), then clears over 30 min.
const STORM_IN_S = 900, STORM_HOLD_S = 8400, STORM_OUT_S = 1800;

/**
 * G-4: the weather the map draws, from observe() only (pure).
 * @param {object} obs observe(state)
 * @returns {{heat:boolean, storm:number, cloud:number, windy:number, cutOut:boolean}} storm,
 *   cloud, windy in 0..1; cutOut: the storm has the turbines shut down (feathered).
 */
export function weatherOf(obs) {
  const sky = obs.sky || {}, wf = clamp01(Number.isFinite(sky.windFrac) ? sky.windFrac : 0.5);
  const clear = clamp01(Number.isFinite(sky.clearness) ? sky.clearness : 1);
  const h = obs.clock ? obs.clock.h : 12;
  let e = -1;
  for (const n of obs.news || []) if (n.kind === 'storm' && n.fromS <= obs.s && (e < 0 || obs.s - n.fromS < e)) e = obs.s - n.fromS;
  let storm = 0;
  if (e >= 0) {
    const env = e <= STORM_HOLD_S ? Math.min(1, 0.3 + 0.7 * e / STORM_IN_S) : Math.max(0, 1 - (e - STORM_HOLD_S) / STORM_OUT_S);
    storm = clamp01(env * (0.6 + 0.4 * wf));
  }
  return {
    heat: !!(obs.demand && obs.demand.heatActive),
    storm,
    cloud: sunAmount(hour(h)) > 0 ? clamp01((0.85 - clear) / 0.5) : 0,
    windy: clamp01((wf - 0.35) / 0.5),
    cutOut: storm > 0.3 && e > STORM_IN_S && wf < 0.35,
  };
}

// ------------------------------------------------------------------ colour helpers

function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(c, f) { const [r, g, b] = hexRgb(c); return 'rgb(' + Math.min(255, r * f | 0) + ',' + Math.min(255, g * f | 0) + ',' + Math.min(255, b * f | 0) + ')'; }
const rgb = c => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')';
const lerp3 = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
/** 21 alpha steps of one colour, so the frame loop never builds a colour string. */
const alphas = (r, g, b, max = 1) => Array.from({length: 21}, (_, i) => 'rgba(' + r + ',' + g + ',' + b + ',' + (max * i / 20).toFixed(3) + ')');
const step = (tbl, a) => tbl[a <= 0 ? 0 : a >= 1 ? 20 : Math.round(a * 20)];

const tones = c => [shade(c, 1.15), shade(c, 0.86), shade(c, 0.66)];
const ROOF = {old: '#b98564', cbd: '#8c9cb0', leafy: '#a3ad8c', estate: '#d2c2a2', flats: '#a58e7e', coast: '#e3e6e8'};
const ROOF_LIT = Object.fromEntries(Object.entries(ROOF).map(([k, c]) => [k, tones(c)]));
const ROOF_DARK = Object.fromEntries(Object.entries(ROOF).map(([k, c]) => [k, [shade(c, 0.40), shade(c, 0.30), shade(c, 0.22)]]));
const BOX_TONE = {hall: tones('#9c9890'), hrsg: tones('#bdb6a8'), shed: tones('#aeb0a6'), white: tones('#e6eaee'), dark: tones('#747a84'), plain: tones('#a9a49a')};
const CONCRETE = '#d3cfc4', CONCRETE_D = '#9d998f', STEEL = '#30363d', WATER = '#3f86c8', WATER_L = '#7fb6e6';
const SMOKE_D = alphas(34, 32, 34, 0.75), SMOKE_L = alphas(236, 238, 240, 0.5), STEAM = alphas(246, 248, 250, 0.6);
const SHEEN = alphas(170, 205, 255), RAIN = alphas(196, 214, 236), SHADOW = alphas(10, 16, 30), SPOT = alphas(4, 6, 12);
const GLOW_RING = alphas(210, 153, 34), FLASH = alphas(235, 240, 255), SHIMMER = alphas(255, 244, 214);
const GLINT = alphas(255, 248, 220); // the sun on a rooftop panel (G-3)
/** The guards whose glow lights a plant (L-9, C-10): a START or a STOP of one of its machines. */
const GUARD_IDS = PLANTS.map(p => p.machines.map(mc => ['guard-start-' + mc.unit, 'guard-stop-' + mc.unit]));

// G-3 light: [hour, sky top, sky at the horizon, ground tint r, g, b, a], linear in between.
const NIGHT = [[10, 14, 36], [26, 34, 70], [8, 12, 34, 0.60]];
const DAY = [[74, 138, 206], [170, 210, 240], [0, 0, 0, 0]];
const LIGHT = [
  [0, ...NIGHT], [5.2, ...NIGHT], [6.2, [60, 80, 138], [244, 176, 146], [84, 56, 84, 0.30]], [7.3, ...DAY], [17.3, ...DAY],
  [18.5, [76, 88, 154], [255, 166, 88], [255, 122, 32, 0.20]], [19.1, [36, 40, 96], [196, 92, 112], [52, 30, 84, 0.42]],
  [19.9, ...NIGHT], [24, ...NIGHT],
];

/** Fill L (top, bot, tint) for hour h; returns the light bucket (constant through day and night). */
function lightAt(h, L) {
  h = hour(h);
  let i = 0;
  while (i < LIGHT.length - 2 && h >= LIGHT[i + 1][0]) i++;
  const a = LIGHT[i], b = LIGHT[i + 1];
  const flat = a[1] === b[1];
  const q = flat ? 0 : Math.round((h - a[0]) / (b[0] - a[0]) * 8);
  const t = q / 8;
  lerp3(a[1], b[1], t, L.top); lerp3(a[2], b[2], t, L.bot); lerp3(a[3], b[3], t, L.tint);
  L.tint[3] = a[3][3] + (b[3][3] - a[3][3]) * t;
  return i * 16 + q;
}

// ------------------------------------------------------------------ drawing primitives (base px)

/** Iso cuboid with (x, y) its front-bottom corner; colours [top, left, right]. */
function cub(g, x, y, w, d, h, c) {
  const rX = x + w, rY = y - w / 2, lX = x - d, lY = y - d / 2, bX = x + w - d, bY = y - (w + d) / 2;
  g.fillStyle = c[1]; g.beginPath(); g.moveTo(x, y); g.lineTo(lX, lY); g.lineTo(lX, lY - h); g.lineTo(x, y - h); g.fill();
  g.fillStyle = c[2]; g.beginPath(); g.moveTo(x, y); g.lineTo(rX, rY); g.lineTo(rX, rY - h); g.lineTo(x, y - h); g.fill();
  g.fillStyle = c[0]; g.beginPath(); g.moveTo(x, y - h); g.lineTo(rX, rY - h); g.lineTo(bX, bY - h); g.lineTo(lX, lY - h); g.fill();
}

/** The ground shadow of a cuboid of height h: its footprint swept along (sx, sy) per unit height. */
function cubShadow(g, x, y, w, d, h, sx, sy) {
  const vx = sx * h, vy = sy * h, rX = x + w, rY = y - w / 2, lX = x - d, lY = y - d / 2;
  g.moveTo(lX, lY); g.lineTo(x, y); g.lineTo(rX, rY); g.lineTo(rX + vx, rY + vy); g.lineTo(x + vx, y + vy); g.lineTo(lX + vx, lY + vy); g.closePath();
}

/** Hyperbolic cooling tower: wide base, a waist at two-thirds, a flared rim with a dark mouth. */
function tower(g, p) {
  const {x, y, r, h} = p, w1 = r * 0.56, w2 = r * 0.72, e = r * 0.35, wy = y - h * 0.62, ty = y - h;
  const side = (s, k) => { g.quadraticCurveTo(x + s * w1 * k * 0.9, wy, x + s * w2 * k, ty); };
  g.fillStyle = CONCRETE_D; // the shaded side, then the lit west flank over it
  g.beginPath(); g.moveTo(x - r, y); side(-1, 1); g.lineTo(x + w2, ty); g.quadraticCurveTo(x + w1 * 0.9, wy, x + r, y); g.quadraticCurveTo(x, y + e * 1.6, x - r, y); g.fill();
  g.fillStyle = CONCRETE;
  g.beginPath(); g.moveTo(x - r, y); side(-1, 1); g.lineTo(x + w2 * 0.2, ty); g.quadraticCurveTo(x + w1 * 0.1, wy, x + r * 0.25, y + e * 0.7); g.quadraticCurveTo(x - r * 0.5, y + e * 0.9, x - r, y); g.fill();
  g.fillStyle = '#4a4742'; g.beginPath(); g.ellipse(x, ty, w2, e * 0.75, 0, 0, TAU); g.fill();
  g.strokeStyle = '#ece8de'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, ty, w2, e * 0.75, 0, Math.PI, TAU); g.stroke();
}

/** Chimney: a thin shaft, shaded on the east side; band: red and white aircraft bands at the top. */
function stack(g, p) {
  g.fillStyle = '#cbc6bb'; g.fillRect(p.x, p.y - p.h, p.w, p.h);
  g.fillStyle = '#8d8980'; g.fillRect(p.x + p.w - 1, p.y - p.h, 1, p.h);
  g.fillStyle = '#3b3a38'; g.fillRect(p.x, p.y - p.h, p.w, 1);
  if (p.band) { g.fillStyle = '#c8453a'; g.fillRect(p.x, p.y - p.h + 2, p.w, 2); g.fillRect(p.x, p.y - p.h + 6, p.w, 2); g.fillStyle = '#f1efe9'; g.fillRect(p.x, p.y - p.h + 4, p.w, 2); }
}

/** Lattice pylon: two legs to a waist, a mast, two cross-arms, X bracing. */
function pylon(g, x, y, h) {
  const b = h * 0.22, a1 = h * 0.3, a2 = h * 0.2, wy = y - h * 0.55;
  g.strokeStyle = STEEL; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x - b, y); g.lineTo(x - 1, wy); g.lineTo(x, y - h); g.lineTo(x + 1, wy); g.lineTo(x + b, y);
  g.moveTo(x - b, y); g.lineTo(x + 1, wy); g.moveTo(x + b, y); g.lineTo(x - 1, wy);
  g.moveTo(x - a1, y - h * 0.66); g.lineTo(x + a1, y - h * 0.66); g.moveTo(x - a2, y - h * 0.84); g.lineTo(x + a2, y - h * 0.84);
  g.stroke();
}

/** A wire between two pylon heads, sagging a little. */
function wire(g, x1, y1, x2, y2, sag) { g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag, x2, y2); }

const PYLON_H = 11, TIE_H = 20, POLE_H = 5;

// ------------------------------------------------------------------ labels and the text alternative

const KEY_ORDER = PLANTS.map(p => p.id).concat(SUBURBS.map(s => 'sub:' + s.id));
/** The ids ←/→ cycle through: the plants, then the suburbs ('sub:<code>'). */
export const mapKeyOrder = () => KEY_ORDER.slice();

/** Labels to draw (pure; tests count them): hover first, then alarms; at most 3 unless hovered extra. */
export function mapLabels(vm, hoverId) {
  const out = [], seen = new Set();
  const add = (id, text, kind) => {
    if (!seen.has(id)) { seen.add(id); out.push({id, text, kind}); return; }
    if (kind === 'alarm') { const l = out.find(q => q.id === id); if (l.kind !== 'alarm') Object.assign(l, {text, kind}); }
  };
  const plantOf = target => PLANTS.find(p => p.target && p.target === target);
  if (hoverId) {
    const p = PLANTS.find(q => q.id === hoverId), sb = SUBURBS.find(q => 'sub:' + q.id === hoverId);
    if (p) add(p.id, p.label, 'hover'); else if (sb) add(hoverId, sb.name.toUpperCase(), 'hover');
  }
  if (vm.hover) { const p = plantOf(vm.hover); if (p) add(p.id, p.label, 'hover'); }
  const obs = vm.obs, alarms = [];
  for (const u of obs.units) if (u.mode === 'tripped') { const p = PLANTS.find(q => q.id === u.station); alarms.push([p.id, u.name.toUpperCase() + ' TRIPPED']); }
  if (obs.tie && obs.tie.tripped) alarms.push(['tie', 'TIE LINE TRIPPED']);
  for (const t of (vm.alarms && vm.alarms.tiles) || []) if (t.state === 'alarm') { const p = plantOf(t.target); if (p) alarms.push([p.id, p.label]); }
  const darkBy = {};
  for (const d of obs.districts || []) if (d.dark) darkBy[d.suburb] = (darkBy[d.suburb] || 0) + 1;
  for (const sb of SUBURBS) if (darkBy[sb.id]) alarms.push(['sub:' + sb.id, sb.name.toUpperCase() + ': ' + darkBy[sb.id] + ' DARK']);
  const cap = Math.max(MAX_REST_LABELS, out.length);
  for (const [id, text] of alarms) { if (out.length >= cap) break; add(id, text, 'alarm'); }
  return out;
}

/**
 * K-23: the map's text alternative (pure): the sky, the weather, what is tripped or dark, and
 * the plant or suburb the keyboard or the pointer is on.
 */
export function mapSummary(vm, hoverId) {
  const obs = vm.obs, wx = weatherOf(obs), parts = [];
  const sky = skyState(obs.clock ? obs.clock.h : 12);
  const w = [wx.storm > 0.3 ? 'storm' : '', wx.heat ? 'heatwave' : '', wx.cloud > 0.3 ? 'cloud front' : ''].filter(Boolean);
  parts.push('City map, ' + sky + (w.length ? ', ' + w.join(', ') : '') + '.');
  const trips = obs.units.filter(u => u.mode === 'tripped').map(u => u.name);
  if (obs.tie && obs.tie.tripped) trips.push('the tie line');
  if (trips.length) parts.push('Tripped: ' + trips.join(', ') + '.');
  const dark = [];
  for (const sb of SUBURBS) { const n = (obs.districts || []).filter(d => d.dark && d.suburb === sb.id).length; if (n) dark.push(sb.name + ' ' + n); }
  if (dark.length) parts.push('Districts dark: ' + dark.join(', ') + '.');
  if (wx.cutOut) parts.push('Wind turbines shut down in the storm.');
  // G-3 (Phase 2a): what the roofs are making, to the nearest 50 MW, and what is off with dark or reconnecting districts
  const roof = obs.rooftop;
  if (roof && roof.capMW > 0) {
    const mw = Math.round(roof.mw / ROOF_SAY_MW) * ROOF_SAY_MW, off = Math.round((roof.offMW || 0) / ROOF_SAY_MW) * ROOF_SAY_MW;
    if (mw > 0 || off > 0) parts.push('Rooftop solar about ' + fmtMW(mw) + ' MW' + (off > 0 ? ', ' + fmtMW(off) + ' MW off with dark districts' : '') + '.');
  }
  const p = PLANTS.find(q => q.id === hoverId), sb = SUBURBS.find(q => 'sub:' + q.id === hoverId);
  if (p) {
    const us = obs.units.filter(u => u.station === p.id), on = us.filter(u => u.sync).length;
    parts.push('On ' + p.label + (us.length ? ': ' + on + ' of ' + us.length + ' machines on' : '') + '.');
  } else if (sb) parts.push('On ' + sb.name + '.');
  else parts.push('Left and right arrows step through the plants and suburbs.');
  return parts.join(' ');
}

// ------------------------------------------------------------------ the map

/**
 * @param {Document} doc
 * @param {Element} root the map box (#map)
 * @param {{ui: function}} actions desk/README §4
 * @returns {{update: function(object): void, key: function(object): boolean, el: Element, debug: object}}
 */
export function createMap(doc, root, actions) {
  const el = doc.createElement('div');
  el.className = 'citymap';
  el.setAttribute('role', 'application');
  el.setAttribute('aria-roledescription', 'map');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home Escape');
  el.setAttribute('aria-label', 'Map of the city and its power stations');
  el.style.position = 'relative'; el.style.width = '100%'; el.style.height = '100%'; el.style.overflow = 'hidden';
  const cv = doc.createElement('canvas');
  cv.className = 'citymap-canvas';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%';
  el.appendChild(cv);
  root.appendChild(el);
  const layer = h => { const c = doc.createElement('canvas'); c.width = BASE_W; c.height = h; return c; };
  const frame = layer(BASE_H), skyL = layer(HORIZON_Y + 2), terrL = layer(BASE_H), cityL = layer(BASE_H), cloudA = layer(HORIZON_Y + 2), cloudB = layer(HORIZON_Y + 2);
  const g = frame.getContext('2d');

  let vm = null, blocks = null, cityList = [], unitIdx = null, layout = null, hoverId = null, sentTarget = null, kbdIdx = -1, byKey = false, focused = false;
  let lastMs = 0, drawMs = 0, labels = [], labelsAt = -1e9, labelsKey = '', ariaAt = -1e9, ariaText = '';
  let lightKey = '', cityKey = '', watchSinceMs = -1, watchEndMs = -1e9, spotX = 0, spotY = 0, boltUntil = 0, boltNext = 0, boltX = 0;
  let skyCss = '#6a9fd0', groundCss = '#3f6b3a', hasClouds = false;
  const L = {top: [0, 0, 0], bot: [0, 0, 0], tint: [0, 0, 0, 0]};
  const darkState = new Map();   // district id -> {dark, sinceMs, off}
  const rotor = new Map();       // machine id / 'wT<i>' -> {a, v}
  // particles (smoke, steam): a fixed pool, no allocation per frame
  const NP = 180, pX = new Float32Array(NP), pY = new Float32Array(NP), pVX = new Float32Array(NP), pVY = new Float32Array(NP), pLife = new Float32Array(NP), pKind = new Uint8Array(NP);
  let pNext = 0;
  // rain seeds, cloud-shadow seeds, shimmer seeds (layout only)
  const NR = 150, rSeed = new Float32Array(NR * 2);
  for (let i = 0; i < NR * 2; i++) rSeed[i] = hash01('rain', i);
  const SHADOWS = [0, 1, 2, 3, 4, 5, 6].map(i => ({x: i * 114 + hash01('cs', i) * 60, y: 74 + (i * 37) % 92 + hash01('cs', i + 9) * 8, rx: 46 + hash01('cs', i + 20) * 26, ry: 10 + hash01('cs', i + 30) * 5}));
  const fx = {sky: 'day', heat: false, storm: 0, cloud: 0, rain: 0, sheets: 0, bolt: false, shadows: 0, shadowX: 0, clouds: 0, haze: false, shimmer: 0,
    feathered: false, sunUp: false, sunX: 0, sunY: 0, spot: 0, spotX: 0, spotY: 0, hatch: 0, cross: 0, strobe: false, strobeMs: STROBE_MS, phase: 0, battery: '', rings: 0, glint: 0};
  // rooftop PV (G-3, Phase 2a): each suburb's panels as typed arrays, laid out when the
  // capacities or the district list change (syncRoof); alpha / on: this frame's glint per suburb
  const NSUB = SUBURBS.length;
  const roof = {key: -1, blocks: null, n: 0, idx: new Int16Array(NSUB).fill(-1), alpha: new Float32Array(NSUB), on: new Uint16Array(NSUB), conn: new Float32Array(0),
    subs: SUBURBS.map(() => ({n: 0, x: new Int16Array(0), y: new Int16Array(0), w: new Uint8Array(0), ph: new Float32Array(0), blk: new Uint16Array(0)}))};
  const debug = {districts: {}, scale: 0, layout: null, draws: 0, fx, rebuilds: {sky: 0, terrain: 0, city: 0, roof: 0}};

  const parts = []; // every plant part, back to front
  for (const [id, ps] of Object.entries(PLANT_PARTS)) ps.forEach((p, i) => parts.push({id, p, i, y: p.y2 === undefined ? p.y : Math.max(p.y, p.y2)}));
  parts.sort((a, b) => a.y - b.y || a.i - b.i);
  const stackTops = [];
  for (const q of parts) if (q.p.k === 'stack' && q.p.band) stackTops.push(q.p.x + 1, q.p.y - q.p.h - 1);
  const towers = PLANT_PARTS.coal.filter(p => p.k === 'tower');
  const tiePylons = PLANT_PARTS.tie.filter(p => p.k === 'pylon');

  // ------------------------------------------------------------ cached layers

  function poly(G, pts) { G.beginPath(); for (let i = 0; i < pts.length; i++) G[i ? 'lineTo' : 'moveTo'](pts[i][0], pts[i][1]); G.closePath(); }

  /** Grade a layer with the light and the weather: paints only where the layer already has pixels. */
  function grade(G, wx) {
    G.globalCompositeOperation = 'source-atop';
    if (L.tint[3] > 0.005) { G.fillStyle = rgba(L.tint, L.tint[3]); G.fillRect(0, 0, BASE_W, BASE_H); }
    if (wx.heat) { G.fillStyle = 'rgba(255,232,176,0.20)'; G.fillRect(0, 0, BASE_W, BASE_H); }       // bleached and warm
    if (wx.stormB) { G.fillStyle = 'rgba(14,22,38,' + (0.11 * wx.stormB).toFixed(2) + ')'; G.fillRect(0, 0, BASE_W, BASE_H); } // darker ground
    else if (wx.cloudB) { G.fillStyle = 'rgba(40,50,64,' + (0.04 * wx.cloudB).toFixed(2) + ')'; G.fillRect(0, 0, BASE_W, BASE_H); }
    G.globalCompositeOperation = 'source-over';
  }

  function drawSky(wx) {
    const G = skyL.getContext('2d'), top = L.top.slice(), bot = L.bot.slice();
    const grey = [70, 80, 96], pale = [226, 214, 186], overcast = [168, 178, 190];
    if (wx.stormB) { lerp3(top, [38, 44, 58], 0.22 * wx.stormB, top); lerp3(bot, grey, 0.2 * wx.stormB, bot); }
    else if (wx.cloudB) { lerp3(top, overcast, 0.14 * wx.cloudB, top); lerp3(bot, overcast, 0.16 * wx.cloudB, bot); }
    if (wx.heat) { lerp3(top, pale, 0.25, top); lerp3(bot, pale, 0.55, bot); }
    const gr = G.createLinearGradient(0, 0, 0, HORIZON_Y);
    gr.addColorStop(0, rgb(top)); gr.addColorStop(0.7, rgb(lerp3(top, bot, 0.6, [0, 0, 0]))); gr.addColorStop(1, rgb(bot));
    G.fillStyle = gr; G.fillRect(0, 0, BASE_W, HORIZON_Y + 2);
    const night = L.tint[3] / 0.6;
    if (night > 0.5 && !wx.stormB) { // stars and the moon
      G.fillStyle = 'rgba(240,244,255,' + (0.9 * (night - 0.5) * 2).toFixed(2) + ')';
      for (let i = 0; i < 46; i++) G.fillRect(Math.floor(hash01('star', i) * BASE_W), Math.floor(hash01('star', i + 99) * (HORIZON_Y - 6)), 1, 1);
      G.beginPath(); G.arc(468, 47, 3, 0, TAU); G.fill();
      G.fillStyle = rgb(lerp3(top, bot, 0.8, [0, 0, 0])); G.beginPath(); G.arc(466.5, 46.2, 2.6, 0, TAU); G.fill();
    }
    skyCss = rgb(top);
    debug.rebuilds.sky++;
  }

  /** One pixel-art cloud: three lobes on a flat base, a lit top. */
  function puff(G, x, y, w, body, lit, under) {
    const h = w * 0.3;
    G.fillStyle = under; G.beginPath(); G.ellipse(x, y, w * 0.5, h * 0.55, 0, 0, TAU); G.fill();
    G.fillStyle = body; G.beginPath();
    G.ellipse(x - w * 0.24, y - h * 0.25, w * 0.26, h * 0.55, 0, 0, TAU); G.ellipse(x + w * 0.02, y - h * 0.5, w * 0.3, h * 0.75, 0, 0, TAU); G.ellipse(x + w * 0.27, y - h * 0.2, w * 0.24, h * 0.5, 0, 0, TAU);
    G.fill();
    G.fillStyle = lit; G.beginPath(); G.ellipse(x - w * 0.02, y - h * 0.8, w * 0.2, h * 0.3, 0, 0, TAU); G.fill();
  }

  function drawClouds(wx) {
    const A = cloudA.getContext('2d'), B = cloudB.getContext('2d');
    A.clearRect(0, 0, BASE_W, HORIZON_Y + 2); B.clearRect(0, 0, BASE_W, HORIZON_Y + 2);
    fx.clouds = 0;
    if (wx.stormB) {
      // back layer: a ceiling with a scalloped base; front layer: darker, lower, ragged
      const d = 0.55 + 0.1 * wx.stormB;
      A.fillStyle = 'rgba(58,66,82,' + d.toFixed(2) + ')'; A.fillRect(0, 0, BASE_W, 40);
      for (let x = -10; x < BASE_W + 20; x += 22) { puff(A, x + hash01('sa', x) * 10, 44 + hash01('sb', x) * 4, 40, 'rgb(64,72,90)', 'rgb(92,102,122)', 'rgb(44,50,64)'); fx.clouds++; }
      for (let i = 0; i < 6 + 2 * wx.stormB; i++) { puff(B, hash01('sc', i) * BASE_W, 30 + hash01('sd', i) * 22, 46 + hash01('se', i) * 30, 'rgb(40,46,60)', 'rgb(66,74,92)', 'rgb(26,30,42)'); fx.clouds++; }
    } else {
      const n = wx.cloudB ? 5 + 4 * wx.cloudB : 3, grey = wx.cloudB >= 2;
      for (let i = 0; i < n; i++) {
        const low = i % 2 === 0; // every other cloud sits in the strip the floor layout shows
        puff(i % 3 ? A : B, hash01('ca', i) * BASE_W, low ? 46 + hash01('cb', i) * 6 : 10 + hash01('cb', i) * 28, (wx.cloudB ? 34 : 22) + hash01('cc', i) * 22,
          grey ? 'rgb(206,210,216)' : 'rgb(244,246,248)', 'rgb(255,255,255)', grey ? 'rgb(150,158,170)' : 'rgb(206,214,226)');
        fx.clouds++;
      }
    }
    for (const C of [A, B]) { // clouds take the light too (dusk, night)
      C.globalCompositeOperation = 'source-atop';
      if (L.tint[3] > 0.005) { C.fillStyle = rgba(L.tint, Math.min(0.8, L.tint[3] * 1.2)); C.fillRect(0, 0, BASE_W, HORIZON_Y + 2); }
      C.globalCompositeOperation = 'source-over';
    }
    hasClouds = fx.clouds > 0;
  }

  function hills(G, seed, amp, base, col) {
    G.fillStyle = col; G.beginPath(); G.moveTo(0, HORIZON_Y + 1);
    for (let x = 0; x <= BASE_W; x += 8) {
      const k = Math.floor(x / 32), f = (x % 32) / 32;
      const a = hash01(seed, k), b = hash01(seed, k + 1);
      G.lineTo(x, HORIZON_Y - base - amp * (a + (b - a) * f));
    }
    G.lineTo(BASE_W, HORIZON_Y + 1); G.closePath(); G.fill();
  }

  function drawPart(G, id, p) {
    switch (p.k) {
      case 'box': {
        cub(G, p.x, p.y, p.w, p.d, p.h, BOX_TONE[p.c] || BOX_TONE.plain);
        const col = COLOURS[id];
        if (col && p.c !== 'white' && p.h >= 4) { // a band in the plant's colour: the map matches its layer and its lever (L-3)
          G.fillStyle = col; G.beginPath(); G.moveTo(p.x, p.y - p.h + 1); G.lineTo(p.x + p.w, p.y - p.w / 2 - p.h + 1); G.lineTo(p.x + p.w, p.y - p.w / 2 - p.h + 3); G.lineTo(p.x, p.y - p.h + 3); G.fill();
        }
        if (p.c === 'hall') { // window slits and roof vents
          G.fillStyle = 'rgba(30,36,46,0.55)';
          for (let i = 3; i < p.w - 2; i += 5) G.fillRect(p.x + i, p.y - i / 2 - 7, 2, 4);
          G.fillStyle = shade('#9c9890', 0.7);
          for (let i = 0; i < 4; i++) G.fillRect(p.x - p.d / 2 + 3 + i * 7, p.y - p.d / 4 - p.h - 3 - i * 3.5, 3, 2);
        } else if (p.c === 'hrsg') { // the ribbed casing
          G.strokeStyle = 'rgba(40,36,30,0.28)'; G.lineWidth = 1; G.beginPath();
          for (let i = 2; i < p.w; i += 3) { G.moveTo(p.x + i + 0.5, p.y - i / 2 - 1); G.lineTo(p.x + i + 0.5, p.y - i / 2 - p.h + 3); }
          G.stroke();
        } else if (p.c === 'shed') { G.fillStyle = 'rgba(30,36,46,0.5)'; G.fillRect(p.x - p.d + 2, p.y - p.d / 2 - 3, 3, 3); } // the intake
        else if (p.c === 'white') { G.fillStyle = 'rgba(60,70,84,0.5)'; G.fillRect(p.x + 2, p.y - 3, 1, 2); G.fillRect(p.x + 5, p.y - 4.5, 1, 2); } // doors
        break;
      }
      case 'tower': tower(G, p); break;
      case 'stack': stack(G, p); break;
      case 'pile':
        G.fillStyle = '#242326'; G.beginPath(); G.moveTo(p.x - p.w / 2, p.y); G.lineTo(p.x - p.w * 0.16, p.y - p.h); G.lineTo(p.x + p.w * 0.1, p.y - p.h * 0.8); G.lineTo(p.x + p.w / 2, p.y);
        G.quadraticCurveTo(p.x, p.y + 4, p.x - p.w / 2, p.y); G.fill();
        G.fillStyle = '#47454c'; G.beginPath(); G.moveTo(p.x - p.w / 2 + 2, p.y - 1); G.lineTo(p.x - p.w * 0.16, p.y - p.h); G.lineTo(p.x - p.w * 0.1, p.y - p.h * 0.4); G.fill();
        break;
      case 'belt':
        G.strokeStyle = '#565b63'; G.lineWidth = 2; G.beginPath(); G.moveTo(p.x, p.y); G.lineTo(p.x2, p.y2); G.stroke();
        G.fillStyle = '#3b3f45'; G.fillRect((p.x + p.x2) / 2, (p.y + p.y2) / 2, 1, 6); G.fillRect(p.x + 3, p.y - 1, 1, 4);
        break;
      case 'dam': {
        const {x, y, w, h} = p, crest = () => { G.moveTo(x, y); G.quadraticCurveTo(x + w / 2, y - 6, x + w, y); };
        G.fillStyle = CONCRETE; G.beginPath(); crest(); G.lineTo(x + w - 8, y + h); G.quadraticCurveTo(x + w / 2, y + h - 4, x + 8, y + h); G.closePath(); G.fill();
        G.fillStyle = 'rgba(40,36,30,0.16)'; G.beginPath(); G.moveTo(x + 4, y + h * 0.5); G.quadraticCurveTo(x + w / 2, y + h * 0.5 - 5, x + w - 4, y + h * 0.5); G.lineTo(x + w - 8, y + h); G.quadraticCurveTo(x + w / 2, y + h - 4, x + 8, y + h); G.closePath(); G.fill();
        G.strokeStyle = 'rgba(40,36,30,0.22)'; G.lineWidth = 1; G.beginPath();
        for (let i = 6; i < w - 4; i += 6) { const cy = y - 6 * (1 - Math.pow((i - w / 2) / (w / 2), 2)) * 0.5; G.moveTo(x + i + 0.5, cy + 2); G.lineTo(x + i + 0.5 + (i < w / 2 ? 1 : -1) * 1.5, y + h - 3); }
        G.stroke();
        G.strokeStyle = '#f2eee4'; G.lineWidth = 2; G.beginPath(); crest(); G.stroke();
        break;
      }
      case 'spill':
        G.fillStyle = WATER; G.beginPath(); G.ellipse(p.x + p.w / 2, p.y + p.h + 1, p.w * 0.9, 3, 0, 0, TAU); G.fill();
        G.fillStyle = '#e9f4ff'; G.fillRect(p.x, p.y - 3, p.w, p.h + 2);
        G.fillStyle = WATER_L; for (let i = 1; i < p.w; i += 2) G.fillRect(p.x + i, p.y - 2, 1, p.h);
        G.fillStyle = '#ffffff'; G.beginPath(); G.ellipse(p.x + p.w / 2, p.y + p.h, p.w * 0.7, 2, 0, 0, TAU); G.fill();
        break;
      case 'pipe':
        G.strokeStyle = '#6f6b63'; G.lineWidth = 2; G.beginPath(); G.moveTo(p.x, p.y + 1); G.lineTo(p.x2, p.y2 + 1); G.stroke();
        G.strokeStyle = '#e4e0d6'; G.lineWidth = 1; G.beginPath(); G.moveTo(p.x, p.y); G.lineTo(p.x2, p.y2); G.stroke();
        break;
      case 'pylon': pylon(G, p.x, p.y, p.h); break;
    }
  }

  function partShadow(G, p, sx, sy) {
    if (p.k === 'box') cubShadow(G, p.x, p.y, p.w, p.d, p.h, sx, sy);
    else if (p.k === 'tower') { G.moveTo(p.x - p.r, p.y); G.lineTo(p.x + p.r, p.y); G.lineTo(p.x + p.r * 0.7 + sx * p.h, p.y + sy * p.h); G.lineTo(p.x - p.r * 0.7 + sx * p.h, p.y + sy * p.h); G.closePath(); }
    else if (p.k === 'stack') { G.moveTo(p.x, p.y); G.lineTo(p.x + p.w, p.y); G.lineTo(p.x + p.w + sx * p.h, p.y + sy * p.h); G.lineTo(p.x + sx * p.h, p.y + sy * p.h); G.closePath(); }
  }

  function drawTerrain(wx, sh) {
    const G = terrL.getContext('2d');
    G.globalCompositeOperation = 'source-over';
    G.clearRect(0, 0, BASE_W, BASE_H);
    // two distant ranges break the horizon, then the ground to every edge
    hills(G, 'far', 6, 1, '#7d97b4'); hills(G, 'near', 3, 0, '#5d8660');
    const gr = G.createLinearGradient(0, HORIZON_Y, 0, BASE_H);
    gr.addColorStop(0, '#6a965a'); gr.addColorStop(0.35, '#4c7d44'); gr.addColorStop(1, '#3c6a38');
    G.fillStyle = gr; G.fillRect(0, HORIZON_Y, BASE_W, BASE_H - HORIZON_Y);
    // grass texture
    for (let i = 0; i < 520; i++) {
      G.fillStyle = i % 3 ? 'rgba(20,50,20,0.10)' : 'rgba(230,240,180,0.07)';
      G.fillRect(Math.floor(hash01('gx', i) * BASE_W), HORIZON_Y + 2 + Math.floor(hash01('gy', i) * (BASE_H - HORIZON_Y - 2)), 2, 1);
    }
    // farm fields with furrows
    for (const [x, y, w, d, col] of FIELDS) {
      G.fillStyle = col; G.beginPath(); G.moveTo(x, y); G.lineTo(x + w, y - w / 2); G.lineTo(x + w - d, y - (w + d) / 2); G.lineTo(x - d, y - d / 2); G.fill();
      G.strokeStyle = 'rgba(40,30,10,0.16)'; G.lineWidth = 1; G.beginPath();
      for (let k = 3; k < d; k += 3) { G.moveTo(x - k, y - k / 2); G.lineTo(x + w - k, y - (w + k) / 2); }
      G.stroke();
    }
    // the ridge: a lighter plateau with a shaded scarp under its southern edge
    G.fillStyle = '#39593a'; G.beginPath(); RIDGE.forEach(([x, y], i) => G[i ? 'lineTo' : 'moveTo'](x, y + (y > 100 ? 5 : 0))); G.closePath(); G.fill();
    G.fillStyle = '#75a062'; poly(G, RIDGE); G.fill();
    for (let i = 0; i < 90; i++) { G.fillStyle = 'rgba(24,56,24,0.10)'; G.fillRect(500 + Math.floor(hash01('rx', i) * 138), 62 + Math.floor(hash01('ry', i) * 58), 2, 1); }
    // water: the lake, the river from the spillway, the bay
    G.fillStyle = WATER; poly(G, LAKE); G.fill();
    G.strokeStyle = 'rgba(200,230,255,0.45)'; G.lineWidth = 1; poly(G, LAKE); G.stroke();
    G.fillStyle = 'rgba(220,240,255,0.5)';
    for (let i = 0; i < 9; i++) G.fillRect(520 + Math.floor(hash01('lk', i) * 54), 68 + Math.floor(hash01('lk', i + 20) * 14), 3, 1);
    G.strokeStyle = WATER; G.lineWidth = 3; G.lineJoin = 'round';
    G.beginPath(); RIVER.forEach(([x, y], i) => G[i ? 'lineTo' : 'moveTo'](x, y)); G.stroke();
    G.strokeStyle = 'rgba(200,230,255,0.35)'; G.lineWidth = 1; G.beginPath(); RIVER.forEach(([x, y], i) => G[i ? 'lineTo' : 'moveTo'](x, y)); G.stroke();
    G.fillStyle = '#dccf9c'; G.beginPath(); BAY.forEach(([x, y], i) => G[i ? 'lineTo' : 'moveTo'](x, y - 2)); G.closePath(); G.fill(); // the beach
    G.fillStyle = WATER; poly(G, BAY); G.fill();
    G.fillStyle = 'rgba(220,240,255,0.5)';
    for (let i = 0; i < 8; i++) G.fillRect(430 + Math.floor(hash01('by', i) * 60), 164 + Math.floor(hash01('by', i + 20) * 10), 3, 1);
    G.fillStyle = '#7a644a'; G.fillRect(452, 158, 1, 8); G.fillRect(450, 165, 5, 1); // the jetty
    // the city's ground and streets, the roads
    for (const sb of SUBURBS) { const [x, y, w, h] = sb.box; G.fillStyle = 'rgba(128,132,122,0.55)'; G.fillRect(x - 2, y - 2, w + 4, h + 4); }
    G.fillStyle = 'rgba(206,204,192,0.55)';
    for (const b of blocks || []) { const [x, y, w, h] = b.cell; G.fillRect(Math.round(x), Math.round(y), Math.round(w), 1); G.fillRect(Math.round(x), Math.round(y), 1, Math.round(h)); }
    G.strokeStyle = '#8e897c'; G.lineWidth = 2; G.beginPath();
    for (const [x1, y1, x2, y2] of ROADS) { G.moveTo(x1, y1); G.lineTo(x2, y2); }
    G.stroke();
    // trees
    for (const [zx, zy, zw, zh, n] of TREES) for (let i = 0; i < n; i++) {
      const x = Math.floor(zx + hash01('tx' + zx + zy, i) * zw), y = Math.floor(zy + hash01('ty' + zx + zy, i) * zh);
      G.fillStyle = 'rgba(10,30,14,0.3)'; G.fillRect(x, y + 1, 3, 1);
      G.fillStyle = '#2c5a30'; G.fillRect(x - 1, y - 2, 3, 3);
      G.fillStyle = '#4c8a48'; G.fillRect(x - 1, y - 2, 2, 1);
    }
    // the solar farm's pad
    const r0 = SOLAR_ROWS[0], rN = SOLAR_ROWS[SOLAR_ROWS.length - 1], W = SOLAR_ROW_W;
    G.fillStyle = '#9aa06c'; G.beginPath(); G.moveTo(r0[0] - 4, r0[1] - 1); G.lineTo(r0[0] + W, r0[1] - W / 2 - 5); G.lineTo(rN[0] + W + 4, rN[1] - W / 2 - 1); G.lineTo(rN[0], rN[1] + 3); G.fill();
    // ground shadows (long and warm-side at sunset, G-3)
    if (sh.a > 0.01) {
      G.fillStyle = step(SHADOW, sh.a); G.beginPath();
      for (const q of parts) partShadow(G, q.p, sh.x, sh.y);
      for (const [x, y] of WIND_TURBINES) { G.moveTo(x, y); G.lineTo(x + 1, y); G.lineTo(x + 1 + sh.x * TURBINE_H, y + sh.y * TURBINE_H); G.lineTo(x + sh.x * TURBINE_H, y + sh.y * TURBINE_H); G.closePath(); }
      G.fill();
    }
    // substations: a yard, a control hut, a gantry
    for (const [x, y] of SUBSTATIONS) {
      G.fillStyle = '#8b8f8a'; G.beginPath(); G.moveTo(x - 7, y + 1); G.lineTo(x + 1, y + 5); G.lineTo(x + 9, y + 1); G.lineTo(x + 1, y - 3); G.fill();
      cub(G, x + 4, y + 3, 4, 3, 3, BOX_TONE.dark);
      G.fillStyle = STEEL; G.fillRect(x - 4, y - 5, 1, 6); G.fillRect(x + 1, y - 5, 1, 6); G.fillRect(x - 4, y - 5, 6, 1);
    }
    // wires: trunks on medium pylons, a spur from each plant, the tie on tall pylons off the west edge
    G.strokeStyle = 'rgba(22,26,32,0.72)'; G.lineWidth = 1; G.beginPath();
    for (const T of TRUNKS) for (let i = 0; i < T.length - 1; i++) {
      const hb = i + 1 === T.length - 1 ? 5 : PYLON_H * 0.84;
      wire(G, T[i][0] - 2, T[i][1] - PYLON_H * 0.84, T[i + 1][0] - 2, T[i + 1][1] - hb, 1.5);
      wire(G, T[i][0] + 2, T[i][1] - PYLON_H * 0.66, T[i + 1][0] + 2, T[i + 1][1] - hb, 1.5);
    }
    for (const p of PLANTS) {
      if (p.toEdge) {
        for (let i = 0; i < p.line.length - 1; i++) {
          const a = p.line[i], b = p.line[i + 1], ha = TIE_H, hb = i + 1 === p.line.length - 1 ? PYLON_H : TIE_H;
          wire(G, a[0] - (i ? 4 : 0), a[1] - ha * 0.84, b[0] - 4, b[1] - hb * 0.84, 2.5);
          wire(G, a[0] + (i ? 6 : 0), a[1] - ha * 0.66, b[0] + 6, b[1] - hb * 0.66, 2.5);
        }
      } else wire(G, p.line[0][0], p.line[0][1] - POLE_H, p.line[1][0], p.line[1][1] - PYLON_H * 0.75, 1);
    }
    G.stroke();
    G.fillStyle = STEEL;
    for (const p of PLANTS) if (!p.toEdge) G.fillRect(p.line[0][0], p.line[0][1] - POLE_H, 1, POLE_H);
    for (const T of TRUNKS) for (let i = 0; i < T.length - 1; i++) pylon(G, T[i][0], T[i][1], PYLON_H);
    // the plants, back to front, with the solar rows and the turbine masts
    for (const q of parts) drawPart(G, q.id, q.p);
    for (const [x, y] of SOLAR_ROWS) {
      G.fillStyle = '#22386a'; G.beginPath(); G.moveTo(x, y); G.lineTo(x + W, y - W / 2); G.lineTo(x + W, y - W / 2 - 3); G.lineTo(x, y - 3); G.fill();
      G.strokeStyle = '#86aee6'; G.lineWidth = 1; G.beginPath(); G.moveTo(x, y - 3); G.lineTo(x + W, y - W / 2 - 3); G.stroke();
      G.fillStyle = '#16264a'; for (let k = 6; k < W; k += 6) G.fillRect(x + k, y - k / 2 - 3, 1, 3);
    }
    for (const [x, y] of WIND_TURBINES) { G.fillStyle = '#f0f3f6'; G.fillRect(x, y - TURBINE_H, 1, TURBINE_H); G.fillRect(x - 1, y - 2, 3, 2); G.fillStyle = '#b9c0c8'; G.fillRect(x + 1, y - TURBINE_H, 1, TURBINE_H - 2); }
    grade(G, wx);
    // heat: a haze band lying on the horizon (over the far ground and the foot of the sky)
    fx.haze = wx.heat;
    if (wx.heat) {
      const hz = G.createLinearGradient(0, HORIZON_Y - 10, 0, HORIZON_Y + 30);
      hz.addColorStop(0, 'rgba(255,240,205,0)'); hz.addColorStop(0.3, 'rgba(255,240,205,0.62)'); hz.addColorStop(1, 'rgba(255,240,205,0)');
      G.fillStyle = hz; G.fillRect(0, HORIZON_Y - 10, BASE_W, 40);
    }
    // night: yard lights at the plants
    if (L.tint[3] > 0.3) {
      G.fillStyle = 'rgba(255,196,110,0.9)';
      for (const p of PLANTS) for (const mc of p.machines) G.fillRect(mc.x - 3, mc.y + 2, 1, 1);
      for (const [x, y] of SUBSTATIONS) G.fillRect(x - 1, y - 1, 1, 1);
      for (const q of parts) if (q.p.k === 'box' && q.p.c === 'white') G.fillRect(q.p.x + 3, q.p.y - 2, 1, 1);
    }
    const gcol = [76, 125, 68], t = L.tint;
    lerp3(gcol, t, t[3], gcol);
    if (wx.heat) lerp3(gcol, [255, 232, 176], 0.2, gcol);
    if (wx.stormB) lerp3(gcol, [14, 22, 38], 0.11 * wx.stormB, gcol);
    groundCss = rgb(gcol);
    debug.rebuilds.terrain++;
  }

  /** The city: every building back to front, dark blocks unlit; lit windows at night. */
  function drawCity(wx, sh, lit, night) {
    const G = cityL.getContext('2d');
    G.globalCompositeOperation = 'source-over';
    G.clearRect(0, 0, BASE_W, BASE_H);
    if (sh.a > 0.01) {
      G.fillStyle = step(SHADOW, sh.a); G.beginPath();
      for (const c of cityList) cubShadow(G, c.b.x, c.b.y, c.b.w, c.b.d, c.b.h, sh.x, sh.y);
      G.fill();
    }
    for (const c of cityList) {
      const b = c.b, off = c.st.dark ? c.i < c.st.k : c.i >= c.st.k;
      cub(G, b.x, b.y, b.w, b.d, b.h, off ? ROOF_DARK[c.style] : ROOF_LIT[c.style]);
      if (off) continue;
      if (b.h >= 8) { // glass bands on the towers
        G.strokeStyle = 'rgba(24,36,60,0.30)'; G.lineWidth = 1; G.beginPath();
        for (let k = 3; k < b.h; k += 3) { G.moveTo(b.x - b.d, b.y - b.d / 2 - k); G.lineTo(b.x, b.y - k); G.lineTo(b.x + b.w, b.y - b.w / 2 - k); }
        G.stroke();
      } else if (c.style === 'old') { G.fillStyle = '#6e4a38'; G.fillRect(b.x + 1, b.y - b.h - 4, 1, 2); }  // chimney pots
      // rooftop PV: this roof's share of its suburb's panels (G-3; none on a scenario without rooftop)
      if (c.pv) { G.fillStyle = ROOF_PV.colour; for (const q of c.pv) G.fillRect(q.x, q.y, q.w, 1); }
    }
    grade(G, wx);
    for (const blk of blocks) debug.districts[blk.id].windows = 0;
    if (night > 0.05) {
      G.fillStyle = 'rgba(255,214,120,' + (0.6 + 0.4 * night).toFixed(2) + ')';
      for (const c of cityList) {
        const b = c.b, off = c.st.dark ? c.i < c.st.k : c.i >= c.st.k;
        if (off) continue;
        let n = 0;
        for (let wv = 0; wv < b.win; wv++) {
          for (let wx2 = 0; wx2 * 2 + 1 < b.d; wx2++) if (hash01(c.id, c.i * 31 + wv * 5 + wx2) <= lit) { G.fillRect(b.x - 2 - wx2 * 2, Math.floor(b.y - 2 - wv * 3 - wx2 - 1), 1, 1); n++; }
          for (let wx2 = 0; wx2 * 2 + 1 < b.w; wx2++) if (hash01(c.id, c.i * 37 + wv * 7 + wx2 + 50) <= lit) { G.fillRect(b.x + 1 + wx2 * 2, Math.floor(b.y - 2 - wv * 3 - wx2 - 1), 1, 1); n++; }
        }
        debug.districts[c.id].windows += n;
      }
    }
    debug.rebuilds.city++;
  }

  // ------------------------------------------------------------ per-frame state

  /** Rebuild the block layout when the district list changes (ids or suburbs); no allocation otherwise. */
  function syncBlocks(obs) {
    const ds = obs.districts;
    let same = blocks !== null && blocks.n === ds.length;
    if (same) for (const blk of blocks) { const d = ds[blk.di]; if (!d || d.id !== blk.id || d.suburb !== blk.suburb) { same = false; break; } }
    if (same) return;
    blocks = districtBlocks(ds);
    blocks.n = ds.length;
    cityList = [];
    debug.districts = {};
    for (const blk of blocks) {
      blk.di = ds.findIndex(d => d.id === blk.id);
      let st = darkState.get(blk.id);
      if (!st) { st = {dark: !!ds[blk.di].dark, sinceMs: -1e9, k: blk.buildings.length}; darkState.set(blk.id, st); }
      blk.st = st;
      debug.districts[blk.id] = {dark: st.dark, darkBlocks: 0, windows: 0, blocks: blk.buildings.length, roof: ''};
      blk.buildings.forEach((b, i) => cityList.push({b, i, id: blk.id, style: blk.style, st}));
    }
    cityList.sort((a, c) => backToFront(a.b, c.b));   // mapdata.roofPanels places the panels by the same order
    lightKey = ''; cityKey = '';
  }

  /**
   * Lay the rooftop panels out (G-3) when the suburbs' rooftop capacity or the block layout
   * changes: a new scenario or a new district list, never during a day. No allocation otherwise.
   */
  function syncRoof(obs) {
    const rs = obs.rooftop && obs.rooftop.suburbs;
    let key = 0;
    if (rs) for (let j = 0; j < rs.length; j++) key += (j + 1) * Math.round(rs[j].capMW > 0 ? rs[j].capMW : 0);
    if (key === roof.key && roof.blocks === blocks) {
      if (!key) return;
      let same = true;
      for (let j = 0; j < NSUB && same; j++) { const r = rs[roof.idx[j]]; same = roof.idx[j] < 0 ? true : !!r && r.id === SUBURBS[j].id; }
      if (same) return;
    }
    roof.key = key; roof.blocks = blocks;
    const cap = {};
    if (rs) for (const r of rs) cap[r.id] = r.capMW;
    const panels = roofPanels(blocks, cap);
    for (const c of cityList) c.pv = null;
    const at = new Map(cityList.map(c => [c.id + ':' + c.i, c]));
    roof.n = panels.length;
    roof.conn = new Float32Array(obs.districts.length);
    SUBURBS.forEach((sb, j) => {
      const mine = panels.filter(q => q.suburb === sb.id), sub = roof.subs[j];
      roof.idx[j] = rs ? rs.findIndex(r => r.id === sb.id) : -1;
      sub.n = mine.length;
      sub.x = Int16Array.from(mine, q => q.x); sub.y = Int16Array.from(mine, q => q.y); sub.w = Uint8Array.from(mine, q => q.w);
      sub.ph = Float32Array.from(mine, q => q.ph); sub.blk = Uint16Array.from(mine, q => q.blk);
      for (const q of mine) { const c = at.get(q.id + ':' + q.b); (c.pv ||= []).push(q); }
    });
    cityKey = '';
    debug.rebuilds.roof++;
  }

  /**
   * G-3: the rooftop glint. Per suburb, ONE path of the panels that catch the sun this frame and
   * ONE fill, at an alpha of the suburb's output over its capacity (obs.rooftop.suburbs[]: mw is
   * as if every inverter were connected, so cloud dims it) graded by the light. A panel catches
   * the sun for glintDuty of every 1 / glintHz s, in its own phase. Connection is per district:
   * a dark district's panels never glint; a relit one's wait until its inverters start back
   * (districts[].reconnectS), then a share of them that grows over ROOF_RAMP_S. t is frozen at 0
   * under reduced motion: a still pattern. Typed arrays and the GLINT table: no allocation, no string.
   */
  function roofFrame(obs, t, light) {
    fx.glint = 0;
    const rs = obs.rooftop && obs.rooftop.suburbs;
    if (!rs || !roof.n || !(light > 0)) { roof.alpha.fill(0); roof.on.fill(0); return; }
    const ds = obs.districts, s = obs.s, conn = roof.conn, cyc = t * ROOF_PV.glintHz, duty = ROOF_PV.glintDuty;
    for (let i = 0; i < conn.length; i++) {
      const d = ds[i];
      conn[i] = d.dark ? 0 : !(d.reconnectS >= 0) ? 1 : s < d.reconnectS ? 0 : Math.min(1, (s - d.reconnectS) / V.ROOF_RAMP_S);
    }
    for (let j = 0; j < NSUB; j++) {
      const sub = roof.subs[j], r = rs[roof.idx[j]];
      let a = sub.n && r && r.capMW > 0 ? clamp01(ROOF_PV.glintGain * r.mw / r.capMW) * light : 0, n = 0;
      if (a < 0.025) a = 0; // under one step of the alpha table: nothing to draw
      if (a > 0) {
        g.fillStyle = step(GLINT, a);
        g.beginPath();
        for (let i = 0; i < sub.n; i++) {
          const c = conn[blocks[sub.blk[i]].di], p = cyc + sub.ph[i];
          if (c > 0 && p - Math.floor(p) < duty * c) { g.rect(sub.x[i], sub.y[i], sub.w[i], 1); n++; }
        }
        g.fill();
      }
      roof.alpha[j] = a; roof.on[j] = n; fx.glint += n;
    }
  }

  /** Advance each district's block-by-block state (G-5); returns a signature of what is dark. */
  function districtsFrame(obs, nowMs) {
    let sig = 7;
    for (const blk of blocks) {
      const st = blk.st, dark = !!obs.districts[blk.di].dark, n = blk.buildings.length;
      if (st.dark !== dark) { st.dark = dark; st.sinceMs = nowMs; }
      // buildings 0..k-1 have switched; k grows by one per BLOCK_MS
      st.k = Math.min(n, Math.floor((nowMs - st.sinceMs) / BLOCK_MS) + 1);
      const off = dark ? st.k : n - st.k, dd = debug.districts[blk.id];
      dd.dark = dark; dd.darkBlocks = off; dd.roof = off ? ROOF_DARK[blk.style][0] : ROOF_LIT[blk.style][0];
      sig = (sig * 31 + off) | 0;
    }
    return sig;
  }

  function unitOf(obs, id) {
    if (!unitIdx || unitIdx.n !== obs.units.length) { unitIdx = new Map(obs.units.map((u, i) => [u.id, i])); unitIdx.n = obs.units.length; }
    const u = obs.units[unitIdx.get(id)];
    return u && u.id === id ? u : obs.units.find(q => q.id === id);
  }

  const inWatch = v => !!(v.mode && (v.mode.locked || v.mode.mode === 'WATCH'));

  function freqFactor(v) {
    const f = v.obs.f, hz = f && Number.isFinite(f.hz) ? f.hz : Number.isFinite(f) ? f : 50;
    return Math.max(0.15, Math.min(1.2, 1 - (50 - hz) * 1.2)) * (inWatch(v) ? 0.35 : 1);
  }

  function spin(id, target, dt) {
    let r = rotor.get(id);
    if (!r) { r = {a: hash01(id) * 6.28, v: target}; rotor.set(id, r); }
    r.v += (target - r.v) * Math.min(1, dt / 1.5); // spin-down / spin-up over ~1.5 s
    r.a += r.v * dt * 6;
    return r;
  }

  function emit(kind, x, y, vx, vy, life) {
    const i = pNext; pNext = (pNext + 1) % NP;
    pX[i] = x; pY[i] = y; pVX[i] = vx; pVY[i] = vy; pLife[i] = life; pKind[i] = kind;
  }

  /** Rotors, exhaust, steam, trip smoke, blades, the solar sheen. */
  function plantsFrame(obs, dt, ff, wx, rm) {
    const drift = 0.5 + 1.2 * wx.windy;
    let coalOn = 0;
    g.lineWidth = 1;
    for (let pass = 0; pass < 2; pass++) { // synchronised rotors bright, the rest dim: two paths
      g.strokeStyle = pass ? '#f2f6fa' : '#5a6068';
      g.beginPath();
      for (const p of PLANTS) for (const mc of p.machines) {
        const u = unitOf(obs, mc.unit);
        if (!u || !!u.sync !== !!pass) continue;
        const r = spin(mc.unit, u.sync ? ff : 0, dt), cx = Math.cos(r.a) * 2, sn = Math.sin(r.a);
        g.moveTo(mc.x - cx, mc.y - sn); g.lineTo(mc.x + cx, mc.y + sn); g.moveTo(mc.x + sn * 2, mc.y - cx / 2); g.lineTo(mc.x - sn * 2, mc.y + cx / 2);
        if (u.mode === 'tripped') { if (Math.random() < 0.5) emit(0, mc.x + Math.random(), mc.y - 1, drift * (0.6 + Math.random() * 0.5), -1.2 - Math.random(), 1); }
        else if (u.sync && mc.vent && Math.random() < 0.16 * (u.outMW / u.ratingMW)) emit(1, mc.vent[0], mc.vent[1], drift * (0.5 + Math.random() * 0.4), -0.8 - Math.random() * 0.5, 0.8);
        if (u.sync && p.id === 'coal') coalOn++;
      }
      g.stroke();
    }
    // cooling-tower plumes while coal runs
    if (coalOn) for (const t of towers) if (Math.random() < 0.10 + 0.05 * coalOn) emit(2, t.x - 4 + Math.random() * 8, t.y - t.h - 1, drift * (0.3 + Math.random() * 0.3), -0.7 - Math.random() * 0.4, 1);
    // wind rotors: with the wind and the frequency; parked and feathered at cut-out
    fx.feathered = wx.cutOut;
    const wf = wx.cutOut ? 0 : Math.max(0.05, obs.wind.outMW / V.WIND_MW);
    g.strokeStyle = wx.cutOut ? '#aab2ba' : '#f4f6f8';
    g.beginPath();
    for (let i = 0; i < WIND_TURBINES.length; i++) {
      const x = WIND_TURBINES[i][0] + 0.5, hy = WIND_TURBINES[i][1] - TURBINE_H;
      const r = spin('wT' + i, wf * ff * 1.6, dt), len = wx.cutOut ? 4 : 6;
      for (let b = 0; b < 3; b++) { const a = (wx.cutOut ? -Math.PI / 2 : r.a) + b * 2.094; g.moveTo(x, hy); g.lineTo(x + Math.cos(a) * len, hy + Math.sin(a) * len); }
    }
    g.stroke();
    g.fillStyle = '#d7dde3';
    for (let i = 0; i < WIND_TURBINES.length; i++) g.fillRect(WIND_TURBINES[i][0] - 1, WIND_TURBINES[i][1] - TURBINE_H - 1, 3, 2);
    // solar: the panels' sheen follows the farm's output (G-3)
    const sf = clamp01(obs.solar.outMW / V.SOLAR_MW);
    if (sf > 0.02) {
      g.fillStyle = step(SHEEN, 0.15 + 0.55 * sf);
      g.beginPath();
      for (const [x, y] of SOLAR_ROWS) { g.moveTo(x, y - 1); g.lineTo(x + SOLAR_ROW_W, y - SOLAR_ROW_W / 2 - 1); g.lineTo(x + SOLAR_ROW_W, y - SOLAR_ROW_W / 2 - 3); g.lineTo(x, y - 3); g.closePath(); }
      g.fill();
    }
    // particles
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) continue;
      const k = pKind[i];
      pX[i] += pVX[i] * dt * 6; pY[i] += pVY[i] * dt * 6; pLife[i] -= dt * (k === 0 ? 0.35 : k === 1 ? 0.6 : 0.4);
      if (pLife[i] <= 0 || pY[i] < 0) { pLife[i] = 0; continue; }
      g.fillStyle = step(k === 0 ? SMOKE_D : k === 1 ? SMOKE_L : STEAM, pLife[i]);
      const sz = k === 0 ? 3 - pLife[i] * 1.5 : k === 1 ? 2 : 4 - pLife[i] * 2;
      g.fillRect(pX[i], pY[i], sz, sz);
    }
  }

  /** G-4: what the weather adds to the frame. t: the animation clock in s (frozen under reduced motion). */
  function weatherFrame(wx, t, nowMs, rm, sunUp) {
    fx.shadows = 0; fx.rain = 0; fx.sheets = 0; fx.shimmer = 0; fx.bolt = false;
    if (wx.cloud > 0.08 && wx.storm < 0.3) { // soft shadows drifting over the suburbs
      const v = 5 + 9 * wx.windy; // base px per real s: the front crosses the map in about a minute
      g.fillStyle = step(SHADOW, 0.13 * wx.cloud);
      for (let pass = 0; pass < 2; pass++) { // a wide faint penumbra, then the core
        const k = pass ? 0.72 : 1;
        g.beginPath();
        for (const s of SHADOWS) { const x = (s.x + t * v) % 800 - 80; g.moveTo(x + s.rx * k, s.y); g.ellipse(x, s.y, s.rx * k, s.ry * k, 0, 0, TAU); }
        g.fill();
      }
      fx.shadows = SHADOWS.length; fx.shadowX = (SHADOWS[0].x + t * v) % 800 - 80;
    }
    if (wx.storm > 0.05) {
      // rain sheets: wide slanted veils from the cloud base to the ground
      // (each a wide faint band with a narrower core, so the edge reads soft)
      g.fillStyle = step(RAIN, 0.05 + 0.05 * wx.storm);
      for (let pass = 0; pass < 2; pass++) {
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const w = 56 + (i % 3) * 14, x = (i * 215 + 60 + t * 22) % 860 - 60 + pass * w * 0.25, ww = pass ? w * 0.5 : w;
          g.moveTo(x, HORIZON_Y - 12); g.lineTo(x + ww, HORIZON_Y - 12); g.lineTo(x + ww - 54, BASE_H); g.lineTo(x - 54, BASE_H); g.closePath();
        }
        g.fill();
      }
      fx.sheets = 4;
      // rain: slanted streaks over the whole frame, one path
      const n = Math.round(40 + 110 * wx.storm), slant = 2 + 2 * wx.windy;
      g.strokeStyle = step(RAIN, 0.5 + 0.2 * wx.storm); g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const y = (rSeed[i * 2 + 1] * 150 + t * 190) % 150 + 28, x = ((rSeed[i * 2] * 700 - t * 60) % 700 + 700) % 700 - 20;
        g.moveTo(x, y); g.lineTo(x - slant, y + 6);
      }
      g.stroke();
      fx.rain = n;
      // lightning: one thin bolt now and then (a line and a faint lift of the sky strip; never under reduced motion)
      if (!rm && wx.storm > 0.5) {
        if (nowMs > boltNext) { boltUntil = nowMs + 110; boltNext = nowMs + 5000 + Math.random() * 5000; boltX = 60 + Math.random() * 520; }
        if (nowMs < boltUntil) {
          fx.bolt = true;
          g.fillStyle = step(FLASH, 0.12); g.fillRect(0, 0, BASE_W, HORIZON_Y);
          g.strokeStyle = '#f4f6ff'; g.beginPath(); g.moveTo(boltX, 30); g.lineTo(boltX - 3, 40); g.lineTo(boltX + 2, 44); g.lineTo(boltX - 2, HORIZON_Y + 2); g.stroke();
        }
      }
    }
    if (wx.heat && sunUp) { // shimmer: pale streaks trembling over the far ground
      g.fillStyle = step(SHIMMER, 0.22);
      for (let i = 0; i < 12; i++) {
        const x = rSeed[i] * BASE_W + Math.sin(t * 2.2 + i * 1.7) * 3, y = HORIZON_Y + 3 + ((i * 5 + Math.floor(t * 3)) % 22);
        g.fillRect(x, y, 16 + rSeed[i + 40] * 22, 1);
        fx.shimmer++;
      }
    }
  }

  function emissive(obs, night, nowMs, rm) {
    const half = rm ? STROBE_RM_MS : STROBE_MS, on = Math.floor(nowMs / half) % 2 === 0;
    fx.strobe = on; fx.strobeMs = half;
    // red strobes on tripped machines (the whole lockout, G-5) and on the tripped tie
    if (on) {
      for (const p of PLANTS) for (const mc of p.machines) {
        const u = unitOf(obs, mc.unit);
        if (u && u.mode === 'tripped') { g.fillStyle = 'rgba(248,81,73,0.35)'; g.fillRect(mc.x - 3, mc.y - 4, 7, 7); g.fillStyle = UI.red; g.fillRect(mc.x - 1, mc.y - 2, 3, 3); }
      }
      if (obs.tie.tripped) for (const t of tiePylons) { g.fillStyle = 'rgba(248,81,73,0.35)'; g.fillRect(t.x - 3, t.y - t.h - 4, 7, 7); g.fillStyle = UI.red; g.fillRect(t.x - 1, t.y - t.h - 2, 3, 3); }
    }
    // battery lamps: amber discharging, green charging, grey idle (the overlay adds the arrow: never colour only)
    const bo = obs.battery.outMW;
    g.fillStyle = bo > 5 ? UI.amber : bo < -5 ? UI.green : '#6e7781';
    for (const p of PLANT_PARTS.battery) g.fillRect(p.x + p.w - 2, p.y - p.w / 2 - 1, 1, 1);
    // aircraft warning lamps on the stacks and the towers at night (steady under reduced motion)
    if (night > 0.3 && (rm || Math.floor(nowMs / 1000) % 2 === 0)) {
      g.fillStyle = '#ff5a4a';
      for (let i = 0; i < stackTops.length; i += 2) g.fillRect(stackTops[i], stackTops[i + 1], 1, 1);
      for (const t of towers) g.fillRect(t.x, t.y - t.h - 4, 1, 1);
    }
  }

  // ------------------------------------------------------------ screen

  function prepare() {
    const dpr = globalThis.devicePixelRatio || 1;
    const cw = Math.max(1, el.clientWidth || root.clientWidth || 1280), ch = Math.max(1, el.clientHeight || root.clientHeight || 268);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  const sx = x => layout.dx + x * layout.scale, sy = y => layout.dy + (y - layout.srcY) * layout.scale;

  function ring(ctx, box, col, lw) {
    const ax = sx(box[0]), ay = sy(box[1]), bx = sx(box[0] + box[2]), by = sy(box[1] + box[3]), C = 8;
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(ax + C, ay); ctx.lineTo(ax, ay); ctx.lineTo(ax, ay + C); ctx.moveTo(bx - C, ay); ctx.lineTo(bx, ay); ctx.lineTo(bx, ay + C);
    ctx.moveTo(ax + C, by); ctx.lineTo(ax, by); ctx.lineTo(ax, by - C); ctx.moveTo(bx - C, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by - C);
    ctx.stroke();
  }

  function boxOf(id) {
    const p = PLANTS.find(q => q.id === id);
    if (p) return p.box;
    const sb = SUBURBS.find(q => 'sub:' + q.id === id);
    return sb ? sb.box : null;
  }

  /** A ✕ at a base-px point: the tripped mark that does not depend on colour or on the strobe (K-22). */
  function cross(ctx, x, y) {
    const cx = sx(x), cy = sy(y), r = 6;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? '#ff6a60' : '#14080a'; ctx.lineWidth = pass ? 2.5 : 5;
      ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
    }
    fx.cross++;
  }

  /** B-5: where the watch points: the tripped machine, else the tie. */
  function spotTarget(obs) {
    const c = obs.contingency;
    if (c && c.cause === 'unit') for (const p of PLANTS) for (const mc of p.machines) if (mc.unit === c.id) { spotX = mc.x; spotY = mc.y - 6; return true; }
    if (!c || c.cause === 'unit') for (const p of PLANTS) for (const mc of p.machines) { const u = unitOf(obs, mc.unit); if (u && u.mode === 'tripped') { spotX = mc.x; spotY = mc.y - 6; return true; } }
    if (c || obs.tie.tripped) { spotX = tiePylons[1].x; spotY = tiePylons[1].y - 10; return true; }
    return false;
  }

  function overlay(ctx, obs, nowMs, cw, ch, rm) {
    // the watch spotlight (B-5): everything dims except a soft circle on the cause
    const watch = inWatch(vm);
    if (watch && watchSinceMs < 0) watchSinceMs = nowMs;
    if (!watch && watchSinceMs >= 0) { watchSinceMs = -1; watchEndMs = nowMs; }
    let a = watch ? (rm ? 1 : clamp01((nowMs - watchSinceMs) / SPOT_MS)) : (rm ? 0 : clamp01(1 - (nowMs - watchEndMs) / 300));
    if (a > 0 && (watch ? spotTarget(obs) : true)) {
      a = a * a * (3 - 2 * a); // eased
      const cx = sx(spotX), cy = sy(spotY), r = SPOT_R * layout.scale;
      const gr = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.25);
      gr.addColorStop(0, 'rgba(4,6,12,0)'); gr.addColorStop(1, step(SPOT, 0.62 * a));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch);
      fx.spot = a; fx.spotX = spotX; fx.spotY = spotY;
    } else fx.spot = 0;
    // dark districts: a hatched outline (K-22: a pattern as well as the unlit roofs)
    fx.hatch = 0;
    let any = false;
    for (const blk of blocks) if (blk.st.dark) { any = true; break; }
    if (any) {
      ctx.strokeStyle = 'rgba(255,214,208,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const blk of blocks) {
        if (!blk.st.dark) continue;
        const x0 = Math.round(sx(blk.cell[0])) + 1.5, y0 = Math.round(sy(blk.cell[1])) + 1.5, w = Math.round(blk.cell[2] * layout.scale) - 3, h = Math.round(blk.cell[3] * layout.scale) - 3;
        for (let k = 8; k < w + h; k += 8) { ctx.moveTo(x0 + Math.min(k, w), y0 + Math.max(0, k - w)); ctx.lineTo(x0 + Math.max(0, k - h), y0 + Math.min(k, h)); }
        fx.hatch++;
      }
      ctx.stroke();
      ctx.strokeStyle = '#ffd1cc'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
      ctx.beginPath();
      for (const blk of blocks) if (blk.st.dark) ctx.rect(Math.round(sx(blk.cell[0])) + 1.5, Math.round(sy(blk.cell[1])) + 1.5, Math.round(blk.cell[2] * layout.scale) - 3, Math.round(blk.cell[3] * layout.scale) - 3);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // tripped: a ✕ on the machine (or the tie) for the whole lockout
    fx.cross = 0;
    for (const p of PLANTS) for (const mc of p.machines) { const u = unitOf(obs, mc.unit); if (u && u.mode === 'tripped') cross(ctx, mc.x, mc.y - 7); }
    if (obs.tie.tripped) cross(ctx, tiePylons[1].x, tiePylons[1].y - tiePylons[1].h - 5);
    // battery: an arrow up (discharging to the grid) or down (charging) beside the containers
    const bo = obs.battery.outMW, bx = sx(326), by = sy(160);
    fx.battery = bo > 5 ? 'up' : bo < -5 ? 'down' : '';
    if (fx.battery) {
      const d = bo > 5 ? -1 : 1;
      ctx.fillStyle = bo > 5 ? UI.amber : UI.green; ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, by + d * 6); ctx.lineTo(bx - 5, by - d * 3); ctx.lineTo(bx + 5, by - d * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // glow rings (L-9 / K-16), hover rings, labels (G-2)
    fx.rings = 0;
    const glow = vm.glow && typeof vm.glow.has === 'function' ? vm.glow : null;
    for (let pi = 0; pi < PLANTS.length; pi++) {
      const p = PLANTS[pi];
      if (glow && glow.size) {
        // a plant lights for its lever or for a START or STOP guard of one of its machines (C-10)
        let lit = !!p.target && glow.has(p.target);
        if (!lit) for (const ids of GUARD_IDS[pi]) if (glow.has(ids[0]) || glow.has(ids[1])) { lit = true; break; }
        if (lit) { ring(ctx, p.box, step(GLOW_RING, rm ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(nowMs / 500))), 2); fx.rings++; } // <= 1 Hz
      }
      if ((vm.hover && p.target === vm.hover) || hoverId === p.id) ring(ctx, p.box, UI.bright, 1.5);
    }
    if (hoverId && hoverId.startsWith('sub:')) ring(ctx, boxOf(hoverId), UI.bright, 1.5);
    const lk = (hoverId || '') + '|' + (vm.hover || '');
    if (lk !== labelsKey || nowMs - labelsAt > 120 || nowMs < labelsAt) { labels = mapLabels(vm, hoverId); labelsKey = lk; labelsAt = nowMs; }
    ctx.font = LABEL_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const lb of labels) {
      const box = boxOf(lb.id);
      if (!box) continue;
      const w = ctx.measureText(lb.text).width + (lb.kind === 'alarm' ? 20 : 8);
      const x = Math.max(w / 2, Math.min(cw - w / 2, sx(box[0] + box[2] / 2))), y = Math.max(16, sy(box[1]));
      ctx.fillStyle = lb.kind === 'alarm' ? 'rgba(90,20,20,0.88)' : 'rgba(13,17,23,0.82)';
      ctx.fillRect(x - w / 2, y - 14, w, 14);
      ctx.fillStyle = lb.kind === 'alarm' ? '#ffd1cc' : UI.bright;
      ctx.fillText(lb.kind === 'alarm' ? '⚠ ' + lb.text : lb.text, x, y - 2);
    }
    if (focused) { ctx.strokeStyle = UI.blue; ctx.lineWidth = 2; ctx.strokeRect(1, 1, cw - 2, ch - 2); }
  }

  const SH = {x: 0, y: 0, a: 0}, WX = {heat: false, stormB: 0, cloudB: 0};

  function draw() {
    const t0 = globalThis.performance ? performance.now() : Date.now();
    const obs = vm.obs;
    const nowMs = (vm.frame && vm.frame.nowMs) || lastMs + 16;
    const dt = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
    lastMs = nowMs;
    const rm = !!(vm.settings && vm.settings.reducedMotion);
    syncBlocks(obs);
    syncRoof(obs);
    const h = hour(obs.clock ? obs.clock.h : 12);
    const sun = sunAmount(h), night = 1 - sun, wx = weatherOf(obs);
    fx.sky = skyState(h); fx.heat = wx.heat; fx.storm = wx.storm; fx.cloud = wx.cloud;
    // the sun: east (right) at dawn to west (left) at sunset; shadows fall away from it
    const st = (h - SUNRISE_H) / (SUNSET_H - SUNRISE_H), elev = Math.sin(Math.PI * clamp01(st));
    const sunUp = st > -0.03 && st < 1.03;
    fx.sunUp = sunUp; fx.sunX = 612 - 584 * st; fx.sunY = HORIZON_Y - 6 - elev * 5;
    const shLen = sunUp ? Math.max(0.3, Math.min(1.7, 0.3 / Math.max(elev, 0.12))) : 0;
    const shQ = sunUp ? Math.round(shLen * 3) * (st < 0.5 ? -1 : 1) : 0;
    WX.heat = wx.heat; WX.stormB = Math.round(wx.storm * 4); WX.cloudB = Math.round(wx.cloud * 3);
    const lk = lightAt(h, L) + '|' + shQ + '|' + (WX.heat ? 1 : 0) + WX.stormB + WX.cloudB;
    SH.x = shQ / 3 * 0.9; SH.y = Math.abs(shQ) / 3 * 0.28; SH.a = sunUp ? 0.26 * sun * (1 - 0.25 * WX.stormB) * (1 - 0.2 * WX.cloudB) : 0;
    const sig = districtsFrame(obs, nowMs);
    // night windows follow what the city is using: underlying demand, not the grid's net of rooftop (Phase 2a)
    const dm = obs.demand, usingMW = dm ? (Number.isFinite(dm.underlyingMW) ? dm.underlyingMW : dm.nowMW) : 5000;
    const demandFrac = clamp01(usingMW / 8000);
    const ck = lk + '|' + sig + '|' + (night > 0.05 ? Math.round(demandFrac * 10) + ':' + Math.round(night * 4) : '');
    if (lk !== lightKey) { drawSky(WX); drawClouds(WX); drawTerrain(WX, SH); lightKey = lk; }
    if (ck !== cityKey) { drawCity(WX, SH, 0.25 + 0.7 * demandFrac, night); cityKey = ck; }
    // the frame: sky, sun, cloud, terrain, city, then what moves
    const t = rm ? 0 : nowMs / 1000;
    fx.phase = t;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(skyL, 0, 0);
    if (sunUp && wx.storm < 0.6) {
      const low = 1 - elev, a = 1 - wx.storm / 0.6;
      g.fillStyle = 'rgba(255,' + (236 - 90 * low | 0) + ',' + (190 - 130 * low | 0) + ',' + (0.28 * a).toFixed(2) + ')';
      g.beginPath(); g.arc(fx.sunX, fx.sunY, 7 + 3 * low, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,' + (248 - 70 * low | 0) + ',' + (214 - 130 * low | 0) + ',' + a.toFixed(2) + ')';
      g.beginPath(); g.arc(fx.sunX, fx.sunY, 4, 0, TAU); g.fill();
    }
    if (hasClouds) {
      const v = 3 + 7 * wx.windy, a = (t * v) % BASE_W, b = (t * v * 1.8) % BASE_W;
      g.drawImage(cloudA, a, 0); g.drawImage(cloudA, a - BASE_W, 0);
      g.drawImage(cloudB, b, 0); g.drawImage(cloudB, b - BASE_W, 0);
    }
    g.drawImage(terrL, 0, 0);
    g.drawImage(cityL, 0, 0);
    roofFrame(obs, t, sun * (1 - 0.6 * wx.storm));
    plantsFrame(obs, dt, freqFactor(vm), wx, rm);
    weatherFrame(wx, t, nowMs, rm, sunUp);
    emissive(obs, night, nowMs, rm);
    // blit at an integer scale (G-1)
    const ctx = prepare();
    const cw = Math.max(1, el.clientWidth || root.clientWidth || 1280), ch = Math.max(1, el.clientHeight || root.clientHeight || 268);
    if (!layout || layout.cw !== cw || layout.ch !== ch) { layout = scaleFor(cw, ch); layout.cw = cw; layout.ch = ch; }
    debug.scale = layout.scale; debug.layout = layout;
    ctx.imageSmoothingEnabled = false;
    if (layout.dx > 0 || layout.dy > 0 || layout.dy + layout.drawH < ch) { // letterbox: sky above the horizon row, ground below
      const hs = Math.max(0, Math.min(ch, sy(HORIZON_Y)));
      ctx.fillStyle = skyCss; ctx.fillRect(0, 0, cw, hs);
      ctx.fillStyle = groundCss; ctx.fillRect(0, hs, cw, ch - hs);
    }
    ctx.drawImage(frame, 0, layout.srcY, BASE_W, layout.shownH, layout.dx, layout.dy, layout.drawW, layout.drawH);
    overlay(ctx, obs, nowMs, cw, ch, rm);
    if (nowMs - ariaAt >= 1000 || nowMs < ariaAt) { // the text alternative, at most once per real second (K-23)
      ariaAt = nowMs;
      const s = mapSummary(vm, hoverId);
      if (s !== ariaText) { ariaText = s; el.setAttribute('aria-label', s); }
    }
    debug.draws++;
    drawMs = (globalThis.performance ? performance.now() : Date.now()) - t0;
  }

  // ------------------------------------------------------------ pointer and keys (hover, G-2, K-23)

  function baseAt(ev) {
    if (!layout) return null;
    const r = cv.getBoundingClientRect();
    const cw = el.clientWidth || r.width, ch = el.clientHeight || r.height;
    const px = (ev.clientX - r.left) * cw / (r.width || cw), py = (ev.clientY - r.top) * ch / (r.height || ch);
    return {x: (px - layout.dx) / layout.scale, y: (py - layout.dy) / layout.scale + layout.srcY};
  }

  function pick(p) {
    if (!p) return null;
    const inBox = b => p.x >= b[0] && p.x <= b[0] + b[2] && p.y >= b[1] && p.y <= b[1] + b[3];
    for (const pl of PLANTS) if (inBox(pl.box)) return pl.id;
    for (const sb of SUBURBS) if (inBox(sb.box)) return 'sub:' + sb.id;
    return null;
  }

  function setHover(id) {
    if (id !== hoverId) ariaAt = -1e9; // say it on the next frame
    hoverId = id;
    const p = PLANTS.find(q => q.id === id);
    const target = p && p.target ? p.target : null;
    if (target !== sentTarget) { sentTarget = target; actions.ui({do: 'hover', target}); }
    cv.style.cursor = id ? 'pointer' : 'default';
  }

  cv.addEventListener('pointermove', ev => { const id = pick(baseAt(ev)); if (id || !byKey) { byKey = false; kbdIdx = KEY_ORDER.indexOf(id); setHover(id); } });
  cv.addEventListener('click', ev => {
    const p = PLANTS.find(q => q.id === pick(baseAt(ev)));
    if (p && p.target) actions.ui({do: 'focus', target: p.target});
  });
  cv.addEventListener('pointerleave', () => { if (!byKey) setHover(null); }); // a hover set by the keys stays until Esc or blur

  /**
   * K-23: the map's keys, when it has the focus: ←/→ step through the plants then the suburbs
   * (the same hover the pointer sets, so the lever lights and the label shows), Home the first,
   * Esc leaves. Returns true exactly when it acted; the map's own keydown listener calls it and
   * stops the event, so a key forwarded by the shell never acts twice.
   */
  function key(ev) {
    if (!ev || (ev.type && ev.type !== 'keydown') || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return false;
    if (doc.activeElement !== el) return false;
    const k = ev.key, n = KEY_ORDER.length;
    if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'Home') {
      kbdIdx = k === 'Home' ? 0 : kbdIdx < 0 ? (k === 'ArrowRight' ? 0 : n - 1) : (kbdIdx + (k === 'ArrowRight' ? 1 : n - 1)) % n;
      byKey = true;
      setHover(KEY_ORDER[kbdIdx]);
      return true;
    }
    if (k === 'Escape') { kbdIdx = -1; byKey = false; setHover(null); if (el.blur) el.blur(); return true; }
    return false;
  }

  el.addEventListener('keydown', ev => { if (key(ev)) { ev.preventDefault(); ev.stopPropagation(); } });
  el.addEventListener('focus', () => { focused = true; });
  el.addEventListener('blur', () => { focused = false; if (byKey) { byKey = false; kbdIdx = -1; setHover(null); } });

  function update(v) {
    vm = v;
    draw();
  }

  return {
    update, key, el,
    /** Test / perf hooks (not part of the contract). */
    debug: Object.defineProperties(debug, {
      labels: {get: () => labels}, drawMs: {get: () => drawMs}, hoverId: {get: () => hoverId}, blocks: {get: () => blocks},
      pick: {value: (x, y) => pick({x, y})}, rotorSpeed: {value: id => (rotor.get(id) || {v: 0}).v},
      roof: {get: () => ({panels: roof.subs.map(q => q.n), alpha: roof.alpha, on: roof.on, conn: roof.conn})},
    }),
  };
}

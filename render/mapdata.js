// render/mapdata.js: the map's fixed geometry and the colours the stack, the map (and the
// levers, desk/README §7 L-3) share. Pure data plus pure helpers; no DOM. Tested by
// tests/map.test.js (G-1: integer scale, terrain to the frame edges, no building off the
// terrain; G-2: the silhouette parts of each technology; X-37, X-38).
//
// The map is drawn on a fixed offscreen BASE_W x BASE_H canvas and blitted at an INTEGER
// scale (G-1). scaleFor() picks the scale from the map area: the largest integer with the
// whole width shown and the floor-safe rows (SAFE) fitting the height. Rows the frame cannot
// show are cropped from the top (sky first); room left over is letterboxed with the ground
// colour below the horizon and the sky colour above it, never sky under the ground.
//   1280x268 (the 1280x600 floor) -> x2, 640x134 base px, the SAFE rows exactly
//   1280x344 (1280x720)            -> x2, 640x172
//   1920x520 (1920x1080)           -> x3, 640x173.3
// The horizon sits 14 rows inside SAFE, so even the floor shows a strip of sky (G-3: the sun,
// the sunset, the storm cloud) with the stacks, the towers and the CBD breaking it.
//
// Everything a shape needs is data here (base px), so the art can be nudged without touching
// the drawing code in render/map.js.

export const BASE_W = 640;
export const BASE_H = 176;
export const HORIZON_Y = 56;
/** Rows every supported map area shows: everything that matters is drawn inside. */
export const SAFE = Object.freeze({x: 0, y: BASE_H - 134, w: BASE_W, h: 134});
/** The ground: from the horizon to the bottom, edge to edge. */
export const TERRAIN = Object.freeze({x: 0, y: HORIZON_Y, w: BASE_W, h: BASE_H - HORIZON_Y});

/** Layer / plant colours (stack layers, map accents, and the levers' caps). */
export const COLOURS = Object.freeze({
  coal: '#8a7968', ccgt: '#e0873a', gta: '#d8b13a', gtb: '#e27d5f', gtc: '#c95a86', hydro: '#3d8fe0',
  wind: '#7fd1c1', solar: '#f1d35c', tie: '#a58cf5', battery: '#4dc58c', rert: '#b8c0c8', dr: '#d7a8ff',
});
export const UI = Object.freeze({
  bg: '#0d1117', panel: '#11161d', grid: '#232a33', axis: '#6e7781', text: '#9aa4b0', bright: '#e6edf3',
  red: '#f85149', amber: '#d29922', blue: '#58a6ff', green: '#3fb950', skyline: '#e6edf3',
  band: 'rgba(230,237,243,0.10)', ghost: 'rgba(230,237,243,0.55)',
});
export const GROUND = '#3f6b3a';
export const SKY = '#6a9fd0';

/** The six suburbs (U-1, SPEC §4.5): code as in obs.districts[].suburb, name, box in base px. */
export const SUBURBS = Object.freeze([
  {id: 'HAZ', name: 'Old Hazelton', box: [226, 70, 70, 32], style: 'old'},
  {id: 'HAR', name: 'Harbourside', box: [304, 74, 68, 30], style: 'cbd'},
  {id: 'TAL', name: 'Tallowood Heights', box: [380, 70, 72, 32], style: 'leafy'},
  {id: 'SOL', name: 'Solstice Rise', box: [222, 112, 72, 34], style: 'estate'},
  {id: 'RED', name: 'Redgum Flats', box: [302, 110, 84, 40], style: 'flats'},
  {id: 'SAL', name: 'Saltbush Bay', box: [394, 114, 70, 34], style: 'coast'},
].map(Object.freeze));

/** The two city substations: the west trunk (tie, coal, gas) and the east trunk (hydro, wind, solar) end here. */
export const SUBSTATIONS = Object.freeze([[210, 118], [468, 110]]);
export const SUBSTATION = SUBSTATIONS[0];
/** Trunk lines [x, y] pylon by pylon (medium pylons), each ending at a substation. */
export const TRUNKS = Object.freeze([
  [[84, 128], [116, 126], [148, 123], [180, 120], [210, 118]],
  [[592, 121], [560, 124], [528, 122], [498, 116], [468, 110]],
]);

/**
 * Plants: id (a station or asset), control target (desk/README §5 ids; null: none), label,
 * the hit/label box [x, y, w, h] in base px, the machine anchors (where the rotor, the trip
 * smoke, the strobe and the ✕ sit; vent: where its exhaust leaves) and its feeder `line` (a
 * spur to a trunk pylon; the tie's runs off the west edge on tall lattice pylons).
 */
export const PLANTS = Object.freeze([
  {id: 'coal', target: 'lever-coal', label: 'MT HAZEL COAL', box: [36, 44, 90, 72],
    machines: [{unit: 'coal1', x: 86, y: 90, vent: [93, 48]}, {unit: 'coal2', x: 92, y: 87, vent: [93, 48]},
      {unit: 'coal3', x: 100, y: 83, vent: [105, 46]}, {unit: 'coal4', x: 106, y: 80, vent: [105, 46]}],
    line: [[120, 104], [116, 126]]},
  {id: 'ccgt', target: 'lever-ccgt', label: 'RIVERTON CCGT', box: [158, 126, 52, 44],
    machines: [{unit: 'ccgt1', x: 181, y: 157, vent: [171, 130]}, {unit: 'ccgt2', x: 191, y: 152, vent: [195, 128]}],
    line: [[186, 134], [180, 120]]},
  {id: 'gta', target: 'lever-gta', label: 'GT·A', box: [18, 134, 28, 30],
    machines: [{unit: 'gta1', x: 29, y: 152, vent: [42, 141]}], line: [[44, 146], [62, 128]]},
  {id: 'gtb', target: 'lever-gtb', label: 'GT·B', box: [52, 138, 50, 30],
    machines: [{unit: 'gtb1', x: 63, y: 156, vent: [76, 145]}, {unit: 'gtb2', x: 87, y: 156, vent: [100, 145]}],
    line: [[92, 148], [116, 126]]},
  {id: 'gtc', target: 'lever-gtc', label: 'GT·C', box: [104, 142, 50, 30],
    machines: [{unit: 'gtc1', x: 115, y: 160, vent: [128, 149]}, {unit: 'gtc2', x: 139, y: 160, vent: [152, 149]}],
    line: [[146, 150], [148, 123]]},
  {id: 'hydro', target: 'wheel-hydro', label: 'GREYFELL GORGE HYDRO', box: [500, 60, 88, 60],
    machines: [{unit: 'hydro1', x: 556, y: 108}, {unit: 'hydro2', x: 561, y: 106}, {unit: 'hydro3', x: 565, y: 104}],
    line: [[568, 112], [560, 124]]},
  {id: 'wind', target: null, label: 'GALE RIDGE WIND', box: [590, 42, 50, 78], machines: [],
    line: [[608, 116], [592, 121]]},
  {id: 'solar', target: null, label: 'SUNPLAIN SOLAR', box: [496, 126, 98, 48], machines: [],
    line: [[522, 138], [528, 122]]},
  {id: 'battery', target: 'dial-battery', label: 'BIG BATTERY', box: [268, 152, 56, 22], machines: [],
    line: [[298, 156], [298, 150]]},
  {id: 'tie', target: 'knob-tie', label: 'TIE LINE', box: [0, 104, 46, 28], machines: [],
    line: [[0, 129], [10, 128], [36, 128], [62, 128], [84, 128]], toEdge: true},
].map(Object.freeze));

/**
 * Plant silhouettes (G-2) as parts {k, ...}, drawn back to front (by y) in list order where y ties:
 *   box    iso cuboid {x, y, w, d, h, c?}; (x, y) its front-bottom corner; c: a BOX_TONE key
 *   tower  hyperbolic cooling tower {x, y, r, h}: centre of the base, base radius, height
 *   stack  chimney {x, y, w, h, band?}: left of the base, width, height (band: red/white top)
 *   pile   coal stockpile {x, y, w, h}: centre of the base
 *   belt   conveyor {x, y, x2, y2}
 *   dam    dam wall {x, y, w, h}: left end of the crest, crest width, face height
 *   spill  spillway chute {x, y, w, h} on the dam face (top-left)
 *   pipe   penstock {x, y, x2, y2}
 *   pylon  lattice pylon {x, y, h}: centre of the base
 */
export const PLANT_PARTS = Object.freeze({
  coal: [{k: 'tower', x: 50, y: 88, r: 11, h: 32}, {k: 'tower', x: 72, y: 82, r: 11, h: 32},
    {k: 'stack', x: 92, y: 84, w: 3, h: 36, band: true}, {k: 'stack', x: 104, y: 80, w: 3, h: 34, band: true},
    {k: 'box', x: 88, y: 112, w: 30, d: 14, h: 16, c: 'hall'}, {k: 'box', x: 120, y: 112, w: 6, d: 8, h: 5},
    {k: 'pile', x: 54, y: 112, w: 36, h: 10}, {k: 'belt', x: 62, y: 105, x2: 78, y2: 97}],
  ccgt: [{k: 'box', x: 170, y: 158, w: 12, d: 10, h: 13, c: 'hrsg'}, {k: 'box', x: 194, y: 156, w: 12, d: 10, h: 13, c: 'hrsg'},
    {k: 'stack', x: 169, y: 141, w: 4, h: 13}, {k: 'stack', x: 193, y: 139, w: 4, h: 13},
    {k: 'box', x: 176, y: 166, w: 26, d: 6, h: 4}],
  gta: [{k: 'box', x: 28, y: 160, w: 12, d: 8, h: 6, c: 'shed'}, {k: 'stack', x: 41, y: 153, w: 2, h: 12}],
  gtb: [{k: 'box', x: 62, y: 164, w: 12, d: 8, h: 6, c: 'shed'}, {k: 'stack', x: 75, y: 157, w: 2, h: 12},
    {k: 'box', x: 86, y: 164, w: 12, d: 8, h: 6, c: 'shed'}, {k: 'stack', x: 99, y: 157, w: 2, h: 12}],
  gtc: [{k: 'box', x: 114, y: 168, w: 12, d: 8, h: 6, c: 'shed'}, {k: 'stack', x: 127, y: 161, w: 2, h: 12},
    {k: 'box', x: 138, y: 168, w: 12, d: 8, h: 6, c: 'shed'}, {k: 'stack', x: 151, y: 161, w: 2, h: 12}],
  hydro: [{k: 'dam', x: 508, y: 88, w: 52, h: 16}, {k: 'spill', x: 530, y: 87, w: 7, h: 17},
    {k: 'pipe', x: 546, y: 98, x2: 554, y2: 108}, {k: 'pipe', x: 550, y: 97, x2: 558, y2: 106}, {k: 'pipe', x: 554, y: 96, x2: 562, y2: 104},
    {k: 'box', x: 556, y: 118, w: 16, d: 7, h: 6}],
  battery: [{k: 'box', x: 276, y: 164, w: 8, d: 4, h: 3, c: 'white'}, {k: 'box', x: 287, y: 164, w: 8, d: 4, h: 3, c: 'white'},
    {k: 'box', x: 298, y: 164, w: 8, d: 4, h: 3, c: 'white'}, {k: 'box', x: 309, y: 164, w: 8, d: 4, h: 3, c: 'white'},
    {k: 'box', x: 280, y: 171, w: 8, d: 4, h: 3, c: 'white'}, {k: 'box', x: 291, y: 171, w: 8, d: 4, h: 3, c: 'white'},
    {k: 'box', x: 302, y: 171, w: 8, d: 4, h: 3, c: 'white'}, {k: 'box', x: 313, y: 171, w: 8, d: 4, h: 3, c: 'white'}],
  tie: [{k: 'pylon', x: 10, y: 128, h: 20}, {k: 'pylon', x: 36, y: 128, h: 20}, {k: 'pylon', x: 62, y: 128, h: 20},
    {k: 'box', x: 84, y: 134, w: 8, d: 6, h: 3, c: 'dark'}],
  solar: [],
  wind: [],
});

/** Wind turbine towers [x, y] (base of the mast) and solar panel rows [x, y] (front-left end). */
export const WIND_TURBINES = Object.freeze([[600, 78], [614, 74], [628, 70], [602, 96], [616, 92], [630, 88], [606, 114], [620, 110]]);
export const TURBINE_H = 18;
export const SOLAR_ROWS = Object.freeze([[500, 146], [509, 150], [518, 154], [527, 158], [536, 162], [545, 166], [554, 170]]);
export const SOLAR_ROW_W = 36;
/** The ridge (hydro and wind sit on it), the lake behind the dam, the river to the bay, the bay. */
export const RIDGE = Object.freeze([[484, 122], [494, 84], [508, 64], [544, 58], [640, 56], [640, 124], [604, 128], [566, 126], [520, 118]]);
export const LAKE = Object.freeze([[506, 88], [512, 74], [532, 65], [562, 63], [582, 68], [586, 78], [574, 86], [560, 89]]);
export const RIVER = Object.freeze([[534, 105], [524, 120], [504, 138], [486, 152], [470, 164]]);
export const BAY = Object.freeze([[404, 176], [436, 160], [462, 152], [486, 158], [498, 168], [500, 176]]);
/** Roads [x1, y1, x2, y2] and farm fields [x, y, w, d, colour] (iso parallelograms on the ground). */
export const ROADS = Object.freeze([[196, 107, 470, 107], [298, 62, 298, 174], [376, 62, 376, 150], [224, 107, 196, 121], [196, 121, 126, 121]]);
export const FIELDS = Object.freeze([
  [150, 104, 26, 18, '#b7a654'], [182, 96, 22, 16, '#6c9a48'], [166, 84, 20, 14, '#8f7a4a'], [200, 82, 18, 12, '#a9b25a'],
  [140, 78, 16, 12, '#5f8f44'], [470, 90, 14, 12, '#b7a654'], [476, 74, 12, 10, '#6c9a48'], [346, 172, 26, 14, '#8f7a4a'],
  [384, 168, 20, 12, '#b7a654'], [236, 170, 22, 12, '#6c9a48'], [20, 96, 16, 10, '#a9b25a'], [24, 78, 14, 10, '#6c9a48'],
  [606, 152, 22, 14, '#b7a654'], [624, 168, 18, 12, '#8f7a4a'], [612, 140, 14, 8, '#5f8f44'],
]);
/** Tree zones [x, y, w, h, n]: n trees scattered (deterministically) in each box. */
export const TREES = Object.freeze([
  [0, 58, 640, 5, 90], [130, 62, 80, 14, 16], [456, 58, 36, 40, 16], [498, 60, 20, 16, 8], [564, 86, 26, 12, 8],
  [588, 60, 50, 8, 8], [380, 100, 72, 4, 10], [226, 150, 40, 22, 9], [330, 152, 70, 8, 8], [0, 66, 34, 34, 12],
  [164, 106, 30, 10, 5], [400, 150, 30, 8, 5], [600, 128, 40, 46, 14], [454, 120, 14, 28, 5], [2, 146, 14, 28, 6],
]);

// ------------------------------------------------------------------ pure helpers

/** Iso cuboid bounds: {x, y, w, h} of the whole drawn box and {fx, fy, fw, fh} of its footprint. */
export function cuboidBounds(x, y, w, d, h) {
  const left = x - d, right = x + w, top = y - (w + d) / 2 - h, bottom = y;
  return {x: left, y: top, w: right - left, h: bottom - top, fx: left, fy: y - (w + d) / 2, fw: right - left, fh: (w + d) / 2};
}

/** Bounds of one PLANT_PARTS part, in the cuboidBounds shape (drawn box and ground footprint). */
export function partBounds(p) {
  switch (p.k) {
    case 'box': return cuboidBounds(p.x, p.y, p.w, p.d, p.h);
    case 'tower': { const e = p.r * 0.35; return {x: p.x - p.r, y: p.y - p.h - e, w: 2 * p.r, h: p.h + 2 * e, fx: p.x - p.r, fy: p.y - e, fw: 2 * p.r, fh: 2 * e}; }
    case 'stack': return {x: p.x, y: p.y - p.h, w: p.w, h: p.h, fx: p.x, fy: p.y - 1, fw: p.w, fh: 1};
    case 'pile': return {x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h, fx: p.x - p.w / 2, fy: p.y - 3, fw: p.w, fh: 3};
    case 'dam': return {x: p.x, y: p.y - 6, w: p.w, h: p.h + 6, fx: p.x, fy: p.y + p.h - 2, fw: p.w, fh: 2};
    case 'spill': return {x: p.x, y: p.y, w: p.w, h: p.h, fx: p.x, fy: p.y + p.h - 1, fw: p.w, fh: 1};
    case 'pylon': { const r = p.h * 0.3; return {x: p.x - r, y: p.y - p.h, w: 2 * r, h: p.h, fx: p.x - r, fy: p.y - 1, fw: 2 * r, fh: 1}; }
    default: { // belt, pipe: a line
      const x = Math.min(p.x, p.x2), y = Math.min(p.y, p.y2), w = Math.abs(p.x2 - p.x), h = Math.abs(p.y2 - p.y);
      return {x, y: y - 1, w, h: h + 1, fx: x, fy: y, fw: w, fh: h};
    }
  }
}

/** Deterministic hash in [0, 1) (layout only: the city looks the same every day). */
export function hash01(str, k = 0) {
  let h = 0x811c9dc5 ^ k;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

// n buildings per district (G-5: they go dark one per 90 ms, so n <= 9 keeps a shed inside 1 s).
const STYLE = {
  cbd: {n: 5, hMin: 11, hMax: 26, wMin: 5, wMax: 7},
  old: {n: 6, hMin: 3, hMax: 6, wMin: 4, wMax: 6},
  leafy: {n: 5, hMin: 3, hMax: 5, wMin: 4, wMax: 6},
  estate: {n: 6, hMin: 2, hMax: 4, wMin: 4, wMax: 5},
  flats: {n: 6, hMin: 4, hMax: 10, wMin: 4, wMax: 6},
  coast: {n: 5, hMin: 3, hMax: 7, wMin: 4, wMax: 6},
};

/**
 * District blocks for obs.districts (grouped by suburb, in list order): each district gets
 * one cell of its suburb's box and a few buildings in it (deterministic from its id), two
 * staggered rows per cell.
 * @param {Array<{id:string, suburb:string}>} districts
 * @returns {Array<{id, suburb, cell:[x,y,w,h], buildings:Array<{x,y,w,d,h,win}>}>}
 */
export function districtBlocks(districts) {
  const out = [];
  for (const sb of SUBURBS) {
    const ds = districts.filter(d => d.suburb === sb.id);
    if (!ds.length) continue;
    const [bx, by, bw, bh] = sb.box, st = STYLE[sb.style];
    const cols = Math.ceil(Math.sqrt(ds.length * bw / bh / 2)) || 1, rows = Math.ceil(ds.length / cols);
    const cw = bw / cols, ch = bh / rows, nc = Math.ceil(st.n / 2), sw = cw / nc, sh = ch / 2;
    ds.forEach((d, i) => {
      const cx = bx + (i % cols) * cw, cy = by + Math.floor(i / cols) * ch;
      const buildings = [];
      for (let b = 0; b < st.n; b++) {
        const w = Math.round(st.wMin + hash01(d.id, b * 7 + 1) * (st.wMax - st.wMin));
        const dd = Math.max(3, Math.round(w * 0.7));
        const h = Math.round(st.hMin + hash01(d.id, b * 7 + 2) * (st.hMax - st.hMin));
        const col = b % nc, row = Math.floor(b / nc);
        // front-bottom corner: a slot of the cell, the back row shifted half a slot, kept inside the suburb's box
        const fx = cx + (col + (row ? 0.15 : 0.55)) * sw + dd * 0.5 + (hash01(d.id, b * 7 + 3) - 0.5) * sw * 0.3;
        const fy = cy + (row + 1) * sh - hash01(d.id, b * 7 + 4) * 2;
        buildings.push({x: Math.round(Math.max(bx + dd, Math.min(fx, bx + bw - w))), y: Math.round(Math.max(by + (w + dd) / 2, Math.min(fy, by + bh))), w, d: dd, h,
          win: Math.max(1, Math.round(h / 3))});
      }
      buildings.sort((a, c) => a.y - c.y || a.x - c.x);
      out.push({id: d.id, suburb: sb.id, style: sb.style, cell: [cx, cy, cw, ch], buildings});
    });
  }
  return out;
}

/**
 * Every drawn building's bounds (plants, turbines, panels, districts) for the G-1 test and
 * hit-testing: [{kind, id, part?, x, y, w, h, fx, fy, fw, fh}].
 */
export function buildingBoxes(districts) {
  const out = [];
  for (const [id, parts] of Object.entries(PLANT_PARTS)) {
    for (const p of parts) out.push(Object.assign({kind: 'plant', id, part: p.k}, partBounds(p)));
  }
  for (const [x, y] of WIND_TURBINES) {
    const r = 7;
    out.push({kind: 'turbine', id: 'wind', x: x - r, y: y - TURBINE_H - r, w: 2 * r, h: TURBINE_H + r, fx: x - 1, fy: y - 1, fw: 2, fh: 1});
  }
  for (const [x, y] of SOLAR_ROWS) out.push({kind: 'panel', id: 'solar', x, y: y - SOLAR_ROW_W / 2 - 3, w: SOLAR_ROW_W, h: SOLAR_ROW_W / 2 + 3, fx: x, fy: y - SOLAR_ROW_W / 2, fw: SOLAR_ROW_W, fh: SOLAR_ROW_W / 2});
  for (const blk of districtBlocks(districts || [])) {
    for (const b of blk.buildings) out.push(Object.assign({kind: 'district', id: blk.id}, cuboidBounds(b.x, b.y, b.w, b.d, b.h)));
  }
  return out;
}

/**
 * G-1: the integer scale and placement for a map area of cw x ch CSS px.
 * @returns {{scale:number, viewW:number, viewH:number, srcY:number, dx:number, dy:number, drawW:number, drawH:number}}
 *   srcY: first base row shown; (dx, dy): where base row srcY, column 0 lands (CSS px, may be
 *   > 0: letterbox); drawW/drawH: the blitted base area in CSS px.
 */
export function scaleFor(cw, ch) {
  cw = Math.max(1, Math.floor(cw)); ch = Math.max(1, Math.floor(ch));
  let scale = Math.max(1, Math.floor(cw / BASE_W));
  while (scale > 1 && SAFE.h * scale > ch) scale--;
  const viewW = cw / scale, viewH = ch / scale;
  const shownH = Math.min(BASE_H, Math.ceil(viewH));
  const srcY = BASE_H - shownH;
  const drawW = BASE_W * scale, drawH = shownH * scale;
  const dx = Math.floor((cw - drawW) / 2);
  const dy = drawH >= ch ? ch - drawH : Math.floor((ch - drawH) / 2);
  return {scale, viewW, viewH, srcY, shownH, dx, dy, drawW, drawH};
}

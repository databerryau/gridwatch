// render/mapdata.js: the map's fixed geometry and the colours the stack, the map (and the
// levers, desk/README §7 L-3) share. Pure data plus pure helpers; no DOM. Tested by
// tests/map.test.js (G-1: integer scale, terrain to the frame edges, no building off the
// terrain; X-37, X-38).
//
// The map is drawn on a fixed offscreen BASE_W x BASE_H canvas and blitted at an INTEGER
// scale (G-1). scaleFor() picks the scale from the map area: the largest integer with the
// whole width shown and the floor-safe rows (SAFE) fitting the height. Rows the frame cannot
// show are cropped from the top (sky first); room left over is letterboxed with the ground
// colour below the horizon and the sky colour above it, never sky under the ground.
//   1280x268 (the 1280x600 floor) -> x2, 640x134 base px, the SAFE rows exactly
//   1280x344 (1280x720)            -> x2, 640x172
//   1920x520 (1920x1080)           -> x3, 640x173.3

export const BASE_W = 640;
export const BASE_H = 176;
export const HORIZON_Y = 40;
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

/**
 * Plants: id (a station or asset), control target (desk/README §5 ids; null: none), label,
 * the hit/label box [x, y, w, h] in base px, the machine anchors (where the rotor, lamp,
 * smoke and strobe sit) and the substation end of its line.
 */
export const PLANTS = Object.freeze([
  {id: 'coal', target: 'lever-coal', label: 'MT HAZEL COAL', box: [34, 64, 92, 56],
    machines: [{unit: 'coal1', x: 58, y: 78}, {unit: 'coal2', x: 74, y: 76}, {unit: 'coal3', x: 90, y: 74}, {unit: 'coal4', x: 106, y: 72}],
    line: [[112, 104], [168, 100], [226, 106]]},
  {id: 'ccgt', target: 'lever-ccgt', label: 'RIVERTON CCGT', box: [130, 110, 58, 34],
    machines: [{unit: 'ccgt1', x: 146, y: 118}, {unit: 'ccgt2', x: 170, y: 116}],
    line: [[176, 134], [206, 124], [226, 112]]},
  {id: 'gta', target: 'lever-gta', label: 'GT·A', box: [20, 132, 34, 26],
    machines: [{unit: 'gta1', x: 36, y: 138}], line: [[46, 152], [120, 150], [196, 140], [226, 118]]},
  {id: 'gtb', target: 'lever-gtb', label: 'GT·B', box: [62, 136, 46, 28],
    machines: [{unit: 'gtb1', x: 76, y: 142}, {unit: 'gtb2', x: 92, y: 142}], line: [[100, 158], [160, 156], [200, 146]]},
  {id: 'gtc', target: 'lever-gtc', label: 'GT·C', box: [118, 148, 46, 26],
    machines: [{unit: 'gtc1', x: 132, y: 154}, {unit: 'gtc2', x: 148, y: 154}], line: [[156, 168], [196, 150]]},
  {id: 'hydro', target: 'wheel-hydro', label: 'GREYFELL GORGE HYDRO', box: [500, 50, 84, 58],
    machines: [{unit: 'hydro1', x: 530, y: 94}, {unit: 'hydro2', x: 542, y: 92}, {unit: 'hydro3', x: 554, y: 90}],
    line: [[524, 106], [480, 104], [454, 92]]},
  {id: 'wind', target: null, label: 'GALE RIDGE WIND', box: [588, 44, 50, 74], machines: [],
    line: [[596, 112], [560, 118], [470, 110]]},
  {id: 'solar', target: null, label: 'SUNPLAIN SOLAR', box: [492, 124, 96, 40], machines: [],
    line: [[500, 140], [470, 136]]},
  {id: 'battery', target: 'dial-battery', label: 'BIG BATTERY', box: [270, 154, 44, 18], machines: [],
    line: [[292, 158], [300, 150]]},
  {id: 'tie', target: 'knob-tie', label: 'TIE LINE', box: [4, 86, 26, 30], machines: [],
    line: [[0, 92], [18, 98], [34, 104]], toEdge: true},
].map(Object.freeze));

/** Plant building parts (iso cuboids): [x, y, w, d, h, shade] with (x, y) the front-bottom corner. */
export const PLANT_PARTS = Object.freeze({
  coal: [[60, 116, 44, 20, 20], [48, 106, 10, 8, 16], [52, 84, 4, 4, 30, 'stack'], [68, 82, 4, 4, 30, 'stack'], [84, 80, 4, 4, 30, 'stack'], [100, 78, 4, 4, 30, 'stack']],
  ccgt: [[140, 136, 18, 12, 12], [164, 134, 18, 12, 12], [150, 126, 3, 3, 16, 'stack'], [174, 124, 3, 3, 16, 'stack']],
  gta: [[30, 154, 14, 10, 8], [42, 146, 3, 3, 12, 'stack']],
  gtb: [[70, 158, 12, 10, 8], [86, 158, 12, 10, 8], [76, 150, 3, 3, 11, 'stack'], [92, 150, 3, 3, 11, 'stack']],
  gtc: [[126, 170, 12, 8, 7], [142, 170, 12, 8, 7], [132, 162, 2, 2, 10, 'stack'], [148, 162, 2, 2, 10, 'stack']],
  hydro: [[520, 104, 36, 10, 10], [512, 86, 44, 6, 10, 'dam']],
  battery: [[274, 170, 10, 6, 5], [286, 170, 10, 6, 5], [298, 170, 10, 6, 5]],
  tie: [[12, 112, 12, 10, 10]],
  solar: [],
  wind: [],
});

/** Wind turbine towers [x, y] (base of the mast) and solar panel rows. */
export const WIND_TURBINES = Object.freeze([[598, 76], [612, 72], [626, 68], [600, 94], [614, 90], [628, 86], [604, 112], [618, 108]]);
export const TURBINE_H = 18;
export const SOLAR_ROWS = Object.freeze([[498, 134], [506, 140], [514, 146], [522, 152], [530, 158]]);
export const SOLAR_ROW_W = 54;
/** The lake (hydro storage) polygon and the bay. */
export const LAKE = Object.freeze([[504, 70], [538, 54], [582, 64], [566, 78], [520, 80]]);
export const BAY = Object.freeze([[420, 176], [462, 152], [492, 164], [492, 176]]);
export const SUBSTATION = Object.freeze([300, 106]);

// ------------------------------------------------------------------ pure helpers

/** Iso cuboid bounds: {x, y, w, h} of the whole drawn box and {fx, fy, fw, fh} of its footprint. */
export function cuboidBounds(x, y, w, d, h) {
  const left = x - d, right = x + w, top = y - (w + d) / 2 - h, bottom = y;
  return {x: left, y: top, w: right - left, h: bottom - top, fx: left, fy: y - (w + d) / 2, fw: right - left, fh: (w + d) / 2};
}

/** Deterministic hash in [0, 1) (layout only: the city looks the same every day). */
export function hash01(str, k = 0) {
  let h = 0x811c9dc5 ^ k;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

const STYLE = {
  cbd: {n: 3, hMin: 12, hMax: 26, wMin: 5, wMax: 7},
  old: {n: 4, hMin: 3, hMax: 6, wMin: 4, wMax: 6},
  leafy: {n: 3, hMin: 3, hMax: 5, wMin: 5, wMax: 7},
  estate: {n: 4, hMin: 2, hMax: 4, wMin: 4, wMax: 6},
  flats: {n: 4, hMin: 4, hMax: 9, wMin: 4, wMax: 6},
  coast: {n: 3, hMin: 3, hMax: 6, wMin: 4, wMax: 6},
};

/**
 * District blocks for obs.districts (grouped by suburb, in list order): each district gets
 * one cell of its suburb's box and a few buildings in it (deterministic from its id).
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
    const cw = bw / cols, ch = bh / rows;
    ds.forEach((d, i) => {
      const cx = bx + (i % cols) * cw, cy = by + Math.floor(i / cols) * ch;
      const buildings = [];
      for (let b = 0; b < st.n; b++) {
        const w = Math.round(st.wMin + hash01(d.id, b * 7 + 1) * (st.wMax - st.wMin));
        const dd = Math.max(3, Math.round(w * 0.7));
        const h = Math.round(st.hMin + hash01(d.id, b * 7 + 2) * (st.hMax - st.hMin));
        // front-bottom corner inside the cell, leaving the cuboid's back edge in the cell too
        const fx = cx + dd + 1 + ((b % 2) * (cw - w - dd - 2) / 1) * (0.2 + 0.6 * hash01(d.id, b * 7 + 3));
        const fy = cy + (w + dd) / 2 + 1 + (Math.floor(b / 2) + 0.5) * Math.max(0, ch - (w + dd) / 2 - 2) / Math.ceil(st.n / 2);
        buildings.push({x: Math.round(Math.min(fx, cx + cw - w - 1)), y: Math.round(Math.min(fy, cy + ch - 1)), w, d: dd, h,
          win: Math.max(1, Math.round(h / 3))});
      }
      buildings.sort((a, c) => a.y - c.y || a.x - c.x);
      out.push({id: d.id, suburb: sb.id, cell: [cx, cy, cw, ch], buildings});
    });
  }
  return out;
}

/**
 * Every drawn building's bounds (plants, turbines, panels, districts) for the G-1 test and
 * hit-testing: [{kind, id, x, y, w, h, fx, fy, fw, fh}].
 */
export function buildingBoxes(districts) {
  const out = [];
  for (const [id, parts] of Object.entries(PLANT_PARTS)) {
    for (const p of parts) out.push(Object.assign({kind: 'plant', id}, cuboidBounds(p[0], p[1], p[2], p[3], p[4])));
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

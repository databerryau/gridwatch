// render/map.js: the greybox isometric city map (desk/README.md §7; SPEC G-1, G-5; G-2 labels
// basics). One screen canvas; the scene is drawn on a fixed BASE_W x BASE_H offscreen canvas
// and blitted at an integer scale (render/mapdata.js scaleFor), letterboxed with the ground and
// sky colours, never sky under the ground. Reads the view model only (vm.obs, vm.mode, vm.hover,
// vm.glow, vm.alarms). Math.random is used for cosmetic smoke only (F-3).
//
//   const map = createMap(document, root, actions);   // root: the #map box
//   map.update(vm);                                   // every frame
//
// What it shows: every station's buildings (coal 4 stacks, CCGT 2, GT·A, GT·B 2, GT·C 2, hydro
// 3 machines under the dam, the battery, the tie line running off the west edge, the wind farm,
// the solar farm), transmission lines to the city substation, the six suburbs built from the
// 32 districts in obs.districts. Windows light with night and demand; a shed district goes dark
// block by block (G-5) and relights the same way on restore; a tripped machine smokes and
// strobes red while locked out and its rotor spins down; rotors slow in the watch. Labels
// appear on hover, on vm.hover and on alarms only (at most 3 at rest, G-2). Hovering a plant
// sends actions.ui({do: 'hover', target: <its control id>}).

import {V} from '../sim/params.js';
import {BASE_W, BASE_H, HORIZON_Y, COLOURS, UI, GROUND, SKY, SUBURBS, PLANTS, PLANT_PARTS, WIND_TURBINES, TURBINE_H,
  SOLAR_ROWS, SOLAR_ROW_W, LAKE, BAY, SUBSTATION, districtBlocks, hash01, scaleFor} from './mapdata.js';

export const MAX_REST_LABELS = 3;
const BLOCK_MS = 90;          // G-5: one block goes dark (or relights) every 90 ms
const STROBE_MS = 500;
const SUNRISE_H = 6.3, SUNSET_H = 18.8; // G-3 later; 18:48 is sunset (spec G-3 accept)
const LABEL_FONT = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
const ROOF = {old: '#b08a6e', cbd: '#8a98a8', leafy: '#9aa58a', estate: '#c9b89a', flats: '#a28f82', coast: '#c2c7cc'};

/** 0 at night, 1 at midday, easing through dawn and dusk (hour of day). */
export function sunAmount(h) {
  if (h < SUNRISE_H - 1 || h > SUNSET_H + 1) return 0;
  if (h < SUNRISE_H + 1) return (h - (SUNRISE_H - 1)) / 2;
  if (h > SUNSET_H - 1) return (SUNSET_H + 1 - h) / 2;
  return 1;
}

function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(c, f) { const [r, g, b] = hexRgb(c); return 'rgb(' + Math.min(255, r * f | 0) + ',' + Math.min(255, g * f | 0) + ',' + Math.min(255, b * f | 0) + ')'; }
function mix(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return 'rgb(' + (x[0] + (y[0] - x[0]) * t | 0) + ',' + (x[1] + (y[1] - x[1]) * t | 0) + ',' + (x[2] + (y[2] - x[2]) * t | 0) + ')'; }

/** Iso cuboid with (x, y) its front-bottom corner; colours [top, left, right]. */
function cub(g, x, y, w, d, h, c) {
  const rX = x + w, rY = y - w / 2, lX = x - d, lY = y - d / 2, bX = x + w - d, bY = y - (w + d) / 2;
  g.fillStyle = c[1]; g.beginPath(); g.moveTo(x, y); g.lineTo(lX, lY); g.lineTo(lX, lY - h); g.lineTo(x, y - h); g.fill();
  g.fillStyle = c[2]; g.beginPath(); g.moveTo(x, y); g.lineTo(rX, rY); g.lineTo(rX, rY - h); g.lineTo(x, y - h); g.fill();
  g.fillStyle = c[0]; g.beginPath(); g.moveTo(x, y - h); g.lineTo(rX, rY - h); g.lineTo(bX, bY - h); g.lineTo(lX, lY - h); g.fill();
}
const tones = c => [shade(c, 1.15), shade(c, 0.85), shade(c, 0.65)];
const ROOF_LIT = Object.fromEntries(Object.entries(ROOF).map(([k, c]) => [k, tones(c)]));
const ROOF_DARK = Object.fromEntries(Object.entries(ROOF).map(([k, c]) => [k, [shade(c, 0.42), shade(c, 0.32), shade(c, 0.24)]]));

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
 * @param {Document} doc
 * @param {Element} root the map box (#map)
 * @param {{ui: function}} actions desk/README §4
 */
export function createMap(doc, root, actions) {
  const el = doc.createElement('div');
  el.className = 'citymap';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Map of the city and its power stations');
  el.style.position = 'relative'; el.style.width = '100%'; el.style.height = '100%'; el.style.overflow = 'hidden';
  const cv = doc.createElement('canvas');
  cv.className = 'citymap-canvas';
  cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%';
  el.appendChild(cv);
  root.appendChild(el);
  const frame = doc.createElement('canvas'); frame.width = BASE_W; frame.height = BASE_H;
  const stat = doc.createElement('canvas'); stat.width = BASE_W; stat.height = BASE_H;
  const g = frame.getContext('2d'), sg = stat.getContext('2d');

  let vm = null, blocks = null, blocksKey = '', statKey = '', layout = null, hoverId = null, sentTarget = null;
  let lastMs = 0, drawMs = 0, labels = [];
  const darkState = new Map();   // district id -> {dark, sinceMs}
  const rotor = new Map();       // machine id / 'wT<i>' -> {a, v}
  const smoke = [];
  const debug = {districts: {}, scale: 0, layout: null, draws: 0};

  // ------------------------------------------------------------ static layer (per light bucket)

  function drawStatic(sun) {
    const G = sg;
    G.globalCompositeOperation = 'source-over';
    // sky above the horizon (only ever above the ground)
    G.fillStyle = mix('#1a2440', SKY, sun); G.fillRect(0, 0, BASE_W, HORIZON_Y);
    G.fillStyle = mix('#2a3350', '#a9c9e6', sun); G.fillRect(0, HORIZON_Y - 6, BASE_W, 6);
    // distant hills on the horizon, then the ground to every edge
    G.fillStyle = mix('#23321f', '#5e7f55', sun);
    G.beginPath(); G.moveTo(0, HORIZON_Y);
    for (let x = 0; x <= BASE_W; x += 20) G.lineTo(x, HORIZON_Y - 3 - 3 * hash01('hill', x));
    G.lineTo(BASE_W, HORIZON_Y); G.closePath(); G.fill();
    G.fillStyle = mix('#1f3320', GROUND, sun); G.fillRect(0, HORIZON_Y, BASE_W, BASE_H - HORIZON_Y);
    // iso tile checker
    G.fillStyle = 'rgba(0,0,0,0.06)';
    for (let j = 0; j < 20; j++) for (let i = 0; i < 40; i++) {
      if ((i + j) % 2) continue;
      const x = i * 16 + (j % 2) * 8, y = HORIZON_Y + 4 + j * 7;
      G.beginPath(); G.moveTo(x, y); G.lineTo(x + 8, y + 4); G.lineTo(x, y + 8); G.lineTo(x - 8, y + 4); G.fill();
    }
    // the ridge (hydro, wind) and the lake
    G.fillStyle = mix('#2c3a26', '#6f8a5c', sun);
    G.beginPath(); G.moveTo(480, 120); G.lineTo(500, 56); G.lineTo(560, 48); G.lineTo(640, 52); G.lineTo(640, 124); G.closePath(); G.fill();
    G.fillStyle = mix('#18314f', '#3a7bbf', sun);
    G.beginPath(); LAKE.forEach(([x, y], i) => G[i ? 'lineTo' : 'moveTo'](x, y)); G.closePath(); G.fill();
    // the bay
    G.beginPath(); BAY.forEach(([x, y], i) => G[i ? 'lineTo' : 'moveTo'](x, y)); G.closePath(); G.fill();
    // river from the dam to the bay
    G.strokeStyle = mix('#18314f', '#3a7bbf', sun); G.lineWidth = 2;
    G.beginPath(); G.moveTo(532, 108); G.quadraticCurveTo(500, 150, 470, 166); G.stroke();
    // roads
    G.strokeStyle = mix('#3a3a36', '#8a857a', sun); G.lineWidth = 2;
    G.beginPath(); G.moveTo(200, 108); G.lineTo(470, 108); G.moveTo(298, 60); G.lineTo(298, 172); G.stroke();
    // transmission lines + pylons (G-1: the tie runs to the west edge)
    for (const p of PLANTS) {
      G.strokeStyle = 'rgba(20,24,28,0.75)'; G.lineWidth = 1;
      const pts = p.line.concat(p.toEdge ? [] : [SUBSTATION]);
      G.beginPath();
      pts.forEach(([x, y], i) => G[i ? 'lineTo' : 'moveTo'](x, y - 5));
      G.stroke();
      G.fillStyle = '#2a2f33';
      for (const [x, y] of pts) { G.fillRect(x - 1, y - 6, 1, 6); G.fillRect(x, y - 6, 1, 6); G.fillRect(x - 2, y - 5, 4, 1); }
    }
    cub(G, SUBSTATION[0] + 4, SUBSTATION[1] + 4, 8, 6, 3, tones('#7a8088'));
    // plant bodies
    for (const [id, parts] of Object.entries(PLANT_PARTS)) {
      const c = id === 'coal' ? '#8d8a86' : id === 'hydro' ? '#9aa0a6' : id === 'battery' ? '#d8dde2' : id === 'tie' ? '#8a8fa0' : '#a7a29a';
      for (const p of parts) {
        const col = p[5] === 'stack' ? '#b5b0a8' : p[5] === 'dam' ? '#b9b4aa' : c;
        cub(G, p[0], p[1], p[2], p[3], p[4], tones(col));
        // a coloured band so each plant matches its layer and lever (L-3)
        if (p[5] !== 'dam' && COLOURS[id]) { G.fillStyle = COLOURS[id]; G.fillRect(p[0], p[1] - p[4] + 1, Math.max(1, Math.min(p[2], 3)), 1); }
      }
    }
    // solar rows
    for (const [x, y] of SOLAR_ROWS) {
      G.fillStyle = '#2b3d5c';
      G.beginPath(); G.moveTo(x, y); G.lineTo(x + SOLAR_ROW_W, y - SOLAR_ROW_W / 2); G.lineTo(x + SOLAR_ROW_W, y - SOLAR_ROW_W / 2 - 3); G.lineTo(x, y - 3); G.fill();
    }
    // turbine masts
    for (const [x, y] of WIND_TURBINES) { G.fillStyle = '#e4e7ea'; G.fillRect(x, y - TURBINE_H, 1, TURBINE_H); }
  }

  // ------------------------------------------------------------ dynamic layer

  /** City blocks; returns the lit windows to draw after the night tint. */
  function districtsFrame(obs, nowMs, night, demandFrac) {
    const lit = 0.25 + 0.7 * demandFrac, wins = [];
    debug.districts = {};
    for (const blk of blocks) {
      const d = obs.districts.find(q => q.id === blk.id);
      const dark = !!(d && d.dark);
      let st = darkState.get(blk.id);
      if (!st) { st = {dark, sinceMs: -1e9}; darkState.set(blk.id, st); }
      if (st.dark !== dark) { st.dark = dark; st.sinceMs = nowMs; }
      const style = SUBURBS.find(q => q.id === blk.suburb).style;
      let darkBlocks = 0, windows = 0;
      blk.buildings.forEach((b, i) => {
        const done = nowMs - st.sinceMs >= i * BLOCK_MS;
        const off = dark ? done : !done && st.sinceMs > 0;
        if (off) darkBlocks++;
        cub(g, b.x, b.y, b.w, b.d, b.h, off ? ROOF_DARK[style] : ROOF_LIT[style]);
        if (off) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(b.x - 1, b.y - 1, 2, 1); return; }
        if (night > 0.05) {
          for (let wv = 0; wv < b.win; wv++) for (let wx = 0; wx < 2; wx++) {
            if (hash01(blk.id, i * 31 + wv * 5 + wx) > lit) continue;
            wins.push(b.x + 1 + wx * 2, b.y - 2 - wv * 3 - (wx + 1));
            windows++;
          }
        }
      });
      debug.districts[blk.id] = {dark, darkBlocks, windows, blocks: blk.buildings.length, roof: darkBlocks ? ROOF_DARK[style][0] : ROOF_LIT[style][0]};
    }
    return wins;
  }

  function freqFactor(vm2) {
    const f = Number.isFinite(vm2.obs.f) ? vm2.obs.f : 50;
    const watch = vm2.mode && (vm2.mode.locked || vm2.mode.mode === 'WATCH');
    return Math.max(0.15, Math.min(1.2, 1 - (50 - f) * 1.2)) * (watch ? 0.35 : 1);
  }

  function spin(id, target, dt) {
    let r = rotor.get(id);
    if (!r) { r = {a: hash01(id) * 6.28, v: target}; rotor.set(id, r); }
    r.v += (target - r.v) * Math.min(1, dt / 1.5); // spin-down / spin-up over ~1.5 s
    r.a += r.v * dt * 6;
    return r;
  }

  function plantsFrame(obs, nowMs, dt, ff) {
    const strobeOn = Math.floor(nowMs / STROBE_MS) % 2 === 0;
    const tripped = [];
    for (const p of PLANTS) {
      if (!p.machines.length) continue;
      const stacks = (PLANT_PARTS[p.id] || []).filter(q => q[5] === 'stack');
      p.machines.forEach((mc, j) => {
        const u = obs.units.find(q => q.id === mc.unit);
        if (!u) return;
        const st = stacks[j];
        const top = st ? {x: st[0] + (st[2] - st[3]) / 2, y: st[1] - (st[2] + st[3]) / 2 - st[4]} : {x: mc.x, y: mc.y};
        // rotor glyph on the hall: spins with the machine, spins down after a trip (G-5)
        const r = spin(mc.unit, u.sync ? ff : 0, dt);
        const rx = mc.x, ry = st ? st[1] - 4 : mc.y;
        const cx = Math.cos(r.a) * 2, sy = Math.sin(r.a) * 1;
        g.strokeStyle = u.sync ? '#e6edf3' : '#5a6068'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(rx - cx, ry - sy); g.lineTo(rx + cx, ry + sy); g.moveTo(rx + sy * 2, ry - cx / 2); g.lineTo(rx - sy * 2, ry + cx / 2); g.stroke();
        if (u.mode === 'tripped') {
          tripped.push({x: top.x, y: top.y, on: strobeOn});
          if (smoke.length < 160 && Math.random() < 0.5) smoke.push({x: top.x + Math.random(), y: top.y, vx: 0.8 + Math.random() * 0.6, vy: -1.2 - Math.random(), life: 1, black: true});
        } else if (u.sync && (p.id === 'coal' || p.id === 'ccgt') && st && smoke.length < 160 && Math.random() < 0.15 * (u.outMW / u.ratingMW)) {
          smoke.push({x: top.x, y: top.y, vx: 0.6 + Math.random() * 0.4, vy: -0.8 - Math.random() * 0.5, life: 0.7, black: false});
        }
      });
    }
    // wind rotors
    const wf = Math.max(0.05, obs.wind.outMW / V.WIND_MW);
    WIND_TURBINES.forEach(([x, y], i) => {
      const r = spin('wT' + i, wf * ff * 1.6, dt), hy = y - TURBINE_H;
      g.strokeStyle = '#eef1f4'; g.lineWidth = 1;
      g.beginPath();
      for (let b = 0; b < 3; b++) { const a = r.a + b * 2.094; g.moveTo(x + 0.5, hy); g.lineTo(x + 0.5 + Math.cos(a) * 6, hy + Math.sin(a) * 6); }
      g.stroke();
    });
    // solar output: panel sheen with output
    const sf = Math.max(0, Math.min(1, obs.solar.outMW / V.SOLAR_MW));
    if (sf > 0.02) {
      g.fillStyle = 'rgba(160,200,255,' + (0.15 + 0.5 * sf).toFixed(2) + ')';
      for (const [x, y] of SOLAR_ROWS) { g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + SOLAR_ROW_W, y - SOLAR_ROW_W / 2 - 2); g.lineTo(x + SOLAR_ROW_W, y - SOLAR_ROW_W / 2 - 3); g.lineTo(x, y - 3); g.fill(); }
    }
    // smoke / steam (cosmetic)
    for (let i = smoke.length - 1; i >= 0; i--) {
      const q = smoke[i];
      q.x += q.vx * dt * 6; q.y += q.vy * dt * 6; q.life -= dt * (q.black ? 0.35 : 0.6);
      if (q.life <= 0 || q.y < 0) { smoke.splice(i, 1); continue; }
      g.fillStyle = q.black ? 'rgba(30,30,30,' + (0.7 * q.life).toFixed(2) + ')' : 'rgba(235,238,240,' + (0.35 * q.life).toFixed(2) + ')';
      const sz = q.black ? 3 - q.life * 1.5 : 2;
      g.fillRect(q.x, q.y, sz, sz);
    }
    return tripped;
  }

  function emissive(obs, tripped, night, nowMs) {
    // red strobes on tripped machines (whole lockout, G-5)
    for (const t of tripped) if (t.on) { g.fillStyle = UI.red; g.fillRect(t.x - 1, t.y - 3, 3, 3); g.fillStyle = 'rgba(248,81,73,0.35)'; g.fillRect(t.x - 3, t.y - 5, 7, 7); }
    // tie line lamp, battery lamps
    if (obs.tie.tripped && Math.floor(nowMs / STROBE_MS) % 2 === 0) { g.fillStyle = UI.red; g.fillRect(16, 90, 3, 3); }
    const bo = obs.battery.outMW;
    g.fillStyle = bo > 5 ? UI.amber : bo < -5 ? UI.green : '#6e7781';
    for (let i = 0; i < 3; i++) g.fillRect(276 + i * 12, 160, 2, 1);
    // aircraft warning lamps on the stacks at night
    if (night > 0.3 && Math.floor(nowMs / 1000) % 2 === 0) {
      g.fillStyle = '#ff5a4a';
      for (const p of (PLANT_PARTS.coal || [])) if (p[5] === 'stack') g.fillRect(p[0] + 1, p[1] - (p[2] + p[3]) / 2 - p[4], 1, 1);
    }
  }

  // ------------------------------------------------------------ screen

  function prepare() {
    const dpr = globalThis.devicePixelRatio || 1;
    const cw = Math.max(1, el.clientWidth || root.clientWidth || 1280), ch = Math.max(1, el.clientHeight || root.clientHeight || 268);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {ctx, cw, ch};
  }

  const toScreen = (x, y) => ({x: layout.dx + x * layout.scale, y: layout.dy + (y - layout.srcY) * layout.scale});

  function ring(ctx, box, col, lw) {
    const a = toScreen(box[0], box[1]), b = toScreen(box[0] + box[2], box[1] + box[3]), L = 8;
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [x, y, sx, sy] of [[a.x, a.y, 1, 1], [b.x, a.y, -1, 1], [a.x, b.y, 1, -1], [b.x, b.y, -1, -1]]) {
      ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L);
    }
    ctx.stroke();
  }

  function boxOf(id) {
    const p = PLANTS.find(q => q.id === id);
    if (p) return p.box;
    const sb = SUBURBS.find(q => 'sub:' + q.id === id);
    return sb ? sb.box : null;
  }

  function draw() {
    const t0 = globalThis.performance ? performance.now() : Date.now();
    const obs = vm.obs;
    const nowMs = (vm.frame && vm.frame.nowMs) || lastMs + 16;
    const dt = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
    lastMs = nowMs;
    const bk = obs.districts.map(d => d.id + d.suburb).join();
    if (bk !== blocksKey) { blocks = districtBlocks(obs.districts); blocksKey = bk; }
    const h = obs.clock ? obs.clock.h : 12;
    const sun = sunAmount(h), night = 1 - sun;
    const sk = String(Math.round(sun * 12));
    if (sk !== statKey) { drawStatic(sun); statKey = sk; }
    g.globalCompositeOperation = 'source-over';
    g.drawImage(stat, 0, 0);
    const demandFrac = Math.max(0, Math.min(1, (obs.demand ? obs.demand.nowMW : 5000) / 8000));
    const ff = freqFactor(vm);
    const wins = districtsFrame(obs, nowMs, night, demandFrac);
    const tripped = plantsFrame(obs, nowMs, dt, ff);
    // night: dim the scene, then draw what glows on top (windows, strobes, lamps)
    if (night > 0.02) { g.fillStyle = 'rgba(8,12,30,' + (0.55 * night).toFixed(3) + ')'; g.fillRect(0, 0, BASE_W, BASE_H); }
    if (wins.length) {
      g.fillStyle = 'rgba(255,214,120,' + (0.55 + 0.45 * night).toFixed(2) + ')';
      for (let i = 0; i < wins.length; i += 2) g.fillRect(wins[i], wins[i + 1], 1, 1);
    }
    emissive(obs, tripped, night, nowMs);
    // blit at an integer scale (G-1)
    const {ctx, cw, ch} = prepare();
    layout = scaleFor(cw, ch);
    debug.scale = layout.scale; debug.layout = layout;
    ctx.imageSmoothingEnabled = false;
    const horizonScreen = layout.dy + (HORIZON_Y - layout.srcY) * layout.scale;
    ctx.fillStyle = mix('#1a2440', SKY, sun); ctx.fillRect(0, 0, cw, Math.max(0, Math.min(ch, horizonScreen)));
    ctx.fillStyle = mix('#1f3320', GROUND, sun); ctx.fillRect(0, Math.max(0, horizonScreen), cw, Math.max(0, ch - Math.max(0, horizonScreen)));
    ctx.drawImage(frame, 0, layout.srcY, BASE_W, layout.shownH, layout.dx, layout.dy, layout.drawW, layout.drawH);
    if (night > 0.02 && (layout.dx > 0 || layout.dy > 0)) { // letterbox gets the same night tint
      ctx.fillStyle = 'rgba(8,12,30,' + (0.55 * night).toFixed(3) + ')';
      if (layout.dx > 0) { ctx.fillRect(0, 0, layout.dx, ch); ctx.fillRect(layout.dx + layout.drawW, 0, cw, ch); }
      if (layout.dy > 0) { ctx.fillRect(0, 0, cw, layout.dy); ctx.fillRect(0, layout.dy + layout.drawH, cw, ch); }
    }
    // overlay: glow rings (L-9 / K-16), hover rings, labels (G-2)
    const glowIds = vm.glow && typeof vm.glow.has === 'function' ? vm.glow : new Set();
    for (const p of PLANTS) {
      const lit = (p.target && glowIds.has(p.target)) || p.machines.some(mc => glowIds.has('guard-start-' + mc.unit));
      if (lit) ring(ctx, p.box, 'rgba(210,153,34,' + (0.6 + 0.4 * Math.abs(Math.sin(nowMs / 300))).toFixed(2) + ')', 2);
      if ((vm.hover && p.target === vm.hover) || hoverId === p.id) ring(ctx, p.box, UI.bright, 1.5);
    }
    labels = mapLabels(vm, hoverId);
    ctx.font = LABEL_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const L of labels) {
      const box = boxOf(L.id);
      if (!box) continue;
      const a = toScreen(box[0] + box[2] / 2, box[1]);
      const w = ctx.measureText(L.text).width + 8;
      const x = Math.max(w / 2, Math.min(cw - w / 2, a.x)), y = Math.max(16, a.y);
      ctx.fillStyle = L.kind === 'alarm' ? 'rgba(90,20,20,0.85)' : 'rgba(13,17,23,0.8)';
      ctx.fillRect(x - w / 2, y - 14, w, 14);
      ctx.fillStyle = L.kind === 'alarm' ? '#ffd1cc' : UI.bright;
      ctx.fillText(L.text, x, y - 2);
    }
    debug.draws++;
    drawMs = (globalThis.performance ? performance.now() : Date.now()) - t0;
  }

  // ------------------------------------------------------------ pointer (hover, G-2)

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
    hoverId = id;
    const p = PLANTS.find(q => q.id === id);
    const target = p && p.target ? p.target : null;
    if (target !== sentTarget) { sentTarget = target; actions.ui({do: 'hover', target}); }
    cv.style.cursor = id ? 'pointer' : 'default';
  }

  cv.addEventListener('pointermove', ev => setHover(pick(baseAt(ev))));
  cv.addEventListener('pointerleave', () => setHover(null));

  function update(v) {
    vm = v;
    draw();
  }

  return {
    update, el,
    /** Test / perf hooks (not part of the contract). */
    debug: Object.defineProperties(debug, {
      labels: {get: () => labels}, drawMs: {get: () => drawMs}, hoverId: {get: () => hoverId}, blocks: {get: () => blocks},
      pick: {value: (x, y) => pick({x, y})}, rotorSpeed: {value: id => (rotor.get(id) || {v: 0}).v},
    }),
  };
}

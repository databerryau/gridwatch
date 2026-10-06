// render/livestack.js: the Live Stack (desk/README.md §7; SPEC §4.4, L-1..L-9, K-18).
// A desk screen: the next 4.5 h as a skyline of forecast demand (P50 + LIKELY RANGE band) on
// a fixed 0-9,000 MW axis, each source a coloured layer in P-6 cost order, red/amber gaps,
// ghosts for off units from their earliest-start line, and drag handles that write the plan
// (planKey / planStart / planDel / planUnbook through actions.input). Reads the view model
// only; the plan maths is app/planview.js.
//
//   const stack = createLiveStack(document, root, actions);   // once
//   stack.update(vm);                                         // every frame, after the ticks
//
// View-model inputs: vm.obs (with obs.plan), vm.mode.locked (read-only during the watch, L-7),
// vm.stackExpanded (L-4 overlay over the map), vm.hover / vm.glow (cross-highlight, L-9),
// vm.hist (past columns: {demand: [{s, mw}], rooftop: [{s, mw}], stations: {<layer id>: [{s, mw}]}},
// layer ids = station ids + wind, solar, tie (signed), battery (signed), rert, dr; absent: no past
// drawn; app/game.js sends column means with colFromS / colS instead: planview.pastFromHist reads both).
//
// Phase 2a, the belly (desk/README.md §21.5; shown always until the first-shift face of L-2, 2e):
//   L-2  the silhouette: a faint line at operational + rooftop above the operational skyline,
//        past columns included, and the rooftop bite between the two hatched sun-yellow (sparse
//        "\\\", no fill), with the word ROOFTOP in the big layout. Nothing is drawn while the
//        rooftop is under 1 MW (night; the CLASSIC scenario).
//   C-11 blue SURPLUS columns where proj.surplusMW > SURPLUS_MIN_MW (planview.blueRuns): what
//        will be spilled, standing on the demand line (over exports and charging) with a minimum
//        height, GAP_MARK.blue's pattern, glyph and word, and a hover line that says what to do.
//        Blue is never a kind in proj.gap.
//   P-9  the price through format.priceText; a negative price in its own colour, with the word SPILL
//        while power is being spilled now (wind.autoMW + solar.autoMW > SURPLUS_MIN_MW).
//
// Pointer: drag a key handle or a layer's top edge (a new key there) to (time, MW); drag an off
// unit's ghost sideways to book its START; drag a booked start below the axis to unbook it.
// Drops snap to 15 min / 50 MW; an infeasible drop shows the earliest-arrival ghost instead
// (click it or press Enter to take it); a click with no drag says what to drag. Keyboard (stack focused): 1-6 select COAL, CCGT, GT·A,
// GT·B, GT·C, HYDRO (again: that station's off-unit ghost), arrows move one snap step, Enter
// drops, Delete removes the selected key, Esc clears, L expands. The element listens for its
// own keys and stops them, so the handle needs no key() for the shell to forward (§13.3).
//
// K-22 (status is never colour only): a red gap (short of P50) is hatched "\\\" and carries a
// "!" over each run; an amber gap (inside the likely range) is hatched "///" and carries a "~";
// a blue surplus is barred "|||" and carries a "+" and, where the run is wide enough, the word
// SURPLUS (GAP_MARK). K-23: the canvas has role="img" and an aria-label saying what the picture
// says (stackSummary: the gaps, then the surplus runs and the rooftop), refreshed at most once
// per real second.

import {V} from '../sim/params.js';
import * as PV from '../app/planview.js';
import {COLOURS, UI} from './mapdata.js';
import {clockText, mw as fmtMW, priceText} from './format.js';

export const AXIS_MAX_MW = 9000;
export const HIT_PX = 24;
const SIDS = V.STATION_IDS;
const STEP = PV.COL_S;
const RECOMPUTE_S = 30;
const GHOST_MS = 6000, MSG_MS = 4000;
/** Grid seconds between redraws of an idle stack (the now line moves under 0.3 px in that at the floor; F-11). */
const NOW_STEP_S = 15;
const FLOOR_FONT = '9px system-ui, -apple-system, "Segoe UI", sans-serif';
const BIG_FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
/** C-11: a blue column is drawn at least this tall (a 60-MW spill is under 1 px of the 9,000-MW axis at the floor). */
export const SURPLUS_MIN_PX = 4;
/** L-2: rooftop under this many MW is not drawn (night; the CLASSIC scenario has none). */
const ROOF_MIN_MW = 1;
const ROOF_HATCH_PX = 9;
const ROOF_HATCH = 'rgba(241,211,92,0.32)', SILHOUETTE = 'rgba(230,237,243,0.5)';
const NAMES = {coal: 'COAL', ccgt: 'CCGT', gta: 'GT·A', gtb: 'GT·B', gtc: 'GT·C', hydro: 'HYDRO', wind: 'WIND', solar: 'SOLAR',
  tie: 'TIE', battery: 'BATTERY', rert: 'DIESEL', dr: 'DR'};

/** K-22: how each gap kind is told apart without colour: hatch direction and a glyph over each run. */
export const GAP_MARK = Object.freeze({
  red: Object.freeze({hatch: 'back', glyph: '!', word: 'SHORT'}),
  amber: Object.freeze({hatch: 'forward', glyph: '~', word: 'TIGHT'}),
  blue: Object.freeze({hatch: 'bars', glyph: '+', word: 'SURPLUS'}), // Phase 2a (C-11): projected spill; its own runs (planview.blueRuns), never a gap kind
});

/** Runs of one gap kind ahead (pure): [{kind, k0, k1, mw}]; mw: the largest shortfall, against P50 (red) or P90 (amber). */
export function gapRuns(proj) {
  const out = [];
  for (let k = 0; k < proj.n; k++) {
    const kind = proj.gap[k];
    if (!kind) continue;
    const r = {kind, k0: k, k1: k, mw: 0};
    for (; k < proj.n && proj.gap[k] === kind; k++) { r.k1 = k; r.mw = Math.max(r.mw, (kind === 'red' ? proj.p50[k] : proj.p90[k]) - proj.supply[k]); }
    k--;
    out.push(r);
  }
  return out;
}

/**
 * K-23: the stack's text alternative (pure): the clock, supply against the forecast, each gap
 * ahead in words; then (Phase 2a) the surplus runs ahead and what rooftop solar is taking off
 * demand. A projection without surplusMW or rooftop (older fixtures) says neither.
 */
export function stackSummary(proj, obs, locked) {
  const runs = gapRuns(proj), far = proj.n - 1, say = [];
  say.push('Live Stack at ' + clockText(obs.s, false) + ': the plan for the next 4.5 hours.');
  say.push('Planned supply ' + fmtMW(Math.round(proj.supply[0])) + ' MW against a forecast of ' + fmtMW(Math.round(proj.p50[0])) + ' MW; ' +
    fmtMW(Math.round(proj.supply[far])) + ' against ' + fmtMW(Math.round(proj.p50[far])) + ' MW by ' + clockText(proj.times[far], false) + '.');
  for (const r of runs.slice(0, 4)) {
    say.push(GAP_MARK[r.kind].word + ' ' + clockText(proj.times[r.k0] - STEP, false) + ' to ' + clockText(proj.times[r.k1], false) + ', up to ' +
      fmtMW(Math.round(r.mw)) + ' MW ' + (r.kind === 'red' ? 'below the forecast.' : 'below the top of the likely range.'));
  }
  if (!runs.length) say.push('No gaps.');
  if (locked) say.push('Read-only during the watch.');
  for (const r of PV.blueRuns(proj).slice(0, 2)) {
    say.push(GAP_MARK.blue.word + ' ' + clockText(proj.times[r.k0] - STEP, false) + ' to ' + clockText(proj.times[r.k1], false) + ', up to ' +
      fmtMW(Math.round(r.mw)) + ' MW will be spilled.');
  }
  const roof = proj.rooftop;
  if (roof && (roof[0] > ROOF_MIN_MW || roof[far] > ROOF_MIN_MW)) {
    say.push('Rooftop solar meets ' + fmtMW(Math.round(roof[0])) + ' MW of demand now, ' + fmtMW(Math.round(roof[far])) + ' MW by ' + clockText(proj.times[far], false) + '.');
  }
  return say.join(' ');
}

const layerOfControl = id => {
  if (!id) return null;
  if (id.startsWith('guard-start-') || id.startsWith('guard-stop-')) { const u = id.replace(/^guard-(start|stop)-/, ''); const m = V.MACHINES.find(q => q.id === u); return m ? m.station : null; }
  for (const [st, c] of Object.entries(PV.STATION_CONTROL)) if (c === id) return st;
  for (const [st, c] of Object.entries(PV.OTHER_CONTROL)) if (c === id) return st;
  return null;
};

/** Projection cache key: everything project() reads that changes the answer (not the clock). */
function signature(obs) {
  const p = obs.plan || {};
  let s = (p.rev ?? 0) + '|' + (p.madeAtS ?? -1) + '|' + Math.floor(obs.s / RECOMPUTE_S) + '|';
  for (const u of obs.units) s += u.mode[0] + u.mode[1] + ',';
  const b = obs.battery, t = obs.tie, r = obs.rert;
  s += b.mode + b.orderMW + '/' + b.guardMW + '|' + t.setMW + (t.tripped ? 'T' : '') + '|' + (r.armed ? 'A' : '') + (r.standingDown ? 'D' : '') +
    '|' + (obs.dr.activeS > 0 ? 'R' : '') + '|' + obs.wind.limitPct + '/' + obs.solar.limitPct + '|' + (obs.contingencies ? obs.contingencies.length : 0) + '|' + obs.mode;
  return s;
}

/**
 * @param {Document} doc
 * @param {Element} root the stack's box (336x164 at the 1280x600 floor)
 * @param {{input: function, ui: function}} actions desk/README §4
 */
export function createLiveStack(doc, root, actions) {
  const el = doc.createElement('div');
  el.className = 'livestack';
  el.id = 'stack';
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'application');
  el.setAttribute('aria-label', 'Live Stack: the plan for the next 4.5 hours. Keys 1 to 6 select a unit, arrows move, Enter drops, L expands.');
  el.style.position = 'relative';
  const cv = doc.createElement('canvas');
  cv.className = 'livestack-canvas';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Live Stack');
  cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.touchAction = 'none';
  const btn = doc.createElement('button');
  btn.className = 'livestack-expand';
  btn.type = 'button';
  btn.textContent = 'L';
  btn.title = 'Expand the Live Stack over the map (L)';
  btn.setAttribute('aria-pressed', 'false');
  Object.assign(btn.style, {position: 'absolute', right: '0px', top: '0px', minWidth: '24px', minHeight: '24px', font: FLOOR_FONT, padding: '0'});
  const tip = doc.createElement('div');
  tip.className = 'livestack-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  Object.assign(tip.style, {position: 'absolute', pointerEvents: 'none', font: FLOOR_FONT, background: 'rgba(13,17,23,0.92)', color: UI.bright,
    padding: '2px 4px', whiteSpace: 'pre', zIndex: '2', border: '1px solid ' + UI.grid});
  const msg = doc.createElement('div');
  msg.className = 'livestack-msg';
  msg.setAttribute('aria-live', 'polite');
  Object.assign(msg.style, {position: 'absolute', left: '26px', bottom: '12px', font: FLOOR_FONT, color: UI.amber, pointerEvents: 'none'});
  el.append(cv, btn, tip, msg);
  root.appendChild(el);

  let vm = null, proj = null, sig = '', G = null, handles = [], ghosts = [];
  let drag = null, sel = null, pending = null, message = null, hoverLayer = null, hoverGap = null, hoverBlue = null, sentHover = undefined, glowLocal = new Set();
  let expanded = false, drawMs = 0, lastDrop = null, nowMs = 0, curB = null, runs = [], blues = [], ariaAt = -1e9, ariaText = '';
  // gapMarks: one 'kind:hatch:glyph' per red, amber and blue run drawn; rooftop, surplus, price: what Phase 2a drew
  const stats = {draws: 0, skips: 0, recomputes: 0, tear: null, gapMarks: [],
    rooftop: {mw: 0, future: false, past: 0, word: false}, surplus: {cols: 0, minPx: 0, word: 0}, price: {text: '', spill: false}};
  let drawnKey = '';

  // Q-41: kind 'info' help (blue), 'no' a refusal (red), else amber
  const say = (text, kind) => {
    message = text ? {text, until: nowMs + MSG_MS} : null;
    msg.textContent = text || '';
    msg.className = 'livestack-msg' + (text && kind ? ' ' + kind : '');
    msg.style.color = kind === 'info' ? UI.blue : kind === 'no' ? UI.red : UI.amber;
  };
  // the desk's form (desk/util.js unitLabel): 'CCGT 2', but 'GT·A' (one machine)
  const unitName = (st, u) => (NAMES[st] || st) + (V.STATIONS[st] && V.STATIONS[st].machines > 1 ? ' ' + u.replace(/\D/g, '') : '');
  const sayLocked = () => say('Read-only during the watch' + (vm.mode.canSkip ? ' (Esc skips)' : ': watch this one'), 'info');

  function ensureProj() {
    const obs = vm.obs, k = signature(obs);
    if (!proj || k !== sig) { proj = PV.project(obs, {hist: vm.hist}); sig = k; stats.recomputes++; runs = gapRuns(proj); blues = PV.blueRuns(proj); }
    else if (vm.hist) proj.past = PV.pastFromHist(vm.hist, proj.pastTimes);
    return proj;
  }

  // ---------------------------------------------------------------- geometry

  function geometry(W, H) {
    const big = W >= 600;
    const pad = big ? {l: 40, r: 30, t: 20, b: 16} : {l: 22, r: 26, t: 12, b: 10};
    const x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
    const tA = proj.fromS - PV.N_PAST * STEP, tB = proj.times[proj.n - 1];
    const g = {W, H, big, pad, x0, x1, y0, y1, tA, tB,
      x: t => x0 + (t - tA) / (tB - tA) * (x1 - x0),
      t: x => tA + (x - x0) / (x1 - x0) * (tB - tA),
      y: mw => y0 - mw / AXIS_MAX_MW * (y0 - y1),
      mw: y => (y0 - y) / (y0 - y1) * AXIS_MAX_MW};
    g.colW = (x1 - x0) / (PV.N_PAST + proj.n);
    return g;
  }

  /** Cumulative bases: base[layerIndex][k] = MW of the layers below at future column k. */
  function stackBases() {
    const L = proj.layers, n = proj.n, base = [];
    const acc = new Float64Array(n), nowAcc = [];
    let nowSum = 0;
    const edge = PV.nowEdge(vm.obs);
    for (let i = 0; i < L.length; i++) {
      base.push(Float64Array.from(acc));
      nowAcc.push(nowSum);
      for (let k = 0; k < n; k++) acc[k] += L[i].mw[k];
      nowSum += edge[L[i].id] || 0;
    }
    return {base, top: acc, nowAcc, nowTop: nowSum, edge};
  }

  function colOf(t) {
    // future column whose interval holds t (value at its end)
    return Math.max(0, Math.min(proj.n - 1, Math.ceil((t - proj.fromS) / STEP) - 1));
  }

  function layerIndex(id) { return proj.layers.findIndex(L => L.id === id); }

  function buildHandles(B) {
    const obs = vm.obs, out = [], s = obs.s;
    const plan = obs.plan;
    if (plan) {
      for (const p of plan.stations) {
        const li = layerIndex(p.id);
        if (li < 0) continue;
        for (const k of p.keys) {
          if (k.atS < s || k.atS > G.tB) continue;
          const c = colOf(k.atS);
          out.push({kind: 'key', station: p.id, atS: k.atS, mw: k.mw, x: G.x(k.atS), y: G.y(B.base[li][c] + k.mw)});
        }
      }
      for (const e of plan.starts) {
        const m = V.MACHINES.find(q => q.id === e.unit);
        if (!m) continue;
        const onAt = e.atS + m.t1S + V.AUTO_SYNC_S + m.t2S;
        if (onAt > G.tB) continue;
        const li = layerIndex(m.station), c = colOf(Math.max(s, onAt));
        out.push({kind: 'start', unit: e.unit, station: m.station, onAtS: onAt, x: G.x(Math.max(s, onAt)), y: G.y(B.base[li][c] + m.minMW)});
      }
    }
    return out;
  }

  /** Off-unit ghosts (L-4): the first startable unbooked machine of each station, from its earliest-start line. */
  function buildGhosts(B) {
    const obs = vm.obs, out = [];
    const booked = new Set(((obs.plan && obs.plan.starts) || []).map(e => e.unit));
    let lift = 0;
    for (const L of proj.layers) {
      if (L.kind !== 'station') continue;
      const u = obs.units.find(q => q.station === L.id && (q.mode === 'off' || q.mode === 'tripped') && !booked.has(q.id) && Number.isFinite(proj.earliest[q.id]));
      if (!u) continue;
      const at = proj.earliest[u.id];
      if (at > G.tB) continue;
      const m = V.MACHINES.find(q => q.id === u.id);
      const xs = G.x(at), c = colOf(at);
      const yb = G.y(B.top[c] + lift), yt = G.y(B.top[c] + lift + m.minMW);
      lift += m.minMW;
      out.push({kind: 'ghost', unit: u.id, station: L.id, atS: at, x: xs, y: yt, w: G.x1 - xs, h: Math.max(1, yb - yt), yb});
    }
    return out;
  }

  // ---------------------------------------------------------------- drawing

  function prepare() {
    const dpr = globalThis.devicePixelRatio || 1;
    const W = Math.max(60, el.clientWidth || cv.clientWidth), H = Math.max(40, el.clientHeight || cv.clientHeight);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {ctx, W, H};
  }

  function poly(ctx, xs, lo, hi) {
    ctx.beginPath();
    ctx.moveTo(xs[0], hi[0]);
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], hi[i]);
    for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], lo[i]);
    ctx.closePath();
    ctx.fill();
  }

  function hatch(ctx, xa, xb, yt, yb, col) {
    if (!(yb - yt > 1)) return;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = xa - (yb - yt); x < xb; x += 4) {
      const ax = Math.max(xa, x), ay = yb - (ax - x), bx = Math.min(xb, x + (yb - yt)), by = yb - (bx - x);
      if (bx > ax) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
    }
    ctx.stroke();
  }

  /** The other diagonal ("\\\"), so a red gap and an amber gap differ by pattern, not only by colour (K-22). */
  function hatchBack(ctx, xa, xb, yt, yb, col) {
    if (!(yb - yt > 1)) return;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = xa - (yb - yt); x < xb; x += 4) {
      const ax = Math.max(xa, x), ay = yt + (ax - x), bx = Math.min(xb, x + (yb - yt)), by = yt + (bx - x);
      if (bx > ax) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
    }
    ctx.stroke();
  }

  /** Upright bars ("|||") on a 3-px grid: the blue surplus, told from both diagonals by pattern (K-22). */
  function hatchBars(ctx, xa, xb, yt, yb) {
    for (let x = Math.ceil(xa / 3) * 3 + 0.5; x < xb; x += 3) { ctx.moveTo(x, yt); ctx.lineTo(x, yb); }
  }

  /**
   * L-2 (Phase 2a): the silhouette of what the city is using (operational + rooftop, a faint
   * line) above the skyline, and the rooftop bite between the two hatched sun-yellow. Past
   * columns from the history (proj.past.demand + proj.past.rooftop), future ones from the
   * forecast (proj.p50 + proj.rooftop). One clip and one path of hatch lines for the lot.
   */
  function drawRooftop(ctx, xs) {
    const n = proj.n, roof = proj.rooftop, past = proj.past, R = stats.rooftop;
    R.mw = 0; R.future = false; R.past = 0; R.word = false;
    if (!roof) return;
    let top = 0, kTop = 0;
    for (let k = 0; k < n; k++) if (roof[k] > top) { top = roof[k]; kTop = k; }
    const future = top > ROOF_MIN_MW;
    let nPast = 0;
    if (past && past.rooftop) for (let p = 0; p < PV.N_PAST; p++) if (past.rooftop[p] > ROOF_MIN_MW && Number.isFinite(past.demand[p])) nPast++;
    if (!future && !nPast) return;
    R.mw = top; R.future = future; R.past = nPast;
    let yt = Infinity, yb = -Infinity, xa = Infinity, xb = -Infinity;
    ctx.save();
    ctx.beginPath();
    if (nPast) for (let p = 0; p < PV.N_PAST; p++) {
      const r = past.rooftop[p], d = past.demand[p];
      if (!(r > ROOF_MIN_MW) || !Number.isFinite(d)) continue;
      const x0 = G.x(proj.pastTimes[p] - STEP), x1 = G.x(proj.pastTimes[p]), y1 = G.y(d), y0 = G.y(d + r);
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      if (y0 < yt) yt = y0;
      if (y1 > yb) yb = y1;
      if (x0 < xa) xa = x0;
      if (x1 > xb) xb = x1;
    }
    if (future) {
      ctx.moveTo(xs[0], G.y(proj.p50[0] + roof[0]));
      for (let k = 0; k < n; k++) { const y = G.y(proj.p50[k] + roof[k]); ctx.lineTo(xs[k + 1], y); if (y < yt) yt = y; }
      for (let k = n - 1; k >= 0; k--) { const y = G.y(proj.p50[k]); ctx.lineTo(xs[k + 1], y); if (y > yb) yb = y; }
      ctx.lineTo(xs[0], G.y(proj.p50[0]));
      ctx.closePath();
      if (xs[0] < xa) xa = xs[0];
      if (xs[n] > xb) xb = xs[n];
    }
    ctx.clip();
    ctx.strokeStyle = ROOF_HATCH; ctx.lineWidth = 1;
    ctx.beginPath();
    const h = yb - yt;
    for (let x = xa - h; x < xb; x += ROOF_HATCH_PX) { ctx.moveTo(x, yt); ctx.lineTo(x + h, yb); }
    ctx.stroke();
    ctx.restore();
    // the silhouette: steps over the past columns (as the past skyline is), a line ahead
    ctx.strokeStyle = SILHOUETTE; ctx.lineWidth = 1;
    ctx.beginPath();
    if (nPast) for (let p = 0; p < PV.N_PAST; p++) {
      const r = past.rooftop[p], d = past.demand[p];
      if (!(r > ROOF_MIN_MW) || !Number.isFinite(d)) continue;
      const y = G.y(d + r);
      ctx.moveTo(G.x(proj.pastTimes[p] - STEP), y); ctx.lineTo(G.x(proj.pastTimes[p]), y);
    }
    if (future) {
      ctx.moveTo(xs[0], G.y(proj.p50[0] + roof[0]));
      for (let k = 0; k < n; k++) ctx.lineTo(xs[k + 1], G.y(proj.p50[k] + roof[k]));
    }
    ctx.stroke();
    // the word, in the big layout, where the bite is deepest
    if (G.big && future) {
      const ya = G.y(proj.p50[kTop] + top), yc = G.y(proj.p50[kTop]);
      if (yc - ya >= 14) {
        const x = Math.max(G.x0 + 32, Math.min(G.x1 - 32, (xs[kTop] + xs[kTop + 1]) / 2)), y = (ya + yc) / 2;
        ctx.fillStyle = 'rgba(13,17,23,0.7)'; ctx.fillRect(x - 28, y - 7, 56, 14);
        ctx.fillStyle = COLOURS.solar; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ROOFTOP', x, y);
        R.word = true;
      }
    }
  }

  /** Top (px) of the blue column at future column k: its MW above the demand line, or SURPLUS_MIN_PX. */
  function surplusTop(k) {
    const base = proj.p50[k] + proj.exports[k] + proj.charging[k];
    return Math.min(G.y(base + proj.surplusMW[k]), G.y(base) - SURPLUS_MIN_PX);
  }

  /**
   * C-11: the blue SURPLUS columns (planview.blueRuns): what will be spilled, standing on the
   * demand line (above the exports and the charging the plan already has). Fill, upright bars,
   * a "+" over each run and the word where the run is wide enough: never colour alone (K-22).
   */
  function drawSurplus(ctx, xs) {
    const S = stats.surplus;
    S.cols = 0; S.minPx = 0; S.word = 0;
    if (!blues.length) return;
    let least = Infinity;
    for (const r of blues) {
      ctx.fillStyle = hoverBlue === r ? 'rgba(88,166,255,0.75)' : 'rgba(88,166,255,0.5)';
      for (let k = r.k0; k <= r.k1; k++) {
        const yb = G.y(proj.p50[k] + proj.exports[k] + proj.charging[k]), yt = surplusTop(k);
        ctx.fillRect(xs[k], yt, Math.max(1, xs[k + 1] - xs[k]), yb - yt);
        if (yb - yt < least) least = yb - yt;
        S.cols++;
      }
    }
    ctx.strokeStyle = 'rgba(13,17,23,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of blues) for (let k = r.k0; k <= r.k1; k++) hatchBars(ctx, xs[k], xs[k + 1], surplusTop(k), G.y(proj.p50[k] + proj.exports[k] + proj.charging[k]));
    ctx.stroke();
    S.minPx = least;
    const m = GAP_MARK.blue, long = m.glyph + ' ' + m.word;
    ctx.fillStyle = '#cfe6ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const r of blues) {
      let yTop = Infinity;
      for (let k = r.k0; k <= r.k1; k++) { const y = surplusTop(k); if (y < yTop) yTop = y; }
      const wide = xs[r.k1 + 1] - xs[r.k0] >= ctx.measureText(long).width + 2;
      ctx.fillText(wide ? long : m.glyph, (xs[r.k0] + xs[r.k1 + 1]) / 2, Math.max(G.y1 + 9, yTop - 1));
      if (wide) S.word++;
      stats.gapMarks.push('blue:' + m.hatch + ':' + m.glyph);
    }
  }

  function draw() {
    const t0 = globalThis.performance ? performance.now() : Date.now();
    const obs = vm.obs;
    ensureProj();
    const {ctx, W, H} = prepare();
    G = geometry(W, H);
    stats.tear = null;
    const B = curB = stackBases();
    handles = buildHandles(B);
    ghosts = buildGhosts(B);
    const n = proj.n, s = obs.s, xNow = G.x(s);
    ctx.font = G.big ? BIG_FONT : FLOOR_FONT;
    ctx.fillStyle = UI.bg;
    ctx.fillRect(0, 0, W, H);
    // axis: fixed 0-9,000 MW (L-1)
    ctx.strokeStyle = UI.grid; ctx.lineWidth = 1; ctx.fillStyle = UI.axis; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.beginPath();
    for (let v = 0; v <= AXIS_MAX_MW; v += 3000) { const y = Math.round(G.y(v)) + 0.5; ctx.moveTo(G.x0, y); ctx.lineTo(G.x1, y); }
    ctx.stroke();
    for (let v = 3000; v <= AXIS_MAX_MW; v += 3000) ctx.fillText(G.big ? fmtMW(v) : v / 1000 + 'k', G.x0 - 2, G.y(v));
    // hour ticks
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const everyH = G.big ? 1 : 2;
    for (let t = Math.ceil(G.tA / 3600) * 3600; t <= G.tB; t += 3600) {
      const hIdx = Math.round((t / 3600 + V.DAY_START_H)) % 24;
      if (hIdx % everyH) continue;
      const x = G.x(t);
      ctx.fillRect(Math.round(x), G.y0, 1, 2);
      ctx.fillText(clockText(t, false), x, G.y0 + 1);
    }
    // future x positions: the now point, then each column end
    const xs = [xNow];
    for (let k = 0; k < n; k++) xs.push(G.x(proj.times[k]));
    // band: LIKELY RANGE (P10-P90, L-2)
    const b10 = [G.y(proj.p10[0])], b90 = [G.y(proj.p90[0])];
    for (let k = 0; k < n; k++) { b10.push(G.y(proj.p10[k])); b90.push(G.y(proj.p90[k])); }
    ctx.fillStyle = UI.band;
    poly(ctx, xs, b10, b90);
    // past columns (from the shell's history)
    drawPast(ctx);
    // layers, bottom up (L-3)
    const hlLayers = highlightLayers();
    const lo = new Array(n + 1), hi = new Array(n + 1);
    const tearSt = tearStation();
    proj.layers.forEach((L, li) => {
      let any = (B.edge[L.id] || 0) > 0.5;
      lo[0] = G.y(B.nowAcc[li]); hi[0] = G.y(B.nowAcc[li] + (B.edge[L.id] || 0));
      for (let k = 0; k < n; k++) { const b = B.base[li][k]; lo[k + 1] = G.y(b); hi[k + 1] = G.y(b + L.mw[k]); if (L.mw[k] > 0.5) any = true; }
      if (!any) return;
      ctx.globalAlpha = hlLayers.size && !hlLayers.has(L.id) ? 0.45 : 0.9;
      ctx.fillStyle = COLOURS[L.id] || UI.axis;
      poly(ctx, xs, lo, hi);
      ctx.globalAlpha = 1;
      if (hlLayers.has(L.id)) {
        ctx.strokeStyle = UI.bright; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xs[0], hi[0]);
        for (let k = 1; k <= n; k++) ctx.lineTo(xs[k], hi[k]);
        ctx.stroke();
      }
      // energy-limited columns striped (L-4: water / battery)
      if (L.limited) for (let k = 0; k < n; k++) if (L.limited[k]) hatch(ctx, xs[k], xs[k + 1], Math.min(hi[k + 1], lo[k + 1] - 3), lo[k + 1], 'rgba(13,17,23,0.7)');
      // curtailment: available wind / solar above the layer, hatched (L-3)
      if (L.availMW) for (let k = 0; k < n; k++) if (L.availMW[k] - L.mw[k] > 20) hatch(ctx, xs[k], xs[k + 1], G.y(B.base[li][k] + L.availMW[k]), hi[k + 1], COLOURS[L.id]);
      if (L.id === tearSt) drawTear(ctx, xs, hi, li);
    });
    // exports and battery charging: extra load above the skyline (L-3)
    drawExtraLoad(ctx, xs);
    // the rooftop bite and the silhouette above the skyline (L-2, Phase 2a)
    drawRooftop(ctx, xs);
    // gaps (L-5): red below P50, amber below P90
    for (let k = 0; k < n; k++) {
      const g = proj.gap[k];
      if (!g) continue;
      const sup = proj.supply[k], top = g === 'red' ? proj.p50[k] : proj.p90[k];
      const ya = G.y(top), yb = G.y(sup);
      ctx.fillStyle = g === 'red' ? (hoverGap && k >= hoverGap.k0 && k <= hoverGap.k1 ? 'rgba(248,81,73,0.95)' : 'rgba(248,81,73,0.75)') : 'rgba(210,153,34,0.55)';
      ctx.fillRect(xs[k], ya, Math.max(1, xs[k + 1] - xs[k]), Math.max(1, yb - ya));
    }
    // K-22: the same gaps by pattern and glyph: red "\\\" with "!", amber "///" with "~"
    stats.gapMarks.length = 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const r of runs) {
      const m = GAP_MARK[r.kind], red = r.kind === 'red';
      let yTop = Infinity;
      for (let k = r.k0; k <= r.k1; k++) {
        const ya = G.y(red ? proj.p50[k] : proj.p90[k]), yb = G.y(proj.supply[k]);
        (red ? hatchBack : hatch)(ctx, xs[k], xs[k + 1], ya, yb, red ? 'rgba(13,17,23,0.75)' : 'rgba(13,17,23,0.5)');
        if (ya < yTop) yTop = ya;
      }
      ctx.fillStyle = red ? '#ffd1cc' : '#f0d58a';
      ctx.fillText(m.glyph, (xs[r.k0] + xs[r.k1 + 1]) / 2, Math.max(G.y1 + 9, yTop - 1));
      stats.gapMarks.push(r.kind + ':' + m.hatch + ':' + m.glyph);
    }
    // C-11: what will be spilled, by fill, bars, glyph and word
    drawSurplus(ctx, xs);
    // skyline: P50 (L-2)
    ctx.strokeStyle = UI.skyline; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xs[0], G.y(proj.p50[0]));
    for (let k = 0; k < n; k++) ctx.lineTo(xs[k + 1], G.y(proj.p50[k]));
    ctx.stroke();
    if (G.big) { ctx.fillStyle = UI.text; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('LIKELY RANGE', G.x1, G.y(proj.p90[n - 1]) - 2); }
    // now line
    ctx.fillStyle = UI.bright; ctx.fillRect(Math.round(xNow), G.y1, 1, G.y0 - G.y1);
    // earliest-start lines and ghosts of off units (L-4)
    ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
    for (const gh of ghosts) {
      ctx.strokeStyle = COLOURS[gh.station];
      const glow = hlLayers.has(gh.station) || (vm.glow && vm.glow.has && vm.glow.has('guard-start-' + gh.unit));
      ctx.globalAlpha = glow ? 1 : 0.7;
      ctx.beginPath(); ctx.moveTo(Math.round(gh.x) + 0.5, G.y1); ctx.lineTo(Math.round(gh.x) + 0.5, G.y0); ctx.stroke();
      ctx.strokeRect(gh.x, gh.y, Math.max(1, gh.w), gh.h);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([]);
    // key and start handles
    for (const h of handles) {
      ctx.fillStyle = COLOURS[h.station]; ctx.strokeStyle = UI.bg; ctx.lineWidth = 1;
      const r = h.kind === 'start' ? 3 : 2.5;
      ctx.fillRect(h.x - r, h.y - r, 2 * r, 2 * r); ctx.strokeRect(h.x - r, h.y - r, 2 * r, 2 * r);
    }
    drawDragAndCursor(ctx);
    // header: title, price (K-18: the market panel moved here), clock
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = UI.text;
    ctx.fillText('LIVE STACK', 2, 1);
    ctx.textAlign = 'right';
    // the price (P-9): a negative one in its own colour, with the word SPILL when power is being
    // spilled now (MIN GEN's input: the dispatch's automatic cut), never for the price alone (the
    // renewables' offer can set a negative price with nothing cut)
    const pm = priceNow(obs), neg = Math.round(pm) < 0, spill = neg && spillingNow(obs);
    const price = Number.isFinite(pm) ? (spill ? 'SPILL ' : '') + priceText(pm) + '/MWh' : '';
    ctx.fillStyle = neg ? UI.blue : pm > 300 ? UI.amber : UI.text;
    ctx.fillText(price, G.x1, 1);
    stats.price.text = price; stats.price.spill = spill;
    if (vm.mode && vm.mode.locked) { ctx.fillStyle = UI.red; ctx.textAlign = 'center'; ctx.fillText('READ-ONLY: WATCH', (G.x0 + G.x1) / 2, 1); }
    if (message && nowMs > message.until) say('');
    if (pending && nowMs > pending.until) pending = null;
    if (nowMs - ariaAt >= 1000 || nowMs < ariaAt) { // the text alternative, at most once per real second (K-23)
      ariaAt = nowMs;
      const text = stackSummary(proj, obs, readOnly());
      if (text !== ariaText) { ariaText = text; cv.setAttribute('aria-label', text); }
    }
    stats.draws++;
    drawMs = (globalThis.performance ? performance.now() : Date.now()) - t0;
  }

  const priceNow = obs => (obs.price && Number.isFinite(obs.price.mwh) ? obs.price.mwh : NaN);
  // power being spilled now: the automatic cut over SURPLUS_MIN_MW (MIN GEN's input; 0 or absent on older views)
  const spillingNow = obs => ((obs.wind && obs.wind.autoMW) || 0) + ((obs.solar && obs.solar.autoMW) || 0) > V.SURPLUS_MIN_MW;

  function drawPast(ctx) {
    const past = proj.past;
    if (!past) return;
    const xsP = [];
    for (let p = 0; p < PV.N_PAST; p++) xsP.push(G.x(proj.pastTimes[p] - STEP));
    xsP.push(G.x(proj.fromS));
    const acc = new Float64Array(PV.N_PAST);
    ctx.globalAlpha = 0.55;
    for (const L of proj.layers) {
      const a = past.layers[L.id];
      if (!a) continue;
      ctx.fillStyle = COLOURS[L.id] || UI.axis;
      for (let p = 0; p < PV.N_PAST; p++) {
        const v = Math.max(0, a[p]);
        if (!Number.isFinite(v) || v <= 0) continue;
        const yb = G.y(acc[p]), yt = G.y(acc[p] + v);
        ctx.fillRect(xsP[p], yt, Math.max(1, xsP[p + 1] - xsP[p]), Math.max(0.5, yb - yt));
        acc[p] += v;
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = UI.skyline; ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let p = 0; p < PV.N_PAST; p++) {
      const d = past.demand[p];
      if (!Number.isFinite(d)) { started = false; continue; }
      const y = G.y(d);
      if (!started) { ctx.moveTo(xsP[p], y); started = true; } else ctx.lineTo(xsP[p], y);
      ctx.lineTo(xsP[p + 1], y);
    }
    ctx.stroke();
  }

  function drawExtraLoad(ctx, xs) {
    const n = proj.n;
    for (const [arr, id] of [[proj.exports, 'tie'], [proj.charging, 'battery']]) {
      let any = false;
      for (let k = 0; k < n; k++) if (arr[k] > 0.5) { any = true; break; }
      if (!any) continue;
      for (let k = 0; k < n; k++) {
        if (!(arr[k] > 0.5)) continue;
        const base = id === 'tie' ? proj.p50[k] : proj.p50[k] + proj.exports[k];
        hatch(ctx, xs[k], xs[k + 1], G.y(base + arr[k]), G.y(base), COLOURS[id]);
      }
    }
  }

  function tearStation() {
    const c = vm.obs.contingency;
    if (!(vm.mode && vm.mode.locked) || !c || c.cause !== 'unit') return null;
    const m = V.MACHINES.find(q => q.id === c.id);
    return m ? m.station : null;
  }

  /** L-7: the tripped machine's slice tears off the top of its layer and drifts away through the watch. */
  function drawTear(ctx, xs, hi, li) {
    const c = vm.obs.contingency, w = Math.max(0, vm.mode.watchS || 0);
    stats.tear = proj.layers[li].id;
    const lost = Math.abs(c.lostMW), drift = 3 + w * (G.big ? 6 : 3), fade = Math.max(0.15, 1 - w / 30);
    ctx.globalAlpha = fade;
    ctx.fillStyle = COLOURS[proj.layers[li].id];
    ctx.strokeStyle = UI.red; ctx.lineWidth = 1;
    const th = lost / AXIS_MAX_MW * (G.y0 - G.y1);
    ctx.beginPath();
    for (let k = 0; k < xs.length; k++) { const j = (k % 2 ? 2 : -1) * (G.big ? 2 : 1); ctx[k ? 'lineTo' : 'moveTo'](xs[k], hi[k] - drift + j); }
    for (let k = xs.length - 1; k >= 0; k--) { const j = (k % 3 ? 1 : -2) * (G.big ? 2 : 1); ctx.lineTo(xs[k], hi[k] - drift - th + j); }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawDragAndCursor(ctx) {
    const mark = (atS, mw, station, col, dashed) => {
      const li = layerIndex(station), c = colOf(atS);
      const base = li >= 0 && curB ? curB.base[li][c] : 0;
      const x = G.x(atS), y = G.y(base + mw);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      if (dashed) ctx.setLineDash([3, 2]);
      ctx.strokeRect(x - 4, y - 4, 8, 8);
      ctx.beginPath(); ctx.moveTo(x, G.y1); ctx.lineTo(x, G.y0); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      return {x, y};
    };
    const label = (p, text, col) => {
      ctx.fillStyle = col; ctx.textBaseline = 'bottom';
      ctx.textAlign = p.x > (G.x0 + G.x1) / 2 ? 'right' : 'left';
      ctx.fillText(text, p.x + (ctx.textAlign === 'left' ? 6 : -6), Math.max(G.y1 + 10, p.y - 3));
    };
    const show = (r, col) => {
      if (!r) return;
      if (r.unit) {
        const at = r.infeasible && r.ghost ? r.ghost.onAtS : r.onAtS;
        const m = V.MACHINES.find(q => q.id === r.unit);
        const p = mark(r.onAtS, m.minMW, m.station, col, false);
        label(p, 'START ' + m.name + ' on ' + clockText(r.onAtS, false), col);
        if (r.infeasible && r.ghost) { const q = mark(at, m.minMW, m.station, UI.ghost, true); label(q, 'earliest ' + clockText(at, false), UI.ghost); }
        return;
      }
      const p = mark(r.atS, r.mw, r.station, col, false);
      label(p, NAMES[r.station] + ' ' + r.mw + ' MW by ' + clockText(r.atS, false), col);
      if (r.infeasible && r.ghost) { const q = mark(r.ghost.atS, r.ghost.mw, r.station, UI.ghost, true); label(q, 'earliest ' + clockText(r.ghost.atS, false), UI.ghost); }
    };
    if (drag && drag.preview) show(drag.preview, UI.bright);
    else if (pending) show(pending.result, UI.amber);
    else if (sel) show(sel.preview, UI.bright);
  }

  function highlightLayers() {
    const out = new Set(glowLocal);
    if (vm.hover) { const l = layerOfControl(vm.hover); if (l) out.add(l); }
    if (vm.glow && typeof vm.glow.forEach === 'function') vm.glow.forEach(id => { const l = layerOfControl(id); if (l) out.add(l); });
    if (hoverLayer) out.add(hoverLayer);
    if (sel) out.add(sel.station);
    return out;
  }

  // ---------------------------------------------------------------- pointer

  function local(ev) {
    const r = cv.getBoundingClientRect();
    const W = G ? G.W : r.width, H = G ? G.H : r.height;
    return {x: (ev.clientX - r.left) * W / (r.width || W), y: (ev.clientY - r.top) * H / (r.height || H)};
  }

  /**
   * What is under (x, y): a handle, a ghost, a layer edge, a layer body or a gap; for a hover
   * (forHover) also a blue surplus column or the rooftop bite, which a press never grabs.
   */
  function hitTest(x, y, forHover) {
    if (!G || !proj) return null;
    const half = HIT_PX / 2;
    if (pending && pending.result.ghost) {
      const gg = pending.result.ghost;
      const gx = G.x(pending.result.unit ? gg.onAtS : gg.atS);
      if (Math.abs(x - gx) <= half) return {kind: 'pending'};
    }
    const ahead = !(x < G.x(vm.obs.s) - 2 || x > G.x1 + 2);
    // A hover inside a blue column says what will be spilled (C-11), whatever lies under it: the
    // column stands on the top of the stack, where the top layer's key handles and its edge are.
    // A press there still takes the handle or the edge (forHover false): blue is never dragged.
    if (forHover && ahead && proj.blue) {
      const kb = colOf(G.t(x));
      if (proj.blue[kb] && y >= surplusTop(kb) && y <= G.y(proj.p50[kb] + proj.exports[kb] + proj.charging[kb])) return {kind: 'surplus', k: kb};
    }
    let best = null, bd = Infinity;
    for (const h of handles) {
      const d = Math.max(Math.abs(x - h.x), Math.abs(y - h.y));
      if (d <= half && d < bd) { best = h; bd = d; }
    }
    if (best) return best;
    if (!ahead) return y >= G.y1 && y <= G.y0 ? {kind: 'past'} : null;
    const k = colOf(G.t(x));
    const B = curB || stackBases();
    // layer top edges (a new key there), nearest within the hit half-height
    let edge = null, ed = Infinity;
    proj.layers.forEach((L, li) => {
      if (L.kind !== 'station' || !(L.mw[k] > 0.5 || (B.edge[L.id] || 0) > 0.5)) return;
      const yt = G.y(B.base[li][k] + L.mw[k]), d = Math.abs(y - yt);
      if (d <= half && d < ed) { edge = {kind: 'edge', station: L.id, base: B.base[li][k]}; ed = d; }
    });
    // inside a gap by more than 3 px: the gap (L-9 hover) wins over the edge under it
    const gk = proj.gap[k];
    if (gk) {
      const ya = G.y(gk === 'red' ? proj.p50[k] : proj.p90[k]), yb = G.y(proj.supply[k]);
      if (forHover ? y >= ya - 2 && y <= yb + 2 : y >= ya - 1 && y <= yb - 3) return {kind: 'gap', k, color: gk};
    }
    for (const gh of ghosts) {
      const h = Math.max(HIT_PX, gh.h), cy = gh.y + gh.h / 2;
      if (x >= gh.x - half && x <= G.x1 && Math.abs(y - cy) <= h / 2 && (!edge || Math.abs(y - cy) < ed)) return gh;
    }
    if (edge) return edge;
    // a gap (red/amber) or a layer body
    const g = proj.gap[k];
    if (g) {
      const top = g === 'red' ? proj.p50[k] : proj.p90[k];
      if (y >= G.y(top) - 2 && y <= G.y(proj.supply[k]) + 2) return {kind: 'gap', k, color: g};
    }
    const mwAt = G.mw(y);
    for (let li = 0; li < proj.layers.length; li++) {
      const L = proj.layers[li], b = B.base[li][k];
      if (L.mw[k] > 0.5 && mwAt >= b && mwAt <= b + L.mw[k]) return {kind: 'layer', id: L.id, k};
    }
    // the rooftop bite above the skyline (hover only)
    if (forHover && proj.rooftop && proj.rooftop[k] > ROOF_MIN_MW && mwAt >= proj.p50[k] && mwAt <= proj.p50[k] + proj.rooftop[k]) return {kind: 'rooftop', k};
    return {kind: 'empty', k};
  }

  function previewFor(d, x, y) {
    const obs = vm.obs;
    if (d.kind === 'ghost' || d.kind === 'start') {
      const onAt = Math.max(obs.s, G.t(x));
      if (d.kind === 'start' && y > G.y0 + HIT_PX / 2) return {unbook: true, unit: d.unit};
      return PV.snapStart(obs, d.unit, onAt);
    }
    const atS = Math.max(obs.s, G.t(x));
    const li = layerIndex(d.station), c = colOf(atS);
    const base = li >= 0 && curB ? curB.base[li][c] : 0;
    const mw = Math.max(0, G.mw(y) - base);
    const r = PV.snapDrop(obs, d.station, atS, mw);
    r.raw = {atS, mw};
    return r;
  }

  function send(inputs) {
    const refused = [];
    for (const x of inputs) {
      const why = actions.input(x);
      if (why && !refused.includes(why)) refused.push(why);
    }
    say(refused.length ? 'Refused: ' + refused.join('; ') : '', 'no');
    return refused;
  }

  /** Commit a preview result: send it when feasible, else show its earliest-arrival ghost. */
  function commit(r, fromKey) {
    lastDrop = r;
    if (!r) return;
    if (r.unbook) { send([{type: 'planUnbook', unit: r.unit}]); return; }
    if (r.infeasible) {
      if (!r.ghost) { say(r.reason || 'Cannot arrive in the window'); return; }
      pending = {result: r, until: nowMs + GHOST_MS};
      const at = r.unit ? r.ghost.onAtS : r.ghost.atS;
      say('Too soon: earliest ' + clockText(at, false) + '. Click the ghost or press Enter to book it.', 'info');
      return;
    }
    const inputs = [];
    if (fromKey && fromKey.atS !== r.atS) inputs.push({type: 'planDel', station: fromKey.station, atS: fromKey.atS});
    inputs.push(...r.inputs);
    r.sent = inputs;
    pending = null;
    send(inputs);
  }

  function takePending() {
    if (!pending || !pending.result.ghost) return false;
    const r = pending.result;
    const inputs = r.ghost.inputs.slice();
    lastDrop = Object.assign({}, r, {sent: inputs, tookGhost: true});
    pending = null;
    send(inputs);
    return true;
  }

  const readOnly = () => !!(vm && vm.mode && vm.mode.locked);

  cv.addEventListener('pointerdown', ev => {
    if (!vm || !G) return;
    if (readOnly()) { sayLocked(); return; }
    const p = local(ev), h = hitTest(p.x, p.y);
    // Q-41: a press on what does not drag says what does, in blue
    const nm = h && NAMES[h.id];
    if (!h || h.kind === 'past' || h.kind === 'empty') { say((h && h.kind === 'past' ? 'That is past. ' : '') + 'Plan ahead of now: drag a top edge or a ghost', 'info'); return; }
    if (h.kind === 'gap') { say((h.color === 'red' ? 'Short' : 'Tight') + ' here: drag a top edge up, or a ghost right', 'info'); return; }
    if (h.kind === 'layer') {
      say(V.STATIONS[h.id] ? 'Drag ' + nm + "'s top edge: up for more MW" : nm + (h.id === 'wind' || h.id === 'solar' ? ': the weather sets it' : ': set on the desk, not the plan'), 'info');
      return;
    }
    if (h.kind === 'pending') { takePending(); ev.preventDefault(); return; }
    if (h.kind === 'key' || h.kind === 'edge' || h.kind === 'ghost' || h.kind === 'start') {
      drag = {kind: h.kind, station: h.station, unit: h.unit, from: h.kind === 'key' ? {station: h.station, atS: h.atS} : null, x0: p.x, y0: p.y, moved: false};
      drag.preview = previewFor(drag, p.x, h.kind === 'key' ? h.y : p.y);
      if (cv.setPointerCapture) cv.setPointerCapture(ev.pointerId);
      el.focus();
      ev.preventDefault();
    }
  });

  cv.addEventListener('pointermove', ev => {
    if (!vm || !G) return;
    const p = local(ev);
    if (drag) {
      if (Math.abs(p.x - drag.x0) + Math.abs(p.y - drag.y0) > 2) drag.moved = true;
      drag.preview = previewFor(drag, p.x, p.y);
      return;
    }
    hover(p);
  });

  cv.addEventListener('pointerup', ev => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (cv.releasePointerCapture) cv.releasePointerCapture(ev.pointerId);
    if (readOnly()) return;
    if (!d.moved && d.kind === 'key') { selectKey(d.station, d.from.atS); return; }
    if (!d.moved) {
      const who = d.unit ? unitName(d.station, d.unit) + "'s START" : NAMES[d.station] + "'s MW";
      say(d.kind === 'ghost' ? 'Drag right to book ' + who : d.kind === 'start' ? 'Drag ' + who + ' sideways to move it, below the axis to unbook' :
        'Drag to plan ' + who + ': right for later, up for more', 'info');
      return;
    }
    const p = local(ev);
    commit(previewFor(d, p.x, p.y), d.from);
  });

  cv.addEventListener('pointerleave', () => {
    hoverLayer = null; hoverGap = null; hoverBlue = null; glowLocal = new Set(); tip.hidden = true;
    sendHover(null);
  });

  function sendHover(cmd) {
    const key = cmd ? JSON.stringify(cmd) : null;
    if (key === sentHover) return;
    sentHover = key;
    actions.ui(cmd || {do: 'hover', target: null});
  }

  function hover(p) {
    const h = hitTest(p.x, p.y, true);
    hoverLayer = null; hoverGap = null; hoverBlue = null; glowLocal = new Set();
    if (!h || h.kind === 'empty' || h.kind === 'past') { tip.hidden = true; sendHover(null); return; }
    const obs = vm.obs;
    let text = '';
    if (h.kind === 'surplus') {
      // C-11: what the blue means and the two things that save it
      hoverBlue = blues.find(r => h.k >= r.k0 && h.k <= r.k1) || null;
      text = GAP_MARK.blue.word + ' at ' + clockText(proj.times[h.k], false) + '\n' + fmtMW(Math.round(proj.surplusMW[h.k])) + ' MW will be spilled: stop a unit, or charge the battery';
      sendHover(null);
    } else if (h.kind === 'rooftop') {
      text = 'ROOFTOP SOLAR ' + fmtMW(Math.round(proj.rooftop[h.k])) + ' MW at ' + clockText(proj.times[h.k], false) + '\non the city\'s roofs: demand the grid does not see';
      sendHover(null);
    } else if (h.kind === 'gap') {
      const t = proj.times[h.k];
      if (h.color === 'red') {
        const gap = PV.gapAt(proj, h.k);
        hoverGap = gap;
        const glow = PV.glowSet(obs, gap);
        glowLocal = new Set(PV.glowLayers(obs, gap));
        text = 'SHORT ' + Math.round(proj.deficit[h.k]) + ' MW at ' + clockText(t, false) + '\n' +
          (glow.length ? 'Lit: can arrive by ' + clockText(gap.atS, false) : 'Nothing can arrive by ' + clockText(gap.atS, false));
        sendHover({do: 'hover', target: 'stack', gap: {atS: gap.atS, endS: gap.endS, mw: Math.round(gap.mw)}, glow});
      } else {
        text = 'Inside the likely range: ' + Math.round(proj.p90[h.k] - proj.supply[h.k]) + ' MW short of P90 at ' + clockText(t, false);
        sendHover(null);
      }
    } else {
      const id = h.id || h.station;
      hoverLayer = id;
      const f = PV.layerFacts(obs, id);
      const k = h.k ?? colOf(Math.max(obs.s, G.t(p.x)));
      const L = proj.layers.find(q => q.id === id);
      const mwv = L ? L.mw[k] : 0;
      if (h.kind === 'ghost') text = unitName(id, h.unit) + ' is off: earliest on ' + clockText(h.atS, false) + '\nDrag to book its START';
      else if (h.kind === 'start') text = 'START booked: on at MIN ' + clockText(h.onAtS, false) + '\nDrag below the axis to unbook';
      else if (f) {
        text = (f.name || NAMES[id]) + '  ' + Math.round(mwv) + ' MW at ' + clockText(proj.times[k], false) +
          '\nramp ' + (f.rampMWMin ? Math.round(f.rampMWMin) + ' MW/min' : 'weather') + '  start ' + (f.startMin ? Math.round(f.startMin) + ' min' : '-') +
          '  cost ' + (f.offer === null || f.offer === undefined ? '-' : priceText(f.offer) + '/MWh');
      }
      text += '\nprice now ' + priceText(obs.price ? obs.price.mwh : 0) + '/MWh';
      const target = PV.STATION_CONTROL[id] || PV.OTHER_CONTROL[id] || null;
      sendHover(target ? {do: 'hover', target} : null);
    }
    tip.textContent = text;
    tip.hidden = !text;
    // kept inside the box: the longest line at about 5 px a character in the 9-px face
    let chars = 0;
    for (const line of text.split('\n')) if (line.length > chars) chars = line.length;
    tip.style.left = Math.round(Math.max(0, Math.min(p.x + 8, (G.W || 300) - Math.max(150, chars * 5 + 12)))) + 'px';
    tip.style.top = Math.round(Math.max(0, p.y - 34)) + 'px';
  }

  // ---------------------------------------------------------------- keyboard (L-4 keyboard route)

  function selectKey(station, atS) {
    const k = vm.obs.plan.stations.find(q => q.id === station).keys.find(q => q.atS === atS);
    sel = {station, atS, mw: k ? k.mw : 0, from: {station, atS}, mode: 'key'};
    refreshSel();
  }

  function selectStation(station) {
    const obs = vm.obs;
    if (sel && sel.station === station && sel.mode !== 'ghost') {
      const gh = ghosts.find(g => g.station === station);
      if (gh) { sel = {station, unit: gh.unit, onAtS: Math.ceil(gh.atS / PV.SNAP_S) * PV.SNAP_S, mode: 'ghost'}; refreshSel(); return; }
    }
    const t = Math.ceil((obs.s + 1) / PV.SNAP_S) * PV.SNAP_S;
    const L = proj.layers.find(q => q.id === station);
    const c = colOf(t);
    const cur = L ? L.mw[c] : 0;
    sel = {station, atS: t, mw: Math.round(cur / PV.SNAP_MW) * PV.SNAP_MW, from: null, mode: 'key'};
    if (!(cur > 0.5)) {
      const gh = ghosts.find(g => g.station === station);
      if (gh) sel = {station, unit: gh.unit, onAtS: Math.ceil(gh.atS / PV.SNAP_S) * PV.SNAP_S, mode: 'ghost'};
    }
    refreshSel();
  }

  function refreshSel() {
    if (!sel) return;
    sel.preview = sel.mode === 'ghost' ? PV.snapStart(vm.obs, sel.unit, sel.onAtS) : PV.snapDrop(vm.obs, sel.station, sel.atS, sel.mw);
  }

  el.addEventListener('keydown', ev => {
    if (!vm) return;
    const k = ev.key;
    const done = () => { ev.preventDefault(); ev.stopPropagation(); };
    if (k === 'l' || k === 'L') { actions.ui({do: 'stackExpand', on: !vm.stackExpanded}); done(); return; }
    if (k === 'Escape' && (sel || pending)) { sel = null; pending = null; say(''); done(); return; }
    const edit = /^Arrow|^Enter$|^Delete$|^Backspace$/.test(k);
    if (readOnly()) { if (edit || /^[1-6]$/.test(k)) { sayLocked(); done(); } return; }
    if (/^[1-6]$/.test(k)) {
      selectStation(SIDS[Number(k) - 1]);
      if (!pending) say(sel.mode === 'ghost' ? unitName(sel.station, sel.unit) + "'s START: ←/→ moves it, Enter books it" : NAMES[sel.station] + ': ←/→ time, ↑/↓ MW, Enter plans it', 'info');
      done(); return;
    }
    // Q-41: an edit key with nothing picked says what to pick; Enter still reaches the RESPOND card
    if (!sel && !pending && edit) {
      if (k !== 'Enter' || !vm.respond) say('Pick a station first: 1-6', 'info');
      if (k !== 'Enter') done();
      return;
    }
    if (k === 'Enter') {
      if (pending) { takePending(); done(); return; }
      if (sel) { commit(sel.preview, sel.from); if (!pending) sel = null; done(); }
      return;
    }
    if ((k === 'Delete' || k === 'Backspace') && sel) {
      if (sel.from) { send([{type: 'planDel', station: sel.from.station, atS: sel.from.atS}]); sel = null; } else say('Not planned yet: Enter plans it, Esc drops it', 'info');
      done(); return;
    }
    if (!sel || !/^Arrow/.test(k)) return;
    const s = vm.obs.s;
    if (sel.mode === 'ghost') {
      if (k === 'ArrowRight') sel.onAtS += PV.SNAP_S;
      if (k === 'ArrowLeft') sel.onAtS = Math.max(Math.ceil(s / PV.SNAP_S) * PV.SNAP_S, sel.onAtS - PV.SNAP_S);
    } else {
      if (k === 'ArrowRight') sel.atS += PV.SNAP_S;
      if (k === 'ArrowLeft') sel.atS = Math.max(Math.ceil(s / PV.SNAP_S) * PV.SNAP_S, sel.atS - PV.SNAP_S);
      if (k === 'ArrowUp') sel.mw += PV.SNAP_MW;
      if (k === 'ArrowDown') sel.mw = Math.max(0, sel.mw - PV.SNAP_MW);
    }
    refreshSel();
    done();
  });

  btn.addEventListener('click', () => { if (vm) actions.ui({do: 'stackExpand', on: !vm.stackExpanded}); });

  // ---------------------------------------------------------------- update

  function setExpanded(on) {
    if (on === expanded) return;
    expanded = on;
    el.classList.toggle('expanded', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Back to the desk (L)' : 'Expand the Live Stack over the map (L)';
    // The shell may restyle .livestack.expanded; these inline defaults put it over the map (L-4).
    const st = el.style;
    if (on) Object.assign(st, {position: 'fixed', left: 'var(--stack-expanded-left, 16px)', top: 'var(--stack-expanded-top, 40px)',
      width: 'var(--stack-expanded-w, calc(100vw - 32px))', height: 'var(--stack-expanded-h, 420px)', zIndex: '20'});
    else Object.assign(st, {position: 'relative', left: '', top: '', width: '', height: '', zIndex: ''});
  }

  function update(v) {
    vm = v;
    nowMs = (v.frame && v.frame.nowMs) || nowMs + 16;
    setExpanded(!!v.stackExpanded);
    if (readOnly()) { drag = null; sel = null; pending = null; }
    if (sel) refreshSel();
    // F-11: the canvas is redrawn only when something it shows has changed. At rest that is the
    // projection (its signature: with it the gaps, the surplus and the forecast rooftop), the now
    // line (one step per NOW_STEP_S grid-s, under 0.3 px at the floor; the past columns and their
    // rooftop move with it), the price to the dollar, the size and the cross-highlights; anything
    // live (a drag, a selection, a ghost, a message, a hover, the watch's tear) draws every frame.
    const live = drag || sel || pending || message || hoverLayer || hoverGap || hoverBlue || readOnly();
    let key = '';
    if (!live) {
      let glow = '';
      if (v.glow && typeof v.glow.forEach === 'function') v.glow.forEach(id => { glow += id + ','; });
      key = signature(v.obs) + '|' + Math.floor(v.obs.s / NOW_STEP_S) + '|' + (el.clientWidth || 0) + 'x' + (el.clientHeight || 0) + '|' +
        expanded + '|' + (v.hover || '') + '|' + glow + '|' + (globalThis.devicePixelRatio || 1) + '|' + Math.round(priceNow(v.obs)) + (spillingNow(v.obs) ? 'S' : '');
    // (the S: the word SPILL comes and goes with the spill at the same price)
    }
    if (live || key !== drawnKey) { drawnKey = key; draw(); } else stats.skips++;
  }

  return {
    update, el,
    /** Test / perf hooks (not part of the contract). */
    debug: {
      get geom() { return G; }, get proj() { return proj; }, get handles() { return handles; }, get ghosts() { return ghosts; },
      get lastDrop() { return lastDrop; }, get pending() { return pending; }, get sel() { return sel; }, get drawMs() { return drawMs; },
      get message() { return msg.textContent; }, get blues() { return blues; }, stats, hitTest: (x, y, forHover) => hitTest(x, y, forHover),
    },
  };
}

// render/charts.js: the bench's strip charts on <canvas> (2D context only).
// Stateless drawing functions; the caller passes a context and plain data (app/record.js).
// Axis helpers at the bottom are pure and tested (tests/bench.test.js).

import {V} from '../sim/params.js';
import {clockText, hz, mw} from './format.js';

const S_PER_MIN = V.S_PER_MIN, DAY_MIN = V.DAY_S / S_PER_MIN;
const F0 = V.F0_HZ;

/** Colours shared with bench.css (index by role, not by fuel brand). */
export const COL = Object.freeze({
  bg: '#0d1117', grid: '#232a33', axis: '#6e7781', text: '#9aa4b0', bright: '#e6edf3',
  green: '#3fb950', amber: '#d29922', red: '#f85149', blue: '#58a6ff', violet: '#a371f7', pink: '#f778ba',
  orange: '#f0883e', cyan: '#39c5cf', grey: '#8b949e',
  band: 'rgba(63,185,80,0.10)', fill: 'rgba(88,166,255,0.28)',
});
/** Catch sources in the watch, physical order (K-15, J-25): label and colour. */
export const CAUGHT_STYLE = Object.freeze({
  inertiaMW: ['inertia', COL.orange], batteryMW: ['battery', COL.violet], guardMW: ['GUARD', COL.pink],
  governorsMW: ['governors', COL.green], loadReliefMW: ['load relief', COL.cyan], uflsMW: ['UFLS', COL.red],
});
const LEVEL_COL = [COL.green, COL.amber, COL.red, COL.red]; // SECURE, TIGHT, SHORT, SHEDDING (P-11)
const FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
const PAD = {l: 46, r: 8, t: 16, b: 16};

// ------------------------------------------------------------------ pure axis helpers

/**
 * Frequency axis that always shows the normal band and grows to fit the data:
 * [lo, hi] with lo <= 49.8, hi >= 50.2, padded, clamped to the physics clamp.
 */
export function freqRange(min, max) {
  let lo = Math.min(F0 - 0.2, Number.isFinite(min) ? min - 0.05 : F0), hi = Math.max(F0 + 0.2, Number.isFinite(max) ? max + 0.05 : F0);
  lo = Math.max(V.F_CLAMP_LO_HZ, Math.floor(lo * 20) / 20);
  hi = Math.min(V.F_CLAMP_HI_HZ, Math.ceil(hi * 20) / 20);
  return [lo, hi];
}

/** Signed log scale for prices ($/MWh): 0 -> 0, ±10 -> ±1, ±100 -> ±2 ... (monotonic, odd). */
export function priceScale(p) {
  return Math.sign(p) * Math.log10(1 + Math.abs(p) / 10);
}

/** Nice tick step for a span (1, 2, 5 x 10^k) giving about `n` ticks. */
export function niceStep(span, n = 4) {
  const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/**
 * Per-pixel min/max decimation of a series (NaN skipped): returns {min, max} Float64Arrays of
 * length `cols` (NaN where a column has no data).
 */
export function decimate(values, cols) {
  const min = new Float64Array(cols).fill(NaN), max = new Float64Array(cols).fill(NaN), n = values.length;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const c = Math.min(cols - 1, Math.floor(i * cols / n));
    if (!(v >= min[c])) min[c] = v;
    if (!(v <= max[c])) max[c] = v;
  }
  return {min, max};
}

// ------------------------------------------------------------------ canvas plumbing

/** Size the canvas backing store to its CSS box x devicePixelRatio; returns {ctx, w, h} in CSS px. */
export function prepare(canvas) {
  const dpr = globalThis.devicePixelRatio || 1;
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  return {ctx, w, h};
}

function frameOf(w, h) {
  return {x0: PAD.l, x1: w - PAD.r, y0: PAD.t, y1: h - PAD.b};
}

function hline(ctx, f, y, col, dash, label) {
  ctx.strokeStyle = col;
  ctx.setLineDash(dash || []);
  ctx.beginPath(); ctx.moveTo(f.x0, y); ctx.lineTo(f.x1, y); ctx.stroke();
  ctx.setLineDash([]);
  if (label) { ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(label, f.x0 - 4, y); }
}

function title(ctx, text, x = PAD.l, col = COL.text) {
  ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(text, x, 7);
}

// Horizontal frequency references inside [lo, hi].
function freqRefs(ctx, f, y, lo, hi) {
  ctx.fillStyle = COL.band;
  const b0 = y(Math.min(hi, V.NORMAL_HI_HZ)), b1 = y(Math.max(lo, V.NORMAL_LO_HZ));
  if (b1 > b0) ctx.fillRect(f.x0, b0, f.x1 - f.x0, b1 - b0);
  const refs = [[F0, COL.axis, [2, 3]], [V.CONTAIN_LO_HZ, COL.amber, [4, 3]], [V.CONTAIN_HI_HZ, COL.amber, [4, 3]],
    [V.UFLS_FIRST_HZ, COL.red, [4, 3]], [V.NORMAL_LO_HZ, COL.grid, null], [V.NORMAL_HI_HZ, COL.grid, null]];
  for (const [v, c, d] of refs) if (v >= lo && v <= hi) hline(ctx, f, y(v), c, d, v === F0 || d ? v.toFixed(v === F0 ? 1 : 2) : '');
}

// ------------------------------------------------------------------ live frequency

/**
 * Frequency over a recent window. data: {kind: 'ticks', values (per tick, oldest first), spanS}
 * or {kind: 'seconds', min, max, mean (per second, oldest first)}.
 */
export function drawFreqWindow(canvas, data, label) {
  const {ctx, w, h} = prepare(canvas), f = frameOf(w, h);
  let dmin = Infinity, dmax = -Infinity;
  const lows = data.kind === 'ticks' ? data.values : data.min, highs = data.kind === 'ticks' ? data.values : data.max;
  for (let i = 0; i < lows.length; i++) { if (lows[i] < dmin) dmin = lows[i]; if (highs[i] > dmax) dmax = highs[i]; }
  const [lo, hi] = freqRange(dmin, dmax);
  const y = v => f.y1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (f.y1 - f.y0);
  freqRefs(ctx, f, y, lo, hi);
  const cols = Math.max(1, Math.floor(f.x1 - f.x0));
  const n = data.kind === 'ticks' ? data.values.length : data.min.length;
  const span = data.kind === 'ticks' ? data.spanS * V.TICKS_PER_S : n;
  const x = i => f.x1 - (n - 1 - i) / Math.max(1, span - 1) * (f.x1 - f.x0); // newest at the right edge
  if (data.kind === 'seconds') {
    ctx.fillStyle = COL.fill;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(data.min[i])) continue;
      const yt = y(data.max[i]), yb = y(data.min[i]);
      ctx.fillRect(x(i) - 0.5, yt, Math.max(1, (f.x1 - f.x0) / span), Math.max(1, yb - yt));
    }
    line(ctx, n, i => x(i), i => data.mean[i], y, COL.blue, 1.2);
  } else if (n > cols * 2) {
    const d = decimate(data.values, cols);
    ctx.strokeStyle = COL.blue; ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = x(0), x1 = x(n - 1);
    for (let c = 0; c < cols; c++) {
      if (!Number.isFinite(d.min[c])) continue;
      const xc = x0 + (c + 0.5) / cols * (x1 - x0);
      ctx.moveTo(xc, y(d.max[c])); ctx.lineTo(xc, y(d.min[c]) + 0.5);
    }
    ctx.stroke();
  } else {
    line(ctx, n, i => x(i), i => data.values[i], y, COL.blue, 1.4);
  }
  title(ctx, label);
  ctx.textAlign = 'right'; ctx.fillStyle = COL.axis;
  ctx.fillText('now', f.x1, h - 7);
}

function line(ctx, n, xf, vf, y, col, width) {
  ctx.strokeStyle = col; ctx.lineWidth = width || 1;
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < n; i++) {
    const v = vf(i);
    if (!Number.isFinite(v)) { pen = false; continue; }
    if (pen) ctx.lineTo(xf(i), y(v)); else { ctx.moveTo(xf(i), y(v)); pen = true; }
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

// ------------------------------------------------------------------ the watch (K-15, H-8)

const BEATS = [[0, 0.3, 'INERTIA'], [0.3, 1.5, 'BATTERY'], [1.5, 10, 'GOVERNORS'], [10, V.WATCH_S, 'SETTLE']];
// The watch chart's time axis is stretched like the watch itself (K-15: 0-3 s is most of the
// real time): [grid s after the trip, fraction of the width] knots, linear between them.
const WATCH_AXIS = [[0, 0], [3, 0.42], [10, 0.72], [V.WATCH_S, 0.92], [2 * V.WATCH_S, 1]];
const WATCH_TICKS = [0, 0.5, 1, 1.5, 2, 3, 5, 10, 20, V.WATCH_S, 2 * V.WATCH_S];

/** Fraction of the watch chart's width at `s` grid seconds after the trip (piecewise linear, monotonic). */
export function watchAxis(s) {
  const k = WATCH_AXIS;
  if (s <= k[0][0]) return 0;
  for (let i = 1; i < k.length; i++) {
    if (s <= k[i][0]) return k[i - 1][1] + (s - k[i - 1][0]) / (k[i][0] - k[i - 1][0]) * (k[i][1] - k[i - 1][1]);
  }
  return 1;
}

/**
 * The latest contingency: frequency per tick from the trip (top) and the MW each source is
 * catching, relative to just before the trip (bottom), over the watch and as long again.
 * @param {object} tr record.js trace; k = ticks shown so far (the watch plays live)
 * @param {{alphaF?:number}} opts alphaF: interpolated f for the head (render interpolation)
 */
export function drawWatch(canvas, tr, opts) {
  const {ctx, w, h} = prepare(canvas);
  const n = tr.len;
  const top = {x0: PAD.l, x1: w - PAD.r, y0: PAD.t, y1: Math.round(h * 0.6)};
  const bot = {x0: PAD.l, x1: w - PAD.r, y0: top.y1 + 14, y1: h - PAD.b};
  const xs = s => top.x0 + watchAxis(s) * (top.x1 - top.x0);
  // Beats (physical order; K-15 captions come with the desk).
  ctx.textAlign = 'center';
  for (let b = 0; b < BEATS.length; b++) {
    const [a, z, name] = BEATS[b];
    ctx.fillStyle = b % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(xs(a), top.y0, xs(z) - xs(a), bot.y1 - top.y0);
    if (xs(z) - xs(a) > 34) { ctx.fillStyle = COL.axis; ctx.fillText(name, (xs(a) + xs(z)) / 2, top.y0 + 8); }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(xs(V.WATCH_S), top.y0, top.x1 - xs(V.WATCH_S), bot.y1 - top.y0);
  // Frequency.
  let fmin = Infinity, fmax = -Infinity, kmin = 0, kmax = 0;
  for (let k = 0; k < n; k++) {
    if (tr.f[k] < fmin) { fmin = tr.f[k]; kmin = k; }
    if (tr.f[k] > fmax) { fmax = tr.f[k]; kmax = k; }
  }
  const pv = tr.preview && tr.preview.lId === tr.id ? tr.preview.nadirHz : NaN;
  const [lo, hi] = freqRange(Math.min(fmin, Number.isFinite(pv) ? pv : fmin), Math.max(fmax, F0));
  const y = v => top.y1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (top.y1 - top.y0);
  freqRefs(ctx, top, y, lo, hi);
  if (Number.isFinite(pv)) {
    hline(ctx, top, y(pv), COL.grey, [1, 3]);
    ctx.fillStyle = COL.grey; ctx.textAlign = 'right';
    ctx.fillText('TRIP PREVIEW ' + hz(pv), top.x1 - 2, y(pv) + 8);
  }
  const TPS = V.TICKS_PER_S;
  line(ctx, n, k => xs(k / TPS), k => tr.f[k], y, COL.bright, 1.6);
  if (opts && Number.isFinite(opts.alphaF) && n < tr.f.length) {
    ctx.fillStyle = COL.bright;
    ctx.beginPath(); ctx.arc(xs((n - 1 + (opts.alpha || 0)) / TPS), y(opts.alphaF), 2.5, 0, 2 * Math.PI); ctx.fill();
  }
  const ext = tr.lostMW >= 0 ? {k: kmin, f: fmin, word: 'NADIR'} : {k: kmax, f: fmax, word: 'PEAK'};
  if (n > 1) {
    const ex = xs(ext.k / TPS), ey = y(ext.f);
    ctx.fillStyle = COL.amber; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 2 * Math.PI); ctx.fill();
    ctx.textAlign = ex > (top.x0 + top.x1) / 2 ? 'right' : 'left';
    ctx.fillText(ext.word + ' ' + hz(ext.f) + ' Hz at T+' + (ext.k / TPS).toFixed(2) + ' s', ex + (ctx.textAlign === 'left' ? 6 : -6), ey + (tr.lostMW >= 0 ? 10 : -10));
  }
  // Who caught it (MW change since just before the trip).
  let cmin = 0, cmax = 0;
  const nc = Math.max(0, n - 1); // caught is valid below len - 1 (app/record.js)
  for (const key of Object.keys(CAUGHT_STYLE)) {
    const a = tr.caught[key];
    for (let k = 0; k < nc; k++) { if (a[k] < cmin) cmin = a[k]; if (a[k] > cmax) cmax = a[k]; }
  }
  const lim = Math.max(Math.abs(tr.lostMW), cmax, -cmin, 1) * 1.05;
  const clo = Math.min(0, cmin) < -lim * 0.05 ? -lim : -lim * 0.1;
  const yc = v => bot.y1 - (v - clo) / (lim - clo) * (bot.y1 - bot.y0);
  hline(ctx, bot, yc(0), COL.axis, [2, 3], '0');
  hline(ctx, bot, yc(Math.abs(tr.lostMW)), COL.grid, [4, 3], mw(Math.abs(tr.lostMW)));
  let lx = bot.x0 + 4;
  ctx.textAlign = 'left';
  for (const [key, [name, col]] of Object.entries(CAUGHT_STYLE)) {
    line(ctx, nc, k => xs(k / TPS), k => tr.caught[key][k], yc, col, 1.3);
    const now = nc > 0 ? tr.caught[key][nc - 1] : 0;
    const txt = name + ' ' + mw(now);
    ctx.fillStyle = col; ctx.fillText(txt, lx, bot.y0 - 6);
    lx += ctx.measureText(txt).width + 12;
  }
  // Axis: seconds after the trip, stretched like the watch.
  ctx.fillStyle = COL.axis; ctx.textAlign = 'center';
  for (const s of WATCH_TICKS) ctx.fillText((s ? '' : 'T+') + s + (s === 2 * V.WATCH_S ? ' s' : ''), Math.min(xs(s), w - 12), h - 6);
  title(ctx, 'CONTINGENCY #' + tr.n + ': ' + tr.cause + ' ' + tr.id + ', ' + mw(Math.abs(tr.lostMW)) + ' MW ' +
    (tr.lostMW >= 0 ? 'lost' : 'of load lost') + ' at ' + clockText(tr.startTick / TPS), PAD.l, COL.bright);
}

// ------------------------------------------------------------------ 24-hour charts

function dayAxis(ctx, f, h, nowMin) {
  ctx.fillStyle = COL.axis; ctx.textAlign = 'center';
  ctx.strokeStyle = COL.grid;
  for (let m = 0; m <= DAY_MIN; m += 4 * 60) {
    const xx = f.x0 + m / DAY_MIN * (f.x1 - f.x0);
    ctx.beginPath(); ctx.moveTo(xx, f.y0); ctx.lineTo(xx, f.y1); ctx.stroke();
    ctx.fillText(clockText(m * S_PER_MIN, false), xx, h - 6);
  }
  if (nowMin >= 0) {
    const xx = f.x0 + nowMin / DAY_MIN * (f.x1 - f.x0);
    ctx.strokeStyle = COL.bright; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(xx, f.y0); ctx.lineTo(xx, f.y1); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

const xDay = (f, m) => f.x0 + (m + 0.5) / DAY_MIN * (f.x1 - f.x0);

/** Frequency over the day: per-minute min-max envelope and mean, fixed 49-51 Hz (clipped). */
export function drawFreqDay(canvas, minute, nowMin, label) {
  const {ctx, w, h} = prepare(canvas), f = frameOf(w, h);
  const lo = V.UFLS_FIRST_HZ, hi = 2 * F0 - V.UFLS_FIRST_HZ;
  const y = v => f.y1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (f.y1 - f.y0);
  freqRefs(ctx, f, y, lo, hi);
  dayAxis(ctx, f, h, nowMin);
  ctx.fillStyle = COL.fill;
  const cw = Math.max(1, (f.x1 - f.x0) / DAY_MIN);
  for (let m = 0; m < DAY_MIN; m++) {
    if (!Number.isFinite(minute.fMin[m])) continue;
    const yt = y(minute.fMax[m]), yb = y(minute.fMin[m]);
    ctx.fillStyle = minute.fMin[m] < V.CONTAIN_LO_HZ || minute.fMax[m] > V.CONTAIN_HI_HZ ? COL.red : COL.fill;
    ctx.fillRect(xDay(f, m) - cw / 2, yt, cw, Math.max(1, yb - yt));
  }
  line(ctx, DAY_MIN, m => xDay(f, m), m => minute.fMean[m], y, COL.blue, 1);
  title(ctx, label);
}

/**
 * Demand and supply over the day, renewables underneath, shed in red, and the forecast
 * ahead (obs.forecast: P10-P90 band and P50) from now.
 */
export function drawDemandDay(canvas, minute, nowMin, fc, label) {
  const {ctx, w, h} = prepare(canvas), f = frameOf(w, h);
  let top = 0;
  for (let m = 0; m < DAY_MIN; m++) {
    for (const v of [minute.demand[m], minute.supply[m]]) if (v > top) top = v;
  }
  const cols = fc ? fc.n : 0;
  for (let k = 0; k < cols; k++) if (fc.demandP90[k] > top) top = fc.demandP90[k];
  const step = niceStep(Math.max(top, 1000), 4), hi = Math.ceil(Math.max(top, 1000) / step) * step;
  const y = v => f.y1 - Math.max(0, Math.min(hi, v)) / hi * (f.y1 - f.y0);
  ctx.textAlign = 'right';
  for (let v = 0; v <= hi; v += step) {
    ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(f.x0, y(v)); ctx.lineTo(f.x1, y(v)); ctx.stroke();
    ctx.fillStyle = COL.axis; ctx.fillText(mw(v), f.x0 - 4, y(v));
  }
  dayAxis(ctx, f, h, nowMin);
  // Renewables (wind + solar output) as an area.
  ctx.fillStyle = 'rgba(63,185,80,0.22)';
  ctx.beginPath();
  let started = false;
  for (let m = 0; m < DAY_MIN; m++) {
    if (!Number.isFinite(minute.renew[m])) continue;
    if (!started) { ctx.moveTo(xDay(f, m), y(0)); started = true; }
    ctx.lineTo(xDay(f, m), y(minute.renew[m]));
  }
  if (started) { ctx.lineTo(xDay(f, Math.max(0, nowMin - 1)), y(0)); ctx.closePath(); ctx.fill(); }
  // Shed (red bars from the served line up to demand).
  ctx.fillStyle = 'rgba(248,81,73,0.7)';
  const cw = Math.max(1, (f.x1 - f.x0) / DAY_MIN);
  for (let m = 0; m < DAY_MIN; m++) {
    if (minute.shed[m] > 0.5) ctx.fillRect(xDay(f, m) - cw / 2, y(minute.demand[m]), cw, y(minute.demand[m] - minute.shed[m]) - y(minute.demand[m]));
  }
  // Forecast ahead.
  if (fc && cols > 0) {
    const xs = s => f.x0 + s / S_PER_MIN / DAY_MIN * (f.x1 - f.x0);
    const sAt = k => fc.fromS + (k + 1) * fc.stepS;
    ctx.fillStyle = 'rgba(139,148,158,0.18)';
    ctx.beginPath();
    let n = 0;
    for (let k = 0; k < cols && sAt(k) <= V.DAY_S; k++, n++) ctx[k ? 'lineTo' : 'moveTo'](xs(sAt(k)), y(fc.demandP90[k]));
    for (let k = n - 1; k >= 0; k--) ctx.lineTo(xs(sAt(k)), y(fc.demandP10[k]));
    ctx.closePath(); ctx.fill();
    ctx.setLineDash([3, 3]);
    line(ctx, n, k => xs(sAt(k)), k => fc.demandP50[k], y, COL.grey, 1);
    ctx.setLineDash([]);
  }
  line(ctx, DAY_MIN, m => xDay(f, m), m => minute.demand[m], y, COL.bright, 1.4);
  line(ctx, DAY_MIN, m => xDay(f, m), m => minute.supply[m], y, COL.orange, 1);
  title(ctx, label);
  legend(ctx, w, [['demand', COL.bright], ['supply', COL.orange], ['wind+solar', COL.green], ['shed', COL.red],
    ['forecast P10-P90', COL.grey]]);
}

function legend(ctx, w, items) {
  ctx.textAlign = 'right';
  let x = w - PAD.r;
  for (let i = items.length - 1; i >= 0; i--) {
    const [name, col] = items[i];
    ctx.fillStyle = col; ctx.fillText(name, x, 7);
    x -= ctx.measureText(name).width + 12;
  }
}

/** Price over the day on a signed log scale, coloured by the security state of each minute (P-11). */
export function drawPriceDay(canvas, minute, nowMin, label) {
  const {ctx, w, h} = prepare(canvas), f = frameOf(w, h);
  const lo = priceScale(V.PRICE_FLOOR), hi = priceScale(V.PRICE_CAP);
  const y = p => f.y1 - (priceScale(p) - lo) / (hi - lo) * (f.y1 - f.y0);
  ctx.textAlign = 'right';
  for (const p of [V.PRICE_FLOOR, -100, 0, 100, 1000, V.PRICE_CAP]) {
    ctx.strokeStyle = p === 0 ? COL.axis : COL.grid;
    ctx.beginPath(); ctx.moveTo(f.x0, y(p)); ctx.lineTo(f.x1, y(p)); ctx.stroke();
    ctx.fillStyle = COL.axis; ctx.fillText((p < 0 ? '−$' : '$') + mw(Math.abs(p)), f.x0 - 4, y(p));
  }
  dayAxis(ctx, f, h, nowMin);
  for (let m = 1; m < DAY_MIN; m++) {
    const a = minute.price[m - 1], b = minute.price[m];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lv = minute.level[m];
    ctx.strokeStyle = Number.isFinite(lv) && lv >= 0 ? LEVEL_COL[lv] : COL.grey;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(xDay(f, m - 1), y(a)); ctx.lineTo(xDay(f, m), y(a)); ctx.lineTo(xDay(f, m), y(b)); ctx.stroke();
  }
  ctx.lineWidth = 1;
  title(ctx, label);
  legend(ctx, w, [['SECURE', COL.green], ['TIGHT', COL.amber], ['SHORT / SHEDDING', COL.red]]);
}


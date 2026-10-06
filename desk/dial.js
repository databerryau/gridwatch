// desk/dial.js: K-11 frequency dial (canvas) and BALANCE bar (DOM) (desk/README.md §6, §29).
//
// Dial: 49-51 Hz; normal band green, out to 49.5/50.5 amber, beyond red; UFLS marked at 49.0; the
// needle (above 10× the last real second's mean, F-4), the TRIP PREVIEW ghost needle, the nadir
// pin during a watch, a 3-decimal readout, CHANGE (RoCoF over 500 ms) and SPIN (stored energy,
// GW·s); "HAND" on the face in HAND mode. BALANCE bar: the trend, or in an event the scheduled gap
// and the borrowed stack that covers it (inertia, battery, governors, load relief and, Phase 2a, the
// inverters backing off: wind, utility solar and rooftop solar above 50 Hz, C-7); the segments sum to the
// swing-equation imbalance and balance about zero (calc.imbalanceSegments). SHED is the dark
// customers' load (obs.demand.unservedMW): the relay MW is net load and is zero or less when a
// district that was feeding back at noon is dark (P-12). The canvas is role="img"; its text
// alternative (K-23) changes at most once per real second.

import {V} from '../sim/params.js';
import {imbalanceSegments} from './calc.js';
import {el, setText, setAttr, setCls, setStyle, setHidden, slowAttr, mw, smw, hz3, fin, clamp, PAN} from './util.js';

export const DIAL_LO = 49, DIAL_HI = 51;
export const NEEDLE_AVG_ABOVE_X = 10;   // F-4: above 10× the needle shows an average
export const STEADY_HZ_S = 0.05;        // outside the watch a change below this per real second is "steady"
export const HZ_TAU_S = 0.5;            // F-4: the readout's average above 10× (real s)

/** `x` eased toward `to` over `dtS` real s, time constant `tauS`. */
const ease = (x, to, dtS, tauS) => x + (to - x) * (1 - Math.exp(-Math.max(0, fin(dtS)) / tauS));

/** Real s since the last frame, else vm.frame.dtS; 0: draw raw. */
function stepper(now) {
  let last = NaN;
  return vm => { const t = now(), d = (t - last) / 1000; last = t; return d > 0 ? d : Math.max(0, fin(vm.frame && vm.frame.dtS)); };
}

/** The watch, the respond card or RESPOND. */
const inEvent = m => !!(m.locked || m.mode === 'RESPOND-CARD' || m.mode === 'RESPOND');

/** Hz of a vm.hist.freq entry: a number, or {hz|meanHz|fMeanHz}. */
const histHz = e => (typeof e === 'number' ? e : e && (e.meanHz ?? e.fMeanHz ?? e.hz));

/**
 * The last completed second's frequency: above 10× its mean from vm.hist.freq when the shell
 * provides it; otherwise obs.f.hz.
 */
export function needleHz(vm) {
  const f = fin(vm.obs.f && vm.obs.f.hz, V.F0_HZ);
  if (!(vm.mode && vm.mode.rate > NEEDLE_AVG_ABOVE_X)) return f;
  const h = vm.hist && vm.hist.freq;
  if (!Array.isArray(h) || !h.length) return f;
  const v = histHz(h[h.length - 1]);
  return Number.isFinite(v) ? v : f;
}

/**
 * What the needle and the readout show (F-4): above 10× needleHz eased into `prev` over HZ_TAU_S
 * real s, whatever the rate was before; needleHz itself at 10× and below, in the watch, or `prev` NaN.
 */
export function shownHz(prev, vm, dtS) {
  const f = needleHz(vm), m = vm.mode || {};
  return m.locked || !(fin(m.rate) > NEEDLE_AVG_ABOVE_X) || !Number.isFinite(prev) ? f : ease(prev, f, dtS, HZ_TAU_S);
}

/** Dial angle (radians, canvas convention) of a frequency on the 180° arc, 49 Hz at 9 o'clock. */
export function dialAngle(hz) {
  const f = clamp(fin(hz, V.F0_HZ), DIAL_LO - 0.05, DIAL_HI + 0.05);
  return Math.PI + (f - DIAL_LO) / (DIAL_HI - DIAL_LO) * Math.PI;
}

function fitCanvas(cv) {
  const dpr = fin(globalThis.devicePixelRatio, 1) || 1;
  const w = Math.max(1, Math.round(fin(cv.clientWidth, 232) * dpr)), h = Math.max(1, Math.round(fin(cv.clientHeight, 100) * dpr));
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  return {w, h, dpr};
}

export function createFreqDial(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-panel dk-dial');
  box.id = 'dial-freq';
  box.setAttribute('role', 'group');
  box.setAttribute('tabindex', '0');
  const cv = el(doc, 'canvas', 'dk-dial-canvas');
  cv.id = 'dial-canvas';
  cv.setAttribute('role', 'img');
  const slow = slowAttr(ctx.now);
  const read = el(doc, 'div', 'dk-dial-read');
  const big = el(doc, 'span', 'dk-hz'), sub = el(doc, 'span', 'dk-dial-sub');
  const q = el(doc, 'button', 'dk-q', '?');
  q.type = 'button'; q.id = 'q-dial';
  q.title = 'CHANGE is the rate of change of frequency (RoCoF), measured over the last 500 ms; 1 Hz/s is the limit after a ' +
    'credible trip. SPIN is the energy stored in spinning machines (inertia), in GW·s: more spin, slower falls.';
  q.setAttribute('aria-label', 'What CHANGE and SPIN mean');
  q.addEventListener('click', () => { ctx.cue('button', PAN.gauge); ctx.note(box, q.title, 8000, 'info'); });
  read.append(big, sub, q);
  box.append(cv, read);
  parent.appendChild(box);

  function draw(vm, fShow, ghostHz, pinHz) {
    const {w, h, dpr} = fitCanvas(cv);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h - 6 * dpr, r = Math.max(10, Math.min(w / 2 - 12 * dpr, h - 14 * dpr));
    const band = (lo, hi, col, lw) => {
      g.beginPath(); g.strokeStyle = col; g.lineWidth = lw;
      g.arc(cx, cy, r, dialAngle(lo), dialAngle(hi)); g.stroke();
    };
    const lw = 7 * dpr;
    band(DIAL_LO, V.CONTAIN_LO_HZ, '#8a2b2b', lw);
    band(V.CONTAIN_LO_HZ, V.NORMAL_LO_HZ, '#9a7a22', lw);
    band(V.NORMAL_LO_HZ, V.NORMAL_HI_HZ, '#2f7d3f', lw);
    band(V.NORMAL_HI_HZ, V.CONTAIN_HI_HZ, '#9a7a22', lw);
    band(V.CONTAIN_HI_HZ, DIAL_HI, '#8a2b2b', lw);
    // Ticks every 0.1 Hz, labels at the half hertz.
    g.strokeStyle = '#8b949e'; g.fillStyle = '#8b949e'; g.lineWidth = 1 * dpr;
    g.font = Math.round(9 * dpr) + 'px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i <= 20; i++) {
      const f = DIAL_LO + i * 0.1, a = dialAngle(f), major = i % 5 === 0;
      const r0 = r - lw / 2 - (major ? 6 : 3) * dpr, r1 = r - lw / 2;
      g.beginPath(); g.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); g.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); g.stroke();
      if (major) g.fillText(f.toFixed(1), cx + (r0 - 9 * dpr) * Math.cos(a), cy + (r0 - 9 * dpr) * Math.sin(a));
    }
    // UFLS mark at 49.0 Hz.
    const au = dialAngle(V.UFLS_FIRST_HZ);
    g.strokeStyle = '#f85149'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(cx + (r + lw) * Math.cos(au), cy + (r + lw) * Math.sin(au)); g.lineTo(cx + (r - 2 * lw) * Math.cos(au), cy + (r - 2 * lw) * Math.sin(au)); g.stroke();
    g.fillStyle = '#f85149'; g.textAlign = 'left';
    g.fillText('UFLS', cx - r + lw + 4 * dpr, cy - 14 * dpr);
    const needle = (f, col, width, dash) => {
      const a = dialAngle(f);
      g.save();
      g.strokeStyle = col; g.lineWidth = width;
      if (dash) g.setLineDash([4 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (r - 2 * dpr) * Math.cos(a), cy + (r - 2 * dpr) * Math.sin(a)); g.stroke();
      g.restore();
    };
    if (pinHz !== null) {
      const a = dialAngle(pinHz);
      g.fillStyle = '#f0f6fc';
      g.beginPath(); g.arc(cx + (r + lw) * Math.cos(a), cy + (r + lw) * Math.sin(a), 3 * dpr, 0, 2 * Math.PI); g.fill();
    }
    if (ghostHz !== null) needle(ghostHz, '#a371f7', 2 * dpr, true);
    needle(fShow, '#f0f6fc', 2.5 * dpr, false);
    g.fillStyle = '#c9d1d9';
    g.beginPath(); g.arc(cx, cy, 4 * dpr, 0, 2 * Math.PI); g.fill();
    if (vm.obs.mode === 'HAND') {
      g.fillStyle = '#d29922'; g.textAlign = 'center';
      g.font = 'bold ' + Math.round(11 * dpr) + 'px system-ui, sans-serif';
      g.fillText('HAND', cx, cy - r * 0.45);
    }
  }

  const step = stepper(ctx.now);
  let hz = NaN, move = 0, lastTick = -1, wasLocked = false, clk = 0, textMs = 0, textCls = '';
  return {
    el: box, canvas: cv,
    /** @param {object} vm @param {object|null} pv live preview {nadirHz} or null */
    update(vm, pv) {
      const o = vm.obs, m = vm.mode || {}, dt = step(vm), rc = fin(o.f.rocofHzS);
      // raw: no clock, the watch's end, a new day
      const snap = !(dt > 0) || wasLocked || fin(o.tick) < lastTick || isNaN(hz);
      wasLocked = !!m.locked; lastTick = fin(o.tick); clk += dt * 1000;
      const fShow = shownHz(snap ? NaN : hz, vm, dt);
      // CHANGE per real second: RoCoF × the rate, as the readout moves
      move = snap ? 0 : ease(move, (fShow - hz) / dt, dt, HZ_TAU_S);
      hz = fShow;
      const ghost = pv && Number.isFinite(pv.nadirHz) ? pv.nadirHz : null;
      const c = o.contingency;
      const pin = c && (o.inWatch || m.locked) && Number.isFinite(c.extremeHz) ? c.extremeHz : null;
      draw(vm, fShow, ghost, pin);
      const cls = fShow < V.CONTAIN_LO_HZ || fShow > V.CONTAIN_HI_HZ ? 'crit' : fShow < V.NORMAL_LO_HZ || fShow > V.NORMAL_HI_HZ ? 'warn' : 'good';
      const fast = Math.abs(rc) > V.ROCOF_LIMIT_HZ_S;
      // outside an event, new figures at most once per TEXT_MS (a new colour at once)
      if (inEvent(m) || snap || cls !== textCls || clk - textMs >= TEXT_MS) {
        textMs = clk; textCls = cls;
        setText(big, (cls === 'good' ? '' : cls === 'warn' ? '! ' : '✕ ') + hz3(fShow) + ' Hz');
        setAttr(big, 'class', 'dk-hz ' + cls);
        setText(sub, (fast ? '✕ ' : '') + 'CHANGE ' + (m.locked || fast ? (rc >= 0 ? '+' : '−') + Math.abs(rc).toFixed(3) + ' Hz/s' :
          Math.abs(move) < STEADY_HZ_S ? 'steady' : move < 0 ? 'falling' : 'rising') + '\nSPIN ' + fin(o.f.ekGWs).toFixed(1) + ' GW·s');
        setCls(sub, 'crit', fast);
      }
      // The text alternative of the canvas (and of the panel that holds it): at most one change per real second.
      const alt = 'Frequency ' + hz3(fShow) + ' hertz, ' + (cls === 'good' ? 'in the normal band' : cls === 'warn' ? 'outside the normal band' :
        'outside the containment band') + ', change ' + rc.toFixed(3) + ' hertz per second' + (fast ? ' (above the limit)' : '') + ', spin ' +
        fin(o.f.ekGWs).toFixed(1) + ' gigawatt seconds' + (ghost !== null ? ', trip preview ' + ghost.toFixed(2) + ' hertz' : '') +
        (pin !== null ? ', nadir ' + pin.toFixed(2) + ' hertz' : '') + (o.mode === 'HAND' ? ', HAND mode' : '');
      slow(cv, 'aria-label', alt);
      setAttr(box, 'aria-label', cv.getAttribute('aria-label'));
      setCls(box, 'glow', !!(vm.glow && vm.glow.has('dial-freq')));
    },
  };
}

// ---------------------------------------------------------------- BALANCE bar

// [key, class, letter, name in the foot and the tooltip]
const SEGS = [
  ['schedMW', 'dk-seg-sched', 'GAP', 'gap'],
  ['inertiaMW', 'dk-seg-inertia', 'I', 'spin'],
  ['batteryMW', 'dk-seg-batt', 'B', 'battery'],
  ['governorsMW', 'dk-seg-gov', 'G', 'governors'],
  ['loadReliefMW', 'dk-seg-relief', 'R', 'load relief'],
  ['inverterMW', 'dk-seg-inv', 'V', 'solar and wind'],   // inVerters (Phase 2a, C-7): <= 0, wind and solar lowering above 50 Hz
];

/**
 * MW the SHED mark shows: the load of the customers who are dark (obs.demand.unservedMW). A view
 * without that key (before Phase 2a) falls back on the relay MW, never below zero.
 */
export function shedMarkMW(obs) {
  const u = obs.demand && obs.demand.unservedMW;
  return Math.max(0, typeof u === 'number' && Number.isFinite(u) ? u : fin(obs.balance && obs.balance.shedMW));
}

/** Scale (MW for half the bar) that fits the segments and `floorMW`: 100, 200, 500, 1000, 2000, 5000... */
export function barScale(seg, floorMW = 0) {
  let pos = 0, neg = 0;
  for (const [k] of SEGS) { const v = fin(seg[k]); if (v > 0) pos += v; else neg -= v; }
  const need = Math.max(pos, neg, fin(seg.shedMW), fin(floorMW)); // a negative relay MW (a net exporter dark) asks for no room
  for (const s of [100, 200, 500, 1000, 2000, 5000, 10000]) if (need <= s) return s;
  return 20000;
}

/** Left/width (% of the bar) of each segment: + stacks right of centre, - stacks left. `S`: a held scale. */
export function barLayout(seg, S = barScale(seg)) {
  let right = 0, left = 0;
  const out = [];
  for (const [k, cls, letter] of SEGS) {
    const v = fin(seg[k]);
    const w = Math.abs(v) / S * 50;
    let x;
    if (v >= 0) { x = 50 + right; right += w; } else { left += w; x = 50 - left; }
    out.push({k, cls, letter, mw: v, left: x, width: w});
  }
  return {scale: S, segs: out};
}

// The bar at the eye's speed (§29): at CRUISE a frame is two grid seconds of AGC hunting, so it
// shows an average over BAL_TAU_S real seconds.
export const BAL_TAU_S = 1;
const SEG_KEYS = SEGS.map(x => x[0]);

/**
 * The shown segments: `seg` averaged into `prev` over dtS real s, or `seg` itself when `snap` (the
 * watch) or on the first frame. Linear, so they still balance about zero (K-11); SHED sets no scale.
 */
export function smoothSeg(prev, seg, dtS, snap) {
  const out = {shedMW: 0};
  for (const k of SEG_KEYS) out[k] = !prev || snap ? fin(seg[k]) : ease(prev[k], fin(seg[k]), dtS, BAL_TAU_S);
  return out;
}

/** BALANCED inside ±BAL_IN_MW of gap, and until it passes ±BAL_OUT_MW; a carrier is named from CARRIER_MIN_MW. */
export const BAL_IN_MW = 15, BAL_OUT_MW = 25, CARRIER_MIN_MW = 5;
const mw10 = x => mw(Math.round(Math.abs(fin(x)) / 10) * 10);

/**
 * The bar's word ('BALANCED', 'SHORT', 'SURPLUS'; `was`: the last one) and its head, the gap in
 * 10-MW steps; `who`: the `n` biggest carriers on the side that covers the gap.
 */
export function balanceWord(seg, was = 'BALANCED', n = 2) {
  const g = fin(seg.schedMW);
  if (Math.abs(g) < BAL_IN_MW || (was === 'BALANCED' && Math.abs(g) <= BAL_OUT_MW)) return {word: 'BALANCED', head: 'BALANCED', who: ''};
  const word = g < 0 ? 'SHORT' : 'SURPLUS', side = g < 0 ? 1 : -1;
  const who = SEGS.slice(1).filter(([k]) => side * fin(seg[k]) >= CARRIER_MIN_MW).sort((x, y) => Math.abs(seg[y[0]]) - Math.abs(seg[x[0]]))
    .slice(0, n).map(([k, , , name]) => name + ' ' + mw10(seg[k]));
  return {word, head: word + ' ' + mw10(g) + ' MW', who: who.length ? (g < 0 ? 'held up by ' : 'soaked up by ') + who.join(' · ') : ''};
}

/** Real ms: the scale's hold, and the least time between two figures in the words. */
export const SCALE_HOLD_MS = 3000, TEXT_MS = 500;

/** The scale shown: grows to `fit` at once, shrinks once unneeded for SCALE_HOLD_MS (h = {s, t}). */
export function holdScale(h, fit, nowMs) {
  if (fit >= h.s || nowMs - h.t >= SCALE_HOLD_MS) { h.s = fit; h.t = nowMs; }
  return h.s;
}

/** Grid minutes in the trend, one column each. */
export const TREND_N = 30;

/** A trend column, % of the track's height from its middle: grey BALANCED, red below SHORT, blue above SURPLUS. */
export function trendColumn(gapMW, scale, word) {
  const g = fin(gapMW), h = Math.min(50, Math.abs(g) / scale * 50);
  return {cls: word === 'SHORT' ? 'short' : word === 'SURPLUS' ? 'surplus' : '', top: g < 0 ? 50 : 50 - h, height: h};
}

/** The segment the watch's caption is about glows. */
const BEAT_SEG = {inertia: 'inertiaMW', battery: 'batteryMW', governors: 'governorsMW'};

export function createImbalanceBar(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-panel dk-imb');
  box.id = 'bar-imbalance';
  box.setAttribute('role', 'group');   // not img: it holds the '?' button
  box.setAttribute('tabindex', '-1');
  const head = el(doc, 'div', 'dk-imb-head');
  const title = el(doc, 'span', 'dk-title', 'BALANCE');
  const txt = el(doc, 'span', 'dk-imb-text');
  head.append(title, txt);
  const track = el(doc, 'div', 'dk-imb-track');
  track.setAttribute('aria-hidden', 'true');   // the panel's label says it in words
  const trend = el(doc, 'div', 'dk-imb-trend');
  const cols = Array.from({length: TREND_N}, () => trend.appendChild(el(doc, 'i')));
  const zero = el(doc, 'i', 'dk-imb-zero');
  const segEls = SEGS.map(([, cls, letter]) => { const s = el(doc, 'i', 'dk-seg ' + cls); s.appendChild(el(doc, 'b', '', letter)); return s; });
  track.append(trend, zero, ...segEls);
  const foot = el(doc, 'div', 'dk-imb-foot');
  // most important first; the AGC note gives way (desk.css)
  const shed = el(doc, 'span', 'dk-imb-shed'), who = el(doc, 'span', 'dk-imb-who'), agcEl = el(doc, 'span', 'dk-imb-agc', '! AGC limit');
  const line = el(doc, 'span', 'dk-imb-l');
  line.append(shed, who);
  foot.append(line, agcEl);
  const q = el(doc, 'button', 'dk-q', '?');
  q.type = 'button'; q.id = 'q-imb';
  q.title = 'Supply minus demand, averaged over about a second. BALANCED: within 25 MW. SHORT: spin, the battery and ' +
    'governors are filling a hole, and they are what catches the next trip, so start a unit or raise a lever. AGC limit: the ' +
    'running units have no room left. Between trips, one column per grid minute, the newest on the right: ' +
    'red below the middle line is short, blue above it is surplus. After a trip: who caught the loss.';
  q.setAttribute('aria-label', 'What the balance bar means');
  q.addEventListener('click', () => { ctx.cue('button', PAN.gauge); ctx.note(box, q.title, 8000, 'info'); });
  box.append(head, track, foot, q);
  parent.appendChild(box);

  const slow = slowAttr(ctx.now), step = stepper(ctx.now), scale = {s: 0, t: 0}, trendMW = [];
  let shown, lim, lastTick = -1, word, clk = 0, textMs, trendMin, trendS = 0;
  const day = () => { shown = null; lim = false; word = 'BALANCED'; textMs = -Infinity; trendMin = -1; trendMW.length = 0; scale.s = 0; };
  day();
  return {
    el: box,
    update(vm) {
      const o = vm.obs, m = vm.mode || {}, dt = step(vm), raw = !(dt > 0);
      if (fin(o.tick) < lastTick) day();   // a new day
      lastTick = fin(o.tick); clk += dt * 1000;
      lim ||= Math.abs(fin(o.agc && o.agc.unmetMW)) > 0.5;   // AGC at its limit (it flickers there)
      shown = smoothSeg(shown, imbalanceSegments(o.balance, o.battery), dt, raw || !!m.locked);
      // in an event the stack, at the size of the hole the trip made; between events the trend
      const event = inEvent(m), c = o.contingency, fit = barScale(shown, event && c ? Math.abs(fin(c.lostMW)) : 0);
      const S = raw ? (scale.t = clk, scale.s = fit) : holdScale(scale, fit, clk);
      const shedMW = shedMarkMW(o), w = balanceWord(shown, word, shedMW > 0.5 ? 1 : 2);   // one beside SHED
      const beat = vm.watch && BEAT_SEG[vm.watch.beat];
      barLayout(shown, S).segs.forEach((s, i) => {
        setStyle(segEls[i], 'left', s.left.toFixed(2) + '%');
        setStyle(segEls[i], 'width', (event ? s.width : 0).toFixed(2) + '%');
        setAttr(segEls[i], 'title', SEGS[i][3] + ' ' + smw(s.mw) + ' MW');
        setCls(segEls[i], 'neg', s.mw < 0);
        setCls(segEls[i], 'glow', s.k === beat);
      });
      // a new word at once, new figures at most once per TEXT_MS
      if (raw || w.word !== word || clk - textMs >= TEXT_MS) {
        textMs = clk;
        setText(txt, w.head);
        setAttr(txt, 'class', 'dk-imb-text' + (w.word === 'SHORT' ? ' crit' : w.word === 'SURPLUS' ? ' warn' : ''));
        setText(who, w.who);
        setHidden(shed, !(shedMW > 0.5));
        setText(shed, '✕ SHED ' + mw(shedMW) + ' MW');
        setHidden(agcEl, w.word === 'BALANCED' || !lim);   // at the word's thresholds
        lim = false;
      }
      word = w.word;
      // the trend: the shown gap and word once a grid minute (at CRUISE 30 columns are 15 real s)
      const min = Math.floor(fin(o.s) / 60);
      if (min !== trendMin || S !== trendS) {
        if (min !== trendMin) { trendMin = min; trendMW.push([shown.schedMW, word]); if (trendMW.length > TREND_N) trendMW.shift(); }
        trendS = S;
        cols.forEach((e, i) => {
          const [g, wd] = trendMW[i - TREND_N + trendMW.length] || [], col = trendColumn(g, S, wd);   // newest on the right; none yet: flat
          setStyle(e, 'top', col.top.toFixed(1) + '%');
          setStyle(e, 'height', col.height.toFixed(1) + '%');
          setAttr(e, 'class', col.cls);
        });
      }
      setHidden(trend, event);
      setHidden(zero, !event);   // the trend has its own, across
      slow(box, 'aria-label', 'Balance: ' + w.head + '. Scheduled supply minus demand ' + smw(shown.schedMW) + ' MW, covered by spin ' +
        smw(shown.inertiaMW) + ', battery ' + smw(shown.batteryMW) + ', governors ' + smw(shown.governorsMW) + ', load relief ' +
        smw(shown.loadReliefMW) + (Math.abs(shown.inverterMW) > 0.5 ? ', wind and solar backing off ' + smw(shown.inverterMW) : '') + ' MW' +
        (shedMW > 0.5 ? '; shed ' + mw(shedMW) + ' MW' : ''));
      setCls(box, 'glow', !!(vm.glow && vm.glow.has('bar-imbalance')));
    },
  };
}

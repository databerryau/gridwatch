// desk/dial.js: K-11 frequency dial (canvas) and imbalance bar (DOM) (desk/README.md §6).
//
// Dial: 49-51 Hz; normal band green, out to 49.5/50.5 amber, beyond red; UFLS marked at 49.0; the
// needle (the 1-s average above 10×, F-4), the TRIP PREVIEW ghost needle, the nadir pin during a
// watch, a 3-decimal readout, CHANGE (RoCoF over 500 ms) and SPIN (stored energy, GW·s); "HAND"
// on the face in HAND mode. Imbalance bar: the scheduled gap and the BORROWED stack that covers
// it (inertia, battery, governors, load relief), plus SHED; segments sum to the swing-equation
// imbalance (calc.imbalanceSegments).
// The canvas is role="img"; its text alternative (K-23) changes at most once per real second.

import {V} from '../sim/params.js';
import {imbalanceSegments} from './calc.js';
import {el, setText, setAttr, setCls, setStyle, setHidden, slowAttr, mw, smw, hz3, fin, clamp, PAN} from './util.js';

export const DIAL_LO = 49, DIAL_HI = 51;
export const NEEDLE_AVG_ABOVE_X = 10;   // F-4: above 10× the needle shows the 1-s average

/**
 * The frequency the needle shows. Above 10× the last completed second's mean from vm.hist.freq
 * when the shell provides it (a number, or {hz|meanHz|fMeanHz}); otherwise obs.f.hz.
 */
export function needleHz(vm) {
  const f = fin(vm.obs.f && vm.obs.f.hz, V.F0_HZ);
  if (!(vm.mode && vm.mode.rate > NEEDLE_AVG_ABOVE_X)) return f;
  const h = vm.hist && vm.hist.freq;
  if (!Array.isArray(h) || !h.length) return f;
  const last = h[h.length - 1];
  const v = typeof last === 'number' ? last : last && (last.meanHz ?? last.fMeanHz ?? last.hz);
  return Number.isFinite(v) ? v : f;
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
  q.addEventListener('click', () => { ctx.cue('button', PAN.gauge); ctx.note(box, q.title, 8000); });
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

  return {
    el: box, canvas: cv,
    /** @param {object} vm @param {object|null} pv live preview {nadirHz} or null */
    update(vm, pv) {
      const o = vm.obs, fShow = needleHz(vm);
      const ghost = pv && Number.isFinite(pv.nadirHz) ? pv.nadirHz : null;
      const c = o.contingency;
      const pin = c && (o.inWatch || (vm.mode && vm.mode.locked)) && Number.isFinite(c.extremeHz) ? c.extremeHz : null;
      draw(vm, fShow, ghost, pin);
      const cls = fShow < V.CONTAIN_LO_HZ || fShow > V.CONTAIN_HI_HZ ? 'crit' : fShow < V.NORMAL_LO_HZ || fShow > V.NORMAL_HI_HZ ? 'warn' : 'good';
      setText(big, (cls === 'good' ? '' : cls === 'warn' ? '! ' : '✕ ') + hz3(fShow) + ' Hz');
      setAttr(big, 'class', 'dk-hz ' + cls);
      const rc = fin(o.f.rocofHzS);
      const fast = Math.abs(rc) > V.ROCOF_LIMIT_HZ_S;
      setText(sub, (fast ? '✕ ' : '') + 'CHANGE ' + (rc >= 0 ? '+' : '−') + Math.abs(rc).toFixed(3) + ' Hz/s · SPIN ' + fin(o.f.ekGWs).toFixed(1) + ' GW·s' +
        (vm.mode && vm.mode.rate > NEEDLE_AVG_ABOVE_X ? ' · 1-s avg' : ''));
      setCls(sub, 'crit', fast);
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

// ---------------------------------------------------------------- imbalance bar

const SEGS = [
  ['schedMW', 'dk-seg-sched', 'GAP'],
  ['inertiaMW', 'dk-seg-inertia', 'I'],
  ['batteryMW', 'dk-seg-batt', 'B'],
  ['governorsMW', 'dk-seg-gov', 'G'],
  ['loadReliefMW', 'dk-seg-relief', 'R'],
];

/** Scale (MW for half the bar) that fits the segments: 100, 200, 500, 1000, 2000, 5000... */
export function barScale(seg) {
  let pos = 0, neg = 0;
  for (const [k] of SEGS) { const v = seg[k]; if (v > 0) pos += v; else neg -= v; }
  const need = Math.max(pos, neg, fin(seg.shedMW));
  for (const s of [100, 200, 500, 1000, 2000, 5000, 10000]) if (need <= s) return s;
  return 20000;
}

/** Left/width (% of the bar) of each segment: + stacks right of centre, - stacks left. */
export function barLayout(seg) {
  const S = barScale(seg);
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

export function createImbalanceBar(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-panel dk-imb');
  box.id = 'bar-imbalance';
  box.setAttribute('role', 'img');
  box.setAttribute('tabindex', '-1');
  const head = el(doc, 'div', 'dk-imb-head');
  const title = el(doc, 'span', 'dk-title', 'IMBALANCE');
  const txt = el(doc, 'span', 'dk-imb-text');
  head.append(title, txt);
  const track = el(doc, 'div', 'dk-imb-track');
  const zero = el(doc, 'i', 'dk-imb-zero');
  const segEls = SEGS.map(([, cls, letter]) => { const s = el(doc, 'i', 'dk-seg ' + cls); s.appendChild(el(doc, 'b', '', letter)); return s; });
  track.append(zero, ...segEls);
  const foot = el(doc, 'div', 'dk-imb-foot');
  const shed = el(doc, 'span', 'dk-imb-shed'), unmet = el(doc, 'span', 'dk-unmet');
  foot.append(shed, unmet);
  box.append(head, track, foot);
  parent.appendChild(box);
  return {
    el: box,
    update(vm) {
      const o = vm.obs, seg = imbalanceSegments(o.balance), lay = barLayout(seg);
      lay.segs.forEach((s, i) => {
        setStyle(segEls[i], 'left', s.left.toFixed(2) + '%');
        setStyle(segEls[i], 'width', s.width.toFixed(2) + '%');
        setAttr(segEls[i], 'title', s.k.replace(/MW$/, '') + ' ' + smw(s.mw) + ' MW');
        setCls(segEls[i], 'neg', s.mw < 0);
      });
      setText(txt, 'GAP ' + smw(seg.schedMW) + ' · BORROWED ' + smw(seg.borrowedMW) + ' · ±' + lay.scale);
      setHidden(shed, !(seg.shedMW > 0.5));
      setText(shed, '✕ SHED ' + mw(seg.shedMW) + ' MW');
      const un = fin(o.agc && o.agc.unmetMW);
      setHidden(unmet, !(Math.abs(un) > 0.5));
      setText(unmet, '! AGC UNMET ' + smw(un) + ' MW');
      setAttr(box, 'aria-label', 'Imbalance: scheduled supply minus demand ' + smw(seg.schedMW) + ' MW, covered by inertia ' +
        smw(seg.inertiaMW) + ', battery ' + smw(seg.batteryMW) + ', governors ' + smw(seg.governorsMW) + ', load relief ' +
        smw(seg.loadReliefMW) + ' MW' + (seg.shedMW > 0.5 ? '; shed ' + mw(seg.shedMW) + ' MW' : ''));
      setCls(box, 'glow', !!(vm.glow && vm.glow.has('bar-imbalance')));
    },
  };
}

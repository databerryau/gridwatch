// desk/rotary.js: K-4 hydro gate wheel, K-5 battery dial + GUARD ring, K-6 tie knob
// (desk/README.md §6). DOM controls with role="slider" (K-23): drag in a circle, keys, scroll.
// Each sends its sim input on release / key-up and shows the vm's applied value otherwise.
// Foley (K-20): a turn cues `detent` across a detent (every GUARD step, the tie's detents, the
// battery's IDLE) or else `ratchet`; the hydro gate cues `gate` when a new setting is taken.

import {V} from '../sim/params.js';
import {waterLastsUntilS, redArcFromMW, knobValue, knobAngle, pointerAngle, guardFromAngle, tieSnap, TIE_DETENTS,
  nextDetent, wrapDeg, KNOB_SWEEP, GUARD_MAX_MW} from './calc.js';
import {createMachine, stationKey, nothingTo, rejoinPlan, help, lockedPress, lockKeys} from './levers.js';
import {el, control, setText, setAttr, setCls, setStyle, setHidden, mw, smw, clamp, fin, clockOf, mmss, PAN} from './util.js';

export const WHEEL_MW_PER_TURN = 250;   // K-4: one full turn of the hand wheel
export const SEND_IDLE_MS = 250;        // scroll / key auto-repeat: send after this long idle
export const PREVIEW_LINGER_MS = 1500;  // K-5: the guard ghost stays this long after the last turn
export const SHAKE_MS = 600;            // K-12: a rough close shakes the wheel this long
export const TIE_STEP_MW = 50, BATT_STEP_MW = 50, FINE_MW = 10, FINEST_MW = 1;   // §13.3 key steps (Shift: 10, Ctrl: 1)
const HYDRO = V.STATIONS.hydro;
const keyStep = (ev, coarse) => (ev.ctrlKey ? FINEST_MW : ev.shiftKey ? FINE_MW : coarse);

/**
 * Shared rotary behaviour. o: {id, cls, label, value(), bounds() -> [lo, hi], angleValue(deg) or
 * null (relative wheel), perTurn (relative), step(ev, v) -> v | null, snap(v) (always), dragSnap(v) (drags only), send(v), turning(v),
 * detents() -> MW values that thump when passed (else a move ratchets), pan, shortcut (aria-keyshortcuts),
 * host (its box, for notes), needs() -> '' or what it needs to turn (said as help)}
 */
function makeRotary(ctx, o) {
  const doc = ctx.doc;
  const knob = control(doc, 'div', 'dk-knob ' + o.cls, 'slider', o.id, o.label);
  if (o.shortcut) knob.setAttribute('aria-keyshortcuts', o.shortcut);
  const feelSt = {};
  const feel = (a, b) => ctx.feel(feelSt, Math.round(a), Math.round(b), o.detents ? o.detents() : null, null, o.pan);
  const pointer = el(doc, 'i', 'dk-pointer');
  knob.appendChild(pointer);
  let drag = null, pending = null, shown = null;
  const cur = () => (drag ? drag.v : pending ? pending.v : shown ? shown.v : o.value());
  const center = () => { const r = knob.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function apply(v, dragging) { const [lo, hi] = o.bounds(); v = clamp(v, lo, hi); return o.snap ? o.snap(v) : dragging && o.dragSnap ? o.dragSnap(v) : Math.round(v); }
  function commit(v) {
    if (ctx.locked()) return;
    const r = o.send(v);
    shown = r ? null : {v, afterTick: ctx.vm().obs.tick, frames: 0};
  }
  const needs = () => { const n = o.needs ? o.needs() : ''; if (n) help(ctx, o.host, n); return !!n; };
  knob.addEventListener('pointerdown', ev => {
    if (!ctx.vm() || lockedPress(ctx, o.host) || needs()) return;
    ev.stopPropagation && ev.stopPropagation();
    knob.setPointerCapture && knob.setPointerCapture(ev.pointerId);
    const [cx, cy] = center();
    const a = pointerAngle(cx, cy, ev.clientX, ev.clientY);
    drag = {v: cur(), a, v0: cur()};
    if (o.angleValue) { drag.v = apply(o.angleValue(a), true); feel(drag.v0, drag.v); }
    if (o.turning) o.turning(drag.v);
    knob.focus && knob.focus();
    o.render();
  });
  knob.addEventListener('pointermove', ev => {
    if (!drag) return;
    const [cx, cy] = center();
    const a = pointerAngle(cx, cy, ev.clientX, ev.clientY);
    let v;
    if (o.angleValue) v = apply(o.angleValue(a), true);
    else { const da = wrapDeg(a - drag.a); drag.a = a; v = clamp(drag.v + da / 360 * o.perTurn, ...o.bounds()); }
    const changed = apply(v, true) !== apply(drag.v, true);
    if (changed) feel(apply(drag.v, true), apply(v, true));
    drag.v = v;
    if (changed && o.turning) o.turning(apply(v, true));
    o.render();
  });
  const release = () => {
    if (!drag) return;
    const v = apply(drag.v, true), v0 = drag.v0;
    drag = null;
    if (Math.round(v) !== Math.round(v0)) commit(v);
    o.render();
  };
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);
  knob.addEventListener('lostpointercapture', release);
  knob.addEventListener('keydown', ev => {
    if (!ctx.vm() || ctx.locked()) return;
    if (/^(Arrow|Page|Home$|End$)/.test(ev.key) && needs()) { ev.preventDefault(); return; }
    const t = o.step(ev, cur());
    if (t === null || t === undefined) return;
    ev.preventDefault();
    const v = apply(t);
    feel(cur(), v);
    pending = {v, t: pending ? pending.t : ctx.now()};
    if (o.turning) o.turning(v);
    o.render();
  });
  knob.addEventListener('keyup', () => flush());
  knob.addEventListener('wheel', ev => {
    if (!ctx.vm() || !o.wheelStep || lockedPress(ctx, o.host) || needs()) return;
    ev.preventDefault && ev.preventDefault();
    const v = apply(cur() + (fin(ev.deltaY) < 0 ? 1 : -1) * o.wheelStep(ev));
    feel(cur(), v);
    pending = {v, t: ctx.now()};
    if (o.turning) o.turning(v);
    o.render();
  });
  function flush() {
    if (!pending) return;
    const v = pending.v;
    pending = null;
    if (Math.round(v) !== Math.round(o.value())) commit(v);
    o.render();
  }
  return {
    knob, pointer, cur,
    moving: () => !!(drag || pending),
    tick(vm) {
      if (shown && (vm.obs.tick > shown.afterTick || ++shown.frames >= 2)) shown = null;
      if (ctx.locked()) { drag = null; pending = null; }
      if (pending && ctx.now() - pending.t >= SEND_IDLE_MS) flush();
    },
  };
}

// ---------------------------------------------------------------- K-4 hydro gate wheel

export function createHydroWheel(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-rot dk-hydro');
  box.dataset.station = 'hydro';
  const title = el(doc, 'div', 'dk-rot-title', 'HYDRO');
  const face = el(doc, 'div', 'dk-rot-face');
  const rim = el(doc, 'div', 'dk-rim');
  const water = el(doc, 'div', 'dk-water');
  let vm = null, shakeUntil = -1;
  const so = () => vm.obs.stations.find(x => x.id === 'hydro') || {basePointMW: 0, outMW: 0, onCount: 0, minMW: 0, maxMW: 0};
  const r = makeRotary(ctx, {
    id: 'wheel-hydro', cls: 'dk-wheel', label: 'Hydro gate wheel', pan: PAN.hydro, shortcut: '6', host: box,
    value: () => fin(so().basePointMW),
    bounds: () => [fin(so().minMW), Math.max(fin(so().minMW), fin(so().maxMW))],
    angleValue: null, perTurn: WHEEL_MW_PER_TURN,
    step(ev, v) {
      const k = ev.key, st = (ev.shiftKey ? 0.1 : 0.01) * HYDRO.totalMW;
      if (k === 'ArrowRight' || k === 'ArrowUp') return v + st;
      if (k === 'ArrowLeft' || k === 'ArrowDown') return v - st;
      if (k === 'PageUp') return v + 0.1 * HYDRO.totalMW;
      if (k === 'PageDown') return v - 0.1 * HYDRO.totalMW;
      if (k === 'Home') return 0;
      if (k === 'End') return HYDRO.totalMW;
      return null;
    },
    wheelStep: ev => (ev.shiftKey ? 0.1 : 0.01) * HYDRO.totalMW,
    needs: () => (so().onCount > 0 ? '' : 'no hydro machine on: START one (S S)'),
    send(v) {
      if (!(so().onCount > 0)) { help(ctx, box, 'no hydro machine on: START one (S S)'); return 'no machine on'; }
      const res = ctx.send({type: 'basePoint', station: 'hydro', mw: Math.round(v)}, box);
      if (!res) { ctx.cue('gate', PAN.hydro); ctx.live('HYDRO gate ' + Math.round(v) + ' MW'); }
      return res;
    },
    render: () => render(),
  });
  const spokes = el(doc, 'i', 'dk-spokes');
  r.knob.appendChild(spokes);
  face.append(rim, water, r.knob);
  const lasts = el(doc, 'div', 'dk-lasts');
  const store = el(doc, 'div', 'dk-store');
  const machCol = el(doc, 'div', 'dk-machs');
  const machines = [];
  for (let k = HYDRO.first; k < HYDRO.first + HYDRO.count; k++) { const m = createMachine(ctx, k, PAN.hydro); machines.push(m); machCol.appendChild(m.el); }
  const left = el(doc, 'div', 'dk-rot-main');
  left.append(title, face, lasts, store);
  box.append(left, machCol);
  parent.appendChild(box);
  lockKeys(ctx, box, 'sxp');
  // P / Shift+P on the wheel (K-2, L-6), the desk's answer (the shell's map would only refuse it in red)
  const rejoin = keep => rejoinPlan(ctx, box, 'hydro', keep, 'a turn takes it off, P puts it back', PAN.hydro);
  box.addEventListener('keydown', ev => {
    if ((ev.key || '').toLowerCase() !== 'p' || ev.ctrlKey || ev.altKey || ev.metaKey || ev.defaultPrevented) return;
    ev.preventDefault();
    if (!ev.repeat) rejoin(ev.shiftKey);
  });

  function render() {
    if (!vm) return;
    const o = vm.obs, s = so(), v = r.cur();
    const T = HYDRO.totalMW;
    // Hand wheel turns as the gate opens; the rim is the gate scale, red where the water would
    // run out before the forecast peak ends (K-4).
    setStyle(spokes, 'transform', 'rotate(' + (fin(v) / WHEEL_MW_PER_TURN * 360).toFixed(1) + 'deg)');
    const red = redArcFromMW(o.s, o.hydro.storageMWh, o.forecast);
    const aNow = knobAngle(v, 0, T) + KNOB_SWEEP / 2;
    const aRed = red === null ? KNOB_SWEEP : clamp(knobAngle(red, 0, T) + KNOB_SWEEP / 2, 0, KNOB_SWEEP);
    setStyle(rim, 'background', 'conic-gradient(from ' + (-KNOB_SWEEP / 2) + 'deg, var(--dk-rim) 0deg ' + aRed.toFixed(1) +
      'deg, var(--dk-red) ' + aRed.toFixed(1) + 'deg ' + KNOB_SWEEP + 'deg, transparent ' + KNOB_SWEEP + 'deg)');
    setStyle(r.pointer, 'transform', 'rotate(' + (aNow - KNOB_SWEEP / 2).toFixed(1) + 'deg)');
    setStyle(water, 'height', (clamp(fin(o.hydro.frac), 0, 1) * 100).toFixed(1) + '%');
    const until = waterLastsUntilS(o.s, o.hydro.storageMWh, v);
    const inRed = red !== null && v > red;
    const dayEnd = V.DAY_S;
    setText(lasts, v <= 0 ? 'GATE SHUT' : until >= dayEnd ? 'LASTS ALL DAY' : (inRed ? '✕ ' : '') + 'LASTS ' + clockOf(until));
    setCls(lasts, 'crit', inRed);
    setText(store, 'OUT ' + mw(s.outMW) + ' MW · ' + Math.round(fin(o.hydro.frac) * 100) + '%');
    setAttr(store, 'title', 'Output now, and the reservoir: ' + mw(o.hydro.storageMWh) + ' MWh');
    setCls(box, 'hand', o.mode === 'HAND');
    setCls(box, 'moving', r.moving());
    setCls(box, 'glow', !!(vm.glow && vm.glow.has('wheel-hydro')));
    setCls(box, 'shake', ctx.now() < shakeUntil && !ctx.rm());
    setAttr(r.knob, 'aria-valuemin', 0);
    setAttr(r.knob, 'aria-valuemax', T);
    setAttr(r.knob, 'aria-valuenow', Math.round(v));
    setAttr(r.knob, 'aria-valuetext', 'hydro gate ' + mw(v) + ' MW, output ' + mw(s.outMW) + ' MW, ' +
      (v <= 0 ? 'gate shut' : until >= dayEnd ? 'water lasts all day' : 'water lasts until ' + clockOf(until)) +
      (red !== null ? ', settings above ' + mw(red) + ' MW empty the dam before the peak ends' : ''));
    setAttr(r.knob, 'aria-disabled', ctx.locked() ? 'true' : 'false');
  }
  return {
    el: box, knob: r.knob, machines,
    update(v) { vm = v; r.tick(v); for (const m of machines) m.update(v); render(); },
    /** S, X, P (Shift: KEEP) for a target in the wheel's box; true if handled. */
    key(target, k, shift) {
      if (!target || !box.contains(target)) return false;
      if (k === 'p') { rejoin(shift); return true; }
      if (stationKey(machines, k)) return true;
      nothingTo(ctx, box, machines, k);
      return false;
    },
    /** K-12: a rough close on a hydro machine (no shake under reduced motion). */
    shake() { shakeUntil = ctx.now() + SHAKE_MS; },
  };
}

// ---------------------------------------------------------------- K-5 battery dial + GUARD ring

export function createBatteryDial(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-rot dk-batt');
  const title = el(doc, 'div', 'dk-rot-title');
  const soc = el(doc, 'span', 'dk-soc');
  title.append(el(doc, 'span', '', 'BATT'), soc);
  const face = el(doc, 'div', 'dk-rot-face dk-batt-face');
  let vm = null, lastTurnT = -1, previewMW = null;
  let mag = BATT_STEP_MW;   // the magnitude the mode keys (←/→) switch on: the last non-zero order, or what ↑/↓ set in IDLE
  const bt = () => vm.obs.battery;
  const avail = () => Math.max(0, fin(bt().ratedMW, V.BATT_MW) - fin(bt().guardMW));
  const signed = () => (bt().mode === 'charge' ? -1 : bt().mode === 'discharge' ? 1 : 0) * fin(bt().orderMW);

  // GUARD ring (outer): 0..500 MW in 50-MW detents; turning it re-runs TRIP PREVIEW live.
  const ring = makeRotary(ctx, {
    id: 'ring-guard', cls: 'dk-ring', label: 'GUARD ring: battery MW held back to catch trips', pan: PAN.battery, shortcut: 'G', host: box,
    detents: () => { const d = []; for (let x = 0; x <= GUARD_MAX_MW; x += V.GUARD_STEP_MW) d.push(x); return d; },
    value: () => fin(bt().guardMW),
    bounds: () => [0, GUARD_MAX_MW],
    angleValue: a => guardFromAngle(a),
    snap: v => clamp(Math.round(v / V.GUARD_STEP_MW) * V.GUARD_STEP_MW, 0, GUARD_MAX_MW),
    step(ev, v) {
      const k = ev.key;
      if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'PageUp') return v + V.GUARD_STEP_MW;
      if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 'PageDown') return v - V.GUARD_STEP_MW;
      if (k === 'Home') return 0;
      if (k === 'End') return GUARD_MAX_MW;
      return null;
    },
    wheelStep: () => V.GUARD_STEP_MW,
    turning(v) {
      lastTurnT = ctx.now();
      if (v !== previewMW) { previewMW = v; ctx.ui({do: 'previewGuard', mw: v}); }
    },
    send(v) {
      const r = ctx.send({type: 'guard', mw: v}, box);
      if (!r) ctx.live('GUARD ' + v + ' MW');
      return r;
    },
    render: () => render(),
  });
  // Dial (inner): CHARGE ← IDLE → DISCHARGE, magnitude up to the MW not on guard.
  const dial = makeRotary(ctx, {
    id: 'dial-battery', cls: 'dk-bdial', label: 'Battery dial: charge, idle or discharge', pan: PAN.battery, shortcut: '7', host: box,
    detents: () => [0],
    value: () => clamp(signed(), -avail(), avail()),
    bounds: () => [-avail(), avail()],
    angleValue: a => knobValue(a, -avail(), avail()),
    dragSnap: v => (Math.abs(v) <= 15 ? 0 : Math.round(v)),
    // Keys (§13.3): ←/→ step the mode CHARGE ← IDLE → DISCHARGE at the magnitude last set; ↑/↓ change
    // the magnitude of the present mode (in IDLE: the magnitude the next mode step will order).
    step(ev, v) {
      const k = ev.key, a = avail(), m = Math.sign(v);
      if (v !== 0) mag = Math.abs(v);
      if (k === 'ArrowLeft' || k === 'ArrowRight') return clamp(m + (k === 'ArrowRight' ? 1 : -1), -1, 1) * Math.min(mag, a);
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'PageUp' || k === 'PageDown') {
        const up = k === 'ArrowUp' || k === 'PageUp', st = k.startsWith('Page') ? BATT_STEP_MW : keyStep(ev, BATT_STEP_MW);
        const nm = clamp((m ? Math.abs(v) : mag) + (up ? st : -st), 0, a);
        if (m === 0) { mag = Math.max(nm, FINEST_MW); ctx.live('BATTERY IDLE: ←/→ orders ' + mw(mag) + ' MW'); return 0; }
        return m * nm;
      }
      if (k === 'Home') return -a;
      if (k === 'End') return a;
      return null;
    },
    wheelStep: ev => (ev.shiftKey ? 1 : 10),
    needs: () => (avail() > 0 ? '' : 'all on GUARD: turn the ring down (G, then ↓)'),
    send(v) {
      const mode = v > 0 ? 'discharge' : v < 0 ? 'charge' : 'idle';
      const r = ctx.send({type: 'battery', mode, mw: Math.abs(Math.round(v))}, box);
      if (!r) ctx.live('BATTERY ' + mode + ' ' + Math.abs(Math.round(v)) + ' MW');
      return r;
    },
    render: () => render(),
  });
  ring.knob.title = 'GUARD: drag around the outer ring (or G, then ↑ ↓), ' + V.GUARD_STEP_MW + ' MW a step';
  const arc = el(doc, 'div', 'dk-batt-arc');
  face.append(ring.knob, arc, dial.knob);
  const read = el(doc, 'div', 'dk-rot-read');
  read.title = 'Your order (CHG / IDLE / DIS), then OUT: what the battery does now, MW (− charging; AGC trims it)';
  const lamps = el(doc, 'div', 'dk-lamps');
  const ffr = el(doc, 'span', 'dk-lamp dk-ffr'), full = el(doc, 'span', 'dk-lamp dk-full');
  lamps.append(ffr);
  title.appendChild(lamps);
  box.append(title, face, read, full);
  parent.appendChild(box);
  lockKeys(ctx, box);

  function render() {
    if (!vm) return;
    const b = bt(), g = ring.cur(), v = dial.cur(), a = avail();
    setStyle(ring.pointer, 'transform', 'rotate(' + knobAngle(g, 0, GUARD_MAX_MW).toFixed(1) + 'deg)');
    setStyle(dial.pointer, 'transform', 'rotate(' + knobAngle(v, -a, a).toFixed(1) + 'deg)');
    // The dial's travel shrinks as the guard grows (K-5): the unusable part of the sweep is shaded.
    const lost = KNOB_SWEEP / 2 * (1 - a / fin(b.ratedMW, V.BATT_MW));
    setStyle(arc, 'background', 'conic-gradient(from ' + (-KNOB_SWEEP / 2) + 'deg, var(--dk-shade) 0deg ' + lost.toFixed(1) +
      'deg, transparent ' + lost.toFixed(1) + 'deg ' + (KNOB_SWEEP - lost).toFixed(1) + 'deg, var(--dk-shade) ' +
      (KNOB_SWEEP - lost).toFixed(1) + 'deg ' + KNOB_SWEEP + 'deg, transparent ' + KNOB_SWEEP + 'deg)');
    // IDLE, dial focused: the MW ←/→ will order (↑/↓ set it)
    setText(read, (v > 0 ? '▲ DIS ' + mw(v) : v < 0 ? '▼ CHG ' + mw(-v) : '■ IDLE' + (doc.activeElement === dial.knob ? ' ◀▶ ' + mw(Math.min(mag, a)) : '')) +
      ' · OUT ' + smw(b.outMW).replace('+', ''));
    setText(soc, Math.round(fin(b.socMWh) / fin(b.capMWh, V.BATT_MWH) * 100) + '%');
    setAttr(soc, 'title', 'state of charge ' + mw(b.socMWh) + ' of ' + mw(b.capMWh) + ' MWh');
    setText(ffr, b.guardFired ? '⚡ FIRED ' + mw(b.ffrMW) : (g > 0 ? '⚡ GUARD ' : '○ GUARD ') + mw(g));
    setCls(ffr, 'lit', g > 0 && !b.guardFired);
    setCls(ffr, 'fired', !!b.guardFired);
    setAttr(ffr, 'title', 'FFR ARMED: ' + mw(g) + ' MW held back on the GUARD ring, delivered within 1 s of a trip');
    setText(full, b.fullHold ? 'F FULL–HOLD' : b.ufSuspend ? '! UF HOLD' : '');
    setHidden(full, !(b.fullHold || b.ufSuspend));
    setCls(full, 'lit', !!(b.fullHold || b.ufSuspend));
    setCls(box, 'glow', !!(vm.glow && vm.glow.has('dial-battery')));
    setCls(ring.knob, 'glow', !!(vm.glow && vm.glow.has('ring-guard')));
    for (const [k, lo, hi, now, text] of [[ring.knob, 0, GUARD_MAX_MW, g, 'GUARD ' + mw(g) + ' MW' + (b.guardFired ? ' (fired)' : '')],
      [dial.knob, -a, a, v, (v > 0 ? 'discharge ' + mw(v) : v < 0 ? 'charge ' + mw(-v) : 'idle, mode keys order ' + mw(Math.min(mag, a))) +
        ' MW of ' + mw(a) + ' beside the guard, output ' + smw(b.outMW) + ' MW, charge ' +
        Math.round(fin(b.socMWh) / fin(b.capMWh, V.BATT_MWH) * 100) + '%' + (b.fullHold ? ', FULL–HOLD' : '')]]) {
      setAttr(k, 'aria-valuemin', Math.round(lo));
      setAttr(k, 'aria-valuemax', Math.round(hi));
      setAttr(k, 'aria-valuenow', Math.round(now));
      setAttr(k, 'aria-valuetext', text);
      setAttr(k, 'aria-disabled', ctx.locked() ? 'true' : 'false');
    }
  }
  return {
    el: box, ring: ring.knob, dial: dial.knob,
    update(v) {
      vm = v;
      ring.tick(v); dial.tick(v);
      if (!dial.moving() && signed() !== 0) mag = Math.abs(signed());
      if (previewMW !== null && !ring.moving() && ctx.now() - lastTurnT >= PREVIEW_LINGER_MS) {
        previewMW = null;
        ctx.ui({do: 'previewGuard', mw: null});
      }
      render();
    },
  };
}

// ---------------------------------------------------------------- K-6 tie knob

/** Tie MW in words: 'IMP 250' (+, in), 'EXP 300' (−, out), '0'. */
export const tieWords = x => { const r = Math.round(fin(x)); return (r > 0 ? 'IMP ' : r < 0 ? 'EXP ' : '') + Math.abs(r); };

export function createTieKnob(ctx, parent) {
  const doc = ctx.doc;
  const box = el(doc, 'div', 'dk-rot dk-tie');
  const title = el(doc, 'div', 'dk-rot-title');
  title.append(el(doc, 'span', '', 'TIE'));
  const face = el(doc, 'div', 'dk-rot-face');
  const rim = el(doc, 'div', 'dk-rim');
  const flow = el(doc, 'i', 'dk-flow');
  let vm = null;
  const t = () => vm.obs.tie;
  const k = makeRotary(ctx, {
    id: 'knob-tie', cls: 'dk-tknob', label: 'Interconnector knob: + import, − export', pan: PAN.tie, shortcut: '8', host: box,
    detents: () => TIE_DETENTS,
    value: () => fin(t().setMW),
    bounds: () => [-V.TIE_MAX_MW, V.TIE_MAX_MW],
    angleValue: a => knobValue(a, -V.TIE_MAX_MW, V.TIE_MAX_MW),
    dragSnap: v => tieSnap(v),
    step(ev, v) {
      const key = ev.key, st = keyStep(ev, TIE_STEP_MW);
      if (key === 'ArrowUp' || key === 'ArrowRight') return v + st;
      if (key === 'ArrowDown' || key === 'ArrowLeft') return v - st;
      if (key === 'PageUp') return nextDetent(v, TIE_DETENTS, 1);
      if (key === 'PageDown') return nextDetent(v, TIE_DETENTS, -1);
      if (key === 'Home') return -V.TIE_MAX_MW;
      if (key === 'End') return V.TIE_MAX_MW;
      return null;
    },
    wheelStep: ev => (ev.shiftKey ? 1 : 10),
    send(v) {
      const r = ctx.send({type: 'tie', mw: Math.round(v)}, box);
      if (!r) ctx.live('TIE ' + smw(v) + ' MW');
      return r;
    },
    render: () => render(),
  });
  face.append(rim, flow, k.knob);
  const read = el(doc, 'div', 'dk-rot-read');
  const rSet = el(doc, 'span', 'dk-tie-set'), rFlow = el(doc, 'span', 'dk-tie-flow');
  read.append(rSet, rFlow);
  const lamp = el(doc, 'span', 'dk-lamp dk-link');
  title.appendChild(lamp);
  box.append(title, face, read);
  parent.appendChild(box);
  lockKeys(ctx, box);

  function render() {
    if (!vm) return;
    const tt = t(), v = k.cur();
    const cap = fin(tt.exportLimitMW, V.TIE_MAX_MW);
    // The export cap (F-13) as a red arc from -800 to -cap.
    const aCap = knobAngle(-cap, -V.TIE_MAX_MW, V.TIE_MAX_MW) + KNOB_SWEEP / 2;
    setStyle(rim, 'background', 'conic-gradient(from ' + (-KNOB_SWEEP / 2) + 'deg, var(--dk-red) 0deg ' + aCap.toFixed(1) +
      'deg, var(--dk-rim) ' + aCap.toFixed(1) + 'deg ' + KNOB_SWEEP + 'deg, transparent ' + KNOB_SWEEP + 'deg)');
    setStyle(k.pointer, 'transform', 'rotate(' + knobAngle(v, -V.TIE_MAX_MW, V.TIE_MAX_MW).toFixed(1) + 'deg)');
    setStyle(flow, 'transform', 'rotate(' + knobAngle(tt.flowMW, -V.TIE_MAX_MW, V.TIE_MAX_MW).toFixed(1) + 'deg)');
    setText(rSet, 'SET ' + tieWords(v));
    setText(rFlow, 'FLOW ' + tieWords(tt.flowMW));
    setText(lamp, tt.tripped ? '✕ TRIP ' + mmss(tt.lockoutS) : '● LINK OK');
    setCls(lamp, 'crit', !!tt.tripped);
    setCls(lamp, 'lit', !tt.tripped);
    setCls(box, 'capped', cap < V.TIE_MAX_MW);
    setCls(box, 'glow', !!(vm.glow && vm.glow.has('knob-tie')));
    setAttr(k.knob, 'aria-valuemin', -V.TIE_MAX_MW);
    setAttr(k.knob, 'aria-valuemax', V.TIE_MAX_MW);
    setAttr(k.knob, 'aria-valuenow', Math.round(v));
    setAttr(k.knob, 'aria-valuetext', 'tie set ' + smw(v) + ' MW (+ import), flow ' + smw(tt.flowMW) + ' MW, export cap ' + mw(cap) +
      ' MW' + (tt.tripped ? ', link tripped' : ''));
    setAttr(k.knob, 'aria-disabled', ctx.locked() ? 'true' : 'false');
  }
  return {el: box, knob: k.knob, update(v) { vm = v; k.tick(v); render(); }};
}

// desk/levers.js: K-1 motorised unit levers and the K-3 machine guards (desk/README.md §6).
//
// One lever per station (COAL, CCGT, GT·A, GT·B, GT·C). The handle is the station's base point
// (the plan's now-edge, obs.stations[].basePointMW); behind it the output needle (outMW), the AGC
// band bracket (base ± band, K-2), the 10-grid-minute ramp cone, detent ticks at MIN/25/50/75%,
// the 96% spring gate with its red zone (H-2 trip risk) and a tick for the next plan keyframe.
// A drag sends `basePoint` on release (and at most every 250 ms while dragging); ↑/↓ ±10 MW,
// Shift ±1, PgUp/PgDn next detent; crossing the gate needs 12 px of extra drag or Shift+↑.
// An idle station's lever books its start through the plan (`planKey`, AGC mode, L-6).
// One lamp per machine with its own START and STOP guards (lift, then press; S S / X X).
// Phase 2a (C-10, desk/README.md §19.5): a guard lights when its id is in vm.glow (the
// objective's STOP or START), and tells the desk when it is hovered, focused, lifted or
// committed (ctx.consider), so the shell can say what the press will do before it is made.
// Foley (K-20): a hand move cues `detent` / `gate` / `ratchet`, a plan move cues `servo`; guards
// cue `cover` (lift, drop) and `button` (the press that commits). A rough close shakes the lever.

import {V} from '../sim/params.js';
import {leverScale, nextDetent, rampCone, agcBandMW, stationUnits} from './calc.js';
import {el, control, setText, setAttr, setCls, setStyle, setHidden, mw, clamp, fin, clockOf, mmss, unitLabel,
  STATION_SHORT, LEVER_STATIONS, MODE_GLYPH, MODE_WORD, PAN} from './util.js';

export const GATE_PX = 12;          // K-1: extra drag past the spring gate
export const DRAG_SEND_MS = 250;    // K-1: at most one basePoint per 250 ms while dragging
export const KEY_STEP_MW = 10, KEY_FINE_MW = 1;
export const HAND_MS = 500;         // K-20: no servo cue within 0.5 s of a hand move
export const SERVO_MS = 250;        // K-20: at most one servo cue per lever per 0.25 s
export const SHAKE_MS = 600;        // K-12: a rough close shakes the lever this long
const HOT_RISK_TEXT = (V.HOT_TRIP_PER_H * 100).toFixed(1) + '%/h';

const pct = (v, total) => (total > 0 ? clamp(fin(v) / total, 0, 1) * 100 : 0);

// ---------------------------------------------------------------- one machine: lamp + guards (K-3)

/**
 * The START / STOP guards of machine k (V.MACHINES index). START: lift, then press (off units);
 * on a READY unit it opens the synchroscope. STOP: lift, then press (cancels a start while
 * starting/ready); while unloading/shutdown it offers ABORT (one press, restores the unit).
 */
export function createMachine(ctx, k, pan) {
  const doc = ctx.doc, m = V.MACHINES[k];
  const box = el(doc, 'div', 'dk-mach');
  box.dataset.unit = m.id;
  const start = el(doc, 'button', 'dk-guard dk-start');
  start.id = 'guard-start-' + m.id; start.type = 'button';
  const stop = el(doc, 'button', 'dk-guard dk-stop');
  stop.id = 'guard-stop-' + m.id; stop.type = 'button';
  box.append(start, stop);
  let u = null, offered = false, wasS = false, wasX = false, glowS = false, glowX = false;
  // C-10: hover and focus on either guard are the desk's to resolve (ctx.consider, desk.js)
  for (const g of [start, stop]) {
    g.addEventListener('pointerenter', () => ctx.consider.hover(g.id, true));
    g.addEventListener('pointerleave', () => ctx.consider.hover(g.id, false));
    g.addEventListener('focus', () => ctx.consider.focus(g.id, true));
    g.addEventListener('blur', () => ctx.consider.focus(g.id, false));
  }

  const startAction = () => (!u ? '' : u.mode === 'off' ? (u.startBlock ? '' : 'start') : u.mode === 'ready' ? 'scope' : '');
  const stopAction = () => {
    if (!u) return '';
    if (u.mode === 'starting' || u.mode === 'ready') return 'cancel';
    if (u.mode === 'on' || u.mode === 'loading') return u.stopBlock ? '' : 'stop';
    if (u.mode === 'unloading' || u.mode === 'shutdown') return 'abort';
    return '';
  };
  const why = () => {
    if (!u) return '';
    if (u.mode === 'off') return u.startBlock || '';
    if (u.mode === 'starting') return 'starting: ready in ' + mmss(u.timerS);
    if (u.mode === 'tripped') return 'tripped: locked out ' + mmss(u.timerS);
    return u.stopBlock || '';
  };

  /** @param {boolean} [byKey] the press came from S on the station's lever, not from the guard itself */
  function pressStart(byKey) {
    if (ctx.locked()) return;
    const a = startAction();
    if (!a) { ctx.note(box, why() || MODE_WORD[u ? u.mode : 'off']); return; }
    if (a === 'scope') {
      const r = ctx.send({type: 'scope', unit: m.id}, box);
      if (!r) { ctx.cue('button', pan); if (offered) ctx.ui({do: 'offerTaken', unit: m.id}); ctx.showBay('sync'); }
      return;
    }
    const res = ctx.guards.press(start.id, () => { wasS = false; if (!ctx.send({type: 'start', unit: m.id}, box)) ctx.cue('button', pan); });
    if (res === 'lift') { ctx.live(unitLabel(m.id) + ' START guard lifted: press again to start'); ctx.consider.lift(start.id, byKey === true); }
    else ctx.consider.commit(start.id);
    render();
  }
  /** @param {boolean} [byKey] the press came from X on the station's lever */
  function pressStop(byKey) {
    if (ctx.locked()) return;
    const a = stopAction();
    if (!a) { ctx.note(box, why() || 'nothing to stop'); return; }
    if (a === 'abort') { if (!ctx.send({type: 'abortStop', unit: m.id}, box)) ctx.cue('button', pan); return; }
    const res = ctx.guards.press(stop.id, () => { wasX = false; if (!ctx.send({type: 'stop', unit: m.id}, box)) ctx.cue('button', pan); });
    if (res === 'lift') { ctx.live(unitLabel(m.id) + (a === 'cancel' ? ' CANCEL START' : ' STOP') + ' guard lifted: press again'); ctx.consider.lift(stop.id, byKey === true); }
    else ctx.consider.commit(stop.id);
    render();
  }
  start.addEventListener('click', () => pressStart(false));
  stop.addEventListener('click', () => pressStop(false));

  function render() {
    if (!u) return;
    const sa = startAction(), so = stopAction();
    const upS = ctx.guards.lifted(start.id), upX = ctx.guards.lifted(stop.id);
    // A guard lifting, or dropping unused after 2 s, clicks (a commit has its own button cue).
    if (upS !== wasS) { wasS = upS; ctx.cue('cover', pan); }
    if (upX !== wasX) { wasX = upX; ctx.cue('cover', pan); }
    setAttr(start, 'aria-pressed', upS ? 'true' : 'false');
    setAttr(stop, 'aria-pressed', upX ? 'true' : 'false');
    setAttr(box, 'class', 'dk-mach m-' + u.mode + (u.hotS > 0 ? ' hot' : '') + (offered ? ' offered' : ''));
    setText(start, upS ? '▲?' : (MODE_GLYPH[u.mode] || '?') + m.j);
    setText(stop, upX ? '▼?' : so === 'abort' ? '↺' : so ? '■' : '·');
    setCls(start, 'lifted', upS); setCls(stop, 'lifted', upX);
    setCls(start, 'live', !!sa); setCls(stop, 'live', !!so);
    setCls(start, 'glow', glowS); setCls(stop, 'glow', glowX);   // L-9 / C-10: the objective points at this guard
    const hint = ' (the objective points here)';
    setAttr(start, 'aria-disabled', sa ? 'false' : 'true');
    setAttr(stop, 'aria-disabled', so ? 'false' : 'true');
    const name = unitLabel(m.id), w = why();
    const hot = u.hotS > 0 ? ', RUNNING HOT ' + mmss(u.hotS) : '';
    setAttr(start, 'aria-label', name + ' ' + MODE_WORD[u.mode] + hot + ': ' + (upS ? 'START guard lifted, press again to start' :
      sa === 'start' ? 'START (guarded: press twice within 2 s)' : sa === 'scope' ? 'open synchroscope' : 'no start' + (w ? ', ' + w : '')) + (glowS ? hint : ''));
    setAttr(stop, 'aria-label', name + ': ' + (upX ? 'guard lifted, press again' : so === 'abort' ? 'ABORT STOP' :
      so === 'cancel' ? 'CANCEL START (guarded: press twice within 2 s)' : so ? 'STOP (guarded: press twice within 2 s)' : 'no stop') + (glowX ? hint : ''));
    setAttr(box, 'title', name + ' · ' + MODE_WORD[u.mode] + (u.sync ? ' · ' + mw(u.outMW) + ' MW' : '') +
      (u.hotS > 0 ? ' · RUNNING HOT ' + mmss(u.hotS) + ' (trip risk ' + HOT_RISK_TEXT + ' once armed)' : '') + (w ? ' · ' + w : ''));
  }

  return {
    el: box, start, stop, id: m.id, k,
    update(vm) {
      u = vm.obs.units[k];
      offered = !!(vm.offers && vm.offers.some(o => o.unit === m.id));
      glowS = !!(vm.glow && vm.glow.has(start.id)); glowX = !!(vm.glow && vm.glow.has(stop.id));
      render();
    },
    pressStart, pressStop, startAction, stopAction,
    mode: () => (u ? u.mode : 'off'),
  };
}

/** S / X on a focused station: the first startable machine, or the last stoppable one (K-3, K-23). */
export function stationKey(machines, key) {
  if (key === 's') {
    const m = machines.find(x => x.startAction() === 'start');
    if (m) { m.pressStart(true); return true; }
  } else if (key === 'x') {
    for (let i = machines.length - 1; i >= 0; i--) {
      const a = machines[i].stopAction();
      if (a === 'stop' || a === 'cancel') { machines[i].pressStop(true); return true; }
    }
  }
  return false;
}

// ---------------------------------------------------------------- one lever

function createLever(ctx, sid, parent) {
  const doc = ctx.doc;
  const slot = el(doc, 'div', 'dk-lever-slot');
  slot.dataset.station = sid;
  const head = el(doc, 'div', 'dk-lever-head');
  const name = el(doc, 'span', 'dk-lever-name', STATION_SHORT[sid]);
  const man = el(doc, 'button', 'dk-man', 'M');
  man.id = 'man-' + sid; man.type = 'button';
  man.setAttribute('aria-label', STATION_SHORT[sid] + ' MAN lamp: double-click or P to resume the plan, Shift+P to keep');
  head.append(name, man);
  const body = el(doc, 'div', 'dk-lever-body');
  const pan = PAN[sid];
  const track = control(doc, 'div', 'dk-track', 'slider', 'lever-' + sid, STATION_SHORT[sid] + ' lever');
  setAttr(track, 'aria-orientation', 'vertical');
  setAttr(track, 'aria-keyshortcuts', String(LEVER_STATIONS.indexOf(sid) + 1));
  const off = el(doc, 'div', 'dk-offzone'), gate = el(doc, 'div', 'dk-gatezone'), gateLbl = el(doc, 'span', 'dk-gate-label');
  gate.appendChild(gateLbl);
  const cone = el(doc, 'div', 'dk-cone'), band = el(doc, 'div', 'dk-band'), ticks = el(doc, 'div', 'dk-ticks');
  const needle = el(doc, 'div', 'dk-needle'), ghost = el(doc, 'div', 'dk-ghost'), handle = el(doc, 'div', 'dk-handle');
  track.append(off, gate, ticks, cone, band, ghost, needle, handle);
  const machCol = el(doc, 'div', 'dk-machs');
  const st = V.STATIONS[sid];
  const machines = [];
  for (let k = st.first; k < st.first + st.count; k++) { const m = createMachine(ctx, k, pan); machines.push(m); machCol.appendChild(m.el); }
  body.append(track, machCol);
  const foot = el(doc, 'div', 'dk-lever-foot');
  const rBase = el(doc, 'span', 'dk-rd-base'), rOut = el(doc, 'span', 'dk-rd-out');
  foot.append(rBase, el(doc, 'span', 'dk-rd-sep', '▸'), rOut);
  slot.append(head, body, foot);
  parent.appendChild(slot);

  let vm = null, sc = leverScale({stations: [], units: []}, sid), ticksKey = '';
  // local: a value the player is moving (drag / keys), shown instead of the vm's until the
  // input has been through a frame (never assume it was accepted).
  let drag = null;            // {crossed, t0, lastSendT, lastSent, v}
  let pending = null;         // {v, t} key moves not yet sent
  let shown = null;           // {v, afterTick, frames} value sent, shown until a later tick (or the second frame) arrives
  // Foley state: the base point last frame (a change the hand did not make is the plan's servo),
  // when the hand last moved the lever, the last servo cue, and the rough-close shake's end.
  let prevBase = null, handT = -1e12, servoT = -1e12, shakeUntil = -1;
  const feelSt = {};
  const feel = (a, b) => { handT = ctx.now(); ctx.feel(feelSt, Math.round(a), Math.round(b), sc.detents, gateOn() ? sc.gateMW : null, pan); };

  const obs = () => vm.obs;
  const stationObs = () => obs().stations.find(x => x.id === sid);
  const baseNow = () => fin(stationObs() && stationObs().basePointMW);
  const current = () => (drag ? drag.v : pending ? pending.v : shown ? shown.v : baseNow());
  const bounds = () => (sc.onCount > 0 ? [sc.minMW, sc.maxMW] : [0, sc.totalMW]);
  const gateOn = () => sc.onCount > 0 && sc.gateMW > sc.minMW;

  function send(v, final) {
    const o = obs();
    const x = Math.round(v);
    let r;
    if (sc.onCount > 0) r = ctx.send({type: 'basePoint', station: sid, mw: x}, slot);
    else if (!final) return '';
    else if (o.mode === 'AGC') r = ctx.send({type: 'planKey', station: sid, atS: o.s, mw: x}, slot);
    else { ctx.note(slot, 'no machine on: START one first'); r = 'no machine on'; }
    shown = r ? null : {v: sc.onCount > 0 ? x : baseNow(), afterTick: o.tick, frames: 0};
    handT = ctx.now();
    if (!r) ctx.live(STATION_SHORT[sid] + ' ' + x + ' MW');
    return r;
  }

  // ---- pointer: the handle follows the pointer along the track
  function mwAt(y) {
    const r = track.getBoundingClientRect();
    return r.height > 0 ? (r.bottom - y) / r.height * sc.totalMW : 0;
  }
  function dragTo(y) {
    const [lo, hi] = bounds();
    let v = clamp(mwAt(y), lo, hi);
    if (gateOn()) {
      if (!drag.crossed && v > sc.gateMW) {
        const r = track.getBoundingClientRect();
        const gateY = r.bottom - sc.gateMW / sc.totalMW * r.height;
        if (gateY - y >= GATE_PX) drag.crossed = true; else v = sc.gateMW;
      } else if (drag.crossed && v <= sc.gateMW) drag.crossed = false;
    }
    const was = drag.v;
    drag.v = Math.round(v);
    feel(was, drag.v);
  }
  track.addEventListener('pointerdown', ev => {
    if (!vm || ctx.locked()) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    track.setPointerCapture && track.setPointerCapture(ev.pointerId);
    const t = ctx.now();
    drag = {crossed: gateOn() && baseNow() > sc.gateMW, t0: t, lastSendT: -1e12, lastSent: null, v: baseNow()};
    pending = null;
    dragTo(ev.clientY);
    track.focus && track.focus();
    render();
  });
  track.addEventListener('pointermove', ev => {
    if (!drag) return;
    dragTo(ev.clientY);
    const t = ctx.now();
    if (sc.onCount > 0 && t - drag.t0 >= DRAG_SEND_MS && t - drag.lastSendT >= DRAG_SEND_MS && drag.v !== drag.lastSent) {
      drag.lastSendT = t; drag.lastSent = drag.v;
      send(drag.v, false);
    }
    render();
  });
  const release = ev => {
    if (!drag) return;
    if (ev && ev.clientY !== undefined && ev.type === 'pointerup') dragTo(ev.clientY);
    const d = drag;
    drag = null;
    if (ctx.locked()) { render(); return; }
    if (d.v !== d.lastSent || sc.onCount === 0) send(d.v, true);
    render();
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  track.addEventListener('lostpointercapture', release);
  slot.addEventListener('pointerenter', () => ctx.ui({do: 'hover', target: 'lever-' + sid}));
  slot.addEventListener('pointerleave', () => ctx.ui({do: 'hover', target: null}));
  // The same cross-highlight for the keyboard (K-23: nothing hover-only).
  track.addEventListener('focus', () => ctx.ui({do: 'hover', target: 'lever-' + sid}));
  track.addEventListener('blur', () => ctx.ui({do: 'hover', target: null}));

  // ---- keyboard (K-23): ↑↓ ±10, Shift ±1 (and crosses the gate), PgUp/PgDn detents, Home/End
  track.addEventListener('keydown', ev => {
    if (!vm || ctx.locked()) return;
    const v = current(), [lo, hi] = bounds();
    let t = null;
    const up = ev.key === 'ArrowUp' || ev.key === 'ArrowRight', down = ev.key === 'ArrowDown' || ev.key === 'ArrowLeft';
    if (up) t = v + (ev.shiftKey ? KEY_FINE_MW : KEY_STEP_MW);
    else if (down) t = v - (ev.shiftKey ? KEY_FINE_MW : KEY_STEP_MW);
    else if (ev.key === 'PageUp') t = nextDetent(v, sc.detents, 1);
    else if (ev.key === 'PageDown') t = nextDetent(v, sc.detents, -1);
    else if (ev.key === 'Home') t = lo;
    else if (ev.key === 'End') t = gateOn() ? sc.gateMW : hi;
    if (t === null) return;
    ev.preventDefault();
    // The spring gate: only Shift+↑ crosses it (K-1).
    if (gateOn() && v <= sc.gateMW && t > sc.gateMW && !(up && ev.shiftKey)) t = sc.gateMW;
    t = Math.round(clamp(t, lo, hi));
    feel(v, t);
    pending = {v: t, t: pending ? pending.t : ctx.now()};
    render();
  });
  track.addEventListener('keyup', ev => {
    if (!pending) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(ev.key)) flush();
  });
  function flush() {
    if (!pending) return;
    const v = pending.v;
    pending = null;
    if (!ctx.locked() && Math.round(v) !== Math.round(baseNow())) send(v, true);
    render();
  }

  // ---- HAND: the MAN lamp rejoins the plan (K-2, L-6)
  function rejoin(keep) {
    if (!vm || ctx.locked()) return;
    const p = planOf();
    if (!p || !p.man) { ctx.note(slot, obs().mode === 'HAND' ? 'following the plan' : 'AGC: levers always follow the plan'); return; }
    if (!ctx.send({type: 'planRejoin', station: sid, keep: !!keep}, slot)) ctx.cue('button', pan);
  }
  man.addEventListener('dblclick', ev => rejoin(ev.shiftKey));
  man.addEventListener('click', () => { if (vm && planOf() && planOf().man) ctx.note(slot, 'double-click or P: RESUME PLAN · Shift+P: KEEP'); });
  const planOf = () => (obs().plan && obs().plan.stations ? obs().plan.stations.find(x => x.id === sid) : null);

  // ---- render
  function render() {
    if (!vm) return;
    const o = obs(), so = stationObs() || {basePointMW: 0, outMW: 0, onCount: 0, minMW: 0, maxMW: 0};
    const T = sc.totalMW, v = current();
    setStyle(handle, 'bottom', 'calc(' + pct(v, T).toFixed(2) + '% - 12px)');
    setStyle(needle, 'bottom', pct(so.outMW, T).toFixed(2) + '%');
    setStyle(off, 'bottom', pct(sc.maxMW, T).toFixed(2) + '%');
    setStyle(off, 'height', (100 - pct(sc.maxMW, T)).toFixed(2) + '%');
    const gOn = gateOn();
    setHidden(gate, !gOn);
    if (gOn) {
      setStyle(gate, 'bottom', pct(sc.gateMW, T).toFixed(2) + '%');
      setStyle(gate, 'height', Math.max(0, pct(sc.maxMW, T) - pct(sc.gateMW, T)).toFixed(2) + '%');
    }
    const b = agcBandMW(o, sid);
    setHidden(band, !(b > 0 && so.onCount > 0));
    if (b > 0) {
      const lo = clamp(fin(so.basePointMW) - b, sc.minMW, sc.maxMW), hi = clamp(fin(so.basePointMW) + b, sc.minMW, sc.maxMW);
      setStyle(band, 'bottom', pct(lo, T).toFixed(2) + '%');
      setStyle(band, 'height', Math.max(0, pct(hi, T) - pct(lo, T)).toFixed(2) + '%');
    }
    const c = rampCone(o, sid);
    setHidden(cone, !(so.onCount > 0));
    setStyle(cone, 'bottom', pct(c.loMW, T).toFixed(2) + '%');
    setStyle(cone, 'height', Math.max(0, pct(c.hiMW, T) - pct(c.loMW, T)).toFixed(2) + '%');
    const p = planOf();
    const nk = p && p.keys ? p.keys.find(k => k.atS > o.s) : null;
    setHidden(ghost, !nk);
    if (nk) { setStyle(ghost, 'bottom', pct(nk.mw, T).toFixed(2) + '%'); setAttr(ghost, 'title', 'plan: ' + mw(nk.mw) + ' MW by ' + clockOf(nk.atS)); }
    // Detent ticks (rebuilt when the committed capacity changes).
    const key = sc.detents.join(',');
    if (key !== ticksKey) {
      ticksKey = key;
      ticks.replaceChildren();
      for (const d of sc.detents) { const t = el(doc, 'i', 'dk-tick'); setStyle(t, 'bottom', pct(d, T).toFixed(2) + '%'); ticks.appendChild(t); }
    }
    // Hot: the station above its gate or any machine running hot (H-2): risk shown in the slot.
    const units = stationUnits(o, sid);
    const hotS = Math.max(0, ...units.map(u => fin(u.hotS)));
    const armed = hotS >= V.HOT_ARM_S;
    setCls(slot, 'hot', hotS > 0 || (gOn && v > sc.gateMW));
    setText(gateLbl, hotS > 0 ? (armed ? '✕ ' + HOT_RISK_TEXT : '! ' + mmss(V.HOT_ARM_S - hotS)) : gOn && v > sc.gateMW ? '! >96%' : '96%');
    setAttr(gate, 'title', 'Spring gate at 96% of available: above it a machine runs hot; after ' + V.HOT_ARM_S / 60 +
      ' min hot it may trip (≈' + HOT_RISK_TEXT + ')' + (hotS > 0 ? ' · hot ' + mmss(hotS) : ''));
    // HAND: MAN lamp; AGC: hidden (no MAN state in AGC, K-2).
    const hand = o.mode === 'HAND';
    setHidden(man, !hand);
    setCls(man, 'lit', !!(p && p.man));
    setText(man, p && p.man ? 'M' : 'P');
    setCls(slot, 'hand', hand);
    setCls(slot, 'idle', so.onCount === 0);
    setCls(slot, 'moving', !!(drag || pending));
    setCls(slot, 'glow', !!(vm.glow && vm.glow.has('lever-' + sid)));
    setCls(slot, 'hover', vm.hover === 'lever-' + sid);
    setCls(slot, 'shake', ctx.now() < shakeUntil && !ctx.rm());
    setText(rBase, mw(v));
    setText(rOut, mw(so.outMW));
    setAttr(track, 'aria-valuemin', 0);
    setAttr(track, 'aria-valuemax', T);
    setAttr(track, 'aria-valuenow', Math.round(v));
    setAttr(track, 'aria-valuetext', STATION_SHORT[sid] + ' base point ' + mw(v) + ' MW, output ' + mw(so.outMW) + ' MW, ' +
      so.onCount + ' of ' + st.count + ' on' + (so.onCount ? ', ' + mw(sc.minMW) + '–' + mw(sc.maxMW) + ' MW' : '') +
      (nk ? ', plan ' + mw(nk.mw) + ' MW by ' + clockOf(nk.atS) : '') + (p && p.man ? ', MAN: off the plan' : '') +
      (hotS > 0 ? ', running hot ' + mmss(hotS) + (armed ? ', trip risk ' + HOT_RISK_TEXT : '') : gOn && v > sc.gateMW ? ', above the 96% gate' : ''));
    setAttr(track, 'aria-disabled', ctx.locked() ? 'true' : 'false');
  }

  return {
    el: slot, track, machines, sid,
    update(v) {
      vm = v;
      sc = leverScale(v.obs, sid);
      if (shown && (v.obs.tick > shown.afterTick || ++shown.frames >= 2)) shown = null;
      if (pending && ctx.now() - pending.t >= DRAG_SEND_MS && !ctx.locked()) flush();
      if (ctx.locked()) { drag = null; pending = null; }
      // K-20 servo: the handle moved and no hand moved it (the plan did, L-6).
      const b = Math.round(baseNow()), t = ctx.now();
      if (prevBase !== null && b !== prevBase && !drag && !pending && !shown && t - handT >= HAND_MS && t - servoT >= SERVO_MS) {
        servoT = t;
        ctx.cue('servo', pan);
      }
      prevBase = b;
      for (const m of machines) m.update(v);
      render();
    },
    key(k, shift) {
      if (k === 'p') { rejoin(shift); return true; }
      return stationKey(machines, k);
    },
    /** K-12: a rough close on one of this station's machines (no shake under reduced motion). */
    shake() { shakeUntil = ctx.now() + SHAKE_MS; },
  };
}

/** The lever bank. */
export function createLevers(ctx, parent) {
  const bank = el(ctx.doc, 'div', 'dk-levers');
  parent.appendChild(bank);
  const levers = LEVER_STATIONS.map(sid => createLever(ctx, sid, bank));
  return {
    el: bank, levers,
    machines: levers.flatMap(l => l.machines),
    update(vm) { for (const l of levers) l.update(vm); },
    /** A K-23 letter (s, x, p) for the lever whose slot holds focus; true if handled. */
    key(target, k, shift) {
      const slot = target && target.closest ? target.closest('.dk-lever-slot') : null;
      if (!slot) return false;
      const l = levers.find(x => x.sid === slot.dataset.station);
      return l ? l.key(k, shift) : false;
    },
    shake(sid) { const l = levers.find(x => x.sid === sid); if (l) l.shake(); },
  };
}

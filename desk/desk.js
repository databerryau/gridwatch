// desk/desk.js: the desk (desk/README.md §6, SPEC §4.2-§4.3, K-17 panel sizes).
//
//   const desk = createDesk(doc, root, actions, opts?);   // root: the #desk element the shell sizes
//   desk.update(vm);          // every frame, after the ticks (reads the view model only, §5)
//   desk.key(ev);             // the shell's K-23 key map forwards keydown/keyup: 1-8, S, X, P, [ ] C U, R, D, E
//   desk.focus(id);           // focus a desk control by its §5 id (also done when vm.focus changes)
//   desk.slots.stack          // the #stack-slot element the Live Stack (#stack) mounts into (render/livestack.js)
//   desk.el                   // the desk's own container
//
// Four columns at the 1280×300 floor (232 / 424 / 336 / 256 px + 8-px gutters): the frequency
// dial over the imbalance bar and N-1 gauge; the lever bank over the hydro wheel, battery dial,
// tie knob and the AGC / RE-DISPATCH keys; the Live Stack slot over the procedure bay; the
// annunciator, the message tray and the emergency row. Every input goes through
// actions.input (never assumed accepted: refusals show on the control for a moment); the desk
// is locked while vm.mode.locked (the watch) except ACK and SILENCE. Time for guards, holds and
// the synchroscope's 8-s AUTO comes from vm.frame.nowMs (or opts.now), never from timers.

import {createLevers} from './levers.js';
import {createHydroWheel, createBatteryDial, createTieKnob} from './rotary.js';
import {createEmergency} from './emergency.js';
import {createAnnunciator} from './annunciator.js';
import {createTray} from './tray.js';
import {createGauge} from './gauge.js';
import {createFreqDial, createImbalanceBar} from './dial.js';
import {createBay} from './bay.js';
import {el, makeGuards, makeHolds, setCls, fin, clamp, LEVER_STATIONS} from './util.js';

/** K-23 keys 1-8 focus these. */
export const SLOT_IDS = Object.freeze(['lever-coal', 'lever-ccgt', 'lever-gta', 'lever-gtb', 'lever-gtc', 'wheel-hydro', 'dial-battery', 'knob-tie']);

/** Every stable id of desk/README.md §5 the desk builds (the shell adds `map`; guards per machine are extra). */
export const DESK_IDS = Object.freeze([
  ...LEVER_STATIONS.map(s => 'lever-' + s), 'wheel-hydro', 'dial-battery', 'ring-guard', 'knob-tie', 'key-rert', 'btn-dr', 'key-shed',
  'key-agc', 'btn-redispatch', 'bay-sync', 'bay-restore', 'gauge-n1', 'dial-freq', 'bar-imbalance', 'annunciator', 'tray', 'stack-slot',
]);

/**
 * K-17 floor layout (1280×300): column widths and panel heights in px. desk.css uses the same
 * numbers (tests/desk.test.js checks the two agree, the columns fill 1280 px and panels 300 px).
 */
export const LAYOUT = Object.freeze({
  width: 1280, height: 300, gutter: 8, pad: 4,
  columns: [232, 424, 336, 256],
  panels: [[140, 152], [180, 112], [164, 128], [96, 108, 80]],
});

export const NOTE_MS = 2500;   // a refusal / hint stays on its control this long

export function createDesk(doc, root, actions, opts = {}) {
  let vm = null, lastFocus = null, frameNow = 0, previewKey = '', preview = null;
  const nowFn = typeof opts.now === 'function' ? opts.now : () => frameNow;
  const notes = new Map();   // host element -> {span, until}
  const live = el(doc, 'div', 'dk-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');

  const locked = () => !vm || !!(vm.mode && vm.mode.locked) || !!vm.obs.over;
  const ctx = {
    doc, actions,
    now: () => nowFn(),
    vm: () => vm,
    locked,
    guards: null, holds: null,
    ui(cmd) { if (typeof actions.ui === 'function') actions.ui(cmd); },
    live(text) { live.textContent = text; },
    note(host, text, ms = NOTE_MS) {
      let n = notes.get(host);
      if (!n) { n = {span: el(doc, 'span', 'dk-note'), until: 0}; host.appendChild(n.span); notes.set(host, n); }
      n.span.textContent = text;
      n.span.hidden = false;
      n.until = nowFn() + ms;
      live.textContent = text;
    },
    /** A sim input, unless the desk is locked; a refusal shows on `host`. Returns '' or the reason. */
    send(x, host) {
      if (locked()) { if (host) ctx.note(host, 'desk locked'); return 'desk locked'; }
      const r = actions.input(x);
      const why = typeof r === 'string' ? r : r && typeof r === 'object' && typeof r.reason === 'string' ? r.reason : '';
      if (why && host) ctx.note(host, '✕ ' + why);
      return why;
    },
    showBay(view) { bay.show(view, true); },
  };
  ctx.guards = makeGuards(ctx.now);
  ctx.holds = makeHolds(ctx.now);

  // ---- layout
  const desk = el(doc, 'div', 'dk');
  const col = n => { const c = el(doc, 'div', 'dk-col dk-col' + n); desk.appendChild(c); return c; };
  const c1 = col(1), c2 = col(2), c3 = col(3), c4 = col(4);
  const cell = (parent, cls) => { const e = el(doc, 'div', 'dk-cell ' + cls); parent.appendChild(e); return e; };
  const c1a = cell(c1, 'dk-c1a'), c1b = cell(c1, 'dk-c1b');
  const c2a = cell(c2, 'dk-c2a dk-panel'), c2b = cell(c2, 'dk-c2b dk-panel');
  const stack = cell(c3, 'dk-c3a dk-stack-slot');
  stack.id = 'stack-slot'; // the Live Stack's own element is #stack (render/livestack.js)
  const c3b = cell(c3, 'dk-c3b');
  const c4a = cell(c4, 'dk-c4a'), c4b = cell(c4, 'dk-c4b'), c4c = cell(c4, 'dk-c4c dk-panel');

  const dial = createFreqDial(ctx, c1a);
  const imb = createImbalanceBar(ctx, c1b);
  const gauge = createGauge(ctx, c1b);
  const levers = createLevers(ctx, c2a);
  const rot = el(doc, 'div', 'dk-rots');
  c2b.appendChild(rot);
  const hydro = createHydroWheel(ctx, rot);
  const batt = createBatteryDial(ctx, rot);
  const tie = createTieKnob(ctx, rot);
  const emerg = createEmergency(ctx, rot, c4c);
  const bay = createBay(ctx, c3b);
  const annun = createAnnunciator(ctx, c4a);
  const tray = createTray(ctx, c4b);
  desk.appendChild(live);
  root.appendChild(desk);

  function focus(id) {
    const e = doc.getElementById(id);
    if (!e || !desk.contains(e)) return false;
    if (id === 'bay-restore') bay.show('restore', true);
    if (id === 'bay-sync') bay.show('sync', true);
    if (typeof e.focus === 'function') e.focus();
    if (typeof e.scrollIntoView === 'function') e.scrollIntoView({block: 'nearest'});
    return true;
  }

  /** The live TRIP PREVIEW while T / hover is on or the GUARD ring is turning (K-5, K-10). */
  function livePreview() {
    const o = vm.obs, s = o.sec;
    const guard = vm.previewGuardMW;
    const want = !!vm.previewOn || (guard !== null && guard !== undefined);
    if (!want || s.lKind === 'none' || typeof actions.previewTrip !== 'function') { previewKey = ''; preview = null; return null; }
    const optsP = {kind: s.lKind, id: s.lId};
    if (guard !== null && guard !== undefined) optsP.guardMW = guard;
    const key = o.tick + '|' + s.lKind + '|' + s.lId + '|' + (guard ?? '');
    if (key !== previewKey) {
      previewKey = key;
      const r = actions.previewTrip(optsP);
      preview = r && Number.isFinite(r.nadirHz) ? {nadirHz: r.nadirHz, caught: r.caught || null, guardMW: optsP.guardMW} : null;
    }
    return preview;
  }

  function update(v) {
    vm = v;
    frameNow = fin(v.frame && v.frame.nowMs, frameNow);
    const k = clamp(Math.min(fin(root.clientWidth, 1280) / LAYOUT.width, fin(root.clientHeight, 300) / LAYOUT.height), 1, 1.5);
    if (desk.style.getPropertyValue ? desk.style.getPropertyValue('--dk-k') !== k.toFixed(3) : desk.style['--dk-k'] !== k.toFixed(3)) {
      desk.style.setProperty('--dk-k', k.toFixed(3));
    }
    ctx.guards.expire();
    ctx.holds.tick();
    for (const [host, n] of notes) if (nowFn() > n.until && !n.span.hidden) n.span.hidden = true;
    setCls(desk, 'dk-locked', locked());
    setCls(desk, 'dk-hand', v.obs.mode === 'HAND');
    const pv = livePreview();
    dial.update(v, pv);
    imb.update(v);
    gauge.update(v, pv);
    levers.update(v);
    hydro.update(v);
    batt.update(v);
    tie.update(v);
    emerg.update(v);
    bay.update(v);
    annun.update(v);
    tray.update(v);
    setCls(stack, 'glow', !!(v.glow && v.glow.has('stack')));
    if (v.focus !== lastFocus) { lastFocus = v.focus; if (v.focus) focus(v.focus); }
    for (const e of desk.querySelectorAll('.dk-focus')) if (e.id !== v.focus) e.classList.remove('dk-focus');
    if (v.focus) { const e = doc.getElementById(v.focus); if (e && desk.contains(e)) e.classList.add('dk-focus'); }
  }

  /** K-23 keys the shell forwards (keydown and keyup). Returns true when the desk used the key. */
  function key(ev) {
    if (!vm || !ev || typeof ev.key !== 'string') return false;
    const t = ev.target;
    if (t && t.tagName && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return false;
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const down = ev.type !== 'keyup';
    if (k === 'd' || k === 'e') { if (down && ev.repeat) return true; return emerg.holdKey(k, down); }
    if (!down) return false;
    if (k >= '1' && k <= '8' && !ev.ctrlKey && !ev.altKey && !ev.metaKey) return focus(SLOT_IDS[Number(k) - 1]);
    if (locked()) return false;
    const active = doc.activeElement;
    if (k === 's' || k === 'x' || k === 'p') return levers.key(active, k, !!ev.shiftKey) || (k !== 'p' && hydro.key(active, k));
    if (k === '[' || k === ']' || k === 'c' || k === 'u' || k === 'r') return bay.key(k);
    return false;
  }

  return {el: desk, update, key, focus, slots: {stack}, ids: DESK_IDS};
}

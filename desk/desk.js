// desk/desk.js: the desk (desk/README.md §6, §13-§14.2; SPEC §4.2-§4.3, K-17 panel sizes).
//
//   const desk = createDesk(doc, root, actions, opts?);   // root: the #desk element the shell sizes; opts.annunSlot (Q-45)
//   desk.update(vm);          // every frame, after the ticks (reads the view model only, §5)
//   desk.key(ev);             // the shell forwards every keydown/keyup here first (§13.3); true = the desk acted
//   desk.focus(id);           // focus a desk control by its §5 id (also done when vm.focus changes)
//   desk.slots.stack          // the #stack-slot element the Live Stack (#stack) mounts into (render/livestack.js)
//   desk.el                   // the desk's own container
//
// Four columns at the 1280×300 floor (232 / 424 / 336 / 256 px + 8-px gutters): the frequency
// dial over the imbalance bar and N-1 gauge; the lever bank over the hydro wheel, battery dial,
// tie knob and the AGC / RE-DISPATCH keys; the Live Stack slot over the procedure bay; the
// message tray over the emergency row; the annunciator in the plan bar (§30.4). Every input goes through
// actions.input (never assumed accepted: refusals show on the control for a moment); the desk
// is locked while vm.mode.locked (the watch) except ACK and SILENCE. Time for guards, holds and
// the synchroscope's 8-s AUTO comes from vm.frame.nowMs (or opts.now), never from timers.
//
// Keys (K-23, §13.3). desk.key returns true exactly when it acted; the shell then stops. (D and E
// always return true: both holds are the desk's, so the shell never starts its own.)
//   desk.key (from anywhere):
//     1-8        focus COAL / CCGT / GT·A / GT·B / GT·C / hydro wheel / battery dial / tie knob
//     G          focus the GUARD ring            V   focus the AGC/HAND key
//     K          focus DIRECT SHED (while shown) N   RE-DISPATCH (as a press of its key)
//     O          open the first READY unit's synchroscope (an offered one first); again: close the scope
//     [ ] C U    slip lower / raise, close the breaker, auto-sync      B   the bypass key (HAND only)
//     R          the restore bay (focus its list)
//     A, Shift+A ACK, SILENCE                    D, E (hold 0.6 s)   industrial DR, reserve diesel
//     S S / X X  start / stop a machine of the focused station (guarded), P / Shift+P rejoin the plan (HAND)
//     Enter      presses the focused desk button (tiles, cards, guards, tabs, ...); not while the RESPOND card is up
//   The focused control, natively (it calls preventDefault, so the shell does nothing more):
//     lever        ↑↓ ±10 MW, Shift ±1 (Shift+↑ crosses the 96% gate), PgUp/PgDn detent, Home/End
//     hydro wheel  ←→ (or ↑↓) 1%, Shift 10%, PgUp/PgDn 10%, Home/End
//     battery dial ←→ mode CHARGE / IDLE / DISCHARGE, ↑↓ magnitude 50 MW, Shift 10, Ctrl 1, Home/End
//     GUARD ring   ←→ / ↑↓ one 50-MW detent, Home/End
//     tie knob     ←→ / ↑↓ 50 MW, Shift 10, Ctrl 1, PgUp/PgDn detent, Home/End
//     RERT, DR     Enter or Space held 0.6 s (RERT: the first press lifts the cover)
//     DIRECT SHED  Enter lifts the cover, Enter again within 2 s commits (or hold 0.6 s)
//     restore list ←→ / ↑↓ choose a district, Enter closes its breaker
//     tray         ←→ / ↑↓ move between the cards' buttons and LOG
//   T, M, L, Tab, Space, Esc, F and ? stay the shell's (app/keys.js).
// Foley (K-20): gestures emit actions.ui({do:'cue', name, pan}) on real changes only (ctx.cue).
//
// C-10 (Phase 2a, desk/README.md §19.5): the desk tells the shell which START / STOP guard the
// player is considering, actions.ui({do: 'consider', target: 'guard-start-<unit>' |
// 'guard-stop-<unit>' | null}), and only when the answer changes. A lifted guard wins, then the
// focused one, then the hovered one; null when none. A commit counts as a drop. A lift made by
// key (S / X on a lever: nothing is hovered and the lever, not the guard, has the focus) is held
// CONSIDER_HOLD_MS after its cover drops, so a keyboard player has time to read what the press
// would do (the cover itself still drops after 2 s). "Focused" is the keyboard's focus: the
// focus a mouse click leaves on a guard is not counted (makeConsider says how), so after a
// pointer lift or commit the target clears when the pointer leaves. The shell shows vm.consider
// in the objective line; the desk only names the guard. After a new day (obs.tick going back)
// the target is sent again, because the shell clears its copy. K-3: a cover going up or down
// sends {do: 'armed', target, on}.

import {createLevers} from './levers.js';
import {createHydroWheel, createBatteryDial, createTieKnob} from './rotary.js';
import {createEmergency} from './emergency.js';
import {createAnnunciator} from './annunciator.js';
import {createTray} from './tray.js';
import {createGauge} from './gauge.js';
import {createFreqDial, createImbalanceBar} from './dial.js';
import {createBay} from './bay.js';
import {el, makeGuards, makeHolds, setCls, fin, clamp, feelOf, RATCHET_MS, LEVER_STATIONS, GUARD_MS} from './util.js';

/** K-23 keys 1-8 focus these. */
export const SLOT_IDS = Object.freeze(['lever-coal', 'lever-ccgt', 'lever-gta', 'lever-gtb', 'lever-gtc', 'wheel-hydro', 'dial-battery', 'knob-tie']);

/** The letters the desk claims beyond SPEC K-23's table (§13.3) and what each reaches. */
export const DESK_KEYS = Object.freeze({g: 'ring-guard', v: 'key-agc', k: 'key-shed', n: 'btn-redispatch', o: 'bay-sync', b: 'sync-bypass'});

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
  panels: [[140, 152], [180, 112], [164, 128], [212, 80]],   // (Q-45)
});

export const NOTE_MS = 2500;   // a refusal / hint stays on its control this long
export const CONSIDER_HOLD_MS = 6000;   // C-10: a guard lifted by key stays the considered one this long after its cover drops
export const PRESS_FOCUS_MS = 1000;     // C-10: a focus this soon after a pointer came up on the guard is that press's, not the keyboard's

/**
 * C-10: which guard the player is considering (the header says the rule). hover / press / focus /
 * lift / commit are told by the machine guards (desk/levers.js); tick() runs every frame for the
 * covers that drop by themselves. `send(target)` is called only when the resolved target changes.
 *
 * Focus means the keyboard's. A click focuses a button in most browsers and leaves it focused
 * when the pointer has gone, with nothing shown on it: that focus is the pointer's and does not
 * count (press() marks it), so a mouse player's target is the guard under the pointer or the one
 * lifted, and it clears when the pointer leaves, the cover drops or the press commits. The focus
 * counts again once the keyboard uses that guard (Enter on it: keyboard()) or comes back to it
 * from another element.
 * A guard that takes the keyboard's focus after a key lift was made outranks that lift's hold.
 * A guard losing the focus or the pointer is resolved by the next tick(), not at once: Tab from
 * one guard to the next, or the pointer crossing from START to STOP, is one change, never a null
 * between the two; a window that stops being the active one keeps its focused guard.
 * @param {function():number} now the desk clock (ms) @param {{lifted:function(string):boolean}} guards
 */
export function makeConsider(now, guards, send) {
  let hover = null, focus = null, focusAt = -Infinity, sent = null;
  let pressing = null, upAt = Infinity; // the guard a pointer last went down on; when that pointer came up (Infinity: still down)
  let ptr = null;                      // the guard whose focus the pointer gave: not the keyboard's
  // a touch focuses the button after its pointer is up, a browser that does not focus on a click never does:
  // the focus is the press's while the pointer is down and for PRESS_FOCUS_MS after
  const pressed = id => pressing === id && now() - upAt <= PRESS_FOCUS_MS;
  const lifts = [];                    // [{id, at, byKey}], oldest first: the last one still up wins
  const held = {id: null, until: -1, since: -1};  // a key lift whose cover has dropped (since: when it was lifted)
  const setFocus = id => { if (id !== focus) { focus = id; if (id !== null) focusAt = now(); } };
  function resolve() {
    const t = now();
    for (let i = lifts.length - 1; i >= 0; i--) {
      const l = lifts[i];
      if (guards.lifted(l.id)) continue;
      lifts.splice(i, 1);              // its cover dropped unused
      if (l.byKey && l.at + GUARD_MS + CONSIDER_HOLD_MS > held.until) { held.id = l.id; held.until = l.at + GUARD_MS + CONSIDER_HOLD_MS; held.since = l.at; }
    }
    if (held.id && (t > held.until || (focus !== null && focus !== held.id && focusAt > held.since))) held.id = null;
    const target = lifts.length ? lifts[lifts.length - 1].id : held.id || focus || hover || null;
    if (target !== sent) { sent = target; send(target); }
  }
  const drop = id => { for (let i = lifts.length - 1; i >= 0; i--) if (lifts[i].id === id) lifts.splice(i, 1); };
  return {
    hover(id, on) { if (on) { hover = id; resolve(); } else if (hover === id) hover = null; },
    /** A pointer went down on this guard: the focus that press gives it (or that it already has) is the pointer's. */
    press(id) { pressing = id; upAt = Infinity; if (focus === id) { ptr = id; focus = null; } },
    /** That pointer came up, or was cancelled. */
    up(id) { if (pressing === id && upAt === Infinity) upAt = now(); },
    focus(id, on) {
      if (!on) { if (focus === id) focus = null; if (pressing === id) pressing = null; return; }
      // still the pointer's when the press gave it, and when the document's focus never left the guard
      // (focusIs has not seen it elsewhere): the window went away and came back
      if (pressed(id) || ptr === id) { ptr = id; return; }
      pressing = null;
      setFocus(id);
      resolve();
    },
    /** The focused guard as the document has it (null: none), told every frame: a window that is not the active one sends no focus events. */
    focusIs(id) { if (ptr !== null && id !== ptr) ptr = null; setFocus(id !== null && id === ptr ? null : id); },
    /** The keyboard pressed this guard (Enter on it): its focus is the keyboard's from here on. */
    keyboard(id) { pressing = null; if (ptr === id) { ptr = null; setFocus(id); } },
    /** The guard's cover went up (the first press). byKey: by S / X on its lever. */
    lift(id, byKey) { drop(id); lifts.push({id, at: now(), byKey: !!byKey}); if (held.id === id) held.id = null; resolve(); },
    /** The second press: the input was sent. A commit counts as a drop (the lift it follows already ended any hold on that guard). */
    commit(id) { drop(id); resolve(); },
    /** The shell has forgotten its target (a new day): the present one, if any, is sent again by the next tick(). */
    forget() { sent = null; },
    tick: resolve,
    get target() { return sent; },
  };
}
export const SHAKE_MS = 600;   // K-12: a rough close shakes the unit's lever this long

const cueName = c => (typeof c === 'string' ? c : c && typeof c.name === 'string' ? c.name : '');

/**
 * K-12: the unit whose close was rough this frame, or ''. The view model carries no sync record,
 * so: a `growl` cue (rough, reverse or bypass close) in vm.cues, and the unit that was on the
 * scope last frame, running fast (slip >= 0: not a reverse close), is on the bars now (not
 * tripped: not a bypass close).
 * @param {object} vm @param {{unit:string, slipHz:number}|null} prev last frame's scope
 */
export function roughSyncUnit(vm, prev) {
  if (!prev || !prev.unit || !(prev.slipHz >= 0) || !Array.isArray(vm.cues) || !vm.cues.some(c => cueName(c) === 'growl')) return '';
  const u = vm.obs.units.find(x => x.id === prev.unit);
  return u && u.mode !== 'ready' && u.mode !== 'tripped' && u.mode !== 'off' ? u.id : '';
}

export function createDesk(doc, root, actions, opts = {}) {
  let vm = null, lastFocus = null, frameNow = 0, previewKey = '', preview = null, prevScope = null, lastTick = -1;
  const nowFn = typeof opts.now === 'function' ? opts.now : () => frameNow;
  const notes = new Map();   // host element -> {span, until, q}, the newest help last
  // Q-47: the "?" or tile q of a note says that it shows; a "?" reads ✕ meanwhile
  const opened = (q, on) => { if (q) { q.setAttribute('aria-expanded', on); if (q.classList.contains('dk-q')) { q.textContent = on ? '✕' : '?'; q.classList.toggle('on', on); } } };
  const closeNote = n => { n.span.hidden = true; opened(n.q, false); n.q = null; };
  const live = el(doc, 'div', 'dk-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');

  const locked = () => !vm || !!(vm.mode && vm.mode.locked) || !!vm.obs.over;
  const ctx = {
    doc, actions,
    now: () => nowFn(),
    vm: () => vm,
    locked,
    /** K-22: reduced motion (vm.settings.reducedMotion; absent = off). */
    rm: () => !!(vm && vm.settings && vm.settings.reducedMotion),
    guards: null, holds: null,
    ui(cmd) { if (typeof actions.ui === 'function') actions.ui(cmd); },
    /** K-20 foley for a desk gesture (§13.2): presentation only, never a sim input. */
    cue(name, pan) { ctx.ui(typeof pan === 'number' ? {do: 'cue', name, pan} : {do: 'cue', name}); },
    /** The cue of a hand-moved value going a -> b; `st` holds the control's ratchet clock. */
    feel(st, a, b, detents, gateMW, pan) {
      const c = feelOf(a, b, detents, gateMW);
      if (!c) return;
      if (c === 'ratchet') {
        const t = nowFn();
        if (st.ratchetT !== undefined && t >= st.ratchetT && t - st.ratchetT < RATCHET_MS) return;
        st.ratchetT = t;
      }
      ctx.cue(c, pan);
    },
    live(text) { live.textContent = text; },
    /** kind 'info': help, not a refusal (K-22). q (Q-47): its "?" or tile: pressed again, it hides the note. */
    note(host, text, ms = NOTE_MS, kind, q) {
      let n = notes.get(host);
      if (!n) { n = {span: el(doc, 'span', 'dk-note'), until: 0, q: null}; host.appendChild(n.span); notes.set(host, n); }
      if (q && n.q === q && !n.span.hidden) return closeNote(n);
      if (n.q !== q) opened(n.q, false);
      n.q = q || null;
      n.span.className = kind === 'info' ? 'dk-note info' : 'dk-note';
      n.span.textContent = text;
      n.span.hidden = false;
      // a "?" note stays 0.3 s a word or more
      n.until = nowFn() + (q && q.classList.contains('dk-q') ? Math.max(ms, 300 * text.split(' ').length) : ms);
      if (q) { opened(q, true); notes.delete(host); notes.set(host, n); }
      live.textContent = text;
    },
    /** A sim input, unless the desk is locked; a refusal shows on `host`. Returns '' or the reason. */
    /**
     * Every press during the watch answers with this one note (help, so blue: Q-41), and it is
     * true about Esc: the first full watch plays through (vm.mode.canSkip false).
     */
    lockNote(host) {
      if (!host) return;
      ctx.note(host, 'desk locked while the grid catches itself' + (vm && vm.mode && vm.mode.canSkip ? ' (Esc skips)' : ': watch this one'), undefined, 'info');
    },
    send(x, host) {
      if (locked()) { ctx.lockNote(host); return 'desk locked'; }
      const r = actions.input(x);
      const why = typeof r === 'string' ? r : r && typeof r === 'object' && typeof r.reason === 'string' ? r.reason : '';
      if (why && host) ctx.note(host, '✕ ' + why);
      return why;
    },
    showBay(view) { bay.show(view, true); },
  };
  ctx.guards = makeGuards(ctx.now);
  ctx.holds = makeHolds(ctx.now);
  ctx.consider = makeConsider(ctx.now, ctx.guards, target => ctx.ui({do: 'consider', target}));

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
  const c4a = cell(c4, 'dk-c4a'), c4b = cell(c4, 'dk-c4b dk-panel');
  const slot = opts.annunSlot, roots = slot ? [desk, slot] : [desk], mine = e => roots.some(r => r.contains(e));   // (§30.4: the alarms are the desk's)

  const dial = createFreqDial(ctx, c1a);
  const imb = createImbalanceBar(ctx, c1b);
  const gauge = createGauge(ctx, c1b);
  const levers = createLevers(ctx, c2a);
  const rot = el(doc, 'div', 'dk-rots');
  c2b.appendChild(rot);
  const hydro = createHydroWheel(ctx, rot);
  const batt = createBatteryDial(ctx, rot);
  const tie = createTieKnob(ctx, rot);
  const emerg = createEmergency(ctx, rot, c4b);
  const bay = createBay(ctx, c3b);
  const annun = createAnnunciator(ctx, slot || c4);
  const tray = createTray(ctx, c4a);
  desk.appendChild(live);
  root.appendChild(desk);

  function focus(id) {
    const e = doc.getElementById(id);
    if (!mine(e) || e.hidden) return false;
    if (id === 'bay-restore') bay.show('restore', true);
    if (id === 'bay-sync') bay.show('sync', true);
    if (id === 'tray' && tray.focusFirst()) return true;   // M: straight to the first card's button
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
    for (const e of roots) {
      if (e.style.getPropertyValue ? e.style.getPropertyValue('--dk-k') !== k.toFixed(3) : e.style['--dk-k'] !== k.toFixed(3)) {
        e.style.setProperty('--dk-k', k.toFixed(3));
      }
      setCls(e, 'dk-rm', ctx.rm());   // desk.css: no shake, no handle transition, flashes <= 1 Hz (§13.5)
    }
    ctx.guards.expire();
    // C-10: the focused guard is read from the document as well as heard from its events; a cover
    // that dropped by itself, or a guard that lost the focus or the pointer since the last frame,
    // changes what is being considered. A new day: the shell has cleared its target, so say it again.
    const ae = doc.activeElement;
    ctx.consider.focusIs(ae && ae.classList && ae.classList.contains('dk-guard') && desk.contains(ae) ? ae.id : null);
    if (fin(v.obs.tick, 0) < lastTick) { ctx.consider.forget(); ctx.guards.clear(); }
    lastTick = fin(v.obs.tick, 0);
    ctx.consider.tick();
    ctx.holds.tick();
    for (const n of notes.values()) if ((nowFn() > n.until || n.span.hidden) && (n.q || !n.span.hidden)) closeNote(n);
    setCls(desk, 'dk-locked', locked());
    setCls(desk, 'dk-hand', v.obs.mode === 'HAND');
    // K-12: a rough close shakes that unit's lever (or the hydro wheel) for 0.6 s.
    const rough = roughSyncUnit(v, prevScope);
    if (rough) {
      const st = v.obs.units.find(u => u.id === rough).station;
      if (st === 'hydro') hydro.shake(); else levers.shake(st);
    }
    const su = v.obs.scope && v.obs.scope.unit ? v.obs.units.find(u => u.id === v.obs.scope.unit) : null;
    prevScope = su ? {unit: su.id, slipHz: fin(su.slipHz)} : null;
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
    for (const r of roots) for (const e of r.querySelectorAll('.dk-focus')) if (e.id !== v.focus) e.classList.remove('dk-focus');
    if (v.focus) { const e = doc.getElementById(v.focus); if (mine(e)) e.classList.add('dk-focus'); }
  }

  /**
   * The desk's keys (the header lists them). The shell forwards every keydown and keyup here
   * before its own map (§13.3). Returns true exactly when the desk acted on the key.
   */
  function key(ev) {
    if (!vm || !ev || typeof ev.key !== 'string') return false;
    const t = ev.target;
    if (t && t.tagName && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return false;
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const down = ev.type !== 'keyup';
    // D and E are the desk's alone (§13.3), down, repeat and up, locked or not: the shell must never
    // start a second hold of its own for the same key.
    if ((k === 'd' || k === 'e') && !down) { emerg.holdKey(k, false); return true; }
    if (!down || ev.ctrlKey || ev.altKey || ev.metaKey) return false;
    if (k === 'd' || k === 'e') { if (!ev.repeat) emerg.holdKey(k, true); return true; }
    if (k >= '1' && k <= '8') return focus(SLOT_IDS[Number(k) - 1]);
    if (k === 'g' || k === 'v') return focus(DESK_KEYS[k]);
    // K answers even with DIRECT SHED hidden (when it appears), and in the watch (the lock note)
    if (k === 'k') { const on = focus(DESK_KEYS.k); if (!ev.repeat) emerg.shedKey(on); return true; }
    if (k === 'a') { if (ev.repeat) return true; if (ev.shiftKey) annun.silence(); else annun.ack(); return true; }
    const active = doc.activeElement;
    if (k === 'Enter') {
      // A focused desk button is pressed by Enter here, once (the shell then prevents the native click).
      // The hold keys and the restore list take their own Enter; the RESPOND card's Enter is the shell's.
      // A held Enter is swallowed, so auto-repeat can never be the second press of a guard (K-3).
      if (vm.respond || !mine(active)) return false;
      if (active === tray.el) return ev.repeat ? true : tray.focusFirst();
      if (active.tagName !== 'BUTTON' || active.disabled || active.classList.contains('dk-hold')) return false;
      if (active.classList.contains('dk-guard')) ctx.consider.keyboard(active.id);   // C-10: the keyboard is on this guard now, whoever focused it
      if (!ev.repeat) active.click();
      return true;
    }
    const bayKey = k.length === 1 && '[]curob'.includes(k);
    if (locked()) {
      // The watch (Q-41): a desk control's keys answer with the lock note, once per press, never reaching the fallback,
      // also when focus has left it (Space blurs) and vm.focus still names it (the fallback would send to it, refused in red).
      const box = e => (e && e.closest && desk.contains(e) ? e.closest('.dk-lever-slot') || e.closest('.dk-rot') : null);
      const watch = vm.mode && vm.mode.locked;
      const slot = (k.length === 1 && 'sxp'.includes(k) || watch && /^(Arrow|Page|Home$|End$)/.test(k)) &&
        (box(active) || watch && box(vm.focus && doc.getElementById(vm.focus)));
      if (slot) { if (!ev.repeat) emerg.locked(slot); return true; }
      if (bayKey || k === 'n') { if (!ev.repeat) (k === 'n' ? emerg.redispatch() : bay.key(k)); return true; }
      return false;
    }
    // S, X, P: the focused control's, also when focus has left it (Space blurs) and vm.focus still names it
    const tgt = active && desk.contains(active) ? active : vm.focus && doc.getElementById(vm.focus);
    if (k === 's' || k === 'x' || k === 'p') return levers.key(tgt, k, !!ev.shiftKey) || hydro.key(tgt, k, !!ev.shiftKey);
    if (bayKey) return ev.repeat && k !== '[' && k !== ']' ? false : bay.key(k);
    if (k === 'n') return ev.repeat ? false : emerg.redispatch();
    return false;
  }

  /** Q-47: Esc hides the newest "?" or tile note: true, or false when none shows. */
  function closeHelp() {
    let top = null;
    for (const n of notes.values()) if (n.q && !n.span.hidden) top = n;
    if (top) closeNote(top);
    return !!top;
  }

  return {el: desk, update, key, focus, closeHelp, slots: {stack}, ids: DESK_IDS};
}

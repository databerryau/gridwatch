// app/keys.js: the K-23 key map for the game (next.html). app/input.js stays the bench's.
//
// createKeys() is a small state machine (S S / X X within 2 s, D / E / F holds); keyDown,
// keyUp and poll return ACTIONS, never touching the DOM or the sim:
//   {ui: {...}}           a presentation command (actions.ui)
//   {input: {...}}        a sim input (actions.input)
//   {redispatch: true}    RE-DISPATCH (actions.redispatch)
// bindKeys(doc, keys, getVm, run, now, route) attaches it to a document: the page's ONE key
// listener. Its order (desk/README.md §13.3), so that the same key never acts twice:
//   1. a key typed into a text field, or already consumed by a focused control (it called
//      preventDefault: the desk's controls handle their own arrows, S S and so on), or one the
//      shell says is not the game's (route.own: the settings popover's sliders), is left alone;
//      so is anything with Ctrl / Meta / Alt (browser shortcuts are never game keys);
//   2. route.first(ev) (the shell: Enter on the briefing card);
//   3. each module of route.chain() that has key(ev), in order: the desk, the Live Stack, the
//      map. The first that returns true used the key: preventDefault, stop;
//   4. this file's map, the fallback that makes every K-23 key work from anywhere.
// D and E holds are the desk's while a desk with key() is mounted (keys.holds = false): the
// fallback then neither times nor fires them.
//
// | 1-8                     focus COAL / CCGT / GT·A / GT·B / GT·C / hydro / battery / tie
// | ↑ ↓ (Shift fine), PgUp/PgDn   move the focused lever (±10 / ±1 MW, next detent) or wheel
// | S S / X X               START / STOP the focused station's next machine (guarded: twice in 2 s)
// | P                       rejoin the plan (HAND)
// | [ ] C U                 slip lower / raise, close the breaker, auto-sync (the open scope)
// | R                       restore bay (←/→ and Enter are the bay's own)
// | A, Shift+A              ACK, SILENCE
// | D, E (hold 0.6 s)       industrial DR, reserve diesel key
// | T, M, L, Tab            trip preview, tray (again: its LOG), Live Stack (again: expand), map
// | Space, Esc, F (hold)    pause, skip the watch (after a full one), fast (doing nothing: a blue toast says why)
// | Enter                   dismiss the respond card
// | ?                       the abstractions drawer; Shift+M mute
// | ,                       the SETTINGS popover (B-7)

import {V} from '../sim/params.js';

export const FOCUS_KEYS = Object.freeze(['lever-coal', 'lever-ccgt', 'lever-gta', 'lever-gtb', 'lever-gtc', 'wheel-hydro',
  'dial-battery', 'knob-tie']);
/** Guarded START / STOP: the second press must come within this (K-3). */
export const DOUBLE_MS = 2000;
/** D / E must be held this long (K-7). */
export const HOLD_MS = 600;
const DETENTS = [0.25, 0.5, 0.75];

/** @param {{holds?:boolean}} [o] holds: false when a mounted desk owns the D / E holds (§13.3). */
export function createKeys(o) {
  return {last: {key: '', atMs: -Infinity}, holds: {}, fired: {}, deskHolds: !!(o && o.holds === false)};
}

const leverStation = id => (typeof id === 'string' && id.startsWith('lever-') ? id.slice(6) : '');

function stationOf(obs, id) {
  return obs.stations.find(s => s.id === id) || null;
}

// The next detent above / below the lever (MIN, 25/50/75% of the machines on, max).
function nextDetent(st, up) {
  const pts = [st.minMW, ...DETENTS.map(f => f * st.maxMW), st.maxMW].filter(x => x >= st.minMW).sort((a, b) => a - b);
  const b = st.basePointMW;
  if (up) { for (const p of pts) if (p > b + 0.5) return p; return st.maxMW; }
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i] < b - 0.5) return pts[i];
  return st.minMW;
}

// The machine S S would start (the first off and startable) or X X would stop (the last on).
function startable(obs, station) {
  return obs.units.find(u => u.station === station && u.mode === 'off' && u.startBlock === '') || null;
}
function stoppable(obs, station) {
  const on = obs.units.filter(u => u.station === station && (u.mode === 'on' || u.mode === 'loading') && u.stopBlock === '');
  return on.length ? on[on.length - 1] : null;
}

/**
 * A key went down.
 * @param {object} k from createKeys
 * @param {{key:string, shiftKey?:boolean, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, repeat?:boolean}} ev
 * @param {object} vm the latest view model (focus, obs, respond, stackExpanded)
 * @param {number} nowMs
 * @returns {object|null} an action, or null
 */
export function keyDown(k, ev, vm, nowMs) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;
  const key = ev.key, obs = vm && vm.obs, focus = vm ? vm.focus : null;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const double = lower === k.last.key && nowMs - k.last.atMs <= DOUBLE_MS;
  if (!ev.repeat) k.last = double ? {key: '', atMs: -Infinity} : {key: lower, atMs: nowMs};
  // Holds: D, E, F.
  if (lower === 'd' || lower === 'e' || lower === 'f') {
    if (lower !== 'f' && k.deskHolds) return null; // the desk's own hold keys (§13.3)
    if (!k.holds[lower]) { k.holds[lower] = nowMs; k.fired[lower] = false; }
    return lower === 'f' && !ev.repeat ? {ui: {do: 'fast', on: true}} : null;
  }
  if (key === ' ' || key === 'Spacebar') return {ui: {do: 'pause'}};
  if (key === 'Escape') return {ui: {do: 'skipWatch'}};
  if (key === 'Enter') return vm && vm.respond ? {ui: {do: 'dismissRespond'}} : null;
  if (key === '?') return {ui: {do: 'drawer'}};
  if (key === ',') return {ui: {do: 'settings'}};
  if (key === 'M' && ev.shiftKey) return {ui: {do: 'mute'}};
  if (key >= '1' && key <= '8' && key.length === 1) return {ui: {do: 'focus', target: FOCUS_KEYS[key.charCodeAt(0) - 49]}};
  if (lower === 'a') return ev.shiftKey ? {ui: {do: 'silence'}} : {ui: {do: 'ack'}};
  if (lower === 't') return {ui: {do: 'preview', on: !(vm && vm.previewOn)}};
  if (lower === 'm') return ev.repeat ? null : {ui: {do: 'tray'}};
  if (lower === 'l') return focus === 'stack' ? {ui: {do: 'stackExpand', on: !(vm && vm.stackExpanded)}} : {ui: {do: 'focus', target: 'stack'}};
  if (key === 'Tab' && !ev.shiftKey && (focus === null || focus === 'stack')) return {ui: {do: 'focus', target: 'map'}};
  if (lower === 'r') return {ui: {do: 'focus', target: 'bay-restore'}};
  if (!obs) return null;
  // The synchroscope.
  const scopeUnit = obs.scope && obs.scope.unit ? obs.scope.unit : '';
  if (key === '[' || key === ']') return scopeUnit ? {input: {type: 'syncTrim', unit: scopeUnit, dHz: key === '[' ? -0.05 : 0.05}} : null;
  if (lower === 'c') return scopeUnit ? {input: {type: 'syncClose', unit: scopeUnit, bypass: false}} : null;
  if (lower === 'u') return scopeUnit ? {input: {type: 'syncAuto', unit: scopeUnit}} : null;
  // The focused lever or the hydro wheel.
  const station = focus === 'wheel-hydro' ? 'hydro' : leverStation(focus);
  if (!station) return null;
  const st = stationOf(obs, station);
  if (!st) return null;
  if (lower === 'p') return obs.mode === 'HAND' ? {input: {type: 'planRejoin', station, keep: false}} : null;
  if (lower === 's' && double) { const u = startable(obs, station); return u ? {input: {type: 'start', unit: u.id}} : null; }
  if (lower === 'x' && double) { const u = stoppable(obs, station); return u ? {input: {type: 'stop', unit: u.id}} : null; }
  let mw = null;
  const rating = V.STATIONS[station].ratingMW;
  if (station === 'hydro' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    mw = st.basePointMW + (key === 'ArrowRight' ? 1 : -1) * (ev.shiftKey ? 0.1 : 0.01) * rating * Math.max(1, st.onCount);
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    mw = st.basePointMW + (key === 'ArrowUp' ? 1 : -1) * (ev.shiftKey ? 1 : 10);
  } else if (key === 'PageUp' || key === 'PageDown') {
    mw = nextDetent(st, key === 'PageUp');
  }
  if (mw === null) return null;
  return {input: {type: 'basePoint', station, mw: Math.max(0, Math.round(mw))}};
}

/** A key went up (F ends FAST; D / E released before the hold do nothing). */
export function keyUp(k, ev) {
  const lower = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (lower === 'd' || lower === 'e' || lower === 'f') {
    delete k.holds[lower];
    delete k.fired[lower];
    if (lower === 'f') return {ui: {do: 'fast', on: false}};
  }
  return null;
}

/** Once per frame: a D or E held for HOLD_MS fires once (K-7: never a tap). */
export function poll(k, nowMs) {
  const out = [];
  for (const key of ['d', 'e']) {
    if (k.holds[key] !== undefined && !k.fired[key] && nowMs - k.holds[key] >= HOLD_MS) {
      k.fired[key] = true;
      out.push({input: {type: key === 'd' ? 'callDR' : 'armRERT'}});
    }
  }
  return out;
}

/** True for a key event typed into a text field (never a game key). */
export function typing(t) {
  const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
  return tag === 'input' && t.type !== 'range' && t.type !== 'button' && t.type !== 'checkbox' || tag === 'textarea' || tag === 'select' ||
    !!(t && t.isContentEditable);
}

/**
 * Listen on `doc` (the order is in the file header). run(action) performs one fallback action.
 * @param {{own?:function(Event):boolean, first?:function(Event):boolean, chain?:function():Array<object|null>,
 *   used?:function(object, Event):void, error?:function(Error):void}} [route]
 *   own(ev): true when the key belongs to something outside the game (left alone);
 *   first(ev): true when the shell itself used the key; chain(): the modules to offer the key
 *   to, in order (those without key() are skipped); used(mod, ev): a module took the key;
 *   error(e): a module's key() threw (the key then falls through).
 *   A keyup always reaches the chain and the fallback, whatever its target: a hold must never
 *   miss its release.
 * @returns {function():void} unbind
 */
export function bindKeys(doc, k, getVm, run, now, route) {
  const clock = now || (() => globalThis.performance.now());
  const o = route || {};
  const offer = ev => {
    for (const m of o.chain ? o.chain() : []) {
      if (!m || typeof m.key !== 'function') continue;
      let took = false;
      try { took = m.key(ev) === true; } catch (e) { if (o.error) o.error(e); }
      if (!took) continue;
      if (ev.preventDefault) ev.preventDefault();
      if (o.used) o.used(m, ev);
      return true;
    }
    return false;
  };
  const down = ev => {
    if (ev.defaultPrevented || typing(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey || (o.own && o.own(ev))) return;
    if (o.first && o.first(ev)) { if (ev.preventDefault) ev.preventDefault(); return; }
    if (offer(ev)) return;
    const a = keyDown(k, ev, getVm(), clock());
    if (!a) return;
    if (ev.preventDefault) ev.preventDefault();
    if (a.ui && a.ui.do === 'pause' && doc.activeElement && doc.activeElement !== doc.body && doc.activeElement.blur) doc.activeElement.blur();
    run(a);
  };
  const up = ev => {
    if (offer(ev)) return;
    const a = keyUp(k, ev);
    if (a) run(a);
  };
  doc.addEventListener('keydown', down);
  doc.addEventListener('keyup', up);
  return () => { doc.removeEventListener('keydown', down); doc.removeEventListener('keyup', up); };
}

// desk/util.js: small DOM and text helpers shared by the desk modules (desk/README.md §6).
// No sim imports except sim/params.js; no state; DOM work only on elements passed in.

import {V} from '../sim/params.js';

export const STATION_SHORT = Object.freeze({coal: 'COAL', ccgt: 'CCGT', gta: 'GT·A', gtb: 'GT·B', gtc: 'GT·C', hydro: 'HYDRO'});
export const LEVER_STATIONS = Object.freeze(['coal', 'ccgt', 'gta', 'gtb', 'gtc']);

/** A finite number or the fallback (nothing NaN reaches a canvas or a style). */
export const fin = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A focusable control element with an ARIA role (K-23). */
export function control(doc, tag, cls, role, id, label) {
  const e = el(doc, tag, cls);
  if (id) e.id = id;
  if (role) e.setAttribute('role', role);
  if (tag !== 'button') e.setAttribute('tabindex', '0');
  if (label) e.setAttribute('aria-label', label);
  return e;
}

export const setText = (e, s) => { s = String(s); if (e.textContent !== s) e.textContent = s; };
export const setAttr = (e, k, v) => { v = String(v); if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
export const setCls = (e, c, on) => { if (e.classList.contains(c) !== !!on) e.classList.toggle(c, !!on); };
export const setStyle = (e, k, v) => { if (e.style[k] !== v) e.style[k] = v; };
export const setHidden = (e, h) => { if (e.hidden !== !!h) e.hidden = !!h; };

/**
 * A setAttr that changes its attribute at most once per `ms` of the desk clock (K-23: a canvas's
 * text alternative is read out, so it must not change every frame). The first value is set at once.
 */
export function slowAttr(now, ms = 1000) {
  let t = 0, first = true;
  return (e, k, v) => {
    v = String(v);
    if (e.getAttribute(k) === v) return;
    const n = now();
    if (!first && n >= t && n - t < ms) return;
    first = false; t = n;
    e.setAttribute(k, v);
  };
}

/**
 * Stereo pan (-1..1) of each desk area for its foley (desk/README.md §13.2): where the control
 * sits across the 1280-px floor layout (x / 640 - 1).
 */
export const PAN = Object.freeze({gauge: -0.81, coal: -0.55, ccgt: -0.42, gta: -0.29, gtb: -0.15, gtc: -0.02, hydro: -0.53,
  battery: -0.34, tie: -0.2, keys: -0.03, bay: 0.32, panel: 0.79});

/** Foley of a hand-moved value (K-20): 'gate' across the gate, 'detent' across a detent, else 'ratchet'. */
export function feelOf(a, b, detents, gateMW) {
  if (a === b) return '';
  if (gateMW !== undefined && gateMW !== null && (a <= gateMW) !== (b <= gateMW)) return 'gate';
  for (const d of detents || []) if ((a < d && d <= b) || (b <= d && d < a)) return 'detent';
  return 'ratchet';
}
export const RATCHET_MS = 50;   // at most one ratchet cue per 50 ms from one control (audio keeps <= 20/s overall)

/** Integer MW text. */
export const mw = x => String(Math.round(fin(x)));
/** Signed integer MW text. */
export const smw = x => { const r = Math.round(fin(x)); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r); };
export const hz3 = x => fin(x, 50).toFixed(3);
export const hz2 = x => fin(x, 50).toFixed(2);

/** "HH:MM" of a grid second (seconds since 04:00 of the sim day). */
export function clockOf(s) {
  const t = ((Math.floor(fin(s)) + V.DAY_START_H * V.S_PER_H) % (V.DAY_H * V.S_PER_H) + V.DAY_H * V.S_PER_H) % (V.DAY_H * V.S_PER_H);
  const h = Math.floor(t / V.S_PER_H), m = Math.floor((t % V.S_PER_H) / V.S_PER_MIN);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** "m:ss" of a duration in seconds. */
export function mmss(s) {
  const t = Math.max(0, Math.round(fin(s)));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

/** Plain name of a machine, the tie or a station: 'coal3' -> 'COAL 3', 'gta1' -> 'GT·A', 'tie' -> 'TIE'. */
export function unitLabel(id) {
  if (!id) return '—';
  if (id === 'tie') return 'TIE';
  if (STATION_SHORT[id]) return STATION_SHORT[id];
  const m = /^([a-z]+)(\d+)$/.exec(id);
  if (!m || !STATION_SHORT[m[1]]) return String(id).toUpperCase();
  return V.STATIONS[m[1]].machines > 1 ? STATION_SHORT[m[1]] + ' ' + m[2] : STATION_SHORT[m[1]];
}

/** Machine state -> lamp glyph and word: one glyph per state, so no state is told by colour alone (K-22). */
export const MODE_GLYPH = Object.freeze({
  off: '○', starting: '◔', ready: '◑', loading: '▲', on: '●', unloading: '▼', shutdown: '◌', tripped: '✕',
});
export const MODE_WORD = Object.freeze({
  off: 'OFF', starting: 'STARTING', ready: 'READY', loading: 'LOADING', on: 'ON', unloading: 'UNLOADING',
  shutdown: 'SHUTDOWN', tripped: 'TRIPPED',
});

/** Nadir colour class (K-10): >= 49.5 good, 49.0-49.5 warn, < 49.0 crit; with its glyph. */
export function nadirClass(hz) {
  const f = fin(hz, 50);
  return f >= V.SECURE_NADIR_HZ ? 'good' : f >= V.UFLS_FIRST_HZ ? 'warn' : 'crit';
}
export const CLASS_GLYPH = Object.freeze({good: '✓', warn: '!', crit: '✕'});

// ---------------------------------------------------------------- guards and holds (K-3, K-7)

export const GUARD_MS = 2000;         // K-3: S S / X X within 2 s
export const GUARD_CLICK_MS = 5000;   // K-3: a press on the guard itself, then again within 5 s
export const COMMIT_LOCK_MS = 1000;   // K-3: no press on that unit's guards for 1 s after a commit
export const HOLD_MS = 600;           // K-7: emergency controls commit only after a 0.6-s hold

/**
 * Guard covers: the first press lifts the cover for `ms`, a second press while it is up
 * commits. Time comes from `now()` (the desk's frame clock), never from timers.
 */
export function makeGuards(now) {
  const lifted = new Map();
  return {
    press(id, commit, ms = GUARD_MS) {
      const t = now(), u = lifted.get(id);
      if (u !== undefined && t <= u) { lifted.delete(id); commit(); return 'commit'; }
      lifted.set(id, t + ms);
      return 'lift';
    },
    lift(id) { lifted.set(id, now() + GUARD_MS); },
    lifted(id) { const u = lifted.get(id); return u !== undefined && now() <= u; },
    drop(id) { lifted.delete(id); },
    expire() { const t = now(); for (const [k, u] of lifted) if (t > u) lifted.delete(k); },
  };
}

/**
 * Press-and-hold: down() starts, the action fires once HOLD_MS have passed while still held
 * (checked by tick() each frame, and by up()); releasing earlier cancels ('short').
 */
export function makeHolds(now) {
  const held = new Map();
  return {
    down(id, done) { if (!held.has(id)) held.set(id, {t0: now(), done}); },
    up(id) {
      const h = held.get(id);
      if (!h) return null;
      held.delete(id);
      if (now() - h.t0 >= HOLD_MS) { h.done(); return 'done'; }
      return 'short';
    },
    cancel(id) { held.delete(id); },
    active: id => held.has(id),
    progress(id) { const h = held.get(id); return h ? clamp((now() - h.t0) / HOLD_MS, 0, 1) : 0; },
    tick() {
      const t = now();
      for (const [id, h] of [...held]) if (t - h.t0 >= HOLD_MS) { held.delete(id); h.done(); }
    },
  };
}

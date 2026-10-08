// app/shell.js: the game page (next.html) around app/game.js. It mounts the map, the desk and
// the Live Stack (whichever modules boot.js passes in), draws the header and the overlays
// (briefing, watch, respond card, end card, drawer, "?" labels, toast, ?perf), runs the frame
// loop (ticks, then the view model, then every module draws: never inside step(), X-26),
// binds the K-23 keys and starts the audio on the first gesture.
//
// app/boot.js is the page's one module script: it imports the real modules and calls
// bootGame(document, {...}). Tests call bootGame with the stand-in DOM (tests/lib/dom.js) and
// stand-in modules, so the shell is tested before the other stage B files exist.
//
// Element ids other modules rely on:
//   #map, #desk      the roots createMap / createDesk receive
//   #stack-slot      created BY THE DESK in its third column: createLiveStack's root. If the
//                    desk has none, the shell makes one at the end of #desk.
//   #stack-overlay   L-4: while vm.stackExpanded the shell moves the Live Stack's `el` here
//                    (over the map, ~1248 x 420) and back into #stack-slot after; the stack
//                    sizes its canvas from its parent on update.
//
// Phase 1b (desk/README.md §13): the SETTINGS popover (#btn-settings, `,`; B-7) and the body
// classes rm / fxlow / crt that follow vm.settings; the one key listener and its order (§13.3:
// the desk's key(ev), then the stack's and the map's, then app/keys.js); the #aria-live region
// (createLive / liveFrame below); the ?perf budget marks; ?debug -> globalThis.gridwatch.
// desk/README.md §30: texts and the alarm panel on demand (Q-44, Q-46), "?" and Esc (Q-47), par (Q-48).

import {SIM_VERSION, V} from '../sim/params.js';
import * as G from './game.js';
import {startRaf} from './loop.js';
import {createKeys, bindKeys, poll as pollKeys, typing} from './keys.js';
import {createPerf, perfFrame, renderPerf} from './perf.js';
import {createAudio} from '../audio/audio.js';
import {ANCHORS} from '../content/anchors.js';
import {badgeText, lightsText, centsText, co2Text, clockText} from '../render/format.js';
import {BEATS} from './watch.js';
import {modeOf} from './director.js';

/** K-17: header, map and desk heights (px) for a viewport; the CSS in next.html does the same. */
export function layoutSizes(width, height) {
  const header = width >= 1600 ? 40 : 32;
  const desk = Math.max(300, Math.floor((height - header) / 2));
  return {header, desk, map: height - header - desk};
}

const WATCH_WORDS = {inertia: 'INERTIA', battery: 'BATTERY', governors: 'GOVERNORS', ufls: 'UFLS', settle: 'SETTLE'};
// Why F did nothing, by mode (the director's setFast refuses these).
const FAST_WAIT = {WATCH: 'the watch plays the trip in slow motion', 'RESPOND-CARD': 'read the card, then Enter',
  RESPOND: 'RESPOND runs 30× until frequency is back in band', FOCUS: 'the clock runs 1× while you SYNC or RESTORE',
  ALARMS: 'the alarm panel holds the clock: Esc closes it'};
/** Q-48: par's ticks per frame while the day runs, and once it is over. */
export const PAR_STEP_TICKS = 3000, PAR_STEP_OVER_TICKS = 6000;
// Q-46: the alarm panel's own keys inside it; the keys that outside it do not close it (§30.3.6).
const PANEL_OWN = /^(Arrow\w+|Home|End|Enter|Tab)$/, PANEL_KEEPS = /^([ wWaA?,]|Escape|Spacebar|Shift|Control|Alt\w*|Meta|OS|CapsLock|Fn|Dead|Unidentified)$/;
/** The CRT switch's title and answer while REDUCED EFFECTS is on (it is greyed). */
export const CRT_OFF = 'CRT is off while REDUCED EFFECTS is on';

// ------------------------------------------------------------------ the objective line's word (Q-18, C-10)

// The level as a glyph and a word (K-22: never colour alone). By level; and by kind where the
// level's own word would say the wrong thing: a STOP or a BATTERY line is advice about cost, never
// URGENT, and a line about spare or a dark district names what it is about. Never SHORT, the
// BALANCE bar's word.
const LEVEL_WORD = Object.freeze({ok: '✓ STEADY', plan: '◷ PLAN', act: '▶ ACT NOW', crit: '‼ URGENT'});
const KIND_WORD = Object.freeze({
  watch: {ok: '◉ WATCH', plan: '◉ WATCH', act: '◉ WATCH', crit: '◉ WATCH'},
  stop: {plan: '◇ SAVING', act: '▶ ACT NOW', crit: '▶ ACT NOW'},
  battery: {plan: '◇ BATTERY', act: '▶ BATTERY', crit: '▶ BATTERY'},
  spare: {plan: '◷ SPARE', crit: '▶ ACT NOW'},
  restore: {plan: '◷ DARK', crit: '▶ ACT NOW'},
});
/** The word beside a consequence line (C-10): what a guarded press would do. */
export const CONSIDER_WORD = '? IF PRESSED';
/** The words while a guard's cover is up (vm.armed), and for a unit on its way (level 'ok'). */
export const ARMED_WORD = '● ARMED', UNDER_WAY_WORD = '✓ UNDER WAY';

/** The glyph and word shown beside an objective line {kind, level} (app/objective.js). */
export function objectiveWord(o) {
  if (!o) return '';
  const byKind = KIND_WORD[o.kind];
  return (byKind && byKind[o.level]) || LEVEL_WORD[o.level] || '';
}

/**
 * The briefing's line about the day (P-3; desk/README.md §21.4): its type and whether it is a
 * weekday, from the public obs.day only (a heatwave day reads HOT until it is announced, C-2).
 */
export function dayText(day) {
  if (!day) return '';
  const when = day.weekend ? 'weekend' : 'weekday';
  const lean = day.weekend ? ' Demand is lower at the weekend, and one coal unit has been off since Friday night.' : '';
  if (day.temp === 'MILD') return 'Today: a mild ' + when + '. Rooftop solar will cut the demand your plant must meet around midday; the evening still climbs.' + lean;
  return 'Today: a hot ' + when + '. A heatwave warning, if one comes, comes mid-morning.' + lean;
}

// ------------------------------------------------------------------ the live region (K-23, §13.3)

/** #aria-live says at most one message per this many real ms. */
export const LIVE_GAP_MS = 2000;
// What waits is one slot per kind (the newest of a kind replaces the older: "newest alarm
// wins"), said in this order.
const LIVE_ORDER = ['alarm', 'tray', 'band', 'level', 'mode'];
const BAND_TEXT = {normal: 'Frequency back in the normal band', outside: 'Frequency outside the normal band',
  containment: 'Frequency outside the containment band'};

/** The frequency band the live region names: 'normal' | 'outside' (normal) | 'containment' (outside it). */
export function bandOf(hz) {
  if (hz < V.CONTAIN_LO_HZ || hz > V.CONTAIN_HI_HZ) return 'containment';
  return hz < V.NORMAL_LO_HZ || hz > V.NORMAL_HI_HZ ? 'outside' : 'normal';
}

/** A new live-region model (pure; liveFrame feeds it a vm per frame). */
export function createLive() {
  return {primed: false, lastMs: -Infinity, tick: -1, mode: '', band: '', bandSaid: '', level: '', levelSaid: '', tiles: {}, cards: new Set(),
    q: {}};
}

/**
 * One frame of the live region: note what changed in `vm` (the mode, the frequency band, the
 * N-1 word, a tile going into alarm or escalating, a new tray warning) and return the one
 * message to say now, or null. At most one per LIVE_GAP_MS; the rest wait, one per kind.
 */
export function liveFrame(L, vm, nowMs) {
  const obs = vm.obs;
  if (obs.tick < L.tick) { const fresh = createLive(); fresh.lastMs = L.lastMs; Object.assign(L, fresh); } // a new day on the same page
  L.tick = obs.tick;
  const first = !L.primed;
  L.primed = true;
  const mode = vm.mode.mode;
  if (mode !== L.mode) { L.mode = mode; if (!first) L.q.mode = mode === 'WATCH' ? 'WATCH' : badgeText(vm.mode); }
  const band = bandOf(obs.f.hz);
  if (band !== L.band) { L.band = band; if (first) L.bandSaid = band; else L.q.band = BAND_TEXT[band] + ', ' + obs.f.hz.toFixed(2) + ' Hz'; }
  const level = obs.sec.level;
  if (level !== L.level) { L.level = level; if (first) L.levelSaid = level; else L.q.level = 'N-1 ' + level; }
  for (const t of vm.alarms.tiles) {
    const was = L.tiles[t.id], is = t.state + (t.escalated ? '!' : '');
    if (was !== is) {
      L.tiles[t.id] = is;
      if (t.state === 'alarm' && !first && (t.escalated ? !(was && was.endsWith('!')) : !(was && was.startsWith('alarm')))) {
        L.q.alarm = (t.escalated ? 'Alarm escalated: ' : 'Alarm: ') + t.label + ', ' + t.prio;
      }
    }
  }
  for (const c of vm.tray.cards) {
    if (L.cards.has(c.id)) continue;
    L.cards.add(c.id);
    if (c.sev === 'warn' && !first) L.q.tray = c.from + ': ' + c.text;
  }
  if (nowMs - L.lastMs < LIVE_GAP_MS) return null;
  // A band or level that flapped back to what was last said has nothing to say.
  if (L.q.band && L.band === L.bandSaid) delete L.q.band;
  if (L.q.level && L.level === L.levelSaid) delete L.q.level;
  for (const k of LIVE_ORDER) {
    const text = L.q[k];
    if (!text) continue;
    delete L.q[k];
    if (k === 'band') L.bandSaid = L.band;
    if (k === 'level') L.levelSaid = L.level;
    L.lastMs = nowMs;
    return text;
  }
  return null;
}

// vm.settings key -> the popover's control id (next.html #settings).
const SET_RANGES = {volume: 'set-volume', hum: 'set-hum', fx: 'set-fx', alarms: 'set-alarms'};
const SET_CHECKS = {reducedMotion: 'set-rm', reducedEffects: 'set-fxlow', crt: 'set-crt'};

/**
 * Boot the game on `doc`.
 * @param {Document} doc
 * @param {{createDesk?:function, createLiveStack?:function, createMap?:function, system?:object, planview?:object,
 *   search?:string, storage?:object|null, audioWin?:object, raf?:boolean, now?:function():number, date?:Date,
 *   matchMedia?:function(string):{matches:boolean}|null, text?:object|function, alarmPanel?:object|function,
 *   par?:boolean|object}} deps
 *   raf: false to skip startRaf (tests call handle.frame(dtS) themselves). matchMedia: the
 *   system's prefers-reduced-motion is read through it (default: globalThis.matchMedia when
 *   present; null: no system preference).
 *   text, alarmPanel (Q-44): the module (tests), a loader of it, or absent: imported on first need.
 * @returns {object} handle {game, actions, frame(dtS), vm(), audio, mods, keys, perf, live, loadText(), closeTop(), unbind()}
 */
export function bootGame(doc, deps) {
  const o = deps || {};
  const $ = id => doc.getElementById(id);
  const now = o.now || (() => globalThis.performance.now());
  const search = o.search === undefined ? (globalThis.location ? globalThis.location.search : '') : o.search;
  const query = new URLSearchParams(search);
  // K-22: reduced motion defaults from the system. Asked on every read, so a change of the
  // system setting is followed without a listener.
  const mm = o.matchMedia === undefined ? (typeof globalThis.matchMedia === 'function' ? q => globalThis.matchMedia(q) : null) : o.matchMedia;
  let rmQuery = null;
  try { rmQuery = mm ? mm('(prefers-reduced-motion: reduce)') : null; } catch { rmQuery = null; }
  const game = G.createGame({seed: G.seedFrom(search, o.date), system: o.system, planview: o.planview, scenario: o.scenario, commit: o.commit,
    startPaused: o.startPaused, par: o.par,
    storage: o.storage === undefined ? safeStorage() : o.storage, reducedMotion: () => !!(rmQuery && rmQuery.matches)});
  const audio = createAudio(o.audioWin === undefined ? globalThis : o.audioWin);
  const perf = query.has('perf') ? createPerf() : null;
  const keys = createKeys();
  const live = createLive();
  let vm = null, lastPerfDraw = -1e9, toastUntil = 0, qNext = 0;

  // ---------------------------------------------------------------- actions (desk/README.md §4)
  const base = G.makeActions(game);
  let opener = null; // Q-46: the focus when the alarm panel opened
  const actions = {
    input: x => { const r = base.input(x); if (r) showToast('Refused: ' + r); return r; },
    redispatch: () => { const r = base.redispatch(); if (r) showToast('RE-DISPATCH: ' + r); return r; },
    ui: cmd => {
      const inTray = cmd && cmd.do === 'tray' && $('tray') && $('tray').contains(doc.activeElement);
      const wasOpen = !!game.ui.alarmsOpen;
      if (cmd && cmd.do === 'alarms' && !wasOpen) opener = doc.activeElement;
      const r = base.ui(cmd);
      if (cmd) answer(cmd, r, inTray);
      if (cmd && cmd.do === 'focus' && cmd.target) focusEl(cmd.target);
      else if (cmd && wasOpen && !game.ui.alarmsOpen) focusAfterPanel(cmd);
      if (cmd && (cmd.do === 'drawer')) drawDrawer();
      if (cmd && (cmd.do === 'settings' || cmd.do === 'set' || cmd.do === 'mute')) drawSettings(G.settingsView(game), game.ui.settingsOpen);
      return r;
    },
    previewTrip: opts => base.previewTrip(opts),
    restorePreview: id => base.restorePreview(id),
  };

  // Every press answers (Q-41): a shell press that did nothing says why, in blue (help, never red).
  const held = () => game.phase === 'briefing' ? 'Take the desk first: Enter. Then Space runs the clock.'
    : 'Day over: PLAY THIS DAY AGAIN for another go';
  function answer(cmd, r, inTray) {
    const m = modeOf(game.director, game.state), say = s => showToast(s, 'info');
    if (cmd.do === 'pause' && r) say(held());
    if (cmd.do === 'fast' && cmd.on) {
      if (r) say('FAST waits: ' + (FAST_WAIT[m.mode] || 'not now') + (m.canSkip ? ' (Esc skips)' : ''));
      else if (game.phase !== 'play' || game.state.over) say(held());
      else if (m.mode === 'PAUSE') say('FAST needs the clock running: Space');
    }
    if (cmd.do === 'skipWatch' && r && m.mode === 'WATCH') say('The first watch plays through: Esc skips from the next trip');
    // M: onto the tray's newest message; M again (the keys in the tray): its LOG opens or closes.
    if (cmd.do === 'tray') {
      const log = $('btn-log');
      if (inTray && log) { log.click(); log.focus(); } else if (mods.desk && mods.desk.focus) mods.desk.focus('tray');
    }
  }

  function focusEl(id) {
    let el = $(id);
    // A box a browser cannot focus (#map: no tabindex) hands the focus to its focusable child
    // (the map's .citymap, which takes the keys).
    if (el && !el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName)) el = el.querySelector('[tabindex]') || el;
    if (el && el.focus) { try { el.focus(); } catch { /* ignore */ } }
  }

  // Q-46 (§30.3.4): once the panel closes, the focus goes back to its opener if shown, or to GO TO's target.
  function focusAfterPanel(cmd) {
    let n = opener;
    if (cmd.do === 'alarmsGoto' && cmd.target) focusEl(cmd.target);
    if (cmd.do !== 'alarms' || !n || n === doc.body) return;
    while (n && !n.hidden && n !== doc.body) n = n.parentElement;
    if (n === doc.body) opener.focus();
  }

  // ---------------------------------------------------------------- modules
  const mods = {map: null, desk: null, stack: null, errors: []};
  const mount = (name, fn, root, opts) => {
    if (!fn || !root) return null;
    try { return opts === undefined ? fn(doc, root, actions) : fn(doc, root, actions, opts); } catch (e) { mods.errors.push(name + ': ' + (e && e.message ? e.message : e)); return null; }
  };
  mods.map = mount('map', o.createMap, $('map'));
  mods.desk = mount('desk', o.createDesk, $('desk'), {annunSlot: $('annun-slot')});
  let slot = $('stack-slot');
  if (!slot && $('desk')) {
    slot = doc.createElement('div');
    slot.id = 'stack-slot';
    $('desk').appendChild(slot);
  }
  mods.stack = mount('stack', o.createLiveStack, slot);
  let stackOut = false;
  // §13.3: the D and E holds belong to a mounted desk that takes keys.
  keys.deskHolds = !!(mods.desk && typeof mods.desk.key === 'function');

  // ---------------------------------------------------------------- header, briefing
  const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
  on('btn-pause', 'click', () => actions.ui({do: 'pause'}));
  on('rate-badge', 'click', () => actions.ui({do: 'pause'}));
  // K-16: a click on the card or the desk takes the desk, as Enter does
  const dismissCard = () => { if (game.respond) actions.ui({do: 'dismissRespond'}); };
  on('respond-card', 'click', dismissCard);
  on('desk', 'pointerdown', dismissCard);
  on('btn-mute', 'click', () => { actions.ui({do: 'mute'}); });
  on('btn-help', 'click', () => actions.ui({do: 'drawer'}));
  let briefAgc = true;
  const setBriefMode = agc => {
    briefAgc = agc;
    const a = $('btn-agc'), h = $('btn-hand');
    if (a) { a.classList.toggle('on', agc); a.setAttribute('aria-checked', String(agc)); }
    if (h) { h.classList.toggle('on', !agc); h.setAttribute('aria-checked', String(!agc)); }
  };
  on('btn-agc', 'click', () => setBriefMode(true));
  on('btn-hand', 'click', () => setBriefMode(false));
  const take = () => {
    if (G.takeDesk(game, {agc: briefAgc})) { const b = $('briefing-card'); if (b) b.hidden = true; }
  };
  on('btn-take', 'click', take);
  briefingText();

  function briefingText() {
    const b = $('briefing-card');
    if (!b) return;
    b.hidden = game.phase !== 'briefing';
    const day = $('briefing-day');
    if (day) day.textContent = dayText(game.state.day);
    const w = $('briefing-watch');
    if (w) {
      const news = game.state.news.map(n => n.text);
      w.textContent = 'Seed ' + game.seed + ' · AGC is on by default; HAND flies the day without it, locked at 04:30.' +
        (news.length ? ' Watch for: ' + news[0] : '');
    }
  }

  // ---------------------------------------------------------------- on demand (Q-44): a module passed in (tests), a loader, or import()
  const err = (what, e) => mods.errors.push(what + ': ' + (e && e.message ? e.message : e));
  function lazy(src, imp, got, fail) {
    if (src && typeof src === 'object') { try { got(src); } catch (e) { fail(e); } return; }
    Promise.resolve().then(typeof src === 'function' ? src : imp).then(got).catch(fail);
  }
  // loadText(): TEXT, or null while it loads (the first call starts it) or failed; open help redraws on arrival.
  let TEXT = null, textState = ''; // 'loading' | 'ready' | 'failed'
  const redrawHelp = () => { if (game.ui.drawer) drawDrawer(); if (popRows) fillPopover(); };
  function loadText() {
    if (textState) return TEXT;
    textState = 'loading';
    lazy(o.text, () => import('../content/text.js'), m => { TEXT = m.TEXT || null; textState = TEXT ? 'ready' : 'failed'; redrawHelp(); },
      e => { textState = 'failed'; err('text', e); redrawHelp(); });
    return TEXT;
  }

  // ---------------------------------------------------------------- "?" labels and the drawer (H-14)
  const qButtons = new Map();
  function placeQs() {
    const layer = $('q-layer');
    if (!layer) return;
    for (const {game: id, rows} of ANCHORS) {
      const el = $(id);
      let q = qButtons.get(id);
      if (!el) { if (q) q.hidden = true; continue; }
      if (!q) {
        q = doc.createElement('button');
        q.className = 'q';
        q.textContent = '?';
        q.dataset.anchor = id;
        q.title = rows.join(' · ');
        q.setAttribute('aria-label', 'About: ' + rows.join('; '));
        q.addEventListener('click', ev => { if (ev.stopPropagation) ev.stopPropagation(); toggleHelp(q, rows); });
        qButtons.set(id, q);
        // The header is the shell's own: its "?" sits inline right after the element. Desk,
        // stack and map elements get a floating badge on their top-right corner (their DOM is
        // their modules' own, so the shell never inserts into it).
        const hdr = $('hdr');
        if (hdr && hdr.contains(el) && el.parentElement) {
          q.className = 'q inline';
          const p = el.parentElement, next = p.children[Array.prototype.indexOf.call(p.children, el) + 1] || null;
          p.insertBefore(q, next);
          continue;
        }
        layer.appendChild(q);
      }
      if (q.classList.contains('inline')) continue;
      const r = el.getBoundingClientRect();
      q.hidden = !(r.width > 0 && r.height > 0);
      q.style.left = Math.round(r.right - 26) + 'px';
      q.style.top = Math.round(r.top + 2) + 'px';
    }
  }
  function entryNodes(parent, e, headTag) {
    const h = doc.createElement(headTag);
    h.textContent = e.row;
    parent.appendChild(h);
    for (const [k, label] of [['real', 'Real world: '], ['ours', 'GRIDWATCH: '], ['why', 'Why: ']]) {
      const p = doc.createElement('p');
      const b = doc.createElement('b');
      b.textContent = label;
      p.appendChild(b);
      p.appendChild(doc.createTextNode(e[k]));
      parent.appendChild(p);
    }
  }
  // Q-47 (§30.3.7): every "?" calls toggleHelp; only closePopover() hides #popover. (Today's behaviour: W2 fills them.)
  let popAnchor = null, popRows = null;
  function fillPopover() {
    const pop = $('popover'), T = loadText();
    pop.replaceChildren();
    for (const row of popRows) {
      const e = T && T.abstractions.find(x => x.row === row);
      if (e) entryNodes(pop, e, 'h4'); else pop.appendChild(doc.createElement('h4')).textContent = row;
    }
  }
  function openPopover(anchorEl, rows) {
    const pop = $('popover');
    if (!pop) return;
    popAnchor = anchorEl; popRows = rows;
    fillPopover();
    const r = anchorEl.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.round(r.left - 200)) + 'px';
    pop.style.top = Math.round(r.bottom + 4) + 'px';
    pop.hidden = false;
  }
  function closePopover() {
    const pop = $('popover');
    if (pop) pop.hidden = true;
    popAnchor = null; popRows = null;
  }
  function toggleHelp(button, rows) {
    openPopover(button, rows);
  }
  doc.addEventListener('click', ev => {
    const pop = $('popover');
    if (pop && !pop.hidden && !(ev.target && ev.target.classList && ev.target.classList.contains('q')) && !pop.contains(ev.target)) closePopover();
    // A click anywhere else closes the SETTINGS popover (its own button toggles it).
    const set = $('settings'), btn = $('btn-settings');
    if (game.ui.settingsOpen && set && !set.contains(ev.target) && !(btn && btn.contains(ev.target))) actions.ui({do: 'settings', on: false});
  });
  let drawerShows = ''; // the textState it was built in (never frozen empty)
  function drawDrawer() {
    const d = $('drawer');
    if (!d) return;
    d.hidden = !game.ui.drawer;
    doc.body.classList.toggle('q-on', !d.hidden); // the "?" marks with it
    if (d.hidden) return;
    const T = loadText();
    if (drawerShows === textState) return;
    drawerShows = textState;
    d.replaceChildren();
    d.appendChild(doc.createElement('h2')).textContent = 'What GRIDWATCH simplifies, and why';
    if (!T) d.appendChild(doc.createElement('p')).textContent = textState === 'failed' ? 'The texts could not be loaded: reload the page to try again.' : 'Loading…';
    else for (const e of T.abstractions) entryNodes(d.appendChild(doc.createElement('article')), e, 'h4');
  }

  // Q-46: the alarm panel, mounted on its first open; panel.focus() once, on the frame it first shows.
  let panel = null, panelState = '', panelShown = false;
  function drawAlarmPanel(v) {
    const box = $('alarm-panel');
    if (!box) return;
    if (box.hidden === v.alarmsOpen) box.hidden = !v.alarmsOpen;
    if (!v.alarmsOpen) { panelShown = false; return; }
    if (!panelState) {
      panelState = 'loading';
      box.textContent = 'Loading…';
      lazy(o.alarmPanel, () => import('./alarmpanel.js'), m => { box.replaceChildren(); panel = m.createAlarmPanel(doc, box, actions); },
        e => { box.textContent = 'The alarm panel could not be loaded. Esc or W closes it.'; err('alarm panel', e); });
    }
    if (!panel) return;
    try { panel.update(v); if (!panelShown) { panelShown = true; panel.focus(); } } catch (e) { err('alarm panel', e); }
  }

  // ---------------------------------------------------------------- overlays
  /** kind 'info': an answer to a press that did nothing (blue, Q-41); else a refusal (red). */
  function showToast(text, kind) {
    const t = $('toast');
    if (!t) return;
    t.className = kind === 'info' ? 'info' : '';
    t.textContent = text;
    t.hidden = false;
    toastUntil = now() + 3000;
  }
  const setText = (id, s) => { const el = $(id); if (el && el.textContent !== s) el.textContent = s; };

  // The standing objective (Q-18): one line, with the level as a glyph and a word. While the
  // player is hovering, focusing or has lifted a START / STOP guard, the line says what that press
  // would do instead (C-10, vm.consider), under the word '? IF PRESSED' (ARMED: amber unless critical).
  function drawObjective(v) {
    const box = $('objective');
    if (!box) return;
    const o = v.objective, c = v.consider || null;
    const paused = v.mode.mode === 'PAUSE' && v.phase === 'play' && !v.obs.over;
    box.hidden = (!o && !c) || v.phase !== 'play' || v.obs.over || !!v.respond;
    if (box.hidden) return;
    const armed = !!c && v.armed === c.target;
    const cls = c ? (armed && c.level !== 'crit' ? 'act' : c.level) + ' consider' : o.level;
    if (box.className !== cls) box.className = cls;
    setText('objective-level', !c ? objectiveWord(o) : armed ? ARMED_WORD : c.level === 'ok' ? UNDER_WAY_WORD : CONSIDER_WORD);
    setText('objective-text', c ? (armed ? 'Press again to confirm. ' : '') + c.text
      : (o.text || '') + (paused ? '  ·  Clock held: press Space to run (you can act while paused).' : ''));
  }

  function drawHeader(v) {
    const m = v.mode;
    setText('clock-text', m.mode === 'WATCH' ? clockText(v.obs.s) : v.obs.clock.text);
    setText('rate-text', badgeText(m));
    const badge = $('rate-badge');
    if (badge) badge.className = m.mode;
    const sc = v.obs.score;
    setText('chip-lights-v', lightsText(sc));
    setText('chip-cost-v', centsText(sc));
    setText('chip-co2-v', co2Text(sc));
    setText('btn-pause', m.mode === 'PAUSE' || m.mode === 'HIDDEN' || m.mode === 'ALARMS' ? 'PLAY' : 'PAUSE');
    const bp = $('btn-pause');
    if (bp) bp.disabled = v.phase !== 'play' || v.obs.over;
  }

  function drawWatch(v) {
    const w = v.watch, box = $('watch-vignette');
    doc.body.classList.toggle('watch', !!w);
    if (!box) return;
    box.hidden = !w;
    if (!w) return;
    setText('stopwatch', w.stopwatch);
    setText('beat-caption', w.version === 'full' ? w.caption : WATCH_WORDS[w.beat]);
    const steps = $('beat-steps');
    if (steps) {
      steps.replaceChildren();
      BEATS.forEach((b, i) => {
        if (i) steps.appendChild(doc.createTextNode(' → '));
        const el = doc.createElement(i === w.beatIndex ? 'b' : 'span');
        el.textContent = WATCH_WORDS[b];
        steps.appendChild(el);
      });
    }
  }

  let respondShown = -1;
  function drawRespond(v) {
    const card = $('respond-card');
    if (!card) return;
    card.hidden = !v.respond;
    if (!v.respond || respondShown === v.respond.n) { if (!v.respond) respondShown = -1; return; }
    respondShown = v.respond.n;
    card.replaceChildren();
    v.respond.lines.forEach((line, i) => {
      const p = doc.createElement('p');
      p.textContent = line;
      if (i === v.respond.lines.length - 1) p.className = 'hint';
      card.appendChild(p);
    });
  }

  let endShown = false;
  function drawEnd(v) {
    const card = $('end-card');
    if (!card) return;
    if (!v.end) { card.hidden = true; endShown = false; return; }
    if (endShown) return;
    endShown = true;
    card.hidden = false;
    card.replaceChildren();
    const h = doc.createElement('h2');
    h.textContent = v.end.black ? 'The grid went black.' : 'Day over: 04:00.';
    card.appendChild(h);
    const sc = v.end.score;
    for (const line of ['LIGHTS ON  ' + lightsText(sc) + ' · ' + sc.lightsMWh.toFixed(1) + ' MWh dark',
      'COST       ' + centsText(sc) + ' c/kWh', 'CO₂        ' + co2Text(sc) + ' t/MWh',
      'Seed ' + v.end.seed + ' · ' + v.end.v + ' · ' + v.end.inputs + ' inputs · hash 0x' + (v.end.hash >>> 0).toString(16).padStart(8, '0')]) {
      const p = doc.createElement('p');
      p.className = 'score';
      p.textContent = line;
      card.appendChild(p);
    }
    const row = doc.createElement('p');
    const save = doc.createElement('button');
    save.id = 'btn-save-log';
    save.textContent = 'DOWNLOAD REPLAY LOG';
    save.addEventListener('click', () => download('gridwatch-' + SIM_VERSION + '-seed-' + game.seed + '.json',
      JSON.stringify(G.gameLog(game), null, 1)));
    const again = doc.createElement('button');
    again.id = 'btn-again';
    again.textContent = 'PLAY THIS DAY AGAIN';
    again.addEventListener('click', () => { G.resetDay(game); endShown = false; card.hidden = true; briefingText(); });
    row.appendChild(save);
    row.appendChild(doc.createTextNode(' '));
    row.appendChild(again);
    card.appendChild(row);
  }

  function download(name, text) {
    try {
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
      a.download = name;
      doc.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      showToast('Saved to your downloads: ' + name, 'info');
    } catch (e) {
      showToast('Download failed: ' + (e && e.message ? e.message : e));
    }
  }

  function placeStack(v) {
    if (!mods.stack || !mods.stack.el) return;
    const ov = $('stack-overlay');
    if (!ov || v.stackExpanded === stackOut) return;
    stackOut = v.stackExpanded;
    if (stackOut) { ov.appendChild(mods.stack.el); ov.hidden = false; } else { slot.appendChild(mods.stack.el); ov.hidden = true; }
  }

  // K-23: #aria-live mirrors the mode, the frequency band, the N-1 word, new alarms and tray
  // warnings, one message per 2 real s (liveFrame above).
  function announce(v, nowMs) {
    const text = liveFrame(live, v, nowMs);
    if (text) setText('aria-live', text);
  }

  // ---------------------------------------------------------------- settings (K-22, §13.1, B-7)
  let setKey = '', setOpen = false;
  function drawSettings(st, open) {
    // Body classes, so CSS follows without reading the vm: rm, fxlow, crt (B-4).
    const key = (st.reducedMotion ? 'r' : '-') + (st.reducedEffects ? 'f' : '-') + (st.crt ? 'c' : '-');
    if (key !== setKey) {
      setKey = key;
      doc.body.classList.toggle('rm', st.reducedMotion);
      doc.body.classList.toggle('fxlow', st.reducedEffects);
      doc.body.classList.toggle('crt', st.crt);
    }
    for (const k of Object.keys(SET_RANGES)) {
      const el = $(SET_RANGES[k]), val = String(Math.round(st[k] * 100));
      if (el && String(el.value) !== val) el.value = val;
    }
    for (const k of Object.keys(SET_CHECKS)) {
      const el = $(SET_CHECKS[k]);
      if (el && el.checked !== st[k]) el.checked = st[k];
    }
    // Reduced effects has no CRT: the switch greys and its row says why (hover, click).
    const crt = $(SET_CHECKS.crt), row = crt && crt.parentElement;
    if (crt && crt.disabled !== st.reducedEffects) {
      crt.disabled = st.reducedEffects;
      if (row) { row.classList.toggle('off', st.reducedEffects); row.title = st.reducedEffects ? CRT_OFF : ''; }
    }
    const mute = $('btn-mute');
    if (mute) {
      setText('btn-mute', st.muted ? 'SOUND OFF' : 'SOUND ON');
      if (mute.getAttribute('aria-pressed') !== String(st.muted)) mute.setAttribute('aria-pressed', String(st.muted));
    }
    const pop = $('settings'), btn = $('btn-settings');
    if (pop && pop.hidden === open) pop.hidden = !open;
    if (open !== setOpen) {
      setOpen = open;
      if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('on', open); }
      // Keyboard: opening lands on the first slider; closing hands focus back to the button.
      if (open) focusEl(SET_RANGES.volume);
      else if (pop && btn && pop.contains(doc.activeElement)) focusEl('btn-settings');
    }
  }
  for (const k of Object.keys(SET_RANGES)) {
    const send = ev => actions.ui({do: 'set', key: k, value: Math.max(0, Math.min(1, Number(ev.target.value) / 100))});
    on(SET_RANGES[k], 'input', send);
    on(SET_RANGES[k], 'change', send);
  }
  for (const k of Object.keys(SET_CHECKS)) on(SET_CHECKS[k], 'change', ev => actions.ui({do: 'set', key: k, value: !!ev.target.checked}));
  const crtRow = $(SET_CHECKS.crt) && $(SET_CHECKS.crt).parentElement;
  if (crtRow) crtRow.addEventListener('click', () => { if ($(SET_CHECKS.crt).disabled) showToast(CRT_OFF, 'info'); });
  on('btn-settings', 'click', () => actions.ui({do: 'settings'}));
  drawSettings(G.settingsView(game), false);

  // ---------------------------------------------------------------- the frame (X-26: draw after the ticks)
  const drawMs = {};
  const timed = (name, f) => {
    const t = now();
    try { f(); } catch (e) { mods.errors.push(name + ': ' + (e && e.message ? e.message : e)); }
    drawMs[name] = now() - t;
  };

  function onFrame(dtS) {
    const t0 = now();
    for (const a of pollKeys(keys, t0)) run(a);
    const ticks = G.frame(game, dtS, now);
    const t1 = now();
    // Q-48: par, a slice a frame from TAKE THE DESK, in every mode (?perf: its own 'par' line)
    if (game.par && game.phase === 'play') timed('par', () => { if (!game.par.done) game.par.step(game.state.over ? PAR_STEP_OVER_TICKS : PAR_STEP_TICKS); });
    vm = G.buildVm(game, {nowMs: t1, dtS});
    if (mods.map) timed('map', () => mods.map.update(vm));
    if (mods.desk) timed('desk', () => mods.desk.update(vm));
    if (mods.stack) timed('stack', () => mods.stack.update(vm));
    timed('shell', () => {
      drawHeader(vm); drawObjective(vm); drawSettings(vm.settings, vm.settingsOpen); drawWatch(vm); drawRespond(vm); drawEnd(vm); placeStack(vm);
      drawAlarmPanel(vm);
      announce(vm, t1);
      const b = $('briefing-card');
      if (b) b.hidden = vm.phase !== 'briefing';
      const dr = $('drawer');
      if (dr && dr.hidden === vm.drawer) drawDrawer();
      const t = $('toast');
      if (t && !t.hidden && now() > toastUntil) t.hidden = true;
      if (t1 >= qNext) { placeQs(); qNext = t1 + 500; }
    });
    timed('audio', () => audio.update(vm));
    if (perf) {
      perfFrame(perf, {frameMs: now() - t0, simMs: t1 - t0, ticks, rate: vm.mode.rate, draw: drawMs});
      if (t1 - lastPerfDraw > 500) {
        lastPerfDraw = t1;
        const el = $('perf');
        if (el) { el.hidden = false; renderPerf(el, perf); }
      }
    }
    return ticks;
  }

  // ---------------------------------------------------------------- keys and gestures
  function run(a) {
    if (a.ui) actions.ui(a.ui);
    else if (a.input) actions.input(a.input);
    else if (a.redispatch) actions.redispatch();
  }

  // Q-47: Esc closes the top-most first: popover, SETTINGS, drawer, alarm panel, a desk note (W2).
  function closeTop() {
    const pop = $('popover'), u = game.ui, d = mods.desk;
    if (pop && !pop.hidden) closePopover();
    else if (u.settingsOpen || u.drawer || u.alarmsOpen) actions.ui(u.settingsOpen ? {do: 'settings', on: false} : u.drawer ? {do: 'drawer', on: false} : {do: 'alarms', on: false});
    else return !!(d && d.closeHelp && d.closeHelp());
    return true;
  }
  const mod = ev => ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev.target);
  // Capture phase (§30.3.6): an Esc that closed something stops there; with the alarm panel open, a
  // key pressed outside it first closes it as GO TO, before any control's own handler.
  const inPanel = t => { const p = $('alarm-panel'); return !!(p && t && p.contains(t)); };
  function escFirst(ev) {
    if (ev.key === 'Escape' && !ev.shiftKey && !mod(ev) && closeTop()) { ev.preventDefault(); ev.stopPropagation(); }
  }
  function panelFirst(ev) {
    if (game.ui.alarmsOpen && !mod(ev) && !inPanel(ev.target) && !PANEL_KEEPS.test(ev.key) && !(ev.key === 'M' && ev.shiftKey)) actions.ui({do: 'alarmsGoto', target: null});
  }
  doc.addEventListener('keydown', escFirst, true);
  doc.addEventListener('keydown', panelFirst, true);

  // The page's one key listener (§13.3; the order is app/keys.js bindKeys'): text fields and
  // consumed keys are left alone, then the desk, the stack, the map, then the fallback map.
  const inSettings = t => { const s = $('settings'); return !!(s && t && s.contains(t)); };
  const unbindKeys = bindKeys(doc, keys, () => vm, a => {
    if (game.phase === 'briefing' && a.ui && a.ui.do === 'dismissRespond') return;
    run(a);
  }, now, {
    // The popover's sliders and switches work natively: only Esc and `,` (close) are the game's there.
    own: ev => (inSettings(ev.target) && ev.key !== 'Escape' && ev.key !== ',') || (inPanel(ev.target) && PANEL_OWN.test(ev.key)),
    // Enter on the briefing card takes the desk (and nothing else: the key stops here).
    first: ev => { if (game.phase !== 'briefing' || ev.key !== 'Enter') return false; take(); return true; },
    chain: () => [mods.desk, mods.stack, mods.map],
    // A module that took a key may have moved the keyboard focus (the desk's 1-8): vm.focus follows (GO TO, if open).
    used: (m, ev) => {
      const ae = doc.activeElement, desk = $('desk');
      if (ev.type !== 'keyup' && ae && ae.id && ae !== doc.body && (ae.id !== game.ui.focus || game.ui.alarmsOpen) && desk && desk.contains(ae)) base.ui({do: 'focus', target: ae.id});
    },
    error: e => { mods.errors.push('key: ' + (e && e.message ? e.message : e)); },
  });
  const gesture = () => { if (!audio.started) audio.start(); };
  doc.addEventListener('pointerdown', gesture);
  doc.addEventListener('keydown', gesture);

  let stopRaf = null;
  if (o.raf !== false) stopRaf = startRaf(onFrame, hidden => { game.director.hidden = hidden; });
  if (mods.errors.length) showToast(mods.errors[0]);

  const handle = {
    game, actions, audio, mods, keys, perf, live, loadText, closeTop,
    frame: onFrame,
    vm: () => vm,
    unbind() { unbindKeys(); for (const f of [escFirst, panelFirst]) doc.removeEventListener('keydown', f, true); if (stopRaf) stopRaf(); },
  };
  // F-11: ?debug exposes the boot handle for stage C's shot and perf tools (nothing else may use it).
  if (query.has('debug')) globalThis.gridwatch = handle;
  return handle;
}

function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.getItem('gridwatch:v4:probe');
    return s;
  } catch {
    return null;
  }
}


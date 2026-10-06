// tests/lib/play.js: a FAST headless play driver for the real page (next.html booted through
// app/shell.js with every real module, in the stand-in DOM of tests/lib/dom.js). For tests and
// tools (tools/play.mjs is its command line). No product hooks: it drives the page the way
// tests/day.test.js does, and reads the game object the boot handle returns.
//
//   import {openGame} from './lib/play.js';
//   const p = openGame({seed: 20261007});      // briefing taken (AGC), Space pressed: CRUISE at 04:30
//   p.to('15:40');            // jump the sim to 15:40 without drawing frames, then draw one frame
//   p.until('trip');          // jump to the tick the next trip begins, then draw one frame
//   p.real(5); p.look();      // five real seconds of frames (the watch), then what the player sees
//   p.click('guard-start-gta1'); p.key('Enter');
//   const s = p.press('guard-start-gta1');   // {before, during, after, diff}: three sampled looks
//
// WHY. One drawn frame costs ~3-5 ms in the stand-in DOM (the desk, map, Live Stack and shell
// all draw); at CRUISE a 60-fps frame is only 2 grid seconds, so frame-by-frame play to the
// afternoon is ~20,000 frames (1-2 minutes). The sim alone runs a grid hour in ~0.12 s.
//
// HOW A JUMP WORKS (to / until)
//   A jump plays VIRTUAL FRAMES: the page's own frame (1/60 real s) without the drawing. Each
//   runs app/loop.js runFrame on the page's pacer with the director's rates (so every tick is
//   G.tickOnce, the function the page's loop calls, and lands in the same frame as in play),
//   then the frame's model work: D.directorFrame, and G.buildVm itself whenever it would
//   recompute the objective line (every 30 grid s, a watch/RESPOND change, a guard under the
//   hand) or a unit is READY (the offers). Its other frames skip buildVm's view building and run
//   only the parts with memory: the annunciator (A.updateAlarms on A.alarmInputFromState, which
//   tests keep equal to buildVm's input) and the tray's ageing. Only the drawing is skipped
//   (map, desk, Live Stack, shell overlays, sound: ~95% of a frame's cost).
//   Per tick it runs cheap event checks and stops AT the tick an event begins (mid-frame).
//   Then ONE frame is drawn (handle.frame): the frame that held the stop tick, at the same page
//   time and running no tick; the pacer keeps what it owed (the rest of that frame's ticks, or
//   the re-charge of the tick that opened a watch), so the frames after go on as play would.
//   A jump never runs while the clock is held (PAUSE, the RESPOND card, the day over): it
//   returns {why: 'held:<MODE>'} at once, as play would not move either.
//
// REAL TIME. The page's own clock (`now`, which bootGame reads) is the driver's. frames()/real()
// advance it by their frame time; a jump advances it 1/60 s per virtual frame, i.e. by the real
// time a player at 60 fps would have watched at the director's rates (1 real s per 120 grid s at
// CRUISE, the watch's slow motion at its own). So line holds (4 real s), the annunciator's
// real-time timers (AGC LIMIT 5 real s, re-sound hold-offs), guard covers, notes and the toast
// age across a jump exactly as in play.
//
// EVENTS (until(what) and to()'s `stop` option; a name, an array of names or a function)
//   'trip'    a contingency began (state.conts grew): the watch's first tick
//   'card'    the RESPOND card opened (the watch ended; the clock holds)
//   'mode'    the director's mode changed (CRUISE -> WATCH / RESPOND / FOCUS, FAST ended, OVER...)
//   'notice'  a new tray card or a news item
//   'line'    the objective line's text changed (checked where buildVm recomputes it)
//   'ask'     a new ask to act (app/game.js newAsk)
//   'event'   trip, card, mode, notice and ask
//   function  ({state, game, tick}) => truthy, asked after every tick (keep it cheap); with
//             {vm: true} it is asked once a frame as ({state, game, vm}) (buildVm every frame).
//   Every jump has a grid-time guard: until() stops at opts.max ('HH:MM', '+90m', '+2h'; default
//   the day's end), to() at its target. to() stops at 'trip' and 'mode' unless opts.stop says.
//
// LIMITS: see tools/play.mjs --help (what differs from frame-by-frame play, and why).

import {readFileSync} from 'node:fs';
import {makeDocument, installGlobals} from './dom.js';
import {bootGame} from '../../app/shell.js';
import {createDesk} from '../../desk/desk.js';
import {createMap} from '../../render/map.js';
import {createLiveStack} from '../../render/livestack.js';
import * as system from '../../app/system.js';
import * as planview from '../../app/planview.js';
import * as G from '../../app/game.js';
import * as D from '../../app/director.js';
import {runFrame} from '../../app/loop.js';
import * as A from '../../app/alarms.js';
import * as T from '../../app/tray.js';
import {V} from '../../sim/params.js';
import {SCENARIOS} from '../../content/scenarios.js';

const NEXT = readFileSync(new URL('../../next.html', import.meta.url), 'utf8');
const TPS = V.TICKS_PER_S, TICK_S = 1 / TPS, DAY_S = V.DAY_S;

/** The page's frame time (s): frames(), real() and the virtual frames of a jump. */
export const FRAME_DT = 1 / 60;
/** opts.line 'near': the objective line is computed only over this many grid s before the target. */
export const NEAR_S = 1200;
/** The event names until() understands ('event' is all but 'line'). */
export const EVENTS = Object.freeze(['trip', 'card', 'mode', 'notice', 'line', 'ask']);
const EVENT_SET = ['trip', 'card', 'mode', 'notice', 'ask'];

const stationOf = id => { const m = V.MACHINES.find(x => x.id === id); return m ? m.station : ''; };
const pad = n => String(n).padStart(2, '0');

/** Grid seconds (0 = 04:00) -> 'HH:MM:SS'. */
export function clockOfS(s) {
  const sod = (Math.round(V.DAY_START_H * 3600) + Math.floor(s)) % DAY_S;
  return pad(Math.floor(sod / 3600)) + ':' + pad(Math.floor(sod / 60) % 60) + ':' + pad(sod % 60);
}

/**
 * A grid time -> grid seconds (0 = 04:00): 'HH:MM' or 'HH:MM:SS' (times before the player's
 * 04:30 mean the next morning, so '04:00' is the day's end), a number of grid seconds, or
 * '+90m' / '+2h' / '+30s' relative to `fromS`.
 */
export function parseTime(x, fromS = 0) {
  if (typeof x === 'number') return x;
  const s = String(x).trim();
  const rel = /^\+(\d+(?:\.\d+)?)([hms])$/.exec(s);
  if (rel) return fromS + Number(rel[1]) * {h: 3600, m: 60, s: 1}[rel[2]];
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) throw new Error('play: bad time ' + x + " (want 'HH:MM', 'HH:MM:SS', '+90m', '+2h' or grid seconds)");
  let t = ((Number(m[1]) - V.DAY_START_H + 24) % 24) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
  if (t < V.PLAYER_START_S) t += DAY_S;
  return t;
}

// ------------------------------------------------------------------ reading the page

const CONTROL_ROLES = new Set(['slider', 'tab', 'radio', 'switch', 'option', 'button', 'checkbox']);
const isHidden = e => { for (let n = e; n && n.tagName; n = n.parent) if (n.hidden) return true; return false; };
const squash = s => String(s).replace(/\s+/g, ' ').trim();

// Visible text under `e`, element children separated by a space (the stub's textContent runs
// them together); `skip(el)` leaves a subtree out.
function textOf(e, skip) {
  if (!e || isHidden(e)) return '';
  const out = [];
  const walk = n => {
    if (n.tagName) {
      if (n.hidden || (skip && skip(n))) return;
      out.push(' ');
      if (!n.children.length) { if (n.own) out.push(n.own); } else for (const c of n.children) walk(c);
      out.push(' ');
    } else out.push(n.textContent);
  };
  walk(e);
  return squash(out.join(''));
}

function isControl(e) {
  if (e.tagName === 'BUTTON' || e.tagName === 'INPUT' || e.tagName === 'SELECT') return true;
  const r = e.getAttribute('role');
  return !!r && CONTROL_ROLES.has(r);
}

function controlOf(doc, e) {
  const label = squash(e.tagName === 'INPUT' ? (e.type === 'checkbox' ? '' : e.value) : textOf(e)) || squash(e.getAttribute('aria-label') || e.title || '');
  const p = e.getAttribute('aria-pressed'), c = e.getAttribute('aria-checked'), sel = e.getAttribute('aria-selected');
  const st = [];
  if (e.disabled) st.push('disabled');
  if (p === 'true') st.push('pressed');
  if (c === 'true' || (e.tagName === 'INPUT' && e.type === 'checkbox' && e.checked)) st.push('on');
  if (sel === 'true') st.push('selected');
  if (e.classList.contains('lifted')) st.push('ARMED');
  if (doc.activeElement === e) st.push('focus');
  let up = e.parent;
  while (up && up.tagName && !up.id) up = up.parent;
  const id = e.id || (e.dataset.anchor ? 'q:' + e.dataset.anchor : up && up.id ? up.id + '>' + e.tagName.toLowerCase() : '');
  const o = {id, label, state: st};
  if (e.getAttribute('role') === 'slider') o.value = e.getAttribute('aria-valuenow');
  o.el = e;
  return o;
}

/** Every visible control on the page (buttons, inputs, ARIA sliders/tabs/switches...). */
function controlsOf(doc) {
  const qOn = doc.body.classList.contains('q-on'), qLayer = doc.getElementById('q-layer');
  const out = [];
  for (const e of doc.body.walk()) {
    if (!isControl(e) || isHidden(e)) continue;
    if (!qOn && qLayer && qLayer.contains(e)) continue; // CSS hides the "?" layer without the drawer
    out.push(controlOf(doc, e));
  }
  return out;
}

/**
 * The lines of look() `now` that are not in `prev`; the CTRL lines are compared control by control
 * (one CTRL line of the controls that are new or changed), so one changed label does not repeat
 * its whole row.
 */
export function diffLooks(prev, now) {
  const items = t => String(t).split('\n').filter(l => l.startsWith('CTRL ')).flatMap(l => l.slice(5).split(' · '));
  const was = new Set(String(prev).split('\n')), wasC = new Set(items(prev));
  const out = String(now).split('\n').filter(l => !l.startsWith('CTRL ') && !was.has(l));
  const c = items(now).filter(x => !wasC.has(x));
  if (c.length) out.push('CTRL ' + c.join(' · '));
  return out.join('\n');
}

const fmtControl = c => (c.id || '?') + ' "' + c.label + '"' + (c.value !== undefined && c.value !== null ? '=' + c.value : '') +
  (c.state.length ? ' [' + c.state.join(',') + ']' : '');

// ------------------------------------------------------------------ the driver

/**
 * Boot next.html headless and return the driver.
 * @param {{seed?:number, scenario?:string|object|function, commit?:'player'|'system', agc?:boolean, take?:boolean,
 *   run?:boolean, storage?:object|null, startPaused?:boolean}} [o]
 *   seed (default 20261007); scenario: a name in content/scenarios.js, a scenario, or a function
 *   of the seed (default: the page's scenarioForSeed); commit (default 'player', the page's);
 *   agc: AGC (true, default) or HAND at the briefing; take: press TAKE THE DESK (default true);
 *   run: press Space after taking the desk so the clock runs (default true; the page opens
 *   held); storage: a localStorage stand-in (default null: a first-time player, full watch).
 */
export function openGame(o = {}) {
  const seed = o.seed === undefined ? 20261007 : Number(o.seed);
  const scenario = typeof o.scenario === 'string' ? SCENARIOS[o.scenario] : o.scenario === undefined ? G.scenarioForSeed : o.scenario;
  if (!scenario) throw new Error('play: unknown scenario ' + o.scenario + ' (' + Object.keys(SCENARIOS).join(', ') + ')');
  const doc = makeDocument(NEXT);
  let t = 1000;
  const restore = installGlobals({URL: Object.assign(Object.create(URL), {createObjectURL: () => 'blob:x', revokeObjectURL() {}}), Blob: class {}});
  let h;
  try {
    h = bootGame(doc, {createDesk, createMap, createLiveStack, system, planview, scenario, commit: o.commit || 'player',
      startPaused: o.startPaused === undefined ? true : o.startPaused, search: '?seed=' + seed, storage: o.storage === undefined ? null : o.storage,
      audioWin: {}, raf: false, now: () => t});
  } finally { restore(); }
  const game = h.game, $ = id => doc.getElementById(id);
  let hovered = null, lastLook = '';

  // ---------------------------------------------------------------- frames (real time)
  function frame(dtS = FRAME_DT) { t += dtS * 1000; h.frame(dtS); return api; }
  function frames(n, dtS = FRAME_DT) { for (let i = 0; i < n; i++) frame(dtS); return api; }
  function real(seconds, dtS = FRAME_DT) { return frames(Math.max(1, Math.round(seconds / dtS)), dtS); }

  // ---------------------------------------------------------------- input
  function find(x) {
    if (x && x.tagName) return x;
    const byId = $(x);
    if (byId) return byId;
    const cs = controlsOf(doc), want = squash(x).toLowerCase();
    const exact = cs.filter(c => c.label.toLowerCase() === want);
    const hits = exact.length ? exact : cs.filter(c => c.label.toLowerCase().includes(want));
    if (hits.length === 1) return hits[0].el;
    if (!hits.length) throw new Error('play: no element or visible control "' + x + '"');
    throw new Error('play: "' + x + '" matches ' + hits.length + ' controls: ' + hits.map(fmtControl).join(' | '));
  }
  function hover(x) {
    const e = x === null ? null : find(x);
    if (hovered && hovered !== e) { hovered.dispatch('pointerleave'); hovered.dispatch('pointerout'); }
    if (e && hovered !== e) { e.dispatch('pointerover'); e.dispatch('pointerenter'); }
    hovered = e;
    return api;
  }
  /** A mouse click: the pointer moves onto it (and stays there), down, focus, up, click; then one frame. */
  function click(x, opts = {}) {
    const e = find(x);
    if (isHidden(e)) throw new Error('play: "' + x + '" is hidden');
    hover(e);
    const at = opts.at || {};
    e.dispatch('pointerdown', at);
    if (e.focus && (e.tagName === 'BUTTON' || e.tagName === 'INPUT')) e.focus();
    e.dispatch('pointerup', at);
    e.click();
    if (opts.frame !== false) frame();
    return api;
  }
  /** A key press (keydown + keyup to the focused element, bubbling to the document); then one frame. */
  function key(k, extra = {}, opts = {}) {
    doc.dispatch('keydown', Object.assign({key: k}, extra));
    doc.dispatch('keyup', Object.assign({key: k}, extra));
    if (opts.frame !== false) frame();
    return api;
  }
  const keyDown = (k, extra = {}) => { doc.dispatch('keydown', Object.assign({key: k}, extra)); return api; };
  const keyUp = (k, extra = {}) => { doc.dispatch('keyup', Object.assign({key: k}, extra)); return api; };
  /** Hold a key for `seconds` of real frames (D, E, F), then release it and draw one frame. */
  function hold(k, seconds) { keyDown(k); real(seconds); keyUp(k); return frame(); }
  /** Pointer events at page coordinates on an element (map / Live Stack canvases): {type, x, y}. */
  function pointer(x, type, cx = 0, cy = 0, extra = {}) {
    find(x).dispatch(type, Object.assign({clientX: cx, clientY: cy}, extra));
    return api;
  }
  /** A sim input straight through the page's actions (bypasses the desk; refusals toast). */
  function send(x) { const r = h.actions.input(x); frame(); return r; }

  // ---------------------------------------------------------------- sampled presses (SPEC Q-40)
  // The owner's rule for headless play: a frame before a press, the press frame, a frame after.
  // A day asks for ~16-25 decisions (D-10), so a whole played day is a few hundred drawn frames.
  /**
   * Click a control and sample what the player sees: before, during (the press frame) and after
   * `opts.after` real seconds (default 0.5: long enough for notes, covers and the line to react).
   * @returns {{before:string, during:string, after:string, diff:string}} diff = before -> after
   */
  function press(x, opts = {}) { return sampled(() => click(x, opts), opts); }
  /** pressKey('s'), pressKey('Enter'), pressKey('a', {shiftKey: true}): a key, sampled as press() is. */
  function pressKey(k, extra = {}, opts = {}) { return sampled(() => key(k, extra), opts); }
  function sampled(act, opts) {
    const before = look(opts.look);
    act();
    const during = look(opts.look);
    real(opts.after === undefined ? 0.5 : opts.after);
    const after = look(opts.look);
    return {before, during, after, diff: diffLooks(before, after)};
  }

  // ---------------------------------------------------------------- the jump engine
  const rateNow = () => D.rateOf(game.director, game.state);
  const modeNow = () => D.modeOf(game.director, game.state).mode;
  const FRAME_MS = FRAME_DT * 1000;

  function saveSeen() {
    try { if (game.storage) game.storage.setItem(G.SEEN_KEY, JSON.stringify(game.director.seen)); } catch { /* optional (C-8) */ }
    game.director.seenDirty = false;
  }
  // buildVm recomputes the objective line this frame (its own test, app/game.js), or a unit is
  // READY (the offers): then the virtual frame runs buildVm itself.
  function vmDue(lineFrom) {
    const s = game.state;
    if (s.units.some(u => u.mode === 'ready')) return true;
    if (s.tick < lineFrom) return false;
    if (game.phase !== 'play' || game.commit !== 'player' || !game.planview) return false;
    if (game.considerDirty) return true;
    const sec = Math.floor(s.tick / TPS);
    if (sec - game.objectiveS >= G.OBJECTIVE_EVERY_S || sec < game.objectiveS) return true;
    const m = modeNow();
    return m !== game.objectiveMode && /WATCH|RESPOND|OVER/.test(m + game.objectiveMode);
  }
  // The rest of buildVm's per-frame work that has memory: the annunciator (on
  // alarmInputFromState, which tests keep equal to alarmInput(observe)), the tray's ageing.
  function lightFrame() {
    const s = game.state, nowMs = t;
    const realDtS = game.lastFrameMs < 0 ? 0 : Math.max(0, (nowMs - game.lastFrameMs) / 1000);
    game.lastFrameMs = nowMs;
    if (game.phase === 'play') {
      const r = A.updateAlarms(game.alarms, A.alarmInputFromState(s), {nowMs, realDtS, stationOf});
      if (r.newAlarm) D.endFast(game.director);
    }
    T.trayFrame(game.tray, Math.floor(s.tick / TPS));
    game.cues = []; // the frame's sounds: no audio here
  }

  function parseStop(what) {
    const list = what === undefined || what === null ? [] : Array.isArray(what) ? what : [what];
    const set = new Set(), fns = [];
    for (const w of list) {
      if (typeof w === 'function') { fns.push(w); continue; }
      if (w === 'event') { for (const e of EVENT_SET) set.add(e); continue; }
      if (!EVENTS.includes(w)) throw new Error('play: unknown event ' + w + ' (' + EVENTS.join(', ') + ', event)');
      set.add(w);
    }
    return {set, fns};
  }

  /**
   * The engine behind to() and until(): virtual frames of the page (app/loop.js runFrame on the
   * page's pacer, then the frame's model work) without drawing, stopping at the tick `stopOn`
   * names or at toS; then one drawn frame. Returns {why, at, ticks, ms}: why = 'target' | 'over' |
   * 'held:<MODE>' | an event name | 'pred'.
   */
  function jump(toS, stopOn, o = {}) {
    const t0 = performance.now(), state = game.state, tick0 = state.tick, d = game.director, p = game.pacer;
    const {set, fns} = parseStop(stopOn);
    const toTick = Math.min(Math.round(toS * TPS), V.DAY_TICKS);
    let why = '', saved = null, midFrame = false;
    // line 'near': the objective line only over the last NEAR_S before the target (faster, see LINE)
    const lineFrom = o.line === 'near' ? toTick - NEAR_S * TPS : 0;
    const stop = w => finish(w, t0, tick0, midFrame, saved);
    if (game.phase !== 'play') return stop('held:BRIEFING');
    if (state.over) return stop('over');
    let mode = modeNow(), rate = rateNow();
    if (rate === 0) return stop('held:' + mode);
    if (state.tick >= toTick) return stop('target');
    let conts = state.conts.length, cards = game.tray.nextId, news = state.news.length, line = game.objective;
    // After every tick: the cheap event checks.
    const tick = () => {
      G.tickOnce(game);
      if (state.conts.length !== conts) { conts = state.conts.length; if (set.has('trip')) why = why || 'trip'; }
      if (game.tray.nextId !== cards || state.news.length !== news) {
        cards = game.tray.nextId; news = state.news.length;
        if (set.has('notice')) why = why || 'notice';
      }
      const r = D.rateOf(d, state);
      if (r !== rate) {
        rate = r;
        const m = modeNow();
        if (m !== mode) {
          mode = m;
          if (m === 'RESPOND-CARD' && set.has('card')) why = why || 'card';
          else if (set.has('mode')) why = why || 'mode';
        }
      }
      if (!why && fns.length && !o.vm) for (const f of fns) if (f({state, game, tick: state.tick})) { why = 'pred'; break; }
      if (!why && state.tick >= toTick) why = 'target';
    };
    // done() is asked before every tick: it stops the frame at the event, keeping what the pacer owes.
    const hooks = {rate: () => D.rateOf(d, state), rateLast: () => D.rateOfLastTick(d, state), tick,
      done: () => { if (why || state.over) { saved = p.acc; return true; } return false; }};
    for (;;) {
      if (rateNow() === 0) { why = why || (state.over ? 'over' : 'held:' + modeNow()); break; }
      t += FRAME_MS;
      saved = null;
      runFrame(p, FRAME_DT, hooks);
      if (why || state.over) { midFrame = true; why = why || 'over'; break; }   // the drawn frame is this frame
      if (D.directorFrame(d, state)) saveSeen();
      if (o.vm || vmDue(lineFrom)) {
        const vm = G.buildVm(game, {nowMs: t, dtS: FRAME_DT});
        if (set.has('ask') && G.newAsk(line, game.objective)) why = 'ask';
        else if (set.has('line') && (game.objective && game.objective.text) !== (line && line.text)) why = 'line';
        line = game.objective;
        if (!why && o.vm) for (const f of fns) if (f({state, game, vm})) { why = 'pred'; break; }
      } else lightFrame();
      if (why) break;
    }
    return stop(why);
  }

  // The one drawn frame after a jump: it shows the state at the stop tick, as the frame that held
  // that tick did in play. A stop inside a virtual frame: that frame is drawn now (same page time,
  // no tick), and the pacer then owes what it owed at the stop (the rest of that frame's ticks, or
  // the re-charge of a tick that opened a watch). Otherwise a frame that runs no tick.
  function finish(why, t0, tick0, midFrame, saved) {
    const p = game.pacer;
    const keep = saved === null ? p.acc : saved;
    if (midFrame) t -= FRAME_MS;
    const r = rateNow();
    if (r > 0) {
      if (r !== p.rate) { p.acc = p.rate > 0 ? keep * r / p.rate : 0; p.rate = r; } else p.acc = keep;
      const k = p.acc;
      p.acc = 1e-9 - r * FRAME_DT / TICK_S;
      frame();
      p.acc = k;
    } else frame();
    return {why, at: clockOfS(game.state.tick / TPS), ticks: game.state.tick - tick0, ms: Math.round(performance.now() - t0)};
  }

  /**
   * Jump to a grid time ('HH:MM', '+30m', grid seconds) without drawing, then draw one frame.
   * opts.stop: the events that stop it early (default ['trip', 'mode']; [] for none).
   */
  function to(when, opts = {}) {
    const s = parseTime(when, game.state.tick / TPS);
    return jump(s, opts.stop === undefined ? ['trip', 'mode'] : opts.stop, opts);
  }
  /**
   * Jump until an event (see EVENTS; default 'event'), at most to opts.max (default: the day's
   * end), then draw one frame. opts.vm: function predicates get ({state, game, vm}) once a frame.
   */
  function until(what = 'event', opts = {}) {
    const s0 = game.state.tick / TPS;
    const max = opts.max === undefined ? DAY_S : parseTime(opts.max, s0);
    return jump(max, what, opts);
  }

  // ---------------------------------------------------------------- reading
  /**
   * What the player sees, one line per thing: CLOCK (and mode, chips), BRIEFING, LINE (the objective),
   * WATCH, CARD, END, TOAST, BALANCE, DIAL, N-1, NOTE (desk notes), TRAY (the cards), then CTRL lines:
   * every visible control as id "label"=value [disabled,pressed,on,selected,ARMED,focus].
   * opts.controls: false leaves the CTRL lines out; opts.aria: true adds the screen-reader live region.
   */
  function look(opts = {}) {
    const vm = h.vm(), L = [];
    const hid = id => { const e = $(id); return !e || isHidden(e); };
    const tx = (id, skip) => textOf($(id), skip);
    const obs = vm ? vm.obs : null;
    const ck = tx('clock-text');
    L.push('CLOCK ' + ck + (obs && /^\d\d:\d\d$/.test(ck) ? ':' + pad(Math.floor(obs.s) % 60) : '') + ' | ' + tx('rate-text') +
      ' | ' + ['chip-lights', 'chip-cost', 'chip-co2'].map(id => tx(id)).join(' | '));
    if (!hid('briefing-card')) L.push('BRIEFING ' + tx('briefing-day') + ' ' + tx('briefing-watch'));
    if (!hid('objective')) L.push('LINE ' + tx('objective-level') + ' ' + tx('objective-text'));
    if (!hid('watch-vignette')) L.push('WATCH ' + tx('stopwatch') + ' | ' + tx('beat-caption') + ' | ' + tx('beat-steps'));
    if (!hid('respond-card')) L.push('CARD ' + tx('respond-card'));
    if (!hid('end-card')) L.push('END ' + textOf($('end-card'), e => e.tagName === 'BUTTON'));
    if (!hid('toast')) L.push('TOAST ' + tx('toast'));
    if (!hid('settings')) L.push('SETTINGS open');
    if (!hid('drawer')) L.push('DRAWER open');
    if (!hid('popover')) L.push('POPOVER ' + tx('popover').slice(0, 160));
    const noBtn = e => e.tagName === 'BUTTON' || e.classList.contains('dk-note');
    const bar = $('bar-imbalance');
    if (bar) L.push('BALANCE ' + textOf(bar, e => noBtn(e) || e.classList.contains('dk-imb-track') || e.classList.contains('dk-title')));
    if ($('dial-freq')) L.push('DIAL ' + textOf($('dial-freq'), noBtn));
    if ($('gauge-n1')) L.push('N-1 ' + textOf($('gauge-n1'), noBtn));
    const notes = [...doc.querySelectorAll('.dk-note')].filter(e => !isHidden(e) && squash(e.textContent));
    // (the colour too: a plain .dk-note is red, a refusal; .info is blue. The owner's rule: help is never red)
    for (const n of notes) L.push('NOTE ' + (n.classList.contains('info') ? 'blue ' : 'RED ') + (n.parent && (n.parent.id || n.parent.dataset.unit || n.parent.className) || '') + ': ' + squash(n.textContent));
    const tray = $('tray');
    if (tray) {
      const cs = tray.querySelector('.dk-cards');
      const cards = cs ? cs.children.filter(c => c.tagName && !isHidden(c)).map(c => textOf(c)) : [];
      L.push('TRAY ' + (cards.length ? cards.join(' || ') : '(empty)'));
    }
    const live = $('aria-live');
    if (opts.aria && live && squash(live.textContent)) L.push('ARIA ' + squash(live.textContent));
    const cs = opts.controls === false ? [] : controlsOf(doc).map(fmtControl);
    for (let i = 0, line = ''; i <= cs.length; i++) {
      if (i === cs.length || (line && line.length + cs[i].length > 150)) { if (line) L.push('CTRL ' + line); line = ''; }
      if (i < cs.length) line += (line ? ' · ' : '') + cs[i];
    }
    if (h.mods.errors.length) L.push('ERRORS ' + h.mods.errors.join(' | '));
    if (vm && vm.objectiveError) L.push('OBJECTIVE-ERROR ' + vm.objectiveError);
    return (lastLook = L.join('\n'));
  }
  /** What changed in look() since the previous look() (or since `prev`): see diffLooks. */
  function lookDiff(prev = lastLook, opts) { return diffLooks(prev, look(opts)); }
  /** Every visible, enabled control: [{id, label, state}]. */
  function buttons() {
    return controlsOf(doc).filter(c => !c.state.includes('disabled')).map(c => ({id: c.id, label: c.label, state: c.state, value: c.value}));
  }

  /**
   * look() across a span: one at `from`, every `every` grid seconds/time ('30m') to `to`, and at
   * every event that stops a jump on the way (trip, card, mode change, notice by default). At a
   * RESPOND card it presses Enter after looking (as a player must, to go on).
   * @returns {Array<{at, why, look, diff, ms}>}
   */
  function timeline(o = {}) {
    const every = typeof o.every === 'string' ? parseTime('+' + o.every.replace(/^\+/, ''), 0) : o.every || 1800;
    const out = [];
    const rec = (why, ms) => {
      const prev = out.length ? out[out.length - 1].look : '';
      const l = look(o.look);
      out.push({at: clockOfS(game.state.tick / TPS), why, look: l, diff: diffLooks(prev, l), ms});
    };
    if (o.from !== undefined) { const r = to(o.from, {line: o.line}); rec(r.why === 'target' ? 'from' : r.why, r.ms); } else rec('from', 0);
    const end = o.to === undefined ? DAY_S : parseTime(o.to, game.state.tick / TPS);
    const stop = o.stop || ['trip', 'card', 'mode', 'notice'];
    let next = (Math.floor(game.state.tick / TPS / every) + 1) * every;
    let guard = 0;
    while (game.state.tick / TPS < end && !game.state.over && guard++ < 10000) {
      const r = jump(Math.min(next, end), stop, {line: o.line});
      if (r.why === 'held:RESPOND-CARD' || r.why === 'card') { rec('card', r.ms); key('Enter'); continue; }
      if (r.why.startsWith('held:')) { rec(r.why, r.ms); break; }
      if (r.why === 'trip') {
        rec('trip', r.ms);
        // the watch, headless (real time at the watch's rates), to the card
        const c = jump(end, ['card', 'mode'], {line: o.line});
        if (c.why === 'card' || c.why === 'held:RESPOND-CARD') { rec('card', c.ms); key('Enter'); } else rec(c.why, c.ms);
        continue;
      }
      if (r.why === 'mode' || r.why === 'notice') { rec(r.why + ':' + modeNow(), r.ms); continue; }
      rec(r.why === 'target' ? 'every' : r.why, r.ms);
      if (r.why === 'over') break;
      if (game.state.tick / TPS >= next) next += every;
    }
    return out;
  }

  const api = {
    doc, h, game, $,
    get now() { return t; },
    frame, frames, real, to, until, look, lookDiff, buttons, timeline,
    click, hover, key, keyDown, keyUp, hold, pointer, send, press, pressKey,
    vm: () => h.vm(),
    clock: () => clockOfS(game.state.tick / TPS),
    mode: modeNow,
  };

  if (o.take !== false) {
    $(o.agc === false ? 'btn-hand' : 'btn-agc').click();
    $('btn-take').click();
    frame();
    if (o.run !== false) key(' ');
  }
  return api;
}

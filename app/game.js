// app/game.js: one game session (next.html), DOM-free. It mirrors app/session.js (which the
// bench keeps) for the game: the sim state, the director (game modes), the loop's pacer, the
// system operator (app/system.js: the 04:30 pre-dispatch, the dark-city reflow, RE-DISPATCH),
// the annunciator, the tray, the recorder (watch traces), history rings for the Live Stack's
// past, the TRIP / RESTORE PREVIEW caches, the view model (desk/README.md §5), the input log
// and its replay file (F-6). boot.js / shell.js wire it to the page; tests drive it headless.
//
// Everything that changes the grid is a sim input: sendInput (the desk, the stack, the map,
// keys) and the system's inputs, applied between ticks or through step(), so replay() of the
// log reproduces the day (F-6). Presentation (focus, ACK, pause, FAST, skip...) goes through
// ui() and never touches the sim. Nothing here draws.
//
// Modules the game uses but other stage B agents own are passed in, so this file imports only
// what exists on its own branch: `system` (app/system.js: createSystem, systemInputs,
// redispatch) and `planview` (app/planview.js: glowSet). Without them the game still plays: no
// automatic plan (a no-input day then needs the player), and a simple fallback glow set.

import {V} from '../sim/params.js';
import {createState, step, observe, applyInput, hashState, replay, SIM_VERSION} from '../sim/step.js';
import * as physics from '../sim/physics.js';
import * as grid from '../sim/grid.js';
import * as fleet from '../sim/fleet.js';
import {CLASSIC} from '../content/scenarios.js';
import {createPacer, runFrame} from './loop.js';
import * as D from './director.js';
import {createRecorder, onTick, startTrace, traceOf, needleF, secondsWindow} from './record.js';
import * as A from './alarms.js';
import * as T from './tray.js';
import * as W from './watch.js';
// A namespace import: cuesOfRecord (Phase 1b, desk/README.md §13.2) is used when the audio
// model has it; until then the 1a cueOfRecord.
import * as AM from '../audio/model.js';

const TPS = V.TICKS_PER_S;
const EMPTY = Object.freeze([]);
/** vm.cues: at most this many in one frame (a runaway emitter must not flood the audio). */
export const MAX_CUES = 64;
/** vm.hist.freq: this many grid seconds of per-second frequency (3 min). */
export const HIST_FREQ_S = 180;
/** vm.hist station / demand columns: 5-min columns over the last 30 grid-min (L-1's past). */
export const HIST_COL_S = V.FC_STEP_S, HIST_COLS = 6;
/** K-12 offers: at most this many a day (K-12 accept). */
export const MAX_OFFERS = 3;
/** Storage keys (C-8: every access is wrapped; the game plays with storage blocked). */
export const SEEN_KEY = 'gridwatch:v4:seen', SETTINGS_KEY = 'gridwatch:v4:settings';

// ------------------------------------------------------------------ storage (C-8)

function readJson(storage, key) {
  try {
    const v = storage ? storage.getItem(key) : null;
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function writeJson(storage, key, value) {
  try {
    if (storage) storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ settings (K-22, desk/README.md §13.1)

/**
 * The user's choices, as stored under SETTINGS_KEY. reducedMotion: true | false | null (null:
 * follow the system's prefers-reduced-motion). crt: the B-4 scanline overlay (on by default).
 */
export const SETTINGS_DEFAULT = Object.freeze({volume: 0.8, hum: 1, fx: 1, alarms: 1, muted: false, reducedMotion: null,
  reducedEffects: false, crt: true});
const LEVEL_KEYS = ['volume', 'hum', 'fx', 'alarms'], BOOL_KEYS = ['muted', 'reducedEffects', 'crt'];

// A stored object, cleaned: unknown keys dropped, bad values replaced by the defaults.
function cleanSettings(raw) {
  const s = Object.assign({}, SETTINGS_DEFAULT), r = raw && typeof raw === 'object' ? raw : {};
  for (const k of LEVEL_KEYS) if (typeof r[k] === 'number' && r[k] >= 0 && r[k] <= 1) s[k] = r[k];
  for (const k of BOOL_KEYS) if (typeof r[k] === 'boolean') s[k] = r[k];
  if (r.reducedMotion === true || r.reducedMotion === false) s.reducedMotion = r.reducedMotion;
  return s;
}

/**
 * vm.settings (§13.1): the choices, resolved. reducedMotion: the stored choice, else the
 * system's; crt: false whenever reducedEffects.
 */
export function settingsView(game) {
  const s = game.settings;
  let sys = false;
  try { sys = typeof game.systemReducedMotion === 'function' ? !!game.systemReducedMotion() : !!game.systemReducedMotion; } catch { sys = false; }
  return {volume: s.volume, hum: s.hum, fx: s.fx, alarms: s.alarms, muted: s.muted,
    reducedMotion: s.reducedMotion === null ? sys : s.reducedMotion, reducedEffects: s.reducedEffects, crt: s.crt && !s.reducedEffects};
}

// actions.ui({do: 'set', key, value}): one choice, validated, then stored (C-8: storage is optional).
function setSetting(game, key, value) {
  const s = game.settings;
  if (LEVEL_KEYS.includes(key)) {
    if (!(typeof value === 'number' && value >= 0 && value <= 1)) return 'bad value';
    s[key] = value;
  } else if (BOOL_KEYS.includes(key)) s[key] = !!value;
  else if (key === 'reducedMotion') s.reducedMotion = value === null || value === undefined ? null : !!value;
  else return 'unknown setting';
  writeJson(game.storage, SETTINGS_KEY, s);
  return '';
}

/** Today's seed: the date as YYYYMMDD (local time). */
export function todaySeed(date) {
  const d = date || new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** The seed from a query string (?seed=N), else today's. */
export function seedFrom(search, date) {
  const q = new URLSearchParams(search || '');
  const n = Number(q.get('seed'));
  return q.has('seed') && Number.isFinite(n) && q.get('seed') !== '' ? n >>> 0 : todaySeed(date);
}

// ------------------------------------------------------------------ the session

/**
 * @param {{seed:number, scenario?:object, system?:object, planview?:object, storage?:object|null,
 *   beforeTick?:function(object):void, cap?:number, budgetMs?:number, reducedMotion?:boolean|function():boolean}} o
 *   system: the app/system.js module (or a test stand-in); planview: app/planview.js;
 *   storage: a localStorage-like object or null; beforeTick(game): called before every tick
 *   (scripted players and tests; it may call sendInput); reducedMotion: the system's
 *   prefers-reduced-motion (the shell passes a function reading matchMedia), used while the
 *   player has made no choice of their own.
 */
export function createGame(o) {
  const scenario = o.scenario || CLASSIC;
  const storage = o.storage === undefined ? null : o.storage;
  const seen = readJson(storage, SEEN_KEY) || {};
  const settings = cleanSettings(readJson(storage, SETTINGS_KEY));
  const game = {
    seed: o.seed >>> 0, scenario, storage, sysMod: o.system || null, planview: o.planview || null,
    beforeTick: o.beforeTick || null,
    state: null, director: null, pacer: createPacer({cap: o.cap, budgetMs: o.budgetMs}),
    sys: null, sysError: '',
    rec: null, alarms: null, tray: null, watchMem: null,
    phase: 'briefing', agc: true,
    ui: {focus: null, hover: null, hoverGlow: [], stackExpanded: false, previewOn: false, previewGuardMW: null, trayOpen: false,
      drawer: false, settingsOpen: false},
    settings, systemReducedMotion: o.reducedMotion === undefined ? false : o.reducedMotion,
    suburbs: null,
    seenInit: {watch: !!seen.watch, ufls: !!seen.ufls, rocof: !!seen.rocof},
    cues: [], refusal: null, respond: null, respondGlow: [], offers: [], offered: {}, offersToday: 0,
    previewCache: new Map(), previewS: -1, restoreCache: new Map(), restoreS: -1,
    hist: null, histView: null, histViewS: -1,
    hashes: [], lastFrameMs: -1, end: null,
  };
  game.cueCtx = {suburbOf: id => suburbOf(game, id)};
  resetDay(game, game.seed);
  return game;
}

/** In-page reset (C-3): a new day (the same seed by default) on the same game object. */
export function resetDay(game, seed) {
  if (seed !== undefined) game.seed = seed >>> 0;
  game.state = createState(game.seed, game.scenario);
  game.suburbs = null;
  const seen = game.director ? game.director.seen : game.seenInit;
  game.director = D.createDirector({game: true, paused: true, seen});
  game.pacer = createPacer({cap: game.pacer.cap, budgetMs: game.pacer.budgetMs});
  game.sys = null;
  game.sysError = '';
  if (game.sysMod) {
    try { game.sys = game.sysMod.createSystem(); } catch (e) { game.sysError = errText(e); }
  }
  game.rec = createRecorder();
  game.alarms = A.createAlarms();
  game.tray = T.createTray();
  game.watchMem = W.createWatch();
  game.phase = 'briefing';
  game.agc = true;
  Object.assign(game.ui, {focus: null, hover: null, hoverGlow: [], stackExpanded: false, previewOn: false, previewGuardMW: null,
    trayOpen: false});
  game.cues = []; game.refusal = null; game.respond = null; game.respondGlow = [];
  game.offers = []; game.offered = {}; game.offersToday = 0;
  game.previewCache.clear(); game.previewS = -1; game.restoreCache.clear(); game.restoreS = -1;
  game.hist = createHist();
  game.histView = null; game.histViewS = -1;
  game.hashes = []; game.end = null; game.lastFrameMs = -1;
  return game;
}

const errText = e => (e && e.message ? e.message : String(e));

// ------------------------------------------------------------------ history rings (vm.hist)

// The Live Stack's past layers: the six stations, then the other layers it draws (signed: tie
// + import, battery + discharge), in that order (app/planview.js pastFromHist).
const HIST_IDS = [...V.STATION_IDS, 'wind', 'solar', 'tie', 'battery', 'rert', 'dr'];
const NST = V.STATION_IDS.length;
const ST_IDX = V.MACHINES.map(m => V.STATION_IDS.indexOf(m.station));

function createHist() {
  const n = HIST_IDS.length, ring = HIST_COLS + 1;
  return {
    colSum: HIST_IDS.map(() => new Float64Array(ring)), demSum: new Float64Array(ring), colN: new Float64Array(ring),
    colIdx: new Float64Array(ring).fill(-1), n,
  };
}

// Once per completed grid second (after the step that finished it).
function histSecond(game) {
  const st = game.state, h = game.hist;
  const s = Math.floor(st.tick / TPS) - 1;
  if (s < 0) return;
  const col = Math.floor(s / HIST_COL_S), j = col % (HIST_COLS + 1);
  if (h.colIdx[j] !== col) {
    h.colIdx[j] = col; h.colN[j] = 0; h.demSum[j] = 0;
    for (let i = 0; i < h.n; i++) h.colSum[i][j] = 0;
  }
  const units = st.units;
  for (let k = 0; k < units.length; k++) h.colSum[ST_IDX[k]][j] += units[k].outMW;
  const x = h.colSum;
  x[NST][j] += st.ren.windMW * (1 - st.ofgs.trippedFrac);
  x[NST + 1][j] += st.ren.solarMW;
  x[NST + 2][j] += st.tie.flowMW;
  x[NST + 3][j] += st.battery.outMW;
  x[NST + 4][j] += st.rert.outMW;
  x[NST + 5][j] += st.dr.mw;
  h.demSum[j] += st.env.demandMW;
  h.colN[j] += 1;
}

/**
 * vm.hist: {freq, freqMin, freqMax (HIST_FREQ_S per-second values, oldest first, NaN before
 * the day), freqFromS, stations {id: [HIST_COLS mean MW]}, demand [HIST_COLS mean MW],
 * colFromS, colS} for the HIST_COLS completed 5-min columns before the current one
 * (colFromS = the first column's start; NaN where the day had not started).
 */
export function histView(game) {
  const s = Math.floor(game.state.tick / TPS);
  if (game.histView && game.histViewS === s) return game.histView;
  const w = secondsWindow(game.rec, s - HIST_FREQ_S, s);
  const h = game.hist, cur = Math.floor(s / HIST_COL_S);
  const stations = {}, demand = [];
  HIST_IDS.forEach(id => { stations[id] = []; });
  for (let c = cur - HIST_COLS; c < cur; c++) {
    const j = ((c % (HIST_COLS + 1)) + HIST_COLS + 1) % (HIST_COLS + 1);
    const ok = c >= 0 && h.colIdx[j] === c && h.colN[j] > 0;
    HIST_IDS.forEach((id, i) => stations[id].push(ok ? h.colSum[i][j] / h.colN[j] : NaN));
    demand.push(ok ? h.demSum[j] / h.colN[j] : NaN);
  }
  game.histView = {freq: Array.from(w.mean), freqMin: Array.from(w.min), freqMax: Array.from(w.max), freqFromS: s - HIST_FREQ_S,
    stations, demand, colFromS: (cur - HIST_COLS) * HIST_COL_S, colS: HIST_COL_S};
  game.histViewS = s;
  return game.histView;
}

// ------------------------------------------------------------------ ticks

// One cue into the frame's queue (vm.cues): a name, or {name, pan?, gain?, delayS?} (§13.2).
function pushCue(game, c) {
  if (!c || game.cues.length >= MAX_CUES) return;
  if (typeof c === 'string' || (typeof c === 'object' && typeof c.name === 'string' && c.name)) game.cues.push(c);
}

// §13.2 ctx.suburbOf(districtId) -> the suburb code (the sound pans a district's clack by it).
function suburbOf(game, districtId) {
  if (!game.suburbs) game.suburbs = new Map(game.state.city.districts.map(d => [d.id, d.suburb]));
  return game.suburbs.get(districtId) || '';
}

// The cues a sim record asks for: the audio model's cuesOfRecord, else the 1a cueOfRecord.
function recordCues(game, r) {
  if (typeof AM.cuesOfRecord === 'function') return AM.cuesOfRecord(r, game.cueCtx) || EMPTY;
  const c = typeof AM.cueOfRecord === 'function' ? AM.cueOfRecord(r) : '';
  return c ? [c] : EMPTY;
}

function handleRecords(game, recs, by) {
  for (const r of recs) {
    if (r.kind === 'contingency') startTrace(game.rec, game.state);
    let cues = EMPTY;
    try { cues = recordCues(game, r); } catch { cues = EMPTY; } // sound is optional (C-8): never stop the tick
    for (const c of cues) pushCue(game, c);
    if (r.kind === 'input' && !r.ok) {
      if (by) r.by = by;
      else game.refusal = {type: r.type, reason: r.reason, tick: r.tick};
    }
  }
  for (const c of T.trayRecords(game.tray, recs)) pushCue(game, c);
}

/** Run exactly one tick (the loop's tick callback). */
export function tickOnce(game) {
  const state = game.state;
  if (state.over) return;
  if (game.beforeTick) game.beforeTick(game);
  let ins = EMPTY;
  if (game.sys) {
    try {
      ins = game.sysMod.systemInputs(game.sys, state) || EMPTY;
    } catch (e) {
      game.sysError = 'system operator stopped: ' + errText(e);
      game.sys = null;
      ins = EMPTY;
    }
  }
  const recs = step(state, ins);
  if (recs.length) handleRecords(game, recs, ins.length ? 'system' : '');
  onTick(game.rec, state);
  A.sampleTick(game.alarms, state);
  if (state.tick % TPS === 0) histSecond(game);
  if (state.tick % (TPS * V.S_PER_H) === 0) game.hashes.push(hashState(state));
}

/**
 * One animation frame of play (F-5): ticks only; the caller builds the vm and draws after.
 * @returns {number} ticks run
 */
export function frame(game, dtS, now) {
  const d = game.director, state = game.state;
  const n = runFrame(game.pacer, dtS, {
    rate: () => D.rateOf(d, state),
    rateLast: () => D.rateOfLastTick(d, state),
    tick: () => tickOnce(game),
    done: () => state.over,
    now,
  });
  if (D.directorFrame(d, state)) saveSeen(game);
  return n;
}

function saveSeen(game) {
  writeJson(game.storage, SEEN_KEY, game.director.seen);
  game.director.seenDirty = false;
}

/** Run headless (no frames) to `tick` or the day's end (the 04:00-04:30 briefing, tests). */
export function runTo(game, tick) {
  const state = game.state;
  while (!state.over && state.tick < tick) tickOnce(game);
}

// ------------------------------------------------------------------ the briefing (D-7)

/**
 * TAKE THE DESK: AGC or HAND (D-7, chosen now or never), then the 04:00-04:30 settling runs
 * headless and the clock starts at CRUISE.
 * @param {{agc?:boolean}} [o]
 */
export function takeDesk(game, o) {
  if (game.phase !== 'briefing') return false;
  const agc = !o || o.agc === undefined ? true : !!o.agc;
  game.agc = agc;
  if (!agc) sendInput(game, {type: 'mode', agc: false});
  runTo(game, V.PLAYER_START_TICK);
  game.phase = 'play';
  game.director.paused = false;
  return true;
}

// ------------------------------------------------------------------ inputs (actions.input / redispatch)

/**
 * A sim input from the desk, the stack, the map or the keys, applied now (between ticks).
 * Any desk input dismisses the respond card first (K-16). Returns '' or the refusal reason.
 */
export function sendInput(game, x) {
  const state = game.state;
  D.dismissCard(game.director, state);
  const out = [];
  const r = applyInput(state, x, out);
  if (out.length) handleRecords(game, out, '');
  if (r.ok) {
    game.refusal = null;
    game.previewS = -1; game.restoreS = -1;
    if (x.type === 'restore') D.focusRestore(game.director, state);
  }
  return r.ok ? '' : r.reason;
}

/** A-1 RE-DISPATCH through app/system.js. Returns '' or the reason it was refused. */
export function redispatch(game) {
  if (!game.sysMod || !game.sys) return 'RE-DISPATCH needs the system operator' + (game.sysError ? ' (' + game.sysError + ')' : '');
  D.dismissCard(game.director, game.state);
  let r;
  try {
    r = game.sysMod.redispatch(game.sys, game.state);
  } catch (e) {
    return 'RE-DISPATCH failed: ' + errText(e);
  }
  // app/system.js returns {input, reason}; a bare string or input(s) are accepted too.
  if (r && typeof r === 'object' && !Array.isArray(r) && 'reason' in r && !('type' in r)) r = r.reason || r.input;
  if (typeof r === 'string') {
    if (r) game.refusal = {type: 'redispatch', reason: r, tick: game.state.tick};
    return r;
  }
  const list = Array.isArray(r) ? r : r ? [r] : [];
  for (const x of list) {
    const why = sendInput(game, x);
    if (why) return why;
  }
  return '';
}

// ------------------------------------------------------------------ presentation (actions.ui)

/**
 * A presentation command (never a sim input). Returns '' (done) or why nothing happened.
 * @param {{do:string}} cmd
 */
export function ui(game, cmd) {
  const d = game.director, state = game.state, u = game.ui;
  switch (cmd && cmd.do) {
    case 'focus': u.focus = cmd.target || null; return '';
    case 'hover': u.hover = cmd.target || null; u.hoverGlow = Array.isArray(cmd.glow) ? cmd.glow.slice() : []; return '';
    case 'ack': A.ackAll(game.alarms); return '';
    case 'silence': A.silence(game.alarms); return '';
    case 'ackTile': return A.ackTile(game.alarms, cmd.id) ? '' : 'no such tile';
    case 'stackExpand': u.stackExpanded = !!cmd.on; return '';
    case 'preview': u.previewOn = !!cmd.on; return '';
    case 'previewGuard': u.previewGuardMW = cmd.mw === null || cmd.mw === undefined ? null : cmd.mw; return '';
    case 'offerTaken':
      if (!game.offered[cmd.unit]) return 'not offered';
      game.offered[cmd.unit].taken = true; return '';
    case 'dismissRespond': return D.dismissCard(d, state) ? '' : 'no card';
    case 'pause':
      if (state.over || game.phase !== 'play') return 'not now';
      D.togglePause(d); return '';
    case 'fast': return D.setFast(d, state, !!cmd.on) || !cmd.on ? '' : 'not now';
    case 'skipWatch': return D.skipWatch(d, state) ? '' : 'nothing to skip';
    case 'drawer': u.drawer = cmd.on === undefined ? !u.drawer : !!cmd.on; return '';
    case 'tray': u.trayOpen = !u.trayOpen; u.focus = 'tray'; return '';
    // Settings (K-22, §13.1, B-7): the popover never pauses the game.
    case 'mute': return setSetting(game, 'muted', !game.settings.muted);
    case 'volume': return setSetting(game, 'volume', cmd.volume); // the 1a form of {do: 'set', key: 'volume'}
    case 'set': return setSetting(game, cmd.key, cmd.value);
    case 'settings': u.settingsOpen = cmd.on === undefined ? !u.settingsOpen : !!cmd.on; return '';
    // Foley for a desk gesture (B-6): presentation only, so the input log stays clean (F-6).
    case 'cue': {
      if (typeof cmd.name !== 'string' || !cmd.name) return 'no cue name';
      if (game.cues.length >= MAX_CUES) return 'too many cues';
      const c = {name: cmd.name};
      for (const k of ['pan', 'gain', 'delayS']) if (Number.isFinite(cmd[k])) c[k] = cmd[k];
      pushCue(game, c.pan === undefined && c.gain === undefined && c.delayS === undefined ? cmd.name : c);
      return '';
    }
    default: return 'unknown ui command';
  }
}

// ------------------------------------------------------------------ previews (actions.previewTrip / restorePreview)

function largestUnit(state) {
  let best = -1;
  for (let i = 0; i < state.units.length; i++) {
    const u = state.units[i];
    if (u.sync && (best < 0 || u.outMW > state.units[best].outMW)) best = i;
  }
  return best;
}

/**
 * TRIP PREVIEW on the live state (K-10, K-5): {nadirHz, nadirS, lostMW, uflsStages, caught, kind,
 * id}, cached per grid second and target and guard. opts: {kind:'unit'|'link', id?, guardMW?};
 * a 'unit' without id is the largest online machine. Null when there is nothing to preview.
 */
export function previewTrip(game, opts) {
  const state = game.state;
  if (state.over) return null;
  const o = opts || {};
  const s = Math.floor(state.tick / TPS);
  if (game.previewS !== s) { game.previewCache.clear(); game.previewS = s; }
  let kind = o.kind || 'unit', id = o.id || '';
  if (kind === 'unit' && !id) {
    const L = fleet.largestContingency(state);
    if (L.kind === 'unit') id = L.id;
    else { const i = largestUnit(state); if (i < 0) return null; id = state.units[i].id; }
  }
  if (kind === 'link') id = 'tie';
  if (kind !== 'unit' && kind !== 'link') return null;
  const guard = o.guardMW === undefined || o.guardMW === null ? null : Math.max(0, Math.min(V.BATT_MW, o.guardMW));
  const key = kind + '|' + id + '|' + guard;
  if (game.previewCache.has(key)) return game.previewCache.get(key);
  let r;
  try {
    const p = physics.previewTrip(state, {kind, id}, guard === null ? undefined : {guardMW: guard});
    r = {nadirHz: p.nadirHz, nadirS: p.nadirS, lostMW: p.lostMW, uflsStages: p.uflsStages, black: p.black,
      caught: Object.assign({}, p.caught), kind, id};
  } catch {
    r = null;
  }
  game.previewCache.set(key, r);
  return r;
}

/** RESTORE PREVIEW for a district (K-13): '' (the restore would be accepted) or the refusal. */
export function restorePreview(game, districtId) {
  const state = game.state;
  const s = Math.floor(state.tick / TPS);
  if (game.restoreS !== s) { game.restoreCache.clear(); game.restoreS = s; }
  if (game.restoreCache.has(districtId)) return game.restoreCache.get(districtId);
  const d = state.city.districts.findIndex(x => x.id === districtId);
  const r = d < 0 ? 'unknown district' : state.over ? 'the day is over' : grid.restorePermissive(state, d, {preview: true});
  game.restoreCache.set(districtId, r);
  return r;
}

// ------------------------------------------------------------------ the view model (desk/README.md §5)

const PEAK = A.PEAK_H;

// K-12 / A-4: which ready units the bay offers now.
function updateOffers(game, obs, mode) {
  const out = [];
  const respond = mode === 'RESPOND' || mode === 'RESPOND-CARD';
  const tight = obs.sec.level !== 'SECURE';
  const peak = obs.clock.h >= PEAK[0] && obs.clock.h < PEAK[1];
  for (const u of obs.units) {
    // One offer per ready period: the record lives while the unit waits at full speed.
    if (u.mode !== 'ready') { delete game.offered[u.id]; continue; }
    const rec = game.offered[u.id];
    if (rec) { out.push({unit: u.id, why: rec.why}); continue; }
    const why = respond ? 'respond' : tight ? 'tight' : peak ? 'peak' : '';
    if (!why || game.offersToday >= MAX_OFFERS) continue;
    game.offersToday++;
    game.offered[u.id] = {why, taken: false};
    out.push({unit: u.id, why});
  }
  game.offers = out;
  return out;
}

const stationOfUnit = id => { const m = V.MACHINES.find(x => x.id === id); return m ? m.station : ''; };

/**
 * Build the view model after a frame's ticks (once per frame). Also runs the annunciator,
 * the tray's aging, the offers and the respond card, and hands over the frame's audio cues.
 * @param {object} game
 * @param {{nowMs:number, dtS:number}} f
 */
export function buildVm(game, f) {
  const state = game.state, d = game.director;
  const obs = observe(state);
  const mode = D.modeOf(d, state);
  const nowMs = f && Number.isFinite(f.nowMs) ? f.nowMs : 0;
  const realDtS = game.lastFrameMs < 0 ? 0 : Math.max(0, (nowMs - game.lastFrameMs) / 1000);
  game.lastFrameMs = nowMs;

  // Annunciator (not during the briefing: the desk opens at 04:30).
  if (game.phase === 'play') {
    const r = A.updateAlarms(game.alarms, A.alarmInput(obs), {nowMs, realDtS, stationOf: stationOfUnit});
    for (const c of r.cues) pushCue(game, c);
    if (r.newAlarm) D.endFast(d);
  }
  T.trayFrame(game.tray, obs.s);

  // The respond card (K-16): built once when it opens, dropped when it is dismissed.
  const c = obs.contingency;
  if (mode.mode === 'RESPOND-CARD' && c && (!game.respond || game.respond.n !== c.n)) {
    let glow = null;
    if (game.planview && game.planview.glowSet) {
      try {
        // The gap the trip opened (planview's first red run, L-5); with none on the stack, the
        // N-1 problem itself: what can arrive before the 30-min secure countdown ends.
        const first = game.planview.project && game.planview.firstGap ? game.planview.firstGap(game.planview.project(obs)) : null;
        const gap = first || {atS: Math.floor(c.secureByTick / TPS), mw: Math.max(0, obs.sec.lMW - obs.sec.r5MW)};
        glow = [...game.planview.glowSet(obs, gap)];
      } catch {
        glow = null;
      }
    }
    game.respond = W.respondCard(obs, c, {glow: glow || W.fallbackGlow(obs, c)});
    game.respondGlow = game.respond.glow;
  }
  if (mode.mode !== 'RESPOND-CARD') game.respond = null;
  if (mode.mode !== 'RESPOND-CARD' && mode.mode !== 'RESPOND') game.respondGlow = [];

  const offers = game.phase === 'play' ? updateOffers(game, obs, mode.mode) : [];
  const glow = new Set(game.respondGlow);
  for (const g of game.ui.hoverGlow) glow.add(g);
  if (offers.length) glow.add('bay-sync');

  let watch = null;
  if (mode.mode === 'WATCH' && c) {
    const tr = traceOf(game.rec, c.n);
    if (tr) watch = W.watchView(game.watchMem, tr, c, state.tick, {rate: mode.rate, version: mode.watchVersion, guardMW: obs.battery.guardMW});
  }
  if (state.over && !game.end) {
    game.end = {black: state.black, score: obs.score, hash: hashState(state), inputs: state.log.length, seed: game.seed, v: SIM_VERSION};
  }
  const cues = game.cues;
  game.cues = [];
  const refusal = game.refusal;
  return {
    obs, mode, frame: {nowMs, dtS: f && f.dtS ? f.dtS : 0, alpha: game.pacer.alpha},
    alarms: A.alarmsView(game.alarms), tray: T.trayView(game.tray),
    focus: game.ui.focus, hover: game.ui.hover, stackExpanded: game.ui.stackExpanded, previewOn: game.ui.previewOn,
    previewGuardMW: game.ui.previewGuardMW, offers, respond: game.respond, glow, hist: histView(game),
    settings: settingsView(game),
    // Shell additions (desk/README.md §5 plus): what the overlays and audio read. cues: this
    // frame's sounds, each a name or {name, pan?, gain?, delayS?} (§13.2).
    phase: game.phase, watch, needleHz: needleF(game.rec, mode.rate, game.pacer.alpha), cues, refusal,
    trayOpen: game.ui.trayOpen, drawer: game.ui.drawer, settingsOpen: game.ui.settingsOpen, end: game.end, seed: game.seed,
    sysError: game.sysError,
  };
}

// ------------------------------------------------------------------ F-6

/** The replay file: seed + SIM_VERSION + scenario id + input log. */
export function gameLog(game) {
  return {v: SIM_VERSION, seed: game.seed, scenarioId: game.state.scenarioId,
    log: game.state.log.map(r => ({tick: r.tick, type: r.type, args: Object.assign({}, r.args)}))};
}

/** Replay a game file headless to `untilTick` (default: where the game is); returns the state. */
export function replayGame(file, scenario, untilTick) {
  return replay(file.seed, scenario || CLASSIC, file.log, untilTick === undefined ? {} : {untilTick});
}

/** The actions object every UI module receives (desk/README.md §4), bound to this game. */
export function makeActions(game) {
  return {
    input: x => sendInput(game, x),
    redispatch: () => redispatch(game),
    ui: cmd => ui(game, cmd),
    previewTrip: opts => previewTrip(game, opts),
    restorePreview: id => restorePreview(game, id),
  };
}

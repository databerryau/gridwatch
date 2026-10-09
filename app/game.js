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
import * as weather from '../sim/weather.js';
import {CLASSIC, SCENARIOS} from '../content/scenarios.js';
import {objective, consequence, steady, masked} from './objective.js';
import {createPacer, runFrame} from './loop.js';
import * as D from './director.js';
import {createRecorder, onTick, startTrace, traceOf, needleF, secondsWindow} from './record.js';
import * as A from './alarms.js';
import * as T from './tray.js';
import * as W from './watch.js';
// A namespace import: cuesOfRecord (Phase 1b, desk/README.md §13.2) is used when the audio
// model has it; until then the 1a cueOfRecord.
import * as AM from '../audio/model.js';
import * as S from './score.js';
import {createParRunner, seriesAt} from './par.js';

const TPS = V.TICKS_PER_S;
const EMPTY = Object.freeze([]);
/** vm.cues: at most this many in one frame (a runaway emitter must not flood the audio). */
export const MAX_CUES = 64;
/** vm.hist.freq: this many grid seconds of per-second frequency (3 min). */
export const HIST_FREQ_S = 180;
/** vm.hist station / demand columns: 5-min columns over the last 30 grid-min (L-1's past). */
export const HIST_COL_S = V.FC_STEP_S, HIST_COLS = 6;
/** The standing objective is recomputed this often (grid seconds). */
export const OBJECTIVE_EVERY_S = 30;
/** A line shown stays up at least this long (real ms), so it can be read. */
export const LINE_DWELL_MS = 4000;
/** A START is "now" this many real s sooner at CRUISE (ctx.leadS): to read, press twice. */
export const LINE_REACT_S = 13;
/**
 * Inputs after which the dispatch is re-run in the same call (Phase 2a, desk/README.md §21.4): the
 * commitment and the battery are the player's, and a plan that has not seen the input yet would
 * read as a shortfall (or a surplus) on the stack and in the objective until the system's next
 * look. tests/lib/follow.js mirrors this set for the hint-following player: keep the two in step.
 */
export const REDISPATCH_AFTER = Object.freeze(['start', 'stop', 'abortStop', 'battery', 'guard', 'flex', 'flexDel']);
/** K-12 offers: at most this many a day (K-12 accept). */
export const MAX_OFFERS = 3;
/** Storage keys (C-8: every access is wrapped; the game plays with storage blocked). */
export const SEEN_KEY = 'gridwatch:v4:seen', SETTINGS_KEY = 'gridwatch:v4:settings';
/** Q-46: a tile pressed is W's pick this long (its note's life, ms). */
export const ALARMS_PICK_MS = 6000;

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

/**
 * The game's scenario for a seed (desk/README.md C-2): 'desk-weekend' when the seed reads as a
 * valid YYYYMMDD date that falls on a Saturday or Sunday, else 'desk' (any other seed is a weekday).
 */
export function scenarioForSeed(seed) {
  const n = seed >>> 0, y = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100;
  if (y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCMonth() === m - 1 && t.getUTCDate() === d && (t.getUTCDay() === 0 || t.getUTCDay() === 6)) return SCENARIOS['desk-weekend'];
  }
  return SCENARIOS.desk;
}

// ------------------------------------------------------------------ the session

/**
 * @param {{seed:number, scenario?:object|function(number):object, system?:object, planview?:object, storage?:object|null,
 *   beforeTick?:function(object):void, cap?:number, budgetMs?:number, reducedMotion?:boolean|function():boolean}} o
 *   scenario: a scenario, or a function of the seed (scenarioForSeed), asked again at every reset;
 *   system: the app/system.js module (or a test stand-in); planview: app/planview.js;
 *   storage: a localStorage-like object or null; beforeTick(game): called before every tick
 *   (scripted players and tests; it may call sendInput); reducedMotion: the system's
 *   prefers-reduced-motion (the shell passes a function reading matchMedia), used while the
 *   player has made no choice of their own.
 *   par (Q-48): false (default), true (app/par.js), a runner, or a finished one's {score, series?, black?, at?} (tests).
 */
export function createGame(o) {
  const scenarioOf = typeof o.scenario === 'function' ? o.scenario : null;
  const scenario = scenarioOf ? scenarioOf(o.seed >>> 0) : o.scenario || CLASSIC;
  const storage = o.storage === undefined ? null : o.storage;
  const seen = readJson(storage, SEEN_KEY) || {};
  const settings = cleanSettings(readJson(storage, SETTINGS_KEY));
  const game = {
    seed: o.seed >>> 0, scenario, scenarioOf, storage, sysMod: o.system || null, planview: o.planview || null,
    // SPEC §9.1 Q-18: 'player' = the commitment is the player's (the real page); 'system' = the
    // Phase 1a system operator, which commits units itself. startPaused: the desk opens at 04:30
    // with the clock held, so the first decision is made before anything moves.
    commit: o.commit === 'player' ? 'player' : 'system', startPaused: !!o.startPaused, objective: null, objectiveS: -1e9, objectiveHeld: null, consider: null,
    // objectiveError: why the line (or the consequence) is blank, '' when it is not; dayAhead: the
    // line's day-ahead forecast (consequence() reuses it); considerDirty: the consider target changed
    objectiveError: '', dayAhead: null, considerDirty: false,
    beforeTick: o.beforeTick || null,
    state: null, director: null, pacer: createPacer({cap: o.cap, budgetMs: o.budgetMs}),
    sys: null, sysError: '',
    rec: null, alarms: null, tray: null, watchMem: null,
    phase: 'briefing', agc: true,
    ui: {focus: null, hover: null, hoverGlow: [], stackExpanded: false, previewOn: false, previewGuardMW: null, trayOpen: false,
      drawer: false, settingsOpen: false, consider: null, armed: null,
      alarmsOpen: false, alarmsSel: null, alarmsPick: null}, // Q-46: the alarm panel, its tile, W's pick {id, untilMs}
    settings, systemReducedMotion: o.reducedMotion === undefined ? false : o.reducedMotion,
    suburbs: null,
    seenInit: {watch: !!seen.watch, ufls: !!seen.ufls, rocof: !!seen.rocof},
    cues: [], refusal: null, respond: null, respondGlow: [], offers: [], offered: {}, offersToday: 0,
    previewCache: new Map(), previewS: -1, restoreCache: new Map(), restoreS: -1,
    hist: null, histView: null, histViewS: -1,
    hashes: [], lastFrameMs: -1, end: null,
    par: null, parOpt: o.par || false, parKey: '', households: 0, // Q-48: par's runner, for the day parKey names
  };
  game.cueCtx = {suburbOf: id => suburbOf(game, id)};
  resetDay(game, game.seed);
  return game;
}

// Q-48: par, once per seed and scenario (PLAY THIS DAY AGAIN keeps it).
function parFor(game) {
  const p = game.parOpt, key = game.seed + '|' + game.state.scenarioId;
  if (!p || (game.par && game.parKey === key)) { if (!p) game.par = null; return; }
  game.parKey = key;
  game.par = p === true ? createParRunner(game.seed, game.scenario, {storage: {read: k => readJson(game.storage, k), write: (k, v) => writeJson(game.storage, k, v)}})
    : p.step ? p : Object.assign({step: () => true, done: true, score: null, series: [], at(s) { return seriesAt(this.series || [], s); }, progress: 1, black: false}, p);
}

/** In-page reset (C-3): a new day (the same seed by default) on the same game object. */
export function resetDay(game, seed) {
  if (seed !== undefined) game.seed = seed >>> 0;
  if (game.scenarioOf) game.scenario = game.scenarioOf(game.seed);
  game.state = createState(game.seed, game.scenario);
  game.suburbs = null;
  game.objective = null; game.objectiveS = -1e9; game.objectiveMode = ''; game.objectiveHeld = null; game.consider = null;
  game.objectiveError = ''; game.dayAhead = null; game.considerDirty = false; game.lineMs = 0; game.lineFresh = false;
  game.unitModes = null;
  const seen = game.director ? game.director.seen : game.seenInit;
  game.director = D.createDirector({game: true, paused: true, seen});
  game.pacer = createPacer({cap: game.pacer.cap, budgetMs: game.pacer.budgetMs});
  game.sys = null;
  game.sysError = '';
  if (game.sysMod) {
    try { game.sys = game.sysMod.createSystem({commit: game.commit}); } catch (e) { game.sysError = errText(e); }
  }
  game.rec = createRecorder();
  game.alarms = A.createAlarms();
  game.tray = T.createTray();
  game.watchMem = W.createWatch();
  game.phase = 'briefing';
  game.agc = true;
  Object.assign(game.ui, {focus: null, hover: null, hoverGlow: [], stackExpanded: false, previewOn: false, previewGuardMW: null,
    trayOpen: false, consider: null, armed: null, alarmsOpen: false, alarmsSel: null, alarmsPick: null, suburb: null, suburbLast: null}); // (Q-56)
  game.cues = []; game.refusal = null; game.respond = null; game.respondGlow = [];
  game.offers = []; game.offered = {}; game.offersToday = 0;
  game.previewCache.clear(); game.previewS = -1; game.restoreCache.clear(); game.restoreS = -1;
  game.hist = createHist();
  game.histView = null; game.histViewS = -1;
  game.hashes = []; game.end = null; game.lastFrameMs = -1;
  game.households = game.scenario.city.suburbs.reduce((a, s) => a + s.households, 0);
  parFor(game);
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
    colSum: HIST_IDS.map(() => new Float64Array(ring)), demSum: new Float64Array(ring), roofSum: new Float64Array(ring), colN: new Float64Array(ring),
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
    h.colIdx[j] = col; h.colN[j] = 0; h.demSum[j] = 0; h.roofSum[j] = 0;
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
  h.roofSum[j] += st.env.rooftopMW || 0; // Phase 2a: the rooftop bite (as if connected), for the stack's silhouette
  h.colN[j] += 1;
}

/**
 * vm.hist: {freq, freqMin, freqMax (HIST_FREQ_S per-second values, oldest first, NaN before
 * the day), freqFromS, stations {id: [HIST_COLS mean MW]}, demand [HIST_COLS mean MW] (operational),
 * rooftop [HIST_COLS mean MW],
 * colFromS, colS} for the HIST_COLS completed 5-min columns before the current one
 * (colFromS = the first column's start; NaN where the day had not started).
 */
export function histView(game) {
  const s = Math.floor(game.state.tick / TPS);
  if (game.histView && game.histViewS === s) return game.histView;
  const w = secondsWindow(game.rec, s - HIST_FREQ_S, s);
  const h = game.hist, cur = Math.floor(s / HIST_COL_S);
  const stations = {}, demand = [], rooftop = [];
  HIST_IDS.forEach(id => { stations[id] = []; });
  for (let c = cur - HIST_COLS; c < cur; c++) {
    const j = ((c % (HIST_COLS + 1)) + HIST_COLS + 1) % (HIST_COLS + 1);
    const ok = c >= 0 && h.colIdx[j] === c && h.colN[j] > 0;
    HIST_IDS.forEach((id, i) => stations[id].push(ok ? h.colSum[i][j] / h.colN[j] : NaN));
    demand.push(ok ? h.demSum[j] / h.colN[j] : NaN);
    rooftop.push(ok ? h.roofSum[j] / h.colN[j] : NaN);
  }
  game.histView = {freq: Array.from(w.mean), freqMin: Array.from(w.min), freqMax: Array.from(w.max), freqFromS: s - HIST_FREQ_S,
    stations, demand, rooftop, colFromS: (cur - HIST_COLS) * HIST_COL_S, colS: HIST_COL_S};
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
  game.director.paused = game.startPaused;
  game.director.held = game.ui.alarmsOpen; // Q-46: an alarm panel opened in the briefing holds the clock now
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
    game.objectiveS = -1e9; game.lineFresh = true;
    game.refusal = null;
    game.previewS = -1; game.restoreS = -1;
    if (x.type === 'restore') D.focusRestore(game.director, state);
    if (REDISPATCH_AFTER.includes(x.type)) redispatchAfter(game);
  }
  return r.ok ? '' : r.reason;
}

// Are the levers held by hand? app/system.js heldByHand scans the log at once (a lever moved a
// moment ago counts now, not at the system's next 60-s look); a stand-in without it: sys.edited.
function heldByHand(game) {
  if (!game.sys) return false;
  const f = game.sysMod && game.sysMod.heldByHand;
  return typeof f === 'function' ? !!f(game.sys, game.state) : !!game.sys.edited;
}

// §21.4: in 'player' mode with the levers not held by hand, an accepted commitment or battery
// input is followed at once by the system's re-dispatch (a logged planLoad, so replay() still
// reproduces the day): the next objective line is read off a plan that already knows about it.
// A refusal here (the watch, no plan before 04:30) is nothing to tell the player about.
function redispatchAfter(game) {
  if (game.commit !== 'player' || !game.sysMod || !game.sys || heldByHand(game)) return;
  let r;
  try { r = game.sysMod.redispatch(game.sys, game.state); } catch { return; }
  if (r && typeof r === 'object' && !Array.isArray(r) && 'reason' in r && !('type' in r)) r = r.input;
  if (!r || typeof r === 'string') return;
  const out = [];
  for (const x of Array.isArray(r) ? r : [r]) applyInput(game.state, x, out);
  if (out.length) handleRecords(game, out, 'system');
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

const isTile = id => A.TILES.some(t => t.id === id);

// Q-56 (§31.9.1): id null closes; undefined is H's pick
function suburbCard(game, id) {
  const u = game.ui, ids = game.scenario.city.suburbs.map(s => s.id), of = t => ids.find(x => 'suburb-' + x === t);
  if (D.modeOf(game.director, game.state).locked) return 'The suburb card is back after the watch';
  if (id === undefined) id = (game.objective && game.objective.targets.map(of).find(Boolean)) || of(u.hover) || u.suburbLast || ids[0];
  if (id !== null && !ids.includes(id)) return 'no such suburb';
  u.suburb = id;
  if (id) u.suburbLast = id;
  return '';
}
const cardFor = (game, t) => /^suburb-/.test(t) ? suburbCard(game, t === 'suburb-card' ? game.ui.suburb || undefined : t.slice(7)) : '';

/**
 * A presentation command (never a sim input). Returns '' (done) or why nothing happened. The
 * alarm panel's: alarms, alarmsSel, alarmsPick (a tile pressed while closed), alarmsGoto (Q-46, §30.3.3).
 * @param {{do:string}} cmd
 */
export function ui(game, cmd) {
  const d = game.director, state = game.state, u = game.ui, play = game.phase === 'play' && !state.over;
  const close = () => { u.alarmsOpen = false; u.alarmsSel = null; d.held = false; };
  switch (cmd && cmd.do) {
    case 'focus': if (u.alarmsOpen) return ui(game, {do: 'alarmsGoto', target: cmd.target}); u.focus = cmd.target || null; return cardFor(game, cmd.target);
    case 'suburb': { // (H toggles)
      const id = 'id' in cmd ? cmd.id : u.suburb && !u.alarmsOpen ? null : undefined;
      if (u.alarmsOpen) ui(game, {do: 'alarmsGoto', target: null});
      return suburbCard(game, id);
    }
    case 'alarms':
      if (!(cmd.on === undefined ? !u.alarmsOpen : cmd.on)) { close(); return ''; }
      u.alarmsOpen = true;
      u.alarmsSel = isTile(cmd.id) ? cmd.id : A.defaultSel(A.alarmsView(game.alarms), u.alarmsPick, game.lastFrameMs);
      if (play) { d.held = true; D.endFast(d); }
      return '';
    case 'alarmsSel': if (!isTile(cmd.id)) return 'no such tile'; if (u.alarmsOpen) u.alarmsSel = cmd.id; return '';
    case 'alarmsPick': if (!isTile(cmd.id)) return 'no such tile'; u.alarmsPick = {id: cmd.id, untilMs: game.lastFrameMs + ALARMS_PICK_MS}; return '';
    case 'alarmsGoto':
      close();
      if (play && !D.respondCardOpen(d, state)) d.paused = true; // (a waiting RESPOND card holds the clock itself)
      if (cmd.target) u.focus = cmd.target;
      return cardFor(game, cmd.target);
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
      if (u.alarmsOpen) { close(); if (play) d.paused = false; return play ? '' : 'not now'; } // Q-46: closes it, then runs
      if (!play) return 'not now';
      D.togglePause(d); return '';
    case 'fast': return D.setFast(d, state, !!cmd.on) || !cmd.on ? '' : 'not now';
    case 'skipWatch': return D.skipWatch(d, state) ? '' : 'nothing to skip';
    case 'drawer': u.drawer = cmd.on === undefined ? !u.drawer : !!cmd.on; return '';
    case 'tray': u.trayOpen = !u.trayOpen; u.focus = 'tray'; return '';
    // C-10 (desk/README.md §19.5): the guard the player is hovering, focusing or has lifted.
    case 'consider': {
      const t = typeof cmd.target === 'string' && /^guard-(start|stop)-/.test(cmd.target) ? cmd.target : null;
      if (t !== u.consider) { u.consider = t; game.considerDirty = true; }
      return '';
    }
    // vm.armed: a guard's cover up or down
    case 'armed': if (cmd.on) u.armed = cmd.target || null; else if (u.armed === cmd.target) u.armed = null; game.considerDirty = true; return '';
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

const LEVELS = ['ok', 'plan', 'act', 'crit'];
// Q-18: the line shown since shownMs stays up against `next`, unless `fresh` (an input, news), the
// same text, a critical or watch line, a higher ask, or nowMs 0.
export function holdLine(shown, next, nowMs, shownMs, fresh) {
  return !!shown && !!next && !fresh && nowMs > 0 && next.text !== shown.text && next.level !== 'crit' && next.kind !== 'watch' &&
    !(next.action && LEVELS.indexOf(next.level) > LEVELS.indexOf(shown.level)) && nowMs - shownMs < LINE_DWELL_MS;
}
// A new ask to act: at FAST it ends FAST, as an alarm does, and shows at once.
export const newAsk = (shown, next) => !!next && !!next.action && LEVELS.indexOf(next.level) > 1 && JSON.stringify(next.action) !== JSON.stringify(shown && shown.action);

/** The annunciator's context (§30.3.5; buildVm and tests/lib/play.js): no real time while the clock is held. */
export function alarmCtx(game, nowMs, realDtS) {
  return {nowMs, realDtS: D.rateOf(game.director, game.state) > 0 ? realDtS : 0, stationOf: stationOfUnit, hold: !!game.ui.alarmsOpen};
}

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
    const r = A.updateAlarms(game.alarms, A.alarmInput(obs), alarmCtx(game, nowMs, realDtS));
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
  // The standing objective (app/objective.js; Q-18): once per OBJECTIVE_EVERY_S grid seconds, and
  // at once when an input lands (objectiveS is reset there) or the watch, the card or RESPOND comes
  // or goes (not Space). An exception in objective(), steady() or consequence() blanks only its
  // line; it is kept in objectiveError (vm.objectiveError; the ?debug handle shows it) as the
  // system operator's is in sysError.
  if (game.phase === 'play' && game.commit === 'player' && game.planview) {
    const news = game.objectiveMode !== mode.mode && /WATCH|RESPOND|OVER/.test(mode.mode + game.objectiveMode);
    if (obs.s - game.objectiveS >= OBJECTIVE_EVERY_S || obs.s < game.objectiveS || news) {
      let fresh = game.lineFresh || news;
      game.objectiveS = obs.s; game.objectiveMode = mode.mode; game.lineFresh = false;
      game.objectiveError = '';
      let stage = 'objective';
      try {
        // dayAhead: the forecast to 04:00 (Phase 2a, C-10: the objective looks past the 4.5-h
        // window), the one weather.forecast call observe(state, {dayAhead: true}) would make; the
        // projection once per line (F-11: the objective and its STOP saving read the same one).
        game.dayAhead = weather.forecast(state, V.DAY_S - obs.s, V.FC_STEP_S);
        const proj = game.planview.project(obs);
        const next = objective(obs, {edited: heldByHand(game), planview: game.planview, proj, dayAhead: game.dayAhead, leadS: d.speed * LINE_REACT_S});
        // (steady: a waiting line whose deadline flips between two 5-minute marks is kept as it was said)
        stage = 'steady';
        game.objectiveHeld = steady(game.objectiveHeld, next, obs.s);
        const line = game.objectiveHeld.line, was = game.objective;
        if (mode.mode === 'FAST' && newAsk(was, line)) { D.endFast(d); fresh = true; }
        if (!holdLine(was, line, nowMs, game.lineMs, fresh)) {
          if (!was || !line || line.text !== was.text) game.lineMs = nowMs;
          game.objective = line;
        }
      } catch (e) { game.objective = null; game.objectiveHeld = null; game.objectiveError = stage + ': ' + errText(e); }
      game.considerDirty = true;
    }
    // C-10 (§19.5): what the guard under the player's hand would do, on the same cadence and at once
    // when the target changes ('consider' marks it; only consequence() is recomputed then, on the
    // line's own day-ahead forecast) or an input lands; with its cover up, held until its level or words change.
    if (game.considerDirty) {
      game.considerDirty = false;
      const t = game.ui.consider, was = game.consider;
      game.consider = null;
      if (t && !mode.locked) {
        try {
          if (!game.dayAhead) game.dayAhead = weather.forecast(state, V.DAY_S - obs.s, V.FC_STEP_S);
          const c = game.consider = consequence(obs, t, {dayAhead: game.dayAhead, planview: game.planview});
          if (t === game.ui.armed && c && was && was.target === t && was.level === c.level && masked(was.text) === masked(c.text)) game.consider = was;
        } catch (e) { game.consider = null; game.objectiveError = 'consequence: ' + errText(e); }
      }
    }
    if (!game.ui.consider || mode.locked) game.consider = null;
    if (game.objective && mode.mode !== 'WATCH') for (const g of game.objective.targets) glow.add(g);
  } else { game.objective = null; game.objectiveHeld = null; game.consider = null; }
  if (offers.length) glow.add('bay-sync');

  let watch = null;
  if (mode.mode === 'WATCH' && c) {
    const tr = traceOf(game.rec, c.n);
    if (tr) watch = W.watchView(game.watchMem, tr, c, state.tick, {rate: mode.rate, version: mode.watchVersion, guardMW: obs.battery.guardMW});
  }
  if (state.over && !game.end) {
    // Q-48: black is an F at once; par's ALL-IN and the grade are filled in place below, on the frame par has its score
    const allIn = S.allIn(obs.score, game.households);
    game.end = {black: state.black, score: obs.score, hash: hashState(state), inputs: state.log.length, seed: game.seed, v: SIM_VERSION,
      allIn, parAllIn: null, grade: state.black ? S.grade(allIn, null, true) : null};
  }
  const par = game.par, end = game.end; // (a par day that went black gives no grade)
  if (end && !end.parAllIn && par && par.done && par.score && !par.black) {
    end.parAllIn = S.allIn(par.score, game.households);
    end.grade = S.grade(end.allIn, end.parAllIn, end.black);
  }
  // spoolUp: no sim record marks a machine starting (booked starts included), so it is read
  // off the unit's mode between two frames (audio/model.js cueOfModeChange).
  if (!game.unitModes) game.unitModes = {};
  for (const u of obs.units) {
    const was = game.unitModes[u.id];
    if (was !== u.mode) {
      game.unitModes[u.id] = u.mode;
      const c = game.phase === 'play' && AM.cueOfModeChange ? AM.cueOfModeChange(was, u.mode) : '';
      if (c) pushCue(game, c);
    }
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
    sysError: game.sysError, objective: game.objective, commit: game.commit, objectiveError: game.objectiveError,
    // C-10 (§19.5): {target, text, level} for the guard being hovered, focused or lifted, or null;
    // the shell shows it in #objective with the word '? IF PRESSED', in place of the objective.
    consider: game.consider,
    // the guard with its cover up, or null; levers held by hand
    armed: game.ui.armed, held: game.commit === 'player' && heldByHand(game),
    alarmsOpen: game.ui.alarmsOpen, alarmsSel: game.ui.alarmsSel, // Q-46 (alarmsSel: null while closed)
    suburb: game.ui.suburb, dayAhead: game.dayAhead, // §31.3.8
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
  return replay(file.seed, scenario || SCENARIOS[file.scenarioId] || CLASSIC, file.log, untilTick === undefined ? {} : {untilTick});
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

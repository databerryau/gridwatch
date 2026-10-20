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
import {createState, step, observe, applyInput, hashState, replay, scenarioHash, SIM_VERSION} from '../sim/step.js';
import * as physics from '../sim/physics.js';
import * as grid from '../sim/grid.js';
import * as fleet from '../sim/fleet.js';
import * as weather from '../sim/weather.js';
import {rateAt, gridAfter, NIGHT_S, PEAK} from '../sim/clock.js';
import {restoreAllowedS, isPerfect} from '../sim/market.js';
import {imbalanceSegments} from '../desk/calc.js';
import {CLASSIC, SCENARIOS, SA2016_SCENARIO} from '../content/scenarios.js';
import {BRIEF_LOCK, NIGHT_LOCK, RESUME_LOCK, RESUMING} from '../render/format.js';
import {DAILIES, dailyScenarioIdOf, ymdOf, dailyFor} from '../content/dailies.js';
import {anniversaryOf, SA2016} from '../content/anniversaries.js';
import {objective, consequence, steady} from './objective.js';
import {createPacer, runFrame} from './loop.js';
import * as D from './director.js';
import {createRecorder, onTick, startTrace, traceOf, needleF, secondsWindow} from './record.js';
import * as A from './alarms.js';
import * as T from './tray.js';
import * as W from './watch.js';
import * as AM from '../audio/model.js';
import * as S from './score.js';
import * as VD from './verdict.js';
import {createMarg, margSay, MARG_LINES, MARG_FROM, MARG_FIRST, MARG_LATER, MARG_FIRSTS, FIRST_TARGET, beatsAhead, firstsNow} from './marg.js';
import {plateGroup} from '../desk/desk.js';
import {createParRunner, seriesAt, parMinute} from './par.js';
import * as SH from './share.js';
import * as HI from './history.js';
import {hardDayOf} from './shelf.js';
import {weekAhead} from './week.js';
import {LADDER} from '../content/ladder.js';

const TPS = V.TICKS_PER_S;
const EMPTY = Object.freeze([]);
/** vm.cues: at most this many in one frame (a runaway emitter must not flood the audio). */
export const MAX_CUES = 64;
/** vm.hist.freq: this many grid seconds of per-second frequency (3 min). */
export const HIST_FREQ_S = 180;
/** vm.hist station / demand columns: 5-min columns over the last 30 grid-min (L-1's past). */
export const HIST_COL_S = V.FC_STEP_S, HIST_COLS = 6;
/** The standing objective is recomputed at most this often (grid seconds; Q-63: objectiveDue). */
export const OBJECTIVE_EVERY_S = 30;
/** A line shown stays up at least this long (real ms), so it can be read. */
export const LINE_DWELL_MS = 4000;
/** A START is "now" this many real s of the profile sooner (ctx.leadS): to read, press twice. */
export const LINE_REACT_S = 13;
/** Q-63: ctx.leadS at grid second s: LINE_REACT_S real s of the profile, never past a night scenario's handover (the night shift's). */
export const readingLeadS = (s, hand, night) => Math.min(gridAfter(s, LINE_REACT_S, hand) - s, night ? Math.max(0, NIGHT_S - s) : Infinity);
export {BRIEF_LOCK, NIGHT_LOCK, isLock} from '../render/format.js'; // (Q-64, Q-73: the views read them there too)
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
/** D-7: HAND is offered from the second shift: once this browser has finished one. */
export const handOffered = game => (game.director.seen.shifts || 0) >= 1;
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
// Y-3: can this browser keep anything? (blocked or absent storage: the game plays and says "history off")
function storageWorks(storage) {
  try {
    if (!storage) return false;
    storage.setItem('gridwatch:v4:probe', '1');
    storage.removeItem('gridwatch:v4:probe');
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
  reducedEffects: false, crt: true, coach: null, plates: true});   // (O-8: coach true | false | null, null: on for a first shift only; O-3: plates)
const LEVEL_KEYS = ['volume', 'hum', 'fx', 'alarms'], BOOL_KEYS = ['muted', 'reducedEffects', 'crt', 'plates'];

// A stored object, cleaned: unknown keys dropped, bad values replaced by the defaults.
function cleanSettings(raw) {
  const s = Object.assign({}, SETTINGS_DEFAULT), r = raw && typeof raw === 'object' ? raw : {};
  for (const k of LEVEL_KEYS) if (typeof r[k] === 'number' && r[k] >= 0 && r[k] <= 1) s[k] = r[k];
  for (const k of BOOL_KEYS) if (typeof r[k] === 'boolean') s[k] = r[k];
  if (r.reducedMotion === true || r.reducedMotion === false) s.reducedMotion = r.reducedMotion;
  if (r.coach === true || r.coach === false) s.coach = r.coach;
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

/**
 * O-8 (Q-92): does the line coach (name the unit, the MW and the minute)? The plan bar's COACH choice once made
 * (remembered); before that, on a first shift only (no finished shift in this browser, D-7's count).
 */
export const coachOn = game => (game.settings.coach === null ? !(game.director.seen.shifts > 0) : game.settings.coach);

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

// C-2, Q-75: the scenario of the seed's date (W6, D-29: on an anniversary, its variant: content/anniversaries.js; on SA
// 2016's seed, S-7's first Hard day, its own)
export const scenarioForSeed = seed => ((seed >>> 0) === SA2016.seed ? SA2016_SCENARIO : SCENARIOS[dailyScenarioIdOf(ymdOf(seed))]);

/**
 * W6 (D-29): the anniversary that shapes this game's day (its date's, when it plays the date's variant; SA 2016 on its own
 * scenario, on any date), else null.
 */
export function anniversaryFor(game) {
  if (game.state.scenarioId === SA2016_SCENARIO.id) return SA2016;
  const ymd = ymdOf(game.seed), a = anniversaryOf(ymd);
  return a && game.state.scenarioId === dailyScenarioIdOf(ymd) ? a : null;
}

/**
 * W6 (D-29): the GUARD is still the one the night shift handed over at 04:00: above 0 (Loy Yang's day arms it,
 * content/anniversaries.js; every other day hands over none), and the player has not set the ring since. The watch, the
 * respond card and the moment name it as the night shift's then: YOUR GUARD is one the player set (K-16, X-40, D-21).
 */
export const nightGuard = state => state.battery.guardMW > 0 && !state.log.some(r => r.type === 'guard');

// The build stamp a daily list is gated under (Q-75).
export const dailyStamp = () => SIM_VERSION + '|' + scenarioHash(SCENARIOS.desk) + '|' + scenarioHash(SCENARIOS['desk-weekend']);

/**
 * W6 (D-29): what an anniversary's daily is made from, beyond the stamp (which hashes the desk scenarios only): {seed (its
 * listed seed), hash (its variant's scenarioHash)}, else null. tools/ladder.mjs keeps it with the date's row (LADDER.anniv).
 */
export function anniversaryStamp(ymd) {
  return anniversaryOf(ymd) ? {seed: dailyFor(ymd, dailyStamp()).seed, hash: scenarioHash(SCENARIOS[dailyScenarioIdOf(ymd)])} : null;
}

// Q-75: ?seed=N, ?date=YYYY-MM-DD, else today's daily (§32.5.3)
export function dailyFrom(search, date) {
  const q = new URLSearchParams(search || ''), n = Number(q.get('seed')), t = q.get('date'), st = dailyStamp();
  if (q.get('seed') && Number.isFinite(n)) {
    const s = n >>> 0, d = dailyFor(ymdOf(s), st);   // (the seed's scenario: SA 2016's is its own, S-7)
    return {seed: s, scenarioId: scenarioForSeed(s).id, ymd: d.ymd, gated: d.gated && d.seed === s};
  }
  return dailyFor(/^\d{4}-\d\d-\d\d$/.test(t) ? t : date || new Date(), st);
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
 *   daily (Q-75): dailyFrom's {seed, scenarioId, gated, ymd}, in place of seed.
 */
export function createGame(o) {
  const seed = (o.daily ? o.daily.seed : o.seed) >>> 0;
  const scenarioOf = typeof o.scenario === 'function' ? o.scenario : null;
  const scenario = scenarioOf ? scenarioOf(seed) : o.scenario || CLASSIC;
  const storage = o.storage === undefined ? null : o.storage;
  const seen = readJson(storage, SEEN_KEY) || {};
  const settings = cleanSettings(readJson(storage, SETTINGS_KEY));
  const game = {
    seed, daily: o.daily || null, scenario, scenarioOf, storage, sysMod: o.system || null, planview: o.planview || null,
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
    phase: 'briefing',
    ui: {focus: null, hover: null, hoverGlow: [], stackExpanded: false, previewOn: false, previewGuardMW: null, trayOpen: false,
      drawer: false, settingsOpen: false, consider: null, considerMs: null, armed: null,
      alarmsOpen: false, alarmsSel: null, alarmsPick: null}, // Q-46: the alarm panel, its tile, W's pick {id, untilMs}
    settings, systemReducedMotion: o.reducedMotion === undefined ? false : o.reducedMotion,
    suburbs: null,
    seenInit: {watch: !!seen.watch, ufls: !!seen.ufls, rocof: !!seen.rocof, rocofMax: seen.rocofMax > 0 ? +seen.rocofMax : 0, shed: !!seen.shed, shifts: Number.isInteger(seen.shifts) && seen.shifts > 0 ? seen.shifts : 0, // (D-7: shifts finished)
      marg: Object.fromEntries(MARG_FIRSTS.filter(k => seen.marg && seen.marg[k] === true).map(k => [k, true]))}, // (W7, Q-124: Marg's first-time lines said)
    cues: [], refusal: null, respond: null, respondGlow: [], feeder: null, feederWhy: null, offers: [], offered: {}, tally: null,
    previewCache: new Map(), previewS: -1, restoreCache: new Map(), restoreS: -1,
    hist: null, histView: null, histViewS: -1,
    hashes: [], lastFrameMs: -1, end: null,
    par: null, parOpt: o.par || false, parKey: '', households: 0, // Q-48: par's runner, for the day parKey names
    // W6 (Y-2, Y-3): the local date (Y-1), the official runs kept in this browser, and whether its storage works ("history off")
    today: Number.isInteger(o.today) ? o.today : HI.localYmd(new Date()), todayOf: typeof o.todayOf === 'function' ? o.todayOf : null,
    history: HI.readHistory(readJson(storage, HI.HISTORY_KEY)), historyOn: storageWorks(storage), run: null,
  };
  game.cueCtx = {suburbOf: id => suburbOf(game, id)};
  resetDay(game, game.seed);
  game.replay = null; game.resumeLost = false; game.resumeFailed = '';
  game.resumeSaved = resumable(game);   // (F-7: a saved run of this seed: the briefing offers RESUME AT hh:mm)
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

let runCount = 0;
/** In-page reset (C-3): a new day (the same seed by default) on the same game object. */
export function resetDay(game, seed) {
  if (seed !== undefined) game.seed = seed >>> 0;
  if (game.daily && game.daily.seed !== game.seed) game.daily = null; // another seed is not that daily (Q-75)
  if (game.scenarioOf) game.scenario = game.scenarioOf(game.seed);
  game.state = createState(game.seed, game.scenario);
  game.suburbs = null;
  game.objective = null; game.objectiveS = -1e9; game.objectiveMode = ''; game.objectiveHeld = null; game.consider = null;
  game.objectiveError = ''; game.dayAhead = null; game.considerDirty = false; game.lineMs = 0; game.lineFresh = false;
  game.unitModes = null;
  const seen = game.director ? game.director.seen : game.seenInit;
  game.director = D.createDirector({game: true, paused: true, seen, accepts: restoreAccepted});
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
  Object.assign(game.ui, {focus: null, hover: null, hoverGlow: [], stackExpanded: false, previewOn: false, previewGuardMW: null,
    trayOpen: false, consider: null, considerMs: null, armed: null, alarmsOpen: false, alarmsSel: null, alarmsPick: null, suburb: null, suburbLast: null});
  game.cues = []; game.refusal = null; game.respond = null; game.respondGlow = []; game.feeder = null; game.feederWhy = null;
  game.offers = []; game.offered = {}; game.tally = {n: 0, extra: 0, contN: -1};
  game.previewCache.clear(); game.previewS = -1; game.restoreCache.clear(); game.restoreS = -1;
  game.hist = createHist();
  game.histView = null; game.histViewS = -1;
  game.hashes = []; game.end = null; game.lastFrameMs = -1; game.playerInputs = 0;
  game.verdict = VD.createVerdictMem(); game.guardAt = {}; game.guardNight = {}; game.twin = null; game.verdictKey = ''; // (W3: the verdict's memory)
  game.acts = [];   // (F-7: the player's actions, for the save)
  game.noCoach = false;   // (O-8: set when the desk is taken)
  game.marg = null; game.margAct = -1; game.margWatched = false;   // (O-6: Marg's day, from the desk taken)
  game.plates = firstShift(game) && game.settings.plates ? new Set(PLATE_GROUPS) : new Set();   // (O-3: a first shift's cover plates)
  game.households = game.scenario.city.suburbs.reduce((a, s) => a + s.households, 0);
  // W6 (S-7, Y-2): a Hard day from the shelf is known by its seed: never gate-checked (par sheds on it)
  game.hard = hardDayOf(game.seed);
  if (game.hard && game.daily) game.daily = Object.assign({}, game.daily, {gated: null});
  // W6 (Y-2, Q-99): first, official or practice, fixed for the day from what storage holds now (another tab may have
  // played) and today's local date (a tab left open past midnight); an official run is marked at 09:00 (tickOnce)
  if (game.todayOf) game.today = game.todayOf();
  freshHistory(game);
  // (F-8: today's date past the calendar's end has no daily: practice, "No daily today")
  game.run = Object.assign(HI.statusOf(game.history, {ymd: dailyYmd(game), today: game.today, firstShift: firstShift(game), off: !game.historyOn,
    noDaily: noDaily(game)}),
    {started: false, claimed: false, id: game.seed + '-' + Date.now() + '-' + (++runCount)});   // (the id tells this tab's entry from another's)
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
  if (!c || game.cues.length >= MAX_CUES || game.replay) return;   // (F-7: a resume's replay is silent)
  if (typeof c === 'string' || (typeof c === 'object' && typeof c.name === 'string' && c.name)) game.cues.push(c);
}

// §13.2 ctx.suburbOf(districtId) -> the suburb code (the sound pans a district's clack by it).
function suburbOf(game, districtId) {
  if (!game.suburbs) game.suburbs = new Map(game.state.city.districts.map(d => [d.id, d.suburb]));
  return game.suburbs.get(districtId) || '';
}

// The cues a sim record asks for (Phase 1b, desk/README.md §13.2).
const recordCues = (game, r) => AM.cuesOfRecord(r, game.cueCtx) || EMPTY;

// K-15 (Q-97): the first directed shed's caption: how short the grid was before it (the BALANCE bar's gap now,
// plus the load the shed took off; to the 50 MW) and what the city desk shed.
function shedText(state, r) {
  const o = observe(state), short = Math.max(50, Math.round((Math.max(0, -imbalanceSegments(o.balance, o.battery).schedMW) + r.mw) / 50) * 50);
  return 'You are ' + short.toLocaleString('en-AU') + ' MW short: the city desk sheds ' + r.district + ', ' + Math.round(r.mw) + ' MW, to hold frequency.';
}

/** A step's (or an input's) records: traces, sounds, refusals, the tray; a card that rings ends FAST (Q-63). */
export function handleRecords(game, recs, by) {
  for (const r of recs) {
    if (r.kind === 'contingency') { // (D-21: the GUARD set at the trip; D-29: whether it was still the night shift's)
      const n = game.state.conts.length;
      startTrace(game.rec, game.state); game.guardAt[n] = game.state.battery.guardMW; game.guardNight[n] = nightGuard(game.state);
    }
    if (r.kind === 'shed' && r.why === 'directed' && game.phase === 'play') D.startShedWatch(game.director, game.state, shedText(game.state, r));
    let cues = EMPTY;
    try { cues = recordCues(game, r); } catch { cues = EMPTY; } // sound is optional (C-8): never stop the tick
    for (const c of cues) pushCue(game, c);
    if (r.kind === 'input' && !r.ok) {
      if (by) r.by = by;
      else game.refusal = {type: r.type, reason: r.reason, tick: r.tick};
    }
  }
  for (const c of T.trayRecords(game.tray, recs)) { if (c === 'ring2') D.endFast(game.director); pushCue(game, c); }
}

// D-27: would a restore of district i be accepted now (the permissive and its preview, as R's)
const restoreAccepted = (state, i) => grid.restorePermissive(state, i, {preview: true}) === '';

// D-27: each feeder a RESTORE at the card queued closes itself on the first tick past its allowed second
// (as the card would have held there), before the night shift has the desk; a close the permissive or its
// preview refuses leaves the queue, and that feeder's card holds once its lamp lights.
function closeQueued(game) {
  const d = game.director, state = game.state, q = D.queuedFeeders(d);
  if (!q.length) return;
  const ds = state.city.districts;
  for (const id of q) {
    const i = ds.findIndex(x => x.id === id), x = ds[i];
    if (!x || !x.dark || state.tick >= NIGHT_S * V.TICKS_PER_S) { D.unqueueFeeder(d, id); continue; }
    if (!(state.tick > restoreAllowedS(ds, i) * V.TICKS_PER_S)) continue;
    D.unqueueFeeder(d, id);
    const out = [];
    if (restoreAccepted(state, i) && applyInput(state, {type: 'restore', district: id}, out).ok) game.objectiveS = -1e9;
    if (out.length) handleRecords(game, out, '');
  }
}

// D-27: the feeders a RESTORE of `id` at the card would queue, each at the second it may close: the
// later of its hand-back and RESTORE_INTERVAL_S after the one before (the card's own now). D-26: a shed
// card's queue is the rest of its group (D.queueMates).
function queuePlan(game, obs, id) {
  const out = [];
  let prev = obs.s;
  for (const x of D.queueMates(game.director, obs.districts, id).sort((a, b) => a.clearS - b.clearS)) {
    prev = Math.max(x.clearS, prev + V.RESTORE_INTERVAL_S);
    out.push({id: x.id, atS: prev});
  }
  return out;
}

/** Run exactly one tick (the loop's tick callback). */
export function tickOnce(game) {
  const state = game.state;
  if (state.over) return;
  if (game.beforeTick) game.beforeTick(game);
  closeQueued(game);
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
  if (state.tick % TPS === 0) {
    if (game.run.status === 'official' && !game.run.started && state.tick >= HI.OFFICIAL_S * TPS) startOfficial(game);   // (W6, Q-99)
    if (!game.replay && game.phase === 'play' && state.tick % (RESUME_EVERY_S * TPS) === 0) saveResume(game);   // (F-7)
    histSecond(game);
    if (VD.verdictSecond(game.verdict, state, game.rec) && game.phase === 'play') pushCue(game, 'ramp'); // (L-10: a clean ramp)
  }
  if (state.tick % (TPS * V.S_PER_H) === 0) game.hashes.push(hashState(state));
}

/**
 * One animation frame of play (F-5): ticks only; the caller builds the vm and draws after.
 * @returns {number} ticks run
 */
export function frame(game, dtS, now) {
  if (game.replay) return 0;   // (F-7: the replay owns the ticks)
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

/** TAKE THE DESK: 04:00-04:30 runs headless, the briefing's items become tray cards (Q-81), the clock starts. AGC/HAND is the sim's mode (Q-64). */
export function takeDesk(game) {
  if (game.phase !== 'briefing') return false;
  act(game, ['t']);   // (F-7)
  runTo(game, V.PLAYER_START_TICK);
  for (const c of T.trayBriefing(game.tray, game.state.news)) pushCue(game, c);
  game.phase = 'play';
  game.noCoach = !coachOn(game);   // O-8: the end card's "no coach" (and W6's share card), while it stays off
  // O-6: Marg's day (a first shift's limit is MARG_FIRST lines), and her first line: the day's peak
  game.marg = createMarg(firstShift(game));
  margBeat(game, 'take', MARG_LINES.take(observe(game.state), weather.forecast(game.state, V.DAY_S - game.state.tick / TPS, V.FC_STEP_S)));
  game.director.paused = game.startPaused;
  game.director.held = game.ui.alarmsOpen; // Q-46: an alarm panel opened in the briefing holds the clock now
  game.resumeSaved = null;   // (F-7: this run replaces any saved one)
  saveResume(game);
  return true;
}

// ------------------------------------------------------------------ inputs (actions.input / redispatch)

/**
 * A sim input from the desk, the stack, the map or the keys, applied now (between ticks).
 * Any desk input dismisses the respond card first (K-16), and the feeder card (Q-91) but for the
 * restore of its own feeder: refused, that card stays with the reason (game.feederWhy). Returns ''
 * or the refusal reason. The briefing takes only AGC/HAND (Q-64) and the night roll none (Q-73):
 * BRIEF_LOCK, NIGHT_LOCK. `shown`: the feeder card the press was made at (redispatch's), else now's;
 * a card PAUSE, ALARMS or a hidden tab hides is not shown, so an input made under them leaves it.
 */
export function sendInput(game, x, shown) {
  const state = game.state, d = game.director;
  const lock = game.phase === 'briefing' ? (x && x.type === 'mode' ? '' : BRIEF_LOCK) : state.control.nightShift ? NIGHT_LOCK : '';
  if (lock) return lock;
  const fc = shown === undefined ? shownFeeder(game) : shown, own = !!fc && !!x && x.type === 'restore' && x.district === fc;
  // (fc: a card already showing, never one queued behind the respond card this input dismisses)
  if (!own) { D.dismissCard(d, state); if (fc) D.answerFeeder(d, state, fc, false); }
  const mates = own ? D.queueMates(d, state.city.districts, x.district) : null; // (D-26: read before the restore relights its group's first)
  const out = [];
  const r = applyInput(state, x, out);
  if (out.length) handleRecords(game, out, '');
  if (r.ok) {
    game.objectiveS = -1e9; game.lineFresh = true;
    game.refusal = null;
    game.previewS = -1; game.restoreS = -1;
    if (x.type === 'restore') D.focusRestore(d, state);
    if (own) D.queueFeeders(d, mates); // D-27: the card's RESTORE queues the morning's other feeders (D-26: the rest of its group)
    if (REDISPATCH_AFTER.includes(x.type)) redispatchAfter(game);
  } else if (own) game.feederWhy = {id: fc, why: r.reason};
  return r.ok ? '' : r.reason;
}

/** Q-91: the district id of the feeder card on the page now ('' unless the director's mode is FEEDER-CARD). */
export const shownFeeder = game => (D.modeOf(game.director, game.state).mode === 'FEEDER-CARD' ? D.feederCard(game.director, game.state) : '');

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
export function redispatch(game, shown) {
  if (game.phase === 'briefing') return BRIEF_LOCK;
  if (game.state.control.nightShift) return NIGHT_LOCK;
  if (!game.sysMod || !game.sys) return 'RE-DISPATCH needs the system operator' + (game.sysError ? ' (' + game.sysError + ')' : '');
  const fc = shown === undefined ? shownFeeder(game) : shown; // (Q-91: its inputs answer the card shown, never the next one; F-7: a replay's, as it was)
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
    const why = sendInput(game, x, fc);
    if (why) return why;
  }
  return '';
}

// ------------------------------------------------------------------ presentation (actions.ui)

const isTile = id => A.TILES.some(t => t.id === id);

function suburbCard(game, id) {
  const u = game.ui, ids = game.scenario.city.suburbs.map(s => s.id), of = t => ids.find(x => 'suburb-' + x === t);
  if (D.modeOf(game.director, game.state).locked) return 'The suburb card is back after the watch';
  if (id === undefined) id = (game.objective && game.objective.targets.map(of).find(Boolean)) || of(u.hover) || u.suburbLast || ids[0];
  if (id && !ids.includes(id)) return 'no such suburb';
  u.suburb = id;
  if (id) u.suburbLast = id;
  return '';
}
const SUB = /^suburb-/, cardFor = (game, t) => SUB.test(t) ? suburbCard(game, t === 'suburb-card' ? game.ui.suburb || undefined : t.slice(7)) : '';

/**
 * A presentation command (never a sim input). Returns '' (done) or why nothing happened. The
 * alarm panel's: alarms, alarmsSel, alarmsPick (a tile pressed while closed), alarmsGoto (Q-46, §30.3.3).
 * @param {{do:string}} cmd
 */
export function ui(game, cmd) {
  const d = game.director, state = game.state, u = game.ui, play = game.phase === 'play' && !state.over;
  const close = () => { u.alarmsOpen = false; u.alarmsSel = null; d.held = false; };
  switch (cmd && cmd.do) {
    case 'focus': if (u.alarmsOpen) return ui(game, {do: 'alarmsGoto', target: cmd.target}); if (!SUB.test(cmd.target)) u.focus = cmd.target || null; return cardFor(game, cmd.target);
    case 'suburb': {
      const id = 'id' in cmd ? cmd.id : u.suburb && !u.alarmsOpen ? null : undefined;
      if (u.alarmsOpen && !D.modeOf(d, state).locked) ui(game, {do: 'alarmsGoto', target: null});
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
      if (play && !D.respondCardOpen(d, state) && !D.feederCard(d, state)) d.paused = true; // (a waiting card holds the clock itself)
      if (cmd.target && !SUB.test(cmd.target)) u.focus = cmd.target;
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
    // Q-91: Esc at the feeder card goes on (the feeder stays dark and is not held again)
    case 'goOn': { const fc = D.feederCard(d, state); return fc && D.answerFeeder(d, state, fc, true) ? '' : 'no card'; }
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
      if (t !== u.consider) { u.consider = t; u.considerMs = null; game.considerDirty = true; }
      return '';
    }
    // vm.armed: a guard's cover up or down
    case 'armed': if (cmd.on) u.armed = cmd.target || null; else if (u.armed === cmd.target) u.armed = null; u.considerMs = null; game.considerDirty = true; return '';
    // Settings (K-22, §13.1, B-7): the popover never pauses the game.
    case 'mute': return setSetting(game, 'muted', !game.settings.muted);
    case 'doneBefore': return doneBefore(game);   // O-1
    case 'claim': return claimRun(game);   // W6 (Y-2): COUNT THIS ONE, a first shift's
    // O-8: COACH ON / OFF (remembered); the line follows at once; the day keeps "no coach" only while it stays off
    case 'coach': {
      game.settings.coach = !coachOn(game);
      writeJson(game.storage, SETTINGS_KEY, game.settings);
      if (game.settings.coach) game.noCoach = false;
      game.objectiveS = -1e9; game.lineFresh = true;
      return '';
    }
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

/** K-12, Q-78 (§32.4.8; the tally: §32.12 app/game.js): why the bay offers a unit reaching full speed now, or ''. */
export function offerWhy(obs, tally) {
  if (tally.n >= MAX_OFFERS || obs.s >= NIGHT_S) return '';
  if (obs.inRespond && obs.contingency.n !== tally.contN) return 'respond';
  return tally.extra ? '' : obs.sec.level !== 'SECURE' ? 'tight' : obs.s >= PEAK[0] && obs.s < PEAK[1] ? 'peak' : '';
}
/** Q-78: the tally once an offer for `why` (offerWhy's answer at obs) is made; pure, so par's proxy (Q-77) keeps it the same way. */
export function tallyOffer(tally, why, obs) {
  tally.n++;
  if (why === 'respond') tally.contN = obs.contingency.n; else tally.extra++;
  return tally;
}

// K-12 / A-4: which ready units the bay offers now; a new offer plays OFFER (app/director.js offerPace).
function updateOffers(game, obs) {
  const out = [], t = game.tally;
  for (const u of obs.units) {
    // One offer per ready period: the record lives while the unit waits at full speed.
    if (u.mode !== 'ready') { delete game.offered[u.id]; continue; }
    const rec = game.offered[u.id];
    // (none once the night shift has the desk, Q-78)
    if (rec) { if (!obs.nightShift) out.push({unit: u.id, why: rec.why}); continue; }
    const why = offerWhy(obs, t);
    if (!why) continue;
    tallyOffer(t, why, obs);
    game.offered[u.id] = {why, taken: false, tick: obs.tick};
    D.offerPace(game.director, game.state, u.id);
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
// (an action's control, its size or time aside)
const askOf = a => (a ? JSON.stringify(a, (k, v) => (k === 'mw' || k === 'atS' ? undefined : v)) : '');
/** Q-18: a held line against the fresh one: its words, never an action the fresh line no longer carries (§31.8). */
export const heldLine = (shown, next) => (shown.action && askOf(shown.action) !== askOf(next && next.action) ? Object.assign({}, shown, {action: null}) : shown);
// A new ask to act: at FAST it ends FAST, as an alarm does, and shows at once.
export const newAsk = (shown, next) => !!next && !!next.action && LEVELS.indexOf(next.level) > 1 && JSON.stringify(next.action) !== JSON.stringify(shown && shown.action);

/** Q-63: the objective line is due at grid second s in director mode `mode` ('news', true or false; buildVm and tests/lib/play.js). */
export function objectiveDue(game, s, mode) {
  if (game.objectiveMode !== mode && /WATCH|RESPOND|FEEDER|NIGHT|OVER/.test(mode + game.objectiveMode)) return 'news';
  return s - game.objectiveS >= Math.max(OBJECTIVE_EVERY_S, rateAt(s, D.handAt(game.state)) * V.OBJ_EVERY_REAL_S) || s < game.objectiveS;
}

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
/** X-42: a pointer resting on a guard (its cover down) shows "? IF PRESSED" this long, then the plan's line again. */
export const CONSIDER_REST_MS = 4000;

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
    game.respond = W.respondCard(obs, c, {glow: glow || W.fallbackGlow(obs, c), nightGuard: nightGuard(game.state)});
    game.respondGlow = game.respond.glow;
  }
  if (mode.mode !== 'RESPOND-CARD') game.respond = null;
  if (mode.mode !== 'RESPOND-CARD' && mode.mode !== 'RESPOND') game.respondGlow = [];
  // Q-91: the feeder card while it holds the clock; a refused restore's reason stays on it while that feeder's card is due
  const due = D.feederCard(d, state), why = game.feederWhy && game.feederWhy.id === due ? game.feederWhy.why : '';
  if (!why) game.feederWhy = null;
  // (before any press, the card says when its restore would be refused now: the bay's RESTORE PREVIEW, once a grid second)
  game.feeder = mode.mode === 'FEEDER-CARD' && due ? W.feederCard(obs, due, game.scenario.city.suburbs, why, why ? '' : restorePreview(game, due), queuePlan(game, obs, due)) : null;

  const offers = game.phase === 'play' ? updateOffers(game, obs) : [];
  const glow = new Set(game.respondGlow);
  for (const g of game.ui.hoverGlow) glow.add(g);
  // The standing objective (app/objective.js; Q-18): on objectiveDue's cadence, and at once when an
  // input lands (objectiveS is reset there). An exception in objective(), steady() or consequence()
  // blanks only its line; it is kept in objectiveError (vm.objectiveError; the ?debug handle shows
  // it) as the system operator's is in sysError.
  // (X-46: the night roll has no line, so no forecast or projection is made for one)
  if (game.phase === 'play' && game.commit === 'player' && game.planview && !obs.nightShift) {
    const due = objectiveDue(game, obs.s, mode.mode);
    if (due) {
      let fresh = game.lineFresh || due === 'news';
      game.objectiveS = obs.s; game.objectiveMode = mode.mode; game.lineFresh = false;
      game.objectiveError = '';
      let stage = 'objective';
      try {
        // dayAhead: the forecast to 04:00 (Phase 2a, C-10: the objective looks past the 4.5-h
        // window), the one weather.forecast call observe(state, {dayAhead: true}) would make; the
        // projection once per line (F-11: the objective and its STOP saving read the same one).
        game.dayAhead = weather.forecast(state, V.DAY_S - obs.s, V.FC_STEP_S);
        const proj = game.planview.project(obs);
        const next = objective(obs, {edited: heldByHand(game), planview: game.planview, proj, dayAhead: game.dayAhead, leadS: readingLeadS(obs.s, D.handAt(state), state.scn.night), held: game.objective, coach: coachOn(game)});
        // (steady: a waiting line whose deadline flips between two 5-minute marks is kept as it was said)
        stage = 'steady';
        game.objectiveHeld = steady(game.objectiveHeld, next, obs.s, D.handAt(state));
        const line = game.objectiveHeld.line, was = game.objective;
        if (mode.mode === 'FAST' && newAsk(was, line)) { D.endFast(d); fresh = true; }
        if (!holdLine(was, line, nowMs, game.lineMs, fresh)) {
          if (!was || !line || line.text !== was.text) game.lineMs = nowMs;
          game.objective = line;
        } else game.objective = heldLine(was, line);
      } catch (e) { game.objective = null; game.objectiveHeld = null; game.objectiveError = stage + ': ' + errText(e); }
      game.considerDirty = true;
    }
    // C-10 (§19.5): what the guard under the player's hand would do, on the same cadence and at once
    // when the target changes ('consider' marks it; only consequence() is recomputed then, on the
    // line's own day-ahead forecast) or an input lands. X-42: its figures are recomputed on that cadence
    // with its cover up too (a promise of "12 min from now" stays true while the clock runs on), and a
    // pointer resting on a guard gives the line back to the plan after CONSIDER_REST_MS.
    if (game.ui.consider && game.ui.considerMs === null) game.ui.considerMs = nowMs;
    if (game.considerDirty) {
      game.considerDirty = false;
      const t = game.ui.consider;
      game.consider = null;
      // (the night lock refuses the press: the line says so, never what it would do; Q-73)
      if (t && !mode.locked && obs.nightShift) game.consider = {target: t, text: NIGHT_LOCK, level: 'plan'};
      else if (t && !mode.locked) {
        try {
          if (!game.dayAhead) game.dayAhead = weather.forecast(state, V.DAY_S - obs.s, V.FC_STEP_S);
          game.consider = consequence(obs, t, {dayAhead: game.dayAhead, planview: game.planview});
        } catch (e) { game.consider = null; game.objectiveError = 'consequence: ' + errText(e); }
      }
    }
    const rested = game.ui.armed !== game.ui.consider && nowMs - game.ui.considerMs > CONSIDER_REST_MS;
    if (!game.ui.consider || mode.locked || rested) game.consider = null;
    if (game.objective && mode.mode !== 'WATCH') for (const g of game.objective.targets) glow.add(g);
  } else { game.objective = null; game.objectiveHeld = null; game.consider = null; }
  if (offers.length) glow.add('bay-sync');

  let watch = null;
  if (mode.mode === 'WATCH' && c) {
    const tr = traceOf(game.rec, c.n);
    if (tr) watch = W.watchView(game.watchMem, tr, c, state.tick, {rate: mode.rate, version: mode.watchVersion, guardMW: obs.battery.guardMW, nightGuard: nightGuard(state)});
  }
  // K-15 (Q-97): the first directed shed's compact watch: its stopwatch and its one sentence, no beats
  if (mode.mode === 'SHED-WATCH') watch = {n: -1, tS: mode.watchS, beat: '', beatIndex: -1, caption: D.shedWatchText(d, state), shed: true,
    stopwatch: W.stopwatch(mode.watchS, mode.rate), nadirHz: 0, rate: mode.rate, version: 'compact', rise: false};
  if (state.over && !game.end) {
    // Q-48: black is an F at once; par's ALL-IN is filled in place below, on the frame par has its score. F-8: a listed daily
    // is graded at once against its stored par (the same in every browser); any other day when the page's par has its score.
    const allIn = S.allIn(obs.score, game.households), stored = storedPar(game);
    game.end = {black: state.black, score: obs.score, hash: hashState(state), inputs: game.playerInputs, seed: game.seed, v: SIM_VERSION,
      allIn, parAllIn: null, stored, parDrift: 0,
      grade: state.black ? S.grade(allIn, null, true) : stored ? S.grade(allIn, {total: stored.total}, false, stored.shedMWh) : null,
      handFlown: !!state.control.handFlown, gated: game.daily ? game.daily.gated : null, // Q-64, Q-75 (null: not a daily)
      perfect: isPerfect(obs.score, state.black), noCoach: !!game.noCoach, // S-6; O-8
      // W6 (Y-4): what the share card reads: a first shift (as the desk was taken), the reserve diesel armed by the
      // player before the night shift (GLASS BROKEN), where the day ended (a black day's later blocks), the lowest Hz
      firstShift: game.marg ? !!game.marg.first : firstShift(game),
      glassBroken: state.log.some(r => r.type === 'armRERT' && r.tick < NIGHT_S * TPS), endS: Math.floor(state.tick / TPS),
      lowHz: obs.score.minHz, spark: obs.score.spark.slice(),
      // W6 (D-28, Q-109): the next dailies from the date the day ends on (a shift played past midnight looks from the new date),
      // whatever day was played
      week: weekAhead(game.todayOf ? game.todayOf() : game.today, dailyStamp())};
    // D-7: a finished shift, kept with the other seen flags (HAND is offered from the second)
    if (game.phase === 'play') { game.director.seen.shifts = (game.director.seen.shifts || 0) + 1; saveSeen(game); }
    recordRun(game);   // (W6, Y-3: an official run is finished, with its grade: F-8's stored par is there at once)
    if (!game.replay) clearResume(game);   // (F-7: nothing left to resume)
  }
  const par = game.par, end = game.end; // (a par day that went black gives no grade)
  if (end && !end.parAllIn && par && par.done && par.score && !par.black) {
    end.parAllIn = S.allIn(par.score, game.households);
    // F-8: the stored par keeps the grade; the page's own par differs from it only on an engine whose arithmetic drifts
    if (end.stored) end.parDrift = Math.round(end.parAllIn.total) - end.stored.total;
    else end.grade = S.grade(end.allIn, end.parAllIn, end.black, S.parShedMWh(par.score)); // (S-7: a Hard day when par shed)
  }
  if (end) verdictFor(game);
  margFrame(game, obs, mode);
  platesFrame(game, mode);
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
    previewGuardMW: game.ui.previewGuardMW, offers, respond: game.respond, feeder: game.feeder, glow, hist: histView(game),
    settings: settingsView(game),
    // Shell additions (desk/README.md §5 plus): what the overlays and audio read. cues: this
    // frame's sounds, each a name or {name, pan?, gain?, delayS?} (§13.2).
    phase: game.replay ? 'briefing' : game.phase, watch, needleHz: needleF(game.rec, mode.rate, game.pacer.alpha), cues, refusal,
    trayOpen: game.ui.trayOpen, drawer: game.ui.drawer, settingsOpen: game.ui.settingsOpen, end: game.end, seed: game.seed,
    sysError: game.sysError, objective: game.objective, commit: game.commit, objectiveError: game.objectiveError,
    // C-10 (§19.5): {target, text, level} for the guard being hovered, focused or lifted, or null;
    // the shell shows it in #objective with the word '? IF PRESSED', in place of the objective.
    consider: game.consider,
    // the guard with its cover up, or null (none under the night lock: no press to confirm, Q-73); levers held by hand
    armed: obs.nightShift ? null : game.ui.armed, held: game.commit === 'player' && heldByHand(game),
    alarmsOpen: game.ui.alarmsOpen, alarmsSel: game.ui.alarmsSel, // Q-46 (alarmsSel: null while closed)
    plates: [...game.plates], firstShift: firstShift(game) && game.settings.plates,   // O-3, O-1
    suburb: game.ui.suburb, dayAhead: game.dayAhead,
  };
}

// ------------------------------------------------------------------ O-6: Marg

/** O-1, O-3: a first shift: no finished shift in this browser (D-7's count). */
export const firstShift = game => !(game.director.seen.shifts > 0);
/** O-3 (Q-101): the groups a first shift's plates cover (desk/desk.js plateGroup names a control's). */
export const PLATE_GROUPS = Object.freeze(['start', 'stop', 'guard', 'battery', 'tie', 'restore', 'dr', 'rert', 'shed']);
// O-3: the line's first ask for a control lifts its group's plate (never in a watch), with Marg's line for it (O-6)
function platesFrame(game, mode) {
  if (!game.plates.size || game.phase !== 'play' || mode.mode === 'WATCH' || !game.objective) return;
  for (const t of game.objective.targets || []) {
    const g = plateGroup(t);
    if (!g || !game.plates.has(g)) continue;
    game.plates.delete(g);
    margBeat(game, 'ask:' + g, MARG_LINES.ask(g), t);
  }
}
/** O-1: I'VE DONE THIS BEFORE: the coach and the plates off, remembered. */
export function doneBefore(game) {
  game.settings.coach = false; game.settings.plates = false;
  writeJson(game.storage, SETTINGS_KEY, game.settings);
  game.plates.clear();
  if (game.phase === 'briefing') game.noCoach = true;
  game.objectiveS = -1e9; game.lineFresh = true;
  return '';
}

/** O-6: Marg says the text at its key's beat (app/marg.js: once, within the day's limit less `reserve`), as a tray card. */
export function margBeat(game, key, text, target, reserve = 0) {
  if (!game.marg) return null;
  const line = margSay(game.marg, key, text, Math.floor(game.state.tick / TPS), target, reserve);
  if (line) for (const c of T.trayMarg(game.tray, line, MARG_FROM)) pushCue(game, c);
  return line;
}
// Once a frame in play: the act changes, the first watch's settle (a first shift's), the 21:00 handover. Never in a resume's
// replay (F-7: it is silent; her day comes back from the save, and a first-time line said there would be kept as seen).
function margFrame(game, obs, mode) {
  if (!game.marg || game.replay || game.phase !== 'play' || obs.over) return;
  if (mode.act !== game.margAct) {
    const was = game.margAct;
    game.margAct = mode.act;
    if (was >= 0 && (mode.act === 2 || mode.act === 3)) margBeat(game, 'act' + mode.act, MARG_LINES['act' + mode.act](obs, game.dayAhead || obs.forecast));
  }
  const st = game.state, c = st.contIdx >= 0 ? st.conts[st.contIdx] : null;
  if (game.marg.first && !game.margWatched && c && st.tick >= c.watchEndTick && mode.mode !== 'WATCH') {
    game.margWatched = true;
    margBeat(game, 'watch', MARG_LINES.watch(c), 'dial-freq');
  }
  if (obs.nightShift) margBeat(game, 'handover', MARG_LINES.handover());
  // W7 (Q-124): a first-time line, kept in the seen memory once said (with storage blocked, in the page's memory: once a day
  // at most). One a frame: the next waits for room on the tray, so she never sends her own card to the LOG unseen.
  for (const k of margFirsts(game, mode.mode)) {
    const text = MARG_LINES[k](obs, game.dayAhead, game.verdict), room = text && lessonRoom(game, k);
    if (!room) continue;
    if (room !== true) T.dismissCard(game.tray, room.id);   // (a shed's warning, to the LOG: her relays line is in its place)
    if (!margBeat(game, 'first:' + k, text, FIRST_TARGET[k], beatsAhead(game.marg, game.margAct, game.margWatched))) continue;
    game.director.seen.marg = Object.assign({}, game.director.seen.marg, {[k]: true});
    saveSeen(game);
    break;
  }
}
// W7 (Q-124 review): a city desk's warning, which is always a shed (app/tray.js cardOf: the relays' 'ufls', a directed
// 'shed', DIRECTED_SHED)
const shedCard = c => c.sev === 'warn' && c.from === T.SENDERS.city;
/**
 * W7 (Q-124 review): where first-time line `k` would show on the tray now: true for a free place, or when the information
 * card that gives way to hers (app/tray.js trayMarg: the oldest) is not one of her own (another lesson, or a fixed beat
 * said this frame or just before: she never talks over herself). With MAX_CARDS warnings hers would go straight to the
 * LOG, so it waits; but the relays' line takes the place of the city desk's oldest warning, a shed (the relays' or a
 * directed one: the districts her line is about), which goes to the LOG: that card. Else null (it waits). The sheds' own
 * warnings keep the tray full while the city sheds: they held her line back for hours of grid time, past the next trip.
 */
function lessonRoom(game, k) {
  const cards = game.tray.cards;
  if (cards.length < T.MAX_CARDS) return true;
  const out = cards.find(c => c.sev === 'info');
  if (out) return out.from === MARG_FROM ? null : true;
  return (k === 'relays' && cards.find(shedCard)) || null;
}
/**
 * W7 (Q-124): the first-time lines Marg would say now (app/marg.js firstsNow's keys this browser has not met yet, not said
 * today): none in a resume's replay (F-7), in a watch, once the night shift has the desk, without room on the tray
 * (lessonRoom: three warnings, bar the relays' line and a shed's warning; or a card of hers that would give way), or with
 * no room left beside the fixed beats to come. Cheap: tests/lib/play.js asks it between frames, so a jump draws the frame
 * that says one.
 */
export function margFirsts(game, mode) {
  const m = game.marg, st = game.state;
  if (!m || game.replay || game.phase !== 'play' || st.over || mode === 'WATCH' || mode === 'SHED-WATCH' || st.control.nightShift) return [];
  if (m.said.length + beatsAhead(m, game.margAct, game.margWatched) >= (m.first ? MARG_FIRST : MARG_LATER)) return [];
  const seen = game.director.seen.marg || {};
  return firstsNow(st, game.verdict).filter(k => !seen[k] && !m.beats['first:' + k] && lessonRoom(game, k));
}

// ------------------------------------------------------------------ W3: the verdict

/**
 * W3 (D-20, D-21, D-24, L-10, P-1, H-11): game.end.verdict, the day in words (app/verdict.js), rebuilt when par or
 * the no-GUARD twin arrives. The moment's twin (D-21) is made here once, when a GUARD was set at its trip, and played
 * by the shell's frames after the day (game.twin.step).
 */
function verdictFor(game) {
  const end = game.end, st = game.state, par = game.par, mem = game.verdict;
  const nightS = st.scn.night ? NIGHT_S : Infinity, conts = st.conts.filter(c => c.startTick / TPS < nightS);
  if (end.twinFor === undefined) {
    const m = VD.moment(mem, conts, {nightS}), c = m && m.cont;
    end.twinFor = c && c.lostMW > 0 && game.guardAt[c.n] > 0 ? c.n : -1;
    if (end.twinFor > 0) game.twin = VD.createTwin(game.seed, game.scenario, st.log.slice(), c);
  }
  const twin = game.twin, key = (par ? (par.done ? 'p' : 'c') : '-') + (twin ? (twin.done ? 't' : 'w') : '-');
  if (key === game.verdictKey && end.verdict) return;
  game.verdictKey = key;
  const parScore = par && par.done && par.score && !par.black ? par.score : null;
  const pm = parScore && par.minutes && par.minutes.length ? s => parMinute(par, s) : null;
  const first = VD.moment(mem, conts, {nightS}), fc = first && first.cont;
  const m = first && VD.moment(mem, conts, {nightS, parMinute: pm, twin, guardMW: fc ? game.guardAt[fc.n] : undefined, nightGuard: !!fc && !!game.guardNight[fc.n]});
  end.verdict = {
    lights: VD.lightsRow(mem, end.score, parScore).text,
    cost: VD.costRow(end.allIn, end.parAllIn), carbon: VD.carbonRow(end.allIn, end.parAllIn),
    moment: m, card: VD.historyCard(mem, conts, end.black), strip: VD.strip(mem),
    demand: VD.demandLine(mem), trips: VD.tripsLine(conts),
  };
  end.ladder = ladderFor(game, end.grade);   // (W6, Y-11)
  // W6 (Y-4, Y-7): the share card, once par has settled (its score, or none) or the grid went black; Y-3: the run's grade
  end.share = !end.black && par && !par.done ? null : shareFor(game, end);
  if (end.share) recordRun(game);
  // O-6: her closing line, once the share card is made (said once; kept on the verdict after): Y-7's line, the card's quote.
  // (F-8: a stored par grades before the page's par settles; she waits for the card, so the card still quotes her)
  const said = game.marg && game.marg.said.find(l => l.key === 'verdict');
  const closing = said || (game.marg && end.share ? margSay(game.marg, 'verdict', MARG_LINES.verdict(end.grade, end.share.closing), Math.floor(st.tick / TPS)) : null);
  end.verdict.marg = closing ? closing.text : '';
}

/** Y-11: GRIDWATCH's own players on the ladder (content/ladder.js, tools/ladder.mjs). */
export const LADDER_NAMES = Object.freeze(['did nothing', 'a scripted shift']);
/**
 * Y-11 (Q-108): where the player sits among GRIDWATCH's own players on this daily: [[name, points, you?], ...] lowest first,
 * with par (1000) and YOU in their places. The list's ALL-IN totals are graded here as the player is (app/score.js grade, S-7
 * with par's shed): did nothing, and the better of the lean and competent scripts as one "scripted shift" (either script
 * collapses on some days, and a row named "competent" below "lean" would say something false). null off the calendar,
 * before the grade, or with a stale list (another build's).
 */
export function ladderFor(game, g, list = LADDER) {
  const row = listedRow(game, list);
  if (!row || !g) return null;
  const [parT, shed, nothing, lean, competent] = row, par = {total: parT};
  const pts = t => (t < 0 ? 0 : (S.grade({total: t}, par, false, shed) || {points: NaN}).points);
  const out = [[LADDER_NAMES[0], pts(nothing)], [LADDER_NAMES[1], Math.max(pts(lean), pts(competent))], ['par', 1000], ['YOU', g.points, true]];
  return out.filter(x => Number.isFinite(x[1])).sort((a, b) => a[1] - b[1] || (a[2] ? 1 : b[2] ? -1 : 0));
}

// This daily's row in content/ladder.js (this build's list), else null: off the calendar, a Hard day or another seed; on an
// anniversary (D-29), a row made from another seed or variant than today's (the list's anniv: stale, as another build's list is)
function listedRow(game, list) {
  const ymd = dailyYmd(game);
  if (!ymd || list.v !== dailyStamp() || !list.rows) return null;
  const an = anniversaryStamp(ymd), made = an && list.anniv ? list.anniv[ymd] : null;
  return !an || (made && made.seed === an.seed && made.hash === an.hash) ? list.rows[ymd] || null : null;
}

/**
 * F-8 (risk 5): par's stored end on this daily, {total (ALL-IN $), shedMWh}, from content/ladder.js (tools/ladder.mjs runs the
 * same AP.runPar the page re-runs, under this build's stamp). The grade is made from it, so it is the same in every browser
 * and is there the moment the day ends; the page's own par only fills THE NUMBERS and the debrief. null off the calendar, on
 * a Hard day or another seed, or with a stale list (the page's par grades then, as before).
 */
export function storedPar(game, list = LADDER) {
  const row = listedRow(game, list);
  return row && row[0] > 0 ? {total: row[0], shedMWh: row[1]} : null;
}

// F-8: the dailies' calendar ends here (content/dailies.js `to`)
const TO_YMD = +DAILIES.to.replace(/-/g, '');
/** F-8: today's date is past the dailies' calendar: there is no daily today ("No daily today": practice, no number). */
export function noDaily(game) { const ymd = dailyYmd(game); return !!ymd && ymd === game.today && ymd > TO_YMD; }
/** Y-1, F-8: a date's daily number ("Daily #5"), none before the launch or past the calendar's end. */
export const dailyNumber = ymd => (ymd && ymd <= TO_YMD ? SH.puzzleNumber(ymd) : null);

/** Y-1: the date of the daily this game plays (its date's listed seed), else null (another seed is not that daily). */
export function dailyYmd(game) {
  const d = game.daily;
  return d && SH.shortDate(d.ymd) && dailyFor(d.ymd, dailyStamp()).seed === game.seed ? d.ymd : null;
}

/** W6 (Y-4, Y-7): the share card of a finished day: shareCard's {text, lines} with {bucket, closing, n, ymd, tags}. */
export function shareFor(game, end) {
  const ymd = dailyYmd(game), you = end.black ? null : end.allIn, par = end.parAllIn, g = end.grade;
  const bucket = SH.bucketOf({black: end.black, you, par, lowHz: end.lowHz}), closing = SH.closingLine(ymd || game.seed, bucket);
  // (the coach is the exception that is tagged: a first shift coaches unless switched off, a later one is off unless switched
  // on, O-8; so NO COACH on a first shift and COACHED on a later one, where O-8's text has NO COACH on every later card)
  // (PRACTICE on any run that does not count: an unclaimed first shift, a run that ended before 09:00, a practice run)
  // (D-29: ANNIVERSARY first, so a long card drops it last; the incident's name stays off the card, as every event does;
  // SA 2016 is a Hard day, played on any date: HARD DAY, no ANNIVERSARY)
  const tags = [anniversaryFor(game) && !game.hard && 'ANNIVERSARY', end.firstShift && 'FIRST SHIFT', !official(game) && 'PRACTICE', end.handFlown && 'HAND-FLOWN',
    end.firstShift ? end.noCoach && 'NO COACH' : !end.noCoach && 'COACHED', end.glassBroken && 'GLASS BROKEN', g && g.hardMWh && 'HARD DAY'].filter(Boolean);
  const n = dailyNumber(ymd);
  const card = SH.shareCard({ymd, n, seed: game.seed, name: game.hard ? 'Hard day ' + game.hard : '', grade: g, perfect: end.perfect, black: end.black, lowHz: end.lowHz, spark: end.spark,
    endS: end.endS, you, par, tags, closing});
  return Object.assign(card, {bucket, closing, n, ymd, tags});
}

// ------------------------------------------------------------------ W6: official runs, history, streaks (Y-2, Y-3)

const saveHistory = game => writeJson(game.storage, HI.HISTORY_KEY, game.history);
const official = game => (game.run.status === 'official' && game.run.started) || game.run.claimed;
// The stored history as it is now (another tab writes it too); kept in memory only when storage is blocked
function freshHistory(game) {
  if (game.historyOn) game.history = HI.readHistory(readJson(game.storage, HI.HISTORY_KEY));
  return game.history;
}
// Another run (another tab) has the date: this run is practice beside it, and writes nothing
function yieldTo(game) {
  Object.assign(game.run, {status: 'practice', why: 'done', started: false, claimed: false});
  game.verdictKey = '';
}

// Q-99: the grid clock passed 09:00 on today's daily with no entry for it: this is the date's official run. The entry is
// a DNF until the day ends, so closing the tab after 09:00 leaves one.
function startOfficial(game) {
  const ymd = dailyYmd(game), e = freshHistory(game).days[ymd];
  if (e && e.id !== game.run.id) return yieldTo(game);
  game.run.started = true;
  if (e) return;   // (F-7: a resumed run passing 09:00 again: the entry is already its own)
  HI.record(game.history, ymd, {n: SH.puzzleNumber(ymd), v: SIM_VERSION, id: game.run.id, dnf: true, firstShift: false, hand: game.state.control.mode === 'HAND'});
  saveHistory(game);
}

// ------------------------------------------------------------------ W6: resume (F-7)
//
// The day is deterministic from its seed and what the player did, so a save is the player's actions, not the state: each
// desk input with the feeder card it answered (sendInput's `shown`), each RE-DISPATCH, the presses that answer the cards
// (dismissRespond, goOn, skipWatch) and TAKE THE DESK, each at its tick (game.acts). RESUME replays them through the same
// functions, at the same ticks, with the system and the queued restores running as in play: the system's plans, the
// director's memory of cards and feeders and the end card's counts all come back by themselves, and the state's hash at the
// saved tick proves it (a mismatch gives a fresh day, said so). What frames alone keep (the plates lifted, Marg's day, the
// K-12 offers) is saved beside the actions. Two slots, so a practice run never overwrites today's official or first shift.

/** F-7: the saved runs: today's daily (official or a first shift), and practice. */
export const RESUME_KEY = 'gridwatch:v4:resume', RESUME_SLOTS = Object.freeze(['daily', 'practice']);
/** F-7: in play the run is saved this often (grid s), at each action of the player's, and when the tab is hidden or closed. */
export const RESUME_EVERY_S = 15 * V.S_PER_MIN;
/** F-7: the presses (actions.ui) that change what a later tick does: the cards' answers. */
export const REPLAY_UI = Object.freeze(['dismissRespond', 'goOn', 'skipWatch']);
const slotOf = game => RESUME_KEY + ':' + (game.run.status === 'practice' ? 'practice' : 'daily');

// F-7: an action of the player's, kept for the save (not while resuming: the replay is making them again)
function act(game, a) { if (!game.replay) game.acts.push([game.state.tick, ...a]); }

/** F-7: save the run in progress (from TAKE THE DESK until the day ends); a write that fails drops the slot, never leaving an older save. */
export function saveResume(game) {
  const st = game.state, r = game.run;
  if (game.phase !== 'play' || st.over || game.replay || !game.historyOn) return false;
  // (the lease: an official run whose date's entry another tab has taken is practice now, and never writes the daily slot)
  const ymd = dailyYmd(game), e = ymd && (r.started || r.claimed) ? freshHistory(game).days[ymd] : null;
  if (e && e.id !== r.id) yieldTo(game);
  const key = slotOf(game), other = RESUME_KEY + ':' + (key.endsWith(':daily') ? 'practice' : 'daily'), ok = writeJson(game.storage, key, {v: 2, sim: SIM_VERSION, seed: game.seed, today: game.today, tick: st.tick,
    hash: hashState(st), acts: game.acts, run: {status: r.status, why: r.why, id: r.id, started: r.started, claimed: r.claimed},
    noCoach: !!game.noCoach, plates: [...game.plates], marg: game.marg ? {said: game.marg.said, beats: game.marg.beats, watched: game.margWatched} : null,
    tally: game.tally, offered: game.offered});
  if (!ok) { try { game.storage.removeItem(key); } catch { /* (blocked) */ } }
  const o = readJson(game.storage, other);   // (this run's save in the other slot, from before it turned practice, goes)
  if (o && o.seed === game.seed && o.run && o.run.id === r.id) { try { game.storage.removeItem(other); } catch { /* (blocked) */ } }
  return ok;
}
/**
 * F-7: forget a saved run of this seed (the day ended, START OVER, or a replay that failed): the one offered, else this run's
 * (`id`); another run's save of the same seed (a practice beside the official run) stays.
 */
export function clearResume(game, id = game.resumeSaved && game.resumeSaved.run ? game.resumeSaved.run.id : game.run.id) {
  for (const s of RESUME_SLOTS) {
    const k = RESUME_KEY + ':' + s, r = readJson(game.storage, k);
    if (r && r.seed === game.seed && (!r.run || r.run.id === id)) { try { game.storage.removeItem(k); } catch { /* (blocked) */ } }
  }
  game.resumeSaved = null;
}

// F-7: at boot, this seed's saved run, if any (one saved by another build cannot replay: dropped, game.resumeLost). Its
// status comes back with it only when it was saved today and the date's entry, if any, is its own; a run saved on
// another day is practice now (it can never write a date's entry).
function resumable(game) {
  let r = null;
  for (const s of RESUME_SLOTS) {
    const x = readJson(game.storage, RESUME_KEY + ':' + s);
    if (x && x.seed === game.seed) { r = x; break; }
  }
  if (!r || r.v !== 2 || !Array.isArray(r.acts) || !(r.tick > 0)) return null;
  if (r.sim !== SIM_VERSION) { clearResume(game, r.run && r.run.id); game.resumeLost = true; return null; }
  const e = game.history.days[dailyYmd(game)], s = r.run;
  if (s && r.today === game.today && (!e || e.id === s.id || s.status !== 'official')) Object.assign(game.run, s);
  else if (r.today !== game.today) Object.assign(game.run, {status: 'practice', why: s && s.status === 'practice' ? s.why : 'past', started: false, claimed: false});
  return r;
}

/**
 * W6 (Y-2): play another day from the practice shelf, in the page (C-3): `daily` is dailyFrom's for a past date, or a Hard
 * day's {seed, scenarioId, ymd, gated: null}. A fresh briefing; its saved run, if any, is offered (RESUME AT hh:mm).
 */
export function switchDay(game, daily) {
  if (game.replay || !daily || (game.phase === 'play' && !game.state.over)) return false;   // (never partway through a day)
  game.daily = daily;
  resetDay(game, daily.seed);
  game.resumeLost = false; game.resumeFailed = '';
  game.resumeSaved = resumable(game);
  return true;
}

/** F-7: RESUME AT hh:mm: replay the saved actions from 04:00 (resumeStep runs them, a slice a frame). */
export function resumeBegin(game) {
  const r = game.resumeSaved;
  if (!r || game.phase !== 'briefing' || game.replay) return false;
  const run = Object.assign({}, game.run);
  resetDay(game);
  Object.assign(game.run, run);
  game.resumeSaved = r;
  game.replay = {acts: r.acts, k: 0, until: r.tick, saved: r};
  return true;
}

// F-7: one saved action, through the function that made it
function replayAct(game, a) {
  const [, kind, x, shown] = a;
  if (kind === 't') takeDesk(game);
  else if (kind === 'i') { if (!sendInput(game, x, shown)) game.playerInputs++; }
  else if (kind === 'r') { if (!redispatch(game, shown)) game.playerInputs++; }
  else if (kind === 'u' && REPLAY_UI.includes(x.do)) ui(game, x);
}

/**
 * F-7: run the resume's replay for at most budgetMs (real ms, `now` a ms clock): ticks to each saved action, the action,
 * on to the saved tick. Every tick runs through tickOnce, so the recorder, the verdict's memory and the alarms are rebuilt
 * as in play. At the saved tick the state's hash must be the saved one; then the desk opens there, held.
 * @returns {number} progress 0..1 (1: resumed, or given up: game.resumeFailed says why and the day starts fresh)
 */
export function resumeStep(game, budgetMs = Infinity, now = () => Date.now()) {
  const R = game.replay, st = game.state;
  if (!R) return 1;
  const t0 = now();
  for (;;) {
    while (R.k < R.acts.length && R.acts[R.k][0] <= st.tick) replayAct(game, R.acts[R.k++]);
    const next = R.k < R.acts.length ? R.acts[R.k][0] : R.until;
    if (st.over || (R.k >= R.acts.length && st.tick >= R.until)) break;
    if (st.tick >= next) { R.failed = 'an action after the saved moment'; break; }
    tickOnce(game);
    if (st.tick % 256 === 0 && now() - t0 > budgetMs) return Math.min(0.99, st.tick / Math.max(1, R.until));
  }
  const s = R.saved, failed = R.failed || (st.over ? 'the saved day ended early' : st.tick !== s.tick || hashState(st) !== s.hash ? 'the replay did not match' : '');
  game.replay = null; game.resumeSaved = null;
  game.cues = [];   // (nothing the replay heard is played)
  if (failed) {
    game.resumeFailed = failed;
    clearResume(game, s.run && s.run.id);
    resetDay(game);
    return 1;
  }
  game.acts = R.acts.slice();   // (the next save holds the whole day's actions, so it resumes again)
  // what frames alone kept: the plates still covered, Marg's day, the K-12 offers; the coach as it stood
  game.noCoach = !!s.noCoach;
  if (Array.isArray(s.plates)) game.plates = new Set(s.plates.filter(g => PLATE_GROUPS.includes(g)));
  if (s.marg && game.marg) { game.marg.said = s.marg.said || []; game.marg.beats = s.marg.beats || {}; game.margWatched = !!s.marg.watched; }
  if (s.tally) game.tally = s.tally;
  if (s.offered) game.offered = s.offered;
  game.margAct = -1;
  // a new lease on the run: an older copy of it still open in another tab now finds the date's entry not its own (yieldTo)
  const old = game.run.id, ymd = dailyYmd(game);
  game.run.id = game.seed + '-' + Date.now() + '-' + (++runCount);
  const e = ymd && freshHistory(game).days[ymd];
  if (e && e.id === old) { e.id = game.run.id; saveHistory(game); }
  clearResume(game, s.run ? s.run.id : old);   // (the save just resumed, in whichever slot: the next save is the new lease's)
  game.director.paused = true;
  game.objectiveS = -1e9; game.lineFresh = true;
  saveResume(game);
  return 1;
}

/** Y-3: write the finished official run's entry (again when the grade arrives; a claimed first shift's too). */
export function recordRun(game) {
  const end = game.end, ymd = dailyYmd(game);
  if (!end || !ymd || !official(game)) return;
  const was = freshHistory(game).days[ymd];
  if (was && was.id !== game.run.id) return yieldTo(game);   // (another tab's run took the date)
  const g = end.grade;
  HI.record(game.history, ymd, {n: SH.puzzleNumber(ymd), v: SIM_VERSION, id: game.run.id, dnf: false, firstShift: !!end.firstShift, hand: !!end.handFlown,
    points: g ? g.points : null, letter: g ? g.letter : null, star: !!(g && g.star), perfect: !!end.perfect, lowHz: end.lowHz,
    darkMWh: end.allIn ? end.allIn.outage / V.VCR : null});
  saveHistory(game);
}

/** Y-2 (Q-99): COUNT THIS ONE: a first shift on today's daily, claimed at its end, becomes the date's official run. */
export function claimRun(game) {
  const r = game.run, ymd = dailyYmd(game);
  if (r.status !== 'first' || r.claimed) return 'only a first shift on today\'s daily can be counted';
  if (!game.end) return 'count it when the day is over';
  if (freshHistory(game).days[ymd]) { yieldTo(game); return 'today already has its official run'; }
  r.claimed = true;
  recordRun(game);
  game.verdictKey = '';   // (the share card loses no tag but is rebuilt with the run's status)
  return '';
}

/**
 * Y-2, Y-3: what the briefing and the end card say of the run: {status, why, started, claimed, claimable, historyOn, n, entry (today's
 * official run, when this run is practice beside it), streak, best, played}.
 */
export function runView(game) {
  const r = game.run, ymd = dailyYmd(game), st = HI.streaks(game.history, game.today);
  return {status: r.status, why: r.why, hard: game.hard, started: r.started, claimed: r.claimed, claimable: r.status === 'first' && !r.claimed && !!game.end && game.historyOn,
    historyOn: game.historyOn, n: dailyNumber(ymd), entry: r.why === 'done' ? game.history.days[ymd] || null : null,
    streak: st.streak, best: st.best, played: st.played};
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
    // (X-45: the end card counts the player's accepted inputs, a RE-DISPATCH as one; never the system's or the night shift's)
    // (F-7: each action is kept for the save, with the feeder card it answered, and saves the run; none while resuming)
    input: x => {
      if (game.replay) return RESUMING;
      if (game.resumeSaved) return RESUME_LOCK;
      const shown = shownFeeder(game);
      act(game, ['i', Object.assign({}, x), shown]);
      const r = sendInput(game, x, shown);
      if (!r) game.playerInputs++;
      saveResume(game);
      return r;
    },
    redispatch: () => {
      if (game.replay) return RESUMING;
      const shown = shownFeeder(game);
      act(game, ['r', null, shown]);
      const r = redispatch(game, shown);
      if (!r) game.playerInputs++;
      saveResume(game);
      return r;
    },
    ui: cmd => { if (game.replay && cmd && REPLAY_UI.includes(cmd.do)) return RESUMING; if (cmd && REPLAY_UI.includes(cmd.do)) act(game, ['u', Object.assign({}, cmd)]); return ui(game, cmd); },
    previewTrip: opts => previewTrip(game, opts),
    restorePreview: id => restorePreview(game, id),
  };
}

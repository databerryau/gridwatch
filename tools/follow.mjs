// GRIDWATCH: the hint-following player over a seed range (SPEC §9.1 Q-18; desk/README.md §21.3,
// §21.4). A command-line wrapper of tests/lib/follow.js followDay, so the tool and
// tests/objective.test.js measure the same player: a day in 'player' mode whose only inputs are
// the ones the standing objective (app/objective.js) proposes, once a grid minute. Not loaded by
// the game. An ES module (.mjs: tools/package.json pins the .js tools to CommonJS).
//
//   node tools/follow.mjs                                  # desk, seeds 1-11, one process
//   node tools/follow.mjs --scenario desk-weekend --seeds 1-200 -j 8
//   node tools/follow.mjs --seed 7 --lines                 # one day, every line that carried an action
//   node tools/follow.mjs --seeds 1-11 --no-follow         # the day with no input at all (C-14: it must fail)
//   node tools/follow.mjs --seeds 1-11 --no-par --no-stops # the player alone: no par day, no STOP re-runs
//
// Flags: --seed N | --seeds A-B (default 1-11) | --list a,b,c (seeds by name, e.g. the 11 of
// tests/objective.test.js) | --scenario ID (desk, desk-weekend, classic; default desk) | --until H
// (stop at this hour of the unwrapped day, 4..28) | --no-follow | --no-par (skip par's day) |
// --no-stops (skip the STOP re-runs) | --lines | -j/--workers N | --json (one JSON line per seed) | --problem (O-8:
// the line in problem mode, so the follower acts only where it names one unit or another control).
//
// Per seed: the day type, black or not, unserved MWh, score.cost by key, the cost the §21.4
// accept compares (fuel + no-load + starts + tie + battery wear + the city's payments, flex: RERT
// and DR are excluded, they are set by when the diesel was armed, not by the plan) and par's cost
// on the same seed beside it (a day that ends black, the player's or par's, is left out of the
// "dearer than par" count: its cost stops when it does). The city levers (2b, desk/README.md
// §31.10): the soaks and air-con cycles the player booked, and the day's ALL-IN (app/score.js, the
// end card's) beside par's, with the points 1000 x par's / yours (n/a when par's day went black;
// a black day of the player's is 0, as the end card's F). For each STOP line the player followed (line.kind === 'stop' with
// an accepted action): the saving the line quoted against the REALISED difference, which is the
// same day with that one STOP skipped minus the day as played, on the accept's cost. Skipped
// means: from the STOP's minute until the original day next started the unit, the line is asked
// about an observation in which that unit is not free to stop (its stopBlock set), so the player
// follows whatever the line says THEN (the battery and commit-later branches under the STOP
// branch are not hidden behind a STOP line nobody presses). The quoted saving is line.saving or
// line.action.saving when the objective gives one, else the first "$N" after "save" in the text;
// n/a when there is none. That skip forgoes the STOPs queued behind the kept unit (the line proposes the
// dearest gas unit only) and runs to 04:00, so stage C adds the quote's own counterfactual beside it, ONE
// BY ONE: every other followed action replayed at its minute and only that STOP left out (replaying), the
// plan cost at the quote's horizon (21:00 on a night scenario, where the night shift's own decisions from
// two different 21:00 states take over; else 04:00). Until the objective has STOP lines (Phase 2a wave 3) the STOP table is
// empty. The day type is the seed's hidden regime (a measurement tool reads state.ext for
// reporting only; the objective never sees it). The game's day (slice 2c, desk/README.md §32): the
// weather is the regime's class (heat, storm, drought, calm), Act I its briefing items (the tie's
// derate, a unit's late return, the feeders under repair: actOneOf), the restore task's MWh (task:
// the operator's from each hand-back; held: the network's; late: past RESTORE_PACE_MAX_S) and
// S-6's PERFECT, and the night: the inputs logged from 21:00 (the night shift's on a night
// scenario) and the asks the player followed then (Q-73: the line is quiet, so none). A table
// by weather follows the one by day type.

import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {followDay} from '../tests/lib/follow.js';
import {objective as standingObjective, inputsOf} from '../app/objective.js';
import {runPar} from '../sim/autopilot.js';
import {getScenario} from '../content/scenarios.js';
import {V, SIM_VERSION} from '../sim/params.js';
import {allIn, grade} from '../app/score.js';
import {isClean, isPerfect} from '../sim/market.js'; // Q-69's clean day: not black, no UFLS or directed shedding; S-6's PERFECT
import {NIGHT_S} from '../sim/clock.js';

const FILE = fileURLToPath(import.meta.url);
const COST_KEYS = ['fuel', 'noLoad', 'starts', 'tie', 'battWear', 'dr', 'rert', 'flex'];
/** The cost keys the §21.4 accept compares: what the plan decides (not the emergency resources; the city's payments are, §31.6). */
export const PLAN_COST_KEYS = ['fuel', 'noLoad', 'starts', 'tie', 'battWear', 'flex'];
export const planCost = cost => PLAN_COST_KEYS.reduce((a, k) => a + cost[k], 0);
const totalCost = cost => COST_KEYS.reduce((a, k) => a + (cost[k] || 0), 0);
/** 16:30, the start of the evening discharge window (PAR_BATT_DISCHARGE_H): where the battery's level is compared. */
const EVENING_S = (V.PAR_BATT_DISCHARGE_H[0] - V.DAY_START_H) * V.S_PER_H;

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const o = {seeds: [1, 11], list: null, scenario: 'desk', untilH: undefined, follow: true, par: true, stops: true, lines: false, workers: 1,
    json: false, worker: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--seed') { const n = parseInt(next(), 10); o.seeds = [n, n]; }
    else if (a === '--seeds') { const [x, y] = next().split('-').map(Number); o.seeds = [x, y === undefined ? x : y]; }
    else if (a === '--list') o.list = next().split(',').map(Number);
    else if (a === '--scenario') o.scenario = next();
    else if (a === '--until') o.untilH = Number(next());
    else if (a === '--no-follow') o.follow = false;
    else if (a === '--problem') o.coach = false;   // O-8: the line in problem mode (from the second shift)
    else if (a === '--no-par') o.par = false;
    else if (a === '--no-stops') o.stops = false;
    else if (a === '--lines') o.lines = true;
    else if (a === '-j' || a === '--workers') o.workers = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--json') o.json = true;
    else if (a === '--worker') o.worker = true;
    else if (a === '-h' || a === '--help') { const src = readFileSync(FILE, 'utf8').split('\n'); console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  return o;
}

// ---------------------------------------------------------------- one seed
const hhmm = s => {
  const m = Math.floor(s / V.S_PER_MIN) + V.DAY_START_H * V.S_PER_MIN;
  return String(Math.floor(m / V.S_PER_MIN) % V.DAY_H).padStart(2, '0') + ':' + String(m % V.S_PER_MIN).padStart(2, '0');
};

/** The seed's day type: the hidden regime's temperature class, and the weekend. */
function dayType(st) {
  const temp = st.ext.regime.temp || (st.ext.regime.cls === 'heat' ? 'HEATWAVE' : st.day ? st.day.temp : 'HOT');
  return temp + (st.day && st.day.weekend ? ' weekend' : '');
}

/**
 * Act I's briefing items (2c, Q-68), from the day's 04:00 records: 'tie 450 to 10:45', 'ccgt2 out
 * to 07:45', '2 feeders to 07:15' (the last hand-back), joined by ', '; '' on a day with none.
 * @param {object} st a state (its ext.events)
 * @returns {string}
 */
export function actOneOf(st) {
  const out = [];
  for (const e of st.ext.events) {
    if (e.atS !== 0) continue;
    if (e.type === 'tieDerate') out.push('tie ' + e.args.limitMW + ' to ' + hhmm(e.args.untilS));
    else if (e.type === 'unitOutage') out.push(e.args.unit + ' out to ' + hhmm(e.args.untilS));
    else if (e.type === 'feederOut') out.push(e.args.districts.length + ' feeders to ' + hhmm(Math.max(...e.args.clearS)));
  }
  return out.join(', ');
}

/**
 * The saving a STOP line quotes, in dollars, or null: line.saving or line.action.saving if the
 * objective carries the number, else the first dollar amount after "save" in its text
 * ("Stop it: saves about $41,000.").
 * @param {{text?:string, saving?:number, action?:object}} line
 * @returns {number|null}
 */
export function quotedSaving(line) {
  if (Number.isFinite(line.saving)) return line.saving;
  if (line.action && Number.isFinite(line.action.saving)) return line.action.saving;
  const m = /sav\w*[^$]*\$\s?([\d,]+(?:\.\d+)?)/i.exec(line.text || '');
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/** The stopBlock a skipped STOP's unit is given (see skipping). */
export const SKIPPED = 'this STOP is skipped (tools/follow.mjs)';

/**
 * The objective with one followed STOP skipped. From the STOP's minute until `untilS` the line
 * is asked about a copy of the observation in which that unit is not free to stop (stopBlock
 * set; desk/README.md §21.4: a candidate that is not `on` with `stopBlock === ''` gets no STOP
 * line), and what it then says is followed: the day is the same player's, with every other branch
 * still open. A line that names the unit all the same has that action dropped (it still shows).
 * The first form of this wrapper kept the STOP line with a null action for the whole window, which
 * hid every branch below STOP for hours: the realised difference then counted everything else the
 * player no longer did (measured on DESK seed 1 with a battery branch below the STOP: $22,974
 * against $73,636 for the true skip).
 * @param {{s:number, action:{unit:string}}} stop a `said` entry of followDay
 * @param {number} untilS
 * @param {function} [line] the objective to wrap (default: app/objective.js)
 */
export function skipping(stop, untilS, line = standingObjective) {
  const unit = stop.action.unit;
  return (obs, ctx) => {
    if (obs.s < stop.s || obs.s >= untilS) return line(obs, ctx);
    const held = Object.assign({}, obs, {units: obs.units.map(u => (u.id === unit ? Object.assign({}, u, {stopBlock: SKIPPED}) : u))});
    const x = line(held, ctx);
    if (x && x.action && x.action.type === 'stop' && x.action.unit === unit) return Object.assign({}, x, {action: null});
    return x;
  };
}

/**
 * The line's own counterfactual for one followed STOP (stage C): the day with every other action the player
 * followed replayed at its minute, and only this STOP left out (the unit's next START, refused on a running
 * unit, goes with it). skipping() lets the player read the line again instead, and the line's STOP branch
 * proposes the dearest gas unit only, so while the kept unit runs no later STOP comes: its realised figure is
 * the whole queue's (desk/README.md §27 P-1), and the day after it is another day's.
 * @param {Array<object>} said followDay's said
 * @param {object} stop the STOP's said entry
 * @param {number} untilS the second the day next started the unit (stopLines)
 */
export function replaying(said, stop, untilS) {
  const by = new Map(said.map(x => [x.s, x])), unit = stop.action.unit;
  return obs => {
    const x = by.get(obs.s);
    return !x || x === stop || (x.s === untilS && x.action.type === 'start' && x.action.unit === unit) ? null : {kind: x.kind, level: x.level, text: x.text, action: x.action};
  };
}

/**
 * How many of these rows cost more than par on the accept's cost, among the days that can be
 * compared: a day that ended black (the player's or par's) stopped paying when it stopped, so it
 * is counted in `na`, never as cheaper.
 * @param {Array<{black:boolean, planCost:number, par:{black:boolean, planCost:number}}>} rows
 * @returns {{dearer:number, of:number, na:number}}
 */
export function dearerThanPar(rows) {
  const whole = rows.filter(r => !r.black && !r.par.black);
  return {dearer: whole.filter(r => r.planCost > r.par.planCost).length, of: whole.length, na: rows.length - whole.length};
}

/** The followed STOP lines of a day, each with the second the day next started that unit (or the day's end). */
export function stopLines(said) {
  return said.filter(x => x.kind === 'stop' && x.accepted && x.action && x.action.type === 'stop').map(x => {
    const again = said.find(y => y.s > x.s && y.accepted && y.action && y.action.type === 'start' && y.action.unit === x.action.unit);
    return {line: x, untilS: again ? again.s : V.DAY_S};
  });
}

function summaryOf(r) {
  const sc = r.score;
  return {black: r.st.black, endsAt: hhmm(Math.floor(r.st.tick / V.TICKS_PER_S)), unservedMWh: sc.unservedMWh, uflsMWh: sc.uflsMWh, directedMWh: sc.directedMWh, cost: Object.fromEntries(COST_KEYS.map(k => [k, sc.cost[k] || 0])),
    planCost: planCost(sc.cost), totalCost: totalCost(sc.cost), spillMWh: sc.spillMWh || 0};
}

/**
 * One seed: the followed day, par's day beside it, and each STOP's quoted saving against the
 * realised difference.
 * @param {object} scenario
 * @param {number} seed
 * @param {{follow?:boolean, untilH?:number, stops?:boolean, par?:boolean, lines?:boolean, objective?:function}} o
 *   objective: the line to follow instead of app/objective.js's (tests; the STOP re-runs wrap the same one)
 * @returns {object} the row the report prints (see report())
 */
export function followSeed(scenario, seed, o) {
  const t0 = process.hrtime.bigint();
  let batt = null; // the battery at 16:30 (§21.4 accept: on hot days at or above par's level)
  // the plan cost at a STOP quote's horizon: 21:00 on a night scenario, where the night shift takes the desk (Q-73), else the day's end
  const cutS = scenario.night ? NIGHT_S : Infinity, cut = (r, score) => r.cutCost ?? planCost(score.cost);
  const atCut = (r, st, obs) => { if (r.cutCost === undefined && obs.s >= cutS) r.cutCost = planCost(st.score.cost); };
  const base = {};
  const day = followDay(seed, scenario, {follow: o.follow, untilH: o.untilH, objective: o.objective, coach: o.coach,
    onMinute: (st, obs) => { atCut(base, st, obs); if (batt === null && obs.s >= EVENING_S) batt = st.battery.socMWh; }});
  const row = Object.assign({seed, day: dayType(day.st), weather: day.st.ext.regime.cls || '', actOne: actOneOf(day.st)}, summaryOf(day));
  // the restore task (Q-69) and the night (Q-73)
  const sc = day.score, nightTick = NIGHT_S * V.TICKS_PER_S;
  Object.assign(row, {taskMWh: sc.taskMWh || 0, heldMWh: sc.heldMWh || 0, lateMWh: sc.taskLateMWh || 0, perfect: isPerfect(sc, day.st.black),
    nightInputs: day.st.log.filter(x => x.tick > nightTick).length, nightAsks: day.said.filter(x => x.s >= NIGHT_S).length});
  const kinds = {};
  for (const x of day.said) {
    if (!x.accepted) continue;
    const key = x.kind + ':' + (x.action.redispatch ? 'redispatch' : x.action.type);
    kinds[key] = (kinds[key] || 0) + 1;
  }
  row.actions = day.said.filter(x => x.accepted).length;
  row.refused = day.said.length - row.actions;
  row.kinds = kinds;
  row.battAt1630 = batt;
  // the city levers booked (2b) and the day's ALL-IN (Q-48)
  // (the blocks booked: a SOAK THE CITY press, one of `actions`, books a soak a suburb, Q1)
  const flex = lever => day.said.filter(x => x.accepted).flatMap(x => inputsOf(x.action)).filter(i => i.type === 'flex' && i.lever === lever).length;
  row.soaks = flex('soak'); row.aircons = flex('aircon');
  const hh = scenario.city.suburbs.reduce((a, x) => a + x.households, 0), you = allIn(day.score, hh);
  row.allIn = you.total;
  if (o.lines) row.lines = day.said.map(x => hhmm(x.s) + ' [' + x.level + ' ' + x.kind + (x.accepted ? '' : ' REFUSED') + '] ' + JSON.stringify(x.action) + '  ' + x.text);
  row.stops = [];
  if (o.stops !== false && o.follow !== false) {
    for (const {line, untilS} of stopLines(day.said)) {
      const alt = summaryOf(followDay(seed, scenario, {untilH: o.untilH, objective: skipping(line, untilS, o.objective)}));
      const one = {}, kept = followDay(seed, scenario, {untilH: o.untilH, objective: replaying(day.said, line, untilS), onMinute: (st, obs) => atCut(one, st, obs)});
      row.stops.push({atS: line.s, at: hhmm(line.s), unit: line.action.unit, until: hhmm(untilS), quoted: quotedSaving(line), realised: alt.planCost - row.planCost,
        realisedTotal: alt.totalCost - row.totalCost, unservedSkipped: alt.unservedMWh, blackSkipped: alt.black,
        oneByOne: cut(one, kept.score) - cut(base, day.score)});
    }
  }
  if (o.par) {
    const until = o.untilH === undefined ? undefined : Math.round((o.untilH - V.DAY_START_H) * V.S_PER_H * V.TICKS_PER_S);
    let parBatt = null;
    const p = runPar(seed, scenario, {untilTick: until, onStep: st => { if (parBatt === null && st.tick >= EVENING_S * V.TICKS_PER_S) parBatt = st.battery.socMWh; }});
    const pa = allIn(p.score, hh), g = p.black ? null : grade(you, pa, day.st.black);
    row.par = {black: p.black, unservedMWh: p.score.unservedMWh, cost: Object.fromEntries(COST_KEYS.map(k => [k, p.score.cost[k] || 0])),
      planCost: planCost(p.score.cost), totalCost: totalCost(p.score.cost), battAt1630: parBatt, allIn: pa.total};
    row.points = g ? g.points : null;
  }
  row.secs = Number(process.hrtime.bigint() - t0) / 1e9;
  return row;
}

// ---------------------------------------------------------------- workers
function runWorkers(o, seeds) {
  const n = Math.min(o.workers, seeds.length);
  const chunks = Array.from({length: n}, () => []);
  seeds.forEach((s, i) => chunks[i % n].push(s));
  const rows = [];
  return Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
    const child = fork(FILE, ['--worker'], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
    child.on('message', m => { if (m.row) rows.push(m.row); });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error('worker exited with ' + code))));
    child.send({o, seeds: chunk});
  }))).then(() => rows);
}

function workerMain() {
  process.on('message', m => {
    const scenario = getScenario(m.o.scenario);
    for (const seed of m.seeds) process.send({row: followSeed(scenario, seed, m.o)});
    process.disconnect();
  });
}

// ---------------------------------------------------------------- report
const usd = x => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : (x < 0 ? '-$' : '$') + Math.round(Math.abs(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const k$ = x => (Number.isFinite(x) ? (x / 1000).toFixed(0) : '-');
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : '-');
const pct = (k, n) => (n ? (100 * k / n).toFixed(1) + '%' : '-');
const mean = xs => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

function table(rows, cols) {
  if (!rows.length) return;
  const w = cols.map(c => Math.max(c[0].length, ...rows.map(r => String(c[1](r)).length)));
  const line = vals => vals.map((v, i) => String(v).padStart(w[i])).join('  ');
  console.log(line(cols.map(c => c[0])));
  for (const r of rows) console.log(line(cols.map(c => c[1](r))));
}

function report(o, scenario, rows, wallS) {
  console.log('\n' + (o.follow ? 'the hint-following player' : 'a day with no input') + ' on ' + scenario.id + ' (SIM ' + SIM_VERSION + '), ' + rows.length + ' seeds, wall ' + wallS.toFixed(0) + ' s; costs in $1,000');
  const cols = [['seed', r => r.seed], ['day', r => r.day], ['weather', r => r.weather], ['Act I', r => r.actOne], ['black', r => (r.black ? 'BLACK ' + r.endsAt : '')], ['unserved MWh', r => f1(r.unservedMWh)],
    ['task / held / late MWh', r => f1(r.taskMWh) + ' / ' + f1(r.heldMWh) + ' / ' + f1(r.lateMWh)], ['PERFECT', r => (r.perfect ? 'yes' : '')],
    ['from 21:00 inputs / asks', r => r.nightInputs + ' / ' + r.nightAsks],
    ...COST_KEYS.map(k => [k, r => k$(r.cost[k])]), ['plan cost', r => k$(r.planCost)], ['total', r => k$(r.totalCost)], ['soak / air-con', r => r.soaks + ' / ' + r.aircons],
    ['ALL-IN', r => k$(r.allIn)]];
  if (o.par) cols.push(['par plan cost', r => k$(r.par.planCost)], ['par total', r => k$(r.par.totalCost)], ['par ALL-IN', r => k$(r.par.allIn)], ['points', r => r.points ?? 'n/a'],
    ['par unserved', r => f1(r.par.unservedMWh) + (r.par.black ? ' BLACK' : '')]);
  cols.push(['batt 16:30 MWh', r => f1(r.battAt1630) + (o.par ? ' / par ' + f1(r.par.battAt1630) : '')], ['actions', r => r.actions], ['STOPs', r => r.stops.length], ['s', r => r.secs.toFixed(1)]);
  table(rows, cols);
  if (o.lines) for (const r of rows) console.log('\nseed ' + r.seed + ' (' + r.day + '): lines that carried an action\n  ' + (r.lines.join('\n  ') || '(none)'));

  const stops = rows.flatMap(r => r.stops.map(s => Object.assign({seed: r.seed, day: r.day}, s)));
  console.log('\nSTOP lines followed: ' + stops.length + (stops.length ? '' : (o.stops && o.follow ? ' (the objective proposed no STOP; n/a)' : ' (not measured)')));
  // §21.4 accept: each quoted saving within +-30% or $10,000 of the realised difference.
  const near = (q, r) => q !== null && Number.isFinite(r) && (Math.abs(q - r) <= 10000 || Math.abs(q - r) <= 0.3 * Math.abs(r));
  const within = s => near(s.quoted, s.realised), withinOne = s => near(s.quoted, s.oneByOne), to = scenario.night ? 'to 21:00' : 'to 04:00';
  table(stops, [['seed', s => s.seed], ['day', s => s.day], ['at', s => s.at], ['unit', s => s.unit], ['next start', s => s.until], ['quoted saving', s => usd(s.quoted)],
    ['realised (plan cost)', s => usd(s.realised)], ['realised (total)', s => usd(s.realisedTotal)], ['within 30% or $10k', s => (s.quoted === null ? 'n/a' : within(s) ? 'yes' : 'NO')],
    ['skipped: unserved', s => f1(s.unservedSkipped) + (s.blackSkipped ? ' BLACK' : '')], ['one by one (' + to + ')', s => usd(s.oneByOne)], ['within', s => (s.quoted === null ? 'n/a' : withinOne(s) ? 'yes' : 'NO')]]);
  if (stops.length) {
    console.log('quoted within +-30% or $10,000 of realised: ' + stops.filter(within).length + ' of ' + stops.filter(s => s.quoted !== null).length + ' quoted (' + stops.filter(s => s.quoted === null).length + ' n/a)');
    console.log('one by one (every other followed action replayed, the plan cost ' + to + ', the quote\'s horizon): ' + stops.filter(withinOne).length + ' of ' + stops.filter(s => s.quoted !== null).length + ' quoted');
  }

  // by day type, then (2c) by weather: the regime's class
  const by = (title, key) => {
    const types = [...new Set(rows.map(key))].sort();
    console.log('\nby ' + title);
    table(types.concat(types.length > 1 ? ['all'] : []).map(d => {
      const g = d === 'all' ? rows : rows.filter(r => key(r) === d);
      const clean = g.filter(r => isClean(r, r.black)).length, black = g.filter(r => r.black);
      const dp = o.par ? dearerThanPar(g) : null, pts = g.filter(r => r.points !== null && r.points !== undefined).map(r => r.points);
      return {d, n: g.length, clean: clean + ' (' + pct(clean, g.length) + ')', black: black.length + (black.length ? ': ' + black.map(r => r.seed).join(', ') : ''),
        un: f1(median(g.map(r => r.unservedMWh))) + ' / ' + f1(Math.max(...g.map(r => r.unservedMWh))), plan: k$(median(g.map(r => r.planCost))), total: k$(median(g.map(r => r.totalCost))),
        par: o.par ? k$(median(g.map(r => r.par.planCost))) + ' / ' + k$(median(g.map(r => r.par.totalCost))) : '-', dearer: dp ? dp.dearer + ' of ' + dp.of + (dp.na ? ' (' + dp.na + ' black: n/a)' : '') : '-',
        stops: g.reduce((a, r) => a + r.stops.length, 0), city: g.filter(r => r.soaks).length + ' / ' + g.filter(r => r.aircons).length,
        pts: pts.length ? median(pts) + ' (' + Math.min(...pts) + '-' + Math.max(...pts) + ')' : '-',
        perfect: g.filter(r => r.perfect).length + ' (' + pct(g.filter(r => r.perfect).length, g.length) + ')', task: f1(mean(g.map(r => r.taskMWh))) + ' / ' + f1(mean(g.map(r => r.lateMWh))),
        night: g.reduce((x, r) => x + r.nightAsks, 0)};
    }), [[title, r => r.d], ['n', r => r.n], ['zero unserved', r => r.clean], ['black', r => r.black], ['unserved MWh (median / max)', r => r.un],
      ['plan cost (median)', r => r.plan], ['total (median)', r => r.total], ['par plan / total (median)', r => r.par], ['player dearer than par (plan cost)', r => r.dearer], ['STOPs', r => r.stops],
      ['days soaked / cycled', r => r.city], ['ALL-IN points (median, range)', r => r.pts], ['PERFECT', r => r.perfect], ['task / late MWh (mean)', r => r.task],
      ['asks followed from 21:00', r => r.night]]);
  };
  by('day type', r => r.day);
  if (rows.some(r => r.weather)) by('weather', r => r.weather);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.worker) return workerMain();
  const scenario = getScenario(o.scenario);
  const seeds = o.list || Array.from({length: o.seeds[1] - o.seeds[0] + 1}, (_, i) => o.seeds[0] + i);
  const t0 = Date.now();
  let rows;
  if (o.workers > 1 && seeds.length > 1) rows = await runWorkers(o, seeds);
  else rows = seeds.map(seed => followSeed(scenario, seed, o));
  rows.sort((a, b) => seeds.indexOf(a.seed) - seeds.indexOf(b.seed));
  if (o.json) { for (const r of rows) console.log(JSON.stringify(r)); return; }
  report(o, scenario, rows, (Date.now() - t0) / 1000);
}

// Run as a script (or as one of its own workers); tests import followSeed, quotedSaving, skipping, stopLines and dearerThanPar.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });

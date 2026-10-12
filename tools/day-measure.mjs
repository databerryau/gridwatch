// GRIDWATCH: the day's measures of slice 2c (desk/README.md §32.7.1): D-10's decisions per act
// (Q-76) on par's day, and the returning-player proxy of D-8 and K-12 (Q-77). Not loaded by the
// game. An ES module (.mjs: tools/package.json pins the .js tools to CommonJS). Stage C runs it
// once on 100 dates (§32.10); tools/daily-gen.js reads D-10 from the same functions.
//
//   node tools/day-measure.mjs --from 2026-10-12 --days 100 -j 8
//   node tools/day-measure.mjs --from 2026-10-12 --days 1 --json      # one JSON line per date
//
// Flags: --from YYYY-MM-DD (default 2026-10-12) | --days N (default 1) | -j/--workers N | --json |
// --no-proxy (D-10 only) | --no-d10 (the proxy only). Each date plays its attempt-0 seed on the
// scenario of its date (content/dailies.js scenarioIdOf). The day class is the seed's hidden regime
// (a measurement tool reads state.ext for reporting only).
//
// D-10 (Q-76): an opportunity is one of par's decisions (start, stop, restore, flex, callDR,
// armRERT, standDownRERT, a battery MODE change, rule 1's tie answer to a trip; GUARD steps,
// battery re-sizes and re-dispatches are the system's work) or a director moment (a trip, its
// respond card, a news item issued in play, an MSL level change, a feeder clearance, a unit's
// return, the tie limit's end). Moments within MERGE_REAL_S real s of an opportunity's first moment
// are that opportunity, on the step profile (clock.stepReal); gaps run 05:30-21:00 including both
// ends; per-act counts use clock.ACT_S. gaps() is pure (tests/gaps.test.js).
//
// Q-77, the returning player: competent (runPar's harness, night memo included) plus every
// restore the lamp allows (a dark district whose permissive is '') plus every scope the game
// offers, taken and closed cleanly (scope, then AUTO: the clean pass through 0 degrees), looking
// every 30 grid-s (1 real s at RESTORE's 30x; a ready unit waits AUTO_SYNC_S). Offers come from the game's own rule, G.offerWhy(obs, tally) with two arguments
// (D-5's window is obs.inRespond), one per ready period, at most MAX_OFFERS a day. A SYNC MATTERS
// (K-12) when a stack column of app/planview.js project(obs) at the offer, in [close, close +
// AUTO_SYNC_S], is red or amber and the MW the clean close gains there over the auto-synchroniser's
// close (the sync block, then the T2 ramp toward MIN) covers its gap (P50 for red, P90 for amber,
// minus supply). The weaker count only asks that a red or amber column falls in that window.
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {V, SIM_VERSION} from '../sim/params.js';
import {stepReal, ACT_S, hhmm} from '../sim/clock.js';
import {createState, observe, applyInput} from '../sim/step.js';
import {runPar} from '../sim/autopilot.js';
import {restorePermissive} from '../sim/grid.js';
import {getScenario} from '../content/scenarios.js';
import {scenarioIdOf} from '../content/dailies.js';
import {offerWhy, MAX_OFFERS} from '../app/game.js';
import {project} from '../app/planview.js';

const FILE = fileURLToPath(import.meta.url), TPS = V.TICKS_PER_S;
const S_AT = (h, m = 0) => (h - V.DAY_START_H) * V.S_PER_H + m * V.S_PER_MIN;
/** Q-76's window and merge, and D-10's accept (no gap longer than maxGapRealS on >= 90% of dates). */
export const D10 = Object.freeze({fromS: S_AT(5, 30), toS: ACT_S[3], mergeRealS: V.PAR_ACTION_GAP_REAL_S, maxGapRealS: 40});

/**
 * Q-76's measure, pure: the opportunities (moments merged within mergeRealS real s of each
 * opportunity's first moment, on the step profile) in [fromS, toS), the gaps between them and the
 * window's ends, the worst gap and the count per act (I, II, III by clock.ACT_S).
 * @param {number[]} moments grid seconds, any order
 * @returns {{opps:number[], gaps:Array<{fromS:number, toS:number, realS:number}>, worst:{fromS:number, toS:number, realS:number}, perAct:number[]}}
 */
export function gaps(moments, o = D10) {
  const xs = moments.filter(s => s >= o.fromS && s < o.toS).sort((a, b) => a - b), opps = [];
  for (const s of xs) if (!opps.length || stepReal(opps[opps.length - 1], s) >= o.mergeRealS) opps.push(s);
  const pts = [o.fromS, ...opps, o.toS], gs = [];
  for (let i = 1; i < pts.length; i++) gs.push({fromS: pts[i - 1], toS: pts[i], realS: stepReal(pts[i - 1], pts[i])});
  const perAct = [0, 0, 0];
  for (const s of opps) perAct[s < ACT_S[1] ? 0 : s < ACT_S[2] ? 1 : 2]++;
  return {opps, gaps: gs, worst: gs.reduce((a, g) => (g.realS > a.realS ? g : a)), perAct};
}

const DECISIONS = new Set(['start', 'stop', 'restore', 'flex', 'callDR', 'armRERT', 'standDownRERT']);
/** Q-76: par's decisions in a runPar log (grid seconds); battery inputs count only when they change the mode. Pure. */
export function parMoments(log, origins, battMode0 = 'idle') {
  const out = [];
  let mode = battMode0;
  log.forEach((x, i) => {
    const rule = /^rule[1-9]$/.test(origins[i]), s = Math.floor(x.tick / TPS);
    if (x.type === 'battery') { if (rule && x.args.mode !== mode) out.push(s); mode = x.args.mode; return; }
    if (rule && (DECISIONS.has(x.type) || (x.type === 'tie' && origins[i] === 'rule1'))) out.push(s);
  });
  return out;
}

/** Q-76: the director's moments of a day, from its opening state, its end state and the MSL changes sampled along it. */
export function directorMoments(st0, end, mslS) {
  const out = mslS.slice();
  for (const c of end.conts) out.push(Math.floor(c.startTick / TPS), Math.floor(c.watchEndTick / TPS));
  for (const n of end.news) if (n.atS > 0) out.push(n.atS);
  for (const d of st0.city.districts) if (d.clearS >= 0) out.push(d.clearS);
  for (const u of st0.units) if (u.outUntilS > 0) out.push(u.outUntilS);
  if (st0.tie.limitUntilS > 0) out.push(st0.tie.limitUntilS);
  return out;
}

/** An onStep sampler of MSL level changes (grid seconds), for directorMoments. */
export function mslSampler() {
  const at = [];
  let lv = -1;
  return {at, onStep: s => { if (s.tick % TPS === 0 && s.msl.level !== lv) { if (lv >= 0) at.push(s.tick / TPS); lv = s.msl.level; } }};
}

/** D-10 on par's day for one seed (or from a runPar result already played: r, its opening state and the MSL changes). */
export function d10(seed, scn, played) {
  let p = played;
  if (!p) {
    const st0 = createState(seed, scn), m = mslSampler();
    p = {st0: JSON.parse(JSON.stringify(st0)), r: runPar(seed, scn, {state: st0, onStep: m.onStep}), msl: m.at};
  }
  const g = gaps(parMoments(p.r.log, p.r.origins, p.st0.battery.mode).concat(directorMoments(p.st0, p.r.state, p.msl)));
  return {worstS: g.worst.realS, worstAt: hhmm(g.worst.fromS) + '-' + hhmm(g.worst.toS), perAct: g.perAct, opps: g.opps.length};
}

// ---------------------------------------------------------------- Q-77, the returning player

/** MW unit i delivers t grid seconds after its breaker closed at `close` (the sync block, then T2 toward MIN; 0 before). */
function closedMW(m, close, t) {
  if (t < close) return 0;
  const block = Math.min(m.syncBlockMW, m.minMW);
  return m.t2S > 0 ? Math.min(m.minMW, block + (m.minMW - block) * (t - close) / m.t2S) : m.minMW;
}

/**
 * Does a clean close at closeS (against the auto-synchroniser's at autoS) matter on the projection
 * at the offer (Q-77)? {matters, weaker}: a column in [closeS, closeS + AUTO_SYNC_S] red or amber
 * (weaker), and one of those whose gap the gain covers (matters). Pure.
 */
export function syncMatters(proj, m, closeS, autoS) {
  let matters = false, weaker = false;
  for (let q = 0; q < proj.times.length; q++) {
    const t = proj.times[q];
    if (t < closeS || t > closeS + V.AUTO_SYNC_S || !(proj.gap[q] === 'red' || proj.gap[q] === 'amber')) continue;
    weaker = true;
    const need = (proj.gap[q] === 'red' ? proj.p50[q] : proj.p90[q]) - proj.supply[q];
    if (closedMW(m, closeS, t) - closedMW(m, autoS, t) >= need) matters = true;
  }
  return {matters, weaker};
}

/** The returning player looks every LOOK_S grid seconds (runPar's harness runs between looks; each call ends with an observe()). */
const LOOK_S = 30;
/** One date's returning player: restores (task feeders among them), offers taken, SYNCs that matter and the weaker count. */
export function returning(seed, scn) {
  const state = createState(seed, scn);
  let memo = null, restores = 0, taskRestores = 0;
  // the game's tally (§32.4.8): offers today, the 'tight'/'peak' ones among them, the last contingency offered for
  const offered = new Set(), syncs = [], tally = {n: 0, extra: 0, contN: -1};
  for (let t = V.PLAYER_START_TICK + 1; !state.over; t += LOOK_S * TPS) {
    const r = runPar(seed, scn, memo ? {state, memo, untilTick: t, hashEveryS: V.DAY_S + 1} : {state, proxy: 'competent', untilTick: t, hashEveryS: V.DAY_S + 1});
    memo = r.memo;
    if (state.over) break;
    // every restore the lamp allows (the input runs the real restore preview)
    const ds = state.city.districts;
    for (let i = 0; i < ds.length; i++) {
      if (!ds[i].dark || restorePermissive(state, i) !== '') continue;
      if (applyInput(state, {type: 'restore', district: ds[i].id}).ok) { restores++; if (ds[i].clearS >= 0) taskRestores++; }
    }
    // every scope offered (one per ready period), taken and closed cleanly
    for (const u of state.units) if (u.mode !== 'ready') offered.delete(u.id);
    const ready = state.units.filter(u => u.mode === 'ready' && !offered.has(u.id));
    if (!ready.length || state.control.mode !== 'AGC') continue;
    const obs = observe(state);
    for (const u of ready) {
      offered.add(u.id);
      const why = offerWhy(obs, tally);
      if (!why) continue;
      tally.n++;
      if (why !== 'respond') tally.extra++;
      else if (obs.contingencies.length) tally.contN = obs.contingencies[obs.contingencies.length - 1].n;
      const proj = project(obs), s = obs.s, autoS = s + u.timerS;
      if (!applyInput(state, {type: 'scope', unit: u.id}).ok || !applyInput(state, {type: 'syncAuto', unit: u.id}).ok) continue;
      const closeS = (u.autoTick + V.SYNC_BREAKER_TICKS) / TPS;
      syncs.push(Object.assign({unit: u.id, why, at: hhmm(s)}, syncMatters(proj, V.MACHINES[u.k], closeS, autoS)));
      if (tally.n >= MAX_OFFERS) break;
    }
  }
  return {restores, taskRestores, offers: tally.n, matters: syncs.filter(x => x.matters).length, weaker: syncs.filter(x => x.weaker).length, syncs, black: state.black};
}

// ---------------------------------------------------------------- the command line

function parseArgs(argv) {
  const o = {from: '2026-10-12', days: 1, workers: 1, json: false, proxy: true, d10: true, worker: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--from') o.from = next();
    else if (a === '--days') o.days = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '-j' || a === '--workers') o.workers = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--json') o.json = true;
    else if (a === '--no-proxy') o.proxy = false;
    else if (a === '--no-d10') o.d10 = false;
    else if (a === '--worker') o.worker = true;
    else if (a === '-h' || a === '--help') { const src = readFileSync(FILE, 'utf8').split('\n'); console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  return o;
}

/** The dates [from, from + days) as YYYYMMDD numbers. */
export function dateRange(from, days) {
  const t = Date.parse(from + 'T00:00:00Z'), out = [];
  for (let k = 0; k < days; k++) { const d = new Date(t + k * 864e5); out.push(d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()); }
  return out;
}

function measure(ymd, o) {
  const scn = getScenario(scenarioIdOf(ymd)), st = createState(ymd, scn), t0 = Date.now();
  const row = {ymd, scenario: scn.id, cls: st.ext.regime.cls, temp: st.ext.regime.temp};
  if (o.d10) Object.assign(row, d10(ymd, scn));
  if (o.proxy) { const r = returning(ymd, scn); delete r.syncs; Object.assign(row, {proxy: r}); }
  row.secs = (Date.now() - t0) / 1000;
  return row;
}

const pct = (k, n) => (n ? (100 * k / n).toFixed(1) + '%' : '-');
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

function report(rows, o, wall) {
  console.log(`\nday-measure: ${rows.length} dates from ${o.from} (SIM ${SIM_VERSION}), wall ${wall.toFixed(0)} s, single-core ${rows.reduce((a, r) => a + r.secs, 0).toFixed(0)} s`);
  const classes = [...new Set(rows.map(r => r.cls))].sort();
  for (const c of classes.concat(classes.length > 1 ? ['all'] : [])) {
    const g = c === 'all' ? rows : rows.filter(r => r.cls === c), n = g.length;
    let line = c.padEnd(8) + ' n ' + String(n).padStart(3);
    if (o.d10) {
      const ok = g.filter(r => r.worstS <= D10.maxGapRealS).length;
      line += ` | D-10 worst gap <= ${D10.maxGapRealS} s on ${pct(ok, n)}, median ${median(g.map(r => r.worstS)).toFixed(1)} s; per act (median) ` +
        [0, 1, 2].map(a => median(g.map(r => r.perAct[a]))).join(' / ');
    }
    if (o.proxy) {
      const both = g.filter(r => r.proxy.restores > 0 && r.proxy.matters > 0).length, weak = g.filter(r => r.proxy.restores > 0 && r.proxy.weaker > 0).length;
      line += ` | Q-77 >=1 RESTORE and >=1 SYNC that matters ${pct(both, n)} (weaker ${pct(weak, n)}); offers/day ${(g.reduce((a, r) => a + r.proxy.offers, 0) / n).toFixed(2)}`;
    }
    console.log(line);
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.worker) {
    process.on('message', m => { for (const ymd of m.dates) process.send({row: measure(ymd, m.o)}); process.disconnect(); });
    return;
  }
  const dates = dateRange(o.from, o.days), t0 = Date.now();
  let rows = [];
  if (o.workers > 1 && dates.length > 1) {
    const n = Math.min(o.workers, dates.length), chunks = Array.from({length: n}, () => []);
    dates.forEach((d, i) => chunks[i % n].push(d));
    await Promise.all(chunks.map(c => new Promise((res, rej) => {
      const child = fork(FILE, ['--worker'], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
      child.on('message', m => rows.push(m.row));
      child.on('exit', code => (code === 0 ? res() : rej(new Error('worker exited with ' + code))));
      child.send({dates: c, o});
    })));
  } else {
    for (const d of dates) rows.push(measure(d, o));
  }
  rows = rows.sort((a, b) => a.ymd - b.ymd);
  if (o.json) { for (const r of rows) console.log(JSON.stringify(r)); return; }
  for (const r of rows) console.log(r.ymd + ' ' + r.scenario + ' ' + r.temp + '/' + r.cls + (o.d10 ? ' D-10 worst ' + r.worstS.toFixed(1) + ' s (' + r.worstAt + '), per act ' + r.perAct.join('/') : '') +
    (o.proxy ? ' | proxy restores ' + r.proxy.restores + ' (task ' + r.proxy.taskRestores + '), offers ' + r.proxy.offers + ', matter ' + r.proxy.matters + ', weaker ' + r.proxy.weaker + (r.proxy.black ? ' BLACK' : '') : '') +
    ' (' + r.secs.toFixed(1) + ' s)');
  report(rows, o, (Date.now() - t0) / 1000);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });

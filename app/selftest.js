// app/selftest.js: W6 (risk 5): next.html?selftest, the check each browser passes before a release ("?selftest passes in
// Chrome, Edge and Firefox"). In place of the game, a plain page that plays a few golden runs in this browser and checks each
// against the values Node worked out for this build (content/selftest.js, which tools/selftest-gen.mjs writes with this
// file's own runner):
//   par      par's day on a daily (sim/autopilot.js runPar, resumed a slice at a time as app/par.js plays it) to its end: the
//            state's hash (sim/step.js hashState) each grid hour and at the end, and its ALL-IN total, which must be the
//            stored par (content/ladder.js, F-8: the grade's basis)
//   nothing  the page's day with no input (app/game.js with the system, as tools/ladder.mjs nothingCheck plays it) to 14:00:
//            the hash each grid hour
//   replay   a scripted player's input log (sim/autopilot.js's fuzz proxy: random valid inputs) through sim/step.js replay to a
//            checkpoint: the hash there
// Each case's row says PASS or FAIL (a FAIL names the first grid hour whose hash differs) with its time; the page shows the
// browser, SIM_VERSION and the stamp, and one line to copy (COPY, as SHARE copies the card). The work runs in slices of
// SLICE_MS and yields between them, so the page draws its progress; a replay is one call of replay(), which cannot pause, so
// its checkpoint is kept within a few grid hours. app/start.js loads this on demand, on any screen (a phone's browser can be
// checked too).

import {V} from '../sim/params.js';
import {hashState, replay, SIM_VERSION} from '../sim/step.js';
import * as AP from '../sim/autopilot.js';
import * as G from './game.js';
import * as system from './system.js';
import {allIn} from './score.js';
import {copyText, shortDate} from './share.js';
import {localYmd} from './history.js';
import {outlookWord} from './week.js';
import {mw, tickClock} from '../render/format.js';
import {dailyFor} from '../content/dailies.js';
import {LADDER} from '../content/ladder.js';
import {SCENARIOS} from '../content/scenarios.js';
import {SELFTEST} from '../content/selftest.js';

const TPS = V.TICKS_PER_S, HOUR = V.S_PER_H * TPS;
/** Real ms of work between yields to the page. */
export const SLICE_MS = 40;
/** Ticks one call plays (15 grid minutes): runPar and the page's runTo resume where they stopped. */
export const CHUNK_TICKS = 15 * V.S_PER_MIN * TPS;
/** The kinds of case, in the line to copy. */
const KIND = Object.freeze({par: 'par', nothing: 'no input', replay: 'replay'});

/** A case's short name ("par Fri 16 Oct"), for the line to copy. */
export const caseName = c => KIND[c.kind] + ' ' + shortDate(c.ymd);

/** A case's row: what it plays. */
export function caseText(c) {
  const day = shortDate(c.ymd) + ' (' + outlookWord(c.seed, SCENARIOS[c.scenarioId]) + ')';
  if (c.kind === 'par') return 'Par\'s day, ' + day + ', to its end: the hash each hour, and its ALL-IN against the stored par';
  if (c.kind === 'nothing') return 'The page\'s day with no input, ' + day + ', to ' + tickClock(c.tick, false) + ': the hash each hour';
  return 'A scripted player\'s ' + c.log.length + ' inputs, ' + day + ', replayed to ' + tickClock(c.tick, false);
}

// Play `chunk(untilTick)` (one call, at most CHUNK_TICKS) on `st` to `end` in slices of SLICE_MS, yielding between them
async function sliced(st, end, chunk, o) {
  while (!st.over && st.tick < end) {
    const t0 = o.now();
    do {
      chunk(Math.min(end, st.tick + CHUNK_TICKS));
    } while (!st.over && st.tick < end && o.now() - t0 < SLICE_MS);
    o.progress(st.tick / end, st.tick);
    await o.pause();
  }
}

// Par's day, resumed a chunk at a time from its state and memo (as app/par.js plays it in the page)
async function measurePar(c, o) {
  const scn = G.scenarioForSeed(c.seed), hashes = [];
  let r = AP.runPar(c.seed, scn, {untilTick: 0});
  const {state, memo} = r;
  await sliced(state, Math.min(o.upTo, V.DAY_TICKS), t => {
    r = AP.runPar(c.seed, scn, {state, memo, untilTick: t, hashEveryS: V.S_PER_H});
    for (const h of r.hashes) hashes.push(h >>> 0);
  }, o);
  const hh = scn.city.suburbs.reduce((a, s) => a + s.households, 0);
  return {tick: state.tick, hashes, hash: hashState(state) >>> 0, total: Math.round(allIn(r.score, hh).total)};
}

// The page's day with no input at all (the system on, no card answered): tools/ladder.mjs nothingDay's
async function measureNothing(c, o) {
  const game = G.createGame({daily: dailyFor(c.ymd, G.dailyStamp()), scenario: G.scenarioForSeed, system, commit: 'player', startPaused: true,
    storage: null, par: false});
  G.takeDesk(game);
  await sliced(game.state, Math.min(o.upTo, c.tick), t => G.runTo(game, t), o);
  return {tick: game.state.tick, hashes: game.hashes.map(h => h >>> 0), hash: hashState(game.state) >>> 0};
}

// A recorded log through the sim's own replay (F-6), in one call
async function measureReplay(c, o) {
  await o.pause();   // (the page shows the row running first)
  const st = replay(c.seed, SCENARIOS[c.scenarioId], c.log, {untilTick: c.tick});
  o.progress(1, st.tick);
  return {tick: st.tick, hashes: [], hash: hashState(st) >>> 0};
}

/**
 * W6 (risk 5): play case `c` in this engine: {tick, hashes (each grid hour from 05:00, unsigned), hash (at its end), total
 * (par: its ALL-IN $, rounded)}. o: {upTo: stop at this tick (tests: a checkpoint, not whole days; a replay is one call and
 * ignores it), now() (ms), pause() (a promise: yield to the page), progress(f, tick)}.
 */
export function measure(c, o = {}) {
  const env = Object.assign({now: () => Date.now(), pause: () => Promise.resolve(), progress: () => {}}, o, {upTo: o.upTo === undefined ? Infinity : o.upTo});
  return c.kind === 'par' ? measurePar(c, env) : c.kind === 'nothing' ? measureNothing(c, env) : measureReplay(c, env);
}

/** F-8: the stored par of a date (content/ladder.js, this build's list only), else null. */
export const storedTotal = (ymd, list = LADDER) => (list.v === G.dailyStamp() && list.rows && list.rows[ymd] ? list.rows[ymd][0] : null);

/**
 * W6 (risk 5): case `c`'s golden values against what this engine got: {pass, why: [reasons], note}. Every hourly hash got is
 * compared; at the case's end (unless `upTo` stopped it sooner) its tick and hash too, and par's ALL-IN against the stored par.
 * The first hour that differs comes first, however the day ended: it is where the numbers split, and a day that blacks out
 * early or an ALL-IN off par follows from it (the line to copy names only the first reason).
 */
export function judge(c, got, upTo = Infinity, list = LADDER) {
  const why = [], end = c.kind === 'replay' ? c.tick : Math.min(upTo, c.tick), whole = end === c.tick;
  const k = got.hashes.findIndex((h, i) => i < c.hashes.length && h !== c.hashes[i]);
  if (k >= 0) why.push('the hash first differs at ' + tickClock((k + 1) * HOUR, false));
  if (got.tick !== end) why.push('the day ended at ' + tickClock(got.tick, false) + ', not ' + tickClock(end, false));
  else if (k < 0 && whole && got.hash !== c.hash) why.push('the hash differs at ' + tickClock(end, false));
  const stored = c.kind === 'par' && whole ? storedTotal(c.ymd, list) : null;
  if (c.kind === 'par' && whole && stored === null) why.push('no stored par for this date (content/ladder.js is another build\'s)');
  else if (stored !== null && got.total !== stored) why.push('ALL-IN $' + mw(got.total) + ', the stored par is $' + mw(stored));
  const hours = got.hashes.length + ' of ' + c.hashes.length + (c.hashes.length === 1 ? ' hour' : ' hours');
  const note = c.kind === 'replay' ? 'the hash at ' + tickClock(end, false) + ' matches'
    : hours + ' match' + (stored !== null ? '; ALL-IN $' + mw(got.total) + ', the stored par' : '') + (whole ? '' : ' (stopped at ' + tickClock(end, false) + ')');
  return {pass: !why.length, why, note: why.length ? why.join('; ') : note};
}

/**
 * W6 (risk 5): measure and judge each case of `golden` in turn: [{c, name, pass, why, note, ms}]. A golden file from another
 * build (its stamp) plays nothing: every case fails. o: measure's, plus onCase(i, result) before each case (result null) and
 * after it, and progress(i, f, tick).
 */
export async function runCases(golden = SELFTEST, o = {}) {
  const now = o.now || (() => Date.now()), out = [];
  const stale = golden.v !== G.dailyStamp();
  for (const [i, c] of golden.cases.entries()) {
    if (o.onCase) o.onCase(i, null);
    const t0 = now();
    let r;
    if (stale) r = {pass: false, why: ['the golden values are another build\'s: run node tools/selftest-gen.mjs']};
    else {
      try {
        r = judge(c, await measure(c, Object.assign({}, o, {now, progress: (f, tick) => o.progress && o.progress(i, f, tick)})), o.upTo);
      } catch (e) {
        r = {pass: false, why: ['it stopped: ' + (e && e.message ? e.message : String(e))]};
      }
    }
    r = Object.assign({c, name: caseName(c), note: r.why.join('; '), ms: now() - t0}, r);
    out.push(r);
    if (o.onCase) o.onCase(i, r);
  }
  return out;
}

// A user agent's browser and system, first match (Edge and Opera say Chrome too, Chrome says Safari, Android says Linux)
const BROWSERS = [['Edge', /\bEdg(?:e|A|iOS)?\/(\d+)/], ['Opera', /\bOPR\/(\d+)/], ['Firefox', /\b(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /\b(?:CriOS|Chrome)\/(\d+)/], ['Safari', /\bVersion\/(\d+(?:\.\d+)?)\b.*\bSafari\//], ['Node', /\bNode\.js\/(\d+)/]];
const SYSTEMS = [['Windows', /Windows/], ['iOS', /iPhone|iPad|iPod/], ['macOS', /Mac OS X|Macintosh/], ['Android', /Android/],
  ['ChromeOS', /CrOS/], ['Linux', /Linux/]];

/** The browser and its system from a user agent: "Firefox 131 on Windows". */
export function browserOf(ua) {
  const s = String(ua || ''), b = BROWSERS.map(([name, re]) => [name, s.match(re)]).find(x => x[1]), os = SYSTEMS.find(x => x[1].test(s));
  return (b ? b[0] + ' ' + b[1][1] : 'an unknown browser') + (os ? ' on ' + os[0] : '');
}

const seconds = ms => (ms / 1000).toFixed(1) + ' s';
const isoDay = ymd => String(ymd).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3');

/**
 * W6 (risk 5): the one line to copy: "GRIDWATCH selftest 2026-10-16: PASS 5/5 · Firefox 131 on Windows · <stamp> · 12.3 s",
 * each failure named with its first reason after FAIL n/N.
 */
export function summaryLine(results, o) {
  const pass = results.filter(r => r.pass).length, fails = results.filter(r => !r.pass);
  const head = fails.length ? 'FAIL ' + pass + '/' + results.length + ' (' + fails.map(r => r.name + ': ' + r.why[0]).join('; ') + ')' : 'PASS ' + pass + '/' + results.length;
  return 'GRIDWATCH selftest ' + isoDay(o.ymd) + ': ' + head + ' · ' + o.browser + ' · ' + o.stamp + ' · ' + seconds(o.ms);
}

const CSS = '#selftest{position:fixed;inset:0;overflow:auto;z-index:100;background:#0d1117;color:#c9d1d9;font:15px/1.5 system-ui,sans-serif;padding:24px 16px}' +
  '#selftest .in{max-width:820px;margin:0 auto}#selftest h1{font:700 24px/1.2 ui-monospace,monospace;letter-spacing:2px;color:#e6edf3;margin:8px 0 12px}' +
  '#selftest .dim{color:#8b949e;font-size:13px}#selftest progress{width:100%;height:10px;margin:8px 0}' +
  '#selftest table{width:100%;border-collapse:collapse;margin:12px 0}#selftest td{padding:6px 8px;border-top:1px solid #30363d;vertical-align:top}' +
  '#selftest td.st{font:700 13px ui-monospace,monospace;white-space:nowrap}#selftest td.ms{text-align:right;white-space:nowrap;color:#8b949e}' +
  '#selftest .pass{color:#3fb950}#selftest .fail{color:#f85149}#selftest .run{color:#d29922}#selftest .wait{color:#6e7781}' +
  '#selftest pre{white-space:pre-wrap;word-break:break-word;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px;' +
  'font:13px ui-monospace,monospace;color:#e6edf3}#selftest a{color:#58a6ff}' +
  '#selftest button{font:700 15px system-ui,sans-serif;padding:8px 18px;margin:4px 8px 4px 0;border-radius:6px;border:1px solid #58a6ff;' +
  'background:#161b22;color:#e6edf3;cursor:pointer}' +
  'body.selftest>*:not(#selftest){display:none!important}' +
  // (the desk's floor, min-width 1280px on the body, would keep a phone's page 1280 wide: as app/landing.js)
  'html:has(body.selftest),body.selftest{display:block!important;min-width:0!important;min-height:0!important;width:auto!important;height:auto!important;overflow:auto!important}';

/**
 * W6 (risk 5): show the selftest page in `doc` and run its cases. o: {golden (content/selftest.js's by default), upTo (tests)}.
 * @returns {{root: Element, done: Promise<Array>}} done: runCases's results, once the line to copy is up
 */
export function showSelftest(doc, win, o = {}) {
  const el = (tag, text, parent, cls) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };
  const golden = o.golden || SELFTEST, perf = win.performance, now = () => (perf && perf.now ? perf.now() : Date.now());
  const browser = browserOf(win.navigator && win.navigator.userAgent), stamp = G.dailyStamp();
  if (doc.head) { const st = el('style', CSS, doc.head); st.id = 'selftest-css'; }
  doc.title = 'GRIDWATCH selftest';
  const root = el('div', '', doc.body), box = el('div', '', root, 'in');
  root.id = 'selftest';
  root.setAttribute('role', 'main');
  el('h1', 'GRIDWATCH SELFTEST', box);
  el('p', 'This browser plays ' + golden.cases.length + ' golden runs of the game and checks each against the numbers Node worked out ' +
    'for this build. Every row should say PASS. A FAIL means this browser\'s arithmetic differs: copy the line at the bottom and send it.', box);
  el('p', browser + ' · SIM_VERSION ' + SIM_VERSION + ' · stamp ' + stamp + (golden.v === stamp ? '' : ' (the golden values are ' + golden.v + '\'s)'), box, 'dim').id = 'selftest-env';
  const bar = el('progress', '', box), said = el('p', 'Starting…', box);
  bar.id = 'selftest-progress'; bar.max = 1; bar.value = 0;
  said.id = 'selftest-now';
  said.setAttribute('aria-live', 'polite');
  const body = el('tbody', '', el('table', '', box)), rows = golden.cases.map(c => {
    const tr = el('tr', '', body), st = el('td', 'WAIT', tr, 'st wait'), what = el('td', caseText(c), tr), ms = el('td', '', tr, 'ms');
    return {tr, st, note: el('div', '', what, 'dim'), ms};
  });
  body.id = 'selftest-rows';
  const out = el('div', '', box), line = el('pre', '', out), btn = el('button', 'COPY', out), copied = el('p', '', out, 'dim');
  out.hidden = true;
  line.id = 'selftest-line'; btn.id = 'selftest-copy'; copied.id = 'selftest-said';
  btn.title = 'Copy the line, to keep with the release checks';
  const back = el('a', 'Back to the game', el('p', '', box, 'dim'));
  back.href = 'next.html';
  if (doc.body.classList) doc.body.classList.add('selftest');

  const t0 = now(), n = golden.cases.length;
  // (a yield is a posted message, not a timer: nested timers wait at least 4 ms, and a hidden tab's a second or more)
  const ch = win.MessageChannel ? new win.MessageChannel() : null, waiting = [];
  if (ch) ch.port1.onmessage = () => waiting.shift()();
  const pause = () => new Promise(r => { if (ch) { waiting.push(r); ch.port2.postMessage(0); } else win.setTimeout(r, 0); });
  const done = runCases(golden, {upTo: o.upTo, now, pause,
    onCase(i, r) {
      const row = rows[i];
      if (!r) {
        row.st.textContent = 'RUN'; row.st.className = 'st run';
        said.textContent = 'Running ' + (i + 1) + ' of ' + n + ': ' + caseName(golden.cases[i]) + '…';
        return;
      }
      row.st.textContent = r.pass ? 'PASS' : 'FAIL'; row.st.className = 'st ' + (r.pass ? 'pass' : 'fail');
      row.note.textContent = r.note;
      row.ms.textContent = seconds(r.ms);
      bar.value = (i + 1) / n;
    },
    progress(i, f, tick) {
      bar.value = (i + Math.min(1, f)) / n;
      said.textContent = 'Running ' + (i + 1) + ' of ' + n + ': ' + caseName(golden.cases[i]) + ' · ' + tickClock(tick, false);
    }}).then(results => {
    if (ch) ch.port1.close();
    const ms = now() - t0, pass = results.filter(r => r.pass).length;
    said.textContent = 'Done in ' + seconds(ms) + ': ' + pass + ' of ' + n + ' pass' + (pass === n ? '.' : '. The rows marked FAIL say where.');
    const text = summaryLine(results, {ymd: localYmd(new Date()), browser, stamp, ms});
    line.textContent = text;
    out.hidden = false;
    btn.addEventListener('click', () => copyText(text, win).then(how => {
      if (how) {
        btn.textContent = 'COPIED';
        copied.textContent = 'Copied: paste it with the release checks.';
      } else {
        try { const g = doc.createRange(); g.selectNodeContents(line); const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(g); } catch { /* (no selection API) */ }
        copied.textContent = 'Copy was blocked here: the line is selected, so press Ctrl+C.';
      }
    }));
    return results;
  });
  return {root, done};
}

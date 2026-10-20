// tools/verify.mjs: W7 (Q15, option 2 of decisions/2026-10-16-open-questions.md §15): verify, then restamp.
// A SIM_VERSION change (or a desk scenario's) makes the dailies' build stamp (app/game.js dailyStamp) stale in four files:
// content/dailies.js, content/ladder.js, content/anniversaries.js GATED and content/selftest.js. Most such changes move nothing
// a daily is graded on, and making the four again (tools/daily-gen.js, tools/ladder.mjs, tools/selftest-gen.mjs) costs 25-40
// minutes. This replays, under this build, what they stored, and compares:
//   every listed daily (DAILIES.from..to, each date's listed attempt; an anniversary under its variant)
//     par        sim/autopilot.js runPar, the run tools/ladder.mjs and the page's stored par (F-8) take: its ALL-IN total and its
//                shed MWh against the date's content/ladder.js row (null where par went black)
//     the gate   D-9 along that same run (tools/daily-gen.js bound and gate, an onStep each grid minute): never below the
//                optimistic bound and market.isClean; an anniversary's incident in its plan; attempt k > 0 of attempt 0's class
//   a sample of the dailies (every Nth date from `from`, --players N, default 8; with the anniversaries and the selftest's dates)
//     the ladder's own players: the page's no-input day (tools/ladder.mjs nothingTotal) and the lean and competent proxies
//   the selftest goldens (content/selftest.js): every case played as the page's runner plays it (app/selftest.js: par's day,
//     the page's no-input day, a scripted log's replay), each hourly hash, the end's hash and tick and par's ALL-IN; and the
//     ladder's check (the no-input case's hash at 14:00)
//   the anniversaries: content/anniversaries.js GATED and content/ladder.js anniv against each variant's scenarioHash
// A state's hash (sim/step.js hashState) covers state.v, the SIM_VERSION it was made under, so every hash moves at a version bump
// even when nothing else does. Each hash is therefore taken twice: as this build makes it, and with state.v set back to the
// version the golden was made under (its stamp's first part); the second is compared with the stored one. When everything matches
// it rewrites the four stamps and, where SIM_VERSION moved, the selftest's hashes and the ladder's check to this build's (each file
// through its own writer, which must give back the shipped file first; nothing else in the lists may change), unless --check.
// When anything differs it writes nothing, prints each date and field that differs, and the full regeneration. Not checked: the
// attempts before a listed one (a regeneration may pick an earlier attempt that passes now; the listed one still passes D-9), the
// scripted players off the sample, daily-gen's D-10 and Hard-day pool report, the classic golden (`npm run golden:v4 --
// --check`; its hash column moves at every version bump), and any HAND day or player's press: the system's dispatch is played
// only on the no-input days, so a change that only a HAND day or the player's inputs read passes (tests/hand-guard.test.js
// holds one HAND day with a START in the suite).
//
//   npm run verify                         replay and compare; restamp when everything matches (-j: logical CPUs - 1)
//   node tools/verify.mjs --check -j 4     compare only, never write (CI: .github/workflows/verify.yml)
//   node tools/verify.mjs --dates 2026-10-16,2027-02-13   these dates only (never writes)
// Flags: -j N | --check | --players N (every Nth date; 1: all, the whole ladder, ~4x the time; 0: none, and then it never
// writes) | --dates D,D,... Exit 1 when anything differs (or a file is not as its writer writes it).
import {fork} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';

const ROOT = new URL('..', import.meta.url);
const imp = p => import(new URL(p, ROOT).href);
const file = p => fileURLToPath(new URL(p, ROOT));
const DG = createRequire(import.meta.url)('./daily-gen.js');

/** The full regeneration for the list from..to (ISO dates): the commands, in order, that the verify prints when anything differs. */
export function regeneration(from, to) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  return ['node tools/daily-gen.js --from ' + from + ' --days ' + days + ' -j 8   # D-9: re-gate every date; content/dailies.js and GATED (~15 min)',
    'node tools/ladder.mjs -j 6                                  # the stored par and the ladder: content/ladder.js (~20 min)',
    'node tools/selftest-gen.mjs                                 # the selftest goldens: content/selftest.js (~10 s)'];
}

/** The stale-stamp tests' advice for the list from..to: the verify first (minutes; it writes only when nothing moved), then the full regeneration. */
export const restampAdvice = (from, to) => 'run `npm run verify` first (it replays par on every daily and restamps the four files when nothing moved, ' +
  'about 10-12 min on 11 workers); if it refuses, the full regeneration: ' + regeneration(from, to).map(c => c.replace(/\s+#.*$/, '')).join(', then ');

/**
 * A hash guard's advice when a stored hash no longer matches (tests/par-guard.test.js, tests/ladder.test.js's check): with the
 * file on this build's stamp (`current`), `what` moved under it, which needs a SIM_VERSION change first; else the file is another
 * build's, and a state's hash covers SIM_VERSION, so every hash in it moved with the version: the verify, then the regeneration.
 */
export const movedAdvice = (current, file, what, from, to) => (current
  ? what + ' moved under the stamp: a change to the sim or the system\'s dispatch needs a SIM_VERSION change (sim/params.js), then ' +
    restampAdvice(from, to) + ' (it refuses when a graded value moved)'
  : file + ' is another build\'s (a state\'s hash covers SIM_VERSION): ' + restampAdvice(from, to));

const iso = ymd => String(ymd).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3');
const ymdIn = s => +String(s).replace(/-/g, '');
/** Every YYYYMMDD from `from` to `to` (ISO dates), inclusive. */
export function datesOf(from, to) {
  const out = [], end = ymdIn(to);
  for (let t = Date.parse(from + 'T00:00:00Z'); ; t += 864e5) {
    const x = new Date(t), ymd = x.getUTCFullYear() * 1e4 + (x.getUTCMonth() + 1) * 100 + x.getUTCDate();
    if (ymd > end) return out;
    out.push(ymd);
  }
}

// ---------------------------------------------------------------- one job (a worker's)

const classOf = st => st.ext.regime.temp + '|' + st.ext.regime.cls;

/** One listed daily under this build: par's row and D-9 along par's day; with `players`, the ladder's three players. */
export async function verifyDate(ymd, players) {
  const [{V}, AP, S, G, {createState}, {isClean}, {dailyFor}, L] = await Promise.all([imp('sim/params.js'), imp('sim/autopilot.js'),
    imp('app/score.js'), imp('app/game.js'), imp('sim/step.js'), imp('sim/market.js'), imp('content/dailies.js'), imp('tools/ladder.mjs')]);
  const d = dailyFor(ymd, G.dailyStamp()), scn = G.scenarioForSeed(d.seed), k = Math.round((d.seed - ymd) / 1e8);
  const hh = scn.city.suburbs.reduce((a, s) => a + s.households, 0), MIN_T = V.S_PER_MIN * V.TICKS_PER_S;
  const st0 = createState(d.seed, scn), cls = classOf(st0), cls0 = k > 0 ? classOf(createState(ymd, scn)) : cls, incident = DG.hasIncident(st0);
  let shortMin = 0;
  const r = AP.runPar(d.seed, scn, {state: st0, hashEveryS: V.DAY_S + 1, onStep: st => {
    if (st.tick % MIN_T !== 0 || st.over) return;
    const b = DG.bound(st, V);
    if (b.boundMW < b.demandMW) shortMin++;
  }});
  const total = x => (x.black ? -1 : Math.round(S.allIn(x.score, hh).total));
  const out = {ymd, seed: d.seed, k, par: r.black ? null : [total(r), Math.round(S.parShedMWh(r.score) * 1000) / 1000],
    shortMin, clean: isClean(r.score, r.black), pass: DG.gate({shortMin, score: r.score, black: r.black}, isClean), incident, cls, cls0};
  if (players) {
    out.players = [await L.nothingTotal(d), total(AP.runPar(d.seed, scn, {proxy: 'lean'})), total(AP.runPar(d.seed, scn, {proxy: 'competent'}))];
  }
  return out;
}

/** [this build's hash, the hash with state.v set to `was`] of a state (unsigned): state.v is the SIM_VERSION, which hashState covers. */
export function hashBoth(hashState, st, was) {
  const now = hashState(st) >>> 0, v = st.v;
  if (v === was) return [now, now];
  st.v = was;
  try { return [now, hashState(st) >>> 0]; } finally { st.v = v; }
}

/**
 * Selftest case i of content/selftest.js, played as the page's runner plays it (app/selftest.js measure: par's day through runPar,
 * the page's no-input day through app/game.js, a log through sim/step.js replay), each hash taken both ways (hashBoth: `was` is
 * the version the golden was made under): {i, tick, hashes, hash, was: {hashes, hash}, total (par)}.
 */
export async function verifyCase(i, was) {
  const [{V}, {hashState, replay}, AP, G, system, S, {SELFTEST}, {dailyFor}, {SCENARIOS}] = await Promise.all([imp('sim/params.js'),
    imp('sim/step.js'), imp('sim/autopilot.js'), imp('app/game.js'), imp('app/system.js'), imp('app/score.js'), imp('content/selftest.js'),
    imp('content/dailies.js'), imp('content/scenarios.js')]);
  const c = SELFTEST.cases[i], HOUR = V.S_PER_H * V.TICKS_PER_S, hours = [];
  let st, total;
  if (c.kind === 'par') {
    const scn = G.scenarioForSeed(c.seed);
    const r = AP.runPar(c.seed, scn, {hashEveryS: V.DAY_S + 1, onStep: x => { if (x.tick % HOUR === 0) hours.push(hashBoth(hashState, x, was)); }});
    st = r.state;
    total = Math.round(S.allIn(r.score, scn.city.suburbs.reduce((a, s) => a + s.households, 0)).total);
  } else if (c.kind === 'nothing') {
    const game = G.createGame({daily: dailyFor(c.ymd, G.dailyStamp()), scenario: G.scenarioForSeed, system, commit: 'player', startPaused: true,
      storage: null, par: false});
    G.takeDesk(game);
    for (let t = HOUR; t <= c.tick && !game.state.over; t += HOUR) { G.runTo(game, t); if (game.state.tick === t) hours.push(hashBoth(hashState, game.state, was)); }
    G.runTo(game, c.tick);
    st = game.state;
  } else st = replay(c.seed, SCENARIOS[c.scenarioId], c.log, {untilTick: c.tick});
  const end = hashBoth(hashState, st, was);
  return {i, tick: st.tick, hashes: hours.map(h => h[0]), hash: end[0], was: {hashes: hours.map(h => h[1]), hash: end[1]}, total};
}

/** The ladder's check (tools/ladder.mjs nothingCheck: the first daily's no-input day at CHECK_H), its hash both ways: {ymd, tick, hash, was}. */
export async function verifyCheck(was) {
  const [{V}, {hashState}, G, system, {DAILIES, dailyFor}, {CHECK_H}] = await Promise.all([imp('sim/params.js'), imp('sim/step.js'), imp('app/game.js'),
    imp('app/system.js'), imp('content/dailies.js'), imp('tools/ladder.mjs')]);
  const ymd = ymdIn(DAILIES.from), tick = (CHECK_H - V.DAY_START_H) * V.S_PER_H * V.TICKS_PER_S;
  const game = G.createGame({daily: dailyFor(ymd, G.dailyStamp()), scenario: G.scenarioForSeed, system, commit: 'player', startPaused: true, storage: null, par: false});
  G.takeDesk(game);
  G.runTo(game, tick);
  const [hash, w] = hashBoth(hashState, game.state, was);
  return {ymd, tick: game.state.tick, hash, was: w};
}

// ---------------------------------------------------------------- comparing (pure: tests/verify.test.js)

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = x => (x === undefined ? 'none' : JSON.stringify(x));

/** The differences of one date's replay `got` against its stored ladder `row` (undefined: none stored): [{at, field, stored, got}]. */
export function dateDiffs(got, row) {
  const at = iso(got.ymd), out = [], d = (field, stored, now) => out.push({at, field, stored, got: now});
  if (row === undefined) d('ladder row', undefined, got.par);
  else if (got.par === null || row === null) { if (!same(got.par, row === null ? null : row.slice(0, 2))) d('par (null: black)', row && row.slice(0, 2), got.par); }
  else {
    if (row[0] !== got.par[0]) d('par ALL-IN $', row[0], got.par[0]);
    if (row[1] !== got.par[1]) d('par shed MWh', row[1], got.par[1]);
  }
  if (!got.pass) d('D-9 gate', 'pass', (got.shortMin ? got.shortMin + ' min below the bound' : '') + (got.shortMin && !got.clean ? ', ' : '') + (got.clean ? '' : 'not clean'));
  if (!got.incident) d('D-29 incident', 'in the plan', 'missing');
  if (got.cls !== got.cls0) d('class of attempt ' + got.k, got.cls0, got.cls);
  if (got.players && row) ['nothing', 'lean', 'competent'].forEach((p, j) => { if (row[2 + j] !== got.players[j]) d(p + ' $', row[2 + j], got.players[j]); });
  return out;
}

/** The differences of a selftest case `c` (stored) against what this build measured (its hashes as made under c's version: got.was). */
export function caseDiffs(c, got, name) {
  const out = [], d = (field, stored, now) => out.push({at: name, field, stored, got: now}), was = got.was;
  if (got.tick !== c.tick) d('tick', c.tick, got.tick);
  // (the hourly hashes are from 05:00: hashes[k] is at (5 + k):00)
  const k = c.hashes.findIndex((h, j) => j < was.hashes.length && was.hashes[j] !== h);
  if (k >= 0) d('hash at ' + String((5 + k) % 24).padStart(2, '0') + ':00 (the first hour that differs)', c.hashes[k], was.hashes[k]);
  else if (was.hashes.length !== c.hashes.length) d('hourly hashes', c.hashes.length, was.hashes.length);
  if (was.hash !== c.hash) d('hash at the end', c.hash, was.hash);
  if (c.kind === 'par' && got.total !== c.total) d('par ALL-IN $', c.total, got.total);
  return out;
}

/**
 * The stale files' new texts under `stamp`, each through the writer that wrote it: [{path, text, was, v}]. fresh: this build's
 * hashes for the selftest's cases ([{hash, hashes}], by index) and the ladder's check (a hash), each verified equal to the stored
 * one under the version it was made with (they move with SIM_VERSION, which hashState covers). Throws when a writer does not give
 * back the shipped file (an edit by hand: regenerate it) or when anything but the stamp and those hashes would change.
 * lists: {DAILIES, LADDER, GATED, SELFTEST}; read: path => the file's text; writers: {writeList, writeGated, ladderText, selftestText}.
 */
export function restamped(lists, stamp, read, writers, fresh = {}) {
  const {DAILIES, LADDER, GATED, SELFTEST} = lists, W = writers;
  const cases = SELFTEST.cases.map((c, i) => (fresh.cases && fresh.cases[i] ? Object.assign({}, c, {hash: fresh.cases[i].hash, hashes: fresh.cases[i].hashes.slice()}) : c));
  const check = fresh.check === undefined ? LADDER.check : Object.assign({}, LADDER.check, {hash: fresh.check});
  // (what may change: the stamp, and these hashes; everything else in the lists must be as shipped)
  const blank = L => JSON.stringify(Object.assign({}, L, {v: '', check: L.check && Object.assign({}, L.check, {hash: 0}),
    cases: L.cases && L.cases.map(c => Object.assign({}, c, {hash: 0, hashes: c.hashes.map(() => 0)}))}));
  const files = [
    ['content/dailies.js', DAILIES, Object.assign({}, DAILIES, {v: stamp}), (src, L) => W.writeList(src, L)],
    ['content/ladder.js', LADDER, Object.assign({}, LADDER, {v: stamp, check}), (src, L) => W.ladderText(L)],
    ['content/anniversaries.js', GATED, Object.assign({}, GATED, {v: stamp}), (src, L) => W.writeGated(src, L)],
    ['content/selftest.js', SELFTEST, Object.assign({}, SELFTEST, {v: stamp, cases}), (src, L) => W.selftestText(L)],
  ];
  const out = [];
  for (const [path, old, now, write] of files) {
    if (old.v === stamp && same(old, now)) continue;
    const was = read(path);
    if (write(was, old) !== was) throw new Error(path + ' is not as its writer writes it (edited by hand?): regenerate it');
    if (blank(now) !== blank(old)) throw new Error(path + ': the restamp would change more than the stamp and the version\'s hashes');
    out.push({path, text: write(was, now), was, v: old.v});
  }
  return out;
}

// ---------------------------------------------------------------- the run

function parseArgs(argv) {
  const o = {workers: Math.max(1, availableParallelism() - 1), check: false, players: 8, dates: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '-j' || a === '--workers') o.workers = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === '--check') o.check = true;
    else if (a === '--players') o.players = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === '--dates') o.dates = (next() || '').split(',').filter(Boolean).map(ymdIn);
    else if (a === '-h' || a === '--help') {
      const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
      console.log(src.slice(0, src.findIndex(l => !l.startsWith('//'))).join('\n'));
      process.exit(0);
    } else throw new Error('unknown flag ' + a + ' (see --help)');
  }
  return o;
}

/** Run jobs on `n` worker processes (this file, --worker), one job at a time each; resolves to the results. */
function runWorkers(n, jobs, onDone) {
  const got = [];
  let next = 0;
  return new Promise((resolve, reject) => {
    let live = 0, failed = false;
    const fail = e => { if (!failed) { failed = true; reject(e); } };
    const startOne = () => {
      const w = fork(fileURLToPath(import.meta.url), ['--verify-worker']);
      let busy = null;
      live++;
      const feed = () => { if (failed) return w.kill(); if (next < jobs.length) { busy = jobs[next++]; w.send(busy); } else { busy = null; w.kill(); } };
      w.on('message', m => {
        if (m.error) return fail(new Error(JSON.stringify(m.job) + ': ' + m.error));
        got.push(m);
        onDone(got.length);
        feed();
      });
      w.on('error', fail);
      w.on('exit', code => {
        if (busy !== null) fail(new Error('a worker stopped (code ' + code + ') on ' + JSON.stringify(busy)));
        if (--live === 0) resolve(got);
      });
      feed();
    };
    for (let k = 0; k < Math.min(n, jobs.length); k++) startOne();
  });
}

async function main() {
  const o = parseArgs(process.argv.slice(2)), t0 = Date.now();
  const [G, {DAILIES, ANNIVERSARY_KEYS, dailyScenarioIdOf}, {LADDER}, {SELFTEST}, {GATED}, {scenarioHash}, {SCENARIOS}, {SIM_VERSION}, {ladderText},
    {selftestText}, {caseName}] = await Promise.all([imp('app/game.js'), imp('content/dailies.js'), imp('content/ladder.js'), imp('content/selftest.js'),
    imp('content/anniversaries.js'), imp('sim/step.js'), imp('content/scenarios.js'), imp('sim/params.js'), imp('tools/ladder.mjs'),
    imp('tools/selftest-gen.mjs'), imp('app/selftest.js')]);
  const stamp = G.dailyStamp(), all = datesOf(DAILIES.from, DAILIES.to);
  const outside = (o.dates || []).filter(d => !all.includes(d));
  if (outside.length) throw new Error('--dates: not listed dailies (' + DAILIES.from + ' to ' + DAILIES.to + '): ' + outside.map(iso).join(', '));
  const dates = o.dates || all, whole = !o.dates;
  const caseYmds = new Set(SELFTEST.cases.map(c => c.ymd)), annivs = Object.keys(ANNIVERSARY_KEYS).map(Number).filter(d => all.includes(d));
  const sampled = ymd => o.players > 0 && (all.indexOf(ymd) % o.players === 0 || annivs.includes(ymd) || caseYmds.has(ymd));
  // the longest jobs first (a selftest par day or a sampled date is 2-4 par days), so no worker is left with one at the end
  const versionOf = v => String(v).split('|')[0];   // (a golden's hashes were made with state.v this: its stamp's SIM_VERSION)
  const jobs = [...(whole ? [...SELFTEST.cases.map((c, i) => ({kind: 'case', i, was: versionOf(SELFTEST.v)})), {kind: 'check', was: versionOf(LADDER.v)}] : []),
    ...dates.filter(sampled).map(ymd => ({kind: 'date', ymd, players: true})), ...dates.filter(d => !sampled(d)).map(ymd => ({kind: 'date', ymd, players: false}))];
  const n = Math.min(o.workers, jobs.length);
  console.log('verify: ' + dates.length + ' dailies (' + iso(dates[0]) + ' to ' + iso(dates[dates.length - 1]) + ') under ' + stamp + ', the stored lists ' +
    (DAILIES.v === stamp ? 'this build\'s' : 'stamped ' + DAILIES.v) + '; the scripted players on ' + jobs.filter(j => j.players).length + ' of them; ' +
    n + ' worker processes');
  const results = await runWorkers(n, jobs, k => { if (k % 25 === 0 || k === jobs.length) console.log(k + '/' + jobs.length + ' jobs, ' + Math.round((Date.now() - t0) / 1000) + ' s'); });

  // compare
  const diffs = [], fresh = {cases: []}, byYmd = new Map(results.filter(r => r.job.kind === 'date').map(r => [r.out.ymd, r.out]));
  for (const ymd of dates) diffs.push(...dateDiffs(byYmd.get(ymd), Object.hasOwn(LADDER.rows, ymd) ? LADDER.rows[ymd] : undefined));
  if (whole) {
    const extra = Object.keys(LADDER.rows).map(Number).filter(d => !all.includes(d));
    if (extra.length) diffs.push({at: 'content/ladder.js', field: 'rows off the calendar', stored: extra.map(iso).join(', '), got: 'none'});
    for (const r of results.filter(x => x.job.kind === 'case')) {
      const c = SELFTEST.cases[r.out.i];
      diffs.push(...caseDiffs(c, r.out, 'selftest ' + caseName(c)));
      fresh.cases[r.out.i] = {hash: r.out.hash, hashes: r.out.hashes};
    }
    const ck = results.find(x => x.job.kind === 'check').out;
    if (ck.ymd !== LADDER.check.ymd || ck.tick !== LADDER.check.tick) diffs.push({at: 'content/ladder.js', field: 'check', stored: show(LADDER.check), got: show({ymd: ck.ymd, tick: ck.tick})});
    else if (ck.was !== LADDER.check.hash) diffs.push({at: 'content/ladder.js', field: 'check (the no-input day at 14:00)', stored: LADDER.check.hash, got: ck.was});
    fresh.check = ck.hash;
  }
  for (const ymd of annivs.filter(d => dates.includes(d))) {
    const h = scenarioHash(SCENARIOS[dailyScenarioIdOf(ymd)]), a = G.anniversaryStamp(ymd);
    if (GATED.hashes[ymd] !== h) diffs.push({at: iso(ymd), field: 'GATED variant hash', stored: GATED.hashes[ymd], got: h});
    if (!same(LADDER.anniv[ymd], a)) diffs.push({at: iso(ymd), field: 'ladder anniv', stored: show(LADDER.anniv[ymd]), got: show(a)});
  }
  const secs = (Date.now() - t0) / 1000;
  const players = results.filter(r => r.job.players).length;
  console.log('\nverify: ' + dates.length + ' dates replayed (par and D-9 on each; the scripted players on ' + players + ')' + (whole ? ', ' +
    SELFTEST.cases.length + ' selftest cases' : '') + ' in ' + secs.toFixed(0) + ' s wall on ' + n + ' workers (SIM_VERSION ' + SIM_VERSION + ')');

  if (diffs.length) {
    const dated = new Set(diffs.filter(x => /^\d{4}-/.test(x.at)).map(x => x.at)), fields = {};
    for (const x of diffs) { const f = x.field.replace(/ \(.*\)$/, '').replace(/^hash at \d\d:00$/, 'hourly hash'); fields[f] = (fields[f] || 0) + 1; }
    console.log('\nDIFFERS: ' + diffs.length + ' values on ' + dated.size + ' dates' + (diffs.length > dated.size ? ' and the goldens' : '') + ' (' +
      Object.entries(fields).map(([f, k]) => f + ' ' + k).join(', ') + ')');
    for (const x of diffs.slice(0, 60)) console.log('  ' + x.at + '  ' + x.field + ': stored ' + show(x.stored) + ', now ' + show(x.got));
    if (diffs.length > 60) console.log('  ... and ' + (diffs.length - 60) + ' more');
    if (diffs.every(x => /^(hash|hourly hashes|check)/.test(x.field))) console.log('\nEvery graded value holds; only state hashes moved (the state changed without moving a total).');
    console.log('\nNothing written. The full regeneration (25-40 min), in this order:\n  ' + regeneration(DAILIES.from, DAILIES.to).join('\n  '));
    process.exitCode = 1;
    return;
  }
  const stale = [DAILIES.v, LADDER.v, GATED.v, SELFTEST.v].some(v => v !== stamp);
  if (!whole || o.players === 0) {
    console.log('\nMATCH on what was replayed' + (stale ? '; the stamps stay as they are (a restamp needs the whole list and the players\' sample)' : '') + '.');
    return;
  }
  const writers = {writeList: DG.writeList, writeGated: DG.writeGated, ladderText, selftestText};
  const out = restamped({DAILIES, LADDER, GATED, SELFTEST}, stamp, p => readFileSync(file(p), 'utf8'), writers, fresh);
  if (!out.length) { console.log('\nMATCH: every stored value holds, and the four files carry this build\'s stamp. Nothing to write.'); return; }
  const moved = versionOf(SELFTEST.v) !== SIM_VERSION ? ' (with SIM_VERSION, which every state hash covers, the selftest\'s hashes and the ladder\'s check: each held under ' +
    versionOf(SELFTEST.v) + ')' : '';
  if (o.check) {
    console.log('\nMATCH: every stored value holds under ' + stamp + '. --check: nothing written; `npm run verify` restamps ' + out.map(f => f.path).join(', ') + moved + '.');
    return;
  }
  for (const f of out) writeFileSync(file(f.path), f.text);
  console.log('\nMATCH: every stored value holds. Restamped ' + out.map(f => f.path + ' (' + f.v + ')').join(', ') + ' to ' + stamp + moved + '.');
}

if (process.argv.includes('--verify-worker')) {
  process.on('message', async job => {
    try {
      const out = job.kind === 'case' ? await verifyCase(job.i, job.was) : job.kind === 'check' ? await verifyCheck(job.was) : await verifyDate(job.ymd, job.players);
      process.send({job, out});
    }
    catch (e) { process.send({job, error: String(e && e.stack || e)}); }
  });
} else if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}

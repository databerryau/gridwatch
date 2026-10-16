// tools/ladder.mjs: writes content/ladder.js (SPEC §5 W6, Y-11): for every daily (content/dailies.js, from..to), par's ALL-IN and
// the ALL-IN of GRIDWATCH's own players on that day, so the verdict can show where a player sits among them ("is 975 good?"):
//   nothing     the page's day with no input at all: the system dispatches, nobody starts a unit or answers a card
//               (app/game.js headless, as the page plays it: W3 measured such a day at about 30 D)
//   lean        sim/autopilot.js's lean proxy (commits just enough; S-5's calibration: at most 40% A)
//   competent   sim/autopilot.js's competent proxy (S-5's calibration: at least 70% A)
// Each row is [par's total $, par's shed MWh (S-7), nothing's total $, lean's, competent's], -1 for a player whose grid went
// black. The page grades them as it grades the player (app/game.js ladderFor, app/score.js grade), so a change to the grading
// needs no new list. The list carries the build stamp it was made under (app/game.js dailyStamp), like the dailies:
// tests/ladder.test.js fails when it is stale, and the verdict shows no ladder then. For changes to the page's dispatch that
// leave the stamp alone, the list also keeps `check`: the first daily's no-input day's state hash at CHECK_H, which the test
// replays (to 14:00, not the whole day: CLAUDE.md's 2.5 s a test). A statistic: run it once, after tools/daily-gen.js.
//
//   node tools/ladder.mjs [-j 6] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry]
//   (--dry prints and writes nothing; a range without --dry is merged into the current list, which must be this build's)
import {fork} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = new URL('..', import.meta.url);
const OUT = fileURLToPath(new URL('content/ladder.js', ROOT));
const imp = p => import(new URL(p, ROOT).href);
/** The hour of the no-input day's checked state (the pre-dispatch, the morning ramp and the belly are behind it). */
export const CHECK_H = 14;

// The page's day with no input at all (the system on, no card answered), headless, run to `tick` (or the day's end)
async function nothingDay(d, tick) {
  const [{V}, G, system] = await Promise.all([imp('sim/params.js'), imp('app/game.js'), imp('app/system.js')]);
  const game = G.createGame({daily: d, scenario: G.scenarioForSeed, system, commit: 'player', startPaused: true, storage: null, par: false});
  G.takeDesk(game);
  G.runTo(game, tick === undefined ? V.DAY_S * V.TICKS_PER_S + 1 : tick);
  return game;
}

/** The page's day with no input at all: its ALL-IN total, or -1 if the grid went black. */
export async function nothingTotal(d) {
  const [S, {observe}, game] = await Promise.all([imp('app/score.js'), imp('sim/step.js'), nothingDay(d)]);
  return game.state.black ? -1 : Math.round(S.allIn(observe(game.state).score, game.households).total);
}

/** The list's `check`: the no-input day of the daily `ymd` at CHECK_H, {ymd, tick, hash} (hashState, unsigned). */
export async function nothingCheck(ymd) {
  const [{V}, {hashState}, G, {dailyFor}] = await Promise.all([imp('sim/params.js'), imp('sim/step.js'), imp('app/game.js'), imp('content/dailies.js')]);
  const tick = (CHECK_H - V.DAY_START_H) * V.S_PER_H * V.TICKS_PER_S, game = await nothingDay(dailyFor(ymd, G.dailyStamp()), tick);
  return {ymd, tick, hash: hashState(game.state) >>> 0};
}

/** One date's row: [par $, par shed MWh, nothing $, lean $, competent $] (-1: black), or null when par went black. */
export async function ladderOf(ymd) {
  const [AP, S, G, {dailyFor}] = await Promise.all([imp('sim/autopilot.js'), imp('app/score.js'), imp('app/game.js'), imp('content/dailies.js')]);
  const d = dailyFor(ymd, G.dailyStamp()), scenario = G.scenarioForSeed(d.seed);
  const hh = scenario.city.suburbs.reduce((a, s) => a + s.households, 0);
  const par = AP.runPar(d.seed, scenario, {proxy: 'par'});
  if (par.black) return null;
  const total = r => (r.black ? -1 : Math.round(S.allIn(r.score, hh).total));
  return [total(par), Math.round(S.parShedMWh(par.score) * 1000) / 1000, await nothingTotal(d),
    total(AP.runPar(d.seed, scenario, {proxy: 'lean'})), total(AP.runPar(d.seed, scenario, {proxy: 'competent'}))];
}

async function main() {
  const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const {DAILIES} = await imp('content/dailies.js'), G = await imp('app/game.js');
  const ymdOf = s => +s.replace(/-/g, ''), from = ymdOf(opt('--from') || DAILIES.from), to = ymdOf(opt('--to') || DAILIES.to);
  const ranged = !!(opt('--from') || opt('--to')), dry = args.includes('--dry'), stamp = G.dailyStamp();
  const dates = [];
  for (let t = Date.UTC(Math.floor(from / 1e4), Math.floor(from / 100) % 100 - 1, from % 100); ; t += 864e5) {
    const x = new Date(t), ymd = x.getUTCFullYear() * 1e4 + (x.getUTCMonth() + 1) * 100 + x.getUTCDate();
    if (ymd > to) break;
    dates.push(ymd);
  }
  // a range is merged into the shipped list (it must be this build's: a stale list is re-made whole)
  let rows = {};
  if (ranged && !dry) {
    const {LADDER} = await imp('content/ladder.js').catch(() => ({LADDER: null}));
    if (!LADDER || LADDER.v !== stamp) throw new Error('the shipped list is not this build\'s: run the whole range (no --from/--to)');
    rows = Object.assign({}, LADDER.rows);
  }
  const workers = Math.max(1, +(opt('-j') || 1)), got = {}, t0 = Date.now();
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    let live = 0, failed = false;
    const fail = e => { if (!failed) { failed = true; reject(e); } };
    const startOne = () => {
      const w = fork(fileURLToPath(import.meta.url), ['--worker']);
      let busy = null;
      live++;
      const feed = () => { if (failed) return w.kill(); if (next < dates.length) { busy = dates[next++]; w.send(busy); } else { busy = null; w.kill(); } };
      w.on('message', m => {
        if (m.error) return fail(new Error(m.ymd + ': ' + m.error));
        got[m.ymd] = m.row;
        if (++done % 10 === 0 || done === dates.length) console.log(done + '/' + dates.length + ' dates, ' + Math.round((Date.now() - t0) / 1000) + ' s');
        feed();
      });
      w.on('error', fail);
      w.on('exit', code => {
        if (busy !== null) fail(new Error('a worker stopped (code ' + code + ') on ' + busy));
        if (--live === 0) resolve();
      });
      feed();
    };
    for (let k = 0; k < Math.min(workers, dates.length); k++) startOne();
  });
  const missing = dates.filter(d => !(d in got));
  if (missing.length) throw new Error(missing.length + ' dates without a row, the first ' + missing[0]);
  Object.assign(rows, got);
  const keys = Object.keys(rows).sort(), check = await nothingCheck(ymdOf(DAILIES.from));
  const body = keys.map(k => k + ': ' + JSON.stringify(rows[k])).join(',\n  ');
  const file = '// content/ladder.js: W6, Y-11: par and GRIDWATCH\'s own players on each daily, [par $, par shed MWh, nothing $, lean $,\n' +
    '// competent $] (ALL-IN totals; -1: that player\'s grid went black; null: par\'s did). app/game.js ladderFor grades them as the\n' +
    '// player is graded. check: the first daily\'s no-input day\'s state hash at 14:00 (tests/ladder.test.js replays it).\n' +
    '// Written by tools/ladder.mjs; do not edit. The stamp is app/game.js dailyStamp\'s.\n' +
    'export const LADDER = {v: ' + JSON.stringify(stamp) + ', check: ' + JSON.stringify(check) + ', rows: {\n  ' + body + ',\n}};\n';
  if (dry) console.log(file.slice(0, 2000));
  else { writeFileSync(OUT, file); console.log('wrote content/ladder.js: ' + keys.length + ' dates (' + dates.length + ' made) in ' + Math.round((Date.now() - t0) / 1000) + ' s'); }
}

if (process.argv.includes('--worker')) {
  process.on('message', async ymd => {
    try { process.send({ymd, row: await ladderOf(ymd)}); } catch (e) { process.send({ymd, error: String(e && e.stack || e)}); }
  });
} else if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}

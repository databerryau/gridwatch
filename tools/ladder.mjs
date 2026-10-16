// tools/ladder.mjs: writes content/ladder.js (SPEC §5 W6, Y-11): for every daily (content/dailies.js, from..to), the points of
// GRIDWATCH's own players on that day, so the verdict can show where a player sits among them ("is 975 good?"):
//   nothing     the page's day with no input at all: the system dispatches, nobody starts a unit or answers a card
//               (app/game.js headless, as the page plays it: W3 measured such a day at about 30 D)
//   lean        sim/autopilot.js's lean proxy (commits just enough; S-5's calibration: at most 40% A)
//   competent   sim/autopilot.js's competent proxy (S-5's calibration: at least 70% A)
// each graded against par (= 1000) as the end card grades the player (app/score.js grade, S-7 on a Hard day). The list
// carries the build stamp it was made under (app/game.js dailyStamp), like the dailies: tests/ladder.test.js fails when a
// sim or desk-scenario change leaves it stale, and the verdict shows no ladder then. A statistic: run it once, after
// tools/daily-gen.js, whenever the dailies are re-generated.
//
//   node tools/ladder.mjs [-j 6] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry]   (--dry: print, write nothing)
import {fork} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = new URL('..', import.meta.url);
const OUT = fileURLToPath(new URL('content/ladder.js', ROOT));
const imp = p => import(new URL(p, ROOT).href);

/** The three players' points on one date's daily: [nothing, lean, competent] (0 for a black grid; null with no par). */
export async function ladderOf(ymd) {
  const [{V}, AP, S, G, system, {dailyFor}, {observe}] = await Promise.all([imp('sim/params.js'), imp('sim/autopilot.js'), imp('app/score.js'),
    imp('app/game.js'), imp('app/system.js'), imp('content/dailies.js'), imp('sim/step.js')]);
  const d = dailyFor(ymd, G.dailyStamp()), scenario = G.scenarioForSeed(d.seed);
  const hh = scenario.city.suburbs.reduce((a, s) => a + s.households, 0);
  const par = AP.runPar(d.seed, scenario, {proxy: 'par'});
  if (par.black) return null;
  const parA = S.allIn(par.score, hh), shed = S.parShedMWh(par.score);
  const points = (score, black) => { const g = S.grade(S.allIn(score, hh), parA, black, shed); return g ? g.points : null; };
  // nothing: the page's day, headless (the system on; no input, no card answered)
  const game = G.createGame({daily: d, scenario: G.scenarioForSeed, system, commit: 'player', startPaused: true, storage: null, par: false});
  G.takeDesk(game);
  G.runTo(game, V.DAY_S * V.TICKS_PER_S + 1);
  const nothing = points(observe(game.state).score, game.state.black);
  const proxy = p => { const r = AP.runPar(d.seed, scenario, {proxy: p}); return points(r.score, r.black); };
  return [nothing, proxy('lean'), proxy('competent')];
}

async function main() {
  const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const {DAILIES} = await imp('content/dailies.js'), G = await imp('app/game.js');
  const ymdOf = s => +s.replace(/-/g, ''), from = ymdOf(opt('--from') || DAILIES.from), to = ymdOf(opt('--to') || DAILIES.to);
  const dates = [];
  for (let t = Date.UTC(Math.floor(from / 1e4), Math.floor(from / 100) % 100 - 1, from % 100); ; t += 864e5) {
    const x = new Date(t), ymd = x.getUTCFullYear() * 1e4 + (x.getUTCMonth() + 1) * 100 + x.getUTCDate();
    if (ymd > to) break;
    dates.push(ymd);
  }
  const workers = Math.max(1, +(opt('-j') || 1)), points = {}, t0 = Date.now();
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    let live = 0;
    const startOne = () => {
      const w = fork(fileURLToPath(import.meta.url), ['--worker']);
      live++;
      const feed = () => { if (next < dates.length) w.send(dates[next++]); else w.kill(); };
      w.on('message', m => {
        points[m.ymd] = m.row;
        if (++done % 10 === 0 || done === dates.length) console.log(done + '/' + dates.length + ' dates, ' + Math.round((Date.now() - t0) / 1000) + ' s');
        feed();
      });
      w.on('error', reject);
      w.on('exit', () => { if (--live === 0) resolve(); });
      feed();
    };
    for (let k = 0; k < Math.min(workers, dates.length); k++) startOne();
  });
  const keys = Object.keys(points).sort();
  const body = keys.map(k => k + ': [' + points[k].join(', ') + ']').join(',\n  ');
  const file = '// content/ladder.js: W6, Y-11: GRIDWATCH\'s own players\' points on each daily, [nothing, lean, competent] against par = 1000\n' +
    '// (null: par went black; 0: the player did). Written by tools/ladder.mjs; do not edit. The stamp is app/game.js dailyStamp\'s.\n' +
    'export const LADDER = {v: ' + JSON.stringify(G.dailyStamp()) + ', points: {\n  ' + body + ',\n}};\n';
  if (args.includes('--dry')) console.log(file.slice(0, 2000));
  else { writeFileSync(OUT, file); console.log('wrote content/ladder.js: ' + keys.length + ' dates in ' + Math.round((Date.now() - t0) / 1000) + ' s'); }
}

if (process.argv.includes('--worker')) {
  process.on('message', async ymd => { process.send({ymd, row: await ladderOf(ymd)}); });
} else if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e); process.exit(1); });
}

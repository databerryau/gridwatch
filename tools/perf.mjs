// tools/perf.mjs: the F-11 numbers that can be measured headless (SPEC F-11; desk/README.md §12).
//
//   node tools/perf.mjs [--seed N] [--rates 120,2100] [--json]
//
// 1. First visit: every file next.html loads (its stylesheet, its module script and everything
//    that imports), raw and gzip-compressed, against the 400 KB budget.
// 2. Sim cost per frame: a game day through app/game.js as the page plays it (app/boot.js: the
//    seed's scenario, the player's commitment, the system operator, alarms, recorder, history,
//    and a player following the objective line), stepped in 60-fps frames at 120x (CRUISE) and at
//    2,100x, against 1 ms and 3 ms (p95). The view model (observe + alarms + tray + the objective
//    line and its day-ahead look on their 30-grid-s cadence) is timed separately: it is built
//    once per frame whatever the rate, so from 1,800x the objective runs on every frame.
// Draw cost needs a browser: open next.html?perf (the overlay marks each line OK / OVER).
// Timings vary by machine; the sizes do not.

import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUDGET = Object.freeze({firstVisitGzipBytes: 400 * 1024, simMsAt150: 1, simMsAt2100: 3, frameMs: 8});

// A static import or re-export at the start of a line, its specifier list on one line or on
// several (`import {\n  a,\n  b,\n} from './x.js'`), or a bare `import './x.js'`. A dynamic
// import('./x.js') is not one: what it names loads on demand (Q-44), outside the first visit.
const STATIC_IMPORT = /(?:^|\n)[ \t]*(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?['"](\.[^'"]+)['"]/g;

/** The relative specifiers a module imports statically (STATIC_IMPORT). */
export function staticImports(src) {
  return [...src.matchAll(STATIC_IMPORT)].map(m => m[1]);
}

// Adds the files `queue` names and everything they import statically to `seen` (repo paths).
function walk(seen, queue, root) {
  const add = rel => {
    const key = rel.split('\\').join('/');
    if (seen.has(key)) return null;
    const buf = readFileSync(join(root, key));
    seen.set(key, {path: key, bytes: buf.length, gzip: gzipSync(buf, {level: 9}).length});
    return buf.toString('utf8');
  };
  while (queue.length) {
    const rel = queue.pop();
    const src = add(rel);
    if (src === null || !/\.m?js$/.test(rel)) continue;
    for (const spec of staticImports(src)) queue.push(join(dirname(rel), spec));
  }
  return add;
}

/**
 * Every file a page loads on a first visit: the page, its stylesheets, its module scripts and
 * their static imports (relative .js only, C-1).
 * @returns {Array<{path:string, bytes:number, gzip:number}>} repo-relative, sorted by size
 */
export function firstVisit(page = 'next.html', root = ROOT) {
  const seen = new Map();
  const add = walk(seen, [], root);
  const html = add(page);
  const pageDir = dirname(page);
  const queue = [];
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)) add(join(pageDir, m[1]));
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) queue.push(join(pageDir, m[1]));
  walk(seen, queue, root);
  return [...seen.values()].sort((a, b) => b.gzip - a.gzip);
}

/**
 * A module and everything it imports statically (Q-44: what an on-demand module brings with it).
 * @returns {Array<{path:string, bytes:number, gzip:number}>} repo-relative, sorted by size
 */
export function moduleClosure(module, root = ROOT) {
  const seen = new Map();
  walk(seen, [module], root);
  return [...seen.values()].sort((a, b) => b.gzip - a.gzip);
}

const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : 0; };

/**
 * Sim and view-model ms per 60-fps frame at `rate` (grid seconds per real second) over a day
 * played as the page plays it (app/boot.js): the seed's own scenario (scenarioForSeed: a weekend
 * date plays desk-weekend), the commitment the player's (so the objective line and its day-ahead
 * look run on their cadence), and a player who does what the line says, at most once a grid
 * minute (the hint-following player's pace; its inputs land between frames, outside the timings).
 * @returns {{rate:number, frames:number, ticksPerFrame:number, scenario:string, commit:string, actions:number,
 *   simP50:number, simP95:number, vmP50:number, vmP95:number}}
 */
export async function simCost(seed, rate, frames) {
  const G = await import('../app/game.js');
  const system = await import('../app/system.js');
  const planview = await import('../app/planview.js');
  const {V} = await import('../sim/params.js');
  const game = G.createGame({seed, system, planview, storage: null, scenario: G.scenarioForSeed, commit: 'player'});
  G.takeDesk(game, {agc: true});
  const perFrame = Math.max(1, Math.round(rate * V.TICKS_PER_S / 60));
  const sim = [], vm = [];
  let nowMs = 0, actedS = -Infinity, actions = 0;
  for (let i = 0; i < frames && !game.state.over; i++) {
    const t0 = performance.now();
    for (let k = 0; k < perFrame && !game.state.over; k++) G.tickOnce(game);
    const t1 = performance.now();
    nowMs += 1000 / 60;
    const v = G.buildVm(game, {nowMs, dtS: 1 / 60});
    const t2 = performance.now();
    sim.push(t1 - t0); vm.push(t2 - t1);
    const s = Math.floor(game.state.tick / V.TICKS_PER_S), a = v.objective && v.objective.action;
    if (a && !v.mode.locked && s - actedS >= V.S_PER_MIN) {
      actedS = s;
      const why = a.redispatch ? G.redispatch(game) : G.sendInput(game, a);
      if (!why) actions++;
    }
  }
  return {rate, frames: sim.length, ticksPerFrame: perFrame, scenario: game.state.scenarioId, commit: game.commit, actions,
    simP50: quantile(sim, 0.5), simP95: quantile(sim, 0.95), vmP50: quantile(vm, 0.5), vmP95: quantile(vm, 0.95)};
}

/** The sim's p95 budget at a rate (F-11): 1 ms up to 150x, 3 ms above (app/perf.js simBudgetMs). */
const simBudget = rate => (rate <= 150 ? BUDGET.simMsAt150 : BUDGET.simMsAt2100);

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
  const seed = Number(opt('--seed', 7));
  // CRUISE is 120x; 2,100x stands in for the fastest the director runs (D-2's night roll)
  const rates = opt('--rates', '120,2100').split(',').map(Number);
  const files = firstVisit();
  const bytes = files.reduce((a, f) => a + f.bytes, 0), gz = files.reduce((a, f) => a + f.gzip, 0);
  // Warm the JIT on a short run, then measure.
  await simCost(seed, rates[0], 600);
  const runs = [];
  for (const r of rates) runs.push(await simCost(seed, r, r <= 150 ? 6000 : 2400));
  if (args.includes('--json')) { console.log(JSON.stringify({files, bytes, gzip: gz, runs, budget: BUDGET}, null, 1)); return; }
  const kb = n => (n / 1024).toFixed(1) + ' KB', ms = x => x.toFixed(3) + ' ms', mark = ok => (ok ? 'OK' : 'OVER');
  console.log('# F-11, headless (seed ' + seed + ', ' + runs[0].scenario + ', commitment: ' + runs[0].commit + ')\n');
  console.log('First visit (next.html): ' + files.length + ' files, ' + kb(bytes) + ' raw, ' + kb(gz) + ' gzip. Budget ' +
    kb(BUDGET.firstVisitGzipBytes) + ': ' + mark(gz <= BUDGET.firstVisitGzipBytes) + '\n');
  console.log('| File | Raw | Gzip |\n|---|---|---|');
  for (const f of files.slice(0, 12)) console.log('| ' + f.path + ' | ' + kb(f.bytes) + ' | ' + kb(f.gzip) + ' |');
  console.log('\nThe day as the page plays it: the seed\'s scenario, the player\'s commitment, the objective line followed at most once a grid minute.');
  console.log('The view model (observe, alarms, tray, the objective on its cadence) is built once per frame; with the draws it shares the ' + BUDGET.frameMs + '-ms frame.\n');
  console.log('| Rate | Ticks per frame | Sim p50 | Sim p95 | Budget (p95) | | View model p50 | p95 | Inputs followed |\n|---|---|---|---|---|---|---|---|---|');
  for (const r of runs) {
    const b = simBudget(r.rate);
    console.log('| ' + r.rate + '× | ' + r.ticksPerFrame + ' | ' + ms(r.simP50) + ' | ' + ms(r.simP95) + ' | ' + b + ' ms | ' + mark(r.simP95 <= b) +
      ' | ' + ms(r.vmP50) + ' | ' + ms(r.vmP95) + ' | ' + r.actions + ' |');
  }
  console.log('\nDraw cost needs a browser: next.html?perf.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

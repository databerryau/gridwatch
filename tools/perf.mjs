// tools/perf.mjs: the F-11 numbers that can be measured headless (SPEC F-11; desk/README.md §12).
//
//   node tools/perf.mjs [--seed N] [--rates 120,2100] [--json]
//   node tools/perf.mjs --sizes [--json]    the first visit alone, each file in bytes; no frame run
//   node tools/perf.mjs --sizes --base the-day [--head 2c-a2-base-sim]
//                                           the same against a git ref, per file and in total,
//                                           read with `git show` (no checkout); head: the working tree.
//                                           At a ref from before Q-126 the game's page is next.html (gamePage)
//
// 1. First visit: every file index.html loads (its stylesheet, its module script and everything
//    that imports), raw and gzip-compressed, against the 400 KB budget.
// 2. Sim cost per frame: a game day through app/game.js as the page plays it (app/boot.js: the
//    seed's scenario, the player's commitment, the system operator, alarms, recorder, history,
//    and a player following the objective line), stepped in 60-fps frames at 120x (CRUISE) and at
//    2,100x, against 1 ms and 3 ms (p95). The view model (observe + alarms + tray + the objective
//    line and its day-ahead look on their 30-grid-s cadence) is timed separately: it is built
//    once per frame whatever the rate, so from 1,800x the objective runs on every frame.
// Draw cost needs a browser: open index.html?perf (the overlay marks each line OK / OVER).
// Timings vary by machine; the sizes do not.

import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
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
// `root` is a directory, or a function from a repo path to the file's bytes (gitRead).
function walk(seen, queue, root) {
  const read = typeof root === 'function' ? root : key => readFileSync(join(root, key));
  const add = rel => {
    const key = rel.split('\\').join('/');
    if (seen.has(key)) return null;
    const buf = read(key);
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

/** W6 (risk 5): the pages index.html's entry shows in the game's place on a query (?selftest), not on a first visit. */
export const ROUTED = Object.freeze(['app/selftest.js']);

/**
 * Every file a page loads on a first visit: the page, its stylesheets, its module scripts and
 * their static imports (relative .js only, C-1).
 * @returns {Array<{path:string, bytes:number, gzip:number}>} repo-relative, sorted by size
 */
export function firstVisit(page = 'index.html', root = ROOT) {
  const seen = new Map();
  const add = walk(seen, [], root);
  const html = add(page);
  const pageDir = dirname(page);
  const queue = [];
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)) add(join(pageDir, m[1]));
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const entry = join(pageDir, m[1]);
    queue.push(entry);
    // W6 (Y-8): the page's entry (app/start.js) imports the game at once on a desktop: it is part of the first visit
    // (not a page the entry shows in the game's place on a query, ROUTED: those load on demand)
    const src = String(typeof root === 'function' ? root(entry.split('\\').join('/')) : readFileSync(join(root, entry)));
    for (const d of src.matchAll(/\bimport\(\s*'(\.{1,2}\/[^']+)'\s*\)/g)) {
      const p = join(dirname(entry), d[1]);
      if (!ROUTED.includes(p.split('\\').join('/'))) queue.push(p);
    }
  }
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
  G.takeDesk(game);
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
      const why = a.redispatch ? G.redispatch(game) : a.type === 'soakCity' ? G.soakCity(game, a.atS) : G.sendInput(game, a);
      if (!why) actions++;
    }
  }
  return {rate, frames: sim.length, ticksPerFrame: perFrame, scenario: game.state.scenarioId, commit: game.commit, actions,
    simP50: quantile(sim, 0.5), simP95: quantile(sim, 0.95), vmP50: quantile(vm, 0.5), vmP95: quantile(vm, 0.95)};
}

/** The sim's p95 budget at a rate (F-11): 1 ms up to 150x, 3 ms above (app/perf.js simBudgetMs). */
const simBudget = rate => (rate <= 150 ? BUDGET.simMsAt150 : BUDGET.simMsAt2100);

/** A `root` for firstVisit that reads each file at a git ref (`git show ref:path`), for --base and --head. */
export const gitRead = ref => key => execFileSync('git', ['show', ref + ':' + key], {cwd: ROOT, maxBuffer: 1 << 26});

/**
 * The game's page at a root (a directory or gitRead): index.html since the switch-over (Q-126). Before it,
 * index.html only sent the player on, with no module script, and the game was next.html; so --base and
 * --head measure the game at any ref.
 */
export function gamePage(root = ROOT) {
  const html = String(typeof root === 'function' ? root('index.html') : readFileSync(join(root, 'index.html')));
  return /<script[^>]+type="module"/.test(html) ? 'index.html' : 'next.html';
}

/**
 * --sizes (Q-61, desk/README.md §32.3): the file count, each file's raw and gzip bytes, the totals;
 * with `base` (another first visit, --base) also its gzip bytes and the delta, per file and in total.
 */
function sizes(files, json, base, pages) {
  const sum = (fs, k) => fs.reduce((a, f) => a + f[k], 0), bytes = sum(files, 'bytes'), gz = sum(files, 'gzip');
  const was = base ? {count: base.length, bytes: sum(base, 'bytes'), gzip: sum(base, 'gzip'), files: base} : null;
  if (json) return console.log(JSON.stringify({count: files.length, bytes, gzip: gz, files, ...(was ? {base: was, deltaGzip: gz - was.gzip} : {})}, null, 1));
  const signed = n => (n > 0 ? '+' : '') + n;
  console.log('First visit (' + pages.head + '): ' + files.length + ' files, ' + bytes + ' B raw, ' + gz + ' B gzip (' + (gz / 1024).toFixed(2) + ' KB)' +
    (was ? '\nBase (' + pages.base + '): ' + was.count + ' files, ' + was.bytes + ' B raw, ' + was.gzip + ' B gzip; delta ' + signed(gz - was.gzip) + ' B gzip (' +
      signed(Number(((gz - was.gzip) / 1024).toFixed(2))) + ' KB)' : '') + '\n');
  if (!was) {
    console.log('| File | Raw B | Gzip B |\n|---|---|---|');
    for (const f of files) console.log('| ' + f.path + ' | ' + f.bytes + ' | ' + f.gzip + ' |');
    return console.log('| total (' + files.length + ' files) | ' + bytes + ' | ' + gz + ' |');
  }
  const now = new Map(files.map(f => [f.path, f])), then = new Map(base.map(f => [f.path, f])), cell = (f, k) => (f ? f[k] : '-');
  console.log('| File | Raw B | Gzip B | Base gzip B | Delta gzip B |\n|---|---|---|---|---|');
  for (const p of new Set([...now.keys(), ...then.keys()])) {
    const a = now.get(p), b = then.get(p);
    console.log('| ' + p + ' | ' + cell(a, 'bytes') + ' | ' + cell(a, 'gzip') + ' | ' + cell(b, 'gzip') + ' | ' + signed((a ? a.gzip : 0) - (b ? b.gzip : 0)) + ' |');
  }
  console.log('| total (' + files.length + ' files; base ' + was.count + ') | ' + bytes + ' | ' + gz + ' | ' + was.gzip + ' | ' + signed(gz - was.gzip) + ' |');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
  const seed = Number(opt('--seed', 7));
  // CRUISE is 120x; 2,100x stands in for the fastest the director runs (D-2's night roll)
  const rates = opt('--rates', '120,2100').split(',').map(Number);
  if (args.includes('--sizes')) {
    const head = opt('--head') ? gitRead(opt('--head')) : ROOT, base = opt('--base') ? gitRead(opt('--base')) : null;
    const pages = {head: gamePage(head), base: base && gamePage(base)};
    return sizes(firstVisit(pages.head, head), args.includes('--json'), base ? firstVisit(pages.base, base) : null, pages);
  }
  const files = firstVisit();
  const bytes = files.reduce((a, f) => a + f.bytes, 0), gz = files.reduce((a, f) => a + f.gzip, 0);
  // Warm the JIT on a short run, then measure.
  await simCost(seed, rates[0], 600);
  const runs = [];
  for (const r of rates) runs.push(await simCost(seed, r, r <= 150 ? 6000 : 2400));
  if (args.includes('--json')) { console.log(JSON.stringify({files, bytes, gzip: gz, runs, budget: BUDGET}, null, 1)); return; }
  const kb = n => (n / 1024).toFixed(1) + ' KB', ms = x => x.toFixed(3) + ' ms', mark = ok => (ok ? 'OK' : 'OVER');
  console.log('# F-11, headless (seed ' + seed + ', ' + runs[0].scenario + ', commitment: ' + runs[0].commit + ')\n');
  console.log('First visit (index.html): ' + files.length + ' files, ' + kb(bytes) + ' raw, ' + kb(gz) + ' gzip. Budget ' +
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
  console.log('\nDraw cost needs a browser: index.html?perf.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

// tools/perf.mjs: the F-11 numbers that can be measured headless (SPEC F-11; desk/README.md §12).
//
//   node tools/perf.mjs [--seed N] [--json]
//
// 1. First visit: every file next.html loads (its stylesheet, its module script and everything
//    that imports), raw and gzip-compressed, against the 400 KB budget.
// 2. Sim cost per frame: a game day through app/game.js (the real session: the system operator,
//    alarms, recorder, history), stepped in 60-fps frames at 150x and at 2,100x, against 1 ms
//    and 3 ms (p95). The view model (observe + alarms + tray) is timed separately: it is built
//    once per frame whatever the rate.
// Draw cost needs a browser: open next.html?perf (the overlay marks each line OK / OVER).
// Timings vary by machine; the sizes do not.

import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUDGET = Object.freeze({firstVisitGzipBytes: 400 * 1024, simMsAt150: 1, simMsAt2100: 3, frameMs: 8});

/**
 * Every file a page loads on a first visit: the page, its stylesheets, its module scripts and
 * their static imports (relative .js only, C-1).
 * @returns {Array<{path:string, bytes:number, gzip:number}>} repo-relative, sorted by size
 */
export function firstVisit(page = 'next.html', root = ROOT) {
  const seen = new Map();
  const add = rel => {
    const key = rel.split('\\').join('/');
    if (seen.has(key)) return null;
    const buf = readFileSync(join(root, key));
    seen.set(key, {path: key, bytes: buf.length, gzip: gzipSync(buf, {level: 9}).length});
    return buf.toString('utf8');
  };
  const html = add(page);
  const pageDir = dirname(page);
  const queue = [];
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)) add(join(pageDir, m[1]));
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) queue.push(join(pageDir, m[1]));
  while (queue.length) {
    const rel = queue.pop();
    const src = add(rel);
    if (src === null) continue;
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n;]*?from\s*['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g)) {
      queue.push(join(dirname(rel), m[1] || m[2]));
    }
  }
  return [...seen.values()].sort((a, b) => b.gzip - a.gzip);
}

const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : 0; };

/** Sim ms per 60-fps frame at `rate` (grid seconds per real second) over a played day. */
export async function simCost(seed, rate, frames) {
  const G = await import('../app/game.js');
  const system = await import('../app/system.js');
  const planview = await import('../app/planview.js');
  const {V} = await import('../sim/params.js');
  const game = G.createGame({seed, system, planview, storage: null});
  G.takeDesk(game, {agc: true});
  const perFrame = Math.max(1, Math.round(rate * V.TICKS_PER_S / 60));
  const sim = [], vm = [];
  let nowMs = 0;
  for (let i = 0; i < frames && !game.state.over; i++) {
    const t0 = performance.now();
    for (let k = 0; k < perFrame && !game.state.over; k++) G.tickOnce(game);
    const t1 = performance.now();
    nowMs += 1000 / 60;
    G.buildVm(game, {nowMs, dtS: 1 / 60});
    const t2 = performance.now();
    sim.push(t1 - t0); vm.push(t2 - t1);
  }
  return {rate, frames: sim.length, ticksPerFrame: perFrame, simP50: quantile(sim, 0.5), simP95: quantile(sim, 0.95),
    vmP50: quantile(vm, 0.5), vmP95: quantile(vm, 0.95)};
}

async function main() {
  const args = process.argv.slice(2);
  const seed = args.includes('--seed') ? Number(args[args.indexOf('--seed') + 1]) : 7;
  const files = firstVisit();
  const bytes = files.reduce((a, f) => a + f.bytes, 0), gz = files.reduce((a, f) => a + f.gzip, 0);
  // Warm the JIT on a short run, then measure.
  await simCost(seed, 150, 600);
  const at150 = await simCost(seed, 150, 6000), at2100 = await simCost(seed, 2100, 2400);
  if (args.includes('--json')) { console.log(JSON.stringify({files, bytes, gzip: gz, at150, at2100, budget: BUDGET}, null, 1)); return; }
  const kb = n => (n / 1024).toFixed(1) + ' KB', ms = x => x.toFixed(3) + ' ms', mark = ok => (ok ? 'OK' : 'OVER');
  console.log('# F-11, headless (seed ' + seed + ')\n');
  console.log('First visit (next.html): ' + files.length + ' files, ' + kb(bytes) + ' raw, ' + kb(gz) + ' gzip. Budget ' +
    kb(BUDGET.firstVisitGzipBytes) + ': ' + mark(gz <= BUDGET.firstVisitGzipBytes) + '\n');
  console.log('| File | Raw | Gzip |\n|---|---|---|');
  for (const f of files.slice(0, 12)) console.log('| ' + f.path + ' | ' + kb(f.bytes) + ' | ' + kb(f.gzip) + ' |');
  console.log('\n| Rate | Ticks per frame | Sim p50 | Sim p95 | Budget (p95) | | View model p50 | p95 |\n|---|---|---|---|---|---|---|---|');
  for (const [r, b] of [[at150, BUDGET.simMsAt150], [at2100, BUDGET.simMsAt2100]]) {
    console.log('| ' + r.rate + '× | ' + r.ticksPerFrame + ' | ' + ms(r.simP50) + ' | ' + ms(r.simP95) + ' | ' + b + ' ms | ' + mark(r.simP95 <= b) +
      ' | ' + ms(r.vmP50) + ' | ' + ms(r.vmP95) + ' |');
  }
  console.log('\nDraw cost needs a browser: next.html?perf.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
